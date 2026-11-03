/**
 * ตัววาด "สอนการใช้งาน" — พื้นมืดเจาะรูที่ปุ่มจริง กรอบรอบปุ่ม และกล่องข้อความ ข้าม / ย้อนกลับ / ถัดไป
 * (เจ้าของงานเลือกจากตัวอย่าง ต.ค. 69 · ขั้นและข้อความอยู่ใน screens/*.howto.ts · ตัวเครื่องอยู่ใน utils/howto.ts)
 *
 * ติดท้าย MainNavigator ตัวเดียว — ออกจากระบบ/สลับดูในฐานะแล้ว MainNavigator ขึ้นใหม่ ตัวนี้หลุดไปพร้อมกัน ไม่มีอะไรค้าง
 *
 * บนเว็บ (ที่พนักงานใช้จริง — PWA) วาดลงใน <body> ชั้นของตัวเอง (Overlay z 2147482000 · data-otteri-howto):
 * อยู่เหนือหน้าต่างใบงานและ Modal ทุกบาน แต่ต่ำกว่ากล่องยืนยัน/แถบข้อความของแอปหนึ่งขั้น — กล่องยืนยันอยู่บนสุดเสมอ
 * ระหว่างเล่น ทุกอย่างใน <body> ยกเว้นสองชั้นนั้นถูกตั้ง inert: ปุ่มใต้พื้นมืดกดไม่ได้ทั้งนิ้วและคีย์บอร์ด (เจ้าของงานกำหนด)
 * ปุ่มที่ถูกชี้ก็กดไม่ได้ (มีแผ่นใสทับ) — ขั้นลองกดใช้ปุ่มแทนขนาดเท่ารู ไม่ได้เปิดรูลงไปที่หน้าจริง หน้าจึงนิ่งสนิททุกขั้น
 * แอปติดตั้ง (APK): กล่องกลางจอใน Modal ไม่ชี้ปุ่ม (ไม่มี DOM ให้หา — แผนงาน D9)
 *
 * ห้ามใช้ animationKeyframes ที่นี่ (CLAUDE.md) — กล่องจางเข้าด้วย Animated 150 ms เท่านั้น ข้ามเมื่อตั้งลดการเคลื่อนไหว
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Modal, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import Overlay from "./Overlay";
import HowToSample from "./HowToSample";
import { feedbackBusy, subscribeFeedback } from "./Feedback";
import { sideMenu, sideMenuOpen } from "./SideMenu";
import { useAuth } from "../context/AuthContext";
import { modalOpened } from "../utils/liveSync";
import { reduceMotion } from "../utils/motion";
import { bodyText } from "../utils/howtoTours";
import {
  bindHowToSession,
  howtoCtx,
  nextStep,
  prevShown,
  prevStep,
  resetHowTo,
  skipMissing,
  stopHowTo,
  takeReturnFocus,
  useHowToStore,
  type HowToRun,
} from "../utils/howto";
import { colors, headingFont, radius, shadow, spacing } from "../theme";

/** ชั้นของกล่องสอน — เหนือ Modal ของ react-native-web (9999) และหน้าต่างใบงาน · ต่ำกว่าชั้นแจ้งผล/ยืนยัน (2147483000) */
const LAYER_Z = 2147482000;
const LAYER_ATTR = "data-otteri-howto";
/** ม่านมืด — สีเดียวกับฉากหลังกล่องยืนยัน (Feedback) แต่ทึบกว่า ให้รูที่เจาะเด่นพอ */
const DIM = "rgba(15,23,42,0.58)";
/** เว้นรอบปุ่มที่ชี้ ให้กรอบไม่ทับตัวหนังสือบนปุ่ม */
const PAD = 6;
const MARGIN = 16;
const GAP = 14;

type Rect = { x: number; y: number; w: number; h: number };

export default function HowToHost() {
  const { user, patchUser } = useAuth();
  useEffect(() => {
    bindHowToSession({ user, patchUser });
  }, [user, patchUser]);
  useEffect(
    () => () => {
      resetHowTo();
      bindHowToSession(null);
    },
    [],
  );
  const { run } = useHowToStore();
  if (!run) return null;
  return Platform.OS === "web" ? <WebLayer run={run} /> : <NativeLayer run={run} />;
}

