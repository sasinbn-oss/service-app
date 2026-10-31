/**
 * อะไหล่ที่ไปแต่ละสาขา — สาขาไหนได้อะไหล่อะไรไปแล้วบ้าง (เจ้าของงานขอ ต.ค. 69 · ตามตัวอย่างที่ตกลง)
 *
 * คำตอบของเจ้าของงานที่กำหนดรูปของรายงานนี้:
 *  1. "นับแต่ละตัวแยกตามชิ้นอะไหล่" — นับเป็นชิ้น (ผลรวม quantity) ไม่ใช่จำนวนใบงาน
 *     และแยกสองแบบตามตัวอย่าง ไม่รวมเป็นเลขเดียว:
 *       ใช้แล้ว (USED)                 = แถว kind=USED ที่ช่างบันทึกตอนปิดงาน ของใบที่ช่างปิดแล้ว (DONE · รอตรวจเคลม)
 *       เบิกแล้ว · งานยังไม่จบ (ISSUED) = แถว kind=WAITING ที่ออกจากคลังแล้ว (กฎเดียวกับ isIssued + เบิกเพื่อโอน)
 *                                        ของใบที่ยังไม่ปิด
 *     ใบหนึ่งอยู่แบบเดียวเสมอ (ตัดสินจากขั้นของใบ) — ชิ้นที่เบิกไปแล้วปิดงานจะย้ายจาก "เบิกแล้ว" ไป "ใช้แล้ว"
 *     ไม่ถูกนับสองครั้ง และ "ใช้แล้ว" ใช้ตัวเลขที่ช่างกรอก ไม่ใช่ตัวเลขที่เบิก (เบิก 2 ใช้ 1 = ใช้แล้ว 1)
 *  2. "admin ดูได้ superadmin ดูได้" — เฉพาะแอดมินและ Super Admin (ดู canSeeBranchParts)
 *  3. "เริ่มตั้งแต่ที่เปิดใช้งานโปรแกรมเลย" — ค่าเริ่มต้นคือทั้งหมด ไม่มีวันเริ่ม (range=all)
 *
 * ใบที่ไม่นับ — เลือกตามที่คนกระทบยอดคลังคาดหวัง:
 *  · ยกเลิก — งานไม่ได้เกิด ของที่เบิกไปแล้วต้องกลับคลัง ไม่ได้อยู่ที่สาขา (รายงานเบิกแล้วก็ไม่นับใบยกเลิก)
 *  · ใบทดสอบ (isTest รวมใบที่คัดลอกเป็นใบทดสอบ) — คัดลอกอะไหล่พร้อมเลขใบเบิกมาด้วย นับแล้วของจะซ้ำกับใบจริง
 *  · แถว USED ที่ค้างในใบที่แอดมินกด "เปิดงานใหม่" — รอบใหม่ต้องไปอีกรอบ (closedById ถูกล้าง) ชิ้นที่เบิกรอบนี้ขึ้นเป็น "เบิกแล้ว" แทน
 * ใบที่เคลมถูกตีกลับ (กลับไปที่ช่าง ยังไม่ปิดใหม่) ยังนับ "ใช้แล้ว" ตามที่ช่างปิดรอบนั้น — ของใส่ที่สาขาแล้วจริง ที่ถูกตีกลับคือหลักฐานเคลม
 *    ของตัวเก่า (ตีกลับล้างแค่ closedAt เก็บ closedById/ผล/อะไหล่ไว้ให้ช่างแก้เฉพาะจุด) · ไม่งั้น "ใช้แล้ว" ของสาขาหายช่วงรอแก้เคลม
 *    แล้วกลับมาตอนปิดใหม่ — คนกระทบยอดเห็นตัวเลขขึ้นลงทั้งที่ของไม่ได้ย้าย · วันที่ = เวลาปิดรอบนั้น (ประวัติ CLOSED ล่าสุด)
 *  · ของนอกสโตร์ไม่มีวันเป็น "เบิกแล้ว" (ไม่มีใบเบิก ไม่ได้ออกจากคลังของบริษัท) แต่ไปถึงสาขาจริงตอนใช้ → นับใน "ใช้แล้ว" พร้อมป้าย
 * ใบรออะไหล่ (ใบแยก parentId) และใบงาน SUB นับตามปกติ — ใบแยกย้ายอะไหล่ไปใบใหม่ ไม่ได้คัดลอก ชิ้นหนึ่งจึงอยู่ใบเดียว
 *
 * เร็วพอสำหรับทั้งหมดตั้งแต่เริ่มใช้ระบบ × ~1,200 สาขา บนฐานข้อมูลที่อยู่คนละ region (ทุกคำสั่งคือไปกลับจริง):
 * รวมใน SQL ทั้งหมด หน้ารายงานถาม 3 ครั้งพร้อมกัน (ตัวเลขบนสุด · หัวกลุ่มทีละหน้า · ตัวเลือกภาค/ทีม)
 * แถวของแต่ละกลุ่มโหลดตอนกดเปิดกลุ่มนั้น · ไฟล์ Excel ได้ทุกแถว แต่อ่านทีละชุดสาขา (~2,000 แถว) เขียนลงไฟล์แล้วค่อยอ่านชุดถัดไป
 * และชีตสรุปรวมใน SQL — ไม่ถือทุกแถวไว้ในหน่วยความจำพร้อมกัน (Render 512 MB · เคยวัดได้ 400 MB+ และเซิร์ฟเวอร์ค้าง 10 วิ ต่อไฟล์)
 */
import ExcelJS from "exceljs";
import { PassThrough } from "stream";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { WORK_ORDER_STATUS_LABELS } from "../utils/constants";
import { bkkDayStart, thaiDateTime } from "./openerReport";

const DAY_MS = 86_400_000;
const BKK_MS = 7 * 3600_000;
/** วันตามเวลาไทยของเวลาหนึ่ง (YYYY-MM-DD) — ช่วงวันที่ทุกแบบนับวันปฏิทินไทย ไม่ใช่ UTC */
const bkkYmd = (d: Date) => new Date(d.getTime() + BKK_MS).toISOString().slice(0, 10);

export const KIND_LABELS = { USED: "ใช้แล้ว", ISSUED: "เบิกแล้ว · งานยังไม่จบ" } as const;
export type PartKind = keyof typeof KIND_LABELS;

/** ใครเห็นรายงานนี้ — แอดมินและ Super Admin (requireAuth มอง Super Admin เป็น ADMIN+superAdmin, Admin Spare Part เป็น ADMIN+partsAdmin)
 * ดูในฐานะใช้ตัวตนของคนที่ถูกดู จึงตัดสินด้วยกฎเดียวกันโดยไม่ต้องเช็คแยก */
export function canSeeBranchParts(auth: { role?: string; partsAdmin?: boolean } | undefined) {
  return auth?.role === "ADMIN" && !auth.partsAdmin;
}
export const BRANCH_PARTS_FORBIDDEN = "รายงานนี้สำหรับแอดมินและ Super Admin เท่านั้น";

// ── ช่วงวันที่ ─────────────────────────────────────────

export type RangeKey = "all" | "thisMonth" | "lastMonth" | "3months" | "thisYear" | "custom";
export interface DateRange {
  key: RangeKey;
  /** null = ไม่มีขอบ (ทั้งหมด) */
  from: string | null;
  to: string | null;
  label: string;
}
export const ALL_TIME_LABEL = "ทั้งหมด (ตั้งแต่เริ่มใช้ระบบ)";
const ymd = (y: number, m0: number, d: number) => new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);

