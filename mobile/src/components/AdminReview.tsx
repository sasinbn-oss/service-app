/**
 * ส่งกลับให้แอดมินตรวจสอบ — ขั้นตอนไม่เปลี่ยน (เจ้าของงานขอ ต.ค. 69 · ตามตัวอย่างที่ตกลง)
 *
 * หัวหน้าภาคเจอข้อมูลในใบที่แอดมินกรอกไม่ถูก (เลขเครื่อง เบอร์ร้าน ใบซ้ำ) เดิมต้องโทรบอกกันเอง
 * และไม่มีที่ให้ตามว่าแอดมินแก้แล้วหรือยัง · ส่งแล้วใบยังอยู่ขั้นเดิม หัวหน้าภาคเดินขั้นต่อได้ระหว่างรอ
 *
 * กล่องม่วง = รอแอดมินตอบ (สีของแอดมิน — ลูกบอลอยู่ที่แอดมิน) · กล่องเขียว = แอดมินตอบแล้ว รอหัวหน้าภาครับทราบ
 * ปุ่มของแต่ละฝั่งอยู่ที่การ์ดในกล่องงาน (MyQueue) และหน้าใบงาน — ไฟล์นี้มีแค่กล่องกับฟอร์ม
 */
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import AppModal from "./AppModal";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { colors, radius, spacing } from "../theme";

/** คำขอที่ยังค้างของใบงาน — `adminReview` ใน GET /work-orders และ /work-orders/:id */
export interface AdminReviewInfo {
  id: number;
  reason: string;
  reasonLabel: string;
  note: string;
  /** ขั้นของใบตอนส่ง */
  statusLabel: string;
  byName: string | null;
  at: string;
  answered: boolean;
  reply: string | null;
  replyByName: string | null;
  repliedAt: string | null;
}

/** ตรงกับ ADMIN_REVIEW_REASONS ฝั่ง backend */
const REASONS = [
  { value: "BRANCH", label: "ข้อมูลสาขาไม่ถูก" },
  { value: "MACHINE", label: "เครื่อง/รุ่นไม่ถูก" },
  { value: "CONTACT", label: "เบอร์/ผู้ติดต่อไม่ถูก" },
  { value: "SYMPTOM", label: "อาการไม่ชัด ขอข้อมูลเพิ่ม" },
  { value: "DUPLICATE", label: "น่าจะเป็นใบซ้ำ" },
  { value: "OTHER", label: "อื่น ๆ" },
];
const MIN_NOTE = 5;

const time = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** ป้ายสั้นบนหัวการ์ด/แถวรายการ */
export function AdminReviewTag({ review }: { review: AdminReviewInfo | null | undefined }) {
  if (!review) return null;
  const done = review.answered;
  return (
    <View style={[styles.tag, { backgroundColor: done ? colors.successSoft : colors.roleAdminSoft }]}>
      <Text style={[styles.tagText, { color: done ? colors.successInk : colors.roleAdmin }]}>
        {done ? "แอดมินตรวจแล้ว" : "รอแอดมินตรวจสอบ"}
      </Text>
    </View>
  );
}

/** กล่องเรื่องที่ส่ง (ม่วง) หรือคำตอบของแอดมิน (เขียว) — viewer บอกว่าใครอ่าน แอดมินต้องรู้ว่าใครส่ง/ตอนอยู่ขั้นไหน */
export function AdminReviewBox({ review, viewer }: { review: AdminReviewInfo; viewer: "supervisor" | "admin" | "other" }) {
  if (review.answered) {
    return (
      <View style={[styles.box, styles.boxDone]} accessibilityLabel="กล่องแอดมินตรวจแล้ว">
        <View style={styles.boxHead}>
          <Ionicons name="checkmark-circle" size={16} color={colors.successInk} />
          <Text style={[styles.boxTitle, { color: colors.successInk }]}>แอดมินตรวจแล้ว</Text>
        </View>
        <Text style={styles.boxText}>{review.reply}</Text>
        <Text style={styles.boxMeta}>
          {review.replyByName ?? "แอดมิน"} · {review.repliedAt ? time(review.repliedAt) : ""} · คำขอ: {review.reasonLabel}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.box, styles.boxWait]} accessibilityLabel="กล่องรอแอดมินตรวจสอบ">
      <View style={styles.boxHead}>
        <Ionicons name="arrow-undo" size={15} color={colors.roleAdmin} />
        <Text style={[styles.boxTitle, { color: colors.roleAdmin }]}>
          {viewer === "admin" ? review.reasonLabel : `ส่งให้แอดมินตรวจสอบ · ${review.reasonLabel}`}
        </Text>
      </View>
      <Text style={styles.boxText}>{review.note}</Text>
      <Text style={styles.boxMeta}>
        {viewer === "supervisor" ? "ส่ง" : `จาก ${review.byName ?? "หัวหน้าภาค"} ·`} {time(review.at)}
        {viewer === "admin" ? ` · ตอนส่งอยู่ขั้น ${review.statusLabel}` : " · ยังไม่มีคำตอบ"}
      </Text>
    </View>
  );
}

