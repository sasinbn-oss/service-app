/**
 * จำรูปอะไหล่ไว้ในหน่วยความจำของเซิร์ฟเวอร์
 *
 * รูปอะไหล่เก็บเป็นไบต์ในฐานข้อมูล (SparePartImage.data) — ทุกครั้งที่เสิร์ฟรูปคือดึงไฟล์ทั้งก้อนข้าม region
 * และถือสายฐานข้อมูลไว้ตลอดเวลาที่ดึง หน้ารายการอะไหล่หนึ่งหน้าขอรูปเป็นร้อย
 * 7 พ.ย. 69 หลังแก้ล่มรอบสอง /health/status เห็น GET /api/spare-parts/:id/image 627 ครั้งใน 4 นาที เฉลี่ยครั้งละ 16 วิ
 * — มากกว่าคำขออื่นทั้งหมดรวมกัน
 *
 * จำตาม id + v (เวลาแก้ล่าสุดที่แอปต่อท้ายลิงก์ — partImageUri) รูปเปลี่ยนแล้ว v เปลี่ยน ไม่มีทางได้รูปเก่า
 * ลิงก์ที่ไม่มี v จำแค่ 10 นาที · รวมไม่เกิน 48 MB (เครื่อง Render มี RAM 512 MB) ทิ้งรูปที่ไม่ได้ใช้นานสุดก่อน
 * หลายคนขอรูปเดียวกันพร้อมกัน = ดึงจากฐานข้อมูลครั้งเดียว
 */
import { createHash } from "crypto";
import { prisma } from "../prisma";

const MAX_BYTES = 48 * 1024 * 1024;
const NO_VERSION_TTL_MS = 10 * 60_000;

export interface CachedImage {
  mime: string;
  data: Buffer;
  etag: string;
}

const cache = new Map<string, { at: number; img: CachedImage }>();
const loading = new Map<string, Promise<CachedImage | null>>();
let bytes = 0;

function drop(key: string) {
  const e = cache.get(key);
  if (!e) return;
  bytes -= e.img.data.length;
  cache.delete(key);
}

/** อัปโหลดรูปใหม่/นำเข้า/ลบอะไหล่ — ลิงก์ที่ไม่มี v ต้องได้รูปใหม่ทันที (ลิงก์ที่มี v เปลี่ยนเองอยู่แล้ว) */
export function forgetPartImage(id: number) {
  for (const key of [...cache.keys()]) if (key.startsWith(`${id}|`)) drop(key);
}

export function partImage(id: number, v: string): Promise<CachedImage | null> {
  const key = `${id}|${v}`;
  const hit = cache.get(key);
  if (hit && (v || Date.now() - hit.at < NO_VERSION_TTL_MS)) {
    // ใช้ล่าสุดไว้ท้าย Map — ตอนเกินโควตาจะทิ้งจากหัว (ไม่ได้ใช้นานสุด)
    cache.delete(key);
    cache.set(key, hit);
    return Promise.resolve(hit.img);
  }
  if (hit) drop(key);
  const pending = loading.get(key);
  if (pending) return pending;
  const p = prisma.sparePartImage
    .findUnique({ where: { sparePartId: id }, select: { mimeType: true, data: true } })
    .then((row) => {
      if (!row) return null;
      const data = Buffer.from(row.data);
      const img = { mime: row.mimeType, data, etag: `"${createHash("sha1").update(data).digest("base64url").slice(0, 20)}"` };
      if (data.length <= MAX_BYTES / 8) {
        cache.set(key, { at: Date.now(), img });
        bytes += data.length;
        for (const k of cache.keys()) {
          if (bytes <= MAX_BYTES) break;
          drop(k);
        }
      }
      return img;
    })
    .finally(() => loading.delete(key));
  loading.set(key, p);
  return p;
}

export function imageCacheStats() {
  return { images: cache.size, mb: Math.round((bytes / 1024 / 1024) * 10) / 10 };
}
