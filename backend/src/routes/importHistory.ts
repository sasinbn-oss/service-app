/**
 * ประวัติการนำเข้า (เจ้าของงานอนุมัติตัวอย่าง 5 พ.ย. 69) — หน้าเดียวรวมทุกไฟล์ที่นำเข้าระบบ · ใคร · เมื่อไร · ได้ผลอะไร
 *
 * อ่านจากสามที่ แล้วเรียงรวมกันตามเวลา:
 * - ImportRun — ใบแจ้งซ่อม · ทะเบียนสาขา · สาขาที่ยกเลิก · รถ · รายชื่อผู้ใช้ (เก็บตั้งแต่หน้านี้ขึ้นระบบ — utils/importHistory.ts)
 *   และรายงานเครื่องที่บันทึกไม่สำเร็จ
 * - MachineImport — รายงานเครื่องที่บันทึกสำเร็จ (มีตั้งแต่เริ่มใช้) · ไม่ลอกมาเก็บซ้ำ
 * - SparePartImport — อัปเดตอะไหล่ จัดเป็นรอบตาม batchId (มีตั้งแต่เริ่มใช้) · รายละเอียดเต็มอยู่ที่รายงานอัปเดตอะไหล่เดิม
 *
 * สิทธิ์: แอดมินทุกคนเห็นทุกรอบ (เจ้าของงานเลือก — ตามงานต่อกันได้ ไม่นำเข้าซ้ำซ้อน) = คนที่นำเข้าได้ก็ดูได้ (requireAdmin
 * แบบเส้นนำเข้าทุกเส้น) · Admin Spare Part อ่านได้ตามกติกาเดิมของตำแหน่ง (อ่านทุกอย่างเท่าแอดมิน) · ดาวน์โหลด Excel เป็น GET
 *
 * id ของรอบในที่อยู่/คำขอ: r<ImportRun.id> · m<MachineImport.id> · p<SparePartImport.batchId>
 */
import { Router } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../prisma";
import { AuthRequest, requireAdmin, requireAuth } from "../middleware/auth";
import { ROLE_LABELS } from "../utils/constants";
import { documentPath, saveDocument } from "../documents/store";
import { readableName, RUN_IDLE_MS, stopRepairRun } from "../utils/importHistory";
import type { ReportDetails } from "../utils/sparePartImport";

const router = Router();

type Group = "repair" | "parts" | "machine" | "branch" | "users" | "vehicle";
type Tone = "ok" | "warn" | "bad" | "muted" | "info";
type St = "ok" | "partial" | "failed" | "running";

const GROUP_LABEL: Record<Group, string> = {
  repair: "ใบแจ้งซ่อม",
  parts: "อะไหล่",
  machine: "รายงานเครื่อง",
  branch: "สาขา",
  users: "รายชื่อผู้ใช้",
  vehicle: "รถ",
};
const GROUPS = Object.keys(GROUP_LABEL) as Group[];
const KIND_GROUP: Record<string, Group> = {
  REPAIR_FORM: "repair",
  SPARE_PART: "parts",
  MACHINE: "machine",
  BRANCH: "branch",
  BRANCH_CANCELLED: "branch",
  VEHICLE: "vehicle",
  USER_ROSTER: "users",
  USER_AREA: "users",
};
const KIND_LABEL: Record<string, string> = {
  REPAIR_FORM: "ฟอร์มแจ้งซ่อม COCO",
  SPARE_PART: "ข้อมูลอะไหล่",
  MACHINE: "รายงานเครื่อง",
  BRANCH: "ทะเบียนสาขา",
  BRANCH_CANCELLED: "สาขาที่ยกเลิก",
  VEHICLE: "ทะเบียนรถ",
  USER_ROSTER: "รายชื่อช่าง/หัวหน้าภาค",
  USER_AREA: "Area Team / Maid (COCO)",
};
const ST_LABEL: Record<St, string> = { ok: "ครบ", partial: "หยุดกลางทาง", failed: "ไม่สำเร็จ", running: "กำลังนำเข้า" };

/** แถวที่ส่งไปหน้าจอต่อครั้ง — ไฟล์ใบแจ้งซ่อมจริงสองสามร้อยแถว ที่เกินดูครบในไฟล์ Excel (หน้าจอบอกว่าแสดงกี่จากกี่แถว) */
const ROWS_SHOWN = 300;
/** แต่ละที่อ่านไม่เกินเท่านี้ต่อครั้ง — รายการเลือกช่วงเวลาได้ ("ทั้งหมด" ของรายงานเครื่องวันละสองรอบเป็นพันแถวในปีเดียว) */
const LIST_CAP = 300;

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const fmt = (v: number) => v.toLocaleString("en-US");

