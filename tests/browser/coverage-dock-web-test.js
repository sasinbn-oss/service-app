// ทดสอบ: ผังผู้รับผิดชอบ — ลากคนที่ยังไม่มีสังกัดเข้าทีมที่อยู่ไกล (เจ้าของงานขอ ต.ค. 69)
//   · แถบ "ยังไม่มีสังกัด" ลอยติดล่างจอ — เลื่อนผังไปล่างสุดแล้วยังเห็นแถบ · ค้นชื่อในแถบได้
//   · คลิกชื่อ → ป้าย "กำลังย้าย …" · Esc ยกเลิก
//   · ลากด้วยเมาส์จริง (HTML5) ไปใกล้ขอบล่าง → ผังเลื่อนลงเอง → วางที่ทีมที่ตอนแรกอยู่นอกจอ → รอบันทึก 1 รายการ
//   · ยกเลิกทั้งหมดแล้วฐานข้อมูลไม่เปลี่ยน
// สร้างผู้ใช้ทดสอบเองแล้วลบทิ้ง (ต้องมี DATABASE_URL)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const path = require("path");
const DIR = __dirname;
const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const SUF = String(Math.floor(Math.random() * 1e5));
const TECH = `ZCDT${SUF}`;
const TECH_NAME = `ช่างแถบล่าง${SUF}`;

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword")
       select '${TECH}','${TECH_NAME}','EMPLOYEE',"passwordHash",false from "User" where "employeeCode"='A001'`);
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true").last();
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await page.locator('[aria-label="ผังผู้รับผิดชอบ"]').locator("visible=true").last().click();
    await page.waitForTimeout(3000);
    await label("แก้ไขผัง").click();
    await page.waitForTimeout(800);

    // กล่องที่เลื่อนของหน้า (ScrollView) — ใช้วัดว่าเลื่อนไปเท่าไร
    const scrollTop = (v) =>
      page.evaluate((set) => {
        const h = [...document.querySelectorAll("div")].find((d) => d.innerText?.startsWith("OTTERI SERVICE · ฝ่ายบริการซ่อมบำรุง"));
        let el = h;
        while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
        if (set !== null) el.scrollTop = set;
        return el.scrollTop;
      }, v ?? null);
    const person = () => page.locator(`[aria-label="ช่าง ${TECH_NAME}"]`).locator("visible=true").first();

    // 1) แถบติดล่างจอ แม้เลื่อนผังไปล่างสุด
    await scrollTop(99999);
    await page.waitForTimeout(400);
    const box = await person().boundingBox();
    box && box.y > 500 && box.y + box.height < 800
      ? pass(`เลื่อนผังไปล่างสุดแล้วยังเห็น ${TECH_NAME} ในแถบล่างจอ (y=${Math.round(box.y)})`)
      : fail(`ไม่เห็นในแถบล่างจอ: ${JSON.stringify(box)}`);
    await page.screenshot({ path: path.join(DIR, "dock-1-bottom.png") });

    // 2) ค้นในแถบ
    const search = page.getByPlaceholder("ค้นชื่อ / รหัส");
    await search.fill(`zzz${SUF}`);
    await page.waitForTimeout(300);
    (await vis(`ไม่พบ “zzz${SUF}”`).count()) > 0 && (await person().count()) === 0 ? pass("ค้นในแถบ: ไม่ตรง → ไม่พบ") : fail("ค้นในแถบไม่กรอง");
    await search.fill(SUF);
    await page.waitForTimeout(300);
    (await person().count()) > 0 ? pass("ค้นด้วยรหัสเจอคนที่ต้องการ") : fail("ค้นด้วยรหัสไม่เจอ");

    // 3) คลิกชื่อ → ป้าย · Esc ยกเลิก
    await person().click();
    await page.waitForTimeout(300);
    (await vis(`กำลังย้าย ${TECH_NAME}`, false).count()) > 0 ? pass("คลิกชื่อแล้วขึ้นป้าย \"กำลังย้าย …\"") : fail("ไม่ขึ้นป้ายกำลังย้าย");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    (await vis(`กำลังย้าย ${TECH_NAME}`, false).count()) === 0 ? pass("กด Esc แล้วยกเลิก") : fail("Esc ไม่ยกเลิก");

    // 4) ลากด้วยเมาส์จริงไปขอบล่าง → เลื่อนเอง → วางที่ทีมที่ตอนแรกอยู่นอกจอ
    await scrollTop(0);
    await page.waitForTimeout(300);
    // แถบล่างจอบังส่วนล่างของผังอยู่ — ทีมที่อยู่ใต้ขอบบนของแถบคือทีมที่ต้องเลื่อนถึงจะวางได้
    const dockTop = await page.evaluate(() => {
      const d = [...document.querySelectorAll("div")].find((x) => x.innerText?.startsWith("● ยังไม่มีสังกัด"));
      return d ? d.getBoundingClientRect().top : 700;
    });
    const target = await page.evaluate((top) => {
      const t = [...document.querySelectorAll('[aria-label^="ทีม "]')].find((e) => e.getBoundingClientRect().top > top);
      return t ? t.getAttribute("aria-label") : null;
    }, dockTop);
    target ? pass(`ทีมปลายทางที่ถูกแถบล่างบัง/อยู่นอกจอตอนเริ่ม: ${target}`) : fail("หาทีมที่อยู่นอกจอไม่เจอ");
    const p = await person().boundingBox();
    await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2);
    await page.mouse.down();
    await page.mouse.move(p.x + p.width / 2, p.y - 20, { steps: 5 });
    // จ่อไว้ใกล้ขอบล่าง (เหนือแถบ) จนทีมปลายทางโผล่ในจอ
    let seen = false;
    for (let i = 0; i < 80 && !seen; i++) {
      await page.mouse.move(683 + (i % 2), dockTop - 25);
      await page.waitForTimeout(50);
      seen = await page.evaluate((arg) => {
        const t = document.querySelector(`[aria-label="${arg.l}"]`);
        const r = t.getBoundingClientRect();
        return r.top > 80 && r.top < arg.dockTop - 120;
      }, { l: target, dockTop }).catch(() => false);
    }
    const moved = await scrollTop();
    moved > 200 && seen ? pass(`ลากใกล้ขอบล่าง → ผังเลื่อนลงเอง ${moved}px จนทีมปลายทางโผล่`) : fail(`เลื่อนเอง ${moved}px · เห็นทีม ${seen}`);
    await page.mouse.up();
    // วางด้วยตัวลากมาตรฐานของ Playwright ตอนทีมโผล่แล้ว — ตัวจำลองลากของ Playwright ยิง dragover เฉพาะตอนเมาส์ขยับ
    // ระหว่างที่ผังเลื่อนอยู่จึงวางผิดที่ (เบราว์เซอร์จริงยิงเป็นระยะเอง) ส่วนการเลื่อนเองพิสูจน์แล้วข้างบน
    await page.waitForTimeout(400);
    await page.dragAndDrop(`[aria-label="ช่าง ${TECH_NAME}"] >> nth=0`, `[aria-label="${target}"] >> nth=0`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(DIR, "dock-2-dropped.png") });
    (await vis("รอบันทึก 1 รายการ").count()) > 0 && (await vis(`${TECH_NAME} (ช่าง): ไม่มีสังกัด → ${target.replace("ทีม ", "ทีม")}`, false).count()) > 0
      ? pass(`วางแล้วรอบันทึก 1 รายการ: ${TECH_NAME} → ${target}`)
      : fail("วางแล้วไม่ขึ้นรายการรอบันทึก");

    await label("ยกเลิกทั้งหมด").click();
    await page.waitForTimeout(1500);
    sql(`select coalesce(team,'-') from "User" where "employeeCode"='${TECH}'`) === "-" ? pass("ยกเลิกทั้งหมด ฐานข้อมูลไม่เปลี่ยน") : fail("ฐานข้อมูลเปลี่ยน");
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    sql(`delete from "User" where "employeeCode"='${TECH}'`);
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
