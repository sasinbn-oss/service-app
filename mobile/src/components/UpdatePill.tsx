/**
 * ปุ่ม "↑ มีอัปเดต n รายการ" แบบ Facebook (เจ้าของงานขอ ต.ค. 69)
 *
 * เช็คข้อมูลใหม่เองเบื้องหลัง แต่ไม่สลับรายการให้ทันที — แถวที่กระโดดใต้นิ้วตอนกำลังจะกด
 * คือกดผิดใบ ปุ่มนี้เด้งลงมาให้คนเลือกเองว่าจะดูของใหม่เมื่อไร (ลากรีเฟรช/ปุ่มรีเฟรชก็ใช้ได้)
 */
import React, { useCallback, useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, Text } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { anyModalOpen, onPageShown, pageVisible } from "../utils/liveSync";
import { colors } from "../theme";
import { quietly } from "../api/client";

/**
 * เรียก check ทุก ms ระหว่างที่หน้านี้เปิดอยู่ และทุกครั้งที่กลับมาเปิดแท็บ
 * ข้ามรอบที่แท็บซ่อนอยู่หรือมีฟอร์มเปิด (ประหยัดเน็ต · ไม่กวนคนที่กำลังกรอก)
 */
export function useBackgroundCheck(check: () => Promise<unknown>, ms = 60_000) {
  const ref = useRef(check);
  ref.current = check;
  useFocusEffect(
    useCallback(() => {
      const tick = () => {
        if (pageVisible() && !anyModalOpen()) void quietly(() => ref.current()).catch(() => undefined);
      };
      const timer = setInterval(tick, ms);
      const off = onPageShown(tick);
      return () => {
        clearInterval(timer);
        off();
      };
    }, [ms])
  );
}

export default function UpdatePill({
  count,
  unit,
  onPress,
  top = 10,
}: {
  count: number;
  unit: string;
  onPress: () => void;
  /** ระยะจากขอบบนของกล่องรายการ — หน้าที่มีแถบลอยทับด้านบนส่งความสูงแถบมา */
  top?: number;
}) {
  // ซ่อน = เลื่อนพ้นขอบบนของกล่องจริง ๆ ไม่ใช่แค่ขึ้นไปหลบใต้แถบบน (มือถือมีแถบลอยสูงกว่า 70)
  const hidden = -(top + 70);
  const y = useRef(new Animated.Value(hidden)).current;
  /**
   * ซ่อนแล้วต้องโปร่งใสด้วย ไม่ใช่แค่เลื่อนขึ้น — iPhone/จอมือถือไม่มีอะไรตัดขอบเหนือกล่องรายการ
   * ปุ่มที่เลื่อนขึ้นไปเลยโผล่ทับแถบชื่อหน้าเป็น "มีอัปเดต 0 รายการ" (เจ้าของงานเจอบน iOS ต.ค. 69)
   * จำตัวเลขล่าสุดที่มากกว่า 0 ไว้ ระหว่างปุ่มเลื่อนหายจะได้ไม่เห็นเลขเปลี่ยนเป็น 0
   */
  const opacity = y.interpolate({ inputRange: [hidden, hidden / 2, 0], outputRange: [0, 0, 1], extrapolate: "clamp" });
  const shown = useRef(count);
  if (count > 0) shown.current = count;
  useEffect(() => {
    Animated.spring(y, {
      toValue: count > 0 ? 0 : hidden,
      useNativeDriver: Platform.OS !== "web",
      friction: 7,
      tension: 80,
    }).start();
  }, [count, y, hidden]);
  return (
    <Animated.View pointerEvents={count > 0 ? "box-none" : "none"} style={[styles.wrap, { top, opacity, transform: [{ translateY: y }] }]}>
      <TouchableOpacity style={styles.pill} onPress={onPress} accessibilityLabel="ดูข้อมูลที่อัปเดต">
        <Ionicons name="arrow-up" size={15} color="#fff" />
        <Text style={styles.text}>
          มีอัปเดต {shown.current} {unit}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 50 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    shadowColor: "#006491",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  text: { color: "#fff", fontWeight: "700", fontSize: 13.5 },
});
