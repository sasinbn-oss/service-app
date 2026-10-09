import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma";
import { signToken } from "../utils/jwt";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { ACTIVE_WORK_ORDER_STATUSES, ADMIN_ROLES, ROLES, Role, bangkokDay } from "../utils/constants";
import { forgetUser, rememberUser } from "../utils/userGate";
import { coverageGap } from "../utils/coverage";
import { coverageOf, teamGroups } from "../utils/teamGroups";
import { documentPath, saveDocument } from "../documents/store";
import ExcelJS from "exceljs";
import { deleteObject } from "../storage/fileStore";

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

  rememberUser(user.id, user.role as Role);
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
  if (!valid || user.deletedAt) {
    return res.status(401).json({ error: "Invalid employee code or password" });
  }
  rememberUser(user.id, user.role as Role);

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
      // ทีมรวม — แอปใช้ตัดสินว่าใบงานของทีมไหนเป็นงานของช่างคนนี้ (ปุ่มของขั้นตอน)
      teamCoverage: await coverageOf(user.team),
      supervisedTeams: user.supervisedTeams,
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
    teamCoverage: await coverageOf(user.team),
    supervisedTeams: user.supervisedTeams,
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
    where: { deletedAt: null },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      phone: true,
      role: true,
      region: true,
      team: true,
      supervisedTeams: true,
      mustChangePassword: true,
      createdAt: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  res.json(users);
});


/**
 * รายงาน "ใครยังไม่มีพื้นที่รับผิดชอบ" เป็น Excel — ใช้ไล่ตั้งทีมหลังนำเข้ารายชื่อ
 * (ช่างที่ไม่มีทีมเข้าระบบได้ แต่ตัวเลขทุกช่องเป็น 0 และไม่รู้ว่าผิดที่ตัวเอง)
 */
