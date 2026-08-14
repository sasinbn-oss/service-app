/**
 * ข้อมูลของรายงานทั้งสี่ใบ
 *
 * แยกจาก routes เพราะแต่ละใบถูกเรียกสองทาง — ดูบนหน้าจอ (JSON) และโหลดเป็น Excel
 * ทั้งสองทางต้องได้ตัวเลขชุดเดียวกัน ถ้าคำนวณคนละที่จะเพี้ยนกันเมื่อไหร่ก็ได้
 *
 * ทุกใบคิดจากเคสที่เปิด/ปิดจริงในฐานข้อมูล ไม่ได้อ่านจากไฟล์ที่อัปโหลดโดยตรง
 */
import { prisma } from "../prisma";
import { SCORE_PER_DAY, WORK_STATUS_LABELS, outageScore } from "../utils/constants";

const SLA_HOURS = Number(process.env.MACHINE_SLA_HOURS) || 72;
const DAY_MS = 86_400_000;

/** เวลาไทย — วันนัดช่างเก็บเป็นวันล้วน ต้องเทียบกับ "วันนี้" ของคนใช้ ไม่ใช่ของเซิร์ฟเวอร์ */
const TZ = "Asia/Bangkok";

export function todayYmd(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: TZ });
}

function ymdToUtcRange(ymd: string) {
  const start = new Date(`${ymd}T00:00:00.000Z`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

function statusLabel(value: string | null) {
  return value ? WORK_STATUS_LABELS[value] ?? value : null;
}

/** ข้อมูลของเคสที่ทุกใบใช้ร่วมกัน */
const caseInclude = {
  branch: { select: { code: true, name: true, region: true, zone: true, ownership: true, grade: true } },
  machine: { select: { code: true, brand: true, type: true } },
  parts: { include: { sparePart: { select: { partCode: true } } } },
} as const;

type CaseRow = {
  id: number;
  kind: string;
  startedAt: Date;
  scheduledVisitAt: Date | null;
  symptom: string | null;
  workStatus: string | null;
  branch: { code: string; name: string; region: string | null; zone: string | null; ownership: string | null; grade: string | null };
  machine: { code: string; brand: string | null; type: string } | null;
  parts: { quantity: number; sparePart: { partCode: string } }[];
};

function toRow(o: CaseRow, now: Date) {
  const days = Math.floor((now.getTime() - o.startedAt.getTime()) / DAY_MS);
  return {
    id: o.id,
    kind: o.kind,
    branchCode: o.branch.code,
    branchName: o.branch.name,
    region: o.branch.region,
    zone: o.branch.zone,
    ownership: o.branch.ownership,
    machineCode: o.machine?.code ?? null,
    machineBrand: o.machine?.brand ?? null,
    startedAt: o.startedAt,
    days,
    score: outageScore(o.kind, o.startedAt, now),
    breached: now.getTime() - o.startedAt.getTime() > SLA_HOURS * 3_600_000,
    workStatus: o.workStatus,
    workStatusLabel: statusLabel(o.workStatus),
    symptom: o.symptom,
    scheduledVisitAt: o.scheduledVisitAt ? o.scheduledVisitAt.toISOString().slice(0, 10) : null,
    parts: o.parts.map((p) => (p.quantity > 1 ? `${p.sparePart.partCode} x${p.quantity}` : p.sparePart.partCode)).join(", ") || null,
  };
}

export type ReportRow = ReturnType<typeof toRow>;

export interface ReportSection {
  key: string;
  title: string;
  /** อธิบายว่าแถวในนี้คืออะไร ให้คนอ่านรายงานไม่ต้องเดา */
  hint?: string;
  rows: ReportRow[];
}

// ───────────────────────── ใบงานวันนี้ ─────────────────────────

/**
 * เรียงตามสิ่งที่ต้องทำก่อน ไม่ได้เรียงตามหมวด
 *
 * เคสที่รอลูกค้าจ่ายเงินหรือรอลูกค้าแจ้งซ่อมไม่อยู่ในใบนี้ เพราะช่างทำอะไรไม่ได้
 * ใส่เข้ามาจะกลายเป็นรายการยาวที่ไม่มีใครอ่านจนจบ
 */
export async function dailyReport(opts: { zone?: string; region?: string } = {}) {
  const now = new Date();
  const today = todayYmd(now);
  const { start: dayStart, end: dayEnd } = ymdToUtcRange(today);
  const breachBefore = new Date(now.getTime() - SLA_HOURS * 3_600_000);
  const branchWhere = {
    ...(opts.zone ? { zone: opts.zone } : {}),
    ...(opts.region ? { region: opts.region } : {}),
  };

  const lastImport = await prisma.machineImport.findFirst({ orderBy: { snapshotAt: "desc" } });

  const open = (await prisma.outage.findMany({
    where: { endedAt: null, branch: branchWhere },
    include: caseInclude,
    orderBy: { startedAt: "asc" },
  })) as unknown as CaseRow[];

  const rows = open.map((o) => toRow(o, now));
  const machineOff = rows.filter((r) => r.kind === "MACHINE_OFF");

  // ช่างลงมือได้เฉพาะสองสถานะนี้ อีกสองสถานะรอฝั่งลูกค้า
  const actionable = (r: ReportRow) =>
    r.workStatus === null || r.workStatus === "WAITING_PARTS" || r.workStatus === "WAITING_TECH";

  const sections: ReportSection[] = [
    {
      key: "breachedNoStatus",
      title: `เลย SLA ${SLA_HOURS} ชม. แล้วยังไม่มีใครระบุสถานะ`,
      hint: "กลุ่มที่หลุดมือ ควรตามก่อนใคร",
      rows: machineOff.filter((r) => r.breached && r.workStatus === null),
    },
    {
      key: "dueToday",
      title: "นัดช่างไว้วันนี้",
      rows: machineOff.filter((r) => r.scheduledVisitAt === today),
    },
    {
      key: "overdueVisit",
      title: "นัดไว้แล้วแต่เลยวันนัด",
      hint: "นัดแล้วไม่ได้เข้า ควรนัดใหม่หรือบอกเหตุผล",
      rows: machineOff.filter((r) => r.scheduledVisitAt !== null && r.scheduledVisitAt < today),
    },
    {
      key: "newest",
      title: "เพิ่งขึ้นใหม่จากไฟล์รอบล่าสุด",
      rows: lastImport
        ? machineOff.filter((r) => r.startedAt >= lastImport.snapshotAt)
        : [],
    },
    {
      key: "signalLost",
      title: "สัญญาณหายทั้งสาขา — งานทีมเน็ตเวิร์ก",
      hint: "ไม่ใช่งานช่างซ่อมเครื่อง ดับทั้งสาขามักเป็นสายขาดหรือไฟดับ",
      rows: rows.filter((r) => r.kind === "SIGNAL_LOST"),
    },
  ];

  return {
    kind: "daily" as const,
    title: "ใบงานวันนี้",
    generatedAt: now,
    date: today,
    scope: opts.zone ?? opts.region ?? "ทุกพื้นที่",
    lastImportAt: lastImport?.snapshotAt ?? null,
    summary: {
      openTotal: rows.length,
      score: rows.reduce((s, r) => s + r.score, 0),
      actionable: machineOff.filter(actionable).length,
      waitingCustomer: machineOff.length - machineOff.filter(actionable).length,
    },
    sections,
  };
}

// ───────────────────────── สรุปรายสัปดาห์ ─────────────────────────

interface GroupStat {
  label: string;
  score: number;
  cases: number;
  branches: number;
  breached: number;
  noStatus: number;
  overdueVisit: number;
}

function groupBy(rows: ReportRow[], pick: (r: ReportRow) => string | null, fallback: string, today: string): GroupStat[] {
  const map = new Map<string, GroupStat & { branchSet: Set<string> }>();
  for (const r of rows) {
    const label = pick(r) ?? fallback;
    const g =
      map.get(label) ??
      { label, score: 0, cases: 0, branches: 0, breached: 0, noStatus: 0, overdueVisit: 0, branchSet: new Set<string>() };
    g.score += r.score;
    g.cases += 1;
    g.branchSet.add(r.branchCode);
    if (r.breached) g.breached += 1;
    if (r.workStatus === null) g.noStatus += 1;
    if (r.scheduledVisitAt !== null && r.scheduledVisitAt < today) g.overdueVisit += 1;
    map.set(label, g);
  }
  return [...map.values()]
    .map(({ branchSet, ...g }) => ({ ...g, branches: branchSet.size }))
    .sort((a, b) => b.score - a.score);
}

export async function weeklyReport() {
  const now = new Date();
  const today = todayYmd(now);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  const open = (await prisma.outage.findMany({
    where: { endedAt: null },
    include: caseInclude,
    orderBy: { startedAt: "asc" },
  })) as unknown as CaseRow[];
  const rows = open.map((o) => toRow(o, now));

  const [openedThisWeek, closedThisWeek] = await Promise.all([
    prisma.outage.count({ where: { startedAt: { gte: weekAgo } } }),
    prisma.outage.count({ where: { endedAt: { gte: weekAgo } } }),
  ]);

  // เทียบกับ snapshot ที่ใกล้ 7 วันก่อนที่สุด ถ้ายังไม่มีก็ไม่ต้องเทียบ
  const previous = await prisma.machineImport.findFirst({
    where: { snapshotAt: { lte: weekAgo }, totalScore: { gt: 0 } },
    orderBy: { snapshotAt: "desc" },
    select: { snapshotAt: true, totalScore: true },
  });

  const score = rows.reduce((s, r) => s + r.score, 0);

  return {
    kind: "weekly" as const,
    title: "สรุปรายสัปดาห์ตามภาคและทีมช่าง",
    generatedAt: now,
    summary: {
      score,
      previousScore: previous?.totalScore ?? null,
      previousAt: previous?.snapshotAt ?? null,
      openTotal: rows.length,
      branches: new Set(rows.map((r) => r.branchCode)).size,
      breached: rows.filter((r) => r.breached).length,
      noStatus: rows.filter((r) => r.workStatus === null).length,
      openedThisWeek,
      closedThisWeek,
    },
    byRegion: groupBy(rows, (r) => r.region, "ยังไม่ระบุภาค", today),
    byZone: groupBy(rows, (r) => r.zone, "ยังไม่ระบุทีมช่าง", today),
    byOwnership: groupBy(rows, (r) => r.ownership, "ไม่ระบุเจ้าของ", today),
  };
}

// ───────────────────────── ภาพรวมผู้บริหาร ─────────────────────────

/**
 * ใบเดียวที่คิดจากเคสที่ "ปิดแล้ว" เป็นหลัก
 *
 * ถ้ายังไม่มีเคสปิดเลย ตัวเลขจะเป็นศูนย์ทั้งแผง ซึ่งไม่ได้แปลว่าดี
 * รายงานจึงส่ง hasHistory มาให้หน้าจอบอกผู้อ่านตรง ๆ ว่ายังไม่มีข้อมูลพอ
 */
export async function monthlyReport(opts: { months?: number } = {}) {
  const now = new Date();
  const months = opts.months ?? 1;
  const since = new Date(now.getTime() - months * 30 * DAY_MS);
  const since90 = new Date(now.getTime() - 90 * DAY_MS);
  const since180 = new Date(now.getTime() - 180 * DAY_MS);

  const closed = await prisma.outage.findMany({
    where: { endedAt: { gte: since } },
    select: {
      kind: true,
      startedAt: true,
      endedAt: true,
      branch: { select: { code: true, name: true, region: true, zone: true, ownership: true } },
    },
  });

  const hours = (o: { startedAt: Date; endedAt: Date | null }) =>
    ((o.endedAt ?? now).getTime() - o.startedAt.getTime()) / 3_600_000;

  const withinSla = closed.filter((o) => hours(o) <= SLA_HOURS).length;
  const avgDays = closed.length ? closed.reduce((s, o) => s + hours(o), 0) / closed.length / 24 : 0;

  // เวลาเฉลี่ยแยกภาค — เอาไว้ดูว่าช้าเพราะพื้นที่หรือเพราะทีม
  const byRegion = new Map<string, { label: string; closed: number; totalHours: number; withinSla: number }>();
  for (const o of closed) {
    const label = o.branch.region ?? "ยังไม่ระบุภาค";
    const g = byRegion.get(label) ?? { label, closed: 0, totalHours: 0, withinSla: 0 };
    g.closed += 1;
    g.totalHours += hours(o);
    if (hours(o) <= SLA_HOURS) g.withinSla += 1;
    byRegion.set(label, g);
  }

  const [repeatBranchRaw, repeatMachineRaw] = await Promise.all([
    prisma.outage.groupBy({
      by: ["branchId"],
      where: { startedAt: { gte: since90 } },
      _count: true,
      orderBy: { _count: { branchId: "desc" } },
      take: 15,
    }),
    prisma.outage.groupBy({
      by: ["machineId"],
      where: { startedAt: { gte: since180 }, machineId: { not: null } },
      _count: true,
      orderBy: { _count: { machineId: "desc" } },
      take: 15,
    }),
  ]);

  const branchIds = repeatBranchRaw.map((r) => r.branchId);
  const machineIds = repeatMachineRaw.map((r) => r.machineId!).filter(Boolean);
  const [branches, machines] = await Promise.all([
    prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, code: true, name: true, region: true } }),
    prisma.machine.findMany({
      where: { id: { in: machineIds } },
      select: { id: true, code: true, brand: true, branch: { select: { code: true, name: true } } },
    }),
  ]);

  const trend = await prisma.machineImport.findMany({
    where: { snapshotAt: { gte: since }, totalScore: { gt: 0 } },
    select: { snapshotAt: true, machineOffScore: true, signalLostScore: true, totalScore: true },
    orderBy: { snapshotAt: "asc" },
  });

  return {
    kind: "monthly" as const,
    title: "ภาพรวมผู้บริหาร",
    generatedAt: now,
    periodDays: months * 30,
    hasHistory: closed.length > 0,
    summary: {
      closed: closed.length,
      withinSla,
      withinSlaPercent: closed.length ? Math.round((withinSla / closed.length) * 100) : null,
      avgDays: closed.length ? Number(avgDays.toFixed(1)) : null,
      slaHours: SLA_HOURS,
    },
    byRegion: [...byRegion.values()]
      .map((g) => ({
        label: g.label,
        closed: g.closed,
        avgDays: Number((g.totalHours / g.closed / 24).toFixed(1)),
        withinSlaPercent: Math.round((g.withinSla / g.closed) * 100),
      }))
      .sort((a, b) => b.avgDays - a.avgDays),
    repeatBranches: repeatBranchRaw
      .map((r) => {
        const b = branches.find((x) => x.id === r.branchId);
        return { code: b?.code ?? "?", name: b?.name ?? "?", region: b?.region ?? null, times: r._count };
      })
      .filter((r) => r.times > 1),
    repeatMachines: repeatMachineRaw
      .map((r) => {
        const m = machines.find((x) => x.id === r.machineId);
        return {
          branchCode: m?.branch.code ?? "?",
          branchName: m?.branch.name ?? "?",
          machineCode: m?.code ?? "?",
          brand: m?.brand ?? null,
          times: r._count,
        };
      })
      .filter((r) => r.times > 1),
    trend: trend.map((t) => ({
      at: t.snapshotAt,
      machineOff: t.machineOffScore,
      signalLost: t.signalLostScore,
      total: t.totalScore,
    })),
    scorePerDay: SCORE_PER_DAY,
  };
}

