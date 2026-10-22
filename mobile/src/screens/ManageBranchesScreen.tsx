/**
 * จัดการข้อมูลสาขา (แอดมิน — ออกแบบใหม่ ต.ค. 69 ตามตัวอย่างที่เจ้าของงานเลือก)
 *
 * เดิม: ฟอร์มเพิ่มสาขาค้างบนหัวหน้า + รายการพันกว่าแถวที่แก้ไม่ได้ มีแต่ปุ่ม "ลบ" ทุกแถว
 * ซึ่งลบใบงาน/เครื่อง/เคสของสาขาไปด้วย · ตอนนี้: ตัวเลขสรุป (กดแล้วกรอง) ค้นหา กรอง โหลดทีละ 50
 * คลิกแถวเปิดแผงแก้ไข (จอกว้างอยู่ขวา · มือถือเปิดเป็นหน้าต่าง) · "ปิดสาขา" แทนการลบ
 *
 * แก้ได้ที่นี่: พิกัด รัศมี ที่อยู่ — ชื่อ ภาค ประเภท มาจากไฟล์ทะเบียน (แก้ที่นี่ นำเข้ารอบหน้าจะเขียนทับ)
 * ทีมย้ายที่ "ทีมช่าง → ย้ายสาขาเข้าทีม" ซึ่งนำเข้ารอบหน้าคงไว้ให้
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import Dropdown from "../components/Dropdown";
import AppModal from "../components/AppModal";
import { useRefreshHandler } from "../components/RefreshButton";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { openUrl } from "../utils/share";
import { colors, radius, shadow, spacing } from "../theme";

interface Row {
  id: number;
  code: string;
  name: string;
  address: string | null;
  region: string | null;
  zone: string | null;
  pmTeam: string | null;
  ownership: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  cancelledAt: string | null;
  cancelledNote: string | null;
  openWorkOrders: number;
  /** ช่องที่แก้ในแอป — นำเข้าไฟล์รอบหน้าไม่ทับ */
  editedInApp: string[];
}
interface Options {
  regions: string[];
  ownerships: string[];
  teams: string[];
}
type RegistryField = "region" | "ownership" | "zone" | "pmTeam";
const REGISTRY: { key: RegistryField; label: string }[] = [
  { key: "region", label: "ภาค" },
  { key: "ownership", label: "ประเภท" },
  { key: "zone", label: "ทีม CM" },
  { key: "pmTeam", label: "ทีม PM" },
];
interface Counts {
  open: number;
  noCoords: number;
  noTeam: number;
  closed: number;
}
interface Usage {
  workOrders: number;
  openWorkOrders: number;
  machines: number;
  outages: number;
  checkIns: number;
  workLogs: number;
  snapshots: number;
  teamMoves: number;
}
interface Filters {
  search: string;
  region: string | null;
  team: string | null;
  coords: "has" | "none" | null;
  noTeam: boolean;
  status: "open" | "closed";
}

const PAGE = 50;
const START: Filters = { search: "", region: null, team: null, coords: null, noTeam: false, status: "open" };
const hasCoords = (r: Pick<Row, "latitude" | "longitude">) => r.latitude != null && r.longitude != null;

