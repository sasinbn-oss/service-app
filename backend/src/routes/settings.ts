/**
 * ค่าตั้งค่าที่แอดมินเปลี่ยนเองได้ — ตอนนี้มีอย่างเดียวคือ "เวลาปิดรับปล่อยงาน" (เจ้าของงานขอ ต.ค. 69 · ข้อ ข · ข้อ 13)
 *
 * อ่าน: ทุกคนที่เกี่ยว (แอดมิน · Admin Spare Part · หัวหน้าภาค · ช่าง) — แอปใช้เวลานี้นับถอยหลังและขึ้นข้อความเตือน
 * ทีม Area ไม่ได้อยู่ในรายการอนุญาต (utils/areaScope.ts) จึงได้ 403 จากด่านเดียวกับเมนูอื่น
 * เปลี่ยน: แอดมินทุกคนรวม Super Admin · Admin Spare Part และดูในฐานะถูกกันที่ requireAuth แล้ว (ดูได้อย่างเดียว)
 */
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { AuthRequest, requireAuth } from "../middleware/auth";
import { TokenPayload } from "../utils/jwt";
import { CUTOFF_CHOICES, CUTOFF_DEFAULT, CUTOFF_KEY, CutoffConfig, forgetCutoff, readCutoff } from "../utils/dispatchCutoff";

const router = Router();

/**
 * serverNow ส่งไปด้วย — การ์ดตั้งค่าต้องรู้ว่า "ตอนนี้" ตามเวลาเซิร์ฟเวอร์เลยเวลาใหม่ไปแล้วหรือยัง
 * (เปลี่ยนเป็นเวลาที่เลยมาแล้ว = ใบพรุ่งนี้ที่ยังไม่ปล่อยล็อกทันที ต้องถามก่อน) นาฬิกามือถือเชื่อไม่ได้ (ข้อ 12)
 */
function cutoffPayload(cfg: CutoffConfig, auth: TokenPayload) {
  return {
    time: cfg.time,
    choices: [...CUTOFF_CHOICES],
    since: cfg.since.toISOString(),
    changedAt: cfg.changedAt?.toISOString() ?? null,
    changedByName: cfg.changedByName,
    previous: cfg.previous,
    canEdit: auth.role === "ADMIN" && !auth.partsAdmin && !auth.viewAs,
    serverNow: new Date().toISOString(),
  };
}

/** อ่านสดทุกครั้ง และเติมค่าที่จำไว้ให้ส่วนอื่นด้วย — เทสต์เปลี่ยนเวลาทาง SQL แล้วเรียกเส้นนี้ให้เซิร์ฟเวอร์เห็นทันที */
router.get("/dispatch-cutoff", requireAuth, async (req: AuthRequest, res) => {
  const cfg = await readCutoff({ fresh: true });
  res.json(cutoffPayload(cfg, req.auth!));
});

const putSchema = z.object({ time: z.string().trim() });

router.put("/dispatch-cutoff", requireAuth, async (req: AuthRequest, res) => {
  if (req.auth!.role !== "ADMIN") return res.status(403).json({ error: "ตั้งเวลาปิดรับปล่อยงานได้เฉพาะแอดมิน" });
  const parsed = putSchema.safeParse(req.body);
  const time = parsed.success ? parsed.data.time : "";
  if (!(CUTOFF_CHOICES as readonly string[]).includes(time)) {
    return res.status(400).json({ error: "เลือกได้ 15:00–17:00 ทีละครึ่งชั่วโมง" });
  }
  /**
   * เพิ่มแถวใหม่เสมอ ไม่แก้แถวเดิม — แถวต่อกันคือประวัติ "ใครเปลี่ยนจากอะไรเป็นอะไร" ที่เจ้าของงานขอ (ข้อ 13)
   * เทียบค่าเดิมกับใส่แถวในคำสั่งเดียว ไม่อ่านแล้วค่อยเขียน — กดซ้ำหรือแอดมินอีกคนกดค่าเดียวกันตามมา ประวัติไม่ขึ้น
   * "16:30 → 16:30" (สองคำขอที่ถึงในเสี้ยววินาทีเดียวกันยังได้สองแถวได้ — ผลแค่ประวัติซ้ำ เวลาที่ใช้ไม่ผิด)
   * ยังไม่มีแถวเลย = ค่าตอนนี้คือ 16:00 (แบบเดียวกับ readCutoff)
   */
  const added = await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "AppSetting" ("key", "value", "createdById")
    SELECT ${CUTOFF_KEY}::text, ${time}::text, ${req.auth!.userId}::int
    WHERE ${time}::text IS DISTINCT FROM COALESCE(
      (SELECT "value" FROM "AppSetting" WHERE "key" = ${CUTOFF_KEY}::text ORDER BY "id" DESC LIMIT 1),
      ${CUTOFF_DEFAULT}::text
    )`);
  if (!added) return res.status(400).json({ error: "เป็นเวลานี้อยู่แล้ว" });
  forgetCutoff();
  const cfg = await readCutoff({ fresh: true });
  res.json(cutoffPayload(cfg, req.auth!));
});

export default router;
