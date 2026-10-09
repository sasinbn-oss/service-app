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
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { coversWorkOrder, OUT_OF_SCOPE, supervisorScope, workOrderInScope } from "../utils/supervisorScope";
import { Coverage, coverageOf, covers } from "../utils/teamGroups";
import { workOrderTimeline } from "../utils/timeline";
import { requireAuth, requireAdmin, requireSuperAdmin, AuthRequest } from "../middleware/auth";
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
  ATTACHMENT_ROLES,
  ATTACHMENT_ROLE_LABELS,
  attachmentKindFor,
  MAX_ATTACHMENTS_PER_WORK_ORDER,
  MAX_ATTACHMENT_IMAGE_BYTES,
  MAX_ATTACHMENT_THUMBNAIL_BYTES,
  MAX_ATTACHMENT_VIDEO_BYTES,
  JOB_TYPES,
  MACHINE_MODELS,
  MACHINE_CAPACITIES_KG,
  MACHINE_CAPACITY_MAX_KG,
  MACHINE_CAPACITY_MIN_KG,
  formatCapacity,
  JOB_TYPE_HINTS,
  JOB_TYPE_LABELS,
  ROLE_LABELS,
  WORK_ORDER_STAGE_ACTOR,
  WORK_ORDER_STAGE_ORDER,
  bangkokDay,
  canActOnStage,
  WORK_STATUSES,
  WORK_STATUS_LABELS,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_PRIORITY_LABELS,
  RETIRED_WORK_ORDER_RESULTS,
  WORK_ORDER_RESULTS,
  WORK_ORDER_RESULT_LABELS,
  WORK_ORDER_STATUSES,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_ACTION_LABELS,
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  isCompanyBranch,
  isValidMachineCode,
  isWarrantyExpired,
  warrantyEndFor,
  machineTypeFromCode,
  normaliseMachineCode,
  workOrderCode,
  needsCustomerQuote,
  workStatusForStage,
} from "../utils/constants";

const router = Router();

const detailInclude = {
  branch: {
    select: {
      code: true,
      name: true,
      region: true,
      zone: true,
      pmTeam: true,
      ownership: true,
      openedAt: true,
      warrantyExpiresAt: true,
    },
  },
  machine: { select: { code: true, type: true, brand: true, model: true, capacityKg: true } },
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
  //
  _count: { select: { attachments: true } },
  // แถวเดียวพอต่อชนิด หน้าปิดงานแค่อยากรู้ว่ามีอะไรแนบไว้แล้วบ้าง
  // ไม่ได้จะเอารายการมาแสดง — รายการอยู่ที่ /attachments อยู่แล้ว
  attachments: {
    where: { role: { not: null } },
    select: { id: true, role: true, createdAt: true },
  },
  workers: { include: { user: { select: { id: true, name: true, employeeCode: true } } } },
  // ใบงานที่ลิงก์กัน (แยกใบรออะไหล่) — ต้องเห็นจากทั้งสองฝั่ง
  parent: { select: { id: true, code: true, status: true } },
  children: { select: { id: true, code: true, status: true }, orderBy: { id: "asc" } },
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

/**
 * จำรุ่นกับขนาดไว้ที่ตัวเครื่อง ไม่ใช่ที่ใบงาน
 *
 * ทั้งสองเป็นของตัวเครื่อง ไม่ได้เปลี่ยนไปตามงาน — เครื่อง W5 ที่เป็น Huebsch
 * ขนาด 13 kg วันนี้ ก็ยังเป็นตัวเดิมขนาดเดิมในใบงานถัดไป ถามซ้ำทุกใบคือ
 * การขอให้คนกรอกของเดิมอีกรอบแล้วเสี่ยงได้คำตอบที่ไม่ตรงกับครั้งก่อน
 *
 * เขียนเฉพาะที่มีค่ามาและค่าเปลี่ยนจริง — ไม่ส่งมาคือ "ไม่รู้" ไม่ใช่ "ไม่มี"
 * จึงไม่ล้างของเดิมทิ้ง คนที่เปิดใบงานจากกระดานไม่เห็นช่องพวกนี้ทุกใบ
 * ถ้าถือว่าไม่ส่งมาแปลว่าว่าง รุ่นที่เคยกรอกไว้จะหายไปเพราะใบงานที่ไม่เกี่ยวกัน
 */
async function rememberMachineSpec(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  machine: { id: number; model: string | null; capacityKg: number | null },
  entry: { model?: string | null; capacityKg?: number | null }
) {
  const data: { model?: string; capacityKg?: number } = {};
  const model = entry.model?.trim() || null;
  if (model && model !== machine.model) data.model = model;
  if (
    typeof entry.capacityKg === "number" &&
    entry.capacityKg !== machine.capacityKg
  ) {
    data.capacityKg = entry.capacityKg;
  }
  if (Object.keys(data).length === 0) return;
  await tx.machine.update({ where: { id: machine.id }, data });
}

type WorkOrderRow = Awaited<
  ReturnType<typeof prisma.workOrder.findFirstOrThrow<{ include: typeof detailInclude }>>
>;

/** สรุปว่าใบที่ปิดไปแล้วทำให้เครื่องกลับมาจริงไหม ตามไฟล์รายงานรอบล่าสุด */
function closeVerdict(w: WorkOrderRow): "CLEARED" | "STILL_DOWN" | null {
  if (w.closedAt === null || !w.outage) return null;
  return w.outage.endedAt === null ? "STILL_DOWN" : "CLEARED";
}

function shape(w: WorkOrderRow, roundStart?: Date) {
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
    // คนที่สาขาให้ติดต่อเรื่องใบงานนี้ — ช่างโทรหาใครก่อนไปหน้างาน
    contactName: w.contactName,
    contactPhone: w.contactPhone,
    region: w.branch.region,
    zone: w.branch.zone,
    ownership: w.branch.ownership,
    // วันเปิดร้านกับประกัน — คนที่ดูใบงานต้องรู้ก่อนตัดสินใจว่าจะส่งช่างของเราไป
    // หรือให้ผู้ขายรับผิดชอบ
    branchOpenedAt: w.branch.openedAt,
    // สาขาบริษัทไม่มีประกัน ตัดออกตั้งแต่ตรงนี้ ไม่ปล่อยให้หน้าจอไปตัดสินใจเอง
    // ว่าจะซ่อนไหม ไม่งั้นวันหลังมีหน้าจอที่สามแล้วลืมซ่อน
    branchIsCompany: isCompanyBranch(w.branch.code),
    // วันหมดประกันคิดจากวันเปิดร้าน + 3 ปี เว้นแต่มีคนกรอกวันเฉพาะไว้
    // คิดที่เซิร์ฟเวอร์ที่เดียว หน้าจอจึงไม่ต้องรู้ว่ากฎกี่ปี
    branchWarrantyExpiresAt: isCompanyBranch(w.branch.code)
      ? null
      : warrantyEndFor(w.branch.openedAt, w.branch.warrantyExpiresAt),
    branchWarrantyExpired: isCompanyBranch(w.branch.code)
      ? null
      : isWarrantyExpired(warrantyEndFor(w.branch.openedAt, w.branch.warrantyExpiresAt)),
    machineCode: w.machine?.code ?? null,
    machineType: w.machine?.type ?? null,
    machineBrand: w.machine?.brand ?? null,
    machineModel: w.machine?.model ?? null,
    // ขนาดเครื่อง ส่งทั้งตัวเลขและข้อความพร้อมหน่วย — หน้าจอเอาไปแสดงได้เลย
    // และยังเอาตัวเลขไปเติมในฟอร์มรอบหน้าได้โดยไม่ต้องแกะหน่วยออกจากข้อความ
    machineCapacityKg: w.machine?.capacityKg ?? null,
    machineCapacityLabel: formatCapacity(w.machine?.capacityKg),
    // ทีมที่ควรรับงานใบนี้ตามไฟล์ทะเบียนสาขา
    //
    // งาน PM ไปทีมที่ดูแล PM ส่วนงานอื่นไปทีมที่ดูแล CM — คิดที่เซิร์ฟเวอร์
    // ไม่ปล่อยให้หน้าจอไปตัดสินเอง ไม่งั้นวันหลังมีหน้าจอที่สามแล้วกฎไม่ตรงกัน
    //
    // สาขาที่ไม่ได้ระบุทีม PM ใช้ทีม CM แทน ซึ่งในไฟล์จริงมีอยู่ราวหนึ่งในสาม
    // ของสาขาทั้งหมด — ทีมที่ไปงาน CM อยู่แล้วเป็นคำตอบที่ใกล้ถูกที่สุดที่ไฟล์บอกได้
    // และยังเลือกทีมอื่นได้อยู่ดี
    suggestedTeam: (w.jobType === "PM" ? w.branch.pmTeam ?? w.branch.zone : w.branch.zone) ?? null,
    branchPmTeam: w.branch.pmTeam,
    assignedTeam: w.assignedTeam,
    assignedToId: w.assignedTo?.id ?? null,
    assignedToName: w.assignedTo?.name ?? null,
    scheduledAt: w.scheduledAt,
    scheduledTime: w.scheduledTime,
    appointmentStatus: w.appointmentStatus,
    appointmentStatusLabel: w.appointmentStatus
      ? APPOINTMENT_STATUS_LABELS[w.appointmentStatus] ?? w.appointmentStatus
      : null,
    // ผลตรวจหน้างาน — คนระบุอะไหล่รอบถัดไปอ่านจากตรงนี้
    inspectedAt: w.inspectedAt,
    inspectionNote: w.inspectionNote,
    parent: w.parent
      ? { ...w.parent, statusLabel: WORK_ORDER_STATUS_LABELS[w.parent.status] ?? w.parent.status }
      : null,
    children: w.children.map((c) => ({
      ...c,
      statusLabel: WORK_ORDER_STATUS_LABELS[c.status] ?? c.status,
    })),
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
    outageEndedAt: w.outage?.endedAt ?? null,
    /**
     * ปิดงานแล้วอาการหายจริงไหม — เทียบกับไฟล์รายงานเครื่อง
     *
     * ปิดใบงานคือ "คนไปทำแล้ว" ส่วนเคสปิดคือ "เครื่องกลับมาแล้ว" ซึ่งไม่ใช่
     * เรื่องเดียวกัน ช่างเปลี่ยนอะไหล่แล้วเครื่องยังไม่กลับมาก็มี และต้องเห็น
     * ว่าเป็นแบบนั้น ไม่ใช่กลบด้วยการถือว่าปิดงานแล้วจบ
     *
     * null = เทียบไม่ได้ (ใบที่เปิดเองไม่ได้ผูกกับเคส หรือยังไม่ปิดงาน)
     */
    outcomeVerdict: closeVerdict(w),
    // อะไหล่ที่รออยู่ กับอะไหล่ที่ใช้ไปจริง เป็นคนละชุด
    waitingParts: w.parts.filter((p) => p.kind === "WAITING").map(partShape),
    parts: w.parts.filter((p) => p.kind !== "WAITING").map(partShape),
    attachmentCount: w._count.attachments,
    /**
     * หน้าปิดงานต้องรู้ล่วงหน้าว่าขาดอะไรอยู่ ไม่ใช่ไปรู้ตอนกดบันทึกแล้วโดนปฏิเสธ
     *
     * รูปหน้างานคือไฟล์ที่ไม่มี role — ใบเหลืองกับป้ายรุ่นเป็นเอกสารและข้อมูล
     * ของเครื่อง ไม่ใช่ภาพของงานที่ทำ จึงนับแยกกัน
     */
    // "ของรอบนี้" ไม่ใช่ "เคยแนบไหม" — รอบใหม่ต้องมีใบเบิกใบใหม่ของตัวเอง
    hasRequisitionSlip: w.attachments.some(
      (a) => a.role === "REQUISITION" && (!roundStart || a.createdAt >= roundStart)
    ),
    /**
     * รอบปัจจุบันเริ่มเมื่อไหร่ — หน้าจอใช้แยกว่าไฟล์ไหนเป็นของรอบที่ปิดงาน
     *
     * ใบงานหนึ่งใบเข้าหน้างานได้หลายรอบ กองไฟล์ทั้งใบจึงมีของหลายรอบปนกัน
     * การ์ดผลการทำงานต้องโชว์เฉพาะของรอบที่ปิดจริง ไม่ใช่ทุกรูปตั้งแต่เปิดใบ
     */
    roundStartedAt: roundStart ?? null,
    // เอกสารขั้นเสนอราคา — ไม่ผูกกับรอบ เพราะใบเสนอราคาและบิลออกครั้งเดียวต่อใบงาน
    hasQuote: w.attachments.some((a) => a.role === "QUOTE"),
    hasReceipt: w.attachments.some((a) => a.role === "RECEIPT"),
    needsQuote: needsCustomerQuote({
      branchCode: w.branch.code,
      needsParts: w.needsParts,
      openedAt: w.branch.openedAt,
      warrantyExpiresAt: w.branch.warrantyExpiresAt,
    }),
    hasNameplate: w.attachments.some(
      (a) => a.role === "NAMEPLATE" && (!roundStart || a.createdAt >= roundStart)
    ),
    siteFileCount: w._count.attachments - w.attachments.length,
    // คนที่เข้าไปทำจริง บันทึกตอนปิดงาน
    workers: w.workers.map((x) => ({
      id: x.user.id,
      name: x.user.name,
      employeeCode: x.user.employeeCode,
    })),
    otherWorkers: w.closeOtherWorkers,
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
  scheduledTime: true,
  parentId: true,
  createdAt: true,
  closedAt: true,
  closeResult: true,
  branch: { select: { code: true, name: true } },
  machine: { select: { code: true } },
  assignedTeam: true,
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
    assignedTeam: w.assignedTeam,
    // ใบเก่าที่จ่ายรายคนก่อนเปลี่ยนมาจ่ายเป็นทีม ยังต้องบอกได้ว่าอยู่ในมือใคร
    assignedToName: w.assignedTo?.name ?? null,
    scheduledAt: w.scheduledAt,
    scheduledTime: w.scheduledTime,
    // ใบรออะไหล่ที่แยกมาจากใบอื่น — รายการขึ้นป้ายให้รู้ว่าเป็นงานต่อเนื่อง
    isFollowUp: w.parentId !== null,
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
  requisitionNo?: string | null;
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
    requisitionNo: p.requisitionNo ?? null,
  };
}

