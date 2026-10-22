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
import { ADMIN_WAREHOUSE, WAREHOUSES } from "../documents/warehouses";
import { freshOutsource, isOutsourceTeam, outsourceList } from "../utils/outsource";
import { distanceMeters } from "../utils/geo";
import { buildPartClaimPdf } from "../documents/partClaimPdf";
import { documentPath, saveDocument } from "../documents/store";
import { bkkDayStart, buildOpenerReport, openerReportWorkbook } from "../reports/openerReport";
import { buildPartsOutReport, partsOutWorkbook, PARTS_OUT_REPORT_STAGES } from "../reports/partsOutReport";
import { activeRollback, RollbackSnapshot, rollbackPrefill } from "../utils/rollback";
import { claimGuideFor } from "../utils/claimGuide";
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
  ATTACHMENT_DOCUMENT_ROLES,
  MAX_ATTACHMENT_DOCUMENT_BYTES,
  ATTACHMENT_ROLES,
  INSPECTION_ROLES,
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
  OFF_CATALOG_PREFIX,
  bangkokDay,
  bangkokDayRange,
  canActOnStage,
  WORK_STATUSES,
  STORABLE_WORK_STATUSES,
  WORK_STATUS_LABELS,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_PRIORITY_LABELS,
  RETIRED_WORK_ORDER_RESULTS,
  WORK_ORDER_RESULTS,
  WORK_ORDER_RESULT_LABELS,
  SUPERVISOR_CLOSE_REASONS,
  SUPERVISOR_CLOSE_MIN_NOTE,
  SEND_BACK_REASONS,
  SEND_BACK_REASON_LABELS,
  MANUAL_WORK_STATUSES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STAGE_ACTIONS,
  WORK_ORDER_STAGE_DONE,
  WORK_ORDER_ACTION_LABELS,
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  isCompanyBranch,
  isValidMachineCode,
  isWarrantyExpired,
  warrantyEndFor,
  warrantyStatus,
  warrantyYearsFor,
  machineMake,
  claimTroubleshootingFor,
  CLAIM_EVIDENCE_ROLES,
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
      // ลิงก์แผนที่ในข้อความส่งทีม outsource (ใบงาน SUB) — ทีมนอกไม่มีแอปให้เปิดดูเอง
      latitude: true,
      longitude: true,
    },
  },
  machine: { select: { code: true, type: true, brand: true, model: true, capacityKg: true } },
  assignedTo: { select: { id: true, name: true, employeeCode: true } },
  createdBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  outage: { select: { id: true, kind: true, startedAt: true, endedAt: true } },
  parts: {
    include: { sparePart: { select: { id: true, partCode: true, name: true, brand: true, offCatalog: true } } },
    orderBy: { id: "asc" },
  },
  services: { orderBy: { id: "asc" } },
  // นับอย่างเดียว ไม่ดึงรูปย่อมาด้วย เพราะรายการใบงานมีเป็นร้อยใบ
  // ถ้าติดรูปย่อไปทุกใบ หน้ารายการจะโหลดหนักกว่าหน้ารายละเอียดหลายเท่า
  //
  _count: { select: { attachments: true } },
  // แถวเดียวพอต่อชนิด หน้าปิดงานแค่อยากรู้ว่ามีอะไรแนบไว้แล้วบ้าง
  // ไม่ได้จะเอารายการมาแสดง — รายการอยู่ที่ /attachments อยู่แล้ว
  attachments: {
    where: { role: { not: null } },
    select: { id: true, role: true, createdAt: true, sparePartId: true },
  },
  // ใบเคลมทุกรอบ ใหม่สุดก่อน — รอบที่ถูกตีกลับเก็บไว้ให้ช่างเห็นว่าโดนตีกลับเพราะอะไร
  claims: { orderBy: { createdAt: "desc" as const } },
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

/** อะไหล่หนึ่งรายการของใบงาน — unit/note มีเฉพาะของนอกสโตร์ */
type PartLine = { sparePartId: number; quantity: number; unit?: string | null; note?: string | null };

/** ตัวเดิมส่งมาซ้ำให้รวมจำนวนกัน ไม่ใช่ error · หน่วย/หมายเหตุใช้ของแถวแรกที่ใส่มา */
function mergeLines(parts: PartLine[]) {
  const merged = new Map<number, { quantity: number; unit: string | null; note: string | null }>();
  for (const p of parts) {
    const was = merged.get(p.sparePartId);
    merged.set(p.sparePartId, {
      quantity: (was?.quantity ?? 0) + p.quantity,
      unit: was?.unit ?? p.unit ?? null,
      note: was?.note ?? p.note ?? null,
    });
  }
  return merged;
}

/**
 * อะไหล่นอกสโตร์ (ไม่มี SKU — เจ้าของงานขอ ต.ค. 69) ที่พิมพ์ชื่อมา → แถวใน SparePart ที่ติดป้าย offCatalog
 *
 * ทำเป็นแถวในตารางเดียวกับของในสโตร์ ไม่ใช่ตารางแยก เพราะทุกขั้นหลังจากนี้ (เช็คมี/หมด แยกใบรออะไหล่
 * ปิดงานด้วยของที่ใช้จริง เคลม) อ้างอะไหล่ด้วย sparePartId ทั้งหมด — ตารางแยกต้องเขียนทุกขั้นสองทาง
 * ชื่อเดียวกันคือแถวเดียวกัน (partCode = OFF_CATALOG_PREFIX + ชื่อ) จึงนับได้ว่าของนอกสโตร์ตัวไหนใช้บ่อยจนควรเปิด SKU
 * partCode ขึ้นต้นด้วยป้ายไว้ให้ทุกที่ที่โชว์ partCode (สรุปบนกระดาน ประวัติ รายงาน) อ่านออกโดยไม่ต้องแก้
 */
const offPartInput = z.object({
  name: z.string().trim().min(1, "อะไหล่นอกสโตร์ต้องมีชื่อ").max(120),
  quantity: z.number().int().min(1).max(999).default(1),
  unit: z.string().trim().max(20).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});
async function resolveOffParts(items: z.infer<typeof offPartInput>[] | undefined): Promise<PartLine[]> {
  const out: PartLine[] = [];
  for (const it of items ?? []) {
    const name = it.name.replace(/\s+/g, " ").trim();
    const partCode = `${OFF_CATALOG_PREFIX}${name}`;
    const sp = await prisma.sparePart.upsert({
      where: { partCode },
      create: { partCode, name, offCatalog: true },
      update: {},
      select: { id: true },
    });
    out.push({ sparePartId: sp.id, quantity: it.quantity, unit: it.unit || null, note: it.note || null });
  }
  return out;
}

/** แทนที่อะไหล่ของใบงานทั้งชุดเฉพาะประเภทที่ระบุ ไม่แตะอีกประเภท */
async function replaceParts(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  workOrderId: number,
  kind: "WAITING" | "USED",
  parts: PartLine[]
) {
  await tx.workOrderPart.deleteMany({ where: { workOrderId, kind } });
  const merged = mergeLines(parts);
  if (merged.size === 0) return;
  await tx.workOrderPart.createMany({
    data: [...merged].map(([sparePartId, p]) => ({ workOrderId, sparePartId, kind, ...p })),
  });
}

/**
 * ปรับรายการอะไหล่ที่รออยู่ให้ตรงกับรายการใหม่ โดยไม่ลบผลเช็คของตัวที่ไม่ได้เปลี่ยน
 *
 * replaceParts ลบแล้วสร้างใหม่ทั้งชุด ผลเช็คคลังกับเลขใบเบิกจึงหายไปทุกครั้งที่ใครแก้รายการ
 * — ใบที่ช่างส่งกลับมาพร้อมของที่เบิกไปแล้ว ต้องให้แอดมินเช็คเฉพาะตัวที่เพิ่ม ไม่ใช่เบิกซ้ำทั้งใบ
 * (เจ้าของงานขอ ต.ค. 69: "ข้อมูลเดิมยังอยู่")
 *
 * ตัวเดิมจำนวนเดิม = เก็บแถวเดิมไว้ทั้งแถว · จำนวนเปลี่ยน = ต้องเบิกใหม่ ผลเช็คถูกล้าง ·
 * ไม่อยู่ในรายการใหม่ = ลบ · ตัวใหม่ = ยังไม่เช็ค
 */
async function mergeWaitingParts(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  workOrderId: number,
  parts: PartLine[]
) {
  const merged = mergeLines(parts);
  const current = await tx.workOrderPart.findMany({ where: { workOrderId, kind: "WAITING" } });
  const kept = new Set<number>();
  for (const row of current) {
    const want = merged.get(row.sparePartId);
    if (want === undefined || kept.has(row.sparePartId)) {
      await tx.workOrderPart.delete({ where: { id: row.id } });
    } else {
      kept.add(row.sparePartId);
      if (want.quantity !== row.quantity) {
        await tx.workOrderPart.update({
          where: { id: row.id },
          data: { ...want, inStock: null, warehouse: null, requisitionNo: null, checkedAt: null, checkedById: null },
        });
      } else if (want.unit !== row.unit || want.note !== row.note) {
        // แก้แค่หน่วย/หมายเหตุ ไม่ใช่ของคนละชิ้น — ผลเช็คเดิมยังใช้ได้
        await tx.workOrderPart.update({ where: { id: row.id }, data: { unit: want.unit, note: want.note } });
      }
    }
  }
  const fresh = [...merged].filter(([sparePartId]) => !kept.has(sparePartId));
  if (fresh.length) {
    await tx.workOrderPart.createMany({
      data: fresh.map(([sparePartId, p]) => ({ workOrderId, sparePartId, kind: "WAITING", ...p })),
    });
  }
}

/** เบิกไปแล้ว — มีของและมีเลขใบเบิก ไม่ต้องเช็คหรือเสนอราคาซ้ำ */
const isIssued = (p: { inStock: boolean | null; requisitionNo: string | null }) => p.inStock === true && !!p.requisitionNo;

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

