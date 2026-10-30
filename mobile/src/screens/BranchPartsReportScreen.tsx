/**
 * อะไหล่ที่ไปแต่ละสาขา — สาขาไหนได้อะไหล่อะไรไปแล้วบ้าง (เจ้าของงานขอ ต.ค. 69 · หน้าตาตามตัวอย่างที่ตกลง)
 *
 * คำตอบของเจ้าของงานที่กำหนดหน้านี้:
 *  1. "นับแต่ละตัวแยกตามชิ้นอะไหล่" — ทุกตัวเลขเป็นชิ้น และ "ใช้แล้ว" กับ "เบิกแล้ว · งานยังไม่จบ" ไม่รวมเป็นเลขเดียว
 *     ทุกยอดบนจอบอกว่าเป็นแบบไหน (หัวกลุ่ม คอลัมน์ ตัวเลขบนปุ่ม) — ตัวอย่างเคยรวมเป็น "4 ชิ้น" ที่หัวสาขา คำตอบนี้ชนะ
 *  2. "admin ดูได้ superadmin ดูได้" — ทางเข้าซ่อนตามกฎเดียวกับเซิร์ฟเวอร์ (utils/branchParts) เปิดตรง ๆ ได้ 403 ก็โชว์ข้อความนั้น
 *  3. "เริ่มตั้งแต่ที่เปิดใช้งานโปรแกรมเลย" — เปิดมาที่ "ทั้งหมด (ตั้งแต่เริ่มใช้ระบบ)" ปุ่มช่วงอื่นยังอยู่
 *
 * กฎว่าอะไรนับ (ยกเลิก ใบทดสอบ ใบแยก ของนอกสโตร์) และช่วงวันที่อยู่ฝั่งเซิร์ฟเวอร์ที่เดียว — หน้านี้แค่แสดง
 * ทั้งหมดตั้งแต่เริ่มใช้ระบบ × ~1,200 สาขา ส่งมาทั้งก้อนไม่ไหว จึงได้หัวกลุ่มทีละ 50 (มากสุดก่อน) + "โหลดเพิ่ม"
 * และแถวของกลุ่มโหลดตอนกดเปิดกลุ่มนั้นเท่านั้น · ค้นหาที่เซิร์ฟเวอร์ ยอดจึงตามคำค้น
 * จอคอม = ตามตัวอย่างหน้าคอม (ตาราง) · มือถือ = การ์ดทีละสาขา/อะไหล่ ตามตัวอย่างหน้ามือถือ
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import Dropdown from "../components/Dropdown";
import EmptyState from "../components/EmptyState";
import DateField, { thaiDate, todayBkk } from "../components/DateField";
import { useRefreshHandler } from "../components/RefreshButton";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { showAlert } from "../utils/alert";
import { openUrl } from "../utils/share";
import { useDebounced } from "../utils/useDebounced";
import { machineTag } from "../utils/machine";
import { HomeStackParamList } from "../navigation/types";
import { formatDateTime } from "./WorkOrderListScreen";
import { colors, headingFont, radius, spacing } from "../theme";

type Props = NativeStackScreenProps<HomeStackParamList, "BranchPartsReport">;

const URL = "/work-orders/reports/branch-parts";

type Mode = "branch" | "part";
type Kind = "all" | "used" | "issued";
type RangeKey = "all" | "thisMonth" | "lastMonth" | "3months" | "thisYear" | "custom";

interface Counts {
  used: number;
  issued: number;
  pieces: number;
}
interface TopPart extends Counts {
  sparePartId: number;
  partCode: string;
  partName: string;
  offCatalog: boolean;
}
interface TopBranch extends Counts {
  branchCode: string;
  branchName: string;
}
interface BranchGroup extends Counts {
  key: string;
  branchCode: string;
  branchName: string;
  region: string | null;
  team: string | null;
  orders: number;
  partCount: number;
  topParts: TopPart[];
}
interface PartGroup extends Counts {
  key: string;
  sparePartId: number;
  partCode: string;
  partName: string;
  brand: string | null;
  offCatalog: boolean;
  orders: number;
  branchCount: number;
  topBranches: TopBranch[];
}
interface Page {
  generatedAt: string;
  view: Mode;
  range: { key: RangeKey; from: string | null; to: string | null; label: string };
  summary: { branches: number; parts: number; orders: number; used: number; issued: number };
  chips: { used: number; issued: number };
  groupCount: number;
  groups: (BranchGroup | PartGroup)[];
  nextCursor: string | null;
  options: { regions: string[]; teams: string[] };
}
interface Row {
  kind: "USED" | "ISSUED";
  kindLabel: string;
  partRowId: number;
  day: string;
  workOrderId: number;
  code: string;
  parentCode: string | null;
  branchCode: string;
  branchName: string;
  machineCode: string | null;
  machineBrand: string | null;
  machineCapacityKg: number | null;
  partCode: string;
  partName: string;
  offCatalog: boolean;
  quantity: number;
  unit: string | null;
  detail: string;
}
interface Detail {
  rowCount: number;
  rows: Row[];
  nextCursor: string | null;
  breakdown: (TopPart | TopBranch)[];
}
type DetailState = { status: "loading" } | { status: "error"; error: string } | ({ status: "ok"; more: boolean } & Detail);

/** ตัวกรองที่ส่งให้เซิร์ฟเวอร์ — ชุดเดียวกันทั้งหัวกลุ่ม แถวของกลุ่ม และ Excel ตัวเลขบนจอกับในไฟล์จึงตรงกัน */
type Params = Record<string, string | undefined>;
/** หน้าที่แสดงอยู่ + ตัวกรองที่ได้หน้านั้นมา · gen เปลี่ยนเมื่อโหลดใหม่ตั้งแต่ต้น (ไม่ใช่ตอนโหลดเพิ่ม) */
interface Loaded {
  page: Page;
  params: Params;
  gen: number;
}

const PRESETS: { k: Exclude<RangeKey, "custom">; label: string; short: string }[] = [
  { k: "all", label: "ทั้งหมด (ตั้งแต่เริ่มใช้ระบบ)", short: "ทั้งหมด" },
  { k: "thisMonth", label: "เดือนนี้", short: "เดือนนี้" },
  { k: "lastMonth", label: "เดือนก่อน", short: "เดือนก่อน" },
  { k: "3months", label: "3 เดือน", short: "3 เดือน" },
  { k: "thisYear", label: "ปีนี้", short: "ปีนี้" },
];

/** สองแบบ สองสี ตามตัวอย่าง — เขียว ใช้แล้ว · ฟ้า เบิกแล้วงานยังไม่จบ */
const LOOK = {
  USED: { fg: colors.successInk, bg: colors.successSoft, bd: colors.successLine },
  ISSUED: { fg: colors.roleSupervisor, bg: colors.roleSupervisorSoft, bd: colors.roleSupervisorSoft },
};

