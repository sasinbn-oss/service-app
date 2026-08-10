/**
 * สร้างไฟล์ PDF ของ "เอกสารขอโอนสินค้า" หน้าตาเดียวกับไฟล์ Word
 *
 * PDF ไม่มีแนวคิด "ตาราง" ในตัว จึงต้องวัดความสูงของข้อความแล้ววาดเส้นกรอบเอง
 * ข้อความและลำดับหัวข้อทั้งหมดมาจาก ./transferContent ชุดเดียวกับตัวสร้าง Word
 *
 * ฟอนต์ต้องฝังลงในไฟล์เสมอ ฟอนต์มาตรฐานของ PDF ไม่มีอักษรไทยเลย
 * ถ้าไม่ฝังจะได้เอกสารที่เป็นช่องว่างหรือสี่เหลี่ยมทั้งหน้า
 */
import path from "path";
import PDFDocument from "pdfkit";
import { COMPANY_LOGO_PNG } from "./logo";
import {
  COLUMNS,
  COMPANY_NAME,
  DOCUMENT_TITLE,
  DOTS,
  NOTE_LABEL,
  SIGNATURE_LABELS,
  TABLE_WIDTH,
  TransferRequestData,
  transferRequestContent,
} from "./transferContent";

// dist/ มีโครงสร้างโฟลเดอร์เหมือน src/ เส้นทางนี้จึงชี้ไปที่ backend/assets
// ได้ทั้งตอนรันด้วย ts-node และตอนรันไฟล์ที่คอมไพล์แล้ว โดยไม่ต้องก๊อปไฟล์ตอน build
const FONT_DIR = path.join(__dirname, "..", "..", "assets", "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "Sarabun-Regular.ttf");
const FONT_BOLD = path.join(FONT_DIR, "Sarabun-Bold.ttf");

const REGULAR = "sarabun";
const BOLD = "sarabun-bold";

// Letter ขนาดเดียวกับไฟล์ Word (12240 x 15840 twip = 612 x 792 pt)
const PAGE = { width: 612, height: 792 };
const MARGIN = 28;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

const SIZE_TITLE = 15;
const SIZE_FIELD = 13;
const SIZE_TABLE = 12;

const CELL_PADDING = 4;
const LINE_GAP = 1;

/** ความกว้างคอลัมน์จาก twip ในแม่แบบ แปลงเป็นสัดส่วนของความกว้างที่มีจริง */
const COLUMN_WIDTHS = COLUMNS.map((c) => (c.width / TABLE_WIDTH) * CONTENT_WIDTH);

type Doc = PDFKit.PDFDocument;

function drawHeader(doc: Doc) {
  doc.image(COMPANY_LOGO_PNG, MARGIN, MARGIN, { width: 104 });

  doc.font(BOLD).fontSize(SIZE_TITLE);
  doc.text(COMPANY_NAME, MARGIN, MARGIN + 46, { width: CONTENT_WIDTH, align: "center" });
  doc.text(DOCUMENT_TITLE, MARGIN, doc.y, { width: CONTENT_WIDTH, align: "center" });
}

function drawFields(doc: Doc, rows: [{ label: string; value: string }, { label: string; value: string }][]) {
  const half = CONTENT_WIDTH / 2;
  let y = doc.y + 10;

  for (const [left, right] of rows) {
    for (const [i, field] of [left, right].entries()) {
      const x = MARGIN + i * half;
      doc.font(BOLD).fontSize(SIZE_FIELD);
      const labelText = `${field.label} :  `;
      doc.text(labelText, x, y, { width: half, continued: false });
      const labelWidth = doc.widthOfString(labelText);
      doc.font(REGULAR).text(field.value, x + labelWidth, y, {
        width: Math.max(half - labelWidth, 10),
      });
    }
    y += SIZE_FIELD + 8;
  }

  doc.y = y;
}

function rowHeight(doc: Doc, cells: string[]): number {
  doc.font(REGULAR).fontSize(SIZE_TABLE);
  const tallest = Math.max(
    ...cells.map((value, i) =>
      doc.heightOfString(value || " ", {
        width: COLUMN_WIDTHS[i] - CELL_PADDING * 2,
        lineGap: LINE_GAP,
      })
    )
  );
  return tallest + CELL_PADDING * 2;
}

function drawRow(doc: Doc, cells: string[], y: number, height: number, bold: boolean) {
  let x = MARGIN;
  doc.font(bold ? BOLD : REGULAR).fontSize(SIZE_TABLE);

  for (const [i, value] of cells.entries()) {
    const width = COLUMN_WIDTHS[i];
    doc.rect(x, y, width, height).lineWidth(0.5).strokeColor("#000000").stroke();
    doc.fillColor("#000000").text(value, x + CELL_PADDING, y + CELL_PADDING, {
      width: width - CELL_PADDING * 2,
      align: bold ? "center" : COLUMNS[i].align,
      lineGap: LINE_GAP,
    });
    x += width;
  }
  return y + height;
}

function drawTable(doc: Doc, rows: string[][]) {
  const headers = COLUMNS.map((c) => c.header);
  let y = doc.y + 8;
  y = drawRow(doc, headers, y, rowHeight(doc, headers), true);

  for (const row of rows) {
    const height = rowHeight(doc, row);
    // เผื่อที่ไว้ให้ช่องเซ็นชื่อด้วย ไม่ให้แถวสุดท้ายไปติดขอบล่าง
    if (y + height > PAGE.height - MARGIN - 40) {
      doc.addPage();
      y = MARGIN;
      y = drawRow(doc, headers, y, rowHeight(doc, headers), true);
    }
    y = drawRow(doc, row, y, height, false);
  }

  doc.y = y;
}

function drawSignatures(doc: Doc) {
  const half = CONTENT_WIDTH / 2;
  let y = doc.y + 24;

  for (const [left, right] of SIGNATURE_LABELS) {
    for (const [i, caption] of [left, right].entries()) {
      const x = MARGIN + i * half;
      let lineY = y;
      if (caption) {
        doc.font(BOLD).fontSize(SIZE_FIELD).text(caption, x, lineY, { width: half, align: "center" });
        lineY += SIZE_FIELD + 10;
      }
      doc.font(REGULAR).fontSize(SIZE_FIELD);
      doc.text(DOTS, x, lineY, { width: half, align: "center" });
      doc.text(DOTS, x, lineY + SIZE_FIELD + 12, { width: half, align: "center" });
    }
    y += (left || right ? SIZE_FIELD + 10 : 0) + (SIZE_FIELD + 12) * 2 + 14;
  }
}

export function buildTransferRequestPdf(data: TransferRequestData): Promise<Buffer> {
  const content = transferRequestContent(data);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE.width, PAGE.height],
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      doc.registerFont(REGULAR, FONT_REGULAR);
      doc.registerFont(BOLD, FONT_BOLD);

      drawHeader(doc);
      drawFields(doc, content.fieldRows);
      drawTable(doc, content.tableRows);

      doc.font(BOLD).fontSize(SIZE_FIELD);
      const noteLabel = `${NOTE_LABEL} :  `;
      const noteY = doc.y + 14;
      doc.text(noteLabel, MARGIN, noteY);
      doc
        .font(REGULAR)
        .text(content.note, MARGIN + doc.widthOfString(noteLabel), noteY, {
          width: CONTENT_WIDTH - doc.widthOfString(noteLabel),
        });

      drawSignatures(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
