// ทดสอบ: ใบงานที่ Super Admin เปิด ต้องไม่ทำให้รายการใบงาน/กล่องงานพัง (หน้าขาว — เจอบน production ต.ค. 69)
//   เดิมคอลัมน์ "เปิดโดย" เอาบทบาทไปเปิดตารางสีตรง ๆ บทบาท SUPER_ADMIN ไม่มีในตาราง → undefined.bg → ทั้งหน้าพัง
//   สร้างผู้ใช้ Super Admin ชั่วคราว ย้ายคนเปิดของใบหนึ่งไปเป็นคนนั้น แล้วเปิดกล่องงานหัวหน้าภาค · คืนค่าเดิมเสมอ
// ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const cols = sql(`select string_agg(quote_ident(column_name), ',') from information_schema.columns where table_name='User' and column_name not in ('id','employeeCode','role')`);
  const oldRegion = sql(`select coalesce(region,'') from "User" where "employeeCode"='S001'`);
  let wo = null, oldCreator = null;
  try {
    sql(`update "User" set region=(select region from "Branch" where code='C0006') where "employeeCode"='S001'`);
    const sa = sql(`insert into "User" ("employeeCode", role, ${cols}) select 'ZZSA1', 'SUPER_ADMIN', ${cols} from "User" where "employeeCode"='A001' returning id`).split("\n")[0];
    wo = sql(`select w.id from "WorkOrder" w join "Branch" b on b.id=w."branchId" where b.region=(select region from "Branch" where code='C0006') and w.status='NEW' order by w.id limit 1`);
    if (!wo) throw new Error("ไม่มีใบ NEW ในภาคของ C0006 ให้ทดสอบ");
    oldCreator = sql(`select coalesce("createdById"::text,'null') from "WorkOrder" where id=${wo}`);
    sql(`update "WorkOrder" set "createdById"=${sa} where id=${wo}`);
    const code = sql(`select code from "WorkOrder" where id=${wo}`);

    const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("S001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await page.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").click();
    await page.waitForTimeout(4000);
    await page.getByText("กล่องงานของฉัน", { exact: true }).locator("visible=true").first().click();
    await page.waitForTimeout(4000);
    (await page.getByText(code, { exact: true }).locator("visible=true").count())
      ? pass(`กล่องงานแสดงได้ รวมใบ ${code} ที่ Super Admin เปิด`) : fail("ไม่เห็นใบ (หน้าพัง?)");
    (await page.getByText("แอดมิน", { exact: true }).locator("visible=true").count())
      ? pass("คอลัมน์เปิดโดยขึ้นป้าย แอดมิน ให้ Super Admin") : fail("ไม่มีป้ายบทบาท");
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    if (wo && oldCreator) sql(`update "WorkOrder" set "createdById"=${oldCreator === "null" ? "null" : oldCreator} where id=${wo}`);
    sql(`delete from "User" where "employeeCode"='ZZSA1'`);
    sql(`update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
    await browser.close();
  }
})();
