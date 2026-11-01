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

// ── ปัญหาไฟล์ยี่ห้อของรายการอะไหล่ (brandProblem) ─────────────────────────

export type BrandIssue = {
  /**
   * noMachine = ช่างเลือกอะไหล่บนใบที่ไม่มีเครื่อง · offCatalog = ช่างใส่ของนอกสโตร์ · missing = id ไม่มีอยู่จริง
   * noMake = เครื่องยังไม่รู้ยี่ห้อ · noFile = อะไหล่ไม่อยู่ในไฟล์ไหน · otherFile = อยู่แต่ไฟล์ที่เครื่องนี้เลือกไม่ได้
   */
  kind: "noMachine" | "offCatalog" | "missing" | "noMake" | "noFile" | "otherFile";
  text: string;
  partCode?: string;
  machineFile?: BrandFile;
};

export type BrandCheck = {
  /** เครื่องของใบ (null = ใบงานทั้งสาขา ไม่ล็อก — ข้อ 22) */
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
};

/**
 * ตรวจว่ารายการอะไหล่เลือกได้กับเครื่องของใบไหม — ปัญหาแรกที่เจอชนะ (ตามลำดับรายการที่ส่งมา)
 *
 * กฎเดียวที่ทุกเส้นทางใช้ (เจ้าของงาน: "เครื่อง Huebsch ก็สามารถเลือกอะไหล่ของเครื่อง Huebsch ได้เท่านั้น"):
 * ไฟล์ของอะไหล่ต้องมีไฟล์ของเครื่อง หรือ Other (ของใช้ร่วม) — อ่านจาก SparePartBrandFile ไม่ใช่ข้อความยี่ห้อ
 * อ่านอะไหล่ทุกตัวในคำสั่งเดียว (ฐานข้อมูลอยู่ไกล รอบละ ~0.23 วิ) · ส่งรายการว่างมา = ไม่มีอะไรให้ตรวจ
 */
export async function brandIssue(opts: BrandCheck, db: Db = prisma): Promise<BrandIssue | null> {
  const ids = [...new Set(opts.parts.map((p) => p.sparePartId))];
  if (ids.length === 0) return null;
  if (!opts.machine) {
    return opts.mode === "tech"
      ? {
          kind: "noMachine",
          text: opts.noMachineText ?? "ใบงานนี้ไม่ได้ระบุเครื่อง — เลือกอะไหล่ไม่ได้ เขียนในข้อ 4 หัวหน้าภาคระบุอะไหล่แทน",
        }
      : null;
  }
  const rows = await db.sparePart.findMany({
    where: { id: { in: ids } },
    select: { id: true, partCode: true, name: true, offCatalog: true, brandFiles: { select: { file: true } } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const legacy = new Set(opts.legacyIds ?? []);
  // ยี่ห้อที่รู้แล้วชนะชิปเสมอ — ชิปมีไว้สำหรับเครื่องที่ยังไม่รู้ยี่ห้อเท่านั้น (ข้อ 17)
  const make = machineMake(opts.machine) ?? (opts.machineBrand?.trim() || null);
  const machineFile = brandFileOf(make);
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) return { kind: "missing", text: "ไม่พบอะไหล่ที่เลือก — โหลดใหม่แล้วเลือกอีกครั้ง" };
    if (p.offCatalog) {
      // ของนอกสโตร์ไม่มีไฟล์ยี่ห้อ ไม่ล็อก (ข้อ 21) — แต่ช่างใส่ตอนตรวจหน้างานไม่ได้ หัวหน้าภาคเป็นคนใส่
      if (opts.mode === "tech")
        return { kind: "offCatalog", text: "อะไหล่นอกสโตร์ใส่ตอนตรวจหน้างานไม่ได้ — เขียนชื่อไว้ในข้อ 4 หัวหน้าภาคจะใส่ให้" };
      continue;
    }
    if (legacy.has(id)) continue;
    if (!make || !machineFile) {
      return { kind: "noMake", text: `เครื่อง ${opts.machine.code} ยังไม่รู้ยี่ห้อ — เลือกยี่ห้อเครื่องก่อนเลือกอะไหล่` };
    }
    const files = fileList(p.brandFiles);
    if (files.length === 0) {
      return {
        kind: "noFile",
        partCode: p.partCode,
        machineFile,
        text: `${p.partCode} ยังไม่อยู่ในไฟล์ยี่ห้อไหน — เลือกไม่ได้ (แอดมินอัปโหลดไฟล์ที่มีรหัสนี้ หรือติ๊กไฟล์ที่หน้าจัดการข้อมูลอะไหล่)`,
      };
    }
    const allowed = allowedFiles(machineFile) as string[];
    if (!files.some((f) => allowed.includes(f))) {
      const head = `${p.partCode} ${p.name} อยู่ในไฟล์ ${files.join(", ")} — เครื่อง ${opts.machine.code} (${make})`;
      return {
        kind: "otherFile",
        partCode: p.partCode,
        machineFile,
        text:
          machineFile === SHARED_FILE
            ? `${head} ไม่มีไฟล์ยี่ห้อของตัวเอง เลือกได้เฉพาะของใช้ร่วม (ไฟล์ Other)`
            : `${head} เลือกได้เฉพาะอะไหล่ไฟล์ ${machineFile} และของใช้ร่วม (ไฟล์ Other)`,
      };
    }
  }
  return null;
}

/** brandIssue แบบข้อความอย่างเดียว — null = ผ่าน */
export async function brandProblem(opts: BrandCheck, db: Db = prisma): Promise<string | null> {
  return (await brandIssue(opts, db))?.text ?? null;
}

// ── ยี่ห้อเครื่องที่คนเลือกในช่องอะไหล่ (rememberMachineBrand) ─────────────────

const sameMake = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

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
  if (!make || sameMake(make, brand)) return null;
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
    if (make && !sameMake(make, value)) {
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
