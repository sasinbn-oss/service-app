/**
 * การใช้งานแอป — ใครใช้ตอนไหน นานเท่าไร (Super Admin และแอดมิน · เจ้าของงานขอ ต.ค. 69 ตามตัวอย่างที่เลือก)
 *
 * ภาพรวม (ตัวเลข · ตารางสีวัน×ชั่วโมง) → รายคนพร้อมแถบเวลาวันนี้ → กดชื่อดูย้อนหลังรายวัน
 * ค้นหาชื่อ/รหัส/ทีม/ภาคได้ — ค้นที่เซิร์ฟเวอร์ ตัวเลขด้านบนจึงนับตามคนที่ค้นเจอด้วย
 * ข้อมูลมาจาก backend/src/routes/usage.ts — "เวลาใช้" นับเป็นช่วง 5 นาทีที่มีการใช้จริง ไม่ใช่เวลาที่เปิดแอปค้างไว้
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import AppModal from "../components/AppModal";
import { useRefreshHandler } from "../components/RefreshButton";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { openUrl } from "../utils/share";
import { showAlert } from "../utils/alert";
import { colors, headingFont, radius, spacing } from "../theme";

type Range = "today" | "7d" | "30d" | "all";
type RoleF = "ALL" | "EMPLOYEE" | "SUPERVISOR" | "ADMIN" | "AREA_TEAM";
interface Bar {
  from: string;
  to: string;
  /** ACTION = ประมาณจากการทำงานในระบบ (ก่อนเริ่มจดจริง) */
  device: "WEB" | "MOBILE" | "ACTION";
}
interface Person {
  id: number;
  name: string;
  code: string;
  roleLabel: string;
  team: string | null;
  lastSeen: string | null;
  online: boolean;
  sessions: number;
  minutes: number;
  activeDays: number;
  devices: string[];
  today: Bar[];
}
interface Data {
  since: string | null;
  stats: { online: number; active: number; total: number; peakHour: number | null; avgMinutesPerDay: number; never: number };
  heatmap: { days: string[]; hours: number[]; cells: number[][] };
  people: Person[];
}
interface DayRow {
  day: string;
  minutes: number;
  sessions: number;
  first: string | null;
  last: string | null;
  bars: Bar[];
}

