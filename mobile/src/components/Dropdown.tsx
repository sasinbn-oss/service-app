/**
 * ช่องเลือกแบบ dropdown
 *
 * กางรายการออกมาในที่ของตัวเอง ไม่ได้เปิดเป็น Modal ซ้อน เพราะทุกที่ที่ใช้
 * ตัวนี้อยู่ใน Modal อยู่แล้ว (หน้าจ่ายงาน หน้าปิดงาน) Modal ซ้อน Modal
 * บน react-native-web ทำงานไม่เหมือนกันในแต่ละที่ และเวลาพังจะพังแบบกดอะไรไม่ได้เลย
 *
 * มีช่องค้นหาให้เมื่อรายการยาว — ทีมช่างมี 22 ทีม การเลื่อนหาทีละอันคือ
 * สิ่งที่ dropdown ควรแก้ ไม่ใช่สิ่งที่มันควรสร้างขึ้นมาใหม่
 */
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radius, spacing } from "../theme";

export interface DropdownOption {
  value: string;
  label: string;
  /** บรรทัดเล็กใต้ชื่อ เช่น รหัสพนักงาน หรือจำนวนสาขาที่ทีมดูแล */
  hint?: string;
}

/** รายการยาวกว่านี้ถึงจะมีช่องค้นหา สั้นกว่านี้กวาดตาหาเร็วกว่าพิมพ์ */
const SEARCH_FROM = 8;

export default function Dropdown({
  value,
  options,
  onChange,
  placeholder = "เลือก",
  disabled,
  clearable,
  accessibilityLabel,
}: {
  value: string | null;
  options: DropdownOption[];
  onChange: (next: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** ให้เลือกเป็น "ไม่ระบุ" ได้ ใช้กับช่องที่ไม่บังคับ */
  clearable?: boolean;
  accessibilityLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(() => {
    const keyword = term.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(keyword) || (o.hint ?? "").toLowerCase().includes(keyword)
    );
  }, [options, term]);

  function pick(next: string | null) {
    onChange(next);
    setOpen(false);
    setTerm("");
  }

  return (
    <View>
      <TouchableOpacity
        style={[styles.field, open && styles.fieldOpen, disabled && styles.fieldOff]}
        onPress={() => !disabled && setOpen((v) => !v)}
        activeOpacity={0.7}
        accessibilityLabel={accessibilityLabel}
      >
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.textFaint}
        />
      </TouchableOpacity>

      {open ? (
        <View style={styles.panel}>
          {options.length >= SEARCH_FROM ? (
            <View style={styles.search}>
              <Ionicons name="search" size={14} color={colors.textFaint} />
              <TextInput
                style={styles.searchInput}
                value={term}
                onChangeText={setTerm}
                placeholder="ค้นหา"
                placeholderTextColor={colors.textFaint}
                accessibilityLabel={`ค้นหาใน ${accessibilityLabel ?? "รายการ"}`}
              />
            </View>
          ) : null}

          <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {clearable ? (
              <TouchableOpacity style={styles.row} onPress={() => pick(null)} activeOpacity={0.7}>
                <Text style={[styles.rowLabel, styles.placeholder]}>ไม่ระบุ</Text>
              </TouchableOpacity>
            ) : null}
            {filtered.map((o) => (
              <TouchableOpacity
                key={o.value}
                style={styles.row}
                onPress={() => pick(o.value)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rowLabel, o.value === value && styles.rowLabelOn]}>
                    {o.label}
                  </Text>
                  {o.hint ? <Text style={styles.rowHint}>{o.hint}</Text> : null}
                </View>
                {o.value === value ? (
                  <Ionicons name="checkmark" size={16} color={colors.primary} />
                ) : null}
              </TouchableOpacity>
            ))}
            {filtered.length === 0 ? (
              <Text style={styles.empty}>ไม่พบ “{term.trim()}”</Text>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  fieldOpen: { borderColor: colors.primary },
  fieldOff: { opacity: 0.5 },
  value: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22, color: colors.text },
  placeholder: { color: colors.textFaint },
  panel: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.sm,
    fontSize: 13,
    lineHeight: 21,
    color: colors.text,
  },
  // สูงพอให้เห็นว่ายังมีต่อข้างล่าง แต่ไม่กินทั้งหน้าจนไม่เห็นช่องที่กำลังกรอก
  list: { maxHeight: 220 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 14, lineHeight: 22, color: colors.text },
  rowLabelOn: { color: colors.primaryDark, fontWeight: "700" },
  rowHint: { fontSize: 11, lineHeight: 19, color: colors.textFaint },
  empty: { padding: spacing.md, fontSize: 12, lineHeight: 20, color: colors.textFaint },
});
