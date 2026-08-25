/**
 * ใบงานหนึ่งใบ — ที่ช่างรับงานและปิดงาน
 *
 * ปิดใบงานไม่ได้ปิดเคสบนกระดาน เพราะเคสปิดตอนเครื่องหายไปจากไฟล์เท่านั้น
 * หน้านี้จึงเตือนตรงๆ ตอนปิดว่าเครื่องยังไม่กลับมา ไม่ใช่ปล่อยให้เข้าใจผิด
 * ว่ากดปิดแล้วจบ
 */
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import PartPicker, { PickedPart } from "../components/PartPicker";
import { useAuth } from "../context/AuthContext";
import { HomeStackParamList } from "../navigation/types";
import { colors, radius, shadow, spacing } from "../theme";
import { formatDateTime, statusTone } from "./WorkOrderListScreen";

type Props = NativeStackScreenProps<HomeStackParamList, "WorkOrderDetail">;

interface LogEntry {
  id: number;
  actionLabel: string;
  statusLabel: string;
  note: string | null;
  byName: string | null;
  createdAt: string;
}

interface WorkOrder {
  id: number;
  code: string;
  source: string;
  title: string;
  detail: string | null;
  status: string;
  statusLabel: string;
  priorityLabel: string;
  branchCode: string;
  branchName: string;
  region: string | null;
  machineCode: string | null;
  machineBrand: string | null;
  assignedToName: string | null;
  scheduledAt: string | null;
  createdByName: string | null;
  createdAt: string;
  closedAt: string | null;
  closedByName: string | null;
  closeResultLabel: string | null;
  closeNote: string | null;
  outageId: number | null;
  outageStillOpen: boolean | null;
  outageKind: string | null;
  parts: PickedPart[];
  logs: LogEntry[];
}

interface Option {
  value: string;
  label: string;
}

