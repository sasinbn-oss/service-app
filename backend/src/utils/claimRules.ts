/**
 * กติกาเคลมอะไหล่เก่าที่หลายที่ต้องตอบเหมือนกัน — ฟังก์ชันล้วน (ไม่แตะฐานข้อมูล) คนเรียกอ่านข้อมูลมาส่งให้เอง
 *
 * ทำไมแยกไฟล์: "ไฟล์ไหนคือหลักฐานของใบเคลมนี้" ถูกถามจากหลายที่ — กันลบไฟล์ที่ส่งไปแล้ว · หน้าตรวจเคลม ·
 * ใบเคลม PDF · ไฟล์ที่จะส่งผู้ขาย ถ้าแต่ละที่เขียนเงื่อนไขเอง วันหนึ่งจะตอบไม่ตรงกัน เช่น ระบบยอมให้ลบ
 * ไฟล์ที่ผู้ขายยังต้องได้รับ หรือ PDF ลงรายการไฟล์ที่แนบหลังส่งเคลมไปแล้ว — จึงมีคำตอบเดียวอยู่ที่นี่
 */
import { CLAIM_EVIDENCE_ROLES, CLAIM_REVIEW_FLAGS } from "./constants";
import { NO_ERROR_CODE, plateTemplateFor } from "./claimGuide";

/** แถว PartClaim เท่าที่กติกาในไฟล์นี้ใช้ */
export interface ClaimRowLite {
  id: number;
  sparePartId: number | null;
  partCode: string;
  status: string;
  createdAt: Date;
  /** Json ของ PartClaim — ใช้แค่ photoId (รูปป้ายรุ่นที่ผูกกับใบเคลมตอนส่ง) */
  nameplate?: unknown;
}

/** ไฟล์แนบเท่าที่กติกาในไฟล์นี้ใช้ */
export interface ClaimFileLite {
  id: number;
  role: string | null;
  sparePartId: number | null;
  createdAt: Date;
}

/** ประวัติใบงานเท่าที่ใช้หาจุดเริ่มรอบ (ASSIGNED / REOPENED) และจุดเริ่มงานซ่อมใหม่ (REOPENED) */
export interface ClaimLogLite {
  action: string;
  createdAt: Date;
}

/**
 * หลักฐานที่เป็นของ "เครื่อง" ไม่ใช่ของอะไหล่ชิ้นใดชิ้นหนึ่ง — วิดีโอ Error กับรูปอาการ ถ่ายครั้งเดียวต่อเครื่อง
 *
 * ตอนนี้ฟอร์มปิดงานยังให้แนบแยกทีละชิ้น (ทุกไฟล์มี sparePartId) จึงนับเฉพาะไฟล์ของชิ้นนั้น
 * บวกไฟล์ที่ไม่ผูกชิ้น (sparePartId ว่าง) ซึ่งยังไม่มีใครแนบได้ — ไม่นับไฟล์ของชิ้นอื่น เพราะถ้านับ
 * วิดีโอ Error ที่ชิ้น ก. ส่งไปแล้วจะหลุดจากการกันลบ ทันทีที่ชิ้น ข. แนบวิดีโอของตัวเองทีหลัง
 * วันที่ฟอร์มเปลี่ยนเป็นถ่ายครั้งเดียวใช้ทุกชิ้น ให้ขยายเงื่อนไขที่ partMatches ที่เดียว
 */
const MACHINE_LEVEL_ROLES: readonly string[] = ["CLAIM_ERROR_VIDEO", "CLAIM_SYMPTOM"];

function partMatches(row: ClaimRowLite, f: ClaimFileLite): boolean {
  if (f.sparePartId === row.sparePartId) return true;
  return MACHINE_LEVEL_ROLES.includes(f.role ?? "") && f.sparePartId === null;
}

function newer(a: { createdAt: Date; id: number }, b: { createdAt: Date; id: number }) {
  const d = a.createdAt.getTime() - b.createdAt.getTime();
  return d !== 0 ? d > 0 : a.id > b.id;
}

/**
 * รอบที่แถวเคลมนี้ถูกส่ง เริ่มเมื่อไหร่ = ถูกจ่ายงาน/เปิดใบใหม่ครั้งล่าสุดก่อนส่ง
 *
 * กติกาเดียวกับที่ปิดงานใช้นับไฟล์ของรอบ (roundStartedAt) — ไฟล์ของรอบเก่าไม่เคยถูกนับเป็นหลักฐานของรอบนี้
 * ไม่มีประวัติเลย (ใบเก่ามาก) = ไม่มีขอบล่าง
 */
export function evidenceWindowStart(row: { createdAt: Date }, logs: ClaimLogLite[]): Date | null {
  let start: Date | null = null;
  for (const l of logs) {
    if ((l.action === "ASSIGNED" || l.action === "REOPENED") && l.createdAt <= row.createdAt) {
      if (!start || l.createdAt > start) start = l.createdAt;
    }
  }
  return start;
}

/**
 * ไฟล์ที่เป็นหลักฐานของแถวเคลมนี้ — ชิ้นเดียวกัน (หรือหลักฐานของเครื่อง) · อยู่ในรอบที่ส่ง · แนบก่อนกดส่ง ·
 * เอาไฟล์ล่าสุดของแต่ละชนิด (แนบซ้ำ = ไฟล์ใหม่แทนไฟล์เดิม) · รูปป้ายรุ่นคือรูปที่ผูกไว้ตอนส่ง (nameplate.photoId)
 *
 * ขอบบน = เวลาที่ส่ง: ไฟล์ที่แนบหลังส่งไปแล้ว (หลังถูกตีกลับ เตรียมส่งใหม่) ไม่ใช่สิ่งที่ผู้ตรวจเห็นตอนตัดสินแถวนี้
 */
export function claimEvidenceFor<F extends ClaimFileLite>(row: ClaimRowLite, files: F[], logs: ClaimLogLite[]): F[] {
  const start = evidenceWindowStart(row, logs);
  const latest = new Map<string, F>();
  for (const f of files) {
    if (!f.role || !(CLAIM_EVIDENCE_ROLES as readonly string[]).includes(f.role)) continue;
    if (f.createdAt > row.createdAt || (start && f.createdAt < start)) continue;
    if (!partMatches(row, f)) continue;
    const cur = latest.get(f.role);
    if (!cur || newer(f, cur)) latest.set(f.role, f);
  }
  const out = [...latest.values()];
  const photoId = (row.nameplate as { photoId?: unknown } | null | undefined)?.photoId;
  if (typeof photoId === "number") {
    const plate = files.find((f) => f.id === photoId && f.role === "NAMEPLATE");
    if (plate) out.push(plate);
  }
  return out;
}

