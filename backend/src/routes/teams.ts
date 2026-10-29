/**
 * ทีมช่าง — ดูภาพรวมและเปลี่ยนชื่อทีม (แอดมิน)
 *
 * ทีมไม่มีตารางของตัวเอง ชื่อทีมเป็นข้อความที่ซ้ำอยู่หลายที่: สาขา (ทีม CM/PM) · ทีมของช่าง ·
 * ทีมที่หัวหน้าภาคดูแล · ใบงานที่จ่ายไปแล้ว · แผนรายวัน · คะแนนย้อนหลัง
 * เปลี่ยนชื่อจึงต้องเปลี่ยนทุกที่ในธุรกรรมเดียว ไม่งั้นคนที่ผูกกับชื่อเดิมจะมองไม่เห็นงาน
 * และจำชื่อเดิมไว้ให้ตัวนำเข้าไฟล์แปลงให้ (utils/teamAliases.ts)
 *
 * ย้ายสาขาเข้าทีม — บันทึกแยกไว้ใน BranchTeamMove ให้ตัวนำเข้าไฟล์ทะเบียนไม่ดึงสาขากลับ
 * ทำเพราะบันทึกแบ่งทีม (เช่น 4 ต.ค. 69) ตั้งทีมใหม่ที่ทะเบียนสาขายังไม่มี ทีมที่ไม่มีสาขา
 * เลือกให้ช่างไม่ได้ (รายชื่อทีมมาจากสาขา) แอดมินต้องรอคนแก้ไฟล์ต้นฉบับก่อนถึงจะใช้งานได้
 */
import { areaBranchWhere, areaWorkOrderWhere, isAreaTeam } from "../utils/areaScope";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { ACTIVE_WORK_ORDER_STATUSES, bangkokDay } from "../utils/constants";
import { forgetTeamGroups, teamGroups } from "../utils/teamGroups";
import { recordTeamMove } from "../utils/branchPins";
import { refreshOutsource } from "../utils/outsource";

const router = Router();

interface TeamRow {
  name: string;
  cmBranches: number;
  pmBranches: number;
  technicians: number;
  supervisors: number;
  openOrders: number;
  /** ไม่มีสาขาไหนใช้ชื่อนี้ — มักเป็นชื่อที่สะกดผิดหรือทีมที่ถูกเปลี่ยนชื่อในไฟล์แล้ว */
  orphan: boolean;
}

router.get("/", requireAuth, requireAdmin, async (_req, res) => {
  const active = [...ACTIVE_WORK_ORDER_STATUSES];
  const [cm, pm, techs, sups, orders, renames] = await Promise.all([
    prisma.branch.groupBy({ by: ["zone"], where: { zone: { not: null }, cancelledAt: null }, _count: true }),
    prisma.branch.groupBy({ by: ["pmTeam"], where: { pmTeam: { not: null }, cancelledAt: null }, _count: true }),
    prisma.user.groupBy({ by: ["team"], where: { team: { not: null }, deletedAt: null }, _count: true }),
    prisma.user.findMany({ where: { deletedAt: null, supervisedTeams: { isEmpty: false } }, select: { supervisedTeams: true } }),
    prisma.workOrder.groupBy({ by: ["assignedTeam"], where: { assignedTeam: { not: null }, status: { in: active } }, _count: true }),
    prisma.teamRename.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const groupRows = await prisma.teamGroup.findMany({ orderBy: { name: "asc" } });
  const moves = await prisma.branchTeamMove.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { branch: { select: { code: true, name: true } } },
  });
  const rows = new Map<string, TeamRow>();
  const row = (name: string) => {
    let r = rows.get(name);
    if (!r) {
      r = { name, cmBranches: 0, pmBranches: 0, technicians: 0, supervisors: 0, openOrders: 0, orphan: false };
      rows.set(name, r);
    }
    return r;
  };
  for (const c of cm) row(c.zone!).cmBranches = c._count;
  for (const p of pm) row(p.pmTeam!).pmBranches = p._count;
  for (const t of techs) row(t.team!).technicians = t._count;
  for (const s of sups) for (const t of new Set(s.supervisedTeams)) row(t).supervisors++;
  for (const o of orders) row(o.assignedTeam!).openOrders = o._count;
  for (const r of rows.values()) r.orphan = r.cmBranches === 0 && r.pmBranches === 0;
  // ชื่อทีมรวมมีช่าง/หัวหน้าภาคผูกอยู่แต่ไม่มีสาขาโดยตั้งใจ — แสดงแยกในส่วนทีมรวม ไม่ใช่ "ไม่มีในทะเบียนสาขา"
  const groupNames = new Set((await prisma.teamGroup.findMany({ select: { name: true } })).map((g) => g.name));
  // ทีม outsource ที่ไม่มีสาขาประจำ — แสดงแยกในส่วนของตัวเอง ไม่ใช่ "ไม่มีในทะเบียนสาขา"
  // ทีม outsource ที่ดูแลสาขาอยู่ด้วย (เช่น PWS) ยังอยู่ในรายการทีมปกติ ไม่งั้นจำนวนสาขา/คนหายจากหน้านี้
  const outsource = await prisma.outsourceTeam.findMany({ orderBy: { name: "asc" } });
  for (const o of outsource) {
    const r = rows.get(o.name);
    if (!r || (r.cmBranches === 0 && r.pmBranches === 0)) groupNames.add(o.name);
  }

  res.json({
    teams: [...rows.values()].filter((r) => !groupNames.has(r.name)).sort((a, b) => Number(a.orphan) - Number(b.orphan) || a.name.localeCompare(b.name, "th")),
    renames: renames.map((r) => ({ from: r.fromName, to: r.toName, at: r.createdAt })),
    groups: groupRows.map((g) => ({
      id: g.id,
      name: g.name,
      covers: g.covers,
      allTeams: g.allTeams,
      technicians: rows.get(g.name)?.technicians ?? 0,
      supervisors: rows.get(g.name)?.supervisors ?? 0,
    })),
    outsource: outsource.map((o) => ({ id: o.id, name: o.name, openOrders: rows.get(o.name)?.openOrders ?? 0 })),
    moves: moves.map((m) => ({
      id: m.id,
      code: m.branch.code,
      name: m.branch.name,
      field: m.field,
      from: m.fromTeam,
      to: m.toTeam,
      at: m.createdAt,
    })),
  });
});

