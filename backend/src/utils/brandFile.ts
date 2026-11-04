/**
 * ไฟล์อะไหล่แยกยี่ห้อ 6 ไฟล์ (เจ้าของงานตอบ 31 ต.ค. 69) — ช่างเลือกอะไหล่ได้เฉพาะไฟล์ยี่ห้อของเครื่อง + ไฟล์ Other
 *
 * ไฟล์ของอะไหล่มาจาก "ชื่อไฟล์ Excel ที่อัปโหลด" ไม่ใช่ช่อง "ยี่ห้อสินค้า" และไม่ใช่คำนำหน้ารหัส (เจ้าของงาน:
 * "อิงจากชื่อไฟล์แล้วไปแมพกับใบงานที่เปิดไปนั้น ๆ ได้เลย") — เก็บเป็นแถวใน SparePartBrandFile รหัสเดียวอยู่ได้หลายไฟล์
 * ช่อง SparePart.brand ยังนำเข้าเหมือนเดิม แต่ใช้แสดง/ค้นหาเท่านั้น ไม่ได้ตัดสินว่าเลือกได้ไหม
 *
 * Other = ของใช้แทนกันได้/ของใช้ในสาขา → ทุกเครื่องเลือกได้ นอกจากไฟล์ยี่ห้อของเครื่องเอง
 * ไฟล์ยี่ห้อด้วยกันไม่ข้ามกัน (Huebsch ↔ Maytag …) — ยกเว้นคนกดยืนยัน "ใช้ข้ามยี่ห้อ" ในการบันทึกครั้งนั้น
 * (เจ้าของงานเลือก 3 พ.ย. 69 — รายครั้ง ไม่จำ ลงประวัติ: ดู crossBrandOk ใน BrandCheck และ logCrossBrand)
 * ของในสโตร์ที่ไม่อยู่ในไฟล์ไหนเลย = "อะไหล่นอกเครื่อง" (เจ้าของงานเลือก 4 พ.ย. 69 "จัดมาตามที่แนะนำ") — ของที่ใช้ได้กับทุกเครื่อง
 * (power supply ตู้แลกเหรียญ · IOT gateway · สายน้ำเข้า …) ทุกคนเลือกได้ทุกช่อง ไม่ต้องยืนยัน ไม่ต้องมีเครื่อง ไม่ต้องรู้ยี่ห้อ
 * ที่ไม่กลายเป็นช่องโหว่ เพราะฟอร์มอะไหล่บังคับเลือกไฟล์ยี่ห้อ หรือติ๊ก "อะไหล่นอกเครื่อง" อย่างใดอย่างหนึ่ง (routes/spareParts.ts)
 *
 * กติกาจับคำอยู่ที่ไฟล์นี้ที่เดียว (+ SQL ตั้งต้นใน migration 20261211090000_parts_pick ที่รันครั้งเดียว)
 * tests/lib/fixture-parts.sh ทำ CASE แบบเดียวกับ brandFileOf ทุกบรรทัด และ mobile/src/utils/brandFile.ts มีสำเนาของ brandFileOf
 * — แก้ที่นี่ต้องแก้ทั้งสองที่ ไม่งั้นเทสต์ส่งอะไหล่ที่เซิร์ฟเวอร์ถือว่าคนละไฟล์ และแอปติดป้ายแดงกันปุ่มทั้งที่เซิร์ฟเวอร์รับ
 * (parts-pick-test.sh กลุ่ม B เทียบทั้งสามที่ทีละคำ)
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { PARTS_PICK_RETURNED_LABEL, PARTS_PICK_STAGE_LABEL, WORK_ORDER_STATUS_LABELS, machineMake } from "./constants";

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

/**
 * ชื่อเต็มที่มีอยู่ในข้อความ (ไม่สนตัวพิมพ์) — ไฟล์ Other ไม่อยู่ในนี้เพราะยี่ห้อเครื่องที่ไม่ตรงคำไหนตกไป Other เองอยู่แล้ว
 *
 * รับชื่อภาษาไทยด้วย: ไฟล์รายงานเครื่องเขียนยี่ห้อเป็นไทยได้ ("เมแทค" — เจอบนระบบจริงวันแรกที่เปิดใช้ 3 พ.ย. 69)
 * ถ้าจับแค่อังกฤษ เครื่อง Maytag ตัวนั้นตกไป Other ช่างเลือกได้แค่ของใช้ร่วม และเซิร์ฟเวอร์ปฏิเสธอะไหล่ Maytag ที่ใช้จริง
 * ตัวสะกดไทยหลายแบบ (ย์ · ท · ็ก/ค) จึงจับเป็นรูปแบบ ไม่ใช่คำเดียว
 */
