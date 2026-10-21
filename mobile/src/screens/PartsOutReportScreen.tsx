/**
 * อะไหล่หมด — สาขาไหนรอของอะไร ถึงเมื่อไร (เจ้าของงานขอ ต.ค. 69)
 *
 * หน้าแรกเป็นการ์ดอะไหล่หน้าตาเดียวกับหน้ารายการอะไหล่ (รูป ชื่อ รหัส ยี่ห้อ) แล้วต่อท้ายด้วยสาขาที่รอตัวนั้น
 * — เจ้าของงานเลือกแบบนี้ คนเห็นรูปแล้วจำของได้เร็วกว่าอ่านรหัส · แท็บ "ตามสาขา" ไว้ตอบอีกคำถามหนึ่ง
 * ข้อมูลจาก GET /work-orders/reports/parts-out เป็นแถวแบน กฎว่าอะไรนับอยู่ฝั่งเซิร์ฟเวอร์ที่เดียว
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import { useRefreshHandler } from "../components/RefreshButton";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { showAlert } from "../utils/alert";
import { openUrl } from "../utils/share";
import { HomeStackParamList } from "../navigation/types";
import { formatDateTime } from "./WorkOrderListScreen";
import { colors, radius, shadow, spacing } from "../theme";

type Props = NativeStackScreenProps<HomeStackParamList, "PartsOutReport">;

interface Row {
  workOrderId: number;
  code: string;
  statusLabel: string;
  branchCode: string;
  branchName: string;
  region: string | null;
  team: string | null;
  machineCode: string | null;
  sparePartId: number;
  partCode: string;
  partName: string;
  brand: string | null;
  imageUrl: string | null;
  offCatalog: boolean;
  quantity: number;
  unit: string | null;
  checkedBy: string | null;
  outDays: number | null;
  etaDays: number | null;
}

type Tab = "part" | "branch";
type Filter = "all" | "late" | "none";

/** ต่อการ์ดโชว์สาขาแค่นี้ก่อน — อะไหล่ที่สิบสาขารอ การ์ดยาวกว่าหน้าจอ */
const FIRST = 3;

const isLate = (r: Row) => r.etaDays !== null && r.etaDays < 0;
const qtyText = (r: Row) => `${r.quantity}${r.unit ? ` ${r.unit}` : ""}`;

/** วันของเข้า — แดง = เลยแล้ว · ส้ม = ภายใน 3 วัน · ยังไม่ใส่วันก็บอกตรง ๆ ไม่ใช่เว้นว่าง */
function Eta({ r }: { r: Row }) {
  if (r.etaDays === null) return <Text style={[styles.eta, styles.etaNone]}>ยังไม่ใส่วันของเข้า</Text>;
  if (r.etaDays < 0) return <Text style={[styles.eta, styles.etaLate]}>ของเข้าเลยมา {-r.etaDays} วัน</Text>;
  if (r.etaDays === 0) return <Text style={[styles.eta, styles.etaSoon]}>ของเข้าวันนี้</Text>;
  return <Text style={[styles.eta, r.etaDays <= 3 && styles.etaSoon]}>ของเข้าอีก {r.etaDays} วัน</Text>;
}

