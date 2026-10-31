-- เวลาปิดรับปล่อยงาน (เจ้าของงานขอ ต.ค. 69): งานพรุ่งนี้ปล่อยได้ถึงเวลานี้ของวันก่อนวันนัด — แอดมินเปลี่ยนได้
-- ตารางตั้งค่าเก็บทุกครั้งที่เปลี่ยนเป็นแถวใหม่ (ไม่แก้แถวเดิม) — แถวล่าสุดคือค่าตอนนี้ แถวก่อนหน้าบอกว่าเปลี่ยนจากอะไร
-- CreateTable
CREATE TABLE "AppSetting" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppSetting_key_id_idx" ON "AppSetting"("key", "id");

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- แถวแรก = ค่าตั้งต้น 16:00 และเวลาที่เริ่มใช้กฎ (createdAt) — ใบที่เส้นตายอยู่ก่อนเวลานี้ไม่ล็อกย้อนหลัง (คำถามข้อ 14)
-- ใส่แถวลงตารางเปล่า → ต้องอยู่ใน SEEDED_BY_MIGRATION ของ scripts/restore-backup.js
INSERT INTO "AppSetting" ("key", "value") VALUES ('dispatchCutoff', '16:00');

-- แอดมินแก้เป็นงานด่วน: วันนัดที่แอดมินปลดล็อกให้ (ไม่ใช่ true/false) — เลื่อนวันแล้วไม่ตรงกัน = หมดผลเอง
-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN "urgentReleaseFor" TIMESTAMP(3);
