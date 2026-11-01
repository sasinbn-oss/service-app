/**
 * ชิ้นส่วนหน้าจอของเวลาปิดรับปล่อยงาน (เจ้าของงานขอ ต.ค. 69) — หน้าตาและคำตามตัวอย่างที่อนุมัติ (dispatch-cutoff-canvas)
 *
 * ทุกชิ้นคิดจากนาฬิกาเซิร์ฟเวอร์ที่หน้าจอส่งเข้ามา (now จาก useServerClock) ไม่อ่านนาฬิกามือถือเอง (ข้อ 12)
 * ข้อความ/การนับอยู่ที่ utils/dispatchCutoff.ts ไฟล์นี้วาดอย่างเดียว — งานของฉันวันนี้ กล่องงาน และหน้าใบงาน
 * ใช้ชิ้นเดียวกัน ป้ายใบเดียวกันจึงบอกเหมือนกันทุกหน้า
 *
 * สีคงที่ ไม่มีกระพริบ — ถ้าวันหนึ่งอยากให้แดงกระพริบ animationKeyframes ต้องอยู่ใน StyleSheet.create
 * และ transform ในคีย์เฟรมต้องเป็นข้อความ CSS (CLAUDE.md · ดู Blink ใน WorkOrderListScreen.tsx)
 */
import React, { useCallback, useState } from "react";
import { StyleProp, StyleSheet, Text, TextInput, useWindowDimensions, View, ViewStyle } from "react-native";
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
  adminRowLines,
  addDays,
  BannerRow,
  BannerTone,
  Cutoff,
  CutoffBanner,
  cutoffChangeLocksNow,
  dayFull,
  deadlineBox,
  DispatchWatch,
  FormWarning,
  hhmmOf,
  NO_ASK_NOTE,
  preReleaseView,
  ReleaseAsk,
  ReleaseRow,
  releaseView,
  timeText,
  UrgentInfo,
  urgentNoteLines,
  useServerClock,
  useServerNowFn,
  whenText,
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

type ChipRow = ReleaseRow & { isTest?: boolean };

/**
 * ป้ายเวลาปิดรับบนการ์ด/แถว/หน้าใบงาน — หัวหน้าภาคกับแอดมินเท่านั้น (รวม Admin Spare Part และดูในฐานะ ดูอย่างเดียว)
 * ช่างกับทีม Area ไม่เห็น: ทำอะไรกับมันไม่ได้ ทีม Area เห็นเวลาปิดรับแค่บนบอร์ดแผนงาน (ดูอย่างเดียว)
 * preRelease = ใบที่ยังไม่ถึงขั้นปล่อยงานแต่นัดพรุ่งนี้/วันนี้ ("ต้องถึงขั้นปล่อยงานก่อน …" / "ถึงขั้นปล่อยงานแล้วจะติดล็อก …")
 * — เฉพาะการ์ดงานของฉันวันนี้ของหัวหน้าภาคที่ขอ
 */
