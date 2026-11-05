/**
 * ขั้นรอลูกค้าจ่ายเงิน (เจ้าของงานเลือก 5 พ.ย. 69 · ตามตัวอย่างที่ตกลง — ตอบ "ตามที่แนะนำ" ทั้ง 4 ข้อ)
 *
 * ขั้นนี้มีอยู่แล้ว (AWAITING_PAYMENT) แต่จอเขียนว่า "แอดมิน · แนบบิลรับเงิน" — อ่านแล้วเหมือนงานค้างของแอดมิน
 * ไม่บอกว่ากำลังรอลูกค้า รอมากี่วัน หรือตามลูกค้าไปแล้วหรือยัง · ไฟล์นี้รวมทุกอย่างของขั้นนี้ไว้ที่เดียว:
 * การ์ดขั้นปัจจุบัน (ส่งใบเสนอราคาเมื่อไร · รอมากี่วัน · การตามลูกค้า · ลูกค้าไม่ซ่อม) และข้อความที่รายการ/กล่องงานใช้
 *
 * ตัวเลขวันกับเส้น "เกิน N วัน" มาจากเซิร์ฟเวอร์ (payWait) ทั้งหมด — ไม่มีเลข 3 ในแอป และนับจากจุดเดียวกับ
 * "ค้างขั้นนี้มา N วัน" (เข้าขั้นนี้เมื่อไร) สองตัวเลขบนจอเดียวกันจึงไม่ขัดกัน
 */
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import Spinner from "./Spinner";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { shortDay } from "./claims/ClaimTrail";
import { colors, radius, spacing } from "../theme";

/** ชื่อปุ่มหลักของขั้นนี้ — พฤติกรรมเดิม (เปิดฟอร์มแนบบิล) ชื่อใหม่บอกว่ากดเมื่อไร: ลูกค้าจ่ายแล้ว */
export const PAY_GO_LABEL = "ลูกค้าจ่ายแล้ว · แนบบิล";

/** ส่วนที่รายการ กล่องงาน และหน้าใบงานใช้ร่วมกัน — since = เข้าขั้นนี้เมื่อไร (ตัวเดียวกับ stageSince) */
export interface PayWaitBase {
  since: string;
  /** วันเต็มตามเวลาไทยนับจาก since (วันนี้ = 0) — เซิร์ฟเวอร์คิด แอปไม่คิดเอง */
  days: number;
  /** รอเกินเส้น (alertDays) แล้ว — แดง "ควรตามลูกค้า" */
  over: boolean;
  alertDays: number;
}
export interface FollowUp {
  at: string;
  note: string | null;
  byName: string | null;
}
/** แถวในรายการ/กล่องงาน — ตามล่าสุดอย่างเดียว (การ์ดในกล่องงานบอกแค่ล่าสุด) */
export interface PayWaitRow extends PayWaitBase {
  follows: number;
  last: FollowUp | null;
}
/** หน้าใบงาน — ส่งใบเสนอราคาเมื่อไร ใคร · การตามทุกครั้งของรอบนี้ · ของที่ออกจากคลังแล้ว (ยกเลิก = ต้องคืน) */
export interface PayWaitDetail extends PayWaitBase {
  quoted: { at: string; byName: string | null } | null;
  followUps: (FollowUp & { id: number })[];
  issued: { name: string; ref: string }[];
}
export interface DeclineReason {
  value: string;
  label: string;
}

/** "รอมาแล้ว 4 วัน" · วันแรกยังไม่ครบวัน — "เริ่มรอวันนี้" (ไม่ใช่ "รอมาแล้ว 0 วัน") */
export function payDaysText(p: PayWaitBase) {
  return p.days < 1 ? "เริ่มรอวันนี้" : `รอมาแล้ว ${p.days} วัน`;
}
export function payOverText(p: PayWaitBase) {
  return `เกิน ${p.alertDays} วัน — ควรตามลูกค้า`;
}
/** ป้ายบนหัวใบงาน — "รอลูกค้าจ่ายเงิน · 4 วัน" (ตามตัวอย่าง) · วันแรกไม่ต่อท้าย */
export function payChipText(label: string, p: PayWaitBase | null | undefined) {
  return p && p.days >= 1 ? `${label} · ${p.days} วัน` : label;
}
/** วันที่ของการตาม — วันนี้เขียนว่า "วันนี้" (ตัวอย่าง: "วันนี้ · โทรไม่รับ") ไม่งั้น "4 พ.ย." */
export function followDay(at: string) {
  const bkk = (t: number) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10);
  return bkk(Date.parse(at)) === bkk(Date.now()) ? "วันนี้" : shortDay(at);
}
/** "4 พ.ย. · ลูกค้าบอกโอนวันศุกร์" — ไม่ได้พิมพ์หมายเหตุก็ยังบอกว่าตามแล้ว */
export function followText(f: FollowUp) {
  return `${followDay(f.at)} · ${f.note ?? "ตามแล้ว (ไม่มีหมายเหตุ)"}`;
}

