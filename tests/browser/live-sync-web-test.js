// ทดสอบ: สองคนเปิดใบงานเดียวกัน + รุ่นแอปใหม่ (ต.ค. 69)
//   · ปุ่ม "รีเฟรช" บนหน้าใบงานโหลดใหม่จริง
//   · อีกคนเปลี่ยนขั้น → หน้าจอนี้โหลดใหม่เองพร้อมบอกชื่อ (ใช้เหตุการณ์กลับมาที่แท็บแทนรอ 20 วิ)
//   · เปิดฟอร์มค้างอยู่ → ไม่โหลดทับ ขึ้นแถบเหลือง · กดบันทึกทับ → 409 บอกชื่อ ฐานข้อมูลไม่เปลี่ยน
//   · version.json รุ่นใหม่ → ปุ่มอัปเดตบนแถบบน ไม่โหลดเอง กดแล้วค่อยโหลด · build เก่ากว่า minBuiltAt = หน้า "ต้องอัปเดต"
// ต้องมี DATABASE_URL · เขียน mobile/public/version.json ชั่วคราวแล้วลบทิ้ง
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const VERSION_FILE = path.join(DIR, "..", "..", "mobile", "public", "version.json");
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
  try {
    fx = await setup();
    const branch = fx.sql(`select code from "Branch" where code like 'C%' and "cancelledAt" is null and region is not null order by code limit 1`);
    const board = fx.part("SP-BOARD");
    const wo = await fx.workOrder(branch, [{ sparePartId: board, quantity: 1 }]);
    const db = (f) => fx.sql(`select ${f} from "WorkOrder" where id=${wo.id}`);
    const aName = fx.sql(`select name from "User" where "employeeCode"='A001'`);

    const open = async (code) => {
      const ctx = await browser.newContext({ viewport: { width: 420, height: 1000 } });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await page.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").click();
      await page.waitForTimeout(3500);
      await page.getByText("ใบงาน", { exact: true }).locator("visible=true").last().click();
      await page.waitForTimeout(2500);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(wo.code);
      await page.waitForTimeout(2500);
      await page.getByText(wo.code, { exact: true }).locator("visible=true").last().click();
      await page.waitForTimeout(3000);
      return page;
    };
    const shown = (page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    const has = async (page, t) => (await page.getByText(t, { exact: false }).locator("visible=true").count()) > 0;

    const page = await open("S001");

    // ① ปุ่มรีเฟรชบนหน้าใบงาน
    await fx.call(fx.A, "PATCH", `/work-orders/${wo.id}`, { symptom: "แก้จากอีกเครื่อง-1" });
    await page.locator('[aria-label="รีเฟรชข้อมูล"]').locator("visible=true").first().click();
    await page.waitForTimeout(2500);
    (await has(page, "แก้จากอีกเครื่อง-1")) ? pass("ปุ่มรีเฟรชบนหน้าใบงานโหลดข้อมูลใหม่จริง") : fail("กดรีเฟรชแล้วข้อมูลไม่เปลี่ยน");

    // ② อีกคนเปลี่ยนขั้น → โหลดเองพร้อมบอกชื่อ
    await fx.source(wo.id);
    await shown(page);
    await page.waitForTimeout(2500);
    (await has(page, `${aName} อัปเดตใบงานนี้`)) && (await has(page, "หัวหน้าภาค · นัดวันเข้า"))
      ? pass("อีกคนเปลี่ยนขั้น → หน้าจอนี้โหลดใหม่เอง บอกว่าใครเปลี่ยน")
      : fail("ไม่โหลดเอง / ไม่บอกชื่อ");
    await page.waitForTimeout(4000);

    // ③ ฟอร์มเปิดค้าง → แถบเหลือง ไม่โหลดทับ · บันทึกทับ → 409
    await page.getByText("แก้ไขอาการ/สถานะ", { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(1000);
    await page.getByLabel("ชื่อผู้ติดต่อ").locator("visible=true").fill("คุณทับ");
    await fx.call(fx.A, "PATCH", `/work-orders/${wo.id}`, { symptom: "แก้จากอีกเครื่อง-2" });
    await shown(page);
    await page.waitForTimeout(2000);
    (await page.getByLabel("ชื่อผู้ติดต่อ").locator("visible=true").inputValue()) === "คุณทับ"
      ? pass("ฟอร์มเปิดค้าง → ไม่โหลดทับที่กำลังพิมพ์") : fail("ที่พิมพ์ถูกล้าง");
    await page.getByText("บันทึก", { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(2500);
    (await has(page, `${aName} แก้ใบงานนี้ไปแล้ว`)) && db(`coalesce("contactName",'-')`) !== "คุณทับ"
      ? pass("บันทึกทับ → ปฏิเสธ บอกว่าใครแก้ไปก่อน (ฐานข้อมูลไม่เปลี่ยน)") : fail(`บันทึกทับได้: ${db(`"contactName"`)}`);
    await page.screenshot({ path: path.join(DIR, "live-conflict.png") });
    await page.getByText("บันทึก", { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(2500);
    db(`"contactName"`) === "คุณทับ" ? pass("โหลดใหม่แล้วกดบันทึกอีกครั้ง → บันทึกได้ (ฐานข้อมูล)") : fail(`บันทึกรอบสองไม่ได้: ${db(`"contactName"`)}`);
    await page.waitForTimeout(3500);

    // ④ แถบเหลืองตอนฟอร์มเปิด
    await page.getByText("แก้ไขอาการ/สถานะ", { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(1000);
    await fx.call(fx.A, "PATCH", `/work-orders/${wo.id}`, { symptom: "แก้จากอีกเครื่อง-3" });
    await shown(page);
    await page.waitForTimeout(2000);
    await page.getByText("ยกเลิก", { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(2500);
    (await has(page, "แก้จากอีกเครื่อง-3")) ? pass("ปิดฟอร์มแล้ว → โหลดของที่ค้างไว้ให้เอง") : fail("ปิดฟอร์มแล้วยังเป็นของเก่า");

    // ⑤ รุ่นแอปใหม่ — ขึ้นปุ่มให้กดเอง ไม่โหลดหน้าใหม่ให้เอง (เจ้าของงานขอ ต.ค. 69: กำลังใช้อยู่แล้วหน้าเด้ง)
    await page.evaluate(() => (window.__mark = 1));
    fs.writeFileSync(VERSION_FILE, JSON.stringify({ commit: "test-new", builtAt: new Date().toISOString(), minBuiltAt: null }));
    await shown(page);
    await page.waitForTimeout(6000);
    const updBtn = page.locator('[aria-label="มีระบบรุ่นใหม่ กดเพื่ออัปเดต"]').locator("visible=true");
    (await page.evaluate(() => window.__mark)) === 1 && (await updBtn.count()) > 0
      ? pass("version.json รุ่นใหม่ → ขึ้นปุ่มอัปเดตบนแถบบน หน้าไม่โหลดใหม่เอง")
      : fail(`รุ่นใหม่: mark=${await page.evaluate(() => window.__mark)} ปุ่ม=${await updBtn.count()}`);
    await page.screenshot({ path: path.join(DIR, "live-update-button.png") });
    await shown(page);
    await page.waitForTimeout(3000);
    (await page.evaluate(() => window.__mark)) === 1 && (await has(page, "แก้จากอีกเครื่อง-3"))
      ? pass("ยังไม่กด — ใช้หน้าเดิมต่อได้ (เช็คซ้ำแล้วก็ไม่โหลดเอง)") : fail("หน้าโหลดใหม่เองทั้งที่ยังไม่กด");
    await updBtn.first().click();
    await page.waitForTimeout(6000);
    (await page.evaluate(() => window.__mark)) === undefined ? pass("กดปุ่มอัปเดต → โหลดหน้าใหม่") : fail("กดแล้วไม่โหลดหน้าใหม่");
    fs.writeFileSync(VERSION_FILE, JSON.stringify({ commit: "test-must", builtAt: new Date().toISOString(), minBuiltAt: "2999-01-01T00:00:00.000Z" }));
    await shown(page);
    await page.waitForTimeout(2500);
    (await page.locator('[aria-label="ต้องอัปเดตก่อนใช้งานต่อ"]').count()) > 0 ? pass("build เก่ากว่า minBuiltAt → หน้า \"ต้องอัปเดตก่อนใช้งานต่อ\"") : fail("ไม่บังคับอัปเดต");
    await page.screenshot({ path: path.join(DIR, "live-must-update.png") });
  } catch (e) {
    fail(String(e).slice(0, 500));
  } finally {
    try { fs.unlinkSync(VERSION_FILE); } catch {}
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