/**
 * ขอบเขตที่ช่างคนหนึ่งเห็น — งานของทีมตัวเอง บวกงานเก่าที่จ่ายให้ตัวเอง
 *
 * ช่างที่ยังไม่ได้จัดทีมจะเหลือแค่เงื่อนไขหลัง ซึ่งเป็นพฤติกรรมเดิมพอดี
 * แอดมินจึงทยอยจัดทีมให้ทีละคนได้โดยไม่มีใครมองไม่เห็นงานตัวเองระหว่างทาง
 */
async function teamScope(team: string | null, userId: number): Promise<Prisma.WorkOrderWhereInput> {
  const mine: Prisma.WorkOrderWhereInput[] = [{ assignedToId: userId }];
  // ทีมรวม (utils/teamGroups.ts) = เห็นงานของทุกทีมที่ครอบคลุม
  const c = await coverageOf(team);
  if (!c) return { OR: mine };
  return { OR: [...mine, c.all ? { assignedTeam: { not: null } } : { assignedTeam: { in: c.teams } }] };
}

/**
 * กันไม่ให้ช่างทีมอื่นมาแตะใบงานที่ไม่ใช่ของทีมตัวเอง
 *
 * คืน true เมื่อ "ห้าม" เพื่อให้จุดเรียกเขียนเป็น if (await blockedForTeam(...)) return;
 * แทนเงื่อนไขเดิมที่เทียบ assignedToId ตรง ๆ ได้ทันที
 */
async function blockedForTeam(
  req: AuthRequest,
  res: Response,
  wo: { assignedTeam: string | null; assignedToId: number | null }
) {
  if (req.auth!.role === "ADMIN") return false;
  // ยังไม่ได้จ่ายให้ใครเลย — ปล่อยผ่านเหมือนเดิม ขั้นตอนอื่นกันไว้อยู่แล้ว
  if (wo.assignedTeam === null && wo.assignedToId === null) return false;
  const me = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: { team: true },
  });
  if (canTouch(wo, { coverage: await coverageOf(me?.team ?? null), id: req.auth!.userId })) return false;
  res.status(403).json({
    error: wo.assignedTeam
      ? `ใบงานนี้จ่ายให้ ${wo.assignedTeam} ไม่ใช่ทีมของคุณ`
      : "ใบงานนี้จ่ายให้ช่างคนอื่น",
  });
  return true;
}

/** ช่างคนนี้แตะใบงานนี้ได้ไหม — ทีมของตัวเอง (หรือทีมที่ทีมรวมครอบคลุม) หรืองานเก่าที่จ่ายให้ตัวเอง */
function canTouch(
  wo: { assignedTeam: string | null; assignedToId: number | null },
  me: { coverage: Coverage | null; id: number }
) {
  if (wo.assignedToId !== null && wo.assignedToId === me.id) return true;
  return covers(me.coverage, wo.assignedTeam);
}

/**
 * รอบปัจจุบันของใบงานเริ่มเมื่อไหร่
 *
 * ใบงานหนึ่งใบเข้าหน้างานได้หลายรอบ — ช่างไปแล้วส่งกลับให้ประเมินอะไหล่ใหม่
 * แล้ววนมาใหม่ รอบใหม่คือตั้งแต่ถูกจ่ายให้ทีมครั้งล่าสุด ใช้แยกว่าเอกสาร
 * และรูปของรอบไหนเป็นของรอบไหน
 *
 * ไม่มีประวัติการจ่ายงานเลย (ใบเก่ามาก) ก็นับจากวันเปิดใบงาน
 */
async function roundStartedAt(workOrderId: number): Promise<Date> {
  const last = await prisma.workOrderLog.findFirst({
    where: { workOrderId, action: { in: ["ASSIGNED", "REOPENED"] } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (last) return last.createdAt;
  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: { createdAt: true },
  });
  return wo?.createdAt ?? new Date(0);
}

/**
 * เพดานเวลาของ transaction ที่เดินสายงานใบงาน
 *
 * Prisma ตั้งไว้ 5 วินาที ซึ่งพอสำหรับฐานข้อมูลที่อยู่เครื่องเดียวกัน แต่ของจริง
 * อยู่คนละ region — ทุกคำสั่งคือการเดินทางไปกลับจริง ๆ และใบงานที่เปิดจากกระดาน
 * ต้องคัดลอกค่าไปที่เคสด้วย ทำให้รอบไปกลับเพิ่มจาก 4 เป็น 9 รอบ
 *
 * ไปกลับรอบละ 600 ms ก็ชนเพดานแล้ว และ transaction ที่ชนเพดานคือ error ที่
 * ผู้ใช้เห็นเป็น "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" ทั้งที่เซิร์ฟเวอร์ยังอยู่ดี
 *
 * 30 วินาทีไม่ได้แปลว่ายอมให้ช้าได้ขนาดนั้น แต่แปลว่าเน็ตสะดุดชั่วคราว
 * ไม่ควรกลายเป็นงานที่บันทึกไม่ได้ — ตัวเลขนี้ตรงกับที่ขั้นเปิดใบงานใช้อยู่แล้ว
 */
const STAGE_TX = { timeout: 30_000, maxWait: 15_000 } as const;

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

/**
 * ขั้นที่รอบทบาทนี้อยู่ — หัวใจของกล่องงาน
 *
 * ใบงานเดินตามสายงานทีละขั้น และแต่ละขั้นมีเจ้าของขั้นชัดเจนอยู่แล้ว
 * (WORK_ORDER_STAGE_ACTOR) กล่องงานจึงไม่ต้องเก็บข้อมูลใหม่อะไรเลย —
 * มันคือคำถามเดียวกันกับ "ตอนนี้ลูกบอลอยู่ที่ใคร" ที่ระบบตอบได้อยู่แล้ว
 *
 * ทำเป็นตารางแยกว่า "ใบนี้อยู่ในกล่องของใคร" จะกลายเป็นความจริงชุดที่สอง
 * ที่ต้องคอยให้ตรงกับสถานะใบงาน แล้ววันหนึ่งจะไม่ตรง — กล่องมีใบที่ทำไปแล้ว
 * หรือใบที่ถึงคิวแต่ไม่โผล่ ซึ่งแย่กว่าไม่มีกล่องงานเลย
 */
function stagesWaitingOn(role: string): string[] {
  return WORK_ORDER_STAGE_ORDER.filter((stage) => WORK_ORDER_STAGE_ACTOR[stage] === role);
}

const listQuery = z.object({
  status: z.enum([...WORK_ORDER_STATUSES, "ACTIVE", "ALL", "INBOX"]).default("ACTIVE"),
  assignedTo: z.string().optional(),
  branchCode: z.string().optional(),
  search: z.string().optional(),
});

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const q = parsed.data;
  const keyword = q.search?.trim();

  const inboxStages = stagesWaitingOn(req.auth!.role);
  const statusFilter =
    q.status === "ALL"
      ? {}
      : q.status === "ACTIVE"
        ? { status: { in: [...ACTIVE_WORK_ORDER_STATUSES] } }
        : q.status === "INBOX"
          ? { status: { in: inboxStages } }
          : { status: q.status };

  /**
   * เห็นเท่าที่เกี่ยวข้องกับตัวเอง
   *
   * หัวหน้าภาคเห็นเฉพาะภาค/ทีมที่ดูแล ช่างเห็นเฉพาะงานที่ถูกจ่ายให้ตัวเองกับงานที่ยังไม่มีเจ้าของ
   * แอดมินเห็นทุกใบ รายการที่ยาวเป็นร้อยใบโดยไม่มีอะไรเกี่ยวกับคนอ่านคือรายการที่ไม่มีใครเปิด
   *
   * ขอบเขตใส่ใน AND — เดิมกระจายลงไปตรง ๆ แล้วชนกับตัวกรองสาขา (คีย์ branch) และ
   * คำค้น (คีย์ OR) ค้นหาหรือกรองสาขาเมื่อไหร่ ขอบเขตหายไปเลย เห็นใบงานทั้งระบบ
   */
  const me = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: { team: true },
  });
  const scope: Prisma.WorkOrderWhereInput =
    req.auth!.role === "ADMIN"
      ? {}
      : req.auth!.role === "SUPERVISOR"
        ? workOrderInScope(await supervisorScope(req.auth!.userId))
        : // ช่างเห็นงานของทีมตัวเอง เพราะงานถูกจ่ายให้ทีม ไม่ได้จ่ายรายคน
          //
          // รวมงานที่เคยจ่ายให้ตัวเองแบบรายคนด้วย — ใบที่ค้างอยู่ตอนเปลี่ยนมา
          // จ่ายเป็นทีม ต้องไม่หายไปจากรายการของคนที่กำลังทำอยู่
          // ช่างที่ยังไม่ได้จัดทีมจึงยังเห็นงานเดิมของตัวเองตามปกติ
          await teamScope(me?.team ?? null, req.auth!.userId);

  const rows = await prisma.workOrder.findMany({
    where: {
      AND: [scope],
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

  /**
   * ตัวเลขบนชิปต้องนับเฉพาะที่คนคนนี้เห็น
   *
   * เดิมนับทั้งระบบโดยไม่สนขอบเขต หัวหน้าภาคจึงเห็นเลขที่รวมใบงานของภาคอื่น
   * แล้วกดเข้าไปเจอรายการสั้นกว่าเลขบนชิป ซึ่งทำให้คนเลิกเชื่อตัวเลขทั้งหน้า
   */
  const counts = await prisma.workOrder.groupBy({
    by: ["status"],
    where: scope,
    _count: true,
  });
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<
    string,
    number
  >;

  res.json({
    rows: rows.map(listShape),
    counts: {
      ...byStatus,
      ACTIVE: ACTIVE_WORK_ORDER_STATUSES.reduce((n, st) => n + (byStatus[st] ?? 0), 0),
      INBOX: inboxStages.reduce((n, st) => n + (byStatus[st] ?? 0), 0),
    },
  });
});

/**
 * จำนวนใบงานในกล่องของคนที่ถามมา — สำหรับตัวเลขบนเมนูหน้าแรก
 *
 * แยกจาก /work-orders เพราะหน้าแรกอยากได้แค่ตัวเลข ไม่ได้อยากได้รายการ
 * ดึงทั้งรายการมาเพื่อนับคือการโหลดข้อมูลเป็นร้อยใบทิ้งทุกครั้งที่เปิดแอป
 */
router.get("/inbox-count", requireAuth, async (req: AuthRequest, res) => {
  const me = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: { team: true },
  });
  const scope: Prisma.WorkOrderWhereInput =
    req.auth!.role === "ADMIN"
      ? {}
      : req.auth!.role === "SUPERVISOR"
        ? workOrderInScope(await supervisorScope(req.auth!.userId))
        : await teamScope(me?.team ?? null, req.auth!.userId);

  const inbox = await prisma.workOrder.count({
    where: { AND: [scope], status: { in: stagesWaitingOn(req.auth!.role) } },
  });
  res.json({ inbox });
});