function shape(w: WorkOrderRow, roundStart?: Date, inspectStart?: Date) {
  return {
    id: w.id,
    code: w.code,
    source: w.source,
    isTest: w.isTest,
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
    // วันหมดประกันคิดจากวันเปิดร้าน + ปีตามยี่ห้อเครื่องของใบนี้ (Oasis 2 · อื่น ๆ 3) เว้นแต่มีคนกรอกวันเฉพาะไว้
    // คิดที่เซิร์ฟเวอร์ที่เดียว หน้าจอจึงไม่ต้องรู้ว่ากฎกี่ปี
    branchWarrantyExpiresAt: isCompanyBranch(w.branch.code)
      ? null
      : warrantyEndFor(w.branch.openedAt, w.branch.warrantyExpiresAt, machineMake(w.machine)),
    branchWarrantyExpired: isCompanyBranch(w.branch.code)
      ? null
      : isWarrantyExpired(warrantyEndFor(w.branch.openedAt, w.branch.warrantyExpiresAt, machineMake(w.machine))),
    // บอกว่าคิดจากกี่ปี — คนดูใบงานจะได้ไม่งงว่าทำไมสาขาเดียวกันเครื่องหนึ่งหมด อีกเครื่องยังไม่หมด
    // ว่างเมื่อใช้วันที่กรอกเอง (ไม่ได้คิดจากกฎ)
    branchWarrantyYears:
      isCompanyBranch(w.branch.code) || w.branch.warrantyExpiresAt ? null : warrantyYearsFor(machineMake(w.machine)),
    // ยี่ห้อที่ใช้คิด — จากไฟล์รายงานเครื่อง หรือรุ่นที่เลือกตอนเปิดใบงาน
    branchWarrantyBrand: machineMake(w.machine),
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
    ...("latitude" in w.branch ? { branchLatitude: w.branch.latitude, branchLongitude: w.branch.longitude } : {}),
    assignedTeam: w.assignedTeam,
    // ทีม outsource — ช่างไม่มีบัญชีในแอป หัวหน้าภาคปิดงาน/แจ้งปัญหาแทน
    assignedOutsource: isOutsourceTeam(w.assignedTeam),
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
    // หน้าปิดงานเตือนก่อนกดว่าไฟล์จะเกินเพดาน — ไม่ใช่ไปติดกลางทางตอนอัปไฟล์ที่ 15 จาก 20
    attachmentLimit: MAX_ATTACHMENTS_PER_WORK_ORDER,
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
    partsExpectedAt: w.partsExpectedAt,
    hasReceipt: w.attachments.some((a) => a.role === "RECEIPT"),
    // อะไหล่นอก/ค่าบริการ = หัวหน้าช่างขอให้เสนอราคาเสมอ ไม่ว่าสาขาไหนหรือประกันยังอยู่ (เจ้าของงานเลือก ต.ค. 69)
    needsQuote:
      w.parts.some((p) => p.kind === "WAITING" && p.sparePart.offCatalog) ||
      w.services.length > 0 ||
      needsCustomerQuote({
        branchCode: w.branch.code,
        needsParts: w.needsParts,
        openedAt: w.branch.openedAt,
        warrantyExpiresAt: w.branch.warrantyExpiresAt,
        machineBrand: machineMake(w.machine),
      }),
    services: w.services.map((v) => ({ id: v.id, name: v.name, quantity: v.quantity, unit: v.unit, note: v.note })),
    // ── เคลมอะไหล่ ──
    claims: w.claims.map((c) => ({
      id: c.id,
      sparePartId: c.sparePartId,
      partCode: c.partCode,
      partName: c.partName,
      brokenPartCode: c.brokenPartCode,
      quantity: c.quantity,
      brand: c.brand,
      model: c.model,
      machineCode: c.machineCode,
      symptom: c.symptom,
      checkNote: c.checkNote,
      troubleshooting: c.troubleshooting,
      nameplate: c.nameplate,
      fieldCheck: c.fieldCheck,
      status: c.status,
      rejectReason: c.rejectReason,
      createdAt: c.createdAt,
      reviewedAt: c.reviewedAt,
    })),
    // หลักฐานเคลมที่แนบไว้แล้วในรอบนี้ (อะไหล่ชิ้นไหน · ชนิดไหน) — ช่างที่ถูกตีกลับแนบเพิ่มเฉพาะที่ขาด
    claimEvidence: w.attachments
      .filter(
        (a) =>
          a.role && (CLAIM_EVIDENCE_ROLES as readonly string[]).includes(a.role) && (!roundStart || a.createdAt >= roundStart)
      )
      .map((a) => ({ sparePartId: a.sparePartId, role: a.role })),
    // Troubleshooting (ข้อ 4 ของฟอร์มเคลม) ของยี่ห้อเครื่องใบนี้ — ว่าง = ยี่ห้อนี้ไม่ต้องทำ
    claimTroubleshooting: claimTroubleshootingFor(machineMake(w.machine))?.items ?? [],
    // แบบป้ายรุ่นของยี่ห้อนี้ (บรรทัดที่สแกน) + รายการเช็คตามคู่มือ — แอปไม่ได้เขียนรายการซ้ำ (utils/claimGuide.ts)
    claimGuide: claimGuideFor(machineMake(w.machine)),
    // รูปก่อน/หลังซ่อมของรอบนี้ — หน้าปิดงานบอกว่าแนบไว้แล้ว ไม่ต้องถ่ายซ้ำ
    beforeCount: w.attachments.filter((a) => a.role === "BEFORE" && (!roundStart || a.createdAt >= roundStart)).length,
    afterCount: w.attachments.filter((a) => a.role === "AFTER" && (!roundStart || a.createdAt >= roundStart)).length,
    // ไฟล์ตรวจหน้างานของรอบตรวจนี้ (นับตั้งแต่ส่งทีมไปตรวจครั้งล่าสุด) — ฟอร์มส่งผลตรวจบอกว่าแนบไว้แล้วกี่ไฟล์
    // ไม่รู้ว่ารอบตรวจเริ่มเมื่อไหร่ (คำตอบจากคำสั่งอื่นที่ไม่ใช่หน้ารายละเอียด) ก็ไม่ส่ง ดีกว่าส่งเลขที่นับปนรอบเก่า
    inspectionStartedAt: inspectStart ?? null,
    inspectionFiles: inspectStart
      ? Object.fromEntries(
          INSPECTION_ROLES.map((r) => [r, w.attachments.filter((a) => a.role === r && a.createdAt >= inspectStart).length])
        )
      : null,
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
    subTeam: w.closeSubTeam,
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
  partsExpectedAt: true,
  scheduledTime: true,
  appointmentStatus: true,
  parentId: true,
  createdAt: true,
  closedAt: true,
  closeResult: true,
  branch: {
    select: { code: true, name: true, region: true, zone: true, pmTeam: true, openedAt: true, warrantyExpiresAt: true },
  },
  // ขนาดเครื่อง (กก.) — ป้าย "W7 · 25 กก." ในรายการ (เจ้าของงานขอ ต.ค. 69 ให้รู้ขนาดเร็ว)
  machine: { select: { code: true, brand: true, model: true, capacityKg: true } },
  assignedTeam: true,
  assignedTo: { select: { name: true } },
  createdBy: { select: { name: true, role: true } },
  // ใบงานแจ้งเคลม (ตอนปิดงานส่งอะไหล่เก่าเคลม) — ป้าย + ตัวกรอง "ใบงานเคลม" ในรายการ (เจ้าของงานขอ ต.ค. 69)
  // เอาแค่รอบล่าสุดตัวเดียว รายการอยากรู้สถานะเคลมตอนนี้ ไม่ใช่ทุกรอบ
  claims: { select: { status: true }, orderBy: { createdAt: "desc" as const }, take: 1 },
  _count: {
    select: {
      attachments: true,
      // ป้ายแดง "อะไหล่หมด" ในรายการ — นับอย่างเดียว ไม่ดึงรายการอะไหล่ทั้งชุดมา (ดูเหตุผลข้างบน)
      parts: { where: { kind: "WAITING", inStock: false } },
    },
  },
} as const;

/**
 * ขั้นที่ผล "หมด" ยังหมายถึงตอนนี้ — ทุกทางที่ออกจากขั้นเหล่านี้ (ของครบ · ของมาแล้ว · ย้อนขั้น)
 * ไม่ได้ล้างผลเช็คเสมอไป ขั้นหลังจากนี้ผล "หมด" ที่ค้างอยู่จึงเป็นแค่ประวัติ ไม่ใช่ของที่ยังขาด
 */
const PARTS_OUT_STAGES = new Set(["PARTS_SOURCING", "PARTS_REQUESTED", "WAITING_PARTS"]);

/** ค่าที่ยกมาได้ตอนเปิดใบงาน — เฉพาะที่คนตั้งเอง ที่เหลือว่าง (ขั้นแรกระบบไม่ตั้งอะไร) */
function manualOrNull(v: string | null | undefined): string | null {
  return v && (MANUAL_WORK_STATUSES as readonly string[]).includes(v) ? v : null;
}

/** สถานะอัตโนมัติของใบงานตอนนี้ — ตามขั้น และผลเช็คคลังของขั้นที่อะไหล่หมดได้ */
async function autoWorkStatus(id: number, stage: string): Promise<string | null> {
  const out = PARTS_OUT_STAGES.has(stage)
    ? (await prisma.workOrderPart.count({ where: { workOrderId: id, kind: "WAITING", inStock: false } })) > 0
    : false;
  return workStatusForStage(stage, { anyPartOutOfStock: out }) ?? null;
}

/** หัวหน้าภาคพร้อมขอบเขต — ใช้ตอบว่าใบที่รอหัวหน้าภาครอ "ใคร" */
type SupervisorRef = { id: number; name: string; region: string | null; supervisedTeams: string[] };

/**
 * ประวัติที่ไม่ได้ขยับขั้น — ไม่นับตอนหาว่าใบงานค้างขั้นนี้มานานเท่าไร
 * แนบรูปเพิ่มตอนบ่ายไม่ได้แปลว่าใบงานเพิ่งเข้าขั้นนี้
 */
// ARRIVED (ช่างถึงหน้างาน) ไม่ใช่การเดินขั้น — ใบยังอยู่ "ช่าง · เข้างาน/ปิดงาน" นับวันค้างต่อจากเดิม
const NON_STAGE_ACTIONS = ["ATTACHED", "ATTACHMENT_REMOVED", "EDITED", "PARTS_ETA_CHANGED", "STATUS_CHANGED", "ARRIVED"];

type WorkOrderListRow = Awaited<
  ReturnType<typeof prisma.workOrder.findFirstOrThrow<{ select: typeof listSelect }>>
>;

function listShape(
  w: WorkOrderListRow,
  ctx: { supervisors: SupervisorRef[]; stageSince: Map<number, Date> }
) {
  const actor = WORK_ORDER_STAGE_ACTOR[w.status] ?? null;
  /**
   * ขั้นนี้รอ "ใคร" — ไม่ใช่แค่บทบาท
   *
   * ระบบไม่ได้ผูกใบงานกับหัวหน้าภาครายคน จึงตอบจากขอบเขตที่แต่ละคนดูแล
   * (ภาค หรือทีม) — ภาคที่มีหัวหน้าภาคสองคนจะได้ทั้งสองชื่อ ซึ่งตรงกับความจริง
   * ว่าใครในสองคนนั้นก็กดได้ ส่วนขั้นของช่างตอบเป็นทีมที่รับงาน แอดมินไม่แยกคน
   */
  const waitingOnSupervisors =
    actor === "SUPERVISOR"
      ? ctx.supervisors
          .filter((s) => coversWorkOrder({ region: s.region, teams: s.supervisedTeams }, w))
          .map((s) => ({ id: s.id, name: s.name, region: s.region }))
      : [];
  return {
    stageActor: actor,
    waitingOnSupervisors,
    // รอหัวหน้าภาคแต่ไม่มีใครดูแลภาค/ทีมนี้ — กล่องงานแอดมินแยกหัวข้อ "ไม่มีคนรับ"
    orphan: actor === "SUPERVISOR" && waitingOnSupervisors.length === 0,
    /**
     * ทำไมไม่มีคนรับ — แอดมินรู้เลยว่าต้องไปแก้ที่สาขา (ไม่มีภาค/ทีม) หรือที่หัวหน้าภาค (ภาค/ทีมนี้ยังไม่มีคนดูแล)
     * เดิมขึ้นแค่ "ไม่มีคนรับ" ต้องเปิดใบทีละใบไปเทียบกับผังผู้รับผิดชอบเอง (เจ้าของงานขอ ต.ค. 69)
     */
    orphanReason:
      actor === "SUPERVISOR" && waitingOnSupervisors.length === 0
        ? (() => {
            const team = w.assignedTeam ?? w.branch.zone ?? w.branch.pmTeam;
            const where = `ภาค${w.branch.region ?? " —"} · ทีม${team ?? " —"}`;
            return !w.branch.region && !team
              ? `${where} — สาขายังไม่มีภาคและทีม (ตั้งที่จัดการข้อมูลสาขา)`
              : `${where} — ยังไม่มีหัวหน้าภาคดูแลภาค/ทีมนี้ (ตั้งที่สิทธิ์ผู้ใช้)`;
          })()
        : null,
    // วันนัดผ่านไปแล้วยังไม่ได้คอนเฟิร์มลูกค้า — กล่องงานแอดมินแยกหัวข้อ "เลยนัด"
    overdue:
      (w.status === "AWAITING_CONFIRM" || w.status === "INSPECT_CONFIRM") &&
      !!w.scheduledAt &&
      w.scheduledAt.toISOString().slice(0, 10) < bangkokDay(new Date()),
    waitingOnTeam: actor === "EMPLOYEE" ? w.assignedTeam : null,
    // ใบที่จ่ายให้ทีม outsource — กล่องงานหัวหน้าภาคแยกไว้แท็บของตัวเอง ไม่ปนกับงานทีมช่างปกติ
    outsource: isOutsourceTeam(w.assignedTeam),
    // D = แฟรนไชส์ (DODO) · C = สาขาบริษัท (COCO) — กติกาเดียวกับขั้นเสนอราคา
    branchType: isCompanyBranch(w.branch.code) ? "COCO" : "DODO",
    // ป้ายประกันในรายการ — คิดที่เดียวกับหน้าใบงาน (วันเปิดร้าน + ปีตามยี่ห้อเครื่อง)
    ...(({ state, endsAt }) => ({ warranty: state, warrantyEndsAt: endsAt }))(
      warrantyStatus({
        branchCode: w.branch.code,
        openedAt: w.branch.openedAt,
        warrantyExpiresAt: w.branch.warrantyExpiresAt,
        machineBrand: machineMake(w.machine),
      })
    ),
    // เข้าขั้นปัจจุบันเมื่อไร — ใบที่ไม่มีประวัติขยับขั้นเลยนับจากวันเปิด
    stageSince: ctx.stageSince.get(w.id) ?? w.createdAt,
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
    machineCapacityKg: w.machine?.capacityKg ?? null,
    assignedTeam: w.assignedTeam,
    // ใบเก่าที่จ่ายรายคนก่อนเปลี่ยนมาจ่ายเป็นทีม ยังต้องบอกได้ว่าอยู่ในมือใคร
    assignedToName: w.assignedTo?.name ?? null,
    scheduledAt: w.scheduledAt,
    scheduledTime: w.scheduledTime,
    // สถานะนัดในรายการ (เจ้าของงานขอ ต.ค. 69) — ป้ายเดียวกับหน้าใบงาน
    appointmentStatus: w.appointmentStatus,
    appointmentStatusLabel: w.appointmentStatus ? APPOINTMENT_STATUS_LABELS[w.appointmentStatus] ?? w.appointmentStatus : null,
    partsExpectedAt: w.partsExpectedAt,
    partsOut: PARTS_OUT_STAGES.has(w.status) ? w._count.parts : 0,
    // ใบรออะไหล่ที่แยกมาจากใบอื่น — รายการขึ้นป้ายให้รู้ว่าเป็นงานต่อเนื่อง
    isFollowUp: w.parentId !== null,
    // ใบที่ไม่มีผู้เปิด (ระบบสร้างเอง หรือบัญชีผู้เปิดถูกลบ) ส่ง null ให้แอปขึ้นว่า "ระบบ"
    createdByName: w.createdBy?.name ?? null,
    createdByRole: w.createdBy?.role ?? null,
    createdAt: w.createdAt,
    closedAt: w.closedAt,
    // รหัสผลด้วย ไม่ใช่แค่ป้าย — รายการแยกใบที่หัวหน้าภาคปิดเองจากใบที่ช่างปิดหน้างาน
    closeResult: w.closeResult,
    closeResultLabel: w.closeResult
      ? WORK_ORDER_RESULT_LABELS[w.closeResult] ?? w.closeResult
      : null,
    attachmentCount: w._count.attachments,
    // สถานะเคลมรอบล่าสุด PENDING / APPROVED / REJECTED — ว่าง = ใบนี้ไม่ได้แจ้งเคลม
    claimStatus: w.claims[0]?.status ?? null,
  };
}

function partShape(p: {
  quantity: number;
  inStock?: boolean | null;
  warehouse?: string | null;
  requisitionNo?: string | null;
  transferFrom?: string | null;
  transferReqNo?: string | null;
  transferNo?: string | null;
  transferredAt?: Date | null;
  unit?: string | null;
  note?: string | null;
  sparePart: { id: number; partCode: string; name: string; brand: string | null; offCatalog?: boolean };
}) {
  return {
    sparePartId: p.sparePart.id,
    partCode: p.sparePart.partCode,
    name: p.sparePart.name,
    brand: p.sparePart.brand,
    // ของนอกสโตร์ — หน้าจอโชว์ชื่อ + ป้าย แทนรหัส และไม่ถามคลัง/เลขใบเบิก
    offCatalog: p.sparePart.offCatalog ?? false,
    unit: p.unit ?? null,
    note: p.note ?? null,
    quantity: p.quantity,
    // ว่าง = ยังไม่มีใครเช็ค ต่างจาก false ที่แปลว่าเช็คแล้วและหมด
    inStock: p.inStock ?? null,
    warehouse: p.warehouse ?? null,
    requisitionNo: p.requisitionNo ?? null,
    // โอนข้ามคลัง — ต้นทาง · ใบเบิกต้นทาง · ใบโอน · ถึงปลายทางเมื่อไร (ว่าง = กำลังโอน/ยังไม่โอน)
    transferFrom: p.transferFrom ?? null,
    transferReqNo: p.transferReqNo ?? null,
    transferNo: p.transferNo ?? null,
    transferredAt: p.transferredAt ? p.transferredAt.toISOString() : null,
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
  wo: { assignedTeam: string | null; assignedToId: number | null; branch?: { region: string | null; zone: string | null; pmTeam: string | null } }
) {
  if (req.auth!.role === "ADMIN") return false;
  // ทีม outsource ไม่มีบัญชีในแอป — หัวหน้าภาคที่ดูแลสาขานั้นปิดงาน/แจ้งปัญหาแทน (เจ้าของงานเลือก ต.ค. 69)
  if (req.auth!.role === "SUPERVISOR" && wo.branch && (await freshOutsource()).has(wo.assignedTeam ?? "")) {
    if (coversWorkOrder(await supervisorScope(req.auth!.userId), { assignedTeam: wo.assignedTeam, branch: wo.branch })) return false;
    res.status(403).json({ error: OUT_OF_SCOPE });
    return true;
  }
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

type ViewableWorkOrder = {
  id: number;
  assignedTeam: string | null;
  assignedToId: number | null;
  createdById: number | null;
  branch: { region: string | null; zone: string | null; pmTeam: string | null };
};

/**
 * เปิดดูใบงานนี้ได้ไหม (ตรวจระบบ ต.ค. 69) — คืน true เมื่อ "ห้าม" และตอบ 403 ให้แล้ว
 *
 * เดิมเปิดตรงด้วยเลขใบงานได้ทุกใบ ทั้งที่หน้ารายการกรองตามทีม/พื้นที่ — ไล่เลขก็เห็นเบอร์ลูกค้า
 * และรูปในร้านของทั้งบริษัท · ตอนนี้ใช้กฎเดียวกับหน้ารายการ บวกใบที่ช่างคนนั้นเปิดเอง
 * (เปิดใบงานเสร็จต้องเข้าดู/แนบรูปใบตัวเองได้ ทั้งที่ยังไม่จ่ายทีม) และใบที่เคยไปทำ (ประวัติงานตัวเอง)
 */
async function blockedForViewer(req: AuthRequest, res: Response, wo: ViewableWorkOrder) {
  const role = req.auth!.role;
  if (role === "ADMIN") return false;
  if (role === "SUPERVISOR") {
    if (coversWorkOrder(await supervisorScope(req.auth!.userId), wo)) return false;
    res.status(403).json({ error: OUT_OF_SCOPE });
    return true;
  }
  const me = req.auth!.userId;
  if (wo.assignedToId === me || wo.createdById === me) return false;
  const user = await prisma.user.findUnique({ where: { id: me }, select: { team: true } });
  if (covers(await coverageOf(user?.team ?? null), wo.assignedTeam)) return false;
  if ((await prisma.workOrderWorker.count({ where: { workOrderId: wo.id, userId: me } })) > 0) return false;
  res.status(403).json({ error: "ใบงานนี้ไม่ใช่ของทีมคุณ — ถ้าต้องช่วยงานนี้ ให้หัวหน้าภาคจ่ายงานให้ทีมคุณ", notYourTeam: true });
  return true;
}

const VIEW_SELECT = {
  id: true,
  assignedTeam: true,
  assignedToId: true,
  createdById: true,
  branch: { select: { region: true, zone: true, pmTeam: true } },
} as const;

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
  // ใบขยับขั้น = ชุด "ไม่มีคนรับ" อาจเปลี่ยน — ทิ้งผลที่จำไว้ ให้กล่องงานแอดมินไม่ค้างของเก่า
  orphanCache = null;
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
/**
 * ใบที่รอหัวหน้าภาค แต่ภาค/ทีมนั้นไม่มีหัวหน้าภาคดูแลเลย (ตำแหน่งว่าง) — เข้ากล่องงานแอดมิน
 *
 * เดิมขึ้นแค่ "ยังไม่มีคนดูแล" ในรายการ แต่ไม่อยู่ในกล่องของใคร ค้างได้เป็นสัปดาห์โดยไม่มีใครเห็น
 * (เจ้าของงานเลือก ต.ค. 69) · แอดมินกดแทนได้ทุกขั้นอยู่แล้ว ยกเว้นเบิกคลังอื่น (ต้องตั้งหัวหน้าภาคก่อน)
 */
/**
 * จำผลไว้ 60 วินาที — inbox-count ถูกเรียกทุกครั้งที่แอดมินเปลี่ยนหน้า (เมนูข้าง) และรายการโหลดซ้ำทุกนาที
 * แต่ละครั้งต้องดึงใบที่รอหัวหน้าภาคทั้งบริษัท · ช้าไปไม่เกินนาทีไม่มีผลกับงาน (ใบไม่มีคนรับค้างเป็นวัน)
 */
let orphanCache: { at: number; ids: number[] } | null = null;
async function orphanSupervisorIds(): Promise<number[]> {
  if (orphanCache && Date.now() - orphanCache.at < 60_000) return orphanCache.ids;
  const ids = await computeOrphanSupervisorIds();
  orphanCache = { at: Date.now(), ids };
  return ids;
}

async function computeOrphanSupervisorIds(): Promise<number[]> {
  const stages = WORK_ORDER_STAGE_ORDER.filter((st) => WORK_ORDER_STAGE_ACTOR[st] === "SUPERVISOR");
  const [rows, sups] = await Promise.all([
    prisma.workOrder.findMany({
      where: { status: { in: stages } },
      select: { id: true, assignedTeam: true, branch: { select: { region: true, zone: true, pmTeam: true } } },
    }),
    prisma.user.findMany({ where: { role: "SUPERVISOR", deletedAt: null }, select: { region: true, supervisedTeams: true } }),
  ]);
  return rows.filter((w) => !sups.some((u) => coversWorkOrder({ region: u.region, teams: u.supervisedTeams }, w))).map((w) => w.id);
}

/** แอดมินทั่วไป (ไม่ใช่ Admin Spare Part) — กล่องงานรวมใบที่ไม่มีหัวหน้าภาครับด้วย */
function inboxTakesOrphans(auth: AuthRequest["auth"]) {
  return auth?.role === "ADMIN" && !auth.partsAdmin;
}

function stagesWaitingOn(auth: AuthRequest["auth"]): string[] {
  // Admin Spare Part ทำอะไรกับใบงานไม่ได้นอกจากตรวจเคลม — "งานของฉัน" จึงมีแค่ใบที่รอตรวจเคลม
  if (auth?.partsAdmin) return ["CLAIM_REVIEW"];
  return WORK_ORDER_STAGE_ORDER.filter(
    (stage) =>
      WORK_ORDER_STAGE_ACTOR[stage] === auth!.role &&
      // ตรวจเคลมเป็นของ Admin Spare Part — แอดมินทั่วไปกดไม่ได้ จึงไม่ควรเห็นในกล่องงานตัวเอง
      (stage !== "CLAIM_REVIEW" || canReviewClaims(auth))
  );
}

/** ตรวจเคลมอะไหล่ได้ไหม — Admin Spare Part (คนเช็คประกัน) และ Super Admin */
function canReviewClaims(auth: AuthRequest["auth"]) {
  return !!(auth?.partsAdmin || auth?.superAdmin);
}

const listQuery = z.object({
  status: z.enum([...WORK_ORDER_STATUSES, "ACTIVE", "ALL", "INBOX"]).default("ACTIVE"),
  assignedTo: z.string().optional(),
  branchCode: z.string().optional(),
  search: z.string().optional(),
});

/**
 * ขอบเขตใบงานที่คนนี้เห็น — แอดมินไม่ต้องถามฐานข้อมูล หัวหน้าภาค/ช่างถามรอบเดียว
 * แยกออกมาให้รายการ ตัวเลขกล่องงาน และการเช็คของใหม่ใช้ชุดเดียวกัน
 */
async function scopeFor(req: AuthRequest): Promise<Prisma.WorkOrderWhereInput> {
  if (req.auth!.role === "ADMIN") return {};
  if (req.auth!.role === "SUPERVISOR") return workOrderInScope(await supervisorScope(req.auth!.userId));
  // ช่างเห็นงานของทีมตัวเอง เพราะงานถูกจ่ายให้ทีม ไม่ได้จ่ายรายคน
  //
  // รวมงานที่เคยจ่ายให้ตัวเองแบบรายคนด้วย — ใบที่ค้างอยู่ตอนเปลี่ยนมา
  // จ่ายเป็นทีม ต้องไม่หายไปจากรายการของคนที่กำลังทำอยู่
  // ช่างที่ยังไม่ได้จัดทีมจึงยังเห็นงานเดิมของตัวเองตามปกติ
  const me = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { team: true } });
  return teamScope(me?.team ?? null, req.auth!.userId);
}

/**
 * เงื่อนไขของรายการใบงานตามตัวกรอง — ใช้ทั้งตัวรายการและ /version (เช็คของใหม่แบบเบา)
 *
 * คำถามที่ไม่ขึ้นต่อกัน (ใบไม่มีคนรับ · รายชื่อ outsource · ขอบเขต) ยิงพร้อมกัน
 * ฐานข้อมูลจริงอยู่คนละ region (ไปกลับรอบละ ~200 ms) — รอทีละคำถามคือรอเป็นวินาที
 */
async function listWhere(req: AuthRequest, q: z.infer<typeof listQuery>) {
  const keyword = q.search?.trim();
  const inboxStages = stagesWaitingOn(req.auth);
  const [orphans, outsourceNow, scope] = await Promise.all([
    inboxTakesOrphans(req.auth) ? orphanSupervisorIds() : Promise.resolve([] as number[]),
    // รีเฟรชก่อนเสมอ — แถวในรายการติดธง outsource จากรายชื่อนี้ (แท็บ "ใบงาน SUB" ของกล่องงานหัวหน้าภาค)
    freshOutsource(),
    scopeFor(req),
  ]);
  // หัวหน้าภาคปิดงานแทนทีม outsource — ใบที่ทีม outsource เข้างานอยู่เข้ากล่องของหัวหน้าภาคด้วย
  const outsourceInbox: Prisma.WorkOrderWhereInput[] =
    req.auth!.role === "SUPERVISOR" ? [{ status: "IN_PROGRESS", assignedTeam: { in: [...outsourceNow] } }] : [];
  const statusFilter =
    q.status === "ALL"
      ? {}
      : q.status === "ACTIVE"
        ? { status: { in: [...ACTIVE_WORK_ORDER_STATUSES] } }
        : q.status === "INBOX"
          ? { OR: [{ status: { in: inboxStages } }, { id: { in: orphans } }, ...outsourceInbox] }
          : q.status === "AWAITING_CONFIRM"
            ? // ชิป "รอคอนเฟิร์มลูกค้า" คือรายการร้านที่แอดมินต้องโทร — นัดตรวจหน้างานก็เป็นการโทรแบบเดียวกัน
              { status: { in: ["AWAITING_CONFIRM", "INSPECT_CONFIRM"] } }
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
  const where: Prisma.WorkOrderWhereInput = {
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
            // หาใบที่ตัวเองหรือเพื่อนเปิดไว้ — คนจำชื่อคนเปิดได้ง่ายกว่ารหัสใบงาน
            { createdBy: { name: { contains: keyword, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  return { where, scope, inboxStages, orphans, outsourceInbox };
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { where, scope, inboxStages, orphans, outsourceInbox } = await listWhere(req, parsed.data);

  /**
   * ตัวเลขบนชิปต้องนับเฉพาะที่คนคนนี้เห็น
   *
   * เดิมนับทั้งระบบโดยไม่สนขอบเขต หัวหน้าภาคจึงเห็นเลขที่รวมใบงานของภาคอื่น
   * แล้วกดเข้าไปเจอรายการสั้นกว่าเลขบนชิป ซึ่งทำให้คนเลิกเชื่อตัวเลขทั้งหน้า
   *
   * รายการ ตัวเลขชิป และรายชื่อหัวหน้าภาค ไม่ขึ้นต่อกัน — ยิงพร้อมกันรอบเดียว (เดิมทีละคำถาม)
   */
  const [rows, counts, outsourceOpen, supervisors] = await Promise.all([
    prisma.workOrder.findMany({
      where,
      select: listSelect,
      // ด่วนขึ้นก่อน แล้วเก่าสุดขึ้นก่อน — ลำดับที่ควรหยิบไปทำ
      // priority เก็บเป็นข้อความ — เรียงจากมากไปน้อยได้ URGENT → NORMAL → LOW พอดี
      // (เดิมเรียงน้อยไปมาก ใบด่วนจึงไปอยู่ท้ายสุด ทั้งที่คอมเมนต์บอกว่า "ด่วนขึ้นก่อน")
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
    prisma.workOrder.groupBy({ by: ["status"], where: scope, _count: true }),
    outsourceInbox.length ? prisma.workOrder.count({ where: { AND: [scope, ...outsourceInbox] } }) : Promise.resolve(0),
    prisma.user.findMany({
      where: { role: "SUPERVISOR", deletedAt: null },
      select: { id: true, name: true, region: true, supervisedTeams: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // ตัวกรอง "รอใคร" กับ "ค้างนานสุด" ทำที่หน้าจอจากรายการนี้ทั้งก้อน (รายการไม่แบ่งหน้า)
  // เซิร์ฟเวอร์จึงแค่เติมข้อมูลที่หน้าจอคิดเองไม่ได้ — คำถามรวดพร้อมกัน ไม่ใช่ทีละแถว
  const ids = rows.map((r) => r.id);
  const [lastMoves, confirms, rollbacks] = await Promise.all([
    ids.length
      ? prisma.workOrderLog.groupBy({
          by: ["workOrderId"],
          where: { workOrderId: { in: ids }, action: { notIn: NON_STAGE_ACTIONS } },
          _max: { createdAt: true },
        })
      : Promise.resolve([]),
    // คนคอนเฟิร์มนัดล่าสุดของแต่ละใบ — เฉพาะใบที่นัดตกลงแล้ว (ดู APPOINTMENT_BY_ACTIONS)
    rows.some((r) => APPOINTMENT_DONE.includes(r.appointmentStatus ?? ""))
      ? prisma.workOrderLog.findMany({
          where: {
            workOrderId: { in: rows.filter((r) => APPOINTMENT_DONE.includes(r.appointmentStatus ?? "")).map((r) => r.id) },
            action: { in: APPOINTMENT_BY_ACTIONS },
            backfilledAt: null,
          },
          orderBy: { createdAt: "desc" },
          distinct: ["workOrderId"],
          select: { workOrderId: true, action: true, user: { select: { name: true } } },
        })
      : Promise.resolve([]),
    // ป้าย ↩ ย้อนขั้นในรายการ — ใบที่เคยย้อนมีไม่มาก ถามประวัติเฉพาะใบเหล่านั้น
    ids.length
      ? prisma.workOrderLog.findMany({
          where: { workOrderId: { in: ids }, action: "ROLLED_BACK" },
          orderBy: { createdAt: "desc" },
          distinct: ["workOrderId"],
          select: { workOrderId: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);
  const confirmedBy = new Map(confirms.map((c) => [c.workOrderId, c.user?.name ?? null]));
  const lastConfirmAction = new Map(confirms.map((c) => [c.workOrderId, c.action]));
  const rolledBackFrom = new Map<number, ReturnType<typeof activeRollback>>();
  if (rollbacks.length) {
    const since = new Date(Math.min(...rollbacks.map((r) => r.createdAt.getTime())));
    const recent = await prisma.workOrderLog.findMany({
      where: { workOrderId: { in: rollbacks.map((r) => r.workOrderId) }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { workOrderId: true, action: true, status: true, note: true, createdAt: true, meta: true, user: { select: { name: true } } },
    });
    const status = new Map(rows.map((r) => [r.id, r.status]));
    for (const r of rollbacks) {
      const mine = recent.filter((l) => l.workOrderId === r.workOrderId);
      const active = activeRollback(status.get(r.workOrderId) ?? "", mine);
      if (active) rolledBackFrom.set(r.workOrderId, active);
    }
  }
  const stageSince = new Map<number, Date>();
  for (const m of lastMoves) if (m._max.createdAt) stageSince.set(m.workOrderId, m._max.createdAt);

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<
    string,
    number
  >;

  res.json({
    rows: rows.map((w) => ({
      ...listShape(w, { supervisors, stageSince }),
      appointmentByName: confirmedBy.get(w.id) ?? null,
      // ลูกค้าขอเปลี่ยนวัน รอหัวหน้าภาคคอนเฟิร์มวันใหม่ — กล่องงานติดป้าย "คอนเฟิร์มวันใหม่" แยกจากรับทราบปล่อยงานปกติ
      rescheduled: w.status === "ASSIGNED" && lastConfirmAction.get(w.id) === "RESCHEDULED",
      // ขั้นที่ย้อนมา (ไม่ได้ย้อน = null) — รายการติดป้าย ↩ ย้อนขั้น
      rolledBackFrom: rolledBackFrom.get(w.id)?.fromLabel ?? null,
    })),
    counts: {
      ...byStatus,
      AWAITING_CONFIRM: (byStatus.AWAITING_CONFIRM ?? 0) + (byStatus.INSPECT_CONFIRM ?? 0),
      ACTIVE: ACTIVE_WORK_ORDER_STATUSES.reduce((n, st) => n + (byStatus[st] ?? 0), 0),
      INBOX: inboxStages.reduce((n, st) => n + (byStatus[st] ?? 0), 0) + orphans.length + outsourceOpen,
    },
  });
});

/**
 * เช็คของใหม่แบบเบา — ลายนิ้วมือของรายการตามตัวกรองเดียวกับ GET /
 *
 * หน้ารายการ/แผนงานเดิมโหลดรายการทั้งก้อน (หลายร้อย KB) ทุก 1 นาทีเพื่อดูว่ามีอะไรเปลี่ยนไหม
 * — กิน bandwidth ของ Render จนเกินโควตา และแย่ง connection กับคนที่กำลังเปิดหน้าอยู่
 * ตอนนี้แอปถามอันนี้ก่อน (ตอบไม่กี่สิบไบต์) ต่างจากครั้งก่อนเมื่อไหร่ค่อยโหลดรายการจริง
 *
 * นับจาก: จำนวนใบ · แก้ใบล่าสุด (updatedAt) · ประวัติล่าสุดของใบในรายการ (แนบรูป ฯลฯ ที่ไม่แตะตัวใบ)
 * · ตัวเลขชิป — อะไรในรายการเปลี่ยน ค่าใดค่าหนึ่งต้องเปลี่ยนด้วย
 */
router.get("/version", requireAuth, async (req: AuthRequest, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { where, scope } = await listWhere(req, parsed.data);
  const [agg, lastLog, counts] = await Promise.all([
    prisma.workOrder.aggregate({ where, _count: true, _max: { updatedAt: true } }),
    prisma.workOrderLog.aggregate({ where: { workOrder: where }, _max: { id: true } }),
    prisma.workOrder.groupBy({ by: ["status"], where: scope, _count: true }),
  ]);
  const chip = counts
    .map((c) => `${c.status}:${c._count}`)
    .sort()
    .join(",");
  res.json({
    version: [agg._count, agg._max.updatedAt?.getTime() ?? 0, lastLog._max.id ?? 0, chip].join("|"),
  });
});

/**
 * หน้า "งานของฉันวันนี้" ของช่าง (เจ้าของงานเลือกแบบ Salesforce ต.ค. 69)
 *
 * ช่างเห็นแค่งานที่ปล่อยให้ทีมตัวเองแล้ว เรียงตามเวลานัด — ไม่ต้องหาในกล่องงาน ไม่เห็นขั้นของแอดมิน/หัวหน้าภาค
 * ใบที่ปิดวันนี้ติดมาด้วย (ขึ้น ✓) ให้ช่างเห็นว่าวันนี้ทำไปกี่งานแล้ว
 * ถึงหน้างานแล้วหรือยังอ่านจากประวัติ ARRIVED หลังถูกปล่อยงานรอบล่าสุด — ไม่เก็บซ้ำในใบงาน
 */
router.get("/my-day", requireAuth, async (req: AuthRequest, res) => {
  const scope = await scopeFor(req);
  const today = bangkokDay(new Date());
  const { from } = bangkokDayRange(today);
  const rows = await prisma.workOrder.findMany({
    where: {
      AND: [scope],
      OR: [{ status: { in: ["IN_PROGRESS", "INSPECTING"] } }, { status: { in: ["DONE", "CLAIM_REVIEW"] }, closedAt: { gte: from } }],
    },
    select: {
      id: true,
      code: true,
      status: true,
      priority: true,
      jobType: true,
      symptom: true,
      title: true,
      contactName: true,
      contactPhone: true,
      scheduledAt: true,
      scheduledTime: true,
      closedAt: true,
      assignedTeam: true,
      branch: { select: { code: true, name: true, latitude: true, longitude: true } },
      machine: { select: { code: true, capacityKg: true } },
      parts: { where: { kind: "WAITING" }, select: { quantity: true, unit: true, sparePart: { select: { name: true } } } },
      // ปล่อยงานรอบล่าสุด + ถึงหน้างาน — ถึงแล้วคือมี ARRIVED หลังปล่อยงาน
      logs: {
        where: { action: { in: ["DISPATCHED", "ARRIVED", "ASSIGNED", "REOPENED", "INSPECT_REQUESTED"] } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { action: true, createdAt: true },
      },
    },
  });
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  res.json({
    today,
    rows: rows
      .map((w) => {
        const sinceRelease = w.logs.findIndex((l) => l.action !== "ARRIVED");
        const arrived = w.logs.slice(0, sinceRelease < 0 ? w.logs.length : sinceRelease).find((l) => l.action === "ARRIVED");
        return {
          id: w.id,
          code: w.code,
          status: w.status,
          inspect: w.status === "INSPECTING",
          done: w.status === "DONE" || w.status === "CLAIM_REVIEW",
          urgent: w.priority === "URGENT",
          jobType: w.jobType,
          symptom: (w.symptom ?? w.title ?? "").split("\n")[0],
          contactName: w.contactName,
          contactPhone: w.contactPhone,
          scheduledAt: day(w.scheduledAt),
          scheduledTime: w.scheduledTime,
          closedAt: w.closedAt,
          team: w.assignedTeam,
          branchCode: w.branch.code,
          branchName: w.branch.name,
          latitude: w.branch.latitude,
          longitude: w.branch.longitude,
          machineCode: w.machine?.code ?? null,
          machineCapacityKg: w.machine?.capacityKg ?? null,
          parts: w.parts.map((p) => ({ name: p.sparePart.name, quantity: p.quantity, unit: p.unit })),
          arrivedAt: arrived?.createdAt ?? null,
        };
      })
      .sort((a, b) => `${a.scheduledAt ?? "9999"} ${a.scheduledTime ?? "99:99"}`.localeCompare(`${b.scheduledAt ?? "9999"} ${b.scheduledTime ?? "99:99"}`)),
  });
});

/**
 * จำนวนใบงานในกล่องของคนที่ถามมา — สำหรับตัวเลขบนเมนูหน้าแรก
 *
 * แยกจาก /work-orders เพราะหน้าแรกอยากได้แค่ตัวเลข ไม่ได้อยากได้รายการ
 * ดึงทั้งรายการมาเพื่อนับคือการโหลดข้อมูลเป็นร้อยใบทิ้งทุกครั้งที่เปิดแอป
 */
router.get("/inbox-count", requireAuth, async (req: AuthRequest, res) => {
  // ขอบเขต · ใบไม่มีคนรับ · รายชื่อ outsource ไม่ขึ้นต่อกัน — ถามพร้อมกัน แล้วนับสองอย่างพร้อมกัน
  const [scope, orphans, outsource] = await Promise.all([
    scopeFor(req),
    inboxTakesOrphans(req.auth) ? orphanSupervisorIds() : Promise.resolve([] as number[]),
    req.auth!.role === "SUPERVISOR" ? freshOutsource() : Promise.resolve(new Set<string>()),
  ]);
  const [waiting, outsourceOpen] = await Promise.all([
    prisma.workOrder.count({ where: { AND: [scope], status: { in: stagesWaitingOn(req.auth) } } }),
    req.auth!.role === "SUPERVISOR"
      ? prisma.workOrder.count({ where: { AND: [scope], status: "IN_PROGRESS", assignedTeam: { in: [...outsource] } } })
      : Promise.resolve(0),
  ]);
  res.json({ inbox: waiting + orphans.length + outsourceOpen });
});

/** ตัวเลือกที่หน้าจอต้องใช้ — สถานะ ความเร่งด่วน ผลงาน และรายชื่อช่าง */
/**
 * รายงานใบงานแยกตามผู้เปิด (เจ้าของงานขอ ต.ค. 69) — ?from=YYYY-MM-DD&to=YYYY-MM-DD&opener=<id|system>&format=json|xlsx
 *
 * แอดมิน (รวม Admin Spare Part · Super Admin) เห็นทุกภาค · หัวหน้าภาคเห็นเฉพาะใบในภาค/ทีมที่ดูแล
 * (ขอบเขตเดียวกับหน้ารายการใบงาน) · ช่างไม่ได้ — เป็นรายงานของคนที่จัดการงาน ไม่ใช่ของคนทำงาน
 * วางก่อน "/:id" ไม่งั้น Express จับ "reports" เป็นรหัสใบงาน
 */
const openerReportQuery = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่เริ่มไม่ถูกต้อง"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่สิ้นสุดไม่ถูกต้อง"),
    opener: z.union([z.literal("system"), z.string().regex(/^\d+$/)]).optional(),
    format: z.enum(["json", "xlsx"]).default("json"),
  })
  .refine((q) => q.from <= q.to, { message: "วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด" })
  // ปีหนึ่งพอสำหรับทุกคำถามที่มีจริง — กันกดเลือกช่วงยาวผิดแล้วเซิร์ฟเวอร์ฟรีหน่วยความจำไม่พอ
  .refine((q) => bkkDayStart(q.to).getTime() - bkkDayStart(q.from).getTime() <= 366 * 24 * 3600_000, {
    message: "เลือกช่วงได้ไม่เกิน 1 ปี",
  });

router.get("/reports/by-opener", requireAuth, async (req: AuthRequest, res) => {
  const role = req.auth!.role;
  if (role !== "ADMIN" && role !== "SUPERVISOR") {
    return res.status(403).json({ error: "รายงานนี้สำหรับแอดมินและหัวหน้าภาค" });
  }
  const parsed = openerReportQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const q = parsed.data;
  const scope = role === "SUPERVISOR" ? workOrderInScope(await supervisorScope(req.auth!.userId)) : null;
  const report = await buildOpenerReport({
    from: q.from,
    to: q.to,
    openerId: q.opener === undefined ? undefined : q.opener === "system" ? null : Number(q.opener),
    scope,
    scopeLabel: scope ? "เฉพาะภาค/ทีมที่ดูแล" : "ทุกภาค",
  });
  if (q.format === "json") {
    const { rows, ...rest } = report;
    return res.json({ ...rest, count: rows.length });
  }
  const stored = saveDocument({
    filename: `ใบงานแยกตามผู้เปิด-${q.from}_${q.to}.xlsx`,
    asciiFilename: `work-orders-by-opener-${q.from}_${q.to}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data: await openerReportWorkbook(report),
    ownerId: req.auth!.userId,
  });
  res.json({ filename: stored.filename, path: documentPath(stored) });
});

/**
 * อะไหล่หมด — สาขาไหนรอของอะไร (เจ้าของงานขอ ต.ค. 69 · src/reports/partsOutReport.ts)
 * format=xlsx = ไฟล์ Excel · ไม่ส่ง = แถว JSON ให้หน้าจอจัดกลุ่มเอง (ตามอะไหล่ / ตามสาขา)
 * แอดมินทุกคน (รวม Admin Spare Part) เห็นทั้งหมด · หัวหน้าภาคเห็นเฉพาะภาค/ทีมที่ดูแล · ช่างไม่เห็น
 */
router.get("/reports/parts-out", requireAuth, async (req: AuthRequest, res) => {
  const role = req.auth!.role;
  if (role !== "ADMIN" && role !== "SUPERVISOR") {
    return res.status(403).json({ error: "รายงานนี้สำหรับแอดมินและหัวหน้าภาค" });
  }
  const scope = role === "SUPERVISOR" ? workOrderInScope(await supervisorScope(req.auth!.userId)) : null;
  const report = await buildPartsOutReport({ scope, scopeLabel: scope ? "เฉพาะภาค/ทีมที่ดูแล" : "ทุกภาค" });
  if (req.query.format !== "xlsx") return res.json(report);
  const stamp = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const stored = saveDocument({
    filename: `อะไหล่หมด-${stamp}.xlsx`,
    asciiFilename: `parts-out-${stamp}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data: await partsOutWorkbook(report),
    ownerId: req.auth!.userId,
  });
  res.json({ filename: stored.filename, path: documentPath(stored) });
});

/**
 * หมายเหตุของแถวสาขา+อะไหล่ในรายงานอะไหล่หมด (เจ้าของงานขอ ต.ค. 69) — ขึ้นเฉพาะหน้ารายงาน ไม่ขึ้นในใบงาน
 * คนที่เห็นรายงานแก้ได้ (แอดมินทุกคน · หัวหน้าภาคเฉพาะภาค/ทีมที่ดูแล) · ข้อความว่าง = ลบหมายเหตุ
 * แก้ได้เฉพาะแถวที่ยังอยู่ในรายงาน — ของเข้าแล้วหรือใบขยับไปขั้นอื่นแล้ว หมายเหตุไม่มีที่ให้เห็นอีก
 */
const partsOutNoteBody = z.object({
  partRowId: z.number().int().positive(),
  note: z.string().max(500, "หมายเหตุยาวได้ไม่เกิน 500 ตัวอักษร"),
});
router.put("/reports/parts-out/note", requireAuth, async (req: AuthRequest, res) => {
  const role = req.auth!.role;
  if (role !== "ADMIN" && role !== "SUPERVISOR") {
    return res.status(403).json({ error: "รายงานนี้สำหรับแอดมินและหัวหน้าภาค" });
  }
  const parsed = partsOutNoteBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const scope = role === "SUPERVISOR" ? workOrderInScope(await supervisorScope(req.auth!.userId)) : null;
  const row = await prisma.workOrderPart.findFirst({
    where: {
      id: parsed.data.partRowId,
      kind: "WAITING",
      inStock: false,
      workOrder: { AND: [scope ?? {}], status: { in: PARTS_OUT_REPORT_STAGES } },
    },
    select: { id: true },
  });
  if (!row) return res.status(404).json({ error: "แถวนี้ไม่อยู่ในรายงานอะไหล่หมดแล้ว — ของอาจเข้าแล้ว ลองรีเฟรชหน้า" });
  const note = parsed.data.note.trim();
  const saved = await prisma.workOrderPart.update({
    where: { id: row.id },
    data: note
      ? { outNote: note, outNoteAt: new Date(), outNoteById: req.auth!.userId }
      : { outNote: null, outNoteAt: null, outNoteById: null },
    select: { outNote: true, outNoteAt: true, outNoteBy: { select: { name: true } } },
  });
  res.json({ note: saved.outNote, noteBy: saved.outNoteBy?.name ?? null, noteAt: saved.outNoteAt });
});

/**
 * สรุปเคสที่คอนเฟิร์มลูกค้าแล้ว — แอดมินคัดลอกส่งกลุ่มไลน์ช่าง (เจ้าของงานขอ ต.ค. 69)
 *
 * by=confirm (ค่าเริ่มต้น): เคสที่คอนเฟิร์ม/เลื่อนนัดครั้งล่าสุดในวันนั้น (ตามประวัติ · วันตามเวลาไทย)
 *   ครั้งล่าสุดเท่านั้น — เคสที่คอนเฟิร์มเมื่อวานแล้ววันนี้ลูกค้าขอเลื่อน ต้องขึ้นในสรุปวันนี้ ไม่ใช่สองวัน
 * by=visit: คิวที่นัดเข้างานวันนั้น
 * นับเฉพาะนัดที่ยังตกลงอยู่ (appointmentStatus) และใบที่ไม่ถูกยกเลิก — ย้อนขั้นหลังคอนเฟิร์ม นัดกลับเป็นรอ ไม่ขึ้นเอง
 * หัวหน้าภาคเห็นเฉพาะภาค/ทีมที่ดูแล เหมือนรายงานอื่น
 */
const confirmedQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ไม่ถูกต้อง"),
  by: z.enum(["confirm", "visit"]).default("confirm"),
});

router.get("/reports/confirmed", requireAuth, async (req: AuthRequest, res) => {
  const role = req.auth!.role;
  if (role !== "ADMIN" && role !== "SUPERVISOR") {
    return res.status(403).json({ error: "รายงานนี้สำหรับแอดมินและหัวหน้าภาค" });
  }
  const parsed = confirmedQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const { date, by } = parsed.data;
  const dayStart = bkkDayStart(date);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const scope = role === "SUPERVISOR" ? workOrderInScope(await supervisorScope(req.auth!.userId)) : {};

  const orders = await prisma.workOrder.findMany({
    where: {
      AND: [scope],
      isTest: false,
      status: { not: "CANCELLED" },
      appointmentStatus: { in: APPOINTMENT_DONE },
      scheduledAt: { not: null },
      ...(by === "visit" ? { scheduledAt: { gte: new Date(`${date}T00:00:00.000Z`), lt: new Date(`${date}T23:59:59.999Z`) } } : {}),
    },
    select: {
      id: true, code: true, status: true, assignedTeam: true, scheduledAt: true, scheduledTime: true,
      symptom: true, contactName: true, contactPhone: true,
      branch: { select: { code: true, name: true, zone: true, latitude: true, longitude: true } },
      machine: { select: { code: true, capacityKg: true } },
    },
  });
  // คนคอนเฟิร์มล่าสุดของแต่ละใบ (และเวลา) — ไม่นับแถวที่ปิดงานย้อนหลังสร้าง (ดู APPOINTMENT_BY_ACTIONS)
  const confirms = orders.length
    ? await prisma.workOrderLog.findMany({
        where: { workOrderId: { in: orders.map((o) => o.id) }, action: { in: APPOINTMENT_BY_ACTIONS }, backfilledAt: null },
        orderBy: { createdAt: "desc" },
        distinct: ["workOrderId"],
        select: { workOrderId: true, createdAt: true, status: true, user: { select: { name: true } } },
      })
    : [];
  const last = new Map(confirms.map((c) => [c.workOrderId, c]));
  const inspectStages = ["INSPECT_CONFIRM", "INSPECT_DISPATCH", "INSPECTING"];
  const rows = orders
    .map((o) => {
      const c = last.get(o.id);
      return {
        id: o.id,
        code: o.code,
        // งานตรวจ: ยังอยู่ขั้นตรวจ หรือคอนเฟิร์มแล้วส่งต่อไปขั้นตรวจ (ใบที่ตรวจเสร็จกลับไประบุอะไหล่แล้วนับเป็นซ่อม)
        kind: inspectStages.includes(o.status) ? ("INSPECT" as const) : ("REPAIR" as const),
        team: o.assignedTeam ?? o.branch.zone ?? null,
        scheduledAt: o.scheduledAt!.toISOString().slice(0, 10),
        scheduledTime: o.scheduledTime,
        branchCode: o.branch.code,
        branchName: o.branch.name,
        // พิกัดสาขา — ข้อความไลน์ใส่ลิงก์แผนที่ให้ช่าง (มีเฉพาะสาขาที่เคยบันทึกพิกัด)
        latitude: o.branch.latitude,
        longitude: o.branch.longitude,
        machineCode: o.machine?.code ?? null,
        machineCapacityKg: o.machine?.capacityKg ?? null,
        // บรรทัดแรก — บรรทัดสาเหตุ/แก้ไขเป็นเรื่องภายใน (เหมือนข้อความแจ้งลูกค้า)
        symptom: (o.symptom ?? "").split("\n")[0].trim() || null,
        contactName: o.contactName,
        contactPhone: o.contactPhone,
        status: o.status,
        statusLabel: WORK_ORDER_STATUS_LABELS[o.status] ?? o.status,
        confirmedBy: c?.user?.name ?? null,
        confirmedAt: c?.createdAt ?? null,
      };
    })
    .filter((r) => by === "visit" || (r.confirmedAt && r.confirmedAt >= dayStart && r.confirmedAt < dayEnd))
    .sort(
      (a, b) =>
        (a.team ?? "~").localeCompare(b.team ?? "~", "th") ||
        a.scheduledAt.localeCompare(b.scheduledAt) ||
        (a.scheduledTime ?? "99:99").localeCompare(b.scheduledTime ?? "99:99") ||
        a.code.localeCompare(b.code)
    );
  res.json({ date, by, rows });
});

router.get("/options", requireAuth, async (_req, res) => {
  await freshOutsource();
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
    sendBackReasons: SEND_BACK_REASONS.map((v) => ({ value: v, label: SEND_BACK_REASON_LABELS[v] })),
    appointmentStatuses: APPOINTMENT_STATUSES.map((v) => ({
      value: v,
      label: APPOINTMENT_STATUS_LABELS[v],
    })),
    // สถานะการดำเนินการของเคส ชุดเดียวกับที่กระดานเคยใช้
    workStatuses: WORK_STATUSES.map((v) => ({ value: v, label: WORK_STATUS_LABELS[v] })),
    warehouses: WAREHOUSES,
    // คลังเดียวที่แอดมินเบิกเองได้ — คลังอื่นส่งให้หัวหน้าภาคเบิก (ขั้น PARTS_PICKUP)
    adminWarehouse: ADMIN_WAREHOUSE,
    jobTypes: JOB_TYPES.map((v) => ({
      value: v,
      label: JOB_TYPE_LABELS[v],
      hint: JOB_TYPE_HINTS[v],
    })),
    // ทีมช่างมาจากทะเบียนสาขา (Branch.zone = คอลัมน์ "ทีมช่าง" ในไฟล์)
    // ส่งมาที่เดียวกับตัวเลือกอื่น หน้าจอจะได้ไม่ต้องยิงเพิ่มอีกรอบตอนเปิดฟอร์ม
    teams: [
      // ทีมที่ดูแลสาขาแต่เป็นบริษัทภายนอก (เช่น PWS) ก็ติดป้าย outsource — หัวหน้าภาคปิดงานแทนเหมือนกัน
      ...teams.map(([name, branches]) => ({ name, branches, ...(isOutsourceTeam(name) ? { outsource: true } : {}) })),
      // ทีม outsource ต่อท้าย พร้อมป้าย — รับงานเป็นครั้ง ๆ ไม่มีสาขาประจำ
      ...outsourceList()
        .filter((n) => !teams.some(([t]) => t === n))
        .sort((a, b) => a.localeCompare(b, "th"))
        .map((name) => ({ name, branches: 0, outsource: true })),
    ],
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
      // ชื่อบนแถบขั้นตอน: ขั้นที่ยังไม่ผ่านใช้การกระทำ (คนทำอยู่ใต้ชื่อ) · ผ่านแล้วใช้ "…แล้ว"
      action: WORK_ORDER_STAGE_ACTIONS[v] ?? WORK_ORDER_STATUS_LABELS[v],
      doneLabel: WORK_ORDER_STAGE_DONE[v] ?? WORK_ORDER_STATUS_LABELS[v],
      actor: WORK_ORDER_STAGE_ACTOR[v] ?? null,
      actorLabel: WORK_ORDER_STAGE_ACTOR[v]
        ? ROLE_LABELS[WORK_ORDER_STAGE_ACTOR[v]] ?? null
        : null,
    })),
    technicians,
  });
});

/**
 * รุ่นข้อมูลของใบงาน — หน้าใบงานถามทุก ~20 วินาทีว่ามีใครเปลี่ยนอะไรไหม (เจ้าของงานขอ ต.ค. 69)
 *
 * ทุกการเปลี่ยนแปลงลงประวัติ เลขประวัติล่าสุดจึงเป็นรุ่นของใบงานโดยไม่ต้องเพิ่มคอลัมน์ ·
 * ตอบเล็กที่สุดที่บอกได้ว่า "ใครเปลี่ยนอะไร" — เดิมสองคนเปิดใบเดียวกัน อีกคนเห็นของเก่าจนรีเฟรชเบราว์เซอร์
 */
router.get("/:id/version", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const [wo, last] = await Promise.all([
    prisma.workOrder.findUnique({ where: { id }, select: { status: true, ...VIEW_SELECT } }),
    prisma.workOrderLog.findFirst({
      where: { workOrderId: id },
      orderBy: { id: "desc" },
      select: { id: true, action: true, userId: true, createdAt: true, user: { select: { name: true } } },
    }),
  ]);
  if (!wo) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (await blockedForViewer(req, res, wo)) return;
  res.json({
    v: last?.id ?? 0,
    byId: last?.userId ?? null,
    byName: last?.user?.name ?? null,
    actionLabel: last ? WORK_ORDER_ACTION_LABELS[last.action] ?? last.action : null,
    at: last?.createdAt ?? null,
    status: wo.status,
    statusLabel: WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status,
  });
});

/**
 * ใครคอนเฟิร์มนัดกับลูกค้า (เจ้าของงานขอ ต.ค. 69) — คนกดคอนเฟิร์ม/เลื่อนนัดครั้งล่าสุด อ่านจากประวัติ ไม่เก็บซ้ำ
 * ไม่นับประวัติที่ "ปิดงานย้อนหลัง" สร้างให้ (backfilledAt) — คนกดปิดย้อนหลังไม่ได้เป็นคนคุยกับร้าน
 * โชว์เฉพาะนัดที่ตกลงแล้ว — ยังรอคอนเฟิร์มอยู่ ชื่อของรอบก่อนจะทำให้เข้าใจผิดว่าคอนเฟิร์มแล้ว
 */
const APPOINTMENT_BY_ACTIONS = ["CONFIRMED", "RESCHEDULED"];
const APPOINTMENT_DONE = ["CONFIRMED", "ADMIN_PICKED"];

/**
 * หน้าใบงานทั้งก้อน — GET /:id กับทุกปุ่มที่เปลี่ยนขั้นส่งก้อนเดียวกันนี้กลับ
 *
 * เดิมปุ่มเปลี่ยนขั้นส่ง shape(row) เปล่า ๆ (ไม่มีประวัติเต็ม/ค่าก่อนย้อน) แอปเลยทิ้งแล้วโหลดใบงานใหม่อีกรอบ
 * ฐานข้อมูลอยู่คนละภูมิภาค (~0.23 วิ/รอบ) โหลดซ้ำคือรอเพิ่มอีกเกือบวินาทีกว่าทามไลน์จะขึ้น (เจ้าของงานถาม ต.ค. 69)
 * ตอนนี้ส่งก้อนที่ครบแล้วแอปใช้เลย (mobile/src/utils/freshOrder.ts) · ใบงานกับประวัติอ่านพร้อมกัน ไม่ต่อคิว
 */
async function loadDetail(id: number) {
  const [row, logs] = await Promise.all([
    prisma.workOrder.findUnique({ where: { id }, include: detailInclude }),
    prisma.workOrderLog.findMany({
      where: { workOrderId: id },
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: "desc" },
    }),
    // รายชื่อทีม outsource จำไว้ไม่เกินนาทีละครั้ง — shape() ใช้ตัดสินว่าเป็นใบงาน SUB ไหม
    freshOutsource(),
  ]);
  return row ? { row, logs } : null;
}

type Detail = NonNullable<Awaited<ReturnType<typeof loadDetail>>>;

function detailBody({ row, logs }: Detail) {
  // รอบปัจจุบันเริ่มตั้งแต่ถูกจ่ายให้ทีมครั้งล่าสุด — อ่านจากประวัติที่ดึงมาแล้ว
  // ไม่ต้องยิงถามฐานข้อมูลซ้ำ (logs เรียงใหม่ก่อนเก่าอยู่แล้ว)
  const roundStart =
    logs.find((l) => l.action === "ASSIGNED" || l.action === "REOPENED")?.createdAt ??
    row.createdAt;
  const inspectStart = logs.find((l) => l.action === "INSPECT_REQUESTED")?.createdAt ?? row.createdAt;

  const confirm = logs.find((l) => APPOINTMENT_BY_ACTIONS.includes(l.action) && !l.backfilledAt);
  return {
    ...shape(row, roundStart, inspectStart),
    appointmentBy:
      confirm && APPOINTMENT_DONE.includes(row.appointmentStatus ?? "")
        ? { name: confirm.user?.name ?? null, at: confirm.createdAt }
        : null,
    // ย้อนขั้นมา (ป้าย/กล่องบนหน้าใบงาน) และค่าเดิมก่อนย้อนให้ฟอร์มเติม — ดู utils/rollback.ts
    rolledBack: activeRollback(row.status, logs),
    rollbackPrefill: rollbackPrefill(row.status, logs),
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      actionLabel: WORK_ORDER_ACTION_LABELS[l.action] ?? l.action,
      status: l.status,
      statusLabel: WORK_ORDER_STATUS_LABELS[l.status] ?? l.status,
      note: l.note,
      byName: l.user?.name ?? null,
      // บทบาทของคนกด ณ ตอนนี้ — ประวัติใช้ติดป้ายและสีจุด (เลื่อนตำแหน่งทีหลังป้ายเปลี่ยนตาม ยอมรับได้)
      byRole: l.user?.role ?? null,
      createdAt: l.createdAt,
    })),
  };
}

async function detailFor(id: number) {
  const d = await loadDetail(id);
  if (!d) throw new Error(`ไม่พบใบงาน ${id}`);
  return detailBody(d);
}

router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const d = await loadDetail(id);
  if (!d) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (await blockedForViewer(req, res, d.row)) return;
  res.json(detailBody(d));
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
  workStatus: z.enum(STORABLE_WORK_STATUSES).nullable().optional(),
  // อะไหล่ที่รออยู่ ส่งมาทั้งชุดเสมอ — ตัวที่ไม่เปลี่ยนเก็บผลเช็คเดิมไว้ (mergeWaitingParts) ส่ง [] คือล้างออกหมด
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
              // เปิดใหม่อยู่ขั้นแรก — สถานะเดียวที่ยกมาได้คือที่คนตั้งเอง (รอลูกค้า) ที่เหลือระบบตั้งตามขั้น
              workStatus: manualOrNull(body.workStatus),
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
  workStatus: z.enum(STORABLE_WORK_STATUSES).nullable().optional(),
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
  // อะไหล่ที่รออยู่ ส่งมาทั้งชุดเสมอ — ตัวที่ไม่เปลี่ยนเก็บผลเช็คเดิมไว้ (mergeWaitingParts) ส่ง [] คือล้างออกหมด
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
          // ค่าบนกระดานอาจเป็นอะไรก็ได้ ("รออะไหล่" จากเมื่อเดือนก่อน) — ใบงานใหม่อยู่ขั้นแรก ยกมาเฉพาะที่คนตั้งเอง
          workStatus: manualOrNull(body.workStatus !== undefined ? body.workStatus : outage.workStatus),
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
  symptom: z.string().trim().max(500).nullable().optional(),
  workStatus: z.enum(STORABLE_WORK_STATUSES).nullable().optional(),
  // เลขประวัติล่าสุดตอนเปิดฟอร์ม — มีคนอื่นเปลี่ยนใบงานหลังจากนั้น ไม่ให้บันทึกทับเงียบ ๆ
  expectedVersion: z.number().int().nonnegative().optional(),
  // เหตุผลที่ตั้ง "รอลูกค้า" — บังคับ คนอื่นที่เปิดใบงานต้องรู้ว่ารอลูกค้าเรื่องอะไร
  workStatusNote: z.string().trim().max(300).optional(),
  // หัวหน้าภาคแก้ได้ทุกอย่างตอนช่างส่งกลับ — ผู้ติดต่อเปลี่ยนบ่อย (พนักงานร้านเปลี่ยนกะ)
  contactName: z.string().trim().max(120).nullable().optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),
});