export function ReleaseChip({
  row,
  now,
  cutoff,
  preRelease,
  style,
}: {
  row: ChipRow;
  now: number;
  cutoff?: Cutoff | null;
  preRelease?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { user } = useAuth();
  if (user?.role !== "ADMIN" && user?.role !== "SUPERVISOR") return null;
  const v = releaseView(row, now, cutoff);
  const view = v ? (v.tone ? { tone: v.tone, text: v.text } : null) : preRelease ? preReleaseView(row, now, cutoff) : null;
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
 * จึงพลิกเป็นล็อกพร้อมกันตอนถึงเวลา · วาดเฉพาะใบที่มี release (หรือขอป้ายก่อนถึงขั้น) ไม่ตั้งนาฬิกาให้แถวที่ไม่มีป้าย
 */
type LiveChipProps = {
  row: ChipRow;
  serverNow?: string | null;
  cutoff?: Cutoff | null;
  preRelease?: boolean;
  style?: StyleProp<ViewStyle>;
};
export function LiveReleaseChip(props: LiveChipProps) {
  const { user } = useAuth();
  // ตัดคนที่ไม่เห็นป้ายก่อนตั้งนาฬิกา — รายการของช่างมีใบขั้นปล่อยงานได้ ไม่ต้องมีตัวจับเวลาต่อแถวที่ไม่วาดอะไร
  if (user?.role !== "ADMIN" && user?.role !== "SUPERVISOR") return null;
  return <LiveChipInner {...props} />;
}
function LiveChipInner({ row, serverNow, cutoff, preRelease, style }: LiveChipProps) {
  const now = useServerClock(serverNow, cutoff?.time);
  return <ReleaseChip row={row} now={now} cutoff={cutoff} preRelease={preRelease} style={style} />;
}

/**
 * กล่องเส้นตายในฟอร์มปล่อยงานตอนยังไม่ล็อก (งานพรุ่งนี้ · งานมะรืนขึ้นไป · งานด่วน) — ตัวเลขใหญ่ "เหลือ …" ให้เห็นจากระยะแขน
 * บอก "ตามเวลาระบบ · ตอนนี้ …" ด้วย: นาฬิกามือถือช้าไม่กี่นาทีคนจะเถียงว่ายังไม่ถึง 16:00 ระบบใช้เวลาของเซิร์ฟเวอร์ (ข้อ 6 · 12)
 */
export function ReleaseDeadlineBox({ order, now, cutoff }: { order: ReleaseRow; now: number; cutoff?: Cutoff | null }) {
  const box = deadlineBox(releaseView(order, now, cutoff), now);
  if (!box) return null;
  const t = CHIP_TONE[box.tone];
  return (
    <View style={[styles.deadline, { backgroundColor: t.bg, borderColor: t.line }]} accessibilityLabel={`กล่องเส้นตาย ${box.title}`}>
      <Ionicons name={t.icon} size={22} color={t.fg} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.deadlineTitle, { color: t.fg }]}>{box.title}</Text>
        {box.big ? <Text style={[styles.deadlineBig, { color: t.fg }]}>{box.big}</Text> : null}
        <Text style={styles.deadlineSmall}>{box.small}</Text>
      </View>
    </View>
  );
}

/**
 * กล่องเขียว "แอดมินแก้เป็นงานด่วน" ในฟอร์มปล่อยงาน (แทนกล่องลูกค้าคอนเฟิร์มแล้ว — ตัวอย่างขึ้นกล่องนี้ก่อนเสมอ)
 * หัวหน้าภาคต้องเห็นว่าใครปลดให้ ทำไม และปลดให้วันนัดไหน ก่อนกดปล่อยงานที่เลยเวลาปิดรับไปแล้ว
 */
