/**
 * ใบงานซ่อม — ของที่ช่างถือไปทำ
 *
 * เปิดได้สองทาง: จากเคสบนกระดานติดตาม (รู้อยู่แล้วว่าสาขาไหนเครื่องไหน)
 * หรือเปิดเองสำหรับงานที่ไฟล์ไม่รู้ เช่น ลูกค้าโทรมาแจ้ง หรืองานติดตั้ง
 *
 * ปิดใบงานไม่ได้ปิดเคส — เคสปิดตอนเครื่องหายไปจากไฟล์เท่านั้น เพราะไฟล์คือ
 * ความจริงว่าเครื่องกลับมาหรือยัง ช่างปิดงานแล้วเครื่องยังไม่กลับมาก็มี
 * และต้องเห็นว่าเป็นแบบนั้น ไม่ใช่กลบด้วยการปิดเคสให้อัตโนมัติ
 */
import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { WAREHOUSES } from "../documents/warehouses";
import {
  ACTIVE_WORK_ORDER_STATUSES,
  ROLE_LABELS,
  WORK_ORDER_STAGE_ACTOR,
  WORK_ORDER_STAGE_ORDER,
  canActOnStage,
  WORK_STATUSES,
  WORK_STATUS_LABELS,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_PRIORITY_LABELS,
  WORK_ORDER_RESULTS,
  WORK_ORDER_RESULT_LABELS,
  WORK_ORDER_STATUSES,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_ACTION_LABELS,
  workOrderCode,
} from "../utils/constants";

const router = Router();

const detailInclude = {
  branch: { select: { code: true, name: true, region: true, zone: true, ownership: true } },
  machine: { select: { code: true, type: true, brand: true } },
  assignedTo: { select: { id: true, name: true, employeeCode: true } },
  createdBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  outage: { select: { id: true, kind: true, startedAt: true, endedAt: true } },
  parts: {
    include: { sparePart: { select: { id: true, partCode: true, name: true, brand: true } } },
    orderBy: { id: "asc" },
  },
} as const;

/**
 * คัดลอกอาการและสถานะจากใบงานไปไว้ที่เคส
 *
 * ใบงานเป็นที่ที่คนกรอก แต่ตัวกรองบนกระดาน รายงานอะไหล่ที่ต้องสั่ง และรายงานรายวัน
 * อ่านจากเคสอยู่แล้ว ถ้าย้ายไปอยู่ที่ใบงานอย่างเดียวต้องรื้อทั้งหมดนั้น
 * จึงเก็บสำเนาไว้ที่เคสด้วย แล้วให้ใบงานเป็นฝ่ายเขียน
 *
 * เขียนประวัติของเคสด้วยทุกครั้ง ประวัติจะได้ต่อเนื่องกับของเดิมที่กรอกบนกระดาน
 * ไม่ใช่ขาดหายไปตอนที่เริ่มใช้ใบงาน
 */
