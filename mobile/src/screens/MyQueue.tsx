/**
 * งานของฉันวันนี้ — แอดมิน / หัวหน้าภาค (เจ้าของงานกำหนด ต.ค. 69)
 *
 * "งานของฉัน" ของแต่ละตำแหน่งคือใบที่ค้างรอตำแหน่งนั้นทำ ไม่ใช่งานหน้าร้านแบบของช่าง
 * แอดมินเห็นใบรอเบิกอะไหล่ / เสนอราคา / คอนเฟิร์มลูกค้า ฯลฯ · หัวหน้าภาคเห็นใบรอระบุอะไหล่ / จ่ายงาน / ปล่อยงาน
 * หน้าตาจึงต่างกันไปตามงานที่ค้าง — แบ่งกลุ่มตามขั้น เรียงด่วนก่อน แล้วค้างนานก่อน
 *
 * ข้อมูลชุดเดียวกับ "กล่องงานของฉัน" (GET /work-orders?status=INBOX) ไม่มี endpoint ใหม่
 * ต่างกันที่หน้านี้จัดเป็นรายการสิ่งที่ต้องทำ มีปุ่มของขั้นนั้นบนการ์ดเลย กดแล้วเปิดใบงานพร้อมฟอร์มของขั้น
 *
 * ช่องค้นหา (เจ้าของงานขอ ต.ค. 69 ตามตัวอย่างที่ตกลง) — กรองในเครื่องทันทีที่พิมพ์ ไม่ถามเซิร์ฟเวอร์
 * เพราะหน้านี้โหลดใบที่รอทั้งหมดมาแล้ว (ไม่แบ่งหน้า) · ตัวเลขสรุปด้านบนนับจากทั้งหมดเสมอ ไม่ตามคำค้น
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { useRefreshHandler } from "../components/RefreshButton";
import { useDocked } from "../components/SideMenu";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { machineTag } from "../utils/machine";
import { thaiDate } from "../components/DateField";
import { colors, headingFont, radius, shadow, spacing } from "../theme";
import type { WorkOrderRow } from "./WorkOrderListScreen";
import {
  AdminReplyModal,
  AdminReviewBox,
  AdminReviewTag,
  SendAdminReviewModal,
  ackAdminReview,
  cancelAdminReview,
} from "../components/AdminReview";
import { ClaimHistoryCard } from "../components/ClaimHistoryEntry";
import { openClaimReview, useClaimQueueCount } from "../utils/claimQueue";
import { RESCHEDULE_STAGES, canMoveDates } from "../utils/reschedule";
import { CutoffBanners, ReleaseChip } from "../components/DispatchCutoff";
import { RELEASE_STAGES, releaseView, supervisorBanners, useServerClock, type Cutoff, type DispatchWatch } from "../utils/dispatchCutoff";

/** ค้างเกินนี้ขึ้นแดง — ตัวเลขเดียวกับชิป "ค้างขั้นเดิมเกิน 3 วัน" ในหน้ารายการ */
const STALE_DAYS = 3;

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

/** "แอดมิน · เบิกอะไหล่ (คลัง 94)" → "เบิกอะไหล่ (คลัง 94)" — ตำแหน่งรู้อยู่แล้วว่าเป็นของตัวเอง */
const stageName = (label: string) => label.split(" · ").slice(1).join(" · ") || label;
/** ขั้นโอน/เบิกคลังอื่น — ของหัวหน้าภาคเท่านั้น (myTurn ในหน้าใบงานตัดแอดมินออกเหมือนกัน) */
const SUPERVISOR_ISSUE_STAGES = ["PARTS_TRANSFER", "PARTS_IN_TRANSIT", "PARTS_PICKUP"];

type Props = {
  onOpen: (id: number, open?: "stage" | "close" | "reschedule") => void;
  /** ค้นไม่เจอในงานของตัวเอง → ค้นต่อในใบงานซ่อมทั้งหมด */
  onSearchAll?: (q: string) => void;
};

/** ข้อความที่ค้นได้ของการ์ดหนึ่งใบ — ตรงกับที่การ์ดแสดง คนค้นด้วยสิ่งที่เห็นบนการ์ด */
const haystack = (r: WorkOrderRow) =>
  [r.code, r.branchCode, r.branchName, r.title, r.symptom, r.machineCode, r.assignedTeam].filter(Boolean).join(" ").toLowerCase();

/** ไฮไลต์คำที่ค้นในข้อความ — ตัวพิมพ์เล็ก/ใหญ่ไม่ต่างกัน (c0042 = C0042) */
function Hi({ text, q, style, numberOfLines }: { text: string; q: string; style?: object | object[]; numberOfLines?: number }) {
  if (!q) return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  for (let at = lower.indexOf(q); at >= 0; at = lower.indexOf(q, at + q.length)) {
    if (at > i) parts.push(text.slice(i, at));
    parts.push(
      <Text key={at} style={styles.mark}>
        {text.slice(at, at + q.length)}
      </Text>
    );
    i = at + q.length;
  }
  parts.push(text.slice(i));
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts}
    </Text>
  );
}

/** เรียงตามวันนัดแล้วเวลา (ไม่ระบุเวลาไปท้ายวัน) — กลุ่มขั้นปล่อยงานของหัวหน้าภาคใช้ลำดับนี้ */
const byAppt = (a: WorkOrderRow, b: WorkOrderRow) =>
  (a.scheduledAt ?? "9999").slice(0, 10).localeCompare((b.scheduledAt ?? "9999").slice(0, 10)) ||
  (a.scheduledTime ?? "99:99").localeCompare(b.scheduledTime ?? "99:99") ||
  a.code.localeCompare(b.code);