/**
 * ปุ่มช่วงวันที่คิดที่เซิร์ฟเวอร์ที่เดียว — หน้าจอ ไฟล์ Excel และตัวเลขในใบงานพูดช่วงเดียวกันเสมอ
 * และ "วันนี้" เป็นวันไทย (ตีหนึ่งวันที่ 1 ตามเวลาไทยยังเป็นสิ้นเดือนก่อนตาม UTC)
 * "3 เดือน" = ต้นเดือนของสองเดือนก่อนถึงวันนี้ ตามตัวอย่างที่เจ้าของงานเห็น (30 ต.ค. → 1 ส.ค.–30 ต.ค.)
 */
export function resolveRange(key: RangeKey, from?: string, to?: string, now = new Date()): DateRange | { error: string } {
  const today = bkkYmd(now);
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1];
  const thaiDay = (s: string) => thaiDateTime(bkkDayStart(s), false);
  switch (key) {
    case "all":
      return { key, from: null, to: null, label: ALL_TIME_LABEL };
    case "thisMonth":
      return { key, from: ymd(y, m, 1), to: today, label: "เดือนนี้" };
    case "lastMonth":
      return { key, from: ymd(y, m - 1, 1), to: ymd(y, m, 0), label: "เดือนก่อน" };
    case "3months":
      return { key, from: ymd(y, m - 2, 1), to: today, label: "3 เดือน" };
    case "thisYear":
      return { key, from: ymd(y, 0, 1), to: today, label: "ปีนี้" };
    case "custom": {
      if (!from || !to) return { error: "เลือกตั้งแต่และถึงให้ครบทั้งสองช่อง" };
      if (from > to) return { error: "วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด" };
      return { key, from, to, label: `${thaiDay(from)} – ${thaiDay(to)}` };
    }
  }
}

// ── อ่านคำขอ ───────────────────────────────────────────

export interface Filters {
  range: DateRange;
  kind: "all" | "used" | "issued";
  region?: string;
  team?: string;
  q?: string;
  branchCode?: string;
  machineId?: number;
}

/**
 * วันที่ต้องมีอยู่จริงและอยู่ในช่วงที่ฐานข้อมูลรับ — Date.parse รับ 30 ก.พ. แล้วปัดเป็น 2 มี.ค. เงียบ ๆ (กรองคนละวันกับที่ขอ)
 * และปี 0000 ลบ 7 ชม. แล้วเป็นปีที่ Postgres ไม่รับ ได้ 500 แทนที่จะบอกว่าวันที่ผิด
 */
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "ช่วงวันที่ไม่ถูกต้อง")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s >= "2000-01-01" && s <= "2999-12-31";
  }, "ช่วงวันที่ไม่ถูกต้อง");
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "ข้อความยาวเกินไป")
    // ตัวอักษร NUL ผ่าน zod ได้แต่ Postgres ไม่รับในข้อความ — ปล่อยไปได้ 500 แทนที่จะบอกว่าพิมพ์อะไรผิด
    .refine((s) => !s.includes("\u0000"), "ข้อความมีตัวอักษรที่ใช้ไม่ได้")
    .optional()
    .transform((s) => s || undefined);
const querySchema = z.object({
  view: z.enum(["branch", "part"], { errorMap: () => ({ message: "มุมมองไม่ถูกต้อง" }) }).default("branch"),
  range: z.enum(["all", "thisMonth", "lastMonth", "3months", "thisYear", "custom"], { errorMap: () => ({ message: "ช่วงวันที่ไม่ถูกต้อง" }) }).optional(),
  from: day.optional(),
  to: day.optional(),
  kind: z.enum(["all", "used", "issued"], { errorMap: () => ({ message: "สถานะไม่ถูกต้อง" }) }).default("all"),
  region: text(100),
  team: text(100),
  q: text(100),
  branchCode: text(40),
  machineId: z.string().regex(/^\d{1,9}$/, "เครื่องไม่ถูกต้อง").transform(Number).optional(),
  key: text(60),
  cursor: z.string().regex(/^\d{1,7}$/, "หน้าถัดไปไม่ถูกต้อง — โหลดใหม่ตั้งแต่ต้น").transform(Number).optional(),
  limit: z.string().regex(/^\d{1,3}$/, "ข้อมูลไม่ถูกต้อง").transform(Number).optional(),
  format: z.enum(["json", "xlsx"], { errorMap: () => ({ message: "รูปแบบไฟล์ไม่ถูกต้อง" }) }).default("json"),
});

export interface ParsedQuery {
  view: "branch" | "part";
  filters: Filters;
  key?: string;
  offset: number;
  limit?: number;
  format: "json" | "xlsx";
}

export function parseQuery(query: unknown): ParsedQuery | { error: string } {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) {
    // ข้อความที่ตั้งเองเป็นไทยทุกช่อง ที่หลุดมาเป็นอังกฤษคือข้อความของ zod เอง (ส่งช่องเดียวกันซ้ำ = array) — คนใช้อ่านไม่ออก
    const m = parsed.error.issues[0]?.message ?? "";
    return { error: /[\u0E00-\u0E7F]/.test(m) ? m : "ข้อมูลไม่ถูกต้อง" };
  }
  const q = parsed.data;
  // ใส่ตั้งแต่/ถึงมาโดยไม่บอกช่วง = เลือกเอง (ลิงก์ที่พิมพ์มือหรือแอปรุ่นก่อน)
  const key: RangeKey = q.range ?? (q.from || q.to ? "custom" : "all");
  const range = resolveRange(key, q.from, q.to);
  if ("error" in range) return range;
  return {
    view: q.view,
    filters: { range, kind: q.kind, region: q.region, team: q.team, q: q.q, branchCode: q.branchCode, machineId: q.machineId },
    key: q.key,
    offset: q.cursor ?? 0,
    limit: q.limit,
    format: q.format,
  };
}

// ── SQL ───────────────────────────────────────────────

/** % กับ _ ที่คนพิมพ์มาคือตัวอักษรจริง ไม่ใช่ wildcard */
const likeOf = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * แถวที่นับได้ทั้งหมด (raw) แล้วกรองตามตัวกรอง (f) — ทุกคำสั่งในไฟล์นี้เริ่มจาก CTE ชุดนี้ กฎจึงอยู่ที่เดียว
 * วันที่ของแถว (at): ใช้แล้ว = เวลาปิดงาน (เคลมถูกตีกลับล้างเวลาปิด → ประวัติ CLOSED ล่าสุด) · เบิกแล้ว = เวลาบันทึกเบิก
 * (เบิกเพื่อโอนอย่างเดียว = ประวัติโอนครั้งล่าสุด แบบเดียวกับรายงานเบิกแล้ว — แถวอะไหล่ไม่มีช่องเวลาโอน)
 * ข้อมูลเก่าที่ไม่มีเวลาเลยใช้เวลาแก้ใบล่าสุด ไม่ทิ้งแถว
 * ใช้แล้ว = ใบที่ช่างปิดแล้ว: DONE · รอตรวจเคลม · หรือเคลมถูกตีกลับรอปิดใหม่ (closedById ยังอยู่ — ตีกลับเป็นทางเดียวที่ใบกลับมาเปิด
 * โดยไม่ล้างคนปิด ส่วน "เปิดงานใหม่" ล้าง) · เบิกแล้ว = ใบที่ยังไม่มีใครปิด — สองเงื่อนไขนี้ไม่ทับกัน ใบหนึ่งจึงอยู่แบบเดียว
 * branchIds = ไฟล์ Excel อ่านทีละชุดสาขา
 */
