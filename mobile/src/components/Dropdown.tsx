/**
 * ช่องเลือกแบบ dropdown
 *
 * รายการลอยทับฟอร์ม (Popover) ไม่แทรกลงไปดันช่องอื่น — เดิมกางในที่ หน้าต่างจัดแผน/จ่ายงาน
 * ยืดตามจนช่องที่กำลังกรอกหลุดจอ ไม่ได้เปิดเป็น Modal ซ้อน เพราะทุกที่ที่ใช้ตัวนี้อยู่ใน Modal
 * อยู่แล้ว Modal ซ้อน Modal บน react-native-web พังแบบกดอะไรไม่ได้เลย (ดู Popover)
 *
 * มีช่องค้นหาให้เมื่อรายการยาว — ทีมช่างมี 22 ทีม การเลื่อนหาทีละอันคือ
 * สิ่งที่ dropdown ควรแก้ ไม่ใช่สิ่งที่มันควรสร้างขึ้นมาใหม่
 */
import React, { useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Popover from "./Popover";
import { colors, radius, spacing } from "../theme";

export interface DropdownOption {
  value: string;
  label: string;
  /** บรรทัดเล็กใต้ชื่อ เช่น รหัสพนักงาน หรือจำนวนสาขาที่ทีมดูแล */
  hint?: string;
}

/** รายการยาวกว่านี้ถึงจะมีช่องค้นหา สั้นกว่านี้กวาดตาหาเร็วกว่าพิมพ์ */
const SEARCH_FROM = 8;

/** ตัวรายการ (ค้นหา + แถว) — ใช้ใน dropdown และในกล่องลอยอื่นที่เปิดจากปุ่ม เช่น ยืมช่างจากทีมอื่น */
export function OptionList({
  options,
  value,
  onPick,
  clearable,
  label,
}: {
  options: DropdownOption[];
  value?: string | null;
  onPick: (next: string | null) => void;
  clearable?: boolean;
  label?: string;
}) {
  const [term, setTerm] = useState("");
  const filtered = useMemo(() => {
    const keyword = term.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(keyword) || (o.hint ?? "").toLowerCase().includes(keyword)
    );
  }, [options, term]);

  return (
    <View style={styles.listWrap}>
      {options.length >= SEARCH_FROM ? (
        <View style={styles.search}>
          <Ionicons name="search" size={14} color={colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            value={term}
            onChangeText={setTerm}
            placeholder="ค้นหา"
            placeholderTextColor={colors.textFaint}
            autoFocus
            accessibilityLabel={`ค้นหาใน ${label ?? "รายการ"}`}
          />
        </View>
      ) : null}
      <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {clearable ? (
          <TouchableOpacity style={styles.row} onPress={() => onPick(null)} activeOpacity={0.7}>
            <Text style={[styles.rowLabel, styles.placeholder]}>ไม่ระบุ</Text>
          </TouchableOpacity>
        ) : null}
        {filtered.map((o) => (
          <TouchableOpacity key={o.value} style={[styles.row, o.value === value && styles.rowOn]} onPress={() => onPick(o.value)} activeOpacity={0.7}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.rowLabel, o.value === value && styles.rowLabelOn]}>{o.label}</Text>
              {o.hint ? <Text style={styles.rowHint}>{o.hint}</Text> : null}
            </View>
            {o.value === value ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
          </TouchableOpacity>
        ))}
        {filtered.length === 0 ? <Text style={styles.empty}>ไม่พบ “{term.trim()}”</Text> : null}
      </ScrollView>
    </View>
  );
}

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
  const anchor = useRef<View>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <View>
      <View ref={anchor}>
        <TouchableOpacity
          style={[styles.field, open && styles.fieldOpen, disabled && styles.fieldOff]}
          onPress={() => !disabled && setOpen((v) => !v)}
          activeOpacity={0.7}
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ expanded: open }}
        >
          <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
            {selected ? selected.label : placeholder}
          </Text>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} />
        </TouchableOpacity>
      </View>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)}>
        <OptionList
          options={options}
          value={value}
          clearable={clearable}
          label={accessibilityLabel}
          onPick={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      </Popover>
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
  // ในกล่องลอยที่จำกัดความสูงไว้ — ให้รายการหดตามแล้วเลื่อนข้างใน ช่องค้นหาอยู่กับที่
  listWrap: { flexShrink: 1, minHeight: 0 },
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
  // ราว 6 แถว — พอให้เห็นว่ายังมีต่อข้างล่าง
  list: { flexShrink: 1, maxHeight: 290 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowOn: { backgroundColor: colors.primarySoft },
  rowLabel: { fontSize: 14, lineHeight: 22, color: colors.text },
  rowLabelOn: { color: colors.primaryDark, fontWeight: "700" },
  rowHint: { fontSize: 11, lineHeight: 19, color: colors.textFaint },
  empty: { padding: spacing.md, fontSize: 12, lineHeight: 20, color: colors.textFaint },
});
