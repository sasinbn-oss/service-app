import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { colors } from "../theme";
import { BranchCheckIn } from "../types";

export default function BranchHistoryScreen() {
  const [checkIns, setCheckIns] = useState<BranchCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      api
        .get<BranchCheckIn[]>("/branch-checkins")
        .then((res) => {
          if (!cancelled) setCheckIns(res.data);
        })
        .catch((e) => {
          if (!cancelled) setError(apiErrorMessage(e));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={checkIns}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีประวัติการรายงานตัว</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.branchName}>{item.branch.name}</Text>
            <View style={[styles.badge, item.withinRadius ? styles.badgeOk : styles.badgeWarn]}>
              <Text style={styles.badgeText}>{item.withinRadius ? "ในระยะ" : "นอกระยะ"}</Text>
            </View>
          </View>
          <Text style={styles.line}>ระยะห่าง: {Math.round(item.distanceMeters)} เมตร</Text>
          {item.note ? <Text style={styles.line}>หมายเหตุ: {item.note}</Text> : null}
          <Text style={styles.timestamp}>{new Date(item.checkedInAt).toLocaleString("th-TH")}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  branchName: { fontSize: 16, fontWeight: "700", color: colors.text },
  line: { fontSize: 14, color: colors.text, marginTop: 4 },
  timestamp: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeOk: { backgroundColor: "#dcfce7" },
  badgeWarn: { backgroundColor: "#fef3c7" },
  badgeText: { fontSize: 12, fontWeight: "600", color: colors.text },
  error: { color: colors.danger },
});
