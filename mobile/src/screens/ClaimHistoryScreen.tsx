/**
 * ประวัติเคลม — ย้อนดูอะไหล่ทุกชิ้นที่ช่างเคยส่งเคลม (เจ้าของงานขอ ต.ค. 69 · หน้าตาตามตัวอย่างที่ตกลง)
 *
 * เดิมใบเคลมดูได้ทีละใบงาน — Admin Spare Part ตอบไม่ได้ว่าเดือนนี้อนุมัติไปกี่ชิ้น หรือเครื่องเดิมเคลมชิ้นเดิมซ้ำไหม
 * จอคอม = ตารางเหมือนตัวอย่าง · มือถือ = การ์ดทีละชิ้น · ข้อมูลจาก GET /part-claims (กฎทั้งหมดอยู่ฝั่งเซิร์ฟเวอร์ที่เดียว:
 * ใครเห็นอะไร รอบไหนล่าสุด ป้ายสถานะ ตัวเลขสรุป) — ไฟล์ Excel ใช้ตัวกรองชุดเดียวกัน ตัวเลขบนจอกับในไฟล์จึงตรงกัน
 *
 * ค่าตั้งต้น: เดือนนี้ · ทุกสถานะ · เฉพาะรอบล่าสุดของแต่ละชิ้น (เจ้าของงานเลือก — ตีกลับแล้วส่งใหม่ไม่ขึ้นซ้ำสองแถว)
 * เปิดจากลิงก์ "เคลมเครื่องนี้/สาขานี้ทั้งหมด" ในใบงาน = ทุกช่วงเวลา กรองสาขา(+เครื่อง) ตรงตัว
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
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
import { HomeStackParamList } from "../navigation/types";
import { colors, headingFont, radius, spacing } from "../theme";

type Props = NativeStackScreenProps<HomeStackParamList, "ClaimHistory">;

type Status = "ALL" | "PENDING" | "APPROVED" | "REJECTED";
type Look = "PENDING" | "APPROVED" | "REJECTED" | "OLD";

interface Row {
  id: number;
  workOrderId: number;
  code: string;
  orderStatusLabel: string;
  createdAt: string;
  round: number;
  latest: boolean;
  branchCode: string;
  branchName: string;
  techName: string | null;
  brand: string | null;
  model: string | null;
  machineCode: string | null;
  partCode: string;
  partName: string;
  brokenPartCode: string | null;
  quantity: number;
  status: Exclude<Status, "ALL">;
  look: Look;
  statusLabel: string;
  reviewerName: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
}

interface Data {
  rows: Row[];
  total: number;
  /** แถวที่ยังเหลือต่อจากแถวสุดท้ายที่มี — ปุ่มแสดงเพิ่มดูจากตัวนี้ (total รวมเคลมใหม่ที่อยู่บนสุดซึ่งหน้าถัดไปไม่มีวันได้) */
  rest: number;
  tiles: { pending: number; approved: number; rejected: number; total: number; orders: number };
  counts: Record<Status, number>;
  brands: string[];
}

/** ทีละหน้า — ปีหนึ่งมีได้หลายพันชิ้น มือถือที่เปิดจากหน้างานไม่ควรรอโหลดทั้งปี */
const PAGE = 100;
/** เพดานแถวต่อครั้งของ GET /part-claims */
const MAX_LIMIT = 500;

/** สีของป้ายผลตรวจ — ตามตัวอย่าง: เหลือง รอตรวจ · เขียว อนุมัติ · แดง ตีกลับ · เทา รอบเก่าที่ส่งใหม่แล้ว */
const LOOK: Record<Look, { fg: string; bg: string; bd: string }> = {
  PENDING: { fg: colors.warningInk, bg: colors.warningSoft, bd: colors.warningBorder },
  APPROVED: { fg: colors.successInk, bg: colors.successSoft, bd: colors.successLine },
  REJECTED: { fg: colors.dangerInk, bg: colors.dangerSoft, bd: colors.dangerLine },
  OLD: { fg: colors.textMuted, bg: colors.rowAlt, bd: colors.borderStrong },
};

