/**
 * ประวัติการนำเข้า — ตัวเขียน (เจ้าของงานอนุมัติตัวอย่าง 5 พ.ย. 69 · หน้าอ่านอยู่ที่ routes/importHistory.ts)
 *
 * กติกาที่ตกลงไว้:
 * - ใบแจ้งซ่อมเก็บผลทุกแถว · ชนิดอื่นเก็บยอดสรุปกับแถวที่เปลี่ยนหรือมีปัญหา
 * - ไม่เก็บตัวไฟล์ และไม่เก็บชื่อ/เบอร์ผู้ติดต่อจากฟอร์มแจ้งซ่อม (อยู่ในใบงานแล้ว) · ไม่เก็บรหัสผ่าน · ไม่เก็บเลขบัตรเติมน้ำมัน
 *   — ตารางนี้ตามไปกับไฟล์สำรองทั้งบริษัท ของที่ไม่ควรอยู่ในไฟล์สำรองก็ไม่ควรอยู่ที่นี่
 * - รอบที่หยุดกลางทาง/ไม่สำเร็จก็บันทึก พร้อมข้อความภาษาไทยที่ผู้ใช้เห็น
 *
 * **บันทึกประวัติพังต้องไม่ทำให้การนำเข้าพัง** — ทุกฟังก์ชันที่นี่จับ error เอง เขียน log แล้วคืนค่าว่าง
 * การนำเข้าตอบเหมือนเดิมทุกตัวอักษร (ประวัติหายหนึ่งรอบแย่น้อยกว่าแอดมินเห็น "นำเข้าไม่สำเร็จ" ทั้งที่ข้อมูลเข้าไปแล้ว)
 *
 * **คุยกับฐานข้อมูลให้น้อยรอบ** — ฐานข้อมูลจริงอยู่คนละ region (~0.23 วิต่อรอบ) · รอบหนึ่ง (พร้อมทุกแถว) เขียนด้วยคำสั่งเดียว
 * (INSERT … RETURNING ต่อด้วย INSERT … SELECT unnest ใน WITH เดียวกัน) · ใบแจ้งซ่อมที่ยืนยันทีละชุด: ชุดละ 2 รอบ
 * (เปิด/ต่อรอบ + ปิดชุด) ชุดแรกเพิ่มอีก 1 รอบตอนเขียนทุกแถว
 *
 * เวลาเขียนเป็นข้อความ ISO แล้ว ::timestamp ฝั่ง SQL (แบบ branchImport) — ไม่ใช้ now() ของฐานข้อมูล
 * เพราะคอลัมน์ไม่มี timezone ค่าที่ได้จาก now() ขึ้นกับ TimeZone ของ session ซึ่งเครื่องทดสอบกับของจริงอาจไม่ตรงกัน
 */
import { prisma } from "../prisma";

/** ชนิดของรอบ — หน้าประวัติจัดกลุ่มเป็นชิป (สาขา = ทะเบียน + ที่ยกเลิก · รายชื่อผู้ใช้ = รายชื่อช่าง + Area Team) */
export type ImportKind = "REPAIR_FORM" | "MACHINE" | "BRANCH" | "BRANCH_CANCELLED" | "VEHICLE" | "USER_ROSTER" | "USER_AREA";

/**
 * รอบที่ยังเป็น RUNNING แต่ไม่มีชุดใหม่มาเกินเท่านี้ = แอปหายไปกลางทาง (ปิดเบราว์เซอร์ · เน็ตหลุด · เซิร์ฟเวอร์รีสตาร์ท)
 * คำขอหนึ่งชุดยาวสุดราว 100 วิ (Render ตัด) แล้วแอปส่งชุดถัดไปทันที — 5 นาทีที่เงียบจึงไม่ใช่รอบที่ยังเดินอยู่แน่ ๆ
 * ตัดสินตอนอ่าน ไม่มีงานเบื้องหลังมาแก้ค่า (เซิร์ฟเวอร์ Render หลับได้ งานตั้งเวลาไม่น่าเชื่อถือ)
 */
export const RUN_IDLE_MS = 5 * 60_000;

/**
 * แถวที่เก็บได้สูงสุดต่อรอบ — ใบแจ้งซ่อมเก็บทุกแถว (ไฟล์จริงสองสามร้อยแถว · เพดานไฟล์ 10 MB) ชนิดอื่นเก็บเฉพาะที่เปลี่ยน/มีปัญหา
 * ทะเบียนสาขารอบแรกเปลี่ยนได้ทั้งพันกว่าสาขา — ยอดในสรุปยังครบเสมอ ที่ตัดคือรายการแถว (หน้าประวัติบอกว่าตัด)
 */
