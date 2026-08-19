-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledNote" TEXT;

-- AlterTable
ALTER TABLE "Outage" ADD COLUMN     "closeReason" TEXT;

