/**
 * อัปเดตข้อมูลอะไหล่จากไฟล์ Excel ในแอป (เจ้าของงานขอ ต.ค. 69 — เดิมต้องให้คนทำระบบรัน scripts/import-spare-parts.ts)
 *
 * ไฟล์ที่ใช้จริงแยกตามยี่ห้อ (Haier · Huebsch · Maytag · Oasis · Other) หัวตารางแบบเดียวกัน:
 * ลำดับ · รูปภาพประกอบ (รูปวางในเซลล์) · รหัสสินค้า · ชื่อรวม (ไทย) · Part No. (บางไฟล์ · Huebsch สะกด "Pant No.") · Category · ยี่ห้อสินค้า
 *
 * กติกา (ตกลงตามตัวอย่าง):
 * - เทียบด้วยรหัสสินค้า — มีแล้วแก้ให้ตรงไฟล์ · ใหม่เพิ่ม · **ไม่ลบ** อะไหล่ที่ไม่อยู่ในไฟล์ (ใบงานเก่ายังอ้างถึง)
 * - ช่องว่างในไฟล์ไม่ลบค่าเดิม (Part No. ว่าง = คงค่าเดิม) — ไฟล์บางยี่ห้อไม่มีคอลัมน์นั้นเลย
 * - รูปในไฟล์ต่างจากรูปเดิม = แทนรูปเดิม (ค่าตั้งต้น) หรือเก็บรูปเดิมไว้ เติมเฉพาะที่ยังไม่มีรูป
 * - รูปเทียบกันด้วย sha256 ของรูปต้นฉบับ — เบราว์เซอร์ย่อรูปใหญ่ก่อนส่ง (ไฟล์เกิน 50 MB) แล้วส่งค่าของรูปก่อนย่อมาด้วย
 *   (mobile/src/utils/shrinkXlsx.ts) ย่อซ้ำได้ไบต์ไม่เหมือนเดิม ถ้าเทียบไบต์ที่เก็บ รูปจะ "เปลี่ยน" ทุกรอบ
 */
import crypto from "crypto";
import ExcelJS from "exceljs";
import { prisma } from "../prisma";
import { FormImage, cellImages } from "./repairFormImport";

type Field = "partCode" | "name" | "brand" | "category" | "partNo" | "image";

/**
 * จับคู่หัวตารางแบบมีคำนี้อยู่ข้างใน (ตัดช่องว่าง/จุด/วงเล็บแล้ว) — คำยาวชนะคำสั้น
 * "partno" อยู่ที่ Part No. เท่านั้น ไม่ใช่รหัสสินค้า: ไฟล์ Maytag มีทั้งสองคอลัมน์ ถ้าแย่งกันจะเอาเลขผู้ผลิตไปเป็นรหัส
 */
