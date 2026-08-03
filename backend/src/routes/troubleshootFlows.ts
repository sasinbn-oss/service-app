import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// Listing never selects image bytes, only their ids, so the payload stays small.
router.get("/", requireAuth, async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const flows = await prisma.troubleshootFlow.findMany({
    where: search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { machineType: { contains: search, mode: "insensitive" } },
            { nodes: { some: { text: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : undefined,
    include: {
      nodes: { select: { kind: true, yesKey: true, noKey: true } },
      images: { select: { id: true } },
    },
    orderBy: [{ order: "asc" }, { title: "asc" }],
  });

  res.json(
    flows.map((flow) => {
      const questions = flow.nodes.filter((n) => n.kind === "QUESTION");
      return {
        id: flow.id,
        title: flow.title,
        machineType: flow.machineType,
        notes: flow.notes,
        questionCount: questions.length,
        imageCount: flow.images.length,
        // Flows with unresolved branches are flagged so the app can warn
        // technicians and admins can find what still needs checking.
        incompleteCount: questions.filter((n) => !n.yesKey || !n.noKey).length,
        isReady: Boolean(flow.rootKey) && questions.every((n) => n.yesKey && n.noKey),
      };
    })
  );
});

// Served without auth so React Native's <Image> can load diagrams directly.
router.get("/:id/images/:imageId", async (req, res) => {
  const image = await prisma.troubleshootImage.findFirst({
    where: { id: Number(req.params.imageId), flowId: Number(req.params.id) },
  });
  if (!image) return res.status(404).json({ error: "Image not found" });

  res.setHeader("Content-Type", image.mimeType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(Buffer.from(image.data));
});

router.get("/:id", requireAuth, async (req, res) => {
  const flow = await prisma.troubleshootFlow.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      nodes: { orderBy: { order: "asc" } },
      images: { select: { id: true, order: true }, orderBy: { order: "asc" } },
    },
  });
  if (!flow) return res.status(404).json({ error: "Flow not found" });

  res.json({
    ...flow,
    images: flow.images.map((img) => ({
      id: img.id,
      url: `/api/troubleshoot-flows/${flow.id}/images/${img.id}`,
    })),
  });
});

const nodeSchema = z.object({
  text: z.string().min(1).optional(),
  stepNumber: z.string().nullable().optional(),
  yesKey: z.string().nullable().optional(),
  noKey: z.string().nullable().optional(),
});

// Admins repair branches the importer could not resolve from the drawing.
router.put("/:id/nodes/:key", requireAuth, requireAdmin, async (req, res) => {
  const flowId = Number(req.params.id);
  const parsed = nodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const node = await prisma.troubleshootNode.findUnique({
    where: { flowId_key: { flowId, key: req.params.key } },
  });
  if (!node) return res.status(404).json({ error: "Node not found" });

  // A branch may only point at another node of the same flow.
  for (const key of [parsed.data.yesKey, parsed.data.noKey]) {
    if (!key) continue;
    const target = await prisma.troubleshootNode.findUnique({
      where: { flowId_key: { flowId, key } },
    });
    if (!target) return res.status(400).json({ error: `ไม่พบกล่องปลายทาง "${key}" ในผังนี้` });
    if (key === node.key) return res.status(400).json({ error: "กล่องชี้กลับมาที่ตัวเองไม่ได้" });
  }

  const updated = await prisma.troubleshootNode.update({
    where: { flowId_key: { flowId, key: req.params.key } },
    data: parsed.data,
  });
  res.json(updated);
});

const flowSchema = z.object({
  title: z.string().min(1).optional(),
  machineType: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  rootKey: z.string().nullable().optional(),
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const parsed = flowSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const flow = await prisma.troubleshootFlow.update({
      where: { id: Number(req.params.id) },
      data: parsed.data,
    });
    res.json(flow);
  } catch {
    res.status(404).json({ error: "Flow not found" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.troubleshootFlow.delete({ where: { id: Number(req.params.id) } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Flow not found" });
  }
});

export default router;
