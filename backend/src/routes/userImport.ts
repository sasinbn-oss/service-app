/**
 * นำเข้ารายชื่อหัวหน้าภาคและช่างจากไฟล์ประกาศแบ่งทีม (แอดมิน)
 *
 * สองขั้นแบบเดียวกับนำเข้าทะเบียนสาขา: preview อ่านไฟล์แล้วบอกว่าจะสร้าง/แก้ใคร
 * ทีมไหนเดาได้ ทีมไหนต้องเลือกเอง → commit บันทึกตามที่แอดมินยืนยันในหน้าตัวอย่าง
 * commit รับรายชื่อจากหน้าตัวอย่าง (ไม่อ่านไฟล์ซ้ำ) เพราะแอดมินแก้คู่ทีมไปแล้วในหน้านั้น
 * แต่ตรวจทุกค่าซ้ำที่นี่ — ชื่อทีมต้องมีจริง และตั้งได้แค่สิทธิ์ช่าง/หัวหน้าภาค
 */
import { Router } from "express";
import crypto from "crypto";
import ExcelJS from "exceljs";
import bcrypt from "bcryptjs";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { ADMIN_ROLES, ROLE_LABELS } from "../utils/constants";
import { parseAreaTeam, parseMaidList } from "../users/areaTeamImport";
import { documentPath, saveDocument } from "../documents/store";
import { displayName, parseRoster, readRows, suggestTeam } from "../users/rosterImport";
import { resolveTeam, teamAliasMap } from "../utils/teamAliases";
import { teamGroups, teamsOf } from "../utils/teamGroups";
import { staleUsers } from "../utils/userGate";

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
  // ทีมรวมเลือกได้เหมือนทีมช่าง — ชื่อตรงกับพื้นที่ในบันทึก ("Senior บางน้ำจืด หลักสี่ ลาดพร้าว") จับคู่ได้เอง
  const groups = [...(await teamGroups()).keys()];
  return [...new Set([...cm.map((r) => r.zone!), ...pm.map((r) => r.pmTeam!), ...groups])].sort((a, b) => a.localeCompare(b, "th"));
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
      select: { id: true, employeeCode: true, name: true, role: true, team: true, extraTeams: true },
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
        // teams = ทุกทีมที่ถืออยู่ — หน้าตัวอย่างบอกได้ว่า Senior ช่างคนนี้คงทีมเดิมไว้ครบ
        existing: u ? { name: u.name, role: u.role, team: u.team, teams: teamsOf(u) } : null,
        // แอดมินที่อยู่ในบันทึกด้วย (เช่นเป็นหัวหน้าภาคด้วย) ไม่ถูกลดสิทธิ์ — การนำเข้าไม่ใช่ที่ถอดแอดมิน
        // Senior ช่างที่ไฟล์ระบุเป็นช่างก็คงเป็น Senior — ไฟล์บันทึกแบ่งทีมไม่มีตำแหน่งนี้ (ดูหน้า commit)
        keepsRole: !!u && (ADMIN_ROLES.includes(u.role) || (u.role === "SENIOR_TECH" && p.role === "EMPLOYEE")),
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
        select: { id: true, employeeCode: true, role: true, team: true, extraTeams: true, supervisedTeams: true },
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
        if (p.role === "EMPLOYEE" && !team && !(u && teamsOf(u).length)) withoutTeam++;
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
        /**
         * Senior ช่างที่ไฟล์ระบุเป็นช่าง — ไฟล์บันทึกแบ่งทีมไม่มีตำแหน่ง Senior และมีทีมเดียวต่อคน
         * เดิมนำเข้าแล้วถูกลดเป็นช่างทีมเดียวเงียบ ๆ (ทีมที่เพิ่มหาย เห็นงานน้อยลงทันที) — คงตำแหน่ง แล้วรวมทีมในไฟล์เข้าไป
         * ไม่แทนที่ (กติกาเดียวกับ supervisedTeams ข้างล่าง) · เอาทีมออกทำที่การ์ด · ไฟล์ระบุเป็นหัวหน้าภาค = เปลี่ยนตามไฟล์
         */
        if (!keepRole && u.role === "SENIOR_TECH" && p.role === "EMPLOYEE") {
          const held = teamsOf(u);
          const all = team && !held.includes(team) ? [...held, team] : held;
          await tx.user.update({ where: { id: u.id }, data: { name, team: all[0] ?? null, extraTeams: all.slice(1) } });
          updated++;
          continue;
        }
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
                  // ทีมที่เพิ่มเป็นของ Senior เท่านั้น — คนที่ไม่ใช่ Senior หลังนำเข้าไม่ควรมีค่าค้าง
                  extraTeams: [],
                  // รวมกับทีมเดิม ไม่แทนที่ — ไฟล์ที่มีช่างแค่บางคนของหัวหน้าภาค (เพิ่มคนใหม่ทีละชุด)
                  // เคยทำให้ทีมอื่นที่เขาดูแลหายไปเงียบ ๆ แล้วมองไม่เห็นงานของทีมเหล่านั้น · เอาทีมออกทำที่การ์ด
                  supervisedTeams: p.role === "SUPERVISOR" ? [...new Set([...u.supervisedTeams, ...supTeams])] : [],
                  // ไม่ใช่หัวหน้าภาคแล้ว = ล้างทุกภาค · ยังเป็นหัวหน้าภาค = คงภาคเดิม (ไฟล์รายชื่อไม่มีคอลัมน์ภาค)
                  ...(p.role !== "SUPERVISOR" ? { region: null, extraRegions: [] } : {}),
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
  // คนที่เข้าระบบไว้แล้วถูกตั้งเป็นหัวหน้าภาค ต้องใช้สิทธิ์ใหม่ได้ทันที ไม่ใช่หลังเข้าระบบใหม่
  staleUsers();
  res.json({ ok: true, created, updated, withoutTeam });
});


