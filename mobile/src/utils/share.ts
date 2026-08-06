import { Linking, Platform, Share } from "react-native";
import { showAlert } from "./alert";

/**
 * เปิดลิงก์ดาวน์โหลดเอกสาร
 *
 * บนเว็บเปิดแท็บใหม่ให้เบราว์เซอร์จัดการดาวน์โหลดเอง บนมือถือส่งต่อให้ระบบ
 * ซึ่งจะเปิดเบราว์เซอร์แล้วเซฟไฟล์ลงเครื่อง — ทั้งสองทางไม่ต้องแนบ token
 * เพราะลิงก์มีกุญแจของตัวเองอยู่แล้ว
 */
export async function openUrl(url: string) {
  if (Platform.OS === "web") {
    window.open(url, "_blank", "noopener");
    return;
  }
  const supported = await Linking.canOpenURL(url).catch(() => false);
  if (!supported) {
    showAlert("เปิดลิงก์ไม่ได้", "กรุณาลองเปิดเอกสารนี้จากเบราว์เซอร์บนคอมพิวเตอร์");
    return;
  }
  await Linking.openURL(url);
}

/**
 * Hands a generated document to whatever the platform uses to move text around.
 *
 * On a phone that is the OS share sheet, so the document can go straight into
 * LINE, mail or Files. react-native-web does not implement Share, so the browser
 * copies to the clipboard instead — the equivalent one-tap "get it out of here".
 */
export async function shareText(text: string, title = "เอกสารจากผู้ช่วย AI") {
  if (Platform.OS !== "web") {
    try {
      await Share.share({ message: text, title });
    } catch {
      // The user dismissing the share sheet throws here; that is not an error.
    }
    return;
  }

  try {
    // navigator.clipboard needs a secure context, which a plain http:// host is
    // not, so fall through to the textarea trick rather than failing outright.
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    showAlert("คัดลอกแล้ว", "วางลงในเอกสารหรืออีเมลได้เลย");
  } catch {
    showAlert("คัดลอกไม่สำเร็จ", "กรุณาเลือกข้อความแล้วคัดลอกเอง");
  }
}

/** Web-only: saves the document as a .md file the user can open in Word or Docs. */
export function downloadText(text: string, filename: string) {
  if (Platform.OS !== "web") return;
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
