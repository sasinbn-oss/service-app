/**
 * ทะเบียน & ซ่อมบำรุง (แอดมิน) — ยกมาจาก OTTERI FLEET
 *
 * หน้าเดียวที่บอกว่าคันไหนต้องเข้าศูนย์: เกินรอบน้ำมันเครื่อง · ภาษี/พ.ร.บ./ประกันใกล้หมด ·
 * ช่างแจ้งซ่อมตอนคืนรถ — แทนการจดในสมุดแล้วลืมเปิด
 *
 * กดที่รถเพื่อเปิดรายละเอียด 3 แท็บ: ข้อมูล · เอกสาร (รูปเล่ม/กรมธรรม์) · ซ่อมบำรุง
 */
import React, { useCallback, useEffect, useState } from "react";
import { Image, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import AppModal from "../components/AppModal";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import DateField, { thaiDate } from "../components/DateField";
import { fs, Kpi, Notice, Tag, Tone, vehicleTone } from "../components/FleetUI";
import { useCachedState } from "../utils/pageCache";
import { showAlert } from "../utils/alert";
import { pickImageAttachment, PickedAttachment } from "../utils/attachments";
import { fmtNum, openSigned, postImageForm } from "../utils/vehicles";
import { colors, headingFont, radius } from "../theme";

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
}
interface Fleet {
  vehicles: FleetVehicle[];
  costYear: number;
  logCountYear: number;
  defaults: { km: number; months: number };
  soon: { km: number; days: number };
  maintTypes: { value: string; label: string }[];
  docKinds: { value: string; label: string }[];
}

const LEVEL_TONE: Record<Level, Tone> = { none: "mute", ok: "ok", soon: "warn", over: "bad" };

function expiryText(label: string, e: Expiry) {
  if (!e.date) return `${label} —`;
  const left = e.daysLeft ?? 0;
  return `${label} ${thaiDate(e.date)}${left < 0 ? ` (หมดแล้ว ${-left} วัน)` : e.level === "soon" ? ` (อีก ${left} วัน)` : ""}`;
}

function oilText(o: FleetVehicle["oil"]) {
  if (o.level === "none") return "ยังไม่มีบันทึกเปลี่ยนน้ำมัน";
  const km = o.remainKm ?? 0;
  const parts = [km < 0 ? `เกินรอบ ${fmtNum(-km)} กม.` : `อีก ${fmtNum(km)} กม.`];
  if (o.daysLeft !== null && o.daysLeft !== undefined) parts.push(o.daysLeft < 0 ? `เกินกำหนด ${-o.daysLeft} วัน` : `หรือ ${thaiDate(o.dueDate ?? null)}`);
  return parts.join(" · ");
}

