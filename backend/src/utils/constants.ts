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
  "IN_PROGRESS",
] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  WAITING_PARTS: "รออะไหล่",
  WAITING_TECH: "รอช่างเข้าแก้ไข",
  WAITING_PAYMENT: "รอลูกค้าจ่ายเงิน",
  WAITING_CUSTOMER: "รอลูกค้าแจ้งซ่อม",
  IN_PROGRESS: "กำลังดำเนินการ",
};
