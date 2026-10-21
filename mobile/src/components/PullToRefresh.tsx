/**
 * ลากลงเพื่อรีเฟรช บนเว็บ (เจ้าของงานขอ ต.ค. 69 — "แบบเฟสบุค")
 *
 * ทำไมไม่ใช้ RefreshControl: บน react-native-web มันไม่ทำอะไรเลย ส่วนท่าลากลงของเบราว์เซอร์มือถือเอง
 * (Chrome/Safari) โหลดทั้งเว็บใหม่ แล้วพาเด้งกลับหน้าแรก — ที่นี่ปิดท่านั้น (overscroll-behavior-y)
 * แล้วทำเอง: ลากจากบนสุดของรายการ → runRefresh() ตัวเดียวกับปุ่มรีเฟรช → โหลดเฉพาะข้อมูลหน้านั้น
 *
 * ฟังที่ document ตัวเดียวทั้งแอป ไม่ต้องไปใส่ทีละหน้า — ทุกหน้าที่ลงทะเบียน useRefreshHandler ลากได้เอง
 * ไม่ทำงานเมื่อ: หน้าไม่มีข้อมูลให้โหลด (ฟอร์ม) · มีหน้าต่างหรือเมนูข้างเปิดอยู่ · กล่องที่นิ้วอยู่ยังเลื่อนขึ้นได้อีก · ปัดแนวนอน
 *
 * ทำไมขยับ DOM ตรง ๆ ไม่ผ่าน React state: รอบแรกใช้ setState ทุกครั้งที่นิ้วขยับ เจ้าของงานใช้จริงแล้วบอกว่า
 * "ไม่ลื่นเหมือนเฟสบุค" — ทุกเฟรมต้องรอ React วาดใหม่ และเนื้อหาไม่ขยับตามนิ้ว รอบนี้:
 * เนื้อหาเลื่อนลงตามนิ้ว (หนืดขึ้นเรื่อย ๆ) · วงหมุนอยู่ในช่องว่างที่เปิดเหนือเนื้อหา เส้นวงยาวขึ้นตามระยะ ·
 * ปล่อยแล้วไหลเข้าที่/ไหลกลับด้วย transition ไม่ดีดหาย · ขยับไม่เกินเฟรมละครั้ง (requestAnimationFrame)
 */
import { useEffect } from "react";
import { Platform } from "react-native";
import { hasRefreshHandler, runRefresh } from "./RefreshButton";
import { anyModalOpen } from "../utils/liveSync";
import { rubber } from "../utils/motion";
import { colors } from "../theme";

/** ลากเกินระยะนี้ (หลังหนืดแล้ว) ปล่อยแล้วรีเฟรช */
const THRESHOLD = 64;
/** ระหว่างโหลด เนื้อหาค้างลงมาเท่านี้ให้วงหมุนอยู่ */
const HOLD = 56;
const MAX = 130;
const EASE = "cubic-bezier(0.2, 0.9, 0.3, 1)";
const BALL = 36;

/**
 * กล่องที่นิ้วอยู่: scroller = กล่องที่ยังเลื่อนได้ (ไว้เช็คว่าอยู่บนสุดหรือยัง)
 * move = กล่องเลื่อนแนวตั้งที่ใกล้ที่สุดแม้เนื้อหาจะสั้น (ตัวที่จะเลื่อนลงตามนิ้ว)
 */
function boxesOf(target: EventTarget | null) {
  let el = target instanceof HTMLElement ? target : null;
  let scroller: HTMLElement | null = null;
  let move: HTMLElement | null = null;
  while (el && el !== document.body) {
    const oy = getComputedStyle(el).overflowY;
    if (oy === "auto" || oy === "scroll") {
      move = move ?? el;
      if (el.scrollHeight > el.clientHeight + 1) {
        scroller = el;
        break;
      }
    }
    el = el.parentElement;
  }
  return { scroller, move: scroller ?? move };
}

/**
 * ขอบบนที่ "มองเห็นได้" ของกล่องที่เลื่อน — บางหน้า (รายการใบงานบนมือถือ) แถบบนลอยทับกล่อง
 * ถ้าใช้ขอบบนของกล่องตรง ๆ วงหมุนจะไปทับแถบโลโก้ ไม่อยู่ในช่องว่างที่เปิดเหนือเนื้อหา
 */
