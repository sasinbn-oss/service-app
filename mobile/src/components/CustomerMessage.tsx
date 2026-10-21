/**
 * ข้อความแจ้งคิวช่าง + ปุ่มคัดลอก — การ์ดในหน้าใบงาน และหน้าต่างที่เด้งหลังแอดมินกดคอนเฟิร์ม
 * ข้อความอยู่ใน utils/customerMessage.ts ที่เดียว ทั้งสองที่จึงคัดลอกได้ข้อความเดียวกันเสมอ
 */
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import AppModal from "./AppModal";
import { showAlert } from "../utils/alert";
import { customerMessage, MessageOrder } from "../utils/customerMessage";
import { colors, radius, spacing } from "../theme";

export function CopyButton({ text, label = "คัดลอก" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await Clipboard.setStringAsync(text);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      // เบราว์เซอร์บางตัว (หรือแอปที่ฝังเว็บ) ไม่ยอมให้เขียนคลิปบอร์ด — บอกให้กดค้างเลือกเองจากกล่องข้อความ
      showAlert("คัดลอกไม่ได้", "กดค้างที่ข้อความแล้วเลือกคัดลอกแทน");
    }
  }
  return (
    <TouchableOpacity
      style={[styles.copy, done && styles.copyDone]}
      onPress={copy}
      accessibilityLabel="คัดลอกข้อความแจ้งลูกค้า"
    >
      <Ionicons name={done ? "checkmark" : "copy-outline"} size={15} color="#fff" />
      <Text style={styles.copyText}>{done ? "คัดลอกแล้ว" : label}</Text>
    </TouchableOpacity>
  );
}

function Bubble({ text }: { text: string }) {
  return (
    <Text style={styles.bubble} selectable>
      {text}
    </Text>
  );
}

export function CustomerMessageCard({ order, style }: { order: MessageOrder; style?: object }) {
  const text = customerMessage(order);
  return (
    <View style={[style, { gap: spacing.sm }]}>
      <View style={styles.head}>
        <Text style={styles.title}>💬 ข้อความแจ้งลูกค้า</Text>
        <View style={{ flex: 1 }} />
        <CopyButton text={text} />
      </View>
      <Bubble text={text} />
      <Text style={styles.hint}>สร้างจากใบงานตอนนี้ — เลื่อนนัดแล้วข้อความเปลี่ยนตามเอง</Text>
    </View>
  );
}

/** เด้งหลังแอดมินกดคอนเฟิร์มลูกค้า — จังหวะที่ต้องส่งข้อความพอดี ไม่ต้องเลื่อนหาการ์ด */
export function CustomerMessageModal({ order, onClose }: { order: MessageOrder; onClose: () => void }) {
  const text = customerMessage(order);
  return (
    <AppModal
      visible
      onClose={onClose}
      title={`คอนเฟิร์มลูกค้าแล้ว · ${order.code}`}
      subtitle="คัดลอกข้อความไปส่งลูกค้าได้เลย"
      footer={
        <View style={styles.footer}>
          <TouchableOpacity style={styles.ghost} onPress={onClose}>
            <Text style={styles.ghostText}>ปิด</Text>
          </TouchableOpacity>
          <CopyButton text={text} label="คัดลอกข้อความ" />
        </View>
      }
    >
      <View style={{ gap: spacing.md }}>
        <View style={styles.saved}>
          <Ionicons name="checkmark-circle" size={16} color={colors.successInk} />
          <Text style={styles.savedText}>บันทึกแล้ว</Text>
        </View>
        <Bubble text={text} />
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontSize: 15, fontWeight: "700", color: colors.text },
  // สีเขียว LINE — ปุ่มนี้มีไว้วางข้อความใน LINE เป็นหลัก
  copy: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#06C755", borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 7 },
  copyDone: { backgroundColor: colors.successInk },
  copyText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  bubble: {
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successLine,
    borderRadius: radius.md,
    borderBottomLeftRadius: 4,
    padding: spacing.md,
    fontSize: 13.5,
    lineHeight: 23,
    color: colors.text,
  },
  hint: { fontSize: 12, color: colors.textMuted },
  footer: { flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  ghost: { borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card },
  ghostText: { color: colors.navy, fontWeight: "700" },
  saved: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.successSoft, borderRadius: radius.md, padding: 8 },
  savedText: { color: colors.successInk, fontWeight: "700", fontSize: 13 },
});
