/**
 * หัวหน้าภาคปิดงานเอง — เครื่องกลับมาใช้งานได้แล้ว ไม่ต้องส่งช่าง (เจ้าของงานขอ ต.ค. 69)
 *
 * บังคับเหตุผล คำอธิบาย และรูป/วิดีโอเครื่องที่ใช้งานได้ — ไม่มีช่างเห็นเครื่อง หลักฐานจึงมาจากรูป
 * รูปส่งขึ้นทันทีที่เลือก (role RECOVERY) แบบเดียวกับกรอบไฟล์ตรวจ — ปิดหน้าต่างแล้วเปิดใหม่ไม่ต้องแนบซ้ำ
 * กฎฝั่งเซิร์ฟเวอร์อยู่ที่ POST /work-orders/:id/recovered-close
 */
import React, { useState } from "react";
import { Image, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import AppModal from "./AppModal";
import Spinner from "./Spinner";
import type { Attachment } from "./WorkOrderAttachments";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { PickedAttachment, attachmentIcon, pickImageAttachments, pickVideoAttachment, uploadAttachment } from "../utils/attachments";
import { colors, radius, spacing } from "../theme";

/** ตรงกับ RECOVERY_REASONS ฝั่งเซิร์ฟเวอร์ (utils/constants.ts) — เพิ่มเหตุผลต้องแก้ทั้งสองที่ */
const REASONS = [
  { value: "SELF", label: "เครื่องกลับมาใช้งานได้เอง" },
  { value: "PHONE_GUIDE", label: "แนะนำลูกค้าทางโทรศัพท์/ไลน์ แล้วใช้งานได้" },
  { value: "REMOTE_RESET", label: "รีเซ็ต/แก้จากระยะไกล" },
  { value: "OTHER_ORDER", label: "ซ่อมแล้วในใบงานอื่น" },
  { value: "OTHER", label: "อื่น ๆ" },
];
// เขียวเสจของ "ปิดงานแล้ว" — ปุ่มนี้ทำให้ใบงานจบ ใช้สีเดียวกับแถบปิดงาน
const GREEN = colors.doneBand;

export interface RecoveredOrder {
  id: number;
  code: string;
  scheduledAt: string | null;
  assignedTeam: string | null;
  waitingParts: { partCode?: string | null; name?: string | null; requisitionNo: string | null }[];
}

export function RecoveredCloseButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.trigger} onPress={onPress} accessibilityLabel="ปิดงาน — เครื่องใช้งานได้แล้ว">
      <Ionicons name="checkmark-done-circle-outline" size={18} color="#fff" />
      <Text style={styles.triggerText}>ปิดงาน — เครื่องใช้งานได้แล้ว</Text>
      <Text style={styles.triggerHint}>ไม่ต้องส่งช่างเข้าหน้างาน</Text>
    </TouchableOpacity>
  );
}

