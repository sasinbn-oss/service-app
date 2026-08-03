import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
});

// Search by name (also matches part code and brand so a technician can scan
// in whichever identifier they have to hand).
router.get("/", requireAuth, async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const parts = await prisma.sparePart.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { partCode: { contains: search, mode: "insensitive" } },
            { brand: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
  });
  res.json(parts);
});

// Served without auth so React Native's <Image> can load it directly.
// These are internal catalog photos, not user data.
router.get("/:id/image", async (req, res) => {
  const id = Number(req.params.id);
  const image = await prisma.sparePartImage.findUnique({ where: { sparePartId: id } });
  if (!image) return res.status(404).json({ error: "Image not found" });

  res.setHeader("Content-Type", image.mimeType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(Buffer.from(image.data));
});

router.get("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const part = await prisma.sparePart.findUnique({ where: { id } });
  if (!part) return res.status(404).json({ error: "Spare part not found" });
  res.json(part);
});

const sparePartSchema = z.object({
  partCode: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = sparePartSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.sparePart.findUnique({ where: { partCode: parsed.data.partCode } });
  if (existing) return res.status(409).json({ error: "Part code already exists" });

  const part = await prisma.sparePart.create({ data: parsed.data });
  res.status(201).json(part);
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = sparePartSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const part = await prisma.sparePart.update({ where: { id }, data: parsed.data });
    res.json(part);
  } catch {
    res.status(404).json({ error: "Spare part not found" });
  }
});

router.post(
  "/:id/image",
  requireAuth,
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: "No image file uploaded" });
    if (!ALLOWED_IMAGE_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "Image must be JPEG, PNG or WebP" });
    }

    const part = await prisma.sparePart.findUnique({ where: { id } });
    if (!part) return res.status(404).json({ error: "Spare part not found" });

    const imageUrl = `/api/spare-parts/${id}/image`;
    const [, updated] = await prisma.$transaction([
      prisma.sparePartImage.upsert({
        where: { sparePartId: id },
        update: { mimeType: req.file.mimetype, data: req.file.buffer },
        create: { sparePartId: id, mimeType: req.file.mimetype, data: req.file.buffer },
      }),
      prisma.sparePart.update({ where: { id }, data: { imageUrl } }),
    ]);

    res.json(updated);
  }
);

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.sparePart.delete({ where: { id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Spare part not found" });
  }
});

export default router;