/**
 * บรรทัด "ตามล่าสุด" ในรายการและกล่องงาน — ยังไม่เคยตามขึ้นแดง (ตัวอย่างกล่องงาน)
 * ใบที่เพิ่งตามวันนี้ยังอยู่ในกลุ่ม แต่บอกว่าตามแล้ว — การตามไม่ได้ทำให้ลูกค้าจ่าย
 */
export function PayFollowLine({ p, style }: { p: PayWaitRow; style?: object }) {
  return (
    <Text
      style={[styles.followLine, style, !p.last && styles.followNone]}
      numberOfLines={2}
      accessibilityLabel={p.last ? `ตามล่าสุด ${followText(p.last)}` : "ยังไม่เคยตามลูกค้า"}
    >
      {p.last ? `ตามล่าสุด ${followText(p.last)}` : "ยังไม่เคยตาม"}
    </Text>
  );
}

/** ป้ายจำนวนวัน — ส้ม (รอคนนอก) · เกินเส้นแดงทึบ */
export function PayDaysChip({ p, size = "md" }: { p: PayWaitBase; size?: "sm" | "md" }) {
  return (
    <View
      style={[styles.daysChip, size === "sm" && styles.daysChipSm, p.over ? styles.daysChipOver : null]}
      accessibilityLabel={`${payDaysText(p)}${p.over ? ` · ${payOverText(p)}` : ""}`}
    >
      <Text style={[styles.daysText, size === "sm" && styles.daysTextSm, p.over && styles.daysTextOver]}>{payDaysText(p)}</Text>
    </View>
  );
}

/**
 * ปุ่มรองสองปุ่มของขั้นนี้ — อยู่แถวเดียวกับปุ่มหลักท้ายการ์ด (ตัวอย่าง: ลูกค้าไม่ซ่อม ซ้าย · ตามลูกค้าแล้ว ข้างปุ่มหลัก)
 * กดแล้วกางฟอร์มในการ์ด ไม่เปิดหน้าต่างใหม่ — หน้าต่างซ้อนหน้าต่างบนเว็บไม่น่าเชื่อถือ และจดการตามต้องเร็ว
 */
export function PayWaitButtons({
  panel,
  onPanel,
  disabled,
}: {
  panel: "follow" | "decline" | null;
  onPanel: (p: "follow" | "decline" | null) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <TouchableOpacity
        style={[styles.btn, styles.btnDecline, panel === "decline" && styles.btnDeclineOn]}
        onPress={() => onPanel(panel === "decline" ? null : "decline")}
        disabled={disabled}
        accessibilityLabel="ลูกค้าไม่ซ่อม"
      >
        <Ionicons name="close-circle-outline" size={18} color={colors.dangerInk} />
        <Text style={[styles.btnText, { color: colors.dangerInk }]}>ลูกค้าไม่ซ่อม</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btn, styles.btnFollow, panel === "follow" && styles.btnFollowOn]}
        onPress={() => onPanel(panel === "follow" ? null : "follow")}
        disabled={disabled}
        accessibilityLabel="ตามลูกค้าแล้ว"
      >
        <Ionicons name="call-outline" size={18} color={colors.navy} />
        <Text style={[styles.btnText, { color: colors.navy }]}>ตามลูกค้าแล้ว</Text>
      </TouchableOpacity>
    </>
  );
}