const STATUS_CHIPS: { k: Status; label: string; fg: string }[] = [
  { k: "ALL", label: "ทั้งหมด", fg: colors.text },
  { k: "PENDING", label: "รอตรวจ", fg: colors.warningInk },
  { k: "APPROVED", label: "อนุมัติ", fg: colors.successInk },
  { k: "REJECTED", label: "ตีกลับ", fg: colors.dangerInk },
];

type Preset = "month" | "prev" | "3m" | "year";
const PRESETS: { k: Preset; label: string }[] = [
  { k: "month", label: "เดือนนี้" },
  { k: "prev", label: "เดือนก่อน" },
  { k: "3m", label: "3 เดือน" },
  { k: "year", label: "ปีนี้" },
];

const ymdUtc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/** ช่วงวันที่ของปุ่มลัด ตามวันนี้เวลาไทย — 3 เดือน = เดือนนี้กับสองเดือนก่อนหน้าเต็มเดือน (ไม่ใช่ 90 วันที่ตัดกลางเดือน) */
function rangeOf(p: Preset): [string, string] {
  const today = todayBkk();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  if (p === "prev") return [ymdUtc(y, m - 1, 1), ymdUtc(y, m, 0)];
  if (p === "3m") return [ymdUtc(y, m - 2, 1), today];
  if (p === "year") return [ymdUtc(y, 0, 1), today];
  return [ymdUtc(y, m, 1), today];
}

/** วันที่ตามเวลาไทยของเวลาจากเซิร์ฟเวอร์ — ส่งตอนตีหนึ่งต้องไม่ขึ้นเป็นเมื่อวาน */
const bkkYmd = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);
const monthLabel = (ymd: string) => thaiDate(ymd).split(" ").slice(1).join(" ");

function rangeLabel(from: string, to: string, preset: Preset | null) {
  if (preset === "month" || preset === "prev") return monthLabel(from);
  if (preset === "3m") return "3 เดือน";
  if (preset === "year") return `ปี ${String((Number(from.slice(0, 4)) + 543) % 100).padStart(2, "0")}`;
  if (!from && !to) return "ทุกช่วงเวลา";
  return `${from ? thaiDate(from) : "แรกสุด"} – ${to ? thaiDate(to) : "วันนี้"}`;
}

function StatusPill({ r }: { r: Row }) {
  const t = LOOK[r.look];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.bd }]}>
      <Text style={[styles.pillText, { color: t.fg }]}>{r.statusLabel}</Text>
    </View>
  );
}

const reviewedText = (r: Row) =>
  r.reviewedAt ? [`ตรวจ ${thaiDate(bkkYmd(r.reviewedAt))}`, r.reviewerName].filter(Boolean).join(" · ") : null;
const machineText = (r: Row) => [r.model, r.machineCode ? `เครื่อง ${r.machineCode}` : null].filter(Boolean).join(" · ") || "—";

