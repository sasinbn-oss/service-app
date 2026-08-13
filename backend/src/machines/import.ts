/**
 * นำเข้าไฟล์ export "machine offline" แล้วกระทบยอดกับเคสที่เปิดค้างอยู่
 *
 * ไฟล์นี้เป็น snapshot ของ "ใครมีปัญหาตอนนี้" เท่านั้น ไม่มีเครื่องปกติปนมา
 * และไม่มีเวลาบอกว่าเริ่มมีปัญหาตั้งแต่เมื่อไหร่ ระบบจึงต้องจำเอง:
 *
 *   เจอในไฟล์ครั้งแรก  → เปิดเคส เริ่มจับเวลา SLA
 *   ยังเจออยู่          → ยังไม่แก้ นับต่อ
 *   หายไปจากไฟล์       → ซ่อมเสร็จ ปิดเคส
 *
 * เพราะ "หายจากไฟล์ = ซ่อมเสร็จ" ไฟล์ที่ export มาไม่ครบจะทำให้ระบบเข้าใจผิดว่า
 * ทุกอย่างหายดี โหมดตรวจสอบก่อนบันทึกจึงบอกจำนวนที่จะถูกปิดเสมอ เพื่อให้เห็นก่อนกดยืนยัน
 */
import ExcelJS from "exceljs";
import { prisma } from "../prisma";

/** ความหมายของค่าในไฟล์ ตามที่ตกลงกับหน้างาน */
const MACHINE_OFF_STATE = "0";

export type OutageKind = "MACHINE_OFF" | "SIGNAL_LOST";

export interface SheetRow {
  branchCode: string;
  branchName: string;
  ownership: string | null;
  branchStatus: string | null;
  machineCode: string;
  machineType: string;
  machineBrand: string | null;
  stateCode: string;
  signalLost: boolean;
  /** คอลัมน์เสริม ถ้าวันหนึ่งไฟล์มีมาให้ */
  region: string | null;
  zone: string | null;
  grade: string | null;
}

export interface ParseResult {
  rows: SheetRow[];
  rowsInFile: number;
  duplicateRows: number;
  errors: string[];
}

/** ชื่อคอลัมน์ที่ยอมรับ เผื่อหัวตารางเปลี่ยนเล็กน้อย */
const HEADER_ALIASES: Record<keyof SheetRow, string[]> = {
  branchCode: ["crm_code", "branch_code", "รหัสสาขา"],
  branchName: ["name", "branch_name", "ชื่อสาขา"],
  ownership: ["brand_type", "ownership", "เจ้าของ"],
  branchStatus: ["status", "branch_status"],
  machineCode: ["num", "machine_no", "machine_code", "หมายเลขเครื่อง"],
  machineType: ["machine_type", "type", "ชนิดเครื่อง"],
  machineBrand: ["machine_brand", "brand", "ยี่ห้อ"],
  stateCode: ["state"],
  signalLost: ["offline"],
  region: ["region", "ภาค"],
  zone: ["zone", "โซน"],
  grade: ["grade", "เกรด"],
};

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

/** ค่า offline มาได้ทั้ง boolean จริงและข้อความ "true"/"TRUE"/"yes" */
function isTruthy(text: string): boolean {
  return ["true", "yes", "y", "1"].includes(text.trim().toLowerCase());
}

