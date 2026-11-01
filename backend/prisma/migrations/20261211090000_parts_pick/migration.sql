-- ช่างเลือกอะไหล่ตอนตรวจหน้างาน → หัวหน้าภาคคอนเฟิร์ม/ตีกลับ (เจ้าของงานขอ ต.ค. 69) — ตารางใหม่ ไม่ใส่ข้อมูลตั้งต้น
-- แยกจาก WorkOrderPart: ของที่ยังไม่คอนเฟิร์มต้องไม่ขึ้นกระดานติดตามเครื่องเสีย/รายงานอะไหล่ที่ต้องสั่ง
-- CreateTable
CREATE TABLE "PartsPick" (
    "id" SERIAL NOT NULL,
    "workOrderId" INTEGER NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "brandFile" TEXT,
    "team" TEXT,
    "note" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "reason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidNote" TEXT,

    CONSTRAINT "PartsPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartsPickItem" (
    "id" SERIAL NOT NULL,
    "pickId" INTEGER NOT NULL,
    "sparePartId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "mark" TEXT,

    CONSTRAINT "PartsPickItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartsPick_workOrderId_id_idx" ON "PartsPick"("workOrderId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PartsPickItem_pickId_sparePartId_key" ON "PartsPickItem"("pickId", "sparePartId");

-- CreateIndex
CREATE INDEX "PartsPickItem_sparePartId_idx" ON "PartsPickItem"("sparePartId");

-- AddForeignKey
ALTER TABLE "PartsPick" ADD CONSTRAINT "PartsPick_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsPick" ADD CONSTRAINT "PartsPick_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsPick" ADD CONSTRAINT "PartsPick_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsPickItem" ADD CONSTRAINT "PartsPickItem_pickId_fkey" FOREIGN KEY ("pickId") REFERENCES "PartsPick"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsPickItem" ADD CONSTRAINT "PartsPickItem_sparePartId_fkey" FOREIGN KEY ("sparePartId") REFERENCES "SparePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- อะไหล่อยู่ในไฟล์ยี่ห้อไหนบ้าง (เจ้าของงานตอบ 31 ต.ค. 69) — ไฟล์ = ชื่อไฟล์ Excel ที่อัปโหลด · รหัสเดียวอยู่ได้หลายไฟล์
-- แยกตาราง ไม่ใช่คอลัมน์ใน SparePart: updatedAt ของ SparePart คือตัวกันแคชรูปอะไหล่ — เขียนไฟล์ลงแถวอะไหล่แล้วรูปโหลดใหม่ทั้งระบบ
-- CreateTable
CREATE TABLE "SparePartBrandFile" (
    "id" SERIAL NOT NULL,
    "sparePartId" INTEGER NOT NULL,
    "file" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'IMPORT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SparePartBrandFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SparePartBrandFile_sparePartId_file_key" ON "SparePartBrandFile"("sparePartId", "file");

-- CreateIndex
CREATE INDEX "SparePartBrandFile_file_sparePartId_idx" ON "SparePartBrandFile"("file", "sparePartId");

-- AddForeignKey
ALTER TABLE "SparePartBrandFile" ADD CONSTRAINT "SparePartBrandFile_sparePartId_fkey" FOREIGN KEY ("sparePartId") REFERENCES "SparePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ไฟล์ยี่ห้อของการอัปโหลดแต่ละครั้ง (1 ไฟล์ Excel = 1 ไฟล์ยี่ห้อ) — หัวช่องเลือกอะไหล่ "อัปเดต {วันที่}" อ่านจากที่นี่
-- AlterTable
ALTER TABLE "SparePartImport" ADD COLUMN "brandFile" TEXT;

-- CreateIndex
CREATE INDEX "SparePartImport_brandFile_createdAt_idx" ON "SparePartImport"("brandFile", "createdAt");

-- วันขึ้นระบบ: ตั้งไฟล์ให้อะไหล่จากช่อง "ยี่ห้อสินค้า" เดิม ("HB - Huebsch" "OS - OASIS" …) ให้ล็อกยี่ห้อใช้ได้ทันที
-- ช่องนี้ = ยี่ห้อของไฟล์ที่อัปทีหลังสุด จึงถูกแต่ไม่ครบ (รหัสที่อยู่สองไฟล์ได้ไฟล์เดียว) — แอดมินอัปโหลดครบ 6 ไฟล์อีกรอบหลังขึ้นระบบ
-- ชื่อเต็มก่อน แล้วตัวย่อสองตัวอักษรแบบเป็นคำ (HB เดี่ยว ๆ = Huebsch ตามที่เจ้าของงานยืนยัน)
-- ตัวย่อ HA/MT/OS/SZ/OT ใช้ที่นี่ที่เดียว — ชื่อไฟล์กับยี่ห้อเครื่องจับเฉพาะชื่อเต็ม + "HB" ตามคำที่เจ้าของงานให้มา
-- ภายใต้ ~* ช่อง [^a-z] ไม่สนตัวพิมพ์ด้วย (ไม่รับ A–Z) — "THB" จึงไม่ใช่ Huebsch ส่วนไทย ตัวเลข เว้นวรรค - _ . นับเป็นขอบคำ
-- ข้อความที่ไม่ตรงคำไหนเลย = ไม่ใส่ไฟล์ ไม่เดาเป็น Other — Other ขึ้นให้ทุกเครื่องเลือก เดาผิดอะไหล่จะหลุดไปทุกยี่ห้อ
-- ใส่แถวลงตารางเปล่า → SparePartBrandFile อยู่ใน SEEDED_BY_MIGRATION ของ scripts/restore-backup.js
-- (ฐานใหม่ไม่มีอะไหล่ คำสั่งนี้จึงได้ 0 แถว แต่ใส่ชื่อไว้ตามกติกา)
INSERT INTO "SparePartBrandFile" ("sparePartId", "file", "source")
SELECT p.id, f.file, 'SEED'
FROM "SparePart" p
CROSS JOIN LATERAL (SELECT CASE
    WHEN p.brand ~* 'huebsch' OR p.brand ~* '(^|[^a-z])hb([^a-z]|$)' THEN 'Huebsch'
    WHEN p.brand ~* 'oasis'   OR p.brand ~* '(^|[^a-z])os([^a-z]|$)' THEN 'Oasis'
    WHEN p.brand ~* 'haier'   OR p.brand ~* '(^|[^a-z])ha([^a-z]|$)' THEN 'Haier'
    WHEN p.brand ~* 'maytag'  OR p.brand ~* '(^|[^a-z])mt([^a-z]|$)' THEN 'Maytag'
    WHEN p.brand ~* 'spinz'   OR p.brand ~* '(^|[^a-z])sz([^a-z]|$)' THEN 'Spinz'
    WHEN p.brand ~* 'other'   OR p.brand ~* '(^|[^a-z])ot([^a-z]|$)' THEN 'Other'
  END AS file) f
WHERE NOT p."offCatalog" AND f.file IS NOT NULL;

-- การอัปโหลดก่อนหน้านี้: ไฟล์ยี่ห้อจากชื่อไฟล์ (กติกาเดียวกับตอนอัปโหลด — ตรงไฟล์เดียวเท่านั้น ไม่ตรง/ตรงหลายไฟล์ = ว่าง)
-- ให้หัวช่องเลือกอะไหล่มีวันที่อัปเดตตั้งแต่วันแรก ไม่ต้องรอแอดมินอัปโหลดใหม่
UPDATE "SparePartImport" i SET "brandFile" = m.file
FROM (
  SELECT s.id, min(f.file) AS file, count(*) AS n
  FROM "SparePartImport" s
  JOIN (VALUES ('Haier','haier'), ('Huebsch','huebsch'), ('Maytag','maytag'), ('Oasis','oasis'), ('Spinz','spinz'), ('Other','other')) AS f(file, word)
    ON s."fileName" ~* f.word OR (f.file = 'Huebsch' AND s."fileName" ~* '(^|[^a-z])hb([^a-z]|$)')
  GROUP BY s.id
) m
WHERE i.id = m.id AND m.n = 1;
