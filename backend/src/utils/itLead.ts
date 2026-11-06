/**
 * หัวหน้าภาคที่ดูแลงาน IT (เจ้าของงานตัดสิน 6 พ.ย. 69)
 *
 * งาน IT ไม่ได้ผูกกับพื้นที่ของสาขา — คนที่แก้ได้คือคนที่รู้ระบบ ไม่ใช่คนที่อยู่ใกล้ร้าน
 * เดิมใบ IT เดินแบบงาน CM (หัวหน้าภาคของภาคนั้นเป็นเจ้าของ) ใบเลยกระจายไปหาทุกคนที่ไม่ได้ทำ IT
 * ตอนนี้: หัวหน้าภาคหนึ่งคน (User.itLead) ถือใบ IT ทุกภาค · คนอื่นไม่เห็นใบ IT เลย · งาน CM ของทุกคนเหมือนเดิม
 *
 * กฎขอบเขตอยู่ที่ supervisorScope.ts (SupervisorScope.itLead) ไฟล์นี้เก็บแค่สิ่งที่ใช้ร่วมกันหลายจุด
 */
import { prisma } from "../prisma";

export const IT_JOB = "IT";

export function isItOrder(wo: { jobType: string }) {
  return wo.jobType === IT_JOB;
}

/**
 * ขั้นของแอดมินที่หัวหน้าภาคที่ดูแลงาน IT ทำแทนได้ในใบ IT ("ทำได้ทั้งหมด" — เจ้าของงานตัดสิน)
 * = ทุกขั้นที่ WORK_ORDER_STAGE_ACTOR เป็น ADMIN ยกเว้นตรวจเคลม (CLAIM_REVIEW เป็นของ Admin Spare Part —
 * คนที่ถือใบเองไม่ควรตรวจหลักฐานเคลมของใบตัวเอง) · เขียนเป็นรายการตรง ๆ ไม่คำนวณจากตาราง actor
 * เพราะขั้นของแอดมินที่เพิ่มทีหลังต้องมีคนตัดสินก่อนว่าให้หัวหน้า IT ทำด้วยไหม ไม่ใช่ได้สิทธิ์ไปเงียบ ๆ
 */
export const IT_LEAD_ADMIN_STAGES: readonly string[] = [
  "INSPECT_CONFIRM",
  "PARTS_SOURCING",
  "AWAITING_QUOTE",
  "AWAITING_PAYMENT",
  "PARTS_REQUESTED",
  "AWAITING_CONFIRM",
];

/**
 * ขั้นที่ปิดแบบ "แก้จากระยะไกลแล้ว" ได้ — ยังไม่มีช่างถือใบ และไม่มีของ/เงินกำลังเดิน
 *
 * ได้: ยังไม่ส่งใคร (NEW) · นัดตรวจ/ปล่อยตรวจที่ช่างยังไม่ออก (INSPECT_CONFIRM · INSPECT_DISPATCH)
 * · เช็คอะไหล่/ทำใบเสนอราคาที่ยังไม่ได้ส่งให้ลูกค้า (PARTS_SOURCING · AWAITING_QUOTE)
 * · รอนัดวัน (PARTS_CHECKED) · รอปล่อยงาน (ASSIGNED — ยังไม่ปล่อย ช่างยังไม่เห็นงาน)
 * ไม่ได้: ช่างถือใบอยู่ (INSPECTING · IN_PROGRESS — ช่างปิดเองจากหน้างาน) · รอลูกค้าจ่ายเงิน (AWAITING_PAYMENT —
 * ลูกค้าถือใบเสนอราคาอยู่ ต้องจบเรื่องเงินก่อน) · ขั้นเบิก/โอนของ (PARTS_REQUESTED · PARTS_TRANSFER · PARTS_IN_TRANSIT
 * · PARTS_PICKUP — ของกำลังออกจากคลัง) · คอนเฟิร์มลูกค้า (AWAITING_CONFIRM — ของเบิกออกมาแล้ว) · ตรวจเคลม · ปิด/ยกเลิกแล้ว
 * PARTS_CHECKED/ASSIGNED ที่เบิกของออกจากคลังไปแล้ว (ใบเบิกมีเลข) ก็ไม่ได้ — ดู remote-close ใน routes/workOrders.ts
 */
export const REMOTE_CLOSE_STAGES: readonly string[] = [
  "NEW",
  "INSPECT_CONFIRM",
  "INSPECT_DISPATCH",
  "PARTS_SOURCING",
  "AWAITING_QUOTE",
  "PARTS_CHECKED",
  "ASSIGNED",
];

/** ข้อความที่ตั้งใช้ซ้ำ — คำที่เจ้าของงานใช้ ("หัวหน้าภาคที่ดูแลงาน IT") */
export const IT_LEAD_TITLE = "หัวหน้าภาคที่ดูแลงาน IT";
export const NO_IT_LEAD_REASON = "ยังไม่ได้เลือกหัวหน้าภาคที่ดูแลงาน IT (จัดการผู้ใช้)";

/**
 * คนที่ถืออยู่ตอนนี้ — อ่านสดทุกครั้ง ไม่จำไว้: เปลี่ยนคนแล้วใบ IT ต้องย้ายทันทีทุกหน้าจอ
 * เรียกเฉพาะจุดที่ยังไม่ได้อ่านรายชื่อหัวหน้าภาคมา (จุดส่วนใหญ่อ่าน itLead มากับรายชื่อหัวหน้าภาคอยู่แล้ว)
 * นับเฉพาะหัวหน้าภาคที่ยังไม่ถูกลบ — ค่าค้างบนแถวที่ไม่ใช่หัวหน้าภาค (แก้ฐานข้อมูลตรง ๆ) ไม่ได้สิทธิ์
 */
export async function currentItLead(): Promise<{ id: number; name: string } | null> {
  return prisma.user.findFirst({
    where: { itLead: true, role: "SUPERVISOR", deletedAt: null },
    select: { id: true, name: true },
  });
}

/** ผู้ที่ถือ itLead จากรายชื่อหัวหน้าภาคที่อ่านมาแล้ว (ต้อง select itLead มาด้วย) */
export function itLeadAmong<T extends { itLead?: boolean | null }>(sups: T[]): T | null {
  return sups.find((s) => s.itLead) ?? null;
}

/**
 * ผลที่จำไว้ซึ่งขึ้นกับว่าใครถือใบ IT (ชุด "ไม่มีคนรับ" ของกล่องงานแอดมิน — จำไว้ 60 วิ)
 * ต้องทิ้งทันทีเมื่อเปลี่ยนคนถือ ไม่งั้นใบ IT ค้างใน "ไม่มีคนรับ" อีกนาทีทั้งที่ตั้งคนแล้ว (หรือกลับกัน)
 * routes/workOrders.ts ลงทะเบียนตัวล้างไว้ — routes/auth.ts เรียก itLeadChanged หลังบันทึก (ไม่ import กันตรง ๆ)
 */
const listeners: (() => void)[] = [];
export function onItLeadChange(fn: () => void) {
  listeners.push(fn);
}
export function itLeadChanged() {
  for (const fn of listeners) fn();
}
