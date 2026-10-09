import React, { forwardRef, useRef } from "react";
import { Animated, LayoutChangeEvent, StyleSheet, TouchableOpacity as RNTouchableOpacity, View } from "react-native";
import { reduceMotion } from "../utils/motion";

const AnimatedTouchable = Animated.createAnimatedComponent(RNTouchableOpacity);
type Props = React.ComponentProps<typeof RNTouchableOpacity>;

/**
 * TouchableOpacity ของทั้งแอป — กดแล้วยุบลงนิดเดียว ปล่อยแล้วเด้งคืน แบบปุ่มบน iOS
 *
 * ของเดิมจางเหลือ 20–80% ตอนกด ตัวหนังสือบนปุ่มอ่านไม่ออกชั่วขณะ และบนเว็บดูเหมือนปุ่มกระพริบ
 * ทุกไฟล์ import ตัวนี้แทนของ react-native (ชื่อเดียวกัน props เดียวกัน) จึงไม่ต้องแก้ทีละปุ่ม
 * activeOpacity ที่แต่ละหน้าใส่ไว้ (0.6–0.8) ถูกยกขึ้นเป็นอย่างน้อย 0.85 — เหลือแค่มืดลงนิด ๆ
 *
 * ยุบตามขนาด: ปุ่มเล็กยุบเห็นชัด แถวรายการเต็มจอยุบน้อย เพราะ 4% ของแถวกว้าง 1,000 px
 * คือขอบหดเข้ามา 20 px ดูเหมือนทั้งหน้ากระตุก
 */
const Tap = forwardRef<View, Props>(function Tap(props, ref) {
  const { style, onPressIn, onPressOut, onLayout, activeOpacity, disabled, ...rest } = props;
  const scale = useRef(new Animated.Value(1)).current;
  const depth = useRef(0.96);

  const flat = StyleSheet.flatten(style) as { transform?: never[] } | undefined;
  const transform = [...(flat?.transform ?? []), { scale }] as never;

  return (
    <AnimatedTouchable
      ref={ref as never}
      {...rest}
      disabled={disabled}
      activeOpacity={Math.max(activeOpacity ?? 0.85, 0.85)}
      style={[style, { transform }]}
      onLayout={(e: LayoutChangeEvent) => {
        const w = e.nativeEvent.layout.width;
        depth.current = w > 600 ? 0.99 : w > 260 ? 0.975 : 0.95;
        onLayout?.(e);
      }}
      onPressIn={(e) => {
        if (!reduceMotion()) Animated.timing(scale, { toValue: depth.current, duration: 90, useNativeDriver: false }).start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        Animated.spring(scale, { toValue: 1, stiffness: 420, damping: 24, mass: 1, useNativeDriver: false }).start();
        onPressOut?.(e);
      }}
    />
  );
});

export default Tap;
