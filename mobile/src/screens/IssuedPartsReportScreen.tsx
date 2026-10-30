/**
 * อะไหล่เบิกแล้ว · งานยังไม่จบ — ของออกจากคลังไปแล้ว ค้างอยู่ใบไหน ถึงขั้นไหน (เจ้าของงานขอ ต.ค. 69 · ตามตัวอย่างที่ตกลง)
 *
 * ข้อมูลจาก GET /work-orders/reports/issued-parts เป็นแถวแบนต่ออะไหล่ (รวมตัวที่ยังไม่เบิกในใบเดียวกัน issued=false)
 * กฎว่าอะไรนับ กลุ่มขั้น และ "เลยวันนัด" อยู่ฝั่งเซิร์ฟเวอร์ที่เดียว — หน้านี้แค่จัดกลุ่มและกรอง
 * จอกว้างเป็นตาราง (คนนั่งไล่ทีละใบ) · จอแคบเป็นการ์ด เพราะตารางหกคอลัมน์บนมือถืออ่านไม่ออก
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import Dropdown from "../components/Dropdown";
import { thaiDate } from "../components/DateField";
import { useRefreshHandler } from "../components/RefreshButton";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { showAlert } from "../utils/alert";
import { openUrl } from "../utils/share";
import { HomeStackParamList } from "../navigation/types";
import { formatDateTime } from "./WorkOrderListScreen";
import { colors, radius, spacing } from "../theme";

type Props = NativeStackScreenProps<HomeStackParamList, "IssuedPartsReport">;

/** confirm = เบิกครบแล้ว รอแอดมินโทรคอนเฟิร์มลูกค้า — ที่พักปกติของของที่เบิกแล้ว (เบิกก่อนคอนเฟิร์ม ต.ค. 69 รอบสอง) */
type Bucket = "transfer" | "confirm" | "dispatch" | "field" | "claim" | "other";

interface Row {
  partRowId: number;
  workOrderId: number;
  code: string;
  status: string;
  statusLabel: string;
  bucket: Bucket;
  branchCode: string;
  branchName: string;
  region: string | null;
  team: string | null;
  machineCode: string | null;
  symptom: string | null;
  scheduledAt: string | null;
  scheduledTime: string | null;
  confirmed: boolean;
  lateDays: number | null;
  sparePartId: number;
  partCode: string;
  partName: string;
  quantity: number;
  unit: string | null;
  issued: boolean;
  inStock: boolean | null;
  warehouse: string | null;
  requisitionNo: string | null;
  transferFrom: string | null;
  transferReqNo: string | null;
  transferNo: string | null;
  transferArrived: boolean;
  issuedAt: string | null;
  issuedDays: number | null;
}

/** ใบงานหนึ่งใบ — แถวแรกเป็นตัวแทนข้อมูลระดับใบ (ขั้น นัด ทีม) */
interface Order {
  head: Row;
  issued: Row[];
  pending: Row[];
  /** เบิกนานสุดกี่วัน และวันที่ — ตัวที่เบิกก่อนสุดในใบ */
  days: number | null;
  firstAt: string | null;
  /** คลังที่เกี่ยว (ใช้กรอง) — คลังที่เบิก คลังปลายทาง และคลังต้นทางของของที่โอน */
  warehouses: Set<string>;
}

type Tab = "order" | "part";
type Chip = "all" | Bucket | "late";

/** เบิกนานเกินนี้ (วัน) ขึ้นสีส้ม — ของออกจากคลังเกินสัปดาห์แล้วงานยังไม่จบ ควรมีคนถาม */
const OLD_DAYS = 7;

const CHIPS: { value: Chip; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "transfer", label: "กำลังโอน / เบิกคลังอื่น" },
  { value: "confirm", label: "รอคอนเฟิร์มลูกค้า" },
  { value: "dispatch", label: "รอปล่อยงาน" },
  { value: "field", label: "ช่างเข้างาน" },
  { value: "claim", label: "รอตรวจเคลม" },
  { value: "other", label: "ระหว่างนัด / เบิกเพิ่ม" },
  { value: "late", label: "เลยวันนัด" },
];

const qtyText = (r: Row) => `×${r.quantity}${r.unit ? ` ${r.unit}` : ""}`;
const short = (w: string | null) => (w ?? "—").replace(/^คลังลาดพร้าว 94$/, "คลัง 94");

