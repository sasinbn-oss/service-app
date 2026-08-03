import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { colors, radius, shadow, spacing } from "../theme";
import { MainStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<MainStackParamList, "Home">;

// Every destination reachable from the dashboard takes no route params, so
// narrowing to those keys lets navigate() type-check without a cast.
type ScreenName = {
  [K in keyof MainStackParamList]: MainStackParamList[K] extends undefined ? K : never;
}[keyof MainStackParamList];

type TabKey = "work" | "history" | "admin";

interface Entry {
  screen: ScreenName;
  label: string;
  description: string;
  icon: string;
  tint: string;
  /** Shows the pending-approval count on the review queue. */
  badge?: "pendingRequests";
}

const workEntries: Entry[] = [
  {
    screen: "FlowList",
    label: "วินิจฉัยอาการเสีย",
    description: "ตอบใช่/ไม่ทีละขั้น พร้อมผังวงจร",
    icon: "🔧",
    tint: colors.primarySoft,
  },
  {
    screen: "SparePartList",
    label: "รายการอะไหล่",
    description: "ค้นหารหัส ยี่ห้อ และรูปอะไหล่",
    icon: "⚙️",
    tint: "#f1f5f9",
  },
  {
    screen: "BranchCheckIn",
    label: "รายงานตัวเข้าสาขา",
    description: "ยืนยันตำแหน่งด้วย GPS",
    icon: "📍",
    tint: colors.dangerSoft,
  },
  {
    screen: "WorkLogForm",
    label: "บันทึกการทำงาน",
    description: "ลงงานที่ทำในแต่ละวัน",
    icon: "📝",
    tint: colors.warningSoft,
  },
  {
    screen: "VehicleCheckIn",
    label: "ลงทะเบียนใช้รถ",
    description: "เช็คอิน / คืนรถ พร้อมเลขไมล์",
    icon: "🚗",
    tint: colors.successSoft,
  },
  {
    screen: "ConsumableRequest",
    label: "เบิกของใช้สิ้นเปลือง",
    description: "ขอเบิกของจากออฟฟิศ",
    icon: "📦",
    tint: "#f3e8ff",
  },
];

const historyEntries: Entry[] = [
  {
    screen: "BranchHistory",
    label: "ประวัติการรายงานตัว",
    description: "สาขาที่เข้าไปและเวลาที่บันทึก",
    icon: "📍",
    tint: colors.dangerSoft,
  },
  {
    screen: "WorkLogHistory",
    label: "ประวัติการทำงาน",
    description: "งานที่ลงบันทึกย้อนหลัง",
    icon: "📝",
    tint: colors.warningSoft,
  },
  {
    screen: "VehicleHistory",
    label: "ประวัติการใช้รถ",
    description: "การเบิกใช้และคืนรถ",
    icon: "🚗",
    tint: colors.successSoft,
  },
  {
    screen: "MyConsumableRequests",
    label: "ประวัติการเบิกของ",
    description: "สถานะคำขอเบิกของคุณ",
    icon: "📦",
    tint: "#f3e8ff",
  },
  {
    screen: "GuideList",
    label: "คู่มือแบบข้อความ",
    description: "คู่มือแก้ปัญหาที่เขียนเอง",
    icon: "📖",
    tint: colors.primarySoft,
  },
];

const adminEntries: Entry[] = [
  {
    screen: "ReviewRequests",
    label: "อนุมัติคำขอเบิก",
    description: "ตรวจและอนุมัติคำขอของพนักงาน",
    icon: "✅",
    tint: colors.successSoft,
    badge: "pendingRequests",
  },
  {
    screen: "ManageFlows",
    label: "ตรวจสอบผังวินิจฉัย",
    description: "เติมเส้นทางที่นำเข้าไม่สมบูรณ์",
    icon: "🧭",
    tint: colors.primarySoft,
  },
  {
    screen: "ManageGuides",
    label: "จัดการคู่มือแก้ปัญหา",
    description: "เพิ่ม แก้ไข ลบหัวข้อคู่มือ",
    icon: "📖",
    tint: colors.primarySoft,
  },
  {
    screen: "ManageSpareParts",
    label: "จัดการข้อมูลอะไหล่",
    description: "เพิ่มอะไหล่และอัปโหลดรูป",
    icon: "⚙️",
    tint: "#f1f5f9",
  },
  {
    screen: "ManageConsumables",
    label: "จัดการของใช้สิ้นเปลือง",
    description: "รายการของและจำนวนคงเหลือ",
    icon: "📦",
    tint: "#f3e8ff",
  },
  {
    screen: "ManageVehicles",
    label: "จัดการข้อมูลรถ",
    description: "ทะเบียนและสถานะรถ",
    icon: "🚗",
    tint: colors.successSoft,
  },
  {
    screen: "ManageBranches",
    label: "จัดการข้อมูลสาขา",
    description: "พิกัดและรัศมีของแต่ละสาขา",
    icon: "🏢",
    tint: colors.warningSoft,
  },
];

export default function HomeScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [tab, setTab] = useState<TabKey>("work");
  const [pendingCount, setPendingCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!isAdmin) return;
      api
        .get<{ count: number }>("/consumable-requests/pending-count")
        .then((res) => setPendingCount(res.data.count))
        .catch(() => setPendingCount(0));
    }, [isAdmin])
  );

  const tabs = useMemo(
    () =>
      [
        { key: "work" as const, label: "งานช่าง" },
        { key: "history" as const, label: "ประวัติ" },
        ...(isAdmin ? [{ key: "admin" as const, label: "หลังบ้าน" }] : []),
      ],
    [isAdmin]
  );

  const entries =
    tab === "work" ? workEntries : tab === "history" ? historyEntries : adminEntries;

  const initial = user?.name?.trim().charAt(0).toUpperCase() || "?";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting} numberOfLines={1}>
            {user?.name}
          </Text>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{isAdmin ? "ผู้ดูแลระบบ" : "ช่างเทคนิค"}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>ออกจากระบบ</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              {t.key === "admin" && pendingCount > 0 && (
                <View style={styles.tabDot}>
                  <Text style={styles.tabDotText}>{pendingCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === "admin" && (
          <Text style={styles.sectionNote}>
            เมนูจัดการข้อมูลหลังบ้าน — มีผลกับผู้ใช้ทุกคนในระบบ
          </Text>
        )}

        {entries.map((entry) => (
          <TouchableOpacity
            key={entry.screen}
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate(entry.screen)}
          >
            <View style={[styles.iconChip, { backgroundColor: entry.tint }]}>
              <Text style={styles.icon}>{entry.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>{entry.label}</Text>
              <Text style={styles.cardDescription}>{entry.description}</Text>
            </View>
            {entry.badge === "pendingRequests" && pendingCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingCount}</Text>
              </View>
            )}
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.card,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  greeting: { fontSize: 17, fontWeight: "700", color: colors.text },
  rolePill: {
    alignSelf: "flex-start",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 3,
  },
  roleText: { fontSize: 11, fontWeight: "700", color: colors.primaryDark },
  logoutButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  logoutText: { color: colors.danger, fontWeight: "600", fontSize: 13 },
  tabBar: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
  },
  tabActive: { backgroundColor: colors.text },
  tabText: { fontSize: 14, fontWeight: "600", color: colors.textMuted },
  tabTextActive: { color: "#fff" },
  tabDot: {
    minWidth: 18,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
  },
  tabDotText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  sectionNote: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  iconChip: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 22 },
  cardLabel: { fontSize: 16, fontWeight: "700", color: colors.text },
  cardDescription: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 26, color: colors.textFaint },
  badge: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
