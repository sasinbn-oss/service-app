-- โอนอะไหล่ข้ามคลัง: หัวหน้าภาคเบิกจากคลังอื่นแล้วโอนมาคลังส่งมอบ
ALTER TABLE "WorkOrderPart"
  ADD COLUMN "transferFrom" TEXT,
  ADD COLUMN "transferReqNo" TEXT,
  ADD COLUMN "transferNo" TEXT,
  ADD COLUMN "transferredAt" TIMESTAMP(3);

-- ใบที่รอหัวหน้าภาคเบิกคลังอื่นอยู่ก่อนมีขั้นโอน: ถือว่าของอยู่คลังนั้นแล้ว ให้เบิกส่งมอบได้ตามเดิม
-- ไม่งั้นแถวพวกนี้จะเข้าเงื่อนไข "ต้องโอนก่อน" แล้วใบค้างที่ขั้นเบิกคลังอื่นโดยไม่มีปุ่มให้กด
UPDATE "WorkOrderPart" p
SET "transferredAt" = NOW()
FROM "WorkOrder" w
WHERE p."workOrderId" = w.id
  AND w.status = 'PARTS_PICKUP'
  AND p.kind = 'WAITING'
  AND p."inStock" = true
  AND p.warehouse IS NOT NULL
  AND p.warehouse <> 'คลังลาดพร้าว 94'
  AND p."requisitionNo" IS NULL;
