/**
 * รายงานของ Area Team — ปุ่มเดียว: ใบงานทั้งหมดของสาขาที่คนนั้นเห็น (เจ้าของงานกำหนด ต.ค. 69)
 *
 * แถวละใบ ทุกสถานะ ทุกคอลัมน์อยู่ในแถวเดียว เพื่อให้กรอง/ทำ Pivot ใน Excel ต่อได้เอง
 * แทนที่จะมีรายงานหลายแบบให้เลือก (ตำแหน่งนี้ไม่ได้ทำงานในระบบ แค่ติดตาม)
 * Area = สาขา COCO ทั้งหมด · Supervisor (COCO) = สาขาของตัวเอง — ขอบเขตเดียวกับรายการใบงาน (utils/areaScope.ts)
 *
 * คอลัมน์ Supervisor / Area มาจากตัวสาขา (ผู้ดูแลตอนนี้) ไม่ใช่ตอนเปิดใบ — คนอ่านถามว่า "ตอนนี้ใครดูแลสาขานี้"
 */
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import {
  JOB_TYPE_LABELS,
  ROLE_LABELS,
  WORK_ORDER_RESULT_LABELS,
  WORK_ORDER_STAGE_ACTOR,
  WORK_ORDER_STATUS_LABELS,
} from "../utils/constants";
import { bkkDayStart, thaiDateTime } from "./openerReport";

const DAY_MS = 24 * 3600_000;

export async function areaTeamWorkbook(opts: {
  scope: Prisma.WorkOrderWhereInput;
  from: string;
  to: string;
  viewer: { name: string; role: string };
}): Promise<{ data: Buffer; count: number }> {
  const start = bkkDayStart(opts.from);
  const end = new Date(bkkDayStart(opts.to).getTime() + DAY_MS);
  const rows = await prisma.workOrder.findMany({
    where: { AND: [opts.scope], isTest: false, createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "asc" },
    select: {
      code: true,
      createdAt: true,
      jobType: true,
      title: true,
      symptom: true,
      status: true,
      assignedTeam: true,
      scheduledAt: true,
      scheduledTime: true,
      closedAt: true,
      closeResult: true,
      createdBy: { select: { name: true } },
      machine: { select: { code: true, model: true, capacityKg: true } },
      branch: {
        select: {
          code: true,
          name: true,
          cocoSupervisor: { select: { name: true, role: true, area: { select: { name: true } } } },
        },
      },
      parts: { where: { kind: "WAITING" }, select: { quantity: true, sparePart: { select: { partCode: true, name: true } } } },
    },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("ใบงานทั้งหมด", { views: [{ state: "frozen", ySplit: 4 }] });
  ws.addRow([`รายงานใบงานทั้งหมด — ${opts.viewer.name} (${ROLE_LABELS[opts.viewer.role] ?? opts.viewer.role})`]).font = { bold: true, size: 14 };
  ws.addRow([
    `วันที่แจ้ง ${thaiDateTime(start, false)} – ${thaiDateTime(bkkDayStart(opts.to), false)} · ` +
      (opts.viewer.role === "AREA" ? "สาขา COCO ทั้งหมด" : opts.viewer.role === "COCO_MAID" ? "สาขาที่ประจำ" : "สาขาที่ดูแล") +
      ` · ${rows.length} ใบ · ออกรายงาน ${thaiDateTime(new Date())}`,
  ]);
  ws.addRow([]);
  const head = ws.addRow([
    "เลขใบงาน",
    "วันที่แจ้ง",
    "รหัสสาขา",
    "สาขา",
    "Supervisor",
    "Area",
    "ประเภทงาน",
    "เครื่อง",
    "อาการ",
    "ขั้นปัจจุบัน",
    "รอใคร",
    "ทีมช่าง",
    "วันนัด",
    "อะไหล่",
    "วันปิด",
    "ผลการซ่อม",
    "ระยะเวลา (วัน)",
    "ผู้เปิด",
  ]);
  head.font = { bold: true };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
  });

  const now = Date.now();
  for (const w of rows) {
    const actor = WORK_ORDER_STAGE_ACTOR[w.status];
    const finished = w.status === "DONE" || w.status === "CANCELLED";
    const machine = w.machine
      ? [w.machine.code, w.machine.model, w.machine.capacityKg ? `${w.machine.capacityKg} kg` : null].filter(Boolean).join(" · ")
      : "";
    // ระยะเวลานับถึงวันปิด · ใบที่ยังไม่ปิดนับถึงตอนออกรายงาน (ค้างมากี่วันแล้ว)
    const days = Math.floor(((w.closedAt?.getTime() ?? now) - w.createdAt.getTime()) / DAY_MS);
    ws.addRow([
      w.code,
      thaiDateTime(w.createdAt),
      w.branch.code,
      w.branch.name,
      w.branch.cocoSupervisor?.name ?? "",
      // Area ที่ดูแลสาขานั้นเอง (ไม่มี Supervisor คั่น) — ชื่อเดียวกันทั้งสองช่อง
      (w.branch.cocoSupervisor?.role === "AREA" ? w.branch.cocoSupervisor.name : w.branch.cocoSupervisor?.area?.name) ?? "",
      JOB_TYPE_LABELS[w.jobType] ?? w.jobType,
      machine,
      (w.symptom ?? "").trim() || w.title,
      WORK_ORDER_STATUS_LABELS[w.status] ?? w.status,
      finished || !actor ? "" : ROLE_LABELS[actor] ?? actor,
      w.assignedTeam ?? "",
      w.scheduledAt ? `${thaiDateTime(w.scheduledAt, false)}${w.scheduledTime ? ` ${w.scheduledTime}` : ""}` : "",
      w.parts.map((p) => `${p.sparePart.partCode} ${p.sparePart.name}${p.quantity > 1 ? ` x${p.quantity}` : ""}`).join(", "),
      thaiDateTime(w.closedAt),
      w.closeResult ? WORK_ORDER_RESULT_LABELS[w.closeResult] ?? w.closeResult : "",
      days,
      w.createdBy?.name ?? "",
    ]);
  }
  const widths = [12, 18, 10, 30, 26, 26, 14, 22, 40, 26, 16, 22, 16, 30, 18, 16, 10, 22];
  widths.forEach((wd, i) => (ws.getColumn(i + 1).width = wd));
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: widths.length } };

  return { data: Buffer.from(await wb.xlsx.writeBuffer()), count: rows.length };
}
