/**
 * งานรถ — อัปรูปรอบคัน เปิดรูปเต็ม และข้อความที่ใช้หลายหน้า
 *
 * รูปรอบคันอัปทีละรูปทันทีที่ถ่าย (ไม่บังจอ) ช่างถ่ายรูปต่อไปได้เลย
 * ตอนกดยืนยันส่งแค่เลข id ของรูป — ปุ่มยืนยันจึงไม่ต้องรอส่ง 5 รูปผ่าน 4G พร้อมกัน
 */
import { api, apiErrorMessage } from "../api/client";
import { appendFile, PickedAttachment } from "./attachments";
import { openUrl } from "./share";
import { showAlert } from "./alert";

export async function uploadVehiclePhoto(file: PickedAttachment, phase: "START" | "END") {
  const form = new FormData();
  await appendFile(form, "file", file.uri, file.name, file.type);
  if (file.thumbnailUri) await appendFile(form, "thumbnail", file.thumbnailUri, "thumb.jpg", "image/jpeg");
  form.append("phase", phase);
  const res = await api.post<{ id: number; thumbnailDataUrl: string | null }>("/vehicle-logs/photos", form, {
    headers: { "Content-Type": "multipart/form-data" },
    // อัปเบื้องหลังระหว่างถ่าย — บังจอทุกรูปคือการบังคับให้ช่างรอทีละรูป
    loadingText: false,
  });
  return res.data;
}

/** ส่งรูปเดียวขึ้น endpoint แบบ multipart (เอกสารรถ ใบเสร็จซ่อม) พร้อมช่องอื่น */
export async function postImageForm(
  url: string,
  file: PickedAttachment | null,
  fields: Record<string, string>,
  loadingText = "กำลังบันทึก..."
) {
  const form = new FormData();
  if (file) {
    await appendFile(form, "file", file.uri, file.name, file.type);
    if (file.thumbnailUri) await appendFile(form, "thumbnail", file.thumbnailUri, "thumb.jpg", "image/jpeg");
  }
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  await api.post(url, form, { headers: { "Content-Type": "multipart/form-data" }, loadingText });
}

/** เปิดรูปเต็มผ่านลิงก์ชั่วคราว — ถังไม่เปิดสาธารณะ */
export async function openSigned(path: string) {
  try {
    const res = await api.get<{ url: string }>(path);
    await openUrl(res.data.url);
  } catch (e) {
    showAlert("เปิดรูปไม่ได้", apiErrorMessage(e));
  }
}

export function fmtNum(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : n.toLocaleString("th-TH");
}

/** "8 ต.ค. 69 07:05" ตามเวลาไทย */
export function fmtDT(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function duration(fromIso: string, toIso?: string | null) {
  const ms = (toIso ? new Date(toIso).getTime() : Date.now()) - new Date(fromIso).getTime();
  if (!(ms > 0)) return "—";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h ? `${h} ชม. ` : ""}${m} นาที`;
}

export interface VehicleLogRow {
  id: number;
  status: "ONGOING" | "COMPLETED";
  vehicleId: number;
  plateNumber: string;
  vehicleName: string | null;
  vehicleType: string | null;
  userId: number;
  userName: string;
  userTeam: string | null;
  purpose: string;
  destination: string | null;
  note: string | null;
  returnNote: string | null;
  startMileage: number;
  endMileage: number | null;
  distance: number | null;
  mileageGap: number;
  cost: number | null;
  repairNote: string | null;
  startedAt: string;
  endedAt: string | null;
  workOrder: { id: number; code: string; title: string; branch: string } | null;
  returnedByName: string | null;
  photoCount: number;
}
