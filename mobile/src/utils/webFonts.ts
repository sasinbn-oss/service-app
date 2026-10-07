import { Platform } from "react-native";

/**
 * ฟอนต์ตามมาตรฐาน OTTERI (Inter + Noto Sans Thai) สำหรับเวอร์ชันเว็บ
 *
 * ใส่ทาง CSS ที่เดียวแทนการไล่ใส่ fontFamily ทุก <Text> — แอปมีข้อความหลายร้อยจุด
 * ใส่ทีละจุดแล้วตกหล่นแน่ และเวลาเพิ่มหน้าใหม่ก็ต้องจำใส่อีก
 *
 * ข้าม element ที่ตั้ง font-family เองแบบ inline เพราะนั่นคือไอคอน (Ionicons ตั้ง
 * fontFamily ไว้ใน style) — ทับไปด้วยแล้วไอคอนจะกลายเป็นสี่เหลี่ยมว่าง
 *
 * บนมือถือ (APK) ยังใช้ฟอนต์ของเครื่อง ซึ่งอ่านไทยได้ปกติ
 */
export function installWebFonts() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.getElementById("otteri-fonts")) return;

  const link = document.createElement("link");
  link.id = "otteri-fonts";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@700;800&family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap";
  document.head.appendChild(link);

  const style = document.createElement("style");
  style.textContent =
    '[class*="css-text"]:not([style*="font-family"]){font-family:"Inter","Noto Sans Thai",system-ui,sans-serif}' +
    "body{background:#F4F9FD;-webkit-font-smoothing:antialiased}";
  document.head.appendChild(style);
}
