import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../theme";

/** done = ไฟล์ที่ขึ้นเสร็จแล้ว · current = 0–1 ของไฟล์ที่กำลังส่ง */
export interface UploadProgressValue {
  done: number;
  total: number;
  current: number;
}

/**
 * หลอดสถานะใต้เครื่องซักผ้าตอนส่งไฟล์ — ปิดงานพร้อมเคลมมีได้หลายสิบไฟล์ บนเน็ตมือถือส่งกันเป็นนาที
 * ตัวหมุนอย่างเดียวแยกไม่ออกว่ากำลังส่งหรือค้าง ช่างเลยปิดแอปทิ้งแล้วกดใหม่ (ไฟล์ซ้ำจนเต็มเพดาน — WO-00133)
 *
 * หลอดคือทั้งชุดรวมกัน ไม่ใช่ทีละไฟล์ — ทีละไฟล์จะวิ่งเต็มแล้วกลับไปศูนย์ซ้ำ ๆ ดูเหมือนเริ่มใหม่
 * อยู่ในหน้าโหลดเต็มจอ (Feedback) ไม่ใช่ในฟอร์ม เพราะระหว่างส่งหน้าโหลดบังฟอร์มทั้งหมดอยู่แล้ว
 */
export default function UploadProgress({ done, total, current }: UploadProgressValue) {
  if (total <= 0) return null;
  const pct = Math.round(Math.min(1, (done + current) / total) * 100);
  const nth = Math.min(done + 1, total);
  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel={`ส่งไฟล์ ${nth} จาก ${total}`}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{total > 1 ? `ไฟล์ ${nth}/${total}` : "ไฟล์"}</Text>
        <Text style={styles.pct}>{pct}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, width: 220, maxWidth: "100%" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  label: { fontSize: 13, fontWeight: "600", color: colors.navy },
  pct: { fontSize: 13, fontWeight: "700", color: colors.navy, fontVariant: ["tabular-nums"] },
  track: { height: 8, borderRadius: radius.sm, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.sm, backgroundColor: colors.primary },
});
