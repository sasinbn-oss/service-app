/**
 * เวลาปิดนัดงานพรุ่งนี้ (เจ้าของงานขอ ต.ค. 69 · ย้ายจากขั้นปล่อยงานมาที่การนัดวัน 2 พ.ย. 69) — ฝั่งแอป
 *
 * กฎตัดสินที่เซิร์ฟเวอร์เท่านั้น (backend/src/utils/dispatchCutoff.ts · เวลาที่คำขอไปถึง) ไฟล์นี้แค่ "คิดตาม" ค่าที่เซิร์ฟเวอร์ส่งมา
 * (cutoff · serverNow · urgentReleaseFor · urgentAsk) ด้วยนาฬิกาที่เดินต่อเอง ปฏิทินจึงปิดวันพรุ่งนี้ตอน 16:00 ได้เอง
 * โดยไม่ต้องให้ทุกจอโหลดรายการใหม่พร้อมกัน — pool ฐานข้อมูลมีแค่ 5 connection (src/prisma.ts)
 *
 * ย้ายเพราะ "การบล็อกวันคือการนัดวันลูกค้า" (เจ้าของงาน 2 พ.ย. 69 ดู WO-01192) — รุ่นแรกล็อกตอนปล่อยงาน
 * ซึ่งใบที่หัวหน้าภาคนัดไว้ทันเวลาก็ยังไปติดล็อกได้ถ้าแอดมินคอนเฟิร์มช้า กฎจึงตัดสินตอนเลือกวันแทน ขั้นปล่อยงานไม่มีเวลาอีกแล้ว
 *
 * นาฬิกาที่ใช้คือนาฬิกาเซิร์ฟเวอร์เสมอ ไม่ใช่นาฬิกามือถือ — มือถือตั้งเวลาผิดเป็นเรื่องปกติ
 * ถ้าปฏิทินบอก "ยังนัดพรุ่งนี้ได้" แต่เซิร์ฟเวอร์ปฏิเสธ หัวหน้าภาคจะไม่เชื่อปฏิทินอีกเลย
 *
 * ข้อความทุกคำมาจากตัวอย่างที่เจ้าของงานอนุมัติ (appt-cutoff 2 พ.ย. 69) — แก้คำต้องแก้ทั้งชุดให้ตรงกัน
 * ตัวสร้างหัวข้อ (supervisorBanners · adminGroups) อยู่ที่นี่ที่เดียว งานของฉันวันนี้กับกล่องงานจะได้บอกเหมือนกันทุกตัวอักษร
 */
import { useCallback, useEffect, useMemo, useState } from "react";

/** เวลาปิดนัด "HH:MM" + เวลาเริ่มใช้กฎ (วันที่เส้นตายอยู่ก่อนหน้านี้ไม่ปิดย้อนหลัง — ข้อ 14) */
export type Cutoff = { time: string; since: string };

/**
 * ขั้นปล่อยงาน (รับทราบ ปล่อยงาน · ส่งช่างตรวจ) — ไม่มีกฎเวลาแล้ว (2 พ.ย. 69) ยังใช้เรียงกลุ่มตามวันนัดในงานของฉันวันนี้
 * และหัวข้อ "ออกงานวันนี้" · ตรงกับ RELEASE_STAGES ฝั่งเซิร์ฟเวอร์
 */
export const RELEASE_STAGES = ["ASSIGNED", "INSPECT_DISPATCH"];
/**
 * ขั้นที่หัวหน้าภาคเลือกวันนัด (นัดวันเข้า · ไม่ใช้อะไหล่จ่ายงาน · ส่งตรวจ) — ที่เดียวที่กฎ 16:00 ตัดสิน · ตรงกับ SCHEDULE_STAGES ฝั่งเซิร์ฟเวอร์
 * ขั้นระบุอะไหล่ (NEW) นับด้วยแม้หัวหน้าภาคอาจเลือก "ใช้อะไหล่" ที่ยังไม่ต้องนัด — การ์ดต้องเตือนก่อนเปิดฟอร์ม ไม่ใช่หลังเลือกทางแล้ว
 */
export const SCHEDULE_STAGES = ["NEW", "PARTS_CHECKED"];

/** คำขอนัดด่วนของหัวหน้าภาคที่ยังรอแอดมิน — day = วันที่ร้านต้องการ ("YYYY-MM-DD") */
export type UrgentAsk = { day: string; at: string; note: string | null; byName: string | null };
/** แอดมินตอบคำขอ (ไม่แก้เป็นงานด่วน) — รูปเดียวกับคำขอ หัวหน้าภาคเห็นในฟอร์มนัดวันแล้วนัดวันอื่น */
export type UrgentAnswer = UrgentAsk;

/** ช่องที่กฎนัดวันอ่าน — แถวรายการกับใบงานของหน้าใบงานเข้ารูปนี้ได้ทั้งคู่ */
export interface CutoffRow {
  id: number;
  code: string;
  status: string;
  scheduledAt: string | null;
  scheduledTime?: string | null;
  isTest?: boolean;
  /** วันที่แอดมินให้นัดได้แม้ปิดนัดแล้ว (แก้เป็นงานด่วน) — เฉพาะใบนี้ วันนั้น */
  urgentReleaseFor?: string | null;
  urgentAsk?: UrgentAsk | null;
}

/**
 * ช่วงเตือนเลื่อนตามเวลาที่แอดมินตั้ง: ส้ม 3 ชม. ก่อนปิด (13:00 ถ้าปิด 16:00 — เจ้าของงานข้อ 7) · แดง 30 นาทีสุดท้าย
 * ฟอร์มของแอดมินไม่มีช่วงเตือน — แอดมินไม่ได้แข่งกับเวลาปิด (ปลดวันที่ปิดได้เองด้วยการติ๊ก) บรรทัดขึ้นเฉพาะวันที่ปิดแล้ว
 */
export const AMBER_MIN = 180;
export const RED_MIN = 30;

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;
// ไทยไม่มีเวลาออมแสง +07:00 ตลอดปี — บวกตรง ๆ ได้ ไม่ต้องพึ่งโซนเวลาของเครื่อง (เครื่องที่ตั้งโซนอื่นต้องไม่เห็นวันผิด)
const BKK_MS = 7 * 3_600_000;
const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" บวก/ลบวัน — คิดแบบ UTC ล้วน ข้ามสิ้นเดือน/สิ้นปีได้ */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** วันตามเวลาไทยของนาฬิกาเซิร์ฟเวอร์ — ทุกการตัดสิน "วันนี้/พรุ่งนี้" บนจอที่มีเส้นตายใช้ตัวนี้ ไม่ใช่ todayBkk() (นาฬิกาเครื่อง) */
export function serverDay(now: number): string {
  return new Date(now + BKK_MS).toISOString().slice(0, 10);
}

