-- สถานะ "รอแอดมินเช็คอะไหล่" (CHECKING_PARTS) — ใบที่อยู่ขั้นเช็คอะไหล่แต่แอดมินยังไม่ได้ตอบว่าตัวไหนหมด
-- เดิมขึ้น "รออะไหล่" ทั้งที่ยังไม่มีใครบอกว่าของหมด (เจ้าของงานขอให้ขึ้นตามที่แอดมินระบุจริง ต.ค. 69)
-- ใบที่แอดมินตอบแล้วว่ามีตัวที่หมด ยังเป็น "รออะไหล่" ตามเดิม
UPDATE "WorkOrder" w
SET "workStatus" = 'CHECKING_PARTS'
WHERE w.status IN ('PARTS_REQUESTED', 'PARTS_SOURCING')
  AND w."workStatus" = 'WAITING_PARTS'
  AND NOT EXISTS (
    SELECT 1 FROM "WorkOrderPart" p
    WHERE p."workOrderId" = w.id AND p.kind = 'WAITING' AND p."inStock" = false
  );

-- เคสบนกระดานติดตามเครื่องเสียที่ผูกกับใบงานเหล่านั้น ใช้สถานะเดียวกับใบงาน
UPDATE "Outage" o
SET "workStatus" = 'CHECKING_PARTS'
FROM "WorkOrder" w
WHERE w."outageId" = o.id
  AND w."workStatus" = 'CHECKING_PARTS'
  AND o."workStatus" = 'WAITING_PARTS';