/** หัวหน้าภาคส่งเรื่อง — เลือกเรื่อง + พิมพ์รายละเอียด (บังคับ) */
export function SendAdminReviewModal({
  order,
  onClose,
  onDone,
}: {
  order: { id: number; code: string; statusLabel: string; branchCode?: string; branchName?: string };
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const ready = !!reason && note.trim().length >= MIN_NOTE;
  const stage = order.statusLabel.split(" · ").slice(1).join(" · ") || order.statusLabel;

  async function submit() {
    setTried(true);
    if (!ready) return;
    setBusy(true);
    try {
      await api.post(`/work-orders/${order.id}/admin-review`, { reason, note: note.trim() });
      await onDone();
      showAlert("ส่งให้แอดมินตรวจสอบแล้ว", `ใบยังอยู่ขั้น “${stage}” เหมือนเดิม`);
    } catch (e) {
      showAlert("ส่งให้แอดมินไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppModal
      visible
      onClose={onClose}
      busy={busy}
      title="ส่งกลับให้แอดมินตรวจสอบ"
      subtitle={[order.code, order.branchCode && `${order.branchCode} ${order.branchName ?? ""}`.trim()].filter(Boolean).join(" · ")}
      footer={
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={onClose} disabled={busy}>
            <Text style={styles.ghostText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: ready ? colors.roleAdmin : colors.border }]}
            onPress={submit}
            disabled={busy}
            accessibilityLabel="ยืนยันส่งให้แอดมิน"
          >
            <Text style={[styles.btnText, !ready && { color: colors.textFaint }]}>ส่งให้แอดมิน</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: spacing.lg }}>
        <View style={styles.keep}>
          <Ionicons name="information-circle" size={18} color={colors.roleSupervisor} />
          <Text style={styles.keepText}>
            <Text style={{ fontWeight: "700", color: colors.roleSupervisor }}>ขั้นตอนไม่เปลี่ยน</Text> — ใบยังอยู่ “{order.statusLabel}”
            ระหว่างรอแอดมิน คุณทำขั้นนี้ต่อได้ตามปกติ
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>
            เรื่องที่ให้แอดมินตรวจ <Text style={styles.req}>*</Text>
          </Text>
          <View style={styles.chips}>
            {REASONS.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[styles.chip, reason === r.value && styles.chipOn]}
                onPress={() => setReason(r.value)}
                accessibilityLabel={`เรื่อง ${r.label}`}
                accessibilityState={{ selected: reason === r.value }}
              >
                <Text style={[styles.chipText, reason === r.value && styles.chipTextOn]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>
            รายละเอียด <Text style={styles.req}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, tried && note.trim().length < MIN_NOTE && styles.inputBad]}
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="เช่น ร้านแจ้งว่าเครื่องที่เสียคือ W12 ไม่ใช่ D12 รบกวนเช็คกับร้านอีกครั้ง"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="รายละเอียดที่ให้แอดมินตรวจ"
          />
        </View>
        <Text style={styles.muted}>แอดมินจะเห็นใบนี้ในกล่องงาน หัวข้อ “หัวหน้าภาคส่งให้ตรวจสอบ” · ตอบกลับแล้วคุณเห็นคำตอบบนการ์ดใบนี้</Text>
        {tried && !ready ? (
          <Text style={styles.err}>{!reason ? "เลือกเรื่องที่ให้แอดมินตรวจก่อน" : `พิมพ์รายละเอียดอย่างน้อย ${MIN_NOTE} ตัวอักษร`}</Text>
        ) : null}
      </View>
    </AppModal>
  );
}

