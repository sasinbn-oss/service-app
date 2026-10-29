import { NextFunction, Request, Response, Router } from "express";
import ExcelJS from "exceljs";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../prisma";
import { AuthRequest, requireAuth, requireAdmin } from "../middleware/auth";
import { documentPath, saveDocument } from "../documents/store";
import { ReportDetails, applyPartsImport, parsePartsWorkbook, planPartsImport, reportDetails } from "../utils/sparePartImport";

const router = Router();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
});

// Search by name (also matches part code, brand and category so a technician
// can scan in whichever identifier they have to hand).
router.get("/", requireAuth, async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const parts = await prisma.sparePart.findMany({
    where: {
      // ของนอกสโตร์ (พิมพ์ชื่อเองในใบงาน) ไม่ใช่สินค้าในสโตร์ — ขึ้นในรายการ/ช่องค้นหาแล้วคนจะเลือกเหมือนมี SKU
      offCatalog: false,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { partCode: { contains: search, mode: "insensitive" } },
              { brand: { contains: search, mode: "insensitive" } },
              { category: { contains: search, mode: "insensitive" } },
              // เลขผู้ผลิตที่พิมพ์บนตัวอะไหล่ (W11327190) — ช่างถืออะไหล่อยู่ในมือ อ่านเลขนี้ได้ก่อนรหัสสินค้า
              { partNo: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });
  res.json(parts);
});

/**
 * อัปเดตข้อมูลอะไหล่จากไฟล์ Excel (เจ้าของงานขอ ต.ค. 69 · กติกาอยู่ที่ utils/sparePartImport.ts)
 *
 * ส่งทีละไฟล์ (ไฟล์ยี่ห้อละไฟล์ · รูปในเซลล์ทำให้ไฟล์ใหญ่ได้หลายสิบ MB รวมกันในคำขอเดียวเครื่องเซิร์ฟเวอร์หน่วยความจำไม่พอ)
 * แบบเดียวกับนำเข้าอื่น: ส่งครั้งแรกได้ตัวอย่าง (ไม่บันทึก) · ส่งไฟล์เดิมพร้อม apply=true ถึงบันทึก —
 * เซิร์ฟเวอร์อ่านไฟล์ใหม่ทุกครั้ง ไม่เชื่อรายการที่หน้าจอส่งกลับมา
 * แอดมินและ Admin Spare Part (PARTS_ADMIN_WRITES เปิด /api/spare-parts ไว้แล้ว)
 */
const MAX_SHEET_BYTES = 50 * 1024 * 1024;
const sheetUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_SHEET_BYTES } });
const oneSheet = (req: Request, res: Response, next: NextFunction) =>
  sheetUpload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: `ไฟล์ใหญ่เกิน ${MAX_SHEET_BYTES / 1024 / 1024} MB — แยกไฟล์ให้เล็กลง หรือย่อรูปในไฟล์ก่อน` });
    }
    if (err) return next(err);
    next();
  });
/** รูปย่อในหน้าตรวจ — ส่งเฉพาะรูปไม่ใหญ่ ไม่กี่สิบรูป หน้าตรวจโหลดไว ที่เหลือเห็นหลังอัปเดต */
const THUMB_MAX_BYTES = 150 * 1024;
const THUMB_MAX_COUNT = 60;

