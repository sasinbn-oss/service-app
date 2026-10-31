// ทดสอบ: เคลมก้อน 1 + 3 + 4 — ช่างไม่หลงหลังถูกตีกลับ (ทั้งใบ · ทีละชิ้น · ชี้ช่อง) ผ่านหน้าจอจริง (จอมือถือ 420×860 · ช่างของชุดนี้เอง)
//   1) งานของฉัน: ใบรอตรวจเคลมรอบแรกขึ้น "ส่งเคลม 2 ชิ้น · รอ Admin Spare Part ตรวจ" + แถบสถานะ "… → รอ Admin Spare Part ตรวจ · 0 วัน"
//   2) Admin Spare Part ตีกลับ (สองชิ้น) → การ์ดแดง "เคลมถูกตีกลับ" บอกเหตุผลทุกชิ้น "ต้องแก้ 2 ชิ้น" + แถบ "… ตีกลับ … → รอช่างแก้"
//      ปุ่มใหญ่ "แก้เคลม" (ไม่มีปุ่มปิดงาน) → เปิดฟอร์มพร้อมแถบเหตุผลปักบนสุด (ทุกชิ้น + ชื่อคนตรวจ)
//   3) ส่งซ้ำโดยไม่แก้อะไร → เซิร์ฟเวอร์ไม่รับ ข้อความขึ้นแถบแดงบนสุด ฟอร์มยังเปิด · ฐานข้อมูลไม่เปลี่ยน ·
//      เปิดฟอร์มแล้วยังไม่ได้แก้อะไร = ไม่มีร่างในเครื่อง (closeDraft ไม่เขียนตอนเปิด)
//   4) ไฟล์เคลมส่งทันทีที่เลือก: ช่อง "กำลังส่ง x%" (ไม่มีหน้าโหลดเต็มจอ) → "✓ แนบแล้ว" · ไฟล์อยู่ในฐานข้อมูลก่อนกดส่ง ·
//      เลือกใหม่แทน = ไฟล์ที่เพิ่งส่งถูกลบ (ไม่ค้างนับเพดาน)
//   5) "ค่าเดิมถูกแล้ว" อธิบายไม่ครบ 3 ตัว → ปุ่มล่าง "ยังขาด 1 อย่าง — พาไป" กดแล้วไม่ส่ง (ไม่มีคำขอ /close) กรอบแดงกระพริบ
//   6) โหลดหน้าใหม่กลางทาง → การ์ดขึ้น "กรอกค้างไว้ — ยังขาด 1 อย่าง ข้อมูลยังอยู่ครบ" · เปิดฟอร์มใหม่ข้อความยังอยู่ ·
//      วิดีโอที่เลือกใหม่ยังเป็นไฟล์ล่าสุดของชิ้นนั้น (ฐานข้อมูล)
//   7) ส่งถึงเซิร์ฟเวอร์แต่คำตอบหาย → "ส่งไม่สำเร็จ — เน็ตหลุด" · กดซ้ำ = ส่งสำเร็จ ไม่มีแถวซ้ำ (ฐานข้อมูล) ร่างถูกล้าง
//      ประวัติ CLAIM_SUBMITTED มีคำอธิบายทั้งใน note และ meta.keep (flag ALL) · แถวใหม่สองชิ้นเวลาส่งเดียวกัน
//   8) งานของฉัน: "ส่งเคลมใหม่ (รอบ 2) · รอ Admin Spare Part ตรวจ" + "ส่งใหม่ …" ไม่มีบรรทัดกรอกค้างไว้
//   ── ตัดสินทีละชิ้น (เคลมก้อน 3) ──
//   9) Admin Spare Part ให้ชิ้นแรกผ่าน ชิ้นสองตีกลับ → การ์ดแดงบอกเฉพาะชิ้นสอง "ต้องแก้ 1 ชิ้น"
//  10) ฟอร์มแก้เคลม: แถบเหตุผลเฉพาะชิ้นสอง · อะไหล่เติมจากที่ใช้จริง (สายพาน 2 ตามที่ใช้ ไม่ใช่ 1 ตามที่เบิก) · "✓ {ชิ้นแรก} ผ่านแล้ว ล็อกไว้"
//      ไม่มีช่องเคลมของชิ้นนั้น · กดเอาออกไม่ได้ (บอกเหตุผล) · ข้อมูลเครื่องอ่านอย่างเดียว "ล็อกไว้พร้อม …"
//      ส่งใหม่ → เฉพาะชิ้นสองได้แถวใหม่ ชิ้นแรกยังอยู่ในอะไหล่ที่ใช้ (ฐานข้อมูล)
//  11) ปิดเคลมชิ้นสอง → ใบจบ: หน้าใบงานไม่มี error ชิปเทา "ปิดเคลม ไม่ส่งผู้ขาย" · งานของฉัน "✓ อนุมัติเคลมแล้ว · ปิดงาน"
//      + "อนุมัติ 1 ชิ้น: …" + "ปิดเคลม ไม่ส่งผู้ขาย: … (หมดประกัน)"
//   ── ตีกลับแบบชี้ช่อง (เคลมก้อน 4) · ใบที่สอง เครื่อง W2: ชิ้นแรก "รหัสอะไหล่ตัวที่เสีย" (ไม่พิมพ์เหตุผล) · ชิ้นสอง "วิดีโอการตรวจเช็ค"
//      + เหตุผล · ของเครื่อง "รุ่น" (ทั้งใบ) ──
//  12) การ์ดแดง: "ทั้งใบ (ข้อมูลเครื่อง) — รุ่น ต้องแก้" ขึ้นก่อนครั้งเดียว · ชิ้นที่ไม่พิมพ์เหตุผลขึ้นชื่อช่อง (ไม่ใช่ข้อความที่ระบบเขียนแทน) ·
//      "ต้องแก้ 2 ชิ้น · 3 ช่อง" · "ต้องกลับไปถ่ายที่หน้าเครื่อง"
//  13) "แก้เคลม" → ฟอร์ม "แก้เคลม {ใบ}": แถบเหตุผล · "ต้องแก้ (3)" เฉพาะช่องที่ถูกชี้ (ไฟล์ "ต้องแนบใหม่" + ไฟล์เดิม) ·
//      "▸ ส่วนที่ไม่ต้องแก้ (พับไว้ แก้ได้ถ้าจำเป็น)" ฟอร์มเต็มไม่อยู่บนจอ · ปุ่มล่าง "ยังไม่ได้แก้: รุ่น และอีก 2 ช่อง — พาไป"
//  14) กดปุ่มล่างตอนยังไม่ได้แก้ → แถบเหลือง "ยังส่งไม่ได้ — ช่องที่ถูกชี้ยังเหมือนเดิม 3 ช่อง: …" ไม่ส่งคำขอ (ฐานข้อมูลไม่เปลี่ยน)
//  15) แก้รหัส · "ค่าเดิมถูกแล้ว" ช่องรุ่น + อธิบาย · แนบวิดีโอใหม่ → ทุกช่อง ✓ ปุ่ม "ส่งเคลมใหม่" → รอตรวจ · รหัสใหม่ในแถวใหม่ ·
//      คำอธิบายช่องรุ่นอยู่ใน meta.keep (ไม่ผูกชิ้น) · วิดีโอใหม่แนบหลังเวลาตีกลับ (ฐานข้อมูล)
//  16) ตีกลับทั้งใบด้วย "วิดีโอ Error" (ไฟล์ของเครื่อง) → ฟอร์มแก้เคลมเลือกไฟล์ครั้งเดียว → ทุกชิ้นที่ส่งเคลมได้วิดีโอ Error ใหม่
//      หลังเวลาตีกลับ (ฐานข้อมูล ทีละชิ้น — เซิร์ฟเวอร์รับไฟล์ใหม่ของชิ้นไหนก็ได้ แนบให้ชิ้นเดียวก็ส่งผ่าน ต้องดูที่แถวไฟล์)
//      → "ส่งเคลมใหม่" → รอตรวจ
// วันนัด 12 วันข้างหน้าตอนปล่อยงาน (G10) แล้วย้ายเป็นวันนี้ด้วย SQL หลังปล่อยงาน ให้การ์ดอยู่แท็บ "วันนี้"
// ยืนยันผลที่ฐานข้อมูลทุกข้อที่เปลี่ยนข้อมูล · ต้องมี DATABASE_URL · รีสตาร์ท Expo ก่อนรัน (เว็บไม่เฝ้าไฟล์)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { visitDay, fxPart } = require("./fixture");
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const PHOTO = path.join(DIR, "..", "site-photo.png");
const CLIP = path.join(DIR, "..", "site-clip.mp4");
const API = "http://localhost:4000/api";
// ภาพตัดบรรทัดรุ่นที่ใช้ได้จริง (PNG 1×1) — เหมือนของที่ช่างส่ง
const CROP = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const REASON = "วิดีโอการตรวจเช็คไม่เห็นมิเตอร์ ถ่ายใหม่";

// ส่งคำสั่งทาง stdin ไม่ใช่ -c — รหัสผ่านที่แฮชแล้วมี $ ซึ่ง shell จะกินไปเงียบ ๆ
const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const call = async (token, method, url, body) => {
  const res = await fetch(API + url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({}));
};
const login = async (code) =>
  (await (await fetch(API + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeCode: code, password: "test1234" }),
  })).json()).token;
