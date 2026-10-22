import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { EXIT_EASE, spring, timing } from "../utils/motion";
import TouchableOpacity from "./Tap";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { BUILD_AT, BUILD_COMMIT } from "../buildInfo";
import { navigationRef } from "../navigation/navigationRef";
import { MainTabParamList } from "../navigation/types";
import { colors, headingFont, radius, shadow, spacing } from "../theme";
import ThemeToggle from "./ThemeToggle";
import { showAlert } from "../utils/alert";

/**
 * เมนูข้างแบบเลื่อนออกจากซ้าย (ปุ่มสามขีดบนแถบบน) ตามต้นแบบ OTTERI
 *
 * แถบล่างมีที่แค่สี่ปุ่ม แต่แอปมีเกือบยี่สิบหน้า — เมนูนี้ให้ไปถึงทุกหน้าได้ในสองแตะ
 * จากหน้าไหนก็ได้ ไม่ต้องย้อนกลับไปหน้าแรกก่อน และจัดกลุ่มแบบเดียวกับหน้าแรก
 * คนที่จำตำแหน่งปุ่มในหน้าแรกได้จะหาเจอในเมนูนี้ที่เดียวกัน
 */

let setOpenGlobal: ((open: boolean) => void) | null = null;
export const sideMenu = {
  open: () => setOpenGlobal?.(true),
  close: () => setOpenGlobal?.(false),
};

/** จอกว้างเท่านี้ขึ้นไป (เว็บ) เมนูค้างไว้ด้านซ้ายแทนการเลื่อนออก ตามต้นแบบ */
export const DOCK_MIN_WIDTH = 1100;
export const DOCK_WIDTH = 280;
/** เมนูที่หดแล้วเหลือแถบไอคอนกว้างเท่านี้ */
export const RAIL_WIDTH = 76;

/**
 * บนจอคอมปุ่มสามขีดที่หัวเมนูหด/ยืดเมนู และจำค่าไว้ — คนที่ชอบจอโล่ง
 * ไม่ต้องกดหดใหม่ทุกครั้งที่เปิดเว็บ
 *
 * หดแล้วเหลือแถบไอคอน ไม่ได้ซ่อนทั้งแถบ เพราะปุ่มสามขีดอยู่ในเมนูเอง
 * ซ่อนหมดแล้วจะไม่มีปุ่มให้กดเปิดกลับ
 */
const COLLAPSE_KEY = "otteri-side-collapsed";
let collapsed = (() => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
})();
const collapseListeners = new Set<(c: boolean) => void>();
function setCollapsed(c: boolean) {
  collapsed = c;
  try {
    localStorage.setItem(COLLAPSE_KEY, c ? "1" : "0");
  } catch {
    // ที่เก็บของเบราว์เซอร์ถูกปิด — ยุบได้แค่รอบนี้ ไม่เป็นไร
  }
  collapseListeners.forEach((l) => l(c));
}

/** เมนูควรค้างไว้ด้านซ้ายตอนนี้หรือไม่ */
export function useDocked() {
  const { width } = useWindowDimensions();
  const [c, setC] = useState(collapsed);
  useEffect(() => {
    collapseListeners.add(setC);
    return () => {
      collapseListeners.delete(setC);
    };
  }, []);
  const canDock = Platform.OS === "web" && width >= DOCK_MIN_WIDTH;
  return { canDock, docked: canDock, collapsed: canDock && c };
}

/**
 * หัวกลุ่มกดย่อ/กางได้ และจำไว้ (เจ้าของงานขอ ต.ค. 69 — เมนูกางทุกกลุ่มดูเยอะ ลายตา)
 * ครั้งแรกกางแค่ "งานซ่อม" ที่ใช้ทุกวัน · กลุ่มที่ย่ออยู่ยังโชว์หน้าที่เปิดอยู่ ไม่งั้นแถบฟ้าหายไปกับกลุ่ม
 */