// ── Area Team (Area · Supervisor (COCO) · Maid (COCO)) ─────────────────────

/**
 * นำเข้าไฟล์ Area Team (แอดมิน · เจ้าของงานขอ ต.ค. 69) — สร้าง/อัปเดตบัญชี Area และ Supervisor (COCO)
 * แล้วผูกสาขา COCO กับ Supervisor ที่ดูแล (Branch.cocoSupervisorId)
 *
 * แบบเดียวกับนำเข้าใบแจ้งซ่อม: ส่งไฟล์ครั้งแรกได้ตัวอย่าง (ไม่บันทึก) · ส่งไฟล์เดิมพร้อม apply=1 ถึงบันทึก
 * อ่านไฟล์ใหม่ทุกครั้ง ไม่เชื่อรายการที่หน้าจอส่งกลับมา — ไม่มีอะไรให้แก้ในหน้าตัวอย่างอยู่แล้ว
 *
 * อัปไฟล์ซ้ำได้ (ย้ายสาขา · เปลี่ยนคน): คนที่มีบัญชีแล้วอัปเดตชื่อ/เบอร์/Area ไม่แตะรหัสผ่าน
 * สาขาที่ Supervisor ในไฟล์เคยถือแต่ไม่อยู่ในไฟล์แล้ว ถูกปลดออก · คนที่ไม่อยู่ในไฟล์ไม่ถูกแตะ
 * (ไฟล์ที่มีแค่บาง Area จะไม่ไปปลดสาขาของ Area อื่น — ลบคนออกทำที่หน้าสิทธิ์ผู้ใช้)
 *
 * ปุ่มเดียวกันรับไฟล์รายชื่อ Maid (COCO) ด้วย (เจ้าของงานขอ ต.ค. 69 — แอดมินไม่ต้องจำว่าไฟล์ไหนเข้าปุ่มไหน)
 * แยกจากหัวตาราง: ไฟล์ Maid มีคอลัมน์ User แทน Mail · สาขาของ Maid ในไฟล์แทนที่ของเดิมทั้งชุด (CocoMaidBranch)
 * ชื่อผู้ใช้ที่เป็นตำแหน่งอื่นอยู่แล้ว (รวม Area/Supervisor) ถูกข้าม — Maid เป็นตำแหน่งที่เห็นแคบสุด ไม่ลดตำแหน่งใครจากไฟล์
 *
 * รหัสผ่านสุ่มให้แต่ละคน ไม่ใช่รหัสเดียวกันทั้งไฟล์ เพราะคนในไฟล์เป็นคนนอกฝ่ายช่าง ร้อยกว่าคน
 * รหัสเดียวกันคือใครรู้รหัสก็เข้าบัญชีคนอื่นได้ทั้งหมดก่อนเขาจะเปลี่ยน · รหัสออกมาในไฟล์ Excel ครั้งเดียว
 * (เก็บแค่ hash) ทุกคนต้องเปลี่ยนตอนเข้าครั้งแรก · ไฟล์หาย → นำเข้าซ้ำพร้อมเลือก "ตั้งรหัสใหม่ให้คนที่ยังไม่เคยเข้าระบบ"
 */
