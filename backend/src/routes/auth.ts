import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { cleanName } from "../utils/names";
import { prisma } from "../prisma";
import { peekToken, signToken, signViewAsToken } from "../utils/jwt";
import { requireAuth, requireAdmin, requireSuperAdmin, AuthRequest } from "../middleware/auth";
import { canViewAs } from "../utils/viewAs";
import { ACTIVE_WORK_ORDER_STATUSES, ADMIN_ROLES, ROLES, ROLE_LABELS, Role, TECH_ROLES, bangkokDay, AREA_TEAM_ROLES } from "../utils/constants";
import { COCO_BRANCH } from "../utils/areaScope";
import { forgetUser, passwordChanged, rememberUser } from "../utils/userGate";
import { coverageGap } from "../utils/coverage";
import { regionsOf } from "../utils/supervisorScope";
import { coverageOfUser, teamGroups, teamsOf } from "../utils/teamGroups";
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

  // ชื่อผู้ใช้ของ Area Team เป็นอีเมลส่วนหน้า (kanlaya.l) — พิมพ์ตัวใหญ่ปนมาก็ให้เข้าได้ (คีย์บอร์ดมือถือขึ้นต้นตัวใหญ่ให้เอง)
  // เฉพาะตำแหน่งนี้ รหัสพนักงานของคนอื่นเป็นตัวเลขอยู่แล้ว
  const user =
    (await prisma.user.findUnique({ where: { employeeCode } })) ??
    (await prisma.user.findFirst({
      where: { employeeCode: employeeCode.trim().toLowerCase(), role: { in: AREA_TEAM_ROLES } },
    }));
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
      // ภาคทั้งหมดที่ดูแล (ภาคแรก = region) — หน้าแรก/บอร์ดแผนงานโชว์ครบทุกภาค ไม่ใช่แค่ภาคแรก
      regions: regionsOf(user),
      // ทีมต้องติดมาตั้งแต่ตอนล็อกอิน ไม่ใช่รอให้หน้าจอไปถาม /auth/me อีกรอบ —
      // ระหว่างนั้นช่างจะมองไม่เห็นปุ่มของงานตัวเอง เพราะระบบยังไม่รู้ว่าอยู่ทีมไหน
      team: user.team,
      // ทีม/ทีมรวมทั้งหมดที่ถือ (อันแรก = team) — Senior ช่างมีหลายอัน หน้าแรกโชว์ครบ ไม่ใช่แค่อันแรก
      teams: teamsOf(user),
      // ทีมที่เห็นงานจริงหลังแตกทีมรวมแล้ว (Senior = ทุกอันรวมกัน) — แอปใช้ตัดสินว่าใบงานของทีมไหนเป็นงานของช่างคนนี้ (ปุ่มของขั้นตอน)
      teamCoverage: await coverageOfUser(user),
      supervisedTeams: user.supervisedTeams,
      mustChangePassword: user.mustChangePassword,
    },
  });
});

type MeUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;

async function meOf(user: MeUser, auth?: AuthRequest["auth"]) {
  const viewAs = auth?.viewAs;
  const by = viewAs ? await prisma.user.findUnique({ where: { id: viewAs.by }, select: { name: true } }) : null;
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    name: user.name,
    phone: user.phone,
    role: user.role,
    region: user.region,
    regions: regionsOf(user),
    team: user.team,
    teams: teamsOf(user),
    teamCoverage: await coverageOfUser(user),
    supervisedTeams: user.supervisedTeams,
    // ระหว่างดูในฐานะ ไม่บังคับเปลี่ยนรหัสแทนเจ้าของบัญชี — Super Admin แค่มาดูหน้าจอ
    mustChangePassword: viewAs ? false : user.mustChangePassword,
    // แอปใช้แสดงแถบ "กำลังดูในฐานะ" ค้างไว้ด้านบนและนับเวลาที่เหลือ
    viewAs: viewAs
      ? { byName: by?.name ?? "แอดมิน", expiresAt: new Date((auth!.exp ?? 0) * 1000).toISOString() }
      : undefined,
  };
}

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(await meOf(user, req.auth));
});

