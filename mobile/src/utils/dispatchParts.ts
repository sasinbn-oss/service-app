/**
 * อะไหล่ที่ต้องเปลี่ยนของงานที่จ่ายให้ช่าง (เจ้าของงานเลือกตามตัวอย่าง 3 พ.ย. 69)
 *
 * ใช้ที่เดียวกันสามจุด — การ์ด "งานของฉันวันนี้" · กล่องบนหน้าใบงานของช่าง · ข้อความจ่ายงาน LINE (ทีมช่าง + ทีม SUB)
 * ให้คำบอกสถานะตรงกันทุกที่: ช่างอ่านในแอปกับในกลุ่ม LINE แล้วต้องได้เรื่องเดียวกัน
 * ของนอกสโตร์รวมด้วย (หัวหน้าภาคจัดหา — ช่างต้องรู้ว่ามีของชิ้นนั้น) · ค่าบริการไม่รวม (เรื่องเสนอราคาลูกค้า)
 */
export interface DispatchPart {
  name: string;
  /** รหัสสินค้า — ของนอกสโตร์ไม่มี (รหัสภายในไม่ใช่รหัสที่ใช้เบิก) */
  code: string | null;
  quantity: number;
  unit?: string | null;
  offCatalog?: boolean;
  inStock: boolean | null;
  warehouse: string | null;
  requisitionNo: string | null;
}

/** "บอร์ดควบคุม × 1" · หน่วยต่อท้ายถ้ามี */
export const qtyText = (p: DispatchPart) => `${p.quantity}${p.unit ? ` ${p.unit}` : ""}`;

/**
 * ไปรับของที่ไหน — บรรทัดเล็กใต้ชื่อในแอป
 * tone ให้สีตามความหมาย: ok = รับได้แล้ว · wait = ยังไม่พร้อม (ยังไม่เบิก/ยังไม่เช็ค) · off = ของนอกสโตร์ · out = หมด
 */
export function pickupOf(p: DispatchPart): { text: string; tone: "ok" | "wait" | "off" | "out" } {
  if (p.offCatalog) return { text: "ของนอกสโตร์ · หัวหน้าภาคจัดหาให้", tone: "off" };
  if (p.inStock === false) return { text: "ของหมด · รอของเข้า", tone: "out" };
  if (p.requisitionNo) return { text: `เบิกแล้ว ${p.requisitionNo}${p.warehouse ? ` · รับที่${p.warehouse}` : ""}`, tone: "ok" };
  if (p.inStock === true) return { text: `${p.warehouse ? `มีของที่${p.warehouse}` : "มีของ"} · ยังไม่เบิก`, tone: "wait" };
  return { text: "ยังไม่เช็คคลัง", tone: "wait" };
}

/**
 * อะไหล่ที่ช่างยังไปรับไม่ได้ — ป้าย "อะไหล่ยังไม่พร้อม" ที่หัวทีมในหน้าสรุปคอนเฟิร์มลูกค้า (เจ้าของงานเลือก 4 พ.ย. 69)
 * อ่านจาก tone ของ pickupOf ไม่ตั้งกฎเอง — ป้ายนับกับคำใต้ชื่อชิ้นจะได้ไม่ขัดกัน
 * ของนอกสโตร์ไม่นับ: หัวหน้าภาคจัดหาเองอยู่แล้ว ไม่ใช่เรื่องที่แอดมินต้องตามก่อนส่งไลน์
 */
export const partNotReady = (p: DispatchPart) => {
  const tone = pickupOf(p).tone;
  return tone === "out" || tone === "wait";
};

/**
 * ช่วง "อะไหล่ที่ต้องเปลี่ยน:" ของข้อความ LINE — ไม่มีอะไหล่ = ไม่มีช่วงนี้เลย (งานตรวจหน้างาน · งานไม่ใช้อะไหล่)
 * แต่ละตัวสองบรรทัด: "- ชื่อ xจำนวน" แล้ว "(รหัส · ใบเบิก · คลัง)" — ไลน์บนมือถือกว้างไม่ถึง 30 ตัวอักษร
 * ใส่บรรทัดเดียวจะตัดกลางรหัส และห้ามเยื้องด้วยเว้นวรรค (ตัดบรรทัดแล้วเยื้องไม่ตรง — กติกาเดิมของข้อความนี้)
 */
/**
 * ช่วงอะไหล่ของงานซ่อมในข้อความ LINE — ไม่มีอะไหล่ในใบก็บอก "อะไหล่: ไม่ใช้อะไหล่" (เจ้าของงานเลือก 3 พ.ย. 69)
 * เดิมงานซ่อมที่ไม่มีอะไหล่ไม่มีบรรทัดเลย ช่างแยกไม่ออกว่าไม่ต้องใช้ หรือแอดมินลืมใส่ แล้วไปถึงร้านมือเปล่า
 * งานตรวจหน้างานไม่เรียกตัวนี้ (ยังไม่รู้ว่าเสียตรงไหน — ไม่มีช่วงอะไหล่เลย)
 */
export function repairPartLines(parts: DispatchPart[]): string[] {
  return parts.length ? dispatchPartLines(parts) : ["อะไหล่: ไม่ใช้อะไหล่"];
}

export function dispatchPartLines(parts: DispatchPart[]): string[] {
  if (!parts.length) return [];
  const out = ["อะไหล่ที่ต้องเปลี่ยน:"];
  for (const p of parts) {
    out.push(`- ${p.name} x${qtyText(p)}`);
    if (p.offCatalog) {
      out.push("(ของนอกสโตร์ หัวหน้าภาคจัดหา)");
      continue;
    }
    const status = p.inStock === false ? "ของหมด" : p.requisitionNo ?? (p.inStock === true ? "ยังไม่เบิก" : "ยังไม่เช็คคลัง");
    out.push(`(${[p.code, status, p.inStock === false ? null : p.warehouse].filter(Boolean).join(" · ")})`);
  }
  return out;
}
