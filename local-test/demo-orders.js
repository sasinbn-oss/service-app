/**
 * ใบงานตัวอย่างของระบบทดสอบ — อย่างน้อยหนึ่งใบต่อหนึ่งขั้น ทีมจะได้ลองกดได้ทุกตำแหน่งทันที
 *
 * สร้างผ่าน API (ไม่ใส่ตรงลงฐานข้อมูล) ให้ทุกใบเดินตามกฎของระบบจริง — ใบที่ใส่เองข้ามกฎ
 * จะได้ประวัติ/สถานะที่ระบบจริงไม่มีวันสร้าง แล้วทีมไปเจอบั๊กที่ไม่มีอยู่จริง
 *
 * ข้ามเองเมื่อ: กู้ข้อมูลจากไฟล์สำรอง (ไม่มีบัญชี A001) หรือมีใบงานอยู่แล้ว (เปิดระบบรอบที่สอง)
 */
const fs = require("fs");
const path = require("path");

const API = process.env.API || "http://backend:4000/api";
const FILES = path.join(__dirname, "demo-files");

async function call(token, method, url, body) {
  const r = await fetch(API + url, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status} ${text.slice(0, 200)}`);
  return data;
}
async function login(code) {
  const r = await fetch(API + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeCode: code, password: "test1234" }),
  });
  return r.ok ? r.json() : null;
}
async function upload(token, id, file, role, mime = "image/jpeg", sparePartId) {
  const fd = new FormData();
  fd.append("file", new Blob([fs.readFileSync(path.join(FILES, file))], { type: mime }), file);
  fd.append("role", role);
  if (sparePartId) fd.append("sparePartId", String(sparePartId));
  const r = await fetch(`${API}/work-orders/${id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
  if (!r.ok) throw new Error(`upload ${file} ${role} → ${r.status} ${await r.text()}`);
}
const day = (n) => new Date(Date.now() + 7 * 3600e3 + n * 864e5).toISOString().slice(0, 10);

(async () => {
  // backend อาจยังเริ่มไม่เสร็จ (migrate + seed ครั้งแรก) — รอสูงสุด 5 นาที
  let a = null;
  for (let i = 0; i < 100; i++) {
    try {
      const h = await fetch(API.replace(/\/api$/, "") + "/health");
      if (h.ok) {
        a = await login("A001");
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!a) return console.log("ไม่มีบัญชี A001 (กู้จากไฟล์สำรอง) — ไม่สร้างใบงานตัวอย่าง");
  const A = a.token;
  const existing = await call(A, "GET", "/work-orders?status=ALL");
  if ((existing.rows ?? existing).length) return console.log("มีใบงานอยู่แล้ว — ไม่สร้างใบงานตัวอย่างซ้ำ");

  const S = (await login("S001")).token;
  const t = await login("T001");
  const T = t.token;
  const T001 = t.user.id;
  const parts = await call(A, "GET", "/spare-parts");
  const P = (code) => (parts.rows ?? parts).find((p) => p.partCode === code).id;
  const BOARD = P("SP-BOARD"), BELT = P("SP-BELT"), MOTOR = P("SP-MOTOR"), LOCK = P("SP-DOORLOCK");

  async function wo(branchCode, machine, symptom, urgent = false) {
    const r = await call(A, "POST", "/work-orders", {
      branchCode, jobType: "CM", priority: urgent ? "URGENT" : "NORMAL",
      contactName: "คุณสมหญิง (ผู้จัดการสาขา)", contactPhone: "081-234-5678",
      machines: [{ code: machine, model: "Huebsch", symptom }],
    });
    return r.orders ? r.orders[0].id : r.id;
  }
  const need = (id, list) => call(S, "POST", `/work-orders/${id}/parts`, list.length ? { needsParts: true, parts: list.map((p) => ({ sparePartId: p, quantity: 1 })) } : { needsParts: false });
  const check94 = (id, list, rq) => call(A, "POST", `/work-orders/${id}/parts-check`, { results: list.map((p) => ({ sparePartId: p, inStock: true, warehouse: "คลังลาดพร้าว 94", requisitionNo: rq })) });
  const toTeam = (id, d, time = null) => call(S, "POST", `/work-orders/${id}/assign`, { team: "กรุงเทพ", scheduledAt: d, scheduledTime: time });
  const goOut = async (id) => { await call(A, "POST", `/work-orders/${id}/confirm-appointment`, {}); await call(S, "POST", `/work-orders/${id}/dispatch`, {}); };

  // หัวหน้าภาคระบุอะไหล่
  await wo("C0001", "W3", "ประตูล็อกไม่ลง หน้าจอขึ้น Error E dL ลูกค้าใช้งานไม่ได้", true);
  await wo("C0001", "W5", "เครื่องไม่ปั่นหมาด ผ้าเปียกมาก มีเสียงดังตอนปั่น");
  // ตรวจหน้างาน: แอดมินนัดร้าน → หัวหน้าภาคส่งช่าง → ช่างตรวจ
  let id = await wo("D0012", "W2", "น้ำรั่วใต้เครื่อง ยังไม่ทราบสาเหตุ");
  await call(S, "POST", `/work-orders/${id}/inspect-request`, { team: "กรุงเทพ", scheduledAt: day(2), scheduledTime: "10:00" });
  id = await wo("C0001", "W63", "มีกลิ่นไหม้ตอนเครื่องทำงาน");
  await call(S, "POST", `/work-orders/${id}/inspect-request`, { team: "กรุงเทพ", scheduledAt: day(0), scheduledTime: "09:30" });
  await goOut(id);
  // เสนอราคา (แฟรนไชส์หมดประกัน): เช็คอะไหล่ → ส่งใบเสนอราคา → แนบบิลรับเงิน
  id = await wo("D0011", "W1", "สายพานขาด เครื่องหมุนแต่ถังไม่หมุน");
  await need(id, [BELT]);
  id = await wo("D0011", "W2", "บอร์ดควบคุมเสีย หน้าจอไม่ติด");
  await need(id, [BOARD]);
  await call(A, "POST", `/work-orders/${id}/parts-sourcing`, { results: [{ sparePartId: BOARD, inStock: true }] });
  id = await wo("D0011", "W3", "มอเตอร์ปั่นหมาดมีเสียงดัง");
  await need(id, [MOTOR]);
  await call(A, "POST", `/work-orders/${id}/parts-sourcing`, { results: [{ sparePartId: MOTOR, inStock: true }] });
  await upload(A, id, "quote.pdf", "QUOTE", "application/pdf");
  await call(A, "POST", `/work-orders/${id}/quote`, {});
  // อะไหล่หมด (ขึ้นในรายงานอะไหล่หมด)
  id = await wo("D0011", "W4", "ลูกปืนแตก ถังสั่นแรง");
  await need(id, [BELT, MOTOR]);
  await call(A, "POST", `/work-orders/${id}/parts-sourcing`, { results: [{ sparePartId: BELT, inStock: false }, { sparePartId: MOTOR, inStock: false }] });
  // เบิกอะไหล่ / โอนข้ามคลัง
  id = await wo("C0001", "W71", "ประตูปิดไม่สนิท ล็อกประตูหัก");
  await need(id, [LOCK, BELT]);
  id = await wo("C0001", "W77", "บอร์ดควบคุมไหม้ หลังไฟตก");
  await need(id, [BOARD]);
  await call(A, "POST", `/work-orders/${id}/parts-check`, { results: [{ sparePartId: BOARD, inStock: true, warehouse: "คลังขอนแก่น" }], pickupNote: "ของมีที่ขอนแก่น 2 ชิ้น" });
  // จ่ายงาน → คอนเฟิร์มลูกค้า → ปล่อยงาน → ช่างเข้างาน
  id = await wo("C0001", "W99", "สายพานหย่อน ถังหมุนช้า");
  await need(id, [BELT]); await check94(id, [BELT], "RQ-6905");
  id = await wo("C0001", "W1", "เครื่องไม่รับเหรียญ");
  await need(id, []); await toTeam(id, day(1), "10:00");
  id = await wo("C0001", "W2", "น้ำไม่เข้าเครื่อง");
  await need(id, []); await toTeam(id, day(0), "13:00"); await call(A, "POST", `/work-orders/${id}/confirm-appointment`, {});
  id = await wo("D0012", "W5", "ประตูล็อกไม่ลง ขึ้น Error E dL", true);
  await need(id, [LOCK]); await check94(id, [LOCK], "RQ-6907"); await toTeam(id, day(0), "09:00"); await goOut(id);
  id = await wo("C0001", "W31", "เครื่องอบไม่ร้อน");
  await need(id, []); await toTeam(id, day(0), "15:00"); await goOut(id);
  // รอตรวจเคลม (Admin Spare Part)
  id = await wo("D0012", "W3", "บอร์ดควบคุมเสีย ประตูล็อกไม่ลง");
  await need(id, [BOARD]); await check94(id, [BOARD], "RQ-6903"); await toTeam(id, day(-1)); await goOut(id);
  for (const [f, r] of [["before.jpg", "BEFORE"], ["after.jpg", "AFTER"], ["nameplate.jpg", "NAMEPLATE"], ["slip.jpg", "REQUISITION"]]) await upload(T, id, f, r);
  for (const [f, r, m] of [["part.jpg", "CLAIM_PART"], ["before.jpg", "CLAIM_SYMPTOM"], ["clip.mp4", "CLAIM_ERROR_VIDEO", "video/mp4"], ["clip.mp4", "CLAIM_CHECK_VIDEO", "video/mp4"]]) await upload(T, id, f, r, m, BOARD);
  const g = await call(A, "GET", `/work-orders/${id}`);
  await call(T, "POST", `/work-orders/${id}/close`, {
    result: "FIXED", note: "เปลี่ยนบอร์ดควบคุม ทดสอบเดินเครื่อง 2 รอบ ปกติ", workerIds: [T001],
    parts: [{ sparePartId: BOARD, quantity: 1 }],
    claims: [{ sparePartId: BOARD, brokenPartCode: "SP-BOARD-1123", symptom: "ประตูล็อกไม่ลง ขึ้น Error E dL", checkNote: "วัดไฟเข้าบอร์ด 220V ปกติ สลับบอร์ดแล้วอาการหาย", troubleshooting: g.claimTroubleshooting }],
    claimNameplate: { fields: [{ key: "model", label: "รุ่น", value: "HL055LWHPRXG6W0000", source: "HAND" }, { key: "serial", label: "Serial", value: "2402600330", source: "HAND" }], verified: true },
    claimCheck: { errorCode: "E dL / E dL1 / E dL2", checked: ["Solenoid ไม่ฝืด"] },
  });
  // ปิดแล้ว — ให้ประวัติ/รายงานมีข้อมูล
  for (const [m, s] of [["W32", "ปุ่มกดหน้าเครื่องไม่ทำงาน"], ["W98", "ท่อน้ำทิ้งตัน"]]) {
    id = await wo("C0001", m, s); await need(id, []); await toTeam(id, day(-2)); await goOut(id);
    await upload(T, id, "before.jpg", "BEFORE"); await upload(T, id, "after.jpg", "AFTER"); await upload(T, id, "nameplate.jpg", "NAMEPLATE");
    await call(T, "POST", `/work-orders/${id}/close`, { result: "FIXED", note: "ล้างท่อและทดสอบแล้ว ใช้งานได้ปกติ", workerIds: [T001], parts: [] });
  }
  const all = await call(A, "GET", "/work-orders?status=ALL");
  console.log(`สร้างใบงานตัวอย่างแล้ว ${(all.rows ?? all).length} ใบ`);
})().catch((e) => {
  console.error("สร้างใบงานตัวอย่างไม่สำเร็จ:", e.message);
  process.exit(1);
});
