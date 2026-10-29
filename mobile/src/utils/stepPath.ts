/**
 * แถบขั้นตอนของใบงาน — ใบนี้ต้องผ่านขั้นไหนบ้าง ตอนนี้อยู่ตรงไหน (แบบที่เจ้าของงานเลือก ต.ค. 69 รอบสอง)
 *
 * โชว์เฉพาะขั้นที่ใบนี้ต้องผ่าน ไม่ใช่ทุกขั้นของระบบแล้วติดป้าย "ข้าม" — เดิมใบทั่วไปขึ้น 12 ขั้น
 * ครึ่งหนึ่งเป็นขั้นที่ไม่เกี่ยวกับใบนั้น (โอนคลังอื่น · เสนอราคา · ตรวจหน้างาน) คนอ่านต้องนับเองว่าเหลืออีกกี่ขั้น
 * - ขั้นทางเลือก (เสนอราคา · ใบรออะไหล่ · ตรวจเคลม) โผล่เฉพาะใบที่ต้องทำ
 * - โอนคลังอื่นเป็นขั้นย่อยใต้ "เบิกอะไหล่" ไม่นับเป็นขั้นหลัก — คนทำเปลี่ยน (แอดมิน → หัวหน้าภาค) แต่เรื่องเดียวกัน
 * - ตรวจหน้างานเป็นรอบแยกเหนือแถบ: ตรวจแล้ววนกลับมาระบุอะไหล่ ขั้น 1 จึงยังไม่ติ๊กระหว่างตรวจ
 * - "ข้าม" เหลือเฉพาะขั้นที่อยู่บนทางของใบนี้แต่ไม่ได้ทำจริง (ใบเก่า · ทำในใบเดิม · ปิดก่อนถึง)
 *
 * ลำดับคิดที่นี่ ไม่ได้ใช้ลำดับจากเซิร์ฟเวอร์ตรง ๆ เพราะใบที่ค้างอยู่ตอนเปลี่ยนสายงานเดินคนละลำดับ
 * (คอนเฟิร์มก่อนเบิก · เบิกก่อนนัด) — เซิร์ฟเวอร์บอกว่าใบนี้เดินแบบไหน (flow.variant) แถบเรียงตามนั้น
 * ชื่อขั้นกับคนทำยังมาจากเซิร์ฟเวอร์ (options.stages) ที่นี่ย่อเฉพาะชื่อที่แบบตัวอย่างใช้คำสั้นกว่า
 *
 * ไม่มี React ในไฟล์นี้ — แยกออกจากหน้าใบงาน (7,000 บรรทัด) ให้อ่านกฎได้ที่เดียวและลองกับข้อมูลจริงได้โดยไม่ต้องวาดจอ
 */

/** ขั้นเบิก/โอน — รวมเป็นขั้นเดียว "เบิกอะไหล่" บนแถบ */
export const ISSUE_STAGES = ["PARTS_REQUESTED", "PARTS_TRANSFER", "PARTS_IN_TRANSIT", "PARTS_PICKUP"];
/** รอบตรวจหน้างาน — อยู่เหนือแถบ ไม่ใช่ขั้นหลัก */
export const INSPECT_STAGES = ["INSPECT_CONFIRM", "INSPECT_DISPATCH", "INSPECTING"];
/** สถานะนัดที่นับว่าตกลงกับร้านแล้ว — ตรงกับ APPOINTMENT_DONE ฝั่งเซิร์ฟเวอร์ */
export const APPOINTMENT_DONE = ["CONFIRMED", "ADMIN_PICKED"];

export type StepKey =
  | "NEW"
  | "PARTS_SOURCING"
  | "AWAITING_QUOTE"
  | "AWAITING_PAYMENT"
  | "WAITING_PARTS"
  | "PARTS_CHECKED"
  | "ISSUE"
  | "AWAITING_CONFIRM"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "CLAIM_REVIEW";
/** loop = ขั้น 1 ระหว่างตรวจหน้างาน — ยังไม่ได้ทำ แต่ใบอยู่ในรอบที่จะวนกลับมาที่นี่ */
export type StepState = "done" | "now" | "loop" | "future" | "skipped";
export type SubState = "done" | "now" | "future" | "skipped";
/**
 * target = นัดวัน → เบิก → คอนเฟิร์มลูกค้า (ต.ค. 69 รอบสอง)
 * confirmFirst = คอนเฟิร์มลูกค้าแล้วค่อยเบิก (ใบที่คอนเฟิร์มไปก่อนสลับลำดับ)
 * issueFirst = เบิกก่อนนัด (ใบก่อนนัดลูกค้าก่อนเบิก ต.ค. 69 และใบที่ย้ายมาโดยยังไม่มีวัน)
 */
export type FlowVariant = "target" | "confirmFirst" | "issueFirst";

