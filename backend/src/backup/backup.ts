/**
 * สำรองข้อมูลรายวัน (Super Admin — เจ้าของงานขอ ต.ค. 69)
 *
 * สองไฟล์ต่อรอบ:
 * - Excel — ชีตละตาราง ให้คนเปิดอ่าน/ค้นได้ทันที ไม่มีรหัสผ่านและรูป (คอลัมน์ไบต์ตัดทิ้ง)
 * - ไฟล์กู้คืน (.json.gz) — ทุกแถวทุกคอลัมน์ ให้ scripts/restore-backup.js เอากลับเข้าฐานข้อมูลเปล่าได้ครบ
 *   มีรหัสผ่านที่เข้ารหัสแล้ว (bcrypt) เพราะกู้คืนแล้วต้องล็อกอินได้ และรูปที่เก็บในฐานข้อมูล
 *
 * ทั้งสองไฟล์ไม่มี Fleet Card / Easy Pass (ตาราง VehicleCard) — เจ้าของงานเลือกไม่ใส่ เพราะไฟล์นี้คือข้อมูล
 * ทั้งบริษัท หลุดไปเลขบัตรที่ใช้จ่ายได้ก็หลุดตาม · กู้คืนจากไฟล์แล้วต้องกรอกบัตรใหม่ (นำเข้าไฟล์รถซ้ำได้)
 * ตาราง Backup เองก็ไม่ใส่ — ไฟล์สำรองไม่ต้องจำว่ามีไฟล์สำรองอะไรบ้าง
 *
 * ตัวไฟล์อยู่ในที่เก็บไฟล์ (ไม่เป็นสาธารณะ) โหลดผ่านลิงก์อายุ 2 ชั่วโมงแบบไฟล์อื่น · เก็บ 30 วันแล้วลบเอง
 */
import { gzipSync } from "zlib";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { deleteObject, isFileStoreConfigured, uploadObject } from "../storage/fileStore";
import { bangkokDay } from "../utils/constants";

export const BACKUP_FORMAT = "otteri-backup";
export const BACKUP_VERSION = 1;
export const BACKUP_KEEP_DAYS = 30;
/** รอบอัตโนมัติ 17:00 เวลาไทย */
export const BACKUP_HOUR = 17;

/** ตารางที่ไม่ใส่ในไฟล์สำรองเลย — ดูเหตุผลที่หัวไฟล์ */
const SKIP_MODELS = new Set(["VehicleCard", "Backup"]);
/** ช่องที่ไม่ใส่ใน Excel (ไฟล์กู้คืนยังมี) */
const EXCEL_SKIP_FIELDS = new Set(["passwordHash"]);

/** ชื่อชีตภาษาไทยของตารางที่คนเปิดดูบ่อย — ตารางอื่นใช้ชื่อตาราง */
const SHEET_TITLE: Record<string, string> = {
  WorkOrder: "ใบงาน",
  WorkOrderLog: "ประวัติใบงาน",
  WorkOrderPart: "อะไหล่ในใบงาน",
  WorkOrderWorker: "ผู้เข้าปฏิบัติงาน",
  WorkOrderAttachment: "ไฟล์แนบใบงาน",
  PartClaim: "ใบเคลมอะไหล่",
  Branch: "สาขา",
  Machine: "เครื่อง",
  Outage: "เคสเครื่องดับ",
  User: "ผู้ใช้",
  SparePart: "อะไหล่",
  Vehicle: "รถ",
  VehicleLog: "ประวัติใช้รถ",
  VehicleMaintenance: "ซ่อมบำรุงรถ",
  TeamDayPlan: "แผนงานทีม",
  ConsumableRequest: "คำขอเบิกของ",
  BranchCheckIn: "รายงานตัวเข้าสาขา",
  WorkLog: "บันทึกการทำงาน",
};

const models = () => Prisma.dmmf.datamodel.models.filter((m) => !SKIP_MODELS.has(m.name));
const delegate = (name: string) =>
  (prisma as unknown as Record<string, { findMany: (a?: object) => Promise<Record<string, unknown>[]> }>)[
    name[0].toLowerCase() + name.slice(1)
  ];

