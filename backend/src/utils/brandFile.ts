/**
 * ไฟล์อะไหล่แยกยี่ห้อ 6 ไฟล์ (เจ้าของงานตอบ 31 ต.ค. 69) — ช่างเลือกอะไหล่ได้เฉพาะไฟล์ยี่ห้อของเครื่อง + ไฟล์ Other
 *
 * ไฟล์ของอะไหล่มาจาก "ชื่อไฟล์ Excel ที่อัปโหลด" ไม่ใช่ช่อง "ยี่ห้อสินค้า" และไม่ใช่คำนำหน้ารหัส (เจ้าของงาน:
 * "อิงจากชื่อไฟล์แล้วไปแมพกับใบงานที่เปิดไปนั้น ๆ ได้เลย") — เก็บเป็นแถวใน SparePartBrandFile รหัสเดียวอยู่ได้หลายไฟล์
 * ช่อง SparePart.brand ยังนำเข้าเหมือนเดิม แต่ใช้แสดง/ค้นหาเท่านั้น ไม่ได้ตัดสินว่าเลือกได้ไหม
 *
 * Other = ของใช้แทนกันได้/ของใช้ในสาขา → ทุกเครื่องเลือกได้ นอกจากไฟล์ยี่ห้อของเครื่องเอง
 * ไฟล์ยี่ห้อด้วยกันไม่ข้ามกัน (Huebsch ↔ Maytag …)
 *
 * กติกาจับคำอยู่ที่ไฟล์นี้ที่เดียว (+ SQL ตั้งต้นใน migration 20261211090000_parts_pick ที่รันครั้งเดียว)
 * tests/lib/fixture-parts.sh ทำ CASE แบบเดียวกับ brandFileOf ทุกบรรทัด — แก้ที่นี่ต้องแก้ที่นั่น
 * ไม่งั้นเทสต์ส่งอะไหล่ที่เซิร์ฟเวอร์ถือว่าคนละไฟล์
 */
import { Prisma } from "@prisma/client";
import { WORK_ORDER_STATUS_LABELS, machineMake } from "./constants";

/** ไฟล์ที่มีจริงทั้งหมด (เจ้าของงานยืนยันว่าไม่มีไฟล์อื่น) — ลำดับนี้คือลำดับที่แสดงบนหน้าจอ */
export const BRAND_FILES = ["Haier", "Huebsch", "Maytag", "Oasis", "Spinz", "Other"] as const;
export type BrandFile = (typeof BRAND_FILES)[number];
/** ไฟล์ของใช้ร่วม — ขึ้นให้ทุกเครื่องเลือก (กลุ่ม "ของใช้ร่วม (ไฟล์ Other)") */
export const SHARED_FILE: BrandFile = "Other";

/** ข้อความเดียวกันทุกที่ที่รับชื่อไฟล์จากผู้ใช้ (อัปโหลด · ฟอร์มอะไหล่) */
export const BRAND_FILE_INVALID = "ไฟล์ยี่ห้อไม่ถูกต้อง — เลือก Haier · Huebsch · Maytag · Oasis · Spinz หรือ Other";

/**
 * "HB" แบบเป็นคำ = Huebsch (เจ้าของงานยืนยัน) — ข้างหน้า/ข้างหลังต้องไม่ใช่ตัวอักษรอังกฤษ
 * "THB" (ราคาเป็นบาท) ไม่ใช่ Huebsch · ไทย ตัวเลข เว้นวรรค - _ . นับเป็นขอบคำ ("อะไหล่HB" "hb_2026.xlsx" = Huebsch)
 * ธง i ทำให้ [^a-z] ไม่รับ A–Z ด้วย เหมือน ~* ของ Postgres ใน migration และ fixture-parts.sh
 */
const HB_WORD = /(^|[^a-z])hb([^a-z]|$)/i;

/** ชื่อเต็มที่มีอยู่ในข้อความ (ไม่สนตัวพิมพ์) — ไฟล์ Other ไม่อยู่ในนี้เพราะยี่ห้อเครื่องที่ไม่ตรงคำไหนตกไป Other เองอยู่แล้ว */
const MAKE_WORDS: { file: BrandFile; match: (s: string) => boolean }[] = [
  { file: "Huebsch", match: (s) => /huebsch/i.test(s) || HB_WORD.test(s) },
  { file: "Oasis", match: (s) => /oasis/i.test(s) },
  { file: "Haier", match: (s) => /haier/i.test(s) },
  { file: "Maytag", match: (s) => /maytag/i.test(s) },
  { file: "Spinz", match: (s) => /spinz/i.test(s) },
];

/**
 * ยี่ห้อเครื่อง → ไฟล์อะไหล่ (ใช้กับยี่ห้อเครื่องเท่านั้น ชื่อไฟล์อัปโหลดใช้ fileOfUploadName)
 * ลำดับ Huebsch (รวม "HB") → Oasis → Haier → Maytag → Spinz → ข้อความอื่น = Other (เลือกได้แค่ของใช้ร่วม)
 * ว่าง = ไม่รู้ยี่ห้อ (null) — คนเลือกอะไหล่ต้องกดยี่ห้อเครื่องก่อน ไม่เดาให้ เดาผิดคืออะไหล่ผิดยี่ห้อหลุดไปที่ร้าน
 */
