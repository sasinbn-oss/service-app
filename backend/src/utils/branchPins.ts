/**
 * ค่าของสาขาที่แอดมินแก้ในแอป แล้วต้องอยู่รอดการนำเข้าไฟล์รอบถัดไป
 *
 * ทีม CM/PM → BranchTeamMove (หน้าทีมช่างแสดงเป็นรายการย้ายสาขา คืนตามไฟล์ได้) — ตัวนำเข้าใช้ผ่าน applyTeamAliases
 * ภาค/ประเภท → BranchPin — ตัวนำเข้าใช้ผ่าน applyBranchPins
 *
 * ทั้งสองแบบเก็บ "ค่าก่อนแก้ครั้งแรก" ไว้ แก้กลับเป็นค่านั้น = เลิกบังคับ ให้ไฟล์เป็นคนบอกอีกครั้ง
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
