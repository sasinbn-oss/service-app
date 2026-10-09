import { AccessibilityInfo, Animated, Easing } from "react-native";

/**
 * จังหวะการเคลื่อนไหวของทั้งแอป (แบบ iOS) — เจ้าของงานเลือกจากตัวอย่างที่ให้กดเทียบกับของเดิม
 *
 * ใช้สปริงแทนการจางขึ้นแบบเวลาตายตัว เพราะสปริงรับความเร็วต่อจากนิ้วได้ ปัดแรงก็ไปเร็ว
 * ปัดเบาก็ค่อย ๆ ไป และหยุดกลางทางแล้วเริ่มใหม่ได้โดยไม่กระตุก
 * ค่าอยู่ที่เดียวเพื่อให้ทุกหน้าต่างเด้งจังหวะเดียวกัน — ปรับที่นี่ ไม่ใช่ใส่ตัวเลขในแต่ละหน้า
 *
 * ทุกตัวใช้ JS driver: หน้าต่างเดียวกันมีทั้งขนาด (ทำบน native ไม่ได้) และการเลื่อน
 * ถ้าค่าหนึ่งอยู่ native อีกค่าอยู่ JS ในวิวเดียวกัน RN จะโยน error ตอนรัน และบนเว็บไม่มี native driver อยู่แล้ว
 */
export const SPRING = {
  /** หน้าต่างพองขึ้นตอนเปิด — เด้งเลยนิดเดียวให้รู้สึกมีน้ำหนัก */
  pop: { stiffness: 340, damping: 26, mass: 1 },
  /** ฟอร์มเลื่อนเข้า/ออก — ไม่เด้งเลย เพราะขอบฟอร์มเลยแล้วถอยกลับดูเหมือนจอสั่น */
  push: { stiffness: 260, damping: 32, mass: 1 },
  /** ขยาย/ย่อหน้าต่าง และเมนูข้าง */
  resize: { stiffness: 300, damping: 29, mass: 1 },
  /** ปล่อยนิ้วไม่ถึงเกณฑ์ → ดีดกลับที่เดิมเร็ว ๆ */
  settle: { stiffness: 420, damping: 34, mass: 1 },
  /** แจ้งเตือนหล่นจากขอบบน */
  drop: { stiffness: 380, damping: 25, mass: 1 },
};

/** เส้นโค้งแผ่นล่างของ iOS — ออกตัวเร็วแล้วค่อย ๆ จอด */
export const SHEET_EASE = Easing.bezier(0.32, 0.72, 0, 1);
/** ตอนปิด: เริ่มช้าแล้วเร่งออก — ปิดต้องเร็วกว่าเปิด คนกดปิดคือจะไปทำอย่างอื่นแล้ว */
export const EXIT_EASE = Easing.bezier(0.4, 0, 1, 1);

// คนที่ตั้ง "ลดการเคลื่อนไหว" ในเครื่อง (เวียนหัวกับภาพเคลื่อนไหว) ได้แค่จางเร็ว ๆ ไม่เด้งไม่เลื่อน
// บนเว็บ react-native-web อ่านจาก prefers-reduced-motion ให้
let reduced = false;
AccessibilityInfo.isReduceMotionEnabled?.()
  .then((v) => (reduced = !!v))
  .catch(() => undefined);
AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v: boolean) => (reduced = !!v));

export function reduceMotion() {
  return reduced;
}

/** velocity เป็นหน่วยของค่าต่อวินาที — จากนิ้ว: gesture.vx (px/ms) × 1000 ÷ ระยะทั้งหมด */
export function spring(v: Animated.Value, toValue: number, preset: keyof typeof SPRING, velocity = 0) {
  if (reduced) return Animated.timing(v, { toValue, duration: 120, useNativeDriver: false });
  return Animated.spring(v, { toValue, velocity, ...SPRING[preset], useNativeDriver: false });
}

export function timing(v: Animated.Value, toValue: number, duration: number, easing = SHEET_EASE) {
  return Animated.timing(v, { toValue, duration: reduced ? Math.min(duration, 120) : duration, easing, useNativeDriver: false });
}

/** ลากเลยขอบ → หนืดเหมือนยาง ยิ่งลากยิ่งไปได้น้อย (สูตรเดียวกับ UIScrollView) */
export function rubber(distance: number, dimension: number) {
  return (1 - 1 / ((distance * 0.55) / dimension + 1)) * dimension;
}

/**
 * ระหว่างลากด้วยเมาส์บนเว็บ ห้ามเลือกข้อความ — ไม่งั้นลากหน้าต่างแล้วตัวหนังสือถูกระบายฟ้าทั้งแถบ
 * (บนมือถือไม่มีปัญหานี้ เรียกได้ทุกแพลตฟอร์ม)
 */
export function lockSelection(on: boolean) {
  if (typeof document === "undefined") return;
  const s = document.body.style as CSSStyleDeclaration & { webkitUserSelect?: string };
  s.userSelect = on ? "none" : "";
  s.webkitUserSelect = on ? "none" : "";
  if (!on) window.getSelection?.()?.removeAllRanges();
}

/**
 * ระหว่างที่มีฟอร์มปัดย้อนกลับได้เปิดอยู่ ปิดท่า "ปัดแนวนอนเพื่อย้อนหน้าเว็บ" ของ Chrome
 * ไม่งั้นปัดฟอร์มกลับแล้วเบราว์เซอร์ย้อนออกจากแอปไปทั้งหน้า — touch-action บนตัวฟอร์มกันไม่อยู่
 * ต้องตั้งที่ราก (overscroll-behavior) นับจำนวนเพราะฟอร์มซ้อนกันได้
 */
let historySwipeLocks = 0;
export function lockHistorySwipe(on: boolean) {
  if (typeof document === "undefined") return;
  historySwipeLocks = Math.max(0, historySwipeLocks + (on ? 1 : -1));
  const v = historySwipeLocks > 0 ? "none" : "";
  document.documentElement.style.overscrollBehaviorX = v;
  document.body.style.overscrollBehaviorX = v;
}
