/**
 * บอร์ดแผนงาน — หน้าแรกของแอดมินกับหัวหน้าภาค
 *
 * ตอบคำถามแรกของเช้า: วันนี้ทีมไหนไปไหน ไปกับใคร ซ่อมอะไร ใครเป็นคนจัด
 * จุดที่ต้องเข้ามาจากใบงานที่นัดวันนั้นตรง ๆ (แก้วันนัดที่ใบงาน บอร์ดเปลี่ยนเอง)
 * ส่วนคนกับรถเป็นสิ่งที่ใบงานไม่รู้ จึงจัดที่นี่ผ่าน "จัดแผน"
 *
 * ช่างไม่ได้เข้าหน้านี้ — เมนูไม่ขึ้น และเซิร์ฟเวอร์ตอบ 403 อยู่แล้ว
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import TouchableOpacity from "../components/Tap";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage } from "../api/client";
import AppModal from "../components/AppModal";
import DateField, { thaiDate } from "../components/DateField";
import Dropdown, { OptionList } from "../components/Dropdown";
import Popover from "../components/Popover";
import TimeField from "../components/TimeField";
import EmptyState from "../components/EmptyState";
import Spinner, { WasherIcon } from "../components/Spinner";
import { useAuth } from "../context/AuthContext";
import TimelineModal, { TimelineButton, TimelineTarget } from "../components/TimelineModal";
import { HomeStackParamList } from "../navigation/types";
import { colors, headingFont, radius, shadow, spacing } from "../theme";

type Props = NativeStackScreenProps<HomeStackParamList, "PlanBoard">;

interface Stop {
  id: number;
  code: string;
  time: string | null;
  branchCode: string;
  branchName: string;
  address: string | null;
  region: string | null;
  machineCode: string | null;
  jobTypeLabel: string;
  title: string;
  symptom: string | null;
  parts: string[];
  status: string;
  statusLabel: string;
  kind: "INSPECT" | "REPAIR";
  appointmentStatus: string | null;
  appointmentLabel: string | null;
  isFollowUp: boolean;
}

interface Member {
  id: number;
  name: string;
  employeeCode: string;
}

interface Lane {
  team: string;
  plan: {
    vehicleId: number | null;
    vehiclePlate: string | null;
    /** เวลาเข้าหน้างานของทีมวันนั้น "HH:MM" */
    startTime: string | null;
    /** ใครเบิกรถคันนี้อยู่ตอนนี้ (จากลงทะเบียนใช้รถ) — บอกได้ว่าทีมออกเดินทางแล้วหรือรถถูกคนอื่นเอาไป */
    vehicleInUseBy: string | null;
    members: Member[];
    note: string | null;
    plannedByName: string | null;
  } | null;
  stops: Stop[];
}

interface Day {
  date: string;
  stats: { teams: number; people: number; stops: number; awaitingConfirm: number };
  lanes: Lane[];
  /** ทีมที่คนนี้จัดแผนได้ · null = ทุกทีม (แอดมิน) */
  plannableTeams?: string[] | null;
  /** ทีมรวม — ไม่อยู่ในรายชื่อทีมจากทะเบียนสาขา ต้องเติมเอง */
  groupTeams?: string[];
}

interface Pending {
  id: number;
  code: string;
  status: string;
  statusLabel: string;
  title: string;
  team: string | null;
  urgent: boolean;
  branchCode: string;
  branchName: string;
  machineCode: string | null;
  parentCode: string | null;
}

interface Technician {
  id: number;
  name: string;
  employeeCode: string;
  team: string | null;
}

interface Vehicle {
  id: number;
  plateNumber: string;
  brand: string | null;
}

