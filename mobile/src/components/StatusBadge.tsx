import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { RequestStatus } from "../types";

const LABELS: Record<RequestStatus, string> = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
};

const STYLES: Record<RequestStatus, { bg: string; fg: string; dot: string }> = {
  PENDING: { bg: colors.warningSoft, fg: colors.warningInk, dot: colors.warning },
  APPROVED: { bg: colors.successSoft, fg: colors.successInk, dot: colors.success },
  REJECTED: { bg: colors.dangerSoft, fg: colors.dangerInk, dot: colors.danger },
};

export default function StatusBadge({ status }: { status: RequestStatus }) {
  const tone = STYLES[status] ?? { bg: colors.background, fg: colors.textMuted, dot: colors.textFaint };
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <View style={[styles.dot, { backgroundColor: tone.dot }]} />
      <Text style={[styles.text, { color: tone.fg }]}>{LABELS[status] ?? status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, lineHeight: 20, fontWeight: "700" },
});
