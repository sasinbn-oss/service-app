/**
 * ของบนแถบหัวจอคอมที่เป็นของใหม่ (แบบที่เจ้าของงานส่งมา พ.ย. 69): ปุ่มเพิ่มใบงาน · เมนูใต้ชื่อผู้ใช้
 * ตัวแถบอยู่ใน AppTopBar (MainNavigator) — ช่องค้นหา · มุมมองผู้ใช้งาน · คนออนไลน์ · กระดิ่ง · ? · รีเฟรช
 *
 * แท็บลัดกับสลับ "งานของฉัน / ภาพรวม" ในแบบเอาออกแล้ว (เจ้าของงานสั่ง — มุมซ้ายบนเป็นช่องค้นหาแทน)
 * โหมดมืดกับออกจากระบบอยู่ในเมนูใต้ชื่อ ใช้ไม่บ่อย ไม่ควรกินที่บนแถบ
 *
 * เมนูใต้ชื่อเป็นแผ่นที่กางในที่ ไม่ใช่ Modal — Modal ซ้อน Modal บนเว็บไม่น่าเชื่อถือ (ดู CLAUDE.md)
 */
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import ThemeToggle from "./ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { navigationRef } from "../navigation/navigationRef";
import { colors, headingFont } from "../theme";
import { showAlert } from "../utils/alert";
import { sessionRoleLabel } from "../utils/roles";
import { howtoTarget } from "../utils/howtoTarget";

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

/** รูป (ตัวอักษรแรก) + ชื่อ + ตำแหน่ง — กดแล้วกางเมนู: โหมดมืด · ออกจากระบบ */
export function ProfileMenu({ showName }: { showName: boolean }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
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
    </View>
  );
}

function Row({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7} accessibilityLabel={label}>
      <Ionicons name={icon} size={18} color={danger ? colors.dangerInk : colors.body} />
      <Text style={[styles.rowText, danger && { color: colors.dangerInk }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
