/**
 * ประวัติเคลม — ย้อนดูอะไหล่ทุกชิ้นที่ช่างเคยส่งเคลม (เจ้าของงานขอ ต.ค. 69:
 * "อยากให้สามารถย้อนดูใบที่เคยเปิดเคลมไปแล้วได้ด้วย ให้ Admin Spare Part ดูย้อนหลังได้")
 *
 * เดิมใบเคลมเห็นได้ทางเดียวคือเปิดใบงานทีละใบ — ตอบคำถามแบบ "เดือนนี้อนุมัติไปกี่ชิ้น" หรือ
 * "เครื่องนี้เคลมบอร์ดซ้ำหรือเปล่า" ไม่ได้เลย ข้อมูลมีครบอยู่แล้วใน PartClaim หน้านี้แค่รวมมาให้ดู ไม่เก็บอะไรเพิ่ม
 *
 * ใครเห็น (เจ้าของงานเลือกหลังดูตัวอย่าง): Admin Spare Part · แอดมิน · Super Admin เห็นทั้งหมด
 * · หัวหน้าภาคเห็นเฉพาะใบที่เห็นในรายการใบงานอยู่แล้ว (ขอบเขตเดียวกับหน้ารายการ — workOrderVisible)
 * · ช่างกับ Area Team ไม่ได้ — เป็นเรื่องของคนตรวจ/คนจัดการงาน
 *
 * "รอบ": ตีกลับแล้วช่างแก้ส่งใหม่ = แถวใหม่ (แถวเดิมยังเป็น REJECTED อยู่) จึงนับรอบจากแถวของอะไหล่ตัวเดียวกัน
 * ในใบงานเดียวกัน เรียงตามเวลาส่ง · ค่าตั้งต้นแสดงเฉพาะรอบล่าสุด (เจ้าของงานเลือก) — ไม่งั้นชิ้นเดียวขึ้นสองแถว
 * แถวหนึ่งตีกลับอีกแถวอนุมัติ แล้วตัวเลขรวมนับซ้ำ · ติ๊ก "รวมรอบที่ถูกตีกลับแล้วส่งใหม่" ถึงเห็นรอบเก่า
 *
 * ไม่มีช่อง "ส่งผู้ขายแล้ว" — ตัวอย่างมีให้ลองเปิดดู แต่เจ้าของงานตอบว่าไม่ต้อง
 * ใบทดสอบไม่นับ (แบบรายงานอื่น) — เป็นการลองขั้นตอน ไม่ใช่ของที่ส่งเคลมจริง
 */
import { Router, Response } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { supervisorScope, workOrderVisible } from "../utils/supervisorScope";
import { documentPath, saveDocument } from "../documents/store";
import { bkkDayStart, sheetName, table, thaiDateTime, title } from "../reports/openerReport";
import {
  WORK_ORDER_STATUS_LABELS,
  bangkokDay,
  isCompanyBranch,
  isWarrantyExpired,
  machineMake,
  warrantyEndFor,
} from "../utils/constants";
import { brokenMismatch, claimRoundOf, firstSubmittedAt, repairStartFor } from "../utils/claimRules";
import { claimRepeatsOf } from "../utils/claimRepeats";

const router = Router();
const DAY_MS = 86_400_000;

/**
 * ขอบเขตใบงานของคนที่ขอ — undefined = ไม่มีสิทธิ์ (ตอบ 403 ไปแล้ว)
 * แอดมินทุกแบบ (รวม Admin Spare Part · Super Admin — middleware มองเป็น ADMIN) เห็นทั้งหมด
 */
async function claimScope(req: AuthRequest, res: Response): Promise<Prisma.WorkOrderWhereInput | undefined> {
  const role = req.auth!.role;
  if (role === "ADMIN") return {};
  if (role === "SUPERVISOR") return workOrderVisible(await supervisorScope(req.auth!.userId));
  res.status(403).json({ error: "ประวัติเคลมดูได้เฉพาะ Admin Spare Part แอดมิน และหัวหน้าภาค" });
  return undefined;
}

// ช่องว่างจากแอป (ตัวกรองที่ล้างแล้ว) = ไม่กรอง — ไม่ใช่ "หาค่าว่าง"
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
/**
 * ทุกช่องมีข้อความไทยของตัวเองครบทุกแบบที่ผิดได้ — ข้อความตั้งต้นของ zod เป็นอังกฤษ ("Invalid enum value...")
 * ซึ่งแอปเอาไปขึ้นจอตรง ๆ · invalid_type คือส่งช่องเดียวกันซ้ำ (?q=a&q=b) Express ให้มาเป็น array
 */
const text = (max: number, label: string) =>
  z.preprocess(blank, z.string({ invalid_type_error: `${label}ไม่ถูกต้อง` }).trim().max(max, `${label}ยาวเกิน ${max} ตัวอักษร`).optional());
const choice = <T extends [string, ...string[]]>(values: T, fallback: T[number], msg: string) =>
  z.preprocess(blank, z.enum(values, { errorMap: () => ({ message: msg }) }).default(fallback as z.util.noUndefined<T[number]>));