/**
 * Super Admin ดูแอปในฐานะพนักงานคนหนึ่ง — เห็นเมนู กล่องงาน และใบงานเหมือนที่คนนั้นเห็นจริง
 *
 * ออกโทเคนของคนนั้นให้ แทนการจำลองหน้าจอฝั่งแอป เพราะสิ่งที่แต่ละคนเห็นตัดสินที่เซิร์ฟเวอร์
 * (ทีม ภาค ทีมรวม ขั้นที่เป็นของใคร) จำลองฝั่งแอปจะเพี้ยนจากของจริงทันทีที่กฎเปลี่ยน
 * ไม่ต้องรู้รหัสผ่านของใคร และไม่กระทบการล็อกอินของเจ้าของบัญชี
 */
router.post("/view-as", requireAuth, async (req: AuthRequest, res) => {
  // Admin Spare Part มองเป็น ADMIN ในโทเคน — ดูในฐานะไม่ได้ (ไม่ได้ขอ)
  if (req.auth!.role !== "ADMIN" || req.auth!.partsAdmin) return res.status(403).json({ error: "ดูในฐานะได้เฉพาะแอดมินและ Super Admin" });
  if (req.auth!.viewAs) return res.status(400).json({ error: "กำลังดูในฐานะคนอื่นอยู่ — กลับเป็นตัวเองก่อน" });
  const userId = Number(req.body?.userId);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: "ไม่ได้เลือกผู้ใช้" });
  if (userId === req.auth!.userId) return res.status(400).json({ error: "เลือกตัวเองไม่ได้" });
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.deletedAt) return res.status(404).json({ error: "ไม่พบผู้ใช้นี้ — อาจถูกลบไปแล้ว" });
  // Super Admin เห็นทุกอย่างเท่ากันอยู่แล้ว และหน้าจอของเขามีเครื่องมือที่ไม่ควรเปิดผ่านทางอ้อม
  if (target.role === "SUPER_ADMIN") return res.status(400).json({ error: "ดูในฐานะ Super Admin ไม่ได้" });
  if (!canViewAs(req.auth!.superAdmin ? "SUPER_ADMIN" : "ADMIN", target.role)) {
    return res.status(403).json({ error: "แอดมินดูในฐานะได้เฉพาะหัวหน้าภาค ช่าง และทีม Area" });
  }

  // บอกด่าน requireAuth ว่ามีบัญชีนี้ แบบเดียวกับตอนล็อกอิน — บัญชีที่เกิดหลังรอบโหลดรายชื่อล่าสุดและยังไม่เคยเข้าระบบ
  // ถ้าเริ่มดูภายใน 5 วินาทีหลังรอบนั้น คำขอแรกของการดูจะถูกตีกลับว่า "สิทธิ์ถูกยกเลิก" ทั้งที่เพิ่งอนุญาต (utils/userGate.ts)
  rememberUser(target.id, target.role as Role);
  const log = await prisma.viewAsLog.create({ data: { byUserId: req.auth!.userId, targetUserId: target.id } });
  const token = signViewAsToken({
    userId: target.id,
    role: target.role as Role,
    viewAs: { by: req.auth!.userId, logId: log.id },
  });
  res.json({ token, user: await meOf(target, peekToken(token) ?? undefined) });
});

/** เลิกดู — ปิดบันทึก ส่วนโทเคนเดิมของ Super Admin แอปเก็บไว้เองและสลับกลับ */
router.post("/view-as/stop", requireAuth, async (req: AuthRequest, res) => {
  const viewAs = req.auth!.viewAs;
  if (viewAs) {
    await prisma.viewAsLog.updateMany({ where: { id: viewAs.logId, endedAt: null }, data: { endedAt: new Date() } });
  }
  res.json({ ok: true });
});

