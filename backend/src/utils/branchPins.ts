/**
 * ค่าของสาขาที่แอดมินแก้ในแอป แล้วต้องอยู่รอดการนำเข้าไฟล์รอบถัดไป
 *
 * ทีม CM/PM → BranchTeamMove (หน้าทีมช่างแสดงเป็นรายการย้ายสาขา คืนตามไฟล์ได้) — ตัวนำเข้าใช้ผ่าน applyTeamAliases
 * ภาค/ประเภท → BranchPin — ตัวนำเข้าใช้ผ่าน applyBranchPins
 * ชื่อสาขา → BranchPin field "name" (พ.ย. 69) — ตัวนำเข้ารายงานเครื่องเช็คใน SQL เอง (machines/import.ts writeReportBranches)
 *
 * ทั้งสองแบบเก็บ "ค่าก่อนแก้ครั้งแรก" ไว้ แก้กลับเป็นค่านั้น = เลิกบังคับ ให้ไฟล์เป็นคนบอกอีกครั้ง
 * (ชื่อต่างออกไปนิดเดียว: ตัวนำเข้าอัปเดตค่านี้เป็นชื่อในรายงานล่าสุดทุกรอบ — ดู renameBranch)
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

type Tx = Prisma.TransactionClient;
export type TeamField = "zone" | "pmTeam";
export type PinField = "region" | "ownership";

/**
 * จำการย้ายทีมไว้ให้ตัวนำเข้า — ผู้เรียกเขียนค่าใหม่ลงสาขาเอง
 * (ย้ายสาขาเข้าทีมทีละหลายร้อยสาขาใช้ updateMany ทีเดียว ฐานข้อมูลอยู่คนละ region ทุกคำสั่งคือรอบเดินทาง)
 */
export async function recordTeamMove(
  tx: Tx,
  branch: { id: number; zone: string | null; pmTeam: string | null; teamMoves: { id: number; field: string; fromTeam: string | null }[] },
  field: TeamField,
  team: string,
  userId: number
) {
  const prev = branch.teamMoves.find((m) => m.field === field);
  // fromTeam = ทีมตามไฟล์ก่อนย้ายครั้งแรก — ย้ายซ้ำไม่ทับ ไม่งั้น "คืนตามไฟล์" จะคืนไปทีมที่ย้ายในแอป
  const fromTeam = prev ? prev.fromTeam : branch[field];
  if (fromTeam === team) {
    // ย้ายกลับไปทีมเดิมตามไฟล์ = ไม่ต้องบังคับอะไรแล้ว
    if (prev) await tx.branchTeamMove.delete({ where: { id: prev.id } });
    return;
  }
  await tx.branchTeamMove.upsert({
    where: { branchId_field: { branchId: branch.id, field } },
    create: { branchId: branch.id, field, fromTeam, toTeam: team, movedById: userId },
    update: { toTeam: team, movedById: userId, createdAt: new Date() },
  });
}

/** แก้ภาค/ประเภท แล้วจำไว้ให้ตัวนำเข้า · คืน true ถ้าค่าเปลี่ยน */
export async function pinBranchField(
  tx: Tx,
  branch: { id: number; region: string | null; ownership: string | null; pins: { id: number; field: string; fromValue: string | null }[] },
  field: PinField,
  value: string,
  userId: number
) {
  if (branch[field] === value) return false;
  await tx.branch.update({ where: { id: branch.id }, data: { [field]: value } });
  const prev = branch.pins.find((p) => p.field === field);
  const fromValue = prev ? prev.fromValue : branch[field];
  if (fromValue === value) {
    if (prev) await tx.branchPin.delete({ where: { id: prev.id } });
    return true;
  }
  await tx.branchPin.upsert({
    where: { branchId_field: { branchId: branch.id, field } },
    create: { branchId: branch.id, field, fromValue, value, pinnedById: userId },
    update: { value, pinnedById: userId, createdAt: new Date() },
  });
  return true;
}

/**
 * แถวที่อ่านจากไฟล์ (ทะเบียนสาขา/รายงานเครื่อง) → ใช้ภาค/ประเภทที่แก้ในแอปแทน — แก้ในที่
 * ไฟล์ไม่ได้กรอกช่องนั้น = ตัวนำเข้าไม่แตะค่าในระบบอยู่แล้ว (COALESCE) ไม่ต้องใส่
 */
export async function applyBranchPins(rows: { code?: string; branchCode?: string; region?: string | null; ownership?: string | null }[]) {
  const pins = await prisma.branchPin.findMany({ select: { field: true, value: true, branch: { select: { code: true } } } });
  if (pins.length === 0) return 0;
  const pinned = new Map(pins.map((p) => [`${p.branch.code}|${p.field}`, p.value]));
  let changed = 0;
  for (const r of rows) {
    const code = r.code ?? r.branchCode;
    if (!code) continue;
    for (const key of ["region", "ownership"] as const) {
      if (!(key in r) || !r[key]) continue;
      const v = pinned.get(`${code}|${key}`);
      if (v !== undefined && v !== r[key]) {
        r[key] = v;
        changed++;
      }
    }
  }
  return changed;
}

/** ใครทำ — ประวัติสาขาเก็บชื่อไว้ตรง ๆ (BranchLog ไม่ผูก User · บัญชีถูกลบแล้วประวัติต้องยังอ่านออก) */
export interface BranchActor {
  id: number;
  name: string | null;
}

