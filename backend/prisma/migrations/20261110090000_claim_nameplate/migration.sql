-- ข้อมูลป้ายรุ่นที่สแกน + เช็คตามคู่มือ ของใบเคลมอะไหล่ (เพิ่มคอลัมน์ว่าง ไม่แตะข้อมูลเดิม)
ALTER TABLE "PartClaim" ADD COLUMN "nameplate" JSONB,
ADD COLUMN "fieldCheck" JSONB;
