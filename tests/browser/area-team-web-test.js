// ทดสอบ: ตำแหน่ง Area Team ผ่านเบราว์เซอร์ — เมนู 6 อย่าง · ฟอร์มเปิดใบงานล็อกจนกรอกครบ (รวมรูป)
// · เปิดได้จริง (เช็คฐานข้อมูล) · หน้าใบงานไม่มีปุ่มทำขั้นตอน · ไม่มีคำขอที่โดนปฏิเสธ (403) ระหว่างใช้งานปกติ
// สร้างบัญชี Supervisor (COCO) ชั่วคราวผูกกับสาขา C0006 แล้วลบทิ้งตอนจบ
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync } = require("child_process");
const DIR = __dirname;
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const LOGIN = "zz.web.sup";

function cleanup() {
  sql(`delete from "WorkOrder" where "createdById" in (select id from "User" where "employeeCode"='${LOGIN}');
       update "Branch" set "cocoSupervisorId"=null where "cocoSupervisorId" in (select id from "User" where "employeeCode"='${LOGIN}');
       delete from "User" where "employeeCode"='${LOGIN}';`);
}

(async () => {
  cleanup();
  sql(`insert into "User"("employeeCode",name,role,"passwordHash")
       select '${LOGIN}','นางทดสอบ เว็บ (นุ่น)','COCO_SUPERVISOR',"passwordHash" from "User" where "employeeCode"='A001';
       update "Branch" set "cocoSupervisorId"=(select id from "User" where "employeeCode"='${LOGIN}') where code='C0006';`);
  const photo = path.join(os.tmpdir(), "area-team-photo.png");
  // PNG 1×1 จริง — ตัวย่อรูปในฟอร์มต้องเปิดได้
  fs.writeFileSync(photo, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));

  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const denied = [];
  page.on("response", (r) => { if (r.url().includes("/api/") && r.status() === 403) denied.push(`${r.request().method()} ${r.url().replace(/^.*\/api/, "")}`); });
  const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
  const seen = (t, exact = false) => vis(t, exact).count();
  const tap = async (t, exact = true) => {
    const el = vis(t, exact).last();
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.click().catch(async () => el.evaluate((n) => (n.closest("[tabindex]") || n).click()));
  };

  try {
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill(LOGIN);
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await tap("เข้าสู่ระบบ");
    await page.waitForTimeout(6000);

    // ════ เมนู ════
    const menu = ["แผนงาน", "กล่องงานของฉัน", "ใบงานซ่อม", "ติดตามเครื่องเสีย", "ผังผู้รับผิดชอบ", "รายงาน"];
    const missingMenu = [];
    for (const m of menu) if ((await page.locator(`[aria-label="${m}"]`).locator("visible=true").count()) === 0) missingMenu.push(m);
    missingMenu.length ? fail(`เมนูหาย: ${missingMenu}`) : pass("เห็นครบ 6 เมนู");
    const hidden = ["งานของฉันวันนี้", "หน้าหลัก", "ลงทะเบียนใช้รถ", "รายการอะไหล่", "ระบบหลังบ้าน", "เบิกของใช้สิ้นเปลือง"];
    const leaked = [];
    for (const m of hidden) if ((await page.locator(`[aria-label="${m}"]`).locator("visible=true").count()) > 0) leaked.push(m);
    leaked.length ? fail(`เห็นเมนูที่ต้องซ่อน: ${leaked}`) : pass("เมนูอื่นซ่อนหมด");
    (await seen("Supervisor (COCO)", true)) > 0 ? pass("หัวจอบอกตำแหน่ง Supervisor (COCO)") : fail("ไม่บอกตำแหน่ง");
    (await seen("จัดแผน", true)) === 0 ? pass("แผนงาน: ไม่มีปุ่มจัดแผน") : fail("แผนงานยังมีปุ่มจัดแผน");

    // ════ ฟอร์มเปิดใบงาน ════
    await page.locator('[aria-label="ใบงานซ่อม"]').locator("visible=true").last().click();
    await page.waitForTimeout(2500);
    await tap("เพิ่มใบงาน", false);
    await page.waitForTimeout(2500);
    (await seen("ยังบันทึกไม่ได้ — ขาด", false)) > 0 ? pass("ฟอร์มเปล่าบอกว่ายังบันทึกไม่ได้") : fail("ไม่มีแถบบอกช่องที่ขาด");
    const search = page.getByPlaceholder("ค้นรหัสหรือชื่อสาขา").locator("visible=true").first();
    await search.click();
    await search.type("C0", { delay: 70 });
    await page.waitForTimeout(2400);
    (await seen("สาขาทดสอบกรุงเทพ", false)) === 0 ? pass("ค้นสาขาไม่เจอสาขาที่ไม่ได้ดูแล (C0001)") : fail("ค้นเจอสาขาคนอื่น");
    await tap("ถนนอุตรกิจ", false);
    await page.waitForTimeout(2000);
    await page.getByLabel("หมายเลขเครื่องที่ 1").locator("visible=true").first().fill("W77");
    await tap("Oasis");
    await page.getByLabel("อาการที่พบของเครื่องที่ 1").locator("visible=true").first().fill("เครื่องไม่ปั่น ทดสอบ Area Team");
    await page.getByLabel("ชื่อผู้ติดต่อที่สาขา").locator("visible=true").first().fill("คุณนุ่น");
    await page.getByLabel("เบอร์ติดต่อสาขา").locator("visible=true").first().fill("081-234-5678");
    await page.waitForTimeout(800);
    const lock = await vis("ยังบันทึกไม่ได้ — ขาด 1 ช่อง: รูปหน้างาน", false).count();
    lock > 0 ? pass("กรอกครบแต่ยังไม่มีรูป → ขาด 1 ช่อง: รูปหน้างาน") : fail("แถบช่องที่ขาดไม่ตรง");
    await page.screenshot({ path: path.join(DIR, "area-1-locked.png") });
    const before = sql(`select count(*) from "WorkOrder" where "createdById"=(select id from "User" where "employeeCode"='${LOGIN}')`);
    await vis("เปิดใบงาน").last().click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
    sql(`select count(*) from "WorkOrder" where "createdById"=(select id from "User" where "employeeCode"='${LOGIN}')`) === before
      ? pass("ปุ่มเปิดใบงานกดไม่ได้ระหว่างที่ยังขาดรูป (ฐานข้อมูลไม่มีใบใหม่)")
      : fail("เปิดใบงานได้ทั้งที่ยังไม่มีรูป");

    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), vis("เลือกรูป").last().click()]);
    await chooser.setFiles(photo);
    await page.waitForTimeout(2500);
    (await seen("ยังบันทึกไม่ได้", false)) === 0 ? pass("แนบรูปแล้วแถบช่องที่ขาดหายไป") : fail("แนบรูปแล้วยังล็อก");
    await page.screenshot({ path: path.join(DIR, "area-2-ready.png") });
    await vis("เปิดใบงาน").last().click();
    await page.waitForTimeout(7000);
    const row = sql(`select w.code||'|'||b.code||'|'||coalesce(w."contactPhone",'')||'|'||(select count(*) from "WorkOrderAttachment" a where a."workOrderId"=w.id)
                     from "WorkOrder" w join "Branch" b on b.id=w."branchId" where w."createdById"=(select id from "User" where "employeeCode"='${LOGIN}') order by w.id desc limit 1`);
    const [code, branch, phone, files] = row.split("|");
    branch === "C0006" && phone === "081-234-5678" && Number(files) >= 1
      ? pass(`เปิดใบงาน ${code} ได้ พร้อมเบอร์และรูป (ฐานข้อมูล)`)
      : fail(`ใบงานในฐานข้อมูล: ${row}`);

    // ════ หน้าใบงาน — ดูอย่างเดียว ════
    await page.screenshot({ path: path.join(DIR, "area-3-detail.png") });
    (await seen(code, false)) > 0 ? pass("บันทึกแล้วไปหน้าใบงาน") : fail("ไม่ได้ไปหน้าใบงาน");
    // หาเป็นปุ่ม (ชื่อปุ่มในแถบขั้นตอนเป็นข้อความเฉย ๆ ไม่ใช่ปุ่ม)
    const actions = ["แก้ไขอาการ/สถานะ", "บันทึกอะไหล่", "จ่ายงาน", "ปิดงาน", "ยกเลิกใบงาน", "คัดลอกเป็นใบทดสอบ", "เลือกรูป"];
    const shown = [];
    for (const a of actions) if ((await vis(a, true).count()) > 0) shown.push(a);
    shown.length ? fail(`หน้าใบงานมีปุ่มทำขั้นตอน: ${shown}`) : pass("หน้าใบงานไม่มีปุ่มทำขั้นตอน");

    // ════ หน้าอื่น ๆ ════
    await page.keyboard.press("Escape").catch(() => {});
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle" });
    await page.waitForTimeout(4000);
    for (const m of ["ติดตามเครื่องเสีย", "ผังผู้รับผิดชอบ", "รายงาน", "กล่องงานของฉัน"]) {
      await page.locator(`[aria-label="${m}"]`).locator("visible=true").last().click();
      await page.waitForTimeout(3000);
    }
    (await seen("ส่งออก Excel", true)) === 0 ? pass("ติดตามเครื่องเสีย: ไม่มีปุ่มส่งออก/แก้ไข") : fail("ยังมีปุ่มส่งออก");
    await page.locator('[aria-label="รายงาน"]').locator("visible=true").last().click();
    await page.waitForTimeout(2500);
    (await seen("ดาวน์โหลด Excel", true)) === 1 && (await seen("รายงานตามผู้เปิดใบงาน", false)) === 0
      ? pass("หน้ารายงานมีปุ่มเดียว")
      : fail("หน้ารายงานไม่ใช่ปุ่มเดียว");
    await page.screenshot({ path: path.join(DIR, "area-4-report.png") });
    denied.length ? fail(`มีคำขอโดนปฏิเสธระหว่างใช้งาน: ${[...new Set(denied)].join(", ")}`) : pass("ใช้งานทุกหน้าไม่มีคำขอโดนปฏิเสธ (403)");
  } catch (e) {
    fail("ทดสอบพัง: " + e.message);
    await page.screenshot({ path: path.join(DIR, "area-error.png") }).catch(() => {});
  } finally {
    await browser.close();
    cleanup();
    fs.rmSync(photo, { force: true });
  }
})();
