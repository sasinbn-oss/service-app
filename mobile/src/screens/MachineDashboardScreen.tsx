import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { colors, radius, shadow, spacing } from "../theme";

interface MachineRow {
  id: number;
  machineCode: string;
  type: "WASHER" | "DRYER";
  status: string;
  lastTxnAt: string | null;
  branchCode: string;
  branchName: string;
  region: string | null;
  ownership: string | null;
  zone: string | null;
  grade: string | null;
}

interface DashboardResponse {
  now: string;
  staleHours: number;
  summary: { total: number; COCO: number; DODO: number; stale: number };
  rows: MachineRow[];
}

type SortKey = "lastTxnAt" | "branchCode" | "branchName" | "grade" | "machineCode";

const OWNERSHIPS = ["ทั้งหมด", "COCO", "DODO"] as const;
const GRADES = ["ทั้งหมด", "A", "B", "C"] as const;

const GRADE_STYLE: Record<string, { color: string; background: string }> = {
  A: { color: "#0b7a68", background: "#dbf3ee" },
  B: { color: "#2563a8", background: "#e2eefb" },
  C: { color: "#6b7280", background: "#eef0f2" },
};

/**
 * ระยะเวลาที่ผ่านมา คิดเทียบกับ "เวลาของเซิร์ฟเวอร์" ที่ส่งมากับข้อมูล
 * ไม่ใช่นาฬิกาของเครื่องผู้ใช้ ซึ่งอาจตั้งผิดหรืออยู่คนละโซนเวลา
 */
