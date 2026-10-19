/**
 * รายงานทั้งระบบ (เจ้าของงานขอ ต.ค. 69 — "ออกรายงานทั้งหมด รวมรายชื่อพนักงาน เครื่องทั้งหมด")
 *
 * ต่างจากสำรองข้อมูล: ไฟล์สำรองเป็นตารางดิบเต็มไปด้วยรหัสอ้างอิง มีไว้กู้คืน · ไฟล์นี้แปลงเป็นชื่อและคำไทยแล้ว
 * เปิดอ่าน/ส่งต่อได้เลย ชีตตามตัวอย่างที่เจ้าของงานเลือก: ภาพรวม · พนักงาน · ทีมช่าง · สาขา · เครื่อง · ใบงาน · อะไหล่ · รถ
 * ไม่มีรหัสผ่าน รูป และบัตรเติมน้ำมัน/Easy Pass (ตารางนั้นไม่แตะเลย) · มีเบอร์โทรพนักงาน (เจ้าของงานเลือก)
 *
 * เขียนไฟล์ทีละแถวด้วย WorkbookWriter และอ่านใบงานทีละชุด — ใบงานทั้งระบบอ่านรวดเดียวพร้อมสร้างไฟล์ในหน่วยความจำ
 * เสี่ยงเกิน 512 MB ของ Render (ระบบเคยล่มแบบนั้นจากการสำรองข้อมูล) · ชีตภาพรวมต้องมาก่อน ตัวเลขจึงนับจาก
 * ฐานข้อมูลตรง ๆ (count/groupBy) ก่อนเขียนชีตอื่น ไม่ได้รวมจากแถวที่เขียนทีหลัง
 */
import ExcelJS from "exceljs";
import { PassThrough } from "stream";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import {
  JOB_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
  WORK_ORDER_PRIORITY_LABELS,
  WORK_ORDER_RESULT_LABELS,
  WORK_ORDER_STATUS_LABELS,
  WORK_STATUS_LABELS,
  isCompanyBranch,
  machineMake,
  warrantyStatus,
} from "../utils/constants";
import { bkkDayStart, thaiDateTime } from "./openerReport";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "แอดมิน",
  SUPER_ADMIN: "Super Admin",
  PARTS_ADMIN: "Admin Spare Part",
  SUPERVISOR: "หัวหน้าภาค",
  EMPLOYEE: "ช่าง",
};
const ROLE_ORDER = ["SUPER_ADMIN", "ADMIN", "PARTS_ADMIN", "SUPERVISOR", "EMPLOYEE"];
const CLOSED = ["DONE", "CANCELLED"];
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FC" } };
/** ใบงานอ่านทีละชุด — หน่วยความจำคงที่ไม่ว่าจะมีกี่หมื่นใบ */
const PAGE = 1000;

type Cell = string | number;
type Sheet = ExcelJS.Worksheet;

