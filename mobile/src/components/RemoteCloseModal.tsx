/**
 * "แก้จากระยะไกลแล้ว · ปิดงาน" — ใบงาน IT ที่แก้ได้จากออฟฟิศ ไม่ต้องส่งช่าง (เจ้าของงานตัดสิน 6 พ.ย. 69)
 *
 * แอดมิน และหัวหน้าภาคที่ดูแลงาน IT · ใบ IT ในขั้นที่ยังไม่มีช่างถือใบ (เซิร์ฟเวอร์ส่งรายการขั้นมาใน remoteCloseStages)
 * บังคับสองอย่าง: บันทึกสิ่งที่แก้ และภาพหน้าจอหลักฐานอย่างน้อย 1 รูป — ปิดแบบนี้ไม่มีรูปก่อน/หลังซ่อม
 * ภาพหน้าจอคือสิ่งเดียวที่บอกคนที่เปิดใบทีหลังว่าแก้แล้วจริง
 * รูปขึ้นก่อนสั่งปิด (บทบาท REMOTE_FIX) — เซิร์ฟเวอร์นับรูปตอนรับคำสั่งปิด แบบเดียวกับรูปหลังซ่อมของหัวหน้าภาคปิดใบงาน
 */
import React, { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import TouchableOpacity from "./Tap";
import AppModal from "./AppModal";
import { PickedAttachment, asList, filesToAttachments, pickImageAttachment, pickImageAttachments, uploadAttachment } from "../utils/attachments";
import FileDropZone, { DropHint } from "./FileDropZone";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { colors, radius, spacing } from "../theme";

/** ตรงกับ REMOTE_CLOSE_MIN_NOTE ฝั่งเซิร์ฟเวอร์ — สั้นกว่านี้อ่านแล้วไม่รู้ว่าแก้อะไร */
const MIN_NOTE = 10;

export default function RemoteCloseModal({
  order,
  onClose,
  onDone,
}: {
  order: { id: number; code: string };
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [shots, setShots] = useState<PickedAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const len = note.trim().length;
  const ready = len >= MIN_NOTE && shots.length > 0;

  async function pick(fn: (onStage: (label: string) => void) => Promise<PickedAttachment | PickedAttachment[] | null>) {
    try {
      const got = asList(await fn(setStage));
      if (got.length) setShots((v) => [...v, ...got]);
    } catch (e) {
      showAlert("เตรียมไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setStage(null);
    }
  }

  async function submit() {
    setTried(true);
    if (!ready) return;
    setBusy(true);
    try {
      for (const [i, f] of shots.entries()) {
        setStage(`กำลังส่งรูป ${i + 1}/${shots.length}`);
        await uploadAttachment(order.id, f, "REMOTE_FIX", undefined, { index: i, total: shots.length });
      }
      setStage(null);
      await api.post(`/work-orders/${order.id}/remote-close`, { note: note.trim() });
      await onDone();
    } catch (e) {
      showAlert("ปิดงานไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  const missing = [shots.length === 0 && "แนบภาพหน้าจอหลักฐานอย่างน้อย 1 รูป", len < MIN_NOTE && `พิมพ์สิ่งที่แก้อย่างน้อย ${MIN_NOTE} ตัวอักษร`].filter(Boolean);
  return (
    <AppModal
      visible
      onClose={onClose}
      busy={busy}
      title={`แก้จากระยะไกลแล้ว · ${order.code}`}
      subtitle="ไม่ต้องส่งช่าง · ใบงานปิดเป็น “ปิดงาน (แก้จากระยะไกล)”"
      footer={
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={onClose} disabled={busy}>
            <Text style={styles.ghostText}>กลับ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: ready ? colors.primary : colors.border }]}
            onPress={submit}
            disabled={busy}
            accessibilityLabel="ยืนยันปิดงาน แก้จากระยะไกล"
          >
            <Text style={[styles.btnText, !ready && { color: colors.textFaint }]}>{stage ?? "ปิดงาน"}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: spacing.lg }}>
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>
            แก้อะไรไป <Text style={styles.req}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, tried && len < MIN_NOTE && styles.inputBad]}
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="เช่น รีสตาร์ทระบบจ่ายเงินจากหลังบ้าน ทดสอบสแกนจ่ายแล้วผ่าน"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="สิ่งที่แก้จากระยะไกล"
          />
          <Text style={[styles.count, len >= MIN_NOTE && { color: colors.textMuted }]}>{len} ตัวอักษร</Text>
        </View>

        <FileDropZone
          hint="รูป"
          disabled={busy}
          label="วางภาพหน้าจอหลักฐาน"
          onFiles={(files) => pick((s) => filesToAttachments(files, { image: true }, s))}
          style={{ gap: 6 }}
        >
          <Text style={styles.label}>
            ภาพหน้าจอหลักฐาน <Text style={styles.req}>*</Text>
          </Text>
          <Text style={styles.muted}>เช่น หน้าจอระบบหลังแก้ · ผลทดสอบที่ผ่าน — คนเปิดใบทีหลังเห็นว่าแก้แล้วจริง</Text>
          {shots.length ? <Text style={styles.muted}>เลือกไว้ {shots.length} รูป (ส่งตอนกดปิดงาน)</Text> : null}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {Platform.OS !== "web" ? (
              <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={() => pick((s) => pickImageAttachment(true, s))} disabled={busy}>
                <Text style={styles.ghostText}>ถ่ายรูป</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.btn, styles.ghost]}
              onPress={() => pick(pickImageAttachments)}
              disabled={busy}
              accessibilityLabel="เลือกภาพหน้าจอหลักฐาน"
            >
              <Text style={styles.ghostText}>เลือกรูป</Text>
            </TouchableOpacity>
          </View>
          <DropHint />
        </FileDropZone>

        {tried && missing.length ? <Text style={styles.err}>{missing.join(" และ")}</Text> : null}
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  footer: { flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  btn: { borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  btnText: { color: "#fff", fontWeight: "700" },
  ghost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  ghostText: { color: colors.navy, fontWeight: "700" },
  label: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  req: { color: colors.danger },
  muted: { fontSize: 12.5, color: colors.textMuted },
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
});
