import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../theme";

/**
 * ปุ่มรีเฟรชบนแถบบน แบบ OTTERI: หมุน "กำลังอัปเดต..." → เขียว "อัปเดตแล้ว" 2 วิ
 *
 * ไม่บังหน้าจอระหว่างโหลด เพราะคนกดรีเฟรชคือคนที่กำลังอ่านหน้านั้นอยู่ —
 * เอาหน้าโหลดมาบังเท่ากับลงโทษคนที่อยากได้ข้อมูลล่าสุด
 *
 * หน้าที่มีข้อมูลให้โหลดใหม่ลงทะเบียนผ่าน useRefreshHandler ปุ่มจะรอจน
 * โหลดเสร็จจริงก่อนขึ้น "อัปเดตแล้ว" ไม่ใช่หมุนตามเวลาที่ตั้งไว้
 */

type Handler = () => Promise<unknown>;
let current: Handler | null = null;

/**
 * ให้หน้าที่กำลังเปิดอยู่บอกปุ่มว่ารีเฟรชแล้วต้องโหลดอะไร
 *
 * ผูกตอนหน้าได้โฟกัส ไม่ใช่ตอน mount เพราะแท็บที่สลับออกไปแล้วยังค้างอยู่ใน
 * หน่วยความจำ — ถ้าผูกตอน mount ปุ่มจะไปโหลดหน้าที่ไม่ได้เปิดอยู่
 */
export function useRefreshHandler(handler: Handler | null) {
  const ref = useRef(handler);
  ref.current = handler;
  useFocusEffect(
    useCallback(() => {
      const wrapped: Handler = () => (ref.current ? ref.current() : Promise.resolve());
      current = wrapped;
      return () => {
        if (current === wrapped) current = null;
      };
    }, [])
  );
}

type Phase = "idle" | "busy" | "done";

export default function RefreshButton() {
  const { width } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>("idle");
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (phase !== "busy") {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      })
    );
    loop.start();
    return () => loop.stop();
  }, [phase, spin]);

  async function onPress() {
    if (phase === "busy") return;
    setPhase("busy");
    try {
      // หมุนอย่างน้อยครู่หนึ่ง ข้อมูลที่โหลดเร็วมากจะได้ไม่ดูเหมือนกดแล้วไม่มีอะไรเกิดขึ้น
      await Promise.all([current ? current() : null, new Promise((r) => setTimeout(r, 500))]);
    } catch {
      // หน้าที่โหลดไม่สำเร็จแจ้งผิดพลาดของตัวเองอยู่แล้ว ปุ่มแค่กลับสู่ปกติ
    }
    setPhase("done");
    setTimeout(() => setPhase("idle"), 2000);
  }

  // จอแคบเหลือแค่ไอคอนกลม ตามต้นแบบ — ข้อความกินที่ของชื่อระบบบนแถบบน
  const wide = width >= 640;
  const tint = phase === "done" ? colors.successInk : colors.primaryInk;
  const label = phase === "busy" ? "กำลังอัปเดต..." : phase === "done" ? "อัปเดตแล้ว" : "รีเฟรช";
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <TouchableOpacity
      accessibilityLabel="รีเฟรชข้อมูล"
      onPress={onPress}
      style={[styles.btn, wide ? styles.btnWide : styles.btnRound, phase === "done" && styles.btnDone]}
    >
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Ionicons name="sync-outline" size={20} color={tint} />
      </Animated.View>
      {wide ? <Text style={[styles.text, { color: tint }]}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.sky50,
  },
  btnRound: { width: 40, borderRadius: 20 },
  btnWide: { paddingHorizontal: 14, borderRadius: 999 },
  btnDone: { backgroundColor: colors.successSoft },
  text: { fontSize: 14, lineHeight: 22, fontWeight: "700" },
});
