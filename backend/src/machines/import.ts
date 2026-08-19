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
import { outageScore } from "../utils/constants";

/** ต้องตรงกับ SLA_HOURS ใน routes/machines.ts — ใช้ตัดสินว่าเคสไหนเลยกำหนดตอน snapshot */
const SLA_HOURS = Number(process.env.MACHINE_SLA_HOURS) || 72;

interface SnapshotBucket {
  branchId: number;
  kind: string;
  region: string | null;
  zone: string | null;
  ownership: string | null;
  grade: string | null;
  cases: number;
  score: number;
  breached: number;
}

/** ความหมายของค่าในไฟล์ ตามที่ตกลงกับหน้างาน */
const MACHINE_OFF_STATE = "0";

/**
 * เครื่องดับพร้อมกันเกินกี่เครื่องในสาขาเดียว ถึงจะถือว่าเป็นสายขาด
 *
 * เครื่องหลายตัวพังพร้อมกันในวันเดียวแทบไม่เกิดขึ้น ที่เจอจริงคือสายสัญญาณขาด
 * หรือไฟดับทั้งสาขา ซึ่งเป็นงานของทีมเน็ตเวิร์ก ไม่ใช่ช่างซ่อมเครื่อง
 * ถ้าปล่อยไว้จะกลายเป็นใบงานช่างสิบกว่าใบที่ไม่มีใครต้องไปเปลี่ยนอะไหล่เลย
 */
const SIGNAL_LOST_MIN_OFF = Number(process.env.MACHINE_OFF_SIGNAL_THRESHOLD) || 8;

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
  /** จำนวนสาขาที่ยังไม่เคยมีในระบบ */
  newBranchCount: number;
  /** ตัวอย่างรหัสสาขาใหม่ ไม่ส่งทั้งหมดเพราะครั้งแรกมีเป็นร้อย และหน้าจอใช้แค่จำนวน */
  newBranchSample: string[];
  newMachines: number;
  opening: { machineOff: number; signalLost: number };
  closing: { machineOff: number; signalLost: number };
  stillOpen: { machineOff: number; signalLost: number };
  /** แถวที่ไม่เข้าเงื่อนไขทั้งเครื่องดับและสัญญาณหาย — ปกติต้องเป็น 0 */
  ignoredRows: number;
  /** แถวที่ข้ามเพราะสาขาถูกทำเครื่องหมายยกเลิกไว้ */
  skippedCancelledRows: number;
  skippedCancelledBranches: number;
  /** สาขาที่ดับเกินเกณฑ์ จึงถูกนับเป็นสัญญาณหายแทนเครื่องดับรายตัว */
  reclassifiedBranches: { branchCode: string; branchName: string; machinesOff: number }[];
  errors: string[];
  warnings: string[];
}

interface Split {
  offMachines: Map<string, SheetRow>;
  signalLostBranches: Map<string, SheetRow[]>;
  ignoredRows: number;
  /** สาขาที่ถูกย้ายจากเครื่องดับรายตัวไปเป็นสัญญาณหาย เพราะดับเกินเกณฑ์ */
  reclassified: { branchCode: string; branchName: string; machinesOff: number }[];
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

  // สาขาที่ดับเกินเกณฑ์ถือว่าสายขาด ย้ายทั้งสาขาไปเป็นสัญญาณหาย
  // ทำหลังนับครบทั้งไฟล์ เพราะต้องรู้ยอดรวมต่อสาขาก่อนถึงจะตัดสินได้
  const offByBranch = new Map<string, SheetRow[]>();
  for (const row of offMachines.values()) {
    const list = offByBranch.get(row.branchCode) ?? [];
    list.push(row);
    offByBranch.set(row.branchCode, list);
  }

  const reclassified: Split["reclassified"] = [];
  for (const [branchCode, branchRows] of offByBranch) {
    if (branchRows.length <= SIGNAL_LOST_MIN_OFF) continue;
    // สาขาที่ไฟล์บอกว่า offline อยู่แล้วไม่ต้องย้ายซ้ำ
    if (signalLostBranches.has(branchCode)) continue;

    reclassified.push({
      branchCode,
      branchName: branchRows[0].branchName,
      machinesOff: branchRows.length,
    });
    signalLostBranches.set(branchCode, branchRows);
    for (const row of branchRows) offMachines.delete(`${branchCode}|${row.machineCode}`);
  }