/**
 * ผังผู้รับผิดชอบพื้นที่ — ภาค → หัวหน้าภาค → ทีมช่าง → ช่าง (เจ้าของงานขอ ต.ค. 69)
 *
 * ทุกคนเปิดดูได้ (ช่างรู้ว่าทีมไหนมีใคร หัวหน้าภาคเห็นภาพรวม) — แก้ได้เฉพาะแอดมิน ผ่าน PATCH /auth/users/:id
 * ตัวเดียวกับหน้าสิทธิ์ผู้ใช้ ไม่มีเส้นทางเขียนแยก จะได้ไม่มีกฎสองชุด
 * มีเบอร์โทรของทุกคนที่มีเบอร์ในระบบ — เดิมไม่ส่งเพราะช่างทุกคนเห็นผังนี้ เจ้าของงานตัดสินใจให้ใส่ (ต.ค. 69)
 * ผังมีไว้ให้รู้ว่าต้องโทรหาใคร ชื่ออย่างเดียวต้องไปหาเบอร์ต่อที่อื่น
 *
 * ภาคของทีม = ภาคที่สาขาของทีมนั้น (CM หรือ PM) อยู่มากที่สุด — ทะเบียนสาขาไม่มีตารางทีม
 * ช่างที่ทีมไม่มีในทะเบียนและไม่ใช่ทีมรวม นับเป็น "ยังไม่มีสังกัด" เพราะไม่มีใบงานผูกกับชื่อนั้น (ผลเท่ากัน)
 */
router.get("/coverage-map", requireAuth, async (req: AuthRequest, res) => {
  // Area Team เห็นเฉพาะทีมช่าง/หัวหน้าภาคที่ดูแลสาขาของตัวเอง — รู้ว่าสาขาตัวเองต้องติดต่อใคร
  const area = isAreaTeam(req.auth);
  const [branches, orders, users, groups] = await Promise.all([
    prisma.branch.findMany({
      where: { cancelledAt: null, ...(area ? { AND: [areaBranchWhere(req.auth!)] } : {}) },
      select: { region: true, zone: true, pmTeam: true },
    }),
    prisma.workOrder.groupBy({
      by: ["assignedTeam"],
      where: {
        assignedTeam: { not: null },
        status: { in: [...ACTIVE_WORK_ORDER_STATUSES] },
        ...(area ? { AND: [areaWorkOrderWhere(req.auth!)] } : {}),
      },
      _count: true,
    }),
    prisma.user.findMany({
      where: { deletedAt: null, role: { in: ["EMPLOYEE", "SUPERVISOR"] } },
      select: { id: true, name: true, employeeCode: true, phone: true, role: true, team: true, region: true, supervisedTeams: true },
      orderBy: { name: "asc" },
    }),
    prisma.teamGroup.findMany({ orderBy: { name: "asc" } }),
  ]);
  const NO_REGION = "ไม่ระบุภาค";
  const votes = new Map<string, Map<string, number>>();
  const count = new Map<string, number>();
  for (const b of branches) {
    for (const t of new Set([b.zone, b.pmTeam].filter(Boolean) as string[])) {
      count.set(t, (count.get(t) ?? 0) + 1);
      const m = votes.get(t) ?? new Map<string, number>();
      const r = b.region ?? NO_REGION;
      m.set(r, (m.get(r) ?? 0) + 1);
      votes.set(t, m);
    }
  }
  const open = new Map(orders.map((o) => [o.assignedTeam!, o._count]));
  const regions = new Map<string, { name: string; branches: number; open: number }[]>();
  for (const [team, m] of votes) {
    const r = [...m].sort((a, b) => b[1] - a[1])[0][0];
    regions.set(r, [...(regions.get(r) ?? []), { name: team, branches: count.get(team) ?? 0, open: open.get(team) ?? 0 }]);
  }
  const groupNames = new Set(groups.map((g) => g.name));
  const known = new Set(votes.keys());
  const viewing = !!req.auth!.viewAs;

  res.json({
    asOf: new Date(),
    canEdit: req.auth!.role === "ADMIN" && !req.auth!.partsAdmin && !viewing,
    regions: [...regions]
      // ภาคที่ไม่ระบุไว้ท้ายสุด ที่เหลือเรียงตามชื่อ
      .sort(([a], [b]) => (a === NO_REGION ? 1 : b === NO_REGION ? -1 : a.localeCompare(b, "th")))
      .map(([name, teams]) => ({ name, teams: teams.sort((a, b) => a.name.localeCompare(b.name, "th")) })),
    supervisors: users
      .filter((u) => u.role === "SUPERVISOR")
      .filter((u) => !area || u.supervisedTeams.some((t) => known.has(t)) || (!!u.region && regions.has(u.region)))
      .map((u) => ({ id: u.id, name: u.name, code: u.employeeCode, phone: u.phone, region: u.region, teams: u.supervisedTeams })),
    technicians: users
      .filter((u) => u.role === "EMPLOYEE")
      .filter((u) => !area || (!!u.team && known.has(u.team)))
      .map((u) => ({
        id: u.id,
        name: u.name,
        code: u.employeeCode,
        phone: u.phone,
        // ทีมที่ไม่มีในทะเบียนและไม่ใช่ทีมรวม = ไม่มีสังกัด (เก็บชื่อเดิมไว้ให้เห็นว่าเคยอยู่ไหน)
        team: u.team && (known.has(u.team) || groupNames.has(u.team)) ? u.team : null,
        staleTeam: u.team && !known.has(u.team) && !groupNames.has(u.team) ? u.team : null,
      })),
    groups: groups.map((g) => ({ name: g.name, covers: g.covers, allTeams: g.allTeams })),
  });
});

