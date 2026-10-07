import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radius, shadow, spacing } from "../theme";

export interface MenuEntry {
  key: string;
  label: string;
  /** ชื่ออังกฤษตัวเล็กใต้ชื่อไทย ตามแนวเมนูสองภาษาของ OTTERI */
  labelEn?: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  iconColor: string;
  badge?: number;
  onPress: () => void;
}

interface Props {
  title: string;
  subtitle?: string;
  note?: string;
  entries: MenuEntry[];
  /** วางท้ายรายการ ใช้กับบรรทัดบอกรุ่นของ build ในหน้าแรก */
  footer?: React.ReactNode;
}

/** The shared card list every tab's landing screen is built from. */
export default function MenuList({ title, subtitle, note, entries, footer }: Props) {
  const { width } = useWindowDimensions();
  const twoCol = width >= 640;
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {note ? (
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primaryInk} />
          <Text style={styles.noteText}>{note}</Text>
        </View>
      ) : null}

      {/*
        กระเบื้องแบบหน้าแรก: สองคอลัมน์บนจอกว้าง คอลัมน์เดียวบนมือถือ ไม่มีลูกศรท้ายแถว
        หน้าเมนูทุกหน้า (หน้าแรก หลังบ้าน ประวัติ) จะได้หน้าตาเดียวกันตามต้นแบบ
      */}
      <View style={styles.grid}>
        {entries.map((entry) => (
          <View key={entry.key} style={twoCol ? styles.cellHalf : styles.cellFull}>
            <TouchableOpacity style={styles.card} activeOpacity={0.75} onPress={entry.onPress}>
              <View style={[styles.iconChip, { backgroundColor: entry.tint }]}>
                <Ionicons name={entry.icon} size={22} color={entry.iconColor} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardLabel}>{entry.label}</Text>
                {entry.labelEn ? <Text style={styles.cardLabelEn}>{entry.labelEn}</Text> : null}
                <Text style={styles.cardDescription}>{entry.description}</Text>
              </View>
              {entry.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{entry.badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 24, lineHeight: 34, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 14, lineHeight: 22, color: colors.textMuted, marginTop: 2 },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  noteText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.primaryInk },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5, marginTop: spacing.sm },
  cellFull: { width: "100%", padding: 5 },
  cellHalf: { width: "50%", padding: 5 },
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    padding: spacing.lg,
    ...shadow.card,
  },
  iconChip: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardLabel: { fontSize: 16, lineHeight: 26, fontWeight: "700", color: colors.text },
  cardLabelEn: { fontSize: 11, lineHeight: 16, color: colors.textFaint, fontWeight: "600" },
  cardDescription: { fontSize: 13, lineHeight: 21, color: colors.textMuted, marginTop: 2 },
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