/** ตัวเลือกที่หน้าจอต้องใช้ — สถานะ ความเร่งด่วน ผลงาน และรายชื่อช่าง */
router.get("/options", requireAuth, async (_req, res) => {
  // เฉพาะช่าง — จ่ายงานให้แอดมินหรือหัวหน้าภาคไม่ใช่สิ่งที่สายงานนี้ทำ
  // และรายชื่อที่มีทุกคนปนอยู่ทำให้กดผิดคนได้ง่าย
  const technicians = await prisma.user.findMany({
    where: { role: "EMPLOYEE", deletedAt: null },
    select: { id: true, name: true, employeeCode: true, team: true },
    orderBy: { name: "asc" },
  });
  // ทีมมาจากสองคอลัมน์ (ผู้ดูแล CM / ผู้ดูแล PM) บางทีมรับเฉพาะงาน CM
  // จึงโผล่แค่คอลัมน์เดียว เอาแค่คอลัมน์เดียวจะมีทีมหายไปจากรายการเลือก
  const [cmTeams, pmTeams] = await Promise.all([
    prisma.branch.groupBy({
      by: ["zone"],
      where: { zone: { not: null }, cancelledAt: null },
      _count: true,
    }),
    prisma.branch.groupBy({
      by: ["pmTeam"],
      where: { pmTeam: { not: null }, cancelledAt: null },
      _count: true,
    }),
  ]);
  const teamTally = new Map<string, number>();
  for (const r of cmTeams) {
    const k = r.zone?.trim();
    if (k) teamTally.set(k, Math.max(teamTally.get(k) ?? 0, r._count));
  }
  for (const r of pmTeams) {
    const k = r.pmTeam?.trim();
    if (k) teamTally.set(k, Math.max(teamTally.get(k) ?? 0, r._count));
  }
  const teams = [...teamTally.entries()].sort((a, b) => a[0].localeCompare(b[0], "th"));
  res.json({
    statuses: WORK_ORDER_STATUSES.map((v) => ({ value: v, label: WORK_ORDER_STATUS_LABELS[v] })),
    priorities: WORK_ORDER_PRIORITIES.map((v) => ({
      value: v,
      label: WORK_ORDER_PRIORITY_LABELS[v],
    })),
    results: WORK_ORDER_RESULTS.map((v) => ({ value: v, label: WORK_ORDER_RESULT_LABELS[v] })),
    appointmentStatuses: APPOINTMENT_STATUSES.map((v) => ({
      value: v,
      label: APPOINTMENT_STATUS_LABELS[v],
    })),
    // สถานะการดำเนินการของเคส ชุดเดียวกับที่กระดานเคยใช้
    workStatuses: WORK_STATUSES.map((v) => ({ value: v, label: WORK_STATUS_LABELS[v] })),
    warehouses: WAREHOUSES,
    jobTypes: JOB_TYPES.map((v) => ({
      value: v,
      label: JOB_TYPE_LABELS[v],
      hint: JOB_TYPE_HINTS[v],
    })),
    // ทีมช่างมาจากทะเบียนสาขา (Branch.zone = คอลัมน์ "ทีมช่าง" ในไฟล์)
    // ส่งมาที่เดียวกับตัวเลือกอื่น หน้าจอจะได้ไม่ต้องยิงเพิ่มอีกรอบตอนเปิดฟอร์ม
    teams: teams.map(([name, branches]) => ({ name, branches })),
    // รุ่นเครื่องส่งมาจากที่นี่ที่เดียว เพิ่มรุ่นใหม่แล้วแอปเห็นทันทีโดยไม่ต้อง
    // ปล่อยเวอร์ชันใหม่ — ถ้าฝังไว้ในแอป เครื่องที่ยังไม่อัปเดตจะเลือกรุ่นใหม่ไม่ได้
    machineModels: MACHINE_MODELS,
    // ขนาดเครื่องเป็นตัวเลือกให้กด แต่พิมพ์เลขอื่นได้ ส่งขอบเขตที่รับไปด้วย
    // หน้าจอจะได้เตือนก่อนส่ง ไม่ใช่ให้กรอกเสร็จแล้วค่อยโดนเซิร์ฟเวอร์ปฏิเสธ
    machineCapacities: MACHINE_CAPACITIES_KG,
    machineCapacityRange: { min: MACHINE_CAPACITY_MIN_KG, max: MACHINE_CAPACITY_MAX_KG },
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

  // รอบปัจจุบันเริ่มตั้งแต่ถูกจ่ายให้ทีมครั้งล่าสุด — อ่านจากประวัติที่ดึงมาแล้ว
  // ไม่ต้องยิงถามฐานข้อมูลซ้ำ (logs เรียงใหม่ก่อนเก่าอยู่แล้ว)
  const roundStart =
    logs.find((l) => l.action === "ASSIGNED" || l.action === "REOPENED")?.createdAt ??
    row.createdAt;

  res.json({
    ...shape(row, roundStart),
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
  // คนที่สาขาให้ติดต่อเรื่องใบงานนี้ — ช่างโทรหาใครก่อนไปหน้างาน
  contactName: z.string().trim().max(120).nullable().optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),

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
        // ขนาดเป็นกิโลกรัม เก็บที่ตัวเครื่องเหมือนรุ่น ไม่ใช่ที่ใบงาน
        capacityKg: z
          .number()
          .int()
          .min(MACHINE_CAPACITY_MIN_KG)
          .max(MACHINE_CAPACITY_MAX_KG)
          .nullable()
          .optional(),
        symptom: z.string().trim().max(500).nullable().optional(),
      })
    )
    .min(1)
    .max(20)
    .optional(),
  /**
   * ไม่ได้ให้พิมพ์หัวข้องานเองแล้ว — ตั้งจากประเภทงานให้
   *
   * ช่องพิมพ์อิสระทำให้ได้ "เครื่องเสีย" "เสีย" "ไปดูหน่อย" ปนกันเป็นร้อยแบบ
   * โดยที่ไม่มีใครได้อะไรเพิ่มจากมัน — คำอธิบายจริงอยู่ที่อาการของแต่ละเครื่อง
   * ซึ่งผูกกับเครื่องถูกตัวกว่า
   *
   * ยังรับค่าเข้ามา เพราะประเภท "อื่นๆ" ต้องให้คนระบุเอง
   */
  title: z.string().trim().max(200).optional(),
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
 * หัวข้อใบงานมาจากประเภทงาน ไม่ได้มาจากช่องพิมพ์
 *
 * "อื่นๆ" เป็นข้อยกเว้นเดียวที่ต้องให้คนระบุเอง เพราะชื่อประเภทว่า "อื่นๆ"
 * ไม่ได้บอกอะไรกับคนที่มาอ่านใบงานทีหลังเลย
 *
 * คืน null เมื่อเลือกอื่นๆ แต่ไม่ได้ระบุอะไรมา ให้ผู้เรียกตอบ 400
 */
function titleFor(jobType: string, typed: string | undefined): string | null {
  const given = typed?.trim();
  if (jobType === "OTHER") return given || null;
  return given || JOB_TYPE_LABELS[jobType] || jobType;
}

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
    contactName?: string | null;
    contactPhone?: string | null;
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
    [{ code: body.machineCode, model: null, capacityKg: null, symptom: body.symptom }];

  // เว้นรหัสเครื่องว่าง = งานทั้งสาขา ซึ่งมีได้ใบเดียว ไม่ใช่สามใบที่ไม่รู้ว่าต่างกันตรงไหน
  const blank = wanted.filter((m) => !m.code?.trim());
  if (blank.length > 0 && wanted.length > 1) {
    return res.status(400).json({ error: "ถ้าไม่ระบุเครื่อง จะเปิดได้ใบเดียวเท่านั้น" });
  }

  const codes = wanted
    .map((m) => (m.code?.trim() ? normaliseMachineCode(m.code) : null))
    .filter((c): c is string => !!c);

  const badCode = codes.find((c) => !isValidMachineCode(c));
  if (badCode) {
    return res.status(400).json({
      error: `หมายเลขเครื่อง "${badCode}" ไม่ถูกรูปแบบ — ต้องเป็น W หรือ D ตามด้วยตัวเลข เช่น W3 หรือ D12`,
    });
  }
  const duplicate = codes.find((c, i) => codes.indexOf(c) !== i);
  if (duplicate) {
    return res.status(400).json({ error: `เครื่อง ${duplicate} ถูกใส่ซ้ำ` });
  }

  const title = titleFor(body.jobType, body.title);
  if (!title) {
    return res.status(400).json({ error: "เลือกประเภทงาน \"อื่นๆ\" แล้วต้องระบุรายละเอียดด้วย" });
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
    select: { id: true, code: true, model: true, capacityKg: true, removedAt: true },
  });
  const machines = new Map(found.map((m) => [m.code, m]));

  for (const code of codes) {
    const machine = machines.get(code);
    if (machine?.removedAt) {
      return res.status(400).json({ error: `เครื่อง ${code} ถูกถอดออกไปแล้ว` });
    }
  }

  /**
   * เครื่องที่ยังไม่มีในระบบ ให้สร้างขึ้นมาเลย ไม่ใช่ปฏิเสธ
   *
   * เครื่องในระบบมาจากไฟล์รายงานซึ่งมีเฉพาะเครื่องที่เคยดับ เครื่องที่ยังไม่เคย
   * มีปัญหาจึงไม่เคยถูกบันทึกไว้ — การบอกช่างว่า "ไม่พบเครื่อง W5" ทั้งที่ยืนอยู่
   * หน้าเครื่องนั้นคือการให้เขาเถียงกับระบบเรื่องสิ่งที่เขาเห็นอยู่กับตา
   *
   * ตัวอักษรหน้าของรหัสบอกชนิดเครื่องอยู่แล้ว (W ซัก · D อบ) จึงสร้างได้ครบ
   * โดยไม่ต้องถามเพิ่ม
   */
  const missing = codes.filter((c) => !machines.has(c));
  if (missing.length > 0) {
    await prisma.machine.createMany({
      data: missing.map((code) => ({
        branchId: branch.id,
        code,
        type: machineTypeFromCode(code)!,
      })),
      skipDuplicates: true,
    });
    const added = await prisma.machine.findMany({
      where: { branchId: branch.id, code: { in: missing } },
      select: { id: true, code: true, model: true, capacityKg: true, removedAt: true },
    });
    for (const m of added) machines.set(m.code, m);
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
        const code = entry.code?.trim() ? normaliseMachineCode(entry.code) : undefined;
        const machine = code ? machines.get(code)! : null;

        // รุ่นกับขนาดเก็บที่ตัวเครื่อง ไม่ใช่ที่ใบงาน — กรอกครั้งนี้แล้วครั้งหน้าขึ้นให้เอง
        if (machine) await rememberMachineSpec(tx, machine, entry);

        ids.push(
          await createWorkOrder(
            tx,
            {
              branchId: branch.id,
              machineId: machine?.id ?? null,
              outageId: null,
              source: "MANUAL",
              jobType: body.jobType,
              title,
              detail: body.detail?.trim() || null,
              priority: body.priority,
              assignedToId: body.assignedToId ?? null,
              scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
              symptom: entry.symptom?.trim() || null,
              workStatus: body.workStatus ?? null,
              contactName: body.contactName?.trim() || null,
              contactPhone: body.contactPhone?.trim() || null,
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
  /**
   * ผู้ติดต่อที่สาขา — ทางกระดานเคยไม่รับไว้ ทั้งที่ฟอร์มมีช่องให้กรอก
   *
   * คนกรอกเห็นช่อง พิมพ์ชื่อกับเบอร์ลงไป กดบันทึกแล้วใบงานขึ้นสำเร็จ
   * แต่ค่าที่พิมพ์หายไปเงียบ ๆ เพราะทางนี้ไม่ได้ส่งต่อ ซึ่งแย่กว่าไม่มีช่องเลย
   * — ไม่มีช่องคนยังรู้ว่าต้องไปถามที่อื่น มีช่องแล้วหายคือเข้าใจว่าบันทึกแล้ว
   */
  contactName: z.string().trim().max(120).nullable().optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  // รุ่นกับขนาดของเครื่องในเคส — เคสรู้ว่าเครื่องไหนแต่ไม่รู้ว่ารุ่นอะไรขนาดเท่าไหร่
  // คนที่ยืนอยู่หน้าเครื่องตอนเปิดใบงานคือคนที่ตอบได้ จึงรับไว้ที่นี่ด้วย
  model: z.string().trim().max(100).nullable().optional(),
  capacityKg: z
    .number()
    .int()
    .min(MACHINE_CAPACITY_MIN_KG)
    .max(MACHINE_CAPACITY_MAX_KG)
    .nullable()
    .optional(),
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
      machine: { select: { id: true, code: true, model: true, capacityKg: true } },
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

  // เลือก "อื่นๆ" จากกระดานก็ต้องระบุรายละเอียดเหมือนกัน
  const outageTitle = body.jobType === "OTHER" ? body.title?.trim() || null : null;
  if (body.jobType === "OTHER" && !outageTitle) {
    return res.status(400).json({ error: "เลือกประเภทงาน \"อื่นๆ\" แล้วต้องระบุรายละเอียดด้วย" });
  }

  const isSignalLost = outage.kind === "SIGNAL_LOST";
  const defaultTitle = isSignalLost
    ? `สัญญาณหายทั้งสาขา ${outage.branch.code}`
    : `เครื่อง ${outage.machine?.code ?? ""} ดับ — ${outage.branch.code}`;

  const id = await prisma.$transaction(
    async (tx) => {
      // รุ่นกับขนาดที่คนกรอกตอนเปิดใบงาน จำไว้ที่ตัวเครื่องเหมือนทางเปิดเอง
      // สัญญาณหายทั้งสาขาไม่ผูกกับเครื่องตัวไหน จึงไม่มีอะไรให้จำ
      if (!isSignalLost && outage.machine) {
        await rememberMachineSpec(tx, outage.machine, body);
      }
      return createWorkOrder(
        tx,
        {
          branchId: outage.branch.id,
          // สัญญาณหายเป็นปัญหาระดับสาขา ไม่ผูกกับเครื่องใดเครื่องหนึ่ง
          machineId: isSignalLost ? null : outage.machine?.id ?? null,
          outageId,
          source: "OUTAGE",
          jobType: body.jobType,
          // ทางกระดานมีหัวข้อตั้งต้นที่บอกเครื่องกับสาขาอยู่แล้ว ซึ่งอ่านรู้เรื่องกว่า
          // ชื่อประเภทงาน จึงใช้อันนั้นเว้นแต่เลือก "อื่นๆ" ที่คนระบุเองมา
          title: body.jobType === "OTHER" ? outageTitle! : body.title?.trim() || defaultTitle,
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
          contactName: body.contactName?.trim() || null,
          contactPhone: body.contactPhone?.trim() || null,
        },
        body.waitingParts ??
          outage.parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
        req.auth!.userId
      );
    },
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
  }, STAGE_TX);

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
): Promise<{
  id: number;
  status: string;
  assignedToId: number | null;
  assignedTeam: string | null;
} | null> {
  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      assignedToId: true,
      assignedTeam: true,
      branch: { select: { region: true, zone: true, pmTeam: true } },
    },
  });
  if (!wo) {
    res.status(404).json({ error: "ไม่พบใบงานนี้" });
    return null;
  }

  const role = req.auth!.role;
  if (role === "SUPERVISOR") {
    if (!coversWorkOrder(await supervisorScope(req.auth!.userId), wo)) {
      res.status(403).json({ error: OUT_OF_SCOPE });
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

  return {
    id: wo.id,
    status: wo.status,
    assignedToId: wo.assignedToId,
    assignedTeam: wo.assignedTeam,
  };
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

  /**
   * ตัดสินตั้งแต่ตรงนี้ว่าต้องเสนอราคาก่อนไหม
   *
   * เงื่อนไขทั้งสามข้อ (สาขาแฟรนไชส์ · ใช้อะไหล่ · หมดประกัน) รู้ครบแล้วตั้งแต่
   * หัวหน้าภาคระบุอะไหล่ ไม่ต้องรอผลเช็คสต็อก — และต้องตัดสินตรงนี้ เพราะ
   * ขั้นเสนอราคาอยู่ก่อนเบิกอะไหล่แล้ว ไม่ใช่หลัง
   */
  const wo = await prisma.workOrder.findUniqueOrThrow({
    where: { id },
    select: { branch: { select: { code: true, openedAt: true, warrantyExpiresAt: true } } },
  });
  const quoteFirst =
    needsParts &&
    needsCustomerQuote({
      branchCode: wo.branch.code,
      needsParts: true,
      openedAt: wo.branch.openedAt,
      warrantyExpiresAt: wo.branch.warrantyExpiresAt,
    });

  const nextStatus = !needsParts ? "PARTS_CHECKED" : quoteFirst ? "AWAITING_QUOTE" : "PARTS_REQUESTED";

  await prisma.$transaction(async (tx) => {
    // ไม่ใช้อะไหล่ ให้ล้างรายการที่อาจค้างจากรอบก่อนออกด้วย ไม่งั้นแอดมินจะเห็นของเก่า
    await replaceParts(tx, id, "WAITING", needsParts ? parts! : []);
    await tx.workOrder.update({
      where: { id },
      data: {
        status: nextStatus,
        needsParts,
        // เลิกรออะไหล่แล้ว ถ้าเคยขึ้นสถานะนี้ไว้จากรอบก่อน
        ...(needsParts ? { workStatus: workStatusForStage(nextStatus) } : { workStatus: null }),
      },
    });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      needsParts ? "PARTS_REQUESTED" : "NO_PARTS",
      nextStatus,
      note ||
        (!needsParts
          ? "ไม่ต้องใช้อะไหล่ — ข้ามไปจัดคิวช่าง"
          : quoteFirst
          ? "อะไหล่ขายลูกค้าแฟรนไชส์ — ต้องเสนอราคาและเก็บเงินก่อนเบิกของ"
          : null)
    );
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);

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
        // เลขใบเบิกจากระบบคลัง ของที่หมดยังไม่มีใบเบิก
        requisitionNo: z.string().trim().max(60).nullable().optional(),
      })
    )
    .min(1),
  note: z.string().trim().max(500).optional(),
  /**
   * มีบางตัว หมดบางตัว — แยกตัวที่หมดไปใบงานรออะไหล่ ใบนี้ไปซ่อมด้วยของที่มี
   *
   * ไม่ส่งมา = พฤติกรรมเดิม (ค้างทั้งใบรอของครบ) เพราะบางงานเปลี่ยนครึ่งเดียว
   * ไม่มีประโยชน์ เช่น ชุดลูกปืนที่ต้องเปลี่ยนพร้อมกัน — คนเช็คคลังเป็นคนเลือก
   */
  splitOut: z.boolean().optional(),
});

