-- ใช้รหัสของสาขาที่ปิดแล้วกับสาขาใหม่ (เจ้าของงานตัดสิน 4 พ.ย. 69 — ไม่รวมสาขา · สาขาใหม่คือข้อมูลใหม่ทั้งหมด สาขาเดิมเก็บประวัติไว้)
-- สามคอลัมน์ว่างได้ทั้งหมด ไม่มีค่าตั้งต้น · ไม่แตะแถวเดิม และไม่ใส่ข้อมูล
-- → ไม่ต้องเพิ่มชื่อใน SEEDED_BY_MIGRATION ของ scripts/restore-backup.js
-- reusedFromId อ้างตาราง Branch เอง — restore-backup.js ใส่ช่องที่อ้างตารางตัวเองเป็นว่างก่อน แล้วเติมหลังใส่ครบ (แบบใบงานรออะไหล่ → ใบเดิม)
-- ไม่เติมย้อนหลัง: ก่อนหน้านี้ไม่มีทางใช้รหัสซ้ำ (code เป็น @unique และแก้รหัสไม่ได้)

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "originalCode" TEXT,
ADD COLUMN     "reusedAt" TIMESTAMP(3),
ADD COLUMN     "reusedFromId" INTEGER;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_reusedFromId_fkey" FOREIGN KEY ("reusedFromId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
