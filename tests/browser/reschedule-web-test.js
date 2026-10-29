// ทดสอบ: แอดมิน "เลื่อนวันนัด" ได้ตลอดจนช่างเข้างาน (เจ้าของงานเลือก ต.ค. 69 รอบสอง) — กดจากหน้าจอด้วยบทบาทจริง
//   1) ใบที่ขั้นเบิก (ลูกค้ายังไม่คอนเฟิร์ม): ปุ่ม "เลื่อนวันนัด" ในการ์ดขั้นปัจจุบัน → ฟอร์มกันบันทึกจนเปลี่ยนวัน+ใส่เหตุผล
//      → ใบอยู่ขั้นเดิม เปลี่ยนแค่วัน ทีม/สถานะนัดเหมือนเดิม มีประวัติ "แอดมินเลื่อนวันนัด" (ฐานข้อมูล)
//   2) ใบที่ปล่อยงานแล้ว ช่างยังไม่ถึงหน้างาน: เลื่อนแล้วใบถูกดึงคืนไปหัวหน้าภาค (ปล่อยงานใหม่) (ฐานข้อมูล)
//      ลูกค้าคอนเฟิร์มไว้แล้ว → บันทึกแล้วเปิดข้อความแจ้งวันใหม่ให้ร้าน
//   3) ใบที่ขั้นคอนเฟิร์มลูกค้า: ลิงก์เลื่อนวันนัดเปิดฟอร์ม "คอนเฟิร์มออกหน้างาน" ที่เลือก "ลูกค้าขอเลื่อน" ไว้ให้ ไม่ใช่สองทางทำเรื่องเดียวกัน
//   4) หัวหน้าภาค: ไม่มีปุ่มเลื่อนวันนัด · กล่องงานขึ้น "คอนเฟิร์มวันใหม่" ทั้งใบที่ถูกดึงคืนและใบที่เลื่อนระหว่างเบิกแล้วคอนเฟิร์มวันเดิม
//      · ฟอร์มปล่อยงานบอกว่าแอดมินเลื่อนวันนัด + ทางเลือกทีมว่าง/ไม่ว่าง · คอนเฟิร์มวันใหม่แล้วใบถึงช่าง (ฐานข้อมูล)
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
    const board = fx.part("SP-BOARD");
    const row = (id) =>
      fx.sql(`select status||'|'||coalesce("appointmentStatus",'-')||'|'||coalesce(to_char("scheduledAt",'YYYY-MM-DD'),'-')||'|'||coalesce("assignedTeam",'-') from "WorkOrder" where id=${id}`);
    const team = fx.sql(`select zone from "Branch" where code='C0006'`);
    const lastLog = (id) => fx.sql(`select action||'|'||status||'|'||coalesce(note,'') from "WorkOrderLog" where "workOrderId"=${id} order by id desc limit 1`);

    // P: ใช้อะไหล่ — นัดวันแล้ว รอแอดมินเบิก (ลูกค้ายังไม่คอนเฟิร์ม)
    const dP = visitDay(30), newP = visitDay(33);
    const P = await fx.workOrder("C0006", [{ sparePartId: board, quantity: 1 }]);
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
    await saveP.click();
    await a.page.getByText(`${P.code} เลื่อนวันนัดแล้ว`, { exact: false }).first().waitFor({ timeout: 8000 })
      .then(() => pass("บันทึกแล้วขึ้น \"เลื่อนวันนัดแล้ว\""), () => fail("ไม่ขึ้นข้อความเลื่อนวันนัดแล้ว"));
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

    // ── 3) ใบ P เบิกแล้ว → ขั้นคอนเฟิร์มลูกค้า: ทางเลื่อนวันคือฟอร์มคอนเฟิร์ม ──
    await fx.issue(P.id, "RQ-WEB-RS");
    row(P.id).startsWith("AWAITING_CONFIRM|PENDING|") ? pass("เบิกครบ (API) → แอดมิน · คอนเฟิร์มลูกค้า (ฐานข้อมูล)") : fail(`หลังเบิก: ${row(P.id)}`);
    await a.open(P);
    (await a.label("เลื่อนวันนัด").count()) === 0 ? pass("ขั้นคอนเฟิร์มลูกค้าไม่มีปุ่มเลื่อนวันนัดแยก") : fail("ขั้นคอนเฟิร์มยังมีปุ่มแยก");
    await a.label("เลื่อนวันนัด จากการ์ดการมอบหมาย").last().click();
    await a.page.waitForTimeout(1500);
    (await a.vis(`คอนเฟิร์มออกหน้างาน · ${P.code}`, false).count()) > 0
      ? pass("ลิงก์เลื่อนวันนัดเปิดฟอร์ม คอนเฟิร์มออกหน้างาน") : fail("ไม่เปิดฟอร์มคอนเฟิร์มออกหน้างาน");
    (await a.vis("เลือกวันใหม่ แล้วส่งให้หัวหน้าภาคคอนเฟิร์มวันใหม่", false).count()) > 0
      ? pass("เลือก ลูกค้าขอเลื่อน ไว้ให้แล้ว") : fail("ไม่ได้เลือกลูกค้าขอเลื่อนไว้");
    await a.page.screenshot({ path: path.join(DIR, "reschedule-4-confirm-form.png") });
    await a.ctx.close();
    // ร้านตกลงวันที่แอดมินเลื่อนไว้ (คอนเฟิร์มวันเดิมของรอบนี้) — หัวหน้าภาคยังต้องเห็นว่าวันถูกเลื่อน
    await fx.confirm(P.id);
    row(P.id) === `ASSIGNED|CONFIRMED|${newP}|${team}` ? pass("คอนเฟิร์มลูกค้า (API) → หัวหน้าภาค · ปล่อยงาน วันที่เลื่อนไว้ (ฐานข้อมูล)") : fail(`หลังคอนเฟิร์ม: ${row(P.id)}`);

    // ── 4) หัวหน้าภาค ──
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
    await s.ctx.close();
  } catch (e) {
    fail(String(e).split("\n")[0].slice(0, 300));
  } finally {
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0].slice(0, 200)}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
