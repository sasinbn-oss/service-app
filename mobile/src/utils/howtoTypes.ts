/**
 * ชนิดข้อมูลของ "สอนการใช้งาน" (เจ้าของงานเลือก ต.ค. 69) — แยกไฟล์ไว้ให้ไฟล์ข้อความ (screens/*.howto.ts) import ได้
 * โดยไม่ดึงตัวเครื่อง (utils/howto.ts) ที่ import หน้าจอกลับมาอีกทาง — วนกันแล้ว Metro โหลดไฟล์ไม่ครบ
 */
import type Ionicons from "@expo/vector-icons/Ionicons";
import type { Cutoff } from "./dispatchCutoff";

/** บทบาทในมุมของวิธีใช้ — Senior ช่าง = tech + senior · Super Admin = admin + super (ขั้นเพิ่มของสองตำแหน่งนี้) */
export type HowToRole = "tech" | "senior" | "sup" | "admin" | "super";

/** สิ่งที่เซิร์ฟเวอร์ส่งมาใน login / /auth/me (backend/src/utils/howto.ts) — ชื่อช่องต้องตรงกัน */
export type HowToState = {
  /** ช่องในฐานข้อมูลว่าง = พนักงานเดิม */
  legacy: boolean;
  /** บัญชีใหม่ / แอดมินกดให้ดูใหม่ — ขึ้นกล่องต้อนรับครั้งเดียว */
  pending: boolean;
  welcomeAt: string | null;
  noticeAt: string | null;
  /** หน้าที่ดูจบแล้ว ("เข้าใจแล้ว") → เวลา */
  tours: Record<string, string>;
  resetAt: string | null;
};

/**
 * ของที่ข้อความบางขั้นต้องรู้ตอนเล่น — ข้อความที่เป็นฟังก์ชันได้ค่านี้ทุกครั้งที่ขั้นนั้นขึ้น
 * เช่นเวลาปิดนัดงานพรุ่งนี้ต้องเป็นค่าที่แอดมินตั้งจริง ไม่ใช่ "16:00" ที่เขียนตายไว้ (เจ้าของงานตอบ 4.2)
 */
export interface HowToCtx {
  roles: HowToRole[];
  /** รหัสใบงานที่วิธีใช้เปิดให้ดู (ถ้ามี) */
  code: string | null;
  /** เวลาปิดนัดที่หน้าจอได้จากเซิร์ฟเวอร์ — หน้าที่รู้ค่านี้ส่งมาผ่าน useHowToContext · ยังไม่รู้ = null */
  cutoff: Cutoff | null;
}

/** ข้อความตายตัว · แยกตามบทบาท · หรือคิดตอนเล่น (ctx) */
export type HowToBody = string | Partial<Record<HowToRole, string>> | ((ctx: HowToCtx) => string);

export interface HowToStep {
  /** ชื่อจุดที่ชี้ (data-testid="howto-<ชื่อ>") · หลายชื่อ = กรอบครอบทุกตัวที่หาเจอ */
  target?: string | string[];
  /** หาไม่เจอ: skip = ข้ามขั้นนี้ (ค่าตั้งต้น) · center = กล่องกลางจอ (ช่างใหม่ที่ยังไม่มีงาน) */
  whenMissing?: "skip" | "center";
  /** เฉพาะจอแคบ (เมนูไม่ค้าง: เว็บ < 1100 px · แอปติดตั้ง) หรือจอกว้าง */
  layout?: "narrow" | "wide";
  /** มือถือ (< 640 px): ขึ้นเป็นแผ่นขอบล่างเสมอ ไม่ว่าจะมีที่ข้างปุ่มไหม */
  place?: "sheet";
  /** ขั้นเฉพาะบทบาท (ขั้นเพิ่มของ Senior ช่าง / Super Admin) */
  roles?: HowToRole[];
  /** รูปเส้นเล็กในวงกลม */
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: HowToBody;
  /** กล่องเล็กใต้ข้อความ — "{code}" ถูกแทนด้วยรหัสใบงานที่เปิดให้ดู */
  note?: { text: string; tone: "warn" | "info" };
  /** กล่องกลางจอวาดการ์ดตัวอย่างให้ดู */
  sample?: "jobCard";
  /** จอแคบ: เปิดเมนูข้างก่อนขั้นนี้ */
  menu?: boolean;
  /** กางกลุ่มเมนูนี้ให้ดูชั่วคราว (ไม่จำลงเครื่อง) */
  peek?: string;
  /** ขั้นที่ให้ลองกดเอง — มีขั้นเดียวทั้งแอป (ปุ่มสามขีดของช่าง) */
  try?: { action: "openMenu"; label: string };
  /** ชื่อคำสั่งที่หน้าจอลงทะเบียนไว้ (useHowToAction) ให้รันก่อนขั้นนี้ — ย้อนกลับก่อนขั้นนี้แล้วปิดสิ่งที่เปิดให้ */
  before?: string;
}

export interface HowToTour {
  /** "<บทบาท>.<หน้า>" — คีย์ที่เซิร์ฟเวอร์จำว่าดูแล้ว (ตรงกับ HOWTO_TOUR_ID ฝั่ง backend) */
  id: string;
  /** ชื่อในหน้า "สอนการใช้งาน" */
  title: string;
  /**
   * ชื่อหน้าบนแถบหัว (กล่องต้อนรับ: "ดูวิธีใช้หน้า {page}") — ใช้เมื่อยังไม่ได้อยู่หน้านั้น
   * อยู่หน้านั้นแล้วกล่องอ่านชื่อจากแถบหัวจริง · ไม่ใส่ = ใช้ title
   */
  page?: string;
  roles: HowToRole[];
  /** ชื่อหน้า (route) ที่วิธีใช้นี้เล่น */
  route: string;
  /** วิธีใช้ของฟอร์มที่เปิดทับหน้า (เปิดจากปุ่ม ? ในฟอร์ม) — ปุ่ม ? บนแถบหัวไม่เล่นเรื่องนี้ */
  inForm?: boolean;
  /** เปิดจากหน้า "สอนการใช้งาน": ไปหน้านี้ก่อน แล้วรันคำสั่งตามลำดับ (แต่ละคำสั่งรอหน้าลงทะเบียนได้ถึง 6 วินาที) */
  start?: { route: string; action?: string | string[] };
  steps: HowToStep[];
}
