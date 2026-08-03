/**
 * Bulk-import spare parts from an Excel/CSV file.
 *
 *   npm run import:parts -- ./parts.xlsx              # preview only, writes nothing
 *   npm run import:parts -- ./parts.xlsx --yes        # actually write to the database
 *   npm run import:parts -- ./parts.xlsx --yes --images ./photos
 *
 * Rows are matched on part code: an existing part is updated, a new code is
 * created. Nothing is ever deleted.
 *
 * Photos pasted into the sheet with Excel's "Place in Cell" are imported
 * automatically. A --images folder (files named <partCode>.jpg) is also
 * supported for sheets that only reference photos by name.
 */
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { extractInCellImages, ExtractedImage } from "./excel-images";

const prisma = new PrismaClient();

type Field = "partCode" | "name" | "brand" | "category" | "description" | "imageUrl";

// Aliases are matched as substrings of the normalised header, so "ยี่ห้อ" also
// catches "ยี่ห้อสินค้า" and "ชื่อ" catches "ชื่อรวม (ไทย)". When several
// aliases match one header the longest one wins, which keeps specific names
// like "รหัสสินค้า" from being claimed by a shorter, more generic alias.
const COLUMN_ALIASES: Record<Field, string[]> = {
  partCode: [
    "รหัสสินค้า", "รหัสอะไหล่", "รหัสพัสดุ", "รหัสชิ้นส่วน", "รหัส",
    "partcode", "partno", "partnumber", "itemcode", "sku", "code",
  ],
  name: [
    "ชื่อรวม", "ชื่อสินค้า", "ชื่ออะไหล่", "ชื่อพัสดุ", "ชื่อชิ้นส่วน", "ชื่อ", "รายการ",
    "partname", "itemname", "productname", "name", "title", "product",
  ],
  brand: ["ยี่ห้อสินค้า", "ยี่ห้อ", "ยีห้อ", "แบรนด์", "brand", "manufacturer", "maker", "make"],
  category: ["หมวดหมู่", "หมวด", "ประเภทสินค้า", "ประเภท", "กลุ่มสินค้า", "category", "type", "group"],
  description: [
    "รายละเอียดเพิ่มเติม", "รายละเอียด", "คำอธิบาย", "หมายเหตุ", "สเปค",
    "description", "detail", "remark", "note", "spec",
  ],
  imageUrl: [
    "รูปภาพประกอบ", "รูปภาพ", "ลิงก์รูป", "ลิงค์รูป", "รูป", "ภาพ",
    "imageurl", "imagelink", "image", "picture", "photo", "img",
  ],
};

// Row-number / sequence columns must never be mistaken for a part code.
const IGNORED_HEADERS = ["ลำดับ", "ลําดับ", "ที่", "no", "no.", "seq", "order", "running", "item"];

const IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function normalise(header: string): string {
  return header.toLowerCase().replace(/[\s_\-.()/\\:#*]/g, "").trim();
}

function detectColumns(headerRow: ExcelJS.Row): Partial<Record<Field, number>> {
  // Score every (column, field) pair, then assign greedily from the strongest
  // match down so each column and each field is used at most once.
  const candidates: { col: number; field: Field; score: number }[] = [];

  headerRow.eachCell((cell, colNumber) => {
    const raw = String(cell.value ?? "").trim();
    if (!raw) return;
    const key = normalise(raw);
    if (!key || IGNORED_HEADERS.some((h) => normalise(h) === key)) return;

    for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [Field, string[]][]) {
      for (const alias of aliases) {
        const normalisedAlias = normalise(alias);
        if (key.includes(normalisedAlias)) {
          candidates.push({ col: colNumber, field, score: normalisedAlias.length });
          break; // longest alias per field is listed first
        }
      }
    }
  });

  candidates.sort((a, b) => b.score - a.score);

  const mapping: Partial<Record<Field, number>> = {};
  const usedColumns = new Set<number>();
  for (const candidate of candidates) {
    if (mapping[candidate.field] !== undefined) continue;
    if (usedColumns.has(candidate.col)) continue;
    mapping[candidate.field] = candidate.col;
    usedColumns.add(candidate.col);
  }
  return mapping;
}

function cellText(row: ExcelJS.Row, colNumber?: number): string {
  if (!colNumber) return "";
  const value = row.getCell(colNumber).value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();

  // Excel cells can hold formulas, rich text, hyperlinks or error values rather
  // than plain strings, so unwrap the shapes ExcelJS reports before falling back.
  if (typeof value === "object") {
    const obj = value as unknown as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      return (obj.richText as { text: string }[]).map((t) => t.text).join("").trim();
    }
    if (typeof obj.text === "string") return obj.text.trim();
    if (typeof obj.result === "string") return obj.result.trim();
    if (typeof obj.hyperlink === "string") return obj.hyperlink.trim();
    return ""; // e.g. { error: "#VALUE!" } from an in-cell image
  }
  return String(value).trim();
}