  return { offMachines, signalLostBranches, ignoredRows, reclassified };
}

/**
 * สาขาที่ทำเครื่องหมายยกเลิกไว้ — ต้องข้ามทุกแถวของสาขาเหล่านี้
 *
 * เครื่องของสาขาที่ปิดไปแล้วยังถูก export ออกมาเป็น state 0 ทุกรอบ
 * ถ้าไม่กันไว้ เคสจะถูกเปิดใหม่ทุกครั้งที่อัปโหลด ต่อให้เพิ่งปิดไปเมื่อวาน
 */
async function cancelledBranchCodes(): Promise<Set<string>> {
  const rows = await prisma.branch.findMany({
    where: { cancelledAt: { not: null } },
    select: { code: true },
  });
  return new Set(rows.map((r) => r.code));
}

export async function planImport(parsed: ParseResult, snapshotAt: Date): Promise<ImportPlan> {
  const cancelled = await cancelledBranchCodes();
  const usableRows = parsed.rows.filter((r) => !cancelled.has(r.branchCode));
  const skippedCancelled = parsed.rows.length - usableRows.length;
  const skippedCancelledBranches = new Set(
    parsed.rows.filter((r) => cancelled.has(r.branchCode)).map((r) => r.branchCode)
  ).size;

  const { offMachines, signalLostBranches, ignoredRows, reclassified } = split(usableRows);
  const warnings: string[] = [];

  if (skippedCancelled > 0) {
    warnings.push(
      `ข้าม ${skippedCancelled} แถวจาก ${skippedCancelledBranches} สาขาที่ทำเครื่องหมายยกเลิกไว้แล้ว`
    );
  }

  if (reclassified.length > 0) {
    const sample = reclassified
      .slice(0, 3)
      .map((r) => `${r.branchCode} (${r.machinesOff} เครื่อง)`)
      .join(", ");
    warnings.push(
      `${reclassified.length} สาขาดับเกิน ${SIGNAL_LOST_MIN_OFF} เครื่อง ถือว่าสายขาด ` +
        `นับเป็นสัญญาณหายทั้งสาขาแทนเครื่องดับรายตัว — ${sample}` +
        (reclassified.length > 3 ? ` และอีก ${reclassified.length - 3} สาขา` : "")
    );
  }

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
    newBranchCount: newBranches.length,
    newBranchSample: newBranches.slice(0, 20),
    newMachines,
    opening: { machineOff: openingMachineOff, signalLost: openingSignal },
    closing: { machineOff: closingMachineOff, signalLost: closingSignal },
    stillOpen: { machineOff: openMachineOffStillThere, signalLost: openSignalStillThere },
    ignoredRows,
    skippedCancelledRows: skippedCancelled,
    skippedCancelledBranches,
    reclassifiedBranches: reclassified,
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

  const cancelled = await cancelledBranchCodes();
  const { offMachines, signalLostBranches } = split(
    parsed.rows.filter((r) => !cancelled.has(r.branchCode))
  );

  const seenBranches = new Map<string, SheetRow>();
  const liveRows = parsed.rows.filter((r) => !cancelled.has(r.branchCode));
  for (const row of liveRows) if (!seenBranches.has(row.branchCode)) seenBranches.set(row.branchCode, row);

  // เขียนสาขาทั้งหมดในคำสั่งเดียวด้วย unnest
  //
  // เดิมใช้ upsert ทีละแถว = 320 + 1011 รอบไป-กลับฐานข้อมูล ซึ่งบนเครื่องเดียวกัน
  // ยังพอไหว แต่กับฐานข้อมูลที่อยู่คนละที่ (เช่น Supabase) แต่ละรอบมีค่า latency
  // ของตัวเอง รวมกันแล้วกลายเป็นหลายนาที การส่งเป็นอาร์เรย์ชุดเดียวทำให้เหลือรอบเดียว
  //
  // COALESCE ทำหน้าที่เดียวกับที่เคยเขียนเป็นเงื่อนไขใน JS: ถ้าไฟล์ไม่ได้ส่งค่ามา
  // (เป็น null) ให้คงค่าเดิมในฐานข้อมูลไว้ ไม่เขียนทับด้วยค่าว่าง
  const branchRows = [...seenBranches.values()];
  const upsertedBranches = await prisma.$queryRaw<{ id: number; code: string }[]>`
    INSERT INTO "Branch" ("code", "name", "ownership", "status", "region", "zone", "grade")
    SELECT * FROM unnest(
      ${branchRows.map((r) => r.branchCode)}::text[],
      ${branchRows.map((r) => r.branchName)}::text[],
      ${branchRows.map((r) => r.ownership)}::text[],
      ${branchRows.map((r) => r.branchStatus ?? "active")}::text[],
      ${branchRows.map((r) => r.region)}::text[],
      ${branchRows.map((r) => r.zone)}::text[],
      ${branchRows.map((r) => r.grade)}::text[]
    )
    ON CONFLICT ("code") DO UPDATE SET
      "name"      = EXCLUDED."name",
      "ownership" = COALESCE(EXCLUDED."ownership", "Branch"."ownership"),
      "status"    = COALESCE(EXCLUDED."status",    "Branch"."status"),
      "region"    = COALESCE(EXCLUDED."region",    "Branch"."region"),
      "zone"      = COALESCE(EXCLUDED."zone",      "Branch"."zone"),
      "grade"     = COALESCE(EXCLUDED."grade",     "Branch"."grade")
    RETURNING "id", "code"
  `;
  const branchIdByCode = new Map(upsertedBranches.map((b) => [b.code, b.id]));

  const machineRows = liveRows.map((row) => ({
    branchId: branchIdByCode.get(row.branchCode)!,
    row,
    status: !row.signalLost && row.stateCode === MACHINE_OFF_STATE ? "OFF" : "ON",
  }));

  const upsertedMachines = await prisma.$queryRaw<
    { id: number; branchId: number; code: string }[]
  >`
    INSERT INTO "Machine" ("branchId", "code", "type", "brand", "stateCode", "status", "updatedAt")
    SELECT t.*, now() FROM unnest(
      ${machineRows.map((m) => m.branchId)}::int[],
      ${machineRows.map((m) => m.row.machineCode)}::text[],
      ${machineRows.map((m) => m.row.machineType)}::text[],
      ${machineRows.map((m) => m.row.machineBrand)}::text[],
      ${machineRows.map((m) => m.row.stateCode || null)}::text[],
      ${machineRows.map((m) => m.status)}::text[]
    ) AS t
    ON CONFLICT ("branchId", "code") DO UPDATE SET
      "type"      = EXCLUDED."type",
      "brand"     = EXCLUDED."brand",
      "stateCode" = EXCLUDED."stateCode",
      "status"    = EXCLUDED."status",
      "updatedAt" = now()
    RETURNING "id", "branchId", "code"
  `;

  const codeByBranchId = new Map([...branchIdByCode].map(([code, id]) => [id, code]));
  const machineIdByKey = new Map(
    upsertedMachines.map((m) => [`${codeByBranchId.get(m.branchId)}|${m.code}`, m.id])
  );

  const openOutages = await prisma.outage.findMany({
    where: { endedAt: null },
    select: {
      id: true,
      kind: true,
      startedAt: true,
      branch: { select: { code: true } },
      machine: { select: { code: true } },
    },
  });

  const stillOpenMachineKeys = new Set<string>();
  const stillOpenBranchCodes = new Set<string>();
  const closingIds: number[] = [];
  const touchingIds: number[] = [];
  /**
   * สาขาที่กำลังปิดเคสเครื่องดับ พร้อมเวลาที่เริ่มมีปัญหาครั้งแรกสุด
   *
   * ใช้ตอนสาขานั้นถูกย้ายไปเป็นสัญญาณหาย (ดับเกินเกณฑ์ = สายขาด)
   * ถ้าเปิดเคสใหม่โดยเริ่มนับจากศูนย์ สาขาที่ดับมาแล้วหลายวันจะกลายเป็นเพิ่งเสีย
   * SLA กับคะแนนหายเกลี้ยง ทั้งที่ปัญหาไม่เคยหาย แค่เปลี่ยนชื่อเรียก
   */
  const closingMachineOffSince = new Map<string, Date>();

  for (const outage of openOutages) {
    if (outage.kind === "MACHINE_OFF") {
      const key = `${outage.branch.code}|${outage.machine?.code ?? ""}`;
      if (offMachines.has(key)) {
        stillOpenMachineKeys.add(key);
        touchingIds.push(outage.id);
      } else {
        closingIds.push(outage.id);
        const since = closingMachineOffSince.get(outage.branch.code);
        if (!since || outage.startedAt < since) {
          closingMachineOffSince.set(outage.branch.code, outage.startedAt);
        }
      }
    } else {
      if (signalLostBranches.has(outage.branch.code)) {
        stillOpenBranchCodes.add(outage.branch.code);
        touchingIds.push(outage.id);
      } else closingIds.push(outage.id);
    }
  }

  const opening: {
    kind: OutageKind;
    branchId: number;
    machineId: number | null;
    startedAt: Date;
  }[] = [];
  for (const [key, row] of offMachines) {
    if (stillOpenMachineKeys.has(key)) continue;
    opening.push({
      kind: "MACHINE_OFF",
      branchId: branchIdByCode.get(row.branchCode)!,
      machineId: machineIdByKey.get(key)!,
      startedAt: snapshotAt,
    });
  }
  for (const code of signalLostBranches.keys()) {
    if (stillOpenBranchCodes.has(code)) continue;
    opening.push({
      kind: "SIGNAL_LOST",
      branchId: branchIdByCode.get(code)!,
      machineId: null,
      // สาขาที่เพิ่งถูกย้ายมาจากเครื่องดับ ให้นับเวลาต่อจากของเดิม ไม่ใช่เริ่มใหม่
      startedAt: closingMachineOffSince.get(code) ?? snapshotAt,
    });
  }

  // เขียนการเปลี่ยนสถานะทั้งหมดในทรานแซกชันเดียว ยอดที่แดชบอร์ดอ่านจะได้ไม่เห็นสภาพครึ่ง ๆ
  await prisma.$transaction(async (tx) => {
    // หายไปจากไฟล์ = ซ่อมเสร็จจริง ต่างจากเคสที่ถูกปิดเพราะสาขายกเลิก
    await tx.outage.updateMany({
      where: { id: { in: closingIds } },
      data: { endedAt: snapshotAt, closeReason: "REPAIRED" },
    });
    await tx.outage.updateMany({ where: { id: { in: touchingIds } }, data: { lastSeenAt: snapshotAt } });
    await tx.outage.createMany({ data: opening.map((o) => ({ ...o, lastSeenAt: snapshotAt })) });

    // อ่านสภาพหลังกระทบยอดเสร็จ เพื่อตรึงคะแนนของรอบนี้ไว้
    const openNow = await tx.outage.findMany({
      where: { endedAt: null },
      select: {
        kind: true,
        branchId: true,
        startedAt: true,
        branch: { select: { region: true, zone: true, ownership: true, grade: true } },
      },
    });

    const buckets = new Map<string, SnapshotBucket>();
    const breachBefore = new Date(snapshotAt.getTime() - SLA_HOURS * 3_600_000);

    for (const outage of openNow) {
      const key = `${outage.branchId}|${outage.kind}`;
      const bucket = buckets.get(key) ?? {
        branchId: outage.branchId,
        kind: outage.kind,
        region: outage.branch.region,
        zone: outage.branch.zone,
        ownership: outage.branch.ownership,
        grade: outage.branch.grade,
        cases: 0,
        score: 0,
        breached: 0,
      };
      bucket.cases += 1;
      bucket.score += outageScore(outage.kind, outage.startedAt, snapshotAt);
      if (outage.startedAt < breachBefore) bucket.breached += 1;
      buckets.set(key, bucket);
    }

    const rows = [...buckets.values()];
    const scoreOf = (kind: string) =>
      rows.filter((r) => r.kind === kind).reduce((sum, r) => sum + r.score, 0);
    const machineOffScore = scoreOf("MACHINE_OFF");
    const signalLostScore = scoreOf("SIGNAL_LOST");

    const record = await tx.machineImport.create({
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
        machineOffScore,
        signalLostScore,
        totalScore: machineOffScore + signalLostScore,
      },
    });

    if (rows.length > 0) {
      await tx.scoreSnapshot.createMany({
        data: rows.map((r) => ({ ...r, importId: record.id, snapshotAt })),
      });
    }
  });

  return plan;
}