export default function ManageBranchesScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const [filters, setFilters] = useState<Filters>(START);
  const [searchText, setSearchText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regions, setRegions] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const seq = useRef(0);

  // พิมพ์ค้นหาแล้วรอครู่หนึ่ง — ไม่งั้นพิมพ์ชื่อสาขายาว ๆ ยิงทีละตัวอักษร
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.search === searchText.trim() ? f : { ...f, search: searchText.trim() })), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  const params = (f: Filters, offset: number) => ({
    search: f.search || undefined,
    region: f.region ?? undefined,
    team: f.team ?? undefined,
    coords: f.coords ?? undefined,
    noTeam: f.noTeam ? "1" : undefined,
    status: f.status,
    offset,
    limit: PAGE,
  });

  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ total: number; counts: Counts; rows: Row[] }>("/branches/manage", { params: params(filters, 0) });
      if (n !== seq.current) return;
      setRows(res.data.rows);
      setTotal(res.data.total);
      setCounts(res.data.counts);
      // แถวที่เปิดแผงอยู่ — อัปเดตเป็นข้อมูลใหม่ (หลังบันทึก) หรือปิดแผงถ้าไม่อยู่ในผลกรองแล้ว
      setSelected((s) => (s ? res.data.rows.find((r) => r.id === s.id) ?? null : s));
    } catch (e) {
      if (n === seq.current) setError(apiErrorMessage(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [filters]);
  useEffect(() => {
    void load();
  }, [load]);
  useRefreshHandler(load);

  useEffect(() => {
    api.get<{ name: string }[]>("/branches/regions").then((r) => setRegions(r.data.map((x) => x.name))).catch(() => undefined);
    api.get<{ name: string }[]>("/branches/teams").then((r) => setTeams(r.data.map((x) => x.name))).catch(() => undefined);
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await api.get<{ rows: Row[] }>("/branches/manage", { params: params(filters, rows.length) });
      setRows((cur) => [...cur, ...res.data.rows.filter((r) => !cur.some((c) => c.id === r.id))]);
    } catch (e) {
      showAlert("โหลดเพิ่มไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const tiles: { key: string; label: string; n: number | undefined; warn?: boolean; on: boolean; apply: () => void }[] = [
    { key: "open", label: "สาขาที่เปิดอยู่", n: counts?.open, on: filters.status === "open" && !filters.coords && !filters.noTeam, apply: () => set({ status: "open", coords: null, noTeam: false }) },
    { key: "noCoords", label: "ยังไม่มีพิกัด", n: counts?.noCoords, warn: true, on: filters.status === "open" && filters.coords === "none", apply: () => set({ status: "open", coords: "none", noTeam: false }) },
    { key: "noTeam", label: "ยังไม่มีทีม", n: counts?.noTeam, on: filters.status === "open" && filters.noTeam, apply: () => set({ status: "open", coords: null, noTeam: true }) },
    { key: "closed", label: "ปิดแล้ว", n: counts?.closed, on: filters.status === "closed", apply: () => set({ status: "closed", coords: null, noTeam: false }) },
  ];

  const list = (
    <View style={{ flex: 1, minWidth: 0 }}>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : loading && rows.length === 0 ? (
        <Spinner color={colors.primary} style={{ marginTop: 30 }} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>ไม่พบสาขาตามที่กรอง</Text>
      ) : wide ? (
        <View style={styles.table}>
          <View style={[styles.tr, styles.thead]}>
            {["รหัส", "ชื่อสาขา", "ภาค", "ทีม CM", "ทีม PM", "ประเภท", "พิกัด", "ใบค้าง"].map((h, i) => (
              <Text key={h} style={[styles.th, COLS[i]]}>{h}</Text>
            ))}
          </View>
          {rows.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.tr, selected?.id === r.id && styles.trOn]}
              onPress={() => setSelected(r)}
              accessibilityLabel={`สาขา ${r.code}`}
            >
              <Text style={[styles.td, COLS[0], styles.code]}>{r.code}</Text>
              <Text style={[styles.td, COLS[1], { color: colors.text }]}>{r.name}</Text>
              <Text style={[styles.td, COLS[2]]}>{r.region ?? "—"}</Text>
              <Text style={[styles.td, COLS[3]]}>{r.zone ?? "—"}</Text>
              <Text style={[styles.td, COLS[4]]}>{r.pmTeam ?? "—"}</Text>
              <Text style={[styles.td, COLS[5]]}>{r.ownership ?? "—"}</Text>
              <View style={[COLS[6], styles.cell]}><CoordTag row={r} /></View>
              <Text style={[styles.td, COLS[7], styles.num]}>{r.openWorkOrders || "—"}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {rows.map((r) => (
            <TouchableOpacity key={r.id} style={styles.card} onPress={() => setSelected(r)} accessibilityLabel={`สาขา ${r.code}`}>
              <View style={styles.cardTop}>
                <Text style={styles.code}>{r.code}</Text>
                <CoordTag row={r} />
                {r.openWorkOrders ? <Text style={styles.meta}>ใบค้าง {r.openWorkOrders}</Text> : null}
              </View>
              <Text style={styles.cardName}>{r.name}</Text>
              <Text style={styles.meta}>
                {[r.region, r.zone && `ทีม ${r.zone}`, r.ownership].filter(Boolean).join(" · ") || "—"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {rows.length > 0 ? (
        <View style={styles.foot}>
          <Text style={styles.meta}>
            แสดง {rows.length.toLocaleString("th-TH")} จาก {total.toLocaleString("th-TH")} สาขา
          </Text>
          {rows.length < total ? (
            <TouchableOpacity style={styles.btn} onPress={loadMore} disabled={loadingMore}>
              {loadingMore ? <Spinner size="small" color={colors.primary} /> : <Text style={styles.btnText}>โหลดเพิ่ม</Text>}
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const editor = selected ? (
    <BranchEditor key={selected.id} row={selected} onClose={() => setSelected(null)} onChanged={load} />
  ) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <Text style={styles.sub}>สาขาส่วนใหญ่มาจากนำเข้าทะเบียน (หน้าติดตามเครื่องเสีย → นำเข้า) · กดที่สาขาเพื่อแก้พิกัด ภาค ประเภท ทีม — นำเข้ารอบหน้าไม่ทับค่าที่แก้ในแอป</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => setAdding(true)} accessibilityLabel="เพิ่มสาขา">
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={[styles.btnText, { color: "#fff" }]}>เพิ่มสาขา</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tiles}>
        {tiles.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tile, t.warn && styles.tileWarn, t.on && styles.tileOn]}
            onPress={t.apply}
            accessibilityLabel={`ตัวกรอง ${t.label} ${t.n ?? ""}`}
          >
            <Text style={styles.tileLabel}>{t.label}</Text>
            <Text style={[styles.tileNum, t.warn && { color: colors.warningInk }]}>{t.n?.toLocaleString("th-TH") ?? "—"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.tools}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={15} color={colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="ค้นรหัส ชื่อสาขา หรือที่อยู่"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="ค้นหาสาขา"
          />
        </View>
        <View style={styles.filter}>
          <Dropdown value={filters.region} options={regions.map((r) => ({ value: r, label: r }))} onChange={(v) => set({ region: v })} placeholder="ภาค: ทั้งหมด" clearable accessibilityLabel="กรองภาค" />
        </View>
        <View style={styles.filter}>
          <Dropdown value={filters.team} options={teams.map((t) => ({ value: t, label: t }))} onChange={(v) => set({ team: v })} placeholder="ทีม: ทั้งหมด" clearable accessibilityLabel="กรองทีม" />
        </View>
        <View style={styles.filter}>
          <Dropdown
            value={filters.coords}
            options={[{ value: "has", label: "มีพิกัด" }, { value: "none", label: "ยังไม่มีพิกัด" }]}
            onChange={(v) => set({ coords: (v as Filters["coords"]) ?? null })}
            placeholder="พิกัด: ทั้งหมด"
            clearable
            accessibilityLabel="กรองพิกัด"
          />
        </View>
        <View style={styles.filter}>
          <Dropdown
            value={filters.status}
            options={[{ value: "open", label: "เปิดอยู่" }, { value: "closed", label: "ปิดแล้ว" }]}
            onChange={(v) => set({ status: v === "closed" ? "closed" : "open" })}
            accessibilityLabel="กรองสถานะ"
          />
        </View>
      </View>

      {wide ? (
        <View style={styles.split}>
          {list}
          {editor ? <View style={styles.side}>{editor}</View> : null}
        </View>
      ) : (
        <>
          {list}
          <AppModal visible={!!selected} onClose={() => setSelected(null)} title={selected ? `สาขา ${selected.code}` : ""} subtitle={selected?.name}>
            {editor}
          </AppModal>
        </>
      )}

      <AppModal visible={adding} onClose={() => setAdding(false)} title="เพิ่มสาขา" subtitle="สาขาที่มาจากทะเบียนให้นำเข้าไฟล์แทน — เพิ่มทีละสาขาสำหรับสาขาที่ยังไม่อยู่ในไฟล์">
        {adding ? (
          <BranchEditor
            row={null}
            onClose={() => setAdding(false)}
            onChanged={async () => {
              setAdding(false);
              await load();
            }}
          />
        ) : null}
      </AppModal>
    </ScrollView>
  );
}

function CoordTag({ row }: { row: Pick<Row, "latitude" | "longitude" | "cancelledAt"> }) {
  if (row.cancelledAt) return <Text style={[styles.tag, styles.tagOff]}>ปิดแล้ว</Text>;
  return hasCoords(row) ? (
    <Text style={[styles.tag, styles.tagOk]}>มีพิกัด</Text>
  ) : (
    <Text style={[styles.tag, styles.tagNo]}>ยังไม่มีพิกัด</Text>
  );
}

/** แผงแก้ไข/เพิ่มสาขา — row = null คือเพิ่มใหม่ */
function BranchEditor({ row, onClose, onChanged }: { row: Row | null; onClose: () => void; onChanged: () => void | Promise<void> }) {
  const adding = row === null;
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [lat, setLat] = useState(row?.latitude != null ? String(row.latitude) : "");
  const [lng, setLng] = useState(row?.longitude != null ? String(row.longitude) : "");
  const [radiusM, setRadiusM] = useState(String(row?.radiusMeters ?? 200));
  const [address, setAddress] = useState(row?.address ?? "");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeNote, setCloseNote] = useState("");
  const [reg, setReg] = useState<Record<RegistryField, string | null>>({
    region: row?.region ?? null,
    ownership: row?.ownership ?? null,
    zone: row?.zone ?? null,
    pmTeam: row?.pmTeam ?? null,
  });
  const [options, setOptions] = useState<Options | null>(null);

  useEffect(() => {
    api.get<Options>("/branches/manage/options").then((r) => setOptions(r.data)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!row) return;
    api.get<Usage>(`/branches/${row.id}/usage`).then((r) => setUsage(r.data)).catch(() => undefined);
  }, [row]);

  async function readLink() {
    if (!link.trim()) return;
    setBusy("กำลังอ่านลิงก์");
    try {
      const res = await api.post<{ latitude: number; longitude: number }>("/branches/resolve-map-link", { text: link.trim() });
      setLat(String(res.data.latitude));
      setLng(String(res.data.longitude));
      setLink("");
    } catch (e) {
      showAlert("อ่านพิกัดไม่ได้", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const la = lat.trim() === "" ? null : Number(lat);
    const lo = lng.trim() === "" ? null : Number(lng);
    if ((la === null) !== (lo === null)) return showAlert("พิกัดไม่ครบ", "ใส่ทั้งละติจูดและลองจิจูด หรือเว้นว่างทั้งคู่");
    if ((la !== null && (!Number.isFinite(la) || Math.abs(la) > 90)) || (lo !== null && (!Number.isFinite(lo) || Math.abs(lo) > 180))) {
      return showAlert("พิกัดไม่ถูกต้อง", "ละติจูดต้องอยู่ระหว่าง -90 ถึง 90 และลองจิจูด -180 ถึง 180");
    }
    const r = Number(radiusM);
    if (!Number.isInteger(r) || r <= 0) return showAlert("รัศมีไม่ถูกต้อง", "ใส่เป็นเมตร เช่น 200");
    if (adding && (!code.trim() || !name.trim())) return showAlert("ข้อมูลไม่ครบ", "ต้องมีรหัสสาขาและชื่อสาขา");
    setBusy("กำลังบันทึก");
    try {
      const body = { latitude: la, longitude: lo, radiusMeters: r, address: address.trim() || undefined };
      let id = row?.id;
      if (adding) {
        const res = await api.post<{ id: number }>("/branches", { ...body, code: code.trim().toUpperCase(), name: name.trim(), latitude: la ?? undefined, longitude: lo ?? undefined });
        id = res.data.id;
      } else await api.put(`/branches/${row!.id}`, body);
      // ส่งเฉพาะช่องที่เปลี่ยน — ช่องที่ไม่ได้แตะต้องไม่ถูกจำว่า "แก้ในแอป" แล้วไปบังคับทับไฟล์รอบหน้า
      const changed = Object.fromEntries(REGISTRY.filter((f) => reg[f.key] && reg[f.key] !== (row?.[f.key] ?? null)).map((f) => [f.key, reg[f.key]]));
      if (Object.keys(changed).length) await api.put(`/branches/${id}/registry`, changed);
      await onChanged();
    } catch (e) {
      showAlert("บันทึกไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function closeBranch() {
    if (!row || !closeNote.trim()) return;
    setBusy("กำลังปิดสาขา");
    try {
      await api.post(`/branches/${row.id}/close`, { note: closeNote.trim() });
      setClosing(false);
      await onChanged();
    } catch (e) {
      showAlert("ปิดสาขาไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function reopen() {
    if (!row) return;
    setBusy("กำลังเปิดสาขา");
    try {
      await api.post(`/branches/${row.id}/reopen`);
      await onChanged();
    } catch (e) {
      showAlert("เปิดสาขาไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function remove() {
    if (!row) return;
    showAlert("ลบสาขาถาวร", `ลบ ${row.code} ${row.name} — สาขานี้ไม่มีใบงาน เครื่อง หรือประวัติ`, [
      { text: "ไม่ลบ", style: "cancel" },
      {
        text: "ลบถาวร",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/branches/${row.id}`);
            onClose();
            await onChanged();
          } catch (e) {
            showAlert("ลบไม่สำเร็จ", apiErrorMessage(e));
          }
        },
      },
    ]);
  }

  const linked = usage
    ? [
        usage.workOrders && `ใบงาน ${usage.workOrders} ใบ${usage.openWorkOrders ? ` (ค้าง ${usage.openWorkOrders})` : ""}`,
        usage.machines && `เครื่อง ${usage.machines}`,
        usage.outages && `เคส ${usage.outages}`,
        usage.checkIns && `รายงานตัว ${usage.checkIns}`,
        usage.workLogs && `บันทึกงาน ${usage.workLogs}`,
        usage.snapshots && `คะแนน ${usage.snapshots}`,
        usage.teamMoves && `ย้ายทีม ${usage.teamMoves}`,
      ].filter(Boolean)
    : [];
  const la = Number(lat);
  const lo = Number(lng);
  const mapOk = lat.trim() !== "" && lng.trim() !== "" && Number.isFinite(la) && Number.isFinite(lo);

  return (
    <View style={styles.editor} accessibilityLabel={adding ? "แผงเพิ่มสาขา" : "แผงแก้ไขสาขา"}>
      {!adding ? (
        <View style={styles.edHead}>
          <Text style={styles.edCode}>{row!.code}</Text>
          <Text style={styles.edName}>{row!.name}</Text>
        </View>
      ) : (
        <>
          <Field label="รหัสสาขา *">
            <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder="เช่น C0420" autoCapitalize="characters" accessibilityLabel="รหัสสาขา" />
          </Field>
          <Field label="ชื่อสาขา *">
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="ชื่อตามทะเบียน" accessibilityLabel="ชื่อสาขา" />
          </Field>
        </>
      )}

      <Field label="พิกัด">
        {/* ลิงก์จากแอปแผนที่ง่ายกว่าคัดลอกตัวเลขสองช่อง — ลิงก์สั้นให้เซิร์ฟเวอร์ตามไปอ่าน */}
        <View style={styles.pasteRow}>
          <TextInput
            style={[styles.input, styles.paste]}
            value={link}
            onChangeText={setLink}
            onSubmitEditing={readLink}
            placeholder="วางลิงก์ Google Maps หรือพิกัด"
            placeholderTextColor={colors.primaryInk}
            accessibilityLabel="วางลิงก์ Google Maps"
          />
          <TouchableOpacity style={styles.btn} onPress={readLink} disabled={!!busy || !link.trim()} accessibilityLabel="อ่านพิกัดจากลิงก์">
            <Text style={styles.btnText}>อ่านพิกัด</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.row2}>
          <TextInput style={[styles.input, { flex: 1, minWidth: 0 }]} value={lat} onChangeText={setLat} placeholder="ละติจูด" keyboardType="numbers-and-punctuation" accessibilityLabel="ละติจูด" />
          <TextInput style={[styles.input, { flex: 1, minWidth: 0 }]} value={lng} onChangeText={setLng} placeholder="ลองจิจูด" keyboardType="numbers-and-punctuation" accessibilityLabel="ลองจิจูด" />
        </View>
        {mapOk ? (
          <TouchableOpacity onPress={() => openUrl(`https://maps.google.com/?q=${la},${lo}`)}>
            <Text style={styles.link}>ดูบนแผนที่ ↗</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.hint}>ยังไม่มีพิกัด — ช่างรายงานตัวด้วย GPS ที่สาขานี้ไม่ได้ · ข้อความไลน์จ่ายงานไม่มีลิงก์แผนที่</Text>
        )}
      </Field>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Field label="รัศมีรายงานตัว (เมตร)">
            <TextInput style={styles.input} value={radiusM} onChangeText={setRadiusM} keyboardType="number-pad" accessibilityLabel="รัศมี" />
          </Field>
        </View>
        <View style={{ flex: 2 }}>
          <Field label="ที่อยู่">
            <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="ไม่บังคับ" accessibilityLabel="ที่อยู่" />
          </Field>
        </View>
      </View>

      <Field label="ภาค ประเภท ทีม (เลือกจากที่มีในระบบ)">
        <View style={styles.regGrid}>
          {REGISTRY.map((f) => {
            const list = !options ? [] : f.key === "region" ? options.regions : f.key === "ownership" ? options.ownerships : options.teams;
            const edited = row?.editedInApp.includes(f.key);
            return (
              <View key={f.key} style={styles.regCell}>
                <View style={styles.regLabelRow}>
                  <Text style={styles.subLabel}>{f.label}</Text>
                  {edited ? <Text style={styles.editedTag}>แก้ในแอป</Text> : null}
                </View>
                <Dropdown
                  value={reg[f.key]}
                  options={list.map((v) => ({ value: v, label: v }))}
                  onChange={(v) => v && setReg((cur) => ({ ...cur, [f.key]: v }))}
                  placeholder="— ยังไม่ระบุ —"
                  disabled={!options}
                  accessibilityLabel={`เลือก${f.label}`}
                />
              </View>
            );
          })}
        </View>
        <Text style={styles.hint}>
          นำเข้าไฟล์รอบหน้าไม่ทับค่าที่แก้ที่นี่ · ทีมที่แก้ขึ้นในรายการย้ายสาขาของหน้าทีมช่าง (คืนตามไฟล์ได้) ·
          ใบงานที่จ่ายไปแล้วไม่ย้ายตาม มีผลกับใบงานใหม่
        </Text>
      </Field>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.btn} onPress={onClose} disabled={!!busy}>
          <Text style={styles.btnText}>ปิด</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={save} disabled={!!busy} accessibilityLabel={adding ? "บันทึกสาขาใหม่" : "บันทึกสาขา"}>
          {busy ? <Spinner size="small" color="#fff" /> : <Text style={[styles.btnText, { color: "#fff" }]}>{adding ? "เพิ่มสาขา" : "บันทึก"}</Text>}
        </TouchableOpacity>
      </View>

      {!adding ? (
        <View style={styles.danger}>
          {row!.cancelledAt ? (
            <>
              <Text style={styles.closedNote}>ปิดแล้ว{row!.cancelledNote ? ` — ${row!.cancelledNote}` : ""}</Text>
              <TouchableOpacity style={styles.btn} onPress={reopen} disabled={!!busy} accessibilityLabel="เปิดสาขาอีกครั้ง">
                <Text style={styles.btnText}>เปิดสาขาอีกครั้ง</Text>
              </TouchableOpacity>
            </>
          ) : closing ? (
            // ยืนยันในแผงเลย ไม่เปิดหน้าต่างซ้อน — บนมือถือแผงนี้อยู่ในหน้าต่างอยู่แล้ว หน้าต่างซ้อนหน้าต่างไม่น่าเชื่อถือบนเว็บ
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>เหตุผลที่ปิดสาขา *</Text>
              <TextInput style={styles.input} value={closeNote} onChangeText={setCloseNote} placeholder="เช่น ร้านปิดกิจการ ต.ค. 69" accessibilityLabel="เหตุผลที่ปิดสาขา" />
              {usage?.openWorkOrders ? (
                <Text style={styles.warn}>มีใบงานค้าง {usage.openWorkOrders} ใบ — ปิดสาขาไม่ยกเลิกใบงานให้ ต้องจัดการเอง</Text>
              ) : null}
              <Text style={styles.hint}>สาขาที่ปิดไม่ขึ้นตอนเปิดใบงาน · เคสบนกระดานที่ค้างปิดให้ · ใบงานและประวัติอยู่ครบ</Text>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.btn} onPress={() => setClosing(false)}>
                  <Text style={styles.btnText}>ไม่ปิด</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnDanger, !closeNote.trim() && { opacity: 0.5 }]}
                  onPress={closeBranch}
                  disabled={!!busy || !closeNote.trim()}
                  accessibilityLabel="ยืนยันปิดสาขา"
                >
                  <Text style={[styles.btnText, { color: "#fff" }]}>ปิดสาขา</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={[styles.btn, styles.btnDangerGhost]} onPress={() => setClosing(true)} accessibilityLabel="ปิดสาขา">
              <Text style={[styles.btnText, { color: colors.danger }]}>ปิดสาขา — ใบงานและประวัติอยู่ครบ</Text>
            </TouchableOpacity>
          )}
          {usage && linked.length === 0 ? (
            <TouchableOpacity style={[styles.btn, styles.btnDangerGhost]} onPress={remove} accessibilityLabel="ลบสาขาถาวร">
              <Text style={[styles.btnText, { color: colors.danger }]}>ลบถาวร</Text>
            </TouchableOpacity>
          ) : usage ? (
            <Text style={styles.hint} accessibilityLabel="เหตุผลที่ลบไม่ได้">
              ลบถาวรไม่ได้ — มี{linked.join(" · ")} (ลบสาขาแล้วข้อมูลพวกนี้หายด้วย)
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

// ความกว้างคอลัมน์ตาราง (จอกว้าง) — ชื่อสาขายาวที่สุด ได้ส่วนที่เหลือ
const COLS = [{ width: 80 }, { flex: 1, minWidth: 200 }, { width: 120 }, { width: 120 }, { width: 110 }, { width: 96 }, { width: 110 }, { width: 60 }];

const styles = StyleSheet.create({
  regGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  regCell: { flexGrow: 1, flexBasis: 150, gap: 4 },
  regLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  subLabel: { fontSize: 12, color: colors.textMuted },
  editedTag: { fontSize: 11, color: colors.primary, backgroundColor: colors.primarySoft, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, overflow: "hidden" },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  sub: { fontSize: 13, color: colors.textMuted, flexShrink: 1 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: 150, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  tileWarn: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  tileOn: { borderColor: colors.primary, borderWidth: 2 },
  tileLabel: { fontSize: 12, color: colors.textMuted },
  tileNum: { fontSize: 22, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
  tools: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, zIndex: 10 },
  searchBox: { flexGrow: 2, flexBasis: 240, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10 },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 14, color: colors.text },
  filter: { flexGrow: 1, flexBasis: 150 },
  split: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  side: { width: 380, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },
  table: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  tr: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  trOn: { backgroundColor: colors.primarySoft },
  thead: { backgroundColor: colors.background },
  th: { fontSize: 12, fontWeight: "700", color: colors.textMuted, paddingVertical: 8, paddingHorizontal: 6 },
  td: { fontSize: 13, color: colors.textMuted, paddingVertical: 9, paddingHorizontal: 6 },
  cell: { paddingHorizontal: 6 },
  code: { fontWeight: "800", color: colors.navy },
  num: { textAlign: "right", fontVariant: ["tabular-nums"] },
  card: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 2 },
  cardTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  cardName: { fontSize: 14, color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
  tag: { fontSize: 11.5, fontWeight: "700", borderRadius: 6, paddingHorizontal: 7, overflow: "hidden", alignSelf: "flex-start" },
  tagOk: { color: colors.successInk, backgroundColor: colors.successSoft },
  tagNo: { color: colors.warningInk, backgroundColor: colors.warningSoft },
  tagOff: { color: colors.textMuted, backgroundColor: colors.background },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.sm, paddingVertical: spacing.sm },
  empty: { color: colors.textMuted, fontSize: 14, textAlign: "center", paddingVertical: spacing.lg },
  error: { color: colors.danger, fontSize: 14 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 },
  btnPrimary: { backgroundColor: colors.navyFill, borderColor: colors.navyFill },
  btnDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
  btnDangerGhost: { borderColor: colors.danger, backgroundColor: "transparent" },
  btnText: { fontSize: 13, fontWeight: "700", color: colors.navy },
  editor: { gap: spacing.md },
  edHead: { gap: 2 },
  edCode: { fontSize: 18, fontWeight: "800", color: colors.navy },
  edName: { fontSize: 13, color: colors.textMuted },
  label: { fontSize: 12.5, fontWeight: "700", color: colors.textMuted },
  input: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: colors.text, backgroundColor: colors.card },
  pasteRow: { flexDirection: "row", gap: 6 },
  paste: { flex: 1, minWidth: 0, borderStyle: "dashed", borderColor: colors.primary, backgroundColor: colors.primarySoft },
  row2: { flexDirection: "row", gap: spacing.sm },
  link: { fontSize: 13, fontWeight: "700", color: colors.primary },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  warn: { fontSize: 12.5, color: colors.warningInk, fontWeight: "700" },
  ro: { fontSize: 13, color: colors.text, backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm },
  danger: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, gap: spacing.sm },
  closedNote: { fontSize: 13, color: colors.textMuted },
});
