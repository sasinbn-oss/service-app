/**
 * ถังขยะใบงาน (เจ้าของงานตัดสิน 4 พ.ย. 69 — ตัวอย่างที่ตกลง "จัดมา" = ทุกข้อที่แนะนำ)
 *
 * เจ้าของงานถาม "การลบใบงานไปแล้วสามารถกู้คืนมาได้ไหม" — เดิม "ลบใบงานนี้ถาวร" ลบแถวทิ้งพร้อมอะไหล่ ประวัติ
 * ผู้เข้าปฏิบัติงาน และไฟล์ในที่เก็บไฟล์ ไม่มีทางเอากลับมา · ตอนนี้ลบ = ย้ายมาที่นี่ 30 วัน แล้วระบบลบจริง
 *
 * ไฟล์นี้เป็นที่เดียวที่รู้ว่า "อยู่ในถังขยะ" แปลว่าอะไร:
 * - ALIVE / aliveSql — เงื่อนไขที่ทุกที่ที่อ่านใบงานต้องใส่ (รายการที่ใส่แล้ว/ตั้งใจไม่ใส่อยู่ใน README หัวข้อถังขยะ)
 *   ค้นทั้งโปรเจกต์ด้วยคำว่า ALIVE / aliveSql / IN_TRASH ได้ทุกจุด
 * - trashGuard — ทุกเส้นทาง /work-orders/:id ตอบ 404 "ใบงานนี้อยู่ในถังขยะ" ก่อนถึงตัวเส้นทาง
 *   (ทั้งดูและแก้ — แก้ใบในถังขยะเงียบ ๆ แล้วกู้คืนมาเจอของที่ไม่มีใครเห็นตอนแก้ แย่กว่าถูกปฏิเสธ)
 *   ตัดสินจากรายชื่อที่จำไว้ + แถวจริงเมื่อรายชื่ออาจผิด (ดู trashedForRequest)
 * - hardDeleteWorkOrder — ลบจริง (ลบถาวรตอนนี้ของ Super Admin และครบ 30 วัน) ใช้ขั้นตอนเดิมของปุ่มลบถาวร:
 *   ลบแถวก่อน แล้วค่อยลบไฟล์ในที่เก็บไฟล์ · log บรรทัดเดิม
 * - purgeExpired — ลบใบที่ครบ 30 วันทีละไม่กี่ใบ (ไม่มีรอบงานประจำในระบบนี้ — ดูหมายเหตุที่ startTrashPurge)
 */
import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { deleteObject } from "../storage/fileStore";
import { verifyToken } from "./jwt";

/** เก็บในถังขยะกี่วันก่อนลบจริง (เจ้าของงานเลือก 30 วัน) */
export const TRASH_KEEP_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * เหตุผลที่ลบ (บังคับ — เจ้าของงานเลือก) · แอปมีรายการเดียวกันที่ components/TrashOrderModal.tsx
 * ไม่มี "ลูกค้ายกเลิก" โดยตั้งใจ — ใบที่เปิดถูกแต่ไม่ได้ทำต้อง "ยกเลิกใบงาน" (อยู่ในรายงานพร้อมเหตุผล) ไม่ใช่ลบ
 */
export const TRASH_REASONS = ["TEST", "DUPLICATE", "WRONG", "OTHER"] as const;
export const TRASH_REASON_LABELS: Record<string, string> = {
  TEST: "ใบทดสอบ / ลองระบบ",
  DUPLICATE: "เปิดซ้ำ",
  WRONG: "เปิดผิดสาขา / ผิดเครื่อง",
  OTHER: "อื่น ๆ",
};

/** เหตุผลเป็นคำที่คนอ่าน — ประวัติ "ย้ายไปถังขยะ: …" และคอลัมน์เหตุผลในหน้าถังขยะใช้คำเดียวกัน */
export function trashReasonText(reason: string | null, note: string | null): string {
  const label = reason ? TRASH_REASON_LABELS[reason] ?? reason : "ไม่ระบุ";
  if (!note) return label;
  return reason === "OTHER" ? note : `${label} — ${note}`;
}

