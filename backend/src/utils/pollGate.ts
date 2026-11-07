/**
 * แบ่งคิวคำขอ ให้ล็อกอินกับการบันทึกได้สายฐานข้อมูลก่อนเสมอ
 *
 * บทเรียน 7 พ.ย. 69 (ล็อกอินไม่ได้ทั้งระบบสองรอบในวันเดียว — log มีแต่ P2024): Prisma ถือสายได้ไม่กี่เส้น (src/prisma.ts — เพดาน pooler)
 * ฐานข้อมูลอยู่คนละ region ไปกลับ 0.23 วิ และคิวรอสายของ Prisma เป็นมาก่อนได้ก่อน — ล็อกอินที่ใช้คำสั่งเดียวต้องรอหลังรายการใบงาน
 * ตัวเลขกระดิ่ง/แชท ฯลฯ ของทุกเครื่องที่มาก่อน จำลองผู้ใช้ 145 คนด้วยพร็อกซีหน่วงเท่าของจริง: คำขอค้าง 144 อัน รอสายนานสุด 29 วิ ทุกอย่างได้ P2024
 *
 * สามช่อง:
 * - **ถามเป็นรอบ** (แอปถามเองโดยไม่มีคนกดรอ — ตัวเลขกระดิ่ง แชท กล่องงาน ลายนิ้วมือ) วิ่งพร้อมกัน 2 · คิวยาว/รอเกิน 5 วิ = 503 ทันทีไม่แตะฐานข้อมูล
 *   แอปจับ error ของการถามเป็นรอบเงียบอยู่แล้ว รอบหน้าค่อยถามใหม่ — ตัวเลขช้าไปหนึ่งรอบดีกว่าทั้งบริษัทล็อกอินไม่ได้
 * - **ดูข้อมูล** (GET อื่น ๆ — รายการ หน้าใบงาน รายงาน) วิ่งพร้อมกัน 4 ที่เหลือรอคิว (ได้คำตอบเสมอ แค่ช้าลงตอนคนเยอะ)
 * - **ไม่เข้าคิว**: ล็อกอิน · บันทึกทุกอย่าง (POST/PUT/PATCH/DELETE) · ดาวน์โหลดไฟล์ (ส่งไฟล์บน 4G นาน แต่ไม่ถือสายฐานข้อมูล)
 * คิวนับ "คำขอ" ไม่ใช่ "สาย" (คำขอหนึ่งยิงหลายคำสั่งพร้อมกันได้) แต่พอให้คิวรอสายของ Prisma สั้นจนคำขอที่ไม่เข้าคิวแทรกได้ภายในไม่กี่รอบ
 */
import type { NextFunction, Request, Response } from "express";

interface Lane {
  name: string;
  max: number;
  maxWaitMs: number;
  maxQueue: number;
  running: number;
  queue: (() => void)[];
  shed: number;
}

const lane = (name: string, max: number, maxWaitMs: number, maxQueue: number): Lane => ({
  name,
  max,
  maxWaitMs,
  maxQueue,
  running: 0,
  queue: [],
  shed: 0,
});

const polls = lane("polls", Number(process.env.POLL_MAX_RUNNING) || 2, 5_000, 30);
const reads = lane("reads", Number(process.env.READ_MAX_RUNNING) || 4, 45_000, 400);

/** GET ที่แอปถามเองเป็นรอบหรือตอนเปลี่ยนหน้า (ไม่มีคนกดรอ) */
const POLL = [
  /^\/api\/work-orders\/version$/,
  /^\/api\/work-orders\/\d+\/version$/,
  /^\/api\/work-orders\/bell$/,
  /^\/api\/work-orders\/chats$/,
  /^\/api\/work-orders\/inbox-count$/,
  /^\/api\/usage\/online$/,
  /^\/api\/part-claims\/(queue|pending)-count$/,
];
/** ส่งไฟล์/ลิงก์ไฟล์ — ใช้เวลาตามเน็ตของคนโหลด ไม่ใช่ตามฐานข้อมูล ถ้าเข้าคิว ช่างที่โหลดรูปบน 4G สี่คนจะกั้นทั้งบริษัท */
const STREAM = /\/(file|files|pdf|pdf-link|link|evidence-link|download|export)(\/|$)/i;

function release(l: Lane) {
  l.running--;
  l.queue.shift()?.();
}

function enter(l: Lane, req: Request, res: Response, next: NextFunction) {
  const run = () => {
    l.running++;
    let done = false;
    const free = () => {
      if (done) return;
      done = true;
      release(l);
    };
    res.on("finish", free);
    res.on("close", free);
    next();
  };
  const busy = () => {
    l.shed++;
    res.locals.errCode = l === polls ? "POLL_SHED" : "READ_SHED";
    res
      .status(503)
      .set("Retry-After", "30")
      .json({ error: l === polls ? "เซิร์ฟเวอร์กำลังยุ่ง — ข้ามรอบนี้" : "เซิร์ฟเวอร์กำลังยุ่ง — รอสักครู่แล้วลองใหม่", code: "BUSY" });
  };
  if (l.running < l.max) return run();
  if (l.queue.length >= l.maxQueue) return busy();
  let settled = false;
  // คำขอที่ปิดไปก่อนถึงคิว (คนปิดแอป/รอเกินเวลา) ถูกเอาออกจากคิวแล้ว — go ที่ถูกเรียกจึงเป็นคำขอที่ยังรออยู่เสมอ
  const go = () => {
    settled = true;
    clearTimeout(timer);
    run();
  };
  const drop = () => {
    if (settled) return;
    settled = true;
    const i = l.queue.indexOf(go);
    if (i >= 0) l.queue.splice(i, 1);
  };
  const timer = setTimeout(() => {
    if (settled) return;
    drop();
    busy();
  }, l.maxWaitMs);
  res.on("close", () => {
    clearTimeout(timer);
    drop();
  });
  l.queue.push(go);
}

export function pollGate(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET" || !req.path.startsWith("/api/")) return next();
  if (POLL.some((re) => re.test(req.path))) return enter(polls, req, res, next);
  if (STREAM.test(req.path)) return next();
  return enter(reads, req, res, next);
}

/** ใช้ช่องเดียวกับคำขอแบบถามเป็นรอบ — งานเบื้องหลัง (รอบแจ้งเตือนงานเข้ากล่อง) ก็ถามกระดิ่งเหมือนกัน ต้องต่อคิวเดียวกัน */
export function pollSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const go = () => {
      polls.running++;
      let done = false;
      resolve(() => {
        if (done) return;
        done = true;
        release(polls);
      });
    };
    if (polls.running < polls.max) go();
    else polls.queue.push(go);
  });
}

const stat = (l: Lane) => ({ running: l.running, queued: l.queue.length, maxRunning: l.max, shedSinceStart: l.shed });
export function pollGateStats() {
  return { polls: stat(polls), reads: stat(reads) };
}
