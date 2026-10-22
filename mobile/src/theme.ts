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
  /**
   * กรมท่าที่เป็น "พื้น" ปุ่ม/ชิปที่เลือก (ตัวหนังสือขาว) — โหมดสว่างเท่ากับ navy
   * แยกไว้เพราะโหมดมืด navy ที่เป็นตัวหนังสือต้องสว่าง แต่พื้นปุ่มต้องยังเข้มให้ตัวขาวอ่านได้
   */
  navyFill: "#0B3B60",
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
  /** เหลืองเข้มกว่า warningSoft — ป้าย/กล่องเตือนที่ต้องเด่นกว่าพื้นเตือนทั่วไป */
  warningTint: "#FEF3C7",
  dangerLine: "#FECACA",
  successLine: "#A7F3D0",
  /** ขอบของการ์ดหรือชิปที่เกินเวลา — เส้นเหลืองช่วยให้เห็นจากระยะไกลกว่าพื้นอ่อนอย่างเดียว */
  warningBorder: "#FDE68A",
  /** ใบที่ถูกย้อนขั้น (เจ้าของงานขอ ต.ค. 69) — ส้มเข้ม แยกจากเหลือง "รอ" และแดง "อะไหล่หมด" */
  rollback: "#C2410C",
  rollbackInk: "#9A3412",
  rollbackSoft: "#FFF7ED",
  /**
   * สีตาม "ใบงานรอใคร" (เจ้าของงานเลือก ต.ค. 69) — ป้ายสถานะ แถบซ้ายแถว ตัวกรองรอใคร และวงขั้นปัจจุบัน
   * ใช้ชุดเดียวกันทุกที่ จำครั้งเดียว: ม่วง = แอดมิน · ฟ้าเข้ม = หัวหน้าภาค · เขียว = ช่าง
   * (รอคนนอกใช้ warning* · ปิดงานใช้ done*)
   */
  roleAdmin: "#6D28D9",
  roleAdminSoft: "#F1EAFE",
  roleAdminLine: "#C4B5FD",
  roleSupervisor: "#0369A1",
  roleSupervisorSoft: "#E0F2FE",
  roleTech: "#047857",
  roleTechSoft: "#E3F7EE",
  // เขียวเสจ (เจ้าของงานเลือก ต.ค. 69) — เขียวมะกอกเดิมอมเหลือง ดูสดเกินสำหรับงานที่จบแล้ว
  // ตั้งใจให้หม่นและต่างจากเขียวมรกตของ "รอช่าง" ชัด ๆ
  doneInk: "#2F5A46",
  doneBand: "#3E6B56",
  doneSoft: "#F2F7F4",
  doneLine: "#D6E6DD",
  // อะไหล่นอกสโตร์ (ไม่มี SKU) — ส้มอิฐ ต่างจากเหลือง "รอคนนอก" ให้แยกออกว่าเป็นของคนละประเภท ไม่ใช่สถานะ
  offPart: "#B45309",
  offPartSoft: "#FFF4E5",
  offPartLine: "#F5C98B",
  // ค่าบริการที่ต้องเสนอราคา — เขียวอมฟ้า ไม่ใช่ของ จึงไม่ใช้ส้มเดียวกับอะไหล่นอกสโตร์
  service: "#0F766E",
  serviceSoft: "#E6F6F4",
  serviceLine: "#99D5CD",
  // แนวทางออกแบบ ต.ค. 69 (เจ้าของงานส่งมา): พื้นเทาอมฟ้าเรียบ เส้นขอบ/ตัวหนังสือรองเข้มขึ้นนิดให้ดูทางการ
  background: "#F4F6F9",
  card: "#FFFFFF",
  border: "#DDE3EA",
  borderStrong: "#C3CDD8",
  text: "#0F172A",
  body: "#334155",
  textMuted: "#5B6B7D",
  textFaint: "#94A3B8",
  /** ม่านโปร่งทับเนื้อหาตอนรอ (toast/หน้าต่างโหลด) — สีพื้นหลังแบบโปร่ง */
  veil: "rgba(244,246,249,0.86)",
  /**
   * เมนูข้างสีกรมท่า (แนวทางออกแบบ ต.ค. 69) — โครงของแอปเป็นกรมท่า ฟ้า OTTERI เหลือไว้เป็นแถบเมนูที่เลือก
   * แยกเป็นชุดของตัวเอง เพราะตัวหนังสือบนเมนูเป็นสีอ่อนบนพื้นเข้ม คนละทางกับ text/textMuted ของเนื้อหา
   */
  // แถวตาราง: พื้นสลับแถว (อ่านตามแถวไม่หลุดบรรทัด) · แถวที่เมาส์ชี้ (เจ้าของงานขอ ต.ค. 69 — ตารางเรียบไปหมด)
  rowAlt: "#F5F7FA",
  rowHover: "#DCEEFB",
  sideBg: "#0B2540",
  sideLine: "#1C3A5C",
  sideInk: "#C9D6E5",
  sideDim: "#8FA3BC",
};

