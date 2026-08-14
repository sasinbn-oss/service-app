import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
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
  machineBrand?: string | null;
  machineCount?: number;
  startedAt: string;
  slaHours: number;
  breached: boolean;
  score: number;
  // สองค่านี้คนกรอกเอง ไฟล์ export ไม่มีให้
  symptom: string | null;
  workStatus: string | null;
  workStatusLabel: string | null;
  noteUpdatedAt: string | null;
  noteUpdatedBy: string | null;
  parts: NotePart[];
  /** วันที่ช่างนัดเข้า ใช้ตอนสถานะเป็นรอช่างเข้าแก้ไข — YYYY-MM-DD */
  scheduledVisitAt: string | null;
}

/** อะไหล่ที่เคสหนึ่งรออยู่ — มาจากรายการอะไหล่ในระบบ ไม่ใช่รหัสที่พิมพ์เอง */
interface NotePart {
  sparePartId: number;
  partCode: string;
  name: string;
  brand: string | null;
  quantity: number;
}

interface WorkStatusOption {
  value: string;
  label: string;
}

interface SparePartOption {
  id: number;
  partCode: string;
  name: string;
  brand: string | null;
}

/** สถานะที่ทำให้ช่องเพิ่มเติมโผล่ขึ้นมา */
const WAITING_PARTS = "WAITING_PARTS";
const WAITING_TECH = "WAITING_TECH";

interface RegionOption {
  region: string | null;
  label: string;
  cases: number;
  branches: number;
}

interface DashboardResponse {
  now: string;
  slaHours: number;
  /** คะแนนที่บวกให้ต่อหนึ่งวันของแท็บนี้ — เครื่องดับ 1 สัญญาณหาย 3 */
  scorePerDay: number;
  summary: {
    total: number;
    branchesAffected: number;
    COCO: number;
    DODO: number;
    breached: number;
    totalScore: number;
    machinesAffected?: number;
  };
  rows: OutageRow[];
}

type Tab = "machines" | "signal";
type SortKey = "slaHours" | "branchCode" | "branchName" | "machineCode" | "score";
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

/**
 * สีของสถานะ — ให้กวาดตาแล้วรู้ทันทีว่าเคสไหนติดอยู่ที่ใคร
 * ค่าที่ใช้ได้มาจาก WORK_STATUSES ฝั่ง backend ตรงนี้แค่ให้สีเท่านั้น
 */
const STATUS_STYLE: Record<string, { color: string; background: string }> = {
  WAITING_PARTS: { color: "#92400e", background: "#fef3c7" },
  WAITING_TECH: { color: "#1d4ed8", background: "#dbeafe" },
  WAITING_PAYMENT: { color: "#6d28d9", background: "#ede9fe" },
  WAITING_CUSTOMER: { color: "#a16207", background: "#fef9c3" },
  IN_PROGRESS: { color: "#047857", background: "#d1fae5" },
};

const NO_STATUS_STYLE = { color: colors.textFaint, background: colors.border };

function statusStyle(value: string | null) {
  return value ? STATUS_STYLE[value] ?? NO_STATUS_STYLE : NO_STATUS_STYLE;
}

/** ชั่วโมงล้วนอ่านยากเมื่อเลยไม่กี่วัน แปลงเป็น "3 วัน 4 ชม." */
function slaText(hours: number) {
  if (hours < 24) return `${hours} ชม.`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0 ? `${days} วัน` : `${days} วัน ${rest} ชม.`;
}

