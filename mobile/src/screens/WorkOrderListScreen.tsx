/**
 * รายการใบงาน — สิ่งที่ช่างต้องไปทำ
 *
 * ต่างจากกระดานติดตามเครื่องเสีย ซึ่งบอกว่า "เครื่องไหนมีปัญหา" หน้านี้บอกว่า
 * "ใครต้องไปทำอะไร" เคสหนึ่งอาจมีใบงานหลายใบ ถ้าช่างต้องเข้าไปหลายรอบ
 */
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
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
import { useWideLayout } from "../components/AppShell";
import { HomeStackParamList } from "../navigation/types";
import { colors, radius, shadow, spacing } from "../theme";

type Props = NativeStackScreenProps<HomeStackParamList, "WorkOrderList">;

export interface WorkOrderRow {
  id: number;
  code: string;
  source: string;
  title: string;
  status: string;
  statusLabel: string;
  priority: string;
  priorityLabel: string;
  branchCode: string;
  branchName: string;
  machineCode: string | null;
  assignedToName: string | null;
  scheduledAt: string | null;
  createdAt: string;
  closedAt: string | null;
  closeResultLabel: string | null;
}

type Filter = "ACTIVE" | "OPEN" | "IN_PROGRESS" | "DONE" | "ALL";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ACTIVE", label: "ที่ยังค้าง" },
  { value: "OPEN", label: "รอช่างรับ" },
  { value: "IN_PROGRESS", label: "ช่างรับแล้ว" },
  { value: "DONE", label: "ปิดแล้ว" },
  { value: "ALL", label: "ทั้งหมด" },
];

export function statusTone(status: string) {
  if (status === "DONE") return { bg: colors.successSoft, fg: colors.success };
  if (status === "CANCELLED") return { bg: colors.background, fg: colors.textFaint };
  if (status === "IN_PROGRESS") return { bg: colors.warningSoft, fg: colors.warning };
  return { bg: colors.dangerSoft, fg: colors.danger };
}

export function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function WorkOrderListScreen({ navigation }: Props) {
  useWideLayout();
  const [rows, setRows] = useState<WorkOrderRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<Filter>("ACTIVE");
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<{ rows: WorkOrderRow[]; counts: Record<string, number> }>(
        "/work-orders",
        {
          params: {
            status: filter,
            ...(mineOnly ? { assignedTo: "me" } : {}),
            ...(search.trim() ? { search: search.trim() } : {}),
          },
        }
      );
      setRows(res.data.rows);
      setCounts(res.data.counts);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [filter, mineOnly, search]);

  // โหลดใหม่ทุกครั้งที่กลับมาหน้านี้ เพราะเพิ่งไปปิดงานมาแล้วตัวเลขต้องเปลี่ยน
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="ค้นรหัสใบงาน สาขา หรือเรื่อง"
            placeholderTextColor={colors.textFaint}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate("WorkOrderForm")}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addButtonText}>เพิ่มใบงาน</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        <View style={styles.chipRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[styles.chip, filter === f.value && styles.chipOn]}
              onPress={() => setFilter(f.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, filter === f.value && styles.chipTextOn]}>
                {f.label}
                {f.value === "OPEN" && counts.OPEN ? ` (${counts.OPEN})` : ""}
                {f.value === "IN_PROGRESS" && counts.IN_PROGRESS ? ` (${counts.IN_PROGRESS})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.chip, mineOnly && styles.chipOn]}
            onPress={() => setMineOnly((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, mineOnly && styles.chipTextOn]}>เฉพาะงานของฉัน</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={load} style={styles.retry}>
            <Text style={styles.retryText}>ลองใหม่</Text>
          </TouchableOpacity>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="clipboard-outline" size={34} color={colors.textFaint} />
          <Text style={styles.emptyTitle}>ไม่มีใบงานในหมวดนี้</Text>
          <Text style={styles.emptyText}>
            เปิดใบงานได้จากกระดานติดตามเครื่องเสีย หรือกดปุ่มเพิ่มใบงานด้านบน
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        >
          {rows.map((row) => (
            <WorkOrderCard
              key={row.id}
              row={row}
              onPress={() => navigation.navigate("WorkOrderDetail", { id: row.id })}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function WorkOrderCard({ row, onPress }: { row: WorkOrderRow; onPress: () => void }) {
  const tone = statusTone(row.status);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardTop}>
        <Text style={styles.code}>{row.code}</Text>
        {row.priority === "URGENT" ? (
          <View style={styles.urgent}>
            <Ionicons name="alert-circle" size={12} color={colors.danger} />
            <Text style={styles.urgentText}>ด่วน</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <View style={[styles.badge, { backgroundColor: tone.bg }]}>
          <Text style={[styles.badgeText, { color: tone.fg }]}>{row.statusLabel}</Text>
        </View>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {row.title}
      </Text>

      <View style={styles.metaRow}>
        <Ionicons name="business-outline" size={13} color={colors.textFaint} />
        <Text style={styles.meta}>
          {row.branchCode} · {row.branchName}
          {row.machineCode ? ` · เครื่อง ${row.machineCode}` : ""}
        </Text>
      </View>

      <View style={styles.metaRow}>
        <Ionicons name="person-outline" size={13} color={colors.textFaint} />
        <Text style={styles.meta}>
          {row.assignedToName ?? "ยังไม่มอบหมายช่าง"}
          {row.source === "OUTAGE" ? " · เปิดจากกระดาน" : " · เปิดเอง"}
        </Text>
      </View>

      {row.closedAt ? (
        <View style={styles.metaRow}>
          <Ionicons name="checkmark-done-outline" size={13} color={colors.success} />
          <Text style={styles.meta}>
            {row.closeResultLabel} · {formatDateTime(row.closedAt)}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  searchBox: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  addButtonText: { color: "#fff", fontSize: 14, lineHeight: 22, fontWeight: "700" },
  chipScroll: { flexGrow: 0, paddingVertical: spacing.md },
  chipRow: { flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.lg },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 13, lineHeight: 21, color: colors.textMuted, fontWeight: "600" },
  chipTextOn: { color: colors.primaryDark },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadow.card,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  code: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.primary },
  urgent: { flexDirection: "row", alignItems: "center", gap: 2 },
  urgentText: { fontSize: 11, lineHeight: 19, color: colors.danger, fontWeight: "700" },
  badge: { borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: spacing.sm },
  badgeText: { fontSize: 11, lineHeight: 19, fontWeight: "700" },
  title: { fontSize: 15, lineHeight: 24, fontWeight: "700", color: colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  meta: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.textMuted },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { fontSize: 15, lineHeight: 24, fontWeight: "700", color: colors.text },
  emptyText: { fontSize: 13, lineHeight: 21, color: colors.textMuted, textAlign: "center" },
  errorText: { fontSize: 13, lineHeight: 21, color: colors.danger, textAlign: "center" },
  retry: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  retryText: { fontSize: 13, lineHeight: 21, color: colors.text, fontWeight: "600" },
});
