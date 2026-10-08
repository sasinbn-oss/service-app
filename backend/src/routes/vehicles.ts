/**
 * รถของบริษัท — ทะเบียน & ซ่อมบำรุง (ยกมาจาก OTTERI FLEET)
 *
 * รอบน้ำมันเครื่อง (กม. หรือเดือน อย่างไหนถึงก่อน) · วันหมดอายุภาษี/พ.ร.บ./ประกัน ·
 * รูปเอกสารรถ · ประวัติซ่อม ทั้งหมดอยู่ที่รถคันนั้น — รายการเดียวที่แอดมินต้องเปิด
 * เพื่อรู้ว่าคันไหนต้องเข้าศูนย์ แทนการจำหรือจดในสมุด
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { deleteObject, getDownloadUrl } from "../storage/fileStore";
import { imageUpload, storeImage, thumbnailUrl } from "../storage/imageUpload";
import {
  VEHICLE_DOC_KINDS,
  VEHICLE_MAINT_TYPES,
  VEHICLE_RULES,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
  bangkokDay,
} from "../utils/constants";

const router = Router();
const TX = { timeout: 30_000, maxWait: 15_000 } as const;

/** รายการรถแบบย่อ — ใช้ในตัวเลือกรถ (บอร์ดแผนงาน ฯลฯ) */
router.get("/", requireAuth, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const vehicles = await prisma.vehicle.findMany({
    where: status ? { status } : { status: { not: "INACTIVE" } },
    orderBy: { plateNumber: "asc" },
  });
  res.json(vehicles);
});

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็น ปี-เดือน-วัน")
  .nullable()
  .optional()
  .or(z.literal(""));
const toDate = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const intOrNull = z.number().int().min(0).nullable().optional();

const vehicleSchema = z.object({
  plateNumber: z.string().trim().min(1, "ต้องใส่ทะเบียนรถ").max(30),
  brand: z.string().trim().max(60).nullable().optional(),
  model: z.string().trim().max(60).nullable().optional(),
  type: z.string().trim().max(40).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  currentMileage: z.number().int().min(0).max(9_999_999).optional(),
  status: z.enum(VEHICLE_STATUSES).optional(),
  owner: z.string().trim().max(100).nullable().optional(),
  taxExpire: day,
  actExpire: day,
  insExpire: day,
  insCompany: z.string().trim().max(100).nullable().optional(),
  insPolicy: z.string().trim().max(100).nullable().optional(),
  oilEveryKm: intOrNull,
  oilEveryMonths: intOrNull,
  lastOilKm: intOrNull,
  lastOilDate: day,
  maintNote: z.string().trim().max(300).nullable().optional(),
});

function toData(p: z.infer<typeof vehicleSchema>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    if (["taxExpire", "actExpire", "insExpire", "lastOilDate"].includes(k)) out[k] = toDate(v as string);
    else out[k] = v === "" ? null : v;
  }
  return out;
}

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = vehicleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const plate = parsed.data.plateNumber.replace(/\s+/g, " ");
  if (await prisma.vehicle.findUnique({ where: { plateNumber: plate } })) {
    return res.status(409).json({ error: `มีรถทะเบียน ${plate} อยู่แล้ว` });
  }
  // รถใหม่เริ่มที่ว่างหรือซ่อมบำรุงได้เท่านั้น — "กำลังใช้งาน" มาจากการเบิกจริงเท่านั้น
  const status = parsed.data.status === "IN_USE" ? "AVAILABLE" : parsed.data.status;
  const vehicle = await prisma.vehicle.create({ data: { ...toData(parsed.data), plateNumber: plate, status } as never });
  res.status(201).json(vehicle);
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = vehicleSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const cur = await prisma.vehicle.findUnique({ where: { id } });
  if (!cur) return res.status(404).json({ error: "ไม่พบรถคันนี้" });
  const data = toData(parsed.data as z.infer<typeof vehicleSchema>);
  if (typeof data.plateNumber === "string") {
    const plate = (data.plateNumber as string).replace(/\s+/g, " ");
    const dup = await prisma.vehicle.findFirst({ where: { plateNumber: plate, id: { not: id } } });
    if (dup) return res.status(409).json({ error: `มีรถทะเบียน ${plate} อยู่แล้ว` });
    data.plateNumber = plate;
  }
  // สถานะ "กำลังใช้งาน" เป็นของการเบิก/คืนเท่านั้น — ตั้งเองได้จะได้รถที่ขึ้นว่ามีคนใช้แต่หาไม่เจอว่าใคร
  // ส่วนรถที่มีคนใช้อยู่ เปลี่ยนเป็นซ่อมบำรุงได้ (คืนแล้วจะไม่กลับเป็นว่าง) แต่เปลี่ยนเป็นว่างไม่ได้
  if (data.status === "IN_USE" || (cur.status === "IN_USE" && data.status === "AVAILABLE")) delete data.status;
  const vehicle = await prisma.vehicle.update({ where: { id }, data: data as never });
  res.json(vehicle);
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const used = await prisma.vehicleLog.count({ where: { vehicleId: id } });
  if (used > 0) {
    return res.status(409).json({ error: "รถคันนี้มีประวัติการใช้แล้ว ลบไม่ได้ — ตั้งสถานะเป็น \"เลิกใช้งาน\" แทน" });
  }
  const docs = await prisma.vehicleDoc.findMany({ where: { vehicleId: id }, select: { objectKey: true } });
  try {
    await prisma.vehicle.delete({ where: { id } });
  } catch {
    return res.status(404).json({ error: "ไม่พบรถคันนี้" });
  }
  for (const d of docs) deleteObject(d.objectKey).catch(() => {});
  res.json({ ok: true });
});