async function syncOutageFromWorkOrder(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  workOrderId: number,
  userId: number
) {
  const wo = await tx.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      outageId: true,
      code: true,
      symptom: true,
      workStatus: true,
      scheduledAt: true,
      parts: {
        where: { kind: "WAITING" },
        select: {
          quantity: true,
          sparePart: { select: { partCode: true, id: true } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!wo || wo.outageId === null) return;

  await tx.outage.update({
    where: { id: wo.outageId },
    data: {
      symptom: wo.symptom,
      workStatus: wo.workStatus,
      scheduledVisitAt: wo.scheduledAt,
      noteUpdatedAt: new Date(),
      noteUpdatedById: userId,
    },
  });

  await tx.outagePart.deleteMany({ where: { outageId: wo.outageId } });
  if (wo.parts.length > 0) {
    await tx.outagePart.createMany({
      data: wo.parts.map((p) => ({
        outageId: wo.outageId!,
        sparePartId: p.sparePart.id,
        quantity: p.quantity,
      })),
    });
  }

  const summary =
    wo.parts.length === 0
      ? null
      : wo.parts
          .map((p) => (p.quantity > 1 ? `${p.sparePart.partCode} x${p.quantity}` : p.sparePart.partCode))
          .join(", ");

  await tx.outageNoteLog.create({
    data: {
      outageId: wo.outageId,
      userId,
      symptom: wo.symptom,
      workStatus: wo.workStatus,
      scheduledVisitAt: wo.scheduledAt,
      partsSummary: summary ? `${summary} (${wo.code})` : wo.code,
    },
  });
}

/** แทนที่อะไหล่ของใบงานทั้งชุดเฉพาะประเภทที่ระบุ ไม่แตะอีกประเภท */
async function replaceParts(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  workOrderId: number,
  kind: "WAITING" | "USED",
  parts: { sparePartId: number; quantity: number }[]
) {
  await tx.workOrderPart.deleteMany({ where: { workOrderId, kind } });
  // ตัวเดิมส่งมาซ้ำให้รวมจำนวนกัน ไม่ใช่ error
  const merged = new Map<number, number>();
  for (const p of parts) merged.set(p.sparePartId, (merged.get(p.sparePartId) ?? 0) + p.quantity);
  if (merged.size === 0) return;
  await tx.workOrderPart.createMany({
    data: [...merged].map(([sparePartId, quantity]) => ({ workOrderId, sparePartId, quantity, kind })),
  });
}

type WorkOrderRow = Awaited<
  ReturnType<typeof prisma.workOrder.findFirstOrThrow<{ include: typeof detailInclude }>>
>;

function shape(w: WorkOrderRow) {
  return {
    id: w.id,
    code: w.code,
    source: w.source,
    title: w.title,
    detail: w.detail,
    status: w.status,
    statusLabel: WORK_ORDER_STATUS_LABELS[w.status] ?? w.status,
    priority: w.priority,
    priorityLabel: WORK_ORDER_PRIORITY_LABELS[w.priority] ?? w.priority,
    branchCode: w.branch.code,
    branchName: w.branch.name,
    region: w.branch.region,
    zone: w.branch.zone,
    ownership: w.branch.ownership,
    machineCode: w.machine?.code ?? null,
    machineType: w.machine?.type ?? null,
    machineBrand: w.machine?.brand ?? null,
    assignedToId: w.assignedTo?.id ?? null,
    assignedToName: w.assignedTo?.name ?? null,
    scheduledAt: w.scheduledAt,
    createdByName: w.createdBy?.name ?? null,
    createdAt: w.createdAt,
    closedAt: w.closedAt,
    closedByName: w.closedBy?.name ?? null,
    closeResult: w.closeResult,
    closeResultLabel: w.closeResult
      ? WORK_ORDER_RESULT_LABELS[w.closeResult] ?? w.closeResult
      : null,
    closeNote: w.closeNote,
    // ขั้นนี้รอใคร ให้หน้าจอตัดสินใจได้ว่าจะโชว์ปุ่มอะไรโดยไม่ต้องรู้กติกาเอง
    stageActor: WORK_ORDER_STAGE_ACTOR[w.status] ?? null,
    stageActorLabel: WORK_ORDER_STAGE_ACTOR[w.status]
      ? ROLE_LABELS[WORK_ORDER_STAGE_ACTOR[w.status]] ?? null
      : null,
    // อาการกับสถานะ — ชุดเดียวกับที่กระดานเคยให้กรอก
    symptom: w.symptom,
    workStatus: w.workStatus,
    workStatusLabel: w.workStatus ? WORK_STATUS_LABELS[w.workStatus] ?? w.workStatus : null,
    outageId: w.outageId,
    // เคสยังเปิดอยู่ไหมตอนนี้ ใช้เตือนตอนปิดงานว่าเครื่องยังไม่กลับมา
    outageStillOpen: w.outage ? w.outage.endedAt === null : null,
    outageKind: w.outage?.kind ?? null,
    // อะไหล่ที่รออยู่ กับอะไหล่ที่ใช้ไปจริง เป็นคนละชุด
    waitingParts: w.parts.filter((p) => p.kind === "WAITING").map(partShape),
    parts: w.parts.filter((p) => p.kind !== "WAITING").map(partShape),
  };
}

function partShape(p: {
  quantity: number;
  inStock?: boolean | null;
  warehouse?: string | null;
  sparePart: { id: number; partCode: string; name: string; brand: string | null };
}) {
  return {
    sparePartId: p.sparePart.id,
    partCode: p.sparePart.partCode,
    name: p.sparePart.name,
    brand: p.sparePart.brand,
    quantity: p.quantity,
    // ว่าง = ยังไม่มีใครเช็ค ต่างจาก false ที่แปลว่าเช็คแล้วและหมด
    inStock: p.inStock ?? null,
    warehouse: p.warehouse ?? null,
  };
}

/** เขียนประวัติทุกครั้งที่ใบงานขยับ ใช้ tx เดียวกับการเปลี่ยนสถานะเสมอ */
async function writeLog(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  workOrderId: number,
  userId: number | undefined,
  action: string,
  status: string,
  note?: string | null
) {
  await tx.workOrderLog.create({
    data: { workOrderId, userId: userId ?? null, action, status, note: note ?? null },
  });
}

// ── รายการ ──────────────────────────────────────────────

const listQuery = z.object({
  status: z.enum([...WORK_ORDER_STATUSES, "ACTIVE", "ALL"]).default("ACTIVE"),
  assignedTo: z.string().optional(),
  branchCode: z.string().optional(),
  search: z.string().optional(),
});

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const q = parsed.data;
  const keyword = q.search?.trim();

  const statusFilter =
    q.status === "ALL"
      ? {}
      : q.status === "ACTIVE"
        ? { status: { in: [...ACTIVE_WORK_ORDER_STATUSES] } }
        : { status: q.status };

  /**
   * เห็นเท่าที่เกี่ยวข้องกับตัวเอง
   *
   * หัวหน้าภาคเห็นเฉพาะภาคตัวเอง ช่างเห็นเฉพาะงานที่ถูกจ่ายให้ตัวเองกับงานที่ยังไม่มีเจ้าของ
   * แอดมินเห็นทุกใบ รายการที่ยาวเป็นร้อยใบโดยไม่มีอะไรเกี่ยวกับคนอ่านคือรายการที่ไม่มีใครเปิด
   */
  const me = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: { region: true },
  });
  const scope =
    req.auth!.role === "ADMIN"
      ? {}
      : req.auth!.role === "SUPERVISOR"
        ? { branch: { region: me?.region ?? "\u0000ไม่มีภาค" } }
        : // ช่างเห็นเฉพาะงานที่ถูกจ่ายให้ตัวเอง เพราะในสายงานนี้งานถูกจ่ายมา
          // ไม่ใช่ให้เดินไปหยิบเอง รายการที่มีงานของคนอื่นปนคือรายการที่หางานตัวเองไม่เจอ
          { assignedToId: req.auth!.userId };

  const rows = await prisma.workOrder.findMany({
    where: {
      ...scope,
      ...statusFilter,
      ...(q.assignedTo === "me" ? { assignedToId: req.auth!.userId } : {}),
      ...(q.branchCode ? { branch: { code: q.branchCode } } : {}),
      ...(keyword
        ? {
            OR: [
              { code: { contains: keyword, mode: "insensitive" as const } },
              { title: { contains: keyword, mode: "insensitive" as const } },
              { branch: { code: { contains: keyword, mode: "insensitive" as const } } },
              { branch: { name: { contains: keyword, mode: "insensitive" as const } } },
              { machine: { code: { contains: keyword, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    include: detailInclude,
    // ด่วนขึ้นก่อน แล้วเก่าสุดขึ้นก่อน — ลำดับที่ควรหยิบไปทำ
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  const counts = await prisma.workOrder.groupBy({ by: ["status"], _count: true });

  res.json({
    rows: rows.map(shape),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
  });
});

/** ตัวเลือกที่หน้าจอต้องใช้ — สถานะ ความเร่งด่วน ผลงาน และรายชื่อช่าง */
router.get("/options", requireAuth, async (_req, res) => {
  // เฉพาะช่าง — จ่ายงานให้แอดมินหรือหัวหน้าภาคไม่ใช่สิ่งที่สายงานนี้ทำ
  // และรายชื่อที่มีทุกคนปนอยู่ทำให้กดผิดคนได้ง่าย
  const technicians = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    select: { id: true, name: true, employeeCode: true },
    orderBy: { name: "asc" },
  });
  res.json({
    statuses: WORK_ORDER_STATUSES.map((v) => ({ value: v, label: WORK_ORDER_STATUS_LABELS[v] })),
    priorities: WORK_ORDER_PRIORITIES.map((v) => ({
      value: v,
      label: WORK_ORDER_PRIORITY_LABELS[v],
    })),
    results: WORK_ORDER_RESULTS.map((v) => ({ value: v, label: WORK_ORDER_RESULT_LABELS[v] })),
    // สถานะการดำเนินการของเคส ชุดเดียวกับที่กระดานเคยใช้
    workStatuses: WORK_STATUSES.map((v) => ({ value: v, label: WORK_STATUS_LABELS[v] })),
    warehouses: WAREHOUSES,
    // ลำดับขั้นทั้งหมด ให้หน้าจอวาดเส้นทางเดินงานได้โดยไม่ต้องเขียนลำดับซ้ำ
    stages: WORK_ORDER_STAGE_ORDER.map((v) => ({
      value: v,
      label: WORK_ORDER_STATUS_LABELS[v],
      actor: WORK_ORDER_STAGE_ACTOR[v] ?? null,
      actorLabel: WORK_ORDER_STAGE_ACTOR[v]
        ? ROLE_LABELS[WORK_ORDER_STAGE_ACTOR[v]] ?? null
        : null,
    })),
    technicians,
  });
});

router.get("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });

  const row = await prisma.workOrder.findUnique({ where: { id }, include: detailInclude });
  if (!row) return res.status(404).json({ error: "ไม่พบใบงานนี้" });

  const logs = await prisma.workOrderLog.findMany({
    where: { workOrderId: id },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    ...shape(row),
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      actionLabel: WORK_ORDER_ACTION_LABELS[l.action] ?? l.action,
      status: l.status,
      statusLabel: WORK_ORDER_STATUS_LABELS[l.status] ?? l.status,
      note: l.note,
      byName: l.user?.name ?? null,
      createdAt: l.createdAt,
    })),
  });
});

// ── เปิดใบงาน ──────────────────────────────────────────

const createSchema = z.object({
  branchCode: z.string().min(1),
  machineCode: z.string().optional(),
  title: z.string().min(1, "ต้องระบุเรื่องที่ให้ไปทำ"),
  detail: z.string().optional(),
  priority: z.enum(WORK_ORDER_PRIORITIES).default("NORMAL"),
  assignedToId: z.number().int().nullable().optional(),
  scheduledAt: z.string().min(1).nullable().optional(),
  symptom: z.string().trim().max(500).nullable().optional(),
  workStatus: z.enum(WORK_STATUSES).nullable().optional(),
  // อะไหล่ที่รออยู่ ส่งมาทั้งชุดเสมอ ระบบแทนที่ของเดิม ส่ง [] คือล้างออกหมด
  waitingParts: z
    .array(
      z.object({
        sparePartId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(999).default(1),
      })
    )
    .max(20)
    .optional(),
});

/**
 * สร้างใบงานแล้วตั้งรหัสจาก id ที่เพิ่งได้
 *
 * ตั้งรหัสจาก id แทนการนับแถวก่อน เพราะการนับแล้วบวกหนึ่งจะชนกันทันที
 * ถ้ามีคนกดพร้อมกันสองคน ซึ่งเป็นเรื่องปกติตอนเช้าที่ทุกคนเปิดงานพร้อมกัน
 */
async function createWorkOrder(
  data: {
    branchId: number;
    machineId: number | null;
    outageId: number | null;
    source: string;
    title: string;
    detail: string | null;
    priority: string;
    assignedToId: number | null;
    scheduledAt: Date | null;
    symptom: string | null;
    workStatus: string | null;
  },
  waitingParts: { sparePartId: number; quantity: number }[],
  userId: number
) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.workOrder.create({
      data: { ...data, code: "", createdById: userId, status: "NEW" },
    });
    const withCode = await tx.workOrder.update({
      where: { id: created.id },
      data: { code: workOrderCode(created.id) },
    });
    if (waitingParts.length > 0) await replaceParts(tx, created.id, "WAITING", waitingParts);
    await writeLog(tx, created.id, userId, "CREATED", "NEW", null);
    // เคสที่เป็นต้นเรื่องต้องเห็นอาการเดียวกันทันที ไม่ต้องรอให้ใครมากรอกซ้ำ
    await syncOutageFromWorkOrder(tx, created.id, userId);
    return withCode.id;
  });
}

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const body = parsed.data;

  const branch = await prisma.branch.findUnique({
    where: { code: body.branchCode },
    select: { id: true, cancelledAt: true },
  });
  if (!branch) return res.status(404).json({ error: `ไม่พบสาขา ${body.branchCode}` });
  if (branch.cancelledAt) {
    return res.status(400).json({ error: "สาขานี้ถูกทำเครื่องหมายว่ายกเลิกแล้ว" });
  }

  let machineId: number | null = null;
  if (body.machineCode) {
    const machine = await prisma.machine.findFirst({
      where: { branchId: branch.id, code: body.machineCode },
      select: { id: true, removedAt: true },
    });
    if (!machine) {
      return res
        .status(404)
        .json({ error: `ไม่พบเครื่อง ${body.machineCode} ในสาขา ${body.branchCode}` });
    }
    if (machine.removedAt) return res.status(400).json({ error: "เครื่องนี้ถูกถอดออกไปแล้ว" });
    machineId = machine.id;
  }

  const id = await createWorkOrder(
    {
      branchId: branch.id,
      machineId,
      outageId: null,
      source: "MANUAL",
      title: body.title.trim(),
      detail: body.detail?.trim() || null,
      priority: body.priority,
      assignedToId: body.assignedToId ?? null,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      symptom: body.symptom?.trim() || null,
      workStatus: body.workStatus ?? null,
    },
    body.waitingParts ?? [],
    req.auth!.userId
  );

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.status(201).json(shape(row));
});

