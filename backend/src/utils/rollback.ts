/**
 * ย้อนขั้นแล้วข้อมูลไม่หาย + เห็นว่าใบนี้ถูกย้อนมา (เจ้าของงานขอ ต.ค. 69)
 *
 * การย้อนยังล้างทีม/วันนัด/ผลเช็คคลังออกจากใบงานเหมือนเดิม — ค้างไว้ใบจะโผล่บนบอร์ดแผนงานทีมเดิม
 * ทั้งที่ไม่มีใครจะไป แต่ค่าที่ล้างถูกเก็บไว้ในประวัติ ROLLED_BACK (WorkOrderLog.meta)
 * แล้วหน้าจอเติมค่าเดิมให้ตอนถึงขั้นนั้นอีกครั้ง — ทุกขั้นยังต้องมีคนกดยืนยัน ไม่ข้ามขั้นให้เอง
 */
import { WORK_ORDER_STAGE_ORDER, WORK_ORDER_STATUS_LABELS } from "./constants";

/** ค่าที่ถูกล้างตอนย้อน — เก็บไว้ทั้งหมด หน้าจอเลือกเติมเฉพาะช่องที่ตอนนี้ว่าง */
export interface RollbackSnapshot {
  /** ขั้นก่อนย้อน */
  from: string;
  needsParts: boolean | null;
  assignedTeam: string | null;
  scheduledAt: string | null;
  scheduledTime: string | null;
  partsExpectedAt: string | null;
  /** ผลเช็คคลังรอบก่อน — เฉพาะตัวที่เคยเช็คแล้ว (มีหรือหมด) */
  parts: { sparePartId: number; inStock: boolean | null; warehouse: string | null; requisitionNo: string | null }[];
}

interface LogLike {
  action: string;
  status: string;
  note: string | null;
  createdAt: Date;
  meta?: unknown;
  user?: { name: string } | null;
}

/**
 * ใบนี้ "เพิ่งถูกย้อนมา" ไหม — ป้าย ↩ ย้อนขั้น ขึ้นจนกว่าจะมีคนกดผ่านขั้นที่ย้อนไป
 *
 * นับว่ายังค้างเมื่อ: สถานะตอนนี้คือขั้นที่ย้อนไป และทุกรายการหลังจากย้อนยังอยู่ขั้นนั้น
 * (แนบรูป แก้รายละเอียด เลื่อนวันของเข้า ไม่ทำให้ป้ายหาย — มีแต่การเดินขั้นที่ทำให้หาย)
 * logs: ของใบนี้ เรียงใหม่ก่อนเก่า
 */
export function activeRollback(status: string, logs: LogLike[]) {
  const i = logs.findIndex((l) => l.action === "ROLLED_BACK");
  if (i < 0) return null;
  const log = logs[i];
  if (log.status !== status || logs.slice(0, i).some((l) => l.status !== log.status)) return null;
  const meta = log.meta as RollbackSnapshot | null | undefined;
  // เหตุผลอยู่ท้ายบันทึก "จาก … กลับไป … — เหตุผล" (ประวัติเก่าก่อนมี meta ก็อ่านได้)
  const reason = log.note?.split(" — ").slice(1).join(" — ") || log.note;
  return {
    from: meta?.from ?? null,
    // ประวัติก่อนมี meta: ชื่อขั้นเดิมอยู่ในบันทึก "จาก “…” กลับไป …"
    fromLabel: meta?.from
      ? WORK_ORDER_STATUS_LABELS[meta.from] ?? meta.from
      : log.note?.match(/^จาก “(.+?)”/)?.[1] ?? null,
    reason,
    byName: log.user?.name ?? null,
    at: log.createdAt,
  };
}

/**
 * ค่าเดิมก่อนย้อนรอบล่าสุด — ใช้เติมฟอร์มของขั้นที่ยังไม่ถึงขั้นเดิม
 * ผ่านขั้นเดิมไปแล้ว = ไม่เกี่ยวแล้ว (ค่าตอนนี้คือค่าที่คนกรอกใหม่)
 */
export function rollbackPrefill(status: string, logs: LogLike[]): RollbackSnapshot | null {
  const log = logs.find((l) => l.action === "ROLLED_BACK");
  const meta = log?.meta as RollbackSnapshot | null | undefined;
  if (!meta?.from) return null;
  const order = WORK_ORDER_STAGE_ORDER as readonly string[];
  return order.indexOf(status) <= order.indexOf(meta.from) ? meta : null;
}
