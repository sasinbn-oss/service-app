/**
 * ตัวเครื่องของ "สอนการใช้งาน" (กล่องที่ชี้ปุ่มจริงทีละปุ่ม · ข้าม / ย้อนกลับ / ถัดไป — เจ้าของงานเลือก ต.ค. 69)
 *
 * เก็บสถานะไว้นอก React แบบเดียวกับ Feedback.tsx — ปุ่ม ? อยู่บนแถบหัว (นอกหน้าจอ) แต่ตัววาดกล่องอยู่ท้าย MainNavigator
 * และคำสั่งจากหน้าจอ (useHowToAction) ต้องเรียกถึงกันได้โดยไม่ต้องส่ง prop ผ่านทุกชั้น
 * ตัววาด (components/HowToHost.tsx) อ่านสถานะจากที่นี่อย่างเดียว · ที่นี่ไม่รู้เรื่องตำแหน่งบนจอเลย
 *
 * กติกาที่ต้องถูก (แผนงานข้อ 5.4): เปิดเมนูให้เองแล้วต้องปิดคืน · ย้อนกลับก่อนขั้นที่เปิดใบงานให้ = ปิดใบงานนั้น
 * · จบ/ข้ามแล้วใบงานที่เปิดให้ค้างไว้ (ข้อความแนะนำรอจนปิดใบ) · ดูในฐานะไม่บันทึกอะไรเลย · ระหว่างเล่นถือ modalOpened()
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, Platform } from "react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { api } from "../api/client";
import { feedback } from "../components/Feedback";
import { DOCK_MIN_WIDTH, peekGroup, sideMenu, sideMenuOpen, subscribeSideMenu } from "../components/SideMenu";
import { navigationRef } from "../navigation/navigationRef";
import type { User } from "../types";
import type { Cutoff } from "./dispatchCutoff";
import type { HowToCtx, HowToRole, HowToState, HowToStep, HowToTour } from "./howtoTypes";
import { rolesOf, stepsFor, tourById } from "./howtoTours";

export { howtoTarget } from "./howtoTarget";

export interface HowToRun {
  tour: HowToTour;
  /** ขั้นที่คนนี้เห็นบนจอแบบนี้ (ตัดตามบทบาท/จอแล้ว — stepsFor) */
  steps: HowToStep[];
  i: number;
  /** ทิศที่กำลังไป — ขั้นที่หาปุ่มไม่เจอข้ามไปทางเดียวกับที่กด */
  dir: 1 | -1;
  /** ขั้นที่ข้ามเพราะหาปุ่มไม่เจอ (ตัวเลขตามลำดับใน steps) */
  skipped: number[];
  roles: HowToRole[];
  layout: "narrow" | "wide";
  /**
   * ใบงาน/หน้าที่วิธีใช้เปิดให้ดู — key ของหน้า · step = ขั้นที่สั่งเปิด (-1 = เปิดตอนเริ่มจากหน้าสอนการใช้งาน ย้อนกลับไม่ปิด)
   * ย้อนกลับไปก่อนขั้นนั้นแล้วปิดคืน · จบ/ข้ามแล้วค้างไว้ให้ดูต่อ (ตัวอย่างที่ตกลงไว้)
   */
  opened: { key: string; step: number } | null;
  /** รหัสใบงานที่เปิดให้ — แทน {code} ในกล่องเล็ก */
  code: string | null;
  /** วิธีใช้เป็นคนเปิดเมนูข้าง (หรือผู้เรียนเปิดเองในขั้นลองกด) — ออกจากขั้นเมนูแล้วต้องปิดคืน */
  menuByHowto: boolean;
  /** เลขรอบ — เปลี่ยนทุกครั้งที่ขยับขั้น ตัววาดใช้รู้ว่าต้องหาปุ่มใหม่ · คำสั่งที่รออยู่ใช้รู้ว่าถูกแซงแล้ว */
  seq: number;
  /** กำลังรอหน้าจอเปิดใบงาน/ฟอร์มให้ — ยังไม่วาดกล่อง */
  waiting: boolean;
  /** เพิ่งเปิดเมนู/หน้าใหม่ — ให้เวลาหาปุ่ม 6 วินาทีแทน 1.5 (แถวเมนูโผล่ช้าตามจังหวะกางกลุ่ม) */
  slow: boolean;
  /** ดูในฐานะ — เล่นได้ แต่ไม่บันทึกว่าดูแล้ว */
  readOnly: boolean;
}

