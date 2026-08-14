/**
 * แดชบอร์ดติดตามปัญหาเครื่อง และการนำเข้าไฟล์ export
 *
 * มีสองปัญหาที่แยกกันคนละเรื่อง คนละคนแก้ จึงมีสอง endpoint ไม่ใช่รายการเดียวปนกัน
 *   เครื่องดับ   — รายเครื่อง ช่างไปเปลี่ยนอะไหล่
 *   สัญญาณหาย   — รายสาขา ทีมเน็ตเวิร์กไปดูเราเตอร์
 *
 * เวลาที่ใช้คิด SLA มาจากเคสที่เปิดค้างอยู่ (Outage) ไม่ใช่จากไฟล์
 * เพราะไฟล์บอกแค่ว่าตอนนี้ใครมีปัญหา ไม่ได้บอกว่าเริ่มเมื่อไหร่
 */
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { applyImport, parseWorkbook, planImport } from "../machines/import";
import { dailyReport, monthlyReport, partsReport, weeklyReport } from "../machines/reports";
import { reportToWorkbook } from "../machines/reportExcel";
import { documentPath, saveDocument } from "../documents/store";
import {
  FILTERABLE_WORK_STATUSES,
  SCORE_PER_DAY,
  WORK_STATUSES,
  WORK_STATUS_LABELS,
  outageScore,
} from "../utils/constants";

const router = Router();

/** เกินกี่ชั่วโมงถือว่าเลย SLA — ตั้งทับได้ด้วย env โดยไม่ต้องแก้โค้ด */
const SLA_HOURS = Number(process.env.MACHINE_SLA_HOURS) || 72;

const listSchema = z.object({
  ownership: z.enum(["COCO", "DODO"]).optional(),
  grade: z.enum(["A", "B", "C"]).optional(),
  region: z.string().optional(),
  zone: z.string().optional(),
  search: z.string().optional(),
  breachedOnly: z.enum(["true", "false"]).optional(),
  // "NONE" คือเคสที่ยังไม่มีใครกรอกสถานะ ซึ่งเป็นกลุ่มที่ต้องตามมากที่สุด
  workStatus: z.enum([...FILTERABLE_WORK_STATUSES, "NONE"]).optional(),
});

function workStatusFilter(value?: string) {
  if (!value) return {};
  return value === "NONE" ? { workStatus: null } : { workStatus: value };
}

/**
 * ข้อมูลของเคสที่คนกรอกเอง ใช้เหมือนกันทั้งสองแท็บ
 *
 * มีสองรูปเพราะ Prisma รับคนละอย่าง — include รับได้เฉพาะ relation
 * (ฟิลด์ธรรมดาติดมาเองอยู่แล้ว) ส่วน select ต้องระบุครบทุกฟิลด์ที่อยากได้
 */
const noteInclude = {
  noteUpdatedBy: { select: { name: true } },
  parts: {
    include: { sparePart: { select: { id: true, partCode: true, name: true, brand: true } } },
    orderBy: { id: "asc" },
  },
} as const;

const noteSelect = {
  symptom: true,
  workStatus: true,
  scheduledVisitAt: true,
  noteUpdatedAt: true,
  ...noteInclude,
} as const;

interface NoteShape {
  symptom: string | null;
  workStatus: string | null;
  scheduledVisitAt: Date | null;
  noteUpdatedAt: Date | null;
  noteUpdatedBy: { name: string } | null;
  parts: {
    quantity: number;
    sparePart: { id: number; partCode: string; name: string; brand: string | null };
  }[];
}