export async function branchActor(userId: number): Promise<BranchActor> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return { id: userId, name: me?.name ?? null };
}

export type BranchLogAction = "RENAMED" | "NAME_RESTORED" | "CLOSED" | "REOPENED";

/**
 * ลงประวัติสาขา — ต้องเรียกในทรานแซกชันเดียวกับที่แก้สาขา: แก้สำเร็จแต่ไม่มีประวัติ (หรือกลับกัน) คือประวัติที่โกหก
 * note คือข้อความที่คนอ่าน เขียนสำเร็จรูปตอนนั้นเลย ไม่ประกอบใหม่ตอนแสดง (ชื่อคน/สาขาเปลี่ยนทีหลังได้)
 */
export async function logBranch(
  tx: Tx,
  branchId: number,
  action: BranchLogAction,
  note: string,
  actor: BranchActor,
  meta?: Prisma.InputJsonValue
) {
  await tx.branchLog.create({ data: { branchId, action, note, meta, byUserId: actor.id, byName: actor.name } });
}

/** ชื่อปัจจุบัน + ชื่อตามรายงาน (เฉพาะเมื่อแก้ชื่อในแอปอยู่ — ไม่ได้แก้ = null) ให้แผงแก้ไขใช้ต่อได้ทันที */
export interface BranchNameState {
  id: number;
  code: string;
  name: string;
  reportName: string | null;
}

/**
 * อ่านสาขาในทรานแซกชันเดียวกับที่เขียน ไม่ใช้ค่าที่ผู้เรียกอ่านไว้ก่อน — ระหว่างนั้นตัวนำเข้ารายงานเครื่อง
 * (วันละสองรอบ) อาจเพิ่งอัปเดตชื่อตามรายงานหรือเลิกบังคับไปแล้ว ประวัติ "เดิม → ใหม่" ต้องเป็นชื่อเดิมจริง
 */
function namedBranch(tx: Tx, id: number) {
  return tx.branch.findUnique({
    where: { id },
    select: { id: true, code: true, name: true, pins: { where: { field: "name" }, select: { fromValue: true } } },
  });
}

/**
 * แก้ชื่อสาขาในแอป (เจ้าของงานตัดสิน 4 พ.ย. 69) — จำไว้ให้ตัวนำเข้ารายงานเครื่อง และลงประวัติ "ชื่อสาขา: เดิม → ใหม่"
 *
 * รายงานเครื่องอัปวันละสองครั้งและเขียนชื่อทุกสาขาในไฟล์ ถ้าไม่จำ ชื่อที่แก้อยู่ได้ครึ่งวัน
 * แก้กลับเป็นชื่อตามรายงาน = เลิกบังคับ (เหมือนภาค/ประเภท) · null = ไม่พบสาขา · changed=false = ชื่อเดิมอยู่แล้ว
 */
export async function renameBranch(tx: Tx, id: number, name: string, actor: BranchActor) {
  const b = await namedBranch(tx, id);
  if (!b) return null;
  const pin = b.pins[0];
  if (b.name === name) return { id, code: b.code, name, reportName: pin ? pin.fromValue : null, changed: false };
  // ชื่อตามรายงาน = ชื่อก่อนแก้ครั้งแรก (แก้ซ้ำไม่ทับ ไม่งั้น "คืนตามรายงาน" ได้ชื่อที่แก้ในแอปครั้งก่อน)
  const reportName = pin ? pin.fromValue : b.name;
  await tx.branch.update({ where: { id }, data: { name } });
  if (reportName === name) {
    // deleteMany ไม่ใช่ delete: ตัวนำเข้าอาจเลิกบังคับไปแล้วระหว่างทาง — ไม่มีแถวให้ลบไม่ใช่ข้อผิดพลาด
    await tx.branchPin.deleteMany({ where: { branchId: id, field: "name" } });
  } else {
    await tx.branchPin.upsert({
      where: { branchId_field: { branchId: id, field: "name" } },
      create: { branchId: id, field: "name", fromValue: reportName, value: name, pinnedById: actor.id },
      update: { value: name, pinnedById: actor.id, createdAt: new Date() },
    });
  }
  await logBranch(tx, id, "RENAMED", `ชื่อสาขา: ${b.name} → ${name}`, actor, { from: b.name, to: name });
  return { id, code: b.code, name, reportName: reportName === name ? null : reportName, changed: true };
}

/**
 * "คืนตามรายงาน" — กลับไปใช้ชื่อในรายงานเครื่องล่าสุด (fromValue ที่ตัวนำเข้าคอยอัปเดต) แล้วเลิกบังคับ
 * null = ไม่พบสาขา · changed=false = สาขานี้ใช้ชื่อตามรายงานอยู่แล้ว (ไม่มีอะไรให้คืน)
 */
export async function restoreBranchName(tx: Tx, id: number, actor: BranchActor) {
  const b = await namedBranch(tx, id);
  if (!b) return null;
  const pin = b.pins[0];
  if (!pin) return { id, code: b.code, name: b.name, reportName: null, changed: false };
  const name = pin.fromValue ?? b.name;
  await tx.branchPin.deleteMany({ where: { branchId: id, field: "name" } });
  if (name !== b.name) await tx.branch.update({ where: { id }, data: { name } });
  await logBranch(tx, id, "NAME_RESTORED", `คืนชื่อตามรายงาน: ${b.name} → ${name}`, actor, { from: b.name, to: name });
  return { id, code: b.code, name, reportName: null, changed: true };
}
