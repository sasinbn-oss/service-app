/**
 * ประวัติการนำเข้า (แอดมิน — เจ้าของงานอนุมัติตัวอย่าง 5 พ.ย. 69 · ตอบ "ทำตามที่แนะนำ" ทั้ง 4 ข้อ)
 *
 * ทุกไฟล์ที่นำเข้าระบบในหน้าเดียว · ใครนำเข้า · เมื่อไร · ได้ผลอะไร — รายการรอบทางซ้าย กดแล้วดูรายละเอียดทางขวา
 * (จอแคบ: รายการอยู่บน รายละเอียดอยู่ล่าง กดรอบแล้วเลื่อนลงไปให้) · กดตัวเลขด้านบนของรอบ = ดูเฉพาะแถวหมวดนั้น
 *
 * - ใบแจ้งซ่อมเก็บผลทุกแถว · ชนิดอื่นเก็บยอดสรุปกับแถวที่เปลี่ยน/มีปัญหา · ไม่เก็บไฟล์ต้นฉบับ (ดาวน์โหลดผลเป็น Excel แทน)
 * - รอบที่หยุดกลางทาง/ไม่สำเร็จขึ้นด้วย พร้อมข้อความที่คนนำเข้าเห็น — แอดมินอีกคนรู้ทันทีว่ารอบนั้นไม่มีใบไหนเข้า
 * - อะไหล่กับรายงานเครื่องอ่านจากประวัติเดิมของมัน (ย้อนหลังได้ทันที) · รายละเอียดอะไหล่เปิดรายงานอัปเดตอะไหล่ตัวเดิม
 *
 * ที่อยู่: /#/admin/imports?kind=repair&run=r12 — ชนิดที่กรองกับรอบที่เปิดอยู่ในที่อยู่ ก๊อบลิงก์ส่งให้แอดมินอีกคนได้รอบเดิม
 * ช่วงเวลา/ตัวกรองแถวไม่อยู่ในที่อยู่ (ตัวช่วยหน้าจอ — linking.ts)
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { LayoutChangeEvent, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AdminStackParamList } from "../navigation/types";
import { useRefreshHandler } from "../components/RefreshButton";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import Dropdown from "../components/Dropdown";
import { ImportReportModal, type Batch } from "../components/SparePartImportModal";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { showAlert } from "../utils/alert";
import { openUrl } from "../utils/share";
import { useAuth } from "../context/AuthContext";
import { navigationRef } from "../navigation/navigationRef";
import type { ImportGroup } from "../utils/importHistory";
import { colors, headingFont, radius, shadow, spacing } from "../theme";

type Tone = "ok" | "warn" | "bad" | "muted" | "info";
type St = "ok" | "partial" | "failed" | "running";

interface ListRun {
  id: string;
  group: ImportGroup;
  kind: string;
  kindLabel: string;
  fileName: string;
  byName: string | null;
  startedAt: string;
  status: St;
  statusLabel: string;
  short: string;
}
interface ListData {
  runs: ListRun[];
  counts: Record<string, number>;
  groups: { id: ImportGroup; label: string }[];
  more: boolean;
}
interface Tile {
  key: string;
  label: string;
  n: number;
  tone: Tone;
  rows: boolean;
}
interface Row {
  line: number | null;
  item: string;
  detail: string | null;
  result: string;
  chip: string;
  tone: Tone;
  note: string | null;
  ref: string | null;
  refId: number | null;
  refState: "open" | "trash" | "gone" | null;
}
type Other = { id: string; at: string } | null;
interface Detail {
  id: string;
  group: ImportGroup;
  kind: string;
  kindLabel: string;
  fileName: string;
  byName: string | null;
  byRole: string | null;
  startedAt: string;
  finishedAt: string | null;
  snapshotAt?: string;
  rowsInFile: number;
  brandFiles?: string[];
  status: St;
  statusLabel: string;
  banner: { tone: Tone; title: string; text: string; runAfter?: Other; runBefore?: Other } | null;
  tiles: Tile[];
  heads: string[];
  rows: Row[];
  show: string | null;
  shownTotal: number;
  rowsTotal: number;
  rowsNote: "all" | "changed" | "none";
  notes: string[];
  actions: { excel: boolean; opened: number; machinePage?: boolean; partsBatch?: string };
  notFound?: boolean;
  error?: string;
}

const ALL = "all";
/** ช่วงเวลา — ค่าเริ่ม 30 วันตามตัวอย่าง · "ทั้งหมด" ดูย้อนหลังถึงรอบแรกของอะไหล่/รายงานเครื่อง */
const PERIODS = [
  { value: "7", label: "7 วันล่าสุด" },
  { value: "30", label: "30 วันล่าสุด" },
  { value: "90", label: "90 วันล่าสุด" },
  { value: "0", label: "ทั้งหมด" },
];

