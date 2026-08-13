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
});

function branchFilter(query: z.infer<typeof listSchema>) {
  return {
    ...(query.ownership ? { ownership: query.ownership } : {}),
    ...(query.grade ? { grade: query.grade } : {}),
    ...(query.region ? { region: query.region } : {}),
    ...(query.zone ? { zone: query.zone } : {}),
  };
}

function hoursSince(from: Date, now: Date) {
  return (now.getTime() - from.getTime()) / 3_600_000;
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
      branch: branchFilter(query),
      ...(keyword
        ? {
            OR: [
              { branch: { code: { contains: keyword, mode: "insensitive" } } },
              { branch: { name: { contains: keyword, mode: "insensitive" } } },
              { machine: { code: { contains: keyword, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
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
  }));

  res.json({
    now: now.toISOString(),
    slaHours: SLA_HOURS,
    summary: {
      total: rows.length,
      COCO: rows.filter((r) => r.ownership === "COCO").length,
      DODO: rows.filter((r) => r.ownership === "DODO").length,
      breached: rows.filter((r) => r.breached).length,
    },
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
      branch: branchFilter(query),
      ...(keyword
        ? {
            OR: [
              { branch: { code: { contains: keyword, mode: "insensitive" } } },
              { branch: { name: { contains: keyword, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
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
  }));

  res.json({
    now: now.toISOString(),
    slaHours: SLA_HOURS,
    summary: {
      total: rows.length,
      COCO: rows.filter((r) => r.ownership === "COCO").length,
      DODO: rows.filter((r) => r.ownership === "DODO").length,
      breached: rows.filter((r) => r.breached).length,
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
