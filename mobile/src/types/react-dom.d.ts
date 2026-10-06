// react-dom มากับ Expo สำหรับเว็บอยู่แล้ว แต่ไม่มี type ติดมา — ใช้แค่ createPortal
// ใน Overlay.web.tsx จึงประกาศเฉพาะตัวนั้น แทนการเพิ่ม @types/react-dom ทั้งแพ็กเกจ
declare module "react-dom" {
  import type { ReactNode, ReactPortal } from "react";
  export function createPortal(children: ReactNode, container: Element): ReactPortal;
}
