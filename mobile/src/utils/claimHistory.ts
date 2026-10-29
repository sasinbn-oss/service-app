/**
 * ประวัติเคลม — ใครเห็นทางเข้า และเปิดหน้าจากที่ไหนก็ได้
 *
 * เจ้าของงานเลือก (ต.ค. 69): Admin Spare Part · แอดมิน · Super Admin · หัวหน้าภาค (เฉพาะใบในขอบเขตตัวเอง —
 * เซิร์ฟเวอร์กรองให้) · ช่างกับ Area Team ไม่เห็น · ทุกแบบของแอดมินถูกมองเป็น role "ADMIN" อยู่แล้ว (AuthContext)
 * กติกาเดียวกับ GET /api/part-claims — ซ่อนทางเข้าที่กดแล้วเจอ 403 ดีกว่าให้กดแล้วงง
 */
import { navigationRef } from "../navigation/navigationRef";

export function canSeeClaimHistory(u: { role: string } | null | undefined) {
  return !!u && (u.role === "ADMIN" || u.role === "SUPERVISOR");
}

/**
 * หน้าประวัติเคลมอยู่ในชุดหน้าของแท็บหน้าแรก — หน้าใบงานเปิดได้จากแท็บใบงานด้วย ซึ่งไม่มีหน้านี้
 * จึงสั่งผ่านแท็บเสมอ · initial: false ให้ปุ่มย้อนกลับพากลับหน้าแรกของแท็บ ไม่ใช่หลุดออกจากแท็บ
 */
export function openClaimHistory(params?: { branchCode?: string; machineCode?: string }) {
  if (!navigationRef.isReady()) return;
  (navigationRef.navigate as (tab: string, p: object) => void)("HomeTab", {
    screen: "ClaimHistory",
    // ส่ง {} เสมอ (ไม่ใช่ undefined) — เปิดจากเมนูหลังเคยเปิดจากลิงก์เครื่อง ตัวกรองเครื่องเดิมต้องหลุด
    params: params ?? {},
    initial: false,
  });
}
