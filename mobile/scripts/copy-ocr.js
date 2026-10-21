/**
 * คัดลอกตัวอ่านตัวหนังสือ (tesseract.js) จาก node_modules ไปไว้ที่ public/ocr ก่อน export เว็บ
 *
 * ทำไมไม่โหลดจาก CDN: ช่างใช้ตอนยืนหน้าเครื่องในร้าน — เว็บของเราเปิดได้แต่ CDN ภายนอกอาจโดนบล็อก/ช้า
 * และไม่ควรพึ่งเว็บคนอื่นในงานที่ต้องใช้เคลมจริง · ทำไมไม่ bundle: ตัวอ่านเป็น Web Worker + WASM ราว 7 MB
 * โหลดแยกเฉพาะตอนเปิดกล้องสแกนป้ายรุ่น (ใบเคลมเท่านั้น) ไม่ถ่วงการเปิดแอปของทุกคน
 *
 * ไฟล์ที่ได้ไม่เข้า git (public/ocr ใน .gitignore) — สร้างใหม่ทุกครั้งจากเวอร์ชันที่ล็อกใน package.json
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "public", "ocr");
const nm = (...p) => path.join(root, "node_modules", ...p);
const files = [
  [nm("tesseract.js", "dist", "tesseract.min.js"), "tesseract.min.js"],
  [nm("tesseract.js", "dist", "worker.min.js"), "worker.min.js"],
  // อ่านแบบ LSTM อย่างเดียว — tesseract.js เลือกไฟล์ simd เองถ้าเครื่องรองรับ
  [nm("tesseract.js-core", "tesseract-core-simd-lstm.wasm.js"), "core/tesseract-core-simd-lstm.wasm.js"],
  [nm("tesseract.js-core", "tesseract-core-lstm.wasm.js"), "core/tesseract-core-lstm.wasm.js"],
  // best_int = เล็ก (2.9 MB) แม่นพอกับตัวพิมพ์บนป้าย
  [nm("@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"), "lang/eng.traineddata.gz"],
];
for (const [from, to] of files) {
  const dest = path.join(out, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(from, dest);
}
console.log(`copy-ocr: ${files.length} ไฟล์ → public/ocr`);
