/**
 * SUPERVISOR = หัวหน้าภาค อยู่ระหว่างช่างกับแอดมินในสายงาน
 *
 * ผูกกับภาคผ่าน User.region — เห็นและจัดการเฉพาะใบงานของสาขาในภาคตัวเอง
 * แอดมินเห็นทุกภาค ช่างเห็นเฉพาะงานที่ถูกจ่ายให้ตัวเอง
 */
/**
 * SUPER_ADMIN = แอดมินที่ตั้ง/ถอดแอดมินได้ (เจ้าของระบบ)
 *
 * ทำงานทุกอย่างได้เท่าแอดมิน — ตัวตรวจสิทธิ์ (middleware/auth.ts) มองเป็น ADMIN
 * ทุกที่ที่เช็ค "ADMIN" จึงใช้ได้กับ SUPER_ADMIN ด้วยโดยไม่ต้องไล่แก้
 * ที่ต่างกันมีแค่เรื่องตั้งสิทธิ์ผู้ใช้ระดับแอดมินขึ้นไป (routes/auth.ts)
 *
 * PARTS_ADMIN = แอดมินอะไหล่ (เจ้าของงานเพิ่ม ต.ค. 69) — คนเช็คประกัน สิทธิ์เท่าแอดมินทุกอย่าง
 * มองเป็น ADMIN แบบเดียวกับ SUPER_ADMIN · เก็บแยกไว้เพราะจะมีขั้นสุดท้ายหลังช่างปิดงาน
 * (แก้ใบปิดงานกรณีเปลี่ยนสินค้า/เคลมประกัน และตีกลับถ้าช่างปิดไม่ตรงฟอร์ม) ที่เป็นของตำแหน่งนี้
 */
export const ROLES = ["EMPLOYEE", "SUPERVISOR", "ADMIN", "PARTS_ADMIN", "SUPER_ADMIN"] as const;
/**
 * บทบาทระดับผู้ดูแลระบบ — นับรวมเวลาเช็คว่า "ต้องเหลือแอดมินอย่างน้อยหนึ่งคน"
 * และตั้ง/ถอดได้เฉพาะ Super Admin — แอดมินอะไหล่ทำได้เท่าแอดมิน ตั้งให้ใครก็คือให้สิทธิ์แอดมิน
 */
export const ADMIN_ROLES = ["ADMIN", "PARTS_ADMIN", "SUPER_ADMIN"];

export const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "ช่าง",
  SUPERVISOR: "หัวหน้าภาค",
  ADMIN: "แอดมิน",
  PARTS_ADMIN: "Admin Spare Part",
  SUPER_ADMIN: "Super Admin",
};
export type Role = (typeof ROLES)[number];

export const VEHICLE_STATUSES = ["AVAILABLE", "IN_USE", "MAINTENANCE", "INACTIVE"] as const;
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

/**
 * สถานะที่ระบบตั้งให้เองตามขั้นของใบงาน — ไม่อยู่ในตัวเลือกที่คนกรอก แต่รับค่าได้ (ฟอร์มส่งค่าเดิมกลับมา)
 *
 * CHECKING_PARTS (เจ้าของงานขอ ต.ค. 69): ใบที่ถึงขั้นเช็คอะไหล่แต่แอดมินยังไม่ได้ตอบ เดิมขึ้น "รออะไหล่" ทั้งที่
 * ยังไม่มีใครบอกว่าของหมด — ตอนนี้ขึ้นตามที่แอดมินระบุจริง: ยังไม่เช็ค = รอแอดมินเช็คอะไหล่ · ตอบว่าหมด = รออะไหล่
 */
export const SYSTEM_WORK_STATUSES = ["CHECKING_PARTS", "QUOTING"] as const;
/**
 * ที่คนตั้งเองบนใบงานได้ — เรื่องที่ระบบไม่มีทางรู้จากขั้นของใบงาน (เจ้าของงานขอ ต.ค. 69)
 *
 * ที่เหลือระบบตั้งตามขั้นและผลเช็คคลัง แก้มือไม่ได้ (PATCH ปฏิเสธ) — เดิมเลือกได้ทุกค่าทุกขั้น
 * ใบงานเลยขึ้น "รออะไหล่" ทั้งที่ไม่มีของหมด หรือ "รอลูกค้าจ่ายเงิน" ในใบที่ไม่มีขั้นเก็บเงิน
 * ต้องบอกเหตุผล และหมดอายุเองเมื่อใบงานเปลี่ยนขั้น (ทุกขั้นตั้งสถานะใหม่ด้วย workStatusForStage)
 */
export const MANUAL_WORK_STATUSES = ["WAITING_CUSTOMER"] as const;
/** ค่าที่บันทึกได้ — ที่คนเลือกได้ + ที่ระบบตั้ง */
export const STORABLE_WORK_STATUSES = [...WORK_STATUSES, ...SYSTEM_WORK_STATUSES] as const;

export const WORK_STATUS_LABELS: Record<string, string> = {
  WAITING_PARTS: "รออะไหล่",
  CHECKING_PARTS: "รอแอดมินเช็คอะไหล่",
  QUOTING: "รอแอดมินส่งใบเสนอราคา",
  WAITING_TECH: "รอช่างเข้าแก้ไข",
  WAITING_PAYMENT: "รอลูกค้าจ่ายเงิน",
  WAITING_CUSTOMER: "รอลูกค้าแจ้งซ่อม",
  IN_PROGRESS: "กำลังดำเนินการ",
};

/**
 * สถานะการดำเนินการที่ได้จากขั้นของใบงาน
 *
 * ขั้นของใบงานรู้อยู่แล้วว่าตอนนี้ติดอยู่ที่อะไร — รออะไหล่หรือรอช่างเข้า
 * ให้คนมากรอกซ้ำคือการขอให้คนพิมพ์สิ่งที่ระบบรู้อยู่แล้ว แล้วก็จะไม่ได้พิมพ์
 * ผลคือกระดานติดตามเครื่องเสียขึ้นสถานะค้างจากเมื่อสองสัปดาห์ก่อน
 *
 * คืน undefined เมื่อขั้นนั้นบอกอะไรไม่ได้ — ไม่ไปแตะค่าที่คนกรอกไว้
 * ส่วน "รอลูกค้าจ่ายเงิน" กับ "รอลูกค้าแจ้งซ่อม" ยังต้องกรอกเองอยู่
 * เพราะเป็นเรื่องฝั่งลูกค้าที่ขั้นของใบงานไม่มีทางรู้
 */
export function workStatusForStage(
  stage: string,
  opts: { anyPartOutOfStock?: boolean } = {}
): string | null | undefined {
  if (opts.anyPartOutOfStock) return "WAITING_PARTS";
  switch (stage) {
    // ยังไม่ได้ส่งราคา — เดิมขึ้น "รอลูกค้าจ่ายเงิน" ทั้งที่ลูกค้ายังไม่รู้ราคาด้วยซ้ำ (ต.ค. 69)
    case "AWAITING_QUOTE":
      return "QUOTING";
    // ตรงกับสถานะที่กระดานมีอยู่แล้วพอดี — รอลูกค้าจ่ายเงินคือการรอลูกค้าจริง ๆ
    case "AWAITING_PAYMENT":
      return "WAITING_PAYMENT";
    // กลับมาขั้นแรก (เปิดใหม่ · ช่างส่งกลับ · ย้อนขั้น · ตรวจเสร็จ) — หัวหน้าภาคยังไม่ได้ตัดสินอะไร
    // เดิมคืน undefined แล้วค่ารอบก่อน ("รอช่างเข้าแก้ไข") ค้างอยู่ทั้งที่งานกลับมารอหัวหน้าภาคแล้ว
    case "NEW":
      return null;
    // รอเบิกอะไหล่ก่อนเสนอราคา — ยังไม่เช็ค = รอแอดมินเช็ค · ตอบว่าหมด = รออะไหล่ (ผู้เรียกส่ง anyPartOutOfStock)
    case "PARTS_SOURCING":
      return "CHECKING_PARTS";
    // รอแอดมินเช็คอะไหล่ — ต้องตั้งค่าจริง ไม่ใช่ปล่อยไว้เฉย ๆ เพราะขั้นก่อนหน้าอาจเป็นขั้นรับเงิน
    // ซึ่งทิ้ง "รอลูกค้าจ่ายเงิน" ค้างไว้ · ยังไม่รู้ว่าของหมด จึงไม่ใช่ "รออะไหล่" (ตอบว่าหมดแล้วค่อยเป็น —
    // ผู้เรียกส่ง anyPartOutOfStock) — เจ้าของงานขอ ต.ค. 69
    case "PARTS_REQUESTED":
      return "CHECKING_PARTS";
    // ของมีแล้ว อยู่ระหว่างหัวหน้าภาคไปเบิกจากคลังอื่น — ยังไม่พร้อมส่งช่าง
    case "PARTS_PICKUP":
      return "CHECKING_PARTS";
    // ใบงานรออะไหล่ที่แยกออกมา — รอของเข้าคลังจริง ๆ
    case "WAITING_PARTS":
      return "WAITING_PARTS";
    case "INSPECT_CONFIRM":
    case "INSPECT_DISPATCH":
    case "INSPECTING":
    case "PARTS_CHECKED":
    case "ASSIGNED":
    case "AWAITING_CONFIRM":
    case "IN_PROGRESS":
      return "WAITING_TECH";
    case "DONE":
    // รอตรวจเคลม — ช่างซ่อมเสร็จแล้ว เครื่องไม่ได้รออะไร เหลือแต่เอกสารเคลม
    case "CLAIM_REVIEW":
      // ปิดงานแล้วไม่ได้รออะไรอยู่ ค้างไว้จะไปโผล่บนกระดานว่ายังรอช่าง
      return null;
    default:
      return undefined;
  }
}

