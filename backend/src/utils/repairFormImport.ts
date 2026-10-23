/**
 * อ่านไฟล์ "แจ้งซ่อม (Service COCO)" ที่ส่งออกจาก Microsoft Forms (.xlsx) เป็นแถวใบงาน
 *
 * สาขา COCO แจ้งซ่อมผ่านฟอร์มนี้มาก่อนมีแอป และยังแจ้งอยู่ (เจ้าของงานส่งไฟล์มา ต.ค. 69 — 168 แถวใน 8 วัน)
 * เดิมแอดมินต้องพิมพ์ทีละใบ ตอนนี้แอดมินอัปโหลดไฟล์ทั้งก้อน ดูตัวอย่าง แล้วระบบเปิดใบงานให้
 *
 * อ่านตามชื่อหัวคอลัมน์ ไม่ใช่ตำแหน่ง — ฟอร์มเพิ่ม/สลับคำถามเมื่อไร คอลัมน์ก็เลื่อน
 * ไฟล์ที่ไม่มีหัวคอลัมน์ "รหัสสาขา" กับ "อาการที่พบ" ถือว่าผิดไฟล์ ไม่เดาต่อ
 */
import ExcelJS from "exceljs";
import { createHash } from "crypto";
import { JOB_TYPE_LABELS, MACHINE_MODELS, isValidMachineCode, normaliseMachineCode } from "./constants";

export interface FormRow {
  /** แถวในไฟล์ (นับแบบ Excel) — บอกแอดมินว่าแถวไหนมีปัญหา */
  line: number;
  reportedAt: string | null;
  branchCode: string;
  jobType: string;
  /** ข้อความประเภทงานในไฟล์ — ประเภทที่ไม่รู้จักกลายเป็น "อื่นๆ" โดยใช้ข้อความนี้เป็นหัวข้อ */
  jobTypeRaw: string;
  machineCode: string | null;
  /** ช่อง "เครื่อง" ที่ไม่ใช่รหัสเครื่อง เช่น "กล่องเกตเวย์" "ท่อลมร้อน" — เก็บไว้ในรายละเอียด ไม่ผูกเครื่อง */
  machineNote: string | null;
  model: string | null;
  capacityKg: number | null;
  symptom: string;
  contactName: string | null;
  contactPhone: string | null;
  place: string | null;
  photo: string | null;
  video: string | null;
  /** ลายนิ้วมือของแถว — นำเข้าไฟล์เดิมซ้ำ (หรือไฟล์ที่ต่อท้ายแถวใหม่) แล้วแถวเก่าไม่เกิดใบซ้ำ */
  importKey: string;
  /** ปัญหาของแถวนี้เอง (ไม่ขึ้นกับฐานข้อมูล) — มีค่า = นำเข้าไม่ได้ */
  problem: string | null;
}

/**
 * ประเภทงานในฟอร์มเป็นข้อความที่สาขาเลือก/พิมพ์ — แปลงเป็นรหัสของระบบ
 * "ตุ้คอนโทรลปั้มดูดเข้าแท้งค์" สะกดไม่ตรง จึงจับคำว่าปั๊ม/ปั้ม ไม่ใช่เทียบทั้งคำ
 */
export function jobTypeFromForm(raw: string): string {
  const t = raw.replace(/\s+/g, "").toUpperCase();
  if (!t) return "CM";
  if (t === "CM" || t.includes("ซ่อม")) return "CM";
  if (t === "PM" || t.includes("บำรุง")) return "PM";
  if (t.includes("IT")) return "IT";
  if (t.includes("แลกเหรียญ")) return "COIN_CHANGER";
  if (t.includes("ปั๊ม") || t.includes("ปั้ม")) return "WATER_PUMP";
  if (t.includes("น้ำยา")) return "DETERGENT";
  if (t.includes("ลมร้อน")) return "HOT_AIR_DUCT";
  if (t.includes("น้ำร้อน")) return "WATER_HEATER";
  return "OTHER";
}