/** วันที่ระบบจะลบจริง */
export function purgeAtOf(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + TRASH_KEEP_DAYS * DAY_MS);
}

/**
 * ใบที่ยังไม่ถูกลบ — ใส่ใน where ของทุกคำสั่งที่อ่านใบงานให้คนเห็น/นับ
 * เป็นค่าคงที่ตัวเดียว ไม่ใช่ { deletedAt: null } ที่พิมพ์ซ้ำทุกที่ — ค้นคำว่า ALIVE แล้วเจอทุกจุดที่กรองแล้ว
 * จุดที่ยังไม่มีคำนี้คือจุดที่ต้องถามว่าตั้งใจหรือลืม
 */
export const ALIVE = { deletedAt: null } satisfies Prisma.WorkOrderWhereInput;
/** ใบที่อยู่ในถังขยะ — หน้าถังขยะ · ลบครบ 30 วัน · รายชื่อที่เซิร์ฟเวอร์จำไว้ */
export const IN_TRASH = { deletedAt: { not: null } } satisfies Prisma.WorkOrderWhereInput;

/**
 * ALIVE ของคำสั่ง SQL ตรง (รายงาน · คำขอนัดด่วน · เคลมซ้ำ) — alias = ชื่อย่อของตาราง WorkOrder ในคำสั่งนั้น
 * alias มาจากโค้ดเท่านั้น (ไม่ใช่ค่าที่ผู้ใช้ส่ง) จึงใส่เป็นข้อความตรงได้
 */
export function aliveSql(alias: string): Prisma.Sql {
  if (!/^[a-z_]+$/i.test(alias)) throw new Error(`aliveSql: alias ไม่ถูกต้อง ${alias}`);
  return Prisma.raw(`${alias}."deletedAt" IS NULL`);
}

/** ข้อความที่ทุกเส้นทางของใบงานตอบเมื่อใบอยู่ในถังขยะ — แอปอ่าน trashed: true เพื่อปิดหน้าใบงาน */
export const TRASHED_TEXT = "ใบงานนี้อยู่ในถังขยะ — แอดมินกู้คืนได้ที่เมนู “ถังขยะใบงาน”";

// ── รายชื่อใบในถังขยะที่เซิร์ฟเวอร์จำไว้ ─────────────────────────────
//
// ทำไมไม่ถามฐานข้อมูลทุกคำขอ: ฐานข้อมูลอยู่คนละ region (~0.23 วิ/รอบ — README "เวลากดบันทึกแล้วช้า")
// การเปิดดูใบงานไม่ควรช้าลงหนึ่งรอบเพื่อเช็คสิ่งที่เปลี่ยนเดือนละไม่กี่ครั้ง · แบบเดียวกับ utils/userGate.ts:
// จำรายชื่อ id ไว้ (ถังขยะมีไม่กี่ร้อยใบ) โหลดครั้งแรกตอนมีคำขอแรก · โหลดใหม่ทุก 60 วินาที · แก้ทันทีเมื่อเครื่องนี้
// ย้ายไป/กู้คืน/ลบจริง (rememberTrashed · forgetTrashed — ลบครบ 30 วันกับลบถาวรผ่าน hardDeleteWorkOrder)
//
// รายชื่อนี้เป็นทางลัด ไม่ใช่คำตัดสิน (เช็ค 4 พ.ย. 69): อีกโปรเซสเปลี่ยนถังขยะได้โดยที่เครื่องนี้ไม่รู้ไปถึงนาที —
// deploy ตัวเก่ากับตัวใหม่ซ้อนกัน · Fly รันสองเครื่องตามค่าตั้งต้น · กู้ไฟล์สำรอง · SQL ตรง
// ถ้าเชื่อรายชื่ออย่างเดียว: กู้คืนที่เครื่อง A แล้วกด "เปิดใบงาน" ไปลงเครื่อง B = "อยู่ในถังขยะ" อีกนาที ·
// ย้ายไปถังที่เครื่อง A แล้วแก้ที่เครื่อง B ได้อีกนาที — trashedForRequest จึงถามแถวจริงเมื่อคำตอบของรายชื่ออาจผิดแล้วมีผล

