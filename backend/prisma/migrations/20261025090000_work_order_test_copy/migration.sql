-- ใบทดสอบที่คัดลอกจากใบจริง
ALTER TABLE "WorkOrder" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "testOfId" INTEGER;
