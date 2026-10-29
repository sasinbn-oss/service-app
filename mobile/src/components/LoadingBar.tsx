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
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { subscribeBackgroundReads } from "../api/client";
import { colors } from "../theme";

const SHOW_AFTER_MS = 300;
/** เริ่มที่เท่านี้ทันทีที่แถบขึ้น — เห็นว่ามีอะไรเกิดขึ้นตั้งแต่จังหวะแรก */
const START = 15;
/** ระหว่างรอเข้าใกล้เท่านี้เรื่อย ๆ แต่ไม่ถึง — ถึงสุดเมื่อโหลดเสร็จจริงเท่านั้น */
const CEIL = 90;
const TICK_MS = 300;
/** เติมจนสุดแล้วค้างให้เห็นแป๊บหนึ่งก่อนจาง · จางหาย */
const FULL_MS = 350;
const FADE_MS = 350;

/**
 * แถบเติมจากซ้ายไปขวาครั้งเดียว (เจ้าของงานขอ ต.ค. 69 ตามตัวอย่างที่ตกลง — แบบเดิมเป็นขีดวิ่งวนไปมา "ลายตา")
 * ระหว่างรอค่อย ๆ ช้าลงเข้าใกล้ CEIL · เสร็จแล้วเติมเต็มแล้วจางหาย · ไม่วิ่งย้อนกลับ ไม่วนซ้ำ
 *
 * บนเว็บตั้งความกว้างแค่ ~3 ครั้งต่อวินาที แล้วให้ CSS transition ไล่ให้ลื่นเอง — ไม่ใช้ Animated
 * เพราะ Animated บนเว็บขยับทีละเฟรมด้วย JavaScript แย่งเวลากับการวาดรายการใบงานยาว ๆ (เทสต์ list-complete จับได้)
 * มือถือใช้ Animated ตามปกติ (แถบสูง 3 px คำนวณน้อยมาก)
 */
export default function LoadingBar() {
  const web = Platform.OS === "web";
  const [shown, setShown] = useState(false);
  const [p, setP] = useState(0);
  const [fading, setFading] = useState(false);
  /** ตั้งค่ากระโดดโดยไม่ไล่ (ตอนเริ่มใหม่จาก 0) — ไม่งั้นเห็นแถบหดกลับจากขวาไปซ้าย */
  const [instant, setInstant] = useState(true);
  const native = useRef(new Animated.Value(0)).current;
  const t = useRef<{ show?: ReturnType<typeof setTimeout>; tick?: ReturnType<typeof setInterval>; ends: ReturnType<typeof setTimeout>[] }>({ ends: [] });
  const state = useRef({ shown: false, finishing: false });

  useEffect(() => {
    const timers = t.current;
    const clearEnds = () => {
      timers.ends.forEach(clearTimeout);
      timers.ends = [];
    };
    const start = () => {
      timers.show = undefined;
      clearEnds();
      state.current = { shown: true, finishing: false };
      setInstant(true);
      setFading(false);
      setP(0);
      setShown(true);
      // รอให้ 0% วาดก่อนหนึ่งจังหวะ แล้วค่อยเปิดการไล่ — ไม่งั้นเบราว์เซอร์ข้ามไป 15% เลยโดยไม่เห็นว่าเริ่มจากซ้าย
      timers.ends.push(
        setTimeout(() => {
          setInstant(false);
          setP(START);
        }, 30)
      );
      if (timers.tick) clearInterval(timers.tick);
      timers.tick = setInterval(() => setP((v) => (v < START ? v : v + (CEIL - v) * 0.12)), TICK_MS);
    };
    const finish = () => {
      if (timers.tick) clearInterval(timers.tick);
      timers.tick = undefined;
      state.current.finishing = true;
      setInstant(false);
      setP(100);
      timers.ends.push(setTimeout(() => setFading(true), FULL_MS));
      timers.ends.push(
        setTimeout(() => {
          state.current = { shown: false, finishing: false };
          setShown(false);
          setFading(false);
          setInstant(true);
          setP(0);
        }, FULL_MS + FADE_MS)
      );
    };
    const off = subscribeBackgroundReads((busy) => {
      if (busy) {
        // เสร็จไปแล้วกำลังจาง มีคำขอใหม่ต่อ — เริ่มรอบใหม่ทันที (เพิ่งเห็นแถบอยู่ ไม่ต้องรอ 300 ms อีก)
        if (state.current.finishing) start();
        else if (!state.current.shown && !timers.show) timers.show = setTimeout(start, SHOW_AFTER_MS);
      } else {
        if (timers.show) clearTimeout(timers.show);
        timers.show = undefined;
        if (state.current.shown && !state.current.finishing) finish();
      }
    });
    return () => {
      off();
      if (timers.show) clearTimeout(timers.show);
      if (timers.tick) clearInterval(timers.tick);
      clearEnds();
    };
  }, []);

  useEffect(() => {
    if (web) return;
    if (instant) native.setValue(p);
    else Animated.timing(native, { toValue: p, duration: TICK_MS, useNativeDriver: false }).start();
  }, [p, instant, web, native]);

  if (!shown) return null;
  const opacity = fading ? 0 : 1;
  return (
    <>
      {/* ป้ายอยู่ล่างกลางจอ — บนสุดมีปุ่มของแถบหัว (ดูในฐานะ · การใช้งาน) ป้ายจะไปบังปุ่ม · เหนือแถบแท็บล่างของมือถือ
          จุดนิ่ง ไม่กะพริบ (ตามตัวอย่างที่ตกลง) — แถบด้านบนบอกอยู่แล้วว่ายังโหลด · ป้ายหายตอนแถบเติมเต็ม */}
      {p < 100 ? (
        <View style={styles.pillWrap} pointerEvents="none">
          <View style={styles.pill}>
            <View style={styles.dot} />
            <Text style={styles.text}>กำลังโหลดข้อมูล…</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.wrap} pointerEvents="none" accessibilityLabel="กำลังโหลดข้อมูล" accessibilityLiveRegion="polite">
        {web ? (
          <View
            style={[
              styles.bar,
              { width: `${p}%`, opacity },
              instant ? null : ({ transitionProperty: "width, opacity", transitionDuration: `${TICK_MS}ms, ${FADE_MS}ms`, transitionTimingFunction: "ease-out" } as object),
            ]}
          />
        ) : (
          <Animated.View
            style={[styles.bar, { opacity, width: native.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }]}
          />
        )}
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
    height: 3,
    zIndex: 80,
  },
  // ไม่มีรางพื้นหลัง — เห็นแค่ส่วนที่เติมแล้ว อ่านเป็น "ไปได้ถึงไหนแล้ว" ไม่ใช่ขีดลอยในราง
  bar: { height: 3, borderTopRightRadius: 2, borderBottomRightRadius: 2, backgroundColor: colors.primary },
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
