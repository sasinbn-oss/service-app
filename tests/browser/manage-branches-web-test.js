// ทดสอบ: หน้าจัดการข้อมูลสาขาเปิดได้ เมื่อมีสาขาที่ยังไม่มีพิกัด (ต.ค. 69)
//   เดิมเรียก .toFixed บนพิกัด null → หน้าค้างจอขาวทั้งหน้า ในระบบจริงสาขาส่วนใหญ่ยังไม่มีพิกัด
//   · สาขาไม่มีพิกัดขึ้น "ยังไม่มีพิกัด" · สาขามีพิกัดยังขึ้นพิกัดและรัศมี · ไม่มี error บนหน้า
// แก้พิกัดสาขาแรกชั่วคราวแล้วคืนค่าเดิม (ต้องมี DATABASE_URL)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const [id, lat, lng] = sql(`select id||'|'||latitude||'|'||longitude from "Branch" where latitude is not null order by id limit 1`).split("|");
  const withCoords = sql(`select code from "Branch" where latitude is not null and id<>${id} order by id limit 1`);
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  try {
    sql(`update "Branch" set latitude=null, longitude=null where id=${id}`);
    const noCoords = sql(`select code from "Branch" where id=${id}`);
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await vis("ระบบหลังบ้าน").first().click();
    await page.waitForTimeout(2000);
    await vis("จัดการข้อมูลสาขา").last().click();
    await page.waitForTimeout(4000);
    const t = await page.evaluate(() => document.body.innerText);
    t.length > 0 && t.includes("เพิ่มสาขาใหม่") ? pass("หน้าจัดการสาขาเปิดได้ ไม่ค้างจอขาว") : fail("จอขาว");
    const rowOf = (code) => t.split("\n").findIndex((l) => l.includes(`(${code})`));
    const lines = t.split("\n");
    const iNo = rowOf(noCoords), iYes = rowOf(withCoords);
    iNo >= 0 && lines[iNo + 1]?.includes("ยังไม่มีพิกัด") ? pass(`สาขาไม่มีพิกัด (${noCoords}) ขึ้นว่า ยังไม่มีพิกัด`) : fail(`แถว ${noCoords}: ${lines[iNo + 1]}`);
    iYes >= 0 && /\d+\.\d{4}, \d+\.\d{4} · รัศมี \d+ ม\./.test(lines[iYes + 1] ?? "") ? pass(`สาขามีพิกัด (${withCoords}) ยังขึ้นพิกัดและรัศมี`) : fail(`แถว ${withCoords}: ${lines[iYes + 1]}`);
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    sql(`update "Branch" set latitude=${lat}, longitude=${lng} where id=${id}`);
    await browser.close();
  }
})();
