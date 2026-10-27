/**
 * แอปมือถือ (ไม่ใช่เว็บ) ไม่มีตัวแสดง PDF ในแอป — ระบบของเครื่องเปิด PDF ได้เอง (PdfPages.web.tsx คือของเว็บ)
 * หน้าดูไฟล์ไม่เรียกตัวนี้เมื่อ pdfSupported เป็น false แต่ต้องมีไฟล์ให้ import เจอทุกแพลตฟอร์ม
 */
export default function PdfPages(_props: {
  workOrderId: number;
  attachmentId: number;
  url: string | undefined;
  width: number;
  zoom: number;
  onFail: (message: string) => void;
}) {
  return null;
}