export default function RecoveredCloseModal({
  order,
  files,
  onFilesChanged,
  onClose,
  onDone,
}: {
  order: RecoveredOrder;
  /** ไฟล์แนบทั้งใบ — ใช้เฉพาะ role RECOVERY */
  files: Attachment[];
  onFilesChanged: () => void | Promise<void>;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const proof = files.filter((f) => f.role === "RECOVERY");
  const requisitioned = order.waitingParts.filter((p) => p.requisitionNo);
  const futureVisit = order.scheduledAt && order.scheduledAt.slice(0, 10) >= new Date().toISOString().slice(0, 10);

  async function add(pick: (onStage: (l: string) => void) => Promise<PickedAttachment[] | PickedAttachment | null>) {
    setBusy("กำลังเตรียมไฟล์");
    try {
      const got = await pick((l) => setBusy(l));
      const list = Array.isArray(got) ? got : got ? [got] : [];
      for (const [i, f] of list.entries()) {
        setBusy(list.length > 1 ? `กำลังส่ง ${i + 1}/${list.length}` : "กำลังส่ง");
        await uploadAttachment(order.id, f, "RECOVERY");
      }
      if (list.length) await onFilesChanged();
    } catch (e) {
      showAlert("แนบไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!reason) return showAlert("ยังไม่ครบ", "เลือกเหตุผลที่ปิดงาน");
    if (note.trim().length < 5) return showAlert("ยังไม่ครบ", "อธิบายสิ่งที่ทำและยืนยันกับใคร");
    if (!proof.length) return showAlert("ยังไม่ครบ", "แนบรูปหรือวิดีโอที่เห็นว่าเครื่องใช้งานได้อย่างน้อย 1 ไฟล์");
    setBusy("กำลังปิดงาน");
    try {
      await api.post(`/work-orders/${order.id}/recovered-close`, { reason, note: note.trim() });
      await onDone();
    } catch (e) {
      showAlert("ปิดงานไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const ready = !!reason && note.trim().length >= 5 && proof.length > 0;
  return (
    <AppModal
      visible
      onClose={onClose}
      busy={!!busy}
      title="ปิดงาน — เครื่องใช้งานได้แล้ว"
      subtitle={`${order.code} · ไม่ต้องส่งช่างเข้าหน้างาน`}
      footer={
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={onClose} disabled={!!busy}>
            <Text style={styles.ghostText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: GREEN }, !ready && { opacity: 0.5 }]}
            onPress={submit}
            disabled={!!busy}
            accessibilityLabel="ยืนยันปิดงาน"
          >
            <Text style={styles.btnText}>ยืนยันปิดงาน</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: spacing.lg }}>
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>
            เหตุผล <Text style={styles.req}>*</Text>
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
            อธิบายสิ่งที่ทำ / ยืนยันกับใคร <Text style={styles.req}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="เช่น โทรแนะนำพนักงานสาขาให้ล้างกรองน้ำทิ้ง เครื่องกลับมาปั่นได้ ทดสอบ 1 รอบผ่าน — ผู้จัดการสาขายืนยัน"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="อธิบายสิ่งที่ทำ"
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.label}>
            รูป/วิดีโอ เครื่องที่ใช้งานได้ <Text style={styles.req}>*</Text>{" "}
            <Text style={styles.muted}>อย่างน้อย 1 ไฟล์ — ขอจากสาขาทางไลน์แล้วแนบได้</Text>
          </Text>
          <View style={styles.thumbs}>
            {proof.map((f) => (
              <View key={f.id} style={styles.thumb}>
                {f.thumbnailDataUrl ? (
                  <Image source={{ uri: f.thumbnailDataUrl }} style={styles.thumbImg} />
                ) : (
                  <Ionicons name={attachmentIcon(f.kind)} size={26} color={colors.primaryInk} />
                )}
              </View>
            ))}
            <TouchableOpacity
              style={[styles.thumb, styles.add]}
              onPress={() => add(pickImageAttachments)}
              disabled={!!busy}
              accessibilityLabel="แนบรูปเครื่องที่ใช้งานได้"
            >
              <Ionicons name="image-outline" size={22} color={colors.textMuted} />
              <Text style={styles.addText}>รูป</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.thumb, styles.add]}
              onPress={() => add(pickVideoAttachment)}
              disabled={!!busy}
              accessibilityLabel="แนบวิดีโอเครื่องที่ใช้งานได้"
            >
              <Ionicons name="videocam-outline" size={22} color={colors.textMuted} />
              <Text style={styles.addText}>วิดีโอ</Text>
            </TouchableOpacity>
          </View>
          {busy ? (
            <View style={styles.busy}>
              <Spinner size="small" color={colors.primary} />
              <Text style={styles.muted}>{busy}</Text>
            </View>
          ) : null}
        </View>

        {requisitioned.length ? (
          <View style={styles.warn}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.warningInk} />
            <Text style={styles.warnText}>
              ใบงานนี้เบิกอะไหล่ไปแล้ว {requisitioned.length} รายการ (
              {requisitioned.map((p) => p.name || p.partCode).join(", ")}) — ปิดแล้วต้องคืนคลังตามขั้นตอนปกติ
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
    backgroundColor: GREEN,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  triggerText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  triggerHint: { color: "#fff", opacity: 0.85, fontSize: 12.5 },
  footer: { flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  btn: { borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  btnText: { color: "#fff", fontWeight: "700" },
  ghost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  ghostText: { color: colors.navy, fontWeight: "700" },
  label: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  req: { color: colors.danger },
  muted: { fontSize: 12.5, fontWeight: "400", color: colors.textMuted },
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
  optOn: { borderColor: colors.roleSupervisor, backgroundColor: colors.roleSupervisorSoft },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.borderStrong },
  radioOn: { borderWidth: 5, borderColor: colors.roleSupervisor },
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
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  add: { backgroundColor: colors.card, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.borderStrong, gap: 2 },
  addText: { fontSize: 12, color: colors.textMuted },
  busy: { flexDirection: "row", alignItems: "center", gap: 8 },
  warn: { flexDirection: "row", gap: 8, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 10 },
  warnText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.warningInk },
});
