/**
 * เวลาปิดนัดงานพรุ่งนี้ (เจ้าของงานขอ ต.ค. 69 · ย้ายจากขั้นปล่อยงานมาที่การนัดวัน 2 พ.ย. 69) — หัวหน้าภาคนัดวันเข้า
 * (นัดวันเข้า · ไม่ใช้อะไหล่จ่ายงาน · ส่งตรวจ) ได้ถึง "วันก่อนวันนัด เวลาที่แอดมินตั้ง" (ตั้งต้น 16:00) ตามเวลาไทยของเซิร์ฟเวอร์
 * ไม่ใช่นาฬิกามือถือ — วันนี้ปิดตลอด · พรุ่งนี้ปิดตั้งแต่เวลานั้นของวันนี้ · มะรืนเป็นต้นไปเปิด
 * เดิม (PR #165) ล็อกที่ขั้นปล่อยงาน ซึ่งเป็นขั้นผิด: เจ้าของงานหมายถึง "การนัดวันลูกค้า" ไม่ใช่วันที่หัวหน้าภาคกดปล่อย (WO-01192)
 *
 * ทุกอย่างที่ตัดสินว่าวันไหนปิดนัดอยู่ที่ไฟล์นี้ที่เดียว — ปุ่มนัดวัน คอนเฟิร์ม/เลื่อนวันนัดของแอดมิน แก้เป็นงานด่วน
 * และหน้าจอ (mobile/src/utils/dispatchCutoff.ts คิดตามสูตรเดียวกัน) ต้องเห็นตรงกันทุกตัวอักษร
 * ถ้าแต่ละที่คิดเอง วันหนึ่งจะมีวันที่ปฏิทินบอก "ยังนัดได้" แต่เซิร์ฟเวอร์ไม่รับ
 *
 * ไม่มีอะไรเกิดขึ้นตอน 16:00 เอง (ไม่มีงานตั้งเวลา) — วันไหนปิดคิดใหม่ทุกครั้งที่อ่าน/เขียนใบ
 * เซิร์ฟเวอร์บน Render หลับได้ งานตั้งเวลาที่พลาดรอบเดียวจะทำให้ใบค้างผิดสถานะทั้งวัน
 */
import { prisma } from "../prisma";
import { bangkokDay } from "./constants";

export const CUTOFF_KEY = "dispatchCutoff";
export const CUTOFF_DEFAULT = "16:00";
/** ค่าที่แอดมินเลือกได้ (คำถามข้อ 13) — ช่วงที่เจ้าของงานยอม ไม่ให้ตั้งเที่ยงคืนแล้วกฎหายไปทั้งระบบ */
export const CUTOFF_CHOICES = ["15:00", "15:30", "16:00", "16:30", "17:00"] as const;
/**
 * ขั้นที่หัวหน้าภาครับทราบ ปล่อยงาน (ซ่อม) / ส่งช่างตรวจ — ไม่มีกฎเวลาแล้ว (เจ้าของงานตอบข้อ 1, 2 พ.ย. 69)
 * ยังต้องใช้ชุดนี้: ป้าย "คอนเฟิร์มวันใหม่" (isRescheduled) และหัวข้อ "เลยนัด" ของแอดมิน (pastRelease)
 */
export const RELEASE_STAGES: string[] = ["ASSIGNED", "INSPECT_DISPATCH"];
/**
 * ขั้นที่หัวหน้าภาคเลือกวันเข้า — NEW (ไม่ใช้อะไหล่จ่ายงาน · ส่งตรวจ) และ PARTS_CHECKED (นัดวันเข้า) (เจ้าของงานตอบข้อ 5)
 * คำขอ "ขอแอดมินแก้เป็นงานด่วน" และปุ่มแก้เป็นงานด่วนทางตรงของแอดมินใช้ได้เฉพาะสองขั้นนี้
 */
export const SCHEDULE_STAGES: string[] = ["NEW", "PARTS_CHECKED"];

