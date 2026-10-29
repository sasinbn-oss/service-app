-- เบิกอะไหล่ก่อน แล้วค่อยคอนเฟิร์มลูกค้า (เจ้าของงานกำหนด ต.ค. 69 รอบสอง) — ย้ายใบที่ค้างคอนเฟิร์มเข้าลำดับใหม่
--
-- ไม่มีคอลัมน์ใหม่ — ลำดับขั้นอยู่ในโค้ด (WORK_ORDER_STAGE_ORDER) · ไฟล์นี้ย้ายเฉพาะใบที่ต้องย้าย:
--   ใบที่หัวหน้าภาคนัดแล้ว แอดมินยังไม่ได้โทรคอนเฟิร์ม และยังไม่ได้เบิก → ขั้นเบิกอะไหล่
--   (ทีม/วันนัด/รอลูกค้าคอนเฟิร์ม อยู่ครบ — เบิกเสร็จแล้วแอดมินโทรคอนเฟิร์มตอนของอยู่ในมือ)
--   ลูกค้ายังไม่รู้วันเลย เหตุผลที่สลับลำดับ (ของโอนมาไม่ทันวันที่บอกร้าน) จึงใช้กับใบพวกนี้ด้วย
-- ไม่แตะ: ใบที่คอนเฟิร์มแล้วแต่ยังเบิกไม่ครบ (เบิกเสร็จไปปล่อยงานเลย ไม่โทรซ้ำ — afterIssue)
--   · ใบที่เบิกครบแล้ว (ร้านปิด/ทีมไม่ว่าง วนกลับมาคอนเฟิร์ม) · ใบไม่ใช้อะไหล่
-- "ยังไม่ได้เบิก" ใช้กฎเดียวกับ issueLeft ในโค้ด: ของในสโตร์ที่ยังไม่มีเลขใบเบิก
--   · ของนอกสโตร์ (ไม่มีใบเบิก) ที่แอดมินยังไม่ผ่านขั้นเบิกหลังรอบเช็คอะไหล่ล่าสุด
-- ไม่ซิงก์ Outage.workStatus เหมือน migration นัดก่อนเบิก — สถานะเดิม (CHECKING_PARTS/รอช่าง) ตามไปเองเมื่อใบขยับครั้งถัดไป
-- ใส่ประวัติให้ทุกใบที่ย้าย คนเปิดใบงานจะได้รู้ว่าทำไมขั้นเปลี่ยนเอง · ฐานข้อมูลเปล่าไม่มีอะไรให้ย้าย (ไม่ต้องเพิ่ม SEEDED_BY_MIGRATION)

WITH moved AS (
  UPDATE "WorkOrder" w
  SET "status" = 'PARTS_REQUESTED',
      "workStatus" = 'CHECKING_PARTS',
      "updatedAt" = NOW()
  WHERE w."status" = 'AWAITING_CONFIRM'
    AND w."appointmentStatus" IS DISTINCT FROM 'CONFIRMED'
    AND w."appointmentStatus" IS DISTINCT FROM 'ADMIN_PICKED'
    AND EXISTS (
      SELECT 1
      FROM "WorkOrderPart" p
      JOIN "SparePart" s ON s."id" = p."sparePartId"
      WHERE p."workOrderId" = w."id"
        AND p."kind" = 'WAITING'
        AND (
          (NOT s."offCatalog" AND (p."inStock" IS DISTINCT FROM true OR p."requisitionNo" IS NULL))
          OR (
            s."offCatalog"
            AND COALESCE((
              SELECT l."action"
              FROM "WorkOrderLog" l
              WHERE l."workOrderId" = w."id"
                AND l."action" IN ('PARTS_REQUESTED', 'NO_PARTS', 'PARTS_SOURCED', 'PARTS_BACKORDERED', 'PARTS_SHORT', 'PARTS_CHECKED')
              ORDER BY l."createdAt" DESC, l."id" DESC
              LIMIT 1
            ), '') <> 'PARTS_CHECKED'
          )
        )
    )
  RETURNING w."id"
)
INSERT INTO "WorkOrderLog" ("workOrderId", "userId", "action", "status", "note", "createdAt")
SELECT "id", NULL, 'FLOW_MIGRATED', 'PARTS_REQUESTED',
       'เปลี่ยนสายงาน: เบิกอะไหล่ก่อน แล้วค่อยคอนเฟิร์มลูกค้า — ใบนี้ยังไม่ได้โทรคอนเฟิร์มและยังไม่ได้เบิก ย้ายไปขั้นเบิกอะไหล่ (วันที่หัวหน้าภาคนัดยังอยู่)',
       NOW()
FROM moved;
