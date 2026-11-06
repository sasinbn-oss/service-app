/**
 * ช่องวันที่ — กดแล้วปฏิทินเดือนลอยขึ้นมา (Popover) แตะวันเพื่อเลือก
 *
 * ไม่ใช้ date picker ของระบบ เพราะหน้าตาและพฤติกรรมไม่เหมือนกันระหว่างเว็บกับมือถือ
 * เดิมเป็นช่องพิมพ์ ปี-เดือน-วัน + ปุ่มลัด วันนี้/พรุ่งนี้ — เจ้าของงานขอเป็นปฏิทินแทน
 * พิมพ์วันที่ผิดรูปแบบไม่ได้อีก และเห็นว่าวันนั้นเป็นวันอะไรของสัปดาห์
 *
 * ค่ายังเป็น "YYYY-MM-DD" (ปี ค.ศ.) แบบเดิม ว่าง = ไม่ระบุ
 */
import React, { useRef, useState } from "react";
import { ScrollView, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import TouchableOpacity from "./Tap";
import Ionicons from "@expo/vector-icons/Ionicons";
import Popover from "./Popover";
import { colors, radius, spacing } from "../theme";

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const MONTHS_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

export function thaiDate(ymd: string | null) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return `${d} ${MONTHS[m - 1]} ${String((y + 543) % 100).padStart(2, "0")}`;
}

