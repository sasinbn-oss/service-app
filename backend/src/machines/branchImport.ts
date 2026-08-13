/**
 * นำเข้าทะเบียนสาขา — ภาค (ผจกภาค) และทีมช่าง
 *
 * คนละไฟล์และคนละจังหวะกับรายงานเครื่อง: ไฟล์นี้อัปเดตราวสัปดาห์ละครั้งเมื่อมีการ
 * เปลี่ยนแปลงสาขาหรือการแบ่งทีม ส่วนรายงานเครื่องมาวันละสองครั้ง
 *
 * ไฟล์นี้แตะเฉพาะข้อมูลทะเบียนสาขา ไม่ยุ่งกับสถานะเครื่องหรือเคสที่เปิดค้างอยู่เลย
 */
import ExcelJS from "exceljs";
import { prisma } from "../prisma";

export interface BranchSheetRow {
  code: string;
  name: string;
  region: string | null;
  zone: string | null;
  grade: string | null;
}

export interface BranchParseResult {
  rows: BranchSheetRow[];
  rowsInFile: number;
  duplicateRows: number;
  /** รหัสที่มาซ้ำแบบข้อมูลไม่ตรงกัน ต้องให้คนตัดสิน ไม่ใช่ให้ระบบเลือกเงียบ ๆ */
  conflictingCodes: string[];
  errors: string[];
}

const HEADER_ALIASES = {
  code: ["code", "crm_code", "branch_code", "รหัสสาขา"],
  name: ["ชื่อสาขา", "name", "branch_name"],
  region: ["ผจกภาค", "region", "ภาค"],
  zone: ["ทีมช่าง", "zone", "โซน", "team"],
  grade: ["grade", "เกรด"],
} satisfies Record<keyof BranchSheetRow, string[]>;

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

export async function parseBranchWorkbook(buffer: Buffer): Promise<BranchParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  const empty = { rows: [], rowsInFile: 0, duplicateRows: 0, conflictingCodes: [] };
  if (!sheet) return { ...empty, errors: ["ไฟล์ไม่มีชีตข้อมูล"] };

  const headerRow = sheet.getRow(1);
  const columnOf: Partial<Record<keyof BranchSheetRow, number>> = {};
  for (let c = 1; c <= sheet.columnCount; c++) {
    const header = cellText(headerRow.getCell(c).value).trim().toLowerCase();
    if (!header) continue;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      const key = field as keyof BranchSheetRow;
      if (columnOf[key] === undefined && aliases.some((a) => a.toLowerCase() === header)) {
        columnOf[key] = c;
      }
    }
  }

  const errors: string[] = [];
  if (columnOf.code === undefined) errors.push("ไม่พบคอลัมน์ code ในไฟล์");
  if (columnOf.region === undefined && columnOf.zone === undefined) {
    errors.push("ไม่พบคอลัมน์ ผจกภาค และ ทีมช่าง — ไฟล์นี้ไม่มีอะไรให้อัปเดต");
  }
  if (errors.length > 0) return { ...empty, errors };

  const read = (row: ExcelJS.Row, field: keyof BranchSheetRow): string => {
    const column = columnOf[field];
    return column === undefined ? "" : cellText(row.getCell(column).value).trim();
  };

  const byCode = new Map<string, BranchSheetRow>();
  const conflicting = new Set<string>();
  let rowsInFile = 0;

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const code = read(row, "code");
    if (!code) continue;
    rowsInFile += 1;

    const entry: BranchSheetRow = {
      code,
      name: read(row, "name"),
      region: read(row, "region") || null,
      zone: read(row, "zone") || null,
      grade: read(row, "grade") || null,
    };

    // รหัสเดียวกันมาสองครั้งแล้วภาค/ทีมไม่ตรงกัน แปลว่าต้นทางมีปัญหา
    // ระบบเก็บอันหลังไว้แต่ต้องรายงานให้เห็น ไม่ใช่เลือกให้เงียบ ๆ
    const existing = byCode.get(code);
    if (existing && (existing.region !== entry.region || existing.zone !== entry.zone)) {
      conflicting.add(code);
    }
    byCode.set(code, entry);
  }

  return {
    rows: [...byCode.values()],
    rowsInFile,
    duplicateRows: rowsInFile - byCode.size,
    conflictingCodes: [...conflicting],
    errors: [],
  };
}

