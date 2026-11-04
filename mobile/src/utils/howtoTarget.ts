/**
 * ชื่อคงที่ของจุดที่ "สอนการใช้งาน" ชี้ — ใส่ไว้บนปุ่ม/กล่องจริง ({...howtoTarget("myday.tabs")}) แล้วบนเว็บกลายเป็น
 * data-testid="howto-myday.tabs" ให้ตัววาดกล่อง (components/HowToHost.tsx) หาเจอ
 *
 * ชี้ด้วยชื่อ ไม่ใช่ตำแหน่งบนจอหรือข้อความบนปุ่ม — ปุ่มย้ายที่/เปลี่ยนคำแล้ววิธีใช้ยังหาเจอ ปุ่มหายไปขั้นนั้นข้ามเอง
 * แยกไฟล์เล็กไว้ให้เมนูข้างกับหน้าจอ import ได้โดยไม่วนกลับมาหาตัวเครื่อง (utils/howto.ts import เมนูข้างอยู่)
 */
export function howtoTarget(id: string): { testID: string } {
  return { testID: `howto-${id}` };
}
