/**
 * การ์ดแนบไฟล์แบบทีละขั้น (1 · 2 · 3) — ใช้กับไฟล์ตรวจหน้างานและฟอร์มปิดงานของช่าง
 *
 * เจ้าของงานส่งแบบมาให้ (ต.ค. 69): เลขขั้นบอกลำดับว่าต้องถ่ายอะไรก่อนหลัง ป้าย "ยังไม่มี/✓"
 * บอกว่าเหลืออะไร และปุ่มใหญ่สองปุ่ม "ถ่ายทันที / เลือกจากอัลบั้ม" กดง่ายตอนยืนหน้าเครื่อง
 * — เดิมเป็นกรอบสีต่างกันกับปุ่มเล็ก ช่างไม่รู้ว่าต้องเริ่มตรงไหน
 *
 * แนบครบแล้วการ์ดยุบเหลือรูปย่อกับปุ่มเล็ก ให้เลื่อนน้อยลงและเห็นว่าขั้นไหนยังค้าง
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import Spinner from "./Spinner";
import FileDropZone, { DropHint } from "./FileDropZone";
import { colors, radius, spacing } from "../theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
export interface StepButton {
  label: string;
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
}

export default function EvidenceStep({
  n,
  title,
  required = true,
  hint,
  done,
  doneText,
  canEdit = true,
  primary,
  secondary,
  more = [],
  footLeft,
  footTip,
  busy,
  accessibilityLabel,
  children,
  onDropFiles,
  dropHint,
}: {
  n: number;
  title: string;
  required?: boolean;
  hint?: string;
  done: boolean;
  /** ป้ายตอนครบ เช่น "✓ 2 รูป" */
  doneText?: string;
  canEdit?: boolean;
  /** ปุ่มทึบ (ถ่ายทันที) — ไม่ส่งมา = มีแต่ปุ่มเลือก */
  primary?: StepButton | null;
  secondary: StepButton;
  /** ปุ่มเล็กเพิ่มเติม เช่น "วิดีโอ" ในขั้นที่รับได้ทั้งรูปและคลิป */
  more?: StepButton[];
  footLeft?: string;
  footTip?: string;
  /** กำลังย่อ/ส่งไฟล์ — แทนที่ปุ่มทั้งแถว กันกดซ้ำ */
  busy?: string | null;
  accessibilityLabel?: string;
  /** รูปย่อของไฟล์ที่แนบแล้ว */
  children?: React.ReactNode;
  /** ลากไฟล์มาวางที่การ์ดนี้ได้ (เว็บ) — ได้ผลเท่ากับกดปุ่มเลือก */
  onDropFiles?: (files: File[]) => void;
  /** การ์ดนี้รับอะไร เช่น "รูป" · "วิดีโอ" — ขึ้นตอนลากไฟล์มา */
  dropHint?: string;
}) {
  return (
    <FileDropZone
      style={[styles.card, done && styles.cardDone]}
      label={accessibilityLabel}
      onFiles={(files) => onDropFiles?.(files)}
      disabled={!onDropFiles || !canEdit || !!busy}
      hint={dropHint}
    >
      <View style={styles.head}>
        <View style={[styles.num, done && styles.numDone]}>
          {done ? (
            <Ionicons name="checkmark" size={16} color={colors.successInk} />
          ) : (
            <Text style={styles.numText}>{n}</Text>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>
            {title}
            {required && !done ? <Text style={{ color: colors.danger }}> *</Text> : null}
          </Text>
          {hint && (!done || !canEdit) ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
        {done ? (
          <Text style={[styles.badge, styles.badgeOk]}>{doneText ?? "✓ แนบแล้ว"}</Text>
        ) : canEdit ? (
          <Text style={[styles.badge, styles.badgeMiss]}>ยังไม่มี</Text>
        ) : (
          <Text style={[styles.badge, styles.badgeNone]}>ไม่มี</Text>
        )}
      </View>

      {children}

      {!canEdit ? null : busy ? (
        <View style={styles.busy}>
          <Spinner color={colors.roleSupervisor} size="small" />
          <Text style={styles.busyText}>{busy}…</Text>
        </View>
      ) : done ? (
        // แนบแล้วก็เพิ่มได้อีกเสมอ — อาการเดียวมักต้องถ่ายหลายมุม
        <View style={styles.smallRow}>
          {primary ? <SmallBtn b={primary} /> : null}
          <SmallBtn b={secondary} />
          {more.map((b) => (
            <SmallBtn key={b.accessibilityLabel} b={b} />
          ))}
        </View>
      ) : (
        <>
          <View style={styles.bigRow}>
            {primary ? (
              <TouchableOpacity
                style={[styles.big, styles.bigFill]}
                onPress={primary.onPress}
                activeOpacity={0.8}
                accessibilityLabel={primary.accessibilityLabel}
              >
                <Ionicons name={primary.icon} size={18} color="#fff" />
                <Text style={[styles.bigText, { color: "#fff" }]}>{primary.label}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.big, styles.bigOut]}
              onPress={secondary.onPress}
              activeOpacity={0.8}
              accessibilityLabel={secondary.accessibilityLabel}
            >
              <Ionicons name={secondary.icon} size={18} color={colors.roleSupervisor} />
              <Text style={[styles.bigText, { color: colors.roleSupervisor }]}>{secondary.label}</Text>
            </TouchableOpacity>
          </View>
          {more.length ? (
            <View style={styles.smallRow}>
              {more.map((b) => (
                <SmallBtn key={b.accessibilityLabel} b={b} />
              ))}
            </View>
          ) : null}
          {footLeft || footTip ? (
            <View style={styles.foot}>
              <Text style={styles.footText}>{footLeft}</Text>
              {footTip ? <Text style={styles.tip}>{footTip}</Text> : null}
            </View>
          ) : null}
          {onDropFiles ? <DropHint /> : null}
        </>
      )}
    </FileDropZone>
  );
}

function SmallBtn({ b }: { b: StepButton }) {
  return (
    <TouchableOpacity style={styles.small} onPress={b.onPress} activeOpacity={0.7} accessibilityLabel={b.accessibilityLabel}>
      <Ionicons name={b.icon} size={15} color={colors.roleSupervisor} />
      <Text style={styles.smallText}>{b.label}</Text>
    </TouchableOpacity>
  );
}

/** ขั้นที่เป็นช่องพิมพ์ (เช่น "ตรวจแล้วเจออะไร") — หน้าตาเดียวกับขั้นแนบไฟล์ เลขต่อกัน */
export function TextStep({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.card, done && styles.cardDone]}>
      <View style={styles.head}>
        <View style={[styles.num, done && styles.numDone]}>
          {done ? <Ionicons name="checkmark" size={16} color={colors.successInk} /> : <Text style={styles.numText}>{n}</Text>}
        </View>
        <Text style={[styles.title, { flex: 1 }]}>
          {title}
          {done ? null : <Text style={{ color: colors.danger }}> *</Text>}
        </Text>
      </View>
      {children}
    </View>
  );
}

/** กล่องเหลือง "ยังขาด" ท้ายฟอร์ม — บอกครั้งเดียวว่าทำไมปุ่มส่งยังกดไม่ได้ */
export function MissingBox({ items, why }: { items: string[]; why: string }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.missBox}>
      <Ionicons name="warning-outline" size={18} color={colors.warningInk} />
      <Text style={styles.missText}>
        <Text style={{ fontWeight: "800" }}>ยังขาด: {items.join(" · ")}</Text>
        {"\n"}
        {why}
      </Text>
    </View>
  );
}

