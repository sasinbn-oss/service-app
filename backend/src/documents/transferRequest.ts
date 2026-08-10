/**
 * สร้างไฟล์ Word ของ "เอกสารขอโอนสินค้า"
 *
 * ประกอบเอกสารขึ้นใหม่แทนการเติมค่าลงในไฟล์แม่แบบเดิม เพราะแม่แบบจัดตำแหน่ง
 * ช่องกรอกด้วย tab ล้วน ๆ พอเติมข้อความยาวสั้นไม่เท่ากันเข้าไป คอลัมน์ขวาจะเลื่อน
 * และตารางในแม่แบบก็ตายตัวที่ 4 บรรทัด รับรายการมากกว่านั้นไม่ได้
 * โครงที่ประกอบเองใช้ตารางไร้เส้นแทน tab ตำแหน่งจึงคงที่ และใส่กี่รายการก็ได้
 *
 * ข้อความและลำดับหัวข้อทั้งหมดมาจาก ./transferContent ซึ่งตัวสร้าง PDF ใช้ร่วมกัน
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { COMPANY_LOGO_PNG, COMPANY_LOGO_SIZE } from "./logo";
import {
  COLUMNS,
  COMPANY_NAME,
  DOCUMENT_TITLE,
  DOTS,
  Field,
  NOTE_LABEL,
  SIGNATURE_LABELS,
  TABLE_WIDTH,
  TransferRequestData,
  transferRequestContent,
} from "./transferContent";

export type { TransferItem, TransferRequestData } from "./transferContent";
export {
  transferRequestAsciiFilename,
  transferRequestFilename,
  formatThaiDate,
} from "./transferContent";

const FONT = "TH SarabunPSK";

// ครึ่งพอยต์ตามรูปแบบของ OOXML — 30 = 15pt, 26 = 13pt, 24 = 12pt
const SIZE_TITLE = 30;
const SIZE_FIELD = 26;
const SIZE_TABLE = 24;

function text(value: string, opts: { bold?: boolean; size?: number } = {}) {
  return new TextRun({
    text: value,
    bold: opts.bold,
    font: FONT,
    size: opts.size ?? SIZE_FIELD,
  });
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
};

function plainCell(children: Paragraph[], width: number) {
  return new TableCell({
    children,
    width: { size: width, type: WidthType.DXA },
    borders: NO_BORDERS,
    verticalAlign: VerticalAlign.TOP,
  });
}

/** บรรทัดหัวเอกสารแบบ "ป้าย : ค่า" สองช่องซ้าย-ขวา */
function fieldRow([left, right]: [Field, Field]) {
  const field = (f: Field) =>
    new Paragraph({
      spacing: { after: 60 },
      children: [text(`${f.label} :  `, { bold: true }), text(f.value)],
    });

  return new TableRow({
    children: [plainCell([field(left)], 5400), plainCell([field(right)], 5400)],
  });
}

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "000000" } as const;

function itemCell(value: string, width: number, align: "center" | "left") {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    borders: { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER },
    children: [
      new Paragraph({
        alignment: align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { after: 0 },
        children: [text(value, { size: SIZE_TABLE })],
      }),
    ],
  });
}

function itemsTable(rows: string[][]) {
  const header = new TableRow({
    tableHeader: true,
    children: COLUMNS.map((c) => itemCell(c.header, c.width, "center")),
  });

  const body = rows.map(
    (row) =>
      new TableRow({
        children: row.map((value, i) => itemCell(value, COLUMNS[i].width, COLUMNS[i].align)),
      })
  );

  return new Table({ width: { size: TABLE_WIDTH, type: WidthType.DXA }, rows: [header, ...body] });
}

/**
 * ช่องเซ็นชื่อ 4 ช่อง เรียงเหมือนแม่แบบเดิมทุกประการ: คู่บนไม่มีป้ายกำกับ
 * (ให้เขียนเอง) ส่วนคู่ล่างมีป้าย "ผู้ขออนุมัติ / ผู้อนุมัติ" อยู่เหนือเส้น
 */
function signatureBlock() {
  const line = () =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 0 },
      children: [text(DOTS)],
    });

  const label = (value: string) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 360, after: 0 },
      children: [text(value, { bold: true })],
    });

  const column = (caption: string | null) =>
    plainCell(caption ? [label(caption), line(), line()] : [line(), line()], 5400);

  return new Table({
    width: { size: 10800, type: WidthType.DXA },
    borders: NO_BORDERS,
    rows: SIGNATURE_LABELS.map(
      ([left, right]) => new TableRow({ children: [column(left), column(right)] })
    ),
  });
}

export async function buildTransferRequestDocx(data: TransferRequestData): Promise<Buffer> {
  const content = transferRequestContent(data);

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SIZE_FIELD } } } },
    sections: [
      {
        properties: {
          page: {
            // Letter ตามแม่แบบเดิม
            size: { width: 12240, height: 15840 },
            margin: { top: 567, right: 567, bottom: 567, left: 567 },
          },
        },
        children: [
          new Paragraph({
            spacing: { after: 0 },
            children: [
              new ImageRun({
                type: "png",
                data: COMPANY_LOGO_PNG,
                transformation: COMPANY_LOGO_SIZE,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
            children: [text(COMPANY_NAME, { bold: true, size: SIZE_TITLE })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [text(DOCUMENT_TITLE, { bold: true, size: SIZE_TITLE })],
          }),

          new Table({
            width: { size: 10800, type: WidthType.DXA },
            borders: NO_BORDERS,
            rows: content.fieldRows.map(fieldRow),
          }),

          new Paragraph({ spacing: { after: 120 }, children: [] }),
          itemsTable(content.tableRows),

          new Paragraph({
            spacing: { before: 240, after: 0 },
            children: [text(`${NOTE_LABEL} :  `, { bold: true }), text(content.note)],
          }),

          signatureBlock(),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
