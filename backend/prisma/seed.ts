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

  const spareParts = [
    {
      partCode: "CP-0101",
      name: "คอมเพรสเซอร์แอร์ 12000 BTU",
      brand: "Panasonic",
      description: "คอมเพรสเซอร์สำหรับแอร์ผนัง ขนาด 12000 BTU",
    },
    {
      partCode: "FM-0203",
      name: "มอเตอร์พัดลมคอยล์เย็น",
      brand: "Mitsubishi",
      description: "มอเตอร์พัดลมคอยล์เย็น 30W",
    },
    {
      partCode: "CB-0305",
      name: "แผงวงจรควบคุม",
      brand: "Daikin",
      description: "แผงวงจรควบคุมหลักสำหรับแอร์ inverter",
    },
    {
      partCode: "FT-0410",
      name: "ฟิลเตอร์กรองอากาศ",
      brand: "Panasonic",
      description: "แผ่นกรองอากาศ ใช้ได้กับแอร์ผนังทุกรุ่น",
    },
  ];
  for (const part of spareParts) {
    await prisma.sparePart.upsert({
      where: { partCode: part.partCode },
      update: {},
      create: part,
    });
  }

  const guides = [
    {
      category: "เครื่องปรับอากาศ",
      title: "แอร์ไม่เย็น แต่พัดลมยังทำงาน",
      symptom: "ลมออกจากแอร์ปกติ แต่ไม่มีความเย็น คอมเพรสเซอร์ไม่ทำงาน",
      solution:
        "1. ตรวจสอบแรงดันน้ำยา หากต่ำกว่าปกติแสดงว่ามีการรั่ว ให้หาจุดรั่วและเติมน้ำยา\n" +
        "2. ตรวจสอบคาปาซิเตอร์ของคอมเพรสเซอร์ หากบวมหรือค่าความจุตก ให้เปลี่ยนใหม่\n" +
        "3. ตรวจสอบแผงวงจรควบคุมว่าส่งสัญญาณไปยังคอมเพรสเซอร์หรือไม่",
    },
    {
      category: "เครื่องปรับอากาศ",
      title: "มีน้ำหยดจากคอยล์เย็น",
      symptom: "มีน้ำหยดออกมาจากตัวเครื่องด้านใน ทำให้ผนังเปียก",
      solution:
        "1. ตรวจสอบท่อน้ำทิ้งว่ามีการอุดตันหรือไม่ ใช้ปั๊มลมเป่าไล่สิ่งอุดตัน\n" +
        "2. ตรวจสอบระดับการติดตั้งเครื่อง ต้องเอียงไปทางท่อน้ำทิ้งเล็กน้อย\n" +
        "3. ล้างคอยล์เย็นหากมีฝุ่นอุดตันจนน้ำไม่ไหลลงถาดรองน้ำ",
    },
    {
      category: "เครื่องปรับอากาศ",
      title: "แอร์มีเสียงดังผิดปกติ",
      symptom: "ได้ยินเสียงดังครืดคราดหรือเสียงหวีดจากคอยล์ร้อนหรือคอยล์เย็น",
      solution:
        "1. ตรวจสอบใบพัดลมว่ามีสิ่งแปลกปลอมติดอยู่หรือไม่\n" +
        "2. ตรวจสอบลูกปืนมอเตอร์พัดลม หากหลวมหรือแห้งให้เปลี่ยนมอเตอร์\n" +
        "3. ตรวจสอบน็อตยึดเครื่องว่าหลวมหรือไม่ ขันให้แน่น",
    },
    {
      category: "ระบบไฟฟ้า",
      title: "เบรกเกอร์ตัดบ่อย",
      symptom: "เบรกเกอร์ตัดทุกครั้งที่เปิดเครื่อง หรือตัดหลังใช้งานไปสักพัก",
      solution:
        "1. วัดกระแสขณะใช้งานเทียบกับพิกัดเบรกเกอร์ หากเกินให้ตรวจสอบโหลด\n" +
        "2. ตรวจสอบค่าความเป็นฉนวนของมอเตอร์และคอมเพรสเซอร์ด้วยเมกโอห์มมิเตอร์\n" +
        "3. ตรวจสอบสายไฟว่ามีรอยไหม้หรือลัดวงจรหรือไม่",
    },
  ];
  for (const guide of guides) {
    const exists = await prisma.troubleshootingGuide.findFirst({
      where: { title: guide.title },
    });
    if (!exists) {
      await prisma.troubleshootingGuide.create({ data: guide });
    }
  }

  const consumables = [
    { name: "เทปพันสายไฟ", unit: "ม้วน", stockQty: 50 },
    { name: "น็อตยึดเครื่อง เบอร์ 8", unit: "ตัว", stockQty: 200 },
    { name: "ถุงมือผ้า", unit: "คู่", stockQty: 80 },
    { name: "น้ำยาล้างคอยล์", unit: "ขวด", stockQty: 30 },
    { name: "ผ้าเช็ดทำความสะอาด", unit: "ผืน", stockQty: 100 },
  ];
  for (const item of consumables) {
    const exists = await prisma.consumableItem.findFirst({ where: { name: item.name } });
    if (!exists) {
      await prisma.consumableItem.create({ data: item });
    }
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
