import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import TouchableOpacity from "./Tap";
import EmptyState from "./EmptyState";
import { useAuth } from "../context/AuthContext";
import { canOpenScreen } from "../utils/areaTeam";
import { colors, radius, spacing } from "../theme";

/**
 * ประตูของหน้าที่เหลือให้ Area คนเดียว (AREA_ONLY_SCREENS ใน utils/areaTeam.ts — เจ้าของงานขอ ต.ค. 69)
 *
 * เมนูซ่อนแล้ว แต่ยังมีทางมาถึงหน้าได้: หน้าที่จำไว้ข้ามการโหลดใหม่ (สลับโหมดมืด · navigationRef.ts)
 * หรือปุ่ม/ลิงก์ที่ใครเพิ่มทีหลังโดยไม่รู้กฎนี้ — ขึ้นหน้ากุญแจแบบเดียวกับหน้าสำรองข้อมูล
 * แทนหน้าที่โหลดแล้วได้ 403 ทุกช่อง · ตัดสินก่อนวาดหน้าจริง หน้าจริงจึงไม่ยิงคำขอเลย
 * วางที่ screenLayout ของ navigator เพื่อดูจากชื่อหน้า — ไม่ต้องไปแก้ในหน้าใหญ่ทั้งสามหน้า
 */
export default function AreaOnlyGate({ screen, children }: { screen: string; children: React.ReactElement }) {
  const { user } = useAuth();
  const navigation = useNavigation();
  if (canOpenScreen(user, screen)) return children;
  return (
    <View style={styles.center}>
      <EmptyState
        icon="lock-closed-outline"
        title="เมนูนี้สำหรับทีม Area เท่านั้น"
        text="ตำแหน่งของคุณใช้แผนงาน กล่องงานของฉัน และใบงานซ่อม — ทีม Area เห็นว่าเมนูนี้ไม่จำเป็นกับ Supervisor และ Maid"
      />
      <TouchableOpacity
        style={styles.btn}
        activeOpacity={0.7}
        onPress={() => (navigation.navigate as (screen: string) => void)("PlanBoard")}
      >
        <Text style={styles.btnText}>ไปที่แผนงาน</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: spacing.lg },
  btn: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 8 },
  btnText: { fontSize: 13.5, fontWeight: "700", color: colors.navy },
});
