// เตรียมใบงานให้เทสต์ผ่านเบราว์เซอร์ผ่าน API — เทสต์รุ่นแรกผูกกับเลขใบงานของฐานข้อมูลเครื่องหนึ่ง
// (WO-00656 ฯลฯ) ซึ่งไม่มีในเครื่องอื่น เทสต์จึง "พัง" ทั้งที่แอปไม่ได้ผิด
// ต้องมี DATABASE_URL (โหลดจาก backend/.env) เพราะต้องหาสาขาตามวันเปิดร้าน และคืนค่าภาคของ S001
const { execSync } = require("child_process");
const API = "http://localhost:4000/api";

// ส่งคำสั่งทาง stdin ไม่ใช่ -c — รหัสผ่านที่แฮชแล้วมี $ ซึ่ง shell จะกินไปเงียบ ๆ
const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();

async function login(code) {
  const res = await fetch(API + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeCode: code, password: "test1234" }),
  });
  return (await res.json()).token;
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
   * คลัง 94 = นัดได้ทันที · ส่งคลังอื่นมาได้ถ้าเทสต์อยากให้ต้องโอน (นัดล่วงหน้า 7 วัน)
   */
  async function source(id, warehouse = "คลังลาดพร้าว 94") {
    const d = await call(A, "GET", `/work-orders/${id}`);
    const results = d.waitingParts
      .filter((p) => !p.requisitionNo)
      .map((p) => ({ sparePartId: p.sparePartId, inStock: true, ...(p.offCatalog ? {} : { warehouse }) }));
    return call(A, "POST", `/work-orders/${id}/parts-sourcing`, { results });
  }
  /** หัวหน้าภาคนัดวัน (ทีมประจำสาขา) → แอดมินคอนเฟิร์มลูกค้า — ใบที่ยังไม่เบิกไปถึงขั้นเบิก ใบที่เบิกครบไปปล่อยงาน */
  async function schedule(id, scheduledAt = "2026-12-01") {
    const d = await call(A, "GET", `/work-orders/${id}`);
    await call(S, "POST", `/work-orders/${id}/assign`, { team: d.suggestedTeam, scheduledAt });
    return call(A, "POST", `/work-orders/${id}/confirm-appointment`, {});
  }
  async function cleanup() {
    for (const id of created) await call(A, "DELETE", `/work-orders/${id}`);
    sql(`update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
  }
  return { A, sql, call, login, part, workOrder, source, schedule, supervisor: () => S, cleanup };
}

module.exports = { setup };
