/**
 * ผังผู้รับผิดชอบพื้นที่ — ฝ่ายบริการ → ภาค → หัวหน้าภาค → ทีมช่าง → ช่าง (เจ้าของงานขอ ต.ค. 69)
 *
 * ทุกคนเปิดดูได้ · แอดมินกด "แก้ไขผัง" แล้วลากชื่อย้ายได้ (บนจอคอม) หรือแตะชื่อแล้วแตะปลายทาง (มือถือ)
 * มีเบอร์โทรใต้ชื่อทุกคนที่มีเบอร์ (แตะแล้วโทร) · ปุ่มสลับไปผังฝั่ง Area (components/AreaMap.tsx) — เจ้าของงานขอ ต.ค. 69
 * จอแคบเรียงภาคลงมาทีละภาคเต็มความกว้าง แทนเลื่อนซ้ายขวา — บนมือถือเลื่อนข้างทีละคอลัมน์หาคนไม่เจอ
 * - ช่าง → ทีม (หรือทีมรวม) · หัวหน้าภาค → หัวภาค (ดูแลทั้งภาค) หรือทีม (ดูแลเพิ่ม/ย้ายทีมที่ดูแล)
 * - Senior ช่างถือได้หลายทีม/ทีมรวม (ต.ค. 69) — ชื่อขึ้นในทุกกล่องที่ถือ มีป้าย "Senior" · วางที่ทีม = "เพิ่ม" ไม่ย้าย
 *   (กติกาเดียวกับหัวหน้าภาคหลายภาค) · ลากชื่อในกล่องไป "ยังไม่มีสังกัด" = เลิกดูแลเฉพาะทีมนั้น
 * - หัวหน้าภาคถือได้หลายภาค (ต.ค. 69) — วางที่หัวภาค = "เพิ่ม" ภาคนั้น ไม่ทับภาคเดิม ชื่อจึงขึ้นในทุกภาคที่ถือ
 *   ย้ายภาค = วางที่ภาคใหม่ แล้วลากชื่อในภาคเก่าไป "ยังไม่มีสังกัด" (สองบรรทัดในรายการรอบันทึก เห็นชัดว่าทำอะไร)
 * - ลากไปที่ "ยังไม่มีสังกัด" = เอาออกเฉพาะที่ที่ลากมา (ทีมนั้น/ภาคนั้น) · คนที่ยังไม่มีสังกัดลากจากกล่องนั้นเข้าทีมได้
 * ย้ายแล้วยังไม่บันทึกจนกด "บันทึก" — ลากพลาดหนึ่งครั้งไม่ควรทำให้ช่างทั้งคนมองไม่เห็นงาน
 * บันทึกผ่าน PATCH /auth/users/:id ตัวเดียวกับหน้าสิทธิ์ผู้ใช้ (กฎชุดเดียว)
 *
 * ข้อมูลจาก GET /teams/coverage-map — ภาคของทีม = ภาคที่สาขาของทีมอยู่มากที่สุด
 * ลากบนเว็บใช้ HTML5 drag & drop ผ่าน DOM ของ react-native-web ตรง ๆ (ref ของ View คือ element จริงบนเว็บ)
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useRefreshHandler } from "../components/RefreshButton";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { feedback } from "../components/Feedback";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { colors, headingFont, radius, shadow } from "../theme";
import AreaMap, { ChartKind, ChartSwitch } from "../components/AreaMap";
import { CallButton, PhoneLine, phoneDigits } from "../components/PhoneLink";
import { useAuth } from "../context/AuthContext";
import { isAreaTeam } from "../utils/areaTeam";
import { regionsBody, regionsOf } from "../utils/regions";
import { teamsBody, teamsOf } from "../utils/teams";

interface TeamInfo {
  name: string;
  branches: number;
  open: number;
}
interface MapData {
  asOf: string;
  canEdit: boolean;
  /** noRegion = คอลัมน์ "ไม่ระบุภาค" (ทีมที่สาขาไม่ได้ตั้งภาค) — ไม่ใช่ภาคที่หัวหน้าภาคถือได้ */
  regions: { name: string; noRegion?: boolean; teams: TeamInfo[] }[];
  /** regions = ทุกภาคที่ถือ (หลายภาคได้) — เซิร์ฟเวอร์รุ่นเก่าส่งแค่ region อ่านผ่าน regionsOf() */
  supervisors: { id: number; name: string; code: string; phone: string | null; region: string | null; regions?: string[]; teams: string[] }[];
  technicians: Tech[];
  groups: { name: string; covers: string[]; allTeams: boolean }[];
}
interface Tech {
  id: number;
  name: string;
  code: string;
  phone: string | null;
  team: string | null;
  staleTeam: string | null;
  /** Senior ช่าง — ถือได้หลายทีม/ทีมรวม (เซิร์ฟเวอร์รุ่นเก่าไม่ส่ง) */
  senior?: boolean;
  role?: string;
  /** ทุกทีม/ทีมรวมที่ถือ · staleTeams = ชื่อที่ไม่มีในทะเบียนแล้ว */
  teams?: string[];
  staleTeams?: string[];
}
const isSenior = (t: Tech) => !!t.senior || t.role === "SENIOR_TECH";
/**
 * ทุกชื่อที่ Senior ถืออยู่ รวมชื่อที่ไม่มีในทะเบียนแล้ว — ตอนบันทึกส่งทั้งชุด (teams แทนที่ของเดิม)
 * ถ้าทิ้งชื่อค้างไว้ตรงนี้ ลากเพิ่มทีมเดียวแล้วชื่อเก่าหายไปด้วยโดยไม่มีใครสั่ง
 */
function seniorHeld(t: Tech) {
  const out: string[] = [];
  for (const x of [...teamsOf(t), t.staleTeam, ...(t.staleTeams ?? [])]) if (x && !out.includes(x)) out.push(x);
  return out;
}
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
type SupState = { regions: string[]; teams: string[] };
/** ที่ที่วางได้ — หัวภาค · ทีม (รวมทีมรวม) · กล่องยังไม่มีสังกัด */
type Zone = { kind: "region" | "team" | "tray"; target: string | null };
/** คนที่ถูกจับอยู่ และจับมาจากไหน — หัวหน้าภาคที่จับจากทีมคือย้าย "ทีมนั้น" ไม่ใช่ทั้งหมด */
type Grab = { id: number; kind: "TECH" | "SUP"; from: Zone | null };

const COL_W = 240;
const COL_GAP = 16;
const GOLD = "#B7892F";
const ini = (s: string) => s.trim().charAt(0) || "?";
const fmt = (n: number) => n.toLocaleString("th-TH");

function fmtAsOf(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
  return `${day} เวลา ${time} น.`;
}

// ── ลาก/วาง ─────────────────────────────────────────────

interface DnD {
  editing: boolean;
  grab: Grab | null;
  setGrab: (g: Grab | null) => void;
  drop: (g: Grab, z: Zone) => void;
  dragging: boolean;
  setDragging: (v: boolean) => void;
  query: string;
  setQuery: (q: string) => void;
}
const DnDContext = createContext<DnD | null>(null);
const ZoneContext = createContext<Zone | null>(null);
const useDnD = () => useContext(DnDContext)!;

/** element จริงบนเว็บ — react-native-web ส่ง DOM node ผ่าน ref ของ View */
const domOf = (r: React.RefObject<View | null>) => (Platform.OS === "web" ? (r.current as unknown as HTMLElement | null) : null);

