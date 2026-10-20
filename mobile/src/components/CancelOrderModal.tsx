/**
 * ยกเลิกใบงาน — แอดมิน และหัวหน้าภาคในพื้นที่ (เจ้าของงานเลือก ต.ค. 69)
 *
 * เดิมแอปไม่มีปุ่มนี้ มีแต่ "ลบถาวร" (ประวัติหายหมด) คนจึงใช้ลบหรือ "ปิดใบงาน" แทนการยกเลิก
 * ยกเลิกเก็บใบไว้พร้อมเหตุผลว่าใครยกเลิกเพราะอะไร — ใบซ้ำ/เปิดผิด/ลูกค้าไม่เอาแล้วใช้ปุ่มนี้
 */
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import AppModal from "./AppModal";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { colors, radius, spacing } from "../theme";

/** ตรงกับ CANCEL_REASON_LABELS ฝั่ง backend */
const REASONS = [
  { value: "DUPLICATE", label: "เปิดซ้ำ", hint: "ซ้ำกับใบไหน" },
  { value: "CUSTOMER", label: "ลูกค้ายกเลิก", hint: "ใครแจ้ง เมื่อไร" },
  { value: "WRONG", label: "เปิดผิดสาขา/ผิดเครื่อง", hint: "ที่ถูกคือสาขา/เครื่องไหน" },
  { value: "OTHER", label: "อื่น ๆ", hint: "ต้องพิมพ์เหตุผล" },
];

export function CancelOrderButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.trigger} onPress={onPress} accessibilityLabel="ยกเลิกใบงาน">
      <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
      <Text style={styles.triggerText}>ยกเลิกใบงาน</Text>
      <Text style={styles.triggerHint}>ใบซ้ำ / เปิดผิด / ลูกค้าไม่เอาแล้ว</Text>
    </TouchableOpacity>
  );
}

export default function CancelOrderModal({
  order,
  onClose,
  onDone,
}: {
  order: { id: number; code: string };
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const noteNeeded = reason === "OTHER";
  const ready = !!reason && (!noteNeeded || note.trim().length > 0);

  async function submit() {
    setTried(true);
    if (!ready) return;
    setBusy(true);
    try {
      await api.post(`/work-orders/${order.id}/cancel`, { reasonCode: reason, note: note.trim() || undefined });
      await onDone();
    } catch (e) {
      showAlert("ยกเลิกใบงานไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const hint = REASONS.find((r) => r.value === reason)?.hint;
  return (
    <AppModal
      visible
      onClose={onClose}
      busy={busy}
      title={`ยกเลิกใบงาน ${order.code}`}
      subtitle="ใบนี้หยุดทุกขั้น ออกจากกล่องงานและบอร์ดแผนงาน · ประวัติและรูปยังอยู่ครบ"
      footer={
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={onClose} disabled={busy}>
            <Text style={styles.ghostText}>ไม่ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: ready ? colors.danger : colors.border }]}
            onPress={submit}
            disabled={busy}
            accessibilityLabel="ยืนยันยกเลิกใบงาน"
          >
            <Text style={[styles.btnText, !ready && { color: colors.textFaint }]}>ยกเลิกใบงาน</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: spacing.lg }}>
        <Text style={styles.muted}>เปิดผิดหรือเปิดซ้ำก็ใช้ปุ่มนี้แทนการลบ — จะได้รู้ภายหลังว่าใบนี้หายไปเพราะอะไร</Text>
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>
            เหตุผล <Text style={styles.req}>*</Text>
          </Text>
          {REASONS.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[styles.opt, reason === r.value && styles.optOn]}
              onPress={() => setReason(r.value)}
              accessibilityLabel={`เหตุผลยกเลิก ${r.label}`}
            >
              <View style={[styles.radio, reason === r.value && styles.radioOn]} />
              <Text style={styles.optText}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>
            รายละเอียด {noteNeeded ? <Text style={styles.req}>*</Text> : <Text style={styles.muted}>(ไม่บังคับ)</Text>}
          </Text>
          <TextInput
            style={[styles.input, tried && noteNeeded && !note.trim() && styles.inputBad]}
            value={note}
            onChangeText={setNote}
            multiline
            placeholder={hint ? `เช่น ${hint}` : "เช่น ซ้ำกับ WO-00198"}
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="รายละเอียดที่ยกเลิก"
          />
        </View>
        {tried && !ready ? (
          <Text style={styles.err}>{!reason ? "เลือกเหตุผลก่อน" : "เลือก “อื่น ๆ” ต้องพิมพ์เหตุผล"}</Text>
        ) : null}
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  triggerText: { color: colors.danger, fontWeight: "700", fontSize: 14 },
  triggerHint: { color: colors.textMuted, fontSize: 12.5 },
  footer: { flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  btn: { borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  btnText: { color: "#fff", fontWeight: "700" },
  ghost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  ghostText: { color: colors.navy, fontWeight: "700" },
  label: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  req: { color: colors.danger },
  muted: { fontSize: 12.5, color: colors.textMuted, fontWeight: "400" },
  opt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  optOn: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.borderStrong },
  radioOn: { borderWidth: 5, borderColor: colors.danger },
  optText: { flex: 1, fontSize: 14, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: 10,
    minHeight: 64,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: "top",
  },
  inputBad: { borderColor: colors.danger },
  err: { fontSize: 13, color: colors.danger },
});
