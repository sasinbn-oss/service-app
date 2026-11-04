/**
 * ถังขยะใบงาน (แอดมิน — เจ้าของงานตัดสิน 4 พ.ย. 69 ตามตัวอย่างที่ตกลง)
 *
 * ใบงานที่ลบอยู่ที่นี่ 30 วัน กู้คืนได้ครบทั้งรูป อะไหล่ และประวัติ (ใบกลับไปขั้นเดิมเป๊ะ) แล้วระบบลบจริงพร้อมรูปและวิดีโอ
 * แต่ละแถวบอกสิ่งที่คนกู้ต้องรู้ก่อนตัดสินใจ: ใบอะไร (สาขา · ประเภทงาน · เครื่อง) · ก่อนลบอยู่ขั้นไหน · มีรูปกี่ไฟล์
 * · ใครลบ เมื่อไร เพราะอะไร · เหลือเวลาอีกกี่วัน (แถบแดงเมื่อเหลือ ≤ 7 วัน — ใกล้หายจริงแล้ว)
 *
 * "ลบถาวรตอนนี้" เฉพาะ Super Admin (เจ้าของงานเลือก — ไว้ล้างใบทดสอบ ไม่ต้องรอ 30 วัน) · เซิร์ฟเวอร์กันอีกชั้น (403)
 * Admin Spare Part ไม่มีเมนูนี้ (ลบใบงานไม่ได้) · ดูในฐานะหัวหน้าภาค/ช่างไม่เห็นเมนูแอดมินอยู่แล้ว
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AdminStackParamList } from "../navigation/types";
import { useRefreshHandler } from "../components/RefreshButton";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { api, apiErrorMessage } from "../api/client";
import { feedback } from "../components/Feedback";
import { showAlert } from "../utils/alert";
import { useAuth } from "../context/AuthContext";
import { useDebounced } from "../utils/useDebounced";
import { restoreFromTrash, trashDay } from "../utils/trash";
import { navigationRef } from "../navigation/navigationRef";
import { colors, headingFont, radius, shadow, spacing } from "../theme";

interface TrashRow {
  id: number;
  code: string;
  title: string;
  jobType: string;
  jobTypeLabel: string;
  isTest: boolean;
  branchCode: string;
  branchName: string;
  machineCode: string | null;
  status: string;
  statusLabel: string;
  files: number;
  parts: number;
  logs: number;
  deletedAt: string;
  deletedByName: string | null;
  reason: string | null;
  reasonText: string;
  purgeAt: string;
  daysLeft: number;
}

interface Data {
  keepDays: number;
  total: number;
  canPurgeNow: boolean;
  rows: TrashRow[];
}

/** เหลือ ≤ 7 วัน = แดง (ตัวอย่างที่ตกลง) — สัปดาห์สุดท้ายก่อนหายจริง */
const SOON_DAYS = 7;

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * เปิดใบที่เพิ่งกู้คืน — หน้านี้อยู่แท็บหลังบ้าน หน้าใบงานอยู่แท็บใบงาน จึงสั่งผ่านตัวนำทางของทั้งแอป (แบบเมนูข้าง)
 * initial: false ให้ปุ่มย้อนกลับพากลับไปรายการใบงาน ไม่ใช่หลุดออกจากแท็บ
 */
function openOrder(id: number) {
  if (!navigationRef.isReady()) return;
  (navigationRef.navigate as (tab: string, p: object) => void)("WorkOrdersTab", {
    screen: "WorkOrderDetail",
    params: { id },
    initial: false,
  });
}

type Props = NativeStackScreenProps<AdminStackParamList, "WorkOrderTrash">;