/** ป้ายผลของแต่ละแถว (ชิปในตาราง · คอลัมน์ "ผล" ใน Excel) ตามชนิด */
const REPAIR_RESULT: Record<string, [string, Tone]> = {
  NEW: ["เปิดใบใหม่", "ok"],
  OPEN: ["มีใบค้าง — ข้าม", "warn"],
  IMPORTED: ["นำเข้าแล้ว/ซ้ำ — ข้าม", "muted"],
  ERROR: ["นำเข้าไม่ได้", "bad"],
  SKIPPED: ["เอาออกแล้ว", "muted"],
  PENDING: ["ยังไม่ได้เปิด", "warn"],
};
const RESULT: Record<string, Record<string, [string, Tone]>> = {
  REPAIR_FORM: REPAIR_RESULT,
  BRANCH: { new: ["สาขาใหม่", "ok"], changed: ["ภาค/ทีมช่างเปลี่ยน", "warn"] },
  BRANCH_CANCELLED: {
    closed: ["ปิดสาขา", "bad"],
    removed: ["ถอดเครื่อง", "bad"],
    restored: ["เอากลับมาใช้", "ok"],
    reused: ["รหัสใช้กับสาขาใหม่แล้ว (ข้าม)", "warn"],
    retired: ["รหัส (เดิม) — ข้าม", "muted"],
    notFound: ["ไม่มีในระบบ", "muted"],
  },
  VEHICLE: { created: ["เพิ่มรถ", "ok"], updated: ["แก้ข้อมูล", "info"], skipped: ["ข้าม", "warn"] },
  USER_ROSTER: { new: ["เพิ่มผู้ใช้ใหม่", "ok"], changed: ["ตำแหน่ง/ทีม/ชื่อเปลี่ยน", "info"], noTeam: ["ยังไม่มีทีม", "warn"] },
  USER_AREA: {
    new: ["เพิ่มผู้ใช้ใหม่", "ok"],
    changed: ["ตำแหน่งเปลี่ยน", "info"],
    reset: ["ตั้งรหัสผ่านใหม่", "info"],
    taken: ["ชื่อผู้ใช้เป็นตำแหน่งอื่น (ข้าม)", "warn"],
    badBranch: ["รหัสสาขาไม่มีในระบบ", "bad"],
    problem: ["นำเข้าไม่ได้", "bad"],
  },
  SPARE_PART: { created: ["เพิ่มใหม่", "ok"], updated: ["แก้ข้อมูล", "info"], images: ["เพิ่ม/เปลี่ยนรูป", "info"], skipped: ["ข้าม", "warn"] },
};
const resultOf = (kind: string, key: string): [string, Tone] => RESULT[kind]?.[key] ?? [key, "muted"];

interface Tile {
  key: string;
  label: string;
  n: number;
  tone: Tone;
  /** กดแล้วกรองแถวได้ (มีแถวผลนี้เก็บไว้) */
  rows: boolean;
}
/** แถวในหมวดนี้หาด้วย "หมายเหตุขึ้นต้นด้วย…" แทนผลของแถว (ช่างที่ยังไม่มีทีม — อาจเป็นคนใหม่หรือคนเดิม) */
const NOTE_FILTER: Record<string, Record<string, string>> = { USER_ROSTER: { noTeam: "ยังไม่มีทีม" } };

/** ตัวเลขด้านบนของรอบ — ชนิดอื่นจากยอดสรุปที่เก็บไว้ · แถวที่เก็บนับจาก count (ตรงกับที่กรองได้เสมอ) */
function tilesOf(kind: string, summary: Record<string, unknown>, counts: Record<string, number>, st: St): Tile[] {
  const s = (k: string) => n(summary[k]);
  const c = (k: string) => counts[k] ?? 0;
  const t = (key: string, label: string, v: number, tone: Tone, show = true): Tile | null =>
    show ? { key, label, n: v, tone, rows: c(key) > 0 || !!NOTE_FILTER[kind]?.[key] } : null;
  const list: (Tile | null)[] =
    kind === "REPAIR_FORM"
      ? st === "failed"
        ? [
            t("PENDING", "ตอนดูตัวอย่าง: จะเปิดใหม่", c("PENDING"), "info"),
            t("NEW", "เปิดได้จริง", c("NEW"), "bad"),
            t("OPEN", "มีใบค้าง (ข้าม)", c("OPEN"), "warn"),
            t("IMPORTED", "นำเข้าแล้ว / แถวซ้ำ (ข้าม)", c("IMPORTED"), "muted"),
            t("ERROR", "นำเข้าไม่ได้", c("ERROR"), "bad"),
          ]
        : [
            t("NEW", "เปิดใบใหม่", c("NEW"), "ok"),
            t("PENDING", st === "running" ? "รอเปิด" : "ยังไม่ได้เปิด", c("PENDING"), "warn", st !== "ok" || c("PENDING") > 0),
            t("OPEN", "มีใบค้าง (ข้าม)", c("OPEN"), "warn"),
            t("IMPORTED", "นำเข้าแล้ว / แถวซ้ำ (ข้าม)", c("IMPORTED"), "muted"),
            t("ERROR", "นำเข้าไม่ได้", c("ERROR"), "bad"),
            t("SKIPPED", "เอาออกเอง", c("SKIPPED"), "muted", c("SKIPPED") > 0),
          ]
      : kind === "BRANCH"
        ? [
            t("new", "สาขาใหม่", s("new"), "ok"),
            t("changed", "ภาค/ทีมช่างเปลี่ยน", s("changed"), "warn"),
            t("same", "เหมือนเดิม", s("same"), "muted"),
            t("dup", "รหัสซ้ำที่ยุบรวม", s("dup"), "muted"),
          ]
        : kind === "BRANCH_CANCELLED"
          ? [
              t("closed", "ปิดสาขา", s("closed"), "bad"),
              t("removed", "ถอดเครื่อง", s("removed"), "bad", s("removed") > 0),
              t("restored", "เอากลับมาใช้", s("restored"), "ok", s("restored") > 0),
              t("already", "ปิดไว้อยู่แล้ว", s("already"), "muted"),
              t("reused", "รหัสใช้กับสาขาใหม่แล้ว (ข้าม)", s("reused"), "warn"),
              t("notFound", "รหัสที่ไม่มีในระบบ", s("notFound"), "muted"),
              t("retired", "รหัส (เดิม) ข้าม", s("retired"), "muted", s("retired") > 0),
            ]
          : kind === "VEHICLE"
            ? [
                t("created", "เพิ่มรถ", s("created"), "ok"),
                t("updated", "แก้ข้อมูล", s("updated"), "info"),
                t("same", "เหมือนเดิม", s("same"), "muted"),
                t("skipped", "ข้าม (รถส่วนตัว/ทะเบียนซ้ำ)", s("skipped"), "warn", s("skipped") > 0),
              ]
            : kind === "USER_ROSTER"
              ? [
                  t("new", "เพิ่มผู้ใช้ใหม่", s("created"), "ok"),
                  t("changed", "ตำแหน่ง/ทีม/ชื่อเปลี่ยน", s("changed"), "info"),
                  t("same", "เหมือนเดิม", s("same"), "muted"),
                  t("noTeam", "ช่างที่ยังไม่มีทีม", s("withoutTeam"), "warn", s("withoutTeam") > 0),
                ]
              : kind === "USER_AREA"
                ? [
                    t("new", "เพิ่มผู้ใช้ใหม่", s("created"), "ok"),
                    t("updated", "มีบัญชีอยู่แล้ว (อัปเดต)", s("updated"), "muted"),
                    t("changed", "ตำแหน่งเปลี่ยน", c("changed"), "info", c("changed") > 0),
                    t("reset", "ตั้งรหัสผ่านใหม่", s("passwords") - s("created"), "info", s("passwords") > s("created")),
                    t("taken", "ชื่อผู้ใช้เป็นตำแหน่งอื่น (ข้าม)", s("taken"), "warn", s("taken") > 0),
                    t("badBranch", "รหัสสาขาไม่มีในระบบ", s("badBranches"), "bad", s("badBranches") > 0),
                    t("problem", "นำเข้าไม่ได้", s("problems"), "bad"),
                  ]
                : [];
  return list.filter((x): x is Tile => !!x);
}