function baseCte(f: Filters, opts: { skipMachine?: boolean; branchIds?: number[] } = {}): Prisma.Sql {
  /**
   * กรองสาขา/เครื่องที่ตัวใบงานตั้งแต่ในแต่ละขา (ซ้ำกับเงื่อนไขของ f ด้านล่าง ผลเท่าเดิม) — ไม่งั้นฐานข้อมูลไล่ทุกใบทั้งระบบ
   * ก่อนทิ้งเหลือสาขาเดียว: ตัวเลขบนลิงก์ในใบงานถามทุกครั้งที่แอดมินเปิดใบงาน และไฟล์ Excel ถามทีละชุดสาขา (ใช้ index สาขาของใบงาน)
   */
  const arm: Prisma.Sql[] = [];
  if (f.branchCode) arm.push(Prisma.sql`w."branchId" = (SELECT id FROM "Branch" WHERE code = ${f.branchCode})`);
  if (opts.branchIds) arm.push(Prisma.sql`w."branchId" = ANY(${opts.branchIds}::int[])`);
  if (f.machineId !== undefined && !opts.skipMachine) arm.push(Prisma.sql`w."machineId" = ${f.machineId}`);
  const armAnd = arm.length ? Prisma.sql`AND ${Prisma.join(arm, " AND ")}` : Prisma.empty;
  const conds: Prisma.Sql[] = [];
  /**
   * คอลัมน์เวลาเก็บเป็น timestamp ไม่มีโซน (ค่า UTC) — ส่งขอบเป็นข้อความ ISO แล้ว ::timestamp ให้ตรงตัว
   * ส่ง Date ไปตรง ๆ Prisma ผูกเป็น timestamptz แล้วฐานข้อมูลแปลงตามโซนของ session — ตั้งโซนไม่ใช่ UTC เมื่อไรขอบเลื่อน 7 ชม.
   */
  const at = (d: Date) => Prisma.sql`${d.toISOString()}::timestamp`;
  if (f.range.from) conds.push(Prisma.sql`r.at >= ${at(bkkDayStart(f.range.from))}`);
  if (f.range.to) conds.push(Prisma.sql`r.at < ${at(new Date(bkkDayStart(f.range.to).getTime() + DAY_MS))}`);
  if (f.region) conds.push(Prisma.sql`b.region = ${f.region}`);
  if (f.team) conds.push(Prisma.sql`b.zone = ${f.team}`);
  if (f.branchCode) conds.push(Prisma.sql`b.code = ${f.branchCode}`);
  if (f.machineId !== undefined && !opts.skipMachine) conds.push(Prisma.sql`r."machineId" = ${f.machineId}`);
  if (f.q) {
    const like = likeOf(f.q);
    conds.push(
      Prisma.sql`(b.code ILIKE ${like} OR b.name ILIKE ${like} OR s."partCode" ILIKE ${like} OR s.name ILIKE ${like} OR r."woCode" ILIKE ${like})`
    );
  }
  const where = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}` : Prisma.empty;
  return Prisma.sql`
    raw AS (
      SELECT 'USED'::text AS kind, p.id AS "partRowId", p."sparePartId", p.quantity AS qty,
             w.id AS "workOrderId", w.code AS "woCode", w."branchId", w."machineId",
             COALESCE(w."closedAt", w."updatedAt") AS at
      FROM "WorkOrderPart" p
      JOIN "WorkOrder" w ON w.id = p."workOrderId"
      WHERE p.kind = 'USED' AND w.status IN ('DONE', 'CLAIM_REVIEW') AND w."isTest" = false ${armAnd}
      UNION ALL
      -- เคลมถูกตีกลับรอปิดใหม่ — ขาแยก ใบพวกนี้มีไม่กี่ใบ: คำสั่งย่อยหาเวลาปิดจากประวัติอยู่ในขาเดียวกับใบปิดแล้วทั้งระบบ
      -- ฐานข้อมูลประเมินว่าแพงเกินจริง แล้วเปิด JIT ระดับ optimize (ช้าขึ้นเกือบ 2 วินาทีทั้งที่ทำงานจริงไม่ถึงครึ่งวินาที)
      SELECT 'USED'::text, p.id, p."sparePartId", p.quantity,
             w.id, w.code, w."branchId", w."machineId",
             COALESCE((SELECT max(l."createdAt") FROM "WorkOrderLog" l WHERE l."workOrderId" = w.id AND l.action = 'CLOSED'), w."updatedAt")
      FROM "WorkOrderPart" p
      JOIN "WorkOrder" w ON w.id = p."workOrderId"
      WHERE p.kind = 'USED' AND w.status NOT IN ('DONE', 'CLAIM_REVIEW', 'CANCELLED') AND w."closedById" IS NOT NULL
        AND w."isTest" = false ${armAnd}
      UNION ALL
      SELECT 'ISSUED'::text, p.id, p."sparePartId", p.quantity,
             w.id, w.code, w."branchId", w."machineId",
             COALESCE(
               CASE WHEN p."inStock" IS TRUE AND COALESCE(p."requisitionNo", '') <> '' THEN p."checkedAt"
                    ELSE (SELECT max(l."createdAt") FROM "WorkOrderLog" l
                          WHERE l."workOrderId" = w.id AND l.action = 'TRANSFER_REQUESTED') END,
               p."checkedAt", w."updatedAt")
      FROM "WorkOrderPart" p
      JOIN "WorkOrder" w ON w.id = p."workOrderId"
      JOIN "SparePart" sp ON sp.id = p."sparePartId"
      WHERE p.kind = 'WAITING' AND sp."offCatalog" = false AND w."isTest" = false
        AND w.status NOT IN ('DONE', 'CLAIM_REVIEW', 'CANCELLED') AND w."closedById" IS NULL
        AND ((p."inStock" IS TRUE AND COALESCE(p."requisitionNo", '') <> '') OR COALESCE(p."transferReqNo", '') <> '') ${armAnd}
    ),
    f AS (
      SELECT r.*, b.code AS "branchCode", s."partCode"
      FROM raw r
      JOIN "Branch" b ON b.id = r."branchId"
      JOIN "SparePart" s ON s.id = r."sparePartId"
      ${where}
    )`;
}

/** ใส่ชื่อ f. เสมอ — คำสั่งแถวรายละเอียด join WorkOrderPart ที่มีคอลัมน์ kind ของตัวเอง (WAITING/USED) */
const kindCond = (k: Filters["kind"]) =>
  k === "used" ? Prisma.sql`f.kind = 'USED'` : k === "issued" ? Prisma.sql`f.kind = 'ISSUED'` : Prisma.sql`TRUE`;
const SUMS = Prisma.sql`
  COALESCE(SUM(qty) FILTER (WHERE kind = 'USED'), 0)::int AS used,
  COALESCE(SUM(qty) FILTER (WHERE kind = 'ISSUED'), 0)::int AS issued,
  COALESCE(SUM(qty), 0)::int AS pieces`;

/**
 * หัวกลุ่มโชว์ตัวอย่าง 5 อันดับแรก (อะไหล่ของสาขา / สาขาของอะไหล่) — ที่เหลือดูตอนกดเปิดกลุ่ม
 * ตัวอย่างรวมเป็นก้อนเดียวต่อกลุ่ม (tp) แล้ว LEFT JOIN — เคยเป็นคำสั่งย่อยในแต่ละแถว ซึ่งฐานข้อมูลอ่านแถวทั้งหมดตั้งแต่เริ่มใช้ระบบ
 * ใหม่ทุกกลุ่มในหน้า (50 รอบ ช้ากว่านี้ราว 3 เท่า และช้าลงเรื่อย ๆ ตามประวัติที่ยาวขึ้น)
 */
const TOP = 5;
export const PAGE_GROUPS = 50;
const PAGE_ROWS = 100;

export interface Counts {
  used: number;
  issued: number;
  pieces: number;
}
export interface TopPart extends Counts {
  sparePartId: number;
  partCode: string;
  partName: string;
  offCatalog: boolean;
}
export interface TopBranch extends Counts {
  branchCode: string;
  branchName: string;
  region?: string | null;
  team?: string | null;
}
export interface BranchGroup extends Counts {
  key: string;
  branchId: number;
  branchCode: string;
  branchName: string;
  region: string | null;
  team: string | null;
  orders: number;
  partCount: number;
  lastAt: Date | null;
  topParts: TopPart[];
}
export interface PartGroup extends Counts {
  key: string;
  sparePartId: number;
  partCode: string;
  partName: string;
  brand: string | null;
  offCatalog: boolean;
  orders: number;
  branchCount: number;
  lastAt: Date | null;
  topBranches: TopBranch[];
}

async function summaryOf(f: Filters) {
  const k = kindCond(f.kind);
  const [s] = await prisma.$queryRaw<
    { chipUsed: number; chipIssued: number; branches: number; parts: number; orders: number }[]
  >(Prisma.sql`
    WITH ${baseCte(f)}
    SELECT COALESCE(SUM(qty) FILTER (WHERE kind = 'USED'), 0)::int AS "chipUsed",
           COALESCE(SUM(qty) FILTER (WHERE kind = 'ISSUED'), 0)::int AS "chipIssued",
           (COUNT(DISTINCT "branchId") FILTER (WHERE ${k}))::int AS branches,
           (COUNT(DISTINCT "sparePartId") FILTER (WHERE ${k}))::int AS parts,
           (COUNT(DISTINCT "workOrderId") FILTER (WHERE ${k}))::int AS orders
    FROM f`);
  const used = f.kind === "issued" ? 0 : s.chipUsed;
  const issued = f.kind === "used" ? 0 : s.chipIssued;
  return {
    summary: { branches: s.branches, parts: s.parts, orders: s.orders, used, issued, pieces: used + issued },
    chips: { all: s.chipUsed + s.chipIssued, used: s.chipUsed, issued: s.chipIssued },
  };
}

async function branchGroups(f: Filters, offset: number, limit: number): Promise<BranchGroup[]> {
  const rows = await prisma.$queryRaw<Omit<BranchGroup, "key">[]>(Prisma.sql`
    WITH ${baseCte(f)},
    fk AS (SELECT * FROM f WHERE ${kindCond(f.kind)}),
    g AS (
      SELECT "branchId", MIN("branchCode") AS "branchCode", ${SUMS},
             COUNT(DISTINCT "workOrderId")::int AS orders, COUNT(DISTINCT "sparePartId")::int AS "partCount", MAX(at) AS "lastAt"
      FROM fk GROUP BY "branchId"
      ORDER BY pieces DESC, "branchCode" ASC
      LIMIT ${limit} OFFSET ${offset}
    ),
    t AS (
      SELECT fk."branchId", fk."sparePartId", ${SUMS},
             ROW_NUMBER() OVER (PARTITION BY fk."branchId" ORDER BY SUM(qty) DESC, MIN(fk."partCode")) AS rn
      FROM fk WHERE fk."branchId" IN (SELECT "branchId" FROM g)
      GROUP BY fk."branchId", fk."sparePartId"
    ),
    tp AS (
      SELECT t."branchId",
             json_agg(json_build_object(
               'sparePartId', t."sparePartId", 'partCode', sp."partCode", 'partName', sp.name, 'offCatalog', sp."offCatalog",
               'used', t.used, 'issued', t.issued, 'pieces', t.pieces) ORDER BY t.rn) AS "topParts"
      FROM t JOIN "SparePart" sp ON sp.id = t."sparePartId"
      WHERE t.rn <= ${TOP}
      GROUP BY t."branchId"
    )
    SELECT g.*, b.name AS "branchName", b.region, b.zone AS team, COALESCE(tp."topParts", '[]'::json) AS "topParts"
    FROM g JOIN "Branch" b ON b.id = g."branchId" LEFT JOIN tp ON tp."branchId" = g."branchId"
    ORDER BY g.pieces DESC, g."branchCode" ASC`);
  return rows.map((r) => ({ key: r.branchCode, ...r }));
}

async function partGroups(f: Filters, offset: number, limit: number): Promise<PartGroup[]> {
  const rows = await prisma.$queryRaw<Omit<PartGroup, "key">[]>(Prisma.sql`
    WITH ${baseCte(f)},
    fk AS (SELECT * FROM f WHERE ${kindCond(f.kind)}),
    g AS (
      SELECT "sparePartId", MIN("partCode") AS "partCode", ${SUMS},
             COUNT(DISTINCT "workOrderId")::int AS orders, COUNT(DISTINCT "branchId")::int AS "branchCount", MAX(at) AS "lastAt"
      FROM fk GROUP BY "sparePartId"
      ORDER BY pieces DESC, "partCode" ASC
      LIMIT ${limit} OFFSET ${offset}
    ),
    t AS (
      SELECT fk."sparePartId", fk."branchId", ${SUMS},
             ROW_NUMBER() OVER (PARTITION BY fk."sparePartId" ORDER BY SUM(qty) DESC, MIN(fk."branchCode")) AS rn
      FROM fk WHERE fk."sparePartId" IN (SELECT "sparePartId" FROM g)
      GROUP BY fk."sparePartId", fk."branchId"
    ),
    tb AS (
      SELECT t."sparePartId",
             json_agg(json_build_object(
               'branchCode', b.code, 'branchName', b.name, 'used', t.used, 'issued', t.issued, 'pieces', t.pieces) ORDER BY t.rn) AS "topBranches"
      FROM t JOIN "Branch" b ON b.id = t."branchId"
      WHERE t.rn <= ${TOP}
      GROUP BY t."sparePartId"
    )
    SELECT g.*, sp.name AS "partName", sp.brand, sp."offCatalog", COALESCE(tb."topBranches", '[]'::json) AS "topBranches"
    FROM g JOIN "SparePart" sp ON sp.id = g."sparePartId" LEFT JOIN tb ON tb."sparePartId" = g."sparePartId"
    ORDER BY g.pieces DESC, g."partCode" ASC`);
  return rows.map((r) => ({ key: String(r.sparePartId), ...r }));
}

/** ภาค/ทีมของทุกสาขา (รวมสาขาที่ปิดไปแล้ว — ของที่เคยไปยังอยู่ในรายงาน) ไว้ทำ dropdown */
async function filterOptions() {
  const [o] = await prisma.$queryRaw<{ regions: string[]; teams: string[] }[]>(Prisma.sql`
    SELECT COALESCE(array_agg(DISTINCT region) FILTER (WHERE COALESCE(region, '') <> ''), '{}') AS regions,
           COALESCE(array_agg(DISTINCT zone) FILTER (WHERE COALESCE(zone, '') <> ''), '{}') AS teams
    FROM "Branch"`);
  const th = (a: string, b: string) => a.localeCompare(b, "th");
  return { regions: [...o.regions].sort(th), teams: [...o.teams].sort(th) };
}

/** หน้ารายงาน — ตัวเลขบนสุด · หัวกลุ่มทีละหน้า · ตัวเลือก: สามคำสั่งพร้อมกัน ไม่มีคำสั่งไหนรออีกคำสั่ง */
export async function buildBranchPartsPage(p: { view: "branch" | "part"; filters: Filters; offset: number; limit?: number }) {
  const limit = Math.min(100, Math.max(1, p.limit ?? PAGE_GROUPS));
  const [s, groups, options] = await Promise.all([
    summaryOf(p.filters),
    p.view === "branch" ? branchGroups(p.filters, p.offset, limit) : partGroups(p.filters, p.offset, limit),
    filterOptions(),
  ]);
  // จำนวนกลุ่มทั้งหมด = จำนวนสาขา/อะไหล่ในตัวเลขบนสุด (ตัวกรองชุดเดียวกัน) ไม่ต้องนับซ้ำอีกคำสั่ง
  const groupCount = p.view === "branch" ? s.summary.branches : s.summary.parts;
  const next = p.offset + groups.length;
  return {
    generatedAt: new Date(),
    view: p.view,
    kind: p.filters.kind,
    range: p.filters.range,
    ...s,
    groupCount,
    groups,
    nextCursor: groups.length === limit && next < groupCount ? String(next) : null,
    options,
  };
}

// ── แถวรายละเอียด ─────────────────────────────────────

export interface Row {
  kind: PartKind;
  kindLabel: string;
  partRowId: number;
  at: string;
  day: string;
  workOrderId: number;
  code: string;
  status: string;
  statusLabel: string;
  parentCode: string | null;
  subTeam: string | null;
  branchCode: string;
  branchName: string;
  region: string | null;
  team: string | null;
  machineId: number | null;
  machineCode: string | null;
  machineType: string | null;
  machineBrand: string | null;
  machineCapacityKg: number | null;
  sparePartId: number;
  partCode: string;
  partName: string;
  offCatalog: boolean;
  quantity: number;
  unit: string | null;
  closedAt: string | null;
  closedBy: string | null;
  claimStatus: string | null;
  warehouse: string | null;
  requisitionNo: string | null;
  transferFrom: string | null;
  transferReqNo: string | null;
  transferNo: string | null;
  transferArrived: boolean;
  detail: string;
}

interface RawRow {
  kind: PartKind;
  partRowId: number;
  at: Date;
  qty: number;
  workOrderId: number;
  code: string;
  status: string;
  parentCode: string | null;
  subTeam: string | null;
  branchCode: string;
  branchName: string;
  region: string | null;
  team: string | null;
  machineId: number | null;
  machineCode: string | null;
  machineType: string | null;
  machineBrand: string | null;
  machineCapacityKg: number | null;
  sparePartId: number;
  partCode: string;
  partName: string;
  offCatalog: boolean;
  unit: string | null;
  closedAt: Date | null;
  closedBy: string | null;
  claimStatus: string | null;
  inStock: boolean | null;
  warehouse: string | null;
  requisitionNo: string | null;
  transferFrom: string | null;
  transferReqNo: string | null;
  transferNo: string | null;
  transferredAt: Date | null;
  branchId: number;
  rowCount: number;
}

/** แถวรายละเอียด — tail = เรียงและตัดหน้า (หน้าจอทีละ 100 แถวใหม่ไปเก่า · Excel ทีละชุดสาขา) */
async function rawRows(f: Filters, where: Prisma.Sql, tail: Prisma.Sql, cte: { branchIds?: number[] } = {}) {
  return prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH ${baseCte(f, cte)}
    SELECT f.kind, f."partRowId", f.at, f.qty, f."workOrderId", f."branchId", w.code, w.status, pw.code AS "parentCode", w."closeSubTeam" AS "subTeam",
           b.code AS "branchCode", b.name AS "branchName", b.region, b.zone AS team,
           f."machineId", m.code AS "machineCode", m.type AS "machineType", m.brand AS "machineBrand", m."capacityKg" AS "machineCapacityKg",
           f."sparePartId", s."partCode", s.name AS "partName", s."offCatalog", p.unit,
           w."closedAt", cu.name AS "closedBy", cl.status AS "claimStatus",
           p."inStock", p.warehouse, p."requisitionNo", p."transferFrom", p."transferReqNo", p."transferNo", p."transferredAt",
           (COUNT(*) OVER ())::int AS "rowCount"
    FROM f
    JOIN "WorkOrderPart" p ON p.id = f."partRowId"
    JOIN "WorkOrder" w ON w.id = f."workOrderId"
    JOIN "Branch" b ON b.id = f."branchId"
    JOIN "SparePart" s ON s.id = f."sparePartId"
    LEFT JOIN "Machine" m ON m.id = f."machineId"
    LEFT JOIN "User" cu ON cu.id = w."closedById"
    LEFT JOIN "WorkOrder" pw ON pw.id = w."parentId"
    LEFT JOIN LATERAL (
      -- แถวล่าสุดของชิ้นนี้ในงานซ่อมครั้งนี้ (หลังเปิดใบใหม่ครั้งล่าสุด — กติกาเดียวกับใบงาน lockSince)
      -- เวลาเท่ากัน (ส่งพร้อมกัน) ให้ id ตัดสิน ไม่งั้นป้ายสลับระหว่างโหลด
      SELECT c.status FROM "PartClaim" c
      WHERE c."workOrderId" = w.id AND c."sparePartId" = f."sparePartId"
        AND c."createdAt" >= COALESCE(
          (SELECT max(l."createdAt") FROM "WorkOrderLog" l WHERE l."workOrderId" = w.id AND l.action = 'REOPENED'),
          '-infinity'::timestamp)
      ORDER BY c."createdAt" DESC, c.id DESC LIMIT 1
    ) cl ON f.kind = 'USED'
    WHERE ${kindCond(f.kind)} AND ${where}
    ${tail}`);
}