router.post("/:id/parts-check", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = partsCheckSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await guardStage(req, res, id, "PARTS_REQUESTED"))) return;

  const waiting = await prisma.workOrderPart.findMany({
    where: { workOrderId: id, kind: "WAITING" },
    select: { sparePartId: true, inStock: true, requisitionNo: true, quantity: true },
  });

  /**
   * ตัวที่เบิกออกมาแล้วไม่ต้องตอบซ้ำ
   *
   * ของที่หมดทำให้ใบงานค้างอยู่ขั้นนี้รอของเข้า แอดมินจึงกลับมาหน้านี้อีกรอบ
   * ตอนของมาถึง — ตัวที่เบิกไปแล้วรอบก่อนมีเลขใบเบิกของตัวเองอยู่แล้ว
   * ถ้าบังคับให้ตอบใหม่ทุกตัว เลขใบเบิกรอบก่อนจะถูกเขียนทับด้วยเลขของรอบนี้
   * ทั้งที่เป็นคนละใบ คนละวัน แล้วตามของในคลังย้อนหลังไม่ได้
   */
  const settled = new Set(
    waiting.filter((w) => w.inStock === true && w.requisitionNo).map((w) => w.sparePartId)
  );
  const need = waiting.map((w) => w.sparePartId).filter((pid) => !settled.has(pid));
  const answered = new Set(parsed.data.results.map((r) => r.sparePartId));
  const missing = need.filter((pid) => !answered.has(pid));
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
    // ของที่เบิกออกจากคลังต้องมีเลขใบเบิกกำกับ ไม่งั้นของหายออกจากคลัง
    // โดยไม่มีเอกสารผูกไว้ แล้วตอนตรวจนับจะหาไม่เจอว่าไปไหน
    if (r.inStock && !r.requisitionNo?.trim()) {
      return res.status(400).json({ error: "ของที่มีอยู่ ต้องใส่เลขใบเบิกอะไหล่ด้วย" });
    }
  }

  /**
   * มีตัวไหนหมด = ใบงานค้างอยู่ขั้นนี้ ไม่ส่งต่อ
   *
   * ช่างไปแล้วก็ซ่อมไม่จบอยู่ดีถ้าของไม่ครบ และการส่งต่อไปขั้นจ่ายงานทั้งที่
   * ของยังไม่มา ทำให้ใบงานไปกองรอที่หัวหน้าภาคซึ่งทำอะไรไม่ได้ —
   * คนที่ต้องทำอะไรต่อคือแอดมินที่ต้องตามของ ใบงานจึงควรค้างอยู่กับแอดมิน
   *
   * พอของมาถึง แอดมินกลับมาหน้าเดิม เปลี่ยนตัวที่หมดเป็นมีของ ใส่เลขใบเบิก
   * ของรอบนั้น แล้วใบงานถึงจะเดินต่อ
   */
  const stillOut = waiting.some((w) => {
    const answer = parsed.data.results.find((r) => r.sparePartId === w.sparePartId);
    // ไม่ได้ตอบมา = ตัวที่เบิกไปแล้ว ถือว่าพร้อม
    return answer ? !answer.inStock : false;
  });
  const outIds = parsed.data.results.filter((r) => !r.inStock).map((r) => r.sparePartId);
  // แยกได้เมื่อเหลือของให้ไปซ่อมจริง ไม่งั้นใบนี้จะไปจ่ายงานทั้งที่ไม่มีอะไหล่สักตัว
  const split = Boolean(parsed.data.splitOut) && stillOut && outIds.length < waiting.length;
  const anyOut = stillOut && !split;
  const now = new Date();

  // ของครบถึงไปขั้นจ่ายงาน — เรื่องราคาและเงินจบไปก่อนถึงขั้นนี้แล้ว
  // ของไม่ครบก็ค้างอยู่ที่แอดมินรอของเข้า
  const nextStage = anyOut ? "PARTS_REQUESTED" : "PARTS_CHECKED";
  const outCodes = split
    ? await partCodesText(
        waiting.filter((w) => outIds.includes(w.sparePartId))
      )
    : "";

  await prisma.$transaction(async (tx) => {
    for (const r of parsed.data.results) {
      await tx.workOrderPart.updateMany({
        where: { workOrderId: id, kind: "WAITING", sparePartId: r.sparePartId },
        data: {
          inStock: r.inStock,
          warehouse: r.inStock ? r.warehouse ?? null : null,
          // ของที่หมดยังไม่ได้เบิก เลขใบเบิกที่ค้างจากรอบก่อนต้องถูกล้าง
          requisitionNo: r.inStock ? r.requisitionNo?.trim() || null : null,
          checkedAt: now,
          checkedById: req.auth!.userId,
        },
      });
    }
    await tx.workOrder.update({
      where: { id },
      data: {
        status: nextStage,
        // สถานะการดำเนินการมาจากขั้น ไม่ต้องรอใครมากรอกซ้ำ
        workStatus: workStatusForStage(nextStage, { anyPartOutOfStock: anyOut }),
      },
    });
    if (split) {
      // ย้ายแถวอะไหล่ไปทั้งแถว จำนวนและผล "หมด" ติดไปด้วย หัวหน้าภาคที่ดูแล
      // ใบรออะไหล่จะเห็นเลยว่ารอตัวไหนอยู่กี่ชิ้น
      const child = await createFollowUp(tx, id, req.auth!.userId, `อะไหล่หมด: ${outCodes}`);
      await tx.workOrderPart.updateMany({
        where: { workOrderId: id, kind: "WAITING", sparePartId: { in: outIds } },
        data: { workOrderId: child.id },
      });
      await writeLog(
        tx,
        id,
        req.auth!.userId,
        "SPLIT",
        nextStage,
        `แยก ${outCodes} ไป ${child.code} (รออะไหล่ หัวหน้าภาคดูแล) — ใบนี้ไปซ่อมด้วยของที่มี`
      );
    }
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "PARTS_CHECKED",
      nextStage,
      parsed.data.note ||
        (anyOut
          ? "มีอะไหล่ที่หมด — ใบงานรออยู่ที่ขั้นนี้ ของมาถึงแล้วค่อยใส่เลขใบเบิกอีกรอบ"
          : "อะไหล่ครบทุกรายการ")
    );
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

/**
 * ขั้นเสนอราคา — แอดมินส่งใบเสนอราคาให้ลูกค้าแฟรนไชส์
 *
 * ต้องแนบใบเสนอราคาจริง ไม่ใช่แค่กดว่าส่งแล้ว เพราะเอกสารนี้คือสิ่งที่ลูกค้า
 * ตอบรับ และเป็นตัวที่ต้องงัดมาดูตอนลูกค้าทักว่าราคาไม่ตรงกับที่ตกลงกันไว้
 */
const quoteSchema = z.object({
  // ที่จริงอยู่ในประกัน หรือตกลงกันแล้วว่าบริษัทออกให้ — ข้ามได้แต่ต้องบอกเหตุผล
  skip: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/quote", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = quoteSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await guardStage(req, res, id, "AWAITING_QUOTE"))) return;

  /**
   * ข้ามขั้นนี้ได้ แต่ต้องบอกว่าทำไม
   *
   * ทะเบียนสาขาส่วนใหญ่ยังไม่มีวันหมดประกัน ระบบจึงเดาว่าหมดแล้วไว้ก่อน
   * ถ้าที่จริงยังอยู่ในประกัน การบังคับให้เสนอราคาคือการล็อกใบงานไว้เฉย ๆ
   */
  if (parsed.data.skip) {
    if (!parsed.data.note) {
      return res.status(400).json({ error: "ข้ามขั้นเสนอราคาต้องบอกเหตุผลด้วย" });
    }
    await prisma.$transaction(async (tx) => {
      await tx.workOrder.update({
        where: { id },
        data: { status: "PARTS_REQUESTED", workStatus: workStatusForStage("PARTS_REQUESTED") },
      });
      await writeLog(tx, id, req.auth!.userId, "QUOTE_SKIPPED", "PARTS_REQUESTED", parsed.data.note);
      await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
    }, STAGE_TX);
    const skipped = await prisma.workOrder.findUniqueOrThrow({
      where: { id },
      include: detailInclude,
    });
    return res.json(shape(skipped));
  }

  const quote = await prisma.workOrderAttachment.count({
    where: { workOrderId: id, role: "QUOTE" },
  });
  if (quote === 0) {
    return res.status(400).json({ error: "ต้องแนบใบเสนอราคาก่อนส่งให้ลูกค้า" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: { status: "AWAITING_PAYMENT", workStatus: workStatusForStage("AWAITING_PAYMENT") },
    });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "QUOTED",
      "AWAITING_PAYMENT",
      parsed.data.note || "ส่งใบเสนอราคาให้ลูกค้าแล้ว รอลูกค้าจ่ายเงิน"
    );
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

/**
 * ขั้นรับเงิน — แอดมินแนบบิลที่ลูกค้าจ่ายแล้ว
 *
 * ต้องแนบบิลจริงด้วยเหตุผลเดียวกับใบเหลือง: เงินที่เข้ามาแล้วไม่มีเอกสารผูกไว้
 * คือเงินที่กระทบยอดไม่ได้ตอนปิดเดือน
 */
router.post("/:id/payment", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = z
    .object({ note: z.string().trim().max(500).optional() })
    .safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await guardStage(req, res, id, "AWAITING_PAYMENT"))) return;

  const paid = await prisma.workOrderAttachment.count({
    where: { workOrderId: id, role: "RECEIPT" },
  });
  if (paid === 0) {
    return res.status(400).json({ error: "ต้องแนบบิลที่ลูกค้าจ่ายแล้วก่อน" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: { status: "PARTS_REQUESTED", workStatus: workStatusForStage("PARTS_REQUESTED") },
    });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "PAID",
      "PARTS_REQUESTED",
      parsed.data.note || "ลูกค้าจ่ายเงินแล้ว — เบิกอะไหล่ออกจากคลังได้"
    );
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

/**
 * ขั้น 4 — หัวหน้าภาคจ่ายงานให้ทีมช่าง
 *
 * จ่ายให้ "ทีม" ไม่ใช่ "คน" เพราะทีมเป็นหน่วยที่รับผิดชอบสาขาจริง
 * ใครไปจริงในวันนั้นเป็นเรื่องที่รู้ตอนปิดงาน ไม่ใช่ตอนจ่ายงาน
 */
const assignSchema = z.object({
  team: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).optional(),
});

/** ไทม์ไลน์ของใบงาน — ใครทำอะไรเมื่อไร ตั้งแต่เปิดจนปิด (utils/timeline.ts) */
router.get("/:id/timeline", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const t = await workOrderTimeline(id);
  if (!t) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  res.json(t);
});