const MAKE_WORDS: { file: BrandFile; match: (s: string) => boolean }[] = [
  { file: "Huebsch", match: (s) => /huebsch|ฮิวบ|ฮูบ/i.test(s) || HB_WORD.test(s) },
  { file: "Oasis", match: (s) => /oasis|โอเอ[ซส]ิส|โอซิส/i.test(s) },
  { file: "Haier", match: (s) => /haier|ไฮเออ/i.test(s) },
  { file: "Maytag", match: (s) => /maytag|เม(ย์)?(ท)?แท(็)?[คก]/i.test(s) },
  { file: "Spinz", match: (s) => /spinz|สปิน[ซส]/i.test(s) },
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
 * ว่าง = ไม่อยู่ในไฟล์ไหน = อะไหล่นอกเครื่อง (ของในสโตร์) ทุกเครื่องเลือกได้
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


type Db = Prisma.TransactionClient | typeof prisma;

/**
 * เส้นทางปฏิเสธคำขอจากในทรานแซกชัน — โยนออกมาให้ทุกอย่างที่เขียนไปแล้วถูกยกเลิก แล้วผู้เรียกตอบ status/ข้อความนี้
 * (แบบเดียวกับ CloseAlreadySent ใน routes/workOrders.ts) · ข้อความเป็นภาษาไทยที่ผู้ใช้เห็นตรง ๆ
 */
export class Refusal extends Error {
  constructor(readonly status: 400 | 409, message: string) {
    super(message);
  }
}

/** ยี่ห้อเครื่องที่คนกดชิปมา (machineBrand) — ข้อความเดียวกันทุกเส้นทางที่รับ */
export const MACHINE_BRAND_INVALID = "ยี่ห้อเครื่องต้องมี 1–100 ตัวอักษร";
/**
 * ช่อง machineBrand ของทุกเส้นทางที่มีช่องอะไหล่ (ใบงาน + กระดานเครื่องดับ) — ส่ง null/ไม่ส่ง = ไม่ได้เลือก
 * ที่เดียวกันทุกเส้นทาง ไม่งั้นเพดานความยาวต่างกัน แล้วชิปเดียวกันผ่านฟอร์มหนึ่งแต่ตกอีกฟอร์ม
 */
export const machineBrandInput = z
  .string({ invalid_type_error: MACHINE_BRAND_INVALID })
  .trim()
  .min(1, MACHINE_BRAND_INVALID)
  .max(100, MACHINE_BRAND_INVALID)
  .nullish();

/**
 * คำตอบตอน schema เดิม (ที่ตอบ flatten()) ไม่ผ่าน — ช่องที่ผิดคือ machineBrand ตอบข้อความไทยของช่องนั้นตรง ๆ
 * แอปแสดง error ที่ไม่ใช่ข้อความเป็น JSON ดิบ ({"formErrors":[],"fieldErrors":…}) ช่างอ่านไม่ออก
 * ช่องอื่นของ schema เดิมคงรูปแบบเดิมไว้ ไม่เปลี่ยนพฤติกรรมเส้นทางเดิมเกินช่องที่ก้อนนี้เพิ่ม
 */
export function parseErrorBody(err: z.ZodError): string | z.typeToFlattenedError<unknown> {
  const brand = err.issues.find((i) => i.path[0] === "machineBrand" || i.path[0] === "crossBrandOk");
  return brand ? brand.message : err.flatten();
}

/**
 * อะไหล่ข้ามยี่ห้อที่คนกดยืนยันแล้ว (crossBrandOk = id อะไหล่) — เจ้าของงานเลือก 3 พ.ย. 69:
 * "ทุกคนที่เลือกอะไหล่ได้ ต้องกดยืนยัน" · "เอาแบบเป็นรายครั้ง … แค่ให้ขึ้นเตือนว่าใช้อะไหล่ข้ามยี่ห้อ ให้กดยืนยัน"
 * ช่องเดียวกันทุกเส้นทางที่รับอะไหล่ — ไม่ส่ง = ล็อกเหมือนเดิม (แอปรุ่นก่อนและเทสต์เดิมยังได้ 400 ตามเดิม)
 * เพดาน 50 = มากกว่ารายการอะไหล่ที่ยาวที่สุดของทุกฟอร์ม (30) — เกินนั้นคือคำขอผิดรูป ไม่ใช่การยืนยันจริง
 */
export const CROSS_BRAND_INVALID = "รายการอะไหล่ข้ามยี่ห้อที่ยืนยันไม่ถูกต้อง — โหลดหน้าใหม่แล้วลองอีกครั้ง";
export const crossBrandOkInput = z
  .array(
    z.number({ invalid_type_error: CROSS_BRAND_INVALID }).int(CROSS_BRAND_INVALID).positive(CROSS_BRAND_INVALID),
    { invalid_type_error: CROSS_BRAND_INVALID }
  )
  .max(50, CROSS_BRAND_INVALID)
  .optional();

// ── ปัญหาไฟล์ยี่ห้อของรายการอะไหล่ (brandProblem) ─────────────────────────

export type BrandIssue = {
  /**
   * noMachine = ช่างเลือกอะไหล่ของเครื่องบนใบที่ไม่มีเครื่อง · offCatalog = ช่างใส่ของนอกสโตร์ · missing = id ไม่มีอยู่จริง
   * noMake = เครื่องยังไม่รู้ยี่ห้อแต่มีอะไหล่ของเครื่อง · otherFile = อยู่แต่ไฟล์ที่เครื่องนี้เลือกไม่ได้
   * (ไม่มี "ไม่อยู่ในไฟล์ไหน" แล้ว — ตัวนั้นคืออะไหล่นอกเครื่อง ผ่านเสมอ · 4 พ.ย. 69)
   */
  kind: "noMachine" | "offCatalog" | "missing" | "noMake" | "otherFile";
  text: string;
  partCode?: string;
  /** ชื่ออะไหล่ (otherFile) — กระดานเครื่องดับต้องบอกรายการที่ไม่ตรงครบทุกตัวเป็น "{รหัส} {ชื่อ}" */
  partName?: string;
  /** id + ไฟล์ที่อะไหล่อยู่ (otherFile) — ตัวที่ยืนยันใช้ข้ามยี่ห้อได้ ("+ สร้างใบงาน" ส่งให้แอปถามยืนยัน) */
  sparePartId?: number;
  files?: string[];
  machineFile?: BrandFile;
  /** ยี่ห้อที่ใช้ตัดสิน (ที่รู้แล้ว หรือชิปที่เพิ่งกด) — ข้อความรวมของกระดานเครื่องดับใส่ในวงเล็บ */
  make?: string;
};

export type BrandCheck = {
  /**
   * เครื่องของใบ (null = ใบงานทั้งสาขา) — ช่องของคนอื่นไม่ล็อก (ข้อ 22) · ช่องของช่างเลือกได้เฉพาะอะไหล่นอกเครื่อง
   * (อะไหล่ของเครื่องต้องรู้ว่าเครื่องไหน ยี่ห้ออะไร — ช่างเขียนในข้อ 4 ให้หัวหน้าภาคระบุแทนเหมือนเดิม)
   */
  machine: { code: string; brand?: string | null; model?: string | null } | null;
  /** ยี่ห้อที่คนเพิ่งกดชิปมา — ใช้เฉพาะตอนเครื่องยังไม่รู้ยี่ห้อ (ยี่ห้อที่รู้แล้วเปลี่ยนจากฟอร์มไม่ได้) */
  machineBrand?: string | null;
  parts: { sparePartId: number }[];
  /** tech = ช่องของช่าง (ไม่รับของนอกสโตร์ · ใบไม่มีเครื่องเลือกไม่ได้) · other = ช่องของคนอื่นทุกช่อง */
  mode: "tech" | "other";
  /** แถวที่อยู่ในใบอยู่แล้วและปล่อยผ่านได้ตามเส้นทาง (§4.0 ตาราง legacy) */
  legacyIds?: Iterable<number>;
  /** ข้อความแทนกรณีใบไม่มีเครื่อง (ฟอร์มเปิดใบงานพูดว่า "ใส่หมายเลขเครื่องก่อน") */
  noMachineText?: string;
  /**
   * id อะไหล่ที่คนกดยืนยัน "ใช้ข้ามยี่ห้อ" ในการบันทึกครั้งนี้ — ผ่านเฉพาะตัวที่อยู่ในไฟล์ยี่ห้ออื่น (otherFile)
   * ของนอกสโตร์ของช่าง เครื่องที่ไม่รู้ยี่ห้อ ใบไม่มีเครื่อง ยังถูกปฏิเสธเหมือนเดิม (ยืนยันไม่ช่วย)
   * อะไหล่นอกเครื่อง (ไม่อยู่ในไฟล์ไหน) ผ่านโดยไม่ต้องอยู่ในรายการนี้ — ส่งมาก็ไม่นับเป็นข้ามยี่ห้อ ไม่ลงประวัติ
   * ไม่จำไว้ที่ไหน (ไม่เพิ่มอะไหล่เข้าไฟล์ของเครื่อง) — ครั้งหน้าต้องยืนยันอีก
   */
  crossBrandOk?: Iterable<number>;
};

/** อะไหล่ข้ามยี่ห้อหนึ่งตัวที่ผ่านเพราะยืนยัน — files = ไฟล์ที่อะไหล่อยู่จริง (ไม่มีไฟล์ของเครื่อง/Other) */
export type CrossBrandPart = { sparePartId: number; partCode: string; name: string; files: string[] };
/** การใช้อะไหล่ข้ามยี่ห้อของการบันทึกครั้งหนึ่ง — ใช้เขียนประวัติ (logCrossBrand) */
export type CrossBrandUse = { machineCode: string; make: string; machineFile: BrandFile; parts: CrossBrandPart[] };

/**
 * ตรวจว่ารายการอะไหล่เลือกได้กับเครื่องของใบไหม — ปัญหาแรกที่เจอชนะ (ตามลำดับรายการที่ส่งมา)
 *
 * กฎเดียวที่ทุกเส้นทางใช้ (เจ้าของงาน: "เครื่อง Huebsch ก็สามารถเลือกอะไหล่ของเครื่อง Huebsch ได้เท่านั้น"):
 * ไฟล์ของอะไหล่ต้องมีไฟล์ของเครื่อง หรือ Other (ของใช้ร่วม) — อ่านจาก SparePartBrandFile ไม่ใช่ข้อความยี่ห้อ
 * อะไหล่นอกเครื่อง (ไม่อยู่ในไฟล์ไหน) ผ่านทุกกรณี — ต้องมีเครื่อง/รู้ยี่ห้อเฉพาะเมื่อในรายการมีอะไหล่ของเครื่องอย่างน้อยหนึ่งตัว
 * อ่านอะไหล่ทุกตัวในคำสั่งเดียว (ฐานข้อมูลอยู่ไกล รอบละ ~0.23 วิ) · ส่งรายการว่างมา = ไม่มีอะไรให้ตรวจ
 */
export async function brandIssue(opts: BrandCheck, db: Db = prisma): Promise<BrandIssue | null> {
  return (await checkParts(opts, db, true)).issues[0] ?? null;
}

/**
 * ทุกตัวที่ไม่ผ่าน (ไม่ใช่แค่ตัวแรก) — ใช้ที่ "+ สร้างใบงาน" จากกระดานเครื่องดับ ซึ่งต้องบอกครบทุกตัวที่ต้องแก้บนกระดาน
 * ไม่งั้นคนแก้ทีละตัวแล้วกดใหม่ทีละรอบ · ไม่รู้ยี่ห้อ/ไม่มีเครื่อง/ช่างใส่ของนอกสโตร์ = ปัญหาเดียวของทั้งรายการ ได้แถวเดียว
 * cross = ตัวที่ผ่านเพราะยืนยันข้ามยี่ห้อ (ลงประวัติของใบที่เปิด) — อ่านรอบเดียวกับการตรวจ
 */
export async function brandIssuesAll(opts: BrandCheck, db: Db = prisma): Promise<{ issues: BrandIssue[]; cross: CrossBrandUse | null }> {
  const r = await checkParts(opts, db, false);
  return { issues: r.issues, cross: r.issues.length ? null : crossOf(opts, r) };
}

/** ตัวที่ผ่านเพราะยืนยันข้ามยี่ห้อ → รูปที่ใช้เขียนประวัติ (ยี่ห้อ/ไฟล์ = ที่ใช้ตัดสินจริง) */
function crossOf(
  opts: BrandCheck,
  r: { crossed: CrossBrandPart[]; make: string | null; machineFile: BrandFile | null }
): CrossBrandUse | null {
  return r.crossed.length && opts.machine && r.make && r.machineFile
    ? { machineCode: opts.machine.code, make: r.make, machineFile: r.machineFile, parts: r.crossed }
    : null;
}

/**
 * brandProblem + อะไหล่ข้ามยี่ห้อที่ผ่านเพราะยืนยัน (cross) ในการอ่านฐานข้อมูลรอบเดียว — ฐานอยู่ไกล รอบละ ~0.23 วิ
 * เส้นทางที่ต้องลงประวัติ "ใช้อะไหล่ข้ามยี่ห้อ" ใช้ตัวนี้แทน brandProblem จะได้ไม่อ่านอะไหล่ชุดเดิมซ้ำอีกรอบ
 * cross = null เมื่อไม่ผ่าน หรือไม่มีตัวไหนผ่านเพราะยืนยัน (ไม่ส่ง crossBrandOk = ไม่มีทางมีค่า)
 */
export async function brandVerdict(
  opts: BrandCheck,
  db: Db = prisma
): Promise<{ problem: string | null; issue: BrandIssue | null; cross: CrossBrandUse | null }> {
  const r = await checkParts(opts, db, true);
  const issue = r.issues[0] ?? null;
  return { problem: issue?.text ?? null, issue, cross: issue ? null : crossOf(opts, r) };
}

/**
 * ตรวจทุกตัวในรอบเดียว: issues = ตัวที่ไม่ผ่าน (firstOnly = หยุดที่ตัวแรก) · crossed = ตัวที่ผ่านเพราะยืนยันข้ามยี่ห้อ
 * make/machineFile = ยี่ห้อ/ไฟล์ที่ใช้ตัดสิน (ข้อความประวัติต้องบอกยี่ห้อเดียวกับที่ตัดสิน)
 */
async function checkParts(
  opts: BrandCheck,
  db: Db,
  firstOnly: boolean
): Promise<{ issues: BrandIssue[]; crossed: CrossBrandPart[]; make: string | null; machineFile: BrandFile | null }> {
  const none = (issues: BrandIssue[]) => ({ issues, crossed: [], make: null, machineFile: null });
  const ids = [...new Set(opts.parts.map((p) => p.sparePartId))];
  if (ids.length === 0) return none([]);
  // ใบทั้งสาขาในช่องของคนอื่นไม่ล็อกอะไรเลย (ข้อ 22) — ไม่ต้องอ่านอะไหล่ (ฐานข้อมูลอยู่ไกล) และคงคำตอบเดิมทุกกรณี
  if (!opts.machine && opts.mode !== "tech") return none([]);
  const rows = await db.sparePart.findMany({
    where: { id: { in: ids } },
    select: { id: true, partCode: true, name: true, offCatalog: true, brandFiles: { select: { file: true } } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const legacy = new Set(opts.legacyIds ?? []);
  const confirmed = new Set(opts.crossBrandOk ?? []);
  // ยี่ห้อที่รู้แล้วชนะชิปเสมอ — ชิปมีไว้สำหรับเครื่องที่ยังไม่รู้ยี่ห้อเท่านั้น (ข้อ 17)
  const make = opts.machine ? machineMake(opts.machine) ?? (opts.machineBrand?.trim() || null) : null;
  const machineFile = brandFileOf(make);
  const out: BrandIssue[] = [];
  const crossed: CrossBrandPart[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) {
      out.push({ kind: "missing", text: "ไม่พบอะไหล่ที่เลือก — โหลดใหม่แล้วเลือกอีกครั้ง" });
      if (firstOnly) break;
      continue;
    }
    if (p.offCatalog) {
      // ของนอกสโตร์ไม่มีไฟล์ยี่ห้อ ไม่ล็อก (ข้อ 21) — แต่ช่างใส่ตอนตรวจหน้างานไม่ได้ หัวหน้าภาคเป็นคนใส่
      if (opts.mode === "tech")
        return none([{ kind: "offCatalog", text: "อะไหล่นอกสโตร์ใส่ตอนตรวจหน้างานไม่ได้ — เขียนชื่อไว้ในข้อ 4 หัวหน้าภาคจะใส่ให้" }]);
      continue;
    }
    if (legacy.has(id)) continue;
    const files = fileList(p.brandFiles);
    // อะไหล่นอกเครื่อง (เจ้าของงานเลือก 4 พ.ย. 69) — ไม่ผูกกับยี่ห้อ จึงไม่ต้องมีเครื่อง ไม่ต้องรู้ยี่ห้อ ไม่ต้องยืนยัน
    // ตรวจก่อนสองข้อข้างล่าง: ใบที่มีแต่ของพวกนี้ต้องไม่ถูกบอกให้ไปใส่เครื่อง/เลือกยี่ห้อ ทั้งที่ไม่มีอะไรให้เทียบ
    if (files.length === 0) continue;
    // เหลือแต่อะไหล่ของเครื่อง — ข้อความเดิมทุกตัวอักษร (แอปรุ่นก่อนและเทสต์เดิมพึ่งข้อความนี้)
    if (!opts.machine) {
      return none([
        {
          kind: "noMachine",
          text: opts.noMachineText ?? "ใบงานนี้ไม่ได้ระบุเครื่อง — เลือกอะไหล่ไม่ได้ เขียนในข้อ 4 หัวหน้าภาคระบุอะไหล่แทน",
        },
      ]);
    }
    if (!make || !machineFile) {
      return none([{ kind: "noMake", text: `เครื่อง ${opts.machine.code} ยังไม่รู้ยี่ห้อ — เลือกยี่ห้อเครื่องก่อนเลือกอะไหล่` }]);
    }
    const allowed = allowedFiles(machineFile) as string[];
    if (!files.some((f) => allowed.includes(f))) {
      // ข้ามยี่ห้อที่คนกดยืนยันในการบันทึกครั้งนี้ — ผ่านรายครั้ง ไม่ได้เพิ่มเข้าไฟล์ (เส้นทางลงประวัติจาก crossed)
      if (confirmed.has(id)) {
        crossed.push({ sparePartId: id, partCode: p.partCode, name: p.name, files });
        continue;
      }
      const head = `${p.partCode} ${p.name} อยู่ในไฟล์ ${files.join(", ")} — เครื่อง ${opts.machine.code} (${make})`;
      out.push({
        kind: "otherFile",
        partCode: p.partCode,
        partName: p.name,
        sparePartId: id,
        files,
        machineFile,
        make,
        text:
          machineFile === SHARED_FILE
            ? `${head} ไม่มีไฟล์ยี่ห้อของตัวเอง เลือกได้เฉพาะของใช้ร่วม (ไฟล์ Other)`
            : `${head} เลือกได้เฉพาะอะไหล่ไฟล์ ${machineFile} และของใช้ร่วม (ไฟล์ Other)`,
      });
      if (firstOnly) break;
    }
  }
  return { issues: out, crossed, make, machineFile };
}

/** brandIssue แบบข้อความอย่างเดียว — null = ผ่าน */
export async function brandProblem(opts: BrandCheck, db: Db = prisma): Promise<string | null> {
  return (await brandIssue(opts, db))?.text ?? null;
}

// ── ประวัติ "ใช้อะไหล่ข้ามยี่ห้อ" ────────────────────────────────────────

/** action ของประวัติ — ไม่เดินขั้น (อยู่ใน NON_STAGE_ACTIONS ของ routes/workOrders.ts และ NOT_A_MOVE ของแอป) */
export const CROSS_BRAND_ACTION = "CROSS_BRAND_PARTS";

/**
 * "ใช้อะไหล่ข้ามยี่ห้อ (ยืนยันแล้ว): {รหัส} {ชื่อ} — อยู่ในไฟล์ {ไฟล์} · เครื่อง {รหัส} ({ยี่ห้อ})"
 * หลายตัวคั่นด้วย " · " (แต่ละตัวบอกไฟล์ของตัวเอง — ไม่จำเป็นต้องเป็นไฟล์เดียวกัน) · tail = บอกเพิ่มเฉพาะเส้นทาง
 */
export function crossBrandNote(u: CrossBrandUse, tail?: string): string {
  const list = u.parts.map((p) => `${p.partCode} ${p.name} — อยู่ในไฟล์ ${p.files.join(", ")}`).join(" · ");
  return `ใช้อะไหล่ข้ามยี่ห้อ (ยืนยันแล้ว): ${list} · เครื่อง ${u.machineCode} (${u.make})${tail ? ` · ${tail}` : ""}`;
}

/**
 * ลงประวัติการใช้อะไหล่ข้ามยี่ห้อในทรานแซกชันเดียวกับการบันทึก — เจ้าของงานเลือกให้ยืนยันรายครั้งและไม่จำไว้ที่ไหน
 * ประวัติจึงเป็นที่เดียวที่บอกย้อนหลังได้ว่าใครยอมให้ใช้ของยี่ห้ออื่นกับเครื่องไหน
 * at = เวลาของแถว: ผู้เรียกส่งเวลาก่อนแถวหลักของเส้นทาง ให้แถวหลักยังเป็นแถวล่าสุดของใบ (แบบเดียวกับ MACHINE_BRAND_SET)
 * meta = ให้โปรแกรมอ่าน (id อะไหล่ + ไฟล์ของเครื่องตอนนั้น) ไม่ต้องแกะข้อความ · u = null ไม่เขียนอะไร
 */
export async function logCrossBrand(
  tx: Prisma.TransactionClient,
  u: CrossBrandUse | null,
  ctx: { workOrderId: number; userId?: number; status: string; at?: Date; tail?: string }
): Promise<void> {
  if (!u?.parts.length) return;
  await tx.workOrderLog.create({
    data: {
      workOrderId: ctx.workOrderId,
      userId: ctx.userId ?? null,
      action: CROSS_BRAND_ACTION,
      status: ctx.status,
      note: crossBrandNote(u, ctx.tail),
      meta: { machineFile: u.machineFile, parts: u.parts.map((p) => ({ sparePartId: p.sparePartId, files: p.files })) },
      ...(ctx.at ? { createdAt: ctx.at } : {}),
    },
  });
}

// ── ยี่ห้อเครื่องที่คนเลือกในช่องอะไหล่ (rememberMachineBrand) ─────────────────

/** ยี่ห้อเดียวกันไหม — ไม่สนตัวพิมพ์/ช่องว่างหัวท้าย ("huebsch" ที่พิมพ์เอง = "Huebsch" ที่กดชิป ไม่นับว่าเปลี่ยนยี่ห้อ) */
export const sameMake = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * ชิปที่ส่งมาตกไฟล์ยี่ห้อเดียวกับยี่ห้อที่รู้แล้วไหม ("HB - Huebsch" จากไฟล์รายงาน กับชิป "Huebsch") — ใช้ตัดสินว่า
 * "ส่งยี่ห้ออื่นมา" หรือไม่ ไม่ใช้ sameMake ตรง ๆ เพราะเครื่องที่ยังไม่รู้ยี่ห้อตอนเปิดฟอร์ม แล้วคืนนั้นนำเข้ารายงาน
 * ได้ "HB - Huebsch" จะถูกบอกให้ไปหาหัวหน้าภาคแก้ยี่ห้อ ทั้งที่ยี่ห้อไม่ได้ผิดและอะไหล่ที่เลือกก็ผ่าน
 * ล็อกตัดสินด้วยไฟล์อย่างเดียว ข้อความยี่ห้อต่างกันในไฟล์เดียวกันจึงไม่ใช่การเปลี่ยนยี่ห้อ (ยี่ห้อที่รู้แล้วชนะ ไม่เขียนทับ)
 * แก้ข้อความยี่ห้อจริง ๆ ทำที่ "แก้ยี่ห้อเครื่อง" ซึ่งยังเทียบด้วย sameMake
 */
const sameBrandFile = (make: string, brand: string) => sameMake(make, brand) || brandFileOf(make) === brandFileOf(brand);

/**
 * เครื่องที่รู้ยี่ห้อแล้วแต่ส่งชิปยี่ห้ออื่นมา → ข้อความ 400 · null = รับได้ (ยังไม่รู้ยี่ห้อ หรือยี่ห้อเดียวกัน)
 * ตรวจก่อนเปิดทรานแซกชัน — ยี่ห้อที่รู้แล้วเปลี่ยนได้ทางเดียวคือ "แก้ยี่ห้อเครื่อง" ของหัวหน้าภาค/แอดมิน ซึ่งลงประวัติ
 * (ข้อ 17: ฟอร์มไหนก็เปลี่ยนยี่ห้อที่รู้แล้วไม่ได้ ไม่งั้นช่างกดผิดชิปเดียวอะไหล่ทั้งเครื่องเปลี่ยนไฟล์เงียบ ๆ)
 */
export function machineBrandRefusal(
  machine: { code: string; brand?: string | null; model?: string | null } | null,
  brand: string | null | undefined
): string | null {
  if (!machine || !brand?.trim()) return null;
  const make = machineMake(machine);
  if (!make || sameBrandFile(make, brand)) return null;
  return `เครื่อง ${machine.code} มียี่ห้อในระบบแล้ว (${make}) — แก้ยี่ห้อได้ที่หัวหน้าภาคหรือแอดมิน`;
}

/**
 * จำยี่ห้อที่คนกดชิปไว้กับเครื่อง (Machine.model) — ครั้งหน้าไม่ต้องถามอีก (ข้อ 17)
 *
 * เขียน model ไม่ใช่ brand: brand มาจากไฟล์รายงานเครื่องและถูกนำเข้าทับทุกครั้ง ค่าที่คนเลือกต้องอยู่รอด (machineMake อ่าน brand ก่อน model)
 * เขียนแบบมีเงื่อนไข "ยังไม่รู้ยี่ห้อ" ในคำสั่งเดียว — สองคนกดชิปคนละยี่ห้อพร้อมกัน คนหลังไม่เขียนทับคนแรก
 * แต่ได้ 409 ให้โหลดใหม่ (อะไหล่ที่เลือกไว้อาจเป็นคนละไฟล์กับยี่ห้อที่บันทึกไปแล้ว)
 * คืน true เมื่อบันทึกจริง · ลงประวัติ MACHINE_BRAND_SET เมื่อมีใบงาน (กระดานเครื่องดับไม่มีใบ และประวัติเคสไม่มีช่องข้อความ)
 * at = เวลาของประวัติ — ผู้เรียกที่เขียนประวัติเดินขั้นในทรานแซกชันเดียวกันส่งเวลาก่อนแถวนั้น ให้แถวเดินขั้นเป็นแถวล่าสุด
 * how = ชื่อฟอร์ม ไม่ใส่ตำแหน่งคนกด ("เลือกตอนปิดงาน" ไม่ใช่ "ช่างเลือก…") — ฟอร์มเดียวหลายตำแหน่งกดได้ (แอดมินระบุอะไหล่
 * หัวหน้าภาคปิดงานแทนทีม SUB) ประวัติมีชื่อคนกดอยู่แล้ว ใส่ตำแหน่งตายตัวแล้วประวัติบอกตำแหน่งผิดคน
 * ยกเว้นตรวจหน้างานที่เลือกข้อความตามคนกดจริง เพราะ "บันทึกแทนช่าง" เป็นคนละความหมายกับช่างเลือกเอง
 */
export async function rememberMachineBrand(
  tx: Prisma.TransactionClient,
  machine: { id: number; code: string; brand?: string | null; model?: string | null },
  brand: string,
  ctx: { how: string; workOrderId?: number; userId?: number; status?: string; at?: Date }
): Promise<boolean> {
  const value = brand.trim();
  if (!value) return false;
  const refused = machineBrandRefusal(machine, value);
  if (refused) throw new Refusal(400, refused);
  if (machineMake(machine)) return false;
  const done = await tx.machine.updateMany({
    where: {
      id: machine.id,
      OR: [{ brand: null }, { brand: "" }],
      AND: [{ OR: [{ model: null }, { model: "" }] }],
    },
    data: { model: value },
  });
  if (done.count === 0) {
    const now = await tx.machine.findUnique({ where: { id: machine.id }, select: { brand: true, model: true } });
    const make = machineMake(now);
    if (make && !sameBrandFile(make, value)) {
      throw new Refusal(409, `เครื่อง ${machine.code} เพิ่งถูกบันทึกยี่ห้อเป็น ${make} — โหลดใหม่แล้วเลือกอะไหล่อีกครั้ง`);
    }
    return false;
  }
  if (ctx.workOrderId) {
    await tx.workOrderLog.create({
      data: {
        workOrderId: ctx.workOrderId,
        userId: ctx.userId ?? null,
        action: "MACHINE_BRAND_SET",
        status: ctx.status ?? "",
        note: `บันทึกยี่ห้อเครื่อง ${machine.code}: ${value} (${ctx.how})`,
        ...(ctx.at ? { createdAt: ctx.at } : {}),
      },
    });
  }
  return true;
}

// ── รอบเลือกอะไหล่ของช่างที่ยังเปิดอยู่ (PartsPick) ─────────────────────────

/** ประวัติที่เริ่มรอบตรวจใหม่ — หลังจากนี้รอบที่ถูกตีกลับก่อนหน้าไม่ใช่งานค้างของทีมแล้ว */
const PICK_CLOSING_LOGS = ["INSPECT_REQUESTED", "INSPECTED"];

export type OpenPick = { status: "PENDING" | "RETURNED" };

/**
 * แถวที่ openPickOf ต้องใช้ — ที่ที่โชว์แค่ป้ายสถานะ (ใบที่ลิงก์ · ใบค้างของสาขา · ไทม์ไลน์) ดึงแค่นี้พอ
 * ชุดเดียวกันทุกที่ ป้ายจะได้ไม่ต่างกันเพราะบางที่ลืมดึง reviewedAt
 */
export const LATEST_PICK = {
  orderBy: { id: "desc" },
  take: 1,
  select: { status: true, voidedAt: true, reviewedAt: true },
} as const;

/**
 * รอบที่ยังเปิดอยู่ของใบ — กติกาเดียวที่ทุกที่ใช้ (ป้ายสถานะ · กล่องงาน · การ์ดแดง · ปุ่มคอนเฟิร์ม/ตีกลับ · ด่านส่งใหม่)
 *
 * ดูเฉพาะแถวล่าสุด (picks เรียง id ใหม่ก่อน): แถวเก่าเป็นประวัติ ไม่กลับมาเปิดเองเมื่อรอบหลังถูกยกเลิก
 * — ไม่งั้นย้อนขั้นแล้วการ์ดแดงของรอบก่อนโผล่กลับมาที่งานของฉัน ทั้งที่หัวหน้าภาคไม่ได้ตีกลับรอบนี้
 * PENDING เปิดเมื่อใบยังอยู่ NEW · RETURNED เปิดเมื่อใบอยู่ INSPECTING และยังไม่มีการส่งตรวจ/ส่งผลตรวจหลังตีกลับ
 * logs (ถ้ามี) คือด่านที่สอง เผื่อเส้นทางในอนาคตลืมยกเลิกรอบ (voidOpenPick) — ทุกทางออกตอนนี้ยกเลิกอยู่แล้ว
 */
export function openPickOf<T extends { status: string; voidedAt: Date | null; reviewedAt?: Date | null }>(
  orderStatus: string,
  picks: readonly T[] | null | undefined,
  logs?: readonly { action: string; createdAt: Date }[]
): (T & OpenPick) | null {
  const latest = picks?.[0];
  if (!latest || latest.voidedAt) return null;
  if (latest.status === "PENDING" && orderStatus === "NEW") return latest as T & OpenPick;
  if (latest.status === "RETURNED" && orderStatus === "INSPECTING") {
    const back = latest.reviewedAt;
    if (logs && back && logs.some((l) => PICK_CLOSING_LOGS.includes(l.action) && l.createdAt > back)) return null;
    return latest as T & OpenPick;
  }
  return null;
}

/**
 * ปิดรอบที่ค้างอยู่โดยไม่ได้คอนเฟิร์ม/ตีกลับ — ทุกทางออกจากรอบ (ส่งตรวจใหม่ · ย้อนขั้น · ยกเลิก · ปิดใบ · บันทึกแทนช่าง …)
 * เรียกในทรานแซกชันของเส้นทางนั้น · note = เหตุที่ปิด (เก็บไว้ดูย้อนหลัง ไม่ขึ้นหน้าจอ) · คืนจำนวนแถวที่ปิด
 * ปิดทุกแถวที่ยังค้าง ไม่ใช่แค่แถวล่าสุด — แถวเก่าที่หลุดค้างจากก่อนมีกติกานี้จะได้ไม่นับเป็นงานรอใครอีก (เช่น /plans/pending)
 */
export async function voidOpenPick(tx: Prisma.TransactionClient, workOrderId: number, note: string): Promise<number> {
  const done = await tx.partsPick.updateMany({
    where: { workOrderId, voidedAt: null, status: { in: ["PENDING", "RETURNED"] } },
    data: { voidedAt: new Date(), voidNote: note },
  });
  return done.count;
}

/**
 * ป้ายสถานะของใบ — NEW ที่มีรายการของช่างรอ = "หัวหน้าภาค · คอนเฟิร์มอะไหล่" · INSPECTING ที่ถูกตีกลับ = "… — แก้รายการอะไหล่"
 * ไม่มีสถานะใหม่ (ข้อ 2) เปลี่ยนแค่คำที่คนเห็น · ทุกที่ที่โชว์ป้ายของใบที่อาจอยู่ NEW/INSPECTING เรียกตัวนี้
 * ที่ที่ไม่เรียก (บอร์ดแผน · ใบที่ผูกกับเคสเครื่องดับ · รายงานที่เก็บป้ายไว้) อยู่ในแผนข้อ 7 "known differences"
 */
export function statusLabelOf(status: string, open: { status: string } | null = null): string {
  if (open?.status === "PENDING" && status === "NEW") return PARTS_PICK_STAGE_LABEL;
  if (open?.status === "RETURNED" && status === "INSPECTING") return PARTS_PICK_RETURNED_LABEL;
  return WORK_ORDER_STATUS_LABELS[status] ?? status;
}

/** ป้ายบทบาทของคนคอนเฟิร์ม/ตีกลับ — "หัวหน้าภาค" หรือ "แอดมิน" (แอดมินทำแทนได้ ข้อ 11 · ช่างต้องรู้ว่าถามใคร) */
export function pickRoleLabel(role: string | null | undefined): string {
  return role === "SUPERVISOR" ? "หัวหน้าภาค" : "แอดมิน";
}