const waitFor = async (fn, ms = 10000) => {
  for (let t = 0; t < ms; t += 250) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return fn();
};

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const suf = String(Date.now()).slice(-5);
  const bc = `DZCX${suf}`;
  const team = "กระบี่";
  const oldRegion = sql(`select coalesce(region,'') from "User" where "employeeCode"='S001'`);
  const ids = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const A = await login("A001");
  const W = 420;
  const H = 860;

  try {
    // ── เตรียม: สาขาแฟรนไชส์ในประกัน เครื่อง Huebsch · ช่างกับ Admin Spare Part ของชุดนี้เอง ──
    sql(`update "User" set region='ใต้' where "employeeCode"='S001'`);
    const S = await login("S001");
    const hash = sql(`select "passwordHash" from "User" where "employeeCode"='T001'`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword") values ('ZCXP${suf}','คุณวันดี ทดสอบ','PARTS_ADMIN','${hash}',false)`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword",team) values ('ZCXT${suf}','ช่างสมชาย ทดสอบแก้เคลม','EMPLOYEE','${hash}',false,'${team}')`);
    const PA = await login(`ZCXP${suf}`);
    const T = await login(`ZCXT${suf}`);
    const tid = Number(sql(`select id from "User" where "employeeCode"='ZCXT${suf}'`));
    // มีพิกัด — การ์ดในงานของฉันขึ้นปุ่ม "นำทาง" เฉพาะสาขาที่มีพิกัด
    sql(`insert into "Branch"(name,code,region,zone,ownership,"openedAt",latitude,longitude) values ('สาขาทดสอบแก้เคลม','${bc}','ใต้','${team}','FRANCHISE',now()-interval '12 months',8.0863,98.9063)`);
    const bid = sql(`select id from "Branch" where code='${bc}'`);
    sql(`insert into "Machine"("branchId",code,type,brand,"updatedAt") values (${bid},'W1','WASHER','HB - Huebsch',now())`);

    const wo = await call(A, "POST", "/work-orders", {
      branchCode: bc, jobType: "CM", priority: "NORMAL", contactName: "คุณสมหญิง", contactPhone: "081-234-5678",
      machines: [{ code: "W1", model: "Huebsch", symptom: "ประตูล็อกไม่ลง" }],
    });
    const id = wo.orders ? wo.orders[0].id : wo.id;
    if (!id) throw new Error(`เปิดใบงานไม่สำเร็จ: ${JSON.stringify(wo).slice(0, 200)}`);
    ids.push(id);
    const sp1 = fxPart(id, "BOARD");
    const sp2 = fxPart(id, "BELT");
    const code1 = sql(`select "partCode" from "SparePart" where id=${sp1}`);
    const code2 = sql(`select "partCode" from "SparePart" where id=${sp2}`);
    const name1 = sql(`select name from "SparePart" where id=${sp1}`);
    const name2 = sql(`select name from "SparePart" where id=${sp2}`);
    const both = [sp1, sp2];
    await call(S, "POST", `/work-orders/${id}/parts`, { needsParts: true, parts: both.map((s) => ({ sparePartId: s, quantity: 1 })) });
    await call(A, "POST", `/work-orders/${id}/parts-sourcing`, { results: both.map((s) => ({ sparePartId: s, inStock: true, warehouse: "คลังลาดพร้าว 94" })) });
    await call(S, "POST", `/work-orders/${id}/assign`, { team, scheduledAt: visitDay(12) });
    await call(A, "POST", `/work-orders/${id}/parts-check`, {
      results: both.map((s) => ({ sparePartId: s, inStock: true, warehouse: "คลังลาดพร้าว 94", requisitionNo: `RQ-CX${suf}` })),
    });
    await call(A, "POST", `/work-orders/${id}/confirm-appointment`, {});
    await call(S, "POST", `/work-orders/${id}/dispatch`, {});
    if (sql(`select status from "WorkOrder" where id=${id}`) !== "IN_PROGRESS") throw new Error("เตรียมใบไม่ถึงขั้นเข้างาน");
    // G10: ปล่อยงานด้วยวันข้างหน้าแล้ว ย้ายวันนัดเป็นวันนี้ด้วย SQL — การ์ดอยู่แท็บ "วันนี้" ของงานของฉัน
    sql(`update "WorkOrder" set "scheduledAt"=(now() at time zone 'Asia/Bangkok')::date where id=${id}`);
    const code = sql(`select code from "WorkOrder" where id=${id}`);
    const upload = async (role, file, type, sparePartId) => {
      const form = new FormData();
      form.append("file", new Blob([fs.readFileSync(file)], { type }), path.basename(file));
      form.append("role", role);
      if (sparePartId) form.append("sparePartId", String(sparePartId));
      return call(T, "POST", `/work-orders/${id}/attachments`, form);
    };
    await call(T, "POST", `/work-orders/${id}/arrive`, {});
    for (const role of ["BEFORE", "AFTER", "NAMEPLATE", "REQUISITION"]) await upload(role, PHOTO, "image/png");
    for (const s of both) {
      for (const role of ["CLAIM_PART", "CLAIM_SYMPTOM"]) await upload(role, PHOTO, "image/png", s);
      for (const role of ["CLAIM_ERROR_VIDEO", "CLAIM_CHECK_VIDEO"]) await upload(role, CLIP, "video/mp4", s);
    }
    const ts = (await call(T, "GET", `/work-orders/${id}`)).claimTroubleshooting ?? [];
    const closed = await call(T, "POST", `/work-orders/${id}/close`, {
      // ใช้สายพาน 2 เส้น (เบิกไว้ 1) — อะไหล่ที่ใช้จริงต่างจากรายการเบิก ฟอร์มแก้เคลมต้องเติมจากที่ใช้จริง ไม่ใช่รายการเบิก
      result: "FIXED", note: "เปลี่ยนบอร์ดกับสายพาน ทดสอบแล้วปกติ", workerIds: [tid], parts: both.map((s) => ({ sparePartId: s, quantity: s === sp2 ? 2 : 1 })),
      claims: both.map((s) => ({ sparePartId: s, brokenPartCode: `OLD-${s}`, symptom: "ประตูล็อกไม่ลง ขึ้น Error dL", checkNote: "วัดไฟเข้าบอร์ด 220V ปกติ", troubleshooting: ts })),
      claimNameplate: {
        fields: [
          { key: "model", label: "รุ่น", value: "HL055LWHPRXG6W0000", source: "SCAN", crop: CROP },
          { key: "serial", label: "Serial", value: "2402600330", source: "HAND" },
        ],
        verified: true,
      },
      claimCheck: { errorCode: "E dL / E dL1 / E dL2", checked: ["Solenoid ไม่ฝืด"] },
    });
    if (sql(`select status from "WorkOrder" where id=${id}`) !== "CLAIM_REVIEW") throw new Error(`ปิดพร้อมเคลมไม่ผ่าน: ${JSON.stringify(closed).slice(0, 200)}`);
    pass(`เตรียม ${code}: ช่างปิดพร้อมเคลม 2 ชิ้น (${code1} · ${code2}) รอตรวจเคลม (ฐานข้อมูล)`);

    async function signIn(user) {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      page.on("pageerror", (e) => errors.push(`${user}: ${e}`));
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(user);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await page.getByText("เข้าสู่ระบบ", { exact: true }).click();
      await page.waitForTimeout(3500);
      return page;
    }
    const vis = (page, t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const byLabel = (page, l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    const cardOf = (page) => page.locator(`[aria-label="งาน ${code}"]`).locator("visible=true").first();
    const cardText = async (page) => (await cardOf(page).innerText().catch(() => "ไม่พบการ์ด")).replace(/\s+/g, " ");
    const inView = (box) => !!box && box.y >= 0 && box.y + box.height <= H;
    const attachments = (role, s) =>
      sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id} and role='${role}' and "sparePartId"=${s}`);

    // ── 1) การ์ดรอตรวจเคลมรอบแรก ──
    let page = await signIn(`ZCXT${suf}`);
    await cardOf(page).waitFor({ timeout: 15000 }).catch(() => {});
    let txt = await cardText(page);
    txt.includes("รอตรวจเคลม") && txt.includes(`${code} · ส่งเคลม 2 ชิ้น · รอ Admin Spare Part ตรวจ`) &&
      txt.includes("ส่งเคลม ") && /รอ Admin Spare Part ตรวจ · 0 วัน/.test(txt) &&
      txt.includes("ยังไม่นับว่าปิดงาน จนกว่าจะอนุมัติ — อาจถูกตีกลับมาให้แก้")
      ? pass("งานของฉัน: ใบรอตรวจเคลมรอบแรก \"ส่งเคลม 2 ชิ้น · รอ Admin Spare Part ตรวจ\" + แถบสถานะ \"… → รอ Admin Spare Part ตรวจ · 0 วัน\"")
      : fail(`การ์ดรอตรวจเคลม: ${txt.slice(0, 300)}`);

    // ── 2) ตีกลับ → การ์ดแดง ──
    const rj = await call(PA, "POST", `/work-orders/${id}/claim-review`, { approve: false, reason: REASON });
    if (sql(`select status from "WorkOrder" where id=${id}`) !== "IN_PROGRESS") throw new Error(`ตีกลับไม่สำเร็จ: ${JSON.stringify(rj).slice(0, 200)}`);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await cardOf(page).waitFor({ timeout: 15000 }).catch(() => {});
    txt = await cardText(page);
    // แถบสถานะอ่านจากกล่องของมันเอง — ชิป "เคลมถูกตีกลับ" ตามด้วยเวลาก็มีคำว่า "ตีกลับ " อยู่แล้ว ตรวจทั้งการ์ดจะผ่านเสมอ
    const card = cardOf(page);
    // ชื่ออะไหล่มีวงเล็บได้ (บอร์ดควบคุม (Huebsch)) — แบ่งช่วงด้วยลูกศร ไม่ใช่วงเล็บ
    const strip = (await card.locator('[aria-label="สถานะเคลม"]').first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    txt.includes("เคลมถูกตีกลับ") && txt.includes(`${name1} — ${REASON}`) && txt.includes(`${name2} — ${REASON}`) &&
      txt.includes("Admin Spare Part: “") && txt.includes("ต้องแก้ 2 ชิ้น") &&
      /^ส่งเคลม [^→]+→ ตีกลับ [^→]*\d{1,2}:\d{2} \([^→]*คุณวันดี ทดสอบ\) → รอช่างแก้$/.test(strip)
      ? pass(`การ์ดแดง "เคลมถูกตีกลับ": เหตุผลทุกชิ้น · ต้องแก้ 2 ชิ้น · แถบสถานะ "${strip}"`)
      : fail(`การ์ดถูกตีกลับ: ${txt.slice(0, 400)} · แถบ "${strip}"`);
    (await card.locator('[aria-label="ปิดงาน"]').count()) === 0 && (await card.getByText("แก้เคลม", { exact: true }).count()) === 1 &&
      (await card.getByText("โทร", { exact: true }).count()) === 1 && (await card.getByText("นำทาง", { exact: true }).count()) === 1
      ? pass("การ์ดแดงมีปุ่มใหญ่ \"แก้เคลม\" ปุ่มเดียว (ไม่มีปุ่มปิดงาน) + โทร · นำทาง · รายละเอียด")
      : fail("ปุ่มบนการ์ดแดงไม่ตรง");
    // ขอบแดง 2 px — ไม่อ่านสีจากโค้ด อ่านจากที่วาดจริง
    const border = await card.evaluate((n) => getComputedStyle(n).borderTopWidth);
    border === "2px" ? pass("การ์ดแดงขอบ 2 px") : fail(`ขอบการ์ดแดง ${border}`);
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(DIR, "claim-fix-1-card.png") });

    // ── เปิดฟอร์มแก้เคลม: แถบเหตุผลปักบนสุด ──
    await card.getByText("แก้เคลม", { exact: true }).click();
    await page.waitForTimeout(3000);
    const banner = byLabel(page, "เหตุผลที่ Admin Spare Part ตีกลับ").first();
    const bannerText = (await banner.innerText().catch(() => "")).replace(/\s+/g, " ");
    bannerText.includes("Admin Spare Part ตีกลับใบเคลม — แก้แล้วส่งใหม่") && bannerText.includes("คุณวันดี ทดสอบ") &&
      bannerText.includes(`${name1}: “${REASON}”`) && bannerText.includes(`${name2}: “${REASON}”`) && inView(await banner.boundingBox())
      ? pass("กด \"แก้เคลม\" เปิดฟอร์ม: แถบเหตุผลปักบนสุด บอกคนตรวจ + เหตุผลทุกชิ้น")
      : fail(`แถบเหตุผลในฟอร์ม: ${bannerText.slice(0, 300)}`);
    // แถบต้องปักอยู่ ไม่เลื่อนหายตามฟอร์ม
    await byLabel(page, "อะไหล่ไม่ครบ เปิดใบงานรออะไหล่ต่อ").last().scrollIntoViewIfNeeded();
    inView(await banner.boundingBox()) ? pass("เลื่อนฟอร์มลงล่างสุดแล้วแถบเหตุผลยังอยู่ในจอ") : fail("แถบเหตุผลเลื่อนหายไปกับฟอร์ม");
    await page.screenshot({ path: path.join(DIR, "claim-fix-2-form.png") });

    // ── 3) ส่งซ้ำโดยไม่แก้อะไร ──
    const submit = vis(page, "ยืนยันปิดงาน").last();
    (await submit.count()) > 0 ? pass("ข้อมูลรอบก่อน (สรุป · คนที่ไป · อะไหล่ · ข้อความเคลม · หลักฐาน) มาครบ ปุ่มล่างเป็น \"ยืนยันปิดงาน\"") : fail("ฟอร์มแก้เคลมไม่ครบตั้งแต่เปิด");
    await submit.click();
    await vis(page, "ส่งไม่สำเร็จ").waitFor({ timeout: 20000 }).catch(() => {});
    const errBox = page.locator('[role="alert"]').filter({ hasText: "ส่งไม่สำเร็จ" }).locator("visible=true").first();
    const errText = (await errBox.innerText().catch(() => "")).replace(/\s+/g, " ");
    errText.includes("ยังไม่ได้แก้อะไรจากรอบที่ถูกตีกลับ") && inView(await errBox.boundingBox()) && (await vis(page, "ยืนยันปิดงาน").count()) > 0
      ? pass("ส่งซ้ำโดยไม่แก้: เซิร์ฟเวอร์ไม่รับ ข้อความขึ้นแถบแดงบนสุด ฟอร์มยังเปิดอยู่")
      : fail(`ส่งซ้ำโดยไม่แก้: ${errText.slice(0, 200)}`);
    sql(`select status||'|'||(select count(*) from "PartClaim" where "workOrderId"=${id}) from "WorkOrder" where id=${id}`) === "IN_PROGRESS|2"
      ? pass("ส่งซ้ำโดยไม่แก้: ฐานข้อมูลไม่เปลี่ยน (ยังรอช่าง · ใบเคลม 2 แถวเดิม)")
      : fail(`หลังส่งซ้ำโดยไม่แก้: ${sql(`select status from "WorkOrder" where id=${id}`)}`);
    await page.screenshot({ path: path.join(DIR, "claim-fix-3-unchanged.png") });

    // เปิดฟอร์มแล้วกดส่งโดยไม่ได้แก้อะไร = ยังไม่มีร่าง (คู่มือสอนใช้งานเปิดฟอร์มให้ดู การ์ดต้องไม่ขึ้น "กรอกค้างไว้")
    // ตรวจก่อนเลือกไฟล์ — เลือกไฟล์นับเป็นการแก้แล้ว
    await page.waitForTimeout(800);
    (await page.evaluate((k) => localStorage.getItem(k), `draft:close:${id}`)) === null
      ? pass("เปิดฟอร์มแก้เคลมแล้วยังไม่ได้แก้อะไร: ไม่มีร่างในเครื่อง (การ์ดไม่ขึ้น \"กรอกค้างไว้\")")
      : fail("เปิดฟอร์มเฉย ๆ แล้วมีร่างถูกเขียน");

    // ── 4) ไฟล์เคลมส่งทันทีที่เลือก ──
    // รอ/ตรวจบนจอเฉพาะในช่องนี้ช่องเดียว — ขั้นป้ายรุ่นของฟอร์มขึ้น "✓ แนบแล้ว" ค้างตั้งแต่เปิด (แนบป้ายไว้ตอนเตรียม)
    // ถ้าหาทั้งหน้า การรอจบทันทีแล้วอ่านฐานข้อมูลแข่งกับการส่งไฟล์: พังทั้งที่แอปถูก หรือผ่านทั้งที่ช่องค้าง "กำลังส่ง"
    const slot1 = page.locator(`[aria-label="วางวิดีโอการตรวจเช็ค ${code1}"]`).locator("visible=true").last();
    const maxVideo1 = () =>
      Number(sql(`select coalesce(max(id),0) from "WorkOrderAttachment" where "workOrderId"=${id} and role='CLAIM_CHECK_VIDEO' and "sparePartId"=${sp1}`));
    const before1 = Number(attachments("CLAIM_CHECK_VIDEO", sp1));
    const oldMax = maxVideo1();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 300, downloadThroughput: -1, uploadThroughput: 1024 });
    const pick = async (l, file) => {
      const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), byLabel(page, l).last().click()]);
      await chooser.setFiles(file);
    };
    await pick(`แนบวิดีโอการตรวจเช็ค ${code1}`, CLIP);
    const sending = slot1.getByText(/^กำลังส่ง \d+%$/);
    await sending.first().waitFor({ timeout: 15000 }).catch(() => {});
    const sawProgress = (await sending.count()) > 0;
    const overlay = await page.getByRole("progressbar").locator("visible=true").count();
    sawProgress && overlay === 0
      ? pass(`เลือกวิดีโอแล้วส่งทันที: ช่องขึ้น "${await sending.first().innerText()}" ไม่มีหน้าโหลดเต็มจอ`)
      : fail(`ระหว่างส่งไฟล์: เห็นกำลังส่ง=${sawProgress} · หน้าโหลดเต็มจอ=${overlay}`);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const slotDone = slot1.getByText("✓ แนบแล้ว", { exact: true });
    await slotDone.waitFor({ timeout: 30000 }).catch(() => {});
    // ช่องขึ้น ✓ หลังเซิร์ฟเวอร์ตอบแถวที่สร้างแล้ว — รอฐานข้อมูลอีกชั้นก่อนอ่าน id (ไม่อ่านแข่งกับการบันทึก)
    await waitFor(() => Number(attachments("CLAIM_CHECK_VIDEO", sp1)) === before1 + 1, 15000);
    const firstNew = maxVideo1();
    (await slotDone.count()) > 0 && firstNew > oldMax && Number(attachments("CLAIM_CHECK_VIDEO", sp1)) === before1 + 1 &&
      sql(`select status from "WorkOrder" where id=${id}`) === "IN_PROGRESS"
      ? pass("ส่งเสร็จช่องนั้นขึ้น \"✓ แนบแล้ว\" · ไฟล์ใหม่อยู่ในฐานข้อมูลแล้วทั้งที่ยังไม่ได้กดส่ง")
      : fail(`หลังเลือกวิดีโอ: ช่อง ✓=${await slotDone.count()} · ไฟล์ ${attachments("CLAIM_CHECK_VIDEO", sp1)} (เดิม ${before1}) · id ใหม่ ${firstNew} (เดิมสูงสุด ${oldMax})`);
    // เลือกใหม่แทน — ไฟล์ที่เพิ่งส่งในฟอร์มนี้ต้องถูกลบ ไม่ค้างนับเพดาน (firstNew > oldMax แล้ว จึงไม่ใช่ไฟล์ของรอบที่ถูกตีกลับ)
    await pick(`แนบวิดีโอการตรวจเช็ค ${code1}`, CLIP);
    await waitFor(
      () =>
        Number(attachments("CLAIM_CHECK_VIDEO", sp1)) === before1 + 1 &&
        maxVideo1() > firstNew &&
        sql(`select count(*) from "WorkOrderAttachment" where id=${firstNew}`) === "0",
      15000
    );
    const secondNew = maxVideo1();
    firstNew > oldMax && secondNew > firstNew &&
      sql(`select count(*) from "WorkOrderAttachment" where id=${firstNew}`) === "0" && Number(attachments("CLAIM_CHECK_VIDEO", sp1)) === before1 + 1
      ? pass("เลือกวิดีโอใหม่แทน: ไฟล์ที่เพิ่งส่งถูกลบ เหลือไฟล์ใหม่ไฟล์เดียว + ไฟล์ของรอบที่ถูกตีกลับ (ฐานข้อมูล)")
      : fail(`เลือกใหม่แทน: ไฟล์เดิม ${firstNew} ยังอยู่=${sql(`select count(*) from "WorkOrderAttachment" where id=${firstNew}`)} · ใหม่ ${secondNew} · รวม ${attachments("CLAIM_CHECK_VIDEO", sp1)}`);
    await page.screenshot({ path: path.join(DIR, "claim-fix-4-uploaded.png") });

    // ── 5) ค่าเดิมถูกแล้ว อธิบายไม่ครบ → พาไป ──
    await byLabel(page, `ค่าเดิมถูกแล้ว ${code2}`).last().click();
    await page.waitForTimeout(500);
    await byLabel(page, `ค่าเดิมถูกแล้ว — อธิบายให้ผู้ตรวจ ${code2}`).last().fill("ค่");
    await page.waitForTimeout(800);
    const go = vis(page, "ยังขาด 1 อย่าง — พาไป").last();
    const closeCalls = [];
    page.on("request", (r) => { if (/\/close$/.test(r.url()) && r.method() === "POST") closeCalls.push(r.url()); });
    (await go.count()) > 0 && (await vis(page, `ยังขาด: เคลม ${name2}: คำอธิบาย “ค่าเดิมถูกแล้ว”`, false).count()) > 0
      ? pass(`อธิบาย "ค่าเดิมถูกแล้ว" ไม่ครบ 3 ตัว: ปุ่มล่าง "ยังขาด 1 อย่าง — พาไป" · กล่องยังขาดบอก "เคลม ${name2}: …"`)
      : fail("ปุ่มล่าง/กล่องยังขาดไม่บอกคำอธิบายที่ยังไม่ครบ");
    await byLabel(page, "อะไหล่ไม่ครบ เปิดใบงานรออะไหล่ต่อ").last().scrollIntoViewIfNeeded();
    await go.click();
    await page.waitForTimeout(400);
    const flashSeen = await page.locator('[aria-label="ช่องที่ยังขาด"]').count();
    const keepBox = byLabel(page, `ค่าเดิมถูกแล้ว — อธิบายให้ผู้ตรวจ ${code2}`).last();
    let keepInView = false;
    for (let i = 0; i < 30 && !(keepInView = inView(await keepBox.boundingBox())); i++) await page.waitForTimeout(100);
    await page.waitForTimeout(600);
    closeCalls.length === 0 && flashSeen > 0 && keepInView && sql(`select status from "WorkOrder" where id=${id}`) === "IN_PROGRESS"
      ? pass("กด \"พาไป\": เลื่อนไปชิ้นที่ยังขาดในจอ กรอบแดงกระพริบ ไม่ส่งคำขอปิดงาน (ฐานข้อมูลไม่เปลี่ยน)")
      : fail(`กดพาไป: คำขอปิด=${closeCalls.length} · กรอบ=${flashSeen} · อยู่ในจอ=${keepInView}`);
    await page.screenshot({ path: path.join(DIR, "claim-fix-5-goto.png") });

    // ── 6) โหลดหน้าใหม่กลางทาง → ร่างยังอยู่ ──
    await page.waitForTimeout(800);
    const draftRaw = await page.evaluate((k) => localStorage.getItem(k), `draft:close:${id}`);
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.waitForTimeout(3500);
    await cardOf(page).waitFor({ timeout: 15000 }).catch(() => {});
    txt = await cardText(page);
    !!draftRaw && txt.includes("กรอกค้างไว้ — ยังขาด 1 อย่าง ข้อมูลยังอยู่ครบ")
      ? pass("โหลดหน้าใหม่: การ์ดแดงขึ้น \"กรอกค้างไว้ — ยังขาด 1 อย่าง ข้อมูลยังอยู่ครบ\"")
      : fail(`ร่างหลังโหลดใหม่: ร่าง=${!!draftRaw} · การ์ด ${txt.slice(0, 300)}`);
    await cardOf(page).getByText("แก้เคลม", { exact: true }).click();
    await page.waitForTimeout(3000);
    const keepAgain = byLabel(page, `ค่าเดิมถูกแล้ว — อธิบายให้ผู้ตรวจ ${code2}`).last();
    // ข้อความ "แนบไว้แล้ว" เหมือนกันทั้งไฟล์รอบที่ถูกตีกลับและไฟล์ที่เพิ่งส่ง — ยืนยันที่ฐานข้อมูลว่าไฟล์ล่าสุดของชิ้นนี้คือไฟล์ที่เลือกใหม่
    (await keepAgain.inputValue().catch(() => "")) === "ค่" &&
      (await slot1.getByText("วิดีโอการตรวจเช็ค — แนบไว้แล้ว", { exact: true }).count()) > 0 &&
      maxVideo1() === secondNew && Number(attachments("CLAIM_CHECK_VIDEO", sp1)) === before1 + 1
      ? pass("เปิดฟอร์มใหม่: คำอธิบายที่พิมพ์ค้างยังอยู่ · วิดีโอที่เลือกใหม่ยังเป็นไฟล์ล่าสุดของชิ้นนั้น (ฐานข้อมูล) ช่องขึ้น \"แนบไว้แล้ว\" ไม่ต้องแนบซ้ำ")
      : fail(`ฟอร์มหลังโหลดใหม่: คำอธิบาย="${await keepAgain.inputValue().catch(() => "")}" · ไฟล์ล่าสุด ${maxVideo1()} (ควรเป็น ${secondNew})`);
    await keepAgain.fill("ค่าเดิมถูกแล้ว ตรงกับรูป");
    await page.waitForTimeout(800);

    // ── 7) ส่งถึงเซิร์ฟเวอร์แต่คำตอบหาย → กดซ้ำ = สำเร็จ ──
    await page.route(`**/api/work-orders/${id}/close`, async (route) => {
      await route.fetch();
      return route.abort("internetdisconnected");
    });
    await vis(page, "ยืนยันปิดงาน").last().click();
    await waitFor(() => sql(`select status from "WorkOrder" where id=${id}`) === "CLAIM_REVIEW", 15000);
    await vis(page, "ส่งไม่สำเร็จ — เน็ตหลุด").waitFor({ timeout: 20000 }).catch(() => {});
    sql(`select status from "WorkOrder" where id=${id}`) === "CLAIM_REVIEW" && (await vis(page, "ส่งไม่สำเร็จ — เน็ตหลุด").count()) > 0
      ? pass("คำสั่งส่งถึงเซิร์ฟเวอร์ (ฐานข้อมูล: รอตรวจเคลม) แต่คำตอบหาย หน้าจอขึ้น \"ส่งไม่สำเร็จ — เน็ตหลุด\"")
      : fail(`ส่งแล้วคำตอบหาย: ${sql(`select status from "WorkOrder" where id=${id}`)}`);
    await page.unroute(`**/api/work-orders/${id}/close`);
    await vis(page, "ยืนยันปิดงาน").last().click();
    await page.waitForTimeout(5000);
    const leftDraft = await page.evaluate((k) => localStorage.getItem(k), `draft:close:${id}`);
    (await vis(page, "ยืนยันปิดงาน").count()) === 0 && leftDraft === null &&
      (await vis(page, "ส่งไม่สำเร็จ — เน็ตหลุด").count()) === 0
      ? pass("กดซ้ำแล้วเซิร์ฟเวอร์บอกว่าส่งไปแล้ว: นับเป็นส่งสำเร็จ ฟอร์มปิด ร่างถูกล้าง")
      : fail(`กดซ้ำหลังคำตอบหาย: ร่างยังอยู่=${leftDraft !== null}`);
    const rows = sql(`select count(*)||'|'||count(*) filter (where status='PENDING')||'|'||count(distinct "createdAt") filter (where status='PENDING') from "PartClaim" where "workOrderId"=${id}`);
    rows === "4|2|1"
      ? pass("ใบเคลมรอบสอง 2 แถว ไม่มีแถวซ้ำ (รวม 4 แถว) และสองชิ้นเวลาส่งเดียวกัน (ฐานข้อมูล)")
      : fail(`ใบเคลมหลังส่งใหม่ (รวม|รอตรวจ|เวลาส่งไม่ซ้ำ): ${rows}`);
    const logs = sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${id} and action='CLAIM_SUBMITTED'`);
    const last = sql(`select coalesce(note,'')||'|'||coalesce(meta::text,'') from "WorkOrderLog" where "workOrderId"=${id} and action='CLAIM_SUBMITTED' order by id desc limit 1`);
    const meta = JSON.parse(last.slice(last.indexOf("|") + 1) || "{}");
    const keep = meta.keep ?? [];
    logs === "2" && last.includes("ยืนยันค่าเดิม") && last.includes("ค่าเดิมถูกแล้ว ตรงกับรูป") &&
      keep.length === 1 && keep[0].flag === "ALL" && keep[0].sparePartId === sp2 && keep[0].note === "ค่าเดิมถูกแล้ว ตรงกับรูป"
      ? pass("ประวัติส่งเคลม 2 บรรทัด · บรรทัดล่าสุดมีคำอธิบาย \"ค่าเดิมถูกแล้ว\" ทั้งใน note และ meta.keep (flag ALL · ชิ้นที่อธิบาย)")
      : fail(`ประวัติส่งเคลม: ${logs} บรรทัด · ${last.slice(0, 300)}`);
    await page.screenshot({ path: path.join(DIR, "claim-fix-6-sent.png") });

    // ── 8) การ์ดรอตรวจรอบสอง ──
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.waitForTimeout(3500);
    await cardOf(page).waitFor({ timeout: 15000 }).catch(() => {});
    txt = await cardText(page);
    txt.includes("รอตรวจเคลม") && txt.includes(`${code} · ส่งเคลมใหม่ (รอบ 2) · รอ Admin Spare Part ตรวจ`) && txt.includes("ส่งใหม่ ") &&
      txt.includes("ตีกลับ ") && !txt.includes("กรอกค้างไว้") && !txt.includes("เคลมถูกตีกลับ")
      ? pass("งานของฉัน: \"ส่งเคลมใหม่ (รอบ 2) · รอ Admin Spare Part ตรวจ\" + เวลาส่งใหม่ + แถบสถานะมีรอบที่ตีกลับ · ไม่มีบรรทัดกรอกค้างไว้")
      : fail(`การ์ดรอตรวจรอบสอง: ${txt.slice(0, 400)}`);
    await cardOf(page).scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(DIR, "claim-fix-7-review2.png") });

    // ── 9) ตัดสินทีละชิ้น (เคลมก้อน 3): ชิ้นแรกผ่าน ชิ้นสองถูกตีกลับ → การ์ดแดงบอกเฉพาะชิ้นที่ต้องแก้ ──
    const REASON2 = "รูปอะไหล่เก่าไม่เห็นสติกเกอร์รหัส ถ่ายใหม่";
    const pend = sql(`select string_agg(id||':'||"sparePartId",',' order by id) from "PartClaim" where "workOrderId"=${id} and status='PENDING'`)
      .split(",").map((x) => x.split(":").map(Number));
    const rv = await call(PA, "POST", `/work-orders/${id}/claim-review`, {
      decisions: pend.map(([cid, s]) => (s === sp1 ? { claimId: cid, verdict: "APPROVE" } : { claimId: cid, verdict: "REJECT", reason: REASON2 })),
    });
    const claimsOf = (s) =>
      sql(`select string_agg(status,',' order by id) from "PartClaim" where "workOrderId"=${id} and "sparePartId"=${s}`);
    if (sql(`select status from "WorkOrder" where id=${id}`) !== "IN_PROGRESS" || claimsOf(sp1) !== "REJECTED,APPROVED")
      throw new Error(`ตัดสินทีละชิ้นไม่สำเร็จ: ${JSON.stringify(rv).slice(0, 200)}`);
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.waitForTimeout(3500);
    await cardOf(page).waitFor({ timeout: 15000 }).catch(() => {});
    txt = await cardText(page);
    txt.includes("เคลมถูกตีกลับ") && txt.includes(`${name2} — ${REASON2}`) && !txt.includes(`${name1} — `) && txt.includes("ต้องแก้ 1 ชิ้น")
      ? pass(`${name1} ผ่าน · ${name2} ถูกตีกลับ: การ์ดแดงบอกเฉพาะ "${name2} — ${REASON2}" · ต้องแก้ 1 ชิ้น`)
      : fail(`การ์ดแดงหลังตัดสินทีละชิ้น: ${txt.slice(0, 400)}`);

    // ── 10) ฟอร์มแก้เคลม: ชิ้นที่ผ่านแล้วพับ ล็อกไว้ เอาออกจากอะไหล่ที่ใช้ไม่ได้ · ข้อมูลเครื่องอ่านอย่างเดียว ──
    await cardOf(page).getByText("แก้เคลม", { exact: true }).click();
    await page.waitForTimeout(3000);
    const banner2 = (await byLabel(page, "เหตุผลที่ Admin Spare Part ตีกลับ").first().innerText().catch(() => "")).replace(/\s+/g, " ");
    banner2.includes(`${name2}: “${REASON2}”`) && !banner2.includes(`${name1}: “`)
      ? pass(`แถบเหตุผลในฟอร์มบอกเฉพาะชิ้นที่ถูกตีกลับ (${name2}) แม้แถวของชิ้นที่ผ่านจะเป็นแถวล่าสุดเหมือนกัน`)
      : fail(`แถบเหตุผลรอบ 3: ${banner2.slice(0, 300)}`);
    const lockedLine = (await byLabel(page, `ล็อกไว้ ${code1}`).last().innerText().catch(() => "")).trim();
    // ไอคอนกุญแจเป็นตัวอักษรของฟอนต์ไอคอนบนเว็บ (อยู่ใน innerText ด้วย) — ตรวจว่ามีข้อความ ไม่ใช่เท่ากันทั้งก้อน
    lockedLine.includes(`✓ ${name1} ผ่านแล้ว ล็อกไว้`) && (await byLabel(page, `รหัสอะไหล่ตัวที่เสีย ${code1}`).count()) === 0 &&
      (await byLabel(page, `รหัสอะไหล่ตัวที่เสีย ${code2}`).last().inputValue().catch(() => "")) === `OLD-${sp2}` &&
      (await byLabel(page, `จำนวน ${code1}`).count()) > 0 &&
      (await byLabel(page, `จำนวน ${code2}`).last().inputValue().catch(() => "")) === "2"
      ? pass(`ฟอร์มเติมจากอะไหล่ที่ใช้จริง (ทั้งสองชิ้น · ${code2} จำนวน 2 ตามที่ใช้ ไม่ใช่ 1 ตามที่เบิก) · "${lockedLine}" ไม่มีช่องเคลมของชิ้นนั้น · ${name2} เติมค่ารอบที่ถูกตีกลับ`)
      : fail(`ฟอร์มรอบ 3: ล็อก "${lockedLine}" · ช่องรหัส ${code1} ${await byLabel(page, `รหัสอะไหล่ตัวที่เสีย ${code1}`).count()} · อะไหล่ ${await byLabel(page, `จำนวน ${code1}`).count()} · จำนวน ${code2} "${await byLabel(page, `จำนวน ${code2}`).last().inputValue().catch(() => "")}"`);
    const machineLock = (await byLabel(page, "ข้อมูลเครื่องล็อกไว้").last().innerText().catch(() => "")).replace(/\s+/g, " ");
    machineLock.includes(`ข้อมูลเครื่อง — ล็อกไว้พร้อม ${name1} ที่ผ่านแล้ว`) && machineLock.includes("HL055LWHPRXG6W0000")
      ? pass("ข้อมูลเครื่องอ่านอย่างเดียว \"ล็อกไว้พร้อม … ที่ผ่านแล้ว\" พร้อมค่าของใบที่อนุมัติ (รุ่น HL055LWHPRXG6W0000)")
      : fail(`ข้อมูลเครื่องรอบ 3: "${machineLock.slice(0, 300)}"`);
    await byLabel(page, `เอา ${code1} ออก`).last().click();
    await page.waitForTimeout(500);
    (await vis(page, `${name1} อนุมัติเคลมไปแล้ว — เอาออกจากอะไหล่ที่ใช้ไม่ได้`).count()) > 0 && (await byLabel(page, `จำนวน ${code1}`).count()) > 0
      ? pass(`กดเอา ${code1} ออก: ไม่ถูกเอาออก ขึ้น "${name1} อนุมัติเคลมไปแล้ว — เอาออกจากอะไหล่ที่ใช้ไม่ได้"`)
      : fail("ชิ้นที่ผ่านแล้วถูกเอาออกจากอะไหล่ที่ใช้ได้");
    await page.screenshot({ path: path.join(DIR, "claim-fix-8-locked.png") });
    await byLabel(page, `ค่าเดิมถูกแล้ว ${code2}`).last().click();
    await page.waitForTimeout(400);
    await byLabel(page, `ค่าเดิมถูกแล้ว — อธิบายให้ผู้ตรวจ ${code2}`).last().fill("รูปเดิมเห็นสติกเกอร์รหัสที่มุมขวา");
    await page.waitForTimeout(600);
    await vis(page, "ยืนยันปิดงาน").last().click();
    await waitFor(() => sql(`select status from "WorkOrder" where id=${id}`) === "CLAIM_REVIEW", 15000);
    await page.waitForTimeout(1500);
    sql(`select status from "WorkOrder" where id=${id}`) === "CLAIM_REVIEW" && claimsOf(sp1) === "REJECTED,APPROVED" &&
      claimsOf(sp2) === "REJECTED,REJECTED,PENDING" &&
      sql(`select count(*) from "WorkOrderPart" where "workOrderId"=${id} and kind='USED' and "sparePartId"=${sp1}`) === "1" &&
      sql(`select quantity from "WorkOrderPart" where "workOrderId"=${id} and kind='USED' and "sparePartId"=${sp2}`) === "2"
      ? pass(`ส่งเคลมใหม่: เฉพาะ ${name2} ได้แถวใหม่ · ${name1} ยังอนุมัติ ไม่ส่งซ้ำ และยังอยู่ในอะไหล่ที่ใช้ · ${name2} ที่ใช้ยังเป็น 2 (ฐานข้อมูล)`)
      : fail(`ส่งรอบ 3: ${sql(`select status from "WorkOrder" where id=${id}`)} · ${name1} ${claimsOf(sp1)} · ${name2} ${claimsOf(sp2)}`);

    // ── 11) ปิดเคลมชิ้นสอง → ใบจบ: ใบที่มีแถวปิดเคลมเปิดได้ ไม่มี error · การ์ดงานของฉันบอกผลทีละชิ้น ──
    const last3 = sql(`select id from "PartClaim" where "workOrderId"=${id} and status='PENDING'`);
    await call(PA, "POST", `/work-orders/${id}/claim-review`, { decisions: [{ claimId: Number(last3), verdict: "DECLINE", reason: "หมดประกัน" }] });
    sql(`select status from "WorkOrder" where id=${id}`) === "DONE" && claimsOf(sp2) === "REJECTED,REJECTED,DECLINED"
      ? pass(`Admin Spare Part ปิดเคลม ${name2} (หมดประกัน): ใบจบ (ฐานข้อมูล)`)
      : fail(`ปิดเคลม: ${sql(`select status from "WorkOrder" where id=${id}`)} · ${claimsOf(sp2)}`);
    // หน้าใบงานยังเปิดอยู่ — เรียกการเช็คของใหม่แบบตอนกลับมาที่แท็บ ให้โหลดใบที่จบแล้ว
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(3000);
    const errsBefore = errors.length;
    (await vis(page, "ปิดเคลม ไม่ส่งผู้ขาย").count()) > 0 && (await vis(page, "อนุมัติแล้ว").count()) > 0 &&
      (await vis(page, /^ปิดเคลม ไม่ส่งผู้ขาย: หมดประกัน/).count()) > 0 && errors.length === errsBefore
      ? pass("ใบที่จบพร้อมแถวปิดเคลม: เปิดได้ไม่มี error · การ์ดเคลมชิปเทา \"ปิดเคลม ไม่ส่งผู้ขาย\" + เหตุผลแทนปุ่มใบเคลม · ชิ้นแรก \"อนุมัติแล้ว\"")
      : fail(`ใบที่มีแถวปิดเคลม: ชิป ${await vis(page, "ปิดเคลม ไม่ส่งผู้ขาย").count()} · อนุมัติแล้ว ${await vis(page, "อนุมัติแล้ว").count()} · error ${errors.slice(errsBefore).join(" | ").slice(0, 200)}`);
    await page.screenshot({ path: path.join(DIR, "claim-fix-9-declined.png"), fullPage: true });
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.waitForTimeout(3500);
    await cardOf(page).waitFor({ timeout: 15000 }).catch(() => {});
    txt = await cardText(page);
    txt.includes("✓ อนุมัติเคลมแล้ว · ปิดงาน") && txt.includes(`${code} · อนุมัติ 1 ชิ้น: ${name1}`) &&
      txt.includes(`ปิดเคลม ไม่ส่งผู้ขาย: ${name2} (หมดประกัน)`) && !txt.includes("รอตรวจเคลม")
      ? pass(`งานของฉัน: "✓ อนุมัติเคลมแล้ว · ปิดงาน" · "${code} · อนุมัติ 1 ชิ้น: ${name1}" · "ปิดเคลม ไม่ส่งผู้ขาย: ${name2} (หมดประกัน)"`)
      : fail(`การ์ดหลังตรวจจบ: ${txt.slice(0, 400)}`);
    await cardOf(page).scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(DIR, "claim-fix-10-approved-card.png") });
    await page.close();

    // ── ตีกลับแบบชี้ช่อง (เคลมก้อน 4) — ใบที่สอง เครื่อง W2 ──
    // ผู้ตรวจชี้: ชิ้นแรก "รหัสอะไหล่ตัวที่เสีย" (ไม่พิมพ์เหตุผล) · ชิ้นสอง "วิดีโอการตรวจเช็ค" + เหตุผล · ของเครื่อง "รุ่น" (ทั้งใบ)
    sql(`insert into "Machine"("branchId",code,type,brand,"updatedAt") values (${bid},'W2','WASHER','HB - Huebsch',now())`);
    const wo2 = await call(A, "POST", "/work-orders", {
      branchCode: bc, jobType: "CM", priority: "NORMAL", contactName: "คุณสมหญิง", contactPhone: "081-234-5678",
      machines: [{ code: "W2", model: "Huebsch", symptom: "ประตูล็อกไม่ลง" }],
    });
    const id2 = wo2.orders ? wo2.orders[0].id : wo2.id;
    if (!id2) throw new Error(`เปิดใบที่สองไม่สำเร็จ: ${JSON.stringify(wo2).slice(0, 200)}`);
    ids.push(id2);
    const q = [fxPart(id2, "BOARD"), fxPart(id2, "BELT")];
    const [qn1, qn2] = q.map((s) => sql(`select name from "SparePart" where id=${s}`));
    const [qc1, qc2] = q.map((s) => sql(`select "partCode" from "SparePart" where id=${s}`));
    await call(S, "POST", `/work-orders/${id2}/parts`, { needsParts: true, parts: q.map((s) => ({ sparePartId: s, quantity: 1 })) });
    await call(A, "POST", `/work-orders/${id2}/parts-sourcing`, { results: q.map((s) => ({ sparePartId: s, inStock: true, warehouse: "คลังลาดพร้าว 94" })) });
    await call(S, "POST", `/work-orders/${id2}/assign`, { team, scheduledAt: visitDay(12) });
    await call(A, "POST", `/work-orders/${id2}/parts-check`, {
      results: q.map((s) => ({ sparePartId: s, inStock: true, warehouse: "คลังลาดพร้าว 94", requisitionNo: `RQ-CY${suf}` })),
    });
    await call(A, "POST", `/work-orders/${id2}/confirm-appointment`, {});
    await call(S, "POST", `/work-orders/${id2}/dispatch`, {});
    if (sql(`select status from "WorkOrder" where id=${id2}`) !== "IN_PROGRESS") throw new Error("เตรียมใบที่สองไม่ถึงขั้นเข้างาน");
    // G10: ปล่อยงานด้วยวันข้างหน้าแล้วย้ายวันนัดเป็นวันนี้ด้วย SQL
    sql(`update "WorkOrder" set "scheduledAt"=(now() at time zone 'Asia/Bangkok')::date where id=${id2}`);
    const woCode2 = sql(`select code from "WorkOrder" where id=${id2}`);
    const up2 = async (role, file, type, sparePartId) => {
      const form = new FormData();
      form.append("file", new Blob([fs.readFileSync(file)], { type }), path.basename(file));
      form.append("role", role);
      if (sparePartId) form.append("sparePartId", String(sparePartId));
      return call(T, "POST", `/work-orders/${id2}/attachments`, form);
    };
    await call(T, "POST", `/work-orders/${id2}/arrive`, {});
    for (const role of ["BEFORE", "AFTER", "NAMEPLATE", "REQUISITION"]) await up2(role, PHOTO, "image/png");
    for (const s of q) {
      for (const role of ["CLAIM_PART", "CLAIM_SYMPTOM"]) await up2(role, PHOTO, "image/png", s);
      for (const role of ["CLAIM_ERROR_VIDEO", "CLAIM_CHECK_VIDEO"]) await up2(role, CLIP, "video/mp4", s);
    }
    const closed2 = await call(T, "POST", `/work-orders/${id2}/close`, {
      result: "FIXED", note: "เปลี่ยนบอร์ดกับสายพาน ทดสอบแล้วปกติ", workerIds: [tid], parts: q.map((s) => ({ sparePartId: s, quantity: 1 })),
      claims: q.map((s) => ({ sparePartId: s, brokenPartCode: `OLD-${s}`, symptom: "ประตูล็อกไม่ลง ขึ้น Error dL", checkNote: "วัดไฟเข้าบอร์ด 220V ปกติ", troubleshooting: ts })),
      claimNameplate: {
        fields: [
          { key: "model", label: "รุ่น", value: "HL055LWHPRXG6W0000", source: "SCAN", crop: CROP },
          { key: "serial", label: "Serial", value: "2402600330", source: "HAND" },
        ],
        verified: true,
      },
      claimCheck: { errorCode: "E dL / E dL1 / E dL2", checked: ["Solenoid ไม่ฝืด"] },
    });
    if (sql(`select status from "WorkOrder" where id=${id2}`) !== "CLAIM_REVIEW") throw new Error(`ใบที่สองปิดพร้อมเคลมไม่ผ่าน: ${JSON.stringify(closed2).slice(0, 200)}`);
    const REASON4 = "วิดีโอไม่เห็นมิเตอร์ ถ่ายใหม่";
    const pend2 = sql(`select string_agg(id||':'||"sparePartId",',' order by id) from "PartClaim" where "workOrderId"=${id2} and status='PENDING'`)
      .split(",").map((x) => x.split(":").map(Number));
    const rv2 = await call(PA, "POST", `/work-orders/${id2}/claim-review`, {
      decisions: pend2.map(([cid, s]) =>
        s === q[0]
          ? { claimId: cid, verdict: "REJECT", flags: ["BROKEN_CODE", "MODEL"] }
          : { claimId: cid, verdict: "REJECT", reason: REASON4, flags: ["CLAIM_CHECK_VIDEO", "MODEL"] }
      ),
    });
    const flags2 = (s) =>
      sql(`select array_to_string("reviewFlags",',') from "PartClaim" where "workOrderId"=${id2} and "sparePartId"=${s} order by id desc limit 1`);
    if (sql(`select status from "WorkOrder" where id=${id2}`) !== "IN_PROGRESS" || flags2(q[0]) !== "BROKEN_CODE,MODEL" || flags2(q[1]) !== "CLAIM_CHECK_VIDEO,MODEL")
      throw new Error(`ตีกลับแบบชี้ช่องไม่สำเร็จ: ${JSON.stringify(rv2).slice(0, 200)} · ${flags2(q[0])} · ${flags2(q[1])}`);
    pass(`เตรียม ${woCode2}: ตีกลับแบบชี้ช่อง — ${qn1} รหัสตัวเสีย · ${qn2} วิดีโอการตรวจเช็ค · ของเครื่อง รุ่น (ฐานข้อมูล)`);

    // ── 12) การ์ดแดง: ทั้งใบขึ้นก่อน · ชิ้นที่ไม่พิมพ์เหตุผลขึ้นชื่อช่อง · "ต้องแก้ 2 ชิ้น · 3 ช่อง" · ต้องกลับไปถ่ายที่หน้าเครื่อง ──
    page = await signIn(`ZCXT${suf}`);
    const card2 = () => page.locator(`[aria-label="งาน ${woCode2}"]`).locator("visible=true").first();
    await card2().waitFor({ timeout: 15000 }).catch(() => {});
    txt = (await card2().innerText().catch(() => "ไม่พบการ์ด")).replace(/\s+/g, " ");
    // ทั้งใบขึ้นก่อนเสมอ · ลำดับของชิ้นตามที่เซิร์ฟเวอร์ส่ง (ไม่ผูกกับลำดับ) · ชิ้นที่ไม่ได้พิมพ์เหตุผลขึ้นชื่อช่อง ไม่ขึ้นข้อความซ้ำ "ทั้งใบ"
    txt.includes("เคลมถูกตีกลับ") && txt.includes("Admin Spare Part: “ทั้งใบ (ข้อมูลเครื่อง) — รุ่น ต้องแก้ / ") &&
      txt.includes(`${qn1} — รหัสอะไหล่ตัวที่เสีย ต้องแก้`) && txt.includes(`${qn2} — ${REASON4}`) &&
      (txt.match(/ทั้งใบ \(ข้อมูลเครื่อง\)/g) ?? []).length === 1 && txt.includes("ต้องแก้ 2 ชิ้น · 3 ช่อง") &&
      txt.includes("ต้องกลับไปถ่ายที่หน้าเครื่อง") && !txt.includes("แก้จากมือถือได้")
      ? pass(`การ์ดแดงตีกลับแบบชี้ช่อง: ทั้งใบ (รุ่น) ขึ้นก่อนครั้งเดียว · "${qn1} — รหัสอะไหล่ตัวที่เสีย ต้องแก้" · "${qn2} — ${REASON4}" · "ต้องแก้ 2 ชิ้น · 3 ช่อง" · "ต้องกลับไปถ่ายที่หน้าเครื่อง"`)
      : fail(`การ์ดแดงชี้ช่อง: ${txt.slice(0, 500)}`);
    await card2().scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(DIR, "claim-fix-11-flag-card.png") });

    // ── 13) ฟอร์มแก้เคลม: เฉพาะช่องที่ถูกชี้ · ที่เหลือพับไว้ ──
    await card2().getByText("แก้เคลม", { exact: true }).click();
    await page.waitForTimeout(3000);
    // ทั้งใบ + สองชิ้น = สามบรรทัด แถบย่อไว้แค่สองบรรทัดแรก (RejectedBanner SHOWN) — กดดูครบก่อนอ่าน
    // ไม่งั้นบรรทัดที่สามไม่อยู่ในหน้า แล้วเทสต์ล้มทั้งที่แอปทำตามที่ออกแบบไว้
    await vis(page, "ดูเหตุผลครบ 3 ชิ้น ▾").first().click().catch(() => {});
    await page.waitForTimeout(400);
    const banner4 = (await byLabel(page, "เหตุผลที่ Admin Spare Part ตีกลับ").first().innerText().catch(() => "")).replace(/\s+/g, " ");
    const fixBox = byLabel(page, "ช่องที่ต้องแก้").first();
    const fixText = async () => (await fixBox.innerText().catch(() => "")).replace(/\s+/g, " ");
    let ft = await fixText();
    (await vis(page, `แก้เคลม ${woCode2}`).count()) > 0 &&
      banner4.includes("ทั้งใบ (ข้อมูลเครื่อง): “รุ่น ต้องแก้”") && banner4.includes(`${qn1}: “รหัสอะไหล่ตัวที่เสีย ต้องแก้”`) &&
      banner4.includes(`${qn2}: “${REASON4}”`) && (banner4.match(/ทั้งใบ \(ข้อมูลเครื่อง\)/g) ?? []).length === 1 &&
      ft.includes("ต้องแก้ (3)") && ft.includes("✗ ข้อมูลเครื่อง · รุ่น") && ft.includes(`✗ ${qn1} · รหัสอะไหล่ตัวที่เสีย`) &&
      ft.includes(`✗ ${qn2} · วิดีโอการตรวจเช็ค`) && ft.includes("ต้องแนบใหม่") && ft.includes("ไฟล์เดิม (ถูกตีกลับ) — ไฟล์ใหม่จะแทนไฟล์นี้") &&
      ft.includes("ยังไม่ได้แก้ — ต้องแนบใหม่")
      ? pass(`ฟอร์ม "แก้เคลม ${woCode2}": แถบเหตุผล (ทั้งใบก่อน · ชื่อช่องแทนเหตุผลที่ไม่ได้พิมพ์) · "ต้องแก้ (3)" เฉพาะช่องที่ถูกชี้ · ช่องไฟล์ "ต้องแนบใหม่" + ไฟล์เดิม`)
      : fail(`ฟอร์มแก้เคลม: แถบ "${banner4.slice(0, 300)}" · รายการ "${ft.slice(0, 400)}"`);
    // ส่วนที่ไม่ต้องแก้พับไว้ — ช่องในฟอร์มเต็มไม่อยู่บนจอ (รหัสตัวเสียของชิ้นแรกมีแค่ในรายการ "ต้องแก้")
    (await vis(page, "▸ ส่วนที่ไม่ต้องแก้ (พับไว้ แก้ได้ถ้าจำเป็น)").count()) === 1 &&
      (await byLabel(page, `อาการ/สาเหตุ ${qc1}`).count()) === 0 && (await byLabel(page, `รหัสอะไหล่ตัวที่เสีย ${qc1}`).count()) === 0 &&
      (await vis(page, "ยังไม่ได้แก้: รุ่น และอีก 2 ช่อง — พาไป").count()) === 1
      ? pass("ส่วนที่ไม่ต้องแก้พับไว้ (ฟอร์มเต็มไม่อยู่บนจอ) · ปุ่มล่าง \"ยังไม่ได้แก้: รุ่น และอีก 2 ช่อง — พาไป\"")
      : fail(`ส่วนที่พับ: ปุ่มพับ ${await vis(page, "▸ ส่วนที่ไม่ต้องแก้ (พับไว้ แก้ได้ถ้าจำเป็น)").count()} · ช่องอาการ ${await byLabel(page, `อาการ/สาเหตุ ${qc1}`).count()} · ปุ่มล่าง ${await vis(page, "ยังไม่ได้แก้: รุ่น และอีก 2 ช่อง — พาไป").count()}`);
    await page.screenshot({ path: path.join(DIR, "claim-fix-12-flag-form.png") });

    // ── 14) กดส่งตอนช่องที่ถูกชี้ยังเหมือนเดิม → แถบเหลือง "ยังส่งไม่ได้ — …" ไม่ส่งคำขอ ──
    const closeCalls2 = [];
    page.on("request", (r) => { if (new RegExp(`/work-orders/${id2}/close$`).test(r.url()) && r.method() === "POST") closeCalls2.push(r.url()); });
    await vis(page, "ยังไม่ได้แก้: รุ่น และอีก 2 ช่อง — พาไป").first().click();
    await page.waitForTimeout(800);
    const BLOCKED = "ยังส่งไม่ได้ — ช่องที่ถูกชี้ยังเหมือนเดิม 3 ช่อง: รุ่น · รหัสอะไหล่ตัวที่เสีย · วิดีโอการตรวจเช็ค (แก้ หรือกด “ค่าเดิมถูกแล้ว” แล้วอธิบาย)";
    const blockedBox = page.locator('[role="alert"]').filter({ hasText: "ยังส่งไม่ได้" }).locator("visible=true").first();
    const blockedText = (await blockedBox.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    blockedText === BLOCKED && inView(await blockedBox.boundingBox()) && closeCalls2.length === 0 &&
      sql(`select status||'|'||(select count(*) from "PartClaim" where "workOrderId"=${id2}) from "WorkOrder" where id=${id2}`) === "IN_PROGRESS|2"
      ? pass(`กดส่งตอนยังไม่ได้แก้: แถบ "${BLOCKED.slice(0, 60)}…" ปักในจอ · ไม่ส่งคำขอปิดงาน (ฐานข้อมูลไม่เปลี่ยน)`)
      : fail(`แถบยังส่งไม่ได้: "${blockedText}" · คำขอ ${closeCalls2.length}`);
    await page.screenshot({ path: path.join(DIR, "claim-fix-13-blocked.png") });

    // ── 15) แก้ทีละช่อง: รหัสใหม่ (แก้จากมือถือ) · รุ่น "ค่าเดิมถูกแล้ว" + อธิบาย · วิดีโอใหม่ → "ส่งเคลมใหม่" ──
    await byLabel(page, `รหัสอะไหล่ตัวที่เสีย — แก้ค่า ${qc1}`).last().fill("NEW-CODE-1");
    await page.waitForTimeout(400);
    await byLabel(page, "ค่าเดิมถูกแล้ว ข้อมูลเครื่อง · รุ่น").last().click();
    await page.waitForTimeout(400);
    const MODEL_NOTE = "รุ่นตรงกับป้ายทุกตัว ดูจากรูปเต็ม";
    await byLabel(page, "ค่าเดิมถูกแล้ว — อธิบายให้ผู้ตรวจ ข้อมูลเครื่อง · รุ่น").last().fill(MODEL_NOTE);
    await page.waitForTimeout(400);
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15000 }),
      byLabel(page, `แนบวิดีโอการตรวจเช็ค ${qc2}`).last().click(),
    ]);
    await chooser.setFiles(CLIP);
    await vis(page, "✓ แนบใหม่แล้ว — แทนไฟล์เดิม").first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
    ft = await fixText();
    ft.includes(`✓ ${qn1} · รหัสอะไหล่ตัวที่เสีย`) && ft.includes(`✓ แก้แล้ว: OLD-${q[0]} → NEW-CODE-1`) &&
      ft.includes("✓ ข้อมูลเครื่อง · รุ่น") && ft.includes("✓ ส่งคำอธิบายแทนการแก้") &&
      ft.includes(`✓ ${qn2} · วิดีโอการตรวจเช็ค`) && ft.includes("✓ แนบใหม่แล้ว — แทนไฟล์เดิม") &&
      (await vis(page, "ส่งเคลมใหม่").count()) > 0 && (await vis(page, "ยังส่งไม่ได้", false).count()) === 0
      ? pass("แก้ครบ: \"✓ แก้แล้ว: OLD-… → NEW-CODE-1\" · \"✓ ส่งคำอธิบายแทนการแก้\" · \"✓ แนบใหม่แล้ว — แทนไฟล์เดิม\" · แถบเหลืองหาย ปุ่มล่าง \"ส่งเคลมใหม่\"")
      : fail(`หลังแก้ทีละช่อง: "${ft.slice(0, 500)}"`);
    await page.screenshot({ path: path.join(DIR, "claim-fix-14-fixed.png") });
    await vis(page, "ส่งเคลมใหม่").last().click();
    await waitFor(() => sql(`select status from "WorkOrder" where id=${id2}`) === "CLAIM_REVIEW", 20000);
    await page.waitForTimeout(1500);
    const rowsNow = sql(`select string_agg(status||':'||coalesce("brokenPartCode",''),',' order by id) from "PartClaim" where "workOrderId"=${id2} and "sparePartId"=${q[0]}`);
    const lastSub = sql(`select coalesce(meta->'keep','[]'::jsonb)::text from "WorkOrderLog" where "workOrderId"=${id2} and action='CLAIM_SUBMITTED' order by id desc limit 1`);
    const keep4 = JSON.parse(lastSub || "[]");
    const newVideo = sql(`select count(*) from "WorkOrderAttachment" a where a."workOrderId"=${id2} and a.role='CLAIM_CHECK_VIDEO' and a."sparePartId"=${q[1]}
                          and a."createdAt" > (select max("reviewedAt") from "PartClaim" where "workOrderId"=${id2})`);
    sql(`select status from "WorkOrder" where id=${id2}`) === "CLAIM_REVIEW" && rowsNow === `REJECTED:OLD-${q[0]},PENDING:NEW-CODE-1` &&
      keep4.length === 1 && keep4[0].sparePartId === null && keep4[0].flag === "MODEL" && keep4[0].note === MODEL_NOTE && Number(newVideo) >= 1 &&
      closeCalls2.length >= 1
      ? pass("ส่งเคลมใหม่: ใบไปรอตรวจ · รหัสตัวเสียใหม่ในแถวใหม่ · คำอธิบายช่องรุ่นอยู่ใน meta.keep (ไม่ผูกชิ้น) · วิดีโอใหม่แนบหลังเวลาตีกลับ (ฐานข้อมูล)")
      : fail(`ส่งเคลมใหม่: ${sql(`select status from "WorkOrder" where id=${id2}`)} · ${rowsNow} · keep ${lastSub.slice(0, 200)} · วิดีโอใหม่ ${newVideo}`);
    await page.close();

    // ── 16) ไฟล์ของเครื่อง (วิดีโอ Error) ถูกชี้ทั้งใบ — เลือกครั้งเดียว ต้องไปถึงทุกชิ้นที่ส่งเคลม ──
    // ก่อนก้อน 5 ใบเคลมแต่ละชิ้นเก็บหลักฐานของเครื่องแยกกัน ถ้าไฟล์ใหม่ไปแค่ชิ้นแรก ใบเคลมของอีกชิ้นยังพาวิดีโอที่ถูกตีกลับไปหาผู้ขาย
    // เซิร์ฟเวอร์นับไฟล์ใหม่ของชิ้นไหนก็ได้ว่าแก้แล้ว — ส่งผ่านไม่ได้พิสูจน์อะไร ต้องนับแถวไฟล์ทีละชิ้น
    const pend3 = sql(`select string_agg(id::text,',' order by id) from "PartClaim" where "workOrderId"=${id2} and status='PENDING'`).split(",").map(Number);
    await call(PA, "POST", `/work-orders/${id2}/claim-review`, {
      decisions: pend3.map((cid) => ({ claimId: cid, verdict: "REJECT", flags: ["CLAIM_ERROR_VIDEO"] })),
    });
    if (sql(`select status from "WorkOrder" where id=${id2}`) !== "IN_PROGRESS" || flags2(q[0]) !== "CLAIM_ERROR_VIDEO" || flags2(q[1]) !== "CLAIM_ERROR_VIDEO")
      throw new Error(`ตีกลับวิดีโอ Error ทั้งใบไม่สำเร็จ: ${flags2(q[0])} · ${flags2(q[1])}`);
    const errVideoAfter = (s) =>
      Number(sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id2} and role='CLAIM_ERROR_VIDEO' and "sparePartId"=${s}
                  and "createdAt" > (select max("reviewedAt") from "PartClaim" where "workOrderId"=${id2})`));
    page = await signIn(`ZCXT${suf}`);
    // จดคำขอแนบไฟล์ทุกครั้ง — ล้มแล้วต้องรู้ว่าแอปส่งกี่ครั้ง ตอบอะไร (ไม่ใช่เดาจากแถวในฐานข้อมูลอย่างเดียว)
    const upCalls = [];
    page.on("request", (r) => { if (/\/attachments$/.test(r.url()) && r.method() === "POST") upCalls.push("ส่ง"); });
    page.on("response", (r) => { if (/\/attachments$/.test(r.url()) && r.request().method() === "POST") upCalls.push(String(r.status())); });
    page.on("requestfailed", (r) => { if (/\/attachments$/.test(r.url())) upCalls.push(`พัง:${r.failure()?.errorText}`); });
    await card2().waitFor({ timeout: 15000 }).catch(() => {});
    await card2().getByText("แก้เคลม", { exact: true }).click();
    await page.waitForTimeout(3000);
    // หาใหม่จากหน้านี้ — fixBox ผูกกับหน้าที่ปิดไปแล้ว
    ft = (await byLabel(page, "ช่องที่ต้องแก้").first().innerText().catch(() => "")).replace(/\s+/g, " ");
    const listed = ft.includes("ต้องแก้ (1)") && ft.includes("✗ ข้อมูลเครื่อง · วิดีโอ Error");
    const [chooser2] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15000 }),
      byLabel(page, "แนบวิดีโอ Error ข้อมูลเครื่อง").last().click(),
    ]);
    await chooser2.setFiles(CLIP);
    await vis(page, "✓ แนบใหม่แล้ว — แทนไฟล์เดิม").first().waitFor({ timeout: 30000 }).catch(() => {});
    await waitFor(() => errVideoAfter(q[0]) >= 1 && errVideoAfter(q[1]) >= 1, 20000);
    await page.waitForTimeout(800);
    const perPart = `${errVideoAfter(q[0])}|${errVideoAfter(q[1])}`;
    await vis(page, "ส่งเคลมใหม่").last().click();
    await waitFor(() => sql(`select status from "WorkOrder" where id=${id2}`) === "CLAIM_REVIEW", 20000);
    listed && perPart === "1|1" && sql(`select status from "WorkOrder" where id=${id2}`) === "CLAIM_REVIEW" &&
      sql(`select count(*) from "PartClaim" where "workOrderId"=${id2} and status='PENDING'`) === "2"
      ? pass(`วิดีโอ Error ถูกชี้ทั้งใบ: "✗ ข้อมูลเครื่อง · วิดีโอ Error" เลือกไฟล์ครั้งเดียว → วิดีโอ Error ใหม่ ${qn1} 1 · ${qn2} 1 ไฟล์ หลังเวลาตีกลับ · ส่งเคลมใหม่รอตรวจ 2 ชิ้น (ฐานข้อมูล)`)
      : fail(`วิดีโอ Error ทั้งใบ: รายการ=${listed} "${ft.slice(0, 200)}" · ไฟล์ใหม่ต่อชิ้น ${perPart} · คำขอแนบไฟล์ ${upCalls.join(",")} · ใบ ${sql(`select status from "WorkOrder" where id=${id2}`)}`);
    await page.close();
  } catch (e) {
    fail(String(e));
  } finally {
    for (const i of ids) await call(A, "DELETE", `/work-orders/${i}`);
    sql(`delete from "Machine" where "branchId" in (select id from "Branch" where code='${bc}');
         delete from "Branch" where code='${bc}';
         delete from "User" where "employeeCode" in ('ZCXP${suf}','ZCXT${suf}');
         update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
    const left = sql(`select count(*) from "WorkOrder" where id in (${ids.length ? ids.join(",") : "0"})`) +
      sql(`select count(*) from "User" where "employeeCode" in ('ZCXP${suf}','ZCXT${suf}')`);
    left === "00" ? pass("ลบใบทดสอบ สาขา เครื่อง ผู้ใช้ที่สร้าง และคืนภาคของ S001 แล้ว (ฐานข้อมูล)") : fail(`ของทดสอบยังค้าง ${left}`);
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
