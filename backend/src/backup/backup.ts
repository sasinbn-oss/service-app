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
 *
 * **ไม่มีรอบอัตโนมัติแล้ว — กด "สำรองตอนนี้" เองเท่านั้น** (เจ้าของงานสั่งเอาออก 15 ต.ค. 69)
 * รอบ 17:00 เดิมทำเองตอนเซิร์ฟเวอร์ตื่น อ่านทั้งฐานข้อมูลเข้าหน่วยความจำ (3.6 GB ในการทดสอบ เกิน 512 MB
 * ของ Render) เซิร์ฟเวอร์ถูกฆ่า ตื่นมา 15 วิสำรองใหม่ วนจนแอปใช้ไม่ได้ทั้งระบบ ·
 * ตอนนี้เขียนไฟล์ทีละส่วน (~200 MB) แต่ก็ยังไม่ให้ทำเองโดยไม่มีคนสั่ง — ถ้าพลาด คนกดเห็นทันที ไม่ใช่ระบบล่มเงียบ ๆ
 */
import fs from "fs";
import os from "os";
import path from "path";
import { createGzip } from "zlib";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { deleteObject, isFileStoreConfigured, uploadObject } from "../storage/fileStore";

const EXCEL_CELL_MAX = 32000;

export const BACKUP_FORMAT = "otteri-backup";
export const BACKUP_VERSION = 1;
export const BACKUP_KEEP_DAYS = 30;

/**
 * ตารางที่ไม่ใส่ในไฟล์สำรองเลย — ดูเหตุผลที่หัวไฟล์
 * UsageSlot (ช่วงเวลาใช้แอป) โตถึงราวล้านแถวใน 90 วัน ไฟล์สำรองทำในหน่วยความจำ (512 MB บน Render)
 * และหายไปก็ไม่เสียงาน — แค่กราฟการใช้งานย้อนหลังว่าง
 */
const SKIP_MODELS = new Set(["VehicleCard", "Backup", "UsageSlot"]);
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
  AdminReview: "คำขอให้แอดมินตรวจ",
  Branch: "สาขา",
  CocoMaidBranch: "สาขาที่ Maid ประจำ",
  Machine: "เครื่อง",
  Outage: "เคสเครื่องดับ",
  User: "ผู้ใช้",
  SparePart: "อะไหล่",
  SparePartImport: "ประวัติอัปเดตอะไหล่",
  Vehicle: "รถ",
  VehicleLog: "ประวัติใช้รถ",
  VehicleMaintenance: "ซ่อมบำรุงรถ",
  TeamDayPlan: "แผนงานทีม",
  ConsumableRequest: "คำขอเบิกของ",
  BranchCheckIn: "รายงานตัวเข้าสาขา",
  WorkLog: "บันทึกการทำงาน",
  AppSetting: "ตั้งค่าระบบ",
  PartsPick: "อะไหล่ที่ช่างเลือก",
  PartsPickItem: "รายการอะไหล่ที่ช่างเลือก",
  SparePartBrandFile: "อะไหล่อยู่ในไฟล์ยี่ห้อ",
};

const models = () => Prisma.dmmf.datamodel.models.filter((m) => !SKIP_MODELS.has(m.name));
const delegate = (name: string) =>
  (prisma as unknown as Record<string, { findMany: (a?: object) => Promise<Record<string, unknown>[]> }>)[
    name[0].toLowerCase() + name.slice(1)
  ];

export type Tables = Record<string, Record<string, unknown>[]>;

/** ตารางที่มีรูปเก็บในฐานข้อมูล — อ่านทีละน้อย ไม่งั้นรูปทั้งตารางกองอยู่ในหน่วยความจำพร้อมกัน */
const hasBytes = (m: Prisma.DMMF.Model) => m.fields.some((f) => f.type === "Bytes");

/**
 * อ่านตารางทีละชุด เรียงตาม id ให้ไฟล์สองรอบเทียบกันได้
 *
 * เดิมอ่านทุกตารางทั้งก้อนแล้วค่อยเขียนไฟล์ — ฐานข้อมูลจริง (ประวัติใบงาน รูปรถ รูปอะไหล่) ใหญ่เกิน
 * หน่วยความจำของ Render (512 MB) เซิร์ฟเวอร์ถูกฆ่ากลางทาง ตื่นมาแล้วสำรองซ้ำ วนจนแอปใช้ไม่ได้ (ต.ค. 69)
 */