const fromOutageSchema = z.object({
  title: z.string().optional(),
  detail: z.string().optional(),
  priority: z.enum(WORK_ORDER_PRIORITIES).default("NORMAL"),
  assignedToId: z.number().int().nullable().optional(),
  scheduledAt: z.string().min(1).nullable().optional(),
  symptom: z.string().trim().max(500).nullable().optional(),
  workStatus: z.enum(WORK_STATUSES).nullable().optional(),
  // อะไหล่ที่รออยู่ ส่งมาทั้งชุดเสมอ ระบบแทนที่ของเดิม ส่ง [] คือล้างออกหมด
  waitingParts: z
    .array(
      z.object({
        sparePartId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(999).default(1),
      })
    )
    .max(20)
    .optional(),
});

router.post("/from-outage/:outageId", requireAuth, async (req: AuthRequest, res) => {
  const outageId = Number(req.params.outageId);
  if (!Number.isInteger(outageId)) return res.status(400).json({ error: "รหัสเคสไม่ถูกต้อง" });

  const parsed = fromOutageSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const body = parsed.data;

  const outage = await prisma.outage.findUnique({
    where: { id: outageId },
    include: {
      branch: { select: { id: true, code: true, name: true } },
      machine: { select: { id: true, code: true } },
      parts: { select: { sparePartId: true, quantity: true } },
    },
  });
  if (!outage) return res.status(404).json({ error: "ไม่พบเคสนี้" });

  // ใบงานซ้ำคือปัญหาจริง — ช่างสองคนขับไปสาขาเดียวกันเพราะต่างคนต่างเปิด
  const existing = await prisma.workOrder.findFirst({
    where: { outageId, status: { in: [...ACTIVE_WORK_ORDER_STATUSES] } },
    include: detailInclude,
  });
  if (existing) {
    return res.status(409).json({
      error: `เคสนี้มีใบงาน ${existing.code} เปิดค้างอยู่แล้ว`,
      workOrder: shape(existing),
    });
  }

  const isSignalLost = outage.kind === "SIGNAL_LOST";
  const defaultTitle = isSignalLost
    ? `สัญญาณหายทั้งสาขา ${outage.branch.code}`
    : `เครื่อง ${outage.machine?.code ?? ""} ดับ — ${outage.branch.code}`;

  const id = await createWorkOrder(
    {
      branchId: outage.branch.id,
      // สัญญาณหายเป็นปัญหาระดับสาขา ไม่ผูกกับเครื่องใดเครื่องหนึ่ง
      machineId: isSignalLost ? null : outage.machine?.id ?? null,
      outageId,
      source: "OUTAGE",
      title: body.title?.trim() || defaultTitle,
      // อาการที่เคยกรอกไว้ในเคสติดไปกับใบงานด้วย ช่างจะได้ไม่ต้องเปิดสองที่
      detail: body.detail?.trim() || outage.symptom || null,
      priority: body.priority,
      assignedToId: body.assignedToId ?? null,
      scheduledAt: body.scheduledAt
        ? new Date(body.scheduledAt)
        : outage.scheduledVisitAt ?? null,
      // ที่เคยกรอกไว้บนกระดานถูกยกมาเป็นค่าตั้งต้น ไม่ใช่ทิ้งแล้วเริ่มใหม่
      symptom: body.symptom !== undefined ? body.symptom?.trim() || null : outage.symptom,
      workStatus: body.workStatus !== undefined ? body.workStatus : outage.workStatus,
    },
    body.waitingParts ?? outage.parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
    req.auth!.userId
  );

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.status(201).json(shape(row));
});

