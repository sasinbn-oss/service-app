import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";
import { MainStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<MainStackParamList, "Home">;

// Every destination reachable from the dashboard takes no route params, so
// narrowing to those keys lets navigate() type-check without a cast.
type ScreenName = {
  [K in keyof MainStackParamList]: MainStackParamList[K] extends undefined ? K : never;
}[keyof MainStackParamList];

interface Feature {
  screen: ScreenName;
  label: string;
  description: string;
  icon: string;
  history?: { screen: ScreenName; label: string };
}

const features: Feature[] = [
  {
    screen: "FlowList",
    label: "วินิจฉัยอาการเสีย",
    description: "ตอบใช่/ไม่ทีละขั้น พร้อมผังวงจร",
    icon: "🔧",
    history: { screen: "GuideList", label: "ดูคู่มือแบบข้อความ" },
  },
  {
    screen: "SparePartList",
    label: "รายการอะไหล่",
    description: "ค้นหารหัส ยี่ห้อ และรูปอะไหล่",
    icon: "⚙️",
  },
  {
    screen: "BranchCheckIn",
    label: "รายงานตัวเข้าสาขา",
    description: "ยืนยันตำแหน่งด้วย GPS",
    icon: "📍",
    history: { screen: "BranchHistory", label: "ดูประวัติการรายงานตัว" },
  },
  {
    screen: "WorkLogForm",
    label: "บันทึกการทำงาน",
    description: "ลงงานที่ทำในแต่ละวัน",
    icon: "📝",
    history: { screen: "WorkLogHistory", label: "ดูประวัติการทำงาน" },
  },
  {
    screen: "VehicleCheckIn",
    label: "ลงทะเบียนใช้รถ",
    description: "เช็คอิน / คืนรถ พร้อมเลขไมล์",
    icon: "🚗",
    history: { screen: "VehicleHistory", label: "ดูประวัติการใช้รถ" },
  },
  {
    screen: "ConsumableRequest",
    label: "เบิกของใช้สิ้นเปลือง",
    description: "ขอเบิกของจากออฟฟิศ",
    icon: "📦",
    history: { screen: "MyConsumableRequests", label: "ดูสถานะการเบิกของ" },
  },
];

const adminActions: { screen: ScreenName; label: string }[] = [
  { screen: "ReviewRequests", label: "อนุมัติคำขอเบิก" },
  { screen: "ManageFlows", label: "ตรวจสอบผังวินิจฉัย" },
  { screen: "ManageGuides", label: "จัดการคู่มือแก้ปัญหา" },
  { screen: "ManageSpareParts", label: "จัดการข้อมูลอะไหล่" },
  { screen: "ManageConsumables", label: "จัดการของใช้สิ้นเปลือง" },
  { screen: "ManageVehicles", label: "จัดการข้อมูลรถ" },
  { screen: "ManageBranches", label: "จัดการข้อมูลสาขา" },
];

export default function HomeScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "ADMIN";
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>สวัสดี, {user?.name}</Text>
          <Text style={styles.role}>{isAdmin ? "ผู้ดูแลระบบ" : "พนักงาน"}</Text>
        </View>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logout}>ออกจากระบบ</Text>
        </TouchableOpacity>
      </View>

      {features.map((feature) => (
        <View key={feature.screen} style={styles.card}>
          <TouchableOpacity
            style={styles.cardMain}
            onPress={() => navigation.navigate(feature.screen)}
          >
            <Text style={styles.icon}>{feature.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>{feature.label}</Text>
              <Text style={styles.cardDescription}>{feature.description}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          {feature.history && (
            <TouchableOpacity
              style={styles.historyLink}
              onPress={() => navigation.navigate(feature.history!.screen)}
            >
              <Text style={styles.historyText}>{feature.history.label}</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {isAdmin && (
        <>
          <Text style={styles.sectionTitle}>สำหรับผู้ดูแลระบบ</Text>
          {adminActions.map((action) => (
            <TouchableOpacity
              key={action.screen}
              style={styles.adminRow}
              onPress={() => navigation.navigate(action.screen)}
            >
              <Text style={styles.adminLabel}>{action.label}</Text>
              {action.screen === "ReviewRequests" && pendingCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingCount}</Text>
                </View>
              )}
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 32 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  greeting: { fontSize: 20, fontWeight: "700", color: colors.text },
  role: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  logout: { color: colors.danger, fontWeight: "600" },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: "hidden",
  },
  cardMain: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  icon: { fontSize: 26 },
  cardLabel: { fontSize: 16, fontWeight: "700", color: colors.text },
  cardDescription: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 24, color: colors.textMuted },
  historyLink: {
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  historyText: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: 20,
    marginBottom: 10,
  },
  adminRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 14,
    marginBottom: 8,
  },
  adminLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.text },
  badge: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: "center",
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