interface Store {
  run: HowToRun | null;
}

let store: Store = { run: null };
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function setRun(run: HowToRun | null) {
  store = { ...store, run };
  emit();
}
function patchRun(p: Partial<HowToRun>) {
  if (store.run) setRun({ ...store.run, ...p });
}

/** ตัววาดกล่องใช้ — วาดใหม่ทุกครั้งที่สถานะเปลี่ยน */
export function useHowToStore(): Store {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return store;
}

export function howtoRunning() {
  return !!store.run;
}

/** เลขรอบของขั้นปัจจุบัน (0 = ไม่ได้เล่น) — คำสั่งที่รออยู่เทียบแล้วรู้ว่าถูกแซง (กดถัดไป/ข้ามไปแล้ว) */
function liveSeq(): number {
  return store.run?.seq ?? 0;
}

// ── ผู้ใช้ที่ล็อกอินอยู่ (ตัววาดผูกให้ตอนขึ้นจอ) ──
type Session = { user: User | null; patchUser: (p: Partial<User>) => void };
let session: Session | null = null;
export function bindHowToSession(s: Session | null) {
  session = s;
}

/** จอแบบไหน — แคบ = เมนูข้างไม่ค้าง (เว็บ < 1100 px · แอปติดตั้งทุกขนาด) ตรงกับ useDocked ของเมนูข้าง */
export function howtoLayout(width = Dimensions.get("window").width): "narrow" | "wide" {
  return Platform.OS === "web" && width >= DOCK_MIN_WIDTH ? "wide" : "narrow";
}

/**
 * ปุ่ม ? อยู่ไหนสำหรับคนนี้บนจอนี้ — ใช้ในข้อความหลังดูจบ/ข้าม (และกล่องต้อนรับ/ข้อความแนะนำ)
 * แอดมินจอแคบ: แถบหัวเต็มแล้ว ปุ่มอยู่ในเมนูข้างข้างออกจากระบบ · จอคอม 1200 ขึ้นไปปุ่มมีชื่อ · ที่เหลือเป็น ?
 */
export function whereIsHelp(user: User | null | undefined, width = Dimensions.get("window").width): string {
  const wide = howtoLayout(width) === "wide";
  if (user?.role === "ADMIN" && !wide) return 'ปุ่ม "วิธีใช้หน้านี้" ในเมนู ข้างออกจากระบบ';
  if (wide && width >= 1200) return 'ปุ่ม "วิธีใช้หน้านี้" ข้างปุ่มรีเฟรช';
  return "ปุ่ม ? ข้างปุ่มรีเฟรช";
}

// ── คำสั่งที่หน้าจอลงทะเบียน (เปิดใบงานแรก · เปิดฟอร์มปิดงาน ฯลฯ) ──
export type HowToActionResult = { ok: true; code?: string | null } | false | null | undefined;
type HowToActionFn = () => HowToActionResult | Promise<HowToActionResult>;
const actions = new Map<string, HowToActionFn>();

/**
 * หน้าจอลงทะเบียนคำสั่งที่วิธีใช้เรียกได้ — เฉพาะตอนหน้านั้นเปิดอยู่ (ถอนตอนออกจากหน้า)
 * คำสั่งต้องแค่เปิดหน้า/ฟอร์มที่ไม่บันทึกอะไร (เจ้าของงานกำหนด: แอปไม่กดปุ่มที่บันทึกข้อมูลแทนใคร)
 * คืน { ok: true, code } เมื่อเปิดได้ · false เมื่อไม่มีอะไรให้เปิด (ขั้นที่ตามมาข้าม/ขึ้นกลางจอเอง)
 */