// ───────────────────────── อะไหล่ที่ต้องสั่ง ─────────────────────────

export async function partsReport() {
  const now = new Date();
  const rows = await prisma.outagePart.findMany({
    where: { outage: { endedAt: null } },
    include: {
      sparePart: { select: { id: true, partCode: true, name: true, brand: true } },
      outage: {
        select: {
          startedAt: true,
          branch: { select: { code: true, name: true, region: true } },
          machine: { select: { code: true } },
        },
      },
    },
  });

  const byPart = new Map<
    number,
    {
      sparePartId: number;
      partCode: string;
      name: string;
      brand: string | null;
      quantity: number;
      cases: number;
      oldestDays: number;
      branches: string[];
    }
  >();

  for (const row of rows) {
    const key = row.sparePart.id;
    const days = Math.floor((now.getTime() - row.outage.startedAt.getTime()) / DAY_MS);
    const entry =
      byPart.get(key) ??
      {
        sparePartId: key,
        partCode: row.sparePart.partCode,
        name: row.sparePart.name,
        brand: row.sparePart.brand,
        quantity: 0,
        cases: 0,
        oldestDays: 0,
        branches: [] as string[],
      };
    entry.quantity += row.quantity;
    entry.cases += 1;
    entry.oldestDays = Math.max(entry.oldestDays, days);
    if (!entry.branches.includes(row.outage.branch.code)) entry.branches.push(row.outage.branch.code);
    byPart.set(key, entry);
  }

  const parts = [...byPart.values()].sort(
    (a, b) => b.quantity - a.quantity || a.partCode.localeCompare(b.partCode)
  );

  return {
    kind: "parts" as const,
    title: "อะไหล่ที่ต้องสั่ง",
    generatedAt: now,
    summary: {
      distinctParts: parts.length,
      totalQuantity: parts.reduce((s, p) => s + p.quantity, 0),
      cases: rows.length,
      branches: new Set(rows.map((r) => r.outage.branch.code)).size,
    },
    parts,
  };
}

export type DailyReport = Awaited<ReturnType<typeof dailyReport>>;
export type WeeklyReport = Awaited<ReturnType<typeof weeklyReport>>;
export type MonthlyReport = Awaited<ReturnType<typeof monthlyReport>>;
export type PartsReport = Awaited<ReturnType<typeof partsReport>>;
