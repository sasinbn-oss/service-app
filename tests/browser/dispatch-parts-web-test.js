// ทดสอบ: อะไหล่ที่ต้องเปลี่ยนในงานที่จ่ายให้ช่าง (ตัวอย่างที่เจ้าของงานเลือก 3 พ.ย. 69)
//        · การ์ด "งานของฉันวันนี้": กล่อง "อะไหล่ที่ต้องเปลี่ยน · n รายการ" — รหัส ชื่อ จำนวน · เบิกแล้ว RQ · รับที่คลัง · ของนอกสโตร์บอกหัวหน้าภาคจัดหา
//          ไม่มีบรรทัดเทา "อะไหล่: …" แบบเดิมแล้ว · งานตรวจหน้างานบอกว่ายังไม่มีอะไหล่
//        · หน้าใบงานของช่าง: ตาราง "อะไหล่ที่ต้องใช้" เดิมมีรหัส คลัง ใบเบิกอยู่แล้ว — ไม่มีกล่องซ้ำ
//        ใบงานเตรียมทาง API + SQL (ขั้นช่าง วันนี้ ทีมของ T001) · เทียบข้อความบนจอกับแถวในฐานข้อมูล · ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const path = require("path");
const { setup, fxPart } = require("./fixture");
const DIR = __dirname;

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  let fx = null;
  const OFF = "[นอกสโตร์] ZDP สายน้ำเข้า ทดสอบ";
  try {
    fx = await setup();
    const team = fx.sql(`select team from "User" where "employeeCode"='T001'`);
    const repair = await fx.workOrder("C0006", null);
    const inspect = await fx.workOrder("C0006", null);
    // ขั้นช่าง วันนี้ ทีมของ T001 — ข้ามขั้นของแอดมิน/หัวหน้าภาค เทสต์นี้ดูแค่สิ่งที่ช่างเห็น
    for (const [wo, st] of [[repair, "IN_PROGRESS"], [inspect, "INSPECTING"]]) {
      fx.sql(`update "WorkOrder" set status='${st}', "assignedTeam"='${team}', "appointmentStatus"='CONFIRMED',
        "scheduledAt"=date_trunc('day', now() at time zone 'Asia/Bangkok'), "scheduledTime"='09:00' where id=${wo.id}`);
    }
    const board = fxPart(repair.id, "BOARD");
    fx.sql(`insert into "WorkOrderPart"("workOrderId","sparePartId",quantity,kind,"inStock",warehouse,"requisitionNo")
      values (${repair.id}, ${board}, 1, 'WAITING', true, 'คลังลาดพร้าว 94', 'RQ-DPW1')`);
    const offId = fx.sql(`insert into "SparePart"("partCode",name,"offCatalog","updatedAt") values ('${OFF}','ZDP สายน้ำเข้า ทดสอบ',true,now()) returning id`).split("\n")[0];
    fx.sql(`insert into "WorkOrderPart"("workOrderId","sparePartId",quantity,kind,"inStock") values (${repair.id}, ${offId}, 1, 'WAITING', true)`);
    const [code, name] = fx.sql(`select "partCode"||'|'||name from "SparePart" where id=${board}`).split("|");
    fx.sql(`select count(*) from "WorkOrderPart" where "workOrderId"=${repair.id} and kind='WAITING'`) === "2"
      ? pass("เตรียมใบซ่อม: อะไหล่ที่รอ 2 ตัว (ในสโตร์เบิกแล้ว + นอกสโตร์) ในฐานข้อมูล")
      : fail("เตรียมอะไหล่ไม่ได้");

    const page = await browser.newPage({ viewport: { width: 420, height: 1000 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const byLabel = (l) => page.getByLabel(l, { exact: true }).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("T001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(4000);

    // ── การ์ดงานของฉันวันนี้ ──
    const cardText = async (wo) => ((await byLabel(`งาน ${wo.code}`).first().textContent().catch(() => "")) ?? "");
    const rc = await cardText(repair);
    rc.includes("อะไหล่ที่ต้องเปลี่ยน · 2 รายการ") && rc.includes(`${code} ${name}`) && rc.includes("× 1") &&
    rc.includes("เบิกแล้ว RQ-DPW1 · รับที่คลังลาดพร้าว 94") && rc.includes("ZDP สายน้ำเข้า ทดสอบ") &&
    rc.includes("ของนอกสโตร์ · หัวหน้าภาคจัดหาให้") && !rc.includes(OFF) && !rc.includes("อะไหล่: ")
      ? pass("การ์ดงานซ่อม: กล่องอะไหล่ที่ต้องเปลี่ยน 2 รายการ — รหัส ชื่อ จำนวน · เบิกแล้ว RQ · รับที่คลัง · ของนอกสโตร์ไม่มีรหัส บอกหัวหน้าภาคจัดหา · ไม่มีบรรทัดเทาแบบเดิม")
      : fail(`การ์ดงานซ่อม: ${rc.slice(0, 400)}`);
    const ic = await cardText(inspect);
    ic.includes("ตรวจหน้างาน — ยังไม่มีอะไหล่ (เลือกตอนส่งผลตรวจ)") && !ic.includes("อะไหล่ที่ต้องเปลี่ยน")
      ? pass("การ์ดงานตรวจหน้างาน: บอกว่ายังไม่มีอะไหล่ ไม่มีกล่อง")
      : fail(`การ์ดงานตรวจ: ${ic.slice(0, 300)}`);
    await byLabel(`งาน ${repair.code}`).first().scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(DIR, "dispatch-parts-1-myjobs.png") });

    // ── หน้าใบงานของช่าง ──
    // ปุ่ม "รายละเอียด" บนการ์ดพาไปหน้าใบงาน (แตะตัวการ์ดไม่เปิดใบ)
    await byLabel(`งาน ${repair.code}`).first().getByText("รายละเอียด", { exact: true }).click();
    await page.waitForTimeout(3500);
    /**
     * หน้าใบงานไม่มีกล่องซ้ำ — ตาราง "อะไหล่ที่ต้องใช้" (รหัส · คลัง · ใบเบิก) อยู่ในการ์ดขั้นปัจจุบันอยู่แล้ว
     * (ตัวอย่างเสนอกล่องบนสุดเพราะเข้าใจผิดว่าตารางอยู่ล่างสุด — ตรวจกับจอจริงแล้วเอาออก)
     * กล่องที่ยังนับได้คือของการ์ดงานของฉันที่อยู่ใต้หน้าต่างใบงาน ต้องเหลือแค่กล่องเดียว
     */
    const sheet = ((await page.locator("body").innerText()) ?? "");
    sheet.includes("อะไหล่ที่ต้องใช้") && sheet.includes("ใบเบิก RQ-DPW1") && (await byLabel("อะไหล่ที่ต้องเปลี่ยน 2 รายการ").count()) === 1
      ? pass("หน้าใบงานของช่าง: ตารางอะไหล่ที่ต้องใช้มีรหัส คลัง ใบเบิก อยู่แล้ว · ไม่มีกล่องซ้ำ")
      : fail(`หน้าใบงาน: กล่อง ${await byLabel("อะไหล่ที่ต้องเปลี่ยน 2 รายการ").count()} · ตาราง=${sheet.includes("อะไหล่ที่ต้องใช้")} · ใบเบิก=${sheet.includes("ใบเบิก RQ-DPW1")}`);
    await page.screenshot({ path: path.join(DIR, "dispatch-parts-2-order.png") });
    // ดูอย่างเดียว — ไม่มีอะไรในฐานข้อมูลเปลี่ยน
    fx.sql(`select status||'|'||(select count(*) from "WorkOrderPart" p where p."workOrderId"=w.id and kind='WAITING') from "WorkOrder" w where id=${repair.id}`) === "IN_PROGRESS|2"
      ? pass("เปิดดูแล้วใบยังอยู่ขั้นช่าง อะไหล่ที่รอครบ 2 ตัว (ฐานข้อมูล)")
      : fail("ฐานข้อมูลเปลี่ยนระหว่างเปิดดู");
  } catch (e) {
    fail(String(e));
  } finally {
    if (fx) {
      await fx.cleanup();
      fx.sql(`delete from "SparePart" where "partCode"='${OFF}'`);
    }
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
