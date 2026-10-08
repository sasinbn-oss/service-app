/**
 * บอร์ดแผนงาน — วันนี้ทีมไหนไปไหน ไปกับใคร ซ่อมอะไร ใครเป็นคนจัด
 *
 * หน้าแรกของแอดมินกับหัวหน้าภาค ช่างไม่เห็น เพราะช่างต้องการรู้แค่งานของทีม
 * ตัวเอง ซึ่งกล่องงานตอบอยู่แล้ว
 *
 * "ไปที่ไหน" มาจากใบงานที่นัดวันนั้นตรง ๆ ไม่ได้เก็บซ้ำ — แก้วันนัดในใบงาน
 * บอร์ดเปลี่ยนตามทันที ส่วนที่ใบงานไม่รู้ (ใครไป รถคันไหน ใครจัด) อยู่ที่ TeamDayPlan
 */
import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { supervisorScope, workOrderInScope } from "../utils/supervisorScope";
import { requireAuth, AuthRequest } from "../middleware/auth";
import {
  APPOINTMENT_STATUS_LABELS,
  JOB_TYPE_LABELS,
  WORK_ORDER_STATUS_LABELS,
} from "../utils/constants";

const router = Router();

/** ขั้นที่ถือว่า "มีกำหนดไปหน้างานวันนั้น" — ปิดแล้วก็ยังโชว์ว่าวันนั้นไปทำอะไรมา */
const ON_BOARD = ["INSPECTING", "AWAITING_CONFIRM", "IN_PROGRESS", "DONE"];

