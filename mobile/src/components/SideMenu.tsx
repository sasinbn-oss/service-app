import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { BUILD_AT, BUILD_COMMIT } from "../buildInfo";
import { navigationRef } from "../navigation/navigationRef";
import { MainTabParamList } from "../navigation/types";
import { colors, radius, shadow, spacing } from "../theme";

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

/**
 * บนจอคอมปุ่มสามขีดยุบ/ขยายเมนูที่ค้างไว้ และจำค่าไว้ — คนที่ชอบจอโล่ง
 * ไม่ต้องกดยุบใหม่ทุกครั้งที่เปิดเว็บ
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
  return { canDock, docked: canDock && !c };
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
      { key: "wo", label: "ใบงานซ่อม", labelEn: "Work Orders", icon: "clipboard-outline", tab: "WorkOrdersTab", screen: "WorkOrderList" },
      { key: "dash", label: "ติดตามเครื่องเสีย", labelEn: "Machine Monitor", icon: "pulse-outline", tab: "HomeTab", screen: "MachineDashboard" },
      { key: "reports", label: "รายงาน", labelEn: "Reports", icon: "document-text-outline", tab: "HomeTab", screen: "ReportsMenu" },
    ],
  },
  {
    title: "หน้างาน",
    items: [
      { key: "flow", label: "วินิจฉัยอาการเสีย", labelEn: "Diagnose", icon: "git-branch-outline", tab: "HomeTab", screen: "FlowList" },
      { key: "parts", label: "รายการอะไหล่", labelEn: "Spare Parts", icon: "cube-outline", tab: "HomeTab", screen: "SparePartList" },
      { key: "checkin", label: "รายงานตัวเข้าสาขา", labelEn: "Branch Check-in", icon: "location-outline", tab: "HomeTab", screen: "BranchCheckIn" },
      { key: "worklog", label: "บันทึกการทำงาน", labelEn: "Work Log", icon: "create-outline", tab: "HomeTab", screen: "WorkLogForm" },
      { key: "vehicle", label: "ลงทะเบียนใช้รถ", labelEn: "Vehicle Use", icon: "car-outline", tab: "HomeTab", screen: "VehicleCheckIn" },
      { key: "guides", label: "คู่มือแก้ปัญหา", labelEn: "Guides", icon: "book-outline", tab: "HistoryTab", screen: "GuideList" },
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
      { key: "vehicles", label: "จัดการข้อมูลรถ", labelEn: "Fleet Inventory", icon: "bus-outline", tab: "AdminTab", screen: "ManageVehicles" },
      { key: "branches", label: "จัดการข้อมูลสาขา", labelEn: "Branches", icon: "business-outline", tab: "AdminTab", screen: "ManageBranches" },
    ],
  },
];

/** หน้าแรกของแต่ละแท็บ — ไปหน้าพวกนี้ต้องล้างหน้าที่ซ้อนอยู่ ไม่ใช่ซ้อนเพิ่ม */
const TAB_ROOTS = new Set(["HomeMenu", "WorkOrderList", "HistoryMenu", "AdminMenu"]);

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
}: {
  active: string | null;
  inbox: number;
  onPick: (it: Item) => void;
}) {
  const { user } = useAuth();
  const go = onPick;
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {GROUPS.filter((g) => !g.admin || user?.role === "ADMIN").map((g) => (
            <View key={g.title}>
              <View style={styles.group}>
                <View style={styles.groupDot} />
                <Text style={styles.groupText}>{g.title}</Text>
              </View>
              {g.items.map((it) => {
                const on = active === it.key;
                const n = it.badge ? inbox : 0;
                return (
                  <TouchableOpacity
                    key={it.key}
                    style={[styles.item, on && styles.itemOn]}
                    activeOpacity={0.75}
                    onPress={() => go(it)}
                  >
                    <Ionicons name={it.icon} size={22} color={on ? "#fff" : colors.navy} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.label, on && styles.labelOn]}>{it.label}</Text>
                      <Text style={[styles.labelEn, on && styles.labelEnOn]}>{it.labelEn}</Text>
                    </View>
                    {n ? (
                      <View style={[styles.badge, on && styles.badgeOn]}>
                        <Text style={[styles.badgeText, on && styles.badgeTextOn]}>{n}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          {BUILD_AT ? (
            <View style={styles.foot}>
              <View style={styles.footHead}>
                <Ionicons name="cloud-done-outline" size={16} color={colors.primaryInk} />
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
  const [active, setActive] = useState<string | null>(currentKey());
  const [inbox, setInbox] = useState(0);
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
    <View style={styles.docked}>
      <MenuContent active={active} inbox={inbox} onPick={navigateTo} />
    </View>
  );
}

const WIDTH = 300;

export default function SideMenu() {
  const insets = useSafeAreaInsets();
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
    Animated.timing(x, {
      toValue: open ? 0 : -WIDTH,
      duration: 200,
      useNativeDriver: Platform.OS !== "web",
    }).start(({ finished }) => {
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
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="ปิดเมนู" />
      </Animated.View>
      <Animated.View
        style={[styles.panel, { paddingTop: insets.top + spacing.lg, transform: [{ translateX: x }] }]}
      >
        <MenuContent active={active} inbox={inbox} onPick={go} />
      </Animated.View>
    </View>
  );
}

/** ปุ่มสามขีดบนแถบบน */
export function MenuButton() {
  const { canDock, docked } = useDocked();
  return (
    <TouchableOpacity
      style={styles.menuBtn}
      onPress={() => (canDock ? setCollapsed(docked) : sideMenu.open())}
      accessibilityLabel="เปิดเมนู"
    >
      <Ionicons name="menu" size={24} color={colors.navy} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.42)" },
  docked: {
    width: DOCK_WIDTH,
    backgroundColor: colors.card,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingTop: spacing.sm,
  },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: WIDTH,
    maxWidth: "86%",
    backgroundColor: colors.card,
    borderTopRightRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    ...shadow.raised,
  },
  scroll: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  group: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  groupDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  groupText: { fontSize: 12, lineHeight: 18, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.5 },
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
  label: { fontSize: 15, lineHeight: 22, fontWeight: "600", color: colors.body },
  labelOn: { color: "#fff" },
  labelEn: { fontSize: 11, lineHeight: 16, color: colors.textMuted },
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
  foot: { marginTop: spacing.lg, padding: 14, borderRadius: 14, backgroundColor: colors.background },
  footHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  footTitle: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.text },
  footText: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sky50,
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
});
