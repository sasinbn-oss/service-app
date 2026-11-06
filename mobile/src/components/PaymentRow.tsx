/**
 * แถวใบรอลูกค้าจ่ายเงิน + "ตามลูกค้าแล้ว" / "ลูกค้าไม่ซ่อม" ในแถว (เจ้าของงานเลือก 5–6 พ.ย. 69 · ตัวอย่าง paytab และ myday — "ทำตามที่แนะนำ")
 *
 * ตัวเดียวใช้สองที่: แท็บ "รอลูกค้าจ่ายเงิน" ในหน้าใบงานซ่อม (variant "tab") และหัวข้อเดียวกันในงานของฉันวันนี้ของแอดมิน
 * (variant "queue") — การจดการตามต้องทำงานเหมือนกันทุกที่ ถ้ามีสองชุด วันหนึ่งจะแก้ชุดเดียวแล้วสองหน้าจดไม่เหมือนกัน
 * · คอลัมน์ "ตามลูกค้าล่าสุด" (6 พ.ย. 69): เมื่อไร · ใคร (วันนี้เขียว) / หมายเหตุ / ป้ายนัดจ่าย + "ตาม n ครั้ง · ดูทั้งหมด" กางทุกครั้งใต้แถว
 *   ไม่เคยตามแดง "ยังไม่เคยตาม" · ข้อมูลมากับแถว (payWait.followUps) กางได้ทันที
 * · กด "ตามลูกค้าแล้ว" = ฟอร์มตัวเดียวกับหน้าใบงาน (FollowUpForm: ข้อความลัด · ลูกค้านัดจ่ายวันที่) กางใต้แถว → แถวขึ้นการตามใหม่ทันที
 *   ไม่ต้องเปิดใบทีละใบ และไม่โหลดรายการใหม่ (แถวไม่กระโดดใต้นิ้ว)
 * · กด "ลูกค้าไม่ซ่อม" = ฟอร์มตัวเดียวกับหน้าใบงาน (DeclineInline → DeclineForm) กางใต้แถว → ใบยกเลิก ผู้เรียกเอาแถวออก
 * · กดแถว / › = เปิดใบงาน · จอแคบเป็นการ์ด (ตารางหกคอลัมน์ไม่พอที่)
 */
import React, { useState } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { machineTag } from "../utils/machine";
import {
  DeclineInline,
  FollowHistory,
  FollowUpForm,
  NO_NOTE,
  PAY_GO_LABEL,
  PromiseBadge,
  followDay,
  followWhen,
  followedToday,
  payDaysText,
  type PayWaitDetail,
  type PayWaitRow,
} from "./PaymentWait";
import { colors, headingFont, radius, spacing } from "../theme";
import type { WorkOrderRow } from "../screens/WorkOrderListScreen";

/**
 * ตัวเลขของแท็บ (payTab ในคำตอบรายการ) — never + followed = total เสมอ · alertDays = เส้น "เกิน N วัน" ของเซิร์ฟเวอร์
 * late = เลยวันที่ลูกค้านัดจ่าย (6 พ.ย. 69 — เซิร์ฟเวอร์รุ่นก่อนไม่มี)
 */
export interface PayTabSummary {
  total: number;
  over: number;
  never: number;
  followed: number;
  late?: number;
  alertDays: number;
}

/** แถวในรายการที่มี payWait (ขั้นรอลูกค้าจ่ายเงิน) — quoted มาจากเซิร์ฟเวอร์รุ่นที่มีแท็บนี้ */
export type PayRow = WorkOrderRow & { payWait: PayWaitRow & { quoted?: { at: string; byName: string | null } | null } };

