import { Linking, Platform } from "react-native";
import { showAlert } from "./alert";

/**
 * ส่งลิงก์ออกไปให้ระบบเปิด
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
