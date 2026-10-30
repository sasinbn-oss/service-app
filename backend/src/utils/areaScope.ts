/**
 * ขอบเขตของ Area Team (Area · Supervisor (COCO) · Maid (COCO)) — เจ้าของงานกำหนด ต.ค. 69
 *
 * ทีมฝั่งสาขา COCO แจ้งและเปิดใบงานได้ ดูความคืบหน้าได้ แต่ไม่ได้ทำขั้นตอนของใคร
 * เห็นเฉพาะสาขาบริษัท (COCO) — สาขาแฟรนไชส์และงานของสาขาอื่นไม่ขึ้นเลย:
 * - Area เห็นสาขา COCO ทั้งบริษัท ไม่ใช่เฉพาะของลูกทีมตัวเอง (ตอบตัวอย่างรอบ 2)
 * - Supervisor (COCO) เห็นเฉพาะสาขาที่ตัวเองดูแล (Branch.cocoSupervisorId จากไฟล์ Area Team)
 * - Maid (COCO) สิทธิ์เท่า Supervisor (COCO) แต่เห็นเฉพาะสาขาที่ประจำ (CocoMaidBranch จากไฟล์รายชื่อ Maid / หน้าสิทธิ์ผู้ใช้)
 *   — ไม่ใช่สาขาทั้งหมดของหัวหน้า เพราะ Maid อยู่ร้านเดียว (เจ้าของงานเลือก ต.ค. 69)
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
export const COCO_BRANCH: Prisma.BranchWhereInput = { code: { startsWith: "C", mode: "insensitive" } };

/** สาขาที่คนนี้เห็น — ใช้กับทุกหน้าที่แสดงสาขา (แผนงาน · ติดตามเครื่องเสีย · ผังผู้รับผิดชอบ · ฟอร์มเปิดใบงาน) */
export function areaBranchWhere(auth: { userId: number; role: string }): Prisma.BranchWhereInput {
  if (auth.role === "AREA") return COCO_BRANCH;
  if (auth.role === "COCO_MAID") return { AND: [COCO_BRANCH, { cocoMaids: { some: { userId: auth.userId } } }] };
  return { AND: [COCO_BRANCH, { cocoSupervisorId: auth.userId }] };
}

/**
 * ใบงานที่คนนี้เห็น = ใบของสาขาที่เห็น + ใบที่ตัวเองเปิด
 * ใบที่ตัวเองเปิดต้องไม่หายไปตอนสาขาถูกย้ายไปให้ Supervisor คนอื่นในไฟล์รอบหลัง
 */
export function areaWorkOrderWhere(auth: { userId: number; role: string }): Prisma.WorkOrderWhereInput {
  return { OR: [{ branch: areaBranchWhere(auth) }, { createdById: auth.userId }] };
}

/** อ่านพร้อมสาขาเพื่อเช็ค areaCoversBranch — Maid ต้องรู้ว่าใครประจำสาขานี้ */
export const AREA_BRANCH_SELECT = { code: true, cocoSupervisorId: true, cocoMaids: { select: { userId: true } } } as const;

/**
 * ช่องสาขาที่ areaCoversBranch ต้องใช้ ตามตำแหน่งของคนถาม — รายชื่อ Maid ดึงเฉพาะตอนคนถามเป็น Maid
 * ความสัมพันธ์ใน select = Prisma ยิงคำสั่งแยกอีกรอบ (ฐานข้อมูลอยู่คนละ region · รอบละ ~0.2 วิ) ตำแหน่งอื่นไม่ต้องจ่าย
 */
export function areaBranchSelect(auth: { role: string } | undefined) {
  return auth?.role === "COCO_MAID" ? AREA_BRANCH_SELECT : ({ code: true, cocoSupervisorId: true } as const);
}

/** สาขานี้อยู่ในขอบเขตไหม — สำหรับเช็คทีละสาขา (เปิดใบงาน · เปิดดูใบงาน) โดยไม่ต้องถามฐานข้อมูลซ้ำ */
export function areaCoversBranch(
  auth: { userId: number; role: string },
  branch: { code: string; cocoSupervisorId: number | null; cocoMaids?: { userId: number }[] }
): boolean {
  if (!/^c/i.test(branch.code)) return false;
  if (auth.role === "AREA") return true;
  if (auth.role === "COCO_MAID") return !!branch.cocoMaids?.some((m) => m.userId === auth.userId);
  return branch.cocoSupervisorId === auth.userId;
}

export const AREA_OUT_OF_SCOPE = "สาขานี้ไม่อยู่ในความดูแลของคุณ";

/**
 * สิ่งที่ทั้ง Area Team เรียกได้ (Area · Supervisor (COCO) · Maid (COCO)) — นอกจากนี้และ AREA_ONLY_ALLOWED ตอบ 403 ทั้งหมด (requireAuth)
 *
 * เป็นรายการอนุญาต ไม่ใช่รายการห้าม รวมถึงการอ่าน เพราะตำแหน่งนี้เห็นแค่ไม่กี่เมนู
 * API อ่านอื่น ๆ (รายชื่อผู้ใช้ ทะเบียนรถ อะไหล่ ราคา) ไม่ได้กรองตามสาขา ถ้าปล่อยไว้
 * คนที่ยิง API ตรง ๆ จะเห็นข้อมูลทั้งบริษัท · ทุก GET ที่อยู่ในรายการต้องกรองตาม areaWorkOrderWhere/areaBranchWhere เอง
 */
