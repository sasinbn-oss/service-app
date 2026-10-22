// ทดสอบ: แอดมินเบิกได้เฉพาะคลังลาดพร้าว 94 · ของคลังอื่นส่งให้หัวหน้าภาคเบิก (ต.ค. 69)
//   · แอดมิน: รายการคลังแยกหัวข้อ "แอดมินเบิกเอง" (คลัง 94) / "หัวหน้าภาคเบิก" · เลือกคลังอื่นแล้วขึ้นป้าย "หัวหน้าภาคเบิก"
//     · หมายเหตุถึงหัวหน้าภาคไม่บังคับ (ต.ค. 69) · ปุ่มบอกจำนวนที่ส่งต่อ · ประวัติบอกรายตัว
//   · แอดมินไม่มีปุ่มของขั้นหัวหน้าภาคเบิก
//   · หัวหน้าภาค: เห็นว่าแอดมินแจ้งของตัวไหนอยู่คลังไหน ใส่เลขใบเบิก กดคอนเฟิร์ม → รอหัวหน้าภาคจ่ายงาน (ยืนยันที่ฐานข้อมูล)
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
      if (partCode === "SP-BOARD") {
        // หัวข้อ "แอดมินเบิกเอง" ต้องอยู่บนสุด ตามด้วยคลัง 94 แล้วจึงเป็นหัวข้อ "หัวหน้าภาคเบิก"
        const order = await p.page.evaluate(() => {
          const t = document.body.innerText;
          return [t.indexOf("แอดมินเบิกเอง"), t.indexOf("คลังลาดพร้าว 94", t.indexOf("แอดมินเบิกเอง")), t.lastIndexOf("หัวหน้าภาคเบิก")];
        });
        order[0] >= 0 && order[0] < order[1] && order[1] < order[2]
          ? pass("รายการคลังแยกหัวข้อ: แอดมินเบิกเอง (คลัง 94) อยู่บนสุด แล้วจึงหัวหน้าภาคเบิก") : fail(`ลำดับหัวข้อคลัง: ${order}`);
        await p.page.screenshot({ path: path.join(DIR, "pickup-warehouse-list.png") });
      }
      await p.page.getByPlaceholder("ค้นหา").locator("visible=true").first().fill(search);
      await p.page.waitForTimeout(700);
      await p.vis(name).last().click();
      await p.page.waitForTimeout(500);
    }

    // ── แอดมิน
    const a = await open(wo.code, "A001");
    await a.vis("เบิกอะไหล่ (คลัง 94)").first().click();
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
    // ไม่เขียนหมายเหตุ — ไม่บังคับแล้ว ชื่อคลังบอกที่เบิกอยู่แล้ว
    (await a.vis("หมายเหตุถึงหัวหน้าภาค (ไม่บังคับ)").count()) ? pass("ช่องหมายเหตุถึงหัวหน้าภาคเป็นไม่บังคับ") : fail("ช่องหมายเหตุยังบังคับ");
    await a.page.screenshot({ path: path.join(DIR, "pickup-admin-form.png") });
    await btn.click();
    await a.page.waitForTimeout(3500);
    const after = `${st()}|${part(board)}|${part(belt)}`;
    after === "PARTS_PICKUP|คลังลาดพร้าว 94|RQ-WEB-94|คลังภูเก็ต|-"
      ? pass("ฐานข้อมูล: รอหัวหน้าภาคเบิก · คลัง 94 มีเลขใบเบิก · ภูเก็ตยังไม่มี") : fail(`ฐานข้อมูล: ${after}`);
    // ชื่อขั้นบนแถบขั้นตอนใช้คำเดียวกับปุ่ม (ต.ค. 69) — ดูว่าแอดมินได้ "ขั้นนี้รอหัวหน้าภาค" แทนปุ่ม
    (await a.vis("ขั้นนี้รอหัวหน้าภาค", false).count()) > 0 ? pass("แอดมินไม่มีปุ่มของขั้นหัวหน้าภาคเบิก (ขึ้นว่ารอหัวหน้าภาค)") : fail("แอดมินมีปุ่มเบิกคลังอื่น");
    await a.page.screenshot({ path: path.join(DIR, "pickup-admin-after.png") });

    // ── หัวหน้าภาค (fixture ย้าย S001 ไปภาคของสาขานี้แล้ว)
    const s = await open(wo.code, "S001");
    await s.vis("เบิกอะไหล่ (คลังอื่น)").first().click();
    await s.page.waitForTimeout(1200);
    const box = s.label("หมายเหตุจากแอดมิน");
    (await box.count()) && /แอดมินแจ้งว่ามีของที่/.test(await box.innerText()) && /SP-BELT[^\n]*× 2 — คลังภูเก็ต/.test(await box.innerText())
      ? pass("หัวหน้าภาคเห็นว่าแอดมินแจ้ง SP-BELT × 2 มีที่คลังภูเก็ต (ไม่มีหมายเหตุก็เห็น)") : fail(`กล่องจากแอดมิน: ${(await box.count()) ? await box.innerText() : "ไม่มี"}`);
    (await s.vis("SP-BOARD ×1 · คลังลาดพร้าว 94 · ใบเบิก RQ-WEB-94 — แอดมินเบิกแล้ว", false).count()) &&
    (await s.vis("SP-BELT ×2 · คลังภูเก็ต — ส่งหัวหน้าภาคเบิก", false).count())
      ? pass("ประวัติใบงานบอกรายตัว: คลัง 94 + เลขใบเบิก (แอดมินเบิก) · คลังภูเก็ต (ส่งหัวหน้าภาคเบิก)") : fail("ประวัติไม่บอกรายตัว");
    (await s.vis("RQ-WEB-94", false).count()) ? pass("เห็นตัวที่แอดมินเบิกไปแล้ว") : fail("ไม่เห็นตัวที่แอดมินเบิก");
    await s.label("เลขใบเบิก SP-BELT").fill("RQ-WEB-SUP");
    await s.page.screenshot({ path: path.join(DIR, "pickup-supervisor-form.png") });
    await s.vis("คอนเฟิร์ม เบิกแล้ว").last().click();
    await s.page.waitForTimeout(3500);
    const done = `${st()}|${part(belt)}`;
    done === "PARTS_CHECKED|คลังภูเก็ต|RQ-WEB-SUP" ? pass("คอนเฟิร์มแล้ว: หัวหน้าภาค · จ่ายงานให้ทีม · เลขใบเบิกบันทึกที่ฐานข้อมูล") : fail(`หลังคอนเฟิร์ม: ${done}`);
    (await s.vis("จ่ายงานให้ทีม").count()) ? pass("หัวหน้าภาคได้ปุ่มจ่ายงานต่อทันที") : fail("ไม่มีปุ่มจ่ายงาน");

    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    if (fx) await fx.cleanup();
    await browser.close();
  }
})();
