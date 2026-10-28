-- Maid (COCO) — ตำแหน่งใหม่ฝั่งสาขา COCO สิทธิ์เท่า Supervisor (COCO) แต่เห็นเฉพาะสาขาที่ประจำ (เจ้าของงานเพิ่ม ต.ค. 69)
-- ตารางใหม่อย่างเดียว ไม่แตะข้อมูลเดิม · ตำแหน่งเก็บเป็นข้อความใน User.role อยู่แล้ว ไม่ต้องเปลี่ยนคอลัมน์

-- CreateTable
CREATE TABLE "CocoMaidBranch" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CocoMaidBranch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CocoMaidBranch_branchId_idx" ON "CocoMaidBranch"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "CocoMaidBranch_userId_branchId_key" ON "CocoMaidBranch"("userId", "branchId");

-- AddForeignKey
ALTER TABLE "CocoMaidBranch" ADD CONSTRAINT "CocoMaidBranch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CocoMaidBranch" ADD CONSTRAINT "CocoMaidBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