export async function parseWorkbook(buffer: Buffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], rowsInFile: 0, duplicateRows: 0, errors: ["ไฟล์ไม่มีชีตข้อมูล"] };

  const headerRow = sheet.getRow(1);
  const columnOf: Partial<Record<keyof SheetRow, number>> = {};
  for (let c = 1; c <= sheet.columnCount; c++) {
    const header = cellText(headerRow.getCell(c).value).trim().toLowerCase();
    if (!header) continue;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      const key = field as keyof SheetRow;
      if (columnOf[key] === undefined && aliases.includes(header)) columnOf[key] = c;
    }
  }

  const errors: string[] = [];
  for (const required of ["branchCode", "machineCode", "stateCode", "signalLost"] as const) {
    if (columnOf[required] === undefined) {
      errors.push(`ไม่พบคอลัมน์ ${HEADER_ALIASES[required][0]} ในไฟล์`);
    }
  }
  if (errors.length > 0) return { rows: [], rowsInFile: 0, duplicateRows: 0, errors };

  const read = (row: ExcelJS.Row, field: keyof SheetRow): string => {
    const column = columnOf[field];
    return column === undefined ? "" : cellText(row.getCell(column).value).trim();
  };

  // เก็บลง Map โดยใช้ สาขา+เครื่อง เป็นคีย์ แถวซ้ำจึงถูกยุบเหลืออันเดียว
  // ไฟล์จริงเคยมีสาขาหนึ่งซ้ำ 112 รอบต่อเครื่อง ถ้าไม่ยุบยอดจะเพี้ยนเกือบเท่าตัว
  const byKey = new Map<string, SheetRow>();
  let rowsInFile = 0;

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const branchCode = read(row, "branchCode");
    const machineCode = read(row, "machineCode");
    if (!branchCode || !machineCode) continue;
    rowsInFile += 1;

    const machineType = read(row, "machineType").toUpperCase();
    byKey.set(`${branchCode}|${machineCode}`, {
      branchCode,
      branchName: read(row, "branchName") || branchCode,
      ownership: read(row, "ownership").toUpperCase() || null,
      branchStatus: read(row, "branchStatus").toLowerCase() || null,
      machineCode,
      machineType:
        machineType === "WASHER" || machineType === "DRYER"
          ? machineType
          : machineCode.toUpperCase().startsWith("D")
            ? "DRYER"
            : "WASHER",
      machineBrand: read(row, "machineBrand") || null,
      stateCode: read(row, "stateCode"),
      signalLost: isTruthy(read(row, "signalLost")),
      region: read(row, "region") || null,
      zone: read(row, "zone") || null,
      grade: read(row, "grade") || null,
    });
  }

  return {
    rows: [...byKey.values()],
    rowsInFile,
    duplicateRows: rowsInFile - byKey.size,
    errors,
  };
}

export interface ImportPlan {
  snapshotAt: Date;
  rowsInFile: number;
  duplicateRows: number;
  uniqueRows: number;
  /** เครื่องที่ดับ: สัญญาณปกติ และ state = 0 */
  machinesOff: number;
  /** สาขาที่สัญญาณหายทั้งสาขา */
  branchesSignalLost: number;
  machinesAtSignalLostBranches: number;
  newBranches: string[];
  newMachines: number;
  opening: { machineOff: number; signalLost: number };
  closing: { machineOff: number; signalLost: number };
  stillOpen: { machineOff: number; signalLost: number };
  /** แถวที่ไม่เข้าเงื่อนไขทั้งเครื่องดับและสัญญาณหาย — ปกติต้องเป็น 0 */
  ignoredRows: number;
  errors: string[];
  warnings: string[];
}

interface Split {
  offMachines: Map<string, SheetRow>;
  signalLostBranches: Map<string, SheetRow[]>;
  ignoredRows: number;
}

/**
 * แยกสองปัญหาออกจากกัน
 *
 * สาขาที่สัญญาณหาย ค่า state ของทุกเครื่องเป็นค่าค้างเก่าที่เชื่อไม่ได้
 * จึงไม่เอามานับเป็นเครื่องดับ ให้ถือเป็นปัญหาระดับสาขาอย่างเดียว
 */
function split(rows: SheetRow[]): Split {
  const offMachines = new Map<string, SheetRow>();
  const signalLostBranches = new Map<string, SheetRow[]>();
  let ignoredRows = 0;

  for (const row of rows) {
    if (row.signalLost) {
      const list = signalLostBranches.get(row.branchCode) ?? [];
      list.push(row);
      signalLostBranches.set(row.branchCode, list);
    } else if (row.stateCode === MACHINE_OFF_STATE) {
      offMachines.set(`${row.branchCode}|${row.machineCode}`, row);
    } else {
      ignoredRows += 1;
    }
  }

  return { offMachines, signalLostBranches, ignoredRows };
}