const count = (min: number, fallback: number, msg: string, max = Number.MAX_SAFE_INTEGER) =>
  z.preprocess(blank, z.coerce.number({ invalid_type_error: msg }).int(msg).min(min, msg).max(max, msg).default(fallback));
/**
 * วันที่ไม่มีจริง (31 ก.พ.) ต้องไม่หลุดไปเป็นวันอื่นเงียบ ๆ
 * refine ยังทำงานแม้ regex ไม่ผ่าน (zod แค่ติดธงไว้) และเดือน 13 / วันที่ 32 / ข้อความมั่ว ได้ Invalid Date
 * ซึ่ง toISOString() โยน RangeError — zod ไม่จับ error ใน refine คำขอจึงกลายเป็น 500 แทน 400 ภาษาไทย
 */
const ymd = (msg: string) =>
  z.preprocess(
    blank,
    z
      .string({ invalid_type_error: msg })
      .regex(/^\d{4}-\d{2}-\d{2}$/, msg)
      .refine((s) => {
        const d = new Date(`${s}T00:00:00Z`);
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
      }, msg)
      .optional()
  );

const filterSchema = z.object({
  from: ymd("วันที่เริ่มไม่ถูกต้อง"),
  to: ymd("วันที่สิ้นสุดไม่ถูกต้อง"),
  status: choice(["ALL", "PENDING", "APPROVED", "REJECTED", "DECLINED"], "ALL", "สถานะที่เลือกไม่ถูกต้อง"),
  brand: text(100, "ยี่ห้อ"),
  q: text(100, "คำค้น"),
  rounds: choice(["latest", "all"], "latest", "ตัวเลือกรอบไม่ถูกต้อง"),
  // ลิงก์ "เคลมเครื่องนี้/สาขานี้ทั้งหมด" จากหน้าใบงาน — ตรงตัว ไม่ใช่ค้นบางส่วน (W1 ต้องไม่ได้ W12)
  branchCode: text(50, "รหัสสาขา"),
  machineCode: text(50, "เลขเครื่อง"),
});
type Filters = z.infer<typeof filterSchema>;

const listSchema = filterSchema.extend({
  // แบ่งหน้า — ปีหนึ่งมีได้หลายพันชิ้น ส่งทั้งหมดทีเดียวมือถือที่เปิดจากหน้างานรอนาน
  limit: count(1, 100, "ขอได้ครั้งละ 1–500 รายการ", 500),
  offset: count(0, 0, "ตำแหน่งเริ่มของหน้าไม่ถูกต้อง"),
  // หน้าถัดไป = แถวที่ส่งก่อนแถวสุดท้ายที่แอปมีอยู่ ("เวลาส่ง ISO|id" ของแถวนั้น) — ดู GET / ว่าทำไมไม่ใช้ offset
  before: z.preprocess(
    blank,
    z
      .string({ invalid_type_error: "ตำแหน่งหน้าถัดไปไม่ถูกต้อง" })
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|\d+$/, "ตำแหน่งหน้าถัดไปไม่ถูกต้อง")
      .optional()
  ),
});

function parse<T extends z.ZodTypeAny>(schema: T, req: AuthRequest, res: Response): z.infer<T> | undefined {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ตัวกรองไม่ถูกต้อง" });
    return undefined;
  }
  const f = parsed.data as Filters;
  if (f.from && f.to && f.from > f.to) {
    res.status(400).json({ error: "วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด" });
    return undefined;
  }
  return parsed.data;
}

/**
 * ป้ายตามที่เจ้าของงานตกลง — สีบนจอใช้ look (OLD = รอบเก่าที่ถูกแทนแล้ว สีเทา)
 * DECLINED = Admin Spare Part ปิดเคลม ไม่ส่งผู้ขาย (ก้อน 3) — ชิ้นจบแล้วแต่ไม่มีใบเคลมไปผู้ขาย ต้องไม่ปนกับ "อนุมัติ"
 */
type Look = "PENDING" | "APPROVED" | "REJECTED" | "DECLINED" | "OLD";

export interface ClaimHistoryRow {
  id: number;
  workOrderId: number;
  code: string;
  /** ขั้นของใบงานตอนนี้ — บอกว่าตีกลับแล้วช่างแก้อยู่ หรือใบปิดไปแล้ว */
  orderStatus: string;
  orderStatusLabel: string;
  createdAt: string;
  /** ส่งรอบที่เท่าไรของอะไหล่ตัวนี้ในใบนี้ (1 = ส่งครั้งแรก) */
  round: number;
  /** เป็นรอบล่าสุดของอะไหล่ตัวนี้ในใบนี้ไหม */
  latest: boolean;
  branchCode: string;
  branchName: string;
  techName: string | null;
  brand: string | null;
  model: string | null;
  machineCode: string | null;
  sparePartId: number | null;
  partCode: string;
  partName: string;
  brokenPartCode: string | null;
  quantity: number;
  status: string;
  look: Look;
  statusLabel: string;
  reviewerName: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
}

