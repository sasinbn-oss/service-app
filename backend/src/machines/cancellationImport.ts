/**
 * นำเข้ารายชื่อสาขาหรือเครื่องที่ยกเลิกแล้ว
 *
 * ปัญหาที่ไฟล์นี้แก้: สาขาที่เลิกกิจการไปแล้วยังถูก export ออกมาในรายงานเครื่อง
 * ทุกรอบ โดยเครื่องทุกตัวอ่านค่าเป็น state 0 เพราะไม่มีอะไรส่งสัญญาณกลับมา
 * ระบบจึงเปิดเคสค้างไว้ตลอดกาล สะสม SLA และคะแนนทั้งที่ไม่มีเครื่องให้ใครไปซ่อม
 *
 * รายงานเครื่องเองบอกไม่ได้ว่าสาขาไหนปิดไปแล้ว — คอลัมน์ status เป็น active
 * ทุกแถวเสมอ ข้อมูลนี้จึงต้องมาจากคนผ่านไฟล์แยก
 *
 * ไฟล์เดียวรับได้สองระดับ — ใส่แค่รหัสสาขาคือยกเลิกทั้งสาขา ใส่หมายเลขเครื่องด้วย
 * คือถอดเฉพาะเครื่องนั้น สาขาที่เหลือยังทำงานปกติ ซึ่งเป็นกรณีที่เจอบ่อยกว่า
 *
 * ไม่ได้ลบทิ้ง เพราะประวัติเคสเก่ายังต้องอ่านย้อนหลังได้ แค่ทำเครื่องหมายไว้
 * แล้วให้ตัวนำเข้ารายงานเครื่องข้ามไป
 */
import ExcelJS from "exceljs";
import { prisma } from "../prisma";

