-- นำเข้าใบแจ้งซ่อมจากไฟล์ฟอร์ม COCO — ลายนิ้วมือของแถวในไฟล์ กันนำเข้าซ้ำ (ว่างได้ ใบที่เปิดเองไม่มี)
ALTER TABLE "WorkOrder" ADD COLUMN "importKey" TEXT;
CREATE UNIQUE INDEX "WorkOrder_importKey_key" ON "WorkOrder"("importKey");
