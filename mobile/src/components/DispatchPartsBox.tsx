/**
 * กล่อง "อะไหล่ที่ต้องเปลี่ยน" ของงานที่จ่ายให้ช่าง (ตัวอย่างที่เจ้าของงานเลือก 3 พ.ย. 69)
 *
 * การ์ด "งานของฉันวันนี้" — ช่างเห็นก่อนออกเดินทางว่าต้องไปรับของอะไร ที่ไหน
 * เดิมการ์ดมีแค่บรรทัดเทา "อะไหล่: ชื่อ x จำนวน" ไม่มีรหัสและคลัง
 * หน้าใบงานไม่ใช้กล่องนี้: ตาราง "อะไหล่ที่ต้องใช้" (รหัส · คลัง · ใบเบิก) อยู่ในการ์ดขั้นปัจจุบันบนสุดอยู่แล้ว
 * ใส่ซ้ำคืออะไหล่ชุดเดียวกันสองที่ติดกัน (ตัวอย่างเขียนว่าตารางอยู่ล่างสุด — ผิด ตรวจกับจอจริงแล้ว 3 พ.ย. 69)
 * คำบอกสถานะมาจาก pickupOf — ตัวเดียวกับข้อความจ่ายงาน LINE ในแอปกับในกลุ่มจึงได้เรื่องเดียวกัน
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme";
import { pickupOf, qtyText, type DispatchPart } from "../utils/dispatchParts";

const TONE = {
  ok: colors.successInk,
  wait: colors.textMuted,
  off: colors.warningInk,
  out: colors.dangerInk,
} as const;

/**
 * plain = ไม่มีกรอบฟ้า — หน้าสรุปคอนเฟิร์มลูกค้าวางเป็นคอลัมน์ขวาของแถวเคส (เจ้าของงานเลือกแบบ ก 4 พ.ย. 69)
 * กรอบในแถวที่มีเส้นคั่นอยู่แล้วจะเป็นกล่องซ้อนกล่อง · เนื้อในใช้ตัวเดียวกัน คำบอกสถานะจึงตรงกับการ์ดช่าง
 */
export default function DispatchPartsBox({ parts, plain = false }: { parts: DispatchPart[]; plain?: boolean }) {
  if (!parts.length) return null;
  return (
    <View style={plain ? styles.plain : styles.box} accessibilityLabel={`อะไหล่ที่ต้องเปลี่ยน ${parts.length} รายการ`}>
      <Text style={[styles.head, plain && styles.headPlain]}>อะไหล่ที่ต้องเปลี่ยน · {parts.length} รายการ</Text>
      {parts.map((p, i) => {
        const pick = pickupOf(p);
        return (
          <View key={`${p.code ?? p.name}-${i}`} style={styles.row}>
            <Text style={styles.name}>
              {p.code ? <Text style={styles.code}>{p.code} </Text> : null}
              {p.name} <Text style={styles.code}>× {qtyText(p)}</Text>
            </Text>
            <Text style={[styles.sub, { color: TONE[pick.tone] }]}>{pick.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: spacing.xs,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  plain: { gap: 6 },
  head: { fontSize: 12.5, fontWeight: "800", color: colors.primaryInk },
  headPlain: { fontSize: 12 },
  row: { gap: 1 },
  name: { fontSize: 13, lineHeight: 19, color: colors.text },
  code: { fontWeight: "700", fontVariant: ["tabular-nums"] },
  sub: { fontSize: 11.5, lineHeight: 17, fontWeight: "600" },
});
