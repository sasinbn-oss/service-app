import React from "react";
import { Platform, StyleSheet, Text, View, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../theme";

/**
 * ผลตรวจใต้ช่องกรอก ขึ้นทันทีที่พิมพ์ ตาม .field .ok / .field .err ของต้นแบบ OTTERI
 *
 * บอกทั้งตอนผิด (แดง พร้อมตัวอย่างที่ถูก) และตอนถูก (เขียว) — ถ้าเงียบตอนถูก
 * คนจะไม่แน่ใจว่าระบบตรวจแล้วหรือยัง แล้วไปรู้ว่าผิดตอนกดบันทึกซึ่งเสียเวลากว่า
 * ส่ง err เป็น null/"" เมื่อไม่ผิด และ ok เป็น null เมื่อยังไม่ต้องบอกอะไร (เช่นช่องยังว่าง)
 */
export default function FieldHint({ err, ok, hint }: { err?: string | null; ok?: string | null; hint?: string | null }) {
  if (err) {
    return (
      <View style={styles.row}>
        <Ionicons name="alert-circle" size={14} color={colors.dangerInk} />
        <Text style={[styles.text, { color: colors.dangerInk }]}>{err}</Text>
      </View>
    );
  }
  if (ok) {
    return (
      <View style={styles.row}>
        <Ionicons name="checkmark-circle" size={14} color={colors.successInk} />
        <Text style={[styles.text, { color: colors.successInk }]}>{ok}</Text>
      </View>
    );
  }
  if (hint) return <Text style={[styles.text, styles.hint]}>{hint}</Text>;
  return null;
}

/** กรอบช่องที่กรอกผิด — สีเหลืองพร้อมวงเรืองแบบต้นแบบ (.input.invalid) ไม่ใช่แดงจัดที่ดูเหมือนระบบพัง */
export const invalidInput: ViewStyle = {
  borderColor: colors.warning,
  ...(Platform.OS === "web" ? ({ boxShadow: "0 0 0 3px rgba(245,158,11,.15)" } as object) : null),
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  text: { fontSize: 13, lineHeight: 20, flexShrink: 1 },
  hint: { color: colors.textFaint, marginTop: 4 },
});
