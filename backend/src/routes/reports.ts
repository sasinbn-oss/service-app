/**
 * รายงานรวมที่ไม่ได้เป็นของหมวดใดหมวดหนึ่ง — ตอนนี้มีรายงานทั้งระบบ (src/reports/systemReport.ts)
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { documentPath, saveDocument } from "../documents/store";
import { buildSystemReport } from "../reports/systemReport";
import { bkkDayStart } from "../reports/openerReport";

const router = Router();

/**
 * GET /api/reports/system?from=YYYY-MM-DD&to=YYYY-MM-DD — แอดมินเท่านั้น (ไฟล์นี้คือข้อมูลทั้งบริษัท)
 * ไม่ส่งช่วงวันที่ = ใบงานทั้งหมดตั้งแต่เริ่มใช้ระบบ · ช่วงวันที่มีผลกับชีตใบงานและตัวเลขใบงานในภาพรวมเท่านั้น
 * ชีตอื่น (คน สาขา เครื่อง) เป็นสภาพ ณ ตอนนี้เสมอ
 */
const query = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่เริ่มไม่ถูกต้อง").optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่สิ้นสุดไม่ถูกต้อง").optional(),
  })
  .refine((q) => !q.from === !q.to, { message: "เลือกวันที่ให้ครบทั้งเริ่มและสิ้นสุด หรือไม่เลือกเลย" })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด" })
  .refine((q) => !q.from || !q.to || bkkDayStart(q.to) >= bkkDayStart(q.from), { message: "ช่วงวันที่ไม่ถูกต้อง" });

router.get("/system", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const parsed = query.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const started = Date.now();
  const data = await buildSystemReport(parsed.data);
  const stamp = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const stored = saveDocument({
    filename: `รายงานทั้งระบบ-${stamp}.xlsx`,
    asciiFilename: `system-report-${stamp}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data,
    ownerId: req.auth!.userId,
  });
  // เก็บไว้ดูใน log ของ Render — ไฟล์โตขึ้นตามข้อมูล ถ้าวันหนึ่งช้า/ใหญ่ผิดปกติจะเห็นก่อนเซิร์ฟเวอร์ล่ม
  console.log(`[system-report] user=${req.auth!.userId} bytes=${data.length} ms=${Date.now() - started}`);
  res.json({ filename: stored.filename, path: documentPath(stored), bytes: data.length });
});

export default router;