/** ประวัติดูในฐานะล่าสุด — Super Admin ใช้ตรวจว่าใครเข้าไปดูหน้าจอของใคร */
router.get("/view-as/logs", requireAuth, requireSuperAdmin, async (_req, res) => {
  const logs = await prisma.viewAsLog.findMany({ orderBy: { startedAt: "desc" }, take: 200 });
  const ids = [...new Set(logs.flatMap((l) => [l.byUserId, l.targetUserId]))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, employeeCode: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  res.json(
    logs.map((l) => ({
      ...l,
      by: byId.get(l.byUserId) ?? null,
      target: byId.get(l.targetUserId) ?? null,
    }))
  );
});

/**
 * จัดการผู้ใช้ — แอดมินเท่านั้น
 *
 * ต้องมีหน้านี้เพราะสายงานใบงานพึ่งบทบาท ถ้าตั้งหัวหน้าภาคไม่ได้ ใบงานจะค้าง
 * อยู่ขั้น "รอหัวหน้าภาคระบุอะไหล่" ตลอดไปโดยไม่มีใครมีสิทธิ์ทำต่อ
 */
const MANAGED_USER_SELECT = {
  id: true,
  employeeCode: true,
  name: true,
  phone: true,
  role: true,
  region: true,
  extraRegions: true,
  team: true,
  extraTeams: true,
  supervisedTeams: true,
  mustChangePassword: true,
  createdAt: true,
  maidBranches: { select: { branch: { select: { code: true, name: true } } }, orderBy: { branch: { code: "asc" } } },
} as const;

/**
 * สาขาที่ Maid ประจำ ส่งเป็นรายการแบน ๆ — หน้าจอไม่ต้องรู้ว่ามีตารางเชื่อมอยู่ตรงกลาง
 * regions = ภาคทั้งหมดรวมเป็นรายการเดียว หน้าจอไม่ต้องรู้ว่าภาคแรกเก็บแยกคอลัมน์
 * teams = ทีม/ทีมรวมทั้งหมดของช่าง/Senior ช่าง (อันแรก = team) ด้วยเหตุผลเดียวกัน
 */
function managedUser<
  T extends {
    role: string;
    region: string | null;
    extraRegions: string[];
    team: string | null;
    extraTeams: string[];
    maidBranches: { branch: { code: string; name: string } }[];
  },
>(u: T) {
  return { ...u, regions: regionsOf(u), teams: teamsOf(u), maidBranches: u.maidBranches.map((m) => m.branch) };
}

/**
 * ภาคที่เลือกมา → เก็บเป็น region (ภาคแรก) + extraRegions (ที่เหลือ)
 *
 * ชื่อใหม่ต้องมีในทะเบียนสาขา — เดิมไม่ได้ตรวจ ชื่อสะกดผิดเก็บได้เงียบ ๆ แล้วหัวหน้าภาคไม่เห็นใบงานสักใบ
 * (รู้ตัวอีกทีจากรายงาน "ยังไม่มีพื้นที่รับผิดชอบ") · ภาคที่คนนี้ถืออยู่แล้วผ่านเสมอ แม้สาขาของภาคนั้นถูกย้ายออกหมดแล้ว
 * ไม่งั้นแอดมินเอาภาคอื่นออกไม่ได้เลยเพราะภาคเก่าที่ค้างอยู่ทำให้บันทึกทั้งชุดไม่ผ่าน
 */
async function resolveRegions(
  input: (string | null)[],
  held: string[]
): Promise<{ region: string | null; extraRegions: string[] } | { error: string }> {
  const wanted: string[] = [];
  for (const r of input) {
    const c = cleanName(r);
    if (c && !wanted.includes(c)) wanted.push(c);
  }
  const fresh = wanted.filter((r) => !held.includes(r));
  if (fresh.length) {
    const known = await prisma.branch.findMany({ where: { region: { in: fresh } }, distinct: ["region"], select: { region: true } });
    const missing = fresh.filter((r) => !known.some((k) => k.region === r));
    if (missing.length) return { error: `ไม่มีภาค ${missing.map((m) => `“${m}”`).join(", ")} ในทะเบียนสาขา` };
  }
  return { region: wanted[0] ?? null, extraRegions: wanted.slice(1) };
}

/**
 * ทีมที่เลือกมา → เก็บเป็น team (อันแรก) + extraTeams (ที่เหลือ) · เรียงตามที่เลือก ตัดซ้ำ
 *
 * ชื่อใหม่ต้องเป็นทีมช่างของสาขา (CM/PM) หรือทีมรวม — ชื่อที่ไม่มีใบงานผูกอยู่ให้ไปก็มองไม่เห็นงานสักใบ
 * แบบเดียวกับภาค: ชื่อที่ถืออยู่แล้วผ่านเสมอ แม้ทีมนั้นถูกย้ายสาขาออกหมดแล้ว ไม่งั้นเอาทีมอื่นออกไม่ได้
 * ชื่อทีมรวมกับทีมช่างชนกันไม่ได้ (checkGroup ใน routes/teams.ts) จึงเก็บปนกันในรายการเดียวได้
 */
async function resolveTeams(
  input: (string | null | undefined)[],
  held: string[]
): Promise<{ team: string | null; extraTeams: string[] } | { error: string }> {
  const wanted: string[] = [];
  for (const t of input) {
    const c = cleanName(t);
    if (c && !wanted.includes(c)) wanted.push(c);
  }
  const fresh = wanted.filter((t) => !held.includes(t));
  if (fresh.length) {
    const [rows, groups] = await Promise.all([
      prisma.branch.findMany({
        where: { cancelledAt: null, OR: [{ zone: { in: fresh } }, { pmTeam: { in: fresh } }] },
        select: { zone: true, pmTeam: true },
        distinct: ["zone", "pmTeam"],
      }),
      teamGroups(),
    ]);
    const known = new Set(rows.flatMap((r) => [r.zone, r.pmTeam]));
    const missing = fresh.filter((t) => !known.has(t) && !groups.has(t));
    if (missing.length) return { error: `ไม่มีทีม ${missing.map((m) => `“${m}”`).join(", ")} ในทะเบียนสาขาหรือทีมรวม` };
  }
  return { team: wanted[0] ?? null, extraTeams: wanted.slice(1) };
}

/** ช่างธรรมดาถือได้ทีมเดียว — บอกทางไปให้ด้วย เพราะคนที่ส่งหลายทีมมาคือคนที่ต้องการ Senior ช่าง */
const ONE_TEAM_ONLY = "ช่างเลือกได้ทีมเดียว — ถ้าต้องดูหลายทีมให้ตั้งเป็น Senior ช่าง";

/**
 * area กับจำนวน Supervisor/สาขา — ให้หน้า "ดูในฐานะ" จัดกลุ่ม Supervisor (COCO) ตาม Area และบอกว่าแต่ละคนดูแลแค่ไหน
 * คนโทรมาถามมักบอกชื่อ Area หรือสาขา ไม่ใช่ชื่อคน
 *
 * นับ/จัดกลุ่มด้วยกฎเดียวกับผังฝั่ง Area (routes/teams.ts) — Area ที่ถูกลบ/เปลี่ยนตำแหน่งแล้ว = ไม่มี Area ·
 * นับเฉพาะ Supervisor (COCO) และสาขา COCO ที่เปิดอยู่ ไม่งั้นแอดมินคุยกับคนเดียวกันแล้วสองหน้าจอบอกคนละอย่าง
 * สาขาที่ Supervisor (COCO) ดูแลส่งเป็นรายการ ไม่ใช่แค่จำนวน — ร้านโทรมาบอกรหัสสาขา แอดมินค้นหาคนดูแลจากรหัสได้ (เจ้าของงานขอ ต.ค. 69)
 */
router.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      ...MANAGED_USER_SELECT,
      area: { select: { id: true, name: true, role: true, deletedAt: true } },
      cocoBranches: { where: { AND: [COCO_BRANCH, { cancelledAt: null }] }, select: { code: true, name: true }, orderBy: { code: "asc" } },
      _count: { select: { areaMembers: { where: { deletedAt: null, role: "COCO_SUPERVISOR" } } } },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  res.json(
    users.map(({ area, ...u }) => ({
      ...managedUser(u),
      area: area && area.role === "AREA" && !area.deletedAt ? { id: area.id, name: area.name } : null,
    }))
  );
});

