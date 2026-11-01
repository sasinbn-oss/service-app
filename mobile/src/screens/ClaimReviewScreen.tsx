/**
 * กล่องงานตรวจเคลม (เคลมก้อน 6 · ตัวอย่างที่เจ้าของงานเลือก ต.ค. 69) — Admin Spare Part / Super Admin
 *
 * เดิมผู้ตรวจหาใบรอตรวจเองจากรายการใบงานทั้งหมด ไม่รู้ว่าใบไหนรอนานสุด ไม่รู้ว่าใบไหนน่าสงสัย (เคลมซ้ำ · หมดประกัน ·
 * รหัสตัวเสียไม่ตรง) จนกว่าจะเปิดเข้าไปทีละใบ · ตรวจเสร็จต้องย้อนกลับมาหาใบถัดไปเอง
 * ตอนนี้: ใบที่รอทั้งหมดเรียงจากที่รอนานที่สุด พร้อมธงบนแถว (ข้อมูลจาก GET /part-claims/queue — กฎอยู่ฝั่งเซิร์ฟเวอร์ที่เดียว)
 *
 * จอกว้าง (≥ 1100): รายการทางซ้าย หน้าตรวจทางขวา (ClaimReview + แถบตัดสินชุดเดียวกับหน้าใบงาน) · เลือกใบแล้วรายการหดเป็นแถบ
 * "เลขใบ + รอ n วัน" ให้หน้าตรวจกว้างที่สุด และเมนูข้างหดเป็นแถบไอคอนระหว่างอยู่หน้านี้ (ไม่จำลงเครื่อง)
 * มือถือ: รายการอย่างเดียว กดแล้วไปหน้าใบงาน (โหมดตรวจเคลมเดิม) — จอแคบวางสองส่วนคู่กันไม่ได้
 *
 * หลังตีกลับ เปิดใบถัดไปให้เอง (ใบนี้ออกจากกล่องงานจนกว่าช่างส่งใหม่) · หลังอนุมัติ ค้างหน้าสรุปไว้ให้ดาวน์โหลดหลักฐานก่อน
 * คีย์ลัด (เว็บ): ← → เปลี่ยนชิ้น · J / K ใบถัดไป / ใบก่อน — ใช้ e.code เพราะแป้นภาษาไทย J คือ "่" · ไม่มีคีย์ตัดสิน
 * (กดพลาดแล้วใบปิดหรือเด้งกลับหาช่าง แก้คืนไม่ได้) · Esc เป็นของตัวดูรูปอย่างเดียว
 * ดูในฐานะ Admin Spare Part: ดูรายการและหน้าตรวจได้ ไม่มีปุ่มตัดสิน และไม่เปิดใบถัดไปให้เอง
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useIsFocused, useRoute } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { useRefreshHandler } from "../components/RefreshButton";
import { DOCK_MIN_WIDTH, useRailWhileMounted } from "../components/SideMenu";
import { isImageViewerOpen } from "../components/ImageViewer";
import { feedback, feedbackDialogOpen } from "../components/Feedback";
import ClaimReview, { type ClaimReviewOrder } from "../components/claims/ClaimReview";
import DecisionBar, { ReviewDone } from "../components/claims/DecisionBar";
import { useClaimVerdicts, type ReviewOutcome } from "../components/claims/useClaimVerdicts";
import type { Attachment } from "../components/WorkOrderAttachments";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { anyModalOpen, onPageShown, subscribeWorkOrderStale } from "../utils/liveSync";
import { fetchAttachments, prefetchLinks, seedLinks, withThumbs } from "../utils/attachmentCache";
import { canDecideClaims, refreshClaimQueueCount } from "../utils/claimQueue";
import { claimTrailOf, daysSince } from "../utils/claimEvidence";
import type { ServerFlag } from "../utils/claimFlags";
import { HomeStackParamList } from "../navigation/types";
import { colors, headingFont, radius, spacing } from "../theme";

type Props = NativeStackScreenProps<HomeStackParamList, "ClaimReview">;

interface QueueRow {
  workOrderId: number;
  code: string;
  isTest: boolean;
  branchCode: string;
  branchName: string;
  machineCode: string | null;
  machineType: string | null;
  brand: string | null;
  parts: { claimId: number; sparePartId: number | null; partCode: string; partName: string; brokenPartCode: string | null; quantity: number }[];
  techName: string | null;
  techCode: string | null;
  /** รอบสูงสุดของชิ้นที่รอตรวจ (นับทีละชิ้น — สองชิ้นถูกตีกลับรอบเดียวคือรอบ 2 ไม่ใช่ 3) */
  round: number;
  /** แถวรอตรวจล่าสุดส่งเมื่อไร — "รอ n วัน" นับจากนี้ */
  waitingSince: string;
  firstSubmittedAt: string | null;
  flags?: {
    brokenMismatch?: number;
    outOfWarranty?: boolean;
    repeat?: { partCode: string; daysAgo: number; workOrderCode: string }[];
  };
}
interface Queue {
  orders: number;
  parts: number;
  rows: QueueRow[];
}

