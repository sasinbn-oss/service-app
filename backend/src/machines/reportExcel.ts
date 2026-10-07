/**
 * แปลงรายงานเป็นไฟล์ Excel
 *
 * ใช้ exceljs ตัวเดียวกับที่อ่านไฟล์นำเข้า ไม่ต้องเพิ่ม dependency
 *
 * เขียนเป็นตารางเปล่า ๆ ที่คนเอาไป pivot ต่อได้ ไม่ได้ตกแต่งให้สวย
 * เพราะคนที่ขอไฟล์ Excel คือคนที่จะเอาไปทำอะไรต่อ ไม่ใช่คนที่จะอ่านในไฟล์นี้
 */
import ExcelJS from "exceljs";
import type { DailyReport, MonthlyReport, PartsReport, WeeklyReport } from "./reports";

type AnyReport = DailyReport | WeeklyReport | MonthlyReport | PartsReport;

function thaiDateTime(d: Date) {
  return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
}

function addTitle(sheet: ExcelJS.Worksheet, title: string, subtitle: string) {
  sheet.addRow([title]).font = { bold: true, size: 14 };
  sheet.addRow([subtitle]).font = { size: 10, color: { argb: "FF666666" } };
  sheet.addRow([]);
}

function addTable(sheet: ExcelJS.Worksheet, headers: string[], rows: (string | number | null)[][]) {
  const head = sheet.addRow(headers);
  head.font = { bold: true };
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
  });
  for (const row of rows) sheet.addRow(row.map((v) => (v === null ? "" : v)));
  headers.forEach((h, i) => {
    const column = sheet.getColumn(sheet.columnCount - headers.length + i + 1);
    const longest = Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length));
    column.width = Math.min(46, Math.max(10, longest + 2));
  });
  sheet.addRow([]);
}