/**
 * ไฟล์นี้ถูกส่งไปเป็นหลักฐานของใบเคลมใบใดใบหนึ่งแล้วหรือยัง — ใช้กันช่างลบไฟล์ที่ผู้ตรวจ/ผู้ขายต้องเห็น
 *
 * ไฟล์ที่ไม่เคยถูกส่ง (ชิ้นที่ช่างปิดเคลม · ไฟล์ที่ถูกแนบใหม่แทน · ไฟล์ที่แนบหลังส่งรอบล่าสุด) ยังลบได้
 * เพดานไฟล์ต่อใบ (60) จึงยังบอกให้ "ลบไฟล์ที่ไม่ใช้" ได้จริง
 */
export function isSubmittedEvidence(
  fileId: number,
  rows: ClaimRowLite[],
  files: ClaimFileLite[],
  logs: ClaimLogLite[]
): boolean {
  return rows.some((r) => claimEvidenceFor(r, files, logs).some((f) => f.id === fileId));
}

/**
 * วันที่เปลี่ยนอะไหล่จริงของแถวเคลมนี้ = วันที่ส่งเคลมชิ้นนี้ครั้งแรก
 *
 * ใบที่ถูกตีกลับแล้วช่างแก้ส่งใหม่ คือการซ่อมครั้งเดิม — ผู้ขายต้องเห็นวันที่เปลี่ยนของจริง ไม่ใช่วันที่ส่งรอบล่าสุด
 * ไล่ย้อนแถวก่อนหน้าของชิ้นเดียวกันในใบงานนี้ ตราบที่แถวนั้นถูกตีกลับ (ห่วงโซ่ "ตีกลับ → ส่งใหม่")
 * หยุดที่แถวที่ไม่ได้ถูกตีกลับ (ผ่าน/รอตรวจ) และไม่ย้อนข้ามการเปิดใบใหม่ (notBefore) ซึ่งคือการซ่อมคนละครั้ง
 */
export function firstSubmittedAt(target: ClaimRowLite, rows: ClaimRowLite[], notBefore?: Date | null): Date {
  // อะไหล่ที่ถูกลบออกจากทะเบียน sparePartId ว่างทุกแถว — ใช้รหัสอะไหล่แทน
  const key = (r: ClaimRowLite) => (r.sparePartId != null ? `id:${r.sparePartId}` : `code:${r.partCode}`);
  const earlier = rows
    .filter(
      (r) =>
        r.id !== target.id &&
        key(r) === key(target) &&
        newer(target, r) &&
        (!notBefore || r.createdAt >= notBefore)
    )
    .sort((a, b) => (newer(a, b) ? -1 : 1));
  let first = target.createdAt;
  for (const r of earlier) {
    if (r.status !== "REJECTED") break;
    first = r.createdAt;
  }
  return first;
}

// ── ก้อน 1: ช่างแก้เคลมหลังถูกตีกลับ ─────────────────────────────

/**
 * กุญแจของ "อะไหล่ชิ้นเดียวกัน" ในใบงานหนึ่ง — อะไหล่ที่ถูกลบออกจากทะเบียน sparePartId ว่างทุกแถว ใช้รหัสอะไหล่แทน
 * (กติกาเดียวกับ firstSubmittedAt — ห่วงโซ่ตีกลับ → ส่งใหม่ของชิ้นเดียวกันต้องนับตรงกันทุกที่)
 */
export function claimKey(r: { sparePartId: number | null; partCode: string }): string {
  return r.sparePartId != null ? `id:${r.sparePartId}` : `code:${r.partCode}`;
}

/**
 * แถวล่าสุดของแต่ละชิ้น — "ชิ้นนี้ตอนนี้อยู่สถานะไหน"
 *
 * ทำไมไม่อ่าน claims[0]: แถวของการส่งครั้งเดียวกันมีเวลาเท่ากันทุกแถว (ก้อน 1) และตั้งแต่ตัดสินทีละชิ้น (ก้อน 3)
 * แถวของรอบเดียวกันได้ผลต่างกัน — แถวบนสุดบอกได้แค่ชิ้นเดียว ใบที่ "ชิ้น ก. ผ่าน ชิ้น ข. ถูกตีกลับ" จะดูเหมือนผ่านทั้งใบ
 */
export function latestPerPart<R extends ClaimRowLite>(rows: R[]): Map<string, R> {
  const out = new Map<string, R>();
  for (const r of rows) {
    const cur = out.get(claimKey(r));
    if (!cur || newer(r, cur)) out.set(claimKey(r), r);
  }
  return out;
}

/**
 * ชื่ออะไหล่ที่คนอ่าน — ชื่อไทยตามทะเบียน (ช่างกับ Admin Spare Part เรียกกันด้วยชื่อ ไม่ใช่รหัส ตามแบบที่เจ้าของงานอนุมัติ)
 * ต่อรหัสในวงเล็บเฉพาะเมื่อในใบเดียวกันมีอะไหล่ชื่อซ้ำกันคนละรหัส ไม่งั้น "ตีกลับ บอร์ดควบคุม" ไม่รู้ว่าตัวไหน
 * ใช้ทั้งข้อความปฏิเสธของเซิร์ฟเวอร์ · บันทึกประวัติ · หน้าจอ (ส่งไปเป็น partLabel) ให้เรียกชื่อเดียวกันทุกที่
 */
export function partLabel(
  part: { partCode: string; partName: string },
  all: { partCode: string; partName: string }[]
): string {
  const twin = all.some((o) => o.partName === part.partName && o.partCode !== part.partCode);
  return twin ? `${part.partName} (${part.partCode})` : part.partName;
}

/**
 * จุดเริ่มงานซ่อมครั้งนี้ = เปิดใบใหม่ (REOPENED) ครั้งล่าสุด · ไม่เคยเปิดใหม่ = ทั้งใบ (null)
 *
 * คนละอย่างกับรอบหลักฐาน (evidenceWindowStart · ถูกจ่ายงาน/เปิดใหม่): ใบที่ถูกตีกลับแล้ว "แจ้งปัญหาหน้างาน" หรือย้อนขั้น
 * แล้วจ่ายงานใหม่ ยังเป็นการซ่อมครั้งเดิม — สถานะเคลมของการซ่อมครั้งนี้ต้องนับต่อ ส่วนเปิดใบใหม่คือซ่อมคนละครั้ง
 * ใบเคลมที่อนุมัติไปตอนซ่อมครั้งก่อนไม่ใช่สถานะของงานที่ช่างถืออยู่ตอนนี้
 */
export function lockSince(logs: ClaimLogLite[]): Date | null {
  let since: Date | null = null;
  for (const l of logs) if (l.action === "REOPENED" && (!since || l.createdAt > since)) since = l.createdAt;
  return since;
}

// ── ก้อน 2: ผู้ตรวจเห็นครบในหน้าเดียว ─────────────────────────────

/**
 * งานซ่อมครั้งที่แถวนี้อยู่ เริ่มเมื่อไหร่ = เปิดใบใหม่ (REOPENED) ครั้งล่าสุดก่อนส่งแถวนี้ · ไม่เคยเปิดใหม่ = ทั้งใบ (null)
 *
 * ต่างจาก lockSince ตรงที่ดู "ณ เวลาที่ส่งแถวนั้น" — แถวของการซ่อมครั้งก่อนเปิดใบใหม่ต้องนับรอบ/วันที่ส่งครั้งแรก
 * ในการซ่อมครั้งของมันเอง ไม่ใช่ถูกตัดทิ้งเพราะมีการเปิดใบใหม่ทีหลัง (หน้าตรวจยังแสดงรอบเก่าเป็นประวัติ)
 */