const dayText = (d: Date | null) => (d ? thaiDateTime(d, false) : "—");
/** "27 ต.ค. 69" — บรรทัดรายละเอียดอยู่ข้างคอลัมน์วันที่ที่หน้าจอเขียนปีสองหลัก ปีเต็มในแถวเดียวกันอ่านเหมือนคนละวัน */
const shortDay = (d: Date | null) => (d ? thaiDateTime(d, false).replace(/(\d{2})(\d{2})$/, "$2") : "—");

/** บรรทัดใต้ป้ายสถานะ — ทำที่เซิร์ฟเวอร์ หน้าจอกับไฟล์ Excel จึงเขียนเหมือนกัน */
function detailText(r: RawRow, statusLabel: string): string {
  if (r.kind === "USED") {
    /**
     * คำเรื่องเคลมของชิ้นนี้ — อ่านจากแถวเคลมของชิ้นนี้เอง ไม่ใช่จากขั้นของใบ (ก้อน 3 ตัดสินทีละชิ้น)
     * เดิมใบที่รอตรวจเคลมเขียน "ส่งเคลมตัวเก่าแล้ว" ทุกชิ้น รวมชิ้นที่ช่างไม่ได้ส่งเคลม และใบที่ ก. ผ่าน ข. ตีกลับ
     * เขียนว่าตีกลับทั้งสองชิ้น · ชิ้นที่ไม่มีแถวเคลม (ไม่ส่ง/นอกประกัน) ไม่มีคำเรื่องเคลม ยกเว้นใบที่ถูกตีกลับกลับไปหาช่าง
     * (ใบยังไม่ปิด — ชิ้นนี้อาจเปลี่ยนตอนช่างปิดใหม่)
     */
    const claim =
      r.claimStatus === "PENDING"
        ? "ส่งเคลมตัวเก่าแล้ว · รอตรวจเคลม"
        : r.claimStatus === "REJECTED"
        ? r.status !== "DONE"
          ? "เคลมถูกตีกลับ · รอช่างปิดงานใหม่"
          : "เคลมถูกตีกลับ"
        : r.claimStatus === "APPROVED"
        ? "ส่งเคลมตัวเก่าแล้ว"
        : r.claimStatus === "DECLINED"
        ? "ปิดเคลม ไม่ส่งผู้ขาย"
        : !r.claimStatus && r.status !== "DONE" && r.status !== "CLAIM_REVIEW"
        ? "รอช่างปิดงานใหม่"
        : null;
    // วันที่จาก at (ไม่ใช่ closedAt) — ใบที่เคลมถูกตีกลับถูกล้างเวลาปิด at คือเวลาปิดรอบนั้นจากประวัติ
    // ไม่ใส่ "นอกสโตร์" — ทุกที่ที่โชว์บรรทัดนี้มีป้าย/คอลัมน์นอกสโตร์อยู่แล้ว ซ้ำสามรอบในแถวเดียว
    return [`ปิดงาน ${shortDay(r.at)}`, r.closedBy, r.subTeam ? `ทีม SUB ${r.subTeam}` : null, claim]
      .filter(Boolean)
      .join(" · ");
  }
  const delivered = r.inStock === true && !!r.requisitionNo;
  const where = delivered
    ? `${r.warehouse ?? "ไม่ระบุคลัง"} · ใบเบิก ${r.requisitionNo}`
    : r.transferredAt
    ? `โอนถึง${r.warehouse ?? "คลังปลายทาง"}แล้ว · ใบเบิกต้นทาง ${r.transferReqNo}`
    : `กำลังโอน ${r.transferFrom ?? "—"} → ${r.warehouse ?? "—"} · ใบโอน ${r.transferNo ?? "—"}`;
  return `${where} · ${statusLabel}`;
}