router.post("/:id/assign", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await guardStage(req, res, id, "PARTS_CHECKED"))) return;

  const team = parsed.data.team;
  // ทีมต้องเป็นทีมที่มีอยู่จริงในทะเบียนสาขา ไม่ใช่ข้อความอะไรก็ได้ —
  // ทีมที่สะกดผิดคือใบงานที่ไม่มีใครเห็น เพราะไม่มีช่างคนไหนสังกัดทีมนั้น
  const known = await prisma.branch.findFirst({
    where: { zone: team, cancelledAt: null },
    select: { id: true },
  });
  if (!known) return res.status(404).json({ error: `ไม่รู้จักทีม "${team}"` });

  // จ่ายข้ามทีมได้ แต่ต้องรู้ตัวว่าข้าม จึงบันทึกไว้ในประวัติให้ชัด
  //
  // "ทีมของสาขา" ขึ้นกับประเภทงาน — งาน PM มีทีมดูแลคนละทีมกับงาน CM
  // เทียบกับทีม CM อย่างเดียวจะหาว่าข้ามทีมทั้งที่จ่ายถูกตามไฟล์
  const wo = await prisma.workOrder.findUniqueOrThrow({
    where: { id },
    select: { jobType: true, branch: { select: { zone: true, pmTeam: true } } },
  });
  const ownTeam =
    wo.jobType === "PM" ? wo.branch.pmTeam ?? wo.branch.zone : wo.branch.zone;
  const crossTeam = ownTeam !== null && ownTeam !== team;

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      // ล้างช่างรายคนของใบเก่าทิ้ง ไม่งั้นใบที่เคยจ่ายให้คนหนึ่งแล้วจ่ายใหม่ให้อีกทีม
      // จะยังค้างอยู่ในรายการของคนเดิมทั้งที่ไม่ใช่งานเขาแล้ว
      data: {
        status: "ASSIGNED",
        assignedTeam: team,
        assignedToId: null,
        workStatus: workStatusForStage("ASSIGNED"),
      },
    });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "ASSIGNED",
      "ASSIGNED",
      parsed.data.note ||
        (crossTeam
          ? `จ่ายงานให้ ${team} (ข้ามทีม — งาน${wo.jobType} ของสาขานี้เป็นของ ${ownTeam})`
          : `จ่ายงานให้ ${team}`)
    );
  }, STAGE_TX);

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

/**
 * ขั้นนัดลูกค้า — หัวหน้าภาคโทรนัดร้าน แล้วบันทึกวันและเวลา
 *
 * นัดแล้วยังไม่ได้แปลว่าไปได้ — ร้านต้องคอนเฟิร์มก่อน ไปถึงแล้วร้านปิดหรือ
 * ไม่มีคนเปิดเครื่องให้ คือเสียวันของทั้งทีม ลูกค้ายังไม่ตอบจึงพักไว้ที่ขั้น
 * "รอลูกค้าคอนเฟิร์มนัด" ก่อน ส่วนลูกค้าที่สะดวกทุกวัน แอดมินเลือกวันให้ได้เลย
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateField = z.string().regex(DATE_PATTERN, "วันที่ต้องเป็น ปี-เดือน-วัน");
// ว่าง = นัดกันเป็นวัน ไม่ได้ระบุเวลา
const timeField = z.string().regex(TIME_PATTERN, "เวลาต้องเป็น ชั่วโมง:นาที").nullable().optional();

function dayStart(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function visitText(date: string, time: string | null | undefined) {
  return time ? `${date} เวลา ${time} น.` : date;
}

const scheduleSchema = z.object({
  scheduledAt: dateField,
  scheduledTime: timeField,
  // แอปรุ่นก่อนไม่ส่งมา — ถือว่าคอนเฟิร์มแล้ว ตรงกับที่รุ่นนั้นทำอยู่ (นัดแล้วไปขั้นช่างเข้างานเลย)
  appointment: z.enum(APPOINTMENT_STATUSES).default("CONFIRMED"),
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/schedule", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // guardStage กันไว้แล้วว่าเป็นหัวหน้าภาคของภาคนี้ (หรือแอดมิน)
  const wo = await guardStage(req, res, id, "ASSIGNED");
  if (!wo) return;

  const { scheduledAt, scheduledTime, appointment } = parsed.data;
  // ลูกค้าไม่ได้เลือกวันเอง — ต้องเป็นแอดมินที่รับผิดชอบการเลือกนั้น
  if (appointment === "ADMIN_PICKED" && req.auth!.role !== "ADMIN") {
    return res.status(403).json({ error: "เลือกวันให้ลูกค้าได้เฉพาะแอดมิน" });
  }
  const next = appointment === "PENDING" ? "AWAITING_CONFIRM" : "IN_PROGRESS";

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: {
        status: next,
        scheduledAt: dayStart(scheduledAt),
        scheduledTime: scheduledTime ?? null,
        appointmentStatus: appointment,
        workStatus: workStatusForStage(next),
      },
    });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "SCHEDULED",
      next,
      [`นัด ${visitText(scheduledAt, scheduledTime)} · ${APPOINTMENT_STATUS_LABELS[appointment]}`, parsed.data.note]
        .filter(Boolean)
        .join(" — ")
    );
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

/**
 * ลูกค้าคอนเฟิร์มนัด — ส่งต่อให้ช่างเข้างาน
 *
 * แก้วันหรือเวลาในขั้นนี้ได้เลย ลูกค้าที่โทรกลับมาบอกว่า "ได้ แต่ขอบ่ายนะ"
 * มีบ่อยกว่าลูกค้าที่ตอบรับตามนัดเป๊ะ ไม่ควรต้องย้อนขั้นเพื่อแก้เวลา
 */
const confirmSchema = z.object({
  scheduledAt: dateField.optional(),
  scheduledTime: timeField,
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/confirm-appointment", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = confirmSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await guardStage(req, res, id, "AWAITING_CONFIRM"))) return;

  const { scheduledAt, scheduledTime } = parsed.data;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.workOrder.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        appointmentStatus: "CONFIRMED",
        ...(scheduledAt ? { scheduledAt: dayStart(scheduledAt) } : {}),
        ...(scheduledTime !== undefined ? { scheduledTime } : {}),
        workStatus: workStatusForStage("IN_PROGRESS"),
      },
      select: { scheduledAt: true, scheduledTime: true },
    });
    const when = updated.scheduledAt
      ? visitText(updated.scheduledAt.toISOString().slice(0, 10), updated.scheduledTime)
      : "—";
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "CONFIRMED",
      "IN_PROGRESS",
      [`ลูกค้าคอนเฟิร์ม ${when}`, parsed.data.note].filter(Boolean).join(" — ")
    );
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

/**
 * ทีมนี้มีอยู่จริงไหม — ทีมที่สะกดผิดคือใบงานที่ไม่มีใครเห็น
 * นับทั้งทีม CM และทีม PM เหมือนรายการทีมที่ /options ส่งไปให้เลือก
 */
async function teamExists(team: string) {
  const found = await prisma.branch.findFirst({
    where: { cancelledAt: null, OR: [{ zone: team }, { pmTeam: team }] },
    select: { id: true },
  });
  return found !== null;
}

/**
 * ตรวจหน้างานก่อน — ตัวเลือกที่สามของขั้นระบุอะไหล่
 *
 * หัวหน้าภาคบางครั้งตอบไม่ได้ว่าใช้อะไหล่ไหม จนกว่าจะมีคนไปดู เดิมต้องตอบ
 * "ไม่ใช้อะไหล่" ไปก่อนแล้วให้ช่างส่งกลับ ซึ่งทำให้ประวัติบอกว่าตัดสินแล้ว
 * ทั้งที่ยังไม่รู้ ขั้นนี้บอกตรง ๆ ว่ายังไม่รู้ และส่งทีมไปดู
 */
const inspectRequestSchema = z.object({
  team: z.string().trim().min(1).max(120),
  // วันไปตรวจ ใส่ไว้แล้วจะขึ้นบนบอร์ดแผนงาน ยังไม่รู้วันก็เว้นได้
  scheduledAt: dateField.nullable().optional(),
  scheduledTime: timeField,
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/inspect-request", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = inspectRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await guardStage(req, res, id, "NEW"))) return;

  const { team, scheduledAt, scheduledTime } = parsed.data;
  if (!(await teamExists(team))) return res.status(404).json({ error: `ไม่รู้จักทีม "${team}"` });

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: {
        status: "INSPECTING",
        assignedTeam: team,
        assignedToId: null,
        scheduledAt: scheduledAt ? dayStart(scheduledAt) : null,
        scheduledTime: scheduledAt ? scheduledTime ?? null : null,
        appointmentStatus: null,
        workStatus: workStatusForStage("INSPECTING"),
      },
    });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "INSPECT_REQUESTED",
      "INSPECTING",
      [
        `ให้ ${team} เข้าตรวจหน้างาน${scheduledAt ? ` วันที่ ${visitText(scheduledAt, scheduledTime)}` : ""}`,
        parsed.data.note,
      ]
        .filter(Boolean)
        .join(" — ")
    );
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

