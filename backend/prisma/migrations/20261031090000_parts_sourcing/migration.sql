-- ขั้นรอเบิกอะไหล่ (ก่อนเสนอราคา) — วันที่คาดว่าอะไหล่ที่หมดจะเข้า
ALTER TABLE "WorkOrder" ADD COLUMN "partsExpectedAt" TIMESTAMP(3);
