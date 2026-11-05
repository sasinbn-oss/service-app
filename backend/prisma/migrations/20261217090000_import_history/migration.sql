-- ประวัติการนำเข้า (เจ้าของงานอนุมัติตัวอย่าง 5 พ.ย. 69) — สองตารางใหม่ล้วน ไม่แตะตารางเดิม ไม่ใส่ข้อมูล
-- → ไม่ต้องเพิ่มชื่อใน SEEDED_BY_MIGRATION ของ scripts/restore-backup.js (แถวเกิดจากการใช้งานแอปเท่านั้น)
-- ไม่เติมย้อนหลัง: ใบแจ้งซ่อม/สาขา/รถ/รายชื่อไม่เคยมีประวัติให้เติม · อะไหล่กับรายงานเครื่องหน้าประวัติอ่านจากตารางเดิมของมัน
-- ImportRun.byUserId ไม่ผูก FK (แบบ SparePartImport) — ลบผู้ใช้ถาวรแล้วประวัติต้องยังอยู่

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "runKey" TEXT,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT,
    "byUserId" INTEGER,
    "byName" TEXT,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "rowsInFile" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB NOT NULL,
    "error" TEXT,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRunRow" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "line" INTEGER,
    "result" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT,
    "machine" TEXT,
    "detail" TEXT,
    "note" TEXT,
    "ref" TEXT,

    CONSTRAINT "ImportRunRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportRun_runKey_key" ON "ImportRun"("runKey");

-- CreateIndex
CREATE INDEX "ImportRun_startedAt_idx" ON "ImportRun"("startedAt");

-- CreateIndex
CREATE INDEX "ImportRun_kind_startedAt_idx" ON "ImportRun"("kind", "startedAt");

-- CreateIndex
CREATE INDEX "ImportRun_byUserId_fileHash_idx" ON "ImportRun"("byUserId", "fileHash");

-- CreateIndex
CREATE INDEX "ImportRunRow_runId_line_idx" ON "ImportRunRow"("runId", "line");

-- AddForeignKey
ALTER TABLE "ImportRunRow" ADD CONSTRAINT "ImportRunRow_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

