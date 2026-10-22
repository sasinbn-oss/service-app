// ทดสอบ: เมนูข้างย่อกลุ่มได้ + โหมดมืด (เจ้าของงานขอ ต.ค. 69)
//   · ครั้งแรกกางแค่ "งานซ่อม" · กดหัวกลุ่มแล้วกาง และจำไว้หลังโหลดใหม่
//   · ย่อกลุ่มที่มีหน้าที่เปิดอยู่ หน้านั้นยังโชว์ (แถบฟ้าไม่หาย)
//   · สวิตช์ดวงจันทร์ขวาบน: เปิดแล้วพื้นเป็นสีมืดจริง จำไว้ ปิดแล้วกลับสว่าง · ไม่มี error ในหน้า
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, n) });
  const bg = (p) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  try {
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t) => page.getByText(t, { exact: true }).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(4000);

    (await vis("ระบบหลังบ้าน").count()) === 0 && (await vis("กล่องงานของฉัน").count()) === 1
      ? pass("ครั้งแรก: งานซ่อมกาง ผู้ดูแลระบบย่อ") : fail("ค่าเริ่มต้นของกลุ่มไม่ถูก");
    await shot(page, "menu-1-default.png");

    await page.getByLabel("กางกลุ่ม ผู้ดูแลระบบ").click();
    await page.waitForTimeout(500);
    (await vis("ระบบหลังบ้าน").count()) === 1 ? pass("กดหัวกลุ่ม → กาง") : fail("กดหัวกลุ่มแล้วไม่กาง");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(3500);
    (await vis("ระบบหลังบ้าน").count()) === 1 ? pass("โหลดใหม่ยังกางอยู่ (จำไว้)") : fail("ไม่จำการกาง");

    // หน้าแรกคือ "งานของฉันวันนี้" (กลุ่มงานซ่อม · ต.ค. 69) — ย่อกลุ่มแล้วรายการนี้ต้องยังอยู่
    await page.getByLabel("ย่อกลุ่ม งานซ่อม").click();
    await page.waitForTimeout(500);
    (await page.getByLabel("งานของฉันวันนี้", { exact: true }).locator("visible=true").count()) >= 1 && (await vis("กล่องงานของฉัน").count()) === 0
      ? pass("ย่องานซ่อม: เหลืองานของฉันวันนี้ (หน้าที่เปิด) ซ่อนกล่องงาน") : fail("ย่อกลุ่มที่มีหน้าเปิดอยู่ไม่ถูก");
    await shot(page, "menu-2-collapsed.png");
    await page.getByLabel("กางกลุ่ม งานซ่อม").click();

    // อยู่หน้ารายการใบงาน (ไม่ใช่หน้าแรก) แล้วสลับ — โหลดใหม่แล้วต้องอยู่หน้าเดิม ไม่เด้งกลับแผนงาน
    await vis("ใบงานซ่อม").first().click();
    await page.waitForTimeout(3000);
    const onList = () => page.getByPlaceholder(/ค้นรหัสใบงาน/).locator("visible=true").count();
    const light = await bg(page);
    await page.getByLabel("เปิดโหมดมืด").click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(4000);
    (await onList()) > 0 ? pass("สลับโหมดแล้วยังอยู่หน้ารายการใบงาน (ไม่เด้งกลับหน้าแรก)") : fail("สลับโหมดแล้วเด้งออกจากหน้าเดิม");
    const dark = await bg(page);
    dark === "rgb(11, 21, 32)" && light !== dark ? pass(`เปิดโหมดมืด: พื้น ${light} → ${dark}`) : fail(`พื้นไม่เปลี่ยน ${light} → ${dark}`);
    (await page.getByLabel("ปิดโหมดมืด").count()) ? pass("สวิตช์เป็นสถานะมืด") : fail("สวิตช์ไม่เปลี่ยนสถานะ");
    await shot(page, "dark-2-list.png");

    // มือถือ — บริบทใหม่แต่ตั้งค่ามืดไว้แล้ว เหมือนช่างที่เคยเปิดไว้
    const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
    // ตั้งเฉพาะครั้งแรก — สคริปต์นี้รันทุกครั้งที่โหลด ถ้าตั้งทับทุกครั้งจะปิดโหมดมืดไม่ได้
    await ctx.addInitScript(() => localStorage.getItem("otteri-theme") || localStorage.setItem("otteri-theme", "dark"));
    const m = await ctx.newPage();
    m.on("pageerror", (e) => errors.push(String(e)));
    await m.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    // แอดมินมีปุ่มบนแถบบนมากสุด (ดูในฐานะ) — ถ้าพอสำหรับแอดมินก็พอทุกคน
    await m.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await m.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await m.getByText("เข้าสู่ระบบ", { exact: true }).click();
    await m.waitForTimeout(4500);
    (await bg(m)) === "rgb(11, 21, 32)" ? pass("มือถือ: จำโหมดมืด") : fail("มือถือไม่มืด");
    await m.screenshot({ path: path.join(__dirname, "dark-3-phone.png") });
    // มือถือ: สวิตช์โหมดมืดย้ายไปท้ายเมนูเลื่อนออก (แถบหัวชั้นเดียว ต.ค. 69)
    await m.getByLabel("เปิดเมนู").locator("visible=true").first().click();
    await m.waitForTimeout(900);
    await m.screenshot({ path: path.join(__dirname, "dark-4-phone-menu.png") });
    const toggle = m.getByLabel("ปิดโหมดมืด").locator("visible=true");
    const box = await toggle.boundingBox();
    box && box.x >= 0 && box.x + box.width <= 400 && box.y + box.height <= 860
      ? pass(`สวิตช์อยู่ในเมนูบนจอมือถือ (x=${Math.round(box.x)}, y=${Math.round(box.y)})`) : fail(`สวิตช์ไม่อยู่ในจอ ${JSON.stringify(box)}`);

    await toggle.click();
    await m.waitForLoadState("networkidle");
    await m.waitForTimeout(4000);
    (await bg(m)) === light ? pass("ปิดโหมดมืด → กลับสว่าง") : fail(`ปิดแล้วพื้นเป็น ${await bg(m)}`);
    await m.screenshot({ path: path.join(__dirname, "light-3-phone.png") });

    errors.length ? fail(`error ในหน้า: ${errors.slice(0, 3).join(" | ")}`) : pass("ไม่มี error ในหน้า");
  } catch (e) {
    fail(String(e));
  } finally {
    await browser.close();
  }
})();
