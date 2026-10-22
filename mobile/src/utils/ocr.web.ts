/**
 * ตัวอ่านตัวหนังสือในเบราว์เซอร์ (tesseract.js) — โหลดจาก /ocr ของเว็บเราเอง (scripts/copy-ocr.js)
 *
 * โหลดเฉพาะตอนอ่านรูปป้ายรุ่นครั้งแรก (~7 MB แล้วเบราว์เซอร์เก็บไว้) ไม่ใส่ใน bundle หลัก
 * เพราะใช้แค่ตอนเคลมอะไหล่ ไม่ควรให้ทุกคนต้องรอโหลดตอนเปิดแอป
 * worker เดียวใช้ทั้งแอป — สร้างใหม่ทุกครั้งช้าหลายวินาที
 */
import { extract, matchModel, plateFields, type PlateTemplate, type PlateValue } from "./nameplate";

export type OcrLine = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } };
export type OcrWorker = {
  recognize: (
    img: HTMLCanvasElement,
    opts?: Record<string, unknown>,
    output?: Record<string, boolean>
  ) => Promise<{ data: { text: string; blocks?: { paragraphs: { lines: OcrLine[] }[] }[] | null } }>;
  setParameters: (p: Record<string, string>) => Promise<unknown>;
};
type TesseractGlobal = { createWorker: (lang: string, oem: number, opts: Record<string, unknown>) => Promise<OcrWorker> };

let loading: Promise<OcrWorker> | null = null;

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

export function ocrWorker(): Promise<OcrWorker> {
  if (!loading) {
    loading = (async () => {
      await loadScript("/ocr/tesseract.min.js");
      const T = (window as unknown as { Tesseract: TesseractGlobal }).Tesseract;
      // OEM 1 = LSTM อย่างเดียว ตรงกับไฟล์ core/ภาษาที่คัดลอกไว้ (เล็กกว่าแบบรวม)
      return T.createWorker("eng", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core",
        langPath: "/ocr/lang",
        workerBlobURL: false,
      });
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}


/**
 * รวมค่าที่อ่านได้หลายรอบเป็นตัวต่อตัว — เอาความยาวที่เจอบ่อยสุด แล้วแต่ละตำแหน่งใช้ตัวที่เจอบ่อยสุด
 * sure = ทุกตำแหน่งชนะขาด (มากกว่าครึ่ง) ไม่งั้นช่างต้องตรวจกับรูป
 */
function majority(reads: string[]): { value: string; sure: boolean } {
  const lens = new Map<number, number>();
  for (const r of reads) lens.set(r.length, (lens.get(r.length) ?? 0) + 1);
  const len = [...lens.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const same = reads.filter((r) => r.length === len);
  let value = "";
  let sure = same.length >= 2;
  for (let i = 0; i < len; i++) {
    const c = new Map<string, number>();
    for (const r of same) c.set(r[i], (c.get(r[i]) ?? 0) + 1);
    const [ch, k] = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
    value += ch;
    if (k * 2 <= same.length) sure = false;
  }
  return { value, sure };
}

/** ย่อรูปยาวสุดเท่านี้ก่อนหาบรรทัด — ทดลองกับรูปป้ายจริงแล้วพอ และเร็วกว่ารูปเต็มจากกล้องหลายเท่า */
const PAGE_MAX = 1600;

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("เปิดรูปไม่ได้ — ลองถ่ายใหม่"));
    img.src = uri;
  });
}

/** ขาวดำ + ยืดความต่างสี — ป้ายโลหะถ่ายในร้านมักทึมและสะท้อนแสง */
function grayStretch(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d")!;
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    px[i] = g;
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }
  const k = hi > lo ? 255 / (hi - lo) : 1;
  for (let i = 0; i < px.length; i += 4) {
    const v = (px[i] - lo) * k;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(d, 0, 0);
}