/**
 * เนื้อการ์ดขั้นรอลูกค้าจ่ายเงิน — รอมากี่วัน · ส่งใบเสนอราคาเมื่อไร (ปุ่มเปิดใบเสนอราคา) · การตามลูกค้าทุกครั้งของรอบนี้
 * ทุกคนที่เปิดใบเห็น · ฟอร์มที่กางจากปุ่มรองอยู่ที่ PayWaitForms (วางชิดแถวปุ่มท้ายการ์ด)
 */
export function PaymentWaitBox({
  p,
  quoteCount,
  onOpenQuote,
  quoteLabel,
}: {
  p: PayWaitDetail;
  /** ใบเสนอราคาที่แนบไว้ตอนส่ง (ไฟล์แนบ role QUOTE) — 0 = ไม่มีปุ่มเปิด */
  quoteCount: number;
  quoteLabel: string;
  onOpenQuote: () => void;
}) {
  return (
    <View style={styles.box} accessibilityLabel="กล่องรอลูกค้าจ่ายเงิน">
      <View style={styles.daysRow}>
        <PayDaysChip p={p} />
        {p.over ? <Text style={styles.overText}>{payOverText(p)}</Text> : null}
      </View>

      {p.quoted || quoteCount ? (
        <View style={styles.quoted}>
          <Ionicons name="checkmark" size={20} color={colors.successInk} />
          <Text style={styles.quotedText}>
            <Text style={{ fontWeight: "700" }}>ส่งใบเสนอราคาแล้ว</Text>
            {p.quoted ? ` · ${dateTime(p.quoted.at)}${p.quoted.byName ? ` · ${p.quoted.byName}` : ""}` : ""}
          </Text>
          {quoteCount ? (
            <TouchableOpacity style={styles.quoteBtn} onPress={onOpenQuote} accessibilityLabel={`เปิดใบเสนอราคา ${quoteLabel}`}>
              <Ionicons name="document-text-outline" size={16} color={colors.navy} />
              <Text style={styles.quoteBtnText} numberOfLines={1}>
                {quoteLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: 6 }}>
        <Text style={styles.head}>
          การตามลูกค้า <Text style={styles.headN}>({p.followUps.length} ครั้ง)</Text>
        </Text>
        {p.followUps.map((f) => (
          <View key={f.id} style={styles.followRow} accessibilityLabel={`ตามลูกค้า ${dateTime(f.at)} ${f.byName ?? ""} ${f.note ?? ""}`}>
            <Text style={styles.followWhen}>
              {dateTime(f.at)}
              {f.byName ? ` · ${f.byName}` : ""}
            </Text>
            <Text style={[styles.followNote, !f.note && { color: colors.textMuted }]}>{f.note ?? "ไม่มีหมายเหตุ"}</Text>
          </View>
        ))}
        {p.followUps.length === 0 ? <Text style={styles.never}>ยังไม่เคยตาม</Text> : null}
      </View>
    </View>
  );
}

/**
 * ฟอร์มที่กางจากปุ่มรอง (ตามลูกค้าแล้ว · ลูกค้าไม่ซ่อม) — วางชิดแถวปุ่มท้ายการ์ด ไม่ใช่ในกล่องข้างบน:
 * บนมือถือกล่องข้อมูลอยู่หลายจอเหนือปุ่ม กดแล้วฟอร์มไปกางนอกจอ ดูเหมือนปุ่มไม่ทำงาน
 * แอดมินที่ทำขั้นนี้ได้เท่านั้น (ผู้เรียกเช็ค — เซิร์ฟเวอร์กันอีกชั้น)
 */
export function PayWaitForms({
  orderId,
  p,
  panel,
  onPanel,
  reasons,
  onFollowed,
  onDeclined,
}: {
  orderId: number;
  p: PayWaitDetail;
  panel: "follow" | "decline" | null;
  onPanel: (p: "follow" | "decline" | null) => void;
  reasons: DeclineReason[];
  onFollowed: () => Promise<void> | void;
  onDeclined: () => Promise<void> | void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [tried, setTried] = useState(false);
  const other = reason === "OTHER";
  const declineReady = !!reason && (!other || why.trim().length > 0);

  async function saveFollow() {
    setBusy(true);
    try {
      await api.post(`/work-orders/${orderId}/payment-followup`, { note: note.trim() || undefined });
      setNote("");
      onPanel(null);
      await onFollowed();
      showAlert("บันทึกการตามลูกค้าแล้ว");
    } catch (e) {
      showAlert("บันทึกการตามลูกค้าไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setTried(true);
    if (!declineReady) return;
    setBusy(true);
    try {
      await api.post(`/work-orders/${orderId}/quote-declined`, { reason, note: why.trim() || undefined });
      onPanel(null);
      await onDeclined();
    } catch (e) {
      showAlert("บันทึกลูกค้าไม่ซ่อมไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!panel) return null;
  return (
    <View style={styles.box}>
        {panel === "follow" ? (
          <View style={styles.followForm} accessibilityLabel="ฟอร์มตามลูกค้าแล้ว">
            <Text style={styles.followTitle}>ตามลูกค้าแล้ว — ลูกค้าว่ายังไง</Text>
            <Text style={styles.label}>หมายเหตุ (ไม่บังคับ)</Text>
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              maxLength={300}
              placeholder="เช่น ลูกค้าบอกโอนพรุ่งนี้ · โทรไม่รับ"
              placeholderTextColor={colors.textFaint}
              accessibilityLabel="หมายเหตุการตามลูกค้า"
              onSubmitEditing={() => void saveFollow()}
            />
            <View style={styles.formBtns}>
              <TouchableOpacity style={[styles.small, styles.smallGhost]} onPress={() => onPanel(null)} disabled={busy}>
                <Text style={styles.smallGhostText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.small, styles.smallNavy]} onPress={() => void saveFollow()} disabled={busy} accessibilityLabel="บันทึกการตามลูกค้า">
                {busy ? <Spinner color="#fff" size="small" /> : <Text style={styles.smallText}>บันทึก</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

      {panel === "decline" ? (
        <View style={styles.decline} accessibilityLabel="ฟอร์มลูกค้าไม่ซ่อม">
          <Text style={styles.declineTitle}>
            ลูกค้าไม่ซ่อม — เลือกเหตุผล <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <View style={styles.chips}>
            {reasons.map((r) => {
              const on = reason === r.value;
              return (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setReason(r.value)}
                  accessibilityLabel={`เหตุผลลูกค้าไม่ซ่อม ${r.label}`}
                  accessibilityState={{ selected: on }}
                  // เว็บไม่แปลง accessibilityState เป็น aria-selected (CLAUDE.md) — เทสต์เบราว์เซอร์อ่านว่าชิปไหนติดจากตรงนี้
                  aria-selected={on}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.label}>
            {other ? (
              <>
                เหตุผล <Text style={{ color: colors.danger }}>*</Text>
              </>
            ) : (
              "รายละเอียด (ไม่บังคับ)"
            )}
          </Text>
          <TextInput
            style={[styles.input, tried && other && !why.trim() && styles.inputBad]}
            value={why}
            onChangeText={setWhy}
            maxLength={300}
            placeholder={other ? "ลูกค้าไม่ซ่อมเพราะอะไร" : "เช่น ลูกค้าได้ราคาจากร้านอื่นถูกกว่า"}
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="รายละเอียดลูกค้าไม่ซ่อม"
          />
          {/*
            ยกเลิกผ่านทางเดียวกับปุ่ม "ยกเลิกใบงาน" — ของที่ออกจากคลังแล้วไม่ถูกลบออกจากใบ (เลขใบเบิกยังอยู่ให้คลังรับคืน)
            เตือนแบบเดียวกับหัวหน้าภาคปิดใบงาน · ส่วนใหญ่ขั้นนี้ยังไม่เบิก (เก็บเงินก่อนเบิก) จึงบอกว่าไม่มีของต้องคืน
          */}
          {p.issued.length ? (
            <Text style={styles.stockWarn}>
              มีอะไหล่ที่ออกจากคลังแล้ว {p.issued.length} รายการ ({p.issued.map((x) => `${x.name} · ${x.ref}`).join(", ")}) — ต้องคืนเข้าคลัง
            </Text>
          ) : null}
          <Text style={styles.declineInfo}>
            ใบงานถูกยกเลิกพร้อมเหตุผล “เสนอราคาแล้วลูกค้าไม่ซ่อม”
            {p.issued.length ? "" : " · ยังไม่มีอะไหล่ออกจากคลัง จึงไม่มีของต้องคืน"} · นับในรายงานตามผู้เปิดใบงาน
          </Text>
          {tried && !declineReady ? (
            <Text style={styles.err}>{!reason ? "เลือกเหตุผลก่อน" : "เลือก “อื่น ๆ” ต้องพิมพ์เหตุผล"}</Text>
          ) : null}
          <View style={styles.formBtns}>
            <TouchableOpacity style={[styles.small, styles.smallGhost]} onPress={() => onPanel(null)} disabled={busy}>
              <Text style={styles.smallGhostText}>กลับ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.small, declineReady ? styles.smallDanger : styles.smallOff]}
              onPress={() => void decline()}
              disabled={busy}
              accessibilityLabel="ยืนยัน ลูกค้าไม่ซ่อม"
            >
              {busy ? (
                <Spinner color="#fff" size="small" />
              ) : (
                <Text style={[styles.smallText, !declineReady && { color: colors.textMuted }]}>
                  {!reason ? "เลือกเหตุผลก่อน" : other && !why.trim() ? "พิมพ์เหตุผลก่อน" : "ยืนยัน ลูกค้าไม่ซ่อม"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** "4 พ.ย. 2569 10:15" — แบบเดียวกับประวัติใบงาน (formatDateTime ของหน้ารายการ) */
function dateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
}

const styles = StyleSheet.create({
  box: { gap: spacing.md },
  daysRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  daysChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 4,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  daysChipSm: { paddingHorizontal: 9, paddingVertical: 1 },
  daysChipOver: { backgroundColor: colors.dangerFill, borderColor: colors.dangerFill },
  daysText: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.warningInk },
  daysTextSm: { fontSize: 12.5, lineHeight: 19 },
  daysTextOver: { color: "#fff" },
  overText: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.dangerInk },
  quoted: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quotedText: { flex: 1, minWidth: 180, fontSize: 14, lineHeight: 21, color: colors.text },
  quoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    maxWidth: "100%",
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  quoteBtnText: { flexShrink: 1, fontSize: 13.5, fontWeight: "600", color: colors.navy },
  head: { fontSize: 13.5, lineHeight: 21, fontWeight: "700", color: colors.text },
  headN: { fontWeight: "400", color: colors.textMuted },
  followRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.rowAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  followWhen: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  followNote: { flex: 1, minWidth: 160, fontSize: 13.5, lineHeight: 20, color: colors.text },
  never: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  followForm: {
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryLine,
  },
  followTitle: { fontSize: 14.5, lineHeight: 22, fontWeight: "700", color: colors.navy },
  label: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.text },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
  },
  inputBad: { borderColor: colors.danger },
  formBtns: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: spacing.sm },
  small: { minHeight: 42, minWidth: 88, paddingHorizontal: 16, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  smallGhost: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card },
  smallGhostText: { fontSize: 13.5, fontWeight: "600", color: colors.navy },
  smallNavy: { backgroundColor: colors.navyFill },
  smallDanger: { backgroundColor: colors.dangerFill },
  smallOff: { backgroundColor: colors.border },
  smallText: { fontSize: 13.5, fontWeight: "700", color: "#fff" },
  decline: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerLine,
  },
  declineTitle: { fontSize: 14.5, lineHeight: 22, fontWeight: "700", color: colors.dangerInk },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.dangerLine,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.dangerFill, borderColor: colors.dangerFill },
  chipText: { fontSize: 13.5, color: colors.dangerInk },
  chipTextOn: { color: "#fff", fontWeight: "700" },
  stockWarn: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.dangerInk },
  declineInfo: { fontSize: 13, lineHeight: 20, color: colors.dangerInk },
  err: { fontSize: 13, color: colors.danger },
  followLine: { fontSize: 13, lineHeight: 19, color: colors.text },
  followNone: { color: colors.dangerInk, fontWeight: "700" },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 18,
    backgroundColor: colors.card,
  },
  btnText: { fontSize: 15, lineHeight: 24, fontWeight: "700" },
  btnDecline: { borderWidth: 1.5, borderColor: colors.dangerLine },
  btnDeclineOn: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerInk },
  btnFollow: { borderWidth: 1.5, borderColor: colors.navy },
  btnFollowOn: { backgroundColor: colors.primarySoft },
});