/** ใบงานเท่าที่หน้าตรวจกับคำตัดสินใช้ — ก้อนเดียวกับ GET /work-orders/:id ที่หน้าใบงานใช้ */
type PaneOrder = ClaimReviewOrder & { status: string; claimReviewFlags?: ServerFlag[] };

/** ยี่ห้อที่คนเรียก — ทะเบียนบางเครื่องเขียน "HB - Huebsch" */
const brandOf = (b: string | null) => (b ?? "").replace(/^\s*hb\s*-\s*/i, "").trim();

/** "{ใบ} · {สาขา} · {เครื่อง} {ยี่ห้อ}" — แบบเดียวกับหัวหน้าตรวจ จะได้รู้ว่าเปิดถูกใบ */
function placeOf(r: QueueRow) {
  const brand = brandOf(r.brand);
  return `${r.code} · ${r.branchCode} ${r.branchName}${r.machineCode ? ` · ${r.machineCode}${brand ? ` ${brand}` : ""}` : ""}`;
}

/** "{n} ชิ้น: {ชื่อ} · ช่าง {ชื่อ} ({รหัส}) · รอบ {r}" — ชื่อซ้ำในใบเดียวกันต่อรหัสอะไหล่ไว้ท้าย (กติกาเดียวกับ partLabel) */
function lineOf(r: QueueRow) {
  const names = r.parts.map((p) =>
    r.parts.filter((x) => x.partName === p.partName).length > 1 ? `${p.partName} (${p.partCode})` : p.partName
  );
  const tech = r.techName ? ` · ช่าง ${r.techName}${r.techCode ? ` (${r.techCode})` : ""}` : "";
  return `${r.parts.length} ชิ้น: ${names.join(" · ")}${tech} · รอบ ${r.round}`;
}

type Chip = { text: string; tone: "bad" | "warn" | "test" };
/** ธงที่ผู้ตรวจต้องเห็นก่อนเปิด — ใบทดสอบเด่นไว้ด้วย (ห้ามส่งของใบทดสอบให้ผู้ขาย) */
function chipsOf(r: QueueRow): Chip[] {
  const out: Chip[] = [];
  const repeat = r.flags?.repeat ?? [];
  if (repeat.length) out.push({ text: `เคลมซ้ำ ${Math.min(...repeat.map((x) => x.daysAgo))} วันก่อน`, tone: "bad" });
  if (r.flags?.outOfWarranty) out.push({ text: "หมดประกัน", tone: "bad" });
  if (r.flags?.brokenMismatch) out.push({ text: `รหัสตัวเสียไม่ตรง ${r.flags.brokenMismatch} ชิ้น`, tone: "warn" });
  if (r.isTest) out.push({ text: "ใบทดสอบ", tone: "test" });
  return out;
}

