-- ค่าบริการที่หัวหน้าช่างระบุให้เสนอราคาลูกค้า — ตารางใหม่ ไม่แตะข้อมูลเดิม
CREATE TABLE "WorkOrderService" (
    "id" SERIAL NOT NULL,
    "workOrderId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkOrderService_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkOrderService_workOrderId_idx" ON "WorkOrderService"("workOrderId");
ALTER TABLE "WorkOrderService" ADD CONSTRAINT "WorkOrderService_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
