-- หัวหน้าภาคดูแลได้หลายทีม (บันทึกแบ่งทีม 4 ต.ค. 69) ดู schema.prisma
ALTER TABLE "User" ADD COLUMN     "supervisedTeams" TEXT[] DEFAULT ARRAY[]::TEXT[];