/**
 * ผังผู้ดูแลฝั่ง Area — Area → Supervisor (COCO) → สาขา COCO (เจ้าของงานขอ ต.ค. 69)
 *
 * ทุกคนเปิดดูได้ รวมช่างและหัวหน้าภาค — จะได้รู้ว่าสาขา COCO แต่ละแห่งต้องโทรหาใคร (เจ้าของงานเลือก)
 * แก้ได้: แอดมิน (ไม่ใช่ Admin Spare Part) และ Area ทุกคน ย้ายได้ทุก Area เท่ากับแอดมิน · ผังฝ่ายบริการยังแก้ได้แค่แอดมิน
 *
 * คนที่ถูกลบบัญชีแล้วแต่สาขายังผูกอยู่ (ลาออก) ถูกส่งมาด้วย (left) — ถ้าไม่ส่ง สาขาของเขาจะหายจากผัง
 * ทั้งที่ยังไม่มีใครดูแล และกด "ย้ายสาขาทั้งหมด" ให้คนดูแลแทนไม่ได้
 *
 * Maid (COCO) ส่งเป็น maids แยก + branches[].maids (ผังขึ้นใต้คนที่ถือสาขา) — เบอร์เห็นเท่ากับเบอร์ Supervisor
 * คือทุกคนที่เปิดผังได้ (ตามตัวอย่างที่เจ้าของงานตกลง ต.ค. 69) · Maid ที่ลบบัญชีแล้วไม่ส่ง เพราะไม่ได้ถือสาขา ไม่มีอะไรต้องย้ายต่อ
 */
const AREA_HOLDER_ROLES = ["AREA", "COCO_SUPERVISOR"];
const COCO_CODE = { startsWith: "C", mode: "insensitive" as const };
const canEditAreaMap = (auth: AuthRequest["auth"]) =>
  !!auth && !auth.viewAs && ((auth.role === "ADMIN" && !auth.partsAdmin) || auth.role === "AREA");

router.get("/area-map", requireAuth, async (req: AuthRequest, res) => {
  const [people, branches, orders, maidLinks] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: { in: AREA_HOLDER_ROLES },
        OR: [{ deletedAt: null }, { cocoBranches: { some: { cancelledAt: null, code: COCO_CODE } } }],
      },
      select: { id: true, name: true, employeeCode: true, phone: true, role: true, areaId: true, deletedAt: true },
      orderBy: { name: "asc" },
    }),
    prisma.branch.findMany({
      where: { cancelledAt: null, code: COCO_CODE },
      select: { id: true, code: true, name: true, cocoSupervisorId: true, coverForId: true, coverForName: true, coverSince: true },
      orderBy: { code: "asc" },
    }),
    prisma.workOrder.groupBy({
      by: ["branchId"],
      where: { status: { in: [...ACTIVE_WORK_ORDER_STATUSES] }, branch: { cancelledAt: null, code: COCO_CODE } },
      _count: true,
    }),
    // Maid (COCO) ไม่ใช่ผู้ดูแลสาขา จึงไม่อยู่ใน people (ไม่มีที่ให้ลากวาง) — ส่งแยกไว้ให้หน้าจอวาดใต้คนที่ถือสาขาที่ Maid ประจำ
    prisma.cocoMaidBranch.findMany({
      where: { user: { role: "COCO_MAID", deletedAt: null }, branch: { cancelledAt: null, code: COCO_CODE } },
      select: { branchId: true, user: { select: { id: true, name: true, employeeCode: true, phone: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);
  const openById = new Map(orders.map((o) => [o.branchId, o._count]));
  const maidsByBranch = new Map<number, number[]>();
  const maids = new Map<number, { id: number; name: string; code: string; phone: string | null }>();
  for (const l of maidLinks) {
    maidsByBranch.set(l.branchId, [...(maidsByBranch.get(l.branchId) ?? []), l.user.id]);
    maids.set(l.user.id, { id: l.user.id, name: l.user.name, code: l.user.employeeCode, phone: l.user.phone });
  }
  const areaIds = new Set(people.filter((p) => p.role === "AREA" && !p.deletedAt).map((p) => p.id));
  const known = new Set(people.map((p) => p.id));

  res.json({
    asOf: new Date(),
    canEdit: canEditAreaMap(req.auth),
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.employeeCode.replace(/~ลบ\d+$/, ""),
      phone: p.phone,
      role: p.role,
      // Area ที่ถูกลบแล้ว = ไม่มี Area · ผังไม่มีคอลัมน์ให้คนที่ลาออก
      areaId: p.role === "COCO_SUPERVISOR" && p.areaId && areaIds.has(p.areaId) ? p.areaId : null,
      left: !!p.deletedAt,
    })),
    branches: branches.map((b) => ({
      code: b.code,
      name: b.name,
      // ผูกกับคนที่ไม่ใช่ทีม Area (ข้อมูลเก่า/ตำแหน่งถูกเปลี่ยน) = ไม่มีผู้ดูแล
      holderId: b.cocoSupervisorId && known.has(b.cocoSupervisorId) ? b.cocoSupervisorId : null,
      open: openById.get(b.id) ?? 0,
      cover: b.coverForName ? { forId: b.coverForId, forName: b.coverForName, since: b.coverSince } : null,
      maids: maidsByBranch.get(b.id) ?? [],
    })),
    maids: [...maids.values()],
  });
});

const areaMapSchema = z.object({
  supervisors: z.array(z.object({ id: z.number().int(), areaId: z.number().int().nullable() })).max(2000).default([]),
  branches: z
    .array(
      z.object({
        code: z.string().min(1),
        holderId: z.number().int().nullable(),
        // ดูแลแทน — สาขาของใคร · ไม่ส่ง/null = ของคนที่ถือเลย (ย้ายถาวร หรือส่งต่อให้คนใหม่แล้ว)
        coverForId: z.number().int().nullable().optional(),
      })
    )
    .max(5000)
    .default([]),
});

