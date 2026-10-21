/**
 * ข้อความแจ้งคิวช่างให้ลูกค้า (เจ้าของงานขอ ต.ค. 69) — แอดมินคอนเฟิร์มนัดแล้วกดคัดลอกไปส่ง LINE ได้เลย
 *
 * ใช้ถ้อยคำตามที่เจ้าของงานส่งมา เติมเฉพาะข้อมูลใบงาน · สร้างจากใบงานตอนนี้ทุกครั้ง ไม่เก็บซ้ำ —
 * เลื่อนนัดแล้วข้อความเปลี่ยนตามเอง ไม่มีฉบับเก่าค้างให้ส่งผิด
 */
import { thaiDate } from "../components/DateField";
import { machineTag } from "./machine";

/** ขั้นของงานตรวจหน้างาน — ข้อความใช้ "เข้าตรวจสอบ / ผลการตรวจสอบ" แทน "เข้าซ่อม / ผลการซ่อม" */
const INSPECT_STAGES = ["INSPECT_CONFIRM", "INSPECT_DISPATCH", "INSPECTING"];

export interface MessageOrder {
  code: string;
  status: string;
  branchName: string;
  machineCode: string | null;
  machineCapacityKg?: number | null;
  symptom: string | null;
  scheduledAt: string | null;
  scheduledTime: string | null;
}

export function customerMessage(o: MessageOrder) {
  const inspect = INSPECT_STAGES.includes(o.status);
  // บรรทัดแรกของอาการเท่านั้น — บรรทัด "สาเหตุ/แก้ไข" ที่ช่างเติมทีหลังเป็นเรื่องภายใน ไม่ส่งให้ลูกค้า
  const symptom = (o.symptom ?? "").split("\n")[0].trim();
  const when = o.scheduledAt
    ? `${thaiDate(o.scheduledAt.slice(0, 10))}${o.scheduledTime ? ` · ${o.scheduledTime} น.` : ""}`
    : "—";
  return [
    `🛠️ Service Care ขอแจ้งคิวช่างสำหรับการ${inspect ? "เข้าตรวจสอบ" : "เข้าซ่อม"}ที่สาขานะคะ`,
    "",
    `📋 Case No. ${o.code}`,
    `🏪 ชื่อสาขา: ${o.branchName}`,
    // งานทั้งสาขาไม่ได้ระบุเครื่อง — ไม่มีบรรทัดนี้ ดีกว่าขึ้น "เครื่อง: —"
    ...(o.machineCode ? [`🧺 เครื่อง: ${machineTag(o.machineCode, o.machineCapacityKg)}`] : []),
    ...(symptom ? [`🔧 อาการ: ${symptom}`] : []),
    `📅 วัน–เวลา: ${when}`,
    "",
    "📞 ทีมช่างจะเข้าดำเนินการตามวันที่ ที่กำหนด และจะโทรแจ้งลูกค้าก่อนเข้าพื้นที่ค่ะ",
    `✅ หลังจากเสร็จสิ้นงาน จะมีการแจ้งผล${inspect ? "การตรวจสอบ" : "การซ่อม"}ให้ทราบอีกครั้งค่ะ`,
  ].join("\n");
}

/** มีข้อความให้คัดลอกเมื่อนัดตกลงกับลูกค้าแล้วและงานยังไม่จบ */
export const hasCustomerMessage = (o: { status: string; appointmentStatus: string | null; scheduledAt: string | null }) =>
  !!o.scheduledAt &&
  (o.appointmentStatus === "CONFIRMED" || o.appointmentStatus === "ADMIN_PICKED") &&
  !["DONE", "CANCELLED", "CLAIM_REVIEW"].includes(o.status);

// ── สรุปเคสที่คอนเฟิร์มลูกค้าแล้ว ส่งกลุ่มไลน์ช่าง (เจ้าของงานขอ ต.ค. 69) ──

