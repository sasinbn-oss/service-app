-- อะไหล่นอกสโตร์ (ไม่มี SKU) — เพิ่มคอลัมน์อย่างเดียว ไม่แตะข้อมูลเดิม
ALTER TABLE "SparePart" ADD COLUMN "offCatalog" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkOrderPart" ADD COLUMN "unit" TEXT;
ALTER TABLE "WorkOrderPart" ADD COLUMN "note" TEXT;
