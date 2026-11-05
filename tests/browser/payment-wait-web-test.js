// ทดสอบ: ขั้นรอลูกค้าจ่ายเงิน ผ่านหน้าจอจริง (เจ้าของงานเลือก 5 พ.ย. 69 · ตามตัวอย่างที่ตกลง)
//   · หน้าใบงาน (จอคอม): ป้ายหัวใบ "รอลูกค้าจ่ายเงิน" · แถบขั้นตอน ขั้น 3 "รอลูกค้าจ่ายเงิน" ใต้ชื่อ "ลูกค้า · แอดมินแนบบิล" ·
//     ขั้นก่อนหน้า "ส่งใบเสนอราคาแล้ว" · การ์ด "ขั้นปัจจุบัน · รอลูกค้า" · ส่งใบเสนอราคาแล้ว + ปุ่มเปิดใบเสนอราคา (เปิดดูได้จริง) ·
//     "เริ่มรอวันนี้" · "ยังไม่เคยตาม" · ปุ่ม ลูกค้าไม่ซ่อม / ตามลูกค้าแล้ว / ลูกค้าจ่ายแล้ว · แนบบิล
//   · ตามลูกค้าแล้ว: ฟอร์มกางชิดแถวปุ่ม → บันทึก → ฐานข้อมูลมีประวัติ PAYMENT_FOLLOWUP (ใคร หมายเหตุ) · การ์ดขึ้น "(1 ครั้ง)"
//   · ถอยเวลา 5 วันทาง SQL: ป้าย "รอลูกค้าจ่ายเงิน · 5 วัน" พื้นแดง · "รอมาแล้ว 5 วัน" · "เกิน 3 วัน — ควรตามลูกค้า" · ขอบการ์ดแดง
//   · งานของฉันวันนี้ (แอดมิน): กลุ่ม "รอลูกค้าจ่ายเงิน" เรียงรอนานสุดก่อน · ตามล่าสุด / "ยังไม่เคยตาม" · ปุ่ม "เกิน 3 วัน 1 ใบ"
//     (aria-selected) กดแล้วเหลือใบเดียว · กล่องงาน: หัวข้อ "รอลูกค้าจ่ายเงิน 2 · เกิน 3 วัน 1" เรียงรอนานสุดก่อน ·
//     ชิป "รอจ่ายเกิน 3 วัน" กรองหัวข้อและรายการเหลือใบที่เกิน แถวบอกรอมาแล้ว/ตามล่าสุด
//   · ลูกค้าไม่ซ่อม: ไม่เลือกเหตุผลกดแล้วไม่ส่ง · ชิป "อื่น ๆ" ติด (aria-selected) แต่ไม่พิมพ์ = ไม่ส่ง · พิมพ์แล้วยืนยัน →
//     ฐานข้อมูล CANCELLED + meta รหัสเหตุผล · หน้าใบงานบอก "ยกเลิกแล้ว — เสนอราคาแล้วลูกค้าไม่ซ่อม · อื่น ๆ — …"
//   · รายงานตามผู้เปิดใบงาน: คอลัมน์ "ลูกค้าไม่ซ่อม" + บรรทัด "เสนอราคาแล้วลูกค้าไม่ซ่อม n ใบ: อื่น ๆ n"
//   · หัวหน้าภาคเปิดใบเดียวกัน: เห็นการ์ดรอลูกค้า แต่ไม่มีปุ่ม/ฟอร์ม · "ขั้นนี้รอลูกค้าจ่ายเงิน (แอดมินแนบบิลเมื่อลูกค้าจ่าย)"
//   · มือถือ 390 px: ปุ่มขั้นอยู่บนสุด ปุ่มรองตามมา · กด "ลูกค้าไม่ซ่อม" แล้วฟอร์มอยู่ในจอ (ไม่ไปกางนอกจอ)
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup } = require("./fixture");