const isTyping = () => {
  if (typeof document === "undefined") return false;
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export default function ClaimReviewScreen({ navigation }: Props) {
  const { user } = useAuth();
  const decide = canDecideClaims(user);
  const { width } = useWindowDimensions();
  const wide = width >= DOCK_MIN_WIDTH;
  const focused = useIsFocused();
  const shown = useShownUnderPopups(navigation);
  useRailWhileMounted(shown && wide && Platform.OS === "web");

  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * ใบล่าสุดที่อนุมัติจากกล่องงานนี้ (ตัวอย่าง: "WO-01208 อนุมัติแล้ว" + "เปิดดูใบที่ปิดแล้ว") — ใบออกจากรายการทันทีหลังอนุมัติ
   * กด "ใบถัดไป →" ไปแล้วยังต้องกลับมาดาวน์โหลดหลักฐานส่งผู้ขายได้ · จำในหน้านี้เท่านั้น (ใบเก่ากว่านั้นเปิดจากหน้าใบงาน)
   */
  const [lastDone, setLastDone] = useState<{ id: number; code: string; outcome: ReviewOutcome } | null>(null);
  // กลับมาที่หน้านี้ (ปิดหน้าใบงานที่เปิดทับ) — ใบที่เปิดอยู่อาจถูกตัดสินไปแล้วจากหน้านั้น ให้หน้าตรวจโหลดใหม่
  const [paneTick, setPaneTick] = useState(0);
  const rowsRef = useRef<QueueRow[]>([]);
  rowsRef.current = queue?.rows ?? [];

  const load = useCallback(async (): Promise<QueueRow[] | null> => {
    try {
      const res = await api.get<Queue>("/part-claims/queue");
      setQueue(res.data);
      setError(null);
      return res.data.rows;
    } catch (e) {
      setError(apiErrorMessage(e));
      return null;
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
      setPaneTick((t) => t + 1);
    }, [load])
  );
  useRefreshHandler(load);
  // เปิดแท็บค้างไว้ทั้งวัน — กลับมาที่แท็บแล้วเห็นใบที่ช่างเพิ่งส่ง โดยไม่ต้องกดรีเฟรชเอง
  useEffect(() => onPageShown(() => void load()), [load]);

  /** เปิดใบ: จอกว้างเปิดในหน้าตรวจทางขวา · มือถือไปหน้าใบงาน (โหมดตรวจเคลม) */
  const open = useCallback(
    (id: number) => {
      setNotice(null);
      if (wide) setSelected(id);
      else navigation.navigate("WorkOrderDetail", { id });
    },
    [wide, navigation]
  );

  // จอแคบลงระหว่างเปิดใบอยู่ — ไม่มีที่วางหน้าตรวจแล้ว กลับเป็นรายการ
  useEffect(() => {
    if (!wide) setSelected(null);
  }, [wide]);

  /**
   * ตัดสินเสร็จ — ป้ายเมนูกับรายการต้องลดทันที (ไม่มีการเปลี่ยนหน้าให้เมนูรู้เอง)
   * ตีกลับ: เปิดใบถัดไปให้เลยพร้อมบอกว่าตีกลับใบไหนไป (ตัวอย่าง notice) — ใบนี้ไม่ได้รอตรวจแล้ว ค้างไว้ก็ไม่มีอะไรให้ทำ
   * อนุมัติ/ปิดเคลม: ค้างหน้าสรุปไว้ — มีแผงดาวน์โหลดหลักฐานส่งผู้ขาย ผู้ตรวจกด "ใบถัดไป →" เองเมื่อพร้อม
   */
  const afterRef = useRef<number | null>(null);
  const decided = useCallback(
    async (o: ReviewOutcome, id: number) => {
      const before = rowsRef.current;
      const at = before.findIndex((r) => r.workOrderId === id);
      afterRef.current = (before[at + 1] ?? before[at - 1])?.workOrderId ?? null;
      if (o.kind === "closed" && o.approved && before[at]) setLastDone({ id, code: before[at].code, outcome: o });
      refreshClaimQueueCount();
      const rows = await load();
      if (o.kind !== "rejected" || !decide) return;
      const next = pickNext(rows ?? [], id, afterRef.current);
      setNotice(o.head);
      setSelected(next);
    },
    [load, decide]
  );

  /** "ใบถัดไป →" — ใบที่อยู่ถัดจากใบนี้ในรายการตอนตัดสิน (ยังรออยู่) ไม่งั้นใบที่รอนานที่สุด · ไม่มีแล้วกลับไปรายการ */
  const next = useCallback(() => {
    const id = pickNext(rowsRef.current, selected, afterRef.current);
    setNotice(null);
    setSelected(id);
    if (id === null) feedback.toast("info", "ไม่มีใบรอตรวจเคลมแล้ว");
  }, [selected]);

  // ── คีย์ลัด (เว็บ · จอกว้าง) — หน้าตรวจบอกวิธีเปลี่ยนชิ้นผ่าน ref นี้ ──
  const partStep = useRef<((dir: 1 | -1) => void) | null>(null);
  const live = useRef({ selected, open });
  live.current = { selected, open };
  useEffect(() => {
    if (Platform.OS !== "web" || !focused || !wide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      // พิมพ์อยู่ · ตัวดูรูปเปิดทับ · มีหน้าต่าง/กล่องยืนยัน/หน้าต่างสอนการใช้งานเปิดอยู่ — คีย์นั้นไม่ใช่ของกล่องงาน
      if (isTyping() || isImageViewerOpen() || anyModalOpen() || feedbackDialogOpen()) return;
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        if (!partStep.current) return;
        e.preventDefault();
        partStep.current(e.code === "ArrowRight" ? 1 : -1);
        return;
      }
      if (e.code !== "KeyJ" && e.code !== "KeyK") return;
      const rows = rowsRef.current;
      if (!rows.length) return;
      const at = rows.findIndex((r) => r.workOrderId === live.current.selected);
      const to = e.code === "KeyJ" ? (at < 0 ? 0 : Math.min(rows.length - 1, at + 1)) : at < 0 ? 0 : Math.max(0, at - 1);
      if (rows[to].workOrderId === live.current.selected) return;
      e.preventDefault();
      live.current.open(rows[to].workOrderId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, wide]);

  const rows = queue?.rows ?? [];
  const count = queue ? `${queue.orders} ใบ · ${queue.parts} ชิ้น · เรียงจากที่รอนานที่สุด` : "";

  const body = error ? (
    <EmptyState icon="cloud-offline-outline" title="โหลดกล่องงานตรวจเคลมไม่ได้" text={error} />
  ) : !queue ? (
    <Spinner page color={colors.primary} />
  ) : rows.length === 0 ? (
    <EmptyState icon="shield-checkmark-outline" title="ไม่มีใบรอตรวจเคลม" text="ใบงานแจ้งเคลมใหม่จะขึ้นที่นี่เมื่อช่างกดส่งเคลม" />
  ) : (
    <View style={styles.list}>
      {rows.map((r) => (
        <InboxRow key={r.workOrderId} row={r} wide={wide} onPress={() => open(r.workOrderId)} />
      ))}
    </View>
  );

  const head = (
    <View style={styles.head}>
      <Text style={[styles.title, headingFont]}>ตรวจเคลม</Text>
      {count ? <Text style={styles.count}>{count}</Text> : null}
    </View>
  );
  const viewOnly = !decide ? (
    <View style={styles.viewOnly}>
      <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
      <Text style={styles.viewOnlyText}>ดูได้อย่างเดียว แก้ไขไม่ได้</Text>
    </View>
  ) : null;
  // ใบที่อนุมัติล่าสุด — ขึ้นเมื่อไม่ได้เปิดใบนั้นอยู่ กดแล้วกลับไปหน้าสรุปพร้อมแผงดาวน์โหลด (เฉพาะจอกว้าง: มือถือตัดสินในหน้าใบงาน)
  const reopenBox =
    wide && lastDone && selected !== lastDone.id ? (
      <View style={styles.reopen} accessibilityLabel="ใบที่อนุมัติล่าสุด">
        <Text style={styles.reopenText}>{lastDone.code} อนุมัติแล้ว</Text>
        <TouchableOpacity
          onPress={() => {
            setNotice(null);
            setSelected(lastDone.id);
          }}
          style={styles.reopenBtn}
          activeOpacity={0.8}
          accessibilityLabel={`เปิดดูใบที่ปิดแล้ว ${lastDone.code}`}
        >
          <Text style={styles.reopenBtnText}>เปิดดูใบที่ปิดแล้ว</Text>
        </TouchableOpacity>
      </View>
    ) : null;
  const noticeBox = notice ? (
    <Text style={styles.notice} accessibilityRole="alert" accessibilityLabel="ผลการตีกลับ">
      {notice}
    </Text>
  ) : null;

  // ── จอกว้าง เลือกใบแล้ว: แถบรายการ + หน้าตรวจ ──
  if (wide && selected !== null) {
    return (
      <View style={styles.split}>
        <View style={styles.strip} accessibilityLabel="รายการใบรอตรวจเคลม">
          <View style={styles.stripHead}>
            <Text style={[styles.stripTitle, headingFont]}>ตรวจเคลม</Text>
            {queue ? (
              <Text style={styles.stripCount}>
                {queue.orders} ใบ · {queue.parts} ชิ้น
              </Text>
            ) : null}
            <TouchableOpacity
              onPress={() => {
                setSelected(null);
                setNotice(null);
              }}
              style={styles.stripBack}
              accessibilityLabel="กลับไปรายการเต็ม"
            >
              <Text style={styles.link}>◂ รายการเต็ม</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }}>
            {reopenBox}
            {rows.map((r) => (
              <StripRow key={r.workOrderId} row={r} on={r.workOrderId === selected} onPress={() => open(r.workOrderId)} />
            ))}
            {!rows.length && queue ? <Text style={styles.stripEmpty}>ไม่มีใบรอตรวจแล้ว</Text> : null}
          </ScrollView>
        </View>
        <ReviewPane
          key={selected}
          id={selected}
          // เปิดใบที่อนุมัติไปแล้วกลับมาดู — เริ่มที่หน้าสรุปเดิม (มีแผงดาวน์โหลด) ไม่ใช่ "ไม่ได้รอตรวจเคลมแล้ว"
          reopened={lastDone && lastDone.id === selected ? lastDone.outcome : null}
          decide={decide}
          notice={noticeBox}
          reloadTick={paneTick}
          partStep={partStep}
          onDecided={decided}
          onNext={next}
          onOpenFull={(id) => navigation.navigate("WorkOrderDetail", { id })}
          onOpenOrder={(id) => navigation.navigate("WorkOrderDetail", { id })}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.content, wide && styles.contentWide]}>
      {wide ? head : count ? <Text style={styles.count}>{count}</Text> : null}
      {viewOnly}
      {noticeBox}
      {reopenBox}
      {body}
    </ScrollView>
  );
}