/** สถานะที่หน้าจอเห็น — RUNNING ที่เงียบเกิน 5 นาทีตัดสินตรงนี้ (ไม่มีงานเบื้องหลังมาแก้ค่าในฐานข้อมูล) */
function statusOf(run: { kind: string; status: string; lastAt: Date }, counts: Record<string, number>): St {
  if (run.kind !== "REPAIR_FORM") return run.status === "DONE" ? "ok" : run.status === "STOPPED" ? "partial" : "failed";
  if (run.status === "DONE") return "ok";
  if (run.status === "RUNNING" && Date.now() - run.lastAt.getTime() < RUN_IDLE_MS) return "running";
  // เปิดไปแล้วบางใบ = หยุดกลางทาง · ยังไม่ได้เปิดสักใบ = ไม่สำเร็จ (ตัวอย่างที่อนุมัติ: "ไม่มีใบไหนเปิด")
  return (counts.NEW ?? 0) > 0 ? "partial" : "failed";
}

function repairShort(st: St, counts: Record<string, number>): string {
  const opened = counts.NEW ?? 0;
  const planned = opened + (counts.PENDING ?? 0);
  if (st === "ok") return planned || !Object.keys(counts).length ? `เปิดใหม่ ${fmt(opened)} ใบ` : "ไม่มีใบใหม่ให้เปิด";
  if (st === "running") return `กำลังเปิด ${fmt(opened)} จาก ${fmt(planned)} ใบ`;
  if (st === "partial") return `เปิดไป ${fmt(opened)} จาก ${fmt(planned)} ใบ`;
  return "ไม่มีใบไหนเปิด";
}

/** สรุปสั้นบนการ์ดในรายการ (ตามตัวอย่าง: "เพิ่ม 6 · ภาค/ทีมเปลี่ยน 18") */
function shortOf(kind: string, summary: Record<string, unknown>, counts: Record<string, number>, st: St): string {
  if (kind === "REPAIR_FORM") return repairShort(st, counts);
  if (st === "failed") return "ไม่มีอะไรถูกบันทึก";
  const s = (k: string) => n(summary[k]);
  const parts = (list: [string, number][]) =>
    list
      .filter(([, v], i) => v > 0 || i === 0)
      .map(([label, v]) => `${label} ${fmt(v)}`)
      .join(" · ");
  switch (kind) {
    case "BRANCH":
      return parts([["เพิ่ม", s("new")], ["ภาค/ทีมเปลี่ยน", s("changed")]]);
    case "BRANCH_CANCELLED":
      return parts([["ปิดสาขา", s("closed")], ["ถอดเครื่อง", s("removed")], ["เอากลับ", s("restored")], ["ข้าม", s("reused") + s("notFound") + s("retired")]]);
    case "VEHICLE":
      return parts([["เพิ่ม", s("created")], ["แก้", s("updated")]]);
    case "USER_ROSTER":
      return parts([["เพิ่มผู้ใช้", s("created")], ["เปลี่ยน", s("changed")], ["ไม่มีทีม", s("withoutTeam")]]);
    case "USER_AREA":
      return parts([["เพิ่มผู้ใช้", s("created")], ["อัปเดต", s("updated")], ["ไม่ได้", s("problems") + s("taken")]]);
    default:
      return "";
  }
}

interface ListRun {
  id: string;
  group: Group;
  kind: string;
  kindLabel: string;
  fileName: string;
  byName: string | null;
  startedAt: Date;
  status: St;
  statusLabel: string;
  short: string;
}

