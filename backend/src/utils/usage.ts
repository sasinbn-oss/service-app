/**
 * จดว่าผู้ใช้ใช้แอปอยู่ช่วงไหน — แถวละ 5 นาทีต่อคน (หน้า "การใช้งานแอป" · Super Admin/แอดมิน · ต.ค. 69)
 *
 * เรียกจาก requireAuth ทุกคำขอ แต่เขียนฐานข้อมูลแค่ครั้งแรกของแต่ละช่วง (จำช่วงล่าสุดของแต่ละคนไว้ในหน่วยความจำ)
 * ไม่รอผล — การจดการใช้งานพังต้องไม่ทำให้คำขอจริงช้าหรือล้ม
 * เซิร์ฟเวอร์รีสตาร์ทแล้วลืมช่วงล่าสุด ก็แค่เขียนซ้ำหนึ่งครั้ง (skipDuplicates) ไม่เกิดแถวซ้ำ
 */
import { prisma } from "../prisma";

export const SLOT_MS = 5 * 60_000;
export const USAGE_KEEP_DAYS = 90;

const lastSlot = new Map<number, number>();
let lastPurge = 0;

/** มือถือ = เบราว์เซอร์มือถือ หรือแอปที่ติดตั้ง (okhttp ของ Android · CFNetwork/Darwin ของ iOS) */
export function deviceOf(userAgent: string | undefined): "WEB" | "MOBILE" {
  return /Mobi|Android|iPhone|iPad|okhttp|CFNetwork|Darwin|Expo/i.test(userAgent ?? "") ? "MOBILE" : "WEB";
}

export function recordUsage(userId: number, userAgent: string | undefined, now = Date.now()) {
  const slot = Math.floor(now / SLOT_MS) * SLOT_MS;
  if (lastSlot.get(userId) === slot) return;
  lastSlot.set(userId, slot);
  prisma.usageSlot
    .createMany({ data: [{ userId, slot: new Date(slot), device: deviceOf(userAgent) }], skipDuplicates: true })
    .catch(() => lastSlot.delete(userId));
  // ลบของเก่ากว่า 90 วัน วันละครั้ง — ไม่ต้องมีงานตั้งเวลาแยก
  if (now - lastPurge > 24 * 3600_000) {
    lastPurge = now;
    // ช่วงที่ประมาณจากการทำงาน (ACTION — migration usage_backfill) เก็บถาวร: ไม่กี่แถวต่อคนต่อวัน
    // และเป็นทางเดียวที่ดูย้อนหลังถึงวันเปิดบัญชีได้ (เจ้าของงานขอ ต.ค. 69)
    prisma.usageSlot
      .deleteMany({ where: { device: { not: "ACTION" }, slot: { lt: new Date(now - USAGE_KEEP_DAYS * 24 * 3600_000) } } })
      .catch(() => {});
  }
}
