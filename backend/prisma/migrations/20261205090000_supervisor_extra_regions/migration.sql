-- หัวหน้าภาคเลือกได้หลายภาค (เจ้าของงานขอ ต.ค. 69) ดู schema.prisma
-- เพิ่มคอลัมน์อย่างเดียว ไม่ย้ายข้อมูล: region เดิมยังเป็นภาคแรก ภาคที่เพิ่มเก็บที่นี่
ALTER TABLE "User" ADD COLUMN     "extraRegions" TEXT[] DEFAULT ARRAY[]::TEXT[];
