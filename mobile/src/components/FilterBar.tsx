/**
 * แถบตัวกรองของหน้ารายการ (เจ้าของงานขอ ต.ค. 69 — "หาง่ายและเข้าใจมากที่สุด")
 *
 * เดิมทุกอย่างเป็นปุ่มกลมหน้าตาเดียวกันเรียงสี่แถว (กลุ่มใบงาน · รอใคร · ทีม · สาขา+เรียง)
 * คนแยกไม่ออกว่าปุ่มไหนเลือกกอง ปุ่มไหนกรอง ปุ่มไหนเรียง และไม่รู้ว่าตอนนี้กรองอะไรอยู่
 * ตอนนี้แต่ละชนิดหน้าตาต่างกัน:
 *   · แท็บขีดเส้นใต้ = ดูกองไหน (ViewTabs)
 *   · ปุ่มกางรายการ = ตัวกรองที่เลือกได้ทีละค่า บอกค่าที่เลือกอยู่บนปุ่มเลย (FilterDropdown)
 *   · ชิปมีจุดสี = "ต้องรีบดู" กดทีเดียวกรองเรื่องที่คนเข้ามาหาบ่อยที่สุด (QuickChips)
 *   · แถบสรุป = เหลือกี่ใบ กรองอะไรอยู่ เอาออกทีละอันหรือล้างหมด (ActiveBar)
 * จอแคบรวมตัวกรองทั้งหมดไว้ในหน้าต่างเดียว (FilterSheet) แทนการเรียงปุ่มยาวจนต้องปัดหา
 *
 * ตัวเลือกที่นับได้ 0 ใบยังแสดง (จาง กดไม่ได้) แทนที่จะหายไป — ปุ่มที่โผล่/หายตามข้อมูล
 * ทำให้ตำแหน่งปุ่มเลื่อนไปมา คนจำที่กดไม่ได้
 */
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import Popover from "./Popover";
import AppModal from "./AppModal";
import { colors, radius, spacing } from "../theme";

export interface FilterOption {
  value: string;
  label: string;
  /** บรรทัดเล็กใต้ชื่อ เช่น DODO → แฟรนไชส์ */
  hint?: string;
  /** จำนวนใบถ้าเลือกค่านี้ — ไม่ใส่ = ไม่แสดงตัวเลข (เช่น ตัวเลือกการเรียง) */
  n?: number;
  dot?: string;
}

export interface FilterGroup {
  key: string;
  label: string;
  value: string;
  options: FilterOption[];
  onPick: (value: string) => void;
  /** ค่าที่แปลว่า "ไม่ได้กรอง" — ปุ่มไม่ขึ้นสีและไม่ขึ้นในแถบสรุป (ค่าตั้งต้น "") */
  allValue?: string;
}

export interface QuickFilter {
  key: string;
  label: string;
  dot: string;
  n: number;
}

export const isSet = (g: FilterGroup) => g.value !== (g.allValue ?? "");
export const pickedLabel = (g: FilterGroup) => g.options.find((o) => o.value === g.value)?.label ?? "";

