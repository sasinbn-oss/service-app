// ทดสอบ: หน้าต่างที่มีปุ่มขยาย เปิดมาขนาดปกติ (เจ้าของงานขอกลับ ต.ค. 69 หลังลองแบบเปิดมาขยาย)
//        ยกเว้นหน้าต่างใบงานบนจอคอม เปิดมาขยาย (เจ้าของงานขอ ปลาย ต.ค. 69)
//        · กดสลับขนาดได้จริง · กดกลับได้ขนาดเดิม · เปลี่ยนไว้แล้วปิด เปิดใหม่กลับมาขนาดเริ่มต้น · ทั้งหน้าต่างใบงาน (PopupScreen) และฟอร์มเดี่ยว (AppModal) · มือถือ + จอคอม
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
    /**
     * startMax: หน้าต่างใบงานบนจอคอมเปิดมาขยาย (เจ้าของงานขอ ปลาย ต.ค. 69) — ที่เหลือเปิดมาขนาดปกติ
     * ทุกแบบต้อง: ขยาย/ย่อสลับได้จริง ขนาดเปลี่ยนจริง และปิดแล้วเปิดใหม่กลับมาขนาดเริ่มต้นของมันเสมอ
     */
    async function check(what, title, open, closeIt, startMax = false) {
      const [first, second] = startMax ? [shrinkBtn, growBtn] : [growBtn, shrinkBtn];
      const atStart = async () => (await first().count()) > 0 && (await second().count()) === 0;
      const startText = startMax ? "ขยายเต็มกรอบ" : "ขนาดปกติ";
      await open();
      await page.waitForTimeout(1500);
      const a = await size(title);
      (await atStart())
        ? pass(`${name} · ${what}: เปิดมา${startText} (${a?.w}×${a?.h})`)
        : fail(`${name} · ${what}: ไม่ได้เปิดมา${startText}`);
      await first().click();
      await page.waitForTimeout(1200);
      const b = await size(title);
      const [small, big] = startMax ? [b, a] : [a, b];
      small && big && small.h > 150 && (big.h > small.h || big.w > small.w) && (await second().count()) > 0
        ? pass(`${name} · ${what}: สลับขนาดได้จริง (${small.w}×${small.h} ↔ ${big.w}×${big.h})`)
        : fail(`${name} · ${what}: ขนาด ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
      await second().click();
      await page.waitForTimeout(1200);
      const again = await size(title);
      again && Math.abs(again.h - a.h) < 4 && Math.abs(again.w - a.w) < 4
        ? pass(`${name} · ${what}: กดกลับได้ขนาดเดิม`)
        : fail(`${name} · ${what}: กดกลับได้ ${JSON.stringify(again)} จาก ${JSON.stringify(a)}`);
      await first().click();
      await page.waitForTimeout(1000);
      await closeIt();
      await page.waitForTimeout(1500);
      await open();
      await page.waitForTimeout(1500);
      (await atStart())
        ? pass(`${name} · ${what}: เปลี่ยนขนาดไว้แล้วปิด เปิดใหม่กลับมา${startText}`)
        : fail(`${name} · ${what}: เปิดใหม่ไม่ได้${startText}`);
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
    // มือถือเป็นแผ่นเลื่อนจากล่าง ไม่เปิดมาขยาย
    await check("หน้าต่างใบงาน", "ใบงานซ่อม", () => vis(code).first().click(), closeBtn, name === "จอคอม");

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
