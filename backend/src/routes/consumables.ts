import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const items = await prisma.consumableItem.findMany({
    where: search ? { name: { contains: search, mode: "insensitive" } } : undefined,
    orderBy: { name: "asc" },
  });
  res.json(items);
});

const itemSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1).optional(),
  stockQty: z.number().int().nonnegative().optional(),
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const item = await prisma.consumableItem.create({ data: parsed.data });
  res.status(201).json(item);
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = itemSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const item = await prisma.consumableItem.update({ where: { id }, data: parsed.data });
    res.json(item);
  } catch {
    res.status(404).json({ error: "Consumable item not found" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.consumableItem.delete({ where: { id } });
    res.status(204).send();
  } catch {
    res.status(409).json({
      error: "Cannot delete this item — it is referenced by an existing request",
    });
  }
});

export default router;
