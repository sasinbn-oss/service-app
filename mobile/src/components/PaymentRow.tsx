/**
 * แถวใบรอลูกค้าจ่ายเงิน + "ตามลูกค้าแล้ว" ในแถว (เจ้าของงานเลือก 5 พ.ย. 69 · ตัวอย่าง paytab และ myday — "ทำตามที่แนะนำ")
 *
 * ตัวเดียวใช้สองที่: แท็บ "รอลูกค้าจ่ายเงิน" ในหน้าใบงานซ่อม (variant "tab") และหัวข้อเดียวกันในงานของฉันวันนี้ของแอดมิน
 * (variant "queue") — การจดการตามต้องทำงานเหมือนกันทุกที่ ถ้ามีสองชุด วันหนึ่งจะแก้ชุดเดียวแล้วสองหน้าจดไม่เหมือนกัน
 * · กด "ตามลูกค้าแล้ว" = ช่องสั้น ๆ "ลูกค้าว่ายังไง" กางใต้แถว (ไม่บังคับ) → POST /payment-followup → แถวขึ้น "วันนี้ · …" ทันที
 *   ไม่ต้องเปิดใบทีละใบ และไม่โหลดรายการใหม่ (แถวไม่กระโดดใต้นิ้ว)
 * · กดแถว / › = เปิดใบงาน · จอแคบเป็นการ์ด (ตารางหกคอลัมน์ไม่พอที่)
 */
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextStyle } from "react-native";
import axios from "axios";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import Spinner from "./Spinner";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { machineTag } from "../utils/machine";
import { PAY_GO_LABEL, followDay, followText, payDaysText, type PayWaitRow } from "./PaymentWait";
import { colors, headingFont, radius, spacing } from "../theme";
import type { WorkOrderRow } from "../screens/WorkOrderListScreen";

/** ตัวเลขของแท็บ (payTab ในคำตอบรายการ) — never + followed = total เสมอ · alertDays = เส้น "เกิน N วัน" ของเซิร์ฟเวอร์ */
export interface PayTabSummary {
  total: number;
  over: number;
  never: number;
  followed: number;
  alertDays: number;
}

/** แถวในรายการที่มี payWait (ขั้นรอลูกค้าจ่ายเงิน) — quoted มาจากเซิร์ฟเวอร์รุ่นที่มีแท็บนี้ */
export type PayRow = WorkOrderRow & { payWait: PayWaitRow & { quoted?: { at: string; byName: string | null } | null } };

/**
 * คอลัมน์ตารางจอคอมของงานของฉันวันนี้ (ตัวอย่าง myday: ใบงาน · สาขา · งาน/เครื่อง · ข้อมูลของหัวข้อ · ปุ่ม) — แถวของหัวข้ออื่นและหัวตาราง
 * ใช้ชุดเดียวกับแถวรอเงิน ไม่งั้นคอลัมน์ของหัวข้อรอเงินเหลื่อมกับหัวตาราง
 */
export const QUEUE_COL = StyleSheet.create({
  code: { width: 116 },
  branch: { flex: 2.1, minWidth: 0 },
  work: { flex: 1.2, minWidth: 0 },
  info: { flex: 2.5, minWidth: 0 },
  // กว้างคงที่ — ปุ่มของแถว (รายละเอียด · ปุ่มขั้น · เลื่อนวันนัด) ยืดเต็มช่องนี้ ไม่ใช่บีบตามความยาวข้อความ
  actions: { width: 300 },
});
/** คอลัมน์ตารางของแท็บ (ตัวอย่าง paytab: ใบงาน · สาขา·งาน · ส่งใบเสนอราคา · รอมาแล้ว · ตามลูกค้าล่าสุด · ปุ่ม) */
export const TAB_COL = StyleSheet.create({
  code: { width: 116 },
  branch: { flex: 2.3, minWidth: 0 },
  quoted: { flex: 1.6, minWidth: 0 },
  days: { width: 110 },
  last: { flex: 2.4, minWidth: 0 },
  actions: { width: 190, flexDirection: "row", justifyContent: "flex-end", gap: 6 },
});

