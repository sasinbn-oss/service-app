/**
 * ตัวกรองหัวคอลัมน์แบบ Excel (เจ้าของงานขอ ต.ค. 69) — กดหัวคอลัมน์ → เรียง · ค้นหา · ติ๊กค่าที่จะแสดง
 *
 * ค่าที่ติ๊กให้เลือกนับจากรายการที่ผ่านตัวกรองอื่นแล้ว (แบบ Excel) — ตัวเลขข้างค่าบอกว่าเลือกแล้วจะเหลือกี่ใบ
 * กด "ตกลง" ถึงมีผล ติ๊กเล่นระหว่างทางรายการไม่กระตุก · เลือกครบทุกค่า = ไม่ได้กรอง (เก็บเป็น null)
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import Popover from "./Popover";
import { colors, radius } from "../theme";

export type SortDir = "asc" | "desc";

export function HeadFilter({
  label,
  style,
  values,
  selected,
  sort,
  onApply,
  onSort,
}: {
  label: string;
  style?: object;
  /** ค่าทั้งหมดของคอลัมน์ (จากรายการที่ผ่านตัวกรองอื่น) พร้อมจำนวนใบ */
  values: { value: string; count: number }[];
  /** null = ไม่ได้กรอง */
  selected: Set<string> | null;
  sort: SortDir | null;
  onApply: (next: Set<string> | null) => void;
  onSort: (dir: SortDir | null) => void;
}) {
  const anchor = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(new Set(selected ?? values.map((v) => v.value)));
    setQ("");
  }, [open]);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? values.filter((v) => v.value.toLowerCase().includes(t)) : values;
  }, [values, q]);
  const allOn = visible.length > 0 && visible.every((v) => draft.has(v.value));
  const active = selected !== null;

  function toggle(v: string) {
    setDraft((d) => {
      const n = new Set(d);
      n.has(v) ? n.delete(v) : n.add(v);
      return n;
    });
  }
  function toggleAll() {
    setDraft((d) => {
      const n = new Set(d);
      for (const v of visible) allOn ? n.delete(v.value) : n.add(v.value);
      return n;
    });
  }
  function apply() {
    // ค้นหาอยู่ = เอาเฉพาะที่ค้นเจอและติ๊กไว้ (แบบ Excel) · ไม่ได้ค้น = ตามที่ติ๊ก
    const picked = q.trim() ? new Set(visible.filter((v) => draft.has(v.value)).map((v) => v.value)) : draft;
    onApply(picked.size === values.length && values.every((v) => picked.has(v.value)) ? null : picked);
    setOpen(false);
  }

  return (
    <View style={style}>
      <TouchableOpacity
        ref={anchor}
        style={[styles.head, (active || sort) && styles.headOn]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        accessibilityLabel={`ตัวกรองคอลัมน์ ${label}`}
      >
        <Text style={[styles.th, (active || sort) && { color: colors.primaryInk }]} numberOfLines={1}>
          {label}
        </Text>
        {sort ? <Text style={[styles.th, { color: colors.primaryInk }]}>{sort === "asc" ? "▲" : "▼"}</Text> : null}
        <Ionicons
          name={active ? "funnel" : "chevron-down"}
          size={active ? 12 : 13}
          color={active ? colors.primaryInk : colors.textFaint}
        />
      </TouchableOpacity>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={280} maxHeight={460}>
        <View style={styles.box}>
          <TouchableOpacity
            style={[styles.sortRow, sort === "asc" && styles.sortOn]}
            onPress={() => {
              onSort(sort === "asc" ? null : "asc");
              setOpen(false);
            }}
            accessibilityLabel={`เรียง ${label} ก→ฮ`}
          >
            <Ionicons name="arrow-up" size={15} color={colors.text} />
            <Text style={styles.sortText}>เรียง ก → ฮ / A → Z</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortRow, sort === "desc" && styles.sortOn]}
            onPress={() => {
              onSort(sort === "desc" ? null : "desc");
              setOpen(false);
            }}
            accessibilityLabel={`เรียง ${label} ฮ→ก`}
          >
            <Ionicons name="arrow-down" size={15} color={colors.text} />
            <Text style={styles.sortText}>เรียง ฮ → ก / Z → A</Text>
          </TouchableOpacity>
          <View style={styles.rule} />
          <View style={styles.search}>
            <Ionicons name="search-outline" size={15} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={q}
              onChangeText={setQ}
              placeholder="ค้นหา"
              placeholderTextColor={colors.textFaint}
              accessibilityLabel={`ค้นหาค่าใน ${label}`}
            />
          </View>
          <ScrollView style={styles.list}>
            <TouchableOpacity style={styles.item} onPress={toggleAll} accessibilityLabel="เลือกทั้งหมด">
              <Check on={allOn} />
              <Text style={[styles.itemText, { fontWeight: "700" }]}>(เลือกทั้งหมด)</Text>
            </TouchableOpacity>
            {visible.map((v) => (
              <TouchableOpacity key={v.value} style={styles.item} onPress={() => toggle(v.value)} accessibilityLabel={`ค่า ${v.value}`}>
                <Check on={draft.has(v.value)} />
                <Text style={styles.itemText} numberOfLines={2}>
                  {v.value}
                </Text>
                <Text style={styles.count}>{v.count}</Text>
              </TouchableOpacity>
            ))}
            {!visible.length ? <Text style={styles.empty}>ไม่พบค่าที่ค้นหา</Text> : null}
          </ScrollView>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.ghost]}
              onPress={() => {
                onApply(null);
                setOpen(false);
              }}
              accessibilityLabel={`ล้างตัวกรอง ${label}`}
            >
              <Text style={styles.ghostText}>ล้าง</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, !draft.size && { opacity: 0.4 }]}
              disabled={!draft.size}
              onPress={apply}
              accessibilityLabel={`ตกลง ตัวกรอง ${label}`}
            >
              <Text style={styles.btnText}>ตกลง</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Popover>
    </View>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <View style={[styles.check, on && styles.checkOn]}>
      {on ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2, marginLeft: -4 },
  headOn: { backgroundColor: colors.primarySoft },
  th: { fontSize: 12, lineHeight: 18, fontWeight: "800", color: colors.textMuted },
  box: { padding: 8, gap: 4 },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingVertical: 7, borderRadius: radius.sm },
  sortOn: { backgroundColor: colors.primarySoft },
  sortText: { fontSize: 13.5, color: colors.text },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 13.5, color: colors.text, paddingVertical: 7 },
  list: { maxHeight: 240, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginTop: 4 },
  item: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingVertical: 6 },
  itemText: { flex: 1, fontSize: 13, color: colors.text },
  count: { fontSize: 12, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  empty: { fontSize: 12.5, color: colors.textFaint, padding: 10 },
  check: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 6 },
  btn: { backgroundColor: colors.navy, borderRadius: radius.sm, paddingHorizontal: 16, paddingVertical: 8 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  ghost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  ghostText: { color: colors.navy, fontWeight: "700", fontSize: 13 },
});