router.post("/import", requireAuth, requireAdmin, oneSheet, async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "ต้องแนบไฟล์อะไหล่ (.xlsx)" });
  const fileName = Buffer.from(req.file.originalname, "latin1").toString("utf8");
  const apply = req.body?.apply === "true";
  // ค่าตั้งต้น = แทนรูปเดิมด้วยรูปในไฟล์ (ตกลงตามตัวอย่าง) · "false" = เก็บรูปเดิม เติมเฉพาะที่ไม่มีรูป
  const replaceImages = req.body?.replaceImages !== "false";
  const batchId = String(req.body?.batchId ?? "").slice(0, 64);
  if (apply && !/^[A-Za-z0-9_-]{6,64}$/.test(batchId)) return res.status(400).json({ error: "ไม่มีรหัสรอบอัปเดต — ลองเลือกไฟล์ใหม่" });

  let parsed: Awaited<ReturnType<typeof parsePartsWorkbook>>;
  try {
    parsed = await parsePartsWorkbook(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "อ่านไฟล์ไม่ได้", fileName });
  }
  if (!parsed.rows.length && !parsed.problems.length) return res.status(400).json({ error: "ไฟล์ไม่มีรายการอะไหล่", fileName });
  const plan = await planPartsImport(parsed, replaceImages);
  const details = reportDetails(fileName, parsed, plan);

  if (!apply) {
    const thumbs: Record<string, string> = {};
    let n = 0;
    for (const r of parsed.rows) {
      const it = plan.items.find((i) => i.partCode === r.partCode);
      if (!r.image || !it || !(it.action === "CREATE" || it.image) || r.image.data.length > THUMB_MAX_BYTES) continue;
      if (n++ >= THUMB_MAX_COUNT) break;
      thumbs[r.partCode] = `data:${r.image.mime};base64,${r.image.data.toString("base64")}`;
    }
    return res.json({ applied: false, imageCount: parsed.imageCount, summary: plan.summary, ...details, codes: parsed.rows.map((r) => r.partCode), thumbs });
  }

  const done = await applyPartsImport(parsed, plan);
  const me = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { name: true } });
  const summary = { ...plan.summary, images: done.images };
  const log = await prisma.sparePartImport.create({
    data: { batchId, byUserId: req.auth!.userId, byName: me?.name ?? null, fileName, summary, details: details as object },
  });
  console.log(`[spare-part-import] ${fileName} โดย userId=${req.auth!.userId} — เพิ่ม ${done.created} · แก้ ${done.updated} · รูป ${done.images}`);
  res.json({ applied: true, id: log.id, imageCount: parsed.imageCount, summary, ...details });
});

type ImportRow = Awaited<ReturnType<typeof prisma.sparePartImport.findMany>>[number];
const batchShape = (rows: ImportRow[]) => {
  const totals = { changed: 0, created: 0, updated: 0, images: 0, same: 0, skipped: 0, notInFile: 0 };
  for (const r of rows) {
    const s = r.summary as Record<string, number>;
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += s[k] ?? 0;
  }
  return {
    batchId: rows[0].batchId,
    createdAt: rows[rows.length - 1].createdAt,
    byName: rows[0].byName,
    totals,
    files: rows.map((r) => ({ id: r.id, fileName: r.fileName, createdAt: r.createdAt, summary: r.summary, details: r.details as unknown as ReportDetails })),
  };
};

/** รอบอัปเดตล่าสุด — แถบ "อัปเดตจากไฟล์ล่าสุด … ดูรายละเอียด" บนหน้าจัดการข้อมูลอะไหล่ (ไม่มีรายละเอียด ให้หน้าโหลดไว) */
router.get("/imports/latest", requireAuth, requireAdmin, async (_req, res) => {
  const last = await prisma.sparePartImport.findFirst({ orderBy: { createdAt: "desc" }, select: { batchId: true } });
  if (!last) return res.json(null);
  const rows = await prisma.sparePartImport.findMany({ where: { batchId: last.batchId }, orderBy: { createdAt: "asc" } });
  const b = batchShape(rows);
  res.json({ ...b, files: b.files.map(({ details: _d, ...f }) => f) });
});

router.get("/imports/batch/:batchId", requireAuth, requireAdmin, async (req, res) => {
  const rows = await prisma.sparePartImport.findMany({ where: { batchId: req.params.batchId }, orderBy: { createdAt: "asc" } });
  if (!rows.length) return res.status(404).json({ error: "ไม่พบรายงานรอบนี้" });
  res.json(batchShape(rows));
});

