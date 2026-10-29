// ทดสอบ: รูปหน้างานตอนเปิดใบงาน — แอดมินไม่บังคับ ตำแหน่งอื่นยังบังคับ (เจ้าของงานขอ ต.ค. 69)
//   · แอดมิน: ไม่มีแถบล็อก · ป้าย "แอดมินไม่บังคับ" · ข้อความชวนแนบ · เปิดใบได้จริงโดยไม่มีไฟล์แนบ (ฐานข้อมูล)
//   · Super Admin (ในแอปเป็น ADMIN): ไม่ล็อกเหมือนกัน
//   · หัวหน้าภาค: ยังล็อก "ขาด 1 ช่อง: รูปหน้างาน" ไม่มีป้ายแอดมิน · กดเปิดแล้วไม่มีใบใหม่ (ฐานข้อมูล) · เลือก PM แล้วปลดล็อก
// ต้องมี DATABASE_URL · สร้าง Super Admin ชั่วคราวแล้วลบทิ้ง · คืนภาคของ S001
const { chromium } = require("playwright");
const { confirmDuplicate } = require("./dup");
const { execSync } = require("child_process");
const path = require("path");
const DIR = __dirname;
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const SYMPTOM = "ทดสอบรูปหน้างานแอดมิน (เทสต์)";
const SUPER = "zz.photo.super";

function cleanup() {
  sql(`delete from "WorkOrder" where symptom like 'ทดสอบรูปหน้างานแอดมิน%';
       delete from "User" where "employeeCode"='${SUPER}';`);
}

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  cleanup();
  const oldRegion = sql(`select coalesce(region,'') from "User" where "employeeCode"='S001'`);
  sql(`update "User" set region=(select region from "Branch" where code='C0006') where "employeeCode"='S001';
       insert into "User"("employeeCode",name,role,"passwordHash")
       select '${SUPER}','ซุปเปอร์ทดสอบรูป','SUPER_ADMIN',"passwordHash" from "User" where "employeeCode"='A001';`);
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });

  /** เข้าระบบ → ใบงานซ่อม → เพิ่มใบงาน → สาขา C0006 → กรอกเครื่อง/อาการ (ไม่แนบรูป) */
  async function openForm(code) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
    await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill(code);
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").last().click();
    await page.waitForTimeout(3500);
    await page.locator('[aria-label="ใบงานซ่อม"]').locator("visible=true").last().click();
    await page.waitForTimeout(2500);
    await vis("เพิ่มใบงาน", false).last().click();
    await page.waitForTimeout(2500);
    const search = page.getByPlaceholder("ค้นรหัสหรือชื่อสาขา").locator("visible=true").first();
    await search.click();
    await search.type("C0006", { delay: 60 });
    await page.waitForTimeout(2400);
    await vis("ถนนอุตรกิจ", false).last().click();
    await page.waitForTimeout(2000);
    await page.getByLabel("หมายเลขเครื่องที่ 1").locator("visible=true").first().fill("W81");
    await vis("Oasis").last().click();
    await page.getByLabel("อาการที่พบของเครื่องที่ 1").locator("visible=true").first().fill(SYMPTOM);
    await page.waitForTimeout(800);
    return { page, vis, seen: (t, exact = false) => vis(t, exact).count() };
  }
  const made = (code) =>
    Number(sql(`select count(*) from "WorkOrder" where symptom='${SYMPTOM}' and "createdById"=(select id from "User" where "employeeCode"='${code}')`));

  try {
    // ════ แอดมิน ════
    {
      const { page, vis, seen } = await openForm("A001");
      (await seen("ยังบันทึกไม่ได้")) === 0 ? pass("แอดมิน: ไม่แนบรูปก็ไม่มีแถบล็อก") : fail("แอดมินยังถูกล็อกเรื่องรูป");
      (await seen("แอดมินไม่บังคับ", true)) > 0 && (await seen("ไม่มีรูปก็เปิดใบงานได้")) > 0
        ? pass("แอดมิน: ป้าย \"แอดมินไม่บังคับ\" + ข้อความชวนแนบถ้ามีรูป") : fail("แอดมิน: ไม่มีป้าย/ข้อความ");
      (await seen("(อย่างน้อย 1 รูป)")) === 0 ? pass("แอดมิน: ไม่ขึ้นว่าต้องอย่างน้อย 1 รูป") : fail("แอดมินยังขึ้น (อย่างน้อย 1 รูป)");
      await page.screenshot({ path: path.join(DIR, "admin-photo-1-admin.png") });
      const submit = vis("เปิดใบงาน").last();
      await submit.scrollIntoViewIfNeeded().catch(() => {});
      await submit.click();
      await confirmDuplicate(page);
      await page.waitForTimeout(7000);
      const row = sql(`select w.status||'|'||(select count(*) from "WorkOrderAttachment" a where a."workOrderId"=w.id)
                       from "WorkOrder" w where symptom='${SYMPTOM}' and "createdById"=(select id from "User" where "employeeCode"='A001') order by id desc limit 1`);
      row === "NEW|0" ? pass("แอดมินเปิดใบได้จริงโดยไม่มีไฟล์แนบ (ฐานข้อมูล: NEW · 0 ไฟล์)") : fail(`ใบที่แอดมินเปิด: "${row}"`);
      await page.close();
    }

    // ════ Super Admin (ในแอปเป็น ADMIN) ════
    {
      const { page, seen } = await openForm(SUPER);
      (await seen("ยังบันทึกไม่ได้")) === 0 && (await seen("แอดมินไม่บังคับ", true)) > 0
        ? pass("Super Admin: ไม่แนบรูปก็ไม่ล็อก มีป้ายแอดมินไม่บังคับ") : fail("Super Admin ถูกล็อกเรื่องรูป");
      await page.close();
    }

    // ════ หัวหน้าภาค — ยังบังคับ ════
    {
      const { page, vis, seen } = await openForm("S001");
      (await seen("ยังบันทึกไม่ได้ — ขาด 1 ช่อง: รูปหน้างาน")) > 0 && (await seen("(อย่างน้อย 1 รูป)")) > 0
        ? pass("หัวหน้าภาค: ไม่แนบรูป = ล็อก \"ขาด 1 ช่อง: รูปหน้างาน\" (อย่างน้อย 1 รูป)") : fail("หัวหน้าภาคไม่ถูกล็อกเรื่องรูป");
      (await seen("แอดมินไม่บังคับ", true)) === 0 && (await seen("ไม่มีรูปก็เปิดใบงานได้")) === 0
        ? pass("หัวหน้าภาค: ไม่เห็นป้าย/ข้อความของแอดมิน") : fail("หัวหน้าภาคเห็นป้ายแอดมิน");
      await page.screenshot({ path: path.join(DIR, "admin-photo-2-supervisor.png") });
      await vis("เปิดใบงาน").last().click({ force: true }).catch(() => {});
      await page.waitForTimeout(2000);
      made("S001") === 0 ? pass("หัวหน้าภาค: กดเปิดแล้วไม่มีใบใหม่ (ฐานข้อมูล)") : fail("หัวหน้าภาคเปิดใบได้ทั้งที่ไม่มีรูป");
      await vis("งาน PM").last().click();
      await page.waitForTimeout(800);
      (await seen("ยังบันทึกไม่ได้")) === 0 && (await seen("รูป / วิดีโอหน้างาน (ไม่บังคับ)")) > 0
        ? pass("หัวหน้าภาค: เลือก PM แล้วรูปไม่บังคับ (เหมือนเดิม)") : fail("หัวหน้าภาค: PM ยังบังคับรูป");
      await page.close();
    }
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    cleanup();
    sql(`update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
