-- ระงับใบงานชั่วคราว (พ.ย. 69) — คอลัมน์ว่างทั้งหมด ไม่แตะข้อมูลเดิม
ALTER TABLE "WorkOrder" ADD COLUMN "holdUntil" TIMESTAMP(3);
ALTER TABLE "WorkOrder" ADD COLUMN "holdReason" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "heldAt" TIMESTAMP(3);
