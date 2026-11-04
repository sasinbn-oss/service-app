/**
 * ที่อยู่ของแต่ละหน้าบนเว็บ — ก๊อบลิงก์ไปเปิดที่อื่นแล้วเจอหน้าเดิม · F5 อยู่หน้าเดิม · ปุ่มย้อนกลับของเบราว์เซอร์ใช้ได้
 * (เจ้าของงานขอ 4 พ.ย. 69: "อยากให้อิงจากหน้านั้นๆได้ด้วย เวลาก๊อบ url") — เดิมแถบที่อยู่ไม่เคยเปลี่ยน
 *
 * **หน้าอยู่หลัง # เสมอ** เช่น `/#/wo/WO-00045` `/#/inbox` — ไม่ใช่ `/wo/WO-00045`
 * เว็บจริงเป็น Render Static Site ที่ตอบ 404 ทุกที่อยู่ที่ไม่ใช่ไฟล์จริง (ลองแล้ว: `/inbox` ได้ 404 · `/#/inbox` ได้แอป)
 * และเจ้าของงานไม่อยากแก้การตั้งค่า Render ให้ส่งทุกที่อยู่ไปที่ index.html · ส่วนหลัง # ไม่ถูกส่งไปเซิร์ฟเวอร์เลย
 * เซิร์ฟเวอร์เห็นแค่ `/` ทุกครั้ง จึงไม่ต้องตั้งอะไรเพิ่ม และกฎแคชของ `/` (README) ครอบทุกหน้าไปด้วย
 *
 * **ไม่ใช้ `linking` ของ React Navigation** — v7 อ่านเขียนแค่ pathname ไม่มีโหมด # และตัวตัดสินว่า "เพิ่มรายการ/ถอยกลับ"
 * ของมันนับความยาวประวัติของแท็บ (backBehavior) ซึ่งบนเว็บผิด: กลับมาแท็บหน้าหลักถูกนับเป็น "ถอย" มันจึงถอยประวัติ
 * เบราว์เซอร์แล้วเขียนทับรายการก่อนหน้า (ลองจริง 4 พ.ย. 69: กล่องงาน → รายงาน → หลังบ้าน → สิทธิ์ผู้ใช้ แล้วกดย้อนกลับ
 * 3 ครั้งหลุดออกนอกแอป · ไปข้างหน้าค้างที่รายงาน) — จึงเขียนตัวผูกประวัติเองใน syncPageUrl/installHashLinks
 * ใช้กฎแบบหน้าเว็บ: หน้าใหม่ = รายการใหม่ · ปิดหน้าต่าง = ถอย · สลับ navigator (เข้า/ออกระบบ · ดูในฐานะ) = แทนที่
 *
 * ชื่อในที่อยู่เป็นอังกฤษ — ภาษาไทยในลิงก์กลายเป็น %E0%B8... ตอนวางในไลน์ อ่านไม่ออกและดูเหมือนลิงก์เสีย
 * ใบงานใช้รหัสที่คนเห็นบนจอ (WO-00045) ไม่ใช่เลขภายใน · ค่าที่เป็นแค่ตัวช่วยหน้าจอ (ชื่อหัวหน้า · open=close
 * ที่เปิดฟอร์มให้เลย) ไม่ใส่ในที่อยู่ — เปิดลิงก์ของคนอื่นแล้วฟอร์มปิดงานเด้งขึ้นเองคงงง
 *
 * มือถือ (iOS/Android) ไม่มีที่อยู่ให้ก๊อบ — ทุกฟังก์ชันที่แตะที่อยู่/ประวัติไม่ทำอะไรนอกเว็บ (WEB)
 * ส่วนที่ใช้ทั้งสองแบบมีแค่ homeScreenFor (หน้าแรกตามตำแหน่ง)
 *
 * ตารางที่อยู่ทั้งหมดกับเหตุผลอยู่ใน README หัวข้อ "ที่อยู่ของแต่ละหน้าบนเว็บ" — เพิ่มหน้าใหม่ต้องเพิ่มแถวใน PAGES ด้วย
 * (ไม่เพิ่ม = หน้านั้นขึ้นที่อยู่ของหน้าแรกของแท็บ ก๊อบไปแล้วไม่ได้หน้านั้น)
 */
import { Platform } from "react-native";
import type {
  DocumentTitleOptions,
  getStateFromPath as getStateFromPathDefault,
  NavigationState,
  PartialState,
} from "@react-navigation/native";
import { isAreaTeam } from "../utils/areaTeam";
import type { User } from "../types";
import { navigationRef } from "./navigationRef";
import type { MainTabParamList } from "./types";

const WEB = Platform.OS === "web" && typeof window !== "undefined";

type Tab = keyof MainTabParamList;
type Bag = Record<string, string>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyParams = any;
type LinkState = NonNullable<ReturnType<typeof getStateFromPathDefault>>;

/** รหัสใบงานจากเลขใบ — ต้องตรงกับ workOrderCode ใน backend/src/utils/constants.ts (รหัสตั้งจาก id หลังสร้างเสมอ) */
export function workOrderCode(id: number) {
  return `WO-${String(id).padStart(5, "0")}`;
}

/** เลขบวกจากข้อความในที่อยู่ — ไม่ใช่เลข = ลิงก์ผิด ไม่ส่งต่อให้หน้าจอไปยิง /undefined */
const posInt = (s: string | undefined) => (s && /^\d{1,9}$/.test(s) && Number(s) > 0 ? Number(s) : undefined);

