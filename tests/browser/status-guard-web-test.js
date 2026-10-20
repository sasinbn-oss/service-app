// ทดสอบ: ป้ายสถานะย่อยใต้ขั้นปัจจุบัน + ฟอร์มแก้ไขสถานะแบบใหม่ (ต.ค. 69)
//   · ขั้นเบิกอะไหล่ยังไม่เช็คคลัง → ป้ายม่วง "รอแอดมินเช็คอะไหล่"
//   · ฟอร์มแก้ไข: เลือกได้แค่ อัตโนมัติ / รอลูกค้าแจ้งซ่อม · รอลูกค้าต้องมีเหตุผล (ไม่มี = กดบันทึกไม่ได้)
//   · บันทึกแล้ว ฐานข้อมูลเปลี่ยน · ป้ายเปลี่ยนเป็น "รอลูกค้าแจ้งซ่อม" · ประวัติขึ้น "เปลี่ยนสถานะ"
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
    const branch = fx.sql(`select code from "Branch" where code like 'C%' and "cancelledAt" is null and region is not null order by code limit 1`);
    const wo = await fx.workOrder(branch, [{ sparePartId: fx.part("SP-BOARD"), quantity: 1 }]);
    const db = (f) => fx.sql(`select ${f} from "WorkOrder" where id=${wo.id}`);
    db(`"workStatus"`) === "CHECKING_PARTS" ? pass("ใบงานอยู่ขั้นเบิกอะไหล่ สถานะ CHECKING_PARTS (ฐานข้อมูล)") : fail(`สถานะ: ${db(`"workStatus"`)}`);

    const page = await browser.newPage({ viewport: { width: 420, height: 1000 } });
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

    const sub = () => page.locator('[aria-label="สถานะย่อย"]').locator("visible=true");
    // สถานะเดียว (ต.ค. 69) — สถานะอัตโนมัติไม่ขึ้นเป็นป้ายย่อยแล้ว ขึ้นเฉพาะ "รอลูกค้า…" ที่คนตั้งเอง (ข้างล่าง)
    (await sub().count()) === 0
      ? pass("ไม่มีป้ายสถานะย่อยอัตโนมัติ (ใบงานแสดงสถานะเดียว)")
      : fail(`ป้ายสถานะย่อย: ${await sub().count()}`);

    await vis("แก้ไข").last().click();
    await page.waitForTimeout(1000);
    (await vis("รออะไหล่", false).count()) > 0 && (await label("สถานะรอลูกค้าแจ้งซ่อม").count()) > 0
      ? pass("ฟอร์มมีแค่ อัตโนมัติ / รอลูกค้าแจ้งซ่อม · บอกว่าค่าไหนระบบตั้ง")
      : fail("ฟอร์มสถานะไม่ตรง");
    await label("สถานะรอลูกค้าแจ้งซ่อม").click();
    await page.waitForTimeout(300);
    await vis("บันทึก").last().click();
    await page.waitForTimeout(1500);
    db(`"workStatus"`) === "CHECKING_PARTS" ? pass("ยังไม่ใส่เหตุผล กดบันทึกแล้วไม่เปลี่ยน") : fail("บันทึกได้ทั้งที่ไม่มีเหตุผล");
    await label("เหตุผลที่รอลูกค้า").fill("ร้านปิดปรับปรุงถึง 20 ต.ค.");
    await page.screenshot({ path: path.join(DIR, "status-guard-form.png") });
    await vis("บันทึก").last().click();
    await page.waitForTimeout(3000);
    db(`"workStatus"`) === "WAITING_CUSTOMER" ? pass("มีเหตุผล บันทึกได้ (ฐานข้อมูล)") : fail(`สถานะ: ${db(`"workStatus"`)}`);
    fx.sql(`select note from "WorkOrderLog" where "workOrderId"=${wo.id} and action='STATUS_CHANGED'`).includes("ร้านปิดปรับปรุงถึง 20 ต.ค.")
      ? pass("ประวัติบันทึกเหตุผล (ฐานข้อมูล)") : fail("ประวัติไม่มีเหตุผล");
    await page.waitForTimeout(3500);
    (await sub().count()) === 1 && (await sub().first().innerText()).trim() === "รอลูกค้าแจ้งซ่อม"
      ? pass("ป้ายสถานะย่อยเปลี่ยนเป็น รอลูกค้าแจ้งซ่อม")
      : fail("ป้ายไม่เปลี่ยน");
    await page.screenshot({ path: path.join(DIR, "status-guard-bar.png"), fullPage: true });
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
