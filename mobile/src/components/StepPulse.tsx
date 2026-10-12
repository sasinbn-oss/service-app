import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { colors } from "../theme";

/** ระยะหนึ่งรอบของคลื่น — วงที่สองออกตามครึ่งรอบ จึงมีคลื่นใหม่ทุก 1.1 วินาที */
const PERIOD = 2200;

/**
 * คลื่นกระจายรอบวงขั้นปัจจุบันในแถบขั้นตอนงาน (เจ้าของงานเลือกแบบ B "ทุกครั้ง")
 *
 * วงแหวนนิ่ง ๆ เดิมมองผ่าน ๆ ไม่ออกว่าใบงานอยู่ขั้นไหน คลื่นที่ขยายเป็นจังหวะ
 * ดึงสายตาได้จากระยะแขนโดยไม่ต้องอ่านชื่อขั้น ขึ้นทุกใบไม่ว่าเป็นคิวใคร
 *
 * วางเป็นลูกของวงขั้น (absolute ทับขอบวงพอดี) แล้วขยายออกด้วย scale
 * ไม่ใช่ขยายขนาดจริง — ไม่ดันตำแหน่งวงข้าง ๆ และไม่ต้องคำนวณ layout ใหม่ทุกเฟรม
 * คนที่ตั้ง "ลดการเคลื่อนไหว" ไม่เห็นคลื่น เหลือวงแหวนนิ่งของ stepDotNow อย่างเดียว
 */
export default function StepPulse({ size }: { size: number }) {
  const waves = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => setReduced(!!v))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (reduced) return;
    // web ไม่มี native driver — ถ้าส่ง true ไป RN-web จะเตือนทุกครั้งที่เริ่ม
    const useNativeDriver = Platform.OS !== "web";
    const loops = waves.map((v, i) =>
      Animated.sequence([
        Animated.delay((PERIOD / 2) * i),
        Animated.loop(
          Animated.timing(v, {
            toValue: 1,
            duration: PERIOD,
            easing: Easing.bezier(0.2, 0.6, 0.3, 1),
            useNativeDriver,
          })
        ),
      ])
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // waves เป็น ref คงที่
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  if (reduced) return null;
  return (
    <View pointerEvents="none" style={[styles.box, { width: size, height: size, borderRadius: size / 2 }]}>
      {waves.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            StyleSheet.absoluteFill,
            styles.ring,
            {
              borderRadius: size / 2,
              opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
              transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // ทับขอบนอกของวงขั้น (วงมีเส้นขอบ 2 px ลูกที่ absolute เริ่มนับจากด้านในเส้นขอบ)
  box: { position: "absolute", top: -2, left: -2 },
  ring: { borderWidth: 2, borderColor: colors.primary },
});
