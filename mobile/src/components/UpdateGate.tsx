/**
 * มีรุ่นใหม่แล้วอัปเดตให้เอง (เว็บ — เจ้าของงานขอ ต.ค. 69)
 *
 * merge รุ่นใหม่แล้ว คนที่เปิดเว็บค้างไว้ยังรันโค้ดชุดเก่า — ไม่เห็นของใหม่ และส่งข้อมูลแบบเก่า
 * ไปให้เซิร์ฟเวอร์ใหม่ที่อาจไม่รับแล้ว · ถาม /version.json (เขียนตอน build — scripts/write-build-info.js)
 * ทุก 5 นาทีและตอนกลับมาที่แท็บ เทียบกับรุ่นที่ฝังในแอป (buildInfo.ts):
 *
 * - รุ่นไม่ตรง ไม่มีฟอร์มเปิด → โหลดหน้าใหม่เลย · มีฟอร์มเปิด → แถบฟ้า แล้วโหลดเองเมื่อปิดฟอร์มหมด
 *   (ไม่โหลดทับระหว่างกรอก — ที่พิมพ์ค้างไว้จะหาย)
 * - build ก่อน minBuiltAt → หน้า "ต้องอัปเดตก่อนใช้งานต่อ" (รอบที่หน้าจอเก่าใช้กับเซิร์ฟเวอร์ใหม่ไม่ได้)
 *
 * โหลดใหม่แล้วยังได้รุ่นเดิม (เบราว์เซอร์/โฮสต์แคชหน้าเก่า) → ไม่โหลดวนซ้ำ เหลือแค่แถบให้กดเอง
 * ตอนพัฒนา (expo start) ไม่มีไฟล์นี้ — ไม่ทำอะไร
 */
import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { BUILD_AT, BUILD_COMMIT } from "../buildInfo";
import { anyModalOpen, onPageShown, pageVisible, subscribeModals } from "../utils/liveSync";
import { colors, radius, spacing } from "../theme";

const POLL_MS = 5 * 60_000;
const TRIED_KEY = "update-reloaded-for";

type State = { kind: "none" } | { kind: "soft"; commit: string } | { kind: "must" };

function reloadFor(commit: string) {
  try {
    // จำว่าโหลดใหม่เพื่อรุ่นนี้ไปแล้ว — ถ้าโหลดแล้วยังเป็นรุ่นเก่าอยู่ จะไม่โหลดวน
    window.sessionStorage.setItem(TRIED_KEY, commit);
  } catch {
    // โหมดไม่บันทึกประวัติ — โหลดได้ตามปกติ แค่กันวนไม่ได้
  }
  window.location.reload();
}

function triedAlready(commit: string) {
  try {
    return window.sessionStorage.getItem(TRIED_KEY) === commit;
  } catch {
    return false;
  }
}

export default function UpdateGate() {
  const [state, setState] = useState<State>({ kind: "none" });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    let stopped = false;
    const check = async () => {
      if (stopped || !pageVisible()) return;
      let info: { commit?: string; minBuiltAt?: string | null };
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        info = await res.json();
      } catch {
        return; // เน็ตหลุด — รอบหน้าค่อยถาม
      }
      if (stopped || !info.commit || info.commit === BUILD_COMMIT) return;
      if (info.minBuiltAt && BUILD_AT && BUILD_AT < info.minBuiltAt) {
        setState({ kind: "must" });
        return;
      }
      if (!anyModalOpen() && !triedAlready(info.commit)) reloadFor(info.commit);
      else setState({ kind: "soft", commit: info.commit });
    };
    void check();
    const timer = setInterval(check, POLL_MS);
    const offShown = onPageShown(check);
    // ปิดฟอร์มหมดแล้ว — ถ้ามีรุ่นใหม่รออยู่ โหลดตอนนี้
    const offModals = subscribeModals((n) => {
      const s = stateRef.current;
      if (n === 0 && s.kind === "soft" && !triedAlready(s.commit)) reloadFor(s.commit);
    });
    return () => {
      stopped = true;
      clearInterval(timer);
      offShown();
      offModals();
    };
  }, []);

  if (state.kind === "none") return null;
  if (state.kind === "must") {
    return (
      <View style={styles.over} accessibilityLabel="ต้องอัปเดตก่อนใช้งานต่อ">
        <View style={styles.box}>
          <Ionicons name="arrow-up-circle" size={44} color={colors.primary} />
          <Text style={styles.boxTitle}>ต้องอัปเดตก่อนใช้งานต่อ</Text>
          <Text style={styles.boxText}>ระบบเปลี่ยนแบบที่หน้าจอรุ่นเดิมใช้ต่อไม่ได้ — ข้อมูลของคุณไม่หาย</Text>
          <TouchableOpacity style={styles.btn} onPress={() => window.location.reload()} accessibilityLabel="อัปเดตตอนนี้">
            <Text style={styles.btnText}>อัปเดตตอนนี้</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.bar} accessibilityLabel="มีระบบรุ่นใหม่">
      <Ionicons name="sparkles-outline" size={16} color={colors.primaryInk} />
      <Text style={styles.barText}>มีระบบรุ่นใหม่ — อัปเดตให้เองเมื่อปิดฟอร์มที่เปิดอยู่</Text>
      <TouchableOpacity style={styles.barBtn} onPress={() => window.location.reload()} accessibilityLabel="อัปเดตเลย">
        <Text style={styles.btnText}>อัปเดตเลย</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    top: 8,
    left: 0,
    right: 0,
    marginHorizontal: "auto",
    maxWidth: 560,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    zIndex: 9000,
  },
  barText: { flex: 1, minWidth: 180, fontSize: 13, fontWeight: "700", color: colors.primaryInk },
  barBtn: { backgroundColor: colors.navyFill, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6 },
  over: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    zIndex: 9500,
  },
  box: {
    maxWidth: 340,
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  boxTitle: { fontSize: 17, fontWeight: "800", color: colors.text, textAlign: "center" },
  boxText: { fontSize: 13.5, lineHeight: 21, color: colors.textMuted, textAlign: "center" },
  btn: { marginTop: spacing.xs, backgroundColor: colors.navyFill, borderRadius: radius.sm, paddingHorizontal: 18, paddingVertical: 10 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 13.5 },
});
