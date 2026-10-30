/**
 * ภาคที่หัวหน้าภาคดูแล — คนเดียวถือได้หลายภาค (เจ้าของงานขอ ต.ค. 69) ทุกภาคได้สิทธิ์เต็มเท่ากัน
 * (เห็น ทำขั้นตอน และเข้ากล่องงาน) ไม่มีภาค "หลัก" กับภาค "รอง" ในสายตาผู้ใช้
 *
 * เซิร์ฟเวอร์ส่ง regions (ทุกภาค) มาคู่กับ region (ภาคแรก) — ตัดสินที่เดียวตรงนี้ว่าอ่านช่องไหน
 * เพราะเซิร์ฟเวอร์รุ่นก่อนส่งแค่ region ถ้าแต่ละหน้าอ่าน regions เองจะมีหน้าที่ลืมถอยกลับไปใช้ region
 * แล้วหัวหน้าภาคที่มีภาคอยู่จริงขึ้นว่า "ยังไม่ได้ตั้งภาค"
 * มี regions = เชื่อ regions อย่างเดียว ไม่เอา region มารวม — รายงานบางตัวส่ง region เป็นข้อความที่ต่อภาคไว้แล้ว
 * รวมกันจะได้ภาคซ้ำสองแบบ
 */
export function regionsOf(u: { region?: string | null; regions?: string[] | null } | null | undefined): string[] {
  if (!u) return [];
  const out: string[] = [];
  for (const r of Array.isArray(u.regions) ? u.regions : [u.region]) if (r && !out.includes(r)) out.push(r);
  return out;
}

/** ข้อความภาคสำหรับแสดง — "ใต้ · กลาง" ตัวคั่นเดียวกับรายงานฝั่งเซิร์ฟเวอร์ คนอ่านจะได้เห็นแบบเดียวกันทุกที่ */
export function regionsText(regions: string[], prefix = "") {
  return regions.map((r) => prefix + r).join(" · ");
}

/**
 * ภาคที่จะส่งไปบันทึก — ส่ง region (ภาคแรก) คู่กับ regions เสมอ
 * เว็บกับ backend deploy คนละ service บน Render ช่วงที่เว็บใหม่ขึ้นก่อน เซิร์ฟเวอร์รุ่นเก่าตัด regions ทิ้งเงียบ ๆ
 * (zod ไม่ strict) — ส่ง regions อย่างเดียวจะได้หัวหน้าภาคที่ไม่มีภาคเลยโดยไม่มีใครรู้ · เซิร์ฟเวอร์ใหม่เห็นทั้งคู่ใช้ regions
 */
export function regionsBody(regions: string[]) {
  return { regions, region: regions[0] ?? null };
}