export interface FlowInfo {
  variant: FlowVariant;
  /** รอบนี้โอนของจริง (สั่งโอน · กำลังโอน) — ขั้นย่อยโอนใต้ "เบิกอะไหล่" */
  transfer: boolean;
  /** รอบนี้หัวหน้าภาคเบิกส่งมอบจากคลังที่ไม่ใช่ 94 (โอนมาก่อนหรือไม่ก็ได้) */
  pickup: boolean;
  quote: boolean;
  inspect: boolean;
  inspectRounds: number;
}

export interface PathLog {
  id: number;
  action: string;
  status: string;
  createdAt: string;
}
export interface PathPart {
  inStock: boolean | null;
  requisitionNo: string | null;
  offCatalog?: boolean;
}
export interface PathOrder {
  status: string;
  needsParts: boolean | null;
  needsQuote: boolean;
  hasQuote: boolean;
  hasReceipt: boolean;
  scheduledAt: string | null;
  appointmentStatus: string | null;
  inspectedAt: string | null;
  parent: { code: string } | null;
  closeResult?: string | null;
  claims: unknown[];
  logs: PathLog[];
  waitingParts: PathPart[];
  /** เซิร์ฟเวอร์รุ่นเก่าไม่ส่งมา — คิดเองจากประวัติด้วยกฎเดียวกัน */
  flow?: Partial<FlowInfo> | null;
}
export interface PathStage {
  value: string;
  label: string;
  action?: string;
  doneLabel?: string;
  actorLabel: string | null;
}

export interface StepSub {
  /** ขั้นของเซิร์ฟเวอร์ — กดดูว่าใครทำ (StepInfo) และเทียบกับขั้นที่ย้อนมา */
  key: string;
  label: string;
  /** ชื่อเต็ม "ใคร · ทำอะไร" สำหรับโปรแกรมอ่านจอ/เทสต์ */
  a11y: string;
  actorLabel: string | null;
  state: SubState;
}
export interface StepRow {
  key: StepKey;
  /** ชื่อที่โชว์ตามสถานะ — ทำแล้ว "…แล้ว" · ยังไม่ทำเป็นการกระทำ */
  label: string;
  /** ชื่อการกระทำ — ใช้ในรายการขั้นที่ข้าม (ขีดฆ่า) */
  action: string;
  /** "ขั้น 4 เบิกอะไหล่ · ทำอยู่" — โปรแกรมอ่านจอแยกขั้นได้โดยไม่ต้องเห็นวง/ติ๊ก และเทสต์อ่านสถานะจากชื่อนี้ */
  a11y: string;
  actorLabel: string | null;
  /** ป้ายเล็กใต้ชื่อ — ขั้น 1 ระหว่างตรวจหน้างาน */
  note?: string;
  state: StepState;
  /** เลขขั้น นับเฉพาะขั้นที่ไม่ข้าม */
  number: number;
  /** ทำไมข้าม (state = skipped) */
  why?: string;
  /** ขั้นของเซิร์ฟเวอร์ที่ขั้นนี้ครอบ — "เบิกอะไหล่" ครอบสี่ขั้น */
  stages: string[];
  /** ขั้นย่อยโอนคลังอื่น (เฉพาะ "เบิกอะไหล่" ของใบที่โอน) */
  sub?: StepSub[];
}
export interface StepPath {
  variant: FlowVariant;
  rows: StepRow[];
  track: { items: StepSub[]; rounds: number } | null;
  /** ขั้นที่ k จาก N · ระหว่างตรวจหน้างาน sub = ย่อยที่ j จาก 3 (ก่อนขั้นที่ 1) */
  current: { no: number; total: number; sub: { no: number; total: number } | null };
}

const KEYS: StepKey[] = [
  "NEW",
  "PARTS_SOURCING",
  "AWAITING_QUOTE",
  "AWAITING_PAYMENT",
  "WAITING_PARTS",
  "PARTS_CHECKED",
  "ISSUE",
  "AWAITING_CONFIRM",
  "ASSIGNED",
  "IN_PROGRESS",
  "CLAIM_REVIEW",
];

/** ประวัติที่บอกว่าเคยผ่านขั้นเช็คอะไหล่ / ขั้นเบิก — ใช้ตัดสินว่าใบนี้เดินทางที่ใช้อะไหล่ */
const SOURCING_LOGS = ["PARTS_SOURCED", "PARTS_BACKORDERED"];
export const ISSUE_LOGS = ["PARTS_CHECKED", "PICKUP_REQUESTED", "TRANSFER_REQUESTED", "TRANSFER_ARRIVED", "PICKED_UP"];
/** หัวหน้าภาคระบุอะไหล่ใหม่ — เริ่มรอบใหม่ทั้งหมด (specRound ฝั่งเซิร์ฟเวอร์) */
const SPEC_LOGS = ["PARTS_REQUESTED", "NO_PARTS"];
/** เริ่มรอบอะไหล่ใหม่ — ตรงกับ PARTS_ROUND_ACTIONS ฝั่งเซิร์ฟเวอร์ */
const PARTS_ROUND_LOGS = [...SPEC_LOGS, "PARTS_SOURCED", "PARTS_BACKORDERED", "PARTS_SHORT"];
/**
 * รอบเบิกล่าสุด — หัวหน้าภาคส่งกลับ (โอน/เบิกคลังอื่นไม่ได้) แล้วแอดมินตอบคลังใหม่ทั้งรอบ
 * การโอน/เบิกของรอบที่ถูกส่งกลับไม่ได้เกิดขึ้นจริง ห้ามนับ (issueRound ฝั่งเซิร์ฟเวอร์ — กฎเดียวกัน)
 */
