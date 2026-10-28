-- หัวหน้าภาคส่งกลับให้แอดมินตรวจสอบ โดยขั้นตอนไม่เปลี่ยน (ต.ค. 69) — ตารางใหม่ ไม่ใส่ข้อมูลตั้งต้น
-- CreateTable
CREATE TABLE "AdminReview" (
    "id" SERIAL NOT NULL,
    "workOrderId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reply" TEXT,
    "repliedById" INTEGER,
    "repliedAt" TIMESTAMP(3),
    "ackAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "AdminReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminReview_workOrderId_createdAt_idx" ON "AdminReview"("workOrderId", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminReview" ADD CONSTRAINT "AdminReview_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminReview" ADD CONSTRAINT "AdminReview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminReview" ADD CONSTRAINT "AdminReview_repliedById_fkey" FOREIGN KEY ("repliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

