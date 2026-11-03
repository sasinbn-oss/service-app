// เตรียมใบงานให้เทสต์ผ่านเบราว์เซอร์ผ่าน API — เทสต์รุ่นแรกผูกกับเลขใบงานของฐานข้อมูลเครื่องหนึ่ง
// (WO-00656 ฯลฯ) ซึ่งไม่มีในเครื่องอื่น เทสต์จึง "พัง" ทั้งที่แอปไม่ได้ผิด
// ต้องมี DATABASE_URL (โหลดจาก backend/.env) เพราะต้องหาสาขาตามวันเปิดร้าน และคืนค่าภาคของ S001
const { execSync, execFileSync } = require("child_process");
const path = require("path");
const API = "http://localhost:4000/api";

// ส่งคำสั่งทาง stdin ไม่ใช่ -c — รหัสผ่านที่แฮชแล้วมี $ ซึ่ง shell จะกินไปเงียบ ๆ
const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();

/**
 * id อะไหล่ทดสอบที่ตรงยี่ห้อเครื่องของใบ orderId — kind = "BOARD" | "BELT" (ข้อตกลงเต็มอยู่หัวไฟล์ tests/lib/fixture-parts.sh)
 * Oasis และใบที่ไม่มีเครื่อง = SP-BOARD/SP-BELT · ยี่ห้ออื่นได้ตัวแฝด -HB/-HA/-MT/-SZ/-OT ("HB" เดี่ยว ๆ = Huebsch · Spinz = -SZ)
 * เครื่องที่ยังไม่รู้ยี่ห้อเลยถูกตั้ง model='Haier' ถาวร (ผลเหมือนไม่รู้ยี่ห้อทุกกฎที่มีตอนนี้ — เหตุผลอยู่ในไฟล์นั้น)
 *
 * เรียก fx_part ตัวเดียวกับเทสต์ API ไม่ได้เขียน SQL ซ้ำที่นี่ — กฎจับคู่ยี่ห้อต้องตรงกับ brandFileOf ของแอป
 * ถ้ามีสองชุด วันหนึ่งจะแก้ชุดเดียวแล้วเทสต์เบราว์เซอร์กับเทสต์ API ได้อะไหล่คนละตัวจากใบเดียวกัน
 * ผิดพลาด (ไม่มีใบ · ยังไม่ได้รัน seed:test · ตัวแฝดยังไม่อยู่ในไฟล์ยี่ห้อ = seed ไว้ก่อน migrate — migrate แล้ว seed:test ใหม่)
 * โยน error พร้อมเหตุผล — ไม่คืนค่าว่างให้เทสต์ไปพังไกลจากต้นเหตุ
 */
const FIXTURE_PARTS_SH = path.join(__dirname, "..", "lib", "fixture-parts.sh");
function fxPart(orderId, kind) {
  const out = execFileSync("bash", ["-c", '. "$0" && fx_part "$1" "$2"', FIXTURE_PARTS_SH, String(orderId), String(kind)], {
    stdio: ["ignore", "pipe", "inherit"],
  }).toString().trim();
  if (!/^\d+$/.test(out)) throw new Error(`fxPart(${orderId}, ${kind}): ได้ "${out}" ไม่ใช่ id อะไหล่`);
  return Number(out);
}

async function login(code) {
  const res = await fetch(API + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeCode: code, password: "test1234" }),
  });
  return (await res.json()).token;
}

/**
 * วันนัด n วันจากวันนี้ (เวลาไทย) — เซิร์ฟเวอร์ไม่รับวันนัดย้อนหลัง (pastVisitText · ต.ค. 69)
 * วันตายตัวอย่าง "2026-11-10" ใช้ได้แค่จนถึงวันนั้น แล้วเทสต์พังทั้งที่แอปไม่ได้ผิด
 * คิดแบบเดียวกับ todayBkk ของแอป — ปฏิทินขีดฆ่าวันที่ก่อน "วันนี้" ตัวเดียวกันนี้
 */
function visitDay(n = 0) {
  return new Date(Date.now() + 7 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);
}

async function call(token, method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({}));
}

/**
 * เปิดใบงานที่สาขา branchCode แล้วให้หัวหน้าภาคระบุอะไหล่ (parts = [{sparePartId, quantity}])
 * parts = null คือหยุดไว้ที่ขั้นระบุอะไหล่ ให้เทสต์เดินขั้นนั้นเอง
 * หัวหน้าภาค S001 ถูกย้ายไปภาคของสาขานั้นชั่วคราว — เรียก cleanup() คืนค่าเดิมเสมอ
 */
