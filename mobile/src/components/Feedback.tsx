import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radius, shadow, spacing } from "../theme";
import type { AlertButton } from "../utils/alert";
import Overlay from "./Overlay";

/**
 * แจ้งผล ยืนยัน และหน้าโหลด ที่วาดในแอปเอง แทนกล่อง alert/confirm ของเบราว์เซอร์
 *
 * กล่องของเบราว์เซอร์หน้าตาต่างกันทุกเครื่อง บล็อกทั้งหน้าจนกว่าจะกด และบาง
 * เบราว์เซอร์ในแอปแชท (LINE) ปิดไว้เลย — กดลบแล้วเงียบ ไม่มีอะไรเกิดขึ้น
 *
 * เก็บสถานะไว้นอก React เพราะ showAlert ถูกเรียกจากทุกที่ รวมถึงใน catch ของ
 * async ที่ไม่มี hook ให้ใช้ ตัว host ที่ติดอยู่ท้าย App เป็นคนวาดอย่างเดียว
 */

export type ToastKind = "success" | "error" | "warn" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

interface DialogState {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

interface State {
  toasts: ToastItem[];
  dialog: DialogState | null;
  loading: string | null;
}

let state: State = { toasts: [], dialog: null, loading: null };
let nextId = 1;
const listeners = new Set<(s: State) => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export const feedback = {
  /** สำเร็จหายเองใน 3.5 วิ ผิดพลาดค้าง 6 วิ ให้มีเวลาอ่านวิธีแก้ */
  toast(kind: ToastKind, text: string) {
    const id = nextId++;
    set({ toasts: [...state.toasts, { id, kind, text }].slice(-3) });
    setTimeout(() => feedback.dismissToast(id), kind === "error" ? 6000 : 3500);
  },
  dismissToast(id: number) {
    set({ toasts: state.toasts.filter((t) => t.id !== id) });
  },
  dialog(d: DialogState) {
    set({ dialog: d });
  },
  /** ใช้เฉพาะตอนผู้ใช้กดบันทึกหรือส่งข้อมูล — ส่งข้อความว่ากำลังทำอะไร หรือ null เพื่อปิด */
  loading(text: string | null) {
    set({ loading: text });
  },
};

const TONE: Record<ToastKind, { icon: keyof typeof Ionicons.glyphMap; fg: string; bg: string }> = {
  success: { icon: "checkmark", fg: colors.successInk, bg: colors.successSoft },
  error: { icon: "alert", fg: colors.dangerInk, bg: colors.dangerSoft },
  warn: { icon: "alert", fg: colors.warningInk, bg: colors.warningSoft },
  info: { icon: "information", fg: colors.primaryInk, bg: colors.primarySoft },
};

function ToastView({ item }: { item: ToastItem }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== "web" }).start();
  }, [anim]);
  const tone = TONE[item.kind];
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
      }}
    >
      <Pressable style={styles.toast} pointerEvents="auto" onPress={() => feedback.dismissToast(item.id)}>
        <View style={[styles.toastIcon, { backgroundColor: tone.bg }]}>
          <Ionicons name={tone.icon} size={16} color={tone.fg} />
        </View>
        <Text style={styles.toastText}>{item.text}</Text>
      </Pressable>
    </Animated.View>
  );
}