function toneOf(t: Tone) {
  switch (t) {
    case "ok":
      return { fg: colors.successInk, bg: colors.successSoft };
    case "warn":
      return { fg: colors.warningInk, bg: colors.warningSoft };
    case "bad":
      return { fg: colors.dangerInk, bg: colors.dangerSoft };
    case "info":
      return { fg: colors.primaryInk, bg: colors.primarySoft };
    default:
      return { fg: colors.textMuted, bg: colors.rowAlt };
  }
}
const ST_TONE: Record<St, Tone> = { ok: "ok", partial: "warn", failed: "bad", running: "info" };

const BKK = "Asia/Bangkok";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: BKK });
const hm = (d: Date) => d.toLocaleTimeString("th-TH", { timeZone: BKK, hour: "2-digit", minute: "2-digit" });
/** "วันนี้ 13:05" · "เมื่อวาน 16:05" · "3 พ.ย. 14:40" (ปีอื่นมีปี) — แบบในตัวอย่าง */
function when(iso: string) {
  const d = new Date(iso);
  const today = dayKey(new Date());
  const k = dayKey(d);
  if (k === today) return `วันนี้ ${hm(d)}`;
  if (k === dayKey(new Date(Date.now() - 86_400_000))) return `เมื่อวาน ${hm(d)}`;
  const date = d.toLocaleDateString("th-TH", { timeZone: BKK, day: "numeric", month: "short", ...(k.slice(0, 4) === today.slice(0, 4) ? {} : { year: "2-digit" }) });
  return `${date} ${hm(d)}`;
}
const fullWhen = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { timeZone: BKK, day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
function took(a: string, b: string) {
  const s = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));
  if (s < 60) return `${s} วินาที`;
  if (s < 3600) return `${Math.floor(s / 60)} นาที${s % 60 ? ` ${s % 60} วินาที` : ""}`;
  return `${Math.floor(s / 3600)} ชม. ${Math.floor((s % 3600) / 60)} นาที`;
}
const num = (v: number) => v.toLocaleString("en-US");

/**
 * เปิดใบงานจากแถว — หน้าใบงานอยู่แท็บใบงาน สั่งผ่านตัวนำทางของทั้งแอป (แบบถังขยะใบงาน)
 * initial: false ให้ปุ่มย้อนกลับพากลับไปรายการใบงาน ไม่ใช่หลุดออกจากแท็บ
 */
function openOrder(id: number) {
  if (!navigationRef.isReady()) return;
  (navigationRef.navigate as (tab: string, p: object) => void)("WorkOrdersTab", { screen: "WorkOrderDetail", params: { id }, initial: false });
}
function openMachineImport() {
  if (!navigationRef.isReady()) return;
  (navigationRef.navigate as (tab: string, p: object) => void)("HomeTab", { screen: "MachineImport", initial: false });
}

type Props = NativeStackScreenProps<AdminStackParamList, "ImportHistory">;

