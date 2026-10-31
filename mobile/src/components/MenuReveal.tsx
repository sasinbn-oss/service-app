import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Animated, Easing, LayoutChangeEvent, Platform, StyleProp, View, ViewStyle } from "react-native";
import { reduceMotion } from "../utils/motion";

/**
 * กาง/ย่อกลุ่มในเมนูข้าง — แบบ ค. "ทยอยทีละรายการ" 0.32 วินาที (เจ้าของงานเลือกจากตัวอย่าง ต.ค. 69)
 *
 * เดิมกดหัวกลุ่มแล้วรายการโผล่/หายในพริบตาเดียว กลุ่มข้างล่างกระโดดไปทันที ตาตามไม่ทันว่าอะไรเปิดออกมา
 * แบบนี้ช่องของทุกรายการกางพร้อมกัน (กลุ่มข้างล่างเลื่อนลงนุ่ม ๆ ทีเดียว) แต่ตัวรายการโผล่ไล่จากบนลงล่าง
 * ตอนย่อไม่ไล่ทีละรายการ — คนกดย่อคือจะไปทำอย่างอื่นแล้ว ปิดต้องเร็ว
 *
 * ตัวเลขทุกตัวตามตัวอย่างที่เจ้าของงานกดดูแล้วเลือก ไม่คูณ TEMPO ของ utils/motion
 * — ที่เลือกคือ "0.32 วินาที" ที่เห็นจริง ถ้าคูณแล้วจะเร็วกว่าที่เลือกไว้
 *
 * ของพวกนี้มีอยู่เฉพาะระหว่างเคลื่อนไหว พักแล้วหน้าเหมือนก่อนมีการเคลื่อนไหวทุกอย่าง: รายการของกลุ่มที่ย่อ
 * ไม่อยู่ในหน้าเลย ตัวเลขบนหัวกลุ่มที่กางไม่อยู่ในหน้า — เทสต์ผ่านเบราว์เซอร์หลายชุดนับชื่อเมนูที่อยู่ในหน้า
 *
 * บนเว็บใช้ CSS transition ไม่ใช่ Animated — Animated บนเว็บขยับทีละเฟรมด้วย JavaScript แย่งเวลากับหน้า
 * ที่กำลังวาดรายการยาว ๆ อยู่ข้าง ๆ (เหตุผลเดียวกับ LoadingBar) · CSS ให้เบราว์เซอร์ไล่เอง ตั้งค่าแถวละครั้งเดียว
 * มือถือใช้ Animated ตามปกติ
 */

const OPEN_MS = 320;
/** ย่อเร็วกว่ากาง (0.8 เท่า) — ตามตัวอย่าง */
const CLOSE_MS = 256;
/** ตัวรายการทึบเต็มก่อนช่องกางสุด — ไม่เห็นตัวหนังสือโปร่ง ๆ ค้างตอนช่องหยุดแล้ว */
const FADE_IN_MS = 256;
/** ตอนย่อตัวรายการจางหายก่อนช่องหุบได้ครึ่งทาง — ไม่เห็นตัวหนังสือถูกขอบช่องบีบตัด */
const OUT_MS = 128;
const STAGGER_MS = 35;
/** ตัวรายการเลื่อนลงมาจากใต้หัวกลุ่มนิดเดียว — ให้รู้ว่าโผล่ออกมาจากกลุ่มนี้ */
const SHIFT = -10;
/** เผื่อเฟรมที่ช้าก่อนกลับไปพัก — พักเร็วไปจะเห็นแถวสุดท้ายกระตุกถึงปลายทาง หรือช่องที่กำลังหุบหายวับก่อนหุบสุด */
const SLACK_MS = 60;

const CSS_OPEN = "cubic-bezier(0.22, 0.61, 0.36, 1)";
const CSS_CLOSE = "cubic-bezier(0.4, 0, 0.2, 1)";
const EASE_OPEN = Easing.bezier(0.22, 0.61, 0.36, 1);
const EASE_CLOSE = Easing.bezier(0.4, 0, 0.2, 1);
// "ease" ของ CSS — Easing.ease ของ RN เป็นคนละเส้น (ออกตัวช้ากว่า) มือถือกับเว็บจะจางไม่เท่ากัน
const EASE_FADE = Easing.bezier(0.25, 0.1, 0.25, 1);