async function forEachBatch(m: Prisma.DMMF.Model, cb: (rows: Record<string, unknown>[]) => Promise<void>) {
  const d = delegate(m.name);
  // คีย์หลักของตาราง — ไม่ใช่ชื่อ id เสมอไป (รูปอะไหล่ใช้ sparePartId) ตารางรูปที่ไม่มีคอลัมน์ id
  // เคยถูกอ่านทั้งตารางในครั้งเดียว ซึ่งก็คือรูปทั้งหมดพร้อมกัน
  const key = m.fields.find((f) => f.isId)?.name;
  if (!key) {
    // ไม่มีคีย์เดี่ยว (ตารางเล็ก ไม่มีรูป) — แบ่งหน้าด้วย skip เรียงตามคอลัมน์ที่ไม่ใช่ความสัมพันธ์
    const order = m.fields.filter((f) => f.kind === "scalar" && f.type !== "Bytes").map((f) => ({ [f.name]: "asc" }));
    for (let skip = 0; ; skip += 1000) {
      const rows = await d.findMany({ take: 1000, skip, orderBy: order });
      if (rows.length) await cb(rows);
      if (rows.length < 1000) return;
    }
  }
  const take = hasBytes(m) ? 20 : 1000;
  let after: unknown = undefined;
  for (;;) {
    const rows = await d.findMany({
      take,
      orderBy: { [key]: "asc" },
      ...(after === undefined ? {} : { where: { [key]: { gt: after } } }),
    });
    if (!rows.length) return;
    await cb(rows);
    if (rows.length < take) return;
    after = rows[rows.length - 1][key];
  }
}

/** ไบต์เป็น base64 · วันเวลาเป็น ISO (JSON.stringify ทำให้เอง) */
const bytesReplacer = (_k: string, v: unknown) =>
  v instanceof Uint8Array
    ? { $bytes: Buffer.from(v).toString("base64") }
    : v && typeof v === "object" && (v as { type?: string }).type === "Buffer" && Array.isArray((v as { data?: unknown }).data)
      ? { $bytes: Buffer.from((v as { data: number[] }).data).toString("base64") }
      : v;

/** เขียนลง stream โดยรอเมื่อ buffer เต็ม — ไม่งั้นข้อความกองอยู่ในหน่วยความจำเหมือนเดิม */
function writeTo(stream: NodeJS.WritableStream, chunk: string): Promise<void> {
  return stream.write(chunk) ? Promise.resolve() : new Promise((r) => stream.once("drain", () => r()));
}

/**
 * เขียนไฟล์สำรองทั้งสองไฟล์ลงดิสก์ชั่วคราว อ่านฐานข้อมูลรอบเดียว — แต่ละชุดเขียนลงทั้งสองไฟล์แล้วทิ้ง
 *
 * ไฟล์กู้คืนรูปแบบเดิมทุกตัวอักษร ({ format, version, createdAt, migrations, tables }) —
 * scripts/restore-backup.js อ่านไฟล์เก่าและใหม่ได้เหมือนกัน
 */
