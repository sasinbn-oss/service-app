import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { showAlert } from "../utils/alert";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { colors, shadow } from "../theme";
import { ConsumableRequest, RequestStatus } from "../types";
import StatusBadge from "../components/StatusBadge";

const FILTERS: { label: string; value: RequestStatus | null }[] = [
  { label: "รออนุมัติ", value: "PENDING" },
  { label: "อนุมัติแล้ว", value: "APPROVED" },
  { label: "ไม่อนุมัติ", value: "REJECTED" },
  { label: "ทั้งหมด", value: null },
];

export default function ReviewRequestsScreen() {
  const [requests, setRequests] = useState<ConsumableRequest[]>([]);
  const [filter, setFilter] = useState<RequestStatus | null>("PENDING");
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [actingId, setActingId] = useState<number | null>(null);

  const load = useCallback((status: RequestStatus | null) => {
    setLoading(true);
    const query = status ? `?status=${status}` : "";
    api
      .get<ConsumableRequest[]>(`/consumable-requests${query}`)
      .then((res) => setRequests(res.data))
      .catch((e) => showAlert("ผิดพลาด", apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(filter);
    }, [load, filter])
  );

  async function act(request: ConsumableRequest, action: "approve" | "reject") {
    setActingId(request.id);
    try {
      await api.post(`/consumable-requests/${request.id}/${action}`, {
        reviewNote: reviewNotes[request.id] || undefined,
      });
      setReviewNotes((prev) => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
      load(filter);
      showAlert("สำเร็จ", action === "approve" ? "อนุมัติคำขอแล้ว" : "ปฏิเสธคำขอแล้ว");
    } catch (e) {
      showAlert("ผิดพลาด", apiErrorMessage(e));
    } finally {
      setActingId(null);
    }
  }

  function confirmApprove(request: ConsumableRequest) {
    const summary = request.items
      .map((l) => `${l.item.name} × ${l.quantity} ${l.item.unit}`)
      .join("\n");
    showAlert(
      "ยืนยันการอนุมัติ",
      `อนุมัติคำขอ #${request.id} ของ ${request.user.name}?\n\n${summary}\n\nระบบจะตัดสต็อกทันที`,
      [
        { text: "ยกเลิก", style: "cancel" },
        { text: "อนุมัติ", onPress: () => act(request, "approve") },
      ]
    );
  }

  function confirmReject(request: ConsumableRequest) {
    showAlert("ยืนยันการปฏิเสธ", `ปฏิเสธคำขอ #${request.id} ของ ${request.user.name}?`, [
      { text: "ยกเลิก", style: "cancel" },
      { text: "ปฏิเสธ", style: "destructive", onPress: () => act(request, "reject") },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.label}
            style={[styles.chip, filter === f.value && styles.chipActive]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.chipText, filter === f.value && styles.chipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={requests}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<Text style={styles.empty}>ไม่มีคำขอในหมวดนี้</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.headerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.requester}>{item.user.name}</Text>
                  <Text style={styles.meta}>
                    รหัส {item.user.employeeCode} · คำขอ #{item.id}
                  </Text>
                </View>
                <StatusBadge status={item.status} />
              </View>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleString("th-TH")}</Text>

              <View style={styles.itemList}>
                {item.items.map((line) => (
                  <Text key={line.id} style={styles.line}>
                    • {line.item.name} × {line.quantity} {line.item.unit}
                    <Text style={styles.stockHint}> (คงเหลือ {line.item.stockQty})</Text>
                  </Text>
                ))}
              </View>

              {item.note ? <Text style={styles.note}>หมายเหตุ: {item.note}</Text> : null}

              {item.status === "PENDING" ? (
                <>
                  <TextInput
                    style={styles.reviewInput}
                    placeholder="ความเห็น (ไม่บังคับ)"
                    value={reviewNotes[item.id] ?? ""}
                    onChangeText={(v) => setReviewNotes((prev) => ({ ...prev, [item.id]: v }))}
                  />
                  {actingId === item.id ? (
                    <ActivityIndicator style={styles.acting} color={colors.primary} />
                  ) : (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.approveButton}
                        onPress={() => confirmApprove(item)}
                      >
                        <Text style={styles.approveText}>อนุมัติ</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.rejectButton}
                        onPress={() => confirmReject(item)}
                      >
                        <Text style={styles.rejectText}>ไม่อนุมัติ</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              ) : (
                <>
                  {item.reviewNote ? (
                    <Text style={styles.reviewNote}>ความเห็น: {item.reviewNote}</Text>
                  ) : null}
                  {item.reviewedBy ? (
                    <Text style={styles.meta}>ตรวจสอบโดย: {item.reviewedBy.name}</Text>
                  ) : null}
                </>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 16, paddingBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textMuted },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  loader: { marginTop: 40 },
  listContent: { padding: 16, paddingTop: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    ...shadow.card,
    padding: 16,
    marginBottom: 12,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  requester: { fontSize: 15, fontWeight: "700", color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  date: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  itemList: { marginTop: 10 },
  line: { fontSize: 14, color: colors.text, marginTop: 3 },
  stockHint: { fontSize: 12, color: colors.textMuted },
  note: { fontSize: 13, color: colors.textMuted, marginTop: 8 },
  reviewNote: { fontSize: 13, color: colors.text, marginTop: 8 },
  reviewInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    backgroundColor: "#fff",
    fontSize: 14,
  },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  approveButton: {
    flex: 1,
    backgroundColor: colors.success,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  approveText: { color: "#fff", fontWeight: "700" },
  rejectButton: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.danger,
  },
  rejectText: { color: colors.danger, fontWeight: "700" },
  acting: { marginTop: 14 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