/** หน้าต่างลอยของ HomeStack (POPUP ใน MainNavigator) — เปิดทับแล้วหน้านี้ยังเห็นอยู่ใต้ฉากมืด */
const POPUP_ROUTES = ["WorkOrderDetail", "WorkOrderForm"];

/**
 * หน้านี้ยังอยู่บนจอไหม — อยู่บนสุดของแท็บ หรือมีแต่หน้าต่างลอย (ใบงาน/ฟอร์ม) เปิดทับ
 * แถบไอคอนต้องค้างไว้ตอนเปิดใบงานจากกล่องงาน (เปิดใบงานเต็มใบ · ดูใบเคลมซ้ำ): ถ้าใช้ useIsFocused เมนูจะกางออก
 * ระหว่างที่หน้าต่างเด้งขึ้น พื้นที่ใต้หน้าต่างแคบลง 204 px ทั้งกล่องงานและหน้าต่างกระโดด แล้วหุบกลับตอนปิด
 * ฟังที่ระดับแท็บ (สถานะ stack ข้างใน + โฟกัสของแท็บ) แบบเดียวกับโหมดลอยของรายการใบงาน — ปิดหน้าต่างแล้วหน้านี้ไม่ได้
 * focus/blur ที่เชื่อได้ · ไปหน้าอื่นทางเมนูหรือสลับแท็บ = ไม่อยู่บนจอแล้ว ปล่อยแถบไอคอน
 */
