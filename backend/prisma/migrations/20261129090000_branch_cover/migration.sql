-- สาขาที่มีคนดูแลแทน (ผังฝั่ง Area · ย้ายสาขาทั้งหมดแบบดูแลแทนชั่วคราว) — เพิ่มคอลัมน์ว่างเท่านั้น ไม่ใส่ข้อมูล
-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "coverForId" INTEGER,
ADD COLUMN     "coverForName" TEXT,
ADD COLUMN     "coverSince" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_coverForId_fkey" FOREIGN KEY ("coverForId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
