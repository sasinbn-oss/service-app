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
import multer from "multer";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { WAREHOUSES } from "../documents/warehouses";
import {
  buildObjectKey,
  deleteObject,
  getDownloadUrl,
  isFileStoreConfigured,
  uploadObject,
  SIGNED_URL_TTL_SECONDS,
} from "../storage/fileStore";
import {
  ACTIVE_WORK_ORDER_STATUSES,
  ATTACHMENT_KIND_LABELS,
  attachmentKindFor,
  MAX_ATTACHMENTS_PER_WORK_ORDER,
  MAX_ATTACHMENT_IMAGE_BYTES,
  MAX_ATTACHMENT_THUMBNAIL_BYTES,
  MAX_ATTACHMENT_VIDEO_BYTES,
  JOB_TYPES,
  JOB_TYPE_HINTS,
  JOB_TYPE_LABELS,
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
  machine: { select: { code: true, type: true, brand: true, model: true } },
  assignedTo: { select: { id: true, name: true, employeeCode: true } },
  createdBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  outage: { select: { id: true, kind: true, startedAt: true, endedAt: true } },
  parts: {
    include: { sparePart: { select: { id: true, partCode: true, name: true, brand: true } } },
    orderBy: { id: "asc" },
  },
  // นับอย่างเดียว ไม่ดึงรูปย่อมาด้วย เพราะรายการใบงานมีเป็นร้อยใบ
  // ถ้าติดรูปย่อไปทุกใบ หน้ารายการจะโหลดหนักกว่าหน้ารายละเอียดหลายเท่า
  _count: { select: { attachments: true } },
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
  userId: number,
  /**
   * ผู้เรียกที่รู้อยู่แล้วว่าใบงานนี้ไม่ได้ผูกกับเคส ส่ง false มาได้
   *
   * ใบงานที่เปิดเองไม่มีเคสอยู่แล้ว แต่เดิมยังต้องอ่านฐานข้อมูลสองรอบ
   * เพื่อไปพบว่าไม่มีอะไรให้ทำ — สองรอบนั้นคือเวลาที่คนกดบันทึกต้องรอจริง
   * เพราะฐานข้อมูลอยู่คนละเครื่องกับเซิร์ฟเวอร์ ทุกคำสั่งคือการเดินทางไปกลับ
   */
  hasOutage = true
) {
  if (!hasOutage) return;
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
    jobType: w.jobType,
    jobTypeLabel: JOB_TYPE_LABELS[w.jobType] ?? w.jobType,
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
    machineModel: w.machine?.model ?? null,
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
    // ว่าง = หัวหน้าภาคยังไม่ได้ตัดสิน · false = ไม่ใช้อะไหล่ ข้ามขั้นเช็คคลัง
    needsParts: w.needsParts,
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
    attachmentCount: w._count.attachments,
  };
}

/**
 * หน้ารายการใช้ข้อมูลน้อยกว่าหน้ารายละเอียดมาก
 *
 * เดิมรายการดึงชุดเดียวกับหน้ารายละเอียด สะดวกตอนเขียนแต่แพงตอนใช้ —
 * ใบงานที่เปิดค้างสี่ร้อยใบกลายเป็น JSON เกือบ 400 KB ทั้งที่การ์ดในรายการ
 * ใช้จริงสิบกว่าช่อง ที่เหลือคือรายการอะไหล่สองชุดต่อใบที่ไม่มีใครเห็น
 *
 * ช่างที่เปิดรายการงานจากหน้างานด้วย 4G เป็นคนจ่ายค่านั้น ไม่ใช่เซิร์ฟเวอร์
 */
const listSelect = {
  id: true,
  code: true,
  source: true,
  title: true,
  status: true,
  priority: true,
  scheduledAt: true,
  createdAt: true,
  closedAt: true,
  closeResult: true,
  branch: { select: { code: true, name: true } },
  machine: { select: { code: true } },
  assignedTo: { select: { name: true } },
  _count: { select: { attachments: true } },
} as const;

type WorkOrderListRow = Awaited<
  ReturnType<typeof prisma.workOrder.findFirstOrThrow<{ select: typeof listSelect }>>
>;

