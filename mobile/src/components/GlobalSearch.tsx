/**
 * ช่องค้นหาบนสุด — ค้นทั้งระบบในช่องเดียว (ตัวอย่าง พ.ย. 69 · เจ้าของงานขอ "ค้นหาอะไรก็ได้ทั้งระบบ")
 *
 * ผลแบ่งกลุ่ม: ใบงาน · สาขา · คนในระบบ · เครื่อง · อะไหล่ (GET /work-orders/search-all — ขอบเขตเดียวกับรายการ)
 * Ctrl K / ⌘K โฟกัสช่องจากหน้าไหนก็ได้ · Enter เปิดรายการแรก · Esc ปิด
 * กล่องผลเป็นแผ่นที่กางในที่ ไม่ใช่ Modal — Modal ซ้อน Modal บนเว็บไม่น่าเชื่อถือ (ดู CLAUDE.md)
 */
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { api } from "../api/client";
import { navigationRef } from "../navigation/navigationRef";
import { colors } from "../theme";

interface Result {
  q: string;
  workOrders: { id: number; code: string; title: string; branch: string; machine: string | null; statusLabel: string }[];
  branches: { id: number; code: string; name: string; region: string | null }[];
  people: { id: number; name: string; employeeCode: string; roleLabel: string; team: string | null; region: string | null }[];
  machines: { id: number; code: string; brand: string | null; branch: string }[];
  parts: { id: number; partCode: string; name: string; brand: string | null }[];
}

interface Hit {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  main: string;
  sub: string;
  tag?: string;
  go: () => void;
}

const nav = navigationRef.navigate as (tab: string, p: object) => void;
/** ใบงานทั้งหมดที่ตรงคำนี้ — หน้ารายการค้นด้วยคำเดียวกัน (เลขใบ สาขา เครื่อง ชื่อคนเปิด) */
function openList(q: string) {
  if (navigationRef.isReady()) nav("WorkOrdersTab", { screen: "WorkOrderList", params: { search: q, inbox: false } });
}

function hitsOf(r: Result): { title: string; hits: Hit[] }[] {
  return [
    {
      title: "ใบงาน",
      hits: r.workOrders.map((o) => ({
        key: `wo${o.id}`,
        icon: "clipboard-outline" as const,
        main: o.code,
        sub: `${o.title} · ${o.branch}${o.machine ? ` · เครื่อง ${o.machine}` : ""}`,
        tag: o.statusLabel,
        go: () => navigationRef.isReady() && nav("WorkOrdersTab", { screen: "WorkOrderDetail", params: { id: o.id }, initial: false }),
      })),
    },
    {
      title: "สาขา",
      hits: r.branches.map((b) => ({
        key: `b${b.id}`,
        icon: "storefront-outline" as const,
        main: `${b.code} · ${b.name}`,
        sub: b.region ? `ภาค${b.region} · กดดูใบงานของสาขานี้` : "กดดูใบงานของสาขานี้",
        go: () => openList(b.code),
      })),
    },
    {
      title: "คนในระบบ",
      hits: r.people.map((p) => ({
        key: `p${p.id}`,
        icon: "person-circle-outline" as const,
        main: p.name,
        sub: [p.employeeCode, p.roleLabel, p.team ? `ทีม${p.team}` : null].filter(Boolean).join(" · "),
        go: () => openList(p.name),
      })),
    },
    {
      title: "เครื่อง",
      hits: r.machines.map((m) => ({
        key: `m${m.id}`,
        icon: "hardware-chip-outline" as const,
        main: `เครื่อง ${m.code}${m.brand ? ` · ${m.brand}` : ""}`,
        sub: `${m.branch} · กดดูใบงานของเครื่องนี้`,
        go: () => openList(m.code),
      })),
    },
    {
      title: "อะไหล่",
      hits: r.parts.map((p) => ({
        key: `sp${p.id}`,
        icon: "cube-outline" as const,
        main: p.partCode,
        sub: `${p.name}${p.brand ? ` · ${p.brand}` : ""}`,
        go: () => navigationRef.isReady() && nav("HomeTab", { screen: "SparePartDetail", params: { id: p.id }, initial: false }),
      })),
    },
  ].filter((g) => g.hits.length > 0);
}

