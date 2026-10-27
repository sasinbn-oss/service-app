/**
 * จำลิงก์เปิดไฟล์กับรูปย่อของไฟล์แนบไว้ในเครื่อง (เจ้าของงานบ่นว่าไฟล์แนบโหลดช้ามาก ต.ค. 69)
 *
 * ลิงก์: เดิมกดดูไฟล์ไหนก็ถามเซิร์ฟเวอร์ขอลิงก์ของไฟล์นั้นก่อน (เซิร์ฟเวอร์อยู่ไกล รอราว 1 วินาทีทุกครั้ง)
 * ตอนนี้ขอของทุกไฟล์ในใบงานรวดเดียวเบื้องหลังตอนรายการไฟล์โหลดเสร็จ (GET /:id/attachments/links)
 * กดแล้วโหลดตัวไฟล์ได้ทันที · ลิงก์อายุ 2 ชั่วโมง จำไว้ 90 นาทีแล้วขอใหม่ เผื่อเวลาเปิดค้าง
 *
 * รูปย่อ: ไม่เคยเปลี่ยนหลังแนบ — รายการไฟล์โหลดใหม่บ่อย (แนบ/ลบ/กลับมาที่ใบงาน) ส่ง ?have= บอกว่ามีแล้ว
 * เซิร์ฟเวอร์จะไม่ส่งรูปย่อชุดเดิมซ้ำ (ใบที่มี 20 ไฟล์ = หลายร้อย KB ทุกรอบ)
 * อยู่ในหน่วยความจำเท่านั้น — ปิดแท็บแล้วหาย ไม่เก็บรูปลูกค้าค้างไว้ในเครื่อง
 */
import { api } from "../api/client";

const LINK_KEEP_MS = 90 * 60_000;

type Links = { at: number; urls: Record<number, string> };
const links = new Map<number, Links>();
const linkLoads = new Map<number, Promise<Record<number, string>>>();
const thumbs = new Map<number, string>();
/** รูปย่อของใบงานไหนจำไว้แล้วบ้าง — ส่ง ?have= ได้ตั้งแต่โหลดรายการครั้งแรกหลังกลับมาเปิดใบงานเดิม */
const thumbIds = new Map<number, Set<number>>();

/** ลิงก์ของทุกไฟล์ในใบงาน — คำขอเดียว · เรียกซ้ำระหว่างรอได้ ไม่ยิงซ้ำ */
export function prefetchLinks(workOrderId: number, force = false): Promise<Record<number, string>> {
  const have = links.get(workOrderId);
  if (!force && have && Date.now() - have.at < LINK_KEEP_MS) return Promise.resolve(have.urls);
  const pending = linkLoads.get(workOrderId);
  if (pending) return pending;
  const p = api
    .get<{ links: Record<string, string> }>(`/work-orders/${workOrderId}/attachments/links`, { loadingText: false })
    .then((res) => {
      const urls: Record<number, string> = {};
      for (const [k, v] of Object.entries(res.data.links)) urls[Number(k)] = v;
      links.set(workOrderId, { at: Date.now(), urls });
      return urls;
    })
    .finally(() => linkLoads.delete(workOrderId));
  linkLoads.set(workOrderId, p);
  return p;
}

/**
 * ลิงก์ของไฟล์เดียว — มีในชุดที่ขอไว้แล้วได้ทันที · ไม่มี (เพิ่งแนบหลังขอชุด) ขอชุดใหม่
 * ชุดใหม่ยังไม่มีอีก (ไฟล์เพิ่งขึ้นเสร็จ) ค่อยถามทีละไฟล์แบบเดิม
 */
export async function linkFor(workOrderId: number, attachmentId: number): Promise<string> {
  const cached = links.get(workOrderId);
  if (cached && Date.now() - cached.at < LINK_KEEP_MS && cached.urls[attachmentId]) return cached.urls[attachmentId];
  try {
    const urls = await prefetchLinks(workOrderId, !!cached);
    if (urls[attachmentId]) return urls[attachmentId];
  } catch {
    // ขอชุดไม่สำเร็จ — ลองทีละไฟล์ต่อ (ข้อความผิดพลาดจากทางนั้นบอกคนใช้ได้ตรงกว่า)
  }
  const res = await api.get<{ url: string }>(`/work-orders/${workOrderId}/attachments/${attachmentId}/link`);
  return res.data.url;
}

/** ไฟล์ถูกลบ/แนบเพิ่ม — ลิงก์ชุดเดิมไม่ครบแล้ว */
export function forgetLinks(workOrderId: number) {
  links.delete(workOrderId);
}

type ThumbRow = { id: number; thumbnailDataUrl: string | null; hasThumbnail?: boolean };

/** id ของรูปย่อของใบงานนี้ที่จำไว้แล้ว — ส่งเป็น ?have= */
export function haveThumbs(workOrderId: number): string | undefined {
  const ids = [...(thumbIds.get(workOrderId) ?? [])].filter((id) => thumbs.has(id));
  return ids.length ? ids.join(",") : undefined;
}

/** เติมรูปย่อที่เซิร์ฟเวอร์ไม่ได้ส่งมา (เพราะบอกไปว่ามีแล้ว) และจำรูปย่อใหม่ไว้ */
export function withThumbs<T extends ThumbRow>(workOrderId: number, rows: T[]): T[] {
  const ids = thumbIds.get(workOrderId) ?? new Set<number>();
  thumbIds.set(workOrderId, ids);
  return rows.map((r) => {
    if (r.thumbnailDataUrl) {
      thumbs.set(r.id, r.thumbnailDataUrl);
      ids.add(r.id);
      return r;
    }
    const kept = r.hasThumbnail ? thumbs.get(r.id) : undefined;
    return kept ? { ...r, thumbnailDataUrl: kept } : r;
  });
}