const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** วันตามปฏิทินเครื่อง — คนจัดแผนคิดเป็นวันไทย ไม่ใช่วัน UTC */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parse(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(s: string, n: number) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
/** วันจันทร์ของสัปดาห์ — สัปดาห์งานเริ่มวันจันทร์ ไม่ใช่วันอาทิตย์แบบปฏิทินฝรั่ง */
function mondayOf(s: string) {
  const d = parse(s);
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return ymd(d);
}
function longDate(s: string) {
  const d = parse(s);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}. ${d.getFullYear() + 543}`;
}

/**
 * ป้ายขอบเขตของหัวหน้าภาค — เดิมดูแค่ภาค หัวหน้าภาคที่ตั้งเป็น "ทีมที่ดูแล" จากไฟล์รายชื่อ
 * (ไม่ได้ตั้งภาค) จึงขึ้น "ภาคที่ยังไม่ระบุ" ทั้งที่เห็นแผนของทีมตัวเองครบ คนเลยเข้าใจว่ายังไม่ได้จัดทีม
 */
function supervisorScopeLabel(u: { region?: string | null; supervisedTeams?: string[] }) {
  const teams = u.supervisedTeams ?? [];
  if (u.region) return `ภาค${u.region}${teams.length ? ` + ${teams.length} ทีม` : ""}`;
  if (!teams.length) return "ยังไม่ได้ตั้งทีมที่ดูแล";
  return teams.length <= 3 ? teams.join(" · ") : `${teams.slice(0, 2).join(" · ")} และอีก ${teams.length - 2} ทีม`;
}

export default function PlanBoardScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const today = ymd(new Date());
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<Day | null>(null);
  const [month, setMonth] = useState<Record<string, number>>({});
  // จุดในปฏิทินของหน้าต่างจัดแผน = วันที่มีงานนัดแล้ว (เดือนที่กำลังดูอยู่)
  const busyDays = useMemo(() => new Set(Object.keys(month).filter((d) => month[d] > 0)), [month]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // แผนที่กำลังแก้ — ทีมว่าง = จัดแผนใหม่
  const [editing, setEditing] = useState<{ team: string; lane: Lane | null } | null>(null);
  // ไทม์ไลน์ — เฉพาะ Super Admin (เซิร์ฟเวอร์กันซ้ำอีกชั้น)
  const [timeline, setTimeline] = useState<TimelineTarget | null>(null);
  const showTimeline = user?.superAdmin ? setTimeline : undefined;

  const monthKey = date.slice(0, 7);
  /**
   * นับรอบการโหลด — กดหลายวันติดกันเร็ว ๆ คำตอบของวันก่อนหน้าอาจมาถึงทีหลัง
   * แล้วทับแผนของวันที่เลือกล่าสุด หัวจะบอก ศ. 9 แต่แถวทีมเป็นของ พฤ. 8
   * รับเฉพาะคำตอบของรอบล่าสุด
   */
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const [d, m, p] = await Promise.all([
        api.get<Day>(`/plans/day?date=${date}`),
        api.get<{ days: Record<string, number> }>(`/plans/month?month=${monthKey}`),
        api.get<Pending[]>("/plans/pending"),
      ]);
      if (seq !== loadSeq.current) return;
      setDay(d.data);
      setMonth(m.data.days);
      setPending(p.data);
      setError(null);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(apiErrorMessage(e));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [date, monthKey]);

  /**
   * แผนที่โชว์อยู่ยังเป็นของวันอื่น = กำลังเปลี่ยนวัน
   *
   * ดูจากวันที่ในข้อมูลเทียบกับวันที่เลือก ไม่ได้ใช้ธงแยก — ธงที่ลืมปิดตอน error
   * จะทำให้หน้าหมุนค้าง ส่วนอันนี้จบเองเมื่อข้อมูลของวันใหม่มาถึง
   * โหลดพังก็เลิกหมุนแล้วโชว์ error แทน ไม่ปล่อยให้รอโดยไม่มีวันจบ
   */
  const switching = day !== null && day.date !== date && !error;

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // ตัวเลือกของฟอร์มจัดแผน โหลดครั้งเดียวตอนเปิดฟอร์มครั้งแรก — ไม่ต้องจ่ายทุกครั้งที่เปลี่ยนวัน
  async function openPlan(team: string, lane: Lane | null) {
    setEditing({ team, lane });
    if (teams.length > 0) return;
    try {
      const [o, v] = await Promise.all([
        api.get<{ technicians: Technician[]; teams: { name: string }[] }>("/work-orders/options"),
        api.get<Vehicle[]>("/vehicles"),
      ]);
      setTechnicians(o.data.technicians);
      setTeams(o.data.teams.map((t) => t.name));
      setVehicles(v.data);
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  const week = useMemo(() => {
    const mon = mondayOf(date);
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  }, [date]);

  // ตัวเลขของวันเก่าไม่ใช่ตัวเลขของวันที่เลือก — ระหว่างรอขึ้นเป็นแถบเทาแทน
  const stats = switching ? null : day?.stats;
  const working = day?.lanes.filter((l) => l.stops.length > 0) ?? [];
  const idle = day?.lanes.filter((l) => l.stops.length === 0) ?? [];

  const lanes = (
    <View style={{ gap: spacing.md, flex: wide ? 1 : undefined, minWidth: 0 }}>
      {/*
        เปลี่ยนวันแล้ว แผนวันเดิมยังอยู่แต่จางลง มีเครื่องซักผ้าบอกว่ากำลังโหลดวันไหน
        ไม่ล้างจอเป็นว่าง เพราะหน้ากระพริบทุกครั้งที่กด ‹ › แล้วเลื่อนกลับขึ้นบนสุด
      */}
      {switching ? (
        <View style={styles.veil} pointerEvents="none">
          <View style={styles.veilBox} accessibilityLabel={`กำลังโหลดแผน ${longDate(date)}`}>
            <WasherIcon size={64} />
            <Text style={styles.veilTitle}>กำลังโหลดแผน {longDate(date)}</Text>
          </View>
        </View>
      ) : null}
      {loading && !day ? (
        <View style={styles.card}>
          <Spinner color={colors.primary} />
        </View>
      ) : working.length === 0 ? (
        <View style={[styles.card, switching && styles.dim]}>
          <EmptyState
            icon="calendar-outline"
            title={`${longDate(day?.date ?? date)} ยังไม่มีงานลงแผน`}
            text="ใบงานที่นัดลูกค้าหรือส่งตรวจหน้างานในวันนี้จะขึ้นที่นี่เอง — หยิบจากรายการรอจัดแผนได้"
          />
        </View>
      ) : (
        working.map((lane) => (
          <LaneCard
            key={lane.team}
            lane={lane}
            dim={switching}
            onEdit={() => openPlan(lane.team, lane)}
            onOpen={(id) => navigation.navigate("WorkOrderDetail", { id })}
            date={day?.date ?? date}
            onTimeline={showTimeline}
          />
        ))
      )}
      {idle.map((lane) => (
        <LaneCard
          key={lane.team}
          lane={lane}
          onEdit={() => openPlan(lane.team, lane)}
          onOpen={(id) => navigation.navigate("WorkOrderDetail", { id })}
            date={day?.date ?? date}
            onTimeline={showTimeline}
        />
      ))}
    </View>
  );

  const side = (
    <View style={{ gap: spacing.md, width: wide ? 320 : undefined }}>
      <MonthCalendar date={date} today={today} counts={month} onPick={setDate} />
      <View style={styles.card}>
        <View style={styles.sideHead}>
          <Text style={[styles.sideTitle, headingFont]}>รอจัดแผน</Text>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{pending.length}</Text>
          </View>
        </View>
        {pending.length === 0 ? (
          <Text style={styles.muted}>ไม่มีใบงานค้างรอลงวัน</Text>
        ) : (
          pending.slice(0, 30).map((p) => (
            <View key={p.id} style={styles.pendRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.pendBranch} numberOfLines={1}>
                  <Text style={styles.code}>{p.branchCode}</Text> {p.branchName}
                </Text>
                <Text style={styles.muted} numberOfLines={2}>
                  {p.code}
                  {p.machineCode ? ` · ${p.machineCode}` : ""} · {p.title}
                  {p.parentCode ? ` (แยกจาก ${p.parentCode})` : ""}
                </Text>
                <View style={[styles.tag, p.status === "WAITING_PARTS" ? styles.tagWarn : styles.tagInfo]}>
                  <Text
                    style={[styles.tagText, p.status === "WAITING_PARTS" ? styles.tagTextWarn : styles.tagTextInfo]}
                  >
                    {p.statusLabel}
                    {p.team ? ` · ${p.team}` : ""}
                  </Text>
                </View>
              </View>
              {showTimeline ? (
                <TimelineButton label={`ไทม์ไลน์ ${p.code}`} compact onPress={() => showTimeline({ kind: "wo", id: p.id, code: p.code })} />
              ) : null}
              <TouchableOpacity
                style={styles.pendBtn}
                onPress={() => navigation.navigate("WorkOrderDetail", { id: p.id })}
                activeOpacity={0.7}
                accessibilityLabel={`จัด ${p.code}`}
              >
                <Text style={styles.pendBtnText}>จัด</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.pageHead}>
        <Text style={[styles.pageTitle, headingFont]}>แผนงาน</Text>
        <View style={styles.scopePill}>
          <Text style={styles.scopePillText}>
            {user?.role === "SUPERVISOR" ? supervisorScopeLabel(user) : "ทุกภาค"}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.dateNav}>
          <TouchableOpacity style={styles.navBtn} onPress={() => setDate(addDays(date, -1))} accessibilityLabel="วันก่อนหน้า">
            <Ionicons name="chevron-back" size={18} color={colors.navy} />
          </TouchableOpacity>
          <Text style={[styles.dateText, headingFont]}>{longDate(date)}</Text>
          <TouchableOpacity style={styles.navBtn} onPress={() => setDate(addDays(date, 1))} accessibilityLabel="วันถัดไป">
            <Ionicons name="chevron-forward" size={18} color={colors.navy} />
          </TouchableOpacity>
          {date !== today ? (
            <TouchableOpacity style={styles.todayBtn} onPress={() => setDate(today)}>
              <Text style={styles.todayText}>วันนี้</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => openPlan("", null)} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnText}>จัดแผน</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.week}>
        {week.map((d) => {
          const on = d === date;
          const n = month[d] ?? 0;
          const dd = parse(d);
          return (
            <TouchableOpacity
              key={d}
              style={[styles.weekDay, on && styles.weekDayOn]}
              onPress={() => setDate(d)}
              activeOpacity={0.75}
              accessibilityLabel={`${longDate(d)} ${n} งาน`}
            >
              {on && switching ? (
                <View style={styles.weekSpin}>
                  <WasherIcon size={16} color="#fff" />
                </View>
              ) : null}
              <Text style={[styles.weekDow, on && styles.weekOnText]}>
                {DOW[dd.getDay()]}
                {d === today ? " · วันนี้" : ""}
              </Text>
              <Text style={[styles.weekNum, headingFont, on && styles.weekOnText]}>{dd.getDate()}</Text>
              <View style={styles.dots}>
                {Array.from({ length: Math.min(n, 4) }, (_, i) => (
                  <View key={i} style={[styles.dot, on && { backgroundColor: "#fff" }]} />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.stats}>
        <Stat icon="car-outline" value={stats ? stats.teams : day ? null : 0} label="ทีมออกงาน" />
        <Stat icon="people-outline" value={stats ? stats.people : day ? null : 0} label="ช่างออกงาน" />
        <Stat icon="location-outline" value={stats ? stats.stops : day ? null : 0} label="จุดที่ต้องเข้า" />
        <Stat icon="hourglass-outline" value={stats ? stats.awaitingConfirm : day ? null : 0} label="รอลูกค้าคอนเฟิร์ม" warn />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {wide ? (
        <View style={styles.cols}>
          {lanes}
          {side}
        </View>
      ) : (
        <>
          {lanes}
          {side}
        </>
      )}

      {timeline ? <TimelineModal target={timeline} onClose={() => setTimeline(null)} /> : null}
      <PlanModal
        visible={editing !== null}
        initialTeam={editing?.team ?? ""}
        lane={editing?.lane ?? null}
        date={date}
        teams={(() => {
          const all = [...teams, ...(day?.groupTeams ?? []).filter((g) => !teams.includes(g))];
          return day?.plannableTeams ? all.filter((t) => day.plannableTeams!.includes(t)) : all;
        })()}
        technicians={technicians}
        vehicles={vehicles}
        busyDays={busyDays}
        onCancel={() => setEditing(null)}
        onSaved={async (savedDate) => {
          setEditing(null);
          if (savedDate !== date) setDate(savedDate);
          else await load();
        }}
      />
    </ScrollView>
  );
}

function Stat({
  icon,
  value,
  label,
  warn,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  /** null = ยังโหลดวันใหม่ไม่เสร็จ */
  value: number | null;
  label: string;
  warn?: boolean;
}) {
  return (
    <View style={[styles.card, styles.stat]}>
      <View style={[styles.statIcon, warn && { backgroundColor: colors.warningSoft }]}>
        <Ionicons name={icon} size={20} color={warn ? colors.warningInk : colors.primaryInk} />
      </View>
      <View>
        {value === null ? (
          <View style={styles.statSkeleton} />
        ) : (
          <Text style={[styles.statValue, headingFont]}>{value}</Text>
        )}
        <Text style={styles.muted}>{label}</Text>
      </View>
    </View>
  );
}

/** ป้ายสถานะของจุด — สิ่งที่คนจัดแผนต้องรู้คือ "ไปได้แน่หรือยัง" */
function stopTag(s: Stop) {
  if (s.status === "DONE") return { text: "ปิดงานแล้ว", tone: "ok" as const };
  if (s.kind === "INSPECT") return { text: "ตรวจหน้างาน", tone: "violet" as const };
  if (s.status === "AWAITING_CONFIRM") return { text: "รอลูกค้าคอนเฟิร์ม", tone: "warn" as const };
  return { text: s.appointmentLabel ?? s.statusLabel, tone: "ok" as const };
}

function LaneCard({
  lane,
  dim,
  onEdit,
  onOpen,
  date,
  onTimeline,
}: {
  lane: Lane;
  dim?: boolean;
  onEdit: () => void;
  onOpen: (id: number) => void;
  date: string;
  onTimeline?: (t: TimelineTarget) => void;
}) {
  const members = lane.plan?.members ?? [];
  const [lead, ...rest] = members;
  return (
    <View style={[styles.card, { padding: 0 }, dim && styles.dim]}>
      <View style={styles.laneHead}>
        <Text style={[styles.laneTeam, headingFont]}>{lane.team}</Text>
        {members.length > 0 ? (
          <View style={styles.avatars}>
            {members.slice(0, 4).map((m, i) => (
              <View key={m.id} style={[styles.avatar, { marginLeft: i === 0 ? 0 : -8, backgroundColor: AVATAR[i % AVATAR.length] }]}>
                <Text style={styles.avatarText}>{m.name.trim().charAt(0)}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={styles.crew} numberOfLines={2}>
          {lead ? (
            <>
              <Text style={styles.crewLead}>{lead.name}</Text> (หัวหน้าทีม)
              {rest.length > 0 ? ` ไปกับ ${rest.map((m) => m.name).join(", ")}` : " ไปคนเดียว"}
            </>
          ) : (
            <Text style={styles.warnText}>ยังไม่ได้จัดคน</Text>
          )}
        </Text>
        {lane.plan?.startTime ? (
          <View style={styles.car}>
            <Ionicons name="time-outline" size={13} color={colors.primaryInk} />
            <Text style={styles.carText}>เข้า {lane.plan.startTime} น.</Text>
          </View>
        ) : null}
        {lane.plan?.vehiclePlate ? (
          <View style={styles.car}>
            <Ionicons name="car-outline" size={13} color={colors.primaryInk} />
            <Text style={styles.carText}>
              {lane.plan.vehiclePlate}
              {lane.plan.vehicleInUseBy ? ` · ${lane.plan.vehicleInUseBy} เบิกอยู่` : ""}
            </Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {lane.plan?.plannedByName ? (
          <Text style={styles.plannedBy}>จัดแผนโดย {lane.plan.plannedByName}</Text>
        ) : null}
        {onTimeline ? (
          <TimelineButton label={`ไทม์ไลน์ทีม ${lane.team}`} onPress={() => onTimeline({ kind: "team", date, team: lane.team })} />
        ) : null}
        <TouchableOpacity style={styles.editBtn} onPress={onEdit} accessibilityLabel={`จัดแผน ${lane.team}`}>
          <Ionicons name="create-outline" size={16} color={colors.primaryInk} />
          <Text style={styles.editText}>{lane.plan ? "แก้แผน" : "จัดคน"}</Text>
        </TouchableOpacity>
      </View>
      {lane.plan?.note ? <Text style={styles.laneNote}>{lane.plan.note}</Text> : null}
      {lane.stops.length === 0 ? (
        <Text style={[styles.muted, { padding: spacing.lg }]}>ทีมนี้ยังไม่มีงานวันนี้</Text>
      ) : (
        lane.stops.map((s, i) => {
          const tag = stopTag(s);
          return (
            // ปุ่มไทม์ไลน์อยู่ข้างการ์ด ไม่ซ้อนในการ์ด — ปุ่มซ้อนปุ่มบนเว็บกดแล้วเปิดใบงานไปด้วย
            <View key={s.id} style={[styles.stopRow, i > 0 && styles.stopBorder]}>
            <TouchableOpacity
              style={[styles.stop, { flex: 1 }]}
              onPress={() => onOpen(s.id)}
              activeOpacity={0.75}
              accessibilityLabel={`เปิด ${s.code}`}
            >
              <View style={styles.stopTime}>
                <Text style={[styles.stopClock, headingFont]}>{s.time ?? "ทั้งวัน"}</Text>
                {s.time ? <Text style={styles.muted}>น.</Text> : null}
              </View>
              <View style={[styles.rail, { backgroundColor: tag.tone === "violet" ? VIOLET : colors.primary }]} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <View style={styles.stopTop}>
                  <Text style={styles.stopBranch} numberOfLines={1}>
                    <Text style={styles.code}>{s.branchCode}</Text> {s.branchName}
                  </Text>
                  <View style={[styles.tag, TAG_BG[tag.tone]]}>
                    <Text style={[styles.tagText, TAG_FG[tag.tone]]}>● {tag.text}</Text>
                  </View>
                </View>
                <Text style={styles.muted} numberOfLines={1}>
                  📍 {s.address || s.region || "—"} · {s.code}
                  {s.isFollowUp ? " · ใบต่อเนื่อง" : ""}
                </Text>
                <Text style={styles.stopJob} numberOfLines={2}>
                  🔧 {[s.machineCode, s.symptom].filter(Boolean).join(" ") || s.jobTypeLabel}
                  {s.parts.length > 0 ? (
                    <Text style={styles.stopParts}> — {s.parts.join(", ")}</Text>
                  ) : s.kind === "INSPECT" ? (
                    <Text style={styles.stopParts}> — ตรวจสอบหน้างาน</Text>
                  ) : null}
                </Text>
              </View>
            </TouchableOpacity>
            {onTimeline ? (
              <View style={styles.stopTl}>
                <TimelineButton label={`ไทม์ไลน์ ${s.code}`} compact onPress={() => onTimeline({ kind: "wo", id: s.id, code: s.code })} />
              </View>
            ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

const VIOLET = "#7C3AED";
const AVATAR = [colors.primary, colors.navy, colors.warning, "#E11D48", VIOLET];
const TAG_BG = {
  ok: { backgroundColor: colors.successSoft },
  warn: { backgroundColor: colors.warningSoft },
  violet: { backgroundColor: "#F3E8FF" },
};
const TAG_FG = {
  ok: { color: colors.successInk },
  warn: { color: colors.warningInk },
  violet: { color: "#6B21A8" },
};

function MonthCalendar({
  date,
  today,
  counts,
  onPick,
}: {
  date: string;
  today: string;
  counts: Record<string, number>;
  onPick: (d: string) => void;
}) {
  const first = parse(`${date.slice(0, 7)}-01`);
  const start = mondayOf(ymd(first));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  // ตัดแถวท้ายที่เป็นเดือนถัดไปทั้งแถวทิ้ง
  const rows = cells.length / 7 - (parse(cells[35]).getMonth() !== first.getMonth() ? 1 : 0);
  const shift = (n: number) => {
    const d = new Date(first.getFullYear(), first.getMonth() + n, 1);
    onPick(ymd(d));
  };
  return (
    <View style={styles.card}>
      <View style={styles.sideHead}>
        <Text style={[styles.sideTitle, headingFont]}>
          {MONTHS[first.getMonth()]} {first.getFullYear() + 543}
        </Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => shift(-1)} style={styles.calNav} accessibilityLabel="เดือนก่อน">
          <Ionicons name="chevron-back" size={16} color={colors.navy} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shift(1)} style={styles.calNav} accessibilityLabel="เดือนถัดไป">
          <Ionicons name="chevron-forward" size={16} color={colors.navy} />
        </TouchableOpacity>
      </View>
      <View style={styles.calGrid}>
        {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((d) => (
          <Text key={d} style={[styles.calCell, styles.calDow]}>
            {d}
          </Text>
        ))}
        {cells.slice(0, rows * 7).map((d) => {
          const inMonth = parse(d).getMonth() === first.getMonth();
          const on = d === date;
          return (
            <TouchableOpacity key={d} style={styles.calCell} onPress={() => onPick(d)} accessibilityLabel={thaiDate(d)}>
              <View style={[styles.calDay, on && styles.calDayOn, d === today && !on && styles.calToday]}>
                <Text style={[styles.calNum, !inMonth && { color: colors.textFaint }, on && { color: "#fff" }]}>
                  {parse(d).getDate()}
                </Text>
              </View>
              {counts[d] ? <View style={[styles.dot, { alignSelf: "center" }]} /> : <View style={{ height: 5 }} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.muted}>จุดฟ้า = วันที่มีงานลงแผนแล้ว</Text>
    </View>
  );
}

/**
 * จัดแผนทีม — ใครไป (คนแรกเป็นหัวหน้าทีมของวันนั้น) รถคันไหน
 *
 * ช่างในทีมขึ้นก่อนและเลือกได้ด้วยการแตะ ช่างทีมอื่นยังเลือกได้ (ยืมคนข้ามทีมมีจริง)
 * แต่อยู่ท้ายรายการ จะได้ไม่ต้องไล่หาในรายชื่อทั้งบริษัท
 */
function PlanModal({
  visible,
  initialTeam,
  lane,
  date,
  teams,
  technicians,
  vehicles,
  busyDays,
  onCancel,
  onSaved,
}: {
  visible: boolean;
  busyDays: Set<string>;
  initialTeam: string;
  lane: Lane | null;
  date: string;
  teams: string[];
  technicians: Technician[];
  vehicles: Vehicle[];
  onCancel: () => void;
  onSaved: (date: string) => void;
}) {
  const [planDate, setPlanDate] = useState(date);
  const [team, setTeam] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [startTime, setStartTime] = useState("");
  const [borrowing, setBorrowing] = useState(false);
  const borrowAnchor = useRef<View>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!visible) return;
    setPlanDate(date);
    setTeam(initialTeam || null);
    setMemberIds(lane?.plan?.members.map((m) => m.id) ?? []);
    setVehicleId(lane?.plan?.vehicleId ? String(lane.plan.vehicleId) : null);
    setNote(lane?.plan?.note ?? "");
    setStartTime(lane?.plan?.startTime ?? "");
    setBorrowing(false);
    setError(null);
  }, [visible, date, initialTeam, lane]);

  const inTeam = technicians.filter((t) => t.team === team);
  const others = technicians.filter((t) => t.team !== team);
  const shown = inTeam;
  // ช่างทีมอื่นที่ยืมมาแล้วขึ้นเป็นชิปต่อท้ายทีม ที่เหลือเลือกจากกล่องลอย "ยืมช่างจากทีมอื่น"
  // (เดิมกางรายชื่อทั้งบริษัทลงในหน้าต่าง หน้าต่างยืดยาวจนหาปุ่มบันทึกไม่เจอ)
  const pickedOthers = others.filter((t) => memberIds.includes(t.id));

  function toggle(id: number) {
    setMemberIds((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }

  async function save() {
    if (!team) return;
    setSaving(true);
    setError(null);
    try {
      await api.put("/plans", {
        date: planDate,
        team,
        vehicleId: vehicleId ? Number(vehicleId) : null,
        memberIds,
        note: note.trim() || null,
        startTime: startTime || null,
      });
      onSaved(planDate);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const ok = !!team && /^\d{4}-\d{2}-\d{2}$/.test(planDate);
  return (
    <AppModal
      visible={visible}
      onClose={onCancel}
      busy={saving}
      width={520}
      title={lane?.plan ? `แก้แผน ${lane.team}` : "จัดแผนทีม"}
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalSave, (!ok || saving) && { opacity: 0.5 }]}
            onPress={save}
            disabled={!ok || saving}
            activeOpacity={0.8}
          >
            {saving ? <Spinner color="#fff" size="small" /> : <Text style={styles.modalSaveText}>บันทึกแผน</Text>}
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.dateTime}>
        <View style={{ flexGrow: 1.4, flexBasis: 200 }}>
          <DateField value={planDate} onChange={setPlanDate} label="วันที่" emptyHint="ต้องระบุวัน" required marked={busyDays} labelStyle={styles.fieldLabel} />
        </View>
        <View style={{ flexGrow: 1, flexBasis: 150 }}>
          <TimeField value={startTime} onChange={setStartTime} label="เวลาเข้าหน้างาน" labelStyle={styles.fieldLabel} />
        </View>
      </View>
      <Text style={styles.label}>ทีม</Text>
      <Dropdown
        value={team}
        onChange={(t) => {
          setTeam(t);
          if (t !== team) setMemberIds([]);
        }}
        placeholder="เลือกทีม"
        accessibilityLabel="ทีม"
        options={teams.map((t) => ({ value: t, label: t }))}
      />
      {team ? (
        <>
          <Text style={styles.label}>ใครไปบ้าง (คนแรกที่เลือก = หัวหน้าทีม)</Text>
          <View style={styles.people}>
            {[...shown, ...pickedOthers].map((t) => {
              const at = memberIds.indexOf(t.id);
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.person, at >= 0 && styles.personOn]}
                  onPress={() => toggle(t.id)}
                  activeOpacity={0.7}
                  accessibilityLabel={t.name}
                >
                  <Text style={[styles.personText, at >= 0 && { color: "#fff" }]}>
                    {at === 0 ? "★ " : at > 0 ? `${at + 1}. ` : ""}
                    {t.name}
                    {t.team && t.team !== team ? ` · ${t.team}` : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {inTeam.length === 0 ? (
            <Text style={styles.muted}>ยังไม่มีช่างที่สังกัด{team} — ยืมจากทีมอื่นได้</Text>
          ) : null}
          <View ref={borrowAnchor} style={{ alignSelf: "flex-start" }}>
            <TouchableOpacity onPress={() => setBorrowing((v) => !v)} accessibilityLabel="ยืมช่างจากทีมอื่น">
              <Text style={styles.link}>+ ยืมช่างจากทีมอื่น</Text>
            </TouchableOpacity>
          </View>
          <Popover anchor={borrowAnchor} open={borrowing} onClose={() => setBorrowing(false)} width={320}>
            <OptionList
              label="ช่างทีมอื่น"
              options={others
                .filter((t) => !memberIds.includes(t.id))
                .map((t) => ({ value: String(t.id), label: t.name, hint: t.team ?? "ยังไม่มีทีม" }))}
              onPick={(id) => {
                if (id) toggle(Number(id));
                setBorrowing(false);
              }}
            />
          </Popover>
        </>
      ) : null}
      <Text style={styles.label}>รถ (ไม่บังคับ)</Text>
      <Dropdown
        value={vehicleId}
        onChange={setVehicleId}
        placeholder="ไม่ระบุรถ"
        accessibilityLabel="รถ"
        options={[
          { value: "", label: "ไม่ระบุรถ" },
          ...vehicles.map((v) => ({ value: String(v.id), label: v.plateNumber, hint: v.brand ?? undefined })),
        ]}
      />
      <Text style={styles.label}>บันทึก (ไม่บังคับ)</Text>
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={setNote}
        placeholder="เช่น ออกจากศูนย์ 7 โมง แวะรับอะไหล่ที่คลังกระบี่"
        placeholderTextColor={colors.textFaint}
        multiline
        accessibilityLabel="บันทึกแผน"
      />
      <Text style={styles.muted}>
        จุดที่ต้องไปมาจากใบงานที่นัดวันนี้ของทีมนี้เอง — ไม่ต้องเลือกซ้ำที่นี่
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  pageHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  pageTitle: { fontSize: 24, lineHeight: 34, fontWeight: "700", color: colors.text },
  scopePill: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  scopePillText: { fontSize: 12, fontWeight: "700", color: colors.primaryInk },
  dateNav: { flexDirection: "row", alignItems: "center", gap: 6 },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  dateText: { fontSize: 15, fontWeight: "700", color: colors.text, minWidth: 120, textAlign: "center" },
  todayBtn: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    justifyContent: "center",
  },
  todayText: { fontSize: 13, fontWeight: "700", color: colors.navy },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 40,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  week: { gap: spacing.sm, flexGrow: 1 },
  weekDay: {
    flexGrow: 1,
    minWidth: 76,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 2,
  },
  weekDayOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  weekDow: { fontSize: 12, color: colors.textMuted },
  weekNum: { fontSize: 20, fontWeight: "700", color: colors.text },
  weekOnText: { color: "#fff" },
  dots: { flexDirection: "row", gap: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  stat: { flexGrow: 1, flexBasis: 150, minWidth: "40%", flexDirection: "row", alignItems: "center", gap: spacing.md },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  // แผนวันเดิมระหว่างรอวันใหม่ — ยังเห็นโครง แต่ไม่ชวนให้อ่านเป็นของวันที่เลือก
  dim: { opacity: 0.35 },
  veil: { position: "absolute", top: 32, left: 0, right: 0, alignItems: "center", zIndex: 2 },
  veilBox: {
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 26,
    paddingVertical: 18,
    ...shadow.raised,
  },
  veilTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  weekSpin: { position: "absolute", top: 6, right: 6 },
  statSkeleton: { width: 42, height: 22, borderRadius: 7, backgroundColor: colors.tile, marginVertical: 3 },
  statValue: { fontSize: 22, lineHeight: 28, fontWeight: "700", color: colors.text },
  cols: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    overflow: "hidden",
    ...shadow.card,
  },
  laneHead: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  laneTeam: { fontSize: 17, fontWeight: "700", color: colors.text },
  avatars: { flexDirection: "row" },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  avatarText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  crew: { fontSize: 13, color: colors.body, flexShrink: 1 },
  crewLead: { fontWeight: "700", color: colors.text },
  warnText: { color: colors.warningInk, fontWeight: "600" },
  car: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  carText: { fontSize: 12, fontWeight: "700", color: colors.primaryInk },
  plannedBy: { fontSize: 12, color: colors.textMuted },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: colors.sky50,
  },
  editText: { fontSize: 12, fontWeight: "700", color: colors.primaryInk },
  laneNote: {
    fontSize: 13,
    color: colors.body,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  stop: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  stopBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  stopRow: { flexDirection: "row", alignItems: "flex-start" },
  stopTl: { paddingTop: spacing.md, paddingRight: spacing.md },
  stopTime: { width: 56 },
  stopClock: { fontSize: 17, fontWeight: "700", color: colors.text },
  rail: { width: 3, borderRadius: 2 },
  stopTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  stopBranch: { flex: 1, minWidth: 140, fontSize: 14, fontWeight: "700", color: colors.text },
  stopJob: { fontSize: 13, color: colors.body },
  stopParts: { fontWeight: "700", color: colors.text },
  code: {
    fontWeight: "700",
    color: colors.primaryInk,
    backgroundColor: colors.primarySoft,
    borderRadius: 6,
    paddingHorizontal: 5,
  },
  tag: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { fontSize: 12, fontWeight: "700" },
  tagInfo: { backgroundColor: colors.primarySoft },
  tagTextInfo: { color: colors.primaryInk },
  tagWarn: { backgroundColor: colors.warningSoft },
  tagTextWarn: { color: colors.warningInk },
  sideHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sideTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  countPill: { backgroundColor: colors.warningSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  countPillText: { fontSize: 12, fontWeight: "700", color: colors.warningInk },
  pendRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pendBranch: { fontSize: 14, fontWeight: "700", color: colors.text },
  pendBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendBtnText: { fontSize: 13, fontWeight: "700", color: colors.navy },
  calNav: { padding: 4 },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 2 },
  calDow: { fontSize: 11, color: colors.textMuted, textAlign: "center" },
  calDay: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  calDayOn: { backgroundColor: colors.navy },
  calToday: { borderWidth: 1, borderColor: colors.primary },
  calNum: { fontSize: 13, color: colors.text },
  muted: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  error: { color: colors.danger, fontSize: 13 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: spacing.xs },
  // วันที่กับเวลาอยู่แถวเดียวกัน จอแคบเรียงลงเป็นสองแถว
  dateTime: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.md },
  fieldLabel: { fontSize: 14, fontWeight: "600", marginTop: spacing.xs, marginBottom: 0 },
  people: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  person: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  personOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  personText: { fontSize: 13, color: colors.text },
  link: { fontSize: 13, fontWeight: "700", color: colors.primary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 60,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: "top",
  },
  modalActions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" },
  modalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelText: { fontSize: 14, fontWeight: "600", color: colors.body },
  modalSave: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.navy,
    minWidth: 110,
    alignItems: "center",
  },
  modalSaveText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
