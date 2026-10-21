// ทดสอบ: หน้าต่างทุกบานที่มีปุ่มขยาย เปิดมาแบบขยาย (เจ้าของงานเลือก ต.ค. 69)
//        · กดย่อครั้งแรกได้ขนาดปกติจริง (ไม่หดหายเป็น 0 — ตอนเปิดยังไม่เคยวัดขนาดปกติ) · กดขยายกลับได้
//        · ปิดแล้วเปิดใหม่กลับมาขยายอีก · ทั้งหน้าต่างใบงาน (PopupScreen) และฟอร์มเดี่ยว (AppModal) · มือถือ + จอคอม
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];

  for (const [name, vp] of [["มือถือ", { width: 400, height: 820 }], ["จอคอม", { width: 1280, height: 800 }]]) {
    const page = await browser.newPage({ viewport: vp });
    // เมนูข้างย่อกลุ่มที่ไม่ใช่ "งานซ่อม" ไว้ตั้งแต่แรก — เทสต์นี้กดรายการในกลุ่มอื่น จึงกางทุกกลุ่มไว้ก่อน
    await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t) => page.getByText(t, { exact: true }).locator("visible=true");
    const shrinkBtn = () => page.getByLabel("ย่อหน้าต่างกลับขนาดปกติ").locator("visible=true").last();
    const growBtn = () => page.getByLabel("ขยายหน้าต่างเต็มจอ").locator("visible=true").last();
    // ขนาดหน้าต่าง = กรอบที่มีหัวข้อหน้าต่างอยู่ข้างใน (ตัวที่ใหญ่สุดที่ยังเล็กกว่าจอ)
    const size = (title) =>
      page.evaluate((t) => {
        const head = [...document.querySelectorAll("div")].filter((d) => d.innerText === t && !d.children.length).pop();
        let el = head, best = null;
        while (el && el !== document.body) {
          const r = el.getBoundingClientRect();
          // กรอบหน้าต่างคือกล่องตัดขอบชั้นในสุดรอบหัวข้อ — ชั้นนอกกว่านั้นคือทั้งจอ
          if (getComputedStyle(el).overflow === "hidden" && r.width > 200) { best = { w: Math.round(r.width), h: Math.round(r.height) }; break; }
          el = el.parentElement;
        }
        return best;
      }, title);
    async function check(what, title, open, closeIt) {
      await open();
      await page.waitForTimeout(1500);
      const big = await size(title);
      (await shrinkBtn().count()) > 0 ? pass(`${name} · ${what}: เปิดมาแบบขยาย (${big?.w}×${big?.h})`) : fail(`${name} · ${what}: เปิดมาไม่ขยาย`);
      await shrinkBtn().click();
      await page.waitForTimeout(1200);
      const small = await size(title);
      small && big && small.h > 150 && (small.h < big.h || small.w < big.w) && (await growBtn().count()) > 0
        ? pass(`${name} · ${what}: กดย่อได้ขนาดปกติ (${small.w}×${small.h})`)
        : fail(`${name} · ${what}: ย่อแล้ว ${JSON.stringify(small)} จาก ${JSON.stringify(big)}`);
      await growBtn().click();
      await page.waitForTimeout(1200);
      const again = await size(title);
      again && Math.abs(again.h - big.h) < 4 && Math.abs(again.w - big.w) < 4
        ? pass(`${name} · ${what}: กดขยายกลับเท่าเดิม`)
        : fail(`${name} · ${what}: ขยายกลับได้ ${JSON.stringify(again)}`);
      await shrinkBtn().click();
      await page.waitForTimeout(1000);
      await closeIt();
      await page.waitForTimeout(1500);
      await open();
      await page.waitForTimeout(1500);
      (await shrinkBtn().count()) > 0 ? pass(`${name} · ${what}: ย่อไว้แล้วปิด เปิดใหม่กลับมาขยาย`) : fail(`${name} · ${what}: เปิดใหม่ยังย่ออยู่`);
      await closeIt();
      await page.waitForTimeout(1500);
    }

    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await (name === "มือถือ" ? vis("ใบงาน").last() : vis("ใบงานซ่อม").first()).click();
    await page.waitForTimeout(2500);
    const code = await page.evaluate(() => {
      const el = [...document.querySelectorAll("div")].find((d) => /^WO-\d{5}$/.test(d.innerText) && !d.children.length && d.getBoundingClientRect().top > 150);
      return el ? el.innerText : null;
    });
    const closeBtn = () => page.getByLabel("ปิด", { exact: true }).locator("visible=true").last().click();
    await check("หน้าต่างใบงาน", "ใบงานซ่อม", () => vis(code).first().click(), closeBtn);

    await (name === "มือถือ" ? vis("Admin").last() : vis("ระบบหลังบ้าน").first()).click();
    await page.waitForTimeout(2000);
    await vis("จัดการข้อมูลอะไหล่").last().click();
    await page.waitForTimeout(2000);
    await check("ฟอร์มเพิ่มอะไหล่", "เพิ่มอะไหล่ใหม่", () => vis("เพิ่มอะไหล่ใหม่").last().click(), closeBtn);
    await page.close();
  }

  errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
  await browser.close();
})();