/**
 * บันทึกผังฝั่ง Area ทั้งชุดในคำสั่งเดียว — หน้าจอเก็บการย้ายไว้จนกด "บันทึก" แล้วส่งมาทีเดียว
 *
 * เส้นทางแยกจาก PATCH /auth/users/:id เพราะ Area ต้องใช้ได้ด้วย และ Area ไม่ควรแตะช่องอื่นของผู้ใช้ (ตำแหน่ง รหัสผ่าน)
 * ตรวจทุกค่าที่นี่: ย้ายได้เฉพาะ Supervisor (COCO) · ปลายทางต้องเป็น Area/Supervisor ที่ยังอยู่ · สาขาต้องเป็น COCO ที่ยังเปิด
 * ย้ายสาขา = เปลี่ยนว่าใครเห็นใบงานของสาขานั้น (areaBranchWhere) มีผลทันทีหลังบันทึก
 */
router.post("/area-map", requireAuth, async (req: AuthRequest, res) => {
  if (!canEditAreaMap(req.auth)) return res.status(403).json({ error: "แก้ผังฝั่ง Area ได้เฉพาะแอดมินและ Area" });
  const parsed = areaMapSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "ข้อมูลการย้ายไม่ถูกต้อง" });
  const { supervisors, branches } = parsed.data;
  if (!supervisors.length && !branches.length) return res.status(400).json({ error: "ไม่มีการเปลี่ยนแปลง" });

  const ids = new Set<number>();
  for (const s of supervisors) {
    ids.add(s.id);
    if (s.areaId) ids.add(s.areaId);
  }
  for (const b of branches) {
    if (b.holderId) ids.add(b.holderId);
    if (b.coverForId) ids.add(b.coverForId);
  }
  const [users, found] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, role: true, deletedAt: true } }),
    prisma.branch.findMany({
      where: { code: { in: branches.map((b) => b.code) } },
      select: { code: true, cancelledAt: true, cocoSupervisorId: true, coverForId: true, coverSince: true },
    }),
  ]);
  const user = new Map(users.map((u) => [u.id, u]));
  const active = (id: number, roles: string[]) => {
    const u = user.get(id);
    return !!u && !u.deletedAt && roles.includes(u.role);
  };
  for (const s of supervisors) {
    if (!active(s.id, ["COCO_SUPERVISOR"])) return res.status(400).json({ error: "ย้ายได้เฉพาะ Supervisor (COCO) ที่ยังมีบัญชีอยู่" });
    if (s.areaId && !active(s.areaId, ["AREA"])) return res.status(400).json({ error: "Area ปลายทางไม่มีในระบบแล้ว — โหลดผังใหม่" });
  }
  const branchBy = new Map(found.map((b) => [b.code, b]));
  for (const b of branches) {
    const row = branchBy.get(b.code);
    if (!row || row.cancelledAt || !/^c/i.test(b.code)) return res.status(400).json({ error: `สาขา ${b.code} ไม่ใช่สาขา COCO ที่เปิดอยู่` });
    if (b.holderId && !active(b.holderId, AREA_HOLDER_ROLES)) {
      return res.status(400).json({ error: "คนที่จะรับสาขาไม่มีในระบบแล้ว — โหลดผังใหม่" });
    }
    if (b.coverForId) {
      // คนที่ฝากสาขาไว้ ลาออก/ถูกลบไปแล้วได้ — นั่นคือเหตุผลที่ต้องมีคนดูแลแทน
      const f = user.get(b.coverForId);
      if (!f || !AREA_HOLDER_ROLES.includes(f.role)) return res.status(400).json({ error: "ไม่พบเจ้าของสาขาที่ดูแลแทน" });
      if (!b.holderId || b.holderId === b.coverForId) return res.status(400).json({ error: "ดูแลแทนต้องย้ายไปให้คนอื่น" });
    }
  }

  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      if (supervisors.length) {
        // ทั้งชุดในคำสั่งเดียว — ฐานข้อมูลอยู่คนละ region ทีละคนเกินเพดาน transaction (CLAUDE.md)
        await tx.$executeRaw`
          UPDATE "User" u SET "areaId" = NULLIF(d.area, '')::int
          FROM UNNEST(${supervisors.map((s) => String(s.id))}::text[], ${supervisors.map((s) => (s.areaId ? String(s.areaId) : ""))}::text[]) AS d(id, area)
          WHERE u.id = d.id::int`;
      }
      if (branches.length) {
        const rows = branches.map((b) => {
          const prev = branchBy.get(b.code)!;
          const forId = b.coverForId ?? null;
          return {
            code: b.code,
            holder: b.holderId ? String(b.holderId) : "",
            forId: forId ? String(forId) : "",
            forName: forId ? user.get(forId)!.name : "",
            // ย้ายระหว่างคนดูแลแทนด้วยกัน (เจ้าของเดิมคนเดียวกัน) — นับวันเริ่มเดิม ไม่เริ่มใหม่
            since: forId ? (prev.coverForId === forId && prev.coverSince ? prev.coverSince : now).toISOString() : "",
          };
        });
        await tx.$executeRaw`
          UPDATE "Branch" b SET "cocoSupervisorId" = NULLIF(d.holder, '')::int, "coverForId" = NULLIF(d.for_id, '')::int,
            "coverForName" = NULLIF(d.for_name, ''), "coverSince" = NULLIF(d.since, '')::timestamp
          FROM UNNEST(${rows.map((r) => r.code)}::text[], ${rows.map((r) => r.holder)}::text[], ${rows.map((r) => r.forId)}::text[],
                      ${rows.map((r) => r.forName)}::text[], ${rows.map((r) => r.since)}::text[]) AS d(code, holder, for_id, for_name, since)
          WHERE b.code = d.code`;
      }
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
  console.log(`[AREA-MAP] userId=${req.auth!.userId} — Supervisor ${supervisors.length} · สาขา ${branches.length}`);
  res.json({ ok: true, supervisors: supervisors.length, branches: branches.length });
});

const renameSchema = z.object({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1, "ต้องใส่ชื่อใหม่").max(120),
  // ชื่อใหม่ซ้ำกับทีมที่มีอยู่ = รวมสองทีม — ต้องยืนยันชัด ๆ ไม่ให้เกิดจากพิมพ์ชื่อซ้ำโดยไม่ตั้งใจ
  merge: z.boolean().optional(),
});