/** ค่าที่ยังกรองได้ รวมของเก่าด้วย ต่างจาก WORK_STATUSES ที่เลือกใหม่ได้เท่านั้น */
export const FILTERABLE_WORK_STATUSES = [...WORK_STATUSES, ...SYSTEM_WORK_STATUSES, ...RETIRED_WORK_STATUSES] as const;

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
export const WORK_ORDER_STATUSES = [
  "NEW",
  "INSPECT_CONFIRM",
  "INSPECT_DISPATCH",
  "INSPECTING",
  "WAITING_PARTS",
  "PARTS_REQUESTED",
  "PARTS_PICKUP",
  "PARTS_SOURCING",
  "AWAITING_QUOTE",
  "AWAITING_PAYMENT",
  "PARTS_CHECKED",
  "AWAITING_CONFIRM",
  "ASSIGNED",
  "IN_PROGRESS",
  "CLAIM_REVIEW",
  "DONE",
  "CANCELLED",
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

/**
 * ป้ายบอกว่า "ตอนนี้รอใครอยู่" ไม่ใช่ "ทำอะไรไปแล้ว"
 *
 * คนเปิดหน้ารายการอยากรู้ว่าใบไหนค้างที่ตัวเอง การเขียนเป็นสิ่งที่รออยู่
 * ตอบคำถามนั้นได้ทันทีโดยไม่ต้องแปลในหัว
 */
export const WORK_ORDER_STATUS_LABELS: Record<string, string> = {
  /**
   * "ใคร · ทำอะไร" ใช้คำเดียวกันทั้งสถานะ ปุ่ม และแถบขั้นตอน (เจ้าของงานเลือก ต.ค. 69)
   *
   * เดิมสถานะขึ้นต้นด้วย "รอ…" แต่ปุ่มใช้อีกคำ (สถานะ "รอหัวหน้าภาคคอนเฟิร์มออกงาน" ปุ่ม "ยืนยันออกงาน")
   * และแถบขั้นตอนใช้ "รอ…" กับขั้นที่ผ่านแล้วด้วย เลยเห็น ✓ คู่กับ "รอลูกค้าจ่ายเงิน"
   * ส่วนการกระทำอยู่ที่ WORK_ORDER_STAGE_ACTIONS · ขั้นที่ผ่านแล้วใช้ WORK_ORDER_STAGE_DONE
   */
  NEW: "หัวหน้าภาค · ระบุอะไหล่",
  INSPECT_CONFIRM: "แอดมิน · นัดร้าน (ตรวจหน้างาน)",
  INSPECT_DISPATCH: "หัวหน้าภาค · ส่งช่างตรวจ",
  INSPECTING: "ช่าง · ตรวจหน้างาน",
  // ใบรออะไหล่รุ่นเก่า — ใบที่แยกตั้งแต่ ต.ค. 69 เริ่มที่แอดมินเบิกอะไหล่
  WAITING_PARTS: "หัวหน้าภาค · รออะไหล่เข้า",
  // เจ้าของงานขอ ต.ค. 69: ขั้นก่อนเสนอราคาคือ "เช็คว่ามีหรือหมด" ขั้นหลังรับเงินคือ "เบิกจริงส่งหน้างาน"
  PARTS_REQUESTED: "แอดมิน · เบิกอะไหล่ (คลัง 94)",
  PARTS_PICKUP: "หัวหน้าภาค · เบิกอะไหล่ (คลังอื่น)",
  PARTS_SOURCING: "แอดมิน · เช็คอะไหล่ (มี/หมด)",
  AWAITING_QUOTE: "แอดมิน · ส่งใบเสนอราคา",
  AWAITING_PAYMENT: "แอดมิน · แนบบิลรับเงิน",
  PARTS_CHECKED: "หัวหน้าภาค · จ่ายงานให้ทีม",
  AWAITING_CONFIRM: "แอดมิน · คอนเฟิร์มลูกค้า",
  ASSIGNED: "หัวหน้าภาค · รับทราบ ปล่อยงาน",
  IN_PROGRESS: "ช่าง · เข้างาน/ปิดงาน",
  CLAIM_REVIEW: "Admin Spare Part · ตรวจเคลม",
  DONE: "ปิดงานแล้ว",
  CANCELLED: "ยกเลิก",
};

/** สิ่งที่ต้องทำในขั้นนี้ — ชื่อปุ่มและชื่อขั้นบนแถบขั้นตอน (คนทำแสดงแยกใต้ชื่อ) */
export const WORK_ORDER_STAGE_ACTIONS: Record<string, string> = Object.fromEntries(
  Object.entries(WORK_ORDER_STATUS_LABELS).map(([k, v]) => [k, v.includes(" · ") ? v.slice(v.indexOf(" · ") + 3) : v])
);

/** ชื่อขั้นที่ผ่านไปแล้วบนแถบขั้นตอน — "…แล้ว" ไม่ใช่ "รอ…" */
export const WORK_ORDER_STAGE_DONE: Record<string, string> = {
  NEW: "ระบุอะไหล่แล้ว",
  INSPECT_CONFIRM: "นัดร้านแล้ว",
  INSPECT_DISPATCH: "ส่งช่างตรวจแล้ว",
  INSPECTING: "ตรวจแล้ว",
  WAITING_PARTS: "อะไหล่เข้าแล้ว",
  PARTS_REQUESTED: "เบิกอะไหล่แล้ว",
  PARTS_PICKUP: "เบิกคลังอื่นแล้ว",
  PARTS_SOURCING: "เช็คอะไหล่แล้ว",
  AWAITING_QUOTE: "ส่งใบเสนอราคาแล้ว",
  AWAITING_PAYMENT: "ลูกค้าจ่ายแล้ว",
  PARTS_CHECKED: "จ่ายงานแล้ว",
  AWAITING_CONFIRM: "ลูกค้าคอนเฟิร์มแล้ว",
  ASSIGNED: "ปล่อยงานแล้ว",
  IN_PROGRESS: "ปิดงานแล้ว",
  CLAIM_REVIEW: "ตรวจเคลมแล้ว",
  DONE: "ปิดงานแล้ว",
};

/** ลำดับของขั้น ใช้ตัดสินว่าใบงานเดินหน้าหรือถอยหลัง */
export const WORK_ORDER_STAGE_ORDER = [
  "NEW",
  /**
   * ระบุอะไหล่ไม่ได้จนกว่าจะมีคนไปดู — ส่งทีมไปตรวจ แล้ววนกลับมาที่ NEW
   * พร้อมผลตรวจ ขั้นนี้จึงอยู่ถัดจาก NEW แต่ใบงานเดินย้อนกลับมาเสมอ
   * ใบที่ไม่ได้ตรวจ แถบขั้นตอนขึ้นว่าข้าม
   *
   * หัวหน้าภาคส่งตรวจพร้อมวัน → แอดมินคอนเฟิร์มวันกับร้าน → หัวหน้าภาคส่งช่างเข้าตรวจ
   * (เจ้าของงานกำหนด ต.ค. 69 รอบสอง — ลำดับเดียวกับงานซ่อม: PARTS_CHECKED → AWAITING_CONFIRM → ASSIGNED)
   * รอบแรกนัดแล้วถึงช่างเลย แต่ร้านมักขอเลื่อนวัน และวันใหม่ทีมเดิมอาจไม่ว่าง — หัวหน้าภาคถือคิวทีม
   * จึงต้องเป็นคนปล่อยงานให้ช่าง (เปลี่ยนทีมได้) · วันบังคับใส่ตั้งแต่ส่งตรวจ แอดมินจะได้มีวันไปคุยกับร้าน
   */
  "INSPECT_CONFIRM",
  "INSPECT_DISPATCH",
  "INSPECTING",
  /**
   * สองขั้นนี้มาก่อนเบิกอะไหล่ ไม่ใช่หลัง
   *
   * ผ่านเฉพาะงานที่ต้องขายอะไหล่ให้ลูกค้าแฟรนไชส์ — ดู needsCustomerQuote()
   * งานที่ไม่เข้าเงื่อนไขข้ามไปขั้นเบิกอะไหล่เลย และแถบขั้นตอนขึ้นว่าข้าม
   *
   * เก็บเงินให้จบก่อนของออกจากคลัง เพราะของที่เบิกออกไปแล้วเอากลับเข้าคลัง
   * ไม่ได้ง่าย ๆ ถ้าลูกค้าไม่ตกลงราคา — ใบเบิกถูกตัดไปแล้ว ของอยู่กับช่าง
   * และคนที่ต้องตามเก็บเงินคือคนที่ไม่ได้เป็นคนตัดสินใจเบิก
   *
   * PARTS_SOURCING (รอเบิกอะไหล่ — เจ้าของงานขอ ต.ค. 69) มาก่อนเสนอราคา: แอดมินเช็คว่ามีอะไหล่ไหมก่อน
   * ไม่งั้นลูกค้าจ่ายเงินไปแล้วต้องรอของ หรือราคาที่เสนอไม่ตรงกับของที่ได้จริง · มีครบผ่านทันที
   * หมดรอที่ขั้นนี้จนของเข้า · ขั้นเช็คคลังหลังรับเงิน (PARTS_REQUESTED) ยังเช็คซ้ำ เพราะระหว่างรอเงิน
   * ของอาจถูกงานอื่นใช้ไป
   */
  "PARTS_SOURCING",
  "AWAITING_QUOTE",
  "AWAITING_PAYMENT",
  /**
   * มีเฉพาะใบงานรออะไหล่ที่แยกออกมาจากใบอื่น — ของมาแล้วหัวหน้าภาคส่งต่อ
   * ให้แอดมินเบิก อยู่ก่อนขั้นเบิกเพราะเป็นการรอให้มีของให้เบิก
   */
  "WAITING_PARTS",
  // แอดมินเบิกอะไหล่ออกจากคลัง — ระบุคลังและเลขใบเบิกของแต่ละตัว
  "PARTS_REQUESTED",
  /**
   * ของอยู่คลังอื่นที่ไม่ใช่ลาดพร้าว 94 — หัวหน้าภาคเบิกเอง (เจ้าของงานกำหนด ต.ค. 69)
   *
   * แอดมินเช็คได้ทุกคลังแต่เบิกได้เฉพาะคลังลาดพร้าว 94 (ADMIN_WAREHOUSE) จึงบอกแค่ว่าของอยู่คลังไหน
   * พร้อมหมายเหตุ แล้วส่งต่อมาที่นี่ · หัวหน้าภาคเบิกเสร็จใส่เลขใบเบิก ไปขั้นจ่ายงานซึ่งเป็นของหัวหน้าภาคอยู่แล้ว
   * ใบที่ของอยู่คลัง 94 ทั้งหมดไม่ผ่านขั้นนี้ · แอดมินกดแทนไม่ได้ (ดู canActOnStage)
   */
  "PARTS_PICKUP",
  /**
   * หัวหน้าภาคจ่ายงาน+วันเข้างาน → แอดมินโทรคอนเฟิร์มลูกค้า → หัวหน้าภาคคอนเฟิร์มออกงาน
   * (เจ้าของงานกำหนดลำดับนี้ ต.ค. 69 — แทนแบบ "แอดมินนัดก่อนแล้วค่อยจ่ายงาน")
   *
   * หัวหน้าภาคถือคิวทั้งทีม จึงเป็นคนเลือกทั้งทีมและวัน แอดมินเป็นคนคุยกับร้าน
   * จึงเป็นคนโทรยืนยัน — ร้านขอเลื่อน แอดมินเปลี่ยนวันได้เลยไม่ต้องตีกลับ
   * แล้วหัวหน้าภาคกดปล่อยงานให้ช่างทุกครั้ง (เช็คว่าทีมยังว่างวันใหม่ หรือเปลี่ยนทีม)
   * ร้านต้องคอนเฟิร์มก่อนช่างเข้า — ไปถึงแล้วร้านปิดคือเสียทั้งวันของทั้งทีม
   *
   * ชื่อสถานะเดิมคงไว้ (ข้อมูลเก่าใช้อยู่) แต่ความหมายตามลำดับนี้:
   * PARTS_CHECKED = รอหัวหน้าภาคจ่ายงาน · AWAITING_CONFIRM = รอแอดมินคอนเฟิร์มลูกค้า
   * · ASSIGNED = รอหัวหน้าภาคคอนเฟิร์มออกงาน
   */
  "PARTS_CHECKED",
  "AWAITING_CONFIRM",
  "ASSIGNED",
  "IN_PROGRESS",
  /**
   * ช่างปิดงานแล้วแต่มีอะไหล่เก่าต้องส่งเคลม — Admin Spare Part ตรวจหลักฐานตามฟอร์มใบเคลมก่อน
   * (เจ้าของงานกำหนด ต.ค. 69) อนุมัติแล้วปิดงาน · ตีกลับแล้วกลับไปที่ช่าง
   * ใบที่ไม่มีเคลมข้ามขั้นนี้ไปปิดเลย
   */
  "CLAIM_REVIEW",
  "DONE",
] as const;

/**
 * ขั้นนี้รอใครทำ — ใช้กั้นสิทธิ์และใช้บอกบนหน้าจอว่าลูกบอลอยู่ที่ใคร
 *
 * แอดมินทำแทนได้ทุกขั้น เพราะงานด่วนรอหัวหน้าภาคว่างไม่ได้ แต่ระบบบันทึกไว้
 * ว่าใครเป็นคนกด ประวัติจึงยังบอกได้ว่าข้ามขั้นตอนปกติไปตอนไหน
 */
export const WORK_ORDER_STAGE_ACTOR: Record<string, string> = {
  NEW: "SUPERVISOR",
  // ทีมที่ไปตรวจเป็นคนบันทึกผล เพราะเป็นคนที่เห็นเครื่องจริง
  // นัดร้านก่อนไปตรวจ — งานโทรคุยกับร้านเป็นของแอดมิน เหมือนคอนเฟิร์มลูกค้าของงานซ่อม
  INSPECT_CONFIRM: "ADMIN",
  // ร้านตกลงวันแล้ว — หัวหน้าภาคเช็คว่าทีมยังว่างวันนั้นก่อนปล่อยให้ช่าง
  INSPECT_DISPATCH: "SUPERVISOR",
  INSPECTING: "EMPLOYEE",
  // ใบรออะไหล่หัวหน้าภาคเป็นคนดูแล — ตามของ แล้วส่งต่อเมื่อของมา
  WAITING_PARTS: "SUPERVISOR",
  PARTS_REQUESTED: "ADMIN",
  // ของอยู่คลังอื่น — หัวหน้าภาคเบิกเอง แอดมินไม่มีสิทธิ์เบิกคลังอื่น
  PARTS_PICKUP: "SUPERVISOR",
  // เช็ค/ตามอะไหล่ก่อนเสนอราคา — แอดมินดูคลังและเป็นคนเบิก (เจ้าของงานกำหนด: อยู่ใน "รอแอดมิน")
  PARTS_SOURCING: "ADMIN",
  // เสนอราคาและรับเงินเป็นงานออฟฟิศ แอดมินเป็นคนรู้ราคาและเป็นคนออกเอกสาร
  AWAITING_QUOTE: "ADMIN",
  AWAITING_PAYMENT: "ADMIN",
  // จ่ายงานพร้อมวัน — หัวหน้าภาคถือคิวทั้งทีม รู้ว่าทีมไหนว่างวันไหน
  PARTS_CHECKED: "SUPERVISOR",
  // โทรคอนเฟิร์ม/เลื่อนวันเป็นงานออฟฟิศ (เจ้าของงานกำหนด) — แอดมินเป็นคนคุยกับร้าน
  AWAITING_CONFIRM: "ADMIN",
  // ปล่อยงานให้ช่าง — วันอาจถูกเลื่อน หัวหน้าภาคเช็คทีมอีกรอบก่อนออกงาน
  ASSIGNED: "SUPERVISOR",
  IN_PROGRESS: "EMPLOYEE",
  // ตรวจเคลมเป็นหน้าที่ Admin Spare Part — role ถูกมองเป็น ADMIN แต่กดได้เฉพาะ partsAdmin/Super Admin
  // (ดู canReviewClaims) กล่องงานของแอดมินทั่วไปจึงไม่มีขั้นนี้
  CLAIM_REVIEW: "ADMIN",
};

/** สถานะที่ถือว่ายังทำงานอยู่ ใช้กันไม่ให้เปิดใบงานซ้ำกับเคสเดิม */
export const ACTIVE_WORK_ORDER_STATUSES = [
  "NEW",
  "INSPECT_CONFIRM",
  "INSPECT_DISPATCH",
  "INSPECTING",
  "WAITING_PARTS",
  "PARTS_REQUESTED",
  "PARTS_PICKUP",
  "PARTS_SOURCING",
  "AWAITING_QUOTE",
  "AWAITING_PAYMENT",
  "PARTS_CHECKED",
  "ASSIGNED",
  "AWAITING_CONFIRM",
  "IN_PROGRESS",
  "CLAIM_REVIEW",
] as const;

/**
 * สถานะนัดลูกค้า
 *
 * ADMIN_PICKED แยกจาก CONFIRMED เพราะเป็นแอดมินที่เลือกวันให้ ไม่ใช่ลูกค้าเลือก —
 * ถ้าไปถึงแล้วร้านไม่พร้อม คนที่ต้องตอบคือคนเลือกวัน ต้องย้อนดูได้ว่าเป็นใคร
 */
export const APPOINTMENT_STATUSES = ["PENDING", "CONFIRMED", "ADMIN_PICKED"] as const;
export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "รอลูกค้าคอนเฟิร์ม",
  CONFIRMED: "ลูกค้าคอนเฟิร์มแล้ว",
  ADMIN_PICKED: "แอดมินเลือกวันให้",
};

