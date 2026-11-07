/**
 * สมัคร/เลิกรับแจ้งเตือนเข้ามือถือ (Web Push) — ดู push/webPush.ts
 *
 * GET  /api/push/key          กุญแจสาธารณะให้เบราว์เซอร์ใช้สมัคร
 * POST /api/push/subscribe    { endpoint, keys: { p256dh, auth } } — เครื่องเดิมเปลี่ยนคนล็อกอิน แถวเดิมย้ายเป็นของคนใหม่
 * POST /api/push/unsubscribe  { endpoint } — ออกจากระบบ/ปิดแจ้งเตือน (ลบเฉพาะของตัวเอง)
 * ดูในฐานะคนอื่นสมัครไม่ได้ (requireAuth ปฏิเสธ POST อยู่แล้ว) — ไม่งั้นมือถือแอดมินได้แจ้งเตือนของช่างคนนั้นต่อไปเรื่อย ๆ
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../prisma";
import { vapidKeys } from "../push/webPush";

const router = Router();

router.get("/key", requireAuth, async (_req, res) => {
  res.json({ publicKey: (await vapidKeys()).publicKey });
});

const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(300) }),
});

router.post("/subscribe", requireAuth, async (req: AuthRequest, res) => {
  const parsed = subscribeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "ข้อมูลการสมัครแจ้งเตือนไม่ถูกต้อง — ลองปิดแล้วเปิดแจ้งเตือนใหม่" });
  const { endpoint, keys } = parsed.data;
  const userId = req.auth!.userId;
  // เครื่องแรกของคนนี้ (หรือเปิดใหม่หลังปิดไปนาน) = เริ่มนับงานเข้ากล่องจากตอนนี้ — ไม่งั้นรอบแรกส่งทุกใบที่ค้างตั้งแต่ครั้งก่อน
  const fresh = (await prisma.pushSubscription.count({ where: { userId, NOT: { endpoint } } })) === 0;
  await prisma.$transaction([
    prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId },
    }),
    ...(fresh ? [prisma.user.update({ where: { id: userId }, data: { pushSince: new Date() } })] : []),
  ]);
  res.json({ ok: true });
});

router.post("/unsubscribe", requireAuth, async (req: AuthRequest, res) => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
  if (!endpoint) return res.status(400).json({ error: "ไม่ได้ระบุเครื่องที่จะเลิกรับแจ้งเตือน" });
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.auth!.userId } });
  res.json({ ok: true });
});

export default router;