const PDF = Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);

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
    // ใบที่ส่งใบเสนอราคาแล้วผ่าน API จริง (แนบ PDF role QUOTE แล้วกดส่ง) — ประวัติ QUOTED ของจริง
    const quoted = async () => {
      const wo = await fx.workOrder("C0006", null);
      fx.sql(`update "WorkOrder" set status='AWAITING_QUOTE', "workStatus"='QUOTING', "needsParts"=false where id=${wo.id}`);
      const fd = new FormData();
      // ชื่อไฟล์ ASCII — ชื่อไทยผ่าน multipart ถูกอ่านเป็น latin1 (เรื่องแยก ไม่ใช่สิ่งที่ทดสอบ)
      fd.append("file", new Blob([PDF], { type: "application/pdf" }), `quotation-${wo.code}.pdf`);
      fd.append("role", "QUOTE");
      await fetch(`http://localhost:4000/api/work-orders/${wo.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${fx.A}` }, body: fd });
      await fx.call(fx.A, "POST", `/work-orders/${wo.id}/quote`, {});
      return wo;
    };
    const a = await quoted();
    const b = await quoted();
    const st = (id) => fx.sql(`select status from "WorkOrder" where id=${id}`);
    st(a.id) === "AWAITING_PAYMENT" && st(b.id) === "AWAITING_PAYMENT"
      ? pass(`เตรียมใบ ${a.code} · ${b.code} ขั้นรอลูกค้าจ่ายเงิน (ฐานข้อมูล)`)
      : fail(`เตรียมใบไม่ถึงขั้นรอเงิน: ${st(a.id)} ${st(b.id)}`);
    const aid = fx.sql(`select id from "User" where "employeeCode"='A001'`);

    const ctx = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const login = async (p, code) => {
      await p.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await p.getByPlaceholder("รหัสพนักงาน").fill(code);
      await p.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await p.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").click();
      await p.waitForTimeout(3500);
    };
    const open = async (p, code) => {
      await p.goto(`http://localhost:8081/#/wo/${code}`);
      await p.waitForTimeout(4500);
    };
    await login(page, "A001");

    // ── หน้าใบงาน: ป้ายและการ์ด ──
    await open(page, a.code);
    (await page.locator('[aria-label="ป้ายสถานะ รอลูกค้าจ่ายเงิน"]').locator("visible=true").count()) > 0
      ? pass("ป้ายหัวใบงาน \"รอลูกค้าจ่ายเงิน\" (เดิม \"แอดมิน · แนบบิลรับเงิน\")") : fail("ป้ายหัวใบงานไม่ใช่รอลูกค้าจ่ายเงิน");
    (await vis("แอดมิน · แนบบิลรับเงิน").count()) === 0 && (await vis("แนบบิลรับเงิน").count()) === 0
      ? pass("ไม่มีคำว่า \"แนบบิลรับเงิน\" บนหน้าใบงาน (เหลือแค่หัวฟอร์มแนบบิล)") : fail("ยังเห็น \"แนบบิลรับเงิน\" บนหน้าใบงาน");
    const bar = page.locator('[aria-label="ขั้นตอนงาน"]');
    (await bar.locator('[aria-label="ขั้น 3 รอลูกค้าจ่ายเงิน · ทำอยู่"]').count()) > 0 &&
    (await bar.getByText("ลูกค้า · แอดมินแนบบิล", { exact: true }).locator("visible=true").count()) > 0 &&
    (await bar.getByText("ส่งใบเสนอราคาแล้ว", { exact: true }).locator("visible=true").count()) > 0
      ? pass("แถบขั้นตอน: ขั้น 3 \"รอลูกค้าจ่ายเงิน\" ทำอยู่ · ใต้ชื่อ \"ลูกค้า · แอดมินแนบบิล\" · ขั้นก่อนหน้า \"ส่งใบเสนอราคาแล้ว\"")
      : fail(`แถบขั้นตอน: ${await bar.innerText()}`);
    (await vis("ขั้นปัจจุบัน · รอลูกค้า").count()) > 0
      ? pass("การ์ด \"ขั้นปัจจุบัน · รอลูกค้า\"") : fail("หัวการ์ดไม่ใช่รอลูกค้า");
    const box = page.locator('[aria-label="กล่องรอลูกค้าจ่ายเงิน"]').locator("visible=true").first();
    const boxText = await box.innerText();
    /ส่งใบเสนอราคาแล้ว · .+ · /.test(boxText) && boxText.includes("เริ่มรอวันนี้") && boxText.includes("ยังไม่เคยตาม") && boxText.includes("(0 ครั้ง)")
      ? pass("กล่อง: ส่งใบเสนอราคาแล้ว · เวลา · ใคร · เริ่มรอวันนี้ · ยังไม่เคยตาม (0 ครั้ง)") : fail(`กล่อง: ${boxText}`);
    const quoteBtn = page.locator(`[aria-label="เปิดใบเสนอราคา quotation-${a.code}.pdf"]`).locator("visible=true");
    if ((await quoteBtn.count()) > 0) {
      pass("ปุ่มเปิดใบเสนอราคา (ไฟล์ที่แนบตอนส่ง)");
      await quoteBtn.first().click();
      await page.waitForTimeout(2500);
      // หน้าดูไฟล์เต็มจอ (ImageViewer) — มีปุ่ม "ปิดรูป" และชื่อไฟล์ · ปิดแล้วกลับหน้าใบงาน
      const close = page.locator('[aria-label="ปิดรูป"]').locator("visible=true");
      (await close.count()) > 0 && (await page.getByText(`quotation-${a.code}.pdf`, { exact: false }).locator("visible=true").count()) > 1
        ? pass("กดแล้วเปิดใบเสนอราคาในหน้าดูไฟล์") : fail("กดปุ่มใบเสนอราคาแล้วไม่เปิดหน้าดูไฟล์");
      if (await close.count()) await close.first().click();
      await page.waitForTimeout(1000);
    } else fail("ไม่มีปุ่มเปิดใบเสนอราคา");
    for (const t of ["ลูกค้าไม่ซ่อม", "ตามลูกค้าแล้ว", "ลูกค้าจ่ายแล้ว · แนบบิล"])
      (await page.locator(`[aria-label="${t}"]`).locator("visible=true").count()) > 0 ? pass(`ปุ่ม "${t}"`) : fail(`ไม่มีปุ่ม "${t}"`);
    await page.screenshot({ path: path.join(DIR, "payment-wait-day0.png") });

    // ── ตามลูกค้าแล้ว ──
    await page.locator('[aria-label="ตามลูกค้าแล้ว"]').locator("visible=true").first().click();
    await page.waitForTimeout(700);
    await page.locator('[aria-label="หมายเหตุการตามลูกค้า"]').locator("visible=true").fill("ลูกค้าบอกโอนวันศุกร์");
    await page.locator('[aria-label="บันทึกการตามลูกค้า"]').locator("visible=true").click();
    await page.waitForTimeout(3500);
    const fu = fx.sql(`select "userId"||'|'||status||'|'||note from "WorkOrderLog" where "workOrderId"=${a.id} and action='PAYMENT_FOLLOWUP' order by id desc limit 1`);
    fu === `${aid}|AWAITING_PAYMENT|ลูกค้าบอกโอนวันศุกร์` ? pass("ฐานข้อมูล: ประวัติ PAYMENT_FOLLOWUP (A001 · ขั้นเดิม · หมายเหตุ)") : fail(`ประวัติตาม: ${fu}`);
    const boxText2 = await page.locator('[aria-label="กล่องรอลูกค้าจ่ายเงิน"]').locator("visible=true").first().innerText();
    boxText2.includes("(1 ครั้ง)") && boxText2.includes("ลูกค้าบอกโอนวันศุกร์") && st(a.id) === "AWAITING_PAYMENT"
      ? pass("การ์ดขึ้นการตาม 1 ครั้งพร้อมหมายเหตุ · ใบอยู่ขั้นเดิม") : fail(`หลังตาม: ${boxText2}`);
    (await page.locator('[aria-label="หมายเหตุการตามลูกค้า"]').locator("visible=true").count()) === 0
      ? pass("บันทึกแล้วฟอร์มพับ") : fail("ฟอร์มยังกางอยู่");

    // ── ถอยเวลา 5 วัน — เกิน 3 วัน ──
    fx.sql(`update "WorkOrderLog" set "createdAt"="createdAt"-interval '5 days' where "workOrderId"=${a.id} and action<>'PAYMENT_FOLLOWUP'; update "WorkOrder" set "createdAt"="createdAt"-interval '5 days' where id=${a.id}`);
    fx.sql(`update "WorkOrderLog" set "createdAt"="createdAt"-interval '1 day' where "workOrderId"=${a.id} and action='PAYMENT_FOLLOWUP'`);
    await open(page, a.code);
    const chip = page.locator('[aria-label="ป้ายสถานะ รอลูกค้าจ่ายเงิน · 5 วัน"]').locator("visible=true").first();
    const chipBg = (await chip.count()) ? await chip.evaluate((e) => getComputedStyle(e).backgroundColor) : "";
    chipBg === "rgb(254, 242, 242)" ? pass("ป้ายหัวใบ \"รอลูกค้าจ่ายเงิน · 5 วัน\" พื้นแดง") : fail(`ป้าย 5 วัน: bg=${chipBg}`);
    (await vis("รอมาแล้ว 5 วัน").count()) > 0 && (await vis("เกิน 3 วัน — ควรตามลูกค้า").count()) > 0
      ? pass("\"รอมาแล้ว 5 วัน\" · \"เกิน 3 วัน — ควรตามลูกค้า\"") : fail("ไม่ขึ้นรอมาแล้ว 5 วัน/เกิน 3 วัน");
    const cardBorder = await page.locator('[aria-label="กล่องรอลูกค้าจ่ายเงิน"]').locator("visible=true").first()
      .evaluate((e) => { let n = e.parentElement; return n ? getComputedStyle(n).borderTopColor : ""; });
    cardBorder === "rgb(254, 202, 202)" ? pass("ขอบการ์ดขั้นปัจจุบันแดง") : fail(`ขอบการ์ด: ${cardBorder}`);
    await page.screenshot({ path: path.join(DIR, "payment-wait-day5.png") });

    // ── งานของฉันวันนี้ ──
    await page.goto("http://localhost:8081/#/my-jobs");
    await page.waitForTimeout(4500);
    const group = page.locator('[aria-label="กลุ่ม รอลูกค้าจ่ายเงิน"]').locator("visible=true").first();
    if ((await group.count()) === 0) fail("ไม่มีกลุ่ม \"รอลูกค้าจ่ายเงิน\" ในงานของฉันวันนี้");
    else {
      await group.scrollIntoViewIfNeeded();
      const g = await group.innerText();
      const ia = g.indexOf(a.code), ib = g.indexOf(b.code);
      ia >= 0 && ib > ia ? pass("กลุ่มรอลูกค้าจ่ายเงิน: ใบที่รอนานกว่า (5 วัน) ขึ้นก่อน") : fail(`ลำดับในกลุ่ม: ${g}`);
      // การตามถูกถอยไป 1 วัน — วันที่ขึ้นเป็นวันจริง (เช่น "4 พ.ย.") ไม่ใช่ "วันนี้"
      g.includes("รอมาแล้ว 5 วัน") && /ตามล่าสุด \d+ \S+ · ลูกค้าบอกโอนวันศุกร์/.test(g) && g.includes("ยังไม่เคยตาม")
        ? pass("การ์ด: รอมาแล้ว 5 วัน · ตามล่าสุด … ลูกค้าบอกโอนวันศุกร์ · อีกใบ \"ยังไม่เคยตาม\"") : fail(`การ์ดในกลุ่ม: ${g}`);
      (await group.getByText("ลูกค้าจ่ายแล้ว · แนบบิล", { exact: true }).count()) >= 2 ? pass("ปุ่มบนการ์ด \"ลูกค้าจ่ายแล้ว · แนบบิล\"") : fail("ปุ่มบนการ์ดไม่ใช่ลูกค้าจ่ายแล้ว");
      const late = group.locator('[aria-label="ดูเฉพาะรอจ่ายเกิน 3 วัน 1 ใบ"]');
      (await late.getAttribute("aria-selected")) === "false" ? pass("ปุ่ม \"เกิน 3 วัน 1 ใบ\" ยังไม่ติด") : fail(`aria-selected ก่อนกด: ${await late.getAttribute("aria-selected")}`);
      await late.click();
      await page.waitForTimeout(800);
      const g2 = await page.locator('[aria-label="กลุ่ม รอลูกค้าจ่ายเงิน"]').locator("visible=true").first().innerText();
      (await page.locator('[aria-label="ดูเฉพาะรอจ่ายเกิน 3 วัน 1 ใบ"]').getAttribute("aria-selected")) === "true" && g2.includes(a.code) && !g2.includes(b.code) && g2.includes("จาก 2")
        ? pass("กดแล้วเหลือเฉพาะใบที่รอเกิน 3 วัน (1 จาก 2) · ปุ่มติด") : fail(`กรองเกิน 3 วัน: ${g2}`);
    }

    // ── กล่องงาน: หัวข้อรอลูกค้าจ่ายเงิน (แบบเดียวกับไม่มีคนรับ/เลยนัด) · ชิปรอจ่ายเกิน 3 วัน ──
    await page.goto("http://localhost:8081/#/inbox");
    await page.waitForTimeout(4500);
    const head = page.locator('[aria-label="หัวข้อ รอลูกค้าจ่ายเงิน 2 · เกิน 3 วัน 1"]').locator("visible=true").first();
    if ((await head.count()) === 0) fail("กล่องงานไม่มีหัวข้อ \"รอลูกค้าจ่ายเงิน 2 · เกิน 3 วัน 1\"");
    else {
      const h = await head.innerText();
      h.indexOf(a.code) >= 0 && h.indexOf(b.code) > h.indexOf(a.code) && h.includes("รอมาแล้ว 5 วัน") && h.includes("ยังไม่เคยตาม") && /ตามล่าสุด .+ลูกค้าบอกโอนวันศุกร์/.test(h)
        ? pass("กล่องงาน: หัวข้อ \"รอลูกค้าจ่ายเงิน 2 · เกิน 3 วัน 1\" เรียงรอนานสุดก่อน · รอมาแล้ว · ตามล่าสุด/ยังไม่เคยตาม") : fail(`หัวข้อกล่องงาน: ${h}`);
      // ปุ่มย่อหัวข้อ (เจ้าของงานขอ 5 พ.ย. 69 — หัวข้อยาวเต็มจอ): ย่อแล้วเหลือชื่อกับจำนวน · เปิดหน้าใหม่ยังย่ออยู่ · กดอีกครั้งแถวกลับมา
      const PAYT = "รอลูกค้าจ่ายเงิน 2 · เกิน 3 วัน 1";
      const fold = page.locator(`[aria-label="ย่อหัวข้อ ${PAYT}"]`).locator("visible=true").first();
      if ((await fold.count()) === 0) fail(`ไม่มีปุ่มย่อหัวข้อ ${PAYT}`);
      else {
        await fold.click();
        await page.waitForTimeout(600);
        const shut = await head.innerText();
        const unfold = page.locator(`[aria-label="ขยายหัวข้อ ${PAYT}"]`).locator("visible=true").first();
        !shut.includes(a.code) && !shut.includes(b.code) && shut.includes(PAYT) && shut.includes("ขยาย") &&
        (await unfold.count()) > 0 && (await unfold.getAttribute("aria-expanded")) === "false"
          ? pass("กดย่อ: หัวข้อเหลือชื่อกับจำนวน แถวหาย ปุ่มเป็น \"ขยาย\" (aria-expanded=false)") : fail(`ย่อหัวข้อ: ${shut}`);
        await page.goto("http://localhost:8081/#/my-jobs");
        await page.waitForTimeout(1500);
        await page.goto("http://localhost:8081/#/inbox");
        await page.waitForTimeout(4500);
        const again = page.locator(`[aria-label="หัวข้อ ${PAYT}"]`).locator("visible=true").first();
        const t2 = (await again.count()) ? await again.innerText() : "";
        t2.includes(PAYT) && !t2.includes(a.code) && (await page.locator(`[aria-label="ขยายหัวข้อ ${PAYT}"]`).locator("visible=true").count()) > 0
          ? pass("ออกไปหน้าอื่นแล้วกลับมา หัวข้อยังย่ออยู่ (จำในเครื่อง)") : fail(`จำการย่อไม่ได้: ${t2}`);
        await page.locator(`[aria-label="ขยายหัวข้อ ${PAYT}"]`).locator("visible=true").first().click();
        await page.waitForTimeout(600);
        const open2 = await again.innerText();
        open2.includes(a.code) && open2.includes(b.code) && (await page.locator(`[aria-label="ย่อหัวข้อ ${PAYT}"]`).locator("visible=true").count()) > 0
          ? pass("กดขยาย: แถวกลับมาครบ ปุ่มกลับเป็น \"ย่อ\"") : fail(`ขยายหัวข้อ: ${open2}`);
      }
    }
    const qchip = page.locator('[aria-label="ต้องรีบดู รอจ่ายเกิน 3 วัน 1"]').locator("visible=true").first();
    if ((await qchip.count()) === 0) fail("ไม่มีชิป \"รอจ่ายเกิน 3 วัน 1\" ในกล่องงาน");
    else {
      await qchip.click();
      await page.waitForTimeout(1500);
      const h1 = page.locator('[aria-label="หัวข้อ รอลูกค้าจ่ายเงิน 1 · เกิน 3 วัน 1"]').locator("visible=true").first();
      const listText = await page.locator("body").innerText();
      (await h1.count()) > 0 && listText.includes(a.code) && !listText.includes(b.code) && listText.includes("รอมาแล้ว 5 วัน · เกิน 3 วัน")
        ? pass("ชิปรอจ่ายเกิน 3 วัน: หัวข้อกับรายการเหลือใบที่เกิน · แถวบอก \"รอมาแล้ว 5 วัน · เกิน 3 วัน\" + ตามล่าสุด") : fail("ชิปรอจ่ายเกินกรองไม่ถูก");
      await page.screenshot({ path: path.join(DIR, "payment-wait-inbox.png") });
    }

    // ── ลูกค้าไม่ซ่อม (ใบ b) ──
    await open(page, b.code);
    await page.locator('[aria-label="ลูกค้าไม่ซ่อม"]').locator("visible=true").first().click();
    await page.waitForTimeout(700);
    const confirm = page.locator('[aria-label="ยืนยัน ลูกค้าไม่ซ่อม"]').locator("visible=true").first();
    (await confirm.innerText()).includes("เลือกเหตุผลก่อน") ? pass("ยังไม่เลือกเหตุผล ปุ่มบอก \"เลือกเหตุผลก่อน\"") : fail(`ปุ่มยืนยัน: ${await confirm.innerText()}`);
    await confirm.click();
    await page.waitForTimeout(1500);
    st(b.id) === "AWAITING_PAYMENT" ? pass("กดโดยไม่เลือกเหตุผล — ไม่ส่ง (ฐานข้อมูลไม่เปลี่ยน)") : fail(`ไม่เลือกเหตุผลแต่ใบเปลี่ยนเป็น ${st(b.id)}`);
    const other = page.locator('[aria-label="เหตุผลลูกค้าไม่ซ่อม อื่น ๆ"]').locator("visible=true").first();
    await other.click();
    await page.waitForTimeout(500);
    (await other.getAttribute("aria-selected")) === "true" &&
    (await page.locator('[aria-label="เหตุผลลูกค้าไม่ซ่อม ราคาสูงไป"]').locator("visible=true").first().getAttribute("aria-selected")) === "false"
      ? pass("ชิป \"อื่น ๆ\" ติด (aria-selected) ชิปอื่นไม่ติด") : fail("aria-selected ของชิปเหตุผลไม่ถูก");
    (await confirm.innerText()).includes("พิมพ์เหตุผลก่อน") ? pass("อื่น ๆ ยังไม่พิมพ์ — ปุ่มบอก \"พิมพ์เหตุผลก่อน\"") : fail(`ปุ่ม: ${await confirm.innerText()}`);
    await confirm.click();
    await page.waitForTimeout(1500);
    st(b.id) === "AWAITING_PAYMENT" ? pass("อื่น ๆ ไม่พิมพ์ — ไม่ส่ง") : fail("อื่น ๆ ว่างแต่ส่งไปแล้ว");
    await page.screenshot({ path: path.join(DIR, "payment-wait-decline.png") });
    await page.locator('[aria-label="รายละเอียดลูกค้าไม่ซ่อม"]').locator("visible=true").fill("ร้านปิดปรับปรุง ยังไม่ซ่อม");
    await confirm.click();
    await page.waitForTimeout(4000);
    const cancelRow = fx.sql(`select (select status from "WorkOrder" where id=${b.id})||'|'||note||'|'||(meta->>'reasonCode')||'|'||(meta->>'declineReason') from "WorkOrderLog" where "workOrderId"=${b.id} order by id desc limit 1`);
    cancelRow === "CANCELLED|เสนอราคาแล้วลูกค้าไม่ซ่อม · อื่น ๆ — ร้านปิดปรับปรุง ยังไม่ซ่อม|QUOTE_DECLINED|OTHER"
      ? pass("ฐานข้อมูล: ใบยกเลิก · ประวัติ CANCELLED meta QUOTE_DECLINED / OTHER") : fail(`ยกเลิก: ${cancelRow}`);
    (await vis("ยกเลิกแล้ว — เสนอราคาแล้วลูกค้าไม่ซ่อม · อื่น ๆ — ร้านปิดปรับปรุง ยังไม่ซ่อม").count()) > 0
      ? pass("หน้าใบงานบอก \"ยกเลิกแล้ว — เสนอราคาแล้วลูกค้าไม่ซ่อม · อื่น ๆ — …\"") : fail("กล่องยกเลิกไม่บอกเหตุผล");
    (await page.locator('[aria-label="ลูกค้าไม่ซ่อม"]').locator("visible=true").count()) === 0 ? pass("ใบยกเลิกแล้วไม่มีปุ่มขั้นรอเงิน") : fail("ใบยกเลิกยังมีปุ่ม");

    // ── รายงานตามผู้เปิดใบงาน: คอลัมน์ลูกค้าไม่ซ่อม + บรรทัดแยกเหตุผล (ช่วงเริ่มต้น = ต้นเดือนถึงวันนี้ ใบ b เปิดวันนี้) ──
    await page.goto("http://localhost:8081/#/reports/by-opener");
    await page.waitForTimeout(4500);
    const line = page.locator('[aria-label="เสนอราคาแล้วลูกค้าไม่ซ่อม แยกตามเหตุผล"]').locator("visible=true").first();
    const lineText = (await line.count()) ? await line.innerText() : "";
    (await vis("ลูกค้าไม่ซ่อม").count()) > 0 && /เสนอราคาแล้วลูกค้าไม่ซ่อม \d+ ใบ: .*อื่น ๆ \d+/.test(lineText)
      ? pass(`รายงานตามผู้เปิด: คอลัมน์ "ลูกค้าไม่ซ่อม" + "${lineText}"`) : fail(`รายงานตามผู้เปิด: "${lineText}"`);
    await ctx.close();

    // ── หัวหน้าภาคเปิดใบ a: เห็นข้อมูล ไม่มีปุ่ม ──
    const sctx = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
    const sp = await sctx.newPage();
    sp.on("pageerror", (e) => errors.push(String(e)));
    await login(sp, "S001");
    await open(sp, a.code);
    (await sp.locator('[aria-label="กล่องรอลูกค้าจ่ายเงิน"]').locator("visible=true").count()) > 0 &&
    (await sp.locator('[aria-label="ลูกค้าไม่ซ่อม"]').locator("visible=true").count()) === 0 &&
    (await sp.locator('[aria-label="ตามลูกค้าแล้ว"]').locator("visible=true").count()) === 0 &&
    (await sp.getByText("ขั้นนี้รอลูกค้าจ่ายเงิน (แอดมินแนบบิลเมื่อลูกค้าจ่าย)", { exact: false }).locator("visible=true").count()) > 0
      ? pass("หัวหน้าภาค: เห็นกล่องรอลูกค้า ไม่มีปุ่ม · \"ขั้นนี้รอลูกค้าจ่ายเงิน (แอดมินแนบบิลเมื่อลูกค้าจ่าย)\"") : fail("หน้าของหัวหน้าภาคไม่ถูก");
    await sctx.close();

    // ── มือถือ ──
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mp = await mctx.newPage();
    mp.on("pageerror", (e) => errors.push(String(e)));
    await login(mp, "A001");
    await open(mp, a.code);
    const pos = async (label) => {
      const l = mp.locator(`[aria-label="${label}"]`).locator("visible=true").first();
      await l.scrollIntoViewIfNeeded();
      return (await l.boundingBox())?.y ?? -1;
    };
    const yGo = await pos("ลูกค้าจ่ายแล้ว · แนบบิล");
    const yDecline = await pos("ลูกค้าไม่ซ่อม");
    yGo >= 0 && yDecline > yGo ? pass("มือถือ: ปุ่มขั้นอยู่บนสุด ปุ่มรองตามมา") : fail(`ตำแหน่งปุ่ม go=${yGo} decline=${yDecline}`);
    await mp.locator('[aria-label="ลูกค้าไม่ซ่อม"]').locator("visible=true").first().click();
    await mp.waitForTimeout(800);
    const f = await mp.locator('[aria-label="ฟอร์มลูกค้าไม่ซ่อม"]').locator("visible=true").first().boundingBox();
    f && f.y > -50 && f.y < 844 ? pass("มือถือ: กดลูกค้าไม่ซ่อมแล้วฟอร์มอยู่ในจอ") : fail(`ฟอร์มอยู่นอกจอ: ${JSON.stringify(f)}`);
    const wide = await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    wide ? pass("มือถือ: หน้าไม่ล้นจอแนวนอน") : fail("มือถือ: หน้าล้นจอแนวนอน");
    await mp.screenshot({ path: path.join(DIR, "payment-wait-phone.png") });
    await mctx.close();

    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    if (fx) await fx.cleanup();
    await browser.close();
  }
})();
