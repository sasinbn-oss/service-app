/**
 * ขอบเขตของ Area Team (Area · Supervisor (COCO)) — เจ้าของงานกำหนด ต.ค. 69
 *
 * ทีมฝั่งสาขา COCO แจ้งและเปิดใบงานได้ ดูความคืบหน้าได้ แต่ไม่ได้ทำขั้นตอนของใคร
 * เห็นเฉพาะสาขาบริษัท (COCO) — สาขาแฟรนไชส์และงานของสาขาอื่นไม่ขึ้นเลย:
 * - Area เห็นสาขา COCO ทั้งบริษัท ไม่ใช่เฉพาะของลูกทีมตัวเอง (ตอบตัวอย่างรอบ 2)
 * - Supervisor (COCO) เห็นเฉพาะสาขาที่ตัวเองดูแล (Branch.cocoSupervisorId จากไฟล์ Area Team)
 *
 * แยกจากขอบเขตหัวหน้าภาค (supervisorScope.ts) เพราะคนละแกน — หัวหน้าภาคแบ่งตามทีมช่าง/ภาค
 * ส่วนทีม COCO แบ่งตามสาขา ทีมช่างที่รับงานเปลี่ยนไปก็ไม่ทำให้ Supervisor (COCO) มองไม่เห็นสาขาตัวเอง
 */
import { Prisma } from "@prisma/client";
import { AREA_TEAM_ROLES } from "./constants";

type Auth = { userId: number; role: string } | undefined;

export function isAreaTeam(auth: Auth): boolean {
  return !!auth && AREA_TEAM_ROLES.includes(auth.role);
}

/**
 * สาขาบริษัทดูจากรหัสขึ้นต้นด้วย C แบบเดียวกับ isCompanyBranch() — ช่อง ownership มาจาก CRM
 * ซึ่งบางแถวว่าง ใช้ช่องนั้นจะทำให้สาขา COCO ที่ไฟล์ไม่ได้กรอกหายไปจากสายตา Area
 */
const COCO_BRANCH: Prisma.BranchWhereInput = { code: { startsWith: "C", mode: "insensitive" } };

/** สาขาที่คนนี้เห็น — ใช้กับทุกหน้าที่แสดงสาขา (แผนงาน · ติดตามเครื่องเสีย · ผังผู้รับผิดชอบ · ฟอร์มเปิดใบงาน) */
export function areaBranchWhere(auth: { userId: number; role: string }): Prisma.BranchWhereInput {
  if (auth.role === "AREA") return COCO_BRANCH;
  return { AND: [COCO_BRANCH, { cocoSupervisorId: auth.userId }] };
}

/**
 * ใบงานที่คนนี้เห็น = ใบของสาขาที่เห็น + ใบที่ตัวเองเปิด
 * ใบที่ตัวเองเปิดต้องไม่หายไปตอนสาขาถูกย้ายไปให้ Supervisor คนอื่นในไฟล์รอบหลัง
 */
export function areaWorkOrderWhere(auth: { userId: number; role: string }): Prisma.WorkOrderWhereInput {
  return { OR: [{ branch: areaBranchWhere(auth) }, { createdById: auth.userId }] };
}

/** สาขานี้อยู่ในขอบเขตไหม — สำหรับเช็คทีละสาขา (เปิดใบงาน · เปิดดูใบงาน) โดยไม่ต้องถามฐานข้อมูลซ้ำ */
export function areaCoversBranch(
  auth: { userId: number; role: string },
  branch: { code: string; cocoSupervisorId: number | null }
): boolean {
  if (!/^c/i.test(branch.code)) return false;
  return auth.role === "AREA" || branch.cocoSupervisorId === auth.userId;
}

export const AREA_OUT_OF_SCOPE = "สาขานี้ไม่อยู่ในความดูแลของคุณ";

/**
 * สิ่งที่ Area Team เรียกได้ — นอกจากนี้ตอบ 403 ทั้งหมด (requireAuth)
 *
 * เป็นรายการอนุญาต ไม่ใช่รายการห้าม รวมถึงการอ่าน เพราะตำแหน่งนี้เห็นเพียง 6 เมนู
 * API อ่านอื่น ๆ (รายชื่อผู้ใช้ ทะเบียนรถ อะไหล่ ราคา) ไม่ได้กรองตามสาขา ถ้าปล่อยไว้
 * คนที่ยิง API ตรง ๆ จะเห็นข้อมูลทั้งบริษัท · ทุก GET ที่อยู่ในรายการต้องกรองตาม areaWorkOrderWhere/areaBranchWhere เอง
 */
export const AREA_TEAM_ALLOWED: RegExp[] = [
  /^GET \/api\/auth\/me$/,
  /^POST \/api\/auth\/(change-password|view-as\/stop)$/,
  // ใบงานซ่อม · กล่องงานของฉัน · รายละเอียดใบงาน
  /^GET \/api\/work-orders\/?$/,
  /^GET \/api\/work-orders\/(version|inbox-count|options)$/,
  /^GET \/api\/work-orders\/\d+(\/(version|attachments|attachments\/\d+\/link))?$/,
  // รายงาน — ปุ่มเดียว
  /^GET \/api\/work-orders\/reports\/area-team$/,
  // เปิดใบงาน + แนบรูปหน้างาน (แนบได้เฉพาะใบที่ตัวเองเปิด — เช็คใน route)
  /^POST \/api\/work-orders\/?$/,
  /^POST \/api\/work-orders\/\d+\/attachments$/,
  // ฟอร์มเปิดใบงาน: ค้นหาสาขา · เครื่องของสาขา · ใบที่ค้างอยู่ · ผู้ติดต่อล่าสุด
  /^GET \/api\/branches\/?$/,
  /^GET \/api\/branches\/[^/]+\/(machines|open-work-orders|last-contact)$/,
  // แผนงาน (ดูอย่างเดียว)
  /^GET \/api\/plans\/(day|month|pending)$/,
  // ติดตามเครื่องเสีย
  /^GET \/api\/machines\/(outages|signal-lost|overview|work-statuses)$/,
  // ผังผู้รับผิดชอบ
  /^GET \/api\/teams\/coverage-map$/,
];
