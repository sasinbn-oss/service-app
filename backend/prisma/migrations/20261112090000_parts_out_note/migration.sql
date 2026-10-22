-- หมายเหตุในรายงานอะไหล่หมด — ทีละแถวสาขา+อะไหล่ ขึ้นเฉพาะหน้ารายงาน
ALTER TABLE "WorkOrderPart"
  ADD COLUMN "outNote" TEXT,
  ADD COLUMN "outNoteAt" TIMESTAMP(3),
  ADD COLUMN "outNoteById" INTEGER;

ALTER TABLE "WorkOrderPart"
  ADD CONSTRAINT "WorkOrderPart_outNoteById_fkey" FOREIGN KEY ("outNoteById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
