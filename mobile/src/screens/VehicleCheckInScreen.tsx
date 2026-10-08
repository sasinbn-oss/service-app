/**
 * ลงทะเบียนใช้รถ — แบบ OTTERI FLEET
 *
 * ไม่มีรถค้าง: เลือกรถจากการ์ด (ขั้น 1) → ลงเวลาใช้รถ (ขั้น 2: ไมล์ · ไปทำอะไร · รูปรอบคัน)
 * มีรถค้าง: หน้าคืนรถ (ไมล์ · รูป · ค่าใช้จ่าย · แจ้งซ่อม)
 *
 * กฎทั้งหมดตรวจซ้ำที่เซิร์ฟเวอร์ — หน้าจอตรวจไว้ก่อนเพื่อบอกทันทีที่พิมพ์
 * ไม่ใช่ให้กรอกครบแล้วค่อยโดนปฏิเสธ
 */
import React, { useCallback, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import Dropdown from "../components/Dropdown";
import VehiclePhotoSlots, { PhotoState, VehiclePhotoSlotsHandle } from "../components/VehiclePhotoSlots";
import { useAuth } from "../context/AuthContext";
import { showAlert } from "../utils/alert";
import { duration, fmtNum, VehicleLogRow } from "../utils/vehicles";
import { colors, headingFont, radius, shadow, spacing } from "../theme";

interface VehicleCard {
  id: number;
  plateNumber: string;
  name: string | null;
  type: string | null;
  status: string;
  statusLabel: string;
  note: string | null;
  currentMileage: number;
  activeBy: string | null;
  plannedForMe: boolean;
}

interface Status {
  activeLog: VehicleLogRow | null;
  vehicles: VehicleCard[];
  workOrders: { id: number; code: string; label: string; branch: string }[];
  rules: { minPhotos: number; maxPhotos: number; maxMileageDiff: number; photoLabels: string[]; purposes: string[] };
}

const EMPTY_PHOTOS: PhotoState = { ids: [], count: 0, uploading: 0, failed: 0 };

/** ผลตรวจเลขไมล์ทันทีที่พิมพ์ — กฎเดียวกับเซิร์ฟเวอร์ */
function checkMileage(raw: string, last: number, max: number, mode: "start" | "end") {
  const text = raw.replace(/[,\s]/g, "");
  if (!text) return { tone: "info" as const, ok: false, msg: `เลขไมล์ล่าสุด: ${fmtNum(last)} กม.` };
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0) return { tone: "bad" as const, ok: false, msg: "กรอกเป็นตัวเลขจำนวนเต็ม" };
  const d = n - last;
  if (mode === "end" && d < 0) return { tone: "bad" as const, ok: false, msg: `ต้องไม่น้อยกว่าตอนเบิก (${fmtNum(last)})` };
  if (Math.abs(d) > max) {
    return { tone: "bad" as const, ok: false, msg: `ต่างจากล่าสุด ${fmtNum(d)} กม. — เกิน ±${fmtNum(max)} กม. ตรวจเลขไมล์อีกครั้ง` };
  }
  if (mode === "end") return { tone: "ok" as const, ok: true, msg: `ระยะทางรอบนี้ +${fmtNum(d)} กม.` };
  return d === 0
    ? { tone: "ok" as const, ok: true, msg: "ตรงกับเลขไมล์ล่าสุดของรถ" }
    : { tone: "warn" as const, ok: true, msg: `ต่างจากล่าสุด ${d > 0 ? "+" : ""}${fmtNum(d)} กม. — แอดมินจะเห็นเป็นไมล์ไม่ต่อเนื่อง` };
}

function greeting() {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok", hour: "numeric", hour12: false }));
  return h < 12 ? "สวัสดีตอนเช้า" : h < 17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น";
}

