import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";
import { MainStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<MainStackParamList, "Home">;

const actions: { key: keyof MainStackParamList; label: string; description: string }[] = [
  { key: "VehicleCheckIn", label: "ลงทะเบียนใช้รถ", description: "เช็คอิน / คืนรถ" },
  { key: "VehicleHistory", label: "ประวัติการใช้รถ", description: "ดูรายการใช้รถย้อนหลัง" },
  { key: "BranchCheckIn", label: "รายงานตัวเข้าสาขา", description: "ยืนยันตำแหน่งด้วย GPS" },
  { key: "BranchHistory", label: "ประวัติการรายงานตัว", description: "ดูรายการรายงานตัวย้อนหลัง" },
  { key: "WorkLogForm", label: "บันทึกข้อมูลการทำงาน", description: "ลงงานที่ทำในแต่ละวัน" },
  { key: "WorkLogHistory", label: "ประวัติการทำงาน", description: "ดูบันทึกงานย้อนหลัง" },
];

const adminActions: { key: keyof MainStackParamList; label: string; description: string }[] = [
  { key: "ManageVehicles", label: "จัดการข้อมูลรถ", description: "เพิ่ม/แก้ไข/ลบรถ" },
  { key: "ManageBranches", label: "จัดการข้อมูลสาขา", description: "เพิ่ม/แก้ไข/ลบสาขา" },
];

export default function HomeScreen({ navigation }: Props) {
  const { user, logout } = useAuth();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>สวัสดี, {user?.name}</Text>
          <Text style={styles.role}>{user?.role === "ADMIN" ? "ผู้ดูแลระบบ" : "พนักงาน"}</Text>
        </View>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logout}>ออกจากระบบ</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.key}
            style={styles.tile}
            onPress={() => navigation.navigate(action.key as any)}
          >
            <Text style={styles.tileLabel}>{action.label}</Text>
            <Text style={styles.tileDescription}>{action.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {user?.role === "ADMIN" && (
        <>
          <Text style={styles.sectionTitle}>สำหรับผู้ดูแลระบบ</Text>
          <View style={styles.grid}>
            {adminActions.map((action) => (
              <TouchableOpacity
                key={action.key}
                style={[styles.tile, styles.adminTile]}
                onPress={() => navigation.navigate(action.key as any)}
              >
                <Text style={styles.tileLabel}>{action.label}</Text>
                <Text style={styles.tileDescription}>{action.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  greeting: { fontSize: 20, fontWeight: "700", color: colors.text },
  role: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  logout: { color: colors.danger, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    width: "47%",
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    minHeight: 96,
    justifyContent: "center",
  },
  adminTile: { borderColor: colors.primary },
  tileLabel: { fontSize: 15, fontWeight: "700", color: colors.text },
  tileDescription: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.textMuted, marginTop: 24, marginBottom: 12 },
});
