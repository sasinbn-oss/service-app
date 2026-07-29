import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { colors } from "../theme";
import { VehicleLog } from "../types";

export default function VehicleHistoryScreen() {
  const [logs, setLogs] = useState<VehicleLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      api
        .get<VehicleLog[]>("/vehicle-logs")
        .then((res) => {
          if (!cancelled) setLogs(res.data);
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
      data={logs}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีประวัติการใช้รถ</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.plate}>{item.vehicle.plateNumber}</Text>
            <View style={[styles.badge, item.status === "ONGOING" ? styles.badgeOngoing : styles.badgeDone]}>
              <Text style={styles.badgeText}>{item.status === "ONGOING" ? "กำลังใช้งาน" : "เสร็จสิ้น"}</Text>
            </View>
          </View>
          <Text style={styles.line}>วัตถุประสงค์: {item.purpose}</Text>
          {item.destination ? <Text style={styles.line}>ปลายทาง: {item.destination}</Text> : null}
          <Text style={styles.line}>
            ไมล์: {item.startMileage} {item.endMileage != null ? `→ ${item.endMileage}` : ""}
          </Text>
          <Text style={styles.timestamp}>เริ่ม: {new Date(item.startedAt).toLocaleString("th-TH")}</Text>
          {item.endedAt && (
            <Text style={styles.timestamp}>คืน: {new Date(item.endedAt).toLocaleString("th-TH")}</Text>
          )}
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
  plate: { fontSize: 16, fontWeight: "700", color: colors.text },
  line: { fontSize: 14, color: colors.text, marginTop: 4 },
  timestamp: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeOngoing: { backgroundColor: "#fef3c7" },
  badgeDone: { backgroundColor: "#dcfce7" },
  badgeText: { fontSize: 12, fontWeight: "600", color: colors.text },
  error: { color: colors.danger },
});
