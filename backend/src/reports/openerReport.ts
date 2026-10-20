/**
 * รายงานใบงานแยกตามผู้เปิด (เจ้าของงานขอ ต.ค. 69 — เลือกช่วงวันที่เปิดใบงาน แล้วออกเป็น Excel)
 *
 * หน้าตาไฟล์ตามตัวอย่างที่เจ้าของงานเลือก:
 *   ชีต "สรุปตามผู้เปิด" 1 แถวต่อคน + แถวรวม · ชีตรายการใบงานทั้งหมด · 1 ชีตต่อผู้เปิด
 * ใบที่ไม่มีผู้เปิด (createdById ว่าง — สร้างอัตโนมัติ หรือบัญชีถูกลบ) รวมเป็น "ระบบ" ไม่ทิ้งไป
 * ตัวเลขสรุปต้องรวมได้เท่ากับจำนวนแถวในชีตรายการเสมอ คนจะเอาไปกระทบยอดกัน
 *
 * วันที่เป็นวันตามเวลาไทย ทั้งสองปลายนับรวม (1–15 ต.ค. = ตั้งแต่ 1 ต.ค. 00:00 ถึงก่อน 16 ต.ค. 00:00)
 * — ใบที่เปิดตอนตีหนึ่งของวันที่ 15 ตามเวลาไทยเป็นวันที่ 14 ตาม UTC ถ้าตัดตาม UTC จะหลุดไปวันก่อน
 */
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import {
  JOB_TYPE_LABELS,
  WORK_STATUS_LABELS,
  WORK_ORDER_PRIORITY_LABELS,
  WORK_ORDER_RESULT_LABELS,
  WORK_ORDER_STATUS_LABELS,
} from "../utils/constants";

