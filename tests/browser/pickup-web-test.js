// ทดสอบ: แอดมินเบิกได้เฉพาะคลังลาดพร้าว 94 · ของคลังอื่นส่งให้หัวหน้าภาคเบิก (ต.ค. 69)
//   · แอดมิน: รายการคลังแยกหัวข้อ "แอดมินเบิกเอง" (คลัง 94) / "หัวหน้าภาคเบิก" · เลือกคลังอื่นแล้วขึ้นป้าย "หัวหน้าภาคเบิก"
//     · หมายเหตุถึงหัวหน้าภาคไม่บังคับ (ต.ค. 69) · ปุ่มบอกจำนวนที่ส่งต่อ · ประวัติบอกรายตัว
//   · แอดมินไม่มีปุ่มของขั้นหัวหน้าภาคเบิก
//   · หัวหน้าภาค: เห็นว่าแอดมินแจ้งของตัวไหนอยู่คลังไหน · เบิกจากคลังนั้น + เลขใบเบิก · โอนไปคลัง 94 (ค่าตั้งต้น) + เลขที่ใบโอน
//     · ออกใบขอโอนสินค้า PDF ได้ · บันทึก → รอโอน · กด "โอนเสร็จแล้ว" → กลับไปแอดมินเบิกส่งมอบจากคลัง 94 → คอนเฟิร์มลูกค้า
//     · ฟอร์มโอนบอกวันนัดที่ของต้องถึง (นัดวันก่อนเบิก ต.ค. 69 รอบสอง — วันถูกนัดไว้แล้วตอนโอน)
//     (ยืนยันที่ฐานข้อมูลทุกขั้น)
// ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup, visitDay } = require("./fixture");

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
    const board = fx.part("SP-BOARD"), belt = fx.part("SP-BELT");
    const wo = await fx.workOrder(branch, [{ sparePartId: board, quantity: 1 }, { sparePartId: belt, quantity: 2 }]);
    // ข้ามเสนอราคา (ถ้ามี) — ทดสอบเฉพาะขั้นเบิก · ขั้นเบิกอยู่หลังนัดวันแล้ว (ต.ค. 69 รอบสอง) ใบจริงมีทีม วัน และยังไม่คอนเฟิร์ม
    // ถ้าไม่ใส่วัน เบิกครบแล้วเซิร์ฟเวอร์ส่งไปนัดวัน (ทางของใบเก่า) แทนที่จะไปคอนเฟิร์มลูกค้า
    const visit = visitDay(10);
    fx.sql(`update "WorkOrder" set status='PARTS_REQUESTED', "assignedTeam"=(select zone from "Branch" where code='${branch}'), "scheduledAt"='${visit}', "appointmentStatus"='PENDING' where id=${wo.id}`);
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
    // ปุ่มขั้นอยู่ท้ายการ์ดขั้นปัจจุบัน — ชื่อเดียวกับหัวการ์ด (ซึ่งกดไม่ได้) จึงเอาตัวสุดท้าย
    await a.vis("เบิกอะไหล่ (คลัง 94)").last().click();
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
    // ของคลังอื่นต้องเลือกว่าโอนไหมทีละชิ้น (ต.ค. 69) — ยังไม่เลือกกดส่งไม่ได้
    (await a.label("ต้องโอนไหม SP-BELT").count()) && !(await a.label("ต้องโอนไหม SP-BOARD").count())
      ? pass("ของคลังอื่นถามว่าต้องโอนไหมทีละชิ้น (ชิ้นคลัง 94 ไม่ถาม)") : fail("คำถามต้องโอนไหมไม่ตรงชิ้น");
    await a.label("ต้องโอน SP-BELT").click();
    await a.page.waitForTimeout(300);
    const btn = a.vis("ส่งหัวหน้าภาคเบิก 1 รายการ").last();
    (await btn.count()) ? pass("ปุ่มบอกจำนวนที่ส่งให้หัวหน้าภาคเบิก") : fail("ปุ่มไม่บอกจำนวน");
    // ไม่เขียนหมายเหตุ — ไม่บังคับแล้ว ชื่อคลังบอกที่เบิกอยู่แล้ว
    (await a.vis("หมายเหตุถึงหัวหน้าภาค (ไม่บังคับ)").count()) ? pass("ช่องหมายเหตุถึงหัวหน้าภาคเป็นไม่บังคับ") : fail("ช่องหมายเหตุยังบังคับ");
    await a.page.screenshot({ path: path.join(DIR, "pickup-admin-form.png") });
    await btn.click();
    await a.page.waitForTimeout(3500);
    const after = `${st()}|${part(board)}|${part(belt)}`;
    after === "PARTS_TRANSFER|คลังลาดพร้าว 94|RQ-WEB-94|คลังภูเก็ต|-"
      ? pass("ฐานข้อมูล: รอหัวหน้าภาคเบิกและโอน · คลัง 94 มีเลขใบเบิก · ภูเก็ตยังไม่มี") : fail(`ฐานข้อมูล: ${after}`);
    // ชื่อขั้นบนแถบขั้นตอนใช้คำเดียวกับปุ่ม (ต.ค. 69) — ดูว่าแอดมินได้ "ขั้นนี้รอหัวหน้าภาค" แทนปุ่ม
    (await a.vis("ขั้นนี้รอหัวหน้าภาค", false).count()) > 0 ? pass("แอดมินไม่มีปุ่มของขั้นหัวหน้าภาคเบิก (ขึ้นว่ารอหัวหน้าภาค)") : fail("แอดมินมีปุ่มเบิกคลังอื่น");
    await a.page.screenshot({ path: path.join(DIR, "pickup-admin-after.png") });

    // ── หัวหน้าภาค (fixture ย้าย S001 ไปภาคของสาขานี้แล้ว)
    const xf = (id) =>
      fx.sql(`select coalesce("transferFrom",'-')||'|'||coalesce("transferReqNo",'-')||'|'||coalesce("transferNo",'-')||'|'||("transferredAt" is not null) from "WorkOrderPart" where "workOrderId"=${wo.id} and "sparePartId"=${id} and kind='WAITING'`);
    const s = await open(wo.code, "S001");
    await s.vis("เบิกและโอนอะไหล่").last().click();
    await s.page.waitForTimeout(1200);
    (await s.label("วันนัดที่ของต้องถึง").count()) > 0
      ? pass("ฟอร์มเบิกและโอนบอกวันนัดที่ของต้องถึง") : fail("ฟอร์มโอนไม่บอกวันนัด");
    const box = s.label("หมายเหตุจากแอดมิน");
    (await box.count()) && /แอดมินแจ้งว่ามีของที่/.test(await box.innerText()) && /SP-BELT[^\n]*× 2 — คลังภูเก็ต/.test(await box.innerText())
      ? pass("หัวหน้าภาคเห็นว่าแอดมินแจ้ง SP-BELT × 2 มีที่คลังภูเก็ต (ไม่มีหมายเหตุก็เห็น)") : fail(`กล่องจากแอดมิน: ${(await box.count()) ? await box.innerText() : "ไม่มี"}`);
    (await s.vis("SP-BOARD ×1 · คลังลาดพร้าว 94 · ใบเบิก RQ-WEB-94 — แอดมินเบิกแล้ว", false).count()) &&
    (await s.vis("SP-BELT ×2 · คลังภูเก็ต — ส่งหัวหน้าภาคเบิกและโอน", false).count())
      ? pass("ประวัติใบงานบอกรายตัว: คลัง 94 + เลขใบเบิก (แอดมินเบิก) · คลังภูเก็ต (ส่งหัวหน้าภาคเบิกและโอน)") : fail("ประวัติไม่บอกรายตัว");
    (await s.label("โอนไปคลัง SP-BELT").innerText()).includes("คลังลาดพร้าว 94")
      ? pass("คลังปลายทางตั้งต้นที่คลังลาดพร้าว 94") : fail(`ปลายทางตั้งต้น: ${await s.label("โอนไปคลัง SP-BELT").innerText()}`);
    const save = s.vis("บันทึก · สั่งโอนแล้ว").last();
    await s.label("เลขใบเบิกต้นทาง SP-BELT").fill("PK-WEB-1");
    await save.click();
    await s.page.waitForTimeout(1500);
    st() === "PARTS_TRANSFER" ? pass("ยังไม่ใส่เลขที่ใบโอน: บันทึกไม่ผ่าน") : fail(`ไม่มีเลขใบโอนก็ผ่าน: ${st()}`);
    await s.label("เลขที่ใบโอน SP-BELT").fill("TR-WEB-1");
    // ใบขอโอนสินค้า PDF ของคู่คลังภูเก็ต → 94 — ออกแล้วมีลิงก์เปิด และเป็นไฟล์ PDF จริง
    const [docRes] = await Promise.all([
      s.page.waitForResponse((r) => r.url().includes("/documents/transfer-request") && r.request().method() === "POST", { timeout: 20000 }),
      s.label("ออกใบขอโอนสินค้า คลังภูเก็ต→คลังลาดพร้าว 94").click(),
    ]);
    await s.label("เปิดใบขอโอนสินค้า คลังภูเก็ต→คลังลาดพร้าว 94").waitFor({ timeout: 20000 });
    const doc = await docRes.json();
    const pdf = await fetch(`http://localhost:4000${doc.path}`).then(async (r) => Buffer.from(await r.arrayBuffer()));
    doc.title === "ขอโอนสินค้า: คลังภูเก็ต → คลังลาดพร้าว 94" && pdf.subarray(0, 4).toString() === "%PDF"
      ? pass("ออกใบขอโอนสินค้า PDF (คลังภูเก็ต → คลังลาดพร้าว 94) ได้ไฟล์ PDF จริง มีปุ่มเปิด") : fail(`ใบขอโอน: ${doc.title} ${pdf.subarray(0, 8)}`);
    await s.page.screenshot({ path: path.join(DIR, "transfer-supervisor-form.png") });
    await save.click();
    await s.page.waitForTimeout(3500);
    const sent = `${st()}|${part(belt)}|${xf(belt)}`;
    sent === "PARTS_IN_TRANSIT|คลังลาดพร้าว 94|-|คลังภูเก็ต|PK-WEB-1|TR-WEB-1|false"
      ? pass("ฐานข้อมูล: รอโอนอะไหล่ · ปลายทางคลัง 94 · ต้นทางภูเก็ต + เลขใบเบิก + เลขที่ใบโอน") : fail(`หลังสั่งโอน: ${sent}`);
    await s.vis("โอนเสร็จแล้ว").last().click();
    await s.page.waitForTimeout(1200);
    (await s.label("อะไหล่ที่กำลังโอน").innerText()).includes("คลังภูเก็ต (ใบเบิก PK-WEB-1) → คลังลาดพร้าว 94 · ใบโอน TR-WEB-1")
      ? pass("ขั้นรอโอนบอก ต้นทาง · ใบเบิก · ปลายทาง · ใบโอน") : fail(`กล่องกำลังโอน: ${await s.label("อะไหล่ที่กำลังโอน").innerText()}`);
    await s.page.screenshot({ path: path.join(DIR, "transfer-in-transit.png") });
    await s.vis("ของถึงแล้ว · โอนเสร็จแล้ว").last().click();
    await s.page.waitForTimeout(3500);
    `${st()}|${xf(belt)}` === "PARTS_REQUESTED|คลังภูเก็ต|PK-WEB-1|TR-WEB-1|true"
      ? pass("โอนเสร็จแล้ว → กลับไปแอดมินเบิกส่งมอบจากคลัง 94 (ฐานข้อมูลบันทึกเวลาถึง)") : fail(`หลังโอนเสร็จ: ${st()} ${xf(belt)}`);

    // ── แอดมินเบิกส่งมอบจากคลัง 94
    const a2 = await open(wo.code, "A001");
    await a2.vis("เบิกอะไหล่ (คลัง 94)").last().click();
    await a2.page.waitForTimeout(1200);
    (await a2.label("โอนมาแล้ว SP-BELT").count()) ? pass("แอดมินเห็นว่า SP-BELT โอนจากคลังภูเก็ตมาถึงแล้ว") : fail("แอดมินไม่เห็นข้อมูลการโอน");
    await a2.vis("มีของ").last().click();
    await a2.page.waitForTimeout(300);
    if (!(await a2.label("คลังที่มี SP-BELT").innerText()).includes("คลังลาดพร้าว 94")) await pickWarehouse(a2, "SP-BELT", "คลังลาดพร้าว 94", "ลาดพร้าว");
    await a2.label("เลขใบเบิกอะไหล่").fill("RQ-WEB-2");
    await a2.vis("ยืนยัน").last().click();
    await a2.page.waitForTimeout(3500);
    const fin = `${st()}|${part(belt)}|${xf(belt)}`;
    fin === "AWAITING_CONFIRM|คลังลาดพร้าว 94|RQ-WEB-2|คลังภูเก็ต|PK-WEB-1|TR-WEB-1|true"
      ? pass("แอดมินเบิกส่งมอบแล้ว → แอดมิน · คอนเฟิร์มลูกค้า · ข้อมูลการโอนยังอยู่ (ฐานข้อมูล)") : fail(`เบิกส่งมอบ: ${fin}`);
    // ทีม วันนัด และสถานะนัดที่หัวหน้าภาคนัดไว้ต้องอยู่ครบหลังเบิก/โอน — แอดมินโทรคอนเฟิร์มวันนี้กับร้าน
    const appt = fx.sql(`select ("assignedTeam" is not null)||'|'||"scheduledAt"::date||'|'||"appointmentStatus" from "WorkOrder" where id=${wo.id}`);
    appt === `true|${visit}|PENDING` ? pass("ทีม + วันนัดยังอยู่ · รอคอนเฟิร์มลูกค้า (PENDING) (ฐานข้อมูล)") : fail(`นัดหลังเบิก: ${appt}`);

    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    if (fx) await fx.cleanup();
    await browser.close();
  }
})();
