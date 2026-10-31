/**
 * งานของฉันวันนี้ — หน้าแรกของช่าง (เจ้าของงานเลือกแบบ Salesforce Field Service ต.ค. 69)
 *
 * ช่างเปิดแอปมาเจอหน้านี้เลย: งานที่ปล่อยให้ทีมแล้ว เรียงตามเวลานัด ปุ่มใหญ่ปุ่มเดียวตามจังหวะ
 * ถึงหน้างาน → ปิดงาน (ไม่มีปุ่มออกเดินทาง — เจ้าของงานเลือก) · ไม่เห็นขั้นของแอดมิน/หัวหน้าภาค
 * เดิมช่างต้องหาในกล่องงานที่มีแถบสิบขั้น ซึ่งเกือบทั้งหมดไม่ใช่เรื่องของช่าง
 *
 * ข้อมูลจาก GET /work-orders/my-day (เบา — เฉพาะงานของทีมตัวเอง) · ฟอร์มปิดงาน/ผลตรวจ/แจ้งปัญหา
 * ใช้ของหน้าใบงานเดิม (เปิดหน้าใบงานพร้อมสั่งให้เปิดฟอร์มเลย) ไม่ได้ทำฟอร์มซ้ำ
 */
import { useAuth } from "../context/AuthContext";
import MyQueue from "./MyQueue";
import { useDocked } from "../components/SideMenu";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { machineTag } from "../utils/machine";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Location from "expo-location";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { useRefreshHandler } from "../components/RefreshButton";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { dayLabel } from "../utils/customerMessage";
import { loadCloseDraft, missingItems, type CloseDraft } from "../utils/closeDraft";
import ClaimTrail, { dayTime, type TrailEvent } from "../components/claims/ClaimTrail";
import { PHONE_TEXT, SITE_TEXT, cardReasonLines, wholeLabels } from "../utils/claimFlags";
import { HomeStackParamList } from "../navigation/types";
import { colors, headingFont, radius, shadow, spacing } from "../theme";

type Props = NativeStackScreenProps<HomeStackParamList, "MyJobs">;

interface Job {
  id: number;
  code: string;
  status: string;
  inspect: boolean;
  done: boolean;
  urgent: boolean;
  jobType: string;
  symptom: string;
  contactName: string | null;
  contactPhone: string | null;
  scheduledAt: string | null;
  scheduledTime: string | null;
  closedAt: string | null;
  team: string | null;
  branchCode: string;
  branchName: string;
  latitude: number | null;
  longitude: number | null;
  machineCode: string | null;
  machineCapacityKg: number | null;
  parts: { name: string; quantity: number; unit: string | null }[];
  arrivedAt: string | null;
  /**
   * เคลมของใบนี้ (เคลมก้อน 1) — การ์ดรอตรวจ/ถูกตีกลับวาดจากตรงนี้ · null/ไม่มี = ไม่มีเคลม หรือเซิร์ฟเวอร์รุ่นเก่า
   * state: REVIEW รอ Admin Spare Part · REJECTED ถูกตีกลับรอช่างแก้ · APPROVED/DECLINED จบแล้ว
   */
  claim?: ClaimInfo | null;
}

interface ClaimInfo {
  state: "REVIEW" | "REJECTED" | "APPROVED" | "DECLINED" | null;
  /** จำนวนชิ้นที่ส่งเคลมในรอบล่าสุด */
  parts: number;
  /** ส่งครั้งที่เท่าไร (1 = ส่งครั้งแรก) */
  round: number;
  sentAt: string | null;
  rejectedAt: string | null;
  reviewerName: string | null;
  /**
   * ทุกชิ้นที่ถูกตีกลับ พร้อมเหตุผล · fieldLabels = ชื่อช่องของชิ้นนั้นที่ผู้ตรวจติ๊กเอง (เคลมก้อน 4 · ไม่รวมช่องของเครื่อง)
   * ผู้ตรวจไม่ได้พิมพ์เหตุผล เซิร์ฟเวอร์เขียนชื่อช่องแทนลง reason — การ์ดแยกออกแล้วขึ้นเป็นชื่อช่อง (cardReasonLines)
   */
  reasons: { partLabel: string; reason: string; fieldLabels?: string[] }[];
  trail: TrailEvent[];
  /** ผลสุดท้ายทีละชิ้นของใบที่จบแล้ว (เคลมก้อน 3) — ผ่าน / ปิดเคลม ไม่ส่งผู้ขาย พร้อมเหตุผล · เซิร์ฟเวอร์รุ่นเก่าไม่ส่ง */
  outcome?: { partLabel: string; status: "APPROVED" | "DECLINED"; reason?: string | null }[];
  // ── ตีกลับแบบชี้ช่อง (เคลมก้อน 4) — เซิร์ฟเวอร์รุ่นก่อนไม่ส่ง การ์ดขึ้นแบบเดิม ──
  /** จำนวนช่องที่ต้องแก้ (ช่องของชิ้นนับทีละชิ้น · ช่องของเครื่องนับครั้งเดียว) */
  fields?: number | null;
  /** มีช่องไฟล์ = ต้องกลับไปถ่ายที่หน้าเครื่อง · ตีกลับแบบเก่าที่ไม่ได้ชี้ช่อง = null (ไม่รู้ ไม่บอก) */
  needsSite?: boolean | null;
  /** ตีกลับทั้งใบ — ชื่อช่องของเครื่องที่ต้องแก้ (ไม่ใช่ทั้งใบ = null) */
  whole?: string[] | boolean | string | null;
}