export const AREA_TEAM_ALLOWED: RegExp[] = [
  /^GET \/api\/auth\/me$/,
  /^POST \/api\/auth\/(change-password|view-as\/stop)$/,
  // ใบงานซ่อม · กล่องงานของฉัน · รายละเอียดใบงาน
  /^GET \/api\/work-orders\/?$/,
  /^GET \/api\/work-orders\/(version|inbox-count|options|locate)$/,
  /^GET \/api\/work-orders\/\d+(\/(version|attachments|attachments\/links|attachments\/\d+\/(link|file)))?$/,
  // เปิดใบงาน + แนบรูปหน้างาน (แนบได้เฉพาะใบที่ตัวเองเปิด — เช็คใน route)
  /^POST \/api\/work-orders\/?$/,
  /^POST \/api\/work-orders\/\d+\/attachments$/,
  // ฟอร์มเปิดใบงาน: ค้นหาสาขา · เครื่องของสาขา · ใบที่ค้างอยู่ · ผู้ติดต่อล่าสุด
  /^GET \/api\/branches\/?$/,
  /^GET \/api\/branches\/[^/]+\/(machines|open-work-orders|last-contact)$/,
  // แผนงาน (ดูอย่างเดียว)
  /^GET \/api\/plans\/(day|month|pending)$/,
];

/**
 * สามเมนูที่เหลือไว้ให้ Area คนเดียว — ติดตามเครื่องเสีย · รายงาน · ผังผู้รับผิดชอบ
 *
 * เจ้าของงานขอ ต.ค. 69: ทีม Area ลองใช้แล้วเห็นว่าสามเมนูนี้ไม่จำเป็นกับ Supervisor (COCO) และ Maid (COCO)
 * ("ซุปกับแม่บ้าน") ให้ปิดและดูได้เฉพาะ Area — สองตำแหน่งนั้นแจ้ง/เปิดใบงานของร้านตัวเองแล้วตามดูในใบงานซ่อม
 * ภาพรวมเครื่องเสีย รายงาน Excel และผังคนดูแลเป็นงานของ Area
 * ปิดที่เซิร์ฟเวอร์ด้วย ไม่ใช่แค่ซ่อนเมนู — ซ่อนอย่างเดียว ยิง API ตรง ๆ ก็ยังได้ข้อมูล
 * endpoint ในนี้หน้าจออื่นที่สองตำแหน่งนั้นยังใช้ไม่ได้เรียกเลย (ไล่ดูทุกที่ในแอปแล้ว) — ถ้าวันหน้ามีหน้าอื่นต้องใช้ ย้ายไป AREA_TEAM_ALLOWED
 * ฝั่งแอปซ่อนตามรายการหน้าเดียวกัน (mobile/src/utils/areaTeam.ts · AREA_ONLY_SCREENS)
 */
export const AREA_ONLY_ALLOWED: RegExp[] = [
  // ติดตามเครื่องเสีย
  /^GET \/api\/machines\/(outages|signal-lost|overview|work-statuses)$/,
  // รายงาน — ปุ่มเดียว
  /^GET \/api\/work-orders\/reports\/area-team$/,
  // ผังผู้รับผิดชอบ (ฝ่ายบริการ · ฝั่ง Area) — บันทึกผังฝั่ง Area: route เช็คซ้ำว่าเป็นแอดมินหรือ Area (canEditAreaMap)
  /^GET \/api\/teams\/(coverage-map|area-map)$/,
  /^POST \/api\/teams\/area-map$/,
];

// "ตำแหน่ง Area" ไม่ใช่ "ทีม Area" — ในแอป "ทีม Area" หมายถึงทั้งสามตำแหน่ง (เช่น error ดูในฐานะ)
// Supervisor (COCO) ที่อ่าน "สำหรับทีม Area" จะงงว่าตัวเองก็อยู่ทีมนั้น · ข้อความเดียวกับหน้ากุญแจ (AreaOnlyGate.tsx)
export const AREA_ONLY_MESSAGE = "เมนูนี้สำหรับตำแหน่ง Area เท่านั้น";

/**
 * Area Team เรียก `${method} ${path}` นี้ได้ไหม — ได้ตอบ null · ไม่ได้ตอบข้อความภาษาไทยที่จะส่งกลับพร้อม 403
 * ดูในฐานะใช้ตำแหน่งของคนที่ถูกดู (requireAuth) แอดมินที่ดูในฐานะ Supervisor (COCO)/Maid (COCO) จึงเจอ 403 แบบเดียวกับเจ้าตัว
 */
export function areaTeamDenied(role: string, call: string): string | null {
  if (AREA_ONLY_ALLOWED.some((r) => r.test(call))) return role === "AREA" ? null : AREA_ONLY_MESSAGE;
  if (AREA_TEAM_ALLOWED.some((r) => r.test(call))) return null;
  return "ตำแหน่งนี้แจ้งและเปิดใบงานได้ ส่วนอื่นดูได้อย่างเดียว";
}
