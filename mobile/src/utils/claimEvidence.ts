/**
 * อ่านใบเคลมของใบงานหนึ่งใบสำหรับหน้าจอ — หน้าตรวจเคลมของ Admin Spare Part และการ์ดเคลมที่คนอื่นเห็นใช้ชุดเดียวกัน
 *
 * "ไฟล์ไหนคือหลักฐานของใบเคลมแถวนี้" ตัดสินที่เซิร์ฟเวอร์ที่เดียว (claimEvidenceFor → evidenceIds) แอปแค่หยิบตาม id
 * เดิมแอปกรองเองด้วยเวลา ซึ่งไม่รู้จักรอบ (จ่ายงานใหม่/เปิดใบใหม่) และไม่รู้ว่าไฟล์ที่แนบซ้ำแทนไฟล์เดิม —
 * ผู้ตรวจเห็นไฟล์ไม่ตรงกับที่ PDF และไฟล์ส่งผู้ขายลงไว้ ถ้าคิดสองที่วันหนึ่งจะตอบไม่ตรงกัน
 * ที่เหลือในไฟล์นี้คือเรื่องการแสดงผลล้วน ๆ (รอบ · อะไรใหม่ · อะไรเปลี่ยนจากรอบก่อน) ไม่มีกติกาที่ต้องตรงกับเซิร์ฟเวอร์
 */
import type { ClaimGuide } from "./nameplate";
import { dayTime, type TrailEvent } from "../components/claims/ClaimTrail";

/** ค่าหนึ่งช่องของป้ายรุ่นที่เก็บในใบเคลม — confirmed/read/edited มากับใบที่ส่งจากฟอร์มยืนยันทีละช่อง (ใบเก่าไม่มี) */
export interface ClaimPlateField {
  key: string;
  label: string;
  value: string;
  source: "SCAN" | "HAND";
  crop?: string | null;
  confirmed?: boolean;
  needsCheck?: boolean;
  edited?: boolean;
  /** ค่าที่ระบบอ่านได้ก่อนช่างสลับ/แก้ — นับว่าช่างแก้จากที่ระบบอ่านกี่ตัว */
  read?: string;
}

export interface PartClaim {
  id: number;
  sparePartId: number;
  partCode: string;
  partName: string;
  /** รหัสตัวที่เสียที่ส่งเคลม (ช่างกรอก) — ว่างเฉพาะใบเก่า */
  brokenPartCode: string | null;
  quantity: number;
  brand: string | null;
  model: string | null;
  machineCode: string | null;
  symptom: string;
  checkNote: string;
  troubleshooting: string[];
  /** ข้อมูลป้ายรุ่นที่สแกน/พิมพ์ — ใบเก่าก่อน ต.ค. 69 ว่าง */
  nameplate?: {
    family: string;
    /** ไฟล์ป้ายรุ่น (รูปเต็ม) ของรอบที่ส่งเคลมนี้ */
    photoId?: number | null;
    verified?: boolean;
    fields: ClaimPlateField[];
  } | null;
  /** เช็คตามคู่มือ Error in Field — ยี่ห้อที่ไม่มีคู่มือว่าง */
  fieldCheck?: {
    errorCode: string;
    errorName: string;
    checked: string[];
    /** ข้อเช็คที่ฟอร์มให้ช่างเห็นตอนส่ง (เคลมก้อน 2) — ข้อที่ไม่ได้ติ๊กขึ้นเป็น ✗ ให้ผู้ตรวจเห็น · ใบเก่าไม่มี ใช้รายการปัจจุบันแทน */
    offered?: string[];
    /** เช็คลิสต์การติดตั้งฐานเครื่อง — มีเฉพาะใบเคลมก่อน ต.ค. 69 ที่ยังถามอยู่ */
    install?: { key: string; label: string; note: string; answer: boolean }[];
  } | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  /** คนที่ตัดสิน (Admin Spare Part) — แถบเหตุผลที่ถูกตีกลับในฟอร์มปิดงานบอกว่าใครตีกลับ · เซิร์ฟเวอร์รุ่นเก่าไม่ส่ง */
  reviewedByName?: string | null;
  /** ชื่ออะไหล่ที่ใช้เรียกในข้อความ (ชื่อไทย · ต่อรหัสเมื่อชื่อซ้ำในใบเดียวกัน) — เซิร์ฟเวอร์คิดให้ (claimRules.partLabel) */
  partLabel?: string;
  // ── เคลมก้อน 2 (หน้าตรวจเคลมหน้าเดียว) — เซิร์ฟเวอร์รุ่นก่อนไม่ส่ง แอปคิดแทนแบบหยาบ ๆ ──
  /** ช่างที่กดส่งแถวนี้ */
  createdByName?: string | null;
  /** รหัสพนักงานของช่างที่ส่ง — มีเมื่อเซิร์ฟเวอร์ส่งมา (หัวหน้าตรวจขึ้น "ช่าง {ชื่อ} ({รหัส})") */
  createdByCode?: string | null;
  /** ส่งชิ้นนี้รอบที่เท่าไหร่ในการซ่อมครั้งนี้ */
  round?: number;
  /** วันที่ส่งชิ้นนี้ครั้งแรก (ต้นห่วงโซ่ ตีกลับ → ส่งใหม่) = วันที่เปลี่ยนอะไหล่จริง */
  firstSubmittedAt?: string;
  /** id ไฟล์หลักฐานของแถวนี้ — เซิร์ฟเวอร์คิดด้วย claimEvidenceFor (ชิ้นเดียวกัน/ของเครื่อง · ในรอบ · ก่อนกดส่ง · ไฟล์ล่าสุดต่อชนิด) */
  evidenceIds?: number[];
}