export default function WorkOrderDetailScreen({ route }: Props) {
  const { id } = route.params;
  const { user } = useAuth();
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [results, setResults] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [detail, options] = await Promise.all([
        api.get<WorkOrder>(`/work-orders/${id}`),
        api.get<{ results: Option[] }>("/work-orders/options"),
      ]);
      setOrder(detail.data);
      setResults(options.data.results);
      setError(null);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function start() {
    setBusy(true);
    try {
      const res = await api.patch<WorkOrder>(`/work-orders/${id}`, { status: "IN_PROGRESS" });
      setOrder({ ...res.data, logs: order?.logs ?? [] });
      await load();
    } catch (e) {
      showAlert("ทำไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function takeIt() {
    if (!user) return;
    setBusy(true);
    try {
      await api.patch(`/work-orders/${id}`, { assignedToId: user.id, status: "IN_PROGRESS" });
      await load();
    } catch (e) {
      showAlert("ทำไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? "ไม่พบใบงานนี้"}</Text>
      </View>
    );
  }

  const tone = statusTone(order.status);
  const done = order.status === "DONE" || order.status === "CANCELLED";
  const mine = order.assignedToName === user?.name;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.headRow}>
          <Text style={styles.code}>{order.code}</Text>
          <View style={{ flex: 1 }} />
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.badgeText, { color: tone.fg }]}>{order.statusLabel}</Text>
          </View>
        </View>

        <Text style={styles.title}>{order.title}</Text>
        {order.detail ? <Text style={styles.detail}>{order.detail}</Text> : null}

        <View style={styles.divider} />

        <Row label="สาขา" value={`${order.branchCode} · ${order.branchName}`} />
        {order.region ? <Row label="ภาค" value={order.region} /> : null}
        <Row
          label="เครื่อง"
          value={
            order.machineCode
              ? `${order.machineCode}${order.machineBrand ? ` · ${order.machineBrand}` : ""}`
              : "ทั้งสาขา"
          }
        />
        <Row label="ความเร่งด่วน" value={order.priorityLabel} />
        <Row label="ช่างที่รับผิดชอบ" value={order.assignedToName ?? "ยังไม่มอบหมาย"} />
        <Row label="วันที่นัดเข้า" value={order.scheduledAt ? formatDateTime(order.scheduledAt) : "—"} />
        <Row
          label="เปิดโดย"
          value={`${order.createdByName ?? "—"} · ${formatDateTime(order.createdAt)}`}
        />
        <Row label="ที่มา" value={order.source === "OUTAGE" ? "เปิดจากกระดาน" : "เปิดเอง"} />
      </View>

      {order.outageId !== null ? (
        <View style={[styles.card, styles.linked]}>
          <View style={styles.headRow}>
            <Ionicons
              name={order.outageStillOpen ? "alert-circle" : "checkmark-circle"}
              size={17}
              color={order.outageStillOpen ? colors.danger : colors.success}
            />
            <Text style={styles.linkedTitle}>
              {order.outageStillOpen ? "เครื่องยังไม่กลับมา" : "เครื่องกลับมาแล้ว"}
            </Text>
          </View>
          <Text style={styles.linkedText}>
            {order.outageStillOpen
              ? "เคสบนกระดานยังเปิดอยู่ ระบบจะปิดให้เองเมื่อเครื่องหายไปจากไฟล์รายงานรอบถัดไป — ปิดใบงานไม่ได้ปิดเคส"
              : "เคสบนกระดานปิดไปแล้ว เพราะเครื่องหายไปจากไฟล์รายงาน"}
          </Text>
        </View>
      ) : null}

      {order.closedAt ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ผลการทำงาน</Text>
          <Row label="ผล" value={order.closeResultLabel ?? "—"} />
          <Row label="ปิดโดย" value={`${order.closedByName ?? "—"} · ${formatDateTime(order.closedAt)}`} />
          {order.closeNote ? <Text style={styles.detail}>{order.closeNote}</Text> : null}
          {order.parts.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>อะไหล่ที่ใช้</Text>
              {order.parts.map((p) => (
                <Text key={p.sparePartId} style={styles.partLine}>
                  {p.partCode} · {p.name} × {p.quantity}
                </Text>
              ))}
            </>
          ) : null}
        </View>
      ) : null}

      {!done ? (
        <View style={styles.actions}>
          {order.status === "OPEN" ? (
            <TouchableOpacity
              style={[styles.action, styles.actionSecondary]}
              onPress={order.assignedToName ? start : takeIt}
              disabled={busy}
              activeOpacity={0.8}
            >
              <Ionicons name="hand-left-outline" size={18} color={colors.primary} />
              <Text style={styles.actionSecondaryText}>
                {order.assignedToName ? "เริ่มทำงาน" : "รับงานนี้"}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.action, styles.actionPrimary]}
            onPress={() => setClosing(true)}
            disabled={busy}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-done" size={18} color="#fff" />
            <Text style={styles.actionPrimaryText}>ปิดงาน</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>ประวัติ</Text>
        {order.logs.map((log) => (
          <View key={log.id} style={styles.logRow}>
            <View style={styles.dot} />
            <View style={styles.logBody}>
              <Text style={styles.logAction}>{log.actionLabel}</Text>
              <Text style={styles.logMeta}>
                {log.byName ?? "—"} · {formatDateTime(log.createdAt)}
              </Text>
              {log.note ? <Text style={styles.logNote}>{log.note}</Text> : null}
            </View>
          </View>
        ))}
      </View>

      <CloseModal
        visible={closing}
        order={order}
        results={results}
        onCancel={() => setClosing(false)}
        onDone={async () => {
          setClosing(false);
          await load();
        }}
      />
    </ScrollView>
  );
}

