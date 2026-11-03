/**
 * รายชื่อวิธีใช้ทั้งหมด + ใครเห็นเรื่องไหน (สอนการใช้งาน · เจ้าของงานเลือก ต.ค. 69)
 *
 * ข้อความอยู่ข้างไฟล์หน้าจอแต่ละไฟล์ (screens/*.howto.ts) — ที่นี่แค่รวมรายชื่อและตัดสินว่าบทบาทไหน/จอแบบไหนเห็นขั้นไหน
 * รอบแรก: ช่าง หัวหน้าภาค แอดมิน (หน้าที่ใช้ทุกวัน) · ทีม Area และ Admin Spare Part รอรอบหน้า (เห็นหน้าว่างที่บอกว่ากำลังทำ)
 */
import { Platform } from "react-native";
import type { Role, User } from "../types";
import type { HowToBody, HowToCtx, HowToRole, HowToStep, HowToTour } from "./howtoTypes";
import { TECH_MYDAY } from "../screens/MyJobsScreen.howto";

/** เรียงตามที่หน้า "สอนการใช้งาน" แสดง */
export const TOURS: HowToTour[] = [TECH_MYDAY];

/**
 * บทบาทของผู้ใช้ที่ล็อกอินอยู่ (role ถูกแปลงใน AuthContext แล้ว — Super Admin/Admin Spare Part = ADMIN + ธง)
 * Admin Spare Part ยังไม่มีวิธีใช้รอบนี้ (หน้าตรวจเคลมเป็นเรื่องแรกของรอบหน้า) · ทีม Area ก็เช่นกัน
 */
export function rolesOf(user: User | null | undefined): HowToRole[] {
  if (!user) return [];
  if (user.role === "ADMIN") {
    if (user.partsAdmin) return [];
    return user.superAdmin ? ["admin", "super"] : ["admin"];
  }
  if (user.role === "SUPERVISOR") return ["sup"];
  if (user.role === "EMPLOYEE") return user.seniorTech ? ["tech", "senior"] : ["tech"];
  return [];
}

/** บทบาทจาก role ดิบในฐานข้อมูล (แถวในหน้าการใช้งานแอป) */
export function rolesOfRaw(role: Role | string): HowToRole[] {
  switch (role) {
    case "EMPLOYEE":
      return ["tech"];
    case "SENIOR_TECH":
      return ["tech", "senior"];
    case "SUPERVISOR":
      return ["sup"];
    case "ADMIN":
      return ["admin"];
    case "SUPER_ADMIN":
      return ["admin", "super"];
    default:
      return [];
  }
}

const meets = (want: HowToRole[] | undefined, have: HowToRole[]) => !want || want.some((r) => have.includes(r));

export function toursFor(roles: HowToRole[]): HowToTour[] {
  return roles.length ? TOURS.filter((t) => meets(t.roles, roles)) : [];
}

export function tourById(id: string): HowToTour | undefined {
  return TOURS.find((t) => t.id === id);
}

/**
 * วิธีใช้ของหน้าที่เปิดอยู่ — ปุ่ม ? บนแถบหัวเล่นเรื่องนี้ · ไม่มี = null
 * วิธีใช้ในฟอร์ม (inForm) ไม่นับ เพราะมีปุ่ม ? ของตัวเองในหัวฟอร์ม
 * หน้าใบงานมีเฉพาะของช่าง — แอดมิน/หัวหน้าภาคเรียนหน้าใบงานในวิธีใช้ "ใบงานซ่อม" ของตัวเอง (เรื่องของแต่ละบทบาทกรองด้วย roles อยู่แล้ว)
 */
export function tourForRoute(roles: HowToRole[], routeName: string | null | undefined): HowToTour | null {
  if (!routeName) return null;
  return toursFor(roles).find((t) => t.route === routeName && !t.inForm) ?? null;
}

/**
 * ขั้นที่คนนี้เห็นจริงบนจอแบบนี้ — ตัดตามบทบาท (ขั้นเพิ่มของ Senior/Super Admin) และจอแคบ/กว้าง
 * แอปติดตั้ง (APK): กล่องขึ้นกลางจอไม่ชี้ปุ่ม จึงตัดขั้นลองกดและขั้นที่ต้องเปิดใบงานให้ (ชี้อะไรไม่ได้ — D9)
 */
export function stepsFor(tour: HowToTour, roles: HowToRole[], layout: "narrow" | "wide", platform = Platform.OS): HowToStep[] {
  return tour.steps.filter(
    (s) => meets(s.roles, roles) && (!s.layout || s.layout === layout) && (platform === "web" || (!s.try && !s.before)),
  );
}

/** ข้อความของขั้นนี้สำหรับคนนี้ — แยกตามบทบาทเลือกบทบาทแรกที่มีข้อความ · ฟังก์ชันคิดตอนขั้นขึ้นจอ */
export function bodyText(body: HowToBody, ctx: HowToCtx): string {
  if (typeof body === "string") return body;
  if (typeof body === "function") return body(ctx);
  for (const r of ctx.roles) {
    const t = body[r];
    if (t) return t;
  }
  return Object.values(body).find(Boolean) ?? "";
}