export async function buildSystemReport(opts: { from?: string; to?: string }): Promise<Buffer> {
  const woRange: Prisma.WorkOrderWhereInput = {
    isTest: false,
    ...(opts.from && opts.to
      ? { createdAt: { gte: bkkDayStart(opts.from), lt: new Date(bkkDayStart(opts.to).getTime() + 86_400_000) } }
      : {}),
  };
  const rangeLabel = opts.from && opts.to ? `ใบงานที่เปิด ${thaiDay(opts.from)} – ${thaiDay(opts.to)}` : "ใบงานทั้งหมด";
  const sub = `ข้อมูล ณ ${thaiDateTime(new Date())} · ทั้งระบบ · ${rangeLabel} · ไม่มีรหัสผ่าน รูป และบัตรเติมน้ำมัน`;

  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((res, rej) => {
    out.on("end", res);
    out.on("error", rej);
  });
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true });
  wb.creator = "OTTERI Service";

  // ── ข้อมูลที่ทุกชีตใช้ (ขนาดเท่าจำนวนคน/สาขา/เครื่อง ไม่ใช่ใบงาน) ──
  const [users, branches, machines, downMachines, woByMachine, woOpenByTeam, woByStatus] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, employeeCode: true, name: true, phone: true, role: true, team: true, region: true, supervisedTeams: true, mustChangePassword: true, deletedAt: true },
    }),
    prisma.branch.findMany({ orderBy: { code: "asc" } }),
    prisma.machine.findMany({
      orderBy: [{ branchId: "asc" }, { code: "asc" }],
      select: { id: true, branchId: true, code: true, type: true, brand: true, model: true, capacityKg: true, removedAt: true },
    }),
    // เครื่องดับ = มีเคสเครื่องดับที่ยังไม่จบ (Outage เป็นตัวจริง ไม่ใช่ช่อง status ที่เป็นแค่สรุป)
    prisma.outage.findMany({ where: { kind: "MACHINE_OFF", endedAt: null, machineId: { not: null } }, select: { machineId: true } }),
    prisma.workOrder.groupBy({
      by: ["machineId", "status"],
      where: { isTest: false, machineId: { not: null } },
      _count: { _all: true },
      _max: { closedAt: true },
    }),
    prisma.workOrder.findMany({
      where: { isTest: false, status: { notIn: CLOSED } },
      select: { assignedTeam: true, branch: { select: { id: true, zone: true } } },
    }),
    prisma.workOrder.groupBy({ by: ["status"], where: woRange, _count: { _all: true } }),
  ]);
  const branchById = new Map(branches.map((b) => [b.id, b]));
  const down = new Set(downMachines.map((o) => o.machineId!));
  const machineWo = new Map<number, { open: number; all: number; last: Date | null }>();
  for (const g of woByMachine) {
    const m = machineWo.get(g.machineId!) ?? { open: 0, all: 0, last: null };
    m.all += g._count._all;
    if (!CLOSED.includes(g.status)) m.open += g._count._all;
    if (g.status === "DONE" && g._max.closedAt && (!m.last || g._max.closedAt > m.last)) m.last = g._max.closedAt;
    machineWo.set(g.machineId!, m);
  }
  const openByBranch = new Map<number, number>();
  const openByTeam = new Map<string, number>();
  for (const w of woOpenByTeam) {
    openByBranch.set(w.branch.id, (openByBranch.get(w.branch.id) ?? 0) + 1);
    const t = w.assignedTeam ?? w.branch.zone;
    if (t) openByTeam.set(t, (openByTeam.get(t) ?? 0) + 1);
  }
  const active = users.filter((u) => !u.deletedAt);
  const liveMachines = machines.filter((m) => !m.removedAt);
  const warrantyOf = (m: (typeof machines)[number]) => {
    const b = branchById.get(m.branchId)!;
    return warrantyStatus({ branchCode: b.code, openedAt: b.openedAt, warrantyExpiresAt: b.warrantyExpiresAt, machineBrand: machineMake(m) });
  };

  // ── 1) ภาพรวม ──
  const ov = sheet(wb, "ภาพรวม", "รายงานทั้งระบบ — OTTERI Service", sub, [38, 16, 16, 16], false);
  const block = (title: string, head: string[], rows: Cell[][], total?: Cell[]) => {
    const tr = ov.addRow([title]);
    tr.font = { bold: true, size: 12 };
    tr.commit();
    const h = ov.addRow(head);
    h.font = { bold: true };
    h.eachCell((c) => (c.fill = HEAD_FILL));
    h.commit();
    rows.forEach((r) => ov.addRow(r).commit());
    if (total) {
      const t = ov.addRow(total);
      t.font = { bold: true };
      t.eachCell((c) => (c.fill = TOTAL_FILL));
      t.commit();
    }
    ov.addRow([]).commit();
  };
  block(
    "พนักงาน (บัญชีที่ใช้งานอยู่)",
    ["บทบาท", "จำนวน"],
    ROLE_ORDER.map((r) => [ROLE_LABELS[r], active.filter((u) => u.role === r).length] as Cell[]).filter((r) => (r[1] as number) > 0),
    ["รวม", active.length]
  );
  block("บัญชีที่ต้องตามต่อ", ["รายการ", "จำนวน"], [
    ["ช่างที่ยังไม่มีทีม", active.filter((u) => u.role === "EMPLOYEE" && !u.team).length],
    ["หัวหน้าภาคที่ยังไม่มีพื้นที่ดูแล", active.filter((u) => u.role === "SUPERVISOR" && !u.region && !u.supervisedTeams.length).length],
    ["ยังไม่เคยเข้าระบบ (ใช้รหัสตั้งต้นอยู่)", active.filter((u) => u.mustChangePassword).length],
  ]);
  const liveBranches = branches.filter((b) => !b.cancelledAt);
  block("สาขาและเครื่อง", ["รายการ", "จำนวน"], [
    ["สาขาที่เปิดอยู่", liveBranches.length],
    ["  DODO (แฟรนไชส์)", liveBranches.filter((b) => !isCompanyBranch(b.code)).length],
    ["  COCO (บริษัท)", liveBranches.filter((b) => isCompanyBranch(b.code)).length],
    ["สาขาที่ยกเลิกแล้ว", branches.length - liveBranches.length],
    ["เครื่องที่ใช้งาน", liveMachines.length],
    ["  ดับอยู่ตอนนี้", liveMachines.filter((m) => down.has(m.id)).length],
    ["  ในประกัน", liveMachines.filter((m) => ["IN", "SOON"].includes(warrantyOf(m).state ?? "")).length],
  ]);
  block(
    `ใบงานตามขั้น (${rangeLabel})`,
    ["ขั้น", "จำนวน"],
    [...woByStatus]
      .sort((a, b) => b._count._all - a._count._all)
      .map((g) => [WORK_ORDER_STATUS_LABELS[g.status] ?? g.status, g._count._all]),
    ["รวม", woByStatus.reduce((n, g) => n + g._count._all, 0)]
  );
  const byBrand = new Map<string, { n: number; down: number }>();
  for (const m of liveMachines) {
    const key = `${m.brand ?? "ไม่ระบุยี่ห้อ"}|${typeLabel(m.type)}`;
    const v = byBrand.get(key) ?? { n: 0, down: 0 };
    v.n += 1;
    if (down.has(m.id)) v.down += 1;
    byBrand.set(key, v);
  }
  block(
    "เครื่องแยกตามยี่ห้อ",
    ["ยี่ห้อ", "ประเภท", "จำนวน", "ดับอยู่"],
    [...byBrand.entries()].sort().map(([k, v]) => [...k.split("|"), v.n, v.down])
  );
  const note = ov.addRow(["ชีตถัดไป: พนักงาน · ทีมช่าง · สาขา · เครื่อง · ใบงาน · อะไหล่ · รถ — ทุกชีตกรองได้ทุกคอลัมน์"]);
  note.font = { size: 9, color: { argb: "FF888888" } };
  note.commit();
  ov.commit();

  // ── 2) พนักงาน ──
  const people = [...users].sort(
    (a, b) =>
      Number(!!a.deletedAt) - Number(!!b.deletedAt) ||
      ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
      a.employeeCode.localeCompare(b.employeeCode)
  );
  table(wb, "พนักงาน", "รายชื่อพนักงาน", sub,
    ["รหัสพนักงาน", "ชื่อ", "บทบาท", "ทีมที่สังกัด (ช่าง)", "พื้นที่ที่ดูแล (หัวหน้าภาค)", "เบอร์โทร", "เข้าระบบแล้ว", "สถานะบัญชี"],
    people.map((u) => [
      u.employeeCode,
      u.name,
      ROLE_LABELS[u.role] ?? u.role,
      u.team ?? "",
      u.role === "SUPERVISOR" ? [u.region ? `${u.region} (ทั้งภาค)` : "", ...u.supervisedTeams].filter(Boolean).join(", ") : "",
      u.phone ?? "",
      // ระบบไม่ได้เก็บเวลาเข้าระบบล่าสุด — บอกได้แค่ว่าเปลี่ยนรหัสตั้งต้นแล้วหรือยัง (= เคยเข้ามาแล้ว)
      u.mustChangePassword ? "ยังไม่เคย (ใช้รหัสตั้งต้น)" : "เคยแล้ว",
      u.deletedAt
        ? `ถูกลบ ${thaiDateTime(u.deletedAt, false)}`
        : u.role === "EMPLOYEE" && !u.team
          ? "ใช้งาน · ยังไม่มีทีม"
          : u.role === "SUPERVISOR" && !u.region && !u.supervisedTeams.length
            ? "ใช้งาน · ยังไม่มีพื้นที่"
            : "ใช้งาน",
    ])
  );

  // ── 3) ทีมช่าง ──
  // ทีม = ทีม CM ของสาขา + ทีมที่ช่างสังกัด · ภาคของทีม = ภาคที่สาขาของทีมอยู่มากที่สุด (กฎเดียวกับผังผู้รับผิดชอบ)
  const teamNames = new Set<string>([...liveBranches.map((b) => b.zone).filter((z): z is string => !!z), ...active.map((u) => u.team).filter((t): t is string => !!t)]);
  const teamRows: Cell[][] = [];
  for (const t of [...teamNames].sort((a, b) => a.localeCompare(b, "th"))) {
    const bs = liveBranches.filter((b) => b.zone === t);
    const regionCount = new Map<string, number>();
    bs.forEach((b) => b.region && regionCount.set(b.region, (regionCount.get(b.region) ?? 0) + 1));
    const region = [...regionCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    const sups = active.filter((u) => u.role === "SUPERVISOR" && ((region && u.region === region) || u.supervisedTeams.includes(t)));
    const techs = active.filter((u) => u.role === "EMPLOYEE" && u.team === t);
    const ids = new Set(bs.map((b) => b.id));
    teamRows.push([
      t,
      region,
      sups.map((s) => s.name).join(", ") || "— ไม่มี",
      techs.length,
      techs.map((s) => s.name).join(", ") || "— ยังไม่มีช่าง",
      bs.length,
      liveMachines.filter((m) => ids.has(m.branchId)).length,
      openByTeam.get(t) ?? 0,
    ]);
  }
  table(wb, "ทีมช่าง", "ทีมช่างและผู้รับผิดชอบ", sub, ["ทีม", "ภาค", "หัวหน้าภาคที่ดูแล", "จำนวนช่าง", "ช่างในทีม", "สาขา", "เครื่อง", "ใบงานค้าง"], teamRows);

  // ── 4) สาขา ──
  const machinesOf = new Map<number, typeof machines>();
  liveMachines.forEach((m) => machinesOf.set(m.branchId, [...(machinesOf.get(m.branchId) ?? []), m]));
  table(wb, "สาขา", "สาขาทั้งหมด", sub,
    ["รหัสสาขา", "ชื่อสาขา", "ประเภท", "ภาค", "ทีมช่าง (CM)", "ทีม PM", "เกรด", "วันเปิดร้าน", "จำนวนเครื่อง", "เครื่องดับ", "ใบงานค้าง", "สถานะสาขา"],
    branches.map((b) => {
      const ms = machinesOf.get(b.id) ?? [];
      return [
        b.code, b.name, isCompanyBranch(b.code) ? "COCO" : "DODO", b.region ?? "", b.zone ?? "", b.pmTeam ?? "", b.grade ?? "",
        thaiDateTime(b.openedAt, false), ms.length, ms.filter((m) => down.has(m.id)).length, openByBranch.get(b.id) ?? 0,
        b.cancelledAt ? `ยกเลิก ${thaiDateTime(b.cancelledAt, false)}` : "เปิดอยู่",
      ];
    })
  );

  // ── 5) เครื่อง ──
  table(wb, "เครื่อง", "เครื่องทั้งหมด", sub,
    ["รหัสสาขา", "ชื่อสาขา", "ภาค", "ทีมช่าง", "รหัสเครื่อง", "ประเภท", "ยี่ห้อ", "รุ่น", "ขนาด (kg)", "ประกัน", "สถานะตอนนี้", "ใบงานค้าง", "ใบงานทั้งหมด", "ซ่อมเสร็จล่าสุด"],
    machines.map((m) => {
      const b = branchById.get(m.branchId)!;
      const w = warrantyOf(m);
      const wo = machineWo.get(m.id);
      return [
        b.code, b.name, b.region ?? "", b.zone ?? "", m.code, typeLabel(m.type), m.brand ?? "", m.model ?? "", m.capacityKg ?? "",
        w.state === null ? "สาขาบริษัท — ไม่มีประกัน" : w.state === "UNKNOWN" ? "ไม่รู้วันเปิดร้าน" :
          `${w.state === "OUT" ? "หมดประกัน" : "ในประกัน"} · ${thaiDateTime(w.endsAt, false)}`,
        m.removedAt ? `ถอดออก ${thaiDateTime(m.removedAt, false)}` : down.has(m.id) ? "ดับ" : "ปกติ",
        wo?.open ?? 0, wo?.all ?? 0, thaiDateTime(wo?.last ?? null, false),
      ];
    })
  );

  // ── 6) ใบงาน — อ่านทีละชุด เขียนทีละแถว ──
  // ใบงานรู้จำนวนแถวตอนจบ ความกว้างจึงตั้งไว้ล่วงหน้าตามที่ข้อมูลจริงมักยาว
  const woSheet = sheet(wb, "ใบงาน", `ใบงาน (${rangeLabel})`, sub, [18, 12, 22, 22, 10, 10, 30, 44, 26, 16, 16, 8, 10, 10, 26, 18, 22]);
  const woHead = ["วันที่เปิด", "เลขใบงาน", "ผู้เปิด", "เรื่อง", "ประเภทงาน", "รหัสสาขา", "ชื่อสาขา", "อาการ", "สถานะ", "ภาค", "ทีมช่าง", "เครื่อง", "ความเร่งด่วน", "ที่มา", "ขั้นปัจจุบัน", "วันที่ปิด", "ผลปิดงาน"];
  header(woSheet, woHead);
  let cursor: number | undefined;
  let woCount = 0;
  for (;;) {
    const page = await prisma.workOrder.findMany({
      where: woRange,
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true, code: true, title: true, jobType: true, priority: true, source: true, status: true, workStatus: true,
        symptom: true, createdAt: true, closedAt: true, closeResult: true, assignedTeam: true,
        branch: { select: { code: true, name: true, region: true, zone: true } },
        machine: { select: { code: true } },
        createdBy: { select: { name: true } },
      },
    });
    for (const w of page) {
      const row = woSheet.addRow([
        thaiDateTime(w.createdAt), w.code, w.createdBy?.name ?? "ระบบ (ไม่มีผู้เปิด)", w.title, JOB_TYPE_LABELS[w.jobType] ?? w.jobType,
        w.branch.code, w.branch.name, w.symptom ?? "",
        w.workStatus ? WORK_STATUS_LABELS[w.workStatus] ?? w.workStatus : WORK_ORDER_STATUS_LABELS[w.status] ?? w.status,
        w.branch.region ?? "", w.assignedTeam ?? w.branch.zone ?? "", w.machine?.code ?? "",
        WORK_ORDER_PRIORITY_LABELS[w.priority] ?? w.priority, w.source === "OUTAGE" ? "จากกระดาน" : "เปิดเอง",
        WORK_ORDER_STATUS_LABELS[w.status] ?? w.status, w.status === "DONE" ? thaiDateTime(w.closedAt) : "",
        w.status === "DONE" && w.closeResult ? WORK_ORDER_RESULT_LABELS[w.closeResult] ?? w.closeResult : "",
      ]);
      // อาการหลายบรรทัด (สาเหตุ/แก้ไข/หมายเหตุ) ตัดบรรทัดในช่อง
      row.getCell(8).alignment = { wrapText: true, vertical: "top" };
      row.commit();
    }
    woCount += page.length;
    if (page.length < PAGE) break;
    cursor = page[page.length - 1].id;
  }
  finish(woSheet, woHead.length, woCount);

  // ── 7) อะไหล่ ──
  const [parts, used, waiting] = await Promise.all([
    // ของนอกสโตร์ขึ้นท้ายตาราง — ดูว่าตัวไหนใช้บ่อยจนควรเปิด SKU
    prisma.sparePart.findMany({
      orderBy: [{ offCatalog: "asc" }, { partCode: "asc" }],
      select: { id: true, partCode: true, name: true, brand: true, category: true, offCatalog: true },
    }),
    prisma.workOrderPart.groupBy({ by: ["sparePartId"], where: { kind: "USED", workOrder: { isTest: false } }, _sum: { quantity: true } }),
    prisma.workOrderPart.groupBy({
      by: ["sparePartId"],
      where: { kind: "WAITING", workOrder: { isTest: false, status: { notIn: CLOSED } } },
      _sum: { quantity: true },
    }),
  ]);
  const usedBy = new Map(used.map((u) => [u.sparePartId, u._sum.quantity ?? 0]));
  const waitBy = new Map(waiting.map((u) => [u.sparePartId, u._sum.quantity ?? 0]));
  table(wb, "อะไหล่", "รายการอะไหล่", sub,
    ["รหัสอะไหล่", "ชื่อ", "ประเภท", "ยี่ห้อ", "หมวด", "ใช้ไปทั้งหมด (ชิ้น)", "รออยู่ในใบงานค้าง (ชิ้น)"],
    parts.map((p) => [
      p.offCatalog ? "" : p.partCode, p.name, p.offCatalog ? "นอกสโตร์ (ไม่มี SKU)" : "ในสโตร์",
      p.brand ?? "", p.category ?? "", usedBy.get(p.id) ?? 0, waitBy.get(p.id) ?? 0,
    ])
  );

  // ── 8) รถ — ไม่แตะตารางบัตรเติมน้ำมัน/Easy Pass เลย ──
  const vehicles = await prisma.vehicle.findMany({
    orderBy: { plateNumber: "asc" },
    select: { plateNumber: true, brand: true, model: true, type: true, region: true, currentMileage: true, taxExpire: true, actExpire: true, insExpire: true, status: true },
  });
  table(wb, "รถ", "รถของบริษัท (ไม่มีข้อมูลบัตรเติมน้ำมัน/Easy Pass)", sub,
    ["ทะเบียน", "ยี่ห้อ", "รุ่น", "ประเภท", "ภาค", "เลขไมล์ล่าสุด", "ภาษีหมด", "พ.ร.บ.หมด", "ประกันหมด", "สถานะ"],
    vehicles.map((v) => [
      v.plateNumber, v.brand ?? "", v.model ?? "", v.type ?? "", v.region ?? "", v.currentMileage,
      thaiDateTime(v.taxExpire, false), thaiDateTime(v.actExpire, false), thaiDateTime(v.insExpire, false),
      VEHICLE_STATUS_LABELS[v.status] ?? v.status,
    ])
  );

  await wb.commit();
  await done;
  return Buffer.concat(chunks);
}