/** สาขา COCO ที่ยังเปิดอยู่ — ตัวเลือก "สาขาที่ประจำ" ของ Maid (COCO) ในหน้าสิทธิ์ผู้ใช้ */
router.get("/users/coco-branches", requireAuth, requireAdmin, async (_req, res) => {
  const branches = await prisma.branch.findMany({
    where: { AND: [COCO_BRANCH, { cancelledAt: null }] },
    select: { code: true, name: true },
    orderBy: { code: "asc" },
  });
  res.json(branches);
});

/**
 * แปลงรหัสสาขาที่ Maid ประจำเป็น id — ต้องเป็นสาขา COCO ที่ยังเปิดอยู่
 * สาขาที่ไม่ใช่ COCO ผูกไปก็ไม่มีผล (ขอบเขตกรองรหัส C อยู่แล้ว) บอกตั้งแต่ตอนบันทึกดีกว่าให้เงียบ
 */
async function maidBranchIds(codes: string[]): Promise<{ ids: number[] } | { error: string }> {
  const wanted = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  const found = await prisma.branch.findMany({
    where: { code: { in: wanted, mode: "insensitive" }, cancelledAt: null },
    select: { id: true, code: true },
  });
  const byCode = new Map(found.map((b) => [b.code.toUpperCase(), b]));
  const missing = wanted.filter((c) => !byCode.has(c));
  if (missing.length) return { error: `ไม่พบสาขา ${missing.join(", ")} (หรือปิดสาขาแล้ว)` };
  const notCoco = wanted.filter((c) => !c.startsWith("C"));
  if (notCoco.length) return { error: `${notCoco.join(", ")} ไม่ใช่สาขา COCO — Maid (COCO) ประจำได้เฉพาะสาขา COCO` };
  return { ids: wanted.map((c) => byCode.get(c)!.id) };
}