// ── ทะเบียน & ซ่อมบำรุง ─────────────────────────────────

/** สถานะรอบน้ำมันเครื่อง — ถึงกำหนดเมื่อครบ กม. หรือครบเดือน อย่างใดอย่างหนึ่งก่อน */
function oilStatus(v: {
  currentMileage: number;
  oilEveryKm: number | null;
  oilEveryMonths: number | null;
  lastOilKm: number | null;
  lastOilDate: Date | null;
}) {
  // ยังไม่เคยบันทึกเปลี่ยนน้ำมัน = ยังไม่รู้รอบ ไม่ใช่ "เกินรอบ" — นับเป็นเกินจะเตือนทุกคันตั้งแต่วันแรก
  if (v.lastOilKm === null && v.lastOilDate === null) return { level: "none" as const };
  const every = v.oilEveryKm ?? VEHICLE_RULES.OIL_EVERY_KM;
  const months = v.oilEveryMonths ?? VEHICLE_RULES.OIL_EVERY_MONTHS;
  const used = v.currentMileage - (v.lastOilKm ?? v.currentMileage);
  const remainKm = every - used;
  let dueDate: string | null = null;
  let daysLeft: number | null = null;
  if (v.lastOilDate) {
    const d = new Date(v.lastOilDate);
    d.setUTCMonth(d.getUTCMonth() + months);
    dueDate = ymd(d);
    daysLeft = Math.ceil((d.getTime() - new Date(`${bangkokDay()}T00:00:00.000Z`).getTime()) / 86_400_000);
  }
  const level =
    remainKm < 0 || (daysLeft !== null && daysLeft < 0)
      ? ("over" as const)
      : remainKm <= VEHICLE_RULES.SOON_KM || (daysLeft !== null && daysLeft <= VEHICLE_RULES.SOON_DAYS)
        ? ("soon" as const)
        : ("ok" as const);
  return {
    level,
    every,
    months,
    remainKm,
    dueKm: (v.lastOilKm ?? v.currentMileage) + every,
    dueDate,
    daysLeft,
    pct: Math.max(0, Math.min(100, Math.round((used / every) * 100))),
  };
}

function expiry(d: Date | null) {
  if (!d) return { date: null, level: "none" as const, daysLeft: null };
  const daysLeft = Math.ceil((d.getTime() - new Date(`${bangkokDay()}T00:00:00.000Z`).getTime()) / 86_400_000);
  return {
    date: ymd(d),
    daysLeft,
    level: daysLeft < 0 ? ("over" as const) : daysLeft <= VEHICLE_RULES.SOON_DAYS ? ("soon" as const) : ("ok" as const),
  };
}

