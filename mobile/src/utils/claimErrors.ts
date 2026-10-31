/**
 * รายการ "Error ที่เครื่องขึ้น" ในฟอร์มปิดงาน (เคลมก้อน 5) — เรียง กรอง และเดาจากใบแจ้ง
 *
 * รายการกับชนิดเครื่องของแต่ละ Error มาจากเซิร์ฟเวอร์ (backend/src/utils/claimGuide.ts) ที่นี่แค่จัดลำดับให้ช่างหาเจอเร็ว:
 * Error ที่ใบแจ้งพูดถึงขึ้นก่อน (แนะนำ · ไม่เลือกให้เอง) → "ไม่มี Error ขึ้น" → Error ของเครื่องชนิดนี้
 * เดิมรายการยาวยี่สิบกว่าข้อปนเครื่องซักกับเครื่องอบ ช่างเลื่อนหาเองทุกครั้ง แล้วเลือกผิดตัวที่ชื่อคล้ายกัน
 */
import type { ClaimGuide } from "./nameplate";

/** รหัสในรายการที่หมายถึง "ไม่มี Error ขึ้น" — เก็บรหัสเดิมไว้ (ใบเคลมเก่าใช้ค่านี้) เปลี่ยนแค่คำที่แสดง (เจ้าของงานตอบข้อ 4) */
export const NO_ERROR_CODE = "อื่น ๆ";
export const NO_ERROR_LABEL = "ไม่มี Error ขึ้น";

type GuideError = ClaimGuide["errors"][number];

/** ชื่อในรายการเลือก — ไทยก่อน อังกฤษในวงเล็บ (เซิร์ฟเวอร์คิดให้) · "อื่น ๆ" = "ไม่มี Error ขึ้น" */
export function errorChoiceLabel(e: GuideError): string {
  if (e.code === NO_ERROR_CODE) return NO_ERROR_LABEL;
  return e.label || `${e.code} — ${e.name}`;
}

/** ตัดช่องว่างและตัวพิมพ์ — ช่างพิมพ์ใบแจ้ง "ขึ้น EDL" "e dl" "E-dL" ก็คือรหัสเดียวกัน */
const squash = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, "");

/**
 * Error ที่ใบแจ้งพูดถึง — รหัสในคู่มือบางตัวมีหลายแบบ ("E dL / E dL1 / E dL2") เทียบทีละแบบ เอาที่ตรงยาวที่สุด
 * (ใบแจ้ง "ECoFAn" ต้องได้ ECoFAn ไม่ใช่ "E co" ที่ตรงแค่ต้นคำ) · รหัสสั้นกว่า 3 ตัวไม่เดา — ตรงมั่วกับคำทั่วไป
 * แค่แนะนำ ไม่เลือกให้ ช่างต้องแตะเอง: ใบแจ้งเขียนตามที่ลูกค้าเห็น ไม่ใช่ที่ช่างเห็นหน้าเครื่อง
 */
export function suggestError(errors: GuideError[], symptom: string | null | undefined): GuideError | null {
  const text = squash(symptom ?? "");
  if (!text) return null;
  let best: { e: GuideError; n: number } | null = null;
  for (const e of errors) {
    if (e.code === NO_ERROR_CODE) continue;
    for (const alt of e.code.split(" / ")) {
      const k = squash(alt);
      if (k.length >= 3 && text.includes(k) && (!best || k.length > best.n)) best = { e, n: k.length };
    }
  }
  return best?.e ?? null;
}

/**
 * ข้อความที่ใบแจ้งพูดถึง Error นั้น — แสดงใน "จากใบแจ้ง “…”" ให้ช่างเห็นว่าระบบเดาจากคำไหน ไม่ใช่เดาลอย ๆ
 * หาคำในใบแจ้งที่ตรงกับรหัส (ไม่สนช่องว่าง) · หาไม่เจอใช้รหัส
 */