/** อุปกรณ์ร้าน — ไม่ผูกเครื่อง (ตรงกับ EQUIPMENT_JOBS ของฟอร์มเปิดใบงาน) */
export const EQUIPMENT_JOB_TYPES = new Set(["COIN_CHANGER", "WATER_PUMP", "DETERGENT", "WATER_HEATER"]);

/** "OASIS" "huebsch " → ชื่อรุ่นตามรายการของระบบ · ไม่อยู่ในรายการเก็บตามที่พิมพ์ */
function modelFromForm(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const hit = MACHINE_MODELS.find((m) => m.toLowerCase() === t.toLowerCase());
  return hit ?? t.slice(0, 100);
}

/** "25 Kg" "13kg" → 25 / 13 · อ่านไม่ออกหรือนอกช่วงที่เป็นไปได้ = ว่าง (ไม่ทำให้ทั้งแถวพัง) */
function capacityFromForm(raw: string): number | null {
  const m = raw.match(/(\d{1,3})/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 5 && n <= 60 ? n : null;
}

/** ค่าในเซลล์เป็นข้อความ — ลิงก์ (Forms ส่งรูปเป็น hyperlink) วันที่ และ rich text ต่างกันหมด */
function text(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("hyperlink" in v && typeof v.hyperlink === "string") return v.hyperlink;
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return text(v.result as ExcelJS.CellValue);
  }
  return String(v).trim();
}

const HEADERS: Record<keyof Omit<FormRow, "line" | "jobType" | "importKey" | "problem" | "jobTypeRaw" | "machineNote"> | "jobTypeRaw", string[]> = {
  reportedAt: ["วันที่แจ้ง"],
  branchCode: ["รหัสสาขา"],
  jobTypeRaw: ["ประเภทงาน"],
  machineCode: ["เครื่อง"],
  model: ["รุ่นของเครื่อง", "รุ่น"],
  capacityKg: ["ขนาดเครื่อง", "ขนาด"],
  symptom: ["อาการที่พบ", "อาการ"],
  contactName: ["ผู้ติดต่อที่สาขา", "ผู้ติดต่อ"],
  contactPhone: ["เบอร์ติดต่อสาขา", "เบอร์ติดต่อ", "เบอร์"],
  place: ["ชื่อสถานที่"],
  photo: ["รูปภาพ", "รูป"],
  video: ["วิดีโอ"],
};

