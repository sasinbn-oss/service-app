/**
 * ช่องที่ Admin Spare Part ชี้ให้แก้ตอนตีกลับเคลม (เคลมก้อน 4 · ตัวอย่างที่เจ้าของงานเลือก PF / MF / QUICK)
 *
 * ทำไมต้องชี้เป็นช่อง ไม่ใช่พิมพ์เหตุผลอย่างเดียว: เหตุผลแบบข้อความทำให้ช่างต้องเดาว่าแก้ตรงไหน
 * หลายใบช่างกลับไปถ่ายที่ร้านใหม่ทั้งชุดทั้งที่แค่พิมพ์รหัสผิด หรือกลับกัน คิดว่าแก้จากมือถือได้แต่จริง ๆ ต้องถ่ายวิดีโอใหม่
 * ช่องไฟล์ = ต้องกลับไปถ่ายที่หน้าเครื่อง · ช่องข้อความ = แก้จากมือถือได้ — ช่างรู้ตั้งแต่เห็นการ์ดว่าต้องออกไปร้านไหม
 *
 * กุญแจ (key) ชุดเดียวกับ CLAIM_REVIEW_FLAGS ฝั่งเซิร์ฟเวอร์ — คำบนจอเก็บไว้ที่แอปเพราะชื่อวิดีโอเปลี่ยนตามเครื่อง
 * (Oasis / "ไม่มี Error ขึ้น" = วิดีโออาการตอนเครื่องเดิน · เจ้าของงานเลือกข้อ 4) ซึ่งเซิร์ฟเวอร์ไม่รู้ว่ากำลังวาดให้เครื่องไหน
 * ช่องของเครื่อง (รุ่น · Serial · Error · วิดีโอ Error · รูปอาการ) ใช้ร่วมทุกชิ้น ติ๊กแล้วตีกลับทั้งใบ
 */
import type { PartClaim } from "./claimEvidence";

export interface FlagDef {
  key: string;
  label: string;
  /** ช่องไฟล์ — ช่างต้องกลับไปถ่ายใหม่ที่หน้าเครื่อง (ป้าย "ต้องแนบใหม่") */
  file: boolean;
  /** ช่องของเครื่อง — ใช้ร่วมทุกชิ้น ติ๊กแล้วทุกชิ้นที่ไม่ได้ปิดเคลมถูกตีกลับด้วย */
  machine: boolean;
}

/** ช่องของชิ้น — ลำดับตามที่ช่างกรอกในฟอร์ม (ตัวอย่าง PF) */
export const PART_FLAGS: FlagDef[] = [
  { key: "CLAIM_PART", label: "รูปอะไหล่เก่า", file: true, machine: false },
  { key: "BROKEN_CODE", label: "รหัสอะไหล่ตัวที่เสีย", file: false, machine: false },
  { key: "SYMPTOM", label: "อาการ/สาเหตุ", file: false, machine: false },
  { key: "CHECKS", label: "ช่างเข้าเช็คอะไรบ้าง", file: false, machine: false },
  { key: "CLAIM_CHECK_VIDEO", label: "วิดีโอการตรวจเช็ค", file: true, machine: false },
];

/** ช่องของเครื่องทั้งหมด (ตัวอย่าง MF + "ข้อมูลป้ายรุ่น" ของ Oasis ที่ไม่มี Serial บนป้าย) */
const MACHINE_ALL: FlagDef[] = [
  { key: "MODEL", label: "รุ่น", file: false, machine: true },
  { key: "SERIAL", label: "Serial", file: false, machine: true },
  { key: "PLATE_OTHER", label: "ข้อมูลป้ายรุ่น", file: false, machine: true },
  { key: "ERROR_CODE", label: "Error ที่เครื่องขึ้น", file: false, machine: true },
  { key: "CLAIM_ERROR_VIDEO", label: "วิดีโอ Error", file: true, machine: true },
  { key: "CLAIM_SYMPTOM", label: "รูปอาการ", file: true, machine: true },
];

const ALL = [...PART_FLAGS, ...MACHINE_ALL];
const ORDER = new Map(ALL.map((f, i) => [f.key, i] as const));

export const isMachineFlag = (key: string) => MACHINE_ALL.some((f) => f.key === key);
export const flagIsFile = (key: string) => ALL.find((f) => f.key === key)?.file ?? false;

