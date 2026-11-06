// ทดสอบ: แท็บ "รอลูกค้าจ่ายเงิน" ในหน้าใบงานซ่อม (เจ้าของงานเลือก 5 พ.ย. 69 · ตัวอย่าง paytab — ตอบ "ทำตามที่แนะนำ")
//   · แอดมินจอคอม: แท็บอยู่ระหว่าง "ที่ยังค้าง" กับ "รอคอนเฟิร์มลูกค้า" · ตัวเลข + ป้ายแดง "เกิน 3 วัน n" ตรงกับ payTab ของ API
//     และจำนวนใบในฐานข้อมูล · กดแท็บแล้วที่อยู่เป็น #/awaiting-payment ชื่อแท็บเบราว์เซอร์ "รอลูกค้าจ่ายเงิน" · F5 อยู่แท็บเดิม
//   · ใบทดสอบสามใบ (ส่งใบเสนอราคาทาง API จริง): ถอย 5 วันทาง SQL (เกิน · ยังไม่เคยตาม) · 2 วัน (ตามแล้ว) · วันนี้ (ยังไม่เคยตาม)
//     แถวเรียงรอนานสุดก่อน · คอลัมน์ ส่งใบเสนอราคา (วัน · ชื่อ) · รอมาแล้ว · ตามลูกค้าล่าสุด / "ยังไม่เคยตาม"
//   · ชิป ทั้งหมด / เกิน 3 วัน / ยังไม่เคยตาม / ตามแล้ว: ตัวเลข = แถวที่เห็นเมื่อกด = นับจาก API · aria-selected
//   · "ตามลูกค้าแล้ว" ในแถว: ช่อง "ลูกค้าว่ายังไง" ใต้แถว + คำแนะนำ + ข้อความลัด (แตะแล้วต่อท้ายช่อง แก้ได้) + "ลูกค้านัดจ่ายวันที่"
//     (ปฏิทิน วันที่ผ่านแล้วกดไม่ได้) → บันทึก → ฐานข้อมูลมีแถว PAYMENT_FOLLOWUP (A001 · หมายเหตุ · meta.payBy)
//     → แถวขึ้น "วันนี้ HH:MM · ชื่อ" (เขียว) / หมายเหตุ / ป้ายนัดจ่าย · ชิปยังไม่เคยตาม −1 / ตามแล้ว +1 ทันที · กดแถวเปิดใบงาน
//   · คอลัมน์ตามลูกค้าล่าสุด (6 พ.ย. 69): ใบที่ตามสามครั้ง (ทาง API · ครั้งกลางนัดจ่าย) — ป้ายนัดจ่ายน้ำเงินยังอยู่แม้ครั้งล่าสุดไม่ใส่วัน
//     · "ตาม 3 ครั้ง · ดูทั้งหมด ⌄" (aria-expanded) กางรายการใหม่ก่อนเก่าใต้แถว · "ซ่อน ⌃" พับ
//     · ใบที่นัดจ่ายเมื่อวาน (ตั้งทาง SQL) ป้ายแดง "· เลยวันนัดแล้ว" · ชิป "เลยวันนัดจ่าย n" = แถวที่เห็น = payTab.late
//   · "ลูกค้าไม่ซ่อม" ในแถว: ฟอร์มกางใต้แถว เตือนอะไหล่ที่ออกจากคลัง (ถามใบงานตอนกาง) · ไม่เลือกเหตุผลไม่ส่ง → ยืนยัน →
//     ฐานข้อมูล CANCELLED + meta · แถวหาย · ตัวเลขแท็บ/ชิปลดทันที · แจ้ง "… ยกเลิกใบงานแล้ว" · ไม่มี "มีอัปเดต" ปลอม
//   · หน้าใบงาน: "ลูกค้านัดจ่าย …" (แดงเมื่อเลยวันนัด) · การตามแต่ละบรรทัดบอกวันนัดของครั้งนั้น
//   · กล่องงาน: ไม่มีแถบรอลูกค้าจ่ายเงิน (เจ้าของงานเอาออก 6 พ.ย. 69 — เลขอยู่บนแท็บกับชิปแล้ว) · ใบยังอยู่ในรายการข้างล่าง
//     · ชิปต้องรีบดู "รอจ่ายเกิน 3 วัน" → แท็บนี้ ชิปเกิน 3 วัน
//     · หัวข้อ "ไม่มีคนรับ" ยังย่อ/ขยายได้ตามเดิม (ถ้ามี)
//   · มือถือ 390: แถวเป็นการ์ด (สามบรรทัดของการตาม + ปุ่มลูกค้าไม่ซ่อม) · ตามลูกค้าแล้ว/ดูทั้งหมด/ลูกค้าไม่ซ่อมกางในการ์ด · ไม่ล้นจอแนวนอน
//   · หัวหน้าภาค · ช่าง · Admin Spare Part: ไม่มีแท็บ · เปิดลิงก์ #/awaiting-payment แล้วที่อยู่กลับเป็น #/work-orders
// ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup } = require("./fixture");