function listShape(w: WorkOrderListRow) {
  return {
    id: w.id,
    code: w.code,
    source: w.source,
    title: w.title,
    status: w.status,
    statusLabel: WORK_ORDER_STATUS_LABELS[w.status] ?? w.status,
    priority: w.priority,
    priorityLabel: WORK_ORDER_PRIORITY_LABELS[w.priority] ?? w.priority,
    branchCode: w.branch.code,
    branchName: w.branch.name,
    machineCode: w.machine?.code ?? null,
    assignedToName: w.assignedTo?.name ?? null,
    scheduledAt: w.scheduledAt,
    createdAt: w.createdAt,
    closedAt: w.closedAt,
    closeResultLabel: w.closeResult
      ? WORK_ORDER_RESULT_LABELS[w.closeResult] ?? w.closeResult
      : null,
    attachmentCount: w._count.attachments,
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
    select: listSelect,
    // ด่วนขึ้นก่อน แล้วเก่าสุดขึ้นก่อน — ลำดับที่ควรหยิบไปทำ
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  const counts = await prisma.workOrder.groupBy({ by: ["status"], _count: true });

  res.json({
    rows: rows.map(listShape),
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
    jobTypes: JOB_TYPES.map((v) => ({
      value: v,
      label: JOB_TYPE_LABELS[v],
      hint: JOB_TYPE_HINTS[v],
    })),
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
  jobType: z.enum(JOB_TYPES).default("CM"),

  machineCode: z.string().optional(),
  /**
   * เปิดทีเดียวหลายเครื่องในสาขาเดียวกัน — ได้ใบงานเครื่องละใบ
   *
   * ช่างไปสาขาหนึ่งรอบเดียวแต่เจอเสียสามเครื่อง คนละอาการ ถ้าบังคับให้กรอก
   * ฟอร์มใหม่สามรอบ สาขา ประเภทงาน และความเร่งด่วนจะถูกพิมพ์ซ้ำสามครั้ง
   * ทั้งที่เป็นค่าเดียวกัน — ส่วนที่ต่างกันจริงมีแค่เครื่อง รุ่น และอาการ
   *
   * แต่ใบงานยังเป็นเครื่องละใบ ไม่ได้รวมเป็นใบเดียว เพราะแต่ละเครื่องมีอะไหล่
   * ของตัวเอง ปิดคนละเวลา และอาจถูกจ่ายให้ช่างคนละคน ใบเดียวที่ถือสามเครื่อง
   * จะปิดไม่ได้จนกว่าจะเสร็จครบทั้งสาม ซึ่งไม่ตรงกับที่หน้างานเป็นจริง
   */
  machines: z
    .array(
      z.object({
        code: z.string().trim().max(50).optional(),
        model: z.string().trim().max(100).nullable().optional(),
        symptom: z.string().trim().max(500).nullable().optional(),
      })
    )
    .min(1)
    .max(20)
    .optional(),
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
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  data: {
    branchId: number;
    machineId: number | null;
    outageId: number | null;
    source: string;
    jobType: string;
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
  const created = await tx.workOrder.create({
    data: { ...data, code: "", createdById: userId, status: "NEW" },
  });
  await tx.workOrder.update({
    where: { id: created.id },
    data: { code: workOrderCode(created.id) },
  });
  if (waitingParts.length > 0) await replaceParts(tx, created.id, "WAITING", waitingParts);
  await writeLog(tx, created.id, userId, "CREATED", "NEW", null);
  // เคสที่เป็นต้นเรื่องต้องเห็นอาการเดียวกันทันที ไม่ต้องรอให้ใครมากรอกซ้ำ
  await syncOutageFromWorkOrder(tx, created.id, userId, data.outageId !== null);
  return created.id;
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

  // รูปแบบเดิม (machineCode + symptom) กับรูปแบบใหม่ (machines[]) เป็นเรื่องเดียวกัน
  // ทำให้เป็นรายการเสมอตั้งแต่ตรงนี้ โค้ดข้างล่างจะได้มีทางเดียว
  const wanted =
    body.machines ??
    [{ code: body.machineCode, model: null, symptom: body.symptom }];

  // เว้นรหัสเครื่องว่าง = งานทั้งสาขา ซึ่งมีได้ใบเดียว ไม่ใช่สามใบที่ไม่รู้ว่าต่างกันตรงไหน
  const blank = wanted.filter((m) => !m.code?.trim());
  if (blank.length > 0 && wanted.length > 1) {
    return res.status(400).json({ error: "ถ้าไม่ระบุเครื่อง จะเปิดได้ใบเดียวเท่านั้น" });
  }

  const codes = wanted.map((m) => m.code?.trim()).filter((c): c is string => !!c);
  const duplicate = codes.find((c, i) => codes.indexOf(c) !== i);
  if (duplicate) {
    return res.status(400).json({ error: `เครื่อง ${duplicate} ถูกใส่ซ้ำ` });
  }

  /**
   * ตรวจเครื่องให้ครบก่อน แล้วค่อยสร้าง
   *
   * ถ้าตรวจไปสร้างไป พอเครื่องที่สามพิมพ์ผิดจะเหลือใบงานสองใบที่สร้างไปแล้ว
   * กับข้อความ error หนึ่งอัน คนกดไม่มีทางรู้ว่าต้องไปลบสองใบนั้นทิ้งหรือเปล่า
   */
  // ถามทีเดียวทั้งชุด ไม่ใช่ตัวละรอบ — สามเครื่องเคยเป็นสามรอบไปกลับ
  const found = await prisma.machine.findMany({
    where: { branchId: branch.id, code: { in: codes } },
    select: { id: true, code: true, model: true, removedAt: true },
  });
  const machines = new Map(found.map((m) => [m.code, m]));
  for (const code of codes) {
    const machine = machines.get(code);
    if (!machine) {
      return res.status(404).json({ error: `ไม่พบเครื่อง ${code} ในสาขา ${body.branchCode}` });
    }
    if (machine.removedAt) {
      return res.status(400).json({ error: `เครื่อง ${code} ถูกถอดออกไปแล้ว` });
    }
  }

  /**
   * สร้างทั้งชุดใน transaction เดียว ไม่ใช่ใบละ transaction
   *
   * แต่ละ transaction มี BEGIN กับ COMMIT ของตัวเอง สามใบจึงเสียไปกลับ
   * หกรอบกับการเปิดปิดเฉย ๆ และถ้าใบที่สามพังขึ้นมา สองใบแรกจะค้างอยู่
   * ทั้งที่คนกดเห็นแต่ข้อความ error — รวมเป็นชุดเดียวแล้วได้ทั้งคู่ คือเร็วกว่า
   * และได้หรือไม่ได้ทั้งชุด
   */
  const created = await prisma.$transaction(
    async (tx) => {
      const ids: number[] = [];
      for (const entry of wanted) {
        const code = entry.code?.trim();
        const machine = code ? machines.get(code)! : null;

        // รุ่นเก็บที่ตัวเครื่อง ไม่ใช่ที่ใบงาน — กรอกครั้งนี้แล้วครั้งหน้าขึ้นให้เอง
        const model = entry.model?.trim() || null;
        if (machine && model && model !== machine.model) {
          await tx.machine.update({ where: { id: machine.id }, data: { model } });
        }

        ids.push(
          await createWorkOrder(
            tx,
            {
              branchId: branch.id,
              machineId: machine?.id ?? null,
              outageId: null,
              source: "MANUAL",
              jobType: body.jobType,
              title: body.title.trim(),
              detail: body.detail?.trim() || null,
              priority: body.priority,
              assignedToId: body.assignedToId ?? null,
              scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
              symptom: entry.symptom?.trim() || null,
              workStatus: body.workStatus ?? null,
            },
            body.waitingParts ?? [],
            req.auth!.userId
          )
        );
      }
      return ids;
    },
    // เปิดหลายเครื่องพร้อมกันใช้เวลานานกว่าใบเดียว อย่าให้ชนเพดาน 5 วินาทีของ Prisma
    { timeout: 30_000, maxWait: 15_000 }
  );

  const rows = await prisma.workOrder.findMany({
    where: { id: { in: created } },
    include: detailInclude,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = created.map((id) => byId.get(id)!);

  /**
   * ตอบด้วยใบแรกเหมือนเดิม แล้วแนบรายการทั้งชุดมาด้วย
   *
   * หน้าจอเดิมอ่าน res.data.id เพื่อเด้งไปหน้ารายละเอียด ยังทำงานได้เหมือนเดิม
   * ส่วนหน้าที่เปิดหลายเครื่องอ่าน orders เพื่อรู้ว่าต้องแนบรูปเข้าใบไหนบ้าง
   */
  res.status(201).json({
    ...shape(ordered[0]),
    orders: ordered.map((r) => ({
      id: r.id,
      code: r.code,
      machineCode: r.machine?.code ?? null,
    })),
  });
});

const fromOutageSchema = z.object({
  jobType: z.enum(JOB_TYPES).default("CM"),
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

  const id = await prisma.$transaction(
    (tx) =>
      createWorkOrder(
        tx,
        {
          branchId: outage.branch.id,
          // สัญญาณหายเป็นปัญหาระดับสาขา ไม่ผูกกับเครื่องใดเครื่องหนึ่ง
          machineId: isSignalLost ? null : outage.machine?.id ?? null,
          outageId,
          source: "OUTAGE",
          jobType: body.jobType,
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
        body.waitingParts ??
          outage.parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
        req.auth!.userId
      ),
    { timeout: 30_000, maxWait: 15_000 }
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

/**
 * ขั้น 2 — หัวหน้าภาคตัดสินว่างานนี้ใช้อะไหล่ไหม
 *
 * ไม่ใช้อะไหล่ก็มีจริง เช่น เข้าไปประเมินอาการก่อน หรืองานที่แค่ปรับตั้ง
 * กรณีนั้นข้ามขั้นเช็คคลังไปจัดคิวช่างเลย เพราะไม่มีอะไรให้แอดมินเช็ค
 * การบังคับให้ผ่านขั้นที่ไม่มีงานทำคือการทำให้ใบงานค้างโดยไม่มีเหตุผล
 */
const partsSchema = z.object({
  needsParts: z.boolean(),
  parts: z
    .array(
      z.object({
        sparePartId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(999).default(1),
      })
    )
    .max(20)
    .optional(),
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/parts", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = partsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await guardStage(req, res, id, "NEW"))) return;

  const { needsParts, parts, note } = parsed.data;
  if (needsParts && (!parts || parts.length === 0)) {
    return res.status(400).json({ error: "บอกว่าต้องใช้อะไหล่ ต้องระบุอย่างน้อยหนึ่งรายการ" });
  }

  const nextStatus = needsParts ? "PARTS_REQUESTED" : "PARTS_CHECKED";

  await prisma.$transaction(async (tx) => {
    // ไม่ใช้อะไหล่ ให้ล้างรายการที่อาจค้างจากรอบก่อนออกด้วย ไม่งั้นแอดมินจะเห็นของเก่า
    await replaceParts(tx, id, "WAITING", needsParts ? parts! : []);
    await tx.workOrder.update({
      where: { id },
      data: {
        status: nextStatus,
        needsParts,
        // เลิกรออะไหล่แล้ว ถ้าเคยขึ้นสถานะนี้ไว้จากรอบก่อน
        ...(needsParts ? {} : { workStatus: null }),
      },
    });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      needsParts ? "PARTS_REQUESTED" : "NO_PARTS",
      nextStatus,
      note || (needsParts ? null : "ไม่ต้องใช้อะไหล่ — ข้ามไปจัดคิวช่าง")
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


/**
 * ย้อนกลับไปให้หัวหน้าภาคประเมินอะไหล่ใหม่
 *
 * ช่างไปถึงหน้างานแล้วพบว่าต้องเปลี่ยนอะไหล่ ทั้งที่ตอนแรกตกลงกันว่าไม่ต้องใช้
 * หรือของที่เตรียมไปไม่ตรงกับที่เสียจริง กรณีนี้เดินหน้าต่อไม่ได้และปิดงานก็ไม่จบ
 *
 * ช่างเลือกอะไหล่ที่จะเบิกเพิ่มมาด้วยได้ เพราะเป็นคนเดียวที่เห็นของจริงว่าเสียตรงไหน
 * รายการนั้นถูกเก็บเป็นของที่รออยู่ แล้วเปิดให้หัวหน้าภาคดูก่อนส่งต่อให้แอดมินเช็คคลัง
 * — ช่างรู้ว่าต้องใช้อะไร หัวหน้าภาครู้ว่าเบิกได้แค่ไหน สองอย่างนี้คนละเรื่องกัน
 *
 * ส่งกลับไปขั้นแรกแทนการปิดแล้วเปิดใบใหม่ เพราะประวัติ เวลาที่ใช้ และเคสที่ผูกอยู่
 * ต้องอยู่ใบเดียวกัน ไม่งั้นจะดูไม่ออกว่างานนี้ไปมาแล้วกี่รอบ
 *
 * ช่างที่ถือใบงานเป็นคนกด เพราะเป็นคนเดียวที่เห็นหน้างาน
 */
const rollbackSchema = z.object({
  reason: z.string().trim().min(1, "ต้องบอกด้วยว่าเจออะไรที่หน้างาน").max(500),
  // อะไหล่ที่ช่างขอเบิกเพิ่ม ไม่ใส่ก็ได้ ถ้ายังบอกไม่ได้ว่าต้องใช้ตัวไหน
  parts: z
    .array(
      z.object({
        sparePartId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(999).default(1),
      })
    )
    .max(20)
    .optional(),
});

router.post("/:id/reassess-parts", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });

  const parsed = rollbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: {
      code: true,
      status: true,
      assignedToId: true,
      branch: { select: { region: true } },
    },
  });
  if (!wo) return res.status(404).json({ error: "ไม่พบใบงานนี้" });

  // ย้อนได้เฉพาะตอนที่งานอยู่ในมือช่างแล้ว ก่อนหน้านั้นยังไม่มีใครไปเห็นหน้างาน
  if (wo.status !== "ASSIGNED" && wo.status !== "IN_PROGRESS") {
    return res.status(409).json({
      error: `${wo.code} ยังไม่ได้อยู่ในมือช่าง — ตอนนี้อยู่ขั้น "${
        WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status
      }"`,
    });
  }
  if (
    req.auth!.role !== "ADMIN" &&
    wo.assignedToId !== null &&
    wo.assignedToId !== req.auth!.userId
  ) {
    return res.status(403).json({ error: "ใบงานนี้จ่ายให้ช่างคนอื่น" });
  }

  const requested = parsed.data.parts ?? [];

  // ชื่อรหัสอะไหล่ไว้เขียนลงประวัติ ให้อ่านย้อนหลังรู้ว่าช่างขอเบิกอะไรไว้
  const requestedCodes =
    requested.length === 0
      ? []
      : (
          await prisma.sparePart.findMany({
            where: { id: { in: requested.map((p) => p.sparePartId) } },
            select: { id: true, partCode: true },
          })
        ).map((sp) => {
          const want = requested.find((p) => p.sparePartId === sp.id);
          return want && want.quantity > 1 ? `${sp.partCode} x${want.quantity}` : sp.partCode;
        });

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: {
        status: "NEW",
        // ช่างระบุของมาแล้ว = ต้องใช้อะไหล่แน่ๆ ไม่ต้องให้ตัดสินซ้ำว่าใช้หรือไม่ใช้
        // ไม่ได้ระบุมา ก็เปิดให้ตัดสินใหม่ทั้งหมด
        needsParts: requested.length > 0 ? true : null,
        // ช่างคนเดิมยังติดอยู่กับใบงาน หัวหน้าภาคเปลี่ยนได้ตอนจ่ายงานรอบใหม่
        scheduledAt: null,
      },
    });

    /**
     * แทนที่ของที่รออยู่ด้วยรายการที่ช่างขอ
     *
     * แทนที่ ไม่ใช่เพิ่มต่อท้าย เพราะของชุดเดิมถูกเช็คคลังไปแล้วในรอบก่อน
     * ถ้าเก็บไว้ แอดมินจะเห็นว่า "เช็คแล้ว" ทั้งที่ของที่ต้องใช้เปลี่ยนไปแล้ว
     * replaceParts สร้างแถวใหม่ ผลเช็คคลังจึงกลับเป็นยังไม่เช็คให้เอง
     */
    await replaceParts(tx, id, "WAITING", requested);

    const note =
      requestedCodes.length > 0
        ? `${parsed.data.reason} — ขอเบิกเพิ่ม: ${requestedCodes.join(", ")}`
        : parsed.data.reason;
    await writeLog(tx, id, req.auth!.userId, "PARTS_ROLLBACK", "NEW", note);
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

// ── ไฟล์แนบ ────────────────────────────────────────────
//
// รูปหน้างานคือหลักฐานว่าไปถึงจริงและเจออะไร ปัจจุบันช่างถ่ายส่งไลน์ ซึ่งหาย
// ไปกับแชทภายในสองสัปดาห์ พอมีเรื่องต้องย้อนดูก็ไม่เหลืออะไร
//
// ไฟล์จริงไปอยู่บนที่เก็บไฟล์ภายนอก ฐานข้อมูลเก็บแค่ที่อยู่กับรูปย่อ —
// เหตุผลเต็มอยู่ใน src/storage/fileStore.ts

const attachmentUploadFields = multer({
  storage: multer.memoryStorage(),
  // multer รู้จักแค่เพดานเดียว จึงตั้งไว้ที่ค่าสูงสุด (วิดีโอ) แล้วค่อยเช็ค
  // เพดานของรูปอีกทีหลังรู้ชนิดไฟล์ ไม่งั้นรูป 50 MB จะผ่านเข้ามาได้
  limits: { fileSize: MAX_ATTACHMENT_VIDEO_BYTES, files: 2 },
}).fields([
  { name: "file", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
]);

/**
 * ดักพลาดของ multer เอง
 *
 * ถ้าปล่อยให้หลุดไป error handler ของ express คนที่ส่งวิดีโอใหญ่เกินจะได้
 * หน้า HTML 500 กลับไป แอปอ่านไม่ออก ขึ้นแค่ "เกิดข้อผิดพลาด" ทั้งที่
 * สาเหตุชัดเจนและบอกเป็นภาษาคนได้
 */
function attachmentUpload(req: AuthRequest, res: Response, next: (err?: any) => void) {
  attachmentUploadFields(req as any, res, (error: any) => {
    if (!error) return next();
    if (error?.code === "LIMIT_FILE_SIZE") {
      const mb = Math.round(MAX_ATTACHMENT_VIDEO_BYTES / 1024 / 1024);
      return res.status(400).json({ error: `ไฟล์ใหญ่เกิน ${mb} MB` });
    }
    if (error?.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ error: "ส่งไฟล์มาผิดช่อง" });
    }
    console.error("attachment upload failed", error);
    return res.status(400).json({ error: "รับไฟล์ไม่สำเร็จ" });
  });
}

/**
 * ใครยุ่งกับไฟล์แนบของใบงานนี้ได้บ้าง
 *
 * ใช้กติกาเดียวกับหน้ารายการ — แอดมินทุกใบ หัวหน้าภาคเฉพาะภาคตัวเอง
 * ช่างเฉพาะงานที่ถูกจ่ายให้ตัวเอง ถ้าตรงนี้หลวมกว่าหน้ารายการ จะกลายเป็นว่า
 * ช่างเปิดรูปของใบงานที่ตัวเองมองไม่เห็นได้ด้วยการเดาเลขใบงาน
 */
async function loadAttachableWorkOrder(
  req: AuthRequest,
  res: Response,
  id: number
): Promise<{ id: number; code: string; status: string } | null> {
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
  } else if (role !== "ADMIN" && wo.assignedToId !== req.auth!.userId) {
    res.status(403).json({ error: "ใบงานนี้ไม่ได้จ่ายให้คุณ" });
    return null;
  }

  return { id: wo.id, code: wo.code, status: wo.status };
}

type AttachmentRow = {
  id: number;
  kind: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  objectKey: string | null;
  uploadedAt: Date | null;
  thumbnail: Uint8Array | Buffer | null;
  createdAt: Date;
  createdById: number | null;
  createdBy: { name: string } | null;
};

/**
 * รูปย่อส่งไปกับรายการเลย ไม่แยกเป็นอีก endpoint
 *
 * ถ้าแยก หน้าจอต้องยิงเพิ่มอีกรูปละครั้ง และรูปพวกนี้ต้องล็อกอินถึงจะดูได้
 * แต่ <Image> บนเว็บแนบ header ไม่ได้ จะต้องไปทำลิงก์ชั่วคราวให้รูปย่อด้วย
 * ทั้งที่มันแค่ไม่กี่สิบ KB — ส่งติดไปเลยจบกว่าและเปิดหน้าได้ไวกว่า
 */
function attachmentShape(a: AttachmentRow) {
  return {
    id: a.id,
    kind: a.kind,
    kindLabel: ATTACHMENT_KIND_LABELS[a.kind] ?? a.kind,
    fileName: a.fileName,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    // false = อัปขึ้นที่เก็บไม่สำเร็จ เหลือแต่รูปย่อ กดดูไฟล์เต็มไม่ได้
    available: a.objectKey !== null && a.uploadedAt !== null,
    uploadedAt: a.uploadedAt,
    createdAt: a.createdAt,
    // ส่ง id มาด้วย ไม่ใช่แค่ชื่อ เพราะในระบบนี้มีคนชื่อซ้ำกันจริง
    // ถ้าหน้าจอเทียบด้วยชื่อ ช่างสองคนที่ชื่อเหมือนกันจะลบไฟล์ของกันและกันได้
    createdById: a.createdById,
    createdByName: a.createdBy?.name ?? null,
    thumbnailDataUrl: a.thumbnail
      ? `data:image/jpeg;base64,${Buffer.from(a.thumbnail).toString("base64")}`
      : null,
  };
}

const attachmentSelect = {
  id: true,
  kind: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  objectKey: true,
  uploadedAt: true,
  thumbnail: true,
  createdAt: true,
  createdById: true,
  createdBy: { select: { name: true } },
} as const;

router.get("/:id/attachments", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });

  const wo = await loadAttachableWorkOrder(req, res, id);
  if (!wo) return;

  const rows = await prisma.workOrderAttachment.findMany({
    where: { workOrderId: id },
    select: attachmentSelect,
    orderBy: { createdAt: "asc" },
  });
  res.json({ rows: rows.map(attachmentShape) });
});

router.post("/:id/attachments", requireAuth, attachmentUpload, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });

  if (!isFileStoreConfigured()) {
    return res.status(503).json({
      error: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ ให้แจ้งผู้ดูแลระบบก่อนใช้งานส่วนนี้",
    });
  }

  const wo = await loadAttachableWorkOrder(req, res, id);
  if (!wo) return;

  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const file = files?.file?.[0];
  if (!file) return res.status(400).json({ error: "ไม่พบไฟล์ที่ส่งมา" });

  const kind = attachmentKindFor(file.mimetype);
  if (!kind) {
    return res.status(400).json({ error: `ไฟล์ชนิด ${file.mimetype} ยังแนบไม่ได้ — รับเฉพาะรูปกับวิดีโอ` });
  }

  const limit = kind === "IMAGE" ? MAX_ATTACHMENT_IMAGE_BYTES : MAX_ATTACHMENT_VIDEO_BYTES;
  if (file.size > limit) {
    const mb = Math.round(limit / 1024 / 1024);
    return res.status(400).json({
      error:
        kind === "IMAGE"
          ? `รูปใหญ่เกิน ${mb} MB`
          : `วิดีโอใหญ่เกิน ${mb} MB — ถ่ายสั้นลงหรือตัดให้เหลือเฉพาะช่วงที่เห็นอาการ`,
    });
  }

  const count = await prisma.workOrderAttachment.count({ where: { workOrderId: id } });
  if (count >= MAX_ATTACHMENTS_PER_WORK_ORDER) {
    return res
      .status(400)
      .json({ error: `ใบงานหนึ่งแนบได้ไม่เกิน ${MAX_ATTACHMENTS_PER_WORK_ORDER} ไฟล์` });
  }

  const thumb = files?.thumbnail?.[0];
  // รูปย่อใหญ่ผิดปกติ = แอปส่งรูปเต็มมาผิดช่อง ทิ้งไปดีกว่าเก็บรูป 3 MB
  // ลงฐานข้อมูลทุกครั้งที่แนบ ซึ่งเป็นสิ่งที่ตั้งใจเลี่ยงตั้งแต่แรก
  const thumbnail =
    thumb && thumb.size > 0 && thumb.size <= MAX_ATTACHMENT_THUMBNAIL_BYTES ? thumb.buffer : null;

  const objectKey = buildObjectKey(wo.code, file.originalname || `${kind.toLowerCase()}.bin`);

  /**
   * อัปไฟล์ก่อน แล้วค่อยบันทึกลงฐานข้อมูล
   *
   * ถ้าสลับลำดับ เวลาอัปไม่ผ่านจะเหลือแถวที่ชี้ไปยังไฟล์ที่ไม่มีอยู่จริง
   * ทางนี้ถ้าอัปไม่ผ่านก็ไม่มีแถวเกิดขึ้นเลย ช่างกดใหม่ได้ทันที
   * ที่แลกไปคืออาจเหลือไฟล์กำพร้าในถัง ถ้าฐานข้อมูลล้มพอดี ซึ่งถูกกว่ามาก
   */
  try {
    await uploadObject({ key: objectKey, body: file.buffer, contentType: file.mimetype });
  } catch (error: any) {
    console.error("file upload failed", error);
    return res.status(502).json({ error: "อัปไฟล์ขึ้นที่เก็บไม่สำเร็จ ลองใหม่อีกครั้ง" });
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.workOrderAttachment.create({
      data: {
        workOrderId: id,
        kind,
        fileName: file.originalname || `${kind.toLowerCase()}.bin`,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        objectKey,
        uploadedAt: new Date(),
        thumbnail,
        createdById: req.auth!.userId,
      },
      select: attachmentSelect,
    });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "ATTACHED",
      wo.status,
      `${ATTACHMENT_KIND_LABELS[kind] ?? kind}: ${row.fileName}`
    );
    return row;
  });

  res.status(201).json(attachmentShape(created));
});