const ALIASES: Record<Field, string[]> = {
  partCode: ["รหัสสินค้า", "รหัสอะไหล่", "รหัสพัสดุ", "รหัสชิ้นส่วน", "รหัส", "partcode", "itemcode", "sku"],
  name: ["ชื่อรวม", "ชื่อสินค้า", "ชื่ออะไหล่", "ชื่อพัสดุ", "ชื่อชิ้นส่วน", "ชื่อ", "partname", "itemname", "productname", "name"],
  brand: ["ยี่ห้อสินค้า", "ยี่ห้อ", "ยีห้อ", "แบรนด์", "brand"],
  category: ["หมวดหมู่", "หมวด", "ประเภทสินค้า", "ประเภท", "category"],
  // "Pant No." คือหัวคอลัมน์ในไฟล์ Huebsch ที่ใช้จริง (พิมพ์ผิดมาจากต้นทาง)
  partNo: ["partnumber", "partno", "pantno", "pn"],
  image: ["รูปภาพประกอบ", "รูปภาพ", "รูป", "ภาพ", "image", "picture", "photo"],
};
const IGNORED = ["ลำดับ", "ลําดับ", "no", "seq"];
const norm = (s: string) => s.toLowerCase().replace(/[\s_\-.()/\\:#*]/g, "");

/** เท่ากับที่ฟอร์มแก้ไขรับ (routes/spareParts.ts) — ยาวกว่านี้นำเข้าได้แต่แก้ในฟอร์มไม่ได้ */
export const PART_NO_MAX = 2000;

export const FIELD_LABEL: Record<"name" | "brand" | "category" | "partNo", string> = {
  name: "ชื่อ",
  brand: "ยี่ห้อ",
  category: "หมวดหมู่",
  partNo: "Part No.",
};

function detect(row: ExcelJS.Row) {
  const found: { col: number; field: Field; score: number; header: string }[] = [];
  row.eachCell((cell, col) => {
    // ช่องที่ถูกผสาน ExcelJS คืนค่าของช่องหลักมาให้ — ชื่อเรื่องที่ผสานยาวทั้งแถว ("รายการรหัสสินค้าและชื่อสินค้า Haier")
    // จะกลายเป็นหัวทุกคอลัมน์ นับเฉพาะช่องหลัก
    if (cell.isMerged && cell.master !== cell) return;
    const header = text(cell.value);
    const key = norm(header);
    if (!key || IGNORED.some((h) => norm(h) === key)) return;
    for (const [field, list] of Object.entries(ALIASES) as [Field, string[]][]) {
      const hit = list.map(norm).filter((a) => key.includes(a)).sort((a, b) => b.length - a.length)[0];
      // "pn" สั้นเกินจะไปติดคำอื่น — ต้องเป็นทั้งหัวคอลัมน์
      if (hit && (hit.length > 2 || key === hit)) found.push({ col, field, score: hit.length, header });
    }
  });
  found.sort((a, b) => b.score - a.score);
  const cols: Partial<Record<Field, { col: number; header: string }>> = {};
  const used = new Set<number>();
  for (const f of found) {
    if (cols[f.field] || used.has(f.col)) continue;
    cols[f.field] = { col: f.col, header: f.header };
    used.add(f.col);
  }
  return cols;
}

/** ข้อความในเซลล์ — ข้อความหลายรูปแบบ · ลิงก์ · สูตร · ตัวเลข (Part No. 70613801 เป็นตัวเลขในไฟล์) */
function text(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("").trim();
    // ลิงก์ที่ข้อความจัดรูปแบบบางส่วน (ตัวหนา) — ExcelJS อ่านเป็น { text: { richText }, hyperlink }
    if (o.text !== undefined && o.text !== null) return typeof o.text === "string" ? o.text.trim() : text(o.text as ExcelJS.CellValue);
    if (o.result !== undefined && o.result !== null && typeof o.result !== "object") return String(o.result).trim();
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return ""; // { error: "#VALUE!" } = รูปในเซลล์
  }
  return String(v).trim();
}

/** ช่องว่างซ้ำ/ขึ้นบรรทัดในชื่อจาก Excel ทำให้ "ต่างจากเดิม" ทั้งที่อ่านเหมือนกัน */
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
/** "W11129524 , W10731758" → "W11129524, W10731758" */
const cleanPartNo = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => clean(x))
    .filter(Boolean)
    .join(", ");

export interface ImportRow {
  line: number;
  partCode: string;
  name: string;
  brand: string;
  category: string;
  partNo: string;
  /** hash = sha256 ของรูปต้นฉบับ · source = มาจากเบราว์เซอร์ (รูปถูกย่อ เก็บไว้เทียบรอบหน้า) */
  image: (FormImage & { hash: string; source: boolean }) | null;
}
export interface Problem {
  line: number;
  partCode: string | null;
  name: string | null;
  note: string;
}
export interface ParsedFile {
  columns: Partial<Record<Field, string>>;
  rows: ImportRow[];
  problems: Problem[];
  imageCount: number;
}