/** แอดมินตอบกลับ — บอกว่าตรวจ/แก้อะไรไป (บังคับ) · ขั้นตอนไม่เปลี่ยน */
export function AdminReplyModal({
  order,
  review,
  onClose,
  onDone,
}: {
  order: { id: number; code: string; statusLabel: string; branchCode?: string; branchName?: string };
  review: AdminReviewInfo;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const ready = reply.trim().length >= MIN_NOTE;

  async function submit() {
    setTried(true);
    if (!ready) return;
    setBusy(true);
    try {
      await api.post(`/work-orders/${order.id}/admin-review/reply`, { reply: reply.trim() });
      await onDone();
      showAlert("ตอบกลับหัวหน้าภาคแล้ว");
    } catch (e) {
      showAlert("ตอบกลับไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppModal
      visible
      onClose={onClose}
      busy={busy}
      title="ตรวจแล้ว · ตอบกลับหัวหน้าภาค"
      subtitle={[order.code, order.branchCode && `${order.branchCode} ${order.branchName ?? ""}`.trim()].filter(Boolean).join(" · ")}
      footer={
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={onClose} disabled={busy}>
            <Text style={styles.ghostText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: ready ? colors.roleAdmin : colors.border }]}
            onPress={submit}
            disabled={busy}
            accessibilityLabel="ยืนยันส่งคำตอบ"
          >
            <Text style={[styles.btnText, !ready && { color: colors.textFaint }]}>ส่งคำตอบ</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: spacing.lg }}>
        <AdminReviewBox review={review} viewer="admin" />
        <View style={styles.keep}>
          <Ionicons name="information-circle" size={18} color={colors.roleSupervisor} />
          <Text style={styles.keepText}>
            แก้ข้อมูลในใบได้จากปุ่ม “แก้ไข” ในหน้าใบงานเหมือนเดิม ·{" "}
            <Text style={{ fontWeight: "700", color: colors.roleSupervisor }}>ตอบกลับแล้วขั้นตอนไม่เปลี่ยน</Text> ใบยังอยู่ “{order.statusLabel}”
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>
            ตรวจ/แก้อะไรไปแล้ว <Text style={styles.req}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, tried && !ready && styles.inputBad]}
            value={reply}
            onChangeText={setReply}
            multiline
            placeholder="เช่น โทรเช็คกับร้านแล้ว เป็นเครื่อง W12 จริง แก้เลขเครื่องในใบแล้ว"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="คำตอบถึงหัวหน้าภาค"
          />
        </View>
        {tried && !ready ? <Text style={styles.err}>พิมพ์คำตอบอย่างน้อย {MIN_NOTE} ตัวอักษร</Text> : null}
      </View>
    </AppModal>
  );
}

/** ยกเลิกคำขอที่แอดมินยังไม่ตอบ — ถามยืนยันก่อน เพราะแอดมินอาจกำลังตรวจอยู่ */
export function cancelAdminReview(order: { id: number; code: string }, onDone: () => void | Promise<void>) {
  showAlert("ยกเลิกคำขอให้แอดมินตรวจสอบ?", `${order.code} — แอดมินจะไม่เห็นเรื่องนี้ในกล่องงานแล้ว`, [
    { text: "ไม่ยกเลิก", style: "cancel" },
    {
      text: "ยกเลิกคำขอ",
      style: "destructive",
      onPress: async () => {
        try {
          await api.post(`/work-orders/${order.id}/admin-review/cancel`);
          await onDone();
          showAlert("ยกเลิกคำขอแล้ว");
        } catch (e) {
          showAlert("ยกเลิกคำขอไม่สำเร็จ", apiErrorMessage(e));
        }
      },
    },
  ]);
}

/** หัวหน้าภาครับทราบคำตอบ — กล่องเขียวหายจากการ์ด (คำตอบยังอยู่ในประวัติใบงาน) */
export async function ackAdminReview(order: { id: number }, onDone: () => void | Promise<void>) {
  try {
    await api.post(`/work-orders/${order.id}/admin-review/ack`);
    await onDone();
  } catch (e) {
    showAlert("บันทึกรับทราบไม่สำเร็จ", apiErrorMessage(e));
  }
}

const styles = StyleSheet.create({
  tag: { borderRadius: 999, paddingHorizontal: 8, alignSelf: "flex-start" },
  tagText: { fontSize: 12, lineHeight: 20, fontWeight: "700" },
  box: { gap: 2, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  boxWait: { backgroundColor: colors.roleAdminSoft, borderColor: colors.roleAdminLine },
  boxDone: { backgroundColor: colors.successSoft, borderColor: colors.successLine },
  boxHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  boxTitle: { flex: 1, fontSize: 13, lineHeight: 20, fontWeight: "700" },
  boxText: { fontSize: 13, lineHeight: 20, color: colors.text },
  boxMeta: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  keep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.roleSupervisorSoft,
    borderWidth: 1,
    borderColor: colors.sky200,
    borderRadius: radius.md,
    padding: 10,
  },
  keepText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.text },
  footer: { flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  btn: { borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  btnText: { color: "#fff", fontWeight: "700" },
  ghost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  ghostText: { color: colors.navy, fontWeight: "700" },
  label: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  req: { color: colors.danger },
  muted: { fontSize: 12.5, color: colors.textMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
  },
  chipOn: { borderColor: colors.roleAdmin, backgroundColor: colors.roleAdminSoft },
  chipText: { fontSize: 13, lineHeight: 20, color: colors.body },
  chipTextOn: { color: colors.roleAdmin, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: 10,
    minHeight: 72,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: "top",
  },
  inputBad: { borderColor: colors.danger },
  err: { fontSize: 13, color: colors.danger },
});