const ISSUE_ROUND_LOGS = [...PARTS_ROUND_LOGS, "TRANSFER_RETURNED", "PICKUP_RETURNED"];

/**
 * ชื่อสั้นตามแบบที่เจ้าของงานเลือก — ชื่อเต็มของเซิร์ฟเวอร์ ("เช็คอะไหล่ (มี/หมด)" · "เบิกอะไหล่ (คลัง 94)"
 * · "รับทราบ ปล่อยงาน") ยาวเกินช่องบนจอมือถือ · "เบิกอะไหล่" รวมทั้งคลัง 94 และคลังอื่นแล้ว จึงไม่บอกคลัง
 */
const SHORT: Partial<Record<StepKey, [string, string]>> = {
  PARTS_SOURCING: ["เช็คอะไหล่", "เช็คอะไหล่แล้ว"],
  ISSUE: ["เบิกอะไหล่", "เบิกอะไหล่แล้ว"],
  ASSIGNED: ["ปล่อยงาน", "ปล่อยงานแล้ว"],
};
/** สถานะของขั้นเป็นคำ — วงสี/ติ๊กบนแถบอ่านด้วยโปรแกรมอ่านจอไม่ได้ */
const STATE_WORD: Record<StepState, string> = {
  done: "เสร็จแล้ว",
  now: "ทำอยู่",
  loop: "รอผลตรวจหน้างาน",
  future: "ยังไม่ถึง",
  skipped: "ข้าม",
};

/** เผื่อเซิร์ฟเวอร์ไม่ส่งชื่อขั้นมา (โหลดตัวเลือกไม่ทัน) — แถบยังอ่านออก */
const FALLBACK: Record<StepKey, [string, string]> = {
  NEW: ["ระบุอะไหล่", "ระบุอะไหล่แล้ว"],
  PARTS_SOURCING: ["เช็คอะไหล่", "เช็คอะไหล่แล้ว"],
  AWAITING_QUOTE: ["ส่งใบเสนอราคา", "ส่งใบเสนอราคาแล้ว"],
  AWAITING_PAYMENT: ["แนบบิลรับเงิน", "ลูกค้าจ่ายแล้ว"],
  WAITING_PARTS: ["รออะไหล่เข้า", "อะไหล่เข้าแล้ว"],
  PARTS_CHECKED: ["นัดวันเข้า", "นัดวันแล้ว"],
  ISSUE: ["เบิกอะไหล่", "เบิกอะไหล่แล้ว"],
  AWAITING_CONFIRM: ["คอนเฟิร์มลูกค้า", "ลูกค้าคอนเฟิร์มแล้ว"],
  ASSIGNED: ["ปล่อยงาน", "ปล่อยงานแล้ว"],
  IN_PROGRESS: ["เข้างาน/ปิดงาน", "ปิดงานแล้ว"],
  CLAIM_REVIEW: ["ตรวจเคลม", "ตรวจเคลมแล้ว"],
};

/** ใหม่ก่อนเก่า — ประวัติย้อนหลัง (ปิดงานย้อนหลัง) เลขแถวใหม่แต่วันเก่า จึงเรียงด้วยวันก่อน */
const newest = (a: PathLog, b: PathLog) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id;
const after = (l: PathLog, mark: PathLog) => newest(l, mark) < 0;
/** ประวัติหลังรายการล่าสุดที่อยู่ใน actions (ไม่รวมตัวมันเอง) ใหม่ก่อนเก่า — ไม่เคยมี = ทั้งหมด */
function since(logs: PathLog[], actions: string[]): PathLog[] {
  const sorted = [...logs].sort(newest);
  const i = sorted.findIndex((l) => actions.includes(l.action));
  return i < 0 ? sorted : sorted.slice(0, i);
}

/** สถานะของเซิร์ฟเวอร์ → ขั้นบนแถบ · ปิด/ยกเลิกไม่มีขั้นของตัวเอง */
export function stepKeyOf(status: string | null | undefined): StepKey | null {
  if (!status) return null;
  if (ISSUE_STAGES.includes(status)) return "ISSUE";
  if (INSPECT_STAGES.includes(status)) return "NEW";
  return (KEYS as string[]).includes(status) ? (status as StepKey) : null;
}