function Person({
  grab,
  name,
  code,
  phone,
  role,
  sup,
  small,
  badge,
}: {
  grab: Grab;
  name: string;
  code: string;
  phone?: string | null;
  role: string;
  sup?: boolean;
  small?: boolean;
  /** ป้ายเล็กท้ายชื่อ — "Senior" ให้เห็นทันทีว่าคนนี้ดูหลายทีม ชื่อเดียวกันในกล่องอื่นคือคนเดียวกัน */
  badge?: string;
}) {
  const d = useDnD();
  const zone = useContext(ZoneContext);
  const ref = useRef<View>(null);
  const narrow = useWindowDimensions().width < 700;
  const qd = /^[\d\s-]+$/.test(d.query) ? d.query.replace(/\D/g, "") : "";
  const hit = !!d.query && (`${name} ${code} ${phone ?? ""}`.includes(d.query) || (!!qd && phoneDigits(phone).includes(qd)));
  // หัวหน้าภาคหลายภาคมีชื่อหลายที่ — ไฮไลต์เฉพาะชื่อที่แตะ (ที่มาบอกว่าลากออกแล้วจะเอาภาคไหนออก)
  const selected =
    d.grab?.id === grab.id && d.grab.kind === grab.kind && d.grab.from?.kind === grab.from?.kind && d.grab.from?.target === grab.from?.target;

  useEffect(() => {
    const el = domOf(ref);
    if (!el || !d.editing) return;
    el.draggable = true;
    const start = (e: DragEvent) => {
      e.dataTransfer?.setData("text/plain", JSON.stringify(grab));
      d.setGrab(grab);
      d.setDragging(true);
    };
    const end = () => d.setDragging(false);
    el.addEventListener("dragstart", start);
    el.addEventListener("dragend", end);
    return () => {
      el.draggable = false;
      el.removeEventListener("dragstart", start);
      el.removeEventListener("dragend", end);
    };
  }, [d.editing, grab.id, grab.kind, grab.from?.kind, grab.from?.target]);

  function press() {
    if (!d.editing) return d.setQuery(d.query === name ? "" : name);
    // เลือกคนไว้แล้ว แตะชื่อคนอื่นในทีม/ภาค = แตะที่นั่น (ชื่อเต็มกล่องทีมจนแตะพื้นที่ว่างแทบไม่ได้)
    if (d.grab && !(d.grab.id === grab.id && d.grab.kind === grab.kind) && zone) {
      const g = d.grab;
      d.setGrab(null);
      return d.drop(g, zone);
    }
    d.setGrab(selected ? null : grab);
  }

  return (
    <TouchableOpacity onPress={press} accessibilityLabel={`${role} ${name}`}>
      <View
        ref={ref}
        style={[styles.person, small && styles.personSmall, hit && styles.hit, selected && styles.selected]}
      >
        <View style={[styles.av, sup ? styles.avSup : styles.avTech, small && styles.avSmall]}>
          <Text style={[styles.avText, small && { fontSize: 11 }]}>{ini(name)}</Text>
        </View>
        <View style={{ flexShrink: 1 }}>
          {/* ชื่อตัดบรรทัดได้ ไม่ตัดเป็น … — คอลัมน์ภาคกว้างคงที่ ชื่อจริง+นามสกุล+ชื่อเล่นยาวเกินบรรทัดเดียวบ่อย
              ตัดแล้วชื่อเล่นหาย ซึ่งเป็นส่วนที่คนใช้เรียกกันจริง (เจ้าของงานแจ้งว่าผังขึ้นไม่ครบ ต.ค. 69) */}
          <Text style={styles.pn}>
            {name}
            {badge ? (
              <>
                {" "}
                <Text style={styles.badge}>{` ${badge} `}</Text>
              </>
            ) : null}
          </Text>
          {/* รหัสพนักงานก็ต้องเห็นครบ — คนใช้ค้นหาด้วยรหัส */}
          <Text style={styles.pr}>
            {role} · {code}
          </Text>
          {phone ? <PhoneLine phone={phone} name={name} /> : null}
        </View>
        {narrow && phone ? <CallButton phone={phone} name={name} /> : null}
      </View>
    </TouchableOpacity>
  );
}

function DropZone({ zone, style, children, label }: { zone: Zone; style?: object; children: React.ReactNode; label: string }) {
  const d = useDnD();
  const ref = useRef<View>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = domOf(ref);
    if (!el || !d.editing) return;
    const enter = (e: DragEvent) => {
      e.preventDefault();
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!el.contains(e.relatedTarget as Node)) setOver(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOver(false);
      d.setDragging(false);
      try {
        const g = JSON.parse(e.dataTransfer?.getData("text/plain") || "null") as Grab | null;
        if (g) d.drop(g, zone);
      } catch {
        // ลากของอื่นมาวาง (ข้อความ ไฟล์) — ไม่ใช่ชื่อคน ไม่ต้องทำอะไร
      }
      d.setGrab(null);
    };
    el.addEventListener("dragover", enter);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", enter);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
    };
  }, [d.editing, zone.kind, zone.target]);

  const armed = d.editing && (d.dragging || !!d.grab);
  return (
    <ZoneContext.Provider value={zone}>
      <TouchableOpacity
        activeOpacity={1}
        disabled={!d.editing || !d.grab}
        onPress={() => {
          if (!d.grab) return;
          const g = d.grab;
          d.setGrab(null);
          d.drop(g, zone);
        }}
        accessibilityLabel={label}
      >
        <View ref={ref} style={[style, armed && styles.dropArmed, over && styles.dropOver]}>
          {children}
        </View>
      </TouchableOpacity>
    </ZoneContext.Provider>
  );
}

// ── หน้าหลัก ─────────────────────────────────────────────