// ── แก้ไข / มอบหมาย / รับงาน ──────────────────────────

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  detail: z.string().nullable().optional(),
  priority: z.enum(WORK_ORDER_PRIORITIES).optional(),
  assignedToId: z.number().int().nullable().optional(),
  scheduledAt: z.string().min(1).nullable().optional(),
  symptom: z.string().trim().max(500).nullable().optional(),
  workStatus: z.enum(WORK_STATUSES).nullable().optional(),
  // อะไหล่ที่รออยู่ ส่งมาทั้งชุดเสมอ ระบบแทนที่ของเดิม ส่ง [] คือล้างออกหมด
  waitingParts: z
    .array(
      z.object({
        sparePartId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(999).default(1),
      })
    )
    .max(20)
    .optional(),
});

router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const body = parsed.data;

  const current = await prisma.workOrder.findUnique({
    where: { id },
    select: { status: true, assignedToId: true },
  });
  if (!current) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (current.status === "DONE" || current.status === "CANCELLED") {
    return res.status(400).json({ error: "ใบงานนี้ปิดไปแล้ว แก้ไขไม่ได้" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.detail !== undefined ? { detail: body.detail?.trim() || null } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.assignedToId !== undefined ? { assignedToId: body.assignedToId } : {}),
        ...(body.scheduledAt !== undefined
          ? { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null }
          : {}),
        ...(body.symptom !== undefined ? { symptom: body.symptom?.trim() || null } : {}),
        ...(body.workStatus !== undefined ? { workStatus: body.workStatus } : {}),
      },
    });

    if (body.waitingParts !== undefined) {
      await replaceParts(tx, id, "WAITING", body.waitingParts);
    }

    // อาการ สถานะ อะไหล่ที่รอ และวันนัด เป็นสิ่งที่กระดานแสดง จึงต้องส่งต่อไปที่เคส
    const touchedNote =
      body.symptom !== undefined ||
      body.workStatus !== undefined ||
      body.waitingParts !== undefined ||
      body.scheduledAt !== undefined;
    if (touchedNote) await syncOutageFromWorkOrder(tx, id, req.auth!.userId);

    await writeLog(tx, id, req.auth!.userId, "EDITED", current.status);
  });

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});


