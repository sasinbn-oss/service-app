/**
 * ย่อรูปในไฟล์ Excel ก่อนส่งเซิร์ฟเวอร์ — อัปเดตข้อมูลอะไหล่จากไฟล์ (เจ้าของงานเจอ ต.ค. 69)
 *
 * ไฟล์ Huebsch / Oasis เกิน 50 MB เพราะรูปที่วางในเซลล์เป็นรูปจากกล้องเต็มขนาด (หลาย MB ต่อรูป)
 * รูปอะไหล่ในแอปโชว์อย่างมากครึ่งจอ ด้านยาว 1,600 px พอ — ย่อในเบราว์เซอร์ทีละรูป แล้วห่อกลับเป็น .xlsx เดิม
 * เซิร์ฟเวอร์ (หน่วยความจำจำกัด) ไม่ต้องรับไฟล์ร้อย MB และรูปที่เก็บในฐานข้อมูลก็เล็กลงไปด้วย
 *
 * ย่อซ้ำแต่ละครั้ง (คนละเครื่อง/คนละเบราว์เซอร์) ได้ไบต์ไม่เหมือนเดิม — ส่ง sha256 ของรูปต้นฉบับไปด้วย
 * เซิร์ฟเวอร์เก็บไว้เทียบรอบหน้า ไม่งั้นทุกรูปจะขึ้นว่า "เปลี่ยนรูป" ทุกครั้งที่อัปเดต
 *
 * ชื่อไฟล์รูปในไฟล์ไม่เปลี่ยน (PNG ย่อเป็น PNG · JPEG เป็น JPEG) — เซิร์ฟเวอร์ดูชนิดรูปจากนามสกุล
 * และไม่ต้องไปแก้ความสัมพันธ์ในไฟล์ Excel
 */
import { Platform } from "react-native";
import JSZip from "jszip";

const MAX_SIDE = 1600;
/** รูปเล็กกว่านี้ส่งไปตามเดิม — ย่อแล้วได้ไม่คุ้มเวลา */
const MIN_BYTES = 300 * 1024;
const QUALITY = 0.85;
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface PreparedSheet {
  blob: Blob;
  /** { "xl/media/image3.png": sha256 ของรูปก่อนย่อ } — เฉพาะรูปที่ถูกย่อ */
  hashes: Record<string, string>;
  before: number;
  after: number;
  shrunk: number;
}

async function sha256(buf: ArrayBuffer) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function reencode(data: ArrayBuffer, type: string): Promise<Blob | null> {
  const bmp = await createImageBitmap(new Blob([data], { type }));
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // JPEG ไม่มีพื้นโปร่ง — ไม่ปูขาวก่อน ส่วนโปร่งของรูปกลายเป็นดำ
  if (type === "image/jpeg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, QUALITY));
}

/** ย่อรูปใหญ่ในไฟล์ — ไม่มีรูปให้ย่อ/อ่านไฟล์ไม่ได้ คืนไฟล์เดิม (ให้เซิร์ฟเวอร์บอกเองว่าไฟล์มีปัญหาอะไร) */
export async function shrinkXlsx(file: Blob, onProgress?: (done: number, total: number) => void): Promise<PreparedSheet> {
  const unchanged: PreparedSheet = { blob: file, hashes: {}, before: file.size, after: file.size, shrunk: 0 };
  if (Platform.OS !== "web" || typeof createImageBitmap !== "function" || !globalThis.crypto?.subtle) return unchanged;
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return unchanged;
  }
  const ext = (p: string) => (p.split(".").pop() ?? "").toLowerCase();
  const media = Object.keys(zip.files).filter((p) => /^xl\/media\/[^/]+$/.test(p) && TYPES[ext(p)]);
  const hashes: Record<string, string> = {};
  for (let k = 0; k < media.length; k++) {
    onProgress?.(k, media.length);
    const p = media[k];
    const data = await zip.file(p)!.async("arraybuffer");
    if (data.byteLength < MIN_BYTES) continue;
    try {
      const out = await reencode(data, TYPES[ext(p)]);
      // ย่อแล้วไม่เล็กลงจริง (รูปบีบมาแล้ว) เก็บรูปเดิม — ไม่เสียคุณภาพเปล่า ๆ
      if (!out || out.size >= data.byteLength * 0.9) continue;
      hashes[p] = await sha256(data);
      zip.file(p, out);
    } catch {
      // รูปที่เบราว์เซอร์เปิดไม่ได้ ส่งไปตามเดิม
    }
  }
  onProgress?.(media.length, media.length);
  const shrunk = Object.keys(hashes).length;
  if (!shrunk) return unchanged;
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: XLSX_MIME });
  return { blob, hashes, before: file.size, after: blob.size, shrunk };
}
