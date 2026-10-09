/**
 * ทีมช่าง (แอดมิน) — ดูว่าแต่ละทีมมีสาขา ช่าง หัวหน้าภาค ใบงานค้างเท่าไร และเปลี่ยนชื่อทีม
 *
 * เปลี่ยนชื่อที่นี่ = เปลี่ยนทุกที่ที่ผูกกับชื่อเดิมพร้อมกัน (สาขา ช่าง หัวหน้าภาค ใบงาน แผน)
 * แทนการแก้ไฟล์ทะเบียนสาขาแล้วอัปใหม่ ซึ่งเปลี่ยนแค่สาขา คนที่อยู่ทีมนั้นจะมองไม่เห็นงานทันที
 */
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import AppModal from "../components/AppModal";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { useCachedState } from "../utils/pageCache";
import { showAlert } from "../utils/alert";
import { colors, headingFont, radius, shadow, spacing } from "../theme";

interface Team {
  name: string;
  cmBranches: number;
  pmBranches: number;
  technicians: number;
  supervisors: number;
  openOrders: number;
  orphan: boolean;
}
interface Data {
  teams: Team[];
  renames: { from: string; to: string; at: string }[];
}

export default function ManageTeamsScreen() {
  const [data, setData, cached] = useCachedState<Data | null>("ManageTeams:data", null);
  const [loading, setLoading] = useState(!cached);
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<Team | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Data>("/teams");
      setData(res.data);
    } catch (e) {
      showAlert("โหลดข้อมูลไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !data) {
    return (
      <View style={styles.center}>
        <Spinner color={colors.primary} />
      </View>
    );
  }

  const q = query.trim().toLowerCase();
  const shown = q ? data.teams.filter((t) => t.name.toLowerCase().includes(q)) : data.teams;
  const orphans = data.teams.filter((t) => t.orphan).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.row}>
        <Text style={[styles.title, headingFont]}>ทีมช่าง</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{data.teams.length - orphans} ทีม</Text>
        </View>
      </View>
      <Text style={styles.muted}>
        ชื่อทีมมาจากคอลัมน์ "ทีมช่าง" ในทะเบียนสาขา · เปลี่ยนชื่อที่นี่แล้วสาขา ช่าง หัวหน้าภาค ใบงาน และแผน
        ย้ายตามให้ทั้งหมด · อัปไฟล์ที่ยังใช้ชื่อเดิม ระบบแปลงเป็นชื่อใหม่ให้เอง
      </Text>

      {orphans ? (
        <View style={styles.warnBox}>
          <Ionicons name="alert-circle" size={16} color={colors.warningInk} />
          <Text style={styles.warnText}>
            มี {orphans} ชื่อทีมที่ไม่มีสาขาไหนใช้ แต่ยังมีคนหรือใบงานผูกอยู่ (อยู่ท้ายรายการ) — มักเป็นชื่อที่สะกดผิด
            หรือเปลี่ยนชื่อในไฟล์ไปแล้ว เปลี่ยนชื่อให้ตรงกับทีมจริงเพื่อรวมเข้าด้วยกัน
          </Text>
        </View>
      ) : null}

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="ค้นหาชื่อทีม"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="ค้นหาทีม"
        />
      </View>

      {shown.length === 0 ? <EmptyState icon="people-outline" text="ไม่พบทีม" /> : null}
      <View style={styles.grid}>
        {shown.map((t) => (
          <View key={t.name} style={[styles.card, t.orphan && styles.cardOrphan]}>
            <View style={styles.row}>
              <Text style={styles.teamName}>{t.name}</Text>
              {t.orphan ? (
                <View style={[styles.tag, { backgroundColor: colors.warningSoft }]}>
                  <Text style={[styles.tagText, { color: colors.warningInk }]}>ไม่มีในทะเบียนสาขา</Text>
                </View>
              ) : null}
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => setRenaming(t)}
                accessibilityLabel={`เปลี่ยนชื่อทีม ${t.name}`}
              >
                <Ionicons name="create-outline" size={14} color={colors.primary} />
                <Text style={styles.linkText}>เปลี่ยนชื่อ</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.muted}>
              สาขา CM {t.cmBranches} · PM {t.pmBranches} · ช่าง {t.technicians} คน · หัวหน้าภาคดูแล {t.supervisors} คน ·
              ใบงานค้าง {t.openOrders}
            </Text>
          </View>
        ))}
      </View>

      {data.renames.length ? (
        <View style={{ gap: 4, marginTop: spacing.md }}>
          <Text style={styles.section}>ชื่อเดิมที่ระบบแปลงให้ตอนอัปไฟล์</Text>
          {data.renames.map((r) => (
            <Text key={r.from} style={styles.muted}>
              {r.from} → {r.to}
            </Text>
          ))}
        </View>
      ) : null}

      {renaming ? (
        <RenameModal
          team={renaming}
          names={data.teams.map((t) => t.name)}
          onClose={() => setRenaming(null)}
          onDone={() => {
            setRenaming(null);
            load();
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function RenameModal({
  team,
  names,
  onClose,
  onDone,
}: {
  team: Team;
  names: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [to, setTo] = useState(team.name);
  const [busy, setBusy] = useState(false);
  const clean = to.trim().replace(/\s+/g, " ");
  const merging = clean !== team.name && names.includes(clean);
  const ready = clean.length > 0 && clean !== team.name;

  async function save() {
    setBusy(true);
    try {
      const res = await api.post<{
        branches: number;
        technicians: number;
        supervisors: number;
        workOrders: number;
        plans: number;
        merged: boolean;
      }>("/teams/rename", { from: team.name, to: clean, merge: merging }, { loadingText: "กำลังเปลี่ยนชื่อทีม..." });
      const r = res.data;
      showAlert(
        r.merged ? `รวม ${team.name} เข้ากับ ${clean} แล้ว` : `เปลี่ยนชื่อเป็น ${clean} แล้ว`,
        `สาขา ${r.branches} · ช่าง ${r.technicians} · หัวหน้าภาค ${r.supervisors} · ใบงาน ${r.workOrders} · แผน ${r.plans}\n` +
          "อย่าลืมแก้ชื่อในไฟล์ทะเบียนสาขาต้นฉบับด้วย (ระหว่างนี้ระบบแปลงชื่อเดิมให้เอง)"
      );
      onDone();
    } catch (e) {
      showAlert("เปลี่ยนชื่อไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppModal
      visible
      onClose={onClose}
      busy={busy}
      title={`เปลี่ยนชื่อทีม ${team.name}`}
      footer={
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose} disabled={busy}>
            <Text style={styles.btnGhostText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, merging && { backgroundColor: colors.warning }, !ready && { opacity: 0.5 }]}
            onPress={save}
            disabled={!ready || busy}
          >
            <Text style={styles.btnText}>{merging ? `รวมเข้ากับ ${clean}` : "เปลี่ยนชื่อ"}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <Text style={styles.label}>ชื่อใหม่</Text>
      <TextInput
        style={styles.input}
        value={to}
        onChangeText={setTo}
        autoFocus
        accessibilityLabel="ชื่อทีมใหม่"
      />
      <Text style={styles.muted}>
        ย้ายตามชื่อใหม่ทั้งหมด: สาขา CM {team.cmBranches} · PM {team.pmBranches} · ช่าง {team.technicians} คน · หัวหน้าภาคที่ดูแล{" "}
        {team.supervisors} คน · ใบงานที่จ่ายให้ทีมนี้ และแผนรายวัน
      </Text>
      {merging ? (
        <View style={styles.warnBox}>
          <Ionicons name="git-merge-outline" size={16} color={colors.warningInk} />
          <Text style={styles.warnText}>
            มีทีม "{clean}" อยู่แล้ว — กดแล้วจะ<Text style={{ fontWeight: "700" }}>รวมสองทีมเป็นทีมเดียว</Text> แยกกลับไม่ได้
            วันที่ทั้งสองทีมมีแผนอยู่ คนในแผนจะถูกรวมเข้าแผนเดียวกัน
          </Text>
        </View>
      ) : null}
      <Text style={styles.muted}>
        ไฟล์ทะเบียนสาขา/ไฟล์เครื่องที่ยังเขียนชื่อเดิม อัปได้ตามปกติ ระบบแปลงเป็นชื่อใหม่ให้ แต่ควรแก้ต้นฉบับด้วย
      </Text>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48, maxWidth: 1100, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  title: { fontSize: 22, lineHeight: 32, fontWeight: "700", color: colors.text },
  section: { fontSize: 15, fontWeight: "700", color: colors.text },
  pill: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  pillText: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
  muted: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
  warnBox: { flexDirection: "row", gap: 8, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 10 },
  warnText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.warningInk },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22, color: colors.text, paddingVertical: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  card: {
    flexGrow: 1,
    flexBasis: 320,
    maxWidth: "100%",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
    ...shadow.card,
  },
  cardOrphan: { borderColor: colors.warningBorder },
  teamName: { fontSize: 16, fontWeight: "700", color: colors.text },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  tagText: { fontSize: 11.5, fontWeight: "700" },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  linkText: { fontSize: 13, fontWeight: "600", color: colors.primary },
  label: { fontSize: 13, fontWeight: "600", color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.card,
  },
  actions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end", flexWrap: "wrap" },
  btn: { borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: colors.primary },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnGhost: { backgroundColor: colors.sky50, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.navy, fontWeight: "700", fontSize: 14 },
});