/**
 * รายงาน "ใครยังไม่มีพื้นที่รับผิดชอบ" เป็น Excel — ใช้ไล่ตั้งทีมหลังนำเข้ารายชื่อ
 * (ช่างที่ไม่มีทีมเข้าระบบได้ แต่ตัวเลขทุกช่องเป็น 0 และไม่รู้ว่าผิดที่ตัวเอง)
 */
router.get("/users/unassigned-report", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const [users, zones, pm, regionRows] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, role: { in: [...TECH_ROLES, "SUPERVISOR"] } },
      select: { employeeCode: true, name: true, phone: true, role: true, team: true, extraTeams: true, region: true, extraRegions: true, supervisedTeams: true, mustChangePassword: true },
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
      role: ROLE_LABELS[u.role] ?? u.role,
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

/** ชื่อภาคหนึ่งชื่อในรายการ regions — ข้อความต้องเป็นไทย เพราะ handler ส่งข้อความแรกของ zod ไปขึ้นหน้าจอตรง ๆ */
const REGION_NAME = z.string().trim().min(1, "ชื่อภาคว่างไม่ได้").max(120, "ชื่อภาคยาวเกิน 120 ตัวอักษร");
/** ทีม/ทีมรวมทั้งชุดของ Senior ช่าง (แทนที่ของเดิม · อันแรกเก็บที่ team) — ข้อความไทยด้วยเหตุผลเดียวกัน */
const TEAM_LIST = z
  .array(z.string().trim().min(1, "ชื่อทีมว่างไม่ได้").max(120, "ชื่อทีมยาวเกิน 120 ตัวอักษร"))
  .max(50, "เลือกทีมได้ไม่เกิน 50 ทีม");

