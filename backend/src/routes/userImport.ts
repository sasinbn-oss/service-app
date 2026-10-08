/**
 * นำเข้ารายชื่อหัวหน้าภาคและช่างจากไฟล์ประกาศแบ่งทีม (แอดมิน)
 *
 * สองขั้นแบบเดียวกับนำเข้าทะเบียนสาขา: preview อ่านไฟล์แล้วบอกว่าจะสร้าง/แก้ใคร
 * ทีมไหนเดาได้ ทีมไหนต้องเลือกเอง → commit บันทึกตามที่แอดมินยืนยันในหน้าตัวอย่าง
 * commit รับรายชื่อจากหน้าตัวอย่าง (ไม่อ่านไฟล์ซ้ำ) เพราะแอดมินแก้คู่ทีมไปแล้วในหน้านั้น
 * แต่ตรวจทุกค่าซ้ำที่นี่ — ชื่อทีมต้องมีจริง และตั้งได้แค่สิทธิ์ช่าง/หัวหน้าภาค
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { ADMIN_ROLES } from "../utils/constants";
import { displayName, parseRoster, readRows, suggestTeam } from "../users/rosterImport";
import { resolveTeam, teamAliasMap } from "../utils/teamAliases";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/** ทีมทั้งหมดที่มีในทะเบียนสาขา (ทีม CM + ทีม PM) — ชุดเดียวกับตัวเลือกทีมในหน้าสิทธิ์ผู้ใช้ */
async function knownTeams() {
  const [cm, pm] = await Promise.all([
    prisma.branch.findMany({ where: { zone: { not: null }, cancelledAt: null }, select: { zone: true }, distinct: ["zone"] }),
    prisma.branch.findMany({ where: { pmTeam: { not: null }, cancelledAt: null }, select: { pmTeam: true }, distinct: ["pmTeam"] }),
  ]);
  return [...new Set([...cm.map((r) => r.zone!), ...pm.map((r) => r.pmTeam!)])].sort((a, b) => a.localeCompare(b, "th"));
}

router.post("/preview", requireAuth, requireAdmin, upload.single("file"), async (req: AuthRequest, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "ต้องแนบไฟล์รายชื่อ (.ods หรือ .xlsx)" });
  // multer อ่านชื่อไฟล์เป็น latin1 — ชื่อไฟล์ภาษาไทยต้องแปลงกลับ
  const fileName = Buffer.from(file.originalname, "latin1").toString("utf8");
  let rows: string[][];
  try {
    rows = await readRows(file.buffer, fileName);
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "อ่านไฟล์ไม่ได้" });
  }
  const { people, problems } = parseRoster(rows);
  if (people.length === 0) {
    return res.status(400).json({
      error: 'ไม่พบรายชื่อในไฟล์ — ต้องมีแถวหัวตาราง "รหัสพนักงาน" และหัวข้อ "หัวหน้าภาค" แบบบันทึกแบ่งทีม',
    });
  }

  const [teams, aliases, existing] = await Promise.all([
    knownTeams(),
    teamAliasMap(),
    prisma.user.findMany({
      where: { employeeCode: { in: people.map((p) => p.code) }, deletedAt: null },
      select: { id: true, employeeCode: true, name: true, role: true, team: true },
    }),
  ]);
  const byCode = new Map(existing.map((u) => [u.employeeCode, u]));

  const areaCount = new Map<string, number>();
  for (const p of people) if (p.role === "EMPLOYEE" && p.area) areaCount.set(p.area, (areaCount.get(p.area) ?? 0) + 1);

  res.json({
    fileName,
    teams,
    problems,
    // ชื่อพื้นที่ที่เป็นชื่อทีมเดิม (เปลี่ยนชื่อในแอปไปแล้ว) ให้เดาเป็นชื่อปัจจุบัน
    areas: [...areaCount].map(([area, count]) => ({
      area,
      count,
      suggestion: suggestTeam(resolveTeam(area, aliases) ?? area, teams),
    })),
    people: people.map((p) => {
      const u = byCode.get(p.code);
      return {
        ...p,
        name: displayName(p),
        existing: u ? { name: u.name, role: u.role, team: u.team } : null,
        // แอดมินที่อยู่ในบันทึกด้วย (เช่นเป็นหัวหน้าภาคด้วย) ไม่ถูกลดสิทธิ์ — การนำเข้าไม่ใช่ที่ถอดแอดมิน
        keepsRole: !!u && ADMIN_ROLES.includes(u.role),
      };
    }),
  });
});

