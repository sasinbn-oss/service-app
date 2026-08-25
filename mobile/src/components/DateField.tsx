/**
 * ช่องกรอกวันที่แบบ YYYY-MM-DD พร้อมปุ่มลัด
 *
 * ไม่ใช้ date picker ของระบบ เพราะหน้าตาและพฤติกรรมไม่เหมือนกันระหว่างเว็บกับมือถือ
 * และแอปนี้ใช้ทั้งสองทาง ปุ่มลัดทำให้เคสส่วนใหญ่ (วันนี้ พรุ่งนี้) กดครั้งเดียวจบ
 */
import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";

export function thaiDate(ymd: string | null) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${d} ${months[m - 1]} ${String((y + 543) % 100).padStart(2, "0")}`;
}

export default function DateField({
  value,
  onChange,
  label,
  emptyHint = "เว้นว่างได้ถ้ายังไม่ได้นัด",
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  emptyHint?: string;
}) {
  function shift(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    onChange(d.toISOString().slice(0, 10));
  }

  const valid = value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, !valid && styles.inputBad]}
          value={value}
          onChangeText={onChange}
          placeholder="2026-08-27"
          placeholderTextColor={colors.textFaint}
          maxLength={10}
          accessibilityLabel={label}
        />
        {value ? (
          <TouchableOpacity
            onPress={() => onChange("")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={20} color={colors.textFaint} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.options}>
        <TouchableOpacity style={styles.option} onPress={() => shift(0)} activeOpacity={0.7}>
          <Text style={styles.optionText}>วันนี้</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.option} onPress={() => shift(1)} activeOpacity={0.7}>
          <Text style={styles.optionText}>พรุ่งนี้</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.option} onPress={() => shift(7)} activeOpacity={0.7}>
          <Text style={styles.optionText}>อีก 7 วัน</Text>
        </TouchableOpacity>
      </View>
      {!valid ? (
        <Text style={styles.error}>รูปแบบวันที่ต้องเป็น ปี-เดือน-วัน เช่น 2026-08-27</Text>
      ) : (
        <Text style={styles.hint}>{value ? thaiDate(value) : emptyHint}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: {
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  inputBad: { borderColor: colors.danger },
  options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  optionText: { fontSize: 13, lineHeight: 21, color: colors.textMuted, fontWeight: "600" },
  error: { fontSize: 13, lineHeight: 21, color: colors.danger, marginTop: spacing.sm },
  hint: { fontSize: 11, lineHeight: 19, color: colors.textFaint, marginTop: spacing.xs },
});
