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
  /** ทีมที่ดูแลงาน CM — คอลัมน์ "ผู้ดูแล CM" */
  zone: string | null;
  /** ทีมที่ดูแลงาน PM — คอลัมน์ "ผู้ดูแล PM" ว่างได้ */
  pmTeam: string | null;
  grade: string | null;
  openedAt: Date | null;
  warrantyExpiresAt: Date | null;
  /** พิกัดจากคอลัมน์ GPS ("8.07475, 98.995222") — ว่างเมื่อไม่มีหรืออ่านไม่ออก */
  latitude: number | null;
  longitude: number | null;
}

export interface BranchParseResult {
  rows: BranchSheetRow[];
  rowsInFile: number;
  duplicateRows: number;
  /** รหัสที่มาซ้ำแบบข้อมูลไม่ตรงกัน ต้องให้คนตัดสิน ไม่ใช่ให้ระบบเลือกเงียบ ๆ */
  conflictingCodes: string[];
  errors: string[];
}

/**
 * ชื่อคอลัมน์ที่ยอมรับได้
 *
 * มีหลายชื่อต่อช่องเพราะไฟล์จริงที่ได้มาแต่ละรอบไม่ได้ใช้หัวตารางเดียวกัน —
 * ไฟล์ที่ทำจาก PivotTable ตั้งหัวคอลัมน์แรกว่า "Row Labels" และ "ผจก.ภาค"
 * มีจุดคั่นบ้างไม่มีบ้าง การไปไล่แก้ไฟล์ทุกรอบก่อนอัปโหลดคืองานที่จะถูกลืม
 */
const HEADER_ALIASES = {
  code: ["code", "crm_code", "branch_code", "รหัสสาขา", "row labels"],
  name: ["ชื่อสาขา", "name", "branch_name"],
  region: ["ผจกภาค", "ผจก.ภาค", "region", "ภาค"],
  zone: ["ผู้ดูแล cm", "ทีมช่าง", "zone", "โซน", "team"],
  pmTeam: ["ผู้ดูแล pm", "ทีม pm", "pm_team"],
  grade: ["grade", "เกรด"],
  openedAt: [
    "วันส่งมอบร้าน",
    "วันเปิดร้าน",
    "วันเปิดสาขา",
    "opened_at",
    "open_date",
    "opening_date",
  ],
  warrantyExpiresAt: ["วันหมดประกัน", "หมดประกัน", "warranty_expires", "warranty_end", "warranty_expiry"],
  latitude: ["gps", "พิกัด", "lat_long", "latitude"],
  longitude: ["longitude", "ลองจิจูด"],
} satisfies Record<keyof BranchSheetRow, string[]>;

/**
 * อ่านพิกัดจากช่องเดียวที่เขียนติดกันเป็น "lat, long"
 *
 * ไฟล์ทะเบียนเก็บพิกัดไว้ช่องเดียวแบบที่ก๊อปจาก Google Maps มาเลย
 * ไม่ได้แยกเป็นสองคอลัมน์ และค่าที่อยู่นอกประเทศไทยถือว่าผิด ไม่ใช่แค่แปลก —
 * สาขาที่พิกัดเพี้ยนจะทำให้ช่างรายงานตัวไม่ผ่านทั้งที่ยืนอยู่หน้าร้าน
 */
function parseLatLong(text: string): { latitude: number; longitude: number } | null {
  const parts = text.split(",").map((p) => p.trim());
  if (parts.length !== 2) return null;
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < 5 || latitude > 21 || longitude < 96 || longitude > 106) return null;
  return { latitude, longitude };
}

/**
 * อ่านวันที่จากเซลล์ ซึ่งมาได้หลายหน้าตา
 *
 * Excel ส่งมาเป็น Date object บ้าง ข้อความบ้าง และไฟล์ที่คนไทยทำมักใช้
 * พ.ศ. — 2569 ไม่ใช่ปีในอนาคตอีกห้าร้อยปี แต่คือ 2026 ถ้าไม่แปลงกลับ
 * วันหมดประกันจะกลายเป็นยังไม่หมดไปอีกห้าศตวรรษ
 */