/** แอดมินนัดร้านให้ไปตรวจหน้างานแล้วอย่างน้อยหนึ่งครั้ง — ใบก่อน ต.ค. 69 รอบสองนัดแล้วไป INSPECTING ตรง */
export function inspectBooked(o: { logs: PathLog[] }) {
  return o.logs.some(
    (l) => (l.action === "CONFIRMED" || l.action === "RESCHEDULED") && (l.status === "INSPECT_DISPATCH" || l.status === "INSPECTING")
  );
}

/** หัวหน้าภาคส่งช่างเข้าตรวจแล้ว — ใบเก่าไม่มีขั้นนี้ (นัดแล้วถึงช่างเลย) */
export function inspectDispatched(o: { logs: PathLog[] }) {
  return o.logs.some((l) => l.action === "DISPATCHED" && l.status === "INSPECTING");
}

/**
 * ใบที่หัวหน้าภาคปิดเอง (SUPERVISOR_CLOSED และ RECOVERED ของใบเก่า) — ขั้นที่ใบรออยู่และขั้นที่ยังไปไม่ถึง
 * ตอนปิดไม่มีใครทำ ต้องขึ้นว่าข้าม ไม่ใช่ติ๊กว่าทำแล้ว · ขั้นตอนปิดอ่านจากประวัติแถวสุดท้ายก่อนปิด
 */
const SUPERVISOR_CLOSES: Record<string, string> = { RECOVERED: "RECOVERED_CLOSED", SUPERVISOR_CLOSED: "SUPERVISOR_CLOSED" };
export function recoveredFrom(o: { closeResult?: string | null; logs: PathLog[] }): string | null {
  const action = o.closeResult ? SUPERVISOR_CLOSES[o.closeResult] : undefined;
  if (!action) return null;
  return statusBefore(o.logs, action);
}

/** ขั้นที่ใบอยู่ก่อนประวัติแถวนี้ (ปิด · ยกเลิก) — ไม่มีแถวก่อนหน้า = ยังไม่ได้เริ่ม */
function statusBefore(logs: PathLog[], action: string): string | null {
  const done = [...logs].sort(newest).find((l) => l.action === action);
  if (!done) return null;
  const prior = logs.filter((l) => l.id < done.id).sort((a, b) => b.id - a.id)[0];
  return prior?.status ?? "NEW";
}

/**
 * ใบนี้เดินลำดับไหน — กฎเดียวกับ flow.variant ฝั่งเซิร์ฟเวอร์ ใช้เมื่อเซิร์ฟเวอร์รุ่นเก่าไม่ส่งมา
 *
 * ดูจากสถานะก่อน (อยู่ขั้นเบิกและคอนเฟิร์มแล้ว = คอนเฟิร์มก่อนเบิก · อยู่ขั้นเบิกแต่ไม่มีวัน = เบิกก่อนนัด)
 * แล้วดูประวัติล่าสุดที่บอกลำดับได้: คอนเฟิร์มแล้วไปเบิก · แอดมินเบิกแล้วไปนัด · เบิกแล้วไปคอนเฟิร์ม · นัดแล้วไปเบิก
 * ล่าสุดชนะ — ใบเก่าที่ถูกย้อนแล้วเดินใหม่ตามสายงานปัจจุบัน รอบล่าสุดคือของจริง
 * คอนเฟิร์มแล้วไปปล่อยงานไม่ใช้ตัดสิน: เกิดได้ทุกลำดับ (เบิกก่อนนัดของใบเก่าก็คอนเฟิร์มแล้วไปปล่อยงาน)
 */
function guessVariant(o: PathOrder): FlowVariant {
  if (ISSUE_STAGES.includes(o.status)) {
    if (APPOINTMENT_DONE.includes(o.appointmentStatus ?? "")) return "confirmFirst";
    if (!o.scheduledAt) return "issueFirst";
  }
  for (const l of [...o.logs].sort(newest)) {
    if ((l.action === "CONFIRMED" || l.action === "RESCHEDULED") && ISSUE_STAGES.includes(l.status)) return "confirmFirst";
    if (l.action === "PARTS_CHECKED") {
      if (l.status === "PARTS_CHECKED") return "issueFirst";
      if (l.status === "AWAITING_CONFIRM") return "target";
    }
    if (l.action === "ASSIGNED" && ISSUE_STAGES.includes(l.status)) return "target";
  }
  return "target";
}

