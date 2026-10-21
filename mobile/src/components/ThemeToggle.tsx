import { useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { isDark, setDarkMode } from "../theme";
import { spring } from "../utils/motion";
import { useAuth } from "../context/AuthContext";
import { rememberScreenForReload } from "../navigation/navigationRef";

/**
 * สวิตช์โหมดมืด มุมขวาบน — แบบแคปซูลดวงจันทร์ตามตัวอย่างที่เจ้าของงานส่งมา (ต.ค. 69)
 * สว่าง = พื้นฟ้า ปุ่มกลมพระอาทิตย์ทางซ้าย · มืด = พื้นกรมท่ามีดาว ปุ่มดวงจันทร์ทางขวา
 *
 * กดแล้วปุ่มเลื่อนให้เห็นก่อน แล้วค่อยโหลดหน้าใหม่ (ชุดสีเลือกตอนโหลด — ดู theme.ts)
 * มีแค่บนเว็บ แอป native ไม่แสดง
 */
// มือถือแถบบนเต็มแล้ว (โลโก้ ผู้ใช้ รีเฟรช ออกจากระบบ) — ขนาดเต็มล้นขอบจอ 400 px จึงย่อลง
const FULL = { W: 58, H: 30, KNOB: 24 };
const COMPACT = { W: 46, H: 26, KNOB: 20 };

export default function ThemeToggle() {
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const { W, H, KNOB } = width < 480 ? COMPACT : FULL;
  const [on, setOn] = useState(isDark);
  const x = useRef(new Animated.Value(isDark ? W - KNOB - 3 : 3)).current;
  if (Platform.OS !== "web") return null;
  return (
    <Pressable
      accessibilityLabel={on ? "ปิดโหมดมืด" : "เปิดโหมดมืด"}
      accessibilityState={{ checked: on }}
      onPress={() => {
        const next = !on;
        setOn(next);
        spring(x, next ? W - KNOB - 3 : 3, "push").start();
        setTimeout(() => {
          rememberScreenForReload(user?.id);
          setDarkMode(next);
        }, 260);
      }}
      style={[styles.track, { width: W, height: H, borderRadius: H / 2 }, on ? styles.trackDark : styles.trackLight]}
    >
      {on ? (
        <>
          <View style={[styles.star, { left: 9, top: 7 }]} />
          <View style={[styles.star, styles.starSmall, { left: 17, top: 17 }]} />
          <View style={[styles.star, styles.starSmall, { left: 24, top: 8 }]} />
        </>
      ) : (
        <>
          <View style={[styles.cloud, { right: 8, top: 9 }]} />
          <View style={[styles.cloud, styles.cloudSmall, { right: 15, top: 16 }]} />
        </>
      )}
      <Animated.View
        style={[
          styles.knob,
          { top: (H - 2 - KNOB) / 2, width: KNOB, height: KNOB, borderRadius: KNOB / 2 },
          on ? styles.knobDark : styles.knobLight,
          { transform: [{ translateX: x }] },
        ]}
      >
        <Ionicons name={on ? "moon" : "sunny"} size={KNOB - 9} color={on ? "#4B5B8C" : "#F59E0B"} />
      </Animated.View>
    </Pressable>
  );
}

// สีของสวิตช์ไม่อิงชุดสีแอป — ตัวมันเองคือภาพ "กลางวัน/กลางคืน" ต้องหน้าตาเดิมทั้งสองโหมด
const styles = StyleSheet.create({
  track: { justifyContent: "center", overflow: "hidden" },
  trackLight: { backgroundColor: "#8FD3F4", borderWidth: 1, borderColor: "#6CC2EC" },
  trackDark: { backgroundColor: "#1E2A4A", borderWidth: 1, borderColor: "#34416A" },
  knob: {
    position: "absolute",
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  knobLight: { backgroundColor: "#FFF7D6" },
  knobDark: { backgroundColor: "#E6E9F5" },
  star: { position: "absolute", width: 3, height: 3, borderRadius: 2, backgroundColor: "#fff" },
  starSmall: { width: 2, height: 2, opacity: 0.8 },
  cloud: { position: "absolute", width: 12, height: 5, borderRadius: 3, backgroundColor: "#fff", opacity: 0.9 },
  cloudSmall: { width: 8, opacity: 0.7 },
});