export type CutoffConfig = {
  /** "HH:MM" ที่ใช้ตัดสินตอนนี้ */
  time: string;
  /** เวลาที่เริ่มใช้กฎ = createdAt ของแถวแรก (ใส่โดย migration) — วันที่เส้นตายอยู่ก่อนหน้านี้ไม่ปิดย้อนหลัง (ข้อ 14) */
  since: Date;
  /** เปลี่ยนล่าสุดเมื่อไร ใคร จากค่าอะไร — ว่างทั้งสามถ้ายังไม่เคยมีใครเปลี่ยนจากค่าตั้งต้น */
  changedAt: Date | null;
  changedByName: string | null;
  previous: string | null;
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 86_400_000;
/**
 * หน้าจอ/รายการอ่านค่าจากหน่วยความจำได้ 30 วิ — รายการใบงานถูกเรียกหลายสิบครั้งต่อนาที ไม่คุ้มไปถามฐานข้อมูลทุกครั้ง
 * ส่วนที่ตัดสินจริง (นัดวัน · คอนเฟิร์ม/เลื่อนวันนัด · แก้เป็นงานด่วน · ขอแก้เป็นงานด่วน · หน้าตั้งค่า) ต้องส่ง fresh
 * — ข้อ 13 "มีผลกับการกดครั้งต่อไปทันที"
 */
const CACHE_MS = 30_000;

let cached: { cfg: CutoffConfig; at: number } | null = null;
// เพิ่มทุกครั้งที่ล้างค่าที่จำไว้ — คำถามที่ส่งไปก่อนแอดมินเปลี่ยนเวลา แต่ตอบกลับมาทีหลัง ต้องไม่เอาค่าเก่ามาทับ
let generation = 0;
const warnedValues = new Set<string>();

/** "YYYY-MM-DD" บวก/ลบวัน — คิดแบบ UTC ล้วน ข้ามสิ้นเดือน/สิ้นปีได้ (ไทยไม่มีเวลาออมแสง +07:00 ตลอด) */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * วันนัดของใบ — scheduledAt เก็บเป็นเที่ยงคืน UTC ของวันนั้น อ่านวันจาก UTC แบบเดียวกับ seenMatches
 * (ไม่ใช่ bangkokDay — แถวที่ไม่ได้เก็บตรงเที่ยงคืนพอดีจะเลื่อนไปอีกวันถ้าบวก 7 ชั่วโมง)
 */
export function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function validTime(v: string | null | undefined): string {
  if (v && HHMM.test(v)) return v;
  // ค่าที่ไม่ใช่ HH:MM มาได้ทางเดียวคือมีคนแก้ในฐานข้อมูลตรง ๆ — ใช้ 16:00 แทนการล่มทุกปุ่มนัดวัน แต่ต้องมีร่องรอยใน log
  if (v != null && !warnedValues.has(v)) {
    warnedValues.add(v);
    console.warn(`[dispatchCutoff] ค่า "${v}" ไม่ใช่ HH:MM — ใช้ ${CUTOFF_DEFAULT} แทน`);
  }
  return CUTOFF_DEFAULT;
}

/**
 * ค่าตอนนี้ — แถวล่าสุดของ key คือเวลาที่ใช้ แถวแรกคือเวลาเริ่มใช้กฎ แถวก่อนล่าสุดคือ "เปลี่ยนจาก"
 *
 * ไม่มีแถวเลย (มีคนลบทิ้ง) ยังทำงานได้: 16:00 และกฎเปิดเต็มที่ (since = 1970) — ปลอดภัยกว่าปิดกฎเงียบ ๆ
 * ค่านอก CUTOFF_CHOICES อ่านได้ตามจริง (เทสต์ใส่เวลาใด ๆ ทาง SQL เพื่อคุมเวลา) แต่ PUT รับเฉพาะใน CUTOFF_CHOICES
 */
export async function readCutoff(opts?: { fresh?: boolean }): Promise<CutoffConfig> {
  if (!opts?.fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.cfg;
  const gen = generation;
  const startedAt = Date.now();
  const [first, recent] = await Promise.all([
    prisma.appSetting.findFirst({
      where: { key: CUTOFF_KEY },
      orderBy: { id: "asc" },
      select: { id: true, createdAt: true },
    }),
    prisma.appSetting.findMany({
      where: { key: CUTOFF_KEY },
      orderBy: { id: "desc" },
      take: 2,
      select: { id: true, value: true, createdAt: true, createdBy: { select: { name: true } } },
    }),
  ]);
  const [last, prev] = recent;
  // แถวล่าสุดเป็นแถวแรกเอง = ยังไม่เคยมีใครเปลี่ยน — การ์ดตั้งค่าขึ้น "ค่าตั้งต้น 16:00 น." ไม่ใช่ "เปลี่ยนล่าสุด: (ไม่มีชื่อ)"
  const changed = !!last && !!first && last.id !== first.id;
  const cfg: CutoffConfig = {
    time: validTime(last?.value),
    since: first?.createdAt ?? new Date(0),
    changedAt: changed ? last.createdAt : null,
    changedByName: changed ? (last.createdBy?.name ?? null) : null,
    previous: changed && prev ? validTime(prev.value) : null,
  };
  if (gen === generation && (!cached || startedAt >= cached.at)) cached = { cfg, at: startedAt };
  return cfg;
}

/** ล้างค่าที่จำไว้หลังเปลี่ยนเวลา — คำถามที่ค้างอยู่ก่อนหน้านี้จะไม่เขียนค่าเก่ากลับมา */
export function forgetCutoff() {
  generation += 1;
  cached = null;
}

/**
 * เส้นตายของวันนัด = วันก่อนวันนัด เวลา time (เวลาไทย) — ทุกวันนับเหมือนกัน รวมเสาร์–อาทิตย์และวันหยุด (ข้อ ค · จ)
 * งานวันจันทร์ปิดนัดวันอาทิตย์ เพราะ "วันอาทิตย์ช่างก็ยังทำงาน"
 */
export function deadlineOf(day: string, time: string): Date {
  return new Date(`${addDays(day, -1)}T${time}:00.000+07:00`);
}

/**
 * วันนัดแรกที่กฎมีผล — วันที่เส้นตายไม่ก่อนเวลาเริ่มใช้กฎ (ขอบล่างของหัวข้อ "เลยนัด" ในกล่องงานแอดมิน)
 * เปิดกฎตอนเช้า: วันนี้ (เส้นตายเมื่อวาน) ยังไม่อยู่ใต้กฎ พรุ่งนี้ติดกฎของวันนี้ (ข้อ 14)
 */
export function firstEnforcedDay(cfg: CutoffConfig): string {
  const next = addDays(bangkokDay(cfg.since), 1);
  return deadlineOf(next, cfg.time).getTime() >= cfg.since.getTime() ? next : addDays(next, 1);
}

/**
 * วันนัด day ปิดแล้วหรือยัง ณ เวลา now — เลยเส้นตายของวันนั้น และเส้นตายอยู่หลังเวลาเริ่มใช้กฎ
 * วันนี้ปิดตลอด (เส้นตายคือเมื่อวาน) · พรุ่งนี้ปิดตั้งแต่เวลาปิดของวันนี้ (เวลานั้นพอดีก็ปิดแล้ว — ข้อ 6 ไม่มีเวลาผ่อน)
 * วันที่เส้นตายอยู่ก่อนเริ่มใช้กฎไม่ปิดย้อนหลัง — เช้าวัน deploy งานวันนี้ยังนัดได้ (ข้อ 14)
 */
export function closedFor(day: string, cfg: CutoffConfig, now: Date): boolean {
  const deadline = deadlineOf(day, cfg.time).getTime();
  return deadline >= cfg.since.getTime() && now.getTime() >= deadline;
}

/**
 * แอดมินแก้เป็นงานด่วนให้วันนี้ของใบนี้ไว้ไหม (urgentReleaseFor = วันที่แอดมินยอมให้นัดได้แม้ปิดนัดแล้ว)
 * เก็บเป็นวัน ไม่ใช่ true/false — หัวหน้าภาคนัดวันอื่น/แอดมินเลื่อนไปวันอื่นแล้ว วันไม่ตรงกัน หมดผลเองแม้ทางไหนลืมล้าง
 */
export function grantedFor(day: string, o: { urgentReleaseFor: Date | null }): boolean {
  return !!o.urgentReleaseFor && dayOf(o.urgentReleaseFor) === day;
}

/**
 * วันแรกที่ยังนัดได้ ณ เวลา now (ไม่นับงานด่วน) — ข้อความ "วันแรกที่นัดได้คือ …" และ firstOpen ในคำตอบ 400
 * วนอย่างมากสามรอบ: วันนี้ปิด พรุ่งนี้ปิดได้ มะรืนเปิดเสมอ (เส้นตายคือพรุ่งนี้ ยังไม่ถึง)
 */
export function firstOpenDay(cfg: CutoffConfig, now: Date): string {
  let d = bangkokDay(now);
  for (let i = 0; i < 3 && closedFor(d, cfg, now); i++) d = addDays(d, 1);
  return d;
}

export type ClosedRefusal = { error: string; code: "DATE_CLOSED"; day: string; firstOpen: string };

/**
 * คำตอบ 400 ตอนนัด/เลื่อนไปวันที่ปิดแล้ว — null = นัดวันนี้ได้ (ใบทดสอบ · แอดมินแก้เป็นงานด่วนให้วันนี้แล้ว · ยังไม่ปิด ·
 * แอดมินติ๊ก "แก้เป็นงานด่วนไปพร้อมกัน" มาในคำขอเดียวกัน)
 *
 * หัวหน้าภาคติ๊กมาก็ไม่มีผล — ปลดได้แต่แอดมิน (ข้อ 2 · 4) · ข้อความบอกทางไปต่อตามบทบาท: หัวหน้าภาคต้องเลือกวันใหม่หรือขอแอดมิน
 * แอดมินต้องติ๊ก · วันที่ปิดที่ไม่ใช่วันนี้มีแค่พรุ่งนี้ (เส้นตายของมะรืนยังไม่ถึง) สองข้อความต่อบทบาทจึงครบทุกกรณี
 * วันย้อนหลังไม่มาถึงที่นี่ — ปุ่มทุกปุ่มเช็ค "วันนัดย้อนหลังไม่ได้" ก่อน (ข้อความนั้นบอกวันแรกที่นัดได้ตรงกว่า)
 */
export function closedRefusal(
  day: string,
  o: { isTest: boolean; urgentReleaseFor: Date | null },
  cfg: CutoffConfig,
  receivedAt: Date,
  who: "supervisor" | "admin",
  ticked: boolean
): ClosedRefusal | null {
  if (o.isTest || grantedFor(day, o) || !closedFor(day, cfg, receivedAt)) return null;
  if (who === "admin" && ticked) return null;
  const today = day <= bangkokDay(receivedAt);
  const error =
    who === "supervisor"
      ? today
        ? "วันนี้นัดไม่ได้ — ต้องให้แอดมินแก้เป็นงานด่วน"
        : `เลย ${cfg.time} น. แล้ว — นัดพรุ่งนี้ไม่ได้ เลือกวันใหม่`
      : today
        ? "วันนี้ต้องเป็นงานด่วน — ต้องไปวันนี้จริง ติ๊ก “แก้เป็นงานด่วน” ก่อนบันทึก"
        : `พรุ่งนี้ปิดนัดแล้ว (เลย ${cfg.time} น.) — ต้องไปพรุ่งนี้จริง ติ๊ก “แก้เป็นงานด่วน” ก่อนบันทึก`;
  return { error, code: "DATE_CLOSED", day, firstOpen: firstOpenDay(cfg, receivedAt) };
}

/**
 * ใบรอปล่อยงาน/ส่งช่างตรวจที่วันนัดผ่านไปแล้ว — หัวข้อ "เลยนัด" ของแอดมิน (overdue) ไม่เปลี่ยนจากเดิม
 * ปล่อยได้แล้ว (ไม่มีล็อก) แต่ช่างไปตามวันที่ผ่านไปแล้วไม่ได้ แอดมินต้องโทรร้านเลื่อนวันนัด
 * นับเฉพาะวันที่อยู่ใต้กฎ (เส้นตายหลังเวลาเริ่มใช้กฎ) — ใบที่ค้างมาก่อนเปิดกฎไม่ท่วมกล่องแอดมินเช้าวัน deploy (ข้อ 14)
 * ใบทดสอบไม่นับ (ข้อ 15)
 */
export function pastRelease(
  o: { status: string; isTest: boolean; scheduledAt: Date | null },
  cfg: CutoffConfig,
  now: Date
): boolean {
  if (!RELEASE_STAGES.includes(o.status) || o.isTest || !o.scheduledAt) return false;
  const day = dayOf(o.scheduledAt);
  return day < bangkokDay(now) && deadlineOf(day, cfg.time).getTime() >= cfg.since.getTime();
}