// ── เว็บ: หา/วัดปุ่มจริงใน DOM ──

/** ทุกอย่างใน <body> ที่ตั้ง inert ไว้ (ยกเว้นชั้นสอนกับชั้นแจ้งผล) — คืนให้เฉพาะตัวที่ตั้งเอง */
let inerted: HTMLElement[] = [];

function inertPage(): () => void {
  const changed: HTMLElement[] = [];
  const apply = (el: Element) => {
    if (!(el instanceof HTMLElement) || el.hasAttribute(LAYER_ATTR) || el.hasAttribute("data-otteri-overlay") || el.inert) return;
    el.inert = true;
    changed.push(el);
  };
  Array.from(document.body.children).forEach(apply);
  // Modal ของ react-native-web (และชั้นอื่นที่ต่อท้าย body ระหว่างเล่น) ต้องโดนด้วย ไม่งั้นกดทะลุได้
  const mo = new MutationObserver((list) => {
    for (const m of list) m.addedNodes.forEach((n) => n instanceof Element && n.parentElement === document.body && apply(n));
  });
  mo.observe(document.body, { childList: true });
  inerted = changed;
  return () => {
    mo.disconnect();
    changed.forEach((el) => (el.inert = false));
    inerted = [];
  };
}

/**
 * ปุ่มนี้เป็นตัวที่เห็นจริงไหม — หน้าที่ซ้อนอยู่ข้างหลัง/แท็บที่สลับออกยังอยู่ใน DOM (tests/README) ชื่อซ้ำกันได้
 * ถามเบราว์เซอร์ว่าจุดกลางปุ่มเป็นของใคร · ของที่ inert ไม่ถูกนับ จึงปลด inert ชั่วคราวแค่ช่วงถาม (ไม่มีเฟรมไหนเห็น)
 */
function onTop(el: Element, r: DOMRect): boolean {
  inerted.forEach((n) => (n.inert = false));
  let hits: Element[] = [];
  try {
    hits = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  } finally {
    inerted.forEach((n) => (n.inert = true));
  }
  const top = hits.find((h) => !h.closest(`[${LAYER_ATTR}],[data-otteri-overlay]`));
  return !!top && (top === el || el.contains(top));
}

/** กรอบรวมของทุกชื่อที่หาเจอ (ขั้นที่ชี้หลายอย่าง เช่นหัวกลุ่ม "รถ" กับสองรายการใต้มัน) · ไม่เจอเลย = null */
function locate(ids: string[]): Rect | null {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rects: DOMRect[] = [];
  let far: Element | null = null;
  for (const id of ids) {
    let hit = false;
    let away: Element | null = null;
    for (const el of Array.from(document.querySelectorAll(`[data-testid="howto-${id}"]`))) {
      if (el.closest(`[${LAYER_ATTR}]`)) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 0 || cx > vw) continue; // เมนูที่กำลังเลื่อนออกมา — รอให้ถึงที่ ไม่เลื่อนหน้าไปหา
      if (cy < 0 || cy > vh) {
        away = away ?? el;
        continue;
      }
      if (onTop(el, r)) {
        rects.push(r);
        hit = true;
        break;
      }
    }
    // ชิ้นที่ยังอยู่นอกจอ (เช่นรายการใต้หัวกลุ่มในเมนูยาว) — เลื่อนหาให้ แม้ชิ้นอื่นของขั้นเดียวกันเจอแล้ว
    if (!hit && away) far = far ?? away;
  }
  if (far) far.scrollIntoView({ block: rects.length ? "nearest" : "center", inline: "nearest" });
  if (rects.length) {
    const x = Math.min(...rects.map((r) => r.left));
    const y = Math.min(...rects.map((r) => r.top));
    return {
      x,
      y,
      w: Math.max(...rects.map((r) => r.right)) - x,
      h: Math.max(...rects.map((r) => r.bottom)) - y,
    };
  }
  // ไม่เจอในจอเลย: ถ้าอยู่นอกจอ (การ์ดใบล่าง ๆ) เลื่อนไปหาแล้วข้างบน — แบบตัวอย่าง "จอจริงเลื่อนลงมาที่การ์ดนี้ให้เอง" · หาใหม่รอบหน้า
  return null;
}

