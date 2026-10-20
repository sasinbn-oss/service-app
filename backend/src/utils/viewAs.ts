/**
 * ใครดูในฐานะใครได้ — Super Admin ดูได้ทุกคน (ยกเว้น Super Admin) · แอดมินดูได้เฉพาะหัวหน้าภาคกับช่าง
 * (เจ้าของงานเพิ่ม ต.ค. 69 — แอดมินต้องเห็นว่าหัวหน้าภาค/ช่างเห็นอะไร เวลาโทรมาถามว่าทำไมไม่มีปุ่ม)
 * แอดมินดูแอดมินด้วยกัน/Admin Spare Part ไม่ได้ — ไม่มีอะไรที่แอดมินไม่เห็นอยู่แล้ว และกันการยืมสิทธิ์ข้ามกัน
 */
export function canViewAs(viewerRole: string | null | undefined, targetRole: string | null | undefined) {
  if (!targetRole || targetRole === "SUPER_ADMIN") return false;
  if (viewerRole === "SUPER_ADMIN") return true;
  if (viewerRole === "ADMIN") return targetRole === "SUPERVISOR" || targetRole === "EMPLOYEE";
  return false;
}
