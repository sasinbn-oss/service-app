/**
 * อะไหล่นอกสโตร์: จัดหาได้ไหม · หาได้จากที่ไหน / ทำไมหาไม่ได้ (เจ้าของงานขอ 4 พ.ย. 69 · ตามตัวอย่างที่อนุมัติ)
 *
 * หัวหน้าภาคตอบตอนระบุอะไหล่ (ฟอร์มระบุอะไหล่ · คอนเฟิร์มรายการของช่าง) — แอดมินทำใบเสนอราคาจากแหล่งนี้
 * และขั้นเช็คอะไหล่ติดปุ่มให้ตามคำตอบ · ช่างที่ซื้อเองตอนปิดงานถามแค่ "ซื้อจากที่ไหน"
 * คำทุกคำต้องตรงกับ OFF_SOURCE_KINDS / OFF_MISSING_REASONS ใน backend/src/utils/constants.ts — เซิร์ฟเวอร์ปฏิเสธคำที่ไม่อยู่ในชุด
 */
export const OFF_SOURCE_KINDS = ["ร้านหาของมาเอง", "สั่งออนไลน์", "ของที่ทีมมีอยู่", "อื่น ๆ"] as const;
export const OFF_MISSING_REASONS = ["ร้านแถวนี้ไม่มี", "รุ่นเลิกผลิต", "ต้องสั่งจากต่างประเทศ", "อื่น ๆ"] as const;

/** ตัวอย่างในช่องรายละเอียด — บอกว่าต้องพิมพ์อะไร ไม่ใช่แค่ "รายละเอียด" (ตัวอย่างที่อนุมัติ) */
export const OFF_SOURCE_PLACEHOLDER = "ชื่อร้าน · ที่ตั้ง/ลิงก์ · เบอร์";
export const OFF_MISSING_PLACEHOLDER = "ถามที่ไหนไปแล้ว · ต้องสั่งจากที่ไหน";

/** ช่องคำตอบที่มากับแถวอะไหล่จากเซิร์ฟเวอร์ (partShape / dispatchPart) — ไม่มีค่า = เซิร์ฟเวอร์รุ่นก่อนหรือใบเก่า */
export interface OffAnswerFields {
  offCatalog?: boolean;
  offFound?: boolean | null;
  offKind?: string | null;
  offDetail?: string | null;
  offAnswerAt?: string | null;
  /** ชื่อบทบาทของคนตอบ ("หัวหน้าภาค") — หน้าใบงานเขียน "{บทบาท}แจ้ง · เวลา" */
  offAnswerRole?: string | null;
  offAnswerByName?: string | null;
}

/**
 * ตัดรายละเอียดที่พิมพ์เองให้สั้นพอสำหรับข้อความ LINE บนมือถือ (เจ้าของงานเลือกข้อ 5) — ตัวเต็มอยู่ในใบงาน
 * ชื่อร้าน/เบอร์มักอยู่ต้นข้อความ ตัดท้ายจึงยังพาช่างไปถูกร้าน
 */
export function clipDetail(t: string, max = 60): string {
  const chars = Array.from(t.replace(/\s+/g, " ").trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
}

/**
 * ป้ายคำตอบของแถว — WAITING: หาได้ · แหล่ง / หาไม่ได้ · เหตุผล / ยังไม่ระบุ (ใบเก่า — เจ้าของงานเลือกไม่บังคับย้อนหลัง)
 * USED (used = true): "ซื้อจาก · แหล่ง" เฉพาะของที่ช่างซื้อเอง · ของจากรายการที่หัวหน้าภาคระบุไม่มีคำตอบของตัวเอง → null ไม่ขึ้นอะไร
 */
export function offAnswerChip(
  p: OffAnswerFields,
  used = false
): { text: string; tone: "found" | "missing" | "none" } | null {
  if (!p.offCatalog) return null;
  if (used) return p.offFound && p.offKind ? { text: `ซื้อจาก · ${p.offKind}`, tone: "found" } : null;
  if (p.offFound === true) return { text: `หาได้ · ${p.offKind ?? "-"}`, tone: "found" };
  if (p.offFound === false) return { text: `หาไม่ได้ · ${p.offKind ?? "-"}`, tone: "missing" };
  return { text: "ยังไม่ระบุ", tone: "none" };
}

/** บรรทัดเดียวของคำตอบ "หาได้ · ร้านหาของมาเอง — รายละเอียด" — ขั้นเช็คอะไหล่/รายการเสนอราคา/รายงาน */
export function offAnswerLine(p: OffAnswerFields, used = false): string | null {
  const chip = offAnswerChip(p, used);
  if (!chip) return null;
  return p.offDetail && chip.tone !== "none" ? `${chip.text} — ${p.offDetail}` : chip.text;
}

/**
 * หาได้จากที่ไหน แบบสั้น — ข้อความจ่ายงาน LINE กับการ์ดช่าง (pickupOf) ใช้คำเดียวกัน
 * มีเฉพาะของที่หัวหน้าภาคบอกว่าหาได้ · หาไม่ได้/ยังไม่ระบุ = null (คนที่ส่งให้ช่างคือแอดมินที่กด "ได้ของแล้ว" — ไม่รู้แหล่งจริง)
 */
export function offSourceShort(p: OffAnswerFields): string | null {
  if (!p.offCatalog || p.offFound !== true || !p.offKind) return null;
  return p.offDetail ? `${p.offKind} — ${clipDetail(p.offDetail)}` : p.offKind;
}
