/**
 * กรอบไฟล์ตรวจหน้างาน — รูปหน้างาน · รูปอะไหล่ที่เสีย · วิดีโอการทำงาน
 *
 * หัวหน้าภาคระบุอะไหล่จากผลตรวจโดยไม่ได้เห็นเครื่องเอง คำบรรยายอย่างเดียว
 * พาสั่งอะไหล่ผิดตัว จึงบังคับให้ครบสามอย่าง (เซิร์ฟเวอร์เช็คซ้ำตอนส่งผลตรวจ)
 *
 * ใช้สองที่ — การ์ดไฟล์แนบในใบงาน กับฟอร์มบันทึกผลตรวจ ทั้งสองที่ส่งขึ้นเซิร์ฟเวอร์ทันที
 * แล้วอ่านจากรายการไฟล์ชุดเดียวกัน ช่างที่ถ่ายไว้ตอนอยู่หน้าเครื่องเปิดฟอร์มแล้วเห็นว่าครบ
 * ไม่ต้องถ่ายซ้ำ
 */
import React, { useState } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import Spinner from "./Spinner";
import { apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import {
  PickedAttachment,
  attachmentIcon,
  pickImageAttachment,
  pickImageAttachments,
  pickVideoAttachment,
  uploadAttachment,
} from "../utils/attachments";
import type { Attachment } from "./WorkOrderAttachments";
import { colors, radius, spacing } from "../theme";

export const INSPECTION_SLOTS = [
  { role: "INSPECT_SITE", label: "รูปหน้างาน", hint: "สภาพเครื่องและจุดที่เสีย ให้เห็นทั้งเครื่อง", video: false },
  { role: "INSPECT_PART", label: "รูปอะไหล่ที่เสีย", hint: "ซูมให้เห็นรหัส/ป้ายบนอะไหล่ ถ้ามี", video: false },
  { role: "INSPECT_VIDEO", label: "วิดีโอการทำงาน", hint: "ถ่ายตอนเครื่องทำงาน ให้เห็นอาการ (ไม่เกิน 60 วินาที)", video: true },
] as const;

/** ไฟล์ตรวจของรอบนี้ — ใบที่ถูกส่งไปตรวจซ้ำต้องถ่ายใหม่ เพราะเครื่องอาจเปลี่ยนอาการไปแล้ว */
export function inspectionFilesOf(rows: Attachment[], since: string | null | undefined) {
  return rows.filter(
    (r) => r.role?.startsWith("INSPECT_") && (!since || r.createdAt >= since)
  );
}

export function missingInspection(rows: Attachment[], since: string | null | undefined) {
  const mine = inspectionFilesOf(rows, since);
  return INSPECTION_SLOTS.filter((s) => !mine.some((r) => r.role === s.role)).map((s) => s.label);
}

export default function InspectionSlots({
  workOrderId,
  rows,
  since,
  canEdit,
  canRemove,
  onOpen,
  onRemove,
  onChanged,
  compact = false,
}: {
  workOrderId: number;
  /** ไฟล์แนบทั้งใบ — กรองเฉพาะไฟล์ตรวจของรอบนี้เอง */
  rows: Attachment[];
  since: string | null | undefined;
  canEdit: boolean;
  canRemove: (row: Attachment) => boolean;
  onOpen: (row: Attachment) => void;
  onRemove: (row: Attachment) => void;
  /** แนบเสร็จ — ผู้เรียกโหลดรายการไฟล์ใหม่ */
  onChanged: () => void | Promise<void>;
  /** ในฟอร์มไม่ต้องมีคำอธิบายใต้ชื่อกรอบ พื้นที่น้อยกว่า */
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<{ role: string; label: string } | null>(null);
  const mine = inspectionFilesOf(rows, since);

  async function add(
    role: string,
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment[] | PickedAttachment | null>
  ) {
    setBusy({ role, label: "กำลังเตรียมไฟล์" });
    try {
      const got = await pick((label) => setBusy({ role, label }));
      const files = Array.isArray(got) ? got : got ? [got] : [];
      for (const [i, file] of files.entries()) {
        setBusy({ role, label: files.length > 1 ? `กำลังส่ง ${i + 1}/${files.length}` : "กำลังส่ง" });
        await uploadAttachment(workOrderId, file, role);
      }
      if (files.length) await onChanged();
    } catch (e) {
      showAlert("แนบไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.wrap}>
      {INSPECTION_SLOTS.map((slot) => {
        const got = mine.filter((r) => r.role === slot.role);
        const tone = slot.role === "INSPECT_SITE" ? styles.site : slot.role === "INSPECT_PART" ? styles.part : styles.video;
        const ink = slot.role === "INSPECT_SITE" ? colors.roleSupervisor : slot.role === "INSPECT_PART" ? colors.warningInk : colors.roleAdmin;
        const pick = () => add(slot.role, slot.video ? pickVideoAttachment : pickImageAttachments);
        const noun = slot.video ? "วิดีโอ" : "รูป";
        return (
          <View key={slot.role} style={[styles.slot, tone]} accessibilityLabel={`กรอบ${slot.label}`}>
            <View style={styles.head}>
              <Text style={styles.label}>{slot.label}</Text>
              <View style={{ flex: 1 }} />
              {got.length > 0 ? (
                <Text style={styles.ok}>✓ {got.length} {slot.video ? "คลิป" : "รูป"}</Text>
              ) : canEdit ? (
                <Text style={styles.miss}>ยังไม่มี</Text>
              ) : (
                <Text style={styles.none}>ไม่มี</Text>
              )}
            </View>
            {!compact && canEdit ? <Text style={styles.hint}>{slot.hint}</Text> : null}

            <View style={styles.thumbs}>
              {got.map((row) => (
                <View key={row.id}>
                  <TouchableOpacity activeOpacity={0.8} onPress={() => onOpen(row)} accessibilityLabel={`ดูไฟล์ ${row.fileName}`}>
                    {row.thumbnailDataUrl ? (
                      <Image source={{ uri: row.thumbnailDataUrl }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.blank]}>
                        <Ionicons name={attachmentIcon(row.kind)} size={22} color={colors.textFaint} />
                      </View>
                    )}
                    {row.kind === "VIDEO" ? (
                      <View style={styles.play}>
                        <Ionicons name="play" size={11} color="#fff" />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                  {canEdit && canRemove(row) ? (
                    <TouchableOpacity style={styles.remove} onPress={() => onRemove(row)} activeOpacity={0.7} accessibilityLabel={`ลบ ${row.fileName}`}>
                      <Ionicons name="close" size={12} color="#fff" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}

              {canEdit ? (
                busy?.role === slot.role ? (
                  <View style={styles.busy}>
                    <Spinner color={ink} size="small" />
                    <Text style={styles.busyText}>{busy.label}…</Text>
                  </View>
                ) : got.length > 0 ? (
                  // มีแล้วก็เพิ่มได้อีกเสมอ — อาการเดียวมักต้องถ่ายหลายมุม
                  <TouchableOpacity
                    style={[styles.addTile, { borderColor: ink }]}
                    onPress={pick}
                    disabled={!!busy}
                    activeOpacity={0.7}
                    accessibilityLabel={`เพิ่ม${slot.label}`}
                  >
                    <Ionicons name="add" size={20} color={ink} />
                    <Text style={[styles.addTileText, { color: ink }]}>เพิ่ม{noun}</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    {/* กล้องเฉพาะบนมือถือ — บนคอมพิวเตอร์ปุ่มนี้ไม่มีกล้องให้เปิด */}
                    {Platform.OS !== "web" && !slot.video ? (
                      <TouchableOpacity
                        style={styles.btn}
                        onPress={() => add(slot.role, (stage) => pickImageAttachment(true, stage))}
                        disabled={!!busy}
                        activeOpacity={0.7}
                        accessibilityLabel={`ถ่าย${slot.label}`}
                      >
                        <Ionicons name="camera-outline" size={16} color={ink} />
                        <Text style={[styles.btnText, { color: ink }]}>ถ่ายรูป</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.btn}
                      onPress={pick}
                      disabled={!!busy}
                      activeOpacity={0.7}
                      accessibilityLabel={`เลือก${slot.label}`}
                    >
                      <Ionicons name={slot.video ? "videocam-outline" : "images-outline"} size={16} color={ink} />
                      <Text style={[styles.btnText, { color: ink }]}>{slot.video ? "เลือกวิดีโอ" : "เลือกรูป"}</Text>
                    </TouchableOpacity>
                  </>
                )
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  slot: { borderWidth: 1.5, borderRadius: radius.md, padding: spacing.sm, gap: spacing.xs },
  site: { borderColor: colors.roleSupervisor, backgroundColor: colors.roleSupervisorSoft },
  part: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  // เส้นประให้ต่างจากกรอบรูปตั้งแต่มองแวบแรก — กรอบนี้รับเฉพาะวิดีโอ
  video: { borderColor: colors.roleAdmin, backgroundColor: colors.roleAdminSoft, borderStyle: "dashed" },
  head: { flexDirection: "row", alignItems: "center" },
  label: { fontSize: 14, fontWeight: "700", color: colors.text },
  ok: { fontSize: 12, fontWeight: "700", color: colors.successInk },
  miss: { fontSize: 12, fontWeight: "700", color: colors.dangerInk },
  none: { fontSize: 12, color: colors.textFaint },
  hint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  thumbs: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: 2 },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.card },
  blank: { alignItems: "center", justifyContent: "center" },
  play: {
    position: "absolute",
    left: 4,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: "rgba(15,23,42,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  remove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  addTile: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderStyle: "dashed",
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  addTileText: { fontSize: 11, fontWeight: "700" },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  btnText: { fontSize: 13, fontWeight: "700" },
  busy: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 32 },
  busyText: { fontSize: 12, color: colors.textMuted },
});
