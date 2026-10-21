import { createNavigationContainerRef } from "@react-navigation/native";
import { MainTabParamList } from "./types";

/**
 * ตัวจับการนำทางของทั้งแอป
 *
 * เมนูข้างอยู่นอกต้นไม้ของ navigator (ลอยทับทุกแท็บ) จึงเรียก useNavigation
 * ไม่ได้ — ต้องสั่งผ่านตัวนี้แทน และใช้ฟังสถานะเพื่อไฮไลต์หน้าที่เปิดอยู่
 */
export const navigationRef = createNavigationContainerRef<MainTabParamList>();

/**
 * จำหน้าที่เปิดอยู่ข้ามการโหลดหน้าใหม่ที่แอปสั่งเอง (สลับโหมดมืด) — เดิมโหลดแล้วเด้งกลับหน้าแรกทุกครั้ง
 * (เจ้าของงานแจ้ง ต.ค. 69) · ใช้ครั้งเดียวแล้วลบ และคืนให้เฉพาะผู้ใช้คนเดิม (สลับดูในฐานะคนอื่นแล้วหน้าเดิมอาจไม่มีสิทธิ์)
 * เก็บใน sessionStorage ไม่ใช่ localStorage — ปิดแท็บแล้วเปิดใหม่ควรเริ่มที่หน้าแรกตามปกติ
 */
const RESTORE_KEY = "otteri-nav-restore";

export function rememberScreenForReload(userId: number | undefined) {
  try {
    if (!navigationRef.isReady() || userId == null) return;
    sessionStorage.setItem(RESTORE_KEY, JSON.stringify({ userId, state: navigationRef.getRootState() }));
  } catch {
    // ที่เก็บของเบราว์เซอร์ถูกปิด — โหลดแล้วไปหน้าแรกแบบเดิม
  }
}

export function takeScreenAfterReload(userId: number | undefined): object | undefined {
  try {
    const raw = sessionStorage.getItem(RESTORE_KEY);
    if (!raw) return undefined;
    sessionStorage.removeItem(RESTORE_KEY);
    const saved = JSON.parse(raw) as { userId: number; state: object };
    return saved.userId === userId ? saved.state : undefined;
  } catch {
    return undefined;
  }
}
