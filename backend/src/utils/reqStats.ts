/**
 * ตัวเลขสุขภาพของเซิร์ฟเวอร์ที่เปิดดูจากเบราว์เซอร์ได้ — /health/status
 *
 * บทเรียน 7 พ.ย. 69: ล็อกอินไม่ได้ทั้งระบบสองรอบในวันเดียว ทั้งสองรอบสิ่งเดียวที่มีคือภาพหน้าจอ
 * "แจ้งแอดมินให้ดู log" — log อยู่ใน Render ซึ่งคนที่เจอปัญหาเปิดไม่เป็น และฝั่งพัฒนาต่อเข้าไปดูไม่ได้
 * ต้นเหตุจึงเดาได้อย่างเดียว ตรงนี้ทำให้เปิดลิงก์เดียวแล้วเห็นว่า "ตอนนี้" เป็นอะไร:
 * ฐานข้อมูลตอบไหม · คำขอค้างกี่อัน ค้างนานสุดเท่าไร · 15 นาทีล่าสุดพังด้วยรหัสอะไร · ทางไหนกินเวลารวมมากสุด
 *
 * เก็บในหน่วยความจำเท่านั้น (รีสตาร์ทแล้วเริ่มนับใหม่) — ไม่เขียนฐานข้อมูล เพราะตอนที่อยากดูที่สุดคือตอนฐานข้อมูลไม่ว่าง
 * ไม่มีอะไรลับ: ชื่อทาง (เลขในทางถูกแทนด้วย :id) จำนวน เวลา รหัสข้อผิดพลาด — ไม่มีชื่อคน ข้อมูลใบงาน หรือข้อความ error เต็ม
 */
import type { NextFunction, Request, Response } from "express";

const WINDOW_MS = 15 * 60_000;
const MAX_ROWS = 50_000;

interface Row {
  at: number;
  route: string;
  ms: number;
  status: number;
  code: string | null;
}

const rows: Row[] = [];
const inFlight = new Map<number, { at: number; route: string }>();
let nextId = 1;
const startedAt = Date.now();

/** งานเบื้องหลัง (รอบแจ้งเตือนงานเข้ากล่อง · ล้างถังขยะ) — ใช้ฐานข้อมูลก้อนเดียวกับคำขอของคน จึงต้องเห็นด้วย */
const jobs = new Map<string, { at: number; ms: number; note: string }>();

/** ทางแบบไม่มีเลข — /api/work-orders/482/version → /api/work-orders/:id/version จะได้รวมกลุ่มได้ */
function routeOf(req: Request) {
  const path = (req.baseUrl || "") + (req.path || "");
  return `${req.method} ${path.replace(/\/\d+(?=\/|$)/g, "/:id").replace(/\/WO-\d+/gi, "/:code")}`;
}

function prune(now: number) {
  let drop = 0;
  while (drop < rows.length && now - rows[drop].at > WINDOW_MS) drop++;
  if (rows.length - drop > MAX_ROWS) drop = rows.length - MAX_ROWS;
  if (drop) rows.splice(0, drop);
}

export function trackRequests(req: Request, res: Response, next: NextFunction) {
  const id = nextId++;
  const at = Date.now();
  inFlight.set(id, { at, route: `${req.method} ${req.originalUrl.split("?")[0].replace(/\/\d+(?=\/|$)/g, "/:id")}` });
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    inFlight.delete(id);
    const now = Date.now();
    rows.push({ at: now, route: routeOf(req), ms: now - at, status: res.statusCode, code: (res.locals.errCode as string) ?? null });
    prune(now);
  };
  res.on("finish", finish);
  res.on("close", finish);
  next();
}

export function noteJob(name: string, ms: number, note: string) {
  jobs.set(name, { at: Date.now(), ms, note });
}

/** จำนวนคำขอของคนที่กำลังรอคำตอบอยู่ตอนนี้ — งานเบื้องหลังใช้หลบทางให้ */
export function busyRequests() {
  return inFlight.size;
}

export function statusSnapshot() {
  const now = Date.now();
  prune(now);
  const byRoute = new Map<string, { n: number; total: number; max: number; errors: number }>();
  const errors = new Map<string, number>();
  for (const r of rows) {
    const s = byRoute.get(r.route) ?? { n: 0, total: 0, max: 0, errors: 0 };
    s.n++;
    s.total += r.ms;
    s.max = Math.max(s.max, r.ms);
    if (r.status >= 500) {
      s.errors++;
      const k = `${r.status} ${r.code ?? "ไม่มีรหัส"}`;
      errors.set(k, (errors.get(k) ?? 0) + 1);
    }
    byRoute.set(r.route, s);
  }
  const oldest = [...inFlight.values()].sort((a, b) => a.at - b.at)[0];
  const sec = (ms: number) => Math.round(ms / 100) / 10;
  return {
    upMinutes: Math.round((now - startedAt) / 60_000),
    waitingNow: inFlight.size,
    oldestWaitingSec: oldest ? sec(now - oldest.at) : 0,
    oldestWaitingRoute: oldest?.route ?? null,
    last15min: {
      requests: rows.length,
      serverErrors: Object.fromEntries([...errors.entries()].sort((a, b) => b[1] - a[1])),
      slowRequests: rows.filter((r) => r.ms > 5000).length,
      // ทางที่ใช้เวลารวมมากสุด = ทางที่ถือสายฐานข้อมูลไว้นานสุด (ไม่ใช่ทางที่ช้าสุดต่อครั้ง)
      busiestRoutes: [...byRoute.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10)
        .map(([route, s]) => ({ route, count: s.n, avgSec: sec(s.total / s.n), maxSec: sec(s.max), errors: s.errors })),
    },
    jobs: Object.fromEntries(
      [...jobs.entries()].map(([k, j]) => [k, { minutesAgo: Math.round((now - j.at) / 6000) / 10, tookSec: sec(j.ms), note: j.note }])
    ),
  };
}