/**
 * ช่องที่เคยแก้ได้ทางนี้ แต่ต้องผ่านปุ่มขั้นตอน (ตรวจระบบ ต.ค. 69) — แอปไม่เคยส่ง แต่เซิร์ฟเวอร์เคยรับ:
 * ช่างตั้งตัวเองเป็นผู้รับงานใบทีมอื่นแล้วปิดงานแทนได้ · เพิ่มอะไหล่ข้ามการเช็คคลัง/เสนอราคา · ตั้งวันนัดข้ามการคอนเฟิร์มลูกค้า
 * ปฏิเสธตรง ๆ ไม่ทิ้งเงียบ — คนที่ยิงมาจะได้รู้ว่าต้องไปทางไหน
 */
const STAGE_ONLY_FIELDS: Record<string, string> = {
  assignedToId: "ผู้รับงานเปลี่ยนที่ขั้นจ่ายงาน",
  scheduledAt: "วันนัดเปลี่ยนที่ขั้นจ่ายงาน/คอนเฟิร์มลูกค้า",
  waitingParts: "อะไหล่เปลี่ยนที่ขั้นระบุอะไหล่",
};

router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });

  const stageOnly = Object.keys(req.body ?? {}).filter((k) => STAGE_ONLY_FIELDS[k]);
  if (stageOnly.length) {
    return res.status(400).json({ error: `แก้ทางนี้ไม่ได้ — ${stageOnly.map((k) => STAGE_ONLY_FIELDS[k]).join(" · ")}` });
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const body = parsed.data;

  const current = await prisma.workOrder.findUnique({
    where: { id },
    select: { status: true, workStatus: true, ...VIEW_SELECT },
  });
  if (!current) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  // แก้ได้เฉพาะใบที่เปิดดูได้ — เดิมใครก็แก้ใบไหนก็ได้ (ตรวจระบบ ต.ค. 69)
  if (await blockedForViewer(req, res, current)) return;
  if (current.status === "DONE" || current.status === "CANCELLED") {
    return res.status(400).json({ error: "ใบงานนี้ปิดไปแล้ว แก้ไขไม่ได้" });
  }

  /**
   * มีคนอื่นเปลี่ยนใบงานหลังเปิดฟอร์ม — ปฏิเสธ ไม่ให้บันทึกทับ (เดิมคนกดทีหลังทับของอีกคนเงียบ ๆ)
   * ของที่ตัวเองทำ (แนบรูประหว่างนั้น) ไม่นับ · แอปรุ่นเก่าไม่ส่ง expectedVersion มา = ไม่เช็ค
   */
  if (body.expectedVersion !== undefined) {
    const newer = await prisma.workOrderLog.findFirst({
      where: { workOrderId: id, id: { gt: body.expectedVersion }, NOT: { userId: req.auth!.userId } },
      orderBy: { id: "desc" },
      select: { createdAt: true, user: { select: { name: true } } },
    });
    if (newer) {
      const at = newer.createdAt.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
      return res.status(409).json({
        error: `${newer.user?.name ?? "มีคน"} แก้ใบงานนี้ไปแล้ว (${at} น.) — โหลดข้อมูลใหม่ให้แล้ว ตรวจแล้วบันทึกอีกครั้ง`,
        stale: true,
      });
    }
  }

  /**
   * สถานะ — คนตั้งได้แค่ "อัตโนมัติ" (null) กับที่อยู่ใน MANUAL_WORK_STATUSES พร้อมเหตุผล
   *
   * ส่งค่าเดิมกลับมาเฉย ๆ ไม่นับว่าแก้ (แอปรุ่นเก่าส่งสถานะเดิมมาทุกครั้งที่กดบันทึกอาการ)
   * ค่าอื่นปฏิเสธ — ต้องเปลี่ยนผ่านปุ่มขั้นตอน ไม่งั้นใบงานบอกว่ารออะไหล่ทั้งที่ไม่มีของหมด
   */
  let nextWorkStatus: string | null | undefined = undefined;
  if (body.workStatus !== undefined && body.workStatus !== current.workStatus) {
    const manual = body.workStatus !== null && (MANUAL_WORK_STATUSES as readonly string[]).includes(body.workStatus);
    if (body.workStatus !== null && !manual) {
      return res.status(400).json({
        error: `"${WORK_STATUS_LABELS[body.workStatus] ?? body.workStatus}" ระบบตั้งตามขั้นของใบงาน แก้เองไม่ได้ — ใช้ปุ่มขั้นตอนของใบงานแทน`,
      });
    }
    if (manual && !body.workStatusNote) {
      return res.status(400).json({ error: "ต้องบอกเหตุผล — คนอื่นที่เปิดใบงานต้องรู้ว่ารอลูกค้าเรื่องอะไร" });
    }
    nextWorkStatus = manual ? body.workStatus : await autoWorkStatus(id, current.status);
  }

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.detail !== undefined ? { detail: body.detail?.trim() || null } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.symptom !== undefined ? { symptom: body.symptom?.trim() || null } : {}),
        ...(nextWorkStatus !== undefined ? { workStatus: nextWorkStatus } : {}),
        ...(body.contactName !== undefined ? { contactName: body.contactName?.trim() || null } : {}),
        ...(body.contactPhone !== undefined ? { contactPhone: body.contactPhone?.trim() || null } : {}),
      },
    });

    // อาการกับสถานะเป็นสิ่งที่กระดานแสดง จึงต้องส่งต่อไปที่เคส
    const touchedNote = body.symptom !== undefined || nextWorkStatus !== undefined;
    if (touchedNote) await syncOutageFromWorkOrder(tx, id, req.auth!.userId);

    await writeLog(tx, id, req.auth!.userId, "EDITED", current.status);
    // เปลี่ยนสถานะลงประวัติแยก บอกจากอะไรเป็นอะไรและเพราะอะไร — มั่วแล้วตามย้อนได้ว่าใครแก้
    if (nextWorkStatus !== undefined && nextWorkStatus !== current.workStatus) {
      const label = (v: string | null) => (v ? WORK_STATUS_LABELS[v] ?? v : "ไม่มี");
      const manual = nextWorkStatus !== null && (MANUAL_WORK_STATUSES as readonly string[]).includes(nextWorkStatus);
      await writeLog(
        tx,
        id,
        req.auth!.userId,
        "STATUS_CHANGED",
        current.status,
        manual
          ? `${label(current.workStatus)} → ${label(nextWorkStatus)} — ${body.workStatusNote}`
          : `${label(current.workStatus)} → อัตโนมัติตามขั้น (${label(nextWorkStatus)})`
      );
    }
  }, STAGE_TX);

  res.json(await detailFor(id));
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
  /** หลายขั้นได้ — ปุ่มเดียวที่ใช้ได้สองขั้น (นัดซ่อม/นัดตรวจ) ไม่ต้องอ่านสถานะก่อนเรียกอีกรอบ */
  expected: string | readonly string[]
): Promise<{
  id: number;
  status: string;
  assignedToId: number | null;
  assignedTeam: string | null;
  scheduledAt: Date | null;
  scheduledTime: string | null;
  outageId: number | null;
} | null> {
  const role = req.auth!.role;
  // ขอบเขตหัวหน้าภาคอ่านพร้อมใบงาน ไม่ต่อคิวกัน — ฐานข้อมูลอยู่ไกล รอบละ ~0.23 วิ (ต.ค. 69)
  const [wo, scope] = await Promise.all([
    prisma.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        status: true,
        assignedToId: true,
        assignedTeam: true,
        scheduledAt: true,
        scheduledTime: true,
        outageId: true,
        branch: { select: { region: true, zone: true, pmTeam: true } },
      },
    }),
    role === "SUPERVISOR" ? supervisorScope(req.auth!.userId) : null,
  ]);
  if (!wo) {
    res.status(404).json({ error: "ไม่พบใบงานนี้" });
    return null;
  }

  if (scope) {
    if (!coversWorkOrder(scope, wo)) {
      res.status(403).json({ error: OUT_OF_SCOPE });
      return null;
    }
  }

  const allowed: readonly string[] = typeof expected === "string" ? [expected] : expected;
  if (!allowed.includes(wo.status)) {
    res.status(409).json({
      error: `${wo.code} อยู่ขั้น "${WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status}" ยังไม่ถึงขั้นนี้`,
      status: wo.status,
    });
    return null;
  }

  if (!canActOnStage(role, wo.status)) {
    const actor = WORK_ORDER_STAGE_ACTOR[wo.status];
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
    // ปุ่มส่วนใหญ่ต้องใช้ทีม/วันนัดต่อ — คืนไปเลย ไม่ต้องอ่านใบงานซ้ำอีกรอบ
    scheduledAt: wo.scheduledAt,
    scheduledTime: wo.scheduledTime,
    outageId: wo.outageId,
  };
}

