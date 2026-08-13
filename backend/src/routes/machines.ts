/**
 * ข้อมูลเครื่องซัก/อบ สำหรับแดชบอร์ดติดตามเครื่องดับ
 *
 * แดชบอร์ดตอบคำถามเดียว: "ตอนนี้เครื่องไหนดับอยู่ และดับมานานแค่ไหน"
 * การกรองและการจัดกลุ่มทำที่ฝั่งเซิร์ฟเวอร์ทั้งหมด เพราะจำนวนเครื่องจะโตขึ้นเรื่อย ๆ
 * จนส่งทั้งหมดไปให้แอปกรองเองไม่ไหว
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

/** เกินกี่ชั่วโมงถือว่า "ดับนาน" — ใช้เป็นค่าตั้งต้น แอปส่งค่าอื่นมาทับได้ */
const DEFAULT_STALE_HOURS = 72;

const querySchema = z.object({
  status: z.string().optional(),
  ownership: z.enum(["COCO", "DODO"]).optional(),
  grade: z.enum(["A", "B", "C"]).optional(),
  region: z.string().optional(),
  search: z.string().optional(),
  staleOnly: z.enum(["true", "false"]).optional(),
  staleHours: z.coerce.number().positive().max(24 * 365).optional(),
});

router.get("/", requireAuth, async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { status = "OFF", ownership, grade, region, search, staleOnly } = parsed.data;
  const staleHours = parsed.data.staleHours ?? DEFAULT_STALE_HOURS;
  const staleBefore = new Date(Date.now() - staleHours * 60 * 60 * 1000);

  const keyword = search?.trim();
  const machines = await prisma.machine.findMany({
    where: {
      ...(status === "ALL" ? {} : { status }),
      branch: {
        ...(ownership ? { ownership } : {}),
        ...(grade ? { grade } : {}),
        ...(region ? { region } : {}),
      },
      ...(keyword
        ? {
            OR: [
              { code: { contains: keyword, mode: "insensitive" } },
              { branch: { code: { contains: keyword, mode: "insensitive" } } },
              { branch: { name: { contains: keyword, mode: "insensitive" } } },
              { branch: { zone: { contains: keyword, mode: "insensitive" } } },
            ],
          }
        : {}),
      // เครื่องที่ไม่เคยมีรายการเลย ถือว่าเข้าข่าย "ดับนาน" ด้วย ไม่ใช่ข้ามไป
      ...(staleOnly === "true"
        ? { OR: [{ lastTxnAt: { lt: staleBefore } }, { lastTxnAt: null }] }
        : {}),
    },
    include: {
      branch: {
        select: {
          code: true,
          name: true,
          region: true,
          ownership: true,
          zone: true,
          grade: true,
        },
      },
    },
    // เรียงจากดับนานสุดก่อน เพราะนั่นคือลำดับที่ควรเข้าไปซ่อม
    orderBy: [{ lastTxnAt: "asc" }],
  });

  const rows = machines.map((m) => ({
    id: m.id,
    machineCode: m.code,
    type: m.type,
    status: m.status,
    lastTxnAt: m.lastTxnAt,
    branchCode: m.branch.code,
    branchName: m.branch.name,
    region: m.branch.region,
    ownership: m.branch.ownership,
    zone: m.branch.zone,
    grade: m.branch.grade,
  }));

  const isStale = (r: (typeof rows)[number]) =>
    r.lastTxnAt === null || r.lastTxnAt < staleBefore;

  res.json({
    // ส่งเวลาของเซิร์ฟเวอร์ไปด้วย เพื่อให้ "ดับมากี่ชั่วโมง" คิดจากนาฬิกาเดียวกัน
    // ไม่ใช่นาฬิกาเครื่องผู้ใช้ซึ่งอาจตั้งผิดหรือคนละโซนเวลา
    now: new Date().toISOString(),
    staleHours,
    summary: {
      total: rows.length,
      COCO: rows.filter((r) => r.ownership === "COCO").length,
      DODO: rows.filter((r) => r.ownership === "DODO").length,
      stale: rows.filter(isStale).length,
    },
    rows,
  });
});

/** รายชื่อภาคและโซนที่มีอยู่จริง ใช้เติมตัวเลือกในแดชบอร์ด */
router.get("/filters", requireAuth, async (_req, res) => {
  const branches = await prisma.branch.findMany({
    where: { machines: { some: {} } },
    select: { region: true, zone: true },
  });

  const unique = (values: (string | null)[]) =>
    [...new Set(values.filter((v): v is string => Boolean(v)))].sort();

  res.json({
    regions: unique(branches.map((b) => b.region)),
    zones: unique(branches.map((b) => b.zone)),
  });
});

const upsertSchema = z.object({
  machines: z
    .array(
      z.object({
        branchCode: z.string().min(1),
        machineCode: z.string().min(1),
        status: z.enum(["ON", "OFF"]),
        lastTxnAt: z.string().datetime().nullable().optional(),
      })
    )
    .min(1)
    .max(5000),
});

/**
 * อัปเดตสถานะเครื่องเป็นชุด — ปลายทางสำหรับข้อมูลที่มาจากระบบเก็บเงิน
 *
 * ตอนนี้ยังต้องมีคนยิงเข้ามาเอง (หรือสคริปต์ที่อ่านไฟล์ export)
 * แยกเป็น endpoint ต่างหากตั้งแต่แรกเพื่อให้เปลี่ยนไปดึงอัตโนมัติทีหลัง
 * โดยไม่ต้องแก้ทั้งแดชบอร์ด
 */
router.post("/sync", requireAuth, requireAdmin, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const branchCodes = [...new Set(parsed.data.machines.map((m) => m.branchCode))];
  const branches = await prisma.branch.findMany({
    where: { code: { in: branchCodes } },
    select: { id: true, code: true },
  });
  const byCode = new Map(branches.map((b) => [b.code, b.id]));

  const unknownBranches = branchCodes.filter((c) => !byCode.has(c));
  const updatable = parsed.data.machines.filter((m) => byCode.has(m.branchCode));

  let updated = 0;
  for (const m of updatable) {
    const branchId = byCode.get(m.branchCode)!;
    const lastTxnAt = m.lastTxnAt ? new Date(m.lastTxnAt) : null;
    await prisma.machine.upsert({
      where: { branchId_code: { branchId, code: m.machineCode } },
      update: { status: m.status, lastTxnAt },
      create: {
        branchId,
        code: m.machineCode,
        // ตัวอักษรแรกของรหัสเครื่องบอกชนิด W = ซัก, D = อบ
        type: m.machineCode.trim().toUpperCase().startsWith("D") ? "DRYER" : "WASHER",
        status: m.status,
        lastTxnAt,
      },
    });
    updated += 1;
  }

  res.json({ updated, unknownBranches });
});

export default router;