export interface CancelledSheetRow {
  code: string;
  /** ว่าง = ทั้งสาขา มีค่า = เฉพาะเครื่องนี้ */
  machineCode: string | null;
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
  machine: ["num", "machine", "machine_code", "machine_no", "เครื่อง", "หมายเลขเครื่อง", "รหัสเครื่อง"],
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
    const machineCode = read(row, "machine") || null;
    // คีย์รวมหมายเลขเครื่องด้วย แถวสาขาเดียวกันคนละเครื่องจึงไม่ทับกัน
    byCode.set(`${code}|${machineCode ?? ""}`, {
      code,
      machineCode,
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
  /** สาขาที่จะถูกทำเครื่องหมายว่ายกเลิกทั้งสาขา */
  toCancel: { code: string; name: string; openCases: number }[];
  /** เครื่องที่จะถูกทำเครื่องหมายว่าถอดออก โดยสาขายังเปิดอยู่ */
  machinesToRemove: { code: string; name: string; machineCode: string; openCases: number }[];
  /** สาขาหรือเครื่องที่จะถูกเอากลับมาใช้งาน */
  toRestore: { code: string; name: string; machineCode: string | null }[];
  /** อยู่ในไฟล์แต่ทำเครื่องหมายไว้แล้ว ไม่ต้องทำอะไร */
  alreadyCancelled: number;
  /** รหัสในไฟล์ที่ไม่มีในระบบ — ข้ามไป พร้อมบอกให้รู้ */
  notFound: string[];
  /** เคสที่เปิดค้างอยู่ทั้งหมดที่จะถูกปิดพร้อมกัน ทั้งระดับสาขาและระดับเครื่อง */
  openCasesToClose: number;
  errors: string[];
  warnings: string[];
}

async function buildPlan(parsed: CancelledParseResult): Promise<CancelledImportPlan> {
  const codes = [...new Set(parsed.rows.map((r) => r.code))];
  const branches = await prisma.branch.findMany({
    where: { code: { in: codes } },
    select: {
      id: true,
      code: true,
      name: true,
      cancelledAt: true,
      _count: { select: { outages: { where: { endedAt: null } } } },
      machines: { select: { id: true, code: true, removedAt: true } },
    },
  });
  const byCode = new Map(branches.map((b) => [b.code, b]));

  // นับเคสที่เปิดอยู่ของเครื่องแต่ละตัว ใช้บอกว่าถอดเครื่องนี้แล้วจะปิดกี่เคส
  const openByMachine = new Map<number, number>();
  const machineIds = branches.flatMap((b) => b.machines.map((m) => m.id));
  if (machineIds.length > 0) {
    const grouped = await prisma.outage.groupBy({
      by: ["machineId"],
      where: { endedAt: null, machineId: { in: machineIds } },
      _count: true,
    });
    for (const g of grouped) if (g.machineId) openByMachine.set(g.machineId, g._count);
  }

  const toCancel: CancelledImportPlan["toCancel"] = [];
  const machinesToRemove: CancelledImportPlan["machinesToRemove"] = [];
  const toRestore: CancelledImportPlan["toRestore"] = [];
  const notFound: string[] = [];
  let alreadyCancelled = 0;

  for (const row of parsed.rows) {
    const branch = byCode.get(row.code);
    if (!branch) {
      notFound.push(row.machineCode ? `${row.code}/${row.machineCode}` : row.code);
      continue;
    }

    // ── ระดับเครื่อง ──
    if (row.machineCode) {
      const machine = branch.machines.find(
        (m) => m.code.toUpperCase() === row.machineCode!.toUpperCase()
      );
      if (!machine) {
        notFound.push(`${row.code}/${row.machineCode}`);
        continue;
      }
      if (row.restore) {
        if (machine.removedAt) {
          toRestore.push({ code: branch.code, name: branch.name, machineCode: machine.code });
        }
        continue;
      }
      if (machine.removedAt) {
        alreadyCancelled += 1;
        continue;
      }
      machinesToRemove.push({
        code: branch.code,
        name: branch.name,
        machineCode: machine.code,
        openCases: openByMachine.get(machine.id) ?? 0,
      });
      continue;
    }

    // ── ทั้งสาขา ──
    if (row.restore) {
      if (branch.cancelledAt) {
        toRestore.push({ code: branch.code, name: branch.name, machineCode: null });
      }
      continue;
    }
    if (branch.cancelledAt) {
      alreadyCancelled += 1;
      continue;
    }
    toCancel.push({ code: branch.code, name: branch.name, openCases: branch._count.outages });
  }

  const warnings: string[] = [];
  const openCasesToClose =
    toCancel.reduce((sum, b) => sum + b.openCases, 0) +
    machinesToRemove.reduce((sum, m) => sum + m.openCases, 0);

  if (openCasesToClose > 0) {
    const parts: string[] = [];
    if (toCancel.length > 0) parts.push(`${toCancel.length} สาขา`);
    if (machinesToRemove.length > 0) parts.push(`${machinesToRemove.length} เครื่อง`);
    warnings.push(
      `จะปิดเคสที่เปิดค้างอยู่ ${openCasesToClose} เคสจาก ${parts.join(" และ ")} ` +
        `โดยบันทึกเหตุผลว่าไม่ใช่ "ซ่อมเสร็จ" เวลาเฉลี่ยในรายงานจึงไม่เพี้ยน`
    );
  }
  if (notFound.length > 0) {
    warnings.push(
      `${notFound.length} รายการในไฟล์ไม่มีในระบบ ข้ามไป — ${notFound.slice(0, 5).join(", ")}` +
        (notFound.length > 5 ? ` และอีก ${notFound.length - 5}` : "")
    );
  }

  return {
    rowsInFile: parsed.rowsInFile,
    duplicateRows: parsed.duplicateRows,
    uniqueRows: parsed.rows.length,
    toCancel,
    machinesToRemove,
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
  const noteFor = (code: string, machineCode: string | null) =>
    parsed.rows.find((r) => r.code === code && (r.machineCode ?? null) === machineCode)?.note ?? null;

  const cancelCodes = plan.toCancel.map((b) => b.code);
  const restoreBranchCodes = plan.toRestore.filter((r) => !r.machineCode).map((r) => r.code);

  await prisma.$transaction(async (tx) => {
    // ── ทั้งสาขา ──
    for (const code of cancelCodes) {
      await tx.branch.update({
        where: { code },
        data: { cancelledAt: now, cancelledNote: noteFor(code, null) },
      });
    }
    if (cancelCodes.length > 0) {
      // ไม่ใช่ "ซ่อมเสร็จ" เพราะไม่มีใครไปซ่อม สาขาแค่ปิดไป
      await tx.outage.updateMany({
        where: { endedAt: null, branch: { code: { in: cancelCodes } } },
        data: { endedAt: now, closeReason: "BRANCH_CANCELLED" },
      });
    }
    if (restoreBranchCodes.length > 0) {
      await tx.branch.updateMany({
        where: { code: { in: restoreBranchCodes } },
        data: { cancelledAt: null, cancelledNote: null },
      });
    }

    // ── รายเครื่อง ──
    for (const m of plan.machinesToRemove) {
      const machine = await tx.machine.findFirst({
        where: { code: m.machineCode, branch: { code: m.code } },
        select: { id: true },
      });
      if (!machine) continue;
      await tx.machine.update({
        where: { id: machine.id },
        data: { removedAt: now, removedNote: noteFor(m.code, m.machineCode) },
      });
      await tx.outage.updateMany({
        where: { endedAt: null, machineId: machine.id },
        data: { endedAt: now, closeReason: "MACHINE_REMOVED" },
      });
    }

    for (const r of plan.toRestore.filter((x) => x.machineCode)) {
      await tx.machine.updateMany({
        where: { code: r.machineCode!, branch: { code: r.code } },
        data: { removedAt: null, removedNote: null },
      });
    }
  });

  return plan;
}
