/**
 * ชิ้นส่วนหน้าจอของเวลาปิดนัดงานพรุ่งนี้ (เจ้าของงานขอ ต.ค. 69 · ย้ายมาที่การนัดวัน 2 พ.ย. 69)
 * หน้าตาและคำตามตัวอย่างที่อนุมัติ (appt-cutoff-canvas)
 *
 * ทุกชิ้นคิดจากนาฬิกาเซิร์ฟเวอร์ที่หน้าจอส่งเข้ามา (now จาก useServerClock) ไม่อ่านนาฬิกามือถือเอง
 * ข้อความ/การนับอยู่ที่ utils/dispatchCutoff.ts ไฟล์นี้วาดอย่างเดียว — งานของฉันวันนี้ กล่องงาน และหน้าใบงาน
 * ใช้ชิ้นเดียวกัน ป้ายใบเดียวกันจึงบอกเหมือนกันทุกหน้า
 *
 * สีคงที่ ไม่มีกระพริบ — ถ้าวันหนึ่งอยากให้แดงกระพริบ animationKeyframes ต้องอยู่ใน StyleSheet.create
 * และ transform ในคีย์เฟรมต้องเป็นข้อความ CSS (CLAUDE.md · ดู Blink ใน WorkOrderListScreen.tsx)
 */
import React, { useCallback, useState } from "react";
import { StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import TouchableOpacity from "./Tap";
import AppModal from "./AppModal";
import { feedback } from "./Feedback";
import { useDocked } from "./SideMenu";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { showAlert } from "../utils/alert";
import { colors, radius, spacing, headingFont } from "../theme";
import {
  adminDayLine,
  adminRowLines,
  askDays,
  BannerRow,
  BannerTone,
  Cutoff,
  CutoffBanner,
  cutoffChangeLocksNow,
  CutoffRow,
  dayFull,
  dayShort,
  FormWarning,
  hhmmOf,
  SCHEDULE_STAGES,
  scheduleChip,
  scheduleLine,
  ScheduleTone,
  serverDay,
  timeText,
  UrgentAnswer,
  UrgentAsk,
  useServerClock,
  useServerNowFn,
} from "../utils/dispatchCutoff";

type IconName = keyof typeof Ionicons.glyphMap;
type ToneStyle = { bg: string; fg: string; line: string; icon: IconName };

/**
 * สีป้ายบนการ์ด (ตัวอย่าง tone()) — ล็อกเป็นพื้นแดงทึบตัวขาว ให้เห็นจากระยะไกลว่าใบนี้กดไม่ได้แล้ว
 * ใช้คีย์สีของธีม (dangerFill ฯลฯ) ไม่ใช่รหัสสีตรง ๆ โหมดมืดจะได้อ่านออก
 */
const CHIP_TONE: Record<BannerTone, ToneStyle> = {
  lock: { bg: colors.dangerFill, fg: "#FFFFFF", line: colors.dangerFill, icon: "lock-closed" },
  req: { bg: colors.roleAdminSoft, fg: colors.roleAdmin, line: colors.roleAdminLine, icon: "hourglass-outline" },
  urgent: { bg: colors.successSoft, fg: colors.successInk, line: colors.successLine, icon: "lock-open-outline" },
  later: { bg: colors.background, fg: colors.textMuted, line: colors.border, icon: "calendar-outline" },
  calm: { bg: colors.sky50, fg: colors.navy, line: colors.primaryLine, icon: "time-outline" },
  amber: { bg: colors.warningSoft, fg: colors.warningInk, line: colors.warning, icon: "time-outline" },
  red: { bg: colors.dangerSoft, fg: colors.dangerInk, line: colors.dangerInk, icon: "warning-outline" },
  done: { bg: colors.successSoft, fg: colors.successInk, line: colors.successFill, icon: "checkmark-circle-outline" },
  today: { bg: colors.primarySoft, fg: colors.primaryInk, line: colors.primary, icon: "calendar-outline" },
  grey: { bg: colors.card, fg: colors.textMuted, line: colors.border, icon: "time-outline" },
};

/** หัวข้อบนสุดใช้พื้นอ่อนทุกสี (ตัวอย่าง redG) — แถบแดงทึบกว้างเต็มจอแย่งสายตาจากการ์ดที่ต้องกดจริง */
const BANNER_TONE: Record<BannerTone, ToneStyle> = {
  ...CHIP_TONE,
  lock: { bg: colors.dangerSoft, fg: colors.dangerInk, line: colors.dangerInk, icon: "lock-closed" },
};

/**
 * ป้ายเวลาปิดนัดบนการ์ด/แถว/หน้าใบงาน (ใบรอนัดวันเท่านั้น) — หัวหน้าภาคกับแอดมินเท่านั้น (รวม Admin Spare Part และดูในฐานะ ดูอย่างเดียว)
 * ช่างกับทีม Area ไม่เห็น: ทำอะไรกับมันไม่ได้ · ใบขั้นปล่อยงานไม่มีป้าย — ปล่อยได้ทุกเวลาแล้ว
 */
export function ScheduleChip({
  row,
  now,
  cutoff,
  style,
}: {
  row: CutoffRow;
  now: number;
  cutoff?: Cutoff | null;
  style?: StyleProp<ViewStyle>;
}) {
  const { user } = useAuth();
  if (user?.role !== "ADMIN" && user?.role !== "SUPERVISOR") return null;
  const view = scheduleChip(row, now, cutoff, user.role === "ADMIN" ? "admin" : "supervisor");
  if (!view) return null;
  const t = CHIP_TONE[view.tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg, borderColor: t.line }, style]} accessibilityLabel={view.text}>
      <Ionicons name={t.icon} size={13} color={t.fg} />
      <Text style={[styles.chipText, { color: t.fg }]}>{view.text}</Text>
    </View>
  );
}

