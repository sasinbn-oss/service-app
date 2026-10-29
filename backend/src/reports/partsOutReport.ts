/**
 * รายงานอะไหล่หมด — สาขาไหนรอของอะไร ถึงเมื่อไร (เจ้าของงานขอ ต.ค. 69)
 *
 * ที่มาคือผลเช็คคลังที่แอดมินกด "หมด" ในใบงาน (WorkOrderPart.inStock = false) — ตัวเดียวกับป้ายแดง
 * "อะไหล่หมด" บนใบงาน ไม่ใช่สถานะ "รออะไหล่" ที่หัวหน้าภาคตั้งเอง (เจ้าของงานเลือกนับเฉพาะที่แอดมินยืนยันว่าหมดจริง)
 * ของมาแล้วแอดมินเช็คใหม่ว่ามี = หายจากรายงานเอง ไม่ต้องมีใครมาปิด
 *
 * ส่งเป็นแถวแบน 1 แถวต่ออะไหล่ต่อใบงาน — หน้าจอจัดกลุ่มเองได้ทั้งตามอะไหล่และตามสาขา
 * และไฟล์ Excel ใช้แถวชุดเดียวกัน ตัวเลขบนจอกับในไฟล์จึงตรงกันเสมอ
 */
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { WORK_ORDER_STATUS_LABELS } from "../utils/constants";
import { sheetName, table, thaiDateTime, title } from "./openerReport";

/** ขั้นที่ป้าย "อะไหล่หมด" มีผล — ตรงกับ PARTS_OUT_STAGES ของรายการใบงาน ขั้นอื่นคือผลเช็คเก่าที่ผ่านไปแล้ว */
export const PARTS_OUT_REPORT_STAGES = ["PARTS_SOURCING", "PARTS_REQUESTED", "WAITING_PARTS"];

const DAY_MS = 86_400_000;
const BKK_MS = 7 * 3600_000;
/** วันตามเวลาไทยเป็นเลขวัน — นับ "กี่วัน" ด้วยวันปฏิทิน ไม่ใช่ 24 ชม. (เช็คเมื่อวานตอนสี่ทุ่ม = 1 วัน) */
const bkkDay = (d: Date) => Math.floor((d.getTime() + BKK_MS) / DAY_MS);

export interface PartsOutRow {
  /** WorkOrderPart.id — ใช้บันทึกหมายเหตุของแถวนี้ */
  partRowId: number;
  workOrderId: number;
  code: string;
  status: string;
  statusLabel: string;
  branchCode: string;
  branchName: string;
  region: string | null;
  team: string | null;
  machineCode: string | null;
  sparePartId: number;
  partCode: string;
  partName: string;
  brand: string | null;
  imageUrl: string | null;
  /** ตัวกันแคชรูป (?v=) — รูปอะไหล่ถูกแทนจากไฟล์ได้ ลิงก์เดิมแคชไว้ 1 วัน */
  updatedAt: string;
  offCatalog: boolean;
  quantity: number;
  unit: string | null;
  checkedAt: string | null;
  checkedBy: string | null;
  /** หมดมาแล้วกี่วัน นับจากวันที่แอดมินเช็คว่าหมด */
  outDays: number | null;
  /** วันที่คาดว่าของเข้า (YYYY-MM-DD) — ใส่ที่ใบงาน ทั้งใบใช้วันเดียวกัน */
  expectedAt: string | null;
  /** ของเข้าอีกกี่วัน · ติดลบ = เลยมาแล้ว · null = ยังไม่ใส่วัน */
  etaDays: number | null;
  /** หมายเหตุของแถวสาขา+อะไหล่นี้ — เฉพาะหน้ารายงาน (ไม่ใส่ในไฟล์ Excel และไม่ขึ้นในใบงาน) */
  note: string | null;
  noteBy: string | null;
  noteAt: string | null;
}

export interface PartsOutReport {
  generatedAt: Date;
  scopeLabel: string;
  rows: PartsOutRow[];
}

