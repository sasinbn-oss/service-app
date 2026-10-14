import { useSyncExternalStore } from "react";
import { Animated, Platform } from "react-native";
import { colors } from "../theme";

/**
 * แถบบน (โลโก้ + "☰ ชื่อหน้า") และแท็บล่าง หลบตอนเลื่อนลง กลับมาตอนเลื่อนขึ้น — แบบ B ที่เจ้าของงานเลือก ต.ค. 69
 * ใช้เฉพาะหน้ารายการใบงานบนจอแคบ
 *
 * แถบพวกนี้อยู่นอกหน้ารายการ (MainNavigator · หัวของ stack · แท็บของ tab navigator)
 * หน้ารายการจึงสั่งผ่านที่กลางตรงนี้: ค่า chromeHide (0 = เห็นเต็ม · 1 = หลบหมด) ที่หน้ารายการเขียนตามการเลื่อน
 * และธง overlay ที่บอก MainNavigator ให้แถบบนลอยทับแทนที่จะดันเนื้อหาลง
 *
 * ต้องลอยทับ ไม่ใช่ยุบความสูง — ถ้ายุบ ขอบบนของรายการจะเลื่อนขึ้นพร้อมกับที่นิ้วเลื่อนรายการ
 * ใบงานจึงวิ่งเร็วกว่านิ้วเท่าตัวระหว่างแถบกำลังหาย (ปัญหาเดียวกับที่ทำให้ตัวกรองหุบแล้วกระตุก)
 */
export const chromeHide = new Animated.Value(0);

type State = { overlay: boolean; title: string; barsH: number };
let state: State = { overlay: false, title: "", barsH: 0 };
const subs = new Set<() => void>();
function emit(patch: Partial<State>) {
  const next = { ...state, ...patch };
  if (next.overlay === state.overlay && next.title === state.title && next.barsH === state.barsH) return;
  state = next;
  subs.forEach((f) => f());
}

/** หน้ารายการเรียกตอนได้/เสียโฟกัส — ปิดแล้วแถบกลับมาเห็นเต็มเสมอ ไม่ค้างครึ่งทางไปหน้าอื่น */
export function setChromeOverlay(on: boolean, title = "") {
  if (!on) chromeHide.setValue(0);
  emit({ overlay: on, title: on ? title : "" });
}

/** MainNavigator วัดความสูงแถบบนรวม (รวมขอบจอบน) แล้วบอกหน้ารายการให้เว้นที่เท่านั้น */
export function setChromeBarsHeight(h: number) {
  emit({ barsH: h });
}

export function useChrome(): State {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state
  );
}

/**
 * หน้าตาแท็บล่างปกติ — อยู่ที่นี่เพราะหน้ารายการต้องคืนค่านี้ตอนเลิกลอย
 * (ตั้ง tabBarStyle เป็น undefined ไม่ได้ ค่านั้นจะทับค่าตั้งต้นของ navigator จนแท็บสูงผิดบนเว็บ)
 */
export const TAB_BAR_STYLE = {
  backgroundColor: colors.card,
  borderTopColor: colors.border,
  paddingTop: 8,
  // Web gets no safe-area inset, so the bar needs an explicit height to leave
  // room for the label. These keys must be absent on native rather than set
  // to undefined: this style is merged over the bar's own computed style, so
  // an explicit `height: undefined` erases the height React Navigation
  // derives from the safe-area inset and collapses the bar out of sight.
  ...(Platform.OS === "web" ? { height: 76, paddingBottom: 12 } : null),
};
