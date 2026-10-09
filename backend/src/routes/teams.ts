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
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { ACTIVE_WORK_ORDER_STATUSES } from "../utils/constants";
import { forgetTeamGroups } from "../utils/teamGroups";

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
        for (const b of change) {
          const prev = b.teamMoves.find((m) => m.field === field);
          // fromTeam = ทีมตามไฟล์ก่อนย้ายครั้งแรก — ย้ายซ้ำไม่ทับ ไม่งั้น "คืนตามไฟล์" จะคืนไปทีมที่ย้ายในแอป
          const fromTeam = prev ? prev.fromTeam : b[field];
          if (fromTeam === team) {
            // ย้ายกลับไปทีมเดิมตามไฟล์ = ไม่ต้องบังคับอะไรแล้ว
            if (prev) await tx.branchTeamMove.delete({ where: { id: prev.id } });
            continue;
          }
          await tx.branchTeamMove.upsert({
            where: { branchId_field: { branchId: b.id, field } },
            create: { branchId: b.id, field, fromTeam, toTeam: team, movedById: req.auth!.userId },
            update: { toTeam: team, movedById: req.auth!.userId, createdAt: new Date() },
          });
        }
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

router.delete("/groups/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const g = Number.isInteger(id) ? await prisma.teamGroup.findUnique({ where: { id } }) : null;
  if (!g) return res.status(404).json({ error: "ไม่พบทีมรวมนี้" });
  const used = await prisma.user.count({
    where: { deletedAt: null, OR: [{ team: g.name }, { supervisedTeams: { has: g.name } }] },
  });
  // ลบทั้งที่มีคนสังกัด = คนเหล่านั้นมองไม่เห็นงานทันทีโดยไม่มีใครรู้ตัว
  if (used) return res.status(409).json({ error: `ยังมี ${used} คนผูกกับทีมรวมนี้ — ย้ายคนออกก่อน` });
  await prisma.teamGroup.delete({ where: { id } });
  forgetTeamGroups();
  res.json({ ok: true });
});

export default router;