router.get("/fleet", requireAuth, requireAdmin, async (_req, res) => {
  const yearStart = new Date(`${bangkokDay().slice(0, 4)}-01-01T00:00:00+07:00`);
  const [vehicles, ongoing, costs] = await Promise.all([
    prisma.vehicle.findMany({
      orderBy: { plateNumber: "asc" },
      include: { docs: { select: { kind: true } } },
    }),
    prisma.vehicleLog.findMany({ where: { status: "ONGOING" }, select: { vehicleId: true, user: { select: { name: true } } } }),
    prisma.vehicleMaintenance.aggregate({ where: { date: { gte: yearStart } }, _sum: { cost: true }, _count: true }),
  ]);
  const usedBy = new Map(ongoing.map((o) => [o.vehicleId, o.user.name]));
  res.json({
    vehicles: vehicles.map((v) => ({
      id: v.id,
      plateNumber: v.plateNumber,
      brand: v.brand,
      model: v.model,
      type: v.type,
      note: v.note,
      status: v.status,
      statusLabel: VEHICLE_STATUS_LABELS[v.status] ?? v.status,
      currentMileage: v.currentMileage,
      activeBy: usedBy.get(v.id) ?? null,
      owner: v.owner,
      insCompany: v.insCompany,
      insPolicy: v.insPolicy,
      oilEveryKm: v.oilEveryKm,
      oilEveryMonths: v.oilEveryMonths,
      lastOilKm: v.lastOilKm,
      lastOilDate: ymd(v.lastOilDate),
      maintNote: v.maintNote,
      tax: expiry(v.taxExpire),
      act: expiry(v.actExpire),
      ins: expiry(v.insExpire),
      oil: oilStatus(v),
      docs: Object.fromEntries(Object.keys(VEHICLE_DOC_KINDS).map((k) => [k, v.docs.some((d) => d.kind === k)])),
    })),
    costYear: costs._sum.cost ?? 0,
    logCountYear: costs._count,
    defaults: { km: VEHICLE_RULES.OIL_EVERY_KM, months: VEHICLE_RULES.OIL_EVERY_MONTHS },
    soon: { km: VEHICLE_RULES.SOON_KM, days: VEHICLE_RULES.SOON_DAYS },
    maintTypes: Object.entries(VEHICLE_MAINT_TYPES)
      .filter(([k]) => k !== "REPORT")
      .map(([value, label]) => ({ value, label })),
    docKinds: Object.entries(VEHICLE_DOC_KINDS).map(([value, label]) => ({ value, label })),
  });
});