// ── การเดินขั้นตามสายงาน ────────────────────────────
//
// แต่ละขั้นมีเจ้าของ และเดินได้ทีละขั้นเท่านั้น แอดมินทำแทนได้ทุกขั้นเพราะงานด่วน
// รอหัวหน้าภาคว่างไม่ได้ แต่ก็ยังข้ามลำดับไม่ได้ ไม่งั้นจะมีใบงานที่จ่ายให้ช่าง
// ทั้งที่ยังไม่มีใครเช็คว่ามีอะไหล่หรือเปล่า

/**
 * ตรวจว่าคนนี้ยุ่งกับใบงานนี้ได้ไหม ก่อนดูว่าขั้นถูกหรือเปล่า
 *
 * หัวหน้าภาคดูแลเฉพาะภาคตัวเอง ถ้าไม่กันไว้ หัวหน้าภาคใต้จะจ่ายงานภาคเหนือได้
 * ซึ่งไม่ใช่แค่ผิดสิทธิ์ แต่ทำให้ช่างที่อยู่คนละจังหวัดถูกส่งไปงานที่ไปไม่ถึง
 */
async function guardStage(
  req: AuthRequest,
  res: Response,
  id: number,
  expected: string
): Promise<{ id: number; status: string; assignedToId: number | null } | null> {
  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      assignedToId: true,
      branch: { select: { region: true } },
    },
  });
  if (!wo) {
    res.status(404).json({ error: "ไม่พบใบงานนี้" });
    return null;
  }

  const role = req.auth!.role;
  if (role === "SUPERVISOR") {
    const me = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: { region: true },
    });
    if (!me?.region || me.region !== wo.branch.region) {
      res.status(403).json({
        error: `ใบงานนี้อยู่ภาค${wo.branch.region ?? "ที่ยังไม่ระบุ"} ไม่ใช่ภาคที่คุณดูแล`,
      });
      return null;
    }
  }

  if (wo.status !== expected) {
    res.status(409).json({
      error: `${wo.code} อยู่ขั้น "${WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status}" ยังไม่ถึงขั้นนี้`,
      status: wo.status,
    });
    return null;
  }

  if (!canActOnStage(role, expected)) {
    const actor = WORK_ORDER_STAGE_ACTOR[expected];
    res.status(403).json({
      error: `ขั้นนี้เป็นของ${ROLE_LABELS[actor] ?? actor} ไม่ใช่ของคุณ`,
    });
    return null;
  }

  return { id: wo.id, status: wo.status, assignedToId: wo.assignedToId };
}