function visibleTopOf(box: HTMLElement) {
  const r = box.getBoundingClientRect();
  const x = r.left + r.width / 2;
  for (let y = Math.max(0, r.top) + 1; y < r.top + Math.min(r.height, 260); y += 4) {
    const hit = document.elementFromPoint(x, y);
    if (hit && box.contains(hit)) return y - 1;
  }
  return Math.max(0, r.top);
}

/** วงกลมขาว + เส้นวงที่ยาวขึ้นตามระยะลาก (แบบแอปมือถือ) — SVG ล้วน ไม่ต้องรอ React */
function buildIndicator() {
  const ball = document.createElement("div");
  ball.setAttribute("aria-label", "ลากรีเฟรช");
  Object.assign(ball.style, {
    position: "fixed",
    left: "50%",
    top: "0px",
    width: `${BALL}px`,
    height: `${BALL}px`,
    marginLeft: `${-BALL / 2}px`,
    borderRadius: "50%",
    background: "#fff",
    boxShadow: "0 3px 10px rgba(11,59,96,0.22)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "9999",
    pointerEvents: "none",
    opacity: "0",
    willChange: "transform, opacity",
  } as CSSStyleDeclaration);
  const R = 10;
  const C = 2 * Math.PI * R;
  ball.innerHTML =
    `<svg width="24" height="24" viewBox="0 0 24 24" style="transition:transform 0.15s linear">` +
    `<circle cx="12" cy="12" r="${R}" fill="none" stroke="${colors.primary}" stroke-width="2.6" stroke-linecap="round"` +
    ` stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 12 12)"/>` +
    `<path d="M12 7v7m-3-3 3 3 3-3" fill="none" stroke="${colors.primary}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`;
  const svg = ball.firstElementChild as SVGSVGElement;
  const arc = svg.querySelector("circle") as SVGCircleElement;
  const arrow = svg.querySelector("path") as SVGPathElement;

  const pill = document.createElement("div");
  Object.assign(pill.style, {
    position: "fixed",
    left: "50%",
    top: "0px",
    transform: "translate(-50%, 0)",
    background: "#fff",
    color: colors.successInk,
    fontSize: "13px",
    fontWeight: "700",
    padding: "6px 14px",
    borderRadius: "999px",
    boxShadow: "0 3px 10px rgba(11,59,96,0.18)",
    zIndex: "9999",
    pointerEvents: "none",
    opacity: "0",
    transition: `opacity 0.25s ease, transform 0.35s ${EASE}`,
    whiteSpace: "nowrap",
    fontFamily: '"Noto Sans Thai","Inter",system-ui,sans-serif',
  } as CSSStyleDeclaration);

  const style = document.createElement("style");
  style.textContent = "@keyframes ptr-spin{to{transform:rotate(360deg)}}";
  document.head.appendChild(style);
  document.body.appendChild(ball);
  document.body.appendChild(pill);
  return { ball, svg, arc, arrow, pill, C, remove: () => [ball, pill, style].forEach((n) => n.remove()) };
}

