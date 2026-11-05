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

/**
 * ยี่ห้อเครื่องของใบงานในรูปที่ช่องเลือกอะไหล่ใช้ — ตรงกับ partsBrand ที่เซิร์ฟเวอร์ส่งมากับใบงาน
 * machine = ใบมีเครื่อง (ไม่มี = งานทั้งสาขา ไม่ล็อกยี่ห้อ ข้อ 22) · file ว่างทั้งที่มีเครื่อง = ยังไม่รู้ยี่ห้อ ต้องกดชิปก่อน
 */
export interface PartsBrand {
  machine: boolean;
  make: string | null;
  file: string | null;
  machineCode: string | null;
  /** ยี่ห้อมาจากไฟล์รายงานเครื่อง — แก้ในแอปแล้วนำเข้ารายงานครั้งหน้าทับกลับ (ชีตแก้ยี่ห้อเตือน) */
  fromReport?: boolean;
}

/** "HB" แบบเป็นคำ = Huebsch (เจ้าของงานยืนยัน) — "THB" ไม่ใช่ · ธง i ทำให้ [^a-z] ไม่รับ A–Z ด้วย เหมือนเซิร์ฟเวอร์ */
const HB_WORD = /(^|[^a-z])hb([^a-z]|$)/i;

/**
 * ยี่ห้อเครื่อง → ไฟล์อะไหล่ — สำเนาของ brandFileOf ใน backend/src/utils/brandFile.ts (ลำดับเดียวกันทุกบรรทัด
 * และเท่ากับ CASE ใน tests/lib/fixture-parts.sh) แก้ที่หนึ่งต้องแก้ทั้งสามที่
 *
 * ทำไมแอปคิดเองแทนที่จะรอเซิร์ฟเวอร์: ชิปที่เพิ่งกด (ยังไม่บันทึกกับเครื่อง) ต้องรู้ไฟล์ทันทีเพื่อติดป้ายแดงแถวที่อยู่คนละไฟล์
 * และกันปุ่มส่ง — รอคำตอบจาก /spare-parts/for-brand ก่อน ปุ่มจะกดผ่านได้ช่วงสั้น ๆ แล้วไปโดนเซิร์ฟเวอร์ปฏิเสธ
 * ชื่อไฟล์บนหัวช่องค้นยังใช้ค่าที่เซิร์ฟเวอร์ตอบ (คำตอบจริง) — ตรงนี้ใช้ตัดสินป้ายและปุ่มเท่านั้น
 * ว่าง = ไม่รู้ยี่ห้อ (null) · ข้อความที่ไม่ตรงคำไหน = Other (เลือกได้แค่ของใช้ร่วม)
 */
export function brandFileOf(make: string | null | undefined): BrandFile | null {
  const s = make?.trim();
  if (!s) return null;
  // ชื่อไทยด้วย ("เมแทค" จากไฟล์รายงานเครื่อง) — เหตุผลอยู่ที่ MAKE_WORDS ฝั่ง backend
  if (/huebsch|ฮิวบ|ฮูบ/i.test(s) || HB_WORD.test(s)) return "Huebsch";
  if (/oasis|โอเอ[ซส]ิส|โอซิส/i.test(s)) return "Oasis";
  if (/haier|ไฮเออ/i.test(s)) return "Haier";
  if (/maytag|เม(ย์)?(ท)?แท(็)?[คก]/i.test(s)) return "Maytag";
  if (/spinz|สปิน[ซส]/i.test(s)) return "Spinz";
  return SHARED_FILE;
}

/** ไฟล์ที่เครื่องหนึ่งเลือกได้ = ไฟล์ของตัวเอง + ของใช้ร่วม (เครื่องที่ตกไป Other ได้ไฟล์เดียว) */
export function allowedFiles(machineFile: string): string[] {
  return machineFile === SHARED_FILE ? [SHARED_FILE] : [machineFile, SHARED_FILE];
}

/** อะไหล่ตัวนี้เลือกได้กับเครื่องไฟล์นี้ไหม — กติกาเดียวกับ brandProblem ข้อสุดท้ายฝั่งเซิร์ฟเวอร์ (ไม่มีไฟล์ = นอกเครื่อง ได้เสมอ) */
export function fileAllows(machineFile: string, brandFiles: readonly string[]): boolean {
  if (brandFiles.length === 0) return true;
  const ok = allowedFiles(machineFile);
  return brandFiles.some((f) => ok.includes(f));
}

/**
 * อะไหล่นอกเครื่อง (เจ้าของงานเลือก 4 พ.ย. 69) = ของในสโตร์ที่ไม่อยู่ในไฟล์ยี่ห้อไหน — ทุกเครื่องเลือกได้ ไม่ต้องยืนยัน
 * ไม่ต้องมีเครื่อง ไม่ต้องรู้ยี่ห้อ · คนละอย่างกับของนอกสโตร์ (offCatalog — ไม่มีรหัส หัวหน้าภาคจัดหาเอง)
 * brandFiles ไม่มีค่า (เซิร์ฟเวอร์รุ่นก่อน) = ไม่รู้ ไม่นับเป็นนอกเครื่อง ปล่อยให้เซิร์ฟเวอร์ตัดสิน
 */
export const OUTSIDE_PART = "อะไหล่นอกเครื่อง";
export function isOutsidePart(p: { offCatalog?: boolean | null; brandFiles?: readonly string[] | null }): boolean {
  return !p.offCatalog && !!p.brandFiles && p.brandFiles.length === 0;
}

/** "อัปเดต 28 ต.ค. 69" — วันที่แบบเดียวกับตัวอย่างที่เจ้าของงานอนุมัติ (ปี พ.ศ. สองหลัก) */
export function shortThaiDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit" });
}
