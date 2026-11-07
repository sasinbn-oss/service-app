/**
 * ปุ่ม "การใช้งาน" บนแถบบนข้างชื่อ — Super Admin และแอดมิน (ไม่ใช่ Admin Spare Part) · เจ้าของงานขอ ต.ค. 69
 * จุดเขียว + ตัวเลข = คนที่ใช้แอปอยู่ใน 10 นาทีล่าสุด · กดแล้วไปหน้า "การใช้งานแอป" (AppUsageScreen)
 *
 * ถามตัวเลขทุก 60 วินาที — คำขอเล็ก (นับคนเดียว) และตัวเลขช้าไปนาทีหนึ่งไม่มีผลอะไร
 * หยุดถามตอนแท็บเบราว์เซอร์ถูกซ่อน ไม่ต้องยิงค้างไว้ทั้งคืนบนเครื่องที่เปิดทิ้งไว้
 */
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { navigationRef } from "../navigation/navigationRef";
import { sideMenu } from "./SideMenu";
import { colors } from "../theme";

export function canViewUsage(user: ReturnType<typeof useAuth>["user"]) {
  return !!user && user.role === "ADMIN" && !user.partsAdmin && !user.viewAs;
}

/** จำนวนคนออนไลน์ — ปุ่มบนแถบบน และแถวในเมนูโปรไฟล์ของแถบหัวแบบใหม่ (ตัวอย่าง พ.ย. 69) ใช้ตัวเดียวกัน */
export function useOnlineCount(allowed: boolean) {
  const [online, setOnline] = useState<number | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    const load = () => {
      if (Platform.OS === "web" && typeof document !== "undefined" && document.hidden) return;
      api
        .get<{ online: number }>("/usage/online", { loadingText: false })
        .then((r) => alive && setOnline(r.data.online))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [allowed]);
  return online;
}

export function openUsage() {
  if (!navigationRef.isReady()) return;
  (navigationRef.navigate as (tab: string, p: object) => void)("AdminTab", { screen: "AppUsage", initial: false });
}

/**
 * drawerRow = แถวเต็มความกว้างในเมนูข้าง — จอแคบกว่า 420 แถบหัวของแอดมินไม่มีที่ (ค้นหา · กระดิ่ง · ดูในฐานะ ฯลฯ)
 * ต้องมีทางไปหน้านี้เสมอ: เมนูหลังบ้านไม่มีรายการ "การใช้งานแอป" ซ่อนปุ่มเฉย ๆ = แอดมินบนมือถือเล็กเข้าไม่ได้เลย
 */
export default function UsageButton({ compact, drawerRow }: { compact?: boolean; drawerRow?: boolean }) {
  const { user } = useAuth();
  const allowed = canViewUsage(user);
  const online = useOnlineCount(allowed);
  if (!allowed) return null;
  const open = openUsage;
  if (drawerRow) {
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => {
          sideMenu.close();
          open();
        }}
        activeOpacity={0.75}
        accessibilityLabel={`การใช้งานแอป · ${online ?? 0} คนออนไลน์`}
      >
        <Ionicons name="pulse-outline" size={20} color="#fff" />
        <Text style={styles.rowText}>การใช้งานแอป</Text>
        <View style={{ flex: 1 }} />
        <View style={styles.dot} />
        <Text style={styles.rowText}>{online ?? "–"} คนออนไลน์</Text>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      style={[styles.btn, compact && styles.compact]}
      onPress={open}
      activeOpacity={0.75}
      accessibilityLabel={`การใช้งานแอป · ${online ?? 0} คนออนไลน์`}
    >
      {compact ? (
        <Ionicons name="pulse-outline" size={18} color={colors.primaryInk} />
      ) : null}
      <View style={styles.dot} />
      <Text style={styles.text}>{compact ? online ?? "–" : `การใช้งาน · ${online ?? "–"} คนออนไลน์`}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    height: 36,
    marginRight: 8,
  },
  compact: { paddingHorizontal: 9, gap: 5, marginRight: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  text: { color: colors.primaryInk, fontWeight: "800", fontSize: 13 },
  // หน้าตาเดียวกับแถว "วิธีใช้หน้านี้" ในเมนูข้าง (HowToButton drawerRow)
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.sideLine,
  },
  rowText: { color: "#fff", fontSize: 14, lineHeight: 20, fontWeight: "700" },
});
