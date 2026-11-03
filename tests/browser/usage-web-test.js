// ทดสอบ: การใช้งานแอป — ปุ่มบนแถบบนข้างชื่อ (แอดมินเห็น ช่างไม่เห็น) · หน้าภาพรวม · ค้นหารายชื่อ · กดชื่อดูย้อนหลัง
// · คอลัมน์ "ดูวิธีใช้แล้ว" (สอนการใช้งาน): ยังไม่ได้ดู → x/n · ยังขาด … → ✓ ครบ n/n ตามฐานข้อมูล · หัวการ์ด "ดูวิธีใช้ครบแล้ว k คน"
//   · การ์ดมือถือมีบรรทัด "ดูวิธีใช้แล้ว …" บรรทัดเดียว หน้าไม่ล้นแนวนอน
// ใส่ช่วงการใช้งานสมมุติให้ช่างทดสอบชั่วคราว แล้วลบทิ้งตอนจบ (ต้องมี DATABASE_URL)
const { chromium } = require("playwright");
const path = require("path");
const { execSync } = require("child_process");
const DIR = __dirname;
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const U = "zz.usage.web";
// รายชื่อเรื่องของช่างในแอป (mobile/src/utils/howtoTours.ts) — เพิ่มเรื่องของช่างเมื่อไรต้องเพิ่มที่นี่ด้วย
const TECH_TOURS = ["tech.myday", "tech.orders", "tech.order", "tech.close"];

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
    // ผู้ใช้ที่เทสต์นี้สร้างเองยังไม่เคยตอบกล่องสอนการใช้งาน — ปิดกล่องที่ขึ้นเอง ไม่งั้นพื้นมืดบังทุกปุ่ม (tests/README)
    await page.addInitScript(() => { try { localStorage.setItem("otteri-howto-auto", "off"); } catch {} });
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

    // คอลัมน์ "ดูวิธีใช้แล้ว" — ช่างทดสอบสร้างด้วย SQL (howtoSeen NULL = ยังไม่ได้ดูสักเรื่อง) แล้วจดทีละขั้นด้วย SQL
    const rowText = async () =>
      (await page.locator('[aria-label="การใช้งานของ ช่างทดสอบเวลาใช้งาน"]').locator("visible=true").first().innerText().catch(() => "")).replace(/\s+/g, " ");
    const titleText = async () => (await page.getByText(/^รายคน · /).locator("visible=true").first().innerText().catch(() => "")).replace(/\s+/g, " ");
    const research = async () => {
      await box.fill("");
      await page.waitForTimeout(800);
      await box.fill("ทดสอบเวลา");
      await page.waitForTimeout(2500);
    };
    (await page.getByText("ดูวิธีใช้แล้ว", { exact: true }).locator("visible=true").count()) >= 1
      ? pass('จอกว้าง: หัวคอลัมน์ "ดูวิธีใช้แล้ว"') : fail("ไม่มีหัวคอลัมน์ ดูวิธีใช้แล้ว");
    (await rowText()).includes("ยังไม่ได้ดู") && /^รายคน · 1 คน · ดูวิธีใช้ครบแล้ว 0 คน/.test(await titleText())
      ? pass('ยังไม่เคยดู (ฐานข้อมูล NULL): "ยังไม่ได้ดู" · หัวการ์ด ดูวิธีใช้ครบแล้ว 0 คน') : fail(`ยังไม่ได้ดู: "${(await rowText()).slice(0, 160)}" · "${await titleText()}"`);
    const iso = new Date().toISOString();
    sql(`update "User" set "howtoSeen"='{"notice": "${iso}", "tours": {"${TECH_TOURS[0]}": "${iso}", "area.plan": "${iso}"}}'::jsonb where "employeeCode"='${U}';`);
    await research();
    // เรื่องของตำแหน่งอื่นที่จดไว้ (area.plan — เคยเป็นตำแหน่งอื่น) ไม่นับ: นับเทียบรายชื่อของตำแหน่งปัจจุบันเท่านั้น
    const part = await rowText();
    part.includes(`1/${TECH_TOURS.length} · ยังขาด ใบงานซ่อม`)
      ? pass(`ดูไป 1 เรื่อง: "1/${TECH_TOURS.length} · ยังขาด …" (ไม่นับเรื่องของตำแหน่งอื่น)`) : fail(`ดูไปบางเรื่อง: "${part.slice(0, 200)}"`);
    sql(`update "User" set "howtoSeen"=jsonb_build_object('notice','${iso}','tours',(select jsonb_object_agg(k,'${iso}') from unnest(array['${TECH_TOURS.join("','")}']) k)) where "employeeCode"='${U}';`);
    await research();
    (await rowText()).includes(`✓ ครบ ${TECH_TOURS.length}/${TECH_TOURS.length}`) && /^รายคน · 1 คน · ดูวิธีใช้ครบแล้ว 1 คน/.test(await titleText())
      ? pass(`ดูครบทุกเรื่อง: "✓ ครบ ${TECH_TOURS.length}/${TECH_TOURS.length}" · หัวการ์ด ดูวิธีใช้ครบแล้ว 1 คน`) : fail(`ดูครบ: "${(await rowText()).slice(0, 200)}" · "${await titleText()}"`);
    await page.screenshot({ path: path.join(DIR, "usage-2b-howto.png") });
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
    // การ์ดมือถือมีบรรทัดดูวิธีใช้แล้ว (ไม่มีหัวคอลัมน์บนจอแคบ) — บรรทัดเดียว ไม่ทำให้หน้าล้น (เช็คข้างบน)
    (await phone.getByText(/^ดูวิธีใช้แล้ว /).locator("visible=true").count()) > 0 &&
    (await phone.getByText("ดูวิธีใช้แล้ว", { exact: true }).locator("visible=true").count()) === 0
      ? pass('จอมือถือ: การ์ดมีบรรทัด "ดูวิธีใช้แล้ว …" (ไม่มีหัวคอลัมน์)') : fail("จอมือถือ: ไม่มีบรรทัด ดูวิธีใช้แล้ว บนการ์ด");
    await phone.screenshot({ path: path.join(DIR, "usage-4-phone.png") });
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail("ทดสอบพัง: " + e.message);
  } finally {
    await browser.close();
    cleanup();
  }
})();
