// ทดสอบ: แท็บ "รอลูกค้าจ่ายเงิน" ในหน้าใบงานซ่อม (เจ้าของงานเลือก 5 พ.ย. 69 · ตัวอย่าง paytab — ตอบ "ทำตามที่แนะนำ")
//   · แอดมินจอคอม: แท็บอยู่ระหว่าง "ที่ยังค้าง" กับ "รอคอนเฟิร์มลูกค้า" · ตัวเลข + ป้ายแดง "เกิน 3 วัน n" ตรงกับ payTab ของ API
//     และจำนวนใบในฐานข้อมูล · กดแท็บแล้วที่อยู่เป็น #/awaiting-payment ชื่อแท็บเบราว์เซอร์ "รอลูกค้าจ่ายเงิน" · F5 อยู่แท็บเดิม
//   · ใบทดสอบสามใบ (ส่งใบเสนอราคาทาง API จริง): ถอย 5 วันทาง SQL (เกิน · ยังไม่เคยตาม) · 2 วัน (ตามแล้ว) · วันนี้ (ยังไม่เคยตาม)
//     แถวเรียงรอนานสุดก่อน · คอลัมน์ ส่งใบเสนอราคา (วัน · ชื่อ) · รอมาแล้ว · ตามลูกค้าล่าสุด / "ยังไม่เคยตาม"
//   · ชิป ทั้งหมด / เกิน 3 วัน / ยังไม่เคยตาม / ตามแล้ว: ตัวเลข = แถวที่เห็นเมื่อกด = นับจาก API · aria-selected
//   · "ตามลูกค้าแล้ว" ในแถว: ช่อง "ลูกค้าว่ายังไง" ใต้แถว → บันทึก → ฐานข้อมูลมีแถว PAYMENT_FOLLOWUP (A001 · หมายเหตุ)
//     → แถวขึ้น "วันนี้ · …" · ชิปยังไม่เคยตาม −1 / ตามแล้ว +1 ทันที · กดแถวเปิดใบงาน
//   · กล่องงาน: แถบบรรทัดเดียว "รอลูกค้าจ่ายเงิน n · เกิน 3 วัน m · ยังไม่เคยตาม k" (ไม่มีปุ่มย่อ/ขยาย) · ใบยังอยู่ในรายการข้างล่าง
//     · ปุ่ม "ดูในแท็บ รอลูกค้าจ่ายเงิน" → แท็บนี้ ชิปทั้งหมด · ชิปต้องรีบดู "รอจ่ายเกิน 3 วัน" → แท็บนี้ ชิปเกิน 3 วัน
//     · หัวข้อ "ไม่มีคนรับ" ยังย่อ/ขยายได้ตามเดิม (ถ้ามี)
//   · มือถือ 390: แถวเป็นการ์ด · ตามลูกค้าแล้วกางช่องในการ์ด · ไม่ล้นจอแนวนอน
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
    const b = await quoted(); // ถอย 2 วัน — ตามแล้ว
    const c = await quoted(); // วันนี้ — ยังไม่เคยตาม (จะตามในแถว)
    sql(`update "WorkOrderLog" set "createdAt"="createdAt"-interval '5 days' where "workOrderId"=${a.id};
         update "WorkOrder" set "createdAt"="createdAt"-interval '5 days' where id=${a.id};
         update "WorkOrderLog" set "createdAt"="createdAt"-interval '2 days' where "workOrderId"=${b.id};
         update "WorkOrder" set "createdAt"="createdAt"-interval '2 days' where id=${b.id}`);
    await fx.call(fx.A, "POST", `/work-orders/${b.id}/payment-followup`, { note: "ลูกค้าบอกโอนพรุ่งนี้" });
    const st = (id) => sql(`select status from "WorkOrder" where id=${id}`);
    [a, b, c].every((w) => st(w.id) === "AWAITING_PAYMENT")
      ? pass(`เตรียมใบ ${a.code} · ${b.code} · ${c.code} ขั้นรอลูกค้าจ่ายเงิน (ฐานข้อมูล)`)
      : fail(`เตรียมใบไม่ถึงขั้นรอเงิน: ${[a, b, c].map((w) => st(w.id)).join(" ")}`);
    const aid = sql(`select id from "User" where "employeeCode"='A001'`);
    const aname = sql(`select name from "User" where "employeeCode"='A001'`);
    const api = async () => (await fx.call(fx.A, "GET", "/work-orders?status=AWAITING_PAYMENT"));
    let L = await api();
    const dbTotal = Number(sql(`select count(*) from "WorkOrder" where status='AWAITING_PAYMENT' and "deletedAt" is null`));
    L.payTab && L.payTab.total === dbTotal && L.rows.length === dbTotal
      ? pass(`API: payTab.total ${dbTotal} = ใบขั้นรอเงินในฐานข้อมูล = แถวของแท็บ`) : fail(`API payTab ${JSON.stringify(L.payTab)} · แถว ${L.rows.length} · ฐานข้อมูล ${dbTotal}`);
    const want = (p) => ({ all: p.total, over: p.over, never: p.never, followed: p.followed });

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
    const rowsText = async () => page.locator('[aria-label^="แถวรอจ่าย "]').locator("visible=true").evaluateAll((ns) => ns.map((n) => n.getAttribute("aria-label").slice(9)));
    const codesShown = await rowsText();
    const ia = codesShown.indexOf(a.code), ib = codesShown.indexOf(b.code), ic = codesShown.indexOf(c.code);
    codesShown.length === dbTotal && ia >= 0 && ib > ia && ic > ib
      ? pass(`แถวครบ ${dbTotal} ใบ · เรียงรอนานสุดก่อน (${a.code} 5 วัน → ${b.code} 2 วัน → ${c.code} วันนี้)`) : fail(`แถว: ${codesShown.join(",")}`);
    const rowA = await lbl(`แถวรอจ่าย ${a.code}`).first().innerText();
    const qAt = sql(`select to_char("createdAt" + interval '7 hours','FMDD') from "WorkOrderLog" where "workOrderId"=${a.id} and action='QUOTED' order by id desc limit 1`);
    rowA.includes("5 วัน") && rowA.includes("ยังไม่เคยตาม") && rowA.includes(aname) && rowA.includes(qAt) && rowA.includes("ตามลูกค้าแล้ว")
      ? pass(`แถว ${a.code}: ส่งใบเสนอราคา ${qAt} … · ${aname} · รอ 5 วัน · "ยังไม่เคยตาม" · ปุ่มตามลูกค้าแล้ว`) : fail(`แถว ${a.code}: ${rowA}`);
    const rowBg = await lbl(`แถวรอจ่าย ${a.code}`).first().evaluate((n) => getComputedStyle(n).backgroundColor);
    rowBg === "rgb(254, 242, 242)" ? pass("แถวที่รอเกินกำหนดพื้นแดงจาง") : fail(`พื้นแถวเกิน: ${rowBg}`);
    const rowB = await lbl(`แถวรอจ่าย ${b.code}`).first().innerText();
    rowB.includes("2 วัน") && rowB.includes("ลูกค้าบอกโอนพรุ่งนี้") && !rowB.includes("ยังไม่เคยตาม")
      ? pass(`แถว ${b.code}: รอ 2 วัน · ตามล่าสุด "ลูกค้าบอกโอนพรุ่งนี้"`) : fail(`แถว ${b.code}: ${rowB}`);

    // ── ชิป: ตัวเลข = แถวที่เห็นเมื่อกด = API ──
    const chipLabels = async () => page.locator('[aria-label^="ชิปรอจ่าย "]').locator("visible=true").evaluateAll((ns) => ns.map((n) => [n.getAttribute("aria-label"), n.getAttribute("aria-selected")]));
    const W0 = want(L.payTab);
    const CH = { all: "ทั้งหมด", over: `เกิน ${L.payTab.alertDays} วัน`, never: "ยังไม่เคยตาม", followed: "ตามแล้ว" };
    const cl = await chipLabels();
    const wantLabels = Object.keys(CH).map((k) => `ชิปรอจ่าย ${CH[k]} ${W0[k]}`);
    JSON.stringify(cl.map((x) => x[0])) === JSON.stringify(wantLabels) && cl[0][1] === "true"
      ? pass(`ชิป: ${wantLabels.map((l) => l.slice(9)).join(" · ")} (ตรง API) · "ทั้งหมด" ติดอยู่`) : fail(`ชิป ${JSON.stringify(cl)} ต้องเป็น ${JSON.stringify(wantLabels)}`);
    for (const k of ["over", "never", "followed", "all"]) {
      await lbl(`ชิปรอจ่าย ${CH[k]} ${W0[k]}`).first().click();
      await page.waitForTimeout(700);
      const shown = await rowsText();
      const sel = (await chipLabels()).find((x) => x[0].startsWith(`ชิปรอจ่าย ${CH[k]} `));
      const exp = { over: [a.code], never: [a.code, c.code], followed: [b.code], all: [a.code, b.code, c.code] }[k];
      const notExp = [a.code, b.code, c.code].filter((x) => !exp.includes(x));
      shown.length === W0[k] && sel && sel[1] === "true" && exp.every((x) => shown.includes(x)) && notExp.every((x) => !shown.includes(x))
        ? pass(`ชิป "${CH[k]}": เห็น ${shown.length} แถว = ตัวเลขบนชิป · ใบทดสอบที่ควรเห็นครบ ไม่ควรเห็นไม่ขึ้น · aria-selected`)
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
      await input.fill("ลูกค้าว่าจะโอนวันศุกร์");
      await page.screenshot({ path: path.join(DIR, "payment-tab-2-follow.png") });
      await lbl(`บันทึกการตามลูกค้า ${c.code}`).first().click();
      await page.waitForTimeout(3000);
      const row = sql(`select count(*)||'|'||max("userId")||'|'||max(status)||'|'||max(note) from "WorkOrderLog" where "workOrderId"=${c.id} and action='PAYMENT_FOLLOWUP'`);
      row === `${n0 + 1}|${aid}|AWAITING_PAYMENT|ลูกค้าว่าจะโอนวันศุกร์`
        ? pass("ฐานข้อมูล: แถว PAYMENT_FOLLOWUP ใหม่ (A001 · ขั้นเดิม · หมายเหตุ)") : fail(`ฐานข้อมูล: ${row}`);
      st(c.id) === "AWAITING_PAYMENT" ? pass("ใบอยู่ขั้นเดิม (ตามลูกค้าไม่ใช่การเดินขั้น)") : fail(`ขั้นเปลี่ยนเป็น ${st(c.id)}`);
      const rowC = await lbl(`แถวรอจ่าย ${c.code}`).first().innerText();
      rowC.includes("วันนี้ · ลูกค้าว่าจะโอนวันศุกร์") && !rowC.includes("ยังไม่เคยตาม") && (await lbl(`ลูกค้าว่ายังไง ${c.code}`).count()) === 0
        ? pass("แถวขึ้น \"วันนี้ · ลูกค้าว่าจะโอนวันศุกร์\" · ช่องพับ") : fail(`แถวหลังตาม: ${rowC}`);
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

    // ── กดแถวเปิดใบงาน ──
    await lbl(`แถวรอจ่าย ${a.code}`).first().getByText(a.code, { exact: true }).click();
    await page.waitForTimeout(3500);
    (await hash(page)) === `#/wo/${a.code}` ? pass("กดแถวแล้วเปิดใบงาน") : fail(`กดแถว: ${await hash(page)}`);
    await page.goBack();
    await page.waitForTimeout(2500);
    (await hash(page)) === "#/awaiting-payment" ? pass("ปิดใบงาน (ย้อนกลับ) กลับมาแท็บเดิม") : fail(`ย้อนกลับ: ${await hash(page)}`);

    // ── F5 ──
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(4500);
    (await page.locator('[role="tab"][aria-selected="true"]').locator("visible=true").first().getAttribute("aria-label").catch(() => "")).startsWith("รอลูกค้าจ่ายเงิน")
      ? pass("F5 ที่ #/awaiting-payment อยู่แท็บเดิม") : fail("F5 แล้วไม่ได้แท็บรอเงิน");

    // ── กล่องงาน: แถบบรรทัดเดียว ──
    await page.locator('[aria-label="กล่องงานของฉัน"]').locator("visible=true").first().click().catch(() => {});
    await page.waitForTimeout(4000);
    if ((await hash(page)) !== "#/inbox") {
      await page.goto(`${APP}/#/inbox`);
      await page.waitForTimeout(4500);
    }
    L = await api();
    const barTitle = [`รอลูกค้าจ่ายเงิน ${L.payTab.total}`, L.payTab.over ? `เกิน ${L.payTab.alertDays} วัน ${L.payTab.over}` : "", L.payTab.never ? `ยังไม่เคยตาม ${L.payTab.never}` : ""].filter(Boolean).join(" · ");
    const bar = lbl(`หัวข้อ ${barTitle}`).first();
    if (!(await bar.count())) fail(`กล่องงานไม่มีแถบ "${barTitle}"`);
    else {
      const t = await bar.innerText();
      !t.includes(a.code) && !t.includes(b.code) && (await bar.locator('[aria-expanded]').count()) === 0 && (await page.locator('[aria-label^="ขยายหัวข้อ รอลูกค้าจ่ายเงิน"], [aria-label^="ย่อหัวข้อ รอลูกค้าจ่ายเงิน"]').count()) === 0
        ? pass(`กล่องงาน: แถบบรรทัดเดียว "${barTitle}" ไม่มีแถวรายใบ ไม่มีปุ่มย่อ/ขยาย`) : fail(`แถบ: ${t}`);
      const inList = await page.locator('[data-testid="howto-orders.row"]').locator("visible=true").evaluateAll((ns, code) => ns.some((n) => n.innerText.includes(code)), a.code);
      inList ? pass(`ใบรอเงิน (${a.code}) ยังอยู่ในรายการกล่องงานข้างล่างตามปกติ`) : fail("ใบรอเงินหายจากรายการกล่องงาน");
      await page.screenshot({ path: path.join(DIR, "payment-tab-3-inbox.png") });
      await lbl("ดูในแท็บ รอลูกค้าจ่ายเงิน").first().click();
      await page.waitForTimeout(3500);
      const selChip = (await chipLabels()).find((x) => x[1] === "true");
      (await hash(page)) === "#/awaiting-payment" && selChip && selChip[0].startsWith("ชิปรอจ่าย ทั้งหมด")
        ? pass("ปุ่ม \"ดูในแท็บ รอลูกค้าจ่ายเงิน\" → แท็บนี้ ชิปทั้งหมด") : fail(`ไปแท็บ: ${await hash(page)} ${JSON.stringify(selChip)}`);
    }
    // ชิปต้องรีบดูในกล่องงาน → แท็บนี้ที่ชิปเกิน 3 วัน
    await page.locator('[role="tab"]').locator("visible=true").filter({ hasText: "กล่องงานของฉัน" }).first().click();
    await page.waitForTimeout(4000);
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
    const card = mp.locator(`[aria-label="แถวรอจ่าย ${a.code}"]`).locator("visible=true").first();
    if (!(await card.count())) fail("มือถือ: ไม่มีการ์ดใบรอเงิน");
    else {
      const box = await card.boundingBox();
      box && box.width <= 390 && box.width > 300 ? pass(`มือถือ: แถวเป็นการ์ดกว้าง ${Math.round(box.width)} px`) : fail(`การ์ด: ${JSON.stringify(box)}`);
      await mp.locator(`[aria-label="ตามลูกค้าแล้ว ${a.code}"]`).locator("visible=true").first().click();
      await mp.waitForTimeout(700);
      const inp = await mp.locator(`[aria-label="ลูกค้าว่ายังไง ${a.code}"]`).locator("visible=true").first().boundingBox();
      inp && inp.y > 0 && inp.y < 844 ? pass("มือถือ: ช่อง \"ลูกค้าว่ายังไง\" กางในการ์ดอยู่ในจอ") : fail(`ช่องมือถือ: ${JSON.stringify(inp)}`);
      await mp.locator(`[aria-label="ยกเลิกการตาม ${a.code}"]`).locator("visible=true").first().click();
    }
    (await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)) ? pass("มือถือ: ไม่ล้นจอแนวนอน") : fail("มือถือ: ล้นจอแนวนอน");
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
