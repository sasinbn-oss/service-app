/**
 * ไทม์ไลน์ (Super Admin) — ใครทำอะไรเมื่อไร ของใบงานหนึ่งใบ หรือของทีมทั้งวัน
 *
 * ข้อมูลประกอบจากสิ่งที่ระบบบันทึกอยู่แล้ว (backend/src/utils/timeline.ts) · ช่องว่างระหว่างสองรายการ
 * บอกว่ารอนานเท่าไร เพราะสิ่งที่เจ้าของระบบอยากรู้คือ "ค้างอยู่ที่ใคร" มากกว่าแค่ลำดับเหตุการณ์
 */
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import TouchableOpacity from "./Tap";
import Ionicons from "@expo/vector-icons/Ionicons";
import AppModal from "./AppModal";
import Spinner from "./Spinner";
import { api, apiErrorMessage } from "../api/client";
import { colors, radius, spacing } from "../theme";

type Role = "ADMIN" | "SUPERVISOR" | "EMPLOYEE" | "SYSTEM";
interface Event {
  at: string;
  role: Role;
  who: string;
  what: string;
  note?: string | null;
  tags?: { text: string; tone?: "ok" | "warn" }[];
  workOrder?: { id: number; code: string };
}
interface WoTimeline {
  workOrder: {
    code: string;
    title: string;
    statusLabel: string;
    team: string | null;
    branch: { code: string; name: string };
    createdAt: string;
    closedAt: string | null;
  };
  summary: { totalMs: number; open: boolean; longest: { label: string; ms: number } | null; onSiteMs: number | null; people: number };
  stages: { status: string; label: string; ms: number }[];
  events: Event[];
}
interface TeamTimeline {
  day: string;
  team: string;
  members: string[];
  vehicle: string | null;
  events: Event[];
}

export type TimelineTarget = { kind: "wo"; id: number; code: string } | { kind: "team"; date: string; team: string };