export function UrgentNoteBox({ info, day, time }: { info: UrgentInfo; day: string; time?: string | null }) {
  const l = urgentNoteLines(info, day, time);
  return (
    <View style={styles.urgentNote} accessibilityLabel={l.title}>
      <Ionicons name="lock-open-outline" size={16} color={colors.successInk} style={{ marginTop: 3 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.urgentNoteTitle}>{l.title}</Text>
        <Text style={styles.urgentNoteBy}>{l.by}</Text>
      </View>
    </View>
  );
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

/** ข้อความช่องติ๊กงานด่วน — ฟอร์มคอนเฟิร์มลูกค้า ฟอร์มเลื่อนวันนัด/ดึงงานคืน และเทสต์ใช้คำเดียวกัน */
export const URGENT_WITH_LABEL = "แก้เป็นงานด่วนไปพร้อมกัน (หัวหน้าภาคปล่อยได้เลย)";

/**
 * ช่องติ๊ก "แก้เป็นงานด่วนไปพร้อมกัน" ใต้บรรทัดเตือนแดงของฟอร์มวันที่ของแอดมิน (ข้อ 2 · ข้อ 4)
 * ร้านต้องการวันนี้/พรุ่งนี้จริงหลังเวลาปิดรับ — แอดมินปลดล็อกในการบันทึกเดียว ไม่ต้องบันทึกแล้วไปกด "แก้เป็นงานด่วน" อีกรอบ
 * ไม่ติ๊กให้เอง: ใบที่ทีมไม่ต้องไปจริงจะกลายเป็นงานที่หัวหน้าภาคกดปล่อยได้ทั้งที่ควรเลื่อน
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

/** ข้อความในฟอร์มปล่อยงานตอนล็อก (ป้ายช่องบอกแอดมิน · ส่งกลับไม่ใส่เหตุผล · ปุ่ม) — ฟอร์มปล่อยงานกับเทสต์ใช้ชุดเดียวกัน */
export const LOCK_NOTE_LABEL = "บอกแอดมินสั้น ๆ (ขอแก้เป็นงานด่วน: ไม่บังคับ · ส่งกลับ: ต้องใส่เหตุผล)";
export const LOCK_NOTE_REQUIRED = "ส่งกลับต้องบอกเหตุผล เช่น ทีมไม่ว่างวันนั้น · ร้านขอเลื่อน";
export const LOCK_BUTTONS = {
  request: "ขอแอดมินแก้เป็นงานด่วน",
  cancelRequest: "ยกเลิกคำขอ",
  back: "กลับ",
  backToQueue: "กลับไปงานของฉัน",
} as const;
/** ส่งช่างตรวจใช้คำว่า "นัดตรวจใหม่" — แอดมินจะรู้ว่าต้องโทรนัดตรวจ ไม่ใช่นัดซ่อม */
export function declineLabel(status: string): string {
  return status === "INSPECT_DISPATCH" ? "ทีมไม่ว่าง — ส่งกลับแอดมินนัดตรวจใหม่" : "ทีมไม่ว่าง — ส่งกลับแอดมินนัดใหม่";
}

/**
 * กล่องแดงกล่องเดียวในฟอร์มปล่อยงานตอนล็อก (หัวข้อ · เส้นตาย/ทางที่ใบมาถึง · "คุณกดเมื่อ …" + บรรทัดบอกทางไปต่อ)
 * บอกทั้ง "ทำไม" และ "ทำอะไรได้" ในที่เดียว — ใบที่มาถึงหลังเส้นตายต้องบอกว่าไม่ใช่เพราะหัวหน้าภาคช้า ไม่งั้นโดนโทษผิดคน
 * refusedAt = เวลาที่เซิร์ฟเวอร์ได้รับคำสั่งตอนปฏิเสธ (409 DISPATCH_LOCKED) — จอค้างเลข "เหลือ 2 นาที" แล้วกดตอน 16:01
 * ต้องบอกว่าระบบตัดสินจากเวลาที่ได้รับ และไม่มีอะไรถูกบันทึก
 * null = ใบไม่ได้ล็อก (ไม่ต้องวาด)
 */
export function LockBox({
  order,
  now,
  cutoff,
  refusedAt,
}: {
  order: ReleaseRow;
  now: number;
  cutoff?: Cutoff | null;
  refusedAt?: string | null;
}) {
  const v = releaseView(order, now, cutoff);
  if (!v?.locked) return null;
  const r = order.release!;
  const visit = `${dayFull(v.day)} · ${timeText(order.scheduledTime)}`;
  const close = `${dayFull(addDays(v.day, -1))} ${v.cutTime} น.`;
  const arrived = r.arrivedAt ? Date.parse(r.arrivedAt) : 0;
  const when = v.urgentExpired
    ? `งานด่วนที่แอดมินแก้ให้ใช้ได้ถึงวันนัด ${dayFull(v.day)} — วันนัดผ่านไปแล้ว`
    : v.past
      ? `วันนัด ${visit} ผ่านไปแล้ว`
      : r.arrivedAt && arrived >= v.deadline
        ? `ใบนี้มาถึงคุณหลังเวลาปิดรับแล้ว (${r.arrivedByAdmin ? "แอดมิน" : ""}${r.arrivedVia ?? "มาถึง"} ${whenText(arrived)} น. · ปิดรับ ${close}) — ไม่ใช่เพราะคุณปล่อยช้า · นัด ${visit}`
        : `ต้องปล่อยก่อน ${close} (ตามเวลาระบบ) · นัด ${visit}`;
  return (
    <View style={styles.lock} accessibilityRole="alert">
      <Ionicons name="lock-closed" size={22} color={colors.dangerInk} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={styles.lockTitle}>{v.past ? "ปล่อยงานไม่ได้ — วันนัดผ่านไปแล้ว" : "ปล่อยงานไม่ได้ — เลยเวลาปิดรับแล้ว"}</Text>
        <Text style={styles.lockText}>{when}</Text>
        {refusedAt ? (
          <Text style={styles.lockRefused}>
            คุณกดเมื่อ {hhmmOf(refusedAt)} น. — ระบบได้รับหลังปิดรับจึงไม่รับ · โหลดใบใหม่ให้แล้ว ไม่มีอะไรถูกบันทึก
          </Text>
        ) : null}
        {/* ด่วนตอนเปิดใบกับแก้เป็นงานด่วนเป็นคนละเรื่อง (ข้อ 3) — หัวหน้าภาคเห็นป้ายด่วนแล้วคิดว่าต้องกดได้ */}
        {!v.past && order.priority === "URGENT" ? (
          <Text style={styles.lockText}>ป้าย “ด่วน” ที่ตั้งไว้ตอนเปิดใบไม่ปลดล็อก — ต้องให้แอดมินแก้เป็นงานด่วนสำหรับวันนัดนี้</Text>
        ) : null}
        {v.past ? (
          <Text style={styles.lockText}>
            <Text style={styles.bold}>แก้เป็นงานด่วนไม่ได้แล้ว</Text> — แอดมินต้องโทรร้านเลื่อนวันนัด ใบจะกลับมาพร้อมป้าย “เลื่อนวันนัด — คอนเฟิร์มวันใหม่”
          </Text>
        ) : (
          <>
            <Text style={styles.lockText}>
              <Text style={styles.bold}>ต้องไปตามนัดจริง</Text> — กด “ขอแอดมินแก้เป็นงานด่วน” (หรือโทรหาแอดมิน) แอดมินแก้แล้วใบนี้กลับมากดปล่อยได้
            </Text>
            <Text style={styles.lockText}>
              <Text style={styles.bold}>ทีมไม่ว่าง / ร้านไม่รีบ</Text> — กด “ส่งกลับแอดมินนัดใหม่” พร้อมเหตุผล แอดมินโทรร้านแล้วใบกลับมาพร้อมป้าย “เลื่อนวันนัด — คอนเฟิร์มวันใหม่”
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

/** กล่องม่วง "ส่งคำขอแล้ว" + "ส่งเมื่อ …" — ฟอร์มปล่อยงานไม่ปิดหลังส่งคำขอ หัวหน้าภาคต้องเห็นว่าส่งไปแล้วจริง */
export function AskPendingBox({ ask }: { ask: ReleaseAsk }) {
  const note = ask.note && ask.note !== NO_ASK_NOTE ? ` · “${ask.note}”` : "";
  return (
    <View style={styles.ask} accessibilityLiveRegion="polite">
      <Ionicons name="time-outline" size={20} color={colors.roleAdmin} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.askTitle}>ส่งคำขอแล้ว — รอแอดมินแก้เป็นงานด่วน</Text>
        <Text style={styles.askText}>
          ส่งเมื่อ {hhmmOf(ask.at)} น.{note} · ขึ้นที่แอดมินในหัวข้อ “เลยเวลาปล่อยงาน” แล้ว
        </Text>
      </View>
    </View>
  );
}

export interface LockAction {
  label: string;
  onPress: () => void;
  kind: "purple" | "outline" | "ghost" | "purpleOutline";
  disabled?: boolean;
  /** ขยายเต็มที่ว่าง (ปุ่มหลัก) — ปุ่มรอง ("กลับ") กว้างเท่าข้อความ */
  grow?: boolean;
}

/**
 * แถวปุ่มของฟอร์มตอนล็อก — จอแคบกว่า 640 px เรียงลงล่างเต็มความกว้าง (นิ้วโป้งกดง่าย ข้อความยาวไม่ถูกตัด)
 * จอกว้างเรียงข้างกัน · ทุกปุ่มมีข้อความไทยและ accessibilityLabel เท่าข้อความ (เทสต์หาด้วยข้อความ — ปุ่มบนเว็บไม่ใช่ role=button)
 */
export function LockActions({ actions }: { actions: LockAction[] }) {
  const { width } = useWindowDimensions();
  const narrow = width < 640;
  return (
    <View style={[styles.actions, narrow ? styles.actionsCol : styles.actionsRow]}>
      {actions.map((a) => (
        <TouchableOpacity
          key={a.label}
          onPress={a.onPress}
          disabled={a.disabled}
          accessibilityLabel={a.label}
          style={[styles.actBtn, ACTION_STYLE[a.kind].box, !narrow && a.grow ? { flex: 1 } : null, a.disabled && { opacity: 0.5 }]}
        >
          <Text style={[styles.actText, ACTION_STYLE[a.kind].text]}>{a.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const ACTION_STYLE = {
  purple: StyleSheet.create({ box: { backgroundColor: colors.roleAdmin, borderColor: colors.roleAdmin }, text: { color: "#FFFFFF" } }),
  purpleOutline: StyleSheet.create({ box: { backgroundColor: colors.card, borderColor: colors.roleAdminLine }, text: { color: colors.roleAdmin } }),
  outline: StyleSheet.create({ box: { backgroundColor: colors.card, borderColor: colors.navy, borderWidth: 1.5 }, text: { color: colors.navy } }),
  ghost: StyleSheet.create({ box: { backgroundColor: colors.card, borderColor: colors.borderStrong }, text: { color: colors.navy } }),
};

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

/**
 * การ์ด "เวลาปิดรับปล่อยงาน" ท้ายหน้าระบบหลังบ้าน (ข้อ ข · ข้อ 13)
 * แอดมินทุกคนเปลี่ยนได้ · Admin Spare Part เห็นแต่กดไม่ได้ (เซิร์ฟเวอร์บอกผ่าน canEdit — ด่านจริงอยู่ที่เซิร์ฟเวอร์)
 * แตะแล้วบันทึกเลยเหมือนในตัวอย่าง ยกเว้นตัวเลือกที่ทำให้ใบพรุ่งนี้ที่ยังไม่ปล่อยล็อก "ทันที" (เลื่อนให้เร็วขึ้นหลังเวลาใหม่ผ่านไปแล้ว)
 * — ถามก่อนพร้อมจำนวนใบ (DEFAULT — บอกเจ้าของงาน): แตะพลาดบนมือถือครั้งเดียวล็อกงานพรุ่งนี้ทั้งบริษัท
 * แตะกลับแก้ได้ แต่หัวหน้าภาคเห็นล็อกไปแล้ว · "ตอนนี้" มาจาก serverNow ของการ์ดเอง ไม่ใช่นาฬิกาเครื่องแอดมิน
 */
export function DispatchCutoffCard() {
  const [data, setData] = useState<CutoffSetting | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // saving = ค่าที่กำลังส่ง (ชิปนั้นขึ้นเป็นตัวเลือกไปก่อน) · busy = กำลังส่งหรือกำลังนับใบที่จะล็อก (กันแตะซ้อน)
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
      feedback.toast("success", `ตั้งเวลาปิดรับปล่อยงานเป็น ${to} น. แล้ว — มีผลกับการกดครั้งต่อไปทันที`);
    } catch (e) {
      feedback.toast("error", `ตั้งเวลาปิดรับไม่สำเร็จ — ${apiErrorMessage(e)}`);
      load();
    } finally {
      setSaving(null);
      setBusy(false);
    }
  }

  async function pick(to: string) {
    if (!data || !data.canEdit || busy || to === data.time) return;
    if (cutoffChangeLocksNow(serverNowAt(), data.time, to)) {
      setBusy(true);
      let n = 0;
      try {
        const res = await api.get<DispatchWatch>("/work-orders/dispatch-watch");
        n = (res.data.unreleasedTomorrow ?? []).length;
      } catch (e) {
        // นับไม่ได้ = ไม่รู้ว่าจะล็อกกี่ใบ ไม่บันทึกแบบมืด ๆ
        setBusy(false);
        feedback.toast("error", `เช็คใบพรุ่งนี้ที่ยังไม่ปล่อยไม่สำเร็จ — ${apiErrorMessage(e)}`);
        return;
      }
      setBusy(false);
      if (n > 0) {
        showAlert(
          `ตั้งเวลาปิดรับเป็น ${to} น.?`,
          `ตอนนี้เลย ${to} น. แล้ว — ใบพรุ่งนี้ที่ยังไม่ปล่อย ${n} ใบจะล็อกทันที หัวหน้าภาคกดปล่อยไม่ได้ ต้องให้แอดมินแก้เป็นงานด่วนทีละใบ`,
          [
            { text: "ยกเลิก", style: "cancel" },
            { text: `ตั้งเป็น ${to} น.`, style: "destructive", onPress: () => save(to) },
          ]
        );
        return;
      }
    }
    save(to);
  }

  const choices = data?.choices?.length ? data.choices : DEFAULT_CHOICES;
  const current = saving ?? data?.time ?? null;
  const canEdit = !!data?.canEdit;
  const note =
    data?.changedAt && data.previous
      ? `เปลี่ยนล่าสุด: ${data.changedByName ?? "ไม่ทราบชื่อ"} · ${data.previous} → ${data.time} น. · มีผลกับการกดครั้งต่อไปทันที ใบที่ปล่อยไปแล้วไม่เปลี่ยน`
      : "ค่าตั้งต้น 16:00 น. · เปลี่ยนแล้วมีผลกับการกดครั้งต่อไปทันที ใบที่ปล่อยไปแล้วไม่เปลี่ยน";

  return (
    <View style={styles.settingsWrap}>
      <Text style={[styles.settingsHeading, headingFont]}>ตั้งค่า</Text>
      <View style={styles.card} accessibilityLabel="การ์ดเวลาปิดรับปล่อยงาน">
        <Text style={styles.cardTitle}>เวลาปิดรับปล่อยงาน</Text>
        <Text style={styles.cardDesc}>
          งานของพรุ่งนี้ต้องปล่อยให้ช่างก่อนเวลานี้ · ทุกวันรวมเสาร์–อาทิตย์และวันหยุด · ใช้ทุกภาค · แอดมินเปลี่ยนได้ (Admin Spare Part ดูอย่างเดียว)
        </Text>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="เวลาปิดรับปล่อยงาน">
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
            <Text style={styles.loadErrText}>โหลดเวลาปิดรับไม่สำเร็จ — {loadError}</Text>
            <TouchableOpacity onPress={load} accessibilityLabel="ลองใหม่" style={styles.retry}>
              <Text style={styles.retryText}>ลองใหม่</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.cardNote}>{data ? note : "กำลังโหลดเวลาปิดรับ…"}</Text>
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

  deadline: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  deadlineTitle: { fontSize: 13.5, lineHeight: 20, fontWeight: "700" },
  deadlineBig: { fontSize: 24, lineHeight: 32, fontWeight: "700", fontVariant: ["tabular-nums"] },
  deadlineSmall: { fontSize: 12, lineHeight: 17, color: colors.body },

  urgentNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.successSoft,
    borderColor: colors.successLine,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  urgentNoteTitle: { fontSize: 13.5, lineHeight: 20, fontWeight: "700", color: colors.successInk },
  urgentNoteBy: { fontSize: 12, lineHeight: 17, color: colors.body },

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

  lock: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerInk,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  lockTitle: { fontSize: 15.5, lineHeight: 22, fontWeight: "700", color: colors.dangerInk },
  lockText: { fontSize: 13, lineHeight: 19, color: colors.text },
  lockRefused: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.dangerInk },

  ask: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: colors.roleAdminSoft,
    borderColor: colors.roleAdminLine,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  askTitle: { fontSize: 14.5, lineHeight: 21, fontWeight: "700", color: colors.roleAdmin },
  askText: { fontSize: 12.5, lineHeight: 18, color: colors.body },

  actions: { gap: spacing.sm },
  actionsCol: { flexDirection: "column" },
  actionsRow: { flexDirection: "row", flexWrap: "wrap" },
  actBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actText: { fontSize: 15, lineHeight: 22, fontWeight: "700", textAlign: "center" },

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