type Tab = "today" | "tomorrow" | "late";

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });

function addDay(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * พิกัดตอนกดถึงหน้างาน — ไม่ได้ก็ไม่เป็นไร (ปิด GPS · ไม่อนุญาต · คอมไม่มี GPS) เซิร์ฟเวอร์บันทึกว่าไม่มีพิกัด
 * ไม่บล็อกช่าง: GPS ในร้าน/ห้างคลาดบ่อย ระบบแค่บันทึกตามจริงให้ตรวจย้อนหลังได้
 */
async function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const p = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((r) => setTimeout(() => r(null), 12_000)),
    ]);
    return p ? { latitude: p.coords.latitude, longitude: p.coords.longitude } : null;
  } catch {
    return null;
  }
}

/**
 * ทุกตำแหน่งเปิดแอปมาที่หน้านี้ (ต.ค. 69) แต่ "งานของฉัน" ของแต่ละตำแหน่งไม่เหมือนกัน (เจ้าของงานกำหนด):
 * ช่าง = งานหน้าร้านที่ปล่อยให้ทีมแล้ว (ด้านล่าง) · แอดมิน/หัวหน้าภาค = ใบที่ค้างรอตัวเองทำ (MyQueue)
 * แยกเป็นคอมโพเนนต์คนละตัว — ดูในฐานะคนอื่นแล้วตำแหน่งเปลี่ยน hook ไม่ปนกัน
 */
export default function MyJobsScreen(props: Props) {
  const { user } = useAuth();
  if (user && user.role !== "EMPLOYEE") {
    return (
      <MyQueue
        onOpen={(id, open) => props.navigation.navigate("WorkOrderDetail", { id, ...(open ? { open } : {}) })}
        onSearchAll={(q) => props.navigation.navigate("WorkOrderList", { search: q })}
      />
    );
  }
  return <TechJobs {...props} />;
}

