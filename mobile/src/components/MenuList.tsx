import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
}

/** The shared card list every tab's landing screen is built from. */
export default function MenuList({ title, subtitle, note, entries }: Props) {
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
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  noteText: { flex: 1, fontSize: 12, color: colors.textMuted },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
    ...shadow.card,
  },
  iconChip: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cardLabel: { fontSize: 16, fontWeight: "700", color: colors.text },
  cardDescription: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
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