router.post("/rename", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const parsed = renameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const from = parsed.data.from;
  const to = parsed.data.to.replace(/\s+/g, " ");
  if (from === to) return res.status(400).json({ error: "ชื่อใหม่เหมือนชื่อเดิม" });

  const used = async (name: string) =>
    (
      await Promise.all([
        prisma.branch.count({ where: { OR: [{ zone: name }, { pmTeam: name }] } }),
        prisma.user.count({ where: { OR: [{ team: name }, { supervisedTeams: { has: name } }] } }),
        prisma.workOrder.count({ where: { assignedTeam: name } }),
        prisma.teamDayPlan.count({ where: { team: name } }),
      ])
    ).reduce((a, b) => a + b, 0);
  if ((await used(from)) === 0) return res.status(404).json({ error: `ไม่พบทีม "${from}"` });
  const merging = (await used(to)) > 0;
  if (merging && !parsed.data.merge) {
    return res.status(409).json({ error: `มีทีม "${to}" อยู่แล้ว — ถ้าต้องการรวมสองทีม ให้ยืนยันการรวมทีม`, needsMerge: true });
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const branchesCm = await tx.branch.updateMany({ where: { zone: from }, data: { zone: to } });
      const branchesPm = await tx.branch.updateMany({ where: { pmTeam: from }, data: { pmTeam: to } });
      const technicians = await tx.user.updateMany({ where: { team: from }, data: { team: to } });
      // แทนชื่อในอาร์เรย์ แล้วตัดซ้ำ (หัวหน้าภาคที่ดูแลทั้งสองทีมอยู่แล้วตอนรวมทีม)
      const supervisors = await tx.$executeRaw`
        UPDATE "User" SET "supervisedTeams" = ARRAY(
          SELECT DISTINCT unnest(array_replace("supervisedTeams", ${from}, ${to}))
        ) WHERE ${from} = ANY("supervisedTeams")`;
      const orders = await tx.workOrder.updateMany({ where: { assignedTeam: from }, data: { assignedTeam: to } });
      // คะแนนย้อนหลังเก็บทีมตอนนั้นไว้เพื่อไม่ให้เปลี่ยนตามตอนสาขาย้ายทีม — แต่เปลี่ยนชื่อไม่ใช่ย้ายทีม
      // ถ้าไม่ตามไปด้วย รายงานจะแยกทีมเดียวกันเป็นสองแถว (ชื่อเก่า/ชื่อใหม่)
      await tx.scoreSnapshot.updateMany({ where: { zone: from }, data: { zone: to } });

      // แผนรายวัน: วันที่ทีมปลายทางมีแผนอยู่แล้ว (รวมทีม) — ย้ายคนเข้าแผนเดิม ไม่ทิ้งใคร
      const plans = await tx.teamDayPlan.findMany({ where: { team: from }, include: { members: true } });
      for (const p of plans) {
        const target = await tx.teamDayPlan.findUnique({
          where: { date_team: { date: p.date, team: to } },
          include: { members: true },
        });
        if (!target) {
          await tx.teamDayPlan.update({ where: { id: p.id }, data: { team: to } });
          continue;
        }
        const have = new Set(target.members.map((m) => m.userId));
        let pos = target.members.length;
        for (const m of [...p.members].sort((a, b) => a.position - b.position)) {
          if (have.has(m.userId)) continue;
          await tx.teamDayPlanMember.create({ data: { planId: target.id, userId: m.userId, position: pos++ } });
        }
        await tx.teamDayPlan.update({
          where: { id: target.id },
          data: {
            vehicleId: target.vehicleId ?? p.vehicleId,
            startTime: target.startTime ?? p.startTime,
            note: [target.note, p.note].filter(Boolean).join(" / ") || null,
          },
        });
        await tx.teamDayPlan.delete({ where: { id: p.id } });
      }

      // จำชื่อเดิมไว้ให้ตัวนำเข้าไฟล์ · ชื่อที่เคยชี้มาที่ชื่อเดิมก็ชี้ต่อไปที่ชื่อใหม่
      // · ถ้าเปลี่ยนกลับเป็นชื่อที่เคยถูกเปลี่ยนไป ลบรายการนั้นทิ้ง ไม่งั้นแปลงวนกันเอง
      // ทีมรวมที่ครอบคลุมทีมนี้ต้องตามชื่อใหม่ ไม่งั้นช่างในทีมรวมมองไม่เห็นงานของทีมนี้ทันที
      await tx.$executeRaw`
        UPDATE "TeamGroup" SET "covers" = ARRAY(SELECT DISTINCT unnest(array_replace("covers", ${from}, ${to})))
        WHERE ${from} = ANY("covers")`;
      // สาขาที่ย้ายทีมในแอปต้องตามชื่อใหม่ด้วย ไม่งั้นตัวนำเข้าไฟล์จะบังคับชื่อเดิมกลับลงสาขา
      await tx.branchTeamMove.updateMany({ where: { toTeam: from }, data: { toTeam: to } });
      await tx.branchTeamMove.updateMany({ where: { fromTeam: from }, data: { fromTeam: to } });
      await tx.teamRename.deleteMany({ where: { fromName: to } });
      await tx.teamRename.updateMany({ where: { toName: from }, data: { toName: to } });
      await tx.teamRename.upsert({
        where: { fromName: from },
        create: { fromName: from, toName: to, createdById: req.auth!.userId },
        update: { toName: to, createdById: req.auth!.userId, createdAt: new Date() },
      });
      return {
        branches: branchesCm.count + branchesPm.count,
        technicians: technicians.count,
        supervisors: Number(supervisors),
        workOrders: orders.count,
        plans: plans.length,
      };
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
  forgetTeamGroups();
  res.json({ ok: true, from, to, merged: merging, ...result });
});

