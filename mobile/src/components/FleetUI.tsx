/**
 * ชิ้นส่วนหน้าตาที่หน้ารถทุกหน้าใช้ร่วมกัน (ประวัติของฉัน · ภาพรวมรถ · ประวัติการใช้รถ · ทะเบียน & ซ่อมบำรุง)
 *
 * แยกออกมาเพราะสีป้ายต้องตรงกันทุกหน้า — "ไม่ว่าง" หน้าหนึ่งแดงอีกหน้าเหลือง
 * แอดมินจะอ่านผิดว่าเป็นคนละสถานะ
 */
import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import AppModal from "./AppModal";
import Spinner from "./Spinner";
import { duration, fmtDT, fmtNum, openSigned, VehicleLogRow } from "../utils/vehicles";
import { colors, headingFont, radius, shadow, spacing } from "../theme";

export type Tone = "ok" | "warn" | "bad" | "info" | "mute";

const TONE: Record<Tone, { bg: string; fg: string }> = {
  ok: { bg: colors.successSoft, fg: colors.successInk },
  warn: { bg: colors.warningSoft, fg: colors.warningInk },
  bad: { bg: colors.dangerSoft, fg: colors.dangerInk },
  info: { bg: colors.primarySoft, fg: colors.primaryInk },
  mute: { bg: colors.tile, fg: colors.textMuted },
};

export function Tag({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <View style={[fs.tag, { backgroundColor: TONE[tone].bg }]}>
      <Text style={[fs.tagText, { color: TONE[tone].fg }]}>{children}</Text>
    </View>
  );
}

export function vehicleTone(status: string): Tone {
  return status === "AVAILABLE" ? "ok" : status === "IN_USE" ? "info" : status === "MAINTENANCE" ? "warn" : "mute";
}

export function LogStatusTag({ log }: { log: Pick<VehicleLogRow, "status"> }) {
  return log.status === "ONGOING" ? <Tag tone="info">ยังไม่คืน</Tag> : <Tag tone="ok">คืนแล้ว</Tag>;
}

export function Kpi({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: string;
  tone?: "navy" | "warn" | "bad";
}) {
  const dark = tone === "navy";
  return (
    <View
      style={[
        fs.kpi,
        dark && { backgroundColor: colors.navy, borderColor: colors.navy },
        tone === "warn" && { backgroundColor: colors.warningSoft, borderColor: "transparent" },
        tone === "bad" && { backgroundColor: colors.dangerSoft, borderColor: "transparent" },
      ]}
    >
      <Text style={[fs.kpiLabel, dark && { color: "rgba(255,255,255,0.8)" }]}>{label}</Text>
      <Text
        style={[
          fs.kpiValue,
          headingFont,
          dark && { color: "#fff" },
          tone === "warn" && { color: colors.warningInk },
          tone === "bad" && { color: colors.dangerInk },
        ]}
      >
        {value}
        {unit ? <Text style={[fs.kpiUnit, dark && { color: "rgba(255,255,255,0.8)" }]}> {unit}</Text> : null}
      </Text>
      {hint ? <Text style={[fs.kpiLabel, dark && { color: "rgba(255,255,255,0.8)" }]}>{hint}</Text> : null}
    </View>
  );
}

