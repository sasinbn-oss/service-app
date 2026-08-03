import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// Anyone signed in can browse/search the guide; `search` matches title,
// symptom and category so a technician can look up either the machine or
// the problem they are seeing.
router.get("/", requireAuth, async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";

  const guides = await prisma.troubleshootingGuide.findMany({
    where: {
      AND: [
        category ? { category } : {},
        search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { symptom: { contains: search, mode: "insensitive" } },
                { category: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  res.json(guides);
});

router.get("/categories", requireAuth, async (_req, res) => {
  const rows = await prisma.troubleshootingGuide.findMany({
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });
  res.json(rows.map((r) => r.category));
});

router.get("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const guide = await prisma.troubleshootingGuide.findUnique({ where: { id } });
  if (!guide) return res.status(404).json({ error: "Guide not found" });
  res.json(guide);
});

const guideSchema = z.object({
  category: z.string().min(1),
  title: z.string().min(1),
  symptom: z.string().min(1),
  solution: z.string().min(1),
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = guideSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const guide = await prisma.troubleshootingGuide.create({ data: parsed.data });
  res.status(201).json(guide);
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = guideSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const guide = await prisma.troubleshootingGuide.update({ where: { id }, data: parsed.data });
    res.json(guide);
  } catch {
    res.status(404).json({ error: "Guide not found" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.troubleshootingGuide.delete({ where: { id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Guide not found" });
  }
});

export default router;
