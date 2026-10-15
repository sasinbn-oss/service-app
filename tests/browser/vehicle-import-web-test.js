// ทดสอบ: นำเข้ารถจาก Excel ในหน้า "ทะเบียน & ซ่อมบำรุง" (แอดมิน · จอคอม)
//        เลือกไฟล์ fleet-fixture.xlsx (ข้อมูลสมมุติ) → ตัวอย่างบอกเพิ่ม/แก้/ข้าม → ยืนยัน → รถอยู่ในฐานข้อมูลและในรายการ
//        ลบรถทดสอบทิ้งตอนจบ (ต้องมี DATABASE_URL)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const path = require("path");
const DIR = __dirname;
const FILE = path.join(DIR, "..", "fleet-fixture.xlsx");
const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const cleanup = () => sql(`delete from "Vehicle" where replace(replace("plateNumber",' ',''),'-','') like '9ทส100%'`);

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  try {
    cleanup();
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true").last();
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await label("ทะเบียน & ซ่อมบำรุง").click();
    await page.waitForTimeout(3000);

    await label("นำเข้ารถจาก Excel").click();
    await page.waitForTimeout(1000);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), label("เลือกไฟล์รถ").click()]);
    await chooser.setFiles(FILE);
    await page.waitForTimeout(3000);
    (await vis("เพิ่มใหม่ 3 · แก้ข้อมูล 0 · ไม่เปลี่ยน 0 · ข้าม 2").count()) > 0
      ? pass("ตัวอย่าง: เพิ่มใหม่ 3 · ข้าม 2 (รถไม่มีผู้รับผิดชอบ · รถส่วนตัว)")
      : fail("ตัวอย่างไม่ตรง");
    sql(`select count(*) from "Vehicle" where "plateNumber" like '9ทส%'`) === "0"
      ? pass("ดูตัวอย่างแล้วยังไม่มีอะไรถูกบันทึก (ฐานข้อมูล)")
      : fail("ตัวอย่างบันทึกลงฐานข้อมูลไปแล้ว");
    (await vis("9ทส 1005 — รถส่วนตัวหัวหน้าภาค — ไม่ใช่รถให้เบิกใช้").count()) > 0
      ? pass("บอกเหตุผลของรถที่ข้าม")
      : fail("ไม่บอกเหตุผลที่ข้าม");
    await page.screenshot({ path: path.join(DIR, "vehicle-import-preview.png") });

    await label("ยืนยันนำเข้ารถ").click();
    await page.waitForTimeout(4000);
    sql(`select string_agg("plateNumber"||':'||type, ',' order by "plateNumber") from "Vehicle" where "plateNumber" like '9ทส%'`) ===
    "9ทส 1001:รถบริษัท,9ทส 1002:รถบริษัท,9ทส 1003:รถเช่า (ORIX)"
      ? pass("ยืนยันแล้วรถ 3 คันอยู่ในฐานข้อมูล พร้อมประเภท")
      : fail(`ฐานข้อมูล: ${sql(`select string_agg("plateNumber", ',') from "Vehicle" where "plateNumber" like '9ทส%'`)}`);
    (await vis("9ทส 1001", false).count()) > 0 ? pass("รายการรถโหลดใหม่ เห็นคันที่นำเข้า") : fail("รายการไม่แสดงคันที่นำเข้า");
    (await vis("Fleet Card 0004 0000 0000 1111 · วงเงิน 7,000 บาท · Easy Pass 3700004444").count()) > 0
      ? pass("แอดมินเห็น Fleet Card เต็มเลข + วงเงิน + Easy Pass ในรายการรถ")
      : fail("รายการรถไม่แสดง Fleet Card");
    await vis("9ทส 1001", false).first().scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(DIR, "vehicle-import-list.png") });
  } catch (e) {
    fail(String(e).slice(0, 300));
  } finally {
    cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
