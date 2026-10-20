// ทดสอบ: ย้อนขั้นแล้วข้อมูลไม่หาย + เห็นว่าใบนี้ถูกย้อนมา (เจ้าของงานขอ ต.ค. 69)
//   · หน้าต่างย้อนขั้นบอกว่าข้อมูลไม่หาย (ไม่ใช่ "จะถูกล้าง") · ย้อนผ่านหน้าจอจริงแล้วฐานข้อมูลถอยขั้น
//   · หน้าใบงาน: ป้าย "↩ ย้อนขั้นมา" · กล่องย้อนขั้น (ขั้นเดิม เหตุผล) · แถบขั้นตอนบอกขั้นที่ย้อนมา · รายการติดป้าย
//   · ฟอร์มระบุอะไหล่เติม "ใช้อะไหล่" เดิม · กดผ่านแล้วป้ายหาย
//   · ฟอร์มจ่ายงานเติมทีมและวันนัดเดิม — กดยืนยันเลยแล้วฐานข้อมูลได้ทีม/วันเดิม (ไม่ต้องกรอกใหม่)
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
    const BOARD = fx.part("SP-BOARD");
    const wo = await fx.workOrder("C0006", [{ sparePartId: BOARD, quantity: 1 }]);
    const team = fx.sql(`select zone from "Branch" where code='C0006'`);
    const visit = new Date(Date.now() + 7 * 3600_000 + 10 * 86_400_000).toISOString().slice(0, 10);
    fx.sql(`update "WorkOrderPart" set "inStock"=true, warehouse='คลังกระบี่', "requisitionNo"='RQ-WEB1', "checkedAt"=now() where "workOrderId"=${wo.id};
            update "WorkOrder" set status='IN_PROGRESS', "assignedTeam"='${team}', "scheduledAt"='${visit}', "scheduledTime"='14:00', "appointmentStatus"='CONFIRMED' where id=${wo.id}`);
    const db = (col) => fx.sql(`select coalesce(${col}::text,'-') from "WorkOrder" where id=${wo.id}`);

    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const lbl = (t) => page.locator(`[aria-label="${t}"]`).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("S001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    const openOrder = async () => {
      await vis("ใบงาน").last().click();
      await page.waitForTimeout(2500);
      await vis("ทั้งหมด").first().click().catch(() => {});
      await page.waitForTimeout(1200);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(wo.code);
      await page.waitForTimeout(2500);
    };
    await openOrder();
    await vis(wo.code).last().click();
    await page.waitForTimeout(3000);
    (await lbl("ป้ายย้อนขั้น").count()) === 0 ? pass("ก่อนย้อน: ไม่มีป้ายย้อนขั้น") : fail("มีป้ายก่อนย้อน");

    await vis("ย้อนขั้นตอน").first().click();
    await page.waitForTimeout(1000);
    await lbl("ย้อนไป หัวหน้าภาค · ระบุอะไหล่").first().click();
    await page.waitForTimeout(400);
    const keep = (await lbl("ข้อมูลที่เก็บไว้").count()) ? await lbl("ข้อมูลที่เก็บไว้").first().innerText() : "";
    keep.includes("ไม่หาย") && keep.includes("ทีมที่รับงาน") && keep.includes("วันนัด") && (await vis("สิ่งที่จะถูกล้าง", false).count()) === 0
      ? pass("หน้าต่างย้อนขั้นบอกว่าข้อมูลไม่หาย (ทีม วันนัด ผลเช็คคลัง) ไม่ใช่ \"จะถูกล้าง\"") : fail(`กล่อง: ${keep}`);
    await lbl("เหตุผลที่ย้อน").first().fill("ต้องเพิ่มสายพาน");
    await page.screenshot({ path: path.join(DIR, "rollback-dialog.png") });
    await vis("ย้อนขั้น").last().click();
    await page.waitForTimeout(3500);
    db("status") === "NEW" && db('"assignedTeam"') === "-" ? pass("ย้อนผ่านหน้าจอ: ฐานข้อมูลกลับไประบุอะไหล่ ทีมถูกเอาออกจากใบ") : fail(`สถานะ ${db("status")} ทีม ${db('"assignedTeam"')}`);

    const banner = (await lbl("กล่องย้อนขั้น").count()) ? await lbl("กล่องย้อนขั้น").first().innerText() : "";
    (await lbl("ป้ายย้อนขั้น").count()) > 0 && banner.includes("ช่าง · เข้างาน/ปิดงาน") && banner.includes("ต้องเพิ่มสายพาน") && (await lbl("ขั้นที่ย้อนมา").count()) > 0
      ? pass("หน้าใบงาน: ป้าย ↩ ย้อนขั้นมา · กล่องบอกขั้นเดิมและเหตุผล · แถบขั้นตอนบอกขั้นที่ย้อนมา") : fail(`กล่อง: ${banner}`);
    await page.screenshot({ path: path.join(DIR, "rollback-detail.png") });

    await vis("ระบุอะไหล่ที่ต้องใช้").first().click();
    await page.waitForTimeout(1500);
    const prevBox = (await lbl("ค่าเดิมก่อนย้อน").count()) ? await lbl("ค่าเดิมก่อนย้อน").first().innerText() : "";
    prevBox.includes("ใช้อะไหล่ไหม") ? pass("ฟอร์มระบุอะไหล่บอกว่าเติมค่าเดิม (ใช้อะไหล่ไหม)") : fail(`กล่องค่าเดิม: ${prevBox}`);
    await page.screenshot({ path: path.join(DIR, "rollback-form.png") });
    await vis("ยืนยัน").last().click();
    await page.waitForTimeout(4000);
    const after = db("status");
    after !== "NEW" && db('"needsParts"') === "true" ? pass(`กดยืนยันได้เลยโดยไม่ต้องเลือกใหม่ — ใช้อะไหล่ = เดิม (ฐานข้อมูล) ไป ${after}`) : fail(`หลังยืนยัน ${after} needsParts=${db('"needsParts"')}`);
    (await lbl("ป้ายย้อนขั้น").count()) === 0 && (await lbl("กล่องย้อนขั้น").count()) === 0 ? pass("กดผ่านขั้นที่ย้อนไปแล้ว ป้าย/กล่องย้อนขั้นหาย") : fail("ป้ายยังอยู่หลังเดินขั้น");

    // ข้ามไปขั้นจ่ายงาน (ส่วนที่แอดมินทำระหว่างทางไม่ใช่เรื่องที่ทดสอบ) — ฟอร์มต้องเติมทีม/วันเดิม
    fx.sql(`update "WorkOrder" set status='PARTS_CHECKED' where id=${wo.id}`);
    await page.locator('[aria-label="ปิด"]').locator("visible=true").last().click().catch(() => {});
    await page.waitForTimeout(1500);
    await openOrder();
    await vis(wo.code).last().click();
    await page.waitForTimeout(3000);
    await vis("จ่ายงานให้ช่าง").first().click();
    await page.waitForTimeout(1500);
    const prev2 = (await lbl("ค่าเดิมก่อนย้อน").count()) ? await lbl("ค่าเดิมก่อนย้อน").first().innerText() : "";
    prev2.includes("ทีม") && prev2.includes("วันนัด") ? pass("ฟอร์มจ่ายงานเติมทีมและวันนัดเดิมให้") : fail(`กล่องค่าเดิม: ${prev2}`);
    await page.screenshot({ path: path.join(DIR, "rollback-dispatch.png") });
    await vis("ยืนยัน").last().click();
    await page.waitForTimeout(4000);
    db('"assignedTeam"') === team && db('"scheduledAt"').startsWith(visit) && db('"scheduledTime"') === "14:00"
      ? pass(`กดยืนยันเลย ฐานข้อมูลได้ทีม${team} วัน ${visit} 14:00 เดิม — ไม่ต้องกรอกใหม่`)
      : fail(`ทีม ${db('"assignedTeam"')} วัน ${db('"scheduledAt"')} เวลา ${db('"scheduledTime"')} สถานะ ${db("status")}`);
    await ctx.close();
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    if (fx) await fx.cleanup();
    await browser.close();
  }
})();
