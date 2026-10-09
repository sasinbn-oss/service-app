/**
 * ช่องเวลา HH:MM — กดแล้วกล่องเวลาลอยขึ้นมา เลือกทีละครึ่งชั่วโมง หรือพิมพ์เอง
 *
 * ไม่ใช้ time picker ของระบบเพราะเว็บกับมือถือหน้าตาคนละแบบ เวลานัดหน้างานแทบทั้งหมด
 * ลงครึ่งชั่วโมง กดทีเดียวจบ ที่ไม่ลง (08:45) พิมพ์เองได้ ว่าง = ยังไม่ได้ตกลงเวลา
 */
import React, { useRef, useState } from "react";
import { ScrollView, StyleProp, StyleSheet, Text, TextInput, TextStyle, View } from "react-native";
import TouchableOpacity from "./Tap";
import Ionicons from "@expo/vector-icons/Ionicons";
import Popover from "./Popover";
import { colors, radius, spacing } from "../theme";

export function isTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

const SLOTS: string[] = [];
for (let h = 7; h <= 19; h++) for (const m of ["00", "30"]) SLOTS.push(`${String(h).padStart(2, "0")}:${m}`);
const GROUPS: [string, string, string][] = [
  ["เช้า", "07:00", "12:00"],
  ["บ่าย", "12:00", "17:00"],
  ["เย็น", "17:00", "20:00"],
];

/** "930" "0930" "9:30" → "09:30" — คนพิมพ์บนมือถือหาโคลอนยาก */
function normalise(t: string) {
  const digits = t.replace(/\D/g, "");
  if (digits.length < 3 || digits.length > 4) return t;
  const p = digits.padStart(4, "0");
  return `${p.slice(0, 2)}:${p.slice(2)}`;
}

export default function TimeField({
  value,
  onChange,
  label,
  emptyHint = "ไม่ระบุเวลา",
  labelStyle,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  emptyHint?: string;
  labelStyle?: StyleProp<TextStyle>;
}) {
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState("");
  const [bad, setBad] = useState(false);
  const anchor = useRef<View>(null);

  function pick(t: string) {
    onChange(t);
    setOpen(false);
  }
  function useOwn() {
    const t = normalise(own);
    if (!isTime(t)) return setBad(true);
    pick(t);
  }

  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}
      <View ref={anchor}>
        <TouchableOpacity
          style={[styles.field, open && styles.fieldOpen]}
          onPress={() => {
            setOwn(value && !SLOTS.includes(value) ? value : "");
            setBad(false);
            setOpen((v) => !v);
          }}
          activeOpacity={0.7}
          accessibilityLabel={label || "เวลา"}
          accessibilityState={{ expanded: open }}
        >
          <Ionicons name="time-outline" size={17} color={colors.primaryInk} />
          <Text style={[styles.value, !value && styles.placeholder]}>
            {value ? `${value} น.` : emptyHint}
          </Text>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} />
        </TouchableOpacity>
      </View>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={300} maxHeight={380}>
        <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 10, gap: 6 }} keyboardShouldPersistTaps="handled">
          {GROUPS.map(([name, from, to]) => (
            <View key={name} style={{ gap: 4 }}>
              <Text style={styles.group}>{name}</Text>
              <View style={styles.grid}>
                {SLOTS.filter((t) => t >= from && t < to).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.slot, t === value && styles.slotOn]}
                    onPress={() => pick(t)}
                    accessibilityLabel={`${t} น.`}
                    accessibilityState={{ selected: t === value }}
                  >
                    <Text style={[styles.slotText, t === value && styles.slotTextOn]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={styles.ownRow}>
          <TextInput
            style={[styles.ownInput, bad && { borderColor: colors.danger }]}
            value={own}
            onChangeText={(t) => {
              setBad(false);
              setOwn(t);
            }}
            onSubmitEditing={useOwn}
            placeholder="08:45"
            placeholderTextColor={colors.textFaint}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            accessibilityLabel="พิมพ์เวลาเอง"
          />
          <TouchableOpacity style={styles.ownBtn} onPress={useOwn}>
            <Text style={styles.ownBtnText}>ใช้เวลานี้</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {value ? (
            <TouchableOpacity onPress={() => pick("")}>
              <Text style={styles.clearText}>ไม่ระบุ</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {bad ? <Text style={styles.badText}>เวลาต้องเป็น ชั่วโมง:นาที เช่น 08:45</Text> : null}
      </Popover>
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
  value: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22, color: colors.text },
  placeholder: { color: colors.textFaint },
  scroll: { flexShrink: 1 },
  group: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  slot: {
    width: "23.5%",
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  slotOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  slotText: { fontSize: 14, color: colors.text, fontVariant: ["tabular-nums"] },
  slotTextOn: { color: "#fff", fontWeight: "700" },
  ownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 8,
  },
  ownInput: {
    width: 76,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.background,
  },
  ownBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  ownBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  clearText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  badText: { fontSize: 12, color: colors.danger, paddingHorizontal: 10, paddingBottom: 8 },
});
