// ทดสอบ: อะไหล่นอก + ค่าบริการ ผ่านหน้าจอด้วยบทบาทจริง — เช็คฐานข้อมูลทุกจังหวะ
//   ใช้สาขาบริษัท (ปกติไม่ต้องเสนอราคา) เพื่อพิสูจน์ว่าอะไหล่นอก/ค่าบริการบังคับเสนอราคาเสมอ
//   1) หัวหน้าช่าง: เลือกใช้อะไหล่ → เพิ่มอะไหล่นอก · แถวที่ไม่มีชื่อปุ่มกดไม่ได้ + กล่อง "ยังขาด" บอกแถว ·
//      จัดหาได้ไหม (4 พ.ย. 69): ใส่ชื่อแล้วปุ่มเป็น "ยังขาด 1 อย่าง — พาไป" (กดแล้วไม่ส่ง — ฐานข้อมูลไม่เปลี่ยน) ·
//      ชิป หาได้/หาไม่ได้ (aria-pressed) · สลับไปหาไม่ได้ขึ้นชิปเหตุผล รายละเอียดที่พิมพ์ไม่หาย · หาได้ → ชิปแหล่ง + รายละเอียด →
//      ปุ่มกลับเป็น "ยืนยัน" · ใส่ค่าบริการ · กล่องบอกว่าจะส่งแอดมินทำใบเสนอราคา · ฐานข้อมูลได้คำตอบ + คนตอบ
//   2) แอดมิน: ตารางอะไหล่ขึ้นป้าย "หาได้ · แหล่ง" + รายละเอียด + "หัวหน้าภาคแจ้ง · เวลา" · การ์ดขึ้นชื่อ + ป้าย "นอกสโตร์" และค่าบริการ ·
//      ขั้นเช็คอะไหล่ขึ้น "หัวหน้าภาคแจ้ง: …" และปุ่ม "หาได้" ติดให้แล้ว (aria-pressed) — กดยืนยันเลยโดยไม่กดหาได้ → เสนอราคา (ฐานข้อมูล)
//   3) ขั้นเสนอราคาขึ้นรายการที่ต้องใส่ในใบเสนอราคา ครบทั้งอะไหล่นอก (+ แหล่งที่หัวหน้าภาคแจ้ง) และค่าบริการ
//   4) ข้อความจ่ายงาน LINE (สรุปคอนเฟิร์มลูกค้า · คลิปบอร์ดจริง): "(ของนอกสโตร์ · แหล่ง — รายละเอียด)" ใต้ชื่อของ · กล่องในหน้าเดียวกันคำเดียวกัน
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup, visitDay } = require("./fixture");
const NAME = "สายพานทดสอบหน้าจอ 5PJ";
const SVC = "ค่าแรงทดสอบหน้าจอ";
const SPEC = "สเปค 5PJ ยาว 1200";
// สั้นกว่า 60 ตัวอักษร — ข้อความ LINE ไม่ตัดท้าย (clipDetail) เทียบตรง ๆ ได้
const DETAIL = "ร้านอะไหล่ทดสอบหน้าจอ ถ.พหลโยธิน 081-000-0000";
const SRC = "ร้านหาของมาเอง";

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
    const branch = fx.sql(`select code from "Branch" where code like 'C%' and "cancelledAt" is null and zone is not null order by code limit 1`);
    const wo = await fx.workOrder(branch, null);
    const st = () => fx.sql(`select status from "WorkOrder" where id=${wo.id}`);
    const offRow = () =>
      fx.sql(`select sp.name||'|'||p.quantity||'|'||coalesce(p.unit,'-')||'|'||coalesce(p.note,'-')||'|'||coalesce(p."inStock"::text,'-') from "WorkOrderPart" p join "SparePart" sp on sp.id=p."sparePartId" where p."workOrderId"=${wo.id} and sp."offCatalog"`);
    // คำตอบจัดหา: หาได้|แหล่ง|รายละเอียด|คนตอบ|มีเวลา
    const offAns = () =>
      fx.sql(`select coalesce(p."offFound"::text,'-')||'|'||coalesce(p."offKind",'-')||'|'||coalesce(p."offDetail",'-')||'|'||coalesce(u."employeeCode",'-')||'|'||(p."offAnswerAt" is not null) from "WorkOrderPart" p join "SparePart" sp on sp.id=p."sparePartId" left join "User" u on u.id=p."offAnswerById" where p."workOrderId"=${wo.id} and sp."offCatalog"`);
    const rows = () => fx.sql(`select count(*) from "WorkOrderPart" where "workOrderId"=${wo.id}`);

    const openAs = async (code) => {
      const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
      await vis("ใบงาน").last().click();
      await page.waitForTimeout(2500);
      await vis("ทั้งหมด").first().click().catch(() => {});
      await page.waitForTimeout(1500);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(wo.code);
      await page.waitForTimeout(2500);
      await vis(wo.code).last().click();
      await page.waitForTimeout(3000);
      const save = vis("ยืนยัน").last();
      const op = () => save.evaluate((n) => getComputedStyle(n.closest("[tabindex]") || n.parentElement).opacity);
      // aria-pressed ใส่เองที่ชิป (เว็บไม่แปลงสถานะปุ่มให้) — อ่านว่าชิปไหนติดอยู่
      const pressed = (l) => label(l).first().getAttribute("aria-pressed");
      return { ctx, page, vis, label, save, op, pressed };
    };

    // ── 1) หัวหน้าภาค ──
    {
      const { ctx, page, vis, label, save, op, pressed } = await openAs("S001");
      await vis("ระบุอะไหล่").first().click();
      await page.waitForTimeout(1200);
      await vis("ใช้อะไหล่").first().click();
      await page.waitForTimeout(500);
      (await vis("อะไหล่นอก — เสนอราคาให้ลูกค้า").count()) > 0 && (await vis("ค่าบริการ — เสนอราคาให้ลูกค้า").count()) > 0
        ? pass("ฟอร์มระบุอะไหล่มีกล่องอะไหล่นอก และกล่องค่าบริการ")
        : fail("ไม่มีกล่องอะไหล่นอก/ค่าบริการ");
      await label("เพิ่มอะไหล่นอก").click();
      await page.waitForTimeout(400);
      (await op()) !== "1" && (await vis("ยังขาด: แถว 1: ชื่อ/รุ่น").count()) > 0
        ? pass("เพิ่มแถวแต่ยังไม่ใส่ชื่อ ปุ่มยืนยันกดไม่ได้ และกล่องบอกว่าแถวไหนขาดอะไร")
        : fail("แถวไม่มีชื่อแต่กดยืนยันได้ / ไม่บอกว่าขาดอะไร");
      await label("ชื่ออะไหล่นอกสโตร์ 1").fill(NAME);
      await label("จำนวนอะไหล่นอกสโตร์ 1").fill("2");
      await label("หน่วยอะไหล่นอกสโตร์ 1").fill("เส้น");
      await label("หมายเหตุอะไหล่นอกสโตร์ 1").fill(SPEC);
      await page.waitForTimeout(400);
      // จัดหาได้ไหม (4 พ.ย. 69) — ยังไม่ตอบ ปุ่มบอกว่าขาดกี่อย่าง กดแล้วพาไปที่กล่อง ไม่ส่งอะไร
      const go = vis("ยังขาด 1 อย่าง — พาไป");
      (await go.count()) > 0 && (await vis(`ยังขาด: “${NAME}”: หาได้หรือหาไม่ได้`).count()) > 0 && (await vis("จัดหาได้ไหม *").count()) > 0 &&
      (await pressed("หาได้ อะไหล่นอกสโตร์ 1")) === "false" && (await pressed("หาไม่ได้ อะไหล่นอกสโตร์ 1")) === "false"
        ? pass("ใส่ชื่อแล้วยังไม่ตอบจัดหาได้ไหม: ปุ่ม \"ยังขาด 1 อย่าง — พาไป\" · กล่องบอกว่าขาดอะไร · ชิปหาได้/หาไม่ได้ยังไม่ติด")
        : fail("ไม่บอกว่ายังขาดคำตอบจัดหา");
      await go.last().click();
      await page.waitForTimeout(1500);
      fx.sql(`select status from "WorkOrder" where id=${wo.id}`) === "NEW" && rows() === "0"
        ? pass("กด \"พาไป\" ไม่ส่งอะไร — ใบยังรอระบุอะไหล่ ไม่มีแถวอะไหล่ (ฐานข้อมูล)")
        : fail(`กดพาไปแล้วส่ง: ${st()} · ${rows()} แถว`);
      await label("หาได้ อะไหล่นอกสโตร์ 1").click();
      await page.waitForTimeout(400);
      (await pressed("หาได้ อะไหล่นอกสโตร์ 1")) === "true" && (await vis("หาได้จากที่ไหน *").count()) > 0 &&
      (await label(`${SRC} อะไหล่นอกสโตร์ 1`).count()) > 0 && (await label("สั่งออนไลน์ อะไหล่นอกสโตร์ 1").count()) > 0 &&
      (await label("ของที่ทีมมีอยู่ อะไหล่นอกสโตร์ 1").count()) > 0 && (await vis("ยังขาด 1 อย่าง — พาไป").count()) > 0
        ? pass("กด หาได้ (ติด) → \"หาได้จากที่ไหน *\" ชิปแหล่งครบ · ยังขาดแหล่ง")
        : fail("หาได้ไม่ขึ้นช่องแหล่ง");
      await label("แหล่งที่หาได้ อะไหล่นอกสโตร์ 1").fill(DETAIL);
      // สลับไปหาไม่ได้ — ชิปเหตุผลแทนชิปแหล่ง รายละเอียดที่พิมพ์ไว้ไม่หาย แล้วสลับกลับ
      await label("หาไม่ได้ อะไหล่นอกสโตร์ 1").click();
      await page.waitForTimeout(400);
      (await vis("ทำไมหาไม่ได้ *").count()) > 0 && (await label("ร้านแถวนี้ไม่มี อะไหล่นอกสโตร์ 1").count()) > 0 &&
      (await label(`${SRC} อะไหล่นอกสโตร์ 1`).count()) === 0 &&
      (await label("เหตุผลที่หาไม่ได้ อะไหล่นอกสโตร์ 1").inputValue()) === DETAIL
        ? pass("สลับเป็น หาไม่ได้: ชิปเหตุผลแทนชิปแหล่ง · รายละเอียดที่พิมพ์ไว้ยังอยู่")
        : fail("สลับหาไม่ได้ไม่ถูก");
      await label("หาได้ อะไหล่นอกสโตร์ 1").click();
      await page.waitForTimeout(300);
      await label(`${SRC} อะไหล่นอกสโตร์ 1`).click();
      await page.waitForTimeout(400);
      (await pressed(`${SRC} อะไหล่นอกสโตร์ 1`)) === "true" && (await pressed("สั่งออนไลน์ อะไหล่นอกสโตร์ 1")) === "false" &&
      (await vis("ยังขาด 1 อย่าง — พาไป").count()) === 0 && (await op()) === "1"
        ? pass("เลือกแหล่ง + รายละเอียดครบ → ปุ่มกลับเป็น ยืนยัน กดได้ (มีแต่ของนอกสโตร์ ไม่มี SKU)")
        : fail("ตอบครบแล้วปุ่มยังไม่พร้อม");
      await label("เพิ่มค่าบริการ").click();
      await page.waitForTimeout(300);
      await label("ชื่อค่าบริการ 1").fill(SVC);
      await label("หน่วยค่าบริการ 1").fill("งาน");
      await page.waitForTimeout(400);
      (await vis("ใบนี้จะส่งให้แอดมินทำใบเสนอราคา — อะไหล่นอก 1 · ค่าบริการ 1").count()) > 0
        ? pass("กล่องบอกก่อนกดว่าจะส่งแอดมินทำใบเสนอราคา และเพราะอะไร")
        : fail("ไม่บอกว่าจะส่งไปเสนอราคา");
      await page.screenshot({ path: path.join(DIR, "off-catalog-supervisor.png") });
      await save.click();
      await page.waitForTimeout(3500);
      const svc = fx.sql(`select name||'|'||quantity||'|'||coalesce(unit,'-') from "WorkOrderService" where "workOrderId"=${wo.id}`);
      offRow() === `${NAME}|2|เส้น|${SPEC}|-` && svc === `${SVC}|1|งาน` && st() === "PARTS_SOURCING"
        ? pass("สาขาบริษัทแต่มีอะไหล่นอก+ค่าบริการ → รอแอดมินเช็คอะไหล่ก่อนเสนอราคา บันทึกครบ (ฐานข้อมูล)")
        : fail(`หลังบันทึก: ${st()} · ${offRow()}`);
      offAns() === `true|${SRC}|${DETAIL}|S001|true`
        ? pass("คำตอบจัดหาลงฐานข้อมูล: หาได้ · แหล่ง · รายละเอียด · คนตอบ S001 · มีเวลาตอบ")
        : fail(`คำตอบจัดหา: ${offAns()}`);
      await ctx.close();
    }

    // ── 2) แอดมิน ──
    {
      const { ctx, page, vis, label } = await openAs("A001");
      // การ์ดอะไหล่ — ชื่อ + ป้าย ไม่ใช่รหัสที่มีวงเล็บนำหน้า
      (await vis(`${NAME} × 2 เส้น`).count()) > 0 && (await vis(`[นอกสโตร์] ${NAME}`, false).count()) === 0 && (await vis("นอกสโตร์").count()) > 0
        ? pass("การ์ดอะไหล่ขึ้นชื่อ จำนวน หน่วย และป้ายนอกสโตร์")
        : fail("การ์ดอะไหล่แสดงไม่ถูก");
      // ตารางอะไหล่หน้าใบงาน (ตัวอย่างที่อนุมัติ): ป้าย "หาได้ · แหล่ง" · รายละเอียด · "หัวหน้าภาคแจ้ง · เวลา"
      (await vis(`หาได้ · ${SRC}`).count()) > 0 && (await vis(DETAIL).count()) > 0 &&
      (await page.getByText(/^หัวหน้าภาคแจ้ง · /).locator("visible=true").count()) > 0
        ? pass("ตารางอะไหล่หน้าใบงาน: ป้าย \"หาได้ · ร้านหาของมาเอง\" + รายละเอียด + \"หัวหน้าภาคแจ้ง · เวลา\"")
        : fail("ตารางอะไหล่ไม่ขึ้นคำตอบจัดหา");
      (await vis("ค่าบริการ (เสนอราคาลูกค้า)").count()) > 0 && (await vis(`${SVC} × 1 งาน`).count()) > 0
        ? pass("การ์ดใบงานขึ้นค่าบริการ") : fail("การ์ดไม่ขึ้นค่าบริการ");
      // ปุ่มขั้นอยู่ท้ายการ์ดขั้นปัจจุบัน — แถบขั้นตอนใช้ชื่อสั้น "เช็คอะไหล่" แล้ว ตัวแรกที่ชื่อตรงคือหัวการ์ดซึ่งกดไม่ได้
      await vis("เช็คอะไหล่ (มี/หมด)").last().click();
      await page.waitForTimeout(1500);
      const code = `[นอกสโตร์] ${NAME}`;
      const yes = label(`มีของ ${code}`).last();
      const no = label(`หมด ${code}`).last();
      (await vis("หาได้").count()) > 0 && (await vis("ยังหาไม่ได้").count()) > 0 &&
      (await vis(`หัวหน้าภาคแจ้ง: หาได้ · ${SRC} — ${DETAIL}`).count()) > 0 &&
      (await yes.getAttribute("aria-pressed")) === "true" && (await no.getAttribute("aria-pressed")) === "false" &&
      (await vis("ของนอกสโตร์: ปุ่มติดให้ตามที่หัวหน้าภาคแจ้ง — เช็คแล้วไม่ตรง กดเปลี่ยนได้").count()) > 0
        ? pass("ขั้นเช็คอะไหล่: \"หัวหน้าภาคแจ้ง: หาได้ · แหล่ง — รายละเอียด\" · ปุ่ม หาได้ ติดให้แล้ว (ยังหาไม่ได้ ไม่ติด) · บอกว่ากดเปลี่ยนได้")
        : fail(`ขั้นเช็คอะไหล่: aria-pressed หาได้=${await yes.getAttribute("aria-pressed")} ยังหาไม่ได้=${await no.getAttribute("aria-pressed")}`);
      await page.screenshot({ path: path.join(DIR, "off-catalog-admin.png") });
      // ไม่กด "หาได้" เอง — ปุ่มที่ติดให้ต้องส่งไปจริง · ปุ่มขั้นนี้บอกปลายทาง ("มีครบ — ไปเสนอราคา") ไม่ใช่ "ยืนยัน"
      await page.getByText(/ไปเสนอราคา$/).locator("visible=true").last().click();
      await page.waitForTimeout(3500);
      offRow().endsWith("|true") && st() === "AWAITING_QUOTE" && offAns() === `true|${SRC}|${DETAIL}|S001|true`
        ? pass("กดยืนยันตามที่ติดให้ → หาได้ ลงผลเช็คของแอดมิน · ไปขั้นเสนอราคา · คำตอบหัวหน้าภาคไม่ถูกทับ (ฐานข้อมูล)")
        : fail(`หลังเช็ค: ${st()} · ${offRow()} · ${offAns()}`);
      // ปุ่มขั้นท้ายการ์ด — ชื่อขั้นบนแถบเป็นวงที่เต้นอยู่ (ขั้นปัจจุบัน) Playwright รอให้นิ่งไม่จบ
      await vis("ส่งใบเสนอราคา").last().click();
      await page.waitForTimeout(1500);
      (await vis("รายการที่ต้องใส่ในใบเสนอราคา").count()) > 0 &&
      (await vis(`อะไหล่นอก · ${NAME} × 2 เส้น · ${SPEC}`).count()) > 0 &&
      (await vis(`หัวหน้าภาคแจ้ง: หาได้ · ${SRC} — ${DETAIL}`).count()) > 0 &&
      (await vis(`ค่าบริการ · ${SVC} × 1 งาน`).count()) > 0 &&
      (await vis("หัวหน้าช่างขอให้เสนอราคา", false).count()) > 0
        ? pass("ขั้นเสนอราคาขึ้นรายการที่ต้องใส่ ครบทั้งอะไหล่นอก (+ แหล่งที่หัวหน้าภาคแจ้ง) และค่าบริการ")
        : fail("ขั้นเสนอราคาไม่ขึ้นรายการครบ");
      await page.screenshot({ path: path.join(DIR, "off-catalog-quote.png") });
      await ctx.close();
    }

    // ── 4) ข้อความจ่ายงาน LINE — พาใบไปคอนเฟิร์มลูกค้าแล้วในฐานข้อมูล (ขั้นเสนอราคา/นัด/เบิก ไม่ใช่เรื่องของชุดนี้) ──
    {
      const team = fx.sql(`select zone from "Branch" where code='${branch}'`);
      const aid = fx.sql(`select id from "User" where "employeeCode"='A001'`);
      fx.sql(`update "WorkOrder" set status='ASSIGNED', "scheduledAt"='${visitDay(30)}', "scheduledTime"='10:00', "appointmentStatus"='CONFIRMED', "assignedTeam"='${team}' where id=${wo.id}`);
      fx.sql(`insert into "WorkOrderLog"("workOrderId","userId",action,status,note) values (${wo.id},${aid},'CONFIRMED','ASSIGNED','ทดสอบ — แหล่งของนอกสโตร์ในไลน์')`);
      const ctx = await browser.newContext({ viewport: { width: 1300, height: 950 }, permissions: ["clipboard-read", "clipboard-write"] });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
      await vis("รายงาน").first().click();
      await page.waitForTimeout(2000);
      await vis("สรุปคอนเฟิร์มลูกค้า").first().click();
      await page.waitForTimeout(2500);
      const line = `(ของนอกสโตร์ · ${SRC} — ${DETAIL})`;
      (await vis(wo.code).count()) > 0 && (await vis(`ของนอกสโตร์ · ${SRC} — ${DETAIL}`).count()) > 0
        ? pass("หน้าสรุปคอนเฟิร์มลูกค้า: กล่องอะไหล่ของใบบอกแหล่ง \"ของนอกสโตร์ · ร้านหาของมาเอง — รายละเอียด\" (คำเดียวกับไลน์)")
        : fail("กล่องอะไหล่ในหน้าสรุปไม่บอกแหล่ง");
      await page.locator('[aria-label="คัดลอกข้อความแจ้งลูกค้า"]').locator("visible=true").first().click();
      await page.waitForTimeout(500);
      const lines = (await page.evaluate(() => navigator.clipboard.readText())).split("\n");
      const at = lines.indexOf(`- ${NAME} x2 เส้น`);
      at >= 0 && lines[at + 1] === line && !lines.some((l) => l.includes(SPEC)) && lines.every((l) => !l.startsWith(" "))
        ? pass("ข้อความ LINE: \"- ชื่อ x2 เส้น\" แล้วบรรทัด \"(ของนอกสโตร์ · ร้านหาของมาเอง — รายละเอียด)\" · ไม่มีหมายเหตุสเปค · ไม่เยื้อง")
        : fail(`ข้อความ LINE: ${JSON.stringify(lines.slice(Math.max(0, at - 1), at + 3))}`);
      await page.screenshot({ path: path.join(DIR, "off-catalog-line.png"), fullPage: true });
      await ctx.close();
    }
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    if (fx) {
      await fx.cleanup();
      fx.sql(`delete from "SparePart" where "offCatalog" and name='${NAME}'`);
    }
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
