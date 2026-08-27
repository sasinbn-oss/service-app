import { NextFunction, Request, Response } from "express";
import { verifyToken, TokenPayload } from "../utils/jwt";

export interface AuthRequest extends Request {
  auth?: TokenPayload;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  const token = header.slice("Bearer ".length);
  try {
    req.auth = verifyToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  /**
   * บัญชีที่ยังใช้รหัสตั้งต้นอยู่ ทำได้อย่างเดียวคือเปลี่ยนรหัส
   *
   * กันที่นี่ ไม่ใช่แค่ซ่อนหน้าจอ เพราะหน้าจอที่ซ่อนไว้ยังเรียก API ตรงๆ ได้
   * รหัสตั้งต้นผ่านมือแอดมินมาแล้ว จะให้ใช้งานจริงทั้งที่คนอื่นรู้รหัสไม่ได้
   */
  if (req.auth.mustChangePassword && !ALLOWED_WHILE_LOCKED.has(req.path)) {
    return res.status(423).json({
      error: "ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน",
      mustChangePassword: true,
    });
  }

  next();
}

/** เส้นทางที่ยังเรียกได้ทั้งที่ยังไม่เปลี่ยนรหัส — พอให้เปลี่ยนรหัสได้และรู้ว่าตัวเองเป็นใคร */
const ALLOWED_WHILE_LOCKED = new Set(["/change-password", "/me"]);

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.auth?.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