/** ใบเคลมเก่าของเครื่องเดียวกัน (สาขา + รหัสเครื่อง) — เซิร์ฟเวอร์ส่งเฉพาะแอดมิน (ผู้ตรวจ) */
export interface ClaimRepeat {
  workOrderId: number;
  code: string;
  partCode: string;
  partName: string;
  status: string;
  createdAt: string;
}

/** ประวัติใบงานเท่าที่ใช้ */
export interface ClaimLog {
  action: string;
  note: string | null;
  byName: string | null;
  createdAt: string;
}

/** ไฟล์แนบเท่าที่ใช้ — Attachment ของใบงานเข้ากับรูปนี้ */
export interface EvidenceFile {
  id: number;
  role: string | null;
  sparePartId?: number | null;
  createdAt: string;
}

const t = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

/** แถว a ใหม่กว่า b — แถวของการส่งครั้งเดียวกันเวลาเท่ากัน ใช้ id ตัดสิน (กติกาเดียวกับเซิร์ฟเวอร์) */
function newer(a: { createdAt: string; id: number }, b: { createdAt: string; id: number }) {
  const d = t(a.createdAt) - t(b.createdAt);
  return d !== 0 ? d > 0 : a.id > b.id;
}

/** อะไหล่ชิ้นเดียวกันในใบงานนี้ — อะไหล่ที่ถูกลบออกจากทะเบียนใช้รหัสแทน (เหมือน claimKey ฝั่งเซิร์ฟเวอร์) */
export function claimKeyOf(r: { sparePartId: number | null; partCode: string }) {
  return r.sparePartId != null ? `id:${r.sparePartId}` : `code:${r.partCode}`;
}

/** ชื่อชิ้นที่ใช้เรียก — ชื่อไทยตามที่เซิร์ฟเวอร์คิดให้ · เซิร์ฟเวอร์รุ่นเก่าไม่ส่ง ใช้ชื่อในทะเบียน */
export function partNameOf(r: { partLabel?: string; partName: string; partCode: string }) {
  return r.partLabel || r.partName || r.partCode;
}

/**
 * จุดเริ่มงานซ่อมครั้งนี้ = เปิดใบใหม่ครั้งล่าสุด (REOPENED) · ไม่เคยเปิดใหม่ = ทั้งใบ
 * ใบเคลมที่อนุมัติไปตอนซ่อมครั้งก่อนไม่ใช่เรื่องที่ผู้ตรวจกำลังตัดสิน (กติกาเดียวกับ lockSince ฝั่งเซิร์ฟเวอร์)
 */
export function lockSinceOf(logs: ClaimLog[]): string | null {
  let since: string | null = null;
  for (const l of logs) if (l.action === "REOPENED" && (!since || t(l.createdAt) > t(since))) since = l.createdAt;
  return since;
}

/** แถวเคลมของงานซ่อมครั้งนี้ */
export function rowsSince<R extends { createdAt: string }>(claims: R[], logs: ClaimLog[]): R[] {
  const since = lockSinceOf(logs);
  return since ? claims.filter((c) => t(c.createdAt) >= t(since)) : claims;
}

/** ส่งชิ้นนี้รอบที่เท่าไหร่ — เซิร์ฟเวอร์ส่งมาแล้ว · ไม่ส่ง (รุ่นเก่า) นับแถวของชิ้นเดียวกันที่ส่งก่อนหรือพร้อมแถวนี้ */
export function roundOf(row: PartClaim, claims: PartClaim[]): number {
  if (typeof row.round === "number" && row.round > 0) return row.round;
  return claims.filter((c) => claimKeyOf(c) === claimKeyOf(row) && !newer(c, row)).length || 1;
}

