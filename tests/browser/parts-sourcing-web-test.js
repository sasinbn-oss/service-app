// ทดสอบ: ขั้น "รอแอดมินเช็คอะไหล่" (ก่อนเสนอราคา) ผ่านหน้าจอแอดมิน
//   · ใบงานสาขาแฟรนไชส์หมดประกัน + ใช้อะไหล่ → รอแอดมินเช็คอะไหล่ (ฐานข้อมูล)
//   · ปุ่มยืนยันกดไม่ได้จนตอบครบ · ตอบ "หมด" → ปุ่มเป็น "อะไหล่หมด — รอของเข้า" → ค้างที่ขั้นนี้ หน้าใบงานบอกว่ารอของตัวไหน
//   · เปิดใหม่ตอบ "มีอะไหล่" → ต้องเลือกคลังก่อน (หัวหน้าภาคใช้นัดวัน) → ปุ่ม "มีครบ — ไปเสนอราคา" → ไปรอเสนอราคา (ฐานข้อมูล)
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
  try {
    fx = await setup();
    // สาขาแฟรนไชส์ที่หมดประกันแน่ ๆ (เปิดเกิน 3 ปี) — เครื่อง Oasis ในใบทดสอบประกัน 2 ปี
    const branch = fx.sql(`select code from "Branch" where code like 'D%' and "cancelledAt" is null and region is not null and "openedAt" < now() - interval '3 years' order by "openedAt" limit 1`);
    if (!branch) throw new Error("ไม่มีสาขา D ที่หมดประกันในฐานข้อมูล");
    const pid = fx.part("SP-BOARD");
    const wo = await fx.workOrder(branch, [{ sparePartId: pid, quantity: 1 }]);
    const db = (f) => fx.sql(`select ${f} from "WorkOrder" where id=${wo.id}`);
    db("status") === "PARTS_SOURCING" ? pass("ใบงานแฟรนไชส์หมดประกัน + ใช้อะไหล่ → รอแอดมินเช็คอะไหล่ (ฐานข้อมูล)") : fail(`สถานะ: ${db("status")}`);

    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true").last();
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await vis("ใบงาน").last().click();
    await page.waitForTimeout(2500);
    await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(wo.code);
    await page.waitForTimeout(2500);
    await vis(wo.code).last().click();
    await page.waitForTimeout(3000);

    (await vis("แอดมิน · เช็คอะไหล่ (มี/หมด)").count()) > 0 ? pass("ป้ายสถานะ: แอดมิน · เช็คอะไหล่ (มี/หมด)") : fail("ไม่ขึ้นป้ายรอแอดมินเช็คอะไหล่");
    // ปุ่มหัวหน้าภาค/แอดมินปิดเอง "ปิดงาน — เครื่องใช้งานได้แล้ว" เอาออกแล้ว (เจ้าของงานขอ ต.ค. 69)
    (await vis("ปิดงาน — เครื่องใช้งานได้แล้ว", false).count()) === 0 ? pass("ไม่มีปุ่ม \"ปิดงาน — เครื่องใช้งานได้แล้ว\" แล้ว") : fail("ยังมีปุ่มปิดงาน — เครื่องใช้งานได้แล้ว");
    // ปุ่มขั้นอยู่ท้ายการ์ดขั้นปัจจุบัน — แถบขั้นตอนใช้ชื่อสั้น "เช็คอะไหล่" แล้ว ตัวแรกที่ชื่อตรงคือหัวการ์ดซึ่งกดไม่ได้
    await vis("เช็คอะไหล่ (มี/หมด)").last().click();
    await page.waitForTimeout(1200);
    const save = () => page.getByText(/^(ยืนยัน|อะไหล่หมด — รอของเข้า|มีครบ — ไปเสนอราคา)$/).locator("visible=true").last();
    await save().click();
    await page.waitForTimeout(800);
    db("status") === "PARTS_SOURCING" ? pass("ยังไม่ตอบว่ามีหรือหมด กดยืนยันแล้วไม่ไปไหน") : fail("ผ่านทั้งที่ยังไม่ตอบ");

    await page.locator('[aria-label^="หมด "]').locator("visible=true").last().click();
    await page.waitForTimeout(500);
    (await vis("อะไหล่หมด — รอของเข้า").count()) > 0 ? pass("ตอบว่าหมด → ปุ่มเป็น \"รอของเข้า\"") : fail("ปุ่มไม่เปลี่ยนเป็นรอของเข้า");
    await page.screenshot({ path: path.join(DIR, "parts-sourcing-form.png") });
    await vis("อะไหล่หมด — รอของเข้า").last().click();
    await page.waitForTimeout(3000);
    db("status") === "PARTS_SOURCING" &&
    fx.sql(`select "inStock" from "WorkOrderPart" where "workOrderId"=${wo.id} and kind='WAITING'`) === "f"
      ? pass("รอของเข้า: ใบงานค้างที่รอแอดมินเช็คอะไหล่ บันทึกว่าหมด (ฐานข้อมูล)")
      : fail(`หลังรอของเข้า: ${db("status")}`);
    (await vis("อะไหล่หมด 1 รายการ", false).count()) > 0 ? pass("หน้าใบงานบอกว่าอะไหล่หมดกี่รายการ ตัวไหน") : fail("ไม่บอกว่ารอของตัวไหน");
    await page.screenshot({ path: path.join(DIR, "parts-sourcing-waiting.png"), fullPage: true });

    // ของหมดอยู่ ปุ่มขั้นนี้เปลี่ยนเป็น "อะไหล่มาแล้ว — อัปเดตสถานะ"
    await vis("อะไหล่มาแล้ว — อัปเดตสถานะ").first().click();
    await page.waitForTimeout(1200);
    await page.locator('[aria-label^="มีของ "]').locator("visible=true").last().click();
    await page.waitForTimeout(500);
    (await vis("มีครบ — ไปเสนอราคา").count()) > 0 ? pass("ของมาแล้ว ตอบมีของ → ปุ่มเป็น \"มีครบ — ไปเสนอราคา\"") : fail("ปุ่มไม่เปลี่ยน");
    await vis("มีครบ — ไปเสนอราคา").last().click();
    await page.waitForTimeout(1200);
    db("status") === "PARTS_SOURCING" ? pass("มีของแต่ยังไม่เลือกคลัง กดแล้วไม่ไปไหน") : fail("ผ่านทั้งที่ไม่บอกคลัง");
    // คลังที่มีของ — dropdown ค้นได้ แยกกลุ่มคลังส่งมอบ / คลังอื่น
    await vis("อยู่คลังไหน").last().click();
    await page.waitForTimeout(800);
    await page.getByPlaceholder("ค้นหา").locator("visible=true").first().fill("ลาดพร้าว");
    await page.waitForTimeout(800);
    const opt = page.getByText("คลังลาดพร้าว 94", { exact: true }).locator("visible=true").last();
    await opt.click().catch(async () => {
      await opt.evaluate((n) => (n.closest("[tabindex]") || n).click());
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(DIR, "parts-sourcing-ready.png") });
    await vis("มีครบ — ไปเสนอราคา").last().click();
    await page.waitForTimeout(3000);
    fx.sql(`select warehouse from "WorkOrderPart" where "workOrderId"=${wo.id} and kind='WAITING'`) === "คลังลาดพร้าว 94"
      ? pass("บันทึกคลังที่มีของ (ฐานข้อมูล)") : fail("คลังไม่ถูกบันทึก");
    db("status") === "AWAITING_QUOTE" ? pass("ไปขั้นรอเสนอราคา (ฐานข้อมูล)") : fail(`สถานะ: ${db("status")}`);
    (await vis("แอดมิน · ส่งใบเสนอราคา").count()) > 0 ? pass("หน้าใบงานขึ้นแอดมิน · ส่งใบเสนอราคา") : fail("หน้าใบงานไม่อัปเดต");
  } catch (e) {
    fail(String(e).slice(0, 300));
  } finally {
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
