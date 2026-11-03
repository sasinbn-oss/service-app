/**
 * ข้อมูลตั้งต้นที่เทสต์ใน tests/ ต้องใช้
 *
 * แยกจาก prisma/seed.ts เพราะคนละเรื่องกัน — seed หลักคือข้อมูลตัวอย่างสำหรับ
 * คนที่เพิ่งตั้งระบบใหม่ ส่วนไฟล์นี้คือฉากที่เทสต์ต้องการ (ผู้ใช้สามตำแหน่ง
 * สาขาบริษัท สาขาแฟรนไชส์คนละฝั่งของเส้นประกัน และอะไหล่สองตัวกับตัวแฝดแยกยี่ห้อ)
 * ถ้าเอาไปปนกัน ระบบจริงจะมีบัญชีทดสอบรหัสผ่านง่าย ๆ ติดไปด้วย
 *
 * รันซ้ำได้ ใช้ upsert ทั้งหมด ไม่ลบอะไรที่มีอยู่แล้ว — ยกเว้นไฟล์ยี่ห้อส่วนเกินของอะไหล่ทดสอบ (ตัวแฝดต้องอยู่ไฟล์เดียว ดูข้างล่าง)
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
      // ภาคที่เพิ่ม (extraRegions) ล้างทุกครั้ง — ไม่มีเทสต์ไหนพึ่งค่าค้าง และเทสต์หลายภาคที่ล้มกลางทางจะไม่ลาก
      // ภาคแถมไปให้ S001 ในชุดอื่นอีกเป็นพันข้อ (เห็นใบเกินมาแล้วผลเพี้ยนแบบหาสาเหตุยาก) · ทีมที่เพิ่ม (extraTeams) เหตุผลเดียวกัน
      update: { passwordHash, role: u.role, mustChangePassword: false, extraRegions: [], extraTeams: [] },
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

  /**
   * อะไหล่ทดสอบแยกไฟล์ตามยี่ห้อ — เตรียมไว้ก่อนกฎ "เลือกอะไหล่ได้เฉพาะไฟล์ยี่ห้อของเครื่อง และของใช้ร่วม (ไฟล์ Other)" จะเปิด
   *
   * กฎนั้นปฏิเสธอะไหล่ที่ไม่อยู่ในไฟล์ไหนและอะไหล่ไฟล์ยี่ห้ออื่นจากทุกเส้นทาง ถ้าเทสต์ยังส่ง SP-BOARD ตัวเดียว
   * (เดิมไม่มียี่ห้อ) ให้ทุกเครื่อง จะพังทั้งชุดทั้งที่แอปไม่ได้ผิด
   * SP-BOARD/SP-BELT เป็น Oasis เพราะ tests/browser/fixture.js เปิดใบงานเครื่อง W77 "Oasis" เสมอ
   * ตัวแฝด -HB/-HA/-MT/-SZ/-OT คือชิ้นเดียวกันในไฟล์อื่น ให้เครื่องยี่ห้ออื่นมีอะไหล่ตรงไฟล์
   * (Spinz เป็นไฟล์ที่ 6 ที่เจ้าของงานบอกมา 31 ต.ค. 69 — ยังไม่มีเครื่องทดสอบยี่ห้อนี้ แต่ชุดเทสต์ล็อกยี่ห้อต้องมีของให้เลือก)
   * ใบไหนได้ตัวไหน ตัดสินที่ fx_part (tests/lib/fixture-parts.sh) ที่เดียว — fxPart ฝั่งเบราว์เซอร์เรียกตัวเดียวกัน
   *
   * ชื่อตัวแฝด = ชื่อเดิมต่อท้ายยี่ห้อ: รายการอะไหล่เรียงตามชื่อ และหลายชุดหยิบแถวแรกของผลค้น "SP-BOARD"
   * ชื่อที่ยาวกว่าเรียงหลังตัวเดิมเสมอ ถ้าชื่อซ้ำกันเป๊ะ ลำดับจะสุ่มแล้วเทสต์ได้คนละตัวในแต่ละรอบ
   * update ทับยี่ห้อทุกครั้ง (ไม่ทับชื่อ) — ให้ข้อความยี่ห้อที่แสดงและค้นตรงกับตัวแฝด ใครแก้ค้างไว้ รันซ้ำแล้วกลับมาถูก
   * ช่อง brand ไม่ใช่สิ่งที่กฎดู — กฎอ่านไฟล์จาก SparePartBrandFile ซึ่งซ่อมให้ตรงที่ transaction ข้างล่าง
   * (ตัวแฝดถูกปฏิเสธว่า "ไม่อยู่ในไฟล์ไหน" แก้ brand ไม่ช่วย — รัน seed:test ใหม่)
   */
  const brandTwins = [
    { suffix: "", brand: "Oasis" },
    { suffix: "-HB", brand: "Huebsch" },
    { suffix: "-HA", brand: "Haier" },
    { suffix: "-MT", brand: "Maytag" },
    { suffix: "-SZ", brand: "Spinz" },
    { suffix: "-OT", brand: "Other" },
  ];
  const baseParts = [
    { partCode: "SP-BOARD", name: "บอร์ดควบคุม" },
    { partCode: "SP-BELT", name: "สายพาน" },
  ];
  const parts = baseParts.flatMap((b) =>
    brandTwins.map((t) => ({
      partCode: b.partCode + t.suffix,
      name: t.suffix ? `${b.name} (${t.brand})` : b.name,
      brand: t.brand,
    }))
  );
  const twinFiles: { sparePartId: number; file: string }[] = [];
  for (const p of parts) {
    const row = await prisma.sparePart.upsert({
      where: { partCode: p.partCode },
      update: { brand: p.brand },
      create: p,
      select: { id: true },
    });
    // ชื่อยี่ห้อของตัวแฝดตั้งให้ตรงกับชื่อไฟล์ (BRAND_FILES) อยู่แล้ว จึงใช้เป็นชื่อไฟล์ได้ตรง ๆ
    twinFiles.push({ sparePartId: row.id, file: p.brand });
  }
  /**
   * ตัวแฝดแต่ละตัวอยู่ในไฟล์ยี่ห้อของตัวเองไฟล์เดียวเป๊ะ — กฎล็อกยี่ห้ออ่านไฟล์จาก SparePartBrandFile ไม่ใช่ช่อง brand
   * (เจ้าของงานตอบ 31 ต.ค. 69: ไฟล์ของอะไหล่มาจากชื่อไฟล์ที่อัปโหลด) ตัวแฝดที่ไม่มีแถวที่นี่ = "ไม่อยู่ในไฟล์ไหน" ถูกปฏิเสธทุกเส้นทาง
   * ลบไฟล์อื่นที่ค้างอยู่ทิ้งด้วย: ตัวแฝดที่หลุดไปอยู่ไฟล์ Other เพิ่มจะขึ้นให้ทุกเครื่องเลือก เทสต์ "ต่างยี่ห้อต้องถูกปฏิเสธ" จะผ่านผิด ๆ
   * ฐานที่ migrate แล้วมีแถวจากช่องยี่ห้อ (source SEED) อยู่แล้ว — ตรงนี้สำคัญกับฐานใหม่ (migrate ก่อนแล้วค่อย seed) และตัวแฝด Spinz
   * ชุดคำสั่งแบบไม่โต้ตอบ (array) ไม่ติดเพดาน 5 วินาทีของ interactive transaction
   */
  await prisma.$transaction([
    prisma.sparePartBrandFile.deleteMany({
      where: { OR: twinFiles.map((t) => ({ sparePartId: t.sparePartId, file: { not: t.file } })) },
    }),
    prisma.sparePartBrandFile.createMany({
      data: twinFiles.map((t) => ({ ...t, source: "MANUAL" })),
      skipDuplicates: true,
    }),
  ]);

  console.log(
    `เตรียมข้อมูลเทสต์แล้ว — ผู้ใช้ ${users.map((u) => u.employeeCode).join("/")} ` +
      `(รหัสผ่าน ${TEST_PASSWORD}) · สาขา C0001 C0006 D0011 D0012 · อะไหล่ SP-BOARD SP-BELT (ไฟล์ Oasis) ` +
      `กับตัวแฝด ${brandTwins.filter((t) => t.suffix).map((t) => `${t.suffix} ${t.brand}`).join(" · ")} (ตัวละไฟล์)`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
