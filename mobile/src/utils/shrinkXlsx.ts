/**
 * ย่อรูปในไฟล์ Excel ก่อนส่งเซิร์ฟเวอร์ — อัปเดตข้อมูลอะไหล่จากไฟล์ (เจ้าของงานเจอ ต.ค. 69)
 *
 * ไฟล์ Huebsch / Oasis เกิน 50 MB (บางไฟล์ 200 MB) เพราะรูปที่วางในเซลล์เป็นรูปกล้องเต็มขนาด หรือรูปที่ก๊อปมาวาง
 * ซึ่ง Excel เก็บเป็น PNG (บีบแบบไม่เสียคุณภาพ รูปถ่ายรูปละหลาย MB) — เซิร์ฟเวอร์หน่วยความจำจำกัด รับได้ไฟล์ละ 50 MB
 * รูปอะไหล่ในแอปโชว์อย่างมากครึ่งจอ เลยย่อในเบราว์เซอร์ทีละรูป แล้วห่อกลับเป็น .xlsx เดิม:
 * - รอบแรกเสมอ: รูปเกิน 300 KB ย่อด้านยาวเหลือ 1,600 px (รูปที่เก็บในฐานข้อมูลก็เล็กลงไปด้วย)
 * - ไฟล์ยังเกินเป้า ย่อเพิ่มอีกรอบ เล็กลงทีละขั้น (1,200 → 1,000 → 800 px) จนต่ำกว่าเป้า — รูปน้อยได้รูปคมกว่ารูปเยอะ
 * - PNG / WebP ที่ทึบทั้งรูป (รูปถ่าย) แปลงเป็น JPEG — PNG ย่อแล้วก็ยังใหญ่ ที่มีพื้นโปร่งคงเป็น PNG
 *   ชื่อไฟล์รูปในไฟล์ Excel คงเดิม (image3.png แม้ข้างในเป็น JPEG) ไม่ต้องแก้ความสัมพันธ์ในไฟล์
 *   เซิร์ฟเวอร์ดูชนิดรูปจากไบต์หัวไฟล์ (repairFormImport.ts sniffExt)
 *
 * ย่อซ้ำแต่ละครั้ง (คนละเครื่อง/คนละรอบ) ได้ไบต์ไม่เหมือนเดิม — ส่ง sha256 ของรูปต้นฉบับไปด้วย
 * เซิร์ฟเวอร์เก็บไว้เทียบรอบหน้า ไม่งั้นทุกรูปจะขึ้นว่า "เปลี่ยนรูป" ทุกครั้งที่อัปเดต
 */
import { Platform } from "react-native";
import JSZip from "jszip";

/** ต่ำกว่าที่เซิร์ฟเวอร์รับ (50 MB) เผื่อส่วนหัวของคำขอและค่าประมาณคลาดเคลื่อน */
const TARGET_BYTES = 45 * 1024 * 1024;
/** รอบแรกทำเสมอ · รอบถัดไปทำเมื่อไฟล์ยังเกินเป้า — minBytes = รูปเล็กกว่านี้ไม่แตะ (ย่อแล้วไม่คุ้ม) */
const PASSES = [
  { side: 1600, quality: 0.85, minBytes: 300 * 1024 },
  { side: 1200, quality: 0.8, minBytes: 150 * 1024 },
  { side: 1000, quality: 0.72, minBytes: 80 * 1024 },
  { side: 800, quality: 0.65, minBytes: 40 * 1024 },
];
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface PreparedSheet {
  blob: Blob;
  /** { "xl/media/image3.png": sha256 ของรูปก่อนย่อ } — เฉพาะรูปที่ถูกย่อ */
  hashes: Record<string, string>;
  before: number;
  after: number;
  shrunk: number;
  /** จำนวนรอบที่ย่อ (1 = ย่อเฉพาะรูปใหญ่ · มากกว่านั้น = ไฟล์ใหญ่มาก ย่อเพิ่มจนต่ำกว่าเป้า) */
  rounds: number;
}