/** ประวัติซ่อมบำรุงของรถคันหนึ่ง */
router.get("/:id/maintenance", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const rows = await prisma.vehicleMaintenance.findMany({
    where: { vehicleId: id },
    include: { createdBy: { select: { name: true } } },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  res.json(
    rows.map((r) => ({
      id: r.id,
      type: r.type,
      typeLabel: VEHICLE_MAINT_TYPES[r.type] ?? r.type,
      date: ymd(r.date),
      mileage: r.mileage,
      cost: r.cost,
      shop: r.shop,
      detail: r.detail,
      vehicleLogId: r.vehicleLogId,
      createdByName: r.createdBy?.name ?? null,
      thumbnailDataUrl: thumbnailUrl(r.thumbnail),
      hasFile: !!r.objectKey,
    }))
  );
});

/**
 * บันทึกการซ่อม/เปลี่ยนน้ำมัน — รูปใบเสร็จไม่บังคับ (ส่งเป็น multipart ได้)
 * เปลี่ยนน้ำมันเครื่อง = เริ่มนับรอบใหม่ให้เอง ไม่ต้องไปแก้ไมล์รอบล่าสุดอีกที่
 */
const maintSchema = z.object({
  type: z.enum(["OIL", "REPAIR", "CHECK", "TAX"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็น ปี-เดือน-วัน"),
  mileage: z.coerce.number().int().min(0).nullable().optional(),
  cost: z.coerce.number().int().min(0).default(0),
  shop: z.string().trim().max(150).optional(),
  detail: z.string().trim().max(1000).optional(),
  clearNote: z.union([z.boolean(), z.literal("true"), z.literal("false")]).optional(),
});

router.post("/:id/maintenance", requireAuth, requireAdmin, imageUpload, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const body = { ...req.body };
  for (const k of ["mileage", "cost"]) if (body[k] === "" || body[k] === "null") body[k] = undefined;
  const parsed = maintSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const p = parsed.data;
  const v = await prisma.vehicle.findUnique({ where: { id } });
  if (!v) return res.status(404).json({ error: "ไม่พบรถคันนี้" });

  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const stored = files?.file?.[0] ? await storeImage(req, res, `vehicles/maintenance/${id}`) : null;
  if (files?.file?.[0] && !stored) return;

  const date = new Date(`${p.date}T00:00:00.000Z`);
  await prisma.$transaction(async (tx) => {
    await tx.vehicleMaintenance.create({
      data: {
        vehicleId: id,
        type: p.type,
        date,
        mileage: p.mileage ?? null,
        cost: p.cost,
        shop: p.shop || null,
        detail: p.detail || null,
        objectKey: stored?.objectKey ?? null,
        thumbnail: stored?.thumbnail ?? null,
        createdById: req.auth!.userId,
      },
    });
    const patch: Record<string, unknown> = {};
    // บันทึกย้อนหลังที่เก่ากว่ารอบล่าสุดไม่ไปทับรอบปัจจุบัน
    if (p.type === "OIL" && (!v.lastOilDate || v.lastOilDate <= date)) {
      patch.lastOilDate = date;
      if (p.mileage != null) patch.lastOilKm = p.mileage;
    }
    if (p.clearNote === true || p.clearNote === "true") patch.maintNote = null;
    if (Object.keys(patch).length) await tx.vehicle.update({ where: { id }, data: patch });
  }, TX);
  res.status(201).json({ ok: true });
});

router.delete("/maintenance/:mid", requireAuth, requireAdmin, async (req, res) => {
  const mid = Number(req.params.mid);
  const r = await prisma.vehicleMaintenance.findUnique({ where: { id: mid } });
  if (!r) return res.status(404).json({ error: "ไม่พบรายการนี้" });
  await prisma.vehicleMaintenance.delete({ where: { id: mid } });
  if (r.objectKey) deleteObject(r.objectKey).catch(() => {});
  res.json({ ok: true });
});

router.get("/maintenance/:mid/link", requireAuth, requireAdmin, async (req, res) => {
  const r = await prisma.vehicleMaintenance.findUnique({ where: { id: Number(req.params.mid) }, select: { objectKey: true } });
  if (!r?.objectKey) return res.status(404).json({ error: "รายการนี้ไม่มีรูปแนบ" });
  res.json({ url: await getDownloadUrl(r.objectKey, { inline: true, fileName: `maintenance-${req.params.mid}.jpg` }) });
});

// ── เอกสารรถ ──

router.get("/:id/docs", requireAuth, requireAdmin, async (req, res) => {
  const rows = await prisma.vehicleDoc.findMany({
    where: { vehicleId: Number(req.params.id) },
    select: { id: true, kind: true, thumbnail: true, createdAt: true },
  });
  res.json(
    rows.map((d) => ({
      id: d.id,
      kind: d.kind,
      kindLabel: VEHICLE_DOC_KINDS[d.kind] ?? d.kind,
      thumbnailDataUrl: thumbnailUrl(d.thumbnail),
      createdAt: d.createdAt,
    }))
  );
});

/** อัปเอกสาร — แทนที่ของเดิมชนิดเดียวกัน (เล่มทะเบียนมีเล่มเดียว เก็บรุ่นเก่าไว้ไม่มีประโยชน์) */
router.post("/:id/docs", requireAuth, requireAdmin, imageUpload, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const kind = typeof req.body?.kind === "string" ? req.body.kind : "";
  if (!VEHICLE_DOC_KINDS[kind]) return res.status(400).json({ error: "ชนิดเอกสารไม่ถูกต้อง" });
  if (!(await prisma.vehicle.findUnique({ where: { id }, select: { id: true } }))) {
    return res.status(404).json({ error: "ไม่พบรถคันนี้" });
  }
  const stored = await storeImage(req, res, `vehicles/docs/${id}`);
  if (!stored) return;
  const old = await prisma.vehicleDoc.findUnique({ where: { vehicleId_kind: { vehicleId: id, kind } } });
  await prisma.vehicleDoc.upsert({
    where: { vehicleId_kind: { vehicleId: id, kind } },
    create: { vehicleId: id, kind, objectKey: stored.objectKey, thumbnail: stored.thumbnail, uploadedById: req.auth!.userId },
    update: { objectKey: stored.objectKey, thumbnail: stored.thumbnail, uploadedById: req.auth!.userId, createdAt: new Date() },
  });
  if (old) deleteObject(old.objectKey).catch(() => {});
  res.status(201).json({ ok: true });
});

router.get("/docs/:docId/link", requireAuth, requireAdmin, async (req, res) => {
  const d = await prisma.vehicleDoc.findUnique({ where: { id: Number(req.params.docId) } });
  if (!d) return res.status(404).json({ error: "ไม่พบเอกสารนี้" });
  res.json({ url: await getDownloadUrl(d.objectKey, { inline: true, fileName: `${d.kind.toLowerCase()}-${d.vehicleId}.jpg` }) });
});

export default router;
