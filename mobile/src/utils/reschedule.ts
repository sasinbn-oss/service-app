/**
 * แอดมินเลื่อนวันนัด — ขั้นที่เลื่อนได้ (เจ้าของงานเลือก "ได้ตลอดจนช่างเข้างาน" ต.ค. 69)
 *
 * แยกไฟล์เพราะใช้สองที่: หน้าใบงาน (ปุ่ม/ลิงก์เลื่อนวันนัด) กับงานของฉันวันนี้ (ปุ่มลัดบนการ์ดเลยนัด)
 * ปุ่มลัดต้องขึ้นเฉพาะใบที่หน้าใบงานจะเปิดฟอร์มให้จริง — เดิมใบนัดตรวจที่เลยนัดก็มีปุ่ม
 * กดแล้วหน้าใบงานเปิดมาเฉย ๆ ไม่มีฟอร์ม ดูเหมือนปุ่มเสีย
 * ตัวจริงมากับ options.rescheduleStages ของเซิร์ฟเวอร์ — ค่านี้คือค่าตั้งต้นเผื่อเซิร์ฟเวอร์รุ่นเก่า (หน้าใบงาน)
 * และรายการที่งานของฉันใช้ (ไม่ได้โหลด options ทั้งก้อนแค่เพื่อปุ่มเดียว)
 */
export const RESCHEDULE_STAGES = [
  "PARTS_REQUESTED",
  "PARTS_TRANSFER",
  "PARTS_IN_TRANSIT",
  "PARTS_PICKUP",
  "AWAITING_CONFIRM",
  "ASSIGNED",
  "INSPECT_DISPATCH",
  "IN_PROGRESS",
  "INSPECTING",
];
/** ปล่อยให้ช่างแล้ว — เลื่อนได้จนช่างกดถึงหน้างาน ใบถูกดึงคืนให้หัวหน้าภาคปล่อยใหม่ */
export const RECALL_STAGES = ["IN_PROGRESS", "INSPECTING"];

/**
 * คนนี้กดเลื่อนวันนัดได้ไหม — แอดมิน (รวม Super Admin) ที่ไม่ได้ดูในฐานะคนอื่น
 * Admin Spare Part มี role ADMIN ในแอป (AuthContext) แต่ดูใบงานอย่างเดียว — หน้าใบงานตัดปุ่มทิ้ง จึงต้องตัดที่นี่ด้วย
 */
export function canMoveDates(u: { role?: string; partsAdmin?: boolean; viewAs?: unknown } | null | undefined) {
  return !!u && u.role === "ADMIN" && !u.partsAdmin && !u.viewAs;
}