/** เส้นทางของใบนี้ — ค่าจากเซิร์ฟเวอร์ก่อน ขาดตัวไหนคิดเอง */
export function flowOf(o: PathOrder): FlowInfo {
  const has = (...a: string[]) => o.logs.some((l) => a.includes(l.action));
  const f = o.flow ?? {};
  const issueRound = since(o.logs, ISSUE_ROUND_LOGS);
  return {
    variant: f.variant ?? guessVariant(o),
    // โอนจริงเท่านั้น — เบิกคลังอื่นเฉย ๆ (ไม่ต้องโอน) ไม่มีขั้นสั่งโอน/รอของถึง เดิมนับรวมกันแล้วแถบติ๊กขั้นที่ไม่ได้ทำ
    transfer: f.transfer ?? (["PARTS_TRANSFER", "PARTS_IN_TRANSIT"].includes(o.status) || issueRound.some((l) => l.action === "TRANSFER_REQUESTED")),
    // ดูจาก PICKED_UP ไม่ใช่ PICKUP_REQUESTED — ประวัตินั้นเขียนทุกครั้งที่มีของคลังอื่น รวมใบที่โอนเข้าคลัง 94
    pickup: f.pickup ?? (o.status === "PARTS_PICKUP" || issueRound.some((l) => l.action === "PICKED_UP")),
    // ของที่เกิดขึ้นจริงชนะกฎวันนี้ — กฎประกัน 3 ปีทำให้แฟรนไชส์ 245 สาขากลับมาอยู่ในประกัน ใบที่เสนอราคาไปแล้ว
    // (มีใบเสนอราคา/บิลแนบอยู่) ต้องยังเห็นขั้นนั้น ไม่ใช่หายไปตามกฎใหม่
    // ใบแยกที่ลูกค้าจ่ายในใบเดิมแล้ว (PREPAID) ไม่เสนอราคาซ้ำ — กฎเดียวกับ quoteNext ในฟอร์มเช็คอะไหล่
    quote:
      f.quote ??
      (["AWAITING_QUOTE", "AWAITING_PAYMENT"].includes(o.status) ||
        o.hasQuote ||
        o.hasReceipt ||
        has("QUOTED", "QUOTE_SKIPPED", "PAID") ||
        (o.needsQuote && !has("PREPAID"))),
    inspect: f.inspect ?? (INSPECT_STAGES.includes(o.status) || !!o.inspectedAt || has("INSPECT_REQUESTED")),
    inspectRounds: f.inspectRounds ?? o.logs.filter((l) => l.action === "INSPECT_REQUESTED").length,
  };
}

/** ลำดับเต็มของแต่ละแบบ — ขั้นที่ใบไม่ผ่านถูกตัดออกทีหลัง ตำแหน่งในลำดับเต็มใช้เทียบก่อน/หลัง */
function fullOrder(variant: FlowVariant): StepKey[] {
  const mid: StepKey[] =
    variant === "confirmFirst"
      ? ["PARTS_CHECKED", "AWAITING_CONFIRM", "ISSUE"]
      : variant === "issueFirst"
        ? ["ISSUE", "PARTS_CHECKED", "AWAITING_CONFIRM"]
        : ["PARTS_CHECKED", "ISSUE", "AWAITING_CONFIRM"];
  return ["NEW", "PARTS_SOURCING", "AWAITING_QUOTE", "AWAITING_PAYMENT", "WAITING_PARTS", ...mid, "ASSIGNED", "IN_PROGRESS", "CLAIM_REVIEW"];
}