export function Notice({
  tone = "info",
  icon,
  children,
}: {
  tone?: Tone;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  children: React.ReactNode;
}) {
  return (
    <View style={[fs.notice, tone !== "info" && { backgroundColor: TONE[tone].bg, borderColor: "transparent" }]}>
      <Ionicons name={icon} size={18} color={TONE[tone].fg} />
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

/** รายละเอียดการใช้รถหนึ่งครั้ง + รูปตอนเบิก/ตอนคืน — แตะรูปเปิดเต็มผ่านลิงก์ชั่วคราว */
export function LogDetailModal({
  log,
  onClose,
  footer,
}: {
  log: VehicleLogRow | null;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  const [photos, setPhotos] = useState<{ id: number; phase: string; thumbnailDataUrl: string | null }[] | null>(null);

  useEffect(() => {
    if (!log) return;
    let cancelled = false;
    setPhotos(null);
    api
      .get(`/vehicle-logs/${log.id}/photos`)
      .then((r) => !cancelled && setPhotos(r.data))
      .catch(() => !cancelled && setPhotos([]));
    return () => {
      cancelled = true;
    };
  }, [log?.id]);

  if (!log) return null;
  const rows: [string, React.ReactNode][] = [
    ["ช่าง", `${log.userName}${log.userTeam ? ` · ${log.userTeam}` : ""}`],
    ["ไปทำอะไร", log.purpose],
    ["ปลายทาง", log.destination || "—"],
    ["ใบงาน", log.workOrder ? `${log.workOrder.code} · ${log.workOrder.title}` : "—"],
    ["เบิก", fmtDT(log.startedAt)],
    ["คืน", log.endedAt ? `${fmtDT(log.endedAt)} · ใช้ ${duration(log.startedAt, log.endedAt)}` : `ยังไม่คืน · ${duration(log.startedAt)}`],
    ["เลขไมล์", `${fmtNum(log.startMileage)} → ${log.endMileage === null ? "…" : fmtNum(log.endMileage)}`],
    ["ระยะทาง", log.distance === null ? "—" : `${fmtNum(log.distance)} กม.`],
    ["ค่าใช้จ่าย", log.cost ? `฿${fmtNum(log.cost)}` : "—"],
    ["หมายเหตุตอนเบิก", log.note || "—"],
    ["หมายเหตุตอนคืน", log.returnNote || "—"],
  ];
  if (log.mileageGap) rows.push(["ไมล์ไม่ต่อเนื่อง", `${log.mileageGap > 0 ? "+" : ""}${fmtNum(log.mileageGap)} กม. จากที่คืนครั้งก่อน`]);
  if (log.repairNote) rows.push(["แจ้งซ่อม", log.repairNote]);
  if (log.returnedByName) rows.push(["คืนแทนโดย", log.returnedByName]);

  return (
    <AppModal
      visible
      onClose={onClose}
      title={log.plateNumber}
      subtitle={log.vehicleName ?? undefined}
      footer={footer}
    >
      <View style={{ gap: 6 }}>
        {rows.map(([k, v]) => (
          <View key={k} style={fs.kv}>
            <Text style={fs.kvKey}>{k}</Text>
            <Text style={fs.kvVal}>{v}</Text>
          </View>
        ))}
      </View>
      {(["START", "END"] as const).map((phase) => {
        const list = photos?.filter((p) => p.phase === phase) ?? [];
        return (
          <View key={phase} style={{ gap: 6, marginTop: spacing.md }}>
            <Text style={fs.section}>{phase === "START" ? "รูปตอนเบิก" : "รูปตอนคืน"}</Text>
            {photos === null ? (
              <Spinner color={colors.primary} />
            ) : list.length === 0 ? (
              <Text style={fs.muted}>ไม่มีรูป</Text>
            ) : (
              <View style={fs.thumbs}>
                {list.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={fs.thumb}
                    onPress={() => openSigned(`/vehicle-logs/photos/${p.id}/link`)}
                    accessibilityLabel={`เปิดรูป ${p.id}`}
                  >
                    {p.thumbnailDataUrl ? (
                      <Image source={{ uri: p.thumbnailDataUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : (
                      <Ionicons name="image-outline" size={22} color={colors.textFaint} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </AppModal>
  );
}

/**
 * แอดมินคืนรถแทนช่างที่ลืมกด — ไม่ต้องมีรูป แต่ต้องมีเลขไมล์
 * เพราะเลขไมล์ของรถคือจุดตั้งต้นที่การเบิกครั้งถัดไปถูกตรวจ
 */
export function ForceReturnModal({
  log,
  onClose,
  onDone,
}: {
  log: VehicleLogRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mileage, setMileage] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setMileage("");
    setNote("");
  }, [log?.id]);
  if (!log) return null;
  const n = Number(mileage.replace(/[,\s]/g, ""));
  const bad = mileage !== "" && (!Number.isInteger(n) || n < log.startMileage);

  async function save() {
    if (!mileage || bad) return showAlert("ตรวจเลขไมล์", `ต้องเป็นตัวเลข และไม่น้อยกว่าตอนเบิก (${fmtNum(log!.startMileage)})`);
    setBusy(true);
    try {
      await api.post(`/vehicle-logs/${log!.id}/force-return`, { mileage: n, note: note || undefined }, { loadingText: "กำลังคืนรถ..." });
      onDone();
    } catch (e) {
      showAlert("คืนรถไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppModal
      visible
      onClose={onClose}
      busy={busy}
      title={`คืนรถแทน ${log.plateNumber}`}
      subtitle={`${log.userName} · เบิกเมื่อ ${fmtDT(log.startedAt)} · ไมล์ออก ${fmtNum(log.startMileage)}`}
      footer={
        <View style={fs.modalActions}>
          <TouchableOpacity style={[fs.btn, fs.btnGhost]} onPress={onClose} disabled={busy}>
            <Text style={fs.btnGhostText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity style={fs.btn} onPress={save} disabled={busy}>
            <Text style={fs.btnText}>ยืนยันคืนรถ</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <Text style={fs.label}>เลขไมล์ตอนคืน (กม.)</Text>
      <TextInput
        style={[fs.input, bad && { borderColor: colors.danger }]}
        value={mileage}
        onChangeText={setMileage}
        keyboardType="number-pad"
        placeholder={String(log.startMileage)}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="เลขไมล์ตอนคืน"
      />
      {mileage && !bad ? <Text style={fs.muted}>ระยะทางรอบนี้ +{fmtNum(n - log.startMileage)} กม.</Text> : null}
      <Text style={fs.label}>หมายเหตุ</Text>
      <TextInput
        style={fs.input}
        value={note}
        onChangeText={setNote}
        placeholder="เช่น ช่างโทรแจ้งว่าจอดคืนแล้ว"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="หมายเหตุการคืนแทน"
      />
    </AppModal>
  );
}

export const fs = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48, maxWidth: 1200, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  title: { fontSize: 22, lineHeight: 32, fontWeight: "700", color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted },
  section: { fontSize: 15.5, fontWeight: "700", color: colors.text },
  muted: { fontSize: 12.5, color: colors.textMuted },
  bold: { fontWeight: "700", color: colors.text },
  body: { fontSize: 13.5, color: colors.body, lineHeight: 20 },
  error: { color: colors.dangerInk, textAlign: "center" },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm, ...shadow.card },
  tag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, alignSelf: "flex-start" },
  tagText: { fontSize: 12, fontWeight: "700" },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  kpi: { flexGrow: 1, flexBasis: 150, minWidth: 0, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 12, gap: 2 },
  kpiLabel: { fontSize: 12, color: colors.textMuted },
  kpiValue: { fontSize: 24, fontWeight: "800", color: colors.text },
  kpiUnit: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  notice: { flexDirection: "row", gap: 10, backgroundColor: colors.sky50, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.body },
  chipTextOn: { color: "#fff", fontWeight: "700" },
  btn: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnGhost: { backgroundColor: colors.sky50, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.navy, fontWeight: "700", fontSize: 13.5 },
  btnDanger: { backgroundColor: colors.dangerSoft },
  btnDangerText: { color: colors.dangerInk, fontWeight: "700", fontSize: 13.5 },
  small: { paddingVertical: 6, paddingHorizontal: 10 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: colors.text, backgroundColor: colors.card },
  label: { fontSize: 13, fontWeight: "600", color: colors.text, marginTop: 4 },
  /** แถวรายการแบบการ์ด — ใช้ทั้งจอแคบและจอกว้าง ตารางกว้างบนมือถือต้องเลื่อนข้างซึ่งช่างไม่ชอบ */
  item: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10, gap: 4 },
  plate: { fontSize: 16, fontWeight: "800", color: colors.text },
  hbar: { flex: 1, height: 8, borderRadius: 99, backgroundColor: colors.tile, overflow: "hidden" },
  hbarFill: { height: "100%", backgroundColor: colors.primary, borderRadius: 99 },
  kv: { flexDirection: "row", gap: spacing.sm },
  kvKey: { width: 120, fontSize: 13, color: colors.textMuted },
  kvVal: { flex: 1, fontSize: 13.5, color: colors.text },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  thumb: { width: 92, height: 72, borderRadius: radius.sm, overflow: "hidden", backgroundColor: colors.tile, alignItems: "center", justifyContent: "center" },
  modalActions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end", flexWrap: "wrap" },
});