const ROW_CAP: Record<ImportKind, number> = {
  REPAIR_FORM: 5000,
  MACHINE: 0,
  BRANCH: 2000,
  BRANCH_CANCELLED: 2000,
  VEHICLE: 2000,
  USER_ROSTER: 2000,
  USER_AREA: 2000,
};

/** multer อ่านชื่อไฟล์เป็น latin1 — ชื่อไฟล์ภาษาไทยต้องแปลงกลับ (แบบ userImport / spareParts) */
export function uploadName(file: { originalname: string }): string {
  return Buffer.from(file.originalname, "latin1").toString("utf8");
}

/**
 * ชื่อไฟล์ที่ถูกเก็บแบบ latin1 ไปแล้ว (รายงานเครื่องรุ่นก่อนเก็บ originalname ตรง ๆ — ชื่อไทยกลายเป็น "à¸£à¸²à¸¢...")
 * แปลงตอนแสดง ไม่แก้แถวเดิม · ชื่อที่ถอดแล้วมีตัวเสีย (�) แปลว่าไม่ได้เพี้ยนแบบนั้น ใช้ค่าเดิม
 */
export function readableName(s: string | null | undefined): string {
  if (!s) return "";
  if (!/^[\x00-\xff]*$/.test(s) || !/[\xc0-\xff]/.test(s)) return s;
  const back = Buffer.from(s, "latin1").toString("utf8");
  return back.includes("�") ? s : back;
}

export interface HistoryRow {
  line?: number | null;
  result: string;
  code?: string | null;
  name?: string | null;
  machine?: string | null;
  detail?: string | null;
  note?: string | null;
  ref?: string | null;
}

const iso = (d: Date = new Date()) => d.toISOString();
const cut = (s: unknown, n: number) => (s === null || s === undefined ? "" : String(s).slice(0, n));

/** ทุกคอลัมน์ส่งเป็น text[] (CLAUDE.md: array ที่เป็น null ทั้งก้อนถูกเดาชนิดเป็น integer[]) — ค่าว่างกลับเป็น NULL ฝั่ง SQL */
function columns(rows: HistoryRow[]) {
  return {
    line: rows.map((r) => (r.line === null || r.line === undefined ? "" : String(r.line))),
    result: rows.map((r) => cut(r.result, 40)),
    code: rows.map((r) => cut(r.code, 120)),
    name: rows.map((r) => cut(r.name, 300)),
    machine: rows.map((r) => cut(r.machine, 120)),
    detail: rows.map((r) => cut(r.detail, 600)),
    note: rows.map((r) => cut(r.note, 600)),
    ref: rows.map((r) => cut(r.ref, 40)),
  };
}

/**
 * บันทึกรอบที่จบในคำขอเดียว (สาขา · รถ · รายชื่อ · รายงานเครื่องที่ล้ม) — คำสั่งเดียวทั้งรอบและทุกแถว
 * คืน id ของรอบ (หน้าจอเปิดรอบนั้นในประวัติได้ตรง ๆ) · null = บันทึกไม่ได้ (เขียน log แล้ว การนำเข้าไม่สะดุด)
 */
