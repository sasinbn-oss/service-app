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
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { HomeStackParamList } from "../navigation/types";
import { colors, radius, shadow, spacing } from "../theme";

/** แถวเดียวใช้ได้ทั้งสองแท็บ — แท็บสัญญาณหายไม่มีข้อมูลระดับเครื่อง */
interface OutageRow {
  id: number;
  branchCode: string;
  branchName: string;
  region: string | null;
  ownership: string | null;
  zone: string | null;
  grade: string | null;
  machineCode?: string;
  machineType?: string;
  machineCount?: number;
  startedAt: string;
  slaHours: number;
  breached: boolean;
}

interface DashboardResponse {
  now: string;
  slaHours: number;
  summary: {
    total: number;
    COCO: number;
    DODO: number;
    breached: number;
    machinesAffected?: number;
  };
  rows: OutageRow[];
}

type Tab = "machines" | "signal";
type SortKey = "slaHours" | "branchCode" | "branchName" | "machineCode";
type GroupKey = "ownership" | "region" | "zone";

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "ownership", label: "เจ้าของ" },
  { key: "region", label: "ภาค" },
  { key: "zone", label: "ทีมช่าง" },
];

const OWNERSHIPS = ["ทั้งหมด", "COCO", "DODO"] as const;

const GRADE_STYLE: Record<string, { color: string; background: string }> = {
  A: { color: "#0b7a68", background: "#dbf3ee" },
  B: { color: "#2563a8", background: "#e2eefb" },
  C: { color: "#6b7280", background: "#eef0f2" },
};