function shapeRow(r: RawRow): Row {
  const statusLabel = WORK_ORDER_STATUS_LABELS[r.status] ?? r.status;
  const used = r.kind === "USED";
  return {
    kind: r.kind,
    kindLabel: KIND_LABELS[r.kind],
    partRowId: r.partRowId,
    at: r.at.toISOString(),
    day: bkkYmd(r.at),
    workOrderId: r.workOrderId,
    code: r.code,
    status: r.status,
    statusLabel,
    parentCode: r.parentCode,
    subTeam: r.subTeam,
    branchCode: r.branchCode,
    branchName: r.branchName,
    region: r.region,
    team: r.team,
    machineId: r.machineId,
    machineCode: r.machineCode,
    machineType: r.machineType,
    machineBrand: r.machineBrand,
    machineCapacityKg: r.machineCapacityKg,
    sparePartId: r.sparePartId,
    partCode: r.partCode,
    partName: r.partName,
    offCatalog: r.offCatalog,
    quantity: r.qty,
    unit: r.unit,
    closedAt: used ? (r.closedAt ?? r.at).toISOString() : null,
    closedBy: used ? r.closedBy : null,
    claimStatus: used ? r.claimStatus : null,
    warehouse: used ? null : r.warehouse,
    requisitionNo: used ? null : r.requisitionNo,
    transferFrom: used ? null : r.transferFrom,
    transferReqNo: used ? null : r.transferReqNo,
    transferNo: used ? null : r.transferNo,
    transferArrived: !used && !!r.transferReqNo && !!r.transferredAt,
    detail: detailText(r, statusLabel),
  };
}