export function repairStartFor(at: Date, logs: ClaimLogLite[]): Date | null {
  let since: Date | null = null;
  for (const l of logs) {
    if (l.action === "REOPENED" && l.createdAt <= at && (!since || l.createdAt > since)) since = l.createdAt;
  }
  return since;
}

/**
 * ส่งรอบที่เท่าไหร่ของชิ้นนี้ = จำนวนครั้งที่ส่งชิ้นเดียวกันในงานซ่อมครั้งนั้น นับถึงแถวนี้ (รวมตัวเอง)
 *
 * นับต่อชิ้น ไม่ใช่ต่อการกดส่ง — ใบ 2 ชิ้นที่ถูกตีกลับครั้งเดียวคือรอบ 2 ของทั้งสองชิ้น ไม่ใช่รอบ 3
 * (กติกาเดียวกับ round ของการ์ดงานช่างใน claimSummary) ผู้ตรวจกับช่างจึงเห็นเลขรอบเดียวกัน
 */
export function claimRoundOf(target: ClaimRowLite, rows: ClaimRowLite[], notBefore?: Date | null): number {
  return rows.filter(
    (r) => claimKey(r) === claimKey(target) && !newer(r, target) && (!notBefore || r.createdAt >= notBefore)
  ).length;
}

/**
 * ใบเคลมนี้เป็นชิ้นที่เท่าไหร่จากกี่ชิ้น ("ชิ้นที่ n จาก m" บนหัวใบเคลม) — ผู้ขายได้ใบเคลมใบละชิ้น ต้องรู้ว่าครบชุดหรือยัง
 *
 * นับชิ้นของงานซ่อมครั้งนั้น ณ เวลาที่ส่งแถวนี้ (แถวล่าสุดของแต่ละชิ้น) ไม่ใช่แค่แถวที่ส่งพร้อมกัน —
 * ชิ้นที่ผ่านไปแล้วรอบก่อนยังเป็นของชุดเดียวกัน · ไม่นับชิ้นที่ปิดเคลมไม่ส่งผู้ขาย (ไม่มีใบเคลมให้ผู้ขาย)
 * ไม่นับชิ้นที่ค้างเป็นตีกลับจากการส่งครั้งก่อน — ช่างเลิกส่งเคลมชิ้นนั้นตอนส่งใหม่ (ถอดติ๊ก/เอาออกจากอะไหล่ที่ใช้)
 * ชิ้นนั้นจะไม่มีใบเคลมไปถึงผู้ขายอีก ถ้านับไว้ ใบที่อนุมัติจะเขียน "1 จาก 2" ผู้ขายรอใบที่สองที่ไม่มีวันมา
 * (ตีกลับที่ส่งพร้อมแถวนี้ยังนับ — เปิดใบของรอบที่ถูกตีกลับดูย้อนหลัง ต้องเห็นชุดตามที่ส่งตอนนั้น)
 * เรียงตามที่ส่งครั้งแรก (id แรกของชิ้นนั้น) เลขของชิ้นจึงไม่สลับเมื่อชิ้นหนึ่งถูกตีกลับแล้วส่งใหม่
 */
export function claimPosition(
  target: ClaimRowLite,
  rows: ClaimRowLite[],
  notBefore?: Date | null
): { n: number; m: number } {
  const inRepair = rows.filter(
    (r) => r.createdAt.getTime() <= target.createdAt.getTime() && (!notBefore || r.createdAt >= notBefore)
  );
  const firstId = new Map<string, number>();
  for (const r of inRepair) firstId.set(claimKey(r), Math.min(firstId.get(claimKey(r)) ?? r.id, r.id));
  const parts = [...latestPerPart(inRepair).values()]
    .filter(
      (r) =>
        claimKey(r) === claimKey(target) ||
        (r.status !== "DECLINED" && !(r.status === "REJECTED" && r.createdAt.getTime() !== target.createdAt.getTime()))
    )
    .map((r) => claimKey(r))
    .sort((a, b) => (firstId.get(a) ?? 0) - (firstId.get(b) ?? 0));
  const n = parts.indexOf(claimKey(target)) + 1;
  return n > 0 ? { n, m: parts.length } : { n: 1, m: 1 };
}

/** แถวเคลมที่ถูกตีกลับ (ค่าที่ส่งรอบนั้น) — ใช้เทียบว่ารอบนี้ช่างแก้อะไรแล้วหรือยัง */
export interface ClaimRejectedRow extends ClaimRowLite {
  brokenPartCode: string | null;
  symptom: string;
  checkNote: string;
  troubleshooting: string[];
  fieldCheck?: unknown;
  reviewedAt: Date | null;
  /** ช่องที่ผู้ตรวจชี้ให้แก้ (ก้อน 4) · ว่าง/ไม่มี = ตีกลับแบบเดิม (ข้อความอย่างเดียว) */
  reviewFlags?: string[];
}

/** ค่าที่ช่างกำลังจะส่งใหม่ของชิ้นเดียวกัน — ค่าหลังตัดช่องว่าง/ตัดข้อที่ไม่มีในรายการแล้ว (แบบเดียวกับที่จะเก็บลงแถว) */
export interface ClaimResubmit {
  brokenPartCode: string;
  symptom: string;
  checkNote: string;
  troubleshooting: string[];
  plate: { key: string; value: string }[];
  errorCode: string | null;
  errorChecked: string[];
}

function plateOf(nameplate: unknown): { key: string; value: string }[] {
  const fields = (nameplate as { fields?: unknown } | null | undefined)?.fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .map((f) => ({ key: String((f as { key?: unknown }).key ?? ""), value: String((f as { value?: unknown }).value ?? "").trim() }))
    .filter((f) => f.value);
}

