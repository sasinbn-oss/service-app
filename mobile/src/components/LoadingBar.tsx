/**
 * แถบ "กำลังโหลดข้อมูล…" บนสุดของจอ — ทุกหน้า (เจ้าของงานขอ ต.ค. 69: "กดปุ่มแล้วไม่รู้ว่าระบบกำลังโหลดไหม")
 *
 * การบันทึกมีหน้าโหลดเต็มจออยู่แล้ว (feedback.loading) แต่การอ่านเดิมแค่ให้ปุ่มรีเฟรชหมุนจาง ๆ
 * หน้าที่มีข้อมูลเก่าค้างอยู่ (กลับมาหน้ารายการหลังอัปสถานะ · สลับแท็บกล่องงาน/ที่ยังค้าง) จึงดูเหมือนนิ่ง
 * ทั้งที่กำลังโหลด แล้วข้อมูลใหม่ค่อยเปลี่ยนเองทีหลัง — คนเข้าใจว่าระบบไม่อัปเดต
 *
 * ขึ้นเมื่ออ่านนานเกิน 300 ms — เน็ตดีโหลดเสร็จก่อนนั้น ไม่ต้องกะพริบให้รำคาญ
 * ไม่บังจอ ไม่กันการกด (ดูของเก่าระหว่างรอได้) · การเช็คเบื้องหลังทุกนาทีไม่ขึ้น (ดู quietly ใน api/client)
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { subscribeBackgroundReads } from "../api/client";
import { colors } from "../theme";

const SHOW_AFTER_MS = 300;

/**
 * บนเว็บใช้ CSS animation (animationKeyframes ของ react-native-web) ไม่ใช่ Animated —
 * Animated บนเว็บขยับทีละเฟรมด้วย JavaScript (useNativeDriver ใช้ไม่ได้) แย่งเวลากับการวาดรายการใบงาน
 * จนเลื่อนรายการยาวแล้ววาดไม่ทัน (เทสต์ list-complete จับได้) · CSS ให้เบราว์เซอร์ขยับเอง ไม่กินเวลา JS เลย
 *
 * ต้องผ่าน StyleSheet.create — react-native-web ทิ้ง animationKeyframes ที่ส่งเป็น style ตรง ๆ เงียบ ๆ
 * (เดิมส่งตรง แถบเลยค้างนิ่งที่มุมซ้าย ดูเหมือนแถบความคืบหน้าที่ค้าง 10% — เจ้าของงานถาม ต.ค. 69)
 */
const webAnim = StyleSheet.create({
  run: {
    // transform เป็นข้อความ CSS — แบบ array ({ translateX }) ในคีย์เฟรมถูกแปลงออกมาว่าง แถบไม่ขยับ
    animationKeyframes: [{ "0%": { transform: "translateX(-30vw)" }, "100%": { transform: "translateX(100vw)" } }],
    animationDuration: "1.1s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  },
  pulse: {
    animationKeyframes: [{ "0%": { opacity: 1 }, "50%": { opacity: 0.25 }, "100%": { opacity: 1 } }],
    animationDuration: "0.9s",
    animationIterationCount: "infinite",
  },
} as Record<string, object>);

export default function LoadingBar() {
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const web = Platform.OS === "web";

  useEffect(
    () =>
      subscribeBackgroundReads((busy) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        if (busy) timer.current = setTimeout(() => setShown(true), SHOW_AFTER_MS);
        else setShown(false);
      }),
    []
  );

  useEffect(() => {
    if (!shown || web) return;
    slide.setValue(0);
    const loop = Animated.loop(Animated.timing(slide, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [shown, slide, web]);

  if (!shown) return null;
  return (
    <>
      {/* ป้ายอยู่ล่างกลางจอ — บนสุดมีปุ่มของแถบหัว (ดูในฐานะ · การใช้งาน) ป้ายจะไปบังปุ่ม · เหนือแถบแท็บล่างของมือถือ */}
      <View style={styles.pillWrap} pointerEvents="none">
        <View style={styles.pill}>
          <View style={[styles.dot, web && webAnim.pulse]} />
          <Text style={styles.text}>กำลังโหลดข้อมูล…</Text>
        </View>
      </View>
      <View style={styles.wrap} pointerEvents="none" accessibilityLabel="กำลังโหลดข้อมูล" accessibilityLiveRegion="polite">
        <View style={styles.track}>
          {web ? (
            <View style={[styles.runner, webAnim.run]} />
          ) : (
            <Animated.View
              style={[styles.runner, { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-160, 1600] }) }] }]}
            />
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // web: fixed ติดจอเสมอแม้หน้าเลื่อนอยู่ · มือถือ: absolute บนสุดของรากแอป
    position: (Platform.OS === "web" ? "fixed" : "absolute") as "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 80,
  },
  track: { alignSelf: "stretch", height: 3, overflow: "hidden", backgroundColor: colors.primarySoft },
  runner: { width: 160, height: 3, borderRadius: 2, backgroundColor: colors.primary },
  pillWrap: {
    position: (Platform.OS === "web" ? "fixed" : "absolute") as "absolute",
    bottom: 84,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 80,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  text: { color: colors.primaryInk, fontWeight: "700", fontSize: 14, flexShrink: 0 },
});
