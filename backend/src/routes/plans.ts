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
import { supervisorScope, teamsForSupervisor, workOrderVisible } from "../utils/supervisorScope";
import { areaWorkOrderWhere, isAreaTeam } from "../utils/areaScope";
import { teamGroups } from "../utils/teamGroups";
import { teamDayTimeline } from "../utils/timeline";
import { requireAuth, requireSuperAdmin, AuthRequest } from "../middleware/auth";
import {
  APPOINTMENT_STATUS_LABELS,
  JOB_TYPE_LABELS,
  WORK_ORDER_STATUS_LABELS,
} from "../utils/constants";

const router = Router();

/** ขั้นที่ถือว่า "มีกำหนดไปหน้างานวันนั้น" — ปิดแล้วก็ยังโชว์ว่าวันนั้นไปทำอะไรมา */
// INSPECT_CONFIRM อยู่บนบอร์ดด้วย — ใบที่หัวหน้าภาคใส่วันเสนอไว้แล้ว ทีมนั้นถูกจองวันนั้นแม้ร้านยังไม่ตอบ
// เบิกก่อนคอนเฟิร์ม (ต.ค. 69 รอบสอง): หัวหน้าภาคนัดแล้วทีมถูกจองตั้งแต่ขั้นเบิก/โอน จนรอปล่อยงาน — เดิมใบหายจากบอร์ด
// ระหว่างคอนเฟิร์มถึงปล่อยงาน (และจะหายตั้งแต่นัดถึงคอนเฟิร์มด้วยถ้าไม่เพิ่ม) · ใบที่ยังไม่มีวันไม่ขึ้นอยู่แล้ว (กรองตามวัน)
const ON_BOARD = [
  "INSPECT_CONFIRM",
  "INSPECT_DISPATCH",
  "INSPECTING",
  "PARTS_REQUESTED",
  "PARTS_TRANSFER",
  "PARTS_IN_TRANSIT",
  "PARTS_PICKUP",
  "AWAITING_CONFIRM",
  "ASSIGNED",
  "IN_PROGRESS",
  "CLAIM_REVIEW",
  "DONE",
];
/** ช่างเข้าแล้ว/ปิดแล้ว — สถานะนัดที่ค้างไม่ได้แปลว่ายังต้องโทรร้าน */
const SETTLED_ON_BOARD = ["IN_PROGRESS", "CLAIM_REVIEW", "DONE"];