/** รายงานเป็น Excel — 1 แถวต่ออะไหล่ที่เปลี่ยน/ข้าม ส่งต่อให้คนอื่นตรวจได้ (ค่าเดิม → ค่าใหม่) */
router.get("/imports/batch/:batchId/excel", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const rows = await prisma.sparePartImport.findMany({ where: { batchId: req.params.batchId }, orderBy: { createdAt: "asc" } });
  if (!rows.length) return res.status(404).json({ error: "ไม่พบรายงานรอบนี้" });
  const b = batchShape(rows);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("อัปเดตอะไหล่");
  ws.columns = [
    { header: "ไฟล์", width: 22 },
    { header: "แถว", width: 7 },
    { header: "รหัสสินค้า", width: 14 },
    { header: "ชื่อ", width: 48 },
    { header: "ผล", width: 22 },
    { header: "รายละเอียด", width: 70 },
  ];
  ws.getRow(1).font = { bold: true };
  const IMAGE: Record<string, string> = { NEW: "ใส่รูปจากไฟล์ (เดิมไม่มีรูป)", CHANGED: "แทนรูปเดิมด้วยรูปในไฟล์", KEPT: "รูปในไฟล์ต่างจากเดิม — เก็บรูปเดิมไว้" };
  for (const f of b.files) {
    for (const i of f.details.items) {
      const result = i.action === "CREATE" ? "เพิ่มใหม่" : i.action === "UPDATE" ? "แก้ไข" : "รูป";
      const detail = [
        i.action === "CREATE" && i.partNo ? `Part No.: ${i.partNo}` : null,
        ...i.diffs.map((d) => `${d.label}: ${d.from} → ${d.to}`),
        i.image ? IMAGE[i.image] : null,
      ]
        .filter(Boolean)
        .join(" · ");
      ws.addRow([f.fileName, i.line, i.partCode, i.name, result, detail]);
    }
    for (const p of f.details.problems) ws.addRow([f.fileName, p.line, p.partCode ?? "", p.name ?? "", "ข้าม / มีปัญหา", p.note]);
    for (const p of f.details.notInFile) {
      ws.addRow([f.fileName, "", p.partCode, p.name, "ไม่อยู่ในไฟล์ (ไม่ลบ)", p.usedIn ? `ใบงานอ้างถึง ${p.usedIn} ใบ` : "ยังไม่เคยใช้ในใบงาน"]);
    }
  }
  const stamp = new Date(b.createdAt).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const stored = saveDocument({
    filename: `อัปเดตอะไหล่-${stamp}.xlsx`,
    asciiFilename: `spare-part-update-${stamp}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data: Buffer.from(await wb.xlsx.writeBuffer()),
    ownerId: req.auth!.userId,
  });
  res.json({ filename: stored.filename, path: documentPath(stored) });
});

// Served without auth so React Native's <Image> can load it directly.
// These are internal catalog photos, not user data.
router.get("/:id/image", async (req, res) => {
  const id = Number(req.params.id);
  const image = await prisma.sparePartImage.findUnique({ where: { sparePartId: id } });
  if (!image) return res.status(404).json({ error: "อะไหล่นี้ยังไม่มีรูป" });

  res.setHeader("Content-Type", image.mimeType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(Buffer.from(image.data));
});

router.get("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const part = await prisma.sparePart.findUnique({ where: { id } });
  if (!part) return res.status(404).json({ error: "ไม่พบอะไหล่นี้ — อาจถูกลบไปแล้ว" });
  res.json(part);
});

const sparePartSchema = z.object({
  partCode: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  // ล้างช่องในฟอร์ม = ลบ Part No. — เก็บเป็น null ไม่ใช่ "" (ค้นหา/โชว์ถือว่าไม่มี)
  partNo: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = sparePartSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.sparePart.findUnique({ where: { partCode: parsed.data.partCode } });
  if (existing) return res.status(409).json({ error: "รหัสสินค้านี้มีอยู่แล้ว" });

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
  } catch (e) {
    // แก้รหัสให้ซ้ำกับอะไหล่อื่น — เดิมตกไปเป็น "ไม่พบอะไหล่" ทำให้แอดมินงงว่าหายไปไหน
    if ((e as { code?: string }).code === "P2002") {
      return res.status(409).json({ error: "รหัสสินค้านี้มีอยู่แล้ว" });
    }
    res.status(404).json({ error: "ไม่พบอะไหล่นี้ — อาจถูกลบไปแล้ว" });
  }
});

router.post(
  "/:id/image",
  requireAuth,
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: "ไม่ได้แนบไฟล์รูป" });
    if (!ALLOWED_IMAGE_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "รูปต้องเป็นไฟล์ JPEG, PNG หรือ WebP" });
    }

    const part = await prisma.sparePart.findUnique({ where: { id } });
    if (!part) return res.status(404).json({ error: "ไม่พบอะไหล่นี้ — อาจถูกลบไปแล้ว" });

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
    res.status(404).json({ error: "ไม่พบอะไหล่นี้ — อาจถูกลบไปแล้ว" });
  }
});

export default router;