export interface ConfirmedRow {
  id: number;
  code: string;
  kind: "INSPECT" | "REPAIR";
  team: string | null;
  scheduledAt: string;
  scheduledTime: string | null;
  branchCode: string;
  branchName: string;
  machineCode: string | null;
  machineCapacityKg?: number | null;
  symptom: string | null;
  contactName: string | null;
  contactPhone: string | null;
  latitude?: number | null;
  longitude?: number | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
/** "อ. 20 ต.ค. 69" — ช่างอ่านวันในสัปดาห์ก่อนวันที่ */
export function dayLabel(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${thaiDate(ymd)}`;
}

/** เคสแยกตามทีม — ลำดับตามที่เซิร์ฟเวอร์เรียงมา (ทีม → วันเวลานัด) */
export function byTeam(rows: ConfirmedRow[]) {
  const map = new Map<string, ConfirmedRow[]>();
  for (const r of rows) {
    const k = r.team ?? "ยังไม่มีทีม";
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map].map(([team, list]) => ({ team, rows: list }));
}

const LINE = "------------------------";

/**
 * ข้อความจ่ายงานส่งกลุ่มไลน์ช่าง 1 ทีม (ออกแบบใหม่ ต.ค. 69 — แบบแรกอ่านยากบนมือถือ)
 *
 * ไม่มีอิโมจิ (เจ้าของงานขอเอาออก) — ทุกบรรทัดขึ้นต้นด้วยชื่อช่อง "เลขที่ใบงาน:" "รหัสสาขา:" … แยกคนละบรรทัด
 * ไลน์บนมือถือกว้างไม่ถึง 30 ตัวอักษร: บรรทัดสั้น ห้ามย่อหน้าด้วยเว้นวรรค (ตัดบรรทัดแล้วเยื้องไม่ตรง)
 * · เส้นคั่นระหว่างงาน · วันที่บอกครั้งเดียว (หลายวันขึ้นหัวข้อย่อยต่อวัน)
 * · ไม่มีเบอร์บอกตรง ๆ ว่าไม่มี ไม่ใช่หายไปเฉย ๆ · ไม่ใส่ชื่อแอดมิน (ช่างไม่ต้องใช้)
 * · ไม่ใส่อาการ (เจ้าของงานขอเอาออก) — ช่างเปิดดูในใบงานของตัวเองได้ ข้อความไลน์สั้นลงเหลือแค่ไปที่ไหน เมื่อไหร่
 */
export function teamDispatch(team: string, rows: ConfirmedRow[]) {
  const days = [...new Set(rows.map((r) => r.scheduledAt))];
  const one = days.length === 1;
  const out = [`คิวงานช่าง${one ? ` ${dayLabel(days[0])}` : ""}`, `ทีม: ${team} (${rows.length} งาน)`];
  let n = 0;
  for (const day of days) {
    const list = rows.filter((r) => r.scheduledAt === day);
    if (!one) out.push(LINE, `วันที่ ${dayLabel(day)} (${list.length} งาน)`);
    for (const r of list) {
      n += 1;
      out.push(
        LINE,
        `${n}) ${r.scheduledTime ? `${r.scheduledTime} น.` : "ไม่ระบุเวลา"} | ${r.kind === "INSPECT" ? "ตรวจหน้างาน" : "ซ่อม"}`,
        `เลขที่ใบงาน: ${r.code}`,
        `รหัสสาขา: ${r.branchCode}`,
        `สาขา: ${r.branchName}`,
        ...(r.machineCode ? [`เครื่อง: ${machineTag(r.machineCode, r.machineCapacityKg)}`] : []),
        `ผู้ติดต่อ: ${[r.contactName, r.contactPhone].filter(Boolean).join(" ") || "ไม่มีในใบงาน"}`,
        ...(r.latitude != null && r.longitude != null ? [`แผนที่: https://maps.google.com/?q=${r.latitude},${r.longitude}`] : [])
      );
    }
  }
  out.push(LINE, "ถึงหน้างานแล้วอัปเดตในแอปด้วยนะครับ");
  return out.join("\n");
}

/** ทุกทีมต่อกัน — แต่ละทีมเป็นข้อความครบในตัว ตัดส่งทีละกลุ่มได้ */
export const allDispatch = (rows: ConfirmedRow[]) =>
  byTeam(rows)
    .map((t) => teamDispatch(t.team, t.rows))
    .join("\n\n");

// ── ใบงาน SUB: ข้อความส่งทีม outsource (เจ้าของงานขอ ต.ค. 69) ──

export interface SubOrder {
  code: string;
  status: string;
  assignedTeam: string | null;
  scheduledAt: string | null;
  scheduledTime: string | null;
  branchCode: string;
  branchName: string;
  branchLatitude?: number | null;
  branchLongitude?: number | null;
  machineCode: string | null;
  machineCapacityKg?: number | null;
  symptom: string | null;
  contactName: string | null;
  contactPhone: string | null;
  parts: { name: string; quantity: number; unit?: string | null }[];
}

/**
 * ข้อความที่หัวหน้าภาคส่งให้ทีม outsource ทางไลน์ — รูปแบบเดียวกับข้อความจ่ายงานทีมช่าง (ไม่มีอิโมจิ บรรทัดสั้น)
 *
 * ต่างจากข้อความทีมช่างตรงที่ใส่อาการกับอะไหล่ด้วย: ช่างในบริษัทเปิดดูในใบงานได้ แต่ทีม outsource ไม่มีบัญชีในแอป
 * ข้อความนี้คือทุกอย่างที่เขาจะได้เห็น · ท้ายข้อความบอกว่าต้องส่งรูปอะไรกลับ เพราะหัวหน้าภาคต้องแนบตอนบันทึกผล
 */
export function subDispatch(o: SubOrder) {
  const day = o.scheduledAt ? dayLabel(o.scheduledAt.slice(0, 10)) : "ยังไม่นัด";
  const symptom = (o.symptom ?? "").split("\n")[0].trim();
  return [
    `งาน SUB ทีม: ${o.assignedTeam ?? "—"}`,
    LINE,
    `นัด: ${day} | ${o.scheduledTime ? `${o.scheduledTime} น.` : "ไม่ระบุเวลา"} | ${INSPECT_STAGES.includes(o.status) ? "ตรวจหน้างาน" : "ซ่อม"}`,
    `เลขที่ใบงาน: ${o.code}`,
    `รหัสสาขา: ${o.branchCode}`,
    `สาขา: ${o.branchName}`,
    ...(o.machineCode ? [`เครื่อง: ${machineTag(o.machineCode, o.machineCapacityKg)}`] : []),
    ...(symptom ? [`อาการ: ${symptom}`] : []),
    ...(o.parts.length ? ["อะไหล่:", ...o.parts.map((p) => `- ${p.name} x${p.quantity}${p.unit ? ` ${p.unit}` : ""}`)] : []),
    `ผู้ติดต่อ: ${[o.contactName, o.contactPhone].filter(Boolean).join(" ") || "ไม่มีในใบงาน"}`,
    ...(o.branchLatitude != null && o.branchLongitude != null
      ? [`แผนที่: https://maps.google.com/?q=${o.branchLatitude},${o.branchLongitude}`]
      : []),
    LINE,
    "ทำเสร็จแล้วส่งรูปกลับมาด้วยนะครับ:",
    "- ป้ายรุ่นเครื่อง",
    "- ก่อนซ่อม",
    "- หลังซ่อม",
  ].join("\n");
}
