/**
 * ลบใบงาน = ย้ายไปถังขยะ (เจ้าของงานตัดสิน 4 พ.ย. 69 — ตัวอย่างที่ตกลง "จัดมา") — แอดมินเท่านั้น
 *
 * เดิมกล่องยืนยัน "ลบ … ถาวร" ลบทั้งใบพร้อมรูปทันที กู้คืนไม่ได้ · ตอนนี้ใบไปอยู่ในถังขยะ 30 วัน แอดมินกู้คืนได้ครบ
 * แล้วระบบลบจริงพร้อมรูปและวิดีโอ — กล่องนี้ต้องบอกให้ครบสามอย่าง: หายจากไหนบ้าง · เก็บไว้นานแค่ไหน · หลังจากนั้นเกิดอะไร
 *
 * เหตุผลบังคับ (เจ้าของงานเลือก) — คนเปิดถังขยะทีหลังต้องรู้ว่าใบนี้หายไปเพราะอะไร ก่อนตัดสินใจกู้หรือปล่อย
 * ยังบอกให้ใช้ "ยกเลิกใบงาน" กับใบที่เปิดถูกแต่ไม่ได้ทำ (กล่องเหลือง) — ยกเลิกเก็บใบไว้ในรายงาน ลบคือหายจากรายงาน
 * ปุ่มกดไม่ได้และขึ้น "เลือกเหตุผลก่อน" จนกว่าจะเลือก — ปุ่มที่กดได้แล้วค่อยบอกว่าขาดอะไรคือให้คนกดสองรอบ
 */
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import TouchableOpacity from "./Tap";
import AppModal from "./AppModal";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { TRASH_KEEP_DAYS, TRASH_REASONS, type TrashResult } from "../utils/trash";
import { colors, radius, spacing } from "../theme";

export interface TrashTarget {
  id: number;
  code: string;
  branchCode: string;
  jobTypeLabel: string;
  machineCode: string | null;
  closedAt: string | null;
  /** ของที่ย้ายไปพร้อมใบ — นับจากใบที่เปิดอยู่ ("ลบใบงาน" ฟังดูเหมือนเสียใบเดียว ทั้งที่รูปหน้างานกับใบเหลืองไปด้วย) */
  counts: { parts: number; files: number; logs: number; workers: number };
}

export default function TrashOrderModal({
  order,
  onClose,
  onDone,
}: {
  order: TrashTarget;
  onClose: () => void;
  onDone: (result: TrashResult) => void | Promise<void>;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const noteNeeded = reason === "OTHER";
  const ready = !!reason && (!noteNeeded || note.trim().length > 0);
  const buttonText = !reason ? "เลือกเหตุผลก่อน" : !ready ? "พิมพ์เหตุผลก่อน" : "ย้ายไปถังขยะ";

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const res = await api.delete<TrashResult>(`/work-orders/${order.id}`, {
        data: { reason, note: noteNeeded ? note.trim() : undefined },
        loadingText: "กำลังย้ายไปถังขยะ…",
      });
      await onDone(res.data);
    } catch (e) {
      showAlert("ย้ายไปถังขยะไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const c = order.counts;
  const moved = [
    `อะไหล่ ${c.parts} รายการ`,
    `ไฟล์แนบ ${c.files} ไฟล์`,
    `ประวัติ ${c.logs} รายการ`,
    c.workers > 0 ? `ผู้เข้าปฏิบัติงาน ${c.workers} คน` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <AppModal
      visible
      onClose={onClose}
      busy={busy}
      title="ย้ายใบงานนี้ไปถังขยะ?"
      subtitle={[order.code, order.branchCode, `งาน ${order.jobTypeLabel}`, order.machineCode ? `เครื่อง ${order.machineCode}` : null]
        .filter(Boolean)
        .join(" · ")}
      footer={
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={onClose} disabled={busy}>
            <Text style={styles.ghostText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, ready ? styles.go : styles.wait]}
            onPress={submit}
            disabled={!ready || busy}
            accessibilityLabel="ยืนยันย้ายไปถังขยะ"
          >
            <Text style={[styles.btnText, !ready && styles.waitText]}>{buttonText}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: spacing.md }}>
        <Text style={styles.body}>
          ใบงานจะหายจากรายการใบงาน กล่องงาน รายงาน และการค้นหา แต่
          <Text style={styles.bold}>ยังเก็บไว้ในถังขยะ {TRASH_KEEP_DAYS} วัน</Text> แอดมินกู้คืนได้ครบทุกอย่างระหว่างนี้ ครบ{" "}
          {TRASH_KEEP_DAYS} วันระบบลบจริงพร้อมรูปและวิดีโอ
        </Text>
        <View style={styles.counts}>
          <Text style={styles.countsText}>
            ย้ายไปพร้อมกัน: <Text style={styles.bold}>{moved}</Text>
          </Text>
        </View>
        <View style={styles.amber}>
          <Text style={styles.amberText}>
            {order.closedAt
              ? "ใบนี้ปิดงานไปแล้ว — ถ้าแค่ไม่อยากเห็นในรายการ ควรเก็บไว้เป็นหลักฐาน ใบที่ลบหายจากรายงานด้วย"
              : "ถ้าใบนี้เปิดถูกแต่ไม่ได้ทำ ใช้ “ยกเลิกใบงาน” ดีกว่า — ใบยังอยู่ในรายงานพร้อมเหตุผล"}
          </Text>
        </View>
        <View style={{ gap: 8 }}>
          <Text style={styles.label}>
            เหตุผลที่ลบ <Text style={styles.req}>*</Text>
          </Text>
          <View style={styles.chips}>
            {TRASH_REASONS.map((r) => {
              const on = reason === r.value;
              return (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setReason(r.value)}
                  accessibilityState={{ selected: on }}
                  // เว็บไม่แปลง accessibilityState เป็น aria-* (CLAUDE.md) — ใส่เอง เทสต์เบราว์เซอร์อ่านว่าชิปไหนติดอยู่
                  aria-pressed={on}
                  accessibilityLabel={`เหตุผลที่ลบ ${r.label}`}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {noteNeeded ? (
            <TextInput
              style={[styles.input, !note.trim() && styles.inputBad]}
              value={note}
              onChangeText={setNote}
              placeholder="พิมพ์เหตุผล *"
              placeholderTextColor={colors.textFaint}
              maxLength={500}
              autoFocus
              accessibilityLabel="เหตุผลอื่น"
            />
          ) : null}
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  footer: { flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  btn: { minHeight: 44, borderRadius: radius.md, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  go: { backgroundColor: colors.dangerFill },
  wait: { backgroundColor: colors.border },
  waitText: { color: colors.textMuted },
  ghost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  ghostText: { color: colors.body, fontWeight: "600", fontSize: 14 },
  body: { fontSize: 14.5, lineHeight: 23, color: colors.text },
  bold: { fontWeight: "700" },
  counts: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  countsText: { fontSize: 13.5, lineHeight: 21, color: colors.text },
  amber: {
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  amberText: { fontSize: 13, lineHeight: 21, color: colors.warningInk },
  label: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  req: { color: colors.danger },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { borderColor: colors.dangerFill, backgroundColor: colors.dangerFill },
  chipText: { fontSize: 13.5, color: colors.body },
  chipTextOn: { color: "#fff", fontWeight: "600" },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text,
  },
  inputBad: { borderColor: colors.danger },
});
