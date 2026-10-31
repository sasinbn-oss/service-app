/**
 * เครื่องนี้เคยเคลมมาก่อนไหม — คำตอบเดียวของ "เคลมซ้ำ" ทั้งหน้าตรวจเคลม (GET /work-orders/:id · claimRepeats)
 * และกล่องงานตรวจเคลม (GET /part-claims/queue · flags.repeat) ป้ายในรายการกับคำเตือนในใบจึงไม่มีวันขัดกัน
 * (อะไหล่ชิ้นเดิมเคลมซ้ำในเวลาสั้น ๆ = ผู้ขายถามแน่ หรือของที่ส่งไปรอบก่อนยังไม่ได้แก้ต้นเหตุ)
 *
 * เครื่องเดียวกัน = สาขาเดียวกัน + รหัสเครื่องตรงกันไม่สนตัวพิมพ์ (กติกาเดียวกับลิงก์ประวัติเคลม) · แถวล่าสุดต่อ (ใบ, ชิ้น)
 * ตัดเฉพาะแถวของงานซ่อมครั้งนี้ของใบนี้ (หลังเปิดใบใหม่ครั้งล่าสุด) — ใบเดียวกันที่อนุมัติไปตอนซ่อมครั้งก่อนเปิดใหม่ต้องขึ้น
 * เพราะนั่นคือการเคลมซ้ำจริง · ใบทดสอบไม่นับให้ใบจริง (คัดลอกใบจริงไปลองปิดพร้อมเคลม ไม่ได้แปลว่าเครื่องเคลมซ้ำ)
 * "เคย" = ส่งก่อนแถวล่าสุดของใบนี้ — เปิดดูใบเก่าทีหลังต้องไม่ขึ้นเคลมของใบที่ใหม่กว่าว่า "เครื่องนี้เคยเคลม"
 * คำสั่งเดียวหาสาขา/เครื่องจากใบเอง ถามได้ทีละหลายใบ (กล่องงานตรวจเคลมทั้งกล่องในรอบเดียว — ฐานข้อมูลอยู่ไกล รอบละ ~0.23 วิ)
 */
import { prisma } from "../prisma";

export interface ClaimRepeat {
  workOrderId: number;
  code: string;
  partCode: string;
  partName: string;
  status: string;
  createdAt: Date;
}

/** เคลมก่อนหน้าของเครื่องในแต่ละใบ — key = id ใบงานที่ถาม · ใบที่ไม่มีเคลมซ้ำไม่มีใน Map · เรียงล่าสุดก่อน */
export async function claimRepeatsOf(ids: number[]): Promise<Map<number, ClaimRepeat[]>> {
  const out = new Map<number, ClaimRepeat[]>();
  if (!ids.length) return out;
  const rows = await prisma.$queryRaw<(ClaimRepeat & { forId: number })[]>`
    SELECT DISTINCT ON (me.id, c."workOrderId", COALESCE('id:' || c."sparePartId", 'code:' || c."partCode"))
           me.id AS "forId", c."workOrderId", w.code, c."partCode", c."partName", c.status, c."createdAt"
    FROM "WorkOrder" me
    JOIN "Branch" b ON b.id = me."branchId"
    JOIN "Machine" m ON m.id = me."machineId"
    JOIN "PartClaim" c ON c."branchCode" = b.code AND lower(c."machineCode") = lower(m.code)
    JOIN "WorkOrder" w ON w.id = c."workOrderId"
    WHERE me.id = ANY(${ids}::int[])
      AND (me."isTest" OR NOT w."isTest")
      AND NOT (c."workOrderId" = me.id AND c."createdAt" >= COALESCE(
        (SELECT max(l."createdAt") FROM "WorkOrderLog" l WHERE l."workOrderId" = me.id AND l.action = 'REOPENED'),
        '-infinity'::timestamp))
      AND c."createdAt" <= COALESCE(
        (SELECT max(x."createdAt") FROM "PartClaim" x WHERE x."workOrderId" = me.id), 'infinity'::timestamp)
    ORDER BY me.id, c."workOrderId", COALESCE('id:' || c."sparePartId", 'code:' || c."partCode"), c."createdAt" DESC, c.id DESC`;
  for (const r of rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    const list = out.get(r.forId) ?? [];
    list.push({
      workOrderId: r.workOrderId,
      code: r.code,
      partCode: r.partCode,
      partName: r.partName,
      status: r.status,
      createdAt: r.createdAt,
    });
    out.set(r.forId, list);
  }
  return out;
}
