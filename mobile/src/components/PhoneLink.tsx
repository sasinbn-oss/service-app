/**
 * เบอร์โทรในผังผู้รับผิดชอบ — แตะแล้วโทรออก (เจ้าของงานขอ ต.ค. 69)
 *
 * บรรทัดเบอร์ใต้ชื่อ (ทุกจอ) + ปุ่มโทรกลมบนจอแคบ เพราะบนมือถือบรรทัดตัวหนังสือเล็กเกินกดให้โดน
 * คนที่ไม่มีเบอร์ในระบบไม่ขึ้นอะไรเลย — ช่องว่างเปล่าดูเหมือนข้อมูลหาย
 */
import React from "react";
import { Linking, StyleSheet, Text } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { colors } from "../theme";

const call = (phone: string) => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`).catch(() => {});

/** ตัวเลขล้วนของเบอร์ — ให้ค้นด้วย 0812345678 เจอเบอร์ที่บันทึกเป็น 081-234-5678 */
export const phoneDigits = (phone: string | null | undefined) => (phone ?? "").replace(/\D/g, "");

export function PhoneLine({ phone, name }: { phone: string; name: string }) {
  return (
    <TouchableOpacity onPress={() => call(phone)} accessibilityLabel={`เบอร์ ${name} ${phone}`} style={styles.line}>
      <Ionicons name="call" size={11} color={colors.primaryInk} />
      <Text style={styles.num}>{phone}</Text>
    </TouchableOpacity>
  );
}

export function CallButton({ phone, name }: { phone: string; name: string }) {
  return (
    <TouchableOpacity onPress={() => call(phone)} accessibilityLabel={`โทรหา ${name}`} style={styles.btn}>
      <Ionicons name="call" size={18} color={colors.roleTech} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 1 },
  num: { fontSize: 12.5, fontWeight: "700", color: colors.primaryInk, fontVariant: ["tabular-nums"] },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.successLine,
    backgroundColor: colors.successSoft,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
});
