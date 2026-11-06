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
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import axios from "axios";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import Spinner from "./Spinner";
import DateField, { thaiDateLong, todayBkk } from "./DateField";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { itLeadActs } from "../utils/itLead";
import { hhmm, shortDay } from "./claims/ClaimTrail";
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
  /** ลูกค้านัดจ่ายวันที่ "YYYY-MM-DD" ที่จดกับการตามครั้งนี้ (6 พ.ย. 69) · ไม่ได้นัด = null · เซิร์ฟเวอร์รุ่นก่อนไม่มีช่องนี้ */
  payBy?: string | null;
}
export type FollowUpItem = FollowUp & { id: number };
/**
 * นัดจ่ายที่ยังใช้อยู่ของใบ (เซิร์ฟเวอร์คิด — payPromise) = วันนัดของการตามครั้งล่าสุดที่ใส่วันมา
 * late = วันนัดผ่านไปแล้วตามเวลาไทย ลูกค้ายังไม่จ่าย · แอปไม่คิดเอง: ป้ายในแถว ชิป และตัวเลขแท็บต้องตรงกัน
 */
export interface PayPromise {
  date: string;
  late: boolean;
}
/** แถวในรายการ/กล่องงาน — ตามล่าสุด + การตามทุกครั้งของรอบนี้ (กางใต้แถว) + นัดจ่าย */
export interface PayWaitRow extends PayWaitBase {
  follows: number;
  last: FollowUp | null;
  promise?: PayPromise | null;
  followUps?: FollowUpItem[];
}
/** หน้าใบงาน — ส่งใบเสนอราคาเมื่อไร ใคร · การตามทุกครั้งของรอบนี้ · ของที่ออกจากคลังแล้ว (ยกเลิก = ต้องคืน) */
export interface PayWaitDetail extends PayWaitBase {
  quoted: { at: string; byName: string | null } | null;
  followUps: FollowUpItem[];
  promise?: PayPromise | null;
  issued: { name: string; ref: string }[];
}
export interface DeclineReason {
  value: string;
  label: string;
}

/**
 * กด "ตามลูกค้าแล้ว" / "ลูกค้าไม่ซ่อม" ในแถวได้ไหม — กติกาเดียวกับหน้าใบงาน (myTurn ของขั้นรอเงิน + ไม่ใช่ดูในฐานะ):
 * แอดมินทุกใบ (Admin Spare Part ดูอย่างเดียว — viewOnly) · หัวหน้าภาคที่ดูแลงาน IT เฉพาะใบ IT (itLeadActs ตัวเดียวกับหน้าใบงาน)
 * ปุ่มในแถวต้องไม่กว้างกว่าหน้าใบงาน (เจ้าของงานกำชับ 6 พ.ย. 69) — เซิร์ฟเวอร์กันอีกชั้นด้วย guardStage
 */
export function canActOnPayment(
  u: { role?: string; partsAdmin?: boolean; itLead?: boolean; viewAs?: unknown } | null | undefined,
  o: { jobType?: string | null; status: string }
) {
  if (!u || u.viewAs) return false;
  return (u.role === "ADMIN" && !u.partsAdmin) || itLeadActs(u, o);
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
  return `${followDay(f.at)} · ${f.note ?? NO_NOTE}`;
}
export const NO_NOTE = "ตามแล้ว (ไม่มีหมายเหตุ)";
/**
 * "วันนี้ 13:21" / "4 พ.ย. 13:21" — บรรทัดแรกของคอลัมน์ตามลูกค้าล่าสุด (ตัวอย่างที่เจ้าของงานตกลง 6 พ.ย. 69)
 * มีเวลาด้วย: วันเดียวกันตามหลายรอบ (เช้าโทรไม่รับ บ่ายโทรใหม่) ต้องแยกออกว่าครั้งไหนล่าสุด
 */
export function followWhen(at: string) {
  return `${followDay(at)} ${hhmm(at)}`;
}
/** วันนี้ตามเวลาไทยไหม — คอลัมน์ตามล่าสุดเป็นสีเขียวเมื่อตามวันนี้แล้ว */
export function followedToday(at: string) {
  return followDay(at) === "วันนี้";
}