/** ช่วงเวลาที่เลือก — 0 / ไม่ส่ง = ทั้งหมด */
function sinceOf(days: unknown): Date | null {
  const d = Number(days);
  return Number.isInteger(d) && d > 0 && d <= 3650 ? new Date(Date.now() - d * 86_400_000) : null;
}

function partsShort(totals: Record<string, number>, st: St) {
  if (st === "failed") return "ไม่มีอะไรถูกบันทึก";
  const bits = [
    ["เพิ่ม", totals.created],
    ["แก้", totals.updated],
    ["รูป", totals.images],
  ].filter(([, v], i) => (v as number) > 0 || i === 0);
  return bits.map(([l, v]) => `${l} ${fmt(v as number)}`).join(" · ");
}

/** รวมไฟล์ของรอบอะไหล่ (ไฟล์ละแถวใน SparePartImport) — สถานะ: มีไฟล์ไหนอัปเดตไม่ครบ = หยุดกลางทาง/ไม่สำเร็จ */
function partsBatch(rows: { batchId: string; createdAt: Date; byName: string | null; fileName: string; brandFile: string | null; summary: unknown }[]) {
  const totals: Record<string, number> = { created: 0, updated: 0, images: 0, same: 0, skipped: 0, joined: 0, confirmed: 0, rows: 0, changed: 0 };
  let incomplete = 0;
  for (const r of rows) {
    const s = (r.summary ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(totals)) totals[k] += n(s[k]);
    if (s.incomplete) incomplete++;
  }
  const st: St = incomplete ? (totals.created + totals.updated + totals.images > 0 ? "partial" : "failed") : "ok";
  const first = rows[0];
  return {
    totals,
    incomplete,
    st,
    startedAt: first.createdAt,
    fileName: rows.length > 1 ? `${first.fileName} + อีก ${rows.length - 1} ไฟล์` : first.fileName,
    files: rows.map((r) => ({ fileName: r.fileName, brandFile: r.brandFile })),
  };
}

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  const since = sinceOf(req.query.days);
  const want = GROUPS.includes(req.query.kind as Group) ? (req.query.kind as Group) : null;
  const at = since ? { gte: since } : undefined;
  const [runs, machines, parts] = await Promise.all([
    prisma.importRun.findMany({
      where: at ? { startedAt: at } : {},
      orderBy: { startedAt: "desc" },
      take: LIST_CAP,
      select: { id: true, kind: true, fileName: true, byName: true, status: true, startedAt: true, lastAt: true, summary: true },
    }),
    prisma.machineImport.findMany({
      where: at ? { createdAt: at } : {},
      orderBy: { createdAt: "desc" },
      take: LIST_CAP,
      select: { id: true, fileName: true, uploadedById: true, createdAt: true, opened: true, closed: true },
    }),
    // ไม่อ่าน details (รายการทั้งไฟล์ — ก้อนใหญ่) ในรายการ · ไฟล์ละแถว รอบหนึ่งได้หลายไฟล์
    // ใหม่ก่อน (ช่วง "ทั้งหมด" ที่เกินเพดานต้องได้รอบล่าสุด ไม่ใช่รอบแรก ๆ) — ในรอบเรียงไฟล์ตามเวลาอีกที
    prisma.sparePartImport.findMany({
      where: at ? { createdAt: at } : {},
      orderBy: { createdAt: "desc" },
      take: LIST_CAP * 3,
      select: { batchId: true, createdAt: true, byName: true, fileName: true, brandFile: true, summary: true },
    }),
  ]);
  const repairIds = runs.filter((r) => r.kind === "REPAIR_FORM").map((r) => r.id);
  const machineUsers = [...new Set(machines.map((m) => m.uploadedById).filter((x): x is number => x !== null))];
  const [grouped, users] = await Promise.all([
    repairIds.length
      ? prisma.importRunRow.groupBy({ by: ["runId", "result"], where: { runId: { in: repairIds } }, _count: { _all: true } })
      : Promise.resolve([]),
    machineUsers.length ? prisma.user.findMany({ where: { id: { in: machineUsers } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const countsOf = new Map<number, Record<string, number>>();
  for (const g of grouped) {
    const c = countsOf.get(g.runId) ?? {};
    c[g.result] = g._count._all;
    countsOf.set(g.runId, c);
  }
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  const all: ListRun[] = [];
  for (const r of runs) {
    const counts = countsOf.get(r.id) ?? {};
    const st = statusOf(r, counts);
    all.push({
      id: `r${r.id}`,
      group: KIND_GROUP[r.kind] ?? "repair",
      kind: r.kind,
      kindLabel: KIND_LABEL[r.kind] ?? r.kind,
      fileName: r.fileName,
      byName: r.byName,
      startedAt: r.startedAt,
      status: st,
      statusLabel: ST_LABEL[st],
      short: shortOf(r.kind, (r.summary ?? {}) as Record<string, unknown>, counts, st),
    });
  }
  for (const m of machines) {
    all.push({
      id: `m${m.id}`,
      group: "machine",
      kind: "MACHINE",
      kindLabel: KIND_LABEL.MACHINE,
      fileName: readableName(m.fileName) || "(ไม่มีชื่อไฟล์)",
      byName: m.uploadedById ? nameOf.get(m.uploadedById) ?? null : null,
      startedAt: m.createdAt,
      status: "ok",
      statusLabel: ST_LABEL.ok,
      short: `เปิดเคส ${fmt(m.opened)} · ปิดเคส ${fmt(m.closed)}`,
    });
  }
  const batches = new Map<string, typeof parts>();
  for (const p of [...parts].reverse()) batches.set(p.batchId, [...(batches.get(p.batchId) ?? []), p]);
  for (const [batchId, rows] of batches) {
    const b = partsBatch(rows);
    all.push({
      id: `p${batchId}`,
      group: "parts",
      kind: "SPARE_PART",
      kindLabel: KIND_LABEL.SPARE_PART,
      fileName: b.fileName,
      byName: rows[0].byName,
      startedAt: b.startedAt,
      status: b.st,
      statusLabel: ST_LABEL[b.st],
      short: partsShort(b.totals, b.st),
    });
  }
  all.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const counts: Record<string, number> = { all: all.length };
  for (const g of GROUPS) counts[g] = all.filter((r) => r.group === g).length;
  const shown = (want ? all.filter((r) => r.group === want) : all).slice(0, 200);
  res.json({ runs: shown, counts, groups: GROUPS.map((g) => ({ id: g, label: GROUP_LABEL[g] })), more: (want ? counts[want] : counts.all) > shown.length });
});

/** แอปหยุดส่งชุดที่เหลือเอง (กดหยุด · เน็ตหลุด · เซิร์ฟเวอร์ช้า) — รอบขึ้น "หยุดกลางทาง" ทันที ไม่ต้องรอ 5 นาที */
router.post("/stop", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const ok = await stopRepairRun(req.auth!.userId, req.body?.runKey, req.body?.reason);
  res.json({ ok });
});

interface DetailRow {
  line: number | null;
  item: string;
  detail: string | null;
  result: string;
  chip: string;
  tone: Tone;
  note: string | null;
  ref: string | null;
  /** ใบงานของ ref: เปิดได้ (id) · อยู่ในถังขยะ · ลบไปแล้ว */
  refId: number | null;
  refState: "open" | "trash" | "gone" | null;
}

/** รหัสใบงานในแถว → ใบนั้นเปิดได้ไหม — ใบในถังขยะบอกว่าอยู่ในถัง แทนลิงก์ที่กดแล้วเจอ "อยู่ในถังขยะ" (ตัวอย่างที่อนุมัติ) */
async function refStates(codes: string[]) {
  const list = [...new Set(codes)];
  if (!list.length) return new Map<string, { id: number; trash: boolean }>();
  const found = await prisma.workOrder.findMany({ where: { code: { in: list } }, select: { id: true, code: true, deletedAt: true } });
  return new Map(found.map((w) => [w.code, { id: w.id, trash: !!w.deletedAt }]));
}

const whoOf = async (userId: number | null, fallback: string | null) => {
  if (!userId) return { byName: fallback, byRole: null as string | null };
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true } });
  return { byName: u?.name ?? fallback, byRole: u ? ROLE_LABELS[u.role] ?? u.role : null };
};

