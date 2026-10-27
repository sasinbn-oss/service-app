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
import { colors } from "../theme";

export function canViewUsage(user: ReturnType<typeof useAuth>["user"]) {
  return !!user && user.role === "ADMIN" && !user.partsAdmin && !user.viewAs;
}

export default function UsageButton({ compact }: { compact?: boolean }) {
  const { user } = useAuth();
  const allowed = canViewUsage(user);
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

  if (!allowed) return null;
  const open = () => {
    if (!navigationRef.isReady()) return;
    (navigationRef.navigate as (tab: string, p: object) => void)("AdminTab", { screen: "AppUsage", initial: false });
  };
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
});
