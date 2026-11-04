-- แก้ชื่อสาขาในแอป + ประวัติสาขา (เจ้าของงานตัดสิน 4 พ.ย. 69 — ไม่รวมสาขา · แก้ชื่อในแอปได้ นำเข้าไม่ทับ)
-- ตารางใหม่ตารางเดียว · ไม่แตะแถวเดิม และไม่ใส่ข้อมูลลงตารางใหม่
-- → ไม่ต้องเพิ่มชื่อใน SEEDED_BY_MIGRATION ของ scripts/restore-backup.js (กู้ลงฐานใหม่ ตารางนี้ว่างตามปกติ)
-- ชื่อที่แก้ในแอปใช้ BranchPin field = 'name' (ตารางเดิม ช่อง field เป็นข้อความอยู่แล้ว ไม่ต้องเปลี่ยนโครง)
-- ประวัติไม่เติมย้อนหลัง: ก่อนหน้านี้ไม่มีอะไรให้เติม (ชื่อแก้ไม่ได้ · cancelledNote ถูกล้างตอนเปิดคืน)

-- CreateTable
CREATE TABLE "BranchLog" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "meta" JSONB,
    "byUserId" INTEGER,
    "byName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchLog_branchId_id_idx" ON "BranchLog"("branchId", "id");

-- AddForeignKey
ALTER TABLE "BranchLog" ADD CONSTRAINT "BranchLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
