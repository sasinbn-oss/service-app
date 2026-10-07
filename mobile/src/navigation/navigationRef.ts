import { createNavigationContainerRef } from "@react-navigation/native";
import { MainTabParamList } from "./types";

/**
 * ตัวจับการนำทางของทั้งแอป
 *
 * เมนูข้างอยู่นอกต้นไม้ของ navigator (ลอยทับทุกแท็บ) จึงเรียก useNavigation
 * ไม่ได้ — ต้องสั่งผ่านตัวนี้แทน และใช้ฟังสถานะเพื่อไฮไลต์หน้าที่เปิดอยู่
 */
export const navigationRef = createNavigationContainerRef<MainTabParamList>();
