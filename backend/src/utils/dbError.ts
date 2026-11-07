/**
 * แยกว่าข้อผิดพลาดมาจากฐานข้อมูลไหม และเป็นแบบ "ไม่ว่าง/ต่อไม่ติด" (ลองใหม่ได้) หรือเปล่า
 *
 * ฐานข้อมูลอยู่คนละ region ต่อผ่าน session pooler ของ Supabase (รับ 15 client) และแอปถือได้ 5 สาย (src/prisma.ts)
 * พังแบบนี้ไม่ใช่โค้ดผิด — คำขอต่อคิวรอสายเกิน 10 วินาที (P2024) · pooler เต็ม (EMAXCONNSESSION) · ต่อไม่ถึง (P1001)
 * คืนรหัสสั้น ๆ อย่างเดียว ไม่คืนข้อความเต็ม เพราะข้อความของ Prisma มีชื่อตาราง ชื่อคอลัมน์ และบางทีชื่อโฮสต์
 */
const BUSY_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2034"]);

const BUSY_TEXT: [RegExp, string][] = [
  [/EMAXCONNSESSION|max clients reached/i, "EMAXCONNSESSION"],
  [/Timed out fetching a new connection/i, "P2024"],
  [/Can't reach database server/i, "P1001"],
  [/Server has closed the connection|Connection terminated|connection closed/i, "P1017"],
  [/ETIMEDOUT|ECONNRESET|ECONNREFUSED/, "ECONN"],
];

export function dbErrorOf(err: unknown): { code: string; busy: boolean } | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { name?: string; code?: unknown; errorCode?: unknown; message?: unknown };
  const msg = typeof e.message === "string" ? e.message : "";
  for (const [re, code] of BUSY_TEXT) if (re.test(msg)) return { code, busy: true };
  const code = typeof e.code === "string" && /^P\d{4}$/.test(e.code) ? e.code : typeof e.errorCode === "string" && /^P\d{4}$/.test(e.errorCode) ? e.errorCode : null;
  if (code) return { code, busy: BUSY_CODES.has(code) };
  if (typeof e.name === "string" && e.name.startsWith("PrismaClient")) return { code: e.name.replace("PrismaClient", ""), busy: false };
  return null;
}
