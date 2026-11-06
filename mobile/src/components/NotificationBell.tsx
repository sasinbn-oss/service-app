/**
 * กระดิ่งงานเข้าใหม่ (ตัวอย่าง พ.ย. 69 · เจ้าของงานขอ "งานที่เพิ่งเด้งเข้ามาและยังไม่ได้เปิดดู ขึ้นตัวเลข")
 *
 * ตัวเลข = ใบในกล่องงานของเราที่เข้าขั้นปัจจุบันหลังจากเราเปิดดูครั้งล่าสุด (GET /work-orders/bell)
 * เปิดใบแล้วหายจากกระดิ่งเอง (หน้าใบงานบันทึกว่าเปิดดู) · ใบเดินขั้นมาถึงคิวเราอีกรอบ = ขึ้นใหม่
 * ถามใหม่ทุกครั้งที่เปลี่ยนหน้าและทุก 30 วินาที · แผ่นรายการกางในที่ ไม่ใช่ Modal (CLAUDE.md)
 */
import React, { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { api } from "../api/client";
import { navigationRef } from "../navigation/navigationRef";
import { colors, headingFont } from "../theme";

interface BellItem {
  id: number;
  code: string;
  title: string;
  branch: string;
  statusLabel: string;
  urgent: boolean;
  at: string;
}

function agoText(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return "เมื่อสักครู่";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  // มือถือ: แผ่นรายการเต็มความกว้างจอใต้แถบหัว (กว้าง 420 ล้นจอ 390)
  const narrow = useWindowDimensions().width < 640;
  const [data, setData] = useState<{ count: number; items: BellItem[] } | null>(null);
  const load = useCallback(() => {
    api
      .get<{ count: number; items: BellItem[] }>("/work-orders/bell", { loadingText: false })
      .then((r) => setData(r.data))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    const off = navigationRef.addListener("state", load);
    const t = setInterval(load, 30_000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [load]);

  const count = data?.count ?? 0;
  const go = (it: BellItem) => {
    setOpen(false);
    if (!navigationRef.isReady()) return;
    (navigationRef.navigate as (tab: string, p: object) => void)("WorkOrdersTab", { screen: "WorkOrderDetail", params: { id: it.id }, initial: false });
  };
  const seenAll = () => {
    api
      .post<{ count: number; items: BellItem[] }>("/work-orders/bell/seen-all", {}, { loadingText: false })
      .then((r) => setData(r.data))
      .catch(() => undefined);
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => {
          if (!open) load();
          setOpen((v) => !v);
        }}
        accessibilityLabel={`งานเข้าใหม่${count ? ` ${count} ใบ ยังไม่ได้เปิดดู` : ""}`}
      >
        <Ionicons name="notifications-outline" size={22} color={colors.body} />
        {count ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
      {open ? (
        <>
          <Pressable style={[styles.scrim, Platform.OS === "web" ? ({ position: "fixed" } as object) : null]} onPress={() => setOpen(false)} />
          <View style={[styles.panel, narrow && [styles.panelNarrow, Platform.OS === "web" ? ({ position: "fixed" } as object) : null]]} accessibilityLabel="รายการงานเข้าใหม่">
            <View style={styles.head}>
              <Text style={[styles.title, headingFont]}>งานเข้าใหม่</Text>
              <Text style={styles.sub}>{count ? `ยังไม่ได้เปิดดู ${count} ใบ` : "เปิดดูครบแล้ว"}</Text>
              <View style={{ flex: 1 }} />
              {count ? (
                <TouchableOpacity onPress={seenAll} accessibilityLabel="ทำเครื่องหมายว่าเปิดดูแล้วทั้งหมด">
                  <Text style={styles.all}>อ่านแล้วทั้งหมด</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {!data || data.items.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="notifications-off-outline" size={30} color={colors.textFaint} />
                <Text style={styles.emptyText}>ไม่มีงานใหม่ที่ยังไม่ได้เปิดดู</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 480 }}>
                {data.items.map((it) => (
                  <TouchableOpacity key={it.id} style={styles.item} onPress={() => go(it)} activeOpacity={0.7} accessibilityLabel={`งานเข้าใหม่ ${it.code}`}>
                    <View style={[styles.icon, it.urgent && styles.iconUrgent]}>
                      <Ionicons name={it.urgent ? "flash" : "clipboard-outline"} size={18} color={it.urgent ? colors.dangerInk : colors.primaryInk} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.row}>
                        <Text style={styles.code}>{it.code}</Text>
                        {it.urgent ? (
                          <View style={styles.urgentPill}>
                            <Text style={styles.urgentText}>ด่วน</Text>
                          </View>
                        ) : null}
                        <View style={{ flex: 1 }} />
                        <Text style={styles.ago}>{agoText(it.at)}</Text>
                      </View>
                      <Text style={styles.line} numberOfLines={1}>
                        {it.title}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {it.branch} · {it.statusLabel}
                      </Text>
                    </View>
                    <View style={styles.dot} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", zIndex: 30 },
  btn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sky50, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: -3,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.dangerFill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.card,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  scrim: { position: "absolute", top: -2000, left: -4000, right: -4000, bottom: -4000, zIndex: 1 },
  panel: {
    position: "absolute",
    top: 50,
    right: -100,
    width: 420,
    zIndex: 2,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingBottom: 6,
    shadowColor: "#0B2540",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  panelNarrow: { top: 64, left: 8, right: 8, width: undefined },
  head: { flexDirection: "row", alignItems: "baseline", gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 19, fontWeight: "800", color: colors.text },
  sub: { fontSize: 12.5, color: colors.textMuted },
  all: { fontSize: 13, fontWeight: "700", color: colors.histBlue },
  empty: { alignItems: "center", gap: 8, paddingVertical: 28 },
  emptyText: { fontSize: 13.5, color: colors.textMuted },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 9, marginHorizontal: 6, borderRadius: 10, backgroundColor: colors.sky50, marginBottom: 4 },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  iconUrgent: { backgroundColor: colors.dangerSoft },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  code: { fontSize: 14, fontWeight: "800", color: colors.text },
  urgentPill: { paddingHorizontal: 6, borderRadius: 6, backgroundColor: colors.dangerFill },
  urgentText: { fontSize: 10.5, lineHeight: 16, fontWeight: "800", color: "#fff" },
  ago: { fontSize: 11.5, fontWeight: "700", color: colors.histBlue },
  line: { fontSize: 13, color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.histBlue },
});
