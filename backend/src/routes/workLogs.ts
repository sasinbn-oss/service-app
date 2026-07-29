import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const isAdmin = req.auth!.role === "ADMIN";
  const queryUserId = req.query.userId ? Number(req.query.userId) : undefined;

  const logs = await prisma.workLog.findMany({
    where: isAdmin ? (queryUserId ? { userId: queryUserId } : {}) : { userId: req.auth!.userId },
    include: { branch: true, user: { select: { id: true, name: true, employeeCode: true } } },
    orderBy: { workDate: "desc" },
  });
  res.json(logs);
});

const workLogSchema = z.object({
  workDate: z.string().datetime().or(z.string().min(1)),
  taskDescription: z.string().min(1),
  hoursSpent: z.number().nonnegative().optional(),
  branchId: z.number().int().optional(),
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = workLogSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const workDate = new Date(parsed.data.workDate);
  if (Number.isNaN(workDate.getTime())) {
    return res.status(400).json({ error: "Invalid workDate" });
  }

  const log = await prisma.workLog.create({
    data: {
      userId: req.auth!.userId,
      workDate,
      taskDescription: parsed.data.taskDescription,
      hoursSpent: parsed.data.hoursSpent,
      branchId: parsed.data.branchId,
    },
    include: { branch: true },
  });

  res.status(201).json(log);
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const log = await prisma.workLog.findUnique({ where: { id } });
  if (!log) return res.status(404).json({ error: "Work log not found" });
  if (log.userId !== req.auth!.userId && req.auth!.role !== "ADMIN") {
    return res.status(403).json({ error: "Not your work log" });
  }
  await prisma.workLog.delete({ where: { id } });
  res.status(204).send();
});

export default router;
