/**
 * เขียนข้อมูลรุ่นของ build ลงไฟล์ ก่อน export เว็บ
 *
 * มีไว้ตอบคำถามเดียว — "เว็บที่เปิดอยู่นี่เป็นรุ่นล่าสุดหรือยัง" ซึ่งเดาจากหน้าจอไม่ได้
 * เวลาแก้โค้ดแล้วของยังไม่ขึ้น จะได้แยกออกว่าโค้ดไม่ทำงาน หรือแค่ยังไม่ได้ deploy
 *
 * ห้ามทำให้ build ล้มเด็ดขาด ถ้าอ่าน git ไม่ได้ก็ใส่เท่าที่รู้แล้วไปต่อ
 * เพราะ build ที่พังทั้งอันเพื่อบรรทัดข้อความเล็กๆ ไม่คุ้มกัน
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function gitValue(command) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

const commit = gitValue("git rev-parse --short HEAD") || "unknown";
const builtAt = new Date().toISOString();

const target = path.join(__dirname, "..", "src", "buildInfo.ts");
const contents = `// สร้างอัตโนมัติโดย scripts/write-build-info.js — ห้ามแก้ด้วยมือ
export const BUILD_COMMIT = ${JSON.stringify(commit)};
export const BUILD_AT = ${JSON.stringify(builtAt)};
`;

try {
  fs.writeFileSync(target, contents);
  console.log(`build info: ${commit} @ ${builtAt}`);
} catch (err) {
  console.warn("เขียน buildInfo ไม่สำเร็จ ใช้ค่าเดิมต่อ:", err.message);
}