/** แถวของกลุ่มเดียว (กดเปิดสาขา/อะไหล่) + ยอดแยกของทั้งกลุ่ม — สองคำสั่งพร้อมกัน */
export async function buildBranchPartsDetail(p: { view: "branch" | "part"; key: string; filters: Filters; offset: number; limit?: number }) {
  const limit = Math.min(500, Math.max(1, p.limit ?? PAGE_ROWS));
  const f = p.filters;
  const partId = Number(p.key);
  const inGroup =
    p.view === "branch" ? Prisma.sql`f."branchCode" = ${p.key}` : Prisma.sql`f."sparePartId" = ${Number.isInteger(partId) ? partId : -1}`;
  const breakdownSql =
    p.view === "branch"
      ? Prisma.sql`
        WITH ${baseCte(f)}
        SELECT f."sparePartId", sp."partCode", sp.name AS "partName", sp."offCatalog", ${SUMS}
        FROM f JOIN "SparePart" sp ON sp.id = f."sparePartId"
        WHERE ${kindCond(f.kind)} AND ${inGroup}
        GROUP BY f."sparePartId", sp."partCode", sp.name, sp."offCatalog"
        ORDER BY pieces DESC, sp."partCode"`
      : Prisma.sql`
        WITH ${baseCte(f)}
        SELECT b.code AS "branchCode", b.name AS "branchName", b.region, b.zone AS team, ${SUMS}
        FROM f JOIN "Branch" b ON b.id = f."branchId"
        WHERE ${kindCond(f.kind)} AND ${inGroup}
        GROUP BY b.id, b.code, b.name, b.region, b.zone
        ORDER BY pieces DESC, b.code`;
  const [rows, breakdown] = await Promise.all([
    rawRows(f, inGroup, Prisma.sql`ORDER BY f.at DESC, f."partRowId" DESC LIMIT ${limit} OFFSET ${p.offset}`),
    prisma.$queryRaw<(TopPart | TopBranch)[]>(breakdownSql),
  ]);
  const rowCount = rows[0]?.rowCount ?? 0;
  const next = p.offset + rows.length;
  return {
    view: p.view,
    key: p.key,
    rowCount,
    rows: rows.map(shapeRow),
    nextCursor: rows.length === limit && next < rowCount ? String(next) : null,
    breakdown,
  };
}

/** ตัวเลขบนลิงก์ในใบงาน ("อะไหล่ที่สาขานี้ได้ไปแล้ว (4 ชิ้น)" · "เฉพาะเครื่องนี้ (1 ชิ้น)") — คำสั่งเดียว */
export async function buildBranchPartsCounts(f: Filters) {
  const m = f.machineId ?? null;
  const [c] = await prisma.$queryRaw<{ bu: number; bi: number; mu: number; mi: number }[]>(Prisma.sql`
    WITH ${baseCte(f, { skipMachine: true })}
    SELECT COALESCE(SUM(qty) FILTER (WHERE kind = 'USED'), 0)::int AS bu,
           COALESCE(SUM(qty) FILTER (WHERE kind = 'ISSUED'), 0)::int AS bi,
           COALESCE(SUM(qty) FILTER (WHERE kind = 'USED' AND "machineId" = ${m}), 0)::int AS mu,
           COALESCE(SUM(qty) FILTER (WHERE kind = 'ISSUED' AND "machineId" = ${m}), 0)::int AS mi
    FROM f`);
  return {
    range: f.range,
    branch: { used: c.bu, issued: c.bi, pieces: c.bu + c.bi },
    machine: m === null ? null : { used: c.mu, issued: c.mi, pieces: c.mu + c.mi },
  };
}

// ── Excel ─────────────────────────────────────────────

const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FC" } };
type Cell = string | number | null;
type StreamBook = ExcelJS.stream.xlsx.WorkbookWriter;
type StreamSheet = ReturnType<StreamBook["addWorksheet"]>;

/** แถวรายการอ่านทีละชุดสาขาราวนี้ — หน่วยความจำคงที่ไม่ว่าประวัติจะยาวแค่ไหน และรอฐานข้อมูลระหว่างชุด คำขออื่นได้ทำงาน */
const XLSX_PAGE = 2000;
/**
 * ช่อง "อะไหล่ที่ได้ไป / ไปที่สาขาไหนบ้าง" เขียนได้ไม่เกินเท่านี้ต่อแถว — อะไหล่ที่ไปทุกสาขาจะยาวเกินเพดานช่องของ Excel
 * (32,767 ตัวอักษร ไฟล์เปิดแล้วต้อง "ซ่อม") ที่เหลือดูในชีตรายการทั้งหมด
 */
const SPREAD_MAX = 200;

const machineText = (r: Row) => (r.machineCode ? [r.machineCode, r.machineBrand].filter(Boolean).join(" · ") : "ทั้งสาขา");

/**
 * เปิดชีตแบบ stream — ความกว้างคอลัมน์และหัวตารางค้างต้องตั้งตอนสร้างชีต (WorksheetWriter เขียนลงไฟล์ตั้งแต่แถวแรก
 * ที่ commit ตั้งทีหลังจะหายเงียบ ๆ — เหมือนรายงานทั้งระบบ) จึงกะความกว้างจากแถวชุดแรก (sample)
 */