router.get("/users/unassigned-report", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const [users, zones, pm, regionRows] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, role: { in: ["EMPLOYEE", "SUPERVISOR"] } },
      select: { employeeCode: true, name: true, phone: true, role: true, team: true, region: true, supervisedTeams: true, mustChangePassword: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.branch.findMany({ where: { zone: { not: null }, cancelledAt: null }, select: { zone: true }, distinct: ["zone"] }),
    prisma.branch.findMany({ where: { pmTeam: { not: null }, cancelledAt: null }, select: { pmTeam: true }, distinct: ["pmTeam"] }),
    prisma.branch.findMany({ where: { region: { not: null }, cancelledAt: null }, select: { region: true }, distinct: ["region"] }),
  ]);
  // ทีมรวมนับเป็นทีมที่มีอยู่จริง — ช่างในทีมรวมเห็นงานของทีมที่ครอบคลุม
  const teams = new Set([...zones.map((z) => z.zone!), ...pm.map((p) => p.pmTeam!), ...(await teamGroups()).keys()]);
  const regions = new Set(regionRows.map((r) => r.region!));
  const rows = users
    .map((u) => ({ u, gap: coverageGap(u, teams, regions) }))
    .filter((r): r is { u: (typeof users)[number]; gap: string } => r.gap !== null);

  const wb = new ExcelJS.Workbook();
  const sh = wb.addWorksheet("ยังไม่มีพื้นที่รับผิดชอบ");
  sh.columns = [
    { header: "ลำดับ", key: "no", width: 7 },
    { header: "รหัสพนักงาน", key: "code", width: 14 },
    { header: "ชื่อ", key: "name", width: 32 },
    { header: "สิทธิ์", key: "role", width: 12 },
    { header: "ปัญหา", key: "gap", width: 46 },
    { header: "เบอร์โทร", key: "phone", width: 14 },
    { header: "เข้าระบบแล้ว", key: "login", width: 14 },
  ];
  sh.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sh.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3B60" } };
  rows.forEach(({ u, gap }, i) =>
    sh.addRow({
      no: i + 1,
      code: u.employeeCode,
      name: u.name,
      role: u.role === "SUPERVISOR" ? "หัวหน้าภาค" : "ช่าง",
      gap,
      phone: u.phone ?? "",
      // เปลี่ยนรหัสตั้งต้นแล้ว = เคยเข้าระบบ — คนที่ยังไม่เคยเข้าอาจยังไม่ได้รับแจ้งเลย
      login: u.mustChangePassword ? "ยังไม่เคย" : "เข้าแล้ว",
    })
  );
  sh.addRow({});
  sh.addRow({ name: `รวม ${rows.length} คน จากช่างและหัวหน้าภาคทั้งหมด ${users.length} คน` }).font = { bold: true };
  sh.addRow({ name: "แก้ที่ เมนู สิทธิ์ผู้ใช้ → การ์ดของแต่ละคน · ทีมที่ไม่มีให้เลือก ใช้ เมนู ทีมช่าง → ย้ายสาขาเข้าทีม" });
  sh.views = [{ state: "frozen", ySplit: 1 }];
  sh.autoFilter = { from: "A1", to: "G1" };

  const day = bangkokDay();
  const stored = saveDocument({
    filename: `ยังไม่มีพื้นที่รับผิดชอบ_${day}.xlsx`,
    asciiFilename: `unassigned_${day}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data: Buffer.from(await wb.xlsx.writeBuffer()),
    ownerId: req.auth!.userId,
  });
  res.json({ filename: stored.filename, path: documentPath(stored), count: rows.length, total: users.length });
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
  const supers = await prisma.user.count({ where: { role: "SUPER_ADMIN", deletedAt: null } });
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

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, deletedAt: true } });
  if (!target || target.deletedAt) return res.status(404).json({ error: "ไม่พบผู้ใช้คนนี้" });
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
  // ทีมช่างที่หัวหน้าภาคดูแล (หลายทีมได้) — ดู User.supervisedTeams
  supervisedTeams: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  // รายละเอียดบัญชี — ปุ่ม "แก้ไขรายละเอียด" ในหน้าสิทธิ์ผู้ใช้
  // "~" สงวนไว้ให้รหัสของบัญชีที่ถูกลบ (รหัสเดิม~ลบ<id>) จะได้ไม่ชนกัน
  employeeCode: z
    .string()
    .trim()
    .min(2, "ชื่อผู้ใช้สั้นเกินไป")
    .max(50)
    .refine((v) => !v.includes("~"), "ชื่อผู้ใช้ใช้เครื่องหมาย ~ ไม่ได้")
    .optional(),
  name: z.string().trim().min(1, "ต้องใส่ชื่อ").max(120).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});

router.patch("/users/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสผู้ใช้ไม่ถูกต้อง" });

  const parsed = userUpdateSchema.safeParse(req.body);
  // ข้อความแรกเป็นภาษาไทยอยู่แล้ว — ส่งทั้งก้อน flatten หน้าจอจะโชว์เป็น JSON ดิบ
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const body = parsed.data;

  const target = await prisma.user.findUnique({ where: { id }, select: { role: true, deletedAt: true, employeeCode: true } });
  if (!target || target.deletedAt) return res.status(404).json({ error: "ไม่พบผู้ใช้คนนี้" });

  const detailsChanged = body.employeeCode !== undefined || body.name !== undefined || body.phone !== undefined;
  // เปลี่ยนชื่อผู้ใช้ของแอดมินคนอื่น = เปลี่ยนสิ่งที่เขาใช้เข้าระบบ จึงต้องเป็น Super Admin
  // แบบเดียวกับรีเซ็ตรหัส (แก้บัญชีตัวเองได้เสมอ)
  if (
    detailsChanged &&
    ADMIN_ROLES.includes(target.role) &&
    id !== req.auth!.userId &&
    !(await canManageAdmins(req.auth!.userId))
  ) {
    return res.status(403).json({ error: "เฉพาะ Super Admin เท่านั้นที่แก้รายละเอียดบัญชีแอดมินคนอื่นได้" });
  }
  if (body.employeeCode !== undefined && body.employeeCode !== target.employeeCode) {
    const taken = await prisma.user.findUnique({ where: { employeeCode: body.employeeCode }, select: { id: true } });
    if (taken) return res.status(409).json({ error: `ชื่อผู้ใช้ "${body.employeeCode}" มีคนใช้อยู่แล้ว` });
  }

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
      const supers = await prisma.user.count({ where: { role: "SUPER_ADMIN", deletedAt: null } });
      if (supers <= 1) {
        return res.status(400).json({ error: "ต้องเหลือ Super Admin อย่างน้อยหนึ่งคน" });
      }
    }
    // แอดมินคนสุดท้ายลดสิทธิ์ตัวเองไม่ได้ ไม่งั้นจะไม่เหลือใครตั้งสิทธิ์ให้ใครอีกเลย
    if (ADMIN_ROLES.includes(target.role) && !ADMIN_ROLES.includes(body.role)) {
      const admins = await prisma.user.count({ where: { role: { in: ADMIN_ROLES }, deletedAt: null } });
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
      ...(body.supervisedTeams !== undefined ? { supervisedTeams: [...new Set(body.supervisedTeams)] } : {}),
      ...(body.role !== undefined && body.role !== "SUPERVISOR" ? { supervisedTeams: [] } : {}),
      ...(body.employeeCode !== undefined ? { employeeCode: body.employeeCode } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
    },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      phone: true,
      role: true,
      region: true,
      team: true,
      supervisedTeams: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });
  rememberUser(updated.id, updated.role as Role);
  res.json(updated);
});

/**
 * ลบผู้ใช้ — Super Admin เท่านั้น (ตามที่เจ้าของระบบกำหนด แอดมินทั่วไปลบไม่ได้)
 *
 * ยังไม่มีประวัติในระบบ → ลบจริง
 * มีประวัติแล้ว (ใบงาน ใช้รถ บันทึกงาน แผนทีม …) → ปิดบัญชีแทน: เข้าระบบไม่ได้
 * ไม่โผล่ในรายชื่อ แต่ชื่อยังขึ้นในประวัติเดิม ลบจริงจะทำให้ประวัติหายหรือบันทึกไม่ได้
 * ว่าใครทำ — แบบเดียวกับรถที่เคยใช้แล้วต้องตั้ง "เลิกใช้งาน"
 *
 * ยังถือใบงานค้างหรือยังไม่คืนรถ → ไม่ให้ลบ งานพวกนั้นจะค้างอยู่กับคนที่ไม่มีใครเข้าไปทำต่อได้
 */
router.delete("/users/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสผู้ใช้ไม่ถูกต้อง" });

  // อ่านบทบาทจากฐานข้อมูลสด ไม่ใช่จากโทเคน — ถอดสิทธิ์แล้วต้องลบไม่ได้ทันที
  const actor = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { role: true } });
  if (actor?.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "เฉพาะ Super Admin เท่านั้นที่ลบผู้ใช้ได้" });
  }
  // ลบตัวเองไม่ได้ — กันกดพลาด และกันระบบไม่เหลือ Super Admin
  if (id === req.auth!.userId) return res.status(400).json({ error: "ลบบัญชีของตัวเองไม่ได้" });

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      employeeCode: true,
      name: true,
      deletedAt: true,
      _count: {
        select: {
          vehicleLogs: true,
          branchCheckIns: true,
          workLogs: true,
          consumableRequests: true,
          reviewedRequests: true,
          outageNotes: true,
          outageNoteLogs: true,
          createdWorkOrders: true,
          assignedWorkOrders: true,
          closedWorkOrders: true,
          workOrderLogs: true,
          checkedParts: true,
          workOrderAttachments: true,
          workedWorkOrders: true,
          teamDayPlans: true,
          teamDayPlanSeats: true,
          returnedVehicleLogs: true,
          vehicleDocs: true,
          vehicleMaintenance: true,
        },
      },
    },
  });
  if (!target || target.deletedAt) return res.status(404).json({ error: "ไม่พบผู้ใช้คนนี้" });

  const [openOrders, ongoingCar] = await Promise.all([
    prisma.workOrder.count({ where: { assignedToId: id, status: { in: [...ACTIVE_WORK_ORDER_STATUSES] } } }),
    prisma.vehicleLog.count({ where: { userId: id, status: "ONGOING" } }),
  ]);
  if (ongoingCar) {
    return res.status(409).json({ error: `${target.name} ยังไม่คืนรถ — คืนรถแทนที่หน้า ภาพรวมรถ ก่อน` });
  }
  if (openOrders) {
    return res.status(409).json({
      error: `${target.name} ยังถือใบงานที่ยังไม่ปิด ${openOrders} ใบ — จ่ายงานให้คนอื่นก่อนจึงลบได้`,
    });
  }

  const hasHistory = Object.values(target._count).some((n) => n > 0);
  if (!hasHistory) {
    // รูปรถที่อัปค้างไว้แต่ยังไม่ได้เบิก (ไม่ใช่ประวัติ) ถูกลบตามด้วย cascade — ลบไฟล์ในถังด้วย
    const photos = await prisma.vehicleLogPhoto.findMany({ where: { uploadedById: id }, select: { objectKey: true } });
    await prisma.user.delete({ where: { id } });
    forgetUser(id);
    for (const p of photos) deleteObject(p.objectKey).catch((e) => console.error("photo delete failed", e));
    return res.json({ ok: true, mode: "deleted" });
  }

  // แผนเก็บวันที่เป็นเที่ยงคืน UTC ของวันนั้น (ดู dayStart ใน plans.ts)
  const today = new Date(`${bangkokDay()}T00:00:00.000Z`);
  await prisma.$transaction(
    async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          // คืนรหัสพนักงานให้สร้างบัญชีใหม่ด้วยรหัสเดิมได้ (กลับมาทำงานใหม่)
          employeeCode: `${target.employeeCode}~ลบ${id}`,
          // ทีม/ภาคเป็นตัวกำหนดว่าเห็นงานไหนและอยู่ในทีมไหน — คนที่ไม่อยู่แล้วต้องไม่ถูกนับในทีม
          team: null,
          region: null,
        },
      });
      // ถอดออกจากแผนทีมวันนี้เป็นต้นไป ส่วนแผนวันที่ผ่านมาแล้วเก็บไว้เป็นประวัติ
      await tx.teamDayPlanMember.deleteMany({ where: { userId: id, plan: { date: { gte: today } } } });
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
  forgetUser(id);
  res.json({ ok: true, mode: "deactivated" });
});

export default router;