function canvasOf(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  c.getContext("2d")!.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/**
 * รูปป้ายเต็มหนึ่งรูป → ค่าแต่ละช่อง (เจ้าของงานขอ ต.ค. 69 ให้ถ่ายทั้งป้ายแล้วระบบเลือกเอง แทนเล็งทีละบรรทัด)
 *
 * อ่านทั้งรูปรอบเดียวได้ถูกราว 6/10 ช่อง จึงทำสองขั้น (ทดลองกับป้าย Huebsch และ OASIS จริงได้ครบทุกช่อง):
 *  1. อ่านทั้งรูปสองแบบ (ข้อความกระจาย / เป็นย่อหน้า) เพื่อหา "ตำแหน่งบรรทัด"
 *  2. บรรทัดที่มีคำบนป้ายที่เราสนใจ ตัดออกมาขยายแล้วอ่านซ้ำทีละบรรทัดสองขนาด แล้วนับคะแนน
 * ค่าที่ได้คะแนนน้อย/มีค่าอื่นแข่ง หรือปีเกินปีนี้ ติดธงให้ช่างตรวจ — OCR อ่านผิดซ้ำแบบเดิมได้
 * (วันผลิต 01/2022 อ่านเป็น 01/2029 ทุกรอบ) ช่างจึงต้องติ๊กยืนยันกับรูปทุกครั้งอยู่ดี
 */
export async function readPlatePhoto(
  uri: string,
  template: PlateTemplate,
  registryModel?: string | null,
  onStage?: (label: string) => void
): Promise<Record<string, PlateValue>> {
  onStage?.("กำลังโหลดตัวอ่านป้าย");
  const [worker, img] = await Promise.all([ocrWorker(), loadImage(uri)]);
  const scale = Math.min(1, PAGE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const page = canvasOf(img, 0, 0, img.naturalWidth, img.naturalHeight, img.naturalWidth * scale, img.naturalHeight * scale);
  grayStretch(page);

  onStage?.("กำลังหาบรรทัดบนป้าย");
  const lines: OcrLine[] = [];
  for (const psm of ["11", "3"]) {
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await worker.recognize(page, {}, { blocks: true });
    for (const b of data.blocks ?? []) for (const p of b.paragraphs) lines.push(...p.lines);
  }

  const fields = plateFields(template);
  // อ่านซ้ำเฉพาะบรรทัดที่อ่านรอบแรกแล้วเข้าเค้า — ป้ายหนึ่งมีหกสิบกว่าบรรทัด อ่านซ้ำหมดช้าเกินบนมือถือ
  const hint = /mode|ser|s\/n|\bsn\b|capa|volt|power|produc|\d{2}\s*\/\s*\d{2}/i;
  const want = lines.filter((l) => hint.test(l.text));
  const votes = new Map<string, Map<string, { n: number; bbox: OcrLine["bbox"] }>>();
  const tally = (text: string, bbox: OcrLine["bbox"]) => {
    for (const f of fields) {
      const v = extract(f, text);
      if (!v) continue;
      const m = votes.get(f.key) ?? new Map();
      const cur = m.get(v) ?? { n: 0, bbox };
      cur.n += 1;
      m.set(v, cur);
      votes.set(f.key, m);
    }
  };
  await worker.setParameters({ tessedit_pageseg_mode: "7" });
  for (const [i, l] of want.entries()) {
    onStage?.(`กำลังอ่านบรรทัด ${i + 1}/${want.length}`);
    tally(l.text, l.bbox);
    const { x0, y0, x1, y1 } = l.bbox;
    const h = y1 - y0;
    const pad = h * 0.4;
    const sx = Math.max(0, x0 - pad * 2);
    const sy = Math.max(0, y0 - pad);
    // บรรทัด MODEL: ตัดกว้างไปทางขวา — รุ่นเต็มของ Huebsch อยู่ในกรอบห่างออกไป รอบแรกมักแยกเป็นอีกบรรทัด
    // ทดลองกับรูปป้ายจริง: ตัดเท่าบรรทัดได้แค่ "HL055L | HL055LWH" · กว้างแปดเท่าได้รหัสครบ 18 ตัว
    const wide = /mode/i.test(l.text);
    const right = wide ? Math.min(page.width, x1 + (x1 - x0) * 8) : Math.min(page.width, x1 + pad * 2);
    const sw = right - sx;
    const sh = Math.min(page.height, y1 + pad) - sy;
    const box = wide ? { x0, y0, x1: right, y1 } : l.bbox;
    for (const target of wide ? [48, 64, 96, 128] : [64, 96]) {
      const c = canvasOf(page, sx, sy, sw, sh, (sw * target) / sh, target);
      tally((await worker.recognize(c)).data.text, box);
    }
  }

  const year = new Date().getFullYear();
  const out: Record<string, PlateValue> = {};
  for (const f of fields) {
    let ranked = [...(votes.get(f.key) ?? new Map()).entries()].sort((a, b) => b[1].n - a[1].n);
    if (!ranked.length) continue;
    // รุ่น: อ่านรหัสเต็มได้สักรอบก็ใช้รหัสเต็ม (เจ้าของงานขอ) — รอบแรกที่เห็นแค่ "MODEL: HL055L" ได้คะแนนรุ่นสั้นเยอะกว่าเสมอ
    // รหัสยาวแต่ละรอบเพี้ยนคนละตัว จึงรวมเป็นตัวต่อตัวตามเสียงข้างมาก (ยาวเท่ากันเท่านั้น)
    let merged: { value: string; sure: boolean } | null = null;
    if (f.model) {
      const long = ranked.filter(([v]) => v.length >= 12);
      if (long.length) {
        merged = majority(long.flatMap(([v, o]) => Array(o.n).fill(v)));
        ranked = long;
      }
    }
    const [top, { n, bbox }] = ranked[0];
    const best = merged?.value ?? top;
    const rival = ranked[1]?.[1].n ?? 0;
    // ภาพตัดสีจากรูปจริงของบรรทัดนั้น — ให้คนตรวจเทียบค่ากับตัวหนังสือบนป้ายได้ทันที
    const bx = bbox.x0 / scale;
    const by = bbox.y0 / scale;
    const bw = (bbox.x1 - bbox.x0) / scale;
    const bh = (bbox.y1 - bbox.y0) / scale;
    const padX = bh * 0.8;
    const padY = bh * 0.4;
    const cx = Math.max(0, bx - padX);
    const cy = Math.max(0, by - padY);
    const cw = Math.min(img.naturalWidth, bx + bw + padX) - cx;
    const ch = Math.min(img.naturalHeight, by + bh + padY) - cy;
    const tw = Math.min(360, cw);
    const crop = canvasOf(img, cx, cy, cw, ch, tw, (ch * tw) / cw).toDataURL("image/jpeg", 0.7);

    const yearMatch = /\/(\d{4})$/.exec(best);
    let needsCheck = n < 2 || rival * 2 >= n || (!!yearMatch && Number(yearMatch[1]) > year);
    let value = best;
    if (f.model) {
      const m = matchModel(best, registryModel);
      value = m.value;
      // ส่วนต่อท้ายรุ่นสั้นไม่มีทะเบียนให้เทียบ — มั่นใจได้เฉพาะเมื่อทุกรอบอ่านตรงกันทุกตัว
      needsCheck = m.needsCheck || (merged !== null && !merged.sure);
    }
    out[f.key] = { value, source: "SCAN", crop, needsCheck };
  }
  return out;
}
