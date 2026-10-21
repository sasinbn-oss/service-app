/**
 * ช่องจำนวน (อะไหล่ · อะไหล่นอกสโตร์) — พิมพ์ได้จริง + ปุ่ม − / +
 *
 * เดิมช่องผูกกับตัวเลขตรง ๆ ลบให้ว่างไม่ได้ (ว่าง = เด้งกลับเป็น 1 ทันที) ลบ "1" แล้วพิมพ์ 8 จึงได้ "18"
 * ช่างเลยใช้วิธีกดเลือกอะไหล่ซ้ำ 8 ครั้งแทน (เจ้าของงานแจ้ง ต.ค. 69 — โช๊ค 8 ตัวต้องกด 8 ครั้ง)
 * ตอนนี้เก็บข้อความที่กำลังพิมพ์ไว้เอง ว่างได้ระหว่างพิมพ์ ออกจากช่องแล้วยังว่างค่อยเป็น 1
 * แตะช่องแล้วเลือกเลขเดิมทั้งตัว พิมพ์ทับได้เลย
 */
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import TouchableOpacity from "./Tap";
import { colors, radius } from "../theme";

const MAX = 999;

export default function QtyInput({
  value,
  onChange,
  accessibilityLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  accessibilityLabel: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  // ค่าเปลี่ยนจากข้างนอก (กด − + หรือเลือกอะไหล่ซ้ำ) — ตามค่าใหม่ เว้นแต่กำลังพิมพ์อยู่
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const step = (d: number) => {
    const next = Math.min(MAX, Math.max(1, value + d));
    setText(String(next));
    onChange(next);
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.btn, value <= 1 && styles.btnOff]}
        onPress={() => step(-1)}
        disabled={value <= 1}
        accessibilityLabel={`ลด${accessibilityLabel}`}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Text style={styles.btnText}>−</Text>
      </TouchableOpacity>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(t) => {
          const digits = t.replace(/[^0-9]/g, "").slice(0, 3);
          setText(digits);
          if (digits !== "") onChange(Math.min(MAX, Math.max(1, Number(digits))));
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (text === "" || Number(text) < 1) {
            setText("1");
            onChange(1);
          }
        }}
        selectTextOnFocus
        keyboardType="number-pad"
        maxLength={3}
        accessibilityLabel={accessibilityLabel}
      />
      <TouchableOpacity
        style={[styles.btn, value >= MAX && styles.btnOff]}
        onPress={() => step(1)}
        disabled={value >= MAX}
        accessibilityLabel={`เพิ่ม${accessibilityLabel}`}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Text style={styles.btnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  btn: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  btnOff: { opacity: 0.4 },
  btnText: { fontSize: 17, lineHeight: 20, fontWeight: "700", color: colors.primaryInk },
  input: {
    width: 44,
    textAlign: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 4,
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    backgroundColor: colors.background,
  },
});