/** กล่องฟ้า "ขั้นตอนถัดไป" — ส่งแล้วใบงานไปอยู่ที่ใคร */
export function NextBox({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.nextBox}>
      <Ionicons name="information-circle-outline" size={18} color={colors.navy} />
      <Text style={styles.nextText}>
        <Text style={{ fontWeight: "800" }}>ขั้นตอนถัดไป: </Text>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardDone: { borderColor: colors.doneLine },
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  num: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.roleSupervisorSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  numDone: { backgroundColor: colors.successSoft },
  numText: { fontSize: 14, fontWeight: "800", color: colors.roleSupervisor },
  title: { fontSize: 15, fontWeight: "800", color: colors.text },
  hint: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted, marginTop: 1 },
  badge: { fontSize: 11.5, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, overflow: "hidden" },
  badgeMiss: { color: colors.warningInk, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warningBorder },
  badgeOk: { color: colors.successInk, backgroundColor: colors.successSoft },
  badgeNone: { color: colors.textFaint },
  bigRow: { flexDirection: "row", gap: spacing.sm },
  big: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.roleSupervisor,
  },
  bigFill: { backgroundColor: colors.roleSupervisor },
  bigOut: { backgroundColor: colors.card },
  bigText: { fontSize: 13.5, fontWeight: "800" },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, flexWrap: "wrap" },
  footText: { fontSize: 11.5, color: colors.textFaint, flexShrink: 1 },
  tip: {
    fontSize: 11.5,
    fontWeight: "700",
    color: colors.rollback,
    backgroundColor: colors.rollbackSoft,
    paddingHorizontal: 6,
    borderRadius: 6,
    overflow: "hidden",
  },
  smallRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  small: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  smallText: { fontSize: 12.5, fontWeight: "700", color: colors.roleSupervisor },
  busy: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 10 },
  busyText: { fontSize: 13, color: colors.textMuted },
  missBox: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSoft,
  },
  missText: { flex: 1, fontSize: 12.5, lineHeight: 20, color: colors.warningInk },
  nextBox: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.tile,
  },
  nextText: { flex: 1, fontSize: 12.5, lineHeight: 20, color: colors.body },
});
