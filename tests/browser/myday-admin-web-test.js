// ทดสอบ: งานของฉันวันนี้ของแอดมิน แบบแยกหัวข้อ (เจ้าของงานเลือก 5 พ.ย. 69 · ตัวอย่าง myday — ตอบ "ทำตามที่แนะนำ")
//   · ใบทดสอบหนึ่งใบต่อหัวข้อ (สาขา C0006): นัดร้าน (ตรวจพรุ่งนี้) · เช็คอะไหล่ · ส่งใบเสนอราคา · รอลูกค้าจ่ายเงิน (ส่งใบเสนอราคาทาง API จริง)
//     · เบิกอะไหล่ · คอนเฟิร์มลูกค้า (นัดพรุ่งนี้) · คอนเฟิร์มลูกค้าที่วันนัดผ่านแล้ว (= เลยนัด → "ต้องทำก่อนวันนี้")
//     · ใบรอหัวหน้าภาคที่หัวหน้าภาคส่งให้ตรวจสอบ (= "ตอบหัวหน้าภาค") — ขั้นตั้งด้วย SQL ยกเว้นรอเงิน/คำขอตรวจสอบที่เดินทาง API
//   · จอคอม 1440: เปิดมาที่ภาพรวม · แถบ "ต้องทำก่อนวันนี้ n" = ใบเลยนัด + ขอนัดด่วนของ API · เมนูซ้ายเรียงตามลำดับงาน ชื่อหัวข้อ =
//     ป้ายขั้นของเซิร์ฟเวอร์ (options.stages[].action) · ผลรวมทุกหัวข้อ = "รอทำทั้งหมด" = กล่องงานของ API = /inbox-count
//     · ทุกหัวข้อเปิดได้ จำนวนแถว = ตัวเลขบนเมนู = ตัวเลขบนการ์ดภาพรวม · ใบทดสอบอยู่หัวข้อที่ถูกและอยู่หัวข้อเดียว (ค้นด้วยรหัส)
//     · ชิป "ตรวจพรุ่งนี้" กรองถูก (aria-selected) · ปุ่มน้ำเงิน "ส่งใบเสนอราคา" เปิดใบพร้อมฟอร์มของขั้น · รอเงิน "ลูกค้าจ่ายแล้ว · แนบบิล"
//       เปิดฟอร์มแนบบิล · "ตามลูกค้าแล้ว" ในแถว → ฐานข้อมูลมี PAYMENT_FOLLOWUP · ค้นทุกหัวข้อ แยกตามหัวข้อ "x จาก y"
//   · ใบงาน IT (เจ้าของงานแก้ 6 พ.ย. 69 — แยกหัวข้อในงานของแอดมิน): ใบ IT ขั้นส่งใบเสนอราคาอยู่หัวข้อ "งาน IT" หัวข้อเดียว
//     (ไม่อยู่หัวข้อส่งใบเสนอราคา) · หัวข้อ "งาน IT" อยู่หลังขั้นของสายงาน · ผลรวมทุกหัวข้อยังเท่า /inbox-count
//   · มือถือ 390: ภาพรวมเป็นรายการ → แตะหัวข้อ → รายการของหัวข้อ → "‹ ภาพรวม" กลับ · ช่องค้นหา "พบ x จาก y ใบ" · ไม่ล้นจอ
//   · หัวหน้าภาค · ช่าง · Admin Spare Part: หน้าเดิม (ไม่มีเมนูหัวข้อ/แถบต้องทำก่อนวันนี้)
// ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup, visitDay } = require("./fixture");

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
  const PA = `zzmd.pa${SUF}`;
  try {
    fx = await setup();
    const { sql, call, A } = fx;
    const tomorrow = visitDay(1);
    const yesterday = visitDay(-1);
    const at = (status, extra = "") => async () => {
      const wo = await fx.workOrder("C0006", null);
      sql(`update "WorkOrder" set status='${status}', "needsParts"=true${extra} where id=${wo.id}`);
      return wo;
    };
    const O = {};
    O.INS = await at("INSPECT_CONFIRM", `, "scheduledAt"='${tomorrow}T00:00:00Z'`)();
    O.SRC = await at("PARTS_SOURCING")();
    O.QUO = await at("AWAITING_QUOTE")();
    O.REQ = await at("PARTS_REQUESTED", `, "scheduledAt"='${visitDay(5)}T00:00:00Z'`)();
    O.CON = await at("AWAITING_CONFIRM", `, "scheduledAt"='${tomorrow}T00:00:00Z'`)();
    O.PAST = await at("AWAITING_CONFIRM", `, "scheduledAt"='${yesterday}T00:00:00Z'`)();
    // รอลูกค้าจ่ายเงิน — ส่งใบเสนอราคาทาง API จริง (ประวัติ QUOTED)
    O.PAY = await fx.workOrder("C0006", null);
    sql(`update "WorkOrder" set status='AWAITING_QUOTE', "workStatus"='QUOTING', "needsParts"=false where id=${O.PAY.id}`);
    {
      const fd = new FormData();
      fd.append("file", new Blob([PDF], { type: "application/pdf" }), `quotation-${O.PAY.code}.pdf`);
      fd.append("role", "QUOTE");
      await fetch(`http://localhost:4000/api/work-orders/${O.PAY.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${A}` }, body: fd });
      await call(A, "POST", `/work-orders/${O.PAY.id}/quote`, {});
    }
    // ตอบหัวหน้าภาค — ใบรอหัวหน้าภาคระบุอะไหล่ที่หัวหน้าภาคส่งให้แอดมินตรวจสอบ (ทาง API ของหัวหน้าภาค)
    O.REV = await fx.workOrder("C0006", null);
    const rv = await call(fx.supervisor(), "POST", `/work-orders/${O.REV.id}/admin-review`, { reason: "SYMPTOM", note: "อาการไม่ชัด ขอข้อมูลเพิ่มจากร้าน (ทดสอบหัวข้อ)" });
    // ใบงาน IT ขั้นของแอดมิน — ต้องอยู่หัวข้อ "งาน IT" ไม่ใช่หัวข้อส่งใบเสนอราคา
    O.IT = await at("AWAITING_QUOTE")();
    sql(`update "WorkOrder" set "jobType"='IT' where id=${O.IT.id}`);
    const states = sql(`select string_agg(code||'='||status, ' ' order by id) from "WorkOrder" where id in (${Object.values(O).map((o) => o.id).join(",")})`);
    sql(`select status from "WorkOrder" where id=${O.PAY.id}`) === "AWAITING_PAYMENT" && !rv.error
      ? pass(`เตรียมใบ: ${states}`) : fail(`เตรียมใบไม่ครบ: ${states} · คำขอตรวจสอบ ${JSON.stringify(rv).slice(0, 120)}`);

    const opt = await call(A, "GET", "/work-orders/options");
    const nameOf = (s) => opt.stages.find((x) => x.value === s).action;
    const WANT = {
      INS: nameOf("INSPECT_CONFIRM"), SRC: nameOf("PARTS_SOURCING"), QUO: nameOf("AWAITING_QUOTE"), PAY: nameOf("AWAITING_PAYMENT"),
      REQ: nameOf("PARTS_REQUESTED"), CON: nameOf("AWAITING_CONFIRM"), PAST: "ต้องทำก่อนวันนี้", REV: "ตอบหัวหน้าภาค",
      IT: "งาน IT",
    };
    const ORDER = ["ต้องทำก่อนวันนี้", "ตอบหัวหน้าภาค", WANT.INS, WANT.SRC, WANT.QUO, WANT.PAY, WANT.REQ, WANT.CON];
    const inbox = (await call(A, "GET", "/work-orders?status=INBOX")).rows;
    const inboxCount = (await call(A, "GET", "/work-orders/inbox-count")).inbox;
    const today = visitDay(0);
    const asks = inbox.filter((r) => r.urgentAsk && !r.isTest && ["NEW", "PARTS_CHECKED"].includes(r.status) && r.urgentAsk.day >= today).length;
    const past = inbox.filter((r) => r.overdue && !(r.urgentAsk && !r.isTest && ["NEW", "PARTS_CHECKED"].includes(r.status) && r.urgentAsk.day >= today)).length;

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const lbl = (l, p = page) => p.locator(`[aria-label="${l}"]`).locator("visible=true");
    const pre = (l, p = page) => p.locator(`[aria-label^="${l}"]`).locator("visible=true");
    const login = async (p, code) => {
      await p.goto(APP, { waitUntil: "networkidle", timeout: 180000 });
      await p.getByPlaceholder("รหัสพนักงาน").fill(code);
      await p.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await p.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").last().click();
      await p.waitForTimeout(3500);
    };
    await login(page, "A001");
    await page.goto(`${APP}/#/my-jobs`);
    await page.waitForTimeout(5000);

    // ── ภาพรวม ──
    const firstBar = lbl(`ต้องทำก่อนวันนี้ ${asks + past} ใบ`).first();
    (await firstBar.count()) && past >= 1
      ? pass(`เปิดมาที่ภาพรวม: แถบ "ต้องทำก่อนวันนี้ ${asks + past} ใบ" = ขอนัดด่วน ${asks} + เลยนัด ${past} ของ API`) : fail(`แถบต้องทำก่อน: ${await page.locator("body").innerText().then((t) => t.slice(0, 300))}`);
    (await firstBar.innerText()).includes(`ร้านขอนัดด่วน ${asks} ใบ`) && (await firstBar.innerText()).includes(`เลยวันนัดแล้ว ${past} ใบ`)
      ? pass("แถบบอกขอนัดด่วน / เลยวันนัด แยกจำนวน") : fail(`แถบ: ${await firstBar.innerText()}`);
    const nav = await pre("เมนูหัวข้อ ").evaluateAll((ns) => ns.map((n) => n.getAttribute("aria-label").replace(/^เมนูหัวข้อ /, "")));
    const navTopics = nav.slice(1).map((x) => x.replace(/ \d+$/, ""));
    const navN = Object.fromEntries(nav.map((x) => [x.replace(/ \d+$/, ""), Number(x.match(/ (\d+)$/)[1])]));
    // หลังขั้นของสายงาน: "งาน IT" (มีใบ IT อยู่ในกล่อง) แล้ว "อื่น ๆ" (ถ้ามี)
    JSON.stringify(navTopics.slice(0, 8)) === JSON.stringify(ORDER) && navTopics[8] === "งาน IT" && (navTopics.length === 9 || navTopics[9] === "อื่น ๆ")
      ? pass(`เมนูซ้ายเรียงตามลำดับงาน: ${navTopics.join(" → ")} (ชื่อจากป้ายขั้นของเซิร์ฟเวอร์)`) : fail(`เมนูซ้าย: ${navTopics.join(" | ")} ต้องเป็น ${ORDER.join(" | ")}`);
    const sum = navTopics.reduce((n, t) => n + navN[t], 0);
    const totalTile = Number((await page.getByText("รอทำทั้งหมด", { exact: true }).locator("visible=true").first().evaluate((n) => n.parentElement.innerText)).match(/\d+/)[0]);
    sum === inbox.length && sum === totalTile && sum === inboxCount && navN["ภาพรวม"] === sum
      ? pass(`ผลรวมทุกหัวข้อ ${sum} = รอทำทั้งหมด = กล่องงานของ API = /inbox-count (${inboxCount}) — ใบหนึ่งอยู่หัวข้อเดียว`) : fail(`รวมหัวข้อ ${sum} · ตัวเลขสรุป ${totalTile} · API ${inbox.length} · inbox-count ${inboxCount}`);
    navN["ต้องทำก่อนวันนี้"] === asks + past ? pass("เมนู \"ต้องทำก่อนวันนี้\" = แถบแดง (ตัวสร้างเดียวกับกล่องงาน)") : fail(`เมนูต้องทำก่อน ${navN["ต้องทำก่อนวันนี้"]}`);
    const cards = await pre("หัวข้อ ").evaluateAll((ns) => ns.map((n) => n.getAttribute("aria-label")));
    const cardOk = navTopics.filter((t) => t !== "ต้องทำก่อนวันนี้").every((t) => cards.includes(`หัวข้อ ${t} ${navN[t]} ใบ`));
    cardOk ? pass("การ์ดภาพรวมหัวข้อละใบ ตัวเลขเท่ากับเมนูซ้าย") : fail(`การ์ด: ${cards.join(" | ")}`);
    const payCard = await lbl(`หัวข้อ ${WANT.PAY} ${navN[WANT.PAY]} ใบ`).first().innerText();
    payCard.includes("ยังไม่เคยตาม") && payCard.includes("ขั้น 5") && payCard.includes("รอนานสุด")
      ? pass(`การ์ด "${WANT.PAY}": ขั้น 5 · ป้ายยังไม่เคยตาม · บรรทัดรอนานสุด`) : fail(`การ์ดรอเงิน: ${payCard}`);
    await page.screenshot({ path: path.join(DIR, "myday-admin-1-overview.png") });

    // ── ทุกหัวข้อเปิดได้ · จำนวนแถว = ตัวเลข · ใบทดสอบอยู่หัวข้อที่ถูก ──
    const seen = {};
    for (const t of navTopics) {
      await lbl(`เมนูหัวข้อ ${t} ${navN[t]}`).first().click();
      await page.waitForTimeout(900);
      const view = lbl(`รายการหัวข้อ ${t}`).first();
      const rows = (await view.count()) ? await view.locator('[aria-label^="แถว"]').evaluateAll((ns) => ns.filter((n) => n.getClientRects().length).map((n) => n.getAttribute("aria-label").replace(/^แถว(รอจ่าย)? /, ""))) : null;
      seen[t] = rows ?? [];
      const mine = Object.keys(O).filter((k) => WANT[k] === t).map((k) => O[k].code);
      const sel = await lbl(`เมนูหัวข้อ ${t} ${navN[t]}`).first().getAttribute("aria-selected");
      rows && rows.length === navN[t] && mine.every((c) => rows.includes(c)) && sel === "true"
        ? pass(`หัวข้อ "${t}": ${rows.length} แถว = ตัวเลขเมนู${mine.length ? ` · มี ${mine.join(", ")}` : ""} · เมนูติด`)
        : fail(`หัวข้อ "${t}": แถว ${rows ? rows.length : "ไม่เปิด"} ต้อง ${navN[t]} · ${mine.join(",")} · ${sel}`);
    }
    const itIn = Object.keys(seen).filter((t) => seen[t].includes(O.IT.code));
    JSON.stringify(itIn) === JSON.stringify(["งาน IT"])
      ? pass(`ใบ IT ${O.IT.code} อยู่หัวข้อ "งาน IT" หัวข้อเดียว (ไม่อยู่หัวข้อ "${WANT.QUO}")`) : fail(`ใบ IT อยู่หัวข้อ: ${itIn.join(", ")}`);
    // ชิปของหัวข้อนัดร้าน: ตรวจพรุ่งนี้
    await lbl(`เมนูหัวข้อ ${WANT.INS} ${navN[WANT.INS]}`).first().click();
    await page.waitForTimeout(800);
    const tmr = pre("ชิปหัวข้อ ตรวจพรุ่งนี้ ").first();
    const tmrN = Number(((await tmr.getAttribute("aria-label")) ?? "").match(/(\d+)$/)?.[1] ?? -1);
    await tmr.click();
    await page.waitForTimeout(700);
    const tmrRows = await lbl(`รายการหัวข้อ ${WANT.INS}`).first().locator('[aria-label^="แถว "]').evaluateAll((ns) => ns.filter((n) => n.getClientRects().length).map((n) => n.getAttribute("aria-label").replace(/^แถว /, "")));
    tmrN >= 1 && tmrRows.length === tmrN && tmrRows.includes(O.INS.code) && (await tmr.getAttribute("aria-selected")) === "true"
      ? pass(`ชิป "ตรวจพรุ่งนี้ ${tmrN}" กรองเหลือ ${tmrRows.length} แถว (มี ${O.INS.code}) · aria-selected`) : fail(`ชิปตรวจพรุ่งนี้: ${tmrN} · ${tmrRows.join(",")}`);

    // ── ปุ่มน้ำเงินเปิดใบพร้อมฟอร์มของขั้น ──
    await lbl(`เมนูหัวข้อ ${WANT.QUO} ${navN[WANT.QUO]}`).first().click();
    await page.waitForTimeout(800);
    await lbl(`ทำขั้น ส่งใบเสนอราคา ${O.QUO.code}`).first().click();
    await page.waitForTimeout(5000);
    const hash = () => page.evaluate(() => window.location.hash);
    (await hash()) === `#/wo/${O.QUO.code}` && (await page.getByText(`ส่งใบเสนอราคา · ${O.QUO.code}`, { exact: false }).locator("visible=true").count()) > 0
      ? pass(`ปุ่ม "ส่งใบเสนอราคา" เปิด ${O.QUO.code} พร้อมฟอร์มของขั้น (หัวฟอร์ม "ส่งใบเสนอราคา · ${O.QUO.code}")`) : fail(`ปุ่มขั้น: ${await hash()}`);
    await page.screenshot({ path: path.join(DIR, "myday-admin-2-stageform.png") });
    sql(`select status from "WorkOrder" where id=${O.QUO.id}`) === "AWAITING_QUOTE" ? pass("เปิดฟอร์มอย่างเดียว ใบยังอยู่ขั้นเดิม") : fail("ใบเปลี่ยนขั้นเอง");
    await page.goBack();
    await page.waitForTimeout(1500);
    if ((await hash()) !== "#/my-jobs") {
      await page.goto(`${APP}/#/my-jobs`);
      await page.waitForTimeout(4500);
    }
    // กลับมาแล้วยังอยู่หัวข้อเดิม (หน้าไม่ถูกสร้างใหม่) หรือภาพรวม — เปิดหัวข้อรอเงินต่อ
    await lbl(`เมนูหัวข้อ ${WANT.PAY} ${navN[WANT.PAY]}`).first().click();
    await page.waitForTimeout(900);
    const payRow = lbl(`แถวรอจ่าย ${O.PAY.code}`).first();
    const payText = await payRow.innerText();
    payText.includes("เริ่มรอวันนี้") && payText.includes("ยังไม่เคยตาม") && payText.includes("ลูกค้าจ่ายแล้ว · แนบบิล") && payText.includes("ตามลูกค้าแล้ว")
      ? pass("แถวรอเงิน: เริ่มรอวันนี้ · ยังไม่เคยตาม · ปุ่มตามลูกค้าแล้ว + ลูกค้าจ่ายแล้ว · แนบบิล (แถวตัวเดียวกับแท็บ)") : fail(`แถวรอเงิน: ${payText}`);
    await lbl(`ตามลูกค้าแล้ว ${O.PAY.code}`).first().click();
    await page.waitForTimeout(500);
    await lbl(`ลูกค้าว่ายังไง ${O.PAY.code}`).first().fill("ร้านขอดูใบเสนอราคาอีกรอบ");
    await lbl(`บันทึกการตามลูกค้า ${O.PAY.code}`).first().click();
    await page.waitForTimeout(3000);
    const fu = sql(`select count(*)||'|'||max(note) from "WorkOrderLog" where "workOrderId"=${O.PAY.id} and action='PAYMENT_FOLLOWUP'`);
    fu === "1|ร้านขอดูใบเสนอราคาอีกรอบ" && (await lbl(`แถวรอจ่าย ${O.PAY.code}`).first().innerText()).includes("วันนี้ · ร้านขอดูใบเสนอราคาอีกรอบ")
      ? pass("ตามลูกค้าแล้วในแถว (งานของฉันวันนี้) → ฐานข้อมูล PAYMENT_FOLLOWUP · แถวขึ้น \"วันนี้ · …\"") : fail(`ตามในงานของฉัน: ${fu}`);
    await lbl(`ลูกค้าจ่ายแล้ว · แนบบิล ${O.PAY.code}`).first().click();
    await page.waitForTimeout(5000);
    (await hash()) === `#/wo/${O.PAY.code}` && (await page.getByText(`แนบบิลรับเงิน · ${O.PAY.code}`, { exact: false }).locator("visible=true").count()) > 0
      ? pass("\"ลูกค้าจ่ายแล้ว · แนบบิล\" เปิดใบพร้อมฟอร์มแนบบิลรับเงิน") : fail(`แนบบิล: ${await hash()}`);
    await page.goto(`${APP}/#/my-jobs`);
    await page.waitForTimeout(5000);

    // ── ค้นทุกหัวข้อพร้อมกัน ──
    const box = lbl("ค้นหาในงานของฉัน").first();
    await box.fill(O.PAY.code);
    await page.waitForTimeout(900);
    const groups = await pre("ผลค้นหัวข้อ ").evaluateAll((ns) => ns.map((n) => n.getAttribute("aria-label").replace(/^ผลค้นหัวข้อ /, "")));
    JSON.stringify(groups) === JSON.stringify([WANT.PAY]) && (await page.locator("body").innerText()).includes(`1 ใบ ที่ตรงกับ “${O.PAY.code}” จากทั้งหมด ${inbox.length} ใบ`)
      ? pass(`ค้นรหัส ${O.PAY.code}: เจอหัวข้อเดียว (${WANT.PAY}) · แถบ "แสดง 1 ใบ … จากทั้งหมด ${inbox.length} ใบ"`) : fail(`ค้นรหัส: ${groups.join(",")}`);
    for (const k of Object.keys(O)) {
      await box.fill(O[k].code);
      await page.waitForTimeout(500);
      const g = await pre("ผลค้นหัวข้อ ").evaluateAll((ns) => ns.map((n) => n.getAttribute("aria-label").replace(/^ผลค้นหัวข้อ /, "")));
      if (g.length !== 1 || g[0] !== WANT[k]) fail(`ค้น ${O[k].code}: อยู่หัวข้อ ${g.join(",")} ต้อง ${WANT[k]}`);
    }
    pass("ใบทดสอบทุกใบอยู่หัวข้อที่ถูก และอยู่หัวข้อเดียว (ค้นด้วยรหัสทีละใบ)");
    await box.fill("C0006");
    await page.waitForTimeout(900);
    const hay = (r) => [r.code, r.branchCode, r.branchName, r.title, r.symptom, r.machineCode, r.assignedTeam].filter(Boolean).join(" ").toLowerCase();
    const wantFound = inbox.filter((r) => hay(r).includes("c0006")).length;
    const groups2 = await pre("ผลค้นหัวข้อ ").evaluateAll((ns) => ns.map((n) => n.innerText.split("\n").slice(0, 3).join(" ")));
    (await page.locator("body").innerText()).includes(`${wantFound} ใบ ที่ตรงกับ “C0006” จากทั้งหมด ${inbox.length} ใบ`) && groups2.length >= 6
      ? pass(`ค้น "C0006": ${wantFound} ใบ แยก ${groups2.length} หัวข้อ (x จาก y ต่อหัวข้อ)`) : fail(`ค้น C0006: ${groups2.join(" | ")}`);
    (await page.getByText(/^\d+ จาก \d+$/).locator("visible=true").count()) >= 6 ? pass("หัวผลค้นแต่ละหัวข้อบอก \"x จาก y\"") : fail("หัวผลค้นไม่มี x จาก y");
    await page.screenshot({ path: path.join(DIR, "myday-admin-3-search.png") });
    await lbl("ล้างคำค้นหา").first().click();
    await page.waitForTimeout(700);
    await ctx.close();

    // ── มือถือ ──
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const mp = await mctx.newPage();
    mp.on("pageerror", (e) => errors.push(String(e)));
    await login(mp, "A001");
    await mp.goto(`${APP}/#/my-jobs`);
    await mp.waitForTimeout(5000);
    const list = await pre("หัวข้อ ", mp).evaluateAll((ns) => ns.map((n) => n.getAttribute("aria-label")));
    (await lbl(`ต้องทำก่อนวันนี้ ${asks + past} ใบ`, mp).count()) && list.includes(`หัวข้อ ${WANT.SRC} ${navN[WANT.SRC]} ใบ`) && (await pre("เมนูหัวข้อ ", mp).count()) === 0
      ? pass("มือถือ: ภาพรวมเป็นรายการหัวข้อ (ไม่มีเมนูซ้าย) + แถบต้องทำก่อนวันนี้") : fail(`มือถือภาพรวม: ${list.join(" | ")}`);
    await mp.screenshot({ path: path.join(DIR, "myday-admin-4-phone-overview.png") });
    await lbl(`หัวข้อ ${WANT.SRC} ${navN[WANT.SRC]} ใบ`, mp).first().click();
    await mp.waitForTimeout(900);
    const mrows = await lbl(`รายการหัวข้อ ${WANT.SRC}`, mp).first().locator('[aria-label^="แถว "]').evaluateAll((ns) => ns.filter((n) => n.getClientRects().length).length).catch(() => -1);
    mrows === navN[WANT.SRC] ? pass(`มือถือ: แตะหัวข้อ → รายการ "${WANT.SRC}" ${mrows} ใบ`) : fail(`มือถือหัวข้อ: ${mrows}`);
    await mp.screenshot({ path: path.join(DIR, "myday-admin-5-phone-topic.png") });
    await lbl("กลับไปภาพรวม", mp).first().click();
    await mp.waitForTimeout(800);
    (await lbl(`ต้องทำก่อนวันนี้ ${asks + past} ใบ`, mp).count()) && (await pre("รายการหัวข้อ ", mp).count()) === 0
      ? pass("มือถือ: \"‹ ภาพรวม\" กลับภาพรวม") : fail("มือถือ: ย้อนกลับภาพรวมไม่ได้");
    await lbl("ค้นหาในงานของฉัน", mp).first().fill(O.CON.code);
    await mp.waitForTimeout(800);
    (await mp.getByText(`พบ 1 จาก ${inbox.length} ใบ`, { exact: true }).locator("visible=true").count()) && (await lbl(`ผลค้นหัวข้อ ${WANT.CON}`, mp).count())
      ? pass(`มือถือ: ค้นแล้ว "พบ 1 จาก ${inbox.length} ใบ" ในหัวข้อ ${WANT.CON}`) : fail("มือถือ: ค้นไม่ถูก");
    (await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)) ? pass("มือถือ: ไม่ล้นจอแนวนอน") : fail("มือถือ: ล้นจอแนวนอน");
    await mctx.close();

    // ── ตำแหน่งอื่นใช้หน้าเดิม ──
    const seen = sql(`select "howtoSeen"::text from "User" where "employeeCode"='A001'`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword","howtoSeen")
         select '${PA}','แอดมินอะไหล่ทดสอบงานของฉัน','PARTS_ADMIN',"passwordHash",false,'${seen.replace(/'/g, "''")}'::jsonb from "User" where "employeeCode"='A001'`);
    for (const [who, pill] of [["S001", "งานที่รอหัวหน้าภาคทำ"], ["T001", null], [PA, "งานที่รอ Admin Spare Part"]]) {
      const xc = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const xp = await xc.newPage();
      xp.on("pageerror", (e) => errors.push(`${who}: ${e}`));
      await login(xp, who);
      await xp.goto(`${APP}/#/my-jobs`);
      await xp.waitForTimeout(4500);
      const old = (await pre("เมนูหัวข้อ ", xp).count()) === 0 && (await pre("ต้องทำก่อนวันนี้", xp).count()) === 0;
      const pillOk = pill ? (await xp.getByText(pill, { exact: true }).locator("visible=true").count()) > 0 : (await xp.getByText(/งานที่รอ/).locator("visible=true").count()) === 0;
      old && pillOk ? pass(`${who}: หน้าเดิม (ไม่มีเมนูหัวข้อ/แถบต้องทำก่อนวันนี้)${pill ? ` · "${pill}"` : " · หน้างานของช่าง"}`) : fail(`${who}: หน้าแบบใหม่หรือป้ายผิด`);
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
