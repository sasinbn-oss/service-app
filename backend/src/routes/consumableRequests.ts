import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";

const router = Router();

const requestInclude = {
  items: { include: { item: true } },
  user: { select: { id: true, name: true, employeeCode: true } },
  reviewedBy: { select: { id: true, name: true, employeeCode: true } },
} as const;

// Employees see their own requests; admins see everything, and can filter
// by status to work through the pending queue.
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const isAdmin = req.auth!.role === "ADMIN";
  const status = typeof req.query.status === "string" ? req.query.status : undefined;

  const requests = await prisma.consumableRequest.findMany({
    where: {
      ...(isAdmin ? {} : { userId: req.auth!.userId }),
      ...(status ? { status } : {}),
    },
    include: requestInclude,
    orderBy: { createdAt: "desc" },
  });
  res.json(requests);
});

router.get("/pending-count", requireAuth, requireAdmin, async (_req, res) => {
  const count = await prisma.consumableRequest.count({ where: { status: "PENDING" } });
  res.json({ count });
});

router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const request = await prisma.consumableRequest.findUnique({
    where: { id },
    include: requestInclude,
  });
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.userId !== req.auth!.userId && req.auth!.role !== "ADMIN") {
    return res.status(403).json({ error: "Not your request" });
  }
  res.json(request);
});

const createSchema = z.object({
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        itemId: z.number().int(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const itemIds = parsed.data.items.map((i) => i.itemId);
  if (new Set(itemIds).size !== itemIds.length) {
    return res.status(400).json({ error: "Each item may only appear once per request" });
  }

  const found = await prisma.consumableItem.findMany({ where: { id: { in: itemIds } } });
  if (found.length !== itemIds.length) {
    return res.status(404).json({ error: "One or more items do not exist" });
  }

  const request = await prisma.consumableRequest.create({
    data: {
      userId: req.auth!.userId,
      note: parsed.data.note,
      items: { create: parsed.data.items },
    },
    include: requestInclude,
  });

  res.status(201).json(request);
});

const reviewSchema = z.object({
  reviewNote: z.string().optional(),
});

// Approving deducts stock for every line in one transaction, so a request can
// never be marked approved while leaving stock untouched.
router.post("/:id/approve", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const request = await prisma.consumableRequest.findUnique({
    where: { id },
    include: { items: { include: { item: true } } },
  });
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.status !== "PENDING") {
    return res.status(409).json({ error: `Request was already ${request.status.toLowerCase()}` });
  }

  const shortages = request.items.filter((line) => line.item.stockQty < line.quantity);
  if (shortages.length > 0) {
    return res.status(409).json({
      error: `Not enough stock for: ${shortages.map((s) => s.item.name).join(", ")}`,
    });
  }

  const results = await prisma.$transaction([
    ...request.items.map((line) =>
      prisma.consumableItem.update({
        where: { id: line.itemId },
        data: { stockQty: { decrement: line.quantity } },
      })
    ),
    prisma.consumableRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewedById: req.auth!.userId,
        reviewedAt: new Date(),
        reviewNote: parsed.data.reviewNote,
      },
      include: requestInclude,
    }),
  ]);

  res.json(results[results.length - 1]);
});

router.post("/:id/reject", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const request = await prisma.consumableRequest.findUnique({ where: { id } });
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.status !== "PENDING") {
    return res.status(409).json({ error: `Request was already ${request.status.toLowerCase()}` });
  }

  const updated = await prisma.consumableRequest.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewedById: req.auth!.userId,
      reviewedAt: new Date(),
      reviewNote: parsed.data.reviewNote,
    },
    include: requestInclude,
  });

  res.json(updated);
});

// Requesters may withdraw a request while it is still pending.
router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const request = await prisma.consumableRequest.findUnique({ where: { id } });
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.userId !== req.auth!.userId && req.auth!.role !== "ADMIN") {
    return res.status(403).json({ error: "Not your request" });
  }
  if (request.status !== "PENDING") {
    return res.status(409).json({ error: "Only pending requests can be cancelled" });
  }

  await prisma.consumableRequest.delete({ where: { id } });
  res.status(204).send();
});

export default router;
