/**
 * มีระบบรุ่นใหม่ → ขึ้นปุ่ม "อัปเดต" ให้กดเองเมื่อสะดวก (เว็บ — เจ้าของงานขอ ต.ค. 69)
 *
 * merge รุ่นใหม่แล้ว คนที่เปิดเว็บค้างไว้ยังรันโค้ดชุดเก่า · ถาม /version.json (เขียนตอน build — scripts/write-build-info.js)
 * ทุก 5 นาทีและตอนกลับมาที่แท็บ เทียบกับรุ่นที่ฝังในแอป (buildInfo.ts):
 *
 * - รุ่นไม่ตรง → ปุ่ม "อัปเดต" บนแถบบน (UpdateButton) + แจ้งครั้งเดียว · **ไม่โหลดหน้าใหม่เอง** ใช้รุ่นเดิมต่อได้จนกว่าจะกด
 *   เดิมโหลดเองทันทีที่ไม่มีฟอร์มเปิด — คนที่กำลังดู/เลื่อนรายการอยู่ หน้าเด้งกลับไปเริ่มใหม่ต่อหน้า (เจ้าของงานเจอ ต.ค. 69)
 * - build ก่อน minBuiltAt → หน้า "ต้องอัปเดตก่อนใช้งานต่อ" — ใช้เฉพาะรอบที่หน้าจอเก่าใช้กับเซิร์ฟเวอร์ใหม่ไม่ได้จริง ๆ
 *   (ตั้งเองใน write-build-info.js) · ยังไม่โหลดเอง รอให้กดเหมือนกัน
 *
 * ยังไม่ได้เข้าระบบ (หน้าเข้าสู่ระบบไม่มีแถบบน) → แถบลอยบนจอแทนปุ่ม
 * โหลดใหม่ด้วย ?v=รุ่น หลบแคชหน้าเว็บ (ดู freshReload) · ตอนพัฒนา (expo start) ไม่มีไฟล์นี้ — ไม่ทำอะไร
 */
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { BUILD_AT, BUILD_COMMIT } from "../buildInfo";
import { anyModalOpen, onPageShown, pageVisible } from "../utils/liveSync";
import { showAlert } from "../utils/alert";
import { feedback } from "./Feedback";
import { useAuth } from "../context/AuthContext";
import { colors, radius, spacing } from "../theme";

const POLL_MS = 5 * 60_000;

/**
 * โหลดหน้าใหม่ด้วย ?v=รุ่น ไม่ใช่ reload() เฉย ๆ — หน้าเว็บผ่านแคช (Cloudflare หน้า Render) ที่เก็บหน้าแรกไว้ 5 นาที
 * (s-maxage=300) ส่วน version.json ถามตรงเลยรู้ก่อนว่ามีรุ่นใหม่ · reload() เฉย ๆ ได้หน้าเก่าจากแคช
 * แถบอัปเดตเลยเด้งกลับมาทุกครั้งที่กด (เจ้าของงานเจอ ต.ค. 69) · ที่อยู่ใหม่แคชไม่มี จึงไปเอาจากเซิร์ฟเวอร์จริง
 */
function freshReload(commit: string) {
  window.location.replace(`${window.location.pathname}?v=${encodeURIComponent(commit)}`);
}

/** กดอัปเดตตอนมีฟอร์มเปิดค้าง — ถามก่อน ที่กรอกไว้จะหาย */
function updateNow(commit: string) {
  if (!anyModalOpen()) return freshReload(commit);
  showAlert("อัปเดตตอนนี้เลยไหม", "มีฟอร์มที่เปิดค้างอยู่ — อัปเดตตอนนี้ ข้อมูลที่กรอกแต่ยังไม่ได้บันทึกจะหาย", [
    { text: "ไว้ทีหลัง", style: "cancel" },
    { text: "อัปเดตเลย", onPress: () => freshReload(commit) },
  ]);
}

/** รุ่นใหม่ที่เจอ (null = ยังเป็นรุ่นล่าสุด) — ปุ่มบนแถบบนอ่านจากที่นี่ */
let latest: string | null = null;
const listeners = new Set<(c: string | null) => void>();
function setLatest(commit: string) {
  if (latest === commit) return;
  latest = commit;
  listeners.forEach((l) => l(commit));
}
function useNewVersion() {
  const [commit, setCommit] = useState(latest);
  useEffect(() => {
    listeners.add(setCommit);
    setCommit(latest);
    return () => {
      listeners.delete(setCommit);
    };
  }, []);
  return commit;
}