function thaiDay(ymd: string) {
  return thaiDateTime(bkkDayStart(ymd), false);
}
function typeLabel(t: string) {
  return t === "WASHER" ? "เครื่องซักผ้า" : t === "DRYER" ? "เครื่องอบผ้า" : t;
}

/**
 * ชีตใหม่พร้อมหัวเรื่อง — ทุกอย่างที่เป็นของทั้งชีต (ความกว้างคอลัมน์ หัวตารางค้างตอนเลื่อน) ต้องตั้งตอนสร้าง:
 * WorksheetWriter เขียนลงไฟล์ตั้งแต่แถวแรกที่ commit ตั้งทีหลังจะหายเงียบ ๆ
 */
function sheet(wb: ExcelJS.stream.xlsx.WorkbookWriter, name: string, title: string, sub: string, widths: number[], frozen = true): Sheet {
  const ws = wb.addWorksheet(name, frozen ? { views: [{ state: "frozen", ySplit: 4 }] } : {});
  ws.columns = widths.map((width) => ({ width }));
  const t = ws.addRow([title]);
  t.font = { bold: true, size: 14 };
  t.commit();
  const s = ws.addRow([sub]);
  s.font = { size: 10, color: { argb: "FF666666" } };
  s.commit();
  ws.addRow([]).commit();
  return ws;
}
function header(ws: Sheet, head: string[]) {
  const h = ws.addRow(head);
  h.font = { bold: true };
  h.eachCell((c) => (c.fill = HEAD_FILL));
  h.commit();
}
function finish(ws: Sheet, cols: number, rows: number) {
  // กรองได้ทุกคอลัมน์ — คนที่ขอ Excel คือคนที่จะเอาไปกรอง/pivot ต่อ
  if (rows) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows, column: cols } };
  if (!rows) ws.addRow(["ไม่มีข้อมูล"]).commit();
  ws.commit();
}
/** ชีตตาราง — ความกว้างคิดจากข้อมูลจริงก่อนสร้างชีต (ดูหมายเหตุที่ sheet()) */
function table(wb: ExcelJS.stream.xlsx.WorkbookWriter, name: string, title: string, sub: string, head: string[], rows: Cell[][]) {
  const widths = head.map((h, i) =>
    Math.min(44, Math.max(9, h.length + 2, ...rows.slice(0, 500).map((r) => String(r[i] ?? "").length + 2)))
  );
  const ws = sheet(wb, name, title, sub, widths);
  header(ws, head);
  rows.forEach((r) => ws.addRow(r).commit());
  finish(ws, head.length, rows.length);
}
