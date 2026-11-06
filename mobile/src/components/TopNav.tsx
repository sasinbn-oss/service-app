/**
 * แถบหัวแบบใหม่บนจอคอม (ตัวอย่าง พ.ย. 69 ตามแบบที่เจ้าของงานส่งมา)
 *
 * แบบมี: แท็บลัด · สลับ "งานของฉัน / ภาพรวม" · ปุ่มสร้างใบงาน · กระดิ่ง · ? · รูปกับชื่อผู้ใช้
 * ปรับให้เข้ากับระบบเรา:
 * - แท็บลัดหยิบจากเมนูข้าง (แผนงาน · ใบงานซ่อม · ติดตามเครื่องเสีย · รายงาน) — คนที่ไม่เห็นเมนูไหนก็ไม่เห็นแท็บนั้น
 * - "งานของฉัน" = กล่องงานของฉัน (ตัวเลขเดียวกับป้ายในเมนูข้าง) · "ภาพรวม" = หน้าหลัก
 * - ปุ่มที่เคยเรียงบนแถบ (ดูในฐานะ · การใช้งาน · โหมดมืด · ออกจากระบบ) ย้ายเข้าเมนูใต้ชื่อผู้ใช้ — แถบเหลือแค่ที่ใช้ทุกวัน
 * - รีเฟรชยังอยู่บนแถบเป็นไอคอนคู่กับ ? (ใช้บ่อย) · กระดิ่งยังไม่ใส่ เพราะระบบยังไม่มีการแจ้งเตือน (ถามเจ้าของงานแล้ว)
 *
 * เมนูใต้ชื่อเป็นแผ่นที่กางในที่ ไม่ใช่ Modal — Modal ซ้อน Modal บนเว็บไม่น่าเชื่อถือ (ดู CLAUDE.md)
 */
import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import ThemeToggle from "./ThemeToggle";
import { activeMenuKey, menuItemsFor, openMenuKey } from "./SideMenu";
import { canViewUsage, openUsage, useOnlineCount } from "./UsageButton";
import { ViewAsPicker, canViewAs } from "./ViewAs";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { navigationRef } from "../navigation/navigationRef";
import { colors, headingFont } from "../theme";
import { showAlert } from "../utils/alert";
import { sessionRoleLabel } from "../utils/roles";
import { howtoTarget } from "../utils/howtoTarget";

const TAB_KEYS = ["plan", "wo", "dash", "reports"];

/** เมนูที่เปิดอยู่ + ตัวเลขกล่องงาน — อ่านใหม่ทุกครั้งที่เปลี่ยนหน้า แบบเดียวกับเมนูข้าง */
function useNavState() {
  const [active, setActive] = useState<string | null>(activeMenuKey());
  const [inbox, setInbox] = useState<number | null>(null);
  useEffect(() => {
    const refresh = () => {
      setActive(activeMenuKey());
      api
        .get<{ inbox: number }>("/work-orders/inbox-count", { loadingText: false })
        .then((r) => setInbox(r.data.inbox))
        .catch(() => undefined);
    };
    refresh();
    return navigationRef.addListener("state", refresh);
  }, []);
  return { active, inbox };
}

export function TopTabs() {
  const { user } = useAuth();
  const { active } = useNavState();
  const tabs = menuItemsFor(user, TAB_KEYS);
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = active === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, on && styles.tabOn]}
            onPress={() => openMenuKey(t.key)}
            accessibilityLabel={`ไปหน้า ${t.label}`}
            // react-native-web ไม่แปลง accessibilityState เป็น aria-selected — ใส่เองให้เทสต์อ่านได้ (ดู FilterBar)
            {...({ "aria-selected": on } as object)}
          >
            <Ionicons name={t.icon} size={18} color={on ? colors.primaryInk : colors.textMuted} />
            <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** สลับ "งานของฉัน" (กล่องงาน) กับ "ภาพรวม" (หน้าหลัก) — ตามแบบ "งานของฉัน (My Queue) | ภาพรวมศูนย์ปฏิบัติการ" */