interface Built {
  /** ทุกแถวที่ตรงตัวกรอง (ยกเว้นสถานะ/รอบ) เรียงส่งล่าสุดก่อน — ตัวเลขบนจอนับจากชุดนี้ */
  all: ClaimHistoryRow[];
  /** แถวที่จะแสดง = all หลังกรองสถานะและรอบ */
  shown: ClaimHistoryRow[];
  /** ตัวเลขบนการ์ด — นับชิ้น (จำนวน) จากรอบล่าสุดเสมอ ไม่ตามสถานะ/รอบที่เลือก (ตามตัวอย่าง) */
  tiles: { pending: number; approved: number; rejected: number; declined: number; total: number; orders: number };
  /** ตัวเลขบนปุ่มสถานะ = จำนวนแถวที่จะเห็นเมื่อกด (ตามรอบที่เลือกอยู่) — แบบตัวกรองหน้ารายการใบงาน */
  counts: { ALL: number; PENDING: number; APPROVED: number; REJECTED: number; DECLINED: number };
}

/** อะไหล่ตัวเดียวกันในใบเดียวกัน — ของนอกสโตร์รุ่นเก่าอาจไม่มี sparePartId ใช้รหัสแทน */
const keyOf = (c: { workOrderId: number; sparePartId: number | null; partCode: string }) =>
  `${c.workOrderId}:${c.sparePartId ?? `code:${c.partCode}`}`;

