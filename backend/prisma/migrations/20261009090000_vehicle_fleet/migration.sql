-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "actExpire" TIMESTAMP(3),
ADD COLUMN     "currentMileage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "insCompany" TEXT,
ADD COLUMN     "insExpire" TIMESTAMP(3),
ADD COLUMN     "insPolicy" TEXT,
ADD COLUMN     "lastOilDate" TIMESTAMP(3),
ADD COLUMN     "lastOilKm" INTEGER,
ADD COLUMN     "maintNote" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "oilEveryKm" INTEGER,
ADD COLUMN     "oilEveryMonths" INTEGER,
ADD COLUMN     "owner" TEXT,
ADD COLUMN     "taxExpire" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "VehicleLog" ADD COLUMN     "cost" INTEGER,
ADD COLUMN     "mileageGap" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "repairNote" TEXT,
ADD COLUMN     "returnNote" TEXT,
ADD COLUMN     "returnedById" INTEGER,
ADD COLUMN     "workOrderId" INTEGER;

-- CreateTable
CREATE TABLE "VehicleLogPhoto" (
    "id" SERIAL NOT NULL,
    "logId" INTEGER,
    "phase" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "thumbnail" BYTEA,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleLogPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleDoc" (
    "id" SERIAL NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "thumbnail" BYTEA,
    "uploadedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleMaintenance" (
    "id" SERIAL NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mileage" INTEGER,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "shop" TEXT,
    "detail" TEXT,
    "objectKey" TEXT,
    "thumbnail" BYTEA,
    "vehicleLogId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleLogPhoto_logId_idx" ON "VehicleLogPhoto"("logId");

-- CreateIndex
CREATE INDEX "VehicleLogPhoto_uploadedById_logId_idx" ON "VehicleLogPhoto"("uploadedById", "logId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleDoc_vehicleId_kind_key" ON "VehicleDoc"("vehicleId", "kind");

-- CreateIndex
CREATE INDEX "VehicleMaintenance_vehicleId_date_idx" ON "VehicleMaintenance"("vehicleId", "date");

-- CreateIndex
CREATE INDEX "VehicleLog_userId_status_idx" ON "VehicleLog"("userId", "status");

-- CreateIndex
CREATE INDEX "VehicleLog_vehicleId_startedAt_idx" ON "VehicleLog"("vehicleId", "startedAt");

-- AddForeignKey
ALTER TABLE "VehicleLog" ADD CONSTRAINT "VehicleLog_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleLog" ADD CONSTRAINT "VehicleLog_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleLogPhoto" ADD CONSTRAINT "VehicleLogPhoto_logId_fkey" FOREIGN KEY ("logId") REFERENCES "VehicleLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleLogPhoto" ADD CONSTRAINT "VehicleLogPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDoc" ADD CONSTRAINT "VehicleDoc_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDoc" ADD CONSTRAINT "VehicleDoc_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleMaintenance" ADD CONSTRAINT "VehicleMaintenance_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleMaintenance" ADD CONSTRAINT "VehicleMaintenance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- เลขไมล์ล่าสุดของรถที่มีอยู่แล้ว เอาจากรายการใช้รถล่าสุด — ไม่งั้นรถทุกคันเริ่มที่ 0
-- แล้วการเบิกครั้งแรกหลัง deploy จะโดนกฎ ±1,000 กม. ปฏิเสธทั้งหมด
UPDATE "Vehicle" v SET "currentMileage" = x.m
FROM (
  SELECT DISTINCT ON ("vehicleId") "vehicleId", COALESCE("endMileage", "startMileage") AS m
  FROM "VehicleLog" ORDER BY "vehicleId", "startedAt" DESC
) x
WHERE x."vehicleId" = v.id;