function requirePlanner(req: AuthRequest, res: Response, next: NextFunction) {
  const role = req.auth?.role;
  if (role !== "ADMIN" && role !== "SUPERVISOR") {
    return res.status(403).json({ error: "บอร์ดแผนงานเปิดได้เฉพาะแอดมินกับหัวหน้าภาค" });
  }
  next();
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็น ปี-เดือน-วัน");

function dayStart(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * ขอบเขตของคนที่ถาม — หัวหน้าภาคเห็นเฉพาะภาค/ทีมที่ดูแล แบบเดียวกับรายการใบงาน
 *
 * teams คือทีมที่ดูแลสาขาในภาคนั้นรวมกับทีมที่ตั้งให้ดูแลตรง ๆ ใช้กรองแผนของทีมที่ยังไม่มีงาน
 * ในวันนั้น (จัดคนไว้ก่อนแล้วค่อยนัดงาน) ซึ่งกรองจากใบงานไม่ได้เพราะยังไม่มีใบ
 */
async function scopeFor(req: AuthRequest) {
  if (req.auth!.role === "ADMIN") {
    return { where: null as Prisma.WorkOrderWhereInput | null, teams: null as Set<string> | null };
  }
  const s = await supervisorScope(req.auth!.userId);
  const teams = new Set<string>(s.teams);
  if (s.region) {
    const rows = await prisma.branch.findMany({
      where: { region: s.region, cancelledAt: null },
      select: { zone: true, pmTeam: true },
      distinct: ["zone", "pmTeam"],
    });
    for (const r of rows) {
      if (r.zone) teams.add(r.zone);
      if (r.pmTeam) teams.add(r.pmTeam);
    }
  }
  return { where: workOrderInScope(s), teams };
}

router.get("/day", requireAuth, requirePlanner, async (req: AuthRequest, res) => {
  const date = DATE.safeParse(req.query.date);
  if (!date.success) return res.status(400).json({ error: "ต้องระบุวันที่" });
  const day = dayStart(date.data);
  const scope = await scopeFor(req);

  const [orders, plans] = await Promise.all([
    prisma.workOrder.findMany({
      where: {
        scheduledAt: day,
        status: { in: ON_BOARD },
        ...(scope.where ? { AND: [scope.where] } : {}),
      },
      select: {
        id: true,
        code: true,
        status: true,
        jobType: true,
        title: true,
        symptom: true,
        scheduledTime: true,
        appointmentStatus: true,
        assignedTeam: true,
        parentId: true,
        assignedTo: { select: { name: true } },
        branch: { select: { code: true, name: true, address: true, region: true } },
        machine: { select: { code: true } },
        parts: {
          where: { kind: "WAITING" },
          select: { quantity: true, sparePart: { select: { partCode: true } } },
        },
      },
    }),
    prisma.teamDayPlan.findMany({
      where: { date: day },
      include: {
        vehicle: { select: { id: true, plateNumber: true } },
        plannedBy: { select: { name: true, role: true } },
        members: {
          include: { user: { select: { id: true, name: true, employeeCode: true } } },
          orderBy: { position: "asc" },
        },
      },
    }),
  ]);

  type Lane = {
    team: string;
    plan: {
      vehicleId: number | null;
      vehiclePlate: string | null;
      /** ใครเบิกรถคันนี้อยู่ตอนนี้ — จากลงทะเบียนใช้รถ ว่าง = ยังไม่มีใครเบิก */
      vehicleInUseBy: string | null;
      members: { id: number; name: string; employeeCode: string }[];
      note: string | null;
      startTime: string | null;
      plannedByName: string | null;
      updatedAt: Date;
    } | null;
    stops: ReturnType<typeof stopShape>[];
  };
  const lanes = new Map<string, Lane>();
  const laneFor = (team: string) => {
    let lane = lanes.get(team);
    if (!lane) {
      lane = { team, plan: null, stops: [] };
      lanes.set(team, lane);
    }
    return lane;
  };

  function stopShape(o: (typeof orders)[number]) {
    return {
      id: o.id,
      code: o.code,
      time: o.scheduledTime,
      branchCode: o.branch.code,
      branchName: o.branch.name,
      address: o.branch.address,
      region: o.branch.region,
      machineCode: o.machine?.code ?? null,
      jobTypeLabel: JOB_TYPE_LABELS[o.jobType] ?? o.jobType,
      title: o.title,
      symptom: o.symptom,
      parts: o.parts.map((p) => (p.quantity > 1 ? `${p.sparePart.partCode} x${p.quantity}` : p.sparePart.partCode)),
      status: o.status,
      statusLabel: WORK_ORDER_STATUS_LABELS[o.status] ?? o.status,
      // ไปตรวจหน้างาน กับไปซ่อม เป็นงานคนละแบบ — ไปตรวจไม่ต้องเตรียมอะไหล่
      kind: o.status === "INSPECTING" ? "INSPECT" : "REPAIR",
      appointmentStatus: o.appointmentStatus,
      appointmentLabel: o.appointmentStatus
        ? APPOINTMENT_STATUS_LABELS[o.appointmentStatus] ?? o.appointmentStatus
        : null,
      isFollowUp: o.parentId !== null,
    };
  }

  for (const o of orders) {
    // ใบเก่าที่จ่ายรายคนไม่มีทีม — ใช้ชื่อคนเป็นแถว ดีกว่าหายไปจากบอร์ด
    laneFor(o.assignedTeam ?? o.assignedTo?.name ?? "ยังไม่ระบุทีม").stops.push(stopShape(o));
  }
  // รถในแผนถูกเบิกออกไปจริงหรือยัง — คนจัดแผนจะได้รู้ว่าทีมออกเดินทางแล้ว
  // หรือรถถูกคนอื่นเบิกไปก่อน (จัดรถซ้อนกัน)
  const planVehicleIds = plans.map((p) => p.vehicleId).filter((x): x is number => x !== null);
  const inUse = planVehicleIds.length
    ? new Map(
        (
          await prisma.vehicleLog.findMany({
            where: { status: "ONGOING", vehicleId: { in: planVehicleIds } },
            select: { vehicleId: true, user: { select: { name: true } } },
          })
        ).map((l) => [l.vehicleId, l.user.name])
      )
    : new Map<number, string>();
  for (const p of plans) {
    if (scope.teams && !scope.teams.has(p.team) && !lanes.has(p.team)) continue;
    laneFor(p.team).plan = {
      vehicleId: p.vehicle?.id ?? null,
      vehiclePlate: p.vehicle?.plateNumber ?? null,
      vehicleInUseBy: p.vehicleId ? inUse.get(p.vehicleId) ?? null : null,
      members: p.members.map((m) => m.user),
      note: p.note,
      startTime: p.startTime,
      plannedByName: p.plannedBy?.name ?? null,
      updatedAt: p.updatedAt,
    };
  }

  // นัดที่ไม่มีเวลา (ทั้งวัน) ขึ้นก่อน เพราะเป็นงานที่ต้องจัดเวลาให้
  const byTime = (a: { time: string | null }, b: { time: string | null }) =>
    (a.time ?? "").localeCompare(b.time ?? "");
  const rows = [...lanes.values()];
  for (const lane of rows) lane.stops.sort(byTime);
  rows.sort((a, b) => {
    if (a.stops.length === 0 || b.stops.length === 0) return b.stops.length - a.stops.length;
    return byTime(a.stops[0], b.stops[0]) || a.team.localeCompare(b.team, "th");
  });

  const working = rows.filter((l) => l.stops.length > 0);
  res.json({
    date: date.data,
    stats: {
      teams: working.length,
      people: working.reduce((n, l) => n + (l.plan?.members.length ?? 0), 0),
      stops: orders.length,
      awaitingConfirm: orders.filter((o) => o.status === "AWAITING_CONFIRM").length,
    },
    lanes: rows,
  });
});

/** จำนวนจุดที่ต้องเข้าในแต่ละวันของเดือน — จุดบนปฏิทิน */
router.get("/month", requireAuth, requirePlanner, async (req: AuthRequest, res) => {
  const month = z.string().regex(/^\d{4}-\d{2}$/).safeParse(req.query.month);
  if (!month.success) return res.status(400).json({ error: "ต้องระบุเดือน" });
  const [y, m] = month.data.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  const scope = await scopeFor(req);

  const rows = await prisma.workOrder.groupBy({
    by: ["scheduledAt"],
    where: {
      scheduledAt: { gte: from, lt: to },
      status: { in: ON_BOARD },
      ...(scope.where ? { AND: [scope.where] } : {}),
    },
    _count: true,
  });
  const days: Record<string, number> = {};
  for (const r of rows) {
    if (!r.scheduledAt) continue;
    const key = r.scheduledAt.toISOString().slice(0, 10);
    days[key] = (days[key] ?? 0) + r._count;
  }
  res.json({ month: month.data, days });
});

/**
 * ใบงานที่รอจัดแผน — ยังไม่มีวันไปหน้างาน
 *
 * จ่ายทีมแล้วแต่ยังไม่ได้นัดลูกค้า · ส่งตรวจหน้างานแต่ยังไม่ได้กำหนดวัน ·
 * ใบรออะไหล่ที่หัวหน้าภาคต้องตามของ — สามอย่างนี้คือสิ่งที่คนจัดแผนต้องหยิบมาลงวัน
 */
router.get("/pending", requireAuth, requirePlanner, async (req: AuthRequest, res) => {
  const scope = await scopeFor(req);
  const rows = await prisma.workOrder.findMany({
    where: {
      OR: [
        { status: { in: ["ASSIGNED", "WAITING_PARTS"] } },
        { status: "INSPECTING", scheduledAt: null },
      ],
      ...(scope.where ? { AND: [scope.where] } : {}),
    },
    select: {
      id: true,
      code: true,
      status: true,
      title: true,
      assignedTeam: true,
      priority: true,
      branch: { select: { code: true, name: true } },
      machine: { select: { code: true } },
      parent: { select: { code: true } },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    take: 100,
  });
  res.json(
    rows.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      statusLabel: WORK_ORDER_STATUS_LABELS[r.status] ?? r.status,
      title: r.title,
      team: r.assignedTeam,
      urgent: r.priority === "URGENT",
      branchCode: r.branch.code,
      branchName: r.branch.name,
      machineCode: r.machine?.code ?? null,
      parentCode: r.parent?.code ?? null,
    }))
  );
});

