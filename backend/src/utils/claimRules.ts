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
