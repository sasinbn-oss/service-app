/**
 * ตั๋วดาวน์โหลด zip หลักฐานเคลม — เก็บแค่ "ใบงานไหน · ใครขอ · กุญแจ" ไม่เก็บตัวไฟล์
 *
 * ทำไมไม่ใช้ที่พักเอกสาร (store.ts) แบบใบเคลม PDF: ที่นั่นเป็นหน่วยความจำก้อนเดียวของทุกคน เพดานรวม 60 MB
 * เกินแล้วทิ้งไฟล์ที่เก่าสุด — zip รูปหลักฐานใบเดียวหลายสิบ MB จะเบียดลิงก์ Excel/PDF ที่คนอื่นเพิ่งสั่งให้หายเงียบ ๆ
 * zip จึงสร้างใหม่ตอนกดดาวน์โหลดทุกครั้ง แล้วไหลออกไปทีละไฟล์ (ดู GET /work-orders/claims/evidence-zip/:ticket)
 * ตั๋วมีไว้เพราะเบราว์เซอร์ที่แอปส่งลิงก์ไปเปิด แนบ Authorization header เองไม่ได้ — กุญแจในลิงก์คือสิทธิ์ (แบบ store.ts)
 *
 * อยู่ในหน่วยความจำ ไม่ลงฐานข้อมูล: อายุสั้น เซิร์ฟเวอร์รีสตาร์ทแล้วตั๋วหาย = กดดาวน์โหลดใหม่ ไม่เสียอะไร
 */
import crypto from "crypto";

export interface ZipTicket {
  id: string;
  token: string;
  workOrderId: number;
  /** คนที่ขอ — เก็บไว้ดูย้อนหลังใน log ว่าใครดาวน์โหลดหลักฐานส่งผู้ขาย */
  ownerId: number;
  createdAt: number;
}

// อายุเท่าลิงก์เอกสารอื่นในระบบ ("2 ชั่วโมง" ที่คนใช้จำได้) · ตั๋วละไม่กี่สิบไบต์ 200 ใบก็ไม่ถึงหนึ่งหน้าหน่วยความจำ
const TTL_MS = 2 * 60 * 60 * 1000;
const MAX_TICKETS = 200;

const tickets = new Map<string, ZipTicket>();

function evict() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, t] of tickets) if (t.createdAt < cutoff) tickets.delete(id);
  while (tickets.size > MAX_TICKETS) {
    const oldest = tickets.keys().next().value;
    if (oldest === undefined) break;
    tickets.delete(oldest);
  }
}

export function saveZipTicket(workOrderId: number, ownerId: number): ZipTicket {
  evict();
  const t: ZipTicket = {
    id: crypto.randomBytes(9).toString("base64url"),
    token: crypto.randomBytes(24).toString("base64url"),
    workOrderId,
    ownerId,
    createdAt: Date.now(),
  };
  tickets.set(t.id, t);
  evict();
  return t;
}

/** คืนตั๋วเมื่อกุญแจตรงเท่านั้น — เทียบแบบ timing-safe ไม่ให้เดาทีละตัวอักษร (แบบ getDocument) */
export function getZipTicket(id: string, token: string): ZipTicket | null {
  evict();
  const t = tickets.get(id);
  if (!t) return null;
  const given = Buffer.from(token);
  const expected = Buffer.from(t.token);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  return t;
}

/** ลิงก์แบบ path เดียว ฝั่งแอปเติม origin ของ backend เอง (แบบ documentPath) */
export function zipTicketPath(t: ZipTicket): string {
  return `/api/work-orders/claims/evidence-zip/${t.id}?token=${t.token}`;
}
