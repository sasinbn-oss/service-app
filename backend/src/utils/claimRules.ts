/**
 * กติกาเคลมอะไหล่เก่าที่หลายที่ต้องตอบเหมือนกัน — ฟังก์ชันล้วน (ไม่แตะฐานข้อมูล) คนเรียกอ่านข้อมูลมาส่งให้เอง
 *
 * ทำไมแยกไฟล์: "ไฟล์ไหนคือหลักฐานของใบเคลมนี้" ถูกถามจากหลายที่ — กันลบไฟล์ที่ส่งไปแล้ว · หน้าตรวจเคลม ·
 * ใบเคลม PDF · ไฟล์ที่จะส่งผู้ขาย ถ้าแต่ละที่เขียนเงื่อนไขเอง วันหนึ่งจะตอบไม่ตรงกัน เช่น ระบบยอมให้ลบ
 * ไฟล์ที่ผู้ขายยังต้องได้รับ หรือ PDF ลงรายการไฟล์ที่แนบหลังส่งเคลมไปแล้ว — จึงมีคำตอบเดียวอยู่ที่นี่
 */
import { CLAIM_EVIDENCE_ROLES } from "./constants";

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
}

/** ประวัติเคลมเท่าที่แถบสถานะใช้ — ชื่อคนกดมากับประวัติ */
export interface ClaimTrailLog extends ClaimLogLite {
  userName: string | null;
}

/**
 * เหตุการณ์ของแถบสถานะเคลม (ส่งเคลม → ตีกลับ → ส่งใหม่ → อนุมัติ) ตามแบบที่เจ้าของงานอนุมัติ (strip)
 * k: send ส่งครั้งแรก · resend ส่งใหม่ · reject ตีกลับ · approve อนุมัติ · close ปิดงาน (ก้อนถัดไป: ปิดเคลมไม่ส่งผู้ขาย / ไม่ส่งเคลม)
 * who = ช่างที่กดส่ง / Admin Spare Part ที่ตัดสิน · what = ชิ้นที่ถูกตีกลับ (ชื่ออะไหล่คั่นด้วย ", ")
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
 * ส่ง/ส่งใหม่อ่านจากประวัติ CLAIM_SUBMITTED (คนกดคือช่างที่ส่งจริง) · ตีกลับ/อนุมัติอ่านจากแถวเคลม จับกลุ่มตามเวลาตัดสิน
 * (การตัดสินครั้งเดียวเขียนเวลาเดียวกันทุกแถว) จึงรู้ได้ตรง ๆ ว่าครั้งนั้นตีกลับชิ้นไหน ไม่ต้องเดาจากข้อความประวัติ
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
  for (const status of ["REJECTED", "APPROVED"] as const) {
    const byTime = new Map<number, ClaimVerdictRow[]>();
    for (const r of rows) {
      if (r.status !== status || !r.reviewedAt) continue;
      const t = r.reviewedAt.getTime();
      byTime.set(t, [...(byTime.get(t) ?? []), r]);
    }
    for (const group of byTime.values()) {
      const at = group[0].reviewedAt!;
      const who = nameOf(group[0].reviewedById);
      if (status === "REJECTED") events.push({ k: "reject", at, who, what: group.map(labelOf).join(", ") });
      else events.push({ k: "approve", at, who });
    }
  }
  // เวลาเท่ากัน (ไม่ควรเกิด) เรียงตามลำดับขั้น: ส่ง → ตัดสิน
  const order = { send: 0, resend: 0, reject: 1, approve: 2, close: 3 } as const;
  return events.sort((a, b) => a.at.getTime() - b.at.getTime() || order[a.k] - order[b.k]);
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
  const latest = [...latestPerPart(rows).values()];
  const has = (s: string) => latest.some((r) => r.status === s);
  const state: "REVIEW" | "REJECTED" | "APPROVED" | "DECLINED" | null = !latest.length
    ? null
    : status === "CLAIM_REVIEW"
      ? "REVIEW"
      : status === "IN_PROGRESS" && has("REJECTED")
        ? "REJECTED"
        : status === "DONE" && has("APPROVED")
          ? "APPROVED"
          : status === "DONE" && latest.every((r) => r.status === "DECLINED")
            ? "DECLINED"
            : null;
  const rowStatus = { REVIEW: "PENDING", REJECTED: "REJECTED", APPROVED: "APPROVED", DECLINED: "DECLINED" } as const;
  const inState = state ? latest.filter((r) => r.status === rowStatus[state]) : [];
  /**
   * ตีกลับ = เฉพาะชิ้นที่ถูกตีกลับในการตรวจครั้งล่าสุด (เวลาตัดสินเดียวกัน) ไม่ใช่ทุกชิ้นที่แถวล่าสุดยังเป็น "ตีกลับ"
   * ชิ้นที่ช่างเลิกส่งเคลมไปแล้ว (ปิดสวิตช์ตอนส่งใหม่) แถวล่าสุดค้างเป็นตีกลับของรอบเก่าตลอด — ถ้านับด้วย
   * การ์ดจะบอก "ต้องแก้ 2 ชิ้น" พร้อมเหตุผลเก่า ขณะที่ฟอร์มปิดงาน/แถบสถานะบอกชิ้นเดียว (กติกาเดียวกับ rejectedRows ฝั่งแอป)
   */
  const lastReject = state === "REJECTED" ? Math.max(...inState.map((r) => r.reviewedAt?.getTime() ?? 0)) : 0;
  const set = state === "REJECTED" ? inState.filter((r) => (r.reviewedAt?.getTime() ?? 0) === lastReject) : inState;
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
    reasons:
      state === "REJECTED"
        ? set.map((r) => ({ partLabel: labelOf(r), reason: r.rejectReason ?? "" }))
        : [],
    trail: claimTrail(rows, logs, labelOf, nameOf),
  };
}