const GATE_MAX_AGE_MS = 60_000;
let trashedIds: Set<number> | null = null;
let gateLoadedAt = 0;
let gateLoading: Promise<void> | null = null;
/**
 * สิ่งที่เครื่องนี้เพิ่งทำ — คำสั่งโหลดรายชื่อที่ยิงไปก่อนกดย้าย/กู้คืนอาจกลับมาทีหลังพร้อมรายชื่อเก่า
 * ถ้าแทนที่ทั้งชุดเฉย ๆ ใบที่เพิ่งย้ายไปถังขยะจะ "ไม่อยู่ในถัง" ไปอีกนาที (แก้ได้ทั้งที่ควรถูกปฏิเสธ)
 * จึงเล่นซ้ำสิ่งที่ทำหลังเริ่มโหลดทับลงไป · seq แทนเวลา — นาฬิกาเดินถอยหลังได้ ลำดับไม่ได้
 */
let gateSeq = 0;
let gateEdits: { seq: number; id: number; trashed: boolean }[] = [];

function reloadGate() {
  if (!gateLoading) {
    const startedSeq = gateSeq;
    gateLoading = prisma.workOrder
      .findMany({ where: IN_TRASH, select: { id: true } })
      .then((rows) => {
        const set = new Set(rows.map((r) => r.id));
        gateEdits = gateEdits.filter((e) => e.seq > startedSeq);
        for (const e of gateEdits) e.trashed ? set.add(e.id) : set.delete(e.id);
        trashedIds = set;
        gateLoadedAt = Date.now();
      })
      .finally(() => {
        gateLoading = null;
      });
  }
  return gateLoading;
}

function noteGate(id: number, trashed: boolean) {
  gateSeq += 1;
  gateEdits.push({ seq: gateSeq, id, trashed });
  if (trashed) trashedIds?.add(id);
  else trashedIds?.delete(id);
}

export async function isTrashed(id: number): Promise<boolean> {
  if (!trashedIds || Date.now() - gateLoadedAt > GATE_MAX_AGE_MS) await reloadGate();
  return trashedIds!.has(id);
}

/** คำขอที่ไม่แก้อะไร — เชื่อรายชื่อได้เมื่อรายชื่อบอกว่าไม่อยู่ในถัง (ดู trashedForRequest) */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * ใบนี้อยู่ในถังขยะไหม สำหรับคำขอนี้ — รายชื่อที่จำไว้ก่อน แล้วถามแถวจริงเมื่อคำตอบอาจผิดและผิดแล้วเสียหาย:
 * - คำขออ่านที่รายชื่อว่าอยู่ในถัง → ถามแถวจริงก่อนปฏิเสธ: ใบที่กู้คืนแล้ว (จากเครื่องอื่น/SQL) ต้องไม่ถูกปฏิเสธแม้วินาทีเดียว
 *   ใบในถังมีน้อยและไม่มีใครเปิด — รอบที่เพิ่มตกกับคำขอของใบพวกนี้เท่านั้น
 * - คำขอแก้ข้อมูล (ไม่ใช่ GET) → ถามแถวจริงทุกครั้ง ไม่ดูรายชื่อ: ใบที่เพิ่งถูกย้ายไปถังจากเครื่องอื่นต้องแก้ไม่ได้
 *   แลกกับหนึ่งรอบต่อปุ่มที่แก้ใบ (~0.23 วิบนเครื่องจริง) — แก้ใบในถังเงียบ ๆ แล้วกู้คืนมาเจอของที่ไม่มีใครเห็น แย่กว่าช้าลงนิดเดียว
 *   (ปุ่มเปลี่ยนขั้นอ่าน deletedAt ซ้ำใน guardStage/moveStage อยู่แล้ว แต่ปุ่มอื่นอีกหลายสิบเส้นทางไม่ได้อ่าน)
 * - คำขออ่านที่รายชื่อว่าไม่อยู่ในถัง → เชื่อรายชื่อ ไม่เสียรอบ: หน้าใบงาน (GET /:id) · ตัวเช็ครุ่นทุก 20 วินาที (/version) ·
 *   ไฟล์แนบ/หลักฐานเคลม (loadAttachableWorkOrder) อ่านแถวใบงานอยู่แล้วและเช็ค deletedAt ซ้ำเอง
 * แถวจริงต่างจากรายชื่อ → แก้รายชื่อด้วย (noteGate — ถ้ามีรอบโหลดค้างอยู่ ผลที่กลับมาทีหลังไม่ทับสิ่งที่เพิ่งรู้)
 * ไม่มีแถว (ลบจริงไปแล้ว) = ไม่อยู่ในถัง — ปล่อยให้เส้นทางตอบ "ไม่พบใบงานนี้" เอง
 */