/** แถวก่อนหน้าของชิ้นเดียวกัน (รอบที่แล้ว) — ไม่มี = ส่งครั้งแรก */
export function previousOf(row: PartClaim, claims: PartClaim[]): PartClaim | null {
  let best: PartClaim | null = null;
  for (const c of claims) {
    if (c.id === row.id || claimKeyOf(c) !== claimKeyOf(row) || !newer(row, c)) continue;
    if (!best || newer(c, best)) best = c;
  }
  return best;
}

/** แถวถัดไปของชิ้นเดียวกัน (รอบที่ส่งแก้) — ไม่มี = ยังเป็นรอบล่าสุด */
export function nextOf(row: PartClaim, claims: PartClaim[]): PartClaim | null {
  let best: PartClaim | null = null;
  for (const c of claims) {
    if (c.id === row.id || claimKeyOf(c) !== claimKeyOf(row) || !newer(c, row)) continue;
    if (!best || newer(best, c)) best = c;
  }
  return best;
}

/**
 * ไฟล์หลักฐานของแถวนี้ — ตาม id ที่เซิร์ฟเวอร์ให้มา (evidenceIds)
 * เซิร์ฟเวอร์รุ่นก่อนไม่ส่ง: ใช้กติกาเดิมของแอป (ไฟล์เคลมของชิ้นนี้ที่แนบก่อนส่ง) ดีกว่าไม่ขึ้นอะไรเลย
 */
export function evidenceOf<F extends EvidenceFile>(row: PartClaim, files: F[]): F[] {
  if (Array.isArray(row.evidenceIds)) {
    const ids = new Set(row.evidenceIds);
    return files.filter((f) => ids.has(f.id));
  }
  return files.filter(
    (f) =>
      (f.role?.startsWith("CLAIM_") && f.sparePartId === row.sparePartId && t(f.createdAt) <= t(row.createdAt)) ||
      (f.role === "NAMEPLATE" && f.id === row.nameplate?.photoId)
  );
}

/** ไฟล์ของชนิดนี้ในหลักฐานของแถว (ไฟล์ล่าสุดของชนิดนั้น) */
export function evidenceFile<F extends EvidenceFile>(row: PartClaim, files: F[], role: string): F | null {
  const list = evidenceOf(row, files).filter((f) => f.role === role);
  return list.reduce<F | null>((m, f) => (!m || t(f.createdAt) > t(m.createdAt) || (t(f.createdAt) === t(m.createdAt) && f.id > m.id) ? f : m), null);
}

/** ไฟล์นี้แนบหลังรอบก่อนถูกตีกลับ = ช่างแนบมาใหม่รอบนี้ (ป้าย "ใหม่รอบนี้") */
export function isNewThisRound(file: { createdAt: string }, prev: PartClaim | null): boolean {
  return !!prev?.reviewedAt && t(file.createdAt) > t(prev.reviewedAt);
}

/** วันตามเวลาไทยของเวลาหนึ่ง (YYYY-MM-DD) */
export function bkkDay(iso: string) {
  return new Date(t(iso) + 7 * 3600_000).toISOString().slice(0, 10);
}

