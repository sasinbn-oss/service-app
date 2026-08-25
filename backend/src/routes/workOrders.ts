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
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import {
  ACTIVE_WORK_ORDER_STATUSES,
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
    outageId: w.outageId,
    // เคสยังเปิดอยู่ไหมตอนนี้ ใช้เตือนตอนปิดงานว่าเครื่องยังไม่กลับมา
    outageStillOpen: w.outage ? w.outage.endedAt === null : null,
    outageKind: w.outage?.kind ?? null,
    parts: w.parts.map((p) => ({
      sparePartId: p.sparePart.id,
      partCode: p.sparePart.partCode,
      name: p.sparePart.name,
      brand: p.sparePart.brand,
      quantity: p.quantity,
    })),
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

  const rows = await prisma.workOrder.findMany({
    where: {
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
  const technicians = await prisma.user.findMany({
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
  },
  userId: number
) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.workOrder.create({
      data: { ...data, code: "", createdById: userId, status: "OPEN" },
    });
    const withCode = await tx.workOrder.update({
      where: { id: created.id },
      data: { code: workOrderCode(created.id) },
    });
    await writeLog(tx, created.id, userId, "CREATED", "OPEN", null);
    if (data.assignedToId) {
      await writeLog(tx, created.id, userId, "ASSIGNED", "OPEN", null);
    }
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
    },
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
    },
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
  status: z.enum(["OPEN", "IN_PROGRESS"]).optional(),
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
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });

    const nextStatus = body.status ?? current.status;
    if (body.status === "IN_PROGRESS" && current.status !== "IN_PROGRESS") {
      await writeLog(tx, id, req.auth!.userId, "STARTED", nextStatus);
    } else if (
      body.assignedToId !== undefined &&
      body.assignedToId !== current.assignedToId
    ) {
      await writeLog(tx, id, req.auth!.userId, "ASSIGNED", nextStatus);
    } else {
      await writeLog(tx, id, req.auth!.userId, "EDITED", nextStatus);
    }
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
    select: { status: true, code: true },
  });
  if (!current) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (current.status === "DONE") {
    return res.status(400).json({ error: `${current.code} ปิดไปแล้ว` });
  }
  if (current.status === "CANCELLED") {
    return res.status(400).json({ error: `${current.code} ถูกยกเลิกไปแล้ว` });
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

    if (body.parts && body.parts.length > 0) {
      await tx.workOrderPart.deleteMany({ where: { workOrderId: id } });
      await tx.workOrderPart.createMany({
        data: body.parts.map((p) => ({
          workOrderId: id,
          sparePartId: p.sparePartId,
          quantity: p.quantity,
        })),
        skipDuplicates: true,
      });
    }

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
  if (current.status === "OPEN" || current.status === "IN_PROGRESS") {
    return res.status(400).json({ error: "ใบงานนี้ยังไม่ได้ปิด" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: { status: "OPEN", closedAt: null, closedById: null, closeResult: null },
    });
    await writeLog(tx, id, req.auth!.userId, "REOPENED", "OPEN");
  });

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

export default router;
