/**
 * สร้างไฟล์ Word "เอกสารขอโอนสินค้า" ตามแม่แบบที่บริษัทใช้อยู่
 *
 * ประกอบเอกสารขึ้นใหม่แทนการเติมค่าลงในไฟล์แม่แบบเดิม เพราะแม่แบบจัดตำแหน่ง
 * ช่องกรอกด้วย tab ล้วน ๆ พอเติมข้อความยาวสั้นไม่เท่ากันเข้าไป คอลัมน์ขวาจะเลื่อน
 * และตารางในแม่แบบก็ตายตัวที่ 4 บรรทัด รับรายการมากกว่านั้นไม่ได้
 * โครงที่ประกอบเองใช้ตารางไร้เส้นแทน tab ตำแหน่งจึงคงที่ และใส่กี่รายการก็ได้
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

export interface TransferItem {
  code: string;
  name: string;
  quantity: number;
  unit?: string | null;
  note?: string | null;
}

export interface TransferRequestData {
  documentNo?: string | null;
  /** ISO date; ถ้าไม่ส่งมาจะใช้วันที่วันนี้ */
  documentDate?: string | null;
  fromWarehouse: string;
  toWarehouse: string;
  preparedBy: string;
  note?: string | null;
  items: TransferItem[];
}

const COMPANY_NAME = "บริษัท เค-เน็กซ์ คอร์ปอเรชั่น จำกัด (สำนักงานใหญ่)";
const DOCUMENT_TITLE = "เอกสารขอโอนสินค้า";
const DOCUMENT_TYPE = "บันทึกขอโอนสินค้า";
const FONT = "TH SarabunPSK";

// ครึ่งพอยต์ตามรูปแบบของ OOXML — 30 = 15pt, 26 = 13pt, 24 = 12pt
const SIZE_TITLE = 30;
const SIZE_FIELD = 26;
const SIZE_TABLE = 24;

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** วันที่แบบไทยพร้อม พ.ศ. เช่น "6 สิงหาคม 2569" */
export function formatThaiDate(date: Date): string {
  return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`;
}

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
function fieldRow(leftLabel: string, leftValue: string, rightLabel: string, rightValue: string) {
  const field = (label: string, value: string) =>
    new Paragraph({
      spacing: { after: 60 },
      children: [text(`${label} :  `, { bold: true }), text(value)],
    });

  return new TableRow({
    children: [
      plainCell([field(leftLabel, leftValue)], 5400),
      plainCell([field(rightLabel, rightValue)], 5400),
    ],
  });
}

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "000000" } as const;

function itemCell(value: string, width: number, align: (typeof AlignmentType)[keyof typeof AlignmentType]) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    borders: {
      top: CELL_BORDER,
      bottom: CELL_BORDER,
      left: CELL_BORDER,
      right: CELL_BORDER,
    },
    children: [
      new Paragraph({
        alignment: align,
        spacing: { after: 0 },
        children: [text(value, { size: SIZE_TABLE })],
      }),
    ],
  });
}

// ความกว้างคอลัมน์ยกมาจากแม่แบบเดิมทั้งชุด (หน่วย twip)
const COLS = { no: 659, code: 1008, name: 5597, qty: 992, note: 3260 };

function itemsTable(items: TransferItem[]) {
  const header = new TableRow({
    tableHeader: true,
    children: [
      itemCell("ลำดับ", COLS.no, AlignmentType.CENTER),
      itemCell("รหัสสินค้า", COLS.code, AlignmentType.CENTER),
      itemCell("รายการ", COLS.name, AlignmentType.CENTER),
      itemCell("จำนวน", COLS.qty, AlignmentType.CENTER),
      itemCell("หมายเหตุ", COLS.note, AlignmentType.CENTER),
    ],
  });

  const rows = items.map(
    (item, i) =>
      new TableRow({
        children: [
          itemCell(String(i + 1), COLS.no, AlignmentType.CENTER),
          itemCell(item.code, COLS.code, AlignmentType.LEFT),
          itemCell(item.name, COLS.name, AlignmentType.LEFT),
          itemCell(
            `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`,
            COLS.qty,
            AlignmentType.CENTER
          ),
          itemCell(item.note ?? "", COLS.note, AlignmentType.LEFT),
        ],
      })
  );

  return new Table({
    width: { size: 11516, type: WidthType.DXA },
    rows: [header, ...rows],
  });
}

const DOTS = "..........................................";

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

  const column = (children: Paragraph[]) => plainCell(children, 5400);

  return new Table({
    width: { size: 10800, type: WidthType.DXA },
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [column([line(), line()]), column([line(), line()])],
      }),
      new TableRow({
        children: [
          column([label("ผู้ขออนุมัติ"), line(), line()]),
          column([label("ผู้อนุมัติ"), line(), line()]),
        ],
      }),
    ],
  });
}

export async function buildTransferRequestDocx(data: TransferRequestData): Promise<Buffer> {
  const date = data.documentDate ? new Date(data.documentDate) : new Date();
  const dateText = Number.isNaN(date.getTime()) ? formatThaiDate(new Date()) : formatThaiDate(date);

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: SIZE_FIELD } },
      },
    },
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
            rows: [
              fieldRow("ประเภทเอกสาร", DOCUMENT_TYPE, "วันที่เอกสาร", dateText),
              fieldRow(
                "ขอโอนจากคลังสินค้า",
                data.fromWarehouse,
                "ขอรับเข้าคลังสินค้า",
                data.toWarehouse
              ),
              fieldRow("เลขที่เอกสาร", data.documentNo ?? "", "ผู้จัดทำ", data.preparedBy),
            ],
          }),

          new Paragraph({ spacing: { after: 120 }, children: [] }),
          itemsTable(data.items),

          new Paragraph({
            spacing: { before: 240, after: 0 },
            children: [text("หมายเหตุ :  ", { bold: true }), text(data.note ?? "")],
          }),

          signatureBlock(),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

function dateStamp(data: TransferRequestData): string {
  const date = data.documentDate ? new Date(data.documentDate) : new Date();
  return Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10);
}

/** ชื่อไฟล์ที่ผู้ใช้จะเห็นตอนดาวน์โหลด */
export function transferRequestFilename(data: TransferRequestData): string {
  const to = data.toWarehouse.replace(/[\\/:*?"<>|]/g, "").trim();
  return `ขอโอนสินค้า-${to}-${dateStamp(data)}.docx`;
}

/**
 * ชื่อไฟล์สำรองแบบ ASCII สำหรับ Content-Disposition
 *
 * ตัวโหลดบางตัวอ่านเฉพาะ `filename=` ไม่อ่าน `filename*=` แบบ UTF-8
 * ถ้าปล่อยให้ค่าสำรองเป็นชื่อกลาง ๆ ผู้ใช้จะได้ไฟล์ชื่อเหมือนกันหมดจนแยกไม่ออก
 */
export function transferRequestAsciiFilename(data: TransferRequestData): string {
  return `transfer-request-${dateStamp(data)}.docx`;
}