function openSheet(wb: StreamBook, name: string, title: string, sub: string, head: string[], sample: Cell[][]): StreamSheet {
  const widths = head.map((h, i) =>
    Math.min(44, Math.max(9, h.length + 2, ...sample.slice(0, 500).map((r) => String(r[i] ?? "").length + 2)))
  );
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 4 }] });
  ws.columns = widths.map((width) => ({ width }));
  const t = ws.addRow([title]);
  t.font = { bold: true, size: 14 };
  t.commit();
  const s = ws.addRow([sub]);
  s.font = { size: 10, color: { argb: "FF666666" } };
  s.commit();
  ws.addRow([]).commit();
  const h = ws.addRow(head);
  h.font = { bold: true };
  h.eachCell((c) => (c.fill = HEAD_FILL));
  h.commit();
  return ws;
}

/** ปิดชีต — กรองได้ทุกคอลัมน์ (คนขอ Excel จะเอาไปกรอง/pivot ต่อ) + แถวรวม */
function closeSheet(ws: StreamSheet, cols: number, n: number, total?: Cell[]) {
  if (n) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + n, column: cols } };
  if (!n) ws.addRow(["ไม่มีอะไหล่ที่ไปสาขาตามตัวกรองนี้"]).commit();
  if (total && n) {
    const tr = ws.addRow(total);
    tr.font = { bold: true };
    tr.eachCell((c) => (c.fill = TOTAL_FILL));
    tr.commit();
  }
  ws.commit();
}

