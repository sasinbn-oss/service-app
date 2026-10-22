/**
 * ข้อมูลตัวอย่างเพิ่มจาก seed-test-fixtures — ให้ทีมทดสอบได้ครบทุกตำแหน่ง และชื่อดูเหมือนใช้งานจริง
 * รันครั้งเดียวตอนฐานข้อมูลว่าง (backend-start.sh) · ใบงานตัวอย่างสร้างผ่าน API ใน demo-orders.js
 */
const { createRequire } = require("module");
// สคริปต์อยู่นอกโฟลเดอร์ backend — หา @prisma/client กับ bcryptjs จาก backend ที่รันอยู่
const req = createRequire(process.cwd() + "/");
const { PrismaClient } = req("@prisma/client");
const bcrypt = req("bcryptjs");

const prisma = new PrismaClient();

(async () => {
  const passwordHash = await bcrypt.hash("test1234", 10);
  const people = [
    ["A001", { name: "อรวรรณ (แอดมิน)" }],
    ["S001", { name: "วีระ (หัวหน้าภาค)", region: "กลาง-ตะวันตก" }],
    ["T001", { name: "สมชาย ใจดี", team: "กรุงเทพ" }],
  ];
  for (const [code, data] of people) await prisma.user.update({ where: { employeeCode: code }, data });
  for (const u of [
    { employeeCode: "SA01", name: "สมศักดิ์ (Super Admin)", role: "SUPER_ADMIN" },
    { employeeCode: "SP01", name: "วิภา (Admin Spare Part)", role: "PARTS_ADMIN" },
  ]) {
    await prisma.user.upsert({
      where: { employeeCode: u.employeeCode },
      update: {},
      create: { ...u, passwordHash, mustChangePassword: false },
    });
  }
  const names = { C0001: "สาขาลาดพร้าว 71", C0006: "สาขาอุตรกิจ กระบี่", D0011: "สาขารามอินทรา (แฟรนไชส์)", D0012: "สาขาบางใหญ่ (แฟรนไชส์)" };
  for (const [code, name] of Object.entries(names)) await prisma.branch.update({ where: { code }, data: { name } });
  for (const p of [
    { partCode: "SP-MOTOR", name: "มอเตอร์ปั่นหมาด", brand: "Huebsch", category: "เครื่องซักผ้า" },
    { partCode: "SP-DOORLOCK", name: "ชุดล็อกประตู (Door lock)", brand: "Huebsch", category: "เครื่องซักผ้า" },
  ]) {
    await prisma.sparePart.upsert({ where: { partCode: p.partCode }, update: {}, create: p });
  }
  console.log("ข้อมูลตัวอย่าง: ผู้ใช้ A001 S001 T001 SA01 SP01 (รหัสผ่าน test1234)");
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
