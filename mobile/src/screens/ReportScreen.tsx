import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { useWideLayout } from "../components/AppShell";
import { openUrl } from "../utils/share";
import { showAlert } from "../utils/alert";
import { HomeStackParamList } from "../navigation/types";
import { colors, radius, shadow, spacing } from "../theme";

type Props = NativeStackScreenProps<HomeStackParamList, "Report">;

/* ─────────── รูปร่างข้อมูลของรายงานแต่ละใบ ─────────── */

interface ReportRow {
  id: number;
  kind: string;
  branchCode: string;
  branchName: string;
  region: string | null;
  zone: string | null;
  machineCode: string | null;
  machineBrand: string | null;
  days: number;
  score: number;
  breached: boolean;
  workStatusLabel: string | null;
  symptom: string | null;
  scheduledVisitAt: string | null;
  parts: string | null;
}

interface Section {
  key: string;
  title: string;
  hint?: string;
  rows: ReportRow[];
}

interface GroupStat {
  label: string;
  score: number;
  cases: number;
  branches: number;
  breached: number;
  noStatus: number;
  overdueVisit: number;
}

interface AnyReport {
  kind: "daily" | "weekly" | "monthly" | "parts";
  title: string;
  generatedAt: string;
  summary: Record<string, number | string | null>;
  // daily
  date?: string;
  scope?: string;
  sections?: Section[];
  // weekly
  byRegion?: GroupStat[] | { label: string; closed: number; avgDays: number; withinSlaPercent: number }[];
  byZone?: GroupStat[];
  byOwnership?: GroupStat[];
  // monthly
  hasHistory?: boolean;
  periodDays?: number;
  repeatBranches?: { code: string; name: string; region: string | null; times: number }[];
  repeatMachines?: { branchCode: string; branchName: string; machineCode: string; brand: string | null; times: number }[];
  trend?: { at: string; machineOff: number; signalLost: number; total: number }[];
  // parts
  parts?: {
    partCode: string;
    name: string;
    brand: string | null;
    quantity: number;
    cases: number;
    oldestDays: number;
    branches: string[];
  }[];
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function thaiDate(ymd: string | null) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${d} ${months[m - 1]} ${String((y + 543) % 100).padStart(2, "0")}`;
}

/** ป้ายกำกับภาษาไทยของตัวเลขสรุป — key ตรงกับที่ backend ส่งมา */
const SUMMARY_LABELS: Record<string, string> = {
  openTotal: "เคสค้างทั้งหมด",
  score: "คะแนนสะสม",
  actionable: "ช่างลงมือได้",
  waitingCustomer: "รอฝั่งลูกค้า",
  branches: "สาขาที่มีปัญหา",
  breached: "เลย SLA",
  noStatus: "ยังไม่มีใครระบุสถานะ",
  openedThisWeek: "เปิดใหม่ 7 วัน",
  closedThisWeek: "ปิดได้ 7 วัน",
  previousScore: "คะแนนรอบเทียบ",
  closed: "เคสที่ปิดแล้ว",
  withinSlaPercent: "ปิดทัน SLA (%)",
  avgDays: "เฉลี่ยที่ใช้ซ่อม (วัน)",
  distinctParts: "ชนิดอะไหล่",
  totalQuantity: "จำนวนรวมที่ต้องใช้",
  cases: "เคสที่รออยู่",
};

const HIDDEN_SUMMARY = new Set(["slaHours", "previousAt", "withinSla"]);

export default function ReportScreen({ route }: Props) {
  useWideLayout();
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  const { kind } = route.params;

  const [data, setData] = useState<AnyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(
    async (opts: { refresh?: boolean } = {}) => {
      if (opts.refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await api.get<AnyReport>(`/machines/reports/${kind}`);
        setData(res.data);
      } catch (e) {
        setError(apiErrorMessage(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [kind]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function download() {
    setDownloading(true);
    try {
      const res = await api.get<{ filename: string; path: string }>(
        `/machines/reports/${kind}`,
        { params: { format: "xlsx" } }
      );
      const url = resolveImageUrl(res.data.path);
      if (url) await openUrl(url);
    } catch (e) {
      showAlert("ดาวน์โหลดไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ refresh: true })} />}
    >
      <View style={styles.topRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {data ? <Text style={styles.title}>{data.title}</Text> : null}
          {data ? (
            <Text style={styles.generated}>
              ข้อมูล ณ {formatDateTime(data.generatedAt)} น.
              {data.scope ? ` · ${data.scope}` : ""}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.downloadButton, downloading && styles.downloadButtonBusy]}
          onPress={download}
          disabled={downloading || !data}
          activeOpacity={0.7}
        >
          {downloading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="download-outline" size={16} color={colors.primary} />
          )}
          <Text style={styles.downloadText}>ดาวน์โหลด Excel</Text>
        </TouchableOpacity>
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

      {data?.kind === "monthly" && data.hasHistory === false ? (
        <View style={styles.warnCard}>
          <Ionicons name="information-circle-outline" size={18} color="#a35a06" />
          <Text style={styles.warnText}>
            ยังไม่มีเคสที่ปิดแล้วในช่วงนี้ ตัวเลขด้านล่างจึงยังคำนวณไม่ได้ —
            ไม่ได้แปลว่าไม่มีปัญหา แต่แปลว่ายังไม่มีข้อมูล ต้องอัปโหลดสะสมอีกสักพัก
          </Text>
        </View>
      ) : null}

      {data ? <SummaryGrid summary={data.summary} wide={wide} /> : null}

      {data?.sections?.map((section) => (
        <SectionBlock key={section.key} section={section} wide={wide} />
      ))}

      {data?.kind === "weekly" ? (
        <>
          <GroupTable title="แยกตามภาค" rows={data.byRegion as GroupStat[]} />
          <GroupTable title="แยกตามทีมช่าง" rows={data.byZone ?? []} />
          <GroupTable title="แยกตามเจ้าของ" rows={data.byOwnership ?? []} />
        </>
      ) : null}

      {data?.kind === "monthly" ? (
        <>
          <SimpleTable
            title="เวลาเฉลี่ยที่ใช้ซ่อม แยกตามภาค"
            headers={["ภาค", "เคสที่ปิด", "เฉลี่ย (วัน)", "ปิดทัน SLA"]}
            rows={(data.byRegion as { label: string; closed: number; avgDays: number; withinSlaPercent: number }[] ?? []).map(
              (g) => [g.label, String(g.closed), String(g.avgDays), `${g.withinSlaPercent}%`]
            )}
            empty="ยังไม่มีเคสที่ปิดแล้ว"
          />
          <SimpleTable
            title="สาขาที่เสียซ้ำ (90 วัน)"
            headers={["รหัส", "ชื่อสาขา", "ภาค", "ครั้ง"]}
            rows={(data.repeatBranches ?? []).map((b) => [b.code, b.name, b.region ?? "—", String(b.times)])}
            empty="ยังไม่มีสาขาที่เสียซ้ำเกินหนึ่งครั้ง"
          />
          <SimpleTable
            title="เครื่องที่เสียซ้ำ (180 วัน) — ควรพิจารณาเปลี่ยนแทนซ่อม"
            headers={["สาขา", "เครื่อง", "ยี่ห้อ", "ครั้ง"]}
            rows={(data.repeatMachines ?? []).map((m) => [
              `${m.branchCode} ${m.branchName}`, m.machineCode, m.brand ?? "—", String(m.times),
            ])}
            empty="ยังไม่มีเครื่องที่เสียซ้ำเกินหนึ่งครั้ง"
          />
          <SimpleTable
            title="คะแนนย้อนหลังรายรอบอัปโหลด"
            headers={["เวลา", "เครื่องดับ", "สัญญาณหาย", "รวม"]}
            rows={(data.trend ?? []).map((t) => [
              formatDateTime(t.at), String(t.machineOff), String(t.signalLost), String(t.total),
            ])}
            empty="ยังไม่มีรอบอัปโหลดที่เก็บคะแนนไว้"
          />
        </>
      ) : null}

      {data?.kind === "parts" ? (
        <SimpleTable
          title="อะไหล่ที่มีเคสรออยู่"
          headers={["รหัส", "ชื่ออะไหล่", "ต้องใช้", "เคส", "รอนานสุด", "สาขาที่รอ"]}
          rows={(data.parts ?? []).map((p) => [
            p.partCode, p.name, String(p.quantity), String(p.cases), `${p.oldestDays} วัน`,
            p.branches.slice(0, 4).join(" ") + (p.branches.length > 4 ? ` +${p.branches.length - 4}` : ""),
          ])}
          empty="ยังไม่มีเคสไหนระบุว่ารออะไหล่ตัวไหน — เลือกสถานะ “รออะไหล่” ในแดชบอร์ดแล้วใส่รหัสอะไหล่"
        />
      ) : null}
    </ScrollView>
  );
}

function SummaryGrid({ summary, wide }: { summary: AnyReport["summary"]; wide: boolean }) {
  const entries = Object.entries(summary).filter(([k]) => !HIDDEN_SUMMARY.has(k));
  return (
    <View style={styles.summaryRow}>
      {entries.map(([key, value]) => (
        <View key={key} style={[styles.summaryCard, wide ? styles.summaryWide : styles.summaryNarrow]}>
          <Text style={styles.summaryLabel}>{SUMMARY_LABELS[key] ?? key}</Text>
          <Text style={styles.summaryValue}>
            {value === null ? "—" : typeof value === "number" ? value.toLocaleString() : value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * แสดงบนจอไม่เกินเท่านี้ต่อหมวด
 *
 * ใบงานรายวันต้องอ่านจบได้ ถ้าหมวดหนึ่งมีสองร้อยรายการแล้วโชว์หมด มันไม่ใช่ใบงานแล้ว
 * ตัวเลขจริงยังอยู่ที่หัวหมวด และรายการครบอยู่ในไฟล์ Excel
 */
const MAX_ROWS_ON_SCREEN = 25;

function SectionBlock({ section, wide }: { section: Section; wide: boolean }) {
  const [collapsed, setCollapsed] = useState(section.rows.length === 0);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? section.rows : section.rows.slice(0, MAX_ROWS_ON_SCREEN);
  const hidden = section.rows.length - shown.length;
  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
      >
        <Ionicons name={collapsed ? "chevron-forward" : "chevron-down"} size={18} color={colors.text} />
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{section.rows.length}</Text>
        </View>
      </TouchableOpacity>
      {section.hint ? <Text style={styles.hint}>{section.hint}</Text> : null}

      {!collapsed ? (
        section.rows.length === 0 ? (
          <Text style={styles.emptyRow}>ไม่มีรายการ</Text>
        ) : (
          <View style={styles.rowList}>
            {shown.map((row) => (
              <View key={row.id} style={[styles.row, row.breached && styles.rowBreached]}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowCode}>{row.branchCode}</Text>
                  <Text style={styles.rowName} numberOfLines={wide ? undefined : 2}>
                    {row.branchName}
                    {row.machineCode ? ` · ${row.machineCode}` : ""}
                    {row.machineBrand ? ` · ${row.machineBrand}` : ""}
                  </Text>
                  <Text style={[styles.rowDays, row.breached && styles.rowDaysBreached]}>
                    {row.days} วัน
                  </Text>
                </View>
                <View style={styles.rowChips}>
                  {row.zone ? <Chip text={row.zone} /> : null}
                  {row.workStatusLabel ? <Chip text={row.workStatusLabel} tone="#1d4ed8" /> : null}
                  {row.parts ? <Chip text={row.parts} /> : null}
                  {row.scheduledVisitAt ? <Chip text={`นัด ${thaiDate(row.scheduledVisitAt)}`} tone="#1d4ed8" /> : null}
                  <Chip text={`${row.score} คะแนน`} tone="#7c2d12" />
                </View>
                {row.symptom ? <Text style={styles.rowSymptom}>{row.symptom}</Text> : null}
              </View>
            ))}
            {hidden > 0 ? (
              <TouchableOpacity style={styles.moreButton} onPress={() => setShowAll(true)} activeOpacity={0.7}>
                <Text style={styles.moreText}>
                  ดูอีก {hidden.toLocaleString()} รายการ · หรือโหลด Excel ที่มีครบทุกแถว
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )
      ) : null}
    </View>
  );
}

function Chip({ text, tone }: { text: string; tone?: string }) {
  return (
    <View style={styles.chip}>
      <Text style={[styles.chipText, tone ? { color: tone } : null]}>{text}</Text>
    </View>
  );
}

function GroupTable({ title, rows }: { title: string; rows: GroupStat[] }) {
  return (
    <SimpleTable
      title={title}
      headers={["กลุ่ม", "คะแนน", "เคส", "สาขา", "เลย SLA", "ไม่มีสถานะ"]}
      rows={rows.map((g) => [
        g.label, String(g.score), String(g.cases), String(g.branches), String(g.breached), String(g.noStatus),
      ])}
      empty="ไม่มีข้อมูล"
    />
  );
}

function SimpleTable({
  title,
  headers,
  rows,
  empty,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{rows.length}</Text>
        </View>
      </View>
      {rows.length === 0 ? (
        <Text style={styles.emptyRow}>{empty}</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={styles.tableHeader}>
              {headers.map((h, i) => (
                <Text key={h} style={[styles.th, { width: i === 0 ? 170 : i === 1 && headers.length > 4 ? 200 : 96 }]}>
                  {h}
                </Text>
              ))}
            </View>
            {rows.map((cells, r) => (
              <View key={r} style={styles.tableRow}>
                {cells.map((cell, i) => (
                  <Text
                    key={i}
                    style={[styles.td, { width: i === 0 ? 170 : i === 1 && headers.length > 4 ? 200 : 96 }]}
                  >
                    {cell}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  topRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, flexWrap: "wrap" },
  title: { fontSize: 18, lineHeight: 28, fontWeight: "700", color: colors.text },
  generated: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  downloadButtonBusy: { opacity: 0.7 },
  downloadText: { fontSize: 13, lineHeight: 21, color: colors.primary, fontWeight: "700" },

  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.card,
  },
  summaryNarrow: { flexGrow: 1, flexBasis: "46%", minWidth: 0 },
  summaryWide: { flexGrow: 1, flexBasis: 0, minWidth: 120 },
  summaryLabel: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  summaryValue: { fontSize: 22, lineHeight: 32, fontWeight: "700", color: colors.text },

  section: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
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
  sectionTitle: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 23, fontWeight: "700", color: colors.text },
  countBadge: { backgroundColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.sm },
  countBadgeText: { fontSize: 11, lineHeight: 18, color: colors.textMuted, fontWeight: "700" },
  hint: { fontSize: 11, lineHeight: 19, color: colors.textFaint, padding: spacing.md, paddingBottom: 0 },
  emptyRow: { fontSize: 13, lineHeight: 22, color: colors.textFaint, padding: spacing.md },

  rowList: { padding: spacing.md, gap: spacing.sm },
  row: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rowBreached: { backgroundColor: colors.warningSoft, borderColor: "#fcd34d" },
  rowTop: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  rowCode: { fontSize: 12, lineHeight: 20, fontWeight: "700", color: colors.textMuted, width: 58 },
  rowName: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 23, color: colors.text },
  rowDays: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  rowDaysBreached: { color: "#92400e" },
  rowChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  rowSymptom: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  moreButton: {
    alignItems: "center",
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  moreText: { fontSize: 13, lineHeight: 21, color: colors.primary, fontWeight: "700" },
  chip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  chipText: { fontSize: 11, lineHeight: 18, color: colors.textMuted, fontWeight: "700" },

  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  th: { fontSize: 11, lineHeight: 18, color: colors.textMuted, fontWeight: "700", paddingRight: spacing.sm },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  td: { fontSize: 13, lineHeight: 21, color: colors.text, paddingRight: spacing.sm },

  loading: { paddingVertical: spacing.xxl, alignItems: "center" },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 21, color: colors.danger },
  warnCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  warnText: { flex: 1, fontSize: 13, lineHeight: 22, color: "#92400e" },
});
