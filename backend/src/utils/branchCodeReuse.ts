/**
 * ใช้รหัสของสาขาที่ปิดแล้วกับสาขาใหม่ (เจ้าของงานตัดสิน 4 พ.ย. 69: "ไม่รวมสาขา เปลี่ยนใหม่ คือข้อมูลใหม่ทั้งหมด เเต่ยังเก็บประวัติเก่าอยู่")
 *
 * เรื่องจริง: ปิดสาขา C0546 (ปั๊ม ปตท. นครปฐม) แล้วบริษัทเอารหัส C0546 ไปใช้กับร้านใหม่ที่ภูเก็ต
 * code เป็น @unique และไฟล์ทุกชนิด (รายงานเครื่อง ทะเบียน สาขายกเลิก รายชื่อ Area Team) จับคู่สาขาด้วยรหัส
 * จะให้สองสาขาถือรหัสเดียวกันไม่ได้ และจะเอาสาขาเดิมมาเปิดใหม่ก็ไม่ได้ (คือการรวมสาขาที่เจ้าของงานไม่เอา)
 *
 * ทางที่เลือก: สาขาเดิมเปลี่ยนรหัสเป็น "C0546 (เดิม)" (ซ้ำแล้วเป็น "(เดิม 2)" …) เก็บรหัสจริงไว้ที่ originalCode
 * ทุกอย่างที่ผูกด้วย id (ใบงาน เครื่อง เคส ประวัติ ชื่อที่จำไว้ ทีมที่ย้าย Supervisor/Maid) อยู่กับสาขาเดิมตามเดิม
 * ไม่มีอะไรย้ายไปสาขาใหม่เงียบ ๆ · สาขาใหม่ได้รหัส C0546 และเริ่มจากว่าง ไฟล์รอบหน้าที่มี C0546 ไปลงสาขาใหม่
 *
 * รูปแบบ "(เดิม)" มีช่องว่างกับวงเล็บ — ไม่ใช่รหัสในทะเบียนเลยจึงไม่ชนรหัสจริง และคนอ่านรู้ทันทีว่าเป็นสาขาเก่า
 * ทุกที่ที่รับรหัสจากไฟล์ต้องไม่สร้าง/แก้สาขาที่รหัสแบบนี้ (isRetiredCode) — ดู README หัวข้อใช้รหัสของสาขาที่ปิดแล้ว
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ALIVE } from "./trash";
import { BranchActor, logBranch } from "./branchPins";
import { thaiDateTime } from "../reports/openerReport";

type Tx = Prisma.TransactionClient;

/** "C0546 (เดิม)" · "C0546 (เดิม 2)" — ระบบตั้งให้สาขาที่ยกรหัสให้สาขาใหม่ ไม่ใช่รหัสในทะเบียน */
const RETIRED_CODE = /\s\(เดิม(?:\s\d+)?\)$/;

export const isRetiredCode = (code: string) => RETIRED_CODE.test(code.trim());

export function retiredCode(code: string, n: number) {
  return n <= 1 ? `${code} (เดิม)` : `${code} (เดิม ${n})`;
}

/** รหัส "(เดิม)" ตัวแรกที่ยังว่าง — รหัสเดียวกันถูกใช้ซ้ำได้หลายรอบ (สาขาใหม่ปิดแล้วรหัสไปร้านที่สามอีก) */
export async function nextRetiredCode(db: Tx, code: string) {
  const taken = new Set(
    (await db.branch.findMany({ where: { code: { startsWith: `${code} (เดิม` } }, select: { code: true } })).map((b) => b.code)
  );
  for (let n = 1; ; n++) {
    const c = retiredCode(code, n);
    if (!taken.has(c)) return c;
  }
}

/** ข้อมูลสาขาที่ปิดแล้วที่ถือรหัสอยู่ — แอปขึ้นกล่องยืนยันจากค่านี้ (409 ของ POST /branches) */
export interface ReuseOffer {
  id: number;
  code: string;
  name: string;
  closedAt: Date;
  closedNote: string | null;
  workOrders: number;
  machines: number;
  /** รหัสที่สาขาเดิมจะได้ถ้ายืนยัน — ให้กล่องยืนยันบอกตรงตามที่จะเกิด ไม่ใช่เดา "(เดิม)" เองแล้วได้ "(เดิม 2)" */
  retiredCode: string;
}

export async function reuseOffer(b: { id: number; code: string; name: string; cancelledAt: Date; cancelledNote: string | null }): Promise<ReuseOffer> {
  const [workOrders, machines, retired] = await Promise.all([
    // ใบในถังขยะไม่นับ — แอดมินหาใบพวกนั้นในรายการของสาขาไม่เจอ และจะถูกลบจริงใน 30 วัน
    prisma.workOrder.count({ where: { ...ALIVE, branchId: b.id } }),
    prisma.machine.count({ where: { branchId: b.id } }),
    nextRetiredCode(prisma, b.code),
  ]);
  return { id: b.id, code: b.code, name: b.name, closedAt: b.cancelledAt, closedNote: b.cancelledNote, workOrders, machines, retiredCode: retired };
}

