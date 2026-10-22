import React from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../theme";

/**
 * กรอบนอกสุดของแอป
 *
 * เดิมล็อกความกว้างไว้ (ฟอร์ม 820 px · ตาราง 1600 px) แล้วเว้นขอบฟ้าสองข้าง
 * เจ้าของงานขอให้ยืดหดตามจอแทน — จอใหญ่เห็นตารางกว้างขึ้น ไม่มีขอบว่างข้างละครึ่งจอ
 * จึงเหลือแค่กรอบเต็มจอ ความกว้างของแต่ละส่วนให้ flex จัดเอง
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return <View style={styles.root}>{children}</View>;
}

const styles = StyleSheet.create({
  // height + overflow ตรึงแอปไว้เท่าจอ ให้เนื้อหาเลื่อนข้างใน ไม่ดันแถบล่างหลุดจอ
  root: { flex: 1, height: "100%", minHeight: 0, overflow: "hidden", backgroundColor: colors.background },
});
