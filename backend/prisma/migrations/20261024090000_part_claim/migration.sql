-- เคลมอะไหล่เก่าตามฟอร์มใบเคลม (ดู routes/workOrders.ts ปิดงาน/ตรวจเคลม) · เพิ่มอย่างเดียว ไม่แตะข้อมูลเดิม
-- AlterTable
ALTER TABLE "WorkOrderAttachment" ADD COLUMN     "sparePartId" INTEGER;

-- CreateTable
CREATE TABLE "PartClaim" (
    "id" SERIAL NOT NULL,
    "workOrderId" INTEGER NOT NULL,
    "sparePartId" INTEGER,
    "partCode" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "branchCode" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "branchOpenedAt" TIMESTAMP(3),
    "brand" TEXT,
    "model" TEXT,
    "machineCode" TEXT,
    "symptom" TEXT NOT NULL,
    "checkNote" TEXT NOT NULL,
    "troubleshooting" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "PartClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartClaim_workOrderId_createdAt_idx" ON "PartClaim"("workOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "PartClaim_status_idx" ON "PartClaim"("status");

-- AddForeignKey
ALTER TABLE "PartClaim" ADD CONSTRAINT "PartClaim_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