const ROLE_LABEL: Record<Role, string> = { ADMIN: "แอดมิน", SUPERVISOR: "หัวหน้าภาค", EMPLOYEE: "ช่าง", SYSTEM: "ระบบ" };
const ROLE_COLOR: Record<Role, { fg: string; bg: string }> = {
  ADMIN: { fg: "#6D4AD1", bg: "#EEE9FB" },
  SUPERVISOR: { fg: "#0A7C86", bg: "#E2F4F5" },
  EMPLOYEE: { fg: "#C2620A", bg: "#FCEFE3" },
  SYSTEM: { fg: "#6B7785", bg: "#EEF1F4" },
};
// สีของแถบสัดส่วนเวลา — ตามคนที่ถือลูกบอลในขั้นนั้น
const STAGE_COLOR: Record<string, string> = {
  NEW: ROLE_COLOR.SUPERVISOR.fg,
  INSPECTING: ROLE_COLOR.EMPLOYEE.fg,
  WAITING_PARTS: ROLE_COLOR.SUPERVISOR.fg,
  PARTS_REQUESTED: ROLE_COLOR.ADMIN.fg,
  AWAITING_QUOTE: ROLE_COLOR.ADMIN.fg,
  AWAITING_PAYMENT: ROLE_COLOR.ADMIN.fg,
  PARTS_CHECKED: ROLE_COLOR.SUPERVISOR.fg,
  ASSIGNED: ROLE_COLOR.SUPERVISOR.fg,
  AWAITING_CONFIRM: ROLE_COLOR.SYSTEM.fg,
  IN_PROGRESS: ROLE_COLOR.EMPLOYEE.fg,
};
const DAY = 86_400_000;
const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** 3 ว. 3 ชม. · 1 ชม. 21 น. · 35 น. — สองหน่วยใหญ่สุดพอ อ่านเร็วกว่าตัวเลขเต็ม */
export function duration(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "ไม่ถึง 1 น.";
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d) return h ? `${d} ว. ${h} ชม.` : `${d} ว.`;
  if (h) return mm ? `${h} ชม. ${mm} น.` : `${h} ชม.`;
  return `${mm} น.`;
}
// เวลาไทย ไม่ขึ้นกับเขตเวลาของเครื่องที่เปิด
function bkk(iso: string) {
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
  return {
    day: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`,
    time: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
    full: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear() + 543} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
  };
}

export default function TimelineModal({ target, onClose }: { target: TimelineTarget; onClose: () => void }) {
  const [wo, setWo] = useState<WoTimeline | null>(null);
  const [team, setTeam] = useState<TeamTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState<Set<Role>>(new Set());

  useEffect(() => {
    const req =
      target.kind === "wo"
        ? api.get<WoTimeline>(`/work-orders/${target.id}/timeline`).then((r) => setWo(r.data))
        : api.get<TeamTimeline>("/plans/timeline", { params: { date: target.date, team: target.team } }).then((r) => setTeam(r.data));
    req.catch((e) => setError(apiErrorMessage(e)));
  }, [target]);

  const events = (wo?.events ?? team?.events ?? []).filter((e) => !off.has(e.role));
  const roles = useMemo(() => [...new Set((wo?.events ?? team?.events ?? []).map((e) => e.role))], [wo, team]);
  const title = target.kind === "wo" ? `ไทม์ไลน์ ${target.code}` : `ไทม์ไลน์ทีม ${target.team}`;

  function toggle(r: Role) {
    setOff((s) => {
      const n = new Set(s);
      if (n.has(r)) n.delete(r);
      else n.add(r);
      return n;
    });
  }

  return (
    <AppModal visible onClose={onClose} title={title} width={640}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && !wo && !team ? <Spinner color={colors.primary} /> : null}

      {wo ? (
        <>
          <Text style={styles.head}>
            {wo.workOrder.branch.code} {wo.workOrder.branch.name} · {wo.workOrder.title}
          </Text>
          <Text style={styles.muted}>
            เปิด {bkk(wo.workOrder.createdAt).full}
            {wo.workOrder.closedAt ? ` · ปิด ${bkk(wo.workOrder.closedAt).full}` : ` · ตอนนี้: ${wo.workOrder.statusLabel}`}
            {wo.workOrder.team ? ` · ทีม${wo.workOrder.team}` : ""}
          </Text>
          <View style={styles.kpis}>
            <Kpi v={duration(wo.summary.totalMs)} k={wo.summary.open ? "เปิดมาแล้ว (ยังไม่ปิด)" : "เปิด → ปิดงาน"} />
            <Kpi v={wo.summary.longest ? duration(wo.summary.longest.ms) : "—"} k={wo.summary.longest ? `นานสุด: ${wo.summary.longest.label}` : "ช่วงที่นานสุด"} />
            <Kpi v={wo.summary.onSiteMs !== null ? duration(wo.summary.onSiteMs) : "—"} k="ช่างอยู่หน้างาน" />
            <Kpi v={`${wo.summary.people} คน`} k="แตะใบงานนี้" />
          </View>
          {wo.stages.length ? (
            <View style={{ gap: 6 }}>
              <View style={styles.bar} accessibilityLabel="สัดส่วนเวลาแต่ละช่วง">
                {wo.stages.map((s, i) => (
                  <View key={i} style={{ flex: Math.max(s.ms, 1), backgroundColor: STAGE_COLOR[s.status] ?? colors.textMuted, opacity: i % 2 ? 0.6 : 1 }} />
                ))}
              </View>
              <View style={styles.legend}>
                {wo.stages.map((s, i) => (
                  <Text key={i} style={styles.legendText}>
                    <Text style={{ color: STAGE_COLOR[s.status] ?? colors.textMuted }}>■ </Text>
                    {s.label} {duration(s.ms)}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}
        </>
      ) : null}

      {team ? (
        <Text style={styles.muted}>
          {team.members.length ? team.members.map((m, i) => (i === 0 ? `★ ${m}` : m)).join(" · ") : "ยังไม่ได้จัดคน"}
          {team.vehicle ? ` · รถ ${team.vehicle}` : ""}
        </Text>
      ) : null}

      {roles.length > 1 ? (
        <View style={styles.chips}>
          {roles.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.chip, off.has(r) && { opacity: 0.4 }]}
              onPress={() => toggle(r)}
              accessibilityLabel={`กรอง ${ROLE_LABEL[r]}`}
              accessibilityState={{ selected: !off.has(r) }}
            >
              <View style={[styles.dot, { backgroundColor: ROLE_COLOR[r].fg }]} />
              <Text style={styles.chipText}>{ROLE_LABEL[r]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {(wo || team) && events.length === 0 ? <Text style={styles.muted}>ยังไม่มีรายการ</Text> : null}
      <View>
        {events.map((e, i) => {
          const t = bkk(e.at);
          const prev = events[i - 1];
          const gap = prev ? new Date(e.at).getTime() - new Date(prev.at).getTime() : 0;
          const showDay = !prev || bkk(prev.at).day !== t.day;
          return (
            <View key={i}>
              {gap >= 30 * 60_000 ? (
                <View style={styles.row}>
                  <View style={styles.timeCol} />
                  <View style={styles.railCol}>
                    <View style={styles.line} />
                  </View>
                  <Text style={[styles.gap, gap >= DAY && styles.gapLong]}>
                    {gap >= DAY ? "⚠ รอ " : "⋮ "}
                    {duration(gap)}
                  </Text>
                </View>
              ) : null}
              <View style={styles.row}>
                <View style={styles.timeCol}>
                  <Text style={styles.time}>{t.time}</Text>
                  {showDay ? <Text style={styles.day}>{t.day}</Text> : null}
                </View>
                <View style={styles.railCol}>
                  <View style={[styles.line, i === 0 && { top: 10 }, i === events.length - 1 && { bottom: undefined, height: 10 }]} />
                  <View style={[styles.node, { backgroundColor: ROLE_COLOR[e.role].fg }]} />
                </View>
                <View style={styles.body}>
                  <View style={styles.whoRow}>
                    <Text style={[styles.role, { color: ROLE_COLOR[e.role].fg, backgroundColor: ROLE_COLOR[e.role].bg }]}>
                      {ROLE_LABEL[e.role]}
                    </Text>
                    <Text style={styles.who}>{e.who}</Text>
                  </View>
                  <Text style={styles.what}>{e.what}</Text>
                  {e.note ? <Text style={styles.note}>{e.note}</Text> : null}
                  {e.tags?.length ? (
                    <View style={styles.tags}>
                      {e.tags.map((g, j) => (
                        <Text
                          key={j}
                          style={[
                            styles.tag,
                            g.tone === "ok" && { color: colors.successInk, backgroundColor: colors.successSoft },
                            g.tone === "warn" && { color: colors.warningInk, backgroundColor: colors.warningSoft },
                          ]}
                        >
                          {g.text}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </AppModal>
  );
}

function Kpi({ v, k }: { v: string; k: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiV}>{v}</Text>
      <Text style={styles.kpiK}>{k}</Text>
    </View>
  );
}

/** ปุ่มสีทอง — วางในทุกจุดของหน้าแผนงานและหน้าใบงาน แสดงเฉพาะ Super Admin (ผู้เรียกเช็คเอง) */
export function TimelineButton({ onPress, label, compact }: { onPress: () => void; label: string; compact?: boolean }) {
  return (
    <TouchableOpacity style={styles.btn} onPress={onPress} accessibilityLabel={label} activeOpacity={0.75}>
      <Ionicons name="time-outline" size={14} color={GOLD} />
      {compact ? null : <Text style={styles.btnText}>ไทม์ไลน์</Text>}
    </TouchableOpacity>
  );
}

const GOLD = "#8A6A00";
const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 14 },
  head: { fontSize: 15, fontWeight: "700", color: colors.text },
  muted: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpi: { flexGrow: 1, flexBasis: 120, backgroundColor: colors.sky50, borderRadius: radius.md, padding: 8 },
  kpiV: { fontSize: 16, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  kpiK: { fontSize: 11.5, color: colors.textMuted },
  bar: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: colors.border },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 2 },
  legendText: { fontSize: 11.5, color: colors.textMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: colors.card },
  chipText: { fontSize: 12.5, fontWeight: "600", color: colors.text },
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: { flexDirection: "row", gap: 8 },
  timeCol: { width: 52, alignItems: "flex-end", paddingTop: 2 },
  time: { fontSize: 13, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  day: { fontSize: 10.5, color: colors.textMuted },
  railCol: { width: 14, alignItems: "center" },
  line: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: colors.border },
  node: { width: 11, height: 11, borderRadius: 6, marginTop: 6, borderWidth: 2, borderColor: colors.card },
  body: { flex: 1, minWidth: 0, gap: 2, paddingBottom: 12 },
  whoRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  role: { fontSize: 11, fontWeight: "700", borderRadius: 5, paddingHorizontal: 6, overflow: "hidden" },
  who: { fontSize: 12.5, color: colors.textMuted },
  what: { fontSize: 14, fontWeight: "600", color: colors.text },
  note: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  tag: { fontSize: 11, color: colors.textMuted, backgroundColor: colors.sky50, borderRadius: 5, paddingHorizontal: 6, overflow: "hidden" },
  gap: { fontSize: 11.5, color: colors.textMuted, paddingBottom: 8 },
  gapLong: { color: colors.warningInk, fontWeight: "700" },
  btn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderColor: "#D4AF37", backgroundColor: "#FFF6D6", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  btnText: { fontSize: 12, fontWeight: "700", color: GOLD },
});
