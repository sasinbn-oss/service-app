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
 *  · แถว USED ที่ค้างในใบที่กลับมาเปิดอยู่ (เคลมถูกตีกลับ · เปิดงานใหม่) — ใบยังไม่จบ ชิ้นที่เบิกไปขึ้นเป็น "เบิกแล้ว" แทน
 *  · ของนอกสโตร์ไม่มีวันเป็น "เบิกแล้ว" (ไม่มีใบเบิก ไม่ได้ออกจากคลังของบริษัท) แต่ไปถึงสาขาจริงตอนใช้ → นับใน "ใช้แล้ว" พร้อมป้าย
 * ใบรออะไหล่ (ใบแยก parentId) และใบงาน SUB นับตามปกติ — ใบแยกย้ายอะไหล่ไปใบใหม่ ไม่ได้คัดลอก ชิ้นหนึ่งจึงอยู่ใบเดียว
 *
 * เร็วพอสำหรับทั้งหมดตั้งแต่เริ่มใช้ระบบ × ~1,200 สาขา บนฐานข้อมูลที่อยู่คนละ region (ทุกคำสั่งคือไปกลับจริง):
 * รวมใน SQL ทั้งหมด หน้ารายงานถาม 3 ครั้งพร้อมกัน (ตัวเลขบนสุด · หัวกลุ่มทีละหน้า · ตัวเลือกภาค/ทีม)
 * แถวของแต่ละกลุ่มโหลดตอนกดเปิดกลุ่มนั้น ไฟล์ Excel ได้ทุกแถวและเขียนแบบ stream (หน่วยความจำ Render 512 MB)
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

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "ช่วงวันที่ไม่ถูกต้อง")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "ช่วงวันที่ไม่ถูกต้อง");
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "ข้อความยาวเกินไป")
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
  format: z.enum(["json", "xlsx"]).default("json"),
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
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
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
 * วันที่ของแถว (at): ใช้แล้ว = เวลาปิดงาน · เบิกแล้ว = เวลาบันทึกเบิก (เบิกเพื่อโอนอย่างเดียว = ประวัติโอนครั้งล่าสุด
 * แบบเดียวกับรายงานเบิกแล้ว — แถวอะไหล่ไม่มีช่องเวลาโอน) · ข้อมูลเก่าที่ไม่มีเวลาเลยใช้เวลาแก้ใบล่าสุด ไม่ทิ้งแถว
 */
function baseCte(f: Filters, opts: { skipMachine?: boolean } = {}): Prisma.Sql {
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
      WHERE p.kind = 'USED' AND w.status IN ('DONE', 'CLAIM_REVIEW') AND w."isTest" = false
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
        AND w.status NOT IN ('DONE', 'CLAIM_REVIEW', 'CANCELLED')
        AND ((p."inStock" IS TRUE AND COALESCE(p."requisitionNo", '') <> '') OR COALESCE(p."transferReqNo", '') <> '')
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

/** หัวกลุ่มโชว์ตัวอย่าง 5 อันดับแรก (อะไหล่ของสาขา / สาขาของอะไหล่) — ที่เหลือดูตอนกดเปิดกลุ่ม */
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
    )
    SELECT g.*, b.name AS "branchName", b.region, b.zone AS team,
           COALESCE((SELECT json_agg(json_build_object(
                       'sparePartId', t."sparePartId", 'partCode', sp."partCode", 'partName', sp.name, 'offCatalog', sp."offCatalog",
                       'used', t.used, 'issued', t.issued, 'pieces', t.pieces) ORDER BY t.rn)
                     FROM t JOIN "SparePart" sp ON sp.id = t."sparePartId"
                     WHERE t."branchId" = g."branchId" AND t.rn <= ${TOP}), '[]'::json) AS "topParts"
    FROM g JOIN "Branch" b ON b.id = g."branchId"
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
    )
    SELECT g.*, sp.name AS "partName", sp.brand, sp."offCatalog",
           COALESCE((SELECT json_agg(json_build_object(
                       'branchCode', b.code, 'branchName', b.name, 'used', t.used, 'issued', t.issued, 'pieces', t.pieces) ORDER BY t.rn)
                     FROM t JOIN "Branch" b ON b.id = t."branchId"
                     WHERE t."sparePartId" = g."sparePartId" AND t.rn <= ${TOP}), '[]'::json) AS "topBranches"
    FROM g JOIN "SparePart" sp ON sp.id = g."sparePartId"
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
  rowCount: number;
}

