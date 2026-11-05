// ล้างใบงานที่เทสต์เบราว์เซอร์สร้างให้หายจริง — ตัวเดียวกับ tests/lib/purge-orders.sh (อ่านเหตุผลเต็มที่นั่น)
//
// ถังขยะใบงาน (4 พ.ย. 69): DELETE /work-orders/:id ตอนนี้แค่ย้ายไปถังขยะ และต้องมีเหตุผล — DELETE เปล่า ๆ แบบเดิมได้ 400
// แล้วใบงานของเทสต์ค้างอยู่ในฐานข้อมูลเงียบ ๆ ทุกรอบ · ลบจริงต้องเป็น Super Admin (ไม่มีในบัญชีทดสอบ) หรือรอครบ 30 วัน
// ตัวนี้จึงเดินทางเดียวกับระบบจริง: ย้ายไปถังขยะด้วยเหตุผล "ใบทดสอบ" → ตั้งเวลาที่ลบย้อนไป 31 วัน → เปิดหน้าถังขยะ
// (GET /work-orders/trash ลบใบที่ครบกำหนดทีละ 5 ใบ ด้วยขั้นตอนเดียวกับรอบชั่วโมง — ไฟล์ในที่เก็บไฟล์จำลองถูกลบด้วย)
// ต้องมี DATABASE_URL (โหลดจาก backend/.env แบบเทสต์เบราว์เซอร์อื่น)
const { execSync } = require("child_process");
const API = "http://127.0.0.1:4000/api";

// ส่งคำสั่งทาง stdin ไม่ใช่ -c — แบบเดียวกับ fixture.js
const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();

/** token = แอดมิน (A001) · ids = id ใบงาน (ค่าว่าง/ไม่ใช่ตัวเลขข้ามให้) — ไม่โยน error: เรียกจาก finally ของเทสต์ */
async function purgeOrders(token, ids) {
  const list = [...new Set((ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!list.length) return;
  try {
    for (const id of list) {
      await fetch(`${API}/work-orders/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "TEST", note: "ล้างข้อมูลเทสต์" }),
      }).catch(() => undefined);
    }
    // เวลา UTC ไม่มีโซน แบบที่ Prisma เขียน — now() เฉย ๆ เลื่อนตามโซนของ session
    sql(`update "WorkOrder" set "deletedAt" = timezone('utc', now()) - interval '31 days'
         where id in (${list.join(",")}) and "deletedAt" is not null`);
    for (let i = 0; i < 20; i++) {
      if (sql(`select count(*) from "WorkOrder" where id in (${list.join(",")})`) === "0") return;
      await fetch(`${API}/work-orders/trash`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
    }
    console.log(`purgeOrders: ยังเหลือใบงาน ${sql(`select string_agg(code, ',') from "WorkOrder" where id in (${list.join(",")})`)}`);
  } catch (e) {
    console.log(`purgeOrders: ล้างใบงานของเทสต์ไม่สำเร็จ — ${e.message}`);
  }
}

module.exports = { purgeOrders };