const PDF = Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
const APP = "http://localhost:8081";

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  let fx = null;
  const SUF = String(Date.now()).slice(-5);
  const PA = `zzpt.pa${SUF}`;
  try {
    fx = await setup();
    const sql = fx.sql;
    const quoted = async () => {
      const wo = await fx.workOrder("C0006", null);
      sql(`update "WorkOrder" set status='AWAITING_QUOTE', "workStatus"='QUOTING', "needsParts"=false where id=${wo.id}`);
      const fd = new FormData();
      fd.append("file", new Blob([PDF], { type: "application/pdf" }), `quotation-${wo.code}.pdf`);
      fd.append("role", "QUOTE");
      await fetch(`http://localhost:4000/api/work-orders/${wo.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${fx.A}` }, body: fd });
      await fx.call(fx.A, "POST", `/work-orders/${wo.id}/quote`, {});
      return wo;
    };
    const a = await quoted(); // ถอย 5 วัน — เกิน · ยังไม่เคยตาม
    const b = await quoted(); // ถอย 2 วัน — ตามแล้ว · ลูกค้านัดจ่ายเมื่อวาน (SQL) = เลยวันนัด
    const c = await quoted(); // วันนี้ — ยังไม่เคยตาม (จะตามในแถว)
    const d = await quoted(); // วันนี้ — ตามสามครั้ง ครั้งกลางนัดจ่าย 3 วันข้างหน้า (ดูทั้งหมด · ป้ายนัดจ่ายน้ำเงิน)
    const e = await quoted(); // ถอย 6 วัน — เกิน · มีอะไหล่ออกจากคลังแล้ว (จะกดลูกค้าไม่ซ่อมในแถว)
    sql(`update "WorkOrderLog" set "createdAt"="createdAt"-interval '5 days' where "workOrderId"=${a.id};
         update "WorkOrder" set "createdAt"="createdAt"-interval '5 days' where id=${a.id};
         update "WorkOrderLog" set "createdAt"="createdAt"-interval '2 days' where "workOrderId"=${b.id};
         update "WorkOrder" set "createdAt"="createdAt"-interval '2 days' where id=${b.id};
         update "WorkOrderLog" set "createdAt"="createdAt"-interval '6 days' where "workOrderId"=${e.id};
         update "WorkOrder" set "createdAt"="createdAt"-interval '6 days' where id=${e.id}`);
    await fx.call(fx.A, "POST", `/work-orders/${b.id}/payment-followup`, { note: "ลูกค้าบอกโอนพรุ่งนี้" });
    // ลูกค้านัดจ่ายเมื่อวานแล้วยังไม่จ่าย — เซิร์ฟเวอร์ไม่รับวันนัดย้อนหลังทาง API จึงตั้งทาง SQL
    const bkk = (n) => new Date(Date.now() + 7 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);
    // ตามไว้เมื่อวาน (ยังอยู่ในรอบรอเงินนี้ — เข้าขั้นเมื่อ 2 วันก่อน) = บรรทัดเมื่อไรเป็นวันที่ + เวลา ไม่ใช่ "วันนี้"
    sql(`update "WorkOrderLog" set meta=jsonb_build_object('payBy','${bkk(-1)}'), "createdAt"="createdAt"-interval '1 day'
         where "workOrderId"=${b.id} and action='PAYMENT_FOLLOWUP'`);
    await fx.call(fx.A, "POST", `/work-orders/${d.id}/payment-followup`, { note: "โทรไม่รับ" });
    await fx.call(fx.A, "POST", `/work-orders/${d.id}/payment-followup`, { note: "ลูกค้าขอเลื่อนจ่าย", payBy: bkk(3) });
    await fx.call(fx.A, "POST", `/work-orders/${d.id}/payment-followup`, { note: "รอเจ้าของร้านอนุมัติ" });
    sql(`insert into "WorkOrderPart"("workOrderId","sparePartId",quantity,kind,"inStock",warehouse,"requisitionNo")
         values (${e.id},${fx.part("SP-BOARD")},1,'WAITING',true,'คลังลาดพร้าว 94','RQ-PAYTAB-${e.id}')`);
    const st = (id) => sql(`select status from "WorkOrder" where id=${id}`);
    [a, b, c, d, e].every((w) => st(w.id) === "AWAITING_PAYMENT")
      ? pass(`เตรียมใบ ${a.code} · ${b.code} · ${c.code} · ${d.code} · ${e.code} ขั้นรอลูกค้าจ่ายเงิน (ฐานข้อมูล)`)
      : fail(`เตรียมใบไม่ถึงขั้นรอเงิน: ${[a, b, c, d, e].map((w) => st(w.id)).join(" ")}`);
    // "ศ. 7 พ.ย." / "ศ. 7 พ.ย. 2569" แบบป้ายในแอป (payByText · thaiDateLong)
    const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
    const MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const thai = (ymd, year) => {
      const [y, m, dd] = ymd.split("-").map(Number);
      const yy = year ? ` ${y + 543}` : y === Number(bkk(0).slice(0, 4)) ? "" : ` ${String((y + 543) % 100).padStart(2, "0")}`;
      return `${DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]} ${dd} ${MON[m - 1]}${yy}`;
    };
    const aid = sql(`select id from "User" where "employeeCode"='A001'`);
    const aname = sql(`select name from "User" where "employeeCode"='A001'`);
    const api = async () => (await fx.call(fx.A, "GET", "/work-orders?status=AWAITING_PAYMENT"));
    let L = await api();
    const dbTotal = Number(sql(`select count(*) from "WorkOrder" where status='AWAITING_PAYMENT' and "deletedAt" is null`));
    L.payTab && L.payTab.total === dbTotal && L.rows.length === dbTotal
      ? pass(`API: payTab.total ${dbTotal} = ใบขั้นรอเงินในฐานข้อมูล = แถวของแท็บ`) : fail(`API payTab ${JSON.stringify(L.payTab)} · แถว ${L.rows.length} · ฐานข้อมูล ${dbTotal}`);
    const want = (p) => ({ all: p.total, over: p.over, late: p.late, never: p.never, followed: p.followed });

    const ctx = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const lbl = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    const login = async (p, code) => {
      await p.goto(APP, { waitUntil: "networkidle", timeout: 180000 });
      await p.getByPlaceholder("รหัสพนักงาน").fill(code);
      await p.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await p.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").last().click();
      await p.waitForTimeout(3500);
    };
    const hash = (p) => p.evaluate(() => window.location.hash);
    await login(page, "A001");
    await page.goto(`${APP}/#/work-orders`);
    await page.waitForTimeout(4500);

    // ── แท็บ: ตำแหน่ง · ตัวเลข · ป้ายแดง ──
    const tabs = await page.locator('[role="tab"]').locator("visible=true").evaluateAll((ns) => ns.map((n) => n.getAttribute("aria-label") || ""));
    const ix = (s) => tabs.findIndex((t) => t.startsWith(s));
    ix("ที่ยังค้าง") >= 0 && ix("รอลูกค้าจ่ายเงิน") === ix("ที่ยังค้าง") + 1 && ix("รอคอนเฟิร์มลูกค้า") === ix("รอลูกค้าจ่ายเงิน") + 1
      ? pass("แท็บ \"รอลูกค้าจ่ายเงิน\" อยู่ถัดจาก \"ที่ยังค้าง\" ก่อน \"รอคอนเฟิร์มลูกค้า\"") : fail(`ลำดับแท็บ: ${tabs.join(" | ")}`);
    const tabLabel = `รอลูกค้าจ่ายเงิน ${L.payTab.total} ใบ${L.payTab.over ? ` · เกิน ${L.payTab.alertDays} วัน ${L.payTab.over}` : ""}`;
    tabs.includes(tabLabel) && L.payTab.over >= 1
      ? pass(`ป้ายแท็บ "${tabLabel}" ตรงกับ API (เส้นวันจากเซิร์ฟเวอร์)`) : fail(`ป้ายแท็บ ต้องเป็น "${tabLabel}" · มี ${tabs.join(" | ")}`);
    const tab = page.locator(`[role="tab"][aria-label="${tabLabel}"]`).locator("visible=true").first();
    const badgeBg = await tab.getByText(`เกิน ${L.payTab.alertDays} วัน ${L.payTab.over}`, { exact: true }).evaluate((n) => getComputedStyle(n.parentElement).backgroundColor).catch(() => "");
    badgeBg === "rgb(185, 28, 28)" ? pass("ป้าย \"เกิน 3 วัน n\" บนแท็บพื้นแดง") : fail(`พื้นป้ายแท็บ: ${badgeBg}`);
    await page.screenshot({ path: path.join(DIR, "payment-tab-0-tabs.png") });

    // ── เปิดแท็บ ──
    await tab.click();
    await page.waitForTimeout(3500);
    (await hash(page)) === "#/awaiting-payment" && (await page.title()).startsWith("รอลูกค้าจ่ายเงิน")
      ? pass("กดแท็บแล้วที่อยู่ #/awaiting-payment · ชื่อแท็บเบราว์เซอร์ \"รอลูกค้าจ่ายเงิน\"") : fail(`ที่อยู่ ${await hash(page)} · ชื่อ ${await page.title()}`);
    (await tab.getAttribute("aria-selected")) === "true" ? pass("แท็บติด (aria-selected)") : fail("แท็บไม่ติด");
    const rowsText = async () => page.locator('[aria-label^="แถวรอจ่าย "]').locator("visible=true").evaluateAll((ns) => ns.map((n) => n.getAttribute("aria-label").replace(/^แถวรอจ่าย /, "")));
    const codesShown = await rowsText();
    const ie = codesShown.indexOf(e.code), ia = codesShown.indexOf(a.code), ib = codesShown.indexOf(b.code), ic = codesShown.indexOf(c.code);
    codesShown.length === dbTotal && ie >= 0 && ia > ie && ib > ia && ic > ib
      ? pass(`แถวครบ ${dbTotal} ใบ · เรียงรอนานสุดก่อน (${e.code} 6 วัน → ${a.code} 5 วัน → ${b.code} 2 วัน → ${c.code} วันนี้)`) : fail(`แถว: ${codesShown.join(",")}`);
    const rowA = await lbl(`แถวรอจ่าย ${a.code}`).first().innerText();
    const qAt = sql(`select to_char("createdAt" + interval '7 hours','FMDD') from "WorkOrderLog" where "workOrderId"=${a.id} and action='QUOTED' order by id desc limit 1`);
    rowA.includes("5 วัน") && rowA.includes("ยังไม่เคยตาม") && rowA.includes(aname) && rowA.includes(qAt) && rowA.includes("ตามลูกค้าแล้ว")
      ? pass(`แถว ${a.code}: ส่งใบเสนอราคา ${qAt} … · ${aname} · รอ 5 วัน · "ยังไม่เคยตาม" · ปุ่มตามลูกค้าแล้ว`) : fail(`แถว ${a.code}: ${rowA}`);
    const rowBg = await lbl(`แถวรอจ่าย ${a.code}`).first().evaluate((n) => getComputedStyle(n).backgroundColor);
    rowBg === "rgb(254, 242, 242)" ? pass("แถวที่รอเกินกำหนดพื้นแดงจาง") : fail(`พื้นแถวเกิน: ${rowBg}`);
    const rowB = await lbl(`แถวรอจ่าย ${b.code}`).first().innerText();
    rowB.includes("2 วัน") && rowB.includes("ลูกค้าบอกโอนพรุ่งนี้") && !rowB.includes("ยังไม่เคยตาม")
      ? pass(`แถว ${b.code}: รอ 2 วัน · ตามล่าสุด "ลูกค้าบอกโอนพรุ่งนี้"`) : fail(`แถว ${b.code}: ${rowB}`);

    // ── คอลัมน์ตามลูกค้าล่าสุด: เมื่อไร · ใคร / หมายเหตุ / ป้ายนัดจ่าย + ดูทั้งหมด ──
    {
      const hm = (iso) => new Date(iso).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
      const lastAt = (id) => sql(`select to_char("createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from "WorkOrderLog" where "workOrderId"=${id} and action='PAYMENT_FOLLOWUP' order by id desc limit 1`);
      const rowD = lbl(`แถวรอจ่าย ${d.code}`).first();
      const textD = await rowD.innerText();
      const line1 = `วันนี้ ${hm(lastAt(d.id))} · ${aname}`;
      const promiseD = `นัดจ่าย ${thai(bkk(3))}`;
      textD.includes(line1) && textD.includes("รอเจ้าของร้านอนุมัติ") && textD.includes(promiseD) && textD.includes("ตาม 3 ครั้ง · ดูทั้งหมด ⌄")
        ? pass(`แถว ${d.code}: "${line1}" / "รอเจ้าของร้านอนุมัติ" / ป้าย "${promiseD}" (นัดของครั้งก่อนยังอยู่) · "ตาม 3 ครั้ง · ดูทั้งหมด ⌄"`)
        : fail(`แถว ${d.code}: ${textD}`);
      const whenColor = await rowD.getByText(line1, { exact: true }).evaluate((n) => getComputedStyle(n).color).catch(() => "");
      whenColor === "rgb(6, 95, 70)" ? pass("ตามวันนี้ = บรรทัดเมื่อไร · ใคร สีเขียว") : fail(`สีบรรทัดตามวันนี้: ${whenColor}`);
      const badgeD = await lbl(promiseD).first().evaluate((n) => getComputedStyle(n).backgroundColor).catch(() => "");
      badgeD === "rgb(225, 240, 250)" ? pass("ป้ายนัดจ่ายที่ยังไม่ถึงวัน สีน้ำเงิน") : fail(`พื้นป้ายนัดจ่าย: ${badgeD}`);
      const textB = await lbl(`แถวรอจ่าย ${b.code}`).first().innerText();
      const promiseB = `นัดจ่าย ${thai(bkk(-1))} · เลยวันนัดแล้ว`;
      const bAt = lastAt(b.id);
      const bDay = new Date(bAt).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });
      textB.includes(promiseB) && textB.includes(`${bDay} ${hm(bAt)} · ${aname}`) && !textB.includes("ดูทั้งหมด")
        ? pass(`แถว ${b.code}: ตามเมื่อวันก่อนบอกวันที่+เวลา (${bDay} ${hm(bAt)}) · ป้าย "${promiseB}" · ตามครั้งเดียวไม่มีปุ่มดูทั้งหมด`)
        : fail(`แถว ${b.code}: ${textB}`);
      const badgeB = await lbl(promiseB).first().evaluate((n) => getComputedStyle(n).backgroundColor).catch(() => "");
      badgeB === "rgb(185, 28, 28)" ? pass("ป้ายเลยวันนัดแล้ว สีแดง") : fail(`พื้นป้ายเลยนัด: ${badgeB}`);
      const textC = await lbl(`แถวรอจ่าย ${c.code}`).first().innerText();
      const neverColor = await lbl(`แถวรอจ่าย ${c.code}`).first().getByText("ยังไม่เคยตาม", { exact: true }).evaluate((n) => getComputedStyle(n).color).catch(() => "");
      textC.includes("ยังไม่เคยตาม") && neverColor === "rgb(185, 28, 28)" ? pass("ไม่เคยตาม = \"ยังไม่เคยตาม\" สีแดง") : fail(`ยังไม่เคยตาม: ${neverColor} · ${textC}`);

      // ดูทั้งหมด / ซ่อน
      const more = lbl(`ดูการตามทั้งหมด 3 ครั้ง ${d.code}`).first();
      (await more.getAttribute("aria-expanded")) === "false" ? pass("ปุ่มดูทั้งหมดเริ่มพับ (aria-expanded=false)") : fail(`aria-expanded เริ่มต้น: ${await more.getAttribute("aria-expanded")}`);
      await more.click();
      await page.waitForTimeout(500);
      const hist = lbl(`การตามทั้งหมด ${d.code}`).first();
      const histText = (await hist.count()) ? await hist.innerText() : "";
      const order = ["รอเจ้าของร้านอนุมัติ", "ลูกค้าขอเลื่อนจ่าย", "โทรไม่รับ"].map((t) => histText.indexOf(t));
      const dbNotes = sql(`select string_agg(note, ',' order by id desc) from "WorkOrderLog" where "workOrderId"=${d.id} and action='PAYMENT_FOLLOWUP'`);
      const rowBox = await rowD.boundingBox();
      const histBox = await hist.boundingBox().catch(() => null);
      dbNotes === "รอเจ้าของร้านอนุมัติ,ลูกค้าขอเลื่อนจ่าย,โทรไม่รับ" && order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])) &&
        histText.includes(`ลูกค้าขอเลื่อนจ่าย · นัดจ่าย ${thai(bkk(3))}`) && histText.split(aname).length - 1 === 3 &&
        histBox && rowBox && histBox.y > rowBox.y && histBox.y < rowBox.y + rowBox.height
        ? pass("กางการตามทั้งหมดใต้แถว: 3 ครั้ง ใหม่ก่อนเก่า (ตรงฐานข้อมูล) · เวลา · ใคร · หมายเหตุ · ครั้งที่นัดบอกวันนัด")
        : fail(`ประวัติที่กาง: ${histText} · ฐานข้อมูล ${dbNotes}`);
      const less = lbl(`ซ่อนการตาม ${d.code}`).first();
      (await less.getAttribute("aria-expanded")) === "true" && (await less.innerText()).includes("ซ่อน ⌃")
        ? pass("กางแล้วปุ่มเป็น \"ซ่อน ⌃\" (aria-expanded=true)") : fail(`ปุ่มซ่อน: ${await less.getAttribute("aria-expanded")}`);
      await page.screenshot({ path: path.join(DIR, "payment-tab-1b-history.png") });
      await less.click();
      await page.waitForTimeout(400);
      (await lbl(`การตามทั้งหมด ${d.code}`).count()) === 0 && (await lbl(`ดูการตามทั้งหมด 3 ครั้ง ${d.code}`).first().getAttribute("aria-expanded")) === "false"
        ? pass("กด \"ซ่อน ⌃\" แล้วพับ (aria-expanded=false)") : fail("กดซ่อนแล้วไม่พับ");
      (await hash(page)) === "#/awaiting-payment" ? pass("กดดูทั้งหมด/ซ่อนไม่เปิดใบงาน (ปุ่มในแถว)") : fail(`กดดูทั้งหมดแล้วไปที่ ${await hash(page)}`);
    }

    // ── ชิป: ตัวเลข = แถวที่เห็นเมื่อกด = API ──
    const chipLabels = async () => page.locator('[aria-label^="ชิปรอจ่าย "]').locator("visible=true").evaluateAll((ns) => ns.map((n) => [n.getAttribute("aria-label"), n.getAttribute("aria-selected")]));
    const W0 = want(L.payTab);
    const CH = { all: "ทั้งหมด", over: `เกิน ${L.payTab.alertDays} วัน`, late: "เลยวันนัดจ่าย", never: "ยังไม่เคยตาม", followed: "ตามแล้ว" };
    const lateDb = Number(sql(`select count(*) from "WorkOrderLog" l join "WorkOrder" w on w.id=l."workOrderId"
      where w.status='AWAITING_PAYMENT' and w."deletedAt" is null and l.action='PAYMENT_FOLLOWUP' and l.meta->>'payBy' < '${bkk(0)}'
        and l.id = (select max(x.id) from "WorkOrderLog" x where x."workOrderId"=w.id and x.action='PAYMENT_FOLLOWUP' and x.meta ? 'payBy')`));
    L.payTab.late === lateDb && lateDb >= 1
      ? pass(`API: payTab.late ${lateDb} = ใบที่นัดจ่ายล่าสุดเลยวันแล้วในฐานข้อมูล`) : fail(`payTab.late ${L.payTab.late} · ฐานข้อมูล ${lateDb}`);
    const cl = await chipLabels();
    const wantLabels = Object.keys(CH).map((k) => `ชิปรอจ่าย ${CH[k]} ${W0[k]}`);
    JSON.stringify(cl.map((x) => x[0])) === JSON.stringify(wantLabels) && cl[0][1] === "true"
      ? pass(`ชิป: ${wantLabels.map((l) => l.replace(/^ชิปรอจ่าย /, "")).join(" · ")} (ตรง API) · "ทั้งหมด" ติดอยู่`) : fail(`ชิป ${JSON.stringify(cl)} ต้องเป็น ${JSON.stringify(wantLabels)}`);
    for (const k of ["over", "late", "never", "followed", "all"]) {
      await lbl(`ชิปรอจ่าย ${CH[k]} ${W0[k]}`).first().click();
      await page.waitForTimeout(700);
      const shown = await rowsText();
      const sel = (await chipLabels()).find((x) => x[0].startsWith(`ชิปรอจ่าย ${CH[k]} `));
      const exp = {
        over: [a.code, e.code],
        late: [b.code],
        never: [a.code, c.code, e.code],
        followed: [b.code, d.code],
        all: [a.code, b.code, c.code, d.code, e.code],
      }[k];
      const notExp = [a.code, b.code, c.code, d.code, e.code].filter((x) => !exp.includes(x));
      shown.length === W0[k] && sel && sel[1] === "true" && exp.every((x) => shown.includes(x)) && notExp.every((x) => !shown.includes(x))
        ? pass(`ชิป "${CH[k]}": เห็น ${shown.length} แถว = ตัวเลขบนชิป (= payTab ทั้งขอบเขต) · ใบทดสอบที่ควรเห็นครบ ไม่ควรเห็นไม่ขึ้น · aria-selected`)
        : fail(`ชิป ${k}: เห็น ${shown.join(",")} (${shown.length}) ต้อง ${W0[k]} · ${JSON.stringify(sel)}`);
    }
    await page.screenshot({ path: path.join(DIR, "payment-tab-1-desktop.png") });

    // ── ตามลูกค้าแล้วในแถว (ใบ c) ──
    const n0 = Number(sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${c.id} and action='PAYMENT_FOLLOWUP'`));
    await lbl(`ตามลูกค้าแล้ว ${c.code}`).first().click();
    await page.waitForTimeout(600);
    const input = lbl(`ลูกค้าว่ายังไง ${c.code}`).first();
    if (!(await input.count())) fail("กดตามลูกค้าแล้ว — ไม่มีช่อง \"ลูกค้าว่ายังไง\"");
    else {
      const rowBox = await lbl(`แถวรอจ่าย ${c.code}`).first().boundingBox();
      const inBox = await input.boundingBox();
      inBox && rowBox && inBox.y > rowBox.y && inBox.y < rowBox.y + rowBox.height
        ? pass("ช่อง \"ลูกค้าว่ายังไง\" กางใต้แถวของใบนั้น") : fail(`ตำแหน่งช่อง ${JSON.stringify(inBox)} แถว ${JSON.stringify(rowBox)}`);
      (await input.getAttribute("placeholder")) === "เช่น จะโอนวันศุกร์ (ไม่บังคับ)" ? pass("placeholder บอกว่าไม่บังคับ") : fail(`placeholder: ${await input.getAttribute("placeholder")}`);
      const formText = await lbl(`ฟอร์มตามลูกค้า ${c.code}`).first().innerText();
      formText.includes("วัน-เวลาและชื่อคนตาม ระบบจดให้เอง — จดแค่ว่าลูกค้าว่ายังไง")
        ? pass("ฟอร์มบอก \"วัน-เวลาและชื่อคนตาม ระบบจดให้เอง — จดแค่ว่าลูกค้าว่ายังไง\"") : fail(`คำแนะนำในฟอร์ม: ${formText}`);
      // ข้อความลัด: แตะแล้วต่อท้ายช่อง (แก้ต่อได้)
      const phrases = ["ลูกค้าจะโอนวันนี้", "ขอเลื่อนจ่าย", "โทรไม่รับ", "รอเจ้าของร้านอนุมัติ"];
      const have = await Promise.all(phrases.map((t) => lbl(`ข้อความลัด ${t} ${c.code}`).count()));
      have.every((n) => n === 1) ? pass(`ข้อความลัด 4 ตัว: ${phrases.join(" · ")}`) : fail(`ข้อความลัด: ${have.join(",")}`);
      await lbl(`ข้อความลัด โทรไม่รับ ${c.code}`).first().click();
      await page.waitForTimeout(200);
      const v1 = await input.inputValue();
      await lbl(`ข้อความลัด ลูกค้าจะโอนวันนี้ ${c.code}`).first().click();
      await page.waitForTimeout(200);
      const v2 = await input.inputValue();
      v1 === "โทรไม่รับ" && v2 === "โทรไม่รับ ลูกค้าจะโอนวันนี้"
        ? pass(`แตะข้อความลัดแล้วต่อท้ายช่อง: "${v1}" → "${v2}"`) : fail(`ข้อความลัด: "${v1}" → "${v2}"`);
      await input.fill("ลูกค้าว่าจะโอนวันศุกร์");
      (await input.inputValue()) === "ลูกค้าว่าจะโอนวันศุกร์" ? pass("ช่องแก้ต่อได้หลังแตะข้อความลัด") : fail("แก้ช่องไม่ได้");
      // ลูกค้านัดจ่ายวันที่ — ปฏิทินเดียวกับช่องวันที่อื่น · วันที่ผ่านแล้วกดไม่ได้
      const dateBtn = lbl(`ลูกค้านัดจ่ายวันที่ ${c.code}`).first();
      await dateBtn.click();
      await page.waitForTimeout(500);
      (await dateBtn.getAttribute("aria-expanded")) === "true" ? pass("กดช่องลูกค้านัดจ่ายวันที่ ปฏิทินกาง (aria-expanded)") : fail("ปฏิทินไม่กาง");
      const pick = bkk(2);
      if (pick.slice(0, 7) !== bkk(0).slice(0, 7)) {
        await lbl("เดือนถัดไป").first().click();
        await page.waitForTimeout(300);
      }
      const yest = lbl(thai(bkk(-1), true)).first();
      if (bkk(-1).slice(0, 7) === pick.slice(0, 7) && (await yest.count()))
        (await yest.getAttribute("aria-disabled")) === "true" ? pass(`เมื่อวาน (${thai(bkk(-1), true)}) กดไม่ได้ — นัดย้อนหลังไม่ได้`) : fail("วันที่ผ่านแล้วยังกดได้");
      await lbl(thai(pick, true)).first().click();
      await page.waitForTimeout(400);
      (await dateBtn.innerText()).includes(thai(pick, true)) ? pass(`เลือกวันนัดจ่าย ${thai(pick, true)}`) : fail(`ช่องวันที่: ${await dateBtn.innerText()}`);
      await page.screenshot({ path: path.join(DIR, "payment-tab-2-follow.png") });
      await lbl(`บันทึกการตามลูกค้า ${c.code}`).first().click();
      await page.waitForTimeout(3000);
      const row = sql(`select count(*)||'|'||max("userId")||'|'||max(status)||'|'||max(note)||'|'||max(meta->>'payBy') from "WorkOrderLog" where "workOrderId"=${c.id} and action='PAYMENT_FOLLOWUP'`);
      row === `${n0 + 1}|${aid}|AWAITING_PAYMENT|ลูกค้าว่าจะโอนวันศุกร์|${pick}`
        ? pass(`ฐานข้อมูล: แถว PAYMENT_FOLLOWUP ใหม่ (A001 · ขั้นเดิม · หมายเหตุ · meta.payBy ${pick})`) : fail(`ฐานข้อมูล: ${row}`);
      st(c.id) === "AWAITING_PAYMENT" ? pass("ใบอยู่ขั้นเดิม (ตามลูกค้าไม่ใช่การเดินขั้น)") : fail(`ขั้นเปลี่ยนเป็น ${st(c.id)}`);
      const rowC = await lbl(`แถวรอจ่าย ${c.code}`).first().innerText();
      rowC.includes(`วันนี้ `) && rowC.includes(` · ${aname}`) && rowC.includes("ลูกค้าว่าจะโอนวันศุกร์") && rowC.includes(`นัดจ่าย ${thai(pick)}`) &&
        !rowC.includes("ยังไม่เคยตาม") && (await lbl(`ลูกค้าว่ายังไง ${c.code}`).count()) === 0
        ? pass(`แถวขึ้น "วันนี้ HH:MM · ${aname}" / "ลูกค้าว่าจะโอนวันศุกร์" / "นัดจ่าย ${thai(pick)}" ทันที · ฟอร์มพับ`) : fail(`แถวหลังตาม: ${rowC}`);
      const W1 = { ...W0, never: W0.never - 1, followed: W0.followed + 1 };
      L = await api();
      const cl2 = (await chipLabels()).map((x) => x[0]);
      JSON.stringify(cl2) === JSON.stringify(Object.keys(CH).map((k) => `ชิปรอจ่าย ${CH[k]} ${W1[k]}`)) && JSON.stringify(want(L.payTab)) === JSON.stringify(W1)
        ? pass(`ชิปขยับทันที: ยังไม่เคยตาม ${W0.never}→${W1.never} · ตามแล้ว ${W0.followed}→${W1.followed} (ตรง API หลังบันทึก)`) : fail(`ชิปหลังตาม ${cl2.join(" · ")} · API ${JSON.stringify(L.payTab)}`);
      // ตัวเช็คเบื้องหลัง (1 นาที/เมื่อกลับมาแท็บ) ต้องไม่ขึ้น "มีอัปเดต" ปลอมจากแถวที่จดในเครื่อง — ข้อมูลในมือตรงกับเซิร์ฟเวอร์ทุกช่อง
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await page.waitForTimeout(3000);
      (await page.getByText(/มีอัปเดต/).locator("visible=true").count()) === 0 ? pass("ไม่มีปุ่ม \"มีอัปเดต\" ปลอมหลังตามลูกค้าในแถว") : fail("ขึ้นปุ่มมีอัปเดตทั้งที่ข้อมูลตรงกัน");
    }

    // ── ลูกค้าไม่ซ่อมในแถว (ใบ e — เกิน 6 วัน · มีอะไหล่ออกจากคลังแล้ว) ──
    {
      L = await api();
      const P0 = L.payTab;
      const tabBefore = await page.locator('[role="tab"][aria-selected="true"]').locator("visible=true").first().getAttribute("aria-label");
      await lbl(`ลูกค้าไม่ซ่อม ${e.code}`).first().click();
      await page.waitForTimeout(2500);
      const form = lbl(`ฟอร์มลูกค้าไม่ซ่อม ${e.code}`).first();
      const rowBox = await lbl(`แถวรอจ่าย ${e.code}`).first().boundingBox();
      const fBox = await form.boundingBox().catch(() => null);
      const fText = (await form.count()) ? await form.innerText() : "";
      fBox && rowBox && fBox.y > rowBox.y && fBox.y < rowBox.y + rowBox.height &&
        fText.includes("ลูกค้าไม่ซ่อม — เลือกเหตุผล") && fText.includes(`มีอะไหล่ที่ออกจากคลังแล้ว 1 รายการ`) && fText.includes(`ใบเบิก RQ-PAYTAB-${e.id}`) && fText.includes("ต้องคืนเข้าคลัง")
        ? pass("ฟอร์มลูกค้าไม่ซ่อมกางใต้แถว · เตือนอะไหล่ที่ออกจากคลัง (ถามใบงานตอนกาง) · ข้อความเดียวกับหน้าใบงาน")
        : fail(`ฟอร์มลูกค้าไม่ซ่อม: ${fText}`);
      const reasons = await form.locator('[aria-label^="เหตุผลลูกค้าไม่ซ่อม "]').evaluateAll((ns) => ns.map((n) => n.innerText));
      reasons.join(" · ") === "ราคาสูงไป · ซ่อมเอง / หาช่างอื่น · เลิกใช้เครื่องนี้ · ติดต่อลูกค้าไม่ได้ · อื่น ๆ"
        ? pass("ชิปเหตุผล 5 ตัวชุดเดียวกับหน้าใบงาน") : fail(`ชิปเหตุผล: ${reasons.join(" · ")}`);
      const confirm = lbl(`ยืนยัน ลูกค้าไม่ซ่อม ${e.code}`).first();
      await confirm.click();
      await page.waitForTimeout(1200);
      st(e.id) === "AWAITING_PAYMENT" && (await form.innerText()).includes("เลือกเหตุผลก่อน")
        ? pass("ไม่เลือกเหตุผลกดยืนยัน = ไม่ส่ง (ฐานข้อมูลยังรอเงิน) · บอก \"เลือกเหตุผลก่อน\"") : fail(`ไม่เลือกเหตุผล: ${st(e.id)}`);
      await lbl(`เหตุผลลูกค้าไม่ซ่อม อื่น ๆ ${e.code}`).first().click();
      await page.waitForTimeout(300);
      await confirm.click();
      await page.waitForTimeout(1200);
      (await lbl(`เหตุผลลูกค้าไม่ซ่อม อื่น ๆ ${e.code}`).first().getAttribute("aria-selected")) === "true" && st(e.id) === "AWAITING_PAYMENT" &&
        (await form.innerText()).includes("พิมพ์เหตุผลก่อน")
        ? pass("\"อื่น ๆ\" ติด (aria-selected) แต่ไม่พิมพ์ = ไม่ส่ง · บอก \"พิมพ์เหตุผลก่อน\"") : fail(`อื่น ๆ ว่าง: ${st(e.id)}`);
      await lbl(`เหตุผลลูกค้าไม่ซ่อม ราคาสูงไป ${e.code}`).first().click();
      await lbl(`รายละเอียดลูกค้าไม่ซ่อม ${e.code}`).first().fill("ได้ราคาร้านอื่นถูกกว่า");
      await page.screenshot({ path: path.join(DIR, "payment-tab-2b-decline.png") });
      await confirm.click();
      // แจ้งสำเร็จหายเองใน 3.5 วิ — จับตอนขึ้น ไม่รอจนเช็คอย่างอื่นเสร็จ
      const toastText = `${e.code} ลูกค้าไม่ซ่อม · ยกเลิกใบงานแล้ว`;
      let toasted = false;
      for (let i = 0; i < 24 && !toasted; i++) {
        await page.waitForTimeout(250);
        toasted = (await page.getByText(toastText).locator("visible=true").count()) > 0;
      }
      await page.waitForTimeout(1500);
      const cancelRow = sql(`select w.status||'|'||l."userId"||'|'||l.note||'|'||(l.meta->>'reasonCode')||'|'||(l.meta->>'declineReason')
        from "WorkOrder" w join "WorkOrderLog" l on l."workOrderId"=w.id where w.id=${e.id} order by l.id desc limit 1`);
      cancelRow === `CANCELLED|${aid}|เสนอราคาแล้วลูกค้าไม่ซ่อม · ราคาสูงไป — ได้ราคาร้านอื่นถูกกว่า|QUOTE_DECLINED|PRICE`
        ? pass("ฐานข้อมูล: CANCELLED · ประวัติ \"เสนอราคาแล้วลูกค้าไม่ซ่อม · ราคาสูงไป — …\" · meta QUOTE_DECLINED/PRICE (ทางเดียวกับหน้าใบงาน)") : fail(`ฐานข้อมูล: ${cancelRow}`);
      sql(`select count(*)||'|'||max("requisitionNo") from "WorkOrderPart" where "workOrderId"=${e.id}`) === `1|RQ-PAYTAB-${e.id}`
        ? pass("ฐานข้อมูล: อะไหล่/เลขใบเบิกยังอยู่ให้คลังรับคืน") : fail("อะไหล่หายหลังยกเลิก");
      (await lbl(`แถวรอจ่าย ${e.code}`).count()) === 0 && (await hash(page)) === "#/awaiting-payment"
        ? pass(`แถว ${e.code} หายจากแท็บ (ไม่เปิดใบงาน ไม่โหลดทั้งหน้า)`) : fail(`แถวยังอยู่ / ที่อยู่ ${await hash(page)}`);
      toasted ? pass(`แจ้ง "${toastText}"`) : fail("ไม่มีข้อความแจ้งว่ายกเลิกแล้ว");
      L = await api();
      const P1 = L.payTab;
      const W2 = want(P1);
      const cl3 = (await chipLabels()).map((x) => x[0]);
      const tabAfter = `รอลูกค้าจ่ายเงิน ${P1.total} ใบ${P1.over ? ` · เกิน ${P1.alertDays} วัน ${P1.over}` : ""}`;
      P1.total === P0.total - 1 && P1.over === P0.over - 1 && P1.never === P0.never - 1 &&
        JSON.stringify(cl3) === JSON.stringify(Object.keys(CH).map((k) => `ชิปรอจ่าย ${CH[k]} ${W2[k]}`)) &&
        (await page.locator(`[role="tab"][aria-label="${tabAfter}"]`).locator("visible=true").count()) === 1
        ? pass(`ตัวเลขขยับทันที: แท็บ "${tabBefore}" → "${tabAfter}" · ชิปทั้งหมด/เกิน/ยังไม่เคยตาม −1 (ตรง API)`)
        : fail(`หลังลูกค้าไม่ซ่อม: ชิป ${cl3.join(" · ")} · API ${JSON.stringify(P1)} · แท็บ ${tabAfter}`);
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await page.waitForTimeout(3000);
      (await page.getByText(/มีอัปเดต/).locator("visible=true").count()) === 0 ? pass("ไม่มีปุ่ม \"มีอัปเดต\" ปลอมหลังลูกค้าไม่ซ่อมในแถว") : fail("ขึ้นปุ่มมีอัปเดตหลังลูกค้าไม่ซ่อม");
    }

    // ── กดแถวเปิดใบงาน · การ์ดบอกนัดจ่าย (ใบ b เลยวันนัด) ──
    await lbl(`แถวรอจ่าย ${b.code}`).first().getByText(b.code, { exact: true }).click();
    await page.waitForTimeout(3500);
    (await hash(page)) === `#/wo/${b.code}` ? pass("กดแถวแล้วเปิดใบงาน") : fail(`กดแถว: ${await hash(page)}`);
    {
      const box = page.locator('[aria-label="กล่องรอลูกค้าจ่ายเงิน"]').locator("visible=true").first();
      const boxText = (await box.count()) ? await box.innerText() : "";
      const line = `ลูกค้านัดจ่าย ${thai(bkk(-1), true)} · เลยวันนัดแล้ว ยังไม่จ่าย`;
      const lineColor = await box.getByText(line, { exact: true }).evaluate((n) => getComputedStyle(n).color).catch(() => "");
      boxText.includes(line) && lineColor === "rgb(185, 28, 28)"
        ? pass(`หน้าใบงาน: "${line}" สีแดง`) : fail(`การ์ดนัดจ่าย: ${lineColor} · ${boxText}`);
      boxText.includes(`ลูกค้าบอกโอนพรุ่งนี้ · นัดจ่าย ${thai(bkk(-1))}`)
        ? pass("หน้าใบงาน: บรรทัดการตามบอกวันนัดของครั้งนั้น") : fail(`บรรทัดการตาม: ${boxText}`);
    }
    await page.goBack();
    await page.waitForTimeout(2500);
    (await hash(page)) === "#/awaiting-payment" ? pass("ปิดใบงาน (ย้อนกลับ) กลับมาแท็บเดิม") : fail(`ย้อนกลับ: ${await hash(page)}`);

    // ── F5 ──
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(4500);
    (await page.locator('[role="tab"][aria-selected="true"]').locator("visible=true").first().getAttribute("aria-label").catch(() => "")).startsWith("รอลูกค้าจ่ายเงิน")
      ? pass("F5 ที่ #/awaiting-payment อยู่แท็บเดิม") : fail("F5 แล้วไม่ได้แท็บรอเงิน");

    // ── กล่องงาน: ไม่มีแถบรอเงิน (เจ้าของงานเอาออก 6 พ.ย. 69) ──
    await page.locator('[aria-label="กล่องงานของฉัน"]').locator("visible=true").first().click().catch(() => {});
    await page.waitForTimeout(4000);
    if ((await hash(page)) !== "#/inbox") {
      await page.goto(`${APP}/#/inbox`);
      await page.waitForTimeout(4500);
    }
    L = await api();
    {
      const bars = await page.locator('[aria-label^="หัวข้อ รอลูกค้าจ่ายเงิน"]').locator("visible=true").count();
      (await hash(page)) === "#/inbox" && bars === 0 && (await page.getByText("ดูในแท็บ รอลูกค้าจ่ายเงิน").count()) === 0
        ? pass("กล่องงาน: ไม่มีแถบรอลูกค้าจ่ายเงิน (เลขอยู่บนแท็บกับชิปแล้ว)") : fail(`ยังมีแถบรอเงิน ${bars} · ${await hash(page)}`);
      const inList = await page.locator('[data-testid="howto-orders.row"]').locator("visible=true").evaluateAll((ns, code) => ns.some((n) => n.innerText.includes(code)), a.code);
      inList ? pass(`ใบรอเงิน (${a.code}) ยังอยู่ในรายการกล่องงานข้างล่างตามปกติ`) : fail("ใบรอเงินหายจากรายการกล่องงาน");
      await page.screenshot({ path: path.join(DIR, "payment-tab-3-inbox.png") });
    }
    // ชิปต้องรีบดูในกล่องงาน → แท็บนี้ที่ชิปเกิน 3 วัน
    const qchip = page.locator(`[aria-label="ต้องรีบดู รอจ่ายเกิน ${L.payTab.alertDays} วัน ${L.payTab.over}"]`).locator("visible=true").first();
    if (!(await qchip.count())) fail(`ไม่มีชิป "รอจ่ายเกิน ${L.payTab.alertDays} วัน ${L.payTab.over}" ในกล่องงาน`);
    else {
      (await hash(page)) === "#/inbox" ? pass("กลับแท็บกล่องงาน ที่อยู่เป็น #/inbox") : fail(`ที่อยู่กล่องงาน: ${await hash(page)}`);
      await qchip.click();
      await page.waitForTimeout(3500);
      const selChip = (await chipLabels()).find((x) => x[1] === "true");
      const shown = await rowsText();
      selChip && selChip[0].startsWith(`ชิปรอจ่าย เกิน ${L.payTab.alertDays} วัน`) && shown.length === L.payTab.over && shown.includes(a.code)
        ? pass(`ชิป "รอจ่ายเกิน ${L.payTab.alertDays} วัน" → แท็บรอเงิน ชิปเกิน ${L.payTab.alertDays} วัน ติด (${shown.length} แถว)`) : fail(`ชิปพาไป: ${JSON.stringify(selChip)} · ${shown.join(",")}`);
    }
    await ctx.close();

    // ── มือถือ ──
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const mp = await mctx.newPage();
    mp.on("pageerror", (e) => errors.push(String(e)));
    await login(mp, "A001");
    await mp.goto(`${APP}/#/awaiting-payment`);
    await mp.waitForTimeout(5000);
    const mlbl = (l) => mp.locator(`[aria-label="${l}"]`).locator("visible=true").first();
    const noOverflow = () => mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    // ปุ่ม/ช่องอยู่ในการ์ดและในความกว้างจอ (ไม่ถูกตัดขอบขวา)
    const inside = async (l, cardBox) => {
      const b = await mlbl(l).boundingBox().catch(() => null);
      return !!b && !!cardBox && b.x >= cardBox.x - 1 && b.x + b.width <= Math.min(cardBox.x + cardBox.width, 390) + 1;
    };
    const card = mp.locator(`[aria-label="แถวรอจ่าย ${a.code}"]`).locator("visible=true").first();
    if (!(await card.count())) fail("มือถือ: ไม่มีการ์ดใบรอเงิน");
    else {
      const box = await card.boundingBox();
      box && box.width <= 390 && box.width > 300 ? pass(`มือถือ: แถวเป็นการ์ดกว้าง ${Math.round(box.width)} px`) : fail(`การ์ด: ${JSON.stringify(box)}`);
      (await inside(`ลูกค้าไม่ซ่อม ${a.code}`, box)) && (await inside(`ตามลูกค้าแล้ว ${a.code}`, box)) && (await inside(`เปิดใบงาน ${a.code}`, box))
        ? pass("มือถือ: ปุ่ม ลูกค้าไม่ซ่อม · ตามลูกค้าแล้ว · › อยู่ในการ์ดแถวเดียว ไม่ล้นขอบ") : fail("มือถือ: ปุ่มในการ์ดล้นขอบ");
      await mlbl(`ตามลูกค้าแล้ว ${a.code}`).click();
      await mp.waitForTimeout(700);
      const inp = await mlbl(`ลูกค้าว่ายังไง ${a.code}`).boundingBox();
      inp && inp.y > 0 && inp.y < 844 && (await inside(`ลูกค้านัดจ่ายวันที่ ${a.code}`, box)) && (await inside(`บันทึกการตามลูกค้า ${a.code}`, box))
        ? pass("มือถือ: ฟอร์มตามลูกค้า (ช่อง · ข้อความลัด · วันนัด · ปุ่ม) กางในการ์ดอยู่ในจอ") : fail(`ช่องมือถือ: ${JSON.stringify(inp)}`);
      (await noOverflow()) ? pass("มือถือ: กางฟอร์มตามแล้วไม่ล้นจอแนวนอน") : fail("มือถือ: ฟอร์มตามล้นจอแนวนอน");
      await mp.screenshot({ path: path.join(DIR, "payment-tab-4b-phone-follow.png") });
      await mlbl(`ยกเลิกการตาม ${a.code}`).click();
      await mp.waitForTimeout(400);
      await mlbl(`ลูกค้าไม่ซ่อม ${a.code}`).click();
      await mp.waitForTimeout(2500);
      const f = await mlbl(`ฟอร์มลูกค้าไม่ซ่อม ${a.code}`).boundingBox().catch(() => null);
      f && f.y > -50 && f.y < 844 && f.x + f.width <= 391 && (await noOverflow())
        ? pass("มือถือ: กดลูกค้าไม่ซ่อมแล้วฟอร์มกางในการ์ด อยู่ในจอ ไม่ล้นแนวนอน") : fail(`มือถือ ฟอร์มลูกค้าไม่ซ่อม: ${JSON.stringify(f)}`);
      await mp.screenshot({ path: path.join(DIR, "payment-tab-4c-phone-decline.png") });
      await mlbl(`กลับ ไม่ยกเลิกใบงาน ${a.code}`).click();
      await mp.waitForTimeout(400);
      st(a.id) === "AWAITING_PAYMENT" && (await mlbl(`ฟอร์มลูกค้าไม่ซ่อม ${a.code}`).count()) === 0
        ? pass("มือถือ: กด \"กลับ\" ฟอร์มพับ ใบไม่ถูกยกเลิก") : fail(`มือถือ กลับ: ${st(a.id)}`);
    }
    const cardD = mp.locator(`[aria-label="แถวรอจ่าย ${d.code}"]`).locator("visible=true").first();
    if (await cardD.count()) {
      await cardD.scrollIntoViewIfNeeded();
      const t = await cardD.innerText();
      t.includes("ตามล่าสุด วันนี้") && t.includes("รอเจ้าของร้านอนุมัติ") && t.includes(`นัดจ่าย ${thai(bkk(3))}`) && t.includes("ตาม 3 ครั้ง · ดูทั้งหมด ⌄")
        ? pass("มือถือ: การ์ดบอกตามล่าสุด · หมายเหตุ · ป้ายนัดจ่าย · ดูทั้งหมด") : fail(`มือถือ การ์ด ${d.code}: ${t}`);
      await mlbl(`ดูการตามทั้งหมด 3 ครั้ง ${d.code}`).click();
      await mp.waitForTimeout(500);
      const h = await mlbl(`การตามทั้งหมด ${d.code}`).boundingBox().catch(() => null);
      h && h.x + h.width <= 391 && (await noOverflow()) ? pass("มือถือ: กางการตามทั้งหมดในการ์ด ไม่ล้นจอแนวนอน") : fail(`มือถือ ประวัติ: ${JSON.stringify(h)}`);
      await mp.screenshot({ path: path.join(DIR, "payment-tab-4d-phone-history.png") });
    } else fail(`มือถือ: ไม่มีการ์ด ${d.code}`);
    (await noOverflow()) ? pass("มือถือ: ไม่ล้นจอแนวนอน") : fail("มือถือ: ล้นจอแนวนอน");
    await mp.screenshot({ path: path.join(DIR, "payment-tab-4-phone.png") });
    await mctx.close();

    // ── คนที่ไม่มีแท็บ ──
    const hash0 = sql(`select "passwordHash" from "User" where "employeeCode"='A001'`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword","howtoSeen") values ('${PA}','แอดมินอะไหล่ทดสอบแท็บรอเงิน','PARTS_ADMIN','${hash0}',false,
         (select "howtoSeen" from "User" where "employeeCode"='A001'))`);
    for (const who of ["S001", "T001", PA]) {
      const xc = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      const xp = await xc.newPage();
      xp.on("pageerror", (e) => errors.push(`${who}: ${e}`));
      await login(xp, who);
      await xp.goto(`${APP}/#/work-orders`);
      await xp.waitForTimeout(4500);
      const t = await xp.locator('[role="tab"]').locator("visible=true").evaluateAll((ns) => ns.map((n) => n.getAttribute("aria-label") || ""));
      await xp.goto(`${APP}/#/awaiting-payment`);
      await xp.waitForTimeout(4500);
      const h = await hash(xp);
      t.length > 0 && !t.some((x) => x.startsWith("รอลูกค้าจ่ายเงิน")) && h === "#/work-orders" && (await xp.locator('[aria-label^="ชิปรอจ่าย "]').count()) === 0
        ? pass(`${who}: ไม่มีแท็บรอลูกค้าจ่ายเงิน · เปิดลิงก์ #/awaiting-payment ได้ใบงานซ่อมปกติ (ที่อยู่ ${h})`) : fail(`${who}: แท็บ ${t.join(" | ")} · ที่อยู่ ${h}`);
      await xc.close();
    }

    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    if (fx) {
      fx.sql(`delete from "UsageSlot" where "userId" in (select id from "User" where "employeeCode"='${PA}');
              delete from "User" where "employeeCode"='${PA}'`);
      await fx.cleanup();
    }
    await browser.close();
  }
})();