async function rawRows(f: Filters, where: Prisma.Sql, page?: { offset: number; limit: number }) {
  return prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH ${baseCte(f)}
    SELECT f.kind, f."partRowId", f.at, f.qty, f."workOrderId", w.code, w.status, pw.code AS "parentCode", w."closeSubTeam" AS "subTeam",
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
      SELECT c.status FROM "PartClaim" c
      WHERE c."workOrderId" = w.id AND c."sparePartId" = f."sparePartId"
      ORDER BY c."createdAt" DESC LIMIT 1
    ) cl ON f.kind = 'USED'
    WHERE ${kindCond(f.kind)} AND ${where}
    ORDER BY f.at DESC, f."partRowId" DESC
    ${page ? Prisma.sql`LIMIT ${page.limit} OFFSET ${page.offset}` : Prisma.empty}`);
}

const dayText = (d: Date | null) => (d ? thaiDateTime(d, false) : "—");

/** บรรทัดใต้ป้ายสถานะ — ทำที่เซิร์ฟเวอร์ หน้าจอกับไฟล์ Excel จึงเขียนเหมือนกัน */
function detailText(r: RawRow, statusLabel: string): string {
  if (r.kind === "USED") {
    const claim =
      r.status === "CLAIM_REVIEW"
        ? "ส่งเคลมตัวเก่าแล้ว · รอตรวจเคลม"
        : r.claimStatus === "REJECTED"
        ? "เคลมถูกตีกลับ"
        : r.claimStatus
        ? "ส่งเคลมตัวเก่าแล้ว"
        : null;
    return [
      `ปิดงาน ${dayText(r.closedAt)}`,
      r.closedBy,
      r.subTeam ? `ทีม SUB ${r.subTeam}` : null,
      claim,
      r.offCatalog ? "นอกสโตร์" : null,
    ]
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
    closedAt: used ? r.closedAt?.toISOString() ?? null : null,
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
    rawRows(f, inGroup, { offset: p.offset, limit }),
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
type Cell = string | number;
type StreamBook = ExcelJS.stream.xlsx.WorkbookWriter;

const machineText = (r: Row) => (r.machineCode ? [r.machineCode, r.machineBrand].filter(Boolean).join(" · ") : "ทั้งสาขา");

/**
 * ชีตตารางแบบ stream — ความกว้างคอลัมน์และหัวตารางค้างต้องตั้งตอนสร้างชีต (WorksheetWriter เขียนลงไฟล์ตั้งแต่แถวแรก
 * ที่ commit ตั้งทีหลังจะหายเงียบ ๆ — เหมือนรายงานทั้งระบบ) · กรองได้ทุกคอลัมน์ เพราะคนขอ Excel จะเอาไปกรอง/pivot ต่อ
 */
function streamTable(wb: StreamBook, name: string, title: string, sub: string, head: string[], rows: Cell[][], total?: Cell[]) {
  const widths = head.map((h, i) =>
    Math.min(44, Math.max(9, h.length + 2, ...rows.slice(0, 500).map((r) => String(r[i] ?? "").length + 2)))
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
  for (const r of rows) ws.addRow(r).commit();
  if (rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: head.length } };
  if (!rows.length) ws.addRow(["ไม่มีอะไหล่ที่ไปสาขาตามตัวกรองนี้"]).commit();
  if (total && rows.length) {
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

/**
 * ไฟล์ Excel ตามตัวกรองที่เลือกอยู่ — ทุกแถว ไม่ตัดหน้า (แถวละสาขา+อะไหล่+ใบงาน ตามตัวอย่าง)
 * ชีต: รายการทั้งหมด · รวมตามสาขา · รวมตามอะไหล่ — ยอดทุกชีตกระทบกันได้ (เทสต์เช็ค)
 */
export async function buildBranchPartsWorkbook(f: Filters): Promise<{ data: Buffer; rowCount: number }> {
  const rows = (await rawRows(f, Prisma.sql`TRUE`)).map(shapeRow);
  const now = new Date();
  const sub = `${filterText(f)} · ออกเมื่อ ${thaiDateTime(now)} · นับเป็นชิ้น · ไม่นับใบยกเลิกและใบทดสอบ · ของนอกสโตร์นับเฉพาะที่ใช้แล้ว`;

  type Agg = Counts & { orders: Set<number>; other: Map<string, number>; label: [string, string, string, string] };
  const add = (m: Map<string, Agg>, key: string, label: Agg["label"], r: Row, otherKey: string) => {
    const g = m.get(key) ?? { used: 0, issued: 0, pieces: 0, orders: new Set<number>(), other: new Map(), label };
    if (r.kind === "USED") g.used += r.quantity;
    else g.issued += r.quantity;
    g.pieces += r.quantity;
    g.orders.add(r.workOrderId);
    g.other.set(otherKey, (g.other.get(otherKey) ?? 0) + r.quantity);
    m.set(key, g);
  };
  const byBranch = new Map<string, Agg>();
  const byPart = new Map<string, Agg>();
  for (const r of rows) {
    add(byBranch, r.branchCode, [r.branchCode, r.branchName, r.region ?? "—", r.team ?? "—"], r, r.offCatalog ? r.partName : r.partCode);
    add(byPart, String(r.sparePartId), [r.offCatalog ? "นอกสโตร์" : r.partCode, r.partName, "", ""], r, r.branchCode);
  }
  const sorted = (m: Map<string, Agg>) => [...m.values()].sort((a, b) => b.pieces - a.pieces || a.label[0].localeCompare(b.label[0]));
  const spread = (g: Agg) =>
    [...g.other.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, n]) => `${k} ×${n}`)
      .join(", ");
  const branches = sorted(byBranch);
  // แถวรายการเรียงตามสาขาที่ได้มากสุดก่อน (ลำดับเดียวกับหน้าจอ) แล้วใหม่ไปเก่า
  const rank = new Map(branches.map((g, i) => [g.label[0], i]));
  rows.sort((a, b) => rank.get(a.branchCode)! - rank.get(b.branchCode)! || b.at.localeCompare(a.at) || b.partRowId - a.partRowId);
  const tot = rows.reduce((t, r) => ((r.kind === "USED" ? (t.used += r.quantity) : (t.issued += r.quantity)), t), { used: 0, issued: 0 });

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

  streamTable(
    wb,
    "รายการทั้งหมด",
    "อะไหล่ที่ไปแต่ละสาขา — รายการทั้งหมด",
    sub,
    [
      "วันที่", "รหัสสาขา", "ชื่อสาขา", "ภาค", "ทีม", "รหัสอะไหล่", "ชื่ออะไหล่", "นอกสโตร์", "จำนวน (ชิ้น)", "หน่วย", "สถานะ",
      "เครื่อง", "เลขใบงาน", "ขั้นตอนตอนนี้", "รายละเอียด", "คลัง", "เลขใบเบิก", "ใบเบิกต้นทาง (โอน)", "เลขที่ใบโอน", "ใบรออะไหล่ของ", "ทีม SUB",
    ],
    rows.map((r) => [
      dayText(new Date(r.at)), r.branchCode, r.branchName, r.region ?? "—", r.team ?? "—", r.offCatalog ? "นอกสโตร์" : r.partCode,
      r.partName, r.offCatalog ? "ใช่" : "", r.quantity, r.unit ?? "", r.kindLabel, machineText(r), r.code, r.statusLabel, r.detail,
      r.warehouse ?? "", r.requisitionNo ?? "", r.transferReqNo ?? "", r.transferNo ?? "", r.parentCode ?? "", r.subTeam ?? "",
    ]),
    ["รวม", "", "", "", "", "", "", "", tot.used + tot.issued, "", `ใช้แล้ว ${tot.used} · เบิกแล้ว ${tot.issued}`]
  );
  streamTable(
    wb,
    "รวมตามสาขา",
    "รวมตามสาขา — สาขาไหนได้อะไหล่ไปกี่ชิ้น",
    sub,
    ["รหัสสาขา", "ชื่อสาขา", "ภาค", "ทีม", KIND_LABELS.USED, KIND_LABELS.ISSUED, "รวม (ชิ้น)", "จำนวนใบงาน", "อะไหล่ที่ได้ไป"],
    branches.map((g) => [...g.label, g.used, g.issued, g.pieces, g.orders.size, spread(g)]),
    ["รวม", "", "", "", tot.used, tot.issued, tot.used + tot.issued]
  );
  streamTable(
    wb,
    "รวมตามอะไหล่",
    "รวมตามอะไหล่ — ไปที่สาขาไหนบ้าง",
    sub,
    ["รหัสอะไหล่", "ชื่ออะไหล่", KIND_LABELS.USED, KIND_LABELS.ISSUED, "รวม (ชิ้น)", "จำนวนสาขา", "จำนวนใบงาน", "ไปที่สาขาไหนบ้าง"],
    sorted(byPart).map((g) => [g.label[0], g.label[1], g.used, g.issued, g.pieces, g.other.size, g.orders.size, spread(g)]),
    ["รวม", "", tot.used, tot.issued, tot.used + tot.issued]
  );
  await wb.commit();
  await done;
  return { data: Buffer.concat(chunks), rowCount: rows.length };
}