export async function parseRepairForm(buf: Buffer): Promise<FormRow[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new Error("อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ .xlsx ที่ส่งออกจากฟอร์มแจ้งซ่อม");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("ไฟล์ไม่มีชีต");

  // หัวตารางอยู่แถวแรกที่มีคำว่า "รหัสสาขา" — ส่งออกจาก Forms อยู่แถว 1 แต่ไฟล์ที่คนแก้ต่ออาจมีแถวชื่อเรื่องข้างบน
  let headerRow = 0;
  const col: Partial<Record<keyof typeof HEADERS, number>> = {};
  for (let r = 1; r <= Math.min(ws.rowCount, 10) && !headerRow; r++) {
    const row = ws.getRow(r);
    const names: string[] = [];
    row.eachCell((c, i) => (names[i] = text(c.value).trim()));
    if (!names.some((n) => n === "รหัสสาขา")) continue;
    headerRow = r;
    for (const [key, labels] of Object.entries(HEADERS) as [keyof typeof HEADERS, string[]][]) {
      // ตรงทั้งคำก่อน ("เครื่อง" ต้องไม่ไปจับ "รุ่นของเครื่อง") แล้วค่อยขึ้นต้นด้วย
      const exact = names.findIndex((n) => n && labels.includes(n));
      const loose = names.findIndex((n) => n && labels.some((l) => n.startsWith(l)));
      const at = exact > 0 ? exact : loose;
      if (at > 0) col[key] = at;
    }
  }
  if (!headerRow || !col.branchCode || !col.symptom) {
    throw new Error('ไม่ใช่ไฟล์ฟอร์มแจ้งซ่อม — ต้องมีหัวคอลัมน์ "รหัสสาขา" และ "อาการที่พบ"');
  }

  const rows: FormRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: keyof typeof HEADERS) => (col[k] ? text(row.getCell(col[k]!).value) : "");
    const branchCode = get("branchCode").trim().toUpperCase();
    const symptom = get("symptom").trim();
    if (!branchCode && !symptom) continue; // แถวว่างท้ายไฟล์

    const jobTypeRaw = get("jobTypeRaw").trim();
    const jobType = jobTypeFromForm(jobTypeRaw);
    const rawCode = get("machineCode").trim();
    const equipment = EQUIPMENT_JOB_TYPES.has(jobType);
    const code = rawCode ? normaliseMachineCode(rawCode) : "";
    const validCode = !!code && isValidMachineCode(code);
    const dateRaw = col.reportedAt ? row.getCell(col.reportedAt).value : null;
    const reportedAt =
      dateRaw instanceof Date ? dateRaw.toISOString() : get("reportedAt") ? new Date(get("reportedAt")).toISOString() : null;

    let problem: string | null = null;
    if (!branchCode) problem = "ไม่มีรหัสสาขา";
    else if (!symptom) problem = "ไม่มีอาการที่พบ";
    // ช่องเครื่องที่ไม่ใช่รหัส W/D (สาขาพิมพ์ชื่ออุปกรณ์ เช่น "กล่องเกตเวย์") ไม่ทำให้แถวตก —
    // เปิดเป็นงานทั้งสาขา แล้วเก็บข้อความไว้ในรายละเอียด ไม่เดาว่าเป็นเครื่องไหน

    const machineCode = !equipment && validCode ? code : null;
    rows.push({
      line: r,
      reportedAt: reportedAt && !Number.isNaN(Date.parse(reportedAt)) ? reportedAt : null,
      branchCode,
      jobType,
      jobTypeRaw,
      machineCode,
      machineNote: !machineCode && rawCode ? rawCode.slice(0, 100) : null,
      model: machineCode ? modelFromForm(get("model")) : null,
      capacityKg: machineCode ? capacityFromForm(get("capacityKg")) : null,
      symptom: symptom.slice(0, 500),
      contactName: get("contactName").trim().slice(0, 120) || null,
      contactPhone: get("contactPhone").trim().slice(0, 40) || null,
      place: get("place").trim() || null,
      photo: get("photo").trim() || null,
      video: get("video").trim() || null,
      // วันที่ + สาขา + เครื่อง + อาการ — แถวเดียวกันในไฟล์ใหม่ (ที่ต่อท้ายแถวใหม่) ได้ค่าเดิมเสมอ
      importKey: createHash("sha1")
        .update([reportedAt ?? "", branchCode, rawCode.toUpperCase().replace(/\s+/g, ""), symptom, get("contactPhone").trim()].join("|"))
        .digest("hex"),
      problem,
    });
  }
  return rows;
}

/** หัวข้อใบงาน — ประเภทที่ไม่รู้จักใช้ข้อความในไฟล์ (เหมือนเลือก "อื่นๆ" แล้วพิมพ์เอง) */
export function formTitle(r: FormRow): string {
  return r.jobType === "OTHER" ? r.jobTypeRaw.slice(0, 200) || "อื่นๆ" : JOB_TYPE_LABELS[r.jobType] ?? r.jobType;
}

/** รายละเอียดใบงาน — ที่มา + ลิงก์รูป/วิดีโอใน SharePoint (ดึงไฟล์มาเก็บเองไม่ได้ ต้องล็อกอินบัญชีบริษัท) */
export function formDetail(r: FormRow): string {
  // ไม่มีบรรทัด "แจ้งผ่านฟอร์ม · วันที่ · สถานที่" แล้ว — ที่มาโชว์เป็น "นำเข้าจากฟอร์มแจ้งซ่อม" อยู่แล้ว
  // เจ้าของงานเห็นแล้วว่ารก (ต.ค. 69) · ลิงก์รูป/วิดีโอหน้าใบงานแสดงเป็นปุ่มสั้น (DetailText)
  return [
    r.machineNote ? `อุปกรณ์ตามที่แจ้ง: ${r.machineNote}` : null,
    r.photo ? `รูปจากฟอร์ม: ${r.photo}` : null,
    r.video ? `วิดีโอจากฟอร์ม: ${r.video}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
