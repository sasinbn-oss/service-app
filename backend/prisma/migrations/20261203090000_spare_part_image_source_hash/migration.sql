-- sha256 ของรูปต้นฉบับก่อนย่อ (อัปเดตอะไหล่จากไฟล์ Excel ที่รูปใหญ่) — ดู schema.prisma
ALTER TABLE "SparePartImage" ADD COLUMN "sourceHash" TEXT;
