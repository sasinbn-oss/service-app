import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma";
import { signToken } from "../utils/jwt";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { ADMIN_ROLES, ROLES, Role } from "../utils/constants";

const router = Router();

const registerSchema = z.object({
  employeeCode: z.string().min(2),
  name: z.string().min(1),
  phone: z.string().optional(),
  password: z.string().min(6),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { employeeCode, name, phone, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { employeeCode } });
  if (existing) {
    return res.status(409).json({ error: "Employee code already registered" });
  }

  /**
   * สมัครเองได้เฉพาะคนแรก
   *
   * บัญชีทั้งหมดมาจากแอดมินสร้างให้ ถ้าปล่อยให้สมัครเองได้ตลอด ใครก็เข้ามาดู
   * ข้อมูลสาขาและใบงานได้ แต่คนแรกต้องเข้ามาทางนี้ ไม่งั้นจะไม่มีแอดมินคนแรก
   * ให้ไปสร้างใครได้เลย
   */
  const isFirstUser = (await prisma.user.count()) === 0;
  if (!isFirstUser) {
    return res.status(403).json({
      error: "ระบบนี้ไม่เปิดให้สมัครเอง ติดต่อแอดมินให้สร้างบัญชีให้",
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      employeeCode,
      name,
      phone,
      passwordHash,
      // คนแรกของระบบเป็นเจ้าของระบบ — ไม่งั้นไม่มีใครตั้งแอดมินได้เลย
      role: isFirstUser ? "SUPER_ADMIN" : "EMPLOYEE",
    },
  });

  const token = signToken({ userId: user.id, role: user.role as Role });
  res.status(201).json({
    token,
    user: { id: user.id, employeeCode: user.employeeCode, name: user.name, role: user.role },
  });
});

const loginSchema = z.object({
  employeeCode: z.string().min(1),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { employeeCode, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { employeeCode } });
  if (!user) {
    return res.status(401).json({ error: "Invalid employee code or password" });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid employee code or password" });
  }

  const token = signToken({
    userId: user.id,
    role: user.role as Role,
    mustChangePassword: user.mustChangePassword,
  });
  res.json({
    token,
    user: {
      id: user.id,
      employeeCode: user.employeeCode,
      name: user.name,
      role: user.role,
      region: user.region,
      // ทีมต้องติดมาตั้งแต่ตอนล็อกอิน ไม่ใช่รอให้หน้าจอไปถาม /auth/me อีกรอบ —
      // ระหว่างนั้นช่างจะมองไม่เห็นปุ่มของงานตัวเอง เพราะระบบยังไม่รู้ว่าอยู่ทีมไหน
      team: user.team,
      mustChangePassword: user.mustChangePassword,
    },
  });
});

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    id: user.id,
    employeeCode: user.employeeCode,
    name: user.name,
    phone: user.phone,
    role: user.role,
    region: user.region,
    team: user.team,
    mustChangePassword: user.mustChangePassword,
  });
});

/**
 * จัดการผู้ใช้ — แอดมินเท่านั้น
 *
 * ต้องมีหน้านี้เพราะสายงานใบงานพึ่งบทบาท ถ้าตั้งหัวหน้าภาคไม่ได้ ใบงานจะค้าง
 * อยู่ขั้น "รอหัวหน้าภาคระบุอะไหล่" ตลอดไปโดยไม่มีใครมีสิทธิ์ทำต่อ
 */
router.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      employeeCode: true,
      name: true,
      phone: true,
      role: true,
      region: true,
      team: true,
      mustChangePassword: true,
      createdAt: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  res.json(users);
});


/**
 * ความยาวขั้นต่ำของรหัสผ่าน
 *
 * ยาวกว่าเดิม (6) เพราะรหัสที่แอดมินตั้งให้ผ่านมือคนอื่นและมักถูกตั้งง่ายๆ
 * ให้จำได้ตอนบอกกัน อย่างน้อยตอนเจ้าของบัญชีตั้งใหม่ควรยาวพอสมควร
 */
const MIN_PASSWORD = 8;

