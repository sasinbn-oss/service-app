import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import Spinner from "./Spinner";
import AppModal from "./AppModal";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { showAlert } from "../utils/alert";
import { colors, radius, spacing } from "../theme";

/**
 * Super Admin "ดูในฐานะ" พนักงานคนหนึ่ง — เห็นแอปเหมือนที่คนนั้นเห็นจริง
 *
 * ใช้โทเคนของคนนั้นจริงจากเซิร์ฟเวอร์ (routes/auth.ts /view-as) ไม่ได้จำลองหน้าจอ
 * เพราะสิ่งที่แต่ละคนเห็นตัดสินที่เซิร์ฟเวอร์ทั้งหมด ดูได้อย่างเดียว — เซิร์ฟเวอร์ปฏิเสธทุกคำขอที่แก้ข้อมูล
 */

type Role = "EMPLOYEE" | "SUPERVISOR" | "ADMIN";
type Person = {
  id: number;
  employeeCode: string;
  name: string;
  role: string;
  region: string | null;
  team: string | null;
  supervisedTeams: string[];
};

const TABS: { role: Role; label: string; fg: string; bg: string }[] = [
  { role: "EMPLOYEE", label: "ช่าง", fg: colors.roleTech, bg: colors.roleTechSoft },
  { role: "SUPERVISOR", label: "หัวหน้าภาค", fg: colors.roleSupervisor, bg: colors.roleSupervisorSoft },
  { role: "ADMIN", label: "แอดมิน", fg: colors.roleAdmin, bg: colors.roleAdminSoft },
];

/** กลุ่มในรายชื่อ — ช่างตามทีม หัวหน้าภาคตามภาค เพราะคนที่มาดูมักนึกถึงพื้นที่ก่อนชื่อคน */
function groupOf(p: Person) {
  if (p.role === "EMPLOYEE") return p.team ? `ทีม${p.team}` : "ยังไม่มีทีม";
  if (p.role === "SUPERVISOR") return p.region ? `ภาค${p.region}` : "ดูแลเป็นรายทีม";
  return "แอดมิน";
}

function detailOf(p: Person) {
  if (p.role === "SUPERVISOR") {
    const n = p.supervisedTeams?.length ?? 0;
    return [p.region ? `ภาค${p.region}` : null, n ? `ดูแล ${n} ทีม` : null].filter(Boolean).join(" · ") || "ยังไม่มีพื้นที่";
  }
  if (p.role === "EMPLOYEE") return p.team ? `ทีม${p.team}` : "ยังไม่มีทีม";
  return p.role === "PARTS_ADMIN" ? "Admin Spare Part" : "แอดมิน";
}

/**
 * ปุ่มบนแถบบน — Super Admin และแอดมิน (ไม่ใช่ Admin Spare Part) ที่ยังเป็นตัวเองอยู่
 * แอดมินดูได้เฉพาะหัวหน้าภาคกับช่าง (เจ้าของงานเพิ่ม ต.ค. 69 · เซิร์ฟเวอร์กันซ้ำ — utils/viewAs.ts)
 */
