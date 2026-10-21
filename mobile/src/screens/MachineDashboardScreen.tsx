import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import AppModal from "../components/AppModal";
import DateField from "../components/DateField";
import Ionicons from "@expo/vector-icons/Ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useRefreshHandler } from "../components/RefreshButton";
import UpdatePill, { useBackgroundCheck } from "../components/UpdatePill";
import { countChanges } from "../utils/liveSync";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { openUrl } from "../utils/share";
import { useAuth } from "../context/AuthContext";
import { HomeStackParamList } from "../navigation/types";
import PartPicker from "../components/PartPicker";
import { colors, radius, shadow, spacing, headingFont } from "../theme";
import { showAlert } from "../utils/alert";
import WarrantyBadge, { WARRANTY_LABEL, WarrantyState } from "../components/WarrantyBadge";

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
  /** ประกันของเครื่องนี้ (เฉพาะแท็บเครื่องดับ) — ว่าง = สาขาบริษัท */
  warranty?: WarrantyState | null;
  warrantyEndsAt?: string | null;
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
  /** ใบงานที่ยังเปิดค้างของเคสนี้ ว่าง = ยังไม่มีใครเปิด */
  workOrder: {
    id: number;
    code: string;
    status: string;
    statusLabel: string;
    assignedToName: string | null;
  } | null;
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

/** หนึ่งครั้งที่มีคนกดบันทึกอาการ/สถานะ */
interface NoteLog {
  id: number;
  by: string;
  at: string;
  symptom: string | null;
  workStatus: string | null;
  workStatusLabel: string | null;
  scheduledVisitAt: string | null;
  partsSummary: string | null;
  // มีเฉพาะในประวัติรวมของทุกเคส
  outageId?: number;
  kind?: string;
  resolved?: boolean;
  branchCode?: string;
  branchName?: string;
  machineCode?: string | null;
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

/**
 * ตัวกรองของกระดาน (แบบที่เจ้าของงานเลือกจากตัวอย่าง) — การ์ดแถวบน: ทั้งหมด · DODO · COCO · เกิน SLA ·
 * ยังไม่มีใบงาน (แยก DODO/COCO) แล้วตามด้วยชิป ภาค · รุ่น/ยี่ห้อ · และตัวกรองเพิ่มเติม
 *
 * ในหมวดเดียวกัน = ตรงอย่างใดอย่างหนึ่ง · ข้ามหมวด = ต้องตรงทุกหมวด · "NONE" = ค่าว่าง
 * (สาขาที่ทะเบียนยังไม่มีภาค / ยังไม่มีใครกรอกสถานะ) ซึ่งเป็นกลุ่มที่ต้องตามหาได้เหมือนกัน
 */
interface Filters {
  own: "COCO" | "DODO" | null;
  over: boolean;
  noWo: boolean;
  regions: string[];
  brands: string[];
  teams: string[];
  statuses: string[];
  warranties: string[];
  near: boolean;
  search: string;
}
type FilterKey = keyof Filters;
type FacetKey = "regions" | "brands" | "teams" | "statuses" | "warranties";
const FACET_KEYS: FacetKey[] = ["regions", "brands", "teams", "statuses", "warranties"];
const EMPTY_FILTERS: Filters = {
  own: null,
  over: false,
  noWo: false,
  regions: [],
  brands: [],
  teams: [],
  statuses: [],
  warranties: [],
  near: false,
  search: "",
};
/** การ์ดแถวบนนับโดยไม่สนตัวกรองของการ์ดเอง — ไม่งั้นกด DODO แล้วการ์ด COCO ขึ้น 0 ทั้งที่จริงไม่ใช่ */
const TOP_KEYS: FilterKey[] = ["own", "over", "noWo"];

/**
 * ข้อมูลของแต่ละแท็บที่โหลดล่าสุด — กลับมาหน้านี้อีกครั้งเห็นทันที แล้วค่อยอัปเดตเบื้องหลัง
 * เก็บในหน่วยความจำของแอปเท่านั้น ปิดแอป/รีเฟรชเว็บแล้วโหลดใหม่
 */
const DATA_CACHE: Partial<Record<Tab, DashboardResponse>> = {};

/**
 * ชุดตัวกรองที่บันทึกไว้เรียกใช้ซ้ำ — เก็บในเครื่องที่ใช้ (AsyncStorage) แยกตามผู้ใช้
 * ไม่ได้เก็บที่เซิร์ฟเวอร์ เพราะเป็นความสะดวกส่วนตัว ไม่ใช่ข้อมูลที่ต้องเห็นร่วมกัน
 */
interface SavedView {
  name: string;
  tab: Tab;
  filters?: Filters;
  sortKey: SortKey;
  sortAsc: boolean;
  groupBy: GroupKey;
  // รูปแบบเดิมก่อนมีชิป — มุมมองที่คนบันทึกไว้แล้วต้องยังเปิดได้
  quick?: "all" | "over" | "COCO" | "DODO" | "nowo";
  region?: string | null;
  search?: string;
  brand?: string | null;
  workStatus?: string | null;
  slaLevel?: "over" | "near" | null;
}

function viewFilters(v: SavedView): Filters {
  if (v.filters) return { ...EMPTY_FILTERS, ...v.filters };
  return {
    ...EMPTY_FILTERS,
    own: v.quick === "COCO" || v.quick === "DODO" ? v.quick : null,
    over: v.quick === "over" || v.slaLevel === "over",
    noWo: v.quick === "nowo",
    near: v.slaLevel === "near",
    regions: v.region ? [v.region] : [],
    brands: v.brand ? [v.brand] : [],
    statuses: v.workStatus ? [v.workStatus] : [],
    search: v.search ?? "",
  };
}

function isEmptyFilters(f: Filters) {
  return (
    !f.own && !f.over && !f.noWo && !f.near && !f.search.trim() &&
    !f.regions.length && !f.brands.length && !f.teams.length && !f.statuses.length && !f.warranties.length
  );
}

const NONE_LABEL: Record<FacetKey, string> = {
  regions: "ยังไม่ระบุภาค",
  brands: "ไม่ระบุยี่ห้อ",
  teams: "ยังไม่ระบุทีม",
  statuses: "ยังไม่ระบุสถานะ",
  warranties: "สาขาบริษัท",
};
const FACET_TITLE: Record<FacetKey, string> = {
  regions: "ภาค",
  brands: "รุ่น",
  teams: "ทีม",
  statuses: "สถานะ",
  warranties: "ประกัน",
};

const GRADE_STYLE: Record<string, { color: string; background: string }> = {
  A: { color: colors.successInk, background: colors.successSoft },
  B: { color: colors.primaryInk, background: colors.primarySoft },
  C: { color: colors.textMuted, background: colors.tile },
};

/**
 * สีของสถานะ — ให้กวาดตาแล้วรู้ทันทีว่าเคสไหนติดอยู่ที่ใคร
 * ค่าที่ใช้ได้มาจาก WORK_STATUSES ฝั่ง backend ตรงนี้แค่ให้สีเท่านั้น
 */
const STATUS_STYLE: Record<string, { color: string; background: string }> = {
  WAITING_PARTS: { color: colors.warningInk, background: colors.warningSoft },
  // ระบบตั้งให้ — ใบงานถึงขั้นเช็คอะไหล่แต่แอดมินยังไม่ตอบ (ม่วง = รอแอดมิน แบบเดียวกับรายการใบงาน)
  CHECKING_PARTS: { color: colors.roleAdmin, background: colors.roleAdminSoft },
  // ระบบตั้งให้ — ขั้นเสนอราคา แอดมินยังไม่ได้ส่งราคา (ม่วง = รอแอดมิน)
  QUOTING: { color: colors.roleAdmin, background: colors.roleAdminSoft },
  WAITING_TECH: { color: colors.primaryInk, background: colors.primarySoft },
  WAITING_PAYMENT: { color: colors.warningInk, background: colors.warningSoft },
  WAITING_CUSTOMER: { color: colors.warningInk, background: colors.warningSoft },
  IN_PROGRESS: { color: colors.successInk, background: colors.successSoft },
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
  // หน้านี้เป็นตาราง ขอความกว้างเต็มที่แทนคอลัมน์แคบๆ ที่หน้าฟอร์มใช้

  const { width } = useWindowDimensions();
  // ตารางหลายคอลัมน์อ่านไม่ได้บนจอมือถือ จอแคบจึงเปลี่ยนเป็นการ์ดแทน
  const wide = width >= 700;
  // จอคอมเต็มๆ ยุบแถบตัวกรองให้เตี้ยลง จะได้เห็นแถวข้อมูลมากขึ้นต่อหนึ่งหน้าจอ
  const roomy = width >= 1000;
  /**
   * ความกว้างที่ตารางมีจริง = ความกว้างของหน้านี้ที่วัดได้ ลบ padding ของหน้า ของการ์ดกลุ่ม และเส้นขอบ
   *
   * วัดจากหน้าจริง ไม่ใช่ความกว้างหน้าต่าง เพราะบนจอคอมมีเมนูข้างกินไป 280 px
   * และแถบเลื่อนแนวตั้งอีกราว 16 px — คิดจากหน้าต่างแล้วคอลัมน์ขวาสุดล้นออกนอกจอ
   */
  const [pageWidth, setPageWidth] = useState(width);
  const scrollbar = Platform.OS === "web" ? 16 : 0;
  // หักขอบหน้า (lg ซ้ายขวา) · ขอบการ์ดกลุ่ม 2 px · ช่องในแถวตาราง 14 ซ้ายขวา
  const tableWidth = pageWidth - scrollbar - spacing.lg * 2 - 2 - 14 * 2;
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>("machines");
  const [data, setData] = useState<DashboardResponse | null>(DATA_CACHE.machines ?? null);
  const [loading, setLoading] = useState(!DATA_CACHE.machines);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * ตัวกรองทั้งหมดทำในเครื่อง — โหลดทุกเคสของแท็บครั้งเดียว (ราว 400 แถว) แล้วกรองบนจอ
   * เดิมภาค/สถานะ/คำค้นถามเซิร์ฟเวอร์ใหม่ทุกครั้ง ฐานข้อมูลอยู่ไกล กดแต่ละทีรอหลายวินาที
   */
  const [f, setF] = useState<Filters>(EMPTY_FILTERS);
  const patch = useCallback((next: Partial<Filters>) => setF((cur) => ({ ...cur, ...next })), []);
  const toggle = useCallback(
    (key: FacetKey, value: string) =>
      setF((cur) => ({
        ...cur,
        [key]: cur[key].includes(value) ? cur[key].filter((v) => v !== value) : [...cur[key], value],
      })),
    []
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const [allTeams, setAllTeams] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [tabCounts, setTabCounts] = useState<{ machineOff: number; signalLost: number } | null>(null);
  const [views, setViews] = useState<SavedView[]>([]);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupKey>("region");
  const [sortKey, setSortKey] = useState<SortKey>("slaHours");
  const [sortAsc, setSortAsc] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [statusOptions, setStatusOptions] = useState<WorkStatusOption[]>([]);
  const [editing, setEditing] = useState<OutageRow | null>(null);
  const [showActivity, setShowActivity] = useState(false);

  /**
   * ใบงานของเคสหนึ่ง — มีแล้วเปิดดู ยังไม่มีก็ไปหน้าเปิดใบงาน
   *
   * ไม่เปิดใบงานให้ทันทีที่กด เพราะยังต้องเลือกความเร่งด่วนกับช่างก่อน
   * และการกดพลาดบนกระดานที่มีสี่ร้อยแถวไม่ควรสร้างงานจริงขึ้นมาเงียบๆ
   */
  const openWorkOrder = useCallback(
    (row: OutageRow) => {
      if (row.workOrder) {
        navigation.navigate("WorkOrderDetail", { id: row.workOrder.id });
        return;
      }
      // เปิดฟอร์มให้กรอกจนจบแล้วค่อยโดนเซิร์ฟเวอร์ปฏิเสธ แย่กว่าบอกตั้งแต่กด
      if (user?.partsAdmin) {
        showAlert("ดูได้อย่างเดียว", "Admin Spare Part เปิดใบงานไม่ได้ — ให้แอดมินหรือหัวหน้าภาคเปิด");
        return;
      }
      navigation.navigate("WorkOrderForm", {
        outageId: row.id,
        branchCode: row.branchCode,
        // ส่งรหัสเครื่องไปด้วย ฟอร์มจะได้เติมรุ่นกับขนาดที่เคยกรอกไว้ให้
        // สัญญาณหายเป็นปัญหาระดับสาขา ไม่มีเครื่องให้ส่ง
        machineCode: row.machineCode ?? undefined,
      });
    },
    [navigation, user?.partsAdmin]
  );

  const load = useCallback(
    async (opts: { refresh?: boolean } = {}) => {
      const cached = DATA_CACHE[tab];
      if (opts.refresh) setRefreshing(true);
      else if (cached) setUpdating(true);
      else setLoading(true);
      setError(null);
      try {
        // ไม่ส่งตัวกรองไป — เอาทุกเคสของแท็บ แล้วกรองบนจอ
        const res = await api.get<DashboardResponse>(tab === "machines" ? "/machines/outages" : "/machines/signal-lost");
        DATA_CACHE[tab] = res.data;
        setData(res.data);
      } catch (e) {
        setError(apiErrorMessage(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
        setUpdating(false);
      }
    },
    [tab]
  );

  // ตัวเลขบนแท็บทั้งสอง — ต้องเห็นของแท็บที่ไม่ได้เปิดอยู่ด้วย
  useFocusEffect(
    useCallback(() => {
      api
        .get<{ machineOff: number; signalLost: number }>("/machines/overview")
        .then((res) => setTabCounts(res.data))
        .catch(() => undefined);
    }, [])
  );

  // มุมมองที่บันทึกไว้ของคนนี้ในเครื่องนี้
  const viewsKey = `otteri-monitor-views:${user?.id ?? 0}`;
  useEffect(() => {
    AsyncStorage.getItem(viewsKey)
      .then((raw) => setViews(raw ? (JSON.parse(raw) as SavedView[]) : []))
      .catch(() => setViews([]));
  }, [viewsKey]);
  function storeViews(next: SavedView[]) {
    setViews(next);
    AsyncStorage.setItem(viewsKey, JSON.stringify(next)).catch(() => undefined);
  }
  function currentView(name: string): SavedView {
    return { name, tab, filters: f, sortKey, sortAsc, groupBy };
  }

  /**
   * จำตัวกรองล่าสุดของแต่ละแท็บ (ไม่รวมคำค้น) — เปิดหน้านี้ใหม่ได้แบบที่ดูค้างไว้
   * โหลดค่าที่จำไว้ให้เสร็จก่อนค่อยเริ่มบันทึก ไม่งั้นค่าว่างตอนเปิดหน้าจะเขียนทับของเดิม
   */
  const lastKey = `otteri-monitor-last:${user?.id ?? 0}:${tab}`;
  const [restoredKey, setRestoredKey] = useState<string | null>(null);
  const pendingView = React.useRef<SavedView | null>(null);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(lastKey)
      .then((raw) => {
        if (!alive) return;
        const v = pendingView.current;
        pendingView.current = null;
        if (v) {
          setF(viewFilters(v));
          setSortKey(v.sortKey);
          setSortAsc(v.sortAsc);
          setGroupBy(v.groupBy);
        } else if (raw) {
          const saved = JSON.parse(raw) as { filters: Filters; sortKey: SortKey; sortAsc: boolean; groupBy: GroupKey };
          setF({ ...EMPTY_FILTERS, ...saved.filters, search: "" });
          setSortKey(saved.sortKey);
          setSortAsc(saved.sortAsc);
          setGroupBy(saved.groupBy);
        } else setF(EMPTY_FILTERS);
      })
      .catch(() => undefined)
      .finally(() => alive && setRestoredKey(lastKey));
    return () => {
      alive = false;
    };
  }, [lastKey]);
  useEffect(() => {
    if (restoredKey !== lastKey) return;
    AsyncStorage.setItem(lastKey, JSON.stringify({ filters: { ...f, search: "" }, sortKey, sortAsc, groupBy })).catch(
      () => undefined
    );
  }, [f, sortKey, sortAsc, groupBy, restoredKey, lastKey]);

  function applyView(v: SavedView) {
    if (v.tab !== tab) {
      // แท็บใหม่จะโหลดตัวกรองที่จำไว้ของมันเอง — ฝากมุมมองไว้ให้ใช้แทน
      pendingView.current = v;
      switchTab(v.tab);
      return;
    }
    setF(viewFilters(v));
    setSortKey(v.sortKey);
    setSortAsc(v.sortAsc);
    setGroupBy(v.groupBy);
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  /**
   * ปุ่ม "มีอัปเดต" (ต.ค. 69 แบบ Facebook) — เช็คเคสใหม่/เคสที่เปลี่ยนทุก 1 นาที แต่ไม่สลับตารางให้เอง
   * ไม่นับชั่วโมงที่ค้าง/คะแนน/เกิน SLA ซึ่งขยับเองตามเวลา ไม่งั้นทุกรอบขึ้นว่ามีอัปเดต
   */
  const rowSig = (r: OutageRow) => {
    const { slaHours: _h, score: _s, breached: _b, ...rest } = r;
    return JSON.stringify(rest);
  };
  const dataRef = useRef(data);
  dataRef.current = data;
  const pendingData = useRef<DashboardResponse | null>(null);
  const [newCount, setNewCount] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const fetchTab = useCallback(
    async () =>
      (await api.get<DashboardResponse>(tab === "machines" ? "/machines/outages" : "/machines/signal-lost")).data,
    [tab]
  );
  const applyData = (d: DashboardResponse) => {
    DATA_CACHE[tab] = d;
    setData(d);
    pendingData.current = null;
    setNewCount(0);
  };
  // เปลี่ยนแท็บ = ของที่ค้างไว้เป็นของอีกแท็บ
  useEffect(() => {
    pendingData.current = null;
    setNewCount(0);
  }, [tab]);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  useBackgroundCheck(async () => {
    const t = tab;
    const d = await fetchTab();
    // ระหว่างรอ คนสลับแท็บไปแล้ว — ผลนี้เป็นของแท็บเดิม
    if (t !== tabRef.current || !dataRef.current) return;
    const n = countChanges(dataRef.current.rows, d.rows, (r) => r.id, rowSig).changed;
    if (n > 0) {
      pendingData.current = d;
      setNewCount(n);
    }
  });
  useRefreshHandler(async () => {
    const d = await fetchTab();
    const n = dataRef.current ? countChanges(dataRef.current.rows, d.rows, (r) => r.id, rowSig).changed : d.rows.length;
    applyData(d);
    return { changed: n, unit: "เคส" };
  });

  // รายการสถานะมาจาก backend เพื่อไม่ให้มีสองที่ที่ต้องแก้ตอนเพิ่มสถานะใหม่
  useEffect(() => {
    api
      .get<WorkStatusOption[]>("/machines/work-statuses")
      .then((res) => setStatusOptions(res.data))
      .catch(() => setStatusOptions([]));
  }, []);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const nearHours = (data?.slaHours ?? 72) * 0.6;
  // ข้อความที่ค้นได้ของแต่ละแถว ทำครั้งเดียวต่อการโหลด ไม่ใช่ทุกครั้งที่พิมพ์
  const hay = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rows) {
      m.set(
        r.id,
        [r.branchCode, r.branchName, r.machineCode, r.machineBrand, r.zone, r.region, r.symptom, r.workOrder?.code]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
      );
    }
    return m;
  }, [rows]);
  const words = useMemo(() => f.search.toLowerCase().split(/\s+/).filter(Boolean), [f.search]);
  const valueOf = useCallback((r: OutageRow, key: FacetKey) => {
    if (key === "regions") return r.region ?? "NONE";
    if (key === "brands") return r.machineBrand ?? "NONE";
    if (key === "teams") return r.zone ?? "NONE";
    if (key === "warranties") return r.warranty ?? "NONE";
    return r.workStatus ?? "NONE";
  }, []);

