/**
 * อะไหล่ที่ไปแต่ละสาขา — ใครเห็นทางเข้า และเปิดหน้าจากที่ไหนก็ได้
 *
 * เจ้าของงานเลือก (ต.ค. 69): "admin ดูได้ superadmin ดูได้" — แอดมินและ Super Admin เท่านั้น
 * AuthContext มอง Super Admin เป็น ADMIN+superAdmin และ Admin Spare Part เป็น ADMIN+partsAdmin
 * กฎจึงเป็น ADMIN ที่ไม่ใช่ partsAdmin — ตัวเดียวกับ canSeeBranchParts ฝั่งเซิร์ฟเวอร์ ซ่อนทางเข้าที่กดแล้วเจอ 403
 * ดูในฐานะ: user คือคนที่ถูกดู การ์ดและลิงก์จึงหายเองเมื่อดูในฐานะหัวหน้าภาค/Admin Spare Part ไม่ต้องเช็คแยก
 */
import { navigationRef } from "../navigation/navigationRef";
import type { HomeStackParamList } from "../navigation/types";
import { fmtNum } from "./vehicles";

export function canSeeBranchParts(u: { role: string; partsAdmin?: boolean } | null | undefined) {
  return !!u && u.role === "ADMIN" && !u.partsAdmin;
}

export type BranchPartsParams = NonNullable<HomeStackParamList["BranchPartsReport"]>;

/**
 * หน้ารายงานอยู่ในชุดหน้าของแท็บหน้าแรก — หน้าใบงานเปิดได้จากแท็บใบงานด้วย ซึ่งไม่มีหน้านี้
 * จึงสั่งผ่านแท็บเสมอ (แบบเดียวกับประวัติเคลม) · initial: false ให้ปุ่มย้อนกลับพากลับหน้าแรกของแท็บ
 */
export function openBranchParts(params?: BranchPartsParams) {
  if (!navigationRef.isReady()) return;
  (navigationRef.navigate as (tab: string, p: object) => void)("HomeTab", {
    screen: "BranchPartsReport",
    // ส่ง {} เสมอ (ไม่ใช่ undefined) — เปิดจากเมนูหลังเคยเปิดจากลิงก์ในใบงาน ตัวกรองสาขา/เครื่องเดิมต้องหลุด
    params: params ?? {},
    initial: false,
  });
}

/**
 * ตัวเลขชิ้นสองแบบเป็นข้อความเดียว — เจ้าของงานให้นับเป็นชิ้นและไม่รวม "ใช้แล้ว" กับ "เบิกแล้ว" เป็นเลขเดียว
 * ทุกที่ที่โชว์ยอด (ลิงก์ในใบงาน หัวกลุ่มบนมือถือ) จึงบอกทั้งสองแบบแยกกัน แบบที่เป็นศูนย์ไม่ต้องพูด
 */
export function piecesText(c: { used: number; issued: number }) {
  // จุลภาคหลักพันแบบเดียวกับหน้ารายงาน — สาขาใหญ่ตั้งแต่เริ่มใช้ระบบมีได้เป็นพันชิ้น
  const u = fmtNum(c.used);
  const i = fmtNum(c.issued);
  if (!c.used && !c.issued) return "ยังไม่มี";
  if (!c.issued) return `ใช้แล้ว ${u} ชิ้น`;
  if (!c.used) return `เบิกแล้ว ${i} ชิ้น`;
  return `ใช้แล้ว ${u} · เบิกแล้ว ${i} ชิ้น`;
}
