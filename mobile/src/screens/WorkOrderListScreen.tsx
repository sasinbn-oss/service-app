/**
 * รายการใบงาน — สิ่งที่ช่างต้องไปทำ
 *
 * ต่างจากกระดานติดตามเครื่องเสีย ซึ่งบอกว่า "เครื่องไหนมีปัญหา" หน้านี้บอกว่า
 * "ใครต้องไปทำอะไร" เคสหนึ่งอาจมีใบงานหลายใบ ถ้าช่างต้องเข้าไปหลายรอบ
 */
import React, { useRef, useCallback, useEffect, useMemo, useState } from "react";
import {
  useWindowDimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRefreshHandler } from "../components/RefreshButton";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage } from "../api/client";
import { useDebounced } from "../utils/useDebounced";
import { useAuth } from "../context/AuthContext";
import { UrgentBadge, UrgentGlow } from "../components/Urgent";
import { HomeStackParamList } from "../navigation/types";
import { colors, radius, shadow, spacing, headingFont } from "../theme";

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
  /** ขั้นนี้เป็นของบทบาทไหน — ว่าง = ปิด/ยกเลิกแล้ว */
  stageActor: Role | null;
  /** หัวหน้าภาคที่ดูแลใบนี้ (เฉพาะขั้นของหัวหน้าภาค) — ภาคที่มีสองคนได้ทั้งสองชื่อ */
  waitingOnSupervisors: { id: number; name: string; region: string | null }[];
  /** ทีมที่รับงาน (เฉพาะขั้นของช่าง) */
  waitingOnTeam: string | null;
  branchType: "DODO" | "COCO";
  /** เข้าขั้นปัจจุบันเมื่อไร — ใช้บอกว่าค้างมากี่วัน */
  stageSince: string;
}

type Role = "ADMIN" | "SUPERVISOR" | "EMPLOYEE";

/** ใบด่วนที่ยังค้าง — ดึงขึ้นบนสุดและมีออร่า (ใบที่ปิดแล้วไม่มี stageActor) */
const isHot = (r: WorkOrderRow) => r.priority === "URGENT" && r.stageActor !== null;
type ListItem = WorkOrderRow | { sep: "URGENT" | "NORMAL"; label: string };
type Sort = "urgent" | "new" | "old" | "az" | "za";

const ROLE_TABS: { value: Role; label: string; color: string }[] = [
  { value: "ADMIN", label: "แอดมิน", color: colors.roleAdmin },
  { value: "SUPERVISOR", label: "หัวหน้าภาค", color: colors.roleSupervisor },
  { value: "EMPLOYEE", label: "ช่าง", color: colors.roleTech },
];
const ROLE_LABEL: Record<Role, string> = { ADMIN: "แอดมิน", SUPERVISOR: "หัวหน้าภาค", EMPLOYEE: "ช่าง" };

/**
 * ลำดับ — "ด่วนก่อน" คือลำดับเดิมจากเซิร์ฟเวอร์ (ด่วนขึ้นก่อน แล้วเก่าสุดก่อน = ลำดับที่ควรหยิบไปทำ)
 * ส่วน "ค้างนานสุด" นับจากวันที่เข้าขั้นปัจจุบัน ไม่ใช่วันเปิดใบงาน — ใบเก่าที่เพิ่งขยับขั้น
 * ไม่ได้ถูกลืม ใบที่นิ่งอยู่ขั้นเดียวหลายวันต่างหากที่ถูกลืม
 */
const SORTS: { value: Sort; label: string }[] = [
  { value: "urgent", label: "ด่วนก่อน" },
  { value: "new", label: "ใหม่สุด" },
  { value: "old", label: "ค้างนานสุด" },
  { value: "az", label: "สาขา A→Z" },
  { value: "za", label: "สาขา Z→A" },
];

/** ตัวกรองที่เลือก "คน" ภายในบทบาท — s:<id> หัวหน้าภาค · t:<ทีม> ทีมช่าง · none ยังไม่มีใครดูแล */
type Who = string;

interface ListPrefs {
  owner: Role | "";
  who: Who;
  btype: "" | "DODO" | "COCO";
  sort: Sort;
}
const DEFAULT_PREFS: ListPrefs = { owner: "", who: "", btype: "", sort: "urgent" };

function whoKeys(row: WorkOrderRow): Who[] {
  if (row.stageActor === "SUPERVISOR")
    return row.waitingOnSupervisors.length ? row.waitingOnSupervisors.map((s) => `s:${s.id}`) : ["none"];
  if (row.stageActor === "EMPLOYEE") return [row.waitingOnTeam ? `t:${row.waitingOnTeam}` : "none"];
  return [];
}