/** ป้ายของเครื่องนี้ — ป้าย Oasis ไม่มี Serial (เจ้าของงานรับค่าตั้งต้น "ข้อมูลป้ายรุ่น") · ไม่มีชื่อวิดีโอ Error ให้ถ่าย */
export interface FlagCtx {
  family?: string | null;
  errorCode?: string | null;
}

export function flagLabel(key: string, ctx: FlagCtx = {}): string {
  if (key === "CLAIM_ERROR_VIDEO" && (ctx.family === "OASIS" || ctx.errorCode === "อื่น ๆ")) return "วิดีโออาการตอนเครื่องเดิน";
  return ALL.find((f) => f.key === key)?.label ?? key;
}

/**
 * ช่องของเครื่องที่ผู้ตรวจติ๊กได้สำหรับเครื่องนี้
 * Oasis: รุ่น · ข้อมูลป้ายรุ่น · วิดีโออาการตอนเครื่องเดิน · รูปอาการ (ไม่มี Serial บนป้าย และไม่มีจอ Error)
 * อื่น ๆ: รุ่น · Serial · Error (เฉพาะยี่ห้อที่มีคู่มือ Error in Field) · วิดีโอ Error · รูปอาการ
 */
export function machineFlagsFor(ctx: FlagCtx & { hasErrors: boolean }): FlagDef[] {
  const oasis = ctx.family === "OASIS";
  return MACHINE_ALL.filter((f) => {
    if (f.key === "SERIAL") return !oasis;
    if (f.key === "PLATE_OTHER") return oasis;
    if (f.key === "ERROR_CODE") return !oasis && ctx.hasErrors;
    return true;
  }).map((f) => ({ ...f, label: flagLabel(f.key, ctx) }));
}

/** ช่องที่ติ๊กได้กับใบนี้ตามที่เซิร์ฟเวอร์คิด (รายละเอียดใบงาน claimReviewFlags · ชื่อตามเครื่องและ Error ล่าสุด) */
export interface ServerFlag {
  key: string;
  scope: "PART" | "MACHINE";
  label: string;
  site: boolean;
}

/**
 * ช่องของชิ้น + ช่องของเครื่องที่แผงตีกลับแสดง — ใช้รายการของเซิร์ฟเวอร์ก่อน (ที่เดียวกับที่ตรวจตอนรับคำตัดสิน
 * ชื่อบนจอจึงตรงกับข้อความที่ช่างได้ และไม่มีช่องที่เครื่องนี้ไม่มีให้ติ๊กแล้วโดนปฏิเสธ)
 * เซิร์ฟเวอร์รุ่นก่อนไม่ส่ง: คิดเองจากแบบป้ายแบบเดียวกัน
 */
export function flagDefsOf(
  server: ServerFlag[] | null | undefined,
  fallback: FlagCtx & { hasErrors: boolean }
): { part: FlagDef[]; machine: FlagDef[] } {
  if (Array.isArray(server) && server.length) {
    const defs = server.map((f) => ({ key: f.key, label: f.label, file: !!f.site, machine: f.scope === "MACHINE" }));
    return { part: defs.filter((f) => !f.machine), machine: defs.filter((f) => f.machine) };
  }
  return { part: PART_FLAGS, machine: machineFlagsFor(fallback) };
}

export function sortFlags(keys: string[]): string[] {
  return [...new Set(keys)].sort((a, b) => (ORDER.get(a) ?? 99) - (ORDER.get(b) ?? 99));
}

/** ช่องของชิ้นที่ผู้ตรวจติ๊กให้แถวนี้ (ไม่รวมของเครื่อง) */
export function partFlagsOf(row: Pick<PartClaim, "reviewFlags">): string[] {
  return sortFlags((row.reviewFlags ?? []).filter((k) => !isMachineFlag(k)));
}

/** ช่องของเครื่องที่ถูกชี้ในชุดแถวนี้ (รวมทุกแถว — ตีกลับทั้งใบติดทุกแถวที่ถูกตีกลับ) */
export function machineFlagsOf(rows: Pick<PartClaim, "reviewFlags">[]): string[] {
  return sortFlags(rows.flatMap((r) => (r.reviewFlags ?? []).filter(isMachineFlag)));
}

/** ต้องกลับไปถ่ายที่หน้าเครื่องไหม — มีช่องไฟล์สักช่อง */
export const needsSiteVisit = (keys: string[]) => keys.some(flagIsFile);

