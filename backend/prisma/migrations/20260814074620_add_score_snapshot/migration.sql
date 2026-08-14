-- AlterTable
ALTER TABLE "MachineImport" ADD COLUMN     "machineOffScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "signalLostScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalScore" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ScoreSnapshot" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER,
    "snapshotAt" TIMESTAMP(3) NOT NULL,
    "branchId" INTEGER NOT NULL,
    "region" TEXT,
    "zone" TEXT,
    "ownership" TEXT,
    "grade" TEXT,
    "kind" TEXT NOT NULL,
    "cases" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "breached" INTEGER NOT NULL,

    CONSTRAINT "ScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoreSnapshot_snapshotAt_idx" ON "ScoreSnapshot"("snapshotAt");

-- CreateIndex
CREATE INDEX "ScoreSnapshot_branchId_snapshotAt_idx" ON "ScoreSnapshot"("branchId", "snapshotAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreSnapshot_importId_branchId_kind_key" ON "ScoreSnapshot"("importId", "branchId", "kind");

-- AddForeignKey
ALTER TABLE "ScoreSnapshot" ADD CONSTRAINT "ScoreSnapshot_importId_fkey" FOREIGN KEY ("importId") REFERENCES "MachineImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSnapshot" ADD CONSTRAINT "ScoreSnapshot_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