function TechJobs({ navigation }: Props) {
  const { docked } = useDocked();
  const { user } = useAuth();
  // คนที่เห็นงานหลายทีม (Senior ช่าง · ทีมรวม) ต้องรู้ว่างานนี้ของทีมไหน — วันหนึ่งมีงานจากสามสี่ทีมปนกัน
  // ช่างทีมเดียวไม่ต้องเห็น ทุกใบเป็นทีมตัวเองอยู่แล้ว
  const cov = user?.teamCoverage;
  const manyTeams = !!user?.seniorTech || !!cov?.all || (cov?.teams.length ?? 0) > 1;
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  /**
   * ร่างฟอร์มปิดงานที่กรอกค้างไว้ในเครื่องนี้ (utils/closeDraft) — การ์ดบอก "กรอกค้างไว้ — ยังขาด n อย่าง"
   * ช่างที่ออกจากฟอร์มกลางทาง (โทรศัพท์เข้า แอปหลุด) กลับมาแล้วรู้ว่าของที่กรอกยังอยู่ ไม่ต้องเริ่มใหม่
   */
  const [drafts, setDrafts] = useState<Record<number, CloseDraft | null>>({});
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setError(null);
    try {
      const res = await api.get<{ today: string; rows: Job[] }>("/work-orders/my-day");
      if (n !== seq.current) return;
      setJobs(res.data.rows);
      setToday(res.data.today);
      // ร่างอยู่ในเครื่อง อ่านเร็ว — อ่านทุกครั้งที่กลับมาหน้านี้ (เพิ่งออกจากฟอร์มปิดงาน)
      const open = res.data.rows.filter((j) => !j.done && !j.inspect);
      const got = await Promise.all(open.map(async (j) => [j.id, await loadCloseDraft(j.id)] as const));
      if (n === seq.current) setDrafts(Object.fromEntries(got));
    } catch (e) {
      if (n === seq.current) setError(apiErrorMessage(e));
    }
  }, []);
  // กลับมาจากหน้าใบงาน (เพิ่งปิดงาน) ต้องเห็นสถานะใหม่ทันที
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useRefreshHandler(async () => {
    await load();
  });

  const groups = useMemo(() => {
    const out: Record<Tab, Job[]> = { today: [], tomorrow: [], late: [] };
    if (!jobs || !today) return out;
    const tomorrow = addDay(today, 1);
    for (const j of jobs) {
      // ปิดแล้ววันนี้ = อยู่วันนี้เสมอ (ขึ้น ✓ ให้เห็นว่าทำไปกี่งาน) · ไม่มีวันนัด = ถือเป็นงานวันนี้
      if (j.done || !j.scheduledAt || j.scheduledAt === today) out.today.push(j);
      else if (j.scheduledAt < today) out.late.push(j);
      else if (j.scheduledAt === tomorrow) out.tomorrow.push(j);
    }
    // งานที่ยังทำอยู่ขึ้นก่อนงานที่ปิดแล้ว เรียงตามเวลานัดภายในกลุ่ม (เซิร์ฟเวอร์เรียงมาแล้ว)
    out.today.sort((a, b) => Number(a.done) - Number(b.done));
    return out;
  }, [jobs, today]);

  async function arrive(job: Job) {
    setBusyId(job.id);
    try {
      const pos = await currentPosition();
      const res = await api.post<{ note: string; withinRadius: boolean | null }>(`/work-orders/${job.id}/arrive`, pos ?? {});
      // นอกรัศมีไม่บล็อก แต่บอกให้รู้ว่าระบบบันทึกไว้แบบนั้น
      if (res.data.withinRadius === false) showAlert("บันทึกแล้ว — อยู่นอกรัศมีสาขา", res.data.note);
      await load();
    } catch (e) {
      showAlert("บันทึกไม่ได้", apiErrorMessage(e));
      // 409 = งานไม่อยู่ในมือช่างแล้ว (แอดมินเลื่อนวันนัดดึงงานคืน · มีคนเปลี่ยนขั้น) — โหลดรายการใหม่
      // ไม่งั้นการ์ดเดิมยังค้างพร้อมปุ่ม "ถึงหน้างาน" ที่กดกี่ครั้งก็ไม่ผ่าน จนกว่าจะออกจากหน้านี้แล้วกลับมา
      if ((e as { response?: { status?: number } })?.response?.status === 409) await load();
    } finally {
      setBusyId(null);
    }
  }

  const open = (job: Job, what?: "close" | "stage" | "problem") =>
    navigation.navigate("WorkOrderDetail", { id: job.id, ...(what ? { open: what } : {}) });

  const list = groups[tab];
  const TABS: { value: Tab; label: string }[] = [
    { value: "today", label: "วันนี้" },
    { value: "tomorrow", label: "พรุ่งนี้" },
    { value: "late", label: "ค้าง" },
  ];

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
    >
      <View style={styles.head}>
        {/* จอแคบ: ชื่อหน้าอยู่บนแถบหัวแล้ว ไม่พิมพ์ซ้ำตัวใหญ่ (เจ้าของงานขอ ต.ค. 69) */}
        {docked ? <Text style={[styles.title, headingFont]}>งานของฉัน</Text> : null}
        {today ? (
          <View style={styles.datePill}>
            <Text style={styles.datePillText}>{dayLabel(today)}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.seg}>
        {TABS.map((t) => {
          const on = tab === t.value;
          const n = groups[t.value].filter((j) => !j.done).length;
          return (
            <TouchableOpacity
              key={t.value}
              style={[styles.segItem, on && styles.segOn]}
              onPress={() => setTab(t.value)}
              accessibilityLabel={`แท็บ ${t.label} ${n} งาน`}
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.segText, on && styles.segTextOn, t.value === "late" && n > 0 && !on && { color: colors.danger }]}>
                {t.label} {n}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={load}>
            <Text style={styles.retry}>ลองใหม่</Text>
          </TouchableOpacity>
        </View>
      ) : !jobs ? (
        <Spinner page color={colors.primary} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="sunny-outline"
          title={tab === "today" ? "วันนี้ยังไม่มีงานที่ปล่อยให้ทีม" : tab === "tomorrow" ? "พรุ่งนี้ยังไม่มีงานที่ปล่อยแล้ว" : "ไม่มีงานค้าง"}
          text={tab === "late" ? "งานที่นัดผ่านไปแล้วแต่ยังไม่ปิดจะขึ้นที่นี่" : "หัวหน้าภาคปล่อยงานแล้วจะขึ้นที่นี่ทันที"}
        />
      ) : (
        list.map((j) => (
          <JobCard
            key={j.id}
            job={j}
            late={tab === "late"}
            showTeam={manyTeams}
            busy={busyId === j.id}
            today={today}
            draft={drafts[j.id] ?? null}
            onArrive={() => arrive(j)}
            onOpen={(w) => open(j, w)}
          />
        ))
      )}
    </ScrollView>
  );
}