/**
 * ประเภทงาน
 *
 * เป็นตัวเลือกตายตัวไม่ใช่ข้อความอิสระ เพราะต้องเอาไปนับแยกในรายงานได้
 * ข้อความอิสระที่คนพิมพ์เองจะได้ "งานCM" "CM" "ซ่อม CM" ปนกันจนรวมยอดไม่ได้
 *
 * OTHER มีไว้สำหรับงานที่ไม่เข้าสามอย่างแรก และบังคับให้พิมพ์รายละเอียดกำกับ
 * ไม่งั้นจะกลายเป็นถังขยะที่มีงานครึ่งหนึ่งอยู่ในนั้นโดยไม่มีใครรู้ว่างานอะไร
 */
export const JOB_TYPES = ["CM", "PM", "IT", "INSPECT", "OTHER"] as const;
export type JobType = (typeof JOB_TYPES)[number];

/**
 * รวม PROJECT กับ PARTS_CLEARING ไว้ด้วย ทั้งที่เลือกใหม่ไม่ได้แล้ว
 *
 * ใบงานเก่าที่เปิดไว้ก่อนเปลี่ยนตัวเลือกยังถืออยู่สองค่านั้น ถ้าเอาออก
 * หน้าจอจะโชว์รหัสดิบ "PARTS_CLEARING" ให้คนอ่าน แทนที่จะเป็นชื่อที่อ่านรู้เรื่อง
 */
