import { NextFunction, Request, Response } from "express";
import { peekToken, verifyToken, TokenPayload } from "../utils/jwt";
import { currentRole, issuedBeforePasswordChange } from "../utils/userGate";

export interface AuthRequest extends Request {
  auth?: TokenPayload;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  const token = header.slice("Bearer ".length);
  try {
    req.auth = verifyToken(token);
  } catch {
    // โทเคนดูในฐานะหมดอายุ (1 ชม.) — บอกแอปให้กลับเป็น Super Admin ไม่ใช่เด้งออกจากระบบ
    if (peekToken(token)?.viewAs) {
      return res.status(401).json({ error: "หมดเวลาดูในฐานะผู้ใช้อื่นแล้ว", viewAsEnded: true });
    }
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const viewAs = req.auth.viewAs;
  if (viewAs) {
    // คนที่ขอดูต้องยังเป็น Super Admin อยู่ — ถูกถอดสิทธิ์ระหว่างดูก็ต้องหยุดทันที ไม่ใช่รอครบชั่วโมง
    if ((await currentRole(viewAs.by)) !== "SUPER_ADMIN") {
      return res.status(401).json({ error: "สิทธิ์ดูในฐานะผู้ใช้อื่นถูกยกเลิกแล้ว", viewAsEnded: true });
    }
    /**
     * ดูได้อย่างเดียว — กันที่นี่ที่เดียวแทนการไล่ซ่อนปุ่มทุกหน้า
     * ถ้าปล่อยให้บันทึกได้ ประวัติใบงานจะขึ้นชื่อคนที่ถูกดู ทั้งที่เขาไม่ได้ทำ
     */
    const path = req.baseUrl + req.path;
    if (!READ_METHODS.has(req.method) && !ALLOWED_WHILE_VIEWING.has(path)) {
      return res.status(403).json({
        error: "กำลังดูในฐานะผู้ใช้อื่น — ดูได้อย่างเดียว แก้ไขไม่ได้",
        viewAsReadOnly: true,
      });
    }
  }

  // โทเคนยังไม่หมดอายุแต่บัญชีถูกลบไปแล้ว หรือสิทธิ์เปลี่ยนหลังเข้าระบบ (ดู utils/userGate.ts)
  const role = await currentRole(req.auth.userId);
  if (!role) {
    return res.status(401).json({ error: "บัญชีนี้ถูกลบแล้ว ติดต่อแอดมิน", accountDeleted: true });
  }
  // เปลี่ยน/รีเซ็ตรหัสผ่านแล้ว — เครื่องที่ล็อกอินไว้ก่อนหน้านั้นต้องเข้าระบบใหม่ (มือถือหาย/คนลาออก)
  // ดูในฐานะไม่เช็ค: โทเคนนั้นเป็นของ Super Admin ที่ยืมตัวตนมาดู ไม่ใช่การล็อกอินของคนที่ถูกดู
  if (!viewAs && issuedBeforePasswordChange(req.auth.userId, req.auth.iat)) {
    return res.status(401).json({ error: "รหัสผ่านของบัญชีนี้ถูกเปลี่ยน — เข้าสู่ระบบใหม่ด้วยรหัสผ่านล่าสุด", passwordChanged: true });
  }
  req.auth = { ...req.auth, role };

  // Super Admin ทำได้ทุกอย่างเท่าแอดมิน — มองเป็น ADMIN ที่นี่ที่เดียว
  // ทุกจุดที่เช็ค role === "ADMIN" (ราว 20 จุด) จึงใช้ได้ทันทีโดยไม่ต้องไล่แก้ทีละจุด
  /**
   * แอดมินอะไหล่ (Admin Spare Part) เห็นทุกอย่างเท่าแอดมิน แต่แก้ได้เฉพาะงานของตัวเอง (เจ้าของงานกำหนด ต.ค. 69):
   * ตรวจเคลมอะไหล่ · ข้อมูลอะไหล่ · งานส่วนตัวที่พนักงานทุกคนทำ (เปลี่ยนรหัส · ใช้รถ · ลงเวลา/บันทึกงาน · ขอเบิก)
   * มองเป็น ADMIN เพื่อให้อ่านได้ทุกที่ แล้วกันการเขียนตรงนี้ที่เดียว แบบเดียวกับดูในฐานะ —
   * ไล่ใส่เงื่อนไขทีละ route จะมีสักที่ที่ลืม แล้วปุ่มที่ซ่อนไว้ยังยิง API ตรง ๆ ได้
   */
  if ((req.auth.role as string) === "PARTS_ADMIN") {
    req.auth = { ...req.auth, role: "ADMIN", partsAdmin: true };
    const path = req.baseUrl + req.path;
    if (!READ_METHODS.has(req.method) && !PARTS_ADMIN_WRITES.some((r) => r.test(`${req.method} ${path}`))) {
      return res.status(403).json({ error: "Admin Spare Part ดูได้อย่างเดียว — แก้ได้เฉพาะเคลมอะไหล่และข้อมูลอะไหล่" });
    }
  }
  if ((req.auth.role as string) === "SUPER_ADMIN") {
    // ดูในฐานะไม่เปิดให้ดู Super Admin (เช็คตอนเริ่มแล้ว) — คนที่ถูกดูกลายเป็น Super Admin ทีหลังก็ไม่ได้สิทธิ์นั้นไปด้วย
    if (viewAs) return res.status(401).json({ error: "ดูในฐานะ Super Admin ไม่ได้", viewAsEnded: true });
    req.auth = { ...req.auth, role: "ADMIN", superAdmin: true };
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

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * POST ที่ไม่ได้แก้ข้อมูล — ยังใช้ได้ระหว่างดูในฐานะ
 * export ส่งรายการ id มาทาง body เพราะยาวเกิน URL · stop ต้องเรียกได้เพื่อปิดบันทึก
 */
const ALLOWED_WHILE_VIEWING = new Set(["/api/machines/export", "/api/auth/view-as/stop"]);

/** สิ่งที่ Admin Spare Part แก้ได้ — นอกจากนี้ดูได้อย่างเดียว (ดู requireAuth) */
const PARTS_ADMIN_WRITES = [
  /^POST \/api\/work-orders\/\d+\/claim-review$/,
  /^POST \/api\/work-orders\/\d+\/claims\/\d+\/pdf-link$/,
  /^\w+ \/api\/spare-parts(\/|$)/,
  /^POST \/api\/auth\/(change-password|view-as\/stop)$/,
  // POST ที่ไม่ได้แก้ข้อมูล
  /^POST \/api\/machines\/export$/,
  /^POST \/api\/documents\/transfer-request$/,
  // งานส่วนตัวที่พนักงานทุกคนทำได้ — ไม่รวมส่วนที่เป็นของแอดมิน (คืนรถแทน · แก้ประวัติรถ · อนุมัติเบิก)
  /^(POST|DELETE) \/api\/vehicle-logs\/photos(\/\d+)?$/,
  /^POST \/api\/vehicle-logs\/(start|\d+\/end)$/,
  /^POST \/api\/branch-checkins\/?$/,
  /^(POST \/api\/work-logs\/?|DELETE \/api\/work-logs\/\d+)$/,
  /^(POST \/api\/consumable-requests\/?|DELETE \/api\/consumable-requests\/\d+)$/,
];

/** เส้นทางที่ยังเรียกได้ทั้งที่ยังไม่เปลี่ยนรหัส — พอให้เปลี่ยนรหัสได้และรู้ว่าตัวเองเป็นใคร */
const ALLOWED_WHILE_LOCKED = new Set(["/change-password", "/me"]);

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.auth?.role !== "ADMIN") {
    return res.status(403).json({ error: "หน้านี้สำหรับแอดมินเท่านั้น" });
  }
  next();
}

/**
 * เฉพาะ Super Admin — ดูไทม์ไลน์ว่าใครทำอะไรเมื่อไร (เจ้าของระบบต้องการให้เห็นคนเดียว
 * แอดมินทั่วไปไม่ควรตามดูการทำงานของแอดมินด้วยกัน)
 */
export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.auth?.superAdmin) return res.status(403).json({ error: "เฉพาะ Super Admin เท่านั้น" });
  next();
}
