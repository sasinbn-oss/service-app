import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { showAlert } from "../utils/alert";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { colors, shadow } from "../theme";
import { ConsumableRequest } from "../types";
import StatusBadge from "../components/StatusBadge";

export default function MyConsumableRequestsScreen() {
  const [requests, setRequests] = useState<ConsumableRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<ConsumableRequest[]>("/consumable-requests")
      .then((res) => setRequests(res.data))
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function handleCancel(request: ConsumableRequest) {
    showAlert("ยกเลิกคำขอ", "ต้องการยกเลิกคำขอเบิกนี้หรือไม่?", [
      { text: "ไม่ยกเลิก", style: "cancel" },
      {
        text: "ยกเลิกคำขอ",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/consumable-requests/${request.id}`);
            load();
          } catch (e) {
            showAlert("ผิดพลาด", apiErrorMessage(e));
          }
        },
      },
    ]);
  }

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
      data={requests}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีประวัติการเบิก</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.requestId}>คำขอ #{item.id}</Text>
            <StatusBadge status={item.status} />
          </View>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleString("th-TH")}</Text>

          <View style={styles.itemList}>
            {item.items.map((line) => (
              <Text key={line.id} style={styles.line}>
                • {line.item.name} × {line.quantity} {line.item.unit}
              </Text>
            ))}
          </View>

          {item.note ? <Text style={styles.note}>หมายเหตุ: {item.note}</Text> : null}
          {item.reviewNote ? (
            <Text style={styles.reviewNote}>
              ความเห็นผู้อนุมัติ: {item.reviewNote}
            </Text>
          ) : null}
          {item.reviewedBy ? (
            <Text style={styles.reviewer}>ตรวจสอบโดย: {item.reviewedBy.name}</Text>
          ) : null}

          {item.status === "PENDING" && (
            <TouchableOpacity onPress={() => handleCancel(item)}>
              <Text style={styles.cancel}>ยกเลิกคำขอ</Text>
            </TouchableOpacity>
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
    ...shadow.card,
    padding: 16,
    marginBottom: 12,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  requestId: { fontSize: 15, fontWeight: "700", color: colors.text },
  date: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  itemList: { marginTop: 10 },
  line: { fontSize: 14, color: colors.text, marginTop: 2 },
  note: { fontSize: 13, color: colors.textMuted, marginTop: 8 },
  reviewNote: { fontSize: 13, color: colors.text, marginTop: 6 },
  reviewer: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  cancel: { color: colors.danger, fontWeight: "600", marginTop: 12 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  error: { color: colors.danger },
});