export default function PullToRefresh() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const root = document.documentElement.style;
    const body = document.body.style;
    root.overscrollBehaviorY = "contain";
    body.overscrollBehaviorY = "contain";
    const ui = buildIndicator();

    let start: { x: number; y: number; scroller: HTMLElement | null; move: HTMLElement | null; top: number } | null = null;
    let pulling = false;
    let busy = false;
    let dist = 0;
    let frame = 0;
    let armed = false;

    /** วางทุกอย่างตามระยะ d — animate = ไหลไปด้วย transition (ตอนปล่อยนิ้ว) */
    const place = (d: number, animate: boolean) => {
      const s = start;
      const move = s?.move ?? null;
      const top = s?.top ?? 0;
      const t = animate ? `transform 0.32s ${EASE}, opacity 0.2s ease` : "none";
      if (move) {
        move.style.transition = animate ? `transform 0.32s ${EASE}` : "none";
        move.style.transform = d > 0 ? `translate3d(0, ${d}px, 0)` : "";
      }
      // วงอยู่กลางช่องว่างที่เปิดเหนือเนื้อหา — ยังลากไม่ถึงก็ค่อย ๆ โผล่จากขอบบนของกล่อง
      const y = top + Math.max(d / 2 - BALL / 2, -BALL);
      const p = Math.min(1, d / THRESHOLD);
      ui.ball.style.transition = t;
      ui.ball.style.transform = `translate3d(0, ${y}px, 0) scale(${0.6 + 0.4 * p})`;
      ui.ball.style.opacity = d > 4 ? String(Math.min(1, d / 30)) : "0";
      if (!busy) {
        ui.arc.style.strokeDashoffset = String(ui.C * (1 - p * 0.85));
        ui.svg.style.transform = `rotate(${p * 270}deg)`;
        ui.arrow.style.opacity = String(p < 1 ? 1 : 0);
      }
    };
    const restore = () => {
      const move = start?.move;
      if (move) {
        move.style.transition = "";
        move.style.transform = "";
      }
    };

    const onStart = (e: TouchEvent) => {
      if (busy || e.touches.length !== 1 || !hasRefreshHandler() || anyModalOpen()) return;
      // เมนูข้างเปิดอยู่ / นิ้วอยู่ในเมนู — กล่องเลื่อนที่ใกล้นิ้วคือตัวเมนูเอง ลากแล้วเมนูทั้งแผงเลื่อนลง
      // และรีเฟรชหน้าที่อยู่ข้างหลัง (เจ้าของงานเจอบนมือถือ ต.ค. 69) — เมนูเปิดก็นับเหมือนหน้าต่างเปิด
      if (document.getElementById("side-menu-backdrop")) return;
      if (e.target instanceof Element && e.target.closest("#side-menu")) return;
      const { scroller, move } = boxesOf(e.target);
      if (scroller && scroller.scrollTop > 0) return;
      start = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        scroller,
        move,
        top: move ? visibleTopOf(move) : 0,
      };
      pulling = false;
      armed = false;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!start || busy) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (!pulling) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        // ปัดแนวนอน (เลื่อนชิป ปัดฟอร์ม) หรือเลื่อนขึ้น — ไม่ใช่ท่ารีเฟรช ปล่อยให้เลื่อนตามปกติ
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || (start.scroller && start.scroller.scrollTop > 0)) {
          start = null;
          return;
        }
        pulling = true;
      }
      if (e.cancelable) e.preventDefault();
      dist = Math.min(MAX, rubber(Math.max(0, dy), 320));
      // สั่นเบา ๆ ตอนลากถึงระยะ (Android) — บอกว่าปล่อยได้แล้วโดยไม่ต้องอ่าน
      if (!armed && dist >= THRESHOLD) {
        armed = true;
        navigator.vibrate?.(8);
      } else if (armed && dist < THRESHOLD) armed = false;
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (pulling) place(dist, false);
        });
      }
    };
    const onEnd = () => {
      if (!start || busy) return;
      if (frame) cancelAnimationFrame(frame), (frame = 0);
      const go = pulling && dist >= THRESHOLD;
      pulling = false;
      if (!go) {
        place(0, true);
        const s = start;
        setTimeout(() => {
          if (start === s) {
            restore();
            start = null;
          }
        }, 340);
        return;
      }
      busy = true;
      place(HOLD, true);
      ui.svg.style.transform = "";
      ui.svg.style.animation = "ptr-spin 0.7s linear infinite";
      ui.arc.style.strokeDashoffset = String(ui.C * 0.25);
      ui.arrow.style.opacity = "0";
      const s = start;
      void runRefresh().then((text) => {
        ui.svg.style.animation = "";
        place(0, true);
        // ผลบอกเป็นคำ แล้วจางไปเอง — "อัปเดตแล้ว · ใหม่ 2 ใบงาน" / "ข้อมูลล่าสุดแล้ว"
        ui.pill.textContent = text ?? "อัปเดตแล้ว";
        ui.pill.style.transform = `translate(-50%, ${(s?.top ?? 0) + 10}px)`;
        ui.pill.style.opacity = "1";
        setTimeout(() => (ui.pill.style.opacity = "0"), 1500);
        setTimeout(() => {
          restore();
          start = null;
          busy = false;
        }, 360);
      });
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      if (frame) cancelAnimationFrame(frame);
      restore();
      ui.remove();
      root.overscrollBehaviorY = "";
      body.overscrollBehaviorY = "";
    };
  }, []);

  return null;
}