const KIND_CHIPS: { k: Kind; label: string; fg: string }[] = [
  { k: "all", label: "ทั้งหมด", fg: colors.text },
  { k: "used", label: "ใช้แล้ว", fg: colors.successInk },
  { k: "issued", label: "เบิกแล้ว · งานยังไม่จบ", fg: colors.roleSupervisor },
];

/** แถวของกลุ่มทีละหน้า — สาขาใหญ่มีได้หลายร้อยแถวตั้งแต่เริ่มใช้ระบบ */
const ROWS_PAGE = 100;

const machineText = (r: Row) =>
  r.machineCode ? `${r.machineBrand ? `${r.machineBrand} ` : ""}เครื่อง ${machineTag(r.machineCode, r.machineCapacityKg)}` : "ทั้งสาขา";
const qtyText = (r: Row) => `${r.quantity}${r.unit ? ` ${r.unit}` : ""}`;
const isBranch = (g: BranchGroup | PartGroup): g is BranchGroup => "branchCode" in g;

function rangeShort(key: RangeKey, from: string, to: string) {
  if (key !== "custom") return PRESETS.find((p) => p.k === key)?.short ?? "";
  return `${from ? thaiDate(from) : "…"} – ${to ? thaiDate(to) : "…"}`;
}

/** ยอดสองแบบเป็นป้ายแยกกัน — แบบที่ไม่ได้อยู่ในตัวกรอง (เป็นศูนย์) ไม่ต้องขึ้น */
function KindPills({ c, small }: { c: { used: number; issued: number }; small?: boolean }) {
  return (
    <>
      {c.used ? (
        <View style={[styles.pill, small && styles.pillSmall, { backgroundColor: LOOK.USED.bg, borderColor: LOOK.USED.bd }]}>
          <Text style={[styles.pillText, small && styles.pillTextSmall, { color: LOOK.USED.fg }]}>ใช้แล้ว {c.used} ชิ้น</Text>
        </View>
      ) : null}
      {c.issued ? (
        <View style={[styles.pill, small && styles.pillSmall, { backgroundColor: LOOK.ISSUED.bg, borderColor: LOOK.ISSUED.bd }]}>
          <Text style={[styles.pillText, small && styles.pillTextSmall, { color: LOOK.ISSUED.fg }]}>เบิกแล้ว {c.issued} ชิ้น</Text>
        </View>
      ) : null}
    </>
  );
}

/** ป้ายสองแบบในชิปสาขา/อะไหล่ ("B0412 ซักดี บางนา ใช้แล้ว ×1") — ×เลข ไม่บอกแบบ ไม่พอ */
function KindTimes({ c }: { c: { used: number; issued: number } }) {
  return (
    <>
      {c.used ? <Text style={[styles.times, { color: LOOK.USED.fg }]}> ใช้แล้ว ×{c.used}</Text> : null}
      {c.issued ? <Text style={[styles.times, { color: LOOK.ISSUED.fg }]}> เบิกแล้ว ×{c.issued}</Text> : null}
    </>
  );
}

function OffTag() {
  return (
    <View style={styles.offTag}>
      <Text style={styles.offTagText}>นอกสโตร์</Text>
    </View>
  );
}

function KindPill({ r, short }: { r: Row; short?: boolean }) {
  const t = LOOK[r.kind];
  return (
    <View style={[styles.pill, styles.pillSmall, { backgroundColor: t.bg, borderColor: t.bd }]}>
      {/* มือถือย่อเป็น "เบิกแล้ว" ตามตัวอย่าง — "งานยังไม่จบ" ไปอยู่ท้ายบรรทัดล่างของแถวแทน */}
      <Text style={[styles.pillText, styles.pillTextSmall, { color: t.fg }]}>{short && r.kind === "ISSUED" ? "เบิกแล้ว" : r.kindLabel}</Text>
    </View>
  );
}