const GROUPS_KEY = "otteri-side-groups";
let closedGroups: Set<string> = (() => {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(GROUPS_KEY) : null;
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // อ่านไม่ได้ก็ใช้ค่าเริ่มต้น
  }
  return new Set(["หน้างาน", "รถ", "เอกสารและบัญชี", "ผู้ดูแลระบบ"]);
})();
const groupListeners = new Set<(s: Set<string>) => void>();
function toggleGroup(title: string) {
  const next = new Set(closedGroups);
  if (next.has(title)) next.delete(title);
  else next.add(title);
  closedGroups = next;
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify([...next]));
  } catch {
    // ที่เก็บของเบราว์เซอร์ถูกปิด — จำได้แค่รอบนี้
  }
  groupListeners.forEach((l) => l(next));
}
function useClosedGroups() {
  const [s, setS] = useState(closedGroups);
  useEffect(() => {
    groupListeners.add(setS);
    return () => {
      groupListeners.delete(setS);
    };
  }, []);
  return s;
}

type Tab = keyof MainTabParamList;

interface Item {
  key: string;
  label: string;
  labelEn: string;
  icon: keyof typeof Ionicons.glyphMap;
  tab: Tab;
  screen: string;
  params?: object;
  badge?: boolean;
  /** เห็นเฉพาะบทบาทเหล่านี้ — ไม่ใส่ = ทุกคน */
  roles?: string[];
  /** เห็นเฉพาะ Super Admin */
  superAdmin?: boolean;
}

interface Group {
  title: string;
  admin?: boolean;
  items: Item[];
}