const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
/**
 * "ศ. 7 พ.ย." — วันนัดจ่ายบนป้าย (มีวันในสัปดาห์: แอดมินโทรตามรู้ทันทีว่า "ลูกค้าบอกวันศุกร์" ตรงกับวันที่จดไหม)
 * ปีอื่นต่อท้ายปี พ.ศ. สองหลัก (นัดข้ามปีช่วงปลายธันวาคม)
 */
export function payByText(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const month = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("th-TH", { timeZone: "UTC", month: "short" });
  const year = String(y) === todayBkk().slice(0, 4) ? "" : ` ${String((y + 543) % 100).padStart(2, "0")}`;
  return `${dow} ${d} ${month}${year}`;
}
/** "นัดจ่าย ศ. 7 พ.ย." · เลยแล้ว "นัดจ่าย ศ. 7 พ.ย. · เลยวันนัดแล้ว" */
export function promiseText(p: PayPromise) {
  return `นัดจ่าย ${payByText(p.date)}${p.late ? " · เลยวันนัดแล้ว" : ""}`;
}

/**
 * ป้ายนัดจ่ายในแถว (ตัวอย่างที่ตกลง): น้ำเงิน = ลูกค้านัดไว้ ยังไม่ถึง/วันนี้ · แดงทึบ = เลยวันนัดแล้วยังไม่จ่าย
 * แดงทึบแบบป้าย "เกิน 3 วัน" — แถวที่เกินกำหนดพื้นแดงจางอยู่แล้ว ป้ายแดงจางจะกลืนหายไปกับพื้น
 */
