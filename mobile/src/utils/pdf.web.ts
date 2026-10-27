/**
 * แสดง PDF ในแอป (pdf.js) — โหลดจาก /pdfjs ของเว็บเราเอง (scripts/copy-pdfjs.js) เฉพาะตอนเปิด PDF ครั้งแรก
 *
 * เจ้าของงานขอ ต.ค. 69: ใบเสนอราคา PDF กดแล้วเปิดดูไม่ได้ — Chrome บน Android ไม่มีตัวเปิด PDF
 * กดเปิดแล้วกลายเป็นดาวน์โหลดลงเครื่อง ต้องไปหาเปิดเองในแอปไฟล์ · วาดหน้า PDF ลง canvas ในหน้าดูไฟล์แทน
 *
 * isEvalSupported: false — PDF ที่ทำมาร้ายรันโค้ดผ่านตัวแสดงฟอนต์ได้ถ้าเปิด eval (ช่องโหว่ CVE-2024-4367)
 * ไฟล์มาจากคนในบริษัทก็จริง แต่ใบเสนอราคาบางใบมาจากร้านภายนอก ปิดไว้ไม่เสียอะไร
 */
type Viewport = { width: number; height: number };
export type PdfPage = {
  getViewport: (o: { scale: number }) => Viewport;
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: Viewport }) => { promise: Promise<void>; cancel: () => void };
};
export type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => Promise<void> };
type PdfJs = {
  getDocument: (src: Record<string, unknown>) => { promise: Promise<PdfDoc> };
  GlobalWorkerOptions: { workerSrc: string };
};

export const pdfSupported = true;

let lib: Promise<PdfJs> | null = null;
/**
 * import() ผ่าน Function — ไฟล์อยู่ใน public ไม่ใช่ในโค้ด ถ้าเขียน import() ตรง ๆ Metro จะพยายามหาไฟล์ตอน bundle แล้วพัง
 */
const importUrl = new Function("u", "return import(u)") as (u: string) => Promise<PdfJs>;

function pdfjs(): Promise<PdfJs> {
  if (!lib) {
    lib = importUrl("/pdfjs/pdf.min.js")
      .then((p) => {
        p.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.js";
        return p;
      })
      .catch((e) => {
        lib = null;
        throw e;
      });
  }
  return lib;
}

/** เปิดเอกสารจากลิงก์ (โหลดตรงจากที่เก็บไฟล์) หรือจากไบต์ที่ได้มาแล้ว (ทางสำรองผ่านเซิร์ฟเวอร์) */
export async function openPdf(source: { url: string } | { data: ArrayBuffer }): Promise<PdfDoc> {
  const p = await pdfjs();
  return p.getDocument({
    ...source,
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    isEvalSupported: false,
  }).promise;
}

/**
 * วาดหน้า n ลง canvas กว้าง cssWidth (จุดบนจอ) — คูณความละเอียดจอ ตัวหนังสือบนมือถือจะได้คม
 * คืนตัวยกเลิก: ซูมเร็ว ๆ ระหว่างวาดหน้าเดิมต้องหยุดรอบเก่า ไม่งั้นสองรอบวาดทับ canvas เดียวกัน
 */
export async function renderPage(doc: PdfDoc, n: number, canvas: HTMLCanvasElement, cssWidth: number) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const task = page.render({ canvasContext: ctx, viewport });
  return task;
}

/**
 * รูปย่อหน้าแรกของ PDF ที่เพิ่งเลือก — รายการไฟล์แนบเห็นว่าเป็นเอกสารอะไรก่อนกด (เดิมเป็นไอคอนกระดาษเปล่า ๆ)
 * ทำไม่ได้ (ไฟล์เสีย · โหลดตัวแสดงไม่ขึ้น) คืน null — แนบไฟล์ได้ตามปกติ แค่ไม่มีรูปย่อ
 */
export async function pdfThumbnail(uri: string, width = 320): Promise<string | null> {
  try {
    const data = await (await fetch(uri)).arrayBuffer();
    const doc = await openPdf({ data });
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    void doc.destroy();
    return canvas.toDataURL("image/jpeg", 0.6);
  } catch {
    return null;
  }
}
