import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import TouchableOpacity from "./Tap";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radius, shadow, spacing, headingFont } from "../theme";
import { PaneMaximizeButton, usePopupPane } from "./PopupScreen";
import { EXIT_EASE, lockSelection, rubber, spring, timing } from "../utils/motion";

/**
 * หน้าต่างลอยแบบ OTTERI ที่ทุกหน้าใช้ร่วมกัน
 *
 * หัวหน้าต่างแยกจากเนื้อหา (ชื่อ + ปุ่มปิด ✕ เส้นคั่น) และไม่เลื่อนหายไปตอนเลื่อนอ่าน
 * — ฟอร์มยาวเลื่อนลงไปแล้วยังเห็นว่ากำลังทำอะไรกับใบไหน และปิดได้จากมุมบนเสมอ
 * เดิมแต่ละหน้าวาดหน้าต่างเอง ขนาด มุม และตำแหน่งปุ่มจึงไม่ตรงกันสักหน้า
 *
 * แตะพื้นหลังมืดเพื่อปิดได้ ยกเว้นตอนกำลังบันทึก (busy) — กันปิดหน้าต่าง
 * กลางทางแล้วไม่รู้ว่าบันทึกไปแล้วหรือยัง
 */
export default function AppModal({
  visible,
  title,
  subtitle,
  onClose,
  footer,
  children,
  // 560 พอสำหรับฟอร์มทั่วไป — 640 เดิมกว้างเกินจนช่องกรอกยาวเหยียดอ่านยาก
  // หน้าต่างที่มีตาราง/รายชื่อยาว (นำเข้ารายชื่อ ทะเบียนรถ) ส่ง width ของตัวเองมา
  width = 560,
  busy,
  bodyStyle,
}: {
  visible: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  busy?: boolean;
  bodyStyle?: StyleProp<ViewStyle>;
}) {
  /*
    อยู่ในหน้าที่เป็นหน้าต่างลอยอยู่แล้ว (ใบงาน) → ไม่เปิดหน้าต่างซ้อน
    แต่ส่งเนื้อหาไปเลื่อนเข้ามาแทนที่ในกรอบเดิม พร้อม "‹ กลับ…"
    ส่งใหม่ทุกครั้งที่วาด เพื่อให้ปุ่มกับช่องกรอกในนั้นเห็นค่าล่าสุดเสมอ
  */
  const pane = usePopupPane();
  const key = useRef(`pane-${Math.random().toString(36).slice(2)}`).current;
  const paneNode =
    pane && visible ? (
      <View style={styles.paneRoot}>
        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <TouchableOpacity onPress={onClose} disabled={busy} accessibilityLabel="กลับ">
              <Text style={styles.paneBack} numberOfLines={1}>
                ‹ กลับ{pane.backLabel}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.title, headingFont]}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {/* ฟอร์มที่เลื่อนเข้ามาในหน้าต่างใบงาน — ขยายคือขยายหน้าต่างใบงานทั้งบาน */}
          <PaneMaximizeButton />
          <TouchableOpacity style={styles.close} onPress={onClose} disabled={busy} accessibilityLabel="ปิด">
            <Ionicons name="close" size={24} color={colors.primaryInk} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.paneScroll} contentContainerStyle={[styles.body, bodyStyle]}>
          {children}
        </ScrollView>
        {footer ? <View style={styles.foot}>{footer}</View> : null}
      </View>
    ) : null;
  useEffect(() => {
    if (!pane) return;
    if (paneNode) pane.show(key, paneNode, { onBack: onClose, busy: !!busy });
    else pane.hide(key);
  });
  useEffect(() => () => pane?.hide(key), [pane, key]);

  const { width: screenW, height: screenH } = useWindowDimensions();
  // จอแคบ (มือถือ) เปิดจากด้านล่างเต็มกว้าง — นิ้วโป้งถึงปุ่มบันทึก และไม่เหลือขอบว่างข้าง ๆ
  const sheet = screenW < 600;

  /*
    ปิดแบบค่อย ๆ ออก ต้องวาดหน้าต่างต่ออีกครู่หลัง visible เป็น false
    แต่ตอนนั้นหน้าที่เปิดมักล้างข้อมูลไปแล้ว (เช่น visible={!!editing} แล้ว editing = null)
    ถ้าวาด children ใหม่จะพังเพราะอ่านค่า null — จึงวาดเนื้อหาชุดสุดท้ายที่เปิดอยู่แทน
  */
  const last = useRef({ title, subtitle, children, footer });
  if (visible) last.current = { title, subtitle, children, footer };
  const shown = last.current;

  const [mounted, setMounted] = useState(visible);
  const fade = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  // ปัดแผ่นล่างลงจนพ้นจอแล้ว — ตอน visible เป็น false ไม่ต้องเล่นท่าปิดซ้ำ
  const swiped = useRef(false);

  // ขยายเกือบเต็มจอ — ไทม์ไลน์ยาว ตารางนำเข้า ฟอร์มหลายขั้น อ่านในกรอบเล็กต้องเลื่อนไม่หยุด
  // เปิดครั้งใหม่กลับขนาดปกติเสมอ ไม่จำค่า เพราะหน้าต่างส่วนใหญ่สั้นและขนาดปกติอ่านง่ายกว่า
  const [max, setMax] = useState(false);
  // ขนาด "เต็มจอ" กับ "ปกติ" เป็นเปอร์เซ็นต์/ตามเนื้อหา ซึ่งค่อย ๆ ไหลระหว่างกันไม่ได้
  // ระหว่างยืด/หดจึงใช้ขนาดเป็นพิกเซลที่วัดไว้ จบแล้วคืนเป็นแบบเดิม (หมุนจอ/ย่อหน้าต่างแล้วยังพอดี)
  const [resizing, setResizing] = useState(false);
  const grow = useRef(new Animated.Value(0)).current;
  const box = useRef({ w: 0, h: 0 });
  const normal = useRef({ w: 0, h: 0 });
  const range = useRef({ w0: 0, h0: 0, w1: 0, h1: 0 });

  useEffect(() => {
    if (pane) return;
    if (visible) {
      setMounted(true);
      setMax(false);
      setResizing(false);
      grow.setValue(0);
      swiped.current = false;
      drag.setValue(0);
      fade.setValue(0);
      appear.setValue(0);
      Animated.parallel([
        timing(fade, 1, sheet ? 260 : 150, Easing.out(Easing.quad)),
        sheet ? timing(appear, 1, 500) : spring(appear, 1, "pop"),
      ]).start();
    } else if (mounted) {
      if (swiped.current) {
        setMounted(false);
        return;
      }
      const ms = sheet ? 260 : 170;
      Animated.parallel([timing(fade, 0, ms, EXIT_EASE), timing(appear, sheet ? 0 : 0.6, ms, EXIT_EASE)]).start(
        ({ finished }) => finished && setMounted(false),
      );
    }
    // เล่นเฉพาะตอนเปิด/ปิด — ค่าอื่นเปลี่ยนระหว่างเปิดอยู่ไม่ต้องเล่นใหม่
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function toggleMax() {
    const next = !max;
    const pad = sheet ? 0 : spacing.sm;
    const n = normal.current;
    range.current = { w0: n.w, h0: n.h, w1: sheet ? n.w : box.current.w - pad * 2, h1: box.current.h - pad * 2 };
    setResizing(true);
    setMax(next);
    spring(grow, next ? 1 : 0, "resize").start(({ finished }) => finished && setResizing(false));
  }

  // ปัดแผ่นล่างลงเพื่อปิด (มือถือ) — จับได้เฉพาะที่หัวแผ่น ไม่แย่งการเลื่อนอ่านเนื้อหา
  const live = useRef({ sheet, busy, onClose, visible, h: 0 });
  live.current = { ...live.current, sheet, busy, onClose, visible };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) =>
          live.current.sheet && !live.current.busy && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => lockSelection(true),
        onPanResponderMove: (_, g) => drag.setValue(g.dy >= 0 ? g.dy : -rubber(-g.dy, 60)),
        onPanResponderRelease: (_, g) => {
          lockSelection(false);
          const h = live.current.h || 400;
          if (g.dy > h * 0.25 || g.vy > 0.5) {
            swiped.current = true;
            Animated.parallel([timing(drag, h + 40, 220, EXIT_EASE), timing(fade, 0, 220, EXIT_EASE)]).start(() => {
              live.current.onClose();
              // หน้าที่เปิดไม่ยอมปิด (เช่นมีเงื่อนไขของมันเอง) → ดึงแผ่นกลับขึ้นมา ไม่ค้างนอกจอ
              setTimeout(() => {
                if (!live.current.visible) return;
                swiped.current = false;
                Animated.parallel([spring(drag, 0, "settle"), timing(fade, 1, 150)]).start();
              }, 80);
            });
          } else {
            spring(drag, 0, "settle", g.vy * 1000).start();
          }
        },
        onPanResponderTerminate: () => {
          lockSelection(false);
          spring(drag, 0, "settle").start();
        },
      }),
    [drag, fade],
  );

  if (pane || !mounted) return null;

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
    ? { transform: [{ translateY: Animated.add(appear.interpolate({ inputRange: [0, 1], outputRange: [screenH, 0] }), drag) }] }
    : { opacity: fade, transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] };
  const big = max || resizing;

  return (
    <Modal visible transparent animationType="none" onRequestClose={busy ? undefined : onClose}>
      <View
        style={[styles.backdrop, sheet && styles.backdropSheet, big && !sheet && styles.backdropMax]}
        onLayout={(e) => (box.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={busy || !visible ? undefined : onClose} accessibilityLabel="ปิดหน้าต่าง" />
        </Animated.View>
        <Animated.View
          pointerEvents={visible ? "auto" : "none"}
          onLayout={(e) => {
            live.current.h = e.nativeEvent.layout.height;
            if (!max && !resizing) normal.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
          }}
          style={[styles.card, { maxWidth: width }, sheet && styles.cardSheet, max && !resizing && styles.cardMax, sizing, motion]}
        >
          {/* หัวแผ่นล่างเลือกข้อความไม่ได้: บนเว็บพอเริ่มระบายข้อความ ระบบสัมผัสจะไม่ยอมให้ลากต่อ */}
          <View {...pan.panHandlers} style={sheet && styles.noSelect}>
            {sheet ? <View style={styles.grab} /> : null}
            <View style={[styles.head, sheet && styles.headSheet]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.title, headingFont]}>{shown.title}</Text>
                {shown.subtitle ? <Text style={styles.subtitle}>{shown.subtitle}</Text> : null}
              </View>
              <MaximizeButton on={max} onPress={toggleMax} />
              <TouchableOpacity style={styles.close} onPress={onClose} disabled={busy} accessibilityLabel="ปิด">
                <Ionicons name="close" size={24} color={colors.primaryInk} />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView style={[styles.scroll, big && { flexGrow: 1 }]} contentContainerStyle={[styles.body, bodyStyle]}>
            {shown.children}
          </ScrollView>
          {shown.footer ? <View style={styles.foot}>{shown.footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** ปุ่มขยาย/ย่อหน้าต่าง — ใช้ร่วมกับ PopupScreen (หน้าต่างใบงาน) ให้หน้าตาและตำแหน่งตรงกันทุกบาน */
export function MaximizeButton({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.close}
      onPress={onPress}
      accessibilityLabel={on ? "ย่อหน้าต่างกลับขนาดปกติ" : "ขยายหน้าต่างเต็มจอ"}
      accessibilityState={{ expanded: on }}
    >
      <Ionicons name={on ? "contract-outline" : "expand-outline"} size={21} color={colors.primaryInk} />
    </TouchableOpacity>
  );
}

/** แถว "หัวข้อ — ค่า" แบบในหน้าต่างรายละเอียดของ OTTERI */
export function ModalRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof children === "string" || typeof children === "number" ? (
          <Text style={styles.rowValue}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/** หัวข้อย่อยในหน้าต่าง มีไอคอนนำหน้า */
export function ModalSection({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={styles.section}>
      <Ionicons name={icon} size={20} color={colors.navy} />
      <Text style={styles.sectionText}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  // พื้นมืดแยกเป็นชั้นของตัวเอง เพื่อให้ค่อย ๆ มืดลงพร้อมหน้าต่าง ไม่ใช่มืดฉับแล้วหน้าต่างค่อยตามมา
  scrim: {
    backgroundColor: "rgba(15,23,42,0.42)",
    // เบลอหน้าข้างหลังแบบต้นแบบ ให้สายตาอยู่ที่หน้าต่างอย่างเดียว (มีผลเฉพาะเว็บ)
    ...(Platform.OS === "web" ? ({ backdropFilter: "blur(3px)" } as object) : null),
  },
  grab: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginTop: 8 },
  headSheet: { paddingTop: spacing.sm },
  // touchAction: ลากหัวแผ่นลงเป็นของแอป ไม่ใช่ "ดึงลงเพื่อรีเฟรช" ของ Chrome บนมือถือ
  noSelect: (Platform.OS === "web" ? { userSelect: "none", touchAction: "none" } : {}) as object,
  backdropSheet: { justifyContent: "flex-end", padding: 0 },
  backdropMax: { padding: spacing.sm },
  cardMax: { maxWidth: "100%", height: "100%", maxHeight: "100%" },
  cardSheet: { maxWidth: "100%", maxHeight: "90%", borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  card: {
    width: "100%",
    maxHeight: "88%",
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    overflow: "hidden",
    ...shadow.raised,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingLeft: spacing.xl,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 18, lineHeight: 28, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 13, lineHeight: 20, color: colors.textMuted, marginTop: 2 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sky50,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  paneRoot: { flex: 1, backgroundColor: colors.card },
  paneScroll: { flex: 1 },
  paneBack: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.primaryInk },
  body: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  foot: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  row: { flexDirection: "row", gap: spacing.md, paddingVertical: 8 },
  rowLabel: { width: 140, fontSize: 15, lineHeight: 24, color: colors.textMuted },
  rowValue: { fontSize: 15, lineHeight: 24, color: colors.text },
  section: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionText: { fontSize: 17, lineHeight: 26, fontWeight: "800", color: colors.text },
});
