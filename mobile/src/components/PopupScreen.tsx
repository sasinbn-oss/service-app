import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import TouchableOpacity from "./Tap";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, headingFont, radius, shadow, spacing } from "../theme";
import { MaximizeButton } from "./AppModal";
import { EXIT_EASE, lockHistorySwipe, lockSelection, rubber, spring, timing } from "../utils/motion";

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
  /** onBack = ปุ่มกลับของฟอร์มนั้น ใช้ตอนปัดย้อนกลับ · busy = กำลังบันทึก ห้ามปัดทิ้ง */
  show: (key: string, node: React.ReactNode, opts?: { onBack?: () => void; busy?: boolean }) => void;
  hide: (key: string) => void;
  /** ขยายหน้าต่างทั้งบาน — ฟอร์มที่เลื่อนเข้ามาแทนที่ใช้ปุ่มเดียวกันนี้ */
  toggleMaximized: () => void;
}

export const PopupPaneContext = createContext<PaneHost | null>(null);
// แยกจาก PaneHost เพราะฟอร์มที่เลื่อนเข้ามาถูกวาดจากหน้าอื่น — ค่าที่ฝากไว้ใน host ไม่ทำให้มันวาดใหม่
// ปุ่มขยายในฟอร์มจะค้างไอคอนเก่า ส่วน context ทำให้วาดใหม่เองทุกครั้งที่ขยาย/ย่อ
const PopupMaxContext = createContext(false);

export function usePopupPane() {
  return useContext(PopupPaneContext);
}

/** ปุ่มขยายในหัวฟอร์มที่เลื่อนเข้ามาในหน้าต่างใบงาน */
export function PaneMaximizeButton() {
  const host = usePopupPane();
  const max = useContext(PopupMaxContext);
  return <MaximizeButton on={max} onPress={() => host?.toggleMaximized()} />;
}

