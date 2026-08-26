-- AlterTable
ALTER TABLE "User" ADD COLUMN     "region" TEXT;

-- AlterTable
ALTER TABLE "WorkOrder" ALTER COLUMN "status" SET DEFAULT 'NEW';

-- AlterTable
ALTER TABLE "WorkOrderPart" ADD COLUMN     "checkedAt" TIMESTAMP(3),
ADD COLUMN     "checkedById" INTEGER,
ADD COLUMN     "inStock" BOOLEAN,
ADD COLUMN     "warehouse" TEXT;

-- AddForeignKey
ALTER TABLE "WorkOrderPart" ADD CONSTRAINT "WorkOrderPart_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ใบงานเดิมที่ยังเป็น OPEN คือ "เพิ่งเปิด ยังไม่มีใครทำอะไรต่อ" ตรงกับขั้น NEW
-- ส่วน IN_PROGRESS / DONE / CANCELLED ความหมายไม่เปลี่ยน จึงปล่อยไว้ตามเดิม
UPDATE "WorkOrder" SET "status" = 'NEW' WHERE "status" = 'OPEN';

-- อะไหล่ที่บันทึกไว้ก่อนมีช่องเช็คคลัง ถือว่ายังไม่มีใครเช็ค (inStock = NULL อยู่แล้ว)