/**
 * เปลี่ยนขั้น + เขียนประวัติ ในคำสั่ง SQL เดียว — ปุ่มที่แค่แก้ช่องในใบงานแล้วลงประวัติหนึ่งบรรทัด
 *
 * ทำไม: ฐานข้อมูลอยู่คนละภูมิภาค (~0.23 วิ/รอบ) ทรานแซกชันแบบเดิมคือ BEGIN · UPDATE · INSERT · COMMIT
 * สี่รอบ เหลือหนึ่ง (เจ้าของงานถามว่าทำไมบันทึกแล้วทามไลน์ขึ้นช้า ต.ค. 69) · คำสั่งเดียวในฐานข้อมูล
 * เป็นทั้งหมดหรือไม่มีเลยอยู่แล้ว ไม่ต้องห่อทรานแซกชัน
 *
 * WHERE status = from — ถ้ามีคนกดขั้นนี้ไปก่อนเสี้ยววินาที จะไม่เขียนทับ คืน false ให้ตอบ 409
 * (เดิมเช็คสถานะแล้วค่อยเขียน มีช่องว่างตรงกลาง) · วันที่ส่งเป็นเวลา UTC แบบที่ Prisma เขียน
 * ไม่พึ่งเขตเวลาของเซิร์ฟเวอร์ฐานข้อมูล · ใบที่ผูกกับเคสเครื่องเสียยังใช้ทรานแซกชันเดิม (ต้องซิงก์เคสด้วย)
 */
