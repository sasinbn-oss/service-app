/**
 * ลงทะเบียนใช้รถ — เบิก/คืนรถพร้อมรูปรอบคัน ยกความสามารถมาจาก OTTERI FLEET
 *
 * กฎเดียวกับ FLEET:
 *  1. คนหนึ่งค้างได้คันเดียว — ต้องคืนคันเดิมก่อนเบิกคันใหม่
 *  2. รถต้องว่างถึงจะเบิกได้
 *  3. ถ่ายรูปรอบคันอย่างน้อย MIN_PHOTOS รูป ทั้งตอนเบิกและตอนคืน
 *  4. ไมล์ตอนเบิกต่างจากไมล์ล่าสุดของรถได้ไม่เกิน ±MAX_MILEAGE_DIFF
 *     (ต่างได้ แต่บันทึกเป็น mileageGap ให้แอดมินเห็น)
 *  5. ไมล์ตอนคืนต้องไม่น้อยกว่าตอนเบิก และวิ่งต่อรอบไม่เกิน MAX_MILEAGE_DIFF
 *
 * ที่ต่างจาก FLEET คือใช้บัญชีเดียวกับระบบซ่อม และรู้แผนงานของทีม — รถที่บอร์ด
 * แผนงานจัดให้ทีมของช่างวันนี้จะถูกแนะนำก่อน
 */
import { Router, Response } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { deleteObject, getDownloadUrl } from "../storage/fileStore";
import { imageUpload, storeImage, thumbnailUrl } from "../storage/imageUpload";
import { documentPath, saveDocument } from "../documents/store";
import {
  ACTIVE_WORK_ORDER_STATUSES,
  VEHICLE_PHOTO_LABELS,
  VEHICLE_PURPOSES,
  VEHICLE_RULES,
  VEHICLE_STATUS_LABELS,
  bangkokDay,
  bangkokDayRange,
} from "../utils/constants";

const router = Router();
const TX = { timeout: 30_000, maxWait: 15_000 } as const;
const fmt = (n: number) => n.toLocaleString("th-TH");

const logInclude = {
  vehicle: { select: { id: true, plateNumber: true, brand: true, model: true, type: true } },
  user: { select: { id: true, name: true, employeeCode: true, team: true } },
  workOrder: { select: { id: true, code: true, title: true, branch: { select: { code: true, name: true } } } },
  returnedBy: { select: { name: true } },
  _count: { select: { photos: true } },
} as const;

type LogRow = Awaited<ReturnType<typeof prisma.vehicleLog.findFirstOrThrow<{ include: typeof logInclude }>>>;

function vehicleName(v: { brand: string | null; model: string | null }) {
  return [v.brand, v.model].filter(Boolean).join(" ") || null;
}

function logShape(l: LogRow) {
  return {
    id: l.id,
    status: l.status,
    vehicleId: l.vehicleId,
    plateNumber: l.vehicle.plateNumber,
    vehicleName: vehicleName(l.vehicle),
    vehicleType: l.vehicle.type,
    userId: l.userId,
    userName: l.user.name,
    userTeam: l.user.team,
    purpose: l.purpose,
    destination: l.destination,
    note: l.note,
    returnNote: l.returnNote,
    startMileage: l.startMileage,
    endMileage: l.endMileage,
    distance: l.endMileage !== null ? l.endMileage - l.startMileage : null,
    mileageGap: l.mileageGap,
    cost: l.cost,
    repairNote: l.repairNote,
    startedAt: l.startedAt,
    endedAt: l.endedAt,
    workOrder: l.workOrder
      ? { id: l.workOrder.id, code: l.workOrder.code, title: l.workOrder.title, branch: `${l.workOrder.branch.code} ${l.workOrder.branch.name}` }
      : null,
    // แอดมินคืนแทน — ไม่มีรูปตอนคืน และต้องเห็นว่าไม่ใช่เจ้าของรายการคืนเอง
    returnedByName: l.returnedBy?.name ?? null,
    photoCount: l._count.photos,
  };
}