/**
 * ความสูงแถวเมนูล่าสุดที่วัดได้ — ใช้แค่เป็นค่าตั้งต้นก่อนวัดแถวนั้นจริง (ทุกแถววัดของตัวเองก่อนขยับเสมอ)
 * 58 = ตัวหนังสือสองบรรทัด (22 + 16) + ขอบใน 9 × 2 + ขอบนอก 1 × 2 ตาม styles.item ของ SideMenu
 */
let rowHeight = 58;

/** เวลาที่ทั้งกลุ่มเคลื่อนไหวจนจบ — ตอนกางรายการสุดท้ายออกตัวช้าสุด จึงนับเวลาหน่วงของมันด้วย */
function totalMs(open: boolean, rows: number) {
  return (open ? OPEN_MS + Math.max(0, rows - 1) * STAGGER_MS : CLOSE_MS) + SLACK_MS;
}

/**
 * กลุ่มนี้กำลังกาง/ย่ออยู่หรือไม่ — ระหว่างนี้รายการที่จะซ่อนยังต้องอยู่ในหน้า (กำลังหุบ)
 * และป้ายบนหัวกลุ่มยังต้องอยู่ (กำลังจางออก) ครบเวลาแล้วกลับไปเหมือนเดิมทุกอย่าง
 *
 * เริ่มเฉพาะตอนสถานะกลุ่มเปลี่ยนต่อหน้า — สร้างครั้งแรก (เปิดแอป · โหลดหน้าใหม่ · เปิดเมนูเลื่อนออก
 * · สลับดูในฐานะ) วาดสภาพสุดท้ายเลย ไม่ใช่เห็นทุกกลุ่มหุบตัวเองตอนเปิดหน้า
 * คนที่ตั้ง "ลดการเคลื่อนไหว" ในเครื่อง (เวียนหัวกับภาพเคลื่อนไหว) สลับทันทีเหมือนก่อนมีของนี้
 * · still = แถบไอคอน (เมนูหด) ไม่มีหัวกลุ่ม หดไปมาแล้วกลุ่มต้องไม่หุบ/กางให้เห็น
 * · rows = จำนวนรายการที่ขยับ (ไม่นับหน้าที่เปิดอยู่ซึ่งไม่หุบ) — ใช้นับเวลาจนแถวสุดท้ายโผล่ครบ
 */
export function useGroupBusy(closed: boolean, still: boolean, rows: number) {
  const [m, setM] = useState({ closed, busy: false });
  // ตั้งระหว่างวาดเลย ไม่รอ effect — ถ้ารอ รอบแรกที่ย่อจะถอดรายการออกไปก่อน แล้วค่อยใส่กลับมาให้หุบ (กะพริบ)
  if (m.closed !== closed) setM({ closed, busy: !still && !reduceMotion() });
  else if (still && m.busy) setM({ closed, busy: false });
  useEffect(() => {
    if (!m.busy) return;
    // กดซ้ำกลางทาง → closed เปลี่ยน → นับเวลาใหม่ตามทางที่ไปตอนนี้
    const t = setTimeout(() => setM((s) => ({ ...s, busy: false })), totalMs(!m.closed, rows));
    return () => clearTimeout(t);
  }, [m.busy, m.closed, rows]);
  return m.busy && !still;
}

// ─── เว็บ: CSS transition ───────────────────────────────────────────────

type Dom = HTMLElement & { inert?: boolean };
const dom = (r: React.RefObject<View | null>) => r.current as unknown as Dom | null;
/** transition* ไม่อยู่ในชนิดของ RN แต่ react-native-web ส่งเป็น CSS ให้ตรง ๆ (แบบเดียวกับ LoadingBar) */
const css = (s: Record<string, unknown>) => s as ViewStyle;

/**
 * rest = พัก ไม่มีสไตล์การเคลื่อนไหวเลย
 * enter = เพิ่งถูกสร้างกลางการเคลื่อนไหว · hold = เริ่มจากที่พัก · ทั้งสองต้องวาดจุดตั้งต้นให้เบราว์เซอร์เห็นหนึ่งรอบก่อน
 * run = ไล่ไปหาเป้า — กดซ้ำกลางทางเปลี่ยนแค่เป้า CSS ไล่ย้อนจากตำแหน่งที่อยู่ตอนนั้นเอง ไม่กระโดด
 */
