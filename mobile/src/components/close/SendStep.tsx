/**
 * ขั้น "ส่ง" (ตรวจก่อนส่ง) ของฟอร์มปิดงาน — ทุกขั้นสรุปบรรทัดเดียว ขาดอะไรบอกตรงนั้นพร้อม "▸ ไปแก้" (เคลมก้อน 5 · ตัวอย่าง review)
 *
 * ส่งได้จากขั้นนี้ที่เดียว — ช่างต้องผ่านหน้าสรุปและเห็นทุกชิ้นก่อนกด ไม่ใช่กดส่งจากกลางฟอร์มแล้วค่อยรู้ว่าลืมชิ้นที่สอง
 * รหัสตัวเสียไม่ตรงกับที่เปลี่ยนใส่ไม่บล็อกการส่ง (ผู้ตรวจเห็นเป็นธง) แต่ต้องเห็นอีกครั้งที่นี่ พร้อม "▸ ดู" กลับไปข้อ ②
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import TouchableOpacity from "../Tap";
import { colors, radius, spacing } from "../../theme";

export interface SendRow {
  key: string;
  /** บรรทัดทั้งบรรทัดตามแบบ เช่น "✓ งานที่ทำ — ซ่อมเสร็จ · …" / "✗ เคลม บอร์ดควบคุม — ยังขาด: …" */
  text: string;
  state: "ok" | "missing" | "skip";
  /** คำเตือนที่ไม่บล็อก (รหัสตัวเสียไม่ตรง) */
  warn?: string;
  onGo?: () => void;
  onLook?: () => void;
}

export default function SendStep({ rows, claiming }: { rows: SendRow[]; claiming: boolean }) {
  return (
    <View style={{ gap: spacing.sm }} accessibilityLabel="ตรวจก่อนส่ง">
      <Text style={styles.title}>ตรวจก่อนส่ง</Text>
      {rows.map((r) => (
        <View key={r.key} style={[styles.row, r.state === "missing" ? styles.rowMissing : r.state === "skip" ? styles.rowSkip : null]}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={[styles.text, r.state === "missing" && { color: colors.warningInk }]}>{r.text}</Text>
            {r.warn ? <Text style={styles.warn}>{r.warn}</Text> : null}
          </View>
          {r.state === "missing" && r.onGo ? (
            <TouchableOpacity style={styles.go} onPress={r.onGo} accessibilityLabel={`ไปแก้ ${r.text}`}>
              <Text style={styles.goText}>▸ ไปแก้</Text>
            </TouchableOpacity>
          ) : null}
          {r.warn && r.onLook ? (
            <TouchableOpacity style={styles.go} onPress={r.onLook} accessibilityLabel={`ดู ${r.text}`}>
              <Text style={styles.goText}>▸ ดู</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
      {claiming ? (
        <View style={styles.after}>
          <Text style={styles.afterText}>
            <Text style={{ fontWeight: "800" }}>หลังส่ง:</Text> ใบงานไปรอ Admin Spare Part ตรวจเคลม
          </Text>
          <Text style={styles.afterNote}>ยังไม่นับว่าปิดงาน จนกว่าจะอนุมัติ — อาจถูกตีกลับมาให้แก้</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, lineHeight: 26, fontWeight: "800", color: colors.text },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  rowMissing: { borderWidth: 2, borderColor: colors.warning, backgroundColor: colors.warningTint },
  rowSkip: { backgroundColor: colors.rowAlt },
  text: { fontSize: 14.5, lineHeight: 21, fontWeight: "700", color: colors.text },
  warn: { fontSize: 13, lineHeight: 19, fontWeight: "600", color: colors.warningInk },
  go: {
    minHeight: 48,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.navyFill,
    backgroundColor: colors.card,
  },
  goText: { fontSize: 14, fontWeight: "700", color: colors.primaryInk },
  after: { gap: 2, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  afterText: { fontSize: 14, lineHeight: 20, color: colors.text },
  afterNote: { fontSize: 13, lineHeight: 19, color: colors.body },
});
