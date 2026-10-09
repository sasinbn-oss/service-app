// ทดสอบ: หน้าต่างจัดแผนทีม — ดรอปดาวน์/ปฏิทิน/เวลาลอยทับ หน้าต่างไม่ยืด · บันทึกเวลาเข้าหน้างาน
// จอคอม (กว้างไม่เกิน 520) และมือถือ (ชิดขอบล่าง) · ยืนยันผลที่ฐานข้อมูล (ต้องมี DATABASE_URL) แล้วลบแผนทดสอบทิ้ง
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const path = require("path");
const DIR = __dirname;
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -Atc ${JSON.stringify(q)}`).toString().trim();
const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  // วันที่ 15 ของเดือนหน้า (ตามเวลาไทย) — ไม่ชนข้อมูลจริงของวันนี้
  const target = sql("select to_char(date_trunc('month', (now() at time zone 'Asia/Bangkok')) + interval '1 month' + interval '14 day','YYYY-MM-DD')");
  const [ty, tm] = target.split("-").map(Number);
  const label = `${DOW[new Date(Date.UTC(ty, tm - 1, 15)).getUTCDay()]} 15 ${MONTHS[tm - 1]} ${ty + 543}`;

  async function run(viewport, tag) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    // กรอบหน้าต่าง = กล่องที่มีปุ่มปิด "ปิด" และหัว "จัดแผนทีม" อยู่ข้างใน
    const modalBox = () =>
      page.evaluate(() => {
        const title = [...document.querySelectorAll("div")].find((d) => d.textContent === "จัดแผนทีม" && d.childElementCount === 0);
        let n = title;
        while (n && !(n.getBoundingClientRect().height > 200 && getComputedStyle(n).overflow === "hidden")) n = n.parentElement;
        const r = n.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) };
      });

    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").last().click();
    await page.waitForTimeout(3500);
    await vis("จัดแผน").first().click();
    await page.waitForTimeout(800);
    const before = await modalBox();
    if (tag === "desk") before.w <= 520 ? pass(`จอคอม: หน้าต่างกว้าง ${before.w}px (ไม่เกิน 520)`) : fail(`หน้าต่างกว้าง ${before.w}`);
    else Math.abs(before.bottom - viewport.height) <= 2 && before.w === viewport.width
      ? pass("มือถือ: หน้าต่างเต็มกว้าง ชิดขอบล่าง") : fail(`มือถือ: ${JSON.stringify(before)}`);

    // ทีม — ดรอปดาวน์ลอย หน้าต่างต้องไม่ยืด
    await page.getByLabel("ทีม", { exact: true }).locator("visible=true").first().click();
    await page.waitForTimeout(400);
    const during = await modalBox();
    during.h === before.h ? pass(`[${tag}] เปิดดรอปดาวน์ทีม หน้าต่างสูงเท่าเดิม (${before.h}px)`) : fail(`[${tag}] หน้าต่างยืด ${before.h} → ${during.h}`);
    await vis("กรุงเทพ").last().click();
    await page.waitForTimeout(300);
    (await page.getByLabel("ทีม", { exact: true }).locator("visible=true").first().innerText()).includes("กรุงเทพ")
      ? pass(`[${tag}] เลือกทีมจากกล่องลอยได้`) : fail(`[${tag}] เลือกทีมไม่ติด`);
    // เลือกทีมแล้วช่อง "ใครไปบ้าง" โผล่ — หน้าต่างสูงขึ้นจากเนื้อหาจริง วัดฐานใหม่ก่อนทดสอบกล่องถัดไป
    const base = await modalBox();

    // ปฏิทิน
    await page.getByLabel("วันที่", { exact: true }).locator("visible=true").first().click();
    await page.waitForTimeout(400);
    // หน้ากระดานมีปุ่ม "เดือนถัดไป" ของตัวเอง — กล่องลอยถูกวาดท้าย body จึงเป็นตัวสุดท้าย
    const nextMonth = page.getByLabel("เดือนถัดไป").last();
    (await page.getByLabel("เดือนถัดไป").count()) >= 2 ? pass(`[${tag}] ปฏิทินลอยขึ้นมา`) : fail(`[${tag}] ไม่มีปฏิทิน`);
    (await modalBox()).h === base.h ? pass(`[${tag}] เปิดปฏิทิน หน้าต่างไม่ยืด`) : fail(`[${tag}] ปฏิทินทำหน้าต่างยืด`);
    (await vis("วันนี้").count()) + (await vis("พรุ่งนี้").count()) === 0 ? pass(`[${tag}] ไม่มีปุ่มวันนี้/พรุ่งนี้แล้ว`) : fail("ยังมีปุ่มลัดวัน");
    await nextMonth.click();
    await page.waitForTimeout(200);
    await page.getByLabel(label, { exact: true }).click();
    await page.waitForTimeout(300);
    (await vis(label).count()) ? pass(`[${tag}] เลือกวันแล้วช่องแสดง "${label}"`) : fail(`[${tag}] ช่องวันที่ไม่แสดงวันที่เลือก`);

    // เวลาเข้าหน้างาน
    await page.getByLabel("เวลาเข้าหน้างาน", { exact: true }).locator("visible=true").first().click();
    await page.waitForTimeout(300);
    if (tag === "desk") {
      await page.getByLabel("08:30 น.", { exact: true }).click();
      await page.waitForTimeout(200);
      (await vis("08:30 น.").count()) ? pass("เลือกเวลา 08:30 จากช่องเวลา") : fail("เลือกเวลาไม่ติด");
    } else {
      await page.getByLabel("พิมพ์เวลาเอง").fill("845");
      await vis("ใช้เวลานี้").click();
      await page.waitForTimeout(200);
      (await vis("08:45 น.").count()) ? pass("[phone] พิมพ์ 845 → 08:45") : fail("พิมพ์เวลาเองไม่ได้");
    }

    // ยืมช่างจากทีมอื่น — กล่องลอยพร้อมค้นหา · Esc ปิด
    await page.getByLabel("ยืมช่างจากทีมอื่น").click();
    await page.waitForTimeout(400);
    (await modalBox()).h === base.h ? pass(`[${tag}] เปิดรายชื่อยืมช่าง หน้าต่างไม่ยืด`) : fail(`[${tag}] ยืมช่างทำหน้าต่างยืด`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    (await page.getByLabel("ค้นหาใน ช่างทีมอื่น").locator("visible=true").count()) === 0 ? pass(`[${tag}] กด Esc ปิดกล่อง`) : fail("Esc ไม่ปิดกล่อง");
    // ชิปช่างในหน้าต่าง (ชื่อเดียวกันอาจอยู่บนกระดานข้างหลัง กดตัวนั้นจะโดนฉากมืดแล้วหน้าต่างปิด)
    const chip = page.getByLabel("ช่างสมชาย", { exact: true }).locator("visible=true").last();
    if (await chip.count()) await chip.click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(DIR, `plan-${tag}.png`) });
    await vis("บันทึกแผน").last().click();
    await page.waitForTimeout(2500);
    const row = sql(`select coalesce("startTime",'-') from "TeamDayPlan" where team='กรุงเทพ' and date='${target}'`);
    const want = tag === "desk" ? "08:30" : "08:45";
    row === want ? pass(`[${tag}] DB: บันทึกเวลาเข้าหน้างาน ${want}`) : fail(`[${tag}] DB startTime = '${row}'`);
    sql(`delete from "TeamDayPlan" where team='กรุงเทพ' and date='${target}'`);
    await page.close();
  }
  try {
    await run({ width: 1280, height: 900 }, "desk");
    await run({ width: 400, height: 860 }, "phone");
  } catch (e) {
    fail(String(e).split("\n").slice(0, 6).join(" | "));
  } finally {
    sql(`delete from "TeamDayPlan" where team='กรุงเทพ' and date='${target}'`);
    errors.length ? fail("page errors: " + errors.join(" | ")) : pass("ไม่มี error ในหน้า");
    await browser.close();
  }
})();