const GROUPS: Group[] = [
  {
    title: "งานซ่อม",
    items: [
      // หน้าแรกของแอดมินกับหัวหน้าภาค — ช่างไม่เห็น เพราะงานของทีมตัวเองอยู่ในกล่องงานแล้ว
      {
        key: "plan",
        label: "แผนงาน",
        labelEn: "Plan Board",
        icon: "calendar-outline",
        tab: "HomeTab",
        screen: "PlanBoard",
        roles: ["ADMIN", "SUPERVISOR"],
      },
      // หน้าแรกของช่าง — งานที่ปล่อยให้ทีมแล้ว เรียงตามเวลานัด (แบบ Salesforce ต.ค. 69)
      {
        key: "myjobs",
        label: "งานของฉันวันนี้",
        labelEn: "My Jobs Today",
        icon: "today-outline",
        tab: "HomeTab",
        screen: "MyJobs",
        roles: ["EMPLOYEE"],
      },
      { key: "home", label: "หน้าหลัก", labelEn: "Home", icon: "home-outline", tab: "HomeTab", screen: "HomeMenu" },
      {
        key: "inbox",
        label: "กล่องงานของฉัน",
        labelEn: "My Inbox",
        icon: "briefcase-outline",
        tab: "WorkOrdersTab",
        screen: "WorkOrderList",
        params: { inbox: true },
        badge: true,
      },
      // inbox: false ต้องส่งชัด ๆ — ไม่ส่งแล้วหน้ารายการเดิมยังถือ inbox: true จากกล่องงานไว้
      // กดใบงานซ่อมต่อจากกล่องงานจึงยังเห็นแค่กล่องงาน (ช่างเห็น 0 ใบทั้งที่ทีมมีใบค้าง)
      {
        key: "wo",
        label: "ใบงานซ่อม",
        labelEn: "Work Orders",
        icon: "clipboard-outline",
        tab: "WorkOrdersTab",
        screen: "WorkOrderList",
        params: { inbox: false },
      },
      { key: "dash", label: "ติดตามเครื่องเสีย", labelEn: "Machine Monitor", icon: "pulse-outline", tab: "HomeTab", screen: "MachineDashboard" },
      { key: "reports", label: "รายงาน", labelEn: "Reports", icon: "document-text-outline", tab: "HomeTab", screen: "ReportsMenu" },
      // ทุกคนดูได้ — ช่างรู้ว่าทีมไหนมีใคร · แอดมินลากแก้ได้ในหน้าเดียวกัน
      { key: "coverage", label: "ผังผู้รับผิดชอบ", labelEn: "Coverage Map", icon: "git-network-outline", tab: "HomeTab", screen: "CoverageMap" },
    ],
  },
  {
    title: "หน้างาน",
    items: [
      { key: "flow", label: "วินิจฉัยอาการเสีย", labelEn: "Diagnose", icon: "git-branch-outline", tab: "HomeTab", screen: "FlowList" },
      { key: "parts", label: "รายการอะไหล่", labelEn: "Spare Parts", icon: "cube-outline", tab: "HomeTab", screen: "SparePartList" },
      { key: "checkin", label: "รายงานตัวเข้าสาขา", labelEn: "Branch Check-in", icon: "location-outline", tab: "HomeTab", screen: "BranchCheckIn" },
      { key: "worklog", label: "บันทึกการทำงาน", labelEn: "Work Log", icon: "create-outline", tab: "HomeTab", screen: "WorkLogForm" },
      { key: "guides", label: "คู่มือแก้ปัญหา", labelEn: "Guides", icon: "book-outline", tab: "HistoryTab", screen: "GuideList" },
    ],
  },
  {
    // ยกมาจาก OTTERI FLEET — รวมไว้กลุ่มเดียว ช่างเห็นสองรายการแรก แอดมินเห็นครบ
    title: "รถ",
    items: [
      { key: "vehicle", label: "ลงทะเบียนใช้รถ", labelEn: "Vehicle Use", icon: "car-outline", tab: "HomeTab", screen: "VehicleCheckIn" },
      { key: "vehicleMine", label: "ประวัติการใช้รถของฉัน", labelEn: "My Trips", icon: "time-outline", tab: "HistoryTab", screen: "VehicleHistory" },
      { key: "fleetDash", label: "ภาพรวมรถ", labelEn: "Fleet Overview", icon: "speedometer-outline", tab: "AdminTab", screen: "FleetDashboard", roles: ["ADMIN"] },
      { key: "vehicleLogs", label: "ประวัติการใช้รถ", labelEn: "Trip Log", icon: "list-outline", tab: "AdminTab", screen: "VehicleLogAdmin", roles: ["ADMIN"] },
      { key: "vehicles", label: "ทะเบียน & ซ่อมบำรุง", labelEn: "Registry & Service", icon: "construct-outline", tab: "AdminTab", screen: "ManageVehicles", roles: ["ADMIN"] },
    ],
  },
  {
    title: "เอกสารและบัญชี",
    items: [
      { key: "transfer", label: "เอกสารขอโอนสินค้า", labelEn: "Transfer Request", icon: "swap-horizontal-outline", tab: "HomeTab", screen: "TransferDocument" },
      { key: "consumable", label: "เบิกของใช้สิ้นเปลือง", labelEn: "Consumables", icon: "file-tray-full-outline", tab: "HomeTab", screen: "ConsumableRequest" },
      { key: "history", label: "ประวัติ", labelEn: "History", icon: "time-outline", tab: "HistoryTab", screen: "HistoryMenu" },
      { key: "password", label: "เปลี่ยนรหัสผ่าน", labelEn: "Change Password", icon: "key-outline", tab: "HomeTab", screen: "ChangePassword" },
    ],
  },
  {
    title: "ผู้ดูแลระบบ",
    admin: true,
    items: [
      { key: "admin", label: "ระบบหลังบ้าน", labelEn: "Admin", icon: "settings-outline", tab: "AdminTab", screen: "AdminMenu" },
      { key: "review", label: "อนุมัติคำขอเบิก", labelEn: "Approvals", icon: "checkmark-circle-outline", tab: "AdminTab", screen: "ReviewRequests" },
      { key: "users", label: "สิทธิ์ผู้ใช้", labelEn: "Users & Access", icon: "people-outline", tab: "AdminTab", screen: "ManageUsers" },
      { key: "teams", label: "ทีมช่าง", labelEn: "Teams", icon: "people-circle-outline", tab: "AdminTab", screen: "ManageTeams" },
      { key: "branches", label: "จัดการข้อมูลสาขา", labelEn: "Branches", icon: "business-outline", tab: "AdminTab", screen: "ManageBranches" },
      { key: "backup", label: "สำรองข้อมูล", labelEn: "Backup", icon: "cloud-download-outline", tab: "AdminTab", screen: "Backup", superAdmin: true },
    ],
  },
];