type Phase = "rest" | "enter" | "hold" | "run";
function usePhase(busy: boolean, holdFirst: boolean) {
  const [phase, setPhase] = useState<Phase>(busy ? "enter" : "rest");
  if (!busy && phase !== "rest") setPhase("rest");
  else if (busy && phase === "rest") setPhase(holdFirst ? "hold" : "run");
  return [phase, setPhase] as const;
}

/**
 * อ่านขนาดหนึ่งครั้ง = บังคับให้เบราว์เซอร์คำนวณสไตล์จุดตั้งต้นตอนนี้
 * ไม่งั้นจุดตั้งต้นกับปลายทางถูกรวบเป็นรอบเดียวก่อนวาด transition ไม่เกิด รายการโผล่ทันทีเหมือนเดิม
 */
function settle(r: React.RefObject<View | null>) {
  dom(r)?.getBoundingClientRect();
}

interface RevealProps {
  /** ปลายทาง: กาง (เห็น) หรือหุบ */
  open: boolean;
  /** กลุ่มกำลังเคลื่อนไหว — false = พัก */
  busy: boolean;
  /** ลำดับในรายการที่โผล่ (นับเฉพาะรายการที่ถูกซ่อน) — ตอนกางหน่วงทีละ 35 ms ตามลำดับนี้ */
  order: number;
  children: React.ReactNode;
}

function RevealWeb({ open, busy, order, children }: RevealProps) {
  const outer = useRef<View>(null);
  const inner = useRef<View>(null);
  const [h, setH] = useState(rowHeight);
  // ย่อจากที่พักต้องผ่าน hold: ความสูงตอนพักเป็น auto ซึ่ง CSS ไล่ไปหา 0 ไม่ได้ ต้องวาดเป็นตัวเลขก่อน
  const [phase, setPhase] = usePhase(busy, true);
  const leaving = phase !== "rest" && !open;

  useLayoutEffect(() => {
    if (phase !== "enter" && phase !== "hold") return;
    // วัดตรงจากหน้าก่อนเบราว์เซอร์วาด (ช่องหุบอยู่แต่ตัวรายการข้างในสูงเต็มเสมอ) ไม่ใช้ onLayout บนเว็บ:
    // onLayout มาทีหลังหนึ่งเฟรม (ช่องจะกางไปหาความสูงเดาก่อนแล้วค่อยแก้) และติดตัววัดขนาดให้ทุกแถวตลอดเวลา
    // ซึ่งยิงทุกเฟรมตอนเมนูยืด/หด ทั้งที่ต้องการความสูงแค่ตอนเริ่มขยับ
    const real = dom(inner)?.getBoundingClientRect().height ?? 0;
    if (real > 0 && Math.abs(real - h) > 0.5) {
      rowHeight = real;
      setH(real);
      // จุดตั้งต้นของการย่อคือความสูงจริง — วาดใหม่ด้วยค่าที่ถูกก่อน ไม่งั้นช่องกระตุกตอนเริ่มหุบ
      if (phase === "hold") return;
    }
    settle(outer);
    setPhase("run");
  }, [phase, h, setPhase]);

  useLayoutEffect(() => {
    // inert = คลิก/แท็บไปไม่ถึง และโปรแกรมอ่านจอข้าม — แถวที่กำลังหุบเลื่อนหนีอยู่ใต้เมาส์
    // คลิกที่ตั้งใจจะกดของข้างล่างต้องไม่ไปโดนแถวที่กำลังจะหายแทน · react-native-web ไม่ส่ง prop นี้ จึงตั้งที่ DOM เอง
    const el = dom(outer);
    if (el && !!el.inert !== leaving) el.inert = leaving;
  }, [leaving]);

  let slot: ViewStyle | undefined;
  let body: ViewStyle | undefined;
  if (phase === "enter") {
    slot = { height: 0, overflow: "hidden" };
    body = { opacity: 0, transform: [{ translateY: SHIFT }] };
  } else if (phase === "hold") {
    slot = { height: h, overflow: "hidden" };
  } else if (phase === "run") {
    // ความสูงไม่หน่วง — ช่องกางพร้อมกันทั้งกลุ่ม · หน่วงเฉพาะตัวรายการ และเฉพาะตอนกาง
    const delay = `${open ? order * STAGGER_MS : 0}ms`;
    slot = css({
      height: open ? h : 0,
      overflow: "hidden",
      transitionProperty: "height",
      transitionDuration: `${open ? OPEN_MS : CLOSE_MS}ms`,
      transitionTimingFunction: open ? CSS_OPEN : CSS_CLOSE,
    });
    body = css({
      opacity: open ? 1 : 0,
      transform: [{ translateY: open ? 0 : SHIFT }],
      transitionProperty: "opacity, transform",
      transitionDuration: open ? `${FADE_IN_MS}ms, ${OPEN_MS}ms` : `${OUT_MS}ms, ${OUT_MS}ms`,
      transitionTimingFunction: `ease, ${CSS_OPEN}`,
      transitionDelay: `${delay}, ${delay}`,
    });
  }
  return (
    // ห่อสองชั้นตลอดแม้ตอนพัก (ไม่มีสไตล์ = หน้าตาเหมือนเดิม) — ถ้าห่อเฉพาะตอนขยับ แถวจะถูกสร้างใหม่ทุกครั้งที่เริ่ม/จบ
    <View ref={outer} style={[slot, leaving && { pointerEvents: "none" }]} aria-hidden={leaving}>
      <View ref={inner} style={body}>
        {children}
      </View>
    </View>
  );
}