/**
 * รถคันไหนที่แผนวันนี้จัดให้ทีมของคนนี้ — ดึงจากบอร์ดแผนงาน
 *
 * ดูทั้งทีมที่สังกัดและแผนที่ระบุชื่อคนนี้ไว้ (ยืมข้ามทีม) เพราะช่างที่ถูกยืม
 * ไปช่วยทีมอื่นวันนั้นต้องขับรถของทีมที่ไปด้วย ไม่ใช่รถของทีมตัวเอง
 */
async function plannedVehicleIds(userId: number, team: string | null): Promise<Set<number>> {
  const day = new Date(`${bangkokDay()}T00:00:00.000Z`);
  const plans = await prisma.teamDayPlan.findMany({
    where: {
      date: day,
      vehicleId: { not: null },
      OR: [...(team ? [{ team }] : []), { members: { some: { userId } } }],
    },
    select: { vehicleId: true },
  });
  return new Set(plans.map((p) => p.vehicleId!));
}

// ── ช่าง ────────────────────────────────────────────────

/** ทุกอย่างที่หน้า "ลงทะเบียนใช้รถ" ต้องใช้ในคำขอเดียว */
router.get("/status", requireAuth, async (req: AuthRequest, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { team: true } });
  const [active, vehicles, ongoing, planned] = await Promise.all([
    prisma.vehicleLog.findFirst({ where: { userId: req.auth!.userId, status: "ONGOING" }, include: logInclude }),
    prisma.vehicle.findMany({ where: { status: { not: "INACTIVE" } }, orderBy: { plateNumber: "asc" } }),
    prisma.vehicleLog.findMany({
      where: { status: "ONGOING" },
      select: { vehicleId: true, user: { select: { name: true } } },
    }),
    plannedVehicleIds(req.auth!.userId, me?.team ?? null),
  ]);
  const usedBy = new Map(ongoing.map((o) => [o.vehicleId, o.user.name]));

  // ใบงานที่ช่างน่าจะขับรถไป — งานของทีมที่ยังเปิดอยู่ เรียงงานที่นัดใกล้ที่สุดก่อน
  const workOrders = me?.team
    ? await prisma.workOrder.findMany({
        where: { assignedTeam: me.team, status: { in: [...ACTIVE_WORK_ORDER_STATUSES] } },
        select: { id: true, code: true, title: true, scheduledAt: true, branch: { select: { code: true, name: true } } },
        orderBy: [{ scheduledAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
        take: 30,
      })
    : [];

  res.json({
    activeLog: active ? logShape(active) : null,
    vehicles: vehicles.map((v) => ({
      id: v.id,
      plateNumber: v.plateNumber,
      name: vehicleName(v),
      type: v.type,
      status: v.status,
      statusLabel: VEHICLE_STATUS_LABELS[v.status] ?? v.status,
      note: v.note,
      currentMileage: v.currentMileage,
      activeBy: usedBy.get(v.id) ?? null,
      plannedForMe: planned.has(v.id),
    })),
    workOrders: workOrders.map((w) => ({
      id: w.id,
      code: w.code,
      label: `${w.code} · ${w.branch.code} ${w.branch.name} · ${w.title}`,
      branch: `${w.branch.code} ${w.branch.name}`,
    })),
    rules: {
      minPhotos: VEHICLE_RULES.MIN_PHOTOS,
      maxPhotos: VEHICLE_RULES.MAX_PHOTOS,
      maxMileageDiff: VEHICLE_RULES.MAX_MILEAGE_DIFF,
      photoLabels: VEHICLE_PHOTO_LABELS,
      purposes: VEHICLE_PURPOSES,
    },
  });
});

/**
 * อัปรูปรอบคันหนึ่งรูป — ระหว่างช่างกำลังถ่าย ยังไม่ผูกกับรายการ
 *
 * ผูกตอนกดยืนยันเบิก/คืน ทำให้ปุ่มยืนยันไม่ต้องรอส่ง 5 รูปพร้อมกัน
 * รูปที่อัปแล้วไม่ได้ใช้ (ปิดหน้าไปก่อน) ใช้ต่อได้ภายใน UPLOAD_TTL_HOURS
 */
