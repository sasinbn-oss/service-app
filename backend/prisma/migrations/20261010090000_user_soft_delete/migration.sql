-- ลบผู้ใช้ (Super Admin): คนที่มีประวัติแล้วถูกปิดบัญชีแทนการลบจริง ดู schema.prisma
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3);
