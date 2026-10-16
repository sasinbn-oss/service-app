/**
 * ข้อมูลกับตัวแอปไม่ค้างของเก่า (เจ้าของงานขอ ต.ค. 69)
 *
 * สองเรื่องที่เคยต้องกดรีเฟรชเบราว์เซอร์เอง:
 * 1. สองคนเปิดใบงานเดียวกัน อีกคนเปลี่ยนไปแล้ว อีกคนยังเห็นของเก่า (และปุ่มรีเฟรชของแอปไม่โหลดหน้าใบงาน)
 * 2. merge รุ่นใหม่แล้ว คนที่เปิดเว็บค้างไว้ยังใช้โค้ดชุดเก่า — ส่งข้อมูลแบบเก่ามาให้เซิร์ฟเวอร์ใหม่
 *
 * ที่นี่เก็บของกลางที่ทั้งสองเรื่องใช้: นับหน้าต่างที่เปิดอยู่ (มีฟอร์มค้าง = ห้ามโหลดทับ / รีเฟรชทั้งหน้า)
 * และสัญญาณ "ใบงานนี้ข้อมูลเก่าแล้ว" จากคำตอบ 409 ของเซิร์ฟเวอร์
 */

// ── หน้าต่าง (AppModal) ที่เปิดอยู่ ──
let openModals = 0;
const modalListeners = new Set<(n: number) => void>();

export function modalOpened(): () => void {
  openModals += 1;
  modalListeners.forEach((l) => l(openModals));
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    openModals = Math.max(0, openModals - 1);
    modalListeners.forEach((l) => l(openModals));
  };
}

/** มีฟอร์ม/หน้าต่างเปิดค้างอยู่ไหม — มี = คนกำลังกรอกอะไรอยู่ ห้ามโหลดทับ */
export function anyModalOpen() {
  return openModals > 0;
}

export function subscribeModals(listener: (n: number) => void): () => void {
  modalListeners.add(listener);
  return () => modalListeners.delete(listener);
}

// ── ใบงานที่เซิร์ฟเวอร์บอกว่าข้อมูลที่หน้าจอถืออยู่เก่าแล้ว (409) ──
const staleListeners = new Set<(id: number, message: string | null) => void>();

export function notifyWorkOrderStale(id: number, message: string | null) {
  staleListeners.forEach((l) => l(id, message));
}

export function subscribeWorkOrderStale(listener: (id: number, message: string | null) => void): () => void {
  staleListeners.add(listener);
  return () => staleListeners.delete(listener);
}

/** แท็บกำลังเปิดดูอยู่ไหม — แท็บที่ซ่อนไม่ต้องถามเซิร์ฟเวอร์ (ประหยัดเน็ตและเซิร์ฟเวอร์ Render ฟรี) */
export function pageVisible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

/** เรียกทุกครั้งที่กลับมาเปิดแท็บ (เว็บ) — มือถือไม่มีเหตุการณ์นี้ ใช้แค่รอบเวลา */
export function onPageShown(listener: () => void): () => void {
  if (typeof document === "undefined") return () => undefined;
  const h = () => {
    if (document.visibilityState === "visible") listener();
  };
  document.addEventListener("visibilitychange", h);
  return () => document.removeEventListener("visibilitychange", h);
}