/** สาขาเดิมถูกเปิดคืน/ใช้รหัสไปแล้วระหว่างที่แอดมินดูกล่องยืนยันอยู่ — ตอบ 409 ให้โหลดใหม่ ไม่ทำต่อ */
export class ReuseConflict extends Error {}

/**
 * เปลี่ยนรหัสสาขาเดิมเป็น "(เดิม)" + สร้างสาขาใหม่ด้วยรหัสนั้น + ลงประวัติทั้งสองสาขา — ทรานแซกชันเดียว
 * ครึ่งเดียวไม่ได้: สาขาเดิมเปลี่ยนรหัสแต่สาขาใหม่ไม่เกิด = รหัสหายจากระบบ · ประวัติไม่ครบ = ตอบไม่ได้ว่ารหัสไปไหน
 */
export async function reuseClosedCode(code: string, data: Omit<Prisma.BranchUncheckedCreateInput, "code">, actor: BranchActor) {
  return prisma.$transaction(
    async (tx) => {
      // ล็อกแถวสาขาเดิม — แอดมินสองคนกดยืนยันพร้อมกัน คนที่สองต้องได้ "ใช้ไปแล้ว" ไม่ใช่สาขาใหม่สองสาขากับ "(เดิม 2)"
      const [old] = await tx.$queryRaw<{ id: number; name: string; cancelledAt: Date | null }[]>`
        SELECT id, name, "cancelledAt" FROM "Branch" WHERE code = ${code} FOR UPDATE`;
      if (!old || !old.cancelledAt) throw new ReuseConflict();
      const retired = await nextRetiredCode(tx, code);
      await tx.branch.update({ where: { id: old.id }, data: { code: retired, originalCode: code } });
      const created = await tx.branch.create({ data: { ...data, code, reusedFromId: old.id, reusedAt: new Date() } });
      await logBranch(tx, old.id, "CODE_RETIRED", `รหัส ${code} ไปใช้กับสาขาใหม่ “${created.name}” — สาขานี้เปลี่ยนเป็น “${retired}”`, actor, {
        from: code,
        to: retired,
        newBranchId: created.id,
        newBranchName: created.name,
      });
      await logBranch(tx, created.id, "CODE_REUSED", `รับรหัส ${code} ต่อจากสาขาที่ปิดแล้ว “${old.name}” (ตอนนี้ “${retired}”)`, actor, {
        code,
        fromBranchId: old.id,
        fromBranchName: old.name,
        retiredCode: retired,
      });
      return { branch: created, retired: { id: old.id, code: retired, name: old.name } };
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
}

/**
 * ไฟล์สาขายกเลิกเป็นไฟล์สะสม ไม่มีวันที่ — แถว C0546 ที่ค้างอยู่ในไฟล์คือการปิดสาขาเดิม ถ้าปล่อยตามรหัส
 * อัปไฟล์เดิมซ้ำครั้งเดียวสาขาใหม่ที่ภูเก็ตถูกปิดทั้งสาขา (เคสบนกระดานปิดหมด) · ข้อความนี้ขึ้นในหน้าสรุปก่อนกดยืนยัน
 */
export function reusedSkipNote(code: string, reusedAt: Date, rows: number) {
  return (
    `ข้าม ${code}${rows > 1 ? ` (${rows} แถว)` : ""} — รหัสนี้ใช้กับสาขาใหม่เมื่อ ${thaiDateTime(reusedAt, false)} (สาขาเดิมปิดไปแล้ว)` +
    ` · ถ้าจะปิดสาขาใหม่ ให้กดปิดสาขาในแอป`
  );
}

/** แถวจากไฟล์ที่รหัสเป็นแบบ "(เดิม)" — ตัวนำเข้าทุกตัวข้าม และบอกในหน้าสรุปด้วยข้อความเดียวกัน */
export function retiredRowsNote(codes: string[]) {
  const list = [...new Set(codes)];
  return (
    `ข้าม ${codes.length} แถว — รหัสลงท้าย “(เดิม)” ระบบตั้งให้สาขาที่ยกรหัสให้สาขาใหม่ ไม่ใช่รหัสในทะเบียน ` +
    `ไฟล์แก้สาขาพวกนี้ไม่ได้: ${list.slice(0, 5).join(", ")}${list.length > 5 ? ` และอีก ${list.length - 5}` : ""}`
  );
}