/**
 * โหมดมืด (เจ้าของงานขอ ต.ค. 69 — สวิตช์ดวงจันทร์มุมขวาบน)
 *
 * เลือกชุดสีครั้งเดียวตอนโหลดแอป แล้วเขียนทับ `colors` ตรงนี้ก่อนหน้าไหนจะ import —
 * ทุกหน้าสร้าง StyleSheet ตอน import จากค่าใน `colors` จึงได้สีมืดไปเองโดยไม่ต้องแก้ทีละหน้า
 * ต้องแลกด้วยการโหลดหน้าใหม่ตอนสลับ (ทางเลือกอื่นคือย้ายสไตล์ร้อยกว่าไฟล์ไปคำนวณตอน render)
 *
 * สีสด (primary, danger, role*) แทบไม่เปลี่ยน เพราะใช้เป็นพื้นปุ่มที่มีตัวหนังสือขาว ·
 * สี *Ink (ตัวหนังสือบนพื้นอ่อน) กลับเป็นสว่าง · *Soft กลับเป็นเข้มอมสีเดิม ความหมายของสีคงเดิม
 * มีแค่บนเว็บ — แอป native ยังไม่มีที่เก็บค่าที่อ่านได้ทันทีตอนโหลด
 */
const DARK: Partial<typeof colors> = {
  primary: "#13A6E6",
  primaryDark: "#0A8FCB",
  primaryInk: "#7DCFF5",
  primarySoft: "#0E2D42",
  navy: "#D4E6F7",
  navyFill: "#1C5689",
  sky50: "#13283A",
  sky200: "#24486A",
  tile: "#15283B",
  dangerInk: "#FCA5A5",
  dangerSoft: "#2C1618",
  dangerLine: "#6B2A2E",
  successInk: "#6EE7B7",
  successSoft: "#0F2A22",
  successLine: "#1F5141",
  warningInk: "#FCD34D",
  warningSoft: "#2A2211",
  warningTint: "#3A2E10",
  warningBorder: "#6B5317",
  rollback: "#EA580C",
  rollbackInk: "#FDBA74",
  rollbackSoft: "#2C1B0F",
  roleAdmin: "#8B5CF6",
  roleAdminSoft: "#231B3D",
  roleAdminLine: "#4F3F80",
  roleSupervisor: "#0284C7",
  roleSupervisorSoft: "#0C2A3D",
  roleTech: "#059669",
  roleTechSoft: "#0F2A22",
  doneInk: "#A3CDB7",
  doneBand: "#4A7D65",
  doneSoft: "#13231C",
  doneLine: "#2A4537",
  offPart: "#E08A1E",
  offPartSoft: "#2A1E0D",
  offPartLine: "#6B4A1C",
  service: "#14A396",
  serviceSoft: "#0D2724",
  serviceLine: "#1F5A52",
  background: "#0B1520",
  card: "#14202D",
  border: "#253546",
  borderStrong: "#36495E",
  text: "#E8EFF6",
  body: "#C4D0DC",
  textMuted: "#8FA2B5",
  textFaint: "#66798C",
  veil: "rgba(11,21,32,0.86)",
  rowAlt: "#172331",
  rowHover: "#1B3447",
  sideBg: "#08111B",
  sideLine: "#1A2C42",
  sideInk: "#B8C7D9",
  sideDim: "#7F93AB",
};

