import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { distanceMeters } from "../utils/geo";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const isAdmin = req.auth!.role === "ADMIN";
  const queryUserId = req.query.userId ? Number(req.query.userId) : undefined;

  const checkIns = await prisma.branchCheckIn.findMany({
    where: isAdmin ? (queryUserId ? { userId: queryUserId } : {}) : { userId: req.auth!.userId },
    include: { branch: true, user: { select: { id: true, name: true, employeeCode: true } } },
    orderBy: { checkedInAt: "desc" },
  });
  res.json(checkIns);
});

const checkInSchema = z.object({
  branchId: z.number().int(),
  latitude: z.number(),
  longitude: z.number(),
  note: z.string().optional(),
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = checkInSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const branch = await prisma.branch.findUnique({ where: { id: parsed.data.branchId } });
  if (!branch) return res.status(404).json({ error: "Branch not found" });

  const distance = distanceMeters(
    parsed.data.latitude,
    parsed.data.longitude,
    branch.latitude,
    branch.longitude
  );
  const withinRadius = distance <= branch.radiusMeters;

  const checkIn = await prisma.branchCheckIn.create({
    data: {
      userId: req.auth!.userId,
      branchId: parsed.data.branchId,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      distanceMeters: distance,
      withinRadius,
      note: parsed.data.note,
    },
    include: { branch: true },
  });

  res.status(201).json(checkIn);
});

export default router;
