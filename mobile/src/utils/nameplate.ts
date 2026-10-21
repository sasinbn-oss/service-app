/**
 * ตัดสินค่าที่อ่านจากป้ายรุ่น — ใช้ร่วมกันระหว่างตัวสแกน (กล้อง) กับกล่องข้อมูลป้ายในฟอร์มปิดงาน
 *
 * แบบบรรทัดของแต่ละยี่ห้อมาจากเซิร์ฟเวอร์ (backend/src/utils/claimGuide.ts) ไม่ได้เขียนซ้ำที่นี่
 * ทดลองกับรูปป้ายจริง ต.ค. 69: ตัวเลขอ่านถูกเป็นส่วนใหญ่แต่บางเฟรมอ่านผิด (28 → 25) จึงต้องโหวตหลายเฟรม
 * ส่วนรุ่นที่ปนตัวอักษร OCR ผิดซ้ำแบบเดิมทุกเฟรม (HL055L → HLOSSL) โหวตกันไม่ได้ ต้องเทียบทะเบียน + ให้คนยืนยัน
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
  errors: { code: string; name: string; checks: string[] }[];
  installChecks: { key: string; label: string; note: string }[];
}

/** ค่าในช่องหนึ่งของป้าย — SCAN = อ่านด้วยกล้อง · HAND = พิมพ์/แก้เอง (Admin Spare Part เห็นป้ายต่างกัน) */
export interface PlateValue {
  value: string;
  source: "SCAN" | "HAND";
  crop?: string | null;
  /** รุ่นที่สแกนได้แต่ไม่ตรงทะเบียน — ต้องให้ช่างยืนยันกับภาพก่อน */
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

/**
 * รับค่าเมื่อเฟรมล่าสุดอ่านได้ค่าเดียวกันอย่างน้อย 3 ครั้ง และเป็นอย่างน้อย 70% ของเฟรมที่อ่านออก
 * (เฟรมที่อ่านไม่ออกไม่นับ) — 28 ×6 กับ 25 ×2 ผ่าน · 01/2022 ×3 กับ 01/2029 ×2 ยังไม่ผ่าน อ่านต่อ
 */
export const VOTE_WINDOW = 8;
export function vote(reads: (string | null)[]): string | null {
  const recent = reads.filter((r): r is string => !!r).slice(-VOTE_WINDOW);
  if (recent.length < 3) return null;
  const count = new Map<string, number>();
  for (const r of recent) count.set(r, (count.get(r) ?? 0) + 1);
  const [best, n] = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  return n >= 3 && n / recent.length >= 0.7 ? best : null;
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
  if (reg && fold(reg).length >= 3 && (fold(read) === fold(reg) || fold(read).includes(fold(reg)))) {
    return { value: reg.toUpperCase(), needsCheck: false };
  }
  return { value: read, needsCheck: true };
}