/**
 * หน้าแอดมินที่ Admin Spare Part ไม่เห็น — ตำแหน่งนี้ดูได้ทุกอย่างแต่แก้ได้เฉพาะเคลมกับข้อมูลอะไหล่
 * (เจ้าของงานกำหนด ต.ค. 69) "ระบบหลังบ้าน" ยังอยู่ เพราะข้างในเหลือหน้าจัดการข้อมูลอะไหล่
 */
const PARTS_ADMIN_HIDDEN = new Set(["fleetDash", "vehicleLogs", "vehicles", "review", "users", "teams", "branches"]);

/** หน้าแรกของแต่ละแท็บ — ไปหน้าพวกนี้ต้องล้างหน้าที่ซ้อนอยู่ ไม่ใช่ซ้อนเพิ่ม */
const TAB_ROOTS = new Set(["PlanBoard", "MyJobs", "HomeMenu", "WorkOrderList", "HistoryMenu", "AdminMenu"]);

function currentKey(): string | null {
  if (!navigationRef.isReady()) return null;
  const route = navigationRef.getCurrentRoute();
  if (!route) return null;
  const inbox = (route.params as { inbox?: boolean } | undefined)?.inbox;
  for (const g of GROUPS) {
    for (const it of g.items) {
      if (it.screen !== route.name) continue;
      if (it.key === "inbox" && !inbox) continue;
      if (it.key === "wo" && inbox) continue;
      return it.key;
    }
  }
  return null;
}

function navigateTo(it: Item) {
  if (!navigationRef.isReady()) return;
  // initial: false ให้ปุ่มย้อนกลับพากลับไปหน้าแรกของแท็บ ไม่ใช่หลุดออกจากแท็บ
  const nested = TAB_ROOTS.has(it.screen)
    ? { screen: it.screen, params: it.params }
    : { screen: it.screen, params: it.params, initial: false };
  (navigationRef.navigate as (tab: Tab, p: object) => void)(it.tab, nested);
}

