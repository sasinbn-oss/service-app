import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors } from "../theme";

/**
 * เครื่องซักผ้าหมุน — ตัวบอก "กำลังโหลด" ตัวเดียวของทั้งแอป ตามมาตรฐาน OTTERI
 *
 * ใช้แทน ActivityIndicator ทุกที่ ทั้งหน้าที่กำลังโหลดและปุ่มที่กำลังบันทึก
 * วงหมุนธรรมดาหน้าตาต่างกันตามเครื่อง (iOS / Android / เบราว์เซอร์) ส่วนอันนี้
 * เหมือนกันทุกที่ และคนใช้จำได้ว่าเป็นของระบบนี้
 */
export function WasherIcon({ size = 44, color = colors.primary }: { size?: number; color?: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  // ทุกสัดส่วนคิดจากความสูง ตัวเล็กในปุ่มกับตัวใหญ่กลางจอจึงเป็นรูปเดียวกัน
  const h = size;
  const w = Math.round(h * 0.86);
  const border = Math.max(1.5, Math.round(h * 0.045));
  const drum = Math.round(h * 0.54);
  const detail = h >= 30; // ตัวเล็กเกินไปจะเห็นช่องใส่ผงกับไฟเป็นจุดเลอะ ๆ ตัดทิ้ง

  return (
    <View
      style={{
        width: w,
        height: h,
        borderRadius: Math.round(h * 0.17),
        borderWidth: border,
        borderColor: color,
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: Math.round(h * 0.1),
      }}
    >
      {detail ? (
        <View style={[styles.top, { top: Math.round(h * 0.08), paddingHorizontal: Math.round(w * 0.12) }]}>
          <View style={{ width: w * 0.28, height: border, borderRadius: border, backgroundColor: color, opacity: 0.3 }} />
          <View style={{ width: h * 0.09, height: h * 0.09, borderRadius: h, backgroundColor: colors.success }} />
        </View>
      ) : null}
      <View
        style={{
          width: drum,
          height: drum,
          borderRadius: drum,
          borderWidth: border,
          borderColor: color,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={{
            position: "absolute",
            width: drum * 1.5,
            height: drum * 1.5,
            left: -drum * 0.33,
            top: drum * 0.35,
            borderRadius: drum * 0.65,
            backgroundColor: color,
            opacity: 0.45,
            transform: [{ rotate }],
          }}
        />
      </View>
    </View>
  );
}

/**
 * ใช้แทน <ActivityIndicator> ได้ตรงตัว (รับ color / size / style เหมือนกัน)
 *
 * - size="small" หรือสีขาว (อยู่ในปุ่มสี) = เครื่องซักผ้าเล็กพอดีบรรทัด ไม่มีข้อความ
 * - นอกนั้น = หน้ากำลังโหลด ตัวใหญ่พร้อมข้อความ คนจะได้รู้ว่ารออะไรอยู่
 *   ไม่ใช่จ้องจอว่างแล้วสงสัยว่าแอปค้าง
 */
export default function Spinner({
  color = colors.primary,
  size,
  style,
  label = "กำลังโหลด...",
}: {
  color?: string;
  size?: "small" | "large" | number;
  style?: StyleProp<ViewStyle>;
  label?: string | null;
}) {
  const onButton = color.toLowerCase() === "#fff" || color.toLowerCase() === "#ffffff";
  const small = size === "small" || onButton;
  const px = typeof size === "number" ? size : small ? 22 : size === "large" ? 56 : 46;
  return (
    <View style={[small ? styles.inline : styles.block, style]}>
      <WasherIcon size={px} color={color} />
      {!small && label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  inline: { alignItems: "center", justifyContent: "center" },
  block: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 12 },
  label: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.navy },
});