const createUserSchema = z.object({
  employeeCode: z.string().trim().min(2, "ชื่อผู้ใช้สั้นเกินไป").max(50),
  name: z.string().trim().min(1, "ต้องใส่ชื่อ").max(120),
  phone: z.string().trim().max(30).optional(),
  role: z.enum(ROLES).default("EMPLOYEE"),
  region: z.string().trim().max(120).nullable().optional(),
  // ภาคที่ดูแลทั้งหมด (หัวหน้าภาคเลือกได้หลายภาค) — ส่งมาแล้วใช้แทน region
  regions: z.array(REGION_NAME).max(20, "เลือกภาคได้ไม่เกิน 20 ภาค").optional(),
  // ทีมช่างที่สังกัด (ช่าง) · ทีมทั้งชุด (Senior ช่าง เลือกได้หลายทีมตั้งแต่สร้าง) — บทบาทอื่นไม่ใช้
  team: z.string().trim().max(120).nullable().optional(),
  teams: TEAM_LIST.optional(),
  password: z.string().min(MIN_PASSWORD, `รหัสตั้งต้นต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัว`),
  // รหัสสาขาที่ Maid (COCO) ประจำ — บทบาทอื่นไม่ใช้
  maidBranches: z.array(z.string().trim().min(1).max(30)).max(50).optional(),
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
  // ส่งข้อความแรกแบบเดียวกับ PATCH — ก้อน flatten ขึ้นในกล่องแจ้งเตือนเป็น JSON ดิบ ทั้งที่ข้อความข้างในเป็นไทยอยู่แล้ว
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const body = parsed.data;
  if (ADMIN_ROLES.includes(body.role) && !(await canManageAdmins(req.auth!.userId))) {
    return res.status(403).json({ error: NEED_SUPER });
  }
  // Area Team เข้าระบบด้วยชื่อผู้ใช้ตัวเล็ก (ล็อกอินแปลงเป็นตัวเล็กให้) — ช่องในฟอร์มขึ้นตัวใหญ่ให้เอง
  // เก็บตัวใหญ่ไว้แล้วจะเข้าระบบไม่ได้เลย ทั้งที่พิมพ์ตรงกับที่แอดมินตั้ง
  if (AREA_TEAM_ROLES.includes(body.role)) body.employeeCode = body.employeeCode.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { employeeCode: body.employeeCode } });
  if (existing) {
    return res.status(409).json({ error: `ชื่อผู้ใช้ "${body.employeeCode}" มีอยู่แล้ว` });
  }
  // ภาคมีความหมายเฉพาะกับหัวหน้าภาค
  let regionData: { region: string | null; extraRegions: string[] } = { region: null, extraRegions: [] };
  if (body.role === "SUPERVISOR") {
    const r = await resolveRegions(body.regions ?? [body.region ?? null], []);
    if ("error" in r) return res.status(400).json({ error: r.error });
    regionData = r;
  }
  // ทีมมีความหมายเฉพาะกับช่าง/Senior ช่าง — บทบาทอื่นส่งมาก็ไม่เก็บ (แบบเดียวกับภาค)
  let teamData: { team: string | null; extraTeams: string[] } = { team: null, extraTeams: [] };
  if (TECH_ROLES.includes(body.role) && (body.teams !== undefined || body.team !== undefined)) {
    const r = await resolveTeams(body.teams ?? [body.team], []);
    if ("error" in r) return res.status(400).json({ error: r.error });
    if (body.role === "EMPLOYEE" && r.extraTeams.length) return res.status(400).json({ error: ONE_TEAM_ONLY });
    teamData = r;
  }
  // Maid ที่ไม่มีสาขาเข้าระบบแล้วเห็นหน้าว่างทุกหน้า โดยไม่รู้ว่าผิดที่บัญชี — บังคับเลือกตั้งแต่สร้าง
  let maidIds: number[] = [];
  if (body.role === "COCO_MAID") {
    if (!body.maidBranches?.length) {
      return res.status(400).json({ error: "Maid (COCO) ต้องเลือกสาขาที่ประจำอย่างน้อยหนึ่งสาขา" });
    }
    const r = await maidBranchIds(body.maidBranches);
    if ("error" in r) return res.status(400).json({ error: r.error });
    maidIds = r.ids;
  }

  const user = await prisma.user.create({
    data: {
      employeeCode: body.employeeCode,
      name: body.name,
      phone: body.phone || null,
      role: body.role,
      ...regionData,
      ...teamData,
      passwordHash: await bcrypt.hash(body.password, 10),
      mustChangePassword: true,
      ...(maidIds.length ? { maidBranches: { create: maidIds.map((branchId) => ({ branchId })) } } : {}),
    },
    select: MANAGED_USER_SELECT,
  });
  res.status(201).json(managedUser(user));
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

  // รีเซ็ตให้ = ทุกเครื่องที่ล็อกอินค้างไว้หลุด (มือถือหาย คนลาออก) — ดู issuedBeforePasswordChange
  const resetAt = new Date();
  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      mustChangePassword: true,
      passwordChangedAt: resetAt,
    },
  });
  passwordChanged(id, resetAt);
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

  // เครื่องอื่นที่ล็อกอินด้วยรหัสเดิมหลุด — เครื่องนี้ได้โทเคนใหม่ข้างล่าง (ออกหลังเวลานี้) จึงไม่หลุด
  const changedAt = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 10),
      mustChangePassword: false,
      passwordChangedAt: changedAt,
    },
  });
  passwordChanged(user.id, changedAt);

  // โทเคนเดิมยังพกธง "ต้องเปลี่ยนรหัส" อยู่ ถ้าไม่ออกใบใหม่ผู้ใช้จะยังถูกกันอยู่ดี
  res.json({
    ok: true,
    token: signToken({ userId: user.id, role: user.role as Role }),
  });
});

const userUpdateSchema = z.object({
  role: z.enum(ROLES).optional(),
  /**
   * ภาคเดียว — แอปรุ่นที่ยังเลือกได้ภาคเดียว (เปิดค้างอยู่ในเครื่องคนได้อีกพักหนึ่ง) ส่งแบบนี้
   * แทนที่ภาคแรกเท่านั้น ภาคที่เพิ่มไว้ยังอยู่ (เว้นตัวที่ซ้ำกับภาคใหม่) · null = เอาภาคแรกออก ภาคถัดไปขึ้นแทน
   * แอปรุ่นเก่าไม่เห็นภาคที่เพิ่ม จะให้มันลบสิ่งที่มองไม่เห็นไม่ได้
   */
  region: z.string().trim().max(120).nullable().optional(),
  // ภาคที่ดูแลทั้งชุด (แทนที่ของเดิม) — ส่งมาพร้อม region ใช้ตัวนี้
  regions: z.array(REGION_NAME).max(20, "เลือกภาคได้ไม่เกิน 20 ภาค").optional(),
  /**
   * ทีมช่างที่สังกัด — ตรงกับ Branch.zone ซึ่งมาจากคอลัมน์ "ทีมช่าง" ในไฟล์ทะเบียนสาขา
   * Senior ช่าง: แทนที่ทีมแรกเท่านั้น ทีมที่เพิ่มไว้ยังอยู่ — แอปรุ่นที่เลือกได้ทีมเดียวมองไม่เห็นทีมที่เพิ่ม
   * จะให้มันลบสิ่งที่มองไม่เห็นไม่ได้ (กติกาเดียวกับ region/regions)
   */
  team: z.string().trim().max(120).nullable().optional(),
  // ทีม/ทีมรวมทั้งชุด (แทนที่ของเดิม · อันแรกเก็บที่ team) — ส่งมาพร้อม team ใช้ตัวนี้ · ช่างธรรมดาส่งได้ไม่เกินหนึ่ง
  teams: TEAM_LIST.optional(),
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
  // สาขาที่ Maid (COCO) ประจำ — ส่งมาทั้งชุด (แทนที่ของเดิม)
  maidBranches: z.array(z.string().trim().min(1).max(30)).max(50).optional(),
});