type StageValue = string | number | Date | null;
const STAGE_COLUMNS = new Set([
  "status", "workStatus", "assignedTeam", "assignedToId", "scheduledAt", "scheduledTime", "appointmentStatus",
]);
async function moveStage(
  id: number,
  from: string,
  /** undefined = ไม่แตะช่องนั้น (เหมือน Prisma update) */
  data: Record<string, StageValue | undefined>,
  log: { userId: number | undefined; action: string; status: string; note?: string | null }
): Promise<boolean> {
  const now = new Date().toISOString();
  const val = (v: StageValue) =>
    v instanceof Date ? Prisma.sql`CAST(${v.toISOString()} AS timestamp(3))` : v === null ? Prisma.sql`NULL` : Prisma.sql`${v}`;
  const sets = Object.entries(data).flatMap(([k, v]) => {
    if (v === undefined) return [];
    // ชื่อคอลัมน์มาจากโค้ดเท่านั้น — กันพิมพ์ผิดแล้วไปแก้คอลัมน์ที่ไม่ตั้งใจ
    if (!STAGE_COLUMNS.has(k)) throw new Error(`moveStage: ไม่รู้จักคอลัมน์ ${k}`);
    return [Prisma.sql`${Prisma.raw(`"${k}"`)} = ${val(v)}`];
  });
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    WITH moved AS (
      UPDATE "WorkOrder"
      SET ${Prisma.join(sets)}, "updatedAt" = CAST(${now} AS timestamp(3))
      WHERE "id" = ${id} AND "status" = ${from}
      RETURNING "id"
    )
    INSERT INTO "WorkOrderLog" ("workOrderId", "userId", "action", "status", "note", "createdAt")
    SELECT "id", CAST(${log.userId ?? null} AS integer), CAST(${log.action} AS text), CAST(${log.status} AS text),
           CAST(${log.note ?? null} AS text), CAST(${now} AS timestamp(3))
    FROM moved
    RETURNING "id"`;
  // ใบขยับขั้น = ชุด "ไม่มีคนรับ" อาจเปลี่ยน — เหมือน writeLog
  orphanCache = null;
  return rows.length > 0;
}

/** มีคนกดขั้นนี้ไปก่อน — แอปโหลดใบงานใหม่เองเมื่อได้ 409 (api/client.ts) */
function stageMoved(res: Response) {
  res.status(409).json({ error: "ใบงานนี้ถูกเปลี่ยนขั้นไปแล้ว — โหลดใหม่ให้แล้ว ลองดูอีกครั้ง" });
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
  // อะไหล่นอกสโตร์ที่พิมพ์ชื่อเอง — ไม่มี SKU (ดู resolveOffParts) · มีแต่ของนอกสโตร์อย่างเดียวก็ได้
  offParts: z.array(offPartInput).max(20).optional(),
  // ค่าบริการที่ต้องเสนอราคาลูกค้า (ค่าแรง ค่าเดินทาง) — ใส่ได้ทั้งตอนใช้และไม่ใช้อะไหล่ · ส่งมาทั้งชุดแทนของเดิม
  services: z
    .array(
      z.object({
        name: z.string().trim().min(1, "ค่าบริการต้องมีชื่อรายการ").max(120),
        quantity: z.number().int().min(1).max(999).default(1),
        unit: z.string().trim().max(20).nullable().optional(),
        note: z.string().trim().max(300).nullable().optional(),
      })
    )
    .max(20)
    .optional(),
  note: z.string().trim().max(500).optional(),
  /**
   * ไม่ใช้อะไหล่ → จ่ายงานในฟอร์มเดียวกันเลย (เจ้าของงานเลือก ต.ค. 69 — เดิมหัวหน้าภาคกดสองครั้งติดกัน)
   * ใช้ได้เฉพาะตอนที่ขั้นถัดไปคือจ่ายงาน (ไม่มีค่าบริการให้เสนอราคา) · ไม่ส่งมา = ไปรอจ่ายงานตามเดิม
   */
  assign: z
    .object({
      team: z.string().trim().min(1).max(120),
      scheduledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ต้องระบุวันเข้างาน"),
      scheduledTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    })
    .optional(),
});

router.post("/:id/parts", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = partsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const cur = await guardStage(req, res, id, "NEW");
  if (!cur) return;

  const { needsParts, note } = parsed.data;
  if (needsParts && !parsed.data.parts?.length && !parsed.data.offParts?.length) {
    return res.status(400).json({ error: "บอกว่าต้องใช้อะไหล่ ต้องระบุอย่างน้อยหนึ่งรายการ" });
  }
  const assign = parsed.data.assign;
  /**
   * ทุกอย่างที่ต้องอ่านก่อนตัดสิน อ่านพร้อมกันรอบเดียว ไม่ต่อคิวทีละอย่าง — ฐานข้อมูลอยู่ไกล
   * รอบละ ~0.23 วิ เดิมห้ารอบต่อกัน (เจ้าของงานถามว่าทำไมบันทึกช้า ต.ค. 69) · ไม่มีตัวไหนขึ้นต่อกัน
   */
  const [offLines, wo, before, knownTeam, teamText] = await Promise.all([
    needsParts ? resolveOffParts(parsed.data.offParts) : Promise.resolve([]),
    prisma.workOrder.findUniqueOrThrow({
      where: { id },
      select: {
        branch: { select: { code: true, openedAt: true, warrantyExpiresAt: true } },
        machine: { select: { brand: true, model: true } },
      },
    }),
    prisma.workOrderPart.findMany({
      where: { workOrderId: id, kind: "WAITING" },
      select: { sparePartId: true, quantity: true, inStock: true, requisitionNo: true },
    }),
    assign ? knownCmTeam(assign.team) : Promise.resolve(true),
    assign ? teamNote(id, assign.team, "จ่ายงานให้") : Promise.resolve(""),
  ]);
  // รวมเป็นรายการเดียวกันตั้งแต่ตรงนี้ — ข้างล่างไม่ต้องรู้ว่าตัวไหนมี SKU
  const parts: PartLine[] = needsParts ? [...(parsed.data.parts ?? []), ...offLines] : [];

  /**
   * ตัดสินตั้งแต่ตรงนี้ว่าต้องเสนอราคาก่อนไหม
   *
   * เงื่อนไขทั้งสามข้อ (สาขาแฟรนไชส์ · ใช้อะไหล่ · หมดประกัน) รู้ครบแล้วตั้งแต่
   * หัวหน้าภาคระบุอะไหล่ ไม่ต้องรอผลเช็คสต็อก — และต้องตัดสินตรงนี้ เพราะ
   * ขั้นเสนอราคาอยู่ก่อนเบิกอะไหล่แล้ว ไม่ใช่หลัง (ใบงานอ่านไว้แล้วข้างบน)
   */
  /**
   * อะไหล่นอกหรือค่าบริการ = ของที่ลูกค้าต้องจ่าย หัวหน้าช่างเป็นคนรู้ — เสนอราคาเสมอ (เจ้าของงานเลือก ต.ค. 69)
   * ไม่รอกฎแฟรนไชส์/ประกัน ซึ่งเขียนไว้สำหรับของในสโตร์ที่บริษัทออกให้ได้ระหว่างประกัน
   */
  const services = parsed.data.services ?? [];
  const asked = services.length > 0 || (needsParts && (parsed.data.offParts?.length ?? 0) > 0);
  const quoteFirst =
    asked ||
    (needsParts &&
    needsCustomerQuote({
      branchCode: wo.branch.code,
      needsParts: true,
      openedAt: wo.branch.openedAt,
      warrantyExpiresAt: wo.branch.warrantyExpiresAt,
      machineBrand: machineMake(wo.machine),
    }));

  /**
   * ทุกตัวเบิกไปแล้วตั้งแต่รอบก่อน (ช่างส่งกลับด้วยเหตุอื่นที่ไม่ใช่อะไหล่) — ไม่มีอะไรให้เช็ค
   * หรือเสนอราคาเพิ่ม ไปจ่ายงานรอบใหม่เลย ไม่งั้นแอดมินต้องกดผ่านขั้นที่ไม่มีงานให้ทำ
   */
  const allIssued =
    !!needsParts &&
    parts.every((p) => {
      const was = before.find((b) => b.sparePartId === p.sparePartId);
      return !!was && was.quantity === p.quantity && isIssued(was);
    });

  // ต้องเสนอราคา → เช็คอะไหล่ก่อน (รอเบิกอะไหล่) แล้วค่อยเสนอราคาด้วยของที่มีจริง
  // ไม่ใช้อะไหล่แต่มีค่าบริการ → ตรงไปเสนอราคา (ไม่มีอะไหล่ให้เช็ค) · จ่ายเงินแล้วไปจ่ายงานเลย (ดู afterPayment)
  const nextStatus =
    !needsParts || allIssued
      ? services.length > 0
        ? "AWAITING_QUOTE"
        : "PARTS_CHECKED"
      : quoteFirst
      ? "PARTS_SOURCING"
      : "PARTS_REQUESTED";
  if (assign) {
    if (nextStatus !== "PARTS_CHECKED") {
      return res.status(400).json({ error: "ใบนี้ยังจ่ายงานไม่ได้ — ต้องผ่านขั้นอะไหล่/เสนอราคาก่อน" });
    }
    if (!knownTeam) return res.status(404).json({ error: `ไม่รู้จักทีม "${assign.team}"` });
  }

  await prisma.$transaction(async (tx) => {
    // ไม่ใช้อะไหล่ ให้ล้างรายการที่อาจค้างจากรอบก่อนออกด้วย ไม่งั้นแอดมินจะเห็นของเก่า
    await mergeWaitingParts(tx, id, parts);
    await tx.workOrderService.deleteMany({ where: { workOrderId: id } });
    if (services.length) {
      await tx.workOrderService.createMany({
        data: services.map((v) => ({ workOrderId: id, name: v.name, quantity: v.quantity, unit: v.unit || null, note: v.note || null })),
      });
    }
    const partsNote =
      note ||
        (nextStatus === "AWAITING_QUOTE"
          ? `ไม่ใช้อะไหล่ — มีค่าบริการ ${services.length} รายการ ส่งแอดมินทำใบเสนอราคา`
          : !needsParts
          ? "ไม่ต้องใช้อะไหล่ — ข้ามไปจัดคิวช่าง"
          : allIssued
          ? "อะไหล่ชุดเดิมเบิกไปแล้วทุกตัว — ข้ามไปจัดคิวช่าง"
          : asked
          ? "มีอะไหล่นอก/ค่าบริการ — เช็คอะไหล่ก่อน แล้วแอดมินทำใบเสนอราคาและเก็บเงินก่อนเบิกของ"
          : quoteFirst
          ? "อะไหล่ขายลูกค้าแฟรนไชส์ — เช็คอะไหล่ก่อน แล้วเสนอราคาและเก็บเงินก่อนเบิกของ"
          : null);
    const partsAction = needsParts ? "PARTS_REQUESTED" : "NO_PARTS";
    if (!assign) {
      await tx.workOrder.update({
        where: { id },
        data: {
          status: nextStatus,
          needsParts,
          // ทุกขั้นตั้งสถานะใหม่ — ไม่ใช้อะไหล่ไปขั้นจ่ายงานก็ "รอช่างเข้าแก้ไข" ตามขั้น (เดิมล้างเป็นว่าง)
          workStatus: workStatusForStage(nextStatus),
        },
      });
      await writeLog(tx, id, req.auth!.userId, partsAction, nextStatus, partsNote);
    } else {
      /**
       * เหมือน /assign ทุกอย่าง — ประวัติสองแถว แถบขั้นตอนจึงขึ้นว่าผ่านขั้นจ่ายงานแล้วตามจริง
       * แต่เขียนใบงานครั้งเดียวด้วยค่าสุดท้าย และสองแถวประวัติในคำสั่งเดียว (เดิมสี่คำสั่ง) ·
       * แถวจ่ายงานช้ากว่า 1 ms ทามไลน์เรียงตามเวลาจะได้ไม่สลับกัน
       */
      await tx.workOrder.update({
        where: { id },
        data: {
          status: "AWAITING_CONFIRM",
          needsParts,
          assignedTeam: assign.team,
          assignedToId: null,
          scheduledAt: dayStart(assign.scheduledAt),
          scheduledTime: assign.scheduledTime ?? null,
          appointmentStatus: "PENDING",
          workStatus: workStatusForStage("AWAITING_CONFIRM"),
        },
      });
      const at = Date.now();
      await tx.workOrderLog.createMany({
        data: [
          { workOrderId: id, userId: req.auth!.userId, action: partsAction, status: nextStatus, note: partsNote, createdAt: new Date(at) },
          {
            workOrderId: id,
            userId: req.auth!.userId,
            action: "ASSIGNED",
            status: "AWAITING_CONFIRM",
            note: `${teamText} · เข้างาน ${visitText(assign.scheduledAt, assign.scheduledTime ?? null)}`,
            createdAt: new Date(at + 1),
          },
        ],
      });
      orphanCache = null;
    }
    // ใบที่ไม่ได้ผูกกับเคสเครื่องเสีย ไม่ต้องอ่านเพื่อไปพบว่าไม่มีอะไรให้ซิงก์
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId, !!cur.outageId);
  }, STAGE_TX);

  res.json(await detailFor(id));
});

/**
 * รอเบิกอะไหล่ (ก่อนเสนอราคา) — แอดมินบอกว่าอะไหล่แต่ละตัวมีหรือหมด (เจ้าของงานขอ ต.ค. 69)
 *
 * มีครบ → ไปเสนอราคาทันที · หมดบางตัว → ค้างที่ขั้นนี้ พร้อมวันที่คาดว่าของเข้า (ไม่บังคับ)
 * ของมาแล้วกดซ้ำด้วยผล "มีครบ" — ใช้เส้นทางเดียวกัน ไม่ต้องมีปุ่มแยกฝั่งเซิร์ฟเวอร์
 * เก็บผลไว้ที่อะไหล่ (inStock) ให้ขั้นเช็คคลังหลังรับเงินเห็นผลเดิมเป็นค่าตั้งต้น แต่ยังต้องเช็คซ้ำ
 */
const partsSourcingSchema = z.object({
  results: z.array(z.object({ sparePartId: z.number().int().positive(), inStock: z.boolean() })).min(1),
  expectedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่คาดว่าของเข้าต้องเป็น ปี-เดือน-วัน")
    .nullable()
    .optional(),
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/parts-sourcing", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = partsSourcingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  if (!(await guardStage(req, res, id, "PARTS_SOURCING"))) return;

  // ตัวที่เบิกไปแล้วรอบก่อนจ่ายเงินไปแล้ว — เช็คและเสนอราคาเฉพาะตัวที่เพิ่มมา
  const parts = (
    await prisma.workOrderPart.findMany({
      where: { workOrderId: id, kind: "WAITING" },
      include: { sparePart: { select: { partCode: true, name: true } } },
    })
  ).filter((p) => !isIssued(p));
  const result = new Map(parsed.data.results.map((r) => [r.sparePartId, r.inStock]));
  // ต้องตอบครบทุกตัว — ตอบบางตัวแล้วถือว่าครบคือเสนอราคาของที่ยังไม่รู้ว่ามี
  const missing = parts.filter((p) => !result.has(p.sparePartId));
  if (missing.length) {
    return res.status(400).json({ error: `ยังไม่ได้บอกว่ามีหรือหมด: ${missing.map((p) => p.sparePart.partCode).join(", ")}` });
  }
  const out = parts.filter((p) => result.get(p.sparePartId) === false);
  const allIn = out.length === 0;
  const expected = !allIn && parsed.data.expectedAt ? new Date(`${parsed.data.expectedAt}T00:00:00.000Z`) : null;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const p of parts) {
      await tx.workOrderPart.update({
        where: { id: p.id },
        data: { inStock: result.get(p.sparePartId)!, checkedAt: now, checkedById: req.auth!.userId },
      });
    }
    await tx.workOrder.update({
      where: { id },
      data: allIn
        ? { status: "AWAITING_QUOTE", partsExpectedAt: null, workStatus: workStatusForStage("AWAITING_QUOTE") }
        : { partsExpectedAt: expected, workStatus: workStatusForStage("PARTS_SOURCING", { anyPartOutOfStock: true }) },
    });
    const outText = out.map((p) => p.sparePart.name || p.sparePart.partCode).join(", ");
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      allIn ? "PARTS_SOURCED" : "PARTS_BACKORDERED",
      allIn ? "AWAITING_QUOTE" : "PARTS_SOURCING",
      [
        allIn ? null : `หมด: ${outText}${expected ? ` · คาดว่าเข้า ${parsed.data.expectedAt}` : ""}`,
        parsed.data.note || null,
      ]
        .filter(Boolean)
        .join(" — ") || null
    );
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);

  res.json(await detailFor(id));
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
  /**
   * ใบที่เสนอราคาแล้ว — ลูกค้าจ่ายค่าตัวที่หมดไปแล้วหรือยัง (บังคับตอบเมื่อแยก)
   *
   * บางครั้งลูกค้าจ่ายแค่ค่าตัวที่มีของ ตัวที่หมดยังไม่ได้เก็บเงิน (เจ้าของงานแจ้ง ต.ค. 69 — WO-00528)
   * ระบบเดาไม่ได้ว่าแบบไหน แอดมินที่ทำใบเสนอราคาเป็นคนรู้ · จ่ายแล้ว → ใบใหม่ไปเบิก · ยังไม่จ่าย → เช็คอะไหล่แล้วเสนอราคาใหม่
   */
  splitPaid: z.boolean().optional(),
  /**
   * ของคลังอื่น ต้องโอนไหม (เจ้าของงานขอ ต.ค. 69) — คลังที่อยู่ในพื้นที่หน้างานอยู่แล้วไม่ต้องโอน
   * หัวหน้าภาคเบิกจากคลังนั้นส่งช่างได้เลย (PARTS_PICKUP) · ต้องโอน → เบิกแล้วโอนมาคลังส่งมอบ (PARTS_TRANSFER)
   *
   * noTransfer = รหัสอะไหล่ที่ไม่ต้องโอน (เลือกทีละชิ้น — ใบเดียวมีทั้งชิ้นที่ต้องโอนและไม่ต้องโอนได้)
   * transfer: false = ไม่ต้องโอนทุกชิ้น (รูปแบบแรก) · ไม่ส่งทั้งคู่ = ต้องโอน (แอปรุ่นก่อนที่ยังไม่มีคำถามนี้)
   */
  transfer: z.boolean().optional(),
  noTransfer: z.array(z.number().int().positive()).max(20).optional(),
  // ของอยู่คลังอื่น — ข้อความถึงหัวหน้าภาคที่ต้องไปเบิก (บังคับเมื่อมีตัวที่อยู่คลังอื่น)
  pickupNote: z.string().trim().max(500).optional(),
  // ของหมด — วันที่คาดว่าของเข้า ขึ้นบนแถบขั้นตอนคู่กับป้ายแดง "อะไหล่หมด"
  expectedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่คาดว่าของเข้าต้องเป็น ปี-เดือน-วัน")
    .nullable()
    .optional(),
});

router.post("/:id/parts-check", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = partsCheckSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await guardStage(req, res, id, "PARTS_REQUESTED"))) return;

  const waiting = await prisma.workOrderPart.findMany({
    where: { workOrderId: id, kind: "WAITING" },
    select: {
      sparePartId: true,
      inStock: true,
      warehouse: true,
      requisitionNo: true,
      transferredAt: true,
      quantity: true,
      unit: true,
      note: true,
      sparePart: { select: { offCatalog: true } },
    },
  });
  // ของนอกสโตร์ไม่ได้ออกจากคลัง — "มี" แปลว่าแอดมินจัดหาได้แล้ว ไม่มีคลังหรือใบเบิกให้ใส่
  const offIds = new Set(waiting.filter((w) => w.sparePart.offCatalog).map((w) => w.sparePartId));

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
    if (offIds.has(r.sparePartId)) continue;
    if (r.inStock && !r.warehouse) {
      return res.status(400).json({ error: "ของที่มีอยู่ ต้องระบุด้วยว่าอยู่คลังไหน" });
    }
    if (r.inStock && r.warehouse && !WAREHOUSES.includes(r.warehouse as never)) {
      return res.status(400).json({ error: `ไม่รู้จักคลัง "${r.warehouse}"` });
    }
    // แอดมินเบิกได้เฉพาะคลังลาดพร้าว 94 — ของคลังอื่นหัวหน้าภาคเป็นคนเบิกและใส่เลขใบเบิกเอง
    // กันที่เซิร์ฟเวอร์ด้วย ไม่ใช่แค่ซ่อนช่องบนหน้าจอ
    if (r.inStock && r.warehouse !== ADMIN_WAREHOUSE && r.requisitionNo?.trim()) {
      return res.status(400).json({
        error: `แอดมินเบิกได้เฉพาะ${ADMIN_WAREHOUSE} — ของที่อยู่${r.warehouse} ให้หัวหน้าภาคเป็นคนเบิก (ไม่ต้องใส่เลขใบเบิก)`,
      });
    }
    // ของที่เบิกออกจากคลังต้องมีเลขใบเบิกกำกับ ไม่งั้นของหายออกจากคลัง
    // โดยไม่มีเอกสารผูกไว้ แล้วตอนตรวจนับจะหาไม่เจอว่าไปไหน
    if (r.inStock && r.warehouse === ADMIN_WAREHOUSE && !r.requisitionNo?.trim()) {
      return res.status(400).json({ error: "ของที่มีอยู่ ต้องใส่เลขใบเบิกอะไหล่ด้วย" });
    }
  }
  /**
   * ของคลังอื่นแยกสองแบบ (เจ้าของงานกำหนด ต.ค. 69):
   * - ยังไม่ได้โอน → หัวหน้าภาคเบิกจากคลังนั้นแล้วโอนมาคลังส่งมอบ (PARTS_TRANSFER)
   * - โอนมาถึงคลังนี้แล้ว (ไม่ใช่ 94) → หัวหน้าภาคเบิกส่งมอบจากคลังนี้ (PARTS_PICKUP)
   * แอดมินเปลี่ยนไปคลังอื่นที่ไม่ใช่ปลายทางที่โอนมา = ต้องโอนใหม่
   */
  const arrivedAt = (sparePartId: number, warehouse: string | null | undefined) => {
    const w = waiting.find((x) => x.sparePartId === sparePartId);
    return !!w?.transferredAt && w.warehouse === warehouse;
  };
  const otherIds = parsed.data.results
    .filter((r) => r.inStock && !offIds.has(r.sparePartId) && r.warehouse !== ADMIN_WAREHOUSE)
    .map((r) => r.sparePartId);
  // ไม่ต้องโอน = ถือว่าของอยู่คลังที่จะเบิกส่งมอบแล้ว เหมือนตัวที่โอนมาถึงแล้ว
  const noTransferIds = new Set(
    parsed.data.results
      .filter(
        (r) =>
          otherIds.includes(r.sparePartId) &&
          !arrivedAt(r.sparePartId, r.warehouse) &&
          (parsed.data.transfer === false || (parsed.data.noTransfer ?? []).includes(r.sparePartId))
      )
      .map((r) => r.sparePartId)
  );
  const arrivedIds = new Set(
    parsed.data.results
      .filter((r) => otherIds.includes(r.sparePartId) && (arrivedAt(r.sparePartId, r.warehouse) || noTransferIds.has(r.sparePartId)))
      .map((r) => r.sparePartId)
  );
  const transferIds = otherIds.filter((pid) => !arrivedIds.has(pid));
  const pickupIds = otherIds.filter((pid) => arrivedIds.has(pid));
  // หมายเหตุถึงหัวหน้าภาคไม่บังคับแล้ว (เจ้าของงานตกลง ต.ค. 69) — ชื่อคลังที่แอดมินเลือกบอกที่เบิกอยู่แล้ว

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
  // ลูกค้าจ่ายเงินไปแล้วในใบนี้ = ใบที่ผ่านเสนอราคา · ใบที่ไม่ต้องเสนอราคาแยกไปเบิกได้เลยเหมือนเดิม
  const paidHere = split && (await prisma.workOrderLog.count({ where: { workOrderId: id, action: "PAID" } })) > 0;
  if (paidHere && parsed.data.splitPaid === undefined) {
    return res.status(400).json({
      error: "ใบนี้เสนอราคาแล้ว — ต้องบอกว่าลูกค้าจ่ายค่าอะไหล่ที่หมดไปแล้วหรือยัง ก่อนแยกไปใบใหม่",
    });
  }
  const childStart = paidHere && !parsed.data.splitPaid ? "PARTS_SOURCING" : "PARTS_REQUESTED";
  const anyOut = stillOut && !split;
  const now = new Date();

  // ของครบถึงไปขั้นจ่ายงาน — เรื่องราคาและเงินจบไปก่อนถึงขั้นนี้แล้ว
  // ของไม่ครบก็ค้างอยู่ที่แอดมินรอของเข้า
  // ของคลังอื่นยังไม่ได้เบิก — ไปให้หัวหน้าภาคเบิกก่อนจ่ายงาน (ของหมดยังค้างที่แอดมินก่อน)
  const nextStage = anyOut
    ? "PARTS_REQUESTED"
    : transferIds.length
      ? "PARTS_TRANSFER"
      : pickupIds.length
        ? "PARTS_PICKUP"
        : "PARTS_CHECKED";
  const outCodes = stillOut
    ? await partCodesText(
        waiting.filter((w) => outIds.includes(w.sparePartId))
      )
    : "";
  // วันคาดว่าของเข้าเป็นของ "ใบที่รอของ" — ไม่แยกก็คือใบนี้ แยกแล้วคือใบรออะไหล่
  // ของครบแล้วต้องล้าง ไม่งั้นวันของรอบที่แล้วค้างอยู่บนใบที่ไม่ได้รออะไรแล้ว
  const expected = stillOut && parsed.data.expectedAt ? new Date(`${parsed.data.expectedAt}T00:00:00.000Z`) : null;

  await prisma.$transaction(async (tx) => {
    for (const r of parsed.data.results) {
      await tx.workOrderPart.updateMany({
        where: { workOrderId: id, kind: "WAITING", sparePartId: r.sparePartId },
        data: {
          inStock: r.inStock,
          warehouse: r.inStock && !offIds.has(r.sparePartId) ? r.warehouse ?? null : null,
          // ของที่หมดยังไม่ได้เบิก เลขใบเบิกที่ค้างจากรอบก่อนต้องถูกล้าง · ของนอกสโตร์ไม่มีใบเบิก
          requisitionNo: r.inStock && !offIds.has(r.sparePartId) ? r.requisitionNo?.trim() || null : null,
          // ยังอยู่คลังที่โอนมาถึง = เก็บข้อมูลการโอนไว้ · เปลี่ยนคลัง/หมด = การโอนรอบเดิมไม่เกี่ยวแล้ว
          // ไม่ต้องโอน — ขั้นหัวหน้าภาคเบิกอ่านว่า "ของอยู่คลังนี้แล้ว" จาก transferredAt (ไม่มีเลขใบโอน = ไม่ได้โอน)
          ...(noTransferIds.has(r.sparePartId)
            ? { transferFrom: null, transferReqNo: null, transferNo: null, transferredAt: now }
            : arrivedIds.has(r.sparePartId) || (r.inStock && r.warehouse === ADMIN_WAREHOUSE && arrivedAt(r.sparePartId, r.warehouse))
              ? {}
              : { transferFrom: null, transferReqNo: null, transferNo: null, transferredAt: null }),
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
        partsExpectedAt: anyOut ? expected : null,
      },
    });
    if (split) {
      // ย้ายแถวอะไหล่ไปทั้งแถว จำนวนและผล "หมด" ติดไปด้วย หัวหน้าภาคที่ดูแล
      // ใบรออะไหล่จะเห็นเลยว่ารอตัวไหนอยู่กี่ชิ้น
      const child = await createFollowUp(
        tx,
        id,
        req.auth!.userId,
        `อะไหล่หมด: ${outCodes}${childStart === "PARTS_SOURCING" ? " · ลูกค้ายังไม่จ่ายค่าตัวนี้" : ""}`,
        true,
        childStart
      );
      await tx.workOrderPart.updateMany({
        where: { workOrderId: id, kind: "WAITING", sparePartId: { in: outIds } },
        data: { workOrderId: child.id },
      });
      if (expected) await tx.workOrder.update({ where: { id: child.id }, data: { partsExpectedAt: expected } });
      await writeLog(
        tx,
        id,
        req.auth!.userId,
        "SPLIT",
        nextStage,
        `แยก ${outCodes} ไป ${child.code} (${
          childStart === "PARTS_SOURCING"
            ? "ลูกค้ายังไม่จ่ายค่าตัวนี้ — ของเข้าแล้วเสนอราคาใหม่"
            : paidHere
              ? "ลูกค้าจ่ายแล้ว — แอดมินเบิกเมื่อของเข้า"
              : "รออะไหล่ แอดมินเบิกเมื่อของเข้า"
        }) — ใบนี้ไปซ่อมด้วยของที่มี`
      );
    }
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "PARTS_CHECKED",
      nextStage,
      [
        // รายตัว: คลังไหน · เลขใบเบิก · ใครเบิก — เดิมเขียนแค่ "อะไหล่ครบทุกรายการ" ย้อนดูไม่ได้ว่าตัวไหน
        // แอดมินเบิกจากคลัง 94 ด้วยใบไหน ตัวไหนส่งให้หัวหน้าภาคเบิก (เจ้าของงานขอ ต.ค. 69)
        await partsCheckLines(waiting, parsed.data.results, offIds, arrivedIds, noTransferIds),
        anyOut
          ? `อะไหล่หมด: ${outCodes}${expected ? ` · คาดว่าเข้า ${parsed.data.expectedAt}` : ""} — ใบงานรออยู่ที่ขั้นนี้ ของมาถึงแล้วค่อยใส่เลขใบเบิกอีกรอบ`
          : null,
        parsed.data.note || null,
      ]
        .filter(Boolean)
        .join("\n")
    );
    if (nextStage === "PARTS_TRANSFER" || nextStage === "PARTS_PICKUP") {
      const pickupText = waiting
        .filter((w) => otherIds.includes(w.sparePartId))
        .map((w) => {
          const r = parsed.data.results.find((x) => x.sparePartId === w.sparePartId)!;
          return { ...w, where: r.warehouse };
        });
      const codes = await partCodesText(pickupText);
      const where = [...new Set(pickupText.map((w) => w.where))].join(", ");
      // หน้าจอหัวหน้าภาคอ่านหมายเหตุจากรายการนี้ (ตัวล่าสุด)
      await writeLog(
        tx,
        id,
        req.auth!.userId,
        "PICKUP_REQUESTED",
        "PARTS_PICKUP",
        `${codes} (${where})${parsed.data.pickupNote ? ` — ${parsed.data.pickupNote}` : ""}`
      );
    }
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);

  res.json(await detailFor(id));
});

/**
 * ตัวที่หัวหน้าภาคต้องเบิกเอง — แอดมินบอกว่ามีของที่คลังอื่น (ไม่ใช่ลาดพร้าว 94) และยังไม่มีเลขใบเบิก
 * ไม่มีช่องแยกในฐานข้อมูล: แอดมินใส่เลขใบเบิกคลังอื่นไม่ได้อยู่แล้ว (parts-check) จึงแยกออกจากกันได้เสมอ
 */
/** ตัวที่หัวหน้าภาคต้องเบิกส่งมอบจากคลังที่ไม่ใช่ 94 — ต้องโอนมาถึงแล้ว (ยังไม่โอน = ขั้นเบิกและโอน) */
/**
 * ชิ้นที่แอดมินบอกว่าไม่ต้องโอน = มี transferredAt แต่ไม่มีเลขใบโอน (ของอยู่คลังนั้นอยู่แล้ว)
 * ใบถูกส่งกลับแอดมิน (เบิก/โอนไม่ได้) → ล้าง ให้แอดมินตอบใหม่ทุกชิ้นว่าโอนไหม · ชิ้นที่โอนมาถึงจริงเก็บไว้
 */
async function clearNoTransfer(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], workOrderId: number) {
  await tx.workOrderPart.updateMany({
    where: { workOrderId, kind: "WAITING", transferNo: null, transferredAt: { not: null }, requisitionNo: null },
    data: { transferredAt: null },
  });
}

function pendingPickup(p: {
  inStock: boolean | null;
  warehouse: string | null;
  requisitionNo: string | null;
  transferredAt: Date | null;
  sparePart: { offCatalog: boolean };
}) {
  return (
    p.inStock === true && !p.sparePart.offCatalog && !!p.warehouse && p.warehouse !== ADMIN_WAREHOUSE && !p.requisitionNo && !!p.transferredAt
  );
}

/** ตัวที่ต้องเบิกจากคลังอื่นแล้วโอนมาคลังส่งมอบ — แอดมินบอกว่าอยู่คลังอื่น และยังไม่ได้สั่งโอน */
function pendingTransfer(p: {
  inStock: boolean | null;
  warehouse: string | null;
  requisitionNo: string | null;
  transferNo: string | null;
  transferredAt: Date | null;
  sparePart: { offCatalog: boolean };
}) {
  return (
    p.inStock === true && !p.sparePart.offCatalog && !!p.warehouse && p.warehouse !== ADMIN_WAREHOUSE && !p.requisitionNo && !p.transferNo && !p.transferredAt
  );
}

/**
 * หัวหน้าภาคเบิกอะไหล่จากคลังอื่นแล้ว (ขั้น PARTS_PICKUP — เจ้าของงานกำหนด ต.ค. 69)
 *
 * ต้องใส่เลขใบเบิกทุกตัว ด้วยเหตุผลเดียวกับที่แอดมินต้องใส่: ของออกจากคลังโดยไม่มีเอกสาร ตรวจนับแล้วหาไม่เจอ
 * เปลี่ยนคลังได้ (เช่น เบิกคลังที่ใกล้กว่าที่แอดมินบอก) — บันทึกคลังที่เบิกจริง · แอดมินกดแทนไม่ได้
 */
const pickupSchema = z.object({
  results: z
    .array(
      z.object({
        sparePartId: z.number().int().positive(),
        warehouse: z.string().trim().min(1).max(120),
        requisitionNo: z.string().trim().min(1, "ต้องใส่เลขใบเบิกทุกรายการ").max(60),
      })
    )
    .min(1),
  note: z.string().trim().max(500).optional(),
});

/**
 * หัวหน้าภาคเบิกจากคลังที่แอดมินบอกแล้วสั่งโอนมาคลังที่จะส่งมอบ (เจ้าของงานกำหนด ต.ค. 69)
 *
 * ต้องมีทั้งเลขใบเบิกจากคลังต้นทางและเลขที่ใบโอน — ของเคลื่อนสองครั้ง (ออกจากคลังต้นทาง · เข้าคลังปลายทาง)
 * ต้องตามได้ทั้งสองทาง · คลังปลายทางตั้งต้นที่คลัง 94 เลือกคลังที่ใกล้หน้างานได้ แต่ต้องไม่ใช่คลังเดิม
 * บันทึกแล้วใบงานรอของถึง (PARTS_IN_TRANSIT) — ยังไม่ได้ส่งมอบ จึงยังไม่ใส่ requisitionNo
 */
const transferSchema = z.object({
  results: z
    .array(
      z.object({
        sparePartId: z.number().int().positive(),
        fromWarehouse: z.string().trim().min(1).max(120),
        transferReqNo: z.string().trim().min(1, "ต้องใส่เลขใบเบิกจากคลังต้นทางทุกรายการ").max(60),
        toWarehouse: z.string().trim().min(1).max(120),
        transferNo: z.string().trim().min(1, "ต้องใส่เลขที่ใบโอนทุกรายการ").max(60),
      })
    )
    .min(1),
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/parts-transfer", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  if (!(await guardStage(req, res, id, "PARTS_TRANSFER"))) return;

  const parts = await prisma.workOrderPart.findMany({
    where: { workOrderId: id, kind: "WAITING" },
    select: {
      sparePartId: true,
      quantity: true,
      inStock: true,
      warehouse: true,
      requisitionNo: true,
      transferNo: true,
      transferredAt: true,
      sparePart: { select: { offCatalog: true } },
    },
  });
  const pending = parts.filter(pendingTransfer);
  const answered = new Map(parsed.data.results.map((r) => [r.sparePartId, r]));
  if (pending.some((p) => !answered.has(p.sparePartId))) {
    return res.status(400).json({ error: "ต้องกรอกให้ครบทุกรายการที่ต้องเบิกและโอน" });
  }
  for (const r of parsed.data.results) {
    if (!pending.some((p) => p.sparePartId === r.sparePartId)) {
      return res.status(400).json({ error: "มีรายการที่ไม่ได้อยู่ในรายการที่ต้องเบิกและโอน" });
    }
    for (const w of [r.fromWarehouse, r.toWarehouse]) {
      if (!WAREHOUSES.includes(w as never)) return res.status(400).json({ error: `ไม่รู้จักคลัง "${w}"` });
    }
    if (r.fromWarehouse === r.toWarehouse) {
      return res.status(400).json({ error: "คลังที่โอนไปต้องไม่ใช่คลังเดียวกับที่เบิก" });
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const r of parsed.data.results) {
      await tx.workOrderPart.updateMany({
        where: { workOrderId: id, kind: "WAITING", sparePartId: r.sparePartId },
        data: {
          // warehouse กลายเป็นคลังปลายทาง — ขั้นต่อจากนี้ (เบิกส่งมอบ) ดูคลังนี้
          warehouse: r.toWarehouse,
          transferFrom: r.fromWarehouse,
          transferReqNo: r.transferReqNo,
          transferNo: r.transferNo,
          transferredAt: null,
        },
      });
    }
    await tx.workOrder.update({
      where: { id },
      data: { status: "PARTS_IN_TRANSIT", workStatus: workStatusForStage("PARTS_IN_TRANSIT") },
    });
    const lines = await Promise.all(
      parsed.data.results.map(async (r) => {
        const p = pending.find((x) => x.sparePartId === r.sparePartId)!;
        const moved = p.warehouse !== r.fromWarehouse ? ` (แอดมินบอก${p.warehouse})` : "";
        return `${await partCodesText([p])} · ${r.fromWarehouse}${moved} ใบเบิก ${r.transferReqNo} → ${r.toWarehouse} · ใบโอน ${r.transferNo}`;
      })
    );
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "TRANSFER_REQUESTED",
      "PARTS_IN_TRANSIT",
      [lines.join("\n"), parsed.data.note].filter(Boolean).join("\n")
    );
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);
  res.json(await detailFor(id));
});

/**
 * ของถึงคลังปลายทางแล้ว — ไปเบิกส่งมอบต่อ
 * มีตัวที่ต้องเบิกจากคลัง 94 → แอดมิน · เหลือแต่คลังอื่น → หัวหน้าภาคเบิกส่งมอบ · ไม่เหลืออะไรให้เบิก → จ่ายงาน
 */
router.post("/:id/parts-transfer/arrived", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const note = z.string().trim().max(500).optional().safeParse(req.body?.note ?? undefined);
  if (!note.success) return res.status(400).json({ error: "หมายเหตุยาวเกินไป" });
  if (!(await guardStage(req, res, id, "PARTS_IN_TRANSIT"))) return;

  const now = new Date();
  const parts = await prisma.workOrderPart.findMany({
    where: { workOrderId: id, kind: "WAITING" },
    select: {
      sparePartId: true,
      quantity: true,
      inStock: true,
      warehouse: true,
      requisitionNo: true,
      transferNo: true,
      transferredAt: true,
      sparePart: { select: { offCatalog: true } },
    },
  });
  const moving = parts.filter((p) => p.transferNo && !p.transferredAt);
  const after = parts.map((p) => (moving.includes(p) ? { ...p, transferredAt: now } : p));
  const needAdmin = after.some((p) => p.inStock === true && !p.sparePart.offCatalog && p.warehouse === ADMIN_WAREHOUSE && !p.requisitionNo);
  const next = needAdmin ? "PARTS_REQUESTED" : after.some(pendingPickup) ? "PARTS_PICKUP" : "PARTS_CHECKED";

  await prisma.$transaction(async (tx) => {
    await tx.workOrderPart.updateMany({
      where: { workOrderId: id, kind: "WAITING", transferNo: { not: null }, transferredAt: null },
      data: { transferredAt: now },
    });
    await tx.workOrder.update({ where: { id }, data: { status: next, workStatus: workStatusForStage(next) } });
    const lines = await Promise.all(moving.map(async (p) => `${await partCodesText([p])} ถึง${p.warehouse}แล้ว`));
    await writeLog(tx, id, req.auth!.userId, "TRANSFER_ARRIVED", next, [lines.join("\n"), note.data].filter(Boolean).join("\n"));
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);
  res.json(await detailFor(id));
});

/**
 * เบิกหรือโอนไม่ได้ (คลังนั้นไม่มีของจริง) — ส่งกลับให้แอดมินหาคลังอื่นหรือตอบว่าหมด
 * ใช้ได้ทั้งตอนรอเบิกและโอน และตอนรอของถึง (โอนไม่สำเร็จ) · การโอนที่ยังไม่ถึงถูกล้าง แอดมินตอบใหม่
 */
router.post("/:id/parts-transfer/return", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const reason = z.string().trim().min(1, "ต้องบอกเหตุผลที่เบิกหรือโอนไม่ได้").max(500).safeParse(req.body?.reason ?? "");
  if (!reason.success) return res.status(400).json({ error: reason.error.issues[0]?.message });
  if (!(await guardStage(req, res, id, ["PARTS_TRANSFER", "PARTS_IN_TRANSIT"]))) return;
  await prisma.$transaction(async (tx) => {
    await clearNoTransfer(tx, id);
    // คลังที่ค้างไว้เป็นต้นทางเดิม (ไม่ใช่ปลายทางที่โอนไม่ถึง) — แอดมินเห็นค่าตั้งต้นที่ตัวเองบอกไว้
    const moving = await tx.workOrderPart.findMany({
      where: { workOrderId: id, kind: "WAITING", transferNo: { not: null }, transferredAt: null },
      select: { id: true, transferFrom: true },
    });
    for (const m of moving) {
      await tx.workOrderPart.update({
        where: { id: m.id },
        data: { warehouse: m.transferFrom, transferFrom: null, transferReqNo: null, transferNo: null },
      });
    }
    await tx.workOrder.update({
      where: { id },
      data: { status: "PARTS_REQUESTED", workStatus: workStatusForStage("PARTS_REQUESTED") },
    });
    await writeLog(tx, id, req.auth!.userId, "TRANSFER_RETURNED", "PARTS_REQUESTED", reason.data);
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);
  res.json(await detailFor(id));
});

router.post("/:id/parts-pickup", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = pickupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  if (!(await guardStage(req, res, id, "PARTS_PICKUP"))) return;

  const parts = await prisma.workOrderPart.findMany({
    where: { workOrderId: id, kind: "WAITING" },
    select: {
      sparePartId: true,
      quantity: true,
      inStock: true,
      warehouse: true,
      requisitionNo: true,
      transferredAt: true,
      sparePart: { select: { offCatalog: true } },
    },
  });
  const pending = parts.filter(pendingPickup);
  const answered = new Map(parsed.data.results.map((r) => [r.sparePartId, r]));
  if (pending.some((p) => !answered.has(p.sparePartId))) {
    return res.status(400).json({ error: "ต้องใส่เลขใบเบิกให้ครบทุกรายการที่ต้องเบิก" });
  }
  for (const r of parsed.data.results) {
    if (!pending.some((p) => p.sparePartId === r.sparePartId)) {
      return res.status(400).json({ error: "มีรายการที่ไม่ได้อยู่ในรายการที่ต้องเบิก" });
    }
    if (!WAREHOUSES.includes(r.warehouse as never)) return res.status(400).json({ error: `ไม่รู้จักคลัง "${r.warehouse}"` });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const r of parsed.data.results) {
      await tx.workOrderPart.updateMany({
        where: { workOrderId: id, kind: "WAITING", sparePartId: r.sparePartId },
        data: { warehouse: r.warehouse, requisitionNo: r.requisitionNo, checkedAt: now },
      });
    }
    await tx.workOrder.update({
      where: { id },
      data: { status: "PARTS_CHECKED", workStatus: workStatusForStage("PARTS_CHECKED") },
    });
    const lines = await Promise.all(
      parsed.data.results.map(async (r) => {
        const p = pending.find((x) => x.sparePartId === r.sparePartId)!;
        const moved = p.warehouse !== r.warehouse ? ` (แอดมินบอก${p.warehouse})` : "";
        return `${await partCodesText([p])} ${r.warehouse}${moved} · ${r.requisitionNo}`;
      })
    );
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "PICKED_UP",
      "PARTS_CHECKED",
      [lines.join(" / "), parsed.data.note].filter(Boolean).join(" — ")
    );
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);

  res.json(await detailFor(id));
});

/**
 * หัวหน้าภาคไปแล้วเบิกไม่ได้ (คลังนั้นของหมดจริง) — ส่งกลับให้แอดมินหาคลังอื่นหรือตอบว่าหมด
 * ผลเช็คของตัวที่ยังไม่เบิกยังอยู่ (คลังที่แอดมินบอก) เป็นค่าตั้งต้นให้แอดมิน แต่ต้องตอบใหม่ทุกตัว
 * เพราะยังไม่มีเลขใบเบิก (ดู settled ใน parts-check)
 */
router.post("/:id/parts-pickup/return", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const reason = z.string().trim().min(1, "ต้องบอกเหตุผลที่เบิกไม่ได้").max(500).safeParse(req.body?.reason ?? "");
  if (!reason.success) return res.status(400).json({ error: reason.error.issues[0]?.message });
  if (!(await guardStage(req, res, id, "PARTS_PICKUP"))) return;
  await prisma.$transaction(async (tx) => {
    await clearNoTransfer(tx, id);
    await tx.workOrder.update({
      where: { id },
      data: { status: "PARTS_REQUESTED", workStatus: workStatusForStage("PARTS_REQUESTED") },
    });
    await writeLog(tx, id, req.auth!.userId, "PICKUP_RETURNED", "PARTS_REQUESTED", reason.data);
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);
  res.json(await detailFor(id));
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

/**
 * หลังรับเงิน (หรือข้ามเสนอราคา) ไปไหนต่อ — มีอะไหล่ไปเบิก · ไม่มี (มีแต่ค่าบริการ) ไปจ่ายงานเลย
 * ไม่งั้นใบค่าบริการล้วนไปค้างที่ขั้นเบิกซึ่งไม่มีอะไรให้เบิก แอดมินกดผ่านไม่ได้
 */
async function afterPayment(id: number): Promise<"PARTS_REQUESTED" | "PARTS_CHECKED"> {
  const waiting = await prisma.workOrderPart.count({ where: { workOrderId: id, kind: "WAITING" } });
  return waiting > 0 ? "PARTS_REQUESTED" : "PARTS_CHECKED";
}

router.post("/:id/quote", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = quoteSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await guardStage(req, res, id, "AWAITING_QUOTE"))) return;
  const after = await afterPayment(id);

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
        data: { status: after, workStatus: workStatusForStage(after) },
      });
      await writeLog(tx, id, req.auth!.userId, "QUOTE_SKIPPED", after, parsed.data.note);
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

  res.json(await detailFor(id));
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
  const after = await afterPayment(id);

  const paid = await prisma.workOrderAttachment.count({
    where: { workOrderId: id, role: "RECEIPT" },
  });
  if (paid === 0) {
    return res.status(400).json({ error: "ต้องแนบบิลที่ลูกค้าจ่ายแล้วก่อน" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: { status: after, workStatus: workStatusForStage(after) },
    });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "PAID",
      after,
      parsed.data.note ||
        (after === "PARTS_CHECKED" ? "ลูกค้าจ่ายเงินแล้ว — ไม่มีอะไหล่ให้เบิก ไปจ่ายงานได้เลย" : "ลูกค้าจ่ายเงินแล้ว — เบิกอะไหล่ออกจากคลังได้")
    );
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);

  res.json(await detailFor(id));
});

/** ไทม์ไลน์ของใบงาน — ใครทำอะไรเมื่อไร ตั้งแต่เปิดจนปิด (utils/timeline.ts) */
router.get("/:id/timeline", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const t = await workOrderTimeline(id);
  if (!t) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  res.json(t);
});

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateField = z.string().regex(DATE_PATTERN, "วันที่ต้องเป็น ปี-เดือน-วัน");
// ว่าง = นัดกันเป็นวัน ไม่ได้ระบุเวลา
const timeField = z.string().regex(TIME_PATTERN, "เวลาต้องเป็น ชั่วโมง:นาที").nullable().optional();

function dayStart(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * "พ. 22 ต.ค. 69 เวลา 13:00 น." — ข้อความนี้ลงประวัติและขึ้นตรง ๆ ในฟอร์มยืนยันออกงาน
 * คนอ่านคือหัวหน้าภาคกับแอดมิน ไม่ใช่โปรแกรม — 2026-10-22 ต้องแปลในหัวก่อนว่าวันอะไร
 */
const TH_DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function visitText(date: string, time: string | null | undefined) {
  const [y, m, d] = date.split("-").map(Number);
  const day = `${TH_DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${TH_MONTH[m - 1]} ${String((y + 543) % 100).padStart(2, "0")}`;
  return time ? `${day} เวลา ${time} น.` : day;
}

/**
 * ทีมของสาขานี้สำหรับงานประเภทนี้ — ใช้บอกในประวัติว่าจ่ายข้ามทีม
 *
 * "ทีมของสาขา" ขึ้นกับประเภทงาน — งาน PM มีทีมดูแลคนละทีมกับงาน CM
 * เทียบกับทีม CM อย่างเดียวจะหาว่าข้ามทีมทั้งที่จ่ายถูกตามไฟล์
 */
async function teamNote(id: number, team: string, verb: string) {
  const wo = await prisma.workOrder.findUniqueOrThrow({
    where: { id },
    select: { jobType: true, branch: { select: { zone: true, pmTeam: true } } },
  });
  const ownTeam = wo.jobType === "PM" ? wo.branch.pmTeam ?? wo.branch.zone : wo.branch.zone;
  return ownTeam !== null && ownTeam !== team
    ? `${verb} ${team} (ข้ามทีม — งาน${wo.jobType} ของสาขานี้เป็นของ ${ownTeam})`
    : `${verb} ${team}`;
}

/**
 * ทีมต้องเป็นทีมที่มีอยู่จริงในทะเบียนสาขา ไม่ใช่ข้อความอะไรก็ได้ —
 * ทีมที่สะกดผิดคือใบงานที่ไม่มีใครเห็น เพราะไม่มีช่างคนไหนสังกัดทีมนั้น
 */
async function knownCmTeam(team: string) {
  // ทีม outsource ไม่มีสาขาประจำ แต่จ่ายงานให้ได้ (เจ้าของงานเพิ่ม ต.ค. 69)
  if ((await freshOutsource()).has(team)) return true;
  return (await prisma.branch.findFirst({ where: { zone: team, cancelledAt: null }, select: { id: true } })) !== null;
}

/**
 * ขั้นจ่ายงาน — หัวหน้าภาคเลือกทีมและวันเข้างานพร้อมกัน
 *
 * จ่ายให้ "ทีม" ไม่ใช่ "คน" เพราะทีมเป็นหน่วยที่รับผิดชอบสาขาจริง
 * ใครไปจริงในวันนั้นเป็นเรื่องที่รู้ตอนปิดงาน ไม่ใช่ตอนจ่ายงาน
 * วันบังคับใส่ เพราะขั้นถัดไปคือแอดมินโทรถามร้านว่าวันนี้ได้ไหม — ไม่มีวันก็ไม่มีอะไรให้ถาม
 */
const assignSchema = z.object({
  team: z.string().trim().min(1).max(120),
  scheduledAt: dateField,
  scheduledTime: timeField,
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/assign", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    const missingDate = parsed.error.issues.some((i) => i.path[0] === "scheduledAt");
    return res.status(400).json({ error: missingDate ? "ต้องระบุวันเข้างาน" : parsed.error.flatten() });
  }
  const cur = await guardStage(req, res, id, "PARTS_CHECKED");
  if (!cur) return;

  const { team, scheduledAt, scheduledTime } = parsed.data;
  // ทีมกับข้อความทีมไม่ขึ้นต่อกัน อ่านพร้อมกัน
  const [known, teamText] = await Promise.all([knownCmTeam(team), teamNote(id, team, "จ่ายงานให้")]);
  if (!known) return res.status(404).json({ error: `ไม่รู้จักทีม "${team}"` });

  // ล้างช่างรายคนของใบเก่าทิ้ง ไม่งั้นใบที่เคยจ่ายให้คนหนึ่งแล้วจ่ายใหม่ให้อีกทีม
  // จะยังค้างอยู่ในรายการของคนเดิมทั้งที่ไม่ใช่งานเขาแล้ว
  const data = {
    status: "AWAITING_CONFIRM",
    assignedTeam: team,
    assignedToId: null,
    scheduledAt: dayStart(scheduledAt),
    scheduledTime: scheduledTime ?? null,
    appointmentStatus: "PENDING",
    workStatus: workStatusForStage("AWAITING_CONFIRM"),
  };
  const log = {
    userId: req.auth!.userId,
    action: "ASSIGNED",
    status: "AWAITING_CONFIRM",
    note: [`${teamText} · เข้างาน ${visitText(scheduledAt, scheduledTime)}`, parsed.data.note].filter(Boolean).join(" — "),
  };
  if (!cur.outageId) {
    if (!(await moveStage(id, "PARTS_CHECKED", data, log))) return stageMoved(res);
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.workOrder.update({ where: { id }, data });
      await writeLog(tx, id, log.userId, log.action, log.status, log.note);
      await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
    }, STAGE_TX);
  }

  res.json(await detailFor(id));
});

/**
 * แอดมินโทรคอนเฟิร์มลูกค้า — ลูกค้าตกลงวันเดิม หรือขอเลื่อน
 *
 * ลูกค้าขอเลื่อน แอดมินเปลี่ยนวันได้ในขั้นนี้เลย ไม่ต้องตีกลับไปให้หัวหน้าภาคจ่ายใหม่ —
 * ลูกค้าที่ตอบว่า "ได้ แต่ขอวันพฤหัส" มีบ่อยกว่าลูกค้าที่ตอบรับตามนัดเป๊ะ
 * เลื่อนแล้วบันทึกเป็น RESCHEDULED พร้อมวันเดิม→วันใหม่ หัวหน้าภาคจะเห็นก่อนกดปล่อยงาน
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
  // ใช้ทั้งนัดเข้าซ่อม และนัดไปตรวจหน้างาน — คุยกับร้านแบบเดียวกัน
  // ทั้งสองแบบกลับไปให้หัวหน้าภาคปล่อยงานให้ช่าง (ดู WORK_ORDER_STAGE_ORDER)
  const before = await guardStage(req, res, id, ["AWAITING_CONFIRM", "INSPECT_CONFIRM"]);
  if (!before) return;
  const inspect = before.status === "INSPECT_CONFIRM";
  const next = inspect ? "INSPECT_DISPATCH" : "ASSIGNED";

  const oldDate = before.scheduledAt ? before.scheduledAt.toISOString().slice(0, 10) : null;
  const newDate = parsed.data.scheduledAt ?? oldDate;
  const newTime = parsed.data.scheduledTime !== undefined ? parsed.data.scheduledTime : before.scheduledTime;
  if (!newDate) return res.status(400).json({ error: "ต้องระบุวันเข้างาน" });
  const moved = newDate !== oldDate || (newTime ?? null) !== (before.scheduledTime ?? null);

  const data = {
    status: next,
    appointmentStatus: "CONFIRMED",
    scheduledAt: dayStart(newDate),
    scheduledTime: newTime ?? null,
    workStatus: workStatusForStage(next),
  };
  const log = {
    userId: req.auth!.userId,
    action: moved ? "RESCHEDULED" : "CONFIRMED",
    status: next,
    note: [
      moved
        ? `ลูกค้าขอเลื่อนจาก ${oldDate ? visitText(oldDate, before.scheduledTime) : "—"} เป็น ${visitText(newDate, newTime)}`
        : `ลูกค้าคอนเฟิร์ม ${visitText(newDate, newTime)}`,
      parsed.data.note,
    ]
      .filter(Boolean)
      .join(" — "),
  };
  if (!before.outageId) {
    if (!(await moveStage(id, before.status, data, log))) return stageMoved(res);
  } else {
    // ผูกกับเคสเครื่องเสีย — ต้องซิงก์สถานะเคสในทรานแซกชันเดียวกัน
    await prisma.$transaction(async (tx) => {
      await tx.workOrder.update({ where: { id }, data });
      await writeLog(tx, id, log.userId, log.action, log.status, log.note);
      await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
    }, STAGE_TX);
  }

  res.json(await detailFor(id));
});

/**
 * หัวหน้าภาคคอนเฟิร์มออกงาน — ปล่อยใบงานให้ช่าง
 *
 * ผ่านหัวหน้าภาคทุกครั้ง (เจ้าของงานเลือก) ไม่ใช่เฉพาะตอนลูกค้าเลื่อน — หัวหน้าภาค
 * เป็นคนปล่อยงานให้ช่างเสมอ และวันที่ลูกค้าเลื่อนไปทีมเดิมอาจไม่ว่าง จึงเปลี่ยนทีมได้ในขั้นนี้
 */
const dispatchSchema = z.object({
  team: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/dispatch", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = dispatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  // ปุ่มเดียวกันใช้ส่งช่างเข้าตรวจหน้างาน (INSPECT_DISPATCH) — หัวหน้าภาคทำสิ่งเดียวกันทุกอย่าง
  // ต่างกันแค่ปลายทาง: ซ่อม → รอช่างเข้างาน · ตรวจ → รอทีมตรวจหน้างาน
  const cur = await guardStage(req, res, id, ["ASSIGNED", "INSPECT_DISPATCH"]);
  if (!cur) return;
  const inspect = cur.status === "INSPECT_DISPATCH";
  const next = inspect ? "INSPECTING" : "IN_PROGRESS";

  const team = parsed.data.team ?? cur.assignedTeam;
  if (!team) return res.status(400).json({ error: "ต้องเลือกทีมที่จะออกงาน" });
  // ทีมตรวจเลือกได้ทั้งทีม CM และ PM เหมือนตอนส่งตรวจ (teamExists)
  if (team !== cur.assignedTeam && !(await (inspect ? teamExists(team) : knownCmTeam(team)))) {
    return res.status(404).json({ error: `ไม่รู้จักทีม "${team}"` });
  }
  const when = cur.scheduledAt ? visitText(cur.scheduledAt.toISOString().slice(0, 10), cur.scheduledTime) : "—";
  const text =
    team !== cur.assignedTeam
      ? `${await teamNote(id, team, inspect ? "ส่งตรวจหน้างาน เปลี่ยนทีมเป็น" : "ยืนยันออกงาน เปลี่ยนทีมเป็น")} (เดิม ${cur.assignedTeam ?? "—"}) · ${when}`
      : `${inspect ? "ส่งตรวจหน้างาน" : "ยืนยันออกงาน"} ${team} · ${when}`;

  const moved = await moveStage(
    id,
    cur.status,
    { status: next, assignedTeam: team, assignedToId: null, workStatus: workStatusForStage(next) },
    { userId: req.auth!.userId, action: "DISPATCHED", status: next, note: [text, parsed.data.note].filter(Boolean).join(" — ") }
  );
  if (!moved) return stageMoved(res);

  res.json(await detailFor(id));
});

/**
 * ช่างกด "ถึงหน้างาน" (หน้า งานของฉันวันนี้ — เจ้าของงานเลือก ต.ค. 69)
 *
 * บันทึกเวลาถึงจริง แอดมิน/หัวหน้าภาคเห็นว่าช่างใช้เวลาหน้างานเท่าไร · มีพิกัดก็เทียบกับสาขาเหมือนรายงานตัวเข้าสาขา
 * (ลงตารางรายงานตัวด้วย ไม่ต้องกดสองที่) · ไม่ได้บล็อกเมื่ออยู่นอกรัศมีหรือไม่มีพิกัด — GPS ในร้าน/ห้างคลาดบ่อย
 * บล็อกแล้วช่างทำงานต่อไม่ได้ ระบบแค่บันทึกตามจริงให้คนตรวจย้อนหลังได้
 * ไม่ใช่การเดินขั้น: ใบยังอยู่ขั้นเดิม (ช่าง · เข้างาน/ปิดงาน หรือ ตรวจหน้างาน)
 */
const arriveSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

router.post("/:id/arrive", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = arriveSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "พิกัดไม่ถูกต้อง" });
  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: {
      code: true,
      status: true,
      assignedToId: true,
      assignedTeam: true,
      branchId: true,
      branch: { select: { region: true, zone: true, pmTeam: true, latitude: true, longitude: true, radiusMeters: true } },
    },
  });
  if (!wo) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (wo.status !== "IN_PROGRESS" && wo.status !== "INSPECTING") {
    return res.status(409).json({ error: `${wo.code} ไม่ได้อยู่ในมือช่างตอนนี้` });
  }
  if (await blockedForTeam(req, res, wo)) return;
  const { latitude, longitude } = parsed.data;
  const b = wo.branch;
  const distance =
    latitude != null && longitude != null && b.latitude != null && b.longitude != null
      ? distanceMeters(latitude, longitude, b.latitude, b.longitude)
      : null;
  const within = distance != null ? distance <= b.radiusMeters : null;
  const note =
    distance == null
      ? latitude == null
        ? "ถึงหน้างาน (ไม่มีพิกัดจากเครื่อง)"
        : "ถึงหน้างาน (สาขายังไม่มีพิกัด เทียบระยะไม่ได้)"
      : `ถึงหน้างาน · ห่างสาขา ${Math.round(distance)} ม. · ${within ? "ในรัศมี" : "นอกรัศมี"}`;
  await prisma.$transaction(async (tx) => {
    if (distance != null) {
      await tx.branchCheckIn.create({
        data: {
          userId: req.auth!.userId,
          branchId: wo.branchId,
          latitude: latitude!,
          longitude: longitude!,
          distanceMeters: distance,
          withinRadius: within!,
          note: `ถึงหน้างาน ${wo.code}`,
        },
      });
    }
    await writeLog(tx, id, req.auth!.userId, "ARRIVED", wo.status, note);
  }, STAGE_TX);
  res.json({ ok: true, note, distance: distance != null ? Math.round(distance) : null, withinRadius: within });
});

/**
 * ลูกค้าขอเปลี่ยนวัน แต่ทีมไม่ว่างวันใหม่ — หัวหน้าภาคส่งกลับให้แอดมินนัดลูกค้าใหม่ (เจ้าของงานเลือก ต.ค. 69)
 *
 * เดิมทางเดียวคือเปลี่ยนทีมแล้วปล่อยงาน — แต่บางวันไม่มีทีมไหนว่าง ต้องให้ร้านเลือกวันอื่น
 * ซึ่งคนที่คุยกับร้านคือแอดมิน ใบจึงกลับไปขั้นคอนเฟิร์มลูกค้า ทีมเดิมยังอยู่ วันที่ลูกค้าขอยังอยู่ให้แอดมินเห็น
 * ต้องบอกเหตุผล — แอดมินต้องรู้ว่าจะไปต่อรองกับร้านว่าอะไร
 */
const declineNewDateSchema = z.object({
  reason: z.string().trim().min(1, "ต้องบอกเหตุผลให้แอดมิน เช่น ทีมเต็มวันนั้น").max(500),
});

router.post("/:id/decline-new-date", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = declineNewDateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const cur = await guardStage(req, res, id, "ASSIGNED");
  if (!cur) return;
  const when = cur.scheduledAt ? visitText(cur.scheduledAt.toISOString().slice(0, 10), cur.scheduledTime) : "—";
  const moved = await moveStage(
    id,
    "ASSIGNED",
    { status: "AWAITING_CONFIRM", appointmentStatus: "PENDING", workStatus: workStatusForStage("AWAITING_CONFIRM") },
    {
      userId: req.auth!.userId,
      action: "NEW_DATE_DECLINED",
      status: "AWAITING_CONFIRM",
      note: `ทีม${cur.assignedTeam ?? " —"} ไม่ว่างวันที่ลูกค้าขอ (${when}) — ${parsed.data.reason}`,
    }
  );
  if (!moved) return stageMoved(res);
  res.json(await detailFor(id));
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
  // บังคับ (เจ้าของงานขอ ต.ค. 69 รอบสอง) — แอดมินต้องมีวันไปเสนอร้าน ร้านขอเลื่อนได้ตอนคอนเฟิร์ม
  scheduledAt: dateField,
  scheduledTime: timeField,
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/inspect-request", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const parsed = inspectRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const cur = await guardStage(req, res, id, "NEW");
  if (!cur) return;

  const { team, scheduledAt, scheduledTime } = parsed.data;
  if (!(await teamExists(team))) return res.status(404).json({ error: `ไม่รู้จักทีม "${team}"` });

  const data = {
    // ยังไม่ถึงช่าง — แอดมินนัดร้านก่อน (วันที่หัวหน้าภาคใส่คือวันที่เสนอ ลูกค้าอาจขอเลื่อน)
    status: "INSPECT_CONFIRM",
    assignedTeam: team,
    assignedToId: null,
    scheduledAt: dayStart(scheduledAt),
    scheduledTime: scheduledTime ?? null,
    appointmentStatus: "PENDING",
    workStatus: workStatusForStage("INSPECT_CONFIRM"),
  };
  const log = {
    userId: req.auth!.userId,
    action: "INSPECT_REQUESTED",
    status: "INSPECT_CONFIRM",
    note: [`ให้ ${team} เข้าตรวจหน้างาน วันที่ ${visitText(scheduledAt, scheduledTime)}`, parsed.data.note]
      .filter(Boolean)
      .join(" — "),
  };
  if (!cur.outageId) {
    if (!(await moveStage(id, "NEW", data, log))) return stageMoved(res);
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.workOrder.update({ where: { id }, data });
      await writeLog(tx, id, log.userId, log.action, log.status, log.note);
      await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
    }, STAGE_TX);
  }

  res.json(await detailFor(id));
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

  // ครบสามอย่างของรอบตรวจนี้ — หัวหน้าภาคบันทึกแทนช่างก็ต้องครบ เพราะคนที่ใช้ไฟล์คือคนระบุอะไหล่
  // ไม่ใช่คนกด ไฟล์จากรอบตรวจก่อนไม่นับ เพราะเครื่องอาจเปลี่ยนอาการไปแล้ว
  const inspectStart =
    (
      await prisma.workOrderLog.findFirst({
        where: { workOrderId: id, action: "INSPECT_REQUESTED" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      })
    )?.createdAt ?? new Date(0);
  const got = await prisma.workOrderAttachment.groupBy({
    by: ["role"],
    where: { workOrderId: id, role: { in: [...INSPECTION_ROLES] }, createdAt: { gte: inspectStart } },
    _count: true,
  });
  const missing = INSPECTION_ROLES.filter((r) => !got.some((g) => g.role === r)).map((r) =>
    ATTACHMENT_ROLE_LABELS[r].replace(" (ตรวจ)", "")
  );
  if (missing.length) {
    return res.status(400).json({ error: `ยังขาด: ${missing.join(" · ")} — แนบให้ครบสามอย่างก่อนส่งผลตรวจ` });
  }

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
        // "รอช่าง" ที่ตั้งไว้ตอนส่งไปตรวจไม่จริงแล้ว · ค่าที่คนตั้งเองก็หมดอายุเมื่อเปลี่ยนขั้น
        workStatus: workStatusForStage("NEW"),
      },
    });
    await writeLog(tx, id, req.auth!.userId, "INSPECTED", "NEW", parsed.data.note);
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);

  res.json(await detailFor(id));
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
  note: string,
  /** ของที่ย้ายมาตอบไว้แล้วว่าหมด (แยกจากขั้นเบิก) — ขึ้นป้ายแดงรออะไหล่ทันที */
  outOfStock = false,
  /**
   * ปกติเริ่มที่แอดมินเบิก (ของที่ลูกค้าจ่ายแล้ว/ไม่ต้องเสนอราคา)
   * ของที่ยังไม่ได้เก็บเงิน เริ่มที่เช็คอะไหล่ (มี/หมด) แล้วเดินเสนอราคา → รับเงิน → เบิก ตามใบปกติ
   */
  startAt: "PARTS_REQUESTED" | "PARTS_SOURCING" = "PARTS_REQUESTED"
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
      /**
       * เริ่มที่แอดมินเบิกอะไหล่ตรง ๆ (เจ้าของงานเลือก ต.ค. 69) — เดิมเริ่มที่ "รออะไหล่เข้า" ของหัวหน้าภาค
       * แล้วหัวหน้าภาคกด "ของมาแล้ว" ส่งกลับให้แอดมินเบิก ทั้งที่คนรู้ว่าของเข้าเมื่อไรคือแอดมิน/คลัง
       * ของที่หมดขึ้นป้ายแดงอะไหล่หมดที่ขั้นนี้ แอดมินกด "อะไหล่มาแล้ว" ปุ่มเดียว · WAITING_PARTS เหลือไว้ให้ใบเก่า
       */
      status: startAt,
      needsParts: true,
      workStatus: workStatusForStage(startAt, { anyPartOutOfStock: outOfStock }),
      createdById: userId,
    },
  });
  const code = workOrderCode(child.id);
  await tx.workOrder.update({ where: { id: child.id }, data: { code } });
  // สถานะของประวัตินี้คือขั้นที่ใบใหม่เริ่ม — แถบขั้นตอนใช้ตัดว่าขั้นก่อนหน้านั้น "ทำในใบเดิม"
  await writeLog(tx, child.id, userId, "SPLIT_FROM", startAt, `แยกมาจาก ${parentCode} — ${note}`);
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
      machine: { select: { brand: true, model: true } },
      branch: { select: { region: true, zone: true, pmTeam: true, code: true, openedAt: true, warrantyExpiresAt: true } },
    },
  });
  if (!wo) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  // ก่อนจ่ายงานยังไม่มีใครไปหน้างาน ของที่ขาดยังแก้ในขั้นระบุอะไหล่/เช็คคลังได้
  // ทีมรับงานแล้ว (ลำดับใหม่ ทีมได้งานตอนจ่ายงานซึ่งเป็นขั้นสุดท้ายก่อนช่างเข้า)
  if (!["IN_PROGRESS", "DONE"].includes(wo.status)) {
    return res.status(409).json({
      error: `${wo.code} ยังไม่ถึงขั้นเข้าหน้างาน — แก้รายการอะไหล่ในใบนี้ได้เลย`,
    });
  }
  if (req.auth!.role === "SUPERVISOR") {
    if (await blockedForSupervisor(req, res, wo)) return;
  } else if (await blockedForTeam(req, res, wo)) return;

  const codes = await partCodesText(parsed.data.parts);
  const note = [`อะไหล่ที่ยังขาด: ${codes}`, parsed.data.note].filter(Boolean).join(" — ");

  /**
   * ของที่ขาดคือของใหม่ที่ไม่อยู่ในใบเสนอราคาของใบนี้ — ต้องเสนอราคาก่อนเบิกเหมือนใบปกติ
   * (เดิมเริ่มที่ขั้นเบิกเสมอ สาขาแฟรนไชส์หมดประกันได้ของไปโดยไม่มีใครเก็บเงิน — WO-00528)
   * กฎเดียวกับตอนหัวหน้าภาคระบุอะไหล่: แฟรนไชส์หมดประกัน · หรือมีของนอกสโตร์
   */
  const offCatalog = await prisma.sparePart.count({
    where: { id: { in: parsed.data.parts.map((p) => p.sparePartId) }, offCatalog: true },
  });
  const quoteFirst =
    offCatalog > 0 ||
    needsCustomerQuote({
      branchCode: wo.branch.code,
      needsParts: true,
      openedAt: wo.branch.openedAt,
      warrantyExpiresAt: wo.branch.warrantyExpiresAt,
      machineBrand: machineMake(wo.machine),
    });
  const child = await prisma.$transaction(async (tx) => {
    const made = await createFollowUp(tx, id, req.auth!.userId, note, false, quoteFirst ? "PARTS_SOURCING" : "PARTS_REQUESTED");
    await replaceParts(tx, made.id, "WAITING", parsed.data.parts);
    await writeLog(tx, id, req.auth!.userId, "SPLIT", wo.status, `เปิด ${made.code} รออะไหล่ — ${note}`);
    return made;
  }, STAGE_TX);

  res.json({ ...(await detailFor(id)), createdChild: child });
});

/**
 * คัดลอกเป็นใบทดสอบ (แอดมิน) — ใบใหม่ สาขา เครื่อง อาการ อะไหล่ ทีม วันนัด และขั้นเดียวกับใบต้นทาง
 * ลองเดินขั้นที่เหลือ (เช่นปิดงานพร้อมเคลม) ได้โดยไม่แตะใบจริง — ใบจริงที่เอามาทดสอบตรง ๆ ถูกปิดงานจริง
 *
 * ไม่คัดลอก: รูป/ไฟล์ ประวัติ ใบเคลม ผลปิดงาน และไม่ผูกกับเคสบนกระดาน (ปิดใบทดสอบต้องไม่ไปปิดเคสจริง)
 * ใบต้นทางที่ปิด/ยกเลิก/รอตรวจเคลมไปแล้ว → ใบทดสอบเริ่มที่ "รอช่างเข้างาน" ถ้ามีทีมแล้ว ไม่งั้นเริ่มใหม่
 */
router.post("/:id/test-copy", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const src = await prisma.workOrder.findUnique({
    where: { id },
    include: { parts: { where: { kind: "WAITING" } }, services: true },
  });
  if (!src) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  const ended = ["DONE", "CANCELLED", "CLAIM_REVIEW"].includes(src.status);
  const status = ended ? (src.assignedTeam || src.assignedToId ? "IN_PROGRESS" : "NEW") : src.status;

  const made = await prisma.$transaction(async (tx) => {
    const copy = await tx.workOrder.create({
      data: {
        code: "",
        source: "MANUAL",
        isTest: true,
        testOfId: src.id,
        branchId: src.branchId,
        machineId: src.machineId,
        jobType: src.jobType,
        title: src.title.startsWith("[ทดสอบ]") ? src.title : `[ทดสอบ] ${src.title}`,
        detail: src.detail,
        contactName: src.contactName,
        contactPhone: src.contactPhone,
        symptom: src.symptom,
        priority: src.priority,
        status,
        workStatus: workStatusForStage(status),
        needsParts: src.needsParts,
        assignedTeam: src.assignedTeam,
        assignedToId: src.assignedToId,
        scheduledAt: src.scheduledAt,
        scheduledTime: src.scheduledTime,
        appointmentStatus: src.appointmentStatus,
        inspectedAt: src.inspectedAt,
        inspectionNote: src.inspectionNote,
        createdById: req.auth!.userId,
      },
    });
    const code = workOrderCode(copy.id);
    await tx.workOrder.update({ where: { id: copy.id }, data: { code } });
    if (src.parts.length > 0) {
      await tx.workOrderPart.createMany({
        data: src.parts.map((p) => ({
          workOrderId: copy.id,
          sparePartId: p.sparePartId,
          quantity: p.quantity,
          kind: "WAITING",
          inStock: p.inStock,
          warehouse: p.warehouse,
          requisitionNo: p.requisitionNo,
          unit: p.unit,
          note: p.note,
          checkedAt: p.checkedAt,
          checkedById: p.checkedById,
        })),
      });
    }
    // ค่าบริการติดไปด้วย — ใบทดสอบที่ไม่มีค่าบริการจะไม่ผ่านขั้นเสนอราคาเหมือนใบจริง
    if (src.services.length > 0) {
      await tx.workOrderService.createMany({
        data: src.services.map((v) => ({ workOrderId: copy.id, name: v.name, quantity: v.quantity, unit: v.unit, note: v.note })),
      });
    }
    await writeLog(tx, copy.id, req.auth!.userId, "TEST_COPY", status, `ใบทดสอบ คัดลอกจาก ${src.code} — ทดสอบเสร็จให้ลบทิ้ง`);
    return { id: copy.id, code };
  }, STAGE_TX);
  res.status(201).json(made);
});

/** "SPHB144, D12-X x2" สำหรับเขียนลงประวัติ */
/**
 * ผลเช็คคลังรายตัว บรรทัดละตัว ลงประวัติใบงาน — ตัวที่เบิกไปแล้วรอบก่อน (ไม่ได้ตอบมารอบนี้) ไม่ซ้ำ
 */
async function partsCheckLines(
  waiting: { sparePartId: number; quantity: number }[],
  results: { sparePartId: number; inStock: boolean; warehouse?: string | null; requisitionNo?: string | null }[],
  offIds: Set<number>,
  arrivedIds: Set<number> = new Set(),
  noTransferIds: Set<number> = new Set()
) {
  const found = await prisma.sparePart.findMany({
    where: { id: { in: results.map((r) => r.sparePartId) } },
    select: { id: true, partCode: true },
  });
  return results
    .map((r) => {
      const qty = waiting.find((w) => w.sparePartId === r.sparePartId)?.quantity ?? 1;
      const code = found.find((f) => f.id === r.sparePartId)?.partCode ?? `#${r.sparePartId}`;
      const head = `${code} ×${qty}`;
      if (offIds.has(r.sparePartId)) return `${head} — ${r.inStock ? "ได้ของแล้ว" : "ยังไม่ได้ของ"}`;
      if (!r.inStock) return `${head} — หมด`;
      if (r.warehouse === ADMIN_WAREHOUSE) return `${head} · ${r.warehouse} · ใบเบิก ${r.requisitionNo?.trim()} — แอดมินเบิกแล้ว`;
      if (noTransferIds.has(r.sparePartId)) return `${head} · ${r.warehouse} (ไม่ต้องโอน) — ส่งหัวหน้าภาคเบิกส่งมอบ`;
      if (arrivedIds.has(r.sparePartId)) return `${head} · ${r.warehouse} (โอนมาแล้ว) — ส่งหัวหน้าภาคเบิกส่งมอบ`;
      return `${head} · ${r.warehouse} — ส่งหัวหน้าภาคเบิกและโอน`;
    })
    .join("\n");
}

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
 * เลื่อนวันคาดว่าของเข้า — แอดมินแก้วันได้โดยไม่ต้องเช็คคลังใหม่ทั้งชุด
 *
 * ผู้ขายเลื่อนส่งของเป็นเรื่องปกติ ถ้าต้องเปิดฟอร์มเช็คคลังเพื่อแก้วันอย่างเดียว
 * ผลเช็คของรอบนั้น (ใครเช็ค เมื่อไร) จะถูกเขียนทับทั้งที่ไม่ได้เช็คอะไรใหม่
 */