/**
 * บันทึกผลตรวจหน้างาน — ใบงานกลับไปให้หัวหน้าภาคระบุอะไหล่จากผลนี้
 *
 * ทีมที่ไปเป็นคนบันทึก เพราะเป็นคนที่เห็นเครื่องจริง หัวหน้าภาคและแอดมิน
 * บันทึกแทนได้ เผื่อช่างโทรมาเล่าแทนการกรอกเอง
 */
const inspectionSchema = z.object({
  note: z.string().trim().min(1, "ต้องบอกว่าตรวจแล้วเจออะไร").max(1000),
});

router.post("/:id/inspection", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = inspectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: {
      code: true,
      status: true,
      workStatus: true,
      assignedTeam: true,
      assignedToId: true,
      branch: { select: { region: true, zone: true, pmTeam: true } },
    },
  });
  if (!wo) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (wo.status !== "INSPECTING") {
    return res.status(409).json({
      error: `${wo.code} อยู่ขั้น "${WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status}" ไม่ได้รอตรวจหน้างาน`,
    });
  }
  if (req.auth!.role === "SUPERVISOR") {
    if (await blockedForSupervisor(req, res, wo)) return;
  } else if (await blockedForTeam(req, res, wo)) return;

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: {
        status: "NEW",
        inspectedAt: new Date(),
        inspectionNote: parsed.data.note,
        // หัวหน้าภาคต้องตัดสินใหม่จากผลตรวจ ไม่ใช่ค่าที่ค้างจากก่อนไปดู
        needsParts: null,
        scheduledAt: null,
        scheduledTime: null,
        // "รอช่าง" ที่ตั้งไว้ตอนส่งไปตรวจไม่จริงแล้ว — ค่าที่คนกรอกเองไม่แตะ
        ...(wo.workStatus === "WAITING_TECH" ? { workStatus: null } : {}),
      },
    });
    await writeLog(tx, id, req.auth!.userId, "INSPECTED", "NEW", parsed.data.note);
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

/** หัวหน้าภาคแตะได้เฉพาะใบงานในภาค/ทีมที่ดูแล — คืน true เมื่อ "ห้าม" แบบเดียวกับ blockedForTeam */
async function blockedForSupervisor(
  req: AuthRequest,
  res: Response,
  wo: { assignedTeam: string | null; branch: { region: string | null; zone: string | null; pmTeam: string | null } }
) {
  if (coversWorkOrder(await supervisorScope(req.auth!.userId), wo)) return false;
  res.status(403).json({ error: OUT_OF_SCOPE });
  return true;
}

/**
 * สร้างใบงานรออะไหล่ที่ลิงก์กับใบเดิม — ยังไม่ใส่อะไหล่ ผู้เรียกเป็นคนย้ายหรือเพิ่มเอง
 *
 * ไม่ผูกกับเคสบนกระดาน แม้ใบเดิมจะผูกอยู่ — เคสหนึ่งรับอาการและรายการอะไหล่
 * ได้จากใบงานเดียว ถ้าสองใบเขียนใส่เคสเดียวกัน ใบที่บันทึกทีหลังจะลบของอีกใบทิ้ง
 * ทุกครั้ง ความเชื่อมโยงไปถึงเคสยังตามได้ผ่านใบเดิม
 */
async function createFollowUp(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  parentId: number,
  userId: number,
  note: string
) {
  const parent = await tx.workOrder.findUniqueOrThrow({
    where: { id: parentId },
    select: {
      code: true,
      branchId: true,
      machineId: true,
      jobType: true,
      title: true,
      detail: true,
      priority: true,
      symptom: true,
      contactName: true,
      contactPhone: true,
    },
  });
  const { code: parentCode, ...copy } = parent;
  const child = await tx.workOrder.create({
    data: {
      ...copy,
      code: "",
      source: "MANUAL",
      parentId,
      status: "WAITING_PARTS",
      needsParts: true,
      workStatus: workStatusForStage("WAITING_PARTS"),
      createdById: userId,
    },
  });
  const code = workOrderCode(child.id);
  await tx.workOrder.update({ where: { id: child.id }, data: { code } });
  await writeLog(tx, child.id, userId, "SPLIT_FROM", "WAITING_PARTS", `แยกมาจาก ${parentCode} — ${note}`);
  return { id: child.id, code };
}

/**
 * อะไหล่ไม่ครบ — เปิดใบงานรออะไหล่ต่อจากใบนี้
 *
 * ไปเปลี่ยนแล้วเจอว่าต้องเปลี่ยนเพิ่มบางตัวที่ไม่ได้เตรียมไป ใบนี้ปิดได้ตามที่ทำจริง
 * ส่วนที่ขาดไปเป็นใบใหม่ ไม่ใช่ค้างใบนี้ไว้ทั้งใบเพราะของตัวเดียว
 */
const followUpSchema = z.object({
  parts: z
    .array(
      z.object({
        sparePartId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(999).default(1),
      })
    )
    .min(1, "ต้องระบุอะไหล่ที่ยังขาดอย่างน้อยหนึ่งรายการ")
    .max(20),
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/follow-up", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = followUpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: {
      code: true,
      status: true,
      assignedTeam: true,
      assignedToId: true,
      branch: { select: { region: true, zone: true, pmTeam: true } },
    },
  });
  if (!wo) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  // ก่อนจ่ายงานยังไม่มีใครไปหน้างาน ของที่ขาดยังแก้ในขั้นระบุอะไหล่/เช็คคลังได้
  if (!["ASSIGNED", "AWAITING_CONFIRM", "IN_PROGRESS", "DONE"].includes(wo.status)) {
    return res.status(409).json({
      error: `${wo.code} ยังไม่ถึงขั้นเข้าหน้างาน — แก้รายการอะไหล่ในใบนี้ได้เลย`,
    });
  }
  if (req.auth!.role === "SUPERVISOR") {
    if (await blockedForSupervisor(req, res, wo)) return;
  } else if (await blockedForTeam(req, res, wo)) return;

  const codes = await partCodesText(parsed.data.parts);
  const note = [`อะไหล่ที่ยังขาด: ${codes}`, parsed.data.note].filter(Boolean).join(" — ");

  const child = await prisma.$transaction(async (tx) => {
    const made = await createFollowUp(tx, id, req.auth!.userId, note);
    await replaceParts(tx, made.id, "WAITING", parsed.data.parts);
    await writeLog(tx, id, req.auth!.userId, "SPLIT", wo.status, `เปิด ${made.code} รออะไหล่ — ${note}`);
    return made;
  }, STAGE_TX);

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json({ ...shape(row), createdChild: child });
});

/** "SPHB144, D12-X x2" สำหรับเขียนลงประวัติ */
async function partCodesText(parts: { sparePartId: number; quantity: number }[]) {
  const found = await prisma.sparePart.findMany({
    where: { id: { in: parts.map((p) => p.sparePartId) } },
    select: { id: true, partCode: true },
  });
  return parts
    .map((p) => {
      const code = found.find((f) => f.id === p.sparePartId)?.partCode ?? `#${p.sparePartId}`;
      return p.quantity > 1 ? `${code} x${p.quantity}` : code;
    })
    .join(", ");
}

/**
 * ใบรออะไหล่ — ของมาแล้ว หัวหน้าภาคส่งต่อให้แอดมินเบิก
 *
 * ผลเช็คคลังที่ติดมาจากใบเดิม ("หมด") ถูกล้าง แอดมินต้องเช็คใหม่จากของที่มีจริงวันนี้
 */
router.post("/:id/parts-arrived", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const note = z.string().trim().max(500).optional().safeParse(req.body?.note);
  if (!note.success) return res.status(400).json({ error: note.error.flatten() });
  if (!(await guardStage(req, res, id, "WAITING_PARTS"))) return;

  await prisma.$transaction(async (tx) => {
    await tx.workOrderPart.updateMany({
      where: { workOrderId: id, kind: "WAITING" },
      data: { inStock: null, warehouse: null, requisitionNo: null, checkedAt: null, checkedById: null },
    });
    await tx.workOrder.update({
      where: { id },
      data: { status: "PARTS_REQUESTED", workStatus: workStatusForStage("PARTS_REQUESTED") },
    });
    await writeLog(tx, id, req.auth!.userId, "PARTS_ARRIVED", "PARTS_REQUESTED", note.data || null);
  }, STAGE_TX);

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

/**
 * ย้อนขั้นตอน — แอดมินกับหัวหน้าภาคเท่านั้น
 *
 * ใบงานเดินผิดขั้นได้จริง เช่น จ่ายผิดทีม ลูกค้ายกเลิกนัด เช็คคลังผิด เดิมทางเดียว
 * คือยกเลิกแล้วเปิดใบใหม่ ซึ่งทิ้งประวัติกับรูปไว้ในใบที่ยกเลิก
 *
 * ช่างย้อนไม่ได้ เพราะการย้อนล้างสิ่งที่คนอื่นทำไว้ (ผลเช็คคลัง ทีมที่จ่าย วันนัด)
 * — ช่างที่เจอปัญหาหน้างานยังใช้ "จบงานไม่ได้ ส่งกลับให้หัวหน้าภาค" ได้เหมือนเดิม
 * ต้องบอกเหตุผลทุกครั้ง และบันทึกลงประวัติว่าย้อนจากไหนไปไหน
 */
const stageRollbackSchema = z.object({
  toStage: z.enum(WORK_ORDER_STAGE_ORDER),
  reason: z.string().trim().min(1, "ต้องบอกเหตุผลที่ย้อน").max(500),
});

router.post("/:id/rollback", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const role = req.auth!.role;
  if (role !== "ADMIN" && role !== "SUPERVISOR") {
    return res.status(403).json({ error: "ย้อนขั้นตอนได้เฉพาะแอดมินกับหัวหน้าภาค" });
  }
  const parsed = stageRollbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { toStage, reason } = parsed.data;

  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: {
      code: true,
      status: true,
      parentId: true,
      assignedTeam: true,
      branch: { select: { region: true, zone: true, pmTeam: true } },
    },
  });
  if (!wo) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (role === "SUPERVISOR" && (await blockedForSupervisor(req, res, wo))) return;

  if (!(ACTIVE_WORK_ORDER_STATUSES as readonly string[]).includes(wo.status)) {
    return res.status(409).json({
      error: `${wo.code} ${wo.status === "DONE" ? "ปิดงานแล้ว" : "ถูกยกเลิกแล้ว"} ย้อนขั้นไม่ได้ — ใช้ “เปิดงานใหม่” แทน`,
    });
  }
  const order = WORK_ORDER_STAGE_ORDER as readonly string[];
  const from = order.indexOf(wo.status);
  const to = order.indexOf(toStage);
  if (toStage === "DONE" || to >= from) {
    return res.status(400).json({ error: "ย้อนได้เฉพาะขั้นที่ผ่านมาแล้ว" });
  }
  if (toStage === "WAITING_PARTS" && wo.parentId === null) {
    return res.status(400).json({ error: "ขั้นรออะไหล่มีเฉพาะใบงานที่แยกมาจากใบอื่น" });
  }
  if (toStage === "INSPECTING" && !wo.assignedTeam) {
    return res.status(400).json({ error: "ใบนี้ยังไม่มีทีมที่ไปตรวจ — ย้อนไปขั้นระบุอะไหล่แล้วส่งตรวจใหม่" });
  }

  const at = (stage: string) => order.indexOf(stage);
  const data: Record<string, unknown> = { status: toStage };
  // วันนัดผูกกับรอบที่ถูกย้อนทิ้ง — ค้างไว้จะโผล่บนบอร์ดแผนงานทั้งที่ไม่มีใครจะไป
  if (to <= at("ASSIGNED")) {
    data.scheduledAt = null;
    data.scheduledTime = null;
    data.appointmentStatus = null;
  } else if (toStage === "AWAITING_CONFIRM") {
    data.appointmentStatus = "PENDING";
  }
  // ย้อนไปก่อนจ่ายงาน = ยังไม่มีทีมรับ ไม่งั้นใบจะค้างอยู่ในรายการของทีมเดิม
  // ยกเว้นย้อนไปตรวจหน้างาน ซึ่งทีมเดิมคือทีมที่ต้องไป
  if (to <= at("PARTS_CHECKED") && toStage !== "INSPECTING") {
    data.assignedTeam = null;
    data.assignedToId = null;
  }
  if (toStage === "NEW") data.needsParts = null;
  const ws = workStatusForStage(toStage);
  if (ws !== undefined) data.workStatus = ws;

  await prisma.$transaction(async (tx) => {
    // ย้อนไปถึงขั้นเช็คคลังหรือก่อนนั้น ผลเช็ครอบเดิมใช้ไม่ได้แล้ว — แอดมินต้องเช็คใหม่
    if (to <= at("PARTS_REQUESTED")) {
      await tx.workOrderPart.updateMany({
        where: { workOrderId: id, kind: "WAITING" },
        data: { inStock: null, warehouse: null, requisitionNo: null, checkedAt: null, checkedById: null },
      });
    }
    await tx.workOrder.update({ where: { id }, data });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "ROLLED_BACK",
      toStage,
      `จาก “${WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status}” กลับไป “${
        WORK_ORDER_STATUS_LABELS[toStage] ?? toStage
      }” — ${reason}`
    );
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);

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
      assignedTeam: true,
      branch: { select: { region: true, zone: true, pmTeam: true } },
    },
  });
  if (!wo) return res.status(404).json({ error: "ไม่พบใบงานนี้" });

  // ย้อนได้เฉพาะตอนที่งานอยู่ในมือช่างแล้ว ก่อนหน้านั้นยังไม่มีใครไปเห็นหน้างาน
  if (!["ASSIGNED", "AWAITING_CONFIRM", "IN_PROGRESS"].includes(wo.status)) {
    return res.status(409).json({
      error: `${wo.code} ยังไม่ได้อยู่ในมือช่าง — ตอนนี้อยู่ขั้น "${
        WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status
      }"`,
    });
  }
  if (await blockedForTeam(req, res, wo)) return;

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
        scheduledTime: null,
        appointmentStatus: null,
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
  }, STAGE_TX);

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
  // คนที่เข้าไปทำจริง — จำเป็นเพราะงานถูกจ่ายให้ทีม ไม่ได้จ่ายรายคน
  // ถ้าไม่เก็บ จะไม่มีทางรู้ย้อนหลังว่าใครไปสาขาไหนวันไหน
  //
  // ไม่เกินสามคน เท่าที่ทีมหนึ่งไปกันจริง หน้าจอก็มีสามช่องตรงกัน
  workerIds: z.array(z.number().int().positive()).max(3).optional(),
  // คนนอกระบบที่ไปด้วย เช่น ผู้รับเหมา — ไม่บังคับ
  otherWorkers: z.string().trim().max(300).nullable().optional(),
});

