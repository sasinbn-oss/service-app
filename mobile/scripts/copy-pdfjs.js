/**
 * คัดลอกตัวแสดง PDF (pdf.js) จาก node_modules ไปไว้ที่ public/pdfjs ก่อน export เว็บ — เหตุผลเดียวกับ copy-ocr.js
 *
 * ใช้เปิดใบเสนอราคา/บิล PDF ในหน้าดูไฟล์ของแอป (เจ้าของงานขอ ต.ค. 69) — Chrome บน Android ไม่มีตัวเปิด PDF
 * กดเปิดแล้วกลายเป็นดาวน์โหลดลงเครื่อง · ไม่ bundle เข้าแอป (ราว 1.3 MB) โหลดแยกเฉพาะตอนเปิด PDF ครั้งแรก
 *
 * ใช้ legacy build (รองรับเบราว์เซอร์มือถือรุ่นเก่ากว่า) · เปลี่ยนนามสกุล .mjs เป็น .js —
 * โมดูลต้องมาพร้อม MIME แบบ JavaScript ไม่งั้นเบราว์เซอร์ไม่ยอมโหลด และเครื่องเสิร์ฟไฟล์ไม่ทุกตัวรู้จัก .mjs
 * ไฟล์ที่ได้ไม่เข้า git (public/pdfjs ใน .gitignore)
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "public", "pdfjs");
const pkg = path.join(root, "node_modules", "pdfjs-dist");
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(pkg, "legacy", "build", "pdf.min.mjs"), path.join(out, "pdf.min.js"));
fs.copyFileSync(path.join(pkg, "legacy", "build", "pdf.worker.min.mjs"), path.join(out, "pdf.worker.min.js"));
// ฟอนต์มาตรฐานกับตารางอักขระ — PDF ที่ไม่ฝังฟอนต์มาด้วยต้องใช้ ไม่งั้นตัวหนังสือหาย/เป็นกล่อง
for (const dir of ["standard_fonts", "cmaps"]) {
  fs.cpSync(path.join(pkg, dir), path.join(out, dir), { recursive: true });
}
console.log("copy-pdfjs: pdf.js → public/pdfjs");