export async function recordImport(input: {
  kind: ImportKind;
  userId: number;
  fileName: string;
  status: "DONE" | "FAILED" | "STOPPED";
  rowsInFile: number;
  summary: Record<string, number | string | boolean | null>;
  rows?: HistoryRow[];
  error?: string | null;
  startedAt?: Date;
}): Promise<number | null> {
  try {
    const all = input.rows ?? [];
    const rows = all.slice(0, ROW_CAP[input.kind]);
    // ตัดแถวเพราะเกินเพดาน — บอกจำนวนจริงไว้ในสรุป หน้าประวัติจะได้ไม่บอกว่า "ครบทุกแถว"
    const summary = rows.length < all.length ? { ...input.summary, rowsKept: rows.length, rowsChanged: all.length } : input.summary;
    const c = columns(rows);
    const now = iso();
    const got = await prisma.$queryRaw<{ id: number }[]>`
      WITH r AS (
        INSERT INTO "ImportRun" ("kind", "fileName", "byUserId", "byName", "status", "startedAt", "lastAt", "finishedAt", "rowsInFile", "summary", "error")
        VALUES (${input.kind}, ${cut(input.fileName, 300)}, ${input.userId}, (SELECT "name" FROM "User" WHERE "id" = ${input.userId}),
                ${input.status}, ${iso(input.startedAt)}::timestamp, ${now}::timestamp, ${now}::timestamp, ${input.rowsInFile},
                ${JSON.stringify(summary)}::jsonb, ${input.error ?? null})
        RETURNING "id"
      ), w AS (
        INSERT INTO "ImportRunRow" ("runId", "line", "result", "code", "name", "machine", "detail", "note", "ref")
        SELECT r."id", NULLIF(t.line, '')::int, t.result, NULLIF(t.code, ''), NULLIF(t.name, ''), NULLIF(t.machine, ''),
               NULLIF(t.detail, ''), NULLIF(t.note, ''), NULLIF(t.ref, '')
        FROM r, unnest(${c.line}::text[], ${c.result}::text[], ${c.code}::text[], ${c.name}::text[], ${c.machine}::text[],
                       ${c.detail}::text[], ${c.note}::text[], ${c.ref}::text[]) AS t(line, result, code, name, machine, detail, note, ref)
      )
      SELECT "id" FROM r`;
    return got[0]?.id ?? null;
  } catch (e) {
    console.error(`[import-history] บันทึกประวัติ ${input.kind} (${input.fileName}) ไม่สำเร็จ — การนำเข้ายังเป็นไปตามเดิม`, e);
    return null;
  }
}

/**
 * รหัสรอบของใบแจ้งซ่อม — แอปส่งรหัสเดียวกันมากับทุกชุดของการกดยืนยันครั้งเดียว
 * ใส่เลขผู้ใช้นำหน้าฝั่งเซิร์ฟเวอร์: รหัสมาจากแอป สองคนส่งรหัสซ้ำกันต้องไม่ไปต่อท้ายรอบของอีกคน
 */
export function repairRunKey(userId: number, clientKey: unknown): string | null {
  const k = typeof clientKey === "string" ? clientKey.trim() : "";
  return /^[A-Za-z0-9_-]{6,64}$/.test(k) ? `${userId}:${k}` : null;
}

/**
 * แอปรุ่นก่อน (หน้าเว็บที่เปิดค้างตอน deploy) ส่งทีละชุดแต่ไม่มีรหัสรอบ — ชุดของไฟล์เดียวกัน (sha256 เดียวกัน) จากคนเดียวกัน
 * ที่ต่อกันภายในเวลาที่รอบยังไม่เงียบ = รอบเดียวกัน ไม่งั้นไฟล์ 200 แถวกลายเป็น 20 รอบในประวัติ
 * ไม่มีรอบให้ต่อ = รอบใหม่ (รอบก่อนจบแล้ว/เงียบไปแล้ว — นำเข้าไฟล์เดิมซ้ำวันหลังคือรอบใหม่)
 * ส่งทั้งไฟล์ในคำขอเดียว (แอปรุ่นแรก) = รอบละคำขอเสมอ
 */