/** หน้าแรกของแท็บหน้าหลักตามตำแหน่ง — Area Team ไม่มีงานออกหน้างาน จึงเริ่มที่แผนงาน (ดู HomeStackNavigator) */
export function homeScreenFor(user: Pick<User, "role"> | null | undefined): "PlanBoard" | "MyJobs" {
  return isAreaTeam(user) ? "PlanBoard" : "MyJobs";
}
let home: string = "MyJobs";
/** ผู้ใช้ที่หน้าจอเป็นของ (ดูในฐานะ = คนที่ถูกดู) — รายการประวัติจดไว้ว่าเป็นของใคร ดู openEntry */
let who = "";
/**
 * ลิงก์ที่เปิดหน้าลึก ๆ ต้องมีหน้าแรกของคนนั้นรองอยู่ข้างใต้ (เหมือนกดมาจากเมนู) — App.tsx ตั้งทุกครั้งที่รู้ตัวผู้ใช้
 * userKey = เลขผู้ใช้ที่หน้าจอเป็นของ ("" = ยังไม่เข้าระบบ)
 */
export function setLinkHome(screen: string, userKey = "") {
  home = screen;
  who = userKey;
}
const HOME = "@home";

interface Page {
  /** ส่วนหลัง #/ เช่น "wo/:code" · ":x" = ค่าจากที่อยู่ */
  path: string;
  screen: string;
  /** ไม่ใส่ = หน้าเข้าสู่ระบบ (อยู่นอกแท็บ) */
  tab?: Tab;
  /** หน้าที่ซ้อนอยู่ข้างใต้ตอนเปิดจากลิงก์ — ไม่ใส่ = หน้าแรกของแท็บ (แบบเดียวกับเมนูข้างที่ส่ง initial: false) */
  under?: string[];
  /** ที่อยู่ → params ของหน้า · null = ไม่ใช่หน้านี้ (ค่าผิดรูป) */
  read?: (seg: Bag, q: Bag) => object | undefined | null;
  /** params → ค่าที่ใส่ในที่อยู่ · null = ใช้แบบนี้ไม่ได้ ลองแถวถัดไปของหน้าเดียวกัน */
  write?: (p: AnyParams) => { seg?: Record<string, string | undefined>; q?: Record<string, string | number | undefined> } | null;
}

/**
 * ทุกหน้าใน types.ts — แถวแรกที่ตรงชนะ ทั้งตอนอ่านและตอนเขียน
 *
 * หน้าใบงาน (รายการ · เปิดใหม่ · ใบงาน) มีทั้งในแท็บหน้าหลักและแท็บใบงาน — ที่อยู่เดียวกันทั้งสองแท็บ
 * เปิดจากลิงก์ไปลงแท็บใบงานเสมอ (มีรายการรองอยู่ข้างใต้ ปิดหน้าต่างใบงานแล้วเจอรายการ ไม่ใช่จอว่าง)
 */
