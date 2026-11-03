/**
 * ปุ่มเลือกยี่ห้อเครื่อง (เจ้าของงานตอบข้อ 17 ต.ค. 69) — ใช้ทุกที่ที่ต้องรู้ยี่ห้อก่อนเลือกอะไหล่ได้
 * (ช่องเลือกอะไหล่ทุกช่องของใบที่เครื่องยังไม่รู้ยี่ห้อ · ชีตแก้ยี่ห้อเครื่องบนหน้าใบงาน · ฟอร์มเปิดใบงานตามมาใช้ตัวเดียวกัน)
 *
 * ปุ่มตายตัว + "อื่นๆ" แล้วพิมพ์ — ไม่ใช่ช่องพิมพ์อย่างเดียว เพราะยี่ห้อตัดสินไฟล์อะไหล่ที่เลือกได้:
 * พิมพ์ "Hubsch" ผิดตัวเดียว เครื่องตกไปไฟล์ Other ช่างหาอะไหล่ Huebsch ไม่เจอ และค่านี้จำไว้กับเครื่องตลอด
 * ไม่ใช่ Modal และไม่มี Dropdown — อยู่ในฟอร์มที่เป็น Modal อยู่แล้ว (Modal ซ้อน Modal บนเว็บไม่น่าเชื่อถือ)
 */
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { colors, radius, spacing } from "../theme";

/**
 * ค่าสำรองเผื่อหน้าที่ไม่ได้โหลด /work-orders/options (กระดานเครื่องดับ) — ต้องตรงกับ MACHINE_MODELS
 * ใน backend/src/utils/constants.ts และ FALLBACK_MODELS ของฟอร์มเปิดใบงาน (Spinz เพิ่ม 31 ต.ค. 69 · ค่าตั้งต้น D18)
 */
const FALLBACK_MACHINE_MODELS = ["Oasis", "Oasis(TC)", "Huebsch", "Huebsch (TC)", "Haier", "Maytag", "Spinz"];
export const BRAND_OTHER = "อื่นๆ";

let machineModels: string[] = FALLBACK_MACHINE_MODELS;
/**
 * หน้าใบงานโหลดตัวเลือกจากเซิร์ฟเวอร์อยู่แล้วทุกครั้ง — จำรายการไว้ให้ปุ่มทุกตัวใช้ ไม่ยิงซ้ำในแต่ละช่องเลือกอะไหล่
 * เซิร์ฟเวอร์เพิ่มยี่ห้อแล้วปุ่มตามทันโดยไม่ต้องออกแอปใหม่
 */
export function rememberMachineModels(list: string[] | null | undefined) {
  if (list?.length) machineModels = list;
}

/** ยี่ห้อนี้เป็นปุ่มในรายการ (ไม่ใช่ข้อความที่พิมพ์ใน "อื่นๆ") — ข้อความ "จะบันทึกยี่ห้อ X" กับ "ยี่ห้อที่พิมพ์" ต่างกันตรงนี้ */
export function isListedBrand(brand: string | null | undefined): boolean {
  return !!brand && machineModels.includes(brand);
}

export default function BrandChips({
  value,
  onChange,
  machineCode,
  label = "ยี่ห้อเครื่อง",
  locked,
  disabled,
}: {
  /** ยี่ห้อที่เลือกอยู่ (ชื่อปุ่ม หรือข้อความที่พิมพ์ใน "อื่นๆ") — null = ยังไม่ได้เลือก */
  value: string | null;
  onChange: (brand: string | null) => void;
  machineCode?: string | null;
  label?: string | null;
  /** เครื่องรู้ยี่ห้อแล้ว — ปุ่มเดียวแบบล็อก แก้จากฟอร์มไม่ได้ (แก้ได้ที่หัวหน้าภาค/แอดมินบนหน้าใบงาน — ข้อ 17) */
  locked?: { make: string } | null;
  disabled?: boolean;
}) {
  const models = machineModels;
  const [other, setOther] = useState(!!value && !models.includes(value));
  const [typed, setTyped] = useState(value && !models.includes(value) ? value : "");

  /**
   * ค่าที่มาจากนอก (ร่างฟอร์มที่เปิดกลับมา · ฟอร์มล้างค่าตอนเปิดใหม่) — ปุ่มที่ติดต้องตรงกับค่านั้น ไม่ใช่สถานะที่ค้างจากครั้งก่อน
   * แยกจากค่าที่ปุ่มนี้ส่งออกไปเอง: กด "อื่นๆ" แล้วยังไม่พิมพ์ก็ส่ง null เหมือนกัน แต่ต้องคงช่องพิมพ์ไว้
   */
  const emitted = useRef<string | null>(value);
  const emit = (b: string | null) => {
    emitted.current = b;
    onChange(b);
  };
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    if (!value) {
      setOther(false);
      setTyped("");
    } else if (models.includes(value)) setOther(false);
    else {
      setOther(true);
      setTyped(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (locked) {
    return (
      <View style={styles.wrap}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <View style={styles.lockedPill}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.lockedMake}>{locked.make}</Text>
            <Text style={styles.lockedNote}>
              ยี่ห้อในระบบของเครื่อง{machineCode ? ` ${machineCode}` : ""} — ใช้หาไฟล์อะไหล่ คิดอายุประกัน และการเสนอราคา
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const pick = (m: string) => {
    if (m === BRAND_OTHER) {
      setOther(true);
      emit(typed.trim() || null);
    } else {
      setOther(false);
      emit(m);
    }
  };

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.chips}>
        {[...models, BRAND_OTHER].map((m) => {
          const on = m === BRAND_OTHER ? other : !other && value === m;
          return (
            <TouchableOpacity
              key={m}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => pick(m)}
              disabled={disabled}
              activeOpacity={0.7}
              accessibilityLabel={`ยี่ห้อเครื่อง ${m}`}
              accessibilityState={{ selected: on }}
              // เว็บไม่แปลง accessibilityState เป็น aria-selected (เหมือน FilterBar) — ใส่เอง ไม่งั้นโปรแกรมอ่านจอ
              // และเทสต์บนเว็บไม่รู้ว่าตอนนี้เลือกยี่ห้อไหนอยู่ ต้องไปเดาจากสีปุ่ม
              aria-selected={on}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{m}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {other ? (
        <>
          <Text style={styles.subLabel}>ชื่อยี่ห้อ</Text>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={(v) => {
              setTyped(v);
              emit(v.trim() || null);
            }}
            editable={!disabled}
            placeholder="พิมพ์ชื่อยี่ห้อ"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={`ชื่อยี่ห้อเครื่อง${machineCode ? ` ${machineCode}` : ""}`}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.text },
  subLabel: { fontSize: 12, lineHeight: 18, fontWeight: "600", color: colors.textMuted, marginTop: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  // สูง 40+ — กดด้วยนิ้วโป้งตอนยืนหน้าเครื่องได้ (ตัวอย่างใช้ 48 · ปุ่มเรียงหลายแถวบนจอแคบจึงลดเหลือ 40)
  chip: {
    minHeight: 40,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 2 },
  chipText: { fontSize: 14, lineHeight: 20, color: colors.text, fontWeight: "600" },
  chipTextOn: { color: colors.primaryInk, fontWeight: "700" },
  input: {
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
  lockedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  lockedMake: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.text },
  lockedNote: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
});