export function ViewAsButton({ compact }: { compact?: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const allowed = !!user && (user.superAdmin || (user.role === "ADMIN" && !user.partsAdmin));
  if (!allowed || user?.viewAs) return null;
  return (
    <>
      <TouchableOpacity
        style={[styles.openBtn, compact && styles.openBtnCompact]}
        onPress={() => setOpen(true)}
        accessibilityLabel="ดูในฐานะผู้ใช้อื่น"
      >
        <Ionicons name="eye-outline" size={18} color={colors.navy} />
        {compact ? null : <Text style={styles.openText}>ดูในฐานะ…</Text>}
      </TouchableOpacity>
      {open ? <ViewAsPicker onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ViewAsPicker({ onClose }: { onClose: () => void }) {
  const { user, startViewAs } = useAuth();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [tab, setTab] = useState<Role>("EMPLOYEE");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Person[]>("/auth/users")
      // แอดมินทั่วไปดูได้เฉพาะหัวหน้าภาค/ช่าง — ไม่ขึ้นรายชื่อแอดมินให้เลือกแล้วโดนปฏิเสธ
      .then((r) =>
        setPeople(
          r.data.filter(
            (p) => p.role !== "SUPER_ADMIN" && p.id !== user?.id && (user?.superAdmin || p.role === "SUPERVISOR" || p.role === "EMPLOYEE")
          )
        )
      )
      .catch((e) => {
        showAlert("ผิดพลาด", apiErrorMessage(e));
        onClose();
      });
  }, []);

  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      (people ?? [])
        // แอดมินอะไหล่อยู่แท็บเดียวกับแอดมิน — หน้าจอที่เห็นเหมือนแอดมินทุกอย่าง
        .filter((p) => p.role === tab || (tab === "ADMIN" && p.role === "PARTS_ADMIN"))
        .filter(
          (p) =>
            !q ||
            [p.name, p.employeeCode, p.team, p.region, groupOf(p)].some((v) => v?.toLowerCase().includes(q))
        )
        .sort((a, b) => groupOf(a).localeCompare(groupOf(b), "th") || a.name.localeCompare(b.name, "th")),
    [people, tab, q]
  );
  const groups = [...new Set(rows.map(groupOf))];
  const tone = TABS.find((t) => t.role === tab)!;

  async function go() {
    if (!picked) return;
    setBusy(true);
    try {
      await startViewAs(picked.id);
      // ไม่ต้องปิดเอง — ทั้งแอปวาดใหม่เป็นของคนที่ถูกดู หน้าต่างนี้หายไปพร้อมกัน
    } catch (e) {
      setBusy(false);
      showAlert("ดูในฐานะไม่ได้", (e as Error).message);
    }
  }

  return (
    <AppModal
      visible
      onClose={onClose}
      busy={busy}
      title="ดูในฐานะผู้ใช้"
      subtitle="เลือกตำแหน่ง แล้วเลือกคนที่จะดู — ดูได้อย่างเดียว แก้ไขอะไรไม่ได้"
      footer={
        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancel} onPress={onClose} disabled={busy}>
            <Text style={styles.cancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.go, (!picked || busy) && { opacity: 0.5 }]}
            onPress={go}
            disabled={!picked || busy}
            accessibilityLabel="ดูในฐานะคนนี้"
          >
            {busy ? <Spinner color="#fff" size="small" /> : <Text style={styles.goText}>ดูในฐานะคนนี้</Text>}
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.tabs}>
        {TABS.filter((t) => user?.superAdmin || t.role !== "ADMIN").map((t) => {
          const on = t.role === tab;
          const n = (people ?? []).filter((p) => p.role === t.role || (t.role === "ADMIN" && p.role === "PARTS_ADMIN")).length;
          return (
            <TouchableOpacity
              key={t.role}
              style={[styles.tab, on && { backgroundColor: t.bg, borderColor: t.fg }]}
              onPress={() => {
                setTab(t.role);
                setPicked(null);
              }}
              accessibilityLabel={`ตำแหน่ง ${t.label}`}
            >
              <Text style={[styles.tabText, on && { color: t.fg, fontWeight: "800" }]}>{t.label}</Text>
              <View style={styles.tabCount}>
                <Text style={styles.tabCountText}>{n}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="ค้นชื่อ รหัสพนักงาน ทีม หรือภาค"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="ค้นหาผู้ใช้ที่จะดู"
        />
      </View>
      {!people ? (
        <Spinner color={colors.primary} style={{ marginVertical: spacing.xl }} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{q ? `ไม่พบ “${query.trim()}” ในตำแหน่ง${tone.label}` : `ยังไม่มี${tone.label}ในระบบ`}</Text>
      ) : (
        groups.map((g) => (
          <View key={g} style={{ gap: spacing.xs }}>
            <Text style={styles.group}>{g}</Text>
            {rows
              .filter((p) => groupOf(p) === g)
              .map((p) => {
                const on = picked?.id === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.person, on && styles.personOn]}
                    onPress={() => setPicked(p)}
                    accessibilityLabel={`เลือก ${p.name}`}
                  >
                    <View style={[styles.av, { backgroundColor: tone.fg }]}>
                      <Text style={styles.avText}>{p.name.trim().charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.personName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.personMeta} numberOfLines={1}>
                        {p.employeeCode} · {detailOf(p)}
                      </Text>
                    </View>
                    {on ? <Ionicons name="checkmark-circle" size={22} color={colors.warningInk} /> : null}
                  </TouchableOpacity>
                );
              })}
          </View>
        ))
      )}
    </AppModal>
  );
}