type Render = (text: string, style: TextStyle | TextStyle[], lines?: number) => React.ReactNode;
const plain: Render = (text, style, lines) => (
  <Text style={style} numberOfLines={lines}>
    {text}
  </Text>
);

/** ตามแล้ววันนี้ — สีเขียว (ตัวอย่าง: "วันนี้ · ลูกค้าบอกจะโอนวันศุกร์") · ตามวันก่อนสีปกติ · ไม่เคยตามแดง */
function lastTone(p: PayWaitRow) {
  if (!p.last) return styles.never;
  return followDay(p.last.at) === "วันนี้" ? styles.today : styles.lastText;
}

export function PaymentRow({
  row,
  variant,
  wide,
  canFollow,
  onOpen,
  onAttach,
  onFollowed,
  onStale,
  render = plain,
  actionsTarget,
}: {
  row: PayRow;
  variant: "tab" | "queue";
  /** จอกว้าง = แถวตาราง · จอแคบ = การ์ด */
  wide: boolean;
  /** แอดมินที่ทำขั้นนี้ได้ (เซิร์ฟเวอร์กันอีกชั้น) — ไม่ได้ = ไม่มีปุ่มตาม */
  canFollow: boolean;
  onOpen: () => void;
  /** งานของฉันวันนี้: ปุ่มหลัก "ลูกค้าจ่ายแล้ว · แนบบิล" — เปิดใบพร้อมฟอร์มแนบบิล */
  onAttach?: () => void;
  /** จดการตามแล้ว — payWait ชุดใหม่ (ช่องลำดับเดิม) ให้ผู้เรียกแทนในแถวของตัวเอง */
  onFollowed: (p: PayRow["payWait"]) => void;
  /** ใบเพิ่งเดินขั้นไปแล้ว (409) — ผู้เรียกโหลดรายการใหม่ */
  onStale?: () => void;
  /** วาดข้อความ (งานของฉันวันนี้ไฮไลต์คำค้น) */
  render?: Render;
  /** ชื่อจุดของสอนการใช้งาน (howtoTarget) ที่ช่องปุ่ม — งานของฉันวันนี้ชี้ "ปุ่มของขั้นนี้" */
  actionsTarget?: object | null;
}) {
  const p = row.payWait;
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const { data } = await api.post<{ payWait: { followUps: { at: string; note: string | null; byName: string | null }[] } | null }>(
        `/work-orders/${row.id}/payment-followup`,
        { note: note.trim() || undefined }
      );
      const fu = data.payWait?.followUps ?? [];
      // แทนเฉพาะสองช่องของการตาม ลำดับช่องเดิม — ตัวเช็คของใหม่เบื้องหลังเทียบแถวด้วย JSON ถ้าลำดับเปลี่ยนจะขึ้น "มีอัปเดต" ปลอม
      onFollowed({ ...p, follows: fu.length, last: fu[0] ? { at: fu[0].at, note: fu[0].note, byName: fu[0].byName } : null });
      setEditing(false);
      setNote("");
    } catch (e) {
      showAlert("บันทึกการตามลูกค้าไม่สำเร็จ", apiErrorMessage(e));
      if (axios.isAxiosError(e) && e.response?.status === 409) onStale?.();
    } finally {
      setBusy(false);
    }
  }

  const code = row.code;
  const what = [row.symptom || row.title, row.machineCode ? `เครื่อง ${machineTag(row.machineCode, row.machineCapacityKg)}` : null]
    .filter(Boolean)
    .join(" · ");
  const quoted = p.quoted ? `${followDay(p.quoted.at)}${p.quoted.byName ? ` · ${p.quoted.byName}` : ""}` : "—";
  const lastLine = p.last ? followText(p.last) : "ยังไม่เคยตาม";
  const urgent = row.priority === "URGENT";

  const followBtn = canFollow ? (
    <TouchableOpacity
      style={[styles.btn, styles.btnGhost, editing && styles.btnGhostOn]}
      onPress={() => setEditing((v) => !v)}
      accessibilityLabel={`ตามลูกค้าแล้ว ${code}`}
      aria-expanded={editing}
    >
      <Text style={styles.btnGhostText} numberOfLines={1}>
        ตามลูกค้าแล้ว
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

  const form = editing ? (
    // จอคอม: ช่องเริ่มตรงคอลัมน์สาขา (ตัวอย่าง) · การ์ด: ชิดขอบการ์ด
    <View
      style={[styles.form, wide ? variant === "tab" && { paddingLeft: 116 + spacing.md * 2 } : styles.formCard]}
      accessibilityLabel={`ฟอร์มตามลูกค้า ${code}`}
    >
      <Text style={styles.formLabel}>ลูกค้าว่ายังไง</Text>
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={setNote}
        maxLength={300}
        autoFocus
        placeholder="เช่น จะโอนวันศุกร์ (ไม่บังคับ)"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel={`ลูกค้าว่ายังไง ${code}`}
        onSubmitEditing={() => void save()}
      />
      <View style={styles.formBtns}>
        <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setEditing(false)} disabled={busy} accessibilityLabel={`ยกเลิกการตาม ${code}`}>
          <Text style={styles.btnGhostText}>ยกเลิก</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnNavy, { minWidth: 84 }]} onPress={() => void save()} disabled={busy} accessibilityLabel={`บันทึกการตามลูกค้า ${code}`}>
          {busy ? <Spinner color="#fff" size="small" /> : <Text style={styles.btnNavyText}>บันทึก</Text>}
        </TouchableOpacity>
      </View>
    </View>
  ) : null;

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
          <View style={TAB_COL.last}>
            <Text style={[styles.cell, lastTone(p)]} numberOfLines={2}>
              {lastLine}
            </Text>
          </View>
          <View style={TAB_COL.actions}>
            {followBtn}
            {tail}
          </View>
        </TouchableOpacity>
        {form}
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
          <View style={QUEUE_COL.info}>
            <Text style={[styles.info, p.over && styles.infoOver]}>{payDaysText(p)}</Text>
            <Text style={[styles.sub, lastTone(p)]} numberOfLines={2}>
              {p.last ? `ตามล่าสุด ${lastLine}` : lastLine}
            </Text>
          </View>
          <View style={[QUEUE_COL.actions, styles.btnRow]} {...actionsTarget}>
            {followBtn}
            {tail}
          </View>
        </TouchableOpacity>
        {form}
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
        <Text style={[styles.sub, lastTone(p)]} numberOfLines={2}>
          {p.last ? `ตามล่าสุด ${lastLine}` : lastLine}
        </Text>
      </TouchableOpacity>
      <View style={styles.cardBtns} {...actionsTarget}>
        {followBtn ? <View style={{ flex: 1 }}>{followBtn}</View> : null}
        {variant === "queue" ? (tail ? <View style={{ flex: 1.4 }}>{tail}</View> : null) : tail}
      </View>
      {form}
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
  today: { color: colors.successInk, fontWeight: "700" },
  never: { color: colors.dangerInk, fontWeight: "700" },
  info: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.text },
  infoOver: { color: colors.dangerInk },
  sub: { fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
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
  form: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: 12,
    paddingTop: 2,
  },
  formCard: { paddingHorizontal: 0, paddingBottom: 0 },
  formLabel: { fontSize: 13, fontWeight: "700", color: colors.body },
  input: {
    flex: 1,
    minWidth: 180,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13.5,
    color: colors.text,
    backgroundColor: colors.card,
  },
  formBtns: { flexDirection: "row", gap: spacing.sm },
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
