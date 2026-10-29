import { Platform } from "react-native";
import { showAlert } from "./alert";

export interface PickedFile {
  name: string;
  /** ใช้ส่งใน FormData ได้ตรง ๆ */
  blob: Blob;
}

/**
 * เปิดหน้าต่างเลือกไฟล์บนเบราว์เซอร์
 *
 * ทำเฉพาะฝั่งเว็บโดยตั้งใจ การอัปโหลดไฟล์ Excel วันละสองครั้งเป็นงานที่ทำจาก
 * โต๊ะทำงาน ไม่ใช่จากมือถือหน้างาน จึงไม่เพิ่ม dependency สำหรับเลือกไฟล์บน
 * มือถือ ซึ่งจะทำให้แอปหนักขึ้นโดยไม่มีใครใช้
 */
export function pickFile(accept: string): Promise<PickedFile | null> {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";

    // ผู้ใช้กดยกเลิกจะไม่มี change event ต้องเก็บกวาดเองไม่งั้น input ค้างใน DOM
    const cleanup = () => input.remove();

    input.onchange = () => {
      const file = input.files?.[0];
      cleanup();
      resolve(file ? { name: file.name, blob: file } : null);
    };
    input.oncancel = () => {
      cleanup();
      resolve(null);
    };

    document.body.appendChild(input);
    input.click();
  });
}

export const canPickFile = Platform.OS === "web";

/** เลือกหลายไฟล์พร้อมกัน (เว็บ) — เช่นไฟล์อะไหล่ยี่ห้อละไฟล์ ไม่ต้องกดเลือกทีละไฟล์ */
export function pickFiles(accept: string): Promise<PickedFile[]> {
  if (Platform.OS !== "web" || typeof document === "undefined") return Promise.resolve([]);
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = true;
    input.style.display = "none";
    const cleanup = () => input.remove();
    input.onchange = () => {
      const files = [...(input.files ?? [])].map((f) => ({ name: f.name, blob: f as Blob }));
      cleanup();
      resolve(files);
    };
    input.oncancel = () => {
      cleanup();
      resolve([]);
    };
    document.body.appendChild(input);
    input.click();
  });
}

/** ไฟล์ที่ลากมาวางทั้งหมดที่ตรงชนิด — ไม่มีไฟล์ไหนตรงบอกว่าต้องเป็นไฟล์อะไร (แบบ droppedFile) */
export function droppedFiles(files: File[], accept: string): PickedFile[] {
  const rules = accept.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
  const exts = rules.filter((r) => r.startsWith("."));
  const ok = files.filter((f) => exts.some((e) => f.name.toLowerCase().endsWith(e)) || rules.includes(f.type.toLowerCase()));
  if (!ok.length) {
    showAlert("ไฟล์นี้นำเข้าไม่ได้", `ต้องเป็นไฟล์ ${exts.join(" หรือ ")} — ไฟล์ที่ลากมา: ${files.map((f) => f.name).join(", ")}`);
  }
  return ok.map((f) => ({ name: f.name, blob: f }));
}

/**
 * ไฟล์ที่ลากมาวาง (เว็บ · components/FileDropZone) → แบบเดียวกับที่ pickFile คืน
 * accept รูปแบบเดียวกับ pickFile (".xlsx,application/…") · ลากมาหลายไฟล์ใช้ไฟล์แรกที่ตรงชนิด
 * ไม่มีไฟล์ไหนตรง → บอกว่าต้องเป็นไฟล์อะไร แล้วคืน null
 */
export function droppedFile(files: File[], accept: string): PickedFile | null {
  const rules = accept.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
  const exts = rules.filter((r) => r.startsWith("."));
  const ok = (f: File) => exts.some((e) => f.name.toLowerCase().endsWith(e)) || rules.includes(f.type.toLowerCase());
  const file = files.find(ok);
  if (!file) {
    showAlert("ไฟล์นี้นำเข้าไม่ได้", `ต้องเป็นไฟล์ ${exts.join(" หรือ ")} — ไฟล์ที่ลากมา: ${files.map((f) => f.name).join(", ")}`);
    return null;
  }
  return { name: file.name, blob: file };
}
