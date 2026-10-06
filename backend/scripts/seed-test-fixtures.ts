/**
 * ข้อมูลตั้งต้นที่เทสต์ใน tests/ ต้องใช้
 *
 * แยกจาก prisma/seed.ts เพราะคนละเรื่องกัน — seed หลักคือข้อมูลตัวอย่างสำหรับ
 * คนที่เพิ่งตั้งระบบใหม่ ส่วนไฟล์นี้คือฉากที่เทสต์ต้องการ (ผู้ใช้สามตำแหน่ง
 * สาขาบริษัท สาขาแฟรนไชส์คนละฝั่งของเส้นประกัน และอะไหล่สองตัว)
 * ถ้าเอาไปปนกัน ระบบจริงจะมีบัญชีทดสอบรหัสผ่านง่าย ๆ ติดไปด้วย
 *
 * รันซ้ำได้ ใช้ upsert ทั้งหมด ไม่ลบอะไรที่มีอยู่แล้ว
 *
 *   cd backend && npm run seed:test
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** รหัสผ่านเดียวกันหมด เป็นข้อมูลทดสอบ ไม่ใช่ของจริง */
const TEST_PASSWORD = "test1234";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  // กันเผลอรันใส่ฐานข้อมูลจริง — บัญชีรหัสผ่าน test1234 ไม่ควรไปโผล่ที่นั่น
  if (/supabase|amazonaws|render/i.test(url) && !process.env.ALLOW_REMOTE_FIXTURES) {
    console.error(
      "DATABASE_URL ชี้ไปที่ฐานข้อมูลบนคลาวด์ — ไฟล์นี้สร้างบัญชีทดสอบรหัสผ่านง่าย\n" +
        "ถ้าตั้งใจจริงให้ตั้ง ALLOW_REMOTE_FIXTURES=1 ก่อน"
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const users = [
    { employeeCode: "A001", name: "Admin", role: "ADMIN" },
    { employeeCode: "S001", name: "หัวหน้าภาคทดสอบ", role: "SUPERVISOR" },
    { employeeCode: "T001", name: "ช่างสมชาย", role: "EMPLOYEE" },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { employeeCode: u.employeeCode },
      // ไม่ทับ region/team ที่เทสต์ตั้งเอง แต่คืนรหัสผ่านกับตำแหน่งให้ตรงเสมอ
      update: { passwordHash, role: u.role, mustChangePassword: false },
      create: { ...u, passwordHash, mustChangePassword: false },
    });
  }

  // สาขาบริษัท — รหัสขึ้นต้น C จึงไม่มีเรื่องประกัน
  // สองสาขาคนละภาค เพราะบางชุดตรวจเรื่องขอบเขตของหัวหน้าภาคด้วย
  const company = [
    {
      code: "C0001",
      name: "สาขาทดสอบกรุงเทพ",
      address: "กรุงเทพมหานคร",
      region: "กลาง-ตะวันตก",
      zone: "กรุงเทพ",
      pmTeam: "กรุงเทพ",
      openedAt: new Date("2021-05-10"),
      latitude: 13.7563,
      longitude: 100.5018,
    },
    {
      code: "C0006",
      name: "ถนนอุตรกิจ กระบี่",
      address: "กระบี่",
      region: "ใต้",
      zone: "กระบี่",
      pmTeam: "กระบี่",
      openedAt: new Date("2022-02-18"),
      latitude: 8.0863,
      longitude: 98.9063,
    },
  ];
  for (const b of company) {
    await prisma.branch.upsert({
      where: { code: b.code },
      update: {},
      create: { ...b, ownership: "COCO", radiusMeters: 300 },
    });
  }

  /**
   * สาขาแฟรนไชส์สองแห่ง คนละฝั่งของเส้นประกัน 3 ปี
   *
   * quote-test ต้องมีทั้งสองแบบถึงจะตรวจได้ว่ากฎประกันทำงาน — เปิดเกิน 3 ปี
   * ต้องเสนอราคา ส่วนเปิดไม่ถึง 3 ปียังอยู่ในประกันจึงข้ามขั้นนั้น
   */
  const now = new Date();
  const longAgo = new Date(now);
  longAgo.setFullYear(longAgo.getFullYear() - 8);
  const recently = new Date(now);
  recently.setFullYear(recently.getFullYear() - 1);

  const franchises = [
    { code: "D0011", name: "สาขาแฟรนไชส์หมดประกัน", openedAt: longAgo },
    { code: "D0012", name: "สาขาแฟรนไชส์ยังในประกัน", openedAt: recently },
  ];
  for (const f of franchises) {
    await prisma.branch.upsert({
      where: { code: f.code },
      update: { openedAt: f.openedAt },
      create: {
        code: f.code,
        name: f.name,
        address: "กรุงเทพมหานคร",
        region: "กลาง-ตะวันตก",
        zone: "กรุงเทพ",
        pmTeam: "กรุงเทพ",
        ownership: "FRANCHISE",
        openedAt: f.openedAt,
        latitude: 13.7563,
        longitude: 100.5018,
        radiusMeters: 300,
      },
    });
  }

  const parts = [
    { partCode: "SP-BOARD", name: "บอร์ดควบคุม" },
    { partCode: "SP-BELT", name: "สายพาน" },
  ];
  for (const p of parts) {
    await prisma.sparePart.upsert({
      where: { partCode: p.partCode },
      update: {},
      create: p,
    });
  }

  console.log(
    `เตรียมข้อมูลเทสต์แล้ว — ผู้ใช้ ${users.map((u) => u.employeeCode).join("/")} ` +
      `(รหัสผ่าน ${TEST_PASSWORD}) · สาขา C0001 C0006 D0011 D0012 · อะไหล่ SP-BOARD SP-BELT`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