type Pane = {
  key: string;
  node: React.ReactNode;
  onBack?: () => void;
  busy?: boolean;
  leaving?: boolean;
  /** ปัดออกไปจนพ้นแล้ว — ตอนฟอร์มสั่งปิดตามมา ลบทิ้งเลยไม่ต้องเล่นท่าออกซ้ำ */
  gone?: boolean;
  t: Animated.Value;
};

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
  const { width: screen, height: screenH } = useWindowDimensions();
  // จอแคบ (มือถือ) เป็นแผ่นเลื่อนขึ้นจากล่าง เต็มความกว้าง — หน้าต่างกลางจอบนมือถือ
  // เหลือขอบสองข้างที่ไม่ได้ใช้ และนิ้วเอื้อมถึงปุ่มปิดยากกว่า
  const sheet = screen < 640;

  const [panes, setPanes] = useState<Pane[]>([]);
  const show = useCallback((key: string, node: React.ReactNode, opts?: { onBack?: () => void; busy?: boolean }) => {
    setPanes((prev) => {
      const i = prev.findIndex((p) => p.key === key);
      if (i < 0) return [...prev, { key, node, ...opts, t: new Animated.Value(0) }];
      const next = prev.slice();
      next[i] = { ...prev[i], node, ...opts, leaving: false, gone: false };
      return next;
    });
  }, []);
  const remove = useCallback((key: string) => setPanes((prev) => prev.filter((p) => p.key !== key)), []);
  const hide = useCallback((key: string) => {
    setPanes((prev) => {
      const p = prev.find((x) => x.key === key);
      if (!p || p.leaving) return prev;
      if (p.gone) return prev.filter((x) => x.key !== key);
      return prev.map((x) => (x.key === key ? { ...x, leaving: true } : x));
    });
  }, []);
  const markGone = useCallback(
    (key: string) => setPanes((prev) => prev.map((x) => (x.key === key ? { ...x, gone: true } : x))),
    [],
  );

  // ── ขยาย/ย่อ: ยืดจากขนาดปกติไปเต็มกรอบแบบสปริง (วิธีเดียวกับ AppModal) ──
  const [max, setMax] = useState(false);
  const [resizing, setResizing] = useState(false);
  const grow = useRef(new Animated.Value(0)).current;
  const box = useRef({ w: 0, h: 0 });
  const normal = useRef({ w: 0, h: 0 });
  const range = useRef({ w0: 0, h0: 0, w1: 0, h1: 0 });
  const [cardW, setCardW] = useState(0);
  const toggleRef = useRef(() => undefined as void);
  toggleRef.current = () => {
    const next = !max;
    const pad = sheet ? 0 : spacing.sm;
    const n = normal.current;
    range.current = { w0: n.w, h0: n.h, w1: sheet ? n.w : box.current.w - pad * 2, h1: box.current.h - pad * 2 };
    setResizing(true);
    setMax(next);
    spring(grow, next ? 1 : 0, "resize").start(({ finished }) => finished && setResizing(false));
  };
  const toggleMax = useCallback(() => toggleRef.current(), []);
  const host = useRef<PaneHost>({ backLabel: backLabel ?? "", show, hide, toggleMaximized: toggleMax });
  host.current.backLabel = backLabel ?? "";

  // ── เปิด/ปิดหน้าต่าง ──
  const appear = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      timing(fade, 1, sheet ? 260 : 150, Easing.out(Easing.quad)),
      sheet ? timing(appear, 1, 500) : spring(appear, 1, "pop"),
    ]).start();
    // เล่นครั้งเดียวตอนเปิด
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /*
    ปิดทุกทาง (ปุ่ม ✕ · แตะพื้นหลัง · Esc · ปุ่มย้อนกลับของเครื่อง · โค้ดสั่ง goBack หลังบันทึก)
    ผ่าน beforeRemove ที่เดียว — เล่นท่าปิดก่อนแล้วค่อยปล่อยให้ navigator เอาหน้าออกจริง
  */
  const leaving = useRef(false);
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (e) => {
        if (leaving.current) return;
        e.preventDefault();
        leaving.current = true;
        const ms = sheet ? 260 : 170;
        Animated.parallel([timing(fade, 0, ms, EXIT_EASE), timing(appear, sheet ? 0 : 0.6, ms, EXIT_EASE)]).start(() =>
          navigation.dispatch(e.data.action),
        );
      }),
    [navigation, sheet, fade, appear],
  );

  const close = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  const active = panes.filter((p) => !p.leaving && !p.gone);
  // Esc ปิดหน้าต่างบนเว็บ — ถ้ามีฟอร์มขั้นเปิดอยู่ ให้ฟอร์มนั้นจัดการเอง (ปุ่มกลับของมัน)
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && active.length === 0) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, active.length]);

  // ฟอร์มแรกที่ทับใบงานอยู่เป็นตัวกำหนดว่าใบงานถอยไปข้างหลังแค่ไหน (แบบหน้าซ้อนบน iPhone)
  const under = panes[0]?.t;
  const r = range.current;
  const sizing = resizing
    ? {
        ...(sheet ? null : { width: grow.interpolate({ inputRange: [0, 1], outputRange: [r.w0, r.w1] }) }),
        height: grow.interpolate({ inputRange: [0, 1], outputRange: [r.h0, r.h1] }),
        maxWidth: "100%" as const,
        maxHeight: "100%" as const,
      }
    : null;
  const motion = sheet
    ? { transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [screenH, 0] }) }] }
    : { opacity: fade, transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] };
  const big = max || resizing;

  return (
    <PopupPaneContext.Provider value={host.current}>
      <PopupMaxContext.Provider value={max}>
        <View
          style={[styles.backdrop, sheet && styles.backdropSheet, big && !sheet && styles.backdropMax]}
          onLayout={(e) => (box.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        >
          <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: fade }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="ปิดหน้าต่าง" />
          </Animated.View>
          <Animated.View
            onLayout={(e) => {
              const { width: w, height: h } = e.nativeEvent.layout;
              if (!max && !resizing) normal.current = { w, h };
              setCardW(w);
            }}
            style={[
              styles.card,
              sheet ? [styles.cardSheet, { paddingBottom: insets.bottom }] : { maxWidth: width },
              max && !resizing && styles.cardMax,
              sizing,
              motion,
            ]}
          >
            <Animated.View
              style={[
                styles.body,
                under && { transform: [{ translateX: under.interpolate({ inputRange: [0, 1], outputRange: [0, -0.3 * cardW] }) }] },
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
              {under ? (
                <Animated.View
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFill, styles.dim, { opacity: under.interpolate({ inputRange: [0, 1], outputRange: [0, 0.14] }) }]}
                />
              ) : null}
            </Animated.View>
            {panes.map((p) => (
              <PaneView key={p.key} pane={p} width={cardW} onGone={remove} onSwiped={markGone} />
            ))}
          </Animated.View>
        </View>
      </PopupMaxContext.Provider>
    </PopupPaneContext.Provider>
  );
}