router.get("/runs/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const show = typeof req.query.show === "string" && /^[A-Za-z]{1,20}$/.test(req.query.show) ? req.query.show : null;
  if (/^r\d{1,9}$/.test(id)) return res.json(await runDetail(Number(id.slice(1)), show));
  if (/^m\d{1,9}$/.test(id)) return res.json(await machineDetail(Number(id.slice(1))));
  if (/^p[A-Za-z0-9_-]{6,64}$/.test(id)) return res.json(await partsDetail(id.slice(1), show));
  res.status(404).json({ error: "ไม่พบรอบนำเข้านี้" });
});

async function runDetail(runId: number, show: string | null) {
  const run = await prisma.importRun.findUnique({ where: { id: runId } });
  if (!run) return { notFound: true, error: "ไม่พบรอบนำเข้านี้ — อาจถูกลบไปแล้ว" };
  const notePrefix = show ? NOTE_FILTER[run.kind]?.[show] : undefined;
  const where = { runId, ...(show ? (notePrefix ? { note: { startsWith: notePrefix } } : { result: show }) : {}) };
  const [grouped, rows, shownTotal, who, siblings] = await Promise.all([
    prisma.importRunRow.groupBy({ by: ["result"], where: { runId }, _count: { _all: true } }),
    prisma.importRunRow.findMany({ where, orderBy: [{ line: "asc" }, { id: "asc" }], take: ROWS_SHOWN }),
    prisma.importRunRow.count({ where }),
    whoOf(run.byUserId, run.byName),
    // รอบอื่นของไฟล์เดียวกัน (ใบแจ้งซ่อม) — "รอบนี้เปิดเฉพาะที่เหลือจากรอบ 11:58" / "เปิดที่เหลือแล้วในรอบ 13:05"
    run.kind === "REPAIR_FORM" && run.fileHash
      ? prisma.importRun.findMany({
          where: { kind: "REPAIR_FORM", fileHash: run.fileHash, id: { not: run.id } },
          orderBy: { startedAt: "asc" },
          select: { id: true, startedAt: true },
          take: 50,
        })
      : Promise.resolve([]),
  ]);
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.result] = g._count._all;
  const rowsTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const st = statusOf(run, counts);
  const summary = (run.summary ?? {}) as Record<string, unknown>;
  const refs = await refStates(rows.map((r) => r.ref).filter((x): x is string => !!x));
  const repair = run.kind === "REPAIR_FORM";
  const opened = counts.NEW ?? 0;
  const left = counts.PENDING ?? 0;
  const at = (d: Date) => d.toISOString();
  const before = siblings.filter((x) => x.startedAt < run.startedAt).pop() ?? null;
  const after = siblings.find((x) => x.startedAt > run.startedAt) ?? null;

  /** รอบอื่นของไฟล์เดียวกัน — หน้าจอทำเป็นลิงก์ "ดูรอบ 13:05" */
  type Other = { id: string; at: string } | null;
  const other = (x: { id: number; startedAt: Date } | null): Other => (x ? { id: `r${x.id}`, at: at(x.startedAt) } : null);
  let banner: { tone: Tone; title: string; text: string; runAfter?: Other; runBefore?: Other } | null = null;
  if (repair && st === "running") {
    banner = {
      tone: "info",
      title: `กำลังนำเข้า — เปิดไปแล้ว ${fmt(opened)} จาก ${fmt(opened + left)} ใบ`,
      text: "แอปของคนนำเข้ายังส่งชุดถัดไปอยู่ · หน้านี้ไม่อัปเดตเอง กดรีเฟรชเพื่อดูความคืบหน้า",
    };
  } else if (repair && st === "partial") {
    const why = run.error ?? "แอปไม่ได้ส่งชุดที่เหลือมา (ปิดหน้าเว็บ · เน็ตหลุด · เซิร์ฟเวอร์รีสตาร์ท)";
    banner = {
      tone: "warn",
      title: `หยุดกลางทาง — เปิดไปแล้ว ${fmt(opened)} จาก ${fmt(opened + left)} ใบ`,
      text: `${why} · อีก ${fmt(left)} แถวยังไม่ได้เปิด · นำเข้าไฟล์เดิมอีกครั้งได้เลย ใบที่เปิดแล้วถูกข้ามให้เอง`,
      runAfter: other(after),
    };
  } else if (repair && st === "failed") {
    banner = {
      tone: "bad",
      title: "นำเข้าไม่สำเร็จ — ไม่มีใบไหนเปิด",
      text: `${run.error ?? "แอปไม่ได้ส่งชุดแรกจนจบ (ปิดหน้าเว็บ · เน็ตหลุด · เซิร์ฟเวอร์รีสตาร์ท)"} · ไม่มีใบไหนถูกเปิด นำเข้าไฟล์เดิมใหม่ได้เลย`,
      runAfter: other(after),
    };
  } else if (repair && before && (counts.IMPORTED ?? 0) > 0) {
    banner = {
      tone: "info",
      title: "ไฟล์นี้เคยนำเข้ามาก่อน",
      text: "แถวที่เปิดไปแล้วในรอบก่อนขึ้นเป็น “นำเข้าแล้ว” ให้เอง ไม่เกิดใบซ้ำ",
      runBefore: other(before),
    };
  } else if (!repair && st === "failed") {
    banner = { tone: "bad", title: "นำเข้าไม่สำเร็จ", text: `${run.error ?? "เซิร์ฟเวอร์ทำรายการนี้ไม่สำเร็จ"} · ไม่มีอะไรถูกบันทึก` };
  }

  const kept = n(summary.rowsKept);
  const notes: string[] = [];
  if (repair && st === "failed" && rowsTotal === 0) notes.push("รอบที่ไม่สำเร็จก็ถูกบันทึกไว้ — แอดมินอีกคนเห็นทันทีว่ารอบนี้ไม่มีใบไหนเข้า ไม่ต้องไล่หาในรายการใบงาน");
  if (repair) notes.push("ไม่เก็บไฟล์ต้นฉบับ และไม่เก็บชื่อ/เบอร์ผู้ติดต่อสาขา (อยู่ในใบงานแล้ว) — เก็บแค่ผลทีละแถว");
  if (run.kind === "USER_AREA") notes.push("รหัสผ่านเริ่มต้นไม่ถูกเก็บในประวัติ — ไฟล์รหัสผ่านดาวน์โหลดได้ครั้งเดียวตอนนำเข้าเหมือนเดิม");
  if (run.kind === "USER_ROSTER") notes.push("รหัสผ่านตั้งต้นไม่ถูกเก็บในประวัติ");
  if (run.kind === "VEHICLE") notes.push("ไม่เก็บเลขบัตรเติมน้ำมัน / Easy Pass — บอกแค่ว่าช่องไหนเปลี่ยน");
  if (kept) notes.push(`เก็บรายการแถวไว้ ${fmt(kept)} จาก ${fmt(n(summary.rowsChanged))} แถวที่เปลี่ยน — ยอดสรุปด้านบนครบ`);

  return {
    id: `r${run.id}`,
    group: KIND_GROUP[run.kind] ?? "repair",
    kind: run.kind,
    kindLabel: KIND_LABEL[run.kind] ?? run.kind,
    fileName: run.fileName,
    ...who,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? (st === "running" ? null : run.lastAt),
    rowsInFile: run.rowsInFile,
    status: st,
    statusLabel: ST_LABEL[st],
    banner,
    tiles: tilesOf(run.kind, summary, counts, st),
    heads: repair ? ["แถว", "สาขา · เครื่อง", "อาการ", "ผล", "ใบงาน"] : ["แถว", "รายการ", "รายละเอียด", "ผล", "หมายเหตุ"],
    rows: rows.map((r): DetailRow => {
      const [chip, tone] = r.result === "PENDING" && st === "running" ? ["รอเปิด", "info" as Tone] : resultOf(run.kind, r.result);
      const w = r.ref ? refs.get(r.ref) : undefined;
      return {
        line: r.line,
        item: repair
          ? [`${r.code ?? ""} ${r.name ?? "— ไม่พบในระบบ"}`.trim(), r.machine].filter(Boolean).join(" · ")
          : [r.code, r.name].filter(Boolean).join(" ") + (r.machine && !(r.detail ?? "").includes(r.machine) ? ` · ${r.machine}` : ""),
        detail: r.detail,
        result: r.result,
        chip,
        tone,
        note: r.note,
        ref: r.ref,
        refId: w && !w.trash ? w.id : null,
        refState: r.ref ? (w ? (w.trash ? "trash" : "open") : "gone") : null,
      };
    }),
    show,
    shownTotal,
    rowsTotal,
    rowsNote: repair ? "all" : "changed",
    notes,
    actions: { excel: rowsTotal > 0 || !!run.error, opened: repair ? opened : 0 },
  };
}