function noteFields(o: NoteShape) {
  return {
    symptom: o.symptom,
    workStatus: o.workStatus,
    workStatusLabel: o.workStatus
      ? WORK_STATUS_LABELS[o.workStatus] ?? o.workStatus
      : null,
    scheduledVisitAt: o.scheduledVisitAt ? isoDate(o.scheduledVisitAt) : null,
    noteUpdatedAt: o.noteUpdatedAt,
    noteUpdatedBy: o.noteUpdatedBy?.name ?? null,
    parts: o.parts.map((p) => ({
      sparePartId: p.sparePart.id,
      partCode: p.sparePart.partCode,
      name: p.sparePart.name,
      brand: p.sparePart.brand,
      quantity: p.quantity,
    })),
  };
}

function branchFilter(query: z.infer<typeof listSchema>) {
  return {
    ...(query.ownership ? { ownership: query.ownership } : {}),
    ...(query.grade ? { grade: query.grade } : {}),
    // NONE = สาขาที่ยังไม่มีภาคในทะเบียน ต้องกรองหาได้เหมือนกัน
    ...(query.region ? (query.region === "NONE" ? { region: null } : { region: query.region }) : {}),
    ...(query.zone ? { zone: query.zone } : {}),
  };
}

function hoursSince(from: Date, now: Date) {
  return (now.getTime() - from.getTime()) / 3_600_000;
}

/** สรุปอะไหล่เป็นบรรทัดเดียวสำหรับเก็บลงประวัติ ว่างเมื่อไม่มีอะไหล่ */
function partsSummary(parts: NoteShape["parts"]) {
  if (parts.length === 0) return null;
  return parts
    .map((p) => (p.quantity > 1 ? `${p.sparePart.partCode} x${p.quantity}` : p.sparePart.partCode))
    .join(", ");
}

/** วันนัดเก็บเป็นวันล้วน ส่งออกเป็น YYYY-MM-DD เพื่อไม่ให้ timezone ของเครื่องคนอ่านเลื่อนวัน */
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * ตัวเลขสรุปที่ใช้ร่วมกันทั้งสองแท็บ
 *
 * นับสาขาด้วย ไม่ใช่แค่จำนวนเคส เพราะ "ดับ 40 เครื่อง" กระจายอยู่ 40 สาขา
 * กับกระจุกอยู่ 3 สาขา เป็นคนละปัญหาและใช้คนละวิธีแก้
 */
function summarise(rows: { ownership: string | null; branchCode: string; breached: boolean; score: number }[]) {
  return {
    total: rows.length,
    branchesAffected: new Set(rows.map((r) => r.branchCode)).size,
    COCO: rows.filter((r) => r.ownership === "COCO").length,
    DODO: rows.filter((r) => r.ownership === "DODO").length,
    breached: rows.filter((r) => r.breached).length,
    totalScore: rows.reduce((sum, r) => sum + r.score, 0),
  };
}

