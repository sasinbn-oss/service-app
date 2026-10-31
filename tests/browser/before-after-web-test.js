// ทดสอบ: รูปก่อนซ่อม · หลังซ่อม ตอนปิดงาน
//        · แนบ "ก่อนซ่อม" ไว้ก่อนจากการ์ดไฟล์แนบ (ชิป "รูปนี้คือ") แล้วฟอร์มปิดงานขึ้นว่าแนบไว้แล้ว
//        · ยังไม่มีหลังซ่อม ปุ่มล่าง "ยังขาด 1 อย่าง — พาไป" กดแล้วเลื่อนไปขั้นรูปหลังซ่อม ไม่ส่ง · แนบหลังซ่อมในฟอร์ม → "ยืนยันปิดงาน" ปิดได้
//        · การ์ดผลการทำงานวางก่อน | หลัง คู่กัน — เช็คฐานข้อมูลทุกขั้น
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { visitDay } = require("./fixture"); // วันนัดนับจากวันนี้ — เซิร์ฟเวอร์ไม่รับวันย้อนหลัง
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const PHOTO = path.join(DIR, "..", "site-photo.png");
const API = "http://localhost:4000/api";

// ส่งคำสั่งทาง stdin ไม่ใช่ -c — รหัสผ่านที่แฮชแล้วมี $ ซึ่ง shell จะกินไปเงียบ ๆ
const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const call = async (token, method, url, body) => {
  const res = await fetch(API + url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({}));
};
const login = async (code) =>
  (await (await fetch(API + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeCode: code, password: "test1234" }),
  })).json()).token;

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const A = await login("A001");
  const oldRegion = sql(`select coalesce(region,'') from "User" where "employeeCode"='S001'`);
  let id = null;

  try {
    // ── ใบงานไม่ใช้อะไหล่ เดินถึงขั้นเข้างาน + ป้ายรุ่น (ปิดงานบังคับอยู่แล้ว ไม่ใช่เรื่องที่ทดสอบ) ──
    sql(`update "User" set region='ใต้' where "employeeCode"='S001'`);
    const S = await login("S001");
    const wo = await call(A, "POST", "/work-orders", {
      branchCode: "C0006", jobType: "CM", priority: "NORMAL",
      machines: [{ code: "W9", model: "Haier", symptom: "ทดสอบรูปก่อนหลังซ่อม" }],
    });
    id = wo.orders ? wo.orders[0].id : wo.id;
    await call(S, "POST", `/work-orders/${id}/parts`, { needsParts: false });
    await call(S, "POST", `/work-orders/${id}/assign`, { team: "กระบี่", scheduledAt: visitDay(12) });
    await call(A, "POST", `/work-orders/${id}/confirm-appointment`, {});
    await call(S, "POST", `/work-orders/${id}/dispatch`, {});
    const np = new FormData();
    np.append("file", new Blob([fs.readFileSync(PHOTO)], { type: "image/png" }), "p.png");
    np.append("role", "NAMEPLATE");
    await call(A, "POST", `/work-orders/${id}/attachments`, np);
    const code = sql(`select code from "WorkOrder" where id=${id}`);
    if (sql(`select status from "WorkOrder" where id=${id}`) !== "IN_PROGRESS") throw new Error("เตรียมใบงานไม่ถึงขั้นเข้างาน");

    const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.getByLabel(l, { exact: true }).locator("visible=true").last();
    // กล่อง "ยังขาด: …" ท้ายฟอร์มปิดงาน — ไม่มีกล่อง = ไม่ขาดอะไร
    const missing = async () => {
      const box = page.getByText(/^ยังขาด:/).locator("visible=true");
      return (await box.count()) ? await box.last().innerText() : "";
    };
    async function choose(l, files = PHOTO) {
      const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), label(l).click()]);
      await chooser.setFiles(files);
      await page.waitForTimeout(2500);
    }
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await vis("ใบงาน").last().click();
    await page.waitForTimeout(2500);
    await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
    await page.waitForTimeout(2500);
    await vis(code).first().click();
    await page.waitForTimeout(3000);

    // ── แนบรูปก่อนซ่อมไว้ก่อน จากการ์ดไฟล์แนบ ──
    await label("แนบเป็นก่อนซ่อม").click();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), vis("เลือกรูป").last().click()]);
    await chooser.setFiles(PHOTO);
    await page.waitForTimeout(4000);
    sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id} and role='BEFORE'`) === "1"
      ? pass("แนบจากการ์ดไฟล์แนบโดยเลือก \"ก่อนซ่อม\" — บันทึกเป็นรูปก่อนซ่อม (ฐานข้อมูล)")
      : fail("การ์ดไฟล์แนบไม่ได้บันทึกเป็นก่อนซ่อม");

    // ── ฟอร์มปิดงาน ──
    await vis("ปิดงาน").first().click();
    await page.waitForTimeout(1500);
    (await vis("แนบไว้แล้ว 1 ไฟล์ — เพิ่มได้อีก").count()) > 0 && (await missing()).includes("รูปหลังซ่อม") &&
      !(await missing()).includes("รูปก่อนซ่อม")
      ? pass("ฟอร์มปิดงาน: ก่อนซ่อมขึ้นว่าแนบไว้แล้ว เหลือเตือนแค่หลังซ่อม")
      : fail("ฟอร์มไม่รู้ว่าแนบรูปก่อนซ่อมไว้แล้ว");
    await page.getByPlaceholder("เช่น เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ").locator("visible=true").last().fill("เปลี่ยนปั๊มน้ำทิ้ง ทดสอบแล้วปกติ");
    await label("ผู้เข้าปฏิบัติงานคนที่ 1").click();
    await page.waitForTimeout(500);
    await vis("ช่างสมชาย", false).last().click();
    await page.waitForTimeout(500);
    const save = vis("ยืนยันปิดงาน").last();
    /**
     * ปุ่มล่างไม่จางแล้ว (เคลมก้อน 1 · ใช้กับทุกการปิดงาน) — ยังขาดบอกจำนวน กดแล้วพาไปช่องแรกที่ขาด ไม่ส่ง
     * เลื่อนฟอร์มลงล่างสุดก่อนกด เพื่อให้รู้ว่าปุ่มพาขึ้นไปหาขั้นรูปหลังซ่อมจริง ไม่ใช่บังเอิญอยู่ในจอ
     */
    const go = vis("ยังขาด 1 อย่าง — พาไป").last();
    const closePosts = [];
    page.on("request", (r) => { if (r.method() === "POST" && /\/close$/.test(r.url())) closePosts.push(r.url()); });
    (await go.count()) > 0 && (await save.count()) === 0
      ? pass("ยังไม่มีรูปหลังซ่อม ปุ่มล่างขึ้น \"ยังขาด 1 อย่าง — พาไป\" (ไม่ใช่ปุ่มจาง)")
      : fail("ปุ่มล่างไม่บอกว่ายังขาด 1 อย่าง");
    await label("อะไหล่ไม่ครบ เปิดใบงานรออะไหล่ต่อ").scrollIntoViewIfNeeded();
    const afterStep = vis("รูป / วิดีโอหลังซ่อม", false).first();
    const inView = (b) => !!b && b.y >= 0 && b.y + b.height <= 860;
    const awayBefore = !inView(await afterStep.boundingBox());
    await go.click();
    let arrived = false;
    for (let i = 0; i < 30 && !(arrived = inView(await afterStep.boundingBox())); i++) await page.waitForTimeout(100);
    await page.waitForTimeout(800);
    awayBefore && arrived && closePosts.length === 0 && sql(`select status from "WorkOrder" where id=${id}`) === "IN_PROGRESS"
      ? pass("กด \"พาไป\": ฟอร์มเลื่อนไปขั้นรูปหลังซ่อม ไม่ส่งคำขอปิดงาน (ฐานข้อมูลยังเข้างาน)")
      : fail(`กดพาไป: ห่างก่อนกด=${awayBefore} · ถึงขั้นหลังซ่อม=${arrived} · คำขอปิด=${closePosts.length}`);
    // เลือกสองรูปพร้อมกันจากอัลบั้ม (เจ้าของงานขอ ต.ค. 69 — เดิมทีละรูป)
    await choose("เลือกรูปหลังซ่อม", [PHOTO, PHOTO]);
    !(await missing()).includes("รูปหลังซ่อม") && (await save.count()) > 0 && (await vis("ยังขาด 1 อย่าง — พาไป").count()) === 0
      ? pass("แนบรูปหลังซ่อมในฟอร์มแล้ว ข้อความเตือนหาย ปุ่มล่างเป็น \"ยืนยันปิดงาน\"")
      : fail("แนบหลังซ่อมแล้วปุ่มล่างยังไม่เป็นยืนยันปิดงาน");
    await save.click();
    await page.waitForTimeout(6000);
    sql(`select w.status||'|'||(select string_agg(role,',' order by role) from "WorkOrderAttachment" a where a."workOrderId"=w.id and role in ('BEFORE','AFTER')) from "WorkOrder" w where w.id=${id}`) === "DONE|AFTER,AFTER,BEFORE"
      ? pass("ปิดงานแล้ว มีรูปก่อนซ่อม 1 หลังซ่อม 2 (เลือกพร้อมกัน) ในฐานข้อมูล")
      : fail(`หลังปิด: ${sql(`select status from "WorkOrder" where id=${id}`)}`);

    // ── การ์ดผลการทำงาน ──
    await page.waitForTimeout(1500);
    (await vis("ก่อนซ่อม · 1").count()) > 0 && (await vis("หลังซ่อม · 2").count()) > 0
      ? pass("การ์ดผลการทำงานวางก่อนซ่อม | หลังซ่อม คู่กัน")
      : fail("การ์ดผลการทำงานไม่แยกก่อน/หลัง");
    await vis("ก่อนซ่อม · 1").first().scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(DIR, "before-after-done.png") });
  } catch (e) {
    fail(String(e));
  } finally {
    if (id) await call(A, "DELETE", `/work-orders/${id}`);
    sql(`update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