/**
 * กลุ่มที่ไม่ใช่ขั้นของใบ — ส่งกลับให้แอดมินตรวจสอบ (ต.ค. 69) ปักไว้บนสุด เพราะอีกฝ่ายรอคำตอบอยู่
 * แอดมิน: คำขอที่รอตอบ (ใบอยู่ขั้นไหนก็ได้) · หัวหน้าภาค: แอดมินตอบแล้วแต่ใบเดินไปขั้นที่ไม่ใช่ของตัวเองแล้ว
 * (ใบที่ยังอยู่ขั้นของหัวหน้าภาคโชว์คำตอบบนการ์ดในกลุ่มขั้นตามปกติ)
 */
const REVIEW_GROUP = "หัวหน้าภาคส่งให้ตรวจสอบ";
const ANSWER_GROUP = "แอดมินตอบแล้ว";
type GroupKind = "stage" | "review" | "answer";

export default function MyQueue({ onOpen, onSearchAll }: Props) {
  const { user } = useAuth();
  const { docked } = useDocked();
  const [rows, setRows] = useState<WorkOrderRow[] | null>(null);
  /**
   * เวลาปิดรับปล่อยงาน (ต.ค. 69): นาฬิกาเซิร์ฟเวอร์ + เวลาปิดรับจากคำตอบรายการ · dispatch-watch = งานพรุ่งนี้ที่ยังไม่อยู่ในกล่อง
   * (ยังไม่ถึงขั้นปล่อยงาน · ปล่อยครบแล้ว) — แถบบนสุดต้องเตือนใบพวกนี้ด้วย ทั้งที่การ์ดของมันไม่อยู่ในหน้านี้
   */
  const [clock, setClock] = useState<{ serverNow?: string; cutoff?: Cutoff }>({});
  const [watch, setWatch] = useState<DispatchWatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendFor, setSendFor] = useState<WorkOrderRow | null>(null);
  const [replyFor, setReplyFor] = useState<WorkOrderRow | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<TextInput>(null);
  const seq = useRef(0);
  // แท็บที่ไม่ได้เปิดอยู่บนเว็บยังวาดค้างไว้แบบโปร่งใส (ท่าจางเข้าเวลาสลับแท็บ) — รายการรหัสใบงานที่นี่
  // ไปปนกับหน้ารายการใบงาน (เทสต์ appointment-list นับรหัสเกิน) วาดรายการเฉพาะตอนแท็บนี้เปิดอยู่
  const focused = useIsFocused();

  /**
   * แถบเวลาปิดรับของหัวหน้าภาคต้องรู้งานพรุ่งนี้ที่ยังไม่อยู่ในกล่อง (dispatch-watch) — ถามพร้อมรายการ ไม่ต่อคิว
   * แอดมิน Admin Spare Part และทีม Area ไม่ถาม: ไม่มีแถบนี้ (หัวข้อของแอดมินมากับก้อนหน้าจอแอดมิน)
   * ถามไม่ได้ก็ไม่เป็นไร — การ์ดและแถบที่คิดจากใบในกล่องยังขึ้นครบ ขาดแค่หัวข้อ "ยังไม่ถึงขั้นปล่อยงาน"
   */
  const wantWatch = user?.role === "SUPERVISOR";
  const load = useCallback(async () => {
    const n = ++seq.current;
    setError(null);
    try {
      const [res, w] = await Promise.all([
        api.get<{ rows: WorkOrderRow[]; serverNow?: string; cutoff?: Cutoff }>("/work-orders", { params: { status: "INBOX" } }),
        wantWatch ? api.get<DispatchWatch>("/work-orders/dispatch-watch").then((r) => r.data, () => null) : Promise.resolve(null),
      ]);
      if (n === seq.current) {
        setRows(res.data.rows);
        setClock({ serverNow: res.data.serverNow, cutoff: res.data.cutoff });
        setWatch(w);
      }
    } catch (e) {
      if (n === seq.current) setError(apiErrorMessage(e));
    }
  }, [wantWatch]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useRefreshHandler(async () => {
    await load();
  });

  /**
   * นาฬิกาเซิร์ฟเวอร์ของหน้านี้ — การ์ดกับแถบบนสุดใช้ "ตอนนี้" ตัวเดียวกัน จึงพลิกเป็นล็อกพร้อมกันตอนถึงเวลาปิดรับ
   * หน้าของหัวหน้าภาคไม่โหลดใหม่ตอนถึงเวลา (ข้อ 5: ตัวเลขกล่องงานหัวหน้าภาคไม่เปลี่ยน) — ป้ายคิดใหม่จากเส้นตายที่ถืออยู่แล้ว
   */
  const now = useServerClock(clock.serverNow, clock.cutoff?.time);
  // กลุ่มตามขั้น — กลุ่มที่มีใบด่วนขึ้นก่อน แล้วกลุ่มที่ค้างนานสุด · ในกลุ่มเรียงด่วน → ค้างนาน
  const isAdmin = user?.role === "ADMIN";
  const groups = useMemo(() => {
    const by = new Map<string, WorkOrderRow[]>();
    const pinned = new Map<string, { kind: GroupKind; list: WorkOrderRow[] }>();
    const pin = (label: string, kind: GroupKind, r: WorkOrderRow) =>
      pinned.set(label, { kind, list: [...(pinned.get(label)?.list ?? []), r] });
    for (const r of rows ?? []) {
      if (isAdmin && r.adminReview && !r.adminReview.answered) pin(REVIEW_GROUP, "review", r);
      else if (!isAdmin && r.adminReview?.answered && r.stageActor !== "SUPERVISOR") pin(ANSWER_GROUP, "answer", r);
      else {
        const k = stageName(r.statusLabel);
        by.set(k, [...(by.get(k) ?? []), r]);
      }
    }
    const score = (r: WorkOrderRow) => (r.priority === "URGENT" ? 1e6 : 0) + daysSince(r.stageSince);
    // คำขอตรวจสอบเรียงส่งก่อนขึ้นก่อน — ไม่ใช่ตามวันค้างขั้น (ขั้นตอนไม่ได้เปลี่ยนตอนส่ง)
    const sent = (r: WorkOrderRow) => new Date(r.adminReview?.at ?? r.stageSince).getTime();
    /**
     * กลุ่มขั้นปล่อยงานของหัวหน้าภาค (รับทราบ ปล่อยงาน · ส่งช่างตรวจ · คอนเฟิร์มวันใหม่) เรียงตามวันนัด ไม่ใช่ด่วน/ค้างนาน
     * งานพรุ่งนี้ปิดรับก่อนงานมะรืน — ใบที่เส้นตายใกล้สุดต้องอยู่บนสุด ป้าย "ด่วน" ตอนเปิดใบไม่ได้ทำให้เส้นตายเลื่อน (ข้อ 3)
     * (DEFAULT ด้านหน้าตา — ไม่เปลี่ยนว่าใบไหนอยู่กลุ่มไหน)
     */
    const releaseGroup = (list: WorkOrderRow[]) => !isAdmin && list.every((r) => RELEASE_STAGES.includes(r.status));
    return [
      ...[...pinned.entries()].map(([label, g]) => ({ label, kind: g.kind, list: g.list.sort((a, b) => sent(a) - sent(b)) })),
      ...[...by.entries()]
        .map(([label, list]) => ({
          label,
          kind: "stage" as GroupKind,
          list: releaseGroup(list) ? list.sort(byAppt) : list.sort((a, b) => score(b) - score(a)),
        }))
        .sort((a, b) => Math.max(...b.list.map(score)) - Math.max(...a.list.map(score))),
    ];
  }, [rows, isAdmin]);
  /**
   * แถบบนสุดของหัวหน้าภาค (ตัวอย่าง supGroups) — ตัวสร้างเดียวกับกล่องงาน สองหน้าจึงนับตรงกันทุกตัวอักษร
   * นับทุกใบในกล่อง ไม่ตามคำค้น: ค้นหาใบหนึ่งอยู่ไม่ได้แปลว่าใบที่ล็อกอื่นหายไป
   */
  const banners = useMemo(
    () => (user?.role === "SUPERVISOR" && rows ? supervisorBanners(rows, watch, now, clock.cutoff) : []),
    [user?.role, rows, watch, now, clock.cutoff]
  );

  // ค้นในใบที่โหลดมาแล้ว — กลุ่มที่ไม่มีใบตรงซ่อน · total = จำนวนในกลุ่มก่อนค้น (บอก "2 จาก 75")
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, total: g.list.length, list: q ? g.list.filter((r) => haystack(r).includes(q)) : g.list }))
        .filter((g) => g.list.length > 0),
    [groups, q]
  );
  const found = shown.reduce((n, g) => n + g.list.length, 0);

  // จอคอม: กด / ที่ไหนก็ได้ไปที่ช่องค้นหา (ยกเว้นกำลังพิมพ์อยู่ในช่องอื่น)
  useEffect(() => {
    if (Platform.OS !== "web" || !focused) return;
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [focused]);

  const all = rows ?? [];
  const urgent = all.filter((r) => r.priority === "URGENT").length;
  const stale = all.filter((r) => daysSince(r.stageSince) > STALE_DAYS).length;
  const out = all.filter((r) => (r.partsOut ?? 0) > 0).length;
  const roleLabel = user?.role === "ADMIN" ? "แอดมิน" : "หัวหน้าภาค";
  /**
   * Admin Spare Part (เคลมก้อน 6) — งานที่รอคือตรวจเคลม ไม่ใช่ขั้นของแอดมิน: ป้ายบอกชื่อตำแหน่งจริง ("งานที่รอแอดมินทำ" ทำให้คิดว่า
   * ต้องทำงานแอดมินด้วย) · ไม่มีตัวเลข "ด่วน" / "อะไหล่หมด" — ใบรอตรวจเคลมไม่มีงานด่วนหรืออะไหล่ค้าง ตัวเลขนั้นจึงเป็น 0 ตลอดหรือหลอกตา
   */
  const partsAdmin = !!user?.partsAdmin;

  const searchBox = (
    <View style={[styles.search, docked && styles.searchDocked, !!q && styles.searchOn]}>
      <Ionicons name="search" size={17} color={q ? colors.navy : colors.textMuted} />
      <TextInput
        ref={searchRef}
        style={styles.searchInput}
        value={query}
        onChangeText={setQuery}
        placeholder="ค้นหาเลขใบงาน สาขา เครื่อง อาการ"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="ค้นหาในงานของฉัน"
        returnKeyType="search"
      />
      {query ? (
        <TouchableOpacity style={styles.searchClear} onPress={() => setQuery("")} accessibilityLabel="ล้างคำค้น">
          <Ionicons name="close" size={16} color={colors.body} />
        </TouchableOpacity>
      ) : docked && Platform.OS === "web" ? (
        <Text style={styles.kbd}>/</Text>
      ) : null}
    </View>
  );

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      // มือถือ: ช่องค้นหาติดอยู่ใต้แถบหัว เลื่อนลงไปไกลแค่ไหนก็พิมพ์ได้ (ลูกตัวที่ 3 = แถวค้นหา)
      stickyHeaderIndices={!docked && rows && all.length ? [2] : undefined}
    >
      <View style={styles.head}>
        {/* จอแคบ: ชื่อหน้าอยู่บนแถบหัวแล้ว ไม่พิมพ์ซ้ำตัวใหญ่ */}
        {docked ? <Text style={[styles.title, headingFont]}>งานของฉันวันนี้</Text> : null}
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>{partsAdmin ? "งานที่รอ Admin Spare Part" : `งานที่รอ${roleLabel}ทำ`}</Text>
        </View>
        {docked && rows && all.length ? searchBox : null}
      </View>

      {rows ? (
        <View style={styles.stats} accessibilityLabel="ตัวเลขสรุปงานที่รอ">
          <Stat n={all.length} label="รอทำทั้งหมด" />
          {partsAdmin ? null : <Stat n={urgent} label="ด่วน" tone={urgent ? "danger" : undefined} />}
          <Stat n={stale} label={`ค้างเกิน ${STALE_DAYS} วัน`} tone={stale ? "warning" : undefined} />
          {user?.role === "ADMIN" && !partsAdmin ? <Stat n={out} label="อะไหล่หมด" tone={out ? "danger" : undefined} /> : null}
        </View>
      ) : null}

      {!docked && rows && all.length ? (
        <View style={styles.stickySearch}>
          {searchBox}
          {q ? <Text style={[styles.foundText, !found && { color: colors.dangerInk }]}>{found ? `พบ ${found} จาก ${all.length} ใบ` : `ไม่พบใน ${all.length} ใบที่รอคุณ`}</Text> : null}
        </View>
      ) : null}
      {docked && q && found ? (
        <View style={styles.result}>
          <Text style={styles.resultText}>
            แสดง <Text style={{ fontWeight: "700" }}>{found} ใบ</Text> ที่ตรงกับ <Text style={{ fontWeight: "700" }}>“{query.trim()}”</Text> จากทั้งหมด {all.length} ใบ
          </Text>
          <TouchableOpacity style={styles.resultClear} onPress={() => setQuery("")} accessibilityLabel="ล้างคำค้นหา">
            <Text style={styles.resultClearText}>ล้างคำค้น</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/*
        ลำดับใต้แถวค้นหา (integration G5 — ฟีเจอร์ที่ตามมาต้องคงลำดับนี้): 1) แถบแจ้งผลของ parts-pick (ช่องว่างไว้ ยังไม่มี)
        · 2) แถบเวลาปิดรับ · 3) การ์ด Admin Spare Part · 4) หัวข้อปักของแอดมิน · 5) กลุ่มตามขั้น
        แถบเวลาปิดรับอยู่นอกเงื่อนไข "มีใบในกล่อง": หัวหน้าภาคที่กล่องว่างแต่มีงานพรุ่งนี้ยังไม่ถึงขั้น ต้องเห็นคำเตือนเหนือ "ไม่มีงานค้าง"
        ห้ามวางก่อนแถวค้นหา — ลูกตัวที่ 3 ของหน้านี้ต้องเป็นแถวค้นหาที่ติดหัวจอ (stickyHeaderIndices)
      */}
      {rows && !error && banners.length ? <CutoffBanners groups={banners} /> : null}
      {/* Admin Spare Part ดูย้อนหลังได้จากหน้าแรกของตัวเอง (เจ้าของงานขอ ต.ค. 69) — ใบที่รอตรวจอยู่ในรายการด้านล่างแล้ว
          วางหลังแถวค้นหา: ลูกตัวที่ 3 ของหน้านี้ต้องเป็นแถวค้นหาที่ติดหัวจอ (stickyHeaderIndices)
          การ์ดกล่องงานตรวจเคลม (เคลมก้อน 6) อยู่ในช่องเดียวกัน (ห่อเป็นลูกตัวเดียว ลำดับลูกตัวถัดไปไม่ขยับ) */}
      {partsAdmin ? (
        <View style={{ gap: spacing.md }}>
          <ClaimQueueCard />
          <ClaimHistoryCard hidePending />
        </View>
      ) : null}
      {error ? (
        <EmptyState icon="cloud-offline-outline" title="โหลดงานไม่ได้" text={error} />
      ) : !rows ? (
        <Spinner page color={colors.primary} />
      ) : all.length === 0 ? (
        <EmptyState icon="checkmark-done-outline" title="ไม่มีงานค้างรอคุณ" text="ใบงานที่ถึงขั้นของคุณจะขึ้นที่นี่ทันที" />
      ) : !focused ? null : q && !found ? (
        <View style={styles.none}>
          <View style={styles.noneIcon}>
            <Ionicons name="search" size={26} color={colors.navy} />
          </View>
          <Text style={styles.noneTitle}>ไม่มี “{query.trim()}” ในงานของฉันวันนี้</Text>
          <Text style={styles.noneText}>ใบงานนั้นอาจรอคนอื่นอยู่หรือปิดไปแล้ว — ค้นในใบงานซ่อมทั้งหมดได้</Text>
          {onSearchAll ? (
            <TouchableOpacity style={styles.noneGo} onPress={() => onSearchAll(query.trim())} accessibilityLabel="ค้นในใบงานซ่อมทั้งหมด">
              <Ionicons name="clipboard-outline" size={18} color="#fff" />
              <Text style={styles.noneGoText}>ค้นในใบงานซ่อมทั้งหมด</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.noneClear} onPress={() => setQuery("")} accessibilityLabel="ล้างคำค้นหา">
            <Text style={styles.resultClearText}>ล้างคำค้น</Text>
          </TouchableOpacity>
        </View>
      ) : (
        shown.map((g) => (
          <View key={g.label} style={styles.group} accessibilityLabel={`กลุ่ม ${g.label}`}>
            <View style={styles.groupHead}>
              <Text style={[styles.groupTitle, headingFont]}>{g.label}</Text>
              <View style={styles.groupCount}>
                <Text style={styles.groupCountText}>{g.list.length}</Text>
              </View>
              {q ? <Text style={styles.groupOf}>จาก {g.total}</Text> : null}
            </View>
            {g.list.map((r) => {
              const d = daysSince(r.stageSince);
              const hot = r.priority === "URGENT";
              // ใบที่ล็อกแล้วขอบแดงหนา — มองผ่าน ๆ ก็รู้ว่าใบไหนกดปล่อยไม่ได้ ต้องขอแอดมินหรือส่งกลับ
              const rv = releaseView(r, now, clock.cutoff);
              return (
                <View key={r.id} style={[styles.card, hot && styles.cardHot, rv?.locked && styles.cardLocked]}>
                  <View style={styles.cardTop}>
                    <Hi text={r.code} q={q} style={[styles.code, headingFont]} />
                    {hot ? (
                      <View style={styles.tagHot}>
                        <Text style={styles.tagHotText}>ด่วน</Text>
                      </View>
                    ) : null}
                    {r.rolledBackFrom ? <Tag text="↩ ย้อนขั้นมา" fg={colors.rollbackInk} bg={colors.rollbackSoft} /> : null}
                    {(r.partsOut ?? 0) > 0 ? (
                      <Tag
                        text={`อะไหล่หมด ${r.partsOut}${r.partsExpectedAt ? ` · คาดเข้า ${thaiDate(r.partsExpectedAt.slice(0, 10))}` : ""}`}
                        fg={colors.dangerInk}
                        bg={colors.dangerSoft}
                      />
                    ) : (
                      <PartsTag state={r.partsState} />
                    )}
                    {r.orphan ? <Tag text="ไม่มีคนรับ" fg={colors.warningInk} bg={colors.warningSoft} /> : null}
                    {/* ใบรอปล่อยงานที่เลยนัด — ป้ายเวลาปิดรับบอก "เลยนัดมา N วัน" อยู่แล้ว ไม่ขึ้นซ้ำสองป้าย */}
                    {r.overdue && !(rv?.locked && rv.past) ? <Tag text="เลยนัด" fg={colors.dangerInk} bg={colors.dangerSoft} /> : null}
                    {/* วันถูกเลื่อน (ลูกค้าขอตอนคอนเฟิร์ม หรือแอดมินเลื่อนวันนัด ต.ค. 69) — หัวหน้าภาคต้องเช็คทีมวันใหม่ก่อนปล่อย */}
                    {r.rescheduled ? <Tag text="เลื่อนวันนัด — คอนเฟิร์มวันใหม่" fg={colors.warningInk} bg={colors.warningSoft} /> : null}
                    <AdminReviewTag review={r.adminReview} />
                    <View style={{ flex: 1 }} />
                    <Text style={[styles.wait, d > STALE_DAYS && styles.waitLate]}>{d < 1 ? "เข้าขั้นนี้วันนี้" : `ค้าง ${d} วัน`}</Text>
                  </View>
                  {/*
                    ป้ายเวลาปิดรับ (นับถอยหลัง · ล็อก · รอแอดมิน · งานด่วน) บรรทัดของตัวเอง — ข้อความยาว วางในแถวป้ายแล้วดันกันหักบรรทัด
                    หัวหน้าภาคได้ป้าย "งานพรุ่งนี้ — ต้องถึงขั้นปล่อยงานก่อน …" บนใบที่ยังไม่ถึงขั้นด้วย: รู้ตอนที่ยังตามของ/ตามแอดมินทัน
                  */}
                  <ReleaseChip row={r} now={now} cutoff={clock.cutoff} preRelease={!isAdmin} style={styles.releaseChip} />
                  <Hi text={`${r.branchCode} ${r.branchName}`} q={q} style={styles.branch} numberOfLines={1} />
                  {/* อาการก่อนชื่อใบ — ใบจากฟอร์มชื่อ "งาน CM" ทุกใบ บอกอะไรไม่ได้ (ชื่อเรื่องยังใช้กับใบไฟดับ/PM ที่ไม่มีอาการ) */}
                  <Hi
                    text={[r.symptom || r.title, r.machineCode ? `เครื่อง ${machineTag(r.machineCode, r.machineCapacityKg)}` : null, r.assignedTeam ? `ทีม ${r.assignedTeam}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                    q={q}
                    style={styles.meta}
                    numberOfLines={2}
                  />
                  {r.orphan && r.orphanReason ? <Text style={styles.note}>{r.orphanReason}</Text> : null}
                  {r.adminReview ? <AdminReviewBox review={r.adminReview} viewer={isAdmin ? "admin" : "supervisor"} /> : null}
                  <CardActions
                    row={r}
                    kind={g.kind}
                    stageLabel={g.label}
                    isAdmin={isAdmin}
                    wide={docked}
                    onOpen={onOpen}
                    onSend={() => setSendFor(r)}
                    onReply={() => setReplyFor(r)}
                    onChanged={load}
                  />
                </View>
              );
            })}
          </View>
        ))
      )}
      {sendFor ? (
        <SendAdminReviewModal
          order={sendFor}
          onClose={() => setSendFor(null)}
          onDone={async () => {
            setSendFor(null);
            await load();
          }}
        />
      ) : null}
      {replyFor?.adminReview ? (
        <AdminReplyModal
          order={replyFor}
          review={replyFor.adminReview}
          onClose={() => setReplyFor(null)}
          onDone={async () => {
            setReplyFor(null);
            await load();
          }}
        />
      ) : null}
    </ScrollView>
  );
}

/**
 * ปุ่มบนการ์ด — ปุ่มขั้นของใบอยู่ที่เดิมเสมอ ปุ่มส่งกลับให้แอดมินตรวจสอบเป็นปุ่มรอง (เจ้าของงานเลือก ต.ค. 69)
 * จอกว้างเรียงแถวเดียว · จอแคบปุ่มรองคู่กับ "รายละเอียด" แล้วปุ่มขั้นเต็มความกว้างอีกแถว (สามปุ่มแถวเดียวไม่พอที่)
 */
function CardActions({
  row: r,
  kind,
  stageLabel,
  isAdmin,
  wide,
  onOpen,
  onSend,
  onReply,
  onChanged,
}: {
  row: WorkOrderRow;
  kind: GroupKind;
  stageLabel: string;
  isAdmin: boolean;
  wide: boolean;
  onOpen: Props["onOpen"];
  onSend: () => void;
  onReply: () => void;
  onChanged: () => Promise<void>;
}) {
  const { user } = useAuth();
  const detail = (
    <TouchableOpacity style={styles.detailBtn} onPress={() => onOpen(r.id)} accessibilityLabel={`รายละเอียด ${r.code}`}>
      <Ionicons name="document-text-outline" size={16} color={colors.navy} />
      <Text style={styles.detailText}>รายละเอียด</Text>
    </TouchableOpacity>
  );
  const ack = (
    <TouchableOpacity style={[styles.sideBtn, styles.ackBtn]} onPress={() => ackAdminReview(r, onChanged)} accessibilityLabel={`รับทราบคำตอบแอดมิน ${r.code}`}>
      <Ionicons name="checkmark" size={16} color={colors.successInk} />
      <Text style={[styles.sideText, { color: colors.successInk }]}>รับทราบ</Text>
    </TouchableOpacity>
  );

  // แอดมิน: คำขอที่รอตอบ — ปุ่มหลักคือตอบกลับ (ขั้นของใบทำจากหน้ารายละเอียด)
  if (kind === "review") {
    return (
      <View style={styles.actions}>
        {detail}
        <TouchableOpacity style={[styles.goBtn, styles.replyBtn]} onPress={onReply} accessibilityLabel={`ตรวจแล้ว ตอบกลับ ${r.code}`}>
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <Text style={styles.goText}>ตรวจแล้ว · ตอบกลับ</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (kind === "answer") {
    return (
      <View style={styles.actions}>
        {detail}
        {ack}
      </View>
    );
  }

  const go = (
    <TouchableOpacity
      style={!wide && !isAdmin ? styles.goFull : styles.goBtn}
      onPress={() => onOpen(r.id, r.status === "IN_PROGRESS" ? "close" : "stage")}
      accessibilityLabel={`ทำขั้น ${stageLabel} ${r.code}`}
    >
      <Ionicons name="arrow-forward-circle" size={18} color="#fff" />
      <Text style={styles.goText} numberOfLines={1}>
        {stageLabel}
      </Text>
    </TouchableOpacity>
  );
  // แอดมินไม่มีปุ่มส่งกลับ — เป็นปุ่มของหัวหน้าภาคเท่านั้น
  // ใบเลยนัด: วันที่ร้านไม่ได้ตกลงผ่านไปแล้ว สิ่งแรกที่ต้องทำคือนัดวันใหม่ — ปุ่มลัดเปิดฟอร์มเลื่อนวันนัด (ต.ค. 69)
  // ขึ้นเฉพาะใบที่หน้าใบงานจะเปิดฟอร์มให้จริง (ขั้น + สิทธิ์เดียวกัน) — ใบนัดตรวจที่เลยนัดก็ติดป้ายเลยนัด
  // แต่เลื่อนด้วยฟอร์มนี้ไม่ได้ (แก้วันในฟอร์มนัดร้าน) และ Admin Spare Part ดูอย่างเดียว · กดแล้วไม่มีฟอร์มดูเหมือนปุ่มเสีย
  if (isAdmin) {
    /**
     * ขั้นโอน/เบิกคลังอื่นเป็นของหัวหน้าภาค แอดมินทำแทนไม่ได้ (หน้าใบงานไม่มีปุ่มให้) — ใบมาอยู่ในกล่องแอดมินเพราะเลยนัด
     * หรือไม่มีหัวหน้าภาครับ · ปุ่ม "ทำขั้น…" จะพาไปหน้าที่ไม่มีอะไรให้กด จึงบอกว่ารอใครแทน
     * สิ่งที่แอดมินทำได้คือเลื่อนวันนัด (ปุ่มข้างหน้า) แล้วตามหัวหน้าภาค
     */
    const supOnly = SUPERVISOR_ISSUE_STAGES.includes(r.status);
    return (
      <View style={styles.actions}>
        {detail}
        {r.overdue && r.scheduledAt && RESCHEDULE_STAGES.includes(r.status) && canMoveDates(user) ? (
          <TouchableOpacity style={[styles.sideBtn, styles.moveBtn]} onPress={() => onOpen(r.id, "reschedule")} accessibilityLabel={`เลื่อนวันนัด ${r.code}`}>
            <Ionicons name="calendar-outline" size={16} color={colors.navy} />
            <Text style={[styles.sideText, { color: colors.navy }]} numberOfLines={1}>
              เลื่อนวันนัด
            </Text>
          </TouchableOpacity>
        ) : null}
        {supOnly ? (
          <View style={styles.supWait} accessibilityLabel={`รอหัวหน้าภาค ${r.code}`}>
            <Text style={styles.supWaitText} numberOfLines={1}>
              รอหัวหน้าภาค{stageLabel ? ` · ${stageLabel}` : ""}
            </Text>
          </View>
        ) : (
          go
        )}
      </View>
    );
  }
  const review = r.adminReview;
  const side = review?.answered ? (
    ack
  ) : review ? (
    <TouchableOpacity style={[styles.sideBtn, styles.undoBtn]} onPress={() => cancelAdminReview(r, onChanged)} accessibilityLabel={`ยกเลิกคำขอ ${r.code}`}>
      <Ionicons name="close" size={16} color={colors.textMuted} />
      <Text style={[styles.sideText, { color: colors.textMuted }]}>ยกเลิกคำขอ</Text>
    </TouchableOpacity>
  ) : (
    <TouchableOpacity style={[styles.sideBtn, styles.adminBtn]} onPress={onSend} accessibilityLabel={`ส่งกลับให้แอดมินตรวจสอบ ${r.code}`}>
      <Ionicons name="arrow-undo" size={16} color={colors.roleAdmin} />
      <Text style={[styles.sideText, { color: colors.roleAdmin }]} numberOfLines={1}>
        ส่งกลับให้แอดมินตรวจสอบ
      </Text>
    </TouchableOpacity>
  );
  if (wide) {
    return (
      <View style={styles.actions}>
        {detail}
        {side}
        {go}
      </View>
    );
  }
  return (
    <View>
      <View style={styles.actions}>
        {detail}
        <View style={{ flex: 1 }}>{side}</View>
      </View>
      {go}
    </View>
  );
}

/**
 * การ์ดกล่องงานตรวจเคลมของ Admin Spare Part (เคลมก้อน 6) — ตัวเลขชุดเดียวกับป้ายเมนู "ตรวจเคลม" (GET /part-claims/queue-count)
 * กดแล้วไปกล่องงานที่เรียงจากที่รอนานที่สุดพร้อมธงเคลมซ้ำ/หมดประกัน — รายการใบด้านล่างหน้านี้ไม่บอกสองเรื่องนั้น
 */
function ClaimQueueCard() {
  const { user } = useAuth();
  const [count, reload] = useClaimQueueCount(user);
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );
  const text = count ? `${count.orders} ใบ · ${count.parts} ชิ้น` : "";
  return (
    <TouchableOpacity
      style={styles.queueCard}
      onPress={openClaimReview}
      activeOpacity={0.85}
      // ชื่อไม่ซ้ำกับเมนู "ตรวจเคลม" ตอนตัวเลขยังไม่มา — โปรแกรมอ่านจอ/เทสต์แยกการ์ดกับเมนูออก
      accessibilityLabel={text ? `ตรวจเคลม ${text}` : "เปิดกล่องงานตรวจเคลม"}
    >
      <Ionicons name="shield-half-outline" size={22} color={colors.primaryInk} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.queueTitle, headingFont]}>ตรวจเคลม</Text>
        {text ? <Text style={styles.queueCount}>{text}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.primaryInk} />
    </TouchableOpacity>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "danger" | "warning" }) {
  const fg = tone === "danger" ? colors.dangerInk : tone === "warning" ? colors.warningInk : colors.text;
  return (
    <View style={styles.stat}>
      <Text style={[styles.statN, headingFont, { color: fg }]}>{n}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * ป้ายอะไหล่ — คำเดียวกันทั้งกล่องงานแอดมินและหัวหน้าภาค (แบบที่เจ้าของงานตกลง ต.ค. 69)
 * ไม่ต้องเปิดใบงานก็รู้ว่าของพร้อมหรือยัง · หมดใช้ป้ายแดง "อะไหล่หมด" เดิมข้างบน
 */
const PARTS_TAG: Record<string, { text: string; fg: string; bg: string }> = {
  CHECK: { text: "รอแอดมินเช็คอะไหล่", fg: colors.textMuted, bg: colors.background },
  READY: { text: "อะไหล่ครบ · ยังไม่เบิก", fg: colors.successInk, bg: colors.successSoft },
  TRANSFER: { text: "อะไหล่ครบ · ต้องโอน", fg: colors.warningInk, bg: colors.warningSoft },
  ISSUED: { text: "เบิกแล้ว", fg: "#fff", bg: colors.navyFill },
};
function PartsTag({ state }: { state: WorkOrderRow["partsState"] }) {
  const t = state ? PARTS_TAG[state] : undefined;
  return t ? <Tag text={t.text} fg={t.fg} bg={t.bg} /> : null;
}

function Tag({ text, fg, bg }: { text: string; fg: string; bg: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color: fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, maxWidth: 820, width: "100%", alignSelf: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  title: { fontSize: 24, lineHeight: 34, fontWeight: "700", color: colors.text },
  rolePill: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 12 },
  queueCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 56,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  queueTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  queueCount: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.warningInk },
  rolePillText: { fontSize: 13, lineHeight: 24, fontWeight: "700", color: colors.primaryInk },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 46,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingLeft: 12,
    paddingRight: 6,
  },
  searchDocked: { marginLeft: "auto", width: 330, maxWidth: "100%", minHeight: 42 },
  searchOn: { borderWidth: 1.5, borderColor: colors.navy },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14.5, lineHeight: 22, color: colors.text, paddingVertical: 8 },
  searchClear: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.rowAlt, alignItems: "center", justifyContent: "center" },
  kbd: {
    fontSize: 11.5,
    fontWeight: "700",
    color: colors.textMuted,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: colors.border,
    borderRadius: 5,
    paddingHorizontal: 6,
    lineHeight: 18,
    marginRight: 4,
  },
  stickySearch: { backgroundColor: colors.background, paddingVertical: 6, gap: 4 },
  foundText: { fontSize: 12.5, fontWeight: "700", color: colors.navy, paddingLeft: 4 },
  result: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.sky50,
    borderWidth: 1,
    borderColor: colors.sky200,
    borderRadius: radius.md,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
  },
  resultText: { flexShrink: 1, fontSize: 13.5, lineHeight: 20, color: colors.navy },
  resultClear: { marginLeft: "auto", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.card },
  resultClearText: { fontSize: 13, fontWeight: "700", color: colors.navy },
  mark: { backgroundColor: colors.warningTint, color: colors.text, borderRadius: 3 },
  groupOf: { fontSize: 12.5, color: colors.textMuted },
  none: { alignItems: "center", gap: 10, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  noneIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  noneTitle: { fontSize: 17, lineHeight: 26, fontWeight: "700", color: colors.text, textAlign: "center" },
  noneText: { fontSize: 13.5, lineHeight: 21, color: colors.textMuted, textAlign: "center" },
  noneGo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    maxWidth: 380,
    width: "100%",
    marginHorizontal: "auto",
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.navyFill,
  },
  noneGoText: { color: "#fff", fontWeight: "700", fontSize: 14.5 },
  noneClear: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 18, minHeight: 44, justifyContent: "center", backgroundColor: colors.card },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stat: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  statN: { fontSize: 24, lineHeight: 32, fontWeight: "700", fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  group: { gap: spacing.sm, marginTop: spacing.sm },
  groupHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  groupTitle: { fontSize: 17, lineHeight: 26, fontWeight: "700", color: colors.navy },
  groupCount: { backgroundColor: colors.navyFill, borderRadius: 999, minWidth: 24, paddingHorizontal: 8, alignItems: "center" },
  groupCountText: { color: "#fff", fontSize: 12, lineHeight: 20, fontWeight: "700" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
    ...shadow.card,
  },
  cardHot: { borderColor: colors.dangerLine },
  cardLocked: { borderColor: colors.dangerInk, borderWidth: 2 },
  releaseChip: { marginTop: 2 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  code: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: colors.primaryInk },
  tagHot: { backgroundColor: colors.danger, borderRadius: 6, paddingHorizontal: 7 },
  tagHotText: { color: "#fff", fontSize: 12, lineHeight: 20, fontWeight: "700" },
  tag: { borderRadius: 999, paddingHorizontal: 8 },
  tagText: { fontSize: 12, lineHeight: 20, fontWeight: "700" },
  wait: { fontSize: 12, lineHeight: 20, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  waitLate: { color: colors.dangerInk, fontWeight: "700" },
  branch: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.text },
  meta: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  note: { fontSize: 12, lineHeight: 18, color: colors.warningInk },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  detailBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  detailText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.navy },
  goBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.navyFill,
  },
  goText: { color: "#fff", fontSize: 15, lineHeight: 22, fontWeight: "700", flexShrink: 1 },
  // จอแคบ: ปุ่มขั้นแถวของตัวเองใต้ปุ่มรายละเอียด/ปุ่มรอง — แยกสไตล์ ไม่ทับ flex ของ goBtn
  // (flex: 0 ทับ flex: 1 บนเว็บได้ปุ่มสูงศูนย์ มองไม่เห็นทั้งที่ยังกดได้)
  goFull: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    marginTop: spacing.sm,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.navyFill,
  },
  sideBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  sideText: { fontSize: 13.5, lineHeight: 20, fontWeight: "700", flexShrink: 1 },
  // สีแอดมิน — ปุ่มนี้ส่งลูกบอลไปที่แอดมิน
  adminBtn: { borderWidth: 1.5, borderColor: colors.roleAdminLine },
  undoBtn: { borderWidth: 1, borderColor: colors.borderStrong },
  ackBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.success },
  replyBtn: { backgroundColor: colors.roleAdmin },
  // กรอบกรมท่าแบบปุ่มรองในหน้าใบงาน ("เลื่อนวันนัด" · "แจ้งปัญหาหน้างาน")
  moveBtn: { borderWidth: 1.5, borderColor: colors.navy },
  // ไม่ใช่ปุ่ม — ขนาดเท่าปุ่มขั้นให้แถวไม่กระโดด แต่เส้นประจาง ๆ บอกว่ากดไม่ได้ ขั้นนี้รอคนอื่น
  supWait: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
  },
  supWaitText: { fontSize: 13.5, lineHeight: 20, fontWeight: "700", color: colors.textMuted, flexShrink: 1 },
});
