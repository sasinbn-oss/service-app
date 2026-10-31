/**
 * ร่างฟอร์มปิดงานของใบหนึ่งใบ (คีย์ close:<id>) — ข้อความที่พิมพ์ค้าง + ข้อความเคลมทีละชิ้น + ค่าป้ายรุ่น
 *
 * ทำไมต้องจำมากกว่าสรุปงาน: ช่างพิมพ์อาการ/สิ่งที่เช็คของเคลมยาวตอนยืนหน้าเครื่อง แล้วแอปหลุด เน็ตหลุด
 * หรือกดออกไปดูอย่างอื่น เดิมของเคลมหายหมด ต้องพิมพ์ใหม่ทั้งชุด (เจ้าของงานเลือกตัวอย่าง ต.ค. 69)
 * ไฟล์เคลมไม่อยู่ในร่าง — ส่งขึ้นเซิร์ฟเวอร์ทันทีที่เลือก (ClaimFileSlot) เปิดฟอร์มใหม่ก็เห็นจากใบงานเอง
 *
 * ทุกคีย์ไม่บังคับ: ร่างรุ่นเก่า ({ note, otherWorkers }) ยังอ่านได้ และร่างที่เสียอ่านไม่ได้ก็แค่ไม่จำ
 * ไม่ทำให้ฟอร์มพัง · ลบเมื่อปิดงานสำเร็จเท่านั้น
 */
import { clearDraft, loadDraft, saveDraft } from "./draft";
import type { PlateValue } from "./nameplate";

export interface ClaimPartDraft {
  on: boolean;
  brokenPartCode: string;
  symptom: string;
  checkNote: string;
  troubleshooting: string[];
  /** คำอธิบาย "ค่าเดิมถูกแล้ว" ที่กำลังพิมพ์ — null = ยังไม่ได้เปิดช่อง (มีเฉพาะชิ้นที่ถูกตีกลับ) */
  keep: string | null;
}

export interface CloseDraft {
  note?: string;
  otherWorkers?: string;
  /** คีย์ = sparePartId */
  claims?: Record<string, Partial<ClaimPartDraft>>;
  plate?: { values: Record<string, PlateValue> };
  check?: { errorCode: string | null; checked: string[] };
  /**
   * คำอธิบาย "ค่าเดิมถูกแล้ว" ทีละช่องที่ผู้ตรวจชี้ (เคลมก้อน 4) — คีย์ "m:{ช่อง}" ของเครื่อง · "p:{sparePartId}:{ช่อง}" ของชิ้น
   * null = เปิดช่องแล้วกดไม่ใช้ (ไม่เก็บก็ได้ แต่เก็บไว้ไม่ทำให้อะไรผิด)
   */
  fixKeep?: Record<string, string | null>;
  /**
   * สิ่งที่ฟอร์มบอกว่ายังขาดตอนบันทึกร่างครั้งล่าสุด — การ์ดในงานของฉันบอก "ยังขาด n อย่าง" จากตรงนี้
   * ฟอร์มเป็นคนนับ (รู้ทั้งไฟล์ในใบงานและที่พิมพ์ไว้) การ์ดไม่ต้องโหลดใบงานทั้งใบมานับซ้ำทีละใบ
   */
  missing?: string[];
  /** มีชิ้นที่ติ๊กส่งเคลมอยู่ — ข้อความบนการ์ดตอนกรอกครบแล้วบอกว่ากดแล้วจะส่งเคลมด้วย */
  claiming?: boolean;
}

export const closeDraftKey = (orderId: number) => `close:${orderId}`;

export async function loadCloseDraft(orderId: number): Promise<CloseDraft | null> {
  const raw = await loadDraft(closeDraftKey(orderId));
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as unknown;
    return d && typeof d === "object" && !Array.isArray(d) ? (d as CloseDraft) : null;
  } catch {
    return null;
  }
}

export function clearCloseDraft(orderId: number) {
  clearDraft(closeDraftKey(orderId));
}

/** สิ่งที่ยังขาดตามร่าง — null = ร่างรุ่นเก่าที่ไม่ได้นับไว้ (การ์ดไม่ขึ้นบรรทัดนี้ ดีกว่าบอกตัวเลขผิด) */
export function missingItems(d: CloseDraft | null): string[] | null {
  return d && Array.isArray(d.missing) ? d.missing.filter((x) => typeof x === "string") : null;
}

/**
 * บันทึกร่างแบบหน่วง 400 มิลลิวินาที — พิมพ์ต่อเนื่องไม่เขียนลงเครื่องทุกตัวอักษร
 * (ร่างมีภาพตัดป้ายรุ่นเป็น data URL ด้วย เขียนทุกตัวอักษรทำให้ช่องพิมพ์หน่วงบนมือถือรุ่นเก่า)
 * cancel ตอนปิดงานสำเร็จ — ไม่งั้นร่างที่ค้างในคิวถูกเขียนกลับมาหลังล้างไปแล้ว การ์ดขึ้น "กรอกค้างไว้" ทั้งที่ปิดงานแล้ว
 */
export function closeDraftSaver(orderId: number, wait = 400) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: CloseDraft | null = null;
  const write = () => {
    timer = null;
    if (pending) saveDraft(closeDraftKey(orderId), JSON.stringify(pending));
    pending = null;
  };
  return {
    save(d: CloseDraft) {
      pending = d;
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, wait);
    },
    /** เขียนที่ค้างอยู่ทันที (ปิดฟอร์มก่อนครบ 400 มิลลิวินาที) */
    flush() {
      if (timer) clearTimeout(timer);
      write();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
