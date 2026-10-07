import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors, shadow } from "../theme";

/**
 * เครื่องซักผ้าหมุน — ตัวบอก "กำลังโหลด" ตัวเดียวของทั้งแอป ตามมาตรฐาน OTTERI
 *
 * ใช้แทน ActivityIndicator ทุกที่ ทั้งหน้าที่กำลังโหลดและปุ่มที่กำลังบันทึก
 * วงหมุนธรรมดาหน้าตาต่างกันตามเครื่อง (iOS / Android / เบราว์เซอร์) ส่วนอันนี้
 * เหมือนกันทุกที่ และคนใช้จำได้ว่าเป็นของระบบนี้
 */
export function WasherIcon({ size = 92, color = colors.primary }: { size?: number; color?: string }) {
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

  /*
    สัดส่วนทุกตัวลอกจาก .washer / .drum / .water ใน otteri-theme.css ของชุด OTTERI
    (ตัวเต็มสูง 92 px) แล้วคูณด้วย k — ตัวเล็กในปุ่มกับตัวใหญ่กลางจอจึงเป็นรูปเดียวกับต้นแบบ
    เดิมวาดเองจากคำบรรยาย ตัวเครื่องโปร่งใสและน้ำจาง หน้าตาเลยไม่ตรงกับต้นแบบ
  */
  const k = size / 92;
  const border = Math.max(1.5, 3 * k);
  const onButton = color.toLowerCase() === "#fff" || color.toLowerCase() === "#ffffff";
  const drum = 50 * k;
  const inner = drum - border * 2;
  const detail = size >= 30; // ตัวเล็กเกินไปจะเห็นช่องผงซักฟอกกับไฟเป็นจุดเลอะ ๆ ตัดทิ้ง
  const brand = color === colors.primary;
  // สีเดียวกับต้นแบบเมื่อเป็นสีหลัก สีอื่น (เช่น ในปุ่มแดง) ใช้สีนั้นแบบจางแทน
  const water = brand ? "#7FD0F2" : color;

  return (
    <View
      style={{
        width: 78 * k,
        height: size,
        borderRadius: 16 * k,
        borderWidth: border,
        borderColor: color,
        backgroundColor: onButton ? "transparent" : colors.card,
        ...(size >= 60 ? shadow.raised : null),
      }}
    >
      {detail ? (
        <>
          <View
            style={{
              position: "absolute",
              top: 8 * k - border,
              left: 10 * k - border,
              width: 22 * k,
              height: 5 * k,
              borderRadius: 3 * k,
              backgroundColor: onButton ? "rgba(255,255,255,0.5)" : colors.primarySoft,
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 7 * k - border,
              right: 10 * k - border,
              width: 8 * k,
              height: 8 * k,
              borderRadius: 4 * k,
              backgroundColor: colors.success,
            }}
          />
        </>
      ) : null}
      <View
        style={{
          position: "absolute",
          left: (78 * k - drum) / 2 - border,
          top: size * 0.56 - drum / 2 - border,
          width: drum,
          height: drum,
          borderRadius: drum / 2,
          borderWidth: border,
          borderColor: color,
          overflow: "hidden",
          backgroundColor: onButton ? "transparent" : colors.card,
        }}
      >
        {/* .water { inset: 40% -30% -30% } — ผิวน้ำเริ่มที่ 40% ของถัง กว้างเกินถังแล้วหมุน */}
        <Animated.View
          style={{
            position: "absolute",
            top: inner * 0.4,
            left: -inner * 0.3,
            width: inner * 1.6,
            height: inner * 0.9,
            borderRadius: inner * 0.42,
            backgroundColor: water,
            opacity: brand ? 1 : onButton ? 0.55 : 0.45,
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
  // ตัวใหญ่ใช้ขนาดเต็มของต้นแบบ (92 px) — ต้นแบบมีขนาดเดียว ไม่มีตัวกลาง
  const px = typeof size === "number" ? size : small ? 22 : 92;
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
  block: { alignItems: "center", justifyContent: "center", gap: 14, paddingVertical: 16 },
  // .loader p ของต้นแบบ: ตัวหนา สีกรมท่า ห่างจากเครื่อง 14 px
  label: { fontSize: 15, lineHeight: 24, fontWeight: "600", color: colors.navy },
});