/** ค้นหาสาขาเพื่อเลือกย้ายทีม — ชื่อ รหัส ที่อยู่ ภาค หรือทีมปัจจุบัน */
router.get("/branches", requireAuth, requireAdmin, async (req, res) => {
  const q = String(req.query.search ?? "").trim();
  if (q.length < 2) return res.json({ branches: [], more: false });
  const LIMIT = 300;
  const rows = await prisma.branch.findMany({
    where: {
      cancelledAt: null,
      OR: (["code", "name", "address", "region", "zone", "pmTeam"] as const).map((f) => ({
        [f]: { contains: q, mode: "insensitive" as const },
      })),
    },
    select: { id: true, code: true, name: true, address: true, region: true, zone: true, pmTeam: true, teamMoves: { select: { field: true } } },
    orderBy: { code: "asc" },
    take: LIMIT + 1,
  });
  res.json({
    more: rows.length > LIMIT,
    branches: rows.slice(0, LIMIT).map(({ teamMoves, ...b }) => ({ ...b, moved: teamMoves.map((m) => m.field) })),
  });
});

const moveSchema = z.object({
  branchIds: z.array(z.number().int()).min(1, "ยังไม่ได้เลือกสาขา").max(2000),
  team: z.string().trim().min(1, "ต้องใส่ชื่อทีม").max(120),
  // zone = ทีม CM · pmTeam = ทีม PM — ส่วนใหญ่ย้ายทั้งคู่ แต่บางสาขา PM เป็นอีกทีมจริง ๆ
  fields: z.array(z.enum(["zone", "pmTeam"])).min(1, "เลือกอย่างน้อยหนึ่งอย่าง (CM หรือ PM)"),
});

router.post("/move-branches", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const team = parsed.data.team.replace(/\s+/g, " ");
  const fields = [...new Set(parsed.data.fields)];
  const ids = [...new Set(parsed.data.branchIds)];

  const branches = await prisma.branch.findMany({
    where: { id: { in: ids }, cancelledAt: null },
    select: { id: true, zone: true, pmTeam: true, teamMoves: true },
  });
  if (branches.length === 0) return res.status(404).json({ error: "ไม่พบสาขาที่เลือก" });
  const isNew =
    (await prisma.branch.count({ where: { cancelledAt: null, OR: [{ zone: team }, { pmTeam: team }] } })) === 0;

  let moved = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const field of fields) {
        const change = branches.filter((b) => b[field] !== team);
        if (!change.length) continue;
        await tx.branch.updateMany({ where: { id: { in: change.map((b) => b.id) } }, data: { [field]: team } });
        moved += change.length;
        for (const b of change) await recordTeamMove(tx, b, field, team, req.auth!.userId);
      }
    },
    { timeout: 30_000, maxWait: 15_000 }
  );

  const [technicians, supervisors] = await Promise.all([
    prisma.user.count({ where: { team, deletedAt: null } }),
    prisma.user.count({ where: { supervisedTeams: { has: team }, deletedAt: null } }),
  ]);
  res.json({ ok: true, team, branches: branches.length, moved, isNew, technicians, supervisors });
});

/** คืนสาขากลับไปทีมตามไฟล์ทะเบียน และเลิกบังคับ */
router.post("/moves/:id/revert", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const move = Number.isInteger(id) ? await prisma.branchTeamMove.findUnique({ where: { id } }) : null;
  if (!move) return res.status(404).json({ error: "ไม่พบรายการนี้" });
  await prisma.$transaction(
    async (tx) => {
      await tx.branch.update({ where: { id: move.branchId }, data: { [move.field]: move.fromTeam } });
      await tx.branchTeamMove.delete({ where: { id } });
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
  res.json({ ok: true, team: move.fromTeam });
});

/**
 * ทีม outsource — เพิ่ม/ลบ (แอดมิน · เจ้าของงานเพิ่ม ต.ค. 69)
 * ลบได้เฉพาะทีมที่ไม่มีใบงานค้าง ไม่งั้นใบที่จ่ายไปแล้วไม่มีใครปิดได้ (หัวหน้าภาคปิดแทนได้เพราะเป็นทีม outsource)
 */
router.post("/outsource", requireAuth, requireAdmin, async (req, res) => {
  // ทีมที่ดูแลสาขาอยู่แล้วก็เป็น outsource ได้ (บริษัทภายนอกที่รับดูแลสาขาประจำ เช่น PWS)
  const name = typeof req.body?.name === "string" ? req.body.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 60) return res.status(400).json({ error: "ใส่ชื่อทีม (ไม่เกิน 60 ตัวอักษร)" });
  if (await prisma.outsourceTeam.findUnique({ where: { name } })) return res.status(409).json({ error: `มีทีม ${name} อยู่แล้ว` });
  const row = await prisma.outsourceTeam.create({ data: { name } });
  await refreshOutsource();
  res.status(201).json(row);
});

router.delete("/outsource/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const row = Number.isInteger(id) ? await prisma.outsourceTeam.findUnique({ where: { id } }) : null;
  if (!row) return res.status(404).json({ error: "ไม่พบทีมนี้" });
  const open = await prisma.workOrder.count({ where: { assignedTeam: row.name, status: { in: [...ACTIVE_WORK_ORDER_STATUSES] } } });
  if (open) return res.status(409).json({ error: `${row.name} ยังมีใบงานค้าง ${open} ใบ — จ่ายให้ทีมอื่นก่อน` });
  await prisma.outsourceTeam.delete({ where: { id } });
  await refreshOutsource();
  res.status(204).send();
});

/** ทีมรวมทั้งหมด — ตัวเลือกในการ์ดช่าง/หัวหน้าภาค (หน้าสิทธิ์ผู้ใช้) */
router.get("/groups", requireAuth, requireAdmin, async (_req, res) => {
  const groups = await prisma.teamGroup.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, covers: true, allTeams: true } });
  res.json(groups);
});

const groupSchema = z.object({
  name: z.string().trim().min(1, "ต้องใส่ชื่อทีมรวม").max(120),
  covers: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
  allTeams: z.boolean().default(false),
});