function Dialog({ d }: { d: DialogState }) {
  const run = (b?: AlertButton) => {
    set({ dialog: null });
    b?.onPress?.();
  };
  const cancel = d.buttons.find((b) => b.style === "cancel");
  return (
    <Pressable style={styles.backdrop} pointerEvents="auto" onPress={() => run(cancel)}>
      {/* กดในกล่องต้องไม่ทะลุไปปิดกล่อง */}
      <Pressable style={styles.dialog} onPress={() => undefined}>
        <View style={styles.dialogHead}>
          <Text style={styles.dialogTitle}>{d.title}</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={() => run(cancel)} accessibilityLabel="ปิด">
            <Ionicons name="close" size={22} color={colors.navy} />
          </TouchableOpacity>
        </View>
        {d.message ? (
          <View style={styles.dialogBody}>
            <Text style={styles.dialogMessage}>{d.message}</Text>
          </View>
        ) : null}
        <View style={styles.dialogFoot}>
          {(d.buttons.length ? d.buttons : [{ text: "ตกลง" }]).map((b, i) => {
            const kind = b.style === "cancel" ? "light" : b.style === "destructive" ? "danger" : "primary";
            return (
              <TouchableOpacity
                key={i}
                style={[styles.btn, styles[`btn_${kind}`]]}
                onPress={() => run(b)}
              >
                <Text style={[styles.btnText, styles[`btnText_${kind}`]]}>{b.text}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Pressable>
    </Pressable>
  );
}

/** เครื่องซักผ้าหมุน — หน้าโหลดของ OTTERI */
export function WasherLoader({ text }: { text: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <View style={styles.loaderBox}>
      <View style={styles.washer}>
        <View style={styles.washerTop}>
          <View style={styles.washerSlot} />
          <View style={styles.washerLed} />
        </View>
        <View style={styles.drum}>
          <Animated.View style={[styles.water, { transform: [{ rotate }] }]} />
        </View>
      </View>
      <Text style={styles.loaderText}>{text}</Text>
    </View>
  );
}

export function FeedbackHost() {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);

  if (!s.loading && !s.dialog && !s.toasts.length) return null;
  return (
    <Overlay>
      {s.loading ? (
        <View style={styles.loader} pointerEvents="auto">
          <WasherLoader text={s.loading} />
        </View>
      ) : null}
      {s.dialog ? <Dialog d={s.dialog} /> : null}
      {s.toasts.length ? (
        <View style={styles.toastWrap} pointerEvents="box-none">
          {s.toasts.map((t) => (
            <ToastView key={t.id} item={t} />
          ))}
        </View>
      ) : null}
    </Overlay>
  );
}

const styles = StyleSheet.create({
  toastWrap: {
    position: "absolute",
    top: 14,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    zIndex: 90,
  },
  toast: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    ...shadow.raised,
  },
  toastIcon: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  toastText: { flex: 1, fontSize: 14, lineHeight: 22, color: colors.text },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.42)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    zIndex: 60,
  },
  dialog: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    overflow: "hidden",
    ...shadow.raised,
  },
  dialogHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dialogTitle: { flex: 1, fontSize: 17, lineHeight: 26, fontWeight: "800", color: colors.text },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sky50,
  },
  dialogBody: { paddingHorizontal: 20, paddingVertical: 18 },
  dialogMessage: { fontSize: 15, lineHeight: 24, color: colors.body },
  dialogFoot: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  btn: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btn_light: { backgroundColor: colors.sky50 },
  btn_primary: { backgroundColor: colors.primary },
  btn_danger: { backgroundColor: colors.dangerSoft },
  btnText: { fontSize: 15, lineHeight: 22, fontWeight: "700" },
  btnText_light: { color: colors.primaryInk },
  btnText_primary: { color: "#fff" },
  btnText_danger: { color: colors.dangerInk },

  loader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(244,249,253,0.86)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 80,
  },
  loaderBox: { alignItems: "center", gap: 14 },
  washer: {
    width: 64,
    height: 74,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.primary,
    backgroundColor: colors.card,
    alignItems: "center",
    paddingTop: 6,
  },
  washerTop: { flexDirection: "row", width: "100%", paddingHorizontal: 8, justifyContent: "space-between", alignItems: "center" },
  washerSlot: { width: 16, height: 3, borderRadius: 2, backgroundColor: colors.primarySoft },
  washerLed: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  drum: {
    marginTop: 7,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.primary,
    overflow: "hidden",
    backgroundColor: colors.card,
  },
  water: {
    position: "absolute",
    width: 60,
    height: 60,
    left: -13,
    top: 14,
    borderRadius: 26,
    backgroundColor: "#7FD0F2",
  },
  loaderText: { fontSize: 15, lineHeight: 24, fontWeight: "700", color: colors.navy },
});