/**
 * ลิงก์เปิดไฟล์เต็ม
 *
 * ไม่ได้ส่งไฟล์ผ่านเซิร์ฟเวอร์ตัวเอง เพราะวิดีโอ 50 MB ที่วิ่งผ่าน backend
 * จะกินแรมและกินเวลาของ request อื่นไปด้วย ให้ที่เก็บส่งตรงถึงเครื่องคนดูดีกว่า
 * ลิงก์หมดอายุใน 2 ชั่วโมง เท่ากับลิงก์โหลดเอกสารที่ระบบใช้อยู่
 */
router.get("/:id/attachments/:attachmentId/link", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const attachmentId = Number(req.params.attachmentId);
  if (!Number.isInteger(id) || !Number.isInteger(attachmentId)) {
    return res.status(400).json({ error: "รหัสไม่ถูกต้อง" });
  }

  const wo = await loadAttachableWorkOrder(req, res, id);
  if (!wo) return;

  const row = await prisma.workOrderAttachment.findFirst({
    where: { id: attachmentId, workOrderId: id },
    select: { objectKey: true, fileName: true, kind: true },
  });
  if (!row) return res.status(404).json({ error: "ไม่พบไฟล์นี้" });
  if (!row.objectKey) {
    return res.status(409).json({ error: "ไฟล์นี้อัปขึ้นที่เก็บไม่สำเร็จ เหลือแต่รูปย่อ" });
  }

  try {
    const url = await getDownloadUrl(row.objectKey, { fileName: row.fileName, inline: true });
    res.json({ url, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
  } catch (error: any) {
    console.error("presign failed", error);
    res.status(502).json({ error: "ขอลิงก์เปิดไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง" });
  }
});

/**
 * ลบไฟล์แนบ — คนที่อัปเองหรือแอดมินเท่านั้น
 *
 * ไม่ให้ใครก็ได้ลบ เพราะรูปหน้างานเป็นหลักฐาน และคนที่มีเหตุผลจะลบมีแค่สองแบบ
 * คือคนที่เพิ่งอัปผิดรูป กับแอดมินที่ต้องเอาของที่ไม่ควรอยู่ในระบบออก
 */
router.delete("/:id/attachments/:attachmentId", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const attachmentId = Number(req.params.attachmentId);
  if (!Number.isInteger(id) || !Number.isInteger(attachmentId)) {
    return res.status(400).json({ error: "รหัสไม่ถูกต้อง" });
  }

  const wo = await loadAttachableWorkOrder(req, res, id);
  if (!wo) return;

  const row = await prisma.workOrderAttachment.findFirst({
    where: { id: attachmentId, workOrderId: id },
    select: { id: true, objectKey: true, fileName: true, kind: true, createdById: true },
  });
  if (!row) return res.status(404).json({ error: "ไม่พบไฟล์นี้" });

  if (req.auth!.role !== "ADMIN" && row.createdById !== req.auth!.userId) {
    return res.status(403).json({ error: "ลบได้เฉพาะไฟล์ที่ตัวเองแนบไว้" });
  }

  // ลบแถวก่อน แล้วค่อยลบไฟล์ — ถ้าลบไฟล์บนที่เก็บไม่ผ่านแล้วหยุดไว้แค่นั้น
  // คนกดจะเห็นว่าไฟล์ยังอยู่ทั้งที่ตั้งใจลบ ส่วนไฟล์ที่ค้างในถัง ไม่มีใครเปิดถึง
  // เพราะไม่มีแถวชี้ไปหาแล้ว และจะถูกเก็บกวาดตอนล้างไฟล์เก่าอยู่ดี
  await prisma.$transaction(async (tx) => {
    await tx.workOrderAttachment.delete({ where: { id: row.id } });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "ATTACHMENT_REMOVED",
      wo.status,
      `${ATTACHMENT_KIND_LABELS[row.kind] ?? row.kind}: ${row.fileName}`
    );
  });

  if (row.objectKey) {
    try {
      await deleteObject(row.objectKey);
    } catch (error: any) {
      console.error("file delete failed", error);
    }
  }

  res.json({ ok: true });
});

export default router;
