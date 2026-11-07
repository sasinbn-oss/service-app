-- แชทในใบงาน (พ.ย. 69) — ตารางใหม่ล้วน ไม่แตะข้อมูลเดิม ไม่ INSERT
-- ข้อความ: ส่งรูปได้ (รูปจริงอยู่ในถังเดียวกับรูปหน้างาน · รูปย่อเก็บที่นี่) · ลบภายใน 5 นาทีเหลือแถวไว้ขึ้น "ลบข้อความแล้ว"
CREATE TABLE "WorkOrderMessage" (
    "id" SERIAL NOT NULL,
    "workOrderId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "imageKey" TEXT,
    "imageThumb" BYTEA,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkOrderMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkOrderMessage_workOrderId_id_idx" ON "WorkOrderMessage"("workOrderId", "id");
ALTER TABLE "WorkOrderMessage" ADD CONSTRAINT "WorkOrderMessage_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- คนที่เคยส่งข้อความนับเป็นประวัติ ลบผู้ใช้จริงไม่ได้ (เหลือแค่ปิดบัญชี) — ข้อความเก่าต้องมีชื่อคนส่ง
ALTER TABLE "WorkOrderMessage" ADD CONSTRAINT "WorkOrderMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- อ่านถึงข้อความไหนแล้ว (ต่อคน ต่อใบ) — ตัวเลขแชทที่ยังไม่อ่าน · ลบผู้ใช้แล้วลบตามได้ ไม่ใช่ประวัติ
CREATE TABLE "WorkOrderChatRead" (
    "workOrderId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "lastReadId" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkOrderChatRead_pkey" PRIMARY KEY ("workOrderId","userId")
);
ALTER TABLE "WorkOrderChatRead" ADD CONSTRAINT "WorkOrderChatRead_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderChatRead" ADD CONSTRAINT "WorkOrderChatRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
