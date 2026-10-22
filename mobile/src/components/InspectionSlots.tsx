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
import { Image, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import EvidenceStep from "./EvidenceStep";
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
  {
    role: "INSPECT_SITE", label: "รูปหน้างาน", video: false, camera: "ถ่ายรูปทันที",
    hint: "ถ่ายให้เห็นสภาพเครื่องและภาพรวมหน้างานโดยรอบ", foot: "เลือกจากอัลบั้มได้หลายรูปพร้อมกัน",
  },
  {
    role: "INSPECT_PART", label: "รูปอะไหล่ที่เสีย", video: false, camera: "ถ่ายชิ้นส่วน",
    hint: "ซูมให้เห็นชิ้นส่วน รหัส Serial No. หรือป้ายกำกับอะไหล่", foot: "ภาพคมชัด มองเห็นรหัสอะไหล่ชัดเจน",
  },
  {
    role: "INSPECT_VIDEO", label: "วิดีโอการทำงาน", video: true, camera: "อัดวิดีโอทันที",
    hint: "คลิปสั้นตอนเครื่องทำงาน ให้เห็นอาการผิดปกติหรือเสียง", foot: "ไม่เกิน 60 วินาที",
  },
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
        await uploadAttachment(workOrderId, file, role, undefined, { index: i, total: files.length });
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
      {INSPECTION_SLOTS.map((slot, i) => {
        const got = mine.filter((r) => r.role === slot.role);
        const noun = slot.video ? "คลิป" : "รูป";
        return (
          <EvidenceStep
            key={slot.role}
            n={i + 1}
            title={slot.label}
            hint={compact && got.length ? undefined : slot.hint}
            done={got.length > 0}
            doneText={`✓ ${got.length} ${noun}`}
            canEdit={canEdit}
            accessibilityLabel={`กรอบ${slot.label}`}
            busy={busy?.role === slot.role ? busy.label : null}
            primary={{
              label: got.length ? `${slot.video ? "อัด" : "ถ่าย"}เพิ่ม` : slot.camera,
              icon: slot.video ? "videocam" : slot.role === "INSPECT_PART" ? "scan" : "camera",
              onPress: () =>
                add(slot.role, (stage) => (slot.video ? pickVideoAttachment(stage, true) : pickImageAttachment(true, stage))),
              accessibilityLabel: `ถ่าย${slot.label}`,
            }}
            secondary={{
              label: got.length ? "เลือกเพิ่ม" : slot.video ? "เลือกคลิปวิดีโอ" : "เลือกจากอัลบั้ม",
              icon: slot.video ? "film-outline" : "images-outline",
              onPress: () => add(slot.role, slot.video ? (stage) => pickVideoAttachment(stage) : pickImageAttachments),
              // มีแล้วชื่อปุ่มเป็น "เพิ่ม…" — เทสต์และโปรแกรมอ่านหน้าจอแยกได้ว่านี่คือการเพิ่มไม่ใช่เริ่มใหม่
              accessibilityLabel: `${got.length ? "เพิ่ม" : "เลือก"}${slot.label}`,
            }}
            footLeft={slot.foot}
            footTip={slot.video ? "แนะนำ 15-30 วินาที" : undefined}
          >
            {got.length ? (
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
              </View>
            ) : null}
          </EvidenceStep>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  thumbs: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: 2 },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.tile },
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
});