  /** แถวนี้ผ่านตัวกรองไหม — skip = หมวดที่ไม่ต้องดู (ใช้นับตัวเลขบนชิป/การ์ดของหมวดนั้นเอง) */
  const test = useCallback(
    (r: OutageRow, skip: FilterKey[] = []) => {
      const use = (k: FilterKey) => !skip.includes(k);
      if (use("search") && words.length) {
        const h = hay.get(r.id) ?? "";
        if (!words.every((w) => h.includes(w))) return false;
      }
      if (use("own") && f.own && r.ownership !== f.own) return false;
      if (use("over") && f.over && !r.breached) return false;
      if (use("noWo") && f.noWo && r.workOrder) return false;
      if (use("near") && f.near && (r.breached || r.slaHours <= nearHours)) return false;
      for (const k of FACET_KEYS) {
        if (use(k) && f[k].length && !f[k].includes(valueOf(r, k))) return false;
      }
      return true;
    },
    [f, words, hay, nearHours, valueOf]
  );

  const visibleRows = useMemo(() => rows.filter((r) => test(r)), [rows, test]);

  /** ตัวเลขบนการ์ดแถวบน — นับตามตัวกรองอื่น (ภาค รุ่น คำค้น) แต่ไม่สนการ์ดด้วยกันเอง */
  const tiles = useMemo(() => {
    const base = rows.filter((r) => test(r, TOP_KEYS));
    const noWo = base.filter((r) => !r.workOrder);
    return {
      all: base.length,
      DODO: base.filter((r) => r.ownership === "DODO").length,
      COCO: base.filter((r) => r.ownership === "COCO").length,
      over: base.filter((r) => r.breached).length,
      noWo: noWo.length,
      noWoDODO: noWo.filter((r) => r.ownership === "DODO").length,
      noWoCOCO: noWo.filter((r) => r.ownership === "COCO").length,
    };
  }, [rows, test]);