/** YYYY-MM-DD → "20 ส.ค. 69" อ่านง่ายกว่าและสั้นพอจะอยู่ในป้ายเล็กๆ ได้ */
function thaiDate(ymd: string | null) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${d} ${months[m - 1]} ${String((y + 543) % 100).padStart(2, "0")}`;
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
  // ภาคเป็นชั้นรองจากเจ้าของ เปลี่ยนเจ้าของแล้วภาคที่เลือกไว้อาจไม่มีอยู่แล้ว จึงล้างทิ้ง
  const [region, setRegion] = useState<string | null>(null);
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>([]);
  const [search, setSearch] = useState("");
  const [breachedOnly, setBreachedOnly] = useState(false);
  const [workStatus, setWorkStatus] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupKey>("region");
  const [sortKey, setSortKey] = useState<SortKey>("slaHours");
  const [sortAsc, setSortAsc] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [statusOptions, setStatusOptions] = useState<WorkStatusOption[]>([]);
  const [editing, setEditing] = useState<OutageRow | null>(null);

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
              ...(region ? { region } : {}),
              ...(search.trim() ? { search: search.trim() } : {}),
              ...(breachedOnly ? { breachedOnly: "true" } : {}),
              ...(workStatus ? { workStatus } : {}),
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
    [tab, ownership, region, search, breachedOnly, workStatus]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // รายการสถานะมาจาก backend เพื่อไม่ให้มีสองที่ที่ต้องแก้ตอนเพิ่มสถานะใหม่
  useEffect(() => {
    api
      .get<WorkStatusOption[]>("/machines/work-statuses")
      .then((res) => setStatusOptions(res.data))
      .catch(() => setStatusOptions([]));
  }, []);

  /**
   * รายชื่อภาคดึงแยกจากตาราง ไม่ได้อ่านจากแถวที่แสดงอยู่
   * ถ้าอ่านจากแถว พอเลือกภาคหนึ่งแล้วรายการจะเหลือภาคเดียว แล้วสลับไปภาคอื่นไม่ได้
   */
  useEffect(() => {
    api
      .get<RegionOption[]>("/machines/regions", {
        params: {
          kind: tab === "machines" ? "MACHINE_OFF" : "SIGNAL_LOST",
          ...(ownership !== "ทั้งหมด" ? { ownership } : {}),
        },
      })
      .then((res) => setRegionOptions(res.data))
      .catch(() => setRegionOptions([]));
  }, [tab, ownership]);

  function chooseOwnership(next: string) {
    if (next === ownership) return;
    setOwnership(next);
    setRegion(null);
  }

  /**
   * อัปเดตแถวในหน้าเลย ไม่ต้องโหลดใหม่ทั้งตารางเพราะแก้ทีละเคส
   * ถ้ากำลังกรองด้วยสถานะอยู่แล้วแถวนั้นเปลี่ยนไปไม่ตรงเงื่อนไข ให้หายออกจากรายการ
   */
  const applyNote = useCallback(
    (updated: OutageRow) => {
      const stillMatches =
        !workStatus ||
        (workStatus === "NONE" ? updated.workStatus === null : updated.workStatus === workStatus);

      setData((current) => {
        if (!current) return current;
        if (stillMatches) {
          return { ...current, rows: current.rows.map((r) => (r.id === updated.id ? updated : r)) };
        }
        // ตัวเลขสรุปด้านบนต้องลดตามด้วย ไม่งั้นหัวตารางกับจำนวนแถวจะไม่ตรงกัน
        const rows = current.rows.filter((r) => r.id !== updated.id);
        return {
          ...current,
          rows,
          summary: {
            ...current.summary,
            total: rows.length,
            COCO: rows.filter((r) => r.ownership === "COCO").length,
            DODO: rows.filter((r) => r.ownership === "DODO").length,
            breached: rows.filter((r) => r.breached).length,
          },
        };
      });
    },
    [workStatus]
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
      if (sortKey === "score") return (a.score - b.score) * direction;
      return String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")) * direction;
    };

    return order.sort().map((name) => {
      const rows = [...buckets.get(name)!].sort(compare);
      return {
        name,
        rows,
        breachedCount: rows.filter((r) => r.breached).length,
        score: rows.reduce((sum, r) => sum + r.score, 0),
      };
    });
  }, [data, groupBy, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === "slaHours" || key === "score" ? false : true);
    }
  }

  function switchTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    setData(null);
    setRegion(null);
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
          sub={isMachines ? `ใน ${data?.summary.branchesAffected ?? 0} สาขา` : undefined}
          color={isMachines ? colors.danger : colors.warning}
          icon={isMachines ? "power" : "wifi-outline"}
          wide={wide}
        />
        <SummaryCard
          label={`เลย SLA ${slaHours} ชม.`}
          value={data?.summary.breached ?? 0}
          color="#b45309"
          icon="alert-circle"
          wide={wide}
        />
        <SummaryCard
          label="คะแนนรวม"
          value={data?.summary.totalScore ?? 0}
          sub={`วันละ ${data?.scorePerDay ?? 1} ต่อรายการ`}
          color="#7c2d12"
          icon="speedometer"
          wide={wide}
        />
        <SummaryCard label="COCO" value={data?.summary.COCO ?? 0} color={colors.text} icon="business" wide={wide} />
        <SummaryCard label="DODO" value={data?.summary.DODO ?? 0} color={colors.text} icon="storefront" wide={wide} />
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
            onPress={() => chooseOwnership(option)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, ownership === option && styles.tabTextActive]}>
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ภาคอยู่ใต้เจ้าของเพราะเป็นชั้นรองลงมา เลือกเจ้าของก่อนแล้วค่อยเจาะเข้าภาค */}
      {regionOptions.length > 0 ? (
        <View style={styles.regionRow}>
          <Text style={styles.sortLabel}>ภาค</Text>
          <StatusFilterChip label="ทุกภาค" active={region === null} onPress={() => setRegion(null)} />
          {regionOptions.map((option) => (
            <StatusFilterChip
              key={option.label}
              label={`${option.label} ${option.cases}`}
              active={region === (option.region ?? "NONE")}
              onPress={() => {
                const value = option.region ?? "NONE";
                setRegion(region === value ? null : value);
              }}
            />
          ))}
        </View>
      ) : null}

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

      <View style={styles.statusFilterRow}>
        <Text style={styles.sortLabel}>สถานะ</Text>
        <StatusFilterChip
          label="ทั้งหมด"
          active={workStatus === null}
          onPress={() => setWorkStatus(null)}
        />
        <StatusFilterChip
          label="ยังไม่ระบุ"
          active={workStatus === "NONE"}
          onPress={() => setWorkStatus(workStatus === "NONE" ? null : "NONE")}
        />
        {statusOptions.map((option) => (
          <StatusFilterChip
            key={option.value}
            label={option.label}
            tone={STATUS_STYLE[option.value]}
            active={workStatus === option.value}
            onPress={() => setWorkStatus(workStatus === option.value ? null : option.value)}
          />
        ))}
      </View>

      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>เรียงตาม</Text>
        <SortButton label="SLA" active={sortKey === "slaHours"} asc={sortAsc} onPress={() => toggleSort("slaHours")} />
        <SortButton label="คะแนน" active={sortKey === "score"} asc={sortAsc} onPress={() => toggleSort("score")} />
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
            {group.score > 0 ? (
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreBadgeText}>{group.score} คะแนน</Text>
              </View>
            ) : null}
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
                onEdit={setEditing}
              />
            ) : (
              <View style={styles.cardList}>
                {group.rows.map((row) => (
                  <OutageCard
                    key={row.id}
                    row={row}
                    isMachines={isMachines}
                    onEdit={() => setEditing(row)}
                  />
                ))}
              </View>
            )
          ) : null}
        </View>
      ))}

      <Text style={styles.footnote}>
        SLA นับตั้งแต่ครั้งแรกที่เจอปัญหานี้ในไฟล์ที่อัปโหลด และหยุดนับเมื่อหายไปจากไฟล์
        · ความละเอียดของเวลาขึ้นกับรอบอัปโหลด (เช้า/บ่าย) · เกิน {slaHours} ชม. ถือว่าเลยกำหนด
        · แตะที่รายการเพื่อบันทึกอาการและสถานะการดำเนินการ
      </Text>

      <NoteModal
        row={editing}
        options={statusOptions}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          applyNote(updated);
          setEditing(null);
        }}
      />
    </ScrollView>
  );
}

/**
 * ฟอร์มกรอกอาการและสถานะของเคสหนึ่ง
 *
 * ผูกกับเคส ไม่ใช่กับเครื่อง เครื่องเดิมที่ดับรอบใหม่จึงเริ่มจากว่างเสมอ
 * ไม่มีอาการของรอบก่อนติดมา
 */
function NoteModal({
  row,
  options,
  onClose,
  onSaved,
}: {
  row: OutageRow | null;
  options: WorkStatusOption[];
  onClose: () => void;
  onSaved: (row: OutageRow) => void;
}) {
  const [symptom, setSymptom] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [parts, setParts] = useState<NotePart[]>([]);
  const [visitDate, setVisitDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // เปิดเคสไหนก็ตั้งค่าเริ่มต้นจากเคสนั้น ไม่ใช่ค่าที่ค้างจากเคสก่อนหน้า
  useEffect(() => {
    setSymptom(row?.symptom ?? "");
    setStatus(row?.workStatus ?? null);
    setParts(row?.parts ?? []);
    setVisitDate(row?.scheduledVisitAt ?? "");
    setError(null);
  }, [row]);

  if (!row) return null;

  async function save() {
    if (!row) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.patch<{
        symptom: string | null;
        workStatus: string | null;
        workStatusLabel: string | null;
        noteUpdatedAt: string | null;
        noteUpdatedBy: string | null;
        parts: NotePart[];
        scheduledVisitAt: string | null;
      }>(`/machines/outages/${row.id}/note`, {
        symptom: symptom.trim() || null,
        workStatus: status,
        parts: parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
        scheduledVisitAt: visitDate.trim() || null,
      });
      onSaved({ ...row, ...res.data });
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        {/* กันไม่ให้การแตะในกล่องทะลุไปปิด modal */}
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{row.branchName}</Text>
            <Text style={styles.modalSub}>
              {row.branchCode}
              {row.machineCode ? ` · เครื่อง ${row.machineCode}` : ""}
              {row.machineBrand ? ` · ${row.machineBrand}` : ""}
              {` · ดับมาแล้ว ${slaText(row.slaHours)}`}
            </Text>

            <Text style={styles.modalLabel}>อาการที่พบ</Text>
            <TextInput
              style={styles.modalInput}
              value={symptom}
              onChangeText={setSymptom}
              placeholder="เช่น ปั๊มน้ำไม่ทำงาน / บอร์ดควบคุมเสีย"
              placeholderTextColor={colors.textFaint}
              multiline
              maxLength={500}
            />

            <Text style={styles.modalLabel}>สถานะการดำเนินการ</Text>
            <View style={styles.modalOptions}>
              {options.map((option) => {
                const active = status === option.value;
                const tone = statusStyle(option.value);
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.modalOption,
                      active && { backgroundColor: tone.background, borderColor: tone.color },
                    ]}
                    onPress={() => setStatus(active ? null : option.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modalOptionText, active && { color: tone.color }]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.modalHint}>แตะสถานะที่เลือกอยู่อีกครั้งเพื่อล้างค่า</Text>

            {/* ช่องอะไหล่โผล่เมื่อเลือก "รออะไหล่" และยังโผล่อยู่ถ้าเคยใส่ไว้แล้ว
                เปลี่ยนสถานะแล้วของที่กรอกไว้จะได้ไม่หายไปเงียบๆ */}
            {status === WAITING_PARTS || parts.length > 0 ? (
              <PartPicker parts={parts} onChange={setParts} />
            ) : null}

            {status === WAITING_TECH || visitDate ? (
              <VisitDateField value={visitDate} onChange={setVisitDate} />
            ) : null}

            {row.noteUpdatedBy ? (
              <Text style={styles.modalHint}>
                แก้ไขล่าสุดโดย {row.noteUpdatedBy} เมื่อ {formatDateTime(row.noteUpdatedAt)} น.
              </Text>
            ) : null}

            {error ? <Text style={styles.modalError}>{error}</Text> : null}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, saving && styles.modalSaveDisabled]}
                onPress={save}
                disabled={saving}
                activeOpacity={0.7}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>บันทึก</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * เลือกอะไหล่ที่เคสนี้รออยู่ จากรายการอะไหล่ในระบบ
 *
 * ไม่ให้พิมพ์รหัสเอง เพราะรหัสที่พิมพ์มือจะสะกดไม่ตรงกัน แล้วสรุปยอดว่า
 * ทั้งประเทศค้างอะไหล่ตัวไหนอยู่กี่ตัวไม่ได้
 */
function PartPicker({
  parts,
  onChange,
}: {
  parts: NotePart[];
  onChange: (next: NotePart[]) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SparePartOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // หน่วงไว้ก่อนยิง ไม่งั้นพิมพ์รหัสเดียวยิงไปสิบครั้ง
  useEffect(() => {
    const keyword = term.trim();
    if (!keyword) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .get<SparePartOption[]>("/spare-parts", { params: { search: keyword } })
        .then((res) => setResults(res.data.slice(0, 8)))
        .catch(() => setResults([]))
        .finally(() => {
          setSearching(false);
          setSearched(true);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [term]);

  function add(option: SparePartOption) {
    setTerm("");
    // เลือกตัวที่มีอยู่แล้วให้บวกจำนวน ไม่ใช่เพิ่มแถวซ้ำ
    const existing = parts.find((p) => p.sparePartId === option.id);
    if (existing) {
      onChange(
        parts.map((p) => (p.sparePartId === option.id ? { ...p, quantity: p.quantity + 1 } : p))
      );
      return;
    }
    onChange([
      ...parts,
      {
        sparePartId: option.id,
        partCode: option.partCode,
        name: option.name,
        brand: option.brand,
        quantity: 1,
      },
    ]);
  }

  function setQuantity(sparePartId: number, text: string) {
    const digits = text.replace(/[^0-9]/g, "");
    // ปล่อยให้ว่างระหว่างพิมพ์ได้ ค่อยตีเป็น 1 ตอนบันทึก
    const value = digits === "" ? 1 : Math.min(999, Math.max(1, Number(digits)));
    onChange(parts.map((p) => (p.sparePartId === sparePartId ? { ...p, quantity: value } : p)));
  }

  return (
    <View style={styles.picker}>
      <Text style={styles.modalLabel}>อะไหล่ที่รอ</Text>

      {parts.length > 0 ? (
        <View style={styles.pickedList}>
          {parts.map((part) => (
            <View key={part.sparePartId} style={styles.picked}>
              <View style={styles.pickedText}>
                <Text style={styles.pickedCode}>{part.partCode}</Text>
                <Text style={styles.pickedName}>{part.name}</Text>
              </View>
              <TextInput
                style={styles.qtyInput}
                value={String(part.quantity)}
                onChangeText={(t) => setQuantity(part.sparePartId, t)}
                keyboardType="number-pad"
                maxLength={3}
                accessibilityLabel={`จำนวน ${part.partCode}`}
              />
              <Text style={styles.qtyUnit}>ตัว</Text>
              <TouchableOpacity
                onPress={() => onChange(parts.filter((p) => p.sparePartId !== part.sparePartId))}
                accessibilityLabel={`เอา ${part.partCode} ออก`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={20} color={colors.textFaint} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.pickerSearch}>
        <Ionicons name="search" size={15} color={colors.textFaint} />
        <TextInput
          style={styles.pickerInput}
          value={term}
          onChangeText={setTerm}
          placeholder="ค้นหารหัสหรือชื่ออะไหล่"
          placeholderTextColor={colors.textFaint}
        />
        {searching ? <ActivityIndicator size="small" color={colors.textFaint} /> : null}
      </View>

      {results.length > 0 ? (
        <View style={styles.pickerResults}>
          {results.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={styles.pickerResult}
              onPress={() => add(option)}
              activeOpacity={0.7}
            >
              <Text style={styles.pickedCode}>{option.partCode}</Text>
              <Text style={styles.pickerResultName} numberOfLines={1}>
                {option.name}
              </Text>
              <Ionicons name="add-circle-outline" size={17} color={colors.primary} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {searched && !searching && results.length === 0 ? (
        <Text style={styles.modalHint}>
          ไม่พบอะไหล่ที่ตรงกับ “{term.trim()}” — เพิ่มรายการใหม่ได้ที่เมนูรายการอะไหล่ (แอดมิน)
          หรือพิมพ์ไว้ในช่องอาการไปก่อน
        </Text>
      ) : null}
    </View>
  );
}

/**
 * วันที่ช่างนัดเข้าไปแก้
 *
 * รับเป็น YYYY-MM-DD แบบเดียวกับหน้าบันทึกงาน จะได้ไม่ต้องพึ่ง date picker
 * ซึ่งหน้าตาไม่เหมือนกันระหว่างเว็บกับมือถือ ปุ่มลัดช่วยให้เคสส่วนใหญ่กดครั้งเดียวจบ
 */
function VisitDateField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  function shift(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    onChange(d.toISOString().slice(0, 10));
  }

  const valid = value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value);

  return (
    <View style={styles.picker}>
      <Text style={styles.modalLabel}>วันที่ช่างจะเข้า</Text>
      <View style={styles.visitRow}>
        <TextInput
          style={[styles.visitInput, !valid && styles.visitInputBad]}
          value={value}
          onChangeText={onChange}
          placeholder="2026-08-20"
          placeholderTextColor={colors.textFaint}
          maxLength={10}
          accessibilityLabel="วันที่ช่างจะเข้า"
        />
        {value ? (
          <TouchableOpacity onPress={() => onChange("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={20} color={colors.textFaint} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.modalOptions}>
        <TouchableOpacity style={styles.modalOption} onPress={() => shift(0)} activeOpacity={0.7}>
          <Text style={styles.modalOptionText}>วันนี้</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.modalOption} onPress={() => shift(1)} activeOpacity={0.7}>
          <Text style={styles.modalOptionText}>พรุ่งนี้</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.modalOption} onPress={() => shift(7)} activeOpacity={0.7}>
          <Text style={styles.modalOptionText}>อีก 7 วัน</Text>
        </TouchableOpacity>
      </View>
      {!valid ? (
        <Text style={styles.modalError}>รูปแบบวันที่ต้องเป็น ปี-เดือน-วัน เช่น 2026-08-20</Text>
      ) : (
        <Text style={styles.modalHint}>{value ? thaiDate(value) : "เว้นว่างได้ถ้ายังไม่ได้นัด"}</Text>
      )}
    </View>
  );
}

function StatusFilterChip({
  label,
  active,
  tone,
  onPress,
}: {
  label: string;
  active: boolean;
  tone?: { color: string; background: string };
  onPress: () => void;
}) {
  const style = tone ?? NO_STATUS_STYLE;
  return (
    <TouchableOpacity
      style={[
        styles.statusFilterChip,
        active && { backgroundColor: style.background, borderColor: style.color },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.statusFilterChipText, active && { color: style.color, fontWeight: "700" }]}>
        {label}
      </Text>
    </TouchableOpacity>
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
  sub,
  color,
  icon,
  wide,
}: {
  label: string;
  value: number;
  sub?: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  wide: boolean;
}) {
  return (
    <View style={[styles.summaryCard, wide ? styles.summaryCardWide : styles.summaryCardNarrow]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={[styles.summaryValue, { color }]}>{value}</Text>
        {sub ? <Text style={styles.summarySub}>{sub}</Text> : null}
      </View>
      <Ionicons name={icon} size={24} color={color} style={{ opacity: 0.35 }} />
    </View>
  );
}

/** ช่องที่ตารางแสดงได้ — เรียงตามนี้ทั้งหัวตารางและตัวแถว จึงไม่มีทางหลุดคนละลำดับ */
type ColumnId =
  | "branchCode"
  | "branchName"
  | "machineCode"
  | "brand"
  | "machineCount"
  | "zone"
  | "grade"
  | "sla"
  | "score";

interface Column {
  id: ColumnId;
  /** ใส่เมื่อคอลัมน์นั้นกดเรียงได้ */
  key?: SortKey;
  label: string;
  width: number;
}

/**
 * ความกว้างรวมต้องพอดีกับความกว้างของหน้า ไม่งั้นคอลัมน์ท้ายจะหลุดออกไปนอกจอ
 * และต้องเลื่อนตารางไปทางขวาถึงจะเห็น ซึ่งคนใช้จริงจะไม่รู้ว่ามีคอลัมน์นั้นอยู่
 * อาการกับสถานะจึงไม่ได้เป็นคอลัมน์ แต่ไปอยู่บรรทัดที่สองของแถวแทน
 */
function columnsFor(isMachines: boolean): Column[] {
  return isMachines
    ? [
        { id: "branchCode", key: "branchCode", label: "รหัสสาขา", width: 80 },
        { id: "branchName", key: "branchName", label: "ชื่อสาขา", width: 170 },
        { id: "machineCode", key: "machineCode", label: "เครื่อง", width: 70 },
        { id: "brand", label: "ยี่ห้อเครื่อง", width: 100 },
        { id: "zone", label: "ทีมช่าง", width: 92 },
        { id: "grade", label: "Grade", width: 52 },
        { id: "sla", key: "slaHours", label: "ดับมาแล้ว", width: 150 },
        { id: "score", key: "score", label: "คะแนน", width: 66 },
      ]
    : [
        { id: "branchCode", key: "branchCode", label: "รหัสสาขา", width: 84 },
        { id: "branchName", key: "branchName", label: "ชื่อสาขา", width: 228 },
        { id: "machineCount", label: "เครื่องในสาขา", width: 96 },
        { id: "zone", label: "ทีมช่าง", width: 104 },
        { id: "sla", key: "slaHours", label: "สัญญาณหายมาแล้ว", width: 172 },
        { id: "score", key: "score", label: "คะแนน", width: 66 },
      ];
}

function OutageTable({
  rows,
  isMachines,
  sortKey,
  sortAsc,
  onSort,
  onEdit,
}: {
  rows: OutageRow[];
  isMachines: boolean;
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (key: SortKey) => void;
  onEdit: (row: OutageRow) => void;
}) {
  const columns = columnsFor(isMachines);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={styles.tableHeader}>
          {columns.map((column) => (
            <TouchableOpacity
              key={column.id}
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

        {rows.map((row) => (
          <TouchableOpacity
            key={row.id}
            style={[styles.tableRow, row.breached && styles.tableRowBreached]}
            onPress={() => onEdit(row)}
            activeOpacity={0.6}
          >
            <View style={styles.tableRowMain}>
              {columns.map((column) => (
                <View key={column.id} style={{ width: column.width }}>
                  <TableCell column={column.id} row={row} />
                </View>
              ))}
            </View>
            {/* แถวที่ยังไม่มีใครกรอกไม่ขึ้นบรรทัดนี้ ตารางจะได้ไม่ยาวเป็นสองเท่าโดยเปล่าประโยชน์ */}
            {row.workStatusLabel || row.symptom || row.parts.length > 0 || row.scheduledVisitAt ? (
              <View style={[styles.tableRowNote, { paddingLeft: columns[0].width }]}>
                <NoteLine row={row} />
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

function TableCell({ column, row }: { column: ColumnId; row: OutageRow }) {
  switch (column) {
    case "branchCode":
      return <Text style={styles.cellMono}>{row.branchCode}</Text>;
    case "branchName":
      return <Text style={styles.cellText}>{row.branchName}</Text>;
    case "machineCode":
      return <Text style={styles.cellMono}>{row.machineCode}</Text>;
    case "brand":
      return <Text style={styles.cellText}>{row.machineBrand || "—"}</Text>;
    case "machineCount":
      return <Text style={styles.cellText}>{row.machineCount ?? "—"}</Text>;
    case "zone":
      return (
        <View style={styles.zoneChip}>
          <Text style={styles.zoneChipText}>{row.zone ?? "—"}</Text>
        </View>
      );
    case "grade": {
      const gradeStyle = GRADE_STYLE[row.grade ?? "C"] ?? GRADE_STYLE.C;
      return (
        <View style={[styles.gradeChip, { backgroundColor: gradeStyle.background }]}>
          <Text style={[styles.gradeChipText, { color: gradeStyle.color }]}>{row.grade ?? "—"}</Text>
        </View>
      );
    }
    case "sla":
      return (
        <>
          <Text style={[styles.slaText, row.breached && styles.slaTextBreached]}>
            {slaText(row.slaHours)}
          </Text>
          <Text style={styles.cellSub}>ตั้งแต่ {formatDateTime(row.startedAt)}</Text>
        </>
      );
    case "score":
      return <Text style={styles.scoreCell}>{row.score}</Text>;
  }
}

/** ป้ายสถานะ อะไหล่ที่รอ และอาการที่คนกรอกไว้ ใช้ทั้งบรรทัดที่สองของตารางและในการ์ด */
function NoteLine({ row }: { row: OutageRow }) {
  const tone = statusStyle(row.workStatus);
  return (
    <>
      {row.workStatusLabel ? (
        <View style={[styles.statusChip, { backgroundColor: tone.background }]}>
          <Text style={[styles.statusChipText, { color: tone.color }]}>{row.workStatusLabel}</Text>
        </View>
      ) : null}
      {row.parts.map((part) => (
        <View key={part.sparePartId} style={styles.partChip}>
          <Ionicons name="cube-outline" size={11} color={colors.textMuted} />
          <Text style={styles.partChipText}>
            {part.partCode}
            {part.quantity > 1 ? ` ×${part.quantity}` : ""}
          </Text>
        </View>
      ))}
      {row.scheduledVisitAt ? (
        <View style={styles.visitChip}>
          <Ionicons name="calendar-outline" size={11} color="#1d4ed8" />
          <Text style={styles.visitChipText}>นัด {thaiDate(row.scheduledVisitAt)}</Text>
        </View>
      ) : null}
      {row.symptom ? <Text style={styles.noteSymptom}>{row.symptom}</Text> : null}
    </>
  );
}

function OutageCard({
  row,
  isMachines,
  onEdit,
}: {
  row: OutageRow;
  isMachines: boolean;
  onEdit: () => void;
}) {
  const gradeStyle = GRADE_STYLE[row.grade ?? "C"] ?? GRADE_STYLE.C;
  return (
    <TouchableOpacity
      style={[styles.card, row.breached && styles.cardBreached]}
      onPress={onEdit}
      activeOpacity={0.7}
    >
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
        {isMachines && row.machineBrand ? (
          <View style={styles.brandChip}>
            <Text style={styles.brandChipText}>{row.machineBrand}</Text>
          </View>
        ) : null}
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
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreBadgeText}>{row.score} คะแนน</Text>
        </View>
      </View>

      <View style={styles.cardNote}>
        {row.workStatusLabel || row.symptom || row.parts.length > 0 || row.scheduledVisitAt ? (
          <NoteLine row={row} />
        ) : (
          <View style={styles.notePlaceholder}>
            <Ionicons name="create-outline" size={12} color={colors.textFaint} />
            <Text style={styles.notePlaceholderText}>ยังไม่ระบุสถานะ · แตะเพื่อกรอก</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
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
  summarySub: { fontSize: 11, lineHeight: 18, color: colors.textFaint },
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

  statusFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  statusFilterChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.md,
  },
  statusFilterChipText: { fontSize: 12, lineHeight: 20, color: colors.textMuted },

  regionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
  },

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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // ช่อง SLA มีสองบรรทัด ชิดบนอ่านง่ายกว่าจัดกึ่งกลาง
  tableRowMain: { flexDirection: "row", alignItems: "flex-start" },
  tableRowNote: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: 4,
  },
  tableRowBreached: { backgroundColor: colors.warningSoft },
  cellText: { fontSize: 13, lineHeight: 21, color: colors.text, paddingRight: spacing.sm },
  cellSub: { fontSize: 11, lineHeight: 18, color: colors.textFaint },
  cellMono: { fontSize: 12, lineHeight: 20, color: colors.textMuted, paddingRight: spacing.sm },
  slaText: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  scoreCell: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: "700",
    color: "#7c2d12",
    textAlign: "right",
    paddingRight: spacing.sm,
  },
  scoreBadge: {
    backgroundColor: "#fdf0e6",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  scoreBadgeText: { fontSize: 11, lineHeight: 18, color: "#7c2d12", fontWeight: "700" },
  visitChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#dbeafe",
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  visitChipText: { fontSize: 11, lineHeight: 18, color: "#1d4ed8", fontWeight: "700" },
  visitRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  visitInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  visitInputBad: { borderColor: colors.danger },
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
  brandChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  brandChipText: { fontSize: 11, lineHeight: 18, color: colors.textMuted },
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

  // อาการยาวกว่าป้าย ให้กินที่เหลือ แต่ถ้าแคบเกินก็ตกไปบรรทัดใหม่ทั้งก้อน
  noteSymptom: { flexGrow: 1, flexShrink: 1, flexBasis: 160, fontSize: 12, lineHeight: 20, color: colors.textMuted },
  partChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  partChipText: {
    fontSize: 11,
    lineHeight: 18,
    color: colors.textMuted,
    fontWeight: "700",
  },
  notePlaceholder: { flexDirection: "row", alignItems: "center", gap: 3 },
  notePlaceholderText: { fontSize: 11, lineHeight: 18, color: colors.textFaint },
  statusChip: {
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 1,
    alignSelf: "flex-start",
  },
  statusChipText: { fontSize: 11, lineHeight: 18, fontWeight: "700" },
  cardNote: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  modalSheet: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "85%",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  modalTitle: { fontSize: 16, lineHeight: 26, fontWeight: "700", color: colors.text },
  modalSub: { fontSize: 12, lineHeight: 20, color: colors.textMuted, marginTop: 2 },
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
    minHeight: 76,
    color: colors.text,
    textAlignVertical: "top",
  },
  modalOptions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  modalOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  modalOptionText: { fontSize: 13, lineHeight: 21, color: colors.textMuted, fontWeight: "600" },
  modalHint: { fontSize: 11, lineHeight: 19, color: colors.textFaint, marginTop: spacing.xs },

  picker: { gap: spacing.xs },
  pickedList: { gap: spacing.xs },
  picked: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  pickedText: { flex: 1, minWidth: 0 },
  pickedCode: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  pickedName: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  qtyInput: {
    width: 52,
    textAlign: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    paddingVertical: spacing.xs,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  qtyUnit: { fontSize: 12, lineHeight: 20, color: colors.textFaint },
  pickerSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  pickerInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  pickerResults: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  pickerResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerResultName: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.textMuted },
  modalError: { fontSize: 13, lineHeight: 21, color: colors.danger, marginTop: spacing.sm },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  modalCancel: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
  },
  modalCancelText: { fontSize: 14, lineHeight: 22, color: colors.textMuted, fontWeight: "600" },
  modalSave: {
    minWidth: 108,
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
  },
  modalSaveDisabled: { opacity: 0.6 },
  modalSaveText: { fontSize: 14, lineHeight: 22, color: "#fff", fontWeight: "700" },
});
