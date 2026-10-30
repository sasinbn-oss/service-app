/**
 * การใช้งานแอป — ใครใช้ตอนไหน นานเท่าไร (Super Admin และแอดมิน · เจ้าของงานขอ ต.ค. 69)
 *
 * ข้อมูลมาจาก UsageSlot (แถวละ 5 นาทีต่อคน · utils/usage.ts) "เวลาใช้" = จำนวนช่วง × 5 นาที
 * ก่อนวันที่เริ่มจดจริง มีช่วงที่ประมาณจากการทำงานในระบบ (device ACTION · migration usage_backfill) — นับแค่ตอนที่ทำอะไร
 * ไม่ใช่เวลาตั้งแต่เปิดถึงปิดแอป — เปิดค้างไว้เฉย ๆ แต่ไม่ได้แตะ ไม่นับ
 * ครั้ง (session) = ช่วงที่ต่อกัน ห่างไม่เกิน 15 นาทีนับเป็นครั้งเดียว
 *
 * Admin Spare Part ไม่เห็น (ตำแหน่งนั้นดูได้เฉพาะงานอะไหล่) · วันกับชั่วโมงคิดตามเวลาไทย
 */
import { Response, NextFunction, Router } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "../prisma";
import { AuthRequest, requireAuth } from "../middleware/auth";
import { ROLE_LABELS, TECH_ROLES } from "../utils/constants";
import { SLOT_MS } from "../utils/usage";
import { regionsOf } from "../utils/supervisorScope";
import { teamsOf } from "../utils/teamGroups";

/** ทุกทีม (Senior ช่างถือได้หลายทีม) หรือภาคที่ดูแลทุกภาค (หัวหน้าภาคเลือกได้หลายภาค) — ช่อง "ทีม/ภาค" ในรายการและไฟล์ */
function teamOrRegions(u: { role: string; team: string | null; extraTeams: string[]; region: string | null; extraRegions: string[] }) {
  return teamsOf(u).join(" · ") || regionsOf(u).join(" · ") || null;
}
import { documentPath, saveDocument } from "../documents/store";

const router = Router();
const BKK = 7 * 3600_000;
const DAY = 24 * 3600_000;
const GAP_MS = 15 * 60_000;
const ONLINE_MS = 10 * 60_000;

function requireUsageViewer(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.auth?.role !== "ADMIN" || req.auth.partsAdmin) {
    return res.status(403).json({ error: "หน้านี้สำหรับ Super Admin และแอดมิน" });
  }
  next();
}

/** "2026-10-27" ตามเวลาไทย */
const dayKey = (t: number) => new Date(t + BKK).toISOString().slice(0, 10);
/** เที่ยงคืนเวลาไทยของวันนี้ ย้อนไป n วัน (UTC ms) */
const bkkMidnight = (back = 0) => {
  const now = Date.now() + BKK;
  return now - (now % DAY) - BKK - back * DAY;
};

/** ช่วงที่ต่อกันเป็นครั้งเดียวกัน — คืน [เริ่ม, จบ] (จบ = ท้ายช่วงสุดท้าย) */
function sessionsOf(slots: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const s of [...slots].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && s - last[1] <= GAP_MS) last[1] = s + SLOT_MS;
    else out.push([s, s + SLOT_MS]);
  }
  return out;
}

const ROLE_GROUPS: Record<string, string[]> = {
  // ปุ่ม "ช่าง" รวม Senior ช่าง — สิทธิ์เท่าช่าง ป้ายในรายการบอกอยู่แล้วว่าใครเป็น Senior
  EMPLOYEE: TECH_ROLES,
  SUPERVISOR: ["SUPERVISOR"],
  ADMIN: ["ADMIN", "PARTS_ADMIN", "SUPER_ADMIN"],
  AREA_TEAM: ["AREA", "COCO_SUPERVISOR", "COCO_MAID"],
};

const listQuery = z.object({
  // all = ตั้งแต่เปิดบัญชี — รวมช่วงที่ประมาณจากการทำงาน (ACTION) ก่อนเริ่มจดจริง
  range: z.enum(["today", "7d", "30d", "all"]).default("today"),
  role: z.enum(["ALL", "EMPLOYEE", "SUPERVISOR", "ADMIN", "AREA_TEAM"]).default("ALL"),
  // ค้นหาชื่อ / รหัสพนักงาน / ทีม / ภาค — กรองที่เซิร์ฟเวอร์ ตัวเลขด้านบนนับตามคนที่ค้นเจอด้วย
  q: z.string().trim().max(100).optional(),
});

