/**
 * การ์ดงานตัวอย่างที่วาดไว้ในกล่องสอนการใช้งาน — ขึ้นตอนช่างยังไม่มีงานจริงให้ชี้ (เจ้าของงานเลือก: ไม่สร้างใบงานฝึกหัด)
 *
 * ชื่อกลาง ๆ "สาขาตัวอย่าง" / "WO-ตัวอย่าง" และป้าย "ตัวอย่าง" — ไม่ใช้ชื่อสาขาจริง (ตัวอย่างเดิมใช้ชื่อร้านจริง
 * ช่างใหม่อาจคิดว่าเป็นงานของตัวเอง) · กล่องฟ้าอะไหล่ใช้ตัวเดียวกับการ์ดจริง (DispatchPartsBox) ให้หน้าตาตรงกันเสมอ
 * วาดด้วย View ล้วน ไม่มีปุ่มที่กดได้ — เป็นภาพประกอบ ไม่ใช่การ์ดจริง
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import DispatchPartsBox from "./DispatchPartsBox";
import type { DispatchPart } from "../utils/dispatchParts";
import { colors, radius, spacing } from "../theme";

/** อะไหล่ตัวอย่าง — ข้อความในกล่องฟ้าออกมาเป็น "SP-ตัวอย่าง บอร์ดควบคุม × 1" / "เบิกแล้ว RQ-ตัวอย่าง · รับที่คลังตัวอย่าง" */
const SAMPLE_PART: DispatchPart = {
  name: "บอร์ดควบคุม",
  code: "SP-ตัวอย่าง",
  quantity: 1,
  inStock: true,
  warehouse: "คลังตัวอย่าง",
  requisitionNo: "RQ-ตัวอย่าง",
};

export default function HowToSample() {
  return (
    <View style={styles.card} accessibilityLabel="การ์ดงานตัวอย่าง">
      <View style={styles.top}>
        <Text style={styles.time}>09:00</Text>
        <View style={{ flex: 1 }} />
        <View style={styles.tag}>
          <Text style={styles.tagText}>ตัวอย่าง</Text>
        </View>
      </View>
      <Text style={styles.branch}>สาขาตัวอย่าง</Text>
      <Text style={styles.meta}>WO-ตัวอย่าง · งานซ่อม · เครื่อง W5 · ประตูล็อกไม่ลง</Text>
      <DispatchPartsBox parts={[SAMPLE_PART]} />
      <View style={styles.big}>
        <Ionicons name="location" size={18} color="#fff" />
        <Text style={styles.bigText}>ถึงหน้างาน</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
  },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  time: { fontSize: 18, lineHeight: 26, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
  tag: { backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: 999, paddingHorizontal: 10 },
  tagText: { fontSize: 12, lineHeight: 20, fontWeight: "800", color: colors.warningInk },
  branch: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.text },
  meta: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  big: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.navyFill,
    borderRadius: radius.md,
    paddingVertical: 10,
    marginTop: 2,
  },
  bigText: { color: "#fff", fontSize: 15, lineHeight: 22, fontWeight: "800" },
});