router.post("/:id/close", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });

  const parsed = closeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const body = parsed.data;

  const current = await prisma.workOrder.findUnique({
    where: { id },
    select: { status: true, code: true, assignedToId: true, assignedTeam: true },
  });
  if (!current) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (current.status === "DONE") {
    return res.status(400).json({ error: `${current.code} ปิดไปแล้ว` });
  }
  if (current.status === "CANCELLED") {
    return res.status(400).json({ error: `${current.code} ถูกยกเลิกไปแล้ว` });
  }
  // ปิดได้ตั้งแต่ถูกจ่ายงานแล้ว เผื่อไปถึงหน้างานวันเดียวกันโดยไม่ได้นัดล่วงหน้า
  if (!["ASSIGNED", "AWAITING_CONFIRM", "IN_PROGRESS"].includes(current.status)) {
    return res.status(409).json({
      error: `${current.code} ยังไม่ถูกจ่ายให้ช่าง ปิดงานไม่ได้ — ตอนนี้อยู่ขั้น "${
        WORK_ORDER_STATUS_LABELS[current.status] ?? current.status
      }"`,
    });
  }
  // คนปิดต้องอยู่ทีมที่รับงาน ไม่งั้นใบงานถูกปิดโดยคนที่ไม่รู้ว่าหน้างานเป็นยังไง
  if (await blockedForTeam(req, res, current)) return;

  /**
   * ปิดงานได้เฉพาะงานที่จบแล้ว
   *
   * zod กันไว้ชั้นหนึ่งแล้ว แต่ใบงานเก่าหรือแอปเวอร์ชันเก่าอาจยังส่งผลแบบเดิมมา
   * และข้อความ "ค่าไม่ถูกต้อง" ไม่ได้บอกช่างว่าต้องทำยังไงต่อ
   */
  if ((RETIRED_WORK_ORDER_RESULTS as readonly string[]).includes(body.result)) {
    return res.status(400).json({
      error:
        "งานที่ยังไม่จบปิดไม่ได้ — กด “จบงานไม่ได้ ส่งกลับให้หัวหน้าภาค” แทน",
    });
  }

  /**
   * ต้องบอกว่าใครเข้าไปทำ
   *
   * งานถูกจ่ายให้ทีม ชื่อคนที่ไปจริงจึงเป็นข้อมูลที่มีอยู่ที่เดียวคือตอนปิดงาน
   * ปล่อยว่างได้เมื่อไหร่ ก็จะว่างเกือบทุกใบ แล้วคำถามว่า "ใครไปสาขานี้"
   * จะตอบไม่ได้เลยทั้งที่เป็นคำถามพื้นฐานที่สุดของการจ่ายงานเป็นทีม
   *
   * คนนอกระบบกรอกเป็นข้อความได้ แต่ต้องมีอย่างน้อยหนึ่งชื่อไม่ทางใดก็ทางหนึ่ง
   */
  const workerIds = [...new Set(body.workerIds ?? [])];
  const otherWorkers = body.otherWorkers?.trim() || null;
  if (workerIds.length === 0 && !otherWorkers) {
    return res.status(400).json({ error: "ต้องระบุชื่อผู้เข้าปฏิบัติงานอย่างน้อยหนึ่งคน" });
  }
  if (workerIds.length > 0) {
    const found = await prisma.user.count({ where: { id: { in: workerIds }, deletedAt: null } });
    if (found !== workerIds.length) {
      return res.status(400).json({ error: "มีชื่อผู้เข้าปฏิบัติงานที่ไม่อยู่ในระบบ" });
    }
  }

  /**
   * ต้องมีรูปหรือวิดีโอหน้างานอย่างน้อยหนึ่งไฟล์
   *
   * รูปหน้างานคือสิ่งเดียวที่บอกได้ว่าไปถึงจริงและเจออะไร — สรุปงานที่พิมพ์มา
   * เป็นคำบอกเล่า ส่วนรูปเป็นหลักฐาน ใบงานที่ปิดโดยไม่มีรูปเลยคือใบที่ตรวจย้อนไม่ได้
   *
   * นับเฉพาะรูปหน้างานทั่วไป ใบเหลืองกับป้ายรุ่นไม่นับ เพราะเป็นเอกสารและข้อมูล
   * ของเครื่อง ไม่ใช่ภาพของงานที่ทำ
   */
  const siteShots = await prisma.workOrderAttachment.count({
    where: { workOrderId: id, role: null },
  });
  if (siteShots === 0) {
    return res.status(400).json({ error: "ต้องแนบรูปหรือวิดีโอหน้างานอย่างน้อยหนึ่งไฟล์" });
  }

  /**
   * ปิดงานต้องมีรูปป้ายรุ่นของรอบนี้ — ไว้ไล่เทียบว่าไปถูกเครื่อง
   *
   * รุ่นที่กรอกไว้ตอนเปิดใบงานมาจากคนที่อาจไม่ได้ยืนอยู่หน้าเครื่อง ส่วนรูปนี้
   * ถ่ายตอนทำงานเสร็จ เทียบกันแล้วรู้ทันทีว่าช่างไปถูกเครื่องหรือเปล่า และรุ่น
   * ที่สั่งอะไหล่ไปตรงกับตัวจริงไหม — รูปที่ถ่ายไว้ตั้งแต่ตอนเปิดใบงานใช้แทนไม่ได้
   * เพราะมันตอบได้แค่ว่าเครื่องรุ่นอะไร ไม่ได้ตอบว่าคนที่ไปวันนั้นอยู่หน้าเครื่องตัวไหน
   *
   * ตอนเปิดใบงานยังไม่บังคับเหมือนเดิม เพราะคนเปิดใบงานบางทีรับแจ้งทางโทรศัพท์
   */
  const roundStart = await roundStartedAt(id);
  const nameplate = await prisma.workOrderAttachment.count({
    where: { workOrderId: id, role: "NAMEPLATE", createdAt: { gte: roundStart } },
  });
  if (nameplate === 0) {
    return res.status(400).json({
      error: "ต้องแนบรูปป้ายรุ่นของเครื่องที่ถ่ายรอบนี้ก่อนปิดงาน",
    });
  }

  /**
   * เบิกอะไหล่ไปใช้แล้วต้องมีรูปใบเบิก (ใบเหลือง) ของรอบนี้ติดมาด้วย
   *
   * นับเฉพาะใบที่แนบ "หลังจากงานถูกจ่ายให้ทีมรอบล่าสุด" ไม่ใช่นับว่าเคยแนบไหม —
   * ใบงานที่ช่างส่งกลับไปประเมินอะไหล่ใหม่แล้ววนกลับมา เป็นการเบิกของอีกชุด
   * และมีใบเบิกใบใหม่ ถ้านับรวมใบเก่า รอบที่สองจะผ่านไปโดยไม่มีเอกสารของตัวเอง
   *
   * ตรวจที่เซิร์ฟเวอร์ ไม่ใช่แค่ที่หน้าจอ เพราะใบเหลืองคือหลักฐานว่าของที่หายไป
   * จากคลังไปอยู่ที่เครื่องไหนจริง
   */
  if ((body.parts?.length ?? 0) > 0) {
    const slip = await prisma.workOrderAttachment.count({
      where: { workOrderId: id, role: "REQUISITION", createdAt: { gte: roundStart } },
    });
    if (slip === 0) {
      return res.status(400).json({
        error: "ใช้อะไหล่แล้วต้องแนบรูปใบเบิกอะไหล่ (ใบเหลือง) ของรอบนี้ก่อนปิดงาน",
      });
    }
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
        closeOtherWorkers: otherWorkers,
        // ปิดแล้วไม่ได้รออะไรอยู่ ค้างไว้จะไปโผล่บนกระดานว่ายังรอช่าง
        workStatus: workStatusForStage("DONE"),
      },
    });

    // เขียนทับทั้งชุด ไม่ใช่ต่อท้าย เผื่อแอดมินมาแก้ทีหลังว่าใครไปจริง
    await tx.workOrderWorker.deleteMany({ where: { workOrderId: id } });
    if (workerIds.length > 0) {
      await tx.workOrderWorker.createMany({
        data: workerIds.map((userId) => ({ workOrderId: id, userId })),
        skipDuplicates: true,
      });
    }

    // ของที่ใช้จริง ไม่ไปแตะรายการของที่รออยู่ ซึ่งเป็นคนละชุด
    if (body.parts !== undefined) await replaceParts(tx, id, "USED", body.parts);

    await writeLog(tx, id, req.auth!.userId, "CLOSED", "DONE", body.note?.trim() || null);
  }, STAGE_TX);

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

/**
 * ปิดงานย้อนหลัง (แอดมิน) — งานที่ช่างซ่อมเสร็จจริงไปแล้ว แต่ในระบบค้างกลางทาง
 *
 * กรอกข้อมูลที่ขาดของทุกขั้นที่เหลือในครั้งเดียว แล้วปิดงาน · ประวัติแต่ละขั้นลงวันเวลาจริงของงาน
 * (ไม่ใช่วันที่กด) เพราะ SLA รายงาน และไทม์ไลน์ต้องสะท้อนสิ่งที่เกิดขึ้นจริง — แต่ติด backfilledAt
 * ไว้ทุกแถว ให้รู้ว่าแอดมินกรอกทีหลัง ไม่ได้มีคนกดตอนนั้น
 *
 * รูปไม่บังคับ (เจ้าของระบบกำหนด) ถ้าไม่มีรูปหน้างานต้องใส่เหตุผลแทน · ไม่บังคับป้ายรุ่น/ใบเหลือง
 * เพราะงานจบไปแล้ว ไปถ่ายใหม่ไม่ได้ — ขั้นตอนปกติยังบังคับเหมือนเดิม
 */
