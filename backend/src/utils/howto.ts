/**
 * สอนการใช้งานในแอป — ฝั่งเซิร์ฟเวอร์แค่ "จำ" ว่าใครเห็นอะไรแล้ว (User.howtoSeen · เจ้าของงานเลือก ต.ค. 69)
 *
 * ข้อความ ขั้น และรายชื่อหน้าอยู่ในแอปทั้งหมด (mobile/src/screens/*.howto.ts) เซิร์ฟเวอร์ไม่รู้ว่ามีหน้าไหนบ้าง
 * เพิ่มหน้าใหม่รอบหน้าจึงไม่ต้องแก้เซิร์ฟเวอร์ — แค่ตรวจรูปแบบชื่อและจำนวนไม่ให้ช่องนี้โตไม่มีที่สิ้นสุด
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

/** สิ่งที่แอปได้ใน login · /auth/me · /usage — แอปตัดสินจากตรงนี้ว่าจะขึ้นกล่องต้อนรับ ข้อความสั้น หรือไม่ขึ้นอะไร */
export type HowToState = {
  /** ช่องว่าง (NULL) = บัญชีที่มีก่อนวันเปิดใช้ — พนักงานเดิม ได้แค่ข้อความสั้นครั้งเดียว */
  legacy: boolean;
  /** บัญชีใหม่ หรือแอดมินกด "ให้ดูวิธีใช้ใหม่" — ขึ้นกล่องต้อนรับครั้งเดียว */
  pending: boolean;
  welcomeAt: string | null;
  noticeAt: string | null;
  /** หน้าที่ดูจบแล้ว (กด "เข้าใจแล้ว") → เวลา */
  tours: Record<string, string>;
  resetAt: string | null;
};

/**
 * ชื่อหน้า = "<บทบาท>.<หน้า>" เช่น tech.myday · sup.newOrder — ตัวอักษรอังกฤษล้วน
 * กันไม่ให้ใครยิงข้อความยาว ๆ หรือภาษาอื่นมาเป็นชื่อ (ชื่อพวกนี้ขึ้นเป็นคีย์ใน JSON ของทุกบัญชี)
 */
export const HOWTO_TOUR_ID = /^[a-z]{2,10}\.[a-zA-Z]{2,24}$/;
/** รอบแรกมี 11 หน้า — เผื่อไว้หลายรอบ แต่ไม่ให้แอปที่พังวนส่งชื่อใหม่ไม่รู้จบจนแถวผู้ใช้บวม */
export const HOWTO_MAX_TOURS = 40;
/** ค่าของบัญชีที่สร้างใหม่ทุกทาง (แอดมินสร้าง · นำเข้ารายชื่อ · นำเข้า Area Team · คนแรกของระบบ) */
export const HOWTO_NEW = { pending: true } as const;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** อ่านช่อง howtoSeen แบบไม่เชื่อรูปร่าง — ค่าแปลก ๆ (แก้มือในฐานข้อมูล) ถือเป็นว่าง ไม่ทำให้ล็อกอินพัง */
export function howtoOf(raw: Prisma.JsonValue | null | undefined): HowToState {
  const o = isObject(raw) ? raw : {};
  const tours: Record<string, string> = {};
  if (isObject(o.tours)) for (const [k, v] of Object.entries(o.tours)) if (typeof v === "string") tours[k] = v;
  return {
    legacy: raw === null || raw === undefined,
    pending: o.pending === true,
    welcomeAt: str(o.welcome),
    noticeAt: str(o.notice),
    tours,
    resetAt: str(o.resetAt),
  };
}

export type HowToMark = { welcome: true } | { notice: true } | { tour: string };
export type HowToResult = { ok: true; howto: HowToState } | { ok: false; status: 400 | 404; error: string };