interface ParsedRow {
  rowNumber: number;
  partCode: string;
  name: string;
  brand?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
}

async function readWorkbook(filePath: string): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  if (filePath.toLowerCase().endsWith(".csv")) {
    await workbook.csv.readFile(filePath);
  } else {
    await workbook.xlsx.readFile(filePath);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("No worksheet found in the file");
  return sheet;
}

async function saveImage(sparePartId: number, image: ExtractedImage) {
  await prisma.$transaction([
    prisma.sparePartImage.upsert({
      where: { sparePartId },
      update: { mimeType: image.mimeType, data: image.buffer },
      create: { sparePartId, mimeType: image.mimeType, data: image.buffer },
    }),
    prisma.sparePart.update({
      where: { id: sparePartId },
      data: { imageUrl: `/api/spare-parts/${sparePartId}/image` },
    }),
  ]);
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith("--"));
  const commit = args.includes("--yes");
  const imagesFlagIndex = args.indexOf("--images");
  const imagesDir = imagesFlagIndex >= 0 ? args[imagesFlagIndex + 1] : undefined;

  if (!filePath) {
    console.error("Usage: npm run import:parts -- <file.xlsx> [--yes] [--images <folder>]");
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`ไม่พบไฟล์: ${path.resolve(filePath)}`);
    process.exit(1);
  }

  const sheet = await readWorkbook(filePath);
  const mapping = detectColumns(sheet.getRow(1));

  const embeddedImages = filePath.toLowerCase().endsWith(".csv")
    ? new Map<number, ExtractedImage>()
    : await extractInCellImages(filePath);

  console.log(`\nไฟล์: ${path.resolve(filePath)}`);
  console.log(`ชีต: ${sheet.name}  (${sheet.rowCount} แถว รวมหัวตาราง)`);
  console.log(`รูปที่ฝังในเซลล์: ${embeddedImages.size} รูป\n`);

  console.log("คอลัมน์ที่ตรวจพบ:");
  const fields: Field[] = ["partCode", "name", "brand", "category", "description", "imageUrl"];
  for (const field of fields) {
    const col = mapping[field];
    const header = col ? cellText(sheet.getRow(1), col) : null;
    console.log(`  ${field.padEnd(12)} ← ${header ? `"${header}" (คอลัมน์ ${col})` : "ไม่พบ"}`);
  }
  console.log();

  if (mapping.partCode === undefined || mapping.name === undefined) {
    console.error(
      "หาคอลัมน์รหัสสินค้าหรือชื่อสินค้าไม่เจอ\n" +
        "กรุณาแก้หัวตารางแถวแรกให้มีคำว่า 'รหัส' และ 'ชื่อ' แล้วรันใหม่"
    );
    process.exit(1);
  }

  const rows: ParsedRow[] = [];
  const skipped: { rowNumber: number; reason: string }[] = [];
  const seen = new Map<string, number>();

  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const partCode = cellText(row, mapping.partCode);
    const name = cellText(row, mapping.name);

    if (!partCode && !name) continue; // blank spacer row
    if (!partCode) {
      skipped.push({ rowNumber: i, reason: "ไม่มีรหัสสินค้า" });
      continue;
    }
    if (!name) {
      skipped.push({ rowNumber: i, reason: "ไม่มีชื่อสินค้า" });
      continue;
    }
    if (seen.has(partCode)) {
      skipped.push({ rowNumber: i, reason: `รหัส "${partCode}" ซ้ำกับแถว ${seen.get(partCode)}` });
      continue;
    }
    seen.set(partCode, i);

    rows.push({
      rowNumber: i,
      partCode,
      name,
      brand: cellText(row, mapping.brand) || undefined,
      category: cellText(row, mapping.category) || undefined,
      description: cellText(row, mapping.description) || undefined,
      imageUrl: cellText(row, mapping.imageUrl) || undefined,
    });
  }

  const withEmbedded = rows.filter((r) => embeddedImages.has(r.rowNumber)).length;
  console.log(`อ่านได้ ${rows.length} รายการ, ข้าม ${skipped.length} แถว`);
  console.log(`ในจำนวนนี้มีรูปฝังมาด้วย ${withEmbedded} รายการ\n`);

  console.log("ตัวอย่าง 5 รายการแรก:");
  for (const row of rows.slice(0, 5)) {
    console.log(
      `  [${row.partCode}] ${row.name}` +
        `${row.brand ? ` | ยี่ห้อ: ${row.brand}` : ""}` +
        `${row.category ? ` | หมวด: ${row.category}` : ""}` +
        `${embeddedImages.has(row.rowNumber) ? " | มีรูป" : ""}`
    );
  }
  if (skipped.length > 0) {
    console.log("\nแถวที่ข้าม:");
    for (const s of skipped.slice(0, 10)) {
      console.log(`  แถว ${s.rowNumber}: ${s.reason}`);
    }
    if (skipped.length > 10) console.log(`  ... และอีก ${skipped.length - 10} แถว`);
  }

  if (!commit) {
    console.log(
      "\n── โหมดตรวจสอบ ยังไม่ได้บันทึกลงฐานข้อมูล ──\n" +
        "ถ้าข้อมูลด้านบนถูกต้องแล้ว ให้รันใหม่โดยเติม --yes ต่อท้าย"
    );
    return;
  }

  let created = 0;
  let updated = 0;
  let imagesSaved = 0;

  for (const row of rows) {
    const existing = await prisma.sparePart.findUnique({ where: { partCode: row.partCode } });
    const data = {
      name: row.name,
      brand: row.brand,
      category: row.category,
      description: row.description,
      // Only take an image URL from the sheet when it is a real link; local
      // filenames are handled by the --images pass below.
      ...(row.imageUrl && /^https?:\/\//i.test(row.imageUrl) ? { imageUrl: row.imageUrl } : {}),
    };

    const part = existing
      ? await prisma.sparePart.update({ where: { partCode: row.partCode }, data })
      : await prisma.sparePart.create({ data: { partCode: row.partCode, ...data } });
    existing ? updated++ : created++;

    const embedded = embeddedImages.get(row.rowNumber);
    if (embedded) {
      await saveImage(part.id, embedded);
      imagesSaved++;
    }
  }

  console.log(`\nบันทึกแล้ว: เพิ่มใหม่ ${created} รายการ, อัปเดต ${updated} รายการ`);
  if (imagesSaved > 0) console.log(`นำเข้ารูปจากในไฟล์ Excel ${imagesSaved} รูป`);

  if (imagesDir) {
    if (!fs.existsSync(imagesDir)) {
      console.error(`\nไม่พบโฟลเดอร์รูป: ${path.resolve(imagesDir)}`);
    } else {
      console.log(`\nกำลังนำเข้ารูปจากโฟลเดอร์ ${path.resolve(imagesDir)} ...`);
      const files = fs.readdirSync(imagesDir);
      let imported = 0;
      let missing = 0;

      for (const row of rows) {
        // Match <partCode>.<ext>, case-insensitively, on any supported type.
        const match = files.find((f) => {
          const ext = path.extname(f).toLowerCase();
          return (
            IMAGE_MIME[ext] !== undefined &&
            path.basename(f, path.extname(f)).toLowerCase() === row.partCode.toLowerCase()
          );
        });
        if (!match) {
          missing++;
          continue;
        }

        const part = await prisma.sparePart.findUnique({ where: { partCode: row.partCode } });
        if (!part) continue;

        await saveImage(part.id, {
          buffer: fs.readFileSync(path.join(imagesDir, match)),
          mimeType: IMAGE_MIME[path.extname(match).toLowerCase()],
        });
        imported++;
      }
      console.log(`นำเข้ารูปจากโฟลเดอร์ ${imported} รูป, ไม่พบรูปสำหรับ ${missing} รายการ`);
    }
  }
}

main()
  .catch((e) => {
    console.error("\nเกิดข้อผิดพลาด:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
