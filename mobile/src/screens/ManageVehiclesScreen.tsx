/**
 * ทะเบียน & ซ่อมบำรุง (แอดมิน) — ยกมาจาก OTTERI FLEET
 *
 * หน้าเดียวที่บอกว่าคันไหนต้องเข้าศูนย์: เกินรอบน้ำมันเครื่อง · ภาษี/พ.ร.บ./ประกันใกล้หมด ·
 * ช่างแจ้งซ่อมตอนคืนรถ — แทนการจดในสมุดแล้วลืมเปิด
 *
 * กดที่รถเพื่อเปิดรายละเอียด 3 แท็บ: ข้อมูล · เอกสาร (รูปเล่ม/กรมธรรม์) · ซ่อมบำรุง
 */
import React, { useCallback, useEffect, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import TouchableOpacity from "../components/Tap";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import AppModal from "../components/AppModal";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import Dropdown from "../components/Dropdown";
import DateField, { thaiDate } from "../components/DateField";
import { fs, Notice, Tag } from "../components/FleetUI";
import { useCachedState } from "../utils/pageCache";
import { showAlert } from "../utils/alert";
import { pickImageAttachment, PickedAttachment } from "../utils/attachments";
import { fmtNum, openSigned, postImageForm } from "../utils/vehicles";
import { colors, headingFont, radius, shadow } from "../theme";
import { useDocked } from "../components/SideMenu";
import VehicleImportModal from "../components/VehicleImportModal";
import { canPickFile } from "../utils/filePicker";

type Level = "none" | "ok" | "soon" | "over";
interface Expiry {
  date: string | null;
  level: Level;
  daysLeft: number | null;
}
interface FleetVehicle {
  id: number;
  plateNumber: string;
  brand: string | null;
  model: string | null;
  type: string | null;
  note: string | null;
  status: string;
  statusLabel: string;
  currentMileage: number;
  activeBy: string | null;
  owner: string | null;
  /** ภาคที่ใช้จัดกลุ่ม — กำหนดเอง (manual) หรือหาจากทีมของผู้รับผิดชอบ (team) · null = หาไม่ได้ */
  region: string | null;
  regionSource: "manual" | "team" | null;
  /** ภาคที่แอดมินกำหนดเอง (ช่องในฟอร์ม) */
  regionManual: string | null;
  /** ทีมที่อ่านได้จากช่องผู้รับผิดชอบ และภาคของทีมนั้น */
  team: string | null;
  teamRegion: string | null;
  insCompany: string | null;
  insPolicy: string | null;
  oilEveryKm: number | null;
  oilEveryMonths: number | null;
  lastOilKm: number | null;
  lastOilDate: string | null;
  maintNote: string | null;
  tax: Expiry;
  act: Expiry;
  ins: Expiry;
  oil: { level: Level; every?: number; months?: number; remainKm?: number; dueKm?: number; dueDate?: string | null; daysLeft?: number | null; pct?: number };
  docs: Record<string, boolean>;
  /** บัตรเติมน้ำมัน/Easy Pass — เซิร์ฟเวอร์ส่งมาเฉพาะแอดมิน (Admin Spare Part ได้ null) */
  card: { fleetCardNo: string | null; fleetCardLimit: number | null; easyPassNo: string | null } | null;
}
interface Fleet {
  vehicles: FleetVehicle[];
  costYear: number;
  regions: string[];
  logCountYear: number;
  defaults: { km: number; months: number };
  soon: { km: number; days: number };
  maintTypes: { value: string; label: string }[];
  docKinds: { value: string; label: string }[];
}

/** ป้ายสถานะในตาราง — คำเต็มแบบในตัวอย่างของเจ้าของงาน ("ว่างพร้อมเบิก" บอกมากกว่า "ว่าง") */
/**
 * ตารางใช้พื้นที่ข้างเมนูเต็มจอ (เจ้าของงานขอ ต.ค. 69) — จอใหญ่เคยเหลือขอบว่างสองข้างเพราะความกว้างถูกจำกัดแล้ววางกลาง
 * หน้าอื่นที่เป็นการ์ด/ฟอร์มยังจำกัดความกว้างไว้ บรรทัดยาวเต็มจอใหญ่อ่านยาก
 */
const FULL_WIDTH = { maxWidth: "100%" as const, paddingHorizontal: 24 };

const STATUS_PILL: Record<string, { label: string; tone: "ok" | "info" | "warn" | "mute" }> = {
  AVAILABLE: { label: "ว่างพร้อมเบิก", tone: "ok" },
  IN_USE: { label: "กำลังใช้งาน", tone: "info" },
  MAINTENANCE: { label: "ซ่อมบำรุง", tone: "warn" },
  INACTIVE: { label: "เลิกใช้งาน", tone: "mute" },
};
const PILL_TONE = {
  ok: [colors.successSoft, colors.successInk, colors.success],
  info: [colors.primarySoft, colors.primaryInk, colors.primary],
  warn: [colors.warningSoft, colors.warningInk, colors.warning],
  bad: [colors.dangerSoft, colors.dangerInk, colors.danger],
  mute: [colors.tile, colors.textMuted, colors.textFaint],
} as const;

function DotPill({ tone, children }: { tone: keyof typeof PILL_TONE; children: React.ReactNode }) {
  const t = PILL_TONE[tone];
  return (
    <View style={[vs.pill, { backgroundColor: t[0] }]}>
      <View style={[vs.dot, { backgroundColor: t[2] }]} />
      <Text style={[vs.pillText, { color: t[1] }]}>{children}</Text>
    </View>
  );
}

/** ชิปวันหมดอายุ — ไม่มีวันที่ = "ไม่ระบุ" สีเทา ให้เห็นว่ายังไม่ได้กรอก ไม่ใช่ว่าไม่ต้องต่อ */
function ExpiryChip({ icon, label, e }: { icon: keyof typeof Ionicons.glyphMap; label: string; e: Expiry }) {
  const tone = e.level === "over" ? PILL_TONE.bad : e.level === "soon" ? PILL_TONE.warn : e.level === "ok" ? PILL_TONE.ok : PILL_TONE.mute;
  const left = e.daysLeft ?? 0;
  const text = !e.date
    ? `${label} ไม่ระบุ`
    : `${label} ${thaiDate(e.date)}${left < 0 ? ` · หมดแล้ว ${-left} วัน` : e.level === "soon" ? ` · อีก ${left} วัน` : ""}`;
  return (
    <View style={[vs.chip, { backgroundColor: tone[0] }]}>
      <Ionicons name={icon} size={13} color={tone[1]} />
      <Text style={[vs.chipText, { color: tone[1] }]}>{text}</Text>
    </View>
  );
}

function KpiCard({
  label,
  value,
  unit,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "ok" | "info" | "warn" | "bad";
}) {
  const t = PILL_TONE[tone];
  return (
    <View style={vs.kpi}>
      <View style={vs.kpiTop}>
        <Text style={vs.kpiLabel}>{label}</Text>
        <View style={[vs.kpiIcon, { backgroundColor: t[0] }]}>
          <Ionicons name={icon} size={18} color={t[1]} />
        </View>
      </View>
      <Text style={[vs.kpiValue, headingFont]}>
        {value}
        {unit ? <Text style={vs.kpiUnit}> {unit}</Text> : null}
      </Text>
      {hint ? <Text style={fs.muted}>{hint}</Text> : null}
    </View>
  );
}

const urgent = (v: FleetVehicle) => v.oil.level === "over" || [v.tax, v.act, v.ins].some((e) => e.level === "over") || !!v.maintNote;
const dueSoon = (v: FleetVehicle) => v.oil.level === "soon" || [v.tax, v.act, v.ins].some((e) => e.level === "soon");

export default function ManageVehiclesScreen() {
  const [data, setData, cached] = useCachedState<Fleet | null>("ManageVehicles:fleet", null);
  const [loading, setLoading] = useState(!cached);
  const [showInactive, setShowInactive] = useState(false);
  const [openId, setOpenId] = useState<number | "new" | null>(null);
  const [openTab, setOpenTab] = useState<"info" | "maint">("info");
  const [picking, setPicking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "urgent" | "soon">("all");
  const [regionPick, setRegionPick] = useState<string | null>(null);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const { width } = useWindowDimensions();
  const { docked, collapsed } = useDocked();
  // ตารางต้องการราว 1,050 px หลังหักเมนูข้าง — แคบกว่านั้นคอลัมน์บีบจนอ่านไม่ออก ใช้การ์ดแทน
  const table = width - (docked ? (collapsed ? 80 : 280) : 0) >= 1050;

  const load = useCallback(async () => {
    try {
      const res = await api.get<Fleet>("/vehicles/fleet");
      setData(res.data);
    } catch (e) {
      showAlert("โหลดข้อมูลไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !data) {
    return (
      <View style={fs.center}>
        <Spinner color={colors.primary} />
      </View>
    );
  }

  const open = (id: number | "new", tab: "info" | "maint" = "info") => {
    setOpenTab(tab);
    setOpenId(id);
  };
  const active = data.vehicles.filter((v) => v.status !== "INACTIVE");
  const inactive = data.vehicles.length - active.length;
  const base = showInactive ? data.vehicles : active;
  const term = q.trim().toLowerCase();
  const list = base.filter(
    (v) =>
      (filter === "all" || (filter === "urgent" ? urgent(v) : dueSoon(v))) &&
      (!term ||
        [v.plateNumber, v.brand, v.model, v.type, v.owner, v.activeBy, v.region].some((x) => x && x.toLowerCase().includes(term)) ||
        v.plateNumber.replace(/[\s-]/g, "").toLowerCase().includes(term.replace(/[\s-]/g, "")))
  );
  const oilOver = active.filter((v) => v.oil.level === "over").length;
  const oilSoon = active.filter((v) => v.oil.level === "soon").length;
  const oilUnset = active.filter((v) => v.oil.level === "none").length;
  const expiring = active.filter((v) => [v.tax, v.act, v.ins].some((e) => e.level === "soon" || e.level === "over")).length;
  const reports = active.filter((v) => v.maintNote);
  const opened = typeof openId === "number" ? data.vehicles.find((v) => v.id === openId) ?? null : null;

  // จัดกลุ่มตามภาค (เจ้าของงานขอ ต.ค. 69) — ภาคเรียงตามชื่อ หาภาคไม่ได้อยู่ท้ายสุด
  const NO_REGION = "ยังไม่ระบุภาค";
  const regionKey = (v: FleetVehicle) => v.region ?? NO_REGION;
  const byRegion = (vs: FleetVehicle[]) => {
    const g = new Map<string, FleetVehicle[]>();
    for (const v of vs) g.set(regionKey(v), [...(g.get(regionKey(v)) ?? []), v]);
    return new Map(
      [...g].sort(([a], [b]) => (a === NO_REGION ? 1 : b === NO_REGION ? -1 : a.localeCompare(b, "th")))
    );
  };
  const regionCounts = byRegion(base);
  const groups = byRegion(regionPick ? list.filter((v) => regionKey(v) === regionPick) : list);
  const toggle = (name: string) =>
    setClosed((c) => {
      const n = new Set(c);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });

  const carCell = (v: FleetVehicle) => (
    <View style={vs.car}>
      <View style={vs.carIcon}>
        <Ionicons name="car-outline" size={19} color={colors.primaryInk} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={vs.carPlate}>{v.plateNumber}</Text>
        <Text style={vs.carModel} numberOfLines={2}>
          {[[v.brand, v.model].filter(Boolean).join(" "), v.type].filter(Boolean).join(" · ") || "—"}
        </Text>
        {v.card?.fleetCardNo || v.card?.easyPassNo ? (
          <Text style={[fs.muted, { fontSize: 11.5 }]} selectable>
            {[
              v.card.fleetCardNo
                ? `Fleet Card ${v.card.fleetCardNo}${v.card.fleetCardLimit ? ` · วงเงิน ${fmtNum(v.card.fleetCardLimit)} บาท` : ""}`
                : null,
              v.card.easyPassNo ? `Easy Pass ${v.card.easyPassNo}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ) : null}
      </View>
    </View>
  );
  const statusCell = (v: FleetVehicle) => {
    const p = STATUS_PILL[v.status] ?? { label: v.statusLabel, tone: "mute" as const };
    return (
      <View style={{ gap: 4, alignItems: "flex-start" }}>
        <DotPill tone={p.tone}>{p.label}</DotPill>
        {v.activeBy ? <Text style={fs.muted}>โดย {v.activeBy}</Text> : null}
      </View>
    );
  };
  const expiryCell = (v: FleetVehicle) => (
    <View style={{ gap: 4, alignItems: "flex-start" }}>
      <ExpiryChip icon="calendar-outline" label="ภาษี" e={v.tax} />
      <ExpiryChip icon="shield-checkmark-outline" label="พ.ร.บ." e={v.act} />
      <ExpiryChip icon="umbrella-outline" label="ประกัน" e={v.ins} />
    </View>
  );
  const oilCell = (v: FleetVehicle) => {
    if (v.oil.level === "none") {
      return (
        <View style={[vs.chip, { backgroundColor: colors.tile }]}>
          <Ionicons name="water-outline" size={13} color={colors.textMuted} />
          <Text style={[vs.chipText, { color: colors.textMuted }]}>ยังไม่ได้ตั้งรอบ — กด "รายละเอียด" เพื่อตั้ง</Text>
        </View>
      );
    }
    const km = v.oil.remainKm ?? 0;
    const color = v.oil.level === "over" ? colors.dangerInk : v.oil.level === "soon" ? colors.warningInk : colors.successInk;
    const bar = v.oil.level === "over" ? colors.danger : v.oil.level === "soon" ? colors.warning : colors.success;
    return (
      <View style={{ gap: 5 }}>
        <View style={vs.oilTop}>
          <Text style={[vs.oilLeft, { color }]}>{km < 0 ? `เกินรอบ ${fmtNum(-km)} กม.` : `อีก ${fmtNum(km)} กม.`}</Text>
          <Text style={fs.muted}>{Math.round(v.oil.pct ?? 0)}%</Text>
        </View>
        <View style={vs.track}>
          <View style={[vs.fill, { width: `${Math.min(100, v.oil.pct ?? 0)}%`, backgroundColor: bar }]} />
        </View>
        <Text style={fs.muted}>
          ไมล์ {fmtNum(v.currentMileage)} / กำหนด {fmtNum(v.oil.dueKm ?? null)}
          {v.oil.daysLeft !== null && v.oil.daysLeft !== undefined
            ? v.oil.daysLeft < 0
              ? ` · เกินกำหนด ${-v.oil.daysLeft} วัน`
              : ` · หรือ ${thaiDate(v.oil.dueDate ?? null)}`
            : ""}
        </Text>
      </View>
    );
  };
  const noteCell = (v: FleetVehicle) =>
    v.maintNote ? (
      <TouchableOpacity style={vs.note} onPress={() => open(v.id, "maint")} accessibilityLabel={`บันทึกของ ${v.plateNumber}`}>
        <Ionicons name="document-text-outline" size={15} color={colors.primaryInk} />
        <Text style={vs.noteText} numberOfLines={2}>
          {v.maintNote}
        </Text>
      </TouchableOpacity>
    ) : (
      <TouchableOpacity style={vs.noteEmpty} onPress={() => open(v.id, "maint")} accessibilityLabel={`เพิ่มบันทึก ${v.plateNumber}`}>
        <View style={vs.noteDot} />
        <Text style={vs.noteEmptyText}>ยังไม่มีบันทึก / นัดหมาย</Text>
      </TouchableOpacity>
    );
  // ทีมตัวหนาแล้วชื่อช่างบรรทัดล่าง — ในภาคเดียวกันคนหารถด้วยทีม ("รถทีมขอนแก่นคันไหน")
  const ownerCell = (v: FleetVehicle) => {
    if (!v.owner) return <Text style={vs.owner}>-</Text>;
    const parts = v.owner.split("·").map((x) => x.trim());
    const teamIdx = v.team ? parts.findIndex((x) => x.replace(/^ทีม\s*/, "") === v.team) : -1;
    const rest = parts.filter((_, i) => i !== teamIdx).join(" · ");
    return (
      <View style={{ gap: 1 }}>
        {teamIdx >= 0 ? <Text style={vs.ownerTeam}>ทีม{v.team}</Text> : null}
        {rest ? <Text style={teamIdx >= 0 ? fs.muted : vs.owner}>{rest}</Text> : null}
      </View>
    );
  };
  const detailBtn = (v: FleetVehicle) => (
    <TouchableOpacity style={vs.detail} onPress={() => open(v.id)} accessibilityLabel={`เปิดรถ ${v.plateNumber}`}>
      <Text style={vs.detailText}>รายละเอียด</Text>
    </TouchableOpacity>
  );

  const FILTERS = [
    { key: "all", label: `ทั้งหมด (${base.length})`, dot: null },
    { key: "urgent", label: "เร่งด่วน", dot: colors.danger },
    { key: "soon", label: "ใกล้กำหนด", dot: colors.warning },
  ] as const;

  return (
    <>
      <ScrollView style={fs.container} contentContainerStyle={[fs.content, table && FULL_WIDTH]}>
        <View style={fs.row}>
          <View style={{ flex: 1, minWidth: 240, gap: 2 }}>
            <Text style={[fs.title, headingFont]}>ทะเบียน & ซ่อมบำรุง</Text>
            <Text style={fs.sub}>ติดตามรอบเปลี่ยนน้ำมันเครื่อง ภาษี พ.ร.บ. ประกันภัย และเก็บเอกสารรถไว้ที่เดียว</Text>
          </View>
          <TouchableOpacity style={vs.topBtn} onPress={() => setPicking(true)} accessibilityLabel="บันทึกการซ่อม / เปลี่ยนน้ำมัน">
            <Ionicons name="build-outline" size={16} color={colors.primaryInk} />
            <Text style={vs.topBtnText}>บันทึกการซ่อม / เปลี่ยนน้ำมัน</Text>
          </TouchableOpacity>
          {/* นำเข้าจากไฟล์ "รถช่าง Service" — เลือกไฟล์ได้เฉพาะบนเว็บ (แอดมินนั่งโต๊ะ) */}
          {canPickFile ? (
            <TouchableOpacity style={[fs.btn, fs.btnGhost]} onPress={() => setImporting(true)} accessibilityLabel="นำเข้ารถจาก Excel">
              <Ionicons name="cloud-upload-outline" size={17} color={colors.navy} />
              <Text style={fs.btnGhostText}>นำเข้าจาก Excel</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={fs.btn} onPress={() => open("new")}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={fs.btnText}>เพิ่มรถ</Text>
          </TouchableOpacity>
        </View>

        <View style={vs.kpis}>
          <KpiCard
            label="เกินรอบเปลี่ยนน้ำมันเครื่อง"
            value={oilOver}
            unit="คัน"
            hint="ควรเข้าศูนย์โดยเร็ว"
            icon="warning-outline"
            tone={oilOver ? "bad" : "ok"}
          />
          <KpiCard
            label={`ใกล้ถึงรอบ (≤ ${fmtNum(data.soon.km)} กม. / ${data.soon.days} วัน)`}
            value={oilSoon}
            unit="คัน"
            hint={oilUnset ? `ยังไม่ตั้งรอบ ${oilUnset} คัน` : "ตั้งรอบครบทุกคันแล้ว"}
            icon="water-outline"
            tone={oilSoon ? "warn" : "info"}
          />
          <KpiCard
            label="ภาษี / พ.ร.บ. / ประกัน ใกล้หมดอายุ"
            value={expiring}
            unit="คัน"
            hint={`ภายใน ${data.soon.days} วัน หรือหมดแล้ว`}
            icon="calendar-outline"
            tone={expiring ? "warn" : "ok"}
          />
          <KpiCard
            label="ค่าซ่อมบำรุงปีนี้"
            value={`฿${fmtNum(data.costYear)}`}
            hint={`${fmtNum(data.logCountYear)} รายการ`}
            icon="document-text-outline"
            tone="info"
          />
        </View>

        {reports.map((v) => (
          <Notice key={v.id} tone="bad" icon="construct-outline">
            <TouchableOpacity onPress={() => open(v.id, "maint")}>
              <Text style={fs.body}>
                <Text style={fs.bold}>แจ้งซ่อม: {v.plateNumber}</Text> — {v.maintNote}{" "}
                <Text style={{ color: colors.primaryInk }}>เปิดรถคันนี้ ›</Text>
              </Text>
            </TouchableOpacity>
          </Notice>
        ))}

        <View style={vs.panel}>
          <View style={vs.toolbar}>
            <View style={vs.search}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} />
              <TextInput
                style={vs.searchInput}
                value={q}
                onChangeText={setQ}
                placeholder="ค้นหาทะเบียน, ยี่ห้อ, ผู้รับผิดชอบ..."
                placeholderTextColor={colors.textFaint}
                accessibilityLabel="ค้นหารถ"
              />
            </View>
            <View style={vs.filters}>
              {FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[vs.filter, filter === f.key && vs.filterOn]}
                  onPress={() => setFilter(f.key)}
                  accessibilityLabel={`กรอง ${f.label}`}
                >
                  {f.dot ? <View style={[vs.dot, { backgroundColor: f.dot }]} /> : null}
                  <Text style={[vs.filterText, filter === f.key && vs.filterTextOn]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={vs.regionBar}>
            <Text style={vs.regionLbl}>ภาค</Text>
            {[[null, "ทุกภาค", base.length] as const, ...[...regionCounts].map(([r, vs2]) => [r, r, vs2.length] as const)].map(
              ([k, l, n]) => (
                <TouchableOpacity
                  key={k ?? "all"}
                  style={[vs.filter, vs.regionChip, regionPick === k && vs.filterOn]}
                  onPress={() => setRegionPick(k)}
                  accessibilityLabel={`ภาค ${l}`}
                >
                  <Text style={[vs.filterText, regionPick === k && vs.filterTextOn]}>{l}</Text>
                  <Text style={[vs.regionN, regionPick === k && vs.filterTextOn]}>{n}</Text>
                </TouchableOpacity>
              )
            )}
          </View>

          {list.length === 0 ? (
            <View style={{ padding: 24 }}>
              <EmptyState
                icon="car-outline"
                text={base.length ? "ไม่มีรถตรงกับที่ค้นหา / ตัวกรองนี้" : "ยังไม่มีรถในระบบ — กด เพิ่มรถ"}
              />
            </View>
          ) : null}

          {[...groups.entries()].map(([name, vehicles]) => {
            const nUrgent = vehicles.filter(urgent).length;
            const nSoon = vehicles.filter((v) => !urgent(v) && dueSoon(v)).length;
            const teams = [...new Set(vehicles.map((v) => v.team).filter(Boolean))];
            const isClosed = closed.has(name);
            return (
            <View key={name}>
              <TouchableOpacity style={vs.groupHead} onPress={() => toggle(name)} accessibilityLabel={`กลุ่มภาค ${name}`}>
                <View style={[vs.groupBar, name === NO_REGION && { backgroundColor: colors.textFaint }]} />
                <Text style={[vs.groupName, headingFont]}>{name}</Text>
                <View style={vs.groupCount}>
                  <Text style={vs.groupCountText}>{vehicles.length} คัน</Text>
                </View>
                {nUrgent ? <DotPill tone="bad">เร่งด่วน {nUrgent}</DotPill> : null}
                {nSoon ? <DotPill tone="warn">ใกล้กำหนด {nSoon}</DotPill> : null}
                <View style={{ flex: 1 }} />
                <Text style={[fs.muted, { flexShrink: 1 }]} numberOfLines={2}>
                  {name === NO_REGION
                    ? "ไม่มีทีม หรือทีมไม่อยู่ในทะเบียนสาขา — กำหนดภาคในรายละเอียดรถ"
                    : teams.length
                    ? `ทีม: ${teams.join(" · ")}`
                    : ""}
                </Text>
                <Ionicons name={isClosed ? "chevron-forward" : "chevron-down"} size={18} color={colors.textMuted} />
              </TouchableOpacity>
              {isClosed ? null : table ? (
                <>
                  <View style={[vs.tr, vs.thead]}>
                    <Text style={[vs.th, vs.cCar]}>รถ</Text>
                    <Text style={[vs.th, vs.cStatus]}>สถานะ</Text>
                    <Text style={[vs.th, vs.cExp]}>ภาษี / พ.ร.บ. / ประกัน</Text>
                    <Text style={[vs.th, vs.cOil]}>รอบน้ำมันเครื่อง</Text>
                    <Text style={[vs.th, vs.cOwner]}>ผู้รับผิดชอบ</Text>
                    <Text style={[vs.th, vs.cNote]}>บันทึก / นัดหมาย</Text>
                    <View style={vs.cAct} />
                  </View>
                  {vehicles.map((v) => (
                    <View key={v.id} style={[vs.tr, vs.trLine, v.status === "INACTIVE" && { opacity: 0.6 }]}>
                      <View style={vs.cCar}>{carCell(v)}</View>
                      <View style={vs.cStatus}>{statusCell(v)}</View>
                      <View style={vs.cExp}>{expiryCell(v)}</View>
                      <View style={vs.cOil}>{oilCell(v)}</View>
                      <View style={vs.cOwner}>{ownerCell(v)}</View>
                      <View style={vs.cNote}>{noteCell(v)}</View>
                      <View style={[vs.cAct, { alignItems: "flex-end" }]}>{detailBtn(v)}</View>
                    </View>
                  ))}
                </>
              ) : (
                vehicles.map((v) => (
                  <View key={v.id} style={[vs.cardRow, v.status === "INACTIVE" && { opacity: 0.6 }]}>
                    <View style={vs.cardTop}>
                      <View style={{ flex: 1, minWidth: 0 }}>{carCell(v)}</View>
                      {statusCell(v)}
                    </View>
                    <View style={[fs.row, { gap: 6 }]}>
                      <ExpiryChip icon="calendar-outline" label="ภาษี" e={v.tax} />
                      <ExpiryChip icon="shield-checkmark-outline" label="พ.ร.บ." e={v.act} />
                      <ExpiryChip icon="umbrella-outline" label="ประกัน" e={v.ins} />
                    </View>
                    {oilCell(v)}
                    {v.owner ? ownerCell(v) : null}
                    <View style={vs.cardTop}>
                      <View style={{ flex: 1 }}>{noteCell(v)}</View>
                      {detailBtn(v)}
                    </View>
                  </View>
                ))
              )}
            </View>
            );
          })}
        </View>
        <Text style={[fs.muted, { textAlign: "center" }]}>
          รอบน้ำมันเครื่องมาตรฐาน: ทุก {fmtNum(data.defaults.km)} กม. หรือ {data.defaults.months} เดือน
        </Text>
        {inactive ? (
          <TouchableOpacity onPress={() => setShowInactive((s) => !s)} style={{ alignSelf: "center", padding: 8 }}>
            <Text style={{ color: colors.primaryInk }}>
              {showInactive ? "ซ่อนรถที่เลิกใช้งาน" : `แสดงรถที่เลิกใช้งาน (${inactive})`}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {openId !== null ? (
        <VehicleModal
          key={String(openId)}
          vehicle={opened}
          fleet={data}
          initialTab={openTab}
          onClose={() => setOpenId(null)}
          onCreated={async (id) => {
            // โหลดก่อนค่อยเปิดคันใหม่ — ฟอร์มอ่านค่าตั้งต้นครั้งเดียวตอนเปิด ถ้ายังไม่มีข้อมูลจะได้ฟอร์มว่าง
            await load();
            open(id);
          }}
          onChanged={load}
        />
      ) : null}
      {/* ปุ่มบนสุด: เลือกคันก่อน แล้วเปิดตรงแท็บประวัติซ่อมบำรุง — บันทึกเปลี่ยนน้ำมันอยู่ในแท็บนั้น */}
      <AppModal
        visible={picking}
        onClose={() => setPicking(false)}
        title="บันทึกการซ่อม / เปลี่ยนน้ำมัน"
        subtitle="เลือกรถที่จะบันทึก"
      >
        <View style={{ gap: 6 }}>
          {active.map((v) => (
            <TouchableOpacity
              key={v.id}
              style={vs.pickRow}
              onPress={() => {
                setPicking(false);
                open(v.id, "maint");
              }}
              accessibilityLabel={`บันทึกซ่อม ${v.plateNumber}`}
            >
              {carCell(v)}
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      </AppModal>
      <VehicleImportModal visible={importing} onClose={() => setImporting(false)} onDone={load} />
    </>
  );
}

const vs = StyleSheet.create({
  topBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.sky50,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  topBtnText: { color: colors.primaryInk, fontSize: 14, fontWeight: "700" },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  // 150 = มือถือได้แถวละสองใบ (ใบละใบเต็มจอต้องเลื่อนสี่จอกว่าจะเจอรถ) จอคอมได้แถวเดียวสี่ใบ
  kpi: {
    flexGrow: 1,
    flexBasis: 150,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 18,
    gap: 4,
    ...shadow.card,
  },
  kpiTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  kpiLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.text, marginTop: 4 },
  kpiIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  kpiValue: { fontSize: 34, lineHeight: 42, fontWeight: "800", color: colors.navy },
  kpiUnit: { fontSize: 14, fontWeight: "400", color: colors.textMuted },
  panel: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.card,
  },
  toolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, padding: 14 },
  search: {
    flexGrow: 1,
    flexBasis: 280,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14.5, lineHeight: 22, color: colors.text, paddingVertical: 11 },
  filters: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  filterOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  filterText: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  filterTextOn: { color: "#fff" },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.sky50,
  },
  groupBar: { width: 4, height: 20, borderRadius: 2, backgroundColor: colors.primary },
  groupName: { fontSize: 16, fontWeight: "700", color: colors.text },
  groupCount: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  groupCountText: { fontSize: 12, fontWeight: "700", color: colors.primaryInk },
  tr: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  trLine: { borderTopWidth: 1, borderTopColor: colors.border },
  thead: { paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border },
  th: { fontSize: 11.5, fontWeight: "700", color: colors.textMuted },
  cCar: { flex: 1.6 },
  cStatus: { flex: 1.2 },
  cExp: { flex: 1.3 },
  cOil: { flex: 2.6 },
  cOwner: { flex: 0.8 },
  cNote: { flex: 1.6 },
  cAct: { flex: 0.9 },
  car: { flexDirection: "row", alignItems: "center", gap: 12 },
  carIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  carPlate: { fontSize: 15, fontWeight: "700", color: colors.text },
  carModel: { fontSize: 13.5, color: colors.textMuted },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 12, fontWeight: "700" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, alignSelf: "flex-start" },
  chipText: { fontSize: 12.5, fontWeight: "600" },
  oilTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  oilLeft: { fontSize: 14, fontWeight: "700" },
  track: { height: 7, borderRadius: 4, backgroundColor: colors.sky200, overflow: "hidden" },
  fill: { height: 7, borderRadius: 4 },
  owner: { fontSize: 14, color: colors.body },
  ownerTeam: { fontSize: 14, fontWeight: "700", color: colors.text },
  regionBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  regionLbl: { fontSize: 12, fontWeight: "600", color: colors.textMuted, marginRight: 2 },
  regionChip: { paddingVertical: 6 },
  regionN: { fontSize: 12.5, color: colors.textMuted },
  note: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.sky50, borderRadius: radius.md, padding: 10 },
  noteText: { flex: 1, fontSize: 13, color: colors.primaryInk },
  noteEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: 12,
  },
  noteDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.tile },
  noteEmptyText: { fontSize: 12.5, color: colors.textFaint },
  detail: { backgroundColor: colors.sky50, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  detailText: { color: colors.primaryInk, fontSize: 13.5, fontWeight: "700" },
  cardRow: { padding: 14, gap: 10, borderTopWidth: 1, borderTopColor: colors.border },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
  },
});

// ── หน้าต่างรายละเอียดรถ ─────────────────────────────────

const STATUS_OPTIONS = [
  { value: "AVAILABLE", label: "ว่าง" },
  { value: "MAINTENANCE", label: "ซ่อมบำรุง" },
  { value: "INACTIVE", label: "เลิกใช้งาน" },
];

function VehicleModal({
  vehicle,
  fleet,
  onClose,
  onCreated,
  onChanged,
  initialTab = "info",
}: {
  vehicle: FleetVehicle | null;
  fleet: Fleet;
  initialTab?: "info" | "maint";
  onClose: () => void;
  onCreated: (id: number) => void | Promise<void>;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"info" | "docs" | "maint">(vehicle ? initialTab : "info");
  const isNew = vehicle === null;
  return (
    <AppModal
      visible
      onClose={onClose}
      width={760}
      title={isNew ? "เพิ่มรถ" : vehicle.plateNumber}
      subtitle={isNew ? "กรอกข้อมูลที่มี ที่เหลือมาเติมทีหลังได้" : [vehicle.brand, vehicle.model, vehicle.statusLabel].filter(Boolean).join(" · ")}
    >
      {!isNew ? (
        <View style={[fs.chips, { marginBottom: 8 }]}>
          {(
            [
              ["info", "ข้อมูล & รอบซ่อม"],
              ["docs", "เอกสาร"],
              ["maint", "ประวัติซ่อมบำรุง"],
            ] as const
          ).map(([k, l]) => (
            <TouchableOpacity key={k} style={[fs.chip, tab === k && fs.chipOn]} onPress={() => setTab(k)}>
              <Text style={[fs.chipText, tab === k && fs.chipTextOn]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {tab === "info" ? (
        <InfoForm vehicle={vehicle} fleet={fleet} onCreated={onCreated} onChanged={onChanged} onDeleted={onClose} />
      ) : tab === "docs" && vehicle ? (
        <DocsTab vehicle={vehicle} fleet={fleet} onChanged={onChanged} />
      ) : vehicle ? (
        <MaintTab vehicle={vehicle} fleet={fleet} onChanged={onChanged} />
      ) : null}
    </AppModal>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 160 }}>
      <DateField value={value} onChange={onChange} label={label} labelStyle={[fs.label, { marginBottom: 0 }]} />
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  numeric,
  placeholder,
  grow = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  placeholder?: string;
  grow?: boolean;
}) {
  return (
    <View style={grow ? { flexGrow: 1, flexBasis: 160 } : undefined}>
      <Text style={fs.label}>{label}</Text>
      <TextInput
        style={fs.input}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? "number-pad" : "default"}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel={label}
      />
    </View>
  );
}

function InfoForm({
  vehicle: v,
  fleet,
  onCreated,
  onChanged,
  onDeleted,
}: {
  vehicle: FleetVehicle | null;
  fleet: Fleet;
  onCreated: (id: number) => void | Promise<void>;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const s = (x: string | number | null | undefined) => (x === null || x === undefined ? "" : String(x));
  const [f, setF] = useState<Record<string, string>>(() => ({
    plateNumber: s(v?.plateNumber),
    brand: s(v?.brand),
    model: s(v?.model),
    type: s(v?.type),
    note: s(v?.note),
    currentMileage: s(v?.currentMileage ?? ""),
    status: v?.status ?? "AVAILABLE",
    owner: s(v?.owner),
    region: s(v?.regionManual),
    taxExpire: s(v?.tax.date),
    actExpire: s(v?.act.date),
    insExpire: s(v?.ins.date),
    insCompany: s(v?.insCompany),
    insPolicy: s(v?.insPolicy),
    oilEveryKm: s(v?.oilEveryKm),
    oilEveryMonths: s(v?.oilEveryMonths),
    lastOilKm: s(v?.lastOilKm),
    lastOilDate: s(v?.lastOilDate),
    maintNote: s(v?.maintNote),
    fleetCardNo: s(v?.card?.fleetCardNo),
    fleetCardLimit: s(v?.card?.fleetCardLimit),
    easyPassNo: s(v?.card?.easyPassNo),
  }));
  // รถเดิมที่เซิร์ฟเวอร์ไม่ส่งบัตรมา (Admin Spare Part) — ไม่ขึ้นช่องและไม่ส่งค่าบัตรกลับไปทับ
  const showCard = !v || v.card !== null;
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (t: string) => setF((p) => ({ ...p, [k]: t }));

  async function save() {
    if (!f.plateNumber.trim()) return showAlert("ข้อมูลไม่ครบ", "ต้องใส่ทะเบียนรถ");
    const num = (k: string) => {
      const t = f[k].replace(/[,\s]/g, "");
      return t === "" ? null : Number(t);
    };
    for (const k of ["currentMileage", "oilEveryKm", "oilEveryMonths", "lastOilKm", "fleetCardLimit"]) {
      const n = num(k);
      if (n !== null && (!Number.isInteger(n) || n < 0)) return showAlert("ตรวจตัวเลข", "ช่องตัวเลขต้องเป็นจำนวนเต็ม");
    }
    for (const k of ["taxExpire", "actExpire", "insExpire", "lastOilDate"]) {
      if (f[k] && !/^\d{4}-\d{2}-\d{2}$/.test(f[k])) return showAlert("ตรวจวันที่", "วันที่ต้องเป็น ปี-เดือน-วัน เช่น 2027-03-12");
    }
    const text = (k: string) => f[k].trim() || null;
    const body: Record<string, unknown> = {
      plateNumber: f.plateNumber.trim(),
      brand: text("brand"),
      model: text("model"),
      type: text("type"),
      note: text("note"),
      owner: text("owner"),
      region: text("region"),
      insCompany: text("insCompany"),
      insPolicy: text("insPolicy"),
      maintNote: text("maintNote"),
      taxExpire: f.taxExpire || null,
      actExpire: f.actExpire || null,
      insExpire: f.insExpire || null,
      lastOilDate: f.lastOilDate || null,
      oilEveryKm: num("oilEveryKm"),
      oilEveryMonths: num("oilEveryMonths"),
      lastOilKm: num("lastOilKm"),
    };
    if (showCard) {
      body.fleetCardNo = text("fleetCardNo");
      body.fleetCardLimit = num("fleetCardLimit");
      body.easyPassNo = text("easyPassNo");
    }
    // รถที่กำลังถูกใช้: สถานะเป็นของการเบิก/คืน ไม่ส่งไปให้เปลี่ยน
    if (f.status !== "IN_USE") body.status = f.status;
    if (num("currentMileage") !== null) body.currentMileage = num("currentMileage");
    setBusy(true);
    try {
      if (v) {
        await api.put(`/vehicles/${v.id}`, body);
        showAlert("บันทึกแล้ว", `แก้ไขรถ ${f.plateNumber.trim()} แล้ว`);
        onChanged();
      } else {
        const res = await api.post<{ id: number }>("/vehicles", body);
        onCreated(res.data.id);
      }
    } catch (e) {
      showAlert("บันทึกไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!v) return;
    showAlert("ลบรถคันนี้?", `${v.plateNumber} — ลบได้เฉพาะรถที่ยังไม่เคยถูกใช้ ถ้าเคยใช้แล้วให้ตั้งเป็น "เลิกใช้งาน"`, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/vehicles/${v.id}`);
            onChanged();
            onDeleted();
          } catch (e) {
            showAlert("ลบไม่ได้", apiErrorMessage(e));
          }
        },
      },
    ]);
  }

  const wrap = { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 10 };
  return (
    <View style={{ gap: 10 }}>
      <Text style={fs.section}>ข้อมูลรถ</Text>
      <View style={wrap}>
        <Field label="ทะเบียนรถ *" value={f.plateNumber} onChange={set("plateNumber")} placeholder="กข-1234" />
        <Field label="ยี่ห้อ" value={f.brand} onChange={set("brand")} placeholder="Toyota" />
        <Field label="รุ่น" value={f.model} onChange={set("model")} placeholder="Hilux Revo" />
        <Field label="ประเภท" value={f.type} onChange={set("type")} placeholder="กระบะ" />
        <Field label="เลขไมล์ปัจจุบัน" value={f.currentMileage} onChange={set("currentMileage")} numeric placeholder="0" />
        <Field label="ผู้รับผิดชอบ" value={f.owner} onChange={set("owner")} placeholder="ทีม · ชื่อช่าง" />
      </View>
      <View style={{ gap: 4 }}>
        <Text style={fs.label}>ภาค</Text>
        <Dropdown
          value={f.region || null}
          options={fleet.regions.map((r) => ({ value: r, label: r }))}
          onChange={(x) => set("region")(x ?? "")}
          clearable
          placeholder={v?.teamRegion ? `ตามทีม ${v.team} — ${v.teamRegion}` : "ตามทีมของผู้รับผิดชอบ"}
          accessibilityLabel="ภาค"
        />
        <Text style={fs.muted}>
          {v?.teamRegion
            ? "ว่างไว้ = ใช้ภาคของทีมผู้รับผิดชอบ (ย้ายทีมแล้วภาคตามเอง) · เลือกเองเฉพาะเมื่ออยากให้ต่างจากทีม"
            : "หาภาคจากทีมของผู้รับผิดชอบไม่ได้ — เลือกภาคเองเพื่อไม่ให้อยู่กลุ่ม \"ยังไม่ระบุภาค\""}
        </Text>
      </View>
      {/* เห็นเฉพาะแอดมิน (ต.ค. 69) — แอดมินจดเลขบัตร/วงเงินไว้ที่นี่ เซิร์ฟเวอร์ไม่ส่งช่องนี้ให้ช่าง */}
      <Field label="หมายเหตุ (เห็นเฉพาะแอดมิน)" value={f.note} onChange={set("note")} grow={false} placeholder="เช่น บัตรเติมน้ำมันลงท้าย 8853 · ศูนย์ที่เช็ครถ" />
      <Text style={fs.label}>สถานะ</Text>
      {f.status === "IN_USE" ? (
        <Text style={fs.muted}>กำลังใช้งาน — สถานะจะกลับเป็นว่างเองเมื่อช่างคืนรถ</Text>
      ) : (
        <View style={fs.chips}>
          {STATUS_OPTIONS.map((o) => (
            <TouchableOpacity key={o.value} style={[fs.chip, f.status === o.value && fs.chipOn]} onPress={() => set("status")(o.value)}>
              <Text style={[fs.chipText, f.status === o.value && fs.chipTextOn]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={[fs.section, { marginTop: 8 }]}>ภาษี / พ.ร.บ. / ประกัน</Text>
      <View style={wrap}>
        <DateInput label="ภาษีหมดอายุ" value={f.taxExpire} onChange={set("taxExpire")} />
        <DateInput label="พ.ร.บ. หมดอายุ" value={f.actExpire} onChange={set("actExpire")} />
        <DateInput label="ประกันหมดอายุ" value={f.insExpire} onChange={set("insExpire")} />
      </View>
      <View style={wrap}>
        <Field label="บริษัทประกัน" value={f.insCompany} onChange={set("insCompany")} />
        <Field label="เลขกรมธรรม์" value={f.insPolicy} onChange={set("insPolicy")} />
      </View>

      {showCard ? (
        <>
          <Text style={[fs.section, { marginTop: 8 }]}>บัตรเติมน้ำมัน / Easy Pass</Text>
          <Text style={fs.muted}>เห็นเฉพาะแอดมิน — ช่างไม่เห็นเลขบัตรในหน้าเบิกรถ</Text>
          <View style={wrap}>
            <Field label="เลข Fleet Card" value={f.fleetCardNo} onChange={set("fleetCardNo")} placeholder="0004 7000 0000 0000" />
            <Field label="วงเงินต่อรอบ (บาท)" value={f.fleetCardLimit} onChange={set("fleetCardLimit")} numeric />
            <Field label="เลขบัตร Easy Pass" value={f.easyPassNo} onChange={set("easyPassNo")} />
          </View>
        </>
      ) : null}

      <Text style={[fs.section, { marginTop: 8 }]}>รอบน้ำมันเครื่อง</Text>
      <Text style={fs.muted}>
        ครบรอบเมื่อถึง กม. หรือถึงเดือน อย่างใดอย่างหนึ่งก่อน · เว้นว่าง = {fmtNum(fleet.defaults.km)} กม. / {fleet.defaults.months} เดือน ·
        บันทึก "เปลี่ยนน้ำมันเครื่อง" ในแท็บซ่อมบำรุงแล้วรอบจะเริ่มนับใหม่เอง
      </Text>
      <View style={wrap}>
        <Field label="ทุกกี่ กม." value={f.oilEveryKm} onChange={set("oilEveryKm")} numeric placeholder={String(fleet.defaults.km)} />
        <Field label="ทุกกี่เดือน" value={f.oilEveryMonths} onChange={set("oilEveryMonths")} numeric placeholder={String(fleet.defaults.months)} />
        <Field label="เปลี่ยนล่าสุดที่ไมล์" value={f.lastOilKm} onChange={set("lastOilKm")} numeric />
        <DateInput label="เปลี่ยนล่าสุดวันที่" value={f.lastOilDate} onChange={set("lastOilDate")} />
      </View>
      <Field label="เรื่องที่ต้องซ่อม (ช่างแจ้งตอนคืนรถ)" value={f.maintNote} onChange={set("maintNote")} grow={false} />

      <View style={[fs.modalActions, { marginTop: 8 }]}>
        {v ? (
          <TouchableOpacity style={[fs.btn, fs.btnDanger]} onPress={remove} disabled={busy}>
            <Text style={fs.btnDangerText}>ลบรถ</Text>
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={fs.btn} onPress={save} disabled={busy}>
          {busy ? <Spinner color="#fff" /> : <Text style={fs.btnText}>{v ? "บันทึกข้อมูล" : "เพิ่มรถ"}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** เลือกรูปจากกล้องหรืออัลบั้ม — บนเว็บเปิดตัวเลือกไฟล์ (ซึ่งมีปุ่มกล้องของมือถือในตัว) */
function chooseImage(): Promise<PickedAttachment | null> {
  if (Platform.OS === "web") return pickImageAttachment(false);
  return new Promise((resolve) =>
    showAlert("เพิ่มรูป", undefined, [
      { text: "ถ่ายรูป", onPress: () => pickImageAttachment(true).then(resolve) },
      { text: "เลือกจากอัลบั้ม", onPress: () => pickImageAttachment(false).then(resolve) },
      { text: "ยกเลิก", style: "cancel", onPress: () => resolve(null) },
    ])
  );
}

interface DocRow {
  id: number;
  kind: string;
  kindLabel: string;
  thumbnailDataUrl: string | null;
  createdAt: string;
}

function DocsTab({ vehicle, fleet, onChanged }: { vehicle: FleetVehicle; fleet: Fleet; onChanged: () => void }) {
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const load = useCallback(() => {
    api
      .get<DocRow[]>(`/vehicles/${vehicle.id}/docs`)
      .then((r) => setDocs(r.data))
      .catch((e) => showAlert("โหลดเอกสารไม่สำเร็จ", apiErrorMessage(e)));
  }, [vehicle.id]);
  useEffect(load, [load]);

  async function upload(kind: string) {
    const file = await chooseImage();
    if (!file) return;
    try {
      await postImageForm(`/vehicles/${vehicle.id}/docs`, file, { kind }, "กำลังอัปโหลดเอกสาร...");
      load();
      onChanged();
    } catch (e) {
      showAlert("อัปโหลดไม่สำเร็จ", apiErrorMessage(e));
    }
  }

  if (!docs) return <Spinner color={colors.primary} />;
  return (
    <View style={{ gap: 10 }}>
      <Text style={fs.muted}>รูปเอกสารเก็บแบบส่วนตัว เปิดดูผ่านลิงก์ชั่วคราว · อัปใหม่จะแทนที่ของเดิมชนิดเดียวกัน</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {fleet.docKinds.map((k) => {
          const d = docs.find((x) => x.kind === k.value);
          return (
            <View key={k.value} style={[fs.card, { flexGrow: 1, flexBasis: 160, padding: 12 }]}>
              <Text style={fs.bold}>{k.label}</Text>
              <TouchableOpacity
                style={{ height: 110, borderRadius: radius.md, backgroundColor: colors.tile, overflow: "hidden", alignItems: "center", justifyContent: "center" }}
                onPress={() => (d ? openSigned(`/vehicles/docs/${d.id}/link`) : upload(k.value))}
                accessibilityLabel={d ? `เปิด${k.label}` : `อัป${k.label}`}
              >
                {d?.thumbnailDataUrl ? (
                  <Image source={{ uri: d.thumbnailDataUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                ) : d ? (
                  <Ionicons name="document-outline" size={28} color={colors.primary} />
                ) : (
                  <Text style={fs.muted}>ยังไม่มี · แตะเพื่ออัป</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={[fs.btn, fs.btnGhost, fs.small]} onPress={() => upload(k.value)}>
                <Text style={fs.btnGhostText}>{d ? "เปลี่ยนรูป" : "อัปโหลด"}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}

interface MaintRow {
  id: number;
  type: string;
  typeLabel: string;
  date: string;
  mileage: number | null;
  cost: number;
  shop: string | null;
  detail: string | null;
  vehicleLogId: number | null;
  createdByName: string | null;
  thumbnailDataUrl: string | null;
  hasFile: boolean;
}

function MaintTab({ vehicle, fleet, onChanged }: { vehicle: FleetVehicle; fleet: Fleet; onChanged: () => void }) {
  const [rows, setRows] = useState<MaintRow[] | null>(null);
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const blank = { type: "OIL", date: today, mileage: String(vehicle.currentMileage || ""), cost: "", shop: "", detail: "" };
  const [f, setF] = useState(blank);
  const [file, setFile] = useState<PickedAttachment | null>(null);
  const [clearNote, setClearNote] = useState(!!vehicle.maintNote);
  const [adding, setAdding] = useState(false);
  const set = (k: keyof typeof blank) => (t: string) => setF((p) => ({ ...p, [k]: t }));

  const load = useCallback(() => {
    api
      .get<MaintRow[]>(`/vehicles/${vehicle.id}/maintenance`)
      .then((r) => setRows(r.data))
      .catch((e) => showAlert("โหลดประวัติไม่สำเร็จ", apiErrorMessage(e)));
  }, [vehicle.id]);
  useEffect(load, [load]);

  async function save() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return showAlert("ตรวจวันที่", "วันที่ต้องเป็น ปี-เดือน-วัน");
    const mileage = f.mileage.replace(/[,\s]/g, "");
    const cost = f.cost.replace(/[,\s]/g, "");
    if ((mileage && !/^\d+$/.test(mileage)) || (cost && !/^\d+$/.test(cost))) return showAlert("ตรวจตัวเลข", "ไมล์และค่าใช้จ่ายต้องเป็นจำนวนเต็ม");
    try {
      await postImageForm(`/vehicles/${vehicle.id}/maintenance`, file, {
        type: f.type,
        date: f.date,
        mileage,
        cost: cost || "0",
        shop: f.shop.trim(),
        detail: f.detail.trim(),
        clearNote: String(clearNote && !!vehicle.maintNote),
      });
      setF(blank);
      setFile(null);
      setAdding(false);
      load();
      onChanged();
    } catch (e) {
      showAlert("บันทึกไม่สำเร็จ", apiErrorMessage(e));
    }
  }

  function remove(r: MaintRow) {
    showAlert("ลบรายการนี้?", `${r.typeLabel} · ${thaiDate(r.date)}`, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/vehicles/maintenance/${r.id}`);
            load();
            onChanged();
          } catch (e) {
            showAlert("ลบไม่สำเร็จ", apiErrorMessage(e));
          }
        },
      },
    ]);
  }

  const total = (rows ?? []).reduce((s, r) => s + r.cost, 0);
  return (
    <View style={{ gap: 10 }}>
      <View style={fs.row}>
        <Text style={fs.muted}>
          {rows ? `${rows.length} รายการ · รวม ฿${fmtNum(total)}` : ""}
        </Text>
        <View style={{ flex: 1 }} />
        {!adding ? (
          <TouchableOpacity style={fs.btn} onPress={() => setAdding(true)}>
            <Ionicons name="construct-outline" size={16} color="#fff" />
            <Text style={fs.btnText}>บันทึกการซ่อม / เปลี่ยนน้ำมัน</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {adding ? (
        <View style={[fs.card, { backgroundColor: colors.sky50 }]}>
          <View style={fs.chips}>
            {fleet.maintTypes.map((t) => (
              <TouchableOpacity key={t.value} style={[fs.chip, f.type === t.value && fs.chipOn]} onPress={() => set("type")(t.value)}>
                <Text style={[fs.chipText, f.type === t.value && fs.chipTextOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {f.type === "OIL" ? <Text style={fs.muted}>บันทึกแล้วรอบน้ำมันเครื่องเริ่มนับใหม่จากไมล์และวันที่นี้</Text> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <DateInput label="วันที่" value={f.date} onChange={set("date")} />
            <Field label="เลขไมล์" value={f.mileage} onChange={set("mileage")} numeric />
            <Field label="ค่าใช้จ่าย (บาท)" value={f.cost} onChange={set("cost")} numeric placeholder="0" />
            <Field label="ร้าน / ศูนย์" value={f.shop} onChange={set("shop")} />
          </View>
          <Field label="รายละเอียด" value={f.detail} onChange={set("detail")} grow={false} placeholder="เช่น เปลี่ยนผ้าเบรกหน้า" />
          <View style={fs.row}>
            <TouchableOpacity style={[fs.btn, fs.btnGhost, fs.small]} onPress={async () => setFile((await chooseImage()) ?? file)}>
              <Ionicons name="camera-outline" size={16} color={colors.navy} />
              <Text style={fs.btnGhostText}>{file ? "เปลี่ยนรูปใบเสร็จ" : "แนบรูปใบเสร็จ (ไม่บังคับ)"}</Text>
            </TouchableOpacity>
            {file ? <Image source={{ uri: file.thumbnailUri ?? file.uri }} style={{ width: 54, height: 42, borderRadius: 6 }} /> : null}
          </View>
          {vehicle.maintNote ? (
            <TouchableOpacity style={fs.row} onPress={() => setClearNote((c) => !c)} accessibilityRole="checkbox" accessibilityState={{ checked: clearNote }}>
              <Ionicons name={clearNote ? "checkbox" : "square-outline"} size={20} color={colors.primary} />
              <Text style={fs.body}>ซ่อมเรื่องที่ช่างแจ้งแล้ว ("{vehicle.maintNote}")</Text>
            </TouchableOpacity>
          ) : null}
          <View style={fs.modalActions}>
            <TouchableOpacity style={[fs.btn, fs.btnGhost]} onPress={() => (setAdding(false), setFile(null))}>
              <Text style={fs.btnGhostText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity style={fs.btn} onPress={save}>
              <Text style={fs.btnText}>บันทึก</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {rows === null ? <Spinner color={colors.primary} /> : null}
      {rows?.length === 0 ? <Text style={fs.muted}>ยังไม่มีประวัติซ่อมบำรุง</Text> : null}
      {rows?.map((r) => (
        <View key={r.id} style={[fs.item, fs.row, { alignItems: "flex-start" }]}>
          {r.thumbnailDataUrl ? (
            <TouchableOpacity onPress={() => openSigned(`/vehicles/maintenance/${r.id}/link`)} accessibilityLabel="เปิดรูปใบเสร็จ">
              <Image source={{ uri: r.thumbnailDataUrl }} style={{ width: 64, height: 50, borderRadius: 6 }} />
            </TouchableOpacity>
          ) : null}
          <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
            <View style={fs.row}>
              <Tag tone={r.type === "REPORT" ? "bad" : r.type === "OIL" ? "info" : "mute"}>{r.typeLabel}</Tag>
              <Text style={fs.bold}>{thaiDate(r.date)}</Text>
              {r.mileage !== null ? <Text style={fs.muted}>ไมล์ {fmtNum(r.mileage)}</Text> : null}
              {r.cost ? <Text style={fs.bold}>฿{fmtNum(r.cost)}</Text> : null}
            </View>
            {r.detail ? <Text style={fs.body}>{r.detail}</Text> : null}
            <Text style={fs.muted}>
              {[r.shop, r.createdByName ? `บันทึกโดย ${r.createdByName}` : null].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <TouchableOpacity onPress={() => remove(r)} accessibilityLabel="ลบรายการซ่อม" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={18} color={colors.dangerInk} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}
