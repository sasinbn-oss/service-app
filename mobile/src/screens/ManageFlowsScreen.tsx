import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { showAlert } from "../utils/alert";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { colors, shadow } from "../theme";
import { TroubleshootFlow, TroubleshootFlowSummary, TroubleshootNode } from "../types";

type Picking = { node: TroubleshootNode; answer: "yesKey" | "noKey" } | null;

export default function ManageFlowsScreen() {
  const [flows, setFlows] = useState<TroubleshootFlowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openFlow, setOpenFlow] = useState<TroubleshootFlow | null>(null);
  const [loadingFlow, setLoadingFlow] = useState(false);
  const [picking, setPicking] = useState<Picking>(null);
  const [saving, setSaving] = useState(false);

  const loadFlows = useCallback(() => {
    setLoading(true);
    api
      .get<TroubleshootFlowSummary[]>("/troubleshoot-flows")
      .then((res) => setFlows(res.data))
      .catch((e) => showAlert("ผิดพลาด", apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFlows();
    }, [loadFlows])
  );

  async function openDetail(id: number) {
    setLoadingFlow(true);
    try {
      const { data } = await api.get<TroubleshootFlow>(`/troubleshoot-flows/${id}`);
      setOpenFlow(data);
    } catch (e) {
      showAlert("ผิดพลาด", apiErrorMessage(e));
    } finally {
      setLoadingFlow(false);
    }
  }

  async function setBranch(target: TroubleshootNode) {
    if (!picking || !openFlow) return;
    setSaving(true);
    try {
      await api.put(`/troubleshoot-flows/${openFlow.id}/nodes/${picking.node.key}`, {
        [picking.answer]: target.key,
      });
      setPicking(null);
      await openDetail(openFlow.id);
      loadFlows();
    } catch (e) {
      showAlert("ผิดพลาด", apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Detail view: list every question and let the admin fill missing branches.
  if (openFlow) {
    const byKey = new Map(openFlow.nodes.map((n) => [n.key, n]));
    const questions = openFlow.nodes.filter((n) => n.kind === "QUESTION");
    const label = (key?: string | null) =>
      key ? byKey.get(key)?.text.slice(0, 46) ?? "(ไม่พบ)" : "— ยังไม่ได้ตั้ง —";

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => setOpenFlow(null)}>
          <Text style={styles.back}>‹ กลับไปรายการผัง</Text>
        </TouchableOpacity>
        <Text style={styles.detailTitle}>{openFlow.title}</Text>
        <Text style={styles.detailMeta}>
          {questions.length} คำถาม · เริ่มที่ {openFlow.rootKey ?? "ยังไม่ได้ตั้ง"}
        </Text>

        {questions.map((node) => {
          const incomplete = !node.yesKey || !node.noKey;
          return (
            <View key={node.key} style={[styles.nodeCard, incomplete && styles.nodeCardWarn]}>
              <Text style={styles.nodeText}>{node.text}</Text>
              <TouchableOpacity
                style={styles.branchRow}
                onPress={() => setPicking({ node, answer: "yesKey" })}
              >
                <Text style={styles.branchLabel}>ใช่ →</Text>
                <Text style={[styles.branchValue, !node.yesKey && styles.branchMissing]}>
                  {label(node.yesKey)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.branchRow}
                onPress={() => setPicking({ node, answer: "noKey" })}
              >
                <Text style={styles.branchLabel}>ไม่ →</Text>
                <Text style={[styles.branchValue, !node.noKey && styles.branchMissing]}>
                  {label(node.noKey)}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <Modal visible={picking !== null} transparent animationType="slide">
          <Pressable style={styles.modalBackdrop} onPress={() => setPicking(null)}>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>
                เลือกกล่องปลายทางเมื่อตอบ "{picking?.answer === "yesKey" ? "ใช่" : "ไม่"}"
              </Text>
              {saving ? (
                <ActivityIndicator style={{ margin: 20 }} color={colors.primary} />
              ) : (
                <ScrollView style={{ maxHeight: 420 }}>
                  {openFlow.nodes
                    .filter((n) => n.key !== picking?.node.key)
                    .map((n) => (
                      <TouchableOpacity
                        key={n.key}
                        style={styles.pickRow}
                        onPress={() => setBranch(n)}
                      >
                        <Text style={styles.pickKind}>{n.kind === "QUESTION" ? "ถาม" : "แก้"}</Text>
                        <Text style={styles.pickText}>{n.text}</Text>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              )}
            </View>
          </Pressable>
        </Modal>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      {loadingFlow && <ActivityIndicator style={styles.loader} color={colors.primary} />}
      <FlatList
        contentContainerStyle={styles.listContent}
        data={flows}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <Text style={styles.hint}>
            แตะหัวข้อเพื่อตรวจสอบและเติมเส้นทางที่ระบบนำเข้าไม่สมบูรณ์
          </Text>
        }
        ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีผังวินิจฉัยในระบบ</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openDetail(item.id)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>
                {item.questionCount} คำถาม · {item.imageCount} รูป
              </Text>
            </View>
            {item.incompleteCount > 0 ? (
              <View style={styles.badgeWarn}>
                <Text style={styles.badgeWarnText}>ขาด {item.incompleteCount}</Text>
              </View>
            ) : (
              <View style={styles.badgeOk}>
                <Text style={styles.badgeOkText}>ครบ</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, paddingBottom: 40 },
  loader: { marginTop: 12 },
  listContent: { padding: 16 },
  hint: { fontSize: 13, color: colors.textMuted, marginBottom: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 10,
    ...shadow.card,
    padding: 14,
    marginBottom: 10,
  },
  title: { fontSize: 15, fontWeight: "600", color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badgeWarn: { backgroundColor: "#fef3c7", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeWarnText: { fontSize: 12, color: "#92400e", fontWeight: "700" },
  badgeOk: { backgroundColor: "#dcfce7", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeOkText: { fontSize: 12, color: "#166534", fontWeight: "700" },
  back: { color: colors.primary, fontWeight: "600", marginBottom: 12 },
  detailTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  detailMeta: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 16 },
  nodeCard: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  nodeCardWarn: { borderColor: "#f59e0b", borderWidth: 2 },
  nodeText: { fontSize: 14, color: colors.text, lineHeight: 20, marginBottom: 10 },
  branchRow: { flexDirection: "row", gap: 8, paddingVertical: 6, alignItems: "center" },
  branchLabel: { fontSize: 13, fontWeight: "700", color: colors.primary, width: 40 },
  branchValue: { flex: 1, fontSize: 13, color: colors.text },
  branchMissing: { color: colors.danger, fontStyle: "italic" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  modalTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 12 },
  pickRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  pickKind: { fontSize: 12, fontWeight: "700", color: colors.primary, width: 30 },
  pickText: { flex: 1, fontSize: 13, color: colors.text },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