/** วันตามเวลาไทยของเวลาหนึ่ง (YYYY-MM-DD) — นับ "รอมากี่วัน" แบบปฏิทิน ส่งเมื่อวาน 23:00 = 1 วัน ไม่ใช่ 0 */
function bkkDay(iso: string) {
  return new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);
}
function daysSince(iso: string | null, today: string | null) {
  if (!iso || !today || Number.isNaN(Date.parse(iso))) return 0;
  return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${bkkDay(iso)}T00:00:00Z`)) / 86_400_000));
}

/**
 * บรรทัด "กรอกค้างไว้" จากร่างในเครื่อง — ฟอร์มนับไว้ตอนบันทึกร่างว่ายังขาดกี่อย่าง (ไม่ต้องโหลดใบงานมานับซ้ำ)
 * ร่างรุ่นเก่าที่ไม่ได้นับไว้ไม่ขึ้นบรรทัดนี้ — บอกตัวเลขผิดแย่กว่าไม่บอก
 */
function DraftLine({ draft, button }: { draft: CloseDraft | null; button: string }) {
  const miss = missingItems(draft);
  if (!miss) return null;
  const text = miss.length
    ? `กรอกค้างไว้ — ยังขาด ${miss.length} อย่าง ข้อมูลยังอยู่ครบ`
    : draft?.claiming
      ? `กรอกครบแล้ว — กด “${button}” แล้วส่งเคลม`
      : `กรอกครบแล้ว — กด “${button}” ได้เลย`;
  return (
    <Text style={styles.draftLine}>{text}</Text>
  );
}

/** ปุ่มเล็กใต้การ์ด — นำทาง · โทร · รายละเอียด (callText = ข้อความบนปุ่มโทร · การ์ดปกติโชว์เบอร์) */
function SmallActions({ job, onOpen, callText }: { job: Job; onOpen: () => void; callText?: string }) {
  const map =
    job.latitude != null && job.longitude != null ? `https://maps.google.com/?q=${job.latitude},${job.longitude}` : null;
  return (
    <View style={styles.small}>
      {job.contactPhone && callText ? (
        <TouchableOpacity
          style={styles.smallBtn}
          onPress={() => Linking.openURL(`tel:${job.contactPhone!.replace(/[^\d+]/g, "")}`)}
          accessibilityLabel={`โทรร้าน ${job.contactPhone}`}
        >
          <Ionicons name="call-outline" size={15} color={colors.primaryInk} />
          <Text style={styles.smallText}>{callText}</Text>
        </TouchableOpacity>
      ) : null}
      {map ? (
        <TouchableOpacity style={styles.smallBtn} onPress={() => Linking.openURL(map)} accessibilityLabel={`นำทางไป ${job.branchName}`}>
          <Ionicons name="navigate-outline" size={15} color={colors.primaryInk} />
          <Text style={styles.smallText}>นำทาง</Text>
        </TouchableOpacity>
      ) : null}
      {job.contactPhone && !callText ? (
        <TouchableOpacity
          style={styles.smallBtn}
          onPress={() => Linking.openURL(`tel:${job.contactPhone!.replace(/[^\d+]/g, "")}`)}
          accessibilityLabel={`โทรร้าน ${job.contactPhone}`}
        >
          <Ionicons name="call-outline" size={15} color={colors.primaryInk} />
          <Text style={styles.smallText}>{job.contactPhone}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={styles.smallBtn} onPress={onOpen} accessibilityLabel={`รายละเอียด ${job.code}`}>
        <Ionicons name="document-text-outline" size={15} color={colors.primaryInk} />
        <Text style={styles.smallText}>รายละเอียด</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * การ์ดแดง "ถูกตีกลับมาให้ช่างแก้" — หน้าตาเดียวทุกเรื่องที่ถูกส่งกลับ (กรอบแดง 2 px · ชิปแดง · เหตุผล · ปุ่มใหญ่ปุ่มเดียว)
 * ทำเป็นตัวกลางเพราะมีมากกว่าหนึ่งเรื่องที่ตีกลับมาหาช่าง (เคลมถูกตีกลับ · อะไหล่ถูกตีกลับที่จะตามมา)
 * ช่างควรจำได้จากหน้าตาว่า "การ์ดแดง = มีของต้องแก้" ไม่ต้องอ่านว่าเป็นเรื่องอะไรก่อน
 */
export function SentBackCard({
  label,
  chip,
  at,
  title,
  reason,
  children,
  action,
  footer,
}: {
  /** ชื่อการ์ดสำหรับโปรแกรมอ่านจอ/เทสต์ เช่น "งาน WO-01208" */
  label: string;
  chip: string;
  /** มุมขวาบน เช่น เวลาที่ถูกตีกลับ */
  at?: string | null;
  title: string;
  /** บรรทัดเหตุผล (แดงเข้ม) */
  reason: string;
  /** บรรทัดเพิ่ม + ปุ่มเล็ก (อยู่ระหว่างเหตุผลกับปุ่มใหญ่) */
  children?: React.ReactNode;
  action: { label: string; onPress: () => void };
  /** ท้ายการ์ด เช่น แถบสถานะ */
  footer?: React.ReactNode;
}) {
  return (
    <View style={[styles.card, styles.cardSentBack]} accessibilityLabel={label}>
      <View style={styles.cardTop}>
        <View style={styles.sentBackChip}>
          <Text style={styles.sentBackChipText}>{chip}</Text>
        </View>
        <View style={{ flex: 1 }} />
        {at ? <Text style={styles.cornerTime}>{at}</Text> : null}
      </View>
      <Text style={styles.branch}>{title}</Text>
      <Text style={styles.sentBackReason}>{reason}</Text>
      {children}
      <TouchableOpacity style={[styles.big, styles.bigSentBack]} onPress={action.onPress} accessibilityLabel={action.label}>
        <Ionicons name="create-outline" size={20} color="#fff" />
        <Text style={styles.bigText}>{action.label}</Text>
      </TouchableOpacity>
      {footer}
    </View>
  );
}

function JobCard({
  job,
  late,
  showTeam,
  busy,
  today,
  draft,
  onArrive,
  onOpen,
}: {
  job: Job;
  late: boolean;
  showTeam: boolean;
  busy: boolean;
  today: string | null;
  draft: CloseDraft | null;
  onArrive: () => void;
  onOpen: (what?: "close" | "stage" | "problem") => void;
}) {
  const arrived = !!job.arrivedAt;
  const claim = job.claim ?? null;
  // Senior ช่าง/ทีมรวมเห็นงานหลายทีมปนกัน — การ์ดเคลมต้องบอกทีมเหมือนการ์ดปกติ ไม่งั้นไม่รู้ว่าใบแดงนี้ทีมไหนต้องแก้
  const teamTag = showTeam && job.team ? ` · ทีม${job.team}` : "";

  /**
   * เคลมถูกตีกลับ — ใบกลับมาอยู่ในมือช่าง (เข้างานแล้ว) แต่สิ่งที่ต้องทำคือแก้เคลม ไม่ใช่ "ปิดงาน" ใบใหม่
   * เดิมการ์ดหน้าตาเหมือนงานปกติ ช่างไม่รู้ว่าโดนตีกลับจนกว่าจะเปิดใบ (บางคนคิดว่าระบบค้าง) — แดงทั้งการ์ด
   * บอกเหตุผลทุกชิ้นตรงการ์ด กดปุ่มเดียวไปฟอร์มแก้ (ตัวอย่างที่เจ้าของงานเลือก ต.ค. 69)
   */
  if (claim?.state === "REJECTED" && !job.done) {
    /**
     * ตีกลับทั้งใบ (เคลมก้อน 4): ขึ้น "ทั้งใบ (ข้อมูลเครื่อง) — {ช่อง} ต้องแก้" ก่อน (ตัวอย่าง rejReason)
     * ชิ้นที่ถูกพาไปเพราะทั้งใบอย่างเดียว (เหตุผลเป็นแค่ชื่อช่องของเครื่อง) ไม่ขึ้นซ้ำ — ช่างจะนึกว่ามีอีกเรื่องต้องแก้
     */
    const reasons = cardReasonLines(claim.reasons ?? [], wholeLabels(claim.whole))
      .map((l) => `${l.part} — ${l.reason}`)
      .join(" / ");
    const n = (claim.reasons ?? []).length || claim.parts;
    const fields = typeof claim.fields === "number" && claim.fields > 0 ? claim.fields : null;
    return (
      <SentBackCard
        label={`งาน ${job.code}`}
        chip="เคลมถูกตีกลับ"
        at={dayTime(claim.rejectedAt)}
        title={`${job.branchCode} · ${job.branchName} · ${job.code}${teamTag}`}
        reason={`Admin Spare Part: “${reasons || "—"}”`}
        action={{ label: "แก้เคลม", onPress: () => onOpen("close") }}
        footer={<ClaimTrail trail={claim.trail} tail="รอช่างแก้" tailColor={colors.dangerInk} />}
      >
        <Text style={styles.sentBackCount}>{fields ? `ต้องแก้ ${n} ชิ้น · ${fields} ช่อง` : `ต้องแก้ ${n} ชิ้น`}</Text>
        {/* รู้ตั้งแต่เห็นการ์ดว่าต้องออกไปร้านไหม — ช่องไฟล์ = ถ่ายใหม่ที่หน้าเครื่อง (ตัวอย่าง visit) · ตีกลับแบบเก่าไม่รู้ ไม่บอก */}
        {claim.needsSite === true || claim.needsSite === false ? (
          <View style={[styles.visit, claim.needsSite ? styles.visitSite : styles.visitPhone]}>
            <Ionicons
              name={claim.needsSite ? "location-outline" : "phone-portrait-outline"}
              size={16}
              color={claim.needsSite ? colors.dangerInk : colors.successInk}
            />
            <Text style={[styles.visitText, { color: claim.needsSite ? colors.dangerInk : colors.successInk }]}>
              {claim.needsSite ? SITE_TEXT : PHONE_TEXT}
            </Text>
          </View>
        ) : null}
        <DraftLine draft={draft} button="แก้เคลม" />
        <SmallActions job={job} onOpen={() => onOpen()} callText="โทร" />
      </SentBackCard>
    );
  }

  /**
   * ตรวจเคลมจบแล้ววันนี้ (เคลมก้อน 3 · ตัวอย่าง cardApproved) — บอกผลทีละชิ้น ไม่ใช่แค่ "ปิดงานแล้ว"
   * ช่างต้องรู้ว่าชิ้นไหนผ่าน (อะไหล่เก่าไปผู้ขาย) ชิ้นไหนถูกปิดเคลมเพราะอะไร — ไม่ต้องโทรถาม Admin Spare Part
   * ไม่มีชิ้นไหนผ่าน = ไม่ใช้คำว่าอนุมัติ (ไม่มีใบเคลมออกไป) แต่การ์ดยังเขียวตามตัวอย่าง — ตรวจจบแล้ว ไม่ใช่เรื่องที่ต้องตามต่อ
   */
  if (job.done && job.status === "DONE" && claim && (claim.state === "APPROVED" || claim.state === "DECLINED")) {
    const ok = (claim.outcome ?? []).filter((o) => o.status === "APPROVED");
    const dropped = (claim.outcome ?? []).filter((o) => o.status === "DECLINED");
    const approved = claim.state === "APPROVED" || ok.length > 0;
    const decidedAt = [...(claim.trail ?? [])].reverse().find((e) => e.k === "approve" || e.k === "close")?.at ?? job.closedAt;
    return (
      <View style={[styles.card, styles.cardApproved]} accessibilityLabel={`งาน ${job.code}`}>
        <View style={styles.cardTop}>
          <View style={styles.apprChip}>
            <Text style={styles.apprChipText}>{approved ? "✓ อนุมัติเคลมแล้ว · ปิดงาน" : "✓ ปิดงานแล้ว · ปิดเคลม ไม่ส่งผู้ขาย"}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {decidedAt ? <Text style={styles.cornerTime}>{dayTime(decidedAt)}</Text> : null}
        </View>
        <Text style={styles.branch}>
          {job.branchCode} · {job.branchName}
        </Text>
        <Text style={styles.meta}>
          {job.code}
          {teamTag} ·{" "}
          {ok.length ? `อนุมัติ ${ok.length} ชิ้น: ${ok.map((o) => o.partLabel).join(" · ")}` : approved ? "อนุมัติเคลมแล้ว" : "ไม่มีชิ้นที่ส่งผู้ขาย"}
        </Text>
        {dropped.length ? (
          <Text style={styles.apprDrop}>
            ปิดเคลม ไม่ส่งผู้ขาย: {dropped.map((o) => `${o.partLabel}${o.reason ? ` (${o.reason})` : ""}`).join(" · ")}
          </Text>
        ) : null}
        <ClaimTrail trail={claim.trail} />
      </View>
    );
  }

  /**
   * ส่งเคลมแล้ว รอ Admin Spare Part ตรวจ — เซิร์ฟเวอร์นับว่าจบจากมือช่างแล้ว (done) แต่ยังไม่ใช่ปิดงาน
   * เดิมขึ้น "✓ ปิดงานแล้ว" ช่างเลยไม่รู้ว่าใบนี้ยังอาจถูกตีกลับมาให้แก้ (เจ้าของงานเลือกข้อความนี้จากตัวอย่าง ต.ค. 69)
   * การ์ดไม่จางแบบงานที่จบแล้ว — ยังเป็นเรื่องที่ช่างต้องติดตาม · บอกว่าส่งรอบไหน รอมากี่วัน
   */
  const review = job.status === "CLAIM_REVIEW";
  if (review && claim) {
    const resent = claim.round > 1;
    return (
      <View style={[styles.card, styles.cardReview]} accessibilityLabel={`งาน ${job.code}`}>
        <View style={styles.cardTop}>
          <View style={styles.reviewChip}>
            <Text style={styles.reviewChipText}>รอตรวจเคลม</Text>
          </View>
          <View style={{ flex: 1 }} />
          {claim.sentAt ? <Text style={styles.cornerTime}>{`${resent ? "ส่งใหม่" : "ส่งเคลม"} ${dayTime(claim.sentAt)}`}</Text> : null}
        </View>
        <Text style={styles.branch}>
          {job.branchCode} · {job.branchName}
        </Text>
        <Text style={styles.meta}>
          {job.code}
          {teamTag} ·{" "}
          {resent ? `ส่งเคลมใหม่ (รอบ ${claim.round}) · รอ Admin Spare Part ตรวจ` : `ส่งเคลม ${claim.parts} ชิ้น · รอ Admin Spare Part ตรวจ`}
        </Text>
        <ClaimTrail trail={claim.trail} tail={`รอ Admin Spare Part ตรวจ · ${daysSince(claim.sentAt, today)} วัน`} />
        <Text style={styles.reviewNote}>ยังไม่นับว่าปิดงาน จนกว่าจะอนุมัติ — อาจถูกตีกลับมาให้แก้</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.card, arrived && !job.done && styles.cardNow, job.done && !review && styles.cardDone, review && styles.cardReview]}
      accessibilityLabel={`งาน ${job.code}`}
    >
      <View style={styles.cardTop}>
        <Text style={styles.time}>{job.scheduledTime ?? "ทั้งวัน"}</Text>
        {late && job.scheduledAt ? <Text style={styles.lateText}>นัด {dayLabel(job.scheduledAt)}</Text> : null}
        {job.urgent ? (
          <View style={styles.urgent}>
            <Text style={styles.urgentText}>● ด่วน</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {review ? (
          <View style={styles.reviewChip}>
            <Text style={styles.reviewChipText}>รอตรวจเคลม</Text>
          </View>
        ) : job.done ? (
          <Text style={styles.doneText}>✓ ปิดงานแล้ว{job.closedAt ? ` ${hhmm(job.closedAt)}` : ""}</Text>
        ) : arrived ? (
          <View style={styles.arrivedPill}>
            <Text style={styles.arrivedText}>ถึงหน้างาน {hhmm(job.arrivedAt!)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.branch}>
        {job.branchCode} {job.branchName}
      </Text>
      <Text style={styles.meta}>
        {job.code}
        {teamTag} · {job.inspect ? "ตรวจหน้างาน" : job.jobType === "PM" ? "งาน PM" : "งานซ่อม"}
        {job.machineCode ? ` · เครื่อง ${machineTag(job.machineCode, job.machineCapacityKg)}` : " · ทั้งสาขา"}
        {job.symptom ? ` · ${job.symptom}` : ""}
      </Text>
      {job.parts.length ? (
        <Text style={styles.meta}>อะไหล่: {job.parts.map((p) => `${p.name} x${p.quantity}${p.unit ? ` ${p.unit}` : ""}`).join(", ")}</Text>
      ) : null}
      {review ? <Text style={styles.reviewNote}>ยังไม่นับว่าปิดงาน จนกว่าจะอนุมัติ — อาจถูกตีกลับมาให้แก้</Text> : null}

      {job.done ? null : (
        <>
          {arrived && !job.inspect ? <DraftLine draft={draft} button="ปิดงาน" /> : null}
          <SmallActions job={job} onOpen={() => onOpen()} />
          {/* ปุ่มใหญ่ปุ่มเดียวตามจังหวะ — ยังไม่ถึง: ถึงหน้างาน · ถึงแล้ว: ปิดงาน (ตรวจหน้างาน: บันทึกผลตรวจ) */}
          {arrived ? (
            <TouchableOpacity
              style={[styles.big, styles.bigClose]}
              onPress={() => onOpen(job.inspect ? "stage" : "close")}
              accessibilityLabel={job.inspect ? "บันทึกผลตรวจ" : "ปิดงาน"}
            >
              <Ionicons name="checkmark-done" size={20} color="#fff" />
              <Text style={styles.bigText}>{job.inspect ? "บันทึกผลตรวจ" : "ปิดงาน"}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.big, busy && { opacity: 0.6 }]} onPress={onArrive} disabled={busy} accessibilityLabel="ถึงหน้างาน">
              {busy ? <Spinner color="#fff" size="small" /> : <Ionicons name="location" size={20} color="#fff" />}
              <Text style={styles.bigText}>{busy ? "กำลังเช็คพิกัด…" : "ถึงหน้างาน"}</Text>
            </TouchableOpacity>
          )}
          {arrived && !job.inspect ? (
            <TouchableOpacity onPress={() => onOpen("problem")} accessibilityLabel="แจ้งปัญหาหน้างาน">
              <Text style={styles.problem}>แจ้งปัญหาหน้างาน (ปิดงานไม่ได้)</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, maxWidth: 720, width: "100%", alignSelf: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  title: { fontSize: 24, lineHeight: 34, fontWeight: "700", color: colors.text },
  datePill: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 12 },
  datePillText: { fontSize: 13, lineHeight: 24, fontWeight: "700", color: colors.primaryInk },
  seg: {
    flexDirection: "row",
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 4,
  },
  segItem: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: radius.sm },
  segOn: { backgroundColor: colors.primaryDark },
  segText: { fontSize: 14.5, lineHeight: 22, fontWeight: "700", color: colors.textMuted },
  segTextOn: { color: "#fff" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
    ...shadow.card,
  },
  cardNow: { borderWidth: 2, borderColor: colors.primary },
  cardDone: { opacity: 0.6 },
  cardReview: { borderWidth: 2, borderColor: colors.warning },
  cardApproved: { borderWidth: 2, borderColor: colors.successFill },
  // พื้นเขียวเข้มทั้งสองโหมด — successInk โหมดมืดเป็นมิ้นต์อ่อน ตัวขาวบนนั้นอ่านไม่ออก
  apprChip: { backgroundColor: colors.successFill, borderRadius: 999, paddingHorizontal: 10 },
  apprChipText: { fontSize: 13, lineHeight: 22, fontWeight: "700", color: "#fff" },
  apprDrop: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.body,
    backgroundColor: colors.rowAlt,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: "hidden",
  },
  cardSentBack: { borderWidth: 2, borderColor: colors.danger },
  sentBackChip: { backgroundColor: colors.dangerFill, borderRadius: 999, paddingHorizontal: 10 },
  sentBackChipText: { fontSize: 13, lineHeight: 22, fontWeight: "800", color: "#fff" },
  sentBackReason: { fontSize: 14, lineHeight: 21, color: colors.dangerInk },
  sentBackCount: { fontSize: 14, lineHeight: 21, color: colors.text },
  // ต้องไปร้านไหม — แดงอ่อน = ต้องกลับไปถ่ายที่หน้าเครื่อง · เขียวอ่อน = แก้จากมือถือได้ (ตัวอย่าง visitFg/visitBg) ตัวเข้มบนพื้นอ่อน
  visit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  visitSite: { backgroundColor: colors.dangerSoft },
  visitPhone: { backgroundColor: colors.successSoft },
  visitText: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
  bigSentBack: { backgroundColor: colors.dangerFill },
  cornerTime: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  draftLine: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: colors.successInk,
    backgroundColor: colors.successSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reviewChip: {
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 999,
    paddingHorizontal: 10,
  },
  reviewChipText: { fontSize: 13, lineHeight: 22, fontWeight: "700", color: colors.warningInk },
  reviewNote: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  time: { fontSize: 20, lineHeight: 28, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
  lateText: { fontSize: 12.5, fontWeight: "700", color: colors.dangerInk },
  urgent: { backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 8 },
  urgentText: { color: "#fff", fontSize: 11.5, lineHeight: 20, fontWeight: "800" },
  doneText: { fontSize: 13, fontWeight: "800", color: colors.successInk },
  arrivedPill: { backgroundColor: colors.roleTechSoft, borderRadius: 999, paddingHorizontal: 10 },
  arrivedText: { fontSize: 12, lineHeight: 22, fontWeight: "700", color: colors.roleTech },
  branch: { fontSize: 15.5, lineHeight: 23, fontWeight: "700", color: colors.text },
  meta: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  small: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", marginTop: 2 },
  // สูง 48 — ช่างกดด้วยนิ้วโป้งตอนยืนหน้าร้าน (ตัวอย่างที่เจ้าของงานเลือก ต.ค. 69 ใช้ 48 ทุกปุ่ม)
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  smallText: { fontSize: 13, color: colors.primaryInk, fontWeight: "600" },
  big: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.navyFill,
    borderRadius: radius.md,
    paddingVertical: 13,
    marginTop: 4,
  },
  bigClose: { backgroundColor: colors.roleTech },
  bigText: { color: "#fff", fontSize: 17, lineHeight: 24, fontWeight: "800" },
  problem: { textAlign: "center", fontSize: 13, color: colors.dangerInk, fontWeight: "600", paddingVertical: 4 },
  errorBox: { padding: spacing.lg, alignItems: "center", gap: spacing.sm },
  errorText: { color: colors.dangerInk, textAlign: "center" },
  retry: { color: colors.primaryInk, fontWeight: "700" },
});
