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
export default function Overlay({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.createElement("div");
    el.setAttribute("data-otteri-overlay", "");
    el.style.cssText = "position:fixed;inset:0;z-index:2147483000;pointer-events:none;display:flex";
    document.body.appendChild(el);
    setHost(el);
    return () => {
      el.remove();
    };
  }, []);
  // ย้ายไปท้าย body ทุกครั้งที่มีอะไรให้แสดง ให้อยู่เหนือ Modal ที่เพิ่งเปิดทีหลัง
  if (host && host !== document.body.lastElementChild) document.body.appendChild(host);
  return host ? createPortal(children, host) : null;
}