/** ชั่วโมงล้วนอ่านยากเมื่อเลยไม่กี่วัน แปลงเป็น "3 วัน 4 ชม." */
function slaText(hours: number) {
  if (hours < 24) return `${hours} ชม.`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0 ? `${days} วัน` : `${days} วัน ${rest} ชม.`;
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

type Props = NativeStackScreenProps<HomeStackParamList, "MachineDashboard">;

export default function MachineDashboardScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  // ตารางหลายคอลัมน์อ่านไม่ได้บนจอมือถือ จอแคบจึงเปลี่ยนเป็นการ์ดแทน
  const wide = width >= 700;
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>("machines");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ownership, setOwnership] = useState<string>("ทั้งหมด");
  const [search, setSearch] = useState("");
  const [breachedOnly, setBreachedOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupKey>("region");
  const [sortKey, setSortKey] = useState<SortKey>("slaHours");
  const [sortAsc, setSortAsc] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = useCallback(
    async (opts: { refresh?: boolean } = {}) => {
      if (opts.refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await api.get<DashboardResponse>(
          tab === "machines" ? "/machines/outages" : "/machines/signal-lost",
          {
            params: {
              ...(ownership !== "ทั้งหมด" ? { ownership } : {}),
              ...(search.trim() ? { search: search.trim() } : {}),
              ...(breachedOnly ? { breachedOnly: "true" } : {}),
            },
          }
        );
        setData(res.data);
      } catch (e) {
        setError(apiErrorMessage(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tab, ownership, search, breachedOnly]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const groups = useMemo(() => {
    if (!data) return [];
    const order: string[] = [];
    const buckets = new Map<string, OutageRow[]>();
    const labelOf = (row: OutageRow) =>
      (groupBy === "ownership" ? row.ownership : groupBy === "region" ? row.region : row.zone) ??
      (groupBy === "ownership" ? "ไม่ระบุเจ้าของ" : groupBy === "region" ? "ยังไม่ระบุภาค" : "ยังไม่ระบุทีมช่าง");

    for (const row of data.rows) {
      const key = labelOf(row);
      if (!buckets.has(key)) {
        buckets.set(key, []);
        order.push(key);
      }
      buckets.get(key)!.push(row);
    }

    const direction = sortAsc ? 1 : -1;
    const compare = (a: OutageRow, b: OutageRow) => {
      if (sortKey === "slaHours") return (a.slaHours - b.slaHours) * direction;
      return String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")) * direction;
    };

    return order.sort().map((name) => {
      const rows = [...buckets.get(name)!].sort(compare);
      return { name, rows, breachedCount: rows.filter((r) => r.breached).length };
    });
  }, [data, groupBy, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === "slaHours" ? false : true);
    }
  }

  function switchTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    setData(null);
    setLoading(true);
    setCollapsed({});
  }

  const slaHours = data?.slaHours ?? 72;
  const isMachines = tab === "machines";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load({ refresh: true })} />
      }
    >
      <View style={styles.topRow}>
        {data ? (
          <Text style={styles.updatedAt}>ข้อมูล ณ {formatDateTime(data.now)} น.</Text>
        ) : (
          <View />
        )}
        {user?.role === "ADMIN" ? (
          <TouchableOpacity
            style={styles.importButton}
            onPress={() => navigation.navigate("MachineImport")}
            activeOpacity={0.7}
          >
            <Ionicons name="cloud-upload-outline" size={15} color={colors.primary} />
            <Text style={styles.importButtonText}>อัปโหลดไฟล์</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.mainTabs}>
        <MainTab
          active={isMachines}
          icon="power"
          label="เครื่องดับ"
          count={isMachines ? data?.summary.total : undefined}
          onPress={() => switchTab("machines")}
        />
        <MainTab
          active={!isMachines}
          icon="wifi-outline"
          label="สัญญาณหาย"
          count={!isMachines ? data?.summary.total : undefined}
          onPress={() => switchTab("signal")}
        />
      </View>

      <View style={styles.summaryRow}>
        <SummaryCard
          label={isMachines ? "เครื่องดับ" : "สาขาสัญญาณหาย"}
          value={data?.summary.total ?? 0}
          color={isMachines ? colors.danger : colors.warning}
          icon={isMachines ? "power" : "wifi-outline"}
          wide={wide}
        />
        <SummaryCard label="COCO" value={data?.summary.COCO ?? 0} color={colors.text} icon="business" wide={wide} />
        <SummaryCard label="DODO" value={data?.summary.DODO ?? 0} color={colors.text} icon="storefront" wide={wide} />
        <SummaryCard
          label={`เลย SLA ${slaHours} ชม.`}
          value={data?.summary.breached ?? 0}
          color="#b45309"
          icon="alert-circle"
          wide={wide}
        />
      </View>

      {!isMachines && data?.summary.machinesAffected ? (
        <Text style={styles.affected}>
          กระทบเครื่องรวม {data.summary.machinesAffected} เครื่องใน {data.summary.total} สาขา
        </Text>
      ) : null}

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
          placeholder={isMachines ? "ค้นหา รหัสสาขา / ชื่อสาขา / เครื่อง" : "ค้นหา รหัสสาขา / ชื่อสาขา"}
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
        <TouchableOpacity
          style={[styles.chip, breachedOnly && styles.chipWarning]}
          onPress={() => setBreachedOnly((v) => !v)}
          activeOpacity={0.7}
        >
          <Ionicons
            name="alert-circle-outline"
            size={14}
            color={breachedOnly ? "#92400e" : colors.textMuted}
          />
          <Text style={[styles.chipText, breachedOnly && styles.chipTextWarning]}>
            เฉพาะเลย SLA
          </Text>
        </TouchableOpacity>

        <View style={styles.groupPicker}>
          <Text style={styles.groupLabel}>กลุ่ม</Text>
          {GROUPS.map((g) => (
            <TouchableOpacity
              key={g.key}
              style={[styles.groupOption, groupBy === g.key && styles.groupOptionActive]}
              onPress={() => setGroupBy(g.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.groupOptionText, groupBy === g.key && styles.groupOptionTextActive]}
              >
                {g.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>เรียงตาม</Text>
        <SortButton label="SLA" active={sortKey === "slaHours"} asc={sortAsc} onPress={() => toggleSort("slaHours")} />
        <SortButton
          label="รหัสสาขา"
          active={sortKey === "branchCode"}
          asc={sortAsc}
          onPress={() => toggleSort("branchCode")}
        />
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading && !data ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {data && data.rows.length === 0 && !error ? (
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-circle-outline" size={28} color={colors.success} />
          <Text style={styles.emptyText}>
            {isMachines ? "ไม่มีเครื่องดับตามเงื่อนไขที่เลือก" : "ไม่มีสาขาที่สัญญาณหาย"}
          </Text>
        </View>
      ) : null}

      {groups.map((group) => (
        <View key={group.name} style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setCollapsed((c) => ({ ...c, [group.name]: !c[group.name] }))}
            activeOpacity={0.7}
          >
            <Ionicons
              name={collapsed[group.name] ? "chevron-forward" : "chevron-down"}
              size={18}
              color={colors.text}
            />
            <Text style={styles.sectionTitle}>{group.name}</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>
                {group.rows.length} {isMachines ? "เครื่อง" : "สาขา"}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            {group.breachedCount > 0 ? (
              <View style={styles.staleBadge}>
                <Ionicons name="alert-circle" size={12} color="#92400e" />
                <Text style={styles.staleBadgeText}>เลย SLA {group.breachedCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>

          {!collapsed[group.name] ? (
            wide ? (
              <OutageTable
                rows={group.rows}
                isMachines={isMachines}
                sortKey={sortKey}
                sortAsc={sortAsc}
                onSort={toggleSort}
              />
            ) : (
              <View style={styles.cardList}>
                {group.rows.map((row) => (
                  <OutageCard key={row.id} row={row} isMachines={isMachines} />
                ))}
              </View>
            )
          ) : null}
        </View>
      ))}

      <Text style={styles.footnote}>
        SLA นับตั้งแต่ครั้งแรกที่เจอปัญหานี้ในไฟล์ที่อัปโหลด และหยุดนับเมื่อหายไปจากไฟล์
        · ความละเอียดของเวลาขึ้นกับรอบอัปโหลด (เช้า/บ่าย) · เกิน {slaHours} ชม. ถือว่าเลยกำหนด
      </Text>
    </ScrollView>
  );
}

function MainTab({
  active,
  icon,
  label,
  count,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count?: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.mainTab, active && styles.mainTabActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={17} color={active ? colors.primary : colors.textMuted} />
      <Text style={[styles.mainTabText, active && styles.mainTabTextActive]}>{label}</Text>
      {count !== undefined ? (
        <View style={[styles.mainTabCount, active && styles.mainTabCountActive]}>
          <Text style={[styles.mainTabCountText, active && styles.mainTabCountTextActive]}>
            {count}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function SortButton({
  label,
  active,
  asc,
  onPress,
}: {
  label: string;
  active: boolean;
  asc: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.sortButton} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.sortButtonText}>{label}</Text>
      <Ionicons
        name={active ? (asc ? "arrow-up" : "arrow-down") : "swap-vertical"}
        size={14}
        color={active ? colors.primary : colors.textFaint}
      />
    </TouchableOpacity>
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

function columnsFor(isMachines: boolean): { key: SortKey | null; label: string; width: number }[] {
  return isMachines
    ? [
        { key: "branchCode", label: "รหัสสาขา", width: 92 },
        { key: "branchName", label: "ชื่อสาขา", width: 236 },
        { key: "machineCode", label: "เครื่อง", width: 84 },
        { key: null, label: "ทีมช่าง", width: 110 },
        { key: null, label: "Grade", width: 66 },
        { key: "slaHours", label: "ดับมาแล้ว", width: 180 },
      ]
    : [
        { key: "branchCode", label: "รหัสสาขา", width: 92 },
        { key: "branchName", label: "ชื่อสาขา", width: 260 },
        { key: null, label: "เครื่องในสาขา", width: 96 },
        { key: null, label: "ทีมช่าง", width: 110 },
        { key: "slaHours", label: "สัญญาณหายมาแล้ว", width: 190 },
      ];
}

function OutageTable({
  rows,
  isMachines,
  sortKey,
  sortAsc,
  onSort,
}: {
  rows: OutageRow[];
  isMachines: boolean;
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (key: SortKey) => void;
}) {
  const columns = columnsFor(isMachines);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={styles.tableHeader}>
          {columns.map((column) => (
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
                      sortKey === column.key ? (sortAsc ? "arrow-up" : "arrow-down") : "swap-vertical"
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
          const gradeStyle = GRADE_STYLE[row.grade ?? "C"] ?? GRADE_STYLE.C;
          return (
            <View key={row.id} style={[styles.tableRow, row.breached && styles.tableRowBreached]}>
              <Text style={[styles.cellMono, { width: columns[0].width }]}>{row.branchCode}</Text>
              <Text style={[styles.cellText, { width: columns[1].width }]}>{row.branchName}</Text>
              {isMachines ? (
                <Text style={[styles.cellMono, { width: columns[2].width }]}>
                  {row.machineCode}
                </Text>
              ) : (
                <Text style={[styles.cellText, { width: columns[2].width }]}>
                  {row.machineCount ?? "—"}
                </Text>
              )}
              <View style={{ width: columns[3].width }}>
                <View style={styles.zoneChip}>
                  <Text style={styles.zoneChipText}>{row.zone ?? "—"}</Text>
                </View>
              </View>
              {isMachines ? (
                <View style={{ width: columns[4].width }}>
                  <View style={[styles.gradeChip, { backgroundColor: gradeStyle.background }]}>
                    <Text style={[styles.gradeChipText, { color: gradeStyle.color }]}>
                      {row.grade ?? "—"}
                    </Text>
                  </View>
                </View>
              ) : null}
              <View style={{ width: columns[columns.length - 1].width }}>
                <Text style={[styles.slaText, row.breached && styles.slaTextBreached]}>
                  {slaText(row.slaHours)}
                </Text>
                <Text style={styles.cellSub}>ตั้งแต่ {formatDateTime(row.startedAt)}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function OutageCard({ row, isMachines }: { row: OutageRow; isMachines: boolean }) {
  const gradeStyle = GRADE_STYLE[row.grade ?? "C"] ?? GRADE_STYLE.C;
  return (
    <View style={[styles.card, row.breached && styles.cardBreached]}>
      <View style={styles.cardTop}>
        <Text style={styles.cardBranch}>{row.branchName}</Text>
        {row.breached ? (
          <View style={styles.breachChip}>
            <Ionicons name="alert-circle" size={11} color="#92400e" />
            <Text style={styles.breachChipText}>เลย SLA</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardChips}>
        <View style={styles.zoneChip}>
          <Text style={styles.zoneChipText}>{row.branchCode}</Text>
        </View>
        {row.zone ? (
          <View style={styles.zoneChip}>
            <Text style={styles.zoneChipText}>{row.zone}</Text>
          </View>
        ) : null}
        {isMachines ? (
          <View style={styles.machineChip}>
            <Ionicons
              name={row.machineType === "DRYER" ? "flame-outline" : "water-outline"}
              size={12}
              color={colors.primary}
            />
            <Text style={styles.machineChipText}>{row.machineCode}</Text>
          </View>
        ) : (
          <View style={styles.machineChip}>
            <Ionicons name="hardware-chip-outline" size={12} color={colors.primary} />
            <Text style={styles.machineChipText}>{row.machineCount ?? "—"} เครื่อง</Text>
          </View>
        )}
        {row.grade ? (
          <View style={[styles.gradeChip, { backgroundColor: gradeStyle.background }]}>
            <Text style={[styles.gradeChipText, { color: gradeStyle.color }]}>{row.grade}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardBottom}>
        <Ionicons
          name="time-outline"
          size={14}
          color={row.breached ? "#92400e" : colors.textMuted}
        />
        <Text style={[styles.cardTime, row.breached && styles.cardTimeBreached]}>
          {isMachines ? "ดับมาแล้ว" : "สัญญาณหายมาแล้ว"} {slaText(row.slaHours)}
        </Text>
        <Text style={styles.cardTimeExact}>· ตั้งแต่ {formatDateTime(row.startedAt)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  // ตัวอักษรไทยมีสระบนและวรรณยุกต์ lineHeight ต้องสูงกว่า fontSize ชัดเจน
  updatedAt: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  importButtonText: { fontSize: 12, lineHeight: 20, color: colors.primary, fontWeight: "700" },

  mainTabs: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  mainTab: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  mainTabActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  mainTabText: { fontSize: 14, lineHeight: 23, fontWeight: "700", color: colors.textMuted },
  mainTabTextActive: { color: colors.primary },
  mainTabCount: {
    minWidth: 26,
    alignItems: "center",
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  mainTabCountActive: { backgroundColor: colors.primary },
  mainTabCountText: { fontSize: 11, lineHeight: 18, fontWeight: "700", color: colors.textMuted },
  mainTabCountTextActive: { color: "#fff" },

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
  affected: { fontSize: 12, lineHeight: 20, color: colors.textMuted, marginTop: spacing.sm },

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

  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
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
  chipWarning: { backgroundColor: colors.warningSoft, borderColor: "#fcd34d" },
  chipText: { fontSize: 13, lineHeight: 21, color: colors.textMuted, fontWeight: "600" },
  chipTextWarning: { color: "#92400e" },

  groupPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  groupLabel: { fontSize: 12, lineHeight: 20, color: colors.textFaint, marginRight: 2 },
  groupOption: { paddingVertical: 3, paddingHorizontal: spacing.sm, borderRadius: radius.pill },
  groupOptionActive: { backgroundColor: colors.primarySoft },
  groupOptionText: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  groupOptionTextActive: { color: colors.primary, fontWeight: "700" },

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

  loading: { paddingVertical: spacing.xxl, alignItems: "center" },

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
  tableRowBreached: { backgroundColor: colors.warningSoft },
  cellText: { fontSize: 13, lineHeight: 21, color: colors.text, paddingRight: spacing.sm },
  cellSub: { fontSize: 11, lineHeight: 18, color: colors.textFaint },
  cellMono: { fontSize: 12, lineHeight: 20, color: colors.textMuted, paddingRight: spacing.sm },
  slaText: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  slaTextBreached: { color: "#92400e" },

  cardList: { padding: spacing.md, gap: spacing.sm },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardBreached: { backgroundColor: colors.warningSoft, borderColor: "#fcd34d" },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardBranch: { flex: 1, fontSize: 14, lineHeight: 23, fontWeight: "700", color: colors.text },
  cardChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  cardTime: { fontSize: 13, lineHeight: 21, color: colors.textMuted, fontWeight: "600" },
  cardTimeBreached: { color: "#92400e" },
  cardTimeExact: { fontSize: 11, lineHeight: 20, color: colors.textFaint },

  breachChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#fde68a",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  breachChipText: { fontSize: 11, lineHeight: 18, color: "#92400e", fontWeight: "700" },

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

  footnote: { fontSize: 11, lineHeight: 20, color: colors.textFaint, marginTop: spacing.xl },
});
