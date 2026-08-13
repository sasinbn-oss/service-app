import { Platform } from "react-native";

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
