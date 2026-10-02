import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import {
  applyBranchImport,
  parseBranchWorkbook,
  planBranchImport,
} from "../machines/branchImport";
import {
  applyCancelledImport,
  parseCancelledWorkbook,
  planCancelledImport,
} from "../machines/cancellationImport";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

/**
 * นำเข้าทะเบียนสาขา (ภาค / ทีมช่าง) จากไฟล์ Excel
 *
 * ค่าเริ่มต้นคือโหมดตรวจสอบ ต้องส่ง mode=commit ถึงจะบันทึกจริง
 * ไฟล์นี้แตะเฉพาะข้อมูลสาขา ไม่ยุ่งกับสถานะเครื่องหรือเคสที่เปิดค้างอยู่
 */
router.post("/import", requireAuth, requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "กรุณาแนบไฟล์ Excel" });

  const commit = req.body?.mode === "commit";
  try {
    const parsed = await parseBranchWorkbook(req.file.buffer);
    if (parsed.errors.length > 0) return res.status(400).json({ error: parsed.errors.join(" / ") });
    if (parsed.rows.length === 0) return res.status(400).json({ error: "ไม่พบข้อมูลในไฟล์" });

    const plan = commit ? await applyBranchImport(parsed) : await planBranchImport(parsed);
    res.json({ committed: commit, plan });
  } catch (err) {
    console.error("Branch import failed:", err);
    res.status(400).json({
      error: `อ่านไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : "ไฟล์อาจไม่ใช่ .xlsx"}`,
    });
  }
});

/**
 * รายชื่อสาขาหรือเครื่องที่ยกเลิกแล้ว
 *
 * แยกจากทะเบียนสาขาเพราะเป็นคนละเรื่องและคนละจังหวะ ทะเบียนบอกว่าใครดูแลสาขาไหน
 * ไฟล์นี้บอกว่าอะไรไม่มีอยู่แล้ว ซึ่งกระทบถึงการปิดเคสที่ค้างอยู่
 */
router.post("/cancelled-import", requireAuth, requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "กรุณาแนบไฟล์ Excel" });

  const commit = req.body?.mode === "commit";
  try {
    const parsed = await parseCancelledWorkbook(req.file.buffer);
    if (parsed.errors.length > 0) return res.status(400).json({ error: parsed.errors.join(" / ") });
    if (parsed.rows.length === 0) return res.status(400).json({ error: "ไม่พบข้อมูลในไฟล์" });

    const plan = commit ? await applyCancelledImport(parsed) : await planCancelledImport(parsed);
    res.json({ committed: commit, plan });
  } catch (err) {
    console.error("Cancelled branch import failed:", err);
    res.status(400).json({
      error: `อ่านไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : "ไฟล์อาจไม่ใช่ .xlsx"}`,
    });
  }
});

/**
 * รายชื่อสาขา
 *
 * ไม่ส่ง search มาก็ได้ทั้งหมดเหมือนเดิม เพราะหน้าจัดการสาขาและหน้ารายงานตัว
 * ต้องการทั้งชุด ส่วนช่องค้นหาในฟอร์มใบงานส่ง search มาเพื่อไม่ต้องดึงพันกว่าแถว
 * มากรองในเครื่องผู้ใช้
 */
router.get("/", requireAuth, async (req, res) => {
  const keyword = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const branches = await prisma.branch.findMany({
    where: keyword
      ? {
          // สาขาที่ยกเลิกแล้วไม่ควรถูกเลือกไปเปิดใบงานใหม่
          cancelledAt: null,
          OR: [
            { code: { contains: keyword, mode: "insensitive" } },
            { name: { contains: keyword, mode: "insensitive" } },
          ],
        }
      : {},
    orderBy: { name: "asc" },
    ...(keyword ? { take: 20 } : {}),
  });
  res.json(branches);
});

/**
 * ภาคทั้งหมดจากทะเบียนสาขา
 *
 * ต่างจาก /machines/regions ที่ให้เฉพาะภาคที่มีเคสค้างอยู่ตอนนี้ — ภาคที่หัวหน้าภาค
 * ดูแลไม่ควรขึ้นกับว่าตอนนี้มีเครื่องเสียอยู่หรือเปล่า ภาคที่ทุกอย่างปกติก็ยังต้องมีหัวหน้า
 */
router.get("/regions", requireAuth, async (_req, res) => {
  const rows = await prisma.branch.groupBy({
    by: ["region"],
    where: { region: { not: null }, cancelledAt: null },
    _count: true,
    orderBy: { region: "asc" },
  });
  res.json(rows.map((r) => ({ name: r.region as string, branches: r._count })));
});

