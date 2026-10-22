/**
 * งานของฉันวันนี้ — แอดมิน / หัวหน้าภาค (เจ้าของงานกำหนด ต.ค. 69)
 *
 * "งานของฉัน" ของแต่ละตำแหน่งคือใบที่ค้างรอตำแหน่งนั้นทำ ไม่ใช่งานหน้าร้านแบบของช่าง
 * แอดมินเห็นใบรอเบิกอะไหล่ / เสนอราคา / คอนเฟิร์มลูกค้า ฯลฯ · หัวหน้าภาคเห็นใบรอระบุอะไหล่ / จ่ายงาน / ปล่อยงาน
 * หน้าตาจึงต่างกันไปตามงานที่ค้าง — แบ่งกลุ่มตามขั้น เรียงด่วนก่อน แล้วค้างนานก่อน
 *
 * ข้อมูลชุดเดียวกับ "กล่องงานของฉัน" (GET /work-orders?status=INBOX) ไม่มี endpoint ใหม่
 * ต่างกันที่หน้านี้จัดเป็นรายการสิ่งที่ต้องทำ มีปุ่มของขั้นนั้นบนการ์ดเลย กดแล้วเปิดใบงานพร้อมฟอร์มของขั้น
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { useRefreshHandler } from "../components/RefreshButton";
import { useDocked } from "../components/SideMenu";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { machineTag } from "../utils/machine";
import { colors, headingFont, radius, shadow, spacing } from "../theme";
import type { WorkOrderRow } from "./WorkOrderListScreen";

/** ค้างเกินนี้ขึ้นแดง — ตัวเลขเดียวกับชิป "ค้างขั้นเดิมเกิน 3 วัน" ในหน้ารายการ */
const STALE_DAYS = 3;

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

/** "แอดมิน · เบิกอะไหล่ (คลัง 94)" → "เบิกอะไหล่ (คลัง 94)" — ตำแหน่งรู้อยู่แล้วว่าเป็นของตัวเอง */
const stageName = (label: string) => label.split(" · ").slice(1).join(" · ") || label;

type Props = { onOpen: (id: number, open?: "stage" | "close") => void };

