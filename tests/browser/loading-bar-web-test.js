// ทดสอบ: แถบ "กำลังโหลดข้อมูล…" บนสุดของจอขยับจริง (เจ้าของงานถาม ต.ค. 69 "แถบโหลดทำไมขึ้นแค่นี้")
//   เดิมส่ง animationKeyframes เป็น style ตรง ๆ — react-native-web ทิ้งเงียบ ๆ แถบสั้นค้างนิ่งที่มุมซ้าย
//   ดูเหมือนแถบความคืบหน้าที่ค้าง ~10% · เทสต์นี้ทำให้ API ช้าแล้ววัดตำแหน่งแถบสองครั้ง ต้องไม่อยู่ที่เดิม
//   · จุดในป้ายกำลังโหลดกะพริบ (มี animation จริง)
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
        const bar = document.querySelector('[aria-label="กำลังโหลดข้อมูล"]');
        const runner = bar?.firstElementChild?.firstElementChild;
        if (!runner) return null;
        const label = [...document.querySelectorAll("div")].find((n) => n.childElementCount === 0 && n.textContent === "กำลังโหลดข้อมูล…");
        const dot = label?.previousElementSibling;
        return {
          x: Math.round(runner.getBoundingClientRect().x),
          anim: getComputedStyle(runner).animationName,
          dot: dot ? getComputedStyle(dot).animationName : "none",
        };
      });
    const a = await sample();
    await page.screenshot({ path: path.join(DIR, "loading-bar-1.png"), clip: { x: 0, y: 0, width: 1400, height: 80 } });
    await page.waitForTimeout(370);
    const b = await sample();
    a ? pass("อ่านช้า → แถบกำลังโหลดขึ้น") : fail("แถบกำลังโหลดไม่ขึ้น");
    a && a.anim !== "none" ? pass(`แถบมี animation (${a.anim})`) : fail(`แถบไม่มี animation: ${JSON.stringify(a)}`);
    a && b && a.x !== b.x ? pass(`แถบขยับ (x ${a.x} → ${b.x})`) : fail(`แถบค้างนิ่ง: ${JSON.stringify([a, b])}`);
    a && a.dot !== "none" ? pass("จุดในป้ายกำลังโหลดกะพริบ") : fail("จุดในป้ายไม่กะพริบ");
    await page.waitForTimeout(7000);
    (await sample()) === null ? pass("โหลดเสร็จแล้วแถบหายไป") : fail("โหลดเสร็จแล้วแถบยังค้าง");
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