async function buildHistory(scope: Prisma.WorkOrderWhereInput, f: Filters): Promise<Built> {
  const q = f.q;
  const where: Prisma.PartClaimWhereInput = {
    AND: [
      { workOrder: { AND: [scope, { isTest: false }] } },
      f.from ? { createdAt: { gte: bkkDayStart(f.from) } } : {},
      // ทั้งสองปลายนับรวม ตามเวลาไทย — ส่งตอนตีหนึ่งของวันที่ 15 ยังเป็นวันที่ 15
      f.to ? { createdAt: { lt: new Date(bkkDayStart(f.to).getTime() + DAY_MS) } } : {},
      f.brand ? { brand: f.brand } : {},
      f.branchCode ? { branchCode: { equals: f.branchCode, mode: "insensitive" } } : {},
      f.machineCode ? { machineCode: { equals: f.machineCode, mode: "insensitive" } } : {},
      q
        ? {
            OR: [
              { workOrder: { code: { contains: q, mode: "insensitive" } } },
              { branchCode: { contains: q, mode: "insensitive" } },
              { branchName: { contains: q, mode: "insensitive" } },
              { partCode: { contains: q, mode: "insensitive" } },
              { partName: { contains: q, mode: "insensitive" } },
              { brokenPartCode: { contains: q, mode: "insensitive" } },
              { machineCode: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };
  // ไม่ดึง nameplate (มีภาพบรรทัดที่อ่านเป็น base64) กับข้อความยาว — หน้านี้ไม่ได้ใช้ และมีได้หลายพันแถว
  const rows = await prisma.partClaim.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      workOrderId: true,
      sparePartId: true,
      partCode: true,
      partName: true,
      brokenPartCode: true,
      quantity: true,
      branchCode: true,
      branchName: true,
      brand: true,
      model: true,
      machineCode: true,
      status: true,
      rejectReason: true,
      createdById: true,
      createdAt: true,
      reviewedById: true,
      reviewedAt: true,
      workOrder: { select: { code: true, status: true } },
    },
  });

  /**
   * รอบที่เท่าไร / ล่าสุดไหม ต้องนับจากทุกแถวของใบนั้น ไม่ใช่เฉพาะแถวที่ผ่านตัวกรอง —
   * กรองเดือนนี้แล้วรอบแรก (เดือนก่อน) ไม่อยู่ในชุด รอบสองต้องยังเป็น "ส่งรอบ 2" ไม่ใช่รอบ 1
   * ชื่อคน (ช่างที่ส่ง · คนตรวจ) เก็บเป็นรหัสไว้ในแถวเคลม ไม่ได้ผูก relation — ถามรอบเดียวพร้อมกัน
   */
  const woIds = [...new Set(rows.map((r) => r.workOrderId))];
  const userIds = [...new Set(rows.flatMap((r) => [r.createdById, r.reviewedById]).filter((x): x is number => x !== null))];
  const [siblings, users] = await Promise.all([
    woIds.length
      ? prisma.partClaim.findMany({
          where: { workOrderId: { in: woIds } },
          select: { id: true, workOrderId: true, sparePartId: true, partCode: true, createdAt: true },
        })
      : Promise.resolve([]),
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const byKey = new Map<string, typeof siblings>();
  const lastSubmit = new Map<number, number>();
  for (const s of siblings) {
    const k = keyOf(s);
    byKey.set(k, [...(byKey.get(k) ?? []), s]);
    lastSubmit.set(s.workOrderId, Math.max(lastSubmit.get(s.workOrderId) ?? 0, s.createdAt.getTime()));
  }
  const roundOf = new Map<number, { round: number; latest: boolean }>();
  for (const list of byKey.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);
    list.forEach((s, i) => roundOf.set(s.id, { round: i + 1, latest: i === list.length - 1 }));
  }
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  const all = rows.map((r): ClaimHistoryRow => {
    const { round, latest } = roundOf.get(r.id) ?? { round: 1, latest: true };
    let look: Look =
      r.status === "APPROVED" ? "APPROVED" : r.status === "REJECTED" ? "REJECTED" : r.status === "DECLINED" ? "DECLINED" : "PENDING";
    let label =
      r.status === "APPROVED"
        ? "อนุมัติ"
        : r.status === "REJECTED"
          ? "ตีกลับ · รอช่างแก้"
          : r.status === "DECLINED"
            ? "ปิดเคลม ไม่ส่งผู้ขาย"
            : "รอตรวจ";
    if (r.status === "REJECTED" && !latest) {
      look = "OLD";
      label = "ตีกลับ · ส่งใหม่แล้ว";
    } else if (r.status === "REJECTED") {
      /**
       * รอบล่าสุดถูกตีกลับ แต่ช่างไม่ได้ส่งชิ้นนี้ใหม่ — ปิดงานรอบใหม่โดยไม่เคลมชิ้นนี้ (ส่งชิ้นอื่น หรือไม่เคลมเลย)
       * หรือใบงานจบไปแล้ว · "รอช่างแก้" จะผิด เพราะไม่มีใครต้องทำอะไรกับชิ้นนี้อีก
       * ส่งพร้อมกันในการปิดครั้งเดียว = เวลาเดียวกัน (insert ก้อนเดียว) — ใหม่กว่า 1 วินาทีจึงเป็นรอบถัดไปแน่ ๆ
       */
      const newer = (lastSubmit.get(r.workOrderId) ?? 0) > r.createdAt.getTime() + 1000;
      if (newer || r.workOrder.status === "DONE" || r.workOrder.status === "CANCELLED") label = "ตีกลับ · ไม่ได้ส่งเคลมใหม่";
    }
    return {
      id: r.id,
      workOrderId: r.workOrderId,
      code: r.workOrder.code,
      orderStatus: r.workOrder.status,
      orderStatusLabel: WORK_ORDER_STATUS_LABELS[r.workOrder.status] ?? r.workOrder.status,
      createdAt: r.createdAt.toISOString(),
      round,
      latest,
      branchCode: r.branchCode,
      branchName: r.branchName,
      techName: r.createdById ? nameOf.get(r.createdById) ?? null : null,
      brand: r.brand,
      model: r.model,
      machineCode: r.machineCode,
      sparePartId: r.sparePartId,
      partCode: r.partCode,
      partName: r.partName,
      brokenPartCode: r.brokenPartCode,
      quantity: r.quantity,
      status: r.status,
      look,
      statusLabel: label,
      reviewerName: r.reviewedById ? nameOf.get(r.reviewedById) ?? null : null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      rejectReason: r.rejectReason,
    };
  });

  const latestRows = all.filter((r) => r.latest);
  const pieces = (list: ClaimHistoryRow[]) => list.reduce((n, r) => n + r.quantity, 0);
  const inRounds = f.rounds === "all" ? all : latestRows;
  const shown = inRounds.filter((r) => f.status === "ALL" || r.status === f.status);
  return {
    all,
    shown,
    tiles: {
      pending: pieces(latestRows.filter((r) => r.status === "PENDING")),
      approved: pieces(latestRows.filter((r) => r.status === "APPROVED")),
      rejected: pieces(latestRows.filter((r) => r.status === "REJECTED")),
      // คีย์ใหม่ (ก้อน 3) — คีย์เดิมค่าเท่าเดิม แอปที่ยังไม่รู้จัก declined ไม่พัง
      declined: pieces(latestRows.filter((r) => r.status === "DECLINED")),
      total: pieces(latestRows),
      orders: new Set(latestRows.map((r) => r.workOrderId)).size,
    },
    counts: {
      ALL: inRounds.length,
      PENDING: inRounds.filter((r) => r.status === "PENDING").length,
      APPROVED: inRounds.filter((r) => r.status === "APPROVED").length,
      REJECTED: inRounds.filter((r) => r.status === "REJECTED").length,
      DECLINED: inRounds.filter((r) => r.status === "DECLINED").length,
    },
  };
}

/** ยี่ห้อที่เคยเคลม (ในขอบเขตที่เห็น) — ตัวเลือกช่องยี่ห้อ ไม่ตามตัวกรองอื่น จะได้ไม่หายไปตอนเลือกเดือนที่ไม่มี */
async function brandOptions(scope: Prisma.WorkOrderWhereInput) {
  const list = await prisma.partClaim.findMany({
    where: { workOrder: { AND: [scope, { isTest: false }] }, brand: { not: null } },
    distinct: ["brand"],
    select: { brand: true },
  });
  return list.map((b) => b.brand!).sort((a, b) => a.localeCompare(b, "th"));
}

/**
 * GET /api/part-claims — รายการเคลม + ตัวเลขสรุป
 * ?from&to (YYYY-MM-DD วันที่ส่งเคลม เวลาไทย · ไม่ส่ง = ไม่จำกัด) &status=ALL|PENDING|APPROVED|REJECTED|DECLINED &brand &q
 * &rounds=latest|all &branchCode &machineCode (ตรงตัว) &limit &offset|before
 * rest = แถวที่ยังเหลือหลังหน้านี้ (ปุ่ม "แสดงเพิ่ม" ดูจากตัวนี้ ไม่ใช่ total − ที่มี ซึ่งรวมเคลมใหม่ที่อยู่บนสุด)
 */
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const scope = await claimScope(req, res);
  if (!scope) return;
  const f = parse(listSchema, req, res);
  if (!f) return;
  const [built, brands] = await Promise.all([buildHistory(scope, f), brandOptions(scope)]);
  /**
   * หน้าถัดไปต่อจากแถวสุดท้ายที่แอปมี (before) ไม่ใช่นับลำดับ — รายการเรียงส่งล่าสุดก่อน ถ้ามีเคลมใหม่เข้ามา
   * ระหว่างกด "แสดงเพิ่ม" ทุกแถวเลื่อนลงหนึ่งช่อง นับลำดับจะได้แถวสุดท้ายของหน้าก่อนซ้ำ (ขึ้นสองแถว key ชนกัน)
   * กลับกันแถวที่หลุดตัวกรองไป (เพิ่งอนุมัติขณะกรองรอตรวจ) ทำให้ข้ามไปหนึ่งแถวเงียบ ๆ
   * เทียบเวลาเป็นข้อความได้ — toISOString ยาวเท่ากันทุกแถว และคอลัมน์เก็บละเอียดแค่มิลลิวินาทีเท่ากับ Date
   */
  let start = f.offset;
  if (f.before) {
    const [at, id] = f.before.split("|");
    const i = built.shown.findIndex((r) => r.createdAt < at || (r.createdAt === at && r.id < Number(id)));
    start = i < 0 ? built.shown.length : i;
  }
  const rows = built.shown.slice(start, start + f.limit);
  res.json({
    rows,
    total: built.shown.length,
    rest: built.shown.length - start - rows.length,
    offset: start,
    limit: f.limit,
    tiles: built.tiles,
    counts: built.counts,
    brands,
  });
});

