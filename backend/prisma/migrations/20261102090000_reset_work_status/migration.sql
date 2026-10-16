-- รีเซ็ตสถานะการดำเนินการของใบงานที่ยังเปิดอยู่ให้ตรงกับขั้น (เจ้าของงานสั่ง ต.ค. 69)
--
-- เดิมปุ่ม "แก้ไข" เลือกสถานะได้ทุกค่าทุกขั้น ใบงานจึงมีสถานะที่ไม่ตรงกับขั้นค้างอยู่ เช่น "รออะไหล่"
-- ทั้งที่ไม่มีของหมด · ตอนนี้คนตั้งเองได้แค่ "รอลูกค้าแจ้งซ่อม" (WAITING_CUSTOMER) — ใบที่ตั้งค่านี้ไว้คงไว้
-- ที่เหลือตั้งใหม่ตาม workStatusForStage (backend/src/utils/constants.ts) — สองที่นี้ต้องตรงกัน
UPDATE "WorkOrder" w
SET "workStatus" = CASE
    WHEN w.status = 'NEW' THEN NULL
    WHEN w.status = 'AWAITING_QUOTE' THEN 'QUOTING'
    WHEN w.status = 'AWAITING_PAYMENT' THEN 'WAITING_PAYMENT'
    WHEN w.status IN ('PARTS_SOURCING', 'PARTS_REQUESTED') THEN
      CASE WHEN EXISTS (
        SELECT 1 FROM "WorkOrderPart" p
        WHERE p."workOrderId" = w.id AND p.kind = 'WAITING' AND p."inStock" = false
      ) THEN 'WAITING_PARTS' ELSE 'CHECKING_PARTS' END
    WHEN w.status = 'WAITING_PARTS' THEN 'WAITING_PARTS'
    WHEN w.status IN ('INSPECT_CONFIRM', 'INSPECTING', 'PARTS_CHECKED', 'ASSIGNED', 'AWAITING_CONFIRM', 'IN_PROGRESS') THEN 'WAITING_TECH'
    WHEN w.status = 'CLAIM_REVIEW' THEN NULL
    ELSE w."workStatus"
  END
WHERE w.status NOT IN ('DONE', 'CANCELLED')
  AND w."workStatus" IS DISTINCT FROM 'WAITING_CUSTOMER';

-- เคสบนกระดานติดตามเครื่องเสียที่ผูกกับใบงานที่ยังเปิดอยู่ ใช้สถานะเดียวกับใบงาน (ใบล่าสุดของเคสนั้น)
UPDATE "Outage" o
SET "workStatus" = w."workStatus"
FROM (
  SELECT DISTINCT ON ("outageId") "outageId", "workStatus"
  FROM "WorkOrder"
  WHERE "outageId" IS NOT NULL AND status NOT IN ('DONE', 'CANCELLED')
  ORDER BY "outageId", id DESC
) w
WHERE w."outageId" = o.id
  AND o."workStatus" IS DISTINCT FROM w."workStatus";