const PAGES: Page[] = [
  { path: "login", screen: "Login" },
  { path: "register", screen: "Register" },

  // ── ใบงาน ──
  // กล่องงานกับใบงานซ่อมเป็นหน้าเดียวกัน (WorkOrderList) ต่างกันที่ inbox — แยกที่อยู่ให้ก๊อบไปแล้วเปิดถูกแท็บ
  // แท็บย่อย/ตัวกรองในรายการเป็นของหน้าจอ (จำไว้ในเครื่อง) ไม่ได้อยู่ใน params จึงไม่อยู่ในที่อยู่
  { path: "inbox", screen: "WorkOrderList", tab: "WorkOrdersTab", read: () => ({ inbox: true }), write: (p) => (p?.inbox ? {} : null) },
  // q = มาจาก "ค้นในใบงานซ่อมทั้งหมด" / "ใบงานสาขานี้" — ลิงก์แบบนี้หมายถึงผลค้นนั้น จึงเก็บไว้
  {
    path: "work-orders",
    screen: "WorkOrderList",
    tab: "WorkOrdersTab",
    read: (_, q) => (q.q ? { search: q.q } : undefined),
    write: (p) => ({ q: { q: p?.search } }),
  },
  { path: "work-orders/new", screen: "WorkOrderForm", tab: "WorkOrdersTab" },
  {
    path: "wo/:code",
    screen: "WorkOrderDetail",
    tab: "WorkOrdersTab",
    // ได้แค่รหัส — หน้าใบงานถามเลขใบจากเซิร์ฟเวอร์เอง (GET /work-orders/by-code/:code กฎสิทธิ์เดียวกับเปิดใบ)
    read: (s) => (/^[A-Za-z0-9-]{1,40}$/.test(s.code) ? { code: s.code.toUpperCase() } : null),
    // เปิดจากในแอปส่งมาแค่ id — รหัสคิดจาก id ได้เลย ไม่ต้องรอโหลดใบ ที่อยู่จึงถูกตั้งแต่หน้าต่างเด้งขึ้น
    write: (p) => {
      const code = p?.code ?? (typeof p?.id === "number" ? workOrderCode(p.id) : undefined);
      return code ? { seg: { code } } : null;
    },
  },

  // ── หน้าหลัก ──
  { path: "plan", screen: "PlanBoard", tab: "HomeTab", under: [] },
  { path: "my-jobs", screen: "MyJobs", tab: "HomeTab", under: [] },
  { path: "home", screen: "HomeMenu", tab: "HomeTab", under: [] },
  { path: "machines", screen: "MachineDashboard", tab: "HomeTab" },
  { path: "machines/import", screen: "MachineImport", tab: "HomeTab", under: [HOME, "MachineDashboard"] },
  { path: "coverage", screen: "CoverageMap", tab: "HomeTab" },
  { path: "reports", screen: "ReportsMenu", tab: "HomeTab" },
  { path: "reports/by-opener", screen: "OpenerReport", tab: "HomeTab", under: [HOME, "ReportsMenu"] },
  { path: "reports/system", screen: "SystemReport", tab: "HomeTab", under: [HOME, "ReportsMenu"] },
  { path: "reports/confirmed", screen: "ConfirmedReport", tab: "HomeTab", under: [HOME, "ReportsMenu"] },
  { path: "reports/parts-out", screen: "PartsOutReport", tab: "HomeTab", under: [HOME, "ReportsMenu"] },
  { path: "reports/issued-parts", screen: "IssuedPartsReport", tab: "HomeTab", under: [HOME, "ReportsMenu"] },
  // ตัวกรองจากลิงก์ "อะไหล่ที่สาขานี้ได้ไปแล้ว" ในใบงาน — ชื่อสาขาไม่ใส่ (ภาษาไทยในที่อยู่) หน้าจอขึ้นรหัสสาขาแทน
  {
    path: "reports/branch-parts",
    screen: "BranchPartsReport",
    tab: "HomeTab",
    under: [HOME, "ReportsMenu"],
    read: (_, q) =>
      q.branch
        ? { branchCode: q.branch, ...(posInt(q.machineId) ? { machineId: posInt(q.machineId), machineCode: q.machine || undefined } : {}) }
        : undefined,
    write: (p) => ({ q: { branch: p?.branchCode, machineId: p?.branchCode ? p?.machineId : undefined, machine: p?.branchCode && p?.machineId ? p?.machineCode : undefined } }),
  },
  // ประวัติเคลม — ตัวกรองจากลิงก์ "เคลมเครื่องนี้/สาขานี้ทั้งหมด" ในใบงาน
  {
    path: "reports/claims",
    screen: "ClaimHistory",
    tab: "HomeTab",
    read: (_, q) => (q.branch ? { branchCode: q.branch, machineCode: q.machine || undefined } : undefined),
    write: (p) => ({ q: { branch: p?.branchCode, machine: p?.branchCode ? p?.machineCode : undefined } }),
  },
  // รายงานทั่วไป (วันนี้ · สัปดาห์ · ผู้บริหาร · อะไหล่ที่ต้องสั่ง) — ต้องอยู่หลังรายงานที่มีชื่อเฉพาะข้างบน
  {
    path: "reports/:kind",
    screen: "Report",
    tab: "HomeTab",
    under: [HOME, "ReportsMenu"],
    read: (s) => (["daily", "weekly", "monthly", "parts"].includes(s.kind) ? { kind: s.kind } : null),
    write: (p) => (p?.kind ? { seg: { kind: p.kind } } : null),
  },
  { path: "claims/review", screen: "ClaimReview", tab: "HomeTab" },
  { path: "spare-parts", screen: "SparePartList", tab: "HomeTab" },
  {
    path: "spare-parts/:id",
    screen: "SparePartDetail",
    tab: "HomeTab",
    under: [HOME, "SparePartList"],
    read: (s) => (posInt(s.id) ? { id: posInt(s.id) } : null),
    write: (p) => (typeof p?.id === "number" ? { seg: { id: String(p.id) } } : null),
  },
  { path: "diagnose", screen: "FlowList", tab: "HomeTab" },
  {
    // ชื่อผังไม่อยู่ในที่อยู่ — หน้าวินิจฉัยตั้งหัวหน้าจากผังที่โหลดมาเอง
    path: "diagnose/:id",
    screen: "FlowRun",
    tab: "HomeTab",
    under: [HOME, "FlowList"],
    read: (s) => (posInt(s.id) ? { id: posInt(s.id) } : null),
    write: (p) => (typeof p?.id === "number" ? { seg: { id: String(p.id) } } : null),
  },
  { path: "transfer-document", screen: "TransferDocument", tab: "HomeTab" },
  { path: "check-in", screen: "BranchCheckIn", tab: "HomeTab" },
  { path: "work-log", screen: "WorkLogForm", tab: "HomeTab" },
  { path: "vehicle", screen: "VehicleCheckIn", tab: "HomeTab" },
  { path: "consumables", screen: "ConsumableRequest", tab: "HomeTab" },
  { path: "change-password", screen: "ChangePassword", tab: "HomeTab" },
  // สอนการใช้งาน — เพิ่มทีหลังตาราง (production 4 พ.ย. 69) · ไม่มีแถว = ที่อยู่ขึ้น /#/ ของหน้าแรก ก๊อบไปแล้วไม่ได้หน้านี้
  { path: "how-to", screen: "HowTo", tab: "HomeTab" },

  // ── ประวัติ ──
  { path: "history", screen: "HistoryMenu", tab: "HistoryTab", under: [] },
  { path: "history/check-ins", screen: "BranchHistory", tab: "HistoryTab" },
  { path: "history/work-logs", screen: "WorkLogHistory", tab: "HistoryTab" },
  { path: "history/vehicle", screen: "VehicleHistory", tab: "HistoryTab" },
  { path: "history/consumables", screen: "MyConsumableRequests", tab: "HistoryTab" },
  { path: "guides", screen: "GuideList", tab: "HistoryTab" },
  {
    path: "guides/:id",
    screen: "GuideDetail",
    tab: "HistoryTab",
    under: ["HistoryMenu", "GuideList"],
    read: (s) => (posInt(s.id) ? { id: posInt(s.id) } : null),
    write: (p) => (typeof p?.id === "number" ? { seg: { id: String(p.id) } } : null),
  },

  // ── ระบบหลังบ้าน ── (ไม่มีสิทธิ์ = แท็บนี้ไม่มีในแอปของคนนั้น เปิดลิงก์แล้วไปหน้าแรกเอง ไม่ต้องเช็คซ้ำที่นี่)
  { path: "admin", screen: "AdminMenu", tab: "AdminTab", under: [] },
  { path: "admin/requests", screen: "ReviewRequests", tab: "AdminTab" },
  { path: "admin/flows", screen: "ManageFlows", tab: "AdminTab" },
  { path: "admin/guides", screen: "ManageGuides", tab: "AdminTab" },
  { path: "admin/spare-parts", screen: "ManageSpareParts", tab: "AdminTab" },
  { path: "admin/consumables", screen: "ManageConsumables", tab: "AdminTab" },
  { path: "admin/vehicles", screen: "ManageVehicles", tab: "AdminTab" },
  { path: "admin/fleet", screen: "FleetDashboard", tab: "AdminTab" },
  { path: "admin/vehicle-logs", screen: "VehicleLogAdmin", tab: "AdminTab" },
  { path: "admin/branches", screen: "ManageBranches", tab: "AdminTab" },
  { path: "admin/users", screen: "ManageUsers", tab: "AdminTab" },
  { path: "admin/teams", screen: "ManageTeams", tab: "AdminTab" },
  { path: "admin/backup", screen: "Backup", tab: "AdminTab" },
  { path: "admin/usage", screen: "AppUsage", tab: "AdminTab" },
  /**
   * ถังขยะใบงาน — q = คำค้นในช่องค้น (หน้าจอเขียนกลับเองทุกครั้งที่ค้น): F5/ก๊อบลิงก์ได้ผลค้นเดิม
   * และลิงก์ใบงานที่อยู่ในถังขยะ (/#/wo/WO-…) พาแอดมินมาที่นี่พร้อมรหัสใบ ไม่ต้องหาเองในถัง
   */
  {
    path: "admin/trash",
    screen: "WorkOrderTrash",
    tab: "AdminTab",
    read: (_, q) => (q.q ? { q: q.q.slice(0, 100) } : undefined),
    write: (p) => ({ q: { q: p?.q } }),
  },
];

