/**
 * ไฟล์อะไหล่แยกยี่ห้อ 6 ไฟล์ (เจ้าของงาน 31 ต.ค. 69: "ไฟล์ล่าสุด 6 ไฟล์ … ใช่") — ต้องเท่ากับ BRAND_FILES
 * ใน backend/src/utils/brandFile.ts มีไฟล์เพิ่มต้องแก้ทั้งสองที่
 *
 * ไฟล์ของอะไหล่มาจากชื่อไฟล์ Excel ที่อัปโหลด ไม่ใช่ช่อง "ยี่ห้อสินค้า" และไม่ใช่คำนำหน้ารหัส
 * เขียนซ้ำในแอปเพราะชิปเลือกไฟล์ต้องขึ้นทันทีที่หน้าตรวจ ไม่ต้องรอโหลดตัวเลือกจากเซิร์ฟเวอร์อีกรอบ
 */
export const BRAND_FILES = ["Haier", "Huebsch", "Maytag", "Oasis", "Spinz", "Other"] as const;
export type BrandFile = (typeof BRAND_FILES)[number];
/** Other = อะไหล่ใช้แทนกันได้/ของใช้ในสาขา — ทุกเครื่องเลือกได้ นอกจากไฟล์ยี่ห้อของเครื่องเอง (R4) */
export const SHARED_FILE: BrandFile = "Other";