/** ค่าปัจจุบันที่เป็น object เสมอ — NULL (พนักงานเดิม) หรือค่าแปลก ๆ เริ่มจาก {} แทน ไม่งั้น || กับ array กลายเป็นต่อ array */
const BASE = Prisma.sql`(CASE WHEN jsonb_typeof("howtoSeen") = 'object' THEN "howtoSeen" ELSE '{}'::jsonb END)`;
const TOURS = Prisma.sql`(CASE WHEN jsonb_typeof("howtoSeen"->'tours') = 'object' THEN "howtoSeen"->'tours' ELSE '{}'::jsonb END)`;

/**
 * จดว่าเจ้าของบัญชีตอบกล่องต้อนรับ / ข้อความสั้น / ดูหน้าไหนจบ — คำสั่งเดียว (UPDATE … RETURNING) ไม่อ่านก่อนเขียน
 *
 * ช่างเปิดทั้งมือถือและคอม ดูจบสองหน้าพร้อมกันจากสองเครื่องได้ — อ่านมาแก้แล้วเขียนกลับ หน้าหนึ่งจะหายเงียบ ๆ
 * รวม JSON ในฐานข้อมูลทีเดียวจึงติดทั้งคู่ · ไม่มี transaction แบบ interactive (ถ้าวันหน้าเปลี่ยนไปใช้ ต้องใส่ timeout ตาม CLAUDE.md)
 */
export async function markHowto(userId: number, kind: HowToMark): Promise<HowToResult> {
  const iso = new Date().toISOString();
  let rows: { howtoSeen: Prisma.JsonValue }[];
  if ("tour" in kind) {
    const id = kind.tour;
    /**
     * ดูจบหน้าไหนก็ตาม = รู้แล้วว่าปุ่ม ? อยู่ไหน — ปิดกล่องต้อนรับที่ค้าง (pending) และข้อความสั้นไปด้วย
     * ไม่งั้นคนที่เปิดวิธีใช้เองจากเมนูก่อน จะยังเจอข้อความ "ใหม่: วิธีใช้หน้านี้" ทีหลังอีก
     * หน้าที่มีอยู่แล้วจดเวลาใหม่ได้เสมอ · หน้าใหม่ได้เฉพาะตอนยังไม่ครบเพดาน
     */
    rows = await prisma.$queryRaw<{ howtoSeen: Prisma.JsonValue }[]>`
      UPDATE "User" SET "howtoSeen" =
        (${BASE} - 'pending')
        || jsonb_build_object('tours', ${TOURS} || jsonb_build_object(${id}::text, ${iso}::text))
        || CASE WHEN ${BASE}->>'welcome' IS NOT NULL OR ${BASE}->>'notice' IS NOT NULL THEN '{}'::jsonb
                ELSE jsonb_build_object('notice', ${iso}::text) END
      WHERE id = ${userId}
        AND (${TOURS}->>${id}::text IS NOT NULL OR (SELECT count(*) FROM jsonb_object_keys(${TOURS})) < ${HOWTO_MAX_TOURS}::int)
      RETURNING "howtoSeen"`;
    if (!rows.length) {
      const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      return exists
        ? { ok: false, status: 400, error: `บันทึกวิธีใช้ได้ไม่เกิน ${HOWTO_MAX_TOURS} หน้า` }
        : { ok: false, status: 404, error: "ไม่พบผู้ใช้" };
    }
  } else {
    // ตอบกล่องต้อนรับหรือข้อความสั้นแล้ว (กดเริ่ม · ไว้ทีหลัง · เข้าใจแล้ว · Esc) — ไม่ขึ้นเองอีก
    const key = "welcome" in kind ? "welcome" : "notice";
    rows = await prisma.$queryRaw<{ howtoSeen: Prisma.JsonValue }[]>`
      UPDATE "User" SET "howtoSeen" = (${BASE} - 'pending') || jsonb_build_object(${key}::text, ${iso}::text)
      WHERE id = ${userId}
      RETURNING "howtoSeen"`;
    if (!rows.length) return { ok: false, status: 404, error: "ไม่พบผู้ใช้" };
  }
  return { ok: true, howto: howtoOf(rows[0].howtoSeen) };
}
