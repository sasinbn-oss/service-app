/**
 * ปุ่ม "ประวัติการนำเข้า" ข้างปุ่มนำเข้าของแต่ละหน้า (ตัวอย่างที่อนุมัติ 5 พ.ย. 69 — ทางเข้าที่ 2)
 * เปิดหน้าประวัติที่กรองชนิดของหน้านั้นไว้ให้ · สีฟ้าอ่อนแยกจากปุ่มนำเข้า (ขอบเทา) และปุ่มหลัก (กรมท่า)
 * compact = ไอคอนอย่างเดียว (จอแคบที่ปุ่มนำเข้าก็เหลือแค่ไอคอน)
 * ไม่ใช่แอดมินไม่ขึ้นปุ่ม — หน้าประวัติอยู่แท็บหลังบ้านซึ่งคนอื่นไม่มี (เปิดลิงก์ตรงของหน้านำเข้ามาแล้วกดได้ก็ไปไม่ถึง)
 */
import React from "react";
import { StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { ImportGroup, openImportHistory } from "../utils/importHistory";
import { useAuth } from "../context/AuthContext";
import { colors, radius } from "../theme";

/** ชื่อชนิดในชื่อปุ่มสำหรับโปรแกรมอ่านจอ/เทสต์ — ตัวหนังสือบนปุ่มเหมือนเมนูข้าง ("ประวัติการนำเข้า") ชื่อปุ่มจึงบอกชนิดที่กรองไว้ด้วย */
const KIND_LABEL: Record<ImportGroup, string> = {
  repair: "ใบแจ้งซ่อม",
  parts: "อะไหล่",
  machine: "รายงานเครื่อง",
  branch: "สาขา",
  users: "รายชื่อผู้ใช้",
  vehicle: "รถ",
};

export default function ImportHistoryButton({
  kind,
  compact,
  style,
  label = "ประวัติการนำเข้า",
}: {
  kind: ImportGroup;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  label?: string;
}) {
  const { user } = useAuth();
  if (user?.role !== "ADMIN") return null;
  return (
    <TouchableOpacity
      style={[styles.btn, style]}
      onPress={() => openImportHistory(kind)}
      activeOpacity={0.8}
      accessibilityLabel={`ดูประวัติการนำเข้า ${KIND_LABEL[kind]}`}
    >
      <Ionicons name="time-outline" size={17} color={colors.primaryInk} />
      {compact ? null : <Text style={styles.text}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    backgroundColor: colors.primarySoft,
  },
  text: { fontSize: 13.5, fontWeight: "600", color: colors.primaryInk },
});
