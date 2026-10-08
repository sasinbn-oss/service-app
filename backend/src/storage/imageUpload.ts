/**
 * รับรูปหนึ่งรูป (+ รูปย่อ) จากแอป แล้วเก็บขึ้นที่เก็บไฟล์
 *
 * ใช้กับรูปของงานรถ (รูปรอบคัน เอกสารรถ ใบเสร็จซ่อม) ซึ่งเป็นรูปอย่างเดียว
 * ไม่มีวิดีโอ — แยกจากไฟล์แนบใบงานที่ต้องรับวิดีโอ 50 MB เพดานจึงต่ำกว่า
 * และไม่ต้องไปแตะโค้ดไฟล์แนบใบงานที่มีกติกาของตัวเองอยู่แล้ว
 *
 * ถังเดียวกับรูปหน้างาน ไม่เปิดสาธารณะ ดูได้ผ่านลิงก์ชั่วคราวเท่านั้น
 */
import { Response } from "express";
import multer from "multer";
import { AuthRequest } from "../middleware/auth";
import { MAX_ATTACHMENT_IMAGE_BYTES, MAX_ATTACHMENT_THUMBNAIL_BYTES } from "../utils/constants";
import { isFileStoreConfigured, safeName, uploadObject } from "./fileStore";

const fields = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_IMAGE_BYTES, files: 2 },
}).fields([
  { name: "file", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
]);

/** middleware — แปลง error ของ multer เป็นข้อความไทยแทนหน้า 500 */
export function imageUpload(req: AuthRequest, res: Response, next: (err?: unknown) => void) {
  fields(req as any, res, (error: any) => {
    if (!error) return next();
    if (error?.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: `รูปใหญ่เกิน ${Math.round(MAX_ATTACHMENT_IMAGE_BYTES / 1024 / 1024)} MB` });
    }
    console.error("image upload failed", error);
    return res.status(400).json({ error: "รับรูปไม่สำเร็จ" });
  });
}

/**
 * เก็บรูปที่ส่งมาขึ้นถัง — คืน null แล้วตอบ error ให้เองเมื่อเก็บไม่ได้
 *
 * folder เช่น "vehicles/2026-10" — แยกจาก work-orders/ ในถังเดียวกัน
 * เวลาต้องล้างรูปเก่าตามนโยบายจะลบทีละโฟลเดอร์ได้โดยไม่ไปโดนรูปหน้างาน
 */
export async function storeImage(
  req: AuthRequest,
  res: Response,
  folder: string
): Promise<{ objectKey: string; thumbnail: Buffer | null } | null> {
  if (!isFileStoreConfigured()) {
    res.status(503).json({ error: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ ให้แจ้งผู้ดูแลระบบก่อนใช้งานส่วนนี้" });
    return null;
  }
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const file = files?.file?.[0];
  if (!file) {
    res.status(400).json({ error: "ไม่พบรูปที่ส่งมา" });
    return null;
  }
  if (!/^image\//.test(file.mimetype)) {
    res.status(400).json({ error: "รับเฉพาะไฟล์รูปภาพ" });
    return null;
  }
  const thumb = files?.thumbnail?.[0];
  // รูปย่อใหญ่ผิดปกติ = แอปส่งรูปเต็มมาผิดช่อง ไม่เก็บลงฐานข้อมูล
  const thumbnail =
    thumb && thumb.size > 0 && thumb.size <= MAX_ATTACHMENT_THUMBNAIL_BYTES ? thumb.buffer : null;
  const objectKey = `${folder}/${Date.now()}-${req.auth!.userId}-${safeName(file.originalname || "photo.jpg")}`;
  try {
    await uploadObject({ key: objectKey, body: file.buffer, contentType: file.mimetype });
  } catch (error) {
    console.error("image store failed", error);
    res.status(502).json({ error: "อัปรูปขึ้นที่เก็บไม่สำเร็จ ลองใหม่อีกครั้ง" });
    return null;
  }
  return { objectKey, thumbnail };
}

export function thumbnailUrl(thumb: Uint8Array | Buffer | null | undefined): string | null {
  return thumb ? `data:image/jpeg;base64,${Buffer.from(thumb).toString("base64")}` : null;
}
