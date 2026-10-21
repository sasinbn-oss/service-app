/**
 * แอปมือถือ (ไม่ใช่เว็บ) ยังไม่มีตัวอ่านป้าย — ช่างใช้แอปผ่านเว็บในมือถือ ตัวสแกนจึงทำบนเว็บก่อน (ocr.web.ts)
 * บนแอปให้พิมพ์ข้อมูลป้ายเอง
 */
export function ocrWorker(): Promise<{ recognize: (img: HTMLCanvasElement) => Promise<{ data: { text: string } }> }> {
  return Promise.reject(new Error("สแกนป้ายรุ่นใช้ได้บนเว็บ — บนแอปให้พิมพ์เอง"));
}
