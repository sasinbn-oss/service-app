import { Alert, Platform } from "react-native";
import { feedback, ToastKind } from "../components/Feedback";

export interface AlertButton {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

/**
 * ใช้แทน Alert.alert ทุกที่ในแอป
 *
 * react-native-web ไม่มี Alert — เรียกแล้วเงียบ error หายและการยืนยันไม่เคยทำงาน
 * บนเว็บจึงส่งต่อให้ Feedback ที่วาดในแอปตามแบบ OTTERI แทนกล่องของเบราว์เซอร์
 * บนมือถือยังใช้ Alert ของเครื่องตามเดิม
 *
 * บนเว็บแยกตามชนิดของข้อความ เพื่อไม่ต้องไล่แก้ที่เรียกใช้เกือบร้อยจุด:
 * - มีปุ่มยกเลิกกับปุ่มอื่น = กล่องยืนยัน (ปุ่ม destructive เป็นสีแดง)
 * - หัวข้อลงท้าย "แล้ว" หรือ "สำเร็จ" = แจ้งสำเร็จสีเขียวที่หายเอง
 * - หัวข้อบอกว่าทำไม่ได้/ผิดพลาด = แจ้งสีแดงค้าง 6 วิ ให้อ่านวิธีแก้ทัน
 * - ข้อมูลไม่ครบ/เกิน/ซ้ำ = เตือนสีเหลือง
 * - ที่เหลือเป็นข้อความที่ต้องอ่าน = กล่องที่มีปุ่มตกลง
 * แจ้งแบบหายเองจะเรียก onPress ของปุ่มแรกทันที เหมือนผู้ใช้กดตกลงแล้ว
 */
const SUCCESS = /(แล้ว|^สำเร็จ$)$/;
const ERROR = /(ผิดพลาด|ไม่สำเร็จ|ไม่ได้)/;
const WARN = /(ไม่ครบ|ยังไม่|เกิน|ซ้ำ|ต้องการสิทธิ์)/;

export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }

  const list = buttons ?? [];
  const isConfirm = list.some((b) => b.style === "cancel") && list.some((b) => b.style !== "cancel");
  if (isConfirm) {
    feedback.dialog({ title, message, buttons: list });
    return;
  }

  const kind: ToastKind | null = SUCCESS.test(title)
    ? "success"
    : ERROR.test(title)
      ? "error"
      : WARN.test(title)
        ? "warn"
        : null;
  if (!kind) {
    feedback.dialog({ title, message, buttons: list.length ? list : [{ text: "ตกลง" }] });
    return;
  }
  const text = message ? (kind === "success" && title === "สำเร็จ" ? message : `${title} — ${message}`) : title;
  feedback.toast(kind, text);
  list[0]?.onPress?.();
}
