-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "status" TEXT DEFAULT 'active';

-- AlterTable
ALTER TABLE "Machine" DROP COLUMN "lastTxnAt",
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "stateCode" TEXT;

-- CreateTable
CREATE TABLE "Outage" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "branchId" INTEGER NOT NULL,
    "machineId" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Outage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineImport" (
    "id" SERIAL NOT NULL,
    "uploadedById" INTEGER,
    "fileName" TEXT,
    "snapshotAt" TIMESTAMP(3) NOT NULL,
    "rowsInFile" INTEGER NOT NULL,
    "duplicateRows" INTEGER NOT NULL,
    "branchesTouched" INTEGER NOT NULL,
    "machinesOff" INTEGER NOT NULL,
    "branchesSignalLost" INTEGER NOT NULL,
    "opened" INTEGER NOT NULL,
    "closed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MachineImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Outage_kind_endedAt_idx" ON "Outage"("kind", "endedAt");

-- CreateIndex
CREATE INDEX "Outage_branchId_endedAt_idx" ON "Outage"("branchId", "endedAt");

-- AddForeignKey
ALTER TABLE "Outage" ADD CONSTRAINT "Outage_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outage" ADD CONSTRAINT "Outage_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

