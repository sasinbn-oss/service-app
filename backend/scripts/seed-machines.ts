/**
 * ใส่ข้อมูลตัวอย่างของแดชบอร์ดเครื่องดับ
 *
 *   npx ts-node scripts/seed-machines.ts
 *
 * ชุดนี้ยกมาจากตัวอย่างที่ใช้ออกแบบหน้าจอ เพื่อให้เห็นหน้าตาจริงก่อนต่อข้อมูล
 * จากระบบเก็บเงิน เวลา lastTxn เก็บเป็น "กี่ชั่วโมงก่อนตอนรัน" ไม่ใช่วันที่ตายตัว
 * ข้อมูลจะได้ไม่กลายเป็นของเก่าค้างปีเมื่อรันอีกครั้งในอีกหลายเดือน
 */
import { prisma } from "../src/prisma";

interface Row {
  ownership: "COCO" | "DODO";
  region: string;
  branchCode: string;
  branchName: string;
  zone: string;
  machineCode: string;
  grade: "A" | "B" | "C";
  /** ทำรายการล่าสุดเมื่อกี่ชั่วโมงที่แล้ว */
  hoursAgo: number;
}

const ROWS: Row[] = [
  // COCO — ภาคกลางตะวันตก
  { ownership: "COCO", region: "ภาคกลางตะวันตก", branchCode: "CO0101", branchName: "รพ.ศิริราช อาคารผู้ป่วยนอก", zone: "BK01", machineCode: "W3", grade: "A", hoursAgo: 5 },
  { ownership: "COCO", region: "ภาคกลางตะวันตก", branchCode: "CO0102", branchName: "อาคารเอ็มไพร์ ทาวเวอร์ ชั้น G", zone: "BK01", machineCode: "W12", grade: "A", hoursAgo: 8 },
  { ownership: "COCO", region: "ภาคกลางตะวันตก", branchCode: "CO0210", branchName: "BTS อโศก ทางออก 3", zone: "BK02", machineCode: "D5", grade: "B", hoursAgo: 18 },
  { ownership: "COCO", region: "ภาคกลางตะวันตก", branchCode: "CO0215", branchName: "ม.เกษตรศาสตร์ อาคาร 15", zone: "BK02", machineCode: "W18", grade: "B", hoursAgo: 53 },
  { ownership: "COCO", region: "ภาคกลางตะวันตก", branchCode: "CO0304", branchName: "เซ็นทรัล ศาลายา ชั้น 1", zone: "NPT", machineCode: "D9", grade: "C", hoursAgo: 3 },

  // COCO — ภาคอีสานเหนือ
  { ownership: "COCO", region: "ภาคอีสานเหนือ", branchCode: "CO1012", branchName: "ม.ขอนแก่น คณะวิศวกรรมศาสตร์", zone: "KKN", machineCode: "W1", grade: "A", hoursAgo: 4 },
  { ownership: "COCO", region: "ภาคอีสานเหนือ", branchCode: "CO1019", branchName: "รพ.ศรีนครินทร์ ผู้ป่วยใน", zone: "KKN", machineCode: "D14", grade: "B", hoursAgo: 18 },
  { ownership: "COCO", region: "ภาคอีสานเหนือ", branchCode: "CO1207", branchName: "เซ็นทรัล อุดรธานี ชั้น G", zone: "UDN", machineCode: "W7", grade: "B", hoursAgo: 6 },
  { ownership: "COCO", region: "ภาคอีสานเหนือ", branchCode: "CO1211", branchName: "สนามบินอุดรธานี ผู้โดยสารขาออก", zone: "UDN", machineCode: "D20", grade: "C", hoursAgo: 93 },

  // COCO — ภาคตะวันออก
  { ownership: "COCO", region: "ภาคตะวันออก", branchCode: "CO2021", branchName: "รพ.ชลบุรี อาคารผู้ป่วยนอก", zone: "CBI", machineCode: "W4", grade: "A", hoursAgo: 2 },
  { ownership: "COCO", region: "ภาคตะวันออก", branchCode: "CO2028", branchName: "เทอร์มินอล 21 พัทยา ชั้น 1", zone: "CBI", machineCode: "D11", grade: "A", hoursAgo: 9 },
  { ownership: "COCO", region: "ภาคตะวันออก", branchCode: "CO2109", branchName: "นิคมฯ มาบตาพุด อาคารสำนักงาน", zone: "RYG", machineCode: "W16", grade: "B", hoursAgo: 7 },

  // COCO — ภาคใต้
  { ownership: "COCO", region: "ภาคใต้", branchCode: "CO3015", branchName: "เซ็นทรัล หาดใหญ่ ชั้น G", zone: "HDY", machineCode: "W2", grade: "A", hoursAgo: 1 },
  { ownership: "COCO", region: "ภาคใต้", branchCode: "CO3022", branchName: "ม.สงขลานครินทร์ อาคารเรียนรวม", zone: "HDY", machineCode: "D8", grade: "B", hoursAgo: 126 },
  { ownership: "COCO", region: "ภาคใต้", branchCode: "CO3106", branchName: "สนามบินภูเก็ต อาคารในประเทศ", zone: "PKT", machineCode: "W10", grade: "A", hoursAgo: 2 },

  // DODO — ภาคกลางตะวันตก
  { ownership: "DODO", region: "ภาคกลางตะวันตก", branchCode: "DO0105", branchName: "โลตัส พระราม 2 ชั้น 1", zone: "BK02", machineCode: "D3", grade: "B", hoursAgo: 2 },
  { ownership: "DODO", region: "ภาคกลางตะวันตก", branchCode: "DO0118", branchName: "ปั๊ม ปตท. บรมราชชนนี", zone: "BK01", machineCode: "W6", grade: "C", hoursAgo: 12 },
  { ownership: "DODO", region: "ภาคกลางตะวันตก", branchCode: "DO0303", branchName: "ตลาดศรีเมือง ราชบุรี", zone: "RB", machineCode: "D17", grade: "C", hoursAgo: 143 },

  // DODO — ภาคอีสานเหนือ
  { ownership: "DODO", region: "ภาคอีสานเหนือ", branchCode: "DO1004", branchName: "โลตัส ขอนแก่น 2", zone: "KKN", machineCode: "W9", grade: "B", hoursAgo: 3 },
  { ownership: "DODO", region: "ภาคอีสานเหนือ", branchCode: "DO1502", branchName: "บิ๊กซี หนองคาย", zone: "NKI", machineCode: "D13", grade: "C", hoursAgo: 16 },

  // DODO — ภาคตะวันออก
  { ownership: "DODO", region: "ภาคตะวันออก", branchCode: "DO2017", branchName: "แหลมทอง บางแสน ชั้น 2", zone: "CBI", machineCode: "W15", grade: "B", hoursAgo: 1 },
  { ownership: "DODO", region: "ภาคตะวันออก", branchCode: "DO2205", branchName: "โรบินสัน จันทบุรี", zone: "CTI", machineCode: "D19", grade: "C", hoursAgo: 91 },

  // DODO — ภาคใต้
  { ownership: "DODO", region: "ภาคใต้", branchCode: "DO3008", branchName: "จังซีลอน ป่าตอง ชั้น 1", zone: "PKT", machineCode: "W5", grade: "A", hoursAgo: 1 },
  { ownership: "DODO", region: "ภาคใต้", branchCode: "DO3014", branchName: "ตลาดกิมหยง หาดใหญ่", zone: "HDY", machineCode: "D2", grade: "C", hoursAgo: 13 },
];

