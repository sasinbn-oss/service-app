/**
 * จำคำตอบที่ทุกเครื่องถามซ้ำบ่อยไว้สั้น ๆ ต่อคน (กระดิ่ง · รายการแชท)
 *
 * ทำไม: 7 พ.ย. 69 ระบบล่มทั้งระบบ (ล็อกอินไม่ได้ทุกบัญชี) — แถบหัวของทุกเครื่องถามกระดิ่งกับรายการแชท
 * ทุก 30 วินาทีและทุกครั้งที่เปลี่ยนหน้า ฐานข้อมูลอยู่คนละ region และ Prisma ต่อได้ 5 สาย (src/prisma.ts)
 * คำขอต่อคิวจนหมดเวลา แม้แก้แอปให้ถามห่างลงแล้ว เครื่องที่เปิดรุ่นเก่าค้างไว้ยังถามถี่เหมือนเดิมจนกว่าจะโหลดใหม่
 * ฝั่งเซิร์ฟเวอร์จึงต้องกันเอง: คำถามเดิมของคนเดิมในช่วงสั้น ๆ ตอบจากที่จำไว้ ไม่ลงฐานข้อมูล
 *
 * - เก็บเป็น Promise — คำขอที่มาพร้อมกันขณะยังคำนวณอยู่ รอคำตอบเดียวกัน ไม่ยิงฐานข้อมูลซ้ำ
 * - คำนวณพังไม่จำ (ครั้งหน้าถามใหม่)
 * - ช้าได้ไม่เกิน ttl — กระดิ่ง/ตัวเลขแชทช้าไปไม่กี่วินาทีไม่มีผลกับงาน · ที่ต้องเห็นทันที (เปิดใบ · อ่านแชท · ส่งข้อความ) ล้างทิ้งเอง
 * - หน่วยความจำของเครื่องเดียว — รันหลายเครื่องก็แค่แต่ละเครื่องจำของตัวเอง ไม่ผิด แค่ช่วยน้อยลง
 */
export function shortCache<T>(ttlMs: number) {
  const m = new Map<string, { at: number; p: Promise<T> }>();
  return {
    /** fresh = ไม่ใช้ของที่จำไว้ (เทสต์ส่ง Cache-Control: no-cache มาเพื่อเช็คผลทันทีหลังแก้ข้อมูลตรงในฐานข้อมูล) */
    get(key: string, fresh: boolean, make: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const hit = m.get(key);
      if (!fresh && hit && now - hit.at < ttlMs) return hit.p;
      const p = make();
      m.set(key, { at: now, p });
      p.catch(() => {
        if (m.get(key)?.p === p) m.delete(key);
      });
      if (m.size > 5000) for (const [k, v] of m) if (now - v.at >= ttlMs) m.delete(k);
      return p;
    },
    /** ล้างของคนเดียว (คีย์ขึ้นต้นด้วย prefix) หรือทั้งหมด */
    drop(prefix?: string) {
      if (prefix === undefined) return m.clear();
      for (const k of m.keys()) if (k.startsWith(prefix)) m.delete(k);
    },
  };
}

/** คำขอที่ขอผลสด ๆ (Cache-Control: no-cache) — แอปไม่ส่ง ใช้ในเทสต์ */
export function wantsFresh(headers: Record<string, unknown>) {
  return /no-cache/i.test(String(headers["cache-control"] ?? ""));
}
