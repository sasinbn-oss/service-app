-- ชื่อทีมเดิม → ชื่อใหม่ (แอดมินเปลี่ยนในแอป) ให้ตัวนำเข้าไฟล์แปลงชื่อเดิมให้ ดู schema.prisma
-- CreateTable
CREATE TABLE "TeamRename" (
    "id" SERIAL NOT NULL,
    "fromName" TEXT NOT NULL,
    "toName" TEXT NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamRename_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamRename_fromName_key" ON "TeamRename"("fromName");