export function useHowToAction(name: string, fn: HowToActionFn) {
  const ref = useRef(fn);
  ref.current = fn;
  useFocusEffect(
    useCallback(() => {
      const run: HowToActionFn = () => ref.current();
      actions.set(name, run);
      return () => {
        if (actions.get(name) === run) actions.delete(name);
      };
    }, [name]),
  );
}

// ── ค่าที่ข้อความบางขั้นต้องรู้ตอนเล่น (เช่นเวลาปิดนัดที่แอดมินตั้ง) ──
type CtxData = { cutoff: Cutoff | null };
const ctxData: CtxData = { cutoff: null };

/**
 * หน้าจอที่รู้ค่าจากเซิร์ฟเวอร์อยู่แล้วส่งให้ข้อความของวิธีใช้ — ไม่ต้องให้วิธีใช้ไปถามเซิร์ฟเวอร์เองอีกรอบ
 * ส่งเฉพาะตอนหน้านั้นเปิดอยู่ · ออกจากหน้าแล้วค่ากลับเป็นว่าง (ข้อความต้องมีคำสำรองเมื่อยังไม่รู้)
 */
export function useHowToContext(values: Partial<CtxData>) {
  const focused = useIsFocused();
  const key = JSON.stringify(values);
  useEffect(() => {
    if (!focused) return;
    const v = JSON.parse(key) as Partial<CtxData>;
    Object.assign(ctxData, v);
    return () => {
      for (const k of Object.keys(v) as (keyof CtxData)[]) ctxData[k] = null;
    };
  }, [focused, key]);
}

export function howtoCtx(run: HowToRun): HowToCtx {
  return { roles: run.roles, code: run.code, cutoff: ctxData.cutoff };
}

// ── บันทึกว่าดู/ตอบแล้ว ──
/**
 * จดที่บัญชี (POST /auth/howto) — ดูในฐานะไม่จด (เซิร์ฟเวอร์ก็ปฏิเสธอยู่แล้ว ไม่ต้องมีข้อความแดงเด้ง)
 * แก้ค่าในเครื่องก่อนส่ง: ส่งไม่ผ่าน (เน็ตหลุด) ก็ไม่เห็นกล่องเดิมซ้ำในรอบนี้ · ไม่บังจอด้วยหน้าโหลด และไม่บอกผล
 */
export async function markHowto(kind: { welcome: true } | { notice: true } | { tour: string }) {
  const s = session;
  if (!s?.user || s.user.viewAs) return;
  const now = new Date().toISOString();
  const cur = s.user.howto;
  if (cur) {
    const next: HowToState =
      "tour" in kind
        ? { ...cur, legacy: false, pending: false, tours: { ...cur.tours, [kind.tour]: now }, noticeAt: cur.welcomeAt || cur.noticeAt ? cur.noticeAt : now }
        : "welcome" in kind
          ? { ...cur, legacy: false, pending: false, welcomeAt: now }
          : { ...cur, legacy: false, pending: false, noticeAt: now };
    s.patchUser({ howto: next });
  }
  const uid = s.user.id;
  try {
    const { data } = await api.post<{ howto: HowToState }>("/auth/howto", kind, { loadingText: false });
    // ตัววาดผูกผู้ใช้ใหม่ทุกครั้งที่ข้อมูลผู้ใช้เปลี่ยน (รวมการแก้ในเครื่องข้างบน) — เทียบคน ไม่เทียบตัวผูก
    // ระหว่างรอ สลับไปดูในฐานะ/ออกจากระบบแล้ว ห้ามเอาค่าของคนเดิมไปทับคนใหม่
    const latest = session;
    if (data?.howto && latest?.user?.id === uid && !latest.user.viewAs) latest.patchUser({ howto: data.howto });
  } catch {
    // ไม่บอกผู้ใช้ — การจดว่าดูแล้วพังไม่ใช่เรื่องที่เขาต้องทำอะไร (ครั้งหน้ากล่องก็แค่ขึ้นอีกรอบ)
  }
}