/** ปุ่ม "อัปเดต" บนแถบบน (MainNavigator) — ขึ้นเฉพาะเมื่อมีรุ่นใหม่ · compact = จอแคบ */
export function UpdateButton({ compact }: { compact?: boolean }) {
  const commit = useNewVersion();
  // จอแคบกว่า 420 แถบบนของแอดมินมีปุ่มอีกสามปุ่ม (ดูในฐานะ · การใช้งาน · รีเฟรช) — ใส่คำด้วยแล้วชื่อหน้าหายหมด
  const { width } = useWindowDimensions();
  if (!commit) return null;
  const iconOnly = compact && width < 420;
  return (
    <TouchableOpacity
      style={[styles.topBtn, iconOnly && styles.topBtnIcon]}
      onPress={() => updateNow(commit)}
      activeOpacity={0.8}
      accessibilityLabel="มีระบบรุ่นใหม่ กดเพื่ออัปเดต"
    >
      <Ionicons name="arrow-up-circle" size={iconOnly ? 20 : 17} color="#fff" />
      {iconOnly ? null : <Text style={styles.topBtnText}>{compact ? "อัปเดต" : "มีระบบรุ่นใหม่ · อัปเดต"}</Text>}
    </TouchableOpacity>
  );
}

export default function UpdateGate() {
  const { user } = useAuth();
  const commit = useNewVersion();
  const [must, setMust] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    // ล้าง ?v= ที่ใส่ไว้หลบแคชตอนโหลดรอบก่อน — ที่อยู่ในแถบเบราว์เซอร์กลับเป็นปกติ
    if (/[?&]v=/.test(window.location.search)) window.history.replaceState(null, "", window.location.pathname);
    let stopped = false;
    let told: string | null = null;
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
      if (info.minBuiltAt && BUILD_AT && BUILD_AT < info.minBuiltAt) setMust(true);
      setLatest(info.commit);
      // บอกครั้งเดียวต่อรุ่น — ปุ่มบนแถบบนอยู่ต่อจนกว่าจะกด
      if (told !== info.commit) {
        told = info.commit;
        feedback.toast("info", "มีระบบรุ่นใหม่ — กดปุ่มอัปเดต (ลูกศรสีฟ้า) ด้านบนเมื่อสะดวก ระหว่างนี้ใช้งานต่อได้ตามปกติ");
      }
    };
    void check();
    const timer = setInterval(check, POLL_MS);
    const offShown = onPageShown(check);
    return () => {
      stopped = true;
      clearInterval(timer);
      offShown();
    };
  }, []);

  if (must) {
    return (
      <View style={styles.over} accessibilityLabel="ต้องอัปเดตก่อนใช้งานต่อ">
        <View style={styles.box}>
          <Ionicons name="arrow-up-circle" size={44} color={colors.primary} />
          <Text style={styles.boxTitle}>ต้องอัปเดตก่อนใช้งานต่อ</Text>
          <Text style={styles.boxText}>ระบบเปลี่ยนแบบที่หน้าจอรุ่นเดิมใช้ต่อไม่ได้ — ข้อมูลของคุณไม่หาย</Text>
          <TouchableOpacity style={styles.btn} onPress={() => freshReload(String(Date.now()))} accessibilityLabel="อัปเดตตอนนี้">
            <Text style={styles.btnText}>อัปเดตตอนนี้</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  // เข้าระบบแล้วปุ่มอยู่บนแถบบน — แถบลอยเฉพาะหน้าเข้าสู่ระบบ
  if (!commit || user) return null;
  return (
    <View style={styles.bar} accessibilityLabel="มีระบบรุ่นใหม่">
      <Ionicons name="sparkles-outline" size={16} color={colors.primaryInk} />
      <Text style={styles.barText}>มีระบบรุ่นใหม่</Text>
      <TouchableOpacity style={styles.barBtn} onPress={() => freshReload(commit)} accessibilityLabel="อัปเดตเลย">
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
  topBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  topBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  topBtnIcon: { width: 38, height: 38, paddingHorizontal: 0, paddingVertical: 0, justifyContent: "center" },
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
