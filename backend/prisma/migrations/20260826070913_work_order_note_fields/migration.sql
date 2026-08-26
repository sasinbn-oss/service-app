-- DropIndex
DROP INDEX "WorkOrderPart_workOrderId_sparePartId_key";

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "symptom" TEXT,
ADD COLUMN     "workStatus" TEXT;

-- AlterTable
ALTER TABLE "WorkOrderPart" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'USED';

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderPart_workOrderId_sparePartId_kind_key" ON "WorkOrderPart"("workOrderId", "sparePartId", "kind");

