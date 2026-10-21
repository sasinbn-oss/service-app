/**
 * "W7 · 25 กก." — รหัสเครื่องพร้อมขนาด (เจ้าของงานขอ ต.ค. 69 ให้รู้ขนาดเครื่องเร็ว)
 * ใช้ทุกที่ที่ขึ้นรหัสเครื่อง ให้หน้าตาเหมือนกันทุกหน้า · เครื่องที่ยังไม่ได้กรอกขนาดขึ้นแค่รหัส (ไม่เดา)
 */
export function sizeLabel(kg: number | null | undefined) {
  return typeof kg === "number" ? `${kg} กก.` : null;
}

export function machineTag(code: string | null | undefined, kg: number | null | undefined) {
  if (!code) return null;
  const size = sizeLabel(kg);
  return size ? `${code} · ${size}` : code;
}