const rangeDays = (r: string) => (r === "all" ? 0 : r === "30d" ? 30 : r === "7d" ? 7 : 1);
/** วันแรกของช่วง (UTC ms) — all = ไม่จำกัด */
const rangeFrom = (r: string) => (r === "all" ? 0 : bkkMidnight(rangeDays(r) - 1));
/** WEB = คอม · MOBILE = มือถือ · ACTION = ประมาณจากการทำงานในระบบ (ก่อนเริ่มจดจริง) */
const DEVICES = ["WEB", "MOBILE", "ACTION"];
const DEVICE_LABEL: Record<string, string> = { WEB: "คอม", MOBILE: "มือถือ", ACTION: "จากการทำงานในระบบ" };

async function usersFor(role: string, q?: string) {
  const words = (q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const users = await prisma.user.findMany({
    where: { deletedAt: null, ...(role !== "ALL" ? { role: { in: ROLE_GROUPS[role] } } : {}) },
    select: { id: true, name: true, employeeCode: true, role: true, team: true, extraTeams: true, region: true, extraRegions: true },
    orderBy: { name: "asc" },
  });
  // ทุกคำต้องเจอ แต่ไม่ต้องติดกัน — แบบเดียวกับค้นหาในหน้าสิทธิ์ผู้ใช้ ("ช่าง กระบี่")
  return users.filter((u) => {
    if (!words.length) return true;
    const text = [u.name, u.employeeCode, ...teamsOf(u), ...regionsOf(u), ROLE_LABELS[u.role]].filter(Boolean).join(" ").toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

router.get("/online", requireAuth, requireUsageViewer, async (_req, res) => {
  const rows = await prisma.usageSlot.findMany({
    where: { slot: { gte: new Date(Date.now() - ONLINE_MS) } },
    distinct: ["userId"],
    select: { userId: true },
  });
  res.json({ online: rows.length });
});

router.get("/", requireAuth, requireUsageViewer, async (req: AuthRequest, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "ตัวกรองไม่ถูกต้อง" });
  const { range, role, q } = parsed.data;
  const days = rangeDays(range);
  const from = rangeFrom(range);
  // ตารางสีโชว์ไม่เกิน 30 วันล่าสุด — "ตั้งแต่เปิดบัญชี" ยาวหลายเดือน เป็นแถวยาวเหยียดอ่านไม่ออก
  const heatDaysN = range === "all" ? 30 : Math.max(days, 7);
  const heatFrom = bkkMidnight(heatDaysN - 1);
  const loadFrom = Math.min(from, heatFrom);
  const users = await usersFor(role, q);
  const ids = users.map((u) => u.id);

  const [slots, last, firsts] = await Promise.all([
    // ช่วงทั้งหมดของคนกลุ่มนี้ตั้งแต่ต้นตาราง heatmap — 30 วันสูงสุดราวสามแสนแถว พอจะคิดในหน่วยความจำได้
    prisma.usageSlot.findMany({
      where: { userId: { in: ids }, slot: { gte: new Date(loadFrom) } },
      select: { userId: true, slot: true, device: true },
    }),
    prisma.usageSlot.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _max: { slot: true } }),
    prisma.usageSlot.aggregate({ where: { device: { not: "ACTION" } }, _min: { slot: true } }),
  ]);
  const lastSeen = new Map(last.map((r) => [r.userId, r._max.slot!.getTime()]));
  const now = Date.now();
  const todayFrom = bkkMidnight(0);

  // heatmap: จำนวนคน (ไม่ใช่จำนวนช่วง) ต่อวันต่อชั่วโมง
  const heat = new Map<string, Set<number>>();
  const perUser = new Map<number, { slots: number[]; today: { t: number; device: string }[]; devices: Set<string>; days: Set<string> }>();
  for (const s of slots) {
    const t = s.slot.getTime();
    const key = `${dayKey(t)}|${new Date(t + BKK).getUTCHours()}`;
    if (t >= heatFrom) {
      if (!heat.has(key)) heat.set(key, new Set());
      heat.get(key)!.add(s.userId);
    }
    if (t < from) continue;
    let u = perUser.get(s.userId);
    if (!u) perUser.set(s.userId, (u = { slots: [], today: [], devices: new Set(), days: new Set() }));
    u.slots.push(t);
    u.devices.add(s.device);
    u.days.add(dayKey(t));
    if (t >= todayFrom) u.today.push({ t, device: s.device });
  }
  const hourUsers = new Map<number, number>();
  for (const [key, set] of heat) {
    const [d, h] = key.split("|");
    if (Date.parse(`${d}T00:00:00Z`) - BKK >= from) hourUsers.set(Number(h), (hourUsers.get(Number(h)) ?? 0) + set.size);
  }
  const peak = [...hourUsers].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const userDays = [...perUser.values()].reduce((n, u) => n + u.days.size, 0);
  const totalSlots = [...perUser.values()].reduce((n, u) => n + u.slots.length, 0);

  const people = users
    .map((u) => {
      const p = perUser.get(u.id);
      // แถบวันนี้แยกคอม/มือถือ — ช่วงติดกันที่อุปกรณ์เดียวกันรวมเป็นแท่งเดียว
      const bars: { from: number; to: number; device: string }[] = [];
      for (const d of DEVICES) {
        for (const [a, b] of sessionsOf((p?.today ?? []).filter((x) => x.device === d).map((x) => x.t))) bars.push({ from: a, to: b, device: d });
      }
      const ls = lastSeen.get(u.id) ?? null;
      return {
        id: u.id,
        name: u.name,
        code: u.employeeCode,
        role: u.role,
        roleLabel: ROLE_LABELS[u.role] ?? u.role,
        team: teamOrRegions(u),
        lastSeen: ls ? new Date(ls) : null,
        online: !!ls && now - ls < ONLINE_MS,
        sessions: p ? sessionsOf(p.slots).length : 0,
        minutes: (p?.slots.length ?? 0) * (SLOT_MS / 60_000),
        activeDays: p?.days.size ?? 0,
        devices: [...(p?.devices ?? [])],
        today: bars.map((b) => ({ from: new Date(b.from), to: new Date(b.to), device: b.device })),
      };
    })
    // ใช้ล่าสุดขึ้นก่อน คนที่ไม่เคยเข้าอยู่ท้าย
    .sort((a, b) => (b.lastSeen?.getTime() ?? 0) - (a.lastSeen?.getTime() ?? 0) || a.name.localeCompare(b.name, "th"));

  const heatDays: string[] = [];
  for (let i = heatDaysN - 1; i >= 0; i--) heatDays.push(dayKey(bkkMidnight(i)));
  res.json({
    range,
    // วันที่เริ่มจดจริง — ก่อนหน้านั้นเป็นช่วงที่ประมาณจากการทำงาน (สีเทา) หน้าจอบอกไว้ คนจะได้ไม่เข้าใจผิด
    since: firsts._min.slot,
    stats: {
      online: people.filter((p) => p.online).length,
      active: perUser.size,
      total: users.length,
      peakHour: peak,
      avgMinutesPerDay: userDays ? Math.round((totalSlots * (SLOT_MS / 60_000)) / userDays) : 0,
      never: people.filter((p) => !p.lastSeen).length,
    },
    heatmap: {
      days: heatDays,
      hours: Array.from({ length: 24 }, (_, h) => h),
      cells: heatDays.map((d) => Array.from({ length: 24 }, (_, h) => heat.get(`${d}|${h}`)?.size ?? 0)),
    },
    people,
  });
});

