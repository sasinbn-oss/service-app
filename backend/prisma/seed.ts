import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const vehicles = [
    { plateNumber: "1กก-1234", brand: "Toyota", model: "Hilux Revo", type: "กระบะ" },
    { plateNumber: "2ขข-5678", brand: "Honda", model: "City", type: "รถเก๋ง" },
  ];
  for (const vehicle of vehicles) {
    await prisma.vehicle.upsert({
      where: { plateNumber: vehicle.plateNumber },
      update: {},
      create: vehicle,
    });
  }

  const branches = [
    {
      name: "สำนักงานใหญ่",
      code: "HQ",
      address: "กรุงเทพมหานคร",
      latitude: 13.7563,
      longitude: 100.5018,
      radiusMeters: 300,
    },
    {
      name: "สาขาเชียงใหม่",
      code: "CNX",
      address: "เชียงใหม่",
      latitude: 18.7883,
      longitude: 98.9853,
      radiusMeters: 300,
    },
  ];
  for (const branch of branches) {
    await prisma.branch.upsert({
      where: { code: branch.code },
      update: {},
      create: branch,
    });
  }

  console.log("Seed data created. Register the first user via /api/auth/register to become ADMIN.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
