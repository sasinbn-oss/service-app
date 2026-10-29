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

export const FIELD_LABEL: Record<"name" | "brand" | "category" | "partNo", string> = {
  name: "ชื่อ",
  brand: "ยี่ห้อ",
  category: "หมวดหมู่",
  partNo: "Part No.",
};

function detect(row: ExcelJS.Row) {
  const found: { col: number; field: Field; score: number; header: string }[] = [];
  row.eachCell((cell, col) => {
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
    if (typeof o.text === "string") return o.text.trim();
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
  image: (FormImage & { md5: string }) | null;
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
export async function parsePartsWorkbook(buf: Buffer): Promise<ParsedFile> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new Error("อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ Excel (.xlsx)");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("ไฟล์ไม่มีชีต");
  let headerRow = 0;
  let cols: ReturnType<typeof detect> = {};
  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const c = detect(ws.getRow(r));
    if (c.partCode) {
      headerRow = r;
      cols = c;
      break;
    }
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
  const md5 = new Map<Buffer, string>();
  const at = (r: ExcelJS.Row, f: Field) => (cols[f] ? text(r.getCell(cols[f]!.col).value) : "");
  for (let line = headerRow + 1; line <= ws.rowCount; line++) {
    const r = ws.getRow(line);
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
    const prev = seen.get(partCode);
    if (prev !== undefined) {
      // แถวล่างคือแถวที่คนเพิ่งแก้ (ต่อท้ายไฟล์) — ใช้แถวหลัง และบอกให้รู้
      const i = rows.findIndex((x) => x.partCode === partCode);
      problems.push({ line, partCode, name, note: `รหัสซ้ำในไฟล์ (แถว ${prev} และ ${line}) — ใช้แถว ${line}` });
      rows.splice(i, 1);
    }
    seen.set(partCode, line);
    if (img && !md5.has(img.data)) md5.set(img.data, crypto.createHash("md5").update(img.data).digest("hex"));
    rows.push({
      line,
      partCode,
      name,
      brand: clean(at(r, "brand")),
      category: clean(at(r, "category")),
      partNo: cleanPartNo(at(r, "partNo")),
      image: img ? { ...img, md5: md5.get(img.data)! } : null,
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
 * เทียบกับในระบบ — อ่านทีเดียวทั้งไฟล์ (ฐานข้อมูลอยู่ไกล รอบละ ~0.2 วิ)
 * รูปเดิมเทียบด้วย md5 ที่ฐานข้อมูลคิดให้ ไม่ดึงรูปทั้งก้อนมาเทียบ (หลายร้อยรูป = หลายสิบ MB)
 */
export async function planPartsImport(parsed: ParsedFile, replaceImages: boolean): Promise<Plan> {
  const codes = parsed.rows.map((r) => r.partCode);
  const brands = [...new Set(parsed.rows.map((r) => r.brand).filter(Boolean))];
  const [existing, others] = await Promise.all([
    codes.length
      ? prisma.$queryRaw<{ id: number; partCode: string; name: string; brand: string | null; category: string | null; partNo: string | null; md5: string | null }[]>`
          SELECT p.id, p."partCode", p.name, p.brand, p.category, p."partNo", md5(i.data) AS md5
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
  const inFile = new Set(codes);

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
    const image: PlanItem["image"] = !r.image ? null : !cur.md5 ? "NEW" : cur.md5 === r.image.md5 ? null : replaceImages ? "CHANGED" : "KEPT";
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

export async function applyPartsImport(parsed: ParsedFile, plan: Plan) {
  const row = new Map(parsed.rows.map((r) => [r.partCode, r]));
  const creates = plan.items.filter((i) => i.action === "CREATE");
  const updates = plan.items.filter((i) => i.action === "UPDATE");

  if (creates.length) {
    await prisma.sparePart.createMany({
      data: creates.map((i) => {
        const r = row.get(i.partCode)!;
        return { partCode: r.partCode, name: r.name, brand: r.brand || null, category: r.category || null, partNo: r.partNo || null };
      }),
      skipDuplicates: true,
    });
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
    await prisma.$transaction(
      chunk.map((i) => {
        const img = row.get(i.partCode)!.image!;
        const sparePartId = idOf.get(i.partCode)!;
        imageIds.push(sparePartId);
        return prisma.sparePartImage.upsert({
          where: { sparePartId },
          update: { mimeType: img.mime, data: img.data },
          create: { sparePartId, mimeType: img.mime, data: img.data },
        });
      })
    );
  }
  if (imageIds.length) {
    // เวลาแก้ล่าสุดคือตัวกันแคชรูปในแอป (?v=updatedAt) — รูปเปลี่ยนแต่เวลาไม่ขยับ เครื่องเดิมยังเห็นรูปเก่าทั้งวัน
    await prisma.$executeRaw`
      UPDATE "SparePart" SET "imageUrl" = '/api/spare-parts/' || id || '/image', "updatedAt" = now()
      WHERE id = ANY(${imageIds}::int[])`;
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
  };
}

export type ReportDetails = ReturnType<typeof reportDetails>;