const commitSchema = z.object({
  // ต้องมีเฉพาะตอนมีคนใหม่ — นำเข้ารอบหลัง (ปรับทีม) ทุกคนมีบัญชีแล้ว ไม่ต้องตั้งรหัส
  password: z.string().optional(),
  teamMap: z.record(z.string(), z.string().nullable()),
  people: z
    .array(
      z.object({
        code: z.string().regex(/^\d{3,12}$/, "รหัสพนักงานไม่ถูกต้อง"),
        fullName: z.string().trim().min(1).max(120),
        nick: z.string().trim().max(40).nullable(),
        role: z.enum(["SUPERVISOR", "EMPLOYEE"]),
        area: z.string().max(200).nullable(),
        supervisorCode: z.string().nullable(),
      })
    )
    .min(1)
    .max(500),
});

router.post("/commit", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const parsed = commitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const { password, teamMap, people } = parsed.data;

  const teams = new Set(await knownTeams());
  for (const t of Object.values(teamMap)) {
    if (t && !teams.has(t)) return res.status(400).json({ error: `ไม่มีทีม "${t}" ในทะเบียนสาขา` });
  }
  const teamOf = (area: string | null) => (area ? teamMap[area] ?? null : null);

  // ทีมที่หัวหน้าภาคดูแล = ทีมของช่างที่อยู่ใต้หัวข้อของเขาในบันทึก
  const supervised = new Map<string, Set<string>>();
  for (const p of people) {
    const t = teamOf(p.area);
    if (p.role !== "EMPLOYEE" || !p.supervisorCode || !t) continue;
    if (!supervised.has(p.supervisorCode)) supervised.set(p.supervisorCode, new Set());
    supervised.get(p.supervisorCode)!.add(t);
  }

  const existing = new Map(
    (
      await prisma.user.findMany({
        where: { employeeCode: { in: people.map((p) => p.code) }, deletedAt: null },
        select: { id: true, employeeCode: true, role: true, team: true, supervisedTeams: true },
      })
    ).map((u) => [u.employeeCode, u])
  );
  // รหัสเดียวกันทุกคน — hash ครั้งเดียวพอ (77 คนแยกกัน hash ใช้เวลาหลายวินาที) ทุกคนต้องเปลี่ยนเองอยู่แล้ว
  const newcomers = people.filter((p) => !existing.has(p.code)).length;
  if (newcomers > 0 && (password ?? "").length < 8) {
    return res.status(400).json({ error: "รหัสตั้งต้นต้องยาวอย่างน้อย 8 ตัว" });
  }
  const passwordHash = newcomers > 0 ? await bcrypt.hash(password!, 10) : "";

  let created = 0;
  let updated = 0;
  let withoutTeam = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const p of people) {
        const u = existing.get(p.code);
        const name = displayName(p);
        const team = p.role === "EMPLOYEE" ? teamOf(p.area) : null;
        const supTeams = p.role === "SUPERVISOR" ? [...(supervised.get(p.code) ?? [])] : [];
        if (p.role === "EMPLOYEE" && !team && !u?.team) withoutTeam++;
        if (!u) {
          await tx.user.create({
            data: {
              employeeCode: p.code,
              name,
              role: p.role,
              team,
              supervisedTeams: supTeams,
              passwordHash,
              mustChangePassword: true,
            },
          });
          created++;
          continue;
        }
        const keepRole = ADMIN_ROLES.includes(u.role);
        await tx.user.update({
          where: { id: u.id },
          data: {
            name,
            ...(keepRole
              ? {}
              : {
                  role: p.role,
                  // ไม่มีคู่ทีม = คงทีมเดิมไว้ ดีกว่าล้างทิ้งจนช่างมองไม่เห็นงานของทีม
                  team: p.role === "EMPLOYEE" ? team ?? u.team : null,
                  supervisedTeams: p.role === "SUPERVISOR" ? (supTeams.length ? supTeams : u.supervisedTeams) : [],
                  ...(p.role !== "SUPERVISOR" ? { region: null } : {}),
                }),
          },
        });
        updated++;
      }
    },
    // นานกว่าที่อื่น (30 วิ) เพราะเขียนทีละคน — ฐานข้อมูลอยู่คนละ region ทุกคนคือการเดินทางไปกลับจริง
    // บันทึก 77 คนเกิน 30 วิได้ตอนเครือข่ายช้า แล้วจะล้มทั้งชุดทั้งที่ไม่มีอะไรผิด
    { timeout: 60_000, maxWait: 15_000 }
  );
  res.json({ ok: true, created, updated, withoutTeam });
});

export default router;
