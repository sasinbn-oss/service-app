-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "jobType" TEXT NOT NULL DEFAULT 'CM',
ADD COLUMN     "needsParts" BOOLEAN;

