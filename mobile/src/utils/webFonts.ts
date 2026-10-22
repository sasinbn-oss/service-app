import { Platform } from "react-native";
import { colors, isDark, SYSTEM_STACK } from "../theme";

/**
 * ฟอนต์ของระบบ ตามแนวทางออกแบบ ต.ค. 69 (SF Pro + Sukhumvit Set บน iPhone/Mac)
 *
 * เปลี่ยนจาก Inter + Noto Sans Thai เพราะฟอนต์ของเครื่องคือสิ่งที่คนใช้เห็นทุกวันในแอปอื่น
 * ดูเป็นทางการกว่า และไม่ต้องรอโหลดฟอนต์ก่อนข้อความขึ้น · Windows ได้ Segoe UI + Leelawadee UI
 * ส่วนเครื่องที่ไม่มีฟอนต์ไทยของระบบ (Linux บางเครื่อง) ยังโหลด Noto Sans Thai ไว้เป็นตัวสำรอง
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
    "https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap";
  document.head.appendChild(link);

  const style = document.createElement("style");
  style.textContent =
    `[class*="css-text"]:not([style*="font-family"]){font-family:${SYSTEM_STACK}}` +
    `body{background:${colors.background};-webkit-font-smoothing:antialiased}` +
    // ปัดนิ้วแนวนอนให้เป็นของแอป (ดึงเมนูข้าง) ไม่ใช่ "ย้อนกลับ" ของเบราว์เซอร์ — เคยปัดเปิดเมนูแล้วหลุดไปหน้าว่าง
    "html,body{overscroll-behavior-x:none}" +
    // โหมดมืด: ช่องกรอก ปฏิทินของเบราว์เซอร์ และแถบเลื่อนเป็นแบบมืดตาม
    (isDark ? ":root{color-scheme:dark}" : "") +
    // ช่องกรอกที่กำลังพิมพ์: ขอบฟ้าแบบต้นแบบ (.input:focus) แทนกรอบดำหนาของเบราว์เซอร์
    // ที่ดูเหมือนช่องนั้นผิด — ไม่ใส่วงเรือง เพราะช่องค้นหาที่ขอบอยู่ที่กล่องรอบนอกจะมีวงซ้อนข้างใน
    `input:focus,textarea:focus{outline:none!important;border-color:${colors.primary}!important}`;
  document.head.appendChild(style);
}
