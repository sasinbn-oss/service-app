/**
 * ตัดสินค่าที่อ่านจากป้ายรุ่น — ใช้ร่วมกันระหว่างตัวสแกน (กล้อง) กับกล่องข้อมูลป้ายในฟอร์มปิดงาน
 *
 * แบบบรรทัดของแต่ละยี่ห้อมาจากเซิร์ฟเวอร์ (backend/src/utils/claimGuide.ts) ไม่ได้เขียนซ้ำที่นี่
 * ทดลองกับรูปป้ายจริง ต.ค. 69: รุ่นที่ปนตัวอักษร OCR ผิดซ้ำแบบเดิมทุกรอบ (HL055L → HLOSSL)
 * อ่านซ้ำกี่รอบก็ไม่ช่วย ต้องเทียบทะเบียน + ให้คนยืนยัน (ตัวอ่านจากรูปอยู่ที่ ocr.web.ts)
 */

export interface PlateField {
  key: string;
  label: string;
  regex: string;
  model?: boolean;
  unit?: string;
}
export interface PlateLine {
  id: string;
  prompt: string;
  fields: PlateField[];
}
export interface PlateTemplate {
  family: "ALLIANCE" | "OASIS" | "OTHER";
  lines: PlateLine[];
}
export interface ClaimGuide {
  plate: PlateTemplate;
  /**
   * label = ชื่อในรายการเลือก "{รหัส} — {ไทย} ({อังกฤษ})" · thai = ส่วนไทยของชื่อ — เซิร์ฟเวอร์คิดให้ (claimGuide.ts) รุ่นเก่าไม่ส่ง
   * หน้าตรวจ/การ์ดเคลมไม่ใช้สองค่านี้ — อ่านชื่อที่เก็บในแถวตอนส่ง (claimEvidence errorLabelOf) ให้ตรงกับใบเคลม PDF
   */
  errors: { code: string; name: string; checks: string[]; label?: string; thai?: string }[];
}

/** ค่าในช่องหนึ่งของป้าย — SCAN = ระบบอ่านจากรูป · HAND = พิมพ์/แก้เอง (Admin Spare Part เห็นป้ายต่างกัน) */
export interface PlateValue {
  value: string;
  source: "SCAN" | "HAND";
  crop?: string | null;
  /** ค่าที่ระบบไม่มั่นใจ (รุ่นไม่ตรงทะเบียน · คะแนนน้อย · ปีเกินปีนี้) — โชว์เด่นให้ช่างดูกับรูปก่อน */
  needsCheck?: boolean;
}

export function plateFields(t: PlateTemplate | null | undefined): PlateField[] {
  return t ? t.lines.flatMap((l) => l.fields) : [];
}

/** ดึงค่าของช่องจากข้อความที่อ่านได้หนึ่งบรรทัด — ไม่เจอคำบนป้ายนำหน้า = ไม่ใช่บรรทัดนี้ คืน null */
export function extract(field: PlateField, text: string): string | null {
  const m = new RegExp(field.regex, "i").exec(text);
  if (!m?.[1]) return null;
  const v = m[1].replace(/\s+/g, "").toUpperCase();
  return field.unit ? `${v} ${field.unit}` : v;
}

/** ตัวที่ OCR สับสนบนป้ายโลหะ — ใช้เทียบเท่านั้น ไม่ได้แปลงค่าที่เก็บ (L ไม่อยู่ในนี้ เพราะ HL055L มี L จริง) */
const LOOKALIKE: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", S: "5", B: "8", Z: "2", G: "6" };
const fold = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[OQDISBZG]/g, (c) => LOOKALIKE[c]);

/**
 * รุ่นที่อ่านได้เทียบกับรุ่นในทะเบียน — ตรงกันเมื่อมองข้ามตัวที่หน้าตาคล้ายกัน ใช้ตัวสะกดของทะเบียน (ถูกต้อง)
 * ไม่ตรง = เก็บค่าที่อ่านได้แต่ติดธงให้ช่างตรวจกับภาพ (ทะเบียนเองก็อาจผิด)
 */
export function matchModel(read: string, registry: string | null | undefined): { value: string; needsCheck: boolean } {
  const reg = registry?.trim();
  if (reg && fold(reg).length >= 3) {
    const r = fold(read);
    const g = fold(reg);
    if (r === g) return { value: reg.toUpperCase(), needsCheck: false };
    // รุ่นเต็มที่ขึ้นต้นด้วยรุ่นในทะเบียน (HL055L → HL055LWHPRXG6W0000 · เจ้าของงานขอ ต.ค. 69) — แก้ตัวต้นตามทะเบียน
    // เก็บส่วนต่อท้ายตามที่อ่านได้ ไม่ตัดกลับเหลือรุ่นสั้นแบบเดิม (ค่าที่อ่านไม่มีช่องว่าง/ขีด ตัวต่อตัวตรงกับ fold)
    if (r.startsWith(g) && read.length === r.length) return { value: reg.toUpperCase().replace(/[^A-Z0-9]/g, "") + read.slice(g.length), needsCheck: false };
    if (r.includes(g)) return { value: reg.toUpperCase(), needsCheck: false };
  }
  return { value: read, needsCheck: true };
}

/**
 * ชื่อยี่ห้อที่อาจอยู่ในช่องรุ่นของทะเบียนเครื่อง — ตัวเลือกรุ่นตอนเปิดใบงาน (MACHINE_MODELS ใน backend/src/utils/constants.ts)
 * กับยี่ห้อตระกูล Alliance (ALLIANCE_BRANDS ใน backend/src/utils/claimGuide.ts) · เพิ่มยี่ห้อที่นั่นต้องเพิ่มที่นี่ด้วย
 */
const BRAND_NAMES = ["Oasis", "Oasis(TC)", "Huebsch", "Huebsch (TC)", "Haier", "Maytag", "Speed Queen", "Primus", "UniMac", "IPSO", "Alliance"];
/** ตัด "HB - " ข้างหน้า กับ "(TC)" ออก แล้วเทียบแบบไม่สนตัวพิมพ์/ช่องว่าง — "HB - Huebsch" "huebsch (tc)" เป็นยี่ห้อเดียวกัน */
const brandKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/^\s*hb\s*-\s*/, "")
    .replace(/\(\s*tc\s*\)/g, "")
    .replace(/[^a-z0-9]/g, "");
const BRAND_KEYS = new Set(BRAND_NAMES.map(brandKey));

/**
 * ทะเบียนเครื่องมีแค่ชื่อยี่ห้อ ไม่ใช่รุ่นเต็ม — ทะเบียนหลายเครื่องเป็นแบบนี้ เพราะตัวเลือกตอนเปิดใบงานเป็นยี่ห้อ
 * เทียบรุ่นที่อ่านจากป้ายกับยี่ห้อไม่มีความหมาย เดิมขึ้น "ไม่ตรงทะเบียน (Huebsch)" ทุกใบ ช่างจึงเลิกอ่านคำเตือน
 * รวมถึงคำเตือนที่ไม่ตรงจริง ๆ ด้วย — แบบนี้บอกให้ดูกับรูปเองแทน
 */
export function isBrandOnly(model: string | null | undefined): boolean {
  const k = brandKey(model ?? "");
  return !!k && BRAND_KEYS.has(k);
}