/**
 * payWait ของแถวหลังจดการตาม — เอาการตาม/นัดจ่ายจากคำตอบของหน้าใบงาน (รูปเดียวกับของรายการ — followView ของเซิร์ฟเวอร์)
 * แทนเฉพาะช่องของการตาม ลำดับช่องเดิม (spread ของเดิมก่อน) — ตัวเช็คของใหม่เบื้องหลังเทียบแถวด้วย JSON ถ้าลำดับเปลี่ยนจะขึ้น "มีอัปเดต" ปลอม
 */
export function payWaitAfterFollow(p: PayRow["payWait"], d: PayWaitDetail): PayRow["payWait"] {
  const fu = d.followUps;
  const last = fu[0] ? { at: fu[0].at, note: fu[0].note, byName: fu[0].byName, payBy: fu[0].payBy ?? null } : null;
  return { ...p, follows: fu.length, last, promise: d.promise ?? null, followUps: fu };
}

/**
 * คอลัมน์ตารางจอคอมของงานของฉันวันนี้ (ตัวอย่าง myday: ใบงาน · สาขา · งาน/เครื่อง · ข้อมูลของหัวข้อ · ปุ่ม) — แถวของหัวข้ออื่นและหัวตาราง
 * ใช้ชุดเดียวกับแถวรอเงิน ไม่งั้นคอลัมน์ของหัวข้อรอเงินเหลื่อมกับหัวตาราง
 */
export const QUEUE_COL = StyleSheet.create({
  code: { width: 116 },
  branch: { flex: 1.7, minWidth: 0 },
  work: { flex: 1.3, minWidth: 0 },
  info: { flex: 2.3, minWidth: 0 },
  // กว้างคงที่ — ปุ่มของแถว (รายละเอียด · ปุ่มขั้น · เลื่อนวันนัด) ยืดเต็มช่องนี้ ไม่ใช่บีบตามความยาวข้อความ
  actions: { width: 290 },
});
/**
 * คอลัมน์ตารางของแท็บ (ตัวอย่าง paytab: ใบงาน · สาขา·งาน · ส่งใบเสนอราคา · รอมาแล้ว · ตามลูกค้าล่าสุด · ปุ่ม)
 * ช่องปุ่มกว้างพอสามปุ่ม (ลูกค้าไม่ซ่อม · ตามลูกค้าแล้ว · ›) แถวเดียว — ช่องตามล่าสุดได้ส่วนกว้างสุด (สามบรรทัด + ป้าย)
 */
export const TAB_COL = StyleSheet.create({
  code: { width: 116 },
  branch: { flex: 1.9, minWidth: 0 },
  quoted: { flex: 1.2, minWidth: 0 },
  days: { width: 96 },
  last: { flex: 2.9, minWidth: 0 },
  actions: { width: 252, flexDirection: "row", justifyContent: "flex-end", gap: 6 },
});

type Render = (text: string, style: TextStyle | TextStyle[], lines?: number) => React.ReactNode;
const plain: Render = (text, style, lines) => (
  <Text style={style} numberOfLines={lines}>
    {text}
  </Text>
);

/**
 * ช่อง "ตามลูกค้าล่าสุด" (ตัวอย่างที่ตกลง 6 พ.ย. 69) — บรรทัด 1 เมื่อไร · ใคร (วันนี้เขียว) · บรรทัด 2 หมายเหตุ (ไม่เกินสองบรรทัด)
 * · บรรทัด 3 ป้ายนัดจ่าย + "ตาม n ครั้ง · ดูทั้งหมด ⌄" (ตามมากกว่าครั้งเดียวในรอบนี้) · ไม่เคยตาม = "ยังไม่เคยตาม" แดง
 * prefix = "ตามล่าสุด " ในงานของฉันวันนี้/การ์ด (ช่องนั้นไม่มีหัวคอลัมน์บอก)
 */