export function buildStepPath(o: PathOrder, stages: PathStage[]): StepPath {
  const flow = flowOf(o);
  const st = (v: string) => stages.find((x) => x.value === v);
  const has = (...a: string[]) => o.logs.some((l) => a.includes(l.action));
  const full = fullOrder(flow.variant);
  const pos = (k: StepKey | null) => (k ? full.indexOf(k) : -1);

  // ระบุอะไหล่ยังไม่ตอบ (null) โชว์ทางที่ใช้อะไหล่ — ใบส่วนใหญ่ใช้ · ตอบว่าไม่ใช้แล้วขั้นเช็ค/เบิกหายไป
  // ประวัติเช็ค/เบิก/รอของนับเฉพาะรอบที่ระบุล่าสุด — ใบที่ย้อนไประบุใหม่ว่าไม่ใช้อะไหล่ ขั้นของรอบก่อนต้องไม่โผล่มาติ๊กว่าทำแล้ว
  const specRound = since(o.logs, SPEC_LOGS);
  const inSpec = (...a: string[]) => specRound.some((l) => a.includes(l.action));
  const parts =
    o.needsParts !== false ||
    ISSUE_STAGES.includes(o.status) ||
    o.status === "PARTS_SOURCING" ||
    inSpec(...SOURCING_LOGS, ...ISSUE_LOGS);
  const waiting = o.status === "WAITING_PARTS" || inSpec("PARTS_ARRIVED");
  const claim = o.status === "CLAIM_REVIEW" || o.claims.length > 0;
  const cur = stepKeyOf(o.status);
  const keys = full.filter((k) => {
    // ขั้นที่ใบอยู่ตอนนี้ต้องอยู่บนแถบเสมอ แม้ธงจากเซิร์ฟเวอร์จะบอกว่าไม่ผ่าน
    if (k === cur) return true;
    if (k === "PARTS_SOURCING" || k === "ISSUE") return parts;
    if (k === "AWAITING_QUOTE" || k === "AWAITING_PAYMENT") return flow.quote;
    if (k === "WAITING_PARTS") return waiting;
    if (k === "CLAIM_REVIEW") return claim;
    return true;
  });

  const inspecting = INSPECT_STAGES.includes(o.status);
  // ปิดแล้ว = ทุกขั้นผ่านหมด · ยกเลิก = ผ่านแค่ขั้นก่อนตอนที่ยกเลิก (ขั้นที่ค้างอยู่ตอนยกเลิกไม่มีใครทำ)
  const cancelledAt = o.status === "CANCELLED" ? stepKeyOf(statusBefore(o.logs, "CANCELLED")) ?? "NEW" : null;
  const ci = o.status === "DONE" ? Infinity : cancelledAt ? pos(cancelledAt) : pos(cur ?? "NEW");
  const recovered = recoveredFrom(o);
  const recoveredAt = recovered ? pos(stepKeyOf(recovered) ?? "NEW") : -1;

  // ใบแยก (ใบรออะไหล่) เริ่มกลางทาง — ขั้นก่อนจุดเริ่มทำในใบเดิม ไม่ใช่ทำในใบนี้ (WO-00528)
  // ขั้นที่ใบนี้เข้าไปจริงภายหลัง (เช่นย้อนกลับไปเช็คอะไหล่) ไม่นับ
  const splitStart = o.parent ? stepKeyOf(o.logs.find((l) => l.action === "SPLIT_FROM")?.status) : null;
  const stagesOf = (k: StepKey) => (k === "ISSUE" ? ISSUE_STAGES : [k]);
  const inParent = (k: StepKey) =>
    !!splitStart &&
    k !== cur &&
    pos(k) < pos(splitStart) &&
    !o.logs.some((l) => l.action !== "SPLIT_FROM" && stagesOf(k).includes(l.status));

  // ของในสโตร์เบิกครบแล้ว — ขั้นเบิกที่อยู่ "หลัง" ขั้นปัจจุบันทำไปแล้วจริง (ย้อนมานัดใหม่หลังเบิก · ช่างส่งกลับ)
  const store = o.waitingParts.filter((p) => !p.offCatalog);
  const issuedAll = o.needsParts === true && store.length > 0 && store.every((p) => p.inStock === true && !!p.requisitionNo);
  const lastQuote = [...o.logs].sort(newest).find((l) => l.action === "QUOTED" || l.action === "QUOTE_SKIPPED");
  const quoteSkipped = lastQuote?.action === "QUOTE_SKIPPED";

  /** ขั้นบนทางของใบนี้ที่ผ่านมาแล้วแต่ไม่ได้ทำ — ไม่มีเหตุผล = ไม่ได้ข้าม */
  const skipWhy = (k: StepKey): string | undefined => {
    if (recovered && pos(k) >= recoveredAt) return "ปิดใบงานก่อนถึงขั้นนี้";
    if (inParent(k)) return `ทำในใบเดิม ${o.parent?.code ?? ""}`.trim();
    if (pos(k) >= ci) return undefined;
    // ใบที่เช็คพร้อมเบิกในสายงานเดิม (ก่อนแยกเช็คกับเบิก ต.ค. 69) ไม่มีประวัติเช็ค
    if (k === "PARTS_SOURCING" && !has(...SOURCING_LOGS)) return "ใบเก่า — เช็คพร้อมเบิกในสายงานเดิม";
    // ใบเก่าบางใบนัดแล้วไปเลยโดยไม่ได้ผ่านขั้นคอนเฟิร์ม
    if (k === "AWAITING_CONFIRM" && !has("CONFIRMED", "RESCHEDULED")) return "ใบเก่า — นัดแล้วไปเลยไม่ผ่านคอนเฟิร์ม";
    if (k === "AWAITING_QUOTE" && quoteSkipped) return "แอดมินกดข้าม — ไม่ต้องเสนอราคา";
    if (k === "AWAITING_PAYMENT" && quoteSkipped && !has("PAID")) return "แอดมินกดข้าม — ไม่ต้องเสนอราคา";
    return undefined;
  };

  const stateOf = (k: StepKey, why: string | undefined): StepState => {
    if (why) return "skipped";
    const p = pos(k);
    if (o.status === "DONE") return "done";
    // ใบที่ค้างระหว่างเบิกโดยยังไม่มีวัน — ขั้นนัด/คอนเฟิร์มยังไม่ได้ทำ แม้ลำดับจะอยู่ก่อน
    // ใบที่ยกเลิกตอนค้างแบบนั้นด้วย: เซิร์ฟเวอร์ดูลำดับจากสถานะ พอยกเลิกแล้วเลยให้ลำดับปกติ (นัดก่อนเบิก)
    if (p < ci && (k === "PARTS_CHECKED" || k === "AWAITING_CONFIRM") && (cur ?? cancelledAt) === "ISSUE" && !o.scheduledAt) return "future";
    if (cancelledAt) return p < ci ? "done" : "future";
    if (p < ci) return "done";
    if (p === ci) return inspecting ? "loop" : "now";
    return k === "ISSUE" && issuedAll && has(...ISSUE_LOGS) ? "done" : "future";
  };

  const issueStage = ISSUE_STAGES.includes(o.status) ? o.status : "PARTS_REQUESTED";
  let n = 0;
  const rows: StepRow[] = keys.map((k) => {
    const why = skipWhy(k);
    const state = stateOf(k, why);
    const server = st(k === "ISSUE" ? issueStage : k);
    const action = SHORT[k]?.[0] ?? server?.action ?? server?.label ?? FALLBACK[k][0];
    const done = SHORT[k]?.[1] ?? server?.doneLabel ?? FALLBACK[k][1];
    let label = state === "done" ? done : action;
    // ตอบว่าไม่ใช้อะไหล่ — ขั้น 1 บอกคำตอบเลย ไม่ใช่ "ระบุอะไหล่แล้ว" ทั้งที่ไม่มีอะไหล่ (ตามแบบที่เลือก)
    if (k === "NEW" && state === "done" && o.needsParts === false) label = "ระบุ: ไม่ใช้อะไหล่";
    let actorLabel = server?.actorLabel ?? null;
    const sub = k === "ISSUE" && flow.transfer ? transferSubs(o, state, st) : undefined;
    if (k === "ISSUE") {
      // คนเบิกเปลี่ยนตามขั้นย่อย — คลัง 94 แอดมิน · คลังอื่นหัวหน้าภาค
      // เบิกคลังอื่นโดยไม่โอน (ไม่มีขั้นย่อย) บอกที่ชื่อคนทำแทน — ไม่งั้นดูเหมือนแอดมินเบิกคลัง 94 ตามปกติ
      const pickupOnly = `${st("PARTS_PICKUP")?.actorLabel ?? "หัวหน้าภาค"} · เบิกคลังอื่น`;
      actorLabel =
        state !== "now"
          ? flow.pickup && !sub
            ? pickupOnly
            : st("PARTS_REQUESTED")?.actorLabel ?? "แอดมิน"
          : o.status === "PARTS_PICKUP" && !sub
            ? pickupOnly
            : st(o.status)?.actorLabel ?? null;
    }
    if (state !== "skipped") n += 1;
    const number = state === "skipped" ? 0 : n;
    return {
      key: k,
      label,
      action,
      a11y: state === "skipped" ? `${action} · ${STATE_WORD.skipped}` : `ขั้น ${number} ${action} · ${STATE_WORD[state]}`,
      actorLabel,
      note: state === "loop" ? "รอผลตรวจหน้างาน" : undefined,
      state,
      number,
      why,
      stages: stagesOf(k),
      sub,
    };
  });

  const track = flow.inspect ? { items: inspectItems(o, st), rounds: Math.max(1, flow.inspectRounds) } : null;
  const live = rows.filter((r) => r.state !== "skipped");
  const at = rows.find((r) => r.state === "now" || r.state === "loop");
  const trackAt = track && inspecting ? track.items.findIndex((t) => t.state === "now") : -1;
  return {
    variant: flow.variant,
    rows,
    track,
    current: {
      no: at?.number ?? 0,
      total: live.length,
      sub: trackAt >= 0 && track ? { no: trackAt + 1, total: track.items.length } : null,
    },
  };
}