export async function planImport(parsed: ParseResult, snapshotAt: Date): Promise<ImportPlan> {
  const { offMachines, signalLostBranches, ignoredRows } = split(parsed.rows);
  const warnings: string[] = [];

  if (parsed.duplicateRows > 0) {
    warnings.push(
      `ไฟล์มีแถวซ้ำ ${parsed.duplicateRows} แถว ระบบตัดให้เหลืออันเดียวต่อเครื่องแล้ว ควรตรวจที่ต้นทางด้วย`
    );
  }
  if (ignoredRows > 0) {
    warnings.push(
      `มี ${ignoredRows} แถวที่สัญญาณปกติแต่ state ไม่ใช่ 0 — ไม่ถือว่าเครื่องดับ จึงไม่นับ`
    );
  }

  const branchCodes = [...new Set(parsed.rows.map((r) => r.branchCode))];
  const existingBranches = await prisma.branch.findMany({
    where: { code: { in: branchCodes } },
    select: { id: true, code: true, machines: { select: { code: true } } },
  });
  const branchByCode = new Map(existingBranches.map((b) => [b.code, b]));
  const newBranches = branchCodes.filter((code) => !branchByCode.has(code));

  let newMachines = 0;
  for (const row of parsed.rows) {
    const branch = branchByCode.get(row.branchCode);
    if (!branch || !branch.machines.some((m) => m.code === row.machineCode)) newMachines += 1;
  }

  const openOutages = await prisma.outage.findMany({
    where: { endedAt: null },
    select: {
      id: true,
      kind: true,
      branch: { select: { code: true } },
      machine: { select: { code: true } },
    },
  });

  let openMachineOffStillThere = 0;
  let closingMachineOff = 0;
  for (const outage of openOutages.filter((o) => o.kind === "MACHINE_OFF")) {
    const key = `${outage.branch.code}|${outage.machine?.code ?? ""}`;
    if (offMachines.has(key)) openMachineOffStillThere += 1;
    else closingMachineOff += 1;
  }

  let openSignalStillThere = 0;
  let closingSignal = 0;
  for (const outage of openOutages.filter((o) => o.kind === "SIGNAL_LOST")) {
    if (signalLostBranches.has(outage.branch.code)) openSignalStillThere += 1;
    else closingSignal += 1;
  }

  const openingMachineOff = offMachines.size - openMachineOffStillThere;
  const openingSignal = signalLostBranches.size - openSignalStillThere;

  if (closingMachineOff + closingSignal > 0 && offMachines.size === 0) {
    warnings.push(
      "ไฟล์นี้ไม่มีเครื่องดับเลย ถ้าไม่ได้ตั้งใจ ให้ตรวจว่า export มาครบทุกสาขาหรือไม่ ก่อนกดยืนยัน"
    );
  }

  return {
    snapshotAt,
    rowsInFile: parsed.rowsInFile,
    duplicateRows: parsed.duplicateRows,
    uniqueRows: parsed.rows.length,
    machinesOff: offMachines.size,
    branchesSignalLost: signalLostBranches.size,
    machinesAtSignalLostBranches: [...signalLostBranches.values()].reduce(
      (sum, list) => sum + list.length,
      0
    ),
    newBranches,
    newMachines,
    opening: { machineOff: openingMachineOff, signalLost: openingSignal },
    closing: { machineOff: closingMachineOff, signalLost: closingSignal },
    stillOpen: { machineOff: openMachineOffStillThere, signalLost: openSignalStillThere },
    ignoredRows,
    errors: parsed.errors,
    warnings,
  };
}