export function suggestQuote(e: GuideError, symptom: string | null | undefined): string {
  const raw = symptom ?? "";
  for (const alt of e.code.split(" / ")) {
    const k = squash(alt);
    if (k.length < 3) continue;
    // ไล่หาช่วงในใบแจ้งที่ squash แล้วตรงกับรหัส — เก็บตัวสะกดของใบแจ้งไว้ (ช่างจำคำที่ตัวเองพิมพ์ได้)
    for (let i = 0; i < raw.length; i++) {
      let j = i;
      let got = "";
      while (j < raw.length && got.length < k.length) {
        const c = squash(raw[j]);
        got += c;
        j++;
      }
      if (got === k) return raw.slice(i, j).trim();
    }
  }
  return e.code.split(" / ")[0];
}

/**
 * รายการตามลำดับที่ช่างเห็น: แนะนำ → ไม่มี Error ขึ้น → Error ของเครื่องชนิดนี้
 * กรองตามชนิดเครื่องเมื่อเซิร์ฟเวอร์บอกชนิดของ Error (types) และใบรู้ชนิดเครื่อง — ไม่รู้ชนิดขึ้นทั้งหมด (ซ่อนผิดตัวแย่กว่ายาว)
 * filteredBy = ชนิดที่กรอง (ขึ้นบรรทัดบอกว่ากรองอยู่) · null = ไม่ได้กรอง
 */
export function errorChoices(
  guide: ClaimGuide | null | undefined,
  machineType: string | null | undefined,
  symptom: string | null | undefined
): { list: GuideError[]; suggested: GuideError | null; filteredBy: "WASHER" | "DRYER" | null } {
  const errors = guide?.errors ?? [];
  // เซิร์ฟเวอร์กรองตามชนิดเครื่องมาให้แล้ว (บอกชนิดที่กรองใน guide.machineType) — แอปกรองซ้ำเฉพาะเซิร์ฟเวอร์ที่ส่งแต่ชนิดของแต่ละ Error
  const type = guide?.machineType ?? (machineType === "WASHER" || machineType === "DRYER" ? machineType : null);
  const typed = errors.some((e) => Array.isArray(e.types) && e.types.length > 0);
  const filteredBy = type && (typed || !!guide?.machineType) ? type : null;
  const fits = (e: GuideError) => !filteredBy || !e.types?.length || e.types.includes(filteredBy);
  const suggested = suggestError(errors.filter(fits), symptom);
  const none = errors.find((e) => e.code === NO_ERROR_CODE) ?? null;
  const rest = errors.filter((e) => fits(e) && e !== suggested && e !== none);
  return { list: [...(suggested ? [suggested] : []), ...(none ? [none] : []), ...rest], suggested, filteredBy };
}

/**
 * ชื่อข้อเช็คที่ช่างเห็น — ทับศัพท์คำอังกฤษที่ช่างหน้างานเรียกเป็นไทย แต่คงคำอังกฤษในวงเล็บให้ตรงกับคู่มือที่ถือไป
 * เก็บค่าเดิม (อังกฤษ) ในใบเคลมเสมอ — นี่คือคำที่แสดงเท่านั้น (ค่าตั้งต้นที่บอกเจ้าของงาน)
 * เซิร์ฟเวอร์ส่งชื่อมาเอง (checkLabels) ใช้ของเซิร์ฟเวอร์ · รุ่นที่ยังไม่ส่งใช้ชุดเดียวกันที่นี่
 */
const TRANSLIT: [RegExp, string][] = [
  [/\bSolenoid\b/, "โซลินอยด์ (Solenoid)"],
  [/\bLimit switch\b/i, "ลิมิตสวิตช์ (Limit switch)"],
  [/\bReed switch\b/i, "รีดสวิตช์ (Reed switch)"],
  [/\bContactor\b/, "คอนแทคเตอร์ (Contactor)"],
];
export function checkLabel(e: GuideError | null | undefined, check: string, all?: Record<string, string> | null): string {
  if (all?.[check]) return all[check];
  const fromServer = e?.checkLabels;
  if (Array.isArray(fromServer)) {
    const i = e!.checks.indexOf(check);
    if (i >= 0 && typeof fromServer[i] === "string" && fromServer[i]) return fromServer[i];
  } else if (fromServer && typeof fromServer === "object") {
    const v = (fromServer as Record<string, string>)[check];
    if (v) return v;
  }
  for (const [re, th] of TRANSLIT) if (re.test(check)) return check.replace(re, th);
  return check;
}
