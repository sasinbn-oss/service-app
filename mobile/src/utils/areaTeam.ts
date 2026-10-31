import type { User } from "../types";

/**
 * Area Team (Area · Supervisor (COCO) · Maid (COCO)) — ทีมฝั่งสาขา COCO แจ้งและเปิดใบงาน ดูความคืบหน้าได้ (เจ้าของงานเพิ่ม ต.ค. 69)
 * ไม่ได้ทำขั้นตอนของใคร · ขอบเขตสาขาคุมที่เซิร์ฟเวอร์ (backend/src/utils/areaScope.ts)
 * ที่นี่ใช้แค่ซ่อนปุ่ม/เมนูที่กดไปก็ได้ 403
 */
export function isAreaTeam(user: Pick<User, "role"> | null | undefined): boolean {
  return user?.role === "AREA" || user?.role === "COCO_SUPERVISOR" || user?.role === "COCO_MAID";
}

export const AREA_TEAM_LABELS: Record<string, string> = {
  AREA: "Area",
  COCO_SUPERVISOR: "Supervisor (COCO)",
  COCO_MAID: "Maid (COCO)",
};

/**
 * หน้าที่ในทีม Area เหลือให้ Area คนเดียว — ติดตามเครื่องเสีย · รายงาน · ผังผู้รับผิดชอบ
 *
 * เจ้าของงานขอ ต.ค. 69: ทีม Area ลองใช้แล้วเห็นว่าสามเมนูนี้ไม่จำเป็นกับ Supervisor (COCO) และ Maid (COCO)
 * ("ซุปกับแม่บ้าน") — สองตำแหน่งนั้นแจ้ง/เปิดใบงานของร้านตัวเองแล้วตามดูในใบงานซ่อม
 * ภาพรวมเครื่องเสีย รายงาน และผังคนดูแลเป็นงานของ Area
 *
 * เก็บเป็นชื่อหน้าใน navigator ที่เดียว — เมนูข้าง การ์ดหน้าหลัก และประตูหน้าจอ (components/AreaOnlyGate)
 * อ่านจากชุดนี้ จะได้ไม่มีที่ไหนลืมซ่อน · เซิร์ฟเวอร์กันซ้ำที่ AREA_ONLY_ALLOWED (backend/src/utils/areaScope.ts)
 */
export const AREA_ONLY_SCREENS: ReadonlySet<string> = new Set(["MachineDashboard", "ReportsMenu", "CoverageMap"]);

/** Supervisor (COCO) · Maid (COCO) — คนในทีม Area ที่ไม่ใช่ Area */
export function isCocoStaff(user: Pick<User, "role"> | null | undefined): boolean {
  return user?.role === "COCO_SUPERVISOR" || user?.role === "COCO_MAID";
}

/**
 * คนนี้เปิดหน้านี้ได้ไหม — ตอบ false เฉพาะ Supervisor (COCO) / Maid (COCO) กับหน้าใน AREA_ONLY_SCREENS
 * ตำแหน่งอื่นใช้กฎเดิมของแต่ละหน้า (ดูในฐานะใช้ตำแหน่งของคนที่ถูกดู จึงเห็นเท่าเจ้าตัว)
 */
export function canOpenScreen(user: Pick<User, "role"> | null | undefined, screen: string): boolean {
  return !(isCocoStaff(user) && AREA_ONLY_SCREENS.has(screen));
}
