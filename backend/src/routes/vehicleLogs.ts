import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

// List logs: employees see their own, admins can see all (optionally filter by userId)
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const isAdmin = req.auth!.role === "ADMIN";
  const queryUserId = req.query.userId ? Number(req.query.userId) : undefined;

  const logs = await prisma.vehicleLog.findMany({
    where: isAdmin ? (queryUserId ? { userId: queryUserId } : {}) : { userId: req.auth!.userId },
    include: { vehicle: true, user: { select: { id: true, name: true, employeeCode: true } } },
    orderBy: { startedAt: "desc" },
  });
  res.json(logs);
});

router.get("/active", requireAuth, async (req: AuthRequest, res) => {
  const log = await prisma.vehicleLog.findFirst({
    where: { userId: req.auth!.userId, status: "ONGOING" },
    include: { vehicle: true },
  });
  res.json(log);
});

const startSchema = z.object({
  vehicleId: z.number().int(),
  purpose: z.string().min(1),
  destination: z.string().optional(),
  startMileage: z.number().int().nonnegative(),
});

router.post("/start", requireAuth, async (req: AuthRequest, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const alreadyActive = await prisma.vehicleLog.findFirst({
    where: { userId: req.auth!.userId, status: "ONGOING" },
  });
  if (alreadyActive) {
    return res.status(409).json({ error: "You already have an ongoing vehicle usage. Please check-in the vehicle first." });
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { id: parsed.data.vehicleId } });
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
  if (vehicle.status !== "AVAILABLE") {
    return res.status(409).json({ error: "Vehicle is not available" });
  }

  const [log] = await prisma.$transaction([
    prisma.vehicleLog.create({
      data: {
        vehicleId: parsed.data.vehicleId,
        userId: req.auth!.userId,
        purpose: parsed.data.purpose,
        destination: parsed.data.destination,
        startMileage: parsed.data.startMileage,
      },
      include: { vehicle: true },
    }),
    prisma.vehicle.update({ where: { id: parsed.data.vehicleId }, data: { status: "IN_USE" } }),
  ]);

  res.status(201).json(log);
});

const endSchema = z.object({
  endMileage: z.number().int().nonnegative(),
});

router.post("/:id/end", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const parsed = endSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const log = await prisma.vehicleLog.findUnique({ where: { id } });
  if (!log) return res.status(404).json({ error: "Vehicle log not found" });
  if (log.userId !== req.auth!.userId && req.auth!.role !== "ADMIN") {
    return res.status(403).json({ error: "Not your vehicle usage log" });
  }
  if (log.status === "COMPLETED") {
    return res.status(409).json({ error: "This vehicle usage was already checked in" });
  }
  if (parsed.data.endMileage < log.startMileage) {
    return res.status(400).json({ error: "End mileage cannot be less than start mileage" });
  }

  const [updated] = await prisma.$transaction([
    prisma.vehicleLog.update({
      where: { id },
      data: { endMileage: parsed.data.endMileage, endedAt: new Date(), status: "COMPLETED" },
      include: { vehicle: true },
    }),
    prisma.vehicle.update({ where: { id: log.vehicleId }, data: { status: "AVAILABLE" } }),
  ]);

  res.json(updated);
});

export default router;
