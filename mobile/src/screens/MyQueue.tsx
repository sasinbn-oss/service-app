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
import {
  AdminReplyModal,
  AdminReviewBox,
  AdminReviewTag,
  SendAdminReviewModal,
  ackAdminReview,
  cancelAdminReview,
} from "../components/AdminReview";

/** ค้างเกินนี้ขึ้นแดง — ตัวเลขเดียวกับชิป "ค้างขั้นเดิมเกิน 3 วัน" ในหน้ารายการ */
const STALE_DAYS = 3;

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

/** "แอดมิน · เบิกอะไหล่ (คลัง 94)" → "เบิกอะไหล่ (คลัง 94)" — ตำแหน่งรู้อยู่แล้วว่าเป็นของตัวเอง */
const stageName = (label: string) => label.split(" · ").slice(1).join(" · ") || label;

type Props = { onOpen: (id: number, open?: "stage" | "close") => void };

/**
 * กลุ่มที่ไม่ใช่ขั้นของใบ — ส่งกลับให้แอดมินตรวจสอบ (ต.ค. 69) ปักไว้บนสุด เพราะอีกฝ่ายรอคำตอบอยู่
 * แอดมิน: คำขอที่รอตอบ (ใบอยู่ขั้นไหนก็ได้) · หัวหน้าภาค: แอดมินตอบแล้วแต่ใบเดินไปขั้นที่ไม่ใช่ของตัวเองแล้ว
 * (ใบที่ยังอยู่ขั้นของหัวหน้าภาคโชว์คำตอบบนการ์ดในกลุ่มขั้นตามปกติ)
 */
const REVIEW_GROUP = "หัวหน้าภาคส่งให้ตรวจสอบ";
const ANSWER_GROUP = "แอดมินตอบแล้ว";
type GroupKind = "stage" | "review" | "answer";

export default function MyQueue({ onOpen }: Props) {
  const { user } = useAuth();
  const { docked } = useDocked();
  const [rows, setRows] = useState<WorkOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendFor, setSendFor] = useState<WorkOrderRow | null>(null);
  const [replyFor, setReplyFor] = useState<WorkOrderRow | null>(null);
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
  const isAdmin = user?.role === "ADMIN";
  const groups = useMemo(() => {
    const by = new Map<string, WorkOrderRow[]>();
    const pinned = new Map<string, { kind: GroupKind; list: WorkOrderRow[] }>();
    const pin = (label: string, kind: GroupKind, r: WorkOrderRow) =>
      pinned.set(label, { kind, list: [...(pinned.get(label)?.list ?? []), r] });
    for (const r of rows ?? []) {
      if (isAdmin && r.adminReview && !r.adminReview.answered) pin(REVIEW_GROUP, "review", r);
      else if (!isAdmin && r.adminReview?.answered && r.stageActor !== "SUPERVISOR") pin(ANSWER_GROUP, "answer", r);
      else {
        const k = stageName(r.statusLabel);
        by.set(k, [...(by.get(k) ?? []), r]);
      }
    }
    const score = (r: WorkOrderRow) => (r.priority === "URGENT" ? 1e6 : 0) + daysSince(r.stageSince);
    // คำขอตรวจสอบเรียงส่งก่อนขึ้นก่อน — ไม่ใช่ตามวันค้างขั้น (ขั้นตอนไม่ได้เปลี่ยนตอนส่ง)
    const sent = (r: WorkOrderRow) => new Date(r.adminReview?.at ?? r.stageSince).getTime();
    return [
      ...[...pinned.entries()].map(([label, g]) => ({ label, kind: g.kind, list: g.list.sort((a, b) => sent(a) - sent(b)) })),
      ...[...by.entries()]
        .map(([label, list]) => ({ label, kind: "stage" as GroupKind, list: list.sort((a, b) => score(b) - score(a)) }))
        .sort((a, b) => Math.max(...b.list.map(score)) - Math.max(...a.list.map(score))),
    ];
  }, [rows, isAdmin]);

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
                    <AdminReviewTag review={r.adminReview} />
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
                  {r.adminReview ? <AdminReviewBox review={r.adminReview} viewer={isAdmin ? "admin" : "supervisor"} /> : null}
                  <CardActions
                    row={r}
                    kind={g.kind}
                    stageLabel={g.label}
                    isAdmin={isAdmin}
                    wide={docked}
                    onOpen={onOpen}
                    onSend={() => setSendFor(r)}
                    onReply={() => setReplyFor(r)}
                    onChanged={load}
                  />
                </View>
              );
            })}
          </View>
        ))
      )}
      {sendFor ? (
        <SendAdminReviewModal
          order={sendFor}
          onClose={() => setSendFor(null)}
          onDone={async () => {
            setSendFor(null);
            await load();
          }}
        />
      ) : null}
      {replyFor?.adminReview ? (
        <AdminReplyModal
          order={replyFor}
          review={replyFor.adminReview}
          onClose={() => setReplyFor(null)}
          onDone={async () => {
            setReplyFor(null);
            await load();
          }}
        />
      ) : null}
    </ScrollView>
  );
}

