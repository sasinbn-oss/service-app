/**
 * ตัวอ่านตัวหนังสือในเบราว์เซอร์ (tesseract.js) — โหลดจาก /ocr ของเว็บเราเอง (scripts/copy-ocr.js)
 *
 * โหลดเฉพาะตอนเปิดกล้องสแกนป้ายรุ่นครั้งแรก (~7 MB แล้วเบราว์เซอร์เก็บไว้) ไม่ใส่ใน bundle หลัก
 * เพราะใช้แค่ตอนเคลมอะไหล่ ไม่ควรให้ทุกคนต้องรอโหลดตอนเปิดแอป
 * worker เดียวใช้ทั้งแอป — สร้างใหม่ทุกครั้งที่เปิดกล้องช้าหลายวินาที
 */
type Worker = {
  recognize: (img: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
  setParameters: (p: Record<string, string>) => Promise<unknown>;
};
type TesseractGlobal = { createWorker: (lang: string, oem: number, opts: Record<string, unknown>) => Promise<Worker> };

let loading: Promise<Worker> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as unknown as { Tesseract?: unknown }).Tesseract) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("โหลดตัวอ่านป้ายไม่สำเร็จ — เช็คอินเทอร์เน็ตแล้วลองใหม่"));
    document.head.appendChild(s);
  });
}

export function ocrWorker(): Promise<Worker> {
  if (!loading) {
    loading = (async () => {
      await loadScript("/ocr/tesseract.min.js");
      const T = (window as unknown as { Tesseract: TesseractGlobal }).Tesseract;
      // OEM 1 = LSTM อย่างเดียว ตรงกับไฟล์ core/ภาษาที่คัดลอกไว้ (เล็กกว่าแบบรวม)
      const worker = await T.createWorker("eng", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core",
        langPath: "/ocr/lang",
        workerBlobURL: false,
      });
      // PSM 7 = ข้อความบรรทัดเดียว — กรอบสแกนครอปมาทีละบรรทัดอยู่แล้ว
      await worker.setParameters({ tessedit_pageseg_mode: "7" });
      return worker;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}