/** ชนิดรูปจากไบต์หัวไฟล์ — หลังรอบแรก รูปที่ชื่อ .png อาจเป็น JPEG ไปแล้ว */
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

async function sha256(buf: ArrayBuffer) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function reencode(data: ArrayBuffer, type: string, pass: (typeof PASSES)[number]): Promise<Blob | null> {
  const bmp = await createImageBitmap(new Blob([data], { type }));
  const scale = Math.min(1, pass.side / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  let out = type;
  if (type !== "image/jpeg") {
    const px = ctx.getImageData(0, 0, w, h).data;
    let opaque = true;
    for (let i = 3; i < px.length; i += 4) {
      if (px[i] < 255) {
        opaque = false;
        break;
      }
    }
    if (opaque) out = "image/jpeg";
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), out, pass.quality));
}

/**
 * ย่อรูปในไฟล์ — ไม่มีรูปให้ย่อ/อ่านไฟล์ไม่ได้ คืนไฟล์เดิม (ให้เซิร์ฟเวอร์บอกเองว่าไฟล์มีปัญหาอะไร)
 * onProgress(รูปที่ทำแล้ว, รูปทั้งหมด, รอบที่) — ไฟล์ 200 MB ใช้เวลาหลายสิบวินาที ต้องบอกว่ายังทำอยู่
 */
export async function shrinkXlsx(file: Blob, onProgress?: (done: number, total: number, round: number) => void): Promise<PreparedSheet> {
  const unchanged: PreparedSheet = { blob: file, hashes: {}, before: file.size, after: file.size, shrunk: 0, rounds: 0 };
  if (Platform.OS !== "web" || typeof createImageBitmap !== "function" || !globalThis.crypto?.subtle) return unchanged;
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return unchanged;
  }
  const media = Object.keys(zip.files).filter((p) => /^xl\/media\/[^/]+$/.test(p));
  const hashes: Record<string, string> = {};
  const size: Record<string, number> = {};
  let originalMedia = 0;
  let rounds = 0;
  for (let r = 0; r < PASSES.length; r++) {
    const pass = PASSES[r];
    if (r > 0) {
      // ประมาณขนาดไฟล์ = ส่วนที่ไม่ใช่รูป + รูปตอนนี้ (รูปในไฟล์ Excel ไม่ถูกบีบซ้ำ ขนาดในไฟล์ ≈ ขนาดรูป)
      const estimate = Math.max(0, file.size - originalMedia) + media.reduce((n, p) => n + (size[p] ?? 0), 0);
      if (estimate <= TARGET_BYTES) break;
    }
    rounds = r + 1;
    for (let k = 0; k < media.length; k++) {
      onProgress?.(k, media.length, r + 1);
      const p = media[k];
      if (r > 0 && (size[p] ?? 0) < pass.minBytes) continue;
      const data = await zip.file(p)!.async("arraybuffer");
      if (r === 0) {
        size[p] = data.byteLength;
        originalMedia += data.byteLength;
      }
      const type = sniff(new Uint8Array(data, 0, Math.min(12, data.byteLength)));
      if (!type || data.byteLength < pass.minBytes) continue;
      try {
        const out = await reencode(data, type, pass);
        // ย่อแล้วไม่เล็กลงจริง (รูปบีบมาแล้ว) เก็บรูปเดิม — ไม่เสียคุณภาพเปล่า ๆ
        if (!out || out.size >= data.byteLength * 0.9) continue;
        // ครั้งแรกที่แตะรูปนี้ ไบต์ที่อ่านคือต้นฉบับ
        if (!hashes[p]) hashes[p] = await sha256(data);
        zip.file(p, out, { compression: "STORE" });
        size[p] = out.size;
      } catch {
        // รูปที่เบราว์เซอร์เปิดไม่ได้ ส่งไปตามเดิม
      }
    }
    onProgress?.(media.length, media.length, r + 1);
  }
  const shrunk = Object.keys(hashes).length;
  if (!shrunk) return unchanged;
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: XLSX_MIME });
  return { blob, hashes, before: file.size, after: blob.size, shrunk, rounds };
}
