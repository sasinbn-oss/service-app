/**
 * กล่องลอยใต้ช่อง (รายการตัวเลือก ปฏิทิน เวลา) — บนเว็บวาดลงใน <body> ทับทุกอย่าง
 *
 * เดิมรายการกางแทรกลงไปในฟอร์ม ดันช่องข้างล่างลง หน้าต่างยืดจนช่องที่กำลังกรอกหลุดจอ
 * ลอยทับแทน หน้าต่างจึงขนาดเท่าเดิม และไม่ถูกตัดขอบโดยหน้าต่างที่มันอยู่ข้างใน
 *
 * ไม่ใช้ Modal ซ้อน (ใช้ไม่ได้บน react-native-web ดู Dropdown) — portal ตรงลง body แบบ Overlay
 * ตำแหน่งคำนวณจากช่องจริงทุกครั้งที่เลื่อน/ย่อจอ ที่ข้างล่างไม่พอก็กางขึ้นข้างบน
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { View } from "react-native";
import { colors, radius } from "../theme";

export interface PopoverProps {
  anchor: React.RefObject<View | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** ไม่ใส่ = กว้างเท่าช่อง (แต่ไม่แคบกว่า minWidth) */
  width?: number;
  minWidth?: number;
  maxHeight?: number;
}

interface Place {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

// ต่ำกว่ากล่องแจ้งผล/ยืนยัน (Overlay 2147483000) — กล่องยืนยันที่เปิดตอนเลือกต้องอยู่บนกล่องนี้
const Z = 2147482000;

export default function Popover({ anchor, open, onClose, children, width, minWidth = 240, maxHeight = 330 }: PopoverProps) {
  const box = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  // ผู้เรียกส่ง onClose เป็นฟังก์ชันใหม่ทุกครั้งที่วาด — ถ้าผูกตรง ๆ measure เปลี่ยนทุกรอบ
  // แล้ว useLayoutEffect วัดใหม่ → setPlace → วาดใหม่ วนไม่จบ
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = useCallback(() => closeRef.current(), []);

  const measure = useCallback(() => {
    const el = anchor.current as unknown as HTMLElement | null;
    if (!el?.getBoundingClientRect) return;
    const r = el.getBoundingClientRect();
    // ช่องเลื่อนพ้นจอไปแล้ว (เลื่อนเนื้อหาในหน้าต่าง) — ปิด ไม่ปล่อยกล่องลอยค้างกลางจอ
    if (r.bottom < 0 || r.top > window.innerHeight) return close();
    const w = Math.min(width ?? Math.max(r.width, minWidth), window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < Math.min(maxHeight, 240) && above > below;
    setPlace({
      left,
      width: w,
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      maxHeight: Math.max(140, Math.min(maxHeight, up ? above : below)),
    });
  }, [anchor, width, minWidth, maxHeight, close]);

  useLayoutEffect(() => {
    if (open) measure();
    else setPlace(null);
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      const t = e.target as Node;
      const a = anchor.current as unknown as HTMLElement | null;
      if (box.current?.contains(t) || a?.contains(t)) return;
      close();
    };
    // Esc ปิดกล่องนี้อย่างเดียว — Modal ของ react-native-web ปิดตัวเองตอน keyup Escape ที่ bubble
    // ถึง document ดักไว้ตอน capture แล้วหยุดต่อ ไม่งั้นกด Esc ทีเดียวหน้าต่างทั้งบานปิดตาม
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (e.type === "keyup") close();
    };
    // capture — หน้าต่าง/ScrollView ของ RN หยุด event ก่อนถึง document ได้
    document.addEventListener("mousedown", outside, true);
    document.addEventListener("touchstart", outside, true);
    document.addEventListener("keydown", key, true);
    document.addEventListener("keyup", key, true);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      document.removeEventListener("mousedown", outside, true);
      document.removeEventListener("touchstart", outside, true);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("keyup", key, true);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure, close, anchor]);

  if (!open || !place) return null;
  return createPortal(
    <div
      ref={box}
      style={{
        position: "fixed",
        zIndex: Z,
        left: place.left,
        width: place.width,
        top: place.top,
        bottom: place.bottom,
        maxHeight: place.maxHeight,
        display: "flex",
        flexDirection: "column",
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        boxShadow: "0 18px 44px rgba(11,59,96,0.18)",
        overflow: "hidden",
      }}
    >
      {children}
    </div>,
    document.body
  );
}
