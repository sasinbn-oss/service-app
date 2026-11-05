/**
 * ประวัติการนำเข้า — ตัวช่วยที่หน้าอื่นใช้ (หน้าเองอยู่ที่ screens/ImportHistoryScreen.tsx)
 *
 * ทุกหน้าที่นำเข้าไฟล์มีทางเข้าหน้าประวัติที่กรองชนิดของหน้านั้นไว้ให้ (ตัวอย่างที่อนุมัติ 5 พ.ย. 69)
 * หน้าประวัติอยู่แท็บหลังบ้าน แต่หน้านำเข้าอยู่คนละแท็บ (ใบงาน · หน้าหลัก) จึงสั่งผ่านตัวนำทางของทั้งแอปแบบเมนูข้าง
 */
import { api } from "../api/client";
import { navigationRef } from "../navigation/navigationRef";

/** ชิปชนิดบนหน้าประวัติ — ต้องตรงกับกลุ่มฝั่ง backend (routes/importHistory.ts) */
export type ImportGroup = "repair" | "parts" | "machine" | "branch" | "users" | "vehicle";

/**
 * เปิดหน้าประวัติการนำเข้า กรองชนิดไว้ · run = เปิดรอบนั้นเลย (r12 · m5 · p<batchId>)
 * initial: false ให้ปุ่มย้อนกลับพากลับไปหน้าแรกของแท็บหลังบ้าน ไม่ใช่หลุดออกจากแท็บ (แบบเมนูข้าง)
 */
export function openImportHistory(kind?: ImportGroup, run?: string | null) {
  if (!navigationRef.isReady()) return;
  (navigationRef.navigate as (tab: string, p: object) => void)("AdminTab", {
    screen: "ImportHistory",
    params: { kind, run: run ?? undefined },
    initial: false,
  });
}

/**
 * รหัสรอบของการกดยืนยันหนึ่งครั้ง — ส่งไปกับทุกชุด (ใบแจ้งซ่อมส่งทีละ 10 แถว) ให้เซิร์ฟเวอร์รวมเป็นรอบเดียวในประวัติ
 * กดยืนยันใหม่ (แม้ไฟล์เดิม) = รหัสใหม่ = รอบใหม่ · เซิร์ฟเวอร์เติมเลขผู้ใช้นำหน้าเอง รหัสสองคนชนกันไม่ปนรอบ
 */
export function newRunKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * บอกเซิร์ฟเวอร์ว่าแอปเลิกส่งชุดที่เหลือแล้ว — รอบขึ้น "หยุดกลางทาง" ทันที ไม่ต้องรอ 5 นาที
 * เน็ตหลุดอยู่ก็ส่งไม่ถึง ไม่เป็นไร: หน้าประวัติตัดสินเองเมื่อรอบเงียบเกิน 5 นาที · ไม่บังจอ ไม่แจ้งข้อผิดพลาด
 */
export function reportStop(runKey: string, reason: "user" | "network" | "stalled" | "error") {
  api.post("/import-history/stop", { runKey, reason }, { loadingText: false }).catch(() => undefined);
}
