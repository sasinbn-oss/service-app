import type { User } from "../types";

/**
 * Area Team (Area · Supervisor (COCO)) — ทีมฝั่งสาขา COCO แจ้งและเปิดใบงาน ดูความคืบหน้าได้ (เจ้าของงานเพิ่ม ต.ค. 69)
 * เห็นแค่ 6 เมนู ไม่ได้ทำขั้นตอนของใคร · ขอบเขตสาขาคุมที่เซิร์ฟเวอร์ (backend/src/utils/areaScope.ts)
 * ที่นี่ใช้แค่ซ่อนปุ่ม/เมนูที่กดไปก็ได้ 403
 */
export function isAreaTeam(user: Pick<User, "role"> | null | undefined): boolean {
  return user?.role === "AREA" || user?.role === "COCO_SUPERVISOR";
}

export const AREA_TEAM_LABELS: Record<string, string> = {
  AREA: "Area",
  COCO_SUPERVISOR: "Supervisor (COCO)",
};
