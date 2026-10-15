/**
 * สำรองข้อมูล — Super Admin เท่านั้น (ดู backup/backup.ts)
 *
 * แอดมินทั่วไปเห็นข้อมูลแทบทุกอย่างอยู่แล้ว แต่ไฟล์นี้คือข้อมูลทั้งบริษัทในก้อนเดียว ยกออกไปได้ทั้งก้อน
 * จึงจำกัดไว้ที่คนเดียวที่รับผิดชอบระบบ
 */
import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireSuperAdmin, AuthRequest } from "../middleware/auth";
import { getDownloadUrl, SIGNED_URL_TTL_SECONDS } from "../storage/fileStore";
import {
  BACKUP_HOUR,
  BACKUP_KEEP_DAYS,
  backupBaseName,
  ensureDailyBackup,
  pastBackupHour,
  runBackup,
} from "../backup/backup";
import { bangkokDay } from "../utils/constants";

const router = Router();
router.use(requireAuth, requireSuperAdmin);

const shape = (b: Awaited<ReturnType<typeof prisma.backup.findFirstOrThrow>>) => ({
  id: b.id,
  createdAt: b.createdAt,
  kind: b.kind,
  byName: b.byName,
  excelBytes: b.excelBytes,
  dataBytes: b.dataBytes,
  summary: b.summary,
  baseName: backupBaseName(b.createdAt),
});

router.get("/", async (_req, res) => {
  const rows = await prisma.backup.findMany({ orderBy: { createdAt: "desc" } });
  // รอบถัดไป: วันนี้ 17:00 ถ้ายังไม่ถึง ไม่งั้นพรุ่งนี้ 17:00
  const today = bangkokDay();
  const next = new Date(`${today}T${String(BACKUP_HOUR).padStart(2, "0")}:00:00+07:00`);
  if (pastBackupHour()) next.setTime(next.getTime() + 86_400_000);
  res.json({ keepDays: BACKUP_KEEP_DAYS, hour: BACKUP_HOUR, nextRunAt: next, rows: rows.map(shape) });
});

/** สำรองตอนนี้ — ใช้ก่อนนำเข้าไฟล์ใหญ่หรือก่อนแก้ข้อมูลจำนวนมาก */
router.post("/", async (req: AuthRequest, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { name: true } });
  try {
    const row = await runBackup({ kind: "MANUAL", userId: req.auth!.userId, userName: me?.name ?? undefined });
    res.status(201).json(shape(row));
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "สำรองข้อมูลไม่สำเร็จ" });
  }
});

/**
 * ไฟล์ของรอบอัตโนมัติวันนี้ — แอปของ Super Admin ถามทุก 5 นาทีหลัง 17:00 เพื่อโหลดลงเครื่องให้เอง
 * ถ้ายังไม่มี (เซิร์ฟเวอร์เพิ่งตื่น) ทำให้ตอนนี้เลย — คำถามนี้เองคือตัวปลุกที่เชื่อถือได้ที่สุดตอน 17:00
 */
router.get("/today", async (_req, res) => {
  if (!pastBackupHour()) return res.json({ backup: null });
  await ensureDailyBackup().catch((e) => console.error("[backup] รอบอัตโนมัติไม่สำเร็จ", e));
  const b = await prisma.backup.findUnique({ where: { dayKey: bangkokDay() } });
  res.json({ backup: b ? shape(b) : null });
});

router.get("/:id/link", async (req, res) => {
  const b = await prisma.backup.findUnique({ where: { id: Number(req.params.id) } });
  if (!b) return res.status(404).json({ error: "ไม่พบไฟล์สำรองนี้ (อาจเก่ากว่า 30 วันและถูกลบแล้ว)" });
  const excel = req.query.file !== "data";
  const fileName = `${backupBaseName(b.createdAt)}${excel ? ".xlsx" : ".json.gz"}`;
  const url = await getDownloadUrl(excel ? b.excelKey : b.dataKey, { fileName });
  res.json({ url, fileName, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
});

export default router;