/** หน้าแรกของแต่ละแท็บ (ข้างใต้ของหน้าที่ไม่ได้บอก under) และที่อยู่เมื่อยังไม่รู้ว่าอยู่หน้าไหนในแท็บ */
const TAB_HOME: Record<Tab, { under: string; path: string }> = {
  HomeTab: { under: HOME, path: "/" },
  WorkOrdersTab: { under: "WorkOrderList", path: "/work-orders" },
  HistoryTab: { under: "HistoryMenu", path: "/history" },
  AdminTab: { under: "AdminMenu", path: "/admin" },
};

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * แยก "/wo/WO-00045?x=1" เป็นท่อนกับค่าหลัง ? — เขียนเอง ไม่ใช้ URLSearchParams เพราะไฟล์นี้ถูก import บนมือถือด้วย
 * ตัดตั้งแต่ # ตัวที่สองทิ้ง (เผื่อที่อยู่ที่มี # ซ้อนจากรุ่นก่อนแก้ — ดู installHashLinks)
 */
function split(raw: string) {
  const clean = raw.split("#")[0];
  const at = clean.indexOf("?");
  const path = at < 0 ? clean : clean.slice(0, at);
  const q: Bag = {};
  for (const part of (at < 0 ? "" : clean.slice(at + 1)).split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const k = decode((eq < 0 ? part : part.slice(0, eq)).replace(/\+/g, " "));
    if (k && !(k in q)) q[k] = decode((eq < 0 ? "" : part.slice(eq + 1)).replace(/\+/g, " ")).trim();
  }
  return { segs: path.split("/").filter(Boolean).map(decode), q };
}

function match(pattern: string, segs: string[]): Bag | null {
  const parts = pattern.split("/");
  if (parts.length !== segs.length) return null;
  const out: Bag = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(":")) out[parts[i].slice(1)] = segs[i];
    else if (parts[i] !== segs[i].toLowerCase()) return null;
  }
  return out;
}

/**
 * ที่อยู่หน้า ("/wo/WO-00045") → สถานะของ navigator · undefined = หน้าแรก (ไม่มี # หรือที่อยู่ที่ไม่รู้จัก)
 * ที่อยู่ผิด/เก่าจึงพาไปหน้าแรกเงียบ ๆ ไม่ใช่จอพัง
 */
export function stateFromPagePath(raw: string): LinkState | undefined {
  const { segs, q } = split(raw);
  if (!segs.length) return undefined;
  for (const page of PAGES) {
    const seg = match(page.path, segs);
    if (!seg) continue;
    const params = page.read ? page.read(seg, q) : undefined;
    if (params === null) continue;
    const leaf = params ? { name: page.screen, params } : { name: page.screen };
    if (!page.tab) return { routes: [leaf] } as LinkState;
    const under = (page.under ?? [TAB_HOME[page.tab].under])
      .map((n) => (n === HOME ? home : n))
      .filter((n, i, all) => n !== page.screen && all.indexOf(n) === i);
    return { routes: [{ name: page.tab, state: { routes: [...under.map((name) => ({ name })), leaf] } }] } as LinkState;
  }
  return undefined;
}