const partsEtaSchema = z.object({
  expectedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่คาดว่าของเข้าต้องเป็น ปี-เดือน-วัน")
    .nullable(),
  note: z.string().trim().max(500).optional(),
});

router.post("/:id/parts-eta", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  if (req.auth!.role !== "ADMIN") return res.status(403).json({ error: "เลื่อนวันคาดว่าของเข้าได้เฉพาะแอดมิน" });
  const parsed = partsEtaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });

  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: {
      code: true,
      status: true,
      partsExpectedAt: true,
      parts: { where: { kind: "WAITING", inStock: false }, select: { id: true } },
    },
  });
  if (!wo) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (!PARTS_OUT_STAGES.has(wo.status) || wo.parts.length === 0) {
    return res.status(409).json({ error: `${wo.code} ไม่ได้รออะไหล่ที่หมดอยู่ — ไม่มีวันคาดว่าของเข้าให้แก้` });
  }
  const { expectedAt, note } = parsed.data;
  const before = wo.partsExpectedAt ? wo.partsExpectedAt.toISOString().slice(0, 10) : null;

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: { partsExpectedAt: expectedAt ? new Date(`${expectedAt}T00:00:00.000Z`) : null },
    });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "PARTS_ETA_CHANGED",
      wo.status,
      [`คาดว่าของเข้า ${before ?? "ไม่ระบุ"} → ${expectedAt ?? "ไม่ระบุ"}`, note || null].filter(Boolean).join(" — ")
    );
  }, STAGE_TX);

  res.json(await detailFor(id));
});

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
      data: { status: "PARTS_REQUESTED", workStatus: workStatusForStage("PARTS_REQUESTED"), partsExpectedAt: null },
    });
    await writeLog(tx, id, req.auth!.userId, "PARTS_ARRIVED", "PARTS_REQUESTED", note.data || null);
  }, STAGE_TX);

  res.json(await detailFor(id));
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
      // ค่าที่การย้อนจะล้าง — เก็บไว้ในประวัติ ให้ขั้นที่ย้อนไปเติมค่าเดิมได้ (ดู RollbackSnapshot)
      needsParts: true,
      scheduledAt: true,
      scheduledTime: true,
      partsExpectedAt: true,
      parts: {
        where: { kind: "WAITING" },
        select: { sparePartId: true, inStock: true, warehouse: true, requisitionNo: true },
      },
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
  // ย้อนจากรอตรวจเคลมจะทิ้งเคลมค้างสถานะรอตรวจไว้ — ต้องผ่านปุ่มตีกลับ ซึ่งบันทึกเหตุผลให้ช่างเห็น
  if (wo.status === "CLAIM_REVIEW") {
    return res.status(409).json({ error: `${wo.code} รอตรวจเคลมอยู่ — ใช้ “ตีกลับ” ในส่วนตรวจเคลมแทนการย้อนขั้น` });
  }
  const order = WORK_ORDER_STAGE_ORDER as readonly string[];
  const from = order.indexOf(wo.status);
  const to = order.indexOf(toStage);
  if (toStage === "DONE" || to >= from) {
    return res.status(400).json({ error: "ย้อนได้เฉพาะขั้นที่ผ่านมาแล้ว" });
  }
  // ย้อนมาที่ขั้นนี้ตรง ๆ ไม่ได้ — ไม่รู้ว่าเลขใบเบิกตัวไหนเป็นของหัวหน้าภาคที่ต้องล้าง ให้ย้อนไปให้แอดมินเบิกใหม่
  if (toStage === "PARTS_PICKUP" || toStage === "PARTS_TRANSFER" || toStage === "PARTS_IN_TRANSIT") {
    return res.status(400).json({ error: "ย้อนไปขั้นหัวหน้าภาคเบิก/โอนอะไหล่ (คลังอื่น) ตรง ๆ ไม่ได้ — ย้อนไปขั้นแอดมินเบิกอะไหล่แทน" });
  }
  if (toStage === "WAITING_PARTS" && wo.parentId === null) {
    return res.status(400).json({ error: "ขั้นรออะไหล่มีเฉพาะใบงานที่แยกมาจากใบอื่น" });
  }
  if ((toStage === "INSPECTING" || toStage === "INSPECT_DISPATCH" || toStage === "INSPECT_CONFIRM") && !wo.assignedTeam) {
    return res.status(400).json({ error: "ใบนี้ยังไม่มีทีมที่ไปตรวจ — ย้อนไปขั้นระบุอะไหล่แล้วส่งตรวจใหม่" });
  }

  const at = (stage: string) => order.indexOf(stage);
  const data: Record<string, unknown> = { status: toStage };
  // วันนัดผูกกับรอบที่ถูกย้อนทิ้ง — ค้างไว้จะโผล่บนบอร์ดแผนงานทั้งที่ไม่มีใครจะไป
  // ยกเว้นย้อนไปให้หัวหน้าภาคส่งช่างตรวจ — วันนั้นร้านคอนเฟิร์มแล้ว แค่เปลี่ยนทีม/ส่งใหม่
  if (to <= at("PARTS_CHECKED") && toStage !== "INSPECT_DISPATCH") {
    data.scheduledAt = null;
    data.scheduledTime = null;
    data.appointmentStatus = null;
  } else if (toStage === "AWAITING_CONFIRM") {
    data.appointmentStatus = "PENDING";
  }
  // ย้อนไปให้แอดมินนัดตรวจใหม่ — วันเดิมถูกล้างไปข้างบนแล้ว แอดมินใส่วันที่นัดได้ใหม่
  if (toStage === "INSPECT_CONFIRM") data.appointmentStatus = "PENDING";
  // ย้อนไปถึงขั้นจ่ายงานหรือก่อนนั้น = ยังไม่มีทีมรับ ไม่งั้นใบจะค้างอยู่ในรายการของทีมเดิม
  // ยกเว้นย้อนไปตรวจหน้างาน ซึ่งทีมเดิมคือทีมที่ต้องไป
  if (to <= at("PARTS_CHECKED") && !["INSPECTING", "INSPECT_DISPATCH", "INSPECT_CONFIRM"].includes(toStage)) {
    data.assignedTeam = null;
    data.assignedToId = null;
  }
  if (toStage === "NEW") data.needsParts = null;
  // วันที่คาดว่าของเข้าเป็นของรอบเช็คอะไหล่ที่ถูกย้อนทิ้ง — ผล "หมด" ถูกล้างที่ขั้นเดียวกัน (ข้างล่าง)
  if (to <= at("PARTS_REQUESTED")) data.partsExpectedAt = null;
  const ws = workStatusForStage(toStage);
  if (ws !== undefined) data.workStatus = ws;

  await prisma.$transaction(async (tx) => {
    // ย้อนไปถึงขั้นเช็คคลังหรือก่อนนั้น ผลเช็ครอบเดิมใช้ไม่ได้แล้ว — แอดมินต้องเช็คใหม่
    if (to <= at("PARTS_REQUESTED")) {
      await tx.workOrderPart.updateMany({
        where: { workOrderId: id, kind: "WAITING" },
        // ข้อมูลการโอนรอบเดิมเก็บอยู่ในประวัติแล้ว (TRANSFER_REQUESTED) — แอดมินเช็คคลังใหม่ว่าของอยู่ไหน
        data: {
          inStock: null,
          warehouse: null,
          requisitionNo: null,
          transferFrom: null,
          transferReqNo: null,
          transferNo: null,
          transferredAt: null,
          checkedAt: null,
          checkedById: null,
        },
      });
    }
    await tx.workOrder.update({ where: { id }, data });
    const snapshot: RollbackSnapshot = {
      from: wo.status,
      needsParts: wo.needsParts,
      assignedTeam: wo.assignedTeam,
      scheduledAt: wo.scheduledAt?.toISOString().slice(0, 10) ?? null,
      scheduledTime: wo.scheduledTime,
      partsExpectedAt: wo.partsExpectedAt?.toISOString().slice(0, 10) ?? null,
      parts: wo.parts.filter((p) => p.inStock !== null),
    };
    await tx.workOrderLog.create({
      data: {
        workOrderId: id,
        userId: req.auth!.userId,
        action: "ROLLED_BACK",
        status: toStage,
        note: `จาก “${WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status}” กลับไป “${
          WORK_ORDER_STATUS_LABELS[toStage] ?? toStage
        }” — ${reason}`,
        meta: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);

  res.json(await detailFor(id));
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
  // แอปรุ่นเก่าไม่ส่งมา — ถือว่าเป็นเรื่องอะไหล่ตามที่ปุ่มเดิมตั้งใจไว้
  reasonCode: z.enum(SEND_BACK_REASONS).default("PARTS"),
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
  const existing = await prisma.workOrderPart.findMany({
    where: { workOrderId: id, kind: "WAITING" },
    select: { id: true, sparePartId: true, quantity: true, requisitionNo: true },
  });

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

  /**
   * ไปต่อตามเหตุผลที่ช่างเลือก (เจ้าของงานเลือก ต.ค. 69 — เดิมกลับขั้นแรกทุกครั้งแม้แค่ร้านปิด)
   *
   * ขออะไหล่มาด้วย = เรื่องอะไหล่เสมอ กลับไปให้หัวหน้าภาคระบุ ไม่ว่าเลือกเหตุผลอะไร
   * ร้านปิด/ลูกค้าไม่สะดวก → แอดมินนัดใหม่ ทีมเดิม อะไหล่เดิม (งานไม่ได้เปลี่ยน แค่วันเปลี่ยน)
   *   แล้วหัวหน้าภาครับทราบก่อนปล่อยงานตามปกติ
   * เครื่องมือ/คนไม่พอ · อื่น ๆ → หัวหน้าภาคจ่ายงานใหม่ (เปลี่ยนทีม/วัน)
   * ต้องตรวจเพิ่ม · อะไหล่ไม่ตรง → หัวหน้าภาคระบุอะไหล่ใหม่ (ฟอร์มเลือกตรวจหน้างานไว้ให้)
   */
  const code = parsed.data.reasonCode;
  const target: "NEW" | "AWAITING_CONFIRM" | "PARTS_CHECKED" =
    requested.length > 0 || code === "PARTS" || code === "INSPECT"
      ? "NEW"
      : code === "SHOP"
        ? "AWAITING_CONFIRM"
        : "PARTS_CHECKED";

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data:
        target === "NEW"
          ? {
              status: "NEW",
              // มีของอยู่ในใบ (ของเดิมหรือที่ช่างขอ) = ต้องใช้อะไหล่ · ไม่มีเลยก็เปิดให้ตัดสินใหม่
              needsParts: requested.length > 0 || existing.length > 0 ? true : null,
              partsExpectedAt: null,
              // "รอช่างเข้าแก้ไข" ของรอบที่แล้วไม่จริงแล้ว — งานกลับมารอหัวหน้าภาค
              workStatus: workStatusForStage("NEW"),
              // ช่างคนเดิมยังติดอยู่กับใบงาน หัวหน้าภาคเปลี่ยนได้ตอนจ่ายงานรอบใหม่
              scheduledAt: null,
              scheduledTime: null,
              appointmentStatus: null,
            }
          : target === "AWAITING_CONFIRM"
            ? // วันเดิมคงไว้ให้แอดมินเห็นว่านัดเดิมคือวันไหน — ฟอร์มคอนเฟิร์มเปิดที่ "ลูกค้าขอเลื่อน"
              { status: target, appointmentStatus: "PENDING", workStatus: workStatusForStage(target) }
            : // ทีมเดิมไม่ได้ผูกต่อ — ทีมที่ค้างอยู่จะทำให้ใบโผล่ในรายการของทีมนั้นทั้งที่ยังไม่ได้จ่าย
              {
                status: target,
                assignedTeam: null,
                assignedToId: null,
                scheduledAt: null,
                scheduledTime: null,
                appointmentStatus: null,
                workStatus: workStatusForStage(target),
              },
    });

    /**
     * ของเดิมอยู่ครบ ตัวที่ช่างขอต่อท้าย (เจ้าของงานขอ ต.ค. 69)
     *
     * เดิมแทนที่ด้วยรายการที่ช่างขอ — ของที่เบิกไปแล้วหายจากใบ ทั้งที่อยู่กับช่างจริง
     * และไม่มีใครรู้ว่าต้องคืนคลังหรือใช้ต่อ · ตอนนี้หัวหน้าภาคเห็นทั้งหมดแล้วตัดสินเองว่าตัดตัวไหน
     *
     * ตัวที่ขอซ้ำกับของเดิม = ของที่เบิกไปใช้ไม่ได้ (เสีย/ผิดรุ่น) ต้องเบิกใหม่ — ล้างผลเช็คของแถวนั้น
     * ให้แอดมินเบิกรอบใหม่ เลขใบเบิกเดิมเขียนลงประวัติไว้ ไม่หายไปเงียบ ๆ
     */
    const again: string[] = [];
    for (const r of requested) {
      const row = existing.find((e) => e.sparePartId === r.sparePartId);
      if (!row) continue;
      await tx.workOrderPart.update({
        where: { id: row.id },
        data: {
          quantity: Math.max(row.quantity, r.quantity),
          inStock: null,
          warehouse: null,
          requisitionNo: null,
          transferFrom: null,
          transferReqNo: null,
          transferNo: null,
          transferredAt: null,
          checkedAt: null,
          checkedById: null,
        },
      });
      if (row.requisitionNo) again.push(row.requisitionNo);
    }
    const fresh = requested.filter((r) => !existing.some((e) => e.sparePartId === r.sparePartId));
    if (fresh.length) {
      await tx.workOrderPart.createMany({
        data: fresh.map((r) => ({ workOrderId: id, sparePartId: r.sparePartId, quantity: r.quantity, kind: "WAITING" })),
      });
    }

    // หมวดอยู่หน้าข้อความ — กล่อง "ช่างส่งกลับ" ของหัวหน้าภาคและประวัติอ่านจากโน้ตเดียวกัน
    const head = `[${SEND_BACK_REASON_LABELS[parsed.data.reasonCode]}] ${parsed.data.reason}`;
    const note =
      (requestedCodes.length > 0 ? `${head} — ขอเบิกเพิ่ม: ${requestedCodes.join(", ")}` : head) +
      (again.length ? ` (ใบเบิกเดิม ${[...new Set(again)].join(", ")})` : "");
    await writeLog(tx, id, req.auth!.userId, "PARTS_ROLLBACK", target, note);
    await syncOutageFromWorkOrder(tx, id, req.auth!.userId);
  }, STAGE_TX);

  res.json(await detailFor(id));
});