export const JOB_TYPE_LABELS: Record<string, string> = {
  CM: "งาน CM",
  PM: "งาน PM",
  IT: "งาน IT",
  INSPECT: "ตรวจสอบหน้างาน",
  OTHER: "อื่นๆ",
  PROJECT: "งาน Project",
  PARTS_CLEARING: "งานระบายอะไหล่",
};

export const JOB_TYPE_HINTS: Record<string, string> = {
  CM: "ซ่อมแก้เมื่อเครื่องเสีย",
  PM: "บำรุงรักษาตามรอบ",
  IT: "ระบบเครือข่าย ตู้เติมเงิน กล้อง หรืออุปกรณ์ไอทีในสาขา",
  INSPECT: "เข้าไปดูอาการก่อน ยังบอกไม่ได้ว่าต้องใช้อะไหล่อะไร",
  OTHER: "งานที่ไม่เข้าประเภทข้างบน — ต้องระบุรายละเอียด",
};

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
/**
 * ผลที่ "ปิดงาน" ได้จริง — งานที่จบแล้วเท่านั้น
 *
 * รออะไหล่กับยังไม่จบไม่ใช่การปิดงาน มันคือการส่งกลับไปให้หัวหน้าภาคตั้งต้นใหม่
 * ปล่อยให้ปิดด้วยผลพวกนั้นได้ ใบงานจะขึ้นว่า DONE ทั้งที่เครื่องยังเสีย
 * แล้วตัวเลขงานที่สำเร็จในรายงานจะสวยกว่าความจริง
 */
/**
 * เหตุที่ช่างปิดงานไม่ได้ ส่งกลับหัวหน้าภาค (เจ้าของงานขอ ต.ค. 69)
 *
 * เดิมปุ่มส่งกลับคิดไว้สำหรับเรื่องอะไหล่อย่างเดียว แต่ที่หน้างานปิดไม่ได้ด้วยเหตุอื่นบ่อยกว่า
 * (ร้านปิด หาสาเหตุไม่เจอ) — หมวดช่วยให้หัวหน้าภาคเห็นทันทีว่าต้องแก้เรื่องไหนโดยไม่ต้องอ่านทั้งย่อหน้า
 */
export const SEND_BACK_REASONS = ["PARTS", "INSPECT", "SHOP", "RESOURCES", "OTHER"] as const;
export const SEND_BACK_REASON_LABELS: Record<string, string> = {
  PARTS: "ต้องเปลี่ยนอะไหล่เพิ่ม / ไม่ตรง",
  INSPECT: "ต้องตรวจเพิ่ม ยังหาสาเหตุไม่เจอ",
  SHOP: "ร้านปิด / ลูกค้าไม่สะดวก",
  RESOURCES: "เครื่องมือ / คนไม่พอ",
  OTHER: "อื่น ๆ",
};

export const WORK_ORDER_RESULTS = ["FIXED", "NO_FAULT"] as const;

/**
 * ผลที่เลิกใช้แล้ว แต่ใบงานเก่าที่ปิดไปด้วยผลพวกนี้ยังมีอยู่
 *
 * เอาออกจากตัวเลือกเฉยๆ ไม่ได้ลบข้อมูล ใบเก่าจึงยังแสดงป้ายไทยได้ปกติ
 */
export const RETIRED_WORK_ORDER_RESULTS = ["PENDING_PARTS", "NEED_REVISIT"] as const;

export const WORK_ORDER_RESULT_LABELS: Record<string, string> = {
  FIXED: "ซ่อมเสร็จ",
  PENDING_PARTS: "รออะไหล่ ต้องกลับไปอีกรอบ",
  NEED_REVISIT: "ยังไม่จบ ต้องกลับไปอีกรอบ",
  NO_FAULT: "ไปถึงแล้วเครื่องปกติ",
  // ปุ่ม "ปิดงาน — เครื่องใช้งานได้แล้ว" ถูกเอาออกแล้ว (เจ้าของงานขอ ต.ค. 69) — คงป้ายไว้ให้ใบเก่าที่ปิดแบบนี้
  RECOVERED: "เครื่องใช้งานได้แล้ว (หัวหน้าภาคปิด ไม่ต้องเข้าหน้างาน)",
  // ไม่อยู่ใน WORK_ORDER_RESULTS — ช่างเลือกตอนปิดหน้างานไม่ได้ ได้มาจากปุ่มของหัวหน้าภาคเท่านั้น
  SUPERVISOR_CLOSED: "หัวหน้าภาคปิด · ไม่เข้าหน้างาน",
};