const ROLE_LABEL: Record<string, string> = { ADMIN: "แอดมิน", SUPERVISOR: "หัวหน้าภาค", EMPLOYEE: "ช่าง" };

/**
 * แถบส้มค้างบนสุดตลอดที่ดูในฐานะคนอื่น
 *
 * หน้าจอเหมือนของคนนั้นทุกอย่าง ถ้าไม่มีแถบนี้ Super Admin จะลืมว่ายังไม่ได้กลับเป็นตัวเอง
 * แล้วงงว่าทำไมเมนูหายและบันทึกอะไรไม่ได้
 */
export function ViewAsBanner() {
  const { user, stopViewAs } = useAuth();
  const { width } = useWindowDimensions();
  const [now, setNow] = useState(Date.now());
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!user?.viewAs) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [user?.viewAs]);
  if (!user?.viewAs) return null;
  const left = Math.max(0, Math.ceil((new Date(user.viewAs.expiresAt).getTime() - now) / 60000));
  const narrow = width < 640;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Ionicons name="eye" size={18} color="#fff" />
      <Text style={styles.bannerText} numberOfLines={narrow ? 2 : 1}>
        กำลังดูในฐานะ <Text style={{ fontWeight: "800" }}>{user.name}</Text>
        {` (${user.employeeCode} · ${user.partsAdmin ? "Admin Spare Part" : ROLE_LABEL[user.role] ?? user.role})`}
        {narrow ? "" : ` — ดูได้อย่างเดียว · เหลือ ${left} นาที`}
      </Text>
      <TouchableOpacity
        style={styles.bannerBtn}
        onPress={async () => {
          setLeaving(true);
          await stopViewAs();
        }}
        disabled={leaving}
        accessibilityLabel="กลับเป็นตัวเอง"
      >
        {leaving ? <Spinner size="small" color={colors.warningInk} /> : <Text style={styles.bannerBtnText}>กลับเป็นตัวเอง</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.sky50,
  },
  openBtnCompact: { width: 40, paddingHorizontal: 0, justifyContent: "center" },
  openText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.navy },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: colors.card,
  },
  tabText: { fontSize: 14, lineHeight: 20, color: colors.textMuted, fontWeight: "600" },
  tabCount: { backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 7 },
  tabCountText: { fontSize: 11, lineHeight: 18, fontWeight: "800", color: colors.textMuted },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22, color: colors.text, paddingVertical: 9 },
  empty: { textAlign: "center", color: colors.textMuted, paddingVertical: spacing.xl },
  group: { fontSize: 12, lineHeight: 18, fontWeight: "800", color: colors.textMuted, marginTop: spacing.md },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: colors.card,
  },
  personOn: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  av: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  avText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  personName: { fontSize: 14, lineHeight: 21, fontWeight: "700", color: colors.text },
  personMeta: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  actions: { flex: 1, flexDirection: "row", gap: spacing.sm },
  cancel: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.sky50,
  },
  cancelText: { fontSize: 15, lineHeight: 22, color: colors.primaryInk, fontWeight: "700" },
  go: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.navyFill,
  },
  goText: { color: "#fff", fontSize: 14, lineHeight: 22, fontWeight: "700" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#B45309",
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  bannerText: { flex: 1, minWidth: 0, color: "#fff", fontSize: 13, lineHeight: 20 },
  bannerBtn: { backgroundColor: "#fff", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, minWidth: 110, alignItems: "center" },
  bannerBtnText: { color: colors.warningInk, fontWeight: "800", fontSize: 13, lineHeight: 20 },
});
