// ทดสอบ: กรอบไฟล์ตรวจหน้างาน (รูปหน้างาน · รูปอะไหล่ที่เสีย · วิดีโอการทำงาน)
//        · การ์ดไฟล์แนบขึ้นสามกรอบ เลือกหลายรูปพร้อมกันได้ มีช่อง "เพิ่มรูป" ต่อท้าย
//        · ฟอร์มผลตรวจเห็นไฟล์ที่แนบจากการ์ด ปุ่มยืนยันกดไม่ได้จนครบ แนบที่เหลือในฟอร์มได้
//        · ตรวจเสร็จแล้วกรอบเหลือไว้ให้ดู — เช็คฐานข้อมูลทุกขั้น
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const PHOTO = path.join(DIR, "..", "site-photo.png");
const CLIP = path.join(DIR, "..", "site-clip.mp4");
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
  const n = (role) => sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id} and role='${role}'`);

  try {
    // ── ใบงานตรวจสอบหน้างาน ส่งทีมไปตรวจแล้ว ──
    sql(`update "User" set region='ใต้' where "employeeCode"='S001'`);
    const S = await login("S001");
    const wo = await call(A, "POST", "/work-orders", {
      branchCode: "C0006", jobType: "INSPECT", priority: "NORMAL",
      machines: [{ code: "W9", model: "Haier", symptom: "ทดสอบกรอบไฟล์ตรวจหน้างาน" }],
    });
    id = wo.orders ? wo.orders[0].id : wo.id;
    // ส่งตรวจ → แอดมินนัดร้าน → หัวหน้าภาคส่งช่าง — ไม่ใช่เรื่องที่ทดสอบในชุดนี้ (ดู inspect-confirm-web-test.js)
    await call(S, "POST", `/work-orders/${id}/inspect-request`, { team: "กระบี่", scheduledAt: "2026-11-10" });
    await call(A, "POST", `/work-orders/${id}/confirm-appointment`, {});
    await call(S, "POST", `/work-orders/${id}/dispatch`, {});
    const code = sql(`select code from "WorkOrder" where id=${id}`);
    if (sql(`select status from "WorkOrder" where id=${id}`) !== "INSPECTING") throw new Error("เตรียมใบงานไม่ถึงขั้นตรวจหน้างาน");

    const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.getByLabel(l, { exact: true }).locator("visible=true").last();
    async function choose(l, files) {
      const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), label(l).click()]);
      await chooser.setFiles(files);
      await page.waitForTimeout(3500);
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

    // ── การ์ดไฟล์แนบ: สามกรอบ + บอกว่าครบกี่อย่าง ──
    (await vis("ไฟล์ตรวจหน้างาน ครบ 0 / 3 — ยังขาด: รูปหน้างาน · รูปอะไหล่ที่เสีย · วิดีโอการทำงาน").count()) > 0 &&
      (await label("กรอบรูปหน้างาน").count()) > 0 && (await label("กรอบวิดีโอการทำงาน").count()) > 0
      ? pass("การ์ดไฟล์แนบขึ้นสามกรอบ และบอกว่ายังขาดอะไร")
      : fail("การ์ดไม่มีกรอบไฟล์ตรวจ");

    // เลือกสองรูปพร้อมกันจากกรอบรูปหน้างาน
    await choose("เลือกรูปหน้างาน", [PHOTO, PHOTO]);
    n("INSPECT_SITE") === "2" ? pass("เลือกสองรูปพร้อมกัน บันทึกเป็นรูปหน้างาน (ตรวจ) 2 รูป (ฐานข้อมูล)") : fail(`รูปหน้างาน = ${n("INSPECT_SITE")}`);
    (await label("เพิ่มรูปหน้างาน").count()) > 0 && (await vis("✓ 2 รูป").count()) > 0
      ? pass("มีรูปแล้วขึ้นช่อง \"เพิ่มรูป\" ต่อท้าย")
      : fail("ไม่มีช่องเพิ่มรูป");
    await choose("เพิ่มรูปหน้างาน", [PHOTO]);
    n("INSPECT_SITE") === "3" ? pass("กดเพิ่มรูปได้อีก (3 รูป)") : fail(`เพิ่มรูปแล้ว = ${n("INSPECT_SITE")}`);

    // ── ฟอร์มบันทึกผลตรวจ ──
    await vis("บันทึกผลตรวจหน้างาน").first().click();
    await page.waitForTimeout(1500);
    (await vis("✓ 3 รูป").count()) > 0 && (await vis("ยังขาด: รูปอะไหล่ที่เสีย · วิดีโอการทำงาน — ใส่ให้ครบ 3 อย่างก่อนส่งผลตรวจ").count()) > 0
      ? pass("ฟอร์มรู้ว่ารูปหน้างานแนบไว้แล้วจากการ์ด เหลือเตือนสองอย่าง")
      : fail("ฟอร์มไม่เห็นไฟล์ที่แนบจากการ์ด");
    await label("ผลตรวจหน้างาน").fill("บอร์ดควบคุมไหม้ ต้องเปลี่ยนบอร์ด");
    const save = vis("ยืนยัน").last();
    const op = () => save.evaluate((el) => getComputedStyle(el.closest("[tabindex]") || el.parentElement).opacity);
    (await op()) !== "1" ? pass("ไฟล์ยังไม่ครบ ปุ่มยืนยันกดไม่ได้") : fail("กดยืนยันได้ทั้งที่ไฟล์ไม่ครบ");
    await choose("เลือกรูปอะไหล่ที่เสีย", [PHOTO]);
    await choose("เลือกวิดีโอการทำงาน", [CLIP]);
    n("INSPECT_PART") === "1" && n("INSPECT_VIDEO") === "1"
      ? pass("แนบรูปอะไหล่กับวิดีโอจากในฟอร์ม (ฐานข้อมูล)")
      : fail(`ในฟอร์ม: อะไหล่ ${n("INSPECT_PART")} วิดีโอ ${n("INSPECT_VIDEO")}`);
    (await vis("ยังขาด:", false).count()) === 0 && (await op()) === "1"
      ? pass("ครบสามอย่างแล้ว ข้อความเตือนหาย ปุ่มกดได้")
      : fail("ครบแล้วยังกดไม่ได้");
    await save.click();
    await page.waitForTimeout(5000);
    sql(`select status||'|'||("inspectedAt" is not null)||'|'||"inspectionNote" from "WorkOrder" where id=${id}`) === "NEW|true|บอร์ดควบคุมไหม้ ต้องเปลี่ยนบอร์ด"
      ? pass("ส่งผลตรวจแล้ว ใบงานกลับไปให้หัวหน้าภาคระบุอะไหล่ (ฐานข้อมูล)")
      : fail(`หลังส่ง: ${sql(`select status from "WorkOrder" where id=${id}`)}`);

    // ── ตรวจแล้ว: กรอบยังอยู่ให้หัวหน้าภาคดู แต่ไม่มีปุ่มแนบ ──
    (await vis("ไฟล์ตรวจหน้างาน").count()) > 0 && (await vis("✓ 1 คลิป").count()) > 0 && (await label("เพิ่มรูปหน้างาน").count()) === 0
      ? pass("ตรวจเสร็จแล้ว การ์ดยังแยกกลุ่มไฟล์ตรวจให้ดู แต่แนบเพิ่มในกรอบไม่ได้")
      : fail("หลังตรวจ การ์ดไม่แสดงกลุ่มไฟล์ตรวจ");
    await vis("ไฟล์ตรวจหน้างาน").first().scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(DIR, "inspect-files-done.png") });
  } catch (e) {
    fail(String(e));
  } finally {
    if (id) await call(A, "DELETE", `/work-orders/${id}`);
    sql(`update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
