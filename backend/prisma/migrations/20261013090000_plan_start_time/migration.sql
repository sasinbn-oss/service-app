-- เวลาเข้าหน้างานของทีม (HH:MM) ในแผนรายวัน ดู schema.prisma
ALTER TABLE "TeamDayPlan" ADD COLUMN     "startTime" TEXT;