export type Tables = Record<string, Record<string, unknown>[]>;

/** อ่านทุกตาราง — เรียงตาม id ให้ไฟล์สองรอบเทียบกันได้ */
export async function readAllTables(): Promise<Tables> {
  const out: Tables = {};
  for (const m of models()) {
    const hasId = m.fields.some((f) => f.name === "id");
    out[m.name] = await delegate(m.name).findMany(hasId ? { orderBy: { id: "asc" } } : undefined);
  }
  return out;
}

/** ไฟล์กู้คืน — JSON บีบอัด · ไบต์เป็น base64 · วันเวลาเป็น ISO (JSON.stringify ทำให้เอง) */
export function buildDataFile(tables: Tables, migrations: string[]): Buffer {
  const json = JSON.stringify(
    { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), migrations, tables },
    (_k, v) =>
      v instanceof Uint8Array
        ? { $bytes: Buffer.from(v).toString("base64") }
        : v && typeof v === "object" && v.type === "Buffer" && Array.isArray(v.data)
          ? { $bytes: Buffer.from(v.data).toString("base64") }
          : v
  );
  return gzipSync(Buffer.from(json));
}

export async function buildExcel(tables: Tables): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  // ชีตแรกบอกว่าในไฟล์มีอะไร — คนเปิดไฟล์ครั้งแรกไม่ต้องไล่เปิดทีละชีต
  const index = wb.addWorksheet("อ่านก่อน");
  index.columns = [
    { header: "ชีต", key: "sheet", width: 26 },
    { header: "ตาราง", key: "table", width: 26 },
    { header: "จำนวนแถว", key: "rows", width: 12 },
  ];
  index.addRow({ sheet: `สำรองเมื่อ ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}` });
  index.addRow({ sheet: "ไม่มีรหัสผ่าน รูป/วิดีโอ และเลข Fleet Card / Easy Pass" });
  index.addRow({});

  const used = new Set<string>(["อ่านก่อน"]);
  for (const m of models()) {
    const rows = tables[m.name] ?? [];
    let name = (SHEET_TITLE[m.name] ?? m.name).slice(0, 31);
    while (used.has(name)) name = `${name.slice(0, 28)}_${used.size}`;
    used.add(name);
    index.addRow({ sheet: name, table: m.name, rows: rows.length });

    const cols = m.fields.filter((f) => f.kind !== "object" && f.type !== "Bytes" && !EXCEL_SKIP_FIELDS.has(f.name));
    const ws = wb.addWorksheet(name);
    ws.columns = cols.map((f) => ({ header: f.name, key: f.name, width: Math.min(Math.max(f.name.length + 2, 10), 40) }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const r of rows) {
      const row: Record<string, unknown> = {};
      for (const f of cols) {
        const v = r[f.name];
        // Json เป็นข้อความ — Excel ใส่ออบเจ็กต์ลงช่องไม่ได้
        row[f.name] = v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
      }
      ws.addRow(row);
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** ชื่อไฟล์ตามเวลาไทย เช่น OTTERI-backup-2026-10-16-1700 */
export function backupBaseName(at: Date): string {
  const t = new Date(at.getTime() + 7 * 3600_000).toISOString();
  return `OTTERI-backup-${t.slice(0, 10)}-${t.slice(11, 13)}${t.slice(14, 16)}`;
}

async function appliedMigrations(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`;
  return rows.map((r) => r.migration_name);
}

let running: Promise<unknown> | null = null;

/**
 * ทำไฟล์สำรองหนึ่งรอบ — อัปทั้งสองไฟล์ก่อนแล้วค่อยบันทึกรายการ (อัปไม่ผ่าน = ไม่มีแถวที่ชี้ไปไฟล์ที่ไม่มี)
 * กันรันซ้อน: รอบที่กำลังทำอยู่ให้คนที่กดตามมารอผลรอบเดียวกัน ไม่ใช่อ่านทั้งฐานข้อมูลซ้ำพร้อมกัน
 */
export async function runBackup(opts: { kind: "AUTO" | "MANUAL"; userId?: number; userName?: string; dayKey?: string }) {
  if (!isFileStoreConfigured()) throw new Error("ยังไม่ได้ตั้งค่าที่เก็บไฟล์ สำรองข้อมูลไม่ได้");
  if (running) await running.catch(() => undefined);
  const job = (async () => {
    const at = new Date();
    const tables = await readAllTables();
    const [excel, data] = [await buildExcel(tables), buildDataFile(tables, await appliedMigrations())];
    const base = backupBaseName(at);
    const excelKey = `backups/${base}-${at.getTime()}.xlsx`;
    const dataKey = `backups/${base}-${at.getTime()}.json.gz`;
    await uploadObject({ key: excelKey, body: excel, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await uploadObject({ key: dataKey, body: data, contentType: "application/gzip" });
    const row = await prisma.backup
      .create({
      data: {
        createdAt: at,
        kind: opts.kind,
        dayKey: opts.dayKey ?? null,
        byUserId: opts.userId ?? null,
        byName: opts.userName ?? null,
        excelKey,
        excelBytes: excel.length,
        dataKey,
        dataBytes: data.length,
        summary: {
          workOrders: tables.WorkOrder?.length ?? 0,
          branches: tables.Branch?.length ?? 0,
          users: tables.User?.length ?? 0,
        },
      },
    })
      .catch(async (e) => {
        // บันทึกรายการไม่ผ่าน (เช่น อีก instance ทำรอบวันนี้ไปแล้ว) — ไฟล์ที่เพิ่งอัปไม่มีใครชี้ถึง ลบทิ้ง
        for (const key of [excelKey, dataKey]) await deleteObject(key).catch(() => undefined);
        throw e;
      });
    await pruneOld();
    return row;
  })();
  running = job;
  try {
    return await job;
  } finally {
    if (running === job) running = null;
  }
}

/** ลบไฟล์ที่เก่ากว่า 30 วัน — ลบไฟล์ก่อนแถว ลบไฟล์ไม่ผ่านก็ยังลบแถว (ไฟล์กำพร้าเสียแค่พื้นที่) */
export async function pruneOld() {
  const cut = new Date(Date.now() - BACKUP_KEEP_DAYS * 86_400_000);
  const old = await prisma.backup.findMany({ where: { createdAt: { lt: cut } } });
  for (const b of old) {
    for (const key of [b.excelKey, b.dataKey]) await deleteObject(key).catch(() => undefined);
    await prisma.backup.delete({ where: { id: b.id } });
  }
}

/** ตอนนี้เลย 17:00 เวลาไทยของวันนี้แล้วหรือยัง */
export function pastBackupHour(now = new Date()): boolean {
  return new Date(now.getTime() + 7 * 3600_000).getUTCHours() >= BACKUP_HOUR;
}

/**
 * รอบอัตโนมัติของวันนี้ — ทำถ้าเลย 17:00 แล้วและวันนี้ยังไม่มี
 *
 * เซิร์ฟเวอร์ (Render ฟรี) หลับเมื่อไม่มีคนใช้ ตอน 17:00 อาจไม่มีใครปลุก จึงไม่ได้ตั้งนาฬิกาครั้งเดียว
 * แต่เช็คทุก 5 นาทีที่ตื่นอยู่ และตอนเพิ่งตื่น — ตื่นหลัง 17:00 เมื่อไหร่ก็ทำรอบของวันนั้นทันที
 * dayKey เป็น unique กันสอง instance ทำซ้ำวันเดียวกัน (ตัวที่ช้ากว่าบันทึกไม่ผ่าน แล้วลบไฟล์ของตัวเองทิ้ง)
 */
export async function ensureDailyBackup(now = new Date()) {
  if (!pastBackupHour(now) || !isFileStoreConfigured()) return null;
  const dayKey = bangkokDay(now);
  if (await prisma.backup.findUnique({ where: { dayKey } })) return null;
  try {
    return await runBackup({ kind: "AUTO", dayKey });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }
}

export function startBackupSchedule() {
  const tick = () =>
    ensureDailyBackup().catch((e) => console.error("[backup] รอบอัตโนมัติไม่สำเร็จ", e));
  setTimeout(tick, 15_000);
  setInterval(tick, 5 * 60_000).unref();
}