export function QueueSwitch() {
  const { user } = useAuth();
  const { active, inbox } = useNavState();
  const items = menuItemsFor(user, ["inbox", "home"]);
  if (items.length < 2) return null;
  return (
    <View style={styles.seg}>
      {items.map((it) => {
        const on = active === it.key;
        const label = it.key === "inbox" ? `งานของฉัน${inbox ? ` (${inbox})` : ""}` : "ภาพรวม";
        return (
          <TouchableOpacity
            key={it.key}
            style={[styles.segItem, on && styles.segOn]}
            onPress={() => openMenuKey(it.key)}
            accessibilityLabel={it.key === "inbox" ? `กล่องงานของฉัน ${inbox ?? 0} ใบ` : "ภาพรวม (หน้าหลัก)"}
            {...({ "aria-selected": on } as object)}
          >
            <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** ปุ่มเพิ่มใบงานย้ายจากหัวหน้ารายการขึ้นแถบหัว — กดได้จากทุกหน้า · Admin Spare Part เปิดใบงานไม่ได้ */
export function CreateOrderButton() {
  const { user } = useAuth();
  if (!user || user.partsAdmin) return null;
  return (
    <TouchableOpacity
      style={styles.create}
      onPress={() => {
        if (!navigationRef.isReady()) return;
        (navigationRef.navigate as (tab: string, p: object) => void)("WorkOrdersTab", { screen: "WorkOrderForm", initial: false });
      }}
      activeOpacity={0.85}
      accessibilityLabel="เพิ่มใบงาน"
      {...howtoTarget("orders.add")}
    >
      <Ionicons name="add" size={20} color="#fff" />
      <Text style={styles.createText}>เพิ่มใบงาน</Text>
    </TouchableOpacity>
  );
}

/** รูป (ตัวอักษรแรก) + ชื่อ + ตำแหน่ง — กดแล้วกางเมนู: ดูในฐานะ · การใช้งาน · โหมดมืด · ออกจากระบบ */
export function ProfileMenu({ showName }: { showName: boolean }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const usage = canViewUsage(user);
  const online = useOnlineCount(usage);
  if (!user) return null;
  const close = () => setOpen(false);
  return (
    <View style={styles.profileWrap}>
      <TouchableOpacity
        style={styles.profile}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.8}
        accessibilityLabel={`เมนูผู้ใช้ ${user.name}`}
        {...({ "aria-expanded": open } as object)}
      >
        <View style={styles.avatar}>
          <Text style={[styles.avatarText, headingFont]}>{user.name.trim().charAt(0)}</Text>
        </View>
        {showName ? (
          <View style={styles.who}>
            <Text style={styles.whoName} numberOfLines={1}>
              {user.name}
            </Text>
            <Text style={styles.whoRole} numberOfLines={1}>
              {sessionRoleLabel(user)}
            </Text>
          </View>
        ) : null}
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
      </TouchableOpacity>
      {open ? (
        <>
          {/* กดที่อื่นแล้วเมนูปิด — แผ่นใสเต็มจอใต้เมนู (fixed บนเว็บ ไม่งั้นติดอยู่ในแถบหัว) */}
          <Pressable style={[styles.scrim, Platform.OS === "web" ? ({ position: "fixed" } as object) : null]} onPress={close} />
          <View style={styles.panel} accessibilityLabel="เมนูผู้ใช้">
            <View style={styles.panelHead}>
              <Text style={styles.panelName}>{user.name}</Text>
              <Text style={styles.panelRole}>{sessionRoleLabel(user)}</Text>
            </View>
            {canViewAs(user) ? (
              <Row
                icon="eye-outline"
                label="ดูในฐานะ…"
                onPress={() => {
                  close();
                  setPicking(true);
                }}
              />
            ) : null}
            {usage ? (
              <Row
                icon="pulse-outline"
                label={`การใช้งาน · ${online ?? "–"} คนออนไลน์`}
                dot
                onPress={() => {
                  close();
                  openUsage();
                }}
              />
            ) : null}
            {Platform.OS === "web" ? (
              <View style={styles.row}>
                <Ionicons name="moon-outline" size={18} color={colors.body} />
                <Text style={styles.rowText}>โหมดมืด</Text>
                <View style={{ flex: 1 }} />
                <ThemeToggle />
              </View>
            ) : null}
            <View style={styles.sep} />
            <Row
              icon="log-out-outline"
              label="ออกจากระบบ"
              danger
              onPress={() => {
                close();
                showAlert("ยืนยัน", "ต้องการออกจากระบบ?", [
                  { text: "ยกเลิก", style: "cancel" },
                  { text: "ตกลง", onPress: logout },
                ]);
              }}
            />
          </View>
        </>
      ) : null}
      {picking ? <ViewAsPicker onClose={() => setPicking(false)} /> : null}
    </View>
  );
}

function Row({
  icon,
  label,
  onPress,
  danger,
  dot,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  dot?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7} accessibilityLabel={label}>
      <Ionicons name={icon} size={18} color={danger ? colors.dangerInk : colors.body} />
      {dot ? <View style={styles.onlineDot} /> : null}
      <Text style={[styles.rowText, danger && { color: colors.dangerInk }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // ขีดใต้แท็บชิดเส้นล่างของแถบหัว (แถบเว้นล่าง 10) ตามแบบ
  tabs: { flexDirection: "row", alignItems: "stretch", alignSelf: "stretch", gap: 4, marginLeft: 28, marginBottom: -11 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderBottomWidth: 2.5,
    borderBottomColor: "transparent",
  },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: 14.5, lineHeight: 22, fontWeight: "600", color: colors.textMuted },
  tabTextOn: { color: colors.primaryInk, fontWeight: "800" },

  seg: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginRight: 10,
  },
  segItem: { height: 32, paddingHorizontal: 14, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent" },
  segOn: { backgroundColor: colors.card, borderColor: colors.primaryLine },
  segText: { fontSize: 13.5, lineHeight: 20, fontWeight: "600", color: colors.textMuted },
  segTextOn: { color: colors.primaryInk, fontWeight: "800" },

  create: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: colors.navyFill,
    marginRight: 6,
  },
  createText: { color: "#fff", fontSize: 14.5, lineHeight: 22, fontWeight: "800" },

  profileWrap: { position: "relative", zIndex: 30, marginLeft: 6 },
  profile: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4, paddingLeft: 12, paddingRight: 6, borderLeftWidth: 1, borderLeftColor: colors.border },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  who: { maxWidth: 190 },
  whoName: { fontSize: 14.5, lineHeight: 20, fontWeight: "800", color: colors.text },
  whoRole: { fontSize: 12, lineHeight: 17, color: colors.textMuted },

  scrim: { position: "absolute", top: -2000, left: -4000, right: -4000, bottom: -4000, zIndex: 1 },
  panel: {
    position: "absolute",
    top: 52,
    right: 0,
    width: 280,
    zIndex: 2,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    shadowColor: "#0B2540",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  panelHead: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 4 },
  panelName: { fontSize: 15, lineHeight: 22, fontWeight: "800", color: colors.text },
  panelRole: { fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, paddingHorizontal: 16 },
  rowText: { fontSize: 14, lineHeight: 21, fontWeight: "600", color: colors.text },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success, marginLeft: -4 },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
});
