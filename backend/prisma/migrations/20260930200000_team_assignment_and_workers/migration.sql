-- AlterTable
ALTER TABLE "User" ADD COLUMN     "team" TEXT;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "assignedTeam" TEXT,
ADD COLUMN     "closeOtherWorkers" TEXT;

-- CreateTable
CREATE TABLE "WorkOrderWorker" (
    "id" SERIAL NOT NULL,
    "workOrderId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "WorkOrderWorker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrderWorker_userId_idx" ON "WorkOrderWorker"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderWorker_workOrderId_userId_key" ON "WorkOrderWorker"("workOrderId", "userId");

-- CreateIndex
CREATE INDEX "WorkOrder_assignedTeam_status_idx" ON "WorkOrder"("assignedTeam", "status");

-- AddForeignKey
ALTER TABLE "WorkOrderWorker" ADD CONSTRAINT "WorkOrderWorker_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderWorker" ADD CONSTRAINT "WorkOrderWorker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

