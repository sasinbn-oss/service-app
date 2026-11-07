/**
 * ถามเซิร์ฟเวอร์เป็นรอบ ๆ โดยไม่ถล่มฐานข้อมูล — ตัวเลขบนแถบหัวที่ทุกเครื่องเปิดค้างไว้ทั้งวัน (กระดิ่ง · รายการแชท)
 *
 * บทเรียน 7 พ.ย. 69: กระดิ่งกับแชทถามทุก 30 วินาที และทุกครั้งที่เปลี่ยนหน้า จากทุกเครื่องพร้อมกัน
 * ฐานข้อมูลอยู่คนละ region ต่อได้ 5 สาย คำขอต่อคิวจนหมดเวลา — ล็อกอินไม่ได้ทั้งระบบ
 * - รอบละ everyMs (0 = ไม่มีรอบ ถามเฉพาะตอนเปลี่ยนหน้า)
 * - แท็บ/แอปถูกซ่อน (เปิดทิ้งไว้ สลับไปแอปอื่น) ไม่ถาม · กลับมาเห็นจอแล้วถามทันทีถ้าห่างจากครั้งก่อนเกิน minGapMs
 * - เปลี่ยนหน้าแล้วถามได้ แต่ห่างจากครั้งก่อนอย่างน้อย minGapMs — กดไล่หลายหน้าติดกันไม่ยิงทุกหน้า
 */
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { navigationRef } from "../navigation/navigationRef";

const hidden = () => Platform.OS === "web" && typeof document !== "undefined" && document.hidden;

export function usePoll(load: () => void, everyMs: number, minGapMs: number, enabled = true) {
  const last = useRef(0);
  const live = useRef(load);
  live.current = load;
  useEffect(() => {
    if (!enabled) return;
    const tick = (force = false) => {
      if (hidden()) return;
      if (!force && Date.now() - last.current < minGapMs) return;
      last.current = Date.now();
      live.current();
    };
    tick(true);
    const off = navigationRef.addListener("state", () => tick());
    const t = everyMs > 0 ? setInterval(() => tick(true), everyMs) : null;
    const onShow = () => tick();
    if (Platform.OS === "web" && typeof document !== "undefined") document.addEventListener("visibilitychange", onShow);
    return () => {
      off();
      if (t) clearInterval(t);
      if (Platform.OS === "web" && typeof document !== "undefined") document.removeEventListener("visibilitychange", onShow);
    };
  }, [everyMs, minGapMs, enabled]);
}