/**
 * ขั้นย่อยของใบที่โอนจากคลังอื่น — เบิก+สั่งโอน → รอของถึง → เบิกส่งมอบ
 *
 * นับเฉพาะรอบเบิกล่าสุด: หัวหน้าภาคส่งกลับแอดมิน (เบิก/โอนไม่ได้) แล้วแอดมินส่งมาใหม่ = เริ่มนับใหม่
 * โชว์ตลอดแม้โอนเสร็จแล้ว ประวัติว่าของมาจากไหนยังเห็นอยู่ · ส่งมอบที่คลัง 94 แอดมินเบิก ที่คลังอื่นหัวหน้าภาคเบิก
 * ติ๊กเฉพาะขั้นที่มีประวัติจริงในรอบนั้น — เดิมขั้นเบิกเสร็จแล้วติ๊กครบสามขั้นเลย ใบที่เบิกคลังอื่นเฉย ๆ
 * (ไม่ได้โอน) ขึ้นว่าสั่งโอนแล้ว กดดูก็ไม่เจอประวัติ · ไม่มีการโอนในรอบนี้ = ไม่มีขั้นย่อย (undefined)
 */
function transferSubs(o: PathOrder, row: StepState, st: (v: string) => PathStage | undefined): StepSub[] | undefined {
  const round = since(o.logs, ISSUE_ROUND_LOGS);
  const moving = o.status === "PARTS_TRANSFER" || o.status === "PARTS_IN_TRANSIT";
  const requested = round.some((l) => l.action === "TRANSFER_REQUESTED");
  if (!moving && !requested) return undefined;
  const arrivedLog = round.find((l) => l.action === "TRANSFER_ARRIVED");
  // ส่งมอบ = แอดมินเบิกคลัง 94 (PARTS_CHECKED) หรือหัวหน้าภาคเบิกคลังอื่น (PICKED_UP) หลังของถึง
  const handed = !!arrivedLog && round.some((l) => (l.action === "PARTS_CHECKED" || l.action === "PICKED_UP") && after(l, arrivedLog));
  // ส่งมอบที่ใคร — ประวัติ "โอนเสร็จ" บอกว่าใบไปไหนต่อ: ถึงคลัง 94 กลับไปแอดมินเบิก · คลังอื่นหัวหน้าภาคเบิกเอง
  const hand = arrivedLog?.status === "PARTS_REQUESTED" ? "PARTS_REQUESTED" : "PARTS_PICKUP";
  const did = (b: boolean): SubState => (b ? "done" : "skipped");
  let s: [SubState, SubState, SubState];
  if (row === "done") s = [did(requested), did(!!arrivedLog), did(handed)];
  else if (row !== "now") s = ["future", "future", "future"];
  else if (o.status === "PARTS_TRANSFER") s = ["now", "future", "future"];
  else if (o.status === "PARTS_IN_TRANSIT") s = ["done", "now", "future"];
  // ของถึงแล้ว รอเบิกส่งมอบ (แอดมินที่คลัง 94 · หัวหน้าภาคที่คลังอื่น)
  else s = [did(requested), did(!!arrivedLog), "now"];
  const actor = (v: string) => st(v)?.actorLabel ?? null;
  return [
    { key: "PARTS_TRANSFER", label: "เบิก + สั่งโอน", a11y: st("PARTS_TRANSFER")?.label ?? "เบิกและโอนอะไหล่", actorLabel: actor("PARTS_TRANSFER"), state: s[0] },
    { key: "PARTS_IN_TRANSIT", label: "รอของถึง", a11y: st("PARTS_IN_TRANSIT")?.label ?? "รอโอนอะไหล่", actorLabel: actor("PARTS_IN_TRANSIT"), state: s[1] },
    {
      key: hand,
      label: "เบิกส่งมอบ",
      a11y: st(hand)?.label ?? "เบิกส่งมอบ",
      actorLabel: hand === "PARTS_REQUESTED" ? `${actor("PARTS_REQUESTED") ?? "แอดมิน"} (คลัง 94)` : actor("PARTS_PICKUP"),
      state: s[2],
    },
  ];
}