type AnyRoute = { key?: string; name: string; params?: AnyParams; state?: AnyState };
type AnyState = { key?: string; type?: string; index?: number; routes: AnyRoute[] };

const focused = (s: AnyState | undefined): AnyRoute | undefined =>
  s?.routes?.length ? s.routes[typeof s.index === "number" ? s.index : s.routes.length - 1] : undefined;

function pathOfScreen(screen: string, params: AnyParams): string | null {
  for (const page of PAGES) {
    if (page.screen !== screen) continue;
    const out = page.write ? page.write(params ?? {}) : {};
    if (out === null) continue;
    const segs = page.path.split("/").map((s) => (s.startsWith(":") ? encodeURIComponent(out.seg?.[s.slice(1)] ?? "") : s));
    if (segs.includes("")) continue;
    const qs = Object.entries(out.q ?? {})
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    return `/${segs.join("/")}${qs ? `?${qs}` : ""}`;
  }
  return null;
}

/**
 * สถานะของ navigator → ที่อยู่หน้า ("/wo/WO-00045")
 * รับสถานะไม่ครบได้ — แท็บที่ยังไม่เคยเปิดไม่มี state ข้างใน (หรือมีแค่ params.screen ที่เมนูข้างส่งมา)
 */
export function pagePathOf(state: AnyState): string {
  const top = focused(state);
  if (!top) return "/";
  const tab = TAB_HOME[top.name as Tab];
  if (!tab) return pathOfScreen(top.name, top.params) ?? "/";
  const inner: AnyState | undefined =
    top.state ?? (typeof top.params?.screen === "string" ? { routes: [{ name: top.params.screen, params: top.params.params }] } : undefined);
  const leaf = focused(inner);
  return (leaf && pathOfScreen(leaf.name, leaf.params)) || tab.path;
}

