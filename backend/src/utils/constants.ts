export const ROLES = ["EMPLOYEE", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const VEHICLE_STATUSES = ["AVAILABLE", "IN_USE", "MAINTENANCE"] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_LOG_STATUSES = ["ONGOING", "COMPLETED"] as const;
export type VehicleLogStatus = (typeof VEHICLE_LOG_STATUSES)[number];

export const REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/**
 * สถานะการดำเนินการของเคสเครื่องเสีย — คนกรอกเอง ไม่ได้มาจากไฟล์
 *
 * เก็บเป็นรหัสคงที่แล้วแปลเป็นไทยตอนแสดงผล ชื่อภาษาไทยจะได้แก้ได้
 * โดยไม่ต้องไล่แก้ข้อมูลเก่าในฐานข้อมูล
 */
export const WORK_STATUSES = [
  "WAITING_PARTS",
  "WAITING_TECH",
  "WAITING_PAYMENT",
  "WAITING_CUSTOMER",
] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

/**
 * สถานะที่เลิกใช้แล้ว แต่ข้อมูลเก่าที่บันทึกไว้ยังมีอยู่
 *
 * เอาออกจากรายการที่เลือกได้เฉยๆ ไม่ได้ลบข้อมูล เคสเก่าจึงยังแสดงป้ายไทยได้ปกติ
 * และยังกรองหาได้ ถ้าลบทิ้งเลยหน้าจอจะโชว์รหัสอังกฤษดิบๆ แทน
 */
export const RETIRED_WORK_STATUSES = ["IN_PROGRESS"] as const;

export const WORK_STATUS_LABELS: Record<string, string> = {
  WAITING_PARTS: "รออะไหล่",
  WAITING_TECH: "รอช่างเข้าแก้ไข",
  WAITING_PAYMENT: "รอลูกค้าจ่ายเงิน",
  WAITING_CUSTOMER: "รอลูกค้าแจ้งซ่อม",
  IN_PROGRESS: "กำลังดำเนินการ",
};

/** ค่าที่ยังกรองได้ รวมของเก่าด้วย ต่างจาก WORK_STATUSES ที่เลือกใหม่ได้เท่านั้น */
export const FILTERABLE_WORK_STATUSES = [...WORK_STATUSES, ...RETIRED_WORK_STATUSES] as const;

/**
 * คะแนนความรุนแรงของปัญหา
 *
 * นับเป็นวันเต็มที่ผ่านไป วันแรกจึงเป็น 0 เกิน 1 วันเป็น 1 เกิน 2 วันเป็น 2
 * สัญญาณหายคูณ 3 เพราะกระทบทั้งสาขา ไม่ใช่เครื่องเดียว
 */
export const SCORE_PER_DAY: Record<string, number> = {
  MACHINE_OFF: 1,
  SIGNAL_LOST: 3,
};

export function outageScore(kind: string, startedAt: Date, now: Date) {
  const days = Math.floor((now.getTime() - startedAt.getTime()) / 86_400_000);
  return Math.max(0, days) * (SCORE_PER_DAY[kind] ?? 1);
}

/**
 * เหตุผลที่เคสถูกปิด
 *
 * REPAIRED คือหายไปจากไฟล์เอง = ซ่อมเสร็จจริง มีแค่แบบนี้ที่ควรเอาไปคิดเวลาเฉลี่ย
 * แบบอื่นคือคนสั่งปิด เพราะไม่มีเครื่องให้ซ่อมแล้ว ไม่ใช่ผลงานของช่าง
 */
export const CLOSE_REASONS = ["REPAIRED", "BRANCH_CANCELLED", "MACHINE_REMOVED"] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

export const CLOSE_REASON_LABELS: Record<string, string> = {
  REPAIRED: "ซ่อมเสร็จ",
  BRANCH_CANCELLED: "สาขายกเลิก",
  MACHINE_REMOVED: "ถอดเครื่องออก",
};

/** เคสที่นับเป็นงานซ่อมจริง ใช้คิดเวลาเฉลี่ยและ % ปิดทัน SLA */
export function countsAsRepair(closeReason: string | null) {
  return closeReason === null || closeReason === "REPAIRED";
}

/**
 * สถานะของใบงาน — เรื่องของคน ไม่ใช่เรื่องของเครื่อง
 *
 * ห้ามสับสนกับ WORK_STATUSES ข้างบน ซึ่งบอกว่า "เคสติดอยู่ที่ขั้นไหน" (รออะไหล่ รอลูกค้า)
 * ส่วนอันนี้บอกว่า "ใบงานเดินไปถึงไหน" (ยังไม่มีใครรับ รับแล้ว ปิดแล้ว)
 * เคสหนึ่งอาจมีใบงานหลายใบตามรอบที่ช่างเข้าไป
 */
export const WORK_ORDER_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const WORK_ORDER_STATUS_LABELS: Record<string, string> = {
  OPEN: "รอช่างรับงาน",
  IN_PROGRESS: "ช่างรับแล้ว",
  DONE: "ปิดงานแล้ว",
  CANCELLED: "ยกเลิก",
};

/** สถานะที่ถือว่ายังทำงานอยู่ ใช้กันไม่ให้เปิดใบงานซ้ำกับเคสเดิม */
export const ACTIVE_WORK_ORDER_STATUSES = ["OPEN", "IN_PROGRESS"] as const;

export const WORK_ORDER_PRIORITIES = ["URGENT", "NORMAL", "LOW"] as const;

export const WORK_ORDER_PRIORITY_LABELS: Record<string, string> = {
  URGENT: "ด่วน",
  NORMAL: "ปกติ",
  LOW: "ไม่เร่ง",
};

/**
 * ผลของงาน ไม่ใช่แค่ "ปิดแล้ว"
 *
 * ต้องแยก "ซ่อมได้" ออกจาก "ไปแล้วแต่ยังไม่จบ" ไม่งั้นใบงานที่ปิดเพราะรออะไหล่
 * จะถูกนับเป็นงานที่สำเร็จ แล้วตัวเลขในรายงานสวยกว่าความจริง
 */
export const WORK_ORDER_RESULTS = ["FIXED", "PENDING_PARTS", "NEED_REVISIT", "NO_FAULT"] as const;

export const WORK_ORDER_RESULT_LABELS: Record<string, string> = {
  FIXED: "ซ่อมเสร็จ",
  PENDING_PARTS: "รออะไหล่ ต้องกลับไปอีกรอบ",
  NEED_REVISIT: "ยังไม่จบ ต้องกลับไปอีกรอบ",
  NO_FAULT: "ไปถึงแล้วเครื่องปกติ",
};

export const WORK_ORDER_ACTION_LABELS: Record<string, string> = {
  CREATED: "เปิดใบงาน",
  ASSIGNED: "มอบหมายช่าง",
  STARTED: "ช่างรับงาน",
  CLOSED: "ปิดงาน",
  CANCELLED: "ยกเลิกใบงาน",
  REOPENED: "เปิดงานใหม่",
  EDITED: "แก้ไขใบงาน",
};

/** รหัสที่คนอ่าน ตั้งจาก id จึงไม่มีทางชนกันและไม่ต้องนับแถวก่อน */
export function workOrderCode(id: number): string {
  return `WO-${String(id).padStart(5, "0")}`;
}