export async function legacyRepairRunKey(userId: number, fileHash: string, batched: boolean): Promise<string> {
  const fresh = `${userId}:old-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  if (!batched) return fresh;
  try {
    const recent = await prisma.importRun.findFirst({
      where: {
        kind: "REPAIR_FORM",
        byUserId: userId,
        fileHash,
        status: "RUNNING",
        runKey: { startsWith: `${userId}:old-` },
        lastAt: { gt: new Date(Date.now() - RUN_IDLE_MS) },
      },
      orderBy: { id: "desc" },
      select: { runKey: true },
    });
    return recent?.runKey ?? fresh;
  } catch (e) {
    console.error("[import-history] หารอบของแอปรุ่นก่อนไม่ได้ — เริ่มรอบใหม่", e);
    return fresh;
  }
}

/**
 * เปิดรอบ (ชุดแรก) หรือต่อรอบเดิม (ชุดถัดไป) — คำสั่งเดียว: ON CONFLICT บนรหัสรอบ · xmax = 0 แปลว่าแถวเพิ่งถูกสร้าง
 * ชุดแรกเขียนทุกแถวของไฟล์ตามแผนตอนนั้น: แถวที่จะเปิดใบใหม่เป็น PENDING ("ยังไม่ได้เปิด") จนกว่าชุดของมันจะเปิดจริง
 * — แอปหายกลางทาง แถวที่ยังไม่ถึงคิวจึงยังบอกได้ว่าเหลืออะไร
 */
export async function openRepairRun(input: {
  runKey: string;
  userId: number;
  fileName: string;
  fileHash: string;
  rowsInFile: number;
  rows: HistoryRow[];
}): Promise<{ id: number; fresh: boolean } | null> {
  try {
    const now = iso();
    const [run] = await prisma.$queryRaw<{ id: number; fresh: boolean }[]>`
      INSERT INTO "ImportRun" ("kind", "runKey", "fileName", "fileHash", "byUserId", "byName", "status", "startedAt", "lastAt", "rowsInFile", "summary")
      VALUES ('REPAIR_FORM', ${input.runKey}, ${cut(input.fileName, 300)}, ${input.fileHash}, ${input.userId},
              (SELECT "name" FROM "User" WHERE "id" = ${input.userId}), 'RUNNING', ${now}::timestamp, ${now}::timestamp, ${input.rowsInFile},
              ${JSON.stringify({ planned: input.rows.filter((r) => r.result === "PENDING").length })}::jsonb)
      ON CONFLICT ("runKey") DO UPDATE SET "lastAt" = EXCLUDED."lastAt"
      RETURNING "id", (xmax = 0) AS "fresh"`;
    if (!run) return null;
    if (run.fresh) {
      const c = columns(input.rows.slice(0, ROW_CAP.REPAIR_FORM));
      await prisma.$executeRaw`
        INSERT INTO "ImportRunRow" ("runId", "line", "result", "code", "name", "machine", "detail", "note", "ref")
        SELECT ${run.id}, NULLIF(t.line, '')::int, t.result, NULLIF(t.code, ''), NULLIF(t.name, ''), NULLIF(t.machine, ''),
               NULLIF(t.detail, ''), NULLIF(t.note, ''), NULLIF(t.ref, '')
        FROM unnest(${c.line}::text[], ${c.result}::text[], ${c.code}::text[], ${c.name}::text[], ${c.machine}::text[],
                    ${c.detail}::text[], ${c.note}::text[], ${c.ref}::text[]) AS t(line, result, code, name, machine, detail, note, ref)`;
    }
    return { id: run.id, fresh: run.fresh };
  } catch (e) {
    console.error(`[import-history] เปิดรอบนำเข้าใบแจ้งซ่อม (${input.fileName}) ไม่สำเร็จ — การนำเข้ายังเป็นไปตามเดิม`, e);
    return null;
  }
}

/** สิ่งที่ชุดนี้ทำกับแถวหนึ่ง — pendingOnly = แก้เฉพาะถ้าแถวยังรอเปิดอยู่ (แถวที่ถูกนำเข้าไประหว่างนี้ ไม่ทับผลของชุดอื่น) */
export interface RowChange {
  line: number;
  result?: string;
  ref?: string | null;
  note?: string | null;
  pendingOnly?: boolean;
}

/**
 * ปิดชุด: แก้แถวที่ชุดนี้ทำ แล้วตั้งสถานะรอบ — คำสั่งเดียว
 * ไม่เหลือแถว PENDING = รอบจบ (DONE) · ยังเหลือ = ยังเดินอยู่ (RUNNING) หรือสถานะที่ส่งมา (FAILED / STOPPED พร้อมข้อความ)
 * แถวที่เพิ่งแก้ใน WITH เดียวกันมองไม่เห็นจากคำสั่งหลัก (snapshot เดียวกัน) จึงนับแถวที่ยังรอจาก "รอเดิม ลบที่ชุดนี้เพิ่งเปิด"
 */
export async function closeRepairBatch(
  runId: number,
  changes: RowChange[],
  outcome: { status: "RUNNING" | "FAILED" | "STOPPED"; error?: string | null }
): Promise<void> {
  try {
    const now = iso();
    const line = changes.map((c) => String(c.line));
    const result = changes.map((c) => c.result ?? "");
    const ref = changes.map((c) => cut(c.ref, 40));
    const note = changes.map((c) => cut(c.note, 600));
    const guard = changes.map((c) => (c.pendingOnly ? "P" : ""));
    await prisma.$executeRaw`
      WITH d AS (
        SELECT t.line::int AS line, t.result, NULLIF(t.ref, '') AS ref, NULLIF(t.note, '') AS note, t.guard
        FROM unnest(${line}::text[], ${result}::text[], ${ref}::text[], ${note}::text[], ${guard}::text[]) AS t(line, result, ref, note, guard)
      ), upd AS (
        UPDATE "ImportRunRow" r
        SET "result" = COALESCE(NULLIF(d.result, ''), r."result"), "ref" = COALESCE(d.ref, r."ref"), "note" = COALESCE(d.note, r."note")
        FROM d
        WHERE r."runId" = ${runId} AND r."line" = d.line AND (d.guard = '' OR r."result" = 'PENDING')
        RETURNING r."id", r."result"
      ), still AS (
        SELECT count(*)::int AS n FROM "ImportRunRow" x
        WHERE x."runId" = ${runId} AND x."result" = 'PENDING'
          AND x."id" NOT IN (SELECT u."id" FROM upd u WHERE u."result" <> 'PENDING')
      )
      UPDATE "ImportRun" SET
        "lastAt" = ${now}::timestamp,
        -- แอปบอกหยุดแล้ว (เน็ตหลุด) ขณะที่ชุดสุดท้ายยังทำอยู่บนเซิร์ฟเวอร์ — ชุดนั้นจบทีหลังต้องไม่พารอบกลับเป็น "กำลังนำเข้า"
        "status" = CASE WHEN (SELECT n FROM still) = 0 THEN 'DONE'
                        WHEN "status" IN ('STOPPED', 'FAILED') AND ${outcome.status} = 'RUNNING' THEN "status"
                        ELSE ${outcome.status} END,
        "finishedAt" = CASE WHEN (SELECT n FROM still) = 0 OR ${outcome.status} <> 'RUNNING' THEN ${now}::timestamp ELSE "finishedAt" END,
        "error" = COALESCE(${outcome.error ?? null}, "error")
      WHERE "id" = ${runId}`;
  } catch (e) {
    console.error(`[import-history] ปิดชุดของรอบ ${runId} ไม่สำเร็จ — การนำเข้ายังเป็นไปตามเดิม`, e);
  }
}

/** เหตุผลที่แอปหยุดเอง → ข้อความที่หน้าประวัติแสดง (แอปส่งเป็นรหัส ข้อความอยู่ที่เดียว) */
export const STOP_REASONS: Record<string, string> = {
  user: "กดหยุดเองระหว่างนำเข้า",
  network: "ชุดล่าสุดไม่ได้คำตอบจากเซิร์ฟเวอร์ (เน็ตหลุด/เซิร์ฟเวอร์ไม่ตอบ) — แอปหยุดส่งชุดที่เหลือ",
  stalled: "เซิร์ฟเวอร์ช้าเกินกว่าจะเปิดต่อได้ — แอปหยุดส่งชุดที่เหลือ",
  error: "แอปหยุดนำเข้าเพราะได้ข้อผิดพลาดจากเซิร์ฟเวอร์",
};

/** แอปบอกว่าหยุดแล้ว — รอบไม่ต้องรอ 5 นาทีถึงจะขึ้นว่าหยุดกลางทาง · แก้ได้เฉพาะรอบของตัวเองที่ยังเดินอยู่ */
export async function stopRepairRun(userId: number, clientKey: unknown, reason: unknown): Promise<boolean> {
  const runKey = repairRunKey(userId, clientKey);
  if (!runKey) return false;
  const text = STOP_REASONS[String(reason)] ?? STOP_REASONS.user;
  const now = new Date();
  const res = await prisma.importRun.updateMany({
    where: { runKey, byUserId: userId, status: "RUNNING" },
    data: { status: "STOPPED", error: text, lastAt: now, finishedAt: now },
  });
  return res.count > 0;
}

/**
 * ยืนยันล้มก่อนเปิด/ต่อรอบได้ (ฐานข้อมูลหลุดตอนวางแผน) — รอบที่แอปเริ่มไว้แล้ว (ชุดก่อน ๆ) ปิดเป็นไม่สำเร็จพร้อมข้อความ
 * ยังไม่มีรอบ (ชุดแรกล้ม) = บันทึกรอบใหม่ที่ไม่มีแถว ให้แอดมินคนอื่นเห็นว่ารอบนี้ไม่มีใบไหนเข้า
 */
export async function failRepairRun(userId: number, clientKey: unknown, fileName: string, error: string): Promise<number | null> {
  try {
    const runKey = repairRunKey(userId, clientKey);
    if (runKey) {
      const now = new Date();
      const hit = await prisma.importRun.findUnique({ where: { runKey }, select: { id: true } });
      if (hit) {
        await prisma.importRun.update({ where: { id: hit.id }, data: { status: "FAILED", error, lastAt: now, finishedAt: now } });
        return hit.id;
      }
    }
  } catch (e) {
    console.error("[import-history] ปิดรอบที่ล้มไม่สำเร็จ", e);
    return null;
  }
  return recordImport({ kind: "REPAIR_FORM", userId, fileName, status: "FAILED", rowsInFile: 0, summary: {}, error });
}