/**
 * ตัวเลขข้างเมนู "ประวัติเคลม" — แถวที่ยังรอตรวจ (เบา: นับครั้งเดียว ไม่สร้างรายการ)
 * แถวรอตรวจเป็นรอบล่าสุดเสมอ (ส่งใหม่ได้ก็ต่อเมื่อรอบก่อนถูกตีกลับแล้ว) จึงไม่ต้องคิดรอบ
 */
router.get("/pending-count", requireAuth, async (req: AuthRequest, res) => {
  const scope = await claimScope(req, res);
  if (!scope) return;
  const pending = await prisma.partClaim.count({
    where: { status: "PENDING", workOrder: { AND: [scope, { isTest: false }] } },
  });
  res.json({ pending });
});

// ── กล่องงานตรวจเคลม (เคลมก้อน 6) ─────────────────────────────

/**
 * ใบที่รอตรวจเคลม = แถวรอตรวจของใบที่อยู่ขั้นตรวจเคลม — คำตอบเดียวของทั้งรายการและตัวเลขข้างเมนู "ตรวจเคลม"
 * (ตัวเลขข้างเมนูกับหัวรายการ "x ใบ · y ชิ้น" ต้องเท่ากันเสมอ — สองที่นับคนละแบบเคยทำให้คนตรวจงงว่าหายไปไหนหนึ่งใบ)
 * นับใบทดสอบด้วย ต่างจากประวัติเคลมกับ /pending-count: ใบทดสอบก็ต้องมีคนกดตรวจถึงจะจบ ถ้าซ่อนไว้มันค้างอยู่ในระบบเงียบ ๆ
 * (รายการติดป้าย "ใบทดสอบ" ให้เห็น)
 */
const QUEUE_WHERE: Prisma.PartClaimWhereInput = { status: "PENDING", workOrder: { status: "CLAIM_REVIEW" } };
const REVIEWERS_ONLY = "ตรวจเคลมได้เฉพาะ Admin Spare Part";

/**
 * Admin Spare Part กับ Super Admin เท่านั้น (คนตัดสินเคลม — กติกาเดียวกับ canReviewClaims ใน routes/workOrders.ts)
 * Super Admin ที่ดูในฐานะ Admin Spare Part ผ่าน (โทเคนเป็นของคนที่ถูกดู) — อ่านได้ หน้าจอเป็นแบบดูอย่างเดียว
 * ส่วนการตัดสินโดน middleware กันอยู่แล้ว (viewAsReadOnly)
 */
function reviewerOnly(req: AuthRequest, res: Response): boolean {
  if (req.auth?.partsAdmin || req.auth?.superAdmin) return true;
  res.status(403).json({ error: REVIEWERS_ONLY });
  return false;
}

/** วันตามปฏิทินไทยระหว่างวันนั้นกับวันนี้ — ส่งเมื่อวาน 23:00 = 1 วัน (กติกาเดียวกับ daysSince ฝั่งแอป) */
function daysAgo(at: Date): number {
  return Math.max(0, Math.round((Date.parse(`${bangkokDay()}T00:00:00Z`) - Date.parse(`${bangkokDay(at)}T00:00:00Z`)) / DAY_MS));
}