export async function reportToWorkbook(report: AnyReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Service App";
  wb.created = report.generatedAt;

  if (report.kind === "daily") {
    const sheet = wb.addWorksheet("ใบงานวันนี้");
    addTitle(sheet, report.title, `${report.scope} · ออกเมื่อ ${thaiDateTime(report.generatedAt)}`);
    addTable(
      sheet,
      ["รายการ", "จำนวน"],
      [
        ["เคสค้างทั้งหมด", report.summary.openTotal],
        ["ช่างลงมือได้", report.summary.actionable],
        ["รอฝั่งลูกค้า", report.summary.waitingCustomer],
        ["คะแนนสะสม", report.summary.score],
      ]
    );
    for (const section of report.sections) {
      sheet.addRow([`${section.title} (${section.rows.length})`]).font = { bold: true };
      if (section.hint) sheet.addRow([section.hint]).font = { size: 9, color: { argb: "FF888888" } };
      if (section.rows.length === 0) {
        sheet.addRow(["ไม่มีรายการ"]);
        sheet.addRow([]);
        continue;
      }
      addTable(
        sheet,
        ["รหัสสาขา", "ชื่อสาขา", "เครื่อง", "ยี่ห้อ", "ทีมช่าง", "ดับมาแล้ว (วัน)", "คะแนน", "สถานะ", "อะไหล่ที่รอ", "วันนัด", "อาการ"],
        section.rows.map((r) => [
          r.branchCode, r.branchName, r.machineCode, r.machineBrand, r.zone,
          r.days, r.score, r.workStatusLabel, r.parts, r.scheduledVisitAt, r.symptom,
        ])
      );
    }
  }

  if (report.kind === "weekly") {
    const sheet = wb.addWorksheet("สรุปรายสัปดาห์");
    addTitle(sheet, report.title, `ออกเมื่อ ${thaiDateTime(report.generatedAt)}`);
    addTable(
      sheet,
      ["รายการ", "ค่า"],
      [
        ["คะแนนสะสม", report.summary.score],
        ["คะแนนรอบเทียบ", report.summary.previousScore ?? "ยังไม่มีข้อมูลเทียบ"],
        ["เคสค้าง", report.summary.openTotal],
        ["สาขาที่มีปัญหา", report.summary.branches],
        ["เลย SLA", report.summary.breached],
        ["ยังไม่มีใครระบุสถานะ", report.summary.noStatus],
        ["เปิดใหม่ 7 วัน", report.summary.openedThisWeek],
        ["ปิดได้ 7 วัน", report.summary.closedThisWeek],
      ]
    );
    const cols = ["กลุ่ม", "คะแนน", "เคส", "สาขา", "เลย SLA", "ไม่มีสถานะ", "เลยวันนัด"];
    const toRows = (list: typeof report.byRegion) =>
      list.map((g) => [g.label, g.score, g.cases, g.branches, g.breached, g.noStatus, g.overdueVisit]);
    sheet.addRow(["แยกตามภาค"]).font = { bold: true };
    addTable(sheet, cols, toRows(report.byRegion));
    sheet.addRow(["แยกตามทีมช่าง"]).font = { bold: true };
    addTable(sheet, cols, toRows(report.byZone));
    sheet.addRow(["แยกตามเจ้าของ"]).font = { bold: true };
    addTable(sheet, cols, toRows(report.byOwnership));
  }

  if (report.kind === "monthly") {
    const sheet = wb.addWorksheet("ภาพรวมผู้บริหาร");
    addTitle(sheet, report.title, `ย้อนหลัง ${report.periodDays} วัน · ออกเมื่อ ${thaiDateTime(report.generatedAt)}`);
    if (!report.hasHistory) {
      sheet.addRow(["ยังไม่มีเคสที่ปิดแล้วในช่วงนี้ ตัวเลขด้านล่างจึงยังคำนวณไม่ได้"]).font = {
        bold: true, color: { argb: "FFA3320A" },
      };
      sheet.addRow([]);
    }
    addTable(
      sheet,
      ["รายการ", "ค่า"],
      [
        ["เคสที่ปิดแล้ว", report.summary.closed],
        [`ปิดทันภายใน ${report.summary.slaHours} ชม.`, report.summary.withinSlaPercent === null ? "—" : `${report.summary.withinSlaPercent}%`],
        ["เวลาเฉลี่ยที่ใช้ซ่อม (วัน)", report.summary.avgDays ?? "—"],
      ]
    );
    sheet.addRow(["เวลาเฉลี่ยแยกตามภาค"]).font = { bold: true };
    addTable(
      sheet,
      ["ภาค", "เคสที่ปิด", "เฉลี่ย (วัน)", "ปิดทัน SLA %"],
      report.byRegion.map((g) => [g.label, g.closed, g.avgDays, g.withinSlaPercent])
    );
    sheet.addRow(["สาขาที่เสียซ้ำ (90 วัน)"]).font = { bold: true };
    addTable(
      sheet,
      ["รหัสสาขา", "ชื่อสาขา", "ภาค", "จำนวนครั้ง"],
      report.repeatBranches.map((b) => [b.code, b.name, b.region, b.times])
    );
    sheet.addRow(["เครื่องที่เสียซ้ำ (180 วัน)"]).font = { bold: true };
    addTable(
      sheet,
      ["รหัสสาขา", "ชื่อสาขา", "เครื่อง", "ยี่ห้อ", "จำนวนครั้ง"],
      report.repeatMachines.map((m) => [m.branchCode, m.branchName, m.machineCode, m.brand, m.times])
    );
    sheet.addRow(["คะแนนย้อนหลังรายรอบอัปโหลด"]).font = { bold: true };
    addTable(
      sheet,
      ["เวลา", "เครื่องดับ", "สัญญาณหาย", "รวม"],
      report.trend.map((t) => [thaiDateTime(t.at), t.machineOff, t.signalLost, t.total])
    );
  }

  if (report.kind === "parts") {
    const sheet = wb.addWorksheet("อะไหล่ที่ต้องสั่ง");
    addTitle(sheet, report.title, `ออกเมื่อ ${thaiDateTime(report.generatedAt)}`);
    addTable(
      sheet,
      ["รายการ", "ค่า"],
      [
        ["ชนิดอะไหล่", report.summary.distinctParts],
        ["จำนวนรวมที่ต้องใช้", report.summary.totalQuantity],
        ["เคสที่รออยู่", report.summary.cases],
        ["สาขาที่รออยู่", report.summary.branches],
      ]
    );
    addTable(
      sheet,
      ["รหัสอะไหล่", "ชื่ออะไหล่", "ยี่ห้อ", "ต้องใช้", "เคส", "รอนานสุด (วัน)", "สาขาที่รอ"],
      report.parts.map((p) => [
        p.partCode, p.name, p.brand, p.quantity, p.cases, p.oldestDays, p.branches.join(" "),
      ])
    );
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

/** แถวของหน้าติดตามเครื่องเสีย — ใช้เฉพาะช่องที่ลงไฟล์ (ทั้งแท็บเครื่องดับและสัญญาณหาย) */
export interface OutageExportRow {
  branchCode: string;
  branchName: string;
  region: string | null;
  ownership: string | null;
  zone: string | null;
  grade: string | null;
  machineCode?: string;
  machineType?: string;
  machineBrand?: string | null;
  machineCount?: number;
  startedAt: Date;
  slaHours: number;
  breached: boolean;
  score: number;
  symptom: string | null;
  workStatusLabel: string | null;
  scheduledVisitAt: string | null;
  parts: { partCode: string; quantity: number }[];
  workOrder: { code: string; statusLabel: string; assignedToName: string | null } | null;
}

/**
 * รายการบนหน้าติดตามเครื่องเสียเป็นไฟล์ Excel — แถวละเคส ตามลำดับที่เห็นบนจอ
 *
 * ชั่วโมงกับวันแยกเป็นตัวเลขคนละช่อง ไม่ได้เขียนเป็น "29 วัน 7 ชม." เพราะคนที่ส่งออก
 * มักเอาไปเรียงหรือกรองต่อใน Excel ซึ่งทำกับข้อความไม่ได้
 */
export async function outagesToWorkbook(
  tab: "machines" | "signal",
  rows: OutageExportRow[],
  opts: { at: Date; filters?: string; slaHours: number }
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Service App";
  wb.created = opts.at;
  const machines = tab === "machines";
  const sheet = wb.addWorksheet(machines ? "เครื่องดับ" : "สัญญาณหาย");
  addTitle(
    sheet,
    machines ? "เครื่องดับ (Power Off)" : "สาขาสัญญาณหาย (Offline Telemetry)",
    [`ข้อมูล ณ ${thaiDateTime(opts.at)}`, `${rows.length} รายการ`, opts.filters].filter(Boolean).join(" · ")
  );
  const type = (t?: string) => (t === "WASHER" ? "เครื่องซัก" : t === "DRYER" ? "เครื่องอบ" : t ?? "");
  addTable(
    sheet,
    [
      "รหัสสาขา", "ชื่อสาขา", "เจ้าของ", "ภาค", "ทีมช่าง", "Grade",
      ...(machines ? ["เครื่อง", "ชนิด", "ยี่ห้อ"] : ["เครื่องในสาขา"]),
      "เริ่มดับ", "ดับมาแล้ว (ชม.)", "ดับมาแล้ว (วัน)", `เกิน SLA ${opts.slaHours} ชม.`, "คะแนน",
      "สถานะ", "อาการ", "อะไหล่ที่รอ", "วันนัด", "ใบงาน", "สถานะใบงาน", "ผู้รับงาน",
    ],
    rows.map((r) => [
      r.branchCode, r.branchName, r.ownership, r.region, r.zone, r.grade,
      ...(machines ? [r.machineCode ?? "", type(r.machineType), r.machineBrand ?? ""] : [r.machineCount ?? 0]),
      thaiDateTime(r.startedAt), r.slaHours, Math.floor(r.slaHours / 24), r.breached ? "เกิน" : "", r.score,
      r.workStatusLabel, r.symptom,
      r.parts.map((p) => (p.quantity > 1 ? `${p.partCode} x${p.quantity}` : p.partCode)).join(", ") || null,
      r.scheduledVisitAt, r.workOrder?.code ?? null, r.workOrder?.statusLabel ?? null, r.workOrder?.assignedToName ?? null,
    ])
  );
  // หัวตารางค้างไว้ตอนเลื่อน — ไฟล์มีหลายร้อยแถว
  sheet.views = [{ state: "frozen", ySplit: 4 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
