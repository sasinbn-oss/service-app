/**
 * ข้อความบอกผลครั้งเดียวที่ส่งข้ามหน้า (เลือกอะไหล่ตอนตรวจหน้างาน ต.ค. 69) — ฟอร์มบนหน้าใบงานตั้งไว้ หน้าที่กลับไปหยิบไปแสดงครั้งเดียว
 *
 * ช่างส่งผลตรวจแล้วกลับไป "งานของฉัน" — ใบหายจากรายการทันที ถ้าไม่บอก ช่างนึกว่าส่งไม่ไป/ใบหาย (ข้อ 13)
 * หัวหน้าภาคตีกลับ/คอนเฟิร์มแล้วกลับไปกล่องงาน — การ์ดหายเหมือนกัน แถบบนสุดบอกว่าใบไปไหนต่อ
 *
 * เก็บในหน่วยความจำของแอป ไม่ใช่ route params: บนเว็บ params ไปอยู่ใน URL กดรีเฟรชแล้วกล่องเด้งกลับมาอีก
 * ทั้งที่เรื่องจบไปแล้ว · ไม่ใช่ช่องจากเซิร์ฟเวอร์: เป็นการยืนยันของคนที่เพิ่งกด เครื่องอื่นไม่ต้องเห็น และไม่ต้องมีสถานะ "ปิดแล้ว"
 * หยิบแล้วหายเลย (take) — กลับมาหน้าเดิมอีกรอบโดยไม่มีอะไรใหม่ กล่องเก่าไม่ค้าง
 */

/** หน้า "งานของฉัน" ของช่าง — ส่งผลตรวจแล้วใบออกจากงานวันนี้ (pick = เลือกอะไหล่ไปให้หัวหน้าภาคคอนเฟิร์ม) */
export type JobsFlash = { kind: "sent"; id: number; code: string; pick: boolean };

/** กล่องงานของหัวหน้าภาค/แอดมิน — เพิ่งตีกลับรายการของช่าง หรือเพิ่งคอนเฟิร์ม (label = ขั้นที่ใบไปต่อ) */
export type QueueFlash =
  | { kind: "returned"; id: number; code: string; team: string | null }
  | { kind: "confirmed"; id: number; code: string; label: string };

interface FlashMap {
  MyJobs: JobsFlash;
  MyQueue: QueueFlash;
}

const store: { [K in keyof FlashMap]?: FlashMap[K] } = {};

/** ตั้งข้อความให้หน้าที่จะกลับไป — ตั้งซ้ำทับของเดิม (เรื่องล่าสุดเรื่องเดียวที่ต้องบอก) */
export function setFlash<K extends keyof FlashMap>(screen: K, payload: FlashMap[K]) {
  store[screen] = payload;
}

/** หยิบข้อความของหน้านี้ครั้งเดียว — ไม่มี = null */
export function takeFlash<K extends keyof FlashMap>(screen: K): FlashMap[K] | null {
  const v = store[screen] as FlashMap[K] | undefined;
  delete store[screen];
  return v ?? null;
}

/**
 * ทิ้งข้อความที่ยังไม่มีใครหยิบ — เข้า/ออกระบบ และเริ่ม/เลิกดูในฐานะคนอื่น (เรียกคู่กับ clearPageCache)
 * หัวหน้าภาคคอนเฟิร์มจากหน้าใบงานแล้วออกจากระบบโดยไม่กลับกล่องงาน ข้อความค้างอยู่ในเครื่อง
 * คนถัดไปที่เข้าเครื่องเดียวกันจะเห็นแถบ "คอนเฟิร์ม … แล้ว" ของใบที่ตัวเองไม่ได้แตะ (อาจไม่ใช่ภาคของตัวเองด้วย)
 */
export function clearFlash() {
  for (const k of Object.keys(store) as (keyof FlashMap)[]) delete store[k];
}