/**
 * ฟอร์มขั้นที่เลื่อนเข้ามาจากขวา ทับเนื้อหาเดิมในกรอบเดียวกัน
 * ปัดจากขอบซ้ายไปทางขวาเพื่อย้อนกลับได้แบบ iPhone — จับเฉพาะขอบ ไม่แย่งการลากในช่องกรอก/ตาราง
 */
function PaneView({
  pane,
  width,
  onGone,
  onSwiped,
}: {
  pane: Pane;
  width: number;
  onGone: (key: string) => void;
  onSwiped: (key: string) => void;
}) {
  const { t } = pane;
  useEffect(() => {
    spring(t, 1, "push").start();
    lockHistorySwipe(true);
    return () => lockHistorySwipe(false);
  }, [t]);
  useEffect(() => {
    if (!pane.leaving) return;
    spring(t, 0, "push").start(({ finished }) => finished && onGone(pane.key));
  }, [pane.leaving, pane.key, t, onGone]);

  const ref = useRef<View>(null);
  const left = useRef(0);
  const live = useRef({ pane, width });
  live.current = { pane, width };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) =>
          !live.current.pane.busy &&
          !!live.current.pane.onBack &&
          g.x0 - left.current < 40 &&
          g.dx > 8 &&
          Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderGrant: () => {
          lockSelection(true);
          t.stopAnimation();
        },
        onPanResponderMove: (_, g) => {
          const W = live.current.width || 1;
          t.setValue(g.dx >= 0 ? 1 - g.dx / W : 1 + rubber(-g.dx, W * 0.1) / W);
        },
        onPanResponderRelease: (_, g) => {
          lockSelection(false);
          const W = live.current.width || 1;
          const v = (-g.vx * 1000) / W;
          if (g.dx > W * 0.35 || g.vx > 0.45) {
            const { key, onBack } = live.current.pane;
            onSwiped(key);
            spring(t, 0, "push", v).start(() => {
              onBack?.();
              // ฟอร์มไม่ยอมปิด (เช่นมีเงื่อนไขของมันเอง) → เลื่อนกลับเข้ามา ไม่ค้างว่างเปล่า
              setTimeout(() => spring(t, 1, "settle").start(), 80);
            });
          } else {
            spring(t, 1, "settle", v).start();
          }
        },
        onPanResponderTerminate: () => {
          lockSelection(false);
          spring(t, 1, "settle").start();
        },
      }),
    [t, onSwiped],
  );

  return (
    <Animated.View
      ref={ref}
      {...pan.panHandlers}
      onLayout={() => ref.current?.measureInWindow((x) => (left.current = x))}
      pointerEvents={pane.leaving || pane.gone ? "none" : "auto"}
      style={[
        styles.pane,
        styles.paneTouch,
        {
          transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [width || 600, 0] }) }],
          shadowOpacity: t.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18], extrapolate: "clamp" }),
        },
      ]}
    >
      {pane.node}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  // พื้นมืดเป็นชั้นของตัวเอง ค่อย ๆ มืดพร้อมหน้าต่าง และค่อย ๆ สว่างตอนปิด
  scrim: {
    backgroundColor: "rgba(15,23,42,0.42)",
    // เบลอหน้าข้างหลังแบบต้นแบบ (มีผลเฉพาะเว็บ)
    ...(Platform.OS === "web" ? ({ backdropFilter: "blur(3px)" } as object) : null),
  },
  dim: { backgroundColor: "#0F172A" },
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
  // ปัดแนวนอนในฟอร์มเป็นของแอป (ปัดย้อนกลับ) — ไม่งั้น Chrome บนจอสัมผัสถือว่าเป็นท่าย้อนหน้าเว็บ
  // แล้วออกจากแอปไปหน้าก่อนหน้าทั้งหน้า เลื่อนขึ้นลงยังเป็นของเบราว์เซอร์ตามปกติ
  paneTouch: (Platform.OS === "web" ? { touchAction: "pan-y" } : {}) as object,
  pane: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    shadowColor: "#0F172A",
    shadowOffset: { width: -8, height: 0 },
    shadowRadius: 24,
  },
});