export async function trashedForRequest(id: number, method: string): Promise<boolean> {
  if (READ_METHODS.has(method) && !(await isTrashed(id))) return false;
  const row = await prisma.workOrder.findUnique({ where: { id }, select: { deletedAt: true } });
  const now = !!row?.deletedAt;
  if ((trashedIds?.has(id) ?? false) !== now) noteGate(id, now);
  return now;
}
/** เรียกหลังย้ายไปถังขยะสำเร็จ — เครื่องนี้ปฏิเสธใบนี้ตั้งแต่คำขอถัดไป */
export const rememberTrashed = (id: number) => noteGate(id, true);
/** เรียกหลังกู้คืน/ลบจริง */
export const forgetTrashed = (id: number) => noteGate(id, false);

/**
 * router.param("id") ของ routes/workOrders.ts — ทุกเส้นทางที่มี :id (ดู แก้ แนบไฟล์ เคลม ลิงก์ไฟล์ ฯลฯ)
 * ผ่านตรงนี้ก่อน ใบในถังขยะได้ 404 พร้อม trashed: true · ไม่ต้องไล่ใส่เงื่อนไขทีละเส้นทาง (ราว 60 เส้นทาง)
 * ที่วันหนึ่งจะมีเส้นทางใหม่ที่ลืม
 *
 * เส้นทางของถังขยะเอง (กู้คืน · ลบถาวร) ใช้ชื่อพารามิเตอร์ :trashedId จึงไม่ผ่านตัวนี้
 * คำขอที่ไม่มีโทเคนที่ถูกต้องปล่อยผ่านให้ requireAuth ตอบ 401 — คนนอกต้องไม่รู้ว่าเลขไหนอยู่ในถังขยะ
 *
 * ทุกทางที่พังต้องจบที่ next(err) → ตัวจัดการ error ท้าย index.ts ตอบ 500 ภาษาไทย (ลองจริง 4 พ.ย. 69 ด้วยฐานข้อมูลที่บังคับให้พัง):
 * - ถามรายชื่อ/แถวจริงไม่ผ่าน → .catch(next) · 500
 * - พังระหว่างตอบ 404 (เช่นคำตอบถูกส่งไปแล้ว) → .catch(next) เหมือนกัน — รุ่นแรกเขียน .then(ตอบ, next) ซึ่ง next รับแค่
 *   คำถามที่พัง สิ่งที่โยนในตัวตอบกลายเป็น promise ที่ไม่มีใครจับ Node 22 ฆ่าโปรเซสทั้งตัว (exit 1) ทุกคนได้
 *   "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" จนเซิร์ฟเวอร์ตื่นใหม่ ไม่ใช่แค่คำขอนี้ค้าง
 * - ไม่พึ่ง express-async-errors: รุ่นที่ใช้ (3.1.1) แพตช์ router.param ด้วยก็จริง แต่ถ้าวันหนึ่งไฟล์เส้นทางถูก import
 *   ก่อนตัวแพตช์ หรือเปลี่ยนไลบรารี callback แบบ async ที่ไม่จับเองก็ฆ่าโปรเซสแบบเดียวกัน (ลองแล้ว: ไม่มีแพตช์ = exit 1)
 * ตัวนี้ไม่คืน promise — express-async-errors จึงไม่เรียก next ซ้ำอีกรอบ · เทสต์: tests/trash-guard-test.sh
 */
