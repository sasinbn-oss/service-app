-- บัตรเติมน้ำมัน / Easy Pass ของรถ — ตารางแยก อ่านเฉพาะเส้นทางของแอดมิน (ดู schema.prisma)
CREATE TABLE "VehicleCard" (
    "vehicleId" INTEGER NOT NULL,
    "fleetCardNo" TEXT,
    "fleetCardLimit" INTEGER,
    "easyPassNo" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleCard_pkey" PRIMARY KEY ("vehicleId")
);

ALTER TABLE "VehicleCard" ADD CONSTRAINT "VehicleCard_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