export default function ManageVehiclesScreen() {
  const [data, setData, cached] = useCachedState<Fleet | null>("ManageVehicles:fleet", null);
  const [loading, setLoading] = useState(!cached);
  const [showInactive, setShowInactive] = useState(false);
  const [openId, setOpenId] = useState<number | "new" | null>(null);

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

  const active = data.vehicles.filter((v) => v.status !== "INACTIVE");
  const inactive = data.vehicles.length - active.length;
  const list = showInactive ? data.vehicles : active;
  const oilOver = active.filter((v) => v.oil.level === "over").length;
  const oilSoon = active.filter((v) => v.oil.level === "soon").length;
  const expiring = active.filter((v) => [v.tax, v.act, v.ins].some((e) => e.level === "soon" || e.level === "over")).length;
  const reports = active.filter((v) => v.maintNote);
  const opened = typeof openId === "number" ? data.vehicles.find((v) => v.id === openId) ?? null : null;

  return (
    <>
      <ScrollView style={fs.container} contentContainerStyle={fs.content}>
        <View style={fs.row}>
          <Text style={[fs.title, headingFont]}>ทะเบียน & ซ่อมบำรุง</Text>
          <Tag tone="mute">{active.length} คัน</Tag>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={fs.btn} onPress={() => setOpenId("new")}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={fs.btnText}>เพิ่มรถ</Text>
          </TouchableOpacity>
        </View>

        <View style={fs.kpis}>
          <Kpi label="เกินรอบน้ำมันเครื่อง" value={oilOver} unit="คัน" tone={oilOver ? "bad" : undefined} />
          <Kpi
            label={`ใกล้ถึงรอบ (≤ ${fmtNum(data.soon.km)} กม. / ${data.soon.days} วัน)`}
            value={oilSoon}
            unit="คัน"
            tone={oilSoon ? "warn" : undefined}
          />
          <Kpi label="ภาษี / พ.ร.บ. / ประกัน ใกล้หมด" value={expiring} unit="คัน" tone={expiring ? "warn" : undefined} />
          <Kpi label="ค่าซ่อมบำรุงปีนี้" value={`฿${fmtNum(data.costYear)}`} hint={`${data.logCountYear} รายการ`} tone="navy" />
        </View>

        {reports.map((v) => (
          <Notice key={v.id} tone="bad" icon="construct-outline">
            <TouchableOpacity onPress={() => setOpenId(v.id)}>
              <Text style={fs.body}>
                <Text style={fs.bold}>แจ้งซ่อม: {v.plateNumber}</Text> — {v.maintNote}{" "}
                <Text style={{ color: colors.primaryInk }}>เปิดรถคันนี้ ›</Text>
              </Text>
            </TouchableOpacity>
          </Notice>
        ))}

        {list.length === 0 ? (
          <View style={fs.card}>
            <EmptyState icon="car-outline" text="ยังไม่มีรถในระบบ — กด เพิ่มรถ" />
          </View>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {list.map((v) => (
            <TouchableOpacity
              key={v.id}
              style={[fs.card, { flexGrow: 1, flexBasis: 320, maxWidth: "100%" }, v.status === "INACTIVE" && { opacity: 0.6 }]}
              onPress={() => setOpenId(v.id)}
              activeOpacity={0.85}
              accessibilityLabel={`เปิดรถ ${v.plateNumber}`}
            >
              <View style={fs.row}>
                <Text style={[fs.plate, headingFont]}>{v.plateNumber}</Text>
                <Tag tone={vehicleTone(v.status)}>{v.statusLabel}</Tag>
                {v.maintNote ? <Tag tone="bad">แจ้งซ่อม</Tag> : null}
                <View style={{ flex: 1 }} />
                <Text style={fs.muted}>ไมล์ {fmtNum(v.currentMileage)}</Text>
              </View>
              <Text style={fs.muted}>
                {[v.brand, v.model, v.type].filter(Boolean).join(" · ") || "—"}
                {v.activeBy ? ` · ใช้งานโดย ${v.activeBy}` : ""}
                {v.owner ? ` · ผู้รับผิดชอบ ${v.owner}` : ""}
              </Text>
              <View style={fs.chips}>
                <Tag tone={LEVEL_TONE[v.tax.level]}>{expiryText("ภาษี", v.tax)}</Tag>
                <Tag tone={LEVEL_TONE[v.act.level]}>{expiryText("พ.ร.บ.", v.act)}</Tag>
                <Tag tone={LEVEL_TONE[v.ins.level]}>{expiryText("ประกัน", v.ins)}</Tag>
              </View>
              <View style={{ gap: 4 }}>
                <View style={fs.row}>
                  <Ionicons name="water-outline" size={14} color={colors.textMuted} />
                  <Text style={[fs.muted, v.oil.level === "over" && { color: colors.dangerInk, fontWeight: "700" }]}>
                    น้ำมันเครื่อง · {oilText(v.oil)}
                  </Text>
                </View>
                {v.oil.level !== "none" ? (
                  <View style={fs.hbar}>
                    <View
                      style={[
                        fs.hbarFill,
                        { width: `${v.oil.pct ?? 0}%` },
                        v.oil.level === "over" && { backgroundColor: colors.danger },
                        v.oil.level === "soon" && { backgroundColor: colors.warning },
                      ]}
                    />
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
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
          onClose={() => setOpenId(null)}
          onCreated={async (id) => {
            // โหลดก่อนค่อยเปิดคันใหม่ — ฟอร์มอ่านค่าตั้งต้นครั้งเดียวตอนเปิด ถ้ายังไม่มีข้อมูลจะได้ฟอร์มว่าง
            await load();
            setOpenId(id);
          }}
          onChanged={load}
        />
      ) : null}
    </>
  );
}

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
}: {
  vehicle: FleetVehicle | null;
  fleet: Fleet;
  onClose: () => void;
  onCreated: (id: number) => void | Promise<void>;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"info" | "docs" | "maint">("info");
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
  }));
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (t: string) => setF((p) => ({ ...p, [k]: t }));

  async function save() {
    if (!f.plateNumber.trim()) return showAlert("ข้อมูลไม่ครบ", "ต้องใส่ทะเบียนรถ");
    const num = (k: string) => {
      const t = f[k].replace(/[,\s]/g, "");
      return t === "" ? null : Number(t);
    };
    for (const k of ["currentMileage", "oilEveryKm", "oilEveryMonths", "lastOilKm"]) {
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
        <Field label="ผู้รับผิดชอบ" value={f.owner} onChange={set("owner")} />
      </View>
      <Field label="หมายเหตุ (ช่างเห็นตอนเลือกรถ)" value={f.note} onChange={set("note")} grow={false} placeholder="เช่น ยางอะไหล่อยู่ใต้กระบะ" />
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
