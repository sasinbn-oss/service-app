// ทดสอบหน้าจอ: ปุ่มลบใบงานของแอดมิน · คำเตือนบอกว่าจะเสียอะไร · ช่างไม่เห็นปุ่ม
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const API = "http://127.0.0.1:4000/api";
const call = async (p, token, method = "GET", body) => {
  const r = await fetch(API + p, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!r.ok) throw new Error(`${p} ${r.status} ${await r.text()}`); return r.json();
};
const login = async (c) => (await call("/auth/login", null, "POST", { employeeCode: c, password: "test1234" })).token;

(async () => {
  // ใช้ chromium ที่ติดตั้งไว้แล้วถ้ามี ไม่งั้นให้ playwright หาเอง
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
      : {}),
    args: ["--no-sandbox"],
  });
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);

  const signIn = async (p, code) => {
    await p.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await p.getByPlaceholder("รหัสพนักงาน").fill(code);
    await p.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await p.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").first().click();
    await p.waitForTimeout(4000);
  };
  const openWO = async (p, code) => {
    // แท็บล่าง "ใบงาน" — แอดมินเปิดมาเจอบอร์ดแผนงาน ไม่ใช่หน้าหลักที่มีการ์ดใบงานซ่อม
    await p.getByText("ใบงาน", { exact: true }).locator("visible=true").last().click();
    await p.waitForTimeout(2500);
    const s = p.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first();
    await s.click(); await s.type(code, { delay: 60 }); await p.waitForTimeout(2500);
    await p.getByText(code, { exact: false }).locator("visible=true").first().click();
    await p.waitForTimeout(3000);
  };

  try {
    const admin = await login("A001");
    const sup = await login("S001");
    const branch = (await call("/branches?search=C0001", admin))[0];
    const users = await call("/auth/users", admin);
    await call(`/auth/users/${users.find(u=>u.employeeCode==="S001").id}`, admin, "PATCH", { region: branch.region });
    await call(`/auth/users/${users.find(u=>u.employeeCode==="T001").id}`, admin, "PATCH", { team: branch.zone });
    const parts = await call("/spare-parts?search=SP-BOARD", admin);
    const pid = (Array.isArray(parts)?parts:parts.rows)[0].id;

    const wo = await call("/work-orders", admin, "POST", { branchCode: "C0001", jobType: "CM", priority: "NORMAL",
      machines: [{ code: "W97", model: "Oasis", symptom: "ทดสอบปุ่มลบ" }] });
    const o = wo.orders ? wo.orders[0] : wo;
    await call(`/work-orders/${o.id}/parts`, sup, "POST", { needsParts: true, parts: [{ sparePartId: pid, quantity: 2 }] });
    console.log("เตรียมใบงาน", o.code);

    // ── ช่างต้องไม่เห็นปุ่มลบ ──
    const t = await browser.newPage({ viewport: { width: 420, height: 1400 } });
    await signIn(t, "T001"); await openWO(t, o.code);
    (await t.getByText("ลบใบงานนี้ถาวร").locator("visible=true").count()) === 0
      ? pass("ช่างไม่เห็นปุ่มลบ") : fail("ช่างเห็นปุ่มลบ");
    await t.close();

    // ── หัวหน้าภาคต้องไม่เห็น ──
    const s2 = await browser.newPage({ viewport: { width: 420, height: 1400 } });
    await signIn(s2, "S001"); await openWO(s2, o.code);
    (await s2.getByText("ลบใบงานนี้ถาวร").locator("visible=true").count()) === 0
      ? pass("หัวหน้าภาคไม่เห็นปุ่มลบ") : fail("หัวหน้าภาคเห็นปุ่มลบ");
    await s2.close();

    // ── แอดมินเห็นและลบได้ ──
    const a = await browser.newPage({ viewport: { width: 420, height: 1400 } });
    const seen = (x, e=false) => a.getByText(x, { exact: e }).locator("visible=true").count();
    await signIn(a, "A001"); await openWO(a, o.code);
    (await seen("ลบใบงานนี้ถาวร")) > 0 ? pass("แอดมินเห็นปุ่มลบ") : fail("แอดมินไม่เห็นปุ่มลบ");
    await a.screenshot({ path: path.join(DIR, "del-1-button.png"), fullPage: true });

    // บนเว็บ showAlert เปิดกล่องยืนยันที่วาดในแอป (components/Feedback) ไม่ใช่
    // window.confirm แล้ว — อ่านข้อความจาก DOM และกดปุ่ม "ลบถาวร" ในกล่อง
    await a.getByText("ลบใบงานนี้ถาวร").locator("visible=true").first().click();
    await a.waitForTimeout(800);
    const box = a.getByText("กู้คืนไม่ได้", { exact: false }).locator("visible=true").last();
    const msg = (await box.count()) ? await box.textContent() : "";
    await a.getByText("ลบถาวร", { exact: true }).locator("visible=true").last().click();
    await a.waitForTimeout(6000);
    console.log("  ข้อความยืนยัน:", JSON.stringify(msg));
    msg.includes("กู้คืนไม่ได้") ? pass("คำเตือนบอกว่ากู้คืนไม่ได้") : fail("ไม่เตือนเรื่องกู้คืน");
    msg.includes("อะไหล่ 1 รายการ") ? pass("คำเตือนบอกว่าจะเสียอะไหล่ด้วย") : fail("ไม่บอกว่าจะเสียอะไร");
    msg.includes("ใช้ยกเลิกแทน") ? pass("แนะนำให้ใช้ยกเลิกถ้าใบเปิดถูก") : fail("ไม่แนะนำทางเลือก");
    const gone = await call(`/work-orders?status=ALL`, admin);
    gone.rows.find(r => r.code === o.code) ? fail("ใบงานยังอยู่") : pass("ลบแล้วหายจากรายการ");
    await a.screenshot({ path: path.join(DIR, "del-3-after.png"), fullPage: true });
    await a.close();
  } catch (e) { fail(e.message); } finally { await browser.close(); }
})();
