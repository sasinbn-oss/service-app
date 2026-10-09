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
import { StyleProp, StyleSheet, Text, TextStyle, View } from "react-native";
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

export function Calendar({
  value,
  onPick,
  marked,
}: {
  value: string;
  onPick: (ymd: string) => void;
  /** วันที่มีอะไรอยู่แล้ว (เช่น มีงานนัด) — ขึ้นจุดใต้วัน */
  marked?: Set<string>;
}) {
  const today = todayBkk();
  const start = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today;
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
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.day, c.key === today && styles.today, sel && styles.sel]}
              onPress={() => onPick(c.key)}
              accessibilityLabel={thaiDateLong(c.key)}
              accessibilityState={{ selected: sel }}
            >
              <Text style={[styles.dayText, c.out && styles.dayOut, sel && styles.selText]}>{c.d}</Text>
              {marked?.has(c.key) ? <View style={[styles.dot, sel && { backgroundColor: "#fff" }]} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
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
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
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
          style={[styles.field, open && styles.fieldOpen]}
          onPress={() => setOpen((v) => !v)}
          activeOpacity={0.7}
          accessibilityLabel={label || "วันที่"}
          accessibilityState={{ expanded: open }}
        >
          <Ionicons name="calendar-outline" size={17} color={colors.primaryInk} />
          <Text style={[styles.value, !has && styles.placeholder]}>
            {has ? thaiDateLong(value) : emptyHint}
          </Text>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} />
        </TouchableOpacity>
      </View>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={300} maxHeight={380}>
        <Calendar
          value={value}
          marked={marked}
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
      </Popover>
    </View>
  );
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
  today: { borderWidth: 1.5, borderColor: colors.primary },
  sel: { backgroundColor: colors.navy, borderColor: colors.navy },
  selText: { color: "#fff", fontWeight: "700" },
  dot: { position: "absolute", bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  clear: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 9, alignItems: "center" },
  clearText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
});
