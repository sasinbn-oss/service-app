// ทดสอบ: การใช้งานแอป — ปุ่มบนแถบบนข้างชื่อ (แอดมินเห็น ช่างไม่เห็น) · หน้าภาพรวม · ค้นหารายชื่อ · กดชื่อดูย้อนหลัง
// ใส่ช่วงการใช้งานสมมุติให้ช่างทดสอบชั่วคราว แล้วลบทิ้งตอนจบ (ต้องมี DATABASE_URL)
const { chromium } = require("playwright");
const path = require("path");
const { execSync } = require("child_process");
const DIR = __dirname;
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const U = "zz.usage.web";

function cleanup() {
  sql(`delete from "User" where "employeeCode"='${U}';`);
}

(async () => {
  cleanup();
  sql(`insert into "User"("employeeCode",name,role,team,"passwordHash")
       select '${U}','ช่างทดสอบเวลาใช้งาน','EMPLOYEE','ทีมทดสอบเวลา',"passwordHash" from "User" where "employeeCode"='A001';`);
  // 5 วันล่าสุด ช่วงเช้ากับบ่าย (เวลาไทย) — วันนี้มีทั้งคอมและมือถือ
  const today = execSync("TZ=Asia/Bangkok date +%F").toString().trim();
  const vals = [];
  for (let d = 0; d < 5; d++) {
    for (const [from, to, dev] of [["08:00", "09:30", "MOBILE"], ["13:00", "14:20", d === 0 ? "WEB" : "MOBILE"]]) {
      vals.push(`select id, generate_series(('${today} ${from}'::timestamp - interval '7 hours' - interval '${d} days'),
                 ('${today} ${to}'::timestamp - interval '7 hours' - interval '${d} days'), interval '5 minutes'), '${dev}' from "User" where "employeeCode"='${U}'`);
    }
  }
  sql(`insert into "UsageSlot"("userId",slot,device) ${vals.join(" union all ")} on conflict do nothing;`);

  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  async function open(code, width) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill(code);
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await page.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(6000);
    return page;
  }
  const btn = (page) => page.locator('[aria-label^="การใช้งานแอป"]').locator("visible=true");

  try {
    {
      const page = await open("T001", 1280);
      (await btn(page).count()) === 0 ? pass("ช่างไม่เห็นปุ่มการใช้งาน") : fail("ช่างเห็นปุ่มการใช้งาน");
      await page.close();
    }
    const page = await open("A001", 1280);
    (await btn(page).count()) > 0 ? pass("แอดมินเห็นปุ่มการใช้งานบนแถบบน") : fail("ไม่มีปุ่มการใช้งาน");
    const label = (await btn(page).first().getAttribute("aria-label")) || "";
    /\d+ คนออนไลน์/.test(label) && !label.includes("· 0 ") ? pass(`ปุ่มบอกจำนวนคนออนไลน์ (${label})`) : fail(`ป้ายปุ่ม: ${label}`);
    await page.screenshot({ path: path.join(DIR, "usage-1-button.png"), clip: { x: 640, y: 0, width: 640, height: 70 } });
    await btn(page).first().click();
    await page.waitForTimeout(4000);
    (await page.getByText("การใช้งานแอป", { exact: true }).locator("visible=true").count()) > 0 ? pass("กดแล้วไปหน้าการใช้งานแอป") : fail("ไม่ได้ไปหน้าการใช้งาน");
    (await page.getByText("ช่างทดสอบเวลาใช้งาน").locator("visible=true").count()) > 0 ? pass("รายชื่อมีคนที่ใช้วันนี้") : fail("ไม่เห็นรายชื่อ");
    await page.screenshot({ path: path.join(DIR, "usage-2-overview.png"), fullPage: true });

    const box = page.getByLabel("ค้นหารายชื่อ").locator("visible=true").first();
    await box.fill("ทดสอบเวลา");
    await page.waitForTimeout(2500);
    const names = await page.locator('[aria-label^="การใช้งานของ "]').locator("visible=true").count();
    names === 1 ? pass("ค้นหารายชื่อแล้วเหลือคนเดียว") : fail(`ค้นหาแล้วเหลือ ${names} คน`);
    (await page.getByText("3 ชม. 00 น.").locator("visible=true").count()) > 0 ? pass("รวมเวลาวันนี้ 3 ชม. 00 น. (36 ช่วง × 5 นาที)") : fail("รวมเวลาไม่ตรง");
    await page.locator('[aria-label="การใช้งานของ ช่างทดสอบเวลาใช้งาน"]').locator("visible=true").first().click();
    await page.waitForTimeout(3000);
    (await page.getByText("ใช้ 5 จาก 7 วัน", { exact: false }).locator("visible=true").count()) > 0 ? pass("ย้อนหลัง: ใช้ 5 จาก 7 วัน") : fail("ย้อนหลังไม่ตรง");
    (await page.getByText("เข้าครั้งแรกของวันเฉลี่ย 08:00", { exact: false }).locator("visible=true").count()) > 0
      ? pass("เข้าครั้งแรกเฉลี่ย 08:00 (เวลาไทย)") : fail("เวลาเข้าเฉลี่ยไม่ตรง");
    await page.screenshot({ path: path.join(DIR, "usage-3-person.png") });
    await page.close();

    const phone = await open("A001", 400);
    (await btn(phone).count()) > 0 ? pass("จอมือถือ: มีปุ่มย่อบนแถบหัว") : fail("จอมือถือไม่มีปุ่ม");
    await btn(phone).first().click();
    await phone.waitForTimeout(3500);
    const sw = await phone.evaluate(() => document.documentElement.scrollWidth);
    sw <= 400 ? pass("จอมือถือ: หน้าไม่ล้นแนวนอน") : fail(`จอมือถือกว้าง ${sw}px`);
    await phone.screenshot({ path: path.join(DIR, "usage-4-phone.png") });
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail("ทดสอบพัง: " + e.message);
  } finally {
    await browser.close();
    cleanup();
  }
})();