function requirePlanner(req: AuthRequest, res: Response, next: NextFunction) {
  const role = req.auth?.role;
  // Area Team ดูได้อย่างเดียว (ด่านใน requireAuth ปล่อยแค่ GET) — เห็นเฉพาะงานของสาขาตัวเอง
  if (role !== "ADMIN" && role !== "SUPERVISOR" && !isAreaTeam(req.auth)) {
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
 * teams คือทีมที่ดูแลสาขาในทุกภาคที่ดูแลรวมกับทีมที่ตั้งให้ดูแลตรง ๆ ใช้กรองแผนของทีมที่ยังไม่มีงาน
 * ในวันนั้น (จัดคนไว้ก่อนแล้วค่อยนัดงาน) ซึ่งกรองจากใบงานไม่ได้เพราะยังไม่มีใบ
 */
async function scopeFor(req: AuthRequest) {
  if (req.auth!.role === "ADMIN") {
    return { where: null as Prisma.WorkOrderWhereInput | null, teams: null as Set<string> | null };
  }
  // teams ว่าง = ไม่มีทีมให้จัดแผน · แผนของทีมที่ไม่มีงานในสาขาตัวเองวันนั้นไม่ขึ้น
  if (isAreaTeam(req.auth)) return { where: areaWorkOrderWhere(req.auth!), teams: new Set<string>() };
  const s = await supervisorScope(req.auth!.userId);
  // ตัวเดียวกับช่องจ่ายงาน (ทีมมาก่อนภาค · ทุกภาคที่ดูแล) — เดิมคัดลอกตรรกะภาคมาไว้ที่นี่
  // พอหัวหน้าภาคเลือกได้หลายภาค สำเนานี้ยังดูแค่ภาคแรก ทีมของภาคที่เพิ่มจัดแผนไม่ได้ทั้งที่จ่ายงานได้
  const teams = await teamsForSupervisor(s);
  // ใบที่จ่ายข้ามทีมมาให้ทีมของตัวเองขึ้นบนแผนด้วย — เป็นคิวของทีมนี้จริง แม้ใบจะเป็นของหัวหน้าภาคอื่น
  return { where: await workOrderVisible(s), teams };
}

/** ไทม์ไลน์ทั้งวันของทีม (Super Admin) — รับรถ รายงานตัว ทุกการกดในใบงานของทีม คืนรถ */
router.get("/timeline", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
  const date = DATE.safeParse(req.query.date);
  const team = String(req.query.team ?? "").trim();
  if (!date.success || !team) return res.status(400).json({ error: "ต้องระบุวันที่และทีม" });
  res.json(await teamDayTimeline(date.data, team));
});

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
          // role ให้บอร์ดติดป้าย Senior ช่าง — Senior ไม่มีแถวของตัวเอง ถูกใส่เป็นคนในทีมไหนก็ได้ในวันนั้น
          include: { user: { select: { id: true, name: true, employeeCode: true, role: true } } },
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
      members: { id: number; name: string; employeeCode: string; role: string }[];
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
      kind: ["INSPECTING", "INSPECT_DISPATCH", "INSPECT_CONFIRM"].includes(o.status) ? "INSPECT" : "REPAIR",
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
      // นัดที่ยังไม่ได้ตกลงกับร้าน — รวมใบที่ยังเบิก/โอนอยู่ (ยังไม่ถึงขั้นโทร) ไม่ใช่แค่ใบที่รอแอดมินโทร
      // ใบที่ปิดไปแล้ว (หัวหน้าภาคปิดเองก่อนคอนเฟิร์ม) ไม่นับ — ไม่มีอะไรต้องโทรแล้ว
      awaitingConfirm: orders.filter((o) => o.appointmentStatus === "PENDING" && !SETTLED_ON_BOARD.includes(o.status)).length,
    },
    lanes: rows,
    // ทีมที่จัดแผนได้ (null = ทุกทีม) — ฟอร์มจัดแผนแสดงเฉพาะทีมพวกนี้ ไม่งั้นหัวหน้าภาคเลือกทีมคนอื่นได้
    // แล้วไปโดนปฏิเสธตอนกดบันทึก หลังจากเลือกคน รถ เวลาครบแล้ว
    plannableTeams: scope.teams ? [...scope.teams].sort((a, b) => a.localeCompare(b, "th")) : null,
    // ทีมรวมไม่อยู่ในรายชื่อทีมจากทะเบียนสาขา — ส่งชื่อให้ฟอร์มจัดแผนเพิ่มเข้าไปเอง
    groupTeams: [...(await teamGroups()).keys()],
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
 * รอหัวหน้าภาคจ่ายงาน+ใส่วัน (PARTS_CHECKED) · ส่งตรวจหน้างานแต่ยังไม่ได้กำหนดวัน ·
 * ใบรออะไหล่ที่หัวหน้าภาคต้องตามของ — สามอย่างนี้คือสิ่งที่คนจัดแผนต้องหยิบมาจัด
 */
router.get("/pending", requireAuth, requirePlanner, async (req: AuthRequest, res) => {
  const scope = await scopeFor(req);
  const rows = await prisma.workOrder.findMany({
    where: {
      OR: [
        { status: { in: ["PARTS_CHECKED", "WAITING_PARTS"] } },
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
    // priority เก็บเป็นข้อความ — เรียงจากมากไปน้อยได้ URGENT → NORMAL → LOW พอดี
    // (เดิมเรียงน้อยไปมาก ใบด่วนจึงไปอยู่ท้ายสุด ทั้งที่คอมเมนต์บอกว่า "ด่วนขึ้นก่อน")
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
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
  // ทีมรวมจัดแผนได้เหมือนทีมช่าง (คนในทีมออกงานด้วยกัน) แม้ไม่มีสาขาของตัวเอง
  const known =
    (await teamGroups()).has(team) ||
    (await prisma.branch.findFirst({
      where: { cancelledAt: null, OR: [{ zone: team }, { pmTeam: team }] },
      select: { id: true },
    }));
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
