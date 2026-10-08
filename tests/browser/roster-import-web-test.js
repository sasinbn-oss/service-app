// ทดสอบ: นำเข้ารายชื่อจากไฟล์ผ่านหน้าสิทธิ์ผู้ใช้ — ตัวอย่างก่อนบันทึก · แก้คู่ทีมเอง · ยืนยันผลที่ฐานข้อมูล
// ใช้ tests/roster-fixture.ods (ชื่อสมมุติ รหัส 99xxxx) ต้องมี DATABASE_URL — ลบบัญชีทดสอบทิ้งตอนจบ
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const path = require("path");
const DIR = __dirname;
const FIXTURE = path.join(DIR, "..", "roster-fixture.ods");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -Atc ${JSON.stringify(q)}`).toString().trim();

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  sql(`delete from "User" where "employeeCode" like '99____'`);
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  // แท็บอื่นค้างอยู่ข้างหลัง และหน้าต่างลอยซ้อนหน้า — เลือกตัวที่อยู่บนสุดจริง
  const topmost = async (loc) => {
    const n = await loc.count();
    for (let i = n - 1; i >= 0; i--) {
      const hit = await loc.nth(i).evaluate((node) => {
        const r = node.getBoundingClientRect();
        const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return !!at && (node.contains(at) || at.contains(node));
      }).catch(() => false);
      if (hit) return loc.nth(i);
    }
    return loc.last();
  };
  const tap = async (t) => {
    const el = await topmost(page.getByText(t, { exact: true }).locator("visible=true"));
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.click();
  };
  try {
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await tap("เข้าสู่ระบบ");
    await page.waitForTimeout(3500);
    await tap("สิทธิ์ผู้ใช้");
    await page.waitForTimeout(2500);
    await tap("นำเข้ารายชื่อจากไฟล์");
    await page.waitForTimeout(500);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), tap("เลือกไฟล์")]);
    await chooser.setFiles(FIXTURE);
    await page.waitForTimeout(2500);
    (await page.getByText("ยืนยัน · สร้าง 8 · อัปเดต 0").count()) ? pass("ตัวอย่าง: สร้างใหม่ 8 คน") : fail("ตัวอย่างไม่ขึ้น/จำนวนผิด");
    (await page.getByText("ยังไม่มีทีม 3 พื้นที่", { exact: false }).count()) ? pass("บอกพื้นที่ที่ยังจับคู่ไม่ได้ (3)") : fail("ไม่บอกพื้นที่ที่ไม่มีคู่");
    // จับคู่ "OPL โรงซัก" กับทีมกรุงเทพเอง
    await (await topmost(page.getByLabel("ทีมของ OPL โรงซัก"))).click();
    await page.waitForTimeout(300);
    await tap("กรุงเทพ");
    await page.waitForTimeout(300);
    (await page.getByText("ยังไม่มีทีม 2 พื้นที่", { exact: false }).count()) ? pass("เลือกทีมเองแล้วจำนวนที่เหลือลดลง") : fail("เลือกทีมไม่ติด");
    (await page.getByText("ช่างสี่ ทดสอบ (ดี)").count()) && (await page.getByText("ทีม กรุงเทพ").count())
      ? pass("รายชื่อแสดงทีมตามคู่ที่เลือก") : fail("รายชื่อไม่อัปเดตทีม");
    await page.screenshot({ path: path.join(DIR, "roster-1-preview.png"), fullPage: true });
    await tap("ยืนยัน · สร้าง 8 · อัปเดต 0");
    await page.waitForTimeout(800);
    (await page.getByText("รหัสตั้งต้นต้องยาวอย่างน้อย 8 ตัว").count()) ? pass("ไม่ใส่รหัสตั้งต้น — เตือนก่อนส่ง") : fail("ไม่เตือนรหัส");
    sql(`select count(*) from "User" where "employeeCode" like '99____'`) === "0" ? pass("DB: ยังไม่บันทึกอะไร") : fail("บันทึกไปแล้วทั้งที่ไม่มีรหัส");
    await tap("ตกลง").catch(() => {});
    await page.getByLabel("รหัสตั้งต้น").fill("12345678");
    await tap("ยืนยัน · สร้าง 8 · อัปเดต 0");
    await page.waitForTimeout(3500);
    (await page.getByText("นำเข้ารายชื่อแล้ว").count()) ? pass("ขึ้นสรุปผลการนำเข้า") : fail("ไม่ขึ้นสรุป");
    await page.screenshot({ path: path.join(DIR, "roster-2-done.png") });
    const opl = sql(`select coalesce(team,'-')||'|'||"mustChangePassword" from "User" where "employeeCode"='990021'`);
    opl === "กรุงเทพ|true" ? pass("DB: ทีมที่เลือกเองถูกบันทึก + ต้องเปลี่ยนรหัส") : fail(`DB ช่าง OPL: ${opl}`);
    const sup = sql(`select role||'|'||array_to_string("supervisedTeams",',') from "User" where "employeeCode"='990002'`);
    sup === "SUPERVISOR|กรุงเทพ" ? pass("DB: หัวหน้าภาคได้ทีมจากช่างของตัวเอง") : fail(`DB หัวหน้าภาค: ${sup}`);
    await tap("ตกลง").catch(() => {});
    await page.getByLabel("ค้นหาผู้ใช้").fill("990002");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(DIR, "roster-3-supervisor.png") });
    (await page.getByText("ทีมช่างที่ดูแล (เลือกได้หลายทีม)").locator("visible=true").count())
      ? pass("การ์ดหัวหน้าภาคมีตัวเลือกทีมที่ดูแล") : fail("ไม่มีตัวเลือกทีมที่ดูแล");
  } catch (e) {
    fail(String(e));
    await page.screenshot({ path: path.join(DIR, "roster-fail.png"), fullPage: true }).catch(() => {});
  } finally {
    sql(`delete from "User" where "employeeCode" like '99____'`);
    errors.length ? fail("page errors: " + errors.join(" | ")) : pass("ไม่มี error ในหน้า");
    await browser.close();
  }
})();
