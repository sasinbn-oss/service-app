/**
 * แอปมือถือ (ไม่ใช่เว็บ) ยังไม่มีตัวแสดง PDF ในแอป — ระบบของเครื่องเปิด PDF ได้เองอยู่แล้ว (pdf.web.ts คือของเว็บ)
 * หน้าดูไฟล์จึงขึ้นปุ่ม "เปิดไฟล์" แบบเดิม
 */
export const pdfSupported = false;

export function pdfThumbnail(_uri: string, _width?: number): Promise<string | null> {
  return Promise.resolve(null);
}
