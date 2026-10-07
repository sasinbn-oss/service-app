import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, View } from "react-native";

/**
 * หน้าใหม่ค่อย ๆ ขึ้นมา (จางเข้า + เลื่อนขึ้น 8 px ใน 0.18 วิ) ตาม .page-enter ของต้นแบบ OTTERI
 *
 * เฉพาะเว็บ — native-stack บนเว็บเปลี่ยนหน้าแบบตัดฉับ ดูเหมือนจอกระพริบ
 * คนไม่แน่ใจว่ากดโดนแล้วหรือยัง บนมือถือเครื่องมีแอนิเมชันเปลี่ยนหน้าของมันเองอยู่แล้ว
 */
export default function PageEnter({ children }: { children: React.ReactNode }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [t]);
  if (Platform.OS !== "web") return <View style={{ flex: 1 }}>{children}</View>;
  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: t,
        transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** ใส่เป็น screenLayout ของ Navigator */
export const pageEnterLayout = ({ children }: { children: React.ReactElement }) => <PageEnter>{children}</PageEnter>;