/** ของที่ออกจากคลังแล้วอยู่ไหน — ใบเบิกส่งมอบ หรือเบิกเพื่อโอน (ต้นทาง → ปลายทาง) */
function issuedText(r: Row) {
  if (r.inStock === true && r.requisitionNo) {
    const via = r.transferReqNo ? ` · โอนจาก${r.transferFrom ?? "—"}` : "";
    return `${short(r.warehouse)} · ใบเบิก ${r.requisitionNo}${via}`;
  }
  return `เบิกจาก${r.transferFrom ?? "—"} · ใบเบิก ${r.transferReqNo} → ${short(r.warehouse)} · ใบโอน ${r.transferNo ?? "—"} · ${
    r.transferArrived ? "โอนถึงแล้ว" : "กำลังโอน"
  }`;
}
const pendingText = (r: Row) => (r.inStock === true ? `มีที่${short(r.warehouse)}` : r.inStock === false ? "หมด" : "ยังไม่เช็ค");
const moving = (r: Row) => !!r.transferReqNo && !r.requisitionNo;
const visitText = (r: Row) => (r.scheduledAt ? `${thaiDate(r.scheduledAt)}${r.scheduledTime ? ` · ${r.scheduledTime}` : ""}` : "ยังไม่มีนัด");
const daysText = (d: number | null) => (d === null ? "ไม่ทราบ" : d === 0 ? "วันนี้" : `${d} วัน`);
/** วันที่ตามเวลาไทยจากเวลา ISO — เบิกตอนห้าทุ่มต้องเป็นวันนั้น ไม่ใช่วันถัดไปตาม UTC */
const bkkYmd = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);

/** ป้ายขั้น — สีตามคนที่ใบรออยู่ (แอดมิน ม่วง · หัวหน้าภาค ฟ้า · ช่าง เขียว) เหมือนหน้ารายการใบงาน */
function Stage({ r }: { r: Row }) {
  const who = r.statusLabel.split(" · ")[0];
  const tone =
    who === "ช่าง"
      ? { bg: colors.roleTechSoft, fg: colors.roleTech }
      : who === "หัวหน้าภาค"
        ? { bg: colors.roleSupervisorSoft, fg: colors.roleSupervisor }
        : who === "แอดมิน"
          ? { bg: colors.roleAdminSoft, fg: colors.roleAdmin }
          : { bg: colors.background, fg: colors.body };
  return <Text style={[styles.stage, { backgroundColor: tone.bg, color: tone.fg }]}>{r.statusLabel}</Text>;
}

function Late({ r }: { r: Row }) {
  return r.lateDays ? <Text style={styles.late}>เลยนัด {r.lateDays} วัน · ยังไม่ปิดงาน</Text> : null;
}

