import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma";
import { signToken } from "../utils/jwt";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { ROLES, Role } from "../utils/constants";

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

  const passwordHash = await bcrypt.hash(password, 10);
  const isFirstUser = (await prisma.user.count()) === 0;
  const user = await prisma.user.create({
    data: {
      employeeCode,
      name,
      phone,
      passwordHash,
      role: isFirstUser ? "ADMIN" : "EMPLOYEE",
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

  const token = signToken({ userId: user.id, role: user.role as Role });
  res.json({
    token,
    user: { id: user.id, employeeCode: user.employeeCode, name: user.name, role: user.role },
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
    select: { id: true, employeeCode: true, name: true, phone: true, role: true, region: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  res.json(users);
});

const userUpdateSchema = z.object({
  role: z.enum(ROLES).optional(),
  region: z.string().trim().max(120).nullable().optional(),
});

router.patch("/users/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสผู้ใช้ไม่ถูกต้อง" });

  const parsed = userUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const body = parsed.data;

  // แอดมินคนสุดท้ายลดสิทธิ์ตัวเองไม่ได้ ไม่งั้นจะไม่เหลือใครตั้งสิทธิ์ให้ใครอีกเลย
  if (body.role && body.role !== "ADMIN") {
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (target?.role === "ADMIN") {
      const admins = await prisma.user.count({ where: { role: "ADMIN" } });
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
    },
    select: { id: true, employeeCode: true, name: true, phone: true, role: true, region: true },
  });
  res.json(updated);
});

export default router;
