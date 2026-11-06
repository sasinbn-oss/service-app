/**
 * หัวหน้าภาคที่ดูแลงาน IT (เจ้าของงานตัดสิน 6 พ.ย. 69) — ทำขั้นของแอดมินในใบ IT ได้
 *
 * ย้ายมาจากหน้าใบงาน (6 พ.ย. 69) เพราะปุ่มในแถวของแท็บรอเงิน/งานของฉันวันนี้ ("ตามลูกค้าแล้ว" · "ลูกค้าไม่ซ่อม")
 * ต้องตัดสินด้วยกติกาเดียวกับหน้าใบงานเป๊ะ — ถ้ามีสองชุด วันหนึ่งจะแก้ชุดเดียวแล้วแถวกับหน้าใบงานให้สิทธิ์ไม่ตรงกัน
 */

/** ผู้ใช้คนนี้เป็นหัวหน้าภาคที่ดูแลงาน IT (ไม่ใช่ตอนดูในฐานะ — ดูได้อย่างเดียว) */
export function itLeadOf(u: { role?: string; itLead?: boolean; viewAs?: unknown } | null | undefined) {
  return !!u && u.role === "SUPERVISOR" && !!u.itLead && !u.viewAs;
}
/**
 * ขั้นของแอดมินที่หัวหน้าภาคที่ดูแลงาน IT กดได้ในใบ IT — ตรงกับ IT_LEAD_ADMIN_STAGES ฝั่งเซิร์ฟเวอร์ (utils/itLead.ts)
 * ตรวจเคลมไม่อยู่ในรายการ (เป็นของ Admin Spare Part)
 */
export const IT_LEAD_ADMIN_STAGES = ["INSPECT_CONFIRM", "PARTS_SOURCING", "AWAITING_QUOTE", "AWAITING_PAYMENT", "PARTS_REQUESTED", "AWAITING_CONFIRM"];
export function itLeadActs(u: Parameters<typeof itLeadOf>[0], o: { jobType?: string | null; status: string }) {
  return itLeadOf(u) && o.jobType === "IT" && IT_LEAD_ADMIN_STAGES.includes(o.status);
}
