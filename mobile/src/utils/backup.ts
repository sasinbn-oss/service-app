/**
 * สำรองข้อมูล (Super Admin) — ดาวน์โหลดไฟล์ที่กดสำรองไว้
 *
 * รอบอัตโนมัติ 17:00 และการโหลดลงเครื่องเองเอาออกแล้ว (เจ้าของงานสั่ง 15 ต.ค. 69 — รอบอัตโนมัติทำเซิร์ฟเวอร์ล่ม
 * ดู backend/src/backup/backup.ts) เหลือกด "สำรองและดาวน์โหลดตอนนี้" จากหน้าสำรองข้อมูล
 */
import { Platform } from "react-native";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "./alert";
import { openUrl } from "./share";

export interface BackupRow {
  id: number;
  createdAt: string;
  kind: "AUTO" | "MANUAL";
  byName: string | null;
  excelBytes: number;
  dataBytes: number;
  summary: { workOrders: number; branches: number; users: number } | null;
  baseName: string;
}

export type BackupFile = "excel" | "data";

/**
 * บนเว็บใช้ iframe ซ่อน ไม่ใช่ window.open — โหลดสองไฟล์ติดกัน เบราว์เซอร์บล็อกป๊อปอัปที่สอง
 * แต่ลิงก์ที่ตอบเป็นไฟล์แนบ (Content-Disposition) โหลดผ่าน iframe ได้เงียบ ๆ
 */
function downloadOnWeb(url: string) {
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.src = url;
  document.body.appendChild(frame);
  // เก็บไว้สักพักให้เบราว์เซอร์เริ่มโหลดก่อน ถอดเร็วไปไฟล์ใหญ่จะหยุดกลางทาง
  setTimeout(() => frame.remove(), 60_000);
}

export async function downloadBackup(id: number, file: BackupFile) {
  const res = await api.get<{ url: string }>(`/backups/${id}/link`, { params: { file }, loadingText: false });
  if (Platform.OS === "web") downloadOnWeb(res.data.url);
  else await openUrl(res.data.url);
}

/** กดจากหน้าสำรองข้อมูล — บอกเหตุผลถ้าโหลดไม่ได้ (ไฟล์ถูกลบเพราะเกิน 30 วัน ฯลฯ) */
export async function downloadBackupFiles(id: number, files: BackupFile[]) {
  try {
    for (const f of files) await downloadBackup(id, f);
  } catch (e) {
    showAlert("ดาวน์โหลดไม่ได้", apiErrorMessage(e));
  }
}
