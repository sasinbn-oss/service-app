-- AlterTable
ALTER TABLE "Outage" ADD COLUMN     "noteUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "noteUpdatedById" INTEGER,
ADD COLUMN     "symptom" TEXT,
ADD COLUMN     "workStatus" TEXT;

-- AddForeignKey
ALTER TABLE "Outage" ADD CONSTRAINT "Outage_noteUpdatedById_fkey" FOREIGN KEY ("noteUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