/** อ่านชีตแรก — หัวตารางอยู่ในห้าแถวแรก (แถวแรกที่หาคอลัมน์รหัสสินค้าเจอ) */
/** sourceHashes = { "xl/media/image3.png": sha256 ของรูปก่อนย่อ } จากเบราว์เซอร์ — รูปที่ไม่ได้ย่อคิดจากไบต์ในไฟล์ */
export async function parsePartsWorkbook(buf: Buffer, sourceHashes: Record<string, string> = {}): Promise<ParsedFile> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new Error("อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ Excel (.xlsx)");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("ไฟล์ไม่มีชีต");
  // แถวหัวตาราง = แถวแรกที่เจอทั้งรหัสและชื่อ — แถวชื่อเรื่องด้านบน ("ข้อมูลรหัสสินค้าอะไหล่ Haier") มีคำว่ารหัสสินค้าแต่ไม่ใช่หัวตาราง
  // ไม่เจอครบ ใช้แถวแรกที่เจอรหัสไว้บอกว่าขาดคอลัมน์ไหน
  let headerRow = 0;
  let cols: ReturnType<typeof detect> = {};
  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const c = detect(ws.getRow(r));
    if (c.partCode && c.name) {
      headerRow = r;
      cols = c;
      break;
    }
    if (c.partCode && !cols.partCode) cols = c;
  }
  if (!cols.partCode) throw new Error("หาคอลัมน์ “รหัสสินค้า” ไม่เจอ — ไฟล์นี้ไม่ได้อัปเดต");
  if (!cols.name) throw new Error("หาคอลัมน์ “ชื่อรวม (ไทย)” ไม่เจอ — ไฟล์นี้ไม่ได้อัปเดต");

  const images = await cellImages(buf);
  const letter = (n: number) => {
    let s = "";
    for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };
  const imageLetter = cols.image ? letter(cols.image.col) : null;
  // รูปอื่นในแถวเดียวกัน (ไม่ได้อยู่ใต้หัว "รูปภาพประกอบ") ก็ยังเป็นรูปของอะไหล่แถวนั้น
  const rowImages = new Map<number, FormImage>();
  for (const [ref, img] of images) {
    const m = ref.match(/^([A-Z]+)(\d+)$/);
    if (!m) continue;
    const line = Number(m[2]);
    if (!rowImages.has(line) || m[1] === imageLetter) rowImages.set(line, img);
  }

  const rows: ImportRow[] = [];
  const problems: Problem[] = [];
  const seen = new Map<string, number>();
  const hashOf = new Map<Buffer, { hash: string; source: boolean }>();
  /**
   * ค่าในช่อง — ช่องที่ผสานแนวนอนกับช่องข้าง ๆ ในแถวเดียวกัน = ว่าง (แถวหัวข้อ "หมวด: ชุดประตู" ผสานยาว
   * ไม่ใช่อะไหล่ชื่อเดียวกับรหัส) · ผสานแนวตั้ง (ยี่ห้อผสานลงทั้งกลุ่ม) ใช้ค่าของช่องหลักตามเดิม
   */
  const at = (r: ExcelJS.Row, f: Field) => {
    if (!cols[f]) return "";
    const c = r.getCell(cols[f]!.col);
    if (c.isMerged && c.master !== c && Number(c.master.row) === r.number) return "";
    return text(c.value);
  };
  /** ช่องของแถวนี้เอง (ไม่ใช่ค่าที่ผสานมาจากแถวบน) */
  const own = (r: ExcelJS.Row, f: Field) => {
    if (!cols[f]) return "";
    const c = r.getCell(cols[f]!.col);
    return c.isMerged && c.master !== c ? "" : text(c.value);
  };
  const hashed = (img: FormImage) => {
    if (!hashOf.has(img.data)) {
      const given = img.path ? sourceHashes[img.path] : undefined;
      hashOf.set(img.data, given ? { hash: given, source: true } : { hash: crypto.createHash("sha256").update(img.data).digest("hex"), source: false });
    }
    return { ...img, ...hashOf.get(img.data)! };
  };
  for (let line = headerRow + 1; line <= ws.rowCount; line++) {
    const r = ws.getRow(line);
    // เซลล์ที่ถูกผสานกับแถวบน ExcelJS คืนค่าของแถวบนมาให้ — หัวตารางสองชั้น (รหัสสินค้าผสานลงมา) กลายเป็นอะไหล่ชื่อ "ไทย"
    // และอะไหล่ที่ผสานรหัสลงสองแถว แถวล่างที่ว่างจะชนะเป็น "รหัสซ้ำ ใช้แถวหลัง" ทิ้งรูป/Part No. ของแถวจริง
    const codeCell = r.getCell(cols.partCode!.col);
    if (codeCell.isMerged && codeCell.master !== codeCell) {
      // แถวล่างของอะไหล่ที่ผสานรหัสลงหลายแถว — Part No. / รูป ที่อยู่ในแถวล่างเป็นของอะไหล่แถวบน รวมเข้าไป ไม่ทิ้งเงียบ ๆ
      const target = rows.find((x) => x.line === Number(codeCell.master.row));
      if (!target) continue; // หัวตารางสองชั้น หรืออะไหล่แถวบนถูกข้ามไปแล้ว
      const extra = cleanPartNo(own(r, "partNo"));
      if (extra) {
        const merged = cleanPartNo([...new Set([...target.partNo.split(", "), ...extra.split(", ")].filter(Boolean))].join(", "));
        if (merged.length <= PART_NO_MAX) target.partNo = merged;
        else problems.push({ line, partCode: target.partCode, name: target.name, note: `Part No. ในแถวนี้รวมกับแถว ${target.line} แล้วยาวเกิน ${PART_NO_MAX.toLocaleString("en-US")} ตัวอักษร — ไม่ได้ใช้` });
      }
      for (const f of ["brand", "category"] as const) if (!target[f]) target[f] = clean(own(r, f));
      const img = rowImages.get(line);
      if (img && !target.image) target.image = hashed(img);
      continue;
    }
    const partCode = clean(at(r, "partCode")).toUpperCase();
    const name = clean(at(r, "name"));
    const img = rowImages.get(line) ?? null;
    if (!partCode && !name && !img) continue;
    if (!partCode) {
      problems.push({ line, partCode: null, name: name || null, note: "ไม่มีรหัสสินค้า — ข้ามแถวนี้" });
      continue;
    }
    if (!name) {
      problems.push({ line, partCode, name: null, note: "ไม่มีชื่อ — ข้ามแถวนี้" });
      continue;
    }
    const partNo = cleanPartNo(at(r, "partNo"));
    if (partNo.length > PART_NO_MAX) {
      problems.push({ line, partCode, name, note: `Part No. ยาวเกิน ${PART_NO_MAX.toLocaleString("en-US")} ตัวอักษร — ข้ามแถวนี้` });
      continue;
    }
    const prev = seen.get(partCode);
    if (prev !== undefined) {
      // แถวล่างคือแถวที่คนเพิ่งแก้ (ต่อท้ายไฟล์) — ใช้แถวหลัง และบอกให้รู้
      const i = rows.findIndex((x) => x.partCode === partCode);
      problems.push({ line, partCode, name, note: `รหัสซ้ำในไฟล์ (แถว ${prev} และ ${line}) — ใช้แถว ${line}` });
      rows.splice(i, 1);
    }
    seen.set(partCode, line);
    rows.push({
      line,
      partCode,
      name,
      brand: clean(at(r, "brand")),
      category: clean(at(r, "category")),
      partNo,
      image: img ? hashed(img) : null,
    });
  }
  const columns = Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v!.header])) as ParsedFile["columns"];
  return { columns, rows, problems, imageCount: rows.filter((x) => x.image).length };
}

