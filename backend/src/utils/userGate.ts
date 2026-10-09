/**
 * บัญชีไหนยังใช้งานได้ และตอนนี้มีสิทธิ์อะไร — ให้ requireAuth ใช้แทนสิ่งที่จำไว้ในโทเคน
 *
 * โทเคนอายุ 30 วันและไม่ได้ถามฐานข้อมูลทุกคำขอ ถ้าไม่มีตัวนี้ คนที่ถูกลบ
 * (เช่นลาออก) จะยังใช้แอปต่อได้จนโทเคนหมดอายุ
 *
 * สิทธิ์ก็เหมือนกัน: ช่างที่เข้าระบบไว้แล้วถูกตั้งเป็นหัวหน้าภาคทีหลัง (นำเข้ารายชื่อ/แก้สิทธิ์)
 * แอปเห็นเป็นหัวหน้าภาคเพราะอ่าน /auth/me สด แต่เซิร์ฟเวอร์เชื่อโทเคนเก่า — เปิดหน้าจ่ายงานได้
 * แล้วกดไม่ผ่าน "ขั้นนี้เป็นของหัวหน้าภาค ไม่ใช่ของคุณ" จนกว่าจะออกแล้วเข้าระบบใหม่
 *
 * ไม่ถามฐานข้อมูลทุกคำขอเพราะฐานข้อมูลอยู่คนละ region ทุกคำขอจะช้าลงหนึ่งรอบไปกลับ
 * จึงจำรายชื่อ id ที่ใช้งานได้ไว้ในหน่วยความจำ แล้วโหลดใหม่:
 *  - ทุก 60 วินาที (เผื่อรันหลายเครื่อง เครื่องอื่นที่ไม่ได้รับคำสั่งลบจะตามทันภายในนาที)
 *  - ทันทีเมื่อเจอ id ที่ไม่รู้จัก (บัญชีเพิ่งสร้าง) แต่ไม่ถี่กว่าทุก 5 วินาที
 *    กันโทเคนปลอม/ของคนที่ถูกลบยิงรัวจนฐานข้อมูลโดนถามทุกคำขอ
 */
import { prisma } from "../prisma";
import { Role } from "./constants";

const MAX_AGE_MS = 60_000;
const MIN_GAP_MS = 5_000;

let active: Map<number, Role> | null = null;
let loadedAt = 0;
let loading: Promise<void> | null = null;

function reload() {
  if (!loading) {
    loading = prisma.user
      .findMany({ where: { deletedAt: null }, select: { id: true, role: true } })
      .then((rows) => {
        active = new Map(rows.map((r) => [r.id, r.role as Role]));
        loadedAt = Date.now();
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

/** สิทธิ์ปัจจุบันของบัญชี · null = ถูกลบแล้ว (หรือไม่มีบัญชีนี้) */
export async function currentRole(id: number): Promise<Role | null> {
  const age = Date.now() - loadedAt;
  if (!active || age > MAX_AGE_MS) await reload();
  else if (!active.has(id) && age > MIN_GAP_MS) await reload();
  return active!.get(id) ?? null;
}

/** เรียกทันทีหลังลบ — เครื่องนี้ตัดโทเคนของคนนั้นตั้งแต่คำขอถัดไป */
export function forgetUser(id: number) {
  active?.delete(id);
}

/**
 * เรียกตอนเข้าระบบ/สมัคร — ตรวจกับฐานข้อมูลมาแล้วว่ายังใช้งานได้
 * ไม่งั้นบัญชีที่เพิ่งสร้างแล้วเข้าระบบภายใน 5 วินาทีหลังโหลดรายชื่อ จะถูกปฏิเสธคำขอแรก
 * และหลังเปลี่ยนสิทธิ์ — เครื่องนี้ใช้สิทธิ์ใหม่ตั้งแต่คำขอถัดไป ไม่ต้องรอรอบโหลด 60 วินาที
 */
export function rememberUser(id: number, role: Role) {
  active?.set(id, role);
}

/** หลังเปลี่ยนสิทธิ์ทีละหลายคน (นำเข้ารายชื่อ) — โหลดใหม่ทั้งชุดตอนคำขอถัดไป */
export function staleUsers() {
  loadedAt = 0;
}
