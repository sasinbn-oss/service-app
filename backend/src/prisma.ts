import { PrismaClient } from "@prisma/client";

/**
 * จำกัดจำนวน connection ที่แอปเปิดค้างไว้
 *
 * ค่าเริ่มต้นของ Prisma คิดจากจำนวน CPU (num_cpus * 2 + 1 — ปกติได้ 9)
 * ซึ่งมากเกินจำเป็นสำหรับเซิร์ฟเวอร์ตัวนี้ และไปชนเพดานของ pooler
 *
 * Supabase session pooler รับได้ 15 client พร้อมกัน ตอน deploy ตัวเก่ากับ
 * ตัวใหม่อยู่พร้อมกันครู่หนึ่ง ถ้าต่างฝ่ายต่างถือ 9 ก็เป็น 18 แล้ว migration
 * ของตัวใหม่จะไม่เหลือเส้นให้ต่อ ได้ EMAXCONNSESSION แล้ว deploy ล้มทั้งรอบ
 * — ล้มเพราะจำนวน connection ไม่ใช่เพราะโค้ดผิด
 *
 * ตั้งไว้ในโค้ดไม่ใช่ปล่อยให้ไปใส่ใน URL เอง เพราะค่านี้ไม่ใช่การตั้งค่าของ
 * สภาพแวดล้อม แต่เป็นข้อจำกัดที่แอปนี้ควรเคารพเสมอไม่ว่าจะรันที่ไหน
 * ใครอยากได้ค่าอื่นยังใส่ทับได้ทั้งใน URL และผ่าน DB_CONNECTION_LIMIT
 */
const DEFAULT_CONNECTION_LIMIT = 5;

function withConnectionLimit(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  const limit = process.env.DB_CONNECTION_LIMIT?.trim() || String(DEFAULT_CONNECTION_LIMIT);
  try {
    const url = new URL(raw);
    // ใส่ไว้ใน URL แล้วถือว่าตั้งใจ ไม่ไปทับ
    if (url.searchParams.has("connection_limit")) return raw;
    url.searchParams.set("connection_limit", limit);
    return url.toString();
  } catch {
    if (raw.includes("connection_limit=")) return raw;
    return raw + (raw.includes("?") ? "&" : "?") + `connection_limit=${limit}`;
  }
}

const datasourceUrl = withConnectionLimit(process.env.DATABASE_URL);

export const prisma = new PrismaClient(
  datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : undefined
);

/**
 * คืน connection ตอนปิดโปรเซส
 *
 * Render ส่ง SIGTERM ให้ตัวเก่าตอน deploy ตัวใหม่ ถ้าไม่ปิดให้เรียบร้อย
 * connection จะค้างอยู่ที่ pooler อีกพักใหญ่ ซึ่งคือช่วงที่ตัวใหม่กำลังต้องการ
 * เส้นไว้รัน migration พอดี
 */
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