const createUserSchema = z.object({
  employeeCode: z.string().trim().min(2, "ชื่อผู้ใช้สั้นเกินไป").max(50),
  name: z.string().trim().min(1, "ต้องใส่ชื่อ").max(120),
  phone: z.string().trim().max(30).optional(),
  role: z.enum(ROLES).default("EMPLOYEE"),
  region: z.string().trim().max(120).nullable().optional(),
  password: z.string().min(MIN_PASSWORD, `รหัสตั้งต้นต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัว`),
});

/**
 * ใครตั้งสิทธิ์ระดับแอดมินขึ้นไป (หรือแตะบัญชีของแอดมิน) ได้บ้าง
 *
 * มี Super Admin ในระบบแล้ว → Super Admin เท่านั้น — แอดมินทั่วไปตั้งแอดมินเพิ่ม
 * หรือรีเซ็ตรหัสของแอดมินคนอื่นไม่ได้ ไม่งั้นรีเซ็ตรหัส Super Admin แล้วเข้าแทนได้
 * ยังไม่มี Super Admin → แอดมินทำได้เหมือนเดิม (ระบบเก่าก่อนมีระดับนี้ จะได้ไม่มีใครถูกล็อก)
 *
 * อ่านบทบาทของคนสั่งจากฐานข้อมูลสด ไม่ใช่จากโทเคน — ถอดสิทธิ์ใครแล้ว
 * มีผลกับการตั้งสิทธิ์ทันที ไม่ต้องรอโทเคนเดิมหมดอายุ 30 วัน
 */
async function canManageAdmins(actorId: number) {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
  if (actor?.role === "SUPER_ADMIN") return true;
  if (actor?.role !== "ADMIN") return false;
  const supers = await prisma.user.count({ where: { role: "SUPER_ADMIN" } });
  return supers === 0;
}

const NEED_SUPER = "เฉพาะ Super Admin เท่านั้นที่ตั้งหรือแก้สิทธิ์ระดับแอดมินได้";

/** แอดมินสร้างบัญชีให้ พร้อมรหัสตั้งต้นที่เจ้าของต้องเปลี่ยนเองตอนเข้าครั้งแรก */
router.post("/users", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const body = parsed.data;
  if (ADMIN_ROLES.includes(body.role) && !(await canManageAdmins(req.auth!.userId))) {
    return res.status(403).json({ error: NEED_SUPER });
  }

  const existing = await prisma.user.findUnique({ where: { employeeCode: body.employeeCode } });
  if (existing) {
    return res.status(409).json({ error: `ชื่อผู้ใช้ "${body.employeeCode}" มีอยู่แล้ว` });
  }

  const user = await prisma.user.create({
    data: {
      employeeCode: body.employeeCode,
      name: body.name,
      phone: body.phone || null,
      role: body.role,
      // ภาคมีความหมายเฉพาะกับหัวหน้าภาค
      region: body.role === "SUPERVISOR" ? body.region || null : null,
      passwordHash: await bcrypt.hash(body.password, 10),
      mustChangePassword: true,
    },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      phone: true,
      role: true,
      region: true,
      mustChangePassword: true,
    },
  });
  res.status(201).json(user);
});

const resetSchema = z.object({
  password: z.string().min(MIN_PASSWORD, `รหัสตั้งต้นต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัว`),
});

/**
 * แอดมินตั้งรหัสใหม่ให้ เมื่อผู้ใช้ลืมรหัส
 *
 * ตั้งธงให้เปลี่ยนเองอีกครั้งเสมอ เพราะรหัสนี้แอดมินรู้ ถ้าไม่บังคับเปลี่ยน
 * บัญชีจะเหลือรหัสที่คนอื่นรู้อยู่ตลอดไป
 */
router.post("/users/:id/reset-password", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสผู้ใช้ไม่ถูกต้อง" });

  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) return res.status(404).json({ error: "ไม่พบผู้ใช้คนนี้" });
  // รีเซ็ตรหัสของแอดมินคนอื่น = เข้าบัญชีนั้นได้ จึงต้องเป็น Super Admin
  if (
    ADMIN_ROLES.includes(target.role) &&
    target.id !== req.auth!.userId &&
    !(await canManageAdmins(req.auth!.userId))
  ) {
    return res.status(403).json({ error: NEED_SUPER });
  }

  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      mustChangePassword: true,
    },
  });
  res.json({ ok: true });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "ต้องใส่รหัสเดิม"),
  newPassword: z.string().min(MIN_PASSWORD, `รหัสใหม่ต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัว`),
});