// ── ปิดงาน ────────────────────────────────────────────

const closeSchema = z.object({
  result: z.enum(WORK_ORDER_RESULTS),
  note: z.string().optional(),
  parts: z
    .array(
      z.object({
        sparePartId: z.number().int(),
        quantity: z.number().int().min(1),
        unit: z.string().trim().max(20).nullable().optional(),
        note: z.string().trim().max(300).nullable().optional(),
      })
    )
    .optional(),
  // ของนอกสโตร์ที่ช่างซื้อ/ใช้หน้างานเอง พิมพ์ชื่อมา (เจ้าของงานเลือก ต.ค. 69) — ไม่ต้องมีใบเบิก
  offParts: z.array(offPartInput).max(20).optional(),
  // คนที่เข้าไปทำจริง — จำเป็นเพราะงานถูกจ่ายให้ทีม ไม่ได้จ่ายรายคน
  // ถ้าไม่เก็บ จะไม่มีทางรู้ย้อนหลังว่าใครไปสาขาไหนวันไหน
  //
  // ไม่เกินสามคน เท่าที่ทีมหนึ่งไปกันจริง หน้าจอก็มีสามช่องตรงกัน
  workerIds: z.array(z.number().int().positive()).max(3).optional(),
  // คนนอกระบบที่ไปด้วย เช่น ผู้รับเหมา — ไม่บังคับ
  otherWorkers: z.string().trim().max(300).nullable().optional(),
  // ใบงาน SUB: ทีม outsource ที่เข้าทำ — บังคับเมื่อใบจ่ายให้ทีม outsource (ดูข้างล่าง)
  subTeam: z.string().trim().max(120).nullable().optional(),
  // อะไหล่ที่ต้องส่งของเก่าเคลม (ฟอร์มใบเคลมอะไหล่) — มีอย่างน้อยหนึ่งชิ้น ใบงานไปรอ Admin Spare Part ตรวจก่อนปิด
  claims: z
    .array(
      z.object({
        sparePartId: z.number().int(),
        brokenPartCode: z.string().trim().max(100).default(""),
        symptom: z.string().trim().max(1000).default(""),
        checkNote: z.string().trim().max(2000).default(""),
        troubleshooting: z.array(z.string().max(300)).max(50).default([]),
      })
    )
    .max(20)
    .optional(),
  /**
   * ข้อมูลป้ายรุ่น + เช็คตามคู่มือ ของเคลมในใบนี้ (เครื่องเดียว ใช้ร่วมทุกชิ้น) — ดู utils/claimGuide.ts
   * crop คือภาพบรรทัดที่สแกน (JPEG data URL เล็ก) ให้ Admin Spare Part เทียบ · เพดานกันไฟล์ใหญ่หลุดเข้าฐานข้อมูล
   */
  claimNameplate: z
    .object({
      fields: z
        .array(
          z.object({
            key: z.string().max(40),
            label: z.string().max(60),
            value: z.string().trim().max(60),
            source: z.enum(["SCAN", "HAND"]),
            crop: z.string().max(60_000).startsWith("data:image/").nullable().optional(),
          })
        )
        .max(12),
      /** ช่างติ๊กว่าดูค่าที่ระบบอ่านเทียบกับรูปป้ายแล้ว — OCR อ่านผิดซ้ำแบบเดิมได้ (01/2022 → 01/2029 ทุกรอบ) */
      verified: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  claimCheck: z
    .object({
      errorCode: z.string().trim().max(60),
      checked: z.array(z.string().max(200)).max(20).default([]),
    })
    .nullable()
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
    select: {
      status: true,
      code: true,
      assignedToId: true,
      assignedTeam: true,
      // ทีม outsource — หัวหน้าภาคในพื้นที่ปิดแทนได้ (ดู blockedForTeam)
      branch: { select: { region: true, zone: true, pmTeam: true } },
    },
  });
  if (!current) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (current.status === "DONE") {
    return res.status(400).json({ error: `${current.code} ปิดไปแล้ว` });
  }
  if (current.status === "CANCELLED") {
    return res.status(400).json({ error: `${current.code} ถูกยกเลิกไปแล้ว` });
  }
  if (current.status === "CLAIM_REVIEW") {
    return res.status(400).json({ error: `${current.code} ปิดงานแล้ว กำลังรอ Admin Spare Part ตรวจเคลม` });
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
  /**
   * ใบงาน SUB (จ่ายให้ทีม outsource) ต้องบอกว่าทีม SUB ไหนเข้าทำ — ช่างทีมนอกไม่มีบัญชี เลือกจากรายชื่อช่างไม่ได้
   * ทีมนี้แทน "ผู้เข้าปฏิบัติงาน" ได้ (ชื่อช่างของทีมไม่บังคับ) · ต้องเป็นทีม outsource ที่มีในระบบ
   */
  /**
   * ทุกอย่างที่ต้องอ่านเพื่อตรวจ อ่านพร้อมกันสองรอบ ไม่ต่อคิวทีละอย่าง (เดิมเจ็ดรอบ ~0.23 วิ/รอบ —
   * เจ้าของงานถามว่าทำไมบันทึกช้า ต.ค. 69) · ยังตรวจและตอบข้อผิดพลาดตามลำดับเดิมทุกข้อ
   * ไฟล์ของรอบนี้นับทุกประเภทในคำสั่งเดียว (ก่อน/หลังซ่อม · ป้ายรุ่น · ใบเหลือง)
   */
  const [outsourceNow, foundWorkers, roundStart] = await Promise.all([
    freshOutsource(),
    workerIds.length > 0 ? prisma.user.count({ where: { id: { in: workerIds }, deletedAt: null } }) : Promise.resolve(0),
    roundStartedAt(id),
  ]);
  const roundFiles = await prisma.workOrderAttachment.groupBy({
    by: ["role"],
    where: { workOrderId: id, role: { in: ["BEFORE", "AFTER", "NAMEPLATE", "REQUISITION"] }, createdAt: { gte: roundStart } },
    _count: true,
  });
  const has = (role: string) => roundFiles.some((f) => f.role === role);
  const subTeam = body.subTeam?.trim() || null;
  if (subTeam && !outsourceNow.has(subTeam)) {
    return res.status(400).json({ error: `ไม่รู้จักทีม SUB "${subTeam}" — เลือกจากรายชื่อทีม outsource` });
  }
  if (outsourceNow.has(current.assignedTeam ?? "") && !subTeam) {
    return res.status(400).json({ error: "ใบงาน SUB ต้องเลือกทีม SUB ที่เข้าทำ" });
  }
  if (workerIds.length === 0 && !otherWorkers && !subTeam) {
    return res.status(400).json({ error: "ต้องระบุชื่อผู้เข้าปฏิบัติงานอย่างน้อยหนึ่งคน" });
  }
  if (workerIds.length > 0) {
    if (foundWorkers !== workerIds.length) {
      return res.status(400).json({ error: "มีชื่อผู้เข้าปฏิบัติงานที่ไม่อยู่ในระบบ" });
    }
  }

  /**
   * ต้องมีรูปหรือวิดีโอก่อนซ่อมและหลังซ่อม อย่างละอย่างน้อยหนึ่งไฟล์ ของรอบนี้ (เจ้าของงานขอ ต.ค. 69)
   *
   * รูปคือสิ่งเดียวที่บอกได้ว่าไปถึงจริง เจออะไร และซ่อมแล้วเครื่องกลับมาจริง — สรุปงานที่พิมพ์มา
   * เป็นคำบอกเล่า · ก่อน/หลังแยกกันเพราะคนตรวจย้อนอยากเทียบสองภาพนี้ ไม่ใช่ไล่หาในกองรูป
   * นับเฉพาะรอบนี้เหมือนป้ายรุ่น — ใบที่วนกลับมา รูปหลังซ่อมของรอบก่อนไม่ได้บอกว่ารอบนี้ซ่อมเสร็จ
   */
  if (!has("BEFORE")) {
    return res.status(400).json({ error: "ต้องแนบรูปหรือวิดีโอก่อนซ่อมอย่างน้อยหนึ่งไฟล์" });
  }
  if (!has("AFTER")) {
    return res.status(400).json({ error: "ต้องแนบรูปหรือวิดีโอหลังซ่อมอย่างน้อยหนึ่งไฟล์" });
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
  if (!has("NAMEPLATE")) {
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
  const usedLines: PartLine[] | undefined =
    body.parts === undefined && body.offParts === undefined
      ? undefined
      : [...(body.parts ?? []), ...(await resolveOffParts(body.offParts))];
  const offUsed = new Set(
    (
      await prisma.sparePart.findMany({
        where: { id: { in: (usedLines ?? []).map((p) => p.sparePartId) }, offCatalog: true },
        select: { id: true },
      })
    ).map((x) => x.id)
  );
  // ใบเหลืองคือเอกสารของที่ออกจากคลัง — ของนอกสโตร์ไม่ได้ออกจากคลัง ใช้แต่ของนอกสโตร์จึงไม่ต้องแนบ
  if ((usedLines ?? []).some((p) => !offUsed.has(p.sparePartId))) {
    if (!has("REQUISITION")) {
      return res.status(400).json({
        error: "ใช้อะไหล่แล้วต้องแนบรูปใบเบิกอะไหล่ (ใบเหลือง) ของรอบนี้ก่อนปิดงาน",
      });
    }
  }

  /**
   * ต้องสรุปว่าทำอะไรไป (เจ้าของงานกำหนด ต.ค. 69)
   *
   * "ซ่อมเสร็จ" อย่างเดียวไม่บอกว่าเปลี่ยนอะไร — ครั้งหน้าเครื่องเดิมเสียอีก คนที่เปิดดู
   * ต้องรู้ว่ารอบก่อนทำอะไรไปแล้ว ตรวจเป็นอย่างสุดท้าย เพราะช่างที่ขาดรูปหรือใบเหลือง
   * ควรได้ยินเรื่องนั้นก่อน (สรุปงานพิมพ์ได้ทันที รูปต้องเดินกลับไปถ่าย)
   */
  /**
   * เคลมอะไหล่เก่า — ตรวจหลักฐานครบตามฟอร์ม "เอกสารใบเคลมอะไหล่" ก่อนส่งให้ Admin Spare Part
   *
   * ผู้ขายรับเคลมเฉพาะเมื่อหลักฐานครบ (รูปอะไหล่/อาการ วิดีโอ Error code วิดีโอการตรวจเช็ค
   * และ Troubleshooting สำหรับ Huebsch/Primus) — ขาดข้อไหนก็ถูกปฏิเสธ แล้วต้องตามช่างกลับไปถ่ายใหม่
   * ซึ่งตอนนั้นอะไหล่เก่าอาจทิ้งไปแล้ว จึงกันตั้งแต่ตอนปิดงาน · รูป Nameplate ใช้ป้ายรุ่นที่ตรวจไว้ข้างบน
   */
  const claimInputs = body.claims ?? [];
  const claimRows: Prisma.PartClaimCreateManyInput[] = [];
  if (claimInputs.length > 0) {
    // สามอย่างไม่ขึ้นต่อกัน — อ่านพร้อมกัน
    const [ctx, spares, evidence] = await Promise.all([
      prisma.workOrder.findUniqueOrThrow({
        where: { id },
        select: {
          branch: { select: { code: true, name: true, openedAt: true } },
          machine: { select: { code: true, brand: true, model: true } },
        },
      }),
      prisma.sparePart.findMany({
        where: { id: { in: claimInputs.map((c) => c.sparePartId) } },
        select: { id: true, partCode: true, name: true },
      }),
      prisma.workOrderAttachment.groupBy({
        by: ["sparePartId", "role"],
        where: {
          workOrderId: id,
          role: { in: [...CLAIM_EVIDENCE_ROLES] },
          createdAt: { gte: roundStart },
        },
        _count: true,
      }),
    ]);
    const used = new Map((usedLines ?? []).map((p) => [p.sparePartId, p.quantity]));
    const make = machineMake(ctx.machine);
    const ts = claimTroubleshootingFor(make);
    /**
     * ข้อมูลป้ายรุ่น — ต้องมีอย่างน้อยหนึ่งช่อง (สแกนหรือพิมพ์) · เช็คตามคู่มือเฉพาะยี่ห้อที่มีคู่มือ (Alliance)
     * ต้องเลือก Error — ช่างแค่ตอบ ระบบไม่ตัดสินว่ารับประกันหรือไม่
     */
    const guide = claimGuideFor(make);
    const plateFields = (body.claimNameplate?.fields ?? []).filter((f) => f.value);
    if (plateFields.length === 0) {
      return res.status(400).json({ error: "เคลมอะไหล่ต้องสแกนหรือกรอกข้อมูลป้ายรุ่นอย่างน้อยหนึ่งช่อง" });
    }
    if (plateFields.some((f) => f.source === "SCAN") && !body.claimNameplate?.verified) {
      return res.status(400).json({ error: "ต้องติ๊กว่าตรวจค่าที่ระบบอ่านกับรูปป้ายรุ่นแล้ว" });
    }
    let fieldCheck: Prisma.InputJsonValue | undefined;
    if (guide.errors.length) {
      const chk = body.claimCheck;
      const err = guide.errors.find((e) => e.code === chk?.errorCode);
      if (!chk || !err) return res.status(400).json({ error: "เคลมเครื่องยี่ห้อนี้ต้องเลือก Error ที่เครื่องขึ้น (ตามคู่มือ)" });
      fieldCheck = {
        errorCode: err.code,
        errorName: err.name,
        checked: err.checks.filter((c) => chk.checked.includes(c)),
      };
    }
    // รูปป้ายเต็มที่ช่างถ่าย (ขึ้นเป็นไฟล์ป้ายรุ่นของรอบนี้ก่อนสั่งปิด) — ผูกไว้กับใบเคลม
    // ให้ Admin Spare Part เห็นรูปที่ระบบอ่านค่ามา ไม่ต้องไล่หาในกองไฟล์ของใบงาน
    const platePhoto = await prisma.workOrderAttachment.findFirst({
      where: { workOrderId: id, role: "NAMEPLATE", createdAt: { gte: roundStart } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const nameplate: Prisma.InputJsonValue = {
      family: guide.plate.family,
      photoId: platePhoto?.id ?? null,
      verified: !!body.claimNameplate?.verified,
      fields: plateFields.map((f) => ({ key: f.key, label: f.label, value: f.value, source: f.source, crop: f.crop ?? null })),
    };
    for (const c of [...new Map(claimInputs.map((x) => [x.sparePartId, x])).values()]) {
      const sp = spares.find((x) => x.id === c.sparePartId);
      if (!sp || !used.has(c.sparePartId)) {
        return res.status(400).json({ error: "เคลมได้เฉพาะอะไหล่ที่ใส่ไว้ในรายการอะไหล่ที่ใช้" });
      }
      const missing = CLAIM_EVIDENCE_ROLES.filter(
        (role) => !evidence.some((e) => e.sparePartId === c.sparePartId && e.role === role)
      ).map((role) => ATTACHMENT_ROLE_LABELS[role].replace(" (เคลม)", ""));
      if (missing.length) {
        return res.status(400).json({ error: `เคลม ${sp.partCode}: ยังขาด${missing.join(" · ")}` });
      }
      if (!c.brokenPartCode) {
        return res.status(400).json({ error: `เคลม ${sp.partCode}: ต้องกรอกรหัสอะไหล่ตัวที่เสีย (ตัวที่ส่งเคลม)` });
      }
      if (!c.symptom) return res.status(400).json({ error: `เคลม ${sp.partCode}: ต้องกรอกอาการ/สาเหตุ` });
      if (!c.checkNote) {
        return res.status(400).json({ error: `เคลม ${sp.partCode}: ต้องกรอกว่าเข้าเช็คอะไรบ้าง จึงระบุว่าควรเปลี่ยนชิ้นนี้` });
      }
      const done = ts ? ts.items.filter((i) => c.troubleshooting.includes(i)) : [];
      if (ts && done.length < ts.items.length) {
        return res.status(400).json({
          error: `เคลม ${sp.partCode}: เครื่อง ${ts.brand} ต้องทำ Troubleshooting ครบ (${done.length}/${ts.items.length})`,
        });
      }
      claimRows.push({
        workOrderId: id,
        sparePartId: sp.id,
        partCode: sp.partCode,
        partName: sp.name,
        brokenPartCode: c.brokenPartCode,
        quantity: used.get(sp.id) ?? 1,
        branchCode: ctx.branch.code,
        branchName: ctx.branch.name,
        branchOpenedAt: ctx.branch.openedAt,
        brand: make,
        model: ctx.machine?.model ?? null,
        machineCode: ctx.machine?.code ?? null,
        symptom: c.symptom,
        checkNote: c.checkNote,
        troubleshooting: done,
        nameplate,
        fieldCheck,
        createdById: req.auth!.userId,
      });
    }
  }

  if (!body.note?.trim()) {
    return res.status(400).json({ error: "ต้องสรุปงานที่ทำ — เช่น เปลี่ยนอะไรไป ทดสอบแล้วเป็นยังไง" });
  }

  // มีเคลม = ยังไม่ปิดจริง รอ Admin Spare Part ตรวจหลักฐานก่อน (ข้อมูลปิดงานบันทึกไว้แล้ว อนุมัติแล้วไม่ต้องกรอกซ้ำ)
  const nextStatus = claimRows.length > 0 ? "CLAIM_REVIEW" : "DONE";
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: {
        status: nextStatus,
        closedAt: now,
        closedById: req.auth!.userId,
        closeResult: body.result,
        closeNote: body.note?.trim() || null,
        closeOtherWorkers: otherWorkers,
        closeSubTeam: subTeam,
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
    if (usedLines !== undefined) await replaceParts(tx, id, "USED", usedLines);

    if (claimRows.length > 0) await tx.partClaim.createMany({ data: claimRows });

    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "CLOSED",
      nextStatus,
      [subTeam ? `บันทึกผลงาน SUB · ทีม ${subTeam}` : null, body.note?.trim() || null].filter(Boolean).join(" — ") || null
    );
    if (claimRows.length > 0) {
      await writeLog(
        tx,
        id,
        req.auth!.userId,
        "CLAIM_SUBMITTED",
        nextStatus,
        `ส่งเคลมอะไหล่เก่า: ${claimRows.map((c) => c.partCode).join(", ")}`
      );
    }
  }, STAGE_TX);

  res.json(await detailFor(id));
});

/**
 * ตรวจเคลมอะไหล่ (Admin Spare Part) — อนุมัติแล้วปิดงาน · ตีกลับแล้วใบงานกลับไปที่ช่าง
 *
 * ตีกลับต้องบอกเหตุผลเสมอ ช่างเห็นข้อความนี้บนใบงาน — ตีกลับเฉย ๆ ช่างไม่รู้ว่าต้องถ่ายอะไรใหม่
 * ตีกลับแล้วล้างแค่เวลาปิด (ใบงานยังไม่จบ) — ผล สรุปงาน ผู้เข้าปฏิบัติงาน ไฟล์ และใบเคลมรอบนั้นอยู่ครบ
 * หน้าจอแสดงเป็น "ผลการทำงานรอบที่ถูกตีกลับ" พร้อมเหตุผล และฟอร์มปิดใหม่ดึงค่าเดิมมาให้แก้เฉพาะจุด
 */
const claimReviewSchema = z.object({
  approve: z.boolean(),
  reason: z.string().trim().max(1000).optional(),
});

router.post("/:id/claim-review", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  if (!canReviewClaims(req.auth)) {
    return res.status(403).json({ error: "ตรวจเคลมได้เฉพาะ Admin Spare Part" });
  }
  const parsed = claimReviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง" });
  const { approve, reason } = parsed.data;

  const wo = await prisma.workOrder.findUnique({ where: { id }, select: { code: true, status: true } });
  if (!wo) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (wo.status !== "CLAIM_REVIEW") {
    return res.status(409).json({
      error: `${wo.code} ไม่ได้รอตรวจเคลม — ตอนนี้อยู่ขั้น "${WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status}"`,
    });
  }
  if (!approve && !reason) {
    return res.status(400).json({ error: "ตีกลับต้องบอกเหตุผล — ช่างจะได้รู้ว่าต้องแก้อะไร" });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.partClaim.updateMany({
      where: { workOrderId: id, status: "PENDING" },
      data: {
        status: approve ? "APPROVED" : "REJECTED",
        rejectReason: approve ? null : reason,
        reviewedById: req.auth!.userId,
        reviewedAt: now,
      },
    });
    if (approve) {
      await tx.workOrder.update({ where: { id }, data: { status: "DONE", workStatus: workStatusForStage("DONE") } });
      await writeLog(tx, id, req.auth!.userId, "CLAIM_APPROVED", "DONE", reason || null);
    } else {
      await tx.workOrder.update({
        where: { id },
        // ล้างเฉพาะเวลาปิด (ใบงานยังไม่จบ) — ผล สรุปงาน คนที่ไป คนที่ปิด เก็บไว้ (เจ้าของงานขอ ต.ค. 69)
        // ช่างกลับมาแก้แค่ที่ถูกตีกลับ ไม่ต้องกรอกใหม่หมด และคนอื่นยังเห็นว่ารอบที่ถูกตีกลับส่งอะไรมา
        data: {
          status: "IN_PROGRESS",
          closedAt: null,
          workStatus: workStatusForStage("IN_PROGRESS"),
        },
      });
      await writeLog(tx, id, req.auth!.userId, "CLAIM_REJECTED", "IN_PROGRESS", reason!);
    }
  }, STAGE_TX);

  res.json(await detailFor(id));
});

/**
 * ใบเคลมเป็น PDF หน้าตาตามหน้า "ข้อมูลแจ้งเคลม" ของฟอร์ม — ส่งให้ผู้ขายพร้อมไฟล์หลักฐาน
 * ยังไม่อนุมัติก็เปิดได้ (Admin Spare Part ดูก่อนกดอนุมัติ) แต่มีคำว่า "ร่าง" กำกับ
 */
async function claimPdf(req: AuthRequest, res: Response) {
  const id = Number(req.params.id);
  const claimId = Number(req.params.claimId);
  if (!Number.isInteger(id) || !Number.isInteger(claimId)) {
    res.status(400).json({ error: "รหัสไม่ถูกต้อง" });
    return null;
  }
  const wo = await loadAttachableWorkOrder(req, res, id);
  if (!wo) return null;
  const claim = await prisma.partClaim.findFirst({ where: { id: claimId, workOrderId: id } });
  if (!claim) {
    res.status(404).json({ error: "ไม่พบใบเคลมนี้" });
    return null;
  }
  const [requester, files] = await Promise.all([
    claim.createdById
      ? prisma.user.findUnique({ where: { id: claim.createdById }, select: { name: true } })
      : Promise.resolve(null),
    prisma.workOrderAttachment.findMany({
      where: { workOrderId: id, sparePartId: claim.sparePartId, role: { in: [...CLAIM_EVIDENCE_ROLES] } },
      select: { role: true },
    }),
  ]);
  const pdf = await buildPartClaimPdf({
    workOrderCode: wo.code,
    claim,
    requesterName: requester?.name ?? null,
    evidence: [...new Set(files.map((f) => ATTACHMENT_ROLE_LABELS[f.role!]?.replace(" (เคลม)", "") ?? f.role!))],
  });
  return { pdf, filename: `ใบเคลม-${wo.code}-${claim.partCode}.pdf`, ascii: `claim-${wo.code}-${claim.id}.pdf` };
}

router.get("/:id/claims/:claimId/pdf", requireAuth, async (req: AuthRequest, res) => {
  const out = await claimPdf(req, res);
  if (!out) return;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${out.ascii}"; filename*=UTF-8''${encodeURIComponent(out.filename)}`);
  res.send(out.pdf);
});

/**
 * ลิงก์เปิดใบเคลม — แอปบนมือถือส่งต่อให้เบราว์เซอร์เปิด ซึ่งแนบ Authorization header เองไม่ได้
 * จึงเก็บไฟล์ไว้ในที่เก็บเอกสารชั่วคราวแล้วคืนลิงก์ที่มี token (แบบเดียวกับใบขอโอนสินค้า)
 */
router.post("/:id/claims/:claimId/pdf-link", requireAuth, async (req: AuthRequest, res) => {
  const out = await claimPdf(req, res);
  if (!out) return;
  const stored = saveDocument({
    filename: out.filename,
    asciiFilename: out.ascii,
    mimeType: "application/pdf",
    data: out.pdf,
    ownerId: req.auth!.userId,
  });
  res.status(201).json({ path: documentPath(stored) });
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
  // ช่างปิดแล้ว รอตรวจเคลมอยู่ — ปิดย้อนหลังตรงนี้คือข้ามการตรวจเคลมไปเงียบ ๆ
  if (wo.status === "CLAIM_REVIEW") {
    return res.status(400).json({ error: `${wo.code} รอ Admin Spare Part ตรวจเคลม — ใช้ปุ่มอนุมัติหรือตีกลับในใบงาน` });
  }

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
  // ปิดย้อนหลัง: รูปหน้างานแบบเดิมหรือรูปก่อน/หลังซ่อม อย่างใดก็ได้ — งานจบไปแล้ว ไม่มีจังหวะให้ถ่ายแยก
  const siteShots = await prisma.workOrderAttachment.count({
    where: { workOrderId: id, OR: [{ role: null }, { role: { in: ["BEFORE", "AFTER"] } }] },
  });
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
      if (["NEW", "INSPECT_CONFIRM", "INSPECT_DISPATCH", "INSPECTING"].includes(wo.status)) {
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
      // ลำดับ: จ่ายงาน+วัน (หัวหน้าภาค) → คอนเฟิร์มลูกค้า (แอดมิน) → ยืนยันออกงาน (หัวหน้าภาค)
      const when = `${b.visitDate}${b.visitTime ? ` เวลา ${b.visitTime} น.` : ""}`;
      if (before("PARTS_CHECKED") || wo.assignedTeam !== b.team) {
        await log("ASSIGNED", "AWAITING_CONFIRM", visit, `จ่ายงานให้ ${b.team} · เข้างาน ${when}`);
      }
      if (before("AWAITING_CONFIRM")) {
        await log("CONFIRMED", "ASSIGNED", visit, `เข้างาน ${when} (ไม่ผ่านคอนเฟิร์มในระบบ)`);
      }
      if (before("ASSIGNED")) {
        await log("DISPATCHED", "IN_PROGRESS", visit, `ยืนยันออกงาน ${b.team}`);
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

  res.json(await detailFor(id));
});

/**
 * หัวหน้าภาคปิดใบงานเอง ไม่ต้องส่งช่างเข้าหน้างาน (เจ้าของงานขอ ต.ค. 69 รอบสอง)
 *
 * ต่างจากยกเลิก: ยกเลิก = ไม่ทำงานนี้แล้ว · ปิดแบบนี้ = ปัญหาจบแล้ว นับเป็นงานที่ปิด
 * บังคับเหตุผลจากรายการ + รายละเอียดอย่างน้อย SUPERVISOR_CLOSE_MIN_NOTE ตัวอักษร ไม่บังคับรูป
 * (รอบแรกบังคับรูปแล้วถูกขอเอาออก — หัวหน้าภาคมักรู้ผลทางโทรศัพท์ ไม่มีรูปให้แนบ)
 *
 * กดได้ทุกขั้นที่ยังไม่ปิด ยกเว้นรอตรวจเคลม (ปิดตรงนี้คือข้ามการตรวจเคลมไปเงียบ ๆ)
 * อะไหล่ที่เบิกไปแล้วไม่บล็อก — หน้าต่างเตือนให้คืนคลัง ระบบไม่บันทึกว่าใช้ไป
 * ใบที่ปิดแล้วหลุดจากกล่องงานและบอร์ดแผนงานเอง (ดึงเฉพาะใบที่ยังไม่ปิด)
 */
const supervisorCloseSchema = z.object({
  reason: z.enum(Object.keys(SUPERVISOR_CLOSE_REASONS) as [string, ...string[]], {
    errorMap: () => ({ message: "เลือกเหตุผลที่ปิดใบงาน" }),
  }),
  note: z.string().trim().max(1000).optional(),
  // เฉพาะ TECH_FIXED — ใครเข้า (ช่างในระบบ / คนนอกระบบ / ทีม SUB) วันที่เข้า อะไหล่ที่ใช้
  workerIds: z.array(z.number().int().positive()).max(3).optional(),
  otherWorkers: z.string().trim().max(300).nullable().optional(),
  subTeam: z.string().trim().max(120).nullable().optional(),
  visitDate: dateField.optional(),
  parts: z.array(z.object({ sparePartId: z.number().int(), quantity: z.number().int().min(1).max(999) })).max(30).optional(),
});

router.post("/:id/supervisor-close", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });
  const role = req.auth!.role;
  if (role !== "ADMIN" && role !== "SUPERVISOR") {
    return res.status(403).json({ error: "ปิดใบงานแบบนี้ได้เฉพาะหัวหน้าภาคกับแอดมิน — ช่างปิดงานจากหน้างานตามปกติ" });
  }
  const parsed = supervisorCloseSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const note = parsed.data.note?.trim() ?? "";
  if (note.length < SUPERVISOR_CLOSE_MIN_NOTE) {
    return res.status(400).json({
      error: `พิมพ์รายละเอียดอย่างน้อย ${SUPERVISOR_CLOSE_MIN_NOTE} ตัวอักษร — เช่น โทรถามร้านเมื่อไร ใครยืนยันว่าเครื่องใช้ได้`,
    });
  }

  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: { code: true, status: true, assignedTeam: true, branch: { select: { region: true, zone: true, pmTeam: true } } },
  });
  if (!wo) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (role === "SUPERVISOR" && (await blockedForSupervisor(req, res, wo))) return;
  if (wo.status === "DONE") return res.status(400).json({ error: `${wo.code} ปิดไปแล้ว` });
  if (wo.status === "CANCELLED") return res.status(400).json({ error: `${wo.code} ถูกยกเลิกไปแล้ว` });
  if (wo.status === "CLAIM_REVIEW") {
    return res.status(400).json({ error: `${wo.code} รอ Admin Spare Part ตรวจเคลม — ใช้ปุ่มอนุมัติหรือตีกลับในใบงาน` });
  }

  const text = `${SUPERVISOR_CLOSE_REASONS[parsed.data.reason]} — ${note}`;

  /**
   * ช่างเข้าซ่อมเสร็จแล้ว (TECH_FIXED) — บันทึกเป็นงานซ่อมเสร็จจริง ไม่ใช่ "ปิดโดยไม่มีช่างเข้า"
   * ข้อมูลที่ขาดไม่ได้ของงานซ่อม: ใครเข้า · วันที่ · รูปหลังซ่อมอย่างน้อยหนึ่งรูป (อะไหล่ไม่บังคับ — ซ่อมโดยไม่เปลี่ยนของก็มี)
   * ไม่บังคับรูปก่อนซ่อม/ป้ายรุ่น/ใบเหลืองเหมือนช่างปิดเอง เพราะงานจบไปแล้ว ไปถ่ายใหม่ไม่ได้ (แบบเดียวกับปิดย้อนหลัง)
   */
  if (parsed.data.reason === "TECH_FIXED") {
    const d = parsed.data;
    const outsourceNow = await freshOutsource();
    const subTeam = d.subTeam?.trim() || null;
    if (subTeam && !outsourceNow.has(subTeam)) {
      return res.status(400).json({ error: `ไม่รู้จักทีม SUB "${subTeam}" — เลือกจากรายชื่อทีม outsource` });
    }
    const workerIds = [...new Set(d.workerIds ?? [])];
    const otherWorkers = d.otherWorkers?.trim() || null;
    if (workerIds.length === 0 && !otherWorkers && !subTeam) {
      return res.status(400).json({ error: "ต้องบอกว่าใครเข้าซ่อม (ช่าง ชื่อคน หรือทีม SUB)" });
    }
    if (workerIds.length && (await prisma.user.count({ where: { id: { in: workerIds }, deletedAt: null } })) !== workerIds.length) {
      return res.status(400).json({ error: "มีชื่อผู้เข้าปฏิบัติงานที่ไม่อยู่ในระบบ" });
    }
    if (!d.visitDate) return res.status(400).json({ error: "ต้องใส่วันที่ช่างเข้าซ่อม" });
    if (d.visitDate > bangkokDay(new Date())) return res.status(400).json({ error: "วันที่เข้าซ่อมต้องไม่เกินวันนี้" });
    const after = await prisma.workOrderAttachment.count({ where: { workOrderId: id, role: "AFTER" } });
    if (after === 0) return res.status(400).json({ error: "ต้องแนบรูปหลังซ่อมอย่างน้อย 1 รูป" });
    const fixedText = `${SUPERVISOR_CLOSE_REASONS.TECH_FIXED} · เข้า ${visitText(d.visitDate, null)}${
      subTeam ? ` · ทีม SUB ${subTeam}` : ""
    } — ${note}`;
    await prisma.$transaction(async (tx) => {
      await tx.workOrder.update({
        where: { id },
        data: {
          status: "DONE",
          closedAt: new Date(),
          closedById: req.auth!.userId,
          closeResult: "FIXED",
          closeNote: fixedText,
          closeOtherWorkers: otherWorkers,
          closeSubTeam: subTeam,
          workStatus: workStatusForStage("DONE"),
        },
      });
      await tx.workOrderWorker.deleteMany({ where: { workOrderId: id } });
      if (workerIds.length) {
        await tx.workOrderWorker.createMany({ data: workerIds.map((userId) => ({ workOrderId: id, userId })), skipDuplicates: true });
      }
      if (d.parts) await replaceParts(tx, id, "USED", d.parts);
      await writeLog(tx, id, req.auth!.userId, "CLOSED", "DONE", fixedText);
    }, STAGE_TX);
    const row = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
    return res.json(shape(row));
  }

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: {
        status: "DONE",
        closedAt: new Date(),
        closedById: req.auth!.userId,
        closeResult: "SUPERVISOR_CLOSED",
        closeNote: text,
        workStatus: workStatusForStage("DONE"),
      },
    });
    await writeLog(tx, id, req.auth!.userId, "SUPERVISOR_CLOSED", "DONE", text);
  }, STAGE_TX);

  res.json(await detailFor(id));
});