export default function WorkOrderTrashScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  // ตารางห้าคอลัมน์ตามตัวอย่างบนจอกว้าง · จอแคบเรียงเป็นการ์ด (ตารางห้าคอลัมน์บนมือถืออ่านไม่ออก)
  const wide = width >= 900;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  // เปิดมาพร้อมคำค้น (ลิงก์ใบงานที่อยู่ในถังขยะ · /#/admin/trash?q=…) — เริ่มที่ใบนั้นเลย
  const [q, setQ] = useState(route.params?.q ?? "");
  const settled = useDebounced(q.trim());
  /**
   * คำค้นอยู่ในที่อยู่ของหน้า (/#/admin/trash?q=…) — F5 หรือก๊อบลิงก์ไปให้คนอื่นได้ผลค้นเดิม ไม่ใช่ถังทั้งถัง
   * เทียบก่อนเขียน: เขียน params ทุกครั้ง = หน้าวาดใหม่ไม่รู้จบ · ที่อยู่ถูกแทนที่ ไม่เพิ่มรายการย้อนกลับ (linking.ts)
   */
  const wrote = useRef(route.params?.q ?? "");
  useEffect(() => {
    if ((route.params?.q ?? "") === settled) return;
    wrote.current = settled;
    navigation.setParams({ q: settled || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- เขียนเมื่อคำค้นเปลี่ยนเท่านั้น (params ที่เปลี่ยนจากข้างนอกดูข้างล่าง)
  }, [settled, navigation]);
  /**
   * หน้านี้เปิดค้างในแท็บหลังบ้านอยู่แล้ว แล้วกดลิงก์ใบงานที่อยู่ในถังขยะอีกใบ — params ใหม่มาแต่ช่องค้นยังเป็นคำเดิม
   * รับเฉพาะค่าที่ไม่ได้มาจากช่องค้นเอง (wrote) ไม่งั้นค่าที่เพิ่งเขียนกลับมาทับตัวอักษรที่พิมพ์ต่อระหว่างนั้น
   */
  const fromRoute = route.params?.q ?? "";
  useEffect(() => {
    if (fromRoute === wrote.current) return;
    wrote.current = fromRoute;
    setQ(fromRoute);
  }, [fromRoute]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    return api
      .get<Data>("/work-orders/trash", { params: settled ? { q: settled } : {} })
      .then((res) => {
        setData(res.data);
        setError(null);
      })
      .catch((e) => setError(apiErrorMessage(e)));
  }, [settled]);
  // ไม่ส่ง load ให้ useFocusEffect ตรง ๆ — มันคืน promise ซึ่ง useFocusEffect จะเข้าใจว่าเป็นตัวเก็บกวาด
  // load เปลี่ยนตามคำค้น — useFocusEffect เรียกใหม่เองเมื่อพิมพ์ค้น (ระหว่างที่หน้านี้เปิดอยู่)
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );
  useRefreshHandler(load);

  async function restore(r: TrashRow) {
    setBusyId(r.id);
    try {
      // restoreFromTrash รีเฟรชหน้านี้ให้เอง (runRefresh) — แถวที่กู้แล้วหายจากรายการ
      await restoreFromTrash(r.id, { onOpen: openOrder });
    } finally {
      setBusyId(null);
    }
  }

  function purgeNow(r: TrashRow) {
    showAlert(
      `ลบ ${r.code} ถาวรตอนนี้?`,
      [
        "ลบทันที ไม่ต้องรอครบ 30 วัน — กู้คืนไม่ได้อีก",
        `หายทั้งหมด: ใบงาน · อะไหล่ ${r.parts} รายการ · ประวัติ ${r.logs} รายการ · รูป/วิดีโอ ${r.files} ไฟล์ในที่เก็บไฟล์`,
      ].join("\n\n"),
      [
        { text: "ไม่ลบ", style: "cancel" },
        {
          text: "ลบถาวร",
          style: "destructive",
          onPress: async () => {
            setBusyId(r.id);
            try {
              const res = await api.delete<{ code: string; fileErrors: number }>(`/work-orders/${r.id}/permanent`, {
                loadingText: "กำลังลบถาวร…",
              });
              feedback.toast(
                res.data.fileErrors ? "warn" : "success",
                res.data.fileErrors
                  ? `ลบ ${res.data.code} ถาวรแล้ว — ลบไฟล์ในที่เก็บไฟล์ไม่สำเร็จ ${res.data.fileErrors} ไฟล์ (ดู log เซิร์ฟเวอร์)`
                  : `ลบ ${res.data.code} ถาวรแล้ว`
              );
              await load();
            } catch (e) {
              showAlert("ลบถาวรไม่สำเร็จ", apiErrorMessage(e));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  }

  // เมนูซ่อนไว้แล้ว แต่ลิงก์ตรงยังพามาได้ — บอกตรง ๆ ดีกว่าหน้าที่โหลดไม่ขึ้น (เซิร์ฟเวอร์ตอบ 403 อยู่แล้ว)
  if (user?.role !== "ADMIN" || user.partsAdmin) {
    return (
      <View style={styles.center}>
        <EmptyState icon="lock-closed-outline" title="ถังขยะใบงานสำหรับแอดมินเท่านั้น" text="คนที่ลบใบงานได้เท่านั้นที่กู้คืนได้" />
      </View>
    );
  }
  if (!data) {
    return (
      <View style={styles.center}>
        {error ? <EmptyState icon="cloud-offline-outline" title="โหลดถังขยะไม่ได้" text={error} /> : <Spinner color={colors.primary} />}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={[styles.title, headingFont]}>ถังขยะใบงาน</Text>
          <Text style={styles.sub}>
            ใบงานที่ลบ เก็บไว้ {data.keepDays} วัน กู้คืนได้ครบทั้งรูป อะไหล่ และประวัติ · ครบ {data.keepDays} วันระบบลบจริงพร้อมรูปและวิดีโอ
          </Text>
        </View>
        <View style={styles.countChip} accessibilityLabel={`ในถังขยะ ${data.total} ใบ`}>
          <Text style={styles.countText}>{data.total} ใบ</Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          placeholder="ค้นเลขใบงาน รหัส/ชื่อสาขา หรือคนที่ลบ"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="ค้นในถังขยะ"
        />
        <Text style={styles.muted}>ใบในถังขยะไม่ขึ้นในรายการใบงาน กล่องงาน รายงาน และการค้นหา จนกว่าจะกู้คืน</Text>
      </View>

      <View style={styles.card}>
        {wide ? (
          <View style={[styles.tr, styles.th]}>
            <Text style={[styles.thText, styles.cWo]}>ใบงาน</Text>
            <Text style={[styles.thText, styles.cBy]}>ลบโดย · เมื่อ</Text>
            <Text style={[styles.thText, styles.cWhy]}>เหตุผล</Text>
            <Text style={[styles.thText, styles.cLeft]}>เหลือเวลากู้คืน</Text>
            <View style={styles.cAct} />
          </View>
        ) : null}
        {data.rows.length === 0 ? (
          <Text style={styles.empty}>{settled ? `ไม่พบใบที่ตรงกับ “${settled}”` : "ถังขยะว่าง"}</Text>
        ) : (
          data.rows.map((r) => {
            const soon = r.daysLeft <= SOON_DAYS;
            const pct = Math.max(0, Math.min(100, Math.round((r.daysLeft / data.keepDays) * 100)));
            const busy = busyId === r.id;
            return (
              <View key={r.id} style={[styles.tr, !wide && styles.trNarrow]} accessibilityLabel={`แถวถังขยะ ${r.code}`}>
                <View style={[styles.cWo, { gap: 2 }]}>
                  <View style={styles.codeRow}>
                    <Text style={styles.code}>{r.code}</Text>
                    {r.isTest ? (
                      <View style={styles.testChip}>
                        <Text style={styles.testText}>ใบทดสอบ</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.what}>
                    {[`${r.branchCode} ${r.branchName}`, `งาน ${r.jobTypeLabel}`, r.machineCode ? `เครื่อง ${r.machineCode}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  <Text style={styles.muted}>
                    ก่อนลบอยู่ขั้น: {r.statusLabel} · รูป/วิดีโอ {r.files} ไฟล์
                  </Text>
                </View>
                <View style={[styles.cBy, { gap: 2 }]}>
                  <Text style={styles.cell}>{r.deletedByName ?? "—"}</Text>
                  <Text style={styles.muted}>{fmtWhen(r.deletedAt)}</Text>
                </View>
                <Text style={[styles.cell, styles.cWhy]}>{r.reasonText}</Text>
                <View style={[styles.cLeft, { gap: 4 }]}>
                  <Text style={[styles.left, soon && styles.leftSoon]}>
                    {r.daysLeft > 0 ? `เหลือ ${r.daysLeft} วัน` : "ครบกำหนด — รอระบบลบ"}
                  </Text>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${pct}%` }, soon && styles.barSoon]} />
                  </View>
                  <Text style={styles.muted}>ลบจริง {trashDay(r.purgeAt)}</Text>
                </View>
                <View style={[styles.cAct, styles.actions]}>
                  {busy ? <Spinner color={colors.primary} size="small" /> : null}
                  <TouchableOpacity
                    style={[styles.btn, busy && { opacity: 0.5 }]}
                    onPress={() => restore(r)}
                    disabled={busy}
                    accessibilityLabel={`กู้คืน ${r.code}`}
                  >
                    <Text style={styles.btnText}>กู้คืน</Text>
                  </TouchableOpacity>
                  {data.canPurgeNow ? (
                    <TouchableOpacity
                      style={[styles.btnDanger, busy && { opacity: 0.5 }]}
                      onPress={() => purgeNow(r)}
                      disabled={busy}
                      accessibilityLabel={`ลบถาวรตอนนี้ ${r.code}`}
                    >
                      <Text style={styles.btnDangerText}>ลบถาวรตอนนี้</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        <Text style={[styles.muted, { flex: 1 }]}>
          “ลบถาวรตอนนี้” ขึ้นเฉพาะ Super Admin — สำหรับใบทดสอบที่อยากล้างเลย ไม่ต้องรอ {data.keepDays} วัน
          {data.rows.length < data.total ? ` · แสดง ${data.rows.length} จาก ${data.total} ใบ — ค้นเพื่อหาใบที่เหลือ` : ""}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48, maxWidth: 1180, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: spacing.lg },
  head: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md, flexWrap: "wrap" },
  title: { fontSize: 24, lineHeight: 34, fontWeight: "700", color: colors.navy },
  sub: { fontSize: 14, lineHeight: 22, color: colors.body },
  countChip: { backgroundColor: colors.sky50, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  countText: { fontSize: 13, fontWeight: "700", color: colors.navy },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  search: {
    flexGrow: 1,
    flexBasis: 260,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
  },
  muted: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.card,
  },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // จอแคบ: คอลัมน์เรียงลงมาเป็นการ์ด — ทุกช่องกว้างเต็ม
  trNarrow: { flexDirection: "column", alignItems: "stretch", gap: 8 },
  th: { backgroundColor: colors.rowAlt, paddingVertical: 10 },
  thText: { fontSize: 12.5, fontWeight: "700", color: colors.textMuted },
  cWo: { flex: 2.1, minWidth: 0 },
  cBy: { flex: 1.4, minWidth: 0 },
  cWhy: { flex: 1.2, minWidth: 0 },
  cLeft: { flex: 1, minWidth: 0 },
  cAct: { flex: 1.6, minWidth: 0 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  code: { fontSize: 15, fontWeight: "700", color: colors.navy },
  testChip: { backgroundColor: colors.warningTint, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  testText: { fontSize: 11.5, fontWeight: "700", color: colors.warningInk },
  what: { fontSize: 13, lineHeight: 20, color: colors.body },
  cell: { fontSize: 13, lineHeight: 20, color: colors.text },
  left: { fontSize: 13, fontWeight: "700", color: colors.text },
  leftSoon: { color: colors.dangerInk },
  bar: { height: 6, borderRadius: 999, backgroundColor: colors.border, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 999, backgroundColor: colors.navyFill },
  barSoon: { backgroundColor: colors.dangerFill },
  actions: { flexDirection: "row", gap: 8, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" },
  btn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.navyFill,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontSize: 13.5, fontWeight: "700" },
  btnDanger: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerLine,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDangerText: { color: colors.dangerInk, fontSize: 13, fontWeight: "600" },
  empty: { padding: 28, textAlign: "center", fontSize: 14, color: colors.textMuted },
  note: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
});
