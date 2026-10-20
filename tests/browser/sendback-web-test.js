// ทดสอบ: ปิดงานไม่ได้ → ส่งกลับหัวหน้าภาค (หน้าจอ)
//   · เลือกหมวดเหตุ + ข้อความ → กลับขั้นแรก (ฐานข้อมูล) · กล่อง "ช่างส่งกลับ" · อะไหล่ที่เบิกแล้วยังอยู่
//   · แก้รายละเอียด (ผู้ติดต่อ) ได้ · ปุ่มขั้นนี้ตั้งต้นที่ "ต้องเข้าตรวจสอบหน้างานก่อน" ทีมเดิม → นัดตรวจ (ฐานข้อมูล)
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
    const branch = fx.sql(`select code from "Branch" where code like 'C%' and "cancelledAt" is null and region is not null and zone is not null order by code limit 1`);
    const team = fx.sql(`select zone from "Branch" where code='${branch}'`);
    const board = fx.part("SP-BOARD");
    const wo = await fx.workOrder(branch, [{ sparePartId: board, quantity: 1 }]);
    const S = await fx.login("S001");
    await fx.call(fx.A, "POST", `/work-orders/${wo.id}/parts-check`, {
      results: [{ sparePartId: board, inStock: true, warehouse: "คลังลาดพร้าว 94", requisitionNo: "RQ-WSB" }],
    });
    await fx.call(S, "POST", `/work-orders/${wo.id}/assign`, { team, scheduledAt: "2026-11-10" });
    await fx.call(fx.A, "POST", `/work-orders/${wo.id}/confirm-appointment`, {});
    await fx.call(S, "POST", `/work-orders/${wo.id}/dispatch`, {});
    const db = (f) => fx.sql(`select ${f} from "WorkOrder" where id=${wo.id}`);
    db("status") === "IN_PROGRESS" ? pass("เตรียมใบงานถึงขั้นช่างเข้างาน") : fail(`เตรียมไม่ถึง: ${db("status")}`);

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

    await vis("แจ้งปัญหาหน้างาน", false).last().click();
    await page.waitForTimeout(1000);
    (await vis("ปิดงานไม่ได้เพราะ").count()) > 0 ? pass("ฟอร์มส่งกลับมีหมวดเหตุ") : fail("ไม่มีหมวดเหตุ");
    await page.getByLabel("เจออะไรที่หน้างาน").locator("visible=true").last().fill("ไปถึงร้านปิด โทรไม่ติด");
    await vis("ส่งกลับ").last().click();
    await page.waitForTimeout(1500);
    db("status") === "IN_PROGRESS" ? pass("ยังไม่เลือกหมวด กดส่งกลับไม่ได้") : fail("ส่งกลับได้ทั้งที่ไม่เลือกหมวด");
    await label("เหตุ ร้านปิด / ลูกค้าไม่สะดวก").click();
    await page.waitForTimeout(300);
    await vis("ส่งกลับ").last().click();
    await page.waitForTimeout(3500);
    db("status") === "NEW" ? pass("ส่งกลับแล้ว ใบงานกลับไปขั้นแรก (ฐานข้อมูล)") : fail(`สถานะ: ${db("status")}`);
    fx.sql(`select "requisitionNo" from "WorkOrderPart" where "workOrderId"=${wo.id} and kind='WAITING'`) === "RQ-WSB"
      ? pass("อะไหล่ที่เบิกแล้วยังอยู่พร้อมเลขใบเบิก (ฐานข้อมูล)") : fail("อะไหล่ที่เบิกแล้วหาย");
    (await label("กล่องช่างส่งกลับ").count()) > 0 && (await vis("[ร้านปิด / ลูกค้าไม่สะดวก] ไปถึงร้านปิด โทรไม่ติด").count()) > 0
      ? pass("กล่อง \"ช่างส่งกลับ\" บอกหมวดและเหตุ") : fail("ไม่มีกล่องช่างส่งกลับ");
    await page.screenshot({ path: path.join(DIR, "sendback-banner.png") });
    await page.waitForTimeout(3500);

    // แก้รายละเอียด
    await vis("แก้ไข").last().click();
    await page.waitForTimeout(1000);
    await label("ชื่อผู้ติดต่อ").fill("คุณใหม่ทดสอบ");
    await vis("บันทึก").last().click();
    await page.waitForTimeout(3000);
    db(`"contactName"`) === "คุณใหม่ทดสอบ" ? pass("แก้ผู้ติดต่อได้ (ฐานข้อมูล)") : fail(`ผู้ติดต่อ: ${db(`"contactName"`)}`);
    await page.waitForTimeout(3500);

    // ขั้นนี้ — ตั้งต้นที่ส่งตรวจหน้างาน ทีมเดิม
    await vis("ระบุอะไหล่").first().click();
    await page.waitForTimeout(1200);
    (await vis("วันเข้าตรวจหน้างาน").count()) > 0 ? pass("เปิดมาตั้งต้นที่ \"ต้องเข้าตรวจสอบหน้างานก่อน\"") : fail("ไม่ได้ตั้งต้นที่ส่งตรวจ");
    // วันเข้าตรวจบังคับ (ต.ค. 69 รอบสอง) — เลือกวันที่ 15 ของเดือนหน้า
    await page.getByLabel("วันเข้าตรวจหน้างาน", { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(400);
    await page.getByLabel("เดือนถัดไป").last().click();
    await page.waitForTimeout(200);
    const target = fx.sql("select to_char(date_trunc('month', (now() at time zone 'Asia/Bangkok')) + interval '1 month' + interval '14 day','YYYY-MM-DD')");
    const [ty, tm] = target.split("-").map(Number);
    const M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const D = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
    await page.getByLabel(`${D[new Date(Date.UTC(ty, tm - 1, 15)).getUTCDay()]} 15 ${M[tm - 1]} ${ty + 543}`, { exact: true }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(DIR, "sendback-stage.png") });
    await page.getByText(/^(ยืนยัน|บันทึก)$/).locator("visible=true").last().click();
    await page.waitForTimeout(3000);
    db("status") === "INSPECT_CONFIRM" && db(`"assignedTeam"`) === team
      ? pass(`ส่งช่างเข้าตรวจด้วยทีมเดิม (${team}) → รอแอดมินนัดลูกค้า (ฐานข้อมูล)`) : fail(`สถานะ: ${db("status")} ทีม ${db(`"assignedTeam"`)}`);
  } catch (e) {
    fail(String(e).slice(0, 500));
  } finally {
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
