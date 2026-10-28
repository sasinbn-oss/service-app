-- นัดลูกค้าก่อน แล้วค่อยเบิกอะไหล่ (เจ้าของงานกำหนด ต.ค. 69) — ย้ายใบที่เปิดไปแล้วเข้าสายงานใหม่ทั้งหมด
--
-- ไม่มีคอลัมน์ใหม่ — ลำดับขั้นอยู่ในโค้ด (WORK_ORDER_STAGE_ORDER) · ไฟล์นี้ย้ายเฉพาะใบที่ต้องย้าย:
--   ใบที่ค้างขั้นเบิกอะไหล่และยังไม่ได้เบิก/โอนสักตัว → ขั้นเช็คอะไหล่ (ผลมี/หมด วันคาดเข้าที่ใส่ไว้อยู่ครบ)
--   ใบรออะไหล่รุ่นเก่า (หัวหน้าภาคตามของ) → ขั้นเช็คอะไหล่ ที่แอดมิน (คนที่รู้ว่าของเข้าเมื่อไร)
-- ใบที่เบิกของไปแล้วไม่ย้อน — เดินต่อจากขั้นเดิม แอปตัดสินจากของที่เบิกแล้ว (afterConfirm / afterIssue)
-- ใส่ประวัติให้ทุกใบที่ย้าย คนเปิดใบงานจะได้รู้ว่าทำไมขั้นเปลี่ยนเอง

WITH moved AS (
  UPDATE "WorkOrder" w
  SET "status" = 'PARTS_SOURCING',
      "workStatus" = CASE
        WHEN EXISTS (SELECT 1 FROM "WorkOrderPart" p WHERE p."workOrderId" = w."id" AND p."kind" = 'WAITING' AND p."inStock" = false)
        THEN 'WAITING_PARTS' ELSE 'CHECKING_PARTS' END,
      "updatedAt" = NOW()
  WHERE w."status" = 'PARTS_REQUESTED'
    AND NOT EXISTS (
      SELECT 1 FROM "WorkOrderPart" p
      WHERE p."workOrderId" = w."id" AND p."kind" = 'WAITING'
        AND (p."requisitionNo" IS NOT NULL OR p."transferNo" IS NOT NULL OR p."transferredAt" IS NOT NULL)
    )
  RETURNING w."id"
)
INSERT INTO "WorkOrderLog" ("workOrderId", "userId", "action", "status", "note", "createdAt")
SELECT "id", NULL, 'FLOW_MIGRATED', 'PARTS_SOURCING',
       'เปลี่ยนสายงาน: นัดลูกค้าก่อน แล้วค่อยเบิกอะไหล่ — ใบนี้ยังไม่ได้เบิกของ ย้ายจากขั้นเบิกอะไหล่มาขั้นเช็คอะไหล่ (มี/หมด)',
       NOW()
FROM moved;

WITH moved AS (
  UPDATE "WorkOrder" w
  SET "status" = 'PARTS_SOURCING',
      "workStatus" = 'WAITING_PARTS',
      "updatedAt" = NOW()
  WHERE w."status" = 'WAITING_PARTS'
  RETURNING w."id"
)
INSERT INTO "WorkOrderLog" ("workOrderId", "userId", "action", "status", "note", "createdAt")
SELECT "id", NULL, 'FLOW_MIGRATED', 'PARTS_SOURCING',
       'เปลี่ยนสายงาน: นัดลูกค้าก่อน แล้วค่อยเบิกอะไหล่ — ใบรออะไหล่ย้ายจากหัวหน้าภาคมาขั้นเช็คอะไหล่ของแอดมิน ของเข้าครบแล้วส่งนัด',
       NOW()
FROM moved;
