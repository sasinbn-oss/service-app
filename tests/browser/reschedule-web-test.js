// ทดสอบ: แอดมิน "เลื่อนวันนัด" ได้ตลอดจนช่างเข้างาน (เจ้าของงานเลือก ต.ค. 69 รอบสอง) — กดจากหน้าจอด้วยบทบาทจริง
//   1) ใบที่ขั้นเบิก (ลูกค้ายังไม่คอนเฟิร์ม): ปุ่ม "เลื่อนวันนัด" ในการ์ดขั้นปัจจุบัน → ฟอร์มกันบันทึกจนเปลี่ยนวัน+ใส่เหตุผล
//      → ใบอยู่ขั้นเดิม เปลี่ยนแค่วัน ทีม/สถานะนัดเหมือนเดิม มีประวัติ "แอดมินเลื่อนวันนัด" (ฐานข้อมูล)
//   2) ใบที่ปล่อยงานแล้ว ช่างยังไม่ถึงหน้างาน: เลื่อนแล้วใบถูกดึงคืนไปหัวหน้าภาค (ปล่อยงานใหม่) (ฐานข้อมูล)
//      ลูกค้าคอนเฟิร์มไว้แล้ว → บันทึกแล้วเปิดข้อความแจ้งวันใหม่ให้ร้าน
//   3) ใบที่ขั้นคอนเฟิร์มลูกค้า: ปุ่ม/ลิงก์เลื่อนวันนัดเปิดฟอร์มเลื่อนวันนัด (ไม่ใช่ฟอร์มคอนเฟิร์ม) → ใบอยู่ขั้นคอนเฟิร์มเดิม
//      ยังไม่คอนเฟิร์ม มีประวัติ APPOINTMENT_MOVED (ฐานข้อมูล) — เดิมเปิดฟอร์มคอนเฟิร์มที่ "ลูกค้าขอเลื่อน" ซึ่งบันทึกว่า
//      ลูกค้าคอนเฟิร์มแล้วและส่งใบไปปล่อยงาน ทั้งที่ยังไม่ได้โทรร้าน · ฟอร์มคอนเฟิร์มยังมี "ลูกค้าขอเลื่อน" ไว้ตอนร้านตกลงวันอื่นจริง
//   4) งานของฉันวันนี้ (แอดมิน): ปุ่มลัดเลื่อนวันนัดบนการ์ดเลยนัดเปิดฟอร์มเลื่อนวันนัด · ใบนัดตรวจที่เลยนัดไม่มีปุ่มลัด
//      (หน้าใบงานเลื่อนด้วยฟอร์มนี้ไม่ได้ — เดิมกดแล้วไม่มีอะไรเกิดขึ้น)
//   5) หัวหน้าภาค: ไม่มีปุ่มเลื่อนวันนัด · กล่องงานขึ้น "คอนเฟิร์มวันใหม่" ทั้งใบที่ถูกดึงคืนและใบที่เลื่อนระหว่างเบิกแล้วคอนเฟิร์มวันเดิม
//      · ฟอร์มปล่อยงานบอกว่าแอดมินเลื่อนวันนัด + ทางเลือกทีมว่าง/ไม่ว่าง · คอนเฟิร์มวันใหม่แล้วใบถึงช่าง (ฐานข้อมูล)
//      · นัดตรวจที่แอดมินเลื่อนวัน: ส่งกลับแอดมินนัดตรวจใหม่ได้ → นัดร้าน (ตรวจหน้างาน) (ฐานข้อมูล)
//   6) แอดมินเห็นกล่องส่งกลับหัวข้อกลาง ๆ "ทีมไม่ว่าง โทรนัดร้านใหม่" — วันนั้นแอดมินเลื่อนเอง ไม่ใช่ลูกค้าขอ (ประวัติบอกสาเหตุตามจริง)
//   7) ใบที่ช่างปิดงานแล้วแต่เคลมถูกตีกลับ (กลับมาขั้นช่าง ไม่เคยกดถึงหน้างาน): ไม่มีปุ่มเลื่อนวันนัด · เซิร์ฟเวอร์ปฏิเสธ
//      ด้วยเหตุผล "ช่างปิดงานรอบนี้แล้ว" ไม่ใช่ "ช่างถึงหน้างานแล้ว" (ฐานข้อมูลไม่เปลี่ยน)
//   8) ฟอร์มคอนเฟิร์มลูกค้าที่เปิดค้างไว้ก่อนวันนัดถูกเลื่อน: กดยืนยันแล้วเซิร์ฟเวอร์ปฏิเสธ (วันที่ฟอร์มเห็นไม่ตรง)
//      ไม่บันทึกว่าลูกค้าคอนเฟิร์มวันที่ไม่ได้คุย (ฐานข้อมูล) · คนอื่นเลื่อน → หน้าจอปิดฟอร์มแล้วโหลดใหม่เอง
// ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup, visitDay } = require("./fixture");
const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
/** ชื่อช่องวันในปฏิทิน — แบบเดียวกับ thaiDateLong ของแอป */
const dayLabel = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y + 543}`;
};

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
    // เปิดใบแล้วหัวหน้าภาคระบุอะไหล่ 1 ชิ้น (kind = "BOARD" | "BELT") — ทางเดียวกับ fx.workOrder(สาขา, อะไหล่)
    // แต่เลือกอะไหล่หลังมีใบ เพราะอะไหล่ต้องอยู่ไฟล์ยี่ห้อเดียวกับเครื่องของใบ (fxPart) · คืนใบพร้อม id ที่ส่งไป (wo.pid)
    const withPart = async (branch, kind) => {
      const wo = await fx.workOrder(branch, null);
      wo.pid = fx.fxPart(wo.id, kind);
      await fx.call(fx.supervisor(), "POST", `/work-orders/${wo.id}/parts`, { needsParts: true, parts: [{ sparePartId: wo.pid, quantity: 1 }] });
      return wo;
    };
    const row = (id) =>
      fx.sql(`select status||'|'||coalesce("appointmentStatus",'-')||'|'||coalesce(to_char("scheduledAt",'YYYY-MM-DD'),'-')||'|'||coalesce("assignedTeam",'-') from "WorkOrder" where id=${id}`);
    const team = fx.sql(`select zone from "Branch" where code='C0006'`);
    const lastLog = (id) => fx.sql(`select action||'|'||status||'|'||coalesce(note,'') from "WorkOrderLog" where "workOrderId"=${id} order by id desc limit 1`);

    // P: ใช้อะไหล่ — นัดวันแล้ว รอแอดมินเบิก (ลูกค้ายังไม่คอนเฟิร์ม)
    const dP = visitDay(30), newP = visitDay(33);
    const P = await withPart("C0006", "BOARD");
    await fx.source(P.id);
    await fx.schedule(P.id, dP);
    // R: ไม่ใช้อะไหล่ — คอนเฟิร์มลูกค้าแล้ว ปล่อยงานแล้ว ช่างยังไม่ถึงหน้างาน
    const dR = visitDay(25), newR = visitDay(26);
    const R = await fx.workOrder("C0006", []);
    await fx.schedule(R.id, dR);
    await fx.confirm(R.id);
    await fx.call(fx.supervisor(), "POST", `/work-orders/${R.id}/dispatch`, {});
    row(P.id) === `PARTS_REQUESTED|PENDING|${dP}|${team}` && row(R.id) === `IN_PROGRESS|CONFIRMED|${dR}|${team}`
      ? pass("เตรียมใบ (ฐานข้อมูล): ใบรอเบิก (ยังไม่คอนเฟิร์ม) · ใบที่ช่างรับไปแล้ว (ยังไม่ถึงหน้างาน)")
      : fail(`เตรียมใบ: ${row(P.id)} · ${row(R.id)}`);

    const openAs = async (code, width) => {
      const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
      const open = async (wo) => {
        await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
        await page.waitForTimeout(2500);
        if (width >= 1200) await page.getByLabel("ใบงานซ่อม").first().click();
        else await vis("ใบงาน").last().click();
        await page.waitForTimeout(2500);
        await vis("ทั้งหมด").first().click().catch(() => {});
        await page.waitForTimeout(1200);
        await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(wo.code);
        await page.waitForTimeout(2500);
        await vis(wo.code).last().click();
        await page.waitForTimeout(3500);
      };
      /** เลือกวันในปฏิทินของช่อง — ปฏิทินเปิดที่เดือนของวันเดิม เลื่อนเดือนเท่าที่ต้อง */
      const pick = async (field, from, to) => {
        await page.getByLabel(field, { exact: true }).locator("visible=true").last().click();
        await page.waitForTimeout(500);
        const months = (s) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7));
        for (let k = months(from); k < months(to); k++) {
          await page.getByLabel("เดือนถัดไป").locator("visible=true").last().click();
          await page.waitForTimeout(200);
        }
        await page.getByLabel(dayLabel(to), { exact: true }).locator("visible=true").first().click();
        await page.waitForTimeout(500);
      };
      const opacity = (loc) => loc.evaluate((n) => getComputedStyle(n).opacity);
      return { ctx, page, vis, label, open, pick, opacity };
    };

    // ── 1) แอดมิน: ใบรอเบิก ──
    const a = await openAs("A001", 1400);
    await a.open(P);
    (await a.label("เลื่อนวันนัด").count()) > 0 ? pass("ใบรอเบิก: การ์ดขั้นปัจจุบันมีปุ่ม เลื่อนวันนัด") : fail("ไม่มีปุ่มเลื่อนวันนัด");
    await a.label("เลื่อนวันนัด").last().click();
    await a.page.waitForTimeout(1200);
    (await a.vis(`เลื่อนวันนัด · ${P.code}`, false).count()) > 0 ? pass("เปิดฟอร์ม เลื่อนวันนัด · " + P.code) : fail("ฟอร์มเลื่อนวันนัดไม่เปิด");
    const saveP = a.label("บันทึกวันนัดใหม่").last();
    (await a.opacity(saveP)) !== "1" ? pass("ยังเป็นวันเดิม ไม่มีเหตุผล → ปุ่มบันทึกกดไม่ได้") : fail("วันเดิมก็กดบันทึกได้");
    await a.pick("วันนัดใหม่", dP, newP);
    (await a.opacity(saveP)) !== "1" ? pass("เปลี่ยนวันแล้วแต่ยังไม่ใส่เหตุผล → ยังกดไม่ได้") : fail("ไม่มีเหตุผลก็กดบันทึกได้");
    (await a.vis("ของพร้อมแล้วแอดมินโทรคอนเฟิร์มลูกค้าตามวันใหม่", false).count()) > 0
      ? pass("ฟอร์มบอกขั้นถัดไป: ใบอยู่ขั้นเดิม ของพร้อมแล้วโทรคอนเฟิร์มตามวันใหม่") : fail("ฟอร์มไม่บอกขั้นถัดไป");
    await a.label("เหตุผลที่เลื่อนวันนัด").last().fill("ทีมติดงานด่วนวันเดิม");
    await a.page.waitForTimeout(300);
    await a.page.screenshot({ path: path.join(DIR, "reschedule-1-form.png") });
    // เวลาปิดรับที่เซิร์ฟเวอร์ใช้อยู่ (ค่าที่ตั้งในระบบหลังบ้าน) — อ่านก่อนกดบันทึก ข้อความท้าย toast ใช้ค่านี้
    const cut = (await fx.call(fx.A, "GET", "/settings/dispatch-cutoff")).time;
    await saveP.click();
    /**
     * ข้อความตามตัวอย่างเวลาปิดรับ (W-37) แทน "<รหัส> เลื่อนวันนัดแล้ว" เดิม — เทียบทั้งประโยค ไม่ใช่แค่ต้นประโยค
     * ใบขั้นเบิกยังไม่ไปถึงหัวหน้าภาค จึงไม่มีประโยค "ใบกลับไปที่หัวหน้าภาค…" (ขึ้นผิดใบ = บอกแอดมินว่าใบไปอยู่ที่หัวหน้าภาคทั้งที่ยังไม่ไป)
     * วันใหม่ D+33 เส้นตายยังไกล ท้ายข้อความจึงเป็น "ปิดรับ <วันก่อนนัด> <เวลา> น." ไม่ขึ้นกับว่ารันกี่โมง
     */
    const dShort = (ymd) => dayLabel(ymd).split(" ").slice(0, 3).join(" ");
    const dFull = (ymd) => `${dShort(ymd)} ${String((Number(ymd.slice(0, 4)) + 543) % 100).padStart(2, "0")}`;
    const toast37 = `เลื่อนวันนัด ${P.code} เป็น ${dFull(newP)} แล้ว — ปิดรับ ${dShort(visitDay(32))} ${cut} น.`;
    await a.vis(toast37).first().waitFor({ timeout: 8000 })
      .then(() => pass(`บันทึกแล้วขึ้น "${toast37}"`), () => fail(`ไม่ขึ้นข้อความเลื่อนวันนัด (คาด "${toast37}")`));
    (await a.vis("ใบกลับไปที่หัวหน้าภาค", false).count()) === 0
      ? pass("ใบขั้นเบิก: ไม่มีประโยค \"ใบกลับไปที่หัวหน้าภาค…\" (ใบยังไม่ถึงขั้นของหัวหน้าภาค)")
      : fail("ใบขั้นเบิกขึ้นประโยค \"ใบกลับไปที่หัวหน้าภาค…\" ทั้งที่ใบยังอยู่ขั้นเบิก");
    (await a.vis(`${P.code} เลื่อนวันนัดแล้ว`, false).count()) === 0
      ? pass("ไม่มีกล่อง \"เลื่อนวันนัดแล้ว\" แบบเดิมซ้อนกับข้อความใหม่")
      : fail("ขึ้นทั้งข้อความใหม่และกล่องเลื่อนวันนัดแล้วแบบเดิม");
    await a.page.waitForTimeout(1500);
    row(P.id) === `PARTS_REQUESTED|PENDING|${newP}|${team}`
      ? pass(`ฐานข้อมูล: วันนัดเป็น ${newP} · ยังอยู่ขั้นเบิก · ยังไม่คอนเฟิร์ม · ทีมเดิม`) : fail(`หลังเลื่อน: ${row(P.id)}`);
    const logP = lastLog(P.id);
    logP.startsWith("APPOINTMENT_MOVED|PARTS_REQUESTED|เลื่อนนัดจาก") && logP.includes("ทีมติดงานด่วนวันเดิม")
      ? pass("ฐานข้อมูล: ประวัติ APPOINTMENT_MOVED ขั้นเดิม \"เลื่อนนัดจาก … เป็น …\" พร้อมเหตุผล") : fail(`ประวัติ: ${logP}`);
    await a.page.screenshot({ path: path.join(DIR, "reschedule-2-after.png") });

    // ── 2) แอดมิน: ใบที่ปล่อยงานแล้ว ช่างยังไม่ถึง → ดึงคืน ──
    await a.open(R);
    await a.label("เลื่อนวันนัด").last().click();
    await a.page.waitForTimeout(1200);
    (await a.vis("ช่างยังไม่ถึงหน้างาน — ใบถูกดึงคืนจากช่าง", false).count()) > 0
      ? pass("ใบที่ช่างรับไปแล้ว: ฟอร์มบอกว่าใบจะถูกดึงคืนจากช่าง ให้หัวหน้าภาคปล่อยงานใหม่") : fail("ฟอร์มไม่บอกว่าดึงคืน");
    await a.pick("วันนัดใหม่", dR, newR);
    await a.label("เหตุผลที่เลื่อนวันนัด").last().fill("ร้านขอเลื่อนเพราะปิดปรับปรุง");
    await a.label("บันทึกวันนัดใหม่").last().click();
    await a.page.waitForTimeout(4000);
    row(R.id) === `ASSIGNED|CONFIRMED|${newR}|${team}` && lastLog(R.id).startsWith("APPOINTMENT_RECALLED|ASSIGNED|")
      ? pass("ฐานข้อมูล: ดึงคืนจากช่าง → หัวหน้าภาค · ปล่อยงาน วันใหม่ (APPOINTMENT_RECALLED)") : fail(`หลังดึงคืน: ${row(R.id)} · ${lastLog(R.id)}`);
    // ลูกค้าคอนเฟิร์มวันเดิมไว้แล้ว — วันใหม่ต้องแจ้งร้าน
    (await a.vis(`คอนเฟิร์มลูกค้าแล้ว · ${R.code}`, false).count()) > 0
      ? pass("ลูกค้าคอนเฟิร์มไว้แล้ว → เปิดข้อความแจ้งวันใหม่ให้ร้าน") : fail("ไม่เปิดข้อความแจ้งร้าน");
    await a.page.screenshot({ path: path.join(DIR, "reschedule-3-recall.png") });

    // ── 3) ใบ P เบิกแล้ว → ขั้นคอนเฟิร์มลูกค้า: เลื่อนวันนัด = ย้ายวันเฉย ๆ ใบอยู่ขั้นคอนเฟิร์มเดิม ──
    await fx.issue(P.id, "RQ-WEB-RS");
    row(P.id).startsWith("AWAITING_CONFIRM|PENDING|") ? pass("เบิกครบ (API) → แอดมิน · คอนเฟิร์มลูกค้า (ฐานข้อมูล)") : fail(`หลังเบิก: ${row(P.id)}`);
    const newP2 = visitDay(35);
    await a.open(P);
    (await a.label("เลื่อนวันนัด").count()) > 0 ? pass("ขั้นคอนเฟิร์มลูกค้า: การ์ดขั้นปัจจุบันมีปุ่ม เลื่อนวันนัด เหมือนขั้นอื่น") : fail("ขั้นคอนเฟิร์มไม่มีปุ่มเลื่อนวันนัด");
    await a.label("เลื่อนวันนัด จากการ์ดการมอบหมาย").last().click();
    await a.page.waitForTimeout(1500);
    (await a.vis(`เลื่อนวันนัด · ${P.code}`, false).count()) > 0 && (await a.vis(`คอนเฟิร์มออกหน้างาน · ${P.code}`, false).count()) === 0
      ? pass("ลิงก์เลื่อนวันนัด (ขั้นคอนเฟิร์ม) เปิดฟอร์มเลื่อนวันนัด ไม่ใช่ฟอร์มคอนเฟิร์ม") : fail("ลิงก์เลื่อนวันนัดไม่เปิดฟอร์มเลื่อนวันนัด");
    (await a.label("โทรแล้วร้านตกลงวันอื่น").count()) > 0
      ? pass("ฟอร์มบอกว่าร้านตกลงวันอื่นแล้วให้ใช้ ลูกค้าขอเลื่อน ในฟอร์มคอนเฟิร์ม") : fail("ฟอร์มไม่บอกทางคอนเฟิร์มวันอื่น");
    await a.pick("วันนัดใหม่", newP, newP2);
    await a.label("เหตุผลที่เลื่อนวันนัด").last().fill("ของโอนไม่ทันวันเดิม");
    await a.page.screenshot({ path: path.join(DIR, "reschedule-4-confirm-stage.png") });
    await a.label("บันทึกวันนัดใหม่").last().click();
    await a.page.waitForTimeout(4000);
    row(P.id) === `AWAITING_CONFIRM|PENDING|${newP2}|${team}` && lastLog(P.id).startsWith("APPOINTMENT_MOVED|AWAITING_CONFIRM|เลื่อนนัดจาก")
      ? pass(`ฐานข้อมูล: วันนัดเป็น ${newP2} · ยังอยู่ขั้นคอนเฟิร์มลูกค้า · ยังไม่คอนเฟิร์ม (APPOINTMENT_MOVED)`)
      : fail(`หลังเลื่อนที่ขั้นคอนเฟิร์ม: ${row(P.id)} · ${lastLog(P.id)}`);
    fx.sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${P.id} and action in ('CONFIRMED','RESCHEDULED')`) === "0"
      ? pass("ฐานข้อมูล: ไม่มีประวัติคอนเฟิร์มลูกค้า/ลูกค้าขอเลื่อน ที่ไม่ได้เกิดขึ้น") : fail("เลื่อนวันแล้วมีประวัติคอนเฟิร์ม");
    // ร้านตกลงวันอื่นจริง — ยังทำได้ในฟอร์มคอนเฟิร์ม
    await a.vis("คอนเฟิร์มลูกค้า").last().click();
    await a.page.waitForTimeout(1500);
    (await a.vis(`คอนเฟิร์มออกหน้างาน · ${P.code}`, false).count()) > 0 && (await a.label("ลูกค้าขอเลื่อน / เปลี่ยนวัน").count()) > 0
      ? pass("ฟอร์มคอนเฟิร์มออกหน้างานยังมี ลูกค้าขอเลื่อน / เปลี่ยนวัน") : fail("ฟอร์มคอนเฟิร์มไม่มีลูกค้าขอเลื่อน");
    await a.vis("ยกเลิก").last().click();
    await a.page.waitForTimeout(600);

    // ── 4) งานของฉันวันนี้: ปุ่มลัดเลื่อนวันนัดเฉพาะใบที่หน้าใบงานเปิดฟอร์มให้ได้ ──
    // ใบคอนเฟิร์มลูกค้าที่เลยนัด (ของโอนช้า วันผ่านไป) · ใบนัดร้านตรวจที่เลยนัด — วันย้อนหลังใส่ตรงฐานข้อมูล (API ไม่รับวันอดีต)
    const L = await fx.workOrder("C0006", []);
    await fx.schedule(L.id, visitDay(20));
    const LI = await fx.workOrder("C0006", null);
    await fx.call(fx.supervisor(), "POST", `/work-orders/${LI.id}/inspect-request`, { team, scheduledAt: visitDay(20) });
    // ใบค้างโอนจากคลังอื่น (ขั้นของหัวหน้าภาค) ที่วันนัดผ่านไประหว่างโอน — แอดมินคนเดียวที่เลื่อนวันได้ต้องเห็นในงานของตัวเอง
    const LT = await withPart("C0006", "BELT");
    await fx.source(LT.id, "คลังภูเก็ต");
    await fx.schedule(LT.id, visitDay(20));
    await fx.call(fx.A, "POST", `/work-orders/${LT.id}/parts-check`, { results: [{ sparePartId: LT.pid, inStock: true, warehouse: "คลังภูเก็ต" }] });
    fx.sql(`update "WorkOrder" set "scheduledAt"='${visitDay(-2)}' where id in (${L.id},${LI.id},${LT.id})`);
    row(L.id) === `AWAITING_CONFIRM|PENDING|${visitDay(-2)}|${team}` && row(LI.id).startsWith(`INSPECT_CONFIRM|PENDING|${visitDay(-2)}|`) &&
    row(LT.id) === `PARTS_TRANSFER|PENDING|${visitDay(-2)}|${team}`
      ? pass("เตรียมใบเลยนัด (ฐานข้อมูล): คอนเฟิร์มลูกค้า · นัดร้านตรวจ · ค้างโอนคลังอื่น") : fail(`เตรียมใบเลยนัด: ${row(L.id)} · ${row(LI.id)} · ${row(LT.id)}`);
    await a.page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await a.page.waitForTimeout(4000);
    const q = a.page.getByLabel("ค้นหาในงานของฉัน", { exact: true }).locator("visible=true").first();
    await q.fill(L.code);
    await a.page.waitForTimeout(800);
    (await a.label(`เลื่อนวันนัด ${L.code}`).count()) > 0 ? pass("งานของฉัน: ใบคอนเฟิร์มลูกค้าที่เลยนัดมีปุ่มลัด เลื่อนวันนัด") : fail("ใบเลยนัดไม่มีปุ่มลัด");
    await q.fill(LI.code);
    await a.page.waitForTimeout(800);
    (await a.label(`รายละเอียด ${LI.code}`).count()) > 0 && (await a.label(`เลื่อนวันนัด ${LI.code}`).count()) === 0
      ? pass("งานของฉัน: ใบนัดร้านตรวจที่เลยนัดไม่มีปุ่มลัด (ฟอร์มเลื่อนวันนัดเปิดไม่ได้)") : fail("ใบนัดตรวจที่เลยนัดมีปุ่มลัด หรือไม่อยู่ในงานของฉัน");
    await q.fill(LT.code);
    await a.page.waitForTimeout(800);
    (await a.label(`เลื่อนวันนัด ${LT.code}`).count()) > 0 && (await a.label(`รอหัวหน้าภาค ${LT.code}`).count()) > 0 &&
    (await a.page.locator(`[aria-label^="ทำขั้น "][aria-label$=" ${LT.code}"]`).count()) === 0
      ? pass("งานของฉัน: ใบค้างโอนคลังอื่นที่เลยนัดมาอยู่ที่แอดมิน — ปุ่มลัดเลื่อนวันนัด + \"รอหัวหน้าภาค\" แทนปุ่มทำขั้น")
      : fail("ใบค้างโอนที่เลยนัดไม่อยู่ในงานแอดมิน หรือมีปุ่มทำขั้นที่แอดมินทำไม่ได้");
    await a.page.screenshot({ path: path.join(DIR, "reschedule-5-queue-transfer.png") });
    await q.fill(L.code);
    await a.page.waitForTimeout(800);
    await a.label(`เลื่อนวันนัด ${L.code}`).first().click();
    await a.page.waitForTimeout(4000);
    (await a.vis(`เลื่อนวันนัด · ${L.code}`, false).count()) > 0 ? pass("กดปุ่มลัดแล้วเปิดใบงานพร้อมฟอร์มเลื่อนวันนัด") : fail("ปุ่มลัดไม่เปิดฟอร์มเลื่อนวันนัด");
    await a.page.screenshot({ path: path.join(DIR, "reschedule-5-queue-shortcut.png") });
    await a.ctx.close();
    // ร้านตกลงวันที่แอดมินเลื่อนไว้ (คอนเฟิร์มวันเดิมของรอบนี้) — หัวหน้าภาคยังต้องเห็นว่าวันถูกเลื่อน
    await fx.confirm(P.id);
    row(P.id) === `ASSIGNED|CONFIRMED|${newP2}|${team}` ? pass("คอนเฟิร์มลูกค้า (API) → หัวหน้าภาค · ปล่อยงาน วันที่เลื่อนไว้ (ฐานข้อมูล)") : fail(`หลังคอนเฟิร์ม: ${row(P.id)}`);
    // นัดตรวจ: ร้านตกลงวันแล้ว → รอส่งช่างตรวจ → แอดมินเลื่อนวันตรวจ (ใบอยู่ขั้นเดิม) → หัวหน้าภาคต้องคอนเฟิร์มวันใหม่
    const V = await fx.workOrder("C0006", null);
    await fx.call(fx.supervisor(), "POST", `/work-orders/${V.id}/inspect-request`, { team, scheduledAt: visitDay(20) });
    await fx.confirm(V.id);
    await fx.call(fx.A, "POST", `/work-orders/${V.id}/reschedule`, { scheduledAt: visitDay(22), reason: "ร้านปิดวันเดิม (เทสต์)" });
    row(V.id) === `INSPECT_DISPATCH|CONFIRMED|${visitDay(22)}|${team}` && lastLog(V.id).startsWith("APPOINTMENT_MOVED|INSPECT_DISPATCH|")
      ? pass("นัดตรวจ: แอดมินเลื่อนวันตอนรอส่งช่างตรวจ ใบอยู่ขั้นเดิม (ฐานข้อมูล)") : fail(`นัดตรวจหลังเลื่อน: ${row(V.id)} · ${lastLog(V.id)}`);

    // ── 5) หัวหน้าภาค ──
    const s = await openAs("S001", 420);
    await s.vis("กล่องงานของฉัน").first().click().catch(() => {});
    await s.page.waitForTimeout(3500);
    await s.page.locator('[aria-label^="แท็บ จ่ายงาน/ปล่อยงาน"]').first().click().catch(() => {});
    await s.page.waitForTimeout(1500);
    const tagged = await s.page.evaluate((codes) => {
      const t = document.body.innerText;
      return codes.map((c) => {
        const at = t.indexOf(c);
        return at >= 0 && /คอนเฟิร์มวันใหม่/.test(t.slice(Math.max(0, at - 300), at + 300));
      });
    }, [P.code, R.code]);
    tagged.every(Boolean)
      ? pass("กล่องงานหัวหน้าภาค: ทั้งใบที่ถูกดึงคืนและใบที่เลื่อนระหว่างเบิก ขึ้น คอนเฟิร์มวันใหม่")
      : fail(`ป้ายคอนเฟิร์มวันใหม่: ${P.code}=${tagged[0]} ${R.code}=${tagged[1]}`);
    await s.page.screenshot({ path: path.join(DIR, "reschedule-5-inbox.png"), fullPage: true });
    await s.open(R);
    (await s.label("เลื่อนวันนัด").count()) === 0 && (await s.label("เลื่อนวันนัด จากการ์ดการมอบหมาย").count()) === 0
      ? pass("หัวหน้าภาคไม่มีปุ่มเลื่อนวันนัด (แอดมินเท่านั้น)") : fail("หัวหน้าภาคเห็นปุ่มเลื่อนวันนัด");
    await s.vis("คอนเฟิร์มวันใหม่").first().click();
    await s.page.waitForTimeout(1500);
    (await s.vis("แอดมินเลื่อนวันนัด", false).count()) > 0 && (await s.label("ทีมไม่ว่าง ส่งกลับแอดมิน").count()) > 0
      ? pass("ฟอร์มปล่อยงานบอกว่าแอดมินเลื่อนวันนัด + ทางเลือกทีมว่าง/ทีมไม่ว่าง") : fail("ฟอร์มปล่อยงานไม่บอกการเลื่อน");
    await s.page.screenshot({ path: path.join(DIR, "reschedule-6-release.png") });
    await s.label("คอนเฟิร์มวันใหม่ ปล่อยงาน").last().click();
    await s.page.waitForTimeout(400);
    await s.vis("คอนเฟิร์มวันใหม่ ปล่อยงาน").last().click();
    await s.page.waitForTimeout(4000);
    row(R.id) === `IN_PROGRESS|CONFIRMED|${newR}|${team}` && lastLog(R.id).startsWith("DISPATCHED|IN_PROGRESS|")
      ? pass("คอนเฟิร์มวันใหม่แล้วใบถึงช่างอีกครั้ง วันใหม่ (ฐานข้อมูล)") : fail(`หลังปล่อยงาน: ${row(R.id)} · ${lastLog(R.id)}`);
    // นัดตรวจที่ถูกเลื่อน — ทีมไม่ว่างวันใหม่ ส่งกลับให้แอดมินนัดตรวจใหม่ได้เหมือนงานซ่อม
    await s.open(V);
    await s.vis("คอนเฟิร์มวันใหม่").first().click();
    await s.page.waitForTimeout(1500);
    if ((await s.label("ทีมไม่ว่าง ส่งกลับแอดมิน").count()) > 0) {
      pass("ฟอร์มส่งช่างตรวจ (วันถูกเลื่อน): มีทางเลือก ทีมไม่ว่าง ส่งกลับแอดมิน");
      await s.label("ทีมไม่ว่าง ส่งกลับแอดมิน").last().click();
      await s.page.waitForTimeout(400);
      (await s.vis("กลับไปให้แอดมินนัดตรวจใหม่", false).count()) > 0 ? pass("บอกว่ากลับไปให้แอดมินนัดตรวจใหม่") : fail("ไม่บอกว่ากลับไปนัดตรวจใหม่");
      await s.label("บันทึกเพิ่มเติม").last().fill("ทีมเต็มวันใหม่ (เทสต์)");
      await s.page.screenshot({ path: path.join(DIR, "reschedule-7-inspect-decline.png") });
      await s.vis("ส่งกลับให้แอดมินนัดตรวจใหม่").last().click();
      await s.page.waitForTimeout(4000);
      row(V.id).startsWith("INSPECT_CONFIRM|PENDING|") && lastLog(V.id).startsWith("NEW_DATE_DECLINED|INSPECT_CONFIRM|") && lastLog(V.id).includes("ทีมเต็มวันใหม่ (เทสต์)")
        ? pass("ฐานข้อมูล: ส่งกลับ → แอดมิน · นัดร้าน (ตรวจหน้างาน) รอคอนเฟิร์ม พร้อมเหตุผล (NEW_DATE_DECLINED)")
        : fail(`หลังส่งกลับนัดตรวจ: ${row(V.id)} · ${lastLog(V.id)}`);
    } else fail("ฟอร์มส่งช่างตรวจที่วันถูกเลื่อนไม่มีทางเลือก ทีมไม่ว่าง");
    await s.ctx.close();
    // วันที่ทีมไม่ว่างมาจากแอดมินเลื่อน — ประวัติต้องไม่เขียนว่าลูกค้าขอ
    const declined = lastLog(V.id);
    declined.includes("ไม่ว่างวันที่แอดมินเลื่อน") && !declined.includes("วันที่ลูกค้าขอ")
      ? pass("ฐานข้อมูล: ประวัติส่งกลับบอกว่าไม่ว่างวันที่แอดมินเลื่อน (ไม่ใช่ \"วันที่ลูกค้าขอ\")")
      : fail(`ประวัติส่งกลับ: ${declined}`);

    // ── 6) แอดมิน: กล่องส่งกลับหัวข้อกลาง ๆ ──
    const b = await openAs("A001", 1400);
    await b.open(V);
    // ไม่มีคำว่า "วันใหม่" แล้ว (เวลาปิดรับ ต.ค. 69 — ใบที่ล็อกส่งกลับได้โดยไม่ได้ถูกเลื่อนวัน)
    (await b.vis("หัวหน้าภาคส่งกลับ — ทีมไม่ว่าง โทรนัดร้านใหม่").count()) > 0 && (await b.vis("วันที่ลูกค้าขอ", false).count()) === 0
      ? pass("แอดมินเห็นกล่อง หัวหน้าภาคส่งกลับ — ทีมไม่ว่าง โทรนัดร้านใหม่ (ไม่บอกว่าลูกค้าขอ)")
      : fail("หัวข้อกล่องส่งกลับไม่ตรง");

    // ── 7) ช่างปิดงานแล้ว เคลมถูกตีกลับ → ใบกลับมาขั้นช่าง: ดึงคืนไม่ได้ ──
    const W = await fx.workOrder("C0006", []);
    const dW = visitDay(24);
    await fx.schedule(W.id, dW);
    await fx.confirm(W.id);
    await fx.call(fx.supervisor(), "POST", `/work-orders/${W.id}/dispatch`, {});
    // สภาพที่ "ตีกลับเคลม" ทิ้งไว้: ประวัติปิดงาน → ตีกลับ ใบกลับมาขั้นช่าง ไม่มีประวัติถึงหน้างาน (ถึงหน้างานไม่บังคับ)
    // ใส่ตรงฐานข้อมูล — ปิดงานจริงต้องมีรูปและเคลมให้ตรวจ ซึ่งไม่ใช่เรื่องที่เทสต์นี้ดู · เวลาเป็น UTC แบบที่แอปเขียน
    fx.sql(`insert into "WorkOrderLog" ("workOrderId", action, status, note, "createdAt") values
      (${W.id}, 'CLOSED', 'CLAIM_REVIEW', 'ปิดงาน (เทสต์)', (now() at time zone 'utc') + interval '1 second'),
      (${W.id}, 'CLAIM_REJECTED', 'IN_PROGRESS', 'รูปไม่ชัด (เทสต์)', (now() at time zone 'utc') + interval '2 second')`);
    row(W.id) === `IN_PROGRESS|CONFIRMED|${dW}|${team}` && fx.sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${W.id} and action='ARRIVED'`) === "0"
      ? pass("เตรียมใบ (ฐานข้อมูล): ขั้นช่าง · ปิดงานแล้วเคลมถูกตีกลับ · ไม่เคยกดถึงหน้างาน")
      : fail(`เตรียมใบตีกลับเคลม: ${row(W.id)}`);
    await b.page.waitForTimeout(1500);
    await b.open(W);
    (await b.label("ขั้นตอนงาน").count()) > 0 && (await b.label("เลื่อนวันนัด").count()) === 0 && (await b.label("เลื่อนวันนัด จากการ์ดการมอบหมาย").count()) === 0
      ? pass("ใบที่ช่างปิดงานรอบนี้แล้ว (เคลมถูกตีกลับ): ไม่มีปุ่มเลื่อนวันนัด ทั้งการ์ดขั้นและการ์ดการมอบหมาย")
      : fail("ใบที่ช่างปิดงานแล้วยังมีปุ่มเลื่อนวันนัด (เซิร์ฟเวอร์ปฏิเสธแน่นอน)");
    await b.page.screenshot({ path: path.join(DIR, "reschedule-8-closed-no-recall.png") });
    const refused = await fx.call(fx.A, "POST", `/work-orders/${W.id}/reschedule`, { scheduledAt: visitDay(27), reason: "ทดสอบดึงคืน (เทสต์)" });
    String(refused.error || "").includes("ช่างปิดงานรอบนี้แล้ว") && row(W.id) === `IN_PROGRESS|CONFIRMED|${dW}|${team}`
      ? pass("เซิร์ฟเวอร์ปฏิเสธด้วย \"ช่างปิดงานรอบนี้แล้ว\" (ไม่ใช่ช่างถึงหน้างาน) · ฐานข้อมูลไม่เปลี่ยน")
      : fail(`ดึงคืนใบที่ปิดแล้ว: ${refused.error} · ${row(W.id)}`);

    // ── 8) ฟอร์มคอนเฟิร์มลูกค้าเปิดค้างไว้ แล้ววันนัดถูกเลื่อน ──
    const dC = visitDay(28), newC = visitDay(31);
    const confirmedLogs = (id) => fx.sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${id} and action in ('CONFIRMED','RESCHEDULED')`);
    const C = await fx.workOrder("C0006", []);
    await fx.schedule(C.id, dC);
    row(C.id) === `AWAITING_CONFIRM|PENDING|${dC}|${team}` ? pass(`เตรียมใบ (ฐานข้อมูล): รอคอนเฟิร์มลูกค้า วันที่ ${dC}`) : fail(`เตรียมใบคอนเฟิร์ม: ${row(C.id)}`);
    await b.open(C);
    await b.vis("คอนเฟิร์มลูกค้า").last().click();
    await b.page.waitForTimeout(1500);
    (await b.vis(`คอนเฟิร์มออกหน้างาน · ${C.code}`, false).count()) > 0 ? pass("เปิดฟอร์มคอนเฟิร์มออกหน้างาน (วันเดิม)") : fail("ฟอร์มคอนเฟิร์มไม่เปิด");
    await b.label("ลูกค้าคอนเฟิร์มวันนี้").last().click();
    await b.page.waitForTimeout(300);
    // ระหว่างที่ฟอร์มเปิด แอดมินเลื่อนวัน (API บัญชีเดียวกัน — หน้าจอไม่เด้งเตือนของที่ตัวเองทำ จึงต้องเป็นเซิร์ฟเวอร์ที่กัน)
    await fx.call(fx.A, "POST", `/work-orders/${C.id}/reschedule`, { scheduledAt: newC, reason: "ของโอนไม่ทัน (เทสต์)" });
    row(C.id) === `AWAITING_CONFIRM|PENDING|${newC}|${team}` ? pass(`วันนัดถูกเลื่อนเป็น ${newC} ระหว่างที่ฟอร์มเปิด (ฐานข้อมูล)`) : fail(`หลังเลื่อน: ${row(C.id)}`);
    await b.vis("ยืนยัน").last().click();
    await b.page.waitForTimeout(4000);
    row(C.id) === `AWAITING_CONFIRM|PENDING|${newC}|${team}` && confirmedLogs(C.id) === "0"
      ? pass("ฐานข้อมูล: ไม่บันทึกว่าลูกค้าคอนเฟิร์มวันที่เพิ่งเลื่อน — ใบยังรอคอนเฟิร์ม (เซิร์ฟเวอร์ปฏิเสธฟอร์มที่เห็นวันเก่า)")
      : fail(`ฟอร์มวันเก่าคอนเฟิร์มวันใหม่ได้: ${row(C.id)} · ${lastLog(C.id)}`);
    (await b.vis(`คอนเฟิร์มออกหน้างาน · ${C.code}`, false).count()) === 0
      ? pass("ฟอร์มวันเก่าปิดแล้วโหลดใบใหม่") : fail("ฟอร์มวันเก่ายังเปิดค้าง");
    await b.page.screenshot({ path: path.join(DIR, "reschedule-9-stale-confirm.png") });

    // คนอื่นเลื่อนวันระหว่างที่ฟอร์มเปิด — หน้าจอเห็นเองแล้วปิดฟอร์ม ไม่ต้องรอกดยืนยันแล้วโดนปฏิเสธ
    const C2 = await fx.workOrder("C0006", []);
    await fx.schedule(C2.id, dC);
    await b.open(C2);
    await b.vis("คอนเฟิร์มลูกค้า").last().click();
    await b.page.waitForTimeout(1500);
    await fx.call(fx.A, "POST", `/work-orders/${C2.id}/reschedule`, { scheduledAt: newC, reason: "ของโอนไม่ทัน (เทสต์)" });
    // แอดมินทดสอบมีบัญชีเดียว (A001 — SOPADM เป็นของงานทำคู่มือ ห้ามแตะ) ย้ายชื่อคนเลื่อนในประวัติเป็นคนอื่น
    // ให้หน้าจอเห็นว่าเป็นการเลื่อนของคนอื่น (ของที่ตัวเองทำจากอีกแท็บไม่เด้งเตือน)
    fx.sql(`update "WorkOrderLog" set "userId"=(select id from "User" where "employeeCode"='S001') where id=(select max(id) from "WorkOrderLog" where "workOrderId"=${C2.id} and action='APPOINTMENT_MOVED')`);
    // ถามรุ่นข้อมูลทันที — ปกติถามทุก 20 วินาทีและตอนกลับมาที่แท็บ (visibilitychange)
    await b.page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await b.page.getByText("แอดมินเพิ่งเลื่อนวันนัด — โหลดใหม่แล้ว", { exact: false }).first().waitFor({ timeout: 10000 })
      .then(() => pass("คนอื่นเลื่อนวันระหว่างฟอร์มเปิด → เด้ง \"แอดมินเพิ่งเลื่อนวันนัด — โหลดใหม่แล้ว\""), () => fail("ไม่เด้งบอกว่าวันนัดถูกเลื่อน"));
    await b.page.waitForTimeout(1000);
    (await b.vis(`คอนเฟิร์มออกหน้างาน · ${C2.code}`, false).count()) === 0 ? pass("ปิดฟอร์มคอนเฟิร์มที่ถือวันเก่าให้เอง") : fail("ฟอร์มคอนเฟิร์มวันเก่ายังเปิดอยู่");
    // ปิดฟอร์มแล้วเช็คซ้ำทันที — ต้องไม่โหลดซ้ำแล้วเด้ง "…อัปเดตใบงานนี้" ซ้อนอีกอัน (เคยขึ้นสองข้อความ)
    (await b.vis("อัปเดตใบงานนี้", false).count()) === 0 ? pass("เด้งข้อความเดียว ไม่โหลดซ้ำหลังปิดฟอร์ม") : fail("เด้งข้อความซ้ำหลังปิดฟอร์ม");
    row(C2.id) === `AWAITING_CONFIRM|PENDING|${newC}|${team}` && confirmedLogs(C2.id) === "0"
      ? pass("ฐานข้อมูล: ใบยังรอคอนเฟิร์มลูกค้าวันใหม่") : fail(`หลังปิดฟอร์ม: ${row(C2.id)}`);
    await b.page.screenshot({ path: path.join(DIR, "reschedule-10-remote-move.png") });
    await b.ctx.close();
  } catch (e) {
    fail(String(e).split("\n")[0].slice(0, 300));
  } finally {
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0].slice(0, 200)}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