function useShownUnderPopups(navigation: Props["navigation"]) {
  const route = useRoute();
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const tabNav = navigation.getParent();
    const sync = () => {
      const st = navigation.getState();
      const at = st.routes.findIndex((r) => r.key === route.key);
      const above = st.routes.slice(at + 1, st.index + 1);
      setShown(at >= 0 && at <= st.index && (tabNav?.isFocused() ?? true) && above.every((r) => POPUP_ROUTES.includes(r.name)));
    };
    const offs = [
      tabNav?.addListener("state", sync),
      tabNav?.addListener("focus", sync),
      tabNav?.addListener("blur", () => setShown(false)),
      navigation.addListener("focus", sync),
      navigation.addListener("state", sync),
    ];
    sync();
    return () => offs.forEach((off) => off?.());
  }, [navigation, route.key]);
  return shown;
}

/** ใบถัดไปที่จะเปิด — ใบที่อยู่ถัดไปในรายการ (ถ้ายังรออยู่) ไม่งั้นใบที่รอนานที่สุดที่ไม่ใช่ใบนี้ */
function pickNext(rows: QueueRow[], current: number | null, after: number | null): number | null {
  const left = rows.filter((r) => r.workOrderId !== current);
  return (left.find((r) => r.workOrderId === after) ?? left[0])?.workOrderId ?? null;
}

function ChipRow({ chips }: { chips: Chip[] }) {
  if (!chips.length) return null;
  return (
    <View style={styles.chips}>
      {chips.map((c) => (
        <Text key={c.text} style={[styles.chip, c.tone === "bad" ? styles.chipBad : c.tone === "warn" ? styles.chipWarn : styles.chipTest]}>
          {c.text}
        </Text>
      ))}
    </View>
  );
}