router.post("/photos", requireAuth, imageUpload, async (req: AuthRequest, res) => {
  const phase = req.body?.phase === "END" ? "END" : "START";
  const stored = await storeImage(req, res, `vehicles/${bangkokDay().slice(0, 7)}`);
  if (!stored) return;
  const row = await prisma.vehicleLogPhoto.create({
    data: { phase, objectKey: stored.objectKey, thumbnail: stored.thumbnail, uploadedById: req.auth!.userId },
    select: { id: true },
  });
  res.status(201).json({ id: row.id, thumbnailDataUrl: thumbnailUrl(stored.thumbnail) });
});

/** ลบรูปที่อัปไปแล้วแต่ยังไม่ได้ใช้ — ของตัวเองเท่านั้น รูปที่ผูกกับรายการแล้วเป็นหลักฐาน ลบไม่ได้ */
router.delete("/photos/:pid", requireAuth, async (req: AuthRequest, res) => {
  const pid = Number(req.params.pid);
  const row = await prisma.vehicleLogPhoto.findUnique({ where: { id: pid } });
  if (!row || row.uploadedById !== req.auth!.userId) return res.status(404).json({ error: "ไม่พบรูปนี้" });
  if (row.logId !== null) return res.status(409).json({ error: "รูปนี้เป็นหลักฐานของรายการแล้ว ลบไม่ได้" });
  await prisma.vehicleLogPhoto.delete({ where: { id: pid } });
  deleteObject(row.objectKey).catch((e) => console.error("photo delete failed", e));
  res.json({ ok: true });
});

const photoIds = z.array(z.number().int().positive()).max(VEHICLE_RULES.MAX_PHOTOS);
const mileage = z.number().int().min(0, "เลขไมล์ต้องไม่ติดลบ").max(9_999_999);

/**
 * ผูกรูปที่อัปไว้กับรายการ — ต้องเป็นรูปของคนนี้ ยังไม่เคยใช้ และยังไม่หมดอายุ
 * นับจำนวนที่ผูกได้จริง ไม่ใช่จำนวนที่ส่งมา กันส่ง id รูปของคนอื่นหรือรูปซ้ำมานับ
 */
