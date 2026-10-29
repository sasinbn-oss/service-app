/**
 * ผังผู้ดูแลฝั่ง Area — Area → Supervisor (COCO) → สาขา COCO · Maid (COCO) ใต้คนที่ถือสาขา (เจ้าของงานขอ ต.ค. 69 · ตามตัวอย่างที่ตกลง)
 *
 * หน้าตา (ตัวอย่างรอบสอง ต.ค. 69 — ผังเดิมใหญ่ดูยาก ไม่มีแถบเลื่อน ต้องเลื่อนไปล่างสุด และไม่มี Maid):
 * - ดูภาพรวมก่อน: การ์ด Area เรียงเป็นตาราง กดการ์ดไหนกาง Supervisor (COCO) + Maid (COCO) ของ Area นั้นใต้แถวของการ์ด
 *   ไม่มีผังกิ่งไม้ที่ต้องเลื่อนข้าง — 11 Area × ~14 คนวางเรียงกันเป็นคอลัมน์ยาวจนหาใครไม่เจอ
 * - แถบเครื่องมือติดบนสุดตลอด (ค้นหา · ผัง/ตาราง · กาง/ย่อทั้งหมด · ขนาด · แก้ไข) · แถบเลื่อนเห็นตลอดบนเว็บ · ปุ่มกลับขึ้นบน
 * - ค้นหา: บอกจำนวนที่พบ ไล่ทีละอันได้ (Enter / ‹ ›) · กาง Area ที่พบให้เอง · รหัสสาขาตรงตัวขึ้น "คำตอบด่วน" พร้อมเบอร์
 * - Maid (COCO) ไม่ใช่ผู้ดูแลสาขา จึงลากไม่ได้ — ขึ้นใต้คนที่ถือสาขาที่ Maid ประจำ ย้ายสาขาแล้ว Maid ย้ายตามเอง
 *
 * ทุกคนเปิดดูได้ (ช่าง/หัวหน้าภาครู้ว่าสาขา COCO ไหนต้องโทรหาใคร) · แก้ได้เฉพาะแอดมินและ Area — เซิร์ฟเวอร์เช็คซ้ำ
 * ลาก/แตะแบบเดียวกับผังฝ่ายบริการ:
 * - ชื่อ Supervisor → การ์ด Area / ชื่อในแถว "ย้ายไป Area" หรือแถบ "ยังไม่มี Area"
 * - รหัสสาขา → Supervisor คนอื่น (หรือ Area ที่ดูแลสาขาเอง) หรือแถบ "สาขาไม่มีผู้ดูแล"
 *   วางรหัสสาขาบนการ์ด Area = กาง Area นั้นให้เลือกคน ไม่ได้ยกสาขาให้คน Area (เคยเป็นแบบนั้น แล้วสาขาไปอยู่กับ Area โดยไม่ตั้งใจ)
 * - "ย้ายสาขาทั้งหมด" (คนลาออก) แบบดูแลแทนชั่วคราว = จำว่าเป็นของใคร มีคนใหม่แล้ว "ส่งต่อ" ได้ทีเดียว
 *   โดยสาขาเดิมของคนดูแลแทนไม่ติดไปด้วย — ถ้าย้ายแบบทั้งหมดธรรมดา ตอนส่งต่อจะแยกไม่ออกว่าสาขาไหนของใคร
 * ทุกอย่างค้างไว้จนกด "บันทึก" แล้วส่งทีเดียว (POST /teams/area-map) — ลากพลาดครั้งเดียวไม่ควรทำให้ใครมองไม่เห็นงาน
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import TouchableOpacity from "./Tap";
import Spinner from "./Spinner";
import EmptyState from "./EmptyState";
import AppModal from "./AppModal";
import Dropdown, { DropdownOption } from "./Dropdown";
import { feedback } from "./Feedback";
import { CallButton, PhoneLine, phoneDigits } from "./PhoneLink";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { useAuth } from "../context/AuthContext";
import { colors, radius, shadow, spacing } from "../theme";

interface AreaPerson {
  id: number;
  name: string;
  code: string;
  phone: string | null;
  role: "AREA" | "COCO_SUPERVISOR";
  areaId: number | null;
  /** บัญชีถูกลบแล้ว (ลาออก) แต่ยังถือสาขาอยู่ */
  left: boolean;
}
interface AreaBranch {
  code: string;
  name: string;
  holderId: number | null;
  open: number;
  cover: { forId: number | null; forName: string; since: string | null } | null;
  /** Maid (COCO) ที่ประจำสาขานี้ — เซิร์ฟเวอร์รุ่นก่อนไม่ส่งมา */
  maids?: number[];
}
interface AreaMaid {
  id: number;
  name: string;
  code: string;
  phone: string | null;
}
interface AreaData {
  asOf: string;
  canEdit: boolean;
  people: AreaPerson[];
  branches: AreaBranch[];
  maids?: AreaMaid[];
}
type BranchState = { holderId: number | null; coverForId: number | null; coverForName: string | null; coverSince: string | null };
type Grab = { kind: "SUP"; id: number } | { kind: "BRANCH"; code: string };
type Zone = { kind: "area"; id: number } | { kind: "holder"; id: number } | { kind: "supTray" } | { kind: "branchTray" };
type QuickRole = "Supervisor (COCO)" | "Maid (COCO)" | "Area";
type QuickItem = { key: string; title: string; sub: string; lines: { role: QuickRole; name: string; phone: string | null }[]; none: boolean; area: number | null; target: string };

const GOLD = "#B7892F";
const GAP = 12;
/** ชิปสาขาที่โชว์ต่อคนตอนดูเฉย ๆ (ราว 2 แถว) — คนที่ถือ 20 สาขาทำให้การ์ดสูงจนแถวเดียวกันว่างเป็นช่องโหว่ */
const CHIP_CAP = 6;
const UI_KEY = "areaMap.ui.v1";
/** ขนาดผัง — ปรับทั้งตัวอักษรและความกว้างการ์ด จอใหญ่ได้หลายคอลัมน์ ใครสายตาไม่ดีกด "ใหญ่" */
const DENSITY = [
  { label: "กะทัดรัด", k: 0.9, tileMin: 176, supMin: 220 },
  { label: "ปกติ", k: 1, tileMin: 200, supMin: 250 },
  { label: "ใหญ่", k: 1.15, tileMin: 236, supMin: 300 },
] as const;
const ini = (s: string) => s.replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/, "").replace(/^[เแโใไ]/, "").trim().charAt(0) || "?";
const fmt = (n: number) => n.toLocaleString("th-TH");
const thDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit" }) : "";
const sameGrab = (a: Grab | null, b: Grab) =>
  !!a && a.kind === b.kind && (a.kind === "SUP" ? a.id === (b as { id: number }).id : a.code === (b as { code: string }).code);
const zoneKey = (z: Zone) => `${z.kind}:${"id" in z ? z.id : ""}`;
const web = Platform.OS === "web";

// ── ค่าที่จำต่อเครื่อง (ขนาด · Area ที่กางไว้) ─────────────────