export default function ImportHistoryScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  // ความกว้างจริงของเนื้อหา (เมนูข้างค้างอยู่กินที่ไป) — จอคอมแคบ ๆ ที่เมนูกางอยู่ต้องเรียงแบบมือถือ
  const [width, setWidth] = useState(windowWidth);
  const wide = width >= 860;
  const kind = (route.params?.kind as ImportGroup | undefined) ?? null;
  const [days, setDays] = useState("30");
  const [list, setList] = useState<ListData | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [show, setShow] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [report, setReport] = useState<Batch | null>(null);
  const runId = route.params?.run ?? list?.runs[0]?.id ?? null;

  const load = useCallback(() => {
    return api
      .get<ListData>("/import-history", { params: { days, ...(kind ? { kind } : {}) } })
      .then((res) => {
        setList(res.data);
        setListError(null);
      })
      .catch((e) => setListError(apiErrorMessage(e)));
  }, [days, kind]);
  // ไม่ส่ง load ให้ useFocusEffect ตรง ๆ — มันคืน promise ซึ่ง useFocusEffect จะเข้าใจว่าเป็นตัวเก็บกวาด
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  /**
   * กดรอบ/ตัวเลขรัว ๆ — คำตอบของคำขอก่อนหน้าที่มาช้ากว่าต้องไม่ทับของล่าสุด
   * (ไม่งั้นรายละเอียดเป็นของรอบที่กดไปก่อน หรือค้างหน้าโหลดเพราะ id ไม่ตรงรอบที่เลือก)
   */
  const ask = useRef(0);
  const loadDetail = useCallback(() => {
    if (!runId) {
      setDetail(null);
      return Promise.resolve();
    }
    const mine = ++ask.current;
    setLoadingDetail(true);
    return api
      .get<Detail>(`/import-history/runs/${encodeURIComponent(runId)}`, { params: show ? { show } : {} })
      .then((res) => {
        if (mine !== ask.current) return;
        setDetail(res.data);
        setDetailError(res.data.notFound ? res.data.error ?? "ไม่พบรอบนำเข้านี้" : null);
      })
      .catch((e) => mine === ask.current && setDetailError(apiErrorMessage(e)))
      .finally(() => mine === ask.current && setLoadingDetail(false));
  }, [runId, show]);
  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);
  // ปุ่มรีเฟรชบนแถบหัว — รอบที่ยัง "กำลังนำเข้า" ดูความคืบหน้าได้โดยไม่ต้องออกจากหน้า
  useRefreshHandler(() => Promise.all([load(), loadDetail()]).then(() => undefined));

  // เปลี่ยนรอบ = เริ่มดูทุกแถวใหม่ (ตัวกรองแถวเป็นของรอบนั้น)
  const lastRun = useRef(runId);
  useEffect(() => {
    if (lastRun.current === runId) return;
    lastRun.current = runId;
    setShow(null);
  }, [runId]);

  // จอแคบ: รายละเอียดอยู่ใต้รายการ — กดรอบแล้วเลื่อนลงไปให้ ไม่งั้นกดแล้วเหมือนไม่มีอะไรเกิด
  const outer = useRef<ScrollView>(null);
  const detailY = useRef(0);
  const pendingScroll = useRef(false);
  function pick(id: string) {
    navigation.setParams({ run: id });
    if (!wide) pendingScroll.current = true;
  }
  useEffect(() => {
    if (!pendingScroll.current || !detail || detail.id !== runId) return;
    pendingScroll.current = false;
    outer.current?.scrollTo({ y: Math.max(0, detailY.current - 8), animated: true });
  }, [detail, runId]);
  function pickKind(next: ImportGroup | null) {
    navigation.setParams({ kind: next ?? undefined, run: undefined });
  }
  function pickTile(t: Tile) {
    if (!t.rows && show !== t.key) return;
    setShow((cur) => (cur === t.key ? null : t.key));
  }

  async function download(d: Detail) {
    try {
      const res = await api.get<{ filename: string; path: string }>(`/import-history/runs/${d.id}/excel`);
      const url = resolveImageUrl(res.data.path);
      if (url) await openUrl(url);
    } catch (e) {
      showAlert("ดาวน์โหลดไม่สำเร็จ", apiErrorMessage(e));
    }
  }
  async function openPartsReport(batchId: string) {
    try {
      setReport((await api.get<Batch>(`/spare-parts/imports/batch/${encodeURIComponent(batchId)}`)).data);
    } catch (e) {
      showAlert("เปิดรายงานไม่ได้", apiErrorMessage(e));
    }
  }

  // เมนูซ่อนไว้แล้ว แต่ลิงก์ตรงยังพามาได้ — บอกตรง ๆ ดีกว่าหน้าที่โหลดไม่ขึ้น (เซิร์ฟเวอร์ตอบ 403 อยู่แล้ว)
  if (user?.role !== "ADMIN") {
    return (
      <View style={styles.center}>
        <EmptyState icon="lock-closed-outline" title="ประวัติการนำเข้าสำหรับแอดมินเท่านั้น" text="คนที่นำเข้าไฟล์ได้เท่านั้นที่ดูประวัติได้" />
      </View>
    );
  }

  const head = (
    <View style={styles.headBlock}>
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
          <Text style={[styles.title, headingFont]}>ประวัติการนำเข้า</Text>
          <Text style={styles.sub}>ทุกไฟล์ที่นำเข้าระบบ · ใครนำเข้า · เมื่อไร · ได้ผลอะไร</Text>
        </View>
        <View style={{ width: 190 }}>
          <Dropdown value={days} options={PERIODS} onChange={(v) => v && setDays(v)} accessibilityLabel="ช่วงเวลา" />
        </View>
      </View>
      <View style={styles.chips}>
        {[{ id: null as ImportGroup | null, label: "ทั้งหมด" }, ...(list?.groups ?? [])].map((g) => {
          const on = (kind ?? null) === g.id;
          const n = list?.counts[g.id ?? ALL];
          return (
            <TouchableOpacity
              key={g.id ?? ALL}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => pickKind(g.id)}
              accessibilityLabel={`ชนิด ${g.label}`}
              // เว็บไม่แปลง accessibilityState เป็น aria-selected (CLAUDE.md) — ใส่เอง เทสต์/โปรแกรมอ่านจอรู้ว่าชิปไหนติดอยู่
              accessibilityState={{ selected: on }}
              aria-selected={on}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {g.label}
                {n !== undefined ? ` (${num(n)})` : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const runsList = (
    <View style={{ gap: spacing.sm }}>
      {!list ? (
        listError ? (
          <EmptyState icon="cloud-offline-outline" title="โหลดประวัติไม่ได้" text={listError} />
        ) : (
          <Spinner color={colors.primary} />
        )
      ) : list.runs.length === 0 ? (
        <EmptyState
          icon="file-tray-outline"
          title="ยังไม่มีการนำเข้าในช่วงนี้"
          text={days === "0" ? "ยังไม่มีไฟล์ที่นำเข้าในชนิดนี้" : "เลือกช่วงเวลา “ทั้งหมด” เพื่อดูย้อนหลัง"}
        />
      ) : (
        list.runs.map((r) => {
          const on = r.id === runId;
          const st = toneOf(ST_TONE[r.status]);
          const tag = toneOf("info");
          return (
            <TouchableOpacity
              key={r.id}
              style={[styles.run, on && styles.runOn]}
              onPress={() => pick(r.id)}
              accessibilityLabel={`รอบนำเข้า ${r.fileName} ${r.statusLabel}`}
              accessibilityState={{ selected: on }}
              aria-selected={on}
            >
              <View style={styles.runTop}>
                <Text style={styles.runWhen}>{when(r.startedAt)}</Text>
                <View style={[styles.pill, { backgroundColor: tag.bg }]}>
                  <Text style={[styles.pillText, { color: tag.fg }]}>{list.groups.find((g) => g.id === r.group)?.label ?? r.kindLabel}</Text>
                </View>
                <View style={{ flex: 1 }} />
                <View style={[styles.pill, { backgroundColor: st.bg }]}>
                  <Text style={[styles.pillText, { color: st.fg }]}>{r.statusLabel}</Text>
                </View>
              </View>
              <Text style={styles.runFile} numberOfLines={1}>
                {r.fileName}
              </Text>
              <Text style={styles.runWho}>
                {r.byName ?? "ไม่ทราบชื่อ"} · <Text style={{ fontWeight: "700" }}>{r.short}</Text>
              </Text>
            </TouchableOpacity>
          );
        })
      )}
      {list?.more ? <Text style={styles.muted}>แสดง 200 รอบล่าสุด — เลือกชนิดหรือช่วงเวลาให้แคบลงเพื่อดูรอบที่เก่ากว่า</Text> : null}
      <Text style={styles.muted}>
        อะไหล่กับรายงานเครื่องมีประวัติเก็บอยู่แล้ว ขึ้นย้อนหลังให้ทันที · ใบแจ้งซ่อม สาขา รถ รายชื่อ เริ่มเก็บตั้งแต่วันที่หน้านี้ขึ้นระบบ
      </Text>
    </View>
  );

  const detailPane = (
    <View style={[styles.card, !wide && { marginTop: spacing.sm }]}>
      {!runId ? (
        <EmptyState icon="time-outline" title="เลือกรอบทางซ้ายเพื่อดูรายละเอียด" text="ผลของแต่ละรอบ · แถวที่เปิด/ข้าม/นำเข้าไม่ได้" />
      ) : detailError && (!detail || detail.id !== runId || detail.notFound) ? (
        <EmptyState icon="alert-circle-outline" title="เปิดรอบนี้ไม่ได้" text={detailError} />
      ) : !detail || detail.id !== runId ? (
        <Spinner color={colors.primary} />
      ) : (
        <DetailView
          d={detail}
          wide={wide}
          show={show}
          busy={loadingDetail}
          canTrash={!user.partsAdmin}
          onTile={pickTile}
          onShowAll={() => setShow(null)}
          onShowOpened={() => setShow((cur) => (cur === "NEW" ? null : "NEW"))}
          onRun={(id) => navigation.setParams({ run: id })}
          onExcel={() => download(detail)}
          onParts={openPartsReport}
        />
      )}
    </View>
  );

  return (
    <View style={styles.container} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {wide ? (
        <View style={styles.wideWrap}>
          {head}
          <View style={styles.body}>
            <ScrollView style={styles.listCol} contentContainerStyle={{ paddingBottom: 24 }}>
              {runsList}
            </ScrollView>
            <ScrollView style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ paddingBottom: 32 }}>
              {detailPane}
            </ScrollView>
          </View>
        </View>
      ) : (
        <ScrollView ref={outer} contentContainerStyle={styles.narrow}>
          {head}
          {runsList}
          <View onLayout={(e) => (detailY.current = e.nativeEvent.layout.y)}>{detailPane}</View>
        </ScrollView>
      )}
      {report ? <ImportReportModal batch={report} onClose={() => setReport(null)} /> : null}
    </View>
  );
}

function DetailView({
  d,
  wide,
  show,
  busy,
  canTrash,
  onTile,
  onShowAll,
  onShowOpened,
  onRun,
  onExcel,
  onParts,
}: {
  d: Detail;
  wide: boolean;
  show: string | null;
  busy: boolean;
  canTrash: boolean;
  onTile: (t: Tile) => void;
  onShowAll: () => void;
  onShowOpened: () => void;
  onRun: (id: string) => void;
  onExcel: () => void;
  onParts: (batchId: string) => void;
}) {
  const st = toneOf(ST_TONE[d.status]);
  const tag = toneOf("info");
  const repair = d.kind === "REPAIR_FORM";
  const meta = [
    `นำเข้าโดย ${d.byName ?? "ไม่ทราบชื่อ"}${d.byRole ? ` (${d.byRole})` : ""}`,
    fullWhen(d.startedAt),
    d.finishedAt && d.status !== "running" && repair ? `ใช้เวลา ${took(d.startedAt, d.finishedAt)}` : null,
    d.snapshotAt ? `snapshot ${hm(new Date(d.snapshotAt))}` : null,
    d.brandFiles?.length ? `ไฟล์ยี่ห้อ ${d.brandFiles.join(", ")}` : null,
    d.group === "branch" || d.group === "users" ? d.kindLabel : null,
    d.rowsInFile ? `${num(d.rowsInFile)} แถวในไฟล์` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const shownTile = show ? d.tiles.find((t) => t.key === show) : null;
  const cols = wide ? Math.min(Math.max(d.tiles.length, 1), 6) : Math.min(d.tiles.length, 2);
  const banner = d.banner ? toneOf(d.banner.tone) : null;
  const other = d.banner?.runAfter ?? d.banner?.runBefore ?? null;
  return (
    <View style={{ gap: 14, opacity: busy ? 0.75 : 1 }}>
      <View style={{ gap: 4 }}>
        <View style={styles.runTop}>
          <View style={[styles.pillLg, { backgroundColor: tag.bg }]}>
            <Text style={[styles.pillLgText, { color: tag.fg }]}>{d.kindLabel}</Text>
          </View>
          <View style={[styles.pillLg, { backgroundColor: st.bg }]} accessibilityLabel={`สถานะรอบ ${d.statusLabel}`}>
            <Text style={[styles.pillLgText, { color: st.fg }]}>{d.statusLabel}</Text>
          </View>
        </View>
        <Text style={[styles.file, headingFont]} selectable>
          {d.fileName}
        </Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>

      {d.banner && banner ? (
        <View style={[styles.banner, { backgroundColor: banner.bg, borderColor: banner.fg }]} accessibilityLabel={`แถบ ${d.banner.title}`}>
          <Text style={[styles.bannerTitle, { color: banner.fg }]}>{d.banner.title}</Text>
          <Text style={[styles.bannerText, { color: banner.fg }]}>{d.banner.text}</Text>
          {other ? (
            <TouchableOpacity onPress={() => onRun(other.id)} accessibilityLabel="ดูรอบอื่นของไฟล์นี้">
              <Text style={[styles.link, { color: banner.fg }]}>
                {d.banner.runAfter ? `มีรอบหลังจากนี้ของไฟล์เดียวกันแล้ว (${when(other.at)}) — ดูรอบนั้น ›` : `ดูรอบก่อนหน้า (${when(other.at)}) ›`}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {d.tiles.length ? (
        <View style={styles.tiles}>
          {d.tiles.map((t) => {
            const on = show === t.key;
            const tone = toneOf(t.tone);
            const zero = t.n === 0;
            return (
              <TouchableOpacity
                key={t.key}
                style={[
                  styles.tile,
                  { flexBasis: `${Math.floor(100 / cols) - 2}%` as `${number}%` },
                  { backgroundColor: zero && !on ? colors.card : tone.bg, borderColor: on ? tone.fg : colors.border },
                  on && styles.tileOn,
                ]}
                onPress={() => onTile(t)}
                disabled={!t.rows && !on}
                accessibilityLabel={`ดูเฉพาะ ${t.label}`}
                accessibilityState={{ selected: on }}
                aria-selected={on}
              >
                <Text style={[styles.tileN, { color: zero ? colors.textFaint : tone.fg }]}>{num(t.n)}</Text>
                <Text style={[styles.tileLabel, zero && { color: colors.textFaint }]}>{t.label}</Text>
                {on ? <Ionicons name="funnel" size={13} color={tone.fg} style={styles.tileIcon} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {d.rowsTotal > 0 ? (
        <View style={{ gap: 6 }}>
          <View style={styles.table}>
            {wide ? (
              <View style={[styles.tr, styles.th]}>
                {d.heads.map((h, i) => (
                  <Text key={h} style={[styles.thText, COLS[i]]}>
                    {h}
                  </Text>
                ))}
              </View>
            ) : null}
            {d.rows.length === 0 ? <Text style={styles.empty}>ไม่มีแถวในหมวดนี้</Text> : null}
            {d.rows.map((r, i) => (
              <RowView key={`${r.line}-${i}`} r={r} repair={repair} wide={wide} canTrash={canTrash} />
            ))}
          </View>
          <View style={styles.rowNoteBar}>
            <Text style={[styles.muted, { flex: 1 }]}>
              {shownTile
                ? `กรอง: ${shownTile.label} · แสดง ${num(d.rows.length)} จาก ${num(d.shownTotal)} แถว · กดตัวเลขเดิมอีกครั้งเพื่อเลิกกรอง`
                : d.rowsNote === "all"
                  ? `แสดง ${num(d.rows.length)} จาก ${num(d.rowsTotal)} แถว · กดตัวเลขด้านบนเพื่อกรอง${d.actions.excel ? " · ดูครบทุกแถวในไฟล์ Excel" : ""}`
                  : `แสดงเฉพาะแถวที่เปลี่ยนหรือมีปัญหา${d.rows.length < d.rowsTotal ? ` (${num(d.rows.length)} จาก ${num(d.rowsTotal)} แถว)` : ""} · กดตัวเลขด้านบนเพื่อกรอง`}
            </Text>
            {show ? (
              <TouchableOpacity onPress={onShowAll} accessibilityLabel="ดูทุกแถว">
                <Text style={styles.link}>ดูทุกแถว</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {d.notes.map((n) => (
        <View key={n} style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.noteText, { flex: 1 }]}>{n}</Text>
        </View>
      ))}

      <View style={styles.actions}>
        {repair && d.actions.opened > 0 ? (
          <TouchableOpacity style={styles.btnPrimary} onPress={onShowOpened} accessibilityLabel="ดูใบงานที่เปิดจากรอบนี้">
            <Text style={styles.btnPrimaryText}>{show === "NEW" ? "ดูทุกแถวของรอบนี้" : `ดูใบงานที่เปิดจากรอบนี้ (${num(d.actions.opened)})`}</Text>
          </TouchableOpacity>
        ) : null}
        {d.actions.partsBatch ? (
          <TouchableOpacity style={styles.btnPrimary} onPress={() => onParts(d.actions.partsBatch!)} accessibilityLabel="เปิดรายงานอัปเดตอะไหล่">
            <Text style={styles.btnPrimaryText}>เปิดรายงานอัปเดตอะไหล่ (มีอยู่แล้ว)</Text>
          </TouchableOpacity>
        ) : null}
        {d.actions.excel ? (
          <TouchableOpacity style={styles.btnSecond} onPress={onExcel} accessibilityLabel="ดาวน์โหลดผลทีละแถว (Excel)">
            <Ionicons name="download-outline" size={16} color={colors.navy} />
            <Text style={styles.btnSecondText}>ดาวน์โหลดผลทีละแถว (Excel)</Text>
          </TouchableOpacity>
        ) : null}
        {d.actions.machinePage && Platform.OS === "web" ? (
          <TouchableOpacity style={styles.btnSecond} onPress={openMachineImport} accessibilityLabel="เปิดหน้าอัปโหลดรายงานเครื่อง">
            <Text style={styles.btnSecondText}>เปิดหน้าอัปโหลดรายงานเครื่อง</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

/** คอลัมน์ตาราง (จอกว้าง) — สัดส่วนเดียวกับตัวอย่าง: แถว · รายการ · รายละเอียด · ผล · ใบงาน/หมายเหตุ */
const COLS = [{ width: 52 }, { flex: 2.2, minWidth: 0 }, { flex: 1.6, minWidth: 0 }, { flex: 1.4, minWidth: 0 }, { flex: 1.2, minWidth: 0 }];

function RowView({ r, repair, wide, canTrash }: { r: Row; repair: boolean; wide: boolean; canTrash: boolean }) {
  const tone = toneOf(r.tone);
  const chip = (
    <View style={[styles.pill, { backgroundColor: tone.bg, alignSelf: "flex-start" }]}>
      <Text style={[styles.pillText, { color: tone.fg }]}>{r.chip}</Text>
    </View>
  );
  // ใบงานในแถว: เปิดได้ = ลิงก์ · อยู่ในถังขยะ = บอกว่าอยู่ในถัง (แทนลิงก์ที่กดแล้วเจอหน้าถังขยะ) · ลบจริงแล้ว = บอกว่าลบแล้ว
  const prefix = r.result === "OPEN" ? "ใบค้าง " : "";
  const ref = r.ref ? (
    r.refState === "open" && r.refId ? (
      <TouchableOpacity onPress={() => openOrder(r.refId!)} accessibilityLabel={`เปิดใบงาน ${r.ref}`}>
        <Text style={styles.refLink}>
          {prefix}
          {r.ref}
        </Text>
      </TouchableOpacity>
    ) : r.refState === "trash" ? (
      canTrash ? (
        <TouchableOpacity
          onPress={() =>
            navigationRef.isReady() &&
            (navigationRef.navigate as (tab: string, p: object) => void)("AdminTab", { screen: "WorkOrderTrash", params: { q: r.ref }, initial: false })
          }
          accessibilityLabel={`${r.ref} อยู่ในถังขยะ`}
        >
          <Text style={styles.refTrash}>
            {prefix}
            {r.ref} · อยู่ในถังขยะ
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.refTrash}>
          {prefix}
          {r.ref} · อยู่ในถังขยะ
        </Text>
      )
    ) : (
      <Text style={styles.refGone}>
        {prefix}
        {r.ref} · ลบแล้ว
      </Text>
    )
  ) : null;
  // เหตุผลที่บอกซ้ำรหัสใบงาน ("นำเข้าไปแล้ว (WO-…)" · "มีใบค้าง (WO-…)") ไม่ต้องพิมพ์ซ้ำใต้ลิงก์
  const note = r.note && !(r.ref && /^(นำเข้าไปแล้ว \(WO-\d+\)|เครื่องนี้มีใบงานค้างอยู่แล้ว \(WO-\d+\))$/.test(r.note)) ? r.note : null;
  const last = repair ? (
    <View style={{ gap: 2 }}>
      {ref}
      {note ? <Text style={styles.cellMuted}>{note}</Text> : !ref ? <Text style={styles.cellMuted}>—</Text> : null}
    </View>
  ) : (
    <View style={{ gap: 2 }}>
      {ref}
      <Text style={styles.cellMuted}>{note ?? ""}</Text>
    </View>
  );
  if (wide) {
    return (
      <View style={styles.tr} accessibilityLabel={r.line ? `แถว ${r.line} ${r.chip}` : `รายการ ${r.item} ${r.chip}`}>
        <Text style={[styles.cellMuted, COLS[0]]}>{r.line ?? "—"}</Text>
        <Text style={[styles.cellStrong, COLS[1]]}>{r.item}</Text>
        <Text style={[styles.cell, COLS[2]]}>{r.detail ?? ""}</Text>
        <View style={COLS[3]}>{chip}</View>
        <View style={COLS[4]}>{last}</View>
      </View>
    );
  }
  return (
    <View style={[styles.tr, styles.trNarrow]} accessibilityLabel={r.line ? `แถว ${r.line} ${r.chip}` : `รายการ ${r.item} ${r.chip}`}>
      <View style={styles.runTop}>
        {r.line ? <Text style={styles.cellMuted}>แถว {r.line}</Text> : null}
        {chip}
      </View>
      <Text style={styles.cellStrong}>{r.item}</Text>
      {r.detail ? <Text style={styles.cell}>{r.detail}</Text> : null}
      {last}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: spacing.lg },
  wideWrap: { flex: 1, padding: spacing.lg, paddingBottom: 0, gap: spacing.md, maxWidth: 1400, width: "100%", alignSelf: "center" },
  narrow: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  headBlock: { gap: spacing.md, zIndex: 5 },
  head: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md, flexWrap: "wrap", zIndex: 5 },
  title: { fontSize: 24, lineHeight: 34, fontWeight: "700", color: colors.navy },
  sub: { fontSize: 13.5, lineHeight: 21, color: colors.textMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.navyFill, borderColor: colors.navyFill },
  chipText: { fontSize: 13.5, color: colors.body },
  chipTextOn: { color: "#fff", fontWeight: "700" },
  body: { flex: 1, flexDirection: "row", gap: 16, minHeight: 0 },
  listCol: { width: 430, flexGrow: 0, flexShrink: 0 },
  run: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 5,
  },
  runOn: { borderWidth: 2, borderColor: colors.navy, ...shadow.card },
  runTop: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  runWhen: { fontSize: 12.5, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  runFile: { fontSize: 14.5, fontWeight: "600", color: colors.text },
  runWho: { fontSize: 12.5, lineHeight: 18, color: colors.body },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 1 },
  pillText: { fontSize: 11.5, fontWeight: "700" },
  pillLg: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  pillLgText: { fontSize: 12.5, fontWeight: "700" },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 18,
    ...shadow.card,
  },
  file: { fontSize: 20, lineHeight: 28, fontWeight: "700", color: colors.text },
  meta: { fontSize: 13.5, lineHeight: 21, color: colors.body },
  banner: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 3 },
  bannerTitle: { fontSize: 14.5, fontWeight: "700" },
  bannerText: { fontSize: 13.5, lineHeight: 21 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { flexGrow: 1, minWidth: 120, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  tileOn: { borderWidth: 2 },
  tileN: { fontSize: 22, lineHeight: 28, fontWeight: "700", fontVariant: ["tabular-nums"] },
  tileLabel: { fontSize: 12.5, lineHeight: 17, color: colors.body },
  tileIcon: { position: "absolute", top: 8, right: 8 },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  trNarrow: { flexDirection: "column", alignItems: "stretch", gap: 4 },
  th: { backgroundColor: colors.rowAlt, borderTopWidth: 0, paddingVertical: 8 },
  thText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  cell: { fontSize: 13, lineHeight: 19, color: colors.body },
  cellStrong: { fontSize: 13, lineHeight: 19, fontWeight: "600", color: colors.text },
  cellMuted: { fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  refLink: { fontSize: 12.5, fontWeight: "700", color: colors.primaryInk, textDecorationLine: "underline", fontVariant: ["tabular-nums"] },
  refTrash: { fontSize: 12.5, fontWeight: "700", color: colors.warningInk },
  refGone: { fontSize: 12.5, color: colors.textMuted },
  empty: { padding: 20, textAlign: "center", fontSize: 13, color: colors.textMuted },
  rowNoteBar: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  muted: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
  link: { fontSize: 13, fontWeight: "700", color: colors.navy, textDecorationLine: "underline" },
  note: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noteText: { fontSize: 13, lineHeight: 20, color: colors.body },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  btnPrimary: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.navyFill,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { color: "#fff", fontSize: 13.5, fontWeight: "700" },
  btnSecond: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  btnSecondText: { color: colors.navy, fontSize: 13.5, fontWeight: "600" },
});
