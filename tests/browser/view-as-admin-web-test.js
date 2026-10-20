// ทดสอบ: แอดมินดูในฐานะหัวหน้าภาค/ช่างได้ (เจ้าของงานเพิ่ม ต.ค. 69)
//   · แอดมินเห็นปุ่ม "ดูในฐานะ…" · ตัวเลือกมีแค่ ช่าง/หัวหน้าภาค (ไม่มีแท็บแอดมิน)
//   · เลือก T001 → แถบ "กำลังดูในฐานะ" + บันทึกในฐานข้อมูลว่าใครดูใคร · กลับเป็นตัวเองได้ (บันทึกเวลาเลิกดู)
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
  const aid = sql(`select id from "User" where "employeeCode"='A001'`);
  const before = Number(sql(`select coalesce(max(id),0) from "ViewAsLog"`));
  try {
    const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);

    (await label("ดูในฐานะผู้ใช้อื่น").count()) ? pass("แอดมินเห็นปุ่ม ดูในฐานะ…") : fail("แอดมินไม่เห็นปุ่ม");
    await label("ดูในฐานะผู้ใช้อื่น").first().click();
    await page.waitForTimeout(1500);
    (await label("ตำแหน่ง ช่าง").count()) && (await label("ตำแหน่ง หัวหน้าภาค").count()) && !(await label("ตำแหน่ง แอดมิน").count())
      ? pass("ตัวเลือกมีแค่ ช่าง/หัวหน้าภาค — ไม่มีแท็บแอดมิน") : fail("แท็บตัวเลือกไม่ถูก");
    await label("ค้นหาผู้ใช้ที่จะดู").fill("T001");
    await page.waitForTimeout(600);
    await page.locator('[aria-label^="เลือก "]').locator("visible=true").first().click();
    await page.waitForTimeout(300);
    await label("ดูในฐานะคนนี้").click();
    await page.waitForTimeout(4000);
    const log = sql(`select "byUserId"||'|'||(select "employeeCode" from "User" where id="targetUserId")||'|'||coalesce("endedAt"::text,'open') from "ViewAsLog" where id>${before} order by id desc limit 1`);
    (await vis("กำลังดูในฐานะ", false).count()) && log === `${aid}|T001|open`
      ? pass("ดูในฐานะ T001 ได้ แถบบอกอยู่ · ฐานข้อมูลบันทึกว่าแอดมินดู T001") : fail(`เริ่มดู: ${log}`);
    await label("กลับเป็นตัวเอง").first().click();
    await page.waitForTimeout(3000);
    const ended = sql(`select ("endedAt" is not null)::text from "ViewAsLog" where id>${before} order by id desc limit 1`);
    (await label("ดูในฐานะผู้ใช้อื่น").count()) && ended === "true" ? pass("กลับเป็นตัวเองได้ · บันทึกเวลาเลิกดู") : fail(`กลับเป็นตัวเอง: ${ended}`);
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    sql(`delete from "ViewAsLog" where id>${before}`);
    await browser.close();
  }
})();