/**
 * เหตุผลที่หัวหน้าภาคปิดใบงานเองโดยไม่ส่งช่าง (เจ้าของงานขอ ต.ค. 69 รอบสอง)
 *
 * รอบแรก (RECOVERED) บังคับรูปและถูกขอให้เอาออก รอบนี้บังคับแค่เหตุผล + รายละเอียด
 * เลือกจากรายการให้รายงานนับแยกได้ — แก้ต้องแก้ใน SupervisorCloseModal.tsx ด้วย
 */
export const SUPERVISOR_CLOSE_REASONS: Record<string, string> = {
  // ช่างเข้าซ่อมเสร็จจริง แต่ไม่ได้ปิดในระบบ (เจ้าของงานขอ ต.ค. 69 · ทาง ก.) — ต่างจากข้ออื่นที่ไม่มีช่างเข้า:
  // ต้องบอกใครเข้า วันที่ อะไหล่ที่ใช้ รูปหลังซ่อม และใบนับเป็น "ซ่อมเสร็จ" (closeResult FIXED) ในรายงาน
  TECH_FIXED: "ช่างเข้าดำเนินการแก้ไขเรียบร้อย",
  SELF: "เครื่องกลับมาใช้งานได้เอง",
  PHONE: "แก้ไขทางโทรศัพท์ / แนะนำร้านแล้ว",
  OTHER_ORDER: "ซ่อมรวมกับใบงานอื่นแล้ว",
  SHOP_FIXED: "ร้านจัดการซ่อมเอง",
  OTHER: "อื่น ๆ",
};
/** รายละเอียดสั้นกว่านี้มักเป็น "ปกติแล้ว" ซึ่งไม่บอกว่าใครยืนยัน — คนอ่านย้อนหลังตามต่อไม่ได้ */
export const SUPERVISOR_CLOSE_MIN_NOTE = 10;


export const WORK_ORDER_ACTION_LABELS: Record<string, string> = {
  CREATED: "เปิดใบงาน",
  PARTS_REQUESTED: "ระบุอะไหล่ที่ต้องใช้",
  NO_PARTS: "ระบุว่าไม่ต้องใช้อะไหล่",
  PARTS_ROLLBACK: "ช่างแจ้งปัญหาหน้างาน",
  PARTS_CHECKED: "แอดมินเบิกอะไหล่",
  PARTS_SOURCED: "มีอะไหล่ — ส่งต่อเสนอราคา",
  PARTS_BACKORDERED: "อะไหล่หมด (ก่อนเสนอราคา)",
  PARTS_ETA_CHANGED: "เลื่อนวันคาดว่าอะไหล่เข้า",
  PICKUP_REQUESTED: "ส่งให้หัวหน้าภาคเบิกอะไหล่ (คลังอื่น)",
  PICKED_UP: "หัวหน้าภาคเบิกอะไหล่แล้ว",
  PICKUP_RETURNED: "หัวหน้าภาคเบิกไม่ได้ — ส่งกลับแอดมิน",
  STATUS_CHANGED: "เปลี่ยนสถานะ",
  QUOTED: "ส่งใบเสนอราคาให้ลูกค้า",
  QUOTE_SKIPPED: "ข้ามขั้นเสนอราคา",
  PAID: "ลูกค้าจ่ายเงินแล้ว",
  ASSIGNED: "จ่ายงานให้ช่าง",
  // ประวัติเก่าก่อน ต.ค. 69 — ลำดับปัจจุบันไม่มีขั้นนัดแยกแล้ว (วันมากับการจ่ายงาน)
  SCHEDULED: "นัดลูกค้า",
  CONFIRMED: "ลูกค้าคอนเฟิร์มนัด",
  RESCHEDULED: "ลูกค้าขอเลื่อนวัน",
  NEW_DATE_DECLINED: "ทีมไม่ว่างวันใหม่ — ส่งกลับแอดมินนัดใหม่",
  ARRIVED: "ช่างถึงหน้างาน",
  DISPATCHED: "ยืนยันออกงาน",
  INSPECT_REQUESTED: "ส่งทีมตรวจหน้างาน",
  INSPECTED: "บันทึกผลตรวจหน้างาน",
  ROLLED_BACK: "ย้อนขั้นตอน",
  SPLIT: "แยกใบงานรออะไหล่",
  TEST_COPY: "คัดลอกเป็นใบทดสอบ",
  SPLIT_FROM: "แยกมาจากใบงานอื่น",
  PARTS_ARRIVED: "อะไหล่มาแล้ว ส่งต่อให้เบิก",
  CLOSED: "ปิดงาน",
  CANCELLED: "ยกเลิกใบงาน",
  REOPENED: "เปิดงานใหม่",
  EDITED: "แก้ไขใบงาน",
  ATTACHED: "แนบไฟล์",
  ATTACHMENT_REMOVED: "ลบไฟล์แนบ",
  BACKFILLED: "ปิดงานย้อนหลัง (แอดมินกรอกแทน)",
  RECOVERED_CLOSED: "หัวหน้าภาคปิดงาน — เครื่องใช้งานได้แล้ว",
  SUPERVISOR_CLOSED: "หัวหน้าภาคปิดใบงาน",
  CLAIM_SUBMITTED: "ส่งเคลมอะไหล่เก่า",
  CLAIM_APPROVED: "อนุมัติเคลม · ปิดงาน",
  CLAIM_REJECTED: "ตีกลับเคลม — ให้ช่างแก้",
};

/**
 * แอดมินทำแทนขั้นของคนอื่นได้ไหม
 *
 * ได้ เพราะงานด่วนรอหัวหน้าภาคว่างไม่ได้ แต่ข้ามลำดับไม่ได้ — ต้องทำทีละขั้น
 * ไม่งั้นจะมีใบงานที่จ่ายให้ช่างทั้งที่ยังไม่มีใครเช็คว่ามีอะไหล่หรือเปล่า
 */
/**
 * ขั้นที่แอดมินกดแทนไม่ได้ — ปกติแอดมินทำแทนได้ทุกขั้นเพราะงานด่วนรอใครไม่ได้
 * แต่เบิกคลังอื่นเป็นเรื่องสิทธิ์ ไม่ใช่เรื่องความเร็ว (เจ้าของงานกำหนด ต.ค. 69)
 */
export const SUPERVISOR_ONLY_STAGES: readonly string[] = ["PARTS_PICKUP"];

export function canActOnStage(role: string, stage: string) {
  if (role === "ADMIN") return !SUPERVISOR_ONLY_STAGES.includes(stage);
  return WORK_ORDER_STAGE_ACTOR[stage] === role;
}

/**
 * รุ่นเครื่องที่มีใช้อยู่
 *
 * เป็นตัวเลือกตายตัวเพราะต้องเอาไปนับแยกได้ว่ารุ่นไหนเสียบ่อย และเวลาสั่งอะไหล่
 * ต้องรู้ว่ารุ่นอะไร — ปล่อยให้พิมพ์เองจะได้ "Huebsch" "huebsch" "ฮิวบช์"
 * ปนกันจนรวมยอดไม่ได้ เหมือนที่เคยเจอกับประเภทงาน
 *
 * OTHER มีไว้สำหรับรุ่นที่ยังไม่อยู่ในรายการ และบังคับให้พิมพ์ชื่อกำกับ
 */
export const MACHINE_MODELS = [
  "Oasis",
  "Oasis(TC)",
  "Huebsch",
  "Haier",
  "Maytag",
] as const;

/** ค่าที่ส่งมาแทน "อื่นๆ" — ของจริงคือข้อความที่คนพิมพ์เอง */
export const MACHINE_MODEL_OTHER = "OTHER";

/**
 * ขนาดเครื่องที่มีใช้อยู่ หน่วยกิโลกรัม
 *
 * เป็นตัวเลือกให้กดเพราะเร็วกว่าพิมพ์ และคนกรอกอยู่หน้างานถือมือถือข้างเดียว
 * แต่ไม่ได้ปิดทางพิมพ์เอง — ต่างจากรุ่นที่ต้องคุมคำให้ตรงกันเพื่อรวมยอด
 * ขนาดเป็นตัวเลขอยู่แล้ว เลข 17 ที่ไม่อยู่ในรายการก็ยังนับรวมกับเลข 17 อื่นได้
 *
 * ใช้รายการเดียวกันทั้งเครื่องซักและเครื่องอบ ไม่ได้แยกตามชนิด เพราะที่หน้างาน
 * คนอ่านเลขจากป้ายบนตัวเครื่อง ไม่ได้เลือกจากสเปกที่ควรจะเป็น
 */