async function claimPhotos(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  ids: number[],
  userId: number,
  logId: number,
  phase: "START" | "END"
) {
  const since = new Date(Date.now() - VEHICLE_RULES.UPLOAD_TTL_HOURS * 3600_000);
  const n = await tx.vehicleLogPhoto.updateMany({
    where: { id: { in: [...new Set(ids)] }, uploadedById: userId, logId: null, createdAt: { gte: since } },
    data: { logId, phase },
  });
  if (n.count < VEHICLE_RULES.MIN_PHOTOS) {
    throw new HttpError(
      400,
      `ต้องมีรูปรถอย่างน้อย ${VEHICLE_RULES.MIN_PHOTOS} รูป (ใช้ได้ ${n.count} รูป — รูปที่อัปไว้นานเกิน ${VEHICLE_RULES.UPLOAD_TTL_HOURS} ชม. ต้องถ่ายใหม่)`
    );
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
function sendError(res: Response, e: unknown) {
  if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
  throw e;
}

const startSchema = z.object({
  vehicleId: z.number().int().positive(),
  mileage,
  purpose: z.string().trim().min(1, "ต้องบอกว่าไปทำอะไร").max(200),
  destination: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
  workOrderId: z.number().int().positive().nullable().optional(),
  photoIds,
});

router.post("/start", requireAuth, async (req: AuthRequest, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const p = parsed.data;
  const userId = req.auth!.userId;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const mine = await tx.vehicleLog.findFirst({
        where: { userId, status: "ONGOING" },
        select: { vehicle: { select: { plateNumber: true } } },
      });
      if (mine) throw new HttpError(409, `ยังไม่ได้คืนรถ ${mine.vehicle.plateNumber} — คืนคันเดิมก่อนจึงเบิกคันใหม่ได้`);

      const v = await tx.vehicle.findUnique({ where: { id: p.vehicleId } });
      if (!v) throw new HttpError(404, "ไม่พบรถที่เลือก");
      const gap = p.mileage - v.currentMileage;
      if (Math.abs(gap) > VEHICLE_RULES.MAX_MILEAGE_DIFF) {
        throw new HttpError(
          400,
          `เลขไมล์ ${fmt(p.mileage)} ต่างจากไมล์ล่าสุดของรถ (${fmt(v.currentMileage)}) เกิน ±${fmt(VEHICLE_RULES.MAX_MILEAGE_DIFF)} กม. — ตรวจเลขไมล์อีกครั้ง`
        );
      }
      // จองรถแบบมีเงื่อนไข — สองคนกดคันเดียวกันพร้อมกัน คนที่สองได้ count 0
      const took = await tx.vehicle.updateMany({
        where: { id: v.id, status: "AVAILABLE" },
        data: { status: "IN_USE", currentMileage: p.mileage },
      });
      if (took.count === 0) throw new HttpError(409, `รถ ${v.plateNumber} ไม่ว่างแล้ว — เลือกคันอื่น`);

      const log = await tx.vehicleLog.create({
        data: {
          vehicleId: v.id,
          userId,
          purpose: p.purpose,
          destination: p.destination || null,
          note: p.note || null,
          startMileage: p.mileage,
          mileageGap: gap,
          workOrderId: p.workOrderId ?? null,
        },
      });
      await claimPhotos(tx, p.photoIds, userId, log.id, "START");
      return log;
    }, TX);
    const row = await prisma.vehicleLog.findUniqueOrThrow({ where: { id: created.id }, include: logInclude });
    res.status(201).json(logShape(row));
  } catch (e) {
    return sendError(res, e);
  }
});

const endSchema = z.object({
  mileage,
  cost: z.number().int().min(0, "ค่าใช้จ่ายต้องไม่ติดลบ").max(10_000_000).nullable().optional(),
  repairNote: z.string().trim().max(500).optional(),
  note: z.string().trim().max(500).optional(),
  photoIds,
});

router.post("/:id/end", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const parsed = endSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const p = parsed.data;
  const userId = req.auth!.userId;

  try {
    await prisma.$transaction(async (tx) => {
      const log = await tx.vehicleLog.findUnique({ where: { id }, include: { vehicle: true } });
      if (!log || log.userId !== userId) throw new HttpError(404, "ไม่พบรายการใช้รถของคุณ");
      if (p.mileage < log.startMileage) {
        throw new HttpError(400, `เลขไมล์ตอนคืน (${fmt(p.mileage)}) ต้องไม่น้อยกว่าตอนเบิก (${fmt(log.startMileage)})`);
      }
      if (p.mileage - log.startMileage > VEHICLE_RULES.MAX_MILEAGE_DIFF) {
        throw new HttpError(
          400,
          `ระยะทาง ${fmt(p.mileage - log.startMileage)} กม. เกินกำหนด ${fmt(VEHICLE_RULES.MAX_MILEAGE_DIFF)} กม. ต่อรอบ — ตรวจเลขไมล์ หรือแจ้งแอดมิน`
        );
      }
      const now = new Date();
      // คืนแบบมีเงื่อนไข กันกดคืนซ้ำสองครั้ง (เน็ตช้าแล้วกดอีกที)
      const done = await tx.vehicleLog.updateMany({
        where: { id, status: "ONGOING" },
        data: {
          status: "COMPLETED",
          endMileage: p.mileage,
          endedAt: now,
          cost: p.cost ?? null,
          repairNote: p.repairNote || null,
          returnNote: p.note || null,
        },
      });
      if (done.count === 0) throw new HttpError(409, "รายการนี้คืนรถไปแล้ว");
      await claimPhotos(tx, p.photoIds, userId, id, "END");

      const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
      await tx.vehicle.update({
        where: { id: log.vehicleId },
        data: {
          // รถที่แอดมินตั้งเป็นซ่อมบำรุงระหว่างที่มีคนใช้อยู่ — คืนแล้วต้องยังเป็นซ่อมบำรุง
          status: log.vehicle.status === "IN_USE" ? "AVAILABLE" : log.vehicle.status,
          currentMileage: p.mileage,
          ...(p.repairNote
            ? { maintNote: `ช่างแจ้งซ่อม (${bangkokDay(now).slice(8)}/${bangkokDay(now).slice(5, 7)}): ${p.repairNote}` }
            : {}),
        },
      });
      // แจ้งซ่อม → ขึ้นในประวัติซ่อมบำรุงของรถทันที แอดมินไม่ต้องไปไล่หาในรายการใช้รถ
      if (p.repairNote) {
        await tx.vehicleMaintenance.create({
          data: {
            vehicleId: log.vehicleId,
            type: "REPORT",
            date: now,
            mileage: p.mileage,
            detail: `${p.repairNote} — แจ้งโดย ${user?.name ?? "-"}`,
            vehicleLogId: id,
            createdById: userId,
          },
        });
      }
    }, TX);
    const row = await prisma.vehicleLog.findUniqueOrThrow({ where: { id }, include: logInclude });
    res.json(logShape(row));
  } catch (e) {
    return sendError(res, e);
  }
});