export default function MyQueue({ onOpen }: Props) {
  const { user } = useAuth();
  const { docked } = useDocked();
  const [rows, setRows] = useState<WorkOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  // แท็บที่ไม่ได้เปิดอยู่บนเว็บยังวาดค้างไว้แบบโปร่งใส (ท่าจางเข้าเวลาสลับแท็บ) — รายการรหัสใบงานที่นี่
  // ไปปนกับหน้ารายการใบงาน (เทสต์ appointment-list นับรหัสเกิน) วาดรายการเฉพาะตอนแท็บนี้เปิดอยู่
  const focused = useIsFocused();

  const load = useCallback(async () => {
    const n = ++seq.current;
    setError(null);
    try {
      const res = await api.get<{ rows: WorkOrderRow[] }>("/work-orders", { params: { status: "INBOX" } });
      if (n === seq.current) setRows(res.data.rows);
    } catch (e) {
      if (n === seq.current) setError(apiErrorMessage(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useRefreshHandler(async () => {
    await load();
  });

  // กลุ่มตามขั้น — กลุ่มที่มีใบด่วนขึ้นก่อน แล้วกลุ่มที่ค้างนานสุด · ในกลุ่มเรียงด่วน → ค้างนาน
  const groups = useMemo(() => {
    const by = new Map<string, WorkOrderRow[]>();
    for (const r of rows ?? []) {
      const k = stageName(r.statusLabel);
      by.set(k, [...(by.get(k) ?? []), r]);
    }
    const score = (r: WorkOrderRow) => (r.priority === "URGENT" ? 1e6 : 0) + daysSince(r.stageSince);
    return [...by.entries()]
      .map(([label, list]) => ({ label, list: list.sort((a, b) => score(b) - score(a)) }))
      .sort((a, b) => Math.max(...b.list.map(score)) - Math.max(...a.list.map(score)));
  }, [rows]);

  const all = rows ?? [];
  const urgent = all.filter((r) => r.priority === "URGENT").length;
  const stale = all.filter((r) => daysSince(r.stageSince) > STALE_DAYS).length;
  const out = all.filter((r) => (r.partsOut ?? 0) > 0).length;
  const roleLabel = user?.role === "ADMIN" ? "แอดมิน" : "หัวหน้าภาค";

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <View style={styles.head}>
        {/* จอแคบ: ชื่อหน้าอยู่บนแถบหัวแล้ว ไม่พิมพ์ซ้ำตัวใหญ่ */}
        {docked ? <Text style={[styles.title, headingFont]}>งานของฉันวันนี้</Text> : null}
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>งานที่รอ{roleLabel}ทำ</Text>
        </View>
      </View>

      {rows ? (
        <View style={styles.stats}>
          <Stat n={all.length} label="รอทำทั้งหมด" />
          <Stat n={urgent} label="ด่วน" tone={urgent ? "danger" : undefined} />
          <Stat n={stale} label={`ค้างเกิน ${STALE_DAYS} วัน`} tone={stale ? "warning" : undefined} />
          {user?.role === "ADMIN" ? <Stat n={out} label="อะไหล่หมด" tone={out ? "danger" : undefined} /> : null}
        </View>
      ) : null}

      {error ? (
        <EmptyState icon="cloud-offline-outline" title="โหลดงานไม่ได้" text={error} />
      ) : !rows ? (
        <Spinner color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : all.length === 0 ? (
        <EmptyState icon="checkmark-done-outline" title="ไม่มีงานค้างรอคุณ" text="ใบงานที่ถึงขั้นของคุณจะขึ้นที่นี่ทันที" />
      ) : !focused ? null : (
        groups.map((g) => (
          <View key={g.label} style={styles.group} accessibilityLabel={`กลุ่ม ${g.label}`}>
            <View style={styles.groupHead}>
              <Text style={[styles.groupTitle, headingFont]}>{g.label}</Text>
              <View style={styles.groupCount}>
                <Text style={styles.groupCountText}>{g.list.length}</Text>
              </View>
            </View>
            {g.list.map((r) => {
              const d = daysSince(r.stageSince);
              const hot = r.priority === "URGENT";
              return (
                <View key={r.id} style={[styles.card, hot && styles.cardHot]}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.code, headingFont]}>{r.code}</Text>
                    {hot ? (
                      <View style={styles.tagHot}>
                        <Text style={styles.tagHotText}>ด่วน</Text>
                      </View>
                    ) : null}
                    {r.rolledBackFrom ? <Tag text="↩ ย้อนขั้นมา" fg={colors.rollbackInk} bg={colors.rollbackSoft} /> : null}
                    {(r.partsOut ?? 0) > 0 ? <Tag text={`อะไหล่หมด ${r.partsOut}`} fg={colors.dangerInk} bg={colors.dangerSoft} /> : null}
                    {r.orphan ? <Tag text="ไม่มีคนรับ" fg={colors.warningInk} bg={colors.warningSoft} /> : null}
                    {r.overdue ? <Tag text="เลยนัด" fg={colors.dangerInk} bg={colors.dangerSoft} /> : null}
                    {r.rescheduled ? <Tag text="ลูกค้าขอเปลี่ยนวัน" fg={colors.warningInk} bg={colors.warningSoft} /> : null}
                    <View style={{ flex: 1 }} />
                    <Text style={[styles.wait, d > STALE_DAYS && styles.waitLate]}>{d < 1 ? "เข้าขั้นนี้วันนี้" : `ค้าง ${d} วัน`}</Text>
                  </View>
                  <Text style={styles.branch} numberOfLines={1}>
                    {r.branchCode} {r.branchName}
                  </Text>
                  <Text style={styles.meta} numberOfLines={2}>
                    {[r.title, r.machineCode ? `เครื่อง ${machineTag(r.machineCode, r.machineCapacityKg)}` : null, r.assignedTeam ? `ทีม ${r.assignedTeam}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  {r.orphan && r.orphanReason ? <Text style={styles.note}>{r.orphanReason}</Text> : null}
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.detailBtn} onPress={() => onOpen(r.id)} accessibilityLabel={`รายละเอียด ${r.code}`}>
                      <Ionicons name="document-text-outline" size={16} color={colors.navy} />
                      <Text style={styles.detailText}>รายละเอียด</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.goBtn}
                      onPress={() => onOpen(r.id, r.status === "IN_PROGRESS" ? "close" : "stage")}
                      accessibilityLabel={`ทำขั้น ${g.label} ${r.code}`}
                    >
                      <Ionicons name="arrow-forward-circle" size={18} color="#fff" />
                      <Text style={styles.goText} numberOfLines={1}>
                        {g.label}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "danger" | "warning" }) {
  const fg = tone === "danger" ? colors.dangerInk : tone === "warning" ? colors.warningInk : colors.text;
  return (
    <View style={styles.stat}>
      <Text style={[styles.statN, headingFont, { color: fg }]}>{n}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Tag({ text, fg, bg }: { text: string; fg: string; bg: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color: fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, maxWidth: 820, width: "100%", alignSelf: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  title: { fontSize: 24, lineHeight: 34, fontWeight: "700", color: colors.text },
  rolePill: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 12 },
  rolePillText: { fontSize: 13, lineHeight: 24, fontWeight: "700", color: colors.primaryInk },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stat: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  statN: { fontSize: 24, lineHeight: 32, fontWeight: "700", fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  group: { gap: spacing.sm, marginTop: spacing.sm },
  groupHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  groupTitle: { fontSize: 17, lineHeight: 26, fontWeight: "700", color: colors.navy },
  groupCount: { backgroundColor: colors.navyFill, borderRadius: 999, minWidth: 24, paddingHorizontal: 8, alignItems: "center" },
  groupCountText: { color: "#fff", fontSize: 12, lineHeight: 20, fontWeight: "700" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
    ...shadow.card,
  },
  cardHot: { borderColor: colors.dangerLine },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  code: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: colors.primaryInk },
  tagHot: { backgroundColor: colors.danger, borderRadius: 6, paddingHorizontal: 7 },
  tagHotText: { color: "#fff", fontSize: 12, lineHeight: 20, fontWeight: "700" },
  tag: { borderRadius: 999, paddingHorizontal: 8 },
  tagText: { fontSize: 12, lineHeight: 20, fontWeight: "700" },
  wait: { fontSize: 12, lineHeight: 20, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  waitLate: { color: colors.dangerInk, fontWeight: "700" },
  branch: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.text },
  meta: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  note: { fontSize: 12, lineHeight: 18, color: colors.warningInk },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  detailBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  detailText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.navy },
  goBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.navyFill,
  },
  goText: { color: "#fff", fontSize: 15, lineHeight: 22, fontWeight: "700", flexShrink: 1 },
});
