import React from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radius, shadow, spacing } from "../theme";

/**
 * หน้าต่างลอยแบบ OTTERI ที่ทุกหน้าใช้ร่วมกัน
 *
 * หัวหน้าต่างแยกจากเนื้อหา (ชื่อ + ปุ่มปิด ✕ เส้นคั่น) และไม่เลื่อนหายไปตอนเลื่อนอ่าน
 * — ฟอร์มยาวเลื่อนลงไปแล้วยังเห็นว่ากำลังทำอะไรกับใบไหน และปิดได้จากมุมบนเสมอ
 * เดิมแต่ละหน้าวาดหน้าต่างเอง ขนาด มุม และตำแหน่งปุ่มจึงไม่ตรงกันสักหน้า
 *
 * แตะพื้นหลังมืดเพื่อปิดได้ ยกเว้นตอนกำลังบันทึก (busy) — กันปิดหน้าต่าง
 * กลางทางแล้วไม่รู้ว่าบันทึกไปแล้วหรือยัง
 */
export default function AppModal({
  visible,
  title,
  subtitle,
  onClose,
  footer,
  children,
  width = 640,
  busy,
  bodyStyle,
}: {
  visible: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  busy?: boolean;
  bodyStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} accessibilityLabel="ปิดหน้าต่าง" />
        <View style={[styles.card, { maxWidth: width }]}>
          <View style={styles.head}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity
              style={styles.close}
              onPress={onClose}
              disabled={busy}
              accessibilityLabel="ปิด"
            >
              <Ionicons name="close" size={24} color={colors.primaryInk} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={[styles.body, bodyStyle]}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.foot}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

/** แถว "หัวข้อ — ค่า" แบบในหน้าต่างรายละเอียดของ OTTERI */
export function ModalRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof children === "string" || typeof children === "number" ? (
          <Text style={styles.rowValue}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/** หัวข้อย่อยในหน้าต่าง มีไอคอนนำหน้า */
export function ModalSection({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={styles.section}>
      <Ionicons name={icon} size={20} color={colors.navy} />
      <Text style={styles.sectionText}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.42)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    // เบลอหน้าข้างหลังแบบต้นแบบ ให้สายตาอยู่ที่หน้าต่างอย่างเดียว (มีผลเฉพาะเว็บ)
    ...(Platform.OS === "web" ? ({ backdropFilter: "blur(3px)" } as object) : null),
  },
  card: {
    width: "100%",
    maxHeight: "92%",
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    overflow: "hidden",
    ...shadow.raised,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingLeft: spacing.xl,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 18, lineHeight: 28, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 13, lineHeight: 20, color: colors.textMuted, marginTop: 2 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sky50,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  foot: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  row: { flexDirection: "row", gap: spacing.md, paddingVertical: 8 },
  rowLabel: { width: 140, fontSize: 15, lineHeight: 24, color: colors.textMuted },
  rowValue: { fontSize: 15, lineHeight: 24, color: colors.text },
  section: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionText: { fontSize: 17, lineHeight: 26, fontWeight: "800", color: colors.text },
});
