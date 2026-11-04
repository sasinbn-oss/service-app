-- ถังขยะใบงาน (เจ้าของงานตัดสิน 4 พ.ย. 69 — ลบใบงาน = ย้ายไปถังขยะ กู้คืนได้ 30 วัน แล้วระบบลบจริงพร้อมรูป/วิดีโอ)
-- เพิ่มคอลัมน์ว่างสี่ช่อง + ดัชนี + FK อย่างเดียว · ไม่แตะแถวเดิม (ทุกใบที่มีอยู่ = ยังไม่ถูกลบ = NULL)
-- และไม่ใส่ข้อมูลลงตารางไหน → ไม่ต้องเพิ่มชื่อใน SEEDED_BY_MIGRATION ของ scripts/restore-backup.js
-- ไฟล์สำรองที่ทำก่อน migration นี้ไม่มีสี่ช่องนี้ — กู้แล้วทุกใบเป็น NULL (ไม่อยู่ในถังขยะ) ซึ่งตรงกับความจริงตอนนั้น
-- เขียนเองแล้วเทียบกับ migrate diff ของ schema.prisma (ก่อน → หลัง) ตรงกันทุกบรรทัด

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "deleteNote" TEXT,
ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" INTEGER;

-- CreateIndex
CREATE INDEX "WorkOrder_deletedAt_status_idx" ON "WorkOrder"("deletedAt", "status");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