/** เวลาไทย UTC+7 ไม่มีเวลาออมแสง — แปลงวันที่ด้วยการเลื่อนคงที่ได้ */
const BKK_MS = 7 * 3600_000;
export const bkkDayStart = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) - BKK_MS);

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "แอดมิน",
  SUPER_ADMIN: "Super Admin",
  PARTS_ADMIN: "Admin Spare Part",
  SUPERVISOR: "หัวหน้าภาค",
  EMPLOYEE: "ช่าง",
};
const SYSTEM = "ระบบ (ไม่มีผู้เปิด)";
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "1 ต.ค. 2569 08:40" — เขียนเองแทน toLocaleString เพื่อให้รูปแบบตรงกันทุกเครื่อง (Excel เอาไปกรองต่อ) */
export function thaiDateTime(d: Date | null, withTime = true) {
  if (!d) return "";
  const t = new Date(d.getTime() + BKK_MS);
  const day = `${t.getUTCDate()} ${TH_MONTH[t.getUTCMonth()]} ${t.getUTCFullYear() + 543}`;
  if (!withTime) return day;
  return `${day} ${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}
const thaiYmd = (ymd: string) => thaiDateTime(bkkDayStart(ymd), false);

type Bucket = "open" | "done" | "cancelled";
const bucketOf = (status: string): Bucket => (status === "DONE" ? "done" : status === "CANCELLED" ? "cancelled" : "open");

export interface OpenerSummary {
  /** null = ระบบ (ไม่มีผู้เปิด) */
  userId: number | null;
  name: string;
  employeeCode: string | null;
  role: string;
  region: string | null;
  total: number;
  fromBoard: number;
  manual: number;
  urgent: number;
  open: number;
  done: number;
  cancelled: number;
}

export interface OpenerReport {
  from: string;
  to: string;
  generatedAt: Date;
  /** คำบอกขอบเขต — "ทุกภาค" / "ภาคที่ดูแล" ใส่ในไฟล์ให้คนอ่านรู้ว่าเห็นไม่ครบเพราะสิทธิ์ ไม่ใช่เพราะไม่มีงาน */
  scopeLabel: string;
  openerLabel: string;
  summary: OpenerSummary[];
  totals: Omit<OpenerSummary, "userId" | "name" | "employeeCode" | "role" | "region">;
  rows: Row[];
}

interface Row {
  openerKey: string;
  opener: string;
  openerRole: string;
  createdAt: Date;
  code: string;
  title: string;
  jobType: string;
  branchCode: string;
  branchName: string;
  symptom: string;
  /** สถานะแบบในกล่อง "อาการ / สถานะ" ของหน้าใบงาน — สถานะย่อย ไม่มีก็ใช้ขั้นของใบงาน */
  workStatus: string;
  region: string;
  team: string;
  machine: string;
  priority: string;
  source: string;
  status: string;
  closedAt: Date | null;
  result: string;
}

export async function buildOpenerReport(opts: {
  from: string;
  to: string;
  /** undefined = ทุกคน · null = เฉพาะใบที่ไม่มีผู้เปิด */
  openerId?: number | null;
  scope: Prisma.WorkOrderWhereInput | null;
  scopeLabel: string;
}): Promise<OpenerReport> {
  const gte = bkkDayStart(opts.from);
  const lt = new Date(bkkDayStart(opts.to).getTime() + 24 * 3600_000);
  const where: Prisma.WorkOrderWhereInput = {
    AND: [
      { createdAt: { gte, lt } },
      // ใบทดสอบไม่ใช่งานจริง — นับรวมแล้วตัวเลขของแอดมินที่ลองระบบจะพองเกินจริง
      { isTest: false },
      ...(opts.scope ? [opts.scope] : []),
      ...(opts.openerId === undefined ? [] : [{ createdById: opts.openerId }]),
    ],
  };
  const list = await prisma.workOrder.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      code: true,
      title: true,
      jobType: true,
      priority: true,
      source: true,
      status: true,
      createdAt: true,
      closedAt: true,
      closeResult: true,
      symptom: true,
      workStatus: true,
      assignedTeam: true,
      branch: { select: { code: true, name: true, region: true, zone: true } },
      machine: { select: { code: true } },
      createdBy: { select: { id: true, name: true, employeeCode: true, role: true, region: true } },
    },
  });

  const byUser = new Map<string, OpenerSummary>();
  const rows: Row[] = [];
  for (const w of list) {
    const u = w.createdBy;
    const key = u ? `u${u.id}` : "system";
    let s = byUser.get(key);
    if (!s) {
      s = {
        userId: u?.id ?? null,
        name: u?.name ?? SYSTEM,
        employeeCode: u?.employeeCode ?? null,
        role: u ? ROLE_LABELS[u.role] ?? u.role : "—",
        region: u?.region ?? null,
        total: 0,
        fromBoard: 0,
        manual: 0,
        urgent: 0,
        open: 0,
        done: 0,
        cancelled: 0,
      };
      byUser.set(key, s);
    }
    s.total += 1;
    if (w.source === "OUTAGE") s.fromBoard += 1;
    else s.manual += 1;
    if (w.priority === "URGENT") s.urgent += 1;
    s[bucketOf(w.status)] += 1;
    rows.push({
      openerKey: key,
      opener: s.name,
      openerRole: s.role,
      createdAt: w.createdAt,
      code: w.code,
      title: w.title,
      jobType: JOB_TYPE_LABELS[w.jobType] ?? w.jobType,
      branchCode: w.branch.code,
      branchName: w.branch.name,
      symptom: w.symptom ?? "",
      // กฎเดียวกับหน้าใบงาน (WorkOrderDetailScreen) — ไฟล์กับหน้าจอต้องพูดเหมือนกัน
      workStatus: w.workStatus
        ? WORK_STATUS_LABELS[w.workStatus] ?? w.workStatus
        : WORK_ORDER_STATUS_LABELS[w.status] ?? w.status,
      region: w.branch.region ?? "",
      team: w.assignedTeam ?? w.branch.zone ?? "",
      machine: w.machine?.code ?? "",
      priority: WORK_ORDER_PRIORITY_LABELS[w.priority] ?? w.priority,
      source: w.source === "OUTAGE" ? "จากกระดาน" : "เปิดเอง",
      status: WORK_ORDER_STATUS_LABELS[w.status] ?? w.status,
      closedAt: w.status === "DONE" ? w.closedAt : null,
      result: w.status === "DONE" && w.closeResult ? WORK_ORDER_RESULT_LABELS[w.closeResult] ?? w.closeResult : "",
    });
  }
  // เปิดมากสุดขึ้นก่อน · "ระบบ" อยู่ท้ายเสมอ ไม่ใช่คน
  const summary = [...byUser.values()].sort(
    (a, b) => Number(a.userId === null) - Number(b.userId === null) || b.total - a.total || a.name.localeCompare(b.name, "th")
  );
  const sum = (k: keyof OpenerSummary) => summary.reduce((n, s) => n + (s[k] as number), 0);
  const opener =
    opts.openerId === undefined ? "ทุกคน" : opts.openerId === null ? SYSTEM : summary[0]?.name ?? `ผู้ใช้ #${opts.openerId}`;
  return {
    from: opts.from,
    to: opts.to,
    generatedAt: new Date(),
    scopeLabel: opts.scopeLabel,
    openerLabel: opener,
    summary,
    totals: {
      total: sum("total"),
      fromBoard: sum("fromBoard"),
      manual: sum("manual"),
      urgent: sum("urgent"),
      open: sum("open"),
      done: sum("done"),
      cancelled: sum("cancelled"),
    },
    rows: rows.sort((a, b) => a.opener.localeCompare(b.opener, "th") || a.createdAt.getTime() - b.createdAt.getTime()),
  };
}