/** บรรทัดบนการ์ด/ฟอร์ม — คำเดียวกับตัวอย่าง (ช่างจะเห็นว่า: …) */
export const SITE_TEXT = "ต้องกลับไปถ่ายที่หน้าเครื่อง";
export const PHONE_TEXT = "แก้จากมือถือได้ ไม่ต้องไปร้าน";

/**
 * เหตุผลด่วน 5 ข้อ (Choices.txt) — กดแล้วติ๊กช่องที่เกี่ยวให้ด้วย และใส่ข้อความเป็นเหตุผล
 * สองข้อของเครื่องติ๊กแล้วตีกลับทั้งใบ จึงมีป้าย " · ทั้งใบ" และซ่อนตอนข้อมูลเครื่องล็อกไว้แล้ว (กดไปก็ติ๊กไม่ได้)
 */
export const QUICK_REASONS: { text: string; flag: string }[] = [
  { text: "รูปอะไหล่เก่าไม่เห็นสติกเกอร์รหัส", flag: "CLAIM_PART" },
  { text: "วิดีโอไม่เห็นรหัส Error บนจอ", flag: "CLAIM_ERROR_VIDEO" },
  { text: "รหัสตัวเสียไม่ตรงกับรูป", flag: "BROKEN_CODE" },
  { text: "ภาพมืด/เบลอ", flag: "CLAIM_PART" },
  { text: "ป้ายรุ่นไม่ตรงกับรูป", flag: "MODEL" },
];

/**
 * เหตุผลที่เซิร์ฟเวอร์เขียนแทนเมื่อผู้ตรวจติ๊กช่องแต่ไม่พิมพ์ (flagReasonText ใน backend/src/utils/claimRules.ts — รูปแบบเดียวกันทุกตัว)
 * rejectReason ไม่เคยว่าง เพราะประวัติเคลม/Excel/แอปเก่าอ่านแค่ช่องนี้ — แต่บนจอที่รู้จักช่องแล้ว ข้อความนี้ซ้ำกับรายการช่อง
 * จึงต้องแยกให้ออกว่าข้อความไหนผู้ตรวจพิมพ์เอง (ขึ้นตามนั้น) ข้อความไหนระบบเขียนแทน (ขึ้นเป็นชื่อช่องแบบตัวอย่าง rejLines)
 */
