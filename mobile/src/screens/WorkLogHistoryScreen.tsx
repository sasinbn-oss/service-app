import React, { useCallback, useState } from "react";
import { useCachedState } from "../utils/pageCache";
import { FlatList, StyleSheet, Text, View } from "react-native";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { colors } from "../theme";
import { WorkLog } from "../types";

export default function WorkLogHistoryScreen() {
  const [logs, setLogs, cached] = useCachedState<WorkLog[]>("WorkLogHistory:logs", []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // ไม่เปิดตัวโหลดซ้ำตอนกลับมาที่หน้านี้ ข้อมูลเดิมแสดงไว้ระหว่างอัปเดตเบื้องหลัง (ครั้งแรกเริ่มเป็น true อยู่แล้ว)
      api
        .get<WorkLog[]>("/work-logs")
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
        <Spinner color={colors.primary} />
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
      ListEmptyComponent={<EmptyState icon="create-outline" text="ยังไม่มีบันทึกการทำงาน" />}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.date}>{new Date(item.workDate).toLocaleDateString("th-TH")}</Text>
          <Text style={styles.line}>{item.taskDescription}</Text>
          {item.hoursSpent != null && <Text style={styles.line}>ชั่วโมง: {item.hoursSpent}</Text>}
          {item.branch && <Text style={styles.line}>สาขา: {item.branch.name}</Text>}
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
  date: { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  line: { fontSize: 15, color: colors.text, marginTop: 2 },
  error: { color: colors.danger },
});
