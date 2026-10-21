/**
 * แอปมือถือ (ไม่ใช่เว็บ) ยังไม่มีตัวอ่านป้าย — ช่างใช้แอปผ่านเว็บในมือถือ ตัวอ่านจึงทำบนเว็บก่อน (ocr.web.ts)
 * บนแอปให้พิมพ์ข้อมูลป้ายเอง
 */
import type { PlateTemplate, PlateValue } from "./nameplate";

export function readPlatePhoto(
  _uri: string,
  _template: PlateTemplate,
  _registryModel?: string | null,
  _onStage?: (label: string) => void
): Promise<Record<string, PlateValue>> {
  return Promise.reject(new Error("อ่านป้ายจากรูปใช้ได้บนเว็บ — บนแอปให้พิมพ์ข้อมูลจากรูปเอง"));
}
