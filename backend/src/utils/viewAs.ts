import { AREA_TEAM_ROLES, TECH_ROLES } from "./constants";

/**
 * ใครดูในฐานะใครได้ — Super Admin ดูได้ทุกคน (ยกเว้น Super Admin) · แอดมินดูได้เฉพาะหัวหน้าภาค ช่าง (รวม Senior ช่าง) และทีม Area
 * (เจ้าของงานเพิ่ม ต.ค. 69 — แอดมินต้องเห็นว่าหัวหน้าภาค/ช่างเห็นอะไร เวลาโทรมาถามว่าทำไมไม่มีปุ่ม
 *  ทีม Area · Supervisor (COCO) · Maid (COCO) ก็โทรมาถามแบบเดียวกัน และเห็นน้อยกว่าแอดมินอยู่แล้ว)
 * แอดมินดูแอดมินด้วยกัน/Admin Spare Part ไม่ได้ — ไม่มีอะไรที่แอดมินไม่เห็นอยู่แล้ว และกันการยืมสิทธิ์ข้ามกัน
 */
export function canViewAs(viewerRole: string | null | undefined, targetRole: string | null | undefined) {
  if (!targetRole || targetRole === "SUPER_ADMIN") return false;
  if (viewerRole === "SUPER_ADMIN") return true;
  // บทบาทดิบจากฐานข้อมูล (ก่อน requireAuth แปลง) — Senior ช่างต้องอยู่ในรายการเอง ไม่งั้นแอดมินดูในฐานะ Senior ไม่ได้
  if (viewerRole === "ADMIN") return targetRole === "SUPERVISOR" || TECH_ROLES.includes(targetRole) || AREA_TEAM_ROLES.includes(targetRole);
  return false;
}
