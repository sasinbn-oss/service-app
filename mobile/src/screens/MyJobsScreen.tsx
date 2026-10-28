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
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setError(null);
    try {
      const res = await api.get<{ today: string; rows: Job[] }>("/work-orders/my-day");
      if (n !== seq.current) return;
      setJobs(res.data.rows);
      setToday(res.data.today);
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
        <View style={{ paddingVertical: spacing.xl }}>
          <Spinner color={colors.primary} />
        </View>
      ) : list.length === 0 ? (
        <EmptyState
          icon="sunny-outline"
          title={tab === "today" ? "วันนี้ยังไม่มีงานที่ปล่อยให้ทีม" : tab === "tomorrow" ? "พรุ่งนี้ยังไม่มีงานที่ปล่อยแล้ว" : "ไม่มีงานค้าง"}
          text={tab === "late" ? "งานที่นัดผ่านไปแล้วแต่ยังไม่ปิดจะขึ้นที่นี่" : "หัวหน้าภาคปล่อยงานแล้วจะขึ้นที่นี่ทันที"}
        />
      ) : (
        list.map((j) => (
          <JobCard key={j.id} job={j} late={tab === "late"} busy={busyId === j.id} onArrive={() => arrive(j)} onOpen={(w) => open(j, w)} />
        ))
      )}
    </ScrollView>
  );
}

function JobCard({
  job,
  late,
  busy,
  onArrive,
  onOpen,
}: {
  job: Job;
  late: boolean;
  busy: boolean;
  onArrive: () => void;
  onOpen: (what?: "close" | "stage" | "problem") => void;
}) {
  const arrived = !!job.arrivedAt;
  const map =
    job.latitude != null && job.longitude != null ? `https://maps.google.com/?q=${job.latitude},${job.longitude}` : null;
  return (
    <View
      style={[styles.card, arrived && !job.done && styles.cardNow, job.done && styles.cardDone]}
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
        {job.done ? (
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
        {job.code} · {job.inspect ? "ตรวจหน้างาน" : job.jobType === "PM" ? "งาน PM" : "งานซ่อม"}
        {job.machineCode ? ` · เครื่อง ${machineTag(job.machineCode, job.machineCapacityKg)}` : " · ทั้งสาขา"}
        {job.symptom ? ` · ${job.symptom}` : ""}
      </Text>
      {job.parts.length ? (
        <Text style={styles.meta}>อะไหล่: {job.parts.map((p) => `${p.name} x${p.quantity}${p.unit ? ` ${p.unit}` : ""}`).join(", ")}</Text>
      ) : null}

      {job.done ? null : (
        <>
          <View style={styles.small}>
            {map ? (
              <TouchableOpacity style={styles.smallBtn} onPress={() => Linking.openURL(map)} accessibilityLabel={`นำทางไป ${job.branchName}`}>
                <Ionicons name="navigate-outline" size={15} color={colors.primaryInk} />
                <Text style={styles.smallText}>นำทาง</Text>
              </TouchableOpacity>
            ) : null}
            {job.contactPhone ? (
              <TouchableOpacity
                style={styles.smallBtn}
                onPress={() => Linking.openURL(`tel:${job.contactPhone!.replace(/[^\d+]/g, "")}`)}
                accessibilityLabel={`โทรร้าน ${job.contactPhone}`}
              >
                <Ionicons name="call-outline" size={15} color={colors.primaryInk} />
                <Text style={styles.smallText}>{job.contactPhone}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.smallBtn} onPress={() => onOpen()} accessibilityLabel={`รายละเอียด ${job.code}`}>
              <Ionicons name="document-text-outline" size={15} color={colors.primaryInk} />
              <Text style={styles.smallText}>รายละเอียด</Text>
            </TouchableOpacity>
          </View>
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
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
