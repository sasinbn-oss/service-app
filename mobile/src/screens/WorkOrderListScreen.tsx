/**
 * รายการใบงาน — สิ่งที่ช่างต้องไปทำ
 *
 * ต่างจากกระดานติดตามเครื่องเสีย ซึ่งบอกว่า "เครื่องไหนมีปัญหา" หน้านี้บอกว่า
 * "ใครต้องไปทำอะไร" เคสหนึ่งอาจมีใบงานหลายใบ ถ้าช่างต้องเข้าไปหลายรอบ
 */
import React, { useCallback, useState } from "react";
import {
  useWindowDimensions,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Spinner from "../components/Spinner";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useRefreshHandler } from "../components/RefreshButton";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage } from "../api/client";
import { useWideLayout } from "../components/AppShell";
import { useDebounced } from "../utils/useDebounced";
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
  /** ทีมที่รับงาน — ใบใหม่จ่ายเป็นทีม */
  assignedTeam: string | null;
  /** ช่างรายคน — ใบเก่าก่อนเปลี่ยนมาจ่ายเป็นทีม */
  assignedToName: string | null;
  scheduledAt: string | null;
  createdAt: string;
  closedAt: string | null;
  closeResultLabel: string | null;
  attachmentCount: number;
}

type Filter = "INBOX" | "ACTIVE" | "ASSIGNED" | "IN_PROGRESS" | "DONE" | "ALL";

/**
 * ชิปกรองรายการ — ค่าที่ส่งต้องเป็นสถานะจริงที่เซิร์ฟเวอร์รู้จัก
 *
 * ชิป "รอช่างรับ" เดิมส่งคำว่า OPEN ซึ่งไม่ใช่สถานะในระบบ เซิร์ฟเวอร์ตอบ 400
 * ทุกครั้งที่กด — กดแล้วเจอข้อความผิดพลาดแทนรายการ ตอนนี้ใช้ชื่อขั้นจริง
 * ของระบบ จะได้ตรงกับป้ายสถานะบนการ์ดและไม่ต้องมีคำแปลซ้อนอีกชั้น
 */
const FILTERS: { value: Filter; label: string }[] = [
  { value: "INBOX", label: "กล่องงานของฉัน" },
  { value: "ACTIVE", label: "ที่ยังค้าง" },
  { value: "ASSIGNED", label: "รอนัดวัน" },
  { value: "IN_PROGRESS", label: "รอช่างเข้างาน" },
  { value: "DONE", label: "ปิดแล้ว" },
  { value: "ALL", label: "ทั้งหมด" },
];

/**
 * สีป้ายสถานะตามความหมายของ OTTERI
 *
 * เดิมทุกขั้นที่ยังไม่จบเป็นสีแดง แต่แดงในระบบนี้แปลว่าผิดปกติหรือลบ — ใบงาน
 * ที่เดินตามขั้นปกติไม่ได้ผิดอะไร พอแดงทั้งหน้าคนก็เลิกสังเกตสีไปเลย
 * - ฟ้า: รอคนในบริษัททำขั้นถัดไป (ระบุอะไหล่ เช็คคลัง จ่ายงาน นัดวัน ช่างเข้า)
 * - เหลือง: รอลูกค้า (เสนอราคา จ่ายเงิน) ซึ่งเราเร่งเองไม่ได้
 * - เขียว: ปิดงานแล้ว · เทา: ยกเลิก
 * ตัวอักษรใช้สีเข้ม (*Ink) เพราะสีหลักอ่อนเกินไปบนพื้นอ่อน
 */