  /** ตัวเลือกของหมวดหนึ่ง พร้อมจำนวนถ้ากดเพิ่ม — ค่าที่มีในข้อมูลขึ้นครบ แม้ตอนนี้จะเหลือ 0 */
  const facetOptions = useCallback(
    (key: FacetKey, labelOf: (v: string) => string) => {
      const counts = new Map<string, number>();
      for (const r of rows) if (!counts.has(valueOf(r, key))) counts.set(valueOf(r, key), 0);
      for (const r of rows) if (test(r, [key])) counts.set(valueOf(r, key), (counts.get(valueOf(r, key)) ?? 0) + 1);
      return [...counts].map(([value, count]) => ({
        value,
        label: value === "NONE" ? NONE_LABEL[key] : labelOf(value),
        count,
        on: f[key].includes(value),
      }));
    },
    [rows, test, valueOf, f]
  );
  const statusLabel = useCallback(
    (v: string) => statusOptions.find((o) => o.value === v)?.label ?? rows.find((r) => r.workStatus === v)?.workStatusLabel ?? v,
    [statusOptions, rows]
  );
  const regionOpts = useMemo(
    () => facetOptions("regions", (v) => v).sort((a, b) => (a.value === "NONE" ? 1 : b.value === "NONE" ? -1 : a.label.localeCompare(b.label, "th"))),
    [facetOptions]
  );
  const brandOpts = useMemo(() => facetOptions("brands", (v) => v).sort((a, b) => a.label.localeCompare(b.label)), [facetOptions]);
  const statusOpts = useMemo(() => facetOptions("statuses", statusLabel), [facetOptions, statusLabel]);
  // ประกันมีความหมายเฉพาะ DODO — สาขาบริษัท (NONE) ไม่ขึ้นเป็นชิป · เรียงจากดีไปแย่ ไม่ใช่ตามตัวอักษร
  const warrantyOpts = useMemo(() => {
    const order: WarrantyState[] = ["IN", "SOON", "OUT", "UNKNOWN"];
    return facetOptions("warranties", (v) => WARRANTY_LABEL[v as WarrantyState] ?? v)
      .filter((o) => o.value !== "NONE")
      .sort((a, b) => order.indexOf(a.value as WarrantyState) - order.indexOf(b.value as WarrantyState));
  }, [facetOptions]);
  /**
   * ทีมมีราว 25 ทีม — เลือกภาคแล้วเหลือเฉพาะทีมในภาคนั้น ไม่เลือกภาคโชว์ 8 ทีมที่มีเคสมากสุด
   * (ทีมที่เลือกอยู่ขึ้นเสมอ ไม่งั้นเอาออกไม่ได้)
   */
  const teamView = useMemo(() => {
    const all = facetOptions("teams", (v) => v).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "th"));
    if (f.regions.length) {
      const inRegion = new Set(rows.filter((r) => f.regions.includes(r.region ?? "NONE")).map((r) => r.zone ?? "NONE"));
      return { shown: all.filter((o) => o.on || inRegion.has(o.value)), hidden: 0 };
    }
    if (allTeams || all.length <= 8) return { shown: all, hidden: 0 };
    const top = new Set(all.slice(0, 8).map((o) => o.value));
    const shown = all.filter((o) => o.on || top.has(o.value));
    return { shown, hidden: all.length - shown.length };
  }, [facetOptions, f.regions, rows, allTeams]);
  const nearCount = useMemo(() => rows.filter((r) => test(r, ["near"]) && !r.breached && r.slaHours > nearHours).length, [rows, test, nearHours]);

  /** ป้ายในแถบ "กำลังกรอง" — กด × เอาออกทีละอัน */
  const pills = useMemo(() => {
    const out: { key: string; label: string; remove: () => void }[] = [];
    if (f.search.trim()) out.push({ key: "q", label: `ค้น "${f.search.trim()}"`, remove: () => patch({ search: "" }) });
    if (f.own) out.push({ key: "own", label: f.own, remove: () => patch({ own: null }) });
    if (f.over) out.push({ key: "over", label: "เกิน SLA", remove: () => patch({ over: false }) });
    if (f.noWo) out.push({ key: "noWo", label: "ยังไม่มีใบงาน", remove: () => patch({ noWo: false }) });
    if (f.near) out.push({ key: "near", label: "ใกล้เกิน SLA", remove: () => patch({ near: false }) });
    for (const k of FACET_KEYS) {
      for (const v of f[k]) {
        const label =
          v === "NONE" ? NONE_LABEL[k] : k === "statuses" ? statusLabel(v) : k === "warranties" ? WARRANTY_LABEL[v as WarrantyState] : v;
        out.push({ key: `${k}:${v}`, label: `${FACET_TITLE[k]}: ${label}`, remove: () => toggle(k, v) });
      }
    }
    return out;
  }, [f, patch, toggle, statusLabel]);

  /**
   * ส่งออกเฉพาะที่เห็นบนจอ ตามลำดับบนจอ (รวมกลุ่มที่พับไว้)
   * ส่งไปแค่รหัสเคส เซิร์ฟเวอร์สร้างไฟล์จากข้อมูลจริงเอง
   */
  async function exportExcel() {
    const ids = groups.flatMap((g) => g.rows.map((r) => r.id));
    if (ids.length === 0) {
      showAlert("ไม่มีรายการ", "ไม่มีรายการให้ส่งออกตามตัวกรองที่เลือก");
      return;
    }
    const filters = pills.map((p) => p.label).join(" · ");
    setExporting(true);
    try {
      const res = await api.post<{ path: string }>(
        "/machines/export",
        { tab, ids, filters: filters || undefined },
        { loadingText: "กำลังสร้างไฟล์ Excel..." }
      );
      const url = resolveImageUrl(res.data.path);
      if (url) await openUrl(url);
    } catch (e) {
      showAlert("ส่งออกไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  /**
   * อัปเดตแถวในหน้าเลย ไม่ต้องโหลดใหม่ทั้งตารางเพราะแก้ทีละเคส
   * ถ้ากำลังกรองด้วยสถานะอยู่แล้วแถวนั้นเปลี่ยนไปไม่ตรงเงื่อนไข ให้หายออกจากรายการ
   */
  // แถวที่ไม่ตรงตัวกรองแล้ว (เช่นเปลี่ยนสถานะ) หายจากจอเองเพราะกรองบนจอ
  const applyNote = useCallback(
    (updated: OutageRow) => {
      setData((current) => {
        if (!current) return current;
        const next = { ...current, rows: current.rows.map((r) => (r.id === updated.id ? updated : r)) };
        DATA_CACHE[tab] = next;
        return next;
      });
    },
    [tab]
  );

  const groups = useMemo(() => {
    if (!data) return [];
    const order: string[] = [];
    const buckets = new Map<string, OutageRow[]>();
    const labelOf = (row: OutageRow) =>
      (groupBy === "ownership" ? row.ownership : groupBy === "region" ? row.region : row.zone) ??
      (groupBy === "ownership" ? "ไม่ระบุเจ้าของ" : groupBy === "region" ? "ยังไม่ระบุภาค" : "ยังไม่ระบุทีมช่าง");

    for (const row of visibleRows) {
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
  }, [data, visibleRows, groupBy, sortKey, sortAsc]);

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
    setData(DATA_CACHE[next] ?? null);
    setLoading(!DATA_CACHE[next]);
    setCollapsed({});
  }

  const slaHours = data?.slaHours ?? 72;
  const isMachines = tab === "machines";

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load({ refresh: true })} />
      }
    >
      {/* หัวหน้า: ชื่อหน้า + ป้ายเวลาข้อมูลแถวเดียวกัน ปุ่มอยู่ขวาบน (ตามตัวอย่างที่เจ้าของงานเลือก) */}
      <View style={styles.topRow}>
        <Text style={[styles.pageTitle, headingFont]}>ติดตามเครื่องเสีย</Text>
        {data ? (
          <View style={styles.stamp}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={styles.stampText}>
              ข้อมูล ณ {formatDateTime(data.now)} น.{updating ? " · กำลังอัปเดต…" : ""}
            </Text>
          </View>
        ) : null}
        <View style={{ flexGrow: 1 }} />
        <View style={styles.topActions}>
          <HeadButton icon="time-outline" label="ประวัติการกรอก" onPress={() => setShowActivity(true)} />
          {user?.role === "ADMIN" ? (
            <HeadButton
              icon="cloud-upload-outline"
              label="อัปโหลดไฟล์รอบใหม่"
              onPress={() => navigation.navigate("MachineImport")}
            />
          ) : null}
          <HeadButton icon="download-outline" label="ส่งออก Excel" onPress={exportExcel} disabled={exporting || !data} />
        </View>
      </View>

      <View style={styles.bigTabs}>
        <BigTab
          active={isMachines}
          icon="power"
          label="เครื่องดับ"
          en="Power Off"
          count={tabCounts?.machineOff}
          onPress={() => switchTab("machines")}
        />
        <BigTab
          active={!isMachines}
          icon="cloud-offline-outline"
          label="สัญญาณหาย"
          en="Offline Telemetry"
          count={tabCounts?.signalLost}
          onPress={() => switchTab("signal")}
        />
      </View>

      {/*
        การ์ดตัวเลข 4 ใบ — นับจากที่เซิร์ฟเวอร์ส่งมา (ภาค ค้นหา สถานะ) ไม่ได้นับตามชิปลัด
        กดชิปแล้วภาพรวมด้านบนไม่ควรเปลี่ยนตาม ไม่งั้นดูไม่ออกว่าปัญหาทั้งหมดมีเท่าไหร่
      */}
      <View style={styles.summaryRow}>
        <KpiCard
          label={isMachines ? "เครื่องดับทั้งหมด" : "สาขาสัญญาณหายทั้งหมด"}
          value={data?.summary.total ?? 0}
          unit={isMachines ? "เครื่อง" : "สาขา"}
          foot={
            isMachines
              ? `ใน ${data?.summary.branchesAffected ?? 0} สาขา · COCO ${data?.summary.COCO ?? 0} · DODO ${data?.summary.DODO ?? 0}`
              : `กระทบ ${data?.summary.machinesAffected ?? 0} เครื่อง · COCO ${data?.summary.COCO ?? 0} · DODO ${data?.summary.DODO ?? 0}`
          }
          tone="primary"
          icon={isMachines ? "power" : "cloud-offline-outline"}
          wide={wide}
        />
        <KpiCard
          label={`เกิน SLA ${slaHours} ชม.`}
          badge={(data?.summary.breached ?? 0) > 0 ? "วิกฤต" : undefined}
          value={data?.summary.breached ?? 0}
          unit="เคส"
          foot={
            data?.summary.total
              ? `สัดส่วน ${((data.summary.breached / data.summary.total) * 100).toFixed(1)}% ของปัญหา`
              : "ไม่มีเคสค้าง"
          }
          action={(data?.summary.breached ?? 0) > 0 ? { label: "ต้องเร่งก่อน", onPress: () => patch({ over: true }) } : undefined}
          tone="red"
          crit
          icon="warning"
          wide={wide}
        />
        <KpiCard
          label="คะแนนความเสียหายสะสม"
          value={data?.summary.totalScore ?? 0}
          unit="คะแนน"
          foot="คำนวณถ่วงน้ำหนักตามเวลา"
          footRight={`+${data?.scorePerDay ?? 1} คะแนน / วัน / เคส`}
          tone="primary"
          icon="speedometer"
          wide={wide}
        />
        <KpiCard
          label="มีใบงานซ่อมแล้ว"
          value={data ? data.rows.filter((r) => r.workOrder).length : 0}
          unit={`/ ${data?.rows.length ?? 0}`}
          progress={data && data.rows.length ? data.rows.filter((r) => r.workOrder).length / data.rows.length : 0}
          progressLabel="อัตราเปิดใบงาน"
          tone="primary"
          icon="clipboard"
          wide={wide}
        />
      </View>

      {/*
        แผงตัวกรอง — การ์ดแถวบน → ชิปภาค · รุ่น → ตัวกรองเพิ่มเติม → แถบกำลังกรอง → เรียง/จัดกลุ่ม
        ทุกอย่างกรองบนจอทันที ตัวเลขบนการ์ดและชิปบอกล่วงหน้าว่ากดแล้วเหลือเท่าไร
      */}
      <View style={styles.panel}>
        <View style={styles.panelRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={17} color={colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            value={f.search}
            onChangeText={(t) => patch({ search: t })}
            placeholder={isMachines ? "ค้นรหัสสาขา ชื่อสาขา เครื่อง ยี่ห้อ หรือทีม" : "ค้นรหัสสาขา ชื่อสาขา หรือทีม"}
            placeholderTextColor={colors.textFaint}
            returnKeyType="search"
            accessibilityLabel="ค้นหาในกระดาน"
          />
          {f.search ? (
            <TouchableOpacity onPress={() => patch({ search: "" })} accessibilityLabel="ล้างคำค้น">
              <Ionicons name="close-circle-outline" size={18} color={colors.textFaint} />
            </TouchableOpacity>
          ) : null}
        </View>
        </View>

        <View style={styles.tiles}>
          <FilterTile
            label="ทั้งหมด"
            count={tiles.all}
            unit={(isMachines ? "เครื่อง" : "สาขา")}
            on={!f.own && !f.over && !f.noWo}
            onPress={() => patch({ own: null, over: false, noWo: false })}
            wide={wide}
          />
          <FilterTile
            label="DODO แฟรนไชส์"
            count={tiles.DODO}
            unit={(isMachines ? "เครื่อง" : "สาขา")}
            on={f.own === "DODO" && !f.noWo}
            onPress={() => patch(f.own === "DODO" && !f.noWo ? { own: null } : { own: "DODO", noWo: false })}
            wide={wide}
          />
          <FilterTile
            label="COCO สาขาตรง"
            count={tiles.COCO}
            unit={(isMachines ? "เครื่อง" : "สาขา")}
            on={f.own === "COCO" && !f.noWo}
            onPress={() => patch(f.own === "COCO" && !f.noWo ? { own: null } : { own: "COCO", noWo: false })}
            wide={wide}
          />
          <FilterTile
            label={`เกิน SLA ${slaHours} ชม.`}
            count={tiles.over}
            unit={(isMachines ? "เครื่อง" : "สาขา")}
            red
            on={f.over}
            onPress={() => patch({ over: !f.over })}
            wide={wide}
          />
          <NoWorkOrderTile
            count={tiles.noWo}
            dodo={tiles.noWoDODO}
            coco={tiles.noWoCOCO}
            unit={(isMachines ? "เครื่อง" : "สาขา")}
            on={f.noWo}
            own={f.noWo ? f.own : null}
            onMain={() => patch(f.noWo && !f.own ? { noWo: false } : { noWo: true, own: null })}
            onPart={(o) => patch(f.noWo && f.own === o ? { noWo: false, own: null } : { noWo: true, own: o })}
            wide={wide}
          />
        </View>

        <ChipRow label="ภาค" options={regionOpts} onToggle={(v) => toggle("regions", v)} wide={wide} />
        {isMachines ? (
          <ChipRow label="รุ่น / ยี่ห้อ" options={brandOpts} onToggle={(v) => toggle("brands", v)} wide={wide} />
        ) : null}
        {isMachines && warrantyOpts.length ? (
          <ChipRow label="ประกัน" options={warrantyOpts} onToggle={(v) => toggle("warranties", v)} wide={wide} />
        ) : null}

        <TouchableOpacity style={styles.moreBtn} onPress={() => setMoreOpen((v) => !v)} accessibilityLabel="ตัวกรองเพิ่มเติม">
          <Ionicons name={moreOpen ? "chevron-up" : "chevron-down"} size={15} color={colors.primaryInk} />
          <Text style={styles.moreBtnText}>
            {moreOpen ? "ซ่อนตัวกรองเพิ่มเติม" : "ตัวกรองเพิ่มเติม — ทีมช่าง · สถานะงานซ่อม · ใกล้เกิน SLA"}
            {f.teams.length + f.statuses.length + (f.near ? 1 : 0) > 0
              ? ` (${f.teams.length + f.statuses.length + (f.near ? 1 : 0)})`
              : ""}
          </Text>
        </TouchableOpacity>
        {moreOpen ? (
          <>
            <ChipRow
              label="ทีมช่าง"
              options={teamView.shown}
              onToggle={(v) => toggle("teams", v)}
              wide={wide}
              extra={
                teamView.hidden > 0 ? (
                  <TouchableOpacity onPress={() => setAllTeams(true)} style={styles.chipMore}>
                    <Text style={styles.moreBtnText}>+ อีก {teamView.hidden} ทีม</Text>
                  </TouchableOpacity>
                ) : allTeams && !f.regions.length ? (
                  <TouchableOpacity onPress={() => setAllTeams(false)} style={styles.chipMore}>
                    <Text style={styles.moreBtnText}>ย่อ</Text>
                  </TouchableOpacity>
                ) : null
              }
            />
            <ChipRow label="สถานะงานซ่อม" options={statusOpts} onToggle={(v) => toggle("statuses", v)} wide={wide} />
            <ChipRow
              label="ความวิกฤต SLA"
              options={[{ value: "near", label: "ใกล้เกิน (ใช้ไปเกิน 60%)", count: nearCount, on: f.near, tone: "amber" }]}
              onToggle={() => patch({ near: !f.near })}
              wide={wide}
            />
          </>
        ) : null}

        <View style={styles.activeBar}>
          <Text style={styles.activeCount}>
            {visibleRows.length}{" "}
            <Text style={styles.activeOf}>
              จาก {rows.length} {(isMachines ? "เครื่อง" : "สาขา")}
            </Text>
          </Text>
          {pills.length ? (
            <Text style={styles.activeLabel}>กำลังกรอง</Text>
          ) : (
            <Text style={styles.activeHint}>ยังไม่ได้กรอง — กดการ์ดหรือชิปด้านบน</Text>
          )}
          {pills.map((p) => (
            <View key={p.key} style={styles.pill}>
              <Text style={styles.pillText}>{p.label}</Text>
              <TouchableOpacity onPress={p.remove} style={styles.pillX} accessibilityLabel={`เอาตัวกรอง ${p.label} ออก`}>
                <Ionicons name="close" size={13} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
          {pills.length ? (
            <TouchableOpacity onPress={() => setF(EMPTY_FILTERS)} accessibilityLabel="ล้างตัวกรองทั้งหมด">
              <Text style={styles.clearAll}>ล้างทั้งหมด</Text>
            </TouchableOpacity>
          ) : null}
          <View style={{ flexGrow: 1 }} />
          <TouchableOpacity style={styles.saveView} onPress={() => setViewsOpen(true)} accessibilityLabel="บันทึกมุมมอง">
            <Ionicons name="bookmark-outline" size={15} color={colors.primaryInk} />
            <Text style={styles.moreBtnText}>บันทึกมุมมอง</Text>
          </TouchableOpacity>
        </View>

        {views.length > 0 ? (
          <View style={styles.viewsRow}>
            <Text style={styles.viewsLabel}>มุมมองของฉัน</Text>
            {views.map((v) => (
              <TouchableOpacity key={v.name} style={styles.viewChip} onPress={() => applyView(v)} activeOpacity={0.75}>
                <Ionicons name="bookmark" size={13} color={colors.primaryInk} />
                <Text style={styles.viewChipText}>{v.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={styles.sortRow}>
          <Text style={styles.segLabel}>เรียง</Text>
          <Seg
            value={`${sortKey}:${sortAsc ? "asc" : "desc"}`}
            options={[
              { value: "slaHours:desc", label: "ดับนานสุด" },
              { value: "slaHours:asc", label: "ดับล่าสุด" },
              { value: "score:desc", label: "คะแนน" },
              { value: "branchCode:asc", label: "รหัสสาขา" },
            ]}
            onChange={(v) => {
              const [k, dir] = v.split(":");
              setSortKey(k as SortKey);
              setSortAsc(dir === "asc");
            }}
          />
          <Text style={styles.segLabel}>จัดกลุ่ม</Text>
          <Seg value={groupBy} options={GROUPS.map((g) => ({ value: g.key, label: g.label }))} onChange={(v) => setGroupBy(v as GroupKey)} />
        </View>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading && !data ? (
        <View style={styles.loading}>
          <Spinner color={colors.primary} />
        </View>
      ) : null}

      {data && visibleRows.length === 0 && !error ? (
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-circle-outline" size={28} color={colors.success} />
          <Text style={styles.emptyText}>
            {rows.length === 0
              ? isMachines
                ? "ไม่มีเครื่องดับ"
                : "ไม่มีสาขาที่สัญญาณหาย"
              : "ไม่มีรายการตามตัวกรองที่เลือก — กด × ที่แถบกำลังกรองเพื่อเอาบางตัวออก"}
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
              size={20}
              color={colors.primaryInk}
            />
            <Text style={[styles.sectionTitle, headingFont]}>{group.name}</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>
                {group.rows.length} {isMachines ? "เครื่อง" : "สาขา"}
              </Text>
            </View>
            {group.breachedCount > 0 ? (
              <View style={styles.staleBadge}>
                <Ionicons name="warning" size={12} color={colors.dangerInk} />
                <Text style={styles.staleBadgeText}>เกิน SLA {group.breachedCount} รายการ</Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }} />
            {group.score > 0 ? (
              <Text style={styles.groupLoss}>
                ความเสียหายกลุ่มนี้: <Text style={styles.groupLossValue}>{group.score} คะแนน</Text>
              </Text>
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
                onWorkOrder={openWorkOrder}
                available={tableWidth}
                slaLimit={slaHours}
              />
            ) : (
              <View style={styles.cardList}>
                {group.rows.map((row) => (
                  <OutageCard
                    key={row.id}
                    row={row}
                    isMachines={isMachines}
                    onEdit={setEditing}
                    onWorkOrder={openWorkOrder}
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

      <ActivityModal visible={showActivity} onClose={() => setShowActivity(false)} />

      <ViewsModal
        visible={viewsOpen}
        views={views}
        onClose={() => setViewsOpen(false)}
        onSave={(name) => {
          // ชื่อซ้ำ = บันทึกทับของเดิม แทนที่จะมีสองอันชื่อเดียวกันให้งง
          storeViews([currentView(name), ...views.filter((v) => v.name !== name)].slice(0, 12));
          showAlert("บันทึกแล้ว", `มุมมอง "${name}"`);
        }}
        onApply={(v) => {
          applyView(v);
          setViewsOpen(false);
        }}
        onDelete={(name) => storeViews(views.filter((v) => v.name !== name))}
      />

      <NoteModal
        row={editing}
        options={statusOptions}
        onOpenWorkOrder={(r) => {
          setEditing(null);
          openWorkOrder(r);
        }}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          applyNote(updated);
          setEditing(null);
        }}
      />
    </ScrollView>
      <UpdatePill
        count={newCount}
        unit="เคส"
        onPress={() => {
          if (!pendingData.current) return;
          scrollRef.current?.scrollTo({ y: 0, animated: true });
          applyData(pendingData.current);
        }}
      />
    </View>
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
  onOpenWorkOrder,
}: {
  row: OutageRow | null;
  options: WorkStatusOption[];
  onClose: () => void;
  onSaved: (row: OutageRow) => void;
  onOpenWorkOrder: (row: OutageRow) => void;
}) {
  const [symptom, setSymptom] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [parts, setParts] = useState<NotePart[]>([]);
  const [visitDate, setVisitDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<NoteLog[]>([]);

  // เปิดเคสไหนก็ตั้งค่าเริ่มต้นจากเคสนั้น ไม่ใช่ค่าที่ค้างจากเคสก่อนหน้า
  useEffect(() => {
    setSymptom(row?.symptom ?? "");
    setStatus(row?.workStatus ?? null);
    setParts(row?.parts ?? []);
    setVisitDate(row?.scheduledVisitAt ?? "");
    setError(null);
    setLogs([]);
    if (!row) return;
    api
      .get<NoteLog[]>(`/machines/outages/${row.id}/note-logs`)
      .then((res) => setLogs(res.data))
      .catch(() => setLogs([]));
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
    <AppModal
      visible
      onClose={onClose}
      busy={saving}
      title={row.branchName}
      subtitle={
        <>
          {row.branchCode}
          {row.machineCode ? ` · เครื่อง ${row.machineCode}` : ""}
          {row.machineBrand ? ` · ${row.machineBrand}` : ""}
          {` · ดับมาแล้ว ${slaText(row.slaHours)}`}
        </>
      }
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>{row.workOrder ? "ปิด" : "ยกเลิก"}</Text>
          </TouchableOpacity>
          {row.workOrder ? null : (
          <TouchableOpacity
            style={[styles.modalSave, saving && styles.modalSaveDisabled]}
            onPress={save}
            disabled={saving}
            activeOpacity={0.7}
          >
            {saving ? (
              <Spinner color="#fff" size="small" />
            ) : (
              <Text style={styles.modalSaveText}>บันทึก</Text>
            )}
          </TouchableOpacity>
          )}
        </View>
      }
    >

      {/*
        เคสที่มีใบงานแล้ว ให้ไปแก้ที่ใบงานที่เดียว
        สองที่ที่แก้ได้พร้อมกันแปลว่าจะมีอันหนึ่งเก่ากว่าเสมอ แล้วไม่มีใครรู้ว่าอันไหน
      */}
      {row.workOrder ? (
        <View style={styles.fromWo}>
          <Ionicons name="clipboard-outline" size={16} color={colors.primaryDark} />
          <View style={styles.fromWoBody}>
            <Text style={styles.fromWoTitle}>
              เคสนี้มีใบงาน {row.workOrder.code} อยู่แล้ว
            </Text>
            <Text style={styles.fromWoText}>
              อาการและสถานะกรอกที่ใบงาน แล้วกระดานจะดึงมาแสดงให้เอง
            </Text>
            <TouchableOpacity
              style={styles.fromWoButton}
              onPress={() => onOpenWorkOrder(row)}
              activeOpacity={0.8}
            >
              <Text style={styles.fromWoButtonText}>เปิดใบงาน {row.workOrder.code}</Text>
              <Ionicons name="arrow-forward" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {!row.workOrder ? (
        <>
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
        <DateField value={visitDate} onChange={setVisitDate} label="วันที่ช่างจะเข้า" emptyHint="เว้นว่างได้ถ้ายังไม่ได้นัด" />
      ) : null}
        </>
      ) : null}

      {logs.length > 0 ? (
        <>
          <Text style={styles.modalLabel}>ประวัติการกรอก ({logs.length} ครั้ง)</Text>
          <View style={styles.logList}>
            {logs.map((log) => (
              <NoteLogItem key={log.id} log={log} />
            ))}
          </View>
        </>
      ) : row.noteUpdatedBy ? (
        <Text style={styles.modalHint}>
          แก้ไขล่าสุดโดย {row.noteUpdatedBy} เมื่อ {formatDateTime(row.noteUpdatedAt)} น.
          {"\n"}(บันทึกไว้ก่อนระบบเริ่มเก็บประวัติ จึงไม่มีรายละเอียดย้อนหลัง)
        </Text>
      ) : null}

      {error ? <Text style={styles.modalError}>{error}</Text> : null}
    </AppModal>
  );
}

/** หนึ่งบรรทัดของประวัติ ใช้ทั้งในฟอร์มของเคสและในหน้าประวัติรวม */
function NoteLogItem({ log, showCase }: { log: NoteLog; showCase?: boolean }) {
  const tone = statusStyle(log.workStatus);
  return (
    <View style={styles.logItem}>
      <View style={styles.logTop}>
        <Text style={styles.logWho}>{log.by}</Text>
        <Text style={styles.logWhen}>{formatDateTime(log.at)} น.</Text>
      </View>

      {showCase && log.branchCode ? (
        <Text style={styles.logCase}>
          {log.branchCode} {log.branchName}
          {log.machineCode ? ` · เครื่อง ${log.machineCode}` : ""}
          {log.kind === "SIGNAL_LOST" ? " · สัญญาณหาย" : ""}
          {log.resolved ? " · ปิดเคสแล้ว" : ""}
        </Text>
      ) : null}

      <View style={styles.logChips}>
        {log.workStatusLabel ? (
          <View style={[styles.statusChip, { backgroundColor: tone.background }]}>
            <Text style={[styles.statusChipText, { color: tone.color }]}>{log.workStatusLabel}</Text>
          </View>
        ) : (
          <Text style={styles.logCleared}>ล้างสถานะ</Text>
        )}
        {log.partsSummary ? (
          <View style={styles.partChip}>
            <Ionicons name="cube-outline" size={11} color={colors.textMuted} />
            <Text style={styles.partChipText}>{log.partsSummary}</Text>
          </View>
        ) : null}
        {log.scheduledVisitAt ? (
          <View style={styles.visitChip}>
            <Ionicons name="calendar-outline" size={11} color={colors.primaryInk} />
            <Text style={styles.visitChipText}>นัด {thaiDate(log.scheduledVisitAt)}</Text>
          </View>
        ) : null}
      </View>

      {log.symptom ? <Text style={styles.logSymptom}>{log.symptom}</Text> : null}
    </View>
  );
}

/**
 * ประวัติการกรอกของทุกเคสรวมกัน
 *
 * ตอบว่า "วันนี้มีใครมาอัปเดตอะไรบ้าง" โดยไม่ต้องไล่เปิดทีละเคส
 */
function ActivityModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [logs, setLogs] = useState<NoteLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    api
      .get<NoteLog[]>("/machines/note-logs", { params: { limit: 100 } })
      .then((res) => setLogs(res.data))
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [visible]);

  if (!visible) return null;

  return (
    <AppModal
      visible
      onClose={onClose}
      title="ประวัติการกรอกอาการ/สถานะ"
      subtitle="ล่าสุด 100 ครั้ง ทุกเคสรวมกัน ใหม่สุดอยู่บนสุด"
    >
      {loading ? (
        <View style={styles.loading}>
          <Spinner color={colors.primary} />
        </View>
      ) : null}
      {error ? <Text style={styles.modalError}>{error}</Text> : null}

      {!loading && !error && logs.length === 0 ? (
        <Text style={styles.modalHint}>
          ยังไม่มีใครกรอกอาการหรือสถานะเลย — แตะที่รายการในแดชบอร์ดเพื่อเริ่มกรอก
        </Text>
      ) : null}

      <View style={styles.logList}>
        {logs.map((log) => (
          <NoteLogItem key={log.id} log={log} showCase />
        ))}
      </View>
    </AppModal>
  );
}

type KpiTone = "primary" | "navy" | "red" | "amber" | "green";

/** สีของการ์ดตัวเลขตาม .kpi / .kpi.navy / .kpi.red / .kpi.amber / .kpi.green ของต้นแบบ */
const KPI_TONE: Record<KpiTone, { tile: string; fg: string }> = {
  primary: { tile: colors.primarySoft, fg: colors.primaryInk },
  navy: { tile: colors.sky200, fg: colors.navy },
  red: { tile: colors.dangerSoft, fg: colors.dangerInk },
  amber: { tile: colors.warningTint, fg: colors.warningInk },
  green: { tile: colors.successSoft, fg: colors.successInk },
};

/**
 * การ์ดตัวเลขสรุปแบบ OTTERI: หัวข้อซ้ายบน ไอคอนในกล่องสีขวาบน ตัวเลขใหญ่พร้อมหน่วย
 * และบรรทัดล่างบอกความหมาย — ตัวเลขเปล่า ๆ คนต้องเดาว่า 12 คือเครื่อง สาขา หรือเคส
 */
function KpiCard({
  label,
  badge,
  value,
  unit,
  foot,
  footRight,
  action,
  progress,
  progressLabel,
  tone,
  crit,
  icon,
  wide,
}: {
  label: string;
  /** ป้ายแดงเล็กข้างหัวข้อ เช่น "วิกฤต" */
  badge?: string;
  value: number;
  unit?: string;
  foot?: string;
  /** ข้อความตัวหนาชิดขวาของบรรทัดล่าง */
  footRight?: string;
  /** ลิงก์ท้ายการ์ด เช่น "ต้องเร่งก่อน →" กดแล้วกรองรายการให้ */
  action?: { label: string; onPress: () => void };
  /** 0–1 ใส่เมื่ออยากให้มีแถบความคืบหน้าแทนบรรทัดล่าง */
  progress?: number;
  progressLabel?: string;
  tone: KpiTone;
  /** การ์ดที่ต้องสะดุดตา (เกิน SLA) — พื้นไล่สีแดงอ่อน ตัวเลขแดง */
  crit?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  wide: boolean;
}) {
  const t = KPI_TONE[tone];
  return (
    <View style={[styles.summaryCard, crit && styles.kpiCrit, wide ? styles.summaryCardWide : styles.summaryCardNarrow]}>
      {crit ? <View style={styles.kpiCritGlow} /> : null}
      <View style={styles.kpiLabelRow}>
        <Text style={styles.summaryLabel}>{label}</Text>
        {badge ? (
          <View style={styles.kpiBadge}>
            <Text style={styles.kpiBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.kpiIcon, { backgroundColor: t.tile }]}>
        <Ionicons name={icon} size={22} color={t.fg} />
      </View>
      <Text style={[styles.summaryValue, headingFont, { color: crit ? colors.dangerInk : colors.text }]}>
        {value.toLocaleString("en-US")}
        {unit ? <Text style={styles.summaryUnit}> {unit}</Text> : null}
      </Text>
      {progress !== undefined ? (
        <View style={styles.kpiFoot}>
          <View style={styles.kpiFootRow}>
            <Text style={styles.summarySub}>{progressLabel ?? ""}</Text>
            <Text style={[styles.kpiFootStrong, { color: colors.primaryInk }]}>{(progress * 100).toFixed(1)}%</Text>
          </View>
          <View style={styles.meter}>
            <View style={[styles.meterFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        </View>
      ) : (
        <View style={[styles.kpiFoot, styles.kpiFootRow]}>
          <Text style={[styles.summarySub, crit && { color: colors.dangerInk }, { flexShrink: 1 }]}>{foot ?? ""}</Text>
          {footRight ? <Text style={styles.kpiFootStrong}>{footRight}</Text> : null}
          {action ? (
            <TouchableOpacity onPress={action.onPress} style={styles.kpiAction} activeOpacity={0.7}>
              <Text style={styles.kpiActionText}>{action.label}</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.dangerInk} />
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

/**
 * บันทึกชุดตัวกรองที่ใช้บ่อย แล้วกดเรียกกลับมาได้ในแตะเดียว
 * เช่น "เกิน SLA ภาคใต้" ที่หัวหน้าภาคเปิดดูทุกเช้า
 */
function ViewsModal({
  visible,
  views,
  onClose,
  onSave,
  onApply,
  onDelete,
}: {
  visible: boolean;
  views: SavedView[];
  onClose: () => void;
  onSave: (name: string) => void;
  onApply: (v: SavedView) => void;
  onDelete: (name: string) => void;
}) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (visible) setName("");
  }, [visible]);
  const trimmed = name.trim();
  return (
    <AppModal
      visible={visible}
      title="บันทึกมุมมอง"
      subtitle="จำชุดตัวกรองที่เลือกอยู่ตอนนี้ไว้เรียกใช้ทีหลัง (เก็บในเครื่องนี้)"
      onClose={onClose}
      width={560}
      footer={
        <TouchableOpacity
          style={[styles.viewSave, !trimmed && { opacity: 0.5 }]}
          disabled={!trimmed}
          onPress={() => {
            onSave(trimmed);
            setName("");
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="bookmark" size={16} color="#fff" />
          <Text style={styles.viewSaveText}>บันทึกมุมมองนี้</Text>
        </TouchableOpacity>
      }
    >
      <Text style={styles.selectLabel}>ชื่อมุมมอง</Text>
      <TextInput
        style={styles.viewInput}
        value={name}
        onChangeText={setName}
        placeholder="เช่น เกิน SLA ภาคใต้"
        placeholderTextColor={colors.textFaint}
        maxLength={40}
        accessibilityLabel="ชื่อมุมมอง"
      />
      <Text style={[styles.selectLabel, { marginTop: spacing.lg }]}>มุมมองที่บันทึกไว้</Text>
      {views.length === 0 ? (
        <Text style={styles.summarySub}>ยังไม่มี — ตั้งชื่อด้านบนแล้วกดบันทึก</Text>
      ) : (
        views.map((v) => (
          <View key={v.name} style={styles.viewItem}>
            <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => onApply(v)} activeOpacity={0.7}>
              <Text style={styles.viewItemName}>{v.name}</Text>
              <Text style={styles.summarySub} numberOfLines={1}>
                {describeView(v)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.viewDelete}
              onPress={() => onDelete(v.name)}
              accessibilityLabel={`ลบมุมมอง ${v.name}`}
            >
              <Ionicons name="trash-outline" size={17} color={colors.dangerInk} />
            </TouchableOpacity>
          </View>
        ))
      )}
    </AppModal>
  );
}

/** คำอธิบายสั้นของมุมมองที่บันทึกไว้ (ในหน้าต่างบันทึกมุมมอง) */
function describeView(v: SavedView) {
  const f = viewFilters(v);
  return [
    v.tab === "machines" ? "เครื่องดับ" : "สัญญาณหาย",
    f.own,
    f.over ? "เกิน SLA" : null,
    f.noWo ? "ยังไม่มีใบงาน" : null,
    f.near ? "ใกล้เกิน SLA" : null,
    ...f.regions,
    ...f.brands,
    ...f.teams,
    f.statuses.length ? `สถานะ ${f.statuses.length}` : null,
    f.search ? `"${f.search}"` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** การ์ดตัวกรองแถวบน — ตัวเลขใหญ่อ่านได้ทันที กดครั้งเดียวกรอง กดซ้ำเอาออก */
function FilterTile({
  label,
  count,
  unit,
  on,
  red,
  onPress,
  wide,
}: {
  label: string;
  count: number;
  unit: string;
  on: boolean;
  red?: boolean;
  onPress: () => void;
  wide: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.tile, !wide && styles.tileHalf, on && (red ? styles.tileRedOn : styles.tileOn)]}
      onPress={onPress}
      accessibilityLabel={`กรอง ${label}`}
      accessibilityState={{ selected: on }}
    >
      <View style={styles.tileHead}>
        {red ? <Ionicons name="warning" size={13} color={on ? "#fff" : colors.dangerInk} /> : null}
        <Text style={[styles.tileLabel, on && styles.tileTextOn]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.tileNum, headingFont, red && styles.tileNumRed, on && styles.tileTextOn]}>
        {count}
        <Text style={[styles.tileUnit, on && styles.tileTextOn]}> {unit}</Text>
      </Text>
    </TouchableOpacity>
  );
}

/**
 * การ์ด "ยังไม่มีใบงาน" แยก DODO / COCO ในใบเดียว (ตามที่เจ้าของงานขอ)
 * กดชื่อการ์ด = ทั้งสองฝั่ง · กดตัวเลขฝั่งไหน = เฉพาะฝั่งนั้น
 */
function NoWorkOrderTile({
  count,
  dodo,
  coco,
  unit,
  on,
  own,
  onMain,
  onPart,
  wide,
}: {
  count: number;
  dodo: number;
  coco: number;
  unit: string;
  on: boolean;
  own: "COCO" | "DODO" | null;
  onMain: () => void;
  onPart: (o: "COCO" | "DODO") => void;
  wide: boolean;
}) {
  return (
    <View style={[styles.tile, styles.tileSplit, !wide && styles.tileFull, on && styles.tileSplitOn]}>
      <TouchableOpacity style={styles.tileMain} onPress={onMain} accessibilityLabel="กรอง ยังไม่มีใบงาน" accessibilityState={{ selected: on && !own }}>
        <Text style={[styles.tileLabel, on && { color: colors.dangerInk }]}>ยังไม่มีใบงาน</Text>
        <Text style={[styles.tileNum, headingFont, styles.tileNumRed]}>
          {count}
          <Text style={styles.tileUnit}> {unit}</Text>
        </Text>
      </TouchableOpacity>
      <View style={styles.tileParts}>
        {(["DODO", "COCO"] as const).map((o) => {
          const sel = on && own === o;
          return (
            <TouchableOpacity
              key={o}
              style={[styles.tilePart, sel && styles.tilePartOn]}
              onPress={() => onPart(o)}
              accessibilityLabel={`กรอง ยังไม่มีใบงาน ${o}`}
              accessibilityState={{ selected: sel }}
            >
              <Text style={[styles.tilePartText, sel && styles.tileTextOn]}>{o}</Text>
              <Text style={[styles.tilePartNum, sel && styles.tileTextOn]}>{o === "DODO" ? dodo : coco}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

type ChipOption = { value: string; label: string; count: number; on: boolean; tone?: "amber" };

/**
 * แถวชิปของหมวดหนึ่ง — กดได้หลายอัน ตัวเลขคือจำนวนถ้ากดอันนั้นเพิ่ม (0 = จางลง)
 * จอแคบเลื่อนซ้ายขวาในแถวเดียว ไม่ดันเนื้อหาลงไปจนเห็นตารางยาก
 */
function ChipRow({
  label,
  options,
  onToggle,
  wide,
  extra,
}: {
  label: string;
  options: ChipOption[];
  onToggle: (value: string) => void;
  wide: boolean;
  extra?: React.ReactNode;
}) {
  const chips = (
    <>
      {options.map((o) => (
        <TouchableOpacity
          key={o.value}
          style={[styles.fChip, o.on && (o.tone === "amber" ? styles.fChipAmberOn : styles.fChipOn), !o.count && !o.on && styles.fChipZero]}
          onPress={() => onToggle(o.value)}
          accessibilityLabel={`${label} ${o.label}`}
          accessibilityState={{ selected: o.on }}
        >
          {o.on ? <Ionicons name="checkmark" size={13} color={o.tone === "amber" ? colors.warningInk : colors.primaryInk} /> : null}
          <Text style={[styles.fChipText, o.on && (o.tone === "amber" ? styles.fChipAmberText : styles.fChipTextOn)]}>{o.label}</Text>
          <Text style={[styles.fChipCount, o.on && (o.tone === "amber" ? styles.fChipAmberText : styles.fChipTextOn)]}>{o.count}</Text>
        </TouchableOpacity>
      ))}
      {extra}
    </>
  );
  return (
    <View style={[styles.chipRow, !wide && styles.chipRowNarrow]}>
      <Text style={[styles.chipRowLabel, wide && styles.chipRowLabelWide]}>{label}</Text>
      {wide ? (
        <View style={styles.chipWrap}>{chips}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
          {chips}
        </ScrollView>
      )}
    </View>
  );
}

/** ปุ่มเลือกแบบแถบ (เรียง · จัดกลุ่ม) — กดครั้งเดียว แทนช่องเลือกที่ต้องเปิดก่อน */
function Seg({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <View style={styles.seg}>
      {options.map((o) => (
        <TouchableOpacity
          key={o.value}
          style={[styles.segBtn, value === o.value && styles.segBtnOn]}
          onPress={() => onChange(o.value)}
          accessibilityState={{ selected: value === o.value }}
        >
          <Text style={[styles.segText, value === o.value && styles.segTextOn]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** ปุ่มขาวขอบบางบนหัวหน้า (ประวัติ · อัปโหลด · ส่งออก Excel) */
function HeadButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.headBtn, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
    >
      <Ionicons name={icon} size={17} color={colors.body} />
      <Text style={styles.headBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** แท็บใหญ่สองแท็บ (เครื่องดับ / สัญญาณหาย) พร้อมชื่ออังกฤษและจำนวน */
function BigTab({
  active,
  icon,
  label,
  en,
  count,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  en: string;
  count?: number;
  onPress: () => void;
}) {
  const { width } = useWindowDimensions();
  return (
    <TouchableOpacity
      style={[styles.bigTab, active && styles.bigTabOn]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Ionicons name={icon} size={20} color={active ? colors.primaryInk : colors.textMuted} />
      <Text style={[styles.bigTabText, headingFont, active && styles.bigTabTextOn]}>
        {label}
        {width >= 640 ? <Text style={styles.bigTabEn}> ({en})</Text> : null}
      </Text>
      {count !== undefined ? (
        <View style={[styles.bigTabCount, active && styles.bigTabCountOn]}>
          <Text style={[styles.bigTabCountText, active && styles.bigTabCountTextOn]}>{count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

/** ช่องที่ตารางแสดงได้ — เรียงตามนี้ทั้งหัวตารางและตัวแถว จึงไม่มีทางหลุดคนละลำดับ */
type ColumnId =
  | "workOrder"
  | "branchCode"
  | "branchName"
  | "machineCode"
  | "brand"
  | "machineCount"
  | "zone"
  | "grade"
  | "sla"
  | "score"
  | "note";

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
function columnsFor(isMachines: boolean, available: number): Column[] {
  // ตามตัวอย่างที่เจ้าของงานเลือก: อาการ/สถานะย้ายไปอยู่ใต้ชื่อสาขา ไม่เป็นคอลัมน์ของตัวเองแล้ว
  // ตารางจึงไม่ยาวเกินจอแม้บนจอเล็ก และชื่อสาขากับเรื่องที่ค้างอยู่อ่านต่อกันในช่องเดียว
  const columns: Column[] = isMachines
    ? [
        { id: "branchCode", key: "branchCode", label: "รหัสสาขา", width: 100 },
        { id: "branchName", key: "branchName", label: "สาขา", width: 260 },
        { id: "machineCode", key: "machineCode", label: "เครื่อง / ยี่ห้อ", width: 230 },
        { id: "sla", key: "slaHours", label: "ดับมาแล้ว / SLA", width: 220 },
        { id: "zone", label: "ทีมช่างรับผิดชอบ", width: 200 },
        { id: "score", key: "score", label: "คะแนน", width: 90 },
      ]
    : [
        { id: "branchCode", key: "branchCode", label: "รหัสสาขา", width: 100 },
        { id: "branchName", key: "branchName", label: "สาขา", width: 300 },
        { id: "machineCount", label: "เครื่องในสาขา", width: 120 },
        { id: "sla", key: "slaHours", label: "สัญญาณหายมาแล้ว / SLA", width: 230 },
        { id: "zone", label: "ทีมช่างรับผิดชอบ", width: 200 },
        { id: "score", key: "score", label: "คะแนน", width: 90 },
      ];
  // ใบงานอยู่ท้ายสุดเสมอ เพราะเป็นปุ่มกด ไม่ใช่ข้อมูลที่ต้องกวาดตาอ่าน
  columns.push({ id: "workOrder", label: "", width: 140 });

  const used = columns.reduce((sum, c) => sum + c.width, 0);
  const name = columns.find((c) => c.id === "branchName")!;
  if (available >= used) {
    // ที่ว่างที่เหลือให้ชื่อสาขา (ยาวไม่จำกัด และมีอาการต่อท้าย) — ตารางเต็มกว้างพอดีจอ
    name.width += available - used;
  } else {
    // ที่ไม่พอ (จอเล็กหรือเปิดเมนูข้างอยู่) — ย่อทุกคอลัมน์ตามสัดส่วน แต่ไม่ต่ำกว่า 70%
    // ต่ำกว่านั้นค่อยปล่อยให้เลื่อนตารางซ้ายขวาเอา ดีกว่าบีบจนข้อความขึ้นบรรทัดละคำ
    const k = Math.max(0.7, available / used);
    for (const c of columns) c.width = Math.floor(c.width * k);
  }
  return columns;
}

function OutageTable({
  rows,
  isMachines,
  sortKey,
  sortAsc,
  onSort,
  onEdit,
  onWorkOrder,
  available,
  slaLimit,
}: {
  slaLimit: number;
  rows: OutageRow[];
  isMachines: boolean;
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (key: SortKey) => void;
  onEdit: (row: OutageRow) => void;
  onWorkOrder: (row: OutageRow) => void;
  available: number;
}) {
  const columns = columnsFor(isMachines, available);
  // อาการ/สถานะอยู่ในช่องชื่อสาขาแล้ว ไม่ต้องมีบรรทัดที่สองใต้แถวอีก
  const noteInline = true;
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
            style={styles.tableRow}
            onPress={() => onEdit(row)}
            activeOpacity={0.6}
          >
            <View style={styles.tableRowMain}>
              {columns.map((column) => (
                <View key={column.id} style={{ width: column.width }}>
                  <TableCell
                    column={column.id}
                    row={row}
                    onWorkOrder={() => onWorkOrder(row)}
                    slaLimit={slaLimit}
                  />
                </View>
              ))}
            </View>
            {/* แถวที่ยังไม่มีใครกรอกไม่ขึ้นบรรทัดนี้ ตารางจะได้ไม่ยาวเป็นสองเท่าโดยเปล่าประโยชน์ */}
            {!noteInline &&
            (row.workStatusLabel || row.symptom || row.parts.length > 0 || row.scheduledVisitAt) ? (
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

function TableCell({
  column,
  row,
  onWorkOrder,
  slaLimit,
}: {
  column: ColumnId;
  row: OutageRow;
  onWorkOrder: () => void;
  slaLimit: number;
}) {
  switch (column) {
    case "workOrder":
      return <WorkOrderCell row={row} onPress={onWorkOrder} />;
    case "branchCode":
      return (
        <View style={styles.codePill}>
          <Text style={[styles.codePillText, headingFont]}>{row.branchCode}</Text>
        </View>
      );
    case "branchName": {
      const hasNote = !!(row.workStatusLabel || row.symptom || row.parts.length > 0 || row.scheduledVisitAt);
      return (
        <View style={{ paddingRight: spacing.sm, gap: 6 }}>
          <Text style={styles.branchNameText}>{row.branchName}</Text>
          <View style={styles.tagRow}>
            {row.ownership ? (
              <View style={styles.tagPill}>
                <Text style={styles.tagPillText}>{row.ownership}</Text>
              </View>
            ) : null}
            {row.region ? (
              <View style={[styles.tagPill, styles.tagPillRegion]}>
                <Text style={[styles.tagPillText, { color: colors.primaryInk }]}>{row.region}</Text>
              </View>
            ) : null}
            {row.grade ? <Text style={styles.cellSub}>Grade {row.grade}</Text> : null}
            <WarrantyBadge state={row.warranty} endsAt={row.warrantyEndsAt} />
          </View>
          {hasNote ? (
            <View style={styles.noteCell}>
              <NoteLine row={row} />
            </View>
          ) : null}
        </View>
      );
    }
    case "machineCode":
      return (
        <View style={styles.machineCell}>
          <View style={styles.machineTile}>
            <Text style={[styles.machineTileText, headingFont]}>{row.machineCode || "—"}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.machineBrandText}>{row.machineBrand || "ไม่ระบุยี่ห้อ"}</Text>
            <Text style={styles.cellSub}>{machineTypeLabel(row.machineType)}</Text>
          </View>
        </View>
      );
    case "brand":
      return <Text style={styles.cellText}>{row.machineBrand || "—"}</Text>;
    case "machineCount":
      return <Text style={styles.cellText}>{row.machineCount ?? "—"} เครื่อง</Text>;
    case "zone":
      return (
        <View style={{ paddingRight: spacing.sm }}>
          <View style={styles.teamRow}>
            <View style={[styles.teamDot, !row.zone && { backgroundColor: colors.textFaint }]} />
            <Text style={styles.teamText}>{row.zone ?? "ยังไม่ระบุทีม"}</Text>
          </View>
          <Text style={[styles.cellSub, { marginLeft: 14 }]}>
            {row.workOrder?.assignedToName ?? (row.workOrder ? row.workOrder.statusLabel : "ยังไม่มีใบงาน")}
          </Text>
        </View>
      );
    case "grade":
      return <Text style={styles.cellText}>{row.grade ?? "—"}</Text>;
    case "sla": {
      // สีตามต้นแบบ: เกิน SLA แดง · ใช้ไปเกิน 60% เหลือง · ยังห่าง เขียว
      const tone = row.breached
        ? colors.dangerInk
        : row.slaHours > slaLimit * 0.6
          ? colors.warningInk
          : colors.successInk;
      return (
        <View style={{ paddingRight: spacing.sm, gap: 3 }}>
          <View style={styles.slaLine}>
            <Text style={[styles.slaText, headingFont, { color: tone }]}>{slaText(row.slaHours)}</Text>
            {row.breached ? (
              <View style={styles.slaTag}>
                <Text style={styles.slaTagText}>SLA {slaLimit} ชม.</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.sinceRow}>
            <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
            <Text style={styles.cellSub}>ตั้งแต่ {formatDateTime(row.startedAt)} น.</Text>
          </View>
        </View>
      );
    }
    case "score":
      return (
        <View style={styles.starPill}>
          <Ionicons name="star" size={12} color={colors.warning} />
          <Text style={[styles.starPillText, headingFont]}>{row.score}</Text>
        </View>
      );
    case "note":
      return (
        <View style={styles.noteCell}>
          <NoteLine row={row} />
        </View>
      );
  }
}

/** WASHER/DRYER ในทะเบียนเครื่อง → คำที่ช่างพูดกัน */
function machineTypeLabel(type?: string) {
  if (type === "WASHER") return "เครื่องซักผ้า";
  if (type === "DRYER") return "เครื่องอบผ้า";
  return type || "";
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
          <Ionicons name="calendar-outline" size={11} color={colors.primaryInk} />
          <Text style={styles.visitChipText}>นัด {thaiDate(row.scheduledVisitAt)}</Text>
        </View>
      ) : null}
      {row.symptom ? <Text style={styles.noteSymptom}>{row.symptom}</Text> : null}
      {/* บอกว่าค่าที่เห็นมาจากใบงาน ไม่ใช่ของที่ใครมากรอกบนกระดาน */}
      {row.workOrder && (row.symptom || row.workStatusLabel) ? (
        <Text style={styles.noteSource}>จาก {row.workOrder.code}</Text>
      ) : null}
    </>
  );
}

/**
 * ช่องใบงานในตาราง — ปุ่มเปิด หรือป้ายบอกว่าเปิดไปแล้ว
 *
 * ต้องเห็นได้จากกระดานว่าเคสไหนมีใบงานแล้ว ไม่งั้นเช้าวันจันทร์จะมีคนเปิดซ้ำ
 * แล้วช่างสองคนขับไปสาขาเดียวกัน
 */
function WorkOrderCell({ row, onPress }: { row: OutageRow; onPress: () => void }) {
  if (row.workOrder) {
    return (
      <TouchableOpacity style={styles.woChip} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.woChipText}>
          <Text style={styles.woChipCode}>{row.workOrder.code}</Text>
          <Text style={styles.woChipStatus} numberOfLines={1}>
            {row.workOrder.assignedToName ?? row.workOrder.statusLabel}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity style={styles.woButton} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name="add" size={18} color="#fff" />
      <Text style={styles.woButtonText}>สร้างใบงาน</Text>
    </TouchableOpacity>
  );
}

/**
 * memo ไว้เพราะแก้อาการของเคสเดียวทำให้ทั้งกระดานถูกวาดใหม่
 *
 * รับ row กับ handler ที่คงที่ แทนที่จะรับ arrow function ที่สร้างใหม่ทุกครั้ง
 * ตอน map — ถ้ารับ arrow function memo จะไม่มีผลเลย เพราะ props เปลี่ยนทุกรอบ
 */
const OutageCard = React.memo(function OutageCard({
  row,
  isMachines,
  onEdit,
  onWorkOrder,
}: {
  row: OutageRow;
  isMachines: boolean;
  onEdit: (row: OutageRow) => void;
  onWorkOrder: (row: OutageRow) => void;
}) {
  const gradeStyle = GRADE_STYLE[row.grade ?? "C"] ?? GRADE_STYLE.C;
  return (
    <TouchableOpacity
      style={[styles.card, row.breached && styles.cardBreached]}
      onPress={() => onEdit(row)}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardBranch}>{row.branchName}</Text>
        {row.breached ? (
          <View style={styles.breachChip}>
            <Ionicons name="alert-circle" size={11} color={colors.warningInk} />
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
        <WarrantyBadge state={row.warranty} endsAt={row.warrantyEndsAt} />
      </View>

      <View style={styles.cardBottom}>
        <Ionicons
          name="time-outline"
          size={14}
          color={row.breached ? colors.warningInk : colors.textMuted}
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

      <View style={styles.cardWorkOrder}>
        <WorkOrderCell row={row} onPress={() => onWorkOrder(row)} />
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  // ── หัวหน้า · แท็บ · การ์ด · แผงตัวกรอง (ตามตัวอย่างที่เจ้าของงานเลือก) ──
  topRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  pageTitle: { fontSize: 28, lineHeight: 38, fontWeight: "800", color: colors.text },
  stamp: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  stampText: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  topActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, maxWidth: "100%" },
  headBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  headBtnText: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.body },
  bigTabs: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: 20,
    padding: 6,
    marginBottom: spacing.md,
  },
  bigTab: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 52,
    borderRadius: 15,
    paddingHorizontal: spacing.sm,
  },
  bigTabOn: { backgroundColor: colors.card, ...shadow.card },
  bigTabText: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: colors.textMuted, flexShrink: 1 },
  bigTabTextOn: { color: colors.primaryInk },
  bigTabEn: { fontSize: 13, fontWeight: "500" },
  bigTabCount: { borderRadius: 999, paddingHorizontal: 10, backgroundColor: colors.border },
  bigTabCountOn: { backgroundColor: colors.primary },
  bigTabCountText: { fontSize: 13, lineHeight: 22, fontWeight: "700", color: colors.textMuted },
  bigTabCountTextOn: { color: "#fff" },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    minHeight: 140,
    overflow: "hidden",
    ...shadow.card,
  },
  kpiCrit: { borderColor: colors.dangerLine, backgroundColor: colors.dangerSoft },
  kpiCritGlow: {
    position: "absolute",
    right: -40,
    top: -40,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(239,68,68,0.07)",
  },
  kpiLabelRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingRight: 56 },
  kpiBadge: { backgroundColor: colors.danger, borderRadius: 6, paddingHorizontal: 7 },
  kpiBadgeText: { fontSize: 11, lineHeight: 18, fontWeight: "700", color: "#fff" },
  summaryLabel: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.body },
  summaryValue: { fontSize: 38, lineHeight: 46, fontWeight: "800", marginTop: 8 },
  kpiFoot: { marginTop: "auto", paddingTop: 10 },
  kpiFootRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 6 },
  kpiFootStrong: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.body, textAlign: "right" },
  kpiAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  kpiActionText: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.dangerInk },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
    gap: 14,
    ...shadow.card,
  },
  // ── ตัวกรองแบบการ์ด + ชิป ──
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 120,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: colors.card,
    gap: 1,
  },
  tileHalf: { flexBasis: "40%" },
  tileFull: { flexBasis: "100%" },
  tileOn: { backgroundColor: colors.navyFill, borderColor: colors.navyFill },
  tileRedOn: { backgroundColor: colors.danger, borderColor: colors.danger },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 5 },
  tileLabel: { fontSize: 12.5, lineHeight: 18, fontWeight: "700", color: colors.textMuted },
  tileNum: { fontSize: 24, lineHeight: 30, fontWeight: "800", color: colors.text },
  tileNumRed: { color: colors.danger },
  tileUnit: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  tileTextOn: { color: "#fff" },
  tileSplit: { flexGrow: 1.9, flexDirection: "row", alignItems: "stretch", paddingHorizontal: 0, paddingVertical: 0, gap: 8 },
  tileSplitOn: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  tileMain: { flex: 1, paddingHorizontal: 13, paddingVertical: 9, gap: 1 },
  tileParts: { justifyContent: "center", gap: 4, paddingVertical: 7, paddingRight: 8 },
  tilePart: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    minWidth: 112,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: colors.dangerSoft,
  },
  tilePartOn: { backgroundColor: colors.danger },
  tilePartText: { fontSize: 12.5, fontWeight: "700", color: colors.dangerInk },
  tilePartNum: { fontSize: 13, fontWeight: "800", color: colors.dangerInk },
  chipRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  chipRowNarrow: { flexDirection: "column", gap: 6 },
  chipRowLabel: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.textMuted },
  chipRowLabelWide: { width: 92, paddingTop: 7 },
  chipWrap: { flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chipScroll: { gap: 6, paddingRight: spacing.md },
  fChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  fChipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  fChipAmberOn: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  fChipZero: { opacity: 0.4 },
  fChipText: { fontSize: 13, lineHeight: 19, color: colors.text },
  fChipTextOn: { color: colors.primaryInk, fontWeight: "700" },
  fChipAmberText: { color: colors.warningInk, fontWeight: "700" },
  fChipCount: { fontSize: 11.5, fontWeight: "700", color: colors.textMuted },
  chipMore: { justifyContent: "center", paddingHorizontal: 6, paddingVertical: 5 },
  moreBtn: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start" },
  moreBtnText: { fontSize: 13, fontWeight: "600", color: colors.primaryInk },
  activeBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderStyle: "dashed",
    paddingTop: 10,
  },
  activeCount: { fontSize: 16, fontWeight: "800", color: colors.text, marginRight: 4 },
  activeOf: { fontSize: 12.5, fontWeight: "500", color: colors.textMuted },
  activeLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  activeHint: { fontSize: 12.5, color: colors.textMuted },
  pill: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: colors.sky50, borderRadius: 999, paddingLeft: 10, paddingRight: 3, paddingVertical: 2 },
  pillText: { fontSize: 12.5, color: colors.text },
  pillX: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  clearAll: { fontSize: 12.5, fontWeight: "700", color: colors.dangerInk, marginLeft: 4 },
  saveView: { flexDirection: "row", alignItems: "center", gap: 5 },
  sortRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  segLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  seg: { flexDirection: "row", flexWrap: "wrap", backgroundColor: colors.sky50, borderRadius: 10, padding: 3, gap: 2 },
  segBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  segBtnOn: { backgroundColor: colors.card, ...shadow.card },
  segText: { fontSize: 12.5, fontWeight: "600", color: colors.textMuted },
  segTextOn: { color: colors.text },
  panelRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexGrow: 1,
    flexBasis: 260,
    minWidth: 0,
    maxWidth: "100%",
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.sky50,
  },
  viewsRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  viewsLabel: { fontSize: 13, lineHeight: 20, fontWeight: "600", color: colors.textMuted },
  viewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
  },
  viewChipText: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.primaryInk },
  selectLabel: { fontSize: 13, lineHeight: 20, fontWeight: "600", color: colors.textMuted },
  viewInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    marginTop: 6,
  },
  viewSave: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  viewSaveText: { color: "#fff", fontSize: 15, lineHeight: 22, fontWeight: "700" },
  viewItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  viewItemName: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.text },
  viewDelete: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dangerSoft,
  },

  // ── กลุ่มและตาราง ──
  section: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginTop: spacing.lg,
    ...shadow.card,
  },
  sectionHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: { fontSize: 17, lineHeight: 26, fontWeight: "800", color: colors.text },
  countBadge: {
    backgroundColor: colors.sky50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
  },
  countBadgeText: { fontSize: 12, lineHeight: 20, fontWeight: "700", color: colors.body },
  staleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerLine,
    borderRadius: 999,
    paddingHorizontal: 10,
  },
  staleBadgeText: { fontSize: 12, lineHeight: 20, color: colors.dangerInk, fontWeight: "700" },
  groupLoss: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  groupLossValue: { color: colors.dangerInk, fontWeight: "800" },
  codePill: { alignSelf: "flex-start", backgroundColor: colors.primarySoft, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  codePillText: { fontSize: 13, lineHeight: 20, fontWeight: "800", color: colors.primaryInk },
  branchNameText: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.text },
  tagRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  tagPill: { backgroundColor: colors.border, borderRadius: 7, paddingHorizontal: 8 },
  tagPillRegion: { backgroundColor: colors.primarySoft },
  tagPillText: { fontSize: 12, lineHeight: 20, fontWeight: "600", color: colors.body },
  machineCell: { flexDirection: "row", alignItems: "center", gap: 10, paddingRight: spacing.sm },
  machineTile: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  machineTileText: { fontSize: 13, lineHeight: 18, fontWeight: "800", color: colors.primaryInk },
  machineBrandText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.text },
  teamRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  teamDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  teamText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.text, flexShrink: 1 },
  slaLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  slaText: { fontSize: 16, lineHeight: 24, fontWeight: "800", color: colors.text },
  slaTag: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.dangerLine, borderRadius: 6, paddingHorizontal: 6 },
  slaTagText: { fontSize: 11, lineHeight: 18, fontWeight: "700", color: colors.dangerInk },
  sinceRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  starPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  starPillText: { fontSize: 14, lineHeight: 20, fontWeight: "800", color: colors.warningInk },

  noteSource: { fontSize: 10, lineHeight: 16, color: colors.textFaint },
  fromWo: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  fromWoBody: { flex: 1, minWidth: 0, gap: 2 },
  fromWoTitle: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.primaryDark },
  fromWoText: { fontSize: 12, lineHeight: 20, color: colors.primaryDark },
  fromWoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  fromWoButtonText: { fontSize: 12, lineHeight: 20, color: "#fff", fontWeight: "700" },
  // .btn-primary.btn-sm ของต้นแบบ — ยังไม่มีใบงานคือสิ่งที่ต้องทำ จึงเป็นปุ่มสีเด่น
  woButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 38,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.primary,
    alignSelf: "flex-start",
    ...shadow.raised,
  },
  woButtonText: { fontSize: 13, lineHeight: 20, color: "#fff", fontWeight: "700" },
  // .btn-light.btn-sm — มีใบงานแล้ว กดเพื่อเปิดดู
  woChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.sky50,
    borderRadius: 12,
    minHeight: 38,
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  woChipText: { minWidth: 0, flexShrink: 1 },
  woChipCode: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.primaryInk },
  woChipStatus: { fontSize: 11, lineHeight: 16, color: colors.textMuted },
  cardWorkOrder: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },

  // ตัวอักษรไทยมีสระบนและวรรณยุกต์ lineHeight ต้องสูงกว่า fontSize ชัดเจน
  // .btn-light ของต้นแบบ


  kpiIcon: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  meter: { height: 7, borderRadius: 999, backgroundColor: colors.primarySoft, overflow: "hidden", marginTop: 4 },
  meterFill: { height: "100%", borderRadius: 999, backgroundColor: colors.primary },
  // จอแคบวางสองใบต่อแถว จอกว้างวางสี่ใบเรียงเดียว
  summaryCardNarrow: { flexGrow: 1, flexBasis: "46%", minWidth: 0 },
  summaryCardWide: { flexGrow: 1, flexBasis: 0, minWidth: 0 },
  summaryUnit: { fontSize: 15, fontWeight: "500", color: colors.body },
  summarySub: { fontSize: 12, lineHeight: 18, color: colors.textMuted },


  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.md,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },







  loading: { paddingVertical: spacing.xxl, alignItems: "center" },

  // หัวตารางกับแถวตาม .tbl ของต้นแบบ
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeaderCell: { flexDirection: "row", alignItems: "center", gap: 4 },
  tableHeaderText: { fontSize: 12, lineHeight: 18, color: colors.textMuted, fontWeight: "700", letterSpacing: 0.4 },
  tableRow: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: colors.card,
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
  cellText: { fontSize: 14, lineHeight: 22, color: colors.body, paddingRight: spacing.sm },
  cellSub: { fontSize: 11, lineHeight: 18, color: colors.textFaint },
  noteCell: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
  scoreBadge: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  scoreBadgeText: { fontSize: 11, lineHeight: 18, color: colors.dangerInk, fontWeight: "700" },
  visitChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  visitChipText: { fontSize: 11, lineHeight: 18, color: colors.primaryInk, fontWeight: "700" },

  cardList: { padding: spacing.md, gap: spacing.sm },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardBreached: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardBranch: { flex: 1, fontSize: 14, lineHeight: 23, fontWeight: "700", color: colors.text },
  cardChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  cardTime: { fontSize: 13, lineHeight: 21, color: colors.textMuted, fontWeight: "600" },
  cardTimeBreached: { color: colors.warningInk },
  cardTimeExact: { fontSize: 11, lineHeight: 20, color: colors.textFaint },

  breachChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.warningBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  breachChipText: { fontSize: 11, lineHeight: 18, color: colors.warningInk, fontWeight: "700" },

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

  logList: { gap: spacing.sm },
  logItem: {
    gap: spacing.xs,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  logTop: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, flexWrap: "wrap" },
  logWho: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  logWhen: { fontSize: 11, lineHeight: 19, color: colors.textFaint },
  logCase: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  logChips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs },
  logCleared: { fontSize: 11, lineHeight: 19, color: colors.textFaint, fontStyle: "italic" },
  logSymptom: { fontSize: 12, lineHeight: 20, color: colors.text },

  picker: { gap: spacing.xs },
  modalError: { fontSize: 13, lineHeight: 21, color: colors.danger, marginTop: spacing.sm },
  modalActions: { flex: 1, flexDirection: "row", gap: spacing.sm },
  modalCancel: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.sky50,
  },
  modalCancelText: { fontSize: 15, lineHeight: 22, color: colors.primaryInk, fontWeight: "700" },
  modalSave: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  modalSaveDisabled: { opacity: 0.6 },
  modalSaveText: { fontSize: 14, lineHeight: 22, color: "#fff", fontWeight: "700" },
});