export async function buildPartsOutReport(opts: {
  scope: Prisma.WorkOrderWhereInput | null;
  scopeLabel: string;
}): Promise<PartsOutReport> {
  const now = new Date();
  const today = bkkDay(now);
  const parts = await prisma.workOrderPart.findMany({
    where: {
      kind: "WAITING",
      inStock: false,
      workOrder: {
        AND: [opts.scope ?? {}],
        isTest: false,
        status: { in: PARTS_OUT_REPORT_STAGES },
      },
    },
    select: {
      id: true,
      sparePartId: true,
      quantity: true,
      outNote: true,
      outNoteAt: true,
      outNoteBy: { select: { name: true } },
      unit: true,
      checkedAt: true,
      checkedBy: { select: { name: true } },
      sparePart: { select: { partCode: true, name: true, brand: true, imageUrl: true, updatedAt: true, offCatalog: true } },
      workOrder: {
        select: {
          id: true,
          code: true,
          status: true,
          assignedTeam: true,
          partsExpectedAt: true,
          branch: { select: { code: true, name: true, region: true, zone: true } },
          machine: { select: { code: true } },
        },
      },
    },
  });
  const rows = parts.map((p): PartsOutRow => {
    const w = p.workOrder;
    // วันของเข้าเก็บเป็นวันล้วน (เที่ยงคืน UTC) — เทียบด้วยวันที่ตรง ๆ ไม่เลื่อนเวลาไทย
    const eta = w.partsExpectedAt ? Math.floor(w.partsExpectedAt.getTime() / DAY_MS) : null;
    // หมายเหตุที่เขียนก่อนเช็คว่าหมดรอบนี้ = ของรอบก่อน (ของเข้าแล้วหมดซ้ำ) ไม่เกี่ยวกับรอบนี้แล้ว
    const noteLive = !!p.outNote && !!p.outNoteAt && (!p.checkedAt || p.outNoteAt >= p.checkedAt);
    return {
      partRowId: p.id,
      workOrderId: w.id,
      code: w.code,
      status: w.status,
      statusLabel: WORK_ORDER_STATUS_LABELS[w.status] ?? w.status,
      branchCode: w.branch.code,
      branchName: w.branch.name,
      region: w.branch.region,
      team: w.assignedTeam ?? w.branch.zone ?? null,
      machineCode: w.machine?.code ?? null,
      sparePartId: p.sparePartId,
      partCode: p.sparePart.partCode,
      partName: p.sparePart.name,
      brand: p.sparePart.brand,
      imageUrl: p.sparePart.imageUrl,
      updatedAt: p.sparePart.updatedAt.toISOString(),
      offCatalog: p.sparePart.offCatalog,
      quantity: p.quantity,
      unit: p.unit,
      checkedAt: p.checkedAt?.toISOString() ?? null,
      checkedBy: p.checkedBy?.name ?? null,
      outDays: p.checkedAt ? today - bkkDay(p.checkedAt) : null,
      expectedAt: w.partsExpectedAt?.toISOString().slice(0, 10) ?? null,
      etaDays: eta === null ? null : eta - today,
      note: noteLive ? p.outNote : null,
      noteBy: noteLive ? p.outNoteBy?.name ?? null : null,
      noteAt: noteLive ? p.outNoteAt!.toISOString() : null,
    };
  });
  // รอนานสุดก่อน — เรียงไว้ที่เดียว หน้าจอกับ Excel ได้ลำดับเดียวกัน
  rows.sort(
    (a, b) => (b.outDays ?? -1) - (a.outDays ?? -1) || a.branchCode.localeCompare(b.branchCode) || a.code.localeCompare(b.code)
  );
  return { generatedAt: now, scopeLabel: opts.scopeLabel, rows };
}

const etaText = (r: PartsOutRow) =>
  r.etaDays === null ? "ยังไม่ใส่วัน" : r.etaDays < 0 ? `เลยมา ${-r.etaDays} วัน` : r.etaDays === 0 ? "วันนี้" : `อีก ${r.etaDays} วัน`;

/** ชีตแรก 1 แถวต่ออะไหล่ต่อใบงาน (ส่งฝ่ายจัดซื้อ) · ชีตสองรวมตามอะไหล่ (ต้องหาของอะไร กี่ชิ้น) */
export async function partsOutWorkbook(r: PartsOutReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OTTERI Service";
  wb.created = r.generatedAt;
  const sub = `${r.scopeLabel} · ออกเมื่อ ${thaiDateTime(r.generatedAt)} · ไม่นับใบทดสอบ`;
  const used = new Set<string>();

  const s1 = wb.addWorksheet(sheetName("รายการที่รอของ", used));
  title(s1, "อะไหล่หมด — สาขาที่รอของ", sub);
  table(
    s1,
    ["รหัสสาขา", "ชื่อสาขา", "ภาค", "ทีมช่าง", "เลขใบงาน", "เครื่อง", "ขั้นตอน", "รหัสอะไหล่", "ชื่ออะไหล่", "ยี่ห้อ", "จำนวน", "วันที่เช็คว่าหมด", "หมดมาแล้ว (วัน)", "เช็คโดย", "วันของเข้า", "สถานะของเข้า"],
    r.rows.map((x) => [
      x.branchCode, x.branchName, x.region ?? "—", x.team ?? "—", x.code, x.machineCode ?? "ทั้งสาขา", x.statusLabel,
      x.offCatalog ? "นอกสโตร์" : x.partCode, x.partName, x.brand ?? "—", x.unit ? `${x.quantity} ${x.unit}` : x.quantity,
      x.checkedAt ? thaiDateTime(new Date(x.checkedAt), false) : "—", x.outDays ?? "—", x.checkedBy ?? "—",
      x.expectedAt ? thaiDateTime(new Date(`${x.expectedAt}T00:00:00Z`), false) : "—", etaText(x),
    ])
  );
  if (!r.rows.length) s1.addRow(["ไม่มีใบงานที่รออะไหล่หมดอยู่"]);

  const byPart = new Map<number, { row: PartsOutRow; qty: number; branches: Set<string>; orders: number; late: number }>();
  for (const x of r.rows) {
    const g = byPart.get(x.sparePartId) ?? { row: x, qty: 0, branches: new Set<string>(), orders: 0, late: 0 };
    g.qty += x.quantity;
    g.branches.add(x.branchCode);
    g.orders += 1;
    if (x.etaDays !== null && x.etaDays < 0) g.late += 1;
    byPart.set(x.sparePartId, g);
  }
  const s2 = wb.addWorksheet(sheetName("รวมตามอะไหล่", used));
  title(s2, "รวมตามอะไหล่ — ต้องหาของอะไร กี่ชิ้น", sub);
  table(
    s2,
    ["รหัสอะไหล่", "ชื่ออะไหล่", "ยี่ห้อ", "ต้องใช้รวม", "จำนวนสาขา", "จำนวนใบงาน", "เลยวันของเข้า (ใบ)", "สาขาที่รอ"],
    [...byPart.values()]
      .sort((a, b) => b.branches.size - a.branches.size || b.qty - a.qty)
      .map((g) => [
        g.row.offCatalog ? "นอกสโตร์" : g.row.partCode, g.row.partName, g.row.brand ?? "—", g.qty, g.branches.size, g.orders, g.late,
        [...g.branches].join(", "),
      ])
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}
