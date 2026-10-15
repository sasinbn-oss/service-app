// ทดสอบ: ผังผู้รับผิดชอบพื้นที่
//   · ช่างเปิดดูได้ แต่ไม่มีปุ่มแก้ไข (และแก้ผ่าน API ไม่ได้)
//   · แอดมิน: ลากช่างจาก "ยังไม่มีสังกัด" เข้าทีม · แตะหัวหน้าภาคแล้วแตะหัวภาค (แบบมือถือ) ·
//     ก่อนกดบันทึกฐานข้อมูลยังไม่เปลี่ยน · บันทึกแล้วฐานข้อมูลเปลี่ยน · ยกเลิกทั้งหมดแล้วไม่มีอะไรเปลี่ยน
// สร้างผู้ใช้ทดสอบเองแล้วลบทิ้ง (ต้องมี DATABASE_URL)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const path = require("path");
const DIR = __dirname;
const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const SUF = String(Math.floor(Math.random() * 1e5));
const TECH = `ZCMT${SUF}`, SUP = `ZCMS${SUF}`;
const TECH_NAME = `ช่างผังทดสอบ${SUF}`, SUP_NAME = `หัวหน้าผังทดสอบ${SUF}`;

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  // ทีมและภาคจริงของเครื่องนี้ — ทีมแรกในทะเบียนสาขา
  const team = sql(`select zone from "Branch" where zone is not null and region is not null and "cancelledAt" is null order by zone limit 1`);
  const region = sql(`select region from "Branch" where zone='${team}' and region is not null group by region order by count(*) desc limit 1`);
  sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword")
       select '${TECH}','${TECH_NAME}','EMPLOYEE',"passwordHash",false from "User" where "employeeCode"='A001';
       insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword")
       select '${SUP}','${SUP_NAME}','SUPERVISOR',"passwordHash",false from "User" where "employeeCode"='A001'`);
  const db = (code) => sql(`select coalesce(team,'-')||'|'||coalesce(region,'-')||'|'||array_to_string("supervisedTeams",',') from "User" where "employeeCode"='${code}'`);
  try {
    const open = async (code) => {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1400 } });
      page.on("pageerror", (e) => errors.push(String(e)));
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
      await page.locator('[aria-label="ผังผู้รับผิดชอบ"]').locator("visible=true").last().click();
      await page.waitForTimeout(3000);
      return { page, vis };
    };
    const label = (page, l) => page.locator(`[aria-label="${l}"]`).locator("visible=true").last();

    {
      const { page, vis } = await open("T001");
      (await vis("ผังผู้รับผิดชอบพื้นที่ให้บริการ").count()) > 0 && (await vis(`ภาค${region}`).count()) > 0
        ? pass(`ช่างเปิดผังได้ เห็นภาค${region}`)
        : fail("ช่างเปิดผังไม่ได้");
      (await label(page, "แก้ไขผัง").count()) === 0 ? pass("ช่างไม่มีปุ่มแก้ไขผัง") : fail("ช่างเห็นปุ่มแก้ไข");
      await page.close();
    }

    const { page, vis } = await open("A001");
    await label(page, "แก้ไขผัง").click();
    await page.waitForTimeout(800);
    (await vis(TECH_NAME).count()) > 0 && (await vis(SUP_NAME).count()) > 0
      ? pass("โหมดแก้ไข: คนที่ยังไม่มีสังกัดอยู่ในกล่อง \"ยังไม่มีสังกัด\"")
      : fail("ไม่เห็นคนที่ยังไม่มีสังกัด");

    // ลาก (จอคอม)
    await page.dragAndDrop(`[aria-label="ช่าง ${TECH_NAME}"] >> nth=0`, `[aria-label="ทีม ${team}"] >> nth=0`);
    await page.waitForTimeout(800);
    // แตะแล้วแตะ (มือถือ)
    await label(page, `หัวหน้าภาค ${SUP_NAME}`).click();
    await page.waitForTimeout(300);
    await label(page, `หัวภาค ${region}`).click();
    await page.waitForTimeout(800);
    (await vis("รอบันทึก 2 รายการ").count()) > 0 ? pass("ลากช่างเข้าทีม + แตะหัวหน้าภาคไปหัวภาค → รอบันทึก 2 รายการ") : fail("รายการรอบันทึกไม่ตรง");
    db(TECH) === "-|-|" && db(SUP) === "-|-|" ? pass("ยังไม่กดบันทึก ฐานข้อมูลยังไม่เปลี่ยน") : fail(`บันทึกก่อนกด: ${db(TECH)} / ${db(SUP)}`);
    await page.screenshot({ path: path.join(DIR, "coverage-map-edit.png") });

    await label(page, "ยกเลิกทั้งหมด").click();
    await page.waitForTimeout(2500);
    (await vis("รอบันทึก", false).count()) === 0 && db(TECH) === "-|-|" ? pass("ยกเลิกทั้งหมด: รายการหาย ฐานข้อมูลไม่เปลี่ยน") : fail("ยกเลิกไม่ได้ผล");

    await page.dragAndDrop(`[aria-label="ช่าง ${TECH_NAME}"] >> nth=0`, `[aria-label="ทีม ${team}"] >> nth=0`);
    await page.waitForTimeout(500);
    await label(page, `หัวหน้าภาค ${SUP_NAME}`).click();
    await label(page, `หัวภาค ${region}`).click();
    await page.waitForTimeout(500);
    await label(page, "บันทึกผัง").click();
    await page.waitForTimeout(4000);
    db(TECH) === `${team}|-|` ? pass(`บันทึกแล้ว: ช่างอยู่ทีม${team} (ฐานข้อมูล)`) : fail(`ช่าง: ${db(TECH)}`);
    db(SUP).startsWith(`-|${region}|`) ? pass(`บันทึกแล้ว: หัวหน้าภาคดูแลทั้งภาค${region} (ฐานข้อมูล)`) : fail(`หัวหน้าภาค: ${db(SUP)}`);
    (await vis(TECH_NAME).count()) > 0 && (await label(page, "แก้ไขผัง").count()) > 0
      ? pass("บันทึกแล้วออกจากโหมดแก้ไข ผังโหลดใหม่ เห็นคนในที่ใหม่")
      : fail("หลังบันทึกผังไม่ตรง");
    await page.screenshot({ path: path.join(DIR, "coverage-map.png") });
  } catch (e) {
    fail(String(e).slice(0, 300));
  } finally {
    sql(`delete from "User" where "employeeCode" in ('${TECH}','${SUP}')`);
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