/** ส่วนหลัง # ของแถบที่อยู่ ("/inbox") — "" = ไม่มี */
function hashPath(): string {
  if (!WEB) return "";
  const h = window.location.hash.replace(/^#/, "");
  return !h ? "" : h.startsWith("/") ? h : `/${h}`;
}

/**
 * หน้าที่จะเปิดตอนโหลดแอปจากส่วนหลัง # — App.tsx ส่งเป็น initialState ของ NavigationContainer
 * หน้าในแท็บใช้เมื่อเข้าระบบแล้ว · หน้าเข้าสู่ระบบ/ลงทะเบียนใช้เมื่อยังไม่เข้า · ไม่ตรงกัน = หน้าแรกของสิ่งที่ขึ้นจอ
 * (ลิงก์หน้าในแท็บตอนยังไม่เข้าระบบจำไว้แยกใน noteBootLink แล้วพาไปหลังเข้าระบบ)
 * ต้องเรียกหลัง setLinkHome — หน้าที่ซ้อนข้างใต้คือหน้าแรกของคนที่เปิด
 */
export function bootState(loggedIn: boolean): object | undefined {
  if (!WEB) return undefined;
  const st = bootPath ? stateFromPagePath(bootPath) : undefined;
  if (!st) return undefined;
  return !!TAB_HOME[st.routes[0]?.name as Tab] === loggedIn ? st : undefined;
}

/**
 * ชื่อแท็บเบราว์เซอร์ = ชื่อหน้า · ใบงานใช้รหัส (WO-00045) — เปิดหลายใบหลายแท็บแล้วแยกออก
 * React Navigation ตั้งชื่อแท็บให้อยู่แล้ว (ชื่อหน้าเปล่า ๆ หน้าเข้าสู่ระบบขึ้นเป็น "Login") — แค่จัดรูปให้
 */
const AUTH_TITLES: Record<string, string> = { Login: "เข้าสู่ระบบ", Register: "ลงทะเบียนพนักงาน" };
type TitleArgs = Parameters<NonNullable<DocumentTitleOptions["formatter"]>>;
function pageTitle(options: TitleArgs[0], route: TitleArgs[1]): string {
  const p = route?.params as { id?: unknown; code?: unknown; inbox?: unknown } | undefined;
  // กล่องงานกับใบงานซ่อมเป็นหน้าเดียวกัน (ชื่อหน้า "ใบงานซ่อม") — แท็บเบราว์เซอร์ของ /#/inbox ต้องบอกว่าเป็นกล่องงาน
  if (route?.name === "WorkOrderList" && p?.inbox === true) return "กล่องงานของฉัน · OTTERI";
  const title =
    route?.name === "WorkOrderDetail"
      ? typeof p?.code === "string"
        ? p.code
        : typeof p?.id === "number"
          ? workOrderCode(p.id)
          : "ใบงาน"
      : typeof options?.title === "string"
        ? options.title
        : AUTH_TITLES[route?.name ?? ""];
  return title ? `${title} · OTTERI` : "OTTERI Service";
}
export const documentTitle: DocumentTitleOptions = { formatter: pageTitle };

// ── เปิดลิงก์ตอนยังไม่ได้เข้าระบบ → เข้าระบบแล้วไปหน้านั้น ──

/**
 * หน้าที่ขอไว้ก่อนเข้าระบบ — sessionStorage (แท็บนี้เท่านั้น): F5 ที่หน้าเข้าสู่ระบบ/แวะหน้าลงทะเบียนแล้วยังจำได้
 * แต่ปิดแท็บแล้วลืม ไม่ไปโผล่ตอนเปิดเว็บใหม่วันอื่น
 */
const PENDING_KEY = "otteri-link-after-login";
let bootPath = "";

const isTabPage = (path: string) => {
  const st = path ? stateFromPagePath(path) : undefined;
  return !!st && !!TAB_HOME[st.routes[0]?.name as Tab];
};

/**
 * ตัดสินลิงก์ตอนเปิดแอป (เรียกครั้งเดียวเมื่อรู้แล้วว่าเข้าระบบอยู่หรือไม่ — App.tsx)
 *
 * ยังไม่เข้าระบบ (หรือติดหน้าเปลี่ยนรหัสบังคับ): จำหน้าในลิงก์ไว้ — หน้าเข้าสู่ระบบจะแทนที่อยู่เป็น /#/login ทันที
 * เข้าระบบอยู่แล้วและลิงก์ชี้หน้าจริง: ลิงก์นั้นชนะ ลบของที่จำไว้ (เปิดลิงก์ A ค้างที่หน้าเข้าสู่ระบบ ไปเข้าระบบแท็บอื่น
 * แล้ววางลิงก์ B ในแท็บนี้ — ต้องได้ B ไม่ใช่ A) · ลิงก์เป็นหน้าแรก/หน้าเข้าสู่ระบบ: เก็บไว้ ให้หลังเข้าระบบพาไป
 * **ไม่จำตอนกดออกจากระบบ** — คนถัดไปที่เข้าเครื่องเดียวกันต้องเริ่มหน้าแรกของตัวเอง ไม่ใช่หน้าที่คนก่อนเปิดค้างไว้
 */
export function noteBootLink(needsLogin: boolean) {
  if (!WEB) return;
  try {
    if (needsLogin) {
      if (isTabPage(bootPath)) sessionStorage.setItem(PENDING_KEY, bootPath);
    } else if (isTabPage(bootPath)) {
      sessionStorage.removeItem(PENDING_KEY);
    }
  } catch {
    // ที่เก็บของเบราว์เซอร์ถูกปิด — เข้าระบบแล้วไปหน้าแรกแบบเดิม
  }
}

/**
 * เข้าระบบเสร็จ (หรือเปลี่ยนรหัสบังคับเสร็จ) → ไปหน้าที่ขอไว้ — MainNavigator เรียกตอนขึ้นจอ
 * resetRoot ไม่ใช่ navigate: ต้องได้หน้ารองข้างใต้แบบเดียวกับเปิดลิงก์ตรง ๆ และแทนที่อยู่เดิม (ไม่เพิ่มรายการย้อนกลับ)
 * ไม่มีสิทธิ์หน้านั้น (แท็บไม่มีในแอปของคนนี้) → navigator ตกไปหน้าแรกเอง · หน้าที่มีประตู/403 ของตัวเองขึ้นหน้ากุญแจเหมือนเดิม
 */
export function openLinkAfterLogin(tries = 0) {
  if (!WEB) return;
  let path: string | null = null;
  try {
    path = sessionStorage.getItem(PENDING_KEY);
  } catch {
    return;
  }
  if (!path) return;
  // MainNavigator เพิ่งแทนหน้าเข้าสู่ระบบ — รอจนแท็บเป็นตัวหลักของ NavigationContainer ก่อน (resetRoot ส่งไปที่ตัวหลัก
  // ถ้ายังเป็นของหน้าเข้าสู่ระบบอยู่ คำสั่งหายเงียบ) · ไม่มาภายใน 2 วิ = ปล่อยไว้ รอบหน้าที่ MainNavigator ขึ้นจอค่อยพาไป
  const root = navigationRef.isReady() ? navigationRef.getRootState() : undefined;
  if (!root?.routeNames?.includes("HomeTab")) {
    if (tries < 40) setTimeout(() => openLinkAfterLogin(tries + 1), 50);
    return;
  }
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ลบไม่ได้ก็แค่พาไปซ้ำรอบหน้า ไม่เสียหาย
  }
  const state = isTabPage(path) ? stateFromPagePath(path) : undefined;
  // แท็บที่คนนี้ไม่มี (ช่างเปิดลิงก์หน้าแอดมิน) — อยู่หน้าแรกเฉย ๆ เหมือนเปิดลิงก์ตอนเข้าระบบอยู่แล้ว
  if (!state || !root.routeNames.includes(state.routes[0].name)) return;
  navigationRef.resetRoot(state as PartialState<NavigationState>);
}

// ── ประวัติของเบราว์เซอร์ (ย้อนกลับ/ไปข้างหน้า) ──

/**
 * ที่จำไว้ต่อรายการประวัติ (คีย์ = otteri ใน history.state) — หน้า + สถานะ navigator ทั้งก้อน
 * ย้อนกลับแล้วได้กองหน้าข้างใต้/params เดิมครบ ไม่ใช่แค่หน้าที่อ่านจากที่อยู่ · อยู่ในหน่วยความจำ: F5 แล้วหายเหลือแต่ที่อยู่
 */
const records = new Map<string, { path: string; state: NavigationState; who: string }>();
/** ลำดับรายการที่รู้ในการโหลดรอบนี้ — ใช้ดูว่ารายการก่อนหน้าเป็นหน้าไหน (ปิดหน้าต่างแล้ว "ถอย" แทน "เพิ่ม") */
let order: string[] = [];
let lastState: NavigationState | undefined;
/** แอปสั่ง history.back() เอง (ปิดหน้าต่างกลับหน้าที่อยู่ในรายการก่อนหน้า) — popstate ที่ตามมาแค่จด ไม่พาไปไหน */
let ownBack: ReturnType<typeof setTimeout> | null = null;

