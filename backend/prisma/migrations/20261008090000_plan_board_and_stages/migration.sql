-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "appointmentStatus" TEXT,
ADD COLUMN     "inspectedAt" TIMESTAMP(3),
ADD COLUMN     "inspectionNote" TEXT,
ADD COLUMN     "parentId" INTEGER,
ADD COLUMN     "scheduledTime" TEXT;

-- CreateTable
CREATE TABLE "TeamDayPlan" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "team" TEXT NOT NULL,
    "vehicleId" INTEGER,
    "note" TEXT,
    "plannedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamDayPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamDayPlanMember" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TeamDayPlanMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamDayPlan_date_team_key" ON "TeamDayPlan"("date", "team");

-- CreateIndex
CREATE UNIQUE INDEX "TeamDayPlanMember_planId_userId_key" ON "TeamDayPlanMember"("planId", "userId");

-- CreateIndex
CREATE INDEX "WorkOrder_scheduledAt_idx" ON "WorkOrder"("scheduledAt");

-- CreateIndex
CREATE INDEX "WorkOrder_parentId_idx" ON "WorkOrder"("parentId");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamDayPlan" ADD CONSTRAINT "TeamDayPlan_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamDayPlan" ADD CONSTRAINT "TeamDayPlan_plannedById_fkey" FOREIGN KEY ("plannedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamDayPlanMember" ADD CONSTRAINT "TeamDayPlanMember_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TeamDayPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamDayPlanMember" ADD CONSTRAINT "TeamDayPlanMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ใบที่นัดวันไปแล้วก่อนมีขั้นคอนเฟิร์มนัด ถือว่าลูกค้ารับนัดแล้ว — ตอนนั้นยังไม่มี
-- ขั้นให้รอ ใบเหล่านี้เดินไปถึง "รอช่างเข้างาน" แล้วจริง ๆ ปล่อยว่างไว้บอร์ดแผนงาน
-- จะขึ้นว่ายังไม่ได้คอนเฟิร์มทั้งที่ช่างกำลังจะไป
UPDATE "WorkOrder" SET "appointmentStatus" = 'CONFIRMED'
WHERE "scheduledAt" IS NOT NULL AND "status" IN ('IN_PROGRESS', 'DONE');