function elapsed(lastTxnAt: string | null, now: string) {
  if (!lastTxnAt) return { text: "ไม่เคยมีรายการ", minutes: Number.POSITIVE_INFINITY };
  const minutes = Math.max(0, Math.floor((Date.parse(now) - Date.parse(lastTxnAt)) / 60000));
  if (minutes < 60) return { text: `${minutes} นาทีที่แล้ว`, minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { text: `${hours} ชม.ที่แล้ว`, minutes };
  return { text: `${Math.floor(hours / 24)} วันที่แล้ว`, minutes };
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MachineDashboardScreen() {
  const { width } = useWindowDimensions();
  // ตารางเจ็ดคอลัมน์อ่านไม่ได้บนจอมือถือ จอแคบจึงเปลี่ยนเป็นการ์ดแทน
  const wide = width >= 700;

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ownership, setOwnership] = useState<string>("ทั้งหมด");
  const [grade, setGrade] = useState<string>("ทั้งหมด");
  const [search, setSearch] = useState("");
  const [staleOnly, setStaleOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("lastTxnAt");
  const [sortAsc, setSortAsc] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = useCallback(
    async (opts: { refresh?: boolean } = {}) => {
      if (opts.refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await api.get<DashboardResponse>("/machines", {
          params: {
            status: "OFF",
            ...(ownership !== "ทั้งหมด" ? { ownership } : {}),
            ...(grade !== "ทั้งหมด" ? { grade } : {}),
            ...(search.trim() ? { search: search.trim() } : {}),
            ...(staleOnly ? { staleOnly: "true" } : {}),
          },
        });
        setData(res.data);
      } catch (e) {
        setError(apiErrorMessage(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [ownership, grade, search, staleOnly]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const staleMinutes = (data?.staleHours ?? 72) * 60;

  const regions = useMemo(() => {
    if (!data) return [];
    const order: string[] = [];
    const byRegion = new Map<string, MachineRow[]>();
    for (const row of data.rows) {
      const key = row.region ?? "ไม่ระบุภาค";
      if (!byRegion.has(key)) {
        byRegion.set(key, []);
        order.push(key);
      }
      byRegion.get(key)!.push(row);
    }

    const direction = sortAsc ? 1 : -1;
    const compare = (a: MachineRow, b: MachineRow) => {
      if (sortKey === "lastTxnAt") {
        // เครื่องที่ไม่เคยมีรายการเลยคือเคสหนักสุด ให้อยู่หัวรายการเสมอ
        const av = a.lastTxnAt ? Date.parse(a.lastTxnAt) : 0;
        const bv = b.lastTxnAt ? Date.parse(b.lastTxnAt) : 0;
        return (av - bv) * direction;
      }
      return String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")) * direction;
    };

    return order.map((name) => {
      const rows = [...byRegion.get(name)!].sort(compare);
      return {
        name,
        rows,
        staleCount: rows.filter((r) => elapsed(r.lastTxnAt, data.now).minutes > staleMinutes)
          .length,
      };
    });
  }, [data, sortKey, sortAsc, staleMinutes]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  if (loading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load({ refresh: true })} />
      }
    >
      {data ? (
        <Text style={styles.updatedAt}>อัปเดตล่าสุด {formatDateTime(data.now)} น.</Text>
      ) : null}

      <View style={styles.summaryRow}>
        <SummaryCard
          label="OFF ทั้งหมด"
          value={data?.summary.total ?? 0}
          color={colors.danger}
          icon="power"
          wide={wide}
        />
        <SummaryCard
          label="COCO"
          value={data?.summary.COCO ?? 0}
          color={colors.text}
          icon="business"
          wide={wide}
        />
        <SummaryCard
          label="DODO"
          value={data?.summary.DODO ?? 0}
          color={colors.text}
          icon="storefront"
          wide={wide}
        />
        <SummaryCard
          label={`ดับเกิน ${data?.staleHours ?? 72} ชม.`}
          value={data?.summary.stale ?? 0}
          color={colors.warning}
          icon="time"
          wide={wide}
        />
      </View>

      <View style={styles.tabs}>
        {OWNERSHIPS.map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.tab, ownership === option && styles.tabActive]}
            onPress={() => setOwnership(option)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, ownership === option && styles.tabTextActive]}>
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => load()}
          placeholder="ค้นหา รหัสสาขา / ชื่อสาขา / หมายเลขเครื่อง / zone"
          placeholderTextColor={colors.textFaint}
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={colors.textFaint} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        {GRADES.map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.chip, grade === option && styles.chipActive]}
            onPress={() => setGrade(option)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, grade === option && styles.chipTextActive]}>
              {option === "ทั้งหมด" ? "ทุก Grade" : `Grade ${option}`}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.chip, staleOnly && styles.chipWarning]}
          onPress={() => setStaleOnly((v) => !v)}
          activeOpacity={0.7}
        >
          <Ionicons
            name="time-outline"
            size={14}
            color={staleOnly ? "#92400e" : colors.textMuted}
          />
          <Text style={[styles.chipText, staleOnly && styles.chipTextWarning]}>
            เฉพาะดับนาน
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>เรียงตาม</Text>
        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => toggleSort("lastTxnAt")}
          activeOpacity={0.7}
        >
          <Text style={styles.sortButtonText}>
            {sortKey === "lastTxnAt" ? "เวลาทำรายการ" : "เวลาทำรายการ"}
          </Text>
          <Ionicons
            name={sortKey === "lastTxnAt" ? (sortAsc ? "arrow-up" : "arrow-down") : "swap-vertical"}
            size={14}
            color={sortKey === "lastTxnAt" ? colors.primary : colors.textFaint}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => toggleSort("branchCode")}
          activeOpacity={0.7}
        >
          <Text style={styles.sortButtonText}>รหัสสาขา</Text>
          <Ionicons
            name={
              sortKey === "branchCode" ? (sortAsc ? "arrow-up" : "arrow-down") : "swap-vertical"
            }
            size={14}
            color={sortKey === "branchCode" ? colors.primary : colors.textFaint}
          />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {data && data.rows.length === 0 && !error ? (
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-circle-outline" size={28} color={colors.success} />
          <Text style={styles.emptyText}>ไม่มีเครื่องที่ตรงกับเงื่อนไขที่เลือก</Text>
        </View>
      ) : null}

      {regions.map((region) => (
        <View key={region.name} style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setCollapsed((c) => ({ ...c, [region.name]: !c[region.name] }))}
            activeOpacity={0.7}
          >
            <Ionicons
              name={collapsed[region.name] ? "chevron-forward" : "chevron-down"}
              size={18}
              color={colors.text}
            />
            <Text style={styles.sectionTitle}>{region.name}</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{region.rows.length} เครื่อง</Text>
            </View>
            <View style={{ flex: 1 }} />
            {region.staleCount > 0 ? (
              <View style={styles.staleBadge}>
                <Ionicons name="time" size={12} color="#92400e" />
                <Text style={styles.staleBadgeText}>ดับนาน {region.staleCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>

          {!collapsed[region.name] ? (
            wide ? (
              <MachineTable
                rows={region.rows}
                now={data!.now}
                staleMinutes={staleMinutes}
                sortKey={sortKey}
                sortAsc={sortAsc}
                onSort={toggleSort}
              />
            ) : (
              <View style={styles.cardList}>
                {region.rows.map((row) => (
                  <MachineCard
                    key={row.id}
                    row={row}
                    now={data!.now}
                    staleMinutes={staleMinutes}
                  />
                ))}
              </View>
            )
          ) : null}
        </View>
      ))}

      <Text style={styles.footnote}>
        แถวที่ดับเกิน {data?.staleHours ?? 72} ชม. ถูกไฮไลต์ไว้เพื่อจัดลำดับความเร่งด่วนในการเข้าซ่อม
        · รหัสสาขา COCO ขึ้นต้น CO, DODO ขึ้นต้น DO · หมายเลขเครื่อง W คือเครื่องซัก D คือเครื่องอบ
      </Text>
    </ScrollView>
  );
}

