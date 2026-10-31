/**
 * กล่องงานตรวจเคลม (เคลมก้อน 6) — ใครตรวจได้ และตัวเลข "{x} ใบ · {y} ชิ้น" ที่ขึ้นหลายที่พร้อมกัน
 *
 * ตัวเลขชุดเดียวกันขึ้นสามที่: ป้ายเมนู "ตรวจเคลม" · การ์ดในงานของฉันวันนี้ · หัวกล่องงานตรวจเคลม
 * ทั้งหมดถาม GET /part-claims/queue-count (นับจากแถวชุดเดียวกับกล่องงาน รวมใบทดสอบเพราะกล่องงานโชว์ใบทดสอบด้วย)
 * ถ้าแต่ละที่นับเอง ตัวเลขข้างกันจะไม่ตรงกัน แล้วผู้ตรวจไม่รู้ว่าเชื่ออันไหน
 * ตัดสินเสร็จในหน้ากล่องงานไม่มีการเปลี่ยนหน้า — จึงมีสัญญาณ refreshClaimQueueCount() ให้ป้ายเมนูโหลดใหม่ทันที
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { navigationRef } from "../navigation/navigationRef";

type Reviewer = { partsAdmin?: boolean; superAdmin?: boolean } | null | undefined;

/** ตรวจเคลมได้เฉพาะ Admin Spare Part (Super Admin ทำแทนได้) — ตรงกับ canReviewClaims ฝั่งเซิร์ฟเวอร์ */
export function canReviewClaims(u: Reviewer): boolean {
  return !!u && (!!u.partsAdmin || !!u.superAdmin);
}

/**
 * ตัดสินเคลมได้จริงไหม — ผู้ตรวจที่ไม่ได้กำลังดูในฐานะคนอื่น
 * Super Admin ดูในฐานะ Admin Spare Part ได้ (เห็นกล่องงานและหน้าตรวจเหมือนเขา) แต่เซิร์ฟเวอร์ไม่รับคำสั่งตอนดูในฐานะ
 * จึงไม่ขึ้นปุ่มตัดสินให้กดแล้วล้ม — กติกาเดียวทั้งแถบตัดสิน กล่องงาน และข้อความในการ์ดขั้นปัจจุบัน
 */
export function canDecideClaims(u: (NonNullable<Reviewer> & { viewAs?: unknown }) | null | undefined): boolean {
  return canReviewClaims(u) && !u?.viewAs;
}

export interface ClaimQueueCount {
  orders: number;
  parts: number;
}

const listeners = new Set<() => void>();

/** ตัดสินเสร็จแล้ว (ไม่ได้เปลี่ยนหน้า) — บอกทุกที่ที่โชว์ตัวเลขกล่องงานให้โหลดใหม่ */
export function refreshClaimQueueCount() {
  listeners.forEach((l) => l());
}

/**
 * ตัวเลขกล่องงานตรวจเคลม — ถามเฉพาะผู้ตรวจ (คนอื่นได้ 403 ทุกหน้า ไม่ต้องยิง)
 * ไม่โหลดเองตอนสร้าง — คนเรียกเลือกจังหวะเอง: เมนูข้างโหลดตอนเปลี่ยนหน้า (แบบตัวเลขกล่องงาน) · การ์ดโหลดตอนหน้าถูกเปิด
 */
export function useClaimQueueCount(u: Reviewer): [ClaimQueueCount | null, () => void] {
  const allowed = canReviewClaims(u);
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  const [count, setCount] = useState<ClaimQueueCount | null>(null);
  const reload = useCallback(() => {
    if (!allowedRef.current) {
      setCount(null);
      return;
    }
    api
      .get<ClaimQueueCount>("/part-claims/queue-count", { loadingText: false })
      .then((r) => setCount({ orders: Number(r.data.orders) || 0, parts: Number(r.data.parts) || 0 }))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    listeners.add(reload);
    return () => {
      listeners.delete(reload);
    };
  }, [reload]);
  // สลับดูในฐานะคนอื่นแล้วตำแหน่งเปลี่ยน — ตัวเลขต้องเปลี่ยนตาม (หรือหายไปถ้าไม่ใช่ผู้ตรวจแล้ว)
  useEffect(() => {
    if (!allowed) reload();
  }, [allowed, reload]);
  return [count, reload];
}

/**
 * เปิดกล่องงานตรวจเคลมจากที่ไหนก็ได้ — หน้านี้อยู่ในชุดหน้าของแท็บหน้าแรก จึงสั่งผ่านแท็บเสมอ
 * initial: false ให้ปุ่มย้อนกลับพากลับหน้าแรกของแท็บ ไม่ใช่หลุดออกจากแท็บ (แบบเดียวกับ openClaimHistory)
 */
export function openClaimReview() {
  if (!navigationRef.isReady()) return;
  (navigationRef.navigate as (tab: string, p: object) => void)("HomeTab", { screen: "ClaimReview", initial: false });
}