export interface Diff {
  field: keyof typeof FIELD_LABEL;
  label: string;
  from: string;
  to: string;
}
export interface PlanItem {
  line: number;
  partCode: string;
  name: string;
  brand: string;
  partNo: string;
  id: number | null;
  action: "CREATE" | "UPDATE" | "SAME";
  diffs: Diff[];
  /** NEW = เดิมไม่มีรูป · CHANGED = รูปในไฟล์ต่างจากเดิม (แทนเมื่อเลือกแทน) · KEPT = ต่างแต่เลือกเก็บรูปเดิม */
  image: "NEW" | "CHANGED" | "KEPT" | null;
}
export interface Plan {
  items: PlanItem[];
  notInFile: { partCode: string; name: string; brand: string | null; usedIn: number }[];
  /** changed = อะไหล่ที่เปลี่ยนจริง (นับตัวละครั้ง — แก้ชื่อ+เปลี่ยนรูปตัวเดียวกันไม่นับสอง) */
  summary: { rows: number; changed: number; created: number; updated: number; images: number; same: number; skipped: number; notInFile: number };
}

/**
 * รูปในไฟล์เทียบกับรูปเดิม
 * - รูปเดิมเป็นลิงก์ภายนอก (สคริปต์นำเข้าเก่าเก็บ URL ตรง ๆ ไม่มีแถวรูป) = มีรูปแล้ว — "เก็บรูปเดิม" ต้องไม่ทับ
 * - รูปเดียวกัน (hash ต้นฉบับตรงกัน) แต่อะไหล่ไม่มีลิงก์รูป (อัปเดตรอบก่อนพังหลังเขียนรูป) = เขียนลิงก์ให้ ไม่งั้นรูปไม่ขึ้นตลอดไป
 */