export default function PartsOutReportScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("part");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<{ rows: Row[]; generatedAt: string }>("/work-orders/reports/parts-out");
      setRows(res.data.rows);
      setGeneratedAt(res.data.generatedAt);
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useRefreshHandler(load);

  async function download() {
    setDownloading(true);
    try {
      const res = await api.get<{ path: string }>("/work-orders/reports/parts-out", {
        params: { format: "xlsx" },
        loadingText: "กำลังสร้างไฟล์ Excel...",
      });
      const url = resolveImageUrl(res.data.path);
      if (url) await openUrl(url);
    } catch (e) {
      showAlert("ดาวน์โหลดไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (filter === "all" || (filter === "late" ? isLate(r) : r.etaDays === null)) &&
        (!q || [r.partName, r.partCode, r.branchCode, r.branchName, r.code].some((v) => v.toLowerCase().includes(q)))
    );
  }, [rows, filter, search]);

  // ตัวเลขด้านบนนับจากสิ่งที่เห็นอยู่ — กรอง "เลยวันของเข้า" แล้วตัวเลขต้องตามด้วย ไม่งั้นอ่านแล้วสับสน
  const stats = useMemo(
    () => ({
      parts: new Set(shown.map((r) => r.sparePartId)).size,
      branches: new Set(shown.map((r) => r.branchCode)).size,
      orders: new Set(shown.map((r) => r.workOrderId)).size,
      late: new Set(shown.filter(isLate).map((r) => r.workOrderId)).size,
    }),
    [shown]
  );

  // ตามอะไหล่: อะไหล่ที่มีสาขารอมากสุดก่อน (เท่ากัน = รอนานสุดก่อน)
  const byPart = useMemo(() => {
    const map = new Map<number, Row[]>();
    for (const r of shown) map.set(r.sparePartId, [...(map.get(r.sparePartId) ?? []), r]);
    const branches = (list: Row[]) => new Set(list.map((r) => r.branchCode)).size;
    const oldest = (list: Row[]) => Math.max(...list.map((r) => r.outDays ?? -1));
    return [...map.values()].sort((a, b) => branches(b) - branches(a) || oldest(b) - oldest(a));
  }, [shown]);

  // ตามสาขา: แถวเรียงรอนานสุดมาจากเซิร์ฟเวอร์แล้ว ลำดับที่เจอครั้งแรกจึงเป็นสาขาที่รอนานสุดก่อน
  const byBranch = useMemo(() => {
    const map = new Map<string, Map<number, Row[]>>();
    for (const r of shown) {
      const b = map.get(r.branchCode) ?? new Map<number, Row[]>();
      b.set(r.workOrderId, [...(b.get(r.workOrderId) ?? []), r]);
      map.set(r.branchCode, b);
    }
    return [...map.entries()];
  }, [shown]);

  const openOrder = (id: number) => navigation.navigate("WorkOrderDetail", { id });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sub}>
        ใบงานที่แอดมินเช็คคลังแล้ว “หมด” และยังรอของ — ของมาแล้วเช็คใหม่ว่ามีครบ ใบงานจะหายจากหน้านี้เอง
        {generatedAt ? ` · ข้อมูล ณ ${formatDateTime(generatedAt)}` : ""}
      </Text>

      <View style={styles.tiles}>
        {(
          [
            ["อะไหล่ที่หมด", stats.parts, false],
            ["สาขาที่รอ", stats.branches, false],
            ["ใบงาน", stats.orders, false],
            ["เลยวันของเข้า", stats.late, true],
          ] as const
        ).map(([label, n, red]) => (
          <View key={label} style={[styles.tile, red && styles.tileRed]} accessibilityLabel={`${label} ${n}`}>
            <Text style={styles.tileLabel}>{label}</Text>
            <Text style={[styles.tileNum, red && { color: colors.dangerInk }]}>{n}</Text>
          </View>
        ))}
      </View>

      <View style={styles.bar}>
        <View style={styles.tabs}>
          {(
            [
              ["part", "ตามอะไหล่"],
              ["branch", "ตามสาขา"],
            ] as const
          ).map(([v, label]) => (
            <TouchableOpacity key={v} style={[styles.tab, tab === v && styles.tabOn]} onPress={() => setTab(v)} accessibilityLabel={`แท็บ${label}`}>
              <Text style={[styles.tabText, tab === v && styles.tabTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[styles.download, (downloading || !rows?.length) && { opacity: 0.6 }]}
          onPress={download}
          disabled={downloading || !rows?.length}
        >
          {downloading ? <Spinner size="small" color="#fff" /> : <Ionicons name="download-outline" size={16} color="#fff" />}
          <Text style={styles.downloadText}>ดาวน์โหลด Excel</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={15} color={colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="ค้นชื่อ รหัสอะไหล่ รหัสสาขา หรือเลขใบงาน"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="ค้นหาในรายงานอะไหล่หมด"
          />
        </View>
        {(
          [
            ["all", "ทั้งหมด"],
            ["late", "เลยวันของเข้า"],
            ["none", "ยังไม่ใส่วัน"],
          ] as const
        ).map(([v, label]) => (
          <TouchableOpacity key={v} style={[styles.chip, filter === v && styles.chipOn]} onPress={() => setFilter(v)} accessibilityLabel={`กรอง${label}`}>
            <Text style={[styles.chipText, filter === v && styles.chipTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : !rows ? (
        <Spinner color={colors.primary} />
      ) : shown.length === 0 ? (
        <Text style={styles.empty}>{rows.length ? "ไม่มีรายการที่ตรงกับตัวกรอง" : "ตอนนี้ไม่มีสาขาไหนติดอะไหล่หมด"}</Text>
      ) : tab === "part" ? (
        <View style={styles.grid}>
          {byPart.map((list) => {
            const p = list[0];
            const uri = resolveImageUrl(p.imageUrl);
            const qty = list.reduce((n, r) => n + r.quantity, 0);
            const branches = new Set(list.map((r) => r.branchCode)).size;
            const late = list.filter(isLate).length;
            const open = expanded[p.sparePartId];
            return (
              <View
                key={p.sparePartId}
                style={[styles.card, wide && styles.cardWide, late > 0 && { borderLeftColor: colors.dangerInk }]}
                accessibilityLabel={`การ์ดอะไหล่ ${p.partName}`}
              >
                {/* ส่วนบนเหมือนการ์ดหน้ารายการอะไหล่ — กดแล้วไปหน้าข้อมูลอะไหล่เหมือนกัน (ของนอกสโตร์ไม่มีหน้า) */}
                <TouchableOpacity
                  style={styles.top}
                  disabled={p.offCatalog}
                  onPress={() => navigation.navigate("SparePartDetail", { id: p.sparePartId })}
                  activeOpacity={0.7}
                >
                  {uri ? (
                    <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbNone]}>
                      <Text style={styles.thumbNoneText}>ไม่มีรูป</Text>
                    </View>
                  )}
                  <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={2}>
                      {p.partName}
                    </Text>
                    <Text style={styles.partCode}>{p.offCatalog ? "อะไหล่นอกสโตร์ (ไม่มีรหัส)" : `รหัส: ${p.partCode}`}</Text>
                    {p.brand ? <Text style={styles.partCode}>ยี่ห้อ: {p.brand}</Text> : null}
                    <View style={styles.pills}>
                      <Text style={[styles.pill, styles.pillOut]}>● หมด</Text>
                      <Text style={styles.pill}>ต้องใช้ {qty} ชิ้น</Text>
                      <Text style={styles.pill}>{branches} สาขา</Text>
                      {late ? <Text style={[styles.pill, styles.pillLate]}>เลยวันของเข้า {late}</Text> : null}
                    </View>
                  </View>
                </TouchableOpacity>
                <View style={styles.waits}>
                  {(open ? list : list.slice(0, FIRST)).map((r) => (
                    <View key={`${r.workOrderId}`} style={styles.wait}>
                      <View style={styles.waitTop}>
                        <Text style={styles.waitBranch}>
                          {r.branchCode} <Text style={styles.waitName}>{r.branchName}</Text>
                        </Text>
                        <Eta r={r} />
                      </View>
                      <View style={styles.waitTop}>
                        <TouchableOpacity onPress={() => openOrder(r.workOrderId)} accessibilityLabel={`เปิดใบงาน ${r.code}`}>
                          <Text style={styles.wo}>{r.code}</Text>
                        </TouchableOpacity>
                        <Text style={styles.waitMeta}>
                          {r.machineCode ?? "ทั้งสาขา"} × {qtyText(r)}
                        </Text>
                      </View>
                      <Text style={styles.waitMeta}>
                        {r.outDays !== null ? `หมดมาแล้ว ${r.outDays} วัน` : "ไม่ทราบวันที่เช็ค"}
                        {r.checkedBy ? ` · เช็คโดย ${r.checkedBy}` : ""}
                      </Text>
                    </View>
                  ))}
                </View>
                {list.length > FIRST ? (
                  <TouchableOpacity onPress={() => setExpanded((e) => ({ ...e, [p.sparePartId]: !open }))}>
                    <Text style={styles.more}>{open ? "ย่อ" : `ดูอีก ${list.length - FIRST} สาขา`}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        byBranch.map(([branchCode, orders]) => {
          const first = [...orders.values()][0][0];
          return (
            <View key={branchCode} style={styles.branch} accessibilityLabel={`สาขา ${branchCode}`}>
              <View style={styles.branchHead}>
                <Text style={styles.branchCode}>{branchCode}</Text>
                <Text style={styles.branchName}>{first.branchName}</Text>
                <Text style={styles.waitMeta}>
                  {[first.region ? `ภาค${first.region}` : null, first.team].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {[...orders.values()].map((list) => {
                const r = list[0];
                return (
                  <View key={r.workOrderId} style={styles.branchOrder}>
                    <View style={styles.waitTop}>
                      <TouchableOpacity onPress={() => openOrder(r.workOrderId)} accessibilityLabel={`เปิดใบงาน ${r.code}`}>
                        <Text style={styles.wo}>{r.code}</Text>
                      </TouchableOpacity>
                      <Text style={styles.waitMeta}>{r.machineCode ?? "ทั้งสาขา"}</Text>
                      <Text style={styles.stage}>{r.statusLabel}</Text>
                      <Eta r={r} />
                    </View>
                    <Text style={styles.branchParts}>{list.map((x) => `${x.partName} × ${qtyText(x)}`).join(" · ")}</Text>
                    <Text style={styles.waitMeta}>
                      {r.outDays !== null ? `หมดมาแล้ว ${r.outDays} วัน` : "ไม่ทราบวันที่เช็ค"}
                      {r.checkedBy ? ` · เช็คโดย ${r.checkedBy}` : ""}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  sub: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: 130, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  tileRed: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerLine },
  tileLabel: { fontSize: 12, color: colors.textMuted },
  tileNum: { fontSize: 22, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
  bar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  tabs: { flexDirection: "row", gap: 4, backgroundColor: colors.card, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: colors.border },
  tab: { borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 6 },
  tabOn: { backgroundColor: colors.navyFill },
  tabText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  tabTextOn: { color: "#fff" },
  download: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 },
  downloadText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  searchBox: { flexGrow: 1, flexBasis: 220, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10 },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 14, color: colors.text },
  chip: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: colors.card },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: 13, color: colors.text },
  chipTextOn: { color: colors.primaryInk, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 14 },
  empty: { color: colors.textMuted, fontSize: 14, paddingVertical: spacing.lg, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, alignItems: "flex-start" },
  // การ์ดเดียวกับหน้ารายการอะไหล่ (มุม 10 · เงา · รูป 72) + แถบแดงซ้ายบอกว่าหมด
  card: { width: "100%", backgroundColor: colors.card, borderRadius: 10, ...shadow.card, borderLeftWidth: 4, borderLeftColor: colors.danger, overflow: "hidden" },
  cardWide: { width: "auto", flexGrow: 1, flexBasis: 340, maxWidth: 560 },
  top: { flexDirection: "row", gap: 12, padding: 12 },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: colors.background },
  thumbNone: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  thumbNoneText: { fontSize: 11, color: colors.textMuted },
  info: { flex: 1, minWidth: 0, justifyContent: "center", gap: 2 },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  partCode: { fontSize: 13, color: colors.textMuted },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  pill: { fontSize: 11.5, fontWeight: "700", color: colors.text, backgroundColor: colors.background, borderRadius: 6, paddingHorizontal: 7, overflow: "hidden" },
  pillOut: { backgroundColor: colors.danger, color: "#fff" },
  pillLate: { backgroundColor: colors.dangerSoft, color: colors.dangerInk },
  waits: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  wait: { paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 1 },
  waitTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  waitBranch: { flex: 1, minWidth: 140, fontSize: 13, fontWeight: "700", color: colors.text },
  waitName: { fontWeight: "400", color: colors.textMuted },
  waitMeta: { fontSize: 12, color: colors.textMuted },
  wo: { fontSize: 13, fontWeight: "800", color: colors.primaryInk },
  eta: { fontSize: 12, color: colors.textMuted },
  etaLate: { color: colors.dangerInk, fontWeight: "700" },
  etaSoon: { color: colors.warningInk, fontWeight: "700" },
  etaNone: { color: colors.warningInk },
  more: { paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, fontWeight: "700", color: colors.primary },
  branch: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  branchHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border },
  branchCode: { fontSize: 14, fontWeight: "800", color: colors.navy },
  branchName: { fontSize: 13.5, color: colors.text },
  branchOrder: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: 2 },
  branchParts: { fontSize: 13, color: colors.text },
  stage: { fontSize: 11.5, fontWeight: "700", color: colors.roleAdmin, backgroundColor: colors.roleAdminSoft, borderRadius: 6, paddingHorizontal: 6, overflow: "hidden" },
});
