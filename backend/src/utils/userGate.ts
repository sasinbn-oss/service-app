/**
 * บัญชีไหนยังใช้งานได้ — ให้ requireAuth ตัดโทเคนของคนที่ถูกลบ
 *
 * โทเคนอายุ 30 วันและไม่ได้ถามฐานข้อมูลทุกคำขอ ถ้าไม่มีตัวนี้ คนที่ถูกลบ
 * (เช่นลาออก) จะยังใช้แอปต่อได้จนโทเคนหมดอายุ
 *
 * ไม่ถามฐานข้อมูลทุกคำขอเพราะฐานข้อมูลอยู่คนละ region ทุกคำขอจะช้าลงหนึ่งรอบไปกลับ
 * จึงจำรายชื่อ id ที่ใช้งานได้ไว้ในหน่วยความจำ แล้วโหลดใหม่:
 *  - ทุก 60 วินาที (เผื่อรันหลายเครื่อง เครื่องอื่นที่ไม่ได้รับคำสั่งลบจะตามทันภายในนาที)
 *  - ทันทีเมื่อเจอ id ที่ไม่รู้จัก (บัญชีเพิ่งสร้าง) แต่ไม่ถี่กว่าทุก 5 วินาที
 *    กันโทเคนปลอม/ของคนที่ถูกลบยิงรัวจนฐานข้อมูลโดนถามทุกคำขอ
 */
import { prisma } from "../prisma";

const MAX_AGE_MS = 60_000;
const MIN_GAP_MS = 5_000;

let active: Set<number> | null = null;
let loadedAt = 0;
let loading: Promise<void> | null = null;

function reload() {
  if (!loading) {
    loading = prisma.user
      .findMany({ where: { deletedAt: null }, select: { id: true } })
      .then((rows) => {
        active = new Set(rows.map((r) => r.id));
        loadedAt = Date.now();
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

export async function isActiveUser(id: number) {
  const age = Date.now() - loadedAt;
  if (!active || age > MAX_AGE_MS) await reload();
  else if (!active.has(id) && age > MIN_GAP_MS) await reload();
  return active!.has(id);
}

/** เรียกทันทีหลังลบ — เครื่องนี้ตัดโทเคนของคนนั้นตั้งแต่คำขอถัดไป */
export function forgetUser(id: number) {
  active?.delete(id);
}

/**
 * เรียกตอนเข้าระบบ/สมัคร — ตรวจกับฐานข้อมูลมาแล้วว่ายังใช้งานได้
 * ไม่งั้นบัญชีที่เพิ่งสร้างแล้วเข้าระบบภายใน 5 วินาทีหลังโหลดรายชื่อ จะถูกปฏิเสธคำขอแรก
 */
export function rememberUser(id: number) {
  active?.add(id);
}
