import React from "react";

/** บนมือถือแจ้งผลใช้ Alert ของเครื่อง ชั้นนี้จึงวาดตามปกติ ดู Overlay.web.tsx */
/** z / attr ใช้เฉพาะบนเว็บ (ชั้นของกล่องสอนการใช้งาน) — มือถือวาดตามปกติ */
export default function Overlay({ children }: { children: React.ReactNode; z?: number; attr?: string }) {
  return <>{children}</>;
}
