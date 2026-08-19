/**
 * นำเข้ารายชื่อสาขาที่ยกเลิกแล้ว
 *
 * ปัญหาที่ไฟล์นี้แก้: สาขาที่เลิกกิจการไปแล้วยังถูก export ออกมาในรายงานเครื่อง
 * ทุกรอบ โดยเครื่องทุกตัวอ่านค่าเป็น state 0 เพราะไม่มีอะไรส่งสัญญาณกลับมา
 * ระบบจึงเปิดเคสค้างไว้ตลอดกาล สะสม SLA และคะแนนทั้งที่ไม่มีเครื่องให้ใครไปซ่อม
 *
 * รายงานเครื่องเองบอกไม่ได้ว่าสาขาไหนปิดไปแล้ว — คอลัมน์ status เป็น active
 * ทุกแถวเสมอ ข้อมูลนี้จึงต้องมาจากคนผ่านไฟล์แยก
 *
 * ไม่ได้ลบสาขาทิ้ง เพราะประวัติเคสเก่ายังต้องอ่านย้อนหลังได้ แค่ทำเครื่องหมายไว้
 * แล้วให้ตัวนำเข้ารายงานเครื่องข้ามสาขานั้นไป
 */
import ExcelJS from "exceljs";
import { prisma } from "../prisma";

export interface CancelledSheetRow {
  code: string;
  /** ชื่อจากไฟล์ ใช้แค่ยืนยันสายตาตอนดูหน้าสรุป ไม่ได้เอาไปเขียนทับ */
  name: string | null;
  note: string | null;
  /** true = เอากลับมาใช้งาน ปกติเป็น false (ไฟล์นี้มีไว้ยกเลิก) */
  restore: boolean;
}

export interface CancelledParseResult {
  rows: CancelledSheetRow[];
  rowsInFile: number;
  duplicateRows: number;
  errors: string[];
}

const HEADER_ALIASES = {
  code: ["code", "crm_code", "branch_code", "รหัสสาขา", "รหัส"],
  name: ["name", "branch_name", "ชื่อสาขา", "สาขา"],
  note: ["note", "reason", "หมายเหตุ", "เหตุผล"],
  status: ["status", "สถานะ"],
} as const;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    if ("text" in value) return String((value as { text: unknown }).text ?? "");
    if ("result" in value) return String((value as { result: unknown }).result ?? "");
    return "";
  }
  return String(value);
}

/** คำที่แปลว่า "เอากลับมาใช้งาน" — เผื่อวันหลังต้องกู้สาขาที่ทำเครื่องหมายผิด */
const RESTORE_WORDS = ["active", "open", "ใช้งาน", "เปิด", "ปกติ", "กลับมา"];

export async function parseCancelledWorkbook(buffer: Buffer): Promise<CancelledParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], rowsInFile: 0, duplicateRows: 0, errors: ["ไฟล์ไม่มีชีตข้อมูล"] };
  }

  const headerRow = sheet.getRow(1);
  const columnOf: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  for (let c = 1; c <= sheet.columnCount; c++) {
    const header = cellText(headerRow.getCell(c).value).trim().toLowerCase();
    if (!header) continue;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      const key = field as keyof typeof HEADER_ALIASES;
      if (columnOf[key] === undefined && (aliases as readonly string[]).includes(header)) {
        columnOf[key] = c;
      }
    }
  }

  if (columnOf.code === undefined) {
    return {
      rows: [],
      rowsInFile: 0,
      duplicateRows: 0,
      errors: ["ไม่พบคอลัมน์รหัสสาขา — ตั้งหัวตารางเป็น code หรือ รหัสสาขา"],
    };
  }

  const read = (row: ExcelJS.Row, field: keyof typeof HEADER_ALIASES) => {
    const column = columnOf[field];
    return column === undefined ? "" : cellText(row.getCell(column).value).trim();
  };

  const byCode = new Map<string, CancelledSheetRow>();
  let rowsInFile = 0;
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const code = read(row, "code");
    if (!code) continue;
    rowsInFile += 1;
    const status = read(row, "status").toLowerCase();
    byCode.set(code, {
      code,
      name: read(row, "name") || null,
      note: read(row, "note") || null,
      restore: RESTORE_WORDS.some((w) => status.includes(w)),
    });
  }

  return {
    rows: [...byCode.values()],
    rowsInFile,
    duplicateRows: rowsInFile - byCode.size,
    errors: [],
  };
}