// ── เริ่ม / ขยับ / จบ ──
let menuOff: (() => void) | null = null;
let navOff: (() => void) | null = null;
/** ปุ่มที่กดเริ่ม (ปุ่ม ?) — จบแล้วคืนโฟกัสให้ คนใช้คีย์บอร์ดไม่หลุดไปต้นหน้า */
let returnFocus: Element | null = null;
export function takeReturnFocus(): HTMLElement | null {
  const el = returnFocus as HTMLElement | null;
  returnFocus = null;
  return el && el.isConnected ? el : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function currentKey(): string | null {
  return navigationRef.isReady() ? navigationRef.getCurrentRoute()?.key ?? null : null;
}

/** หน้านี้ยังอยู่ในกองหน้าไหม (ใบงานที่วิธีใช้เปิดให้ยังเปิดอยู่ไหม) */
function routeAlive(key: string): boolean {
  if (!navigationRef.isReady()) return false;
  const walk = (s: unknown): boolean => {
    const st = s as { routes?: { key: string; state?: unknown }[] } | undefined;
    return !!st?.routes?.some((r) => r.key === key || walk(r.state));
  };
  return walk(navigationRef.getRootState());
}

/** รอให้หน้าจอลงทะเบียนคำสั่ง (หน้าเพิ่งเปิด/ข้อมูลยังโหลด) ได้ถึง 6 วินาที แล้วรัน */
async function runAction(name: string, seq: number): Promise<HowToActionResult> {
  const until = Date.now() + 6000;
  while (!actions.has(name) && Date.now() < until) {
    await sleep(100);
    if (liveSeq() !== seq) return null;
  }
  const fn = actions.get(name);
  if (!fn) return null;
  // หน้าลงทะเบียนแล้วแต่ข้อมูลอาจยังไม่มา (รายการว่างชั่วคราว) — ลองซ้ำจนครบเวลา
  for (;;) {
    let r: HowToActionResult = null;
    try {
      r = await fn();
    } catch {
      r = null;
    }
    if (r || Date.now() >= until || liveSeq() !== seq) return r;
    await sleep(300);
  }
}

/** หลังสั่งเปิด รอให้หน้าใหม่ขึ้นมาบนสุด แล้วจำ key ไว้ (ไม่เปลี่ยน = เปิดในหน้าเดิม เช่นฟอร์ม — ไม่มีอะไรต้องปิดคืน) */
async function openedKeyAfter(prev: string | null): Promise<string | null> {
  const until = Date.now() + 1500;
  while (Date.now() < until) {
    const k = currentKey();
    if (k && k !== prev) return k;
    await sleep(50);
  }
  return null;
}

function menuish(st: HowToStep | undefined) {
  return !!st && (!!st.menu || !!st.try);
}

/** ปิดเมนูข้างที่วิธีใช้เปิดไว้ — เมนูที่ผู้ใช้เปิดค้างไว้เองก่อนเริ่มไม่แตะ */
function closeOurMenu() {
  const r = store.run;
  if (r?.menuByHowto) {
    sideMenu.close();
    patchRun({ menuByHowto: false });
  }
}

/** เตรียมขั้นปัจจุบัน: เมนู · กางกลุ่ม · เปิดใบงานให้ก่อน · ย้อนกลับไปก่อนขั้นที่เปิดใบงาน = ปิดคืน */
async function enterStep() {
  const r0 = store.run;
  if (!r0) return;
  const st = r0.steps[r0.i];
  const seq = r0.seq;
  peekGroup(st.peek ?? null);
  if (!menuish(st)) closeOurMenu();
  let slow = !!st.peek;
  if (st.menu && r0.layout === "narrow" && Platform.OS === "web" && !sideMenuOpen()) {
    sideMenu.open();
    patchRun({ menuByHowto: true });
    slow = true;
  }
  // ย้อนกลับมาก่อนขั้นที่เปิดใบงานให้ — ปิดใบนั้นคืน (ถ้ายังอยู่บนสุด ไม่ไปปิดหน้าอื่นแทน)
  const op = store.run?.opened;
  if (op && op.step >= 0 && r0.i < op.step) {
    if (currentKey() === op.key && navigationRef.canGoBack()) navigationRef.goBack();
    patchRun({ opened: null, code: null });
    slow = true;
  }
  if (st.before && r0.dir === 1 && !(store.run?.opened && store.run.opened.step === r0.i)) {
    patchRun({ waiting: true, slow: true });
    const prev = currentKey();
    const res = await runAction(st.before, seq);
    if (liveSeq() !== seq) return;
    if (res && res.ok) {
      const key = await openedKeyAfter(prev);
      if (liveSeq() !== seq) return;
      patchRun({ waiting: false, code: res.code ?? null, opened: key ? { key, step: r0.i } : null });
    } else {
      patchRun({ waiting: false });
    }
    return;
  }
  patchRun({ slow });
}

function move(to: number, dir: 1 | -1) {
  const r = store.run;
  if (!r) return;
  setRun({ ...r, i: to, dir, seq: r.seq + 1, waiting: false, slow: false });
  void enterStep();
}

/**
 * เริ่มวิธีใช้ — จากปุ่ม ? (หน้าที่เปิดอยู่) หรือหน้า "สอนการใช้งาน" (fromHub: ไปหน้าของเรื่องนั้นและเปิดของให้ก่อน)
 * กำลังเล่นอยู่แล้วไม่เริ่มซ้อน
 */
export async function startHowTo(id: string, opts: { fromHub?: boolean } = {}) {
  if (store.run) return;
  const tour = tourById(id);
  const user = session?.user ?? null;
  if (!tour || !user) return;
  const roles = rolesOf(user);
  const layout = howtoLayout();
  const steps = stepsFor(tour, roles, layout);
  if (!steps.length) return;
  returnFocus = typeof document !== "undefined" ? document.activeElement : null;
  const run: HowToRun = {
    tour,
    steps,
    i: 0,
    dir: 1,
    skipped: [],
    roles,
    layout,
    opened: null,
    code: null,
    menuByHowto: false,
    seq: 1,
    waiting: false,
    slow: false,
    readOnly: !!user.viewAs,
  };
  setRun(run);
  // ผู้เรียนเปิดเมนูเองในขั้นลองกด (หรือวิธีใช้เปิดให้ในขั้นเมนู) — จำไว้ว่าต้องปิดคืนตอนออกจากขั้นเมนู/จบ
  menuOff = subscribeSideMenu((open) => {
    const r = store.run;
    if (!r) return;
    if (open && menuish(r.steps[r.i])) patchRun({ menuByHowto: true });
    else emit();
  });
  if (opts.fromHub && tour.start && navigationRef.isReady()) {
    patchRun({ waiting: true, slow: true });
    const prev = currentKey();
    const nested = tour.start.route === "MyJobs" ? { screen: "MyJobs" } : { screen: tour.start.route, initial: false };
    (navigationRef.navigate as (tab: string, p: object) => void)("HomeTab", nested);
    let code: string | null = null;
    let opened: HowToRun["opened"] = null;
    const list = tour.start.action ? ([] as string[]).concat(tour.start.action) : [];
    for (const name of list) {
      const before = currentKey();
      const res = await runAction(name, 1);
      if (liveSeq() !== 1) return;
      if (!res || !res.ok) break;
      code = res.code ?? code;
      const key = await openedKeyAfter(before);
      if (key && key !== prev) opened = { key, step: -1 };
    }
    if (liveSeq() !== 1) return;
    patchRun({ waiting: false, code, opened });
  }
  void enterStep();
}

export function nextStep() {
  const r = store.run;
  if (!r || r.waiting) return;
  if (r.i >= r.steps.length - 1) return stopHowTo("done");
  move(r.i + 1, 1);
}

export function prevStep() {
  const r = store.run;
  if (!r || r.waiting) return;
  const to = prevShown(r);
  if (to != null) move(to, -1);
}

/** ขั้นก่อนหน้าที่ขึ้นจอจริง (ไม่นับขั้นที่ข้ามเพราะหาปุ่มไม่เจอ) — ไม่มี = ซ่อนปุ่มย้อนกลับ */
export function prevShown(r: HowToRun): number | null {
  for (let k = r.i - 1; k >= 0; k--) if (!r.skipped.includes(k)) return k;
  return null;
}

/** ตัววาดหาปุ่มของขั้นนี้ไม่เจอ (whenMissing: skip) — ข้ามไปทางเดียวกับที่กำลังไป · ถอยจนสุดแล้วกลับเดินหน้า */
export function skipMissing(seq: number) {
  const r = store.run;
  if (!r || r.seq !== seq) return;
  const skipped = r.skipped.includes(r.i) ? r.skipped : [...r.skipped, r.i];
  let dir = r.dir;
  let to = r.i + dir;
  while (to >= 0 && to < r.steps.length && skipped.includes(to)) to += dir;
  if (to < 0) {
    dir = 1;
    to = r.i + 1;
    while (to < r.steps.length && skipped.includes(to)) to += 1;
  }
  if (to >= r.steps.length) {
    // ขั้นท้าย ๆ หาไม่เจอทั้งหมด — ถือว่าดูครบเท่าที่หน้านี้มีให้ดู
    store = { ...store, run: { ...r, skipped } };
    return stopHowTo("done");
  }
  setRun({ ...r, skipped, i: to, dir, seq: r.seq + 1, waiting: false, slow: false });
  void enterStep();
}

/**
 * จบวิธีใช้ — done = กด "เข้าใจแล้ว" (จดว่าดูแล้ว) · skip = ข้าม/Esc (ไม่จด) · gone = ออกจากระบบ/สลับดูในฐานะ (ไม่บอกอะไร)
 * ข้อความแนะนำรอจนปิดใบงานที่วิธีใช้เปิดให้ — ไม่งั้นแถบข้อความบังปุ่มที่ขั้นสุดท้ายเพิ่งชี้
 */
export function stopHowTo(how: "done" | "skip" | "gone") {
  const r = store.run;
  if (!r) return;
  peekGroup(null);
  if (r.menuByHowto) sideMenu.close();
  menuOff?.();
  menuOff = null;
  setRun(null);
  if (how === "gone") {
    returnFocus = null;
    return;
  }
  if (how === "done" && !r.readOnly) void markHowto({ tour: r.tour.id });
  const where = r.tour.inForm ? "ปุ่ม ? มุมบนของฟอร์ม" : whereIsHelp(session?.user);
  const text = how === "done" ? `ดูวิธีใช้อีกครั้ง กด${where}` : `ข้ามแล้ว · ดูวิธีใช้อีกครั้ง กด${where}`;
  const key = r.opened?.key;
  if (key && routeAlive(key)) holdToast(text, key);
  else feedback.toast("info", text);
}

/** แถบข้อความหลังจบ รอจนใบงานที่เปิดให้ถูกปิด (ออกจากกองหน้า) แล้วค่อยขึ้น */
function holdToast(text: string, key: string) {
  navOff?.();
  navOff = navigationRef.addListener("state", () => {
    if (routeAlive(key)) return;
    navOff?.();
    navOff = null;
    feedback.toast("info", text);
  });
}

/** ตัววาดหลุดจากจอ (ออกจากระบบ · สลับดูในฐานะ — MainNavigator ขึ้นใหม่) — ล้างทุกอย่างที่ค้าง ข้อความที่รออยู่ทิ้งไป */
export function resetHowTo() {
  stopHowTo("gone");
  navOff?.();
  navOff = null;
}
