/**
 * ถังขยะใบงาน (เจ้าของงานตัดสิน 4 พ.ย. 69 — ตัวอย่างที่ตกลง) — ของที่หน้าใบงานกับหน้าถังขยะใช้ร่วมกัน
 *
 * ลบใบงาน = ย้ายไปถังขยะ เก็บ 30 วัน กู้คืนได้ครบ แล้วระบบลบจริงพร้อมรูปและวิดีโอ (backend/src/utils/trash.ts)
 */
import { api, apiErrorMessage } from "../api/client";
import { feedback } from "../components/Feedback";
import { runRefresh } from "../components/RefreshButton";
import { thaiDate } from "../components/DateField";
import { showAlert } from "./alert";

/** เก็บกี่วัน — ตรงกับ TRASH_KEEP_DAYS ฝั่งเซิร์ฟเวอร์ (หน้าถังขยะอ่านค่าจริงจาก keepDays) */
export const TRASH_KEEP_DAYS = 30;

/**
 * เหตุผลที่ลบ — ตรงกับ TRASH_REASONS / TRASH_REASON_LABELS ฝั่งเซิร์ฟเวอร์ · "อื่น ๆ" ต้องพิมพ์เหตุผล
 * ไม่มี "ลูกค้ายกเลิก" โดยตั้งใจ — ใบที่เปิดถูกแต่ไม่ได้ทำใช้ "ยกเลิกใบงาน" (ยังอยู่ในรายงานพร้อมเหตุผล)
 */
export const TRASH_REASONS = [
  { value: "TEST", label: "ใบทดสอบ / ลองระบบ" },
  { value: "DUPLICATE", label: "เปิดซ้ำ" },
  { value: "WRONG", label: "เปิดผิดสาขา / ผิดเครื่อง" },
  { value: "OTHER", label: "อื่น ๆ" },
] as const;

/** "4 ธ.ค. 69" ตามเวลาไทย — วันที่กู้คืนได้ถึง / วันที่ลบ */
export function trashDay(iso: string): string {
  return thaiDate(new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10));
}

export interface TrashResult {
  ok: true;
  id: number;
  code: string;
  deletedAt: string;
  purgeAt: string;
}

export interface RestoreResult {
  ok: true;
  id: number;
  code: string;
  status: string;
  statusLabel: string;
  /** สิ่งที่เปลี่ยนระหว่างอยู่ในถัง — เครื่องเดียวกันมีใบค้าง · สาขาปิด · ใบแม่/ลูกยังในถัง (ไม่กันการกู้ แค่บอก) */
  notes: string[];
}

/**
 * กู้คืนแล้วบอกผลบนแถบแจ้งเตือน — ใช้ทั้ง "เลิกทำ" หลังลบ และปุ่ม "กู้คืน" ในหน้าถังขยะ
 * มีเรื่องที่ต้องรู้ (notes) = แถบเหลือง ข้อความต่อท้าย เช่น "เครื่อง W3 มีใบงานค้างอยู่แล้ว: WO-00052"
 * onOpen = ปุ่ม "เปิดใบงาน" บนแถบ (หน้าถังขยะ) · รีเฟรชหน้าที่เปิดอยู่ให้ใบกลับมาโผล่ (รายการใบงาน / ถังขยะ)
 * คืน null เมื่อไม่สำเร็จ (บอกเหตุผลให้แล้ว)
 */
export async function restoreFromTrash(id: number, opts: { onOpen?: (id: number) => void } = {}): Promise<RestoreResult | null> {
  let r: RestoreResult;
  try {
    r = (await api.post<RestoreResult>(`/work-orders/${id}/restore`, undefined, { loadingText: "กำลังกู้คืน…" })).data;
  } catch (e) {
    showAlert("กู้คืนไม่สำเร็จ", apiErrorMessage(e));
    return null;
  }
  const text = `กู้คืน ${r.code} แล้ว — กลับไปขั้น “${r.statusLabel}” เหมือนก่อนลบ พร้อมรูปและประวัติครบ`;
  const notes = r.notes ?? [];
  feedback.toast(notes.length ? "warn" : "success", notes.length ? `${text} · ${notes.join(" · ")}` : text, {
    ...(opts.onOpen ? { action: { label: "เปิดใบงาน", onPress: () => opts.onOpen!(r.id) } } : {}),
  });
  void runRefresh();
  return r;
}

/**
 * เซิร์ฟเวอร์ตอบว่าใบนี้อยู่ในถังขยะ (404 + trashed: true จาก trashGuard) — หน้าใบงานที่เปิดค้างไว้ตอนมีคนลบใบนี้
 * ปิดตัวเองพร้อมบอกเหตุผล แทนที่ทุกปุ่มจะได้ "ไม่พบ" จนคนเปิดรู้ตัวเอง
 */
export function isTrashedError(e: unknown): boolean {
  const r = (e as { response?: { status?: number; data?: { trashed?: unknown } } } | null)?.response;
  return r?.status === 404 && r.data?.trashed === true;
}