/** ขั้น 2 — หัวหน้าภาคระบุอะไหล่ที่ต้องใช้ */
const partsSchema = z.object({
  parts: z
    .array(
      z.object({
        sparePartId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(999).default(1),
      })
    )
    .min(1, "ต้องระบุอะไหล่อย่างน้อยหนึ่งรายการ")
    .max(20),
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/parts", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = partsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await guardStage(req, res, id, "NEW"))) return;

  await prisma.$transaction(async (tx) => {
    await replaceParts(tx, id, "WAITING", parsed.data.parts);
    await tx.workOrder.update({ where: { id }, data: { status: "PARTS_REQUESTED" } });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "PARTS_REQUESTED",
      "PARTS_REQUESTED",
      parsed.data.note || null
    );
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  });

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

/** ขั้น 3 — แอดมินเช็คว่าอะไหล่แต่ละตัวมีไหม อยู่คลังไหน */
const partsCheckSchema = z.object({
  results: z
    .array(
      z.object({
        sparePartId: z.number().int().positive(),
        inStock: z.boolean(),
        // บังคับเฉพาะตอนบอกว่ามีของ ของที่หมดไม่มีคลังให้ระบุ
        warehouse: z.string().trim().max(120).nullable().optional(),
      })
    )
    .min(1),
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/parts-check", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = partsCheckSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await guardStage(req, res, id, "PARTS_REQUESTED"))) return;

  const waiting = await prisma.workOrderPart.findMany({
    where: { workOrderId: id, kind: "WAITING" },
    select: { sparePartId: true },
  });
  const need = new Set(waiting.map((w) => w.sparePartId));
  const answered = new Set(parsed.data.results.map((r) => r.sparePartId));
  const missing = [...need].filter((pid) => !answered.has(pid));
  if (missing.length > 0) {
    return res.status(400).json({ error: "ต้องเช็คให้ครบทุกรายการก่อนจึงจะไปขั้นต่อไปได้" });
  }
  for (const r of parsed.data.results) {
    if (r.inStock && !r.warehouse) {
      return res.status(400).json({ error: "ของที่มีอยู่ ต้องระบุด้วยว่าอยู่คลังไหน" });
    }
    if (r.inStock && r.warehouse && !WAREHOUSES.includes(r.warehouse as never)) {
      return res.status(400).json({ error: `ไม่รู้จักคลัง "${r.warehouse}"` });
    }
  }

  // มีตัวไหนหมด = ทั้งใบต้องรออะไหล่ เพราะช่างไปแล้วก็ซ่อมไม่จบอยู่ดี
  const anyOut = parsed.data.results.some((r) => !r.inStock);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const r of parsed.data.results) {
      await tx.workOrderPart.updateMany({
        where: { workOrderId: id, kind: "WAITING", sparePartId: r.sparePartId },
        data: {
          inStock: r.inStock,
          warehouse: r.inStock ? r.warehouse ?? null : null,
          checkedAt: now,
          checkedById: req.auth!.userId,
        },
      });
    }
    await tx.workOrder.update({
      where: { id },
      data: {
        status: "PARTS_CHECKED",
        // ของหมดขึ้นรออะไหล่ให้เอง ไม่ต้องรอใครมากดอีกที
        ...(anyOut ? { workStatus: "WAITING_PARTS" } : {}),
      },
    });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "PARTS_CHECKED",
      "PARTS_CHECKED",
      parsed.data.note ||
        (anyOut ? "มีอะไหล่ที่หมด — ขึ้นสถานะรออะไหล่" : "อะไหล่ครบทุกรายการ")
    );
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  });

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