/** "ค้าง 3 วัน" — นับเป็นวันเต็มตามเวลาไทย วันนี้ = "เข้าขั้นนี้วันนี้" */
export function stuckLabel(iso: string) {
  const day = (d: Date) => Math.floor((d.getTime() + 7 * 3600_000) / 86_400_000);
  const n = day(new Date()) - day(new Date(iso));
  return n <= 0 ? "เข้าขั้นนี้วันนี้" : `ค้าง ${n} วัน`;
}

type Filter = "INBOX" | "ACTIVE" | "AWAITING_CONFIRM" | "IN_PROGRESS" | "DONE" | "ALL";

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
  { value: "AWAITING_CONFIRM", label: "รอคอนเฟิร์มลูกค้า" },
  { value: "IN_PROGRESS", label: "รอช่างเข้างาน" },
  { value: "DONE", label: "ปิดแล้ว" },
  { value: "ALL", label: "ทั้งหมด" },
];

/**
 * ใบงานรอใคร — ตัดสินสีของป้ายสถานะ
 *
 * ตรงกับ WORK_ORDER_STAGE_ACTOR ฝั่ง backend ยกเว้นขั้นที่รอคนนอก (ลูกค้าจ่ายเงิน ของเข้าคลัง)
 * ซึ่งแยกเป็นสีส้ม — คนในบริษัทเร่งเองไม่ได้ ไม่ควรดูเหมือนงานค้างของใคร
 */
export type Owner = "ADMIN" | "SUPERVISOR" | "EMPLOYEE" | "OUTSIDE" | "DONE" | "CANCELLED";
export const STATUS_OWNER: Record<string, Owner> = {
  NEW: "SUPERVISOR",
  INSPECTING: "EMPLOYEE",
  AWAITING_QUOTE: "ADMIN",
  AWAITING_PAYMENT: "OUTSIDE",
  WAITING_PARTS: "OUTSIDE",
  PARTS_REQUESTED: "ADMIN",
  PARTS_CHECKED: "SUPERVISOR",
  AWAITING_CONFIRM: "ADMIN",
  ASSIGNED: "SUPERVISOR",
  IN_PROGRESS: "EMPLOYEE",
  DONE: "DONE",
  CANCELLED: "CANCELLED",
};

/**
 * สีตามคนที่ใบงานรอ (เจ้าของงานเลือก ต.ค. 69)
 *
 * เดิมเกือบทุกขั้นเป็นฟ้าเหมือนกัน กวาดตาแล้วแยกไม่ออกว่าใบไหนค้างที่ใคร
 * fg = ตัวอักษร/จุด · bg = พื้นป้าย · ตัวอักษรใช้สีเข้มเพราะสีอ่อนอ่านไม่ออกบนพื้นอ่อน
 */
export const OWNER_TONE: Record<Owner, { bg: string; fg: string }> = {
  ADMIN: { bg: colors.roleAdminSoft, fg: colors.roleAdmin },
  SUPERVISOR: { bg: colors.roleSupervisorSoft, fg: colors.roleSupervisor },
  EMPLOYEE: { bg: colors.roleTechSoft, fg: colors.roleTech },
  OUTSIDE: { bg: colors.warningSoft, fg: colors.warningInk },
  DONE: { bg: colors.doneSoft, fg: colors.doneBand },
  CANCELLED: { bg: colors.tile, fg: colors.textMuted },
};

