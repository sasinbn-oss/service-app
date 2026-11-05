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
import { BackHandler, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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
import { CutoffBanners, ScheduleChip, UrgentAnswerModal, UrgentReleaseModal } from "../components/DispatchCutoff";
import { dayTime } from "../components/claims/ClaimTrail";
import { takeFlash, type QueueFlash } from "../utils/flash";
import { howtoTarget, useHowToAction, useHowToContext } from "../utils/howto";
import { PAY_GO_LABEL, PayFollowLine, payDaysText } from "../components/PaymentWait";
import { PaymentRow, QUEUE_COL, type PayRow } from "../components/PaymentRow";
import { TOPIC_STAGES, apptRel, buildTopics, type ChipTone, type RowKind, type Topic, type TopicId } from "../utils/adminTopics";
import {
  PAST_GROUP_HINT,
  RELEASE_STAGES,
  addDays,
  adminGroups,
  askRowLines,
  dayFull,
  serverDay,
  supervisorBanners,
  timeText,
  useServerClock,
  useServerNowFn,
  type AdminCutoffGroups,
  type Cutoff,
} from "../utils/dispatchCutoff";

/** ค้างเกินนี้ขึ้นแดง — ตัวเลขเดียวกับชิป "ค้างขั้นเดิมเกิน 3 วัน" ในหน้ารายการ */
const STALE_DAYS = 3;

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
/**
 * วันที่ค้างของการ์ด — ใบรอลูกค้าจ่ายเงินใช้ตัวเลขของเซิร์ฟเวอร์ (payWait.days · เจ้าของงานเลือก 5 พ.ย. 69)
 * การ์ด ตัวเลข "ค้างเกิน 3 วัน" ด้านบน และลำดับในกลุ่มจะได้พูดตัวเลขเดียวกับป้าย "รอมาแล้ว N วัน" บนหน้าใบงาน
 */
const rowDays = (r: WorkOrderRow) => (r.payWait ? r.payWait.days : daysSince(r.stageSince));

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
/**
 * หัวข้อปักของแอดมินจากเวลาปิดนัดงานพรุ่งนี้ (ตัวอย่าง appt-cutoff) — ใบที่ผูกกับวันที่วันนี้/พรุ่งนี้/ผ่านไปแล้ว
 * "ขอนัดด่วน" = ใบรอนัดวันที่หัวหน้าภาคขอวันที่ปิดแล้วไว้ (แทน "เลยเวลาปล่อยงาน" — ขั้นปล่อยงานไม่ล็อกแล้ว)
 * · "เลยนัด" = แถวเดียวกับหัวข้อ "เลยนัด" ของกล่องงาน
 * ขึ้นก่อน "หัวหน้าภาคส่งให้ตรวจสอบ": คำขอตรวจสอบรอได้ ร้านที่รอวันนี้/พรุ่งนี้รอไม่ได้ — ใบที่มีคำขอตรวจสอบค้างด้วยยังมีปุ่มตอบกลับบนการ์ด
 */
const ASK_GROUP = "ขอนัดด่วน";
const PAST_GROUP = "เลยนัด";
type GroupKind = "stage" | "review" | "answer" | "ask" | "past";
/** ลำดับหัวข้อปัก — ขอนัดด่วน → เลยนัด → คำขอตรวจสอบ → คำตอบแอดมิน */
const PIN_RANK: Record<GroupKind, number> = { ask: 0, past: 1, review: 2, answer: 3, stage: 9 };

export default function MyQueue({ onOpen, onSearchAll }: Props) {
  const { user } = useAuth();
  const { docked } = useDocked();
  const [rows, setRows] = useState<WorkOrderRow[] | null>(null);
  /**
   * เวลาปิดนัดงานพรุ่งนี้: นาฬิกาเซิร์ฟเวอร์ + เวลาปิดจากคำตอบรายการ — ป้ายบนการ์ดรอนัดวันกับหัวข้อ "รอนัดวัน" คิดจากค่านี้
   * ไม่ต้องถามรายการอื่นเพิ่ม: กฎอยู่ที่การนัดวัน ใบที่โดนคือใบรอนัดวันซึ่งอยู่ในกล่องนี้อยู่แล้ว
   */
  const [clock, setClock] = useState<{ serverNow?: string; cutoff?: Cutoff }>({});
  // สอนการใช้งาน (หัวหน้าภาค ขั้น "เวลาปิดนัดงานพรุ่งนี้") บอกเวลาปิดที่แอดมินตั้งจริง — ค่าเดียวกับที่แถบ "รอนัดวัน" ใช้
  useHowToContext({ cutoff: clock.cutoff ?? null });
  const [error, setError] = useState<string | null>(null);
  const [sendFor, setSendFor] = useState<WorkOrderRow | null>(null);
  const [replyFor, setReplyFor] = useState<WorkOrderRow | null>(null);
  // แอดมินกด "แก้เป็นงานด่วน" / "ตอบกลับ" บนการ์ดในหัวข้อ "ขอนัดด่วน" — ทำได้จากหน้านี้เลย ไม่ต้องเปิดใบงานก่อน
  const [urgentFor, setUrgentFor] = useState<WorkOrderRow | null>(null);
  const [answerFor, setAnswerFor] = useState<WorkOrderRow | null>(null);
  const [query, setQuery] = useState("");
  /**
   * แถบแจ้งผลหลังตีกลับ/คอนเฟิร์มรายการอะไหล่ของช่าง (utils/flash) — การ์ดหายจากกลุ่ม "คอนเฟิร์มอะไหล่" ทันที ต้องบอกว่าใบไปไหน
   * วาดเองที่นี่ ไม่ใช่ showAlert: หัวข้อที่ลงท้าย "แล้ว" กลายเป็นสีเขียว ทั้งที่การตีกลับต้องเป็นแดง
   */
  const [pickFlash, setPickFlash] = useState<QueueFlash | null>(null);
  const searchRef = useRef<TextInput>(null);
  const seq = useRef(0);
  // แท็บที่ไม่ได้เปิดอยู่บนเว็บยังวาดค้างไว้แบบโปร่งใส (ท่าจางเข้าเวลาสลับแท็บ) — รายการรหัสใบงานที่นี่
  // ไปปนกับหน้ารายการใบงาน (เทสต์ appointment-list นับรหัสเกิน) วาดรายการเฉพาะตอนแท็บนี้เปิดอยู่
  const focused = useIsFocused();

  // แอดมินที่ไม่ใช่ Admin Spare Part — หัวข้อปักของแอดมิน (กล่องของ Admin Spare Part คืองานตรวจเคลม)
  const adminCut = user?.role === "ADMIN" && !user?.partsAdmin;
  const load = useCallback(async () => {
    const n = ++seq.current;
    setError(null);
    try {
      const res = await api.get<{ rows: WorkOrderRow[]; serverNow?: string; cutoff?: Cutoff }>("/work-orders", { params: { status: "INBOX" } });
      if (n === seq.current) {
        setRows(res.data.rows);
        setClock({ serverNow: res.data.serverNow, cutoff: res.data.cutoff });
      }
    } catch (e) {
      if (n === seq.current) setError(apiErrorMessage(e));
    }
  }, []);
  // กลับมาหน้านี้ = หยิบแถบแจ้งผลครั้งเดียว (ไม่มีเรื่องใหม่ = แถบเก่าหาย)
  useFocusEffect(
    useCallback(() => {
      setPickFlash(takeFlash("MyQueue"));
      load();
    }, [load])
  );
  // รีเฟรชเอง (ปุ่ม/ดึงลงบนเว็บ · ดึงลงบนมือถือ) = แถบแจ้งผลหาย — สองทางใช้ตัวเดียวกัน (เดิมดึงลงบนมือถือแถบค้าง)
  const refresh = async () => {
    setPickFlash(null);
    await load();
  };
  useRefreshHandler(refresh);

  /**
   * นาฬิกาเซิร์ฟเวอร์ของหน้านี้ — การ์ดกับแถบบนสุดใช้ "ตอนนี้" ตัวเดียวกัน จึงพลิกพร้อมกันตอนถึงเวลาปิดนัด
   * หน้าของหัวหน้าภาคไม่โหลดใหม่ตอนถึงเวลา (ใบในกล่องไม่เปลี่ยนตอน 16:00) — ป้ายคิดใหม่จากเวลาปิดที่ถืออยู่แล้ว
   */
  const now = useServerClock(clock.serverNow, clock.cutoff?.time);
  const serverNowAt = useServerNowFn(clock.serverNow);
  /**
   * แอดมิน: โหลดกล่องใหม่เองหลังเที่ยงคืน (เวลาไทย) + สุ่ม 2–30 วิ — กล่องแอดมินเปลี่ยนตอนข้ามวันโดยไม่มีใครกด:
   * คำขอนัดด่วนของเมื่อวานหมดอายุ (เซิร์ฟเวอร์เอาออกจากกล่อง) และใบรอปล่อยงานที่วันนัดเพิ่งผ่านเข้า "เลยนัด" (overdue ของเซิร์ฟเวอร์)
   * ไม่โหลด = คำขอที่หมดอายุหล่นไปอยู่กลุ่มขั้นของหัวหน้าภาค และ "เลยนัด" ขาดใบจนกว่าจะสลับแท็บ — หน้านี้ไม่ได้ถาม /version
   * แบบหน้ารายการ (เลขรุ่นต่อท้ายวันไทยของกล่องงาน) จึงต้องตั้งเวลาเอง
   * สุ่มเวลา: จอแอดมินทุกจอที่เปิดค้างจะได้ไม่ถามเซิร์ฟเวอร์ในวินาทีเดียวกัน — pool ฐานข้อมูลมีแค่ 5 connection (src/prisma.ts)
   * ตั้งเฉพาะตอนหน้านี้เปิดอยู่ — กลับมาหน้านี้ทีหลังก็โหลดใหม่อยู่แล้ว (useFocusEffect)
   * ไม่ตั้งตอนถึงเวลาปิดนัดแล้ว: ไม่มีใบไหนเข้ากล่องแอดมินตอน 16:00 (คำขอมาจากหัวหน้าภาคกด)
   */
  useEffect(() => {
    if (!adminCut || !focused) return;
    const n = serverNowAt();
    const midnight = Date.parse(`${addDays(serverDay(n), 1)}T00:00:00.000+07:00`);
    const timer = setTimeout(() => void load(), midnight - n + 2000 + Math.random() * 28000);
    return () => clearTimeout(timer);
  }, [adminCut, focused, clock.serverNow, serverNowAt, load]);
  /**
   * หัวข้อของแอดมิน (ขอนัดด่วน · เลยนัด) — ตัวสร้างเดียวกับกล่องงาน สองหน้าจึงนับตรงกันเสมอ · นับทุกใบในกล่อง ไม่ตามคำค้น
   */
  const cut = useMemo(() => (adminCut && rows ? adminGroups(rows, now, clock.cutoff) : null), [adminCut, rows, now, clock.cutoff]);
  // กลุ่มตามขั้น — กลุ่มที่มีใบด่วนขึ้นก่อน แล้วกลุ่มที่ค้างนานสุด · ในกลุ่มเรียงด่วน → ค้างนาน
  const isAdmin = user?.role === "ADMIN";
  const groups = useMemo(() => {
    const by = new Map<string, WorkOrderRow[]>();
    const pinned = new Map<string, { kind: GroupKind; list: WorkOrderRow[] }>();
    const pin = (label: string, kind: GroupKind, r: WorkOrderRow) =>
      pinned.set(label, { kind, list: [...(pinned.get(label)?.list ?? []), r] });
    // ลำดับของตัวสร้างหัวข้อ (วันที่ขอ → เวลาที่ขอ) — แถบ "ขอนัดด่วน n" ในกล่องงานเรียงแบบนี้ สองหน้าต้องขึ้นใบเดียวกันก่อน
    const askRank = new Map((cut?.asks?.rows ?? []).map((r, i) => [r.id, i]));
    const askIds = new Set(askRank.keys());
    const pastIds = new Set((cut?.past?.rows ?? []).map((r) => r.id));
    for (const r of rows ?? []) {
      // คำขอนัดด่วนก่อนคำขอตรวจสอบ (ดู ASK_GROUP) — ใบหนึ่งอยู่หัวข้อเดียว
      if (askIds.has(r.id)) pin(ASK_GROUP, "ask", r);
      else if (pastIds.has(r.id)) pin(PAST_GROUP, "past", r);
      else if (isAdmin && r.adminReview && !r.adminReview.answered) pin(REVIEW_GROUP, "review", r);
      else if (!isAdmin && r.adminReview?.answered && r.stageActor !== "SUPERVISOR") pin(ANSWER_GROUP, "answer", r);
      else {
        const k = stageName(r.statusLabel);
        by.set(k, [...(by.get(k) ?? []), r]);
      }
    }
    const score = (r: WorkOrderRow) => (r.priority === "URGENT" ? 1e6 : 0) + rowDays(r);
    /**
     * กลุ่ม "รอลูกค้าจ่ายเงิน" เรียงตามวันที่รอ นานสุดก่อน ไม่ดูด่วน (ตัวอย่างกล่องงานที่ตกลง 5 พ.ย. 69) — ใบด่วนที่เพิ่งส่งราคา
     * ไม่ได้ต้องตามก่อนใบที่ลูกค้าเงียบมาสัปดาห์หนึ่ง · เท่ากันใบที่เข้าขั้นก่อนขึ้นก่อน
     */
    const payGroup = (list: WorkOrderRow[]) => list.length > 0 && list.every((r) => r.payWait);
    const byWait = (a: WorkOrderRow, b: WorkOrderRow) => b.payWait!.days - a.payWait!.days || a.payWait!.since.localeCompare(b.payWait!.since);
    // คำขอตรวจสอบเรียงส่งก่อนขึ้นก่อน — ไม่ใช่ตามวันค้างขั้น (ขั้นตอนไม่ได้เปลี่ยนตอนส่ง)
    const sent = (r: WorkOrderRow) => new Date(r.adminReview?.at ?? r.stageSince).getTime();
    /**
     * กลุ่มขั้นปล่อยงานของหัวหน้าภาค (รับทราบ ปล่อยงาน · ส่งช่างตรวจ · คอนเฟิร์มวันใหม่) เรียงตามวันนัด ไม่ใช่ด่วน/ค้างนาน
     * ปล่อยงานไม่มีเวลาปิดแล้ว แต่ทีมออกตามวันนัด — งานวันนี้/พรุ่งนี้ต้องอยู่บนสุดให้ปล่อยก่อน ทีมจะได้เห็นงานในแท็บทันวัน
     * (หน้าตาอย่างเดียว — ไม่เปลี่ยนว่าใบไหนอยู่กลุ่มไหน)
     */
    const releaseGroup = (list: WorkOrderRow[]) => !isAdmin && list.every((r) => RELEASE_STAGES.includes(r.status));
    // คำอธิบายใต้หัวข้อปักของเวลาปิดนัด — ประโยคเดียวกับหัวข้อในกล่องงาน (ตัวสร้างเดียวกัน)
    const hintOf = (kind: GroupKind) => (kind === "ask" ? cut?.asks?.hint : kind === "past" ? PAST_GROUP_HINT : undefined);
    return [
      ...[...pinned.entries()]
        .sort((a, b) => PIN_RANK[a[1].kind] - PIN_RANK[b[1].kind])
        .map(([label, g]) => ({
          label,
          kind: g.kind,
          pay: false,
          hint: hintOf(g.kind),
          // คำขอนัดด่วนเรียงตามตัวสร้างหัวข้อ (วันที่ขอ → เวลาที่ขอ: ร้านที่รอวันนี้อยู่บนสุด) ไม่ใช่ลำดับที่รายการส่งมา
          // (เซิร์ฟเวอร์เรียงด่วน → เปิดก่อน ใบเก่าที่ขอพรุ่งนี้จะทับใบที่ขอวันนี้) · เลยนัดเรียงตามวันนัด (เลยมานานสุดก่อน)
          // · คำขอตรวจสอบเรียงตามเวลาส่ง
          list:
            g.kind === "ask"
              ? g.list.sort((a, b) => (askRank.get(a.id) ?? 0) - (askRank.get(b.id) ?? 0))
              : g.kind === "past"
                ? g.list.sort(byAppt)
                : g.list.sort((a, b) => sent(a) - sent(b)),
        })),
      ...[...by.entries()]
        .map(([label, list]) => ({
          label,
          kind: "stage" as GroupKind,
          hint: undefined as string | undefined,
          list: payGroup(list) ? list.sort(byWait) : releaseGroup(list) ? list.sort(byAppt) : list.sort((a, b) => score(b) - score(a)),
          pay: payGroup(list),
        }))
        .sort((a, b) => Math.max(...b.list.map(score)) - Math.max(...a.list.map(score))),
    ];
  }, [rows, isAdmin, cut]);
  /**
   * แถบบนสุดของหัวหน้าภาค ("รอนัดวัน" ช่วง 3 ชม. ก่อนปิด · "ออกงานวันนี้") — ตัวสร้างเดียวกับกล่องงาน สองหน้าจึงนับตรงกันทุกตัวอักษร
   * นับทุกใบในกล่อง ไม่ตามคำค้น: ค้นหาใบหนึ่งอยู่ไม่ได้แปลว่าใบรอนัดอื่นหายไป
   */
  const banners = useMemo(
    () => (user?.role === "SUPERVISOR" && rows ? supervisorBanners(rows, now, clock.cutoff) : []),
    [user?.role, rows, now, clock.cutoff]
  );

  // ค้นในใบที่โหลดมาแล้ว — กลุ่มที่ไม่มีใบตรงซ่อน · total = จำนวนในกลุ่มก่อนค้น (บอก "2 จาก 75")
  const q = query.trim().toLowerCase();
  /**
   * กลุ่มรอลูกค้าจ่ายเงิน: ปุ่ม "เกิน 3 วัน n ใบ" ที่หัวกลุ่ม กดแล้วเหลือเฉพาะใบที่ควรตามลูกค้า (เจ้าของงานเลือก 5 พ.ย. 69)
   * อยู่ที่หัวกลุ่มแบบช่องค้นหา (กรองในเครื่อง) ไม่ใช่หน้าใหม่ — ตัวเลขสรุปด้านบนยังนับทั้งหมด
   */
  const [payLateOnly, setPayLateOnly] = useState(false);
  const shown = useMemo(
    () =>
      groups
        .map((g) => {
          const mine = g.pay && payLateOnly ? g.list.filter((r) => r.payWait?.over) : g.list;
          return { ...g, total: g.list.length, late: g.pay ? g.list.filter((r) => r.payWait?.over).length : 0, list: q ? mine.filter((r) => haystack(r).includes(q)) : mine };
        })
        .filter((g) => g.list.length > 0 || (g.pay && payLateOnly && !q)),
    [groups, q, payLateOnly]
  );
  const found = shown.reduce((n, g) => n + g.list.length, 0);

  /**
   * สอนการใช้งาน (หัวหน้าภาค "ระบุอะไหล่" เริ่มจากหน้าสอนการใช้งาน): เปิดใบรอระบุอะไหล่ใบแรกให้ — แค่เปิดใบงาน ไม่บันทึกอะไร
   * ฟอร์มเปิดต่อด้วยคำสั่งของหน้าใบงานเอง (order.openStage) ไม่ใช่ open:"stage" แบบปุ่มบนการ์ด — หน้าใบงานเปิดฟอร์มตอนโหลด
   * ให้เฉพาะใบตรวจหน้างาน/ใบคอนเฟิร์มอะไหล่ จะเปลี่ยนให้ปุ่มบนการ์ดของหัวหน้าภาคทุกคนเพื่อวิธีใช้ไม่ได้
   * ข้ามใบที่ช่างเลือกอะไหล่มาแล้ว (คอนเฟิร์มอะไหล่) — ฟอร์มนั้นไม่มีสามทางเลือกที่วิธีใช้อธิบาย · เฉพาะกลุ่มตามขั้น ไม่ใช่หัวข้อปัก
   */
  useHowToAction("queue.openParts", () => {
    const row = shown
      .filter((g) => g.kind === "stage")
      .flatMap((g) => g.list)
      .find((r) => r.status === "NEW" && !r.partsPick);
    if (!row) return false;
    onOpen(row.id);
    return { ok: true, code: row.code };
  });

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
  const stale = all.filter((r) => rowDays(r) > STALE_DAYS).length;
  const out = all.filter((r) => (r.partsOut ?? 0) > 0).length;
  const roleLabel = user?.role === "ADMIN" ? "แอดมิน" : "หัวหน้าภาค";
  /**
   * Admin Spare Part (เคลมก้อน 6) — งานที่รอคือตรวจเคลม ไม่ใช่ขั้นของแอดมิน: ป้ายบอกชื่อตำแหน่งจริง ("งานที่รอแอดมินทำ" ทำให้คิดว่า
   * ต้องทำงานแอดมินด้วย) · ไม่มีตัวเลข "ด่วน" / "อะไหล่หมด" — ใบรอตรวจเคลมไม่มีงานด่วนหรืออะไหล่ค้าง ตัวเลขนั้นจึงเป็น 0 ตลอดหรือหลอกตา
   */
  const partsAdmin = !!user?.partsAdmin;

  const searchBox = (
    <View style={[styles.search, docked && styles.searchDocked, !!q && styles.searchOn]} {...howtoTarget("queue.search")}>
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

  const modals = (
    <>
      {/*
        หน้าต่างคำขอนัดด่วน — ทำเสร็จแล้วใบออกจากหัวข้อ "ขอนัดด่วน" (และกล่องงานแอดมิน) โหลดใหม่ให้เห็นว่าเสร็จจริง
        ปิดหลังเจอ "คำขอเปลี่ยนไปแล้ว" (stale) ก็โหลดใหม่ — แถวที่ค้างอยู่คือคำขอที่ไม่มีแล้ว
      */}
      {urgentFor ? (
        <UrgentReleaseModal
          order={urgentFor}
          onCancel={(stale) => {
            setUrgentFor(null);
            if (stale) void load();
          }}
          onDone={async () => {
            setUrgentFor(null);
            await load();
          }}
        />
      ) : null}
      {answerFor ? (
        <UrgentAnswerModal
          order={answerFor}
          onCancel={(stale) => {
            setAnswerFor(null);
            if (stale) void load();
          }}
          onDone={async () => {
            setAnswerFor(null);
            await load();
          }}
        />
      ) : null}
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
    </>
  );

  /**
   * แอดมินทั่วไปกับ Super Admin — หน้าแบบแยกหัวข้อ (เจ้าของงานเลือก 5 พ.ย. 69 · ตัวอย่าง myday "ทำตามที่แนะนำ")
   * หัวหน้าภาค ช่าง และ Admin Spare Part ใช้หน้าเดิมข้างล่างไปก่อน (คำตอบข้อ 1) · ข้อมูล ตัวเลขสรุป ช่องค้นหา หน้าต่าง
   * และการโหลดใหม่ (ดึงลง · ปุ่มรีเฟรช · หลังเที่ยงคืน) ชุดเดียวกับหน้าเดิม — ต่างกันแค่การจัดวาง
   */
  if (adminCut) {
    return (
      <AdminTopics
        rows={rows}
        error={error}
        cut={cut}
        now={now}
        query={query}
        setQuery={setQuery}
        searchBox={searchBox}
        stats={
          rows ? (
            <View style={styles.stats} accessibilityLabel="ตัวเลขสรุปงานที่รอ" {...howtoTarget("queue.stats")}>
              <Stat n={all.length} label="รอทำทั้งหมด" />
              <Stat n={urgent} label="ด่วน" tone={urgent ? "danger" : undefined} />
              <Stat n={stale} label={`ค้างเกิน ${STALE_DAYS} วัน`} tone={stale ? "warning" : undefined} />
              <Stat n={out} label="อะไหล่หมด" tone={out ? "danger" : undefined} />
            </View>
          ) : null
        }
        pickFlash={pickFlash}
        onFlashClose={() => setPickFlash(null)}
        onOpen={onOpen}
        onSearchAll={onSearchAll}
        refresh={refresh}
        reload={load}
        setRows={setRows}
        onSend={setSendFor}
        onReply={setReplyFor}
        onUrgent={setUrgentFor}
        onAnswerAsk={setAnswerFor}
        modals={modals}
      />
    );
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
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
        <View style={styles.stats} accessibilityLabel="ตัวเลขสรุปงานที่รอ" {...howtoTarget("queue.stats")}>
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
        ลำดับใต้แถวค้นหา (integration G5 — ฟีเจอร์ที่ตามมาต้องคงลำดับนี้): 1) แถบแจ้งผลของ parts-pick
        · 2) แถบเวลาปิดนัด (หัวหน้าภาค: "รอนัดวัน" 3 ชม. ก่อนปิด · "ออกงานวันนี้") · 3) การ์ด Admin Spare Part · 4) หัวข้อปักของแอดมิน
        · 5) กลุ่มตามขั้น — แถบอยู่ช่องเดียวกับแถบปล่อยงานรุ่นเดิม (เจ้าของงานข้อ 7) หัวหน้าภาคมองที่เดิมแล้วเจอ
        ห้ามวางก่อนแถวค้นหา — ลูกตัวที่ 3 ของหน้านี้ต้องเป็นแถวค้นหาที่ติดหัวจอ (stickyHeaderIndices)
        แอดมินไม่มีแถบในช่อง 2 แล้ว ("งานพรุ่งนี้ที่ยังไม่ปล่อย/ยังไม่คอนเฟิร์ม" ถอดไป — ปล่อยงานและคอนเฟิร์มกดได้ทุกเวลา ไม่มีอะไรใกล้ล็อก)
      */}
      {/*
        1) แถบแจ้งผลของรอบเลือกอะไหล่ — นอกเงื่อนไข "มีใบในกล่อง" เหมือนกัน: คอนเฟิร์มใบสุดท้ายแล้วกล่องว่าง ยังต้องเห็นว่าใบไปไหน
        แดง = ตีกลับ (ใบกลับไปหาทีมช่าง) · เขียว = คอนเฟิร์ม (ใบไปขั้นถัดไป) · แตะเพื่อปิด
      */}
      {pickFlash ? <PickFlashBar flash={pickFlash} onClose={() => setPickFlash(null)} /> : null}
      {/* กรอบห่อให้วิธีใช้ชี้แถบเวลาปิดนัด (ชื่อคงที่) — ไม่ต้องแก้ตัวแถบเอง · ลูกตัวเดียวแทนลูกตัวเดียว ลำดับลูกไม่ขยับ */}
      {rows && !error && banners.length ? (
        <View {...howtoTarget("queue.cutoff")}>
          <CutoffBanners groups={banners} />
        </View>
      ) : null}
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
          <View
            key={g.label}
            style={[styles.group, g.kind === "ask" && styles.groupAsk, g.kind === "past" && styles.groupCut]}
            accessibilityLabel={`กลุ่ม ${g.label}`}
          >
            {/* วิธีใช้ "แบ่งกลุ่มตามขั้น" ชี้หัวกลุ่มตามขั้นเท่านั้น — หัวข้อปัก (ขอนัดด่วน · เลยนัด · คำขอตรวจสอบ) ไม่ใช่ชื่อขั้น */}
            <View style={styles.groupHead} {...(g.kind === "stage" ? howtoTarget("queue.group") : null)}>
              {g.kind === "ask" ? <Ionicons name="hourglass-outline" size={18} color={colors.roleAdmin} /> : null}
              {g.kind === "past" ? <Ionicons name="calendar-outline" size={18} color={colors.dangerInk} /> : null}
              <Text
                style={[
                  styles.groupTitle,
                  headingFont,
                  g.kind === "ask" && { color: colors.roleAdmin },
                  g.kind === "past" && { color: colors.dangerInk },
                ]}
              >
                {g.label}
              </Text>
              <View
                style={[
                  styles.groupCount,
                  g.kind === "ask" && { backgroundColor: colors.roleAdmin },
                  g.kind === "past" && { backgroundColor: colors.dangerFill },
                ]}
              >
                <Text style={styles.groupCountText}>{g.list.length}</Text>
              </View>
              {q || (g.pay && payLateOnly) ? <Text style={styles.groupOf}>จาก {g.total}</Text> : null}
              {/* ติดค้างอยู่แต่ไม่เหลือใบเกินเส้นแล้ว (เพิ่งแนบบิล/ยกเลิก) ยังต้องมีปุ่มให้กดกลับไปดูทั้งหมด */}
              {g.pay && (g.late || payLateOnly) ? (
                <TouchableOpacity
                  style={[styles.lateChip, payLateOnly && styles.lateChipOn]}
                  onPress={() => setPayLateOnly((v) => !v)}
                  accessibilityLabel={`ดูเฉพาะรอจ่ายเกิน ${g.list[0]?.payWait?.alertDays ?? ""} วัน ${g.late} ใบ`}
                  accessibilityState={{ selected: payLateOnly }}
                  // เว็บไม่แปลง accessibilityState เป็น aria-selected (CLAUDE.md) — เทสต์อ่านว่าปุ่มนี้ติดอยู่ไหมจากตรงนี้
                  aria-selected={payLateOnly}
                >
                  <Text style={[styles.lateChipText, payLateOnly && styles.lateChipTextOn]}>
                    เกิน {(g.list[0] ?? groups.find((x) => x.pay)?.list[0])?.payWait?.alertDays} วัน {g.late} ใบ
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {g.hint ? <Text style={styles.groupHint}>{g.hint}</Text> : null}
            {g.pay ? (
              <Text style={styles.groupHint}>
                {payLateOnly ? "เฉพาะใบที่รอเกินกำหนด — ควรตามลูกค้า · กดปุ่มแดงอีกครั้งเพื่อดูทั้งหมด" : "เรียงจากรอนานสุด · นับวันจากตอนส่งใบเสนอราคา"}
              </Text>
            ) : null}
            {g.list.map((r) => {
              const d = rowDays(r);
              const hot = r.priority === "URGENT";
              /**
               * การ์ดในหัวข้อปักของแอดมิน: "ขอนัดด่วน" บอกใครขอ (+ เบอร์) เมื่อไร · วันที่ร้านต้องการ · ข้อความ — แอดมินตัดสินใจได้จากการ์ด
               * "เลยนัด" บอกนัดกับขั้นที่ค้าง (ค้างโอน/เบิกคลังอื่น = ตามหัวหน้าภาค) แบบแถวในกล่องงาน
               */
              const cutKind = g.kind === "ask" || g.kind === "past" ? g.kind : null;
              const askLines = cutKind === "ask" ? askRowLines(r, now) : null;
              const day = r.scheduledAt?.slice(0, 10);
              return (
                <View key={r.id} style={[styles.card, hot && styles.cardHot, r.payWait?.over && styles.cardPayLate]}>
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
                    {/* ในหัวข้อ "เลยนัด" ชื่อหัวข้อบอกแล้ว ไม่ขึ้นซ้ำ */}
                    {r.overdue && cutKind !== "past" ? <Tag text="เลยนัด" fg={colors.dangerInk} bg={colors.dangerSoft} /> : null}
                    {/* วันถูกเลื่อน (ลูกค้าขอตอนคอนเฟิร์ม หรือแอดมินเลื่อนวันนัด ต.ค. 69) — หัวหน้าภาคต้องเช็คทีมวันใหม่ก่อนปล่อย */}
                    {r.rescheduled ? <Tag text="เลื่อนวันนัด — คอนเฟิร์มวันใหม่" fg={colors.warningInk} bg={colors.warningSoft} /> : null}
                    <AdminReviewTag review={r.adminReview} />
                    <View style={{ flex: 1 }} />
                    <Text style={[styles.wait, (r.payWait ? r.payWait.over : d > STALE_DAYS) && styles.waitLate]}>
                      {/* รอลูกค้าจ่ายเงิน: "รอมาแล้ว N วัน" (ตัวเลขของเซิร์ฟเวอร์ · แดงเมื่อเกินเส้นของเซิร์ฟเวอร์) */}
                      {r.payWait ? payDaysText(r.payWait) : d < 1 ? "เข้าขั้นนี้วันนี้" : `ค้าง ${d} วัน`}
                      {/* รายการของช่างรอคอนเฟิร์ม — ส่งมาเมื่อไร (ตัวอย่าง si.sentAt) หัวหน้าภาคเรียงงานเองได้ */}
                      {r.partsPick ? ` · ส่งมา ${dayTime(r.partsPick.sentAt)}` : ""}
                    </Text>
                  </View>
                  {/*
                    ป้ายเวลาปิดนัดของใบรอนัดวัน (นัดพรุ่งนี้ได้ถึง … · ขอนัดด่วนแล้ว · แอดมินแก้เป็นงานด่วน) บรรทัดของตัวเอง
                    — ข้อความยาว วางในแถวป้ายแล้วดันกันหักบรรทัด · หัวข้อปักของแอดมินบอกเรื่องของมันเองในบรรทัดของหัวข้อแล้ว
                  */}
                  {cutKind ? null : <ScheduleChip row={r} now={now} cutoff={clock.cutoff} style={styles.releaseChip} />}
                  <Hi text={`${r.branchCode} ${r.branchName}`} q={q} style={styles.branch} numberOfLines={1} />
                  {askLines ? (
                    <View style={styles.cutLines}>
                      <Text style={styles.cutWho} accessibilityLabel={askLines.who}>
                        {askLines.who}
                      </Text>
                      <Text style={styles.askAppt} accessibilityLabel={askLines.appt}>
                        {askLines.appt}
                      </Text>
                      {askLines.note ? <Text style={styles.cutCause}>{askLines.note}</Text> : null}
                    </View>
                  ) : cutKind === "past" ? (
                    // นัดเมื่อไร ค้างที่ขั้นไหน (ค้างโอน/เบิกคลังอื่น = ตามหัวหน้าภาค) แบบแถวกล่องงาน
                    <Text style={styles.cutWhen}>
                      {[day ? `นัด ${dayFull(day)} · ${timeText(r.scheduledTime)}` : null, r.statusLabel].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
                  {r.partsPick ? (
                    /*
                      การ์ดคอนเฟิร์มอะไหล่ (ตัวอย่าง si) — มาจากการตรวจหน้างาน เครื่องอะไร ยี่ห้ออะไร ช่างคนไหนเลือก กี่รายการ อะไรบ้าง
                      หัวหน้าภาคเห็นว่าต้องเปิดดูละเอียดแค่ไหนก่อนกด · ยี่ห้อบอกว่ารายการมาจากไฟล์ไหน
                    */
                    <>
                      <Hi
                        text={[
                          "ตรวจหน้างาน",
                          r.machineCode ? `เครื่อง ${machineTag(r.machineCode, r.machineCapacityKg)}` : null,
                          r.machineMake ?? null,
                          r.partsPick.sentByName ? `ช่าง${r.partsPick.sentByName}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        q={q}
                        style={styles.meta}
                        numberOfLines={2}
                      />
                      <View style={styles.pickTags}>
                        <Tag text={`ช่างเลือก ${r.partsPick.count} รายการ`} fg={colors.primaryInk} bg={colors.primarySoft} />
                        {r.partsPick.round > 1 ? (
                          <Tag text={`ส่งรอบที่ ${r.partsPick.round}`} fg={colors.warningInk} bg={colors.warningSoft} />
                        ) : null}
                      </View>
                      {r.partsPick.line ? (
                        <Text style={styles.pickLine} numberOfLines={3}>
                          {r.partsPick.line}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    /* อาการก่อนชื่อใบ — ใบจากฟอร์มชื่อ "งาน CM" ทุกใบ บอกอะไรไม่ได้ (ชื่อเรื่องยังใช้กับใบไฟดับ/PM ที่ไม่มีอาการ) */
                    <Hi
                      text={[r.symptom || r.title, r.machineCode ? `เครื่อง ${machineTag(r.machineCode, r.machineCapacityKg)}` : null, r.assignedTeam ? `ทีม ${r.assignedTeam}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                      q={q}
                      style={styles.meta}
                      numberOfLines={2}
                    />
                  )}
                  {r.orphan && r.orphanReason ? <Text style={styles.note}>{r.orphanReason}</Text> : null}
                  {/* ตามลูกค้าล่าสุด "4 พ.ย. · ลูกค้าบอกโอนวันศุกร์" หรือ "ยังไม่เคยตาม" สีแดง — รู้ว่าใบไหนต้องโทรโดยไม่ต้องเปิดใบ */}
                  {r.payWait ? <PayFollowLine p={r.payWait} /> : null}
                  {r.adminReview ? <AdminReviewBox review={r.adminReview} viewer={isAdmin ? "admin" : "supervisor"} /> : null}
                  {/*
                    กรอบห่อให้วิธีใช้ชี้ "ปุ่มของขั้นนี้" — เฉพาะการ์ดในกลุ่มตามขั้น การ์ดปักมีปุ่มอื่น (แก้เป็นงานด่วน · ตอบกลับ)
                    ที่ข้อความขั้นนั้นไม่ได้พูดถึง · ห่อที่นี่ที่เดียวแทนการใส่ชื่อในทุกทางที่ CardActions คืนค่า
                  */}
                  <View {...(g.kind === "stage" ? howtoTarget("queue.actions") : null)}>
                    <CardActions
                      row={r}
                      kind={g.kind}
                      // หัวข้อปัก (ขอนัดด่วน · เลยนัด) ไม่ใช่ชื่อขั้น — ปุ่ม/ป้ายบนการ์ดต้องบอกขั้นจริงของใบ
                      stageLabel={g.kind === "stage" ? g.label : stageName(r.statusLabel)}
                      isAdmin={isAdmin}
                      wide={docked}
                      onOpen={onOpen}
                      onSend={() => setSendFor(r)}
                      onReply={() => setReplyFor(r)}
                      onUrgent={() => setUrgentFor(r)}
                      onAnswerAsk={() => setAnswerFor(r)}
                      onChanged={load}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        ))
      )}
      {modals}
    </ScrollView>
  );
}

/**
 * ชื่อขั้นจากตัวเลือกของเซิร์ฟเวอร์ (stages[].action = ป้ายขั้นที่ตัด "แอดมิน · " ออก) — ชื่อหัวข้อตรงกับป้ายขั้นทุกที่ในแอป
 * จำไว้ทั้งแอป (ชื่อขั้นเปลี่ยนเฉพาะตอน deploy) · ยังไม่มา/ถามไม่ได้ = หัวข้อที่มีใบใช้ป้ายจากแถว หัวข้อว่างรอจนได้ชื่อ
 */
let stageNamesCache: Record<string, string> | null = null;
function useStageNames() {
  const [names, setNames] = useState<Record<string, string>>(stageNamesCache ?? {});
  useEffect(() => {
    if (stageNamesCache) return;
    let alive = true;
    api
      .get<{ stages: { value: string; action: string }[] }>("/work-orders/options", { loadingText: false })
      .then(({ data }) => {
        stageNamesCache = Object.fromEntries(data.stages.map((s) => [s.value, s.action]));
        if (alive) setNames(stageNamesCache);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return names;
}

/** สีชิป/ป้ายของหัวข้อ (ตัวอย่าง: แดงทึบ = ต้องรีบที่สุด · แดงอ่อน · เหลือง = ใกล้ถึง/ค้าง · เทา) */
const TONE: Record<ChipTone, { bg: string; fg: string }> = {
  red: { bg: colors.dangerFill, fg: "#fff" },
  redSoft: { bg: colors.dangerSoft, fg: colors.dangerInk },
  amber: { bg: colors.warningSoft, fg: colors.warningInk },
  plain: { bg: colors.rowAlt, fg: colors.body },
};
const flagsOf = (t: Topic) => t.chips.filter((c) => c.flag && c.n > 0);
/** หัวข้อที่มีเรื่องแดงทึบ (ขอนัดด่วน · รอจ่ายเกินกำหนด) — การ์ดขอบแดง ตัวเลขแดง */
const hotTopic = (t: Topic) => t.chips.some((c) => c.tone === "red" && c.n > 0);
const stepLabel = (t: Topic) => (t.id === "first" ? "ก่อนทุกขั้น" : t.step ? `ขั้นที่ ${t.step} ของแอดมิน` : "นอกขั้นข้างบน");
const stuckText = (r: WorkOrderRow) => {
  const d = rowDays(r);
  return d < 1 ? "เข้าขั้นนี้วันนี้" : `ค้าง ${d} วัน`;
};

type AdminTopicsProps = {
  rows: WorkOrderRow[] | null;
  error: string | null;
  cut: AdminCutoffGroups | null;
  now: number;
  query: string;
  setQuery: (q: string) => void;
  searchBox: React.ReactNode;
  stats: React.ReactNode;
  pickFlash: QueueFlash | null;
  onFlashClose: () => void;
  onOpen: Props["onOpen"];
  onSearchAll?: Props["onSearchAll"];
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
  setRows: React.Dispatch<React.SetStateAction<WorkOrderRow[] | null>>;
  onSend: (r: WorkOrderRow) => void;
  onReply: (r: WorkOrderRow) => void;
  onUrgent: (r: WorkOrderRow) => void;
  onAnswerAsk: (r: WorkOrderRow) => void;
  modals: React.ReactNode;
};

/**
 * งานของฉันวันนี้ของแอดมิน แบบแยกหัวข้อ (ตัวอย่าง myday) — เปิดมาเจอ "ภาพรวม" (คำตอบข้อ 2):
 * แถบแดง "ต้องทำก่อนวันนี้" แล้วการ์ดหัวข้อละใบ (จำนวน · ทำอะไร · ป้ายเรื่องที่ต้องรีบ · ค้างนานสุด/นัดใกล้สุด) เรียงตามลำดับงาน (ข้อ 3)
 * จอคอม: เมนูหัวข้อซ้าย เนื้อหาขวา · มือถือ: ภาพรวมเป็นรายการ แตะหัวข้อเปิดรายการของหัวข้อนั้น "‹ ภาพรวม" (และปุ่มย้อนกลับของ Android) พากลับ
 * ใบไหนอยู่หัวข้อไหน/เรียงอย่างไรอยู่ที่ utils/adminTopics.ts · ปุ่มบนแถวเปิดใบพร้อมฟอร์มของขั้น (ข้อ 4)
 */
function AdminTopics(p: AdminTopicsProps) {
  const { rows, cut, now, query } = p;
  const { docked } = useDocked();
  const names = useStageNames();
  const [view, setView] = useState<TopicId | "home">("home");
  const [chip, setChip] = useState("all");
  const [paneW, setPaneW] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  // จอคอมที่เนื้อหาขวากว้างพอ = ตารางแบบตัวอย่าง · แคบกว่านั้น (จอ 1100–1300 ที่เมนูข้างค้าง) การ์ดแบบเดิมอ่านง่ายกว่าตารางที่บีบ
  const grid = docked && paneW >= 760;
  const topics = useMemo(() => (rows ? buildTopics(rows, cut, now, names) : []), [rows, cut, now, names]);
  const all = rows ?? [];
  const q = query.trim().toLowerCase();
  const topic = view === "home" ? null : topics.find((t) => t.id === view) ?? null;
  const first = topics.find((t) => t.id === "first");

  const open = (id: TopicId | "home") => {
    setView(id);
    setChip("all");
    // มือถือ: รายการของหัวข้อเริ่มบนสุดเสมอ (ไม่ค้างที่ตำแหน่งเลื่อนของภาพรวม)
    if (!docked) scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  // ปุ่มย้อนกลับของ Android = กลับภาพรวม (ไม่ออกจากหน้า) — เว็บมีปุ่ม "‹ ภาพรวม" บนหัวรายการ
  useEffect(() => {
    if (Platform.OS !== "android" || view === "home") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setView("home");
      return true;
    });
    return () => sub.remove();
  }, [view]);
  /**
   * สอนการใช้งาน (แอดมิน ขั้น "ปุ่มของขั้นนี้"): เปิดหัวข้อแรกที่มีใบให้ดู — แค่เปิดรายการในหน้านี้ ไม่บันทึกอะไร
   * ขั้นของใบก่อน (ปุ่มน้ำเงินเป็นปุ่มของขั้นจริง) แล้วค่อยหัวข้ออื่น · ชื่อหัวข้อขึ้นในกล่องเล็ก ("เปิดหัวข้อ … ให้ดูแล้ว")
   */
  useHowToAction("queue.openTopic", () => {
    const pick =
      topics.find((t) => t.rows.length && (TOPIC_STAGES as readonly string[]).includes(t.id) && t.id !== "AWAITING_PAYMENT") ??
      topics.find((t) => t.rows.length);
    if (!pick) return false;
    p.setQuery("");
    open(pick.id);
    return { ok: true, code: pick.name };
  });

  /** จดการตามลูกค้าในแถวแล้ว — แทนแถวในมือ (ไม่โหลดกล่องใหม่) ตัวเลข/ชิปของหัวข้อคิดใหม่จากแถวชุดนี้เอง */
  const onFollowed = (id: number, pw: WorkOrderRow["payWait"]) =>
    p.setRows((rs) => (rs ? rs.map((r) => (r.id === id ? { ...r, payWait: pw } : r)) : rs));

  const rowOf = (t: Topic, r: WorkOrderRow, wide: boolean) =>
    t.id === "AWAITING_PAYMENT" && r.payWait ? (
      <PaymentRow
        key={r.id}
        row={r as PayRow}
        variant="queue"
        wide={wide}
        canFollow
        onOpen={() => p.onOpen(r.id)}
        // ปุ่มหลักของขั้นนี้: เปิดใบพร้อมฟอร์มแนบบิล (open: "stage") — ชื่อเดียวกับปุ่มในหน้าใบงาน
        onAttach={() => p.onOpen(r.id, "stage")}
        onFollowed={(pw) => onFollowed(r.id, pw)}
        onStale={() => void p.reload()}
        render={(text, style, lines) => <Hi text={text} q={q} style={style as object} numberOfLines={lines} />}
        actionsTarget={howtoTarget("queue.actions")}
      />
    ) : (
      <TopicRow key={r.id} {...p} t={t} row={r} kind={t.kindOf(r)} wide={wide} now={now} q={q} />
    );

  const tableHead = (t: Topic) =>
    grid ? (
      <View style={[ad.tr, ad.thead]}>
        <Text style={[ad.th, QUEUE_COL.code]}>ใบงาน</Text>
        <Text style={[ad.th, QUEUE_COL.branch]}>สาขา</Text>
        <Text style={[ad.th, QUEUE_COL.work]}>งาน · เครื่อง</Text>
        <Text style={[ad.th, QUEUE_COL.info]}>{t.infoHead}</Text>
        <View style={QUEUE_COL.actions} />
      </View>
    ) : null;

  // ── ภาพรวม ──
  const n0 = (first?.chips ?? []).map((c) => c.n);
  const firstBar = first ? (
    <TouchableOpacity
      style={[ad.firstBar, !first.rows.length && ad.firstBarCalm]}
      onPress={() => open("first")}
      disabled={!first.rows.length}
      activeOpacity={0.85}
      accessibilityLabel={`ต้องทำก่อนวันนี้ ${first.rows.length} ใบ`}
      {...howtoTarget("queue.first")}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[ad.firstTitle, headingFont, !first.rows.length && { color: colors.text }]}>ต้องทำก่อนวันนี้ {first.rows.length} ใบ</Text>
        <Text style={ad.firstSub}>
          {first.rows.length
            ? `ร้านขอนัดด่วน ${n0[0] ?? 0} ใบ (รอคำตอบวันนี้/พรุ่งนี้) · เลยวันนัดแล้ว ${n0[1] ?? 0} ใบ`
            : "ไม่มีร้านขอนัดด่วนหรือใบที่เลยวันนัด"}
        </Text>
      </View>
      {first.rows.length ? (
        docked ? (
          <View style={ad.firstGo}>
            <Text style={ad.firstGoText}>เริ่มจากตรงนี้ ›</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={20} color={colors.dangerInk} />
        )
      ) : null}
    </TouchableOpacity>
  ) : null;
  const rest = topics.filter((t) => t.id !== "first");
  // การ์ดภาพรวม 3 ใบต่อแถว (2 ใบเมื่อเนื้อหาขวาแคบ) กว้างเท่ากันทุกใบ — ใบสุดท้ายที่เหลือเดี่ยวไม่ยืดเต็มแถว
  const cols = paneW >= 900 ? 3 : 2;
  const cardW = paneW ? Math.floor((paneW - spacing.md * (cols - 1)) / cols) : undefined;
  const home = docked ? (
    <View style={{ gap: spacing.md }}>
      {firstBar}
      <View style={ad.cards} {...howtoTarget("queue.group")}>
        {rest.map((t) => {
          const hot = hotTopic(t);
          const empty = !t.rows.length;
          return (
            <TouchableOpacity
              key={t.id}
              style={[ad.card, cardW ? { width: cardW } : ad.cardFlex, hot && ad.cardHot, empty && ad.dim]}
              onPress={() => open(t.id)}
              activeOpacity={0.85}
              accessibilityLabel={`หัวข้อ ${t.name} ${t.rows.length} ใบ`}
            >
              <View style={ad.cardTop}>
                <Text style={ad.cardStep}>{t.step ? `ขั้น ${t.step}` : "อื่น ๆ"}</Text>
                <View style={{ flex: 1 }} />
                <Text style={[ad.cardN, headingFont, hot && { color: colors.dangerInk }]}>{t.rows.length}</Text>
              </View>
              <Text style={[ad.cardName, headingFont]}>{t.name}</Text>
              <Text style={ad.cardWhat}>{t.what}</Text>
              <View style={ad.flags}>
                {flagsOf(t).map((c) => (
                  <View key={c.key} style={[ad.flag, { backgroundColor: TONE[c.tone].bg }]}>
                    <Text style={[ad.flagText, { color: TONE[c.tone].fg }]}>
                      {c.label} {c.n}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={ad.cardOldest}>{t.oldest}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  ) : (
    <View style={{ gap: spacing.sm }}>
      {firstBar}
      <Text style={ad.navHead}>หัวข้อที่ต้องทำ · เรียงตามลำดับงาน</Text>
      <View style={ad.list} {...howtoTarget("queue.group")}>
        {rest.map((t, i) => {
          const f = flagsOf(t);
          const hot = hotTopic(t);
          return (
            <TouchableOpacity
              key={t.id}
              style={[ad.listRow, i > 0 && ad.listLine, !t.rows.length && ad.dim]}
              onPress={() => open(t.id)}
              accessibilityLabel={`หัวข้อ ${t.name} ${t.rows.length} ใบ`}
            >
              <StepDot step={t.step} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={ad.listName}>{t.name}</Text>
                {f.length ? (
                  <Text style={[ad.listFlag, { color: f.some((c) => c.tone.startsWith("red")) ? colors.dangerInk : colors.warningInk }]}>
                    {f.map((c) => `${c.label} ${c.n}`).join(" · ")}
                  </Text>
                ) : null}
              </View>
              <Text style={[ad.listN, hot && { color: colors.dangerInk }]}>{t.rows.length}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={ad.foot}>แตะหัวข้อเพื่อเปิดรายการของหัวข้อนั้น · ปุ่ม “‹ ภาพรวม” พากลับมาหน้านี้</Text>
    </View>
  );

  // ── รายการของหัวข้อ ──
  const topicView = (t: Topic) => {
    const test = t.chips.find((c) => c.key === chip)?.test;
    const list = test ? t.rows.filter(test) : t.rows;
    return (
      <View style={{ gap: spacing.md }} accessibilityLabel={`รายการหัวข้อ ${t.name}`}>
        <View style={ad.tHead} {...howtoTarget("queue.group")}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={ad.tStep}>{stepLabel(t)}</Text>
            <Text style={[ad.tName, headingFont]}>
              {t.name} <Text style={ad.tN}>{t.rows.length} ใบ</Text>
            </Text>
            <Text style={ad.tWhat}>{t.what}</Text>
          </View>
          <TouchableOpacity style={ad.back} onPress={() => open("home")} accessibilityLabel="กลับไปภาพรวม">
            <Text style={ad.backText}>‹ ภาพรวม</Text>
          </TouchableOpacity>
        </View>
        <View style={ad.chips}>
          {[{ key: "all", label: "ทั้งหมด", n: t.rows.length, tone: "plain" as ChipTone }, ...t.chips].map((c) => {
            const on = chip === c.key;
            const off = !c.n && !on && c.key !== "all";
            return (
              <TouchableOpacity
                key={c.key}
                style={[ad.chip, on && ad.chipOn, off && ad.dim]}
                onPress={() => setChip(c.key)}
                disabled={off}
                accessibilityLabel={`ชิปหัวข้อ ${c.label} ${c.n}`}
                accessibilityState={{ selected: on, disabled: off }}
                // เว็บไม่แปลง accessibilityState เป็น aria-selected (CLAUDE.md)
                aria-selected={on}
              >
                <Text style={[ad.chipText, on && ad.chipTextOn]}>{c.label}</Text>
                <Text style={[ad.chipText, ad.chipN, on && ad.chipTextOn]}>{c.n}</Text>
              </TouchableOpacity>
            );
          })}
          <View style={{ flex: 1 }} />
          <Text style={ad.sortText}>เรียง: {t.sortText}</Text>
        </View>
        {t.rows.length ? (
          <View style={grid ? ad.table : { gap: spacing.md }}>
            {tableHead(t)}
            {list.map((r) => rowOf(t, r, grid))}
          </View>
        ) : (
          <Text style={ad.empty}>ไม่มีใบในหัวข้อนี้</Text>
        )}
        <Text style={ad.foot}>
          แสดง {list.length} จาก {t.rows.length} ใบ · กดปุ่มน้ำเงินแล้วเข้าใบงานพร้อมเปิดฟอร์มของขั้นนี้ให้เลย
        </Text>
      </View>
    );
  };

  // ── ผลค้น: ทุกหัวข้อพร้อมกัน แยกตามหัวข้อ (ตามลำดับงาน) ──
  const matches = q ? topics.map((t) => ({ t, list: t.rows.filter((r) => haystack(r).includes(q)) })).filter((g) => g.list.length) : [];
  const found = matches.reduce((n, g) => n + g.list.length, 0);
  const results = (
    <View style={{ gap: spacing.lg }}>
      {matches.map(({ t, list }) => (
        <View key={t.id} style={{ gap: spacing.sm }} accessibilityLabel={`ผลค้นหัวข้อ ${t.name}`}>
          <View style={ad.resHead}>
            <StepDot step={t.step} />
            <Text style={[ad.resName, headingFont]}>{t.name}</Text>
            <Text style={ad.resN}>
              {list.length} จาก {t.rows.length}
            </Text>
          </View>
          <View style={grid ? ad.table : { gap: spacing.md }}>
            {tableHead(t)}
            {list.map((r) => rowOf(t, r, grid))}
          </View>
        </View>
      ))}
    </View>
  );
  const none = (
    <View style={styles.none}>
      <View style={styles.noneIcon}>
        <Ionicons name="search" size={26} color={colors.navy} />
      </View>
      <Text style={styles.noneTitle}>ไม่มี “{query.trim()}” ในงานของฉันวันนี้</Text>
      <Text style={styles.noneText}>ใบงานนั้นอาจรอคนอื่นอยู่หรือปิดไปแล้ว — ค้นในใบงานซ่อมทั้งหมดได้</Text>
      {p.onSearchAll ? (
        <TouchableOpacity style={styles.noneGo} onPress={() => p.onSearchAll!(query.trim())} accessibilityLabel="ค้นในใบงานซ่อมทั้งหมด">
          <Ionicons name="clipboard-outline" size={18} color="#fff" />
          <Text style={styles.noneGoText}>ค้นในใบงานซ่อมทั้งหมด</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={styles.noneClear} onPress={() => p.setQuery("")} accessibilityLabel="ล้างคำค้นหา">
        <Text style={styles.resultClearText}>ล้างคำค้น</Text>
      </TouchableOpacity>
    </View>
  );
  const body = q ? (found ? results : none) : topic ? topicView(topic) : home;

  const nav = (
    <View style={ad.nav} accessibilityLabel="หัวข้อที่ต้องทำ">
      <TouchableOpacity
        style={[ad.navItem, view === "home" && !q && ad.navHome]}
        onPress={() => {
          p.setQuery("");
          open("home");
        }}
        accessibilityLabel={`เมนูหัวข้อ ภาพรวม ${all.length}`}
        aria-selected={view === "home" && !q}
      >
        <Text style={[ad.navName, { fontWeight: "700" }]}>ภาพรวม</Text>
        <Text style={ad.navAll}>{all.length}</Text>
      </TouchableOpacity>
      <Text style={ad.navHead}>หัวข้อที่ต้องทำ · เรียงตามลำดับงาน</Text>
      {topics.map((t) => {
        const on = view === t.id && !q;
        const f = flagsOf(t)[0];
        const urgent = t.id === "first" && t.rows.length > 0;
        return (
          <TouchableOpacity
            key={t.id}
            style={[ad.navItem, urgent && ad.navUrgent, on && ad.navOn, !t.rows.length && !on && ad.dim]}
            onPress={() => {
              p.setQuery("");
              open(t.id);
            }}
            accessibilityLabel={`เมนูหัวข้อ ${t.name} ${t.rows.length}`}
            aria-selected={on}
          >
            <StepDot step={t.step} on={on} urgent={urgent} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[ad.navName, on && { color: "#fff" }]}>{t.name}</Text>
              {f ? (
                <Text style={[ad.navFlag, { color: on ? "#fff" : c2(f.tone) }]}>
                  {f.label} {f.n}
                </Text>
              ) : null}
            </View>
            <View style={[ad.navN, urgent && { backgroundColor: colors.dangerFill }, on && ad.navNOn]}>
              <Text style={[ad.navNText, (urgent || on) && { color: "#fff" }]}>{t.rows.length}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.page}
      contentContainerStyle={[styles.content, docked && ad.contentWide]}
      refreshControl={<RefreshControl refreshing={false} onRefresh={p.refresh} />}
      // มือถือ: ช่องค้นหาติดอยู่ใต้แถบหัว (ลูกตัวที่ 3 = แถวค้นหา — แบบหน้าเดิม)
      stickyHeaderIndices={!docked && rows && all.length ? [2] : undefined}
    >
      <View style={styles.head}>
        {docked ? <Text style={[styles.title, headingFont]}>งานของฉันวันนี้</Text> : null}
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>งานที่รอแอดมินทำ</Text>
        </View>
        {docked && rows && all.length ? p.searchBox : null}
      </View>
      {p.stats}
      {!docked && rows && all.length ? (
        <View style={styles.stickySearch}>
          {p.searchBox}
          {q ? (
            <Text style={[styles.foundText, !found && { color: colors.dangerInk }]}>
              {found ? `พบ ${found} จาก ${all.length} ใบ` : `ไม่พบใน ${all.length} ใบที่รอคุณ`}
            </Text>
          ) : null}
        </View>
      ) : null}
      {docked && q && found ? (
        <View style={styles.result}>
          <Text style={styles.resultText}>
            แสดง <Text style={{ fontWeight: "700" }}>{found} ใบ</Text> ที่ตรงกับ <Text style={{ fontWeight: "700" }}>“{query.trim()}”</Text> จากทั้งหมด{" "}
            {all.length} ใบ
          </Text>
          <TouchableOpacity style={styles.resultClear} onPress={() => p.setQuery("")} accessibilityLabel="ล้างคำค้นหา">
            <Text style={styles.resultClearText}>ล้างคำค้น</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {p.pickFlash ? <PickFlashBar flash={p.pickFlash} onClose={p.onFlashClose} /> : null}
      {p.error ? (
        <EmptyState icon="cloud-offline-outline" title="โหลดงานไม่ได้" text={p.error} />
      ) : !rows ? (
        <Spinner page color={colors.primary} />
      ) : docked ? (
        <View style={ad.split}>
          {nav}
          <View style={ad.pane} onLayout={(e) => setPaneW(Math.round(e.nativeEvent.layout.width))}>
            {body}
          </View>
        </View>
      ) : (
        body
      )}
      {p.modals}
    </ScrollView>
  );
}
const c2 = (tone: ChipTone) => (tone === "red" || tone === "redSoft" ? colors.dangerInk : tone === "amber" ? colors.warningInk : colors.textMuted);

/** วงกลมเลขขั้น — "!" ก่อนทุกขั้น (แดง) · ว่าง = อื่น ๆ */
function StepDot({ step, on, urgent }: { step: string; on?: boolean; urgent?: boolean }) {
  return (
    <View style={[ad.dot, urgent && { backgroundColor: colors.dangerFill }, on && { backgroundColor: "#fff" }]}>
      <Text style={[ad.dotText, urgent && { color: "#fff" }, on && { color: colors.navy }]}>{step || "…"}</Text>
    </View>
  );
}

/**
 * แถวของหัวข้อ (ที่ไม่ใช่รอเงิน — รอเงินใช้ PaymentRow ตัวเดียวกับแท็บในหน้าใบงานซ่อม)
 * จอคอมเป็นแถวตาราง (ตัวอย่าง) · มือถือเป็นการ์ดแบบเดิม · ป้าย/ข้อมูลเดิมของการ์ดยังอยู่ครบ (ด่วน · ย้อนขั้น · ไม่มีคนรับ ·
 * คำขอตรวจสอบ · ขอนัดด่วนใครขอเมื่อไร) · ปุ่มชุดเดิม (CardActions — ปุ่มขั้น · เลื่อนวันนัด · ตอบกลับ · แก้เป็นงานด่วน)
 */
function TopicRow({
  t,
  row: r,
  kind,
  wide,
  now,
  q,
  onOpen,
  onSend,
  onReply,
  onUrgent,
  onAnswerAsk,
  reload,
}: { t: Topic; row: WorkOrderRow; kind: RowKind; wide: boolean; now: number; q: string } & AdminTopicsProps) {
  const hot = r.priority === "URGENT";
  const work = [r.symptom || r.title, r.machineCode ? `เครื่อง ${machineTag(r.machineCode, r.machineCapacityKg)}` : null].filter(Boolean).join(" · ");
  const info = infoOf(t, r, kind, now);
  const tags = (
    <>
      {r.rolledBackFrom ? <Tag text="↩ ย้อนขั้นมา" fg={colors.rollbackInk} bg={colors.rollbackSoft} /> : null}
      {t.id !== "PARTS_SOURCING" && (r.partsOut ?? 0) > 0 ? <Tag text={`อะไหล่หมด ${r.partsOut}`} fg={colors.dangerInk} bg={colors.dangerSoft} /> : null}
      {r.orphan ? <Tag text="ไม่มีคนรับ" fg={colors.warningInk} bg={colors.warningSoft} /> : null}
      {r.overdue && kind !== "past" ? <Tag text="เลยนัด" fg={colors.dangerInk} bg={colors.dangerSoft} /> : null}
      {r.rescheduled ? <Tag text="เลื่อนวันนัด — คอนเฟิร์มวันใหม่" fg={colors.warningInk} bg={colors.warningSoft} /> : null}
      {kind !== "review" ? <AdminReviewTag review={r.adminReview} /> : null}
    </>
  );
  const actions = (
    <View {...(kind === "stage" ? howtoTarget("queue.actions") : null)} style={wide ? QUEUE_COL.actions : null}>
      <CardActions
        row={r}
        // คำขอตรวจสอบที่รอตอบ = ปุ่มตอบกลับ (ไม่ใช่ปุ่มขั้น) · ขอนัดด่วน/เลยนัดมีปุ่มของตัวเอง — ชนิดเดียวกับหัวข้อปักเดิม
        kind={kind === "stage" ? "stage" : kind}
        stageLabel={stageName(r.statusLabel)}
        isAdmin
        wide={wide}
        onOpen={onOpen}
        onSend={() => onSend(r)}
        onReply={() => onReply(r)}
        onUrgent={() => onUrgent(r)}
        onAnswerAsk={() => onAnswerAsk(r)}
        onChanged={reload}
      />
    </View>
  );
  const extra = (
    <>
      {r.orphan && r.orphanReason ? <Text style={styles.note}>{r.orphanReason}</Text> : null}
      {r.adminReview ? <AdminReviewBox review={r.adminReview} viewer="admin" /> : null}
    </>
  );
  if (wide) {
    return (
      <View style={ad.rowWrap} accessibilityLabel={`แถว ${r.code}`}>
        <View style={ad.tr}>
          <View style={[QUEUE_COL.code, { gap: 3, alignItems: "flex-start" }]}>
            <Hi text={r.code} q={q} style={[styles.code, headingFont]} />
            {hot ? (
              <View style={styles.tagHot}>
                <Text style={styles.tagHotText}>ด่วน</Text>
              </View>
            ) : null}
          </View>
          <View style={QUEUE_COL.branch}>
            <Hi text={`${r.branchCode} ${r.branchName}`} q={q} style={ad.branch} numberOfLines={2} />
          </View>
          <View style={QUEUE_COL.work}>
            <Hi text={work} q={q} style={ad.cell} numberOfLines={2} />
          </View>
          <View style={[QUEUE_COL.info, { gap: 2 }]}>
            <Text style={[ad.info, info.tone === "red" && { color: colors.dangerInk }, info.tone === "ask" && { color: colors.roleAdmin }]}>{info.main}</Text>
            {info.sub ? <Text style={ad.sub}>{info.sub}</Text> : null}
            {info.note ? <Text style={styles.cutCause}>{info.note}</Text> : null}
            <View style={styles.cardTop}>{tags}</View>
          </View>
          {actions}
        </View>
        {r.adminReview || (r.orphan && r.orphanReason) ? <View style={ad.rowExtra}>{extra}</View> : null}
      </View>
    );
  }
  return (
    <View style={[styles.card, hot && styles.cardHot, kind === "ask" && ad.cardAsk, kind === "past" && ad.cardPast]} accessibilityLabel={`แถว ${r.code}`}>
      <View style={styles.cardTop}>
        <Hi text={r.code} q={q} style={[styles.code, headingFont]} />
        {hot ? (
          <View style={styles.tagHot}>
            <Text style={styles.tagHotText}>ด่วน</Text>
          </View>
        ) : null}
        {tags}
        <View style={{ flex: 1 }} />
        <Text style={[styles.wait, rowDays(r) > STALE_DAYS && styles.waitLate]}>{stuckText(r)}</Text>
      </View>
      <Hi text={`${r.branchCode} ${r.branchName}`} q={q} style={styles.branch} numberOfLines={1} />
      <Hi text={work} q={q} style={styles.meta} numberOfLines={2} />
      <Text style={[ad.info, info.tone === "red" && { color: colors.dangerInk }, info.tone === "ask" && { color: colors.roleAdmin }]}>{info.main}</Text>
      {info.sub ? <Text style={ad.sub}>{info.sub}</Text> : null}
      {info.note ? <Text style={styles.cutCause}>{info.note}</Text> : null}
      {extra}
      {actions}
    </View>
  );
}

/** ข้อมูลของแถวตามหัวข้อ (คอลัมน์ "ทำไมต้องทำก่อน" / "วันตรวจ" / "อะไหล่" ฯลฯ ของตัวอย่าง) — คิดจากข้อมูลจริงของรายการเท่านั้น */
function infoOf(t: Topic, r: WorkOrderRow, kind: RowKind, now: number): { main: string; sub?: string; note?: string | null; tone?: "red" | "ask" } {
  if (kind === "ask") {
    const a = askRowLines(r, now);
    return a ? { main: `ขอนัดด่วน · ${a.appt}`, sub: a.who, note: a.note, tone: "ask" } : { main: "ขอนัดด่วน" };
  }
  if (kind === "past") {
    const day = r.scheduledAt?.slice(0, 10);
    return {
      main: [`เลยนัด`, day ? `${dayFull(day)} · ${timeText(r.scheduledTime)}` : null].filter(Boolean).join(" · "),
      // ค้างที่ขั้นไหน = ต้องตามใคร (ค้างโอน/เบิกคลังอื่น = ตามหัวหน้าภาค) แบบแถวกล่องงาน
      sub: `ค้างที่ ${r.statusLabel}`,
      tone: "red",
    };
  }
  if (kind === "review" && r.adminReview) {
    const a = r.adminReview;
    return {
      main: a.note ? `${a.reasonLabel} — “${a.note}”` : a.reasonLabel,
      sub: `ส่งมา ${dayTime(a.at)}${a.byName ? ` · ${a.byName}` : ""}`,
    };
  }
  const tag = r.partsState ? PARTS_TAG[r.partsState]?.text : undefined;
  const team = r.assignedTeam ? ` · ทีม${r.assignedTeam}` : "";
  switch (t.id) {
    case "INSPECT_CONFIRM":
      return { main: `${apptRel(r, now) ?? "ยังไม่มีวันตรวจ"}${team}`, sub: stuckText(r) };
    case "PARTS_SOURCING":
      return (r.partsOut ?? 0) > 0
        ? {
            main: `อะไหล่หมด ${r.partsOut} รายการ${r.partsExpectedAt ? ` · คาดเข้า ${thaiDate(r.partsExpectedAt.slice(0, 10))}` : ""}`,
            sub: stuckText(r),
            tone: "red",
          }
        : { main: "ยังไม่เช็คว่ามี/หมด", sub: stuckText(r) };
    case "AWAITING_QUOTE":
      return { main: stuckText(r), sub: tag, tone: rowDays(r) > STALE_DAYS ? "red" : undefined };
    case "PARTS_REQUESTED":
    case "AWAITING_CONFIRM":
      return { main: `นัด ${apptRel(r, now) ?? "—"}${team}`, sub: tag ?? stuckText(r) };
    default:
      return { main: stageName(r.statusLabel), sub: r.orphan ? undefined : stuckText(r) };
  }
}

/** แถบแจ้งผลรอบเลือกอะไหล่ (utils/flash) — หน้าเดิมกับหน้าแบบแยกหัวข้อของแอดมินใช้ตัวเดียวกัน */
function PickFlashBar({ flash, onClose }: { flash: QueueFlash; onClose: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.pickFlash, flash.kind === "returned" ? styles.pickFlashRed : styles.pickFlashGreen]}
      onPress={onClose}
      activeOpacity={0.8}
      accessibilityLabel="แถบแจ้งผลรายการอะไหล่"
    >
      <View role="status" accessibilityLiveRegion="polite" style={styles.pickFlashRow}>
        <Ionicons
          name={flash.kind === "returned" ? "arrow-undo" : "checkmark-circle"}
          size={18}
          color={flash.kind === "returned" ? colors.dangerInk : colors.successInk}
        />
        <Text style={[styles.pickFlashText, { color: flash.kind === "returned" ? colors.dangerInk : colors.successInk }]}>
          {flash.kind === "returned"
            ? `ตีกลับ ${flash.code} ให้ทีม${flash.team ?? "ที่ไปตรวจ"}แก้แล้ว — ใบงานกลับมาที่กล่องนี้เมื่อช่างส่งใหม่`
            : `คอนเฟิร์ม ${flash.code} แล้ว — ใบงานไปที่ ${flash.label}`}
        </Text>
        <Ionicons name="close" size={16} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
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
  onUrgent,
  onAnswerAsk,
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
  /** แอดมินแก้เป็นงานด่วน / ตอบคำขอนัดด่วน (การ์ดในหัวข้อ "ขอนัดด่วน") */
  onUrgent: () => void;
  onAnswerAsk: () => void;
  onChanged: () => Promise<void>;
}) {
  const { user } = useAuth();
  const detail = (
    <TouchableOpacity style={styles.detailBtn} onPress={() => onOpen(r.id)} accessibilityLabel={`รายละเอียด ${r.code}`}>
      <Ionicons name="document-text-outline" size={16} color={colors.navy} />
      <Text style={styles.detailText}>รายละเอียด</Text>
    </TouchableOpacity>
  );
  /**
   * คำขอตรวจสอบที่ยังไม่ตอบของใบที่ไปอยู่หัวข้อปักของเวลาปิดนัด — ปุ่มตอบกลับตามไปด้วย คำขอไม่ค้างเพราะใบย้ายหัวข้อ
   * (ใบอยู่หัวข้อเดียว คำขอนัดด่วน/เลยนัดมาก่อน — ดู ASK_GROUP)
   */
  const pendingReview = isAdmin && !!r.adminReview && !r.adminReview.answered;
  const reply = (full: boolean) => (
    <TouchableOpacity
      style={[full ? styles.goFull : styles.goBtn, styles.replyBtn]}
      onPress={onReply}
      accessibilityLabel={`ตรวจแล้ว ตอบกลับ ${r.code}`}
    >
      <Ionicons name="checkmark-circle" size={18} color="#fff" />
      <Text style={styles.goText}>ตรวจแล้ว · ตอบกลับ</Text>
    </TouchableOpacity>
  );

  /**
   * หัวข้อ "ขอนัดด่วน" (ตัวอย่าง appt-cutoff): [รายละเอียด] [ตอบกลับ] [แก้เป็นงานด่วน] — สองทางที่แอดมินเลือกได้อยู่บนการ์ดเลย
   * ดูในฐานะ/Admin Spare Part (canMoveDates ชุดเดียวกับหน้าใบงาน) ไม่มีสองปุ่มนี้ — กดแล้วเจอ 403 ดูเหมือนแอปเสีย
   * มือถือ: ปุ่มหลักขึ้นแถวของตัวเองเต็มความกว้าง (แบบ goFull) — สามปุ่มแถวเดียวไม่พอที่
   * "เลยนัด" ใช้ปุ่มแอดมินเดิมข้างล่าง (เลื่อนวันนัด + ขั้นของใบ) — ทางไปต่อของขั้นนั้นไม่เปลี่ยน
   */
  if (kind === "ask") {
    const canAct = canMoveDates(user);
    const answer = canAct ? (
      <TouchableOpacity style={[styles.sideBtn, styles.adminBtn]} onPress={onAnswerAsk} accessibilityLabel={`ตอบกลับคำขอนัดด่วน ${r.code}`}>
        <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.roleAdmin} />
        <Text style={[styles.sideText, { color: colors.roleAdmin }]} numberOfLines={1}>
          ตอบกลับ
        </Text>
      </TouchableOpacity>
    ) : null;
    const grant = (full: boolean) =>
      canAct ? (
        <TouchableOpacity style={full ? styles.goFull : styles.goBtn} onPress={onUrgent} accessibilityLabel={`แก้เป็นงานด่วน ${r.code}`}>
          <Ionicons name="lock-open-outline" size={18} color="#fff" />
          <Text style={styles.goText} numberOfLines={1}>
            แก้เป็นงานด่วน
          </Text>
        </TouchableOpacity>
      ) : null;
    if (wide) {
      return (
        <View style={styles.actions}>
          {detail}
          {answer}
          {grant(false)}
          {pendingReview ? reply(false) : null}
        </View>
      );
    }
    return (
      <View>
        <View style={styles.actions}>
          {detail}
          {answer ? <View style={{ flex: 1 }}>{answer}</View> : null}
        </View>
        {grant(true)}
        {pendingReview ? reply(true) : null}
      </View>
    );
  }
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

  // รอลูกค้าจ่ายเงิน: ชื่อขั้นคือสิ่งที่รอ ไม่ใช่สิ่งที่กด — ปุ่มบอกว่ากดเมื่อไร (ชื่อเดียวกับปุ่มหลักในหน้าใบงาน)
  const goLabel = r.status === "AWAITING_PAYMENT" ? PAY_GO_LABEL : stageLabel;
  const go = (
    <TouchableOpacity
      style={!wide && !isAdmin ? styles.goFull : styles.goBtn}
      onPress={() => onOpen(r.id, r.status === "IN_PROGRESS" ? "close" : "stage")}
      accessibilityLabel={`ทำขั้น ${goLabel} ${r.code}`}
    >
      <Ionicons name="arrow-forward-circle" size={18} color="#fff" />
      <Text style={styles.goText} numberOfLines={1}>
        {goLabel}
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
    // ใบเลยนัดที่มีคำขอตรวจสอบค้าง (อยู่หัวข้อ "เลยนัด" แทนหัวข้อคำขอ) — ตอบกลับได้จากการ์ดนี้
    const replyHere = kind === "past" && pendingReview;
    const row = (
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
        {replyHere && wide ? reply(false) : null}
      </View>
    );
    // มือถือ: สี่ปุ่มแถวเดียวไม่พอที่ — ปุ่มตอบกลับถูกบีบจนตัวหนังสือตกบรรทัดทีละตัวและกดแทบไม่ได้ จึงลงแถวของตัวเองเต็มความกว้าง
    // (แบบเดียวกับการ์ดขอนัดด่วนข้างบน)
    if (!replyHere || wide) return row;
    return (
      <View>
        {row}
        {reply(true)}
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
  // หัวข้อปักของแอดมิน — กรอบรอบทั้งกลุ่ม แยกจากกลุ่มตามขั้นได้ทันทีที่เปิดหน้า: ขอนัดด่วนสีม่วง (สีแอดมิน · ป้ายคำขอ) · เลยนัดแดงอ่อน
  groupAsk: {
    backgroundColor: colors.roleAdminSoft,
    borderWidth: 1.5,
    borderColor: colors.roleAdminLine,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  groupCut: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1.5,
    borderColor: colors.dangerInk,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  groupHint: { fontSize: 12.5, lineHeight: 19, color: colors.body },
  cutLines: { gap: 2 },
  cutWho: { fontSize: 12.5, lineHeight: 18, color: colors.body },
  cutWhen: { fontSize: 12.5, lineHeight: 18, fontWeight: "600", color: colors.dangerInk },
  cutCause: { fontSize: 12.5, lineHeight: 18, color: colors.text },
  askAppt: { fontSize: 12.5, lineHeight: 18, fontWeight: "700", color: colors.roleAdmin },
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
  // รอลูกค้าจ่ายเกินเส้น — การ์ดแดงจาง (ตัวอย่างกล่องงาน) ใบที่ควรตามลูกค้าเห็นจากสีโดยไม่ต้องอ่านเลข
  cardPayLate: { borderColor: colors.dangerLine, backgroundColor: colors.dangerSoft },
  lateChip: { borderRadius: 999, paddingHorizontal: 10, minHeight: 28, justifyContent: "center", borderWidth: 1, borderColor: colors.dangerFill, backgroundColor: colors.card },
  lateChipOn: { backgroundColor: colors.dangerFill },
  lateChipText: { fontSize: 12.5, lineHeight: 19, fontWeight: "700", color: colors.dangerInk },
  lateChipTextOn: { color: "#fff" },
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
  // การ์ดคอนเฟิร์มอะไหล่ — ป้าย "ช่างเลือก n รายการ" / "ส่งรอบที่ n" + บรรทัดรายการ
  pickTags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  pickLine: { fontSize: 13, lineHeight: 19, color: colors.text },
  // แถบแจ้งผลรอบเลือกอะไหล่ (ช่องที่ 1 ใต้แถวค้นหา)
  pickFlash: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  pickFlashRed: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerLine },
  pickFlashGreen: { backgroundColor: colors.successSoft, borderColor: colors.successLine },
  pickFlashRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  pickFlashText: { flex: 1, fontSize: 13.5, lineHeight: 20, fontWeight: "600" },
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

/** หน้าแบบแยกหัวข้อของแอดมิน (ตัวอย่าง myday) — แยกจาก styles ของหน้าเดิม หน้าของหัวหน้าภาค/Admin Spare Part ไม่ถูกแตะ */
const ad = StyleSheet.create({
  contentWide: { maxWidth: 1440 },
  split: { flexDirection: "row", alignItems: "flex-start", gap: spacing.lg },
  nav: {
    width: 270,
    flexShrink: 0,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: 10,
    gap: 4,
  },
  navItem: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10 },
  navHome: { backgroundColor: colors.primarySoft },
  navOn: { backgroundColor: colors.navyFill },
  navUrgent: { backgroundColor: colors.dangerSoft },
  navName: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.text },
  navFlag: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  navAll: { marginLeft: "auto", fontSize: 13, fontWeight: "700", color: colors.textMuted, fontVariant: ["tabular-nums"] },
  navHead: { fontSize: 11.5, lineHeight: 17, fontWeight: "700", letterSpacing: 0.4, color: colors.textMuted, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 4 },
  navN: { borderRadius: 999, paddingHorizontal: 9, backgroundColor: colors.rowAlt },
  navNOn: { backgroundColor: "rgba(255,255,255,0.18)" },
  navNText: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.body, fontVariant: ["tabular-nums"] },
  pane: { flex: 1, minWidth: 0 },
  dot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.rowAlt, alignItems: "center", justifyContent: "center" },
  dotText: { fontSize: 11.5, lineHeight: 16, fontWeight: "700", color: colors.body },
  firstBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerLine,
  },
  // ไม่มีใบต้องทำก่อน — แถบยังอยู่ที่เดิม (ตำแหน่งไม่กระโดด · สอนการใช้งานชี้ได้) แต่ไม่แดง
  firstBarCalm: { backgroundColor: colors.card, borderColor: colors.border },
  firstTitle: { fontSize: 17, lineHeight: 24, fontWeight: "700", color: colors.dangerInk },
  firstSub: { fontSize: 13, lineHeight: 19, color: colors.body },
  firstGo: { minHeight: 44, paddingHorizontal: 18, borderRadius: 10, backgroundColor: colors.dangerFill, justifyContent: "center" },
  firstGoText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
    ...shadow.card,
  },
  cardFlex: { flexGrow: 1, flexBasis: 230 },
  cardHot: { borderWidth: 2, borderColor: colors.dangerFill },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardStep: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.textMuted },
  cardN: { fontSize: 26, lineHeight: 32, fontWeight: "700", color: colors.navy, fontVariant: ["tabular-nums"] },
  cardName: { fontSize: 17, lineHeight: 24, fontWeight: "700", color: colors.text },
  cardWhat: { fontSize: 13, lineHeight: 19, color: colors.textMuted, minHeight: 38 },
  flags: { flexDirection: "row", flexWrap: "wrap", gap: 6, minHeight: 24 },
  flag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  flagText: { fontSize: 12, lineHeight: 18, fontWeight: "700", fontVariant: ["tabular-nums"] },
  cardOldest: { fontSize: 12.5, lineHeight: 18, color: colors.body, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  // หัวข้อว่าง — ยังอยู่ที่เดิม (ตำแหน่งไม่เปลี่ยนทุกวัน) แต่จาง
  dim: { opacity: 0.55 },
  list: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: "hidden" },
  listRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 58, paddingVertical: 8, paddingHorizontal: 14 },
  listLine: { borderTopWidth: 1, borderTopColor: colors.border },
  listName: { fontSize: 14.5, lineHeight: 21, fontWeight: "600", color: colors.text },
  listFlag: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  listN: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.navy, fontVariant: ["tabular-nums"] },
  foot: { fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  tHead: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md, flexWrap: "wrap" },
  tStep: { fontSize: 12.5, lineHeight: 18, fontWeight: "700", color: colors.textMuted },
  tName: { fontSize: 22, lineHeight: 30, fontWeight: "700", color: colors.text },
  tN: { fontSize: 17, color: colors.textMuted },
  tWhat: { fontSize: 14, lineHeight: 20, color: colors.body },
  back: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    justifyContent: "center",
  },
  backText: { fontSize: 13.5, fontWeight: "700", color: colors.navy },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.navyFill, borderColor: colors.navyFill },
  chipText: { fontSize: 13.5, lineHeight: 20, color: colors.body },
  chipN: { fontWeight: "700", fontVariant: ["tabular-nums"] },
  chipTextOn: { color: "#fff" },
  sortText: { fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  table: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: "hidden" },
  thead: { backgroundColor: colors.sky50, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 9 },
  th: { fontSize: 12, lineHeight: 18, fontWeight: "800", color: colors.textMuted },
  tr: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.md },
  rowWrap: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowExtra: { paddingHorizontal: spacing.md, paddingBottom: 10, gap: 6 },
  branch: { fontSize: 13.5, lineHeight: 19, fontWeight: "600", color: colors.text },
  cell: { fontSize: 13, lineHeight: 19, color: colors.body },
  info: { fontSize: 13, lineHeight: 19, fontWeight: "600", color: colors.text },
  sub: { fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  empty: { fontSize: 14, color: colors.textMuted, textAlign: "center", paddingVertical: spacing.xl },
  cardAsk: { borderColor: colors.roleAdminLine },
  cardPast: { borderColor: colors.dangerLine },
  resHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  resName: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: colors.navy },
  resN: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
});