const THEME_KEY = "otteri-theme";
export const isDark: boolean = (() => {
  try {
    return Platform.OS === "web" && typeof localStorage !== "undefined" && localStorage.getItem(THEME_KEY) === "dark";
  } catch {
    return false;
  }
})();
if (isDark) Object.assign(colors, DARK);

/** สลับโหมดแล้วโหลดหน้าใหม่ — ข้อความที่พิมพ์ค้างในฟอร์มช่างจำไว้แล้ว (utils/draft.ts) */
export function setDarkMode(on: boolean) {
  try {
    localStorage.setItem(THEME_KEY, on ? "dark" : "light");
  } catch {
    return;
  }
  if (typeof location !== "undefined") location.reload();
}

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
    1: { offset: 4, radius: 16, opacity: isDark ? 0.3 : 0.06, android: 1 },
    2: { offset: 12, radius: 28, opacity: isDark ? 0.45 : 0.1, android: 3 },
  }[level];

  return Platform.select<ViewStyle>({
    android: { elevation: config.android },
    default: {
      // เงาโทนกรมท่าแบบ OTTERI ไม่ใช่ดำ — บนพื้นฟ้าอ่อนเงาดำดูสกปรก
      shadowColor: isDark ? "#000" : colors.navy,
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

/**
 * ฟอนต์หัวข้อแบบ OTTERI (h1–h4 ชื่อแบรนด์ ตัวเลขสรุป ทะเบียนรถ)
 *
 * ต้นแบบใช้ Plus Jakarta Sans กับหัวข้อ ส่วนเนื้อหาใช้ Inter (ใส่ไว้ทาง CSS ใน webFonts.ts)
 * ตัวอักษรละตินกับตัวเลขในหัวข้อเลยดูหนาและกลมกว่าเนื้อหา ไทยยังตกไปใช้ Noto Sans Thai เหมือนเดิม
 * ใส่เฉพาะเว็บ — บนมือถือไม่ได้โหลดฟอนต์นี้ ถ้าระบุชื่อไปเครื่องจะหาไม่เจอแล้วเตือน
 */
/** ฟอนต์ของระบบบนเว็บ — ดู utils/webFonts.ts ว่าทำไมไม่ใช้ฟอนต์จาก Google แล้ว */
export const SYSTEM_STACK =
  '-apple-system,BlinkMacSystemFont,"SF Pro Text","Sukhumvit Set","Segoe UI","Leelawadee UI",Roboto,"Noto Sans Thai",system-ui,sans-serif';

export const fonts = {
  head: Platform.OS === "web" ? SYSTEM_STACK : undefined,
};
/**
 * ใส่ใน style ของ <Text> ตรง ๆ แบบ style={[styles.title, headingFont]} ห้ามใส่ใน StyleSheet.create
 * บนเว็บ StyleSheet ถูกแปลงเป็น class แล้วแพ้กฎฟอนต์รวมใน webFonts.ts หัวข้อเลยกลับเป็นฟอนต์เนื้อความ
 * ส่วน style ที่ส่งตรง ๆ กลายเป็น inline ซึ่งกฎนั้นข้ามให้ (แบบเดียวกับไอคอน)
 */
export const headingFont = { fontFamily: fonts.head, letterSpacing: -0.24 } as const;
