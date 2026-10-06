import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radius, shadow, spacing } from "../theme";

export interface MenuEntry {
  key: string;
  label: string;
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

      {entries.map((entry) => (
        <TouchableOpacity
          key={entry.key}
          style={styles.card}
          activeOpacity={0.7}
          onPress={entry.onPress}
        >
          <View style={[styles.iconChip, { backgroundColor: entry.tint }]}>
            <Ionicons name={entry.icon} size={22} color={entry.iconColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardLabel}>{entry.label}</Text>
            <Text style={styles.cardDescription}>{entry.description}</Text>
          </View>
          {entry.badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{entry.badge}</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
        </TouchableOpacity>
      ))}

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
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    padding: spacing.lg,
    marginTop: spacing.sm,
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
