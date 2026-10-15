// ทดสอบ: ขั้น "รอเบิกอะไหล่" (ก่อนเสนอราคา) ผ่านหน้าจอแอดมิน
//   · ใบงานสาขาแฟรนไชส์หมดประกัน + ใช้อะไหล่ → รอเบิกอะไหล่ (ฐานข้อมูล)
//   · ปุ่มยืนยันกดไม่ได้จนตอบครบ · ตอบ "หมด" → ปุ่มเป็น "รอของเข้า" → ค้างที่ขั้นนี้ หน้าใบงานบอกว่ารอของตัวไหน
//   · เปิดใหม่ตอบ "มีของ" → ปุ่มเป็น "อะไหล่ครบ — ไปเสนอราคา" → ไปรอเสนอราคา (ฐานข้อมูล)
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
    db("status") === "PARTS_SOURCING" ? pass("ใบงานแฟรนไชส์หมดประกัน + ใช้อะไหล่ → รอเบิกอะไหล่ (ฐานข้อมูล)") : fail(`สถานะ: ${db("status")}`);

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

    (await vis("รอเบิกอะไหล่").count()) > 0 ? pass("ป้ายสถานะ: รอเบิกอะไหล่") : fail("ไม่ขึ้นป้ายรอเบิกอะไหล่");
    await vis("เช็คอะไหล่ก่อนเสนอราคา").first().click();
    await page.waitForTimeout(1200);
    const save = () => page.getByText(/^(ยืนยัน|รอของเข้า|อะไหล่ครบ — ไปเสนอราคา)$/).locator("visible=true").last();
    await save().click();
    await page.waitForTimeout(800);
    db("status") === "PARTS_SOURCING" ? pass("ยังไม่ตอบว่ามีหรือหมด กดยืนยันแล้วไม่ไปไหน") : fail("ผ่านทั้งที่ยังไม่ตอบ");

    await page.locator('[aria-label^="หมด "]').locator("visible=true").last().click();
    await page.waitForTimeout(500);
    (await vis("รอของเข้า").count()) > 0 ? pass("ตอบว่าหมด → ปุ่มเป็น \"รอของเข้า\"") : fail("ปุ่มไม่เปลี่ยนเป็นรอของเข้า");
    await page.screenshot({ path: path.join(DIR, "parts-sourcing-form.png") });
    await vis("รอของเข้า").last().click();
    await page.waitForTimeout(3000);
    db("status") === "PARTS_SOURCING" &&
    fx.sql(`select "inStock" from "WorkOrderPart" where "workOrderId"=${wo.id} and kind='WAITING'`) === "f"
      ? pass("รอของเข้า: ใบงานค้างที่รอเบิกอะไหล่ บันทึกว่าหมด (ฐานข้อมูล)")
      : fail(`หลังรอของเข้า: ${db("status")}`);
    (await vis("รอของเข้า 1 รายการ", false).count()) > 0 ? pass("หน้าใบงานบอกว่ารอของเข้ากี่รายการ ตัวไหน") : fail("ไม่บอกว่ารอของตัวไหน");
    await page.screenshot({ path: path.join(DIR, "parts-sourcing-waiting.png"), fullPage: true });

    await vis("เช็คอะไหล่ก่อนเสนอราคา").first().click();
    await page.waitForTimeout(1200);
    await page.locator('[aria-label^="มีของ "]').locator("visible=true").last().click();
    await page.waitForTimeout(500);
    (await vis("อะไหล่ครบ — ไปเสนอราคา").count()) > 0 ? pass("ของมาแล้ว ตอบมีของ → ปุ่มเป็น \"อะไหล่ครบ — ไปเสนอราคา\"") : fail("ปุ่มไม่เปลี่ยน");
    await vis("อะไหล่ครบ — ไปเสนอราคา").last().click();
    await page.waitForTimeout(3000);
    db("status") === "AWAITING_QUOTE" ? pass("ไปขั้นรอเสนอราคา (ฐานข้อมูล)") : fail(`สถานะ: ${db("status")}`);
    (await vis("รอเสนอราคาลูกค้า").count()) > 0 ? pass("หน้าใบงานขึ้นรอเสนอราคาลูกค้า") : fail("หน้าใบงานไม่อัปเดต");
  } catch (e) {
    fail(String(e).slice(0, 300));
  } finally {
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
