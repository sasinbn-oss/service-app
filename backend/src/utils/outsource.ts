/**
 * ทีม outsource (เจ้าของงานเพิ่ม ต.ค. 69) — รับงานเป็นครั้ง ๆ ไม่มีสาขาประจำ ช่างไม่มีบัญชีในแอป
 *
 * เก็บรายชื่อไว้ในหน่วยความจำ เพราะ shape() ของใบงานเป็นฟังก์ชันธรรมดาที่ถูกเรียกหลายสิบที่
 * ถ้าต้องถามฐานข้อมูลทุกครั้งต้องรื้อทุกจุด · รายชื่อเปลี่ยนน้อยมาก (แอดมินเพิ่ม/ลบที่หน้าทีมช่าง)
 * โหลดใหม่ทุกครั้งที่เพิ่ม/ลบ และไม่เกินนาทีละครั้งตอนมีคนเปิดใบงาน (เผื่อมีหลายเครื่องรันพร้อมกัน)
 */
import { prisma } from "../prisma";

let names = new Set<string>();
let loadedAt = 0;

export async function refreshOutsource() {
  const rows = await prisma.outsourceTeam.findMany({ select: { name: true } });
  names = new Set(rows.map((r) => r.name));
  loadedAt = Date.now();
  return names;
}

/** โหลดใหม่ถ้าเก่ากว่า 1 นาที — เรียกก่อนตอบรายการ/รายละเอียดใบงาน */
export async function freshOutsource() {
  if (Date.now() - loadedAt > 60_000) await refreshOutsource();
  return names;
}

export function isOutsourceTeam(team: string | null | undefined) {
  return !!team && names.has(team);
}

export function outsourceList() {
  return [...names];
}

// โหลดครั้งแรกตอนเซิร์ฟเวอร์เริ่ม — ใบงานที่ตอบก่อนมีใครเรียก freshOutsource จะได้ไม่ขึ้นว่าไม่ใช่ outsource
refreshOutsource().catch(() => undefined);