/**
 * รอบตรวจหน้างาน — นัดร้าน → ส่งช่างตรวจ → ตรวจหน้างาน แล้ววนกลับไประบุอะไหล่
 * ใบเก่าบางใบไม่ได้ผ่านนัดร้าน/ส่งช่าง (นัดแล้วถึงช่างเลย) ขึ้นว่าข้าม ไม่ใช่ติ๊กว่าทำแล้ว
 */
function inspectItems(o: PathOrder, st: (v: string) => PathStage | undefined): StepSub[] {
  const booked = inspectBooked(o);
  const sent = inspectDispatched(o);
  const ok = (b: boolean): SubState => (b ? "done" : "skipped");
  const s: [SubState, SubState, SubState] =
    o.status === "INSPECT_CONFIRM"
      ? ["now", "future", "future"]
      : o.status === "INSPECT_DISPATCH"
        ? ["done", "now", "future"]
        : o.status === "INSPECTING"
          ? [ok(booked), ok(sent), "now"]
          : [ok(booked), ok(sent), ok(!!o.inspectedAt)];
  // ชื่อสั้นตามแบบที่ตกลง ("นัดร้าน" ไม่ใช่ "นัดร้าน (ตรวจหน้างาน)") — อยู่ในกรอบ "↻ ตรวจหน้างาน" อยู่แล้ว
  const item = (v: string, action: string, done: string, i: number): StepSub => {
    const server = st(v);
    return {
      key: v,
      label: s[i] === "done" ? server?.doneLabel ?? done : action,
      a11y: server?.label ?? action,
      actorLabel: server?.actorLabel ?? null,
      state: s[i],
    };
  };
  return [
    item("INSPECT_CONFIRM", "นัดร้าน", "นัดร้านแล้ว", 0),
    item("INSPECT_DISPATCH", "ส่งช่างตรวจ", "ส่งช่างตรวจแล้ว", 1),
    item("INSPECTING", "ตรวจหน้างาน", "ตรวจแล้ว", 2),
  ];
}
