/**
 * แอปมือถือ (ไม่ใช่เว็บ) ยังไม่มีตัวสแกนป้าย — ช่างใช้ผ่านเว็บในมือถือ ตัวจริงอยู่ที่ NameplateScanner.web.tsx
 * บนแอปปิดทันทีแล้วบอกให้พิมพ์เอง (ช่องในฟอร์มพิมพ์ได้อยู่แล้ว)
 */
import { useEffect } from "react";
import { showAlert } from "../utils/alert";
import type { PlateTemplate, PlateValue } from "../utils/nameplate";

export default function NameplateScanner({
  onClose,
}: {
  template: PlateTemplate;
  registryModel?: string | null;
  onDone: (values: Record<string, PlateValue>) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    showAlert("สแกนป้ายรุ่น", "สแกนด้วยกล้องใช้ได้บนเว็บ — บนแอปให้พิมพ์ข้อมูลจากป้ายเอง");
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