const idOf = (s: unknown): string | undefined => {
  const v = s && typeof s === "object" ? (s as { otteri?: unknown }).otteri : undefined;
  return typeof v === "string" ? v : undefined;
};
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
// pathname เดิม (Render มีไฟล์เดียวคือหน้าแรก) · ?v= ของ UpdateGate / ?t= ของเทสต์หลุดไปตอนเขียนครั้งแรก เหมือนที่ UpdateGate ล้างเอง
const urlOf = (path: string) => `${window.location.pathname}#${path}`;

function write(kind: "push" | "replace", id: string, path: string, state: NavigationState) {
  records.set(id, { path, state, who });
  if (kind === "push") {
    const cur = idOf(window.history.state);
    const at = cur ? order.indexOf(cur) : -1;
    // รายการหน้า (ไปข้างหน้า) ที่เคยมีหลังรายการนี้ถูกเบราว์เซอร์ทิ้งตอน pushState — ทิ้งตามกัน
    order = at >= 0 ? [...order.slice(0, at + 1), id] : cur ? [cur, id] : [id];
    window.history.pushState({ otteri: id }, "", urlOf(path));
    return;
  }
  if (!order.includes(id)) order = [id];
  if (idOf(window.history.state) !== id || hashPath() !== path) window.history.replaceState({ otteri: id }, "", urlOf(path));
}

/**
 * เปลี่ยนหน้าแบบไหน — เดินลงตามหน้าที่เปิดอยู่จนเจอ navigator ที่เปลี่ยน
 * แท็บ: สลับแท็บ = หน้าใหม่เสมอ (เมนูข้างพาข้ามแท็บตลอด ไม่ใช่การถอย) · สแต็ก: ยาวขึ้น = เพิ่ม · สั้นลง = ถอย · เท่าเดิมแต่หน้าเปลี่ยน
 * (navigation.replace — เปิดใบงานเสร็จแล้วแทนฟอร์มด้วยใบงาน) = แทนที่ · navigator คนละตัว (เข้า/ออกระบบ · ดูในฐานะ) = แทนที่
 */
function changeOf(a: AnyState, b: AnyState): "push" | "pop" | "replace" {
  for (;;) {
    if (a.key !== b.key) return "replace";
    const ia = typeof a.index === "number" ? a.index : a.routes.length - 1;
    const ib = typeof b.index === "number" ? b.index : b.routes.length - 1;
    const ra = a.routes[ia];
    const rb = b.routes[ib];
    if (!ra || !rb) return "replace";
    if (a.type === "tab") {
      if (ra.key !== rb.key) return "push";
    } else if (ia !== ib) {
      return ib > ia ? "push" : "pop";
    } else if (ra.key !== rb.key) {
      return "replace";
    }
    if (!ra.state || !rb.state) return "replace";
    a = ra.state;
    b = rb.state;
  }
}

/**
 * เขียนที่อยู่ตามหน้าที่เปิดอยู่ — App.tsx เรียกจาก onReady/onStateChange ของ NavigationContainer
 * หน้าเดิม (params เปลี่ยนแต่ที่อยู่เท่าเดิม เช่นใบงานจากลิงก์ได้เลขใบ) แค่จดสถานะใหม่ ไม่เพิ่มรายการ
 */
export function syncPageUrl() {
  if (!WEB || !navigationRef.isReady()) return;
  const state = navigationRef.getRootState();
  if (!state) return;
  // ชื่อแท็บของ React Navigation เปลี่ยนเมื่อ options เปลี่ยนเท่านั้น — params ที่มาทีหลัง (เมนูกล่องงานส่ง inbox ตามหลังตอนเปิดแท็บ
  // ใบงานครั้งแรก) ไม่ทำให้ชื่อเปลี่ยน แท็บเลยค้าง "ใบงานซ่อม" ทั้งที่ที่อยู่เป็น /#/inbox · ตั้งซ้ำตรงนี้ทุกครั้งที่หน้าเปลี่ยน
  document.title = pageTitle(navigationRef.getCurrentOptions(), navigationRef.getCurrentRoute());
  const prev = lastState;
  lastState = state;
  if (ownBack) return;
  const path = pagePathOf(state as AnyState);
  const id = idOf(window.history.state);
  const rec = id ? records.get(id) : undefined;
  // รายการที่ยังไม่ได้จด (เปิดแอปครั้งแรก · F5 · ย้อนไปรายการจากก่อนโหลดใหม่) — จดทับรายการนี้ ไม่เพิ่ม
  // คนเปลี่ยน (เข้า/ออกระบบ · เริ่ม/เลิกดูในฐานะ) ก็แทนที่ — React Navigation เก็บสถานะ navigator ข้ามการเปลี่ยนคน
  // (MainNavigator key ใหม่แต่สถานะเดิมของ container) จึงดูจากสถานะอย่างเดียวไม่ออก
  if (!id || !rec || !prev || rec.who !== who) return write("replace", id ?? newId(), path, state);
  if (rec.path === path) return write("replace", id, path, state);
  const change = changeOf(prev as AnyState, state as AnyState);
  if (change === "push") return write("push", newId(), path, state);
  if (change === "pop") {
    // ปิดหน้าต่างใบงานกลับรายการ ที่รายการก่อนหน้าในประวัติคือรายการนั้นพอดี — ถอยประวัติด้วย ไม่งั้นได้ [รายการ, ใบงาน, รายการ]
    // กดย้อนกลับแล้วใบงานเด้งกลับมา
    const at = order.indexOf(id);
    const before = at > 0 ? records.get(order[at - 1]) : undefined;
    if (before?.path === path) {
      ownBack = setTimeout(() => {
        ownBack = null;
        syncPageUrl();
      }, 1000);
      window.history.back();
      return;
    }
    // ถอยในสแต็กไปหน้าที่ไม่ใช่รายการก่อนหน้า (ใบงานเปิดอยู่แล้วกดเมนู "กล่องงานของฉัน" — หน้าเดียวกับรายการข้างใต้)
    // คนกดถือเป็นไปหน้าใหม่ ย้อนกลับต้องได้ใบงานคืน = เพิ่มรายการ · ไม่รู้รายการก่อนหน้า (ใบที่เปิดจากลิงก์ตรง ๆ · หลัง F5) = แทนที่
    if (before) return write("push", newId(), path, state);
  }
  write("replace", id, path, state);
}

