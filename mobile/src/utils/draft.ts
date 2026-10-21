/**
 * จำข้อความที่พิมพ์ค้างในฟอร์มไว้ในเครื่อง — ไม่ต้องกดปุ่มบันทึกร่าง (เจ้าของงานเลือก ต.ค. 69)
 *
 * รูป/วิดีโอขึ้นเซิร์ฟเวอร์ทันทีที่แนบอยู่แล้ว ที่หายตอนปิดฟอร์มหรือสัญญาณหลุดมีแต่ข้อความ
 * ซึ่งช่างพิมพ์ยาวตอนยืนหน้าเครื่อง · เก็บต่อใบงาน ลบเมื่อส่งสำเร็จ
 * อ่าน/เขียนไม่ได้ (โหมดส่วนตัว พื้นที่เต็ม) ก็แค่ไม่จำ ไม่ให้ฟอร์มพัง
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "draft:";

export async function loadDraft(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function saveDraft(key: string, value: string) {
  (value.trim() ? AsyncStorage.setItem(PREFIX + key, value) : AsyncStorage.removeItem(PREFIX + key)).catch(() => {});
}

export function clearDraft(key: string) {
  AsyncStorage.removeItem(PREFIX + key).catch(() => {});
}