export default function BranchPartsReportScreen({ navigation, route }: Props) {
  const { width } = useWindowDimensions();
  // หัวหน้า (ตัวเลข ตัวกรอง แท็บ) แบบจอคอมตั้งแต่ 760 · ตารางหกคอลัมน์ต้องการราว 900 px บวกเมนูข้างที่ค้างไว้
  const wide = width >= 760;
  const table = width >= 1100;

  const deepOf = (p: Props["route"]["params"]) =>
    p?.branchCode ? { branchCode: p.branchCode, branchName: p.branchName, machineId: p.machineId, machineCode: p.machineCode } : null;
  const [deep, setDeep] = useState(() => deepOf(route.params));
  const [range, setRange] = useState<RangeKey>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [region, setRegion] = useState<string | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [mode, setMode] = useState<Mode>("branch");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const loadedRef = useRef<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [details, setDetails] = useState<Record<string, DetailState>>({});
  const [panel, setPanel] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const seq = useRef(0);

  /**
   * เปิดจากลิงก์ในใบงานอีกใบขณะที่หน้านี้ค้างอยู่ — หน้าเดิมถูกเรียกซ้ำด้วยค่าใหม่ ไม่ได้สร้างใหม่
   * จึงต้องตั้งตัวกรองตามลิงก์เอง (ทั้งหมดตั้งแต่เริ่มใช้ระบบ) · เปิดจากเมนู ({}) = กลับค่าตั้งต้น
   */
  const deepKey = `${route.params?.branchCode ?? ""}|${route.params?.machineId ?? ""}`;
  const firstKey = useRef(deepKey);
  useEffect(() => {
    if (firstKey.current === deepKey) return;
    firstKey.current = deepKey;
    setDeep(deepOf(route.params));
    setRange("all");
    setFrom("");
    setTo("");
    setKind("all");
    setRegion(null);
    setTeam(null);
    setSearch("");
    setOpen(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepKey]);

  /**
   * ตั้งแต่–ถึงต้องครบคู่ (เซิร์ฟเวอร์ไม่รับครึ่งเดียว) — ระหว่างเลือกไม่ครบหรือกลับด้าน ไม่ยิงคำขอ
   * หน้าเดิมค้างไว้พร้อมบอกว่าขาดอะไร ดีกว่าจอว่างหรือ error สีแดงระหว่างที่คนยังเลือกอยู่
   */
  const customHint =
    range === "custom" ? (!from || !to ? "เลือกตั้งแต่และถึงให้ครบทั้งสองช่อง" : from > to ? "วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด" : null) : null;

  const params = useMemo<Params>(
    () => ({
      range,
      from: range === "custom" ? from : undefined,
      to: range === "custom" ? to : undefined,
      kind,
      region: region ?? undefined,
      team: team ?? undefined,
      q: q || undefined,
      branchCode: deep?.branchCode,
      machineId: deep?.machineId !== undefined ? String(deep.machineId) : undefined,
    }),
    [range, from, to, kind, region, team, q, deep]
  );

  /** keep = จำนวนกลุ่มที่มีอยู่ (ดึงรีเฟรช) — โหลดเท่าเดิมไม่หดกลับเหลือหน้าแรก เพดาน 100 ตามเซิร์ฟเวอร์ */
  const load = useCallback(
    async (keep?: number) => {
      if (customHint) return;
      const n = ++seq.current;
      setError(null);
      setBusy(true);
      try {
        const res = await api.get<Page>(URL, {
          params: { ...params, view: mode, limit: keep && keep > 50 ? String(Math.min(100, keep)) : undefined },
        });
        if (n !== seq.current) return;
        const next = { page: res.data, params, gen: n };
        loadedRef.current = next;
        setLoaded(next);
        // แถวที่เปิดไว้โหลดใหม่ตามตัวกรองใหม่ (กลุ่มที่เปิดไว้ยังเปิดอยู่ — เปลี่ยนสถานะแล้วดูสาขาเดิมต่อได้)
        setDetails({});
        // เหลือกลุ่มเดียว (มาจากลิงก์สาขา/เครื่อง หรือค้นเจอสาขาเดียว) เปิดให้เลย — คนมาเพื่อดูแถวของกลุ่มนั้น
        const only = res.data.groups.length === 1 ? res.data.groups[0] : null;
        if (only) setOpen((o) => new Set(o).add(`${res.data.view}:${only.key}`));
      } catch (e) {
        if (n === seq.current) setError(apiErrorMessage(e));
      } finally {
        if (n === seq.current) setBusy(false);
      }
    },
    [params, mode, customHint]
  );
  useEffect(() => {
    void load();
  }, [load]);
  useRefreshHandler(() => load(loadedRef.current?.page.groups.length));

  async function loadMore() {
    const base = loadedRef.current;
    if (!base?.page.nextCursor) return;
    setMore(true);
    try {
      const res = await api.get<Page>(URL, { params: { ...base.params, view: base.page.view, cursor: base.page.nextCursor } });
      // ตัวกรองเปลี่ยน/โหลดใหม่ระหว่างรอ — หน้าถัดไปของชุดเก่าต่อท้ายชุดใหม่ไม่ได้
      if (loadedRef.current !== base) return;
      const have = new Set(base.page.groups.map((g) => g.key));
      const next = { ...base, page: { ...res.data, groups: [...base.page.groups, ...res.data.groups.filter((g) => !have.has(g.key))] } };
      loadedRef.current = next;
      setLoaded(next);
    } catch (e) {
      showAlert("โหลดเพิ่มไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setMore(false);
    }
  }

  /** cursor = โหลดแถวหน้าถัดไปของกลุ่มที่เปิดอยู่ (ต่อท้าย) · ไม่มี = โหลดแถวหน้าแรกใหม่ */
  const fetchDetail = useCallback(async (key: string, cursor?: string) => {
    const base = loadedRef.current;
    if (!base) return;
    const id = `${base.page.view}:${key}`;
    const append = !!cursor;
    setDetails((d) => {
      const cur = d[id];
      if (!append) return { ...d, [id]: { status: "loading" } };
      return cur?.status === "ok" ? { ...d, [id]: { ...cur, more: true } } : d;
    });
    try {
      const res = await api.get<Detail>(`${URL}/detail`, {
        params: { ...base.params, view: base.page.view, key, cursor, limit: String(ROWS_PAGE) },
      });
      // ตัวกรองเปลี่ยนระหว่างรอ — แถวชุดเก่าไม่ตรงกับหัวกลุ่มชุดใหม่ (โหลดเพิ่มหัวกลุ่มไม่เปลี่ยน gen)
      if (loadedRef.current?.gen !== base.gen) return;
      setDetails((d) => {
        const cur = d[id];
        if (append && cur?.status === "ok") {
          // กันซ้ำ — key ซ้ำทำให้ React วาดแถวผิด
          const have = new Set(cur.rows.map((r) => r.partRowId));
          return { ...d, [id]: { ...res.data, status: "ok", more: false, rows: [...cur.rows, ...res.data.rows.filter((r) => !have.has(r.partRowId))] } };
        }
        return { ...d, [id]: { ...res.data, status: "ok", more: false } };
      });
    } catch (e) {
      if (loadedRef.current?.gen !== base.gen) return;
      if (append) {
        showAlert("โหลดเพิ่มไม่สำเร็จ", apiErrorMessage(e));
        setDetails((d) => {
          const cur = d[id];
          return cur?.status === "ok" ? { ...d, [id]: { ...cur, more: false } } : d;
        });
      } else setDetails((d) => ({ ...d, [id]: { status: "error", error: apiErrorMessage(e) } }));
    }
  }, []);

  // กลุ่มที่เปิดอยู่แต่ยังไม่มีแถว (เพิ่งกดเปิด · ตัวกรองเปลี่ยน · ดึงรีเฟรช) → โหลดแถวของกลุ่มนั้น
  useEffect(() => {
    if (!loaded) return;
    for (const g of loaded.page.groups) {
      const id = `${loaded.page.view}:${g.key}`;
      if (open.has(id) && !details[id]) void fetchDetail(g.key);
    }
  }, [loaded, open, details, fetchDetail]);

  const toggle = (key: string) => {
    if (!loaded) return;
    const id = `${loaded.page.view}:${key}`;
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  async function download() {
    const base = loadedRef.current;
    if (!base) return;
    setDownloading(true);
    try {
      // ตัวกรองของหน้าที่เห็นอยู่ ไม่ใช่ค่าที่กำลังพิมพ์ — ไฟล์ต้องตรงกับตัวเลขบนจอ
      const res = await api.get<{ path: string }>(URL, { params: { ...base.params, format: "xlsx" }, loadingText: "กำลังสร้างไฟล์ Excel..." });
      const url = resolveImageUrl(res.data.path);
      if (url) await openUrl(url);
    } catch (e) {
      showAlert("ดาวน์โหลดไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  const pickRange = (k: Exclude<RangeKey, "custom">) => {
    setRange(k);
    setFrom("");
    setTo("");
  };
  const page = loaded?.page ?? null;
  // ช่องวันที่โชว์ช่วงที่ปุ่มคิดให้ (จากเซิร์ฟเวอร์) — แก้ช่องหนึ่งแล้วอีกช่องเริ่มจากค่าเดิม ไม่ต้องเลือกใหม่ทั้งคู่
  const shownFrom = range === "custom" ? from : page?.range.key === range ? page.range.from ?? "" : "";
  const shownTo = range === "custom" ? to : page?.range.key === range ? page.range.to ?? "" : "";
  const editDate = (which: "from" | "to", v: string) => {
    const next = { from: shownFrom, to: shownTo, [which]: v };
    if (!next.from && !next.to) return pickRange("all");
    // เลือกแค่ "ตั้งแต่" = ถึงวันนี้ ซึ่งคือสิ่งที่คนส่วนใหญ่หมายถึง · เลือกแค่ "ถึง" ต้องถามวันเริ่ม (ไม่มีให้เดา)
    if (which === "from" && v && !next.to) next.to = todayBkk();
    setFrom(next.from);
    setTo(next.to);
    setRange("custom");
  };
  // ล้างตัวกรองจากลิงก์ผ่าน params — กดลิงก์เดิมในใบงานซ้ำทีหลังจะได้ทำงานอีกครั้ง (ค่าเปลี่ยนจริง)
  const clearDeep = () => navigation.setParams({ branchCode: undefined, branchName: undefined, machineId: undefined, machineCode: undefined });
  const openOrder = (id: number) => navigation.navigate("WorkOrderDetail", { id });

  const filtered = !!(q || region || team || kind !== "all" || deep || range !== "all");
  const regionOptions = [{ value: "", label: "ทุกภาค" }, ...(page?.options.regions ?? []).map((r) => ({ value: r, label: r }))];
  const teamOptions = [{ value: "", label: "ทุกทีม" }, ...(page?.options.teams ?? []).map((t) => ({ value: t, label: t }))];

  // ── ส่วนตัวกรอง ─────────────────────────────────────

  const rangeRow = (
    <View style={styles.filterRow}>
      {wide ? <Text style={styles.filterLabel}>ช่วงวันที่</Text> : null}
      {PRESETS.map((p) => {
        const on = range === p.k;
        return (
          <TouchableOpacity
            key={p.k}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => pickRange(p.k)}
            accessibilityLabel={`ช่วง ${p.label}`}
            // เว็บไม่แปลง accessibilityState เป็น aria-selected — ใส่เองให้โปรแกรมอ่านจอ/เทสต์รู้ว่าช่วงไหนเลือกอยู่
            accessibilityState={{ selected: on }}
            aria-selected={on}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.label}</Text>
          </TouchableOpacity>
        );
      })}
      <View style={styles.dates}>
        <View style={styles.dateBox}>
          <DateField label="ตั้งแต่" value={shownFrom} onChange={(v) => editDate("from", v)} emptyHint="แรกสุด" labelStyle={styles.dateLabel} />
        </View>
        <View style={styles.dateBox}>
          <DateField label="ถึง" value={shownTo} onChange={(v) => editDate("to", v)} emptyHint="วันนี้" labelStyle={styles.dateLabel} />
        </View>
      </View>
      {customHint ? <Text style={styles.hint}>{customHint}</Text> : null}
    </View>
  );

  const kindChips = KIND_CHIPS.map((c) => {
    const on = kind === c.k;
    // ปุ่ม "ทั้งหมด" ไม่มีตัวเลข — ใช้แล้วกับเบิกแล้วไม่บวกรวมเป็นเลขเดียว (เจ้าของงาน: นับแยก)
    const n = c.k === "used" ? page?.chips.used : c.k === "issued" ? page?.chips.issued : null;
    return (
      <TouchableOpacity
        key={c.k}
        style={[styles.chip, on && styles.chipOn]}
        onPress={() => setKind(c.k)}
        accessibilityLabel={`สถานะ ${c.label}${n != null ? ` ${n} ชิ้น` : ""}`}
        accessibilityState={{ selected: on }}
        aria-selected={on}
      >
        <Text style={[styles.chipText, { color: on ? "#fff" : c.fg }, on && styles.chipTextOn]}>
          {c.label}
          {n != null ? ` · ${n} ชิ้น` : ""}
        </Text>
      </TouchableOpacity>
    );
  });

  const searchBox = (
    <View style={styles.searchBox}>
      <Ionicons name="search" size={17} color={colors.textMuted} />
      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder={wide ? "ค้นหา รหัส/ชื่อสาขา · รหัส/ชื่ออะไหล่ · เลขใบงาน" : "สาขา · อะไหล่ · ใบงาน"}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="ค้นหาในรายงานอะไหล่ที่ไปแต่ละสาขา"
        returnKeyType="search"
        maxLength={100}
      />
      {search ? (
        <TouchableOpacity onPress={() => setSearch("")} accessibilityLabel="ล้างคำค้น">
          <Ionicons name="close-circle" size={17} color={colors.textFaint} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const placeDropdowns = (
    <>
      <View style={styles.dd}>
        {wide ? <Text style={styles.ddLabel}>ภาค</Text> : null}
        <View style={{ flex: 1 }}>
          <Dropdown value={region ?? ""} options={regionOptions} onChange={(v) => setRegion(v || null)} accessibilityLabel="ภาค" />
        </View>
      </View>
      <View style={styles.dd}>
        {wide ? <Text style={styles.ddLabel}>ทีม</Text> : null}
        <View style={{ flex: 1 }}>
          <Dropdown value={team ?? ""} options={teamOptions} onChange={(v) => setTeam(v || null)} accessibilityLabel="ทีม" />
        </View>
      </View>
    </>
  );

  const excel = (
    <TouchableOpacity
      style={[styles.excel, !wide && styles.excelSmall, (downloading || !page || (!page.summary.used && !page.summary.issued)) && { opacity: 0.6 }]}
      onPress={download}
      disabled={downloading || !page || (!page.summary.used && !page.summary.issued)}
      accessibilityLabel="ดาวน์โหลด Excel อะไหล่ที่ไปแต่ละสาขา"
    >
      {downloading ? <Spinner size="small" color="#fff" /> : <Ionicons name="download-outline" size={17} color="#fff" />}
      <Text style={styles.excelText}>{wide ? "ดาวน์โหลด Excel" : "Excel"}</Text>
    </TouchableOpacity>
  );

  const deepPill = deep ? (
    <View style={styles.deep}>
      <Ionicons name="filter" size={14} color={colors.primaryInk} />
      <Text style={styles.deepText}>
        {deep.machineId !== undefined ? `เฉพาะเครื่อง ${deep.machineCode ?? ""} · ` : ""}สาขา {deep.branchCode}
        {deep.branchName ? ` ${deep.branchName}` : ""}
      </Text>
      <TouchableOpacity onPress={clearDeep} accessibilityLabel="เลิกกรองสาขา/เครื่อง" hitSlop={8}>
        <Ionicons name="close" size={16} color={colors.primaryInk} />
      </TouchableOpacity>
    </View>
  ) : null;

  const tabs = (
    <View style={styles.tabs} accessibilityRole="tablist">
      {(
        [
          ["branch", "ตามสาขา"],
          ["part", "ตามอะไหล่"],
        ] as const
      ).map(([m, label]) => {
        const on = mode === m;
        return (
          <TouchableOpacity
            key={m}
            style={[styles.tab, on && styles.tabOn]}
            onPress={() => setMode(m)}
            accessibilityRole="tab"
            accessibilityLabel={`มุมมอง ${label}`}
            accessibilityState={{ selected: on }}
            aria-selected={on}
          >
            <Text style={[styles.tabText, on && styles.tabTextOn]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ── แถวของกลุ่ม ─────────────────────────────────────

  /** branchView = แถวในกล่องสาขา (คอลัมน์ที่สองคืออะไหล่) · ไม่ใช่ = แถวในอะไหล่ (คอลัมน์ที่สองคือสาขา) */
  const detailBody = (id: string, key: string, branchView: boolean) => {
    const d = details[id];
    if (!d || d.status === "loading") return <Spinner color={colors.primary} style={{ marginVertical: spacing.md }} />;
    if (d.status === "error")
      return (
        <View style={styles.detailError}>
          <Text style={styles.errorText}>{d.error}</Text>
          <TouchableOpacity style={styles.more} onPress={() => fetchDetail(key)} accessibilityLabel="ลองโหลดแถวอีกครั้ง">
            <Text style={styles.moreText}>ลองอีกครั้ง</Text>
          </TouchableOpacity>
        </View>
      );
    const rowsFoot = (
      <View style={styles.rowsFoot}>
        <Text style={styles.sub}>
          แสดง {d.rows.length} จาก {d.rowCount} แถว · ใหม่สุดก่อน
        </Text>
        {d.nextCursor ? (
          <TouchableOpacity style={styles.more} onPress={() => d.nextCursor && fetchDetail(key, d.nextCursor)} disabled={d.more} accessibilityLabel="แสดงแถวเพิ่ม">
            {d.more ? <Spinner size="small" color={colors.primaryInk} /> : null}
            <Text style={styles.moreText}>แสดงเพิ่มอีก {Math.min(ROWS_PAGE, d.rowCount - d.rows.length)} แถว</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
    if (table)
      return (
        <View>
          <View style={[styles.tr, styles.th]}>
            {["วันที่", branchView ? "อะไหล่" : "สาขา", "จำนวน", "เครื่อง", "ใบงาน", "สถานะ"].map((h, i) => (
              <Text key={h} style={[styles.thText, COL[i], i === 2 && { textAlign: "right" }]}>
                {h}
              </Text>
            ))}
          </View>
          {d.rows.map((r) => (
            <View key={r.partRowId} style={styles.tr} accessibilityLabel={`แถว ${r.code} ${r.partCode} ${r.kindLabel} ${r.quantity}`}>
              <Text style={[styles.td, styles.muted, COL[0]]}>{thaiDate(r.day)}</Text>
              <View style={[COL[1], styles.cell]}>
                {branchView ? (
                  <>
                    <Text style={styles.strong}>{r.partName}</Text>
                    <View style={styles.codeLine}>
                      <Text style={styles.code}>{r.partCode}</Text>
                      {r.offCatalog ? <OffTag /> : null}
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.strong}>{r.branchName}</Text>
                    <Text style={styles.code}>{r.branchCode}</Text>
                  </>
                )}
              </View>
              <Text style={[styles.td, styles.qty, COL[2]]}>{qtyText(r)}</Text>
              <Text style={[styles.td, styles.muted, COL[3]]}>{machineText(r)}</Text>
              <View style={[COL[4], styles.cell]}>
                <TouchableOpacity onPress={() => openOrder(r.workOrderId)} accessibilityLabel={`เปิดใบงาน ${r.code}`}>
                  <Text style={styles.link}>{r.code}</Text>
                </TouchableOpacity>
                {r.parentCode ? <Text style={styles.sub}>ใบรออะไหล่ของ {r.parentCode}</Text> : null}
              </View>
              <View style={[COL[5], styles.cell]}>
                <KindPill r={r} />
                <Text style={styles.sub}>{r.detail}</Text>
              </View>
            </View>
          ))}
          {rowsFoot}
        </View>
      );
    return (
      <View>
        {d.rows.map((r) => (
          <TouchableOpacity
            key={r.partRowId}
            style={styles.mRow}
            activeOpacity={0.7}
            onPress={() => openOrder(r.workOrderId)}
            accessibilityLabel={`แถว ${r.code} ${r.partCode} ${r.kindLabel} ${r.quantity}`}
          >
            <View style={styles.mRowTop}>
              <Text style={styles.mRowTitle}>
                {branchView ? r.partName : `${r.branchCode} · ${r.branchName}`} × {qtyText(r)}
              </Text>
              <KindPill r={r} short />
            </View>
            <Text style={styles.mRowLine}>
              {[
                branchView ? r.partCode : null,
                thaiDate(r.day),
                r.code,
                r.machineCode ? `เครื่อง ${machineTag(r.machineCode, r.machineCapacityKg)}` : "ทั้งสาขา",
                r.kind === "ISSUED" ? "งานยังไม่จบ" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {r.offCatalog ? <OffTag /> : null}
            <Text style={styles.mRowDetail} numberOfLines={2}>
              {r.parentCode ? `ใบรออะไหล่ของ ${r.parentCode} · ` : ""}
              {r.detail}
            </Text>
          </TouchableOpacity>
        ))}
        {rowsFoot}
      </View>
    );
  };

  /** ชิปยอดทั้งกลุ่ม (อะไหล่ของสาขา / สาขาของอะไหล่) — หัวกลุ่มมีแค่ 5 อันดับแรก เปิดกลุ่มแล้วเห็นครบ */
  const breakdownChips = (list: (TopPart | TopBranch)[]) => (
    <View style={styles.chipsWrap}>
      {list.map((x) =>
        "partCode" in x ? (
          <View key={x.sparePartId} style={styles.atChip}>
            <Text style={styles.atChipText}>
              {x.partName} <Text style={styles.code}>{x.partCode}</Text>
              <KindTimes c={x} />
            </Text>
            {x.offCatalog ? <OffTag /> : null}
          </View>
        ) : (
          <View key={x.branchCode} style={styles.atChip}>
            <Text style={styles.atChipText}>
              {x.branchCode} {x.branchName}
              <KindTimes c={x} />
            </Text>
          </View>
        )
      )}
    </View>
  );

  const expandButton = (expanded: boolean, label: string, key: string) => (
    <TouchableOpacity style={styles.expand} onPress={() => toggle(key)} accessibilityLabel={`${expanded ? "ซ่อน" : "ดู"}ทีละใบงาน ${label}`}>
      <Text style={styles.expandText}>{expanded ? "ซ่อนรายการ" : "ดูทีละใบงาน"}</Text>
      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.primaryInk} />
    </TouchableOpacity>
  );

  // ── กลุ่ม ───────────────────────────────────────────

  const branchCard = (g: BranchGroup) => {
    const id = `branch:${g.key}`;
    const expanded = open.has(id);
    const d = details[id];
    const place = [g.region ? `ภาค${g.region}` : "ไม่ระบุภาค", g.team ? `ทีม${g.team}` : null].filter(Boolean).join(" · ");
    return (
      <View key={id} style={styles.group} accessibilityLabel={`กล่องสาขา ${g.branchCode}`}>
        <View style={styles.groupHead}>
          <TouchableOpacity
            style={styles.groupHeadMain}
            activeOpacity={0.7}
            onPress={() => toggle(g.key)}
            accessibilityLabel={`สาขา ${g.branchCode} ${g.branchName}`}
            accessibilityState={{ expanded }}
          >
            <Text style={[styles.groupTitle, !wide && styles.groupTitleSmall, headingFont]}>
              {g.branchCode} · {g.branchName}
            </Text>
            <Text style={styles.groupSub}>{place}</Text>
          </TouchableOpacity>
          <View style={styles.groupNums}>
            <KindPills c={g} small={!wide} />
            <Text style={styles.groupSub}>{g.orders} ใบงาน</Text>
            {wide ? (
              <TouchableOpacity
                onPress={() => navigation.navigate("WorkOrderList", { search: g.branchCode })}
                accessibilityLabel={`ประวัติสาขา ${g.branchCode}`}
              >
                <Text style={styles.historyLink}>ประวัติสาขา</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        {expanded ? (
          <>
            {d?.status === "ok" && d.breakdown.length > 1 ? <View style={styles.groupBody}>{breakdownChips(d.breakdown)}</View> : null}
            {detailBody(id, g.key, true)}
          </>
        ) : (
          <View style={styles.groupBody}>
            {breakdownChips(g.topParts)}
            {g.partCount > g.topParts.length ? <Text style={styles.sub}>และอีก {g.partCount - g.topParts.length} รายการอะไหล่</Text> : null}
          </View>
        )}
        {expandButton(expanded, g.branchCode, g.key)}
      </View>
    );
  };

  const partCard = (g: PartGroup) => {
    const id = `part:${g.key}`;
    const expanded = open.has(id);
    const d = details[id];
    return (
      <View key={id} style={styles.group} accessibilityLabel={`กล่องอะไหล่ ${g.partCode}`}>
        <View style={styles.groupHead}>
          <TouchableOpacity
            style={styles.groupHeadMain}
            activeOpacity={0.7}
            onPress={() => toggle(g.key)}
            accessibilityLabel={`อะไหล่ ${g.partCode} ${g.partName}`}
            accessibilityState={{ expanded }}
          >
            <Text style={[styles.groupTitle, styles.groupTitleSmall, headingFont]}>{g.partName}</Text>
            <View style={styles.codeLine}>
              <Text style={styles.groupSub}>{[g.partCode, g.brand].filter(Boolean).join(" · ")}</Text>
              {g.offCatalog ? <OffTag /> : null}
            </View>
          </TouchableOpacity>
          <View style={styles.groupNums}>
            <KindPills c={g} small />
            <Text style={styles.groupSub}>
              {g.branchCount} สาขา · {g.orders} ใบงาน
            </Text>
          </View>
        </View>
        <View style={styles.groupBody}>
          <Text style={styles.atLabel}>ไปที่สาขาไหนบ้าง</Text>
          {breakdownChips(expanded && d?.status === "ok" ? d.breakdown : g.topBranches)}
          {!(expanded && d?.status === "ok") && g.branchCount > g.topBranches.length ? (
            <Text style={styles.sub}>และอีก {g.branchCount - g.topBranches.length} สาขา</Text>
          ) : null}
        </View>
        {expanded ? detailBody(id, g.key, false) : null}
        {expandButton(expanded, g.partCode, g.key)}
      </View>
    );
  };

  /** ตามอะไหล่บนจอคอม — ตารางเดียวตามตัวอย่าง (อะไหล่ · ใช้แล้ว · เบิกแล้ว · สาขา · ไปที่สาขาไหนบ้าง) */
  const partTable = (groups: PartGroup[]) => (
    <View style={styles.group}>
      <View style={[styles.tr, styles.groupTh]}>
        {["อะไหล่", "ใช้แล้ว (ชิ้น)", "เบิกแล้ว (ชิ้น)", "สาขา", "ไปที่สาขาไหนบ้าง", ""].map((h, i) => (
          <Text key={i} style={[styles.thText, PCOL[i], i >= 1 && i <= 3 && { textAlign: "right" }]}>
            {h}
          </Text>
        ))}
      </View>
      {groups.map((g) => {
        const id = `part:${g.key}`;
        const expanded = open.has(id);
        const d = details[id];
        return (
          <View key={id} style={styles.pRowWrap} accessibilityLabel={`กล่องอะไหล่ ${g.partCode}`}>
            <TouchableOpacity
              style={[styles.tr, expanded && styles.trOpen]}
              activeOpacity={0.7}
              onPress={() => toggle(g.key)}
              accessibilityLabel={`อะไหล่ ${g.partCode} ${g.partName}`}
              accessibilityState={{ expanded }}
            >
              <View style={[PCOL[0], styles.cell]}>
                <Text style={styles.strong}>{g.partName}</Text>
                <View style={styles.codeLine}>
                  <Text style={styles.code}>{[g.partCode, g.brand].filter(Boolean).join(" · ")}</Text>
                  {g.offCatalog ? <OffTag /> : null}
                </View>
              </View>
              <Text style={[styles.td, styles.num, PCOL[1], { color: g.used ? LOOK.USED.fg : colors.textFaint }]}>{g.used || "–"}</Text>
              <Text style={[styles.td, styles.num, PCOL[2], { color: g.issued ? LOOK.ISSUED.fg : colors.textFaint }]}>{g.issued || "–"}</Text>
              <Text style={[styles.td, styles.qty, PCOL[3]]}>{g.branchCount}</Text>
              <View style={[PCOL[4], styles.cell]}>
                {breakdownChips(expanded && d?.status === "ok" ? d.breakdown : g.topBranches)}
                {!(expanded && d?.status === "ok") && g.branchCount > g.topBranches.length ? (
                  <Text style={styles.sub}>และอีก {g.branchCount - g.topBranches.length} สาขา — กดเพื่อดูครบ</Text>
                ) : null}
              </View>
              <View style={[PCOL[5], { alignItems: "flex-end" }]}>
                <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
            {expanded ? <View style={styles.pDetail}>{detailBody(id, g.key, false)}</View> : null}
          </View>
        );
      })}
    </View>
  );

  const groupNoun = page?.view === "part" ? "รายการอะไหล่" : "สาขา";
  const foot = page && page.groups.length ? (
    <View style={styles.foot}>
      <Text style={[styles.sub, { flexShrink: 1 }]}>
        แสดง {page.groups.length} จาก {page.groupCount} {groupNoun} · มากสุดก่อน · กดเลขใบงานเพื่อเปิดใบงาน · Excel ได้ตามตัวกรองที่เลือกอยู่
        (แถวละสาขา+อะไหล่+ใบงาน)
      </Text>
      {page.nextCursor ? (
        <TouchableOpacity style={styles.more} onPress={loadMore} disabled={more} accessibilityLabel="โหลดเพิ่ม">
          {more ? <Spinner size="small" color={colors.primaryInk} /> : null}
          <Text style={styles.moreText}>
            โหลดเพิ่ม ({Math.min(50, page.groupCount - page.groups.length)} {groupNoun})
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  ) : null;

  const body = error ? (
    <EmptyState icon="cloud-offline-outline" title="โหลดรายงานไม่ได้" text={error} />
  ) : !page ? (
    <Spinner color={colors.primary} style={{ marginTop: spacing.xl }} />
  ) : page.groups.length === 0 ? (
    <EmptyState
      icon="storefront-outline"
      title={filtered ? "ไม่มีอะไหล่ที่ตรงกับตัวกรองนี้" : "ยังไม่มีอะไหล่ที่ไปถึงสาขา"}
      text={filtered ? "ลองเปลี่ยนช่วงวันที่ สถานะ ภาค/ทีม หรือคำค้น" : "อะไหล่ที่ช่างใช้ตอนปิดงาน และที่เบิกออกจากคลังแล้ว จะขึ้นที่นี่"}
    />
  ) : (
    // โหลดตัวกรองใหม่อยู่ — ของเดิมจางไว้ ไม่หายวูบ (แถบโหลดด้านบนบอกอยู่แล้วว่ากำลังโหลด)
    <View style={[styles.groups, busy && { opacity: 0.55 }]}>
      {page.view === "part" && table
        ? partTable(page.groups.filter((g): g is PartGroup => !isBranch(g)))
        : page.groups.map((g) => (isBranch(g) ? branchCard(g) : partCard(g)))}
      {foot}
    </View>
  );

  const s = page?.summary;
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {wide ? (
        <>
          <View style={styles.head}>
            <Text style={[styles.lead, { flex: 1 }]}>
              สาขาไหนได้อะไหล่อะไรไปแล้วบ้าง — นับจากใบงานซ่อม ทั้งที่ช่างใช้แล้วและที่เบิกออกจากคลังแต่งานยังไม่จบ
              {page ? ` · ข้อมูล ณ ${formatDateTime(page.generatedAt)}` : ""}
            </Text>
            {excel}
          </View>
          {s ? (
            <View style={styles.tiles}>
              <Tile label="สาขาที่ได้อะไหล่" n={s.branches} hint="สาขา ในช่วงที่เลือก" color={colors.navy} />
              <Tile label="อะไหล่" n={s.parts} hint="รายการ (รหัสไม่ซ้ำ)" color={colors.navy} />
              <Tile
                label="ใช้แล้ว"
                n={s.used}
                hint={kind === "issued" ? "ไม่อยู่ในสถานะที่เลือก" : "ชิ้น · ช่างใส่ตอนปิดงาน"}
                color={LOOK.USED.fg}
                dim={kind === "issued"}
              />
              <Tile
                label="เบิกแล้ว · งานยังไม่จบ"
                n={s.issued}
                hint={kind === "used" ? "ไม่อยู่ในสถานะที่เลือก" : "ชิ้น · ออกจากคลังแล้ว"}
                color={LOOK.ISSUED.fg}
                dim={kind === "used"}
              />
            </View>
          ) : null}
          <View style={styles.filters}>
            {rangeRow}
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>สถานะ</Text>
              {kindChips}
            </View>
            <View style={styles.filterRow}>
              {searchBox}
              {placeDropdowns}
            </View>
            {deepPill}
          </View>
          {tabs}
        </>
      ) : (
        <View style={styles.phoneHead}>
          <View style={styles.filterRow}>
            {searchBox}
            {excel}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, styles.chipOn]}
              onPress={() => setPanel((v) => !v)}
              accessibilityLabel="ช่วงวันที่และตัวกรองอื่น"
              accessibilityState={{ expanded: panel }}
            >
              <Text style={[styles.chipText, styles.chipTextOn]}>
                {rangeShort(range, from, to)} {panel ? "▴" : "▾"}
              </Text>
            </TouchableOpacity>
            {(
              [
                ["branch", "ตามสาขา"],
                ["part", "ตามอะไหล่"],
              ] as const
            ).map(([m, label]) => (
              <TouchableOpacity
                key={m}
                style={[styles.chip, mode === m && styles.chipOn]}
                onPress={() => setMode(m)}
                accessibilityLabel={`มุมมอง ${label}`}
                accessibilityState={{ selected: mode === m }}
                aria-selected={mode === m}
              >
                <Text style={[styles.chipText, mode === m && styles.chipTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.chip, (region || team) && styles.chipOn]}
              onPress={() => setPanel((v) => !v)}
              accessibilityLabel="ภาคและทีม"
            >
              <Text style={[styles.chipText, (region || team) && styles.chipTextOn]}>
                {[region ?? "ทุกภาค", team ? `ทีม${team}` : null].filter(Boolean).join(" · ")} ▾
              </Text>
            </TouchableOpacity>
          </ScrollView>
          {panel ? (
            <View style={styles.panel}>
              {rangeRow}
              <View style={styles.filterRow}>{kindChips}</View>
              <View style={styles.filterRow}>{placeDropdowns}</View>
            </View>
          ) : null}
          {deepPill}
          {s ? (
            <Text style={styles.sub} accessibilityLabel={`สรุป สาขา ${s.branches} อะไหล่ ${s.parts} ใช้แล้ว ${s.used} เบิกแล้ว ${s.issued}`}>
              {s.branches} สาขา · {s.parts} รายการอะไหล่ ·{" "}
              <Text style={{ color: LOOK.USED.fg, fontWeight: "700" }}>ใช้แล้ว {s.used} ชิ้น</Text> ·{" "}
              <Text style={{ color: LOOK.ISSUED.fg, fontWeight: "700" }}>เบิกแล้ว · งานยังไม่จบ {s.issued} ชิ้น</Text>
            </Text>
          ) : null}
        </View>
      )}
      {body}
    </ScrollView>
  );
}

function Tile({ label, n, hint, color, dim }: { label: string; n: number; hint: string; color: string; dim?: boolean }) {
  return (
    <View style={[styles.tile, dim && { opacity: 0.55 }]} accessibilityLabel={`ตัวเลข ${label} ${n}`}>
      <Text style={[styles.tileLabel, { color }]}>{label}</Text>
      <Text style={[styles.tileNum, headingFont]}>{n.toLocaleString("th-TH")}</Text>
      <Text style={styles.sub}>{hint}</Text>
    </View>
  );
}

// คอลัมน์แถวตามตัวอย่าง: วันที่ 96 · อะไหล่/สาขา 1.6 · จำนวน 60 · เครื่อง 110 · ใบงาน 104 · สถานะ 1.4
const COL = [
  { width: 96 },
  { flex: 1.6, minWidth: 0 },
  { width: 60 },
  { width: 120 },
  { width: 110 },
  { flex: 1.4, minWidth: 0 },
] as const;
// ตามอะไหล่: อะไหล่ 1.2 · ใช้แล้ว 90 · เบิกแล้ว 90 · สาขา 60 · ไปที่สาขาไหนบ้าง 2 · ลูกศร 24
const PCOL = [{ flex: 1.2, minWidth: 0 }, { width: 90 }, { width: 90 }, { width: 60 }, { flex: 2, minWidth: 0 }, { width: 24 }] as const;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60, width: "100%", maxWidth: 1240, alignSelf: "center" },
  head: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.md },
  lead: { fontSize: 15, lineHeight: 24, color: colors.body, minWidth: 260 },
  excel: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.roleTech, borderRadius: radius.md, paddingHorizontal: 16, minHeight: 44 },
  excelSmall: { paddingHorizontal: 12, minHeight: 40 },
  excelText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: { flexGrow: 1, flexBasis: 180, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  tileLabel: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
  tileNum: { fontSize: 28, lineHeight: 36, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
  filters: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  filterRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  filterLabel: { fontSize: 14, color: colors.textMuted, minWidth: 64 },
  chip: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.navyFill, borderColor: colors.navyFill },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: "#fff", fontWeight: "700" },
  chipRow: { gap: spacing.sm, paddingRight: spacing.lg },
  dates: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: spacing.sm },
  dateBox: { width: 200 },
  dateLabel: { marginTop: 0, marginBottom: 0, fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.textMuted },
  hint: { fontSize: 13, lineHeight: 18, fontWeight: "700", color: colors.warningInk },
  searchBox: { flexGrow: 1, flexBasis: 260, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 12, minHeight: 44, backgroundColor: colors.card },
  searchInput: { flex: 1, minWidth: 0, fontSize: 15, color: colors.text, paddingVertical: 8 },
  dd: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 170, flexBasis: 220, flexGrow: 1, maxWidth: 300 },
  ddLabel: { fontSize: 14, color: colors.body },
  deep: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  deepText: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
  tabs: { flexDirection: "row", gap: 4, borderBottomWidth: 2, borderBottomColor: colors.border },
  tab: { paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, borderBottomWidth: 3, borderBottomColor: "transparent", marginBottom: -2 },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: colors.textMuted },
  tabTextOn: { color: colors.navy },
  phoneHead: { gap: spacing.sm },
  panel: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  groups: { gap: spacing.md },
  group: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  groupHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 16, rowGap: 6, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.tile },
  groupHeadMain: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0, gap: 2 },
  groupTitle: { fontSize: 17, lineHeight: 26, fontWeight: "700", color: colors.navy },
  groupTitleSmall: { fontSize: 16, lineHeight: 24 },
  groupSub: { fontSize: 13, lineHeight: 18, color: colors.body },
  groupNums: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  groupBody: { paddingHorizontal: 16, paddingVertical: 10, gap: 6, borderTopWidth: 1, borderTopColor: colors.border },
  groupTh: { borderTopWidth: 0, backgroundColor: colors.tile, paddingVertical: 10 },
  historyLink: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.primaryInk, paddingVertical: 4 },
  pill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 3 },
  pillSmall: { paddingHorizontal: 9, paddingVertical: 1 },
  pillText: { fontSize: 14, lineHeight: 20, fontWeight: "700", fontVariant: ["tabular-nums"] },
  pillTextSmall: { fontSize: 12.5, lineHeight: 18 },
  times: { fontWeight: "700", fontVariant: ["tabular-nums"] },
  offTag: { alignSelf: "flex-start", borderWidth: 1, borderColor: colors.offPartLine, backgroundColor: colors.offPartSoft, borderRadius: 6, paddingHorizontal: 6 },
  offTagText: { fontSize: 11.5, lineHeight: 17, fontWeight: "700", color: colors.offPart },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  atChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, maxWidth: "100%" },
  atChipText: { fontSize: 13, lineHeight: 18, color: colors.text, flexShrink: 1 },
  atLabel: { fontSize: 12.5, lineHeight: 18, fontWeight: "700", color: colors.textMuted },
  expand: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, minHeight: 40, borderTopWidth: 1, borderTopColor: colors.border },
  expandText: { fontSize: 14, fontWeight: "700", color: colors.primaryInk },
  tr: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "flex-start" },
  trOpen: { backgroundColor: colors.rowAlt },
  th: { backgroundColor: colors.rowAlt, paddingVertical: 8 },
  thText: { fontSize: 13, lineHeight: 18, fontWeight: "700", color: colors.textMuted },
  cell: { gap: 3 },
  td: { fontSize: 14, lineHeight: 21, color: colors.text },
  muted: { color: colors.body, fontVariant: ["tabular-nums"] },
  qty: { textAlign: "right", fontWeight: "700", fontVariant: ["tabular-nums"] },
  num: { textAlign: "right", fontWeight: "800", fontVariant: ["tabular-nums"] },
  strong: { fontSize: 14, lineHeight: 21, fontWeight: "700", color: colors.text },
  code: { fontSize: 13, lineHeight: 18, fontWeight: "400", color: colors.textMuted, fontVariant: ["tabular-nums"] },
  codeLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  link: { fontSize: 14, lineHeight: 21, fontWeight: "700", color: colors.primaryInk, fontVariant: ["tabular-nums"] },
  sub: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  pRowWrap: {},
  pDetail: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  mRow: { paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border, gap: 2 },
  mRowTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  mRowTitle: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.text },
  mRowLine: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
  mRowDetail: { fontSize: 12, lineHeight: 17, color: colors.textFaint },
  rowsFoot: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  detailError: { padding: spacing.md, gap: spacing.sm, alignItems: "flex-start" },
  errorText: { fontSize: 14, color: colors.dangerInk },
  foot: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  more: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 12, minHeight: 40, backgroundColor: colors.card },
  moreText: { fontSize: 14, fontWeight: "700", color: colors.primaryInk },
});
