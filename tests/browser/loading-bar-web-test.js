// ทดสอบ: แถบ "กำลังโหลดข้อมูล…" บนสุดของจอ — เติมจากซ้ายไปขวาครั้งเดียวจนสุด (เจ้าของงานขอ ต.ค. 69 ตามตัวอย่างที่ตกลง)
//   เดิมเป็นขีดวิ่งวนไปมา (และก่อนหน้านั้นค้างนิ่งเพราะ keyframes ถูกทิ้ง) · เทสต์นี้ทำให้ API ช้า 6 วิ แล้ววัดแถบ:
//   ติดซ้ายเสมอ · ไม่มี animation วนซ้ำ · ยาวขึ้นเรื่อย ๆ แต่ไม่เต็มระหว่างรอ · โหลดเสร็จเติมเต็มแล้วหาย · จุดในป้ายนิ่ง
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t) => page.getByText(t, { exact: true }).locator("visible=true");
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").last().click();
    await page.waitForTimeout(4000);
    // อ่านรายการใบงานช้า 6 วิ — นานพอให้แถบขึ้น (ขึ้นเมื่ออ่านนานเกิน 300 ms)
    await page.route("**/api/work-orders**", async (r) => {
      await new Promise((x) => setTimeout(x, 6000));
      r.continue().catch(() => {});
    });
    await page.locator('[aria-label="ใบงานซ่อม"]').locator("visible=true").last().click();
    await page.waitForTimeout(900);
    const sample = () =>
      page.evaluate(() => {
        const bar = document.querySelector('[aria-label="กำลังโหลดข้อมูล"]')?.firstElementChild;
        if (!bar) return null;
        const r = bar.getBoundingClientRect();
        const label = [...document.querySelectorAll("div")].find((n) => n.childElementCount === 0 && n.textContent === "กำลังโหลดข้อมูล…");
        const dot = label?.previousElementSibling;
        return {
          x: Math.round(r.x),
          w: Math.round(r.width),
          vw: window.innerWidth,
          anim: getComputedStyle(bar).animationName,
          dot: dot ? getComputedStyle(dot).animationName : null,
        };
      });
    const a = await sample();
    await page.screenshot({ path: path.join(DIR, "loading-bar-1.png"), clip: { x: 0, y: 0, width: 1400, height: 80 } });
    await page.waitForTimeout(1800);
    const b = await sample();
    a ? pass("อ่านช้า → แถบกำลังโหลดขึ้น") : fail("แถบกำลังโหลดไม่ขึ้น");
    a && b && a.x === 0 && b.x === 0 ? pass("แถบติดซ้ายเสมอ (ไม่ใช่ขีดลอยวิ่ง)") : fail(`ตำแหน่งแถบ: ${JSON.stringify([a, b])}`);
    a && a.anim === "none" ? pass("ไม่มี animation วนซ้ำ") : fail(`ยังมี animation: ${a && a.anim}`);
    a && b && b.w > a.w && b.w < b.vw * 0.95
      ? pass(`ระหว่างรอแถบยาวขึ้นแต่ยังไม่เต็ม (${a.w} → ${b.w} จาก ${b.vw} px)`)
      : fail(`ความยาวแถบระหว่างรอ: ${JSON.stringify([a, b])}`);
    a && a.dot === "none" ? pass("จุดในป้ายกำลังโหลดนิ่ง ไม่กะพริบ") : fail(`จุดในป้าย: ${a && a.dot}`);
    // โหลดเสร็จ (~6 วิ) → เติมเต็มแล้วหาย — จับจังหวะเต็มก่อนจาง
    let full = false;
    for (let i = 0; i < 80 && !full; i++) {
      const c = await sample();
      if (c && c.w >= c.vw * 0.98) full = true;
      else await page.waitForTimeout(100);
    }
    full ? pass("โหลดเสร็จแล้วแถบเติมจนสุด") : fail("โหลดเสร็จแต่แถบไม่เติมจนสุด");
    await page.waitForTimeout(1500);
    (await sample()) === null ? pass("เติมสุดแล้วแถบหายไป") : fail("โหลดเสร็จแล้วแถบยังค้าง");
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