export default function IssuedPartsReportScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("order");
  const [chip, setChip] = useState<Chip>("all");
  const [search, setSearch] = useState("");
  const [warehouse, setWarehouse] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<{ rows: Row[]; generatedAt: string }>("/work-orders/reports/issued-parts");
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
      const res = await api.get<{ path: string }>("/work-orders/reports/issued-parts", {
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

  // รวมเป็นรายใบ — แถวจากเซิร์ฟเวอร์เรียงตามขั้นแล้ว ลำดับที่เจอครั้งแรกจึงเป็นลำดับขั้น
  const orders = useMemo(() => {
    const map = new Map<number, Order>();
    for (const r of rows ?? []) {
      const o = map.get(r.workOrderId) ?? { head: r, issued: [], pending: [], days: null, firstAt: null, warehouses: new Set<string>() };
      if (r.issued) {
        o.issued.push(r);
        if (r.issuedDays !== null) o.days = Math.max(o.days ?? 0, r.issuedDays);
        if (r.issuedAt && (!o.firstAt || r.issuedAt < o.firstAt)) o.firstAt = r.issuedAt;
        for (const w of [r.warehouse, r.transferFrom]) if (w) o.warehouses.add(w);
      } else o.pending.push(r);
      map.set(r.workOrderId, o);
    }
    return [...map.values()];
  }, [rows]);

  const regions = useMemo(() => [...new Set(orders.map((o) => o.head.region).filter((x): x is string => !!x))].sort(), [orders]);
  const warehouses = useMemo(() => [...new Set(orders.flatMap((o) => [...o.warehouses]))].sort(), [orders]);

  // ค้นหา + คลัง + ภาค ก่อน แล้วนับปุ่มกรอง — ตัวเลขบนปุ่มบอกว่ากดแล้วจะเหลือกี่ใบ
  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(
      (o) =>
        (!warehouse || o.warehouses.has(warehouse)) &&
        (!region || o.head.region === region) &&
        (!q ||
          [o.head.code, o.head.branchCode, o.head.branchName, o.head.machineCode ?? "", o.head.team ?? ""].some((v) => v.toLowerCase().includes(q)) ||
          [...o.issued, ...o.pending].some((r) =>
            [r.partCode, r.partName, r.requisitionNo ?? "", r.transferReqNo ?? "", r.transferNo ?? ""].some((v) => v.toLowerCase().includes(q))
          ))
    );
  }, [orders, search, warehouse, region]);
  const inChip = (o: Order, c: Chip) => c === "all" || (c === "late" ? !!o.head.lateDays : o.head.bucket === c);
  const counts = useMemo(() => Object.fromEntries(CHIPS.map((c) => [c.value, base.filter((o) => inChip(o, c.value)).length])), [base]);
  const shown = useMemo(() => base.filter((o) => inChip(o, chip)), [base, chip]);

  // ตัวเลขด้านบนนับจากสิ่งที่เห็นอยู่ — กรองแล้วตัวเลขต้องตามด้วย
  const stats = useMemo(() => {
    const issued = shown.flatMap((o) => o.issued);
    return {
      orders: shown.length,
      qty: issued.reduce((n, r) => n + r.quantity, 0),
      parts: new Set(issued.map((r) => r.sparePartId)).size,
      transfer: shown.filter((o) => o.head.bucket === "transfer").length,
      late: shown.filter((o) => !!o.head.lateDays).length,
    };
  }, [shown]);

  // ตามใบงาน: จัดกลุ่มตามขั้น (ลำดับมาจากเซิร์ฟเวอร์)
  const byStage = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of shown) map.set(o.head.statusLabel, [...(map.get(o.head.statusLabel) ?? []), o]);
    return [...map.entries()];
  }, [shown]);

  // ตามอะไหล่: ชิ้นที่ออกไปมากสุดก่อน
  const byPart = useMemo(() => {
    const map = new Map<number, { row: Row; qty: number; list: { o: Order; r: Row }[]; wh: Map<string, number> }>();
    for (const o of shown)
      for (const r of o.issued) {
        const g = map.get(r.sparePartId) ?? { row: r, qty: 0, list: [], wh: new Map<string, number>() };
        g.qty += r.quantity;
        g.list.push({ o, r });
        const where = moving(r) && !r.transferArrived ? `กำลังโอน ${short(r.transferFrom)} → ${short(r.warehouse)}` : short(r.warehouse);
        g.wh.set(where, (g.wh.get(where) ?? 0) + r.quantity);
        map.set(r.sparePartId, g);
      }
    return [...map.values()].sort((a, b) => b.qty - a.qty || a.row.partCode.localeCompare(b.row.partCode));
  }, [shown]);

  const openOrder = (id: number) => navigation.navigate("WorkOrderDetail", { id });
  const OrderLink = ({ r }: { r: Row }) => (
    <TouchableOpacity onPress={() => openOrder(r.workOrderId)} accessibilityLabel={`เปิดใบงาน ${r.code}`}>
      <Text style={styles.wo}>{r.code}</Text>
    </TouchableOpacity>
  );
  const Parts = ({ o }: { o: Order }) => (
    <View style={{ gap: 4 }}>
      {o.issued.map((r) => (
        <View key={r.partRowId} style={[styles.part, moving(r) && styles.partMove]} accessibilityLabel={`เบิกแล้ว ${r.code} ${r.partCode}`}>
          <Text style={styles.partName}>
            {r.partName} <Text style={styles.partCode}>{r.partCode}</Text> {qtyText(r)}
          </Text>
          <Text style={[styles.partWhere, moving(r) && { color: colors.warningInk }]}>{issuedText(r)}</Text>
        </View>
      ))}
    </View>
  );
  const Pending = ({ o }: { o: Order }) =>
    o.pending.length ? (
      <View style={{ gap: 2 }}>
        {o.pending.map((r) => (
          <Text key={r.partRowId} style={styles.pending}>
            {r.partName} {qtyText(r)} · {pendingText(r)}
          </Text>
        ))}
      </View>
    ) : (
      <Text style={styles.none}>—</Text>
    );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sub}>
        ใบงานที่ยังไม่ปิด แต่อะไหล่ออกจากคลังแล้ว — ของอยู่ระหว่างโอน รอช่างเข้า หรืออยู่กับช่าง · ปิดงานแล้วหายจากหน้านี้เอง
        {generatedAt ? ` · ข้อมูล ณ ${formatDateTime(generatedAt)}` : ""}
      </Text>

      <View style={styles.tiles}>
        {(
          [
            ["ใบงาน", stats.orders, "ยังไม่ปิด · เบิกแล้วอย่างน้อย 1 ตัว", false],
            ["ชิ้นที่ออกจากคลัง", stats.qty, `${stats.parts} รายการอะไหล่`, false],
            ["กำลังโอน / เบิกคลังอื่น", stats.transfer, "หัวหน้าภาคกำลังเบิก-โอน", false],
            ["เลยวันนัดแล้ว", stats.late, "ของออกไปแล้ว งานยังไม่ปิด — ตามทีม", true],
          ] as const
        ).map(([label, n, hint, warn]) => (
          <View key={label} style={[styles.tile, warn && n > 0 && styles.tileWarn]} accessibilityLabel={`${label} ${n}`}>
            <Text style={styles.tileLabel}>{label}</Text>
            <Text style={[styles.tileNum, warn && n > 0 && { color: colors.rollbackInk }]}>{n}</Text>
            {wide ? <Text style={styles.tileHint}>{hint}</Text> : null}
          </View>
        ))}
      </View>

      <View style={styles.bar}>
        <View style={styles.tabs}>
          {(
            [
              ["order", "ตามใบงาน"],
              ["part", "ตามอะไหล่"],
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
          accessibilityLabel="ดาวน์โหลด Excel อะไหล่เบิกแล้ว"
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
            placeholder="ค้นเลขใบงาน สาขา รหัสอะไหล่ หรือเลขใบเบิก"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="ค้นหาในรายงานอะไหล่เบิกแล้ว"
          />
        </View>
        {warehouses.length > 1 ? (
          <View style={styles.dd}>
            <Dropdown
              value={warehouse}
              onChange={setWarehouse}
              clearable
              placeholder="คลัง: ทั้งหมด"
              accessibilityLabel="กรองคลัง"
              options={warehouses.map((w) => ({ value: w, label: w }))}
            />
          </View>
        ) : null}
        {/* ช่องภาคขึ้นเมื่อมีให้เลือกจริง — หัวหน้าภาคที่ถือภาคเดียวไม่ต้องเห็นช่องที่มีตัวเลือกเดียว ส่วนคนที่ถือหลายภาคได้ช่องนี้เอง */}
        {regions.length > 1 ? (
          <View style={styles.dd}>
            <Dropdown
              value={region}
              onChange={setRegion}
              clearable
              placeholder="ภาค: ทั้งหมด"
              accessibilityLabel="กรองภาค"
              options={regions.map((r) => ({ value: r, label: `ภาค${r}` }))}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.bar}>
        {CHIPS.filter((c) => c.value === "all" || c.value === "late" || counts[c.value] > 0 || chip === c.value).map((c) => (
          <TouchableOpacity
            key={c.value}
            style={[styles.chip, chip === c.value && styles.chipOn, c.value === "late" && counts.late > 0 && chip !== "late" && styles.chipHot]}
            onPress={() => setChip(c.value)}
            accessibilityLabel={`กรอง${c.label} ${counts[c.value]}`}
          >
            <Text style={[styles.chipText, chip === c.value && styles.chipTextOn]}>
              {c.label} <Text style={styles.chipNum}>{counts[c.value]}</Text>
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : !rows ? (
        <Spinner color={colors.primary} />
      ) : shown.length === 0 ? (
        <Text style={styles.empty}>{orders.length ? "ไม่มีใบงานที่ตรงกับตัวกรอง" : "ตอนนี้ไม่มีใบงานที่เบิกอะไหล่แล้วแต่ยังไม่ปิด"}</Text>
      ) : tab === "part" ? (
        <View style={styles.grid}>
          {byPart.map((g) => (
            <View key={g.row.sparePartId} style={[styles.card, wide && styles.cardWide]} accessibilityLabel={`การ์ดอะไหล่ ${g.row.partName}`}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.cardName}>{g.row.partName}</Text>
                  <Text style={styles.partCode}>{g.row.partCode}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.cardNum}>{g.qty}</Text>
                  <Text style={styles.tileLabel}>ชิ้น · {new Set(g.list.map((x) => x.o.head.workOrderId)).size} ใบ</Text>
                </View>
              </View>
              <View style={styles.whs}>
                {[...g.wh.entries()].map(([w, n]) => (
                  <Text key={w} style={styles.wh}>
                    {w} · {n}
                  </Text>
                ))}
              </View>
              {g.list.map(({ o, r }) => (
                <View key={r.partRowId} style={styles.partRow}>
                  <OrderLink r={r} />
                  <Text style={styles.partRowText} numberOfLines={2}>
                    {o.head.statusLabel.split(" · ").slice(1).join(" · ") || o.head.statusLabel}
                    {o.head.lateDays ? <Text style={styles.lateInline}> · เลยนัด {o.head.lateDays} วัน</Text> : ` · ${visitText(o.head)}`}
                  </Text>
                  <Text style={styles.partCode}>{qtyText(r)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : wide ? (
        <View style={styles.table}>
          <View style={[styles.row, styles.headRow]}>
            {["ใบงาน · สาขา", "ขั้นตอนตอนนี้", "วันนัด · ทีม", "เบิกเมื่อ", "อะไหล่ที่ออกจากคลังแล้ว", "ยังไม่เบิก"].map((h, i) => (
              <Text key={h} style={[styles.headText, { flex: COLS[i] }]}>
                {h}
              </Text>
            ))}
          </View>
          {byStage.map(([label, list]) => (
            <View key={label}>
              <Text style={styles.group}>
                {label} <Text style={styles.groupNum}>{list.length} ใบ</Text>
              </Text>
              {list.map((o) => {
                const r = o.head;
                return (
                  <View key={r.workOrderId} style={[styles.row, !!r.lateDays && styles.rowLate]} accessibilityLabel={`แถวใบงาน ${r.code}`}>
                    <View style={[styles.cell, { flex: COLS[0] }]}>
                      <OrderLink r={r} />
                      <Text style={styles.cellText}>
                        {r.branchCode} {r.branchName}
                      </Text>
                      <Text style={styles.meta} numberOfLines={2}>
                        {[r.machineCode ? `เครื่อง ${r.machineCode}` : "ทั้งสาขา", r.symptom].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <View style={[styles.cell, { flex: COLS[1] }]}>
                      <Stage r={r} />
                    </View>
                    <View style={[styles.cell, { flex: COLS[2] }]}>
                      <Text style={styles.cellText}>{visitText(r)}</Text>
                      {r.lateDays ? <Late r={r} /> : r.confirmed ? <Text style={styles.ok}>ลูกค้าคอนเฟิร์มแล้ว</Text> : null}
                      <Text style={styles.meta}>{r.team ? `ทีม${r.team}` : "ยังไม่มีทีม"}</Text>
                    </View>
                    <View style={[styles.cell, { flex: COLS[3] }]}>
                      {o.firstAt ? <Text style={styles.cellText}>{thaiDate(bkkYmd(o.firstAt))}</Text> : null}
                      <Text style={[o.firstAt ? styles.meta : styles.cellText, (o.days ?? 0) > OLD_DAYS && styles.old]}>{daysText(o.days)}</Text>
                    </View>
                    <View style={[styles.cell, { flex: COLS[4] }]}>
                      <Parts o={o} />
                    </View>
                    <View style={[styles.cell, { flex: COLS[5] }]}>
                      <Pending o={o} />
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      ) : (
        byStage.map(([label, list]) => (
          <View key={label} style={{ gap: spacing.sm }}>
            <Text style={styles.groupNarrow}>
              {label} · {list.length} ใบ
            </Text>
            {list.map((o) => {
              const r = o.head;
              return (
                <View key={r.workOrderId} style={[styles.card, !!r.lateDays && styles.cardLate]} accessibilityLabel={`การ์ดใบงาน ${r.code}`}>
                  <View style={styles.cardTop}>
                    <OrderLink r={r} />
                    <Stage r={r} />
                  </View>
                  <Text style={styles.cardName}>
                    {r.branchCode} {r.branchName}
                  </Text>
                  <View style={styles.cardTop}>
                    <Text style={styles.meta}>
                      นัด {visitText(r)}
                      {r.confirmed && !r.lateDays ? " · คอนเฟิร์มแล้ว" : ""}
                      {r.team ? ` · ทีม${r.team}` : ""}
                    </Text>
                    <Late r={r} />
                  </View>
                  <Parts o={o} />
                  <Text style={[styles.meta, (o.days ?? 0) > OLD_DAYS && styles.old]}>เบิกมาแล้ว {daysText(o.days)}</Text>
                  {o.pending.length ? (
                    <Text style={styles.pending}>ยังไม่เบิก: {o.pending.map((x) => `${x.partName} ${qtyText(x)} (${pendingText(x)})`).join(", ")}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))
      )}
      {rows && shown.length ? (
        <Text style={styles.foot}>
          กดเลขใบงานเพื่อเปิดใบงาน · "เลยวันนัด" = วันนัดผ่านไปแล้วแต่ใบยังไม่ปิด ของอาจค้างอยู่กับช่าง · เบิกนานเกิน {OLD_DAYS} วันขึ้นสีส้ม
        </Text>
      ) : null}
    </ScrollView>
  );
}

/** สัดส่วนคอลัมน์ตาราง: ใบงาน · ขั้น · นัด · เบิกเมื่อ · อะไหล่ที่เบิก · ยังไม่เบิก */
const COLS = [1.25, 1, 0.95, 0.6, 2.1, 0.95];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  sub: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: 150, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  tileWarn: { backgroundColor: colors.rollbackSoft, borderColor: colors.rollback },
  tileLabel: { fontSize: 12, color: colors.textMuted },
  tileNum: { fontSize: 22, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
  tileHint: { fontSize: 11.5, color: colors.textMuted },
  bar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  tabs: { flexDirection: "row", gap: 4, backgroundColor: colors.card, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: colors.border },
  tab: { borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 6 },
  tabOn: { backgroundColor: colors.navyFill },
  tabText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  tabTextOn: { color: "#fff" },
  download: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.navyFill, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 },
  downloadText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  searchBox: { flexGrow: 1, flexBasis: 240, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10 },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 14, color: colors.text },
  dd: { flexBasis: 200, flexGrow: 0, minWidth: 170 },
  chip: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: colors.card },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipHot: { borderColor: colors.rollback },
  chipText: { fontSize: 13, color: colors.text },
  chipTextOn: { color: colors.primaryInk, fontWeight: "700" },
  chipNum: { color: colors.textMuted, fontVariant: ["tabular-nums"] },
  error: { color: colors.danger, fontSize: 14 },
  empty: { color: colors.textMuted, fontSize: 14, paddingVertical: spacing.lg, textAlign: "center" },
  foot: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  table: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  row: { flexDirection: "row", gap: 14, paddingHorizontal: spacing.md, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "flex-start" },
  headRow: { borderTopWidth: 0, backgroundColor: colors.rowAlt, paddingVertical: 10 },
  headText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  rowLate: { backgroundColor: colors.rollbackSoft },
  group: { paddingHorizontal: spacing.md, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.rowAlt, fontSize: 12.5, fontWeight: "700", color: colors.body },
  groupNum: { fontWeight: "600", color: colors.textMuted },
  groupNarrow: { fontSize: 13, fontWeight: "700", color: colors.body, marginTop: spacing.xs },
  cell: { minWidth: 0, gap: 3 },
  cellText: { fontSize: 13, color: colors.text, lineHeight: 19 },
  meta: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  ok: { fontSize: 11.5, fontWeight: "700", color: colors.successInk },
  late: { alignSelf: "flex-start", fontSize: 11.5, fontWeight: "700", color: colors.rollbackInk, backgroundColor: colors.rollbackSoft, borderRadius: 999, paddingHorizontal: 8, overflow: "hidden" },
  lateInline: { color: colors.rollbackInk, fontWeight: "700" },
  old: { color: colors.rollbackInk, fontWeight: "700" },
  stage: { alignSelf: "flex-start", fontSize: 11.5, fontWeight: "700", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  wo: { fontSize: 14, fontWeight: "800", color: colors.primaryInk },
  part: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: colors.card },
  partMove: { borderColor: colors.warningBorder, backgroundColor: colors.warningSoft },
  partName: { fontSize: 13, fontWeight: "700", color: colors.text },
  partCode: { fontSize: 12, fontWeight: "400", color: colors.textMuted },
  partWhere: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  pending: { fontSize: 12, color: colors.body, lineHeight: 18 },
  none: { fontSize: 13, color: colors.textFaint },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, alignItems: "flex-start" },
  card: { width: "100%", backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 6 },
  cardWide: { width: "auto", flexGrow: 1, flexBasis: 360, maxWidth: 520 },
  cardLate: { borderColor: colors.rollback },
  cardTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  cardHead: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  cardName: { fontSize: 15, fontWeight: "700", color: colors.text },
  cardNum: { fontSize: 22, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
  whs: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  wh: { fontSize: 11.5, fontWeight: "700", color: colors.body, backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, overflow: "hidden" },
  partRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 7, borderTopWidth: 1, borderTopColor: colors.border },
  partRowText: { flex: 1, minWidth: 0, fontSize: 12.5, color: colors.body },
});
