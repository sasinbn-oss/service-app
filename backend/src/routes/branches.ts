import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, async (_req, res) => {
  const branches = await prisma.branch.findMany({ orderBy: { name: "asc" } });
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
