import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * วาดชั้นแจ้งผล/ยืนยันลงใน <body> โดยตรง
 *
 * Modal ของ react-native-web ก็ portal ไปที่ body เหมือนกัน ถ้าวาดชั้นนี้ไว้ใน
 * ต้นไม้ของแอปตามปกติ กล่องยืนยันที่เปิดจากใน Modal จะไปอยู่ใต้ Modal นั้น
 * มองไม่เห็นและกดไม่ได้ — หน้ารายละเอียดใบงานกับหน้าจัดการผู้ใช้เปิด Modal อยู่
 * ตลอดเวลาที่กรอกฟอร์ม
 */
/**
 * z / attr: กล่องสอนการใช้งานใช้ชั้นของตัวเอง (data-otteri-howto) ต่ำกว่าชั้นแจ้งผล/ยืนยันนี้หนึ่งขั้น
 * อยู่เหนือหน้าต่างใบงานและ Modal ทุกบาน (9999) แต่กล่องยืนยันของแอปต้องอยู่บนกล่องสอนเสมอ (เจ้าของงานกำหนด)
 */
export default function Overlay({
  children,
  z = 2147483000,
  attr = "data-otteri-overlay",
}: {
  children: React.ReactNode;
  z?: number;
  attr?: string;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.createElement("div");
    el.setAttribute(attr, "");
    el.style.cssText = `position:fixed;inset:0;z-index:${z};pointer-events:none;display:flex`;
    document.body.appendChild(el);
    setHost(el);
    return () => {
      el.remove();
    };
  }, [z, attr]);
  // ย้ายไปท้าย body ทุกครั้งที่มีอะไรให้แสดง ให้อยู่เหนือ Modal ที่เพิ่งเปิดทีหลัง
  if (host && host !== document.body.lastElementChild) document.body.appendChild(host);
  return host ? createPortal(children, host) : null;
}
