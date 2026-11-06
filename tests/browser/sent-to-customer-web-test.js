// ทดสอบ: อะไหล่ส่งให้ลูกค้าแล้ว (เจ้าของงานขอ พ.ย. 69 — เพิ่มปุ่มในการเบิกคลัง 94 ของแอดมิน · เลือกทีละชิ้น · ขั้นตอนไม่เปลี่ยน)
//   · ฟอร์มเบิก: ชิ้นคลัง 94 มีปุ่ม "รับที่คลัง" / "อะไหล่ส่งให้ลูกค้าแล้ว" — ค่าตั้งต้นรับที่คลัง (aria-pressed) · คำอธิบายบรรทัดเดียว
//     · ชิ้นคลังอื่นไม่มีปุ่มนี้ · แอดมินกดส่งให้ลูกค้าแล้วหนึ่งชิ้นจากสองชิ้น → ฐานข้อมูลเก็บเฉพาะชิ้นนั้น · ไปคอนเฟิร์มลูกค้าตามเดิม
//   · หน้าใบงาน: รายการอะไหล่ "ใบเบิก … · ส่งให้ลูกค้าแล้ว" · ประวัติรายตัวต่อท้ายคำเดียวกัน · กล่องอะไหล่ในฟอร์มคอนเฟิร์มลูกค้า
//   · สรุปคอนเฟิร์มลูกค้า: แถวเคสบอก "ส่งให้ลูกค้าแล้ว" แทน "รับที่คลัง…" · ข้อความคัดลอกส่งไลน์: ชิ้นที่ส่ง "(รหัส · ใบเบิก · ส่งให้ลูกค้าแล้ว)"
//     ชิ้นที่รับที่คลังยังบอกคลัง · ใบที่ส่งครบทุกชิ้นไม่มีคำว่าคลังเลย (ไม่บอกให้ทีมแวะคลัง)
// หาปุ่มด้วยข้อความ (ปุ่มบนเว็บไม่ใช่ role=button — CLAUDE.md) · ยืนยันผลที่ฐานข้อมูลทุกขั้น
// ต้องมี DATABASE_URL · backend :4000 · expo web :8081
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
    const branch = "C0006";
    const team = fx.sql(`select zone from "Branch" where code='${branch}'`);
    const L94 = "คลังลาดพร้าว 94";
    // ใบหลัก: สองชิ้น (แอดมินกดผ่านหน้าจอ) · ใบที่สอง: ชิ้นเดียว ส่งให้ลูกค้าแล้วทั้งใบ (เบิกผ่าน API — ดูข้อความไลน์ของใบที่ส่งครบ)
    const wo = await fx.workOrder(branch, null);
    const board = fx.fxPart(wo.id, "BOARD"), belt = fx.fxPart(wo.id, "BELT");
    await fx.call(fx.supervisor(), "POST", `/work-orders/${wo.id}/parts`, {
      needsParts: true, parts: [{ sparePartId: board, quantity: 1 }, { sparePartId: belt, quantity: 2 }],
    });
    const wo2 = await fx.workOrder(branch, null);
    const board2 = fx.fxPart(wo2.id, "BOARD");
    await fx.call(fx.supervisor(), "POST", `/work-orders/${wo2.id}/parts`, { needsParts: true, parts: [{ sparePartId: board2, quantity: 1 }] });
    const codeOf = (id) => fx.sql(`select "partCode" from "SparePart" where id=${id}`);
    const BC = codeOf(board), LC = codeOf(belt), BC2 = codeOf(board2);
    // ขั้นเบิกอยู่หลังนัดวัน (ต.ค. 69 รอบสอง) — ใบจริงมีทีม วัน และยังไม่คอนเฟิร์ม · ข้ามเช็คอะไหล่/เสนอราคา ทดสอบเฉพาะขั้นเบิก
    const visit = visitDay(12);
    for (const id of [wo.id, wo2.id]) {
      fx.sql(`update "WorkOrder" set status='PARTS_REQUESTED', "assignedTeam"='${team}', "scheduledAt"='${visit}', "appointmentStatus"='PENDING' where id=${id}`);
    }
    const st = (id) => fx.sql(`select status from "WorkOrder" where id=${id}`);
    const sent = (id, pid) =>
      fx.sql(`select coalesce("requisitionNo",'-')||'|'||("sentToCustomerAt" is not null) from "WorkOrderPart" where "workOrderId"=${id} and "sparePartId"=${pid} and kind='WAITING'`);

    async function login(who, viewport = { width: 420, height: 900 }) {
      const ctx = await browser.newContext({ viewport, permissions: ["clipboard-read", "clipboard-write"] });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(who);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
      return { ctx, page, vis, label: (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true").last() };
    }
    async function openOrder(p, code) {
      await p.vis("ใบงาน").last().click();
      await p.page.waitForTimeout(2500);
      await p.page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
      await p.page.waitForTimeout(2500);
      await p.vis(code).last().click();
      await p.page.waitForTimeout(3000);
    }
    async function pick94(p, partCode, nth) {
      await p.vis("มีของ").nth(nth).click();
      await p.page.waitForTimeout(300);
      await p.label(`คลังที่มี ${partCode}`).click();
      await p.page.waitForTimeout(600);
      await p.page.getByPlaceholder("ค้นหา").locator("visible=true").first().fill("ลาดพร้าว");
      await p.page.waitForTimeout(700);
      await p.vis(L94).last().click();
      await p.page.waitForTimeout(500);
    }
    // ปุ่มของชิ้นหนึ่ง หาด้วยข้อความภายในกลุ่มของชิ้นนั้น (สองชิ้นมีปุ่มชื่อเดียวกัน) · สถานะ "ติดอยู่" อ่านจาก aria-pressed
    const choice = (p, partCode, text) =>
      p.page.locator(`[aria-label="ส่งให้ลูกค้าแล้วหรือรับที่คลัง ${partCode}"]`).locator("visible=true").last()
        .locator("[aria-pressed]", { has: p.page.getByText(text, { exact: true }) });
    const pressed = async (p, partCode, text) => (await choice(p, partCode, text).getAttribute("aria-pressed")) === "true";

    // ── แอดมินเบิกผ่านหน้าจอ
    const a = await login("A001");
    await openOrder(a, wo.code);
    await a.vis("เบิกอะไหล่ (คลัง 94)").last().click();
    await a.page.waitForTimeout(1200);
    (await a.vis("อะไหล่ส่งให้ลูกค้าแล้ว").count()) === 0
      ? pass("ยังไม่เลือกคลัง: ไม่มีปุ่มส่งให้ลูกค้าแล้ว") : fail("ปุ่มขึ้นก่อนเลือกคลัง 94");
    await pick94(a, BC, 0);
    await pick94(a, LC, 1);
    await a.label("เลขใบเบิกอะไหล่").fill("RQ-SENT-1");
    await a.page.waitForTimeout(300);
    (await pressed(a, BC, "รับที่คลัง")) && !(await pressed(a, BC, "อะไหล่ส่งให้ลูกค้าแล้ว")) &&
    (await pressed(a, LC, "รับที่คลัง")) && !(await pressed(a, LC, "อะไหล่ส่งให้ลูกค้าแล้ว"))
      ? pass("ชิ้นคลัง 94 ทุกชิ้นมีปุ่มสองทาง ค่าตั้งต้น \"รับที่คลัง\" (aria-pressed)") : fail("ค่าตั้งต้นไม่ใช่รับที่คลัง");
    const hint = a.page.getByText(/^อะไหล่ส่งให้ลูกค้าแล้ว = ช่างไม่ต้องไปรับ/).locator("visible=true");
    (await hint.count()) === 1 ? pass("คำอธิบายบรรทัดเดียว: ช่างไม่ต้องไปรับชิ้นนั้นที่คลัง (ขึ้นครั้งเดียว ไม่ซ้ำทุกชิ้น)") : fail(`คำอธิบายขึ้น ${await hint.count()} ครั้ง`);
    await choice(a, BC, "อะไหล่ส่งให้ลูกค้าแล้ว").click();
    await a.page.waitForTimeout(400);
    (await pressed(a, BC, "อะไหล่ส่งให้ลูกค้าแล้ว")) && !(await pressed(a, BC, "รับที่คลัง")) && (await pressed(a, LC, "รับที่คลัง"))
      ? pass("กดส่งให้ลูกค้าแล้วที่บอร์ด: ติดเฉพาะชิ้นนั้น สายพานยังรับที่คลัง") : fail("ปุ่มติดผิดชิ้น");
    await a.page.screenshot({ path: path.join(DIR, "sent-to-customer-form.png"), fullPage: true });
    // ชิ้นที่เปลี่ยนไปคลังอื่นไม่มีปุ่มนี้ (หัวหน้าภาคเบิก — ไม่อยู่ในเรื่องนี้) · เปลี่ยนกลับเป็น 94 ปุ่มกลับมา
    await a.label(`คลังที่มี ${LC}`).click();
    await a.page.waitForTimeout(600);
    await a.page.getByPlaceholder("ค้นหา").locator("visible=true").first().fill("ภูเก็ต");
    await a.page.waitForTimeout(700);
    await a.vis("คลังภูเก็ต").last().click();
    await a.page.waitForTimeout(500);
    (await a.page.locator(`[aria-label="ส่งให้ลูกค้าแล้วหรือรับที่คลัง ${LC}"]`).locator("visible=true").count()) === 0 &&
    (await a.page.locator(`[aria-label="ส่งให้ลูกค้าแล้วหรือรับที่คลัง ${BC}"]`).locator("visible=true").count()) === 1
      ? pass("ชิ้นที่เลือกคลังอื่น (หัวหน้าภาคเบิก) ไม่มีปุ่มส่งให้ลูกค้าแล้ว") : fail("ปุ่มขึ้นกับชิ้นคลังอื่น");
    await a.label(`คลังที่มี ${LC}`).click();
    await a.page.waitForTimeout(600);
    await a.page.getByPlaceholder("ค้นหา").locator("visible=true").first().fill("ลาดพร้าว");
    await a.page.waitForTimeout(700);
    await a.vis(L94).last().click();
    await a.page.waitForTimeout(500);
    await a.vis("ยืนยัน").last().click();
    await a.page.waitForTimeout(3500);
    const db1 = `${st(wo.id)}|${sent(wo.id, board)}|${sent(wo.id, belt)}`;
    db1 === "AWAITING_CONFIRM|RQ-SENT-1|true|RQ-SENT-1|false"
      ? pass("ฐานข้อมูล: บอร์ดส่งให้ลูกค้าแล้ว · สายพานรับที่คลัง · เลขใบเบิกทั้งคู่ · ไปคอนเฟิร์มลูกค้าตามเดิม") : fail(`ฐานข้อมูล: ${db1}`);

    // ── หน้าใบงาน: รายการอะไหล่ · ประวัติ
    await a.page.reload({ waitUntil: "networkidle" });
    await a.page.waitForTimeout(3500);
    (await a.vis("ใบเบิก RQ-SENT-1 · ส่งให้ลูกค้าแล้ว").count()) === 1 && (await a.vis("ใบเบิก RQ-SENT-1").count()) === 1
      ? pass("รายการอะไหล่ในใบงาน: ชิ้นที่ส่ง \"ใบเบิก … · ส่งให้ลูกค้าแล้ว\" · อีกชิ้นใบเบิกอย่างเดียว")
      : fail(`รายการอะไหล่: ส่งแล้ว ${await a.vis("ใบเบิก RQ-SENT-1 · ส่งให้ลูกค้าแล้ว").count()} · ปกติ ${await a.vis("ใบเบิก RQ-SENT-1").count()}`);
    (await a.page.getByText(`${BC} ×1 · ${L94} · ใบเบิก RQ-SENT-1 — แอดมินเบิกแล้ว · ส่งให้ลูกค้าแล้ว`).locator("visible=true").count()) > 0
      ? pass("ประวัติรายตัวต่อท้าย \"· ส่งให้ลูกค้าแล้ว\"") : fail("ประวัติไม่บอกว่าส่งให้ลูกค้าแล้ว");
    await a.page.screenshot({ path: path.join(DIR, "sent-to-customer-detail.png"), fullPage: true });
    // ฟอร์มคอนเฟิร์มลูกค้า — กล่องอะไหล่ที่แอดมินเห็นก่อนโทรร้าน
    await a.vis("คอนเฟิร์มลูกค้า").last().click();
    await a.page.waitForTimeout(1200);
    (await a.page.getByText(`${BC} × 1 — เบิกแล้ว · ${L94} · ใบเบิก RQ-SENT-1 · ส่งให้ลูกค้าแล้ว`).locator("visible=true").count()) > 0
      ? pass("ฟอร์มคอนเฟิร์มลูกค้า: กล่องอะไหล่บอกชิ้นที่ส่งให้ลูกค้าแล้ว") : fail("กล่องอะไหล่ในฟอร์มคอนเฟิร์มไม่บอก");
    await a.ctx.close();

    // ── คอนเฟิร์มลูกค้าทั้งสองใบ (ใบที่สองเบิกผ่าน API ส่งให้ลูกค้าแล้วทั้งใบ) แล้วดูสรุปคอนเฟิร์มลูกค้า
    await fx.call(fx.A, "POST", `/work-orders/${wo2.id}/parts-check`, {
      results: [{ sparePartId: board2, inStock: true, warehouse: L94, requisitionNo: "RQ-SENT-2", sentToCustomer: true }],
    });
    for (const id of [wo.id, wo2.id]) await fx.confirm(id);
    const db2 = `${st(wo.id)}|${st(wo2.id)}|${sent(wo2.id, board2)}`;
    db2 === "ASSIGNED|ASSIGNED|RQ-SENT-2|true" ? pass("คอนเฟิร์มลูกค้าแล้วทั้งสองใบ → รอปล่อยงาน (ขั้นตอนเดิม)") : fail(`หลังคอนเฟิร์ม: ${db2}`);
    const r = await login("A001", { width: 1300, height: 950 });
    await r.vis("รายงาน").first().click();
    await r.page.waitForTimeout(2000);
    await r.vis("สรุปคอนเฟิร์มลูกค้า").first().click();
    await r.page.waitForTimeout(2500);
    (await r.vis("เบิกแล้ว RQ-SENT-1 · ส่งให้ลูกค้าแล้ว").count()) === 1 && (await r.vis(`เบิกแล้ว RQ-SENT-1 · รับที่${L94}`).count()) === 1 &&
    (await r.vis("เบิกแล้ว RQ-SENT-2 · ส่งให้ลูกค้าแล้ว").count()) === 1
      ? pass("สรุปคอนเฟิร์มลูกค้า: ชิ้นที่ส่ง \"ส่งให้ลูกค้าแล้ว\" แทน \"รับที่คลัง…\" · ชิ้นที่รับที่คลังบอกคลังตามเดิม")
      : fail("แถวเคสในสรุปคอนเฟิร์มลูกค้าไม่บอกส่งให้ลูกค้าแล้ว");
    await r.page.screenshot({ path: path.join(DIR, "sent-to-customer-confirmed.png"), fullPage: true });
    await r.page.locator('[aria-label="คัดลอกข้อความแจ้งลูกค้า"]').locator("visible=true").first().click();
    await r.page.waitForTimeout(500);
    const text = await r.page.evaluate(() => navigator.clipboard.readText());
    // แต่ละงานคั่นด้วยเส้น — ตัดเอาเฉพาะช่วงของใบนั้น
    const job = (code) => text.split("------------------------").find((s) => s.includes(`เลขที่ใบงาน: ${code}`)) ?? "";
    const j1 = job(wo.code).split("\n"), j2 = job(wo2.code);
    j1.includes(`(${BC} · RQ-SENT-1 · ส่งให้ลูกค้าแล้ว)`) && j1.includes(`(${LC} · RQ-SENT-1 · ${L94})`)
      ? pass("ข้อความไลน์: ชิ้นที่ส่ง (รหัส · ใบเบิก · ส่งให้ลูกค้าแล้ว) · ชิ้นที่รับที่คลังยังบอกคลัง")
      : fail(`ข้อความไลน์ใบผสม: ${j1.join(" | ")}`);
    j2.includes(`(${BC2} · RQ-SENT-2 · ส่งให้ลูกค้าแล้ว)`) && !j2.includes("คลัง")
      ? pass("ข้อความไลน์ใบที่ส่งครบทุกชิ้น: ไม่มีคำว่าคลัง — ไม่บอกให้ทีมแวะรับของ")
      : fail(`ข้อความไลน์ใบที่ส่งครบ: ${j2.replace(/\n/g, " | ")}`);
    await r.ctx.close();

    errors.length ? fail(`page errors: ${errors.join(" | ").slice(0, 300)}`) : pass("ไม่มี error ในหน้า");
  } catch (e) {
    fail(String(e && e.stack ? e.stack : e).slice(0, 600));
  } finally {
    if (fx) await fx.cleanup();
    await browser.close();
  }
})();