/** แถวในรายการเต็ม — จอกว้างเป็นสามช่อง (รอกี่วัน · รายละเอียด · ปุ่ม) ตามตัวอย่าง · มือถือเป็นการ์ดซ้อนบรรทัด */
function InboxRow({ row, wide, onPress }: { row: QueueRow; wide: boolean; onPress: () => void }) {
  const d = daysSince(row.waitingSince);
  const days = <Text style={[styles.days, d >= 1 && styles.daysLate]}>รอ {d} วัน</Text>;
  return (
    <TouchableOpacity
      style={[styles.row, wide && styles.rowWide]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityLabel={`ใบรอตรวจเคลม ${row.code}`}
    >
      {wide ? <View style={styles.daysCol}>{days}</View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        {wide ? null : days}
        <Text style={styles.place}>{placeOf(row)}</Text>
        <Text style={styles.line}>{lineOf(row)}</Text>
        <ChipRow chips={chipsOf(row)} />
      </View>
      {wide ? (
        <View style={styles.goBtn}>
          <Text style={styles.goText}>ตรวจเคลม</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

/** แถวในแถบรายการ (ระหว่างเปิดใบ) — เลขใบ + รอกี่วัน + ธงข้อแรก ใบที่เปิดอยู่มีแถบฟ้าซ้าย */
function StripRow({ row, on, onPress }: { row: QueueRow; on: boolean; onPress: () => void }) {
  const d = daysSince(row.waitingSince);
  const first = chipsOf(row)[0];
  return (
    <TouchableOpacity
      style={[styles.stripRow, on && styles.stripRowOn]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityLabel={`ใบรอตรวจเคลม ${row.code}`}
      // เว็บไม่แปลง accessibilityState เป็น aria-selected — ใส่เองให้โปรแกรมอ่านจอ/เทสต์รู้ว่าใบไหนเปิดอยู่
      accessibilityState={{ selected: on }}
      aria-selected={on}
    >
      <View style={styles.stripTop}>
        <Text style={styles.stripCode}>{row.code}</Text>
        <Text style={[styles.stripDays, d >= 1 && styles.daysLate]}>รอ {d} วัน</Text>
      </View>
      <Text style={styles.stripMeta} numberOfLines={1}>
        {row.branchName} · รอบ {row.round}
      </Text>
      {first ? (
        <Text style={[styles.stripFlag, first.tone === "test" ? { color: colors.body } : { color: colors.dangerInk }]} numberOfLines={1}>
          {first.text}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

/**
 * หน้าตรวจทางขวา — ใบหนึ่งใบ (key = เลขใบ เปลี่ยนใบแล้วเริ่มใหม่หมด ไม่มีคำตัดสินของใบก่อนค้างมา)
 * ใช้ ClaimReview / DecisionBar / ReviewDone ชุดเดียวกับหน้าใบงาน — ผู้ตรวจเห็นหน้าตาเดียวกันไม่ว่าเข้าทางไหน
 */
function ReviewPane({
  id,
  reopened,
  decide,
  notice,
  reloadTick,
  partStep,
  onDecided,
  onNext,
  onOpenFull,
  onOpenOrder,
}: {
  id: number;
  reopened: ReviewOutcome | null;
  decide: boolean;
  notice: React.ReactNode;
  reloadTick: number;
  partStep: React.MutableRefObject<((dir: 1 | -1) => void) | null>;
  onDecided: (o: ReviewOutcome, id: number) => void;
  onNext: () => void;
  onOpenFull: (id: number) => void;
  onOpenOrder: (id: number) => void;
}) {
  const [order, setOrder] = useState<PaneOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [filesState, setFilesState] = useState<"loading" | "ready" | "failed">("loading");
  const [detailOpen, setDetailOpen] = useState(false);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(reopened);
  const scroll = useRef<ScrollView>(null);

  const load = useCallback(async (): Promise<PaneOrder | null> => {
    try {
      const res = await api.get<PaneOrder>(`/work-orders/${id}`);
      setOrder(res.data);
      setError(null);
      return res.data;
    } catch (e) {
      setError(apiErrorMessage(e));
      return null;
    }
  }, [id]);
  const loadFiles = useCallback(async () => {
    setFilesState("loading");
    try {
      const raw = await fetchAttachments<Attachment>(id);
      const rows = withThumbs(id, raw);
      setFiles(rows);
      setFilesState("ready");
      // ลิงก์มากับรายการแล้ว — เซิร์ฟเวอร์รุ่นเก่าไม่ส่งมา ขอทุกไฟล์รวดเดียวเบื้องหลัง (วิดีโอ/รูปใหญ่เปิดได้ทันที)
      if (!seedLinks(id, raw) && rows.some((r) => r.available)) void prefetchLinks(id).catch(() => undefined);
    } catch {
      setFilesState("failed");
    }
  }, [id]);
  useEffect(() => {
    void load();
    void loadFiles();
  }, [load, loadFiles]);
  // กลับมาจากหน้าใบงานที่เปิดทับ — ยังไม่ได้ตัดสินในหน้านี้ โหลดใหม่ (อาจตัดสินไปแล้วจากหน้านั้น)
  const firstTick = useRef(reloadTick);
  useEffect(() => {
    if (reloadTick === firstTick.current || outcome) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTick]);

  /**
   * หลักฐานที่เซิร์ฟเวอร์อ้างถึงแต่ยังไม่อยู่ในรายการไฟล์ (ช่างส่งใหม่พร้อมไฟล์ใหม่หลังเราโหลดรายการ แล้วใบถูกโหลดใหม่จาก 409)
   * ขอรายการใหม่ครั้งเดียวต่อชุด — ไม่งั้นหน้าตรวจบอก "ไม่มีวิดีโอ…" ทั้งที่ช่างแนบมาแล้ว และผู้ตรวจตีกลับเพราะไฟล์ที่มีอยู่จริง
   */
  const unknown = useMemo(() => {
    if (!order) return "";
    const known = new Set(files.map((f) => f.id));
    const ids = new Set<number>();
    for (const c of order.claims) {
      for (const i of c.evidenceIds ?? []) if (!known.has(i)) ids.add(i);
      if (c.nameplate?.photoId && !known.has(c.nameplate.photoId)) ids.add(c.nameplate.photoId);
    }
    return [...ids].sort((a, b) => a - b).join(",");
  }, [order, files]);
  const askedFor = useRef("");
  useEffect(() => {
    if (filesState !== "ready" || !unknown || unknown === askedFor.current) return;
    askedFor.current = unknown;
    void loadFiles();
  }, [filesState, unknown, loadFiles]);
  const filesStatus = filesState === "ready" && unknown && unknown !== askedFor.current ? "loading" : filesState;

  // คนอื่นตัดสินใบนี้ไปก่อน (409) — ตัวจัดการกลางส่งสัญญาณมา โหลดใบใหม่พร้อมบอกเหตุผลจากเซิร์ฟเวอร์
  useEffect(
    () =>
      subscribeWorkOrderStale((wid, message) => {
        if (wid !== id) return;
        void load();
        feedback.toast("warn", `${message ?? "ข้อมูลใบงานนี้เปลี่ยนไปแล้ว"} — โหลดข้อมูลล่าสุดให้แล้ว`);
      }),
    [id, load]
  );

  const reviewing = !!order && order.status === "CLAIM_REVIEW";
  const verdicts = useClaimVerdicts(order, reviewing && decide, async (o) => {
    setOutcome(o);
    await load();
    scroll.current?.scrollTo({ y: 0, animated: true });
    feedback.toast("success", o.kind === "closed" ? `${order?.code ?? ""} ตรวจเคลมเสร็จ · ปิดงานแล้ว` : `${order?.code ?? ""} ตีกลับให้ช่างแก้แล้ว`);
    onDecided(o, id);
  });
  const reviewMode = reviewing && !outcome && verdicts.parts.some((p) => !p.locked);

  // ← → เปลี่ยนชิ้น (คีย์ลัดของกล่องงาน) — วนไม่ได้ หยุดที่ชิ้นแรก/ชิ้นสุดท้าย
  const live = useRef(verdicts);
  live.current = verdicts;
  useEffect(() => {
    partStep.current = reviewMode
      ? (dir) => {
          const v = live.current;
          const at = v.parts.findIndex((p) => p.key === v.active?.key);
          const to = v.parts[at + dir];
          if (to) v.setActive(to.key);
        }
      : null;
    return () => {
      partStep.current = null;
    };
  }, [reviewMode, partStep]);

  let content: React.ReactNode;
  // ตีกลับ: กล่องงานเปิดใบถัดไปให้เองทันที — ระหว่างนั้นขึ้นสรุปการตีกลับ ไม่ใช่ "ไม่ได้รอตรวจแล้ว" ที่ชวนงงแวบหนึ่ง
  if (outcome) {
    content = (
      <ReviewDone
        outcome={outcome}
        trail={order ? claimTrailOf(order.claims, order.logs) : []}
        onNext={onNext}
        busy={false}
        downloads={order ? { workOrderId: id, code: order.code } : null}
      />
    );
  } else if (error && !order) {
    content = <EmptyState icon="cloud-offline-outline" title="เปิดใบนี้ไม่ได้" text={error} />;
  } else if (!order) {
    content = <Spinner page color={colors.primary} />;
  } else if (reviewMode) {
    content = (
      <ClaimReview
        order={order}
        v={verdicts}
        readOnly={!decide}
        files={files}
        filesState={filesStatus}
        onRetryFiles={() => {
          askedFor.current = "";
          void loadFiles();
        }}
        detailOpen={detailOpen}
        onToggleDetail={() => setDetailOpen((o) => !o)}
        onOpenOrder={onOpenOrder}
        onOpenFull={() => onOpenFull(id)}
      />
    );
  } else {
    content = (
      <View style={{ gap: spacing.sm }}>
        <EmptyState
          icon="checkmark-done-outline"
          title={`${order.code} ไม่ได้รอตรวจเคลมแล้ว`}
          text="มีคนตรวจใบนี้ไปแล้ว หรือใบถูกตีกลับรอช่างส่งใหม่ — เลือกใบอื่นจากรายการ"
        />
        <TouchableOpacity onPress={() => onOpenFull(id)} style={styles.paneLink} accessibilityLabel={`เปิดใบงาน ${order.code} เต็มใบ`}>
          <Text style={styles.link}>เปิดใบงานเต็มใบ ▸</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.pane}>
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={styles.paneContent}>
        {notice}
        {content}
      </ScrollView>
      {/* แถบตัดสินนอกส่วนที่เลื่อน — เลื่อนไปดูหลักฐานไหนก็ยังเห็นปุ่ม (แบบเดียวกับหน้าใบงาน) */}
      {reviewMode ? <DecisionBar v={verdicts} readOnly={!decide} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60, width: "100%" },
  contentWide: { maxWidth: 1040, paddingHorizontal: 28 },
  head: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 12, rowGap: 2 },
  title: { fontSize: 22, lineHeight: 30, fontWeight: "700", color: colors.navy },
  count: { fontSize: 14, lineHeight: 20, color: colors.body },
  viewOnly: { flexDirection: "row", alignItems: "center", gap: 6 },
  reopen: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: 10,
    rowGap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  reopenText: { flexShrink: 1, fontSize: 14, lineHeight: 21, fontWeight: "700", color: colors.successInk },
  // ปุ่มขอบกรมท่าแบบตัวอย่าง (ปุ่มรอง ไม่ใช่งานหลักของหน้า) · สูง 44 กดง่ายบนจอสัมผัส
  reopenBtn: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.navy,
    backgroundColor: colors.card,
  },
  reopenBtnText: { fontSize: 14, fontWeight: "700", color: colors.navy },
  viewOnlyText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  // ฟ้าแจ้งข้อมูล ไม่ใช่แดง — ตีกลับสำเร็จแล้ว ถ้าเป็นแดงผู้ตรวจจะอ่านว่ากดแล้วพัง (สีเดียวกับสรุปหลังตีกลับในหน้าใบงาน)
  notice: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    overflow: "hidden",
  },
  list: { gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
  },
  rowWide: { gap: 16, paddingHorizontal: 16 },
  daysCol: { width: 96 },
  days: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.text },
  daysLate: { color: colors.warningInk },
  place: { fontSize: 16, lineHeight: 22, fontWeight: "700", color: colors.navy },
  line: { fontSize: 14, lineHeight: 20, color: colors.body },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { fontSize: 12, lineHeight: 18, fontWeight: "700", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 1, overflow: "hidden" },
  chipBad: { color: colors.dangerInk, backgroundColor: colors.dangerSoft },
  chipWarn: { color: colors.warningInk, backgroundColor: colors.warningSoft },
  // พื้นเทาเข้มทั้งสองโหมด — ใบทดสอบต้องเด่น (textMuted โหมดมืดเป็นเทาอ่อน ตัวขาวบนนั้นอ่านไม่ออก)
  chipTest: { color: "#fff", backgroundColor: colors.neutralFill },
  goBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: 18, borderRadius: 10, backgroundColor: colors.navyFill },
  goText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  split: { flex: 1, flexDirection: "row", backgroundColor: colors.background },
  strip: { width: 220, backgroundColor: colors.card, borderRightWidth: 1, borderRightColor: colors.border },
  stripHead: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  stripTitle: { fontSize: 16, lineHeight: 22, fontWeight: "700", color: colors.navy },
  stripCount: { fontSize: 12, lineHeight: 17, color: colors.body },
  stripBack: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  stripRow: {
    paddingVertical: 10,
    paddingRight: 14,
    paddingLeft: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: "transparent",
    gap: 2,
    minHeight: 48,
  },
  stripRowOn: { borderLeftColor: colors.primary, backgroundColor: colors.sky50 },
  stripTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 6 },
  stripCode: { fontSize: 14, fontWeight: "700", color: colors.text },
  stripDays: { fontSize: 12, fontWeight: "700", color: colors.text },
  stripMeta: { fontSize: 12, lineHeight: 17, color: colors.body },
  stripFlag: { fontSize: 12, lineHeight: 17, fontWeight: "700" },
  stripEmpty: { padding: 14, fontSize: 13, color: colors.body },
  pane: { flex: 1, minWidth: 0 },
  paneContent: { paddingHorizontal: 18, paddingVertical: 14, gap: spacing.md },
  paneLink: { alignSelf: "center", minHeight: 44, justifyContent: "center" },
  link: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
});
