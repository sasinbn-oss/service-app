-- ช่วงเวลาที่ผู้ใช้ใช้แอปอยู่ (แถวละ 5 นาทีต่อคน)
CREATE TABLE "UsageSlot" (
    "userId" INTEGER NOT NULL,
    "slot" TIMESTAMP(3) NOT NULL,
    "device" TEXT NOT NULL,
    CONSTRAINT "UsageSlot_pkey" PRIMARY KEY ("userId","slot")
);
CREATE INDEX "UsageSlot_slot_idx" ON "UsageSlot"("slot");
ALTER TABLE "UsageSlot" ADD CONSTRAINT "UsageSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