/**
 * รายการใช้รถ — ช่างเห็นของตัวเอง แอดมินเห็นทั้งหมดพร้อมตัวกรอง
 * ตัดที่ 1,000 แถว เท่ากับ FLEET — เดือนหนึ่งไม่ถึงอยู่แล้ว
 */
const listQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["ONGOING", "COMPLETED"]).optional(),
  vehicleId: z.coerce.number().int().optional(),
  userId: z.coerce.number().int().optional(),
  q: z.string().trim().max(100).optional(),
});

function listWhere(isAdmin: boolean, me: number, q: z.infer<typeof listQuery>) {
  const started =
    q.from || q.to
      ? {
          startedAt: {
            ...(q.from ? { gte: bangkokDayRange(q.from).from } : {}),
            ...(q.to ? { lt: bangkokDayRange(q.to).to } : {}),
          },
        }
      : {};
  return {
    ...(isAdmin ? (q.userId ? { userId: q.userId } : {}) : { userId: me }),
    ...(q.vehicleId ? { vehicleId: q.vehicleId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...started,
    ...(q.q
      ? {
          OR: [
            { purpose: { contains: q.q, mode: "insensitive" as const } },
            { destination: { contains: q.q, mode: "insensitive" as const } },
            { note: { contains: q.q, mode: "insensitive" as const } },
            { returnNote: { contains: q.q, mode: "insensitive" as const } },
            { vehicle: { plateNumber: { contains: q.q, mode: "insensitive" as const } } },
            { user: { name: { contains: q.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "ตัวกรองไม่ถูกต้อง" });
  const rows = await prisma.vehicleLog.findMany({
    where: listWhere(req.auth!.role === "ADMIN", req.auth!.userId, parsed.data),
    include: logInclude,
    orderBy: { startedAt: "desc" },
    take: 1000,
  });
  res.json(rows.map(logShape));
});

/** รูปของรายการ — เจ้าของรายการหรือแอดมิน */
router.get("/:id/photos", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const log = await prisma.vehicleLog.findUnique({ where: { id }, select: { userId: true } });
  if (!log || (log.userId !== req.auth!.userId && req.auth!.role !== "ADMIN")) {
    return res.status(404).json({ error: "ไม่พบรายการนี้" });
  }
  const photos = await prisma.vehicleLogPhoto.findMany({
    where: { logId: id },
    select: { id: true, phase: true, thumbnail: true },
    orderBy: { id: "asc" },
  });
  res.json(photos.map((p) => ({ id: p.id, phase: p.phase, thumbnailDataUrl: thumbnailUrl(p.thumbnail) })));
});

router.get("/photos/:pid/link", requireAuth, async (req: AuthRequest, res) => {
  const pid = Number(req.params.pid);
  const p = await prisma.vehicleLogPhoto.findUnique({
    where: { id: pid },
    select: { objectKey: true, uploadedById: true, log: { select: { userId: true } } },
  });
  const allowed = p && (req.auth!.role === "ADMIN" || p.uploadedById === req.auth!.userId || p.log?.userId === req.auth!.userId);
  if (!p || !allowed) return res.status(404).json({ error: "ไม่พบรูปนี้" });
  res.json({ url: await getDownloadUrl(p.objectKey, { fileName: `vehicle-${pid}.jpg`, inline: true }) });
});

// ── แอดมิน ──────────────────────────────────────────────

/**
 * ภาพรวมรถของวันหนึ่ง
 * กม. ของวัน = ผลรวมระยะของรายการที่ "คืนแล้ว" ในวันนั้น (แบบเดียวกับ FLEET)
 * รายการที่ยังไม่คืนยังไม่รู้ระยะ นับรวมไม่ได้
 */
router.get("/dashboard", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const day = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : bangkokDay();
  const { from, to } = bangkokDayRange(day);
  const weekFrom = new Date(from.getTime() - 6 * 86_400_000);

  const [vehicles, returned, started, ongoing] = await Promise.all([
    prisma.vehicle.findMany({ where: { status: { not: "INACTIVE" } }, orderBy: { plateNumber: "asc" } }),
    prisma.vehicleLog.findMany({
      where: { status: "COMPLETED", endedAt: { gte: weekFrom, lt: to } },
      select: { vehicleId: true, startMileage: true, endMileage: true, endedAt: true },
    }),
    prisma.vehicleLog.findMany({ where: { startedAt: { gte: from, lt: to } }, include: logInclude }),
    prisma.vehicleLog.findMany({ where: { status: "ONGOING" }, include: logInclude, orderBy: { startedAt: "asc" } }),
  ]);
  const km = (l: { startMileage: number; endMileage: number | null }) => (l.endMileage ?? l.startMileage) - l.startMileage;
  const ofDay = returned.filter((l) => l.endedAt! >= from && l.endedAt! < to);
  const perVehicle = vehicles
    .map((v) => {
      const active = ongoing.find((o) => o.vehicleId === v.id);
      return {
        id: v.id,
        plateNumber: v.plateNumber,
        name: vehicleName(v),
        status: v.status,
        statusLabel: VEHICLE_STATUS_LABELS[v.status] ?? v.status,
        currentMileage: v.currentMileage,
        km: ofDay.filter((l) => l.vehicleId === v.id).reduce((s, l) => s + km(l), 0),
        trips: started.filter((l) => l.vehicleId === v.id).length,
        activeBy: active?.user.name ?? null,
        activeSince: active?.startedAt ?? null,
      };
    })
    .sort((a, b) => b.km - a.km || a.plateNumber.localeCompare(b.plateNumber));
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = bangkokDay(new Date(from.getTime() - (6 - i) * 86_400_000 + 12 * 3600_000));
    const r = bangkokDayRange(d);
    return { date: d, km: returned.filter((l) => l.endedAt! >= r.from && l.endedAt! < r.to).reduce((s, l) => s + km(l), 0) };
  });
  res.json({
    date: day,
    stats: {
      km: ofDay.reduce((s, l) => s + km(l), 0),
      trips: started.length,
      inUse: vehicles.filter((v) => v.status === "IN_USE").length,
      available: vehicles.filter((v) => v.status === "AVAILABLE").length,
      maintenance: vehicles.filter((v) => v.status === "MAINTENANCE").length,
    },
    perVehicle,
    last7,
    activeLogs: ongoing.map(logShape),
    warnings: started.filter((l) => l.mileageGap !== 0).map(logShape),
  });
});

/** ส่งออก Excel ตามตัวกรองเดียวกับหน้าประวัติ */
router.get("/export", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "ตัวกรองไม่ถูกต้อง" });
  const rows = (
    await prisma.vehicleLog.findMany({
      where: listWhere(true, req.auth!.userId, parsed.data),
      include: logInclude,
      orderBy: { startedAt: "asc" },
      take: 5000,
    })
  ).map(logShape);

  const wb = new ExcelJS.Workbook();
  const sh = wb.addWorksheet("การใช้รถ");
  sh.columns = [
    { header: "เวลาเบิก", key: "s", width: 18 },
    { header: "เวลาคืน", key: "e", width: 18 },
    { header: "ทะเบียน", key: "plate", width: 12 },
    { header: "ช่าง", key: "user", width: 20 },
    { header: "ไปทำอะไร", key: "purpose", width: 18 },
    { header: "ปลายทาง", key: "dest", width: 24 },
    { header: "ใบงาน", key: "wo", width: 12 },
    { header: "ไมล์ออก", key: "m1", width: 10 },
    { header: "ไมล์เข้า", key: "m2", width: 10 },
    { header: "ระยะทาง (กม.)", key: "km", width: 12 },
    { header: "ไมล์ไม่ต่อเนื่อง", key: "gap", width: 12 },
    { header: "ค่าใช้จ่าย (บาท)", key: "cost", width: 13 },
    { header: "แจ้งซ่อม", key: "repair", width: 24 },
    { header: "สถานะ", key: "st", width: 12 },
    { header: "หมายเหตุคืนรถ", key: "rn", width: 24 },
  ];
  sh.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sh.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3B60" } };
  const th = (d: Date | null) => (d ? new Date(d).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "");
  for (const r of rows) {
    sh.addRow({
      s: th(r.startedAt),
      e: r.endedAt ? th(r.endedAt) : "ยังไม่คืน",
      plate: r.plateNumber,
      user: r.userName,
      purpose: r.purpose,
      dest: r.destination ?? "",
      wo: r.workOrder?.code ?? "",
      m1: r.startMileage,
      m2: r.endMileage ?? "",
      km: r.distance ?? "",
      gap: r.mileageGap || "",
      cost: r.cost ?? 0,
      repair: r.repairNote ?? "",
      st: r.status === "ONGOING" ? "กำลังใช้งาน" : r.returnedByName ? `คืนแล้ว (แอดมินคืนแทน)` : "คืนแล้ว",
      rn: r.returnNote ?? "",
    });
  }
  sh.addRow({
    dest: "รวม",
    km: rows.reduce((s, r) => s + (r.distance ?? 0), 0),
    cost: rows.reduce((s, r) => s + (r.cost ?? 0), 0),
    st: `${rows.length} เที่ยว`,
  }).font = { bold: true };
  sh.views = [{ state: "frozen", ySplit: 1 }];

  const span = [parsed.data.from, parsed.data.to].filter(Boolean).join("_ถึง_") || bangkokDay();
  const stored = saveDocument({
    filename: `การใช้รถ_${span}.xlsx`,
    asciiFilename: `vehicle-use_${span.replace(/[^\d-]/g, "_")}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data: Buffer.from(await wb.xlsx.writeBuffer()),
    ownerId: req.auth!.userId,
  });
  res.json({ filename: stored.filename, path: documentPath(stored), count: rows.length });
});

/** ช่างลืมกดคืน — แอดมินคืนแทน ไม่ต้องมีรูป แต่บันทึกว่าใครคืนแทน */
const forceSchema = z.object({ mileage, note: z.string().trim().max(400).optional() });

router.post("/:id/force-return", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const parsed = forceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  try {
    await prisma.$transaction(async (tx) => {
      const log = await tx.vehicleLog.findUnique({ where: { id }, include: { vehicle: true } });
      if (!log) throw new HttpError(404, "ไม่พบรายการนี้");
      if (parsed.data.mileage < log.startMileage) {
        throw new HttpError(400, `เลขไมล์ตอนคืนต้องไม่น้อยกว่าตอนเบิก (${fmt(log.startMileage)})`);
      }
      const done = await tx.vehicleLog.updateMany({
        where: { id, status: "ONGOING" },
        data: {
          status: "COMPLETED",
          endMileage: parsed.data.mileage,
          endedAt: new Date(),
          returnedById: req.auth!.userId,
          returnNote: `[แอดมินคืนแทน] ${parsed.data.note ?? ""}`.trim(),
        },
      });
      if (done.count === 0) throw new HttpError(409, "รายการนี้คืนรถไปแล้ว");
      await tx.vehicle.update({
        where: { id: log.vehicleId },
        data: {
          status: log.vehicle.status === "IN_USE" ? "AVAILABLE" : log.vehicle.status,
          currentMileage: parsed.data.mileage,
        },
      });
    }, TX);
    res.json({ ok: true });
  } catch (e) {
    return sendError(res, e);
  }
});

/**
 * แอดมินแก้รายการ — ไมล์ที่กรอกผิด ระยะคิดใหม่ให้เอง
 * ถ้าเป็นรายการล่าสุดของรถ เลขไมล์ของรถต้องตามด้วย ไม่งั้นการเบิกครั้งถัดไปโดนตรวจกับเลขผิด
 */
const editSchema = z.object({
  purpose: z.string().trim().min(1).max(200),
  destination: z.string().trim().max(200).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  returnNote: z.string().trim().max(500).nullable().optional(),
  startMileage: mileage,
  endMileage: mileage.nullable().optional(),
  cost: z.number().int().min(0).nullable().optional(),
});

router.patch("/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const p = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      const log = await tx.vehicleLog.findUnique({ where: { id } });
      if (!log) throw new HttpError(404, "ไม่พบรายการนี้");
      const end = log.status === "COMPLETED" ? p.endMileage ?? log.endMileage : null;
      if (end !== null && end < p.startMileage) throw new HttpError(400, "เลขไมล์ตอนคืนต้องไม่น้อยกว่าตอนเบิก");
      await tx.vehicleLog.update({
        where: { id },
        data: {
          purpose: p.purpose,
          destination: p.destination ?? null,
          note: p.note ?? null,
          returnNote: p.returnNote ?? null,
          startMileage: p.startMileage,
          endMileage: end,
          cost: p.cost ?? log.cost,
          mileageGap: log.mileageGap + (p.startMileage - log.startMileage),
        },
      });
      const latest = await tx.vehicleLog.findFirst({ where: { vehicleId: log.vehicleId }, orderBy: { startedAt: "desc" } });
      if (latest?.id === id) {
        await tx.vehicle.update({ where: { id: log.vehicleId }, data: { currentMileage: end ?? p.startMileage } });
      }
    }, TX);
    const row = await prisma.vehicleLog.findUniqueOrThrow({ where: { id }, include: logInclude });
    res.json(logShape(row));
  } catch (e) {
    return sendError(res, e);
  }
});

/** ลบรายการที่ไม่ควรมีอยู่ (เบิกผิดคัน ลองระบบ) — รูปถูกลบตามไปด้วย */
router.delete("/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const log = await prisma.vehicleLog.findUnique({ where: { id }, include: { photos: { select: { objectKey: true } } } });
  if (!log) return res.status(404).json({ error: "ไม่พบรายการนี้" });
  await prisma.$transaction(async (tx) => {
    await tx.vehicleLog.delete({ where: { id } });
    if (log.status === "ONGOING") {
      await tx.vehicle.updateMany({ where: { id: log.vehicleId, status: "IN_USE" }, data: { status: "AVAILABLE" } });
    }
  }, TX);
  for (const p of log.photos) deleteObject(p.objectKey).catch((e) => console.error("photo delete failed", e));
  res.json({ ok: true });
});

export default router;