export function flagReasonText(ownLabels: string[], machineLabels: string[]): string {
  return [
    ownLabels.length ? `${ownLabels.join(" · ")} ต้องแก้` : null,
    machineLabels.length ? `ทั้งใบ (ข้อมูลเครื่อง) — ${machineLabels.join(" · ")} ต้องแก้` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * ชื่อวิดีโอ Error มีสองแบบ (วิดีโอ Error / วิดีโออาการตอนเครื่องเดิน) และเซิร์ฟเวอร์เลือกตาม Error ของแถวตอนตรวจ
 * ซึ่งอาจไม่ตรงกับ Error ที่แอปเห็นตอนนี้ — เทียบโดยไม่สนว่าเป็นชื่อแบบไหน ไม่งั้นข้อความที่ระบบเขียนแทนหลุดมาเป็นเหตุผลซ้ำ
 */
const sameText = (a: string, b: string) => {
  const n = (s: string) => s.replace(/วิดีโออาการตอนเครื่องเดิน/g, "วิดีโอ Error").replace(/\s+/g, " ").trim();
  return n(a) === n(b);
};

/** เหตุผลที่ผู้ตรวจพิมพ์/เลือกเอง — ข้อความที่ระบบเขียนแทน (ชื่อช่องต่อกัน) ได้ null */
export function typedReasonOf(row: Pick<PartClaim, "rejectReason" | "reviewFlags">, ctx: FlagCtx = {}): string | null {
  const reason = (row.rejectReason ?? "").trim();
  if (!reason) return null;
  const flags = row.reviewFlags ?? [];
  if (!flags.length) return reason;
  const own = partFlagsOf(row).map((k) => flagLabel(k, ctx));
  const machine = sortFlags(flags.filter(isMachineFlag)).map((k) => flagLabel(k, ctx));
  return sameText(reason, flagReasonText(own, machine)) ? null : reason;
}

/**
 * บรรทัดเหตุผลที่ช่างเห็น (แถบในฟอร์มแก้เคลม · หน้าใบงาน) — ตัวอย่าง rejLines
 * ตีกลับทั้งใบ: "ทั้งใบ (ข้อมูลเครื่อง)" + "{ช่อง} ต้องแก้" ขึ้นก่อน · แต่ละชิ้น: เหตุผลที่ผู้ตรวจพิมพ์/เลือก
 * หรือ (ไม่ได้พิมพ์) ชื่อช่องของชิ้นนั้น + "ต้องแก้" · ชิ้นที่ถูกตีกลับเพราะทั้งใบอย่างเดียวไม่ขึ้นซ้ำ
 * — ขึ้นซ้ำทีละชิ้นแล้วช่างจะคิดว่าแต่ละชิ้นมีเรื่องของตัวเองต้องแก้อีก
 * แถวที่ไม่มีช่อง (ตีกลับก่อนมีการชี้ช่อง) ขึ้นเหตุผลตามเดิม
 */
/** ชื่อบรรทัดของการตีกลับทั้งใบ (ข้อมูลเครื่อง) ในรายการเหตุผล — ใช้ตัดสินว่าบรรทัดเดียวต้องขึ้นหัวไหม */
export const WHOLE_ORDER_PART = "ทั้งใบ (ข้อมูลเครื่อง)";

export function rejectLinesOf(
  rows: PartClaim[],
  nameOf: (r: PartClaim) => string,
  ctx: FlagCtx = {}
): { part: string; reason: string }[] {
  const machine = machineFlagsOf(rows);
  const c = { family: ctx.family ?? rows[0]?.nameplate?.family ?? null, errorCode: ctx.errorCode ?? rows[0]?.fieldCheck?.errorCode ?? null };
  const lines: { part: string; reason: string }[] = [];
  if (machine.length) lines.push({ part: WHOLE_ORDER_PART, reason: `${machine.map((k) => flagLabel(k, c)).join(" · ")} ต้องแก้` });
  for (const r of rows) {
    const own = partFlagsOf(r);
    const text = typedReasonOf(r, c) ?? (own.length ? `${own.map((k) => flagLabel(k, c)).join(" · ")} ต้องแก้` : null);
    if (text) lines.push({ part: nameOf(r), reason: text });
    else if (!machine.length) lines.push({ part: nameOf(r), reason: (r.rejectReason ?? "").trim() || "—" });
  }
  return lines;
}

/**
 * บรรทัดเหตุผลบนการ์ดงานของฉัน (my-day claim.reasons / claim.whole) — กติกาเดียวกับ rejectLinesOf
 * เซิร์ฟเวอร์ส่งชื่อช่องมาแล้ว (fieldLabels = ช่องของชิ้นที่ผู้ตรวจติ๊กเอง · whole = ช่องของเครื่อง) การ์ดไม่ต้องรู้จักคีย์
 */
export function cardReasonLines(
  reasons: { partLabel: string; reason: string; fieldLabels?: string[] }[],
  whole: string[] | null
): { part: string; reason: string }[] {
  const lines: { part: string; reason: string }[] = [];
  if (whole) lines.push({ part: WHOLE_ORDER_PART, reason: `${whole.length ? `${whole.join(" · ")} ` : ""}ต้องแก้` });
  for (const r of reasons) {
    const own = r.fieldLabels ?? [];
    const reason = (r.reason ?? "").trim();
    const generated = (own.length || whole) && sameText(reason, flagReasonText(own, whole ?? []));
    const text = (reason && !generated ? reason : null) ?? (own.length ? `${own.join(" · ")} ต้องแก้` : null);
    if (text) lines.push({ part: r.partLabel, reason: text });
    else if (!whole) lines.push({ part: r.partLabel, reason: reason || "—" });
  }
  return lines;
}

/**
 * ช่องของเครื่องจากงานของฉัน (my-day claim.whole) — เซิร์ฟเวอร์ส่งเป็นรายชื่อช่อง
 * รุ่นที่ส่งแค่ true/ข้อความเดียวก็อ่านได้ ไม่ให้การ์ดพัง · ไม่ใช่ทั้งใบ = null
 */
export function wholeLabels(whole: unknown): string[] | null {
  if (Array.isArray(whole)) {
    const list = whole.filter((x): x is string => typeof x === "string" && !!x.trim());
    return list.length ? list : null;
  }
  if (typeof whole === "string" && whole.trim()) return [whole.trim()];
  if (whole === true) return [];
  return null;
}
