/**
 * อะไหล่เบิกแล้ว · งานยังไม่จบ — ของออกจากคลังไปแล้ว ค้างอยู่ใบไหน ถึงขั้นไหน (เจ้าของงานขอ ต.ค. 69)
 *
 * ถามขึ้นมาตอนเปลี่ยนเป็นนัดลูกค้าก่อนเบิก: ใบที่เบิกไปก่อนเปลี่ยนสายงานยังเดินอยู่ และของที่ออกจากคลังแล้ว
 * แต่งานไม่จบคือของที่ไม่มีใครตาม (ลูกค้าเลื่อน · ช่างยังไม่ปิด · ระหว่างโอน · เบิกแล้วรอคอนเฟิร์มลูกค้า)
 *
 * "เบิกแล้ว" = มีเลขใบเบิกส่งมอบ (inStock + requisitionNo — กฎเดียวกับ isIssued ของใบงาน)
 * หรือหัวหน้าภาคเบิกจากคลังต้นทางเพื่อโอนแล้ว (transferReqNo) — ของออกจากคลังนั้นแล้วแม้ยังไม่ถึงปลายทาง
 * ของนอกสโตร์ไม่นับ: ไม่มีใบเบิก ไม่ได้ออกจากคลังของบริษัท
 *
 * ส่งแถวแบน 1 แถวต่ออะไหล่ต่อใบงาน รวมตัวที่ยังไม่เบิกในใบเดียวกันด้วย (issued=false) ให้หน้าจอบอก "ยังไม่เบิก"
 * ตัวเลขและไฟล์ Excel นับเฉพาะ issued — คลังเอาไฟล์ไปกระทบยอดกับเลขใบเบิกได้ทีละแถว
 */
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { WORK_ORDER_STAGE_ORDER, WORK_ORDER_STATUS_LABELS } from "../utils/constants";
import { sheetName, table, thaiDateTime, title } from "./openerReport";

const DAY_MS = 86_400_000;
const BKK_MS = 7 * 3600_000;
/** วันตามเวลาไทยเป็นเลขวัน — "เบิกมากี่วัน" นับวันปฏิทิน ไม่ใช่ 24 ชม. */
const bkkDay = (d: Date) => Math.floor((d.getTime() + BKK_MS) / DAY_MS);

/** ขั้นที่ทีมกำลังเบิก/โอนจากคลังอื่น */
const TRANSFER_STAGES = ["PARTS_TRANSFER", "PARTS_IN_TRANSIT", "PARTS_PICKUP"];

/**
 * กลุ่มตามสิ่งที่ต้องตาม — ปุ่มกรองบนหน้าจอใช้ค่านี้ ตัดสินที่เซิร์ฟเวอร์ที่เดียว
 * confirm = เบิกแล้ว รอแอดมินโทรคอนเฟิร์มลูกค้า (เบิกก่อนคอนเฟิร์ม — ต.ค. 69 รอบสอง) ของอยู่ในมือ ลูกค้ายังไม่ตอบ
 * other = ใบที่เบิกไปแล้วแต่ยังไม่ถึงคอนเฟิร์ม (เบิกยังไม่ครบ · ช่างขอของเพิ่มถอยกลับไปนัดใหม่ · ใบที่เบิกก่อนเปลี่ยนสายงาน)
 */
export type IssuedBucket = "transfer" | "confirm" | "dispatch" | "field" | "claim" | "other";
function bucketOf(status: string): IssuedBucket {
  if (TRANSFER_STAGES.includes(status)) return "transfer";
  if (status === "AWAITING_CONFIRM") return "confirm";
  if (status === "ASSIGNED") return "dispatch";
  if (status === "IN_PROGRESS") return "field";
  if (status === "CLAIM_REVIEW") return "claim";
  return "other";
}

export interface IssuedRow {
  partRowId: number;
  workOrderId: number;
  code: string;
  status: string;
  statusLabel: string;
  bucket: IssuedBucket;
  branchCode: string;
  branchName: string;
  region: string | null;
  team: string | null;
  machineCode: string | null;
  symptom: string | null;
  /** วันนัด (YYYY-MM-DD) · เวลา · ลูกค้าคอนเฟิร์มหรือยัง */
  scheduledAt: string | null;
  scheduledTime: string | null;
  confirmed: boolean;
  /** วันนัดผ่านมาแล้วกี่วันโดยที่ใบยังไม่ปิด — null = ยังไม่ถึง/ไม่มีนัด · ใบรอตรวจเคลม (ช่างปิดแล้ว) ไม่นับ */
  lateDays: number | null;
  sparePartId: number;
  partCode: string;
  partName: string;
  quantity: number;
  unit: string | null;
  /** ออกจากคลังแล้วหรือยัง — false = ตัวที่ยังไม่เบิกในใบเดียวกัน (หน้าจอบอก "ยังไม่เบิก") */
  issued: boolean;
  inStock: boolean | null;
  /** คลังที่ของอยู่/เบิกส่งมอบ · ระหว่างโอน = คลังปลายทาง */
  warehouse: string | null;
  requisitionNo: string | null;
  /** เบิกเพื่อโอน — คลังต้นทาง · ใบเบิกต้นทาง · ใบโอน · ถึงปลายทางแล้วหรือยัง */
  transferFrom: string | null;
  transferReqNo: string | null;
  transferNo: string | null;
  transferArrived: boolean;
  /** เบิกเมื่อ — ใบเบิกส่งมอบใช้เวลาที่บันทึกเบิก · เบิกเพื่อโอนใช้เวลาที่หัวหน้าภาคบันทึกเบิก-โอน */
  issuedAt: string | null;
  issuedDays: number | null;
}