const RANGES: { v: Range; l: string }[] = [
  { v: "today", l: "วันนี้" },
  { v: "7d", l: "7 วัน" },
  { v: "30d", l: "30 วัน" },
  { v: "all", l: "ตั้งแต่เปิดบัญชี" },
];
const ROLES: { v: RoleF; l: string }[] = [
  { v: "ALL", l: "ทุกตำแหน่ง" },
  { v: "EMPLOYEE", l: "ช่าง" },
  { v: "SUPERVISOR", l: "หัวหน้าภาค" },
  { v: "ADMIN", l: "แอดมิน" },
  { v: "AREA_TEAM", l: "Area Team" },
];
// แถบเวลาแสดง 06–22 น. — ช่วงที่คนทำงานจริง นอกช่วงนี้ยังนับในตัวเลข แค่ไม่วาด
const T0 = 6;
const T1 = 22;
const TH_DAY = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const bkk = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000);
const hm = (iso: string) => bkk(iso).toISOString().slice(11, 16);
const dayLabel = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${TH_DAY[d.getUTCDay()]} ${d.getUTCDate()}`;
};
const fullDate = (iso: string) => {
  const d = bkk(iso);
  return `${d.getUTCDate()} ${TH_MONTH[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
};
const duration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} ชม. ${String(min % 60).padStart(2, "0")} น.` : `${min} น.`);

/** "ตอนนี้" · "10 นาทีที่แล้ว" · "14:05" (วันนี้) · "เมื่อวาน 16:42" · "3 วันที่แล้ว" · "ยังไม่เคยเข้า" */
function lastSeenText(p: Person) {
  if (!p.lastSeen) return "ยังไม่เคยเข้า";
  if (p.online) return "ตอนนี้";
  const mins = Math.round((Date.now() - new Date(p.lastSeen).getTime()) / 60_000);
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const day = (iso: string) => bkk(iso).toISOString().slice(0, 10);
  const today = day(new Date().toISOString());
  const d = day(p.lastSeen);
  if (d === today) return hm(p.lastSeen);
  const diff = Math.round((Date.parse(today) - Date.parse(d)) / 86_400_000);
  if (diff === 1) return `เมื่อวาน ${hm(p.lastSeen)}`;
  return `${diff} วันที่แล้ว`;
}

function TimeBar({ bars, height = 16 }: { bars: Bar[]; height?: number }) {
  return (
    <View style={[styles.bar, { height }]}>
      {bars.map((b, i) => {
        const a = bkk(b.from);
        const z = bkk(b.to);
        const from = a.getUTCHours() + a.getUTCMinutes() / 60;
        const to = z.getUTCHours() + z.getUTCMinutes() / 60 || 24;
        const l = Math.max(0, (from - T0) / (T1 - T0));
        const r = Math.min(1, (to - T0) / (T1 - T0));
        if (r <= 0 || l >= 1) return null;
        return (
          <View
            key={i}
            style={[
              styles.barSeg,
              { left: `${l * 100}%`, width: `${Math.max(0.8, (r - l) * 100)}%` },
              b.device === "MOBILE" && { backgroundColor: colors.success },
              b.device === "ACTION" && { backgroundColor: colors.textFaint },
            ]}
          />
        );
      })}
    </View>
  );
}

function Axis() {
  return (
    <View style={styles.axis}>
      {Array.from({ length: (T1 - T0) / 2 + 1 }, (_, i) => T0 + i * 2).map((h) => (
        <Text key={h} style={styles.axisText}>
          {String(h).padStart(2, "0")}
        </Text>
      ))}
    </View>
  );
}

function Chips<T extends string>({ items, value, onPick }: { items: { v: T; l: string }[]; value: T; onPick: (v: T) => void }) {
  return (
    <View style={styles.seg}>
      {items.map((it) => (
        <TouchableOpacity key={it.v} style={[styles.segItem, value === it.v && styles.segOn]} onPress={() => onPick(it.v)}>
          <Text style={[styles.segText, value === it.v && styles.segTextOn]}>{it.l}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function AppUsageScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [range, setRange] = useState<Range>("today");
  const [role, setRole] = useState<RoleF>("ALL");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Person | null>(null);
  const seq = useRef(0);

  // พิมพ์ค้นหาแล้วรอหยุดพิมพ์ 300 ms ค่อยถาม — ไม่งั้นพิมพ์ชื่อสิบตัวอักษรคือสิบคำขอ
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await api.get<Data>("/usage", { params: { range, role, ...(q ? { q } : {}) }, loadingText: false });
      if (n !== seq.current) return;
      setData(r.data);
      setError(null);
    } catch (e) {
      if (n === seq.current) setError(apiErrorMessage(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [range, role, q]);
  useEffect(() => {
    void load();
  }, [load]);
  useRefreshHandler(load);

  async function download() {
    try {
      const r = await api.get<{ path: string }>("/usage/export", {
        params: { range, role, ...(q ? { q } : {}) },
        loadingText: "กำลังสร้างไฟล์ Excel...",
      });
      const url = resolveImageUrl(r.data.path);
      if (url) await openUrl(url);
    } catch (e) {
      showAlert("ดาวน์โหลดไม่สำเร็จ", apiErrorMessage(e));
    }
  }

  const s = data?.stats;
  const max = Math.max(1, ...(data?.heatmap.cells.flat() ?? [1]));
  // ชั่วโมงที่โชว์ = 06–22 บวกชั่วโมงนอกช่วงที่มีคนใช้จริง (กะดึก) — ไม่ซ่อนข้อมูลจริงทิ้ง
  const hours = (data?.heatmap.hours ?? []).filter(
    (h) => (h >= T0 && h <= T1) || data!.heatmap.cells.some((row) => row[h] > 0)
  );
  const peak = s?.peakHour ?? null;
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headRow}>
        <View style={{ flex: 1, minWidth: 220 }}>
          {/* ชื่อหน้าอยู่บนแถบหัวแล้ว (ทั้งจอกว้างและจอแคบ) ไม่พิมพ์ซ้ำ */}
          <Text style={styles.sub}>
            ใครใช้ตอนไหน นานเท่าไร · นับเป็นช่วง 5 นาทีที่มีการใช้จริง
            {data?.since ? ` · จดจริงตั้งแต่ ${dayLabel(bkk(data.since).toISOString().slice(0, 10))} ${TH_MONTH[bkk(data.since).getUTCMonth()]}` : ""}
            {" "}· ก่อนหน้านั้น (สีเทา) ประมาณจากการทำงานในระบบ — นับเฉพาะตอนที่กดทำอะไร เปิดดูเฉย ๆ ไม่นับ
          </Text>
        </View>
        <TouchableOpacity style={styles.dl} onPress={download} accessibilityLabel="ดาวน์โหลด Excel การใช้งาน">
          <Ionicons name="download-outline" size={17} color={colors.navy} />
          <Text style={styles.dlText}>Excel</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filters}>
        <Chips items={RANGES} value={range} onPick={setRange} />
        <Chips items={ROLES} value={role} onPick={setRole} />
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="ค้นหาชื่อ รหัส ทีม หรือภาค"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="ค้นหารายชื่อ"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery("")} accessibilityLabel="ล้างคำค้น">
              <Ionicons name="close-circle" size={17} color={colors.textFaint} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!data ? (
        <Spinner page />
      ) : (
        <>
          <View style={styles.tiles}>
            <Tile n={s!.online} label="ใช้งานอยู่ตอนนี้" tone={colors.successInk} />
            <Tile n={s!.active} label={`คนที่เข้าใช้${range === "today" ? "วันนี้" : "ในช่วงนี้"} (จาก ${s!.total})`} />
            <Tile n={peak === null ? "—" : `${String(peak).padStart(2, "0")}–${String(peak + 1).padStart(2, "0")} น.`} label="ช่วงที่ใช้มากที่สุด" />
            <Tile n={s!.avgMinutesPerDay ? duration(s!.avgMinutesPerDay) : "—"} label="เฉลี่ยต่อคนต่อวัน" />
            <Tile n={s!.never} label="ยังไม่เคยเข้าเลย" tone={s!.never ? colors.dangerInk : undefined} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>ช่วงเวลาที่มีคนใช้ — {data.heatmap.days.length} วันล่าสุด</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={styles.hmRow}>
                  <Text style={styles.hmDay} />
                  {hours.map((h) => (
                    <Text key={h} style={styles.hmHour}>
                      {String(h).padStart(2, "0")}
                    </Text>
                  ))}
                </View>
                {data.heatmap.days.map((d, i) => (
                  <View key={d} style={styles.hmRow}>
                    <Text style={styles.hmDay}>{dayLabel(d)}</Text>
                    {hours.map((h) => {
                      const v = data.heatmap.cells[i][h];
                      return (
                        <View
                          key={h}
                          style={[styles.hmCell, { backgroundColor: v ? colors.primary : colors.background, opacity: v ? 0.25 + 0.75 * (v / max) : 1 }]}
                          accessibilityLabel={`${dayLabel(d)} ${h}:00 ${v} คน`}
                        />
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
            <Text style={styles.hint}>ช่องเข้ม = มีคนใช้พร้อมกันเยอะ · ตัวเลขคือจำนวนคน ไม่ใช่จำนวนครั้ง</Text>
          </View>

          <View style={styles.card}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={[styles.cardTitle, { flex: 1 }]}>รายคน · {data.people.length} คน</Text>
              {loading ? <Spinner size="small" /> : null}
            </View>
            <View style={styles.legend}>
              <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.hint}>คอม</Text>
              <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
              <Text style={styles.hint}>มือถือ</Text>
              <View style={[styles.legendDot, { backgroundColor: colors.textFaint }]} />
              <Text style={styles.hint}>จากการทำงานในระบบ · แถบ = วันนี้ {T0}:00–{T1}:00 · กดชื่อเพื่อดูย้อนหลัง</Text>
            </View>
            {wide ? (
              <View style={[styles.pRow, styles.pHead]}>
                <Text style={[styles.th, { flex: 2.2 }]}>ชื่อ</Text>
                <Text style={[styles.th, { flex: 1.2 }]}>ใช้ล่าสุด</Text>
                <Text style={[styles.th, { flex: 0.6 }]}>ครั้ง</Text>
                <Text style={[styles.th, { flex: 1 }]}>รวม</Text>
                <View style={{ flex: 4 }}>
                  <Axis />
                </View>
              </View>
            ) : null}
            {data.people.map((p) => {
              const last = lastSeenText(p);
              const lastStyle = p.online ? styles.live : !p.lastSeen ? styles.never : undefined;
              return wide ? (
                <TouchableOpacity key={p.id} style={styles.pRow} onPress={() => setPicked(p)} accessibilityLabel={`การใช้งานของ ${p.name}`}>
                  <View style={{ flex: 2.2, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {p.roleLabel}
                      {p.team ? ` · ${p.team}` : ""}
                    </Text>
                  </View>
                  <Text style={[styles.cell, { flex: 1.2 }, lastStyle]}>{p.online ? "● " : ""}{last}</Text>
                  <Text style={[styles.cell, { flex: 0.6 }]}>{p.sessions}</Text>
                  <Text style={[styles.cell, { flex: 1 }]}>{p.minutes ? duration(p.minutes) : "—"}</Text>
                  <View style={{ flex: 4 }}>
                    <TimeBar bars={p.today} />
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity key={p.id} style={styles.pCard} onPress={() => setPicked(p)} accessibilityLabel={`การใช้งานของ ${p.name}`}>
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {p.roleLabel}
                        {p.team ? ` · ${p.team}` : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.cell, lastStyle]}>{p.online ? "● " : ""}{last}</Text>
                      <Text style={styles.meta}>
                        {p.sessions} ครั้ง · {p.minutes ? duration(p.minutes) : "—"}
                      </Text>
                    </View>
                  </View>
                  <TimeBar bars={p.today} height={12} />
                </TouchableOpacity>
              );
            })}
            {!data.people.length ? <Text style={styles.hint}>ไม่พบรายชื่อที่ตรงกับคำค้น</Text> : null}
          </View>
        </>
      )}
      {picked ? <PersonDetail person={picked} onClose={() => setPicked(null)} /> : null}
    </ScrollView>
  );
}

function Tile({ n, label, tone }: { n: number | string; label: string; tone?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileN, headingFont, tone ? { color: tone } : null]}>{n}</Text>
      <Text style={styles.tileL}>{label}</Text>
    </View>
  );
}

function PersonDetail({ person, onClose }: { person: Person; onClose: () => void }) {
  const [days, setDays] = useState<DayRow[] | null>(null);
  const [span, setSpan] = useState<"7" | "30" | "90" | "all">("7");
  const [firstUse, setFirstUse] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  useEffect(() => {
    setDays(null);
    api
      .get<{ days: DayRow[]; firstUse: string | null; user: { createdAt: string } }>(`/usage/user/${person.id}`, { params: { days: span } })
      .then((r) => {
        setDays(r.data.days);
        setFirstUse(r.data.firstUse);
        setOpened(r.data.user.createdAt);
      })
      .catch((e) => {
        showAlert("โหลดไม่สำเร็จ", apiErrorMessage(e));
        onClose();
      });
  }, [person.id, span]);
  const used = (days ?? []).filter((d) => d.minutes > 0);
  const avg = (pick: (d: DayRow) => string | null) => {
    const mins = used.map((d) => pick(d)).filter(Boolean).map((iso) => {
      const t = bkk(iso!);
      return t.getUTCHours() * 60 + t.getUTCMinutes();
    });
    if (!mins.length) return "—";
    const m = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };
  return (
    <AppModal visible onClose={onClose} title={person.name} subtitle={`${person.roleLabel}${person.team ? ` · ${person.team}` : ""} · ${person.code}`} width={720}>
      <View style={{ gap: spacing.sm }}>
        <Chips
          items={[
            { v: "7" as const, l: "7 วัน" },
            { v: "30" as const, l: "30 วัน" },
            { v: "90" as const, l: "90 วัน" },
            { v: "all" as const, l: "ตั้งแต่เปิดบัญชี" },
          ]}
          value={span}
          onPick={setSpan}
        />
        {!days ? (
          <Spinner />
        ) : (
          <>
            <Text style={styles.sub}>
              {span === "all"
                ? `เปิดบัญชี ${opened ? fullDate(opened) : "—"} · ใช้ครั้งแรก ${firstUse ? fullDate(firstUse) : "ยังไม่เคยใช้"} · ใช้ทั้งหมด ${used.length} วัน`
                : `ใช้ ${used.length} จาก ${days.length} วัน`}
              {" "}· เข้าครั้งแรกของวันเฉลี่ย {avg((d) => d.first)} · เลิกใช้เฉลี่ย {avg((d) => d.last)}
            </Text>
            {span === "all" && !days.length ? <Text style={styles.hint}>ยังไม่มีการใช้งานเลย</Text> : null}
            <View style={styles.dRow}>
              <Text style={styles.dDay} />
              <View style={{ flex: 1 }}>
                <Axis />
              </View>
              <Text style={styles.dTot} />
            </View>
            {days.map((d) => (
              <View key={d.day} style={styles.dRow}>
                {/* ตั้งแต่เปิดบัญชียาวหลายเดือน — วันเฉย ๆ ไม่พอ ต้องมีเดือนด้วย */}
                <Text style={[styles.dDay, span === "all" && { width: 84 }]}>
                  {dayLabel(d.day)}
                  {span === "all" ? ` ${TH_MONTH[Number(d.day.slice(5, 7)) - 1]}` : ""}
                </Text>
                <View style={{ flex: 1 }}>
                  <TimeBar bars={d.bars} height={14} />
                </View>
                <Text style={[styles.dTot, !d.minutes && { color: colors.textFaint }]}>{d.minutes ? duration(d.minutes) : "ไม่ได้ใช้"}</Text>
              </View>
            ))}
          </>
        )}
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  headRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, alignItems: "center" },
  sub: { fontSize: 13, lineHeight: 21, color: colors.textMuted },
  dl: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, height: 38 },
  dlText: { color: colors.navy, fontWeight: "700" },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  seg: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: colors.border, borderRadius: 999, overflow: "hidden", backgroundColor: colors.card, alignSelf: "flex-start" },
  segItem: { paddingHorizontal: 13, paddingVertical: 6 },
  segOn: { backgroundColor: colors.navyFill },
  segText: { fontSize: 13, color: colors.textMuted },
  segTextOn: { color: "#fff", fontWeight: "700" },
  search: { flexGrow: 1, flexBasis: 220, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 999, backgroundColor: colors.card, paddingHorizontal: 12, height: 36 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, color: colors.text, paddingVertical: 0 },
  error: { color: colors.dangerInk },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: 150, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  tileN: { fontSize: 24, fontWeight: "800", color: colors.navy },
  tileL: { fontSize: 12, color: colors.textMuted },
  card: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  hint: { fontSize: 12, lineHeight: 19, color: colors.textMuted },
  hmRow: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 3 },
  hmDay: { width: 52, fontSize: 11, color: colors.textMuted, textAlign: "right", paddingRight: 4 },
  hmHour: { width: 24, fontSize: 10, color: colors.textMuted, textAlign: "center" },
  hmCell: { width: 24, height: 20, borderRadius: 4 },
  legend: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  pHead: { borderTopWidth: 0, paddingVertical: 4 },
  pRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 9, borderTopWidth: 1, borderColor: colors.border },
  pCard: { gap: 6, paddingVertical: 10, borderTopWidth: 1, borderColor: colors.border },
  th: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  name: { fontSize: 14, fontWeight: "700", color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
  cell: { fontSize: 13, color: colors.text },
  live: { color: colors.successInk, fontWeight: "700" },
  never: { color: colors.dangerInk, fontWeight: "700" },
  bar: { position: "relative", backgroundColor: colors.background, borderRadius: 5, overflow: "hidden" },
  barSeg: { position: "absolute", top: 2, bottom: 2, borderRadius: 3, backgroundColor: colors.primary },
  axis: { flexDirection: "row", justifyContent: "space-between" },
  axisText: { fontSize: 10, color: colors.textFaint },
  dRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dDay: { width: 48, fontSize: 12, color: colors.textMuted },
  dTot: { width: 78, fontSize: 12, color: colors.text, textAlign: "right" },
});
