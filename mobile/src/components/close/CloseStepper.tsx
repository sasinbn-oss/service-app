/**
 * แถบขั้นของฟอร์มปิดงานที่มีเคลม (เคลมก้อน 5 · ตัวอย่างที่เจ้าของงานเลือก tabs / tabLine / partTabs)
 *
 * สี่ขั้นตายตัว งานที่ทำ · เครื่อง · เคลมทีละชิ้น · ส่ง — จำนวนขั้นไม่เพิ่มตามจำนวนชิ้น (ชิ้นเป็นแท็บย่อยในขั้นที่ 3)
 * ช่างเห็นตั้งแต่บนสุดว่าขั้นไหนครบแล้ว (วงกลมเขียว ✓) ขั้นไหนยังขาดกี่ข้อ (เหลือง + ตัวเลข) ไม่ต้องเลื่อนหาในฟอร์มยาว
 * เดิมฟอร์มเดียวยาวห้าหกจอ ช่างไม่รู้ว่าเหลืออีกเท่าไหร่ และส่วนเคลมของชิ้นที่สองหายไปท้ายฟอร์ม
 * ปักใต้หัวฟอร์ม (AppModal banner) เลื่อนฟอร์มไปไหนก็ยังเห็น
 */
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import TouchableOpacity from "../Tap";
import { colors, radius, spacing } from "../../theme";

export const STEP_NAMES = ["งานที่ทำ", "เครื่อง", "เคลมทีละชิ้น", "ส่ง"] as const;
/** ชื่อเต็มในบรรทัดใต้แถบ (ตัวอย่าง full) */
export const STEP_FULL = ["งานที่ทำ", "ข้อมูลเครื่องสำหรับเคลม", "เคลมทีละชิ้น", "ตรวจก่อนส่ง"] as const;

export interface StepInfo {
  /** ข้อความใต้ชื่อขั้น: "{done}/{total}" · "ไม่ส่งเคลม" · "ยังขาด {n}" · "พร้อมส่ง" */
  count: string;
  done: boolean;
}

export default function CloseStepper({
  step,
  steps,
  missingHere,
  onPick,
}: {
  step: number;
  steps: StepInfo[];
  /** ของที่ขาดในขั้นปัจจุบัน — บรรทัด "ขั้น i/4 · … · ยังขาด k | ครบแล้ว" */
  missingHere: number;
  onPick: (i: number) => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row} accessibilityRole="tablist" accessibilityLabel="ขั้นปิดงาน">
        {steps.map((s, i) => {
          const on = step === i;
          return (
            <TouchableOpacity
              key={i}
              style={[styles.tab, on && styles.tabOn]}
              onPress={() => onPick(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              aria-current={on ? "step" : undefined}
              accessibilityLabel={`ขั้น ${i + 1} ${STEP_NAMES[i]} ${s.count}`}
            >
              <View style={[styles.circle, s.done ? styles.circleDone : styles.circleTodo, on && styles.circleOn]}>
                <Text style={[styles.mark, { color: s.done ? "#fff" : colors.warningInk }]}>{s.done ? "✓" : String(i + 1)}</Text>
              </View>
              <Text style={[styles.name, on && styles.nameOn]} numberOfLines={1}>
                {STEP_NAMES[i]}
              </Text>
              <Text style={[styles.count, { color: s.done ? colors.successInk : colors.warningInk }]} numberOfLines={1}>
                {s.count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.line}>
        ขั้น {step + 1}/4 · {STEP_FULL[step]} · {missingHere ? `ยังขาด ${missingHere}` : "ครบแล้ว"}
      </Text>
    </View>
  );
}

/** แท็บย่อยของชิ้นในขั้น "เคลมทีละชิ้น" — ชื่อชิ้น + "{done}/{total}" (" ✓" เมื่อครบ) หรือ "ไม่ส่งเคลม" */
export function PartTabs({
  parts,
  current,
  onPick,
}: {
  parts: { id: number; name: string; count: string; done: boolean; skipped: boolean }[];
  current: number | null;
  onPick: (id: number) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.parts} accessibilityLabel="ชิ้นที่เคลม">
      {parts.map((p) => {
        const on = p.id === current;
        return (
          <TouchableOpacity
            key={p.id}
            style={[styles.part, on && styles.partOn]}
            onPress={() => onPick(p.id)}
            accessibilityState={{ selected: on }}
            aria-pressed={on}
            accessibilityLabel={`ชิ้น ${p.name} ${p.count}`}
          >
            <Text style={[styles.partName, on && styles.nameOn]} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={[styles.partCount, { color: p.skipped ? colors.body : p.done ? colors.successInk : colors.warningInk }]}>{p.count}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // ใต้หัวฟอร์ม เหนือส่วนที่เลื่อน — เส้นล่างแบ่งให้เห็นว่าแถบนี้อยู่กับที่
  wrap: {
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  row: { flexDirection: "row", gap: 4 },
  // ช่องละหนึ่งในสี่ของความกว้าง — จอ 360 px ต้องเห็นครบสี่ขั้นโดยไม่เลื่อนข้าง
  tab: { flex: 1, minWidth: 0, alignItems: "center", gap: 2, paddingVertical: 4, borderRadius: radius.md },
  tabOn: { backgroundColor: colors.primarySoft },
  // วงกลม 48 px — ปุ่มขั้นกดด้วยนิ้วโป้งได้ (ตัวอย่างใช้ 48 ทุกปุ่ม)
  circle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  circleDone: { backgroundColor: colors.successFill, borderColor: colors.successFill },
  circleTodo: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  // ขั้นที่อยู่ = วงแหวนฟ้ารอบวงกลม (ตัวอย่าง ring)
  circleOn: { borderColor: colors.primary, borderWidth: 3 },
  mark: { fontSize: 17, fontWeight: "800" },
  name: { fontSize: 12.5, lineHeight: 18, fontWeight: "600", color: colors.body },
  nameOn: { fontWeight: "800", color: colors.primaryDark },
  count: { fontSize: 12, lineHeight: 17, fontWeight: "700", fontVariant: ["tabular-nums"] },
  line: { fontSize: 13.5, lineHeight: 20, color: colors.body, paddingHorizontal: 4 },
  parts: { gap: spacing.sm, paddingBottom: 4 },
  part: {
    minHeight: 48,
    minWidth: 120,
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  partOn: { borderWidth: 2, borderColor: colors.primaryDark, backgroundColor: colors.primarySoft },
  partName: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.text },
  partCount: { fontSize: 12.5, lineHeight: 18, fontWeight: "700" },
});
