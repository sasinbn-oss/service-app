// ทดสอบ: ใบ PM เข้าทำทั้งร้าน ไม่ระบุเครื่อง ไม่ต้องมีรูปก่อนทำ (เจ้าของงานขอ ต.ค. 69)
//        · ฟอร์มเปิดใบงาน: CM ยังล็อกเรื่องรูป · เลือก PM แล้วไม่ถามเครื่อง/รุ่น/ป้ายรุ่น รูปไม่บังคับ
//          เปิดได้โดยไม่มีรูป ไม่ผูกเครื่อง (ฐานข้อมูล)
//        · ฟอร์มปิดงานใบ PM: ไม่มีขั้นรูปก่อนซ่อมกับป้ายรุ่น เตือนแค่หลังซ่อม · แนบหลังซ่อมแล้วปิดได้ (ฐานข้อมูล)
const { chromium } = require("playwright");
const { confirmDuplicate } = require("./dup");
const { execSync } = require("child_process");
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
  const startId = Number(sql(`select coalesce(max(id),0) from "WorkOrder"`));
  let id = null;

  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 1400 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const seen = (t, exact = false) => vis(t, exact).count();
    const label = (l) => page.getByLabel(l, { exact: true }).locator("visible=true").last();
    const tap = async (t, exact = true) => {
      const el = vis(t, exact).last();
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.click().catch(async () => el.evaluate((n) => (n.closest("[tabindex]") || n).click()));
    };
    const missing = async () => {
      const box = page.getByText(/^ยังขาด:/).locator("visible=true");
      return (await box.count()) ? await box.last().innerText() : "";
    };

    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await tap("เข้าสู่ระบบ");
    await page.waitForTimeout(3500);

    // ════ เปิดใบงาน PM ไม่มีรูป ════
    await tap("ใบงาน");
    await page.waitForTimeout(2500);
    await tap("เพิ่มใบงาน", false);
    await page.waitForTimeout(2500);
    const search = page.getByPlaceholder("ค้นรหัสหรือชื่อสาขา").locator("visible=true").first();
    await search.click();
    await search.type("C0006", { delay: 70 });
    await page.waitForTimeout(2400);
    await tap("ถนนอุตรกิจ", false);
    await page.waitForTimeout(1800);
    // แอดมินไม่บังคับรูปหน้างานตั้งแต่ ต.ค. 69 — ใบ CM ของตำแหน่งอื่นยังล็อก (ดู admin-photo-web-test)
    (await seen("แอดมินไม่บังคับ")) > 0
      ? pass("ใบ CM (ค่าเริ่มต้น) ของแอดมิน: ป้ายบอกว่าแอดมินไม่บังคับรูป")
      : fail("ใบ CM ของแอดมินไม่มีป้ายแอดมินไม่บังคับ");
    await tap("งาน PM");
    await page.waitForTimeout(800);
    (await page.getByLabel("หมายเลขเครื่องที่ 1").locator("visible=true").count()) === 0 &&
    (await seen("เพิ่มเครื่องในสาขาเดียวกัน")) === 0 && (await seen("ป้ายรุ่น")) === 0
      ? pass("เลือก PM แล้วไม่ถามเครื่อง รุ่น ป้ายรุ่น (เข้าทำทั้งร้าน)")
      : fail("เลือก PM แล้วยังถามเครื่อง");
    await page.getByLabel("อาการที่พบของเครื่องที่ 1").locator("visible=true").first().fill("PM ตามรอบ ทั้งร้าน");
    await page.waitForTimeout(500);
    (await seen("ยังบันทึกไม่ได้")) === 0 && (await seen("รูป / วิดีโอหน้างาน (ไม่บังคับ)")) > 0
      ? pass("เลือก PM แล้วรูปหน้างานขึ้นว่าไม่บังคับ ปุ่มไม่ล็อก")
      : fail("เลือก PM แล้วยังบังคับรูป");
    await page.screenshot({ path: path.join(DIR, "pm-photo-1-open.png") });
    const submit = vis("เปิดใบงาน").last();
    await submit.scrollIntoViewIfNeeded().catch(() => {});
    await submit.click().catch(async () => submit.evaluate((n) => (n.closest("[tabindex]") || n).click()));
    // สาขามีใบค้างอยู่ — ป๊อปอัพยืนยันเปิดซ้ำ (ต.ค. 69)
    await confirmDuplicate(page);
    await page.waitForTimeout(5000);
    const made = sql(`select id||'|'||"jobType"||'|'||coalesce("machineId"::text,'ทั้งร้าน')||'|'||(select count(*) from "WorkOrderAttachment" a where a."workOrderId"=w.id) from "WorkOrder" w where id>${startId} and "createdById"=(select id from "User" where "employeeCode"='A001') order by id desc limit 1`);
    const [newId, jt, machine, files] = made.split("|");
    if (newId) id = Number(newId);
    jt === "PM" && machine === "ทั้งร้าน" && files === "0"
      ? pass("เปิดใบ PM ได้โดยไม่มีรูป ไม่ผูกเครื่อง (ฐานข้อมูล: PM · ไม่มีเครื่อง · ไฟล์ 0)")
      : fail(`เปิดใบ PM ไม่ได้: ${made || "ไม่มีใบใหม่"}`);

    // ════ ปิดงานใบ PM ════
    if (!id) throw new Error("ไม่มีใบ PM ให้ทดสอบปิดงาน");
    sql(`update "User" set region=(select region from "Branch" where code='C0006') where "employeeCode"='S001'`);
    const S = await login("S001");
    const team = sql(`select zone from "Branch" where code='C0006'`);
    await call(S, "POST", `/work-orders/${id}/parts`, { needsParts: false });
    await call(S, "POST", `/work-orders/${id}/assign`, { team, scheduledAt: "2026-11-10" });
    await call(A, "POST", `/work-orders/${id}/confirm-appointment`, {});
    await call(S, "POST", `/work-orders/${id}/dispatch`, {});
    if (sql(`select status from "WorkOrder" where id=${id}`) !== "IN_PROGRESS") throw new Error("เตรียมใบงานไม่ถึงขั้นเข้างาน");
    const code = sql(`select code from "WorkOrder" where id=${id}`);

    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.waitForTimeout(2500);
    await tap("ใบงาน");
    await page.waitForTimeout(2500);
    await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
    await page.waitForTimeout(2500);
    await vis(code).first().click();
    await page.waitForTimeout(3000);
    await vis("ปิดงาน").first().click();
    await page.waitForTimeout(1500);
    (await seen("วิดีโอก่อนซ่อม")) === 0 && (await seen("วิดีโอหลังซ่อม")) > 0
      ? pass("ฟอร์มปิดงานใบ PM: ไม่มีขั้นรูปก่อนซ่อม มีแค่หลังซ่อม")
      : fail("ฟอร์มปิดงานใบ PM ยังมีขั้นรูปก่อนซ่อม");
    (await seen("ป้ายรุ่นของเครื่อง", true)) === 0 ? pass("ฟอร์มปิดงานใบ PM: ไม่มีขั้นป้ายรุ่น") : fail("ฟอร์มปิดงานใบ PM ยังถามป้ายรุ่น");
    const m = await missing();
    m.includes("รูปหลังซ่อม") && !m.includes("รูปก่อนซ่อม")
      ? pass("กล่องยังขาดเตือนแค่รูปหลังซ่อม")
      : fail(`กล่องยังขาด: ${m}`);
    await page.getByPlaceholder("เช่น เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ").locator("visible=true").last().fill("ล้างกรอง ตรวจสายพาน ทดสอบแล้วปกติ");
    await label("ผู้เข้าปฏิบัติงานคนที่ 1").click();
    await page.waitForTimeout(500);
    await vis("ช่างสมชาย", false).last().click();
    await page.waitForTimeout(500);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), label("เลือกรูปหลังซ่อม").click()]);
    await chooser.setFiles(PHOTO);
    await page.waitForTimeout(2500);
    (await missing()) === "" ? pass("แนบรูปหลังซ่อมแล้วไม่ขาดอะไร") : fail(`ยังขาด: ${await missing()}`);
    await page.screenshot({ path: path.join(DIR, "pm-photo-2-close.png") });
    await vis("ยืนยันปิดงาน").last().click();
    await page.waitForTimeout(6000);
    sql(`select w.status||'|'||coalesce((select string_agg(role,',' order by role) from "WorkOrderAttachment" a where a."workOrderId"=w.id and role in ('BEFORE','AFTER')),'') from "WorkOrder" w where w.id=${id}`) === "DONE|AFTER"
      ? pass("ปิดใบ PM แล้ว มีแค่รูปหลังซ่อม ไม่มีรูปก่อน ไม่มีป้ายรุ่น (ฐานข้อมูล)")
      : fail(`หลังปิด: ${sql(`select status from "WorkOrder" where id=${id}`)}`);
  } catch (e) {
    fail(String(e));
  } finally {
    if (id) await call(A, "DELETE", `/work-orders/${id}`);
    sql(`update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