export async function applyImport(
  parsed: ParseResult,
  snapshotAt: Date,
  meta: { uploadedById?: number; fileName?: string }
): Promise<ImportPlan> {
  const plan = await planImport(parsed, snapshotAt);
  if (plan.errors.length > 0) return plan;

  const { offMachines, signalLostBranches } = split(parsed.rows);

  // สร้าง/อัปเดตสาขาและเครื่องก่อน เพื่อให้ทุกเคสมีของให้อ้างถึง
  const branchIdByCode = new Map<string, number>();
  const seenBranches = new Map<string, SheetRow>();
  for (const row of parsed.rows) if (!seenBranches.has(row.branchCode)) seenBranches.set(row.branchCode, row);

  for (const [code, row] of seenBranches) {
    const branch = await prisma.branch.upsert({
      where: { code },
      // region/zone/grade ไม่อยู่ในไฟล์ปกติ จึงเขียนเฉพาะเมื่อไฟล์ส่งมาจริง
      update: {
        name: row.branchName,
        ...(row.ownership ? { ownership: row.ownership } : {}),
        ...(row.branchStatus ? { status: row.branchStatus } : {}),
        ...(row.region ? { region: row.region } : {}),
        ...(row.zone ? { zone: row.zone } : {}),
        ...(row.grade ? { grade: row.grade } : {}),
      },
      create: {
        code,
        name: row.branchName,
        ownership: row.ownership,
        status: row.branchStatus ?? "active",
        region: row.region,
        zone: row.zone,
        grade: row.grade,
      },
      select: { id: true },
    });
    branchIdByCode.set(code, branch.id);
  }

  const machineIdByKey = new Map<string, number>();
  for (const row of parsed.rows) {
    const branchId = branchIdByCode.get(row.branchCode)!;
    const isOff = !row.signalLost && row.stateCode === MACHINE_OFF_STATE;
    const machine = await prisma.machine.upsert({
      where: { branchId_code: { branchId, code: row.machineCode } },
      update: {
        type: row.machineType,
        brand: row.machineBrand,
        stateCode: row.stateCode || null,
        status: isOff ? "OFF" : "ON",
      },
      create: {
        branchId,
        code: row.machineCode,
        type: row.machineType,
        brand: row.machineBrand,
        stateCode: row.stateCode || null,
        status: isOff ? "OFF" : "ON",
      },
      select: { id: true },
    });
    machineIdByKey.set(`${row.branchCode}|${row.machineCode}`, machine.id);
  }

  const openOutages = await prisma.outage.findMany({
    where: { endedAt: null },
    select: {
      id: true,
      kind: true,
      branch: { select: { code: true } },
      machine: { select: { code: true } },
    },
  });

  const stillOpenMachineKeys = new Set<string>();
  const stillOpenBranchCodes = new Set<string>();
  const closingIds: number[] = [];
  const touchingIds: number[] = [];

  for (const outage of openOutages) {
    if (outage.kind === "MACHINE_OFF") {
      const key = `${outage.branch.code}|${outage.machine?.code ?? ""}`;
      if (offMachines.has(key)) {
        stillOpenMachineKeys.add(key);
        touchingIds.push(outage.id);
      } else closingIds.push(outage.id);
    } else {
      if (signalLostBranches.has(outage.branch.code)) {
        stillOpenBranchCodes.add(outage.branch.code);
        touchingIds.push(outage.id);
      } else closingIds.push(outage.id);
    }
  }

  const opening: { kind: OutageKind; branchId: number; machineId: number | null }[] = [];
  for (const [key, row] of offMachines) {
    if (stillOpenMachineKeys.has(key)) continue;
    opening.push({
      kind: "MACHINE_OFF",
      branchId: branchIdByCode.get(row.branchCode)!,
      machineId: machineIdByKey.get(key)!,
    });
  }
  for (const code of signalLostBranches.keys()) {
    if (stillOpenBranchCodes.has(code)) continue;
    opening.push({ kind: "SIGNAL_LOST", branchId: branchIdByCode.get(code)!, machineId: null });
  }

  // เขียนการเปลี่ยนสถานะทั้งหมดในทรานแซกชันเดียว ยอดที่แดชบอร์ดอ่านจะได้ไม่เห็นสภาพครึ่ง ๆ
  await prisma.$transaction([
    prisma.outage.updateMany({ where: { id: { in: closingIds } }, data: { endedAt: snapshotAt } }),
    prisma.outage.updateMany({ where: { id: { in: touchingIds } }, data: { lastSeenAt: snapshotAt } }),
    prisma.outage.createMany({
      data: opening.map((o) => ({ ...o, startedAt: snapshotAt, lastSeenAt: snapshotAt })),
    }),
    prisma.machineImport.create({
      data: {
        uploadedById: meta.uploadedById,
        fileName: meta.fileName,
        snapshotAt,
        rowsInFile: plan.rowsInFile,
        duplicateRows: plan.duplicateRows,
        branchesTouched: seenBranches.size,
        machinesOff: plan.machinesOff,
        branchesSignalLost: plan.branchesSignalLost,
        opened: opening.length,
        closed: closingIds.length,
      },
    }),
  ]);

  return plan;
}