export default function VehicleCheckInScreen() {
  const { user } = useAuth();
  const [data, setData] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<VehicleCard | null>(null);
  const [filter, setFilter] = useState<"" | "ok" | "busy">("");

  const load = useCallback(async () => {
    try {
      const res = await api.get<Status>("/vehicle-logs/status");
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
      <View style={styles.center}>
        <Spinner color={colors.primary} />
      </View>
    );
  }

  if (data.activeLog) {
    return <ReturnForm data={data} log={data.activeLog} onDone={load} />;
  }
  if (picked) {
    return (
      <CheckoutForm
        data={data}
        vehicle={picked}
        onBack={() => setPicked(null)}
        onDone={async () => {
          setPicked(null);
          await load();
        }}
      />
    );
  }

  const n = (st: string) => data.vehicles.filter((v) => v.status === st).length;
  const planned = data.vehicles.find((v) => v.plannedForMe && v.status === "AVAILABLE");
  // คันในแผนของทีมขึ้นก่อน แล้วคันว่าง แล้วคันที่ไม่ว่าง
  const list = data.vehicles
    .slice()
    .sort(
      (a, b) =>
        Number(b.plannedForMe) - Number(a.plannedForMe) ||
        Number(b.status === "AVAILABLE") - Number(a.status === "AVAILABLE") ||
        a.plateNumber.localeCompare(b.plateNumber)
    )
    .filter((v) => !filter || (filter === "ok" ? v.status === "AVAILABLE" : v.status !== "AVAILABLE"));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.welcome}>
        <View style={styles.row}>
          <Text style={styles.welcomeSmall}>{greeting()}</Text>
          <View style={[styles.tag, styles.tagOk]}>
            <Text style={[styles.tagText, styles.tagOkText]}>พร้อมเบิกรถ</Text>
          </View>
        </View>
        <Text style={[styles.welcomeName, headingFont]}>{user?.name}</Text>
        {user?.team ? <Text style={styles.welcomeSmall}>ทีม {user.team}</Text> : null}
        <View style={styles.wstats}>
          {[
            ["พร้อมเบิก", n("AVAILABLE")],
            ["กำลังใช้งาน", n("IN_USE")],
            ["ซ่อมบำรุง", n("MAINTENANCE")],
          ].map(([l, v]) => (
            <View key={l} style={styles.wstat}>
              <Text style={styles.wstatLabel}>{l}</Text>
              <Text style={[styles.wstatValue, headingFont]}>
                {v} <Text style={styles.wstatLabel}>คัน</Text>
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.row}>
        <Text style={[styles.title, headingFont]}>นำรถออกใช้งาน</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.muted}>ขั้นตอน 1/2 · เลือกรถ</Text>
      </View>

      {planned ? (
        <View style={[styles.notice, styles.noticeVio]}>
          <Ionicons name="calendar-outline" size={18} color={VIO_INK} />
          <Text style={[styles.noticeText, { color: VIO_INK }]}>
            แผนวันนี้จัดรถ <Text style={styles.bold}>{planned.plateNumber}</Text> ให้ทีมของคุณ — ดึงจากบอร์ดแผนงาน
            เลือกคันอื่นได้ถ้าจำเป็น
          </Text>
        </View>
      ) : null}
      <View style={styles.notice}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.primaryInk} />
        <Text style={styles.noticeText}>
          ถ่ายรูปรถอย่างน้อย <Text style={styles.bold}>{data.rules.minPhotos} รูป</Text> · เลขไมล์ต่างจากล่าสุดได้ไม่เกิน{" "}
          <Text style={styles.bold}>±{fmtNum(data.rules.maxMileageDiff)} กม.</Text> · ต้อง
          <Text style={styles.bold}>คืนรถคันเดิม</Text>ก่อนจึงเบิกคันใหม่ได้
        </Text>
      </View>

      {data.vehicles.length === 0 ? (
        <View style={styles.card}>
          <EmptyState icon="car-outline" text="ยังไม่มีรถในระบบ — แอดมินเพิ่มรถได้ที่ ทะเบียน & ซ่อมบำรุง" />
        </View>
      ) : (
        <>
          <View style={styles.chips}>
            {(
              [
                ["", `ทั้งหมด (${data.vehicles.length})`],
                ["ok", `ว่าง — เบิกได้ (${n("AVAILABLE")})`],
                ["busy", `ไม่ว่าง (${data.vehicles.length - n("AVAILABLE")})`],
              ] as const
            ).map(([v, l]) => (
              <TouchableOpacity key={v} style={[styles.chip, filter === v && styles.chipOn]} onPress={() => setFilter(v)}>
                <Text style={[styles.chipText, filter === v && styles.chipTextOn]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.vgrid}>
            {list.map((v) => (
              <VehicleTile key={v.id} v={v} onPick={() => setPicked(v)} />
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function VehicleTile({ v, onPick }: { v: VehicleCard; onPick: () => void }) {
  const ok = v.status === "AVAILABLE";
  const why = v.status === "IN_USE" ? `ไม่ว่าง — ใช้งานโดย ${v.activeBy ?? "คนอื่น"}` : "ซ่อมบำรุง — งดเบิกชั่วคราว";
  return (
    <View style={[styles.vcard, !ok && styles.vcardOff]}>
      <View style={styles.vhead}>
        <View style={[styles.vic, !ok && { backgroundColor: colors.dangerSoft }]}>
          <Ionicons name="car-outline" size={24} color={ok ? colors.primaryInk : colors.danger} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.plate, headingFont]}>{v.plateNumber}</Text>
          <Text style={styles.muted} numberOfLines={1}>
            {[v.name, v.type].filter(Boolean).join(" · ") || "—"}
          </Text>
        </View>
        <View style={[styles.tag, ok ? styles.tagOk : v.status === "IN_USE" ? styles.tagBad : styles.tagWarn]}>
          <Text style={[styles.tagText, ok ? styles.tagOkText : v.status === "IN_USE" ? styles.tagBadText : styles.tagWarnText]}>
            {ok ? "ว่าง" : v.statusLabel}
          </Text>
        </View>
      </View>
      {v.plannedForMe && ok ? (
        <View style={[styles.tag, { backgroundColor: VIO_BG, alignSelf: "flex-start" }]}>
          <Text style={[styles.tagText, { color: VIO_INK }]}>ในแผนทีมของคุณวันนี้</Text>
        </View>
      ) : null}
      <View style={styles.tiles}>
        <View style={styles.tileBox}>
          <Text style={styles.tileLabel}>เลขไมล์ล่าสุด</Text>
          <Text style={styles.tileValue}>{fmtNum(v.currentMileage)} กม.</Text>
        </View>
        <View style={styles.tileBox}>
          <Text style={styles.tileLabel}>{v.status === "IN_USE" ? "ผู้ใช้งานตอนนี้" : "หมายเหตุ"}</Text>
          <Text style={styles.tileValue} numberOfLines={1}>
            {v.status === "IN_USE" ? v.activeBy ?? "—" : v.note || "—"}
          </Text>
        </View>
      </View>
      {ok ? (
        <TouchableOpacity style={[styles.btn, styles.btnNavy]} onPress={onPick} accessibilityLabel={`เลือกรถ ${v.plateNumber}`}>
          <Ionicons name="key-outline" size={17} color="#fff" />
          <Text style={styles.btnText}>เลือกรถคันนี้</Text>
        </TouchableOpacity>
      ) : (
        <View style={[styles.btn, styles.btnLocked]}>
          <Text style={styles.btnLockedText}>{why}</Text>
        </View>
      )}
    </View>
  );
}

function MileageBox({
  value,
  onChange,
  last,
  max,
  mode,
  label,
}: {
  value: string;
  onChange: (t: string) => void;
  last: number;
  max: number;
  mode: "start" | "end";
  label: string;
}) {
  const c = checkMileage(value, last, max, mode);
  return (
    <>
      <View style={[styles.odo, c.tone === "bad" && { borderColor: colors.danger }]}>
        <Ionicons name="speedometer-outline" size={22} color={colors.primaryInk} />
        <TextInput
          style={[styles.odoInput, headingFont]}
          value={value}
          onChangeText={onChange}
          placeholder={String(last)}
          placeholderTextColor={colors.textFaint}
          keyboardType="number-pad"
          accessibilityLabel={label}
        />
        <Text style={styles.muted}>กม.</Text>
      </View>
      <Text style={[styles.mi, MI[c.tone]]}>{c.msg}</Text>
    </>
  );
}

function Step({ n, title, right }: { n: number; title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.stepN}>
        <Text style={[styles.stepNText, headingFont]}>{n}</Text>
      </View>
      <Text style={[styles.stepTitle, headingFont]}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

function photosReady(p: PhotoState, min: number) {
  if (p.count < min) return `ถ่ายรูปรถให้ครบอย่างน้อย ${min} รูป`;
  if (p.failed) return "มีรูปที่อัปไม่สำเร็จ — แตะรูปสีแดงเพื่อลองใหม่ หรือลบแล้วถ่ายใหม่";
  if (p.uploading) return `รอรูปอัปอีก ${p.uploading} รูป แล้วกดอีกครั้ง`;
  return null;
}

function CheckoutForm({
  data,
  vehicle,
  onBack,
  onDone,
}: {
  data: Status;
  vehicle: VehicleCard;
  onBack: () => void;
  onDone: () => void;
}) {
  const [mileage, setMileage] = useState("");
  const [purpose, setPurpose] = useState("");
  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");
  const [workOrderId, setWorkOrderId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoState>(EMPTY_PHOTOS);
  const [saving, setSaving] = useState(false);
  const slots = useRef<VehiclePhotoSlotsHandle>(null);
  const r = data.rules;

  async function submit() {
    const m = checkMileage(mileage, vehicle.currentMileage, r.maxMileageDiff, "start");
    const problem = !m.ok ? "ตรวจเลขไมล์ก่อน" : !purpose.trim() ? "บอกว่าไปทำอะไร" : photosReady(photos, r.minPhotos);
    if (problem) return showAlert("ยังบันทึกไม่ได้", problem);
    setSaving(true);
    try {
      await api.post(
        "/vehicle-logs/start",
        {
          vehicleId: vehicle.id,
          mileage: Number(mileage.replace(/[,\s]/g, "")),
          purpose: purpose.trim(),
          destination: destination.trim() || undefined,
          note: note.trim() || undefined,
          workOrderId: workOrderId ? Number(workOrderId) : null,
          photoIds: photos.ids,
        },
        { loadingText: "กำลังบันทึกการเบิกรถ..." }
      );
      showAlert("เบิกรถเรียบร้อย", `ลงเวลาใช้รถ ${vehicle.plateNumber} แล้ว ขับขี่ปลอดภัย`);
      onDone();
    } catch (e) {
      showAlert("เบิกรถไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.row}>
        <Text style={[styles.title, headingFont]}>ลงเวลาใช้รถ</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.muted}>ขั้นตอน 2/2 · ตรวจสภาพก่อนออก</Text>
      </View>
      <View style={styles.activeCar}>
        <View style={styles.vhead}>
          <View style={styles.vic}>
            <Ionicons name="car-outline" size={24} color={colors.primaryInk} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.plate, headingFont, { fontSize: 22 }]}>{vehicle.plateNumber}</Text>
            <Text style={styles.muted}>{[vehicle.name, vehicle.type].filter(Boolean).join(" · ") || "—"}</Text>
          </View>
          <View style={[styles.tag, styles.tagOk]}>
            <Text style={[styles.tagText, styles.tagOkText]}>ว่างพร้อมใช้</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Step
          n={1}
          title="เลขไมล์หน้าปัด"
          right={
            <View style={[styles.tag, styles.tagInfo]}>
              <Text style={[styles.tagText, { color: colors.primaryInk }]}>ไมล์ล่าสุด {fmtNum(vehicle.currentMileage)}</Text>
            </View>
          }
        />
        <MileageBox
          value={mileage}
          onChange={setMileage}
          last={vehicle.currentMileage}
          max={r.maxMileageDiff}
          mode="start"
          label="เลขไมล์ตอนเบิก"
        />
      </View>

      <View style={styles.card}>
        <Step n={2} title="ไปทำอะไร" />
        <View style={styles.chips}>
          {r.purposes.map((p) => (
            <TouchableOpacity key={p} style={[styles.chip, purpose === p && styles.chipOn]} onPress={() => setPurpose(p)}>
              <Text style={[styles.chipText, purpose === p && styles.chipTextOn]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={purpose}
          onChangeText={setPurpose}
          placeholder="หรือพิมพ์เอง"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="ไปทำอะไร"
        />
        <Text style={styles.label}>ใบงานที่จะไป (ไม่บังคับ)</Text>
        <Dropdown
          value={workOrderId}
          onChange={(v) => {
            setWorkOrderId(v || null);
            const wo = data.workOrders.find((w) => String(w.id) === v);
            if (wo && !destination) setDestination(wo.branch);
          }}
          placeholder={data.workOrders.length ? "— ไม่ระบุ —" : "ทีมของคุณไม่มีใบงานค้าง"}
          accessibilityLabel="ใบงานที่จะไป"
          options={[{ value: "", label: "— ไม่ระบุ —" }, ...data.workOrders.map((w) => ({ value: String(w.id), label: w.label }))]}
        />
        <Text style={styles.label}>ปลายทาง</Text>
        <TextInput
          style={styles.input}
          value={destination}
          onChangeText={setDestination}
          placeholder="เช่น C0001 สาขาทดสอบกรุงเทพ"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="ปลายทาง"
        />
        <Text style={styles.label}>หมายเหตุ (สภาพรถ / น้ำมัน)</Text>
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          placeholder="เช่น น้ำมันครึ่งถัง"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="หมายเหตุ"
        />
      </View>

      <View style={styles.card}>
        <Step n={3} title="รูปรอบคัน" />
        <VehiclePhotoSlots
          ref={slots}
          phase="START"
          min={r.minPhotos}
          max={r.maxPhotos}
          labels={r.photoLabels}
          onChange={setPhotos}
        />
      </View>

      <TouchableOpacity style={[styles.btn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
        <Ionicons name="key-outline" size={17} color="#fff" />
        <Text style={styles.btnText}>ยืนยันนำรถออกใช้งาน</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btn, styles.btnGhost]}
        onPress={() => {
          const leave = () => {
            slots.current?.discardAll();
            onBack();
          };
          if (!photos.count) return leave();
          showAlert("กลับไปเลือกรถ", "รูปที่ถ่ายไว้จะหายไป", [
            { text: "อยู่ต่อ", style: "cancel" },
            { text: "กลับไปเลือกรถ", style: "destructive", onPress: leave },
          ]);
        }}
      >
        <Text style={styles.btnGhostText}>ยกเลิก / เลือกรถคันอื่น</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function ReturnForm({ data, log, onDone }: { data: Status; log: VehicleLogRow; onDone: () => void }) {
  const [mileage, setMileage] = useState("");
  const [cost, setCost] = useState("");
  const [repairNote, setRepairNote] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<PhotoState>(EMPTY_PHOTOS);
  const [saving, setSaving] = useState(false);
  const r = data.rules;

  async function submit() {
    const m = checkMileage(mileage, log.startMileage, r.maxMileageDiff, "end");
    const problem = !m.ok ? "ตรวจเลขไมล์ก่อน" : photosReady(photos, r.minPhotos);
    if (problem) return showAlert("ยังบันทึกไม่ได้", problem);
    const end = Number(mileage.replace(/[,\s]/g, ""));
    setSaving(true);
    try {
      await api.post(
        `/vehicle-logs/${log.id}/end`,
        {
          mileage: end,
          cost: cost.trim() ? Number(cost.replace(/[,\s]/g, "")) : null,
          repairNote: repairNote.trim() || undefined,
          note: note.trim() || undefined,
          photoIds: photos.ids,
        },
        { loadingText: "กำลังบันทึกการคืนรถ..." }
      );
      showAlert("คืนรถเรียบร้อย", `ระยะทาง ${fmtNum(end - log.startMileage)} กม. ขอบคุณครับ`);
      onDone();
    } catch (e) {
      showAlert("คืนรถไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[styles.title, headingFont]}>คืนรถ</Text>
      <View style={[styles.notice, styles.noticeWarn]}>
        <Ionicons name="alert-circle-outline" size={18} color={colors.warningInk} />
        <Text style={[styles.noticeText, { color: colors.warningInk }]}>
          ต้องคืนรถคันนี้และถ่ายรูปตรวจสภาพครบ {r.minPhotos} รูปก่อน จึงจะเบิกรถคันใหม่ได้
        </Text>
      </View>
      <View style={styles.activeCar}>
        <View style={styles.vhead}>
          <View style={styles.vic}>
            <Ionicons name="car-outline" size={24} color={colors.primaryInk} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.plate, headingFont, { fontSize: 22 }]}>{log.plateNumber}</Text>
            <Text style={styles.muted}>{[log.vehicleName, log.vehicleType].filter(Boolean).join(" · ") || "—"}</Text>
          </View>
          <View style={[styles.tag, styles.tagInfo]}>
            <Text style={[styles.tagText, { color: colors.primaryInk }]}>กำลังใช้งาน</Text>
          </View>
        </View>
        <View style={styles.bento}>
          {[
            ["ระยะเวลาใช้งาน", duration(log.startedAt)],
            ["เลขไมล์เริ่มต้น", `${fmtNum(log.startMileage)} กม.`],
            ["ไปทำอะไร", log.purpose],
            [log.workOrder ? "ใบงาน" : "ปลายทาง", log.workOrder ? `${log.workOrder.code} · ${log.workOrder.branch}` : log.destination || "—"],
          ].map(([l, v]) => (
            <View key={l} style={styles.bentoBox}>
              <Text style={styles.tileLabel}>{l}</Text>
              <Text style={styles.tileValue} numberOfLines={2}>
                {v}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Step n={1} title="เลขไมล์ตอนคืนรถ" />
        <MileageBox
          value={mileage}
          onChange={setMileage}
          last={log.startMileage}
          max={r.maxMileageDiff}
          mode="end"
          label="เลขไมล์ตอนคืน"
        />
      </View>
      <View style={styles.card}>
        <Step n={2} title="รูปตรวจสภาพตอนคืน" />
        <VehiclePhotoSlots phase="END" min={r.minPhotos} max={r.maxPhotos} labels={r.photoLabels} onChange={setPhotos} />
      </View>
      <View style={styles.card}>
        <Step n={3} title="ค่าใช้จ่าย & แจ้งซ่อม" />
        <Text style={styles.label}>ค่าใช้จ่ายรอบนี้ (บาท)</Text>
        <TextInput
          style={styles.input}
          value={cost}
          onChangeText={setCost}
          keyboardType="number-pad"
          placeholder="เช่น เติมน้ำมัน ทางด่วน ค่าจอด — ไม่มีเว้นว่าง"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="ค่าใช้จ่าย"
        />
        <Text style={styles.label}>แจ้งซ่อม (ถ้ามี)</Text>
        <TextInput
          style={styles.input}
          value={repairNote}
          onChangeText={setRepairNote}
          placeholder="เช่น ไฟเบรกหลังขวาไม่ติด — แอดมินเห็นในหน้าซ่อมบำรุงทันที"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="แจ้งซ่อม"
        />
        <Text style={styles.label}>หมายเหตุ / จุดจอดคืน</Text>
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          placeholder="เช่น จอดที่ศูนย์ลาดพร้าว"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="หมายเหตุคืนรถ"
        />
      </View>
      <TouchableOpacity style={[styles.btn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
        <Ionicons name="checkmark-done" size={17} color="#fff" />
        <Text style={styles.btnText}>ยืนยันคืนรถ</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const VIO_BG = "#F3E8FF";
const VIO_INK = "#6B21A8";
const MI = {
  info: { backgroundColor: colors.tile, color: colors.body },
  ok: { backgroundColor: colors.successSoft, color: colors.successInk },
  warn: { backgroundColor: colors.warningSoft, color: colors.warningInk },
  bad: { backgroundColor: colors.dangerSoft, color: colors.dangerInk },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48, maxWidth: 1100, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  title: { fontSize: 22, lineHeight: 32, fontWeight: "700", color: colors.text },
  muted: { fontSize: 12.5, color: colors.textMuted },
  bold: { fontWeight: "700" },
  welcome: { backgroundColor: colors.navy, borderRadius: radius.xl, padding: spacing.lg, gap: 6 },
  welcomeSmall: { color: "rgba(255,255,255,0.85)", fontSize: 13 },
  welcomeName: { color: "#fff", fontSize: 22, fontWeight: "700" },
  wstats: { flexDirection: "row", gap: spacing.sm, marginTop: 6 },
  wstat: { flex: 1, backgroundColor: "rgba(255,255,255,0.13)", borderRadius: radius.md, padding: 10 },
  wstatLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12 },
  wstatValue: { color: "#fff", fontSize: 20, fontWeight: "700" },
  notice: { flexDirection: "row", gap: 10, backgroundColor: colors.sky50, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 12 },
  noticeVio: { backgroundColor: VIO_BG, borderColor: "transparent" },
  noticeWarn: { backgroundColor: colors.warningSoft, borderColor: "transparent" },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.body },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.body },
  chipTextOn: { color: "#fff", fontWeight: "700" },
  vgrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  vcard: { flexGrow: 1, flexBasis: 260, maxWidth: "100%", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 14, gap: 10, ...shadow.card },
  vcardOff: { opacity: 0.65 },
  vhead: { flexDirection: "row", alignItems: "center", gap: 10 },
  vic: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  plate: { fontSize: 18, fontWeight: "800", color: colors.text },
  tag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  tagText: { fontSize: 12, fontWeight: "700" },
  tagOk: { backgroundColor: colors.successSoft },
  tagOkText: { color: colors.successInk },
  tagWarn: { backgroundColor: colors.warningSoft },
  tagWarnText: { color: colors.warningInk },
  tagBad: { backgroundColor: colors.dangerSoft },
  tagBadText: { color: colors.dangerInk },
  tagInfo: { backgroundColor: colors.primarySoft },
  tiles: { flexDirection: "row", gap: spacing.sm },
  tileBox: { flex: 1, backgroundColor: colors.tile, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 7, minWidth: 0 },
  tileLabel: { fontSize: 12, color: colors.textMuted },
  tileValue: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  btn: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 },
  btnNavy: { backgroundColor: colors.navy },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14.5 },
  btnLocked: { backgroundColor: colors.tile },
  btnLockedText: { color: colors.textFaint, fontWeight: "700", fontSize: 13 },
  btnGhost: { backgroundColor: colors.sky50, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.navy, fontWeight: "700" },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm, ...shadow.card },
  activeCar: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 2, borderColor: colors.primary, padding: spacing.lg, gap: spacing.md },
  bento: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  bentoBox: { flexGrow: 1, flexBasis: 140, backgroundColor: colors.tile, borderRadius: radius.md, padding: 10, minWidth: 0 },
  stepN: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.navy, alignItems: "center", justifyContent: "center" },
  stepNText: { color: "#fff", fontWeight: "700" },
  stepTitle: { fontSize: 15.5, fontWeight: "700", color: colors.text },
  odo: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 2, borderColor: colors.primary, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.card },
  odoInput: { flex: 1, minWidth: 0, fontSize: 26, fontWeight: "800", color: colors.text, paddingVertical: 4 },
  mi: { fontSize: 13, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, overflow: "hidden" },
  label: { fontSize: 13, fontWeight: "600", color: colors.text, marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text, backgroundColor: colors.card },
});
