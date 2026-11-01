/**
 * รูป/วิดีโอในขั้น "งานที่ทำ" ที่ส่งขึ้นใบงานทันทีที่เลือก (เคลมก้อน 5 · ฟอร์มปิดงานที่มีเคลม)
 *
 * เดิมรูปก่อน/หลังซ่อม ป้ายรุ่น ใบเหลืองรอในเครื่องจนกด "ยืนยันปิดงาน" แล้วขึ้นพร้อมกันตอนท้าย — เน็ตหน้าร้านหลุดกลางทาง
 * หรือแอปหลุดก่อนกด รูปก่อนซ่อมหายทั้งที่ถ่ายใหม่ไม่ได้แล้ว (ซ่อมเสร็จ) · ตอนนี้ขึ้นทีละไฟล์ทันที แต่ละรูปบอกสถานะของตัวเอง
 * เอาออก (×) = ลบจากใบงานด้วย (ไฟล์ที่ขึ้นในฟอร์มรอบนี้ยังไม่เป็นหลักฐานของอะไร) ไม่งั้นรูปที่ไม่ใช้ยังนับเป็นรูปก่อนซ่อมและนับเพดานไฟล์
 */
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../Tap";
import Spinner from "../Spinner";
import type { SlotUpload } from "../claims/ClaimFileSlot";
import { attachmentIcon } from "../../utils/attachments";
import { colors, radius, spacing } from "../../theme";

export default function WorkFiles({
  slots,
  label,
  onRemove,
  onRetry,
}: {
  slots: [string, SlotUpload][];
  /** ชื่อขั้น (ก่อนซ่อม · หลังซ่อม · ป้ายรุ่น · ใบเหลือง) — ชื่อปุ่มสำหรับโปรแกรมอ่านจอ/เทสต์ */
  label: string;
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}) {
  if (!slots.length) return null;
  return (
    <View style={styles.row}>
      {slots.map(([key, s], i) => (
        <View key={key} style={styles.item} accessibilityLabel={`ไฟล์${label} ${i + 1}`}>
          {s.file.thumbnailUri ? (
            <Image source={{ uri: s.file.thumbnailUri }} style={[styles.thumb, s.status !== "done" && styles.dim]} />
          ) : (
            <View style={[styles.thumb, styles.blank]}>
              <Ionicons name={attachmentIcon(s.file.kind)} size={22} color={colors.textFaint} />
            </View>
          )}
          {s.status === "uploading" ? (
            <View style={styles.state}>
              <Spinner color={colors.primary} size="small" />
              <Text style={styles.stateText}>กำลังส่ง {Math.round(s.progress * 100)}%</Text>
            </View>
          ) : s.status === "failed" ? (
            <TouchableOpacity style={styles.state} onPress={() => onRetry(key)} accessibilityLabel={`ลองส่งไฟล์${label}ใหม่`}>
              <Text style={[styles.stateText, { color: colors.dangerInk }]}>ส่งไม่สำเร็จ</Text>
              <Text style={[styles.stateText, { color: colors.primaryInk }]}>ลองใหม่</Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.stateText, { color: colors.successInk }]}>✓ แนบแล้ว</Text>
          )}
          <TouchableOpacity
            style={styles.remove}
            onPress={() => onRemove(key)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={`เอาไฟล์${label}ออก ${i + 1}`}
          >
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  item: { width: 96, gap: 2, alignItems: "center" },
  thumb: { width: 88, height: 88, borderRadius: radius.sm, backgroundColor: colors.rowAlt },
  dim: { opacity: 0.6 },
  blank: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  state: { alignItems: "center" },
  stateText: { fontSize: 12, lineHeight: 17, fontWeight: "700", color: colors.body, textAlign: "center" },
  remove: { position: "absolute", top: -6, right: -2, backgroundColor: colors.card, borderRadius: 11 },
});