// ── Excel ─────────────────────────────────────────────

const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FC" } };
// อาการกับสถานะต่อท้ายชื่อสาขา (เจ้าของงานขอ ต.ค. 69) — อ่านแถวเดียวรู้ว่าที่ไหน เป็นอะไร ติดอยู่ตรงไหน
const DETAIL_HEAD = ["วันที่เปิด", "เลขใบงาน", "เรื่อง", "ประเภทงาน", "รหัสสาขา", "ชื่อสาขา", "อาการ", "สถานะ", "ภาค", "ทีมช่าง", "เครื่อง", "ความเร่งด่วน", "ที่มา", "สถานะปัจจุบัน", "วันที่ปิด", "ผลปิดงาน"];
const detail = (r: Row) => [
  thaiDateTime(r.createdAt), r.code, r.title, r.jobType, r.branchCode, r.branchName, r.symptom, r.workStatus, r.region, r.team,
  r.machine, r.priority, r.source, r.status, thaiDateTime(r.closedAt), r.result,
];

export function title(sheet: ExcelJS.Worksheet, text: string, sub: string) {
  sheet.addRow([text]).font = { bold: true, size: 14 };
  sheet.addRow([sub]).font = { size: 10, color: { argb: "FF666666" } };
  sheet.addRow([]);
}

export function table(sheet: ExcelJS.Worksheet, headers: string[], rows: (string | number)[][], filter = true) {
  const head = sheet.addRow(headers);
  head.font = { bold: true };
  head.eachCell((c) => (c.fill = HEAD_FILL));
  for (const r of rows) sheet.addRow(r);
  headers.forEach((h, i) => {
    const longest = Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length));
    sheet.getColumn(i + 1).width = Math.min(44, Math.max(9, longest + 2));
  });
  // หัวตารางค้างไว้ตอนเลื่อน และกรองได้ทุกคอลัมน์ — คนที่ขอ Excel คือคนที่จะเอาไปกรอง/pivot ต่อ
  // อาการหลายบรรทัด (สาเหตุ/แก้ไข/หมายเหตุ) — ตัดบรรทัดในช่อง ไม่งั้นเห็นแค่บรรทัดแรกยาวทะลุ
  const symptomCol = headers.indexOf("อาการ") + 1;
  if (symptomCol > 0) {
    sheet.getColumn(symptomCol).width = 44;
    sheet.getColumn(symptomCol).alignment = { wrapText: true, vertical: "top" };
  }
  sheet.views = [{ state: "frozen", ySplit: head.number }];
  if (filter && rows.length) {
    sheet.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number + rows.length, column: headers.length } };
  }
}