export const MACHINE_CAPACITIES_KG = [10, 13, 15, 18, 20, 25] as const;

/** ขอบเขตที่รับได้ — กันพิมพ์พลาดอย่าง 100 หรือ 0 ไม่ได้อ้างสเปกจริงของรุ่นไหน */
export const MACHINE_CAPACITY_MIN_KG = 5;
export const MACHINE_CAPACITY_MAX_KG = 60;

/** "13 kg" — หน่วยอยู่ตรงนี้ที่เดียว ฐานข้อมูลเก็บแต่ตัวเลข */
export function formatCapacity(kg: number | null | undefined): string | null {
  return typeof kg === "number" ? `${kg} kg` : null;
}

/**
 * หมายเลขเครื่อง — W หรือ D ตามด้วยตัวเลข
 *
 * W = เครื่องซัก · D = เครื่องอบ ตัวอักษรหน้าจึงบอกชนิดเครื่องได้ในตัว
 * ไม่ต้องให้คนเลือกซ้ำอีกช่อง
 */
const MACHINE_CODE_PATTERN = /^[WD]\d{1,4}$/;

export function normaliseMachineCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidMachineCode(raw: string): boolean {
  return MACHINE_CODE_PATTERN.test(normaliseMachineCode(raw));
}

/** ชนิดเครื่องจากตัวอักษรหน้าของรหัส ใช้ตอนต้องสร้างเครื่องที่ยังไม่มีในระบบ */
export function machineTypeFromCode(raw: string): "WASHER" | "DRYER" | null {
  const code = normaliseMachineCode(raw);
  if (!isValidMachineCode(code)) return null;
  return code.startsWith("W") ? "WASHER" : "DRYER";
}

/**
 * สาขาบริษัทหรือสาขาแฟรนไชส์ ดูจากรหัสสาขา
 *
 * รหัสขึ้นต้นด้วย C คือสาขาบริษัท เครื่องเป็นของบริษัทเอง จึงไม่มีเรื่องประกัน
 * ให้พูดถึง — ต่างจากสาขาแฟรนไชส์ที่ต้องดูว่าหมดประกันหรือยังก่อนตัดสินใจว่า
 * จะส่งช่างของเราไปหรือให้ผู้ขายรับผิดชอบ
 *
 * ใช้รหัสสาขาไม่ใช่ช่อง ownership เพราะรหัสคือสิ่งที่คนในบริษัทใช้แยกกันจริง
 * ส่วน ownership มาจากไฟล์ CRM ซึ่งบางแถวว่าง
 */
export function isCompanyBranch(branchCode: string): boolean {
  return branchCode.trim().toUpperCase().startsWith("C");
}

/**
 * ประกันเครื่องนับจากวันเปิดร้าน อายุขึ้นกับยี่ห้อเครื่อง (เจ้าของงานกำหนด ต.ค. 69)
 * Oasis และ Oasis(TC) 2 ปี · Huebsch 3 ปี · ยี่ห้ออื่นหรือไม่รู้ยี่ห้อ 3 ปีตามกฎเดิม
 *
 * คิดเอาจากวันเปิดร้านแทนที่จะให้กรอกทีละสาขา — ทะเบียนจริงมีวันเปิดร้านครบทั้ง 1,204 สาขา
 * แต่ไม่มีวันหมดประกันสักสาขาเดียว ถ้ารอให้กรอก ช่องนี้จะว่างตลอดไปและขั้นเสนอราคาจะเดาผิดทั้งระบบ
 *
 * จับยี่ห้อแบบมีคำนี้อยู่ ไม่สนตัวพิมพ์ เพราะไฟล์รายงานเครื่องเขียนได้หลายแบบ (OASIS, Oasis, HB - Huebsch)
 */
export const WARRANTY_YEARS = 3;
const WARRANTY_YEARS_BY_BRAND: { match: RegExp; years: number }[] = [
  { match: /oasis/i, years: 2 },
  { match: /huebsch/i, years: 3 },
];

/**
 * ยี่ห้อที่ใช้คิดประกันของเครื่องหนึ่ง — ยี่ห้อจากไฟล์รายงานเครื่องก่อน ว่างแล้วใช้ "รุ่นของเครื่อง"
 *
 * ไฟล์รายงานเครื่องส่วนใหญ่ไม่มีคอลัมน์ machine_brand ช่อง brand จึงว่างแทบทั้งระบบ
 * ส่วนปุ่ม "รุ่นของเครื่อง" ในฟอร์มเปิดใบงาน (Oasis · Oasis(TC) · Huebsch · Haier · Maytag)
 * ที่จริงคือชื่อยี่ห้อ และจำไว้ที่ตัวเครื่องแล้ว — ถ้าไม่ใช้ตัวนี้ กฎประกันตามยี่ห้อจะไม่มีผลกับเครื่องจริงเลย
 */
export function machineMake(m: { brand?: string | null; model?: string | null } | null | undefined): string | null {
  return m?.brand?.trim() || m?.model?.trim() || null;
}

export function warrantyYearsFor(brand: string | null | undefined): number {
  if (brand) for (const r of WARRANTY_YEARS_BY_BRAND) if (r.match.test(brand)) return r.years;
  return WARRANTY_YEARS;
}

/**
 * วันหมดประกัน — วันเปิดร้าน + จำนวนปีตามยี่ห้อ เว้นแต่มีคนกรอกวันเฉพาะของสาขาไว้
 *
 * ค่าที่กรอกเองชนะกฎ เพราะสัญญาบางฉบับต่างออกไป และคนที่ตั้งใจกรอก
 * วันที่เจาะจงย่อมมีเอกสารอยู่ในมือ — แต่ไม่ใช่สิ่งที่ต้องทำเป็นปกติ
 */
export function warrantyEndFor(
  openedAt: Date | null | undefined,
  explicit?: Date | null,
  brand?: string | null
): Date | null {
  if (explicit) return explicit;
  if (!openedAt) return null;
  const end = new Date(openedAt.getTime());
  end.setFullYear(end.getFullYear() + warrantyYearsFor(brand));
  return end;
}

/** หมดประกันหรือยัง — ว่าง = ไม่รู้ ต่างจาก false ที่แปลว่ายังไม่หมด */
export function isWarrantyExpired(
  warrantyExpiresAt: Date | null | undefined,
  now = new Date()
): boolean | null {
  if (!warrantyExpiresAt) return null;
  return warrantyExpiresAt.getTime() < now.getTime();
}

/**
 * ป้ายประกันในรายการ (ติดตามเครื่องเสีย · ใบงานซ่อม) — เจ้าของงานขอ ต.ค. 69 ให้เห็นตั้งแต่ในรายการ
 * ว่าเครื่องไหนยังอยู่ในประกัน ไม่ต้องเปิดใบงานทีละใบ
 *
 * SOON = ยังในประกันแต่เหลือไม่ถึง 60 วัน — ซ่อม/เคลมช้าไปไม่กี่สัปดาห์คือค่าอะไหล่ที่ลูกค้าต้องจ่ายเอง
 * UNKNOWN = ไม่รู้วันเปิดร้าน (กฎเสนอราคาถือว่าหมดประกันไว้ก่อน แต่ป้ายบอกตรง ๆ ว่าไม่รู้ ให้ไปเติมวัน)
 * null = สาขาบริษัท ไม่มีประกันให้พูดถึง
 */
export const WARRANTY_SOON_DAYS = 60;
export type WarrantyState = "IN" | "SOON" | "OUT" | "UNKNOWN";
export function warrantyStatus(opts: {
  branchCode: string;
  openedAt: Date | null | undefined;
  warrantyExpiresAt: Date | null | undefined;
  machineBrand: string | null | undefined;
  now?: Date;
}): { state: WarrantyState | null; endsAt: Date | null } {
  if (isCompanyBranch(opts.branchCode)) return { state: null, endsAt: null };
  const end = warrantyEndFor(opts.openedAt, opts.warrantyExpiresAt, opts.machineBrand);
  if (!end) return { state: "UNKNOWN", endsAt: null };
  const left = end.getTime() - (opts.now ?? new Date()).getTime();
  return { state: left < 0 ? "OUT" : left <= WARRANTY_SOON_DAYS * 86_400_000 ? "SOON" : "IN", endsAt: end };
}