function CloseModal({
  visible,
  order,
  results,
  onCancel,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  results: Option[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const [result, setResult] = useState("FIXED");
  const [note, setNote] = useState("");
  const [parts, setParts] = useState<PickedPart[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/work-orders/${order.id}/close`, {
        result,
        note: note.trim() || undefined,
        parts: parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
      });
      setNote("");
      setParts([]);
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.modalTitle}>ปิดงาน {order.code}</Text>

            <Text style={styles.modalLabel}>ผลการทำงาน</Text>
            <View style={styles.options}>
              {results.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.option, result === r.value && styles.optionOn]}
                  onPress={() => setResult(r.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.optionText, result === r.value && styles.optionTextOn]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>สรุปงานที่ทำ</Text>
            <TextInput
              style={styles.modalInput}
              value={note}
              onChangeText={setNote}
              placeholder="เช่น เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ"
              placeholderTextColor={colors.textFaint}
              multiline
              numberOfLines={3}
              accessibilityLabel="สรุปงานที่ทำ"
            />

            <PartPicker parts={parts} onChange={setParts} label="อะไหล่ที่ใช้ไป" />

            {order.outageStillOpen ? (
              <Text style={styles.warn}>
                เครื่องยังขึ้นว่าดับอยู่ในไฟล์รายงานล่าสุด ปิดใบงานได้ แต่เคสบนกระดานจะยังอยู่
                จนกว่าเครื่องจะหายไปจากไฟล์รอบถัดไป
              </Text>
            ) : null}

            {error ? <Text style={styles.modalError}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
              <Text style={styles.modalCancelText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSave, saving && styles.modalSaveOff]}
              onPress={submit}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.modalSaveText}>ยืนยันปิดงาน</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  errorText: { fontSize: 13, lineHeight: 21, color: colors.danger, textAlign: "center" },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, ...shadow.card },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  code: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.primary },
  badge: { borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: spacing.sm },
  badgeText: { fontSize: 11, lineHeight: 19, fontWeight: "700" },
  title: { fontSize: 17, lineHeight: 27, fontWeight: "700", color: colors.text, marginTop: spacing.sm },
  detail: { fontSize: 13, lineHeight: 21, color: colors.textMuted, marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.xs },
  rowLabel: { width: 120, fontSize: 13, lineHeight: 21, color: colors.textMuted },
  rowValue: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 21, color: colors.text, fontWeight: "600" },
  sectionTitle: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  partLine: { fontSize: 13, lineHeight: 21, color: colors.textMuted },
  linked: { borderLeftWidth: 3, borderLeftColor: colors.primary },
  linkedTitle: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.text },
  linkedText: { fontSize: 12, lineHeight: 20, color: colors.textMuted, marginTop: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
  },
  actionPrimary: { backgroundColor: colors.primary },
  actionPrimaryText: { color: "#fff", fontSize: 15, lineHeight: 24, fontWeight: "700" },
  actionSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary },
  actionSecondaryText: { color: colors.primary, fontSize: 15, lineHeight: 24, fontWeight: "700" },
  logRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, marginTop: 8 },
  logBody: { flex: 1, minWidth: 0 },
  logAction: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  logMeta: { fontSize: 11, lineHeight: 19, color: colors.textFaint },
  logNote: { fontSize: 12, lineHeight: 20, color: colors.textMuted, marginTop: 2 },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modal: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "90%",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  modalBody: { padding: spacing.lg },
  modalTitle: { fontSize: 16, lineHeight: 26, fontWeight: "700", color: colors.text },
  modalLabel: {
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
    minHeight: 84,
    textAlignVertical: "top",
  },
  options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  optionOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  optionText: { fontSize: 13, lineHeight: 21, color: colors.textMuted, fontWeight: "600" },
  optionTextOn: { color: colors.primaryDark },
  warn: {
    fontSize: 12,
    lineHeight: 20,
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  modalError: { fontSize: 13, lineHeight: 21, color: colors.danger, marginTop: spacing.md },
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalCancel: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
  },
  modalCancelText: { fontSize: 14, lineHeight: 22, color: colors.textMuted, fontWeight: "600" },
  modalSave: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
  },
  modalSaveOff: { opacity: 0.6 },
  modalSaveText: { color: "#fff", fontSize: 14, lineHeight: 22, fontWeight: "700" },
});