export function statusTone(status: string) {
  if (status === "DONE") return { bg: colors.successSoft, fg: colors.successInk };
  if (status === "CANCELLED") return { bg: colors.tile, fg: colors.textMuted };
  if (status === "AWAITING_QUOTE" || status === "AWAITING_PAYMENT") {
    return { bg: colors.warningSoft, fg: colors.warningInk };
  }
  return { bg: colors.primarySoft, fg: colors.primaryInk };
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

/** วันที่อย่างเดียว ไม่มีเวลา — ใช้กับวันเปิดร้านและวันหมดประกันซึ่งเป็นรายวัน */
export function formatDate(iso: string | null) {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" });
}

export default function WorkOrderListScreen({ navigation, route }: Props) {
  useWideLayout();
  // จอกว้างเป็นตารางแบบต้นแบบ — กวาดตาเทียบสาขา/สถานะทีละคอลัมน์ได้ไวกว่าการ์ด
  // ที่ซ้อนข้อมูลเป็นบรรทัด บนมือถือยังเป็นการ์ดเพราะตารางหกคอลัมน์ไม่พอที่
  const { width } = useWindowDimensions();
  const table = width >= 900;
  const [rows, setRows] = useState<WorkOrderRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  // มาจากเมนู "กล่องงานของฉัน" ก็เปิดที่กล่องงานเลย ไม่ต้องให้กดหาอีกที
  const [filter, setFilter] = useState<Filter>(route.params?.inbox ? "INBOX" : "ACTIVE");
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");
  // ช่องค้นหาอัปเดตทันทีให้คนพิมพ์เห็น แต่ตัวโหลดใช้ค่าที่หยุดพิมพ์แล้ว
  // ไม่งั้นพิมพ์รหัสใบงานหนึ่งรหัสจะยิงขอข้อมูลเท่าจำนวนตัวอักษร
  const settledSearch = useDebounced(search);
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
            ...(settledSearch.trim() ? { search: settledSearch.trim() } : {}),
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
  }, [filter, mineOnly, settledSearch]);

  // โหลดใหม่ทุกครั้งที่กลับมาหน้านี้ เพราะเพิ่งไปปิดงานมาแล้วตัวเลขต้องเปลี่ยน
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useRefreshHandler(load);

  return (
    <View style={styles.container}>
      {/*
        หัวหน้าแบบ OTTERI: ชื่อหน้า + ป้ายจำนวนของกลุ่มที่เลือก + คำอธิบายบรรทัดเดียว
        ป้ายจำนวนนับจากรายการที่โหลดมาจริง ไม่ใช่ตัวเลขบนชิป — ค้นหาแล้วตัวเลขจะลดตามที่เห็น
      */}
      <View style={styles.pageHead}>
        <View style={styles.pageTitleRow}>
          <Text style={styles.pageTitle}>{filter === "INBOX" ? "กล่องงานของฉัน" : "ใบงานซ่อม"}</Text>
          {!loading && !error ? (
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{rows.length.toLocaleString("th-TH")} ใบ</Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate("WorkOrderForm")}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addButtonText}>เพิ่มใบงาน</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.pageSub}>ป้ายสถานะบอกว่าใบงานกำลังรอใคร — ใบที่ถึงคิวคุณอยู่ในกล่องงาน</Text>
      </View>
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
                {counts[f.value] ? ` (${counts[f.value]})` : ""}
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
          <Spinner color={colors.primary} />
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
        /*
          FlatList ไม่ใช่ ScrollView เพราะ ScrollView สร้างการ์ดทุกใบตั้งแต่เปิดหน้า
          รายการที่เปิดค้างสองร้อยใบจึงต้องวาดสองร้อยใบก่อนภาพแรกจะขึ้น
          ทั้งที่จอเห็นพร้อมกันได้ห้าใบ — FlatList วาดเฉพาะที่กำลังจะเห็น
        */
        <FlatList
          data={rows}
          keyExtractor={(row) => String(row.id)}
          contentContainerStyle={table ? styles.tableList : styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          initialNumToRender={table ? 20 : 8}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={table && rows.length ? <TableHead /> : null}
          renderItem={({ item, index }) =>
            table ? (
              <WorkOrderTableRow
                row={item}
                last={index === rows.length - 1}
                onPress={() => navigation.navigate("WorkOrderDetail", { id: item.id })}
              />
            ) : (
              <WorkOrderCard
                row={item}
                onPress={() => navigation.navigate("WorkOrderDetail", { id: item.id })}
              />
            )
          }
        />
      )}
    </View>
  );
}

/** หัวตาราง — ความกว้างคอลัมน์ต้องตรงกับ WorkOrderTableRow */
function TableHead() {
  return (
    <View style={[styles.tr, styles.thead]}>
      <Text style={[styles.th, styles.colWo]}>ใบงาน</Text>
      <Text style={[styles.th, styles.colBranch]}>สาขา</Text>
      <Text style={[styles.th, styles.colMachine]}>เครื่อง</Text>
      <Text style={[styles.th, styles.colTeam]}>ทีม</Text>
      <Text style={[styles.th, styles.colStatus]}>สถานะ</Text>
      <View style={styles.colAction} />
    </View>
  );
}