/** รหัสที่คนอ่าน ตั้งจาก id จึงไม่มีทางชนกันและไม่ต้องนับแถวก่อน */
/**
 * ใบงานนี้ต้องเสนอราคาลูกค้าก่อนไหม
 *
 * อะไหล่ที่ใส่ให้สาขาแฟรนไชส์ที่หมดประกันแล้ว เป็นของที่ขายให้ลูกค้า ไม่ใช่ของแถม
 * ต้องเสนอราคาและเก็บเงินก่อนส่งช่างไป ไม่งั้นของออกจากคลังไปแล้วค่อยมาตามเก็บเงิน
 * ซึ่งเป็นตอนที่ตามยากที่สุด
 *
 * สามเงื่อนไขพร้อมกัน — สาขาบริษัท (รหัส C) ไม่ต้องเพราะเครื่องเป็นของบริษัทเอง
 * งานที่ไม่ใช้อะไหล่ไม่มีอะไรให้ขาย และของในประกันผู้ขายรับผิดชอบอยู่แล้ว
 *
 * วันหมดประกันคิดจากวันเปิดร้าน + ปีตามยี่ห้อเครื่อง จึงตอบได้เกือบทุกสาขา เหลือที่ตอบไม่ได้
 * เฉพาะสาขาที่ไม่รู้แม้แต่วันเปิดร้าน ซึ่งถือว่าหมดประกันแล้วไว้ก่อน — ตีว่า
 * "ยังอยู่ในประกัน" แล้วส่งช่างไปใส่อะไหล่ฟรี เสียหายกว่าการถามราคาเกินจำเป็น
 * และแอดมินข้ามขั้นนี้ได้ถ้าที่จริงอยู่ในประกัน
 */
export function needsCustomerQuote(opts: {
  branchCode: string;
  needsParts: boolean | null;
  openedAt?: Date | null;
  warrantyExpiresAt: Date | null;
  /** ยี่ห้อเครื่องของใบงาน — Oasis ประกันสั้นกว่ายี่ห้ออื่น */
  machineBrand?: string | null;
  now?: Date;
}): boolean {
  if (isCompanyBranch(opts.branchCode)) return false;
  if (opts.needsParts !== true) return false;
  const end = warrantyEndFor(opts.openedAt, opts.warrantyExpiresAt, opts.machineBrand);
  return isWarrantyExpired(end, opts.now) !== false;
}

/** partCode ของอะไหล่นอกสโตร์ (ไม่มี SKU) — ดู resolveOffParts ใน routes/workOrders.ts */
export const OFF_CATALOG_PREFIX = "[นอกสโตร์] ";

export function workOrderCode(id: number): string {
  return `WO-${String(id).padStart(5, "0")}`;
}

// ── ไฟล์แนบใบงาน ────────────────────────────────────────

export const ATTACHMENT_KINDS = ["IMAGE", "VIDEO", "DOCUMENT"] as const;

/**
 * บทบาทของไฟล์แนบ — ว่างคือรูปหน้างานทั่วไป
 *
 * NAMEPLATE คือรูปป้ายรุ่นบนตัวเครื่อง ซึ่งเป็นที่มาของรุ่นที่กรอกไว้
 * REQUISITION คือรูปใบเบิกอะไหล่ (ใบเหลือง) ที่ช่างถ่ายหลังเปลี่ยนเสร็จ
 *
 * ทั้งสองอย่างไม่ใช่หลักฐานของอาการ จึงต้องแยกให้หาเจอ ไม่ใช่ปนอยู่ในกองรูปหน้างาน
 */
/** ไฟล์ตรวจหน้างาน ลำดับตามที่หน้าจอวางกรอบ — INSPECT_VIDEO รับเฉพาะวิดีโอ ที่เหลือรับเฉพาะรูป */
export const INSPECTION_ROLES = ["INSPECT_SITE", "INSPECT_PART", "INSPECT_VIDEO"] as const;

export const ATTACHMENT_ROLES = [
  // รูป/วิดีโอก่อนซ่อมกับหลังซ่อม — ปิดงานบังคับอย่างละอย่างน้อยหนึ่ง (เจ้าของงานขอ ต.ค. 69)
  // แยกออกจากรูปหน้างานทั่วไป เพื่อให้ใบที่ปิดแล้ววางคู่กันเทียบได้ว่าเจออะไรและทำอะไรไป
  "BEFORE",
  "AFTER",
  // ไฟล์ตรวจหน้างาน — ส่งผลตรวจต้องครบสามอย่าง (เจ้าของงานขอ ต.ค. 69) เพราะหัวหน้าภาค
  // ระบุอะไหล่จากตรงนี้โดยไม่ได้เห็นเครื่องเอง คำบรรยายอย่างเดียวพาสั่งอะไหล่ผิดตัว
  ...INSPECTION_ROLES,
  "NAMEPLATE",
  "REQUISITION",
  "QUOTE",
  "RECEIPT",
  ...(["CLAIM_PART", "CLAIM_SYMPTOM", "CLAIM_ERROR_VIDEO", "CLAIM_CHECK_VIDEO"] as const),
  // รูปยืนยันเครื่องใช้งานได้ ของปุ่มหัวหน้าภาคปิดเองที่เอาออกแล้ว — คงไว้ให้ไฟล์ของใบเก่าแสดงป้ายได้
  "RECOVERY",
] as const;

/**
 * หลักฐานเคลมอะไหล่ตามฟอร์ม "เอกสารใบเคลมอะไหล่" (ข้อ 1–3) — ผูกกับอะไหล่ทีละชิ้นผ่าน sparePartId ของไฟล์แนบ
 * รูป Nameplate ใช้รูปป้ายรุ่นที่ปิดงานบังคับถ่ายอยู่แล้ว จึงไม่อยู่ในรายการนี้
 */
export const CLAIM_EVIDENCE_ROLES = ["CLAIM_PART", "CLAIM_SYMPTOM", "CLAIM_ERROR_VIDEO", "CLAIM_CHECK_VIDEO"] as const;

/**
 * Troubleshooting ข้อ 4 ของฟอร์ม — บังคับเฉพาะเครื่อง Huebsch หรือ Primus
 *
 * ⚠ รายการนี้เป็นตัวอย่างไว้ก่อน (เจ้าของงานยังไม่ได้ส่งรายการจริงของผู้ผลิตมา)
 * ได้รายการจริงแล้วแก้ที่นี่ที่เดียว — หน้าจอดึงจากเซิร์ฟเวอร์ ไม่ได้เขียนรายการซ้ำ
 */
export const CLAIM_TROUBLESHOOTING: { match: RegExp; brand: string; items: string[] }[] = [
  {
    match: /huebsch/i,
    brand: "Huebsch",
    items: [
      "เช็ค Error code บนหน้าจอและบันทึกรหัส",
      "วัดแรงดันไฟเข้าเครื่อง / เข้าชิ้นส่วนที่สงสัย",
      "เช็คสายไฟและขั้วต่อของชิ้นส่วนนี้",
      "ทดสอบการทำงานของชิ้นส่วนตามคู่มือ",
      "เปลี่ยนแล้วทดสอบเดินเครื่องครบรอบ",
    ],
  },
  {
    match: /primus/i,
    brand: "Primus",
    items: [
      "เช็ค Error code บนหน้าจอและบันทึกรหัส",
      "วัดแรงดันไฟเข้าเครื่อง / เข้าชิ้นส่วนที่สงสัย",
      "เช็คสายไฟและขั้วต่อของชิ้นส่วนนี้",
      "ทดสอบการทำงานของชิ้นส่วนตามคู่มือ",
      "เปลี่ยนแล้วทดสอบเดินเครื่องครบรอบ",
    ],
  },
];

export function claimTroubleshootingFor(make: string | null | undefined) {
  return make ? CLAIM_TROUBLESHOOTING.find((t) => t.match.test(make)) ?? null : null;
}

