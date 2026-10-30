import type { User } from "../types";
import { AREA_TEAM_LABELS } from "./areaTeam";

/**
 * ชื่อตำแหน่งที่ผู้ใช้เห็น — ตรงกับ ROLE_LABELS ฝั่งเซิร์ฟเวอร์ (backend/src/utils/constants.ts)
 * เดิมแต่ละหน้ามีตารางของตัวเอง พอเพิ่มตำแหน่งใหม่ต้องไล่แก้ทีละหน้า แล้วหน้าที่ลืมขึ้นรหัสดิบ ๆ อย่าง "SENIOR_TECH"
 */
export const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "ช่าง",
  SENIOR_TECH: "Senior ช่าง",
  SUPERVISOR: "หัวหน้าภาค",
  ADMIN: "แอดมิน",
  PARTS_ADMIN: "Admin Spare Part",
  SUPER_ADMIN: "Super Admin",
  ...AREA_TEAM_LABELS,
};

/**
 * ตำแหน่งที่เป็นช่าง (ตามที่เก็บในฐานข้อมูล) — ใช้กับรายชื่อคนอื่นที่เซิร์ฟเวอร์ส่ง role ดิบมา
 * (หน้าสิทธิ์ผู้ใช้ ดูในฐานะ ผังผู้ดูแล) ไม่ใช่กับคนที่ล็อกอินอยู่ ซึ่ง AuthContext แปลง Senior เป็น EMPLOYEE ให้แล้ว
 */
export function isTechRole(role: string | null | undefined) {
  return role === "EMPLOYEE" || role === "SENIOR_TECH";
}

/**
 * ป้ายตำแหน่งของคนที่ล็อกอินอยู่ — role ในแอปถูกแปลงแล้ว (Super Admin/Admin Spare Part เป็น ADMIN, Senior ช่างเป็น EMPLOYEE)
 * ชื่อจริงจึงต้องดูจากธง ไม่ใช่ role
 */
export function sessionRoleLabel(u: Pick<User, "role" | "superAdmin" | "partsAdmin" | "seniorTech">) {
  if (u.superAdmin) return ROLE_LABELS.SUPER_ADMIN;
  if (u.partsAdmin) return ROLE_LABELS.PARTS_ADMIN;
  if (u.seniorTech) return ROLE_LABELS.SENIOR_TECH;
  return ROLE_LABELS[u.role] ?? u.role;
}