/**
 * ทีมช่างทั้งหมดจากทะเบียนสาขา
 *
 * ทีมไม่ได้เป็นตารางของตัวเอง — เป็นคอลัมน์ "ทีมช่าง" ในไฟล์ทะเบียนสาขา
 * (เก็บที่ Branch.zone) เพราะความจริงของการแบ่งทีมอยู่ที่ไฟล์นั้น ถ้าทำตาราง
 * แยกจะมีสองที่ที่บอกว่าทีมไหนมีอยู่บ้าง แล้ววันหนึ่งจะไม่ตรงกัน
 *
 * คืนจำนวนสาขาไปด้วย จะได้รู้ว่าทีมไหนดูแลกี่สาขาตอนเลือกจ่ายงานข้ามทีม
 */
router.get("/teams", requireAuth, async (_req, res) => {
  // ทีม CM กับทีม PM มาคนละคอลัมน์ แต่เป็นทีมชุดเดียวกัน — บางทีมรับเฉพาะงาน CM
  // จึงโผล่แค่คอลัมน์เดียว ถ้าเอาแค่คอลัมน์เดียวจะมีทีมหายไปจากรายการเลือก
  const [cm, pm] = await Promise.all([
    prisma.branch.groupBy({
      by: ["zone"],
      where: { zone: { not: null }, cancelledAt: null },
      _count: true,
    }),
    prisma.branch.groupBy({
      by: ["pmTeam"],
      where: { pmTeam: { not: null }, cancelledAt: null },
      _count: true,
    }),
  ]);

  const tally = new Map<string, { cm: number; pm: number }>();
  const add = (name: string | null, kind: "cm" | "pm", n: number) => {
    const key = name?.trim();
    if (!key) return;
    const row = tally.get(key) ?? { cm: 0, pm: 0 };
    row[kind] += n;
    tally.set(key, row);
  };
  for (const r of cm) add(r.zone, "cm", r._count);
  for (const r of pm) add(r.pmTeam, "pm", r._count);

  res.json(
    [...tally.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "th"))
      .map(([name, n]) => ({ name, branches: Math.max(n.cm, n.pm), cmBranches: n.cm, pmBranches: n.pm }))
  );
});

/**
 * ผู้ติดต่อที่ใช้ล่าสุดของสาขานี้ — เอาไว้เติมให้ตอนเปิดใบงานใหม่
 *
 * เก็บอยู่ที่ใบงาน ไม่ได้เก็บที่สาขา เพราะคนเฝ้าร้านเปลี่ยนตามกะ ค่าที่ใช้ล่าสุด
 * จึงเป็นการเดาที่ดีที่สุดที่มี ไม่ใช่ความจริงที่ต้องรักษาให้ตรงตลอด —
 * คนเปิดใบงานเห็นแล้วแก้ทับได้ทันทีถ้าเปลี่ยนคน
 */
router.get("/:code/last-contact", requireAuth, async (req, res) => {
  const last = await prisma.workOrder.findFirst({
    where: {
      branch: { code: req.params.code },
      OR: [{ contactName: { not: null } }, { contactPhone: { not: null } }],
    },
    orderBy: { createdAt: "desc" },
    select: { contactName: true, contactPhone: true, createdAt: true },
  });
  res.json(last ?? { contactName: null, contactPhone: null, createdAt: null });
});

const branchSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().optional(),
  // พิกัดไม่บังคับ สาขาที่ยังไม่ได้ไปวัดพิกัดก็ขึ้นในแดชบอร์ดเครื่องได้
  // แต่จะรายงานตัวด้วย GPS ไม่ได้จนกว่าจะใส่พิกัด
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  radiusMeters: z.number().int().positive().optional(),
  region: z.string().optional(),
  ownership: z.enum(["COCO", "DODO"]).optional(),
  zone: z.string().optional(),
  grade: z.enum(["A", "B", "C"]).optional(),
  // วันที่ส่งมาเป็น YYYY-MM-DD ส่งค่าว่างมาคือล้างทิ้ง
  openedAt: z.string().nullable().optional(),
  warrantyExpiresAt: z.string().nullable().optional(),
});

/** แปลงวันที่จากฟอร์มให้เป็น Date โดยไม่แตะช่องที่ไม่ได้ส่งมา */
function branchDates(body: { openedAt?: string | null; warrantyExpiresAt?: string | null }) {
  const out: { openedAt?: Date | null; warrantyExpiresAt?: Date | null } = {};
  if (body.openedAt !== undefined) out.openedAt = body.openedAt ? new Date(body.openedAt) : null;
  if (body.warrantyExpiresAt !== undefined) {
    out.warrantyExpiresAt = body.warrantyExpiresAt ? new Date(body.warrantyExpiresAt) : null;
  }
  return out;
}

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = branchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.branch.findUnique({ where: { code: parsed.data.code } });
  if (existing) return res.status(409).json({ error: "Branch code already exists" });

  const branch = await prisma.branch.create({
    data: { ...parsed.data, ...branchDates(parsed.data) },
  });
  res.status(201).json(branch);
});

const updateSchema = branchSchema.partial();

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const branch = await prisma.branch.update({
      where: { id },
      data: { ...parsed.data, ...branchDates(parsed.data) },
    });
    res.json(branch);
  } catch {
    res.status(404).json({ error: "Branch not found" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.branch.delete({ where: { id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Branch not found" });
  }
});

export default router;
