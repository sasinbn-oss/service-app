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
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = branchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.branch.findUnique({ where: { code: parsed.data.code } });
  if (existing) return res.status(409).json({ error: "Branch code already exists" });

  const branch = await prisma.branch.create({ data: parsed.data });
  res.status(201).json(branch);
});

const updateSchema = branchSchema.partial();

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const branch = await prisma.branch.update({ where: { id }, data: parsed.data });
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