async function main() {
  const now = Date.now();

  for (const row of ROWS) {
    const branch = await prisma.branch.upsert({
      where: { code: row.branchCode },
      update: {
        name: row.branchName,
        region: row.region,
        ownership: row.ownership,
        zone: row.zone,
        grade: row.grade,
      },
      create: {
        code: row.branchCode,
        name: row.branchName,
        region: row.region,
        ownership: row.ownership,
        zone: row.zone,
        grade: row.grade,
      },
    });

    const lastTxnAt = new Date(now - row.hoursAgo * 60 * 60 * 1000);
    await prisma.machine.upsert({
      where: { branchId_code: { branchId: branch.id, code: row.machineCode } },
      update: { status: "OFF", lastTxnAt },
      create: {
        branchId: branch.id,
        code: row.machineCode,
        type: row.machineCode.startsWith("D") ? "DRYER" : "WASHER",
        status: "OFF",
        lastTxnAt,
      },
    });
  }

  // เครื่องที่ยังทำงานปกติ ใส่ไว้ให้เห็นว่าแดชบอร์ดกรองเฉพาะ OFF จริง ๆ
  const runningBranch = await prisma.branch.findUnique({ where: { code: "CO0101" } });
  if (runningBranch) {
    await prisma.machine.upsert({
      where: { branchId_code: { branchId: runningBranch.id, code: "W4" } },
      update: { status: "ON", lastTxnAt: new Date(now - 15 * 60 * 1000) },
      create: {
        branchId: runningBranch.id,
        code: "W4",
        type: "WASHER",
        status: "ON",
        lastTxnAt: new Date(now - 15 * 60 * 1000),
      },
    });
  }

  const off = await prisma.machine.count({ where: { status: "OFF" } });
  const on = await prisma.machine.count({ where: { status: "ON" } });
  console.log(`เสร็จแล้ว: เครื่องดับ ${off} เครื่อง, เครื่องปกติ ${on} เครื่อง`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
