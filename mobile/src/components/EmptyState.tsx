import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../theme";

/**
 * "ไม่มีข้อมูล" แบบเดียวกันทั้งแอป ตาม .empty ของต้นแบบ OTTERI —
 * ไอคอนในวงกลมฟ้าอ่อน + ข้อความกลางจอ
 *
 * เดิมแต่ละหน้าเป็นข้อความเทาบรรทัดเดียว คนเปิดมาเจอหน้าโล่งแล้วไม่แน่ใจว่า
 * ว่างจริงหรือยังโหลดไม่เสร็จ ไอคอนบอกชัดว่า "โหลดแล้ว แต่ไม่มี"
 * ข้อความควรบอกด้วยว่าของจะมาจากไหน เช่น "ใบงานที่ช่างปิดจะขึ้นที่นี่"
 */
export default function EmptyState({
  text,
  title,
  icon = "document-text-outline",
}: {
  text: string;
  title?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.circle}>
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 36, paddingHorizontal: 16 },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sky50,
    marginBottom: 8,
  },
  title: { fontSize: 15, lineHeight: 24, fontWeight: "700", color: colors.text, textAlign: "center" },
  text: { fontSize: 14, lineHeight: 22, color: colors.textMuted, textAlign: "center", maxWidth: 420 },
});