async function machineDetail(importId: number) {
  const m = await prisma.machineImport.findUnique({ where: { id: importId } });
  if (!m) return { notFound: true, error: "ไม่พบรอบนำเข้านี้ — อาจถูกลบไปแล้ว" };
  const who = await whoOf(m.uploadedById, null);
  const t = (key: string, label: string, v: number, tone: Tone): Tile => ({ key, label, n: v, tone, rows: false });
  return {
    id: `m${m.id}`,
    group: "machine" as Group,
    kind: "MACHINE",
    kindLabel: KIND_LABEL.MACHINE,
    fileName: readableName(m.fileName) || "(ไม่มีชื่อไฟล์)",
    ...who,
    startedAt: m.createdAt,
    finishedAt: null,
    snapshotAt: m.snapshotAt,
    rowsInFile: m.rowsInFile,
    status: "ok" as St,
    statusLabel: ST_LABEL.ok,
    banner: null,
    tiles: [
      t("rows", "แถวในไฟล์", m.rowsInFile, "muted"),
      t("off", "เครื่องดับ", m.machinesOff, "bad"),
      t("lost", "สาขาสัญญาณหาย", m.branchesSignalLost, "warn"),
      t("opened", "เปิดเคสใหม่", m.opened, "ok"),
      t("closed", "ปิดเคส (หายจากไฟล์)", m.closed, "info"),
      ...(m.duplicateRows ? [t("dup", "แถวซ้ำที่ตัดออก", m.duplicateRows, "muted")] : []),
    ],
    heads: [],
    rows: [] as DetailRow[],
    show: null,
    shownTotal: 0,
    rowsTotal: 0,
    rowsNote: "none",
    notes: ["รายงานเครื่องเก็บยอดสรุปแต่ละรอบอยู่แล้วตั้งแต่เริ่มใช้ — หน้านี้แค่รวมมาให้ดูที่เดียวกับไฟล์อื่น"],
    actions: { excel: false, opened: 0, machinePage: true },
  };
}