/** แท็บ "ดูกองไหน" — ชั้นบนสุดของหน้า เลื่อนข้างได้บนจอแคบ */
export function ViewTabs({
  tabs,
  value,
  onPick,
  right,
}: {
  /** dot = มีใบที่อัปเดตรอให้ดูในแท็บนั้น (ปุ่ม "อีก n ใบ" ของหน้ารายการใบงาน) */
  tabs: { value: string; label: string; n?: number; dot?: boolean }[];
  value: string;
  onPick: (v: string) => void;
  right?: React.ReactNode;
}) {
  /**
   * แท็บที่เลือกต้องอยู่ในจอเสมอ — ปุ่ม "มีอัปเดต" พาไปแท็บท้าย ๆ (ปิดแล้ว · ทั้งหมด) ได้
   * จอมือถือแถบแท็บเลื่อนข้างอยู่ ถ้าไม่เลื่อนตามจะไม่เห็นว่าตอนนี้อยู่แท็บไหน
   */
  const scroller = useRef<ScrollView>(null);
  const xs = useRef<Record<string, number>>({});
  useEffect(() => {
    const x = xs.current[value];
    if (x !== undefined) scroller.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, [value]);
  return (
    <View style={styles.tabsWrap}>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        style={{ flexGrow: 1, flexShrink: 1 }}
      >
        {tabs.map((t) => {
          const on = t.value === value;
          return (
            <TouchableOpacity
              key={t.value}
              onLayout={(e) => (xs.current[t.value] = e.nativeEvent.layout.x)}
              style={[styles.tab, on && styles.tabOn]}
              onPress={() => onPick(t.value)}
              // ตัวเลขอยู่ในป้ายแยก — ชื่อปุ่มรวมไว้ให้โปรแกรมอ่านจออ่านต่อกัน ("ที่ยังค้าง 91 ใบ")
              accessibilityLabel={t.n ? `${t.label} ${t.n} ใบ` : t.label}
              // role=tab + aria-selected — โปรแกรมอ่านจอ/เทสต์รู้ว่าตอนนี้อยู่แท็บไหน (เว็บไม่แปลง accessibilityState เป็น aria-selected)
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              aria-selected={on}
            >
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
              {t.n ? (
                <View style={[styles.tabN, on && styles.tabNOn]}>
                  <Text style={[styles.tabNText, on && styles.tabNTextOn]}>{t.n.toLocaleString("th-TH")}</Text>
                </View>
              ) : null}
              {t.dot ? <View style={styles.tabDot} accessibilityLabel="มีใบที่อัปเดต" /> : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {right}
    </View>
  );
}

/** สวิตช์เปิด/ปิด — ใช้กับตัวกรองที่มีแค่ใช่/ไม่ใช่ ไม่ให้หน้าตาเหมือนแท็บ */
export function Toggle({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.toggle}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
    >
      <View style={[styles.track, on && styles.trackOn]}>
        <View style={[styles.knob, on && styles.knobOn]} />
      </View>
      <Text style={styles.toggleText}>{label}</Text>
    </TouchableOpacity>
  );
}

function OptionRow({ o, on, onPress }: { o: FilterOption; on: boolean; onPress: () => void }) {
  const off = o.n === 0 && !on;
  return (
    <TouchableOpacity
      style={[styles.opt, on && styles.optOn, off && styles.dim]}
      onPress={onPress}
      disabled={off}
      // "ตัวกรอง" นำหน้า — ชื่อบนปุ่ม (หัวหน้าภาค, DODO) ซ้ำกับป้ายในแถวรายการ เทสต์กับโปรแกรมอ่านจอจะได้แยกออก
      accessibilityLabel={`ตัวกรอง ${o.label}`}
      accessibilityState={{ selected: on, disabled: off }}
    >
      <View style={[styles.radio, on && styles.radioOn]} />
      {o.dot ? <View style={[styles.dot, { backgroundColor: o.dot }]} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.optText, on && styles.optTextOn]} numberOfLines={1}>
          {o.label}
        </Text>
        {o.hint ? <Text style={styles.optHint}>{o.hint}</Text> : null}
      </View>
      {o.n !== undefined ? <Text style={styles.optN}>{o.n.toLocaleString("th-TH")}</Text> : null}
    </TouchableOpacity>
  );
}

/** ปุ่ม "สาขา: DODO ▾" — กดแล้วกางรายการลอยใต้ปุ่ม (จอคอม) */
export function FilterDropdown({ group, icon }: { group: FilterGroup; icon?: keyof typeof Ionicons.glyphMap }) {
  const anchor = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const set = isSet(group);
  return (
    <View ref={anchor} collapsable={false}>
      <TouchableOpacity
        style={[styles.dd, set && styles.ddSet]}
        onPress={() => setOpen((v) => !v)}
        accessibilityLabel={`เลือก ${group.label}`}
        accessibilityState={{ expanded: open }}
      >
        {icon ? <Ionicons name={icon} size={15} color={set ? colors.primaryInk : colors.textMuted} /> : null}
        <Text style={[styles.ddText, set && styles.ddTextSet]} numberOfLines={1}>
          {group.label}: <Text style={styles.ddValue}>{pickedLabel(group)}</Text>
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={set ? colors.primaryInk : colors.textMuted} />
      </TouchableOpacity>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} minWidth={260} maxHeight={420}>
        <ScrollView style={{ padding: 6 }}>
          {group.options.map((o) => (
            <OptionRow
              key={o.value}
              o={o}
              on={o.value === group.value}
              onPress={() => {
                group.onPick(o.value);
                setOpen(false);
              }}
            />
          ))}
        </ScrollView>
      </Popover>
    </View>
  );
}

/** ชิป "ต้องรีบดู" — เลือกได้หลายอัน (ใบที่เข้าอย่างใดอย่างหนึ่ง) */
export function QuickChips({
  items,
  on,
  toggle,
  wrap,
}: {
  items: QuickFilter[];
  on: Set<string>;
  toggle: (key: string) => void;
  wrap?: boolean;
}) {
  const chips = items.map((q) => {
    const sel = on.has(q.key);
    const off = !q.n && !sel;
    return (
      <TouchableOpacity
        key={q.key}
        style={[styles.q, sel && styles.qOn, off && styles.dim]}
        onPress={() => toggle(q.key)}
        disabled={off}
        accessibilityLabel={`ต้องรีบดู ${q.label} ${q.n}`}
        accessibilityState={{ selected: sel, disabled: off }}
      >
        <View style={[styles.dot, { backgroundColor: sel ? colors.dangerInk : q.dot }]} />
        <Text style={[styles.qText, sel && styles.qTextOn]}>{q.label}</Text>
        <Text style={[styles.qN, sel && styles.qTextOn]}>{q.n.toLocaleString("th-TH")}</Text>
      </TouchableOpacity>
    );
  });
  const label = <Text style={styles.qLabel}>ต้องรีบดู</Text>;
  return wrap ? (
    <View style={[styles.qRow, { flexWrap: "wrap" }]}>
      {label}
      {chips}
    </View>
  ) : (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.qRow}>
      {label}
      {chips}
    </ScrollView>
  );
}

export interface ActiveTag {
  key: string;
  label: string;
  onClear: () => void;
  /** ชื่อปุ่ม ✕ สำหรับโปรแกรมอ่านจอ/เทสต์ — ไม่ใส่ = "เอาตัวกรอง … ออก" */
  a11y?: string;
}

/** "แสดง 5 จาก 223 ใบ · กรองอยู่ [ด่วน ✕] [สาขา DODO ✕] · ล้างทั้งหมด" */
export function ActiveBar({ shown, total, tags, onClearAll }: { shown: number; total: number; tags: ActiveTag[]; onClearAll: () => void }) {
  if (!tags.length) return null;
  return (
    <View style={styles.active}>
      <Text style={styles.activeCount}>
        แสดง {shown.toLocaleString("th-TH")} จาก {total.toLocaleString("th-TH")} ใบ
      </Text>
      <Text style={styles.activeLabel}>กรองอยู่</Text>
      {tags.map((t) => (
        <TouchableOpacity key={t.key} style={styles.tag} onPress={t.onClear} accessibilityLabel={t.a11y ?? `เอาตัวกรอง ${t.label} ออก`}>
          <Text style={styles.tagText}>{t.label}</Text>
          <Ionicons name="close" size={13} color={colors.card} />
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={onClearAll} accessibilityLabel="ล้างตัวกรองทั้งหมด">
        <Text style={styles.clearAll}>ล้างทั้งหมด</Text>
      </TouchableOpacity>
    </View>
  );
}

/** ปุ่ม "ตัวกรอง (2)" บนจอแคบ — เปิดหน้าต่างรวมตัวกรองทั้งหมด */
export function FilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.fbtn, count > 0 && styles.ddSet]} onPress={onPress} accessibilityLabel="เปิดตัวกรอง">
      <Ionicons name="options-outline" size={17} color={count ? colors.primaryInk : colors.textMuted} />
      <Text style={[styles.ddText, count > 0 && styles.ddTextSet]}>ตัวกรอง</Text>
      {count ? (
        <View style={styles.fbtnN}>
          <Text style={styles.fbtnNText}>{count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function ChipGroup({ group }: { group: FilterGroup }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.secLabel}>{group.label}</Text>
      <View style={styles.chips}>
        {group.options.map((o) => {
          const on = o.value === group.value;
          const off = o.n === 0 && !on;
          return (
            <TouchableOpacity
              key={o.value}
              style={[styles.chip, on && styles.chipOn, off && styles.chipOff]}
              onPress={() => group.onPick(o.value)}
              disabled={off}
              accessibilityLabel={`ตัวกรอง ${o.label}`}
              accessibilityState={{ selected: on, disabled: off }}
            >
              {o.dot ? <View style={[styles.dot, { backgroundColor: on ? "#fff" : o.dot }]} /> : null}
              <Text style={[styles.chipText, on && styles.chipTextOn, off && { color: colors.textFaint }]}>
                {o.label}
                {o.hint ? ` ${o.hint}` : ""}
              </Text>
              {o.n !== undefined ? <Text style={[styles.chipN, on && styles.chipTextOn]}>{o.n.toLocaleString("th-TH")}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/** หน้าต่างตัวกรองบนจอแคบ — ทุกกลุ่มเป็นหัวข้อ เลือกแล้วเห็นผลทันที ปุ่มล่างบอกว่าจะเห็นกี่ใบ */
export function FilterSheet({
  visible,
  onClose,
  groups,
  sort,
  quick,
  quickOn,
  toggleQuick,
  extra,
  shown,
  onClearAll,
}: {
  visible: boolean;
  onClose: () => void;
  groups: FilterGroup[];
  sort: FilterGroup;
  quick: QuickFilter[];
  quickOn: Set<string>;
  toggleQuick: (key: string) => void;
  extra?: React.ReactNode;
  shown: number;
  onClearAll: () => void;
}) {
  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title="ตัวกรอง"
      footer={
        <View style={styles.sheetFoot}>
          <TouchableOpacity style={styles.sheetClear} onPress={onClearAll} accessibilityLabel="ล้างตัวกรองทั้งหมด">
            <Text style={styles.sheetClearText}>ล้างทั้งหมด</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetGo} onPress={onClose} accessibilityLabel={`ดู ${shown} ใบ`}>
            <Text style={styles.sheetGoText}>ดู {shown.toLocaleString("th-TH")} ใบ</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: spacing.lg }}>
        {extra}
        {quick.length ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.secLabel}>ต้องรีบดู (เลือกได้หลายอย่าง)</Text>
            <View style={styles.chips}>
              {quick.map((q) => {
                const on = quickOn.has(q.key);
                const off = !q.n && !on;
                return (
                  <TouchableOpacity
                    key={q.key}
                    style={[styles.chip, on && styles.chipOn, off && styles.chipOff]}
                    onPress={() => toggleQuick(q.key)}
                    disabled={off}
                    accessibilityLabel={`ต้องรีบดู ${q.label} ${q.n}`}
                    accessibilityState={{ selected: on, disabled: off }}
                  >
                    <View style={[styles.dot, { backgroundColor: on ? "#fff" : q.dot }]} />
                    <Text style={[styles.chipText, on && styles.chipTextOn, off && { color: colors.textFaint }]}>{q.label}</Text>
                    <Text style={[styles.chipN, on && styles.chipTextOn]}>{q.n.toLocaleString("th-TH")}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}
        {groups.map((g) => (
          <ChipGroup key={g.key} group={g} />
        ))}
        <ChipGroup group={sort} />
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  tabsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingRight: spacing.lg,
  },
  tabs: { flexDirection: "row", gap: spacing.xl, paddingHorizontal: spacing.lg },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
    marginBottom: -1,
  },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: 14.5, lineHeight: 22, fontWeight: "700", color: colors.textMuted },
  tabTextOn: { color: colors.text },
  tabN: { borderRadius: 999, paddingHorizontal: 7, backgroundColor: colors.tile },
  tabNOn: { backgroundColor: colors.primary },
  tabNText: { fontSize: 11.5, lineHeight: 18, fontWeight: "800", color: colors.textMuted },
  tabNTextOn: { color: "#fff" },
  tabDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginLeft: -2 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  track: { width: 38, height: 22, borderRadius: 11, backgroundColor: colors.borderStrong, padding: 3 },
  trackOn: { backgroundColor: colors.primary },
  knob: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff" },
  knobOn: { transform: [{ translateX: 16 }] },
  toggleText: { fontSize: 13.5, lineHeight: 20, fontWeight: "600", color: colors.text },
  dd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 42,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
  },
  ddSet: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  ddText: { fontSize: 13.5, lineHeight: 20, fontWeight: "500", color: colors.textMuted },
  ddTextSet: { color: colors.primaryInk },
  ddValue: { fontWeight: "700" },
  opt: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 9, borderRadius: radius.sm },
  optOn: { backgroundColor: colors.primarySoft },
  optText: { fontSize: 14, lineHeight: 21, fontWeight: "600", color: colors.text },
  optTextOn: { color: colors.primaryInk },
  optHint: { fontSize: 12, lineHeight: 17, color: colors.textMuted },
  optN: { fontSize: 13, fontWeight: "700", color: colors.textMuted, fontVariant: ["tabular-nums"] },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.borderStrong },
  radioOn: { borderWidth: 5, borderColor: colors.primary },
  dim: { opacity: 0.45 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  qRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.lg },
  qLabel: { fontSize: 12.5, lineHeight: 18, fontWeight: "800", color: colors.textMuted, marginRight: 2 },
  q: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  qOn: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  qText: { fontSize: 13, lineHeight: 20, fontWeight: "600", color: colors.text },
  qTextOn: { color: colors.dangerInk },
  qN: { fontSize: 13, lineHeight: 20, fontWeight: "800", color: colors.text },
  active: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.sky50,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activeCount: { fontSize: 13.5, lineHeight: 20, fontWeight: "800", color: colors.text },
  activeLabel: { fontSize: 13, lineHeight: 20, color: colors.textMuted, marginLeft: 4 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 10,
    paddingRight: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.navyFill,
  },
  tagText: { fontSize: 12.5, lineHeight: 19, fontWeight: "600", color: colors.card },
  clearAll: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.primaryInk, textDecorationLine: "underline", marginLeft: 4 },
  fbtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 42,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
  },
  fbtnN: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 7 },
  fbtnNText: { fontSize: 11.5, lineHeight: 18, fontWeight: "800", color: "#fff" },
  secLabel: { fontSize: 13, lineHeight: 19, fontWeight: "800", color: colors.textMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipOff: { borderStyle: "dashed" },
  chipText: { fontSize: 14, lineHeight: 21, fontWeight: "600", color: colors.text },
  chipTextOn: { color: "#fff" },
  chipN: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.textMuted },
  // ท้ายหน้าต่างเรียงปุ่มชิดขวาเป็นค่าตั้งต้น — สองปุ่มนี้ต้องเต็มแถว ไม่งั้น "ล้างทั้งหมด" ถูกบีบจนหักบรรทัด
  sheetFoot: { flexDirection: "row", gap: spacing.sm, flex: 1, alignSelf: "stretch" },
  sheetClear: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  sheetClearText: { fontSize: 15, fontWeight: "700", color: colors.text },
  sheetGo: { flex: 2, alignItems: "center", justifyContent: "center", height: 46, borderRadius: radius.md, backgroundColor: colors.navyFill },
  sheetGoText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
