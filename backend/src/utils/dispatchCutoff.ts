/**
 * เวลาปิดรับปล่อยงาน (เจ้าของงานขอ ต.ค. 69) — ใบที่รอหัวหน้าภาคปล่อยงาน/ส่งช่างตรวจ ปล่อยได้ถึง
 * "วันก่อนวันนัด เวลาที่แอดมินตั้ง" (ตั้งต้น 16:00) ตามเวลาไทยของเซิร์ฟเวอร์ ไม่ใช่นาฬิกามือถือ
 *
 * ทุกอย่างที่ตัดสินว่าใบไหนล็อกอยู่ที่ไฟล์นี้ที่เดียว — ปุ่มปล่อยงาน กล่องงานแอดมิน แผนงาน และหน้าจอ
 * ต้องเห็นตรงกันทุกตัวอักษร ถ้าแต่ละที่คิดเอง วันหนึ่งจะมีใบที่แอปบอก "ยังปล่อยได้" แต่เซิร์ฟเวอร์ไม่รับ
 *
 * ไม่มีอะไรเกิดขึ้นตอน 16:00 เอง (ไม่มีงานตั้งเวลา) — สถานะล็อกคิดใหม่ทุกครั้งที่อ่าน/เขียนใบ
 * เซิร์ฟเวอร์บน Render หลับได้ งานตั้งเวลาที่พลาดรอบเดียวจะทำให้ใบค้างผิดสถานะทั้งวัน
 */
import { prisma } from "../prisma";
import { bangkokDay } from "./constants";

export const CUTOFF_KEY = "dispatchCutoff";
export const CUTOFF_DEFAULT = "16:00";
/** ค่าที่แอดมินเลือกได้ (คำถามข้อ 13) — ช่วงที่เจ้าของงานยอม ไม่ให้ตั้งเที่ยงคืนแล้วกฎหายไปทั้งระบบ */
export const CUTOFF_CHOICES = ["15:00", "15:30", "16:00", "16:30", "17:00"] as const;
/** ขั้นที่กดปล่อยงาน — รับทราบ ปล่อยงาน (ซ่อม) และส่งช่างตรวจ (เจ้าของงานตอบข้อ ก ให้ใช้กฎเดียวกัน) */
export const RELEASE_STAGES: string[] = ["ASSIGNED", "INSPECT_DISPATCH"];

export type CutoffConfig = {
  /** "HH:MM" ที่ใช้ตัดสินตอนนี้ */
  time: string;
  /** เวลาที่เริ่มใช้กฎ = createdAt ของแถวแรก (ใส่โดย migration) — ใบที่เส้นตายอยู่ก่อนหน้านี้ไม่ล็อกย้อนหลัง (ข้อ 14) */
  since: Date;
  /** เปลี่ยนล่าสุดเมื่อไร ใคร จากค่าอะไร — ว่างทั้งสามถ้ายังไม่เคยมีใครเปลี่ยนจากค่าตั้งต้น */
  changedAt: Date | null;
  changedByName: string | null;
  previous: string | null;
};