interface FadeProps {
  /** ปลายทาง: เห็นหรือจางหาย */
  shown: boolean;
  busy: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

function FadeWeb({ shown, busy, style, children }: FadeProps) {
  const node = useRef<View>(null);
  // จางออกเริ่มจากที่พักได้เลย (ความทึบไล่จาก 1 ได้) — มีแต่ตอนถูกสร้างใหม่ที่ต้องวาด 0 ให้เห็นก่อน
  const [phase, setPhase] = usePhase(busy, false);
  useLayoutEffect(() => {
    if (phase !== "enter") return;
    settle(node);
    setPhase("run");
  }, [phase, setPhase]);
  const fade =
    phase === "enter"
      ? { opacity: 0 }
      : phase === "run"
        ? css({
            opacity: shown ? 1 : 0,
            transitionProperty: "opacity",
            // ตามตัวอย่าง: จังหวะเดียวกับทางที่กลุ่มกำลังไป (ย่อ = โผล่ 0.256 วิ · กาง = จางออก 0.32 วิ)
            transitionDuration: `${shown ? CLOSE_MS : OPEN_MS}ms`,
            transitionTimingFunction: "ease",
          })
        : undefined;
  return (
    <View ref={node} style={[style, fade]}>
      {children}
    </View>
  );
}

interface TurnProps {
  open: boolean;
  busy: boolean;
  children: React.ReactNode;
}

/** ลูกศรตัวเดียวหมุนกลับหัว — เดิมสลับรูปลง/ขึ้นเฉย ๆ ไม่บอกว่ากำลังเกิดอะไร */
function TurnWeb({ open, busy, children }: TurnProps) {
  const turn = { transform: [{ rotate: open ? "180deg" : "0deg" }] };
  // ใส่ transition เฉพาะตอนกลุ่มขยับ — ตอนพักลูกศรต้องอยู่ที่ของมันทันที (เปิดหน้า · ลดการเคลื่อนไหว)
  const ease = busy
    ? css({
        transitionProperty: "transform",
        transitionDuration: `${open ? OPEN_MS : CLOSE_MS}ms`,
        transitionTimingFunction: open ? CSS_OPEN : CSS_CLOSE,
      })
    : null;
  return <View style={[turn, ease]}>{children}</View>;
}

// ─── มือถือ: Animated ──────────────────────────────────────────────────
// ทุกตัวใช้ JS driver — ความสูงทำบน native driver ไม่ได้ (เหตุผลเดียวกับ utils/motion) และแถวมีไม่กี่แถว

function RevealNative({ open, busy, order, children }: RevealProps) {
  const [h, setH] = useState(rowHeight);
  // ถูกสร้างกลางการเคลื่อนไหว = กำลังกาง → เริ่มจากหุบ
  const start = busy ? 0 : 1;
  const grow = useRef(new Animated.Value(start)).current;
  const show = useRef(new Animated.Value(start)).current;
  const lift = useRef(new Animated.Value(start)).current;
  useEffect(() => {
    if (!busy) {
      grow.setValue(1);
      show.setValue(1);
      lift.setValue(1);
      return;
    }
    const to = open ? 1 : 0;
    const delay = open ? order * STAGGER_MS : 0;
    // ไล่จากค่าที่อยู่ตอนนี้ — กดซ้ำกลางทาง effect เดิมหยุดแล้วเริ่มใหม่จากตรงนั้น ไม่กระโดด
    const run = Animated.parallel([
      Animated.timing(grow, { toValue: to, duration: open ? OPEN_MS : CLOSE_MS, easing: open ? EASE_OPEN : EASE_CLOSE, useNativeDriver: false }),
      Animated.timing(show, { toValue: to, duration: open ? FADE_IN_MS : OUT_MS, delay, easing: EASE_FADE, useNativeDriver: false }),
      Animated.timing(lift, { toValue: to, duration: open ? OPEN_MS : OUT_MS, delay, easing: EASE_OPEN, useNativeDriver: false }),
    ]);
    run.start();
    return () => run.stop();
  }, [busy, open, order, grow, show, lift]);

  // มือถือวัดด้วย onLayout ได้ตลอด — ไม่มีปัญหาเฟรมช้าแบบเว็บ และตอนพักแถวนี้วัดไว้แล้วก่อนเริ่มหุบ
  const measured = (e: LayoutChangeEvent) => {
    const v = e.nativeEvent.layout.height;
    if (v <= 0) return;
    rowHeight = v;
    setH((old) => (Math.abs(old - v) > 0.5 ? v : old));
  };

  const leaving = busy && !open;
  return (
    <Animated.View
      style={busy ? { height: grow.interpolate({ inputRange: [0, 1], outputRange: [0, h] }), overflow: "hidden" } : undefined}
      pointerEvents={leaving ? "none" : undefined}
      aria-hidden={leaving}
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? "no-hide-descendants" : undefined}
    >
      <Animated.View
        onLayout={measured}
        style={
          busy
            ? { opacity: show, transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [SHIFT, 0] }) }] }
            : undefined
        }
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