/** ขั้น 4 — หัวหน้าภาคจ่ายงานให้ช่าง */
const assignSchema = z.object({
  assignedToId: z.number().int().positive(),
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/assign", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await guardStage(req, res, id, "PARTS_CHECKED"))) return;

  const tech = await prisma.user.findUnique({
    where: { id: parsed.data.assignedToId },
    select: { id: true, name: true },
  });
  if (!tech) return res.status(404).json({ error: "ไม่พบช่างคนนี้" });

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: { status: "ASSIGNED", assignedToId: tech.id },
    });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "ASSIGNED",
      "ASSIGNED",
      parsed.data.note || `จ่ายงานให้ ${tech.name}`
    );
  });

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

/** ขั้น 5 — ช่างกำหนดวันที่จะเข้า */
const scheduleSchema = z.object({
  scheduledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็น ปี-เดือน-วัน"),
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/schedule", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const wo = await guardStage(req, res, id, "ASSIGNED");
  if (!wo) return;

  // ช่างคนอื่นนัดวันแทนกันไม่ได้ คนที่ถือใบงานคือคนที่รู้ว่าตัวเองว่างวันไหน
  if (
    req.auth!.role !== "ADMIN" &&
    wo.assignedToId !== null &&
    wo.assignedToId !== req.auth!.userId
  ) {
    return res.status(403).json({ error: "ใบงานนี้จ่ายให้ช่างคนอื่น" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        scheduledAt: new Date(`${parsed.data.scheduledAt}T00:00:00.000Z`),
        // นัดวันแล้ว = รอช่างเข้า ไม่ใช่รออะไหล่อีกต่อไป เว้นแต่ของยังไม่มา
        ...(parsed.data.note ? {} : {}),
      },
    });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "SCHEDULED",
      "IN_PROGRESS",
      parsed.data.note || `นัดเข้าวันที่ ${parsed.data.scheduledAt}`
    );
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  });

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