/** Esc ที่ปิดกล่องไปแล้วยังมี keyup ตามมา — Modal ของ react-native-web ปิดตัวเองตอน keyup จึงต้องกินตัวนั้นด้วย */
function swallowNextEscapeUp() {
  const done = () => {
    window.removeEventListener("keyup", f, true);
    clearTimeout(t);
  };
  const f = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    done();
  };
  window.addEventListener("keyup", f, true);
  const t = setTimeout(done, 1500);
}

function focusables(layer: Element | null): HTMLElement[] {
  if (!layer) return [];
  return Array.from(layer.querySelectorAll<HTMLElement>('[tabindex]:not([tabindex="-1"]), button, a[href], input')).filter(
    (el) => el.getClientRects().length > 0 && el.getAttribute("aria-disabled") !== "true" && !el.hasAttribute("disabled"),
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Mode = "sheet" | "center" | "below" | "above" | "right" | "left";

/**
 * ที่วางกล่อง: ใต้ปุ่มถ้าพอ ไม่พอเหนือปุ่ม ไม่พออีก (มือถือ) เป็นแผ่นขอบล่าง · จอคอมปุ่มในเมนูข้าง (x < 300) วางทางขวา
 * ขั้นที่ระบุ sheet = แผ่นขอบล่างเสมอบนมือถือ (เมนูเปิดเต็มฝั่งซ้าย ไม่มีที่ข้างรายการ — ตัวอย่างที่ตกลงไว้)
 */
function place(hole: Rect | null, o: { vw: number; vh: number; bw: number; bh: number; phone: boolean; sheet: boolean }) {
  const { vw, vh, bw, bh, phone } = o;
  const centered = { mode: "center" as Mode, left: (vw - bw) / 2, top: Math.max(MARGIN, (vh - bh) / 2) };
  if (o.sheet && phone) return { mode: "sheet" as Mode, left: 0, top: 0 };
  if (!hole) return centered;
  const hl = clamp(hole.x + hole.w / 2 - bw / 2, MARGIN, vw - bw - MARGIN);
  const side = clamp(hole.y, MARGIN, vh - bh - MARGIN);
  if (!phone && hole.x < 300 && hole.x + hole.w + GAP + bw + MARGIN <= vw) return { mode: "right" as Mode, left: hole.x + hole.w + GAP, top: side };
  if (hole.y + hole.h + GAP + bh <= vh - MARGIN) return { mode: "below" as Mode, left: hl, top: hole.y + hole.h + GAP };
  if (hole.y - GAP - bh >= MARGIN) return { mode: "above" as Mode, left: hl, top: hole.y - GAP - bh };
  if (phone) return { mode: "sheet" as Mode, left: 0, top: 0 };
  if (hole.x - GAP - bw >= MARGIN) return { mode: "left" as Mode, left: hole.x - GAP - bw, top: side };
  return centered;
}

function WebLayer({ run }: { run: HowToRun }) {
  const { width: vw, height: vh } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const step = run.steps[run.i];
  const ids = useMemo(() => (step.target ? ([] as string[]).concat(step.target) : []), [step]);
  const [found, setFound] = useState<{ seq: number; rect: Rect | null } | null>(null);
  const [paused, setPaused] = useState(feedbackBusy());
  const [boxH, setBoxH] = useState(0);
  const boxRef = useRef<View>(null);
  const live = useRef({ paused, slow: run.slow });
  live.current = { paused, slow: run.slow };

  // ถือ "มีหน้าต่างเปิดอยู่" ตลอดที่เล่น — ลากรีเฟรช/โหลดรุ่นใหม่/เช็คของใหม่เบื้องหลังหยุดไว้ก่อน · หน้าข้างหลังกดไม่ได้
  useEffect(() => {
    const release = modalOpened();
    const undo = inertPage();
    return () => {
      undo();
      release();
      // คืนโฟกัสให้ปุ่ม ? ที่กดเริ่ม — คนใช้คีย์บอร์ดไม่หลุดไปต้นหน้า
      takeReturnFocus()?.focus?.();
    };
  }, []);

  // กล่องยืนยัน/หน้าโหลดของแอปขึ้น — หลบ (ไม่วาด) แต่หน้าข้างหลังยังกดไม่ได้ จนกว่ากล่องนั้นปิด
  useEffect(() => subscribeFeedback(() => setPaused(feedbackBusy())), []);

  /**
   * คีย์บอร์ด: ฟังที่ window ช่วงจับ (capture) ก่อนใครทั้งหมด
   * Esc = ข้าม (D10) และต้องไม่ถึงหน้าต่างใบงาน (PopupScreen ปิดตอน keydown) / Modal (ปิดตอน keyup) ข้างหลังเด็ดขาด
   * ระหว่างหลบให้กล่องยืนยัน Esc ถูกกินเฉย ๆ — กล่องยืนยันไม่มี Esc ของตัวเอง ปล่อยผ่านแล้วหน้าต่างใบงานใต้กล่องปิด
   * Tab วนอยู่ในกล่องเสมอ: ทุกอย่างอื่น inert แล้ว Tab ตัวสุดท้ายจะหลุดออกนอกหน้า (และเบราว์เซอร์ที่ไม่มี inert ต้องพึ่งตัวนี้)
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.type === "keydown" && !live.current.paused) {
          swallowNextEscapeUp();
          stopHowTo("skip");
        }
        return;
      }
      if (e.key !== "Tab" || e.type !== "keydown" || live.current.paused) return;
      const layer = document.querySelector(`[${LAYER_ATTR}]`);
      const items = focusables(layer);
      if (!items.length) return;
      e.preventDefault();
      e.stopPropagation();
      const at = items.indexOf(document.activeElement as HTMLElement);
      if (at < 0 && !e.shiftKey) {
        // เพิ่งขึ้นขั้นใหม่ (โฟกัสอยู่ที่ตัวกล่อง) — Tab แรกไปปุ่มหลัก ไม่ต้องไล่ผ่าน "ข้าม"
        const primary = layer?.querySelector<HTMLElement>("[data-howto-primary]");
        (primary && items.includes(primary) ? primary : items[0]).focus();
        return;
      }
      const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at >= items.length - 1 ? 0 : at + 1;
      items[next].focus();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
    };
  }, []);

  /**
   * หาปุ่มของขั้นนี้: ทุก 100 ms ถึง 1.5 วิ (6 วิหลังเปิดเมนู/หน้าใหม่) · เจอแล้ววัดซ้ำทุก 400 ms และตอนเลื่อน/ย่อขยายจอ
   * (แถบหัวของรายการบนมือถือหลบขึ้นลง ปุ่มขยับ) · หาไม่เจอ = ข้ามขั้น หรือกล่องกลางจอตามที่ขั้นระบุ
   * เจอแล้วหายทีหลัง (เมนูเลื่อนมาทับปุ่มสามขีด) ใช้ตำแหน่งล่าสุดต่อ ไม่สลับไปกลางจอกลางขั้น
   */
  const seq = run.seq;
  const waiting = run.waiting;
  useEffect(() => {
    if (waiting) return;
    if (!ids.length) {
      setFound({ seq, rect: null });
      return;
    }
    let stopped = false;
    let got = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + (live.current.slow ? 6000 : 1500);
    const apply = (r: Rect) =>
      setFound((f) =>
        f && f.seq === seq && f.rect && Math.abs(f.rect.x - r.x) < 1 && Math.abs(f.rect.y - r.y) < 1 && Math.abs(f.rect.w - r.w) < 1 && Math.abs(f.rect.h - r.h) < 1
          ? f
          : { seq, rect: r },
      );
    const tick = () => {
      if (stopped) return;
      const r = locate(ids);
      if (r) {
        got = true;
        apply(r);
      } else if (!got && Date.now() > deadline) {
        if (step.whenMissing === "center") setFound({ seq, rect: null });
        else skipMissing(seq);
        return;
      }
      t = setTimeout(tick, got ? 400 : 100);
    };
    tick();
    let frame = 0;
    const again = () => {
      if (!got || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = !stopped && locate(ids);
        if (r) apply(r);
      });
    };
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);
    return () => {
      stopped = true;
      if (t) clearTimeout(t);
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", again);
      window.removeEventListener("scroll", again, true);
    };
  }, [seq, waiting, ids, step]);

  const cur = !waiting && found && found.seq === seq ? found : null;
  const shownKey = cur ? `${seq}:${cur.rect ? "t" : "c"}` : "";

  // จางเข้าทีละขั้น + โฟกัสที่กล่อง (โปรแกรมอ่านจออ่านชื่อขั้นให้)
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!shownKey || paused) return;
    op.setValue(0);
    const anim = Animated.timing(op, { toValue: 1, duration: reduceMotion() ? 0 : 150, useNativeDriver: false });
    const id = requestAnimationFrame(() => anim.start());
    const f = setTimeout(() => (boxRef.current as unknown as HTMLElement | null)?.focus?.(), 0);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(f);
      anim.stop();
    };
  }, [shownKey, paused, op]);

  const hooks = {
    dataSet: {
      howtoTour: run.tour.id,
      howtoStep: String(run.i + 1),
      howtoTotal: String(run.steps.length),
      howtoTarget: cur ? (cur.rect ? "found" : "center") : "seek",
      howtoSkipped: run.skipped.map((k) => k + 1).join(","),
    },
  } as object;

  if (paused) {
    return (
      <Overlay z={LAYER_Z} attr={LAYER_ATTR}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none" {...hooks} />
      </Overlay>
    );
  }

  const phone = vw < 640;
  const bw = phone ? vw - 2 * MARGIN : 420;
  const hole = cur?.rect
    ? (() => {
        const x = clamp(cur.rect.x - PAD, 0, vw);
        const y = clamp(cur.rect.y - PAD, 0, vh);
        return { x, y, w: clamp(cur.rect.x + cur.rect.w + PAD, 0, vw) - x, h: clamp(cur.rect.y + cur.rect.h + PAD, 0, vh) - y };
      })()
    : null;
  const tryStep = step.try?.action === "openMenu" ? step.try : null;
  const tryDone = !!tryStep && sideMenuOpen();
  const pos = cur ? place(hole, { vw, vh, bw, bh: boxH || 260, phone, sheet: step.place === "sheet" }) : null;

  return (
    <Overlay z={LAYER_Z} attr={LAYER_ATTR}>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none" {...hooks}>
        {/* แผ่นใสทับทั้งจอ รวมรูที่เจาะ — กด/ลากบนพื้นมืดไม่ถึงหน้าข้างหลัง (ลากแล้วไม่รีเฟรช ไม่เลื่อนหน้า) */}
        <View
          style={[StyleSheet.absoluteFill, styles.blocker]}
          pointerEvents="auto"
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
        />
        {hole ? (
          <>
            <View pointerEvents="none" style={[styles.dim, { left: 0, top: 0, width: vw, height: hole.y }]} />
            <View pointerEvents="none" style={[styles.dim, { left: 0, top: hole.y + hole.h, width: vw, height: Math.max(0, vh - hole.y - hole.h) }]} />
            <View pointerEvents="none" style={[styles.dim, { left: 0, top: hole.y, width: hole.x, height: hole.h }]} />
            <View pointerEvents="none" style={[styles.dim, { left: hole.x + hole.w, top: hole.y, width: Math.max(0, vw - hole.x - hole.w), height: hole.h }]} />
            <View
              pointerEvents="none"
              style={[styles.ring, { left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderColor: tryStep ? colors.warning : colors.primary }]}
            />
          </>
        ) : (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dimAll]} />
        )}
        {tryStep && hole ? (
          <>
            {/* ปุ่มแทนขนาดเท่ารู — ทำสิ่งเดียวกับปุ่มสามขีด (เปิดเมนู) โดยหน้าจริงยังนิ่งทั้งหน้า */}
            <TouchableOpacity
              style={[styles.proxy, { left: hole.x, top: hole.y, width: hole.w, height: hole.h }]}
              onPress={() => sideMenu.open()}
              accessibilityLabel={tryStep.label}
            />
            {tryDone ? null : (
              <View
                pointerEvents="none"
                style={[styles.tryPill, { left: Math.min(hole.x + hole.w + 8, vw - 120), top: hole.y + hole.h / 2 - 16 }]}
              >
                <Text style={styles.tryPillText}>ลองกดตรงนี้</Text>
              </View>
            )}
          </>
        ) : null}
        {cur && pos ? (
          <Animated.View
            style={[
              styles.boxWrap,
              pos.mode === "sheet"
                ? { left: 0, right: 0, bottom: 0 }
                : { left: pos.left, top: pos.top, width: bw },
              { opacity: op },
            ]}
            onLayout={(e) => setBoxH(Math.round(e.nativeEvent.layout.height))}
          >
            {hole && pos.mode !== "sheet" && pos.mode !== "center" ? <Nub mode={pos.mode} hole={hole} left={pos.left} top={pos.top} bw={bw} bh={boxH} /> : null}
            <StepBox
              run={run}
              boxRef={boxRef}
              sheet={pos.mode === "sheet"}
              sample={!hole && step.sample === "jobCard"}
              tryDone={tryDone}
              maxHeight={vh - (pos.mode === "sheet" ? MARGIN : 2 * MARGIN)}
              bottomPad={pos.mode === "sheet" ? insets.bottom : 0}
            />
          </Animated.View>
        ) : null}
      </View>
    </Overlay>
  );
}