export interface IssuedReport {
  generatedAt: Date;
  scopeLabel: string;
  rows: IssuedRow[];
}

const openIssued = (p: { inStock: boolean | null; requisitionNo: string | null; transferReqNo: string | null }) =>
  (p.inStock === true && !!p.requisitionNo) || !!p.transferReqNo;

export async function buildIssuedReport(opts: { scope: Prisma.WorkOrderWhereInput | null; scopeLabel: string }): Promise<IssuedReport> {
  const now = new Date();
  const today = bkkDay(now);
  const orders = await prisma.workOrder.findMany({
    where: {
      AND: [opts.scope ?? {}],
      isTest: false,
      status: { notIn: ["DONE", "CANCELLED"] },
      parts: {
        some: {
          kind: "WAITING",
          sparePart: { offCatalog: false },
          OR: [{ inStock: true, requisitionNo: { not: null } }, { transferReqNo: { not: null } }],
        },
      },
    },
    select: {
      id: true,
      code: true,
      status: true,
      symptom: true,
      assignedTeam: true,
      scheduledAt: true,
      scheduledTime: true,
      appointmentStatus: true,
      branch: { select: { code: true, name: true, region: true, zone: true } },
      machine: { select: { code: true } },
      parts: {
        where: { kind: "WAITING", sparePart: { offCatalog: false } },
        select: {
          id: true,
          sparePartId: true,
          quantity: true,
          unit: true,
          inStock: true,
          warehouse: true,
          requisitionNo: true,
          transferFrom: true,
          transferReqNo: true,
          transferNo: true,
          transferredAt: true,
          checkedAt: true,
          sparePart: { select: { partCode: true, name: true } },
        },
      },
      // เวลาเบิก-โอนไม่มีช่องในแถวอะไหล่ — อ่านจากประวัติครั้งล่าสุดของใบ
      logs: { where: { action: "TRANSFER_REQUESTED" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });

  const rows: IssuedRow[] = [];
  for (const w of orders) {
    // วันนัดเก็บเป็นวันล้วน (เที่ยงคืน UTC) — เทียบวันตรง ๆ ไม่เลื่อนเวลาไทย
    const visit = w.scheduledAt ? Math.floor(w.scheduledAt.getTime() / DAY_MS) : null;
    const late = visit !== null && visit < today && w.status !== "CLAIM_REVIEW" ? today - visit : null;
    const transferAt = w.logs[0]?.createdAt ?? null;
    for (const p of w.parts) {
      const issued = openIssued(p);
      const delivered = p.inStock === true && !!p.requisitionNo;
      const at = issued ? (delivered ? p.checkedAt : transferAt ?? p.checkedAt) : null;
      rows.push({
        partRowId: p.id,
        workOrderId: w.id,
        code: w.code,
        status: w.status,
        statusLabel: WORK_ORDER_STATUS_LABELS[w.status] ?? w.status,
        bucket: bucketOf(w.status),
        branchCode: w.branch.code,
        branchName: w.branch.name,
        region: w.branch.region,
        team: w.assignedTeam ?? w.branch.zone ?? null,
        machineCode: w.machine?.code ?? null,
        symptom: (w.symptom ?? "").split("\n")[0].trim().slice(0, 160) || null,
        scheduledAt: w.scheduledAt?.toISOString().slice(0, 10) ?? null,
        scheduledTime: w.scheduledTime,
        confirmed: w.appointmentStatus === "CONFIRMED",
        lateDays: late,
        sparePartId: p.sparePartId,
        partCode: p.sparePart.partCode,
        partName: p.sparePart.name,
        quantity: p.quantity,
        unit: p.unit,
        issued,
        inStock: p.inStock,
        warehouse: p.warehouse,
        requisitionNo: p.requisitionNo,
        transferFrom: p.transferFrom,
        transferReqNo: p.transferReqNo,
        transferNo: p.transferNo,
        transferArrived: !!p.transferredAt,
        issuedAt: at?.toISOString() ?? null,
        issuedDays: at ? today - bkkDay(at) : null,
      });
    }
  }
  // ตามลำดับขั้น แล้วเลขใบงาน — หน้าจอจัดกลุ่มตามขั้น Excel ได้ลำดับเดียวกัน
  const stage = (s: string) => {
    const i = WORK_ORDER_STAGE_ORDER.indexOf(s as (typeof WORK_ORDER_STAGE_ORDER)[number]);
    return i < 0 ? 999 : i;
  };
  rows.sort(
    (a, b) =>
      stage(a.status) - stage(b.status) ||
      a.code.localeCompare(b.code) ||
      Number(b.issued) - Number(a.issued) ||
      a.partCode.localeCompare(b.partCode)
  );
  return { generatedAt: now, scopeLabel: opts.scopeLabel, rows };
}

const visitText = (r: IssuedRow) =>
  r.scheduledAt ? `${thaiDateTime(new Date(`${r.scheduledAt}T00:00:00Z`), false)}${r.scheduledTime ? ` ${r.scheduledTime}` : ""}` : "—";

/** ชีตแรก 1 แถวต่ออะไหล่ที่ออกจากคลังแล้ว (กระทบยอดกับใบเบิก) · ชีตสองรวมตามอะไหล่ */
export async function issuedWorkbook(r: IssuedReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OTTERI Service";
  wb.created = r.generatedAt;
  const sub = `${r.scopeLabel} · ใบงานที่ยังไม่ปิด · ออกเมื่อ ${thaiDateTime(r.generatedAt)} · ไม่นับใบทดสอบและอะไหล่นอกสโตร์`;
  const used = new Set<string>();
  const issued = r.rows.filter((x) => x.issued);

  const s1 = wb.addWorksheet(sheetName("อะไหล่ที่เบิกแล้ว", used));
  title(s1, "อะไหล่เบิกแล้ว · งานยังไม่จบ", sub);
  table(
    s1,
    [
      "เลขใบงาน", "รหัสสาขา", "ชื่อสาขา", "ภาค", "ทีมช่าง", "เครื่อง", "ขั้นตอนตอนนี้", "วันนัด", "ลูกค้าคอนเฟิร์ม", "เลยวันนัด (วัน)",
      "รหัสอะไหล่", "ชื่ออะไหล่", "จำนวน", "คลัง", "เลขใบเบิก", "เบิกจากคลัง (โอน)", "ใบเบิกต้นทาง", "เลขที่ใบโอน", "สถานะโอน",
      "เบิกเมื่อ", "เบิกมาแล้ว (วัน)",
    ],
    issued.map((x) => [
      x.code, x.branchCode, x.branchName, x.region ?? "—", x.team ?? "—", x.machineCode ?? "ทั้งสาขา", x.statusLabel, visitText(x),
      x.confirmed ? "คอนเฟิร์มแล้ว" : x.scheduledAt ? "รอคอนเฟิร์ม" : "—", x.lateDays ?? "—",
      x.partCode, x.partName, x.unit ? `${x.quantity} ${x.unit}` : x.quantity, x.warehouse ?? "—", x.requisitionNo ?? "—",
      x.transferFrom ?? "—", x.transferReqNo ?? "—", x.transferNo ?? "—",
      x.transferReqNo ? (x.transferArrived ? "โอนถึงแล้ว" : "กำลังโอน") : "—",
      x.issuedAt ? thaiDateTime(new Date(x.issuedAt), false) : "—", x.issuedDays ?? "—",
    ])
  );
  if (!issued.length) s1.addRow(["ไม่มีใบงานที่เบิกอะไหล่แล้วและยังไม่ปิด"]);

  const byPart = new Map<number, { row: IssuedRow; qty: number; orders: Set<string>; wh: Map<string, number> }>();
  for (const x of issued) {
    const g = byPart.get(x.sparePartId) ?? { row: x, qty: 0, orders: new Set<string>(), wh: new Map<string, number>() };
    g.qty += x.quantity;
    g.orders.add(x.code);
    const where = x.transferReqNo && !x.transferArrived ? `กำลังโอน ${x.transferFrom ?? "—"} → ${x.warehouse ?? "—"}` : x.warehouse ?? "ไม่ระบุคลัง";
    g.wh.set(where, (g.wh.get(where) ?? 0) + x.quantity);
    byPart.set(x.sparePartId, g);
  }
  const s2 = wb.addWorksheet(sheetName("รวมตามอะไหล่", used));
  title(s2, "รวมตามอะไหล่ — ออกจากคลังไปแล้วกี่ชิ้น อยู่ในใบไหน", sub);
  table(
    s2,
    ["รหัสอะไหล่", "ชื่ออะไหล่", "ออกจากคลังแล้ว (ชิ้น)", "จำนวนใบงาน", "แยกตามคลัง", "ใบงาน"],
    [...byPart.values()]
      .sort((a, b) => b.qty - a.qty || a.row.partCode.localeCompare(b.row.partCode))
      .map((g) => [
        g.row.partCode, g.row.partName, g.qty, g.orders.size,
        [...g.wh.entries()].map(([w, n]) => `${w} ${n}`).join(", "), [...g.orders].join(", "),
      ])
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}