/**
 * GET /api/part-claims/queue — ใบที่รอตรวจเคลม เรียงจากที่รอนานที่สุด (ส่งรอบล่าสุดเก่าสุดก่อน)
 *
 * แต่ละใบบอกสิ่งที่คนตรวจอยากรู้ก่อนเปิด: ชิ้นอะไร · ใครส่ง · รอบที่เท่าไหร่ · รอมานานเท่าไหร่ และป้ายเตือนสามอย่าง
 * (รหัสตัวเสียไม่ตรงกับอะไหล่ที่เปลี่ยนใส่ · สาขาหมดประกัน · เครื่องนี้เคยเคลมมาก่อน) — ตัวเดียวกับที่หน้าตรวจเคลมขึ้นในใบ
 * round = รอบสูงสุดของชิ้นที่รอตรวจ (นับต่อชิ้น — 2 ชิ้นถูกตีกลับครั้งเดียว = รอบ 2 ไม่ใช่ 3 · claimRoundOf)
 * waitingSince = ส่งรอบนี้เมื่อไหร่ (แถวรอตรวจล่าสุด) · firstSubmittedAt = ส่งครั้งแรกของห่วงโซ่ตีกลับ → ส่งใหม่
 * อ่านอย่างเดียว ไม่มี transaction · ถามฐานข้อมูลสองรอบ (แถวรอตรวจ แล้วทุกอย่างของใบเหล่านั้นพร้อมกัน)
 */
router.get("/queue", requireAuth, async (req: AuthRequest, res) => {
  if (!reviewerOnly(req, res)) return;
  const pending = await prisma.partClaim.findMany({
    where: QUEUE_WHERE,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      workOrderId: true,
      sparePartId: true,
      partCode: true,
      partName: true,
      brokenPartCode: true,
      quantity: true,
      status: true,
      createdById: true,
      createdAt: true,
      branchCode: true,
      branchName: true,
      machineCode: true,
      brand: true,
    },
  });
  const woIds = [...new Set(pending.map((p) => p.workOrderId))];
  const userIds = [...new Set(pending.map((p) => p.createdById).filter((x): x is number => x !== null))];
  const [orders, siblings, reopens, users, repeats] = await Promise.all([
    prisma.workOrder.findMany({
      where: { id: { in: woIds } },
      select: {
        id: true,
        code: true,
        isTest: true,
        branch: { select: { code: true, openedAt: true, warrantyExpiresAt: true } },
        machine: { select: { type: true, brand: true, model: true } },
      },
    }),
    // ทุกแถวของใบเหล่านั้น — รอบที่เท่าไหร่/ส่งครั้งแรกเมื่อไหร่ ต้องนับจากแถวก่อนหน้าที่ถูกตีกลับด้วย
    prisma.partClaim.findMany({
      where: { workOrderId: { in: woIds } },
      select: { id: true, workOrderId: true, sparePartId: true, partCode: true, status: true, createdAt: true },
    }),
    // เปิดใบใหม่ = งานซ่อมครั้งใหม่ รอบเริ่มนับใหม่
    prisma.workOrderLog.findMany({
      where: { workOrderId: { in: woIds }, action: "REOPENED" },
      select: { workOrderId: true, action: true, createdAt: true },
    }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, employeeCode: true } }),
    claimRepeatsOf(woIds),
  ]);
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const group = <T extends { workOrderId: number }>(list: T[]) => {
    const m = new Map<number, T[]>();
    for (const x of list) m.set(x.workOrderId, [...(m.get(x.workOrderId) ?? []), x]);
    return m;
  };
  const pendingBy = group(pending);
  const siblingsBy = group(siblings);
  const reopensBy = group(reopens);

  const rows = woIds
    .map((woId) => {
      const o = orderById.get(woId);
      const parts = pendingBy.get(woId) ?? [];
      if (!o || !parts.length) return null;
      const all = siblingsBy.get(woId) ?? [];
      const logs = reopensBy.get(woId) ?? [];
      const latest = parts.reduce((a, b) => (b.createdAt > a.createdAt || (+b.createdAt === +a.createdAt && b.id > a.id) ? b : a));
      const tech = latest.createdById ? userById.get(latest.createdById) : undefined;
      const make = machineMake(o.machine);
      const expired = isWarrantyExpired(warrantyEndFor(o.branch.openedAt, o.branch.warrantyExpiresAt, make));
      return {
        workOrderId: woId,
        code: o.code,
        isTest: o.isTest,
        branchCode: latest.branchCode,
        branchName: latest.branchName,
        machineCode: latest.machineCode,
        machineType: o.machine?.type ?? null,
        brand: latest.brand ?? make,
        parts: parts.map((p) => ({
          claimId: p.id,
          sparePartId: p.sparePartId,
          partCode: p.partCode,
          partName: p.partName,
          brokenPartCode: p.brokenPartCode,
          quantity: p.quantity,
        })),
        techName: tech?.name ?? null,
        techCode: tech?.employeeCode ?? null,
        round: Math.max(...parts.map((p) => claimRoundOf(p, all, repairStartFor(p.createdAt, logs)))),
        waitingSince: latest.createdAt,
        firstSubmittedAt: new Date(Math.min(...parts.map((p) => firstSubmittedAt(p, all, repairStartFor(p.createdAt, logs)).getTime()))),
        flags: {
          brokenMismatch: parts.filter(brokenMismatch).length,
          // สาขาบริษัทไม่มีประกันอยู่แล้ว — ไม่ขึ้นว่า "หมดประกัน" (แบบเดียวกับหน้าตรวจเคลม) · ไม่รู้วันเปิดร้าน = ไม่เตือน
          outOfWarranty: !isCompanyBranch(o.branch.code) && expired === true,
          repeat: (repeats.get(woId) ?? []).map((r) => ({ partCode: r.partCode, daysAgo: daysAgo(r.createdAt), workOrderCode: r.code })),
        },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.waitingSince.getTime() - b.waitingSince.getTime() || a.workOrderId - b.workOrderId);

  res.json({ orders: rows.length, parts: rows.reduce((n, r) => n + r.parts.length, 0), rows });
});

