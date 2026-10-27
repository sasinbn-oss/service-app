import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import StepPulse from "./StepPulse";

/**
 * ใบงานด่วน — ออร่าแดงกับป้าย "● ด่วน" (เจ้าของงานเลือกจากตัวอย่าง ต.ค. 69)
 *
 * เดิมคำว่า "ด่วน" อยู่ในการ์ดการมอบหมายใต้พับจอ และป้ายเล็กในรายการ ใบด่วนกับใบปกติ
 * กวาดตาแล้วหน้าตาเหมือนกัน — ออร่าทำให้ใบด่วนเด่นจากระยะไกล ใบปกติไม่มีเลยจึงไม่ชินตา
 * คนที่ตั้ง "ลดการเคลื่อนไหว" ได้แค่ขอบแดงนิ่ง ๆ
 */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => setReduced(!!v))
      .catch(() => undefined);
  }, []);
  return reduced;
}

/** หายใจเข้าออกช้า ๆ 0→1→0 — ช้ากว่าคลื่นของขั้นปัจจุบันโดยตั้งใจ จะได้ไม่แย่งกันกระพริบ */
function useBreath(reduced: boolean, period = 2400) {
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      v.setValue(1);
      return;
    }
    // web ไม่มี native driver — ส่ง true ไป RN-web จะเตือนทุกครั้งที่เริ่ม
    const useNativeDriver = Platform.OS !== "web";
    /**
     * isInteraction: false — ภาพเคลื่อนไหวที่ไม่ใช้ native driver (ทุกตัวบนเว็บ) นับเป็น "interaction" โดยปริยาย
     * วนไม่รู้จบ = InteractionManager ไม่เคยว่าง แล้ว FlatList รอ runAfterInteractions ก่อนวาดใบถัดไป
     * เจอจริง (ต.ค. 69): หน้ารายการบนมือถือที่มีใบด่วน การ์ดถูกวาดเฉพาะตอนจอชนขอบส่วนที่วาดไว้ (ล่วงหน้าเหลือ ~300 px)
     * ตัวที่วนตลอดตัวใหม่ต้องใส่ค่านี้ด้วย (ดู StepPulse · Spinner · RefreshButton)
     */
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: period / 2, easing: Easing.inOut(Easing.ease), useNativeDriver, isInteraction: false }),
        Animated.timing(v, { toValue: 0, duration: period / 2, easing: Easing.inOut(Easing.ease), useNativeDriver, isInteraction: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, v, period]);
  return v;
}

/**
 * ออร่ารอบการ์ด — วางเป็นลูกตัวสุดท้ายของการ์ด (absolute ทับขอบพอดี)
 * แสงอยู่นอกขอบการ์ด การ์ดแม่ต้องไม่ตัดขอบ (overflow hidden) ไม่งั้นเหลือแต่เส้นแดง
 */
export function UrgentGlow({ radius }: { radius: number }) {
  const reduced = useReducedMotion();
  const v = useBreath(reduced);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.glow,
        { borderRadius: radius, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) },
      ]}
    />
  );
}

/** ป้าย "● ด่วน" — จุดแดงมีคลื่นกระจายแบบเดียวกับวงขั้นปัจจุบัน ป้ายเรืองแสงเป็นจังหวะ */
export function UrgentBadge({ size = "md" }: { size?: "sm" | "md" }) {
  const reduced = useReducedMotion();
  const v = useBreath(reduced, 2000);
  const sm = size === "sm";
  return (
    <View style={styles.badgeWrap} accessibilityLabel="ใบงานด่วน">
      <Animated.View
        pointerEvents="none"
        style={[styles.badgeGlow, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }]}
      />
      <View style={[styles.badge, sm && styles.badgeSm]}>
        <View style={styles.dot}>{reduced ? null : <StepPulse size={8} color="#fff" />}</View>
        <Text style={[styles.badgeText, sm && styles.badgeTextSm]}>ด่วน</Text>
      </View>
    </View>
  );
}

const RED_GLOW = "rgba(220, 38, 38, 0.38)";

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1.5,
    borderColor: colors.dangerLine,
    shadowColor: "#DC2626",
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    ...(Platform.OS === "web" ? ({ boxShadow: `0 0 24px 4px ${RED_GLOW}` } as object) : null),
  },
  badgeWrap: { position: "relative" },
  badgeGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    shadowColor: "#DC2626",
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    ...(Platform.OS === "web" ? ({ boxShadow: `0 0 12px 3px ${RED_GLOW}` } as object) : null),
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.danger,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  badgeSm: { paddingHorizontal: 7, paddingVertical: 0, gap: 5 },
  // เส้นขอบ 2 px สีเดียวกับพื้น — StepPulse วางทับขอบนอกโดยนับเส้นขอบ 2 px ไว้แล้ว
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff", borderWidth: 2, borderColor: "#fff" },
  badgeText: { color: "#fff", fontSize: 13, lineHeight: 21, fontWeight: "800" },
  badgeTextSm: { fontSize: 11, lineHeight: 18 },
});