async function partsDetail(batchId: string, show: string | null) {
  const files = await prisma.sparePartImport.findMany({ where: { batchId }, orderBy: { createdAt: "asc" } });
  if (!files.length) return { notFound: true, error: "ไม่พบรอบนำเข้านี้ — อาจถูกลบไปแล้ว" };
  const b = partsBatch(files);
  const who = await whoOf(files[0].byUserId, files[0].byName);
  const many = files.length > 1;
  // แถวจากรายละเอียดที่รายงานอัปเดตอะไหล่เก็บไว้อยู่แล้ว (เพิ่ม · แก้ · รูป · ข้าม) — ไม่เก็บซ้ำในตารางประวัติ
  const all: DetailRow[] = files.flatMap((f) => {
    const d = (f.details ?? {}) as unknown as Partial<ReportDetails>;
    const pre = many ? `${f.fileName}: ` : "";
    const items = (d.items ?? []).map((i): DetailRow => {
      const key = i.action === "CREATE" ? "created" : i.action === "UPDATE" ? "updated" : "images";
      const [chip, tone] = resultOf("SPARE_PART", key);
      const diffs = i.diffs.map((x) => `${x.label} ${x.from || "—"} → ${x.to || "—"}`).join(" · ");
      return {
        line: i.line,
        item: i.partCode,
        detail: i.name,
        result: key,
        chip,
        tone,
        note: `${pre}${i.action === "CREATE" ? "รายการใหม่" : diffs || (i.image ? "รูปใหม่จากไฟล์" : "")}`,
        ref: null,
        refId: null,
        refState: null,
      };
    });
    const problems = (d.problems ?? []).map((p): DetailRow => {
      const [chip, tone] = resultOf("SPARE_PART", "skipped");
      return { line: p.line, item: p.partCode ?? "ไม่มีรหัสอะไหล่", detail: p.name, result: "skipped", chip, tone, note: `${pre}${p.note}`, ref: null, refId: null, refState: null };
    });
    return [...problems, ...items];
  });
  const counts: Record<string, number> = {};
  for (const r of all) counts[r.result] = (counts[r.result] ?? 0) + 1;
  const picked = show ? all.filter((r) => r.result === show) : all;
  const tot = b.totals;
  const t = (key: string, label: string, v: number, tone: Tone): Tile => ({ key, label, n: v, tone, rows: (counts[key] ?? 0) > 0 });
  const brand = [...new Set(files.map((f) => f.brandFile).filter(Boolean))];
  return {
    id: `p${batchId}`,
    group: "parts" as Group,
    kind: "SPARE_PART",
    kindLabel: KIND_LABEL.SPARE_PART,
    fileName: b.fileName,
    ...who,
    startedAt: b.startedAt,
    finishedAt: files[files.length - 1].createdAt,
    rowsInFile: tot.rows,
    brandFiles: brand,
    files: b.files,
    status: b.st,
    statusLabel: ST_LABEL[b.st],
    banner: b.incomplete
      ? {
          tone: (b.st === "failed" ? "bad" : "warn") as Tone,
          title: b.st === "failed" ? "อัปเดตไม่สำเร็จ" : "อัปเดตไม่ครบ — หยุดกลางทาง",
          text: `${b.incomplete} จาก ${files.length} ไฟล์อัปเดตไม่ครบ — บางรายการอาจบันทึกไปแล้ว กดอัปเดตไฟล์นั้นซ้ำได้ (ทำเฉพาะส่วนที่ยังต่าง)`,
        }
      : null,
    tiles: [
      t("created", "เพิ่มใหม่", tot.created, "ok"),
      t("updated", "แก้ข้อมูล", tot.updated, "info"),
      t("images", "เพิ่ม/เปลี่ยนรูป", tot.images, "info"),
      t("same", "เหมือนเดิม", tot.same, "muted"),
      t("skipped", "ข้าม", tot.skipped, "warn"),
    ],
    heads: ["แถว", "รหัสอะไหล่", "ชื่อ", "ผล", "สิ่งที่เปลี่ยน"],
    rows: picked.slice(0, ROWS_SHOWN),
    show,
    shownTotal: picked.length,
    rowsTotal: all.length,
    rowsNote: "changed",
    notes: ["ค่าเดิม → ค่าใหม่ครบทุกช่อง รูป และอะไหล่ที่ไม่อยู่ในไฟล์ อยู่ในรายงานอัปเดตอะไหล่ (มีอยู่แล้ว) — ดาวน์โหลด Excel ได้จากที่นั่น"],
    actions: { excel: false, opened: 0, partsBatch: batchId },
  };
}

