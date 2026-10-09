import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, headingFont, radius, shadow, spacing } from "../theme";
import { MaximizeButton } from "./AppModal";

/**
 * หน้าที่เปิดเป็นหน้าต่างลอยทับหน้าเดิม (ใบงาน · เปิดใบงานใหม่) ตามตัวอย่างที่เจ้าของงานเลือก
 *
 * ใช้คู่กับ presentation: "transparentModal" ใน navigator — หน้ายังเป็นหน้าในสแต็กเหมือนเดิม
 * ทุกที่ที่สั่ง navigate("WorkOrderDetail") จึงได้หน้าต่างลอยเอง ไม่ต้องแก้ทีละจุด
 * ปิดหน้าต่าง = ย้อนกลับ หน้าข้างหลังได้โฟกัสคืนแล้วโหลดข้อมูลใหม่เอง
 *
 * หน้าต่างย่อยข้างใน (ฟอร์มของแต่ละขั้น) ไม่ซ้อนเป็นหน้าต่างที่สอง แต่เลื่อนเข้ามา
 * แทนที่ในกรอบเดิม พร้อม "‹ กลับ…" — <Modal> ซ้อนกันบนเว็บพังบ่อย (CLAUDE.md)
 * และหน้าต่างสองชั้นทำให้คนหลงว่าปิดอันไหนแล้วจะกลับไปไหน
 * AppModal ที่อยู่ในหน้านี้เปลี่ยนเป็นแบบนี้เองผ่าน PopupPaneContext
 */

interface PaneHost {
  /** ข้อความหลัง "‹ กลับ" เช่น "ใบงาน WO-00003" */
  backLabel: string;
  show: (key: string, node: React.ReactNode) => void;
  hide: (key: string) => void;
  /** ขยายหน้าต่างทั้งบาน — ฟอร์มที่เลื่อนเข้ามาแทนที่ใช้ปุ่มเดียวกันนี้ */
  maximized: boolean;
  toggleMaximized: () => void;
}

export const PopupPaneContext = createContext<PaneHost | null>(null);

export function usePopupPane() {
  return useContext(PopupPaneContext);
}

export default function PopupScreen({
  title,
  subtitle,
  right,
  backLabel,
  width = 1040,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  backLabel?: string;
  width?: number;
  children: React.ReactNode;
}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: screen } = useWindowDimensions();
  // จอแคบ (มือถือ) เป็นแผ่นเลื่อนขึ้นจากล่าง เต็มความกว้าง — หน้าต่างกลางจอบนมือถือ
  // เหลือขอบสองข้างที่ไม่ได้ใช้ และนิ้วเอื้อมถึงปุ่มปิดยากกว่า
  const sheet = screen < 640;

  const [panes, setPanes] = useState<{ key: string; node: React.ReactNode }[]>([]);
  const show = useCallback((key: string, node: React.ReactNode) => {
    setPanes((prev) => {
      const i = prev.findIndex((p) => p.key === key);
      if (i < 0) return [...prev, { key, node }];
      const next = prev.slice();
      next[i] = { key, node };
      return next;
    });
  }, []);
  const hide = useCallback((key: string) => {
    setPanes((prev) => (prev.some((p) => p.key === key) ? prev.filter((p) => p.key !== key) : prev));
  }, []);
  const [max, setMax] = useState(false);
  const toggleMax = useCallback(() => setMax((v) => !v), []);
  const host = useRef<PaneHost>({ backLabel: backLabel ?? "", show, hide, maximized: false, toggleMaximized: toggleMax });
  host.current.backLabel = backLabel ?? "";
  host.current.maximized = max;

  const close = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  // Esc ปิดหน้าต่างบนเว็บ — ถ้ามีฟอร์มขั้นเปิดอยู่ ให้ฟอร์มนั้นจัดการเอง (ปุ่มกลับของมัน)
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && panes.length === 0) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, panes.length]);

  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(rise, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== "web" }).start();
  }, [rise]);

  const top = panes[panes.length - 1];

  return (
    <PopupPaneContext.Provider value={host.current}>
      <View style={[styles.backdrop, sheet && styles.backdropSheet, max && !sheet && styles.backdropMax]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="ปิดหน้าต่าง" />
        <Animated.View
          style={[
            styles.card,
            sheet ? [styles.cardSheet, { paddingBottom: insets.bottom }] : { maxWidth: width },
            max && styles.cardMax,
            {
              opacity: rise,
              transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [sheet ? 40 : 14, 0] }) }],
            },
          ]}
        >
          <View style={styles.head}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.title, headingFont]} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {right}
            <MaximizeButton on={max} onPress={toggleMax} />
            <TouchableOpacity style={styles.close} onPress={close} accessibilityLabel="ปิด">
              <Ionicons name="close" size={24} color={colors.primaryInk} />
            </TouchableOpacity>
          </View>
          <View style={styles.body}>{children}</View>
          {top ? <PaneView key={top.key}>{top.node}</PaneView> : null}
        </Animated.View>
      </View>
    </PopupPaneContext.Provider>
  );
}

/** ฟอร์มขั้นที่เลื่อนเข้ามาจากขวา ทับเนื้อหาเดิมในกรอบเดียวกัน */
function PaneView({ children }: { children: React.ReactNode }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== "web" }).start();
  }, [t]);
  return (
    <Animated.View
      style={[
        styles.pane,
        { opacity: t, transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(15,23,42,0.42)",
    // เบลอหน้าข้างหลังแบบต้นแบบ (มีผลเฉพาะเว็บ)
    ...(Platform.OS === "web" ? ({ backdropFilter: "blur(3px)" } as object) : null),
  },
  backdropSheet: { padding: 0, justifyContent: "flex-end" },
  backdropMax: { padding: spacing.sm },
  cardMax: { maxWidth: "100%", height: "100%" },
  card: {
    width: "100%",
    height: "92%",
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    overflow: "hidden",
    ...shadow.raised,
  },
  cardSheet: { height: "94%", borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.xl,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 18, lineHeight: 26, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  close: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sky50,
  },
  body: { flex: 1, minHeight: 0 },
  pane: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background },
});