export async function writeBackupFiles(dir: string, migrations: string[]) {
  const excelPath = path.join(dir, "backup.xlsx");
  const dataPath = path.join(dir, "backup.json.gz");
  const counts: Record<string, number> = {};
  for (const m of models()) counts[m.name] = await (prisma as unknown as Record<string, { count: () => Promise<number> }>)[m.name[0].toLowerCase() + m.name.slice(1)].count();

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: excelPath, useStyles: true });
  wb.created = new Date();
  // ชีตแรกบอกว่าในไฟล์มีอะไร — คนเปิดไฟล์ครั้งแรกไม่ต้องไล่เปิดทีละชีต
  const index = wb.addWorksheet("อ่านก่อน");
  index.columns = [
    { header: "ชีต", key: "sheet", width: 26 },
    { header: "ตาราง", key: "table", width: 26 },
    { header: "จำนวนแถว", key: "rows", width: 12 },
  ];
  index.addRow({ sheet: `สำรองเมื่อ ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}` }).commit();
  index.addRow({ sheet: "ไม่มีรหัสผ่าน รูป/วิดีโอ และเลข Fleet Card / Easy Pass" }).commit();
  index.addRow({}).commit();
  const used = new Set<string>(["อ่านก่อน"]);
  const sheetName = new Map<string, string>();
  for (const m of models()) {
    let name = (SHEET_TITLE[m.name] ?? m.name).slice(0, 31);
    while (used.has(name)) name = `${name.slice(0, 28)}_${used.size}`;
    used.add(name);
    sheetName.set(m.name, name);
    index.addRow({ sheet: name, table: m.name, rows: counts[m.name] }).commit();
  }
  index.commit();

  const gz = createGzip();
  const out = fs.createWriteStream(dataPath);
  gz.pipe(out);
  const done = new Promise<void>((resolve, reject) => {
    out.on("finish", () => resolve());
    out.on("error", reject);
    gz.on("error", reject);
  });
  await writeTo(
    gz,
    `{"format":${JSON.stringify(BACKUP_FORMAT)},"version":${BACKUP_VERSION},"createdAt":${JSON.stringify(new Date().toISOString())},"migrations":${JSON.stringify(migrations)},"tables":{`
  );

  let firstTable = true;
  for (const m of models()) {
    const cols = m.fields.filter((f) => f.kind !== "object" && f.type !== "Bytes" && !EXCEL_SKIP_FIELDS.has(f.name));
    // ตัวเขียนแบบ stream ตั้งหัวตารางค้างไว้ได้ตอนสร้างชีตเท่านั้น
    const ws = wb.addWorksheet(sheetName.get(m.name)!, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map((f) => ({ header: f.name, key: f.name, width: Math.min(Math.max(f.name.length + 2, 10), 40) }));
    ws.getRow(1).font = { bold: true };

    await writeTo(gz, `${firstTable ? "" : ","}${JSON.stringify(m.name)}:[`);
    firstTable = false;
    let firstRow = true;
    await forEachBatch(m, async (rows) => {
      for (const r of rows) {
        await writeTo(gz, (firstRow ? "" : ",") + JSON.stringify(r, bytesReplacer));
        firstRow = false;
        const row: Record<string, unknown> = {};
        for (const f of cols) {
          const v = r[f.name];
          // Json เป็นข้อความ — Excel ใส่ออบเจ็กต์ลงช่องไม่ได้
          const cell = v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
          // ช่องละไม่เกิน 32,767 ตัวอักษร — เกินแล้ว Excel ขึ้น "พบปัญหา ต้องซ่อมไฟล์" ทั้งไฟล์ (รายละเอียดอัปเดตอะไหล่หลายร้อยรายการ)
          // ไฟล์กู้คืน (.json.gz) เก็บครบอยู่แล้ว ไฟล์ Excel มีไว้ให้คนเปิดดู
          row[f.name] = typeof cell === "string" && cell.length > EXCEL_CELL_MAX ? `${cell.slice(0, EXCEL_CELL_MAX)}…(ตัดเพราะยาวเกินช่อง Excel — ข้อมูลเต็มอยู่ในไฟล์กู้คืน)` : cell;
        }
        ws.addRow(row).commit();
      }
    });
    await writeTo(gz, "]");
    ws.commit();
  }
  await writeTo(gz, "}}");
  gz.end();
  await done;
  await wb.commit();
  return { excelPath, dataPath, counts };
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
export async function runBackup(opts: { kind: "MANUAL"; userId?: number; userName?: string }) {
  if (!isFileStoreConfigured()) throw new Error("ยังไม่ได้ตั้งค่าที่เก็บไฟล์ สำรองข้อมูลไม่ได้");
  if (running) await running.catch(() => undefined);
  const job = (async () => {
    const at = new Date();
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "otteri-backup-"));
    let excel: Buffer, data: Buffer, counts: Record<string, number>;
    try {
      const files = await writeBackupFiles(dir, await appliedMigrations());
      counts = files.counts;
      // ไฟล์ที่บีบอัดแล้วเล็ก (หลัก MB) อ่านเข้าหน่วยความจำได้ — ตัวที่ใหญ่คือข้อมูลก่อนบีบ ซึ่งไม่เคยอยู่ในหน่วยความจำทั้งก้อนแล้ว
      [excel, data] = await Promise.all([fs.promises.readFile(files.excelPath), fs.promises.readFile(files.dataPath)]);
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
    const base = backupBaseName(at);
    const excelKey = `backups/${base}-${at.getTime()}.xlsx`;
    const dataKey = `backups/${base}-${at.getTime()}.json.gz`;
    await uploadObject({ key: excelKey, body: excel, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await uploadObject({ key: dataKey, body: data, contentType: "application/gzip" });
    const fields = {
      createdAt: at,
      kind: opts.kind,
      byUserId: opts.userId ?? null,
      byName: opts.userName ?? null,
      excelKey,
      excelBytes: excel.length,
      dataKey,
      dataBytes: data.length,
      summary: {
        workOrders: counts.WorkOrder ?? 0,
        branches: counts.Branch ?? 0,
        users: counts.User ?? 0,
      },
    };
    const row = await prisma.backup
      .create({ data: fields })
      .catch(async (e) => {
        // บันทึกรายการไม่ผ่าน — ไฟล์ที่เพิ่งอัปไม่มีใครชี้ถึง ลบทิ้ง
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
