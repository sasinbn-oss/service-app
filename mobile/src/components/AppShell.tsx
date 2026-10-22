import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

/**
 * ระบบทดสอบ (local-test/ — build ด้วย EXPO_PUBLIC_APP_ENV=test) ขึ้นแถบส้มทุกหน้า
 * ทีมลองกดของทดสอบกับของจริงสลับกันในวันเดียว แถบที่เห็นตลอดกันกดผิดระบบ ·
 * ระบบจริงไม่ได้ตั้งค่านี้ แถบจึงไม่ขึ้น
 */
const TEST_BUILD = process.env.EXPO_PUBLIC_APP_ENV === "test";

/**
 * กรอบนอกสุดของแอป
 *
 * เดิมล็อกความกว้างไว้ (ฟอร์ม 820 px · ตาราง 1600 px) แล้วเว้นขอบฟ้าสองข้าง
 * เจ้าของงานขอให้ยืดหดตามจอแทน — จอใหญ่เห็นตารางกว้างขึ้น ไม่มีขอบว่างข้างละครึ่งจอ
 * จึงเหลือแค่กรอบเต็มจอ ความกว้างของแต่ละส่วนให้ flex จัดเอง
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  // ระบบจริงคงโครงเดิมทุกชั้น — ห่อเพิ่มเฉพาะตอนเป็นระบบทดสอบ
  if (!TEST_BUILD) return <View style={styles.root}>{children}</View>;
  return (
    <View style={styles.root}>
      <View style={styles.testBar} accessibilityRole="alert" accessibilityLabel="ระบบทดสอบ">
        <Text style={styles.testText}>ระบบทดสอบ — ข้อมูลไม่ใช่ของจริง กดได้ทุกอย่าง ไม่กระทบระบบจริง</Text>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // height + overflow ตรึงแอปไว้เท่าจอ ให้เนื้อหาเลื่อนข้างใน ไม่ดันแถบล่างหลุดจอ
  root: { flex: 1, height: "100%", minHeight: 0, overflow: "hidden", backgroundColor: colors.background },
  body: { flex: 1, minHeight: 0 },
  testBar: { backgroundColor: "#EA580C", paddingVertical: 4, paddingHorizontal: 12, alignItems: "center" },
  testText: { color: "#fff", fontSize: 12.5, lineHeight: 18, fontWeight: "700", textAlign: "center" },
});
