/**
 * ช่องเวลานัดแบบ HH:MM พร้อมปุ่มลัด
 *
 * แบบเดียวกับ DateField — ไม่ใช้ time picker ของระบบเพราะเว็บกับมือถือหน้าตาคนละแบบ
 * และเวลานัดหน้างานแทบทั้งหมดเป็นไม่กี่ค่า (เช้า · สาย · บ่าย) กดทีเดียวจบ
 * ว่างได้ = นัดกันเป็นวัน ยังไม่ได้ตกลงเวลา
 */
import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing } from "../theme";

const QUICK = ["09:00", "10:00", "11:00", "13:00", "14:00", "16:00"];

export function isTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export default function TimeField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
}) {
  const valid = value === "" || isTime(value);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, !valid && styles.inputBad]}
        value={value}
        onChangeText={(t) => {
          // พิมพ์ 930 หรือ 0930 ได้ — ใส่โคลอนให้เอง คนพิมพ์บนมือถือหาโคลอนยาก
          const digits = t.replace(/\D/g, "");
          if (digits.length === 3 || digits.length === 4) {
            const p = digits.padStart(4, "0");
            onChange(`${p.slice(0, 2)}:${p.slice(2)}`);
          } else onChange(t);
        }}
        placeholder="เช่น 09:30 · เว้นว่างได้ถ้ายังไม่ได้ตกลงเวลา"
        placeholderTextColor={colors.textFaint}
        maxLength={5}
        accessibilityLabel={label}
      />
      <View style={styles.quick}>
        {QUICK.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.chip, value === t && styles.chipOn]}
            onPress={() => onChange(value === t ? "" : t)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, value === t && styles.chipTextOn]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!valid ? <Text style={styles.bad}>เวลาต้องเป็น ชั่วโมง:นาที เช่น 09:30</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.card,
  },
  inputBad: { borderColor: colors.danger },
  quick: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text },
  chipTextOn: { color: "#fff", fontWeight: "700" },
  bad: { fontSize: 12, color: colors.danger },
});