/** เครื่องที่ดับอยู่ — รายเครื่อง */
router.get("/outages", requireAuth, async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const query = parsed.data;
  const now = new Date();
  const breachBefore = new Date(now.getTime() - SLA_HOURS * 3_600_000);
  const keyword = query.search?.trim();

  const outages = await prisma.outage.findMany({
    where: {
      kind: "MACHINE_OFF",
      endedAt: null,
      ...(query.breachedOnly === "true" ? { startedAt: { lt: breachBefore } } : {}),
      ...workStatusFilter(query.workStatus),
      branch: branchFilter(query),
      ...(keyword
        ? {
            OR: [
              { branch: { code: { contains: keyword, mode: "insensitive" } } },
              { branch: { name: { contains: keyword, mode: "insensitive" } } },
              { machine: { code: { contains: keyword, mode: "insensitive" } } },
              { machine: { brand: { contains: keyword, mode: "insensitive" } } },
              { symptom: { contains: keyword, mode: "insensitive" } },
              // พิมพ์รหัสอะไหล่เพื่อดูว่ามีเคสไหนรออะไหล่ตัวนี้อยู่บ้าง
              { parts: { some: { sparePart: { partCode: { contains: keyword, mode: "insensitive" } } } } },
              { parts: { some: { sparePart: { name: { contains: keyword, mode: "insensitive" } } } } },
            ],
          }
        : {}),
    },
    include: {
      ...noteInclude,
      branch: {
        select: { code: true, name: true, region: true, ownership: true, zone: true, grade: true },
      },
      machine: { select: { code: true, type: true, brand: true } },
    },
    // ดับนานสุดขึ้นก่อน เพราะนั่นคือลำดับที่ควรเข้าไปซ่อม
    orderBy: { startedAt: "asc" },
  });

  const rows = outages.map((o) => ({
    id: o.id,
    branchCode: o.branch.code,
    branchName: o.branch.name,
    region: o.branch.region,
    ownership: o.branch.ownership,
    zone: o.branch.zone,
    grade: o.branch.grade,
    machineCode: o.machine?.code ?? "",
    machineType: o.machine?.type ?? "",
    machineBrand: o.machine?.brand ?? null,
    startedAt: o.startedAt,
    lastSeenAt: o.lastSeenAt,
    slaHours: Math.floor(hoursSince(o.startedAt, now)),
    breached: o.startedAt < breachBefore,
    score: outageScore("MACHINE_OFF", o.startedAt, now),
    ...noteFields(o),
  }));

  res.json({
    now: now.toISOString(),
    slaHours: SLA_HOURS,
    scorePerDay: SCORE_PER_DAY.MACHINE_OFF,
    summary: summarise(rows),
    rows,
  });
});

/** สาขาที่สัญญาณหาย — รายสาขา ไม่ใช่รายเครื่อง */
router.get("/signal-lost", requireAuth, async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const query = parsed.data;
  const now = new Date();
  const breachBefore = new Date(now.getTime() - SLA_HOURS * 3_600_000);
  const keyword = query.search?.trim();

  const outages = await prisma.outage.findMany({
    where: {
      kind: "SIGNAL_LOST",
      endedAt: null,
      ...(query.breachedOnly === "true" ? { startedAt: { lt: breachBefore } } : {}),
      ...workStatusFilter(query.workStatus),
      branch: branchFilter(query),
      ...(keyword
        ? {
            OR: [
              { branch: { code: { contains: keyword, mode: "insensitive" } } },
              { branch: { name: { contains: keyword, mode: "insensitive" } } },
              { symptom: { contains: keyword, mode: "insensitive" } },
              { parts: { some: { sparePart: { partCode: { contains: keyword, mode: "insensitive" } } } } },
              { parts: { some: { sparePart: { name: { contains: keyword, mode: "insensitive" } } } } },
            ],
          }
        : {}),
    },
    include: {
      ...noteInclude,
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
          region: true,
          ownership: true,
          zone: true,
          grade: true,
          _count: { select: { machines: true } },
        },
      },
    },
    orderBy: { startedAt: "asc" },
  });

  const rows = outages.map((o) => ({
    id: o.id,
    branchCode: o.branch.code,
    branchName: o.branch.name,
    region: o.branch.region,
    ownership: o.branch.ownership,
    zone: o.branch.zone,
    grade: o.branch.grade,
    machineCount: o.branch._count.machines,
    startedAt: o.startedAt,
    lastSeenAt: o.lastSeenAt,
    slaHours: Math.floor(hoursSince(o.startedAt, now)),
    breached: o.startedAt < breachBefore,
    score: outageScore("SIGNAL_LOST", o.startedAt, now),
    ...noteFields(o),
  }));

  res.json({
    now: now.toISOString(),
    slaHours: SLA_HOURS,
    scorePerDay: SCORE_PER_DAY.SIGNAL_LOST,
    summary: {
      ...summarise(rows),
      machinesAffected: rows.reduce((sum, r) => sum + r.machineCount, 0),
    },
    rows,
  });
});