function FadeNative({ shown, busy, style, children }: FadeProps) {
  const v = useRef(new Animated.Value(busy ? 0 : 1)).current;
  useEffect(() => {
    if (!busy) {
      v.setValue(1);
      return;
    }
    const run = Animated.timing(v, { toValue: shown ? 1 : 0, duration: shown ? CLOSE_MS : OPEN_MS, easing: EASE_FADE, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [busy, shown, v]);
  return <Animated.View style={[style, { opacity: v }]}>{children}</Animated.View>;
}

function TurnNative({ open, busy, children }: TurnProps) {
  const v = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    if (!busy) {
      v.setValue(open ? 1 : 0);
      return;
    }
    const run = Animated.timing(v, { toValue: open ? 1 : 0, duration: open ? OPEN_MS : CLOSE_MS, easing: open ? EASE_OPEN : EASE_CLOSE, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [open, busy, v]);
  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  return <Animated.View style={{ transform: [{ rotate }] }}>{children}</Animated.View>;
}

const web = Platform.OS === "web";

/** ช่องของรายการหนึ่งแถว — ความสูงกาง/หุบ ตัวรายการจาง+เลื่อน · พักแล้วเป็นกล่องเปล่าไม่มีสไตล์ */
export const RevealRow = web ? RevealWeb : RevealNative;
/** ป้ายบนหัวกลุ่ม (จำนวนรายการ · ตัวเลขกล่องงาน · รอตรวจ) — จางเข้าเมื่อย่อ จางออกเมื่อกาง */
export const FadeSlot = web ? FadeWeb : FadeNative;
/** ลูกศรหัวกลุ่ม — กางอยู่ = หมุน 180° */
export const Turn = web ? TurnWeb : TurnNative;