function MenuContent({
  active,
  inbox,
  onPick,
  rail,
}: {
  active: string | null;
  inbox: number;
  onPick: (it: Item) => void;
  /** แถบไอคอนตอนเมนูหด — ไม่มีชื่อ ไม่มีหัวกลุ่ม */
  rail?: boolean;
}) {
  const { user } = useAuth();
  const go = onPick;
  const closed = useClosedGroups();
  return (
    // nativeID = id บนเว็บ — ลากรีเฟรช (PullToRefresh) ไม่จับนิ้วที่อยู่ในเมนู ไม่งั้นเมนูเลื่อนลงตามนิ้ว
    <ScrollView nativeID="side-menu" style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {GROUPS.filter((g) => !g.admin || user?.role === "ADMIN").map((g) => {
            const items = g.items
              .filter((it) => !it.roles || (user && it.roles.includes(user.role)))
              .filter((it) => !(user?.partsAdmin && PARTS_ADMIN_HIDDEN.has(it.key)))
              .filter((it) => !it.superAdmin || user?.superAdmin);
            if (!items.length) return null;
            // แถบไอคอน (เมนูหด) ไม่มีหัวกลุ่มให้กด จึงโชว์ทุกปุ่มเสมอ
            const shut = !rail && closed.has(g.title);
            const shown = shut ? items.filter((it) => it.key === active) : items;
            // ตัวเลขกล่องงานต้องไม่หายไปกับกลุ่มที่ย่อ — ย้ายไปติดที่หัวกลุ่มแทน
            const hiddenBadge = shut && items.some((it) => it.badge && it.key !== active) ? inbox : 0;
            return (
            <View key={g.title}>
              {rail ? (
                <View style={styles.railSep} />
              ) : (
                <TouchableOpacity
                  style={styles.group}
                  activeOpacity={0.7}
                  onPress={() => toggleGroup(g.title)}
                  accessibilityLabel={`${shut ? "กาง" : "ย่อ"}กลุ่ม ${g.title}`}
                >
                  <View style={styles.groupDot} />
                  <Text style={[styles.groupText, { flex: 1 }]}>{g.title}</Text>
                  {hiddenBadge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{hiddenBadge}</Text>
                    </View>
                  ) : null}
                  {shut ? <Text style={styles.groupCount}>{items.length}</Text> : null}
                  <Ionicons name={shut ? "chevron-down" : "chevron-up"} size={16} color={colors.sideDim} />
                </TouchableOpacity>
              )}
              {shown.map((it) => {
                const on = active === it.key;
                const n = it.badge ? inbox : 0;
                return (
                  <TouchableOpacity
                    key={it.key}
                    style={[styles.item, rail && styles.itemRail, on && styles.itemOn]}
                    activeOpacity={0.75}
                    onPress={() => go(it)}
                    accessibilityLabel={it.label}
                    {...(rail && Platform.OS === "web" ? ({ title: it.label } as object) : null)}
                  >
                    <Ionicons name={it.icon} size={22} color={on ? "#fff" : colors.sideInk} />
                    {rail ? (
                      n ? (
                        <View style={[styles.badge, styles.badgeRail, on && styles.badgeOn]}>
                          <Text style={[styles.badgeText, on && styles.badgeTextOn]}>{n}</Text>
                        </View>
                      ) : null
                    ) : (
                    <>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.label, on && styles.labelOn]}>{it.label}</Text>
                      <Text style={[styles.labelEn, on && styles.labelEnOn]}>{it.labelEn}</Text>
                    </View>
                    {n ? (
                      <View style={[styles.badge, on && styles.badgeOn]}>
                        <Text style={[styles.badgeText, on && styles.badgeTextOn]}>{n}</Text>
                      </View>
                    ) : null}
                    </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            );
          })}
          {BUILD_AT && !rail ? (
            <View style={styles.foot}>
              <View style={styles.footHead}>
                <Ionicons name="cloud-done-outline" size={16} color={colors.primary} />
                <Text style={styles.footTitle}>รุ่น {BUILD_COMMIT}</Text>
              </View>
              <Text style={styles.footText}>
                build{" "}
                {new Date(BUILD_AT).toLocaleString("th-TH", {
                  timeZone: "Asia/Bangkok",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </Text>
            </View>
          ) : null}
    </ScrollView>
  );
}

/**
 * เมนูที่ค้างไว้ด้านซ้ายบนจอคอม
 *
 * ฟังการเปลี่ยนหน้าเองเพื่อย้ายแถบฟ้าตามหน้าที่เปิด และโหลดตัวเลขกล่องงานใหม่
 * ทุกครั้งที่เปลี่ยนหน้า — ไปปิดงานมาแล้วกลับมา ตัวเลขต้องลดลงทันที
 */
export function DockedSideMenu() {
  const { collapsed: rail } = useDocked();
  const [active, setActive] = useState<string | null>(currentKey());
  const [inbox, setInbox] = useState(0);
  // ยืด/หดแบบค่อย ๆ ไม่ตัดฉับ ตามต้นแบบ — เห็นว่าเมนูไปไหน ไม่ใช่หายวับไป
  const width = useRef(new Animated.Value(rail ? RAIL_WIDTH : DOCK_WIDTH)).current;
  useEffect(() => {
    spring(width, rail ? RAIL_WIDTH : DOCK_WIDTH, "resize").start();
  }, [rail, width]);
  useEffect(() => {
    const refresh = () => {
      setActive(currentKey());
      api
        .get<{ inbox: number }>("/work-orders/inbox-count")
        .then((r) => setInbox(r.data.inbox))
        .catch(() => undefined);
    };
    refresh();
    return navigationRef.addListener("state", refresh);
  }, []);
  return (
    <Animated.View style={[styles.docked, { width }]}>
      <View style={[styles.dockHead, rail && styles.dockHeadRail]}>
        <MenuButton />
        {rail ? null : <Text style={styles.dockHeadText}>ย่อเมนู</Text>}
      </View>
      <MenuContent active={active} inbox={inbox} onPick={navigateTo} rail={rail} />
    </Animated.View>
  );
}

const WIDTH = 300;

export default function SideMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [inbox, setInbox] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const x = useRef(new Animated.Value(-WIDTH)).current;

  useEffect(() => {
    setOpenGlobal = setOpen;
    return () => {
      setOpenGlobal = null;
    };
  }, []);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setActive(currentKey());
      // ตัวเลขบนกล่องงานโหลดตอนเปิดเมนู ไม่ใช่ค้างค่าเก่าจากตอนเข้าแอป
      api
        .get<{ inbox: number }>("/work-orders/inbox-count")
        .then((r) => setInbox(r.data.inbox))
        .catch(() => undefined);
    }
    // เปิดแบบสปริงตามนิ้ว ปิดเร่งออกเร็ว ๆ — จังหวะเดียวกับหน้าต่างอื่นในแอป (utils/motion)
    (open ? spring(x, 0, "push") : timing(x, -WIDTH, 220, EXIT_EASE)).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, x]);

  if (!mounted) return null;

  function go(it: Item) {
    setOpen(false);
    navigateTo(it);
  }

  const backdrop = x.interpolate({ inputRange: [-WIDTH, 0], outputRange: [0, 1] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View nativeID="side-menu-backdrop" style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="ปิดเมนู" />
      </Animated.View>
      <Animated.View
        style={[styles.panel, { paddingTop: spacing.sm, transform: [{ translateX: x }] }]}
      >
        <PanelHead />
        <MenuContent active={active} inbox={inbox} onPick={go} />
        <PanelTools onLeave={() => setOpen(false)} />
      </Animated.View>
    </View>
  );
}

const ROLE_TH: Record<string, string> = { ADMIN: "แอดมิน", SUPERVISOR: "หัวหน้าภาค", EMPLOYEE: "ช่าง" };

/**
 * หัวเมนูเลื่อนออก (จอแคบ): โลโก้กับคนที่ล็อกอิน — จอแคบไม่มีแถบโลโก้แล้ว (ดู NarrowBar ใน MainNavigator)
 * แบรนด์จึงมาอยู่ที่นี่ ให้ยังเห็นว่าเป็นแอปของ OTTERI และใครใช้อยู่
 */
function PanelHead() {
  const { user } = useAuth();
  return (
    <View style={styles.panelHead}>
      <View style={styles.panelLogo}>
        <Image source={require("../../assets/logo-otter.png")} style={{ width: "100%", height: "100%" }} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.panelBrand, headingFont]}>OTTERI</Text>
        {user ? (
          <Text style={styles.panelWho} numberOfLines={1}>
            {user.name} ·{" "}
            {user.superAdmin ? "Super Admin" : user.partsAdmin ? "Admin Spare Part" : ROLE_TH[user.role] ?? user.role}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** โหมดมืดกับออกจากระบบ (จอแคบ) — ย้ายมาจากแถบบน ใช้ไม่บ่อย ไม่ควรกินที่หัวจอทุกหน้า */
function PanelTools({ onLeave }: { onLeave: () => void }) {
  const { logout } = useAuth();
  return (
    <View style={styles.panelTools}>
      <ThemeToggle />
      <View style={{ flex: 1 }} />
      <TouchableOpacity
        style={styles.panelLogout}
        accessibilityLabel="ออกจากระบบ"
        onPress={() => {
          onLeave();
          showAlert("ยืนยัน", "ต้องการออกจากระบบ?", [
            { text: "ยกเลิก", style: "cancel" },
            { text: "ตกลง", onPress: logout },
          ]);
        }}
      >
        <Ionicons name="log-out-outline" size={18} color="#fff" />
        <Text style={styles.panelLogoutText}>ออกจากระบบ</Text>
      </TouchableOpacity>
    </View>
  );
}

/** ปุ่มสามขีด — จอคอมอยู่หัวเมนูข้าง (หด/ยืด) · จอแคบอยู่แถบชื่อหน้า (เปิดเมนูเลื่อนออก) */
export function MenuButton() {
  const { canDock, collapsed: c } = useDocked();
  return (
    <TouchableOpacity
      style={[styles.menuBtn, canDock && styles.menuBtnDock]}
      onPress={() => (canDock ? setCollapsed(!c) : sideMenu.open())}
      accessibilityLabel={canDock ? (c ? "ขยายเมนู" : "ย่อเมนู") : "เปิดเมนู"}
    >
      <Ionicons name="menu" size={24} color={canDock ? "#fff" : colors.navy} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.42)" },
  // เมนูกรมท่าตามแนวทางออกแบบ ต.ค. 69 — เปลี่ยนแค่สี ขนาด/ตำแหน่งปุ่มเหมือนเดิมทุกอย่าง
  // (เจ้าของงานสั่งไว้: เปลี่ยนหน้าตา ไม่ย้ายปุ่ม คนใช้จำตำแหน่งได้แล้ว)
  docked: {
    backgroundColor: colors.sideBg,
    borderRightWidth: 1,
    borderRightColor: colors.sideLine,
    paddingTop: spacing.md,
    overflow: "hidden",
  },
  dockHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    marginBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.sideLine,
  },
  dockHeadRail: { justifyContent: "center", paddingHorizontal: 0 },
  dockHeadText: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.sideInk },
  railSep: { height: 1, backgroundColor: colors.sideLine, marginVertical: spacing.sm, marginHorizontal: 6 },
  itemRail: { justifyContent: "center", paddingHorizontal: 0 },
  badgeRail: { position: "absolute", top: 0, right: 2, minWidth: 18, height: 18, paddingHorizontal: 5 },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: WIDTH,
    maxWidth: "86%",
    backgroundColor: colors.sideBg,
    borderTopRightRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    ...shadow.raised,
  },
  scroll: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  group: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "transparent",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  groupDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  groupCount: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.sideDim },
  groupText: { fontSize: 12, lineHeight: 18, fontWeight: "800", color: colors.sideDim, letterSpacing: 0.5 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    marginVertical: 1,
  },
  itemOn: { backgroundColor: colors.primary, ...shadow.raised },
  label: { fontSize: 15, lineHeight: 22, fontWeight: "600", color: colors.sideInk },
  labelOn: { color: "#fff" },
  labelEn: { fontSize: 11, lineHeight: 16, color: colors.sideDim },
  labelEnOn: { color: "rgba(255,255,255,0.88)" },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeOn: { backgroundColor: "#fff" },
  badgeText: { color: "#fff", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  badgeTextOn: { color: colors.danger },
  foot: { marginTop: spacing.lg, padding: 14, borderRadius: 14, backgroundColor: colors.sideLine },
  footHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  footTitle: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: "#fff" },
  footText: { fontSize: 12, lineHeight: 18, color: colors.sideDim },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sky50,
  },
  // จอคอมปุ่มนี้อยู่บนเมนูกรมท่า · จอแคบอยู่แถบชื่อหน้าพื้นขาว สีจึงต่างกัน
  menuBtnDock: { backgroundColor: colors.sideLine },
  panelHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.sideLine,
  },
  panelLogo: { width: 40, height: 40, borderRadius: 12, overflow: "hidden", backgroundColor: "#fff" },
  panelBrand: { fontSize: 18, lineHeight: 24, fontWeight: "800", color: "#fff" },
  panelWho: { fontSize: 12, lineHeight: 18, color: colors.sideDim },
  panelTools: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.sideLine,
  },
  panelLogout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.sideLine,
  },
  panelLogoutText: { color: "#fff", fontSize: 14, lineHeight: 20, fontWeight: "700" },
});
