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
 * 7 คือมากสุดที่ยังพอดีเพดานแม้ตอนซ้อนกันเต็มที่: ตัวเก่า 7 + ตัวใหม่ 7 + migrate 1 = 15
 * (เดิม 5 — 7 พ.ย. 69 คนใช้พร้อมกันเยอะจนคำขอรอสายเกิน 10 วิ ล็อกอินไม่ได้ทั้งระบบ · ดู README "ระบบล่ม 7 พ.ย. 69")
 *
 * ตั้งไว้ในโค้ดไม่ใช่ปล่อยให้ไปใส่ใน URL เอง เพราะค่านี้ไม่ใช่การตั้งค่าของ
 * สภาพแวดล้อม แต่เป็นข้อจำกัดที่แอปนี้ควรเคารพเสมอไม่ว่าจะรันที่ไหน
 * ใครอยากได้ค่าอื่นยังใส่ทับได้ทั้งใน URL และผ่าน DB_CONNECTION_LIMIT
 */
const DEFAULT_CONNECTION_LIMIT = 7;

/**
 * รอสายว่างได้นานเท่าไรก่อนยอมแพ้ (P2024) — ค่าเริ่มต้นของ Prisma คือ 10 วินาที
 *
 * บทเรียน 7 พ.ย. 69: ล็อกอินไม่ได้ทั้งระบบสองรอบ log มีแต่ P2024 "Timed out fetching a new connection"
 * ตอนคนใช้เยอะ คำขอที่รอสาย 11 วินาทีแล้วได้คำตอบ ดีกว่ารอ 10 วินาทีแล้วได้ error — ช่างกดซ้ำแล้วคิวยิ่งยาว
 * ตัวเลขที่แอปถามเป็นรอบไม่ต้องรอนานขนาดนี้ เพราะมีคิวของตัวเองกั้นไว้ก่อนแล้ว (utils/pollGate.ts)
 */
const DEFAULT_POOL_TIMEOUT = 20;

function withConnectionLimit(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  const limit = process.env.DB_CONNECTION_LIMIT?.trim() || String(DEFAULT_CONNECTION_LIMIT);
  try {
    const url = new URL(raw);
    // ใส่ไว้ใน URL แล้วถือว่าตั้งใจ ไม่ไปทับ
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", limit);
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", String(DEFAULT_POOL_TIMEOUT));
    return url.toString();
  } catch {
    let out = raw;
    if (!out.includes("connection_limit=")) out += (out.includes("?") ? "&" : "?") + `connection_limit=${limit}`;
    if (!out.includes("pool_timeout=")) out += `&pool_timeout=${DEFAULT_POOL_TIMEOUT}`;
    return out;
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