export function trashGuard(req: Request, res: Response, next: NextFunction, raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return next();
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  try {
    verifyToken(header.slice("Bearer ".length));
  } catch {
    return next();
  }
  trashedForRequest(id, req.method)
    .then((trashed) => {
      if (!trashed) return next();
      res.status(404).json({ error: TRASHED_TEXT, trashed: true });
    })
    .catch(next);
}

// ── ลบจริง ──────────────────────────────────────────────

export type HardDeleted = {
  code: string;
  removed: { parts: number; logs: number; attachments: number; workers: number };
  fileErrors: number;
};

/**
 * ลบใบในถังขยะจริง — ขั้นตอนเดิมของปุ่ม "ลบใบงานนี้ถาวร" ทุกอย่าง:
 * อ่าน objectKey ไว้ก่อน (แถวหายแล้วไม่เหลืออะไรชี้ไปหาไฟล์) · ลบแถว (ลูกลบตาม onDelete: Cascade) ·
 * แล้วค่อยลบไฟล์ — ลบไฟล์ก่อนแล้วฐานข้อมูลพังได้ใบที่ยังอยู่แต่รูปหายหมด ซึ่งแย่กว่าไฟล์ค้างในที่เก็บ ·
 * ไฟล์ที่ลบไม่ผ่านไม่ย้อนการลบใบ นับเป็น fileErrors · log บรรทัดเดิม [DELETE work-order] ให้ตามใน Render Logs ได้
 *
 * อ่านแค่ objectKey ไม่อ่านรูปย่อ (thumbnail) — ใบหนึ่งมีไฟล์ได้เป็นสิบ ไม่ดึงไบต์เข้าหน่วยความจำ (512 MB บน Render)
 * ลบด้วยเงื่อนไขเดียวกับตอนอ่าน (deleteMany) — ถ้ามีคนกดกู้คืนระหว่างนั้น จะไม่ลบใบที่เพิ่งกู้คืน (คืน null)
 */
export async function hardDeleteWorkOrder(
  id: number,
  by: { userId: number; why: "PERMANENT" } | { userId: null; why: "EXPIRED"; before: Date }
): Promise<HardDeleted | null> {
  const where: Prisma.WorkOrderWhereInput =
    by.why === "EXPIRED" ? { id, deletedAt: { lt: by.before } } : { id, ...IN_TRASH };
  const wo = await prisma.workOrder.findFirst({
    where,
    select: {
      code: true,
      deletedById: true,
      attachments: { select: { objectKey: true } },
      _count: { select: { parts: true, logs: true, attachments: true, workers: true } },
    },
  });
  if (!wo) return null;
  const gone = await prisma.workOrder.deleteMany({ where });
  if (gone.count === 0) return null;
  forgetTrashed(id);

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

  const who =
    by.why === "EXPIRED"
      ? `ระบบ (ครบ ${TRASH_KEEP_DAYS} วันในถังขยะ · ย้ายไปถังขยะโดย userId=${wo.deletedById ?? "-"})`
      : `userId=${by.userId} (ลบถาวรจากถังขยะ)`;
  console.warn(
    `[DELETE work-order] ${wo.code} โดย ${who} — ` +
      `อะไหล่ ${wo._count.parts} · ประวัติ ${wo._count.logs} · ไฟล์ ${wo._count.attachments}` +
      (fileErrors ? ` · ลบไฟล์ไม่สำเร็จ ${fileErrors}` : "")
  );
  return { code: wo.code, removed: wo._count, fileErrors };
}