const WorkOrderTableRow = React.memo(function WorkOrderTableRow({
  row,
  last,
  onPress,
}: {
  row: WorkOrderRow;
  last: boolean;
  onPress: () => void;
}) {
  const tone = statusTone(row.status);
  return (
    <TouchableOpacity style={[styles.tr, !last && styles.trLine]} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.colWo, styles.cellWo]}>
        <View style={styles.rowIcon}>
          <Ionicons name="clipboard-outline" size={18} color={colors.primaryInk} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.codeRow}>
            <Text style={styles.code}>{row.code}</Text>
            {row.priority === "URGENT" ? (
              <View style={styles.urgentPill}>
                <View style={styles.urgentDot} />
                <Text style={styles.urgentText}>ด่วน</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.td2}>{row.title}</Text>
        </View>
      </View>
      <View style={styles.colBranch}>
        <Text style={styles.td}>{row.branchCode}</Text>
        <Text style={styles.td2}>{row.branchName}</Text>
      </View>
      <Text style={[styles.td, styles.colMachine]}>{row.machineCode ?? "—"}</Text>
      <Text style={[styles.td, styles.colTeam, !(row.assignedToName ?? row.assignedTeam) && styles.tdMuted]}>
        {row.assignedToName ?? row.assignedTeam ?? "ยังไม่มอบหมาย"}
      </Text>
      <View style={styles.colStatus}>
        <View style={[styles.badge, { backgroundColor: tone.bg, alignSelf: "flex-start" }]}>
          <Text style={[styles.badgeText, { color: tone.fg }]}>{row.statusLabel}</Text>
        </View>
      </View>
      <View style={styles.colAction}>
        <View style={styles.viewBtn}>
          <Ionicons name="document-text-outline" size={16} color={colors.primaryInk} />
          <Text style={styles.viewBtnText}>ดู</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

/**
 * memo ไว้เพราะการ์ดทั้งหน้าถูกวาดใหม่ทุกครั้งที่กดตัวกรองหรือพิมพ์ค้นหา
 * ทั้งที่แถวส่วนใหญ่เป็นข้อมูลชุดเดิม
 */
const WorkOrderCard = React.memo(function WorkOrderCard({
  row,
  onPress,
}: {
  row: WorkOrderRow;
  onPress: () => void;
}) {
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
          {row.assignedToName ?? row.assignedTeam ?? "ยังไม่มอบหมายทีม"}
          {row.source === "OUTAGE" ? " · เปิดจากกระดาน" : " · เปิดเอง"}
        </Text>
      </View>

      {/* บอกแค่ว่ามีรูปกี่ไฟล์ ไม่โหลดรูปมาแสดงในรายการ — รายการมีเป็นร้อยใบ
          คนที่ไล่ดูจะได้รู้ว่าใบไหนมีของให้ดูก่อนกดเข้าไป */}
      {row.attachmentCount > 0 ? (
        <View style={styles.metaRow}>
          <Ionicons name="images-outline" size={13} color={colors.textFaint} />
          <Text style={styles.meta}>{row.attachmentCount} รูป/วิดีโอ</Text>
        </View>
      ) : null}

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
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    flexShrink: 0,
  },
  searchBox: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    minHeight: 46,
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
    borderRadius: 14,
    minHeight: 44,
    paddingHorizontal: 16,
    ...shadow.raised,
  },
  addButtonText: { color: "#fff", fontSize: 14, lineHeight: 22, fontWeight: "700" },
  tableList: {
    margin: spacing.lg,
    marginTop: 0,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  tr: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  trLine: { borderBottomWidth: 1, borderBottomColor: colors.border },
  thead: { backgroundColor: colors.sky50, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 10 },
  th: { fontSize: 12, lineHeight: 18, fontWeight: "800", color: colors.textMuted },
  td: { fontSize: 14, lineHeight: 21, color: colors.text },
  td2: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  tdMuted: { color: colors.textFaint },
  colWo: { flex: 2.4, minWidth: 0 },
  colBranch: { flex: 2.2, minWidth: 0 },
  colMachine: { flex: 0.8 },
  colTeam: { flex: 1.3 },
  colStatus: { flex: 1.8 },
  colAction: { width: 64, alignItems: "flex-end" },
  cellWo: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  codeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  urgentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.dangerSoft,
    borderRadius: 999,
    paddingHorizontal: 7,
  },
  urgentDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.sky50,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  viewBtnText: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.primaryInk },
  pageHead: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, flexShrink: 0 },
  pageTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pageTitle: { fontSize: 24, lineHeight: 34, fontWeight: "800", color: colors.text },
  countPill: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 12 },
  countPillText: { fontSize: 13, lineHeight: 24, fontWeight: "800", color: colors.primaryInk },
  pageSub: { fontSize: 13, lineHeight: 20, color: colors.textMuted, marginTop: 2 },
  // flexShrink: 0 — รายการด้านล่างเป็น flex: 1 แล้วเบียดแถวชิปจนเตี้ยเหลือครึ่งเดียว
  // เห็นชัดเมื่อเปิดจากแท็บใบงานที่ความสูงจอถูกแบ่งให้แถบบนกับแถบล่างแล้ว
  chipScroll: { flexGrow: 0, flexShrink: 0, paddingVertical: spacing.md },
  chipRow: { flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.lg },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: colors.card,
  },
  // ชิปที่เลือกเป็นกรมท่าทึบตาม .chip.active ของต้นแบบ — ฟ้าอ่อนเดิมแยกจากชิปที่ไม่ได้เลือกยาก
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { fontSize: 13, lineHeight: 21, color: colors.textMuted, fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadow.card,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  code: { fontSize: 14, lineHeight: 21, fontWeight: "800", color: colors.primaryInk },
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