/**
 * ปุ่มบนการ์ด — ปุ่มขั้นของใบอยู่ที่เดิมเสมอ ปุ่มส่งกลับให้แอดมินตรวจสอบเป็นปุ่มรอง (เจ้าของงานเลือก ต.ค. 69)
 * จอกว้างเรียงแถวเดียว · จอแคบปุ่มรองคู่กับ "รายละเอียด" แล้วปุ่มขั้นเต็มความกว้างอีกแถว (สามปุ่มแถวเดียวไม่พอที่)
 */
function CardActions({
  row: r,
  kind,
  stageLabel,
  isAdmin,
  wide,
  onOpen,
  onSend,
  onReply,
  onChanged,
}: {
  row: WorkOrderRow;
  kind: GroupKind;
  stageLabel: string;
  isAdmin: boolean;
  wide: boolean;
  onOpen: Props["onOpen"];
  onSend: () => void;
  onReply: () => void;
  onChanged: () => Promise<void>;
}) {
  const detail = (
    <TouchableOpacity style={styles.detailBtn} onPress={() => onOpen(r.id)} accessibilityLabel={`รายละเอียด ${r.code}`}>
      <Ionicons name="document-text-outline" size={16} color={colors.navy} />
      <Text style={styles.detailText}>รายละเอียด</Text>
    </TouchableOpacity>
  );
  const ack = (
    <TouchableOpacity style={[styles.sideBtn, styles.ackBtn]} onPress={() => ackAdminReview(r, onChanged)} accessibilityLabel={`รับทราบคำตอบแอดมิน ${r.code}`}>
      <Ionicons name="checkmark" size={16} color={colors.successInk} />
      <Text style={[styles.sideText, { color: colors.successInk }]}>รับทราบ</Text>
    </TouchableOpacity>
  );

  // แอดมิน: คำขอที่รอตอบ — ปุ่มหลักคือตอบกลับ (ขั้นของใบทำจากหน้ารายละเอียด)
  if (kind === "review") {
    return (
      <View style={styles.actions}>
        {detail}
        <TouchableOpacity style={[styles.goBtn, styles.replyBtn]} onPress={onReply} accessibilityLabel={`ตรวจแล้ว ตอบกลับ ${r.code}`}>
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <Text style={styles.goText}>ตรวจแล้ว · ตอบกลับ</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (kind === "answer") {
    return (
      <View style={styles.actions}>
        {detail}
        {ack}
      </View>
    );
  }

  const go = (
    <TouchableOpacity
      style={!wide && !isAdmin ? styles.goFull : styles.goBtn}
      onPress={() => onOpen(r.id, r.status === "IN_PROGRESS" ? "close" : "stage")}
      accessibilityLabel={`ทำขั้น ${stageLabel} ${r.code}`}
    >
      <Ionicons name="arrow-forward-circle" size={18} color="#fff" />
      <Text style={styles.goText} numberOfLines={1}>
        {stageLabel}
      </Text>
    </TouchableOpacity>
  );
  // แอดมินไม่มีปุ่มส่งกลับ — เป็นปุ่มของหัวหน้าภาคเท่านั้น
  if (isAdmin) {
    return (
      <View style={styles.actions}>
        {detail}
        {go}
      </View>
    );
  }
  const review = r.adminReview;
  const side = review?.answered ? (
    ack
  ) : review ? (
    <TouchableOpacity style={[styles.sideBtn, styles.undoBtn]} onPress={() => cancelAdminReview(r, onChanged)} accessibilityLabel={`ยกเลิกคำขอ ${r.code}`}>
      <Ionicons name="close" size={16} color={colors.textMuted} />
      <Text style={[styles.sideText, { color: colors.textMuted }]}>ยกเลิกคำขอ</Text>
    </TouchableOpacity>
  ) : (
    <TouchableOpacity style={[styles.sideBtn, styles.adminBtn]} onPress={onSend} accessibilityLabel={`ส่งกลับให้แอดมินตรวจสอบ ${r.code}`}>
      <Ionicons name="arrow-undo" size={16} color={colors.roleAdmin} />
      <Text style={[styles.sideText, { color: colors.roleAdmin }]} numberOfLines={1}>
        ส่งกลับให้แอดมินตรวจสอบ
      </Text>
    </TouchableOpacity>
  );
  if (wide) {
    return (
      <View style={styles.actions}>
        {detail}
        {side}
        {go}
      </View>
    );
  }
  return (
    <View>
      <View style={styles.actions}>
        {detail}
        <View style={{ flex: 1 }}>{side}</View>
      </View>
      {go}
    </View>
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
  // จอแคบ: ปุ่มขั้นแถวของตัวเองใต้ปุ่มรายละเอียด/ปุ่มรอง — แยกสไตล์ ไม่ทับ flex ของ goBtn
  // (flex: 0 ทับ flex: 1 บนเว็บได้ปุ่มสูงศูนย์ มองไม่เห็นทั้งที่ยังกดได้)
  goFull: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    marginTop: spacing.sm,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.navyFill,
  },
  sideBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  sideText: { fontSize: 13.5, lineHeight: 20, fontWeight: "700", flexShrink: 1 },
  // สีแอดมิน — ปุ่มนี้ส่งลูกบอลไปที่แอดมิน
  adminBtn: { borderWidth: 1.5, borderColor: colors.roleAdminLine },
  undoBtn: { borderWidth: 1, borderColor: colors.borderStrong },
  ackBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.success },
  replyBtn: { backgroundColor: colors.roleAdmin },
});
