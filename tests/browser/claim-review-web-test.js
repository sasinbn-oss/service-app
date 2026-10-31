// ทดสอบ: เคลมก้อน 2–3 — Admin Spare Part เห็นทุกอย่างที่ต้องใช้ตัดสินบนจอเดียว และตัดสินทีละชิ้น ผ่านหน้าจอจริง
//   จอ 1280×656 (พื้นที่ใช้งานของจอ 1366×768 ตามตัวอย่างที่เจ้าของงานเลือก) · ใบเคลม 2 ชิ้น ถูกตีกลับมาแล้วหนึ่งรอบ ช่างส่งใหม่
//   1) เปิดใบแล้วเจอหน้าตรวจเคลมก่อนอย่างอื่น: หัว "{ใบ} · {สาขา} · W1 Huebsch" · "รอบ 2 · รอ {d} วัน" · ช่างที่ส่ง (ชื่อ + รหัส) ·
//      ในประกันถึง · เคลมซ้ำ (เครื่องใหม่ = ไม่พบ) · แถบสถานะ "… → รอ Admin Spare Part ตรวจ · {d} วัน" · เนื้อใบงานที่เหลือพับไว้
//      (ประวัติทั้งใบเลื่อนย้อนไป 1 วันด้วย psql ตอนเตรียม — d ต้องไม่ใช่ 0 · d คิดจากฐานข้อมูลตอนตรวจ ตามวันไทย)
//   2) แถบตัดสินอยู่ในจอทั้งแถบโดยไม่ต้องเลื่อน สูงไม่เกิน 56 (✓ ผ่าน · ✗ ตีกลับ · ปิดเคลม ไม่ส่งผู้ขาย · ปุ่มส่ง) · เลื่อนลงสุดก็ยังอยู่ที่เดิม
//   3) ข้อมูลเครื่องครั้งเดียว "ข้อมูลเครื่อง (ใช้ร่วมทุกชิ้น)" · ภาพตัดรุ่น · Error "E dL / E dL1 / E dL2 — ประตูล็อก/ปลดล็อก"
//   4) แท็บชิ้นเป็นชื่ออะไหล่ "{ชื่อ} · ● รอตัดสิน" · ทุกชิ้นบอก "Troubleshooting x/y · เช็คตาม Error a/b" และข้อที่ไม่ได้ทำ "(ไม่ได้ทำ)"
//      — ชิ้นที่สองเปลี่ยน fieldCheck.offered ด้วย psql (ข้อที่ฟอร์มเคยให้เห็น ≠ คู่มือวันนี้) หน้าตรวจต้องนับจาก offered ของแถว
//   5) วิดีโอเล่นในหน้า (<video>) พร้อมปุ่ม "เปิดไฟล์" · วิดีโอที่ขึ้นคือไฟล์ล่าสุดของชิ้นนั้น (ฐานข้อมูล)
//      — วิดีโอเคลมใช้ site-clip.webm (VP8): Chromium ของ Playwright ไม่มีตัวถอด H.264 คลิป mp4 เล่นไม่ได้ ผู้เล่นจะถูกแทนด้วยกล่อง
//      "เบราว์เซอร์นี้เล่นไฟล์นี้ไม่ได้" แล้วข้อนี้ตกทั้งที่แอปถูก
//   6) รอบสอง: ป้าย "ใหม่รอบนี้" · "แก้จากรอบก่อน: วิดีโอการตรวจเช็ค — ไฟล์ใหม่แทนไฟล์เดิม" · ชิ้นที่แก้อาการบอกค่าเดิม → ค่าใหม่ ·
//      รอบเก่าพับไว้ "รอบ 1 · ตีกลับ ▸" เปิดแล้วเห็นเหตุผล คนตรวจ และไฟล์เดิมที่เก็บเป็นประวัติ
//   7) "ดูรายละเอียดใบงาน ▸" เปิดเนื้อใบงานที่เหลือ + กล่องใบแจ้ง · "ซ่อนรายละเอียดใบงาน ▾" พับกลับ
//   8) แอดมินทั่วไปเปิดใบเดียวกัน: การ์ดเคลมแบบเดิม (หลักฐานรอบนี้ · แถบสถานะ · รอบเก่าพับไว้) ไม่มีแถบตัดสิน ·
//      ไม่มีบรรทัด ✗ "(ไม่ได้ทำ)" (เฉพาะคนตัดสินเคลม) แต่ยังเห็นข้อที่ทำ
//   9) Super Admin ดูในฐานะ Admin Spare Part: หน้าตรวจขึ้น แต่ไม่มีปุ่มตัดสิน — "ดูได้อย่างเดียว แก้ไขไม่ได้"
//  10) จอมือถือ 360×780: แถบตัดสินอยู่ในจอ ไม่มีเลื่อนซ้ายขวา · ปุ่มใบเคลมร่าง/แท็บชิ้นไม่ล้นขอบหน้าตรวจ (หน้าเลื่อนข้างไม่ได้ ล้นแล้วถูกตัดเงียบ ๆ)
//  ── ตัดสินทีละชิ้น (เคลมก้อน 3) ──
//  11) ยังไม่ตัดสิน ปุ่มส่ง "ตัดสินให้ครบทุกชิ้นก่อน" กดแล้วบอกชิ้นที่ยังไม่ได้ตัดสิน ไม่ส่งอะไร (ฐานข้อมูล)
//  12) ✓ ผ่านทั้งสองชิ้น → "อนุมัติเคลม · ปิดงาน" → กล่องยืนยัน "อนุมัติ 2 ชิ้น ใบงานจะปิด" + บรรทัดทีละชิ้น + ท้ายกล่อง
//      → "กลับไปดูอีกครั้ง" ไม่ส่งอะไร (ฐานข้อมูลยังรอตรวจ 2 แถว)
//  13) ชิ้นที่สอง ✗ ตีกลับ โดยไม่ใส่เหตุผล → "ตีกลับต้องบอกเหตุผล" ไม่ส่ง · ใส่เหตุผลแล้วร่างจำในเครื่อง (review:<id>)
//      → "ตีกลับให้ช่างแก้ (1 ชิ้น)" ส่งเลยไม่ถาม → ชิ้นแรกอนุมัติ ชิ้นสองตีกลับพร้อมเหตุผลของชิ้นนั้น ใบกลับไปรอช่าง (ฐานข้อมูล)
//      แถบสรุป "ตีกลับ {ใบ} ให้ช่างแก้แล้ว ({ชิ้นสอง}) — …" · ร่างถูกล้าง
//  14) ช่างส่งใหม่ (API) ส่งทั้งสองชิ้นมา — ชิ้นที่ผ่านแล้วไม่ได้แถวใหม่ และยังอยู่ในอะไหล่ที่ใช้ (ฐานข้อมูล)
//  15) เปิดอีกครั้ง: แท็บ "{ชิ้นแรก} · ✓ ผ่านแล้ว (รอบ 2)" + "{ชิ้นสอง} · ● รอตัดสิน" · "ล็อกไว้พร้อม {ชิ้นแรก} ที่ผ่านแล้ว" ·
//      แถบของชิ้นแรก "ผ่านแล้ว (รอบ 2) — ล็อกไว้ ไม่ต้องตรวจซ้ำ" (ไม่มีปุ่ม) · รอบเก่า "รอบ 1 · ตีกลับ · รอบ 2 · ตีกลับ ▸"
//  16) ชิ้นสอง "ปิดเคลม ไม่ส่งผู้ขาย" → กล่องเลือกเหตุผลใต้แท็บ · ยังไม่เลือก = "ปิดเคลม ไม่ส่งผู้ขาย ต้องเลือกเหตุผล" ·
//      "อื่น ๆ" + พิมพ์เหตุผล → ยืนยัน "อนุมัติ 1 ชิ้น ใบงานจะปิด" (นับชิ้นที่ผ่านไปแล้ว) → ปิดงาน ชิ้นสองปิดเคลมพร้อมเหตุผล
//      ประวัติ CLAIM_APPROVED "{ชิ้นสอง} ปิดเคลม ไม่ส่งผู้ขาย (อื่น ๆ: …)" (ฐานข้อมูล) · หน้าเลื่อนกลับขึ้นบน สรุปอยู่ในจอ
//      สรุป "✓ อนุมัติเคลมแล้ว · ปิดงาน" + แถบสถานะจบที่ "อนุมัติ" (ไม่ใช่ "ปิดงาน (ปิดเคลม…)") + "✓ {ชิ้นแรก} ({รหัส}) — อนุมัติ"
//      + "– {ชิ้นสอง} — ปิดเคลม ไม่ส่งผู้ขาย (…)" · การ์ดเคลมขึ้นชิปสีเทา
//  17) "ใบถัดไป →" เปิดใบรอตรวจเคลมใบอื่น (ใบที่สองที่เตรียมไว้หรือใบที่รอนานกว่า — ฐานข้อมูลยืนยันว่าเป็นใบรอตรวจ)
//  18) ใบที่สอง (ชิ้นเดียว): เปิดค้างไว้ระหว่างที่ Super Admin ตีกลับและช่างส่งใหม่ (API) → กดปิดเคลมด้วยข้อมูลเก่า
//      → 409 โหลดใบใหม่พร้อมเหตุผลจากเซิร์ฟเวอร์ ไม่มีอะไรถูกเขียนทับ (ฐานข้อมูล) → ตัดสินรอบใหม่ "ปิดเคลม ไม่ส่งผู้ขาย"
//      → ยืนยัน "ปิดเคลม 1 ชิ้น ไม่ส่งผู้ขาย ใบงานจะปิด" (ไม่มีคำว่าอนุมัติ) → ปิดงาน ประวัติ CLAIM_DECLINED (ฐานข้อมูล)
//      สรุป "✓ ปิดงานแล้ว · ปิดเคลม ไม่ส่งผู้ขาย"
// วันนัด 12 วันข้างหน้าตอนปล่อยงาน (G10) · อะไหล่ตรงยี่ห้อเครื่องจาก fxPart (G0)
// ยืนยันผลที่ฐานข้อมูลทุกข้อที่เปลี่ยนข้อมูล · ต้องมี DATABASE_URL · รีสตาร์ท Expo ก่อนรัน (เว็บไม่เฝ้าไฟล์)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { visitDay, fxPart } = require("./fixture");
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const PHOTO = path.join(DIR, "..", "site-photo.png");
// VP8 — Chromium ของ Playwright เล่น H.264 (site-clip.mp4) ไม่ได้ (ดูหัวไฟล์ข้อ 5)
const CLIP = path.join(DIR, "..", "site-clip.webm");
const API = "http://localhost:4000/api";
// ภาพตัดบรรทัดรุ่นที่ใช้ได้จริง (PNG 1×1) — เหมือนของที่ช่างส่ง
const CROP = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const REASON = "วิดีโอการตรวจเช็คไม่เห็นมิเตอร์ ถ่ายใหม่";
const SYMPTOM = "ประตูล็อกไม่ลง ขึ้น Error dL";
const SYMPTOM2 = "ประตูล็อกไม่ลง ขึ้น Error dL สายพานแตกร้าว";

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

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const suf = String(Date.now()).slice(-5);
  const bc = `DZCR${suf}`;
  const REASON_B = "สายพานในรูปไม่ใช่ตัวที่ถอดออก ถ่ายใหม่";
  const DROP_OTHER = "ช่างซื้อชิ้นนี้เองนอกระบบ";
  const team = "กระบี่";
  const oldRegion = sql(`select coalesce(region,'') from "User" where "employeeCode"='S001'`);
  const users = [`ZCRP${suf}`, `ZCRT${suf}`, `ZCRS${suf}`];
  const ids = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const A = await login("A001");
  let W = 1280;
  let H = 656;

  try {
    // ── เตรียม: สาขาแฟรนไชส์ในประกัน เครื่อง Huebsch · Admin Spare Part / ช่าง / Super Admin ของชุดนี้เอง ──
    sql(`update "User" set region='ใต้' where "employeeCode"='S001'`);
    const S = await login("S001");
    const hash = sql(`select "passwordHash" from "User" where "employeeCode"='T001'`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword") values ('ZCRP${suf}','คุณวันดี ทดสอบตรวจ','PARTS_ADMIN','${hash}',false)`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword",team) values ('ZCRT${suf}','ช่างสมชาย ทดสอบตรวจ','EMPLOYEE','${hash}',false,'${team}')`);
    // Super Admin ทดสอบ — ยกสิทธิ์ในฐานข้อมูล (หน้าจอ/API สร้าง Super Admin ไม่ได้)
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword") values ('ZCRS${suf}','ซูเปอร์ทดสอบตรวจ','SUPER_ADMIN','${hash}',false)`);
    const PA = await login(`ZCRP${suf}`);
    const T = await login(`ZCRT${suf}`);
    const tid = Number(sql(`select id from "User" where "employeeCode"='ZCRT${suf}'`));
    const paId = Number(sql(`select id from "User" where "employeeCode"='ZCRP${suf}'`));
    sql(`insert into "Branch"(name,code,region,zone,ownership,"openedAt") values ('สาขาทดสอบตรวจเคลม','${bc}','ใต้','${team}','FRANCHISE',now()-interval '12 months')`);
    const bid = sql(`select id from "Branch" where code='${bc}'`);
    sql(`insert into "Machine"("branchId",code,type,brand,"updatedAt") values (${bid},'W1','WASHER','HB - Huebsch',now())`);
    // ใบที่สอง (ข้อ 18) ใช้เครื่องอีกตัว — เคลมของใบแรกจะได้ไม่ขึ้นเป็น "เคลมซ้ำ" ของใบที่สอง
    sql(`insert into "Machine"("branchId",code,type,brand,"updatedAt") values (${bid},'W2','WASHER','HB - Huebsch',now())`);

    const wo = await call(A, "POST", "/work-orders", {
      branchCode: bc, jobType: "CM", priority: "NORMAL", contactName: "คุณสมหญิง", contactPhone: "081-234-5678",
      machines: [{ code: "W1", model: "Huebsch", symptom: "ประตูล็อกไม่ลง" }],
    });
    const id = wo.orders ? wo.orders[0].id : wo.id;
    if (!id) throw new Error(`เปิดใบงานไม่สำเร็จ: ${JSON.stringify(wo).slice(0, 200)}`);
    ids.push(id);
    const sp1 = fxPart(id, "BOARD");
    const sp2 = fxPart(id, "BELT");
    const name1 = sql(`select name from "SparePart" where id=${sp1}`);
    const name2 = sql(`select name from "SparePart" where id=${sp2}`);
    const both = [sp1, sp2];
    await call(S, "POST", `/work-orders/${id}/parts`, { needsParts: true, parts: both.map((s) => ({ sparePartId: s, quantity: 1 })) });
    await call(A, "POST", `/work-orders/${id}/parts-sourcing`, { results: both.map((s) => ({ sparePartId: s, inStock: true, warehouse: "คลังลาดพร้าว 94" })) });
    await call(S, "POST", `/work-orders/${id}/assign`, { team, scheduledAt: visitDay(12) });
    await call(A, "POST", `/work-orders/${id}/parts-check`, {
      results: both.map((s) => ({ sparePartId: s, inStock: true, warehouse: "คลังลาดพร้าว 94", requisitionNo: `RQ-CR${suf}` })),
    });
    await call(A, "POST", `/work-orders/${id}/confirm-appointment`, {});
    await call(S, "POST", `/work-orders/${id}/dispatch`, {});
    if (sql(`select status from "WorkOrder" where id=${id}`) !== "IN_PROGRESS") throw new Error("เตรียมใบไม่ถึงขั้นเข้างาน");
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
      for (const role of ["CLAIM_ERROR_VIDEO", "CLAIM_CHECK_VIDEO"]) await upload(role, CLIP, "video/webm", s);
    }
    const ts = (await call(T, "GET", `/work-orders/${id}`)).claimTroubleshooting ?? [];
    const closeBody = (symptomOf) => ({
      result: "FIXED", note: "เปลี่ยนบอร์ดกับสายพาน ทดสอบแล้วปกติ", workerIds: [tid], parts: both.map((s) => ({ sparePartId: s, quantity: 1 })),
      claims: both.map((s) => ({ sparePartId: s, brokenPartCode: `OLD-${s}`, symptom: symptomOf(s), checkNote: "วัดไฟเข้าบอร์ด 220V ปกติ", troubleshooting: ts })),
      claimNameplate: {
        fields: [
          { key: "model", label: "รุ่น", value: "HL055LWHPRXG6W0000", source: "SCAN", crop: CROP },
          { key: "serial", label: "Serial", value: "2402600330", source: "HAND" },
        ],
        verified: true,
      },
      claimCheck: { errorCode: "E dL / E dL1 / E dL2", checked: ["Solenoid ไม่ฝืด"] },
    });
    let closed = await call(T, "POST", `/work-orders/${id}/close`, closeBody(() => SYMPTOM));
    if (sql(`select status from "WorkOrder" where id=${id}`) !== "CLAIM_REVIEW") throw new Error(`ปิดพร้อมเคลมไม่ผ่าน: ${JSON.stringify(closed).slice(0, 200)}`);
    // รอบแรกตีกลับทั้งใบ (คำสั่งแบบเดิม) → ช่างแนบวิดีโอการตรวจเช็คใหม่ให้ชิ้นแรก แก้อาการของชิ้นที่สอง แล้วส่งใหม่
    const rj = await call(PA, "POST", `/work-orders/${id}/claim-review`, { approve: false, reason: REASON });
    if (sql(`select status from "WorkOrder" where id=${id}`) !== "IN_PROGRESS") throw new Error(`ตีกลับไม่สำเร็จ: ${JSON.stringify(rj).slice(0, 200)}`);
    await upload("CLAIM_CHECK_VIDEO", CLIP, "video/webm", sp1);
    closed = await call(T, "POST", `/work-orders/${id}/close`, closeBody((s) => (s === sp2 ? SYMPTOM2 : SYMPTOM)));
    if (sql(`select status from "WorkOrder" where id=${id}`) !== "CLAIM_REVIEW") throw new Error(`ส่งใหม่ไม่ผ่าน: ${JSON.stringify(closed).slice(0, 200)}`);
    sql(`select count(*) filter (where status='REJECTED')||'|'||count(*) filter (where status='PENDING') from "PartClaim" where "workOrderId"=${id}`) === "2|2"
      ? pass(`เตรียม ${code}: ส่งเคลม 2 ชิ้น → ตีกลับทั้งใบ → ช่างส่งใหม่ (รอบ 2) รอตรวจ (ฐานข้อมูล: ตีกลับ 2 แถว · รอตรวจ 2 แถว)`)
      : fail(`เตรียมรอบสอง: ${sql(`select string_agg(status,',' order by id) from "PartClaim" where "workOrderId"=${id}`)}`);
    // วิดีโอการตรวจเช็คล่าสุดของชิ้นแรก = ไฟล์ที่หน้าตรวจต้องเล่น (ไฟล์รอบแรกเก็บเป็นประวัติ)
    const newVideoKey = sql(`select "objectKey" from "WorkOrderAttachment" where "workOrderId"=${id} and role='CLAIM_CHECK_VIDEO' and "sparePartId"=${sp1} order by id desc limit 1`);
    // เลื่อนประวัติทั้งใบย้อนไป 1 วันพร้อมกัน (ใบงาน · ประวัติ · ไฟล์ · แถวเคลม) — ลำดับเวลาคงเดิม รอบหลักฐานไม่เพี้ยน
    // "รอ 0 วัน" ที่ตายตัวพิสูจน์อะไรไม่ได้ (คิดจากวันที่ผิด/ไม่มีวันที่ก็ได้ 0) ต้องเห็นเลขที่ไม่ใช่ 0 ที่คิดจากฐานข้อมูล
    sql(`update "WorkOrder" set "createdAt"="createdAt"-interval '1 day', "closedAt"="closedAt"-interval '1 day' where id=${id};
         update "WorkOrderLog" set "createdAt"="createdAt"-interval '1 day' where "workOrderId"=${id};
         update "WorkOrderAttachment" set "createdAt"="createdAt"-interval '1 day' where "workOrderId"=${id};
         update "PartClaim" set "createdAt"="createdAt"-interval '1 day', "reviewedAt"="reviewedAt"-interval '1 day' where "workOrderId"=${id}`);
    // รอกี่วัน ตามวันไทย ณ ตอนตรวจ — กติกาเดียวกับแอป (วันไทยของแถวที่รอตรวจล่าสุด ถึงวันนี้) ไม่พังเมื่อเทสต์คร่อมเที่ยงคืน
    const waitDays = () =>
      Number(sql(`select ((now() at time zone 'Asia/Bangkok')::date - max(("createdAt" at time zone 'UTC') at time zone 'Asia/Bangkok')::date)
                  from "PartClaim" where "workOrderId"=${id} and status='PENDING'`));
    if (waitDays() < 1) throw new Error(`เตรียม: เลื่อนประวัติแล้วยังรอ ${waitDays()} วัน`);
    // ชิ้นที่สอง: ข้อเช็คที่ฟอร์มเคยให้ช่างเห็น (offered) ต่างจากคู่มือวันนี้ — หน้าตรวจต้องนับ ✓/✗ จาก offered ของแถว
    // ไม่ใช่คู่มือปัจจุบัน (ถ้าแอปเลิกอ่าน offered ชิ้นนี้จะกลายเป็น 1/4 และขึ้นข้อที่ช่างไม่เคยเห็น)
    sql(`update "PartClaim" set "fieldCheck"=jsonb_set("fieldCheck",'{offered}','["Solenoid ไม่ฝืด","ข้อทดสอบเก่า"]'::jsonb)
         where "workOrderId"=${id} and "sparePartId"=${sp2} and status='PENDING'`);

    async function signIn(user, viewAsOf) {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      page.on("pageerror", (e) => errors.push(`${user}: ${e}`));
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      if (viewAsOf) {
        // ดูในฐานะ: ใส่โทเคนแบบที่แอปเก็บเองตอนกด "ดูในฐานะ" (ตัวจริงเก็บไว้ใน token-self) แล้วโหลดใหม่
        const own = await login(user);
        const va = await call(own, "POST", "/auth/view-as", { userId: viewAsOf });
        if (!va.token) throw new Error(`ดูในฐานะไม่สำเร็จ: ${JSON.stringify(va).slice(0, 200)}`);
        await page.evaluate(([o, v]) => {
          localStorage.setItem("service-app/token-self", o);
          localStorage.setItem("service-app/token", v);
        }, [own, va.token]);
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(3500);
        return page;
      }
      await page.getByPlaceholder("รหัสพนักงาน").fill(user);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await page.getByText("เข้าสู่ระบบ", { exact: true }).click();
      await page.waitForTimeout(3500);
      return page;
    }
    async function openOrder(page, which = code) {
      // จอกว้าง (≥ 1100) เมนูข้างกางค้าง ไม่มีแถบล่าง — ทางเข้าคือเมนู "ใบงานซ่อม" · มือถือใช้แท็บล่าง "ใบงาน"
      if (page.viewportSize().width >= 1100) {
        await page.locator('[aria-label="ใบงานซ่อม"]').locator("visible=true").last().click({ timeout: 10000 });
      } else {
        await page.getByText("ใบงาน", { exact: true }).locator("visible=true").last().click({ timeout: 10000 });
      }
      await page.waitForTimeout(2500);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(which);
      await page.waitForTimeout(2500);
      await page.getByText(which, { exact: true }).locator("visible=true").first().click();
      await page.waitForTimeout(3500);
    }
    const vis = (page, t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const byLabel = (page, l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    const inView = (box) => !!box && box.y >= 0 && box.y + box.height <= H + 0.5;
    const title = `${code} · ${bc} สาขาทดสอบตรวจเคลม · W1 Huebsch`;

    // ── 1) หน้าตรวจเคลมขึ้นก่อน ──
    let page = await signIn(`ZCRP${suf}`);
    await openOrder(page);
    const head = vis(page, title).first();
    await head.waitFor({ timeout: 15000 }).catch(() => {});
    const headBox = await head.boundingBox();
    const d1 = waitDays();
    headBox && headBox.y < 200 && (await vis(page, `รอบ 2 · รอ ${d1} วัน`).count()) > 0 && (await vis(page, "ดูรายละเอียดใบงาน ▸").count()) > 0
      ? pass(`หน้าตรวจเคลมขึ้นบนสุดของใบงาน (หัวอยู่ที่ y=${Math.round(headBox.y)}) · "รอบ 2 · รอ ${d1} วัน" (ตรงฐานข้อมูล) · รายละเอียดใบงานพับไว้`)
      : fail(`หัวหน้าตรวจเคลม: ${JSON.stringify(headBox)} · "รอบ 2 · รอ ${d1} วัน"=${await vis(page, `รอบ 2 · รอ ${d1} วัน`).count()}`);
    // เนื้อใบงานที่เหลือพับอยู่ — การ์ดขั้นตอน/ประวัติไม่อยู่บนจอ
    (await byLabel(page, "ขั้นตอนงาน").count()) === 0 && (await vis(page, "เคลมอะไหล่เก่า").count()) === 0
      ? pass("เนื้อใบงานที่เหลือ (ขั้นตอน · การ์ดเคลมแบบเดิม) พับไว้ ไม่แย่งที่หน้าตรวจ")
      : fail("เนื้อใบงานยังกางอยู่ใต้หน้าตรวจเคลม");
    const meta = (await page.locator('[aria-label="หน้าตรวจเคลม"]').first().innerText().catch(() => "")).replace(/\s+/g, " ");
    const d1b = waitDays();
    meta.includes(`ช่าง ช่างสมชาย ทดสอบตรวจ (ZCRT${suf}) · ส่ง `) && /✓ ในประกันถึง \d+ \S+ \d{2}/.test(meta) && meta.includes("✓ เคลมซ้ำ: ไม่พบที่เครื่องนี้") &&
      new RegExp(`ส่งเคลม .+ \\(ช่าง ช่างสมชาย ทดสอบตรวจ\\) → ตีกลับ .+ → ส่งใหม่ .+ → รอ Admin Spare Part ตรวจ · ${d1b} วัน`).test(meta)
      ? pass(`หัวบอก ช่างที่ส่ง (ชื่อ + รหัส ZCRT${suf}) · ในประกันถึง · เคลมซ้ำ (เครื่องใหม่ = ไม่พบ) · แถบสถานะ ส่งเคลม → ตีกลับ → ส่งใหม่ → รอ Admin Spare Part ตรวจ · ${d1b} วัน`)
      : fail(`หัวหน้าตรวจเคลม: ${meta.slice(0, 400)}`);

    // ── 2) แถบตัดสินอยู่ในจอ ──
    const bar = byLabel(page, "แถบตัดสินเคลม").first();
    const barBox = await bar.boundingBox();
    const okBox = await vis(page, "✓ ผ่าน").first().boundingBox();
    const noBox = await vis(page, "✗ ตีกลับ").first().boundingBox();
    const dropBox = await vis(page, "ปิดเคลม ไม่ส่งผู้ขาย").first().boundingBox();
    const subBox = await vis(page, "ตัดสินให้ครบทุกชิ้นก่อน").first().boundingBox();
    inView(barBox) && barBox.height <= 57 && [okBox, noBox, dropBox, subBox].every(inView) &&
      (await vis(page, `${name1}:`).count()) === 1
      ? pass(`แถบตัดสินอยู่ในจอทั้งแถบโดยไม่ต้องเลื่อน (สูง ${Math.round(barBox.height)} px · ล่างสุด y=${Math.round(barBox.y + barBox.height)}) · "${name1}:" ✓ ผ่าน · ✗ ตีกลับ · ปิดเคลม ไม่ส่งผู้ขาย · "ตัดสินให้ครบทุกชิ้นก่อน"`)
      : fail(`แถบตัดสิน: แถบ ${JSON.stringify(barBox)} · ผ่าน ${JSON.stringify(okBox)} · ตีกลับ ${JSON.stringify(noBox)} · ปิดเคลม ${JSON.stringify(dropBox)} · ส่ง ${JSON.stringify(subBox)}`);
    await page.screenshot({ path: path.join(DIR, "claim-review-1-first-view.png") });

    // ── 3) ข้อมูลเครื่องครั้งเดียว ──
    const machine = byLabel(page, "ข้อมูลเครื่องในใบเคลม");
    (await machine.count()) === 1 && (await vis(page, "ข้อมูลเครื่อง (ใช้ร่วมทุกชิ้น)").count()) === 1 &&
      (await vis(page, "E dL / E dL1 / E dL2 — ประตูล็อก/ปลดล็อก").count()) > 0 && (await byLabel(page, "ภาพตัดจากรูปป้าย รุ่น").count()) > 0 &&
      (await vis(page, "2402600330").count()) > 0
      ? pass("ข้อมูลเครื่องขึ้นครั้งเดียว (ใช้ร่วมทุกชิ้น): ภาพตัดรุ่น · Serial · Error \"E dL / E dL1 / E dL2 — ประตูล็อก/ปลดล็อก\"")
      : fail(`ข้อมูลเครื่อง: กล่อง ${await machine.count()} · หัว ${await vis(page, "ข้อมูลเครื่อง (ใช้ร่วมทุกชิ้น)").count()} · Error ${await vis(page, "E dL / E dL1 / E dL2 — ประตูล็อก/ปลดล็อก").count()}`);

    // ── 4) แท็บชิ้น + ข้อเช็ค ──
    const count = `ช่างเข้าเช็คอะไรบ้าง · Troubleshooting ${ts.length}/${ts.length} · เช็คตาม Error 1/4`;
    const count2 = `ช่างเข้าเช็คอะไรบ้าง · Troubleshooting ${ts.length}/${ts.length} · เช็คตาม Error 1/2`;
    (await vis(page, `${name1} · ● รอตัดสิน`).count()) === 1 && (await vis(page, `${name2} · ● รอตัดสิน`).count()) === 1
      ? pass(`แท็บชิ้นเป็นชื่ออะไหล่: "${name1} · ● รอตัดสิน" · "${name2} · ● รอตัดสิน"`)
      : fail("แท็บชิ้นไม่ได้ขึ้นชื่ออะไหล่");
    const checks1 = (await vis(page, count).count()) === 1 && (await vis(page, "ประตูไม่ตก กลอนเข้าร่อง (ไม่ได้ทำ)", false).count()) > 0;
    await vis(page, `${name2} · ● รอตัดสิน`).first().click();
    await page.waitForTimeout(600);
    const checks2 = (await vis(page, count2).count()) === 1 && (await vis(page, `ใบเคลม PDF (ร่าง) · ${name2}`).count()) === 1 &&
      (await vis(page, "ข้อทดสอบเก่า (ไม่ได้ทำ)", false).count()) > 0 && (await vis(page, "Limit switch ทำงาน", false).count()) === 0;
    checks1 && checks2
      ? pass(`ชิ้นแรก "${count.replace("ช่างเข้าเช็คอะไรบ้าง · ", "")}" ✗ "(ไม่ได้ทำ)" ตามคู่มือ · ชิ้นสองนับจาก offered ของแถว "เช็คตาม Error 1/2" + "ข้อทดสอบเก่า (ไม่ได้ทำ)" ไม่ขึ้นข้อในคู่มือวันนี้ · ปุ่มใบเคลมร่างตามชิ้นที่เปิด`)
      : fail(`ข้อเช็ค: ชิ้นแรก ${checks1} · ชิ้นสอง ${checks2} (1/2 ${await vis(page, count2).count()} · ข้อเก่า ${await vis(page, "ข้อทดสอบเก่า (ไม่ได้ทำ)", false).count()} · Limit switch ${await vis(page, "Limit switch ทำงาน", false).count()})`);
    // ชิ้นที่สองแก้อาการมา — บอกค่าเดิม → ค่าใหม่ (ตัดข้อความยาว)
    (await vis(page, /^แก้จากรอบก่อน: อาการ\/สาเหตุ .+ → .+/).count()) > 0
      ? pass("ชิ้นที่แก้อาการมา: \"แก้จากรอบก่อน: อาการ/สาเหตุ {เดิม} → {ใหม่}\"")
      : fail("ไม่บอกว่าชิ้นที่สองแก้อาการ/สาเหตุจากรอบก่อน");

    // ── 5) + 6) ชิ้นแรก: วิดีโอใหม่รอบนี้ ──
    await vis(page, `${name1} · ● รอตัดสิน`).first().click();
    await page.waitForTimeout(1500);
    const videos = page.locator("video").locator("visible=true");
    const srcs = await videos.evaluateAll((els) => els.map((e) => e.getAttribute("src") || ""));
    const keyTail = newVideoKey.split("/").pop();
    (await videos.count()) >= 2 && (await vis(page, "เปิดไฟล์").count()) >= 2 && srcs.some((s) => s.includes(keyTail))
      ? pass(`วิดีโอเล่นในหน้า ${await videos.count()} ตัว พร้อมปุ่ม "เปิดไฟล์" · วิดีโอการตรวจเช็คที่ขึ้นคือไฟล์ที่ช่างแนบใหม่ (ฐานข้อมูล)`)
      : fail(`วิดีโอในหน้า: ${await videos.count()} ตัว · ไฟล์ใหม่ ${keyTail} · src ${srcs.join(" | ").slice(0, 300)}`);
    (await vis(page, "หลักฐานรอบนี้:").count()) === 1 && (await vis(page, "ใหม่รอบนี้").count()) >= 1 &&
      (await vis(page, "แก้จากรอบก่อน: วิดีโอการตรวจเช็ค — ไฟล์ใหม่แทนไฟล์เดิม").count()) === 1
      ? pass("ชิ้นแรก: \"หลักฐานรอบนี้:\" · ป้าย \"ใหม่รอบนี้\" · \"แก้จากรอบก่อน: วิดีโอการตรวจเช็ค — ไฟล์ใหม่แทนไฟล์เดิม\"")
      : fail(`ชิ้นแรก: หลักฐานรอบนี้ ${await vis(page, "หลักฐานรอบนี้:").count()} · ใหม่รอบนี้ ${await vis(page, "ใหม่รอบนี้").count()} · แก้จากรอบก่อน ${await vis(page, "แก้จากรอบก่อน: วิดีโอการตรวจเช็ค — ไฟล์ใหม่แทนไฟล์เดิม").count()}`);
    const oldBtn = vis(page, "รอบ 1 · ตีกลับ ▸");
    const folded = (await oldBtn.count()) === 1 && (await vis(page, `✗ ${name1} ตีกลับ — “${REASON}”`).count()) === 0;
    await oldBtn.first().click().catch(() => {});
    await page.waitForTimeout(500);
    (folded &&
      (await vis(page, "รอบ 1 · ตีกลับ ▾").count()) === 1 &&
      (await vis(page, /^รอบ 1 · ตีกลับ .+ โดยคุณวันดี ทดสอบตรวจ$/).count()) === 1 &&
      (await vis(page, `✗ ${name1} ตีกลับ — “${REASON}”`).count()) === 1 &&
      (await vis(page, `ไฟล์เดิมของ ${name1} · วิดีโอการตรวจเช็ค (รอบ 1) เก็บเป็นประวัติ ไม่ส่งไปกับใบเคลม`).count()) === 1)
      ? pass("รอบเก่าพับไว้ \"รอบ 1 · ตีกลับ ▸\" · เปิดแล้วบอกเวลา คนตรวจ เหตุผลรายชิ้น และไฟล์เดิมที่เก็บเป็นประวัติ")
      : fail(`รอบเก่า: พับ=${folded} · เปิด ${await vis(page, "รอบ 1 · ตีกลับ ▾").count()}`);
    // เลื่อนลงสุดของหน้าตรวจ แถบตัดสินยังอยู่ที่เดิม
    await vis(page, "รอบ 1 · ตีกลับ ▾").first().scrollIntoViewIfNeeded().catch(() => {});
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(500);
    const barBox2 = await bar.boundingBox();
    inView(barBox2) && Math.abs(barBox2.y - barBox.y) < 1
      ? pass("เลื่อนลงสุดแล้วแถบตัดสินยังอยู่ที่เดิม (ไม่ได้เลื่อนตามเนื้อหา)")
      : fail(`แถบตัดสินหลังเลื่อน: ${JSON.stringify(barBox2)} (ก่อนเลื่อน ${JSON.stringify(barBox)})`);
    await page.screenshot({ path: path.join(DIR, "claim-review-2-part-old-rounds.png") });

    // ── 7) ดูรายละเอียดใบงาน ──
    await vis(page, "ดูรายละเอียดใบงาน ▸").first().click();
    await page.waitForTimeout(800);
    (await vis(page, "ซ่อนรายละเอียดใบงาน ▾").count()) === 1 && (await vis(page, /^ใบแจ้ง: “ประตูล็อกไม่ลง” · .*ผลการทำงาน:/).count()) === 1 &&
      (await byLabel(page, "ขั้นตอนงาน").count()) > 0
      ? pass("\"ดูรายละเอียดใบงาน ▸\" กางเนื้อใบงานที่เหลือ + กล่องใบแจ้ง/ผลการทำงาน")
      : fail(`กางรายละเอียดใบงาน: ซ่อน ${await vis(page, "ซ่อนรายละเอียดใบงาน ▾").count()} · ขั้นตอน ${await byLabel(page, "ขั้นตอนงาน").count()}`);
    await vis(page, "ซ่อนรายละเอียดใบงาน ▾").first().click();
    await page.waitForTimeout(500);
    (await byLabel(page, "ขั้นตอนงาน").count()) === 0 ? pass("\"ซ่อนรายละเอียดใบงาน ▾\" พับกลับ") : fail("พับรายละเอียดใบงานกลับไม่ได้");
    sql(`select status from "WorkOrder" where id=${id}`) === "CLAIM_REVIEW" &&
      sql(`select count(*) from "PartClaim" where "workOrderId"=${id} and status='PENDING'`) === "2"
      ? pass("ดูหน้าตรวจทั้งหมดแล้วยังไม่มีอะไรถูกส่ง (ฐานข้อมูล: รอตรวจ 2 แถว)")
      : fail("ดูหน้าตรวจแล้วข้อมูลเปลี่ยน");
    await page.close();

    // ── 8) แอดมินทั่วไป: การ์ดเคลมแบบเดิม ──
    page = await signIn("A001");
    await openOrder(page);
    const card = (await page.getByText("เคลมอะไหล่เก่า", { exact: true }).locator("visible=true").count()) > 0;
    const d8 = waitDays();
    (card && (await byLabel(page, "แถบตัดสินเคลม").count()) === 0 && (await vis(page, title).count()) === 0 &&
      (await vis(page, "หลักฐานรอบนี้:").count()) >= 2 && (await vis(page, "รอบ 1 · ตีกลับ ▸").count()) === 1 &&
      (await vis(page, `รอ Admin Spare Part ตรวจ · ${d8} วัน`).count()) > 0)
      ? pass(`แอดมินทั่วไป: การ์ดเคลมแบบเดิม (หลักฐานรอบนี้ทุกชิ้น · แถบสถานะ "รอ Admin Spare Part ตรวจ · ${d8} วัน" · รอบเก่าพับไว้) ไม่มีหน้าตรวจ/แถบตัดสิน`)
      : fail(`แอดมินทั่วไป: การ์ด=${card} · แถบตัดสิน ${await byLabel(page, "แถบตัดสินเคลม").count()} · หลักฐานรอบนี้ ${await vis(page, "หลักฐานรอบนี้:").count()} · รอ ${d8} วัน ${await vis(page, `รอ Admin Spare Part ตรวจ · ${d8} วัน`).count()}`);
    // ✗ "(ไม่ได้ทำ)" มีไว้ให้คนตัดสินเคลม (เจ้าของงานเลือกข้อ 7 ค) — แอดมินทั่วไป/ช่างเห็นแค่ข้อที่ทำ
    (await vis(page, "(ไม่ได้ทำ)", false).count()) === 0 && (await vis(page, "Solenoid ไม่ฝืด", false).count()) > 0
      ? pass("แอดมินทั่วไป: การ์ดเคลมไม่มีบรรทัด ✗ \"(ไม่ได้ทำ)\" (เฉพาะคนตัดสินเคลม) แต่ยังเห็นข้อเช็คที่ช่างทำ")
      : fail(`แอดมินทั่วไป ข้อเช็ค: ไม่ได้ทำ ${await vis(page, "(ไม่ได้ทำ)", false).count()} · ข้อที่ทำ ${await vis(page, "Solenoid ไม่ฝืด", false).count()}`);
    await page.close();

    // ── 9) Super Admin ดูในฐานะ Admin Spare Part ──
    page = await signIn(`ZCRS${suf}`, paId);
    await openOrder(page);
    (await vis(page, title).count()) > 0 && (await vis(page, "ดูได้อย่างเดียว แก้ไขไม่ได้").count()) > 0 &&
      (await vis(page, "✓ ผ่าน").count()) === 0 && (await vis(page, "✗ ตีกลับ").count()) === 0 &&
      (await vis(page, "ตัดสินให้ครบทุกชิ้นก่อน").count()) === 0
      ? pass("Super Admin ดูในฐานะ Admin Spare Part: เห็นหน้าตรวจ ไม่มีปุ่มตัดสิน — \"ดูได้อย่างเดียว แก้ไขไม่ได้\"")
      : fail(`ดูในฐานะ: หัว ${await vis(page, title).count()} · ดูได้อย่างเดียว ${await vis(page, "ดูได้อย่างเดียว แก้ไขไม่ได้").count()} · ปุ่มผ่าน ${await vis(page, "✓ ผ่าน").count()}`);
    await page.screenshot({ path: path.join(DIR, "claim-review-3-view-as.png") });
    await page.close();

    // ── 10) จอมือถือ ──
    W = 360;
    H = 780;
    page = await signIn(`ZCRP${suf}`);
    await openOrder(page);
    await vis(page, title).first().waitFor({ timeout: 15000 }).catch(() => {});
    const pBar = await byLabel(page, "แถบตัดสินเคลม").first().boundingBox();
    const pOk = await vis(page, "ตัดสินให้ครบทุกชิ้นก่อน").first().boundingBox();
    const sideScroll = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    inView(pBar) && inView(pOk) && pOk.x + pOk.width <= W + 0.5 && sideScroll <= 1
      ? pass(`จอมือถือ 360×780: แถบตัดสินอยู่ในจอ (สูง ${Math.round(pBar.height)} px) · ไม่มีเลื่อนซ้ายขวา`)
      : fail(`จอมือถือ: แถบ ${JSON.stringify(pBar)} · ปุ่ม ${JSON.stringify(pOk)} · เกินขวา ${sideScroll}`);
    // หน้าตรวจอยู่ในส่วนที่เลื่อนข้างไม่ได้ ของที่ล้นถูกตัดเงียบ ๆ (scrollWidth ของหน้ายังเท่าเดิม) — วัดขอบขวาของปุ่ม/แท็บกับขอบหน้าตรวจ
    const pane = await page.locator('[aria-label="หน้าตรวจเคลม"]').locator("visible=true").first().boundingBox();
    const draft = await byLabel(page, `ใบเคลม PDF (ร่าง) · ${name1}`).first().boundingBox();
    const tabs = await Promise.all([name1, name2].map((n) => vis(page, `${n} · ● รอตัดสิน`).first().boundingBox()));
    const inside = (b) => !!b && !!pane && b.x >= pane.x - 0.5 && b.x + b.width <= pane.x + pane.width + 0.5;
    inside(draft) && tabs.every(inside)
      ? pass(`จอมือถือ: ปุ่ม "ใบเคลม PDF (ร่าง) · ${name1}" และแท็บชิ้นอยู่ในขอบหน้าตรวจ (ไม่ถูกตัด)`)
      : fail(`ปุ่ม/แท็บล้นหน้าตรวจ: หน้าตรวจ ${JSON.stringify(pane)} · ปุ่ม ${JSON.stringify(draft)} · แท็บ ${JSON.stringify(tabs)}`);
    await page.screenshot({ path: path.join(DIR, "claim-review-4-phone.png") });
    await page.close();

    // ── ตัดสินทีละชิ้น (เคลมก้อน 3) ──
    W = 1280;
    H = 656;
    const code1 = sql(`select "partCode" from "SparePart" where id=${sp1}`);
    const claimsOf = (s) =>
      sql(`select string_agg(status||':'||coalesce("rejectReason",''),',' order by id) from "PartClaim" where "workOrderId"=${id} and "sparePartId"=${s}`);
    const pendingN = () => sql(`select count(*) from "PartClaim" where "workOrderId"=${id} and status='PENDING'`);
    const codeB = sql(`select "partCode" from "SparePart" where id=${sp2}`);
    // กล่องยืนยันบนเว็บเป็นกล่องที่วาดในแอป (showAlert → Feedback) — บรรทัดทีละชิ้นกับท้ายกล่องอยู่ในข้อความก้อนเดียว
    // หาก้อนนั้นจากท้ายกล่อง (มีที่เดียวบนจอ) แล้วอ่านทั้งก้อน — ไม่รวมข้อความอื่นบนหน้าที่บังเอิญมีคำเดียวกัน
    const dialogText = async (page, titleText, foot) => {
      await vis(page, titleText).first().waitFor({ timeout: 10000 }).catch(() => {});
      return (await vis(page, foot, false).first().innerText().catch(() => "")).trim();
    };
    const FOOT_OK = "หลังอนุมัติ ใบเคลม PDF และไฟล์หลักฐานพร้อมดาวน์โหลดส่งผู้ขาย";
    const FOOT_DROP = "ไม่มีชิ้นที่ส่งผู้ขาย — ไม่ออกใบเคลม";

    // ── 11) ยังไม่ตัดสิน ──
    page = await signIn(`ZCRP${suf}`);
    await openOrder(page);
    await vis(page, title).first().waitFor({ timeout: 15000 }).catch(() => {});
    const posts = [];
    page.on("request", (r) => { if (/\/claim-review$/.test(r.url()) && r.method() === "POST") posts.push(r.postData() ?? ""); });
    await vis(page, "ตัดสินให้ครบทุกชิ้นก่อน").first().click();
    await page.waitForTimeout(600);
    (await vis(page, `${name1}: ยังไม่ได้ตัดสิน — ตัดสินให้ครบทุกชิ้นก่อน`).count()) === 1 && posts.length === 0 && pendingN() === "2"
      ? pass(`ยังไม่ตัดสิน: กดปุ่มส่งแล้วบอก "${name1}: ยังไม่ได้ตัดสิน …" ไม่ส่งคำขอ (ฐานข้อมูลรอตรวจ 2 แถว)`)
      : fail(`ยังไม่ตัดสิน: ข้อความ ${await vis(page, `${name1}: ยังไม่ได้ตัดสิน — ตัดสินให้ครบทุกชิ้นก่อน`).count()} · คำขอ ${posts.length} · รอตรวจ ${pendingN()}`);

    // ── 12) ผ่านทั้งสองชิ้น → ยืนยัน → กลับไปดูอีกครั้ง ──
    await vis(page, "✓ ผ่าน").first().click();
    await page.waitForTimeout(300);
    const tab1Ok = (await vis(page, `${name1} · ✓ ผ่าน`).count()) === 1;
    await vis(page, `${name2} · ● รอตัดสิน`).first().click();
    await page.waitForTimeout(500);
    await vis(page, "✓ ผ่าน").first().click();
    await page.waitForTimeout(300);
    const okLabel = (await vis(page, "อนุมัติเคลม · ปิดงาน").count()) === 1 &&
      (await vis(page, `ทั้งใบ: ${name1} ✓ ผ่าน · ${name2} ✓ ผ่าน`).count()) === 1;
    await vis(page, "อนุมัติเคลม · ปิดงาน").first().click();
    let cf = await dialogText(page, "อนุมัติ 2 ชิ้น ใบงานจะปิด", FOOT_OK);
    tab1Ok && okLabel && (await vis(page, "อนุมัติ 2 ชิ้น ใบงานจะปิด").count()) === 1 &&
      cf.includes(`✓ ${name1} — อนุมัติ ออกใบเคลมส่งผู้ขาย`) && cf.includes(`✓ ${name2} — อนุมัติ ออกใบเคลมส่งผู้ขาย`) &&
      cf.includes(FOOT_OK) &&
      (await vis(page, "กลับไปดูอีกครั้ง").count()) === 1 && (await vis(page, "ยืนยันอนุมัติ").count()) === 1
      ? pass("ผ่านทั้งสองชิ้น: แท็บขึ้น \"✓ ผ่าน\" · สรุปทั้งใบ · ปุ่ม \"อนุมัติเคลม · ปิดงาน\" → ยืนยัน \"อนุมัติ 2 ชิ้น ใบงานจะปิด\" + บรรทัดทีละชิ้น + ท้ายกล่อง")
      : fail(`ยืนยันอนุมัติ: แท็บ=${tab1Ok} · ปุ่ม/สรุป=${okLabel} · กล่อง "${cf.slice(0, 300)}"`);
    await page.screenshot({ path: path.join(DIR, "claim-review-5-confirm.png") });
    await vis(page, "กลับไปดูอีกครั้ง").first().click();
    await page.waitForTimeout(800);
    (await vis(page, "อนุมัติ 2 ชิ้น ใบงานจะปิด").count()) === 0 && posts.length === 0 && pendingN() === "2"
      ? pass("\"กลับไปดูอีกครั้ง\": กล่องปิด ไม่ส่งคำขอ (ฐานข้อมูลยังรอตรวจ 2 แถว)")
      : fail(`กลับไปดูอีกครั้ง: คำขอ ${posts.length} · รอตรวจ ${pendingN()}`);

    // ── 13) ชิ้นสองตีกลับ ──
    await vis(page, "✗ ตีกลับ").first().click();
    await page.waitForTimeout(400);
    const dock = (await byLabel(page, "ตีกลับ: เหตุผล").count()) === 1 && (await byLabel(page, "เหตุผลที่ตีกลับเคลม").count()) === 1;
    await vis(page, "ตัดสินให้ครบทุกชิ้นก่อน").first().click();
    await page.waitForTimeout(500);
    dock && (await vis(page, `${name2}: ตีกลับต้องบอกเหตุผล — ช่างจะได้รู้ว่าต้องแก้อะไร`).count()) === 1 && posts.length === 0 && pendingN() === "2"
      ? pass(`ชิ้นสอง ✗ ตีกลับ: ช่องเหตุผลขึ้นเหนือแถบ · ไม่ใส่เหตุผลกดส่ง = "${name2}: ตีกลับต้องบอกเหตุผล …" ไม่ส่งคำขอ`)
      : fail(`ตีกลับไม่มีเหตุผล: ช่อง=${dock} · คำขอ ${posts.length} · รอตรวจ ${pendingN()}`);
    await byLabel(page, "เหตุผลที่ตีกลับเคลม").first().fill(REASON_B);
    await page.waitForTimeout(900);
    const draftRaw = await page.evaluate((k) => localStorage.getItem(k), `draft:review:${id}`);
    (draftRaw ?? "").includes(REASON_B) && (await vis(page, "ตีกลับให้ช่างแก้ (1 ชิ้น)").count()) === 1
      ? pass("ใส่เหตุผลแล้ว: ร่างการตัดสินจำไว้ในเครื่อง (review:<id>) · ปุ่มส่ง \"ตีกลับให้ช่างแก้ (1 ชิ้น)\"")
      : fail(`ร่างการตัดสิน: ${String(draftRaw).slice(0, 200)} · ปุ่ม ${await vis(page, "ตีกลับให้ช่างแก้ (1 ชิ้น)").count()}`);
    await page.screenshot({ path: path.join(DIR, "claim-review-6-reject-dock.png") });
    await vis(page, "ตีกลับให้ช่างแก้ (1 ชิ้น)").first().click();
    await page.waitForTimeout(4000);
    const lastLog = () => sql(`select action from "WorkOrderLog" where "workOrderId"=${id} order by id desc limit 1`);
    sql(`select status from "WorkOrder" where id=${id}`) === "IN_PROGRESS" &&
      claimsOf(sp1) === "REJECTED:" + REASON + ",APPROVED:" && claimsOf(sp2) === `REJECTED:${REASON},REJECTED:${REASON_B}` &&
      lastLog() === "CLAIM_REJECTED" && posts.length === 1 && !posts[0].includes('"approve"')
      ? pass(`ตีกลับให้ช่างแก้ (ไม่ถาม): ${name1} อนุมัติ · ${name2} ตีกลับพร้อมเหตุผลของชิ้นนั้น · ใบกลับไปรอช่าง · ประวัติ CLAIM_REJECTED (ฐานข้อมูล)`)
      : fail(`หลังตีกลับ: ใบ ${sql(`select status from "WorkOrder" where id=${id}`)} · ${name1} ${claimsOf(sp1)} · ${name2} ${claimsOf(sp2)} · ประวัติ ${lastLog()} · คำขอ ${posts.length}`);
    const notice = `ตีกลับ ${code} ให้ช่างแก้แล้ว (${name2}) — ใบนี้จะกลับมาในกล่องงานเมื่อช่างส่งใหม่`;
    (await vis(page, notice).count()) === 1 && (await byLabel(page, "แถบตัดสินเคลม").count()) === 0 &&
      (await page.evaluate((k) => localStorage.getItem(k), `draft:review:${id}`)) === null
      ? pass(`แถบสรุป "${notice}" · แถบตัดสินหาย · ร่างการตัดสินถูกล้าง`)
      : fail(`หลังตีกลับบนจอ: แถบสรุป ${await vis(page, notice).count()} · แถบตัดสิน ${await byLabel(page, "แถบตัดสินเคลม").count()}`);
    await page.screenshot({ path: path.join(DIR, "claim-review-7-rejected.png") });
    await page.close();

    // ── 14) ช่างส่งใหม่ (API) — ส่งทั้งสองชิ้น ชิ้นที่ผ่านแล้วต้องไม่ได้แถวใหม่ ──
    const body3 = closeBody((s) => (s === sp2 ? SYMPTOM2 : SYMPTOM));
    body3.claims = body3.claims.map((c) => (c.sparePartId === sp2 ? { ...c, keep: [{ flag: "ALL", note: "สายพานในรูปคือตัวที่ถอดออก ดูรหัสที่ขอบ" }] } : c));
    const r3 = await call(T, "POST", `/work-orders/${id}/close`, body3);
    sql(`select status from "WorkOrder" where id=${id}`) === "CLAIM_REVIEW" &&
      claimsOf(sp1) === "REJECTED:" + REASON + ",APPROVED:" && claimsOf(sp2).split(",").length === 3 && claimsOf(sp2).endsWith(",PENDING:") &&
      sql(`select count(*) from "WorkOrderPart" where "workOrderId"=${id} and kind='USED' and "sparePartId"=${sp1}`) === "1"
      ? pass(`ช่างส่งใหม่ทั้งสองชิ้น: ${name1} (ผ่านแล้ว) ไม่ได้แถวใหม่และยังอยู่ในอะไหล่ที่ใช้ · ${name2} รอตรวจรอบ 3 (ฐานข้อมูล)`)
      : fail(`ส่งใหม่: ${JSON.stringify(r3).slice(0, 200)} · ${name1} ${claimsOf(sp1)} · ${name2} ${claimsOf(sp2)}`);

    // ── 15) ชิ้นที่ผ่านแล้วล็อกไว้ ──
    page = await signIn(`ZCRP${suf}`);
    await openOrder(page);
    await vis(page, title).first().waitFor({ timeout: 15000 }).catch(() => {});
    const d15 = waitDays();
    (await vis(page, `${name1} · ✓ ผ่านแล้ว (รอบ 2)`).count()) === 1 && (await vis(page, `${name2} · ● รอตัดสิน`).count()) === 1 &&
      (await vis(page, `รอบ 3 · รอ ${d15} วัน`).count()) === 1 && (await vis(page, `ล็อกไว้พร้อม ${name1} ที่ผ่านแล้ว`).count()) === 1 &&
      (await vis(page, "รอบ 1 · ตีกลับ · รอบ 2 · ตีกลับ ▸").count()) === 1
      ? pass(`เปิดรอบ 3: แท็บ "${name1} · ✓ ผ่านแล้ว (รอบ 2)" + "${name2} · ● รอตัดสิน" · "ล็อกไว้พร้อม ${name1} ที่ผ่านแล้ว" · รอบเก่าพับไว้สองรอบ`)
      : fail(`รอบ 3: แท็บผ่านแล้ว ${await vis(page, `${name1} · ✓ ผ่านแล้ว (รอบ 2)`).count()} · รอบ 3 ${await vis(page, `รอบ 3 · รอ ${d15} วัน`).count()} · ล็อกเครื่อง ${await vis(page, `ล็อกไว้พร้อม ${name1} ที่ผ่านแล้ว`).count()} · รอบเก่า ${await vis(page, "รอบ 1 · ตีกลับ · รอบ 2 · ตีกลับ ▸").count()}`);
    await vis(page, `${name1} · ✓ ผ่านแล้ว (รอบ 2)`).first().click();
    await page.waitForTimeout(500);
    (await vis(page, "ผ่านแล้ว (รอบ 2) — ล็อกไว้ ไม่ต้องตรวจซ้ำ").count()) === 1 && (await vis(page, "✓ ผ่าน").count()) === 0 &&
      (await vis(page, `ใบเคลม PDF · ${name1}`).count()) === 1
      ? pass(`แท็บชิ้นที่ผ่านแล้ว: แถบขึ้น "ผ่านแล้ว (รอบ 2) — ล็อกไว้ ไม่ต้องตรวจซ้ำ" ไม่มีปุ่มตัดสิน · ปุ่ม "ใบเคลม PDF · ${name1}" (ไม่ใช่ร่าง)`)
      : fail(`แท็บชิ้นที่ผ่านแล้ว: ข้อความล็อก ${await vis(page, "ผ่านแล้ว (รอบ 2) — ล็อกไว้ ไม่ต้องตรวจซ้ำ").count()} · ปุ่มผ่าน ${await vis(page, "✓ ผ่าน").count()}`);
    await page.screenshot({ path: path.join(DIR, "claim-review-8-locked.png") });

    // ── 16) ชิ้นสองปิดเคลม ไม่ส่งผู้ขาย ──
    await vis(page, `${name2} · ● รอตัดสิน`).first().click();
    await page.waitForTimeout(500);
    await vis(page, "ปิดเคลม ไม่ส่งผู้ขาย").first().click();
    await page.waitForTimeout(900);
    const dropPanel = byLabel(page, "ปิดเคลม ไม่ส่งผู้ขาย").first();
    const panelText = (await dropPanel.innerText().catch(() => "")).replace(/\s+/g, " ");
    const panelOk = panelText.includes(`${name2} — ปิดเคลม ไม่ส่งผู้ขาย: เลือกเหตุผล`) &&
      panelText.includes("ชิ้นนี้ปิดไปเลย ไม่วนกลับหาช่าง และไม่ออกใบเคลมให้ผู้ขาย") &&
      ["หมดประกัน", "ไม่ใช่ชิ้นในประกัน", "อื่น ๆ"].every((t) => panelText.includes(t)) && inView(await dropPanel.boundingBox());
    await vis(page, "ตัดสินให้ครบทุกชิ้นก่อน").first().click();
    await page.waitForTimeout(500);
    panelOk && (await vis(page, `${name2}: ปิดเคลม ไม่ส่งผู้ขาย ต้องเลือกเหตุผล`).count()) === 1 && pendingN() === "1"
      ? pass(`"ปิดเคลม ไม่ส่งผู้ขาย": กล่องเลือกเหตุผลขึ้นในจอ (หมดประกัน · ไม่ใช่ชิ้นในประกัน · อื่น ๆ) · ยังไม่เลือก = "ปิดเคลม ไม่ส่งผู้ขาย ต้องเลือกเหตุผล" ไม่ส่ง`)
      : fail(`กล่องปิดเคลม: "${panelText.slice(0, 200)}" · ข้อความ ${await vis(page, `${name2}: ปิดเคลม ไม่ส่งผู้ขาย ต้องเลือกเหตุผล`).count()}`);
    await dropPanel.getByText("อื่น ๆ", { exact: true }).click();
    await page.waitForTimeout(300);
    await byLabel(page, `เหตุผลอื่น ${name2}`).first().fill(DROP_OTHER);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(DIR, "claim-review-9-decline.png") });
    await vis(page, "อนุมัติเคลม · ปิดงาน").first().click();
    cf = await dialogText(page, "อนุมัติ 1 ชิ้น ใบงานจะปิด", FOOT_OK);
    (await vis(page, "อนุมัติ 1 ชิ้น ใบงานจะปิด").count()) === 1 && cf.includes(`✓ ${name1} — อนุมัติ ออกใบเคลมส่งผู้ขาย`) &&
      cf.includes(`${name2} — ปิดเคลม ไม่ส่งผู้ขาย (อื่น ๆ: ${DROP_OTHER})`)
      ? pass(`ยืนยัน "อนุมัติ 1 ชิ้น ใบงานจะปิด" นับชิ้นที่ผ่านไปแล้ว + "${name2} — ปิดเคลม ไม่ส่งผู้ขาย (อื่น ๆ: …)"`)
      : fail(`กล่องยืนยันรอบ 3: "${cf.slice(0, 300)}"`);
    await vis(page, "ยืนยันอนุมัติ").first().click();
    await page.waitForTimeout(4000);
    sql(`select status from "WorkOrder" where id=${id}`) === "DONE" && claimsOf(sp1) === "REJECTED:" + REASON + ",APPROVED:" &&
      claimsOf(sp2).endsWith(`,DECLINED:อื่น ๆ: ${DROP_OTHER}`) && lastLog() === "CLAIM_APPROVED" &&
      sql(`select note from "WorkOrderLog" where "workOrderId"=${id} order by id desc limit 1`) === `${name2} ปิดเคลม ไม่ส่งผู้ขาย (อื่น ๆ: ${DROP_OTHER})`
      ? pass(`ยืนยันแล้ว: ใบปิด · ${name1} ยังอนุมัติ (ไม่ถูกตัดสินซ้ำ) · ${name2} ปิดเคลมพร้อมเหตุผล "อื่น ๆ: …" · ประวัติ CLAIM_APPROVED (${name1} ผ่านรอบก่อน = มีใบเคลมไปผู้ขาย) (ฐานข้อมูล)`)
      : fail(`หลังยืนยัน: ใบ ${sql(`select status from "WorkOrder" where id=${id}`)} · ${name1} ${claimsOf(sp1)} · ${name2} ${claimsOf(sp2)} · ประวัติ ${lastLog()} "${sql(`select note from "WorkOrderLog" where "workOrderId"=${id} order by id desc limit 1`)}"`);
    const done = (await byLabel(page, "ผลการตรวจเคลม").first().innerText().catch(() => "")).replace(/\s+/g, " ");
    // หน้าเลื่อนกลับขึ้นบน — สรุปและปุ่มใบถัดไปอยู่ในจอจริง ไม่ใช่แค่มองเห็นได้ตาม CSS (ผู้ตรวจเลื่อนลงไปดูหลักฐานมาก่อน)
    const doneBox = await byLabel(page, "ผลการตรวจเคลม").first().boundingBox().catch(() => null);
    done.includes("✓ อนุมัติเคลมแล้ว · ปิดงาน") && done.includes(`${code} · ${bc} สาขาทดสอบตรวจเคลม · อนุมัติ 1 ชิ้น · ปิดเคลม ไม่ส่งผู้ขาย 1 ชิ้น · `) &&
      done.includes(`✓ ${name1} (${code1}) — อนุมัติ`) && done.includes(`– ${name2} — ปิดเคลม ไม่ส่งผู้ขาย (อื่น ๆ: ${DROP_OTHER})`) &&
      done.includes("ใบถัดไป →") && (await byLabel(page, "แถบตัดสินเคลม").count()) === 0 && inView(doneBox)
      ? pass("สรุปหลังตัดสิน (อยู่ในจอ): \"✓ อนุมัติเคลมแล้ว · ปิดงาน\" · อนุมัติ 1 ชิ้น · ปิดเคลม ไม่ส่งผู้ขาย 1 ชิ้น · ทีละชิ้น · ปุ่ม \"ใบถัดไป →\"")
      : fail(`สรุปหลังตัดสิน: กรอบ ${JSON.stringify(doneBox)} · "${done.slice(0, 400)}"`);
    // แถบสถานะใต้หัว "อนุมัติ" ต้องจบที่ "อนุมัติ" — ชิ้นที่ผ่านรอบก่อนนับด้วย (กติกาเดียวกับการ์ดของช่าง) ไม่ใช่ "ปิดงาน (ปิดเคลม…)"
    done.includes("→ อนุมัติ ") && !done.includes("(ปิดเคลม ไม่ส่งผู้ขาย ·")
      ? pass("แถบสถานะในสรุป: จบที่ \"อนุมัติ hh:mm (ผู้ตรวจ)\" — ไม่ขึ้น \"ปิดงาน (ปิดเคลม ไม่ส่งผู้ขาย · …)\" ใต้หัวอนุมัติ")
      : fail(`แถบสถานะในสรุป: "${done.slice(0, 400)}"`);
    (await vis(page, "อนุมัติแล้ว").count()) >= 1 && (await vis(page, "ปิดเคลม ไม่ส่งผู้ขาย").count()) >= 1 &&
      (await byLabel(page, `เปิดใบเคลม ${code1}`).count()) === 1 && (await byLabel(page, `เปิดใบเคลม ${codeB}`).count()) === 0
      ? pass("การ์ดเคลมในใบ: ชิป \"อนุมัติแล้ว\" + ชิปเทา \"ปิดเคลม ไม่ส่งผู้ขาย\" · ปุ่มใบเคลมเฉพาะชิ้นที่อนุมัติ (ชิ้นที่ปิดเคลมไม่มีใบเคลม)")
      : fail(`การ์ดเคลม: อนุมัติแล้ว ${await vis(page, "อนุมัติแล้ว").count()} · ปิดเคลม ${await vis(page, "ปิดเคลม ไม่ส่งผู้ขาย").count()} · ปุ่มใบเคลม ${await byLabel(page, `เปิดใบเคลม ${code1}`).count()}`);
    await page.screenshot({ path: path.join(DIR, "claim-review-10-done.png"), fullPage: true });

    // ── 17) ใบถัดไป → ──
    // ใบที่สอง (ชิ้นเดียว เครื่อง W2) — เตรียมผ่าน API แบบเดียวกับใบแรก ให้มีใบรอตรวจอย่างน้อยหนึ่งใบแน่นอน
    const wo2 = await call(A, "POST", "/work-orders", {
      branchCode: bc, jobType: "CM", priority: "NORMAL", contactName: "คุณสมหญิง", contactPhone: "081-234-5678",
      machines: [{ code: "W2", model: "Huebsch", symptom: "ประตูล็อกไม่ลง" }],
    });
    const id2 = wo2.orders ? wo2.orders[0].id : wo2.id;
    if (!id2) throw new Error(`เปิดใบที่สองไม่สำเร็จ: ${JSON.stringify(wo2).slice(0, 200)}`);
    ids.push(id2);
    const s2 = fxPart(id2, "BOARD");
    await call(S, "POST", `/work-orders/${id2}/parts`, { needsParts: true, parts: [{ sparePartId: s2, quantity: 1 }] });
    await call(A, "POST", `/work-orders/${id2}/parts-sourcing`, { results: [{ sparePartId: s2, inStock: true, warehouse: "คลังลาดพร้าว 94" }] });
    await call(S, "POST", `/work-orders/${id2}/assign`, { team, scheduledAt: visitDay(12) });
    await call(A, "POST", `/work-orders/${id2}/parts-check`, {
      results: [{ sparePartId: s2, inStock: true, warehouse: "คลังลาดพร้าว 94", requisitionNo: `RQ-CS${suf}` }],
    });
    await call(A, "POST", `/work-orders/${id2}/confirm-appointment`, {});
    await call(S, "POST", `/work-orders/${id2}/dispatch`, {});
    if (sql(`select status from "WorkOrder" where id=${id2}`) !== "IN_PROGRESS") throw new Error("เตรียมใบที่สองไม่ถึงขั้นเข้างาน");
    const code2 = sql(`select code from "WorkOrder" where id=${id2}`);
    const name2b = sql(`select name from "SparePart" where id=${s2}`);
    const up2 = async (role, file, type, sparePartId) => {
      const form = new FormData();
      form.append("file", new Blob([fs.readFileSync(file)], { type }), path.basename(file));
      form.append("role", role);
      if (sparePartId) form.append("sparePartId", String(sparePartId));
      return call(T, "POST", `/work-orders/${id2}/attachments`, form);
    };
    await call(T, "POST", `/work-orders/${id2}/arrive`, {});
    for (const role of ["BEFORE", "AFTER", "NAMEPLATE", "REQUISITION"]) await up2(role, PHOTO, "image/png");
    for (const role of ["CLAIM_PART", "CLAIM_SYMPTOM"]) await up2(role, PHOTO, "image/png", s2);
    for (const role of ["CLAIM_ERROR_VIDEO", "CLAIM_CHECK_VIDEO"]) await up2(role, CLIP, "video/webm", s2);
    const body2 = (keep) => {
      const b = closeBody(() => SYMPTOM);
      return {
        ...b,
        parts: [{ sparePartId: s2, quantity: 1 }],
        claims: [{ ...b.claims[0], sparePartId: s2, brokenPartCode: `OLD-${s2}`, ...(keep ? { keep: [{ flag: "ALL", note: keep }] } : {}) }],
      };
    };
    const c2 = await call(T, "POST", `/work-orders/${id2}/close`, body2());
    if (sql(`select status from "WorkOrder" where id=${id2}`) !== "CLAIM_REVIEW") throw new Error(`ใบที่สองปิดพร้อมเคลมไม่ผ่าน: ${JSON.stringify(c2).slice(0, 200)}`);
    await vis(page, "ใบถัดไป →").first().click();
    await page.waitForTimeout(4500);
    const nextHead = (await page.locator('[aria-label="หน้าตรวจเคลม"]').locator("visible=true").first().innerText().catch(() => "")).trim();
    const nextCode = (nextHead.match(/^(\S+) · /) || [])[1] ?? "";
    nextCode && nextCode !== code && sql(`select status from "WorkOrder" where code='${nextCode}'`) === "CLAIM_REVIEW"
      ? pass(`"ใบถัดไป →" เปิดหน้าตรวจของใบรอตรวจเคลมใบถัดไป (${nextCode} — ฐานข้อมูลยืนยันว่ารอตรวจ)`)
      : fail(`ใบถัดไป: เปิด "${nextHead.slice(0, 120)}"`);
    await page.close();

    // ── 18) ใบที่สอง: ข้อมูลเก่า → 409 · ปิดเคลมทุกชิ้น = ปิดงาน ไม่ใช่อนุมัติ ──
    const SA = await login(`ZCRS${suf}`);
    page = await signIn(`ZCRP${suf}`);
    await openOrder(page, code2);
    const title2 = `${code2} · ${bc} สาขาทดสอบตรวจเคลม · W2 Huebsch`;
    await vis(page, title2).first().waitFor({ timeout: 15000 }).catch(() => {});
    await vis(page, "ปิดเคลม ไม่ส่งผู้ขาย").first().click();
    await page.waitForTimeout(500);
    await byLabel(page, "ปิดเคลม ไม่ส่งผู้ขาย").first().getByText("หมดประกัน", { exact: true }).click();
    await page.waitForTimeout(400);
    const dropAll = `ปิดงาน · ปิดเคลม ไม่ส่งผู้ขาย (1 ชิ้น)`;
    const dropLabel = (await vis(page, dropAll).count()) === 1;
    await vis(page, dropAll).first().click();
    cf = await dialogText(page, "ปิดเคลม 1 ชิ้น ไม่ส่งผู้ขาย ใบงานจะปิด", FOOT_DROP);
    const cfOk = dropLabel && (await vis(page, "ปิดเคลม 1 ชิ้น ไม่ส่งผู้ขาย ใบงานจะปิด").count()) === 1 &&
      cf.includes(`${name2b} — ปิดเคลม ไม่ส่งผู้ขาย (หมดประกัน)`) && cf.includes(FOOT_DROP) &&
      !cf.includes("อนุมัติ") && (await vis(page, "ยืนยันปิดงาน").count()) === 1 && (await vis(page, "ยืนยันอนุมัติ").count()) === 0;
    cfOk
      ? pass(`ปิดเคลมทุกชิ้น: ปุ่ม "${dropAll}" → ยืนยัน "ปิดเคลม 1 ชิ้น ไม่ส่งผู้ขาย ใบงานจะปิด" · "ไม่มีชิ้นที่ส่งผู้ขาย — ไม่ออกใบเคลม" · ปุ่ม "ยืนยันปิดงาน" ไม่มีคำว่าอนุมัติ`)
      : fail(`ยืนยันปิดเคลมทุกชิ้น: ปุ่ม=${dropLabel} · กล่อง "${cf.slice(0, 300)}"`);
    await page.screenshot({ path: path.join(DIR, "claim-review-11-decline-all.png") });
    // ระหว่างกล่องยืนยันเปิดค้าง: Super Admin ตีกลับ แล้วช่างส่งใหม่ — แถวที่หน้าจอถืออยู่ไม่ใช่แถวรอตรวจแล้ว
    const oldRow = sql(`select id from "PartClaim" where "workOrderId"=${id2} and status='PENDING'`);
    await call(SA, "POST", `/work-orders/${id2}/claim-review`, { decisions: [{ claimId: Number(oldRow), verdict: "REJECT", reason: "ภาพมืด ถ่ายใหม่" }] });
    await call(T, "POST", `/work-orders/${id2}/close`, body2("ภาพชัดพอ เห็นรหัสบนสติกเกอร์"));
    const newRow = sql(`select coalesce(max(id),0) from "PartClaim" where "workOrderId"=${id2} and status='PENDING'`);
    await vis(page, "ยืนยันปิดงาน").first().click();
    await vis(page, /โหลดข้อมูลล่าสุดให้แล้ว/).first().waitFor({ timeout: 10000 }).catch(() => {});
    const rows2 = () => sql(`select string_agg(status||':'||coalesce("rejectReason",''),',' order by id) from "PartClaim" where "workOrderId"=${id2}`);
    Number(newRow) > Number(oldRow) && (await vis(page, /โหลดข้อมูลล่าสุดให้แล้ว/).count()) > 0 &&
      rows2() === "REJECTED:ภาพมืด ถ่ายใหม่,PENDING:" && sql(`select status from "WorkOrder" where id=${id2}`) === "CLAIM_REVIEW"
      ? pass("ตัดสินด้วยข้อมูลเก่า (มีคนตีกลับและช่างส่งใหม่ไปแล้ว): เซิร์ฟเวอร์ตอบ 409 หน้าจอโหลดใบใหม่พร้อมเหตุผล ไม่มีอะไรถูกเขียนทับ (ฐานข้อมูล)")
      : fail(`409: แถวใหม่ ${newRow} (เดิม ${oldRow}) · แจ้งเตือน ${await vis(page, /โหลดข้อมูลล่าสุดให้แล้ว/).count()} · ${rows2()}`);
    await page.waitForTimeout(2500);
    (await vis(page, `รอบ 2 · รอ 0 วัน`).count()) === 1 && (await vis(page, `${name2b} · ● รอตัดสิน`).count()) === 1
      ? pass("หลังโหลดใหม่: หน้าตรวจขึ้นรอบที่ช่างส่งใหม่ \"รอบ 2 · รอ 0 วัน\" แท็บกลับเป็น \"● รอตัดสิน\"")
      : fail(`หลังโหลดใหม่: รอบ 2 ${await vis(page, "รอบ 2 · รอ 0 วัน").count()} · แท็บ ${await vis(page, `${name2b} · ● รอตัดสิน`).count()}`);
    await vis(page, "ปิดเคลม ไม่ส่งผู้ขาย").first().click();
    await page.waitForTimeout(500);
    await byLabel(page, "ปิดเคลม ไม่ส่งผู้ขาย").first().getByText("หมดประกัน", { exact: true }).click();
    await page.waitForTimeout(400);
    await vis(page, dropAll).first().click();
    await vis(page, "ยืนยันปิดงาน").first().waitFor({ timeout: 10000 }).catch(() => {});
    await vis(page, "ยืนยันปิดงาน").first().click();
    await page.waitForTimeout(4000);
    const last2 = sql(`select action from "WorkOrderLog" where "workOrderId"=${id2} order by id desc limit 1`);
    sql(`select status from "WorkOrder" where id=${id2}`) === "DONE" && rows2() === "REJECTED:ภาพมืด ถ่ายใหม่,DECLINED:หมดประกัน" && last2 === "CLAIM_DECLINED"
      ? pass("ปิดเคลมทุกชิ้นแล้ว: ใบปิด · แถวปิดเคลมพร้อมเหตุผล \"หมดประกัน\" · ประวัติ CLAIM_DECLINED (ฐานข้อมูล)")
      : fail(`ปิดเคลมทุกชิ้น: ใบ ${sql(`select status from "WorkOrder" where id=${id2}`)} · ${rows2()} · ประวัติ ${last2}`);
    const done2 = (await byLabel(page, "ผลการตรวจเคลม").first().innerText().catch(() => "")).replace(/\s+/g, " ");
    done2.includes("✓ ปิดงานแล้ว · ปิดเคลม ไม่ส่งผู้ขาย") && done2.includes("ปิดเคลม ไม่ส่งผู้ขาย 1 ชิ้น") && !done2.includes("อนุมัติ") &&
      done2.includes(`– ${name2b} — ปิดเคลม ไม่ส่งผู้ขาย (หมดประกัน)`)
      ? pass("สรุป \"✓ ปิดงานแล้ว · ปิดเคลม ไม่ส่งผู้ขาย\" ไม่มีคำว่าอนุมัติ + ชิ้นที่ปิดพร้อมเหตุผล")
      : fail(`สรุปปิดเคลมทุกชิ้น: "${done2.slice(0, 300)}"`);
    await page.screenshot({ path: path.join(DIR, "claim-review-12-declined-done.png"), fullPage: true });
    await page.close();
  } catch (e) {
    fail(String(e));
  } finally {
    for (const id of ids) await call(A, "DELETE", `/work-orders/${id}`);
    const list = users.map((u) => `'${u}'`).join(",");
    sql(`delete from "Machine" where "branchId" in (select id from "Branch" where code='${bc}');
         delete from "Branch" where code='${bc}';
         delete from "ViewAsLog" where "byUserId" in (select id from "User" where "employeeCode" in (${list}))
           or "targetUserId" in (select id from "User" where "employeeCode" in (${list}));
         delete from "User" where "employeeCode" in (${list});
         update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
    ids.length && sql(`select count(*) from "WorkOrder" where id in (${ids.join(",")})`) === "0"
      ? pass("ลบข้อมูลทดสอบแล้ว (ฐานข้อมูล: ไม่มีใบทดสอบค้าง)")
      : ids.length && fail("ใบทดสอบยังค้างในฐานข้อมูล");
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