/** ย้อนหลังรายวันของคนหนึ่ง — กดชื่อในรายการ */
router.get("/user/:id", requireAuth, requireUsageViewer, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const all = req.query.days === "all";
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, team: true, extraTeams: true, region: true, extraRegions: true, employeeCode: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ error: "ไม่พบผู้ใช้" });
  // ตั้งแต่เปิดบัญชี: นับวันจากวันสร้างบัญชี (ไม่เกิน 2 ปี กันแถวยาวเกิน) — หน้าจอโชว์เฉพาะวันที่มีการใช้
  const sinceAccount = Math.ceil((bkkMidnight(0) - user.createdAt.getTime()) / DAY) + 1;
  const days = all ? Math.min(730, Math.max(1, sinceAccount)) : Math.min(90, Math.max(1, Number(req.query.days) || 7));
  const slots = await prisma.usageSlot.findMany({
    where: { userId: id, slot: { gte: new Date(bkkMidnight(days - 1)) } },
    select: { slot: true, device: true },
    orderBy: { slot: "asc" },
  });
  const byDay = new Map<string, { t: number; device: string }[]>();
  for (const s of slots) {
    const k = dayKey(s.slot.getTime());
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push({ t: s.slot.getTime(), device: s.device });
  }
  const rows = [];
  for (let i = 0; i < days; i++) {
    const d = dayKey(bkkMidnight(i));
    const list = byDay.get(d) ?? [];
    const bars = DEVICES.flatMap((dev) =>
      sessionsOf(list.filter((x) => x.device === dev).map((x) => x.t)).map(([a, b]) => ({ from: new Date(a), to: new Date(b), device: dev }))
    );
    rows.push({
      day: d,
      minutes: list.length * (SLOT_MS / 60_000),
      sessions: sessionsOf(list.map((x) => x.t)).length,
      first: list[0] ? new Date(list[0].t) : null,
      last: list.length ? new Date(list[list.length - 1].t + SLOT_MS) : null,
      bars,
    });
  }
  res.json({
    user: { ...user, regions: regionsOf(user), teams: teamsOf(user), roleLabel: ROLE_LABELS[user.role] ?? user.role },
    firstUse: slots[0]?.slot ?? null,
    days: all ? rows.filter((r) => r.minutes > 0) : rows,
  });
});