/**
 * ป้ายที่เดินนาฬิกาเอง — สำหรับที่ที่หน้าจอทั้งหน้าไม่ควรวาดใหม่ทุก 30 วิเพื่อป้ายเดียว
 * (หน้าใบงานยาวหลายพันบรรทัด · แถวรายการเป็นร้อยแถว) ป้ายทุกตัวใช้ offset เดียวกันจาก serverNow ชุดเดียวกัน
 * จึงพลิกพร้อมกันตอนถึงเวลา · ตั้งนาฬิกาเฉพาะใบรอนัดวันที่ไม่ใช่ใบทดสอบ แถวอื่นไม่มีป้ายให้เดิน
 */
type LiveChipProps = {
  row: CutoffRow;
  serverNow?: string | null;
  cutoff?: Cutoff | null;
  style?: StyleProp<ViewStyle>;
};
export function LiveScheduleChip(props: LiveChipProps) {
  const { user } = useAuth();
  // ตัดคนที่ไม่เห็นป้ายและใบที่ไม่มีป้ายก่อนตั้งนาฬิกา — รายการเป็นร้อยแถว ไม่ต้องมีตัวจับเวลาต่อแถวที่ไม่วาดอะไร
  if (user?.role !== "ADMIN" && user?.role !== "SUPERVISOR") return null;
  if (props.row.isTest || !SCHEDULE_STAGES.includes(props.row.status)) return null;
  return <LiveChipInner {...props} />;
}
function LiveChipInner({ row, serverNow, cutoff, style }: LiveChipProps) {
  const now = useServerClock(serverNow, cutoff?.time);
  return <ScheduleChip row={row} now={now} cutoff={cutoff} style={style} />;
}

/**
 * บรรทัดเตือนใต้ช่องวันที่ (dateFormWarning) — เตือนอย่างเดียว ไม่กันบันทึก (ข้อ 4)
 * เทา = แค่บอกเส้นตาย · ส้ม = เหลือไม่ถึงชั่วโมง · แดง = เลยแล้ว ใบจะถึงขั้นปล่อยงานแบบล็อก
 */
export function FormWarningLine({ warning }: { warning: FormWarning }) {
  if (!warning) return null;
  const t = warning.tone === "red" ? CHIP_TONE.red : warning.tone === "amber" ? CHIP_TONE.amber : CHIP_TONE.later;
  return (
    <View style={[styles.formWarn, { backgroundColor: t.bg, borderColor: t.line }]} accessibilityLabel={warning.text}>
      <Ionicons name={t.icon} size={15} color={t.fg} style={{ marginTop: 2 }} />
      <Text style={[styles.formWarnText, { color: warning.tone === "grey" ? colors.body : t.fg }]}>{warning.text}</Text>
    </View>
  );
}

/** ข้อความช่องติ๊กงานด่วน (ตัวอย่าง appt-cutoff) — ทุกฟอร์มวันที่ของแอดมินและเทสต์ใช้คำเดียวกัน */
export const URGENT_WITH_LABEL = "แก้เป็นงานด่วนไปพร้อมกัน — ต้องไปวันนั้นจริง (ลงประวัติว่าใครแก้)";

/**
 * ช่องติ๊ก "แก้เป็นงานด่วนไปพร้อมกัน" ใต้บรรทัดแดงของฟอร์มวันที่ของแอดมิน (เจ้าของงานข้อ 4)
 * ร้านต้องการวันที่ปิดนัดแล้วจริง — แอดมินปลดวันนั้นในการบันทึกเดียว ไม่ต้องบันทึกแล้วไปกด "แก้เป็นงานด่วน" อีกรอบ
 * ไม่ติ๊กให้เอง: วันที่ปิดต้องมีคนตั้งใจปลดและลงชื่อในประวัติ ไม่งั้นกฎ 16:00 หายไปเงียบ ๆ ทุกครั้งที่แอดมินเลือกวัน
 * สูง 44 กดง่ายบนมือถือ · aria-checked ใส่เอง (เว็บไม่แปลง accessibilityState — ดู Tick ใน RejectPanel)
 */
