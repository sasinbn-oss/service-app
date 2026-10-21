// ทดสอบ: ลากลงเพื่อรีเฟรช + ปุ่ม "มีอัปเดต" แบบ Facebook + ปุ่มรีเฟรชค้างหน้าเดิม (ต.ค. 69)
//   · มือถือ: ลากรายการใบงานลงจากบนสุด (touch จริงผ่าน CDP) → รีเฟรชในหน้า ไม่โหลดทั้งเว็บ
//     แก้ใบงานในฐานข้อมูลก่อนลาก → ขึ้น "อัปเดตแล้ว · ใหม่ 1 ใบงาน" และใบนั้นมีป้าย "อัปเดต"
//   · เช็คเบื้องหลัง (กลับมาเปิดแท็บ) เจอของใหม่ → ไม่สลับรายการเอง แต่ขึ้นปุ่ม "มีอัปเดต 1 ใบงาน" → กดแล้วขึ้นของใหม่
//   · จอคอม: ปุ่มรีเฟรชในหน้าที่เคยโหลดทั้งเว็บแล้วเด้งกลับหน้าแรก (ผู้ใช้ · แผนงาน) → ค้างหน้าเดิม
// ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup } = require("./fixture");

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  let fx = null;
  const login = async (page, vis) => {
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
  };
  try {
    fx = await setup();
    const w1 = await fx.workOrder("C0006", null);
    const w2 = await fx.workOrder("C0006", null);
    // ด่วน = ขึ้นบนสุดของรายการ ไม่ต้องเลื่อนหา (รายการวาดเฉพาะช่วงที่เห็น)
    fx.sql(`update "WorkOrder" set priority='URGENT' where id in (${w1.id},${w2.id})`);

    // ── มือถือ ──
    const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    await login(page, vis);
    await vis("ใบงาน").last().click();
    await page.waitForTimeout(3000);
    await vis("ทั้งหมด").first().click();
    await page.waitForTimeout(2500);
    // ยังไม่มีของใหม่ = ปุ่มต้องมองไม่เห็นเลย (iOS เคยโผล่ "มีอัปเดต 0 รายการ" ทับแถบชื่อหน้า)
    const ghost = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-label="ดูข้อมูลที่อัปเดต"]')].filter((e) => {
        let o = 1;
        for (let n = e; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
        return o > 0.01;
      }).length
    );
    ghost === 0 ? pass("ไม่มีของใหม่ = ไม่เห็นปุ่มมีอัปเดตเลย") : fail(`เห็นปุ่มมีอัปเดตทั้งที่ไม่มีของใหม่ (${ghost})`);
    // ตัวบอกว่าไม่ได้โหลดทั้งเว็บใหม่ — โหลดใหม่แล้วตัวแปรนี้หาย
    await page.evaluate(() => (window.__noReload = 1));

    const cdp = await ctx.newCDPSession(page);
    const pull = async () => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 330 }] });
      for (let y = 340; y <= 640; y += 20) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y }] });
        await page.waitForTimeout(16);
      }
      await page.screenshot({ path: path.join(DIR, "pull-1-dragging.png") });
      // ระหว่างลาก: เนื้อหาเลื่อนลงตามนิ้ว (กล่องเลื่อนถูกขยับ) และวงหมุนโผล่ชัด
      const hint = await page.evaluate(() => {
        const moved = [...document.querySelectorAll("div")].some((d) => /translate3d\(0px, [1-9]\d*(\.\d+)?px/.test(d.style.transform));
        const ball = document.querySelector('[aria-label="ลากรีเฟรช"]');
        return moved && ball && Number(ball.style.opacity) > 0.9 ? 1 : 0;
      });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      return hint;
    };

    fx.sql(`update "WorkOrder" set title='ทดสอบลากรีเฟรช', "updatedAt"=now() where id=${w1.id}`);
    const hint = await pull();
    hint > 0 ? pass("ลากลงจากบนสุด → เนื้อหาเลื่อนตามนิ้ว วงหมุนโผล่") : fail("ลากแล้วเนื้อหาไม่ขยับ/ไม่มีวงหมุน");
    await page.waitForTimeout(1100);
    const doneText = await page.getByText(/^อัปเดตแล้ว · ใหม่ \d+ ใบงาน$|^ข้อมูลล่าสุดแล้ว$/).locator("visible=true").allTextContents();
    await page.screenshot({ path: path.join(DIR, "pull-2-done.png") });
    doneText.some((t) => /ใหม่ [1-9]\d* ใบงาน/.test(t)) ? pass(`ปล่อยแล้วรีเฟรช บอกผล "${doneText[0]}"`) : fail(`ผลหลังลาก: ${doneText.join(",") || "ไม่มี"}`);
    (await page.evaluate(() => window.__noReload)) === 1 ? pass("ลากแล้วไม่โหลดทั้งเว็บใหม่ (ยังอยู่หน้ารายการ)") : fail("เว็บถูกโหลดใหม่");
    (await vis("ทดสอบลากรีเฟรช", false).count()) > 0 ? pass("ใบที่แก้ในฐานข้อมูลขึ้นข้อมูลใหม่หลังลาก") : fail("ไม่เห็นข้อมูลใหม่");
    (await vis(" อัปเดต", false).count()) + (await vis("อัปเดต").count()) > 0 ? pass("ใบที่เปลี่ยนมีป้าย อัปเดต") : fail("ไม่มีป้ายอัปเดต");

    // เช็คเบื้องหลัง: ไม่สลับรายการเอง แต่ขึ้นปุ่ม
    await page.waitForTimeout(3000);
    // แตะ updatedAt ด้วยแบบที่แอปจริงทำผ่าน Prisma — ตัวเช็คเบื้องหลังถามลายนิ้วมือ (/work-orders/version) ก่อน
    // แก้ด้วย SQL ตรง ๆ โดยไม่แตะ updatedAt ลายนิ้วมือจะไม่เปลี่ยน (ของจริงไม่มีทางแก้แบบนั้น)
    fx.sql(`update "WorkOrder" set title='ทดสอบปุ่มมีอัปเดต', "updatedAt"=now() where id=${w2.id}`);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(2500);
    (await page.getByText(/^มีอัปเดต 1 ใบงาน$/).locator("visible=true").count()) > 0
      ? pass("เช็คเบื้องหลังเจอของใหม่ → ขึ้นปุ่ม \"มีอัปเดต 1 ใบงาน\"")
      : fail("ไม่ขึ้นปุ่มมีอัปเดต");
    (await vis("ทดสอบปุ่มมีอัปเดต", false).count()) === 0 ? pass("ยังไม่สลับรายการให้เองก่อนกดปุ่ม") : fail("รายการสลับเองทั้งที่ยังไม่กด");
    await page.screenshot({ path: path.join(DIR, "pull-3-pill.png") });
    // หน้ารายการอีกชุด (อีกสแตกของเมนู) ค้างอยู่ใต้หน้าที่เปิด — เอาปุ่มของหน้าที่เห็นจริง (อันล่าง)
    await page.locator('[aria-label="ดูข้อมูลที่อัปเดต"]').locator("visible=true").last().click();
    await page.waitForTimeout(1500);
    (await vis("ทดสอบปุ่มมีอัปเดต", false).count()) > 0 ? pass("กดปุ่มแล้วขึ้นข้อมูลใหม่") : fail("กดปุ่มแล้วไม่เห็นข้อมูลใหม่");
    // นับเฉพาะปุ่มที่อยู่ใต้แถบบน (ของหน้าที่เห็นจริง) — ปุ่มของหน้าที่ค้างอยู่ข้างหลังจมใต้แถบบน
    const pillsLeft = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-label="ดูข้อมูลที่อัปเดต"]')].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.top > 60 && r.height > 0;
      }).length
    );
    pillsLeft === 0 ? pass("กดแล้วปุ่มหายไป") : fail("ปุ่มยังอยู่");
    await page.screenshot({ path: path.join(DIR, "pull-4-applied.png") });

    // ── เมนูข้างเปิดอยู่: ลากลงบนเมนูต้องไม่ลากเมนูลงมา และไม่รีเฟรชหน้าข้างหลัง (เจ้าของงานเจอบนมือถือ ต.ค. 69) ──
    await page.locator('[aria-label="เปิดเมนู"]').locator("visible=true").first().click();
    await page.waitForTimeout(900);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 120, y: 300 }] });
    for (let y = 310; y <= 610; y += 20) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 120, y }] });
      await page.waitForTimeout(16);
    }
    const onMenu = await page.evaluate(() => ({
      menu: document.getElementById("side-menu")?.style.transform ?? "ไม่มีเมนู",
      ball: Number(document.querySelector('[aria-label="ลากรีเฟรช"]')?.style.opacity ?? 0),
    }));
    await page.screenshot({ path: path.join(DIR, "pull-6-menu.png") });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    !onMenu.menu && onMenu.ball === 0
      ? pass("เมนูข้างเปิดอยู่ ลากลงบนเมนู: เมนูไม่เลื่อนตาม ไม่มีวงรีเฟรช")
      : fail(`ลากบนเมนู: transform="${onMenu.menu}" วง=${onMenu.ball}`);
    await ctx.close();

    // ── จอคอม: หน้าที่เคยเด้งกลับหน้าแรก ──
    const desk = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    desk.on("pageerror", (e) => errors.push(String(e)));
    const dvis = (t, exact = true) => desk.getByText(t, { exact }).locator("visible=true");
    await login(desk, dvis);
    for (const [menu, title] of [["แผนงาน", "แผนงาน"], ["ติดตามเครื่องเสีย", "ติดตามเครื่องเสีย"], ["สิทธิ์ผู้ใช้", "สิทธิ์ผู้ใช้"]]) {
      const item = desk.locator(`[aria-label="${menu}"]`).locator("visible=true");
      if ((await item.count()) === 0) { fail(`หาเมนู ${menu} ไม่เจอ`); continue; }
      await item.first().click();
      await desk.waitForTimeout(2500);
      await desk.evaluate(() => (window.__noReload = 1));
      await desk.locator('[aria-label="รีเฟรชข้อมูล"]').locator("visible=true").first().click();
      await desk.waitForTimeout(1200);
      const label = await desk.getByText(/^อัปเดตแล้ว|^ข้อมูลล่าสุดแล้ว$/).locator("visible=true").allTextContents();
      const stayed = (await desk.evaluate(() => window.__noReload)) === 1;
      stayed && label.length ? pass(`${menu}: กดรีเฟรชแล้วค้างหน้าเดิม ขึ้น "${label[0]}"`) : fail(`${menu}: ${stayed ? "ไม่ขึ้นผล" : "โหลดทั้งเว็บใหม่"}`);
    }
    await desk.screenshot({ path: path.join(DIR, "pull-5-desk.png") });
  } catch (e) {
    fail(String(e).slice(0, 900));
  } finally {
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
