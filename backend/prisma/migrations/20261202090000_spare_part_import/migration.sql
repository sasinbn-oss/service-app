-- Part No. ของผู้ผลิต + ประวัติอัปเดตอะไหล่จากไฟล์ Excel (เจ้าของงานขอ ต.ค. 69)
ALTER TABLE "SparePart" ADD COLUMN "partNo" TEXT;

CREATE TABLE "SparePartImport" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batchId" TEXT NOT NULL,
    "byUserId" INTEGER,
    "byName" TEXT,
    "fileName" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "details" JSONB NOT NULL,
    CONSTRAINT "SparePartImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SparePartImport_batchId_idx" ON "SparePartImport"("batchId");
CREATE INDEX "SparePartImport_createdAt_idx" ON "SparePartImport"("createdAt");