// ── ปิดงาน ────────────────────────────────────────────

const closeSchema = z.object({
  result: z.enum(WORK_ORDER_RESULTS),
  note: z.string().optional(),
  parts: z
    .array(z.object({ sparePartId: z.number().int(), quantity: z.number().int().min(1) }))
    .optional(),
});

router.post("/:id/close", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });

  const parsed = closeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const body = parsed.data;

  const current = await prisma.workOrder.findUnique({
    where: { id },
    select: { status: true, code: true, assignedToId: true },
  });
  if (!current) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (current.status === "DONE") {
    return res.status(400).json({ error: `${current.code} ปิดไปแล้ว` });
  }
  if (current.status === "CANCELLED") {
    return res.status(400).json({ error: `${current.code} ถูกยกเลิกไปแล้ว` });
  }
  // ปิดได้ตั้งแต่ถูกจ่ายงานแล้ว เผื่อไปถึงหน้างานวันเดียวกันโดยไม่ได้นัดล่วงหน้า
  if (current.status !== "ASSIGNED" && current.status !== "IN_PROGRESS") {
    return res.status(409).json({
      error: `${current.code} ยังไม่ถูกจ่ายให้ช่าง ปิดงานไม่ได้ — ตอนนี้อยู่ขั้น "${
        WORK_ORDER_STATUS_LABELS[current.status] ?? current.status
      }"`,
    });
  }
  // คนปิดต้องเป็นคนที่ไปทำ ไม่งั้นใบงานถูกปิดโดยคนที่ไม่รู้ว่าหน้างานเป็นยังไง
  if (
    req.auth!.role !== "ADMIN" &&
    current.assignedToId !== null &&
    current.assignedToId !== req.auth!.userId
  ) {
    return res.status(403).json({ error: "ใบงานนี้จ่ายให้ช่างคนอื่น" });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: {
        status: "DONE",
        closedAt: now,
        closedById: req.auth!.userId,
        closeResult: body.result,
        closeNote: body.note?.trim() || null,
      },
    });

    // ของที่ใช้จริง ไม่ไปแตะรายการของที่รออยู่ ซึ่งเป็นคนละชุด
    if (body.parts !== undefined) await replaceParts(tx, id, "USED", body.parts);

    await writeLog(tx, id, req.auth!.userId, "CLOSED", "DONE", body.note?.trim() || null);
  });

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

const cancelSchema = z.object({ reason: z.string().optional() });

router.post("/:id/cancel", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });

  const parsed = cancelSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const current = await prisma.workOrder.findUnique({
    where: { id },
    select: { status: true, code: true },
  });
  if (!current) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (current.status === "DONE") {
    return res.status(400).json({ error: `${current.code} ปิดไปแล้ว ยกเลิกไม่ได้` });
  }

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({ where: { id }, data: { status: "CANCELLED" } });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "CANCELLED",
      "CANCELLED",
      parsed.data.reason?.trim() || null
    );
  });

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

/** เปิดใหม่ เผื่อปิดผิดใบ — แอดมินเท่านั้น เพราะเป็นการย้อนสิ่งที่บันทึกไปแล้ว */
router.post("/:id/reopen", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });

  const current = await prisma.workOrder.findUnique({ where: { id }, select: { status: true } });
  if (!current) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (current.status !== "DONE" && current.status !== "CANCELLED") {
    return res.status(400).json({ error: "ใบงานนี้ยังไม่ได้ปิด" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: { status: "ASSIGNED", closedAt: null, closedById: null, closeResult: null },
    });
    await writeLog(tx, id, req.auth!.userId, "REOPENED", "ASSIGNED");
  });

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

export default router;