/**
 * ผลทีละแถวเป็น Excel — ไฟล์สร้างจากที่เก็บไว้ (ไม่ได้เก็บไฟล์ต้นฉบับ — เจ้าของงานเลือก)
 * แผ่นแรกสรุปรอบ · แผ่นสองทุกแถวที่เก็บ (ใบแจ้งซ่อม = ทุกแถวในไฟล์) · ไม่มีชื่อ/เบอร์ผู้ติดต่อ (ไม่ได้เก็บตั้งแต่ต้น)
 */
router.get("/runs/:id/excel", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const m = /^r(\d{1,9})$/.exec(String(req.params.id));
  const run = m ? await prisma.importRun.findUnique({ where: { id: Number(m[1]) } }) : null;
  if (!run) return res.status(404).json({ error: "ไม่พบรอบนำเข้านี้" });
  const rows = await prisma.importRunRow.findMany({ where: { runId: run.id }, orderBy: [{ line: "asc" }, { id: "asc" }] });
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.result] = (counts[r.result] ?? 0) + 1;
  const st = statusOf(run, counts);
  const repair = run.kind === "REPAIR_FORM";
  const who = await whoOf(run.byUserId, run.byName);
  const when = (d: Date | null) => (d ? d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "");

  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet("สรุป");
  sum.columns = [{ width: 30 }, { width: 70 }];
  const info: [string, string | number][] = [
    ["ไฟล์", run.fileName],
    ["ชนิด", KIND_LABEL[run.kind] ?? run.kind],
    ["นำเข้าโดย", [who.byName, who.byRole ? `(${who.byRole})` : null].filter(Boolean).join(" ")],
    ["เริ่ม", when(run.startedAt)],
    ["จบ / ชุดล่าสุด", when(run.finishedAt ?? run.lastAt)],
    ["สถานะ", ST_LABEL[st]],
    ...(run.error ? [["ข้อความ", run.error] as [string, string]] : []),
    ["แถวในไฟล์", run.rowsInFile],
  ];
  for (const [k, v] of info) sum.addRow([k, v]);
  sum.addRow([]);
  for (const t of tilesOf(run.kind, (run.summary ?? {}) as Record<string, unknown>, counts, st)) sum.addRow([t.label, t.n]);
  sum.getColumn(1).font = { bold: true };

  const ws = wb.addWorksheet("ผลทีละแถว", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = repair
    ? [
        { header: "แถว", width: 7 },
        { header: "รหัสสาขา", width: 11 },
        { header: "ชื่อสาขา", width: 34 },
        { header: "เครื่อง", width: 14 },
        { header: "อาการ", width: 44 },
        { header: "ผล", width: 22 },
        { header: "เหตุผล / หมายเหตุ", width: 60 },
        { header: "ใบงาน", width: 12 },
      ]
    : [
        { header: "แถว", width: 7 },
        { header: "รหัส / ทะเบียน", width: 16 },
        { header: "ชื่อ", width: 34 },
        { header: "เครื่อง", width: 12 },
        { header: "รายละเอียด", width: 50 },
        { header: "ผล", width: 26 },
        { header: "หมายเหตุ", width: 60 },
        { header: "อ้างอิง", width: 12 },
      ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow([r.line ?? "", r.code ?? "", r.name ?? "", r.machine ?? "", r.detail ?? "", resultOf(run.kind, r.result)[0], r.note ?? "", r.ref ?? ""]);
  }
  const stamp = run.startedAt.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const stored = saveDocument({
    filename: `ผลนำเข้า-${GROUP_LABEL[KIND_GROUP[run.kind] ?? "repair"]}-${stamp}-รอบ${run.id}.xlsx`,
    asciiFilename: `import-result-${run.id}-${stamp}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data: Buffer.from(await wb.xlsx.writeBuffer()),
    ownerId: req.auth!.userId,
  });
  res.json({ filename: stored.filename, path: documentPath(stored), rows: rows.length });
});

export default router;