/**
 * GET /api/part-claims/queue-count — ตัวเลขข้างเมนู "ตรวจเคลม {x} ใบ" และการ์ดในงานของฉัน (เบา: นับอย่างเดียว)
 * แถวชุดเดียวกับ /queue (QUEUE_WHERE) ตัวเลขจึงเท่าหัวรายการเสมอ
 */
router.get("/queue-count", requireAuth, async (req: AuthRequest, res) => {
  if (!reviewerOnly(req, res)) return;
  const rows = await prisma.partClaim.findMany({ where: QUEUE_WHERE, select: { workOrderId: true } });
  res.json({ orders: new Set(rows.map((r) => r.workOrderId)).size, parts: rows.length });
});

/**
 * จำนวนเคลมของสาขา/เครื่องนี้ทั้งหมด (รอบล่าสุด ทุกช่วงเวลา) — ตัวเลขบนลิงก์ในหน้าใบงาน
 * ไว้ดูว่าเครื่องเดิมเคลมชิ้นเดิมซ้ำไหม · เลขเครื่องซ้ำกันข้ามสาขา (W1 มีทุกร้าน) จึงนับเครื่องภายในสาขาเสมอ
 */
const relatedSchema = z.object({
  branchCode: z.preprocess(
    blank,
    z
      .string({ required_error: "ต้องระบุรหัสสาขา", invalid_type_error: "รหัสสาขาไม่ถูกต้อง" })
      .trim()
      .min(1, "ต้องระบุรหัสสาขา")
      .max(50, "รหัสสาขายาวเกิน 50 ตัวอักษร")
  ),
  machineCode: text(50, "เลขเครื่อง"),
});
router.get("/related", requireAuth, async (req: AuthRequest, res) => {
  const scope = await claimScope(req, res);
  if (!scope) return;
  const r = parse(relatedSchema, req, res);
  if (!r) return;
  const built = await buildHistory(scope, { status: "ALL", rounds: "latest", branchCode: r.branchCode });
  const m = r.machineCode?.toUpperCase();
  res.json({
    branch: built.shown.length,
    machine: m ? built.shown.filter((x) => x.machineCode?.toUpperCase() === m).length : null,
  });
});

// ── Excel ─────────────────────────────────────────────

const STATUS_TEXT: Record<string, string> = {
  ALL: "ทุกสถานะ",
  PENDING: "รอตรวจ",
  APPROVED: "อนุมัติ",
  REJECTED: "ตีกลับ",
  DECLINED: "ปิดเคลม ไม่ส่งผู้ขาย",
};
const thaiYmd = (s: string) => thaiDateTime(bkkDayStart(s), false);

/** บอกในไฟล์ว่ากรองอะไรไว้ — ไฟล์ถูกส่งต่อ คนที่เปิดต้องรู้ว่าทำไมไม่เห็นบางชิ้น */
function filterText(f: Filters, scopeLabel: string) {
  const range =
    f.from && f.to ? `${thaiYmd(f.from)} – ${thaiYmd(f.to)}` : f.from ? `ตั้งแต่ ${thaiYmd(f.from)}` : f.to ? `ถึง ${thaiYmd(f.to)}` : "ทุกช่วงเวลา";
  return [
    `วันที่ส่งเคลม ${range}`,
    STATUS_TEXT[f.status],
    f.brand ? `ยี่ห้อ ${f.brand}` : null,
    f.branchCode ? `สาขา ${f.branchCode}` : null,
    f.machineCode ? `เครื่อง ${f.machineCode}` : null,
    f.q ? `ค้นหา “${f.q}”` : null,
    f.rounds === "all" ? "รวมรอบที่ถูกตีกลับแล้วส่งใหม่" : "เฉพาะรอบล่าสุด",
    scopeLabel,
  ]
    .filter(Boolean)
    .join(" · ");
}