/** เจ้าของบัญชีเปลี่ยนรหัสตัวเอง — ต้องยืนยันรหัสเดิมเสมอ */
router.post("/change-password", requireAuth, async (req: AuthRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "รหัสเดิมไม่ถูกต้อง" });

  // ตั้งซ้ำของเดิมคือไม่ได้เปลี่ยน ซึ่งไม่ได้แก้ปัญหาที่บังคับให้เปลี่ยนตั้งแต่แรก
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    return res.status(400).json({ error: "รหัสใหม่ต้องไม่ซ้ำกับรหัสเดิม" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 10),
      mustChangePassword: false,
    },
  });

  // โทเคนเดิมยังพกธง "ต้องเปลี่ยนรหัส" อยู่ ถ้าไม่ออกใบใหม่ผู้ใช้จะยังถูกกันอยู่ดี
  res.json({
    ok: true,
    token: signToken({ userId: user.id, role: user.role as Role }),
  });
});

const userUpdateSchema = z.object({
  role: z.enum(ROLES).optional(),
  region: z.string().trim().max(120).nullable().optional(),
  // ทีมช่างที่สังกัด — ตรงกับ Branch.zone ซึ่งมาจากคอลัมน์ "ทีมช่าง" ในไฟล์ทะเบียนสาขา
  team: z.string().trim().max(120).nullable().optional(),
});

router.patch("/users/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสผู้ใช้ไม่ถูกต้อง" });

  const parsed = userUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const body = parsed.data;

  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) return res.status(404).json({ error: "ไม่พบผู้ใช้คนนี้" });

  if (body.role && body.role !== target.role) {
    // ให้หรือถอดสิทธิ์ระดับแอดมินขึ้นไป → ต้องเป็น Super Admin (ดู canManageAdmins)
    if (
      (ADMIN_ROLES.includes(body.role) || ADMIN_ROLES.includes(target.role)) &&
      !(await canManageAdmins(req.auth!.userId))
    ) {
      return res.status(403).json({ error: NEED_SUPER });
    }
    // Super Admin คนสุดท้ายลดสิทธิ์ไม่ได้ ไม่งั้นจะไม่เหลือใครตั้งแอดมินได้อีก
    if (target.role === "SUPER_ADMIN") {
      const supers = await prisma.user.count({ where: { role: "SUPER_ADMIN" } });
      if (supers <= 1) {
        return res.status(400).json({ error: "ต้องเหลือ Super Admin อย่างน้อยหนึ่งคน" });
      }
    }
    // แอดมินคนสุดท้ายลดสิทธิ์ตัวเองไม่ได้ ไม่งั้นจะไม่เหลือใครตั้งสิทธิ์ให้ใครอีกเลย
    if (ADMIN_ROLES.includes(target.role) && !ADMIN_ROLES.includes(body.role)) {
      const admins = await prisma.user.count({ where: { role: { in: ADMIN_ROLES } } });
      if (admins <= 1) {
        return res.status(400).json({ error: "ต้องเหลือแอดมินอย่างน้อยหนึ่งคน" });
      }
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(body.role !== undefined ? { role: body.role } : {}),
      // ภาคมีความหมายเฉพาะกับหัวหน้าภาค เปลี่ยนเป็นบทบาทอื่นก็ล้างทิ้ง
      ...(body.region !== undefined ? { region: body.region || null } : {}),
      ...(body.role !== undefined && body.role !== "SUPERVISOR" ? { region: null } : {}),
      // ทีมมีความหมายเฉพาะกับช่าง เพราะเป็นตัวบอกว่าเห็นงานของทีมไหน
      ...(body.team !== undefined ? { team: body.team || null } : {}),
      ...(body.role !== undefined && body.role !== "EMPLOYEE" ? { team: null } : {}),
    },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      phone: true,
      role: true,
      region: true,
      team: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });
  res.json(updated);
});

export default router;