export const ATTACHMENT_ROLE_LABELS: Record<string, string> = {
  BEFORE: "ก่อนซ่อม",
  AFTER: "หลังซ่อม",
  INSPECT_SITE: "รูปหน้างาน (ตรวจ)",
  INSPECT_PART: "รูปอะไหล่ที่เสีย",
  INSPECT_VIDEO: "วิดีโอการทำงาน",
  NAMEPLATE: "ป้ายรุ่น",
  REQUISITION: "ใบเหลือง",
  QUOTE: "ใบเสนอราคา",
  RECEIPT: "บิลที่จ่ายแล้ว",
  CLAIM_PART: "รูปอะไหล่เก่า (เคลม)",
  CLAIM_SYMPTOM: "รูปอาการเสีย (เคลม)",
  CLAIM_ERROR_VIDEO: "วิดีโอ Error code (เคลม)",
  CLAIM_CHECK_VIDEO: "วิดีโอการตรวจเช็ค (เคลม)",
  RECOVERY: "เครื่องใช้งานได้แล้ว",
};

export const ATTACHMENT_KIND_LABELS: Record<string, string> = {
  IMAGE: "รูป",
  VIDEO: "วิดีโอ",
  DOCUMENT: "เอกสาร PDF",
};

/**
 * ชนิดไฟล์ที่รับ
 *
 * heic คือรูปจาก iPhone ที่ยังไม่ได้แปลง ต้องรับไว้ด้วยเพราะช่างครึ่งหนึ่งใช้ iPhone
 * ส่วน quicktime (.mov) คือวิดีโอจาก iPhone เช่นกัน
 */
export const ATTACHMENT_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export const ATTACHMENT_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

/**
 * PDF รับเฉพาะเอกสารที่ออกจากโปรแกรมบัญชี (ใบเสนอราคา บิล) — ไฟล์พวกนี้เป็น PDF
 * อยู่แล้ว การบังคับให้แคปหน้าจอเป็นรูปก่อนแนบทำให้ตัวเลขเบลอและเสียเวลาแอดมิน
 * รูปหน้างานยังรับแค่รูปกับวิดีโอ เพราะ PDF ในกองรูปหน้างานเปิดดูเร็ว ๆ ไม่ได้
 */
export const ATTACHMENT_DOCUMENT_TYPES = ["application/pdf"];
export const ATTACHMENT_DOCUMENT_ROLES = ["QUOTE", "RECEIPT"];

/**
 * เพดานขนาดไฟล์
 *
 * รูปตั้งไว้ 10 MB ทั้งที่แอปย่อให้เหลือหลักแสนไบต์ก่อนส่งอยู่แล้ว เผื่อไว้
 * เฉพาะกรณีที่การย่อไม่ทำงาน (เช่นเปิดจากเว็บบนเครื่องที่ไม่รองรับ)
 * ไม่ใช่ขนาดที่ตั้งใจให้ใช้จริง
 *
 * วิดีโอตั้งไว้ 60 MB ≈ คลิป 1080p ประมาณหนึ่งนาที ซึ่งพอสำหรับ "ถ่ายให้ดูว่า
 * เครื่องมันดังแบบนี้" คลิปที่ยาวกว่านั้นไม่ได้ช่วยให้ใครเข้าใจอาการมากขึ้น
 * แต่ค่าที่เก็บเพิ่มขึ้นตามความยาวตรง ๆ
 */
export const MAX_ATTACHMENT_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_VIDEO_BYTES = 60 * 1024 * 1024;
/** ใบเสนอราคาจากโปรแกรมบัญชีหน้าละไม่กี่ร้อย KB — 15 MB เผื่อไฟล์สแกนหลายหน้า */
export const MAX_ATTACHMENT_DOCUMENT_BYTES = 15 * 1024 * 1024;

/** รูปย่อที่แอปส่งมาพร้อมไฟล์ ถ้าใหญ่กว่านี้แปลว่าแอปส่งรูปเต็มมาผิดช่อง */
export const MAX_ATTACHMENT_THUMBNAIL_BYTES = 200 * 1024;

/** กี่ไฟล์ต่อใบงาน — กันคนเผลออัปทั้งอัลบั้ม ไม่ได้กันการใช้งานปกติ */
export const MAX_ATTACHMENTS_PER_WORK_ORDER = 20;

export function attachmentKindFor(mimeType: string): "IMAGE" | "VIDEO" | "DOCUMENT" | null {
  const type = mimeType.split(";")[0].trim().toLowerCase();
  if (ATTACHMENT_IMAGE_TYPES.includes(type)) return "IMAGE";
  if (ATTACHMENT_VIDEO_TYPES.includes(type)) return "VIDEO";
  if (ATTACHMENT_DOCUMENT_TYPES.includes(type)) return "DOCUMENT";
  return null;
}

/**
 * ── ลงทะเบียนใช้รถ (ยกมาจาก OTTERI FLEET) ──
 *
 * ค่าเดียวกับที่ FLEET ใช้ ตามที่เจ้าของงานยืนยัน — ตั้งเป็นค่าคงที่ไว้ในโค้ด
 * ไม่ได้ทำหน้าตั้งค่า เพราะเปลี่ยนนาน ๆ ครั้ง และค่าที่แอดมินเผลอตั้งเป็น 0
 * คือการปิดการตรวจทั้งระบบโดยไม่มีใครรู้
 */
export const VEHICLE_RULES = {
  /** รูปรอบคันขั้นต่ำ ทั้งตอนเบิกและตอนคืน */
  MIN_PHOTOS: 5,
  MAX_PHOTOS: 20,
  /** เลขไมล์ต่างจากล่าสุด / วิ่งต่อรอบ ได้ไม่เกิน (กม.) */
  MAX_MILEAGE_DIFF: 1000,
  /** รอบน้ำมันเครื่องมาตรฐาน — รถคันไหนต่างไปตั้งเป็นรายคันได้ */
  OIL_EVERY_KM: 10000,
  OIL_EVERY_MONTHS: 6,
  /** เตือนล่วงหน้าเมื่อเหลือไม่ถึงเท่านี้ */
  SOON_KM: 1000,
  SOON_DAYS: 30,
  /** รูปที่อัปไว้แต่ยังไม่ได้ผูกกับรายการ ใช้ได้ภายในเวลานี้ (เท่ากับ FLEET) */
  UPLOAD_TTL_HOURS: 6,
} as const;

/** ช่องรูปรอบคัน — ห้าช่องแรกตรงกับ MIN_PHOTOS */
export const VEHICLE_PHOTO_LABELS = ["ด้านหน้า", "ด้านหลัง", "ด้านซ้าย", "ด้านขวา", "หน้าปัดเลขไมล์"];

/**
 * ไปทำอะไร — ตัวเลือกของงานช่าง (FLEET เดิมเป็นงานร้านซักผ้า เช่น ส่งผ้าลูกค้า)
 * พิมพ์เองได้ถ้าไม่เข้าข้อไหน
 */
export const VEHICLE_PURPOSES = ["เข้าซ่อมสาขา", "ตรวจหน้างาน", "ส่ง/รับอะไหล่", "ติดต่องาน", "เติมน้ำมัน/ซ่อมรถ"];

export const VEHICLE_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "ว่าง",
  IN_USE: "กำลังใช้งาน",
  MAINTENANCE: "ซ่อมบำรุง",
  INACTIVE: "เลิกใช้งาน",
};

export const VEHICLE_MAINT_TYPES: Record<string, string> = {
  OIL: "เปลี่ยนน้ำมันเครื่อง",
  REPAIR: "ซ่อม",
  CHECK: "ตรวจเช็คตามระยะ",
  TAX: "ต่อภาษี / พ.ร.บ. / ประกัน",
  // มาจากช่องแจ้งซ่อมตอนคืนรถเท่านั้น แอดมินเลือกเองไม่ได้
  REPORT: "ช่างแจ้งซ่อม",
};

export const VEHICLE_DOC_KINDS: Record<string, string> = {
  BOOK: "หน้าเล่มทะเบียน",
  ACT: "พ.ร.บ.",
  INS: "กรมธรรม์ประกันภัย",
  TAX: "ป้ายภาษี",
};

/** "yyyy-MM-dd" ของวันนี้ตามเวลาไทย — วันของงานรถนับตามวันที่คนในไทยใช้ ไม่ใช่ UTC */
export function bangkokDay(at: Date = new Date()): string {
  return new Date(at.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}
/** ช่วงเวลาของวันหนึ่งตามเวลาไทย [เริ่ม, เริ่มของวันถัดไป) */
export function bangkokDayRange(day: string): { from: Date; to: Date } {
  const from = new Date(`${day}T00:00:00+07:00`);
  return { from, to: new Date(from.getTime() + 86_400_000) };
}
