/**
 * ใบงานทั้งก้อนที่เซิร์ฟเวอร์ส่งกลับมาตอนกดเปลี่ยนขั้น — ให้การโหลดหน้าใบงานรอบถัดไปใช้เลย ไม่ต้องยิงถามซ้ำ
 *
 * ทุกปุ่มเปลี่ยนขั้นส่งก้อนเดียวกับ GET /work-orders/:id กลับมาอยู่แล้ว (detailFor ฝั่งเซิร์ฟเวอร์)
 * เดิมแอปทิ้งแล้วโหลดใหม่ ฐานข้อมูลอยู่ไกล เลยรอเพิ่มเกือบวินาทีกว่าทามไลน์จะขึ้น (เจ้าของงานถาม ต.ค. 69)
 * จำไว้ที่เดียวตรงนี้ (api/client.ts เรียก) แทนการแก้ทุกปุ่มที่โหลดใหม่หลังบันทึก
 *
 * ใช้ได้ครั้งเดียวและภายในไม่กี่วินาที — การโหลดถัดไปจากที่อื่น (ลากรีเฟรช คนอื่นแก้) ต้องถามเซิร์ฟเวอร์จริง
 * ก้อนที่ไม่ครบ (ไม่มีประวัติเต็ม) ไม่จำ แอปโหลดแบบเดิมเอง
 */
const FRESH_MS = 8000;
const fresh = new Map<number, { data: unknown; at: number }>();

export function rememberFresh(url: string | undefined, data: unknown) {
  const m = /^\/?work-orders\/(\d+)(\/|$)/.exec(url ?? "");
  if (!m || !data || typeof data !== "object") return;
  const d = data as { id?: unknown; logs?: unknown; rollbackPrefill?: unknown };
  // ก้อนของใบอื่น (เปิดใบต่อ คัดลอกใบทดสอบ) หรือก้อนย่อ — ไม่ใช่หน้าใบงานนี้
  if (d.id !== Number(m[1]) || !Array.isArray(d.logs) || !("rollbackPrefill" in d)) return;
  fresh.set(d.id, { data, at: Date.now() });
}

export function takeFresh<T>(id: number): T | null {
  const f = fresh.get(id);
  fresh.delete(id);
  return f && Date.now() - f.at < FRESH_MS ? (f.data as T) : null;
}
