import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { RequestStatus } from "../types";

const LABELS: Record<RequestStatus, string> = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
};

const STYLES: Record<RequestStatus, { bg: string; fg: string }> = {
  PENDING: { bg: "#fef3c7", fg: "#92400e" },
  APPROVED: { bg: "#dcfce7", fg: "#166534" },
  REJECTED: { bg: "#fee2e2", fg: "#991b1b" },
};

export default function StatusBadge({ status }: { status: RequestStatus }) {
  const tone = STYLES[status] ?? { bg: colors.background, fg: colors.textMuted };
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{LABELS[status] ?? status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: "flex-start" },
  text: { fontSize: 12, fontWeight: "700" },
});