/** วันจาก a ถึง b (บวก = b อยู่หลัง) */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / DAY_MS);
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** นาทีของวันตามเวลาไทย */
function bkkMinutes(now: number): number {
  const d = new Date(now + BKK_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** "15:42" ตามเวลาไทย */
export function hhmmOf(t: number | string): string {
  const d = new Date((typeof t === "string" ? Date.parse(t) : t) + BKK_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "ส. 31 ต.ค." — เส้นตายอยู่แค่วันก่อนวันนัด ปีไม่ช่วยให้อ่านเร็วขึ้น (แบบเดียวกับ shortDayText ฝั่งเซิร์ฟเวอร์) */
export function dayShort(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** "ส. 31 ต.ค. 69" — เท่ากับ visitText ฝั่งเซิร์ฟเวอร์ (ไม่มีเวลา) ข้อความในแอปกับข้อความ 409 จะได้ตรงกัน */
export function dayFull(ymd: string): string {
  return `${dayShort(ymd)} ${pad((Number(ymd.slice(0, 4)) + 543) % 100)}`;
}

/** "ส. 31 ต.ค. 15:42" — เวลาที่เกิดเรื่อง (หัวหน้าภาคขอนัดด่วนเมื่อ …) */
export function whenText(t: number | string): string {
  const ms = typeof t === "string" ? Date.parse(t) : t;
  return `${dayShort(serverDay(ms))} ${hhmmOf(ms)}`;
}

/** "10:30 น." / "ทั้งวัน" — นัดไม่ระบุเวลา = ไปได้ทั้งวัน */
export function timeText(time: string | null | undefined): string {
  return time ? `${time} น.` : "ทั้งวัน";
}

/** "N ชม. M นาที" — ปัดเศษลงแบบตัวอย่าง (ไม่บอกเวลาเหลือมากกว่าที่มีจริง) */
export function leftText(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / MIN_MS));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return m > 0 ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
  return `${m} นาที`;
}

/**
 * เส้นตายของวันนัด = วันก่อนวันนัด เวลาที่แอดมินตั้ง (เวลาไทย) — ทุกวันนับเหมือนกัน รวมเสาร์–อาทิตย์และวันหยุด (ข้อ ค · จ)
 * คืนเป็นมิลลิวินาที — กดได้ถ้า now < ค่านี้
 */
export function deadlineOf(day: string, time: string): number {
  return Date.parse(`${addDays(day, -1)}T${time}:00.000+07:00`);
}

export type CutoffPhase = "calm" | "amber" | "red" | "closed";

/** ช่วงของวันนี้เทียบกับเวลาปิดนัด (ตัวอย่าง timePhase) — สีตามช่วงเดียวกับป้ายนับถอยหลัง */
export function phaseOf(now: number, time: string): CutoffPhase {
  const tod = bkkMinutes(now);
  const c = minutesOf(time);
  if (tod >= c) return "closed";
  if (tod >= c - RED_MIN) return "red";
  if (tod >= c - AMBER_MIN) return "amber";
  return "calm";
}

/**
 * offset นาฬิกาเซิร์ฟเวอร์จำตาม serverNow แต่ละค่า ตั้งแต่ครั้งแรกที่เห็น (= ตอนคำตอบมาถึง)
 * ถ้าคิดใหม่ทุกครั้งที่จอขึ้น จอที่กลับมาเปิดด้วยข้อมูลเดิมเมื่อ 5 นาทีก่อนจะได้นาฬิกาช้าไป 5 นาที
 * — ใกล้ 16:00 ปฏิทินจะบอก "ยังนัดพรุ่งนี้ได้" ทั้งที่เลยแล้ว
 */
const offsets = new Map<string, number>();
function offsetFor(serverNow: string | null | undefined): number {
  if (!serverNow) return 0;
  const known = offsets.get(serverNow);
  if (known !== undefined) return known;
  const t = Date.parse(serverNow);
  const off = Number.isFinite(t) ? t - Date.now() : 0;
  offsets.set(serverNow, off);
  // คำตอบเก่าไม่ต้องจำตลอดไป — จอที่เปิดอยู่จริงมีไม่กี่จอ
  if (offsets.size > 60) offsets.delete(offsets.keys().next().value as string);
  return off;
}

/** จุดถัดไปที่ป้ายเปลี่ยนสี/เปลี่ยนวัน: ปิดนัด−3 ชม. · ปิดนัด−30 นาที · ปิดนัด · เที่ยงคืน (เวลาไทย) */
function nextBoundary(now: number, time: string | null | undefined): number {
  const today = serverDay(now);
  const at = (mins: number) => Date.parse(`${today}T00:00:00.000+07:00`) + mins * MIN_MS;
  const marks = [24 * 60];
  if (time && /^\d{2}:\d{2}$/.test(time)) {
    const c = minutesOf(time);
    marks.push(c - AMBER_MIN, c - RED_MIN, c);
  }
  return Math.min(...marks.map(at).filter((t) => t > now));
}

/**
 * "ตอนนี้" ตามนาฬิกาเซิร์ฟเวอร์ (มิลลิวินาที) — วาดใหม่ทุก 30 วิ และตรงจุดเปลี่ยน (ปิดนัด−3 ชม. · −30 นาที · ปิดนัด · เที่ยงคืน)
 * ตัวนับเป็นนาที 30 วิพอ · จุดเปลี่ยนต้องตรงเวลา ปฏิทินจะได้ปิดวันพรุ่งนี้ตอน 16:00:00 ไม่ใช่ 16:00:29
 * serverNow ว่าง (เซิร์ฟเวอร์รุ่นเก่า) = ใช้นาฬิกาเครื่องไปก่อน ดีกว่าไม่ขึ้นอะไรเลย
 */
export function useServerClock(serverNow?: string | null, cutoffTime?: string | null, active = true): number {
  const offset = useMemo(() => offsetFor(serverNow), [serverNow]);
  const [, setTick] = useState(0);
  useEffect(() => {
    // ฟอร์มที่วาดค้างไว้แต่ซ่อนอยู่ (ฟอร์มขั้นตอนในหน้าใบงาน) ไม่ต้องเดิน — วาดใหม่ทุก 30 วิโดยไม่มีใครเห็นคือกินแบตมือถือเปล่า ๆ
    // เปิดขึ้นมาเมื่อไรเดินต่อเอง และค่าที่คืนคิดจากนาฬิกาตอนวาดเสมอ ไม่ใช่ค่าที่ค้างจากตอนหยุด
    if (!active) return;
    const bump = () => setTick((n) => n + 1);
    const every = setInterval(bump, 30_000);
    let edge: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      const now = Date.now() + offset;
      // +50 ms ให้ตัวจับเวลาของเบราว์เซอร์ที่ตื่นเร็วไปนิดยังข้ามเส้นแล้วจริง
      edge = setTimeout(() => {
        bump();
        arm();
      }, Math.max(250, nextBoundary(now, cutoffTime) - now + 50));
    };
    arm();
    return () => {
      clearInterval(every);
      if (edge) clearTimeout(edge);
    };
  }, [offset, cutoffTime, active]);
  return Date.now() + offset;
}

/**
 * ตัวอ่าน "ตอนนี้" ตามนาฬิกาเซิร์ฟเวอร์ ณ วินาทีที่เรียก — สำหรับตัดสินใจตอนแตะ ไม่ใช่สำหรับวาด
 * ค่าจาก useServerClock คือเวลาตอนวาดรอบล่าสุด เก่าได้ถึง 30 วิ: แตะ 15:00 ตอน 15:00:10 จะเห็นเป็น 14:59:50
 * แล้วข้ามกล่องยืนยันไปปิดวันพรุ่งนี้ของทั้งบริษัทเงียบ ๆ (จุดเปลี่ยนของ useServerClock คิดจากค่าปัจจุบัน ไม่ใช่จากชิปที่กำลังแตะ)
 * offset จำไว้ในจอเอง (useMemo) ไม่ไปอ่านตารางจำซ้ำตอนแตะ — ตารางทิ้งคำตอบเก่าได้ คิดใหม่ทีหลังจะได้นาฬิกาช้าเท่าเวลาที่จอเปิดค้าง
 */
export function useServerNowFn(serverNow?: string | null): () => number {
  const offset = useMemo(() => offsetFor(serverNow), [serverNow]);
  return useCallback(() => Date.now() + offset, [offset]);
}

/**
 * ข้อความหลังปล่อยงาน (ตัวอย่าง press) — บอกว่าทีมจะเห็นงานที่แท็บไหนของหน้างานของฉัน
 * หัวหน้าภาคมักโทรบอกทีมต่อ ต้องรู้ว่าทีมเปิดแท็บไหนแล้วจะเจอ · งานที่ปล่อยล่วงหน้าหลายวันทีมยังไม่เห็นจนถึงวันก่อนนัด
 * now = นาฬิกาเซิร์ฟเวอร์ (วันนี้/พรุ่งนี้ตามเซิร์ฟเวอร์ ไม่ใช่มือถือ)
 */
export function releasedText(o: { code: string; scheduledAt: string | null; assignedTeam: string | null }, inspect: boolean, now: number): string {
  const head = `${inspect ? "ส่งช่างตรวจ" : "ปล่อยงาน"} ${o.code} แล้ว`;
  if (!o.scheduledAt) return head;
  const day = o.scheduledAt.slice(0, 10);
  const rel = daysBetween(serverDay(now), day);
  const team = `ทีม${o.assignedTeam ?? ""}`;
  const tab = rel <= -1 ? "แท็บ “ค้าง”" : rel === 0 ? "แท็บ “วันนี้”" : rel === 1 ? "แท็บ “พรุ่งนี้”" : null;
  return tab ? `${head} — ${team} เห็นใน${tab} แล้ว` : `${head} — ${team} จะเห็นในแท็บ “พรุ่งนี้” ตั้งแต่ ${dayShort(addDays(day, -1))}`;
}

/**
 * ข้อความหลังส่งกลับแอดมินนัดใหม่ (ทีมไม่ว่างวันใหม่) — ขั้นปล่อยงานไม่มีล็อกแล้ว ใบจึงไปกล่องส่งกลับเดิมของแอดมินเสมอ
 * ไม่บอกชื่อหัวข้อ: ใบไปกล่องส่งกลับตามขั้น ไม่ใช่หัวข้อ "ขอนัดด่วน" — บอกหัวข้อผิดแย่กว่าไม่บอก
 */
export function declinedText(code: string): string {
  return `ส่ง ${code} กลับให้แอดมินนัดใหม่แล้ว — ใบออกจากรายการของคุณ`;
}

/**
 * ข้อความหลังแอดมินเลื่อนวันนัด/ดึงงานคืน (ตัวอย่าง saveMove) — แอดมินมักโทรบอกหัวหน้าภาคต่อ ต้องรู้ว่าใบไปอยู่ที่ไหน
 * releaseStage = หลังบันทึกใบอยู่ขั้นปล่อยงาน (เลื่อนใบขั้นปล่อยงาน/ดึงคืนจากช่าง) — ใบขั้นเบิก/โอน/คอนเฟิร์มยังไม่ไปถึงหัวหน้าภาค
 * ประโยค "ใบกลับไปที่หัวหน้าภาค…" จะไม่จริง จึงตัดออก
 * urgentTaken = ติ๊กแก้เป็นงานด่วนไปพร้อมกันและเซิร์ฟเวอร์ตั้งให้จริง — บอกตามที่เกิด ไม่ใช่ตามที่ติ๊ก
 * ไม่มีเส้นตายต่อท้ายแล้ว: ขั้นปล่อยงานกดได้ทุกเวลา กฎ 16:00 อยู่ที่การนัดวัน ซึ่งการเลื่อนครั้งนี้ผ่านมาแล้ว
 */
export function rescheduledText(code: string, day: string, o: { releaseStage: boolean; urgentTaken: boolean }): string {
  return `เลื่อนวันนัด ${code} เป็น ${dayFull(day)} แล้ว${o.releaseStage ? " — ใบกลับไปที่หัวหน้าภาคให้คอนเฟิร์มวันใหม่" : ""}${
    o.urgentTaken ? " · แก้เป็นงานด่วนไปพร้อมกันแล้ว" : ""
  }`;
}

/* ------------------------------------------------------------------------------------------------
 * กฎนัดวัน — ตรงกับ closedFor / grantedFor / firstOpenDay ฝั่งเซิร์ฟเวอร์ ผลต้องเหมือนกันทุกวินาที
 * ไม่งั้นปฏิทินบอกว่านัดได้แล้วเซิร์ฟเวอร์ปฏิเสธ (หรือขีดฆ่าวันที่เซิร์ฟเวอร์รับ — หัวหน้าภาคเสียงานเปล่า ๆ)
 * cutoff = null คือ "ไม่มีกฎ" — ใบทดสอบ (เซิร์ฟเวอร์ยกเว้นทุกทาง) และเซิร์ฟเวอร์รุ่นเก่าที่ไม่ส่ง cutoff:
 * ไม่ขีดฆ่า ไม่มีป้าย ไม่มีบรรทัด ไม่มีช่องติ๊ก ไม่มีปุ่มขอ — แอปต้องไม่โชว์กฎที่เซิร์ฟเวอร์ไม่บังคับ
 * ---------------------------------------------------------------------------------------------- */

const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** วันของค่า urgentReleaseFor — เซิร์ฟเวอร์ส่ง "YYYY-MM-DD" แต่ตัดเผื่อรุ่นที่ส่งเวลาเต็มมา */
const dayOfIso = (v: string | null | undefined): string | null => (v ? v.slice(0, 10) : null);
/**
 * วันนี้อยู่ใต้กฎไหม — เส้นตายก่อนเวลาเริ่มใช้กฎ (createdAt แถวแรกของค่าตั้ง) ไม่ปิด
 * วันที่เปิดกฎ ใบที่นัดวันนี้/พรุ่งนี้ไว้แล้วตามกติกาเดิมต้องไม่ถูกปิดย้อนหลัง
 */
function enforced(day: string, cutoff: Cutoff): boolean {
  return deadlineOf(day, cutoff.time) >= Date.parse(cutoff.since);
}

/**
 * วันนี้ปิดนัดแล้วหรือยัง ณ เวลา now (นาฬิกาเซิร์ฟเวอร์) — เส้นตาย = วันก่อนวันนัด เวลาที่แอดมินตั้ง
 * วันนี้: ปิดเสมอ (เส้นตายคือเมื่อวาน) · พรุ่งนี้: ปิดตั้งแต่เวลาปิดของวันนี้ · มะรืนขึ้นไป: เปิด
 * เท่ากับเส้นตายพอดีคือปิด (16:00:00.000 นัดพรุ่งนี้ไม่ได้ — เหมือนเซิร์ฟเวอร์)
 */
export function closedDay(day: string, now: number, cutoff: Cutoff | null | undefined): boolean {
  if (!cutoff || !YMD.test(day)) return false;
  return enforced(day, cutoff) && now >= deadlineOf(day, cutoff.time);
}

/** วันนี้นัดได้ไหม — เปิดอยู่ หรือแอดมินแก้เป็นงานด่วนให้วันนี้ (เฉพาะใบนี้ วันนั้น) */
export function dayAllowed(day: string, now: number, cutoff: Cutoff | null | undefined, urgentFor?: string | null): boolean {
  return !closedDay(day, now, cutoff) || dayOfIso(urgentFor) === day;
}

/**
 * วันแรกที่นัดได้โดยไม่ต้องให้แอดมินแก้เป็นงานด่วน — เริ่มที่วันนี้ (ใบที่กฎยังไม่ครอบวันนี้ได้วันนี้)
 * วนไม่เกินสามรอบ: มะรืนเปิดเสมอ (เส้นตายคือพรุ่งนี้ ยังไม่มาถึง)
 */
export function firstOpenDay(now: number, cutoff: Cutoff | null | undefined): string {
  let day = serverDay(now);
  for (let i = 0; i < 3 && closedDay(day, now, cutoff); i++) day = addDays(day, 1);
  return day;
}

/** ป้ายใต้ปฏิทิน (และสีของช่องวันนั้น) — วันนี้กับพรุ่งนี้เท่านั้น วันอื่นนัดได้ตามปกติ ไม่ต้องมีป้าย */
export type DayTag = { day: string; text: string; tone: "closed" | "amber" | "green" | "grey" };

/**
 * ป้ายของวันนี้/พรุ่งนี้ในปฏิทินนัดวัน (ตัวอย่าง supDays · admDays)
 * หัวหน้าภาค: วันที่ปิดขีดฆ่ากดไม่ได้ ป้ายบอกว่าทำไม · นับถอยหลังบนช่องพรุ่งนี้ตั้งแต่ 3 ชม. ก่อนปิด (เห็นก่อนเลือก ไม่ใช่หลังกดแล้วโดนปฏิเสธ)
 * แอดมิน: วันที่ปิดยังกดได้ (แอดมินปลดได้เองด้วยการติ๊ก) ป้ายจึงบอก "ต้องติ๊กงานด่วน" แทนการขีดฆ่า
 */
export function scheduleDayTags(
  now: number,
  cutoff: Cutoff | null | undefined,
  urgentFor: string | null | undefined,
  who: "supervisor" | "admin"
): DayTag[] {
  if (!cutoff) return [];
  const C = cutoff.time;
  const today = serverDay(now);
  const tomorrow = addDays(today, 1);
  const granted = dayOfIso(urgentFor);
  const out: DayTag[] = [];
  for (const day of [today, tomorrow]) {
    if (granted === day) {
      out.push({ day, text: "แอดมินแก้เป็นงานด่วน", tone: "green" });
    } else if (closedDay(day, now, cutoff)) {
      out.push(
        who === "admin"
          ? { day, text: "ต้องติ๊กงานด่วน", tone: "amber" }
          : { day, text: day === today ? "งานด่วนเท่านั้น" : `ปิด ${C} แล้ว`, tone: "closed" }
      );
    } else if (who === "supervisor" && day === tomorrow && enforced(day, cutoff)) {
      const remain = deadlineOf(day, C) - now;
      out.push(remain <= AMBER_MIN * MIN_MS ? { day, text: `เหลือ ${leftText(remain)}`, tone: "amber" } : { day, text: `นัดได้ถึง ${C}`, tone: "grey" });
    }
  }
  return out;
}

export type ScheduleTone = "grey" | "amber" | "blue" | "red" | "green";

/**
 * บรรทัดใต้ปฏิทินของหัวหน้าภาค (ตัวอย่าง s1Line) — ข้อแรกที่ตรงชนะ
 * แดง: วันที่เลือกไว้ปิดไปแล้วระหว่างเปิดฟอร์ม (ปุ่มบันทึกปิด) · เขียว: แอดมินแก้เป็นงานด่วนให้แล้ว · ฟ้า: เลยเวลาปิด บอกวันแรกที่นัดได้
 * ส้ม: 3 ชม. สุดท้าย · เทา: บอกกติกาไว้ก่อน หัวหน้าภาคจะได้รู้ว่าพรุ่งนี้นัดได้ถึงกี่โมง
 * null = ไม่มีบรรทัด (ไม่มีกฎ · พรุ่งนี้ยังไม่อยู่ใต้กฎ)
 */
export function scheduleLine(
  sel: string | null | undefined,
  now: number,
  cutoff: Cutoff | null | undefined,
  urgentFor: string | null | undefined
): { tone: ScheduleTone; text: string } | null {
  if (!cutoff) return null;
  const C = cutoff.time;
  const today = serverDay(now);
  const tomorrow = addDays(today, 1);
  const granted = dayOfIso(urgentFor);
  // วันย้อนหลังมีบรรทัดของมันเอง (วันนัดย้อนหลังไม่ได้) — ไม่ขึ้นแดงซ้อน
  if (sel && YMD.test(sel) && sel >= today && closedDay(sel, now, cutoff) && granted !== sel)
    return { tone: "red", text: `วันที่เลือกไว้ (${dayShort(sel)}) ปิดนัดแล้ว — เลย ${C} น. ตามเวลาระบบ · เลือกวันใหม่` };
  if (granted && granted >= today)
    return { tone: "green", text: `แอดมินแก้เป็นงานด่วนให้แล้ว — นัด ${dayShort(granted)} ได้ (เฉพาะใบนี้ · ลงประวัติแล้ว)` };
  if (!enforced(tomorrow, cutoff)) return null;
  if (closedDay(tomorrow, now, cutoff))
    return {
      tone: "blue",
      text: `เลย ${C} น. แล้ว — นัดพรุ่งนี้ (${dayShort(tomorrow)}) ไม่ได้ · วันแรกที่นัดได้คือ ${dayShort(firstOpenDay(now, cutoff))}`,
    };
  const remain = deadlineOf(tomorrow, C) - now;
  if (remain <= AMBER_MIN * MIN_MS) return { tone: "amber", text: `นัดพรุ่งนี้ได้อีก ${leftText(remain)} — ถึง ${C} น. ปฏิทินจะปิดวันพรุ่งนี้` };
  return { tone: "grey", text: `นัดพรุ่งนี้ได้ถึง ${C} น. วันนี้ — หลังจากนั้นวันแรกที่นัดได้คือมะรืน` };
}

/**
 * บรรทัดใต้ช่องวันของแอดมิน (ตัวอย่าง s2Line) — แอดมินเป็นคนเดียวที่ปลดวันที่ปิดได้ แต่ต้องตั้งใจ: ติ๊กในฟอร์มเดียวกัน
 * แดง + needTick = วันที่ปิดและยังไม่ได้แก้เป็นงานด่วน (บันทึกไม่ได้จนกว่าจะติ๊ก — เซิร์ฟเวอร์ก็ตอบ 400 ถ้าไม่ติ๊ก)
 * changed = ฟอร์มนี้เปลี่ยนวัน (คอนเฟิร์มลูกค้าขอเลื่อน · เลื่อนวันนัด) — บรรทัดเทายืนยันว่าวันใหม่บันทึกได้เลย
 * ฟอร์มนัดวันของหัวหน้าภาคที่แอดมินทำแทนไม่มีบรรทัดเทา (ไม่ใช่การเปลี่ยนวัน)
 */
export function adminDayLine(
  day: string | null | undefined,
  now: number,
  cutoff: Cutoff | null | undefined,
  urgentFor: string | null | undefined,
  changed: boolean
): { tone: "red" | "grey"; text: string; needTick: boolean } | null {
  if (!cutoff || !day || !YMD.test(day) || day < serverDay(now)) return null;
  if (closedDay(day, now, cutoff) && dayOfIso(urgentFor) !== day)
    return {
      tone: "red",
      needTick: true,
      text:
        day === serverDay(now)
          ? "วันนี้ต้องเป็นงานด่วน — ต้องไปวันนี้จริง ติ๊ก “แก้เป็นงานด่วน” ก่อนบันทึก"
          : `พรุ่งนี้ปิดนัดแล้ว (เลย ${cutoff.time} น.) — ต้องไปพรุ่งนี้จริง ติ๊ก “แก้เป็นงานด่วน” ก่อนบันทึก`,
    };
  return changed ? { tone: "grey", needTick: false, text: `วันใหม่ ${dayShort(day)} — บันทึกได้เลย` } : null;
}

/**
 * วันที่หัวหน้าภาคกดขอแอดมินแก้เป็นงานด่วนได้ — เรียงตามปุ่ม [พรุ่งนี้, วันนี้] แต่ละวันขึ้นเมื่อปิดแล้วและยังไม่ได้แก้ให้
 * วันนี้ขอได้แบบเดียวกับพรุ่งนี้หลังเวลาปิด (เจ้าของงานข้อ 3) · ขอค้างได้ทีละคำขอต่อใบ (เซิร์ฟเวอร์กันซ้ำ) — มีคำขอรออยู่ = ไม่มีปุ่ม
 * คำขอที่วันผ่านไปแล้วตายเอง (เซิร์ฟเวอร์ไม่นับ) ฟอร์มที่เปิดค้างข้ามเที่ยงคืนจึงขอใหม่ได้
 */
export function askDays(
  now: number,
  cutoff: Cutoff | null | undefined,
  urgentFor: string | null | undefined,
  ask: UrgentAsk | null | undefined
): string[] {
  if (!cutoff) return [];
  const today = serverDay(now);
  if (ask && ask.day >= today) return [];
  const granted = dayOfIso(urgentFor);
  return [addDays(today, 1), today].filter((d) => closedDay(d, now, cutoff) && granted !== d);
}

/**
 * ป้ายบนการ์ด/แถวของใบรอนัดวัน (ขั้นระบุอะไหล่ · นัดวันเข้า) — ใบขั้นอื่นไม่มีป้ายเวลาปิดแล้ว (ปล่อยงานกดได้ทุกเวลา)
 * ม่วง = มีคำขอนัดด่วนรอแอดมิน · เขียว = แอดมินแก้เป็นงานด่วนให้ · ส้ม/แดง (หัวหน้าภาค) = 3 ชม. สุดท้ายก่อนปฏิทินปิดวันพรุ่งนี้
 * แอดมินไม่เห็นนับถอยหลัง: ไม่ใช่งานที่แอดมินต้องรีบ เห็นแค่ใบที่หัวหน้าภาคขอมา
 */
export function scheduleChip(
  row: CutoffRow,
  now: number,
  cutoff: Cutoff | null | undefined,
  viewer: "supervisor" | "admin"
): { tone: BannerTone; text: string } | null {
  if (!cutoff || row.isTest || !SCHEDULE_STAGES.includes(row.status)) return null;
  const today = serverDay(now);
  const ask = row.urgentAsk && row.urgentAsk.day >= today ? row.urgentAsk : null;
  if (ask)
    return { tone: "req", text: viewer === "admin" ? `หัวหน้าภาคขอนัดด่วน ${dayShort(ask.day)}` : `ขอนัดด่วน ${dayShort(ask.day)} แล้ว · รอแอดมิน` };
  const granted = dayOfIso(row.urgentReleaseFor);
  if (granted && granted >= today) return { tone: "urgent", text: `แอดมินแก้เป็นงานด่วน · นัด ${dayShort(granted)} ได้` };
  if (viewer !== "supervisor") return null;
  const tomorrow = addDays(today, 1);
  if (!enforced(tomorrow, cutoff)) return null;
  const remain = deadlineOf(tomorrow, cutoff.time) - now;
  if (remain <= 0 || remain > AMBER_MIN * MIN_MS) return null;
  return { tone: remain <= RED_MIN * MIN_MS ? "red" : "amber", text: `นัดพรุ่งนี้ได้ถึง ${cutoff.time} · เหลือ ${leftText(remain)}` };
}

type ErrBody = { response?: { status?: number; data?: { code?: unknown; error?: unknown; serverNow?: unknown; cutoff?: unknown } } };

/**
 * 400 DATE_CLOSED (นัดวันที่ปิดแล้ว) — คืนนาฬิกากับเวลาปิดตอนที่เซิร์ฟเวอร์ตอบ ให้ฟอร์มคิดใหม่ในที่เดิม
 * ฟอร์มที่เปิดก่อน 16:00 แล้วกดหลัง 16:00 จะได้เห็นวันพรุ่งนี้ขีดฆ่าทันทีโดยไม่ต้องโหลดใบใหม่ (โหลดใหม่ = ทีม/เวลา/อะไหล่ที่กรอกหาย)
 */
export function closedFromError(e: unknown): { serverNow: string; cutoff: Cutoff } | null {
  const res = (e as ErrBody | null)?.response;
  const d = res?.data;
  if (res?.status !== 400 || d?.code !== "DATE_CLOSED") return null;
  const c = d.cutoff as { time?: unknown; since?: unknown } | undefined;
  if (typeof d.serverNow !== "string" || typeof c?.time !== "string" || typeof c?.since !== "string") return null;
  return { serverNow: d.serverNow, cutoff: { time: c.time, since: c.since } };
}

/**
 * 409 URGENT_ASK_STATE (สถานะคำขอนัดด่วนเปลี่ยนไปแล้ว: แอดมินเพิ่งแก้/ตอบ · ไม่มีคำขอรออยู่ · วันนั้นยังเปิด) → ข้อความไทยของเซิร์ฟเวอร์
 * ฟอร์ม/หน้าต่างจัดการเอง (ดึงสถานะล่าสุดมาวาดทับ) — ไม่ใช่ใบงานข้อมูลเก่า ตัวจัดการ 409 กลางต้องไม่ปิดฟอร์ม (api/client.ts)
 */
export function askStateError(e: unknown): string | null {
  const res = (e as ErrBody | null)?.response;
  const d = res?.data;
  if (res?.status !== 409 || d?.code !== "URGENT_ASK_STATE") return null;
  return typeof d.error === "string" ? d.error : "คำขอนัดด่วนเปลี่ยนไปแล้ว — ดูสถานะล่าสุดในฟอร์ม";
}

/**
 * เปลี่ยนเวลาปิดจาก from เป็น to แล้วปฏิทินของหัวหน้าภาคจะ "ปิดวันพรุ่งนี้ทันที" ไหม
 * = เลื่อนให้เร็วขึ้น และตอนนี้เลยเวลาใหม่ไปแล้วแต่ยังไม่ถึงเวลาเดิม — การ์ดตั้งค่าต้องถามก่อน (แตะพลาดครั้งเดียวปิดทั้งบริษัท)
 */
export function cutoffChangeLocksNow(now: number, from: string, to: string): boolean {
  const t = bkkMinutes(now);
  return minutesOf(to) < minutesOf(from) && t >= minutesOf(to) && t < minutesOf(from);
}

/* ------------------------------------------------------------------------------------------------
 * หัวข้อบนสุดของงานของฉันวันนี้และกล่องงาน — ตัวสร้างเดียว สองหน้าจะได้นับและบอกตรงกันเสมอ
 * ---------------------------------------------------------------------------------------------- */

/**
 * สีของป้าย/หัวข้อ — req ม่วง (คำขอนัดด่วน) · urgent เขียว (แอดมินแก้ให้แล้ว) · amber/red นับถอยหลัง · today ออกงานวันนี้
 * · lock แดง ("เลยนัด") · grey ไม่มีอะไรต้องรีบ
 */
export type BannerTone = "lock" | "req" | "urgent" | "amber" | "red" | "today" | "grey";

export interface BannerItem {
  id: number;
  code: string;
  /** สาขา · ทีม · เวลา (บรรทัดเดียว) */
  line: string;
  /** ขวาสุด เช่น "เหลือ 2 ชม." */
  right?: string;
}

export interface CutoffBanner {
  key: string;
  title: string;
  hint: string;
  /** ป้ายขวาของหัวข้อ เช่น "เหลือ 45 นาที" */
  right?: string;
  tone: BannerTone;
  /** ขอบหนา 2 px — เรื่องที่ต้องทำตอนนี้ (คำขอนัดด่วนที่ร้านรอ · 30 นาทีสุดท้าย) */
  strong?: boolean;
  items: BannerItem[];
}

/** แถวที่ตัวสร้างหัวข้ออ่าน — WorkOrderRow เข้ารูปนี้ได้ */
export interface BannerRow extends CutoffRow {
  branchCode: string;
  branchName: string;
  assignedTeam: string | null;
  overdue?: boolean;
  statusLabel?: string;
  /** หัวหน้าภาคที่ใบรออยู่ (เบอร์มาเฉพาะในคำตอบของแอดมิน) — แถว "ขอนัดด่วน" บอกเบอร์ของคนที่ขอ แอดมินโทรถามได้เลย */
  waitingOnSupervisors?: { name: string; phone?: string | null }[];
}

function itemOf(r: { id: number; code: string; branchCode: string; branchName?: string; assignedTeam: string | null; scheduledTime?: string | null }, right?: string): BannerItem {
  return {
    id: r.id,
    code: r.code,
    line: [`${r.branchCode}${r.branchName ? ` ${r.branchName}` : ""}`, r.assignedTeam ? `ทีม${r.assignedTeam}` : null, timeText(r.scheduledTime)]
      .filter(Boolean)
      .join(" · "),
    right,
  };
}

const byAppt = (a: { scheduledAt: string | null; scheduledTime?: string | null; code: string }, b: typeof a) =>
  (a.scheduledAt ?? "").slice(0, 10).localeCompare((b.scheduledAt ?? "").slice(0, 10)) ||
  (a.scheduledTime ?? "99:99").localeCompare(b.scheduledTime ?? "99:99") ||
  a.code.localeCompare(b.code);

/**
 * หัวข้อของหัวหน้าภาค (งานของฉันวันนี้ · กล่องงาน — ช่องเดียวกับแถบปล่อยงานเดิม)
 * 1) "รอนัดวัน n ใบ — นัดพรุ่งนี้ได้ถึง …" เฉพาะ 3 ชม. สุดท้ายก่อนปฏิทินปิดวันพรุ่งนี้ (เจ้าของงานข้อ 7) — ขึ้นตลอดวันคือหัวข้อที่คนเลิกอ่าน
 *    นับใบรอนัดวันที่ยังนัดพรุ่งนี้เองได้: ไม่ใช่ใบทดสอบ · ยังไม่ได้แก้เป็นงานด่วนพรุ่งนี้ · ยังไม่ได้ขอพรุ่งนี้ไว้ (รอแอดมินอยู่แล้ว)
 *    30 นาทีสุดท้ายเป็นแดงขอบหนา
 * 2) "ออกงานวันนี้" — ใบรอปล่อยงานที่นัดวันนี้ (ตามวันของเซิร์ฟเวอร์) ปล่อยได้ทุกเวลาแล้ว จึงไม่มีเงื่อนไขล็อก
 * rows = ทุกใบในกล่อง (ไม่ใช่เฉพาะแท็บที่เปิด) · ไม่ถามเซิร์ฟเวอร์เพิ่ม — ทุกอย่างคิดจากใบในกล่องกับนาฬิกาเซิร์ฟเวอร์
 */
export function supervisorBanners(rows: BannerRow[], now: number, cutoff: Cutoff | null | undefined): CutoffBanner[] {
  const out: CutoffBanner[] = [];
  const today = serverDay(now);
  const tomorrow = addDays(today, 1);
  if (cutoff && enforced(tomorrow, cutoff)) {
    const C = cutoff.time;
    const remain = deadlineOf(tomorrow, C) - now;
    if (remain > 0 && remain <= AMBER_MIN * MIN_MS) {
      const wait = rows
        .filter(
          (r) =>
            SCHEDULE_STAGES.includes(r.status) &&
            !r.isTest &&
            dayOfIso(r.urgentReleaseFor) !== tomorrow &&
            r.urgentAsk?.day !== tomorrow
        )
        .sort((a, b) => a.code.localeCompare(b.code));
      if (wait.length) {
        const red = remain <= RED_MIN * MIN_MS;
        out.push({
          key: "schedule",
          title: `รอนัดวัน ${wait.length} ใบ — นัดพรุ่งนี้ได้ถึง ${C} (เหลือ ${leftText(remain)})`,
          hint: `ถึง ${C} น. ปฏิทินจะปิดวันพรุ่งนี้ — แตะที่ใบเพื่อนัดวัน`,
          tone: red ? "red" : "amber",
          strong: red,
          // ใบรอนัดยังไม่มีวันนัด — บอกขั้นแทนเวลา ("ทั้งวัน" ของ itemOf จะอ่านเป็นนัดทั้งวัน)
          items: wait.map((r) => ({
            id: r.id,
            code: r.code,
            line: [`${r.branchCode}${r.branchName ? ` ${r.branchName}` : ""}`, r.statusLabel].filter(Boolean).join(" · "),
          })),
        });
      }
    }
  }
  const todayL = rows
    .filter((r) => RELEASE_STAGES.includes(r.status) && !r.isTest && (r.scheduledAt ?? "").slice(0, 10) === today)
    .sort(byAppt);
  if (todayL.length)
    out.push({
      key: "today",
      title: `ออกงานวันนี้ ${todayL.length} ใบ`,
      hint: "ลูกค้าคอนเฟิร์มแล้ว — กดรับทราบเพื่อปล่อยงานให้ช่าง",
      tone: "today",
      items: todayL.map((r) => itemOf(r)),
    });
  return out;
}

/** คำอธิบายหัวข้อ "เลยนัด" — กล่องงานกับงานของฉันวันนี้ใช้ประโยคเดียวกัน */
export const PAST_GROUP_HINT =
  "วันนัดผ่านไปแล้ว ใบยังไม่ถึงช่าง (รวมใบรอปล่อยงาน/ส่งช่างตรวจ) — เลื่อนวันนัด/โทรนัดใหม่ · ท้ายแถวบอกว่าค้างที่ใคร (ค้างโอน/เบิกคลังอื่น = ตามหัวหน้าภาค)";

/** คำอธิบายหัวข้อ "ขอนัดด่วน" (ตัวอย่าง appt-cutoff) — บอกทั้งสองทางที่แอดมินเลือกได้ ไม่ให้คิดว่าต้องแก้ให้ทุกใบ */
export function askGroupHint(cutoff: Cutoff | null | undefined): string {
  return `หัวหน้าภาคขอนัดวันที่ปิดนัดแล้ว (วันนี้ / พรุ่งนี้หลัง ${cutoff?.time ?? "16:00"} น.) — ร้านต้องการวันนั้นจริง: “แก้เป็นงานด่วน” (เฉพาะใบนี้ วันนั้น) · ไม่ได้: “ตอบกลับ” ให้หัวหน้าภาคนัดวันอื่น`;
}

/** คำขอนัดด่วนที่ยังมีความหมาย ณ now — วันที่ขอผ่านไปแล้ว (จอเปิดค้างข้ามเที่ยงคืน) เซิร์ฟเวอร์ก็ไม่นับแล้ว */
function liveAsk(row: CutoffRow, now: number): UrgentAsk | null {
  const a = row.urgentAsk;
  return a && !row.isTest && SCHEDULE_STAGES.includes(row.status) && a.day >= serverDay(now) ? a : null;
}

export interface AskRowLines {
  /** หัวหน้าภาคที่ขอ + เบอร์ · ขอเมื่อ */
  who: string;
  /** วันที่ร้านต้องการ (วันนี้/พรุ่งนี้) */
  appt: string;
  /** ข้อความที่หัวหน้าภาคพิมพ์มา (แอปไม่มีช่องให้พิมพ์ — มีเฉพาะคำขอที่ส่งทาง API) */
  note: string | null;
}

/**
 * บรรทัดของแถวในหัวข้อ "ขอนัดด่วน" — แอดมินตัดสินใจได้จากการ์ด (ใครขอ เบอร์ วันไหน) ไม่ต้องเปิดใบก่อน
 * เบอร์จับจากชื่อคนขอในรายชื่อหัวหน้าภาคที่ใบรออยู่ — ไม่เจอ (หัวหน้าภาคถูกย้ายภาคไปแล้ว) บอกแค่ชื่อ ดีกว่าบอกเบอร์คนอื่น
 */
export function askRowLines(row: BannerRow, now: number): AskRowLines | null {
  const a = liveAsk(row, now);
  if (!a) return null;
  const phone = (row.waitingOnSupervisors ?? []).find((s) => s.name === a.byName)?.phone;
  const rel = daysBetween(serverDay(now), a.day);
  return {
    who: `หัวหน้าภาค ${a.byName ?? "—"}${phone ? ` ${phone}` : ""} · ขอเมื่อ ${whenText(a.at)} น.`,
    appt: `ขอนัด ${dayFull(a.day)} (${rel === 0 ? "วันนี้" : "พรุ่งนี้"})`,
    note: a.note ? `“${a.note}”` : null,
  };
}

export interface AdminCutoffGroups {
  /** "ขอนัดด่วน" — ใบรอนัดวันที่หัวหน้าภาคขอแอดมินแก้เป็นงานด่วนไว้และยังรออยู่ · null = ไม่มี (ไม่วาดกล่องเปล่า) */
  asks: (CutoffBanner & { rows: BannerRow[] }) | null;
  /** "เลยนัด" — ใบ overdue ทุกขั้น (รวมใบรอปล่อยงานที่วันนัดผ่านแล้ว) แถวเดียวกับกล่องงาน · null = ไม่มี */
  past: (CutoffBanner & { rows: BannerRow[] }) | null;
}

/**
 * หัวข้อของแอดมิน (งานของฉันวันนี้ · กล่องงาน) — rows = ทุกใบในกล่องงานแอดมิน ตัวสร้างเดียว สองหน้าจะได้นับตรงกัน
 * "ขอนัดด่วน" มาก่อน: ร้านรอคำตอบวันนี้/พรุ่งนี้ · เรียงตามวันที่ขอ (วันนี้ก่อน) แล้วตามเวลาที่ขอ
 * "เลยนัด" ใช้ overdue ของเซิร์ฟเวอร์อย่างเดียว (pastRelease รวมใบรอปล่อยงานที่วันนัดผ่านแล้ว) — ไม่คิดซ้ำในแอป
 * จอที่เปิดค้างข้ามเที่ยงคืน (คำขอเมื่อวานหมดอายุ · ใบรอปล่อยงานเข้า "เลยนัด"): กล่องงานรู้จากเลขรุ่น /version ที่ต่อท้ายวันไทย
 * (ปุ่ม "มีอัปเดต") · งานของฉันวันนี้ไม่ถาม /version จึงตั้งเวลาโหลดใหม่เองหลังเที่ยงคืน (MyQueue)
 * ไม่มีกล่องเปล่า "0" แล้ว: เดิมใบล็อกขึ้นเองตอนถึงเวลา กล่องเปล่าบอกให้รู้ว่ารอดูที่นี่ — คำขอมาจากหัวหน้าภาคกด ไม่มีอะไรต้องรอดู
 */
export function adminGroups(rows: BannerRow[], now: number, cutoff: Cutoff | null | undefined): AdminCutoffGroups {
  const askRows = rows
    .filter((r) => liveAsk(r, now))
    .sort((a, b) => a.urgentAsk!.day.localeCompare(b.urgentAsk!.day) || a.urgentAsk!.at.localeCompare(b.urgentAsk!.at));
  const pastRows = rows.filter((r) => r.overdue && !askRows.includes(r)).sort(byAppt);
  const asks: AdminCutoffGroups["asks"] = askRows.length
    ? {
        key: "adminAsks",
        title: `ขอนัดด่วน ${askRows.length}`,
        hint: askGroupHint(cutoff),
        tone: "req",
        strong: true,
        // ใบรอนัดวันยังไม่มีวันนัด — แถวบอกวันที่ขอกับคนขอแทนเวลานัด ("ทั้งวัน" ของ itemOf จะอ่านเป็นนัดทั้งวัน)
        items: askRows.map((r) => ({
          id: r.id,
          code: r.code,
          line: [`${r.branchCode}${r.branchName ? ` ${r.branchName}` : ""}`, `ขอนัด ${dayShort(r.urgentAsk!.day)}`, r.urgentAsk!.byName ? `หัวหน้าภาค ${r.urgentAsk!.byName}` : null]
            .filter(Boolean)
            .join(" · "),
        })),
        rows: askRows,
      }
    : null;
  const past: AdminCutoffGroups["past"] = pastRows.length
    ? { key: "adminPast", title: `เลยนัด ${pastRows.length}`, hint: PAST_GROUP_HINT, tone: "lock", items: pastRows.map((r) => itemOf(r)), rows: pastRows }
    : null;
  return { asks, past };
}