async function historyWorkbook(b: Built, f: Filters, scopeLabel: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OTTERI Service";
  const now = new Date();
  wb.created = now;
  const sub = `${filterText(f, scopeLabel)} · ออกเมื่อ ${thaiDateTime(now)} · ไม่นับใบทดสอบ`;
  const used = new Set<string>();

  const s1 = wb.addWorksheet(sheetName("ประวัติเคลม", used));
  title(s1, "ประวัติเคลมอะไหล่", sub);
  table(
    s1,
    ["วันที่ส่งเคลม", "ส่งรอบที่", "เลขใบงาน", "รหัสสาขา", "ชื่อสาขา", "ช่างที่ส่ง", "ยี่ห้อ", "รุ่น", "เครื่อง", "รหัสอะไหล่ที่เบิก", "ชื่ออะไหล่", "รหัสตัวที่เสีย", "จำนวน", "ผลตรวจ", "ผู้ตรวจ", "วันที่ตรวจ", "เหตุผลที่ตีกลับ", "ขั้นใบงานตอนนี้"],
    b.shown.map((r) => [
      thaiDateTime(new Date(r.createdAt)), r.round, r.code, r.branchCode, r.branchName, r.techName ?? "—", r.brand ?? "—",
      r.model ?? "—", r.machineCode ?? "—", r.partCode, r.partName, r.brokenPartCode ?? "—", r.quantity, r.statusLabel,
      r.reviewerName ?? "—", r.reviewedAt ? thaiDateTime(new Date(r.reviewedAt)) : "—", r.rejectReason ?? "", r.orderStatusLabel,
    ])
  );
  if (!b.shown.length) s1.addRow(["ไม่มีเคลมที่ตรงกับตัวกรองนี้"]);

  /**
   * รวมตามอะไหล่ — ตัวไหนเคลมบ่อย ไว้คุยกับผู้ขาย · นับเฉพาะรอบล่าสุด (ชิ้นที่ตีกลับแล้วส่งใหม่คือชิ้นเดียวกัน
   * นับสองรอบตัวเลขจะพอง) แม้ชีตแรกจะติ๊กรวมรอบเก่าไว้
   */
  const latest = b.shown.filter((r) => r.latest);
  const byPart = new Map<string, { r: ClaimHistoryRow; pieces: number; pending: number; approved: number; rejected: number; declined: number; orders: Set<number>; machines: Set<string> }>();
  for (const r of latest) {
    const k = `${r.partCode}|${r.brand ?? ""}`;
    const g = byPart.get(k) ?? { r, pieces: 0, pending: 0, approved: 0, rejected: 0, declined: 0, orders: new Set<number>(), machines: new Set<string>() };
    g.pieces += r.quantity;
    if (r.status === "PENDING") g.pending += r.quantity;
    if (r.status === "APPROVED") g.approved += r.quantity;
    if (r.status === "REJECTED") g.rejected += r.quantity;
    if (r.status === "DECLINED") g.declined += r.quantity;
    g.orders.add(r.workOrderId);
    g.machines.add(`${r.branchCode} ${r.machineCode ?? "—"}`);
    byPart.set(k, g);
  }
  const s2 = wb.addWorksheet(sheetName("รวมตามอะไหล่", used));
  title(s2, "รวมตามอะไหล่ (รอบล่าสุด)", sub);
  table(
    s2,
    // "ปิดเคลม ไม่ส่งผู้ขาย" ต่อท้ายเป็นคอลัมน์สุดท้าย (ก้อน 3) — ไฟล์/สูตรที่อ่านคอลัมน์เดิมตามตำแหน่งยังตรง
    ["รหัสอะไหล่", "ชื่ออะไหล่", "ยี่ห้อ", "ชิ้นทั้งหมด", "รอตรวจ", "อนุมัติ", "ตีกลับ", "จำนวนใบงาน", "สาขา · เครื่อง", "ปิดเคลม ไม่ส่งผู้ขาย"],
    [...byPart.values()]
      .sort((a, b) => b.pieces - a.pieces || a.r.partCode.localeCompare(b.r.partCode))
      .map((g) => [
        g.r.partCode, g.r.partName, g.r.brand ?? "—", g.pieces, g.pending, g.approved, g.rejected, g.orders.size, [...g.machines].join(", "), g.declined,
      ])
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * GET /api/part-claims/export — ไฟล์ Excel ตามตัวกรองเดียวกับหน้าจอ (ไม่แบ่งหน้า)
 * คืนลิงก์ดาวน์โหลดแบบรายงานอื่น ({ filename, path }) — ลิงก์มีกุญแจของตัวเอง มือถือส่งต่อให้เบราว์เซอร์เปิดได้
 */
router.get("/export", requireAuth, async (req: AuthRequest, res) => {
  const scope = await claimScope(req, res);
  if (!scope) return;
  const f = parse(filterSchema, req, res);
  if (!f) return;
  const scopeLabel = req.auth!.role === "SUPERVISOR" ? "เฉพาะใบงานที่หัวหน้าภาคเห็น" : "ทุกภาค";
  const built = await buildHistory(scope, f);
  const stamp = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const stored = saveDocument({
    filename: `ประวัติเคลม-${stamp}.xlsx`,
    asciiFilename: `claim-history-${stamp}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data: await historyWorkbook(built, f, scopeLabel),
    ownerId: req.auth!.userId,
  });
  res.json({ filename: stored.filename, path: documentPath(stored), count: built.shown.length });
});

export default router;