export default function CoverageMapScreen() {
  const { user } = useAuth();
  const narrow = useWindowDimensions().width < 700;
  // ทีม Area เปิดมาเจอผังฝั่งตัวเองก่อน — ผังฝ่ายบริการยังกดสลับไปดูได้
  const [which, setWhich] = useState<ChartKind>(isAreaTeam(user) ? "area" : "service");
  const [areaEditing, setAreaEditing] = useState(false);
  const areaReload = useRef<(() => Promise<void>) | null>(null);
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [grab, setGrab] = useState<Grab | null>(null);
  const [dragging, setDragging] = useState(false);
  const [techTeam, setTechTeam] = useState<Map<number, string | null>>(new Map());
  // Senior ช่าง: ทุกทีม/ทีมรวมที่ถือ (ช่างธรรมดาใช้ techTeam ทีมเดียว)
  const [seniorTeams, setSeniorTeams] = useState<Map<number, string[]>>(new Map());
  const [supState, setSupState] = useState<Map<number, SupState>>(new Map());
  const [log, setLog] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [trayQuery, setTrayQuery] = useState("");
  const [trayMin, setTrayMin] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const dockRef = useRef<View>(null);

  /**
   * ลากใกล้ขอบบน/ล่างแล้วหน้าเลื่อนเอง (เจ้าของงานขอ ต.ค. 69)
   *
   * เดิมกล่อง "ยังไม่มีสังกัด" อยู่บนสุด ทีมอยู่ล่างลงไปไกล ระหว่างลาก HTML5 เบราว์เซอร์ไม่เลื่อนกล่องที่เลื่อนได้ให้
   * (เลื่อนให้แค่หน้าเว็บทั้งหน้า ซึ่งของเราไม่เลื่อน) — ลากไปไม่ถึงทีม · ยิ่งใกล้ขอบยิ่งเร็ว
   * ขอบล่าง = ขอบบนของแถบที่ลอยอยู่ล่างจอ ไม่ใช่ขอบจอ (แถบบังส่วนล่างของผังอยู่)
   */
  useEffect(() => {
    if (Platform.OS !== "web" || !dragging) return;
    const node = (scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.();
    if (!node) return;
    let speed = 0;
    let frame = 0;
    let last = 0;
    const ZONE = 80;
    const over = (e: DragEvent) => {
      last = Date.now();
      const r = node.getBoundingClientRect();
      const dock = domOf(dockRef);
      const bottom = Math.min(r.bottom, dock ? dock.getBoundingClientRect().top : r.bottom);
      const y = e.clientY;
      speed = y < r.top + ZONE ? -Math.ceil((r.top + ZONE - y) / 4) : y > bottom - ZONE && y < bottom ? Math.ceil((y - (bottom - ZONE)) / 4) : 0;
    };
    const tick = () => {
      // ไม่มี dragover มาครึ่งวินาที = ลากจบ/หลุดไปแล้ว (เบราว์เซอร์ยิงเป็นระยะแม้เมาส์นิ่ง) — หยุดเลื่อน ไม่ให้ผังไหลเอง
      if (Date.now() - last > 500) speed = 0;
      if (speed) node.scrollTop += speed;
      frame = requestAnimationFrame(tick);
    };
    document.addEventListener("dragover", over);
    frame = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener("dragover", over);
      cancelAnimationFrame(frame);
    };
  }, [dragging]);

  // แตะ/คลิกชื่อค้างไว้แล้วเปลี่ยนใจ — Esc ยกเลิก (ป้ายบนจอบอกไว้)
  useEffect(() => {
    if (Platform.OS !== "web" || !grab) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setGrab(null);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [grab]);

  const load = useCallback(async () => {
    try {
      const res = await api.get<MapData>("/teams/coverage-map");
      setData(res.data);
      setTechTeam(new Map(res.data.technicians.map((t) => [t.id, t.team])));
      setSeniorTeams(new Map(res.data.technicians.filter(isSenior).map((t) => [t.id, seniorHeld(t)])));
      setSupState(new Map(res.data.supervisors.map((s) => [s.id, { regions: regionsOf(s), teams: [...s.teams] }])));
      setLog([]);
      setError(null);
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  // ปุ่มรีเฟรช/ลากรีเฟรชโหลดผังที่เปิดอยู่ — ผังฝั่ง Area โหลดของตัวเอง (components/AreaMap.tsx)
  useRefreshHandler(() => (which === "area" && areaReload.current ? areaReload.current() : load()));

  const regionOfTeam = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data?.regions ?? []) for (const t of r.teams) m.set(t.name, r.name);
    return m;
  }, [data]);
  const groupNames = useMemo(() => new Set((data?.groups ?? []).map((g) => g.name)), [data]);
  const pseudoRegions = useMemo(() => new Set((data?.regions ?? []).filter((r) => r.noRegion).map((r) => r.name)), [data]);
  // ชื่อที่มีกล่องในผัง (ทีมช่าง + ทีมรวม) — ชื่อที่ Senior ถือแต่ไม่อยู่ในนี้ = ไม่มีในทะเบียนแล้ว
  const placeable = useMemo(
    () => new Set([...(data?.regions ?? []).flatMap((r) => r.teams.map((t) => t.name)), ...groupNames]),
    [data, groupNames]
  );

  const drop = useCallback(
    (g: Grab, z: Zone) => {
      if (!data) return;
      if (g.kind === "TECH" && isSenior(data.technicians.find((x) => x.id === g.id)!)) {
        const t = data.technicians.find((x) => x.id === g.id)!;
        const cur = seniorTeams.get(g.id) ?? [];
        const fromTeam = g.from?.kind === "team" ? g.from.target : null;
        if (z.kind === "region") return feedback.toast("info", "Senior ช่างต้องอยู่ในทีม — วางที่กล่องทีมช่างหรือทีมรวม");
        let next: string[];
        let text: string;
        if (z.kind === "tray") {
          // เอาออกเฉพาะกล่องที่ลากมา ทีมอื่นที่ถืออยู่ไม่หายตาม (แบบเดียวกับหัวหน้าภาคหลายภาค)
          if (!fromTeam || !cur.includes(fromTeam)) return;
          next = cur.filter((x) => x !== fromTeam);
          text = `${t.name} (Senior ช่าง): เลิกดูแลทีม${fromTeam}${next.some((x) => placeable.has(x)) ? "" : " → ไม่มีสังกัด"}`;
        } else {
          const team = z.target!;
          if (cur.includes(team)) {
            return fromTeam === team ? undefined : feedback.toast("info", `${t.name} ดูแลทีม${team} อยู่แล้ว`);
          }
          // เพิ่ม ไม่ย้าย — ต่อท้ายให้ทีมแรก (team ที่แอปรุ่นเก่าอ่าน) คงเดิม · จะย้ายก็ลากชื่อในกล่องเดิมไปแถบเหลือง
          next = [...cur, team];
          text = `${t.name} (Senior ช่าง): ดูแลเพิ่มทีม${team}`;
        }
        setSeniorTeams((m) => new Map(m).set(g.id, next));
        setLog((l) => [...l, text]);
        return;
      }
      if (g.kind === "TECH") {
        const t = data.technicians.find((x) => x.id === g.id)!;
        const cur = techTeam.get(g.id) ?? null;
        if (z.kind === "region") return feedback.toast("info", "ช่างต้องอยู่ในทีม — วางที่กล่องทีมช่าง");
        const to = z.kind === "tray" ? null : z.target;
        if (cur === to) return;
        setTechTeam((m) => new Map(m).set(g.id, to));
        setLog((l) => [
          ...l,
          to ? `${t.name} (ช่าง): ${cur ? `ทีม${cur}` : "ไม่มีสังกัด"} → ทีม${to}` : `${t.name} (ช่าง): ออกจากทีม${cur} → ไม่มีสังกัด`,
        ]);
        return;
      }
      const s = data.supervisors.find((x) => x.id === g.id)!;
      const cur = supState.get(g.id) ?? { regions: [], teams: [] };
      let next: SupState = { regions: [...cur.regions], teams: [...cur.teams] };
      let text = "";
      const fromTeam = g.from?.kind === "team" ? g.from.target : null;
      const fromRegion = g.from?.kind === "region" ? g.from.target : null;
      if (z.kind === "tray") {
        if (fromTeam) {
          next.teams = next.teams.filter((t) => t !== fromTeam);
          text = `${s.name} (หัวหน้าภาค): เลิกดูแลทีม${fromTeam}`;
        } else if (fromRegion) {
          // ชื่อในหัวภาคหนึ่ง = คู่ (คน, ภาคนั้น) — เอาออกแค่ภาคนั้น ภาคอื่นที่ถืออยู่ไม่หายตาม
          if (!cur.regions.includes(fromRegion)) return;
          next.regions = next.regions.filter((r) => r !== fromRegion);
          text = `${s.name} (หัวหน้าภาค): เลิกดูแลภาค${fromRegion}`;
        } else {
          if (!cur.regions.length && !cur.teams.length) return;
          next = { regions: [], teams: [] };
          text = `${s.name} (หัวหน้าภาค): เลิกดูแลทั้งหมด → ไม่มีสังกัด`;
        }
      } else if (z.kind === "region") {
        const region = z.target!;
        // ห้ามตั้งแต่ตอนวาง ไม่ใช่รอให้บันทึกแล้วเซิร์ฟเวอร์ตอบ 400 — บันทึกทีละคน พังกลางทางแล้วคนที่เหลือในรายการหายตอนโหลดใหม่
        if (pseudoRegions.has(region)) {
          return feedback.toast("info", `ทีมกลุ่ม "${region}" สาขายังไม่ได้ตั้งภาคในทะเบียนสาขา — วางหัวหน้าภาคที่ทีมแทน`);
        }
        if (cur.regions.includes(region) && !fromTeam) {
          // วางกลับที่เดิม (ลากหลุดมือในภาคตัวเอง) ไม่ต้องเตือน — เตือนเฉพาะลากมาจากที่อื่น
          return fromRegion === region ? undefined : feedback.toast("info", `${s.name} ดูแลภาค${region} อยู่แล้ว`);
        }
        // เพิ่ม ไม่ทับ — ต่อท้ายเพื่อให้ภาคแรก (region ที่แอปรุ่นเก่าอ่าน) คงเดิม
        if (!next.regions.includes(region)) next.regions.push(region);
        if (fromTeam) next.teams = next.teams.filter((t) => t !== fromTeam);
        // ทีมในภาคที่เพิ่มไม่ต้องติ๊กซ้ำ — ดูแลทั้งภาคครอบคลุมอยู่แล้ว
        next.teams = next.teams.filter((t) => regionOfTeam.get(t) !== region);
        text = cur.regions.includes(region)
          ? `${s.name} (หัวหน้าภาค): เลิกดูแลทีม${fromTeam} (ดูแลทั้งภาค${region} อยู่แล้ว)`
          : `${s.name} (หัวหน้าภาค): ${fromTeam ? `ย้ายจากทีม${fromTeam} → ` : ""}${cur.regions.length ? "ดูแลเพิ่มทั้งภาค" : "ดูแลทั้งภาค"}${region}`;
      } else {
        const team = z.target!;
        if (groupNames.has(team)) return feedback.toast("info", "หัวหน้าภาคดูแลทีมรวมได้จากหน้าสิทธิ์ผู้ใช้ — ผังนี้วางที่ทีมช่าง");
        if (next.teams.includes(team) || next.regions.includes(regionOfTeam.get(team) ?? "")) {
          return feedback.toast("info", `${s.name} ดูแลทีม${team} อยู่แล้ว`);
        }
        if (fromTeam) next.teams = next.teams.filter((t) => t !== fromTeam);
        next.teams.push(team);
        text = fromTeam ? `${s.name} (หัวหน้าภาค): ย้ายจากทีม${fromTeam} → ดูแลทีม${team}` : `${s.name} (หัวหน้าภาค): ดูแลเพิ่มทีม${team}`;
      }
      setSupState((m) => new Map(m).set(g.id, next));
      setLog((l) => [...l, text]);
    },
    [data, techTeam, seniorTeams, supState, regionOfTeam, groupNames, pseudoRegions, placeable]
  );

  async function save() {
    if (!data) return;
    setSaving(true);
    let done = 0;
    try {
      for (const t of data.technicians) {
        if (isSenior(t)) {
          const now = seniorTeams.get(t.id) ?? [];
          if (!sameSet(now, seniorHeld(t))) {
            await api.patch(`/auth/users/${t.id}`, teamsBody(now), { loadingText: false });
            done++;
          }
          continue;
        }
        const to = techTeam.get(t.id) ?? null;
        if (to !== t.team) {
          await api.patch(`/auth/users/${t.id}`, { team: to }, { loadingText: false });
          done++;
        }
      }
      for (const s of data.supervisors) {
        const st = supState.get(s.id)!;
        const was = regionsOf(s);
        const same = sameSet(st.regions, was) && sameSet(st.teams, s.teams);
        if (!same) {
          // regions ทั้งชุด (เซิร์ฟเวอร์ใหม่ใช้ตัวนี้) + region ภาคแรกให้เซิร์ฟเวอร์รุ่นเก่าช่วง deploy — ดู regionsBody
          await api.patch(`/auth/users/${s.id}`, { ...regionsBody(st.regions), supervisedTeams: st.teams }, { loadingText: false });
          done++;
        }
      }
      feedback.toast("success", `บันทึกแล้ว ${done} คน — ใบงานที่แต่ละคนเห็นเปลี่ยนตามทันที`);
      setEditing(false);
      setGrab(null);
      await load();
    } catch (e) {
      // บันทึกไปได้บางคนแล้ว — โหลดใหม่ให้เห็นสถานะจริง ไม่ค้างรายการที่ไม่รู้ว่าเข้าไปหรือยัง
      showAlert("บันทึกไม่ครบ", `${apiErrorMessage(e)}\nบันทึกไปแล้ว ${done} คน — ผังโหลดใหม่ตามข้อมูลจริง`);
      await load();
    } finally {
      setSaving(false);
    }
  }

  function toggleEdit() {
    if (editing && log.length) {
      return showAlert("ยังไม่ได้บันทึก", `มีการเปลี่ยนแปลง ${log.length} รายการ — กดบันทึกหรือยกเลิกทั้งหมดก่อน`);
    }
    setEditing((v) => !v);
    setGrab(null);
  }

  const dnd: DnD = { editing, grab, setGrab, drop, dragging, setDragging, query: query.trim(), setQuery };

  const head = (kind: ChartKind) => (
    <>
      <View style={styles.dochead}>
        <View style={styles.brand}>
          <View style={styles.mark}>
            <Text style={styles.markText}>OTR</Text>
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.kicker}>{kind === "area" ? "OTTERI SERVICE · สาขา COCO (Area Team)" : "OTTERI SERVICE · ฝ่ายบริการซ่อมบำรุง"}</Text>
            <Text style={[styles.h1, headingFont]}>{kind === "area" ? "ผังผู้ดูแลฝั่ง Area" : "ผังผู้รับผิดชอบพื้นที่ให้บริการ"}</Text>
          </View>
        </View>
        <Text style={styles.asof}>
          {kind === "service" && data ? `ข้อมูล ณ ${fmtAsOf(data.asOf)}\n` : ""}อ้างอิง: {kind === "area" ? "ไฟล์ Area Team · ทะเบียนสาขา" : "ทะเบียนสาขา · สิทธิ์ผู้ใช้"}
        </Text>
      </View>
      <ChartSwitch value={kind} onChange={setWhich} locked={kind === "area" ? areaEditing : editing} />
    </>
  );

  if (which === "area") {
    return (
      <AreaMap
        head={head("area")}
        onEditingChange={setAreaEditing}
        registerReload={(fn) => {
          areaReload.current = fn;
        }}
      />
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        {error ? <EmptyState icon="cloud-offline-outline" title="โหลดผังไม่ได้" text={error} /> : <Spinner color={colors.primary} />}
      </View>
    );
  }

  // ── ข้อมูลที่แสดง (ตามที่ลากไว้ ยังไม่บันทึกก็เห็นผลแล้ว) ──
  const held = (t: Tech) => seniorTeams.get(t.id) ?? [];
  const techsOf = (team: string) =>
    data.technicians.filter((t) => (isSenior(t) ? held(t).includes(team) : (techTeam.get(t.id) ?? null) === team));
  /** ป้ายใต้ชื่อช่างในกล่องทีม — Senior บอกทีมอื่นที่ถือด้วย คนดูผังจะรู้ว่าชื่อซ้ำในอีกกล่องคือคนเดียวกัน */
  const techRole = (t: Tech, here: string) => {
    if (!isSenior(t)) return "ช่าง";
    const also = held(t).filter((x) => x !== here && placeable.has(x));
    return also.length ? `Senior ช่าง (ดูแล ${also.join(" · ")} ด้วย)` : "Senior ช่าง";
  };
  const sup = (id: number): SupState => supState.get(id) ?? { regions: [], teams: [] };
  const wholeOf = (region: string) => data.supervisors.filter((s) => sup(s.id).regions.includes(region));
  const partOf = (region: string, team: string) =>
    data.supervisors.filter((s) => !sup(s.id).regions.includes(region) && sup(s.id).teams.includes(team));
  const supsOfTeam = (region: string, team: string) => [...wholeOf(region), ...partOf(region, team)];
  const freeTechs = data.technicians.filter((t) => (isSenior(t) ? !held(t).some((x) => placeable.has(x)) : !techTeam.get(t.id)));
  const freeSups = data.supervisors.filter((s) => !sup(s.id).regions.length && !sup(s.id).teams.length);
  const tq = trayQuery.trim();
  const inTray = (x: { name: string; code: string }) => !tq || `${x.name} ${x.code}`.includes(tq);
  const trayFree = { sups: freeSups.filter(inTray), techs: freeTechs.filter(inTray) };
  const grabName = (g: Grab) =>
    (g.kind === "SUP" ? data.supervisors.find((x) => x.id === g.id) : data.technicians.find((x) => x.id === g.id))?.name ?? "";
  const allTeams = data.regions.flatMap((r) => r.teams.map((t) => ({ r: r.name, t })));
  const q = query.trim();
  // พิมพ์เบอร์แบบมีขีดหรือไม่มีก็เจอ — ข้อความที่ค้นมีเบอร์แบบตัวเลขล้วนต่อท้ายไว้ (who())
  const qd = /^[\d\s-]+$/.test(q) ? q.replace(/\D/g, "") : "";
  const dim = (text: string) => !!q && !text.includes(q) && !(qd && text.includes(qd));
  const who = (x: { name: string; code: string; phone: string | null }) => `${x.name} ${x.code} ${x.phone ?? ""} ${phoneDigits(x.phone)}`;

  const issues: [string, string][] = [];
  for (const { r, t } of allTeams) {
    if (!supsOfTeam(r, t.name).length) issues.push([`ทีม${t.name}`, `ไม่มีหัวหน้าภาคดูแล (ภาค${r})`]);
    if (!techsOf(t.name).length) issues.push([`ทีม${t.name}`, `ยังไม่มีช่าง — ${fmt(t.branches)} สาขา ใบงานค้าง ${t.open} ใบ`]);
  }
  if (freeTechs.length + freeSups.length) {
    issues.push([`${freeTechs.length + freeSups.length} คน`, "ยังไม่มีสังกัด — ไม่เห็นใบงานใดเลย"]);
  }
  const supCount = data.supervisors.length - freeSups.length;

  const cols = data.regions.map((r) => {
            const whole = wholeOf(r.name);
            const partial = data.supervisors.filter(
              (s) => !sup(s.id).regions.includes(r.name) && sup(s.id).teams.some((t) => regionOfTeam.get(t) === r.name)
            );
            const br = r.teams.reduce((n, t) => n + t.branches, 0);
            // นับคน ไม่นับชื่อ — Senior ที่ถือสองทีมในภาคเดียวกันคือช่างคนเดียว
            const tc = new Set(r.teams.flatMap((t) => techsOf(t.name).map((x) => x.id))).size;
            const regionText = `${r.name} ${r.teams.map((t) => t.name).join(" ")} ${whole.map(who).join(" ")}`;
            return (
              <View key={r.name} style={[narrow ? styles.colNarrow : styles.col, dim(regionText + r.teams.map((t) => techsOf(t.name).map(who).join(" ")).join(" ")) && styles.dim]}>
                {!narrow ? <View style={styles.stub} /> : null}
                <DropZone zone={{ kind: "region", target: r.name }} style={styles.rband} label={`หัวภาค ${r.name}`}>
                  <Text style={[styles.rname, headingFont]}>ภาค{r.name}</Text>
                  <Text style={styles.rmeta}>
                    {r.teams.length} ทีม · {fmt(br)} สาขา · ช่าง {tc} คน
                  </Text>
                </DropZone>
                <ZoneContext.Provider value={{ kind: "region", target: r.name }}>
                  <View style={styles.supbox}>
                    {whole.map((s) => {
                      // ถือหลายภาค — บอกภาคอื่นที่ถือด้วย คนดูผังจะได้รู้ว่าชื่อเดียวกันในอีกคอลัมน์คือคนเดียวกัน
                      const also = sup(s.id).regions.filter((x) => x !== r.name);
                      return (
                        <Person
                          key={s.id}
                          grab={{ id: s.id, kind: "SUP", from: { kind: "region", target: r.name } }}
                          name={s.name}
                          code={s.code}
                          phone={s.phone}
                          role={`หัวหน้าภาค · ทั้งภาค${also.length ? ` (ดูแลภาค${also.join(" · ภาค")} ด้วย)` : ""}`}
                          sup
                        />
                      );
                    })}
                    {partial.map((s) => (
                      <View key={s.id} style={styles.partial}>
                        <View style={[styles.av, styles.avSup, styles.avSmall]}>
                          <Text style={[styles.avText, { fontSize: 11 }]}>{ini(s.name)}</Text>
                        </View>
                        <Text style={styles.pr} numberOfLines={2}>
                          {s.name} · หัวหน้าภาค บางทีม
                        </Text>
                      </View>
                    ))}
                    {!whole.length && !partial.length ? (
                      <View style={styles.vacant}>
                        <Text style={styles.vacantText}>ตำแหน่งว่าง — ไม่มีหัวหน้าภาค</Text>
                      </View>
                    ) : null}
                  </View>
                </ZoneContext.Provider>
                <View style={styles.teams}>
                  <View style={styles.rail} />
                  {r.teams.map((t) => {
                    const ts = techsOf(t.name);
                    const extra = partOf(r.name, t.name);
                    const text = `${t.name} ${ts.map(who).join(" ")} ${extra.map(who).join(" ")} ${r.name}`;
                    return (
                      <View key={t.name} style={[styles.teamWrap, dim(text) && styles.dim]}>
                        <View style={styles.tick} />
                        <DropZone zone={{ kind: "team", target: t.name }} style={styles.team} label={`ทีม ${t.name}`}>
                          <View style={styles.thead}>
                            <Text style={styles.tname}>ทีม{t.name}</Text>
                            <Text style={styles.tnum}>
                              {fmt(t.branches)} สาขา · ค้าง {t.open}
                            </Text>
                          </View>
                          {extra.length ? (
                            <View style={styles.extra}>
                              {extra.map((s) => (
                                <Person
                                  key={s.id}
                                  grab={{ id: s.id, kind: "SUP", from: { kind: "team", target: t.name } }}
                                  name={s.name}
                                  code={s.code}
                                  phone={s.phone}
                                  role="ดูแลทีมนี้"
                                  sup
                                  small
                                />
                              ))}
                            </View>
                          ) : null}
                          {ts.length ? (
                            <View style={styles.techs}>
                              {ts.map((x) => (
                                <Person
                                  key={x.id}
                                  grab={{ id: x.id, kind: "TECH", from: { kind: "team", target: t.name } }}
                                  name={x.name}
                                  code={x.code}
                                  phone={x.phone}
                                  role={techRole(x, t.name)}
                                  badge={isSenior(x) ? "Senior" : undefined}
                                  small
                                />
                              ))}
                            </View>
                          ) : (
                            <Text style={styles.notech}>ยังไม่มีช่างในทีม</Text>
                          )}
                        </DropZone>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
  });
  const chart = narrow ? (
    <View style={styles.stack}>{cols}</View>
  ) : (
    <ScrollView horizontal contentContainerStyle={styles.chartScroll}>
      <View style={{ alignItems: "center" }}>
        <View style={styles.root}>
          <Text style={styles.rootT}>ฝ่ายบริการซ่อมบำรุง</Text>
          <Text style={styles.rootS}>OTTERI SERVICE</Text>
        </View>
        <View style={styles.stem} />
        {data.regions.length > 1 ? <View style={[styles.hline, { width: (data.regions.length - 1) * (COL_W + COL_GAP) }]} /> : null}
        <View style={{ flexDirection: "row", gap: COL_GAP, alignItems: "flex-start" }}>{cols}</View>
      </View>
    </ScrollView>
  );

  const table = (
    <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
      <View style={styles.table}>
        <View style={[styles.tr, styles.thRow]}>
          {["ภาค", "ทีมช่าง", "หัวหน้าภาค", "ช่าง", "สาขา", "ใบงานค้าง"].map((h, i) => (
            <Text key={h} style={[styles.th, TABLE_COLS[i], i >= 4 && styles.num]}>
              {h}
            </Text>
          ))}
        </View>
        {allTeams.map(({ r, t }) => {
          const s = supsOfTeam(r, t.name);
          const ts = techsOf(t.name);
          const text = `${r} ${t.name} ${s.map(who).join(" ")} ${ts.map(who).join(" ")}`;
          return (
            <View key={t.name} style={[styles.tr, dim(text) && styles.dim]}>
              <Text style={[styles.td, TABLE_COLS[0]]}>{r}</Text>
              <Text style={[styles.td, TABLE_COLS[1], { fontWeight: "700" }]}>ทีม{t.name}</Text>
              <Text style={[styles.td, TABLE_COLS[2], !s.length && styles.missing]}>{s.map((x) => x.name).join("\n") || "ไม่มี"}</Text>
              <Text style={[styles.td, TABLE_COLS[3], !ts.length && styles.missing]}>
                {ts.map((x) => `${x.name} (${x.code})${isSenior(x) ? " · Senior" : ""}`).join("\n") || "ไม่มี"}
              </Text>
              <Text style={[styles.td, TABLE_COLS[4], styles.num]}>{fmt(t.branches)}</Text>
              <Text style={[styles.td, TABLE_COLS[5], styles.num]}>{t.open}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );

  return (
    <DnDContext.Provider value={dnd}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView ref={scrollRef} contentContainerStyle={[styles.page, editing && { paddingBottom: 340 }]}>
          <View style={[styles.sheet, editing && { borderColor: GOLD }]}>
            {head("service")}

            <View style={styles.tools}>
              <View style={styles.search}>
                <Ionicons name="search-outline" size={17} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="ค้นหาชื่อ รหัสพนักงาน เบอร์โทร ทีม หรือภาค"
                  placeholderTextColor={colors.textFaint}
                  accessibilityLabel="ค้นหาในผัง"
                />
              </View>
              <View style={styles.seg}>
                {(
                  [
                    ["chart", "ผังองค์กร"],
                    ["table", "ตาราง"],
                  ] as const
                ).map(([k, l]) => (
                  <TouchableOpacity key={k} style={[styles.segBtn, view === k && styles.segOn]} onPress={() => setView(k)}>
                    <Text style={[styles.segText, view === k && styles.segTextOn]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {data.canEdit ? (
                <TouchableOpacity
                  style={[styles.editBtn, editing && styles.editOn]}
                  onPress={toggleEdit}
                  accessibilityLabel={editing ? "เสร็จสิ้นการแก้ไข" : "แก้ไขผัง"}
                >
                  <Ionicons name={editing ? "checkmark" : "create-outline"} size={16} color={editing ? "#1B1405" : colors.navy} />
                  <Text style={[styles.editText, editing && { color: "#1B1405" }]}>
                    {editing ? "เสร็จสิ้นการแก้ไข" : "แก้ไขผัง"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {editing ? (
              <>
                <View style={styles.editband}>
                  <Text style={styles.editbandText}>
                    โหมดแก้ไข — {Platform.OS === "web" ? "ลากชื่อ หรือคลิกชื่อแล้วคลิก" : "แตะชื่อ แล้วแตะ"}ไปที่ทีมหรือหัวภาค · คนที่ยังไม่มีสังกัดอยู่ในแถบเหลืองล่างจอ ·
                    ช่าง → ทีม · Senior ช่าง → ทีม/ทีมรวม (เพิ่มทีมที่ดูแล หลายทีมได้) · หัวหน้าภาค → หัวภาค (เพิ่มภาคที่ดูแล หลายภาคได้) หรือทีม ·
                    ลากชื่อในหัวภาคหรือชื่อ Senior ในทีมไปแถบเหลือง = เลิกดูแลเฉพาะที่นั้น ·
                    การเปลี่ยนแปลงยังไม่ถูกบันทึกจนกว่าจะกด "บันทึก"
                  </Text>
                </View>
              </>
            ) : null}

            <View style={styles.stats}>
              {(
                [
                  [data.regions.length, "ภาค"],
                  [allTeams.length, "ทีมช่าง"],
                  [supCount, "หัวหน้าภาค"],
                  [data.technicians.length - freeTechs.length, "ช่าง"],
                  [fmt(allTeams.reduce((n, x) => n + x.t.branches, 0)), "สาขา"],
                ] as const
              ).map(([v, l]) => (
                <View key={l} style={styles.stat}>
                  <Text style={styles.statV}>{v}</Text>
                  <Text style={styles.statL}>{l}</Text>
                </View>
              ))}
            </View>

            <View style={styles.issues}>
              <Text style={styles.h3}>ประเด็นที่ต้องจัดการ</Text>
              {issues.length ? (
                issues.map(([a, b], i) => (
                  <View key={`${a}${i}`} style={[styles.issue, i > 0 && styles.issueLine]}>
                    <Text style={styles.issueN}>{i + 1}</Text>
                    <Text style={styles.issueText}>
                      <Text style={{ fontWeight: "700" }}>{a}</Text> — {b}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.pr}>ไม่มี — ทุกทีมมีหัวหน้าภาคและช่าง</Text>
              )}
            </View>

            {view === "chart" ? chart : <View style={{ padding: 18 }}>{table}</View>}

            <View style={styles.sec}>
              <Text style={styles.h3}>ทีมรวม (ครอบคลุมหลายทีมช่าง)</Text>
              {data.groups.map((g) => {
                const ts = techsOf(g.name);
                return (
                  <DropZone key={g.name} zone={{ kind: "team", target: g.name }} style={styles.grow} label={`ทีมรวม ${g.name}`}>
                    <Text style={styles.gname}>{g.name}</Text>
                    <View style={styles.covers}>
                      {(g.allTeams ? ["ทุกทีม"] : g.covers).map((c) => (
                        <Text key={c} style={styles.cover}>
                          {c}
                        </Text>
                      ))}
                    </View>
                    <View style={styles.groupTechs}>
                      {ts.length ? (
                        ts.map((x) => (
                          <Person
                            key={x.id}
                            grab={{ id: x.id, kind: "TECH", from: { kind: "team", target: g.name } }}
                            name={x.name}
                            code={x.code}
                            phone={x.phone}
                            role={techRole(x, g.name)}
                            badge={isSenior(x) ? "Senior" : undefined}
                            small
                          />
                        ))
                      ) : (
                        <Text style={styles.pr}>ยังไม่มีช่างในทีมรวมนี้</Text>
                      )}
                    </View>
                  </DropZone>
                );
              })}
            </View>
            <View style={styles.foot}>
              <Text style={styles.pr}>
                {data.canEdit ? "แก้ไขได้ที่ผังนี้ หรือ ระบบหลังบ้าน → สิทธิ์ผู้ใช้" : "แอดมินแก้ไขผู้รับผิดชอบได้ที่ผังนี้"} · ภาคและทีมของสาขามาจากทะเบียนสาขา
              </Text>
            </View>
          </View>
        </ScrollView>

        {grab && !dragging ? (
          // คลิก/แตะชื่อแล้ว — บอกว่ากำลังย้ายใคร ต้องทำอะไรต่อ (เดิมทำได้แต่ไม่มีอะไรบอก)
          <View style={styles.moving} pointerEvents="box-none">
            <View style={styles.movingPill}>
              <Text style={styles.movingText} numberOfLines={2}>
                กำลังย้าย {grabName(grab)} — {Platform.OS === "web" ? "คลิก" : "แตะ"}ทีมหรือหัวภาคที่ต้องการ
                {Platform.OS === "web" ? " (Esc ยกเลิก)" : ""}
              </Text>
              <TouchableOpacity onPress={() => setGrab(null)} accessibilityLabel="ยกเลิกการย้าย">
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={styles.bottomStack} pointerEvents="box-none">
        {editing ? (
          /**
           * แถบ "ยังไม่มีสังกัด" ลอยติดล่างจอ (เจ้าของงานเลือก ต.ค. 69) — เดิมอยู่บนสุดของผัง
           * เลื่อนไปทีมไหนก็ลากจากแถบนี้ได้ · ลากคนในผังมาวางที่แถบ = เอาออก · ค้นชื่อ/ย่อเก็บได้
           */
          <View ref={dockRef} style={styles.dock}>
            <View style={styles.dockHead}>
              <Text style={styles.dockTitle}>● ยังไม่มีสังกัด ({freeTechs.length + freeSups.length})</Text>
              {!trayMin ? (
                <TextInput
                  style={styles.dockSearch}
                  value={trayQuery}
                  onChangeText={setTrayQuery}
                  placeholder="ค้นชื่อ / รหัส"
                  placeholderTextColor={colors.textFaint}
                  accessibilityLabel="ค้นคนที่ยังไม่มีสังกัด"
                />
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <TouchableOpacity onPress={() => setTrayMin((v) => !v)} accessibilityLabel={trayMin ? "ขยายแถบยังไม่มีสังกัด" : "ย่อแถบยังไม่มีสังกัด"}>
                <Text style={styles.dockToggle}>{trayMin ? "ขยาย ▴" : "ย่อ ▾"}</Text>
              </TouchableOpacity>
            </View>
            {/* ย่อแล้วยังวางได้ — ทั้งแถบเป็นที่วาง "เอาออก" */}
            <DropZone zone={{ kind: "tray", target: null }} style={trayMin ? styles.trayMin : styles.tray} label="ยังไม่มีสังกัด">
              {trayMin ? (
                <Text style={styles.trayEmpty}>ลากคนมาวางที่นี่เพื่อเอาออกจากทีม</Text>
              ) : (
                <ScrollView style={{ maxHeight: 112 }} contentContainerStyle={styles.trayList}>
                  {trayFree.sups.map((s) => (
                    <Person key={`s${s.id}`} grab={{ id: s.id, kind: "SUP", from: null }} name={s.name} code={s.code} phone={s.phone} role="หัวหน้าภาค" sup small />
                  ))}
                  {trayFree.techs.map((t) => {
                    const senior = isSenior(t);
                    // Senior ที่ทุกชื่อไม่มีในทะเบียนแล้ว — บอกชื่อเดิมทั้งหมด ไม่ใช่แค่ชื่อแรก
                    const stale = senior ? held(t).join(" · ") : t.staleTeam;
                    const label = senior ? "Senior ช่าง" : "ช่าง";
                    return (
                      <Person
                        key={`t${t.id}`}
                        grab={{ id: t.id, kind: "TECH", from: null }}
                        name={t.name}
                        code={t.code}
                        phone={t.phone}
                        role={stale && (senior || !t.team) ? `${label} · เดิม ${stale}` : label}
                        badge={senior ? "Senior" : undefined}
                        small
                      />
                    );
                  })}
                  {!freeSups.length && !freeTechs.length ? (
                    <Text style={styles.trayEmpty}>ทุกคนมีสังกัดแล้ว — ลากคนในผังมาวางที่นี่เพื่อเอาออก</Text>
                  ) : !trayFree.sups.length && !trayFree.techs.length ? (
                    <Text style={styles.trayEmpty}>ไม่พบ “{trayQuery.trim()}”</Text>
                  ) : null}
                </ScrollView>
              )}
            </DropZone>
          </View>
        ) : null}
        {log.length ? (
          <View style={styles.pending}>
            <View style={{ flex: 1, minWidth: 240 }}>
              <Text style={styles.pendingTitle}>รอบันทึก {log.length} รายการ</Text>
              <ScrollView style={{ maxHeight: 84 }}>
                {log.map((l, i) => (
                  <Text key={i} style={styles.pendingItem}>
                    {i + 1}. {l}
                  </Text>
                ))}
              </ScrollView>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity style={styles.pbtn} onPress={load} disabled={saving} accessibilityLabel="ยกเลิกทั้งหมด">
                <Text style={styles.pbtnText}>ยกเลิกทั้งหมด</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pbtn, styles.pbtnSave]} onPress={save} disabled={saving} accessibilityLabel="บันทึกผัง">
                {saving ? <Spinner size="small" color={colors.navy} /> : <Text style={[styles.pbtnText, { color: colors.navy }]}>บันทึก</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        </View>
      </View>
    </DnDContext.Provider>
  );
}

const TABLE_COLS = [{ width: 150 }, { width: 150 }, { width: 170 }, { width: 240 }, { width: 70 }, { width: 80 }];

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 16 },
  page: { padding: 16, paddingBottom: 140 },
  sheet: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: "hidden" },
  dochead: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 3,
    borderBottomColor: colors.borderStrong,
  },
  brand: { flexDirection: "row", gap: 12, alignItems: "center", flexShrink: 1 },
  mark: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.navyFill, alignItems: "center", justifyContent: "center" },
  markText: { color: "#fff", fontWeight: "700", fontSize: 13, letterSpacing: 0.8 },
  kicker: { fontSize: 11.5, letterSpacing: 1.2, color: colors.textMuted, fontWeight: "600" },
  h1: { fontSize: 22, lineHeight: 32, fontWeight: "700", color: colors.text },
  asof: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted, textAlign: "right" },
  tools: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  search: {
    flexGrow: 1,
    flexBasis: 240,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22, color: colors.text, paddingVertical: 9 },
  seg: { flexDirection: "row", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, overflow: "hidden" },
  segBtn: { paddingHorizontal: 16, paddingVertical: 9, backgroundColor: colors.card },
  segOn: { backgroundColor: colors.navyFill },
  segText: { fontWeight: "600", color: colors.textMuted, fontSize: 13.5 },
  segTextOn: { color: "#fff" },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: colors.card,
  },
  editOn: { backgroundColor: GOLD, borderColor: GOLD },
  editText: { fontWeight: "700", color: colors.navy, fontSize: 13.5 },
  editband: { backgroundColor: colors.warningSoft, paddingHorizontal: 22, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  editbandText: { color: colors.warningInk, fontSize: 13, lineHeight: 20 },
  tray: { minHeight: 50 },
  trayEmpty: { color: colors.textFaint, fontSize: 12.5 },
  h3: { fontSize: 12.5, letterSpacing: 0.6, color: colors.textMuted, fontWeight: "700", marginBottom: 8 },
  stats: { flexDirection: "row", flexWrap: "wrap", borderBottomWidth: 1, borderBottomColor: colors.border },
  stat: { flexGrow: 1, flexBasis: 130, paddingHorizontal: 22, paddingVertical: 12, borderRightWidth: 1, borderRightColor: colors.border },
  statV: { fontSize: 24, fontWeight: "700", color: colors.navy, fontVariant: ["tabular-nums"] },
  statL: { fontSize: 12, color: colors.textMuted },
  issues: { paddingHorizontal: 22, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  issue: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 6 },
  issueLine: { borderTopWidth: 1, borderTopColor: colors.border, borderStyle: "dashed" },
  issueN: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.dangerInk,
    backgroundColor: colors.dangerSoft,
    borderRadius: 4,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  issueText: { flex: 1, fontSize: 13.5, color: colors.text, lineHeight: 20 },
  chartScroll: { paddingHorizontal: 22, paddingTop: 26, paddingBottom: 26, minWidth: "100%", justifyContent: "center" },
  root: { backgroundColor: colors.navyFill, borderRadius: 8, paddingHorizontal: 22, paddingVertical: 10, alignItems: "center", minWidth: 240 },
  rootT: { color: "#fff", fontWeight: "700", fontSize: 15 },
  rootS: { color: "#fff", opacity: 0.85, fontSize: 12 },
  stem: { width: 2, height: 20, backgroundColor: colors.borderStrong },
  hline: { height: 2, backgroundColor: colors.borderStrong },
  col: { width: COL_W },
  colNarrow: { width: "100%" },
  stack: { padding: 12, gap: 16 },
  stub: { width: 2, height: 20, backgroundColor: colors.borderStrong, alignSelf: "center" },
  rband: {
    backgroundColor: colors.sky50,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 2,
    borderBottomColor: colors.navy,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  rname: { fontWeight: "700", fontSize: 15, color: colors.text, textAlign: "center" },
  rmeta: { fontSize: 11.5, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  supbox: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.border,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: colors.card,
    padding: 10,
    gap: 6,
  },
  partial: { flexDirection: "row", gap: 8, alignItems: "center", opacity: 0.85 },
  vacant: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.danger,
    borderRadius: 6,
    padding: 8,
    backgroundColor: colors.dangerSoft,
  },
  vacantText: { color: colors.dangerInk, fontSize: 12.5, fontWeight: "600", textAlign: "center" },
  teams: { paddingTop: 12, paddingLeft: 18 },
  rail: { position: "absolute", left: 8, top: 0, bottom: 26, width: 2, backgroundColor: colors.borderStrong },
  teamWrap: { marginBottom: 10 },
  tick: { position: "absolute", left: -10, top: 18, width: 10, height: 2, backgroundColor: colors.borderStrong },
  team: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.card, padding: 10 },
  thead: { flexDirection: "row", justifyContent: "space-between", gap: 6, alignItems: "baseline" },
  tname: { fontWeight: "700", fontSize: 13.5, color: colors.text, flexShrink: 1 },
  tnum: { fontSize: 11.5, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  extra: { marginTop: 6, gap: 2 },
  techs: { marginTop: 7, paddingTop: 7, borderTopWidth: 1, borderTopColor: colors.border, gap: 2 },
  notech: { fontSize: 12, color: colors.dangerInk, fontWeight: "600", marginTop: 6 },
  person: { flexDirection: "row", gap: 10, alignItems: "center", borderRadius: 6, padding: 3 },
  personSmall: { gap: 8 },
  av: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  avSmall: { width: 26, height: 26, borderRadius: 13 },
  avSup: { backgroundColor: colors.navyFill },
  avTech: { backgroundColor: colors.roleTech },
  avText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  pn: { fontSize: 13.5, fontWeight: "600", color: colors.text },
  badge: { fontSize: 10.5, fontWeight: "800", color: colors.roleTech, backgroundColor: colors.roleTechSoft, borderRadius: 4 },
  pr: { fontSize: 11.5, color: colors.textMuted, lineHeight: 17 },
  hit: { backgroundColor: colors.warningTint },
  selected: { backgroundColor: colors.warningTint, borderWidth: 2, borderColor: GOLD },
  dim: { opacity: 0.25 },
  dropArmed: { borderStyle: "dashed", borderColor: colors.primary },
  dropOver: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderStyle: "solid" },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden", minWidth: 860 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  thRow: { backgroundColor: colors.sky50, borderBottomWidth: 2, borderBottomColor: colors.borderStrong },
  th: { fontSize: 12, fontWeight: "700", color: colors.textMuted, padding: 10 },
  td: { fontSize: 13.5, color: colors.text, padding: 10, lineHeight: 20 },
  num: { textAlign: "right", fontVariant: ["tabular-nums"] },
  missing: { color: colors.dangerInk, fontWeight: "600" },
  sec: { paddingHorizontal: 22, paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border },
  grow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 6,
  },
  gname: { fontWeight: "700", color: colors.roleAdmin, minWidth: 220, fontSize: 13.5 },
  covers: { flexDirection: "row", flexWrap: "wrap", gap: 4, flexShrink: 1 },
  cover: {
    fontSize: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 4,
    paddingHorizontal: 6,
    color: colors.body,
  },
  groupTechs: { flexDirection: "row", flexWrap: "wrap", gap: 6, flexGrow: 1 },
  foot: { paddingHorizontal: 22, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  bottomStack: { position: "absolute", left: 16, right: 16, bottom: 16, gap: 8 },
  dock: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: GOLD,
    borderRadius: radius.md,
    overflow: "hidden",
    ...shadow.card,
  },
  dockHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.warningSoft },
  dockTitle: { fontSize: 13, fontWeight: "700", color: colors.warningInk },
  dockSearch: {
    flex: 1,
    minWidth: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.card,
  },
  dockToggle: { fontSize: 13, fontWeight: "700", color: colors.warningInk },
  trayMin: { paddingHorizontal: 12, paddingVertical: 8 },
  trayList: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 10, alignItems: "center" },
  moving: { position: "absolute", top: 10, left: 0, right: 0, alignItems: "center", zIndex: 20 },
  movingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: "92%",
    backgroundColor: colors.navyFill,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    ...shadow.card,
  },
  movingText: { color: "#fff", fontSize: 13, fontWeight: "600", flexShrink: 1 },
  pending: {
    backgroundColor: colors.navyFill,
    borderRadius: radius.md,
    padding: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
    ...shadow.card,
  },
  pendingTitle: { color: "#fff", fontWeight: "700", fontSize: 14, marginBottom: 4 },
  pendingItem: { color: "#fff", opacity: 0.92, fontSize: 12.5, lineHeight: 19 },
  pbtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 90,
    alignItems: "center",
  },
  pbtnSave: { backgroundColor: "#fff", borderColor: "#fff" },
  pbtnText: { color: "#fff", fontWeight: "700", fontSize: 13.5 },
});