router.patch("/users/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสผู้ใช้ไม่ถูกต้อง" });

  const parsed = userUpdateSchema.safeParse(req.body);
  // ข้อความแรกเป็นภาษาไทยอยู่แล้ว — ส่งทั้งก้อน flatten หน้าจอจะโชว์เป็น JSON ดิบ
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const body = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { role: true, deletedAt: true, employeeCode: true, region: true, extraRegions: true, team: true, extraTeams: true },
  });
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

  const finalRole = body.role ?? target.role;
  let maidIds: number[] | null = null;
  if (body.maidBranches !== undefined) {
    if (finalRole !== "COCO_MAID") return res.status(400).json({ error: "สาขาที่ประจำใช้กับ Maid (COCO) เท่านั้น" });
    const r = await maidBranchIds(body.maidBranches);
    if ("error" in r) return res.status(400).json({ error: r.error });
    maidIds = r.ids;
  }
  // เปลี่ยนเป็นบทบาทอื่น → ล้างสาขาที่ประจำ ไม่งั้นเปลี่ยนกลับเป็น Maid ทีหลังจะเห็นสาขาเก่าที่ลืมไปแล้ว
  const clearMaid = finalRole !== "COCO_MAID" && target.role === "COCO_MAID";
  let regionData: { region: string | null; extraRegions: string[] } | null = null;
  if (body.regions !== undefined || body.region !== undefined) {
    const held = regionsOf(target);
    // ภาคเดียวแบบเดิม: ขึ้นเป็นภาคแรก ภาคที่เพิ่มไว้อยู่ต่อ (ตัวซ้ำถูกตัดใน resolveRegions) · null = ภาคถัดไปขึ้นแทน
    const r = await resolveRegions(body.regions ?? [body.region ?? null, ...held.slice(1)], held);
    if ("error" in r) return res.status(400).json({ error: r.error });
    regionData = r;
  }
  /**
   * ทีมของช่าง/Senior ช่าง — ตรวจชื่อและแยกเป็น team + extraTeams
   * ทีมเดียวแบบเดิมกับ Senior: ขึ้นเป็นทีมแรก ทีมที่เพิ่มไว้อยู่ต่อ · null = ทีมถัดไปขึ้นแทน
   * บทบาทอื่นยังรับ team แบบเดิม (ไม่ตรวจ) — เปลี่ยนบทบาทออกจากช่างก็ถูกล้างข้างล่างอยู่แล้ว
   */
  let teamData: { team: string | null; extraTeams: string[] } | null = null;
  if (body.teams !== undefined || body.team !== undefined) {
    if (TECH_ROLES.includes(finalRole)) {
      const held = teamsOf(target);
      const input = body.teams ?? (finalRole === "SENIOR_TECH" ? [body.team, ...held.slice(1)] : [body.team]);
      const r = await resolveTeams(input, held);
      if ("error" in r) return res.status(400).json({ error: r.error });
      if (finalRole === "EMPLOYEE" && r.extraTeams.length) return res.status(400).json({ error: ONE_TEAM_ONLY });
      teamData = r;
    } else if (body.teams !== undefined) {
      return res.status(400).json({ error: "เลือกหลายทีมได้เฉพาะ Senior ช่าง" });
    }
  }

  const updated = await prisma.$transaction(
    async (tx) => {
      if (maidIds !== null || clearMaid) await tx.cocoMaidBranch.deleteMany({ where: { userId: id } });
      if (maidIds?.length) await tx.cocoMaidBranch.createMany({ data: maidIds.map((branchId) => ({ userId: id, branchId })) });
      const u = await tx.user.update({
        where: { id },
        data: {
          ...(body.role !== undefined ? { role: body.role } : {}),
          // ภาคมีความหมายเฉพาะกับหัวหน้าภาค เปลี่ยนเป็นบทบาทอื่นก็ล้างทิ้งทุกภาค
          // (ค้างไว้ = เปลี่ยนกลับเป็นหัวหน้าภาคทีหลังได้ภาคเก่าที่ลืมไปแล้วติดมา และรายงานยังโชว์ภาคของคนที่ไม่ได้ดูแลแล้ว)
          ...(regionData ?? {}),
          ...(body.role !== undefined && body.role !== "SUPERVISOR" ? { region: null, extraRegions: [] } : {}),
          // ทีมมีความหมายเฉพาะกับช่าง/Senior ช่าง เพราะเป็นตัวบอกว่าเห็นงานของทีมไหน
          // (เดิมเทียบกับ EMPLOYEE ตรง ๆ — ตั้งเป็น Senior แล้วทีมถูกล้างทิ้งทันที)
          ...(teamData ?? (body.team !== undefined ? { team: cleanName(body.team) } : {})),
          ...(body.role !== undefined && !TECH_ROLES.includes(body.role) ? { team: null } : {}),
          // ทีมที่เพิ่มเป็นของ Senior เท่านั้น — ลดเป็นช่างธรรมดาคงทีมแรกไว้ ที่เหลือล้าง
          // (teamsOf ไม่อ่านค่าค้างอยู่แล้ว แต่ค้างไว้ = ตั้งกลับเป็น Senior ทีหลังได้ทีมเก่าที่ลืมไปแล้วติดมา)
          ...(finalRole !== "SENIOR_TECH" ? { extraTeams: [] } : {}),
          // ตั้งเป็น Senior โดยไม่ได้เลือกทีม (กดชิปบทบาทบนการ์ด) = เริ่มจากทีมแรกที่เห็นบนการ์ดเท่านั้น
          // ค่าค้างในคอลัมน์ (แก้ฐานข้อมูลด้วยมือ หรือบันทึกที่ชนกับการลดบทบาท) ไม่มีแอดมินคนไหนเลือก แต่จะกลายเป็นสิทธิ์ทันที
          ...(teamData === null && finalRole === "SENIOR_TECH" && target.role !== "SENIOR_TECH" ? { extraTeams: [] } : {}),
          ...(body.supervisedTeams !== undefined
            ? { supervisedTeams: [...new Set(body.supervisedTeams.map(cleanName).filter((t): t is string => !!t))] }
            : {}),
          ...(body.role !== undefined && body.role !== "SUPERVISOR" ? { supervisedTeams: [] } : {}),
          ...(body.employeeCode !== undefined ? { employeeCode: body.employeeCode } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
        },
        select: MANAGED_USER_SELECT,
      });
      // บันทึกทีมที่อ่านบทบาทตอนยังเป็น Senior แต่มีแอดมินอีกคนลดบทบาทไปก่อนถึงคิวเขียน — แถวที่เขียนแล้วบอกบทบาทจริง
      // ทีมที่เพิ่มบนคนที่ไม่ใช่ Senior ไม่ให้สิทธิ์อยู่แล้ว (teamsOf) แต่ค้างไว้ = ตั้งกลับเป็น Senior ทีหลังได้ทีมนั้นติดมา
      if (u.role !== "SENIOR_TECH" && u.extraTeams.length) {
        return tx.user.update({ where: { id }, data: { extraTeams: [] }, select: MANAGED_USER_SELECT });
      }
      return u;
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
  rememberUser(updated.id, updated.role as Role);
  res.json(managedUser(updated));
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
          // แอดมินที่เคยเปลี่ยนเวลาปิดรับปล่อยงานอย่างเดียว ก็ถือว่ามีประวัติ — ลบจริงแล้ว "เปลี่ยนล่าสุด: …" กลายเป็นไม่มีชื่อ
          // และไม่มีใครบอกได้ว่าใครเปลี่ยนจากอะไรเป็นอะไร (เจ้าของงานขอให้บันทึกไว้ คำถามข้อ 13)
          appSettingsChanged: true,
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
          extraTeams: [],
          region: null,
          extraRegions: [],
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