/** ชื่อชีต Excel: ไม่เกิน 31 ตัว ห้าม : \ / ? * [ ] และห้ามซ้ำ (คนชื่อต้นเหมือนกันมีจริง) */
export function sheetName(base: string, used: Set<string>) {
  const clean = base.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 28) || "ไม่มีชื่อ";
  let name = clean;
  for (let i = 2; used.has(name); i++) name = `${clean.slice(0, 26)} ${i}`;
  used.add(name);
  return name;
}

export async function openerReportWorkbook(r: OpenerReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OTTERI Service";
  wb.created = r.generatedAt;
  const sub =
    `ช่วงวันที่เปิดใบงาน ${thaiYmd(r.from)} – ${thaiYmd(r.to)} · ผู้เปิด: ${r.openerLabel} · ${r.scopeLabel}` +
    ` · ออกเมื่อ ${thaiDateTime(r.generatedAt)}`;
  const used = new Set<string>();

  const s1 = wb.addWorksheet(sheetName("สรุปตามผู้เปิด", used));
  title(s1, "รายงานใบงานแยกตามผู้เปิด", sub);
  table(
    s1,
    ["ผู้เปิด", "รหัสพนักงาน", "บทบาท", "ภาคที่ดูแล", "เปิดทั้งหมด", "จากกระดาน", "เปิดเอง", "ด่วน", "ยังค้าง", "ปิดแล้ว", "ยกเลิก"],
    r.summary.map((s) => [
      s.name, s.employeeCode ?? "—", s.role, s.region ?? "—", s.total, s.fromBoard, s.manual, s.urgent, s.open, s.done, s.cancelled,
    ]),
    false
  );
  const t = r.totals;
  const total = s1.addRow(["รวม", "", "", "", t.total, t.fromBoard, t.manual, t.urgent, t.open, t.done, t.cancelled]);
  total.font = { bold: true };
  total.eachCell((c) => (c.fill = TOTAL_FILL));
  s1.getColumn(1).width = Math.max(s1.getColumn(1).width ?? 0, 28);
  s1.addRow([]);
  s1.addRow([`หมายเหตุ: “${SYSTEM}” = ใบงานที่สร้างอัตโนมัติ หรือบัญชีผู้เปิดถูกลบ · ไม่นับใบทดสอบ`]).font = {
    size: 9,
    color: { argb: "FF888888" },
  };
  if (!r.rows.length) s1.addRow(["ไม่มีใบงานที่เปิดในช่วงวันที่นี้"]);

  const s2 = wb.addWorksheet(sheetName("รายการใบงานทั้งหมด", used));
  title(s2, "ใบงานทั้งหมดในช่วงที่เลือก (เรียงตามผู้เปิด แล้ววันที่เปิด)", sub);
  table(s2, ["ผู้เปิด", "บทบาท", ...DETAIL_HEAD], r.rows.map((x) => [x.opener, x.openerRole, ...detail(x)]));

  // 1 ชีตต่อผู้เปิด — ส่งต่อให้แต่ละคนดูเฉพาะของตัวเองได้ (ตามตัวอย่างที่เจ้าของงานเลือก)
  for (const s of r.summary) {
    const key = s.userId === null ? "system" : `u${s.userId}`;
    const mine = r.rows.filter((x) => x.openerKey === key);
    const sh = wb.addWorksheet(sheetName(s.userId === null ? "ระบบ" : s.name, used));
    title(sh, `ใบงานที่ ${s.name} เปิด (${mine.length} ใบ)`, `${s.role}${s.region ? ` · ${s.region}` : ""} · ${sub}`);
    table(sh, DETAIL_HEAD, mine.map(detail));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