function SummaryCard({
  label,
  value,
  color,
  icon,
  wide,
}: {
  label: string;
  value: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  wide: boolean;
}) {
  return (
    <View style={[styles.summaryCard, wide ? styles.summaryCardWide : styles.summaryCardNarrow]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      </View>
      <Ionicons name={icon} size={24} color={color} style={{ opacity: 0.35 }} />
    </View>
  );
}

const COLUMNS: { key: SortKey | null; label: string; width: number }[] = [
  { key: "branchCode", label: "รหัสสาขา", width: 96 },
  { key: "branchName", label: "ชื่อสาขา", width: 240 },
  { key: null, label: "Zone", width: 72 },
  { key: "machineCode", label: "เครื่อง", width: 88 },
  { key: "grade", label: "Grade", width: 72 },
  { key: null, label: "Status", width: 88 },
  { key: "lastTxnAt", label: "ทำรายการล่าสุด", width: 168 },
];

function MachineTable({
  rows,
  now,
  staleMinutes,
  sortKey,
  sortAsc,
  onSort,
}: {
  rows: MachineRow[];
  now: string;
  staleMinutes: number;
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (key: SortKey) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={styles.tableHeader}>
          {COLUMNS.map((column) => (
            <TouchableOpacity
              key={column.label}
              style={{ width: column.width }}
              disabled={!column.key}
              onPress={() => column.key && onSort(column.key)}
              activeOpacity={0.6}
            >
              <View style={styles.tableHeaderCell}>
                <Text style={styles.tableHeaderText}>{column.label}</Text>
                {column.key ? (
                  <Ionicons
                    name={
                      sortKey === column.key
                        ? sortAsc
                          ? "arrow-up"
                          : "arrow-down"
                        : "swap-vertical"
                    }
                    size={11}
                    color={sortKey === column.key ? colors.primary : colors.border}
                  />
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {rows.map((row) => {
          const age = elapsed(row.lastTxnAt, now);
          const stale = age.minutes > staleMinutes;
          const gradeStyle = GRADE_STYLE[row.grade ?? "C"] ?? GRADE_STYLE.C;
          return (
            <View key={row.id} style={[styles.tableRow, stale && styles.tableRowStale]}>
              <Text style={[styles.cellMono, { width: COLUMNS[0].width }]}>{row.branchCode}</Text>
              <Text style={[styles.cellText, { width: COLUMNS[1].width }]}>{row.branchName}</Text>
              <View style={{ width: COLUMNS[2].width }}>
                <View style={styles.zoneChip}>
                  <Text style={styles.zoneChipText}>{row.zone ?? "—"}</Text>
                </View>
              </View>
              <Text style={[styles.cellMono, { width: COLUMNS[3].width }]}>{row.machineCode}</Text>
              <View style={{ width: COLUMNS[4].width }}>
                <View style={[styles.gradeChip, { backgroundColor: gradeStyle.background }]}>
                  <Text style={[styles.gradeChipText, { color: gradeStyle.color }]}>
                    {row.grade ?? "—"}
                  </Text>
                </View>
              </View>
              <View style={{ width: COLUMNS[5].width }}>
                <View style={styles.statusChip}>
                  <Ionicons name="power" size={11} color="#b91c1c" />
                  <Text style={styles.statusChipText}>{row.status}</Text>
                </View>
              </View>
              <View style={{ width: COLUMNS[6].width }}>
                <Text style={styles.cellText}>{formatDateTime(row.lastTxnAt)}</Text>
                <Text style={[styles.cellSub, stale && styles.cellSubStale]}>{age.text}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function MachineCard({
  row,
  now,
  staleMinutes,
}: {
  row: MachineRow;
  now: string;
  staleMinutes: number;
}) {
  const age = elapsed(row.lastTxnAt, now);
  const stale = age.minutes > staleMinutes;
  const gradeStyle = GRADE_STYLE[row.grade ?? "C"] ?? GRADE_STYLE.C;

  return (
    <View style={[styles.card, stale && styles.cardStale]}>
      <View style={styles.cardTop}>
        <Text style={styles.cardBranch}>{row.branchName}</Text>
        <View style={styles.statusChip}>
          <Ionicons name="power" size={11} color="#b91c1c" />
          <Text style={styles.statusChipText}>{row.status}</Text>
        </View>
      </View>

      <View style={styles.cardChips}>
        <View style={styles.zoneChip}>
          <Text style={styles.zoneChipText}>{row.branchCode}</Text>
        </View>
        <View style={styles.zoneChip}>
          <Text style={styles.zoneChipText}>{row.zone ?? "—"}</Text>
        </View>
        <View style={styles.machineChip}>
          <Ionicons
            name={row.type === "DRYER" ? "flame-outline" : "water-outline"}
            size={12}
            color={colors.primary}
          />
          <Text style={styles.machineChipText}>{row.machineCode}</Text>
        </View>
        <View style={[styles.gradeChip, { backgroundColor: gradeStyle.background }]}>
          <Text style={[styles.gradeChipText, { color: gradeStyle.color }]}>
            {row.grade ?? "—"}
          </Text>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <Ionicons
          name="time-outline"
          size={14}
          color={stale ? "#92400e" : colors.textMuted}
        />
        <Text style={[styles.cardTime, stale && styles.cardTimeStale]}>
          {age.text}
        </Text>
        <Text style={styles.cardTimeExact}>· {formatDateTime(row.lastTxnAt)} น.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  // ตัวอักษรไทยมีสระบนและวรรณยุกต์ lineHeight ต้องสูงกว่า fontSize ชัดเจน
  updatedAt: { fontSize: 12, lineHeight: 20, color: colors.textMuted, marginBottom: spacing.md },

  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.card,
  },
  // จอแคบวางสองใบต่อแถว จอกว้างวางสี่ใบเรียงเดียว
  summaryCardNarrow: { flexGrow: 1, flexBasis: "46%", minWidth: 0 },
  summaryCardWide: { flexGrow: 1, flexBasis: 0, minWidth: 0 },
  summaryLabel: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  summaryValue: { fontSize: 24, lineHeight: 34, fontWeight: "700" },

  tabs: {
    flexDirection: "row",
    gap: 4,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginTop: spacing.lg,
    alignSelf: "flex-start",
  },
  tab: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.text },
  tabText: { fontSize: 14, lineHeight: 22, fontWeight: "600", color: colors.textMuted },
  tabTextActive: { color: "#fff" },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.md,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },

  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipWarning: { backgroundColor: colors.warningSoft, borderColor: "#fcd34d" },
  chipText: { fontSize: 13, lineHeight: 21, color: colors.textMuted, fontWeight: "600" },
  chipTextActive: { color: colors.primary },
  chipTextWarning: { color: "#92400e" },

  sortRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  sortLabel: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortButtonText: { fontSize: 12, lineHeight: 20, color: colors.text },

  section: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginTop: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: { fontSize: 15, lineHeight: 24, fontWeight: "700", color: colors.text },
  countBadge: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  countBadgeText: { fontSize: 11, lineHeight: 18, color: colors.textMuted },
  staleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: "#fcd34d",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  staleBadgeText: { fontSize: 11, lineHeight: 18, color: "#92400e", fontWeight: "600" },

  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeaderCell: { flexDirection: "row", alignItems: "center", gap: 4 },
  tableHeaderText: { fontSize: 11, lineHeight: 18, color: colors.textMuted, fontWeight: "600" },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableRowStale: { backgroundColor: colors.warningSoft },
  cellText: { fontSize: 13, lineHeight: 21, color: colors.text, paddingRight: spacing.sm },
  cellSub: { fontSize: 11, lineHeight: 18, color: colors.textFaint },
  cellSubStale: { color: "#92400e", fontWeight: "600" },
  cellMono: {
    fontSize: 12,
    lineHeight: 20,
    color: colors.textMuted,
    fontFamily: undefined,
    paddingRight: spacing.sm,
  },

  cardList: { padding: spacing.md, gap: spacing.sm },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardStale: { backgroundColor: colors.warningSoft, borderColor: "#fcd34d" },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardBranch: { flex: 1, fontSize: 14, lineHeight: 23, fontWeight: "700", color: colors.text },
  cardChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  cardTime: { fontSize: 13, lineHeight: 21, color: colors.textMuted, fontWeight: "600" },
  cardTimeStale: { color: "#92400e" },
  cardTimeExact: { fontSize: 11, lineHeight: 20, color: colors.textFaint },

  zoneChip: {
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignSelf: "flex-start",
  },
  zoneChipText: { fontSize: 11, lineHeight: 18, color: colors.textMuted },
  machineChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  machineChipText: { fontSize: 11, lineHeight: 18, color: colors.primary, fontWeight: "700" },
  gradeChip: {
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 1,
    alignSelf: "flex-start",
  },
  gradeChipText: { fontSize: 11, lineHeight: 18, fontWeight: "700" },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 1,
    alignSelf: "flex-start",
  },
  statusChipText: { fontSize: 11, lineHeight: 18, color: "#b91c1c", fontWeight: "700" },

  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 21, color: colors.danger },
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.xl,
    marginTop: spacing.lg,
  },
  emptyText: { fontSize: 13, lineHeight: 21, color: colors.textMuted },

  footnote: {
    fontSize: 11,
    lineHeight: 20,
    color: colors.textFaint,
    marginTop: spacing.xl,
  },
});
