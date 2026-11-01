/**
 * รายการ "ช่างเข้าเช็คอะไรบ้าง" แบบที่ผู้ตรวจอ่าน — ✓ ข้อที่ช่างติ๊ก · ✗ ข้อที่ฟอร์มให้เห็นแต่ไม่ได้ติ๊ก "(ไม่ได้ทำ)"
 *
 * ระบบไม่ติ๊กให้ช่าง (เจ้าของงานเลือก ต.ค. 69 ข้อ 7) เดิมการ์ดโชว์แค่ข้อที่ติ๊ก ผู้ตรวจไม่รู้ว่าข้อไหนช่างข้ามไป
 * ✗ มีไว้ให้คนตัดสินเคลม (ข้อ 7 ค "ให้ผู้ตรวจเห็น ✗") — showMissed=false ขึ้นแค่ข้อที่ทำแบบเดิม
 * ช่าง/หัวหน้าภาคที่เปิดใบตัวเองไม่ควรเห็นข้อเช็คที่ไม่บังคับเป็นบรรทัดแดง ๆ เหมือนทำผิด ทั้งที่ไม่มีใครตีกลับ
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import type { CheckGroup } from "../../utils/claimEvidence";

export default function CheckGroups({ groups, showMissed = true }: { groups: CheckGroup[]; showMissed?: boolean }) {
  const shown = groups
    .map((g) => (showMissed ? g : { ...g, items: g.items.filter((it) => it.done) }))
    .filter((g) => g.items.length);
  if (!shown.length) return null;
  return (
    <View style={{ gap: 2 }}>
      {shown.map((g) => (
        <View key={g.key} style={{ gap: 1 }}>
          <Text style={styles.title}>{g.title}</Text>
          {g.items.map((it) => (
            <Text key={it.text} style={[styles.item, { color: it.done ? colors.successInk : colors.dangerInk }]}>
              <Text style={{ fontWeight: "800" }}>{it.done ? "✓" : "✗"}</Text> {it.text}
              {it.done ? "" : " (ไม่ได้ทำ)"}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.body, marginTop: 4 },
  item: { fontSize: 13, lineHeight: 20 },
});
