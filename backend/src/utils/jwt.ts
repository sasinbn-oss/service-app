import jwt from "jsonwebtoken";
import { Role } from "./constants";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export interface TokenPayload {
  userId: number;
  role: Role;
  /**
   * true = โทเคนนี้ใช้ได้แค่เปลี่ยนรหัสผ่าน
   *
   * ติดไว้ในโทเคนแทนการอ่านฐานข้อมูลทุก request เพราะทุกหน้าจอเรียก API
   * และการเพิ่มคิวรีต่อ request เพื่อเช็คธงเดียวไม่คุ้ม
   *
   * พอเปลี่ยนรหัสเสร็จ ระบบออกโทเคนใหม่ให้ทันที ไม่ต้องล็อกอินซ้ำ
   */
  mustChangePassword?: boolean;
  /**
   * ตั้งโดย requireAuth เมื่อโทเคนเป็น SUPER_ADMIN (role ถูกมองเป็น ADMIN แทน)
   * ไม่ได้อยู่ในโทเคนจริง
   */
  superAdmin?: boolean;
  /** ตั้งโดย requireAuth เมื่อโทเคนเป็น PARTS_ADMIN (role ถูกมองเป็น ADMIN แทน) — ไม่ได้อยู่ในโทเคนจริง */
  partsAdmin?: boolean;
  /**
   * โทเคน "ดูในฐานะ" ที่ Super Admin ขอไว้ดูหน้าจอของคนอื่น — userId คือคนที่ถูกดู
   * by = Super Admin ตัวจริง · logId = แถวใน ViewAsLog ที่จะปิดตอนเลิกดู
   * ดูได้อย่างเดียว (requireAuth กันคำขอที่แก้ข้อมูล) และอายุสั้นกว่าโทเคนปกติมาก
   */
  viewAs?: { by: number; logId: number };
  /** เวลาหมดอายุ (วินาที) ที่ jsonwebtoken ใส่ให้เอง */
  exp?: number;
  /** เวลาที่ออกโทเคน (วินาที) — ใส่ให้เอง · ใช้ตัดโทเคนที่ออกก่อนเปลี่ยนรหัสผ่าน */
  iat?: number;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

/** โทเคนดูในฐานะ — 1 ชั่วโมงพอสำหรับไล่ดูหน้าจอ ลืมกดกลับก็หมดเอง ไม่ค้างเป็นคนอื่นทั้งเดือน */
export function signViewAsToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

/** อ่านเนื้อโทเคนโดยไม่ตรวจลายเซ็น — ใช้แค่ดูว่าโทเคนที่หมดอายุเป็นแบบดูในฐานะหรือไม่ */
export function peekToken(token: string): TokenPayload | null {
  return jwt.decode(token) as TokenPayload | null;
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}