/** ทีมรวมต้องครอบคลุมอะไรสักอย่าง และชื่อห้ามซ้ำทีมช่างของสาขา (ใบงานจ่ายให้ชื่อนั้นอยู่ จะแยกไม่ออก) */
async function checkGroup(name: string, covers: string[], allTeams: boolean, selfId?: number) {
  if (!allTeams && covers.length === 0) return "เลือกทีมที่ครอบคลุมอย่างน้อยหนึ่งทีม หรือเลือกทุกทีม";
  const clash = await prisma.branch.findFirst({ where: { cancelledAt: null, OR: [{ zone: name }, { pmTeam: name }] }, select: { id: true } });
  if (clash) return `"${name}" เป็นชื่อทีมช่างของสาขาอยู่แล้ว — ตั้งชื่อทีมรวมให้ต่างกัน`;
  const same = await prisma.teamGroup.findUnique({ where: { name } });
  if (same && same.id !== selfId) return `มีทีมรวม "${name}" อยู่แล้ว`;
  return null;
}

router.post("/groups", requireAuth, requireAdmin, async (req, res) => {
  const parsed = groupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const name = parsed.data.name.replace(/\s+/g, " ");
  const covers = [...new Set(parsed.data.covers)];
  const err = await checkGroup(name, covers, parsed.data.allTeams);
  if (err) return res.status(400).json({ error: err });
  const g = await prisma.teamGroup.create({ data: { name, covers: parsed.data.allTeams ? [] : covers, allTeams: parsed.data.allTeams } });
  forgetTeamGroups();
  res.status(201).json(g);
});

router.put("/groups/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = groupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const old = Number.isInteger(id) ? await prisma.teamGroup.findUnique({ where: { id } }) : null;
  if (!old) return res.status(404).json({ error: "ไม่พบทีมรวมนี้" });
  const name = parsed.data.name.replace(/\s+/g, " ");
  const covers = [...new Set(parsed.data.covers)];
  const err = await checkGroup(name, covers, parsed.data.allTeams, id);
  if (err) return res.status(400).json({ error: err });
  await prisma.$transaction(
    async (tx) => {
      await tx.teamGroup.update({ where: { id }, data: { name, covers: parsed.data.allTeams ? [] : covers, allTeams: parsed.data.allTeams } });
      if (name !== old.name) {
        // เปลี่ยนชื่อทีมรวม = ช่าง หัวหน้าภาค และแผนที่ผูกกับชื่อเดิมย้ายตามทั้งหมด
        await tx.user.updateMany({ where: { team: old.name }, data: { team: name } });
        await tx.$executeRaw`
          UPDATE "User" SET "supervisedTeams" = ARRAY(SELECT DISTINCT unnest(array_replace("supervisedTeams", ${old.name}, ${name})))
          WHERE ${old.name} = ANY("supervisedTeams")`;
        await tx.teamDayPlan.updateMany({ where: { team: old.name }, data: { team: name } });
      }
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
  forgetTeamGroups();
  res.json({ ok: true });
});

/**
 * ลบทีมรวม — ช่างที่สังกัดกลายเป็นไม่มีสังกัด (เจ้าของระบบต้องการแบบนี้: ให้แอดมินตามจัดทีมใหม่เอง
 * ผ่านแถบ "ยังไม่มีพื้นที่รับผิดชอบ") · หัวหน้าภาคเลิกดูแล · แผนของทีมรวมตั้งแต่วันนี้ไปถูกลบ
 */
router.delete("/groups/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const g = Number.isInteger(id) ? await prisma.teamGroup.findUnique({ where: { id } }) : null;
  if (!g) return res.status(404).json({ error: "ไม่พบทีมรวมนี้" });
  const result = await prisma.$transaction(
    async (tx) => {
      const technicians = await tx.user.updateMany({ where: { team: g.name }, data: { team: null } });
      const supervisors = await tx.$executeRaw`
        UPDATE "User" SET "supervisedTeams" = array_remove("supervisedTeams", ${g.name}) WHERE ${g.name} = ANY("supervisedTeams")`;
      const plans = await tx.teamDayPlan.deleteMany({ where: { team: g.name, date: { gte: todayStart() } } });
      await tx.teamGroup.delete({ where: { id } });
      return { technicians: technicians.count, supervisors: Number(supervisors), plans: plans.count };
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
  forgetTeamGroups();
  res.json({ ok: true, ...result });
});

/** วันนี้ (เวลาไทย) — แผนรายวันเก็บวันที่เป็นเที่ยงคืน UTC ของวันนั้น */
function todayStart() {
  return new Date(`${bangkokDay()}T00:00:00.000Z`);
}

/** ผลกระทบของการลบทีมช่าง — ให้หน้าจอบอกก่อนกดยืนยัน */
async function teamUsage(name: string) {
  const active = [...ACTIVE_WORK_ORDER_STATUSES];
  const [branches, technicians, supervisors, openOrders] = await Promise.all([
    prisma.branch.count({ where: { OR: [{ zone: name }, { pmTeam: name }] } }),
    prisma.user.count({ where: { team: name, deletedAt: null } }),
    prisma.user.count({ where: { supervisedTeams: { has: name }, deletedAt: null } }),
    prisma.workOrder.count({ where: { assignedTeam: name, status: { in: active } } }),
  ]);
  return { branches, technicians, supervisors, openOrders };
}

router.get("/usage", requireAuth, requireAdmin, async (req, res) => {
  const name = String(req.query.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "ต้องระบุชื่อทีม" });
  res.json(await teamUsage(name));
});

/**
 * รายชื่อคนในทีม (กดการ์ดทีมในหน้าทีมช่าง) — ตัวเลขบนการ์ดบอกแค่ว่ากี่คน แอดมินต้องรู้ว่าใคร
 * ก่อนตัดสินใจลบ/รวมทีม หรือเวลาหัวหน้าภาคโทรมาถามว่าช่างคนนี้อยู่ทีมไหน
 * ใช้ได้ทั้งทีมช่างและทีมรวม · ทีมรวมที่ครอบคลุมทีมนี้แสดงด้วย เพราะช่างทีมรวมก็เห็นงานทีมนี้
 */
router.get("/members", requireAuth, requireAdmin, async (req, res) => {
  const name = String(req.query.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "ต้องระบุชื่อทีม" });
  const pick = { id: true, employeeCode: true, name: true, phone: true, role: true, region: true } as const;
  const [technicians, supervisors, groups] = await Promise.all([
    prisma.user.findMany({ where: { team: name, deletedAt: null }, select: pick, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { supervisedTeams: { has: name }, deletedAt: null }, select: pick, orderBy: { name: "asc" } }),
    teamGroups(),
  ]);
  const group = groups.get(name);
  res.json({
    name,
    isGroup: !!group,
    covers: group ? (group.allTeams ? null : group.covers) : undefined,
    technicians,
    supervisors,
    // ทีมรวมที่เห็นงานของทีมนี้ (เช่น Senior · QC) — ช่างของทีมรวมก็ไปงานทีมนี้ได้
    coveredBy: group
      ? []
      : [...groups.values()].filter((g) => g.allTeams || g.covers.includes(name)).map((g) => g.name).sort((a, b) => a.localeCompare(b, "th")),
  });
});