export interface BranchImportPlan {
  rowsInFile: number;
  duplicateRows: number;
  uniqueRows: number;
  newBranchCount: number;
  newBranchSample: string[];
  /** สาขาเดิมที่ค่าภาคหรือทีมช่างจะเปลี่ยนไปจากของเดิม */
  changedCount: number;
  changedSample: { code: string; from: string; to: string }[];
  unchangedCount: number;
  /** สาขาที่มีในระบบแล้วแต่ไม่อยู่ในไฟล์นี้ — ไม่ถูกแตะต้อง */
  notInFileCount: number;
  regions: { name: string; branches: number }[];
  zones: { name: string; branches: number }[];
  errors: string[];
  warnings: string[];
}

function describe(region: string | null, zone: string | null) {
  return `${region ?? "—"} / ${zone ?? "—"}`;
}

export async function planBranchImport(parsed: BranchParseResult): Promise<BranchImportPlan> {
  const warnings: string[] = [];
  if (parsed.duplicateRows > 0) {
    warnings.push(`ไฟล์มีรหัสสาขาซ้ำ ${parsed.duplicateRows} แถว ระบบใช้แถวล่างสุดของแต่ละรหัส`);
  }
  if (parsed.conflictingCodes.length > 0) {
    warnings.push(
      `รหัสที่ซ้ำแล้วข้อมูลไม่ตรงกัน: ${parsed.conflictingCodes.join(", ")} — ` +
        "ระบบเลือกแถวล่างสุดให้ ควรแก้ที่ต้นทางเพื่อไม่ให้กำกวม"
    );
  }

  const existing = await prisma.branch.findMany({
    select: { code: true, region: true, zone: true },
  });
  const byCode = new Map(existing.map((b) => [b.code, b]));

  const changedSample: { code: string; from: string; to: string }[] = [];
  let changedCount = 0;
  let unchangedCount = 0;
  const newBranches: string[] = [];

  for (const row of parsed.rows) {
    const current = byCode.get(row.code);
    if (!current) {
      newBranches.push(row.code);
      continue;
    }
    const from = describe(current.region, current.zone);
    const to = describe(row.region ?? current.region, row.zone ?? current.zone);
    if (from === to) unchangedCount += 1;
    else {
      changedCount += 1;
      if (changedSample.length < 10) changedSample.push({ code: row.code, from, to });
    }
  }

  const fileCodes = new Set(parsed.rows.map((r) => r.code));
  const notInFileCount = existing.filter((b) => !fileCodes.has(b.code)).length;

  const count = (pick: (r: BranchSheetRow) => string | null) => {
    const tally = new Map<string, number>();
    for (const row of parsed.rows) {
      const key = pick(row);
      if (key) tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    return [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, branches]) => ({ name, branches }));
  };

  return {
    rowsInFile: parsed.rowsInFile,
    duplicateRows: parsed.duplicateRows,
    uniqueRows: parsed.rows.length,
    newBranchCount: newBranches.length,
    newBranchSample: newBranches.slice(0, 20),
    changedCount,
    changedSample,
    unchangedCount,
    notInFileCount,
    regions: count((r) => r.region),
    zones: count((r) => r.zone),
    errors: parsed.errors,
    warnings,
  };
}

export async function applyBranchImport(parsed: BranchParseResult): Promise<BranchImportPlan> {
  const plan = await planBranchImport(parsed);
  if (plan.errors.length > 0) return plan;

  const rows = parsed.rows;

  // เขียนทั้งหมดในคำสั่งเดียวเหมือนการนำเข้ารายงานเครื่อง เพราะไฟล์นี้มีกว่าพันสาขา
  //
  // ชื่อสาขาตั้งเฉพาะตอนสร้างใหม่ ของเดิมไม่แตะ เพราะชื่อในไฟล์ทะเบียนมีรหัสภายใน
  // ต่อท้ายอยู่ ("ถนนอุตรกิจ กระบี่ 00031 KBI009 C0006") ส่วนชื่อที่มาจากรายงานเครื่อง
  // สะอาดกว่าและเป็นชื่อที่ขึ้นบนแดชบอร์ด
  await prisma.$executeRaw`
    INSERT INTO "Branch" ("code", "name", "region", "zone", "grade")
    SELECT * FROM unnest(
      ${rows.map((r) => r.code)}::text[],
      ${rows.map((r) => r.name || r.code)}::text[],
      ${rows.map((r) => r.region)}::text[],
      ${rows.map((r) => r.zone)}::text[],
      ${rows.map((r) => r.grade)}::text[]
    )
    ON CONFLICT ("code") DO UPDATE SET
      "region" = COALESCE(EXCLUDED."region", "Branch"."region"),
      "zone"   = COALESCE(EXCLUDED."zone",   "Branch"."zone"),
      "grade"  = COALESCE(EXCLUDED."grade",  "Branch"."grade")
  `;

  return plan;
}