export default function ClaimHistoryScreen({ navigation, route }: Props) {
  const { width } = useWindowDimensions();
  // ตารางต้องการที่ราว 1,040 px (8 คอลัมน์ตามตัวอย่าง) — จอแคบกว่านั้นเป็นการ์ด ไม่ใช่ตารางเลื่อนข้าง
  const table = width >= 1100;
  const wide = width >= 760;

  const deepParams = route.params?.branchCode ? { branchCode: route.params.branchCode, machineCode: route.params.machineCode } : null;
  const [deep, setDeep] = useState(deepParams);
  const [from, setFrom] = useState(() => (deepParams ? "" : rangeOf("month")[0]));
  const [to, setTo] = useState(() => (deepParams ? "" : rangeOf("month")[1]));
  /**
   * ปุ่มช่วงที่กดไว้ — จำไว้ ไม่ใช่เดาจากวันที่ เพราะบางช่วงได้วันเดียวกัน (มีนาคม: 3 เดือน = ปีนี้ = 1 ม.ค.–วันนี้
   * · มกราคม: เดือนนี้ = ปีนี้) เดาแล้วปุ่มแรกที่ตรงชนะ กดปีนี้แต่ปุ่ม 3 เดือนติดและชิปบนมือถือขึ้น "3 เดือน"
   * เลือกวันเองในช่องวันที่ = ไม่ใช่ปุ่มไหน
   */
  const [preset, setPreset] = useState<Preset | null>(deepParams ? null : "month");
  const [status, setStatus] = useState<Status>("ALL");
  const [brand, setBrand] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [rounds, setRounds] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [opening, setOpening] = useState<number | null>(null);
  // มือถือ: แผงตัวกรองวันที่/ยี่ห้อ/รอบ พับไว้ — ที่บนจอเหลือให้รายการ (ตามตัวอย่างที่มีแค่ชิปแถวเดียว)
  const [panel, setPanel] = useState(false);
  const seq = useRef(0);

  /**
   * เปิดจากลิงก์ในใบงานอีกใบขณะที่หน้านี้ค้างอยู่ — หน้าเดิมถูกเรียกซ้ำด้วยค่าใหม่ ไม่ได้สร้างใหม่
   * จึงต้องตั้งตัวกรองตามลิงก์ใหม่เอง · กลับจากลิงก์มาเปิดจากเมนู ({}) = กลับไปค่าตั้งต้น
   */
  const deepKey = `${route.params?.branchCode ?? ""}|${route.params?.machineCode ?? ""}`;
  const firstKey = useRef(deepKey);
  useEffect(() => {
    if (firstKey.current === deepKey) return;
    firstKey.current = deepKey;
    const p = route.params;
    if (p?.branchCode) {
      setDeep({ branchCode: p.branchCode, machineCode: p.machineCode });
      setFrom("");
      setTo("");
      setPreset(null);
    } else {
      setDeep(null);
      const [f, t] = rangeOf("month");
      setFrom(f);
      setTo(t);
      setPreset("month");
    }
    setStatus("ALL");
    setBrand(null);
    setSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepKey]);

  const params = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      status,
      brand: brand ?? undefined,
      q: q || undefined,
      rounds: rounds ? "all" : "latest",
      branchCode: deep?.branchCode,
      machineCode: deep?.machineCode,
    }),
    [from, to, status, brand, q, rounds, deep]
  );

  // ข้อมูลที่แสดงอยู่ (ไว้อ่านใน load โดยไม่ต้องให้ load เปลี่ยนทุกครั้งที่ข้อมูลเปลี่ยน — ไม่งั้นโหลดวนไม่จบ)
  const dataRef = useRef<{ data: Data; params: typeof params } | null>(null);
  const load = useCallback(async () => {
    const n = ++seq.current;
    setError(null);
    /**
     * กลับมาจากหน้าใบงาน/ดึงรีเฟรช ด้วยตัวกรองเดิม = โหลดเท่าจำนวนที่กดแสดงเพิ่มไว้แล้ว ไม่ใช่หน้าแรกหน้าเดียว
     * เดิมรายการหดเหลือ 100 แถวทุกครั้งที่กลับมา ตำแหน่งที่เลื่อนลงไปก็หาย · เปลี่ยนตัวกรอง = เริ่มหน้าแรกใหม่
     */
    const had = dataRef.current?.params === params ? dataRef.current.data.rows.length : 0;
    try {
      const res = await api.get<Data>("/part-claims", { params: { ...params, limit: Math.min(Math.max(PAGE, had), MAX_LIMIT) } });
      if (n === seq.current) {
        dataRef.current = { data: res.data, params };
        setData(res.data);
      }
    } catch (e) {
      if (n === seq.current) setError(apiErrorMessage(e));
    }
  }, [params]);
  // กลับมาจากหน้าใบงาน (เพิ่งตรวจเคลม) ต้องเห็นผลใหม่ · เปลี่ยนตัวกรองก็โหลดใหม่ (load เปลี่ยนตาม params)
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );
  useRefreshHandler(load);

  async function loadMore() {
    const last = data?.rows[data.rows.length - 1];
    if (!data || !last) return;
    const n = seq.current;
    setMore(true);
    try {
      // ต่อจากแถวสุดท้ายที่มี ไม่ใช่นับลำดับ — มีเคลมใหม่เข้ามาระหว่างนี้ แถวเดิมจะไม่ซ้ำ (ดู GET /part-claims)
      const res = await api.get<Data>("/part-claims", { params: { ...params, limit: PAGE, before: `${last.createdAt}|${last.id}` } });
      // ตัวกรองเปลี่ยน/โหลดใหม่ระหว่างรอ — หน้าถัดไปของชุดเก่าต่อท้ายชุดใหม่ไม่ได้
      if (n === seq.current && dataRef.current?.data === data) {
        // กันซ้ำอีกชั้น: key ซ้ำทำให้ React วาดแถวผิด และแถวเดียวกันขึ้นสองครั้ง
        const have = new Set(data.rows.map((r) => r.id));
        const next = { ...res.data, rows: [...data.rows, ...res.data.rows.filter((r) => !have.has(r.id))] };
        dataRef.current = { data: next, params };
        setData(next);
      }
    } catch (e) {
      showAlert("โหลดเพิ่มไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setMore(false);
    }
  }

  async function download() {
    setDownloading(true);
    try {
      const res = await api.get<{ path: string }>("/part-claims/export", { params, loadingText: "กำลังสร้างไฟล์ Excel..." });
      const url = resolveImageUrl(res.data.path);
      if (url) await openUrl(url);
    } catch (e) {
      showAlert("ดาวน์โหลดไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  // ใบเคลม PDF ใช้ลิงก์เดิมของใบงาน (มี token ของตัวเอง) — ยังไม่อนุมัติก็เปิดได้ เซิร์ฟเวอร์ติดคำว่า "ร่าง" ให้
  async function openPdf(r: Row) {
    setOpening(r.id);
    try {
      const res = await api.post<{ path: string }>(`/work-orders/${r.workOrderId}/claims/${r.id}/pdf-link`, undefined, {
        loadingText: "กำลังเปิดใบเคลม...",
      });
      const url = resolveImageUrl(res.data.path);
      if (url) await openUrl(url);
    } catch (e) {
      showAlert("เปิดใบเคลมไม่ได้", apiErrorMessage(e));
    } finally {
      setOpening(null);
    }
  }

  const openOrder = (r: Row) => navigation.navigate("WorkOrderDetail", { id: r.workOrderId });
  const pickPreset = (p: Preset) => {
    const [f, t] = rangeOf(p);
    setFrom(f);
    setTo(t);
    setPreset(p);
  };
  // ล้างตัวกรองจากลิงก์ผ่าน params — กดลิงก์เดิมในใบงานซ้ำทีหลังจะได้ทำงานอีกครั้ง (ค่าเปลี่ยนจริง)
  const clearDeep = () => navigation.setParams({ branchCode: undefined, machineCode: undefined });

  const rows = data?.rows ?? [];
  const filtered = !!(q || brand || status !== "ALL" || deep);

  const statusChips = (
    <>
      {STATUS_CHIPS.map((c) => {
        const on = status === c.k;
        return (
          <TouchableOpacity
            key={c.k}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => setStatus(c.k)}
            accessibilityLabel={`สถานะ ${c.label}`}
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.chipText, { color: on ? "#fff" : c.fg }, on && styles.chipTextOn]}>
              {c.label} · {data?.counts[c.k] ?? "–"}
            </Text>
          </TouchableOpacity>
        );
      })}
    </>
  );

  const dateRow = (
    <View style={styles.filterRow}>
      {wide ? <Text style={styles.filterLabel}>วันที่ส่ง</Text> : null}
      {PRESETS.map((p) => {
        const on = preset === p.k;
        return (
          <TouchableOpacity
            key={p.k}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => pickPreset(p.k)}
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
          <DateField
            label="ตั้งแต่"
            value={from}
            onChange={(v) => {
              setFrom(v);
              setPreset(null);
            }}
            emptyHint="แรกสุด"
            labelStyle={styles.dateLabel}
          />
        </View>
        <View style={styles.dateBox}>
          <DateField
            label="ถึง"
            value={to}
            onChange={(v) => {
              setTo(v);
              setPreset(null);
            }}
            emptyHint="วันนี้"
            labelStyle={styles.dateLabel}
          />
        </View>
      </View>
    </View>
  );

  const brandAndRounds = (
    <>
      <View style={styles.brand}>
        <Dropdown
          value={brand ?? ""}
          options={[{ value: "", label: "ทุกยี่ห้อ" }, ...(data?.brands ?? []).map((b) => ({ value: b, label: b }))]}
          onChange={(v) => setBrand(v || null)}
          accessibilityLabel="ยี่ห้อ"
        />
      </View>
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setRounds((v) => !v)}
        accessibilityLabel="รวมรอบที่ถูกตีกลับแล้วส่งใหม่"
        accessibilityState={{ checked: rounds }}
      >
        <View style={[styles.box, rounds && styles.boxOn]}>{rounds ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}</View>
        <Text style={styles.toggleText}>รวมรอบที่ถูกตีกลับแล้วส่งใหม่</Text>
      </TouchableOpacity>
    </>
  );

  const searchBox = (
    <View style={styles.searchBox}>
      <Ionicons name="search" size={17} color={colors.textMuted} />
      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder={wide ? "ค้นหา ใบงาน · สาขา · รหัสอะไหล่ · รหัสตัวเสีย · เลขเครื่อง" : "ใบงาน · สาขา · รหัสอะไหล่"}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="ค้นหาในประวัติเคลม"
        returnKeyType="search"
      />
      {search ? (
        <TouchableOpacity onPress={() => setSearch("")} accessibilityLabel="ล้างคำค้น">
          <Ionicons name="close-circle" size={17} color={colors.textFaint} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const excel = (
    <TouchableOpacity
      style={[styles.excel, !wide && styles.excelSmall, (downloading || !data?.total) && { opacity: 0.6 }]}
      onPress={download}
      disabled={downloading || !data?.total}
      accessibilityLabel="ดาวน์โหลด Excel"
    >
      {downloading ? <Spinner size="small" color="#fff" /> : <Ionicons name="download-outline" size={17} color="#fff" />}
      <Text style={styles.excelText}>{wide ? "ดาวน์โหลด Excel" : "Excel"}</Text>
    </TouchableOpacity>
  );

  const deepPill = deep ? (
    <View style={styles.deep}>
      <Ionicons name="filter" size={14} color={colors.primaryInk} />
      <Text style={styles.deepText}>
        {deep.machineCode ? `เครื่อง ${deep.machineCode} · ` : ""}สาขา {deep.branchCode} · ทุกช่วงเวลา
      </Text>
      <TouchableOpacity onPress={clearDeep} accessibilityLabel="เลิกกรองเครื่อง/สาขา" hitSlop={8}>
        <Ionicons name="close" size={16} color={colors.primaryInk} />
      </TouchableOpacity>
    </View>
  ) : null;

  const actions = (r: Row) => (
    <>
      <TouchableOpacity style={styles.pdf} onPress={() => openPdf(r)} disabled={opening !== null} accessibilityLabel={`ใบเคลม PDF ${r.code} ${r.partCode}`}>
        {opening === r.id ? <Spinner size="small" color={colors.primaryInk} /> : null}
        <Text style={styles.pdfText}>ใบเคลม PDF</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.open} onPress={() => openOrder(r)} accessibilityLabel={`เปิดใบงาน ${r.code}`}>
        <Text style={styles.openText}>เปิดใบงาน</Text>
      </TouchableOpacity>
    </>
  );

  const body = error ? (
    <EmptyState icon="cloud-offline-outline" title="โหลดประวัติเคลมไม่ได้" text={error} />
  ) : !data ? (
    <Spinner page color={colors.primary} />
  ) : rows.length === 0 ? (
    <EmptyState
      icon="shield-checkmark-outline"
      title={filtered || from || to ? "ไม่มีเคลมที่ตรงกับตัวกรองนี้" : "ยังไม่มีใบเคลม"}
      text={filtered || from || to ? "ลองเปลี่ยนช่วงวันที่หรือสถานะ" : "อะไหล่ที่ช่างส่งเคลมตอนปิดงานจะขึ้นที่นี่"}
    />
  ) : table ? (
    <View style={styles.tableCard}>
      <View style={[styles.tr, styles.th]}>
        {["วันที่ส่งเคลม", "ใบงาน", "สาขา · ช่าง", "เครื่อง", "อะไหล่ที่เคลม · รหัสตัวเสีย", "จำนวน", "ผลตรวจ", ""].map((h, i) => (
          <Text key={i} style={[styles.thText, COL[i], i === 5 && { textAlign: "right" }]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r) => (
        <View key={r.id} style={[styles.tr, !r.latest && styles.trOld]} accessibilityLabel={`แถวเคลม ${r.code} ${r.partCode}`}>
          <Text style={[styles.td, styles.muted, COL[0]]}>{thaiDate(bkkYmd(r.createdAt))}</Text>
          <View style={[COL[1], styles.cell]}>
            <TouchableOpacity onPress={() => openOrder(r)} accessibilityLabel={`ใบงาน ${r.code}`}>
              <Text style={styles.link}>{r.code}</Text>
            </TouchableOpacity>
            {r.round > 1 ? <Text style={styles.round}>ส่งรอบ {r.round}</Text> : null}
          </View>
          <View style={[COL[2], styles.cell]}>
            <Text style={styles.strong}>{r.branchName}</Text>
            <Text style={styles.sub}>
              {r.branchCode}
              {r.techName ? ` · ช่าง ${r.techName}` : ""}
            </Text>
          </View>
          <View style={[COL[3], styles.cell]}>
            <Text style={styles.td}>{r.brand ?? "—"}</Text>
            <Text style={styles.sub}>{machineText(r)}</Text>
          </View>
          <View style={[COL[4], styles.cell]}>
            <Text style={styles.strong}>{r.partName}</Text>
            <Text style={styles.sub}>
              เบิก {r.partCode} · ตัวเสีย {r.brokenPartCode ?? "—"}
            </Text>
          </View>
          <Text style={[styles.td, COL[5], { textAlign: "right" }]}>{r.quantity}</Text>
          <View style={[COL[6], styles.cell]}>
            <StatusPill r={r} />
            {reviewedText(r) ? <Text style={styles.sub}>{reviewedText(r)}</Text> : null}
            {r.rejectReason ? <Text style={styles.reason}>“{r.rejectReason}”</Text> : null}
          </View>
          <View style={[COL[7], styles.actions]}>{actions(r)}</View>
        </View>
      ))}
      <Foot shown={rows.length} total={data.total} rest={data.rest} more={more} onMore={loadMore} />
    </View>
  ) : (
    <>
      <View style={styles.cards}>
        {rows.map((r) => (
          <TouchableOpacity
            key={r.id}
            style={[styles.card, wide && styles.cardWide, !r.latest && styles.trOld]}
            activeOpacity={0.8}
            onPress={() => openOrder(r)}
            accessibilityLabel={`การ์ดเคลม ${r.code} ${r.partCode}`}
          >
            <View style={styles.cardTop}>
              <StatusPill r={r} />
              {r.round > 1 ? <Text style={styles.round}>ส่งรอบ {r.round}</Text> : null}
              <View style={{ flex: 1 }} />
              <Text style={styles.sub}>ส่ง {thaiDate(bkkYmd(r.createdAt))}</Text>
            </View>
            <Text style={styles.cardPart}>
              {r.partName} × {r.quantity}
            </Text>
            <Text style={styles.cardLine}>
              เบิก {r.partCode} · ตัวเสีย {r.brokenPartCode ?? "—"}
            </Text>
            <Text style={styles.sub}>
              {[r.code, r.branchName, [r.brand, r.machineCode ? `เครื่อง ${r.machineCode}` : null].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
            </Text>
            {r.rejectReason ? <Text style={styles.reason}>“{r.rejectReason}”</Text> : null}
            <View style={styles.cardFoot}>
              <Text style={[styles.sub, { flex: 1 }]} numberOfLines={1}>
                {reviewedText(r) ?? (r.techName ? `ช่าง ${r.techName}` : "")}
              </Text>
              <TouchableOpacity style={styles.pdf} onPress={() => openPdf(r)} disabled={opening !== null} accessibilityLabel={`ใบเคลม PDF ${r.code} ${r.partCode}`}>
                {opening === r.id ? <Spinner size="small" color={colors.primaryInk} /> : null}
                <Text style={styles.pdfText}>ใบเคลม PDF</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </View>
      <Foot shown={rows.length} total={data.total} rest={data.rest} more={more} onMore={loadMore} plain />
    </>
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {wide ? (
        <>
          <View style={styles.head}>
            <Text style={[styles.lead, { flex: 1 }]}>ทุกชิ้นที่ช่างเคยส่งเคลม — รอตรวจ อนุมัติแล้ว และตีกลับ · ดูย้อนหลังได้ทุกเดือน</Text>
            {excel}
          </View>
          {data ? (
            <View style={styles.tiles}>
              <Tile label="รอตรวจ" n={data.tiles.pending} hint="ชิ้น · รอ Admin Spare Part" color={colors.warningInk} />
              <Tile label="อนุมัติแล้ว" n={data.tiles.approved} hint="ชิ้น · ออกใบเคลมได้" color={colors.successInk} />
              <Tile label="ตีกลับ · ยังไม่ส่งใหม่" n={data.tiles.rejected} hint="ชิ้น · รอบล่าสุดถูกตีกลับ" color={colors.dangerInk} />
              <Tile label="ทั้งหมดในช่วงนี้" n={data.tiles.total} hint={`ชิ้น จาก ${data.tiles.orders} ใบงาน`} color={colors.navy} />
            </View>
          ) : null}
          <View style={styles.filters}>
            {dateRow}
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>สถานะ</Text>
              {statusChips}
            </View>
            <View style={styles.filterRow}>
              {searchBox}
              {brandAndRounds}
            </View>
            {deepPill}
          </View>
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
                {rangeLabel(from, to, preset)} {panel ? "▴" : "▾"}
              </Text>
            </TouchableOpacity>
            {statusChips}
          </ScrollView>
          {panel ? (
            <View style={styles.panel}>
              {dateRow}
              <View style={styles.filterRow}>{brandAndRounds}</View>
            </View>
          ) : null}
          {deepPill}
          {data ? (
            <Text style={styles.sub}>
              รวม {data.tiles.total} ชิ้น จาก {data.tiles.orders} ใบงาน · รอตรวจ {data.tiles.pending} · อนุมัติ {data.tiles.approved} · ตีกลับ{" "}
              {data.tiles.rejected}
            </Text>
          ) : null}
        </View>
      )}
      {body}
    </ScrollView>
  );
}

function Tile({ label, n, hint, color }: { label: string; n: number; hint: string; color: string }) {
  return (
    <View style={styles.tile} accessibilityLabel={`${label} ${n}`}>
      <Text style={[styles.tileLabel, { color }]}>{label}</Text>
      <Text style={[styles.tileNum, headingFont]}>{n}</Text>
      <Text style={styles.sub}>{hint}</Text>
    </View>
  );
}

function Foot({ shown, total, rest, more, onMore, plain }: { shown: number; total: number; rest: number; more: boolean; onMore: () => void; plain?: boolean }) {
  return (
    <View style={[styles.foot, plain && styles.footPlain]}>
      <Text style={styles.sub}>
        แสดง {shown} จาก {total} รายการ · เรียงจากส่งล่าสุด
      </Text>
      {rest > 0 ? (
        <TouchableOpacity style={styles.more} onPress={onMore} disabled={more} accessibilityLabel="แสดงเพิ่ม">
          {more ? <Spinner size="small" color={colors.primaryInk} /> : null}
          <Text style={styles.moreText}>แสดงเพิ่มอีก {Math.min(PAGE, rest)} รายการ</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.sub}>Excel ได้ตามตัวกรองที่เลือกอยู่</Text>
      )}
    </View>
  );
}

// คอลัมน์ตามตัวอย่าง: วันที่ 96 · ใบงาน 112 · สาขา 1.1 · เครื่อง 1 · อะไหล่ 1.3 · จำนวน 54 · ผลตรวจ 1 · ปุ่ม 172
const COL = [
  { width: 96 },
  { width: 112 },
  { flex: 1.1, minWidth: 0 },
  { flex: 1, minWidth: 0 },
  { flex: 1.3, minWidth: 0 },
  { width: 54 },
  { flex: 1, minWidth: 0 },
  { width: 172 },
] as const;

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
  searchBox: { flexGrow: 1, flexBasis: 260, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 12, minHeight: 44, backgroundColor: colors.card },
  searchInput: { flex: 1, minWidth: 0, fontSize: 15, color: colors.text, paddingVertical: 8 },
  brand: { minWidth: 170, flexBasis: 200 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 12, minHeight: 44, backgroundColor: colors.card },
  box: { width: 18, height: 18, borderRadius: 5, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: colors.navyFill, borderColor: colors.navyFill },
  toggleText: { fontSize: 14, color: colors.text },
  deep: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  deepText: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
  phoneHead: { gap: spacing.sm },
  panel: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  tableCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  tr: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "flex-start" },
  th: { borderTopWidth: 0, backgroundColor: colors.tile, paddingVertical: 10 },
  thText: { fontSize: 13, lineHeight: 18, fontWeight: "700", color: colors.navy },
  trOld: { backgroundColor: colors.rowAlt },
  cell: { gap: 3 },
  td: { fontSize: 14, lineHeight: 21, color: colors.text },
  muted: { color: colors.body, fontVariant: ["tabular-nums"] },
  strong: { fontSize: 14, lineHeight: 21, fontWeight: "700", color: colors.text },
  sub: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  link: { fontSize: 14, lineHeight: 21, fontWeight: "700", color: colors.primaryInk, fontVariant: ["tabular-nums"] },
  round: { alignSelf: "flex-start", fontSize: 12, lineHeight: 16, color: colors.body, backgroundColor: colors.rowAlt, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: "hidden" },
  pill: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  pillText: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  reason: { fontSize: 13, lineHeight: 18, color: colors.dangerInk },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" },
  pdf: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primarySoft, borderRadius: radius.sm, paddingHorizontal: 10, minHeight: 36 },
  pdfText: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
  open: { justifyContent: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingHorizontal: 10, minHeight: 36, backgroundColor: colors.card },
  openText: { fontSize: 13, fontWeight: "700", color: colors.text },
  foot: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  footPlain: { borderTopWidth: 0, paddingHorizontal: 0 },
  more: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 12, minHeight: 36 },
  moreText: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "flex-start" },
  card: { width: "100%", backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  cardWide: { width: "auto", flexGrow: 1, flexBasis: 340, maxWidth: 560 },
  cardTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  cardPart: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: colors.text },
  cardLine: { fontSize: 13, lineHeight: 19, color: colors.body },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border, borderStyle: "dashed" },
});
