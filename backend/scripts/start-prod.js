/**
 * รัน migration แล้วค่อยสตาร์ทเซิร์ฟเวอร์ — ทนกับ pooler ที่เต็มชั่วคราว
 *
 * ปัญหาที่เจอของจริงบน Render + Supabase: ตอน deploy ตัวเก่ายังถือ connection
 * ค้างอยู่ ส่วน session pooler รับได้แค่ 15 client พอ migrate ขอต่อก็ได้
 * "FATAL: (EMAXCONNSESSION) max clients reached in session mode" แล้ว `&&`
 * ตัดไม่ให้เซิร์ฟเวอร์สตาร์ท — เป็นความล้มเหลวของการ "ต่อไม่ติด"
 * ไม่ใช่ "migration ผิด" แต่ผลลัพธ์คือแอปทั้งระบบล่มเหมือนกัน
 *
 * สองอย่างที่ทำตรงนี้:
 *
 * 1) บังคับ connection_limit=1 ตอน migrate — migrate ใช้ connection เดียวพอ
 *    แต่ค่าเริ่มต้นของ Prisma คิดจากจำนวน CPU (ปกติ 9) ซึ่งกินโควตา pooler
 *    ไปเปล่า ๆ ทั้งที่ไม่ได้ใช้
 *
 * 2) ลองใหม่เมื่อเป็นปัญหาการต่อ ไม่ใช่ปัญหาตัว migration — ช่วงที่ตัวเก่า
 *    ปล่อย connection ใช้เวลาไม่กี่สิบวินาที รอแล้วลองใหม่ก็ผ่าน
 *
 * ยังกั้นเซิร์ฟเวอร์ไว้หลัง migrate เหมือนเดิม ถ้า migration พังจริงจะไม่สตาร์ท
 * เพราะโค้ดใหม่ที่วิ่งบนฐานข้อมูลเก่าแย่กว่าเซิร์ฟเวอร์ที่ไม่ขึ้น — อย่างหลังรู้ทันที
 */
const { spawnSync, spawn } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

const MAX_TRIES = 6;
const WAIT_MS = [5000, 10000, 20000, 30000, 30000];

/** ข้อความที่แปลว่า "ต่อไม่ติด/คิวเต็ม" ไม่ใช่ "migration ผิด" */
const RETRYABLE = [
  "EMAXCONNSESSION",
  "max clients reached",
  "Can't reach database server",
  "Connection terminated",
  "connection closed",
  "timed out",
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
];

/** ใส่ connection_limit=1 ถ้ายังไม่มี — ไม่แตะพารามิเตอร์อื่นที่คนตั้งไว้แล้ว */
function cappedUrl(raw) {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "1");
    return u.toString();
  } catch {
    // ต่อสตริงเองถ้า parse ไม่ได้ ดีกว่าทิ้งค่าเดิมไป
    if (raw.includes("connection_limit=")) return raw;
    return raw + (raw.includes("?") ? "&" : "?") + "connection_limit=1";
  }
}

function migrate() {
  const env = { ...process.env };
  // migrate อ่าน directUrl ก่อน ถ้าไม่ได้ตั้งไว้จะตกมาที่ url
  if (env.DIRECT_URL) env.DIRECT_URL = cappedUrl(env.DIRECT_URL);
  else if (env.DATABASE_URL) env.DATABASE_URL = cappedUrl(env.DATABASE_URL);

  // เรียก binary ในโปรเจกต์ ไม่ผ่าน npx — npx จะไปโหลด prisma ตัว latest
  // จาก npm มาใช้ถ้าหาในเครื่องไม่เจอ ซึ่งคนละเวอร์ชันกับที่โปรเจกต์ใช้
  const bin = path.join(__dirname, "..", "node_modules", ".bin", "prisma");
  return spawnSync(bin, ["migrate", "deploy"], { env, encoding: "utf8" });
}

(function run() {
  for (let attempt = 1; attempt <= MAX_TRIES; attempt += 1) {
    const r = migrate();
    const out = `${r.stdout || ""}${r.stderr || ""}`;
    process.stdout.write(out);

    if (r.status === 0) {
      /**
       * ยังไม่ได้ build = มีคนเอาคำสั่งนี้ไปใส่ช่อง Build Command
       *
       * เจอมาแล้วของจริง: ใส่ผิดช่องแล้ว build ไม่เคยรัน พอหา dist ไม่เจอ
       * Node โยน MODULE_NOT_FOUND ซึ่งไม่ได้บอกเลยว่าต้นเหตุคือตั้งค่าผิดช่อง
       */
      const entry = path.join(__dirname, "..", "dist", "index.js");
      if (!existsSync(entry)) {
        console.error(
          "[start-prod] ไม่พบ dist/index.js — ยังไม่ได้ build\n" +
            "  คำสั่งนี้ต้องอยู่ใน Start Command ไม่ใช่ Build Command\n" +
            "  Build Command  = npm install && npm run build\n" +
            "  Start Command  = npm run start:prod"
        );
        process.exit(1);
      }
      console.log("[start-prod] migration เรียบร้อย — สตาร์ทเซิร์ฟเวอร์");
      const server = spawn(process.execPath, [entry], {
        stdio: "inherit",
      });
      server.on("exit", (code) => process.exit(code ?? 1));
      return;
    }

    const transient = RETRYABLE.some((s) => out.toLowerCase().includes(s.toLowerCase()));
    if (!transient) {
      console.error("[start-prod] migration ไม่ผ่านด้วยสาเหตุที่ลองใหม่ก็ไม่หาย — ไม่สตาร์ทเซิร์ฟเวอร์");
      process.exit(r.status ?? 1);
    }
    if (attempt === MAX_TRIES) {
      console.error(
        `[start-prod] ต่อฐานข้อมูลไม่ติดครบ ${MAX_TRIES} ครั้ง — ` +
          "ถ้าเป็น EMAXCONNSESSION ให้ใส่ connection_limit ใน DATABASE_URL ด้วย " +
          "(ดูหัวข้อ \"deploy ล้มเพราะ pooler เต็ม\" ใน README)"
      );
      process.exit(r.status ?? 1);
    }
    const wait = WAIT_MS[attempt - 1] ?? 30000;
    console.warn(
      `[start-prod] ต่อฐานข้อมูลไม่ติด (ครั้งที่ ${attempt}/${MAX_TRIES}) — ` +
        `รอ ${wait / 1000} วินาทีแล้วลองใหม่ ตัวเก่าน่าจะยังถือ connection อยู่`
    );
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
  }
})();