/**
 * จัดแผนทีม — ใครไป (คนแรกคือหัวหน้าทีมวันนั้น) รถคันไหน
 *
 * เขียนทับทั้งชุดทุกครั้ง และคนที่บันทึกล่าสุดคือ "คนจัดแผน" — คนที่แก้แผน
 * เป็นคนที่ต้องตอบได้ว่าทำไมทีมนี้ไปแบบนี้ ไม่ใช่คนที่สร้างแผนครั้งแรก
 */
const planSchema = z.object({
  date: DATE,
  team: z.string().trim().min(1).max(120),
  vehicleId: z.number().int().positive().nullable().optional(),
  memberIds: z.array(z.number().int().positive()).max(8).default([]),
  note: z.string().trim().max(500).nullable().optional(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "เวลาต้องเป็น ชั่วโมง:นาที เช่น 08:30")
    .nullable()
    .optional(),
});

router.put("/", requireAuth, requirePlanner, async (req: AuthRequest, res) => {
  const parsed = planSchema.safeParse(req.body);
  // ข้อความแรกเป็นภาษาไทย — ส่งทั้งก้อน flatten หน้าจอจะโชว์เป็น JSON ดิบ
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const { date, team, vehicleId, note, startTime } = parsed.data;
  const memberIds = [...new Set(parsed.data.memberIds)];

  const scope = await scopeFor(req);
  if (scope.teams && !scope.teams.has(team)) {
    return res.status(403).json({ error: `${team} ไม่ได้ดูแลสาขาในภาคของคุณ` });
  }
  const known = await prisma.branch.findFirst({
    where: { cancelledAt: null, OR: [{ zone: team }, { pmTeam: team }] },
    select: { id: true },
  });
  if (!known) return res.status(404).json({ error: `ไม่รู้จักทีม "${team}"` });
  if (memberIds.length > 0) {
    const found = await prisma.user.count({ where: { id: { in: memberIds }, deletedAt: null } });
    if (found !== memberIds.length) return res.status(400).json({ error: "มีชื่อช่างที่ไม่อยู่ในระบบ" });
  }
  if (vehicleId) {
    const car = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
    if (!car) return res.status(400).json({ error: "ไม่พบรถคันนี้" });
  }

  const day = dayStart(date);
  // ไม่มีคน ไม่มีรถ ไม่มีบันทึก = ล้างแผน ไม่ใช่เก็บแผนว่างไว้
  if (memberIds.length === 0 && !vehicleId && !note?.trim()) {
    await prisma.teamDayPlan.deleteMany({ where: { date: day, team } });
    return res.json({ ok: true, removed: true });
  }

  await prisma.$transaction(
    async (tx) => {
      const plan = await tx.teamDayPlan.upsert({
        where: { date_team: { date: day, team } },
        create: {
          date: day,
          team,
          vehicleId: vehicleId ?? null,
          note: note?.trim() || null,
          startTime: startTime ?? null,
          plannedById: req.auth!.userId,
        },
        update: {
          vehicleId: vehicleId ?? null,
          note: note?.trim() || null,
          startTime: startTime ?? null,
          plannedById: req.auth!.userId,
        },
      });
      await tx.teamDayPlanMember.deleteMany({ where: { planId: plan.id } });
      if (memberIds.length > 0) {
        await tx.teamDayPlanMember.createMany({
          data: memberIds.map((userId, position) => ({ planId: plan.id, userId, position })),
        });
      }
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
  res.json({ ok: true });
});

export default router;