function FollowCell({
  p,
  code,
  open,
  onToggle,
  prefix = "",
}: {
  p: PayWaitRow;
  code: string;
  open: boolean;
  onToggle: () => void;
  prefix?: string;
}) {
  if (!p.last) return <Text style={[styles.cell, styles.never]}>ยังไม่เคยตาม</Text>;
  const many = p.follows > 1 && (p.followUps?.length ?? 0) > 1;
  const today = followedToday(p.last.at);
  return (
    <View style={styles.followCell}>
      <Text style={[styles.when, today ? styles.today : null]} numberOfLines={1}>
        {prefix}
        {followWhen(p.last.at)}
        {p.last.byName ? ` · ${p.last.byName}` : ""}
      </Text>
      <Text style={[styles.cell, styles.lastText, !p.last.note && styles.noNote]} numberOfLines={2}>
        {p.last.note ?? NO_NOTE}
      </Text>
      {p.promise || many ? (
        <View style={styles.line3}>
          {p.promise ? <PromiseBadge p={p.promise} /> : null}
          {many ? (
            <TouchableOpacity
              style={styles.more}
              onPress={onToggle}
              accessibilityLabel={`${open ? "ซ่อนการตาม" : `ดูการตามทั้งหมด ${p.follows} ครั้ง`} ${code}`}
              // ปุ่มกาง/พับ — เว็บไม่แปลง accessibilityState (CLAUDE.md) เทสต์อ่านสถานะจาก aria-expanded
              aria-expanded={open}
            >
              <Text style={styles.moreText}>{open ? "ซ่อน ⌃" : `ตาม ${p.follows} ครั้ง · ดูทั้งหมด ⌄`}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function PaymentRow({
  row,
  variant,
  wide,
  canAct,
  onOpen,
  onAttach,
  onFollowed,
  onDeclined,
  onStale,
  render = plain,
  actionsTarget,
}: {
  row: PayRow;
  variant: "tab" | "queue";
  /** จอกว้าง = แถวตาราง · จอแคบ = การ์ด */
  wide: boolean;
  /**
   * กด "ตามลูกค้าแล้ว" / "ลูกค้าไม่ซ่อม" ได้ — กติกาเดียวกับหน้าใบงาน (แอดมินที่ทำขั้นนี้ได้ ไม่ใช่ Admin Spare Part/ดูในฐานะ)
   * ผู้เรียกคิดให้ · แถวไม่เปิดสิทธิ์เพิ่ม (เซิร์ฟเวอร์กันอีกชั้น) · ไม่ได้ = ไม่มีปุ่มทั้งสอง
   */
  canAct: boolean;
  onOpen: () => void;
  /** งานของฉันวันนี้: ปุ่มหลัก "ลูกค้าจ่ายแล้ว · แนบบิล" — เปิดใบพร้อมฟอร์มแนบบิล */
  onAttach?: () => void;
  /** จดการตามแล้ว — payWait ชุดใหม่ (ช่องลำดับเดิม) ให้ผู้เรียกแทนในแถวของตัวเอง */
  onFollowed: (p: PayRow["payWait"]) => void;
  /** ลูกค้าไม่ซ่อม — ใบยกเลิกแล้ว ผู้เรียกเอาแถวออกและปรับตัวเลข (ไม่โหลดรายการใหม่) */
  onDeclined: () => void;
  /** ใบเพิ่งเดินขั้นไปแล้ว (409) — ผู้เรียกโหลดรายการใหม่ */
  onStale?: () => void;
  /** วาดข้อความ (งานของฉันวันนี้ไฮไลต์คำค้น) */
  render?: Render;
  /** ชื่อจุดของสอนการใช้งาน (howtoTarget) ที่ช่องปุ่ม — งานของฉันวันนี้ชี้ "ปุ่มของขั้นนี้" */
  actionsTarget?: object | null;
}) {
  const p = row.payWait;
  const [panel, setPanel] = useState<"follow" | "decline" | null>(null);
  const [showAll, setShowAll] = useState(false);
  const toggle = (k: "follow" | "decline") => setPanel((v) => (v === k ? null : k));

  const code = row.code;
  const what = [row.symptom || row.title, row.machineCode ? `เครื่อง ${machineTag(row.machineCode, row.machineCapacityKg)}` : null]
    .filter(Boolean)
    .join(" · ");
  const quoted = p.quoted ? `${followDay(p.quoted.at)}${p.quoted.byName ? ` · ${p.quoted.byName}` : ""}` : "—";
  const urgent = row.priority === "URGENT";
  const cell = (prefix?: string) => <FollowCell p={p} code={code} open={showAll} onToggle={() => setShowAll((v) => !v)} prefix={prefix} />;

  const followBtn = canAct ? (
    <TouchableOpacity
      style={[styles.btn, styles.btnGhost, panel === "follow" && styles.btnGhostOn]}
      onPress={() => toggle("follow")}
      accessibilityLabel={`ตามลูกค้าแล้ว ${code}`}
      aria-expanded={panel === "follow"}
    >
      <Text style={styles.btnGhostText} numberOfLines={1}>
        ตามลูกค้าแล้ว
      </Text>
    </TouchableOpacity>
  ) : null;
  // ปุ่มรองสีแดงแบบหน้าใบงาน (PayWaitButtons) — เป็นทางจบของใบ จึงไม่ใช่ปุ่มทึบ กดผิดยังมีฟอร์มให้เลือกเหตุผลก่อน
  const declineBtn = canAct ? (
    <TouchableOpacity
      style={[styles.btn, styles.btnDecline, panel === "decline" && styles.btnDeclineOn]}
      onPress={() => toggle("decline")}
      accessibilityLabel={`ลูกค้าไม่ซ่อม ${code}`}
      aria-expanded={panel === "decline"}
    >
      <Text style={styles.btnDeclineText} numberOfLines={1}>
        ลูกค้าไม่ซ่อม
      </Text>
    </TouchableOpacity>
  ) : null;
  const tail =
    variant === "queue" ? (
      onAttach ? (
        <TouchableOpacity style={[styles.btn, styles.btnNavy]} onPress={onAttach} accessibilityLabel={`${PAY_GO_LABEL} ${code}`}>
          <Text style={styles.btnNavyText} numberOfLines={1}>
            {PAY_GO_LABEL}
          </Text>
        </TouchableOpacity>
      ) : null
    ) : (
      <TouchableOpacity style={[styles.btn, styles.btnOpen]} onPress={onOpen} accessibilityLabel={`เปิดใบงาน ${code}`}>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    );
  const codeCell = (
    <View style={styles.codeCell}>
      {render(code, [styles.code, headingFont as TextStyle])}
      {urgent ? (
        <View style={styles.urgent}>
          <Text style={styles.urgentText}>ด่วน</Text>
        </View>
      ) : null}
    </View>
  );
  const daysText = p.days < 1 ? "วันนี้" : `${p.days} วัน`;

  // ใต้แถว: ฟอร์มที่กาง + การตามทั้งหมด · จอคอม (แท็บ) เริ่มตรงคอลัมน์สาขา (ตัวอย่าง) · การ์ดชิดขอบการ์ด
  const under = wide ? (variant === "tab" ? styles.underTab : styles.underWide) : styles.underCard;
  const below = (
    <>
      {panel === "follow" ? (
        <FollowUpForm
          orderId={row.id}
          code={code}
          autoFocus
          style={under}
          onCancel={() => setPanel(null)}
          onStale={onStale}
          onSaved={(d) => {
            setPanel(null);
            if (d) onFollowed(payWaitAfterFollow(p, d));
            else onStale?.();
          }}
        />
      ) : null}
      {panel === "decline" ? (
        <DeclineInline orderId={row.id} code={code} style={under} onCancel={() => setPanel(null)} onStale={onStale} onDone={onDeclined} />
      ) : null}
      {showAll && p.followUps && p.followUps.length > 1 ? <FollowHistory items={p.followUps} code={code} style={under} /> : null}
    </>
  );

  if (wide && variant === "tab") {
    return (
      <View style={[styles.wrap, p.over && styles.wrapOver]} accessibilityLabel={`แถวรอจ่าย ${code}`}>
        <TouchableOpacity style={styles.tr} onPress={onOpen} activeOpacity={0.75}>
          <View style={TAB_COL.code}>{codeCell}</View>
          <View style={TAB_COL.branch}>
            {render(`${row.branchCode} ${row.branchName}`, styles.branch, 1)}
            {render(what, styles.muted, 1)}
          </View>
          <View style={TAB_COL.quoted}>
            <Text style={styles.cell} numberOfLines={2}>
              {quoted}
            </Text>
          </View>
          <View style={TAB_COL.days}>
            <View style={[styles.days, p.over && styles.daysOver]} accessibilityLabel={`${payDaysText(p)}${p.over ? ` · เกิน ${p.alertDays} วัน` : ""}`}>
              <Text style={[styles.daysText, p.over && styles.daysTextOver]}>{daysText}</Text>
            </View>
          </View>
          <View style={TAB_COL.last}>{cell()}</View>
          <View style={TAB_COL.actions}>
            {declineBtn}
            {followBtn}
            {tail}
          </View>
        </TouchableOpacity>
        {below}
      </View>
    );
  }
  if (wide) {
    return (
      <View style={[styles.wrap, p.over && styles.wrapOver]} accessibilityLabel={`แถวรอจ่าย ${code}`}>
        <TouchableOpacity style={styles.tr} onPress={onOpen} activeOpacity={0.75}>
          <View style={QUEUE_COL.code}>{codeCell}</View>
          <View style={QUEUE_COL.branch}>{render(`${row.branchCode} ${row.branchName}`, styles.branch, 2)}</View>
          <View style={QUEUE_COL.work}>{render(what, styles.cell, 2)}</View>
          <View style={[QUEUE_COL.info, { gap: 2 }]}>
            <Text style={[styles.info, p.over && styles.infoOver]}>{payDaysText(p)}</Text>
            {cell("ตามล่าสุด ")}
          </View>
          {/* ปุ่มหลักสองปุ่มบรรทัดแรก · "ลูกค้าไม่ซ่อม" ขึ้นบรรทัดถัดไปเมื่อช่องไม่พอ (ช่องปุ่มกว้างเท่าหัวข้ออื่น) */}
          <View style={[QUEUE_COL.actions, styles.btnRow]} {...actionsTarget}>
            {followBtn}
            {tail}
            {declineBtn}
          </View>
        </TouchableOpacity>
        {below}
      </View>
    );
  }
  // จอแคบ: การ์ด — ข้อมูลเดียวกับแถวตาราง เรียงบรรทัดลงมา · ปุ่มเต็มแถวล่าง (กดง่ายบนมือถือ)
  return (
    <View style={[styles.card, p.over && styles.cardOver]} accessibilityLabel={`แถวรอจ่าย ${code}`}>
      <TouchableOpacity onPress={onOpen} activeOpacity={0.8} style={{ gap: 3 }}>
        <View style={styles.cardTop}>
          {codeCell}
          <View style={{ flex: 1 }} />
          <View style={[styles.days, p.over && styles.daysOver]}>
            <Text style={[styles.daysText, p.over && styles.daysTextOver]}>{payDaysText(p)}</Text>
          </View>
        </View>
        {render(`${row.branchCode} ${row.branchName}`, styles.branch, 2)}
        {render(what, styles.muted, 2)}
        {variant === "tab" ? <Text style={styles.muted}>ส่งใบเสนอราคา {quoted}</Text> : null}
        {cell("ตามล่าสุด ")}
      </TouchableOpacity>
      {variant === "queue" ? (
        // งานของฉันวันนี้: ปุ่มหลัก (ตาม · แนบบิล) แถวบน ลูกค้าไม่ซ่อมแถวล่าง — สามปุ่มแถวเดียวบนจอ 390 ตัวหนังสือถูกตัด
        <View style={{ gap: spacing.sm }} {...actionsTarget}>
          <View style={styles.cardBtns}>
            {followBtn ? <View style={{ flex: 1 }}>{followBtn}</View> : null}
            {tail ? <View style={{ flex: 1.4 }}>{tail}</View> : null}
          </View>
          {declineBtn ? <View style={styles.cardBtns}>{declineBtn}</View> : null}
        </View>
      ) : (
        <View style={styles.cardBtns} {...actionsTarget}>
          {declineBtn ? <View style={{ flex: 1 }}>{declineBtn}</View> : null}
          {followBtn ? <View style={{ flex: 1 }}>{followBtn}</View> : null}
          {tail}
        </View>
      )}
      {below}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  // เกินเส้น = พื้นแดงจางทั้งแถว (ตัวอย่าง) ใบที่ควรตามเห็นจากสีโดยไม่ต้องอ่านเลข
  wrapOver: { backgroundColor: colors.dangerSoft },
  tr: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 9, paddingHorizontal: spacing.md },
  codeCell: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  code: { fontSize: 14.5, lineHeight: 22, fontWeight: "700", color: colors.primaryInk, fontVariant: ["tabular-nums"] },
  urgent: { backgroundColor: colors.dangerFill, borderRadius: 999, paddingHorizontal: 8 },
  urgentText: { color: "#fff", fontSize: 11.5, lineHeight: 18, fontWeight: "700" },
  branch: { fontSize: 13.5, lineHeight: 20, fontWeight: "700", color: colors.text },
  muted: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
  cell: { fontSize: 13, lineHeight: 19, color: colors.body },
  lastText: { color: colors.text },
  noNote: { color: colors.textMuted },
  today: { color: colors.successInk, fontWeight: "700" },
  never: { color: colors.dangerInk, fontWeight: "700" },
  followCell: { gap: 2, minWidth: 0 },
  when: { fontSize: 12.5, lineHeight: 18, color: colors.body, fontVariant: ["tabular-nums"] },
  line3: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 2 },
  more: { minHeight: 24, justifyContent: "center", paddingHorizontal: 2 },
  moreText: { fontSize: 12.5, lineHeight: 18, fontWeight: "700", color: colors.navy, textDecorationLine: "underline" },
  info: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.text },
  infoOver: { color: colors.dangerInk },
  days: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  daysOver: { backgroundColor: colors.dangerFill, borderColor: colors.dangerFill },
  daysText: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.warningInk, fontVariant: ["tabular-nums"] },
  daysTextOver: { color: "#fff" },
  btn: { minHeight: 38, borderRadius: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  btnGhost: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card },
  btnGhostOn: { backgroundColor: colors.primarySoft, borderColor: colors.navy },
  btnGhostText: { fontSize: 13, fontWeight: "700", color: colors.navy },
  btnNavy: { backgroundColor: colors.navyFill },
  btnNavyText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  btnOpen: { width: 38, paddingHorizontal: 0, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  btnDecline: { borderWidth: 1, borderColor: colors.dangerLine, backgroundColor: colors.card },
  btnDeclineOn: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerInk },
  btnDeclineText: { fontSize: 13, fontWeight: "700", color: colors.dangerInk },
  // เริ่มตรงคอลัมน์สาขา: ขอบแถว + ช่องใบงาน 116 + ช่องว่างระหว่างคอลัมน์ (styles.tr)
  underTab: { marginLeft: 116 + spacing.md * 2, marginRight: spacing.md, marginBottom: 12 },
  underWide: { marginLeft: spacing.md, marginRight: spacing.md, marginBottom: 12 },
  underCard: {},
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.warningBorder,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardOver: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerLine, borderLeftColor: colors.danger },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardBtns: { flexDirection: "row", gap: spacing.sm },
  btnRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6 },
});