/**
 * ยกเลิกใบงาน — แอดมิน และหัวหน้าภาคในพื้นที่ (เจ้าของงานเลือก ต.ค. 69) ต้องบอกเหตุผลเสมอ
 *
 * เดิมใครที่ล็อกอินก็ยกเลิกใบไหนก็ได้และไม่ต้องบอกเหตุผล (ตรวจระบบ ต.ค. 69) — ช่างคนเดียวยกเลิกได้ทั้งบริษัท
 * เหตุผลเป็นตัวเลือก + ข้อความ: ตัวเลือกให้นับได้ว่ายกเลิกเพราะอะไรบ่อย ข้อความให้รู้ว่าซ้ำกับใบไหน
 */
const CANCEL_REASON_LABELS: Record<string, string> = {
  DUPLICATE: "เปิดซ้ำ",
  CUSTOMER: "ลูกค้ายกเลิก",
  WRONG: "เปิดผิดสาขา/ผิดเครื่อง",
  OTHER: "อื่น ๆ",
};
const cancelSchema = z.object({
  reasonCode: z.enum(["DUPLICATE", "CUSTOMER", "WRONG", "OTHER"], { errorMap: () => ({ message: "ต้องเลือกเหตุผลที่ยกเลิก" }) }),
  note: z.string().trim().max(300).optional(),
});

router.post("/:id/cancel", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสใบงานไม่ถูกต้อง" });

  const role = req.auth!.role;
  if (role !== "ADMIN" && role !== "SUPERVISOR") {
    return res.status(403).json({ error: "ยกเลิกใบงานได้เฉพาะแอดมินกับหัวหน้าภาค — เจอปัญหาหน้างานให้ใช้ “ส่งกลับหัวหน้าภาค”" });
  }
  const parsed = cancelSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const { reasonCode, note } = parsed.data;
  if (reasonCode === "OTHER" && !note) return res.status(400).json({ error: "เลือก “อื่น ๆ” ต้องพิมพ์เหตุผลด้วย" });

  const current = await prisma.workOrder.findUnique({
    where: { id },
    select: { status: true, code: true, ...VIEW_SELECT },
  });
  if (!current) return res.status(404).json({ error: "ไม่พบใบงานนี้" });
  if (role === "SUPERVISOR" && (await blockedForViewer(req, res, current))) return;
  if (current.status === "DONE" || current.status === "CANCELLED") {
    return res.status(400).json({ error: `${current.code} ${current.status === "DONE" ? "ปิดไปแล้ว" : "ถูกยกเลิกไปแล้ว"} ยกเลิกไม่ได้` });
  }
  // ยกเลิกระหว่างรอตรวจเคลมทิ้งใบเคลมค้างสถานะรอตรวจไว้ — ต้องให้ Admin Spare Part ตัดสินก่อน
  if (current.status === "CLAIM_REVIEW") {
    return res.status(409).json({ error: `${current.code} รอตรวจเคลมอยู่ — ให้ตรวจเคลมให้เสร็จก่อนยกเลิก` });
  }

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({ where: { id }, data: { status: "CANCELLED" } });
    await writeLog(
      tx,
      id,
      req.auth!.userId,
      "CANCELLED",
      "CANCELLED",
      `${CANCEL_REASON_LABELS[reasonCode]}${note ? ` — ${note}` : ""}`
    );
  }, STAGE_TX);

  res.json(await detailFor(id));
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
      // เปิดงานใหม่ = ต้องไปอีกรอบ เริ่มที่แอดมินนัดลูกค้าใหม่ แล้วหัวหน้าภาคจ่ายงาน
      data: {
        status: "PARTS_CHECKED",
        closedAt: null,
        closedById: null,
        closeResult: null,
        // ทุกขั้นตั้งสถานะใหม่ — สถานะว่างของใบที่ปิดไปแล้วไม่ใช่ของรอบนี้
        workStatus: workStatusForStage("PARTS_CHECKED"),
      },
    });
    await writeLog(tx, id, req.auth!.userId, "REOPENED", "PARTS_CHECKED");
  }, STAGE_TX);

  res.json(await detailFor(id));
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
    select: { code: true, status: true, ...VIEW_SELECT },
  });
  if (!wo) {
    res.status(404).json({ error: "ไม่พบใบงานนี้" });
    return null;
  }
  // กฎเดียวกับเปิดดูใบงาน — เดิมช่างเปิดรูปของใบที่ยังไม่จ่ายทีมได้ทุกภาค (ภาพในร้านลูกค้า)
  if (await blockedForViewer(req, res, wo)) return null;

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
  sparePartId: number | null;
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
    // หลักฐานเคลมเป็นของอะไหล่ชิ้นไหน (role CLAIM_*)
    sparePartId: a.sparePartId,
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
  sparePartId: true,
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
    return res
      .status(400)
      .json({ error: `ไฟล์ชนิด ${file.mimetype} ยังแนบไม่ได้ — รับเฉพาะรูป วิดีโอ และ PDF (ใบเสนอราคา/บิล)` });
  }

  // บทบาทมาจากฟอร์ม ส่งมาผิดค่าถือว่าเป็นรูปทั่วไป ไม่ใช่ error —
  // ไฟล์ที่อัปสำเร็จแล้วไม่ควรถูกทิ้งเพราะป้ายกำกับสะกดผิด
  const rawRole = typeof req.body?.role === "string" ? req.body.role.trim().toUpperCase() : "";
  const role = (ATTACHMENT_ROLES as readonly string[]).includes(rawRole) ? rawRole : null;
  // หลักฐานเคลมต้องบอกว่าเป็นของอะไหล่ชิ้นไหน — ไม่บอกก็นับให้ชิ้นไหนไม่ได้ จึงปฏิเสธเลย
  // ดีกว่ารับไว้แล้วตอนปิดงานขึ้นว่า "ยังขาดรูปอะไหล่เก่า" ทั้งที่ช่างเพิ่งแนบไป
  const isClaimEvidence = !!role && (CLAIM_EVIDENCE_ROLES as readonly string[]).includes(role);
  const sparePartId = Number(req.body?.sparePartId);
  if (isClaimEvidence && !Number.isInteger(sparePartId)) {
    return res.status(400).json({ error: "หลักฐานเคลมต้องระบุว่าเป็นของอะไหล่ชิ้นไหน" });
  }

  // กรอบวิดีโอการทำงานมีไว้ให้เห็นอาการตอนเครื่องเดิน รูปนิ่งบอกไม่ได้ ส่วนกรอบรูปตรวจรับวิดีโอก็จะ
  // ทำให้ช่างแนบวิดีโอซ้ำสองที่แล้วนับว่าครบ ทั้งที่ไม่มีรูปให้ซูมดูรหัสอะไหล่
  if (role === "INSPECT_VIDEO" && kind !== "VIDEO") {
    return res.status(400).json({ error: "วิดีโอการทำงานต้องเป็นไฟล์วิดีโอ" });
  }
  if ((role === "INSPECT_SITE" || role === "INSPECT_PART") && kind !== "IMAGE") {
    return res.status(400).json({ error: `${ATTACHMENT_ROLE_LABELS[role].replace(" (ตรวจ)", "")}ต้องเป็นรูปภาพ` });
  }

  if (kind === "DOCUMENT" && !(role && ATTACHMENT_DOCUMENT_ROLES.includes(role))) {
    return res.status(400).json({ error: "PDF แนบได้เฉพาะใบเสนอราคากับบิลที่ลูกค้าจ่ายแล้ว — รูปหน้างานแนบเป็นรูปหรือวิดีโอ" });
  }

  const limit =
    kind === "IMAGE"
      ? MAX_ATTACHMENT_IMAGE_BYTES
      : kind === "DOCUMENT"
        ? MAX_ATTACHMENT_DOCUMENT_BYTES
        : MAX_ATTACHMENT_VIDEO_BYTES;
  if (file.size > limit) {
    const mb = Math.round(limit / 1024 / 1024);
    return res.status(400).json({
      error:
        kind === "IMAGE"
          ? `รูปใหญ่เกิน ${mb} MB`
          : kind === "DOCUMENT"
            ? `ไฟล์ PDF ใหญ่เกิน ${mb} MB`
            : `วิดีโอใหญ่เกิน ${mb} MB — ถ่ายสั้นลงหรือตัดให้เหลือเฉพาะช่วงที่เห็นอาการ`,
    });
  }

  const count = await prisma.workOrderAttachment.count({ where: { workOrderId: id } });
  if (count >= MAX_ATTACHMENTS_PER_WORK_ORDER) {
    return res
      .status(400)
      .json({ error: `ใบงานหนึ่งแนบได้ไม่เกิน ${MAX_ATTACHMENTS_PER_WORK_ORDER} ไฟล์ — ลบไฟล์ที่ไม่ใช้ (เช่น รูปซ้ำ) ในการ์ดไฟล์แนบก่อน` });
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
        role,
        sparePartId: isClaimEvidence ? sparePartId : null,
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
