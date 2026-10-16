/**
 * หัวหน้าภาคปิดใบงานเอง ไม่ต้องส่งช่างเข้าหน้างาน (เจ้าของงานขอ ต.ค. 69 รอบสอง)
 *
 * บังคับเหตุผล + รายละเอียด ไม่บังคับรูป — รอบแรกบังคับรูปแล้วถูกขอเอาออก
 * ปุ่มยืนยันกดไม่ได้จนกว่าจะครบ และบอกตรง ๆ ว่ายังขาดอะไร (ปุ่มเทาเฉย ๆ คนไม่รู้ว่าต้องทำอะไรต่อ)
 * กฎฝั่งเซิร์ฟเวอร์อยู่ที่ POST /work-orders/:id/supervisor-close
 */
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import AppModal from "./AppModal";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { colors, radius, spacing } from "../theme";

/** ตรงกับ SUPERVISOR_CLOSE_REASONS ฝั่งเซิร์ฟเวอร์ (utils/constants.ts) — เพิ่มเหตุผลต้องแก้ทั้งสองที่ */
const REASONS = [
  { value: "SELF", label: "เครื่องกลับมาใช้งานได้เอง" },
  { value: "PHONE", label: "แก้ไขทางโทรศัพท์ / แนะนำร้านแล้ว" },
  { value: "OTHER_ORDER", label: "ซ่อมรวมกับใบงานอื่นแล้ว" },
  { value: "SHOP_FIXED", label: "ร้านจัดการซ่อมเอง" },
  { value: "OTHER", label: "อื่น ๆ" },
];
/** ตรงกับ SUPERVISOR_CLOSE_MIN_NOTE ฝั่งเซิร์ฟเวอร์ */
const MIN_NOTE = 10;
// สีของหัวหน้าภาค — ปุ่มนี้เป็นของหัวหน้าภาค และต้องไม่เหมือนปุ่มเขียว "ปิดงาน" ของช่างที่ปิดจากหน้างาน
const SUP = colors.roleSupervisor;

export interface SupervisorCloseOrder {
  id: number;
  code: string;
  scheduledAt: string | null;
  assignedTeam: string | null;
  waitingParts: { partCode?: string | null; name?: string | null; inStock?: boolean | null; requisitionNo: string | null }[];
}

export function SupervisorCloseButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.trigger} onPress={onPress} accessibilityLabel="ปิดใบงาน (ไม่ต้องเข้าหน้างาน)">
      <Ionicons name="checkmark-done-circle-outline" size={18} color={SUP} />
      <Text style={styles.triggerText}>ปิดใบงาน (ไม่ต้องเข้าหน้างาน)</Text>
      <Text style={styles.triggerHint}>ต้องใส่เหตุผล</Text>
    </TouchableOpacity>
  );
}

export default function SupervisorCloseModal({
  order,
  onClose,
  onDone,
}: {
  order: SupervisorCloseOrder;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  // เบิกแล้ว = เช็คว่ามีของและมีเลขใบเบิก (เกณฑ์เดียวกับหน้าใบงาน)
  const issued = order.waitingParts.filter((p) => p.inStock === true && p.requisitionNo);
  const futureVisit = order.scheduledAt && order.scheduledAt.slice(0, 10) >= new Date().toISOString().slice(0, 10);
  const len = note.trim().length;
  const ready = !!reason && len >= MIN_NOTE;

  async function submit() {
    setTried(true);
    if (!ready) return;
    setBusy(true);
    try {
      await api.post(`/work-orders/${order.id}/supervisor-close`, { reason, note: note.trim() });
      await onDone();
    } catch (e) {
      showAlert("ปิดใบงานไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const missing = [!reason && "เลือกเหตุผล", len < MIN_NOTE && `พิมพ์รายละเอียดอย่างน้อย ${MIN_NOTE} ตัวอักษร`].filter(Boolean);
  return (
    <AppModal
      visible
      onClose={onClose}
      busy={busy}
      title={`ปิดใบงาน ${order.code}`}
      subtitle="ไม่ต้องส่งช่างเข้าหน้างาน · ใบงานขึ้นว่าปิดงานแล้ว"
      footer={
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={onClose} disabled={busy}>
            <Text style={styles.ghostText}>กลับ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: ready ? SUP : colors.border }]}
            onPress={submit}
            disabled={busy}
            accessibilityLabel="ยืนยันปิดใบงาน"
          >
            <Text style={[styles.btnText, !ready && { color: colors.textFaint }]}>ยืนยันปิดใบงาน</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: spacing.lg }}>
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>
            เหตุผลที่ปิด <Text style={styles.req}>*</Text>
          </Text>
          {REASONS.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[styles.opt, reason === r.value && styles.optOn]}
              onPress={() => setReason(r.value)}
              accessibilityLabel={`เหตุผล ${r.label}`}
            >
              <View style={[styles.radio, reason === r.value && styles.radioOn]} />
              <Text style={styles.optText}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.label}>
            รายละเอียด <Text style={styles.req}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, tried && len < MIN_NOTE && styles.inputBad]}
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="เช่น โทรถามร้าน 16 ต.ค. ผู้จัดการสาขายืนยันว่าตู้เย็นปกติแล้วตั้งแต่เมื่อวาน"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="รายละเอียดที่ปิดใบงาน"
          />
          <Text style={[styles.count, len >= MIN_NOTE && { color: colors.textMuted }]}>{len} ตัวอักษร</Text>
        </View>

        {tried && missing.length ? <Text style={styles.err}>{missing.join(" และ")}</Text> : null}

        {issued.length ? (
          <View style={styles.warn}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.warningInk} />
            <Text style={styles.warnText}>
              มีอะไหล่ที่เบิกแล้ว {issued.length} รายการ ({issued.map((p) => p.name || p.partCode).join(", ")}) — ต้องคืนเข้าคลัง
            </Text>
          </View>
        ) : null}
        {futureVisit && order.assignedTeam ? (
          <Text style={styles.muted}>นัดเข้างานของทีม{order.assignedTeam} จะหลุดจากบอร์ดแผนงาน ช่างไม่ต้องไป</Text>
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
    borderColor: SUP,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  triggerText: { color: SUP, fontWeight: "700", fontSize: 14 },
  triggerHint: { color: colors.textMuted, fontSize: 12.5 },
  footer: { flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  btn: { borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  btnText: { color: "#fff", fontWeight: "700" },
  ghost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  ghostText: { color: colors.navy, fontWeight: "700" },
  label: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  req: { color: colors.danger },
  muted: { fontSize: 12.5, color: colors.textMuted },
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
  optOn: { borderColor: SUP, backgroundColor: colors.roleSupervisorSoft },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.borderStrong },
  radioOn: { borderWidth: 5, borderColor: SUP },
  optText: { flex: 1, fontSize: 14, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: 10,
    minHeight: 72,
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
    textAlignVertical: "top",
  },
  inputBad: { borderColor: colors.danger },
  count: { alignSelf: "flex-end", fontSize: 12, color: colors.textFaint },
  err: { fontSize: 13, color: colors.danger },
  warn: { flexDirection: "row", gap: 8, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 10 },
  warnText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.warningInk },
});
