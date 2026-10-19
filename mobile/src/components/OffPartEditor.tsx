/**
 * อะไหล่นอกสโตร์ (ไม่มี SKU) — พิมพ์ชื่อ จำนวน หน่วย หมายเหตุเอง (เจ้าของงานขอ ต.ค. 69)
 *
 * แยกจาก PartPicker เพราะของพวกนี้ไม่มีให้ค้น ถ้าให้พิมพ์ในช่องค้นหาเดียวกัน คนจะไม่รู้ว่า
 * "ไม่เจอ" แปลว่าสะกดผิดหรือไม่มีในสโตร์จริง · เซิร์ฟเวอร์จับคู่ด้วยชื่อ — ชื่อเดียวกันคือของชิ้นเดียวกัน
 * (resolveOffParts ใน backend/src/routes/workOrders.ts) จึงส่งรายการเดิมกลับไปซ้ำได้โดยผลเช็คไม่หาย
 */
import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { colors, radius, spacing } from "../theme";

export interface OffPart {
  name: string;
  quantity: number;
  unit: string;
  note: string;
}

/** แถวอะไหล่จากเซิร์ฟเวอร์ → ของในสโตร์ (ไป PartPicker) กับของนอกสโตร์ (มาที่นี่) */
export function splitParts<T extends { offCatalog?: boolean; name: string; quantity: number; unit?: string | null; note?: string | null }>(
  rows: T[]
): { store: T[]; off: OffPart[] } {
  return {
    store: rows.filter((p) => !p.offCatalog),
    off: rows
      .filter((p) => p.offCatalog)
      .map((p) => ({ name: p.name, quantity: p.quantity, unit: p.unit ?? "", note: p.note ?? "" })),
  };
}

/** ที่ส่งเข้าเซิร์ฟเวอร์ — แถวที่ยังไม่ได้พิมพ์ชื่อไม่ส่ง (ปุ่มยืนยันกันไว้แล้วด้วย offPartsIncomplete) */
export function offPartsPayload(rows: OffPart[]) {
  return rows
    .filter((r) => r.name.trim())
    .map((r) => ({ name: r.name.trim(), quantity: r.quantity, unit: r.unit.trim() || null, note: r.note.trim() || null }));
}

/** มีแถวที่กดเพิ่มแล้วแต่ยังไม่ได้พิมพ์ชื่อ — ส่งไปแล้วหายเงียบ ๆ แย่กว่าบอกให้กรอก */
export const offPartsIncomplete = (rows: OffPart[]) => rows.some((r) => !r.name.trim());

/**
 * สองแบบหน้าตาเดียวกัน — "off" อะไหล่นอกสโตร์ (ส้ม) · "service" ค่าบริการที่ต้องเสนอราคา (เขียวอมฟ้า)
 * ช่องเหมือนกันทุกอย่าง (ชื่อ จำนวน หน่วย หมายเหตุ) ต่างแค่ชื่อกล่องกับสี ให้คนแยกออกว่าเป็นของหรือค่าแรง
 */
const VARIANTS = {
  off: { title: "อะไหล่นอก — เสนอราคาให้ลูกค้า", badge: "ไม่มี SKU", item: "อะไหล่นอกสโตร์", add: "เพิ่มอะไหล่นอก", placeholder: "ชื่อ / รุ่นอะไหล่", unit: "ชิ้น", note: "หมายเหตุ เช่น สเปค แหล่งซื้อ (ไม่บังคับ)" },
  service: { title: "ค่าบริการ — เสนอราคาให้ลูกค้า", badge: null, item: "ค่าบริการ", add: "เพิ่มค่าบริการ", placeholder: "เช่น ค่าแรง ค่าเดินทาง", unit: "งาน", note: "หมายเหตุ เช่น ใช้ช่าง 2 คน ระยะทาง (ไม่บังคับ)" },
} as const;