const deleteSchema = z.object({
  name: z.string().trim().min(1),
  // ทีมที่รับสาขาและใบงานค้างไปดูแลต่อ — บังคับเมื่อทีมที่ลบยังมีสาขาหรือใบงานค้าง
  moveTo: z.string().trim().min(1).nullable().optional(),
});

/**
 * ลบทีมช่าง — ช่างในทีมกลายเป็นไม่มีสังกัด หัวหน้าภาคเลิกดูแล (ตามที่เจ้าของระบบต้องการ)
 *
 * สาขาและใบงานที่ยังค้างจะทิ้งไว้กับชื่อที่ไม่มีแล้วไม่ได้ — สาขาไม่มีทีมดูแล ใบงานไม่มีใครเห็น
 * จึงต้องเลือกทีมที่รับต่อ · จำชื่อเดิม → ทีมใหม่ไว้ (TeamRename) ไม่งั้นอัปไฟล์ทะเบียนครั้งถัดไป
 * ชื่อทีมที่ลบจะกลับมาพร้อมสาขา · ใบงานที่ปิดแล้วคงชื่อเดิมไว้เป็นประวัติ
 */
router.post("/delete", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const { name } = parsed.data;
  const moveTo = parsed.data.moveTo ?? null;
  if ((await teamGroups()).has(name)) return res.status(400).json({ error: "นี่คือทีมรวม — ลบที่ส่วนทีมรวม" });
  const usage = await teamUsage(name);
  if (!usage.branches && !usage.technicians && !usage.supervisors && !usage.openOrders) {
    return res.status(404).json({ error: `ไม่พบทีม "${name}"` });
  }
  if ((usage.branches || usage.openOrders) && !moveTo) {
    return res.status(400).json({
      error: `ทีม ${name} ยังมีสาขา ${usage.branches} แห่ง · ใบงานค้าง ${usage.openOrders} ใบ — เลือกทีมที่จะรับไปดูแลต่อ`,
      needsMoveTo: true,
    });
  }
  if (moveTo) {
    if (moveTo === name) return res.status(400).json({ error: "ทีมที่รับต่อต้องเป็นทีมอื่น" });
    const ok = await prisma.branch.findFirst({ where: { cancelledAt: null, OR: [{ zone: moveTo }, { pmTeam: moveTo }] }, select: { id: true } });
    if (!ok) return res.status(400).json({ error: `ไม่มีทีม "${moveTo}" ในทะเบียนสาขา` });
  }

  const result = await prisma.$transaction(
    async (tx) => {
      let branches = 0;
      let orders = 0;
      if (moveTo) {
        // นับสาขาก่อนย้าย — สาขาเดียวที่ทีมนี้ดูแลทั้ง CM และ PM ต้องนับเป็นหนึ่ง ไม่ใช่สอง
        branches = await tx.branch.count({ where: { OR: [{ zone: name }, { pmTeam: name }] } });
        await tx.branch.updateMany({ where: { zone: name }, data: { zone: moveTo } });
        await tx.branch.updateMany({ where: { pmTeam: name }, data: { pmTeam: moveTo } });
        orders = (
          await tx.workOrder.updateMany({
            where: { assignedTeam: name, status: { in: [...ACTIVE_WORK_ORDER_STATUSES] } },
            data: { assignedTeam: moveTo },
          })
        ).count;
        await tx.branchTeamMove.updateMany({ where: { toTeam: name }, data: { toTeam: moveTo } });
        await tx.branchTeamMove.updateMany({ where: { fromTeam: name }, data: { fromTeam: moveTo } });
        // ทีมรวมที่เคยครอบคลุมทีมนี้ ครอบคลุมทีมที่รับสาขาไปแทน — ไม่งั้นเสียสาขาเหล่านั้นไปเงียบ ๆ
        await tx.$executeRaw`
          UPDATE "TeamGroup" SET "covers" = ARRAY(SELECT DISTINCT unnest(array_replace("covers", ${name}, ${moveTo})))
          WHERE ${name} = ANY("covers")`;
        await tx.teamRename.deleteMany({ where: { fromName: moveTo } });
        await tx.teamRename.updateMany({ where: { toName: name }, data: { toName: moveTo } });
        await tx.teamRename.upsert({
          where: { fromName: name },
          create: { fromName: name, toName: moveTo, createdById: req.auth!.userId },
          update: { toName: moveTo, createdById: req.auth!.userId, createdAt: new Date() },
        });
      } else {
        await tx.$executeRaw`UPDATE "TeamGroup" SET "covers" = array_remove("covers", ${name}) WHERE ${name} = ANY("covers")`;
      }
      const technicians = (await tx.user.updateMany({ where: { team: name }, data: { team: null } })).count;
      const supervisors = await tx.$executeRaw`
        UPDATE "User" SET "supervisedTeams" = array_remove("supervisedTeams", ${name}) WHERE ${name} = ANY("supervisedTeams")`;
      const plans = (await tx.teamDayPlan.deleteMany({ where: { team: name, date: { gte: todayStart() } } })).count;
      return { branches, orders, technicians, supervisors: Number(supervisors), plans };
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
  forgetTeamGroups();
  res.json({ ok: true, name, moveTo, ...result });
});

export default router;