// ── ลบใบที่ครบ 30 วัน ─────────────────────────────────────

/** ลบทีละไม่กี่ใบ — ใบละหลายคำสั่งกับไฟล์อีกหลายไฟล์ เปิดหน้าถังขยะต้องไม่ค้างเพราะของค้างลบเป็นร้อย */
export const PURGE_BATCH = 5;
let purging: Promise<number> | null = null;

/**
 * ลบใบที่อยู่ในถังขยะครบ 30 วันแล้ว ไม่เกิน max ใบ — ทำทีละใบต่อกัน (ไม่ยิงพร้อมกัน) และทำได้ทีละรอบ
 * (เรียกซ้ำระหว่างที่รอบเดิมยังไม่จบ = รอรอบเดิม ไม่เริ่มรอบใหม่ซ้อน) · คืนจำนวนที่ลบได้
 */
export function purgeExpired(max = PURGE_BATCH): Promise<number> {
  if (!purging) {
    purging = (async () => {
      const before = new Date(Date.now() - TRASH_KEEP_DAYS * DAY_MS);
      const due = await prisma.workOrder.findMany({
        where: { deletedAt: { lt: before } },
        select: { id: true },
        orderBy: { deletedAt: "asc" },
        take: max,
      });
      let n = 0;
      for (const { id } of due) if (await hardDeleteWorkOrder(id, { userId: null, why: "EXPIRED", before })) n += 1;
      return n;
    })().finally(() => {
      purging = null;
    });
  }
  return purging;
}

/**
 * ลบใบที่ครบ 30 วันเป็นช่วง ๆ — ทุกชั่วโมง (และครั้งแรก 5 นาทีหลังเซิร์ฟเวอร์ตื่น)
 *
 * ระบบนี้ไม่มีรอบงานประจำโดยตั้งใจ: สำรองข้อมูลอัตโนมัติเคยทำงานใหญ่ตอนเซิร์ฟเวอร์ตื่น เกิน 512 MB ของ Render
 * เซิร์ฟเวอร์ถูกฆ่า วนจนแอปใช้ไม่ได้ทั้งระบบ (README "สำรองข้อมูล") · ตัวนี้จึงเบาที่สุดที่ทำได้: ไม่เกิน PURGE_BATCH ใบต่อรอบ
 * ทำทีละใบ ไม่อ่านไฟล์เข้าหน่วยความจำ ไม่ทำทันทีตอนตื่น (รอให้ช่วงที่ทุกคนเปิดแอปพร้อมกันผ่านไปก่อน)
 * unref = ไม่รั้งให้โปรเซสอยู่ต่อ · Render หลับเมื่อไม่มีคนใช้ 15 นาที นาฬิกาจึงไม่ได้เดินตลอด —
 * หน้าถังขยะเรียก purgeExpired เองทุกครั้งที่เปิด ใบที่ครบกำหนดจึงไม่ค้างโชว์แม้รอบชั่วโมงไม่เคยได้ทำ
 * พังแล้วแค่เขียน log รอบหน้าลองใหม่ — ไม่ปล่อยให้ promise ที่พังไม่มีใครจับ (Node รุ่นใหม่ฆ่าโปรเซส)
 */
export function startTrashPurge() {
  const run = () =>
    void purgeExpired().catch((e) => {
      console.error("[trash purge] ลบใบที่ครบกำหนดไม่สำเร็จ — รอบหน้าลองใหม่", e);
    });
  setTimeout(run, 5 * 60_000).unref();
  setInterval(run, 60 * 60_000).unref();
}