/** รอมากี่วันแบบปฏิทินไทย — ส่งเมื่อวาน 23:00 = 1 วัน (กติกาเดียวกับการ์ดงานของช่าง) */
export function daysSince(iso: string | null | undefined): number {
  if (!iso || Number.isNaN(t(iso))) return 0;
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${bkkDay(iso)}T00:00:00Z`)) / 86_400_000));
}

/** รหัสอะไหล่เทียบกันแบบไม่สนตัวพิมพ์ ช่องว่าง ขีด — ช่างพิมพ์ "sp-board hb" ก็คือตัวเดียวกัน */
export function foldCode(s: string | null | undefined) {
  return (s ?? "").toUpperCase().replace(/[\s\-–]/g, "");
}

/** รหัสตัวที่เสียตรงกับอะไหล่ที่เปลี่ยนใส่ไหม — ว่าง (ใบเก่า) = ไม่ตัดสิน */
export function brokenMatches(row: Pick<PartClaim, "brokenPartCode" | "partCode">): boolean | null {
  if (!row.brokenPartCode?.trim()) return null;
  return foldCode(row.brokenPartCode) === foldCode(row.partCode);
}

/**
 * ชื่อวิดีโอที่ถ่ายอาการของเครื่อง — Oasis ไม่มีจอ Error และเครื่องที่ "ไม่มี Error ขึ้น" ไม่มีรหัสให้ถ่าย
 * เรียก "วิดีโออาการตอนเครื่องเดิน" แทน "วิดีโอ Error code" ทุกที่ที่เอ่ยถึงไฟล์นี้ (เจ้าของงานเลือก ต.ค. 69 ข้อ 4)
 */
export function errorVideoLabel(errorCode: string | null | undefined, plateFamily: string | null | undefined) {
  if (plateFamily === "OASIS" || errorCode === "อื่น ๆ") return "วิดีโออาการตอนเครื่องเดิน";
  return "วิดีโอ Error code";
}

const THAI = /[\u0E00-\u0E7F]/;

/**
 * ชื่อ Error ส่วนที่คนอ่าน — ส่วนไทยของ "อังกฤษ — ไทย" · ชื่อที่ไม่มีส่วนไทยแสดงตามคู่มือ (ไม่แปลเอง)
 * กติกาเดียวกับ errorNameParts ฝั่งเซิร์ฟเวอร์ (utils/claimGuide.ts) ที่ใบเคลม PDF ใช้
 */
function shownName(name: string): string {
  const i = name.indexOf(" — ");
  if (i > 0) {
    const en = name.slice(0, i).trim(), th = name.slice(i + 3).trim();
    if (THAI.test(th) && !THAI.test(en)) return th;
  }
  return name;
}

/**
 * Error ที่เครื่องขึ้นแบบที่ผู้ตรวจอ่าน: "{รหัส} — {ชื่อไทย}" · "อื่น ๆ" = "ไม่มี Error ขึ้น" — คำเดียวกับบรรทัดในใบเคลม PDF
 * (machineErrorText ฝั่งเซิร์ฟเวอร์) ผู้ตรวจเทียบหน้าจอกับใบที่จะส่งผู้ขายแล้วต้องเห็นตรงกัน
 * อ่านชื่อที่เก็บไว้ในแถวตอนส่ง ไม่ใช่รายการปัจจุบัน (label ในรายการเลือกมีวงเล็บอังกฤษ เป็นของฟอร์มช่าง)
 */
export function errorLabelOf(fc: { errorCode: string; errorName: string } | null | undefined): string | null {
  if (!fc?.errorCode) return null;
  if (fc.errorCode === "อื่น ๆ") return "ไม่มี Error ขึ้น";
  const shown = fc.errorName ? shownName(fc.errorName) : "";
  return shown ? `${fc.errorCode} — ${shown}` : fc.errorCode;
}

/**
 * ตัวที่หน้าตาคล้ายกันบนป้าย (O/0 · S/5 · E/6) — ผู้ตรวจเทียบกับภาพตัดทีละตัว ตัวพวกนี้คือที่ OCR และคนอ่านผิดบ่อยที่สุด
 * ชุดเดียวกับที่ช่างแตะสลับได้ตอนยืนยันรุ่น (ตัวอย่างที่เจ้าของงานเลือก)
 */
export const LOOKALIKE = new Set(["O", "0", "S", "5", "E", "6"]);
export function hasLookalike(value: string) {
  return [...value].some((c) => LOOKALIKE.has(c));
}

/** ช่างแก้จากที่ระบบอ่านกี่ตัว (ตำแหน่งต่อตำแหน่ง + ความยาวที่ต่าง) */
export function changedChars(value: string, read: string | null | undefined): number {
  if (read == null) return 0;
  let n = Math.abs(value.length - read.length);
  for (let i = 0; i < Math.min(value.length, read.length); i++) if (value[i] !== read[i]) n++;
  return n;
}

/**
 * ค่านี้มาจากไหน — บอกเท่าที่ช่างทำจริง (ตัวอย่างที่เจ้าของงานเลือก · modelSrc)
 * ใบที่ส่งก่อนมีปุ่มยืนยันทีละช่อง (ไม่มี confirmed ในช่องไหนเลย) ใช้คำเดิม: ช่างติ๊กครั้งเดียวทั้งชุด
 */
export function plateSourceText(
  f: ClaimPlateField,
  legacy: boolean
): string {
  if (legacy || f.confirmed === undefined) return f.source === "SCAN" ? "อ่านจากรูป" : "พิมพ์เอง";
  if (f.source !== "SCAN") return f.confirmed ? "พิมพ์เอง · ช่างยืนยันแล้ว" : "พิมพ์เอง";
  if (!f.confirmed) return "อ่านจากรูป · ยังไม่ได้ยืนยัน";
  const n = changedChars(f.value, f.read);
  if (!n) return "อ่านจากรูป · ช่างยืนยันแล้ว";
  return f.key === "model" ? `ช่างกดยืนยันรุ่นแล้ว · แก้จากที่ระบบอ่าน ${n} ตัว` : `ช่างยืนยันแล้ว · แก้จากที่ระบบอ่าน ${n} ตัว`;
}

/** ใบที่ส่งจากฟอร์มเก่า (ติ๊กครั้งเดียว "ดูทุกช่องเทียบกับรูปแล้ว") — ยังไม่มีการยืนยันทีละช่อง */
export function isLegacyPlate(np: PartClaim["nameplate"]): boolean {
  return !!np?.fields?.length && !np.fields.some((f) => f.confirmed !== undefined);
}

export interface CheckItem {
  text: string;
  done: boolean;
}
export interface CheckGroup {
  key: "ts" | "eif";
  title: string;
  items: CheckItem[];
}

/** กลุ่ม "เช็คตาม Error {รหัส}" — ข้อที่ฟอร์มให้ช่างเห็นตอนส่ง (offered) · ใบเก่าไม่มี ใช้รายการปัจจุบันของ Error นั้นแทน */
export function errorCheckGroup(
  fc: PartClaim["fieldCheck"],
  guide?: { errors: { code: string; checks: string[] }[] } | null
): CheckGroup | null {
  if (!fc?.errorCode) return null;
  const offered = fc.offered ?? guide?.errors.find((e) => e.code === fc.errorCode)?.checks ?? [];
  const all = [...offered, ...fc.checked.filter((x) => !offered.includes(x))];
  if (!all.length) return null;
  return {
    key: "eif",
    title: `เช็คตาม Error ${fc.errorCode} (ไม่บังคับ · ไม่พิมพ์ลงใบเคลม)`,
    items: all.map((x) => ({ text: x, done: fc.checked.includes(x) })),
  };
}

/**
 * "ช่างเข้าเช็คอะไรบ้าง" ของแถวนี้ แยกสองกลุ่มตามแบบ: Troubleshooting (พิมพ์ลงใบเคลม) กับเช็คตาม Error (ไม่พิมพ์)
 * ข้อที่ไม่ได้ติ๊กขึ้นเป็น ✗ "(ไม่ได้ทำ)" — ระบบไม่ติ๊กให้ช่าง ผู้ตรวจจึงต้องเห็นว่าข้อไหนช่างไม่ได้ทำ ไม่ใช่เห็นแค่ข้อที่ทำ
 * เช็คตาม Error ใช้รายการที่ฟอร์มให้ช่างเห็นตอนส่ง (offered) · ใบเก่าไม่มี ใช้รายการปัจจุบันของ Error นั้นแทน
 */
export function checkGroupsOf(row: PartClaim, troubleshooting: string[], guide?: ClaimGuide | null): { groups: CheckGroup[]; count: string } {
  const groups: CheckGroup[] = [];
  const tsList = [...troubleshooting, ...row.troubleshooting.filter((x) => !troubleshooting.includes(x))];
  if (tsList.length) {
    groups.push({
      key: "ts",
      title: "Troubleshooting (พิมพ์ลงใบเคลม)",
      items: tsList.map((x) => ({ text: x, done: row.troubleshooting.includes(x) })),
    });
  }
  const eif = errorCheckGroup(row.fieldCheck, guide);
  if (eif) groups.push(eif);
  const cnt = (g: CheckGroup) => `${g.items.filter((i) => i.done).length}/${g.items.length}`;
  const count = groups.map((g) => (g.key === "ts" ? `Troubleshooting ${cnt(g)}` : `เช็คตาม Error ${cnt(g)}`)).join(" · ");
  return { groups, count };
}

/** ชื่อชนิดหลักฐานที่ผู้ตรวจเรียก */
export function evidenceRoleLabel(role: string, errorCode?: string | null, plateFamily?: string | null) {
  switch (role) {
    case "CLAIM_PART":
      return "รูปอะไหล่เก่า";
    case "CLAIM_CHECK_VIDEO":
      return "วิดีโอการตรวจเช็ค";
    case "CLAIM_ERROR_VIDEO":
      return errorVideoLabel(errorCode, plateFamily);
    case "CLAIM_SYMPTOM":
      return "รูปอาการ";
    case "NAMEPLATE":
      return "รูปป้ายรุ่น";
    default:
      return role;
  }
}

/** ตัดข้อความยาวในบรรทัด "แก้จากรอบก่อน" — อาการ/สาเหตุยาวได้หลายร้อยตัว ไม่ต้องเห็นทั้งก้อนสองรอบ */
function clip(s: string, n = 40) {
  const v = s.trim().replace(/\s+/g, " ");
  return v.length > n ? `${v.slice(0, n)}…` : v || "—";
}

/**
 * คำอธิบาย "ค่าเดิมถูกแล้ว" ในประวัติการส่งครั้งที่แถวนี้อยู่ (CLAIM_SUBMITTED)
 * เซิร์ฟเวอร์เขียนไว้ในข้อความประวัติว่า "ส่งเคลมอะไหล่เก่า: … · {ชิ้น} ยืนยันค่าเดิม: {คำอธิบาย} · …"
 * (ข้อมูลโครงสร้างอยู่ใน meta.keep ซึ่งหน้ารายละเอียดยังไม่ได้ส่งมา — ก้อน 4 ส่งเป็น claimKeep)
 * แยกทีละท่อนที่ " · {ชื่อ} ยืนยันค่าเดิม: " — ชื่อชิ้นไม่มีจุดกลาง คำอธิบายที่มี " · " ข้างในจึงไม่ถูกตัดกลาง
 */
function keepSegments(row: PartClaim, logs: ClaimLog[]): { label: string; note: string }[] {
  const at = t(row.createdAt);
  const log = logs
    .filter((l) => l.action === "CLAIM_SUBMITTED" && t(l.createdAt) >= at - 2000)
    .sort((a, b) => t(a.createdAt) - t(b.createdAt))[0];
  if (!log?.note) return [];
  const note = log.note;
  const marks = [...note.matchAll(/ · ([^·]+?) ยืนยันค่าเดิม: /g)];
  return marks.map((m, i) => ({
    label: m[1].trim(),
    note: note.slice((m.index ?? 0) + m[0].length, i + 1 < marks.length ? marks[i + 1].index : note.length).trim(),
  }));
}

/**
 * ชื่อที่เซิร์ฟเวอร์อาจใช้เรียกชิ้นนี้ในข้อความประวัติ — ตอนเขียน เซิร์ฟเวอร์ต่อรหัสท้ายชื่อเฉพาะเมื่อมีชื่อซ้ำ
 * "ในงานซ่อมครั้งนั้น" แต่ partLabel ในหน้ารายละเอียดนับทุกแถวที่ใบเคยมี (รวมก่อนเปิดใบใหม่) สองที่จึงต่อรหัสไม่ตรงกันได้
 * ถ้าเทียบชื่อเดียว คำอธิบายที่ช่างถูกบังคับให้เขียนจะหายจากหน้าตรวจเงียบ ๆ
 */
function keepLabelsOf(row: PartClaim): string[] {
  return [...new Set([partNameOf(row), row.partName, `${row.partName} (${row.partCode})`])];
}

/** คำอธิบาย "ค่าเดิมถูกแล้ว" ของชิ้นนี้ — ไม่มี = ช่างไม่ได้กดค่าเดิมถูกแล้วให้ชิ้นนี้ */
export function keepNoteOf(row: PartClaim, logs: ClaimLog[]): string | null {
  const names = keepLabelsOf(row);
  return keepSegments(row, logs).find((s) => names.includes(s.label))?.note || null;
}

/**
 * ท่อน "ค่าเดิมถูกแล้ว" ในประวัติที่จับคู่กับชิ้นที่รอตรวจไม่ได้เลย — แสดงตามข้อความเดิมทั้งท่อน (แผนก้อน 1–3: ข้อความตามประวัติ)
 * ดีกว่าซ่อน: ผู้ตรวจต้องเห็นคำอธิบายที่ช่างเขียนเสมอ แม้ระบบจะบอกไม่ได้ว่าเป็นของชิ้นไหน
 */
export function unmatchedKeepNotes(rows: PartClaim[], logs: ClaimLog[]): string[] {
  if (!rows.length) return [];
  const names = new Set(rows.flatMap(keepLabelsOf));
  return keepSegments(rows[0], logs)
    .filter((s) => !names.has(s.label) && s.note)
    .map((s) => `${s.label} ยืนยันค่าเดิม: ${s.note}`);
}

export interface DiffLine {
  text: string;
  kind: "value" | "file" | "keep";
}

/**
 * อะไรเปลี่ยนจากรอบที่ถูกตีกลับ (ป้าย "แก้จากรอบก่อน:") — ผู้ตรวจไม่ต้องจำว่ารอบก่อนส่งอะไรมา
 * part = ช่องของชิ้นนี้ · machine = ข้อมูลเครื่อง (ป้ายรุ่น · Error) ขึ้นในกล่องข้อมูลเครื่องครั้งเดียว
 * ไฟล์: หลักฐานชนิดเดียวกันคนละไฟล์กับรอบก่อน = ช่างแนบใหม่แทนไฟล์เดิม
 */
export function diffSincePrevious<F extends EvidenceFile>(
  row: PartClaim,
  prev: PartClaim | null,
  files: F[],
  plateFamily?: string | null
): { part: DiffLine[]; machine: DiffLine[] } {
  const part: DiffLine[] = [];
  const machine: DiffLine[] = [];
  if (!prev) return { part, machine };
  const val = (label: string, a: string | null | undefined, b: string | null | undefined, into: DiffLine[]) => {
    if ((a ?? "").trim() !== (b ?? "").trim()) into.push({ kind: "value", text: `${label} ${clip(a ?? "")} → ${clip(b ?? "")}` });
  };
  val("รหัสอะไหล่ตัวที่เสีย", prev.brokenPartCode, row.brokenPartCode, part);
  val("อาการ/สาเหตุ", prev.symptom, row.symptom, part);
  val("ช่างเข้าเช็คอะไรบ้าง", prev.checkNote, row.checkNote, part);
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  if (!sameSet(prev.troubleshooting, row.troubleshooting)) {
    part.push({ kind: "value", text: `Troubleshooting ${prev.troubleshooting.length} ข้อ → ${row.troubleshooting.length} ข้อ` });
  }
  if (!sameSet(prev.fieldCheck?.checked ?? [], row.fieldCheck?.checked ?? [])) {
    part.push({
      kind: "value",
      text: `เช็คตาม Error ${(prev.fieldCheck?.checked ?? []).length} ข้อ → ${(row.fieldCheck?.checked ?? []).length} ข้อ`,
    });
  }
  const plate = (np: PartClaim["nameplate"]) => new Map((np?.fields ?? []).map((f) => [f.key, f] as const));
  const was = plate(prev.nameplate);
  for (const f of row.nameplate?.fields ?? []) val(f.label, was.get(f.key)?.value, f.value, machine);
  if ((prev.fieldCheck?.errorCode ?? "") !== (row.fieldCheck?.errorCode ?? "")) {
    machine.push({
      kind: "value",
      text: `Error ที่เครื่องขึ้น ${prev.fieldCheck?.errorCode || "—"} → ${row.fieldCheck?.errorCode || "—"}`,
    });
  }
  const before = evidenceOf(prev, files);
  for (const f of evidenceOf(row, files)) {
    if (!f.role) continue;
    const old = before.filter((b) => b.role === f.role);
    if (!old.length || old.some((b) => b.id === f.id)) continue;
    const label = evidenceRoleLabel(f.role, row.fieldCheck?.errorCode, plateFamily);
    const into = f.role === "CLAIM_PART" || f.role === "CLAIM_CHECK_VIDEO" ? part : machine;
    into.push({ kind: "file", text: `${label} — ไฟล์ใหม่แทนไฟล์เดิม` });
  }
  return { part, machine };
}

/**
 * แถบสถานะเคลมจากประวัติใบงาน + แถวเคลม — แบบเดียวกับ claimTrail ฝั่งเซิร์ฟเวอร์ (การ์ดงานของช่างอ่านจากเซิร์ฟเวอร์)
 * ส่ง/ส่งใหม่จากประวัติ CLAIM_SUBMITTED · ตีกลับ/อนุมัติจากแถวเคลม จับกลุ่มตามเวลาตัดสิน (ตัดสินครั้งเดียวเวลาเดียวกันทุกแถว)
 * นับเฉพาะงานซ่อมครั้งนี้ (ตั้งแต่เปิดใบใหม่ครั้งล่าสุด)
 */
export function claimTrailOf(claims: PartClaim[], logs: ClaimLog[]): TrailEvent[] {
  const since = lockSinceOf(logs);
  const inScope = (iso: string) => !since || t(iso) >= t(since);
  const rows = claims.filter((c) => inScope(c.createdAt));
  const events: TrailEvent[] = [];
  logs
    .filter((l) => l.action === "CLAIM_SUBMITTED" && inScope(l.createdAt))
    .sort((a, b) => t(a.createdAt) - t(b.createdAt))
    .forEach((l, i) => events.push({ k: i === 0 ? "send" : "resend", at: l.createdAt, who: l.byName }));
  const groups = new Map<number, PartClaim[]>();
  for (const r of rows) {
    if (r.status === "PENDING" || !r.reviewedAt) continue;
    const k = t(r.reviewedAt);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const g of groups.values()) {
    const at = g[0].reviewedAt!;
    const who = g[0].reviewedByName ?? null;
    const rejected = g.filter((r) => r.status === "REJECTED");
    const approved = g.some((r) => r.status === "APPROVED");
    if (rejected.length) events.push({ k: "reject", at, who, what: rejected.map(partNameOf).join(", ") });
    else if (approved) events.push({ k: "approve", at, who });
    // ตัดสินแล้วไม่มีชิ้นไหนผ่านหรือถูกตีกลับ = ปิดเคลมไม่ส่งผู้ขายทุกชิ้น (ก้อน 3)
    else events.push({ k: "close", at, who, what: "ปิดเคลม ไม่ส่งผู้ขาย" });
  }
  const order = { send: 0, resend: 0, reject: 1, approve: 2, close: 3 } as const;
  return events.sort((a, b) => t(a.at) - t(b.at) || order[a.k] - order[b.k]);
}

export interface OldRound {
  round: number;
  at: string | null;
  reviewer: string | null;
  lines: { text: string; tone: "head" | "ok" | "bad" | "muted" }[];
}

/**
 * รอบที่ถูกตีกลับไปแล้ว (พับไว้ใต้ชิ้นที่กำลังตรวจ · ตัวอย่างที่เจ้าของงานเลือก oldLines)
 * รอบ = การส่งครั้งหนึ่ง (แถวที่เวลาส่งเท่ากัน) ที่มีชิ้นถูกตีกลับ · เรียงเก่า → ใหม่
 * บอกด้วยว่าไฟล์เดิมของรอบนั้นที่ถูกแนบใหม่แทน เก็บเป็นประวัติเท่านั้น ไม่ได้ไปกับใบเคลม
 */
export function oldRoundsOf<F extends EvidenceFile>(
  claims: PartClaim[],
  logs: ClaimLog[],
  files: F[],
  plateFamily?: string | null
): OldRound[] {
  const rows = rowsSince(claims, logs).filter((c) => c.status !== "PENDING");
  const byClose = new Map<number, PartClaim[]>();
  for (const r of rows) byClose.set(t(r.createdAt), [...(byClose.get(t(r.createdAt)) ?? []), r]);
  const all = rowsSince(claims, logs);
  const out: OldRound[] = [];
  for (const g of [...byClose.values()].sort((a, b) => t(a[0].createdAt) - t(b[0].createdAt))) {
    if (!g.some((r) => r.status === "REJECTED")) continue;
    const decided = g.find((r) => r.reviewedAt) ?? g[0];
    const round = Math.max(...g.map((r) => roundOf(r, all)));
    const reviewer = decided.reviewedByName ?? null;
    const lines: OldRound["lines"] = [
      {
        text: `รอบ ${round} · ตีกลับ${decided.reviewedAt ? ` ${dayTime(decided.reviewedAt)}` : ""}${reviewer ? ` โดย${reviewer}` : ""}`,
        tone: "head",
      },
    ];
    for (const r of [...g].sort((a, b) => a.id - b.id)) {
      const name = partNameOf(r);
      if (r.status === "APPROVED") lines.push({ text: `✓ ${name} ผ่าน`, tone: "ok" });
      else if (r.status === "REJECTED") lines.push({ text: `✗ ${name} ตีกลับ${r.rejectReason ? ` — “${r.rejectReason}”` : ""}`, tone: "bad" });
      else lines.push({ text: `${name} ปิดเคลม ไม่ส่งผู้ขาย${r.rejectReason ? ` (${r.rejectReason})` : ""}`, tone: "muted" });
    }
    for (const r of g) {
      const next = nextOf(r, all);
      if (!next) continue;
      const after = evidenceOf(next, files);
      for (const f of evidenceOf(r, files)) {
        if (!f.role || f.role === "NAMEPLATE") continue;
        const repl = after.filter((a) => a.role === f.role);
        if (!repl.length || repl.some((a) => a.id === f.id)) continue;
        lines.push({
          text: `ไฟล์เดิมของ ${partNameOf(r)} · ${evidenceRoleLabel(f.role, r.fieldCheck?.errorCode, plateFamily)} (รอบ ${round}) เก็บเป็นประวัติ ไม่ส่งไปกับใบเคลม`,
          tone: "muted",
        });
      }
    }
    out.push({ round, at: decided.reviewedAt, reviewer, lines });
  }
  return out;
}

/** ป้ายพับรอบเก่า: "รอบ 1 · ตีกลับ ▸" · หลายรอบ "รอบ 1 · ตีกลับ · รอบ 2 · ตีกลับ ▸" · เปิดแล้ว "▾" */
export function oldRoundsLabel(rounds: OldRound[], open: boolean) {
  return `${rounds.map((r) => `รอบ ${r.round} · ตีกลับ`).join(" · ")} ${open ? "▾" : "▸"}`;
}

/** สถานะใบเคลมเก่าแบบที่คนอ่าน (บรรทัดเคลมซ้ำ) */
export const CLAIM_STATUS_TEXT: Record<string, string> = {
  PENDING: "รอตรวจ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ตีกลับ",
  DECLINED: "ปิดเคลม ไม่ส่งผู้ขาย",
};