function sameSet(a: string[], b: string[]): boolean {
  const x = [...new Set(a)].sort(), y = [...new Set(b)].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * ส่งใหม่หลังถูกตีกลับ ช่างเปลี่ยนอะไรไปอย่างน้อยหนึ่งอย่างหรือยัง
 *
 * กันแค่ "กดส่งซ้ำทั้งที่ยังไม่ได้แก้" (ใบวนกลับไปหา Admin Spare Part พร้อมของเดิมที่เพิ่งถูกตีกลับ) — ไม่ใช่ตัวตรวจคุณภาพ
 * เติมจุดเดียวก็ผ่าน · ค่าเดิมถูกจริงให้ช่างกด "ค่าเดิมถูกแล้ว" แล้วอธิบาย (คนเรียกตรวจเรื่องนั้นเอง ไม่ใช่ที่นี่)
 * นับเป็นการแก้: แนบหลักฐานเคลมของชิ้นนี้ (หรือของเครื่องที่ไม่ผูกชิ้น) / รูปป้ายรุ่นใหม่ หลังถูกตีกลับ ·
 * ข้อความสามช่องต่างจากเดิม · Troubleshooting ต่าง · ค่าป้ายรุ่นต่าง · Error ต่าง · ข้อเช็คตาม Error ต่าง
 * (ข้อเช็คนับด้วย — เหตุผลตีกลับ "ไม่ได้เช็คตามคู่มือ" ช่างแก้ด้วยการติ๊กเพิ่ม ถ้าไม่นับจะส่งไม่ได้ทั้งที่แก้แล้ว)
 */
export function changedSinceReject(prior: ClaimRejectedRow, next: ClaimResubmit, files: ClaimFileLite[]): boolean {
  const rejectedAt = prior.reviewedAt ?? prior.createdAt;
  const newFile = files.some(
    (f) =>
      f.createdAt > rejectedAt &&
      (f.role === "NAMEPLATE" ||
        ((CLAIM_EVIDENCE_ROLES as readonly string[]).includes(f.role ?? "") && partMatches(prior, f)))
  );
  if (newFile) return true;
  if ((prior.brokenPartCode ?? "").trim() !== next.brokenPartCode.trim()) return true;
  if (prior.symptom.trim() !== next.symptom.trim()) return true;
  if (prior.checkNote.trim() !== next.checkNote.trim()) return true;
  if (!sameSet(prior.troubleshooting, next.troubleshooting)) return true;
  const was = plateOf(prior.nameplate), now = next.plate.filter((f) => f.value.trim());
  if (was.length !== now.length || now.some((f) => was.find((w) => w.key === f.key)?.value !== f.value.trim())) return true;
  const fc = (prior.fieldCheck ?? null) as { errorCode?: unknown; checked?: unknown } | null;
  if (String(fc?.errorCode ?? "") !== (next.errorCode ?? "")) return true;
  const checked = fc?.checked;
  if (!sameSet(Array.isArray(checked) ? checked.map(String) : [], next.errorChecked)) return true;
  return false;
}

/** แถวเคลมเท่าที่การ์ดงานของช่าง/แถบสถานะเคลมใช้ */
export interface ClaimVerdictRow extends ClaimRowLite {
  partName: string;
  rejectReason: string | null;
  reviewedAt: Date | null;
  reviewedById: number | null;
  /** ตีกลับแบบชี้ช่อง (ก้อน 4) — ไม่ส่งมา = ไม่มีช่อง (ตีกลับแบบเดิม) */
  reviewFlags?: string[];
  /** ยี่ห้อ + Error ตอนส่ง — ตั้งชื่อช่องวิดีโอ Error ให้ตรงกับเครื่อง (ไม่ส่งมา = ชื่อตั้งต้น) */
  brand?: string | null;
  fieldCheck?: unknown;
}

/** ประวัติเคลมเท่าที่แถบสถานะใช้ — ชื่อคนกดมากับประวัติ */
export interface ClaimTrailLog extends ClaimLogLite {
  userName: string | null;
}

/**
 * เหตุการณ์ของแถบสถานะเคลม (ส่งเคลม → ตีกลับ → ส่งใหม่ → อนุมัติ) ตามแบบที่เจ้าของงานอนุมัติ (strip)
 * k: send ส่งครั้งแรก · resend ส่งใหม่ · reject ตีกลับ · approve อนุมัติ · close ปิดงานโดยไม่มีชิ้นที่ส่งผู้ขาย
 * who = ช่างที่กดส่ง / Admin Spare Part ที่ตัดสิน · what = ชิ้นที่ถูกตีกลับ (ชื่ออะไหล่คั่นด้วย ", " · ตีกลับทั้งใบ = "ทั้งใบ") หรือเหตุที่ปิด
 */
export interface ClaimTrailEvent {
  k: "send" | "resend" | "reject" | "approve" | "close";
  at: Date;
  who: string | null;
  what?: string;
}

/**
 * แถบสถานะเคลมของงานซ่อมครั้งนี้ — คิดที่เซิร์ฟเวอร์ที่เดียว การ์ดงานของช่าง หน้าตรวจ และการ์ดเคลมอ่านชุดเดียวกัน
 *
 * ส่ง/ส่งใหม่อ่านจากประวัติ CLAIM_SUBMITTED (คนกดคือช่างที่ส่งจริง) · การตัดสินอ่านจากแถวเคลม จับกลุ่มตามเวลาตัดสิน
 * (การตัดสินครั้งเดียวเขียนเวลาเดียวกันทุกแถว) จึงรู้ได้ตรง ๆ ว่าครั้งนั้นตีกลับชิ้นไหน ไม่ต้องเดาจากข้อความประวัติ
 *
 * ตั้งแต่ตัดสินทีละชิ้น (ก้อน 3) การตัดสินครั้งเดียวมีหลายผลปนกัน — นับเป็นเหตุการณ์เดียวตามผลต่อใบงาน:
 * มีชิ้นถูกตีกลับ = "ตีกลับ" (ใบกลับไปหาช่าง ชิ้นที่ผ่านพร้อมกันยังไม่ทำให้ใบอนุมัติ) · ไม่มี = ใบปิด —
 * "อนุมัติ" ถ้ามีชิ้นที่ผ่านแล้ว (รวมชิ้นที่ผ่านไปตั้งแต่รอบก่อน = มีใบเคลมไปผู้ขาย) ไม่งั้น "ปิดงาน (ปิดเคลม ไม่ส่งผู้ขาย)"
 * เดิมจับกลุ่มแยกตามสถานะ ใบที่ "ชิ้น ก. ผ่าน ชิ้น ข. ตีกลับ" จะขึ้นทั้งตีกลับและอนุมัติเวลาเดียวกัน ทั้งที่ใบยังไม่จบ
 * rows/logs ที่ส่งมาต้องตัดเหลือเฉพาะงานซ่อมครั้งนี้แล้ว (lockSince)
 */
export function claimTrail(
  rows: ClaimVerdictRow[],
  logs: ClaimTrailLog[],
  labelOf: (r: ClaimVerdictRow) => string,
  nameOf: (userId: number | null) => string | null
): ClaimTrailEvent[] {
  const events: ClaimTrailEvent[] = [];
  const sends = logs.filter((l) => l.action === "CLAIM_SUBMITTED").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  sends.forEach((l, i) => events.push({ k: i === 0 ? "send" : "resend", at: l.createdAt, who: l.userName }));
  const byTime = new Map<number, ClaimVerdictRow[]>();
  for (const r of rows) {
    if (!r.reviewedAt || !["REJECTED", "APPROVED", "DECLINED"].includes(r.status)) continue;
    const t = r.reviewedAt.getTime();
    byTime.set(t, [...(byTime.get(t) ?? []), r]);
  }
  for (const [t, group] of byTime) {
    const at = group[0].reviewedAt!;
    const who = nameOf(group[0].reviewedById);
    const rejected = group.filter((r) => r.status === "REJECTED").sort((a, b) => a.id - b.id);
    if (rejected.length) {
      // ตีกลับทั้งใบ (มีช่องของเครื่อง) เรียกว่า "ทั้งใบ" แบบตัวอย่าง strip — กติกาเดียวกับ claimTrailOf ฝั่งแอป
      // การ์ดของช่างอ่านแถบนี้ ส่วนหน้าใบงานกับหน้าตรวจคิดเอง ถ้าไล่ชื่อทุกชิ้นที่ถูกพาไปด้วย เหตุการณ์เดียวจะเขียนสองแบบ
      const whole = rejected.some((r) => (r.reviewFlags ?? []).some(isMachineFlag));
      events.push({ k: "reject", at, who, what: whole ? "ทั้งใบ" : rejected.map(labelOf).join(", ") });
    } else if (rows.some((r) => r.status === "APPROVED" && r.reviewedAt && r.reviewedAt.getTime() <= t)) {
      events.push({ k: "approve", at, who });
    } else {
      events.push({ k: "close", at, who, what: "ปิดเคลม ไม่ส่งผู้ขาย" });
    }
  }
  // เวลาเท่ากัน (ไม่ควรเกิด) เรียงตามลำดับขั้น: ส่ง → ตัดสิน
  const order = { send: 0, resend: 0, reject: 1, approve: 2, close: 3 } as const;
  return events.sort((a, b) => a.at.getTime() - b.at.getTime() || order[a.k] - order[b.k]);
}

/**
 * ชิ้นที่ถูกตีกลับในการตรวจครั้งล่าสุด (เวลาตัดสินเดียวกัน) — ไม่ใช่ทุกชิ้นที่แถวล่าสุดยังเป็น "ตีกลับ"
 * ชิ้นที่ช่างเลิกส่งเคลมไปแล้ว (ปิดสวิตช์ตอนส่งใหม่) แถวล่าสุดค้างเป็นตีกลับของรอบเก่าตลอด — ถ้านับด้วย
 * การ์ด/แถบแดงจะบอก "ต้องแก้ 2 ชิ้น" พร้อมเหตุผลเก่า ขณะที่ฟอร์มปิดงานบอกชิ้นเดียว
 * latest = แถวล่าสุดของแต่ละชิ้น (latestPerPart) ในงานซ่อมครั้งนี้
 */
export function lastRejected<R extends ClaimVerdictRow>(latest: R[]): R[] {
  const rejected = latest.filter((r) => r.status === "REJECTED");
  if (!rejected.length) return [];
  const last = Math.max(...rejected.map((r) => r.reviewedAt?.getTime() ?? 0));
  return rejected.filter((r) => (r.reviewedAt?.getTime() ?? 0) === last);
}

/** เรียงชิ้นตามที่ส่งครั้งแรก (id แรกของชิ้นนั้น) — ลำดับชิ้นบนจอไม่สลับเมื่อชิ้นหนึ่งถูกตีกลับแล้วส่งใหม่ */
function byFirstSent<R extends ClaimRowLite>(latest: R[], rows: ClaimRowLite[]): R[] {
  const first = new Map<string, number>();
  for (const r of rows) first.set(claimKey(r), Math.min(first.get(claimKey(r)) ?? r.id, r.id));
  return [...latest].sort((a, b) => (first.get(claimKey(a)) ?? a.id) - (first.get(claimKey(b)) ?? b.id));
}

/**
 * สรุปเคลมของงานหนึ่งใบสำหรับการ์ด "งานของฉันวันนี้" (GET /my-day · claim)
 *
 * state: REVIEW ส่งแล้วรอ Admin Spare Part · REJECTED ถูกตีกลับรอช่างแก้ (ใบกลับมาอยู่ขั้นกำลังซ่อม) ·
 * APPROVED อนุมัติแล้วปิดงาน · DECLINED ปิดเคลมไม่ส่งผู้ขายทุกชิ้น · null ไม่มีเคลมในงานซ่อมครั้งนี้
 * (ใบที่ถูกตีกลับแล้วช่างปิดโดยไม่ส่งเคลมใหม่ = null — การ์ดต้องไม่ขึ้นปุ่ม "แก้เคลม" บนใบที่ปิดแล้ว)
 * parts = จำนวนชิ้นในสถานะนั้น · round = ส่งรอบที่เท่าไหร่ (จำนวนครั้งที่ส่งของชิ้นที่ส่งมากสุด — 2 ชิ้นถูกตีกลับครั้งเดียว = รอบ 2 ไม่ใช่ 3)
 * reasons = ทุกชิ้นที่ถูกตีกลับในการตรวจครั้งล่าสุด (การ์ดแสดงครบทุกชิ้น ไม่ใช่ชิ้นบนสุด)
 */
export function claimSummary(
  status: string,
  rows: ClaimVerdictRow[],
  logs: ClaimTrailLog[],
  labelOf: (r: ClaimVerdictRow) => string,
  nameOf: (userId: number | null) => string | null
) {
  const latest = byFirstSent([...latestPerPart(rows).values()], rows);
  const has = (s: string) => latest.some((r) => r.status === s);
  // ใบที่ปิดแล้ว ชิ้นที่ยังค้างเป็นตีกลับคือชิ้นที่ช่างเลิกส่งเคลมไป — ไม่ใช่ผลของใบ (ปิดเคลมชิ้นเดียวที่เหลือ = ปิดเคลมทั้งใบ)
  const live = latest.filter((r) => r.status !== "REJECTED");
  const state: "REVIEW" | "REJECTED" | "APPROVED" | "DECLINED" | null = !latest.length
    ? null
    : status === "CLAIM_REVIEW"
      ? "REVIEW"
      : status === "IN_PROGRESS" && has("REJECTED")
        ? "REJECTED"
        : status === "DONE" && has("APPROVED")
          ? "APPROVED"
          : status === "DONE" && live.length > 0 && live.every((r) => r.status === "DECLINED")
            ? "DECLINED"
            : null;
  const rowStatus = { REVIEW: "PENDING", REJECTED: "REJECTED", APPROVED: "APPROVED", DECLINED: "DECLINED" } as const;
  const inState = state ? latest.filter((r) => r.status === rowStatus[state]) : [];
  // ตีกลับ = เฉพาะชิ้นที่ถูกตีกลับในการตรวจครั้งล่าสุด (ดู lastRejected · กติกาเดียวกับ rejectedRows ฝั่งแอป)
  const set = state === "REJECTED" ? lastRejected(latest) : inState;
  const sent = new Map<string, number>();
  for (const r of rows) sent.set(claimKey(r), (sent.get(claimKey(r)) ?? 0) + 1);
  const max = (ds: (Date | null)[]) =>
    ds.reduce<Date | null>((m, d) => (d && (!m || d > m) ? d : m), null);
  const lastReviewed = set
    .filter((r) => r.reviewedAt)
    .sort((a, b) => b.reviewedAt!.getTime() - a.reviewedAt!.getTime())[0];
  return {
    state,
    parts: set.length,
    round: Math.max(0, ...(set.length ? set : latest).map((r) => sent.get(claimKey(r)) ?? 0)),
    sentAt: max(set.map((r) => r.createdAt)),
    rejectedAt: max(rows.filter((r) => r.status === "REJECTED").map((r) => r.reviewedAt)),
    reviewerName: lastReviewed ? nameOf(lastReviewed.reviewedById) : null,
    /**
     * fields = ช่างต้องแก้ทั้งหมดกี่ช่อง ("ต้องแก้ {n} ชิ้น · {m} ช่อง") · needsSite = ต้องกลับไปถ่ายที่หน้าเครื่องไหม
     * (null = ตีกลับแบบเดิมไม่มีช่อง ระบบไม่รู้) · whole = ชื่อช่องของเครื่องที่ถูกชี้ (ตีกลับทั้งใบ) — ดู rejectFieldsSummary
     */
    ...(state === "REJECTED"
      ? rejectFieldsSummary(
          set.map((r) => ({ ...r, reviewFlags: r.reviewFlags ?? [] })),
          (r, k) => reviewFlagLabel(k, flagContextOf(r))
        )
      : { fields: 0, needsSite: null, whole: null }),
    // fieldLabels ต่อชิ้น = ชื่อช่องของชิ้นนั้นที่ผู้ตรวจติ๊กเอง (ไม่รวมช่องของเครื่อง — อยู่ใน whole ครั้งเดียว)
    reasons:
      state === "REJECTED"
        ? set.map((r) => ({
            partLabel: labelOf(r),
            reason: r.rejectReason ?? "",
            fieldLabels: (r.reviewFlags ?? []).filter(isPartFlag).map((k) => reviewFlagLabel(k, flagContextOf(r))),
          }))
        : [],
    trail: claimTrail(rows, logs, labelOf, nameOf),
    /**
     * ชิ้นที่จบแล้วในงานซ่อมครั้งนี้ (ผ่าน · ปิดเคลม ไม่ส่งผู้ขาย) — การ์ดที่ปิดแล้วเขียน "อนุมัติ n ชิ้น: …" และ
     * "ปิดเคลม ไม่ส่งผู้ขาย: {ชิ้น} ({เหตุผล})" · การ์ดที่ยังไม่จบเห็นชิ้นที่ล็อกไว้แล้ว ไม่ต้องเดาจากจำนวน
     */
    outcome: latest
      .filter((r) => r.status === "APPROVED" || r.status === "DECLINED")
      .map((r) => ({
        partLabel: labelOf(r),
        status: r.status as "APPROVED" | "DECLINED",
        ...(r.status === "DECLINED" ? { reason: r.rejectReason ?? "" } : {}),
      })),
  };
}

// ── ก้อน 3: ตัดสินทีละชิ้น ─────────────────────────────

/**
 * ชิ้นที่ล็อกแล้วในงานซ่อมครั้งนี้ = แถวล่าสุดของชิ้นนั้น "ผ่าน" หรือ "ปิดเคลม ไม่ส่งผู้ขาย"
 *
 * ชิ้นที่ผ่านแล้วต้องไม่ถูกส่งซ้ำ (ใบเคลมที่อนุมัติอาจออกไปถึงผู้ขายแล้ว — ส่งซ้ำคือเคลมชิ้นเดียวสองครั้ง)
 * ชิ้นที่ปิดเคลมแล้วคือ Admin Spare Part ตัดสินว่าส่งผู้ขายไม่ได้ — ไม่วนกลับมาหาช่างอีก
 * rows ต้องตัดเหลือเฉพาะงานซ่อมครั้งนี้แล้ว (lockSince) — จ่ายงานใหม่หลัง "แจ้งปัญหาหน้างาน"/ย้อนขั้นยังเป็นการซ่อมครั้งเดิม
 * ชิ้นจึงยังล็อกอยู่ · เปิดใบใหม่ (REOPENED) คือซ่อมครั้งใหม่ ชิ้นเดิมเคลมได้อีก
 */
export function lockedParts<R extends ClaimRowLite>(rows: R[]): R[] {
  return [...latestPerPart(rows).values()].filter((r) => r.status === "APPROVED" || r.status === "DECLINED");
}

/**
 * แถวที่ผ่านล่าสุดในงานซ่อมครั้งนี้ — ข้อมูลเครื่อง (ป้ายรุ่น · Error) ล็อกไปพร้อมชิ้นแรกที่ผ่าน (ตัวอย่าง mLocked)
 * ใบเคลมที่อนุมัติออกไปพร้อมค่าป้าย/Error ชุดนี้แล้ว ถ้าชิ้นที่ส่งใหม่ใช้ค่าอีกชุด ผู้ขายจะได้ใบเคลมสองใบของเครื่องเดียวกัน
 * ที่ข้อมูลเครื่องไม่ตรงกัน · ไม่มี = ยังไม่ล็อก
 */
export function machineLockRow<R extends ClaimRowLite>(rows: R[]): R | null {
  let best: R | null = null;
  for (const r of rows) if (r.status === "APPROVED" && (!best || newer(r, best))) best = r;
  return best;
}

/**
 * สถานะเคลมของใบสำหรับป้ายในรายการใบงาน (และตัวกรอง "ใบงานเคลม")
 *
 * ทำไมไม่อ่านแถวบนสุด: ตั้งแต่ตัดสินทีละชิ้น แถวของการส่งครั้งเดียวกันได้ผลต่างกัน และเวลาเท่ากัน —
 * ใบที่ "ชิ้น ก. ผ่าน ชิ้น ข. ตีกลับ" ป้ายจะสลับเขียว/แดงตามลำดับที่ฐานข้อมูลคืนมา
 * กติกา: รอตรวจ → PENDING · ใบยังไม่จบและมีชิ้นค้างตีกลับ → REJECTED (รอช่างแก้ เรื่องที่ต้องเห็นก่อน)
 * · มีชิ้นผ่าน → APPROVED · ปิดเคลมทุกชิ้น → DECLINED · มีตีกลับ → REJECTED · อื่น ๆ = สถานะแถวล่าสุด
 * ใบที่ปิดแล้ว ชิ้นที่ค้างตีกลับคือชิ้นที่ช่างเลิกส่ง (ไม่ใช่ผลของใบ) จึงไม่ทำให้ใบที่ปิดเคลมชิ้นที่เหลือกลายเป็นป้ายแดง
 * "ยังไม่จบ" = ทุกขั้นที่ไม่ใช่ปิด/ยกเลิก — ถูกตีกลับแล้ว "แจ้งปัญหาหน้างาน" ใบกลับไปขั้นอะไหล่ เคลมก็ยังรอช่างแก้อยู่
 * rows ต้องตัดเหลือเฉพาะงานซ่อมครั้งนี้แล้ว (lockSince) · ว่าง = ใบนี้ไม่ได้แจ้งเคลม (null)
 */
export function aggregateClaimStatus(orderStatus: string, rows: ClaimRowLite[]): string | null {
  if (!rows.length) return null;
  if (orderStatus === "CLAIM_REVIEW") return "PENDING";
  const latest = [...latestPerPart(rows).values()];
  const open = orderStatus !== "DONE" && orderStatus !== "CANCELLED";
  const live = open ? latest : latest.filter((r) => r.status !== "REJECTED");
  if (open && latest.some((r) => r.status === "REJECTED")) return "REJECTED";
  if (live.some((r) => r.status === "APPROVED")) return "APPROVED";
  if (live.length && live.every((r) => r.status === "DECLINED")) return "DECLINED";
  if (latest.some((r) => r.status === "REJECTED")) return "REJECTED";
  return rows.reduce((a, b) => (newer(b, a) ? b : a)).status;
}

/**
 * สถานะเคลมของงานซ่อมครั้งนี้ทีละชิ้น (detail.claimRound) — สิ่งเดียวที่หน้าจออ่านเพื่อตอบว่า "ใบนี้อยู่ในรอบที่ถูกตีกลับไหม ·
 * ชิ้นไหนล็อกแล้ว · ข้อมูลเครื่องล็อกหรือยัง" แทนการอ่าน claims[0] สี่ที่ (แถวบนสุดบอกได้แค่ชิ้นเดียว — ใบที่ ก. ผ่าน ข. ตีกลับ
 * เรียง ก. ขึ้นก่อนได้ แล้วแถบแดง การ์ดผลงานรอบที่ถูกตีกลับ และค่าที่ฟอร์มปิดงานเติมให้ หายไปพร้อมกัน)
 *
 * parts = แถวล่าสุดของแต่ละชิ้น เรียงตามที่ส่งครั้งแรก · round = ส่งรอบที่เท่าไหร่ของชิ้นนั้น
 * rejected = ใบยังไม่จบ (ไม่ใช่รอตรวจ/ปิด/ยกเลิก) และมีชิ้นค้างตีกลับ · rejectedIds = ชิ้นที่ถูกตีกลับในการตรวจครั้งล่าสุด
 * (แถบแดงแสดงชุดนี้ — ชิ้นที่ช่างเลิกส่งไปแล้วค้างตีกลับของรอบเก่า ไม่ใช่เรื่องที่ต้องแก้ตอนนี้)
 * lockedMachine = ข้อมูลเครื่องล็อกพร้อมชิ้นที่ผ่านแล้ว (ชื่อชิ้น) · ยังไม่มีชิ้นผ่าน = null
 * logs = ประวัติของใบ (อย่างน้อย REOPENED) ใช้หาจุดเริ่มงานซ่อมครั้งนี้
 */
export function claimRoundPayload(
  orderStatus: string,
  rows: ClaimVerdictRow[],
  logs: ClaimLogLite[],
  labelOf: (r: ClaimVerdictRow) => string
) {
  const since = lockSince(logs);
  const inRepair = rows.filter((r) => !since || r.createdAt >= since);
  const latest = byFirstSent([...latestPerPart(inRepair).values()], inRepair);
  const open = !["CLAIM_REVIEW", "DONE", "CANCELLED"].includes(orderStatus);
  const approved = latest.filter((r) => r.status === "APPROVED");
  return {
    since,
    parts: latest.map((r) => ({
      sparePartId: r.sparePartId,
      claimId: r.id,
      status: r.status,
      round: claimRoundOf(r, inRepair, since),
      partCode: r.partCode,
      partLabel: labelOf(r),
      // เหตุผลตีกลับ/ปิดเคลม ของแถวนี้ — ชิ้นที่ล็อกขึ้น "ปิดเคลม ไม่ส่งผู้ขาย (รอบ r) — {เหตุผล}" ได้โดยไม่ต้องหาแถวเอง
      reason: r.rejectReason,
      reviewedAt: r.reviewedAt,
    })),
    rejected: open && latest.some((r) => r.status === "REJECTED"),
    rejectedIds: open ? lastRejected(latest).map((r) => r.id) : [],
    lockedMachine: approved.length ? { byParts: approved.map(labelOf) } : null,
  };
}

// ── ก้อน 4: ตีกลับแบบชี้ช่อง ─────────────────────────────

type PlateFamily = "ALLIANCE" | "OASIS" | "OTHER";

const FLAG_BY_KEY = new Map(CLAIM_REVIEW_FLAGS.map((f) => [f.key, f]));

/** ช่องของเครื่อง (ใช้ร่วมทุกชิ้น) — ติ๊กแล้วตีกลับทั้งใบ */
export function isMachineFlag(key: string): boolean {
  return FLAG_BY_KEY.get(key)?.scope === "MACHINE";
}

/** ช่องของอะไหล่ชิ้นนั้น */
export function isPartFlag(key: string): boolean {
  return FLAG_BY_KEY.get(key)?.scope === "PART";
}

/** แบบป้ายของยี่ห้อ (กติกาเดียวกับป้ายที่ช่างสแกน) — บอกว่าเครื่องนี้มีช่องไหนให้ติ๊ก */
export function plateFamilyOf(make: string | null | undefined): PlateFamily {
  return plateTemplateFor(make).family;
}

/**
 * ช่องที่ติ๊กได้กับเครื่องแบบนี้ — Oasis ไม่มี Serial บนป้าย (ใช้ "ข้อมูลป้ายรุ่น" แทน) และไม่มีคู่มือ Error
 * ติ๊กช่องที่เครื่องไม่มี ช่างแก้ไม่ได้ (ไม่มีช่องนั้นในฟอร์ม) ใบจะวนอยู่ระหว่างช่างกับผู้ตรวจ จึงปฏิเสธตั้งแต่ตอนตีกลับ
 */
export function reviewFlagsFor(family: PlateFamily) {
  return CLAIM_REVIEW_FLAGS.filter((f) => f.families.includes(family));
}

/**
 * ชื่อช่องที่คนอ่าน — ใช้ทั้งข้อความปฏิเสธ · ประวัติ · เหตุผลที่เขียนแทน · การ์ดงานของช่าง ให้เรียกเหมือนกันทุกที่
 * วิดีโอ Error ของเครื่องที่ไม่มี Error ให้ถ่าย (Oasis · เลือก "ไม่มี Error ขึ้น") เรียก "วิดีโออาการตอนเครื่องเดิน"
 * (คำตอบข้อ 4 ของเจ้าของงาน) — ถ้าเขียนว่าวิดีโอ Error ช่างจะไปหาจอที่ขึ้นรหัสซึ่งไม่มีอยู่จริง
 */
export function reviewFlagLabel(key: string, ctx: { family?: string | null; errorCode?: string | null } = {}): string {
  const f = FLAG_BY_KEY.get(key);
  if (!f) return key;
  if (f.altLabel && (ctx.family === "OASIS" || ctx.errorCode === NO_ERROR_CODE)) return f.altLabel;
  return f.label;
}

/** ต้องกลับไปถ่ายที่หน้าเครื่องไหม — มีช่องที่เป็นไฟล์ (รูป/วิดีโอ) อย่างน้อยหนึ่งช่อง */
export function flagsNeedSite(flags: string[]): boolean {
  return flags.some((k) => FLAG_BY_KEY.get(k)?.site === true);
}

/** Error code + แบบป้ายของแถวเคลม — ใช้ตั้งชื่อช่องวิดีโอ Error ให้ตรงกับที่ช่างเห็นในฟอร์ม */
export function flagContextOf(row: { brand?: string | null; fieldCheck?: unknown }) {
  const fc = (row.fieldCheck ?? null) as { errorCode?: unknown } | null;
  return { family: plateFamilyOf(row.brand), errorCode: typeof fc?.errorCode === "string" ? fc.errorCode : null };
}

/**
 * เหตุผลที่เขียนแทนเมื่อผู้ตรวจติ๊กช่องแต่ไม่พิมพ์เหตุผล — rejectReason ยังมีข้อความเสมอ
 * ประวัติเคลม · Excel · ใบงานเก่าในแอป อ่านแค่ rejectReason ถ้าว่าง คนที่เปิดดูจะเห็นแถวตีกลับที่ไม่มีเหตุผล
 * รูปแบบตามตัวอย่าง: "{ช่อง} ต้องแก้" · ชิ้นที่ถูกตีกลับเพราะข้อมูลเครื่องอย่างเดียว "ทั้งใบ (ข้อมูลเครื่อง) — {ช่อง} ต้องแก้"
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
 * ช่องที่ถูกชี้นี้ ช่างแก้แล้วหรือยัง (ส่งใหม่หลังถูกตีกลับแบบชี้ช่อง) — prior = แถวที่ถูกตีกลับ · next = ค่าที่จะเก็บรอบนี้
 *
 * ไฟล์ = แนบใหม่หลังเวลาตีกลับ (ไฟล์ใหม่แทนไฟล์เดิม) · ของชิ้นนั้น หรือของเครื่อง (วิดีโอ Error/รูปอาการ ชิ้นไหนก็ได้)
 * ค่า = ต่างจากที่ส่งรอบที่ถูกตีกลับ (ตัดช่องว่างแล้ว) · ป้ายรุ่น: ค่าต่าง หรือถ่ายป้ายใหม่ (อ่านค่าใหม่จากรูปใหม่)
 * ช่างเข้าเช็คอะไรบ้าง = ข้อความ · Troubleshooting · ข้อเช็คตาม Error อย่างใดอย่างหนึ่งเปลี่ยน
 * กันแค่ "ส่งของเดิมกลับไปโดยไม่ตั้งใจ" ไม่ใช่ตัวตรวจคุณภาพ — ค่าเดิมถูกจริงให้ตอบ "ค่าเดิมถูกแล้ว" (คนเรียกตรวจเอง)
 */
export function flagSatisfied(
  flag: string,
  prior: ClaimRejectedRow,
  next: ClaimResubmit,
  files: ClaimFileLite[]
): boolean {
  const rejectedAt = prior.reviewedAt ?? prior.createdAt;
  const newFile = (role: string, anyPart: boolean) =>
    files.some((f) => f.role === role && f.createdAt > rejectedAt && (anyPart || f.sparePartId === prior.sparePartId));
  const was = new Map(plateOf(prior.nameplate).map((f) => [f.key, f.value]));
  const now = new Map(next.plate.filter((f) => f.value.trim()).map((f) => [f.key, f.value.trim()]));
  const newPlate = newFile("NAMEPLATE", true);
  const fc = (prior.fieldCheck ?? null) as { errorCode?: unknown; checked?: unknown } | null;
  switch (flag) {
    case "CLAIM_PART":
    case "CLAIM_CHECK_VIDEO":
      return newFile(flag, false);
    case "CLAIM_ERROR_VIDEO":
    case "CLAIM_SYMPTOM":
      return newFile(flag, true);
    case "BROKEN_CODE":
      return (prior.brokenPartCode ?? "").trim() !== next.brokenPartCode.trim();
    case "SYMPTOM":
      return prior.symptom.trim() !== next.symptom.trim();
    case "CHECKS":
      return (
        prior.checkNote.trim() !== next.checkNote.trim() ||
        !sameSet(prior.troubleshooting, next.troubleshooting) ||
        !sameSet(Array.isArray(fc?.checked) ? fc.checked.map(String) : [], next.errorChecked)
      );
    case "MODEL":
    case "SERIAL": {
      const key = flag === "MODEL" ? "model" : "serial";
      return newPlate || (was.get(key) ?? "") !== (now.get(key) ?? "");
    }
    case "PLATE_OTHER": {
      if (newPlate) return true;
      const keys = new Set([...was.keys(), ...now.keys()].filter((k) => k !== "model"));
      return [...keys].some((k) => (was.get(k) ?? "") !== (now.get(k) ?? ""));
    }
    case "ERROR_CODE":
      return String(fc?.errorCode ?? "") !== (next.errorCode ?? "");
    default:
      return false;
  }
}

/**
 * สรุปช่องที่ต้องแก้ของการตีกลับครั้งล่าสุด สำหรับการ์ดงานของช่าง (my-day · claim)
 * rejected = ชิ้นที่ถูกตีกลับในการตรวจครั้งล่าสุด (lastRejected) · labelOf = ชื่อช่องตามเครื่องของแถวนั้น
 *
 * fields = จำนวนช่อง: ช่องของชิ้นนับทุกชิ้น · ช่องของเครื่องนับครั้งเดียว (ติดทุกแถวของการตีกลับทั้งใบ แต่แก้ครั้งเดียว)
 * needsSite = มีช่องที่เป็นไฟล์ → ต้องกลับไปถ่ายที่หน้าเครื่อง · ตีกลับแบบเดิม (ไม่มีช่อง) ปนอยู่ = ไม่รู้ (null)
 *   ช่างต้องรู้ก่อนออกจากบ้านว่าต้องไปร้านไหม — บอกว่า "แก้จากมือถือได้" ทั้งที่เหตุผลแบบข้อความอาจขอรูปใหม่ไม่ได้
 * whole = ชื่อช่องของเครื่องที่ถูกชี้ (ตีกลับทั้งใบ) · ไม่มี = null
 */
export function rejectFieldsSummary<R extends { reviewFlags: string[] }>(
  rejected: R[],
  labelOf: (r: R, key: string) => string
) {
  const machine = new Map<string, string>();
  let partFields = 0;
  for (const r of rejected) {
    for (const k of new Set(r.reviewFlags)) {
      if (isMachineFlag(k)) {
        if (!machine.has(k)) machine.set(k, labelOf(r, k));
      } else if (isPartFlag(k)) partFields += 1;
    }
  }
  const all = rejected.flatMap((r) => r.reviewFlags);
  const legacy = rejected.some((r) => !r.reviewFlags.some((k) => FLAG_BY_KEY.has(k)));
  const order = CLAIM_REVIEW_FLAGS.map((f) => f.key);
  return {
    fields: partFields + machine.size,
    needsSite: flagsNeedSite(all) ? true : legacy || !rejected.length ? null : false,
    whole: machine.size ? [...machine.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([, l]) => l) : null,
  };
}
