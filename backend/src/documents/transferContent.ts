/**
 * เนื้อหาของ "เอกสารขอโอนสินค้า" ในรูปแบบที่ยังไม่ผูกกับไฟล์ชนิดใด
 *
 * ตัวสร้างไฟล์ Word และ PDF อ่านจากที่นี่ทั้งคู่ ข้อความ ลำดับหัวข้อ ชื่อคอลัมน์
 * และสัดส่วนความกว้างจึงมีที่อยู่แห่งเดียว แก้ฟอร์มทีหลังไม่ต้องไล่แก้สองที่
 * ให้ตรงกัน — เหลือแค่วิธีวาดที่ต่างกันตามข้อจำกัดของแต่ละรูปแบบไฟล์
 */

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

export const COMPANY_NAME = "บริษัท เค-เน็กซ์ คอร์ปอเรชั่น จำกัด (สำนักงานใหญ่)";
export const DOCUMENT_TITLE = "เอกสารขอโอนสินค้า";
export const DOCUMENT_TYPE = "บันทึกขอโอนสินค้า";
export const NOTE_LABEL = "หมายเหตุ";

/** ป้ายใต้ช่องเซ็นชื่อ ตามแม่แบบเดิม: คู่บนไม่มีป้าย คู่ล่างมี */
export const SIGNATURE_LABELS: [string | null, string | null][] = [
  [null, null],
  ["ผู้ขออนุมัติ", "ผู้อนุมัติ"],
];

export const DOTS = "..........................................";

/**
 * ความกว้างคอลัมน์ (หน่วย twip) — ตัวสร้าง PDF ใช้ค่าเดียวกันนี้เป็นสัดส่วน
 *
 * ปรับจากแม่แบบเดิมเล็กน้อยด้วยการวัดความกว้างข้อความจริงที่ 12pt: ของเดิม
 * ให้ช่องรหัสสินค้าแค่ 1008 twip ซึ่งแคบกว่ารหัสอย่าง "SPOSO052" จนตัดขึ้นบรรทัดใหม่
 * และรวมกันแล้วกว้างเกินพื้นที่ของหน้ากระดาษ รวมใหม่ได้ 11100 twip พอดีขอบ
 */
export const COLUMNS = [
  { header: "ลำดับ", width: 800, align: "center" as const },
  { header: "รหัสสินค้า", width: 1400, align: "left" as const },
  { header: "รายการ", width: 4600, align: "left" as const },
  { header: "จำนวน", width: 1000, align: "center" as const },
  { header: "หมายเหตุ", width: 3300, align: "left" as const },
];

export const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** วันที่แบบไทยพร้อม พ.ศ. เช่น "6 สิงหาคม 2569" */
export function formatThaiDate(date: Date): string {
  return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`;
}

function documentDate(data: TransferRequestData): Date {
  const date = data.documentDate ? new Date(data.documentDate) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export interface Field {
  label: string;
  value: string;
}

export interface TransferContent {
  /** สามบรรทัดหัวเอกสาร แต่ละบรรทัดมีช่องซ้ายและช่องขวา */
  fieldRows: [Field, Field][];
  tableRows: string[][];
  note: string;
}

export function transferRequestContent(data: TransferRequestData): TransferContent {
  return {
    fieldRows: [
      [
        { label: "ประเภทเอกสาร", value: DOCUMENT_TYPE },
        { label: "วันที่เอกสาร", value: formatThaiDate(documentDate(data)) },
      ],
      [
        { label: "ขอโอนจากคลังสินค้า", value: data.fromWarehouse },
        { label: "ขอรับเข้าคลังสินค้า", value: data.toWarehouse },
      ],
      [
        { label: "เลขที่เอกสาร", value: data.documentNo ?? "" },
        { label: "ผู้จัดทำ", value: data.preparedBy },
      ],
    ],
    tableRows: data.items.map((item, i) => [
      String(i + 1),
      item.code,
      item.name,
      `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`,
      item.note ?? "",
    ]),
    note: data.note ?? "",
  };
}

function dateStamp(data: TransferRequestData): string {
  return documentDate(data).toISOString().slice(0, 10);
}

/** ชื่อไฟล์ที่ผู้ใช้จะเห็นตอนดาวน์โหลด */
export function transferRequestFilename(data: TransferRequestData, ext: "docx" | "pdf"): string {
  const to = data.toWarehouse.replace(/[\\/:*?"<>|]/g, "").trim();
  return `ขอโอนสินค้า-${to}-${dateStamp(data)}.${ext}`;
}

/**
 * ชื่อไฟล์สำรองแบบ ASCII สำหรับ Content-Disposition
 *
 * ตัวโหลดบางตัวอ่านเฉพาะ `filename=` ไม่อ่าน `filename*=` แบบ UTF-8
 * ถ้าปล่อยให้ค่าสำรองเป็นชื่อกลาง ๆ ผู้ใช้จะได้ไฟล์ชื่อเหมือนกันหมดจนแยกไม่ออก
 */
export function transferRequestAsciiFilename(
  data: TransferRequestData,
  ext: "docx" | "pdf"
): string {
  return `transfer-request-${dateStamp(data)}.${ext}`;
}