/** Excel รายคนรายวัน — เข้าครั้งแรก · ใช้ล่าสุด · รวมเวลา · ครั้ง · อุปกรณ์ */
router.get("/export", requireAuth, requireUsageViewer, async (req: AuthRequest, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "ตัวกรองไม่ถูกต้อง" });
  const { range, role, q } = parsed.data;
  const users = await usersFor(role, q);
  const byId = new Map(users.map((u) => [u.id, u]));
  const slots = await prisma.usageSlot.findMany({
    where: { userId: { in: users.map((u) => u.id) }, slot: { gte: new Date(rangeFrom(range)) } },
    select: { userId: true, slot: true, device: true },
    orderBy: { slot: "asc" },
  });
  const groups = new Map<string, { t: number; device: string }[]>();
  for (const s of slots) {
    const k = `${s.userId}|${dayKey(s.slot.getTime())}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push({ t: s.slot.getTime(), device: s.device });
  }
  const hm = (t: number) => new Date(t + BKK).toISOString().slice(11, 16);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("การใช้งานรายวัน", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(["วันที่", "ชื่อ", "รหัสพนักงาน", "ตำแหน่ง", "ทีม/ภาค", "เข้าครั้งแรก", "ใช้ล่าสุด", "รวมเวลา (นาที)", "ครั้ง", "อุปกรณ์"]).font = { bold: true };
  const keys = [...groups.keys()].sort((a, b) => b.split("|")[1].localeCompare(a.split("|")[1]) || byId.get(Number(a.split("|")[0]))!.name.localeCompare(byId.get(Number(b.split("|")[0]))!.name, "th"));
  for (const k of keys) {
    const [uid, d] = k.split("|");
    const u = byId.get(Number(uid))!;
    const list = groups.get(k)!;
    const devs = [...new Set(list.map((x) => DEVICE_LABEL[x.device] ?? x.device))].join(" + ");
    ws.addRow([d, u.name, u.employeeCode, ROLE_LABELS[u.role] ?? u.role, teamOrRegions(u) ?? "", hm(list[0].t), hm(list[list.length - 1].t + SLOT_MS), list.length * 5, sessionsOf(list.map((x) => x.t)).length, devs]);
  }
  [12, 30, 16, 18, 22, 12, 12, 14, 8, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const stamp = dayKey(Date.now());
  const stored = saveDocument({
    filename: `การใช้งานแอป-${stamp}.xlsx`,
    asciiFilename: `app-usage-${stamp}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data: Buffer.from(await wb.xlsx.writeBuffer()),
    ownerId: req.auth!.userId,
  });
  res.json({ filename: stored.filename, path: documentPath(stored), rows: keys.length });
});

export default router;