async function setup() {
  const A = await login("A001");
  const oldRegion = sql(`select coalesce(region,'') from "User" where "employeeCode"='S001'`);
  const created = [];
  let S = null;
  const part = (code) => Number(sql(`select id from "SparePart" where "partCode"='${code}'`));
  async function workOrder(branchCode, parts) {
    const region = sql(`select coalesce(region,'') from "Branch" where code='${branchCode}'`);
    sql(`update "User" set region=nullif('${region}','') where "employeeCode"='S001'`);
    S = await login("S001");
    const wo = await call(A, "POST", "/work-orders", {
      branchCode, jobType: "CM", priority: "NORMAL",
      contactName: "คุณทดสอบ", contactPhone: "081-234-5678",
      machines: [{ code: "W77", model: "Oasis", symptom: "ทดสอบหน้าจอ (สร้างโดยเทสต์)" }],
    });
    const id = wo.orders ? wo.orders[0].id : wo.id;
    created.push(id);
    if (parts) await call(S, "POST", `/work-orders/${id}/parts`, parts.length ? { needsParts: true, parts } : { needsParts: false });
    return { id, code: sql(`select code from "WorkOrder" where id=${id}`) };
  }
  /**
   * แอดมินเช็คอะไหล่ว่ามีครบทุกตัวที่ยังไม่เบิก (นัดลูกค้าก่อนเบิก ต.ค. 69 — ทุกใบที่ใช้อะไหล่ผ่านขั้นนี้)
   * คลัง 94 = ไม่ต้องโอน · ส่งคลังอื่นมาได้ถ้าเทสต์อยากให้ต้องโอน (หัวหน้าภาคเบิก/โอนก่อนคอนเฟิร์มลูกค้า)
   */
  async function source(id, warehouse = "คลังลาดพร้าว 94") {
    const d = await call(A, "GET", `/work-orders/${id}`);
    const results = d.waitingParts
      .filter((p) => !p.requisitionNo)
      .map((p) => ({ sparePartId: p.sparePartId, inStock: true, ...(p.offCatalog ? {} : { warehouse }) }));
    return call(A, "POST", `/work-orders/${id}/parts-sourcing`, { results });
  }
  /**
   * หัวหน้าภาคนัดวัน (ทีมประจำสาขา) อย่างเดียว — ไม่คอนเฟิร์มลูกค้าให้แล้ว
   * สายงานใหม่ (ต.ค. 69 รอบสอง) เบิกก่อนแล้วค่อยโทรคอนเฟิร์ม ใบที่ยังไม่เบิกจึงไปขั้นเบิก (PARTS_REQUESTED)
   * ใบที่เบิกครบแล้ว/ไม่ใช้อะไหล่ไปขั้นคอนเฟิร์มลูกค้า — เดิม helper นี้คอนเฟิร์มต่อเลย
   * พอลำดับสลับ การคอนเฟิร์มตรงนี้โดนกันด้วย 409 เงียบ ๆ แล้วเทสต์ไปพังไกลจากต้นเหตุ
   */
  async function schedule(id, scheduledAt = visitDay(30)) {
    const d = await call(A, "GET", `/work-orders/${id}`);
    return call(S, "POST", `/work-orders/${id}/assign`, { team: d.suggestedTeam, scheduledAt });
  }
  /** แอดมินเบิกทุกตัวที่ยังไม่เบิกจากคลัง 94 (ขั้นเบิก) — ใบที่ลูกค้ายังไม่คอนเฟิร์มไปขั้นคอนเฟิร์มลูกค้า */
  async function issue(id, requisitionNo = `RQ-WEB-${id}`) {
    const d = await call(A, "GET", `/work-orders/${id}`);
    const results = d.waitingParts
      .filter((p) => !(p.inStock === true && p.requisitionNo))
      .map((p) => (p.offCatalog
        ? { sparePartId: p.sparePartId, inStock: true }
        : { sparePartId: p.sparePartId, inStock: true, warehouse: "คลังลาดพร้าว 94", requisitionNo }));
    return call(A, "POST", `/work-orders/${id}/parts-check`, { results });
  }
  /** แอดมินคอนเฟิร์มลูกค้า (ของพร้อมแล้ว) — body ว่าง = ร้านตกลงวันเดิม */
  async function confirm(id, body = {}) {
    return call(A, "POST", `/work-orders/${id}/confirm-appointment`, body);
  }
  async function cleanup() {
    for (const id of created) await call(A, "DELETE", `/work-orders/${id}`);
    sql(`update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
  }
  return { A, sql, call, login, part, fxPart, workOrder, source, schedule, issue, confirm, supervisor: () => S, cleanup };
}

module.exports = { setup, visitDay, fxPart };
