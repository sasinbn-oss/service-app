import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const status = req.query.status as string | undefined;
  const vehicles = await prisma.vehicle.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { plateNumber: "asc" },
  });
  res.json(vehicles);
});

const vehicleSchema = z.object({
  plateNumber: z.string().min(1),
  brand: z.string().optional(),
  model: z.string().optional(),
  type: z.string().optional(),
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = vehicleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.vehicle.findUnique({ where: { plateNumber: parsed.data.plateNumber } });
  if (existing) return res.status(409).json({ error: "Plate number already exists" });

  const vehicle = await prisma.vehicle.create({ data: parsed.data });
  res.status(201).json(vehicle);
});

const updateSchema = vehicleSchema.partial().extend({
  status: z.enum(["AVAILABLE", "IN_USE", "MAINTENANCE"]).optional(),
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const vehicle = await prisma.vehicle.update({ where: { id }, data: parsed.data });
    res.json(vehicle);
  } catch {
    res.status(404).json({ error: "Vehicle not found" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.vehicle.delete({ where: { id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Vehicle not found" });
  }
});

export default router;