export type ReleaseState = {
  /** กดได้ถึงก่อนเวลานี้ (เวลานี้พอดีกดไม่ได้แล้ว — ข้อ 6 "ก่อน 16:00 น.") */
  deadline: Date;
  /** เส้นตายอยู่หลังเวลาเริ่มใช้กฎ — false = ใบที่ค้างมาตั้งแต่ก่อนเปิดกฎ ไม่ล็อก */
  enforced: boolean;
  /** วันนัดผ่านไปแล้ว (ตามวันของเซิร์ฟเวอร์) — แก้เป็นงานด่วนไม่ได้ ต้องเลื่อนวันนัด */
  past: boolean;
  /** แอดมินแก้เป็นงานด่วนให้วันนัดนี้ และวันนัดยังไม่ผ่าน */
  urgent: boolean;
  /** เคยแก้เป็นงานด่วนให้วันนี้ แต่วันนัดผ่านไปแล้ว — ข้อความต้องบอกว่าหมดอายุ ไม่ใช่ "ยังไม่ได้แก้" */
  urgentExpired: boolean;
  locked: boolean;
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 86_400_000;
/**
 * หน้าจอ/รายการอ่านค่าจากหน่วยความจำได้ 30 วิ — รายการใบงานถูกเรียกหลายสิบครั้งต่อนาที ไม่คุ้มไปถามฐานข้อมูลทุกครั้ง
 * ส่วนที่ตัดสินจริง (กดปล่อยงาน ขอแก้เป็นงานด่วน หน้าตั้งค่า) ต้องส่ง fresh — ข้อ 13 "มีผลกับการกดครั้งต่อไปทันที"
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
  // ค่าที่ไม่ใช่ HH:MM มาได้ทางเดียวคือมีคนแก้ในฐานข้อมูลตรง ๆ — ใช้ 16:00 แทนการล่มทั้งปุ่มปล่อยงาน แต่ต้องมีร่องรอยใน log
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
 * งานวันจันทร์ปิดรับวันอาทิตย์ เพราะ "วันอาทิตย์ช่างก็ยังทำงาน"
 */
export function deadlineOf(day: string, time: string): Date {
  return new Date(`${addDays(day, -1)}T${time}:00.000+07:00`);
}

/**
 * สถานะเวลาปิดรับของใบหนึ่ง ณ เวลา now — null = ใบนี้ไม่อยู่ใต้กฎ
 * (ไม่ได้อยู่ขั้นปล่อยงาน · ใบทดสอบไม่ติดกฎ (ข้อ 15) · ยังไม่มีวันนัด)
 *
 * งานด่วนใช้ได้เมื่อวันที่แอดมินปลดล็อกตรงกับวันนัดตอนนี้เท่านั้น — ทางที่เปลี่ยนวันนัดแล้วลืมล้าง
 * urgentReleaseFor วันจะไม่ตรงกันและกลับมาล็อกเอง แทนที่จะปลดล็อกวันใหม่ที่แอดมินไม่ได้ตั้งใจ
 */
export function releaseState(
  o: { status: string; isTest: boolean; scheduledAt: Date | null; urgentReleaseFor: Date | null },
  cfg: CutoffConfig,
  now: Date
): ReleaseState | null {
  if (!RELEASE_STAGES.includes(o.status) || o.isTest || !o.scheduledAt) return null;
  const day = dayOf(o.scheduledAt);
  const deadline = deadlineOf(day, cfg.time);
  const enforced = deadline.getTime() >= cfg.since.getTime();
  const past = day < bangkokDay(now);
  const sameDay = !!o.urgentReleaseFor && dayOf(o.urgentReleaseFor) === day;
  const urgent = sameDay && !past;
  const urgentExpired = sameDay && past;
  const locked = enforced && !urgent && now.getTime() >= deadline.getTime();
  return { deadline, enforced, past, urgent, urgentExpired, locked };
}

/**
 * วันนัดแรกที่กฎมีผล — วันที่เส้นตายไม่ก่อนเวลาเริ่มใช้กฎ
 * เปิดกฎตอนเช้า: งานวันนี้ (เส้นตายเมื่อวาน) ยังปล่อยได้ งานพรุ่งนี้ติดกฎของวันนี้ (ข้อ 14)
 */
export function firstEnforcedDay(cfg: CutoffConfig): string {
  const next = addDays(bangkokDay(cfg.since), 1);
  return deadlineOf(next, cfg.time).getTime() >= cfg.since.getTime() ? next : addDays(next, 1);
}

/**
 * ช่วงวันนัดที่ "ล็อกและยังไม่ผ่าน" ณ เวลา now — ใช้กรองกล่องงานแอดมินด้วยคำสั่งเดียว ไม่ต้องไล่ทุกใบ
 * วันนี้ล็อกเสมอ (เส้นตายคือเมื่อวาน) · พรุ่งนี้ล็อกเมื่อเลยเวลาปิดรับของวันนี้ · null = ยังไม่มีวันไหนอยู่ใต้กฎ
 * วันที่ผ่านไปแล้วไม่อยู่ในช่วงนี้ — เป็นหัวข้อ "เลยนัด" ของแอดมิน แยกกัน
 */
export function lockedDates(cfg: CutoffConfig, now: Date): { from: string; to: string } | null {
  const today = bangkokDay(now);
  const tomorrow = addDays(today, 1);
  const last = now.getTime() >= deadlineOf(tomorrow, cfg.time).getTime() ? tomorrow : today;
  const enforcedFrom = firstEnforcedDay(cfg);
  const from = enforcedFrom > today ? enforcedFrom : today;
  return from <= last ? { from, to: last } : null;
}