/** หน้าแรกของ navigator ที่ขึ้นจออยู่ — รายการประวัติที่ใช้กับคนนี้ไม่ได้ */
function homeOf(root: NavigationState): PartialState<NavigationState> {
  return (
    root.routeNames.includes("HomeTab")
      ? { routes: [{ name: "HomeTab", state: { routes: [{ name: home }] } }] }
      : { routes: [{ name: root.routeNames[0] }] }
  ) as PartialState<NavigationState>;
}

/**
 * ย้อนกลับ/ไปข้างหน้าของเบราว์เซอร์มาถึงรายการ id — คืนสถานะที่จดไว้
 * สถานะที่จดไว้ใช้ได้เฉพาะคนเดียวกันบน navigator ตัวเดียวกัน — รายการจากก่อน F5 หรือของอีกคน (ก่อนเข้าระบบ · ก่อน/หลังดูในฐานะ)
 * ใช้ที่อยู่ของรายการ แล้วเปิดเป็นของคนที่อยู่ตอนนี้ (หน้าที่คนนี้ไม่มี = หน้าแรก)
 * (ดูในฐานะช่างแล้วกดย้อนไปรายการหน้าหลังบ้านของแอดมิน: แท็บนั้นไม่มีในแอปช่าง → หน้าแรกของช่าง ที่อยู่เปลี่ยนตาม
 * ไม่คืนกองหน้าของแอดมิน — ลองจริงแล้วเดิมที่อยู่ค้าง #/admin/users ทั้งที่จอเป็นงานของฉันของช่าง)
 */
function openEntry(id: string) {
  if (!navigationRef.isReady()) return;
  const root = navigationRef.getRootState();
  if (!root) return;
  if (!order.includes(id)) order = [id];
  const rec = records.get(id);
  if (rec && rec.who === who && rec.state.key === root.key && rec.state.routeNames.join() === root.routeNames.join()) {
    navigationRef.resetRoot(rec.state);
    return;
  }
  records.delete(id);
  const st = stateFromPagePath(hashPath());
  const fits = !!st && st.routes.every((r) => root.routeNames.includes(r.name));
  navigationRef.resetRoot(fits ? (st as PartialState<NavigationState>) : homeOf(root));
}

/**
 * ผูกประวัติของเบราว์เซอร์ — เรียกครั้งเดียวตอนโหลดแอป ก่อน NavigationContainer ขึ้นจอ
 *
 * ย้อนกลับ/ไปข้างหน้าระหว่างรายการที่แอปเขียนเอง (history.state มี otteri) → openEntry
 * รายการที่ไม่มี otteri = คนวางลิงก์ในแถบที่อยู่ของแท็บที่เปิดแอปอยู่ (หรือแก้ส่วนหลัง # เอง) เบราว์เซอร์ไม่โหลดหน้าใหม่
 * แค่เปลี่ยน # → โหลดหน้าใหม่ที่ที่อยู่นั้น ผลเดียวกับวางลิงก์ที่อยู่จริง (ซึ่งโหลดใหม่เสมอ) และผ่านด่านเข้าระบบ/ลิงก์ค้างตามปกติ
 */
export function installHashLinks() {
  if (!WEB) return;
  bootPath = hashPath();
  // ตอนพัฒนา (expo start) แก้ไฟล์แล้วโค้ดถูกโหลดซ้ำในหน้าเดิม — ถอดตัวฟังของโค้ดรุ่นก่อนออกก่อน
  // ไม่งั้นตัวฟังเก่ายังจับปุ่มย้อนกลับด้วยสิ่งที่จดไว้ชุดเก่า แล้วพาไปสองรอบ
  const w = window as unknown as { __otteriHashLinks?: () => void };
  w.__otteriHashLinks?.();
  let reloading = false;
  const reload = () => {
    reloading = true;
    window.location.reload();
  };
  const onPop = (e: PopStateEvent) => {
    const id = idOf(e.state);
    if (!id) {
      if (!reloading) reload();
      return;
    }
    if (ownBack) {
      clearTimeout(ownBack);
      ownBack = null;
      const st = navigationRef.isReady() ? navigationRef.getRootState() : undefined;
      if (st) write("replace", id, pagePathOf(st as AnyState), st);
      return;
    }
    openEntry(id);
  };
  // บางเบราว์เซอร์ไม่ส่ง popstate ตอนแก้แค่ # — ดักซ้ำอีกทาง
  const onHash = () => {
    if (!reloading && !idOf(window.history.state)) reload();
  };
  window.addEventListener("popstate", onPop);
  window.addEventListener("hashchange", onHash);
  w.__otteriHashLinks = () => {
    window.removeEventListener("popstate", onPop);
    window.removeEventListener("hashchange", onHash);
  };
}