/** "พ. 8 ต.ค. 2569" — ในช่องวันที่ วันในสัปดาห์ช่วยกันเลือกพลาด (นัดวันอาทิตย์โดยไม่รู้ตัว) */
export function thaiDateLong(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y + 543}`;
}

/** วันนี้ตามเวลาไทย — เครื่องที่ตั้งโซนเวลาอื่นต้องไม่เห็น "วันนี้" ผิดวัน */
export function todayBkk() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymdOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/**
 * ป้ายของวันนี้/พรุ่งนี้ในปฏิทินนัดวัน (เวลาปิดนัดงานพรุ่งนี้ 2 พ.ย. 69) — ผู้เรียกคิดจากนาฬิกาเซิร์ฟเวอร์ให้ (utils/dispatchCutoff scheduleDayTags)
 * ปฏิทินไม่รู้กฎเอง: ใช้กับช่องวันที่ทุกที่ในแอป ช่องที่ไม่ส่งป้ายมาต้องหน้าตาเหมือนเดิมทุกอย่าง
 */
export type CalendarDayTag = { day: string; text: string; tone: "closed" | "amber" | "green" | "grey" };

/** "อ. 3 พ.ย." — ป้ายใต้ปฏิทินบอกวันเอง เพราะพรุ่งนี้อาจอยู่นอกเดือนที่เปิดดูอยู่ */
function tagDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** สีของป้ายและของช่องวันที่มีป้าย (ตัวอย่าง supDays tagCss) — ใช้คีย์สีของธีม โหมดมืดจะได้อ่านออก */
const TAG_PILL: Record<CalendarDayTag["tone"], { bg: string; fg: string }> = {
  closed: { bg: colors.background, fg: colors.textMuted },
  amber: { bg: colors.warningSoft, fg: colors.warningInk },
  green: { bg: colors.successSoft, fg: colors.successInk },
  grey: { bg: colors.background, fg: colors.textMuted },
};

export function Calendar({
  value,
  onPick,
  marked,
  min,
  closed,
  dayTags,
}: {
  value: string;
  onPick: (ymd: string) => void;
  /** วันที่มีอะไรอยู่แล้ว (เช่น มีงานนัด) — ขึ้นจุดใต้วัน */
  marked?: Set<string>;
  /** วันแรกที่เลือกได้ — วันก่อนหน้าขีดฆ่า กดไม่ได้ (เช่น วันนัดเลือกได้ตั้งแต่วันนี้) */
  min?: string;
  /** วันที่ปิด (นอกจากก่อน min) — ขีดฆ่า กดไม่ได้ เหมือนวันก่อน min */
  closed?: (ymd: string) => boolean;
  /**
   * ป้ายของวันนี้/พรุ่งนี้ (ตามเวลาเซิร์ฟเวอร์ ผู้เรียกคำนวณให้) — ช่องวันกว้าง ~40 px ใส่คำไม่ได้ จึงเรียงเป็นแถวใต้ตาราง
   * เป็นรายการ ไม่ใช่ฟังก์ชันต่อช่อง: วันสิ้นเดือนพรุ่งนี้อยู่นอกเดือนที่เปิด (หรือไม่อยู่ในตารางเลย) ป้ายนับถอยหลังต้องยังเห็น
   */
  dayTags?: CalendarDayTag[];
}) {
  const today = todayBkk();
  // ยังไม่เลือกวัน + วันแรกที่เลือกได้อยู่ในอนาคต — เปิดที่เดือนนั้น ไม่ใช่เดือนที่ขีดฆ่าทั้งเดือน
  const start = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : min && min > today ? min : today;
  const [view, setView] = useState(() => ({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 }));
  const shift = (n: number) =>
    setView((v) => {
      const m = v.m + n;
      return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });

  const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const prevDays = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
  const cells = Math.ceil((first + days) / 7) * 7;
  const grid: { key: string; d: number; out: boolean }[] = [];
  for (let i = 0; i < cells; i++) {
    const n = i - first + 1;
    let y = view.y;
    let m = view.m;
    let d = n;
    if (n < 1) {
      m -= 1;
      d = prevDays + n;
    } else if (n > days) {
      m += 1;
      d = n - days;
    }
    if (m < 0) (m = 11), (y -= 1);
    if (m > 11) (m = 0), (y += 1);
    grid.push({ key: ymdOf(y, m, d), d, out: n < 1 || n > days });
  }

  return (
    <View style={styles.cal}>
      <View style={styles.calHead}>
        <TouchableOpacity style={styles.nav} onPress={() => shift(-1)} accessibilityLabel="เดือนก่อน">
          <Ionicons name="chevron-back" size={16} color={colors.navy} />
        </TouchableOpacity>
        <Text style={styles.month}>
          {MONTHS_FULL[view.m]} {view.y + 543}
        </Text>
        <TouchableOpacity style={styles.nav} onPress={() => shift(1)} accessibilityLabel="เดือนถัดไป">
          <Ionicons name="chevron-forward" size={16} color={colors.navy} />
        </TouchableOpacity>
      </View>
      <View style={styles.grid}>
        {DOW.map((d) => (
          <Text key={d} style={styles.dow}>
            {d}
          </Text>
        ))}
        {grid.map((c) => {
          const sel = c.key === value;
          const off = (!!min && c.key < min) || !!closed?.(c.key);
          // สีช่องตามป้าย ไม่ว่าช่องนั้นอยู่ในเดือนหรือนอกเดือน — นับถอยหลังต้องเห็นว่าอยู่ "บน" ช่องพรุ่งนี้จริง
          const tone = dayTags?.find((t) => t.day === c.key)?.tone;
          return (
            <TouchableOpacity
              key={c.key}
              style={[
                styles.day,
                c.key === today && styles.today,
                tone ? CELL_TONE[tone] : null,
                sel && (off ? styles.selOff : styles.sel),
              ]}
              onPress={() => onPick(c.key)}
              disabled={off}
              // ป้ายไม่ใส่ในชื่อช่อง — เทสต์หาวันด้วยชื่อเต็ม "อ. 3 พ.ย. 2569" ตรงตัว
              accessibilityLabel={thaiDateLong(c.key)}
              accessibilityState={{ selected: sel, disabled: off }}
            >
              <Text
                style={[
                  styles.dayText,
                  c.out && styles.dayOut,
                  (off || tone === "closed") && styles.dayOff,
                  sel && (off ? styles.selOffText : styles.selText),
                ]}
              >
                {c.d}
              </Text>
              {marked?.has(c.key) ? <View style={[styles.dot, sel && !off && { backgroundColor: "#fff" }]} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      {dayTags?.length ? (
        <View style={styles.tagRow}>
          {dayTags.map((t) => {
            const text = `${tagDay(t.day)} · ${t.text}`;
            return (
              <View key={t.day} style={[styles.tagPill, { backgroundColor: TAG_PILL[t.tone].bg }]} accessibilityLabel={text}>
                <Text style={[styles.tagText, { color: TAG_PILL[t.tone].fg }]}>{text}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export default function DateField({
  value,
  onChange,
  label,
  emptyHint = "ไม่ระบุ",
  required,
  marked,
  labelStyle,
  min,
  closed,
  dayTags,
  invalid,
  accessibilityLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  /** ชื่อช่องสำหรับโปรแกรมอ่านจอ/เทสต์ เมื่อชื่อที่เห็นซ้ำกันหลายช่องบนจอเดียว (ฟอร์มตามลูกค้าในแถวต่อท้ายเลขใบงาน) · ไม่ใส่ = label */
  accessibilityLabel?: string;
  /** วันแรกที่เลือกได้ (ดู Calendar) */
  min?: string;
  /** วันที่ปิด — ขีดฆ่า กดไม่ได้ (ดู Calendar) */
  closed?: (ymd: string) => boolean;
  /** ป้ายวันนี้/พรุ่งนี้ใต้ปฏิทิน (ดู Calendar) */
  dayTags?: CalendarDayTag[];
  /** วันที่เลือกไว้ใช้ไม่ได้แล้ว (ปิดนัดระหว่างเปิดฟอร์ม) — กรอบช่องเป็นสีแดง */
  invalid?: boolean;
  /** ข้อความในช่องตอนยังไม่เลือก */
  emptyHint?: string;
  /** ต้องมีวันเสมอ — ไม่มีปุ่ม "ไม่ระบุวัน" */
  required?: boolean;
  marked?: Set<string>;
  labelStyle?: StyleProp<TextStyle>;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<View>(null);
  const has = /^\d{4}-\d{2}-\d{2}$/.test(value);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}
      <View ref={anchor}>
        <TouchableOpacity
          style={[styles.field, open && styles.fieldOpen, invalid && styles.fieldInvalid]}
          onPress={() => setOpen((v) => !v)}
          activeOpacity={0.7}
          accessibilityLabel={accessibilityLabel || label || "วันที่"}
          accessibilityState={{ expanded: open }}
          // เว็บไม่แปลง accessibilityState เป็น aria-expanded (CLAUDE.md) — เทสต์เบราว์เซอร์อ่านว่าปฏิทินกางอยู่ไหมจากตรงนี้
          aria-expanded={open}
        >
          <Ionicons name="calendar-outline" size={17} color={colors.primaryInk} />
          <Text style={[styles.value, !has && styles.placeholder]}>
            {has ? thaiDateLong(value) : emptyHint}
          </Text>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} />
        </TouchableOpacity>
      </View>
      {/*
        มีแถวป้ายใต้ตาราง = กล่องสูงขึ้น — เผื่อความสูงและให้เลื่อนในกล่องได้ (กล่องลอยตัดส่วนที่เกินทิ้ง)
        ไม่งั้นจอเตี้ยแถวป้าย/ปุ่มไม่ระบุวันถูกตัดหายเงียบ ๆ · ช่องอื่นที่ไม่มีป้ายคงขนาดเดิม
      */}
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={300} maxHeight={dayTags?.length ? 470 : 380}>
        <PopBody scroll={!!dayTags?.length}>
          <Calendar
            value={value}
            marked={marked}
            min={min}
            closed={closed}
            dayTags={dayTags}
            onPick={(d) => {
              onChange(d);
              setOpen(false);
            }}
          />
          {!required && has ? (
            <TouchableOpacity
              style={styles.clear}
              onPress={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <Text style={styles.clearText}>ไม่ระบุวัน</Text>
            </TouchableOpacity>
          ) : null}
        </PopBody>
      </Popover>
    </View>
  );
}

function PopBody({ scroll, children }: { scroll: boolean; children: React.ReactNode }) {
  return scroll ? <ScrollView style={{ flexShrink: 1 }}>{children}</ScrollView> : <>{children}</>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: {
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  fieldOpen: { borderColor: colors.primary },
  fieldInvalid: { borderColor: colors.dangerInk, borderWidth: 1.5 },
  value: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22, color: colors.text },
  placeholder: { color: colors.textFaint },
  cal: { padding: 10, gap: 6 },
  calHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  nav: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  month: { flex: 1, textAlign: "center", fontSize: 14.5, fontWeight: "700", color: colors.text },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dow: { width: `${100 / 7}%`, textAlign: "center", fontSize: 11.5, color: colors.textMuted, paddingVertical: 4 },
  day: { width: `${100 / 7}%`, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  dayText: { fontSize: 14, color: colors.text, fontVariant: ["tabular-nums"] },
  dayOut: { color: colors.textFaint },
  dayOff: { color: colors.textFaint, textDecorationLine: "line-through" },
  today: { borderWidth: 1.5, borderColor: colors.primary },
  sel: { backgroundColor: colors.navyFill, borderColor: colors.navyFill },
  selText: { color: "#fff", fontWeight: "700" },
  // วันที่เลือกไว้แต่ปิดแล้ว (ตัวอย่าง: แดง ขอบหนา) — ยังเห็นว่าเลือกวันไหนไว้ แต่รู้ทันทีว่าใช้ไม่ได้
  selOff: { backgroundColor: colors.dangerSoft, borderWidth: 2, borderColor: colors.dangerInk },
  selOffText: { color: colors.dangerInk, fontWeight: "700" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 2 },
  tagPill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, maxWidth: "100%" },
  tagText: { fontSize: 12, lineHeight: 18, fontWeight: "700" },
  dot: { position: "absolute", bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  clear: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 9, alignItems: "center" },
  clearText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
});

/** สีช่องวันที่มีป้าย (ตัวอย่าง supDays css) — ช่องปิดเส้นประจาง ๆ · ส้มคือนับถอยหลัง · เขียวคือแอดมินแก้เป็นงานด่วนแล้ว · เทาไม่เปลี่ยน */
const CELL_TONE: Record<CalendarDayTag["tone"], ViewStyle | null> = StyleSheet.create({
  closed: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.textFaint, backgroundColor: colors.background },
  amber: { borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.warningSoft },
  green: { backgroundColor: colors.successSoft },
  grey: {},
});