/** ตัวเลขรวมของทั้งสองแท็บ ใช้ตอนเปิดหน้าเพื่อขึ้นตัวเลขบนแท็บ */
router.get("/overview", requireAuth, async (_req, res) => {
  const now = new Date();
  const breachBefore = new Date(now.getTime() - SLA_HOURS * 3_600_000);
  const [machineOff, signalLost, machineBreached, signalBreached, lastImport] = await Promise.all([
    prisma.outage.count({ where: { kind: "MACHINE_OFF", endedAt: null } }),
    prisma.outage.count({ where: { kind: "SIGNAL_LOST", endedAt: null } }),
    prisma.outage.count({
      where: { kind: "MACHINE_OFF", endedAt: null, startedAt: { lt: breachBefore } },
    }),
    prisma.outage.count({
      where: { kind: "SIGNAL_LOST", endedAt: null, startedAt: { lt: breachBefore } },
    }),
    prisma.machineImport.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  res.json({
    now: now.toISOString(),
    slaHours: SLA_HOURS,
    machineOff,
    signalLost,
    machineBreached,
    signalBreached,
    lastImport,
  });
});

/** ตัวเลือกสถานะการดำเนินการ ให้แอปเอาไปทำปุ่มโดยไม่ต้องฝังรายการไว้เอง */
router.get("/work-statuses", requireAuth, (_req, res) => {
  res.json(WORK_STATUSES.map((value) => ({ value, label: WORK_STATUS_LABELS[value] })));
});

/**
 * ภาคที่มีปัญหาค้างอยู่ พร้อมจำนวน ใช้ทำตัวกรองใต้ COCO/DODO
 *
 * แยก endpoint เพราะถ้าดึงจากแถวที่แสดงอยู่ พอเลือกภาคหนึ่งแล้วรายการจะเหลือภาคเดียว
 * แล้วสลับไปภาคอื่นไม่ได้
 */
const regionQuery = z.object({
  kind: z.enum(["MACHINE_OFF", "SIGNAL_LOST"]).default("MACHINE_OFF"),
  ownership: z.enum(["COCO", "DODO"]).optional(),
});

router.get("/regions", requireAuth, async (req, res) => {
  const parsed = regionQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const outages = await prisma.outage.findMany({
    where: {
      kind: parsed.data.kind,
      endedAt: null,
      branch: parsed.data.ownership ? { ownership: parsed.data.ownership } : {},
    },
    select: { branchId: true, branch: { select: { region: true } } },
  });

  const byRegion = new Map<string, { cases: number; branches: Set<number> }>();
  for (const o of outages) {
    // ภาคว่างรวมเป็นกลุ่มเดียว จะได้กรองหาสาขาที่ทะเบียนยังไม่ครบได้
    const key = o.branch.region ?? "";
    const entry = byRegion.get(key) ?? { cases: 0, branches: new Set<number>() };
    entry.cases += 1;
    entry.branches.add(o.branchId);
    byRegion.set(key, entry);
  }

  res.json(
    [...byRegion]
      .map(([region, v]) => ({
        region: region || null,
        label: region || "ยังไม่ระบุภาค",
        cases: v.cases,
        branches: v.branches.size,
      }))
      .sort((a, b) => b.cases - a.cases)
  );
});

const noteSchema = z.object({
  symptom: z.string().trim().max(500).nullable().optional(),
  workStatus: z.enum(WORK_STATUSES).nullable().optional(),
  // วันล้วน YYYY-MM-DD ไม่รับเวลา เพราะนัดช่างกันเป็นวัน
  scheduledVisitAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องอยู่ในรูปแบบ ปี-เดือน-วัน เช่น 2026-08-20")
    .nullable()
    .optional(),
  // ส่งมาทั้งชุดเสมอ ระบบแทนที่ของเดิมทั้งหมด — ส่ง [] คือล้างอะไหล่ออกให้หมด
  parts: z
    .array(
      z.object({
        sparePartId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(999).default(1),
      })
    )
    .max(20)
    .optional(),
});

/**
 * บันทึกอาการและสถานะการดำเนินการของเคส
 *
 * ช่างที่ไปหน้างานเป็นคนรู้ว่าเสียเพราะอะไรและติดอยู่ที่ขั้นไหน จึงเปิดให้ผู้ใช้ทุกคน
 * แก้ได้ ไม่จำกัดเฉพาะแอดมิน แต่บันทึกไว้ว่าใครแก้ล่าสุดเมื่อไหร่
 */
router.patch("/outages/:id/note", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id ไม่ถูกต้อง" });

  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { symptom, workStatus, parts, scheduledVisitAt } = parsed.data;
  if (
    symptom === undefined &&
    workStatus === undefined &&
    parts === undefined &&
    scheduledVisitAt === undefined
  ) {
    return res.status(400).json({ error: "ไม่มีอะไรให้บันทึก" });
  }

  // เก็บเป็นเที่ยงคืน UTC ของวันนั้น อ่านกลับมาได้วันเดิมเสมอไม่ว่าเซิร์ฟเวอร์อยู่โซนไหน
  let visitDate: Date | null | undefined;
  if (scheduledVisitAt !== undefined) {
    visitDate = scheduledVisitAt ? new Date(`${scheduledVisitAt}T00:00:00.000Z`) : null;
    if (visitDate && Number.isNaN(visitDate.getTime())) {
      return res.status(400).json({ error: "วันที่ไม่ถูกต้อง" });
    }
  }

  const outage = await prisma.outage.findUnique({ where: { id }, select: { id: true } });
  if (!outage) return res.status(404).json({ error: "ไม่พบเคสนี้" });

  // อะไหล่ตัวเดิมส่งมาซ้ำให้รวมจำนวนกัน ไม่ใช่ error — ฟอร์มกันไว้แล้วแต่ API ต้องกันเองด้วย
  const wanted = new Map<number, number>();
  for (const p of parts ?? []) {
    wanted.set(p.sparePartId, (wanted.get(p.sparePartId) ?? 0) + p.quantity);
  }

  if (wanted.size > 0) {
    const found = await prisma.sparePart.findMany({
      where: { id: { in: [...wanted.keys()] } },
      select: { id: true },
    });
    const missing = [...wanted.keys()].filter((pid) => !found.some((f) => f.id === pid));
    if (missing.length > 0) {
      return res.status(400).json({ error: `ไม่พบอะไหล่รหัสภายใน: ${missing.join(", ")}` });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    // แทนที่ทั้งชุด ง่ายกว่าไล่หาว่าอันไหนเพิ่มอันไหนลบ และจำนวนแถวต่อเคสมีไม่กี่แถว
    if (parts !== undefined) {
      await tx.outagePart.deleteMany({ where: { outageId: id } });
      if (wanted.size > 0) {
        await tx.outagePart.createMany({
          data: [...wanted].map(([sparePartId, quantity]) => ({ outageId: id, sparePartId, quantity })),
        });
      }
    }

    const saved = await tx.outage.update({
      where: { id },
      data: {
        ...(symptom !== undefined ? { symptom: symptom || null } : {}),
        ...(workStatus !== undefined ? { workStatus } : {}),
        ...(visitDate !== undefined ? { scheduledVisitAt: visitDate } : {}),
        noteUpdatedAt: new Date(),
        noteUpdatedById: req.auth!.userId,
      },
      select: noteSelect,
    });

    // เก็บทุกครั้งที่กดบันทึก ไม่ใช่แค่คนล่าสุด จะได้ตามได้ว่าใครเคยกรอกอะไรไว้บ้าง
    await tx.outageNoteLog.create({
      data: {
        outageId: id,
        userId: req.auth!.userId,
        symptom: saved.symptom,
        workStatus: saved.workStatus,
        scheduledVisitAt: saved.scheduledVisitAt,
        partsSummary: partsSummary(saved.parts),
      },
    });

    return saved;
  });

  res.json({ id, ...noteFields(updated) });
});

/** แปลงแถวประวัติเป็นรูปที่หน้าจออ่านได้เลย */
function noteLogRow(log: {
  id: number;
  symptom: string | null;
  workStatus: string | null;
  scheduledVisitAt: Date | null;
  partsSummary: string | null;
  createdAt: Date;
  user: { name: string } | null;
}) {
  return {
    id: log.id,
    by: log.user?.name ?? "ผู้ใช้ที่ถูกลบแล้ว",
    at: log.createdAt,
    symptom: log.symptom,
    workStatus: log.workStatus,
    workStatusLabel: log.workStatus ? WORK_STATUS_LABELS[log.workStatus] ?? log.workStatus : null,
    scheduledVisitAt: log.scheduledVisitAt ? isoDate(log.scheduledVisitAt) : null,
    partsSummary: log.partsSummary,
  };
}

const noteLogSelect = {
  id: true,
  symptom: true,
  workStatus: true,
  scheduledVisitAt: true,
  partsSummary: true,
  createdAt: true,
  user: { select: { name: true } },
} as const;

/** ประวัติการกรอกของเคสเดียว เก่าสุดอยู่บนสุด อ่านเป็นไทม์ไลน์ */
router.get("/outages/:id/note-logs", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id ไม่ถูกต้อง" });

  const logs = await prisma.outageNoteLog.findMany({
    where: { outageId: id },
    select: noteLogSelect,
    orderBy: { createdAt: "asc" },
  });
  res.json(logs.map(noteLogRow));
});

const activityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * ประวัติการกรอกล่าสุดของทุกเคสรวมกัน
 *
 * ตอบคำถามว่า "วันนี้มีใครมาอัปเดตอะไรบ้าง" โดยไม่ต้องเปิดเคสทีละอัน
 */
router.get("/note-logs", requireAuth, async (req, res) => {
  const parsed = activityQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const logs = await prisma.outageNoteLog.findMany({
    select: {
      ...noteLogSelect,
      outage: {
        select: {
          id: true,
          kind: true,
          endedAt: true,
          branch: { select: { code: true, name: true } },
          machine: { select: { code: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: parsed.data.limit,
  });

  res.json(
    logs.map((log) => ({
      ...noteLogRow(log),
      outageId: log.outage.id,
      kind: log.outage.kind,
      // เคสที่ปิดไปแล้วยังต้องเห็นในประวัติ แต่ควรรู้ว่าปิดแล้ว
      resolved: log.outage.endedAt !== null,
      branchCode: log.outage.branch.code,
      branchName: log.outage.branch.name,
      machineCode: log.outage.machine?.code ?? null,
    }))
  );
});

/**
 * อะไหล่ที่ค้างอยู่ทั้งหมด รวมยอดข้ามสาขา
 *
 * เหตุผลที่เก็บเป็นรหัสอะไหล่จริงแทนที่จะให้พิมพ์เอง — จะได้ตอบได้ว่าตอนนี้
 * ต้องสั่งอะไรเข้ามาบ้างกี่ตัว โดยไม่ต้องไล่เปิดทีละเคส
 */
router.get("/waiting-parts", requireAuth, async (_req, res) => {
  const rows = await prisma.outagePart.findMany({
    where: { outage: { endedAt: null } },
    include: {
      sparePart: { select: { id: true, partCode: true, name: true, brand: true } },
      outage: { select: { branch: { select: { code: true, name: true } } } },
    },
  });

  const byPart = new Map<
    number,
    {
      sparePartId: number;
      partCode: string;
      name: string;
      brand: string | null;
      totalQuantity: number;
      caseCount: number;
      branches: string[];
    }
  >();

  for (const row of rows) {
    const key = row.sparePart.id;
    const entry = byPart.get(key) ?? {
      sparePartId: key,
      partCode: row.sparePart.partCode,
      name: row.sparePart.name,
      brand: row.sparePart.brand,
      totalQuantity: 0,
      caseCount: 0,
      branches: [],
    };
    entry.totalQuantity += row.quantity;
    entry.caseCount += 1;
    if (!entry.branches.includes(row.outage.branch.code)) entry.branches.push(row.outage.branch.code);
    byPart.set(key, entry);
  }

  res.json(
    [...byPart.values()].sort((a, b) => b.totalQuantity - a.totalQuantity || a.partCode.localeCompare(b.partCode))
  );
});

const historyQuery = z.object({
  // จัดกลุ่มตามอะไร — none คือรวมทั้งประเทศเป็นเส้นเดียว
  groupBy: z.enum(["none", "region", "zone", "ownership"]).default("none"),
  kind: z.enum(["MACHINE_OFF", "SIGNAL_LOST", "ALL"]).default("ALL"),
  days: z.coerce.number().int().min(1).max(400).default(60),
});

/**
 * คะแนนย้อนหลังจาก snapshot ที่ตรึงไว้ทุกรอบอัปโหลด
 *
 * คะแนนบนแดชบอร์ดคิดสดจากเวลาปัจจุบัน พอเคสปิดคะแนนก็หายไปด้วย
 * ตัวนี้อ่านจากค่าที่ตรึงไว้ จึงย้อนดูได้ว่าแต่ละรอบภาคไหนหนักแค่ไหน
 */
router.get("/score-history", requireAuth, async (req, res) => {
  const parsed = historyQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { groupBy, kind, days } = parsed.data;

  const since = new Date(Date.now() - days * 86_400_000);
  const snapshots = await prisma.scoreSnapshot.findMany({
    where: {
      snapshotAt: { gte: since },
      ...(kind === "ALL" ? {} : { kind }),
    },
    select: {
      snapshotAt: true,
      kind: true,
      region: true,
      zone: true,
      ownership: true,
      cases: true,
      score: true,
      breached: true,
      branchId: true,
    },
    orderBy: { snapshotAt: "asc" },
  });

  // รวมยอดเป็นจุดต่อรอบอัปโหลด แล้วแยกตามกลุ่มที่ขอ
  const points = new Map<
    string,
    { at: Date; group: string | null; score: number; cases: number; breached: number; branches: Set<number> }
  >();

  for (const row of snapshots) {
    const group =
      groupBy === "none"
        ? null
        : groupBy === "region"
          ? row.region
          : groupBy === "zone"
            ? row.zone
            : row.ownership;
    const key = `${row.snapshotAt.toISOString()}|${group ?? ""}`;
    const point =
      points.get(key) ??
      { at: row.snapshotAt, group, score: 0, cases: 0, breached: 0, branches: new Set<number>() };
    point.score += row.score;
    point.cases += row.cases;
    point.breached += row.breached;
    point.branches.add(row.branchId);
    points.set(key, point);
  }

  res.json({
    groupBy,
    kind,
    days,
    points: [...points.values()]
      .map((p) => ({
        at: p.at,
        group: p.group,
        label: p.group ?? (groupBy === "none" ? "ทั้งหมด" : "ยังไม่ระบุ"),
        score: p.score,
        cases: p.cases,
        breached: p.breached,
        branches: p.branches.size,
      }))
      .sort((a, b) => a.at.getTime() - b.at.getTime() || a.label.localeCompare(b.label)),
  });
});

/**
 * รายงานสี่ใบ
 *
 * ใบเดียวกันเรียกได้สองแบบ — ไม่ใส่ format ได้ JSON ไปขึ้นหน้าจอ
 * ใส่ format=xlsx ได้ลิงก์ดาวน์โหลด Excel ตัวเลขมาจากฟังก์ชันเดียวกันทั้งสองทาง
 */
const reportQuery = z.object({
  zone: z.string().optional(),
  region: z.string().optional(),
  months: z.coerce.number().int().min(1).max(12).optional(),
  format: z.enum(["json", "xlsx"]).default("json"),
});

const REPORT_KINDS = ["daily", "weekly", "monthly", "parts"] as const;

async function buildReport(kind: string, q: z.infer<typeof reportQuery>) {
  if (kind === "daily") return dailyReport({ zone: q.zone, region: q.region });
  if (kind === "weekly") return weeklyReport();
  if (kind === "monthly") return monthlyReport({ months: q.months });
  return partsReport();
}

/** ชื่อไฟล์ให้คนเปิดในเครื่องแล้วรู้ว่าใบไหนของวันไหน */
function reportFilename(kind: string, at: Date) {
  const stamp = at.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const thai: Record<string, string> = {
    daily: "ใบงานวันนี้",
    weekly: "สรุปรายสัปดาห์",
    monthly: "ภาพรวมผู้บริหาร",
    parts: "อะไหล่ที่ต้องสั่ง",
  };
  return { filename: `${thai[kind]}-${stamp}.xlsx`, asciiFilename: `report-${kind}-${stamp}.xlsx` };
}

router.get("/reports/:kind", requireAuth, async (req: AuthRequest, res) => {
  const kind = req.params.kind;
  if (!REPORT_KINDS.includes(kind as (typeof REPORT_KINDS)[number])) {
    return res.status(404).json({ error: "ไม่มีรายงานชื่อนี้" });
  }
  const parsed = reportQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const report = await buildReport(kind, parsed.data);
  if (parsed.data.format === "json") return res.json(report);

  const data = await reportToWorkbook(report);
  const names = reportFilename(kind, report.generatedAt);
  const stored = saveDocument({
    ...names,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data,
    ownerId: req.auth!.userId,
  });
  res.json({ filename: stored.filename, path: documentPath(stored) });
});

/** ประวัติการอัปโหลด */
router.get("/imports", requireAuth, async (_req, res) => {
  const imports = await prisma.machineImport.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  res.json(imports);
});

// ไฟล์ export ทั้งไฟล์ราว 100-200KB เก็บในหน่วยความจำระหว่างอ่านพอ ไม่ต้องเขียนลงดิสก์
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

/**
 * นำเข้าไฟล์ export
 *
 * ค่าเริ่มต้นคือโหมดตรวจสอบ ไม่บันทึกอะไรจนกว่าจะส่ง mode=commit
 * เพราะ "หายจากไฟล์ = ซ่อมเสร็จ" ไฟล์ที่ export ไม่ครบจะปิดเคสทิ้งเป็นร้อย
 * ต้องให้คนเห็นตัวเลขก่อนเสมอ
 */
router.post("/import", requireAuth, requireAdmin, upload.single("file"), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "กรุณาแนบไฟล์ Excel" });

  const commit = req.body?.mode === "commit";
  const snapshotAt = req.body?.snapshotAt ? new Date(req.body.snapshotAt) : new Date();
  if (Number.isNaN(snapshotAt.getTime())) {
    return res.status(400).json({ error: "รูปแบบเวลา snapshot ไม่ถูกต้อง" });
  }

  try {
    const parsed = await parseWorkbook(req.file.buffer);
    if (parsed.errors.length > 0) {
      return res.status(400).json({ error: parsed.errors.join(" / ") });
    }
    if (parsed.rows.length === 0) {
      return res.status(400).json({ error: "ไม่พบข้อมูลในไฟล์" });
    }

    const plan = commit
      ? await applyImport(parsed, snapshotAt, {
          uploadedById: req.auth!.userId,
          fileName: req.file.originalname,
        })
      : await planImport(parsed, snapshotAt);

    res.json({ committed: commit, plan });
  } catch (err) {
    console.error("Machine import failed:", err);
    res.status(400).json({
      error: `อ่านไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : "ไฟล์อาจไม่ใช่ .xlsx"}`,
    });
  }
});

export default router;