export default function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<TextInput>(null);
  const mac = Platform.OS === "web" && typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  // Ctrl K / ⌘K จากหน้าไหนก็ได้ — คนที่ใช้ทั้งวันไม่ต้องเอื้อมเมาส์ไปที่ช่อง
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // รอพิมพ์หยุด 250 มิลลิวินาทีค่อยถาม — ไม่ยิงทุกตัวอักษรผ่าน 4G · คำตอบที่มาช้ากว่าคำใหม่ทิ้ง
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRes(null);
      return;
    }
    let alive = true;
    setBusy(true);
    const t = setTimeout(() => {
      api
        .get<Result>("/work-orders/search-all", { params: { q: term }, loadingText: false })
        .then((r) => alive && setRes(r.data))
        .catch(() => alive && setRes(null))
        .finally(() => alive && setBusy(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const groups = res ? hitsOf(res) : [];
  const first = groups[0]?.hits[0];
  const pick = (h: Hit) => {
    h.go();
    setOpen(false);
    setQ("");
    input.current?.blur();
  };
  const term = q.trim();

  return (
    <View style={styles.wrap}>
      <View style={[styles.box, open && styles.boxOn]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          ref={input}
          value={q}
          onChangeText={(t) => {
            setQ(t);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onSubmitEditing={() => (first ? pick(first) : term ? (openList(term), setOpen(false)) : undefined)}
          onKeyPress={(e) => {
            if (e.nativeEvent.key === "Escape") {
              setOpen(false);
              input.current?.blur();
            }
          }}
          placeholder="ค้นหาเลขที่ใบงาน, สาขา, ช่าง, อาการ…"
          placeholderTextColor={colors.textFaint}
          style={[styles.input, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
          accessibilityLabel="ค้นหาทั้งระบบ"
        />
        <View style={styles.kbd}>
          <Text style={styles.kbdText}>{mac ? "⌘K" : "Ctrl K"}</Text>
        </View>
      </View>
      {open && term.length >= 2 ? (
        <>
          <Pressable style={[styles.scrim, Platform.OS === "web" ? ({ position: "fixed" } as object) : null]} onPress={() => setOpen(false)} />
          <View style={styles.panel} accessibilityLabel="ผลค้นหาทั้งระบบ">
            {groups.length === 0 ? (
              <Text style={styles.empty}>{busy ? "กำลังค้นหา…" : `ไม่พบ “${term}” ในระบบ`}</Text>
            ) : (
              groups.map((g) => (
                <View key={g.title} style={styles.group}>
                  <Text style={styles.groupTitle}>{g.title}</Text>
                  {g.hits.map((h) => (
                    <TouchableOpacity key={h.key} style={[styles.hit, h === first && styles.hitFirst]} onPress={() => pick(h)} activeOpacity={0.7} accessibilityLabel={`${g.title} ${h.main}`}>
                      <View style={styles.hitIcon}>
                        <Ionicons name={h.icon} size={18} color={colors.primaryInk} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.hitMain} numberOfLines={1}>
                          {h.main}
                        </Text>
                        <Text style={styles.hitSub} numberOfLines={1}>
                          {h.sub}
                        </Text>
                      </View>
                      {h.tag ? (
                        <View style={styles.tag}>
                          <Text style={styles.tagText} numberOfLines={1}>
                            {h.tag}
                          </Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>
              ))
            )}
            <TouchableOpacity
              style={styles.all}
              onPress={() => {
                openList(term);
                setOpen(false);
              }}
              accessibilityLabel={`ดูใบงานทั้งหมดที่ตรง ${term}`}
            >
              <Text style={styles.allText}>ดูใบงานทั้งหมดที่ตรง “{term}” →</Text>
              <Text style={styles.allHint}>Enter = เปิดรายการแรก · Esc = ปิด</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // โตก่อนช่องว่างข้างขวา (flex 3 ต่อ 1) จนถึง 460 — ช่องว่างเหลือเท่าไรค่อยดันปุ่มขวาไปชิดขอบ
  wrap: { flexGrow: 3, flexShrink: 1, flexBasis: 220, minWidth: 220, maxWidth: 460, position: "relative", zIndex: 30, marginLeft: 24 },
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 40,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  boxOn: { borderColor: colors.primary, backgroundColor: colors.card },
  input: { flex: 1, minWidth: 0, height: 38, fontSize: 14, color: colors.text },
  kbd: { paddingHorizontal: 7, height: 24, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, justifyContent: "center" },
  kbdText: { fontSize: 11.5, fontWeight: "700", color: colors.textMuted },
  scrim: { position: "absolute", top: -2000, left: -4000, right: -4000, bottom: -4000, zIndex: 1 },
  panel: {
    position: "absolute",
    top: 46,
    left: 0,
    width: 560,
    zIndex: 2,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 6,
    shadowColor: "#0B2540",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  empty: { padding: 16, fontSize: 14, color: colors.textMuted },
  group: { paddingVertical: 4 },
  groupTitle: { paddingHorizontal: 14, paddingVertical: 4, fontSize: 12, fontWeight: "800", letterSpacing: 0.3, color: colors.textMuted },
  hit: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 7 },
  hitFirst: { backgroundColor: colors.sky50 },
  hitIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  hitMain: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.text },
  hitSub: { fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  tag: { maxWidth: 170, paddingHorizontal: 8, borderRadius: 999, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  tagText: { fontSize: 11.5, lineHeight: 20, fontWeight: "700", color: colors.body },
  all: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, marginTop: 4 },
  allText: { fontSize: 13.5, fontWeight: "800", color: colors.primaryInk },
  allHint: { fontSize: 11.5, color: colors.textFaint, marginTop: 2 },
});
