/**
 * ลิงก์/หน้าใบงานที่ชี้ไปใบที่อยู่ในถังขยะ (ถังขยะใบงาน · เจ้าของงานตัดสิน 4 พ.ย. 69)
 *
 * เซิร์ฟเวอร์บอกว่า "อยู่ในถังขยะ" เฉพาะแอดมิน (GET /work-orders/by-code — ช่าง/หัวหน้าภาค/ทีม Area ได้ "ไม่พบใบงาน"
 * เหมือนรหัสที่ไม่มีจริง ไม่รู้ว่าใบนั้นเคยมีหรือถูกลบ) · แอดมินที่กู้คืนได้มีปุ่มไปหน้าถังขยะที่ค้นรหัสใบนี้ไว้ให้แล้ว
 * — ลิงก์ในกลุ่มไลน์ยังชี้ไปใบเดิม คนเปิดต้องรู้ว่าใบไปไหน และกู้ได้ในสองกด ไม่ใช่เจอ "ไม่พบใบงาน" แล้วนึกว่าลิงก์เสีย
 * Admin Spare Part ลบ/กู้ใบงานไม่ได้ (ไม่มีหน้าถังขยะ) — บอกว่าใบอยู่ไหนแล้วให้แอดมินกู้
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { navigationRef } from "../navigation/navigationRef";
import { trashDay } from "../utils/trash";
import { colors, radius, spacing } from "../theme";

/** ช่องที่ by-code ส่งมาให้แอดมินเมื่อใบอยู่ในถังขยะ (หน้าใบงานที่เปิดด้วยเลขใบมีแค่รหัส) */
export interface TrashedInfo {
  code: string;
  canRestore: boolean;
  deletedAt?: string | null;
  purgeAt?: string | null;
  deletedByName?: string | null;
  reasonText?: string | null;
}

/** อ่านคำตอบ 404 ของ by-code — ใบในถังขยะ (เฉพาะแอดมินที่ได้ trashed) · อย่างอื่นคืน null */
export function trashedInfoOf(e: unknown): TrashedInfo | null {
  const r = (e as { response?: { status?: number; data?: Partial<TrashedInfo> & { trashed?: unknown } } } | null)?.response;
  if (r?.status !== 404 || r.data?.trashed !== true || typeof r.data.code !== "string") return null;
  return {
    code: r.data.code,
    canRestore: r.data.canRestore === true,
    deletedAt: r.data.deletedAt ?? null,
    purgeAt: r.data.purgeAt ?? null,
    deletedByName: r.data.deletedByName ?? null,
    reasonText: r.data.reasonText ?? null,
  };
}

/**
 * ไปหน้าถังขยะ (แท็บหลังบ้าน) พร้อมค้นรหัสใบนี้ — หน้าใบงานอยู่แท็บใบงาน จึงสั่งผ่านตัวนำทางของทั้งแอป (แบบเมนูข้าง)
 * initial: false ให้ปุ่มย้อนกลับในแท็บหลังบ้านพากลับเมนูหลังบ้าน ไม่ใช่หลุดออกจากแท็บ
 */
export function openTrash(q: string) {
  if (!navigationRef.isReady()) return;
  (navigationRef.navigate as (tab: string, p: object) => void)("AdminTab", {
    screen: "WorkOrderTrash",
    params: { q },
    initial: false,
  });
}

export default function TrashedOrderNote({ info, onBack }: { info: TrashedInfo; onBack: () => void }) {
  const who = [
    info.deletedByName ? `ลบโดย ${info.deletedByName}` : null,
    info.deletedAt ? `เมื่อ ${trashDay(info.deletedAt)}` : null,
    info.reasonText ? `เหตุผล: ${info.reasonText}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={styles.wrap} accessibilityLabel="ใบงานนี้อยู่ในถังขยะ">
      <View style={styles.icon}>
        <Ionicons name="trash-outline" size={22} color={colors.textMuted} />
      </View>
      <Text style={styles.title}>{info.code} อยู่ในถังขยะ</Text>
      {who ? <Text style={styles.text}>{who}</Text> : null}
      <Text style={styles.text}>
        {info.canRestore
          ? `กู้คืนได้${info.purgeAt ? `ถึง ${trashDay(info.purgeAt)}` : ""} — กู้แล้วใบกลับไปขั้นเดิมพร้อมรูปและประวัติ`
          : "ให้แอดมินกู้คืนจากเมนู “ถังขยะใบงาน”"}
      </Text>
      <View style={styles.row}>
        {info.canRestore ? (
          <TouchableOpacity style={[styles.btn, styles.btnMain]} onPress={() => openTrash(info.code)} activeOpacity={0.7}>
            <Text style={[styles.btnText, styles.btnMainText]}>เปิดถังขยะใบงาน</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.btn} onPress={onBack} activeOpacity={0.7}>
          <Text style={styles.btnText}>กลับไปรายการใบงาน</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    marginBottom: spacing.sm,
  },
  title: { fontSize: 16, fontWeight: "800", color: colors.text, textAlign: "center" },
  text: { marginTop: 4, fontSize: 13, lineHeight: 21, color: colors.textMuted, textAlign: "center", maxWidth: 380 },
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md },
  btn: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnText: { fontSize: 13.5, fontWeight: "700", color: colors.navy },
  btnMain: { backgroundColor: colors.navyFill, borderColor: colors.navyFill },
  btnMainText: { color: "#fff" },
});