/** หัวลูกศรเล็กชี้ไปที่ปุ่ม (ไม่มีตอนเป็นแผ่นขอบล่าง/กลางจอ) */
function Nub({ mode, hole, left, top, bw, bh }: { mode: Mode; hole: Rect; left: number; top: number; bw: number; bh: number }) {
  const S = 14;
  const style =
    mode === "below"
      ? { top: -S / 2, left: clamp(hole.x + hole.w / 2 - left - S / 2, 18, bw - 32) }
      : mode === "above"
        ? { top: (bh || 0) - S / 2, left: clamp(hole.x + hole.w / 2 - left - S / 2, 18, bw - 32) }
        : mode === "right"
          ? { left: -S / 2, top: clamp(hole.y + hole.h / 2 - top - S / 2, 18, Math.max(18, (bh || 60) - 32)) }
          : { left: bw - S / 2, top: clamp(hole.y + hole.h / 2 - top - S / 2, 18, Math.max(18, (bh || 60) - 32)) };
  return <View pointerEvents="none" style={[styles.nub, { width: S, height: S }, style]} />;
}

/** ตัวกล่องข้อความ — ใช้ทั้งเว็บและแอปติดตั้ง */
function StepBox({
  run,
  boxRef,
  sheet,
  sample,
  tryDone,
  maxHeight,
  bottomPad = 0,
}: {
  run: HowToRun;
  boxRef?: React.RefObject<View | null>;
  sheet?: boolean;
  sample: boolean;
  tryDone: boolean;
  maxHeight?: number;
  bottomPad?: number;
}) {
  const step = run.steps[run.i];
  const n = run.steps.length;
  const last = run.i === n - 1;
  const hasPrev = prevShown(run) != null;
  const ctx = howtoCtx(run);
  const body = bodyText(step.body, ctx);
  const note = step.note ? step.note.text.replace("{code}", run.code ?? "") : null;
  const blocked = !!step.try && !tryDone;
  return (
    <View
      ref={boxRef}
      style={[styles.box, sheet && styles.sheet, maxHeight ? { maxHeight } : null, bottomPad ? { paddingBottom: spacing.lg + bottomPad } : null]}
      role="dialog"
      aria-modal
      accessibilityLabel={`สอนการใช้งาน ขั้น ${run.i + 1} จาก ${n}: ${step.title}`}
      tabIndex={-1}
    >
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.boxScroll}>
        {sample ? <HowToSample /> : null}
        <View style={styles.headRow}>
          <View style={styles.iconCircle}>
            <Ionicons name={step.icon} size={22} color={colors.primaryInk} />
          </View>
          <Text style={[styles.title, headingFont]}>{step.title}</Text>
        </View>
        <Text style={styles.body}>{body}</Text>
        {note ? (
          <View style={[styles.note, step.note?.tone === "warn" ? styles.noteWarn : styles.noteInfo]}>
            <Ionicons
              name={step.note?.tone === "warn" ? "alert-circle-outline" : "information-circle-outline"}
              size={18}
              color={step.note?.tone === "warn" ? colors.warningInk : colors.primaryInk}
            />
            <Text style={[styles.noteText, { color: step.note?.tone === "warn" ? colors.warningInk : colors.primaryInk }]}>{note}</Text>
          </View>
        ) : null}
        {step.try ? (
          <Text style={[styles.tryLine, tryDone && { color: colors.successInk }]}>
            {tryDone ? 'เปิดเมนูแล้ว — กด "ถัดไป" ดูต่อ' : "ลองกดปุ่มสามขีดที่มีกรอบสีส้ม — เปิดเมนูแล้วจึงไปต่อได้"}
          </Text>
        ) : null}
      </ScrollView>
      <View style={styles.progress}>
        <View style={styles.dots}>
          {run.steps.map((_, k) => (
            <View key={k} style={[styles.dot, k === run.i && styles.dotOn]} />
          ))}
        </View>
        <Text style={styles.counter}>
          {run.i + 1}/{n}
        </Text>
      </View>
      <View style={styles.btnRow}>
        {last ? null : (
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => stopHowTo("skip")} accessibilityLabel="ข้าม">
            <Text style={[styles.btnText, styles.btnGhostText]}>ข้าม</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        {hasPrev ? (
          <TouchableOpacity style={[styles.btn, styles.btnLight]} onPress={prevStep} accessibilityLabel="ย้อนกลับ">
            <Text style={[styles.btnText, styles.btnLightText]}>ย้อนกลับ</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, blocked && styles.btnOff]}
          onPress={nextStep}
          disabled={blocked}
          aria-disabled={blocked}
          accessibilityLabel={last ? "เข้าใจแล้ว" : "ถัดไป"}
          {...({ dataSet: { howtoPrimary: "1" } } as object)}
        >
          <Text style={[styles.btnText, styles.btnPrimaryText]}>{last ? "เข้าใจแล้ว" : "ถัดไป"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** แอปติดตั้ง: กล่องกลางจอใน Modal ไม่ชี้ปุ่ม (ไม่มีขั้นลองกด/เปิดใบงานให้ — ตัดไว้ตั้งแต่ stepsFor) */
function NativeLayer({ run }: { run: HowToRun }) {
  useEffect(() => modalOpened(), []);
  const step = run.steps[run.i];
  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => stopHowTo("skip")}>
      <View style={[StyleSheet.absoluteFill, styles.dimAll, styles.nativeWrap]}>
        <StepBox run={run} sample={step.sample === "jobCard"} tryDone={false} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  blocker: { backgroundColor: "transparent", ...(Platform.OS === "web" ? ({ touchAction: "none", cursor: "default" } as object) : null) },
  dim: { position: "absolute", backgroundColor: DIM },
  dimAll: { backgroundColor: DIM },
  ring: { position: "absolute", borderWidth: 3, borderRadius: 14 },
  proxy: { position: "absolute", borderRadius: 14, backgroundColor: "transparent" },
  tryPill: {
    position: "absolute",
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
  },
  tryPillText: { color: "#fff", fontSize: 15, lineHeight: 22, fontWeight: "800" },
  boxWrap: { position: "absolute" },
  nub: { position: "absolute", backgroundColor: colors.card, transform: [{ rotate: "45deg" }] },
  box: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.raised,
  },
  sheet: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  boxScroll: { gap: spacing.md },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  title: { flex: 1, fontSize: 18, lineHeight: 26, fontWeight: "800", color: colors.text },
  body: { fontSize: 15, lineHeight: 24, color: colors.body },
  note: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  noteWarn: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  noteInfo: { backgroundColor: colors.primarySoft, borderColor: colors.primaryLine },
  noteText: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: "700" },
  tryLine: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.warningInk },
  progress: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dots: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderStrong },
  dotOn: { width: 22, backgroundColor: colors.primary },
  counter: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.textMuted, fontVariant: ["tabular-nums"] },
  btnRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  btn: { minHeight: 48, paddingHorizontal: 16, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: 16, lineHeight: 24, fontWeight: "800" },
  btnGhost: { paddingHorizontal: 10 },
  btnGhostText: { color: colors.textMuted },
  btnLight: { backgroundColor: colors.sky50, borderWidth: 1, borderColor: colors.border },
  btnLightText: { color: colors.primaryInk },
  btnPrimary: { backgroundColor: colors.navyFill },
  btnPrimaryText: { color: "#fff" },
  btnOff: { opacity: 0.45 },
  nativeWrap: { justifyContent: "center", padding: spacing.lg },
});
