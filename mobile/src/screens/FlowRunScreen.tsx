import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { colors } from "../theme";
import { TroubleshootFlow, TroubleshootNode } from "../types";
import { HomeStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "FlowRun">;

interface HistoryEntry {
  nodeKey: string;
  answer: "ใช่" | "ไม่";
}

export default function FlowRunScreen({ route, navigation }: Props) {
  const { id, title } = route.params;
  const [flow, setFlow] = useState<TroubleshootFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ title });
      let active = true;
      setLoading(true);
      api
        .get<TroubleshootFlow>(`/troubleshoot-flows/${id}`)
        .then((res) => {
          if (!active) return;
          setFlow(res.data);
          setCurrentKey(res.data.rootKey ?? null);
          setHistory([]);
        })
        .catch((e) => active && setError(apiErrorMessage(e)))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [id, title, navigation])
  );

  const nodesByKey = useMemo(() => {
    const map = new Map<string, TroubleshootNode>();
    for (const node of flow?.nodes ?? []) map.set(node.key, node);
    return map;
  }, [flow]);

  const current = currentKey ? nodesByKey.get(currentKey) ?? null : null;

  function answer(choice: "ใช่" | "ไม่") {
    if (!current) return;
    const nextKey = choice === "ใช่" ? current.yesKey : current.noKey;
    if (!nextKey) return;
    setHistory((h) => [...h, { nodeKey: current.key, answer: choice }]);
    setCurrentKey(nextKey);
  }

  function goBack() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    setCurrentKey(previous.nodeKey);
  }

  function restart() {
    setHistory([]);
    setCurrentKey(flow?.rootKey ?? null);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !flow) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "ไม่พบผังวินิจฉัย"}</Text>
      </View>
    );
  }

  if (!current) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>ผังนี้ยังไม่มีจุดเริ่มต้น</Text>
        <Text style={styles.errorHint}>กรุณาแจ้งผู้ดูแลระบบให้ตั้งค่าผังนี้ก่อนใช้งาน</Text>
      </View>
    );
  }

  const isAction = current.kind === "ACTION";
  const deadEnd = !isAction && !current.yesKey && !current.noKey;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {flow.notes ? <Text style={styles.notes}>{flow.notes}</Text> : null}

        <View style={styles.progressRow}>
          <Text style={styles.progress}>ขั้นที่ {history.length + 1}</Text>
          {current.stepNumber ? (
            <Text style={styles.stepNumber}>จุดอ้างอิงในวงจร {current.stepNumber}</Text>
          ) : null}
        </View>

        <View style={[styles.card, isAction && styles.actionCard]}>
          <Text style={styles.kindLabel}>{isAction ? "วิธีแก้ไข" : "ตรวจสอบ"}</Text>
          <Text style={styles.questionText}>{current.text}</Text>
        </View>

        {isAction ? (
          <View style={styles.doneBox}>
            <Text style={styles.doneText}>จบขั้นตอนการวินิจฉัย</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={restart}>
              <Text style={styles.primaryButtonText}>เริ่มวินิจฉัยใหม่</Text>
            </TouchableOpacity>
          </View>
        ) : deadEnd ? (
          <View style={styles.warnBox}>
            <Text style={styles.warnTitle}>ผังขาดตอนตรงนี้</Text>
            <Text style={styles.warnBody}>
              ข้อมูลที่นำเข้ายังไม่มีเส้นทางต่อจากคำถามนี้ กรุณาดูคู่มือฉบับเต็มหรือแจ้งผู้ดูแลระบบให้เติมเส้นทาง
            </Text>
          </View>
        ) : (
          <View style={styles.answerRow}>
            <TouchableOpacity
              style={[styles.answerButton, styles.yesButton, !current.yesKey && styles.disabled]}
              onPress={() => answer("ใช่")}
              disabled={!current.yesKey}
            >
              <Text style={styles.answerText}>ใช่</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.answerButton, styles.noButton, !current.noKey && styles.disabled]}
              onPress={() => answer("ไม่")}
              disabled={!current.noKey}
            >
              <Text style={styles.answerText}>ไม่</Text>
            </TouchableOpacity>
          </View>
        )}

        {flow.images.length > 0 && (
          <View style={styles.diagramSection}>
            <Text style={styles.diagramLabel}>แผนผังวงจรประกอบ (แตะเพื่อขยาย)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {flow.images.map((img) => {
                const uri = resolveImageUrl(img.url);
                return (
                  <TouchableOpacity key={img.id} onPress={() => uri && setZoomedImage(uri)}>
                    <Image source={{ uri }} style={styles.diagramThumb} resizeMode="contain" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {history.length > 0 && (
          <View style={styles.historyBox}>
            <Text style={styles.historyLabel}>ขั้นตอนที่ผ่านมา</Text>
            {history.map((entry, i) => {
              const node = nodesByKey.get(entry.nodeKey);
              return (
                <Text key={`${entry.nodeKey}-${i}`} style={styles.historyItem}>
                  {i + 1}. {node?.text.slice(0, 60)}
                  {(node?.text.length ?? 0) > 60 ? "..." : ""} → <Text style={styles.historyAnswer}>{entry.answer}</Text>
                </Text>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.footerButton, history.length === 0 && styles.disabled]}
          onPress={goBack}
          disabled={history.length === 0}
        >
          <Text style={styles.footerText}>ย้อนกลับ</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerButton} onPress={restart}>
          <Text style={styles.footerText}>เริ่มใหม่</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={zoomedImage !== null} transparent onRequestClose={() => setZoomedImage(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setZoomedImage(null)}>
          <ScrollView
            maximumZoomScale={4}
            minimumZoomScale={1}
            contentContainerStyle={styles.modalScroll}
          >
            {zoomedImage && (
              <Image source={{ uri: zoomedImage }} style={styles.modalImage} resizeMode="contain" />
            )}
          </ScrollView>
          <Text style={styles.modalHint}>แตะที่ใดก็ได้เพื่อปิด · ใช้สองนิ้วเพื่อซูม</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  notes: { fontSize: 13, color: colors.textMuted, marginBottom: 12 },
  progressRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  progress: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  stepNumber: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  actionCard: { borderColor: colors.success, borderWidth: 2 },
  kindLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "700", marginBottom: 8 },
  questionText: { fontSize: 18, color: colors.text, lineHeight: 28 },
  answerRow: { flexDirection: "row", gap: 12, marginTop: 20 },
  answerButton: { flex: 1, borderRadius: 12, paddingVertical: 20, alignItems: "center" },
  yesButton: { backgroundColor: colors.success },
  noButton: { backgroundColor: colors.danger },
  disabled: { opacity: 0.4 },
  answerText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  doneBox: { marginTop: 20, alignItems: "center" },
  doneText: { fontSize: 15, color: colors.success, fontWeight: "700", marginBottom: 12 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  warnBox: {
    marginTop: 20,
    backgroundColor: "#fef3c7",
    borderRadius: 10,
    padding: 16,
  },
  warnTitle: { fontSize: 15, fontWeight: "700", color: "#92400e", marginBottom: 6 },
  warnBody: { fontSize: 14, color: "#92400e", lineHeight: 21 },
  diagramSection: { marginTop: 24 },
  diagramLabel: { fontSize: 13, color: colors.textMuted, fontWeight: "600", marginBottom: 8 },
  diagramThumb: {
    width: 200,
    height: 130,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 10,
  },
  historyBox: {
    marginTop: 24,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  historyLabel: { fontSize: 13, color: colors.textMuted, fontWeight: "600", marginBottom: 8 },
  historyItem: { fontSize: 13, color: colors.text, marginTop: 4, lineHeight: 20 },
  historyAnswer: { fontWeight: "700", color: colors.primary },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  footerButton: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: "center",
  },
  footerText: { color: colors.text, fontWeight: "600" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center" },
  modalScroll: { flexGrow: 1, justifyContent: "center" },
  modalImage: { width: "100%", height: 500 },
  modalHint: { color: "#fff", textAlign: "center", paddingVertical: 16, fontSize: 12 },
  error: { color: colors.danger, fontSize: 15, textAlign: "center" },
  errorHint: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 8 },
});
