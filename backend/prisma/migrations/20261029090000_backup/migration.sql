-- ไฟล์สำรองข้อมูลรายวัน (Super Admin) — ตัวไฟล์อยู่ในที่เก็บไฟล์ ตารางนี้จำรายการไว้
CREATE TABLE "Backup" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "dayKey" TEXT,
    "byUserId" INTEGER,
    "byName" TEXT,
    "excelKey" TEXT NOT NULL,
    "excelBytes" INTEGER NOT NULL,
    "dataKey" TEXT NOT NULL,
    "dataBytes" INTEGER NOT NULL,
    "summary" JSONB,

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Backup_dayKey_key" ON "Backup"("dayKey");
