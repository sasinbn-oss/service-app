/**
 * ข้อความแจ้งคิวช่างให้ลูกค้า (เจ้าของงานขอ ต.ค. 69) — แอดมินคอนเฟิร์มนัดแล้วกดคัดลอกไปส่ง LINE ได้เลย
 *
 * ใช้ถ้อยคำตามที่เจ้าของงานส่งมา เติมเฉพาะข้อมูลใบงาน · สร้างจากใบงานตอนนี้ทุกครั้ง ไม่เก็บซ้ำ —
 * เลื่อนนัดแล้วข้อความเปลี่ยนตามเอง ไม่มีฉบับเก่าค้างให้ส่งผิด
 */
import { thaiDate } from "../components/DateField";

/** ขั้นของงานตรวจหน้างาน — ข้อความใช้ "เข้าตรวจสอบ / ผลการตรวจสอบ" แทน "เข้าซ่อม / ผลการซ่อม" */
const INSPECT_STAGES = ["INSPECT_CONFIRM", "INSPECT_DISPATCH", "INSPECTING"];

export interface MessageOrder {
  code: string;
  status: string;
  branchName: string;
  machineCode: string | null;
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
    ...(o.machineCode ? [`🧺 เครื่อง: ${o.machineCode}`] : []),
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
  symptom: string | null;
  contactName: string | null;
  contactPhone: string | null;
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

/**
 * ข้อความสรุปส่งกลุ่มไลน์ช่าง — ไม่ใส่ชื่อแอดมินที่คอนเฟิร์ม (ช่างไม่ต้องใช้ · เจ้าของงานเลือก) แต่ใส่เบอร์ร้าน
 * เพราะช่างต้องโทรแจ้งก่อนเข้าพื้นที่ · title บอกว่าเป็นสรุปของวันไหน แบบไหน
 */
export function confirmedReport(title: string, rows: ConfirmedRow[]) {
  const teams = byTeam(rows);
  return [
    "📢 สรุปงานที่คอนเฟิร์มลูกค้าแล้ว",
    `🗓️ ${title} · ${rows.length} งาน`,
    "",
    teams
      .map((t) =>
        [
          `👷 ${t.team} (${t.rows.length} งาน)`,
          ...t.rows.flatMap((r, i) => [
            `${i + 1}) 📅 ${dayLabel(r.scheduledAt)}${r.scheduledTime ? ` · ${r.scheduledTime} น.` : ""} · ${
              r.kind === "INSPECT" ? "🔍 ตรวจหน้างาน" : "🔧 ซ่อม"
            }`,
            `   📋 ${r.code} · 🏪 ${r.branchName} (${r.branchCode})`,
            ...(r.machineCode || r.symptom
              ? [`   🧺 ${[r.machineCode, r.symptom ? `อาการ: ${r.symptom}` : null].filter(Boolean).join(" · ")}`]
              : []),
            ...(r.contactName || r.contactPhone ? [`   📞 ${[r.contactName, r.contactPhone].filter(Boolean).join(" ")}`] : []),
          ]),
        ].join("\n")
      )
      .join("\n\n"),
  ].join("\n");
}