function cellDate(value: ExcelJS.CellValue): Date | null {
  if (value === null || value === undefined || value === "") return null;

  const fromBuddhistYear = (d: Date): Date => {
    if (d.getFullYear() < 2400) return d;
    return new Date(Date.UTC(d.getFullYear() - 543, d.getMonth(), d.getDate()));
  };

  if (value instanceof Date) return fromBuddhistYear(value);

  const text = cellText(value).trim();
  if (!text) return null;

  // dd/mm/yyyy หรือ dd-mm-yyyy ที่คนกรอกเอง
  const thai = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (thai) {
    const [, day, month, year] = thai;
    const y = Number(year);
    return new Date(Date.UTC(y >= 2400 ? y - 543 : y, Number(month) - 1, Number(day)));
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : fromBuddhistYear(parsed);
}

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
  if (
    columnOf.region === undefined &&
    columnOf.zone === undefined &&
    columnOf.pmTeam === undefined &&
    columnOf.latitude === undefined
  ) {
    errors.push("ไม่พบคอลัมน์ ผจก.ภาค / ผู้ดูแล CM / ผู้ดูแล PM / GPS — ไฟล์นี้ไม่มีอะไรให้อัปเดต");
  }
  if (errors.length > 0) return { ...empty, errors };

  const read = (row: ExcelJS.Row, field: keyof BranchSheetRow): string => {
    const column = columnOf[field];
    return column === undefined ? "" : cellText(row.getCell(column).value).trim();
  };

  const readDate = (row: ExcelJS.Row, field: keyof BranchSheetRow): Date | null => {
    const column = columnOf[field];
    return column === undefined ? null : cellDate(row.getCell(column).value);
  };

  const byCode = new Map<string, BranchSheetRow>();
  const conflicting = new Set<string>();
  let rowsInFile = 0;

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const code = read(row, "code");
    if (!code) continue;
    rowsInFile += 1;

    // พิกัดมาเป็นช่องเดียว "lat, long" — ถ้าไฟล์แยกสองคอลัมน์ก็อ่านแบบนั้นได้เหมือนกัน
    const pair = parseLatLong(read(row, "latitude"));
    const splitLat = Number(read(row, "latitude"));
    const splitLong = Number(read(row, "longitude"));
    const coords =
      pair ??
      (columnOf.longitude !== undefined &&
      Number.isFinite(splitLat) &&
      Number.isFinite(splitLong) &&
      splitLat !== 0
        ? { latitude: splitLat, longitude: splitLong }
        : null);

    const entry: BranchSheetRow = {
      code,
      name: read(row, "name"),
      region: read(row, "region") || null,
      zone: read(row, "zone") || null,
      pmTeam: read(row, "pmTeam") || null,
      grade: read(row, "grade") || null,
      openedAt: readDate(row, "openedAt"),
      warrantyExpiresAt: readDate(row, "warrantyExpiresAt"),
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
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
  /** สาขาที่จะได้พิกัดจากไฟล์นี้ทั้งที่เดิมยังไม่มี — รายงานตัวด้วย GPS ได้เพิ่ม */
  newCoordinateCount: number;
  changedSample: { code: string; from: string; to: string }[];
  unchangedCount: number;
  /** สาขาที่มีในระบบแล้วแต่ไม่อยู่ในไฟล์นี้ — ไม่ถูกแตะต้อง */
  notInFileCount: number;
  regions: { name: string; branches: number }[];
  /** ทีมที่ดูแลงาน CM */
  zones: { name: string; branches: number }[];
  /** ทีมที่ดูแลงาน PM */
  pmTeams: { name: string; branches: number }[];
  /** สาขาที่ไม่ได้ระบุทีม PM — งาน PM ของสาขาเหล่านี้จะตั้งต้นด้วยทีม CM */
  noPmTeamCount: number;
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

  /**
   * ภาคที่สะกดต่างกันแต่น่าจะหมายถึงภาคเดียวกัน
   *
   * ไฟล์จริงมีทั้ง "เหนือ-อีสาน" และ "เหนือ อีสาน" ซึ่งระบบถือเป็นคนละภาค
   * ผลคือหัวหน้าภาคที่ตั้งไว้ภาคหนึ่งจะมองไม่เห็นสาขาที่สะกดอีกแบบเลย
   *
   * ไม่แก้ให้เงียบ ๆ เพราะเดาแทนคนไม่ได้ว่าอันไหนถูก แต่ต้องบอกให้เห็นก่อนกดบันทึก
   */
  const normalise = (name: string) => name.replace(/[\s\-–—]+/g, "").toLowerCase();
  const regionGroups = new Map<string, Set<string>>();
  for (const row of parsed.rows) {
    if (!row.region) continue;
    const key = normalise(row.region);
    if (!regionGroups.has(key)) regionGroups.set(key, new Set());
    regionGroups.get(key)!.add(row.region);
  }
  for (const names of regionGroups.values()) {
    if (names.size > 1) {
      warnings.push(
        `ภาคที่สะกดต่างกันแต่น่าจะเป็นภาคเดียวกัน: ${[...names].map((n) => `"${n}"`).join(" กับ ")} — ` +
          "ระบบถือเป็นคนละภาค หัวหน้าภาคจะเห็นแค่ฝั่งเดียว ควรแก้ที่ไฟล์ให้ตรงกัน"
      );
    }
  }

  const existing = await prisma.branch.findMany({
    select: { code: true, region: true, zone: true, latitude: true },
  });
  const byCode = new Map(existing.map((b) => [b.code, b]));

  // สาขาที่เดิมไม่มีพิกัดแล้วไฟล์นี้มีให้ — รายงานตัวด้วย GPS ได้เพิ่มเท่านี้
  const newCoordinateCount = parsed.rows.filter(
    (r) => r.latitude !== null && (byCode.get(r.code)?.latitude ?? null) === null
  ).length;

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
    pmTeams: count((r) => r.pmTeam),
    noPmTeamCount: parsed.rows.filter((r) => !r.pmTeam).length,
    newCoordinateCount,
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
  /**
   * ส่งทุกคอลัมน์เป็น text[] แล้วค่อยแปลงชนิดทีละค่าใน SQL
   *
   * ถ้าส่งเป็น null ล้วนทั้งอาร์เรย์ ไดรเวอร์เดาชนิดเป็น integer[] แล้ว
   * ::timestamp[] จะพังทันที ("cannot cast type integer[] to timestamp...")
   * ซึ่งเกิดจริงกับไฟล์ที่ไม่มีคอลัมน์วันหมดประกันมาเลย — ใช้สตริงว่างแทน null
   * แล้ว NULLIF กลับเป็น null ฝั่ง SQL ทำให้ชนิดของอาร์เรย์ชัดเจนเสมอ
   */
  const text = (v: string | null) => v ?? "";
  const stamp = (v: Date | null) => (v ? v.toISOString() : "");
  const num = (v: number | null) => (v === null ? "" : String(v));

  await prisma.$executeRaw`
    INSERT INTO "Branch" (
      "code", "name", "region", "zone", "pmTeam", "grade",
      "openedAt", "warrantyExpiresAt", "latitude", "longitude"
    )
    SELECT
      t.code,
      t.name,
      NULLIF(t.region, ''),
      NULLIF(t.zone, ''),
      NULLIF(t.pm_team, ''),
      NULLIF(t.grade, ''),
      NULLIF(t.opened_at, '')::timestamp,
      NULLIF(t.warranty, '')::timestamp,
      NULLIF(t.lat, '')::double precision,
      NULLIF(t.lng, '')::double precision
    FROM unnest(
      ${rows.map((r) => r.code)}::text[],
      ${rows.map((r) => r.name || r.code)}::text[],
      ${rows.map((r) => text(r.region))}::text[],
      ${rows.map((r) => text(r.zone))}::text[],
      ${rows.map((r) => text(r.pmTeam))}::text[],
      ${rows.map((r) => text(r.grade))}::text[],
      ${rows.map((r) => stamp(r.openedAt))}::text[],
      ${rows.map((r) => stamp(r.warrantyExpiresAt))}::text[],
      ${rows.map((r) => num(r.latitude))}::text[],
      ${rows.map((r) => num(r.longitude))}::text[]
    ) AS t(code, name, region, zone, pm_team, grade, opened_at, warranty, lat, lng)
    ON CONFLICT ("code") DO UPDATE SET
      "region" = COALESCE(EXCLUDED."region", "Branch"."region"),
      "zone"   = COALESCE(EXCLUDED."zone",   "Branch"."zone"),
      "pmTeam" = COALESCE(EXCLUDED."pmTeam", "Branch"."pmTeam"),
      "grade"  = COALESCE(EXCLUDED."grade",  "Branch"."grade"),
      -- ไฟล์ที่ไม่มีคอลัมน์เหล่านี้ต้องไม่ลบค่าที่เคยกรอกไว้ทิ้ง เหมือนกับ zone/grade
      "openedAt"          = COALESCE(EXCLUDED."openedAt",          "Branch"."openedAt"),
      "warrantyExpiresAt" = COALESCE(EXCLUDED."warrantyExpiresAt", "Branch"."warrantyExpiresAt"),
      -- พิกัดในไฟล์ถือเป็นค่าจริง ทับของเดิมได้ แต่ไฟล์ที่ไม่มีพิกัดต้องไม่ล้างทิ้ง
      -- ไม่งั้นอัปโหลดไฟล์เก่าทีเดียว ช่างทั้งบริษัทรายงานตัวด้วย GPS ไม่ได้
      "latitude"  = COALESCE(EXCLUDED."latitude",  "Branch"."latitude"),
      "longitude" = COALESCE(EXCLUDED."longitude", "Branch"."longitude")
  `;

  return plan;
}