const backfillSchema = z.object({
  reason: z.string().trim().min(1, "ต้องเลือกเหตุผลที่ปิดย้อนหลัง").max(200),
  reasonNote: z.string().trim().max(500).optional(),
  paidAt: dateField.optional(),
  paymentRef: z.string().trim().max(100).optional(),
  requisitionAt: dateField.optional(),
  requisitionRef: z.string().trim().max(100).optional(),
  warehouse: z.string().trim().max(100).optional(),
  team: z.string().trim().min(1, "ต้องเลือกทีมที่ไป").max(120),
  visitDate: dateField,
  visitTime: timeField,
  result: z.enum(WORK_ORDER_RESULTS),
  closedAt: z.string().datetime({ offset: true, message: "เวลาซ่อมเสร็จไม่ถูกต้อง" }),
  // อะไหล่ที่ใช้จริง — ไม่ส่ง = ไม่ได้ใช้
  parts: z.array(z.object({ sparePartId: z.number().int(), quantity: z.number().int().min(1) })).optional(),
  workerIds: z.array(z.number().int().positive()).max(3).optional(),
  otherWorkers: z.string().trim().max(300).nullable().optional(),
  note: z.string().trim().max(2000).optional(),
  noPhotoReason: z.string().trim().max(300).optional(),
});

router.post("/:id/backfill-close", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = backfillSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const b = parsed.data;

  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: { code: true, status: true, createdAt: true, assignedTeam: true },
  });
  if (!wo) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (wo.status === "DONE") return res.status(400).json({ error: `${wo.code} ปิดไปแล้ว` });
  if (wo.status === "CANCELLED") return res.status(400).json({ error: `${wo.code} ถูกยกเลิกไปแล้ว` });

  const known = await prisma.branch.findFirst({ where: { zone: b.team, cancelledAt: null }, select: { id: true } });
  if (!known) return res.status(400).json({ error: `ไม่รู้จักทีม "${b.team}"` });

  const workerIds = [...new Set(b.workerIds ?? [])];
  const otherWorkers = b.otherWorkers?.trim() || null;
  if (workerIds.length === 0 && !otherWorkers) {
    return res.status(400).json({ error: "ต้องระบุชื่อผู้เข้าปฏิบัติงานอย่างน้อยหนึ่งคน" });
  }
  if (workerIds.length && (await prisma.user.count({ where: { id: { in: workerIds }, deletedAt: null } })) !== workerIds.length) {
    return res.status(400).json({ error: "มีชื่อผู้เข้าปฏิบัติงานที่ไม่อยู่ในระบบ" });
  }
  const siteShots = await prisma.workOrderAttachment.count({ where: { workOrderId: id, role: null } });
  if (siteShots === 0 && !b.noPhotoReason) {
    return res.status(400).json({ error: "ไม่มีรูปหน้างาน — ต้องใส่เหตุผลที่ไม่มีรูป" });
  }

  // เวลาเป็นเวลาไทย · ต้องเรียงตามลำดับจริง และไม่เกินตอนนี้ — ไม่งั้นไทม์ไลน์และ SLA เพี้ยน
  // ก่อนวันเปิดใบงานได้ เพราะงานเก่า/งานที่ทำผ่านโทรศัพท์มักเปิดใบงานในระบบหลังจากซ่อมเสร็จแล้ว
  const at = (day: string, time = "12:00") => new Date(`${day}T${time}:00+07:00`);
  const closedAt = new Date(b.closedAt);
  // ไม่รู้เวลาเข้า: วันเดียวกับที่ซ่อมเสร็จ = ลงเวลาเดียวกับตอนเสร็จ (ไม่งั้นงานที่เสร็จ 08:00 จะถูกหาว่า
  // เสร็จก่อนเข้างานเพราะเดาเวลาเข้าเป็น 09:00) · คนละวัน = 09:00 ของวันนั้น
  const visit = b.visitTime
    ? at(b.visitDate, b.visitTime)
    : bangkokDay(closedAt) === b.visitDate
      ? closedAt
      : at(b.visitDate, "09:00");
  const paidAt = b.paidAt ? at(b.paidAt) : null;
  const reqAt = b.requisitionAt ? at(b.requisitionAt) : null;
  const now = new Date();
  const steps = [
    ["วันลูกค้าจ่ายเงิน", paidAt],
    ["วันเบิกอะไหล่", reqAt],
    ["วันเข้างาน", visit],
    ["เวลาซ่อมเสร็จ", closedAt],
  ] as const;
  let prev: [string, Date] | null = null;
  for (const [label, t] of steps) {
    if (!t) continue;
    if (t > now) return res.status(400).json({ error: `${label}ต้องไม่เกินวันนี้` });
    if (prev && t < prev[1]) return res.status(400).json({ error: `${label}ต้องไม่ก่อน${prev[0]}` });
    prev = [label, t];
  }

  const order = WORK_ORDER_STAGE_ORDER as readonly string[];
  const before = (stage: string) => order.indexOf(wo.status) <= order.indexOf(stage);
  const usedParts = b.parts ?? [];
  const actor = req.auth!.userId;
  const stamp = new Date();

  await prisma.$transaction(
    async (tx) => {
      const log = (action: string, status: string, createdAt: Date, note?: string | null) =>
        tx.workOrderLog.create({
          data: { workOrderId: id, userId: actor, action, status, note: note ?? null, createdAt, backfilledAt: stamp },
        });
      // ยังไม่ได้ระบุอะไหล่ — ใช้รายการที่ใช้จริงเป็นคำตอบของขั้นนั้น
      if (wo.status === "NEW" || wo.status === "INSPECTING") {
        await log(
          usedParts.length ? "PARTS_REQUESTED" : "NO_PARTS",
          usedParts.length ? "PARTS_REQUESTED" : "PARTS_CHECKED",
          reqAt ?? paidAt ?? visit,
          usedParts.length ? "ระบุตามอะไหล่ที่ใช้จริง" : "ไม่ได้ใช้อะไหล่"
        );
      }
      if (paidAt && before("AWAITING_PAYMENT")) {
        await log("PAID", "PARTS_REQUESTED", paidAt, b.paymentRef ? `หลักฐานการจ่าย ${b.paymentRef}` : null);
      }
      if (usedParts.length && before("PARTS_REQUESTED")) {
        await log(
          "PARTS_CHECKED",
          "PARTS_CHECKED",
          reqAt ?? visit,
          [b.warehouse ? `เบิกจาก ${b.warehouse}` : null, b.requisitionRef ? `ใบเบิก ${b.requisitionRef}` : null].filter(Boolean).join(" · ") || null
        );
      }
      if (before("PARTS_CHECKED") || wo.assignedTeam !== b.team) {
        await log("ASSIGNED", "ASSIGNED", visit, `จ่ายงานให้ ${b.team}`);
      }
      if (before("AWAITING_CONFIRM")) {
        await log("SCHEDULED", "IN_PROGRESS", visit, `เข้างาน ${b.visitDate}${b.visitTime ? ` เวลา ${b.visitTime} น.` : ""} (ไม่ผ่านนัด/คอนเฟิร์มในระบบ)`);
      }
      const closeNote = [
        b.note || null,
        siteShots === 0 ? `ไม่มีรูปหน้างาน: ${b.noPhotoReason}` : null,
      ]
        .filter(Boolean)
        .join(" — ");
      await log("CLOSED", "DONE", closedAt, closeNote || null);
      // แถวนี้ลงเวลาที่กดจริง — บอกว่าใครปิดย้อนหลัง เพราะอะไร
      await tx.workOrderLog.create({
        data: {
          workOrderId: id,
          userId: actor,
          action: "BACKFILLED",
          status: "DONE",
          note: [b.reason, b.reasonNote].filter(Boolean).join(" — "),
        },
      });

      await tx.workOrder.update({
        where: { id },
        data: {
          status: "DONE",
          needsParts: usedParts.length > 0,
          assignedTeam: b.team,
          scheduledAt: new Date(`${b.visitDate}T00:00:00.000Z`),
          scheduledTime: b.visitTime ?? null,
          appointmentStatus: "CONFIRMED",
          closedAt,
          closedById: actor,
          closeResult: b.result,
          closeNote: closeNote || null,
          closeOtherWorkers: otherWorkers,
          workStatus: workStatusForStage("DONE"),
        },
      });
      await tx.workOrderWorker.deleteMany({ where: { workOrderId: id } });
      if (workerIds.length) {
        await tx.workOrderWorker.createMany({ data: workerIds.map((userId) => ({ workOrderId: id, userId })), skipDuplicates: true });
      }
      await replaceParts(tx, id, "USED", usedParts);
    },
    STAGE_TX
  );

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
  }, STAGE_TX);

  const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  res.json(shape(row));
});

/** เปิดใหม่ เผื่อปิดผิดใบ — แอดมินเท่านั้น เพราะเป็นการย้อนสิ่งที่บันทึกไปแล้ว */
/**
 * ลบใบงานถาวร — แอดมินเท่านั้น
 *
 * ต่างจากยกเลิก: ยกเลิกเก็บใบไว้พร้อมประวัติว่าใครยกเลิกเมื่อไหร่ ส่วนลบคือหายไปเลย
 * มีไว้สำหรับใบที่ไม่ควรมีอยู่ตั้งแต่แรก — เปิดผิดสาขา เปิดซ้ำ หรือใบที่ลองระบบ
 * ใบที่เปิดถูกแต่ไม่ได้ทำแล้ว ควรใช้ยกเลิก เพราะเป็นเรื่องที่เกิดขึ้นจริงและควรมีร่องรอย
 *
 * ของที่หายไปด้วย: อะไหล่ที่บันทึกไว้ ประวัติทั้งหมด คนที่เข้าปฏิบัติงาน
 * และไฟล์แนบทั้งถัง (ตารางลูกผูก onDelete: Cascade ไว้แล้ว ส่วนไฟล์ในถังลบตามให้)
 *
 * ไม่แตะเคสบนกระดาน — อาการที่คนบันทึกไว้ยังเป็นอาการที่เจอจริง การลบใบงาน
 * ไม่ได้แปลว่าเครื่องไม่เคยเสีย พอไม่มีใบงานค้าง กระดานจะกลับมาขึ้นปุ่มสร้างใบงานเอง
 */
router.delete("/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });

  // อ่าน objectKey ไว้ก่อนลบ เพราะพอแถวหายแล้วจะไม่เหลืออะไรชี้ไปหาไฟล์ในถัง
  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: {
      code: true,
      attachments: { select: { objectKey: true } },
      _count: { select: { parts: true, logs: true, attachments: true, workers: true } },
    },
  });
  if (!wo) return res.status(404).json({ error: "ไม่พบใบงานนี้" });

  await prisma.workOrder.delete({ where: { id } });

  // ลบไฟล์หลังลบแถว — ลบไฟล์ไม่ผ่านแล้วหยุดไว้แค่นั้น จะเหลือใบงานที่สั่งลบไปแล้ว
  // ส่วนไฟล์ที่ค้างในถังไม่มีใครเปิดถึง เพราะไม่มีแถวชี้ไปหาแล้ว
  let fileErrors = 0;
  for (const a of wo.attachments) {
    if (!a.objectKey) continue;
    try {
      await deleteObject(a.objectKey);
    } catch (error) {
      fileErrors += 1;
      console.error("file delete failed", error);
    }
  }

  console.warn(
    `[DELETE work-order] ${wo.code} โดย userId=${req.auth!.userId} — ` +
      `อะไหล่ ${wo._count.parts} · ประวัติ ${wo._count.logs} · ไฟล์ ${wo._count.attachments}`
  );

  res.json({ ok: true, code: wo.code, removed: wo._count, fileErrors });
});

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
  }, STAGE_TX);

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
      assignedTeam: true,
      branch: { select: { region: true, zone: true, pmTeam: true } },
    },
  });
  if (!wo) {
    res.status(404).json({ error: "ไม่พบใบงานนี้" });
    return null;
  }

  const role = req.auth!.role;
  if (role === "SUPERVISOR") {
    if (!coversWorkOrder(await supervisorScope(req.auth!.userId), wo)) {
      res.status(403).json({ error: OUT_OF_SCOPE });
      return null;
    }
  } else if (await blockedForTeam(req, res, wo)) {
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
  role: string | null;
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
    // ว่าง = รูปหน้างานทั่วไป · NAMEPLATE = รูปป้ายรุ่นบนตัวเครื่อง
    role: a.role,
    roleLabel: a.role ? ATTACHMENT_ROLE_LABELS[a.role] ?? a.role : null,
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
  role: true,
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

  // บทบาทมาจากฟอร์ม ส่งมาผิดค่าถือว่าเป็นรูปทั่วไป ไม่ใช่ error —
  // ไฟล์ที่อัปสำเร็จแล้วไม่ควรถูกทิ้งเพราะป้ายกำกับสะกดผิด
  const rawRole = typeof req.body?.role === "string" ? req.body.role.trim().toUpperCase() : "";
  const role = (ATTACHMENT_ROLES as readonly string[]).includes(rawRole) ? rawRole : null;

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
        role,
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
  }, STAGE_TX);

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
  }, STAGE_TX);

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