type UiPrefs = { z?: number; open?: number[] };
function readUi(): UiPrefs {
  try {
    if (!web || typeof localStorage === "undefined") return {};
    const v = JSON.parse(localStorage.getItem(UI_KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function writeUi(p: UiPrefs) {
  try {
    if (web && typeof localStorage !== "undefined") localStorage.setItem(UI_KEY, JSON.stringify(p));
  } catch {
    // โหมดส่วนตัว/ปิดที่เก็บข้อมูล — แค่จำไม่ได้ ผังยังใช้ได้ปกติ
  }
}

/**
 * แถบเลื่อนเห็นตลอดบนเว็บ — macOS และมือถือซ่อนแถบเลื่อนจนกว่าจะเริ่มเลื่อน เจ้าของงานเลยไม่รู้ว่าหน้านี้ยาวแค่ไหน
 * Chrome ที่ตั้ง scrollbar-color แล้วจะไม่ใช้ ::-webkit-scrollbar จึงใส่ scrollbar-color ให้เฉพาะเบราว์เซอร์ที่ไม่มี (Firefox)
 */
let scrollbarCss: HTMLStyleElement | null = null;
function markScrollable(node: HTMLElement | undefined | null) {
  if (!web || !node || typeof document === "undefined") return;
  if (!scrollbarCss) {
    scrollbarCss = document.createElement("style");
    scrollbarCss.textContent =
      `.am-scroll::-webkit-scrollbar{width:12px;height:12px}` +
      `.am-scroll::-webkit-scrollbar-track{background:${colors.sky50};border-left:1px solid ${colors.border}}` +
      `.am-scroll::-webkit-scrollbar-thumb{background:${colors.borderStrong};border-radius:999px;border:2px solid ${colors.sky50}}` +
      `.am-scroll::-webkit-scrollbar-thumb:hover{background:${colors.textFaint}}` +
      `@supports not selector(::-webkit-scrollbar){.am-scroll{scrollbar-width:auto;scrollbar-color:${colors.borderStrong} ${colors.sky50}}}`;
    document.head.appendChild(scrollbarCss);
  }
  node.classList.add("am-scroll");
}

// ── ลาก/วาง (แบบเดียวกับผังฝ่ายบริการ: เว็บลากได้ · มือถือแตะแล้วแตะ) ─────────

interface DnD {
  editing: boolean;
  grab: Grab | null;
  setGrab: (g: Grab | null) => void;
  drop: (g: Grab, z: Zone) => void;
  dragging: boolean;
  setDragging: (v: boolean) => void;
}
const DnDContext = createContext<DnD | null>(null);
const ZoneContext = createContext<Zone | null>(null);
const useDnD = () => useContext(DnDContext)!;
const domOf = (r: React.RefObject<View | null>) => (web ? (r.current as unknown as HTMLElement | null) : null);

/** ของที่หยิบได้ — ชื่อ Supervisor หรือรหัสสาขา · โหมดดูอย่างเดียวกดแล้วทำ onView แทน */
function Draggable({
  grab,
  label,
  style,
  nativeID,
  onView,
  children,
}: {
  grab: Grab;
  label: string;
  style?: object | (object | false | null | undefined)[];
  nativeID?: string;
  onView?: () => void;
  children: React.ReactNode;
}) {
  const d = useDnD();
  const zone = useContext(ZoneContext);
  const ref = useRef<View>(null);
  const selected = sameGrab(d.grab, grab);

  useEffect(() => {
    const el = domOf(ref);
    if (!el || !d.editing) return;
    el.draggable = true;
    const start = (e: DragEvent) => {
      e.stopPropagation();
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
  }, [d.editing, grab.kind, grab.kind === "SUP" ? grab.id : grab.code]);

  function press() {
    if (!d.editing) return onView?.();
    // หยิบของไว้แล้ว แตะของอื่นในการ์ด = แตะการ์ดนั้น (การ์ดเต็มไปด้วยชื่อและสาขาจนแทบไม่มีพื้นที่ว่างให้แตะ)
    if (d.grab && !selected && zone) {
      const g = d.grab;
      d.setGrab(null);
      return d.drop(g, zone);
    }
    d.setGrab(selected ? null : grab);
  }

  return (
    <TouchableOpacity onPress={press} accessibilityLabel={label}>
      <View ref={ref} nativeID={nativeID} style={[style, selected && styles.selected]}>
        {children}
      </View>
    </TouchableOpacity>
  );
}

function Drop({
  zone,
  style,
  outer,
  label,
  nativeID,
  onDwell,
  children,
}: {
  zone: Zone;
  style?: object | (object | false | null | undefined)[];
  /** ขนาด/การยืดในแถว — ใส่ที่ตัวกดด้านนอก (ใส่ข้างในแล้ว flexBasis กลายเป็นความสูงของกล่อง) */
  outer?: object;
  label: string;
  nativeID?: string;
  /** ลากค้างไว้ครู่หนึ่ง — การ์ด Area กางตัวเองให้ลากต่อเข้าไปวางที่ Supervisor ได้ในครั้งเดียว */
  onDwell?: () => void;
  children: React.ReactNode;
}) {
  const d = useDnD();
  const ref = useRef<View>(null);
  const [over, setOver] = useState(false);
  const dwell = useRef(onDwell);
  dwell.current = onDwell;
  // ตัวฟัง DOM ผูกครั้งเดียวต่อโหมดแก้ไข — อ่าน d ล่าสุดผ่าน ref ไม่งั้น drop เห็นผังก่อนการย้ายครั้งก่อน
  // (ลากสาขากลับไปคนเดิมแล้วถูกมองว่า "ไม่เปลี่ยน" · บันทึกต้นทางผิด)
  const dRef = useRef(d);
  dRef.current = d;
  useEffect(() => {
    const el = domOf(ref);
    if (!el || !d.editing) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const enter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOver(true);
      if (dwell.current && !timer) {
        timer = setTimeout(() => {
          timer = null;
          dwell.current?.();
        }, 650);
      }
    };
    const leave = (e: DragEvent) => {
      if (!el.contains(e.relatedTarget as Node)) {
        setOver(false);
        stop();
      }
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      stop();
      setOver(false);
      const cur = dRef.current;
      cur.setDragging(false);
      // ปล่อยของก่อนแล้วค่อยวาง (ลำดับเดียวกับแตะ) — วางรหัสสาขาบนการ์ด Area ต้องหยิบสาขาไว้ต่อได้
      cur.setGrab(null);
      try {
        const g = JSON.parse(e.dataTransfer?.getData("text/plain") || "null") as Grab | null;
        if (g && (g.kind === "SUP" || g.kind === "BRANCH")) cur.drop(g, zone);
      } catch {
        // ลากของอื่นมาวาง (ข้อความ ไฟล์) — ไม่ใช่คนหรือสาขา ไม่ต้องทำอะไร
      }
    };
    el.addEventListener("dragover", enter);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => {
      stop();
      el.removeEventListener("dragover", enter);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
    };
  }, [d.editing, zoneKey(zone)]);

  const armed = d.editing && (d.dragging || !!d.grab);
  return (
    <ZoneContext.Provider value={zone}>
      <TouchableOpacity
        style={outer}
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
        <View ref={ref} nativeID={nativeID} style={[style, armed && styles.dropArmed, over && styles.dropOver]}>
          {children}
        </View>
      </TouchableOpacity>
    </ZoneContext.Provider>
  );
}

// ── ปุ่มสลับผัง (ใช้ทั้งสองผัง) ─────────────────────────────

export type ChartKind = "service" | "area";

/**
 * สลับ ผังฝ่ายบริการ / ผังฝั่ง Area — ระหว่างแก้ไขผังสลับไม่ได้ (การย้ายที่ยังไม่บันทึกอยู่กับผังนั้น)
 */
export function ChartSwitch({ value, onChange, locked }: { value: ChartKind; onChange: (v: ChartKind) => void; locked?: boolean }) {
  const { width } = useWindowDimensions();
  const narrow = width < 700;
  const tabs: [ChartKind, keyof typeof Ionicons.glyphMap, string, string][] = [
    ["service", "construct-outline", "ผังฝ่ายบริการ", "ภาค · หัวหน้าภาค · ทีมช่าง · ช่าง"],
    ["area", "storefront-outline", "ผังฝั่ง Area", "Area · Supervisor (COCO) · Maid (COCO) · สาขา COCO"],
  ];
  return (
    <View style={[styles.switch, narrow && styles.switchNarrow]}>
      {tabs.map(([k, icon, title, sub]) => {
        const on = value === k;
        return (
          <TouchableOpacity
            key={k}
            style={[styles.sw, narrow && styles.swNarrow, on && (narrow ? styles.swNarrowOn : styles.swOn)]}
            onPress={() => {
              if (on) return;
              if (locked) return feedback.toast("info", "กด “เสร็จสิ้นการแก้ไข” ก่อนสลับผัง");
              onChange(k);
            }}
            accessibilityLabel={title}
            accessibilityState={{ selected: on }}
          >
            {!narrow ? (
              <View style={[styles.swIcon, on && styles.swIconOn]}>
                <Ionicons name={icon} size={18} color={on ? "#fff" : colors.navy} />
              </View>
            ) : null}
            <View style={{ flexShrink: 1 }}>
              <Text style={[styles.swTitle, on && (narrow ? { color: "#fff" } : { color: colors.navy })]}>{title}</Text>
              {!narrow ? <Text style={styles.swSub}>{sub}</Text> : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── คนในผัง ─────────────────────────────────────────────

/** ชิปสาขารู้ว่าตรงกับคำค้นไหม มี Maid ไหม และกดแล้วทำอะไร — ส่งผ่าน context ไม่ต้องส่งต่อทุกชั้น */
interface ChipEnv {
  k: number;
  hit: (code: string) => boolean;
  cur: string | null;
  maid: (code: string) => boolean;
  view: (code: string) => void;
}
const ChipContext = createContext<ChipEnv>({ k: 1, hit: () => false, cur: null, maid: () => false, view: () => {} });

/**
 * แถวชื่อคน — ระหว่างแก้ไขเบอร์เป็นตัวหนังสือเฉย ๆ ไม่ใช่ปุ่มโทร: การ์ดทั้งใบเป็นที่วาง แตะกลางการ์ดแล้วไปโดนเบอร์
 * กลายเป็นโทรออกแทนที่จะวางสาขา (เจอจากเทสต์ — ผังใหม่เบอร์อยู่กลางการ์ดพอดี)
 */
function PersonRow({ p, meta, k, narrow, mine, editing }: { p: AreaPerson; meta: string; k: number; narrow: boolean; mine?: boolean; editing?: boolean }) {
  const av = Math.round(32 * k);
  const phone = p.phone && !p.left ? p.phone : null;
  return (
    <View style={styles.person}>
      <View style={[styles.av, { width: av, height: av, borderRadius: av / 2 }, p.role === "AREA" ? styles.avArea : styles.avCoco, p.left && styles.avLeft]}>
        <Text style={[styles.avText, { fontSize: 13 * k }]}>{ini(p.name)}</Text>
      </View>
      <View style={{ flexShrink: 1, flexGrow: 1 }}>
        {/* ชื่อตัดบรรทัดได้ ไม่ตัดเป็น … — ชื่อเล่นอยู่ท้ายชื่อ ตัดแล้วหายทั้งที่เป็นชื่อที่คนเรียกกันจริง */}
        <Text style={[styles.pn, { fontSize: 13.5 * k }, p.left && styles.pnLeft]}>
          {p.name}
          {mine ? <Text style={styles.mine}> · คุณ</Text> : null}
        </Text>
        <Text style={[styles.pr, { fontSize: 11.5 * k, lineHeight: 17 * k }]}>{meta}</Text>
        {phone && editing ? <Text style={[styles.phoneText, { fontSize: 12.5 * k }]}>{phone}</Text> : null}
        {phone && !editing ? <PhoneLine phone={phone} name={p.name} size={12.5 * k} /> : null}
      </View>
      {narrow && phone && !editing ? <CallButton phone={phone} name={p.name} /> : null}
    </View>
  );
}

type MaidItem = { key: string; maid: AreaMaid; codes: string[]; hit: boolean; cur: boolean; mine: boolean };

/** Maid (COCO) ใต้คนที่ถือสาขา — ระหว่างแก้ไขจางลงและล็อก เพราะ Maid ย้ายตามสาขา ไม่ได้ลากเอง */
function MaidBlock({ items, k, narrow, editing }: { items: MaidItem[]; k: number; narrow: boolean; editing: boolean }) {
  const av = Math.round(26 * k);
  return (
    <View style={[styles.maidBox, editing && styles.maidLocked]}>
      <View style={styles.maidHead}>
        <Text style={[styles.maidTitle, { fontSize: 11.5 * k }]}>Maid (COCO) ประจำสาขา ({items.length})</Text>
        {editing ? (
          <View style={styles.lockRow}>
            <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
            <Text style={styles.lockText}>ย้ายตามสาขา</Text>
          </View>
        ) : null}
      </View>
      {items.map((x) => (
        <View key={x.key} nativeID={`am-${x.key}`} style={[styles.maidRow, x.hit && styles.ring, x.cur && styles.cur, x.mine && styles.mineRow]}>
          <View style={[styles.av, styles.avMaid, { width: av, height: av, borderRadius: av / 2 }]}>
            <Text style={[styles.avText, { fontSize: 12 * k }]}>{ini(x.maid.name)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.maidName, { fontSize: 13 * k }]}>
              {x.maid.name}
              {x.mine ? <Text style={styles.mine}> · คุณ</Text> : null}
              <Text style={[styles.maidCodes, { fontSize: 11.5 * k }]}> · {x.codes.join(" · ")}</Text>
            </Text>
            {x.maid.phone && editing ? <Text style={[styles.phoneText, { fontSize: 12.5 * k }]}>{x.maid.phone}</Text> : null}
            {x.maid.phone && !editing ? <PhoneLine phone={x.maid.phone} name={x.maid.name} size={12.5 * k} /> : null}
          </View>
          {narrow && x.maid.phone && !editing ? <CallButton phone={x.maid.phone} name={x.maid.name} /> : null}
        </View>
      ))}
    </View>
  );
}

function Chips({
  codes,
  byCode,
  cover,
  more,
}: {
  codes: string[];
  byCode: Map<string, AreaBranch>;
  cover?: boolean;
  more?: { n: number; label: string; onPress: () => void };
}) {
  const env = useContext(ChipContext);
  return (
    <View style={styles.chips}>
      {codes.map((c) => {
        const b = byCode.get(c)!;
        return (
          <Draggable
            key={c}
            nativeID={`am-b${c}`}
            grab={{ kind: "BRANCH", code: c }}
            label={`สาขา ${c}`}
            style={[
              styles.chip,
              { paddingHorizontal: 7 * env.k, paddingVertical: 2 * env.k },
              cover && styles.chipCover,
              env.maid(c) && styles.chipMaid,
              env.hit(c) && styles.ring,
              env.cur === `b${c}` && styles.cur,
            ]}
            onView={() => env.view(c)}
          >
            <Text style={[styles.chipText, { fontSize: 12 * env.k }, cover && { color: colors.warningInk }]}>{c}</Text>
            {b.open ? <Text style={[styles.chipOpen, { fontSize: 10.5 * env.k }]}>{b.open}</Text> : null}
          </Draggable>
        );
      })}
      {more ? (
        <TouchableOpacity style={styles.moreChip} onPress={more.onPress} accessibilityLabel={more.label}>
          <Text style={[styles.moreText, { fontSize: 12 * env.k }]}>+{more.n} สาขา</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── หน้าต่างย้ายสาขาทั้งหมด / ส่งต่อสาขาที่ดูแลแทน ───────────────

function PickHolderModal({
  title,
  subtitle,
  options,
  withMode,
  note,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  subtitle: string;
  options: DropdownOption[];
  withMode: boolean;
  note: (target: string | null, mode: "cover" | "permanent") => string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (targetId: number, mode: "cover" | "permanent") => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [mode, setMode] = useState<"cover" | "permanent">("cover");
  const label = options.find((o) => o.value === target)?.label ?? null;
  return (
    <AppModal
      visible
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        <View style={styles.mfoot}>
          <TouchableOpacity style={[styles.mbtn, styles.mghost]} onPress={onClose}>
            <Text style={styles.mghostText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mbtn, { backgroundColor: target ? colors.navyFill : colors.border }]}
            onPress={() => (target ? onConfirm(Number(target), mode) : feedback.toast("info", "เลือกคนที่จะรับสาขาก่อน"))}
            accessibilityLabel={`ยืนยัน${confirmLabel}`}
          >
            <Text style={[styles.mbtnText, !target && { color: colors.textFaint }]}>{confirmLabel}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: spacing.lg }}>
        <View style={{ gap: 6 }}>
          <Text style={styles.mlabel}>ให้ใครดูแล</Text>
          <Dropdown value={target} options={options} onChange={setTarget} placeholder="เลือก Supervisor (COCO) หรือ Area" accessibilityLabel="เลือกคนที่จะรับสาขา" />
        </View>
        {withMode ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.mlabel}>แบบไหน</Text>
            {(
              [
                ["cover", "ดูแลแทนชั่วคราว", "เช่น ลาออก มีคนดูแลแทนก่อน — ระบบจำว่าเป็นสาขาของใคร มีคนใหม่แล้วส่งต่อได้ทีเดียว สาขาเดิมของคนดูแลแทนไม่ติดไปด้วย"],
                ["permanent", "ย้ายถาวร", "กลายเป็นสาขาของคนที่รับเลย"],
              ] as const
            ).map(([k, t, s]) => (
              <TouchableOpacity
                key={k}
                style={[styles.opt, mode === k && styles.optOn]}
                onPress={() => setMode(k)}
                accessibilityLabel={t}
                accessibilityState={{ selected: mode === k }}
              >
                <View style={[styles.radio, mode === k && styles.radioOn]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optT}>{t}</Text>
                  <Text style={styles.optS}>{s}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        <View style={styles.mwarn}>
          <Text style={styles.mwarnText}>{note(label, mode)}</Text>
        </View>
      </View>
    </AppModal>
  );
}

// ── ผัง ───────────────────────────────────────────────

export default function AreaMap({
  head,
  onEditingChange,
  registerReload,
}: {
  /** หัวกระดาษ + ปุ่มสลับผัง — มาจากหน้าผังผู้รับผิดชอบ ให้สองผังหน้าตาเดียวกัน */
  head: React.ReactNode;
  onEditingChange?: (editing: boolean) => void;
  registerReload?: (fn: () => Promise<void>) => void;
}) {
  const { width } = useWindowDimensions();
  const narrow = width < 700;
  const { user } = useAuth();
  const [data, setData] = useState<AreaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [query, setQuery] = useState("");
  const [editing, setEditingRaw] = useState(false);
  const [grab, setGrab] = useState<Grab | null>(null);
  const [dragging, setDragging] = useState(false);
  const [supArea, setSupArea] = useState<Map<number, number | null>>(new Map());
  const [branchState, setBranchState] = useState<Map<string, BranchState>>(new Map());
  const [log, setLog] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [moveAll, setMoveAll] = useState<number | null>(null);
  const [handover, setHandover] = useState<{ holderId: number; key: string } | null>(null);
  // หน้าตาผัง — Area ที่กางไว้ (null = ยังไม่ได้ตั้งตามคนที่เปิด) · Area ที่ผู้ใช้กดย่อเองระหว่างค้นหา · ขนาด
  const [openIds, setOpenIds] = useState<Set<number> | null>(null);
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(() => {
    const z = readUi().z;
    return typeof z === "number" && z >= 0 && z < DENSITY.length ? z : 1;
  });
  const [hitIdx, setHitIdx] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [more, setMore] = useState<Set<number>>(new Set());
  const [bodyW, setBodyW] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const [, setTick] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const dockRef = useRef<View>(null);
  const toolbarH = useRef(0);
  const showTopRef = useRef(false);
  /** element ที่ต้องเลื่อนไปหลังวาดเสร็จ ("cur" = ผลค้นหาปัจจุบัน) — เลื่อนก่อนวาดไม่ได้เพราะ Area ที่กางให้ยังไม่มีบนจอ */
  const pendingScroll = useRef<string | null>(null);
  const curKeyRef = useRef<string | null>(null);
  const quickSig = useRef("");

  const setEditing = (v: boolean) => {
    setEditingRaw(v);
    onEditingChange?.(v);
  };

  const load = useCallback(async () => {
    try {
      const res = await api.get<AreaData>("/teams/area-map");
      setData(res.data);
      setSupArea(new Map(res.data.people.filter((p) => p.role === "COCO_SUPERVISOR").map((p) => [p.id, p.areaId])));
      setBranchState(
        new Map(
          res.data.branches.map((b) => [
            b.code,
            { holderId: b.holderId, coverForId: b.cover?.forId ?? null, coverForName: b.cover?.forName ?? null, coverSince: b.cover?.since ?? null },
          ])
        )
      );
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
  useEffect(() => registerReload?.(load), [load]);

  // Area ของคนที่เปิดผัง — Area ตัวเอง · Supervisor อยู่ใต้ Area ไหน · Maid ประจำสาขาของใคร (สาขาอยู่คนละ Area ได้ จึงเป็นหลาย Area)
  const myAreas = useMemo(() => {
    const out = new Set<number>();
    if (!data || !user) return out;
    const p = data.people.find((x) => x.id === user.id && !x.left);
    if (p?.role === "AREA") out.add(p.id);
    else if (p?.role === "COCO_SUPERVISOR" && p.areaId) out.add(p.areaId);
    else if (user.role === "COCO_MAID") {
      for (const b of data.branches) {
        if (!b.holderId || !b.maids?.includes(user.id)) continue;
        const h = data.people.find((x) => x.id === b.holderId);
        const a = h ? (h.role === "AREA" ? h.id : h.areaId) : null;
        if (a) out.add(a);
      }
    }
    return out;
  }, [data, user?.id, user?.role]);

  // เปิดครั้งแรก: ทีม Area เจอ Area ของตัวเองกางรอ · แอดมิน/ช่างเห็นภาพรวมก่อน · Area น้อย (≤3) กางหมด
  useEffect(() => {
    if (!data || openIds) return;
    const ids = data.people.filter((p) => p.role === "AREA" && !p.left).map((p) => p.id);
    const stored = readUi().open;
    const init = new Set(ids.length <= 3 ? ids : Array.isArray(stored) ? stored.filter((id) => ids.includes(id)) : []);
    myAreas.forEach((a) => init.add(a));
    setOpenIds(init);
  }, [data, openIds, myAreas]);
  useEffect(() => {
    if (openIds) writeUi({ z: zoom, open: [...openIds] });
  }, [zoom, openIds]);

  useEffect(() => {
    markScrollable((scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.());
  });

  // เลื่อนไปที่ element หลังวาดเสร็จ — ไล่ผลค้นหา · คำตอบด่วน · แสดงในผัง · ถาดสาขาไม่มีผู้ดูแล
  useEffect(() => {
    const want = pendingScroll.current;
    if (!want) return;
    pendingScroll.current = null;
    if (!web || typeof document === "undefined") return;
    // "?id" = เลื่อนเฉพาะเมื่อมองไม่เห็น — คำตอบด่วนที่เพิ่งขึ้นตอนพิมพ์ ถ้าเห็นอยู่แล้วไม่ต้องกระตุกหน้า
    const onlyIfHidden = want.startsWith("?");
    const raw = onlyIfHidden ? want.slice(1) : want;
    const id = raw === "cur" ? (curKeyRef.current ? `am-${curKeyRef.current}` : null) : raw;
    if (!id) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      if (onlyIfHidden) {
        const node = (scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.();
        const box = node?.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        if (box && r.top >= box.top + toolbarH.current && r.bottom <= box.bottom) return;
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  });
  const scrollToEl = (id: string) => {
    pendingScroll.current = id;
    setTick((t) => t + 1);
  };

  // ลากใกล้ขอบบน/ล่างแล้วหน้าเลื่อนเอง — แบบเดียวกับผังฝ่ายบริการ (เบราว์เซอร์ไม่เลื่อนกล่องเลื่อนให้ระหว่างลาก)
  useEffect(() => {
    if (!web || !dragging) return;
    const node = (scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.();
    if (!node) return;
    let speed = 0;
    let frame = 0;
    let last = 0;
    const ZONE = 80;
    const over = (e: DragEvent) => {
      last = Date.now();
      const r = node.getBoundingClientRect();
      // แถบเครื่องมือติดบนสุดบังขอบบน — นับโซนเลื่อนขึ้นจากใต้แถบ
      const top = r.top + toolbarH.current;
      const dock = domOf(dockRef);
      const bottom = Math.min(r.bottom, dock ? dock.getBoundingClientRect().top : r.bottom);
      const y = e.clientY;
      speed = y < top + ZONE ? -Math.ceil((top + ZONE - y) / 4) : y > bottom - ZONE && y < bottom ? Math.ceil((y - (bottom - ZONE)) / 4) : 0;
    };
    const tick = () => {
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

  useEffect(() => {
    if (!web || !grab) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setGrab(null);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [grab]);

  const person = useMemo(() => new Map((data?.people ?? []).map((p) => [p.id, p])), [data]);
  const byCode = useMemo(() => new Map((data?.branches ?? []).map((b) => [b.code, b])), [data]);
  const maidById = useMemo(() => new Map((data?.maids ?? []).map((m) => [m.id, m])), [data]);
  const nameOf = (id: number | null) => (id ? person.get(id)?.name ?? "?" : "ไม่มีผู้ดูแล");
  const areaName = (id: number | null) => (id ? `Area ${person.get(id)?.name ?? "?"}` : "ยังไม่มี Area");
  const maidNote = (codes: string[]) => {
    const names = [...new Set(codes.flatMap((c) => byCode.get(c)?.maids ?? []))].map((id) => maidById.get(id)?.name).filter(Boolean);
    return names.length ? ` (Maid ${names.join(", ")} ประจำสาขานี้ — ย้ายตาม)` : "";
  };

  const openArea = useCallback((id: number) => {
    setOpenIds((s) => new Set(s ?? []).add(id));
    setClosed((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }, []);

  const drop = useCallback(
    (g: Grab, z: Zone) => {
      if (!data) return;
      if (g.kind === "SUP") {
        const s = person.get(g.id)!;
        let to: number | null;
        if (z.kind === "area") to = z.id;
        else if (z.kind === "supTray") to = null;
        else if (z.kind === "holder") {
          const h = person.get(z.id)!;
          if (h.role === "AREA") to = h.id;
          else {
            to = supArea.get(h.id) ?? null;
            if (!to) return feedback.toast("info", `${h.name} ยังไม่อยู่ใต้ Area — วางที่การ์ด Area`);
          }
        } else return feedback.toast("info", "Supervisor วางที่การ์ด Area หรือแถบ “ยังไม่มี Area”");
        const cur = supArea.get(g.id) ?? null;
        if (cur === to) return;
        setSupArea((m) => new Map(m).set(g.id, to));
        if (to) openArea(to);
        setLog((l) => [...l, `${s.name} (Supervisor): ${areaName(cur)} → ${areaName(to)}`]);
        return;
      }
      // รหัสสาขาวางบนการ์ด Area = เปิด Area นั้นให้เลือก Supervisor — ยังถือสาขาไว้ในมือ ไม่ยกให้คน Area
      if (z.kind === "area") {
        openArea(z.id);
        setGrab(g);
        return feedback.toast("info", `${g.code} — เลือก Supervisor (COCO) ใน Area ${person.get(z.id)?.name ?? ""} ที่จะรับสาขา`);
      }
      const cur = branchState.get(g.code)!;
      let to: number | null;
      if (z.kind === "holder") to = z.id;
      else if (z.kind === "branchTray") to = null;
      else return feedback.toast("info", "สาขาวางที่ Supervisor หรือแถบ “สาขาไม่มีผู้ดูแล”");
      if (to && person.get(to)?.left) return feedback.toast("info", "บัญชีนี้ถูกลบแล้ว — ให้คนอื่นดูแล");
      if (cur.holderId === to) return;
      // ย้ายทีละสาขา = ย้ายถาวร ป้ายดูแลแทนหลุด (ดูแลแทนใช้กับย้ายทั้งหมด/ส่งต่อเท่านั้น)
      setBranchState((m) => new Map(m).set(g.code, { holderId: to, coverForId: null, coverForName: null, coverSince: null }));
      setLog((l) => [...l, `สาขา ${g.code}: ${nameOf(cur.holderId)} → ${nameOf(to)}${maidNote([g.code])}`]);
    },
    [data, person, supArea, branchState, maidById, openArea]
  );

  function applyMoveAll(fromId: number, toId: number, mode: "cover" | "permanent") {
    const from = person.get(fromId)!;
    const codes = [...branchState].filter(([, b]) => b.holderId === fromId).map(([c]) => c);
    setBranchState((m) => {
      const n = new Map(m);
      for (const c of codes) {
        const b = m.get(c)!;
        // สาขาที่คนนี้ดูแลแทนคนอื่นอยู่แล้ว ยังเป็นของเจ้าของเดิม — ไม่กลายเป็นของคนที่ลาออก
        n.set(
          c,
          mode === "cover"
            ? { holderId: toId, coverForId: b.coverForId ?? fromId, coverForName: b.coverForName ?? from.name, coverSince: b.coverSince }
            : { holderId: toId, coverForId: null, coverForName: null, coverSince: null }
        );
      }
      return n;
    });
    setLog((l) => [...l, `${from.name}: ย้าย ${codes.length} สาขาให้ ${nameOf(toId)} ${mode === "cover" ? "ดูแลแทนชั่วคราว" : "ถาวร"}${maidNote(codes)}`]);
    setMoveAll(null);
  }

  function applyHandover(holderId: number, key: string, toId: number) {
    const codes = coverGroups(holderId).find((g) => g.key === key)?.codes ?? [];
    setBranchState((m) => {
      const n = new Map(m);
      for (const c of codes) n.set(c, { holderId: toId, coverForId: null, coverForName: null, coverSince: null });
      return n;
    });
    const g = coverGroups(holderId).find((x) => x.key === key);
    setLog((l) => [...l, `${nameOf(holderId)}: ส่งต่อ ${codes.length} สาขาที่ดูแลแทน ${g?.forName ?? ""} ให้ ${nameOf(toId)}${maidNote(codes)}`]);
    setHandover(null);
  }

  async function save() {
    if (!data) return;
    const supervisors = data.people
      .filter((p) => p.role === "COCO_SUPERVISOR" && !p.left && (supArea.get(p.id) ?? null) !== p.areaId)
      .map((p) => ({ id: p.id, areaId: supArea.get(p.id) ?? null }));
    const branches = data.branches
      .filter((b) => {
        const s = branchState.get(b.code)!;
        return s.holderId !== b.holderId || (s.coverForId ?? null) !== (b.cover?.forId ?? null) || (!!s.coverForName !== !!b.cover);
      })
      .map((b) => {
        const s = branchState.get(b.code)!;
        return { code: b.code, holderId: s.holderId, coverForId: s.coverForId };
      });
    if (!supervisors.length && !branches.length) {
      setLog([]);
      return feedback.toast("info", "ไม่มีอะไรเปลี่ยน");
    }
    setSaving(true);
    try {
      await api.post("/teams/area-map", { supervisors, branches }, { loadingText: "กำลังบันทึกผัง…" });
      feedback.toast(
        "success",
        `บันทึกแล้ว${supervisors.length ? ` · Supervisor ${supervisors.length} คน` : ""}${branches.length ? ` · สาขา ${branches.length} แห่ง` : ""} — ใบงานที่แต่ละคนเห็นเปลี่ยนตามทันที`
      );
      setEditing(false);
      setGrab(null);
      await load();
    } catch (e) {
      // บันทึกทั้งชุดในคำสั่งเดียว — พลาดคือไม่มีอะไรเข้าไปเลย การย้ายยังค้างอยู่ให้กดใหม่ได้
      showAlert("บันทึกไม่สำเร็จ", `${apiErrorMessage(e)}\nยังไม่มีอะไรถูกบันทึก — การย้ายยังค้างอยู่`);
    } finally {
      setSaving(false);
    }
  }

  function toggleEdit() {
    if (editing && log.length) {
      return showAlert("ยังไม่ได้บันทึก", `มีการเปลี่ยนแปลง ${log.length} รายการ — กดบันทึกหรือยกเลิกทั้งหมดก่อน`);
    }
    setEditing(!editing);
    setGrab(null);
  }

  // กลุ่มสาขาที่คนนี้ดูแลแทน แยกตามเจ้าของเดิม
  function coverGroups(holderId: number) {
    const m = new Map<string, { key: string; forName: string; since: string | null; codes: string[] }>();
    for (const [c, b] of branchState) {
      if (b.holderId !== holderId || !b.coverForName) continue;
      const key = b.coverForId ? `id${b.coverForId}` : `n${b.coverForName}`;
      const g = m.get(key) ?? { key, forName: b.coverForName, since: b.coverSince, codes: [] };
      g.codes.push(c);
      m.set(key, g);
    }
    return [...m.values()];
  }

  const dnd: DnD = { editing, grab, setGrab, drop, dragging, setDragging };

  if (!data) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.sheet}>
          {head}
          <View style={styles.center}>
            {error ? <EmptyState icon="cloud-offline-outline" title="โหลดผังฝั่ง Area ไม่ได้" text={error} /> : <Spinner color={colors.primary} />}
          </View>
        </View>
      </ScrollView>
    );
  }

  // ── ข้อมูลที่แสดง (ตามที่ย้ายไว้ ยังไม่บันทึกก็เห็นผลแล้ว) ──
  const me = user?.id ?? null;
  const dens = DENSITY[zoom];
  const k = dens.k;
  const areas = data.people.filter((p) => p.role === "AREA" && !p.left);
  const sups = data.people.filter((p) => p.role === "COCO_SUPERVISOR" && !p.left);
  const supsOf = (areaId: number | null) => sups.filter((s) => (supArea.get(s.id) ?? null) === areaId);
  const held = new Map<number | null, string[]>();
  for (const [c, b] of branchState) {
    const list = held.get(b.holderId);
    if (list) list.push(c);
    else held.set(b.holderId, [c]);
  }
  const branchesOf = (id: number | null) => held.get(id) ?? [];
  const ownOf = (id: number) => branchesOf(id).filter((c) => !branchState.get(c)!.coverForName);
  const openOf = (codes: string[]) => codes.reduce((n, c) => n + (byCode.get(c)?.open ?? 0), 0);
  const leftHolders = data.people.filter((p) => p.left && branchesOf(p.id).length);
  const freeSups = supsOf(null);
  const freeBranches = branchesOf(null);
  const allCovers = [...areas, ...sups].flatMap((p) => coverGroups(p.id).map((g) => ({ p, g })));
  /** สาขาเรียงตามที่วาดบนการ์ด (ของตัวเองก่อน แล้วกลุ่มดูแลแทน) — ‹ › จะได้ไล่ตามที่ตาเห็น */
  const codesShown = (id: number) => [...ownOf(id), ...coverGroups(id).flatMap((g) => g.codes)];
  const maidsOfCodes = (codes: string[]) => new Set(codes.flatMap((c) => byCode.get(c)?.maids ?? []).filter((id) => maidById.has(id)));

  // ── ค้นหา ──
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  // เบอร์ค้นได้ทั้งแบบมีขีดและตัวเลขล้วน — เฉพาะคำค้นที่เป็นตัวเลข ไม่งั้น "C0417" ไปเจอเบอร์ที่มี 0417
  const qd = /^[\d\s-]+$/.test(q) ? q.replace(/\D/g, "") : "";
  const txt = (s: string | null | undefined) => searching && !!s && s.toLowerCase().includes(q);
  const personHit = (p: { name: string; code: string; phone: string | null }) => txt(p.name) || txt(p.code) || (qd.length >= 3 && phoneDigits(p.phone).includes(qd));
  const branchHit = (c: string) => txt(c) || txt(byCode.get(c)?.name);
  const maidItemsOf = (holderId: number): MaidItem[] => {
    const m = new Map<number, string[]>();
    for (const c of codesShown(holderId)) for (const id of byCode.get(c)?.maids ?? []) if (maidById.has(id)) m.set(id, [...(m.get(id) ?? []), c]);
    return [...m].map(([id, codes]) => {
      const maid = maidById.get(id)!;
      const key = `m${id}-${holderId}`;
      return { key, maid, codes, hit: personHit(maid), cur: false, mine: id === me };
    });
  };

  const hits: { key: string; area: number | null }[] = [];
  const areaHitN = new Map<number, number>();
  const collect = (p: AreaPerson, area: number | null) => {
    let n = 0;
    const push = (key: string) => {
      hits.push({ key, area });
      n++;
    };
    if (personHit(p)) push(`p${p.id}`);
    for (const c of codesShown(p.id)) if (branchHit(c)) push(`b${c}`);
    for (const x of maidItemsOf(p.id)) if (x.hit) push(x.key);
    return n;
  };
  if (searching) {
    for (const a of areas) {
      let n = collect(a, a.id);
      for (const s of supsOf(a.id)) n += collect(s, a.id);
      areaHitN.set(a.id, n);
    }
    for (const s of [...freeSups, ...leftHolders]) collect(s, null);
    for (const c of freeBranches) if (branchHit(c)) hits.push({ key: `b${c}`, area: null });
  }
  const hitPos = hits.length ? ((hitIdx % hits.length) + hits.length) % hits.length : 0;
  const curKey = hits.length ? hits[hitPos].key : null;
  curKeyRef.current = curKey;

  // Area ที่กางอยู่จริง = ที่ผู้ใช้กาง + ตอนค้นหากาง 2 Area แรกที่พบให้ + Area ของผลที่กำลังดู
  // เลือก 2 Area แรกก่อนแล้วค่อยตัดที่ผู้ใช้กดย่อเอง — ย่ออันหนึ่งแล้วไม่ไปกาง Area ที่ 3 แทน และกดย่อ Area ของผลปัจจุบันได้จริง
  const effOpen = new Set(openIds ?? []);
  if (searching) {
    areas
      .filter((a) => (areaHitN.get(a.id) ?? 0) > 0)
      .slice(0, 2)
      .filter((a) => !closed.has(a.id))
      .forEach((a) => effOpen.add(a.id));
    const curArea = hits[hitPos]?.area;
    if (curArea && !closed.has(curArea)) effOpen.add(curArea);
  }
  const toggleArea = (id: number) => {
    if (!effOpen.has(id)) return openArea(id);
    setOpenIds((s) => {
      const n = new Set(s ?? []);
      n.delete(id);
      return n;
    });
    setClosed((s) => new Set(s).add(id));
  };
  const allOpen = areas.length > 0 && areas.every((a) => effOpen.has(a.id));
  const toggleAll = () => {
    if (allOpen) {
      setOpenIds(new Set());
      setClosed(new Set(areas.map((a) => a.id)));
    } else {
      setOpenIds(new Set(areas.map((a) => a.id)));
      setClosed(new Set());
    }
  };
  const setSearch = (v: string) => {
    setQuery(v);
    setHitIdx(0);
    setShowAll(false);
    setClosed(new Set());
  };
  const step = (dir: number) => {
    if (!hits.length) return;
    // ผลค้นหาอยู่บนผังเท่านั้น — อยู่หน้าตารางแล้วกดไล่ผล สลับกลับไปผังให้ · Area ของผลถัดไปที่เคยกดย่อไว้ กางให้อีกครั้ง
    if (view !== "chart") setView("chart");
    const next = hits[(((hitPos + dir) % hits.length) + hits.length) % hits.length];
    if (next.area && closed.has(next.area)) openArea(next.area);
    pendingScroll.current = "cur";
    setHitIdx((i) => i + dir);
  };
  const chipEnv: ChipEnv = {
    k,
    hit: branchHit,
    cur: curKey,
    maid: (c) => (byCode.get(c)?.maids ?? []).some((id) => maidById.has(id)),
    // ดูอย่างเดียว: กดรหัสสาขา = ค้นสาขานั้น → คำตอบด่วนบอกว่าใครดูแลพร้อมเบอร์ (เดิมขึ้นแค่ชื่อสาขาแล้วหายไป)
    view: (c) => {
      setSearch(c);
      scrollToEl("am-quick");
    },
  };

  // คำตอบด่วน — รหัสสาขาตรง 1–3 แห่ง (หรือชื่อคน 1–3 คน) ตอบเลยว่าโทรหาใคร ไม่ต้องไล่หาในผัง
  const areaOfHolder = (id: number | null) => {
    const h = id ? person.get(id) : null;
    return h ? (h.role === "AREA" ? h : supArea.get(h.id) ? person.get(supArea.get(h.id)!) ?? null : null) : null;
  };
  let quick: QuickItem[] = [];
  if (searching) {
    const bh = [...branchState.keys()].filter(branchHit);
    if (bh.length >= 1 && bh.length <= 3) {
      quick = bh.map((c) => {
        const h = branchState.get(c)!.holderId;
        const hp = h ? person.get(h) ?? null : null;
        const area = areaOfHolder(h);
        const lines: QuickItem["lines"] = [];
        if (hp && hp.role === "COCO_SUPERVISOR") lines.push({ role: "Supervisor (COCO)", name: hp.name + (hp.left ? " (ลบบัญชีแล้ว)" : ""), phone: hp.left ? null : hp.phone });
        for (const id of maidsOfCodes([c])) {
          const m = maidById.get(id)!;
          lines.push({ role: "Maid (COCO)", name: m.name, phone: m.phone });
        }
        if (area) lines.push({ role: "Area", name: area.name, phone: area.phone });
        const b = byCode.get(c)!;
        return { key: `q${c}`, title: c, sub: `${b.name} · ${b.open ? `ใบงานค้าง ${b.open}` : "ไม่มีใบงานค้าง"}`, lines, none: !hp, area: area?.id ?? null, target: `am-b${c}` };
      });
    } else if (!bh.length) {
      const found: QuickItem[] = [];
      for (const p of [...areas, ...sups, ...leftHolders]) {
        if (!personHit(p)) continue;
        const area = p.role === "AREA" ? p : supArea.get(p.id) ? person.get(supArea.get(p.id)!) ?? null : null;
        const role: QuickRole = p.role === "AREA" ? "Area" : "Supervisor (COCO)";
        const lines: QuickItem["lines"] = [{ role, name: p.name, phone: p.left ? null : p.phone }];
        if (area && area.id !== p.id) lines.push({ role: "Area", name: area.name, phone: area.phone });
        found.push({ key: `q${p.id}`, title: p.name, sub: `${role} · ${branchesOf(p.id).length} สาขา${p.left ? " · ลบบัญชีแล้ว" : ""}`, lines, none: false, area: area?.id ?? null, target: `am-p${p.id}` });
      }
      for (const m of data.maids ?? []) {
        if (!personHit(m)) continue;
        const codes = [...branchState.keys()].filter((c) => byCode.get(c)?.maids?.includes(m.id));
        const h = codes.length ? branchState.get(codes[0])!.holderId : null;
        const area = areaOfHolder(h);
        const lines: QuickItem["lines"] = [{ role: "Maid (COCO)", name: m.name, phone: m.phone }];
        const hp = h ? person.get(h) : null;
        if (hp && hp.role === "COCO_SUPERVISOR") lines.push({ role: "Supervisor (COCO)", name: hp.name, phone: hp.left ? null : hp.phone });
        if (area) lines.push({ role: "Area", name: area.name, phone: area.phone });
        found.push({ key: `qm${m.id}`, title: m.name, sub: `Maid (COCO) · ประจำ ${codes.join(" · ") || "—"}`, lines, none: false, area: area?.id ?? null, target: h ? `am-m${m.id}-${h}` : "am-quick" });
      }
      if (found.length <= 3) quick = found;
    }
  }
  // คำตอบด่วนเพิ่งขึ้น (พิมพ์ค้นหา) แต่อยู่นอกจอ — เลื่อนให้เห็น ไม่งั้นบนมือถือพิมพ์แล้วเหมือนไม่มีอะไรเกิดขึ้น
  const sig = quick.map((x) => x.key).join(",");
  if (sig !== quickSig.current) {
    quickSig.current = sig;
    if (sig && !pendingScroll.current) pendingScroll.current = "?am-quick";
  }
  const showIn = (item: QuickItem) => {
    if (view !== "chart") setView("chart");
    if (item.area) openArea(item.area);
    if (searching && !showAll) setShowAll(true);
    scrollToEl(item.target);
  };

  // ── ขนาดคอลัมน์ (ตามความกว้างจริงของพื้นที่ผัง) ──
  const W = bodyW || Math.max(320, width - 64);
  const tileCols = narrow ? 1 : Math.max(2, Math.min(8, Math.floor((W + GAP) / (dens.tileMin + GAP))));
  const tileW = narrow ? W : Math.floor((W - (tileCols - 1) * GAP) / tileCols);
  const panelInner = W - 2 * 14 - 2;
  const supCols = narrow ? 1 : Math.max(1, Math.floor((panelInner + GAP) / (dens.supMin + GAP)));
  // มือถือ: การ์ดเต็มความกว้างเสมอ — ปล่อยให้กว้างตามเนื้อหา การ์ดที่มีหลายสาขาล้นจอ ปุ่มโทรหลุดขอบ (กล่องเลื่อนตั้งซ่อนแนวนอน)
  const fullW = { width: "100%" } as const;
  const supW = narrow ? undefined : Math.floor((panelInner - (supCols - 1) * GAP) / supCols);
  const supOuter = supW ? { width: supW } : fullW;

  const areaStats = (a: AreaPerson) => {
    const ss = supsOf(a.id);
    const codes = [...branchesOf(a.id), ...ss.flatMap((s) => branchesOf(s.id))];
    return { sups: ss.length, codes: codes.length, open: openOf(codes), maids: maidsOfCodes(codes).size };
  };

  const coverBox = (holderId: number) => (g: ReturnType<typeof coverGroups>[number]) => (
    <View key={g.key} style={styles.coverBox}>
      <Text style={[styles.coverLabel, { fontSize: 11.5 * k }]}>
        ดูแลแทน {g.forName}
        {g.since ? ` · ตั้งแต่ ${thDate(g.since)}` : ""} ({g.codes.length})
      </Text>
      <Chips codes={g.codes} byCode={byCode} cover />
      {editing ? (
        <TouchableOpacity style={styles.handBtn} onPress={() => setHandover({ holderId, key: g.key })} accessibilityLabel={`ส่งต่อสาขาที่ดูแลแทน ${g.forName}`}>
          <Text style={styles.handText}>ส่งต่อให้คนใหม่…</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const supHit = (s: AreaPerson) => personHit(s) || codesShown(s.id).some(branchHit) || maidItemsOf(s.id).some((x) => x.hit);
  const supCard = (s: AreaPerson, outer: object) => {
    const own = ownOf(s.id);
    const covers = coverGroups(s.id);
    const all = branchesOf(s.id);
    // ค้นหา/แก้ไขโชว์ครบ — ต้องเห็นชิปที่ตรงคำค้น หรือชิปที่จะลาก
    const full = more.has(s.id) || searching || editing;
    const shown = full ? own : own.slice(0, CHIP_CAP);
    const maids = maidItemsOf(s.id).map((x) => ({ ...x, cur: curKey === x.key }));
    return (
      <Drop
        key={s.id}
        zone={{ kind: "holder", id: s.id }}
        outer={outer}
        nativeID={`am-p${s.id}`}
        style={[styles.card, personHit(s) && styles.ring, curKey === `p${s.id}` && styles.cur, s.id === me && styles.mineCard]}
        label={`Supervisor ${s.name}`}
      >
        <Draggable grab={{ kind: "SUP", id: s.id }} label={`Supervisor (COCO) ${s.name}`}>
          <PersonRow p={s} meta={`Supervisor (COCO) · ${all.length} สาขา${openOf(all) ? ` · ค้าง ${openOf(all)}` : ""}`} k={k} narrow={narrow} mine={s.id === me} editing={editing} />
        </Draggable>
        {own.length ? (
          <Chips
            codes={shown}
            byCode={byCode}
            more={
              shown.length < own.length
                ? { n: own.length - shown.length, label: `แสดงสาขาของ ${s.name} ทั้งหมด`, onPress: () => setMore((m) => new Set(m).add(s.id)) }
                : undefined
            }
          />
        ) : !covers.length ? (
          <Text style={styles.noneWarn}>ยังไม่มีสาขา</Text>
        ) : null}
        {covers.map(coverBox(s.id))}
        {maids.length ? <MaidBlock items={maids} k={k} narrow={narrow} editing={editing} /> : null}
        {editing && all.length ? (
          <TouchableOpacity style={styles.allBtn} onPress={() => setMoveAll(s.id)} accessibilityLabel={`ย้ายสาขาทั้งหมดของ ${s.name}`}>
            <Ionicons name="swap-horizontal" size={14} color={colors.navy} />
            <Text style={styles.allText}>ย้ายสาขาทั้งหมด…</Text>
          </TouchableOpacity>
        ) : null}
      </Drop>
    );
  };

  // คนลบบัญชีแล้วแต่ยังถือสาขา — วาดสาขาและ Maid แบบเดียวกับการ์ด Supervisor (ผลค้นหานับ Maid ใต้คนนี้ด้วย ต้องมีให้เห็น)
  const leftCard = (p: AreaPerson, outer: object) => {
    const maids = maidItemsOf(p.id).map((x) => ({ ...x, cur: curKey === x.key }));
    return (
    <View key={p.id} nativeID={`am-p${p.id}`} style={[styles.card, styles.leftCard, outer, personHit(p) && styles.ring, curKey === `p${p.id}` && styles.cur]}>
      <PersonRow p={p} meta={`ลบบัญชีแล้ว · ยังถือ ${branchesOf(p.id).length} สาขา`} k={k} narrow={narrow} editing={editing} />
      {ownOf(p.id).length ? <Chips codes={ownOf(p.id)} byCode={byCode} /> : null}
      {coverGroups(p.id).map(coverBox(p.id))}
      {maids.length ? <MaidBlock items={maids} k={k} narrow={narrow} editing={editing} /> : null}
      {editing ? (
        <TouchableOpacity style={styles.allBtn} onPress={() => setMoveAll(p.id)} accessibilityLabel={`ย้ายสาขาทั้งหมดของ ${p.name}`}>
          <Ionicons name="swap-horizontal" size={14} color={colors.navy} />
          <Text style={styles.allText}>ย้ายสาขาทั้งหมด…</Text>
        </TouchableOpacity>
      ) : null}
    </View>
    );
  };

  // การ์ด Area — กดกาง/ย่อ · ระหว่างแก้ไขเป็นที่วางชื่อ Supervisor (ลากรหัสสาขาค้างไว้ = กาง)
  const tile = (a: AreaPerson) => {
    const st = areaStats(a);
    const open = effOpen.has(a.id);
    const n = areaHitN.get(a.id) ?? 0;
    const fade = searching && !n;
    const mine = myAreas.has(a.id);
    const press = () => {
      if (editing && grab) {
        const g = grab;
        setGrab(null);
        return drop(g, { kind: "area", id: a.id });
      }
      toggleArea(a.id);
    };
    const badges = (
      <View style={styles.badges}>
        {st.maids ? <Text style={[styles.badge, styles.badgeMaid, { fontSize: 11.5 * k }]}>Maid {st.maids}</Text> : null}
        {st.open ? <Text style={[styles.badge, styles.badgeOpen, { fontSize: 11.5 * k }]}>ค้าง {st.open}</Text> : null}
        {mine ? <Text style={[styles.badge, styles.badgeMine, { fontSize: 11.5 * k }]}>Area ของคุณ</Text> : null}
      </View>
    );
    const av = Math.round(34 * k);
    const avatar = (
      <View style={[styles.av, styles.avArea, { width: av, height: av, borderRadius: av / 2 }]}>
        <Text style={[styles.avText, { fontSize: 14 * k }]}>{ini(a.name)}</Text>
      </View>
    );
    const counts = `${st.sups} Supervisor · ${fmt(st.codes)} สาขา`;
    return (
      <Drop
        key={a.id}
        zone={{ kind: "area", id: a.id }}
        outer={narrow ? fullW : { width: tileW }}
        nativeID={`am-t${a.id}`}
        style={[narrow ? styles.rowTile : styles.tile, open && styles.tileOpen, mine && styles.tileMine, fade && styles.fade]}
        label={`หัว Area ${a.name}`}
        onDwell={() => openArea(a.id)}
      >
        {narrow ? (
          <View style={styles.rowTileIn}>
            <TouchableOpacity
              style={styles.rowTilePress}
              onPress={press}
              accessibilityLabel={`${open ? "ย่อ" : "กางดู"} Area ${a.name}`}
              accessibilityState={{ expanded: open }}
            >
              {avatar}
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[styles.tileName, { fontSize: 14.5 * k }]}>{a.name}</Text>
                <Text style={[styles.tileMeta, { fontSize: 12 * k }]}>{counts}</Text>
                {badges}
              </View>
              {n ? <Text style={styles.hitBadgeInline}>พบ {n}</Text> : null}
              <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.navy} />
            </TouchableOpacity>
            {a.phone && !editing ? <CallButton phone={a.phone} name={a.name} /> : null}
          </View>
        ) : (
          <TouchableOpacity
            onPress={press}
            style={styles.tilePress}
            accessibilityLabel={`${open ? "ย่อ" : "กางดู"} Area ${a.name}`}
            accessibilityState={{ expanded: open }}
          >
            <View style={styles.tileTop}>
              {avatar}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.tileName, { fontSize: 14 * k }]} numberOfLines={2}>
                  {a.name}
                </Text>
                <Text style={[styles.tileMeta, { fontSize: 11.5 * k }]}>Area · {a.code}</Text>
              </View>
              <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.navy} />
            </View>
            {a.phone ? (
              <View style={styles.tilePhone}>
                <Ionicons name="call" size={Math.round(11 * k)} color={colors.primaryInk} />
                <Text style={[styles.tilePhoneText, { fontSize: 12.5 * k }]}>{a.phone}</Text>
              </View>
            ) : null}
            <Text style={[styles.tileCounts, { fontSize: 12.5 * k }]}>{counts}</Text>
            {badges}
            {n ? <Text style={styles.hitBadge}>พบ {n}</Text> : null}
          </TouchableOpacity>
        )}
      </Drop>
    );
  };

  const panel = (a: AreaPerson, notchLeft: number | null) => {
    const ss = supsOf(a.id);
    let shownSups = ss;
    let hidden = 0;
    if (searching && !showAll) {
      shownSups = ss.filter(supHit);
      hidden = ss.length - shownSups.length;
    }
    const own = ownOf(a.id);
    const st = areaStats(a);
    const maids = maidItemsOf(a.id).map((x) => ({ ...x, cur: curKey === x.key }));
    return (
      <View key={`panel${a.id}`} style={styles.panel}>
        {notchLeft !== null ? <View style={[styles.notch, { left: notchLeft }]} /> : null}
        <View style={styles.panelHead}>
          <Drop
            zone={{ kind: "holder", id: a.id }}
            outer={{ flexGrow: 1, flexShrink: 1, flexBasis: 300 }}
            nativeID={`am-p${a.id}`}
            style={[styles.panelPerson, personHit(a) && styles.ring, curKey === `p${a.id}` && styles.cur]}
            label={`Area ${a.name}`}
          >
            <PersonRow
              p={a}
              meta={`Area · ${st.sups} Supervisor (COCO) · ${fmt(st.codes)} สาขา · ${st.maids} Maid (COCO)${st.open ? ` · ใบงานค้าง ${st.open}` : ""}`}
              k={k}
              narrow={narrow}
              mine={a.id === me}
              editing={editing}
            />
            {own.length ? (
              <>
                <Text style={styles.ownLabel}>Area ดูแลสาขาเอง ({own.length})</Text>
                <Chips codes={own} byCode={byCode} />
              </>
            ) : null}
            {coverGroups(a.id).map(coverBox(a.id))}
            {maids.length ? <MaidBlock items={maids} k={k} narrow={narrow} editing={editing} /> : null}
          </Drop>
          <TouchableOpacity style={styles.closeBtn} onPress={() => toggleArea(a.id)} accessibilityLabel={`ย่อ Area ${a.name}`}>
            <Ionicons name="chevron-up" size={15} color={colors.navy} />
            <Text style={styles.closeText}>ย่อ</Text>
          </TouchableOpacity>
        </View>
        {hidden ? (
          <TouchableOpacity style={styles.hiddenBtn} onPress={() => setShowAll(true)} accessibilityLabel={`แสดง Supervisor ทั้งหมดใน Area ${a.name}`}>
            <Text style={styles.hiddenText}>ซ่อน {hidden} คนที่ไม่ตรงกับคำค้น · แสดงทั้งหมด</Text>
          </TouchableOpacity>
        ) : null}
        <View style={styles.grid}>
          {shownSups.length ? shownSups.map((s) => supCard(s, supOuter)) : !hidden ? <Text style={styles.none}>ยังไม่มี Supervisor (COCO)</Text> : null}
        </View>
      </View>
    );
  };

  const rows: AreaPerson[][] = [];
  for (let i = 0; i < areas.length; i += tileCols) rows.push(areas.slice(i, i + tileCols));

  const legend = (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <Text style={styles.chipOpen}>3</Text>
        <Text style={styles.legendText}>เลขแดง = ใบงานค้าง</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.chip, styles.chipMaid]}>
          <Text style={styles.chipText}>C0001</Text>
        </View>
        <Text style={styles.legendText}>ขอบซ้ายชมพู = มี Maid (COCO) ประจำสาขา</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.chip, styles.chipCover]}>
          <Text style={[styles.chipText, { color: colors.warningInk }]}>C0002</Text>
        </View>
        <Text style={styles.legendText}>กรอบประเหลือง = ดูแลแทนชั่วคราว</Text>
      </View>
      <Text style={styles.legendText}>{editing ? "ลาก/แตะรหัสสาขาเพื่อย้าย" : "กดรหัสสาขา = ดูว่าใครดูแล พร้อมเบอร์"}</Text>
    </View>
  );

  const overview = (
    <View>
      <View style={styles.caption}>
        <Text style={styles.captionT}>Area ทั้งหมด {areas.length} คน</Text>
        <Text style={styles.captionS}>
          {searching
            ? "กาง Area ที่พบให้แล้ว · Area อื่นจางลง"
            : editing
              ? "ลากรหัสสาขาไปค้างบนการ์ด Area = กาง Area นั้น แล้ววางที่การ์ด Supervisor ที่จะรับ"
              : "กดการ์ดเพื่อกางดู Supervisor (COCO) และ Maid (COCO) ของ Area นั้น · กางได้หลาย Area พร้อมกัน"}
        </Text>
      </View>
      {!areas.length ? <Text style={[styles.none, { paddingVertical: 12 }]}>ยังไม่มีบัญชี Area — นำเข้าไฟล์ Area Team หรือสร้างที่หน้าสิทธิ์ผู้ใช้</Text> : null}
      {rows.map((row, ri) => (
        <View key={ri} style={{ marginBottom: GAP }}>
          <View style={styles.tileRow}>{row.map(tile)}</View>
          {row.map((a, i) => (effOpen.has(a.id) ? panel(a, narrow ? null : i * (tileW + GAP) + tileW / 2 - 9) : null))}
        </View>
      ))}

      {/* คนที่ยังไม่มี Area / ลาออกแต่ยังถือสาขา ต้องยังหาเจอในผัง — คนเปิดผังมาหาเบอร์ของ Supervisor คนนั้น */}
      {(freeSups.length || leftHolders.length) && (!searching || showAll || [...freeSups, ...leftHolders].some(supHit)) ? (
        <View style={styles.tray}>
          <Drop zone={{ kind: "supTray" }} style={styles.trayHead} label="ยังไม่มี Area">
            <Text style={styles.trayTitle}>
              ยังไม่มี Area · {freeSups.length} Supervisor (COCO){leftHolders.length ? ` · ลบบัญชีแล้วแต่ยังถือสาขา ${leftHolders.length} คน` : ""}
            </Text>
          </Drop>
          <View style={styles.grid}>
            {freeSups.filter((s) => !searching || showAll || supHit(s)).map((s) => supCard(s, supOuter))}
            {leftHolders.filter((p) => !searching || showAll || supHit(p)).map((p) => leftCard(p, supOuter))}
          </View>
        </View>
      ) : null}
      {freeBranches.length ? (
        <Drop zone={{ kind: "branchTray" }} nativeID="am-free" style={styles.freeTray} label="ถาด สาขาไม่มีผู้ดูแล">
          <Text style={styles.freeTitle}>สาขาไม่มีผู้ดูแล ({fmt(freeBranches.length)})</Text>
          <Text style={styles.freeHint}>
            {editing ? "แตะรหัสสาขาแล้วแตะการ์ด Supervisor ที่จะรับ" : data.canEdit ? "กด “แก้ไขผัง” แล้วลากไปให้ Supervisor (COCO)" : "แจ้งแอดมินหรือ Area ให้จัดผู้ดูแล"}
          </Text>
          <Chips codes={freeBranches} byCode={byCode} />
        </Drop>
      ) : null}
    </View>
  );

  // ตาราง: แถวละผู้ดูแล + Maid ใต้คนที่ถือสาขา — สแกนหาเบอร์/สาขาเร็วกว่าผังเมื่อคนเยอะ
  const tablePeople = [...areas.flatMap((a) => [a, ...supsOf(a.id)]), ...freeSups, ...leftHolders];
  const table = (
    <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
      <View style={styles.table}>
        <View style={[styles.tr, styles.thRow]}>
          {["Area", "ผู้ดูแล", "เบอร์โทร", "สาขา", "ใบงานค้าง"].map((h, i) => (
            <Text key={h} style={[styles.th, TABLE_COLS[i], i === 4 && styles.num]}>
              {h}
            </Text>
          ))}
        </View>
        {tablePeople.flatMap((p) => {
          const codes = branchesOf(p.id);
          const area = p.role === "AREA" ? p : supArea.get(p.id) ? person.get(supArea.get(p.id)!) : null;
          const maids = maidItemsOf(p.id);
          const hit = !searching || personHit(p) || codes.some(branchHit) || maids.some((x) => x.hit);
          return [
            <View key={p.id} style={[styles.tr, !hit && styles.dim]}>
              <Text style={[styles.td, TABLE_COLS[0]]}>{area ? area.name : "ยังไม่มี Area"}</Text>
              <Text style={[styles.td, TABLE_COLS[1], { fontWeight: "700" }]}>
                {p.name}
                {p.role === "AREA" ? " (Area)" : ""}
                {p.left ? " · ลบบัญชีแล้ว" : ""}
              </Text>
              <Text style={[styles.td, TABLE_COLS[2]]}>{p.left ? "" : p.phone ?? ""}</Text>
              <Text style={[styles.td, TABLE_COLS[3]]}>{codes.join(" ") || "—"}</Text>
              <Text style={[styles.td, TABLE_COLS[4], styles.num]}>{openOf(codes)}</Text>
            </View>,
            ...maids.map((x) => (
              <View key={x.key} style={[styles.tr, styles.trMaid, !hit && styles.dim]}>
                <Text style={[styles.td, TABLE_COLS[0]]} />
                <Text style={[styles.td, TABLE_COLS[1], styles.tdMaid]}>↳ Maid (COCO) {x.maid.name}</Text>
                <Text style={[styles.td, TABLE_COLS[2]]}>{x.maid.phone ?? ""}</Text>
                <Text style={[styles.td, TABLE_COLS[3]]}>ประจำ {x.codes.join(" ")}</Text>
                <Text style={[styles.td, TABLE_COLS[4]]} />
              </View>
            )),
          ];
        })}
      </View>
    </ScrollView>
  );

  const issues: [string, string][] = [];
  if (freeBranches.length) issues.push([`สาขา COCO ${fmt(freeBranches.length)} แห่ง`, `ยังไม่มี Supervisor ดูแล — ${freeBranches.slice(0, 8).join(" ")}${freeBranches.length > 8 ? " …" : ""}`]);
  if (freeSups.length) issues.push([`Supervisor (COCO) ${freeSups.length} คน`, `ยังไม่อยู่ใต้ Area ใด — ${freeSups.map((s) => s.name).join(", ")}`]);
  const noBranch = sups.filter((s) => !branchesOf(s.id).length);
  if (noBranch.length) issues.push([`Supervisor (COCO) ${noBranch.length} คนยังไม่มีสาขา`, noBranch.map((s) => s.name).join(", ")]);
  for (const p of leftHolders) issues.push([p.name, `บัญชีถูกลบแล้ว แต่ยังถือ ${branchesOf(p.id).length} สาขา — ย้ายให้คนอื่นดูแล`]);
  for (const { p, g } of allCovers) {
    issues.push([`สาขา ${g.codes.length} แห่งมีคนดูแลแทนอยู่`, `${p.name} ดูแลแทน ${g.forName}${g.since ? ` ตั้งแต่ ${thDate(g.since)}` : ""} — มีคนใหม่แล้วกด “ส่งต่อให้คนใหม่”`]);
  }
  const pills: [string, "danger" | "warn"][] = [];
  if (freeBranches.length) pills.push([`สาขาไม่มีผู้ดูแล ${fmt(freeBranches.length)}`, "danger"]);
  if (freeSups.length) pills.push([`Supervisor ยังไม่มี Area ${freeSups.length}`, "warn"]);
  if (noBranch.length) pills.push([`Supervisor ยังไม่มีสาขา ${noBranch.length}`, "warn"]);
  if (leftHolders.length) pills.push([`ลบบัญชีแล้วยังถือสาขา ${leftHolders.length}`, "danger"]);
  if (allCovers.length) pills.push([`ดูแลแทนชั่วคราว ${allCovers.length} กลุ่ม`, "warn"]);

  const holderOptions = (exclude: number): DropdownOption[] =>
    [...areas, ...sups]
      .filter((p) => p.id !== exclude)
      .map((p) => {
        const area = p.role === "AREA" ? p : supArea.get(p.id) ? person.get(supArea.get(p.id)!) : null;
        return {
          value: String(p.id),
          label: `${p.name} · ${branchesOf(p.id).length} สาขา`,
          hint: p.role === "AREA" ? "Area" : "Supervisor (COCO)",
          group: area ? `Area ${area.name}` : "ยังไม่มี Area",
        };
      });
  const grabName = (g: Grab) => (g.kind === "SUP" ? person.get(g.id)?.name ?? "" : `สาขา ${g.code}`);
  const controls = (
    <>
      <View style={styles.seg}>
        {(
          [
            ["chart", "ผังองค์กร"],
            ["table", "ตาราง"],
          ] as const
        ).map(([v, l]) => (
          <TouchableOpacity key={v} style={[styles.segBtn, view === v && styles.segOn]} onPress={() => setView(v)} accessibilityState={{ selected: view === v }}>
            <Text style={[styles.segText, view === v && styles.segTextOn]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {view === "chart" ? (
        <TouchableOpacity style={styles.toolBtn} onPress={toggleAll} accessibilityLabel={allOpen ? "ย่อทุก Area" : "กางทุก Area"}>
          <Ionicons name={allOpen ? "contract-outline" : "expand-outline"} size={15} color={colors.navy} />
          <Text style={styles.toolText}>{allOpen ? "ย่อทั้งหมด" : "กางทั้งหมด"}</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.zoom}>
        <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0} accessibilityLabel="ย่อขนาดผัง">
          <Ionicons name="remove" size={17} color={zoom === 0 ? colors.borderStrong : colors.navy} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomMid} onPress={() => setZoom(1)} accessibilityLabel={`ขนาดผัง ${dens.label} — กดเพื่อกลับขนาดปกติ`}>
          <Text style={styles.zoomSmall}>ขนาด</Text>
          <Text style={styles.zoomLabel}>{dens.label}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.zoomBtn, styles.zoomBtnRight]}
          onPress={() => setZoom((z) => Math.min(DENSITY.length - 1, z + 1))}
          disabled={zoom === DENSITY.length - 1}
          accessibilityLabel="ขยายขนาดผัง"
        >
          <Ionicons name="add" size={17} color={zoom === DENSITY.length - 1 ? colors.borderStrong : colors.navy} />
        </TouchableOpacity>
      </View>
      {data.canEdit ? (
        <TouchableOpacity style={[styles.editBtn, editing && styles.editOn]} onPress={toggleEdit} accessibilityLabel={editing ? "เสร็จสิ้นการแก้ไข" : "แก้ไขผังฝั่ง Area"}>
          <Ionicons name={editing ? "checkmark" : "create-outline"} size={16} color={editing ? "#1B1405" : colors.navy} />
          <Text style={[styles.editText, editing && { color: "#1B1405" }]}>{editing ? "เสร็จสิ้นการแก้ไข" : "แก้ไขผัง"}</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );
  const editRow = (
    <View style={styles.editRow}>
      <Text style={styles.editbandText}>
        โหมดแก้ไข — {web ? "ลากชื่อหรือรหัสสาขา หรือคลิกแล้วคลิก" : "แตะชื่อหรือรหัสสาขา แล้วแตะ"}ปลายทาง · ชื่อ Supervisor → การ์ด Area หรือชื่อด้านล่าง · รหัสสาขา → การ์ด
        Supervisor · Maid (COCO) ย้ายตามสาขาเอง · ยังไม่บันทึกจนกด “บันทึก”
      </Text>
      <View style={styles.areaDrops}>
        <Text style={styles.areaDropsLabel}>ย้ายไป Area:</Text>
        {areas.map((a) => (
          <Drop key={a.id} zone={{ kind: "area", id: a.id }} style={styles.areaDrop} label={`ย้ายไป Area ${a.name}`} onDwell={() => openArea(a.id)}>
            <Text style={styles.areaDropText}>{a.name}</Text>
          </Drop>
        ))}
      </View>
    </View>
  );
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const v = e.nativeEvent.contentOffset.y > 500;
    if (v !== showTopRef.current) {
      showTopRef.current = v;
      setShowTop(v);
    }
  };

  return (
    <DnDContext.Provider value={dnd}>
      <ChipContext.Provider value={chipEnv}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <ScrollView
            ref={scrollRef}
            stickyHeaderIndices={[1]}
            onScroll={onScroll}
            scrollEventThrottle={100}
            contentContainerStyle={[styles.page, editing && { paddingBottom: 300 }]}
          >
            {/* [0] หัวกระดาษ ตัวเลขรวม ประเด็น — เลื่อนหายไปได้ */}
            <View style={[styles.sheet, styles.sheetGap, editing && { borderColor: GOLD }]}>
              {head}
              <View style={styles.stats}>
                {(
                  [
                    [areas.length, "Area", null],
                    [sups.length, "Supervisor (COCO)", null],
                    [(data.maids ?? []).length, "Maid (COCO)", colors.roleMaidInk],
                    [fmt(data.branches.length), "สาขา COCO", null],
                  ] as const
                ).map(([v, l, c]) => (
                  <View key={l} style={styles.stat}>
                    <Text style={[styles.statV, c ? { color: c } : null]}>{v}</Text>
                    <Text style={styles.statL}>{l}</Text>
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.stat}
                  onPress={() => (freeBranches.length ? scrollToEl("am-free") : undefined)}
                  accessibilityLabel={`สาขาไม่มีผู้ดูแล ${freeBranches.length} แห่ง`}
                >
                  <Text style={[styles.statV, freeBranches.length > 0 && { color: colors.dangerInk }]}>{fmt(freeBranches.length)}</Text>
                  <Text style={[styles.statL, freeBranches.length > 0 && styles.statLink]}>สาขาไม่มีผู้ดูแล</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.issues}>
                <View style={styles.issueLine1}>
                  <Text style={styles.h3}>ต้องจัดการ</Text>
                  {pills.length ? (
                    pills.map(([t, tone]) => (
                      <Text key={t} style={[styles.pill, tone === "danger" ? styles.pillDanger : styles.pillWarn]}>
                        {t}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.pr}>ไม่มี — ทุกสาขามีผู้ดูแล ทุกคนอยู่ใต้ Area</Text>
                  )}
                  {issues.length ? (
                    <TouchableOpacity onPress={() => setIssuesOpen((v) => !v)} accessibilityLabel={issuesOpen ? "ซ่อนรายละเอียดประเด็น" : "ดูรายละเอียดประเด็น"}>
                      <Text style={styles.linkText}>{issuesOpen ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {issuesOpen
                  ? issues.map(([a, b], i) => (
                      <View key={`${a}${i}`} style={[styles.issue, i > 0 && styles.issueLine]}>
                        <Text style={styles.issueN}>{i + 1}</Text>
                        <Text style={styles.issueText}>
                          <Text style={{ fontWeight: "700" }}>{a}</Text> — {b}
                        </Text>
                      </View>
                    ))
                  : null}
              </View>
            </View>

            {/* [1] แถบเครื่องมือ — ติดบนสุดตลอด ไม่ต้องเลื่อนกลับขึ้นไปค้นหา/ย่อ/ขยาย */}
            <View style={[styles.toolbar, editing && styles.toolbarEdit]} onLayout={(e) => (toolbarH.current = e.nativeEvent.layout.height)}>
              <View style={styles.toolRow}>
                <View style={[styles.search, searching && styles.searchOn]}>
                  <Ionicons name="search-outline" size={17} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    value={query}
                    onChangeText={setSearch}
                    onSubmitEditing={() => step(1)}
                    onKeyPress={(e) => {
                      if (e.nativeEvent.key === "Escape") setSearch("");
                    }}
                    blurOnSubmit={false}
                    returnKeyType="search"
                    placeholder="ค้นหารหัสสาขา ชื่อ หรือเบอร์โทร"
                    placeholderTextColor={colors.textFaint}
                    accessibilityLabel="ค้นหาในผังฝั่ง Area"
                  />
                  {searching ? (
                    <>
                      <Text style={[styles.hitText, !hits.length && { color: colors.dangerInk }]} accessibilityLiveRegion="polite">
                        {hits.length ? `พบ ${hits.length} · ${hitPos + 1}/${hits.length}` : "ไม่พบ"}
                      </Text>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => step(-1)} disabled={!hits.length} accessibilityLabel="ผลค้นหาก่อนหน้า">
                        <Ionicons name="chevron-back" size={15} color={colors.navy} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => step(1)} disabled={!hits.length} accessibilityLabel="ผลค้นหาถัดไป">
                        <Ionicons name="chevron-forward" size={15} color={colors.navy} />
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.stepBtn, styles.clearBtn]} onPress={() => setSearch("")} accessibilityLabel="ล้างคำค้น">
                        <Ionicons name="close" size={15} color={colors.textMuted} />
                      </TouchableOpacity>
                    </>
                  ) : null}
                </View>
                {narrow ? null : controls}
              </View>
              {!narrow && view === "chart" ? legend : null}
              {!narrow && editing ? editRow : null}
            </View>

            {/* [2] ผัง/ตาราง */}
            <View style={styles.body} onLayout={(e) => setBodyW(Math.round(e.nativeEvent.layout.width))}>
              {/* มือถือ: ติดบนสุดแค่ช่องค้นหา — ปุ่มทั้งหมดติดด้วยกินจอไปครึ่งหนึ่ง */}
              {narrow ? (
                <View style={styles.narrowTools}>
                  <View style={styles.toolRow}>{controls}</View>
                  {view === "chart" ? legend : null}
                  {editing ? editRow : null}
                </View>
              ) : null}
              {quick.length ? (
                <View nativeID="am-quick" style={styles.quick}>
                  <Text style={styles.quickTitle}>คำตอบด่วน — ใครดูแล โทรหาใคร</Text>
                  {quick.map((it) => (
                    <View key={it.key} style={styles.quickItem}>
                      <View style={styles.quickHead}>
                        <Text style={styles.quickT}>{it.title}</Text>
                        <Text style={styles.quickS}>{it.sub}</Text>
                      </View>
                      <View style={styles.quickLines}>
                        {it.lines.map((l, i) => (
                          <View key={i} style={styles.quickLine}>
                            <Text style={[styles.rolePill, ROLE_PILL[l.role]]}>{l.role}</Text>
                            <View style={{ flexShrink: 1, flexGrow: narrow ? 1 : 0 }}>
                              <Text style={styles.quickName}>{l.name}</Text>
                              {l.phone ? <PhoneLine phone={l.phone} name={l.name} /> : <Text style={styles.noPhone}>ไม่มีเบอร์ในระบบ</Text>}
                            </View>
                            {narrow && l.phone ? <CallButton phone={l.phone} name={l.name} /> : null}
                          </View>
                        ))}
                        {it.none ? <Text style={styles.quickNone}>ยังไม่มีผู้ดูแล</Text> : null}
                      </View>
                      <TouchableOpacity style={styles.showBtn} onPress={() => showIn(it)} accessibilityLabel={`แสดง ${it.title} ในผัง`}>
                        <Text style={styles.showText}>แสดงในผัง →</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}

              {view === "chart" ? overview : table}

              <View style={styles.foot}>
                <Text style={styles.pr}>
                  แอดมินและ Area แก้ผังนี้ได้ · ข้อมูลตั้งต้นมาจากไฟล์ Area Team — นำเข้าไฟล์รอบใหม่ ค่าในไฟล์จะทับที่ย้ายในผัง · Maid (COCO)
                  แก้สาขาที่ประจำได้ที่หน้าสิทธิ์ผู้ใช้
                </Text>
              </View>
            </View>
          </ScrollView>


          {showTop && !editing ? (
            <TouchableOpacity style={styles.fab} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} accessibilityLabel="กลับขึ้นบน">
              <Ionicons name="arrow-up" size={16} color="#fff" />
              <Text style={styles.fabText}>กลับขึ้นบน</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.bottomStack} pointerEvents="box-none">
            {/* ป้ายกำลังย้ายอยู่เหนือแถบวางล่างจอ — ถ้าลอยบนสุดจะบังช่องค้นหา/ปุ่มไล่ผลที่ติดบนสุด ตอนหยิบแล้วค้นหาคนรับ */}
            {grab && !dragging ? (
              <View style={styles.movingRow} pointerEvents="box-none">
                <View style={styles.movingPill}>
                  <Text style={styles.movingText} numberOfLines={2}>
                    กำลังย้าย {grabName(grab)} — {web ? "คลิก" : "แตะ"}
                    {grab.kind === "SUP" ? "การ์ด Area ที่ต้องการ" : "การ์ด Supervisor ที่จะรับสาขา"}
                    {web ? " (Esc ยกเลิก)" : ""}
                  </Text>
                  <TouchableOpacity onPress={() => setGrab(null)} accessibilityLabel="ยกเลิกการย้าย">
                    <Ionicons name="close" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            {editing ? (
              // ที่วาง "เอาออก" ลอยติดล่างจอ — ผังยาวหลาย Area ลากไปถาดท้ายผังไม่ถึง
              <View ref={dockRef} style={styles.dock}>
                <Drop zone={{ kind: "supTray" }} style={styles.dockZone} outer={styles.dockCell} label="แถบ ยังไม่มี Area">
                  <Text style={styles.dockTitle}>● ยังไม่มี Area ({freeSups.length})</Text>
                  <Text style={styles.dockHint}>วางชื่อ Supervisor ที่นี่ = เอาออกจาก Area</Text>
                </Drop>
                <Drop
                  zone={{ kind: "branchTray" }}
                  style={[styles.dockZone, { borderLeftWidth: 1, borderLeftColor: colors.warningBorder }]}
                  outer={styles.dockCell}
                  label="แถบ สาขาไม่มีผู้ดูแล"
                >
                  <Text style={styles.dockTitle}>● สาขาไม่มีผู้ดูแล ({freeBranches.length})</Text>
                  {freeBranches.length ? (
                    <ScrollView style={{ maxHeight: 70 }}>
                      <Chips codes={freeBranches} byCode={byCode} />
                    </ScrollView>
                  ) : (
                    <Text style={styles.dockHint}>วางรหัสสาขาที่นี่ = ปลดสาขาออก</Text>
                  )}
                </Drop>
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
                  <Text style={styles.pendingNote}>ถ้านำเข้าไฟล์ Area Team รอบใหม่ ค่าในไฟล์จะทับที่ย้ายไว้</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={styles.pbtn} onPress={load} disabled={saving} accessibilityLabel="ยกเลิกทั้งหมด">
                    <Text style={styles.pbtnText}>ยกเลิกทั้งหมด</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.pbtn, styles.pbtnSave]} onPress={save} disabled={saving} accessibilityLabel="บันทึกผังฝั่ง Area">
                    {saving ? <Spinner size="small" color={colors.navy} /> : <Text style={[styles.pbtnText, { color: colors.navy }]}>บันทึก</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>

          {moveAll !== null ? (
            <PickHolderModal
              title={`ย้ายสาขาทั้งหมดของ ${nameOf(moveAll)}`}
              subtitle={`${branchesOf(moveAll).length} สาขา · ${branchesOf(moveAll).join(" · ")}`}
              options={holderOptions(moveAll)}
              withMode
              confirmLabel={`ย้าย ${branchesOf(moveAll).length} สาขา`}
              note={(t, mode) =>
                `${t ? `${t.split(" · ")[0]} ` : "คนที่รับ"}จะเห็นใบงานของ ${branchesOf(moveAll).length} สาขานี้ทันทีหลังกดบันทึก · ${nameOf(moveAll)} จะไม่เห็นแล้ว (ยกเว้นใบที่ตัวเองเปิดไว้)${
                  mode === "cover" ? " · ป้าย “ดูแลแทน” อยู่จนกว่าจะส่งต่อให้คนใหม่" : ""
                }`
              }
              onClose={() => setMoveAll(null)}
              onConfirm={(to, mode) => applyMoveAll(moveAll, to, mode)}
            />
          ) : null}
          {handover ? (
            (() => {
              const g = coverGroups(handover.holderId).find((x) => x.key === handover.key);
              if (!g) return null;
              const keep = ownOf(handover.holderId);
              return (
                <PickHolderModal
                  title={`ส่งต่อสาขาที่ ${nameOf(handover.holderId)} ดูแลแทน ${g.forName}`}
                  subtitle={`${g.codes.length} สาขา · ${g.codes.join(" · ")}`}
                  options={holderOptions(handover.holderId)}
                  withMode={false}
                  confirmLabel={`ส่งต่อ ${g.codes.length} สาขา`}
                  note={(t) =>
                    `${t ? `${t.split(" · ")[0]} ` : "คนใหม่"}ได้ ${g.codes.length} สาขาเป็นของตัวเองถาวร · ${nameOf(handover.holderId)} เหลือ ${keep.length} สาขาของตัวเอง${
                      keep.length ? ` (${keep.join(" ")})` : ""
                    } · คนใหม่ต้องมีบัญชีก่อน (แอดมินสร้างที่หน้าสิทธิ์ผู้ใช้ หรือนำเข้าไฟล์ Area Team)`
                  }
                  onClose={() => setHandover(null)}
                  onConfirm={(to) => applyHandover(handover.holderId, handover.key, to)}
                />
              );
            })()
          ) : null}
        </View>
      </ChipContext.Provider>
    </DnDContext.Provider>
  );
}

const TABLE_COLS = [{ width: 190 }, { width: 250 }, { width: 120 }, { width: 260 }, { width: 80 }];

const ROLE_PILL: Record<QuickRole, { color: string; backgroundColor: string }> = {
  "Supervisor (COCO)": { color: colors.roleSupervisor, backgroundColor: colors.roleSupervisorSoft },
  "Maid (COCO)": { color: colors.roleMaidInk, backgroundColor: colors.roleMaidSoft },
  Area: { color: colors.roleArea, backgroundColor: colors.roleAreaSoft },
};

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 140 },
  sheet: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: "hidden" },
  center: { padding: 40, alignItems: "center" },
  switch: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 22, backgroundColor: colors.sky50, borderBottomWidth: 1, borderBottomColor: colors.border },
  switchNarrow: { margin: 12, padding: 0, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, overflow: "hidden", backgroundColor: colors.card },
  sw: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 3, borderBottomColor: "transparent", minHeight: 44 },
  swOn: { borderBottomColor: colors.navy, backgroundColor: colors.card },
  swNarrow: { flex: 1, justifyContent: "center", paddingVertical: 11, paddingHorizontal: 8, borderBottomWidth: 0 },
  swNarrowOn: { backgroundColor: colors.navyFill },
  swIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.tile },
  swIconOn: { backgroundColor: colors.navyFill },
  swTitle: { fontSize: 15, fontWeight: "700", color: colors.textMuted },
  swSub: { fontSize: 12, color: colors.textMuted },

  // แถบเครื่องมือ (ติดบนสุด) — เต็มความกว้าง ไม่มีช่องให้ผังเลื่อนลอดด้านข้าง
  // ไม่มี marginTop — ระยะห่างอยู่ที่ใต้หัวกระดาษแทน ไม่งั้นตอนติดบนสุดมีช่องให้เห็นผังลอดอยู่เหนือแถบ
  toolbar: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadow.card,
  },
  toolbarEdit: { borderTopWidth: 3, borderTopColor: GOLD },
  toolRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  search: { flexGrow: 1, flexBasis: 300, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingLeft: 12, paddingRight: 6 },
  searchOn: { borderColor: colors.navy },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22, color: colors.text, paddingVertical: 9 },
  hitText: { fontSize: 12.5, fontWeight: "700", color: colors.navy, fontVariant: ["tabular-nums"], paddingHorizontal: 4 },
  stepBtn: { width: 32, height: 32, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  clearBtn: { borderWidth: 0, backgroundColor: colors.rowAlt },
  seg: { flexDirection: "row", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, overflow: "hidden" },
  segBtn: { paddingHorizontal: 16, minHeight: 42, justifyContent: "center", backgroundColor: colors.card },
  segOn: { backgroundColor: colors.navyFill },
  segText: { fontWeight: "600", color: colors.textMuted, fontSize: 13.5 },
  segTextOn: { color: "#fff" },
  toolBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingHorizontal: 14, backgroundColor: colors.card },
  toolText: { fontWeight: "700", color: colors.navy, fontSize: 13.5 },
  zoom: { flexDirection: "row", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, overflow: "hidden", minHeight: 44 },
  zoomBtn: { width: 42, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderRightWidth: 1, borderRightColor: colors.borderStrong },
  zoomBtnRight: { borderRightWidth: 0, borderLeftWidth: 1, borderLeftColor: colors.borderStrong },
  zoomMid: { minWidth: 76, alignItems: "center", justifyContent: "center", backgroundColor: colors.sky50, paddingHorizontal: 8 },
  zoomSmall: { fontSize: 10.5, fontWeight: "600", color: colors.textMuted, lineHeight: 13 },
  zoomLabel: { fontSize: 13, fontWeight: "700", color: colors.navy, lineHeight: 17 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingHorizontal: 14, backgroundColor: colors.card },
  editOn: { backgroundColor: GOLD, borderColor: GOLD },
  editText: { fontWeight: "700", color: colors.navy, fontSize: 13.5 },
  editRow: { gap: 8, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: 8, padding: 10 },
  editbandText: { color: colors.warningInk, fontSize: 13, lineHeight: 20 },
  areaDrops: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  areaDropsLabel: { fontSize: 13, fontWeight: "700", color: colors.warningInk },
  areaDrop: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.card },
  areaDropText: { fontSize: 12.5, fontWeight: "600", color: colors.navy },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 16, rowGap: 6, alignItems: "center", paddingVertical: 2 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { fontSize: 12, color: colors.textMuted },

  stats: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderTopColor: colors.border },
  stat: { flexGrow: 1, flexBasis: 120, flexDirection: "row", alignItems: "baseline", gap: 8, paddingHorizontal: 22, paddingVertical: 10, borderRightWidth: 1, borderRightColor: colors.border },
  statV: { fontSize: 22, fontWeight: "700", color: colors.navy, fontVariant: ["tabular-nums"] },
  statL: { fontSize: 12.5, color: colors.textMuted },
  statLink: { color: colors.dangerInk, textDecorationLine: "underline" },
  issues: { paddingHorizontal: 22, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 },
  issueLine1: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  h3: { fontSize: 12.5, letterSpacing: 0.4, color: colors.textMuted, fontWeight: "700", marginRight: 2 },
  pill: { fontSize: 12.5, fontWeight: "700", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: "hidden" },
  pillDanger: { color: colors.dangerInk, backgroundColor: colors.dangerSoft },
  pillWarn: { color: colors.warningInk, backgroundColor: colors.warningTint },
  linkText: { fontSize: 12.5, fontWeight: "700", color: colors.primaryInk, paddingVertical: 4, paddingHorizontal: 4 },
  issue: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 6 },
  issueLine: { borderTopWidth: 1, borderTopColor: colors.border, borderStyle: "dashed" },
  issueN: { fontSize: 11, fontWeight: "700", color: colors.dangerInk, backgroundColor: colors.dangerSoft, borderRadius: 4, paddingHorizontal: 6, overflow: "hidden" },
  issueText: { flex: 1, fontSize: 13.5, color: colors.text, lineHeight: 20 },

  body: { paddingTop: 16 },
  sheetGap: { marginBottom: 12 },
  narrowTools: { gap: 10, marginBottom: 14 },
  caption: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 10, marginBottom: 10 },
  captionT: { fontSize: 15, fontWeight: "700", color: colors.text },
  captionS: { fontSize: 12.5, color: colors.textMuted, flexShrink: 1 },

  // คำตอบด่วน
  quick: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, gap: 8 },
  quickTitle: { fontSize: 12.5, fontWeight: "700", color: colors.primaryInk },
  quickItem: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  quickHead: { minWidth: 170, flexShrink: 1 },
  quickT: { fontSize: 17, lineHeight: 24, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
  quickS: { fontSize: 12.5, color: colors.textMuted },
  quickLines: { flexDirection: "row", flexWrap: "wrap", gap: 8, flexGrow: 1, flexShrink: 1 },
  // flexShrink: ชื่อยาวบนมือถือต้องตัดบรรทัด ไม่ดันปุ่มโทรหลุดจอ
  quickLine: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 6, paddingLeft: 8, paddingRight: 12, flexGrow: 0, flexShrink: 1, minWidth: 200 },
  rolePill: { fontSize: 11, fontWeight: "700", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, overflow: "hidden" },
  quickName: { fontSize: 13.5, fontWeight: "600", color: colors.text },
  noPhone: { fontSize: 12, color: colors.textMuted },
  quickNone: { fontSize: 13, fontWeight: "700", color: colors.dangerInk, backgroundColor: colors.dangerSoft, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, overflow: "hidden" },
  showBtn: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.card, marginLeft: "auto" },
  showText: { fontSize: 13, fontWeight: "700", color: colors.navy },

  // การ์ด Area
  tileRow: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  tile: { minHeight: 124, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.card },
  tilePress: { padding: 12, gap: 5, minHeight: 122 },
  tileTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  tileOpen: { borderColor: colors.navy, borderWidth: 2, margin: -1, backgroundColor: colors.sky50 },
  tileMine: { borderColor: colors.roleArea, borderWidth: 2, margin: -1 },
  tileName: { fontWeight: "700", color: colors.text },
  tileMeta: { color: colors.textMuted },
  tilePhone: { flexDirection: "row", alignItems: "center", gap: 4 },
  tilePhoneText: { fontWeight: "700", color: colors.primaryInk, fontVariant: ["tabular-nums"] },
  tileCounts: { color: colors.body, fontVariant: ["tabular-nums"] },
  rowTile: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card },
  rowTileIn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingLeft: 12, paddingRight: 10 },
  rowTilePress: { flex: 1, minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  badge: { fontWeight: "700", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, overflow: "hidden" },
  badgeMaid: { color: colors.roleMaidInk, backgroundColor: colors.roleMaidSoft },
  badgeOpen: { color: colors.dangerInk, backgroundColor: colors.dangerSoft },
  badgeMine: { color: colors.roleArea, backgroundColor: colors.roleAreaSoft },
  hitBadge: { position: "absolute", top: -9, right: 10, fontSize: 11.5, fontWeight: "700", color: "#78350F", backgroundColor: "#FCD34D", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 1, overflow: "hidden" },
  hitBadgeInline: { fontSize: 11.5, fontWeight: "700", color: "#78350F", backgroundColor: "#FCD34D", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, overflow: "hidden" },
  fade: { opacity: 0.45 },

  // แผง Area ที่กางอยู่
  panel: { marginTop: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.roleAreaLine, borderTopWidth: 3, borderTopColor: colors.roleArea, borderRadius: 12, padding: 14, gap: 12 },
  notch: {
    position: "absolute",
    top: -12,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: colors.roleArea,
  },
  panelHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 12 },
  panelPerson: { gap: 8, borderRadius: 8, padding: 2 },
  closeBtn: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 40, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingHorizontal: 12, backgroundColor: colors.card },
  closeText: { fontSize: 13, fontWeight: "700", color: colors.navy },
  hiddenBtn: { alignSelf: "flex-start", borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.sky50 },
  hiddenText: { fontSize: 12.5, fontWeight: "700", color: colors.primaryInk },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, alignItems: "flex-start" },

  // ถาดท้ายผัง
  tray: { marginTop: 4, marginBottom: GAP, gap: 10 },
  trayHead: { backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  trayTitle: { fontSize: 13.5, fontWeight: "700", color: colors.warningInk },
  freeTray: { backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: 12, padding: 14, gap: 8, marginBottom: GAP },
  freeTitle: { fontSize: 14, fontWeight: "700", color: colors.warningInk },
  freeHint: { fontSize: 12.5, color: colors.warningInk },

  person: { flexDirection: "row", gap: 10, alignItems: "center", borderRadius: 6, padding: 3 },
  av: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  avArea: { backgroundColor: colors.roleArea },
  avCoco: { backgroundColor: colors.roleSupervisor },
  avMaid: { backgroundColor: colors.roleMaid },
  avLeft: { backgroundColor: colors.textFaint },
  avText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  pn: { fontSize: 13.5, fontWeight: "600", color: colors.text },
  pnLeft: { textDecorationLine: "line-through", color: colors.textMuted },
  phoneText: { fontWeight: "700", color: colors.textMuted, fontVariant: ["tabular-nums"] },
  pr: { fontSize: 11.5, color: colors.textMuted, lineHeight: 17 },
  mine: { color: colors.roleArea, fontWeight: "700" },
  none: { fontSize: 12, color: colors.textMuted },
  noneWarn: { alignSelf: "flex-start", fontSize: 12, fontWeight: "600", color: colors.warningInk, backgroundColor: colors.warningSoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, overflow: "hidden" },
  ownLabel: { fontSize: 11.5, fontWeight: "700", color: colors.textMuted, marginTop: 2 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.card, padding: 10, gap: 8 },
  leftCard: { borderStyle: "dashed", borderColor: colors.dangerLine, backgroundColor: colors.dangerSoft },
  mineCard: { borderColor: colors.roleArea, borderWidth: 2, margin: -1 },
  // ตรงคำค้น = กรอบกรมท่า · ผลที่กำลังดู = กรอบเหลือง (margin -1 กันการ์ดข้าง ๆ ขยับตอนกรอบหนาขึ้น)
  ring: { borderColor: colors.navy, borderWidth: 2, margin: -1 },
  cur: { borderColor: colors.warning, borderWidth: 2, margin: -1, backgroundColor: colors.warningTint },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.rowAlt, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  chipCover: { borderStyle: "dashed", borderColor: GOLD, backgroundColor: colors.warningSoft },
  // สาขาที่มี Maid ประจำ — ขอบซ้ายชมพู (ตรงกับกล่อง Maid ใต้การ์ด)
  chipMaid: { borderLeftWidth: 3, borderLeftColor: colors.roleMaid },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] },
  chipOpen: { fontSize: 10.5, fontWeight: "700", color: "#fff", backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 5, overflow: "hidden" },
  moreChip: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.sky50, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 2, justifyContent: "center" },
  moreText: { fontWeight: "700", color: colors.primaryInk },
  coverBox: { gap: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
  coverLabel: { fontSize: 11.5, fontWeight: "700", color: colors.warningInk },
  handBtn: { alignSelf: "flex-start", borderWidth: 1.5, borderColor: GOLD, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.card },
  handText: { fontSize: 12.5, fontWeight: "700", color: colors.warningInk },
  allBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.card },
  allText: { fontSize: 12.5, fontWeight: "700", color: colors.navy },

  // Maid (COCO)
  maidBox: { backgroundColor: colors.roleMaidSoft, borderWidth: 1, borderColor: colors.roleMaidLine, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, gap: 7 },
  maidLocked: { opacity: 0.72 },
  maidHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  maidTitle: { fontWeight: "700", color: colors.roleMaidInk },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  lockText: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  maidRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 6, borderWidth: 0, padding: 1 },
  mineRow: { borderWidth: 2, borderColor: colors.roleArea, margin: -1 },
  maidName: { fontWeight: "600", color: colors.text },
  maidCodes: { fontWeight: "500", color: colors.textMuted, fontVariant: ["tabular-nums"] },

  selected: { backgroundColor: colors.warningTint, borderWidth: 2, borderColor: GOLD, borderRadius: 6 },
  dim: { opacity: 0.25 },
  dropArmed: { borderStyle: "dashed", borderColor: colors.primary },
  dropOver: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderStyle: "solid" },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden", minWidth: 900, backgroundColor: colors.card },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  trMaid: { backgroundColor: colors.roleMaidSoft },
  thRow: { backgroundColor: colors.sky50, borderBottomWidth: 2, borderBottomColor: colors.borderStrong },
  th: { fontSize: 12, fontWeight: "700", color: colors.textMuted, padding: 10 },
  td: { fontSize: 13.5, color: colors.text, padding: 10, lineHeight: 20 },
  tdMaid: { color: colors.roleMaidInk, fontWeight: "600", paddingLeft: 22 },
  num: { textAlign: "right", fontVariant: ["tabular-nums"] },
  foot: { paddingVertical: 12 },
  fab: {
    position: "absolute",
    right: 24,
    bottom: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    backgroundColor: colors.navyFill,
    borderRadius: 999,
    paddingHorizontal: 16,
    ...shadow.card,
  },
  fabText: { color: "#fff", fontWeight: "700", fontSize: 13.5 },
  bottomStack: { position: "absolute", left: 16, right: 16, bottom: 16, gap: 8 },
  dock: { flexDirection: "row", flexWrap: "wrap", backgroundColor: colors.card, borderWidth: 2, borderColor: GOLD, borderRadius: radius.md, overflow: "hidden", ...shadow.card },
  dockCell: { flexGrow: 1, flexBasis: 260 },
  dockZone: { flexGrow: 1, padding: 10, gap: 6, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: "transparent" },
  dockTitle: { fontSize: 13, fontWeight: "700", color: colors.warningInk },
  dockHint: { fontSize: 12, color: colors.textMuted },
  movingRow: { alignItems: "center" },
  movingPill: { flexDirection: "row", alignItems: "center", gap: 10, maxWidth: "92%", backgroundColor: colors.navyFill, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, ...shadow.card },
  movingText: { color: "#fff", fontSize: 13, fontWeight: "600", flexShrink: 1 },
  pending: { backgroundColor: colors.navyFill, borderRadius: radius.md, padding: 14, flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center", ...shadow.card },
  pendingTitle: { color: "#fff", fontWeight: "700", fontSize: 14, marginBottom: 4 },
  pendingItem: { color: "#fff", opacity: 0.92, fontSize: 12.5, lineHeight: 19 },
  pendingNote: { color: "#FCD34D", fontSize: 12, lineHeight: 18, marginTop: 4 },
  pbtn: { borderWidth: 1, borderColor: "rgba(255,255,255,0.5)", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, minWidth: 90, alignItems: "center" },
  pbtnSave: { backgroundColor: "#fff", borderColor: "#fff" },
  pbtnText: { color: "#fff", fontWeight: "700", fontSize: 13.5 },
  mfoot: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  mbtn: { borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  mbtnText: { color: "#fff", fontWeight: "700" },
  mghost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  mghostText: { color: colors.navy, fontWeight: "700" },
  mlabel: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  opt: { flexDirection: "row", gap: 10, alignItems: "flex-start", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12 },
  optOn: { borderWidth: 1.5, borderColor: colors.navy, backgroundColor: colors.sky50 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.textFaint, marginTop: 2 },
  radioOn: { borderWidth: 5, borderColor: colors.navy },
  optT: { fontSize: 14, fontWeight: "700", color: colors.text },
  optS: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18 },
  mwarn: { backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: 8, padding: 10 },
  mwarnText: { fontSize: 12.5, lineHeight: 19, color: colors.warningInk },
});