function imageAction(cur: { id: number; imageUrl: string | null; hash: string | null }, hash: string | null, replace: boolean): PlanItem["image"] {
  if (!hash) return null;
  if (cur.hash === hash) return cur.imageUrl ? null : "NEW";
  const hasPhoto = !!cur.hash || (!!cur.imageUrl && cur.imageUrl !== `/api/spare-parts/${cur.id}/image`);
  if (!hasPhoto) return "NEW";
  return replace ? "CHANGED" : "KEPT";
}

/**
 * เทียบกับในระบบ — อ่านทีเดียวทั้งไฟล์ (ฐานข้อมูลอยู่ไกล รอบละ ~0.2 วิ)
 * รูปเดิมเทียบด้วย hash ที่ฐานข้อมูลคิดให้ ไม่ดึงรูปทั้งก้อนมาเทียบ (หลายร้อยรูป = หลายสิบ MB)
 * รูปที่มาจากไฟล์ที่ถูกย่อ ใช้ค่ารูปต้นฉบับที่เก็บไว้ (sourceHash) ไม่ใช่ไบต์ที่ย่อแล้ว
 */
export async function planPartsImport(parsed: ParsedFile, replaceImages: boolean): Promise<Plan> {
  const codes = parsed.rows.map((r) => r.partCode);
  const brands = [...new Set(parsed.rows.map((r) => r.brand).filter(Boolean))];
  const [existing, others] = await Promise.all([
    codes.length
      ? prisma.$queryRaw<
          { id: number; partCode: string; name: string; brand: string | null; category: string | null; partNo: string | null; imageUrl: string | null; hash: string | null }[]
        >`
          SELECT p.id, p."partCode", p.name, p.brand, p.category, p."partNo", p."imageUrl",
            COALESCE(i."sourceHash", encode(sha256(i.data), 'hex')) AS hash
          FROM "SparePart" p LEFT JOIN "SparePartImage" i ON i."sparePartId" = p.id
          WHERE upper(p."partCode") = ANY(${codes}::text[])`
      : Promise.resolve([]),
    // ยี่ห้อเดียวกับในไฟล์แต่ไม่อยู่ในไฟล์ — บอกให้รู้ ไม่ลบ
    brands.length
      ? prisma.sparePart.findMany({
          where: { brand: { in: brands }, offCatalog: false },
          select: { partCode: true, name: true, brand: true, _count: { select: { workOrderParts: true } } },
          orderBy: { partCode: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const byCode = new Map(existing.map((p) => [p.partCode.toUpperCase(), p]));
  // แถวที่ข้าม (ไม่มีชื่อ ฯลฯ) ก็อยู่ในไฟล์ — ไม่ใช่ทั้ง "ข้าม" และ "ไม่อยู่ในไฟล์"
  const inFile = new Set([...codes, ...parsed.problems.flatMap((p) => (p.partCode ? [p.partCode] : []))]);

  const items: PlanItem[] = parsed.rows.map((r) => {
    const cur = byCode.get(r.partCode);
    const base = { line: r.line, partCode: r.partCode, name: r.name, brand: r.brand, partNo: r.partNo };
    if (!cur) return { ...base, id: null, action: "CREATE", diffs: [], image: r.image ? "NEW" : null };
    const diffs: Diff[] = [];
    const want = { name: r.name, brand: r.brand, category: r.category, partNo: r.partNo };
    for (const f of ["name", "brand", "category", "partNo"] as const) {
      const to = want[f];
      const from = (f === "name" ? clean(cur.name) : f === "partNo" ? cleanPartNo(cur.partNo ?? "") : clean(cur[f] ?? "")) || "";
      // ช่องว่างในไฟล์ = คงค่าเดิม
      if (to && to !== from) diffs.push({ field: f, label: FIELD_LABEL[f], from: from || "(ว่าง)", to });
    }
    const image = imageAction(cur, r.image?.hash ?? null, replaceImages);
    const action = diffs.length ? "UPDATE" : "SAME";
    return { ...base, id: cur.id, action, diffs, image };
  });
  const notInFile = others
    .filter((p) => !inFile.has(p.partCode.toUpperCase()))
    .map((p) => ({ partCode: p.partCode, name: p.name, brand: p.brand, usedIn: p._count.workOrderParts }));
  const writesImage = (i: PlanItem) => i.image === "NEW" || i.image === "CHANGED";
  return {
    items,
    notInFile,
    summary: {
      rows: parsed.rows.length,
      changed: items.filter((i) => i.action !== "SAME" || writesImage(i)).length,
      created: items.filter((i) => i.action === "CREATE").length,
      updated: items.filter((i) => i.action === "UPDATE").length,
      images: items.filter(writesImage).length,
      same: items.filter((i) => i.action === "SAME" && !writesImage(i)).length,
      skipped: parsed.problems.filter((p) => p.note.includes("ข้าม")).length,
      notInFile: notInFile.length,
    },
  };
}

/** แบ่งงานเขียนเป็นก้อน — แต่ละก้อนสำเร็จทั้งก้อนหรือไม่เลย · พังกลางทางกดอัปเดตซ้ำได้ (ทำแค่ส่วนที่ยังต่าง) */
const IMAGE_CHUNK = 20;

/** ทำไปถึงไหนแล้ว — พังกลางทาง ประวัติต้องบอกยอดที่บันทึกจริง ไม่ใช่ยอดที่ตั้งใจจะทำ */
export interface ApplyProgress {
  created: number;
  updated: number;
  images: number;
  codes: Set<string>;
}
export const newProgress = (): ApplyProgress => ({ created: 0, updated: 0, images: 0, codes: new Set() });

export async function applyPartsImport(parsed: ParsedFile, plan: Plan, progress: ApplyProgress = newProgress()) {
  const row = new Map(parsed.rows.map((r) => [r.partCode, r]));
  const creates = plan.items.filter((i) => i.action === "CREATE");
  const updates = plan.items.filter((i) => i.action === "UPDATE");

  if (creates.length) {
    const made = await prisma.sparePart.createMany({
      data: creates.map((i) => {
        const r = row.get(i.partCode)!;
        return { partCode: r.partCode, name: r.name, brand: r.brand || null, category: r.category || null, partNo: r.partNo || null };
      }),
      skipDuplicates: true,
    });
    progress.created = made.count;
    for (const i of creates) progress.codes.add(i.partCode);
  }
  if (updates.length) {
    // แก้ทุกแถวในคำสั่งเดียว — ทีละแถวคือรอบละ ~0.2 วิ คูณหลายร้อยแถว
    // ส่งเป็น text[] ล้วน (ค่าว่าง = '') ไม่ใช่ null ทั้งก้อน — Prisma เดาชนิด array ที่เป็น null ทั้งหมดผิด (ดู CLAUDE.md)
    const ids = updates.map((i) => i.id!);
    const v = (f: "name" | "brand" | "category" | "partNo") => updates.map((i) => row.get(i.partCode)![f] ?? "");
    await prisma.$executeRaw`
      UPDATE "SparePart" AS p SET
        name = COALESCE(NULLIF(v.name, ''), p.name),
        brand = COALESCE(NULLIF(v.brand, ''), p.brand),
        category = COALESCE(NULLIF(v.category, ''), p.category),
        "partNo" = COALESCE(NULLIF(v.part_no, ''), p."partNo"),
        "updatedAt" = now()
      FROM unnest(${ids}::int[], ${v("name")}::text[], ${v("brand")}::text[], ${v("category")}::text[], ${v("partNo")}::text[])
        AS v(id, name, brand, category, part_no)
      WHERE p.id = v.id`;
    progress.updated = updates.length;
    for (const i of updates) progress.codes.add(i.partCode);
  }

  // รูป: ต้องรู้ id ของแถวที่เพิ่งสร้างก่อน
  const withImage = plan.items.filter((i) => i.image === "NEW" || i.image === "CHANGED");
  const created = creates.length
    ? await prisma.sparePart.findMany({ where: { partCode: { in: creates.map((i) => i.partCode) } }, select: { id: true, partCode: true } })
    : [];
  const idOf = new Map<string, number>([...created.map((p) => [p.partCode.toUpperCase(), p.id] as const)]);
  for (const i of plan.items) if (i.id) idOf.set(i.partCode, i.id);
  const imageIds: number[] = [];
  for (let k = 0; k < withImage.length; k += IMAGE_CHUNK) {
    const chunk = withImage.slice(k, k + IMAGE_CHUNK).filter((i) => idOf.has(i.partCode));
    const ids = chunk.map((i) => idOf.get(i.partCode)!);
    // ลิงก์รูปเขียนในก้อนเดียวกับรูป — เดิมเขียนท้ายสุดครั้งเดียว พังกลางทางแล้วรูปเข้าแต่ลิงก์ไม่มา รูปไม่ขึ้น
    // เวลาแก้ล่าสุดคือตัวกันแคชรูปในแอป (?v=updatedAt) — รูปเปลี่ยนแต่เวลาไม่ขยับ เครื่องเดิมยังเห็นรูปเก่าทั้งวัน
    await prisma.$transaction([
      ...chunk.map((i) => {
        const img = row.get(i.partCode)!.image!;
        const sparePartId = idOf.get(i.partCode)!;
        return prisma.sparePartImage.upsert({
          where: { sparePartId },
          update: { mimeType: img.mime, data: img.data, sourceHash: img.source ? img.hash : null },
          create: { sparePartId, mimeType: img.mime, data: img.data, sourceHash: img.source ? img.hash : null },
        });
      }),
      prisma.$executeRaw`
        UPDATE "SparePart" SET "imageUrl" = '/api/spare-parts/' || id || '/image', "updatedAt" = now()
        WHERE id = ANY(${ids}::int[])`,
    ]);
    imageIds.push(...ids);
    progress.images += ids.length;
    for (const i of chunk) progress.codes.add(i.partCode);
  }
  return { created: creates.length, updated: updates.length, images: imageIds.length };
}

/** รายการที่เก็บในประวัติ — ไม่มีรูป ไม่มีแถวที่เหมือนเดิม */
export function reportDetails(fileName: string, parsed: ParsedFile, plan: Plan) {
  return {
    fileName,
    columns: parsed.columns,
    items: plan.items
      .filter((i) => i.action !== "SAME" || i.image)
      .map(({ line, partCode, name, brand, partNo, action, diffs, image }) => ({ line, partCode, name, brand, partNo, action, diffs, image })),
    problems: parsed.problems,
    notInFile: plan.notInFile,
    // รหัสทุกแถวที่ใช้ได้ (แถวที่ข้ามอยู่ใน problems) — ยี่ห้อเดียวแยกหลายไฟล์ในรอบเดียว "ไม่อยู่ในไฟล์" ต้องหักรหัสที่อยู่ไฟล์อื่นออก
    // และหน้าตรวจใช้หารหัสซ้ำข้ามไฟล์
    codes: parsed.rows.map((r) => r.partCode),
  };
}

export type ReportDetails = ReturnType<typeof reportDetails>;
type Gone = Plan["notInFile"][number];

/**
 * "ไม่อยู่ในไฟล์" ของทั้งรอบ — แต่ละไฟล์คิดเฉพาะรหัสของตัวเอง ไฟล์ยี่ห้อเดียวกันสองไฟล์ (แยกเพราะไฟล์ใหญ่)
 * จะฟ้องว่าอีกครึ่งไม่อยู่ในไฟล์ทั้งหมด — หักรหัสที่อยู่ในไฟล์ใดก็ได้ของรอบ และนับตัวละครั้ง
 * แถวประวัติก่อนมี codes ใช้รหัสจากรายการที่เปลี่ยน/ปัญหาแทน (ขาดแถวที่เหมือนเดิมไป — ดีกว่าไม่หักเลย)
 */
export function notInBatch(files: { details: Pick<ReportDetails, "notInFile" | "items" | "problems"> & { codes?: string[] } }[]) {
  const inBatch = new Set<string>();
  for (const { details: d } of files) {
    for (const c of d.codes ?? []) inBatch.add(c.toUpperCase());
    for (const i of d.items) inBatch.add(i.partCode.toUpperCase());
    for (const p of d.problems) if (p.partCode) inBatch.add(p.partCode.toUpperCase());
  }
  const gone = new Map<string, Gone>();
  for (const { details: d } of files)
    for (const g of d.notInFile) if (!inBatch.has(g.partCode.toUpperCase())) gone.set(g.partCode.toUpperCase(), g);
  return [...gone.values()].sort((a, b) => a.partCode.localeCompare(b.partCode));
}
