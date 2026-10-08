/**
 * ประวัติการใช้รถ (แอดมิน) — ทุกคน ทุกคัน กรองรายเดือน ส่งออก Excel
 *
 * แก้รายการได้ (ช่างกรอกไมล์ผิด) — เซิร์ฟเวอร์คิดระยะใหม่และขยับเลขไมล์ของรถให้
 * ถ้าเป็นรายการล่าสุด ไม่งั้นการเบิกครั้งถัดไปจะถูกตรวจกับเลขที่ผิด
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import AppModal from "../components/AppModal";
import Dropdown from "../components/Dropdown";
import EmptyState from "../components/EmptyState";
import Spinner from "../components/Spinner";
import { ForceReturnModal, fs, LogDetailModal, LogStatusTag, Tag } from "../components/FleetUI";
import { showAlert } from "../utils/alert";
import { openUrl } from "../utils/share";
import { fmtDT, fmtNum, VehicleLogRow } from "../utils/vehicles";
import { colors, headingFont } from "../theme";

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function thisMonth() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
}
function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y + 543}`;
}

export default function VehicleLogAdminScreen() {
  const [month, setMonth] = useState(thisMonth());
  const [status, setStatus] = useState<"" | "ONGOING" | "COMPLETED">("");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<VehicleLogRow[] | null>(null);
  const [vehicles, setVehicles] = useState<{ value: string; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<VehicleLogRow | null>(null);
  const [edit, setEdit] = useState<VehicleLogRow | null>(null);
  const [returning, setReturning] = useState<VehicleLogRow | null>(null);
  const seq = useRef(0);

  // พิมพ์ค้นหาแล้วรอให้หยุดพิมพ์ก่อน ไม่ยิงทุกตัวอักษร
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const params = useCallback(
    () => ({
      ...monthRange(month),
      ...(status ? { status } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      ...(term ? { q: term } : {}),
    }),
    [month, status, vehicleId, term]
  );

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const res = await api.get<VehicleLogRow[]>("/vehicle-logs", { params: params() });
      if (my === seq.current) (setRows(res.data), setError(null));
    } catch (e) {
      if (my === seq.current) setError(apiErrorMessage(e));
    }
  }, [params]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useEffect(() => {
    api
      .get<{ id: number; plateNumber: string }[]>("/vehicles")
      .then((r) => setVehicles(r.data.map((v) => ({ value: String(v.id), label: v.plateNumber }))))
      .catch(() => {});
  }, []);

  async function exportExcel() {
    try {
      const res = await api.get<{ path: string; count: number }>("/vehicle-logs/export", { params: params() });
      if (!res.data.count) return showAlert("ไม่มีข้อมูล", "ไม่มีรายการตามตัวกรองนี้");
      await openUrl(resolveImageUrl(res.data.path)!);
    } catch (e) {
      showAlert("ส่งออกไม่สำเร็จ", apiErrorMessage(e));
    }
  }

  function remove(l: VehicleLogRow) {
    showAlert(
      "ลบรายการนี้?",
      `${l.plateNumber} · ${l.userName} · ${fmtDT(l.startedAt)}\nรูปของรายการนี้จะถูกลบด้วย${l.status === "ONGOING" ? " และรถจะกลับเป็นว่าง" : ""}`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ลบ",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/vehicle-logs/${l.id}`);
              load();
            } catch (e) {
              showAlert("ลบไม่สำเร็จ", apiErrorMessage(e));
            }
          },
        },
      ]
    );
  }

  const km = (rows ?? []).reduce((s, l) => s + (l.distance ?? 0), 0);
  const cost = (rows ?? []).reduce((s, l) => s + (l.cost ?? 0), 0);

  const header = (
    <View style={{ gap: 12 }}>
      <View style={fs.row}>
        <Text style={[fs.title, headingFont]}>ประวัติการใช้รถ</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={[fs.btn, fs.btnGhost]} onPress={exportExcel}>
          <Ionicons name="download-outline" size={16} color={colors.navy} />
          <Text style={fs.btnGhostText}>ส่งออก Excel</Text>
        </TouchableOpacity>
      </View>
      <View style={fs.card}>
        <View style={fs.row}>
          <TouchableOpacity style={[fs.btn, fs.btnGhost, fs.small]} onPress={() => setMonth(shiftMonth(month, -1))} accessibilityLabel="เดือนก่อน">
            <Ionicons name="chevron-back" size={16} color={colors.navy} />
          </TouchableOpacity>
          <Text style={[fs.bold, { minWidth: 90, textAlign: "center" }]}>{monthLabel(month)}</Text>
          <TouchableOpacity style={[fs.btn, fs.btnGhost, fs.small]} onPress={() => setMonth(shiftMonth(month, 1))} accessibilityLabel="เดือนถัดไป">
            <Ionicons name="chevron-forward" size={16} color={colors.navy} />
          </TouchableOpacity>
          <View style={fs.chips}>
            {(
              [
                ["", "ทั้งหมด"],
                ["ONGOING", "ยังไม่คืน"],
                ["COMPLETED", "คืนแล้ว"],
              ] as const
            ).map(([v, l]) => (
              <TouchableOpacity key={v} style={[fs.chip, status === v && fs.chipOn]} onPress={() => setStatus(v)}>
                <Text style={[fs.chipText, status === v && fs.chipTextOn]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={fs.row}>
          <TextInput
            style={[fs.input, { flex: 1, minWidth: 180 }]}
            value={q}
            onChangeText={setQ}
            placeholder="ค้นหาชื่อช่าง ทะเบียน ปลายทาง..."
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="ค้นหา"
          />
          <View style={{ minWidth: 180, flex: 1 }}>
            <Dropdown value={vehicleId} options={vehicles} onChange={setVehicleId} placeholder="รถทุกคัน" clearable accessibilityLabel="กรองตามรถ" />
          </View>
        </View>
        {rows ? (
          <Text style={fs.muted}>
            {fmtNum(rows.length)} รายการ · รวม {fmtNum(km)} กม. · ค่าใช้จ่าย ฿{fmtNum(cost)}
            {rows.length >= 1000 ? " · แสดง 1,000 รายการแรก กรองให้แคบลงหรือส่งออก Excel" : ""}
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <>
      <FlatList
        style={fs.container}
        contentContainerStyle={fs.content}
        data={rows ?? []}
        keyExtractor={(l) => String(l.id)}
        ListHeaderComponent={header}
        ListEmptyComponent={
          rows === null ? (
            error ? <Text style={fs.error}>{error}</Text> : <Spinner color={colors.primary} />
          ) : (
            <EmptyState icon="car-outline" text="ไม่มีรายการในเดือนนี้" />
          )
        }
        renderItem={({ item: l }) => (
          <View style={[fs.card, { gap: 6 }]}>
            <View style={fs.row}>
              <Text style={[fs.plate, headingFont]}>{l.plateNumber}</Text>
              <Text style={fs.body}>{l.userName}</Text>
              <LogStatusTag log={l} />
              {l.mileageGap ? <Tag tone="warn">ไมล์ไม่ต่อเนื่อง {l.mileageGap > 0 ? "+" : ""}{fmtNum(l.mileageGap)}</Tag> : null}
              {l.repairNote ? <Tag tone="bad">แจ้งซ่อม</Tag> : null}
              {l.returnedByName ? <Tag tone="mute">คืนแทนโดย {l.returnedByName}</Tag> : null}
              <View style={{ flex: 1 }} />
              <Text style={fs.bold}>{l.distance === null ? "—" : `${fmtNum(l.distance)} กม.`}</Text>
            </View>
            <Text style={fs.body}>
              {l.purpose}
              {l.destination ? ` · ${l.destination}` : ""}
              {l.workOrder ? ` · ${l.workOrder.code}` : ""}
            </Text>
            <Text style={fs.muted}>
              เบิก {fmtDT(l.startedAt)} {l.endedAt ? `· คืน ${fmtDT(l.endedAt)}` : ""} · ไมล์ {fmtNum(l.startMileage)} →{" "}
              {l.endMileage === null ? "…" : fmtNum(l.endMileage)}
              {l.cost ? ` · ฿${fmtNum(l.cost)}` : ""} · รูป {l.photoCount}
            </Text>
            <View style={fs.row}>
              <TouchableOpacity style={[fs.btn, fs.btnGhost, fs.small]} onPress={() => setView(l)}>
                <Text style={fs.btnGhostText}>ดูรูป / รายละเอียด</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[fs.btn, fs.btnGhost, fs.small]} onPress={() => setEdit(l)}>
                <Text style={fs.btnGhostText}>แก้ไข</Text>
              </TouchableOpacity>
              {l.status === "ONGOING" ? (
                <TouchableOpacity style={[fs.btn, fs.small]} onPress={() => setReturning(l)}>
                  <Text style={fs.btnText}>คืนแทน</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={[fs.btn, fs.btnDanger, fs.small]} onPress={() => remove(l)}>
                <Text style={fs.btnDangerText}>ลบ</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
      <LogDetailModal log={view} onClose={() => setView(null)} />
      <ForceReturnModal
        log={returning}
        onClose={() => setReturning(null)}
        onDone={() => {
          setReturning(null);
          load();
        }}
      />
      <EditLogModal
        log={edit}
        onClose={() => setEdit(null)}
        onDone={() => {
          setEdit(null);
          load();
        }}
      />
    </>
  );
}

function EditLogModal({ log, onClose, onDone }: { log: VehicleLogRow | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!log) return;
    setF({
      purpose: log.purpose,
      destination: log.destination ?? "",
      note: log.note ?? "",
      returnNote: log.returnNote ?? "",
      startMileage: String(log.startMileage),
      endMileage: log.endMileage === null ? "" : String(log.endMileage),
      cost: log.cost === null ? "" : String(log.cost),
    });
  }, [log?.id]);
  if (!log) return null;

  const num = (s: string | undefined) => (s && s.trim() !== "" ? Number(s.replace(/[,\s]/g, "")) : null);

  async function save() {
    const start = num(f.startMileage);
    const end = num(f.endMileage);
    const cost = num(f.cost);
    if (!f.purpose?.trim()) return showAlert("ข้อมูลไม่ครบ", "ต้องมีว่าไปทำอะไร");
    if (start === null || !Number.isInteger(start) || start < 0) return showAlert("ตรวจเลขไมล์", "เลขไมล์ตอนเบิกไม่ถูกต้อง");
    if (end !== null && (!Number.isInteger(end) || end < start)) return showAlert("ตรวจเลขไมล์", "เลขไมล์ตอนคืนต้องไม่น้อยกว่าตอนเบิก");
    if (cost !== null && (!Number.isInteger(cost) || cost < 0)) return showAlert("ตรวจค่าใช้จ่าย", "ใส่เป็นจำนวนเต็มบาท");
    setBusy(true);
    try {
      await api.patch(`/vehicle-logs/${log!.id}`, {
        purpose: f.purpose.trim(),
        destination: f.destination.trim() || null,
        note: f.note.trim() || null,
        returnNote: f.returnNote.trim() || null,
        startMileage: start,
        endMileage: end,
        cost,
      });
      onDone();
    } catch (e) {
      showAlert("บันทึกไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: string, label: string, numeric?: boolean, disabled?: boolean) => (
    <View key={key}>
      <Text style={fs.label}>{label}</Text>
      <TextInput
        style={[fs.input, disabled && { backgroundColor: colors.tile, color: colors.textFaint }]}
        value={f[key] ?? ""}
        onChangeText={(t) => setF((p) => ({ ...p, [key]: t }))}
        keyboardType={numeric ? "number-pad" : "default"}
        editable={!disabled}
        accessibilityLabel={label}
      />
    </View>
  );

  return (
    <AppModal
      visible
      onClose={onClose}
      busy={busy}
      title={`แก้ไขรายการ ${log.plateNumber}`}
      subtitle={`${log.userName} · เบิก ${fmtDT(log.startedAt)}`}
      footer={
        <View style={fs.modalActions}>
          <TouchableOpacity style={[fs.btn, fs.btnGhost]} onPress={onClose} disabled={busy}>
            <Text style={fs.btnGhostText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity style={fs.btn} onPress={save} disabled={busy}>
            <Text style={fs.btnText}>บันทึก</Text>
          </TouchableOpacity>
        </View>
      }
    >
      {field("purpose", "ไปทำอะไร")}
      {field("destination", "ปลายทาง")}
      {field("startMileage", "เลขไมล์ตอนเบิก", true)}
      {/* รายการที่ยังไม่คืนไม่มีไมล์ตอนคืน — ให้ใช้ "คืนแทน" แทน */}
      {field("endMileage", log.status === "ONGOING" ? "เลขไมล์ตอนคืน (ยังไม่คืน)" : "เลขไมล์ตอนคืน", true, log.status === "ONGOING")}
      {field("cost", "ค่าใช้จ่าย (บาท)", true)}
      {field("note", "หมายเหตุตอนเบิก")}
      {field("returnNote", "หมายเหตุตอนคืน")}
    </AppModal>
  );
}