export interface CancelledImportPlan {
  rowsInFile: number;
  duplicateRows: number;
  uniqueRows: number;
  /** สาขาที่จะถูกทำเครื่องหมายว่ายกเลิก */
  toCancel: { code: string; name: string; openCases: number }[];
  /** สาขาที่จะถูกเอากลับมาใช้งาน */
  toRestore: { code: string; name: string }[];
  /** อยู่ในไฟล์แต่ทำเครื่องหมายไว้แล้ว ไม่ต้องทำอะไร */
  alreadyCancelled: number;
  /** รหัสในไฟล์ที่ไม่มีในระบบ — ข้ามไป พร้อมบอกให้รู้ */
  notFound: string[];
  /** เคสที่เปิดค้างอยู่ทั้งหมดของสาขาที่จะยกเลิก จะถูกปิดพร้อมกัน */
  openCasesToClose: number;
  errors: string[];
  warnings: string[];
}

async function buildPlan(parsed: CancelledParseResult): Promise<CancelledImportPlan> {
  const codes = parsed.rows.map((r) => r.code);
  const branches = await prisma.branch.findMany({
    where: { code: { in: codes } },
    select: {
      code: true,
      name: true,
      cancelledAt: true,
      _count: { select: { outages: { where: { endedAt: null } } } },
    },
  });
  const byCode = new Map(branches.map((b) => [b.code, b]));

  const toCancel: CancelledImportPlan["toCancel"] = [];
  const toRestore: CancelledImportPlan["toRestore"] = [];
  const notFound: string[] = [];
  let alreadyCancelled = 0;

  for (const row of parsed.rows) {
    const branch = byCode.get(row.code);
    if (!branch) {
      notFound.push(row.code);
      continue;
    }
    if (row.restore) {
      if (branch.cancelledAt) toRestore.push({ code: branch.code, name: branch.name });
      continue;
    }
    if (branch.cancelledAt) {
      alreadyCancelled += 1;
      continue;
    }
    toCancel.push({ code: branch.code, name: branch.name, openCases: branch._count.outages });
  }

  const warnings: string[] = [];
  const openCasesToClose = toCancel.reduce((sum, b) => sum + b.openCases, 0);
  if (openCasesToClose > 0) {
    warnings.push(
      `จะปิดเคสที่เปิดค้างอยู่ ${openCasesToClose} เคสจาก ${toCancel.length} สาขา ` +
        `โดยบันทึกเหตุผลว่า "สาขายกเลิก" ไม่ใช่ "ซ่อมเสร็จ" เวลาเฉลี่ยในรายงานจึงไม่เพี้ยน`
    );
  }
  if (notFound.length > 0) {
    warnings.push(
      `${notFound.length} รหัสในไฟล์ไม่มีในระบบ ข้ามไป — ${notFound.slice(0, 5).join(", ")}` +
        (notFound.length > 5 ? ` และอีก ${notFound.length - 5}` : "")
    );
  }

  return {
    rowsInFile: parsed.rowsInFile,
    duplicateRows: parsed.duplicateRows,
    uniqueRows: parsed.rows.length,
    toCancel,
    toRestore,
    alreadyCancelled,
    notFound,
    openCasesToClose,
    errors: parsed.errors,
    warnings,
  };
}

export async function planCancelledImport(parsed: CancelledParseResult) {
  return buildPlan(parsed);
}

export async function applyCancelledImport(parsed: CancelledParseResult) {
  const plan = await buildPlan(parsed);
  const now = new Date();
  const noteByCode = new Map(parsed.rows.map((r) => [r.code, r.note]));

  const cancelCodes = plan.toCancel.map((b) => b.code);
  const restoreCodes = plan.toRestore.map((b) => b.code);

  await prisma.$transaction(async (tx) => {
    for (const code of cancelCodes) {
      await tx.branch.update({
        where: { code },
        data: { cancelledAt: now, cancelledNote: noteByCode.get(code) ?? null },
      });
    }

    if (cancelCodes.length > 0) {
      // ปิดเคสที่ค้างอยู่ทั้งหมดของสาขาเหล่านี้ พร้อมเหตุผล
      // ไม่ใช่ "ซ่อมเสร็จ" เพราะไม่มีใครไปซ่อม สาขาแค่ปิดไป
      await tx.outage.updateMany({
        where: { endedAt: null, branch: { code: { in: cancelCodes } } },
        data: { endedAt: now, closeReason: "BRANCH_CANCELLED" },
      });
    }

    if (restoreCodes.length > 0) {
      await tx.branch.updateMany({
        where: { code: { in: restoreCodes } },
        data: { cancelledAt: null, cancelledNote: null },
      });
    }
  });

  return plan;
}
