import { Platform, ViewStyle } from "react-native";

/**
 * สีทั้งแอปตามมาตรฐาน OTTERI UI (OTTERI-UI-GUIDE.md หัวข้อ 3)
 *
 * ชื่อคีย์เดิม (primary, primarySoft, ...) คงไว้ เพราะทุกหน้าอ้างชื่อพวกนี้อยู่ —
 * เปลี่ยนค่าที่เดียวแล้วทั้งแอปเปลี่ยนตาม ไม่ต้องไล่แก้ทีละหน้า
 * คีย์ใหม่ (navy, *Ink, sky*) คือสีที่ OTTERI มีแต่ชุดเดิมไม่มี
 *
 * ความหมายของสี: ฟ้า = หลัก/กำลังทำ · เขียว = เสร็จ/ว่าง · เหลือง = เตือน/รอคนนอก
 * แดง = ผิดปกติ/ลบ · เทา = ปิด/ไม่ใช้ · กรมท่า = ปุ่มยืนยันสำคัญ/หัวข้อเน้น
 */
export const colors = {
  primary: "#009FE3",
  primaryDark: "#0088CC",
  /** ตัวอักษรสีฟ้าบนพื้นอ่อน — `primary` อ่อนเกินไปสำหรับตัวหนังสือเล็ก */
  primaryInk: "#006491",
  primarySoft: "#E1F0FA",
  navy: "#0B3B60",
  sky50: "#F0F8FF",
  sky200: "#C9E6FF",
  tile: "#EFF4FF",
  danger: "#EF4444",
  dangerInk: "#B91C1C",
  dangerSoft: "#FEF2F2",
  success: "#10B981",
  successInk: "#065F46",
  successSoft: "#ECFDF5",
  warning: "#F59E0B",
  warningInk: "#92400E",
  warningSoft: "#FFFBEB",
  background: "#F4F9FD",
  card: "#FFFFFF",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  text: "#0F172A",
  body: "#334155",
  textMuted: "#64748B",
  textFaint: "#94A3B8",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

/**
 * Elevation needs different properties per platform: iOS and web take a shadow,
 * Android only understands `elevation`.
 */
function elevation(level: 1 | 2): ViewStyle {
  const config = {
    // ตาม --shadow / --shadow-md ของ OTTERI: เงานุ่ม กระจายกว้าง ไม่มีขอบแข็ง
    1: { offset: 4, radius: 16, opacity: 0.06, android: 1 },
    2: { offset: 12, radius: 28, opacity: 0.1, android: 3 },
  }[level];

  return Platform.select<ViewStyle>({
    android: { elevation: config.android },
    default: {
      // เงาโทนกรมท่าแบบ OTTERI ไม่ใช่ดำ — บนพื้นฟ้าอ่อนเงาดำดูสกปรก
      shadowColor: colors.navy,
      shadowOffset: { width: 0, height: config.offset },
      shadowOpacity: config.opacity,
      shadowRadius: config.radius,
    },
  })!;
}

export const shadow = {
  card: elevation(1),
  raised: elevation(2),
};