const AREA_ROLES = ["AREA", "COCO_SUPERVISOR", "COCO_MAID"];
// ไม่มี 0/O/1/l/I — รหัสถูกอ่านจากกระดาษ/แชตไปพิมพ์ในมือถือ
const PASS_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
const randomPassword = () => Array.from({ length: 8 }, () => PASS_CHARS[crypto.randomInt(PASS_CHARS.length)]).join("");

const areaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post("/area-team", requireAuth, requireAdmin, areaUpload.single("file"), async (req: AuthRequest, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "ต้องแนบไฟล์ Area Team (.xlsx)" });
  const fileName = Buffer.from(file.originalname, "latin1").toString("utf8");
  let rows: string[][];
  try {
    rows = await readRows(file.buffer, fileName);
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "อ่านไฟล์ไม่ได้" });
  }
  const plan = parseAreaTeam(rows) ?? parseMaidList(rows);
  if (!plan || plan.supervisors.length + plan.areas.length + plan.maids.length === 0) {
    return res.status(400).json({
      error:
        'ไม่พบรายชื่อในไฟล์ — ไฟล์ Area Team ต้องมีหัวตาราง "ERP", "Name-Surname (Thai)", "Mail", "Area" และ "Mail" ของ Area · ' +
        'ไฟล์รายชื่อ Maid ต้องมี "ERP", "Name-Surname (Thai)" และ "User"',
    });
  }
  const apply = req.body?.apply === "1" || req.body?.apply === "true";
  const resetPending = req.body?.resetPending === "1" || req.body?.resetPending === "true";

  const logins = [...plan.areas, ...plan.supervisors, ...plan.maids].map((p) => p.login);
  const codes = [...plan.areas, ...plan.supervisors, ...plan.maids].flatMap((s) => s.branches);
  const [existing, branches] = await Promise.all([
    prisma.user.findMany({
      where: { employeeCode: { in: logins }, deletedAt: null },
      select: { id: true, employeeCode: true, name: true, role: true, mustChangePassword: true },
    }),
    prisma.branch.findMany({ where: { code: { in: codes } }, select: { id: true, code: true, cancelledAt: true } }),
  ]);
  const byLogin = new Map(existing.map((u) => [u.employeeCode, u]));
  const knownBranch = new Map(branches.map((b) => [b.code, b]));
  // ชื่อผู้ใช้ชนกับบัญชีตำแหน่งอื่น (ช่าง/แอดมิน) — ไม่เปลี่ยนตำแหน่งให้ การนำเข้าไม่ใช่ที่ถอด/ย้ายตำแหน่งคนในระบบ
  // ไฟล์ Maid ข้ามทุกตำแหน่งที่ไม่ใช่ Maid — Area/Supervisor ที่ชื่อผู้ใช้ชนกันจะได้ไม่ถูกลดเป็น Maid
  const maidLogins = new Set(plan.maids.map((m) => m.login));
  const taken = existing.filter((u) => (maidLogins.has(u.employeeCode) ? u.role !== "COCO_MAID" : !AREA_ROLES.includes(u.role)));
  const skip = new Set(taken.map((u) => u.employeeCode));
  const missingBranches = codes.filter((c) => !knownBranch.has(c));
  const notCoco = codes.filter((c) => knownBranch.has(c) && !/^c/i.test(c));

  const people = [
    ...plan.areas.map((a) => ({ ...a, role: "AREA", phone: null as string | null, areaLogin: null as string | null })),
    ...plan.supervisors.map((s) => ({ ...s, role: "COCO_SUPERVISOR" })),
    ...plan.maids.map((m) => ({ ...m, role: "COCO_MAID", areaLogin: null as string | null })),
  ].map((p) => {
    const u = byLogin.get(p.login);
    return {
      ...p,
      status: skip.has(p.login) ? "TAKEN" : u ? "UPDATE" : "NEW",
      existingRole: u?.role ?? null,
      pending: !!u?.mustChangePassword,
      branches: p.branches.filter((c) => knownBranch.has(c)),
      unknownBranches: p.branches.filter((c) => !knownBranch.has(c)),
    };
  });
  const summary = {
    areas: plan.areas.length,
    supervisors: plan.supervisors.length,
    maids: plan.maids.length,
    branches: codes.length - missingBranches.length,
    create: people.filter((p) => p.status === "NEW").length,
    update: people.filter((p) => p.status === "UPDATE").length,
    taken: taken.map((u) => ({ login: u.employeeCode, name: u.name, role: u.role })),
    missingBranches,
    notCoco,
    problems: plan.problems,
  };
  if (!apply) return res.json({ fileName, summary, people });

  // ── บันทึก ──
  const wanted = people.filter((p) => p.status !== "TAKEN");
  const fresh = wanted.filter((p) => p.status === "NEW" || (resetPending && p.status === "UPDATE" && p.pending));
  // hash ก่อนเปิด transaction — bcrypt คนละ ~0.1 วิ ร้อยกว่าคนเกินเพดาน transaction ถ้าทำข้างใน
  const passwords = new Map<string, string>();
  const hashes = new Map<string, string>();
  for (const p of fresh) {
    const pw = randomPassword();
    passwords.set(p.login, pw);
    hashes.set(p.login, await bcrypt.hash(pw, 10));
  }
  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      const created = wanted.filter((p) => p.status === "NEW");
      if (created.length) {
        await tx.user.createMany({
          data: created.map((p) => ({
            employeeCode: p.login,
            name: p.name,
            phone: p.phone,
            role: p.role,
            passwordHash: hashes.get(p.login)!,
            mustChangePassword: true,
          })),
        });
      }
      const ids = new Map(
        (await tx.user.findMany({ where: { employeeCode: { in: wanted.map((p) => p.login) }, deletedAt: null }, select: { id: true, employeeCode: true } })).map(
          (u) => [u.employeeCode, u.id]
        )
      );
      /**
       * อัปเดตทั้งชุดในคำสั่งเดียว (UNNEST) ไม่ใช่ทีละคน — ฐานข้อมูลจริงอยู่คนละ region
       * 156 คน + 433 สาขาทีละแถวคือหลายร้อยรอบไปกลับ เกินเพดาน transaction
       * ส่งเป็น text[] แล้ว cast เอง (CLAUDE.md: array ที่เป็น null ทั้งก้อนถูกเดาชนิดผิด)
       * ไม่ต้องล้างภาค (region/extraRegions) ตรงนี้ — บัญชีหัวหน้าภาคที่ชื่อผู้ใช้ชนกับไฟล์ถูกข้ามเป็น TAKEN ตั้งแต่ข้างบน
       * ไฟล์นี้จึงอัปเดตได้แค่บัญชีฝั่ง Area ซึ่งไม่มีภาคอยู่แล้ว
       */
      const ppl = wanted.map((p) => ({ id: String(ids.get(p.login)), p }));
      await tx.$executeRaw`
        UPDATE "User" u SET "name" = d.name, "phone" = COALESCE(NULLIF(d.phone, ''), u."phone"), "role" = d.role,
          "areaId" = NULLIF(d.area, '')::int
        FROM UNNEST(${ppl.map((x) => x.id)}::text[], ${ppl.map((x) => x.p.name)}::text[], ${ppl.map((x) => x.p.phone ?? "")}::text[],
                    ${ppl.map((x) => x.p.role)}::text[], ${ppl.map((x) => (x.p.areaLogin ? String(ids.get(x.p.areaLogin) ?? "") : ""))}::text[])
          AS d(id, name, phone, role, area)
        WHERE u.id = d.id::int`;
      const reset = fresh.filter((p) => p.status === "UPDATE");
      if (reset.length) {
        await tx.$executeRaw`
          UPDATE "User" u SET "passwordHash" = d.hash, "mustChangePassword" = true, "passwordChangedAt" = ${now}
          FROM UNNEST(${reset.map((p) => String(ids.get(p.login)))}::text[], ${reset.map((p) => hashes.get(p.login)!)}::text[]) AS d(id, hash)
          WHERE u.id = d.id::int`;
      }
      // สาขาที่ Maid ประจำ — ไฟล์คือคำตอบล่าสุด แทนที่ของเดิมทั้งชุด · คนที่ไฟล์ Area Team เลื่อนจาก Maid
      // ขึ้นเป็น Area/Supervisor ล้างด้วย ไม่งั้นเปลี่ยนกลับเป็น Maid ทีหลังจะเห็นสาขาเก่าที่ลืมไปแล้ว
      await tx.cocoMaidBranch.deleteMany({ where: { userId: { in: ppl.map((x) => Number(x.id)) } } });
      const maidLinks = ppl
        .filter((x) => x.p.role === "COCO_MAID")
        .flatMap((x) => x.p.branches.map((code) => ({ userId: Number(x.id), branchId: knownBranch.get(code)!.id })));
      if (maidLinks.length) await tx.cocoMaidBranch.createMany({ data: maidLinks, skipDuplicates: true });

      // สาขาที่ Supervisor ในไฟล์เคยถือ แต่ไฟล์รอบนี้ไม่ได้ให้แล้ว (ย้ายไปคนอื่น/ปิดสาขา) — ปลดก่อนผูกใหม่
      // ป้าย "ดูแลแทน" ที่ตั้งจากผังฝั่ง Area ล้างด้วย — ไฟล์คือคำตอบล่าสุดว่าสาขาเป็นของใคร
      // Maid ไม่ใช่ผู้ดูแลสาขา — สาขาของ Maid ห้ามไปทับ Supervisor ของสาขานั้น
      const holders = ppl.filter((x) => x.p.role !== "COCO_MAID");
      const supIds = holders.map((x) => Number(x.id));
      if (supIds.length) {
        await tx.branch.updateMany({
          where: { cocoSupervisorId: { in: supIds } },
          data: { cocoSupervisorId: null, coverForId: null, coverForName: null, coverSince: null },
        });
      }
      const links = holders.flatMap((x) => x.p.branches.map((code) => ({ code, id: x.id })));
      if (links.length) {
        await tx.$executeRaw`
          UPDATE "Branch" b SET "cocoSupervisorId" = d.sup::int, "coverForId" = NULL, "coverForName" = NULL, "coverSince" = NULL
          FROM UNNEST(${links.map((l) => l.code)}::text[], ${links.map((l) => l.id)}::text[]) AS d(code, sup)
          WHERE b.code = d.code`;
      }
    },
    { timeout: 60_000, maxWait: 15_000 }
  );
  // ตำแหน่งใหม่ต้องมีผลทันที (ตัวตรวจสิทธิ์จำ role ไว้) · คนที่ถูกตั้งรหัสใหม่ต้องหลุดจากเครื่องเดิม
  staleUsers();

  let credentials: { filename: string; path: string } | null = null;
  if (passwords.size) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("บัญชีผู้ใช้");
    ws.addRow(["ชื่อผู้ใช้", "รหัสผ่านเริ่มต้น", "ชื่อ", "ตำแหน่ง", "Area (หัวหน้า)", "สาขา", "เบอร์"]).font = { bold: true };
    const areaName = new Map(plan.areas.map((a) => [a.login, a.name]));
    for (const p of fresh) {
      const lead = "lead" in p ? p.lead ?? "" : p.areaLogin ? areaName.get(p.areaLogin) ?? "" : "";
      ws.addRow([p.login, passwords.get(p.login), p.name, ROLE_LABELS[p.role], lead, p.role === "AREA" ? "COCO ทั้งหมด" : p.branches.join(" "), p.phone ?? ""]);
    }
    ws.addRow([]);
    ws.addRow(["ทุกคนต้องเปลี่ยนรหัสผ่านตอนเข้าระบบครั้งแรก · ไฟล์นี้คือรหัสผ่านจริง ส่งให้เจ้าของบัญชีแล้วลบทิ้ง"]).font = { italic: true };
    [18, 16, 36, 18, 30, 40, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    const stamp = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const stored = saveDocument({
      filename: `บัญชี-Area-Team-${stamp}.xlsx`,
      asciiFilename: `area-team-accounts-${stamp}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: Buffer.from(await wb.xlsx.writeBuffer()),
      ownerId: req.auth!.userId,
    });
    credentials = { filename: stored.filename, path: documentPath(stored) };
  }
  res.json({
    ok: true,
    created: wanted.filter((p) => p.status === "NEW").length,
    updated: wanted.filter((p) => p.status === "UPDATE").length,
    passwordsIssued: passwords.size,
    branchesLinked: wanted.reduce((n, p) => n + p.branches.length, 0),
    skipped: taken.length,
    credentials,
  });
});

export default router;
