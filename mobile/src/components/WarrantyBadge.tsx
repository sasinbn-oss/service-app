/**
 * ป้ายประกันในรายการ — ติดตามเครื่องเสีย · ใบงานซ่อม
 *
 * เจ้าของงานอยากเห็นตั้งแต่ในรายการว่าเครื่องไหนยังอยู่ในประกัน (ต.ค. 69) เพราะเป็นตัวตัดสินว่า
 * ใช้อะไหล่แล้วต้องเสนอราคาลูกค้าไหม และส่งเคลมผู้ขายได้ไหม — เปิดใบงานทีละใบเพื่อดูบรรทัดประกันช้าเกินไป
 * สถานะคิดที่เซิร์ฟเวอร์ (warrantyStatus) หน้าจอแค่วาด ไม่ต้องรู้ว่ากฎกี่ปี
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radius } from "../theme";

export type WarrantyState = "IN" | "SOON" | "OUT" | "UNKNOWN";

export const WARRANTY_LABEL: Record<WarrantyState, string> = {
  IN: "ในประกัน",
  SOON: "ใกล้หมดประกัน",
  OUT: "หมดประกัน",
  UNKNOWN: "ไม่ทราบวันเปิดร้าน",
};

const TONE: Record<WarrantyState, { fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  IN: { fg: colors.successInk, bg: colors.successSoft, icon: "shield-checkmark" },
  SOON: { fg: colors.warningInk, bg: colors.warningSoft, icon: "time" },
  OUT: { fg: colors.dangerInk, bg: colors.dangerSoft, icon: "shield-outline" },
  UNKNOWN: { fg: colors.textMuted, bg: colors.background, icon: "help-circle-outline" },
};

/** "12 มี.ค. 70" — สั้นพอให้อยู่บรรทัดเดียวกับป้าย DODO/ภาค */
function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });
}

export default function WarrantyBadge({
  state,
  endsAt,
}: {
  state: WarrantyState | null | undefined;
  endsAt: string | null | undefined;
}) {
  // สาขาบริษัทไม่มีประกัน — ไม่ขึ้นป้ายเลย ดีกว่าขึ้นป้ายที่ไม่มีความหมายทุกแถว
  if (!state) return null;
  const t = TONE[state];
  const days = endsAt ? Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000) : null;
  const text =
    state === "IN" && endsAt
      ? `ในประกัน · ถึง ${shortDate(endsAt)}`
      : state === "SOON" && days !== null
        ? `ใกล้หมดประกัน · เหลือ ${Math.max(days, 0)} วัน`
        : state === "OUT" && endsAt
          ? `หมดประกัน · ${shortDate(endsAt)}`
          : WARRANTY_LABEL[state];
  return (
    <View
      style={[styles.badge, { backgroundColor: t.bg }, state === "UNKNOWN" && styles.unknown]}
      accessibilityLabel={text}
    >
      <Ionicons name={t.icon} size={11} color={t.fg} />
      <Text style={[styles.text, { color: t.fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: radius.sm,
    paddingHorizontal: 7,
    paddingVertical: 1,
    alignSelf: "flex-start",
  },
  unknown: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong },
  text: { fontSize: 11.5, lineHeight: 17, fontWeight: "700" },
});