export default function OffPartEditor({
  rows,
  onChange,
  variant = "off",
  title,
  hint = "ใช้เมื่อหารหัสในสโตร์ไม่เจอ · ไม่ต้องเช็คคลังหรือใส่เลขใบเบิก แอดมินเป็นคนจัดหา",
}: {
  rows: OffPart[];
  onChange: (next: OffPart[]) => void;
  variant?: keyof typeof VARIANTS;
  /** ตอนปิดงานไม่ได้เสนอราคาแล้ว — ใช้ชื่อกล่องอื่นแทน */
  title?: string;
  hint?: string;
}) {
  const v = VARIANTS[variant];
  const svc = variant === "service";
  const set = (i: number, patch: Partial<OffPart>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <View style={[styles.box, svc && styles.boxService]}>
      <View style={styles.head}>
        <Text style={[styles.title, svc && { color: colors.service }]}>{title ?? v.title}</Text>
        {v.badge ? <Text style={styles.tag}>{v.badge}</Text> : null}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.line}>
            <TextInput
              style={[styles.input, styles.name, !r.name.trim() && styles.inputEmpty]}
              value={r.name}
              onChangeText={(t) => set(i, { name: t })}
              placeholder={v.placeholder}
              placeholderTextColor={colors.textFaint}
              maxLength={120}
              accessibilityLabel={`ชื่อ${v.item} ${i + 1}`}
            />
            <TextInput
              style={[styles.input, styles.qty]}
              value={String(r.quantity)}
              onChangeText={(t) => {
                const digits = t.replace(/[^0-9]/g, "");
                set(i, { quantity: digits === "" ? 1 : Math.min(999, Math.max(1, Number(digits))) });
              }}
              keyboardType="number-pad"
              maxLength={3}
              accessibilityLabel={`จำนวน${v.item} ${i + 1}`}
            />
            <TextInput
              style={[styles.input, styles.unit]}
              value={r.unit}
              onChangeText={(t) => set(i, { unit: t })}
              placeholder={v.unit}
              placeholderTextColor={colors.textFaint}
              maxLength={20}
              accessibilityLabel={`หน่วย${v.item} ${i + 1}`}
            />
            <TouchableOpacity
              onPress={() => onChange(rows.filter((_, j) => j !== i))}
              accessibilityLabel={`เอา${v.item} ${i + 1} ออก`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={20} color={colors.textFaint} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            value={r.note}
            onChangeText={(t) => set(i, { note: t })}
            placeholder={v.note}
            placeholderTextColor={colors.textFaint}
            maxLength={300}
            accessibilityLabel={`หมายเหตุ${v.item} ${i + 1}`}
          />
        </View>
      ))}
      <TouchableOpacity
        style={styles.add}
        onPress={() => onChange([...rows, { name: "", quantity: 1, unit: "", note: "" }])}
        accessibilityLabel={v.add}
      >
        <Ionicons name="add-circle-outline" size={17} color={svc ? colors.service : colors.offPart} />
        <Text style={[styles.addText, svc && { color: colors.service }]}>{v.add}</Text>
      </TouchableOpacity>
      {offPartsIncomplete(rows) ? <Text style={styles.warn}>ใส่ชื่อ{v.item}ให้ครบ หรือกด ✕ เอาแถวที่ไม่ใช้ออก</Text> : null}
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

/** ป้าย "นอกสโตร์" ต่อท้ายชื่ออะไหล่ — ใช้ทุกที่ที่แสดงรายการอะไหล่ของใบงาน */
export function OffTag() {
  return <Text style={styles.tag}>นอกสโตร์</Text>;
}

/** ชื่อที่ใช้แสดงแทนรหัส — ของนอกสโตร์ไม่มีรหัส partCode เป็นแค่ชื่อพร้อมป้ายนำหน้า */
export const partTitle = (p: { offCatalog?: boolean; partCode: string; name: string }) => (p.offCatalog ? p.name : p.partCode);

const styles = StyleSheet.create({
  box: {
    gap: spacing.sm,
    marginTop: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.offPartLine,
    backgroundColor: colors.offPartSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  boxService: { borderColor: colors.serviceLine, backgroundColor: colors.serviceSoft },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.offPart },
  tag: {
    alignSelf: "flex-start",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "700",
    color: colors.offPart,
    backgroundColor: colors.offPartSoft,
    borderWidth: 1,
    borderColor: colors.offPartLine,
    borderRadius: 6,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  row: {
    gap: spacing.xs,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: 9,
    paddingVertical: 6,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.card,
  },
  inputEmpty: { borderColor: colors.offPartLine },
  name: { flex: 1, minWidth: 0 },
  qty: { width: 52, textAlign: "center" },
  unit: { width: 64 },
  add: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 2 },
  addText: { color: colors.offPart, fontWeight: "700", fontSize: 13 },
  warn: { fontSize: 12, color: colors.dangerInk },
  hint: { fontSize: 11.5, lineHeight: 18, color: colors.textMuted },
});