export function statusTone(status: string) {
  return OWNER_TONE[STATUS_OWNER[status] ?? "SUPERVISOR"];
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
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<ListPrefs>(DEFAULT_PREFS);
  const setPref = (patch: Partial<ListPrefs>) => setPrefs((p) => ({ ...p, ...patch }));

  /**
   * จำตัวกรอง "รอใคร / สาขา / เรียง" ล่าสุดไว้ในเครื่อง แยกตามผู้ใช้ — แบบเดียวกับหน้าติดตามเครื่องเสีย
   * โหลดของเดิมให้เสร็จก่อนค่อยเริ่มบันทึก ไม่งั้นค่าตั้งต้นตอนเปิดหน้าจะเขียนทับของที่จำไว้
   */
  const prefsKey = `otteri-wo-list:${user?.id ?? 0}`;
  const [restored, setRestored] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(prefsKey)
      .then((raw) => alive && raw && setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) }))
      .catch(() => undefined)
      .finally(() => alive && setRestored(prefsKey));
    return () => {
      alive = false;
    };
  }, [prefsKey]);
  useEffect(() => {
    if (restored !== prefsKey) return;
    AsyncStorage.setItem(prefsKey, JSON.stringify(prefs)).catch(() => undefined);
  }, [prefs, restored, prefsKey]);

  /**
   * กรองและเรียงที่หน้าจอ ไม่ยิงเซิร์ฟเวอร์ใหม่ — รายการไม่แบ่งหน้า ของครบอยู่ในมือแล้ว
   * กดสลับตัวกรองจึงเปลี่ยนทันทีโดยไม่ต้องรอเน็ต ตัวเลขบนปุ่มแต่ละแถวนับโดยใช้ตัวกรองของแถวอื่น
   * (เลือก DODO แล้วตัวเลขของ "หัวหน้าภาค" คือใบ DODO ที่รอหัวหน้าภาค)
   */
  const byOwner = useCallback(
    (r: WorkOrderRow) =>
      (!prefs.owner || r.stageActor === prefs.owner) && (!prefs.who || whoKeys(r).includes(prefs.who)),
    [prefs.owner, prefs.who]
  );
  const byType = useCallback((r: WorkOrderRow) => !prefs.btype || r.branchType === prefs.btype, [prefs.btype]);
  const shown = useMemo(() => {
    const list = rows.filter((r) => byOwner(r) && byType(r));
    const at = (iso: string) => new Date(iso).getTime();
    const code = (a: WorkOrderRow, b: WorkOrderRow) =>
      a.branchCode.localeCompare(b.branchCode, "en", { numeric: true }) || a.code.localeCompare(b.code);
    if (prefs.sort === "az") list.sort(code);
    else if (prefs.sort === "za") list.sort((a, b) => code(b, a));
    else if (prefs.sort === "new") list.sort((a, b) => at(b.createdAt) - at(a.createdAt));
    else if (prefs.sort === "old") list.sort((a, b) => at(a.stageSince) - at(b.stageSince));
    // ใบด่วนที่ยังค้างอยู่ขึ้นบนสุดเสมอ ไม่ว่าเลือกเรียงแบบไหน (เจ้าของงานกำหนด) — เรียงตามที่เลือกภายในกลุ่ม
    // ใบที่ปิดแล้วไม่ดึงขึ้น ด่วนเมื่อเดือนก่อนไม่ได้แปลว่าต้องดูก่อนวันนี้
    const hot = list.filter(isHot);
    return hot.length ? [...hot, ...list.filter((r) => !isHot(r))] : list;
  }, [rows, byOwner, byType, prefs.sort]);

  /**
   * แถวคั่น "ด่วน (n)" / "ปกติ (n)" — ให้เห็นว่ากลุ่มด่วนจบตรงไหน
   * ไม่มีใบด่วนก็ไม่มีแถวคั่นเลย รายการหน้าตาเหมือนเดิม
   */
  const items = useMemo<ListItem[]>(() => {
    const hot = shown.filter(isHot).length;
    if (!hot) return shown;
    return [
      { sep: "URGENT", label: `ด่วน (${hot})` },
      ...shown.slice(0, hot),
      ...(shown.length > hot ? [{ sep: "NORMAL" as const, label: `ปกติ (${shown.length - hot})` }] : []),
      ...shown.slice(hot),
    ];
  }, [shown]);

  // นับรอบการโหลด — สลับชิปเร็ว ๆ คำตอบของชิปก่อนหน้าอาจมาถึงทีหลัง
  // ต้องทิ้งคำตอบเก่า ไม่งั้นชิป "ปิดแล้ว" อาจโชว์รายการของ "ที่ยังค้าง"
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
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
      if (seq !== loadSeq.current) return;
      setRows(res.data.rows);
      setCounts(res.data.counts);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(apiErrorMessage(e));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [filter, mineOnly, settledSearch]);

  /**
   * เลือกหัวข้อ (ชิป) แล้วขึ้นเครื่องซักผ้าแทนรายการเดิมระหว่างโหลด
   *
   * ต่างจากกลับมาหน้าเดิมที่โชว์ข้อมูลเก่าไว้ก่อน — กดชิปแล้วรายการเดิมค้างอยู่
   * คือรายการของหัวข้อที่ไม่ได้เลือกแล้ว คนจะเข้าใจผิดว่าเป็นของหัวข้อใหม่
   */
  function chooseFilter(next: Filter) {
    if (next === filter) return;
    setLoading(true);
    setFilter(next);
  }

  // โหลดใหม่ทุกครั้งที่กลับมาหน้านี้ เพราะเพิ่งไปปิดงานมาแล้วตัวเลขต้องเปลี่ยน
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useRefreshHandler(load);

  /**
   * มือถือ: เลื่อนลงดูใบงานแล้วหัวหน้า+ตัวกรองหุบเหลือแถบเดียว (เจ้าของงานเลือกแบบ C ต.ค. 69)
   * กางเต็มกินเกือบทั้งจอ เห็นใบงานแค่ใบสองใบ — แถบที่หุบยังบอกว่ากรองอะไรอยู่ กดแล้วกลับขึ้นบนสุดและกางอีกครั้ง
   *
   * หุบ/กางคนละระยะ (มากกว่า 80 / น้อยกว่า 4) กันกระพริบตอนนิ้วค้างแถวเส้นเดียว
   * และหุบเฉพาะเมื่อรายการยาวพอ — รายการสั้นที่หุบแล้วจอสูงขึ้นจนเลื่อนไม่ได้ จะเด้งกลับไปบนสุดแล้วกางวนไม่จบ
   */
  const foldable = width < 640;
  const [folded, setFolded] = useState(false);
  const listRef = useRef<FlatList<ListItem>>(null);
  const headH = useRef(0);
  const viewH = useRef(0);
  const contentH = useRef(0);
  useEffect(() => {
    if (!foldable) setFolded(false);
  }, [foldable]);
  function onListScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!foldable) return;
    const y = e.nativeEvent.contentOffset.y;
    if (!folded && y > 80 && contentH.current - viewH.current > headH.current + 40) setFolded(true);
    else if (folded && y < 4) setFolded(false);
  }
  function unfold() {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    setFolded(false);
  }

  return (
    <View style={styles.container}>
      {folded ? (
        <FoldedBar
          count={shown.length}
          parts={[
            FILTERS.find((f) => f.value === filter)?.label ?? "",
            mineOnly ? "เฉพาะงานของฉัน" : "",
            prefs.owner ? `รอ${ROLE_TABS.find((t) => t.value === prefs.owner)?.label ?? ""}` : "",
            prefs.who ? whoLabel(rows, prefs.who, prefs.owner) : "",
            prefs.btype,
            prefs.sort !== "urgent" ? SORTS.find((o) => o.value === prefs.sort)?.label ?? "" : "",
            settledSearch.trim() ? `ค้น “${settledSearch.trim()}”` : "",
          ].filter(Boolean)}
          onPress={unfold}
        />
      ) : null}
      <View
        style={folded ? styles.headHidden : null}
        onLayout={(e) => {
          if (!folded) headH.current = e.nativeEvent.layout.height;
        }}
      >
      {/*
        หัวหน้าแบบ OTTERI: ชื่อหน้า + ป้ายจำนวนของกลุ่มที่เลือก + คำอธิบายบรรทัดเดียว
        ป้ายจำนวนนับจากรายการที่โหลดมาจริง ไม่ใช่ตัวเลขบนชิป — ค้นหาแล้วตัวเลขจะลดตามที่เห็น
      */}
      <View style={styles.pageHead}>
        <View style={styles.pageTitleRow}>
          <Text style={[styles.pageTitle, headingFont]}>{filter === "INBOX" ? "กล่องงานของฉัน" : "ใบงานซ่อม"}</Text>
          {!loading && !error ? (
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{shown.length.toLocaleString("th-TH")} ใบ</Text>
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
              onPress={() => chooseFilter(f.value)}
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
            onPress={() => {
              setLoading(true);
              setMineOnly((v) => !v);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, mineOnly && styles.chipTextOn]}>เฉพาะงานของฉัน</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {!loading && !error && rows.length > 0 ? (
        <ListFilters rows={rows} prefs={prefs} setPref={setPref} byOwner={byOwner} byType={byType} />
      ) : null}
      </View>

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
        <EmptyState
          icon="clipboard-outline"
          title="ไม่มีใบงานในหมวดนี้"
          text="เปิดใบงานได้จากกระดานติดตามเครื่องเสีย หรือกดปุ่มเพิ่มใบงานด้านบน"
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="funnel-outline"
          title="ไม่มีใบงานตามตัวกรองนี้"
          text="ลองเลือก “ทุกคน” หรือ “ทั้งหมด” ในแถวรอใคร / สาขา"
        />
      ) : (
        /*
          FlatList ไม่ใช่ ScrollView เพราะ ScrollView สร้างการ์ดทุกใบตั้งแต่เปิดหน้า
          รายการที่เปิดค้างสองร้อยใบจึงต้องวาดสองร้อยใบก่อนภาพแรกจะขึ้น
          ทั้งที่จอเห็นพร้อมกันได้ห้าใบ — FlatList วาดเฉพาะที่กำลังจะเห็น
        */
        <FlatList
          ref={listRef}
          onScroll={onListScroll}
          scrollEventThrottle={32}
          onLayout={(e) => (viewH.current = e.nativeEvent.layout.height)}
          onContentSizeChange={(_, h) => (contentH.current = h)}
          data={items}
          keyExtractor={(it) => ("sep" in it ? `sep-${it.sep}` : String(it.id))}
          contentContainerStyle={table ? styles.tableList : styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          initialNumToRender={table ? 20 : 8}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={
            table ? (
              <TableHead sort={prefs.sort} onSortBranch={() => setPref({ sort: prefs.sort === "az" ? "za" : "az" })} />
            ) : null
          }
          renderItem={({ item, index }) =>
            "sep" in item ? (
              <View style={[table ? styles.sepRow : styles.sepCard, item.sep === "URGENT" && styles.sepUrgent]}>
                <Text style={[styles.sepText, item.sep === "URGENT" && styles.sepTextUrgent]}>
                  {item.sep === "URGENT" ? "● " : ""}
                  {item.label}
                </Text>
              </View>
            ) : table ? (
              <WorkOrderTableRow
                row={item}
                last={index === items.length - 1}
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

/**
 * แถว "รอใคร · สาขา · เรียง" ใต้ชิปสถานะ
 *
 * เลือกบทบาทแล้วขึ้นแถวที่สองให้เลือกต่อว่าเป็นของใคร — หัวหน้าภาครายคน ช่างรายทีม
 * แอดมินไม่แยกคน เพราะแอดมินทุกคนทำแทนกันได้ทุกขั้น
 */
/** ชื่อ "คนไหน/ทีมไหน" ที่เลือกไว้ — ใช้บนแถบหุบ ตัวเลือกจริงสร้างใน ListFilters จากรายการเดียวกัน */
function whoLabel(rows: WorkOrderRow[], who: Who, owner: Role | "") {
  if (who === "none") return owner === "SUPERVISOR" ? "ยังไม่มีหัวหน้าภาคดูแล" : "ยังไม่มีทีม";
  if (who.startsWith("t:")) return `ทีม${who.slice(2)}`;
  for (const r of rows) {
    const sup = r.waitingOnSupervisors.find((x) => `s:${x.id}` === who);
    if (sup) return sup.name;
  }
  return "";
}

/** แถบเดียวตอนหุบ — บอกตัวกรองที่ใช้อยู่ และพากลับไปเปลี่ยนตัวกรองได้ในแตะเดียว */
function FoldedBar({ count, parts, onPress }: { count: number; parts: string[]; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.folded} onPress={onPress} activeOpacity={0.85} accessibilityLabel="แสดงตัวกรองและช่องค้นหา">
      <View style={styles.foldedCount}>
        <Text style={styles.foldedCountText}>{count.toLocaleString("th-TH")} ใบ</Text>
      </View>
      <Text style={styles.foldedText} numberOfLines={1}>
        {parts.join(" · ")}
      </Text>
      <View style={styles.foldedBtn}>
        <Ionicons name="search" size={15} color={colors.primaryInk} />
        <Ionicons name="options-outline" size={16} color={colors.primaryInk} />
      </View>
    </TouchableOpacity>
  );
}

function ListFilters({
  rows,
  prefs,
  setPref,
  byOwner,
  byType,
}: {
  rows: WorkOrderRow[];
  prefs: ListPrefs;
  setPref: (p: Partial<ListPrefs>) => void;
  byOwner: (r: WorkOrderRow) => boolean;
  byType: (r: WorkOrderRow) => boolean;
}) {
  const typed = rows.filter(byType);
  const ownerCount = (role: Role | "") => typed.filter((r) => !role || r.stageActor === role).length;
  const typeCount = (t: "" | "DODO" | "COCO") => rows.filter((r) => byOwner(r) && (!t || r.branchType === t)).length;

  // ตัวเลือก "ของใคร" สร้างจากใบที่มีอยู่จริง — ไม่มีชื่อที่กดแล้วได้รายการว่าง
  const whoOptions = useMemo(() => {
    if (prefs.owner !== "SUPERVISOR" && prefs.owner !== "EMPLOYEE") return null;
    const map = new Map<Who, { label: string; n: number }>();
    for (const r of typed) {
      if (r.stageActor !== prefs.owner) continue;
      for (const k of whoKeys(r)) {
        const label =
          k === "none"
            ? prefs.owner === "SUPERVISOR"
              ? "ยังไม่มีหัวหน้าภาคดูแล"
              : "ยังไม่มีทีม"
            : k.startsWith("s:")
              ? (() => {
                  const sup = r.waitingOnSupervisors.find((x) => `s:${x.id}` === k)!;
                  return sup.region ? `${sup.name} (${sup.region})` : sup.name;
                })()
              : `ทีม${k.slice(2)}`;
        const cur = map.get(k);
        map.set(k, { label, n: (cur?.n ?? 0) + 1 });
      }
    }
    return [...map.entries()].sort((a, b) => (a[0] === "none" ? 1 : b[0] === "none" ? -1 : a[1].label.localeCompare(b[1].label, "th")));
  }, [typed, prefs.owner]);

  return (
    <View style={styles.filterPanel}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fRow}>
        <Text style={styles.fLabel}>รอใคร</Text>
        <Seg on={!prefs.owner} label="ทุกคน" n={ownerCount("")} onPress={() => setPref({ owner: "", who: "" })} />
        {ROLE_TABS.map((t) => (
          <Seg
            key={t.value}
            on={prefs.owner === t.value}
            label={t.label}
            dot={t.color}
            n={ownerCount(t.value)}
            onPress={() => setPref({ owner: t.value, who: "" })}
          />
        ))}
      </ScrollView>
      {whoOptions ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fRowLine} contentContainerStyle={styles.fRow}>
          <Text style={styles.fLabel}>{prefs.owner === "SUPERVISOR" ? "หัวหน้าภาคคนไหน" : "ทีมไหน"}</Text>
          <Pill on={!prefs.who} label="ทุกคน" n={ownerCount(prefs.owner)} onPress={() => setPref({ who: "" })} />
          {whoOptions.map(([k, o]) => (
            <Pill key={k} on={prefs.who === k} label={o.label} n={o.n} onPress={() => setPref({ who: k })} />
          ))}
        </ScrollView>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fRowLine} contentContainerStyle={styles.fRow}>
        <Text style={styles.fLabel}>สาขา</Text>
        {(["", "DODO", "COCO"] as const).map((t) => (
          <Seg key={t} on={prefs.btype === t} label={t || "ทั้งหมด"} n={typeCount(t)} onPress={() => setPref({ btype: t })} />
        ))}
        <View style={styles.fSep} />
        <Text style={styles.fLabel}>เรียง</Text>
        {SORTS.map((o) => (
          <Seg key={o.value} on={prefs.sort === o.value} label={o.label} onPress={() => setPref({ sort: o.value })} />
        ))}
      </ScrollView>
    </View>
  );
}

function Seg({ on, label, n, dot, onPress }: { on: boolean; label: string; n?: number; dot?: string; onPress: () => void }) {
  return (
    // ชื่อมีคำว่า "ตัวกรอง" นำหน้า — ข้อความบนปุ่ม (หัวหน้าภาค, DODO) ซ้ำกับป้ายในแถวรายการ
    // คนใช้โปรแกรมอ่านจอกับเทสต์จะได้แยกปุ่มกรองออกจากป้ายได้
    <TouchableOpacity
      style={[styles.seg, on && styles.segOn]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityLabel={`ตัวกรอง ${label}`}
      accessibilityState={{ selected: on }}
    >
      {dot ? <View style={[styles.segDot, { backgroundColor: dot }]} /> : null}
      <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
      {n !== undefined ? (
        <View style={[styles.segCount, on && styles.segCountOn]}>
          <Text style={[styles.segCountText, on && styles.segCountTextOn]}>{n}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function Pill({ on, label, n, onPress }: { on: boolean; label: string; n: number; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.pill, on && styles.pillOn]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityLabel={`ตัวกรอง ${label}`}
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.pillText, on && styles.pillTextOn]}>
        {label} <Text style={styles.pillN}>{n}</Text>
      </Text>
    </TouchableOpacity>
  );
}

/** ป้าย "รอใคร" ในแถว/การ์ด — บทบาท + ชื่อหัวหน้าภาคหรือทีม */
function WaitingOn({ row }: { row: WorkOrderRow }) {
  if (!row.stageActor) return null;
  const who =
    row.stageActor === "SUPERVISOR"
      ? row.waitingOnSupervisors.map((s) => s.name).join(", ") || "ยังไม่มีคนดูแล"
      : row.stageActor === "EMPLOYEE"
        ? row.waitingOnTeam
          ? `ทีม${row.waitingOnTeam}`
          : null
        : null;
  const tone = OWNER_TONE[row.stageActor];
  return (
    <View style={[styles.waitTag, { backgroundColor: tone.bg }]}>
      <Text style={[styles.waitText, { color: tone.fg }]} numberOfLines={1}>
        {ROLE_LABEL[row.stageActor]}
        {who ? <Text style={styles.waitWho}> · {who}</Text> : null}
      </Text>
    </View>
  );
}

function BranchType({ type }: { type: "DODO" | "COCO" }) {
  return (
    <View style={[styles.btype, type === "DODO" ? styles.btypeDodo : styles.btypeCoco]}>
      <Text style={[styles.btypeText, { color: type === "DODO" ? colors.warningInk : colors.primaryInk }]}>{type}</Text>
    </View>
  );
}

/** หัวตาราง — ความกว้างคอลัมน์ต้องตรงกับ WorkOrderTableRow · กด "สาขา" สลับ A→Z / Z→A */
function TableHead({ sort, onSortBranch }: { sort: Sort; onSortBranch: () => void }) {
  return (
    <View style={[styles.tr, styles.thead]}>
      <Text style={[styles.th, styles.colWo]}>ใบงาน</Text>
      <TouchableOpacity style={[styles.colBranch, styles.thSort]} onPress={onSortBranch} activeOpacity={0.7} accessibilityLabel="เรียงตามสาขา">
        <Text style={styles.th}>สาขา</Text>
        {sort === "az" || sort === "za" ? (
          <Text style={[styles.th, { color: colors.primaryInk }]}>{sort === "az" ? "▲ A→Z" : "▼ Z→A"}</Text>
        ) : (
          <Ionicons name="swap-vertical" size={13} color={colors.textFaint} />
        )}
      </TouchableOpacity>
      <Text style={[styles.th, styles.colMachine]}>เครื่อง</Text>
      <Text style={[styles.th, styles.colTeam]}>ทีม</Text>
      <Text style={[styles.th, styles.colStatus]}>สถานะ</Text>
      <Text style={[styles.th, styles.colWait]}>รอใคร</Text>
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
  const closed = row.status === "DONE";
  return (
    <TouchableOpacity style={[styles.tr, !last && styles.trLine, isHot(row) && styles.trUrgent, closed && styles.trDone]} onPress={onPress} activeOpacity={0.7}>
      {/* แถบสีซ้ายแถว — กวาดตาลงทั้งตารางแล้วเห็นว่าค้างที่ใครโดยไม่ต้องอ่านป้าย */}
      <View style={[styles.rowBar, { backgroundColor: tone.fg }]} />
      <View style={[styles.colWo, styles.cellWo]}>
        <View style={styles.rowIcon}>
          <Ionicons name="clipboard-outline" size={18} color={colors.primaryInk} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.codeRow}>
            <Text style={styles.code}>{row.code}</Text>
            {row.priority === "URGENT" ? <UrgentBadge size="sm" /> : null}
          </View>
          <Text style={styles.td2}>{row.title}</Text>
        </View>
      </View>
      <View style={styles.colBranch}>
        <View style={styles.codeRow}>
          <Text style={styles.td}>{row.branchCode}</Text>
          <BranchType type={row.branchType} />
        </View>
        <Text style={styles.td2}>{row.branchName}</Text>
      </View>
      <Text style={[styles.td, styles.colMachine]}>{row.machineCode ?? "—"}</Text>
      <Text style={[styles.td, styles.colTeam, !(row.assignedToName ?? row.assignedTeam) && styles.tdMuted]}>
        {row.assignedToName ?? row.assignedTeam ?? "ยังไม่มอบหมาย"}
      </Text>
      <View style={styles.colStatus}>
        <View style={[styles.badge, { backgroundColor: closed ? colors.card : tone.bg, alignSelf: "flex-start" }, closed && styles.badgeDone]}>
          <Text style={[styles.badgeText, { color: tone.fg }]}>{row.statusLabel}</Text>
        </View>
        {row.stageActor ? <Text style={styles.td2}>{stuckLabel(row.stageSince)}</Text> : null}
      </View>
      <View style={styles.colWait}>
        <WaitingOn row={row} />
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
  const closed = row.status === "DONE";
  return (
    <TouchableOpacity style={[styles.card, closed && styles.cardDone, { borderLeftColor: tone.fg }]} onPress={onPress} activeOpacity={0.8}>
      {isHot(row) ? <UrgentGlow radius={radius.md} /> : null}
      <View style={styles.cardTop}>
        <Text style={styles.code}>{row.code}</Text>
        {row.priority === "URGENT" ? <UrgentBadge size="sm" /> : null}
        <View style={{ flex: 1 }} />
        <View style={[styles.badge, { backgroundColor: closed ? colors.card : tone.bg }, closed && styles.badgeDone]}>
          <Text style={[styles.badgeText, { color: tone.fg }]}>{row.statusLabel}</Text>
        </View>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {row.title}
      </Text>

      <View style={styles.metaRow}>
        <Ionicons name="business-outline" size={13} color={colors.textFaint} />
        <BranchType type={row.branchType} />
        <Text style={styles.meta}>
          {row.branchCode} · {row.branchName}
          {row.machineCode ? ` · เครื่อง ${row.machineCode}` : ""}
        </Text>
      </View>

      {row.stageActor ? (
        <View style={styles.metaRow}>
          <WaitingOn row={row} />
          <Text style={styles.meta}>{stuckLabel(row.stageSince)}</Text>
        </View>
      ) : null}

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
  // ซ่อนด้วย display:none ไม่ถอดทิ้ง — ข้อความที่พิมพ์ค้างในช่องค้นหาและตำแหน่งเลื่อนของแถวชิปต้องอยู่ครบตอนกางกลับ
  headHidden: { display: "none" },
  folded: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadow.card,
  },
  foldedCount: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 10 },
  foldedCountText: { fontSize: 12, lineHeight: 22, fontWeight: "800", color: colors.primaryInk },
  foldedText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 20, fontWeight: "600", color: colors.text },
  foldedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.sky50,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
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
  colStatus: { flex: 1.6, gap: 2 },
  colWait: { flex: 1.6, minWidth: 0 },
  // พื้นแดงจาง ๆ ทั้งแถว — ตารางตัดขอบ (overflow hidden) ออร่ารอบแถวจึงใช้ไม่ได้ เหลือป้ายที่เรืองแสงแทน
  trUrgent: { backgroundColor: "#FFF7F7" },
  sepRow: { paddingHorizontal: spacing.lg, paddingVertical: 6, backgroundColor: colors.tile, borderBottomWidth: 1, borderBottomColor: colors.border },
  sepCard: { paddingHorizontal: 4, paddingTop: 2 },
  sepUrgent: { backgroundColor: colors.dangerSoft },
  sepText: { fontSize: 12, lineHeight: 18, fontWeight: "800", color: colors.textMuted },
  sepTextUrgent: { color: colors.dangerInk },
  rowBar: { position: "absolute", left: 0, top: 10, bottom: 10, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  thSort: { flexDirection: "row", alignItems: "center", gap: 4 },
  filterPanel: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: 6,
    flexShrink: 0,
  },
  fRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 4 },
  // เส้นคั่นอยู่ที่ตัว ScrollView ไม่ใช่เนื้อหาข้างใน — ไม่งั้นเส้นยาวแค่ถึงปุ่มสุดท้าย ไม่เต็มกรอบ
  fRowLine: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4, marginTop: 4 },
  fLabel: { fontSize: 12, lineHeight: 18, fontWeight: "800", color: colors.textMuted, marginRight: 2 },
  fSep: { width: 1, alignSelf: "stretch", backgroundColor: colors.border, marginHorizontal: 6 },
  seg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "transparent",
    backgroundColor: colors.tile,
  },
  segOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  segDot: { width: 8, height: 8, borderRadius: 4 },
  segText: { fontSize: 13, lineHeight: 20, fontWeight: "600", color: colors.textMuted },
  segTextOn: { color: colors.primaryInk },
  segCount: { backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 6 },
  segCountOn: { backgroundColor: colors.primary },
  segCountText: { fontSize: 11, lineHeight: 17, fontWeight: "800", color: colors.textMuted },
  segCountTextOn: { color: "#fff" },
  pill: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4, backgroundColor: colors.card },
  pillOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  pillText: { fontSize: 13, lineHeight: 20, color: colors.text },
  pillTextOn: { color: "#fff" },
  pillN: { fontWeight: "800" },
  waitTag: { alignSelf: "flex-start", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 1, maxWidth: "100%" },
  waitText: { fontSize: 12, lineHeight: 19, fontWeight: "700" },
  waitWho: { fontWeight: "500" },
  btype: { borderRadius: 5, paddingHorizontal: 5 },
  btypeDodo: { backgroundColor: colors.warningSoft },
  btypeCoco: { backgroundColor: colors.primarySoft },
  btypeText: { fontSize: 10, lineHeight: 16, fontWeight: "800" },
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
  pageTitle: { fontSize: 24, lineHeight: 34, fontWeight: "700", color: colors.text },
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
    borderLeftWidth: 4,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadow.card,
  },
  // ใบที่ปิดแล้วทั้งแถวเป็นเขียว (เจ้าของงานเลือก ต.ค. 69) — กวาดตาแล้วแยกงานจบออกจากงานค้างได้ทันที
  // ป้ายสถานะในแถวนี้จึงต้องเป็นพื้นขาว ไม่งั้นเขียวบนเขียวจนมองไม่เห็น
  cardDone: { backgroundColor: colors.doneSoft },
  trDone: { backgroundColor: colors.doneSoft },
  badgeDone: { borderWidth: 1, borderColor: colors.doneLine },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  code: { fontSize: 14, lineHeight: 21, fontWeight: "800", color: colors.primaryInk },
  badge: { borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: spacing.sm },
  badgeText: { fontSize: 11, lineHeight: 19, fontWeight: "700" },
  title: { fontSize: 15, lineHeight: 24, fontWeight: "700", color: colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  meta: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.textMuted },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
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