export function UrgentWithCheckbox({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      style={styles.urgentWith}
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      aria-checked={checked}
      accessibilityLabel={URGENT_WITH_LABEL}
    >
      <Ionicons name={checked ? "checkbox" : "square-outline"} size={22} color={checked ? colors.navy : colors.textMuted} />
      <Text style={styles.urgentWithText}>{URGENT_WITH_LABEL}</Text>
    </TouchableOpacity>
  );
}

/**
 * แถบหัวข้อบนสุด (งานของฉันวันนี้ · กล่องงาน) — groups มาจาก supervisorBanners / adminGroups ตัวเดียวกันทั้งสองหน้า
 * withRows = แสดงใบในแต่ละหัวข้อ (กล่องงาน) · งานของฉันวันนี้ไม่ต้อง เพราะการ์ดของใบอยู่ข้างล่างอยู่แล้ว
 * จอกว้างแถวละบรรทัดเดียว (รหัส · สาขา · ทีม · เวลา) · มือถือให้ขึ้นบรรทัดที่สองได้ ไม่ตัดชื่อสาขาทิ้ง
 */
export function CutoffBanners({
  groups,
  withRows,
  onOpen,
  style,
}: {
  groups: CutoffBanner[];
  withRows?: boolean;
  onOpen?: (id: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { docked } = useDocked();
  if (!groups.length) return null;
  return (
    <View style={[{ gap: spacing.sm }, style]}>
      {groups.map((g) => {
        const t = BANNER_TONE[g.tone];
        return (
          <View
            key={g.key}
            style={[styles.banner, { backgroundColor: t.bg, borderColor: t.line, borderWidth: g.strong ? 2 : 1 }]}
            accessibilityLabel={`หัวข้อ ${g.title}`}
          >
            <View style={styles.bannerHead}>
              <Ionicons name={t.icon} size={18} color={t.fg} style={{ marginTop: 2 }} />
              <Text style={[styles.bannerTitle, { color: t.fg }]}>{g.title}</Text>
              {g.right ? (
                <View style={[styles.rightPill, { borderColor: t.line }]}>
                  <Text style={[styles.rightText, { color: t.fg }]}>{g.right}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.bannerHint}>{g.hint}</Text>
            {withRows
              ? g.items.map((it) => (
                  <TouchableOpacity
                    key={`${g.key}-${it.id}`}
                    style={styles.bannerRow}
                    onPress={() => onOpen?.(it.id)}
                    disabled={!onOpen}
                    accessibilityLabel={`${g.title} ${it.code}`}
                  >
                    <Text style={styles.bannerCode}>{it.code}</Text>
                    <Text style={styles.bannerLine} numberOfLines={docked ? 1 : 2}>
                      {it.line}
                    </Text>
                    {it.right ? <Text style={[styles.bannerRight, { color: t.fg }]}>{it.right}</Text> : null}
                    {onOpen ? <Ionicons name="chevron-forward" size={16} color={colors.textFaint} /> : null}
                  </TouchableOpacity>
                ))
              : null}
          </View>
        );
      })}
    </View>
  );
}

const LINE_TONE: Record<ScheduleTone, ToneStyle> = {
  grey: { bg: colors.background, fg: colors.body, line: colors.border, icon: "time-outline" },
  amber: { bg: colors.warningSoft, fg: colors.warningInk, line: colors.warning, icon: "time-outline" },
  blue: { bg: colors.sky50, fg: colors.navy, line: colors.primaryLine, icon: "calendar-outline" },
  red: { bg: colors.dangerSoft, fg: colors.dangerInk, line: colors.dangerLine, icon: "warning-outline" },
  green: { bg: colors.successSoft, fg: colors.successInk, line: colors.successLine, icon: "lock-open-outline" },
};

/** บรรทัดหนึ่งบรรทัดใต้ปฏิทิน — ทั้งของหัวหน้าภาค (scheduleLine) และของแอดมิน (adminDayLine) หน้าตาเดียวกัน */
function ToneLine({ tone, text }: { tone: ScheduleTone; text: string }) {
  const t = LINE_TONE[tone];
  return (
    <View style={[styles.formWarn, { backgroundColor: t.bg, borderColor: t.line }]} accessibilityLabel={text}>
      <Ionicons name={t.icon} size={15} color={t.fg} style={{ marginTop: 2 }} />
      <Text style={[styles.formWarnText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

/** ปุ่มขอแอดมิน — ตัวอย่างมีแค่ "พรุ่งนี้" · "วันนี้" ใช้คำของแผงเทียบในตัวอย่าง (เจ้าของงานข้อ 3: วันนี้ขอแบบเดียวกับพรุ่งนี้หลังเวลาปิด) */
export const ASK_TOMORROW = "ร้านต้องการพรุ่งนี้จริง — ขอแอดมินแก้เป็นงานด่วน";
export const ASK_TODAY = "ร้านต้องการวันนี้จริง — ขอแอดมินแก้เป็นงานด่วน";
export const ASK_CANCEL = "ยกเลิกคำขอ";

/**
 * บรรทัดใต้ช่องวันของแอดมิน + ช่องติ๊ก (ตัวอย่าง s2Line · showTick · s2Hint)
 * ฟอร์มนัดวันที่แอดมินทำแทนหัวหน้าภาคใช้ตัวนี้ (changed = false) · ฟอร์มคอนเฟิร์มลูกค้าขอเลื่อน/เลื่อนวันนัดใช้ตัวเดียวกันได้ (changed = true)
 * ปุ่มบันทึกปิดอยู่จนกว่าจะติ๊ก (ผู้เรียกกันเอง) — บรรทัด "ติ๊กแก้เป็นงานด่วนก่อน" บอกว่าทำไมกดไม่ได้ ไม่ให้แอดมินงงว่าปุ่มเสีย
 */
export function AdminDayLine({
  day,
  now,
  cutoff,
  urgentFor,
  changed,
  tick,
  onTick,
  busy,
}: {
  day: string | null;
  now: number;
  cutoff: Cutoff | null | undefined;
  urgentFor: string | null | undefined;
  changed: boolean;
  tick: boolean;
  onTick: (v: boolean) => void;
  busy?: boolean;
}) {
  const l = adminDayLine(day, now, cutoff, urgentFor, changed);
  if (!l) return null;
  return (
    <View style={styles.helpWrap}>
      <ToneLine tone={l.tone} text={l.text} />
      {l.needTick ? (
        <>
          <UrgentWithCheckbox checked={tick} onChange={onTick} disabled={busy} />
          {!tick ? <Text style={styles.tickHint}>ติ๊กแก้เป็นงานด่วนก่อน</Text> : null}
        </>
      ) : null}
    </View>
  );
}

/**
 * ทุกอย่างใต้ปฏิทินของฟอร์มนัดวัน (นัดวันเข้า · ไม่ใช้อะไหล่จ่ายงาน · ส่งตรวจ) — ที่เดียวที่รู้กฎ ฟอร์มแค่วางชิ้นนี้ใต้ช่องวัน
 * หัวหน้าภาค: บรรทัดสถานะ (s1Line) · ปุ่มขอแอดมินต่อวันที่ปิด · กล่องม่วงคำขอที่รออยู่ + ยกเลิก · กล่องคำตอบของแอดมิน
 * แอดมินที่ทำแทน: บรรทัดแดง + ช่องติ๊ก (แอดมินปลดเองได้ ไม่ต้องขอใคร)
 * cutoff = null (ใบทดสอบ) ไม่วาดอะไร — เซิร์ฟเวอร์ไม่บังคับกฎกับใบทดสอบ ปุ่มขอจะได้แค่ 400
 * past = วันที่เลือกย้อนหลัง — บรรทัด "วันนัดย้อนหลังไม่ได้" ของฟอร์มขึ้นแทนบรรทัดสถานะ (ไม่ขึ้นซ้อนสองบรรทัด)
 * คำขอ/ยกเลิกไม่ปิดฟอร์มและไม่โหลดใบใหม่ (ผู้เรียกวาดทับด้วยสถานะจากคำตอบ) — ทีม เวลา อะไหล่ที่กรอกไว้ต้องอยู่ครบ
 */
export function ScheduleDayHelp({
  who,
  day,
  past,
  now,
  cutoff,
  urgentFor,
  ask,
  answer,
  tick,
  onTick,
  onAsk,
  onCancelAsk,
  busy,
}: {
  who: "supervisor" | "admin";
  day: string | null;
  past?: boolean;
  now: number;
  cutoff: Cutoff | null | undefined;
  urgentFor: string | null | undefined;
  ask: UrgentAsk | null | undefined;
  answer: UrgentAnswer | null | undefined;
  tick: boolean;
  onTick: (v: boolean) => void;
  onAsk: (day: string) => void;
  onCancelAsk: () => void;
  busy?: boolean;
}) {
  if (!cutoff) return null;
  if (who === "admin")
    return <AdminDayLine day={past ? null : day} now={now} cutoff={cutoff} urgentFor={urgentFor} changed={false} tick={tick} onTick={onTick} busy={busy} />;
  const today = serverDay(now);
  const line = past ? null : scheduleLine(day, now, cutoff, urgentFor);
  const days = askDays(now, cutoff, urgentFor, ask);
  const pending = ask && ask.day >= today ? ask : null;
  // คำตอบของวันที่ผ่านไปแล้วไม่มีความหมาย (เซิร์ฟเวอร์ก็ไม่ส่ง) — กันฟอร์มที่เปิดค้างข้ามเที่ยงคืน
  const reply = answer && answer.day >= today ? answer : null;
  if (!line && !days.length && !pending && !reply) return null;
  return (
    <View style={styles.helpWrap}>
      {line ? <ToneLine tone={line.tone} text={line.text} /> : null}
      {days.map((d) => {
        const label = d === today ? ASK_TODAY : ASK_TOMORROW;
        return (
          <TouchableOpacity
            key={d}
            style={[styles.askBtn, busy && { opacity: 0.6 }]}
            onPress={() => onAsk(d)}
            disabled={busy}
            accessibilityLabel={label}
          >
            <Text style={styles.askBtnText}>{label}</Text>
          </TouchableOpacity>
        );
      })}
      {pending ? (
        <View style={styles.askBox} accessibilityLiveRegion="polite">
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.askTitle}>ส่งคำขอแล้ว — รอแอดมินแก้เป็นงานด่วน (นัด {dayShort(pending.day)})</Text>
            <Text style={styles.askText}>ขึ้นที่แอดมินในหัวข้อ “ขอนัดด่วน” · ระหว่างรอจะนัดวันอื่นไปเลยก็ได้</Text>
          </View>
          <TouchableOpacity
            style={[styles.askCancel, busy && { opacity: 0.6 }]}
            onPress={onCancelAsk}
            disabled={busy}
            accessibilityLabel={ASK_CANCEL}
          >
            <Text style={styles.askCancelText}>{ASK_CANCEL}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {reply ? (
        <View style={styles.answerBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
          <Text style={styles.answerText}>
            แอดมินตอบคำขอนัดด่วน ({dayShort(reply.day)}): “{reply.note}” · {reply.byName ?? "แอดมิน"} {hhmmOf(reply.at)} น.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * แอดมินกด "แก้เป็นงานด่วน" ทีละใบ (ข้อ ง · ข้อ 1) — หัวหน้าภาคกดปล่อยงานใบนี้ได้ทันทีแม้เลยเวลาปิดรับ
 * เป็นหน้าต่างของตัวเองชั้นบนสุดเสมอ ห้ามเปิดจากในฟอร์มขั้นตอน — Modal ซ้อน Modal บนเว็บไม่น่าเชื่อถือ (CLAUDE.md)
 * ส่งวันนัดที่เห็นไปด้วย: แอดมินอีกคนเพิ่งเลื่อนวันระหว่างนั้น เซิร์ฟเวอร์ปฏิเสธ ไม่ปลดล็อกวันที่คนกดไม่ได้เห็น
 * เหตุผลไม่บังคับ (ข้อ 8) ประวัติบันทึกว่าใครกดเมื่อไรเสมอ
 */
export function UrgentReleaseModal({
  order,
  now,
  onDone,
  onCancel,
}: {
  order: BannerRow;
  // บังคับส่ง — ห้ามถอยไปใช้นาฬิกามือถือ (ข้อ 12): เครื่องแอดมินช้า 10 นาที ใบที่เพิ่งล็อกจะดูเหมือนยังไม่ล็อก กล่อง "โทรถามหัวหน้าภาค" หาย
  now: number;
  onDone: (detail: unknown) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const day = order.scheduledAt?.slice(0, 10) ?? null;
  const lines = adminRowLines(order, now, null, "locked");
  const inspect = order.status === "INSPECT_DISPATCH";

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post(`/work-orders/${order.id}/urgent-release`, {
        reason: reason.trim() || undefined,
        seenScheduledAt: day,
        seenScheduledTime: order.scheduledTime ?? null,
      });
      feedback.toast("success", `แก้ ${order.code} เป็นงานด่วนแล้ว — หัวหน้าภาคกดปล่อยงานได้ทันที (ลงประวัติใบงานแล้ว)`);
      await onDone(data);
    } catch (e) {
      // บอกในหน้าต่างเอง — เปิดจากงานของฉันวันนี้ไม่มีหน้าใบงานคอยรับข้อความ 409 กลาง ผู้ใช้จะไม่รู้ว่าทำไมไม่ผ่าน
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppModal
      visible
      onClose={onCancel}
      busy={busy}
      title={`แก้เป็นงานด่วน · ${order.code}`}
      subtitle={`${order.branchCode} ${order.branchName}`.trim()}
      banner={error ? <Text style={styles.modalErr}>{error}</Text> : undefined}
      footer={
        <View style={styles.modalFooter}>
          <TouchableOpacity style={[styles.modalBtn, styles.modalGhost]} onPress={onCancel} disabled={busy} accessibilityLabel="ยกเลิก">
            <Text style={styles.modalGhostText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalBtn, styles.modalPrimary, busy && { opacity: 0.6 }]}
            onPress={save}
            disabled={busy}
            accessibilityLabel="บันทึก แก้เป็นงานด่วน"
          >
            <Text style={styles.modalPrimaryText}>บันทึก แก้เป็นงานด่วน</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: spacing.md }}>
        <View style={styles.modalAppt}>
          <Text style={styles.modalApptText}>
            <Text style={styles.bold}>นัด</Text> {day ? dayFull(day) : "—"} · {timeText(order.scheduledTime)} · ทีม{order.assignedTeam ?? " —"}
            {inspect ? " · ส่งช่างตรวจ" : ""}
          </Text>
        </View>
        {/* ใบไม่มีคนรับไม่มีกล่องนี้ — ไม่มีหัวหน้าภาคให้ถาม (DEFAULT — บอกเจ้าของงาน) */}
        {lines.ask ? (
          <View style={[styles.modalAsk, lines.ask.tone === "purple" ? styles.askPurple : styles.askGrey]}>
            <Text style={[styles.modalAskText, { color: lines.ask.tone === "purple" ? colors.roleAdmin : colors.textMuted }]}>{lines.ask.text}</Text>
          </View>
        ) : null}
        <View style={styles.modalInfo}>
          <Text style={styles.modalInfoText}>
            หัวหน้าภาคกดปล่อยงานใบนี้ได้ทันทีแม้เลยเวลาปิดรับ — เฉพาะใบนี้ วันนัดนี้ · การ์ดขึ้นป้าย “แอดมินแก้เป็นงานด่วน” · ไม่เปลี่ยนความเร่งด่วน
            (ด่วน/ปกติ) ของใบ · เลื่อนวันนัดภายหลังต้องแก้ใหม่
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>เหตุผล (ไม่บังคับ — ลงประวัติใบงาน)</Text>
          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={setReason}
            maxLength={300}
            placeholder="เช่น ร้านปิดเครื่องอยู่ ต้องเข้าพรุ่งนี้"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="เหตุผล (ไม่บังคับ — ลงประวัติใบงาน)"
          />
        </View>
      </View>
    </AppModal>
  );
}

interface CutoffSetting {
  time: string;
  choices: string[];
  since: string;
  changedAt: string | null;
  changedByName: string | null;
  previous: string | null;
  canEdit: boolean;
  serverNow: string;
}

const DEFAULT_CHOICES = ["15:00", "15:30", "16:00", "16:30", "17:00"];
/** คำอธิบายใต้หัวการ์ด (ตัวอย่าง appt-cutoff) — บอกด้วยว่าคอนเฟิร์ม/ปล่อยงานไม่มีเวลาแล้ว แอดมินที่เคยชินกับกฎเดิมจะได้ไม่เตือนหัวหน้าภาคผิด */
const CARD_DESC =
  "หัวหน้าภาคนัดงานของพรุ่งนี้ได้ถึงเวลานี้ — เลยแล้วปฏิทินปิดวันพรุ่งนี้ (วันนี้ปิดตลอด) ร้านต้องการจริงให้แอดมินแก้เป็นงานด่วน · " +
  "คอนเฟิร์มลูกค้าและปล่อยงานกดได้ทุกเวลา · ทุกวันรวมเสาร์–อาทิตย์และวันหยุด · ใช้ทุกภาค · แอดมินเปลี่ยนได้ (Admin Spare Part ดูอย่างเดียว)";

/**
 * การ์ด "เวลาปิดนัดงานพรุ่งนี้" ท้ายหน้าระบบหลังบ้าน — คีย์/ค่า/ค่าตั้งต้นเดิมของ "เวลาปิดรับปล่อยงาน" แค่ตอนนี้ใช้ตอนนัดวัน
 * แอดมินทุกคนเปลี่ยนได้ · Admin Spare Part เห็นแต่กดไม่ได้ (เซิร์ฟเวอร์บอกผ่าน canEdit — ด่านจริงอยู่ที่เซิร์ฟเวอร์)
 * แตะแล้วบันทึกเลยเหมือนในตัวอย่าง ยกเว้นตัวเลือกที่ทำให้ปฏิทินของหัวหน้าภาคปิดวันพรุ่งนี้ "ทันที" (เลื่อนให้เร็วขึ้นหลังเวลาใหม่ผ่านไปแล้ว)
 * — ถามก่อนเสมอ: แตะพลาดบนมือถือครั้งเดียวปิดนัดพรุ่งนี้ทั้งบริษัท ร้านที่ต้องการพรุ่งนี้ต้องรอแอดมินแก้ทีละใบ
 * ไม่นับใบให้ดูแล้ว: ใบที่โดนคือใบที่ยังไม่ได้นัด ซึ่งนับไม่ได้ว่าใบไหนตั้งใจจะนัดพรุ่งนี้
 * "ตอนนี้" มาจาก serverNow ของการ์ดเอง ไม่ใช่นาฬิกาเครื่องแอดมิน
 */
export function DispatchCutoffCard() {
  const [data, setData] = useState<CutoffSetting | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // saving = ค่าที่กำลังส่ง (ชิปนั้นขึ้นเป็นตัวเลือกไปก่อน) · busy = กำลังส่ง (กันแตะซ้อน)
  const [saving, setSaving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // การ์ดไม่ได้วาดอะไรตามเวลา ต้องการ "ตอนนี้" แค่ตอนแตะ — อ่านสด ณ วินาทีที่แตะ ไม่ใช่ค่าจากรอบวาดล่าสุด (เก่าได้ 30 วิ)
  const serverNowAt = useServerNowFn(data?.serverNow);

  const load = useCallback(async () => {
    try {
      const res = await api.get<CutoffSetting>("/settings/dispatch-cutoff");
      setData(res.data);
      setLoadError(null);
    } catch (e) {
      setLoadError(apiErrorMessage(e));
    }
  }, []);
  // โหลดใหม่ทุกครั้งที่กลับมาหน้านี้ — แอดมินอีกคนอาจเพิ่งเปลี่ยน การ์ดต้องบอกค่าที่ใช้อยู่จริง
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function save(to: string) {
    setSaving(to);
    setBusy(true);
    try {
      const res = await api.put<CutoffSetting>("/settings/dispatch-cutoff", { time: to });
      setData(res.data);
      feedback.toast("success", `ตั้งเวลาปิดนัดงานพรุ่งนี้เป็น ${to} น. แล้ว — มีผลกับการนัดครั้งต่อไปทันที`);
    } catch (e) {
      feedback.toast("error", `ตั้งเวลาปิดนัดไม่สำเร็จ — ${apiErrorMessage(e)}`);
      load();
    } finally {
      setSaving(null);
      setBusy(false);
    }
  }

  function pick(to: string) {
    if (!data || !data.canEdit || busy || to === data.time) return;
    if (cutoffChangeLocksNow(serverNowAt(), data.time, to)) {
      showAlert(
        `ตั้งเวลาปิดนัดเป็น ${to} น.?`,
        `ตอนนี้เลย ${to} น. แล้ว — ตั้งแล้วปฏิทินของหัวหน้าภาคปิดวันพรุ่งนี้ทันที ร้านที่ต้องการพรุ่งนี้ต้องให้แอดมินแก้เป็นงานด่วนทีละใบ`,
        [
          { text: "ยกเลิก", style: "cancel" },
          { text: `ตั้งเป็น ${to} น.`, style: "destructive", onPress: () => save(to) },
        ]
      );
      return;
    }
    save(to);
  }

  const choices = data?.choices?.length ? data.choices : DEFAULT_CHOICES;
  const current = saving ?? data?.time ?? null;
  const canEdit = !!data?.canEdit;
  const note =
    data?.changedAt && data.previous
      ? `เปลี่ยนล่าสุด: ${data.changedByName ?? "ไม่ทราบชื่อ"} · ${data.previous} → ${data.time} น. · มีผลกับการนัดครั้งต่อไปทันที วันที่นัดไปแล้วไม่เปลี่ยน`
      : "ค่าตั้งต้น 16:00 น. · เปลี่ยนแล้วมีผลกับการนัดครั้งต่อไปทันที วันที่นัดไปแล้วไม่เปลี่ยน";

  return (
    <View style={styles.settingsWrap}>
      <Text style={[styles.settingsHeading, headingFont]}>ตั้งค่า</Text>
      <View style={styles.card} accessibilityLabel="การ์ดเวลาปิดนัดงานพรุ่งนี้">
        <Text style={styles.cardTitle}>เวลาปิดนัดงานพรุ่งนี้</Text>
        <Text style={styles.cardDesc}>{CARD_DESC}</Text>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="เวลาปิดนัดงานพรุ่งนี้">
          {choices.map((v) => {
            const on = current === v;
            const disabled = !data || !canEdit || busy;
            return (
              <TouchableOpacity
                key={v}
                onPress={() => pick(v)}
                disabled={disabled}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: !canEdit }}
                aria-checked={on}
                accessibilityLabel={v}
                style={[styles.timeChip, on && styles.timeChipOn, !canEdit && !on && styles.timeChipLocked]}
              >
                <Text style={[styles.timeChipText, on && styles.timeChipTextOn]}>{v}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {loadError ? (
          <View style={styles.loadErr}>
            <Text style={styles.loadErrText}>โหลดเวลาปิดนัดไม่สำเร็จ — {loadError}</Text>
            <TouchableOpacity onPress={load} accessibilityLabel="ลองใหม่" style={styles.retry}>
              <Text style={styles.retryText}>ลองใหม่</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.cardNote}>{data ? note : "กำลังโหลดเวลาปิดนัด…"}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: "700" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 1,
    maxWidth: "100%",
  },
  chipText: { fontSize: 12, lineHeight: 18, fontWeight: "700", flexShrink: 1 },

  banner: { borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  bannerHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bannerTitle: { flex: 1, minWidth: 0, fontSize: 14.5, lineHeight: 21, fontWeight: "700" },
  rightPill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, backgroundColor: colors.card },
  rightText: { fontSize: 12.5, lineHeight: 20, fontWeight: "700", fontVariant: ["tabular-nums"] },
  bannerHint: { fontSize: 12.5, lineHeight: 18, color: colors.body },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  bannerCode: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.text },
  bannerLine: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  bannerRight: { fontSize: 12, lineHeight: 18, fontWeight: "700", fontVariant: ["tabular-nums"] },

  formWarn: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  formWarnText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  urgentWith: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, alignSelf: "flex-start", maxWidth: "100%" },
  urgentWithText: { flexShrink: 1, fontSize: 13.5, lineHeight: 20, fontWeight: "600", color: colors.text },

  helpWrap: { gap: spacing.sm, marginTop: spacing.sm },
  tickHint: { fontSize: 12.5, lineHeight: 18, color: colors.dangerInk, fontWeight: "600" },
  // ปุ่มขอแอดมิน (ตัวอย่าง: กรอบม่วงอ่อน) — ไม่ใช่ปุ่มหลักของฟอร์ม ปุ่มหลักยังเป็น "ยืนยัน" นัดวันอื่น
  askBtn: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.roleAdminLine,
    backgroundColor: colors.roleAdminSoft,
    justifyContent: "center",
  },
  askBtnText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.roleAdmin },
  askBox: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    backgroundColor: colors.roleAdminSoft,
    borderColor: colors.roleAdminLine,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  askTitle: { fontSize: 14, lineHeight: 21, fontWeight: "700", color: colors.roleAdmin },
  askText: { fontSize: 12.5, lineHeight: 18, color: colors.body },
  askCancel: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.roleAdminLine,
    backgroundColor: colors.card,
    justifyContent: "center",
  },
  askCancelText: { fontSize: 13, fontWeight: "700", color: colors.roleAdmin },
  answerBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.background,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  answerText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 19, color: colors.text },

  modalErr: { fontSize: 13, lineHeight: 19, fontWeight: "600", color: colors.dangerInk, padding: spacing.sm },
  modalFooter: { flex: 1, flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 },
  modalBtn: { minHeight: 44, borderRadius: radius.md, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  modalGhost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  modalGhostText: { color: colors.navy, fontWeight: "700" },
  modalPrimary: { backgroundColor: colors.navyFill },
  modalPrimaryText: { color: "#FFFFFF", fontWeight: "700" },
  modalAppt: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8 },
  modalApptText: { fontSize: 13, lineHeight: 19, color: colors.body },
  modalAsk: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7 },
  askPurple: { backgroundColor: colors.roleAdminSoft, borderColor: colors.roleAdminLine },
  askGrey: { backgroundColor: colors.background, borderColor: colors.border },
  modalAskText: { fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  modalInfo: { backgroundColor: colors.primarySoft, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8 },
  modalInfoText: { fontSize: 12.5, lineHeight: 18, color: colors.text },
  label: { fontSize: 13, lineHeight: 19, fontWeight: "600", color: colors.body },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    minHeight: 44,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
  },

  settingsWrap: { marginTop: spacing.xl, gap: spacing.sm },
  settingsHeading: { fontSize: 18, lineHeight: 26, fontWeight: "800", color: colors.text },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  cardTitle: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.navy },
  cardDesc: { fontSize: 12.5, lineHeight: 18, color: colors.body },
  chips: { flexDirection: "row", gap: 4 },
  timeChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  timeChipOn: { backgroundColor: colors.navyFill, borderColor: colors.navyFill },
  // ดูอย่างเดียว: ยังอ่านค่าทุกตัวได้ แค่จางลงให้รู้ว่ากดไม่ได้ — ตัวที่เลือกอยู่คงสีเข้มให้เห็นค่าปัจจุบันชัด
  timeChipLocked: { opacity: 0.55 },
  timeChipText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.navy, fontVariant: ["tabular-nums"] },
  timeChipTextOn: { color: "#FFFFFF" },
  cardNote: { fontSize: 12, lineHeight: 17, color: colors.body },
  loadErr: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  loadErrText: { flex: 1, minWidth: 180, fontSize: 12.5, lineHeight: 18, color: colors.dangerInk },
  retry: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingHorizontal: 12, minHeight: 36, justifyContent: "center" },
  retryText: { fontSize: 13, fontWeight: "700", color: colors.navy },
});
