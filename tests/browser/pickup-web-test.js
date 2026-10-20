// ทดสอบ: แอดมินเบิกได้เฉพาะคลังลาดพร้าว 94 · ของคลังอื่นส่งให้หัวหน้าภาคเบิก (ต.ค. 69)
//   · แอดมิน: เลือกคลังอื่นแล้วขึ้นป้าย "หัวหน้าภาคเบิก" ต้องเขียนหมายเหตุถึงหัวหน้าภาค · ปุ่มบอกจำนวนที่ส่งต่อ
//   · แอดมินไม่มีปุ่มของขั้นหัวหน้าภาคเบิก
//   · หัวหน้าภาค: เห็นหมายเหตุจากแอดมิน ใส่เลขใบเบิก กดคอนเฟิร์ม → รอหัวหน้าภาคจ่ายงาน (ยืนยันที่ฐานข้อมูล)
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
    const board = fx.part("SP-BOARD"), belt = fx.part("SP-BELT");
    const wo = await fx.workOrder(branch, [{ sparePartId: board, quantity: 1 }, { sparePartId: belt, quantity: 2 }]);
    // ข้ามเสนอราคา (ถ้ามี) — ทดสอบเฉพาะขั้นเบิก
    fx.sql(`update "WorkOrder" set status='PARTS_REQUESTED' where id=${wo.id}`);
    const st = () => fx.sql(`select status from "WorkOrder" where id=${wo.id}`);
    const part = (id) => fx.sql(`select coalesce(warehouse,'-')||'|'||coalesce("requisitionNo",'-') from "WorkOrderPart" where "workOrderId"=${wo.id} and "sparePartId"=${id} and kind='WAITING'`);

    async function open(code, who) {
      const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
      page.on("pageerror", (e) => errors.push(String(e)));
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(who);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
      await vis("ใบงาน").last().click();
      await page.waitForTimeout(2500);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
      await page.waitForTimeout(2500);
      await vis(code).last().click();
      await page.waitForTimeout(3000);
      return { page, vis, label: (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true").last() };
    }
    async function pickWarehouse(p, partCode, name, search) {
      await p.label(`คลังที่มี ${partCode}`).click();
      await p.page.waitForTimeout(600);
      await p.page.getByPlaceholder("ค้นหา").locator("visible=true").first().fill(search);
      await p.page.waitForTimeout(700);
      await p.vis(name).last().click();
      await p.page.waitForTimeout(500);
    }

    // ── แอดมิน
    const a = await open(wo.code, "A001");
    await a.vis("เบิกอะไหล่ส่งหน้างาน").first().click();
    await a.page.waitForTimeout(1200);
    await a.vis("มีของ").first().click();
    await a.page.waitForTimeout(300);
    await pickWarehouse(a, "SP-BOARD", "คลังลาดพร้าว 94", "ลาดพร้าว");
    await a.vis("มีของ").last().click();
    await a.page.waitForTimeout(300);
    await pickWarehouse(a, "SP-BELT", "คลังภูเก็ต", "ภูเก็ต");
    await a.label("เลขใบเบิกอะไหล่").fill("RQ-WEB-94");
    await a.page.waitForTimeout(300);
    (await a.label("หัวหน้าภาคเบิก SP-BELT").count()) && !(await a.label("หัวหน้าภาคเบิก SP-BOARD").count())
      ? pass("เลือกคลังภูเก็ต: ขึ้นป้าย หัวหน้าภาคเบิก (คลัง 94 ไม่ขึ้น)") : fail("ป้ายหัวหน้าภาคเบิกไม่ถูก");
    const btn = a.vis("ส่งหัวหน้าภาคเบิก 1 รายการ").last();
    (await btn.count()) ? pass("ปุ่มบอกจำนวนที่ส่งให้หัวหน้าภาคเบิก") : fail("ปุ่มไม่บอกจำนวน");
    await btn.click();
    await a.page.waitForTimeout(1500);
    st() === "PARTS_REQUESTED" ? pass("ยังไม่เขียนหมายเหตุ: กดไม่ผ่าน") : fail(`ไม่มีหมายเหตุก็ผ่าน: ${st()}`);
    await a.label("หมายเหตุถึงหัวหน้าภาค").fill("มีที่คลังภูเก็ต ติดต่อพี่เอ (เทสต์)");
    await a.page.screenshot({ path: path.join(DIR, "pickup-admin-form.png") });
    await btn.click();
    await a.page.waitForTimeout(3500);
    const after = `${st()}|${part(board)}|${part(belt)}`;
    after === "PARTS_PICKUP|คลังลาดพร้าว 94|RQ-WEB-94|คลังภูเก็ต|-"
      ? pass("ฐานข้อมูล: รอหัวหน้าภาคเบิก · คลัง 94 มีเลขใบเบิก · ภูเก็ตยังไม่มี") : fail(`ฐานข้อมูล: ${after}`);
    (await a.vis("เบิกอะไหล่จากคลังอื่น").count()) === 0 ? pass("แอดมินไม่มีปุ่มของขั้นหัวหน้าภาคเบิก") : fail("แอดมินมีปุ่มเบิกคลังอื่น");
    await a.page.screenshot({ path: path.join(DIR, "pickup-admin-after.png") });

    // ── หัวหน้าภาค (fixture ย้าย S001 ไปภาคของสาขานี้แล้ว)
    const s = await open(wo.code, "S001");
    await s.vis("เบิกอะไหล่จากคลังอื่น").first().click();
    await s.page.waitForTimeout(1200);
    (await s.vis("มีที่คลังภูเก็ต ติดต่อพี่เอ (เทสต์)", false).count()) ? pass("หัวหน้าภาคเห็นหมายเหตุจากแอดมิน") : fail("ไม่เห็นหมายเหตุ");
    (await s.vis("RQ-WEB-94", false).count()) ? pass("เห็นตัวที่แอดมินเบิกไปแล้ว") : fail("ไม่เห็นตัวที่แอดมินเบิก");
    await s.label("เลขใบเบิก SP-BELT").fill("RQ-WEB-SUP");
    await s.page.screenshot({ path: path.join(DIR, "pickup-supervisor-form.png") });
    await s.vis("คอนเฟิร์ม เบิกแล้ว").last().click();
    await s.page.waitForTimeout(3500);
    const done = `${st()}|${part(belt)}`;
    done === "PARTS_CHECKED|คลังภูเก็ต|RQ-WEB-SUP" ? pass("คอนเฟิร์มแล้ว: หัวหน้าภาค · จ่ายงานให้ทีม · เลขใบเบิกบันทึกที่ฐานข้อมูล") : fail(`หลังคอนเฟิร์ม: ${done}`);
    (await s.vis("จ่ายงานให้ช่าง").count()) ? pass("หัวหน้าภาคได้ปุ่มจ่ายงานต่อทันที") : fail("ไม่มีปุ่มจ่ายงาน");

    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    if (fx) await fx.cleanup();
    await browser.close();
  }
})();
