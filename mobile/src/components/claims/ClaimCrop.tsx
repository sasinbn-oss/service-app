/**
 * ภาพตัดบรรทัดจากรูปป้าย (ค่าที่ระบบอ่านมาจากตรงนี้) — เต็มความกว้างช่อง สูง 64 แตะแล้วขยายเป็น 160
 *
 * เดิม 120×26 ตัวหนังสือในภาพเล็กกว่าตัวในช่องกรอก เทียบทีละตัวไม่ได้ ทั้งช่างที่ยืนยันและผู้ตรวจเคลม
 * ไม่เปิดตัวดูรูป เพราะภาพตัดเป็นข้อมูลในตัว (data URL) ไม่ใช่ไฟล์ของใบงาน — ขยายในที่ก็พอ
 * ตัวเดียวกันใช้ในฟอร์มปิดงาน การ์ดเคลม และหน้าตรวจเคลม (ผู้ตรวจวางภาพตัดคู่ค่าที่บันทึก เทียบทีละตัว)
 */
import React, { useState } from "react";
import { Image, ImageStyle, StyleProp, StyleSheet, Text, TextStyle } from "react-native";
import TouchableOpacity from "../Tap";
import { colors } from "../../theme";
import { LOOKALIKE } from "../../utils/claimEvidence";

export default function ClaimCrop({
  uri,
  label,
  style,
  height = 64,
}: {
  uri: string;
  label: string;
  style?: StyleProp<ImageStyle>;
  /** สูงตอนย่อ — แตะแล้วขยายเป็น 160 เสมอ */
  height?: number;
}) {
  const [big, setBig] = useState(false);
  return (
    <TouchableOpacity
      onPress={() => setBig((b) => !b)}
      activeOpacity={0.85}
      accessibilityLabel={`ภาพตัดจากรูปป้าย ${label}`}
      accessibilityHint={big ? "แตะเพื่อย่อ" : "แตะเพื่อขยาย"}
      style={{ width: "100%" }}
    >
      <Image source={{ uri }} style={[styles.crop, { height }, style, big && styles.big]} resizeMode="contain" />
    </TouchableOpacity>
  );
}

/**
 * ค่าป้ายรุ่นตัวใหญ่ ตัวเว้นห่าง ตัดบรรทัดได้ — ตัวที่หน้าตาคล้ายกัน (O/0 · S/5 · E/6) พื้นเหลืองขีดเส้นใต้
 * ผู้ตรวจเทียบกับภาพตัดทีละตัวโดยรู้ว่าต้องดูตัวไหนเป็นพิเศษ (ตัวอย่างที่เจ้าของงานเลือก · modelChars)
 * รุ่นเต็มยาว 18 ตัวล้นช่องบนมือถือ ตัวท้ายที่อ่านพลาดบ่อยที่สุดจึงต้องตัดบรรทัดได้ ไม่ถูกตัดทิ้ง
 */
export function LookalikeText({ value, style, label }: { value: string; style?: StyleProp<TextStyle>; label: string }) {
  return (
    <Text style={[styles.value, style]} accessibilityLabel={`${label}ที่บันทึก: ${value}`}>
      {[...value].map((c, i) =>
        LOOKALIKE.has(c) ? (
          <Text key={i} style={styles.look}>
            {c}
          </Text>
        ) : (
          c
        )
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  value: { fontSize: 18, lineHeight: 28, fontWeight: "800", letterSpacing: 1.5, fontFamily: "monospace", color: colors.text },
  look: { backgroundColor: colors.warningTint, textDecorationLine: "underline", textDecorationColor: colors.warning },
  crop: { width: "100%", borderRadius: 4, backgroundColor: colors.tile },
  big: { height: 160 },
});