export function brandFileOf(make: string | null | undefined): BrandFile | null {
  const s = make?.trim();
  if (!s) return null;
  return MAKE_WORDS.find((w) => w.match(s))?.file ?? SHARED_FILE;
}

/**
 * ชื่อไฟล์ที่อัปโหลด → ไฟล์ยี่ห้อ: มีคำ haier · huebsch · maytag · oasis · spinz · other (ไม่สนตัวพิมพ์) หรือ "HB" แบบเป็นคำ
 * ตรงไฟล์เดียว → ไฟล์นั้น · ไม่ตรงเลยหรือตรงหลายไฟล์ ("Haier Other.xlsx") → null ให้หน้าตรวจถามแอดมิน
 * ไม่เดาจากไฟล์แรกที่เจอ — ใส่ผิดไฟล์คืออะไหล่ทั้งไฟล์ไปขึ้นให้อีกยี่ห้อเลือก
 * matches ส่งกลับเฉพาะตอนตรงหลายไฟล์ (หน้าตรวจบอกว่าตรงอะไรบ้าง) · กติกาเดียวกับที่ migration ใช้เติมไฟล์ให้การอัปโหลดเก่า
 */
export function fileOfUploadName(name: string): { file: BrandFile | null; matches: BrandFile[] } {
  const hit = BRAND_FILES.filter((f) =>
    f === "Huebsch" ? /huebsch/i.test(name) || HB_WORD.test(name) : new RegExp(f, "i").test(name)
  );
  return hit.length === 1 ? { file: hit[0], matches: [] } : { file: null, matches: hit.length > 1 ? hit : [] };
}

/** ค่าที่ผู้ใช้ส่งมา → ชื่อไฟล์ตามรายการ (ไม่สนตัวพิมพ์) · ไม่อยู่ในรายการ = null */
export function asBrandFile(v: unknown): BrandFile | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  return BRAND_FILES.find((f) => f.toLowerCase() === k) ?? null;
}

/**
 * ไฟล์ยี่ห้อของอะไหล่หนึ่งตัว (แถว SparePartBrandFile) → ชื่อไฟล์เรียงตาม BRAND_FILES — ลำดับเดียวกับปุ่มบนหน้าจอ
 * ว่าง = ไม่อยู่ในไฟล์ไหน (ช่างเลือกไม่ได้บนใบที่มีเครื่อง)
 */
export function fileList(rows: { file: string }[] | null | undefined): string[] {
  const rank = (f: string) => {
    const i = BRAND_FILES.indexOf(f as BrandFile);
    return i < 0 ? BRAND_FILES.length : i;
  };
  return (rows ?? []).map((r) => r.file).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** ไฟล์ที่เครื่องหนึ่งเลือกได้ = ไฟล์ของตัวเอง + ของใช้ร่วม (เครื่องที่ตกไป Other ได้ Other ไฟล์เดียว) */
export function allowedFiles(machineFile: BrandFile): BrandFile[] {
  return machineFile === SHARED_FILE ? [SHARED_FILE] : [machineFile, SHARED_FILE];
}

/** อะไหล่ในสโตร์ที่อยู่ในไฟล์ใดไฟล์หนึ่งของรายการ — ของนอกสโตร์ไม่มีไฟล์และไม่ขึ้นในการค้น */
export function partFilesWhere(files: BrandFile[]): Prisma.SparePartWhereInput {
  return { offCatalog: false, brandFiles: { some: { file: { in: files } } } };
}

/**
 * ยี่ห้อเครื่องของใบงาน ในรูปที่ช่องเลือกอะไหล่ใช้ (partsBrand)
 * make = machineMake() (ยี่ห้อจากไฟล์รายงานเครื่องก่อน ว่างแล้วใช้ยี่ห้อที่เลือกในแอป — ลำดับเดียวกับประกัน)
 * fromReport = ยี่ห้อมาจากไฟล์รายงานเครื่อง — แก้ยี่ห้อในแอปแล้วนำเข้ารายงานครั้งหน้าจะทับกลับ หน้าจอต้องเตือน
 */
export function machineBrandOf(m: { code?: string | null; brand?: string | null; model?: string | null } | null | undefined) {
  const make = machineMake(m);
  return {
    machine: !!m,
    make,
    file: brandFileOf(make),
    fromReport: !!m?.brand?.trim(),
  };
}

/** รอบเลือกอะไหล่ที่ยังเปิดอยู่ (กติกาเต็มมากับขั้นคอนเฟิร์ม/ตีกลับ) */
export type OpenPick = { status: "PENDING" | "RETURNED" };

/**
 * ป้ายสถานะของใบ — ตอนนี้ยังเท่ากับป้ายเดิม (ยังไม่มีขั้นคอนเฟิร์มอะไหล่)
 * ทุกที่ที่โชว์ป้ายของใบที่อาจอยู่ขั้น NEW/INSPECTING จะเรียกตัวนี้ ป้าย "หัวหน้าภาค · คอนเฟิร์มอะไหล่" มาที่นี่ที่เดียว
 */
export function statusLabelOf(status: string, _open: OpenPick | null = null): string {
  return WORK_ORDER_STATUS_LABELS[status] ?? status;
}
