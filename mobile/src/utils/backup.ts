/**
 * สำรองข้อมูล (Super Admin) — ดาวน์โหลดไฟล์ และโหลดรอบ 17:00 ลงเครื่องให้เองบนจอคอม
 *
 * เซิร์ฟเวอร์ทำไฟล์ทุกวัน 17:00 อยู่แล้ว (backend/src/backup) — ส่วนนี้แค่ "ส่งกลับมา" ให้ถึงเครื่องเจ้าของงาน
 * ตามที่ขอ: เปิดแอปค้างไว้บนคอม ถึงเวลาไฟล์ลงโฟลเดอร์ดาวน์โหลดเอง ไม่ต้องจำมากด
 */
import { useEffect } from "react";
import { Platform } from "react-native";
import { api, apiErrorMessage } from "../api/client";
import { feedback } from "../components/Feedback";
import { showAlert } from "./alert";
import { openUrl } from "./share";
import { User } from "../types";

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
 * บนเว็บใช้ iframe ซ่อน ไม่ใช่ window.open — รอบอัตโนมัติไม่ได้มาจากการกดของคน
 * เบราว์เซอร์จะบล็อกป๊อปอัป แต่ลิงก์ที่ตอบเป็นไฟล์แนบ (Content-Disposition) โหลดผ่าน iframe ได้เงียบ ๆ
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

const SEEN_PREFIX = "backup-dl-";
const POLL_MS = 5 * 60_000;

function seen(id: number) {
  try {
    return window.localStorage.getItem(SEEN_PREFIX + id) !== null;
  } catch {
    return false;
  }
}
function markSeen(id: number) {
  try {
    window.localStorage.setItem(SEEN_PREFIX + id, new Date().toISOString());
  } catch {
    // โหมดไม่บันทึกประวัติ — อย่างแย่สุดเปิดแอปใหม่แล้วได้ไฟล์ซ้ำ ดีกว่าไม่ได้
  }
}

/** เกิน 17:00 ตามเวลาไทยหรือยัง — เช็คฝั่งแอปด้วย จะได้ไม่ถามเซิร์ฟเวอร์ทั้งวัน (Render ฟรีหลับถ้าไม่มีคนเรียก) */
function pastFivePmBangkok(now = new Date()) {
  return new Date(now.getTime() + 7 * 3600_000).getUTCHours() >= 17;
}

/**
 * วางไว้ที่โครงหลักของแอป — Super Admin เปิดแอปบนคอมค้างไว้ หลัง 17:00 ไฟล์ของวันนั้นโหลดลงเครื่องเอง
 *
 * จำว่าโหลดรอบไหนไปแล้วในเครื่องนี้ (localStorage) ไม่ใช่ที่เซิร์ฟเวอร์ — เปิดสองเครื่องก็ได้ไฟล์ทั้งสองเครื่อง
 * ซึ่งเป็นที่ต้องการ: ไฟล์สำรองควรอยู่หลายที่
 * มือถือไม่โหลดเอง — เปิดเบราว์เซอร์เด้งขึ้นมาเองตอนห้าโมงเย็นเป็นเรื่องน่าตกใจ ให้กดจากหน้าสำรองข้อมูลแทน
 */
export function useDailyBackupDownload(user: User | null) {
  const active = Platform.OS === "web" && !!user?.superAdmin && !user.viewAs;
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const check = async () => {
      if (stopped || !pastFivePmBangkok()) return;
      try {
        const res = await api.get<{ backup: BackupRow | null }>("/backups/today", { loadingText: false });
        const b = res.data.backup;
        if (stopped || !b || seen(b.id)) return;
        await downloadBackup(b.id, "excel");
        await downloadBackup(b.id, "data");
        markSeen(b.id);
        feedback.toast("success", `ดาวน์โหลดข้อมูลสำรองประจำวันแล้ว — ${b.baseName}`);
      } catch {
        // เซิร์ฟเวอร์ยังไม่ตื่นหรือเน็ตหลุด — อีก 5 นาทีลองใหม่ ไม่เด้งเตือนทุกรอบ
      }
    };
    const first = setTimeout(check, 10_000);
    const timer = setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [active]);
}
