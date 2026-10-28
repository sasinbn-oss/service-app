/**
 * ผังผู้ดูแลฝั่ง Area — Area → Supervisor (COCO) → สาขา COCO (เจ้าของงานขอ ต.ค. 69 · ตามตัวอย่างที่ตกลง)
 *
 * ทุกคนเปิดดูได้ (ช่าง/หัวหน้าภาครู้ว่าสาขา COCO ไหนต้องโทรหาใคร) · แก้ได้เฉพาะแอดมินและ Area — เซิร์ฟเวอร์เช็คซ้ำ
 * ลาก/แตะแบบเดียวกับผังฝ่ายบริการ:
 * - ชื่อ Supervisor → Area อื่น หรือแถบ "ยังไม่มี Area"
 * - รหัสสาขา → Supervisor คนอื่น (หรือ Area ที่ดูแลสาขาเอง) หรือแถบ "สาขาไม่มีผู้ดูแล"
 * - "ย้ายสาขาทั้งหมด" (คนลาออก) แบบดูแลแทนชั่วคราว = จำว่าเป็นของใคร มีคนใหม่แล้ว "ส่งต่อ" ได้ทีเดียว
 *   โดยสาขาเดิมของคนดูแลแทนไม่ติดไปด้วย — ถ้าย้ายแบบทั้งหมดธรรมดา ตอนส่งต่อจะแยกไม่ออกว่าสาขาไหนของใคร
 * ทุกอย่างค้างไว้จนกด "บันทึก" แล้วส่งทีเดียว (POST /teams/area-map) — ลากพลาดครั้งเดียวไม่ควรทำให้ใครมองไม่เห็นงาน
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
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
import { colors, headingFont, radius, shadow, spacing } from "../theme";

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
}
interface AreaData {
  asOf: string;
  canEdit: boolean;
  people: AreaPerson[];
  branches: AreaBranch[];
}
type BranchState = { holderId: number | null; coverForId: number | null; coverForName: string | null; coverSince: string | null };
type Grab = { kind: "SUP"; id: number } | { kind: "BRANCH"; code: string };
type Zone = { kind: "area"; id: number } | { kind: "holder"; id: number } | { kind: "supTray" } | { kind: "branchTray" };

const COL_W = 260;
const COL_GAP = 16;
const GOLD = "#B7892F";
const ini = (s: string) => s.replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/, "").trim().charAt(0) || "?";
const fmt = (n: number) => n.toLocaleString("th-TH");
const thDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit" }) : "";
const sameGrab = (a: Grab | null, b: Grab) =>
  !!a && a.kind === b.kind && (a.kind === "SUP" ? a.id === (b as { id: number }).id : a.code === (b as { code: string }).code);
const zoneKey = (z: Zone) => `${z.kind}:${"id" in z ? z.id : ""}`;

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
const domOf = (r: React.RefObject<View | null>) => (Platform.OS === "web" ? (r.current as unknown as HTMLElement | null) : null);

/** ของที่หยิบได้ — ชื่อ Supervisor หรือรหัสสาขา · โหมดดูอย่างเดียวกดแล้วทำ onView แทน */
function Draggable({ grab, label, style, onView, children }: { grab: Grab; label: string; style?: object; onView?: () => void; children: React.ReactNode }) {
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
      <View ref={ref} style={[style, selected && styles.selected]}>
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
  children,
}: {
  zone: Zone;
  style?: object | object[];
  /** ขนาด/การยืดในแถว — ใส่ที่ตัวกดด้านนอก (ใส่ข้างในแล้ว flexBasis กลายเป็นความสูงของกล่อง) */
  outer?: object;
  label: string;
  children: React.ReactNode;
}) {
  const d = useDnD();
  const ref = useRef<View>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = domOf(ref);
    if (!el || !d.editing) return;
    const enter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
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
        if (g && (g.kind === "SUP" || g.kind === "BRANCH")) d.drop(g, zone);
      } catch {
        // ลากของอื่นมาวาง (ข้อความ ไฟล์) — ไม่ใช่คนหรือสาขา ไม่ต้องทำอะไร
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
        <View ref={ref} style={[style, armed && styles.dropArmed, over && styles.dropOver]}>
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
    ["area", "storefront-outline", "ผังฝั่ง Area", "Area · Supervisor (COCO) · สาขา COCO"],
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

function PersonRow({ p, meta, small }: { p: AreaPerson; meta: string; small?: boolean }) {
  const { width } = useWindowDimensions();
  const narrow = width < 700;
  return (
    <View style={styles.person}>
      <View style={[styles.av, p.role === "AREA" ? styles.avArea : styles.avCoco, small && styles.avSmall, p.left && styles.avLeft]}>
        <Text style={[styles.avText, small && { fontSize: 11 }]}>{ini(p.name)}</Text>
      </View>
      <View style={{ flexShrink: 1, flexGrow: 1 }}>
        {/* ชื่อตัดบรรทัดได้ ไม่ตัดเป็น … — ชื่อเล่นอยู่ท้ายชื่อ ตัดแล้วหายทั้งที่เป็นชื่อที่คนเรียกกันจริง */}
        <Text style={[styles.pn, p.left && styles.pnLeft]}>{p.name}</Text>
        <Text style={styles.pr}>{meta}</Text>
        {p.phone && !p.left ? <PhoneLine phone={p.phone} name={p.name} /> : null}
      </View>
      {narrow && p.phone && !p.left ? <CallButton phone={p.phone} name={p.name} /> : null}
    </View>
  );
}

function Chips({ codes, byCode, cover }: { codes: string[]; byCode: Map<string, AreaBranch>; cover?: boolean }) {
  return (
    <View style={styles.chips}>
      {codes.map((c) => {
        const b = byCode.get(c)!;
        return (
          <Draggable
            key={c}
            grab={{ kind: "BRANCH", code: c }}
            label={`สาขา ${c}`}
            style={[styles.chip, cover && styles.chipCover]}
            onView={() => feedback.toast("info", `${c} ${b.name}${b.open ? ` · ใบงานค้าง ${b.open} ใบ` : ""}`)}
          >
            <Text style={[styles.chipText, cover && { color: colors.warningInk }]}>{c}</Text>
            {b.open ? <Text style={styles.chipOpen}>{b.open}</Text> : null}
          </Draggable>
        );
      })}
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
  const scrollRef = useRef<ScrollView>(null);
  const dockRef = useRef<View>(null);

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

  // ลากใกล้ขอบบน/ล่างแล้วหน้าเลื่อนเอง — แบบเดียวกับผังฝ่ายบริการ (เบราว์เซอร์ไม่เลื่อนกล่องเลื่อนให้ระหว่างลาก)
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
    if (Platform.OS !== "web" || !grab) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setGrab(null);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [grab]);

  const person = useMemo(() => new Map((data?.people ?? []).map((p) => [p.id, p])), [data]);
  const byCode = useMemo(() => new Map((data?.branches ?? []).map((b) => [b.code, b])), [data]);
  const nameOf = (id: number | null) => (id ? person.get(id)?.name ?? "?" : "ไม่มีผู้ดูแล");
  const areaName = (id: number | null) => (id ? `Area ${person.get(id)?.name ?? "?"}` : "ยังไม่มี Area");

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
            if (!to) return feedback.toast("info", `${h.name} ยังไม่อยู่ใต้ Area — วางที่หัว Area`);
          }
        } else return feedback.toast("info", "Supervisor วางที่ Area หรือแถบ “ยังไม่มี Area”");
        const cur = supArea.get(g.id) ?? null;
        if (cur === to) return;
        setSupArea((m) => new Map(m).set(g.id, to));
        setLog((l) => [...l, `${s.name} (Supervisor): ${areaName(cur)} → ${areaName(to)}`]);
        return;
      }
      const cur = branchState.get(g.code)!;
      let to: number | null;
      if (z.kind === "holder" || z.kind === "area") to = z.id;
      else if (z.kind === "branchTray") to = null;
      else return feedback.toast("info", "สาขาวางที่ Supervisor หรือแถบ “สาขาไม่มีผู้ดูแล”");
      if (to && person.get(to)?.left) return feedback.toast("info", "บัญชีนี้ถูกลบแล้ว — ให้คนอื่นดูแล");
      if (cur.holderId === to) return;
      // ย้ายทีละสาขา = ย้ายถาวร ป้ายดูแลแทนหลุด (ดูแลแทนใช้กับย้ายทั้งหมด/ส่งต่อเท่านั้น)
      setBranchState((m) => new Map(m).set(g.code, { holderId: to, coverForId: null, coverForName: null, coverSince: null }));
      setLog((l) => [...l, `สาขา ${g.code}: ${nameOf(cur.holderId)} → ${nameOf(to)}`]);
    },
    [data, person, supArea, branchState]
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
    setLog((l) => [...l, `${from.name}: ย้าย ${codes.length} สาขาให้ ${nameOf(toId)} ${mode === "cover" ? "ดูแลแทนชั่วคราว" : "ถาวร"}`]);
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
    setLog((l) => [...l, `${nameOf(holderId)}: ส่งต่อ ${codes.length} สาขาที่ดูแลแทน ${g?.forName ?? ""} ให้ ${nameOf(toId)}`]);
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
  const areas = data.people.filter((p) => p.role === "AREA" && !p.left);
  const sups = data.people.filter((p) => p.role === "COCO_SUPERVISOR" && !p.left);
  const supsOf = (areaId: number | null) => sups.filter((s) => (supArea.get(s.id) ?? null) === areaId);
  const branchesOf = (id: number | null) => [...branchState].filter(([, b]) => b.holderId === id).map(([c]) => c);
  const ownOf = (id: number) => [...branchState].filter(([, b]) => b.holderId === id && !b.coverForName).map(([c]) => c);
  const openOf = (codes: string[]) => codes.reduce((n, c) => n + (byCode.get(c)?.open ?? 0), 0);
  const leftHolders = data.people.filter((p) => p.left && branchesOf(p.id).length);
  const freeSups = supsOf(null);
  const freeBranches = branchesOf(null);
  const allCovers = [...areas, ...sups].flatMap((p) => coverGroups(p.id).map((g) => ({ p, g })));

  const q = query.trim();
  const qd = /^[\d\s-]+$/.test(q) ? q.replace(/\D/g, "") : "";
  const textOf = (p: AreaPerson) => `${p.name} ${p.code} ${p.phone ?? ""} ${phoneDigits(p.phone)} ${branchesOf(p.id).map((c) => `${c} ${byCode.get(c)?.name ?? ""}`).join(" ")}`;
  const hit = (text: string) => !q || text.includes(q) || (!!qd && text.includes(qd));
  const supCard = (s: AreaPerson) => {
    const own = ownOf(s.id);
    const covers = coverGroups(s.id);
    const all = branchesOf(s.id);
    return (
      <Drop key={s.id} zone={{ kind: "holder", id: s.id }} style={[styles.card, !hit(textOf(s)) && styles.dim]} label={`Supervisor ${s.name}`}>
        <Draggable grab={{ kind: "SUP", id: s.id }} label={`Supervisor (COCO) ${s.name}`}>
          <PersonRow p={s} meta={`Supervisor (COCO) · ${all.length} สาขา · ค้าง ${openOf(all)}`} />
        </Draggable>
        {own.length ? <Chips codes={own} byCode={byCode} /> : !covers.length ? <Text style={styles.none}>ยังไม่มีสาขา</Text> : null}
        {covers.map((g) => (
          <View key={g.key} style={styles.coverBox}>
            <Text style={styles.coverLabel}>
              ดูแลแทน {g.forName}
              {g.since ? ` · ตั้งแต่ ${thDate(g.since)}` : ""} ({g.codes.length})
            </Text>
            <Chips codes={g.codes} byCode={byCode} cover />
            {editing ? (
              <TouchableOpacity style={styles.handBtn} onPress={() => setHandover({ holderId: s.id, key: g.key })} accessibilityLabel={`ส่งต่อสาขาที่ดูแลแทน ${g.forName}`}>
                <Text style={styles.handText}>ส่งต่อให้คนใหม่…</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        {editing && all.length ? (
          <TouchableOpacity style={styles.allBtn} onPress={() => setMoveAll(s.id)} accessibilityLabel={`ย้ายสาขาทั้งหมดของ ${s.name}`}>
            <Ionicons name="swap-horizontal" size={14} color={colors.navy} />
            <Text style={styles.allText}>ย้ายสาขาทั้งหมด…</Text>
          </TouchableOpacity>
        ) : null}
      </Drop>
    );
  };

  const issues: [string, string][] = [];
  if (freeBranches.length) issues.push([`สาขา COCO ${fmt(freeBranches.length)} แห่ง`, `ยังไม่มี Supervisor ดูแล — ${freeBranches.slice(0, 8).join(" ")}${freeBranches.length > 8 ? " …" : ""}`]);
  if (freeSups.length) issues.push([`Supervisor (COCO) ${freeSups.length} คน`, `ยังไม่อยู่ใต้ Area ใด — ${freeSups.map((s) => s.name).join(", ")}`]);
  for (const p of leftHolders) issues.push([p.name, `บัญชีถูกลบแล้ว แต่ยังถือ ${branchesOf(p.id).length} สาขา — ย้ายให้คนอื่นดูแล`]);
  for (const { p, g } of allCovers) {
    issues.push([`สาขา ${g.codes.length} แห่งมีคนดูแลแทนอยู่`, `${p.name} ดูแลแทน ${g.forName}${g.since ? ` ตั้งแต่ ${thDate(g.since)}` : ""} — มีคนใหม่แล้วกด “ส่งต่อให้คนใหม่”`]);
  }

  const column = (a: AreaPerson) => {
    const ss = supsOf(a.id);
    const own = ownOf(a.id);
    const covers = coverGroups(a.id);
    const codes = [...branchesOf(a.id), ...ss.flatMap((s) => branchesOf(s.id))];
    const text = `${textOf(a)} ${ss.map(textOf).join(" ")}`;
    return (
      <View key={a.id} style={[narrow ? styles.colNarrow : styles.col, !hit(text) && styles.dim]}>
        {!narrow ? <View style={styles.stub} /> : null}
        <Drop zone={{ kind: "area", id: a.id }} style={styles.aband} label={`หัว Area ${a.name}`}>
          <Text style={styles.alabel}>AREA</Text>
          <Text style={styles.ameta}>
            {ss.length} Supervisor · {fmt(codes.length)} สาขา · ค้าง {openOf(codes)}
          </Text>
        </Drop>
        <Drop zone={{ kind: "holder", id: a.id }} style={styles.abox} label={`Area ${a.name}`}>
          <PersonRow p={a} meta="Area · เห็นสาขา COCO ทั้งหมด" />
          {own.length ? (
            <>
              <Text style={styles.ownLabel}>ดูแลสาขาเอง ({own.length})</Text>
              <Chips codes={own} byCode={byCode} />
            </>
          ) : null}
          {covers.map((g) => (
            <View key={g.key} style={styles.coverBox}>
              <Text style={styles.coverLabel}>
                ดูแลแทน {g.forName}
                {g.since ? ` · ตั้งแต่ ${thDate(g.since)}` : ""} ({g.codes.length})
              </Text>
              <Chips codes={g.codes} byCode={byCode} cover />
              {editing ? (
                <TouchableOpacity style={styles.handBtn} onPress={() => setHandover({ holderId: a.id, key: g.key })} accessibilityLabel={`ส่งต่อสาขาที่ดูแลแทน ${g.forName}`}>
                  <Text style={styles.handText}>ส่งต่อให้คนใหม่…</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </Drop>
        <View style={styles.sups}>
          {!narrow ? <View style={styles.rail} /> : null}
          {ss.length ? ss.map(supCard) : <Text style={[styles.none, { padding: 8 }]}>ยังไม่มี Supervisor (COCO)</Text>}
        </View>
      </View>
    );
  };

  const chartCols = [
    ...areas.map(column),
    // คนที่ยังไม่มี Area / ลาออกแต่ยังถือสาขา ต้องยังหาเจอในผัง — คนเปิดผังมาหาเบอร์ของ Supervisor คนนั้น
    freeSups.length || leftHolders.length ? (
      <View key="free" style={[narrow ? styles.colNarrow : styles.col]}>
        {!narrow ? <View style={styles.stub} /> : null}
        <Drop zone={{ kind: "supTray" }} style={[styles.aband, styles.freeBand]} label="ยังไม่มี Area">
          <Text style={[styles.alabel, { color: colors.warningInk }]}>ยังไม่มี Area</Text>
          <Text style={styles.ameta}>{freeSups.length} Supervisor</Text>
        </Drop>
        <View style={[styles.sups, { paddingLeft: narrow ? 0 : 12 }]}>
          {freeSups.map(supCard)}
          {leftHolders.map((p) => (
            <View key={p.id} style={[styles.card, styles.leftCard]}>
              <PersonRow p={p} meta={`ลบบัญชีแล้ว · ยังถือ ${branchesOf(p.id).length} สาขา`} />
              <Chips codes={branchesOf(p.id)} byCode={byCode} />
              {editing ? (
                <TouchableOpacity style={styles.allBtn} onPress={() => setMoveAll(p.id)} accessibilityLabel={`ย้ายสาขาทั้งหมดของ ${p.name}`}>
                  <Ionicons name="swap-horizontal" size={14} color={colors.navy} />
                  <Text style={styles.allText}>ย้ายสาขาทั้งหมด…</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      </View>
    ) : null,
  ];

  const chart = narrow ? (
    <View style={styles.stack}>{chartCols}</View>
  ) : (
    <ScrollView horizontal contentContainerStyle={styles.chartScroll}>
      <View style={{ alignItems: "center" }}>
        <View style={styles.root}>
          <Text style={styles.rootT}>สาขา COCO · Area Team</Text>
          <Text style={styles.rootS}>{fmt(data.branches.length)} สาขา</Text>
        </View>
        <View style={styles.stem} />
        {chartCols.filter(Boolean).length > 1 ? (
          <View style={[styles.hline, { width: (chartCols.filter(Boolean).length - 1) * (COL_W + COL_GAP) }]} />
        ) : null}
        <View style={{ flexDirection: "row", gap: COL_GAP, alignItems: "flex-start" }}>{chartCols}</View>
      </View>
    </ScrollView>
  );

  // ตาราง: แถวละผู้ดูแล — สแกนหาเบอร์/สาขาเร็วกว่าผังเมื่อคนเยอะ
  const rows = [...areas.flatMap((a) => [a, ...supsOf(a.id)]), ...freeSups, ...leftHolders];
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
        {rows.map((p) => {
          const codes = branchesOf(p.id);
          const area = p.role === "AREA" ? p : supArea.get(p.id) ? person.get(supArea.get(p.id)!) : null;
          return (
            <View key={p.id} style={[styles.tr, !hit(textOf(p)) && styles.dim]}>
              <Text style={[styles.td, TABLE_COLS[0]]}>{area ? area.name : "ยังไม่มี Area"}</Text>
              <Text style={[styles.td, TABLE_COLS[1], { fontWeight: "700" }]}>
                {p.name}
                {p.role === "AREA" ? " (Area)" : ""}
                {p.left ? " · ลบบัญชีแล้ว" : ""}
              </Text>
              <Text style={[styles.td, TABLE_COLS[2]]}>{p.left ? "" : p.phone ?? ""}</Text>
              <Text style={[styles.td, TABLE_COLS[3]]}>{codes.join(" ") || "—"}</Text>
              <Text style={[styles.td, TABLE_COLS[4], styles.num]}>{openOf(codes)}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );

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

  return (
    <DnDContext.Provider value={dnd}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView ref={scrollRef} contentContainerStyle={[styles.page, editing && { paddingBottom: 300 }]}>
          <View style={[styles.sheet, editing && { borderColor: GOLD }]}>
            {head}
            <View style={styles.tools}>
              <View style={styles.search}>
                <Ionicons name="search-outline" size={17} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="ค้นหาชื่อ เบอร์โทร รหัสสาขา หรือ Area"
                  placeholderTextColor={colors.textFaint}
                  accessibilityLabel="ค้นหาในผังฝั่ง Area"
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
                  accessibilityLabel={editing ? "เสร็จสิ้นการแก้ไข" : "แก้ไขผังฝั่ง Area"}
                >
                  <Ionicons name={editing ? "checkmark" : "create-outline"} size={16} color={editing ? "#1B1405" : colors.navy} />
                  <Text style={[styles.editText, editing && { color: "#1B1405" }]}>{editing ? "เสร็จสิ้นการแก้ไข" : "แก้ไขผัง"}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {editing ? (
              <View style={styles.editband}>
                <Text style={styles.editbandText}>
                  โหมดแก้ไข — {Platform.OS === "web" ? "ลากชื่อหรือรหัสสาขา หรือคลิกแล้วคลิก" : "แตะชื่อหรือรหัสสาขา แล้วแตะ"}ปลายทาง · ชื่อ Supervisor → Area ·
                  รหัสสาขา → Supervisor · คนลาออก กด “ย้ายสาขาทั้งหมด” · การเปลี่ยนแปลงยังไม่ถูกบันทึกจนกว่าจะกด “บันทึก”
                </Text>
              </View>
            ) : null}

            <View style={styles.stats}>
              {(
                [
                  [areas.length, "Area"],
                  [sups.length, "Supervisor (COCO)"],
                  [fmt(data.branches.length), "สาขา COCO"],
                  [fmt(freeBranches.length), "สาขาไม่มีผู้ดูแล"],
                ] as const
              ).map(([v, l], i) => (
                <View key={l} style={styles.stat}>
                  <Text style={[styles.statV, i === 3 && freeBranches.length > 0 && { color: colors.dangerInk }]}>{v}</Text>
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
                <Text style={styles.pr}>ไม่มี — ทุกสาขามีผู้ดูแล ทุกคนอยู่ใต้ Area</Text>
              )}
            </View>

            {view === "chart" ? chart : <View style={{ padding: 18 }}>{table}</View>}

            <View style={styles.foot}>
              <Text style={styles.pr}>
                แอดมินและ Area แก้ผังนี้ได้ · ข้อมูลตั้งต้นมาจากไฟล์ Area Team — นำเข้าไฟล์รอบใหม่ ค่าในไฟล์จะทับที่ย้ายในผัง
              </Text>
            </View>
          </View>
        </ScrollView>

        {grab && !dragging ? (
          <View style={styles.moving} pointerEvents="box-none">
            <View style={styles.movingPill}>
              <Text style={styles.movingText} numberOfLines={2}>
                กำลังย้าย {grabName(grab)} — {Platform.OS === "web" ? "คลิก" : "แตะ"}
                {grab.kind === "SUP" ? "หัว Area ที่ต้องการ" : "Supervisor ที่จะรับสาขา"}
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
            // ที่วาง "เอาออก" ลอยติดล่างจอ — ผังกว้างหลาย Area ลากไปคอลัมน์ท้ายสุดไม่ถึง
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
    </DnDContext.Provider>
  );
}

const TABLE_COLS = [{ width: 190 }, { width: 230 }, { width: 120 }, { width: 260 }, { width: 80 }];

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
  tools: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center", paddingHorizontal: 22, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  search: { flexGrow: 1, flexBasis: 240, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22, color: colors.text, paddingVertical: 9 },
  seg: { flexDirection: "row", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, overflow: "hidden" },
  segBtn: { paddingHorizontal: 16, paddingVertical: 9, backgroundColor: colors.card },
  segOn: { backgroundColor: colors.navyFill },
  segText: { fontWeight: "600", color: colors.textMuted, fontSize: 13.5 },
  segTextOn: { color: "#fff" },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.card },
  editOn: { backgroundColor: GOLD, borderColor: GOLD },
  editText: { fontWeight: "700", color: colors.navy, fontSize: 13.5 },
  editband: { backgroundColor: colors.warningSoft, paddingHorizontal: 22, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  editbandText: { color: colors.warningInk, fontSize: 13, lineHeight: 20 },
  stats: { flexDirection: "row", flexWrap: "wrap", borderBottomWidth: 1, borderBottomColor: colors.border },
  stat: { flexGrow: 1, flexBasis: 130, paddingHorizontal: 22, paddingVertical: 12, borderRightWidth: 1, borderRightColor: colors.border },
  statV: { fontSize: 24, fontWeight: "700", color: colors.navy, fontVariant: ["tabular-nums"] },
  statL: { fontSize: 12, color: colors.textMuted },
  issues: { paddingHorizontal: 22, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  h3: { fontSize: 12.5, letterSpacing: 0.6, color: colors.textMuted, fontWeight: "700", marginBottom: 8 },
  issue: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 6 },
  issueLine: { borderTopWidth: 1, borderTopColor: colors.border, borderStyle: "dashed" },
  issueN: { fontSize: 11, fontWeight: "700", color: colors.dangerInk, backgroundColor: colors.dangerSoft, borderRadius: 4, paddingHorizontal: 6, overflow: "hidden" },
  issueText: { flex: 1, fontSize: 13.5, color: colors.text, lineHeight: 20 },
  chartScroll: { paddingHorizontal: 22, paddingTop: 26, paddingBottom: 26, minWidth: "100%", justifyContent: "center" },
  stack: { padding: 12, gap: 16 },
  root: { backgroundColor: colors.navyFill, borderRadius: 8, paddingHorizontal: 22, paddingVertical: 10, alignItems: "center", minWidth: 240 },
  rootT: { color: "#fff", fontWeight: "700", fontSize: 15 },
  rootS: { color: "#fff", opacity: 0.85, fontSize: 12 },
  stem: { width: 2, height: 20, backgroundColor: colors.borderStrong },
  hline: { height: 2, backgroundColor: colors.borderStrong },
  col: { width: COL_W },
  colNarrow: { width: "100%" },
  stub: { width: 2, height: 20, backgroundColor: colors.borderStrong, alignSelf: "center" },
  aband: {
    backgroundColor: colors.roleAreaSoft,
    borderWidth: 1,
    borderColor: colors.roleAreaLine,
    borderBottomWidth: 2,
    borderBottomColor: colors.roleArea,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  freeBand: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder, borderBottomColor: GOLD },
  alabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: colors.roleArea },
  ameta: { fontSize: 11.5, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  abox: { borderWidth: 1, borderTopWidth: 0, borderColor: colors.border, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: colors.card, padding: 10, gap: 6 },
  ownLabel: { fontSize: 11.5, fontWeight: "700", color: colors.textMuted, marginTop: 4 },
  sups: { paddingTop: 12, paddingLeft: 18, gap: 10 },
  rail: { position: "absolute", left: 8, top: 0, bottom: 20, width: 2, backgroundColor: colors.borderStrong },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.card, padding: 10, gap: 8 },
  leftCard: { borderStyle: "dashed", borderColor: colors.dangerLine, backgroundColor: colors.dangerSoft },
  person: { flexDirection: "row", gap: 10, alignItems: "center", borderRadius: 6, padding: 3 },
  av: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  avSmall: { width: 26, height: 26, borderRadius: 13 },
  avArea: { backgroundColor: colors.roleArea },
  avCoco: { backgroundColor: colors.roleSupervisor },
  avLeft: { backgroundColor: colors.textFaint },
  avText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  pn: { fontSize: 13.5, fontWeight: "600", color: colors.text },
  pnLeft: { textDecorationLine: "line-through", color: colors.textMuted },
  pr: { fontSize: 11.5, color: colors.textMuted, lineHeight: 17 },
  none: { fontSize: 12, color: colors.textFaint },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.rowAlt, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  chipCover: { borderStyle: "dashed", borderColor: GOLD, backgroundColor: colors.warningSoft },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] },
  chipOpen: { fontSize: 10.5, fontWeight: "700", color: "#fff", backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 5, overflow: "hidden" },
  coverBox: { gap: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
  coverLabel: { fontSize: 11.5, fontWeight: "700", color: colors.warningInk },
  handBtn: { alignSelf: "flex-start", borderWidth: 1.5, borderColor: GOLD, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.card },
  handText: { fontSize: 12.5, fontWeight: "700", color: colors.warningInk },
  allBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.card },
  allText: { fontSize: 12.5, fontWeight: "700", color: colors.navy },
  selected: { backgroundColor: colors.warningTint, borderWidth: 2, borderColor: GOLD, borderRadius: 6 },
  dim: { opacity: 0.25 },
  dropArmed: { borderStyle: "dashed", borderColor: colors.primary },
  dropOver: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderStyle: "solid" },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden", minWidth: 880 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  thRow: { backgroundColor: colors.sky50, borderBottomWidth: 2, borderBottomColor: colors.borderStrong },
  th: { fontSize: 12, fontWeight: "700", color: colors.textMuted, padding: 10 },
  td: { fontSize: 13.5, color: colors.text, padding: 10, lineHeight: 20 },
  num: { textAlign: "right", fontVariant: ["tabular-nums"] },
  foot: { paddingHorizontal: 22, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  bottomStack: { position: "absolute", left: 16, right: 16, bottom: 16, gap: 8 },
  dock: { flexDirection: "row", flexWrap: "wrap", backgroundColor: colors.card, borderWidth: 2, borderColor: GOLD, borderRadius: radius.md, overflow: "hidden", ...shadow.card },
  dockCell: { flexGrow: 1, flexBasis: 260 },
  dockZone: { flexGrow: 1, padding: 10, gap: 6, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: "transparent" },
  dockTitle: { fontSize: 13, fontWeight: "700", color: colors.warningInk },
  dockHint: { fontSize: 12, color: colors.textMuted },
  moving: { position: "absolute", top: 10, left: 0, right: 0, alignItems: "center", zIndex: 20 },
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
