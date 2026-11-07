-- กระดิ่งงานเข้าใหม่ (พ.ย. 69) — ตารางใหม่ + คอลัมน์ที่มีค่าตั้งต้น ไม่ INSERT ข้อมูล
-- bellSince ของผู้ใช้ที่มีอยู่ = เวลาที่รัน migration → วันแรกกระดิ่งเริ่มจากศูนย์ (ใบที่ค้างอยู่แล้วไม่นับเป็นงานใหม่)
CREATE TABLE "WorkOrderSeen" (
    "workOrderId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkOrderSeen_pkey" PRIMARY KEY ("workOrderId","userId")
);
ALTER TABLE "WorkOrderSeen" ADD CONSTRAINT "WorkOrderSeen_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderSeen" ADD CONSTRAINT "WorkOrderSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD COLUMN "bellSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
