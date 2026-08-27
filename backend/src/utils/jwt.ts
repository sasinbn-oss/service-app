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
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}
