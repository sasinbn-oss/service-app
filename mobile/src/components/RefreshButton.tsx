import React, { useCallback, useEffect, useRef, useState } from "react";
import { anyModalOpen } from "../utils/liveSync";
import { feedback } from "./Feedback";
import { useFocusEffect } from "@react-navigation/native";
import { Animated, Easing, Platform, StyleSheet, Text, useWindowDimensions } from "react-native";
import TouchableOpacity from "./Tap";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../theme";
import { subscribeBackgroundReads } from "../api/client";

/**
 * ปุ่มรีเฟรชบนแถบบน แบบ OTTERI: หมุน "กำลังอัปเดต..." → เขียว "อัปเดตแล้ว" 2 วิ
 *
 * ไม่บังหน้าจอระหว่างโหลด เพราะคนกดรีเฟรชคือคนที่กำลังอ่านหน้านั้นอยู่ —
 * เอาหน้าโหลดมาบังเท่ากับลงโทษคนที่อยากได้ข้อมูลล่าสุด
 *
 * หน้าที่มีข้อมูลให้โหลดใหม่ลงทะเบียนผ่าน useRefreshHandler ปุ่มจะรอจน
 * โหลดเสร็จจริงก่อนขึ้น "อัปเดตแล้ว" ไม่ใช่หมุนตามเวลาที่ตั้งไว้
 */

/**
 * ผลของการรีเฟรช — หน้าที่รู้ว่ามีอะไรเปลี่ยนส่ง changed มา ปุ่มกับแถบลากจะบอกได้ว่า "ใหม่ n ใบ"
 * หรือ "ข้อมูลล่าสุดแล้ว" (เจ้าของงานขอ ต.ค. 69) · หน้าที่ไม่ส่งอะไรขึ้นแค่ "อัปเดตแล้ว"
 */
export type RefreshResult = { changed: number; unit?: string } | void | undefined;
type Handler = () => Promise<RefreshResult | unknown>;
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

/** หน้านี้มีข้อมูลให้โหลดใหม่ไหม — ไม่มี (หน้าฟอร์ม) แถบลากรีเฟรชไม่ทำงาน */
export function hasRefreshHandler() {
  return current !== null;
}

type Phase = "idle" | "busy" | "done";
type RefreshState = { phase: Phase; text: string };
let state: RefreshState = { phase: "idle", text: "" };
const stateListeners = new Set<(s: RefreshState) => void>();
function setState(next: RefreshState) {
  state = next;
  stateListeners.forEach((l) => l(state));
}
export function subscribeRefresh(listener: (s: RefreshState) => void): () => void {
  stateListeners.add(listener);
  listener(state);
  return () => stateListeners.delete(listener);
}

function outcomeText(r: unknown) {
  if (r && typeof r === "object" && typeof (r as { changed?: unknown }).changed === "number") {
    const { changed, unit } = r as { changed: number; unit?: string };
    return changed > 0 ? `อัปเดตแล้ว · ใหม่ ${changed} ${unit ?? "รายการ"}` : "ข้อมูลล่าสุดแล้ว";
  }
  return "อัปเดตแล้ว";
}

/**
 * รีเฟรชหน้าที่เปิดอยู่ — ปุ่มบนแถบบนกับการลากลง (PullToRefresh) ใช้ตัวเดียวกัน
 * โหลดเฉพาะข้อมูลของหน้านั้น อยู่หน้าเดิม ตัวกรองและตำแหน่งที่เลื่อนไม่หาย
 * คืนข้อความผล หรือ null ถ้าไม่ได้รีเฟรช (กำลังรีเฟรชอยู่ / หน้านี้ไม่มีข้อมูลให้โหลด)
 */
export async function runRefresh(): Promise<string | null> {
  if (state.phase === "busy" || !current) return null;
  setState({ phase: "busy", text: "กำลังอัปเดต..." });
  let text = "อัปเดตแล้ว";
  try {
    // หมุนอย่างน้อยครู่หนึ่ง ข้อมูลที่โหลดเร็วมากจะได้ไม่ดูเหมือนกดแล้วไม่มีอะไรเกิดขึ้น
    const [r] = await Promise.all([current(), new Promise((res) => setTimeout(res, 500))]);
    text = outcomeText(r);
  } catch {
    // หน้าที่โหลดไม่สำเร็จแจ้งผิดพลาดของตัวเองอยู่แล้ว ปุ่มแค่กลับสู่ปกติ
  }
  setState({ phase: "done", text });
  setTimeout(() => {
    if (state.phase === "done") setState({ phase: "idle", text: "" });
  }, 2200);
  return text;
}

export default function RefreshButton() {
  const { width } = useWindowDimensions();
  const [{ phase, text }, setLocal] = useState<RefreshState>(state);
  useEffect(() => subscribeRefresh(setLocal), []);
  // หน้าเปิดใหม่หรือกลับมาที่หน้าเดิมแล้วโหลดข้อมูลเบื้องหลัง — หมุนจาง ๆ ให้รู้ว่ากำลังอัปเดต
  // แต่ไม่ขึ้นข้อความ เพราะคนไม่ได้กดเอง (ต้นแบบเรียกว่า syncing)
  const [syncing, setSyncing] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => subscribeBackgroundReads(setSyncing), []);

  const spinning = phase === "busy" || (phase === "idle" && syncing);

  useEffect(() => {
    if (!spinning) {
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
  }, [spinning, spin]);

  async function onPress() {
    if (phase === "busy") return;
    /**
     * หน้าที่ไม่มีข้อมูลให้โหลดใหม่ (หน้าฟอร์ม) — เดิมบนเว็บโหลดทั้งหน้าใหม่ ซึ่งพาเด้งกลับหน้าแรก
     * และทิ้งที่กรอกไว้ ตอนนี้ทุกหน้าที่มีข้อมูลผูกกับปุ่มแล้ว (ต.ค. 69) ที่เหลือจึงแค่บอก
     */
    if (!current) {
      feedback.toast("info", anyModalOpen() ? "มีฟอร์มเปิดอยู่ — บันทึกหรือปิดก่อน" : "หน้านี้ไม่มีข้อมูลให้โหลดใหม่");
      return;
    }
    const result = await runRefresh();
    // จอแคบปุ่มเป็นไอคอนกลม ไม่มีที่ให้ข้อความผล — บอกผ่านแถบแจ้งแทน
    if (result && width < 640) feedback.toast(result.startsWith("อัปเดตแล้ว · ใหม่") ? "info" : "success", result);
  }

  // จอแคบเหลือแค่ไอคอนกลม ตามต้นแบบ — ข้อความกินที่ของชื่อระบบบนแถบบน
  const wide = width >= 640;
  const tint = phase === "done" ? colors.successInk : colors.primaryInk;
  const label = phase === "idle" ? "รีเฟรช" : text;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <TouchableOpacity
      accessibilityLabel="รีเฟรชข้อมูล"
      onPress={onPress}
      style={[styles.btn, wide ? styles.btnWide : styles.btnRound, phase === "done" && styles.btnDone]}
    >
      <Animated.View style={{ transform: [{ rotate }], opacity: phase === "idle" && syncing ? 0.55 : 1 }}>
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