export function PromiseBadge({ p, style }: { p: PayPromise; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.promise, p.late && styles.promiseLate, style]} accessibilityLabel={promiseText(p)}>
      <Ionicons name="calendar-outline" size={13} color={p.late ? "#fff" : colors.primaryInk} />
      {/* ไม่ตัดท้าย — "· เลยวันนัดแล้ว" คือส่วนที่สำคัญที่สุดของป้าย ช่องแคบให้ขึ้นบรรทัดใหม่แทน */}
      <Text style={[styles.promiseText, p.late && styles.promiseTextLate]}>{promiseText(p)}</Text>
    </View>
  );
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

      {/*
        ลูกค้านัดจ่ายวันไหน (6 พ.ย. 69) — นัดของการตามครั้งล่าสุดที่ใส่วันมา (ตามครั้งหลังไม่ใส่วันไม่ล้างนัด) · เลยวันแล้วแดง
        อยู่เหนือรายการการตาม: คนเปิดใบอยากรู้ก่อนว่าลูกค้าสัญญาวันไหน ไม่ต้องไล่อ่านทุกบรรทัด
      */}
      {p.promise ? (
        <View style={[styles.promiseLine, p.promise.late && styles.promiseLineLate]} accessibilityLabel={`ลูกค้านัดจ่าย ${thaiDateLong(p.promise.date)}${p.promise.late ? " · เลยวันนัดแล้ว" : ""}`}>
          <Ionicons name="calendar-outline" size={18} color={p.promise.late ? colors.dangerInk : colors.primaryInk} />
          <Text style={[styles.promiseLineText, p.promise.late && { color: colors.dangerInk }]}>
            ลูกค้านัดจ่าย {thaiDateLong(p.promise.date)}
            {p.promise.late ? " · เลยวันนัดแล้ว ยังไม่จ่าย" : ""}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: 6 }}>
        <Text style={styles.head}>
          การตามลูกค้า <Text style={styles.headN}>({p.followUps.length} ครั้ง)</Text>
        </Text>
        {p.followUps.map((f) => (
          <View key={f.id} style={styles.followRow} accessibilityLabel={`ตามลูกค้า ${dateTime(f.at)} ${f.byName ?? ""} ${f.note ?? ""}${f.payBy ? ` นัดจ่าย ${payByText(f.payBy)}` : ""}`}>
            <Text style={styles.followWhen}>
              {dateTime(f.at)}
              {f.byName ? ` · ${f.byName}` : ""}
            </Text>
            <Text style={[styles.followNote, !f.note && { color: colors.textMuted }]}>
              {f.note ?? "ไม่มีหมายเหตุ"}
              {/* วันนัดของการตามครั้งนั้น — เห็นว่าลูกค้าเลื่อนนัดมากี่รอบ */}
              {f.payBy ? <Text style={styles.followPayBy}>{` · นัดจ่าย ${payByText(f.payBy)}`}</Text> : null}
            </Text>
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
 * ตัวฟอร์มเป็นตัวเดียวกับในแถวของแท็บรอเงิน/งานของฉันวันนี้ (FollowUpForm · DeclineForm) — สองที่ต้องจดเหมือนกัน
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
  if (!panel) return null;
  return (
    <View style={styles.box}>
      {panel === "follow" ? (
        <View style={styles.followForm} accessibilityLabel="ฟอร์มตามลูกค้าแล้ว">
          <Text style={styles.followTitle}>ตามลูกค้าแล้ว</Text>
          <FollowUpForm
            orderId={orderId}
            onCancel={() => onPanel(null)}
            onSaved={async () => {
              onPanel(null);
              await onFollowed();
              showAlert("บันทึกการตามลูกค้าแล้ว");
            }}
          />
        </View>
      ) : null}
      {panel === "decline" ? (
        <DeclineForm orderId={orderId} issued={p.issued} reasons={reasons} onCancel={() => onPanel(null)} onDone={onDeclined} />
      ) : null}
    </View>
  );
}

/**
 * ข้อความลัดในฟอร์มตามลูกค้า (เจ้าของงานเลือก 6 พ.ย. 69 — ตามตัวอย่าง) — แตะแล้วต่อท้ายช่อง แก้ต่อได้
 * คำที่แอดมินพิมพ์ซ้ำทุกวัน · ไม่ใช่ตัวเลือกบังคับ: ลูกค้าพูดอย่างอื่นก็พิมพ์เอง
 */
export const FOLLOW_PHRASES = ["ลูกค้าจะโอนวันนี้", "ขอเลื่อนจ่าย", "โทรไม่รับ", "รอเจ้าของร้านอนุมัติ"];
const NOTE_MAX = 300;

/**
 * ฟอร์มจดการตามลูกค้า — ตัวเดียวทั้งหน้าใบงาน (ตามลูกค้าแล้ว) และแถวของแท็บรอเงิน/งานของฉันวันนี้
 * ถ้ามีสองชุด วันหนึ่งจะแก้ชุดเดียวแล้วสองที่จดไม่เหมือนกัน (ชุดหนึ่งมีวันนัด อีกชุดไม่มี)
 * · บอกในฟอร์มว่าวัน-เวลา/ชื่อคนตามระบบจดเอง — แอดมินเคยพิมพ์ "6/11 โทรแล้ว (ปาลิดา)" ซ้ำกับที่ระบบมีอยู่แล้ว
 * · ลูกค้านัดจ่ายวันที่ (ไม่บังคับ) — ปฏิทินเดียวกับช่องวันที่อื่นของแอป เลือกวันที่ผ่านไปแล้วไม่ได้ (เซิร์ฟเวอร์กันอีกชั้น)
 * code = ต่อท้ายชื่อช่องเมื่อมีหลายฟอร์มบนจอเดียว (แถวละฟอร์ม) · หน้าใบงานไม่ใส่
 * onSaved ได้ payWait ชุดใหม่จากคำตอบของเซิร์ฟเวอร์ (หน้าใบงาน) — แถวเอาไปแทนการตามในมือได้เลย ไม่ต้องโหลดรายการใหม่
 */
export function FollowUpForm({
  orderId,
  code,
  onSaved,
  onCancel,
  onStale,
  autoFocus,
  style,
}: {
  orderId: number;
  code?: string;
  onSaved: (p: PayWaitDetail | null) => Promise<void> | void;
  onCancel: () => void;
  /** ใบเพิ่งเดินขั้นไปแล้ว (409) — ผู้เรียกโหลดใหม่ */
  onStale?: () => void;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const sfx = code ? ` ${code}` : "";
  const [note, setNote] = useState("");
  const [payBy, setPayBy] = useState("");
  const [busy, setBusy] = useState(false);

  // ต่อท้ายด้วยช่องว่าง ไม่ใช่ " · " — บรรทัดการตามใช้ " · " คั่นเวลา/ชื่อ/หมายเหตุอยู่แล้ว ใส่ซ้ำในหมายเหตุจะอ่านปนกัน
  const addPhrase = (t: string) => setNote((n) => (n.trim() ? `${n.trim()} ${t}` : t).slice(0, NOTE_MAX));

  async function save() {
    setBusy(true);
    try {
      const { data } = await api.post<{ payWait: PayWaitDetail | null }>(`/work-orders/${orderId}/payment-followup`, {
        note: note.trim() || undefined,
        payBy: payBy || undefined,
      });
      setNote("");
      setPayBy("");
      await onSaved(data.payWait ?? null);
    } catch (e) {
      showAlert("บันทึกการตามลูกค้าไม่สำเร็จ", apiErrorMessage(e));
      if (axios.isAxiosError(e) && e.response?.status === 409) onStale?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.fuForm, style]} accessibilityLabel={`ฟอร์มตามลูกค้า${sfx}`}>
      <View style={styles.fuHead}>
        <Text style={styles.label}>ลูกค้าว่ายังไง</Text>
        <Text style={styles.fuHint}>วัน-เวลาและชื่อคนตาม ระบบจดให้เอง — จดแค่ว่าลูกค้าว่ายังไง</Text>
      </View>
      <View style={styles.phrases}>
        {FOLLOW_PHRASES.map((t) => (
          <TouchableOpacity key={t} style={styles.phrase} onPress={() => addPhrase(t)} disabled={busy} accessibilityLabel={`ข้อความลัด ${t}${sfx}`}>
            <Ionicons name="add" size={14} color={colors.navy} />
            <Text style={styles.phraseText}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={setNote}
        maxLength={NOTE_MAX}
        autoFocus={autoFocus}
        placeholder="เช่น จะโอนวันศุกร์ (ไม่บังคับ)"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel={`ลูกค้าว่ายังไง${sfx}`}
        onSubmitEditing={() => void save()}
      />
      <View style={styles.fuFoot}>
        <View style={styles.fuDate}>
          <DateField
            value={payBy}
            onChange={setPayBy}
            label="ลูกค้านัดจ่ายวันที่ (ไม่บังคับ)"
            accessibilityLabel={`ลูกค้านัดจ่ายวันที่${sfx}`}
            emptyHint="ลูกค้าไม่ได้นัดวัน"
            // วันที่ผ่านไปแล้วนัดไม่ได้ — นัดที่เลยตั้งแต่ตอนจดคือจดผิด และจะขึ้น "เลยวันนัด" ทันที (เซิร์ฟเวอร์ตอบ 400 อีกชั้น)
            min={todayBkk()}
            labelStyle={styles.fuDateLabel}
          />
        </View>
        <View style={styles.formBtns}>
          <TouchableOpacity style={[styles.small, styles.smallGhost]} onPress={onCancel} disabled={busy} accessibilityLabel={`ยกเลิกการตาม${sfx}`}>
            <Text style={styles.smallGhostText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.small, styles.smallNavy]} onPress={() => void save()} disabled={busy} accessibilityLabel={`บันทึกการตามลูกค้า${sfx}`}>
            {busy ? <Spinner color="#fff" size="small" /> : <Text style={styles.smallText}>บันทึก</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/**
 * ฟอร์ม "ลูกค้าไม่ซ่อม" — ตัวเดียวทั้งหน้าใบงานและแถวของแท็บรอเงิน/งานของฉันวันนี้ (เจ้าของงานขอปุ่มในแถว 6 พ.ย. 69):
 * ชิปเหตุผลชุดเดียวกัน · "อื่น ๆ" ต้องพิมพ์ · เตือนของที่ออกจากคลังแล้ว · ยิง /quote-declined ตัวเดียวกับหน้าใบงาน
 * issued = null ระหว่างถามเซิร์ฟเวอร์ (แถวไม่มีข้อมูลอะไหล่ — DeclineInline ถามตอนกาง) — ยืนยันไม่ได้จนรู้ว่ามีของต้องคืนไหม
 * ไม่งั้นแอดมินกดยืนยันก่อนเห็นคำเตือน ของที่เบิกไปแล้วค้างนอกคลังโดยไม่มีใครรู้
 */
export function DeclineForm({
  orderId,
  code,
  issued,
  reasons,
  note: loadNote,
  onCancel,
  onDone,
  onStale,
  style,
}: {
  orderId: number;
  code?: string;
  issued: PayWaitDetail["issued"] | null;
  reasons: DeclineReason[];
  /** ข้อความแทนคำเตือนอะไหล่ระหว่างถาม/ถามไม่ได้ (DeclineInline) */
  note?: React.ReactNode;
  onCancel: () => void;
  onDone: () => Promise<void> | void;
  onStale?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const sfx = code ? ` ${code}` : "";
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [tried, setTried] = useState(false);
  const other = reason === "OTHER";
  const declineReady = !!reason && (!other || why.trim().length > 0);
  const known = issued !== null;

  async function decline() {
    setTried(true);
    if (!declineReady || !known) return;
    setBusy(true);
    try {
      await api.post(`/work-orders/${orderId}/quote-declined`, { reason, note: why.trim() || undefined });
      await onDone();
    } catch (e) {
      showAlert("บันทึกลูกค้าไม่ซ่อมไม่สำเร็จ", apiErrorMessage(e));
      if (axios.isAxiosError(e) && e.response?.status === 409) onStale?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.decline, style]} accessibilityLabel={`ฟอร์มลูกค้าไม่ซ่อม${sfx}`}>
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
              accessibilityLabel={`เหตุผลลูกค้าไม่ซ่อม ${r.label}${sfx}`}
              accessibilityState={{ selected: on }}
              // เว็บไม่แปลง accessibilityState เป็น aria-selected (CLAUDE.md) — เทสต์เบราว์เซอร์อ่านว่าชิปไหนติดจากตรงนี้
              aria-selected={on}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.label}</Text>
            </TouchableOpacity>
          );
        })}
        {!reasons.length ? <Spinner size="small" /> : null}
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
        accessibilityLabel={`รายละเอียดลูกค้าไม่ซ่อม${sfx}`}
      />
      {/*
        ยกเลิกผ่านทางเดียวกับปุ่ม "ยกเลิกใบงาน" — ของที่ออกจากคลังแล้วไม่ถูกลบออกจากใบ (เลขใบเบิกยังอยู่ให้คลังรับคืน)
        เตือนแบบเดียวกับหัวหน้าภาคปิดใบงาน · ส่วนใหญ่ขั้นนี้ยังไม่เบิก (เก็บเงินก่อนเบิก) จึงบอกว่าไม่มีของต้องคืน
      */}
      {issued?.length ? (
        <Text style={styles.stockWarn}>
          มีอะไหล่ที่ออกจากคลังแล้ว {issued.length} รายการ ({issued.map((x) => `${x.name} · ${x.ref}`).join(", ")}) — ต้องคืนเข้าคลัง
        </Text>
      ) : null}
      {known ? (
        <Text style={styles.declineInfo}>
          ใบงานถูกยกเลิกพร้อมเหตุผล “เสนอราคาแล้วลูกค้าไม่ซ่อม”
          {issued.length ? "" : " · ยังไม่มีอะไหล่ออกจากคลัง จึงไม่มีของต้องคืน"} · นับในรายงานตามผู้เปิดใบงาน
        </Text>
      ) : (
        loadNote ?? null
      )}
      {tried && !declineReady ? (
        <Text style={styles.err}>{!reason ? "เลือกเหตุผลก่อน" : "เลือก “อื่น ๆ” ต้องพิมพ์เหตุผล"}</Text>
      ) : null}
      <View style={styles.formBtns}>
        <TouchableOpacity style={[styles.small, styles.smallGhost]} onPress={onCancel} disabled={busy} accessibilityLabel={`กลับ ไม่ยกเลิกใบงาน${sfx}`}>
          <Text style={styles.smallGhostText}>กลับ</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.small, declineReady && known ? styles.smallDanger : styles.smallOff]}
          onPress={() => void decline()}
          disabled={busy || !known}
          accessibilityLabel={`ยืนยัน ลูกค้าไม่ซ่อม${sfx}`}
        >
          {busy ? (
            <Spinner color="#fff" size="small" />
          ) : (
            <Text style={[styles.smallText, !(declineReady && known) && { color: colors.textMuted }]}>
              {!reason ? "เลือกเหตุผลก่อน" : other && !why.trim() ? "พิมพ์เหตุผลก่อน" : "ยืนยัน ลูกค้าไม่ซ่อม"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * เหตุผลลูกค้าไม่ซ่อมจากเซิร์ฟเวอร์ (options.quoteDeclineReasons — ที่เดียวกับหน้าใบงาน) จำไว้ทั้งแอป
 * รายการคงที่ เปลี่ยนเฉพาะตอน deploy · หน้าใบงานโหลด options อยู่แล้ว ฝากไว้ให้แถวใช้ต่อ (rememberDeclineReasons) ไม่ต้องถามซ้ำ
 */
let reasonsCache: DeclineReason[] | null = null;
export function rememberDeclineReasons(list: DeclineReason[] | undefined) {
  if (list?.length) reasonsCache = list;
}
async function declineReasons(): Promise<DeclineReason[]> {
  if (reasonsCache) return reasonsCache;
  const { data } = await api.get<{ quoteDeclineReasons?: DeclineReason[] }>("/work-orders/options", { loadingText: false });
  rememberDeclineReasons(data.quoteDeclineReasons);
  return data.quoteDeclineReasons ?? [];
}

/**
 * "ลูกค้าไม่ซ่อม" ที่กางใต้แถว (แท็บรอเงิน · งานของฉันวันนี้) — แถวในรายการไม่มีข้อมูลอะไหล่ของใบ (ไม่แบกมากับทุกแถว)
 * จึงถามใบงาน (GET /:id → payWait.issued — กติกา openIssued เดียวกับหน้าใบงาน) ตอนกางฟอร์ม พร้อมกับเหตุผล (ถามครั้งแรกครั้งเดียว)
 * ใบที่ไม่ได้รอเงินแล้ว (คนอื่นเพิ่งแนบบิล/ยกเลิก) บอกเลยและให้ผู้เรียกโหลดใหม่ ไม่ต้องรอกดยืนยันแล้วได้ 409
 * ยืนยันแล้ว: แจ้ง "… ยกเลิกใบงานแล้ว" แล้ว onDone (ผู้เรียกเอาแถวออก ปรับตัวเลข ไม่โหลดรายการใหม่)
 */
export function DeclineInline({
  orderId,
  code,
  onCancel,
  onDone,
  onStale,
  style,
}: {
  orderId: number;
  code: string;
  onCancel: () => void;
  onDone: () => void;
  onStale?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [reasons, setReasons] = useState<DeclineReason[]>(reasonsCache ?? []);
  const [issued, setIssued] = useState<PayWaitDetail["issued"] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setProblem(null);
    Promise.all([
      declineReasons(),
      api.get<{ status: string; payWait: PayWaitDetail | null }>(`/work-orders/${orderId}`, { loadingText: false }),
    ])
      .then(([rs, { data }]) => {
        if (!alive) return;
        setReasons(rs);
        if (data.status !== "AWAITING_PAYMENT" || !data.payWait) {
          setProblem(`${code} ไม่ได้รอลูกค้าจ่ายเงินแล้ว — โหลดรายการใหม่`);
          onStale?.();
          return;
        }
        setIssued(data.payWait.issued);
      })
      .catch((e) => alive && setProblem(`เช็คอะไหล่ที่ออกจากคลังไม่ได้ — ${apiErrorMessage(e)}`));
    return () => {
      alive = false;
    };
    // onStale เป็นฟังก์ชันใหม่ทุกครั้งที่ผู้เรียกวาด — ถามใหม่เฉพาะใบเปลี่ยน/กดลองใหม่
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, tick]);

  const retry = useCallback(() => setTick((t) => t + 1), []);
  const loadNote = problem ? (
    <View style={styles.loadRow}>
      <Text style={[styles.declineInfo, { fontWeight: "700", flexShrink: 1 }]}>{problem}</Text>
      <TouchableOpacity style={[styles.small, styles.smallGhost]} onPress={retry} accessibilityLabel={`ลองเช็คอะไหล่ใหม่ ${code}`}>
        <Text style={styles.smallGhostText}>ลองใหม่</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={styles.loadRow}>
      <Spinner size="small" />
      <Text style={styles.declineInfo}>กำลังเช็คอะไหล่ที่ออกจากคลังของใบนี้…</Text>
    </View>
  );

  return (
    <DeclineForm
      orderId={orderId}
      code={code}
      issued={issued}
      reasons={reasons}
      note={loadNote}
      onCancel={onCancel}
      onStale={onStale}
      style={style}
      onDone={() => {
        // ลงท้าย "แล้ว" = แจ้งสำเร็จสีเขียวที่หายเอง (showAlert บนเว็บ) — แถวหายไปพร้อมกัน คนต้องรู้ว่าไปไหน
        showAlert(`${code} ลูกค้าไม่ซ่อม · ยกเลิกใบงานแล้ว`);
        onDone();
      }}
    />
  );
}

/**
 * การตามทุกครั้งของรอบนี้ ใหม่ก่อนเก่า (กางใต้แถวจาก "ตาม n ครั้ง · ดูทั้งหมด") — เวลา · ใคร · หมายเหตุ (+ วันนัดของครั้งนั้น)
 * อ่านอย่างเดียว · ข้อมูลมากับแถวแล้ว (payWait.followUps) กางทันทีไม่ต้องรอเซิร์ฟเวอร์
 */
export function FollowHistory({ items, code, style }: { items: FollowUpItem[]; code: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.history, style]} accessibilityLabel={`การตามทั้งหมด ${code}`}>
      {items.map((f) => (
        <View key={f.id} style={styles.historyRow}>
          <Text style={[styles.historyWhen, followedToday(f.at) && { color: colors.successInk, fontWeight: "700" }]}>
            {followWhen(f.at)}
            {f.byName ? ` · ${f.byName}` : ""}
          </Text>
          <Text style={[styles.historyNote, !f.note && { color: colors.textMuted }]}>
            {f.note ?? NO_NOTE}
            {f.payBy ? <Text style={styles.followPayBy}>{` · นัดจ่าย ${payByText(f.payBy)}`}</Text> : null}
          </Text>
        </View>
      ))}
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
  followPayBy: { fontSize: 12.5, fontWeight: "700", color: colors.primaryInk },
  promise: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    maxWidth: "100%",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 1,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryLine,
  },
  promiseLate: { backgroundColor: colors.dangerFill, borderColor: colors.dangerFill },
  promiseText: { flexShrink: 1, fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.primaryInk },
  promiseTextLate: { color: "#fff" },
  promiseLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryLine,
  },
  promiseLineLate: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerLine },
  promiseLineText: { flex: 1, fontSize: 14, lineHeight: 21, fontWeight: "700", color: colors.primaryInk },
  fuForm: { gap: 6 },
  fuHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: spacing.sm },
  fuHint: { flexShrink: 1, fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
  phrases: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  phrase: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    backgroundColor: colors.card,
  },
  phraseText: { fontSize: 13, color: colors.navy },
  fuFoot: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.sm },
  fuDate: { flexGrow: 1, flexBasis: 220, maxWidth: 340 },
  fuDateLabel: { marginTop: 0, marginBottom: 0 },
  loadRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  history: { gap: 4 },
  historyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.rowAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyWhen: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  historyNote: { flex: 1, minWidth: 160, fontSize: 13, lineHeight: 19, color: colors.text },
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