function filterText(f: Filters) {
  return [
    `ช่วงวันที่: ${f.range.label}`,
    f.kind === "used" ? `สถานะ: ${KIND_LABELS.USED}` : f.kind === "issued" ? `สถานะ: ${KIND_LABELS.ISSUED}` : null,
    f.region ? `ภาค: ${f.region}` : null,
    f.team ? `ทีม: ${f.team}` : null,
    f.branchCode ? `สาขา: ${f.branchCode}` : null,
    f.machineId !== undefined ? "เฉพาะเครื่องเดียว" : null,
    f.q ? `ค้นหา: "${f.q}"` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

interface BranchSum {
  branchId: number;
  branchCode: string;
  branchName: string;
  region: string | null;
  team: string | null;
  used: number;
  issued: number;
  orders: number;
  rows: number;
  spread: string;
}
interface PartSum {
  partCode: string;
  partName: string;
  offCatalog: boolean;
  used: number;
  issued: number;
  orders: number;
  branchCount: number;
  spread: string;
}

/**
 * ข้อความ "×จำนวน" แยกสองแบบในช่องสรุป ("ZBP-P1 ใช้แล้ว ×1,250 · เบิกแล้ว ×1,100") — เจ้าของงานให้นับแยก ไม่รวมเป็นเลขเดียว
 * แบบเดียวกับชิปบนหน้าจอ · ทำใน SQL ทั้งก้อน ไม่ต้องดึงคู่สาขา×อะไหล่ทั้งหมดมารวมในหน่วยความจำ
 */
const kindTimes = (u: Prisma.Sql, i: Prisma.Sql) => Prisma.sql`concat_ws(' · ',
  CASE WHEN ${u} > 0 THEN 'ใช้แล้ว ×' || to_char(${u}, 'FM999,999,999,990') END,
  CASE WHEN ${i} > 0 THEN 'เบิกแล้ว ×' || to_char(${i}, 'FM999,999,999,990') END)`;
const spreadOf = (label: Prisma.Sql, noun: string) => Prisma.sql`
  string_agg(${label} || ' ' || ${kindTimes(Prisma.sql`pr.used`, Prisma.sql`pr.issued`)}, ', ' ORDER BY pr.rn) FILTER (WHERE pr.rn <= ${SPREAD_MAX})
  || CASE WHEN COUNT(*) > ${SPREAD_MAX} THEN ' … และอีก ' || (COUNT(*) - ${SPREAD_MAX}) || ${` ${noun} (ดูชีตรายการทั้งหมด)`} ELSE '' END`;

/** ชีตรวมตามสาขา — ทุกสาขาตามตัวกรอง มากสุดก่อน (ลำดับเดียวกับหน้าจอ) + จำนวนแถวไว้แบ่งชุดอ่านแถวรายการ */
async function branchSums(f: Filters) {
  return prisma.$queryRaw<BranchSum[]>(Prisma.sql`
    WITH ${baseCte(f)},
    fk AS (SELECT * FROM f WHERE ${kindCond(f.kind)}),
    g AS (
      SELECT "branchId", MIN("branchCode") AS "branchCode", ${SUMS}, COUNT(DISTINCT "workOrderId")::int AS orders, COUNT(*)::int AS rows
      FROM fk GROUP BY "branchId"
    ),
    pr AS (
      SELECT "branchId", "sparePartId",
             COALESCE(SUM(qty) FILTER (WHERE kind = 'USED'), 0)::int AS used,
             COALESCE(SUM(qty) FILTER (WHERE kind = 'ISSUED'), 0)::int AS issued,
             ROW_NUMBER() OVER (PARTITION BY "branchId" ORDER BY SUM(qty) DESC, MIN("partCode")) AS rn
      FROM fk GROUP BY "branchId", "sparePartId"
    ),
    sp AS (
      SELECT pr."branchId",
             ${spreadOf(Prisma.sql`CASE WHEN s."offCatalog" THEN s.name || ' (นอกสโตร์)' ELSE s."partCode" END`, "รายการ")} AS spread
      FROM pr JOIN "SparePart" s ON s.id = pr."sparePartId"
      GROUP BY pr."branchId"
    )
    SELECT g."branchId", g."branchCode", b.name AS "branchName", b.region, b.zone AS team, g.used, g.issued, g.orders, g.rows, sp.spread
    FROM g JOIN "Branch" b ON b.id = g."branchId" JOIN sp ON sp."branchId" = g."branchId"
    ORDER BY g.pieces DESC, g."branchCode"`);
}

/** ชีตรวมตามอะไหล่ — ไปที่สาขาไหนบ้าง */
async function partSums(f: Filters) {
  return prisma.$queryRaw<PartSum[]>(Prisma.sql`
    WITH ${baseCte(f)},
    fk AS (SELECT * FROM f WHERE ${kindCond(f.kind)}),
    g AS (
      SELECT "sparePartId", ${SUMS}, COUNT(DISTINCT "workOrderId")::int AS orders, COUNT(DISTINCT "branchId")::int AS "branchCount"
      FROM fk GROUP BY "sparePartId"
    ),
    pr AS (
      SELECT "sparePartId", "branchId",
             COALESCE(SUM(qty) FILTER (WHERE kind = 'USED'), 0)::int AS used,
             COALESCE(SUM(qty) FILTER (WHERE kind = 'ISSUED'), 0)::int AS issued,
             ROW_NUMBER() OVER (PARTITION BY "sparePartId" ORDER BY SUM(qty) DESC, MIN("branchCode")) AS rn
      FROM fk GROUP BY "sparePartId", "branchId"
    ),
    sb AS (
      SELECT pr."sparePartId", ${spreadOf(Prisma.sql`b.code`, "สาขา")} AS spread
      FROM pr JOIN "Branch" b ON b.id = pr."branchId"
      GROUP BY pr."sparePartId"
    )
    SELECT s."partCode", s.name AS "partName", s."offCatalog", g.used, g.issued, g.orders, g."branchCount", sb.spread
    FROM g JOIN "SparePart" s ON s.id = g."sparePartId" JOIN sb ON sb."sparePartId" = g."sparePartId"
    ORDER BY g.pieces DESC, s."partCode"`);
}

/**
 * แถวรายการเรียงตามสาขาที่ได้มากสุดก่อน (ลำดับเดียวกับหน้าจอและชีตรวมตามสาขา) แล้วใหม่ไปเก่า — อ่านทีละชุดสาขา
 * ที่รวมกันไม่เกิน XLSX_PAGE แถว (สาขาเดียวที่เกินอ่านต่อด้วย keyset) · ข้อมูลเปลี่ยนระหว่างอ่านก็ไม่หลุดเพราะอ่านจนชุดหมดจริง
 */
async function* rowPages(f: Filters, branches: BranchSum[]): AsyncGenerator<RawRow[]> {
  for (let i = 0; i < branches.length; ) {
    const ids: number[] = [];
    let n = 0;
    while (i < branches.length && (ids.length === 0 || n + branches[i].rows <= XLSX_PAGE) && ids.length < 500) {
      ids.push(branches[i].branchId);
      n += branches[i].rows;
      i++;
    }
    const rank = Prisma.sql`array_position(${ids}::int[], f."branchId")`;
    let after: { rank: number; at: Date; id: number } | null = null;
    for (;;) {
      const keyset: Prisma.Sql = after
        ? Prisma.sql`(${rank} > ${after.rank} OR (${rank} = ${after.rank} AND (f.at, f."partRowId") < (${after.at.toISOString()}::timestamp, ${after.id})))`
        : Prisma.sql`TRUE`;
      const page = await rawRows(f, keyset, Prisma.sql`ORDER BY ${rank}, f.at DESC, f."partRowId" DESC LIMIT ${XLSX_PAGE}`, { branchIds: ids });
      if (page.length) yield page;
      if (page.length < XLSX_PAGE) break;
      const last = page[page.length - 1];
      after = { rank: ids.indexOf(last.branchId) + 1, at: last.at, id: last.partRowId };
    }
  }
}

/**
 * ไฟล์ Excel ตามตัวกรองที่เลือกอยู่ — ทุกแถว ไม่ตัดหน้า (แถวละสาขา+อะไหล่+ใบงาน ตามตัวอย่าง)
 * ชีต: รายการทั้งหมด · รวมตามสาขา · รวมตามอะไหล่ — ยอดทุกชีตกระทบกันได้ (เทสต์เช็ค)
 * ใช้แล้วกับเบิกแล้วอยู่คนละคอลัมน์ทุกชีต ไม่มีช่อง "รวม" ที่บวกสองแบบเข้าด้วยกัน (เจ้าของงาน: นับแยก ไม่รวมเป็นเลขเดียว)
 * — คอลัมน์จำนวนเดียวที่ปนสองแบบ คนกด SUM ใน Excel จะได้เลขรวมโดยไม่รู้ตัว
 */
export async function buildBranchPartsWorkbook(f: Filters): Promise<{ data: Buffer; rowCount: number }> {
  const [branches, parts] = await Promise.all([branchSums(f), partSums(f)]);
  const now = new Date();
  const sub = `${filterText(f)} · ออกเมื่อ ${thaiDateTime(now)} · นับเป็นชิ้น · ไม่นับใบยกเลิกและใบทดสอบ · ของนอกสโตร์นับเฉพาะที่ใช้แล้ว`;

  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((res, rej) => {
    out.on("end", res);
    out.on("error", rej);
  });
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true });
  wb.creator = "OTTERI Service";
  wb.created = now;

  const head = [
    "วันที่", "รหัสสาขา", "ชื่อสาขา", "ภาค", "ทีม", "รหัสอะไหล่", "ชื่ออะไหล่", "นอกสโตร์",
    `${KIND_LABELS.USED} (ชิ้น)`, `${KIND_LABELS.ISSUED} (ชิ้น)`, "หน่วย", "สถานะ",
    "เครื่อง", "เลขใบงาน", "ขั้นตอนตอนนี้", "รายละเอียด", "คลัง", "เลขใบเบิก", "ใบเบิกต้นทาง (โอน)", "เลขที่ใบโอน", "ใบรออะไหล่ของ", "ทีม SUB",
  ];
  const cells = (r: Row): Cell[] => [
    dayText(new Date(r.at)), r.branchCode, r.branchName, r.region ?? "—", r.team ?? "—", r.offCatalog ? "นอกสโตร์" : r.partCode,
    r.partName, r.offCatalog ? "ใช่" : "", r.kind === "USED" ? r.quantity : null, r.kind === "ISSUED" ? r.quantity : null,
    r.unit ?? "", r.kindLabel, machineText(r), r.code, r.statusLabel, r.detail,
    r.warehouse ?? "", r.requisitionNo ?? "", r.transferReqNo ?? "", r.transferNo ?? "", r.parentCode ?? "", r.subTeam ?? "",
  ];
  let ws: StreamSheet | null = null;
  let rowCount = 0;
  const tot = { used: 0, issued: 0 };
  for await (const page of rowPages(f, branches)) {
    const block = page.map((raw) => {
      const r = shapeRow(raw);
      tot[r.kind === "USED" ? "used" : "issued"] += r.quantity;
      return cells(r);
    });
    ws ??= openSheet(wb, "รายการทั้งหมด", "อะไหล่ที่ไปแต่ละสาขา — รายการทั้งหมด", sub, head, block);
    for (const c of block) ws.addRow(c).commit();
    rowCount += block.length;
  }
  ws ??= openSheet(wb, "รายการทั้งหมด", "อะไหล่ที่ไปแต่ละสาขา — รายการทั้งหมด", sub, head, []);
  closeSheet(ws, head.length, rowCount, ["รวม", "", "", "", "", "", "", "", tot.used, tot.issued]);

  const bHead = ["รหัสสาขา", "ชื่อสาขา", "ภาค", "ทีม", `${KIND_LABELS.USED} (ชิ้น)`, `${KIND_LABELS.ISSUED} (ชิ้น)`, "จำนวนใบงาน", "อะไหล่ที่ได้ไป"];
  const bRows: Cell[][] = branches.map((g) => [g.branchCode, g.branchName, g.region ?? "—", g.team ?? "—", g.used, g.issued, g.orders, g.spread]);
  const bs = openSheet(wb, "รวมตามสาขา", "รวมตามสาขา — สาขาไหนได้อะไหล่ไปกี่ชิ้น", sub, bHead, bRows);
  for (const r of bRows) bs.addRow(r).commit();
  const bt = branches.reduce((t, g) => ({ used: t.used + g.used, issued: t.issued + g.issued }), { used: 0, issued: 0 });
  closeSheet(bs, bHead.length, bRows.length, ["รวม", "", "", "", bt.used, bt.issued]);

  const pHead = ["รหัสอะไหล่", "ชื่ออะไหล่", `${KIND_LABELS.USED} (ชิ้น)`, `${KIND_LABELS.ISSUED} (ชิ้น)`, "จำนวนสาขา", "จำนวนใบงาน", "ไปที่สาขาไหนบ้าง"];
  const pRows: Cell[][] = parts.map((g) => [g.offCatalog ? "นอกสโตร์" : g.partCode, g.partName, g.used, g.issued, g.branchCount, g.orders, g.spread]);
  const ps = openSheet(wb, "รวมตามอะไหล่", "รวมตามอะไหล่ — ไปที่สาขาไหนบ้าง", sub, pHead, pRows);
  for (const r of pRows) ps.addRow(r).commit();
  const pt = parts.reduce((t, g) => ({ used: t.used + g.used, issued: t.issued + g.issued }), { used: 0, issued: 0 });
  closeSheet(ps, pHead.length, pRows.length, ["รวม", "", pt.used, pt.issued]);

  await wb.commit();
  await done;
  return { data: Buffer.concat(chunks), rowCount };
}
