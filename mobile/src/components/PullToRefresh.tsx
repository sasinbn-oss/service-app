/**
 * ลากลงเพื่อรีเฟรช บนเว็บ (เจ้าของงานขอ ต.ค. 69 — "แบบเฟสบุค")
 *
 * ทำไมไม่ใช้ RefreshControl: บน react-native-web มันไม่ทำอะไรเลย ส่วนท่าลากลงของเบราว์เซอร์มือถือเอง
 * (Chrome/Safari) โหลดทั้งเว็บใหม่ แล้วพาเด้งกลับหน้าแรก — ที่นี่ปิดท่านั้น (overscroll-behavior-y)
 * แล้วทำเอง: ลากจากบนสุดของรายการ → runRefresh() ตัวเดียวกับปุ่มรีเฟรช → โหลดเฉพาะข้อมูลหน้านั้น
 *
 * ฟังที่ document ตัวเดียวทั้งแอป ไม่ต้องไปใส่ทีละหน้า — ทุกหน้าที่ลงทะเบียน useRefreshHandler ลากได้เอง
 * ไม่ทำงานเมื่อ: หน้าไม่มีข้อมูลให้โหลด (ฟอร์ม) · มีหน้าต่างเปิดอยู่ · กล่องที่นิ้วอยู่ยังเลื่อนขึ้นได้อีก · ปัดแนวนอน
 */
import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { hasRefreshHandler, runRefresh } from "./RefreshButton";
import { anyModalOpen } from "../utils/liveSync";
import { rubber } from "../utils/motion";
import { colors } from "../theme";

/** ลากเกินระยะนี้ (หลังหนืดแล้ว) ปล่อยแล้วรีเฟรช */
const THRESHOLD = 70;
const MAX = 120;

/** กล่องเลื่อนแนวตั้งที่ใกล้นิ้วที่สุด — ยังเลื่อนขึ้นได้อีก = ยังไม่ถึงบนสุด ห้ามรีเฟรช */
function scrollerOf(target: EventTarget | null): HTMLElement | null {
  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== document.body) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) return el;
    el = el.parentElement;
  }
  return null;
}

type View_ = { dist: number; mode: "pull" | "busy" | "done"; text: string };

export default function PullToRefresh() {
  const [v, setV] = useState<View_>({ dist: 0, mode: "pull", text: "" });
  const busy = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const root = document.documentElement.style;
    const body = document.body.style;
    root.overscrollBehaviorY = "contain";
    body.overscrollBehaviorY = "contain";

    let start: { x: number; y: number; scroller: HTMLElement | null } | null = null;
    let pulling = false;
    let dist = 0;

    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1 || !hasRefreshHandler() || anyModalOpen()) return;
      const scroller = scrollerOf(e.target);
      if (scroller && scroller.scrollTop > 0) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, scroller };
      pulling = false;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (!pulling) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // ปัดแนวนอน (เลื่อนชิป ปัดฟอร์ม) หรือเลื่อนขึ้น — ไม่ใช่ท่ารีเฟรช ปล่อยให้เลื่อนตามปกติ
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || (start.scroller && start.scroller.scrollTop > 0)) {
          start = null;
          return;
        }
        pulling = true;
      }
      if (e.cancelable) e.preventDefault();
      dist = Math.min(MAX, rubber(Math.max(0, dy), 260));
      setV({ dist, mode: "pull", text: dist >= THRESHOLD ? "ปล่อยเพื่อรีเฟรช" : "ลากลงเพื่อรีเฟรช" });
    };
    const onEnd = () => {
      if (!start) return;
      const go = pulling && dist >= THRESHOLD;
      start = null;
      pulling = false;
      if (!go) {
        setV({ dist: 0, mode: "pull", text: "" });
        return;
      }
      busy.current = true;
      setV({ dist: THRESHOLD, mode: "busy", text: "กำลังอัปเดต..." });
      void runRefresh().then((text) => {
        setV({ dist: THRESHOLD, mode: "done", text: text ?? "อัปเดตแล้ว" });
        setTimeout(() => {
          busy.current = false;
          setV({ dist: 0, mode: "pull", text: "" });
        }, 1200);
      });
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      root.overscrollBehaviorY = "";
      body.overscrollBehaviorY = "";
    };
  }, []);

  if (Platform.OS !== "web" || v.dist === 0) return null;
  const ready = v.mode !== "pull" || v.dist >= THRESHOLD;
  const icon = v.mode === "done" ? "checkmark" : v.mode === "busy" ? "sync-outline" : ready ? "refresh" : "arrow-down";
  return (
    <View
      pointerEvents="none"
      accessibilityLabel="ลากรีเฟรช"
      // fixed — ลอยเหนือทุกอย่าง ไม่ขึ้นกับว่าหน้านั้นเลื่อนอยู่ในกล่องไหน
      style={[styles.wrap, { transform: [{ translateY: v.dist - 44 }] }, { position: "fixed" as "absolute" }]}
    >
      <View style={[styles.ball, v.mode === "done" && styles.ballDone]}>
        <View style={v.mode === "busy" ? (SPIN as object) : undefined}>
          <Ionicons name={icon} size={20} color={v.mode === "done" ? colors.successInk : colors.primary} />
        </View>
      </View>
      <Text style={[styles.text, v.mode === "done" && { color: colors.successInk }]}>{v.text}</Text>
    </View>
  );
}

// หมุนด้วย CSS animation ของ react-native-web — Animated loop ไม่คุ้มสำหรับไอคอนที่โผล่ไม่กี่วินาที
const SPIN = {
  animationKeyframes: [{ "0%": { transform: [{ rotate: "0deg" }] }, "100%": { transform: [{ rotate: "360deg" }] } }],
  animationDuration: "800ms",
  animationIterationCount: "infinite",
  animationTimingFunction: "linear",
};

const styles = StyleSheet.create({
  wrap: { top: 0, left: 0, right: 0, alignItems: "center", gap: 6, zIndex: 9999 },
  ball: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#0B3B60",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  ballDone: { backgroundColor: colors.successSoft, borderColor: colors.successSoft },
  text: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.primaryInk,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: "hidden",
  },
});
