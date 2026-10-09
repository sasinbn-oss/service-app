/**
 * ทีมช่าง (แอดมิน) — ดูว่าแต่ละทีมมีสาขา ช่าง หัวหน้าภาค ใบงานค้างเท่าไร และเปลี่ยนชื่อทีม
 *
 * เปลี่ยนชื่อที่นี่ = เปลี่ยนทุกที่ที่ผูกกับชื่อเดิมพร้อมกัน (สาขา ช่าง หัวหน้าภาค ใบงาน แผน)
 * แทนการแก้ไฟล์ทะเบียนสาขาแล้วอัปใหม่ ซึ่งเปลี่ยนแค่สาขา คนที่อยู่ทีมนั้นจะมองไม่เห็นงานทันที
 *
 * ย้ายสาขาเข้าทีม = ตั้งทีมใหม่ตามบันทึกแบ่งทีมได้เลย ไม่ต้องรอแก้ไฟล์ทะเบียน (รายชื่อทีมมาจากสาขา
 * ทีมที่ยังไม่มีสาขาจึงเลือกให้ช่างไม่ได้) อัปไฟล์ทีหลังสาขาก็ไม่เด้งกลับ — ดู BranchTeamMove
 */
import React, { useCallback, useEffect, useState } from "react";
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
interface Move {
  id: number;
  code: string;
  name: string;
  field: "zone" | "pmTeam";
  from: string | null;
  to: string;
  at: string;
}
interface Group {
  id: number;
  name: string;
  covers: string[];
  allTeams: boolean;
  technicians: number;
  supervisors: number;
}
interface Data {
  teams: Team[];
  groups?: Group[];
  renames: { from: string; to: string; at: string }[];
  moves: Move[];
}
interface BranchRow {
  id: number;
  code: string;
  name: string;
  address: string | null;
  region: string | null;
  zone: string | null;
  pmTeam: string | null;
  moved: string[];
}
const FIELD_LABEL = { zone: "CM", pmTeam: "PM" } as const;

export default function ManageTeamsScreen() {
  const [data, setData, cached] = useCachedState<Data | null>("ManageTeams:data", null);
  const [loading, setLoading] = useState(!cached);
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<Team | null>(null);
  const [moving, setMoving] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | "new" | null>(null);

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
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.btn} onPress={() => setMoving(true)} accessibilityLabel="ย้ายสาขาเข้าทีม">
          <View style={styles.row}>
            <Ionicons name="swap-horizontal" size={16} color="#fff" />
            <Text style={styles.btnText}>ย้ายสาขาเข้าทีม</Text>
          </View>
        </TouchableOpacity>
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

      <View style={[styles.row, { marginTop: spacing.md }]}>
        <Text style={styles.section}>ทีมรวม</Text>
        <Text style={[styles.muted, { flex: 1, minWidth: 200 }]}>
          พื้นที่ที่ครอบคลุมหลายทีม (Senior · ทีมเสริม · QC) — ช่างที่สังกัดทีมรวมเห็นใบงานของทุกทีมที่ครอบคลุม
        </Text>
        <TouchableOpacity style={styles.linkBtn} onPress={() => setEditingGroup("new")} accessibilityLabel="เพิ่มทีมรวม">
          <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
          <Text style={styles.linkText}>เพิ่มทีมรวม</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.grid}>
        {(data.groups ?? []).map((g) => (
          <View key={g.id} style={[styles.card, styles.groupCard]}>
            <View style={styles.row}>
              <Ionicons name="git-network-outline" size={16} color={colors.primary} />
              <Text style={[styles.teamName, { flex: 1 }]}>{g.name}</Text>
              <TouchableOpacity style={styles.linkBtn} onPress={() => setEditingGroup(g)} accessibilityLabel={`แก้ไขทีมรวม ${g.name}`}>
                <Ionicons name="create-outline" size={14} color={colors.primary} />
                <Text style={styles.linkText}>แก้ไข</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.muted}>เห็นงานของ: {g.allTeams ? "ทุกทีม" : g.covers.join(" · ") || "—"}</Text>
            <Text style={styles.muted}>
              ช่าง {g.technicians} คน · หัวหน้าภาคดูแล {g.supervisors} คน
            </Text>
          </View>
        ))}
      </View>

      {data.moves?.length ? <MovedList moves={data.moves} onChanged={load} /> : null}

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

      {moving ? (
        <MoveModal
          names={data.teams.filter((t) => !t.orphan).map((t) => t.name)}
          onClose={() => setMoving(false)}
          onDone={() => {
            setMoving(false);
            load();
          }}
        />
      ) : null}

      {editingGroup ? (
        <GroupModal
          group={editingGroup === "new" ? null : editingGroup}
          teams={data.teams.filter((t) => !t.orphan).map((t) => t.name)}
          onClose={() => setEditingGroup(null)}
          onDone={() => {
            setEditingGroup(null);
            load();
          }}
        />
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

/** สาขาที่ย้ายทีมในแอป — ไฟล์ทะเบียนที่อัปภายหลังไม่ดึงกลับ · คืนตามไฟล์ได้ทีละสาขา */
function MovedList({ moves, onChanged }: { moves: Move[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const byTeam = new Map<string, Move[]>();
  for (const m of moves) byTeam.set(m.to, [...(byTeam.get(m.to) ?? []), m]);

  function revert(m: Move) {
    showAlert(`คืน ${m.code} ตามไฟล์ทะเบียน?`, `ทีม ${FIELD_LABEL[m.field]} จะกลับเป็น ${m.from ?? "(ว่าง)"} และอัปไฟล์ครั้งต่อไปจะใช้ค่าในไฟล์ตามเดิม`, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "คืนตามไฟล์",
        style: "destructive",
        onPress: async () => {
          try {
            await api.post(`/teams/moves/${m.id}/revert`, {}, { loadingText: "กำลังคืนตามไฟล์..." });
            onChanged();
          } catch (e) {
            showAlert("คืนไม่สำเร็จ", apiErrorMessage(e));
          }
        },
      },
    ]);
  }

  return (
    <View style={[styles.card, { flexBasis: "auto" }]}>
      <TouchableOpacity style={styles.row} onPress={() => setOpen((v) => !v)} accessibilityLabel="สาขาที่ย้ายทีมในแอป">
        <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
        <Text style={styles.section}>สาขาที่ย้ายทีมในแอป</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{new Set(moves.map((m) => m.code)).size} สาขา</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
      </TouchableOpacity>
      <Text style={styles.muted}>อัปไฟล์ทะเบียนสาขาที่ยังเขียนทีมเดิม ระบบคงทีมที่ย้ายไว้ให้ — แก้ไฟล์ต้นฉบับด้วยเมื่อสะดวก</Text>
      {open
        ? [...byTeam.entries()].map(([team, list]) => (
            <View key={team} style={{ gap: 4, marginTop: 6 }}>
              <Text style={styles.label}>
                {team} · {list.length} รายการ
              </Text>
              {list.map((m) => (
                <View key={m.id} style={styles.moveRow}>
                  <Text style={[styles.muted, { flex: 1 }]}>
                    {m.code} {m.name} · {FIELD_LABEL[m.field]} {m.from ?? "(ว่าง)"} → {m.to}
                  </Text>
                  <TouchableOpacity onPress={() => revert(m)} accessibilityLabel={`คืนตามไฟล์ ${m.code} ${FIELD_LABEL[m.field]}`}>
                    <Text style={styles.linkText}>คืนตามไฟล์</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))
        : null}
    </View>
  );
}

function MoveModal({ names, onClose, onDone }: { names: string[]; onClose: () => void; onDone: () => void }) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [more, setMore] = useState(false);
  const [searching, setSearching] = useState(false);
  // เก็บสาขาที่เลือกไว้แม้ค้นคำใหม่ — ค้น "นครศรี" แล้วค้น "ทุ่งสง" เลือกรวมกันได้
  const [picked, setPicked] = useState<Map<number, BranchRow>>(new Map());
  const [team, setTeam] = useState("");
  const [fields, setFields] = useState<("zone" | "pmTeam")[]>(["zone", "pmTeam"]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setRows([]);
      setMore(false);
      return;
    }
    let live = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.get<{ branches: BranchRow[]; more: boolean }>("/teams/branches", { params: { search: q } });
        if (!live) return;
        setRows(res.data.branches);
        setMore(res.data.more);
      } catch (e) {
        if (live) showAlert("ค้นหาสาขาไม่สำเร็จ", apiErrorMessage(e));
      } finally {
        if (live) setSearching(false);
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [search]);

  const clean = team.trim().replace(/\s+/g, " ");
  const isNew = clean.length > 0 && !names.includes(clean);
  const allShown = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const suggestions = clean ? names.filter((n) => n.includes(clean) && n !== clean).slice(0, 8) : [];
  const ready = picked.size > 0 && clean.length > 0 && fields.length > 0;

  function toggle(r: BranchRow) {
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(r.id)) next.delete(r.id);
      else next.set(r.id, r);
      return next;
    });
  }
  function toggleAll() {
    setPicked((m) => {
      const next = new Map(m);
      for (const r of rows) {
        if (allShown) next.delete(r.id);
        else next.set(r.id, r);
      }
      return next;
    });
  }
  function toggleField(f: "zone" | "pmTeam") {
    setFields((v) => (v.includes(f) ? v.filter((x) => x !== f) : [...v, f]));
  }

  async function save() {
    setBusy(true);
    try {
      const res = await api.post<{ team: string; moved: number; branches: number; isNew: boolean; technicians: number; supervisors: number }>(
        "/teams/move-branches",
        { branchIds: [...picked.keys()], team: clean, fields },
        { loadingText: "กำลังย้ายสาขา..." }
      );
      const r = res.data;
      const todo = [
        r.technicians === 0 ? `• ยังไม่มีช่างในทีม ${r.team} — ไปที่ สิทธิ์ผู้ใช้ แล้วเลือก "${r.team}" ที่ช่องทีมช่างที่สังกัดของช่าง` : "",
        r.supervisors === 0 ? `• ยังไม่มีหัวหน้าภาคดูแล ${r.team} — ติ๊ก "${r.team}" ที่ช่องทีมช่างที่ดูแลของหัวหน้าภาค` : "",
      ].filter(Boolean);
      showAlert(
        `ย้าย ${r.branches} สาขาไปทีม ${r.team} แล้ว`,
        [
          `ใบงานใหม่ของสาขาเหล่านี้จะเสนอทีม ${r.team} · อัปไฟล์ทะเบียนทีหลังสาขาไม่เด้งกลับ`,
          ...(todo.length ? ["", "ต้องทำต่อ:", ...todo] : []),
        ].join("\n")
      );
      onDone();
    } catch (e) {
      showAlert("ย้ายไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppModal
      visible
      onClose={onClose}
      busy={busy}
      width={640}
      title="ย้ายสาขาเข้าทีม"
      footer={
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose} disabled={busy}>
            <Text style={styles.btnGhostText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, !ready && { opacity: 0.5 }]}
            onPress={save}
            disabled={!ready || busy}
            accessibilityLabel="ยืนยันย้ายสาขา"
          >
            <Text style={styles.btnText}>{picked.size ? `ย้าย ${picked.size} สาขา${clean ? `ไป ${clean}` : ""}` : "เลือกสาขาก่อน"}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <Text style={styles.label}>1. ค้นหาและเลือกสาขา</Text>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="ชื่อสาขา รหัส ที่อยู่ ภาค หรือทีมเดิม เช่น นครศรี"
          placeholderTextColor={colors.textFaint}
          autoFocus
          accessibilityLabel="ค้นหาสาขา"
        />
        {searching ? <Spinner color={colors.primary} size="small" /> : null}
      </View>
      {rows.length ? (
        <ScrollView style={styles.list} nestedScrollEnabled>
          <TouchableOpacity style={styles.branchRow} onPress={toggleAll} accessibilityLabel="เลือกทั้งหมดที่ค้นเจอ">
            <Ionicons name={allShown ? "checkbox" : "square-outline"} size={20} color={colors.primary} />
            <Text style={[styles.label, { flex: 1 }]}>
              เลือกทั้งหมดที่ค้นเจอ ({rows.length}
              {more ? "+ — พิมพ์ให้เจาะจงขึ้น" : ""})
            </Text>
          </TouchableOpacity>
          {rows.map((r) => {
            const on = picked.has(r.id);
            return (
              <TouchableOpacity
                key={r.id}
                style={[styles.branchRow, on && styles.branchRowOn]}
                onPress={() => toggle(r)}
                accessibilityLabel={`เลือกสาขา ${r.code}`}
              >
                <Ionicons name={on ? "checkbox" : "square-outline"} size={20} color={on ? colors.primary : colors.textFaint} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.branchName}>
                    {r.code} · {r.name}
                  </Text>
                  <Text style={styles.muted}>
                    CM {r.zone ?? "—"} · PM {r.pmTeam ?? "—"}
                    {r.region ? ` · ภาค${r.region}` : ""}
                    {r.moved.length ? " · ย้ายในแอปแล้ว" : ""}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : search.trim().length >= 2 && !searching ? (
        <Text style={styles.muted}>ไม่พบสาขา</Text>
      ) : null}
      <Text style={styles.muted}>เลือกแล้ว {picked.size} สาขา · ค้นคำใหม่ได้ สาขาที่เลือกไว้ไม่หาย</Text>

      <Text style={styles.label}>2. ย้ายไปทีม</Text>
      <TextInput
        style={styles.input}
        value={team}
        onChangeText={setTeam}
        placeholder="พิมพ์ชื่อทีม หรือชื่อทีมใหม่ เช่น นครศรีธรรมราช"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="ชื่อทีมปลายทาง"
      />
      {suggestions.length ? (
        <View style={styles.row}>
          {suggestions.map((n) => (
            <TouchableOpacity key={n} style={styles.chip} onPress={() => setTeam(n)} accessibilityLabel={`ใช้ทีม ${n}`}>
              <Text style={styles.chipText}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {isNew ? (
        <View style={styles.infoBox}>
          <Ionicons name="add-circle-outline" size={16} color={colors.primaryInk} />
          <Text style={styles.infoText}>
            ทีมใหม่ "{clean}" — ย้ายเสร็จแล้วชื่อนี้จะขึ้นให้เลือกที่การ์ดช่างและหัวหน้าภาคในหน้าสิทธิ์ผู้ใช้
          </Text>
        </View>
      ) : null}

      <Text style={styles.label}>3. ย้ายงานไหน</Text>
      <View style={styles.row}>
        {(["zone", "pmTeam"] as const).map((f) => {
          const on = fields.includes(f);
          return (
            <TouchableOpacity
              key={f}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => toggleField(f)}
              accessibilityLabel={`ย้ายทีม ${FIELD_LABEL[f]}`}
            >
              <Text style={[styles.chipText, on && { color: "#fff" }]}>
                {on ? "✓ " : ""}ทีม {FIELD_LABEL[f]} ({f === "zone" ? "งานซ่อม" : "งานบำรุงรักษา"})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.muted}>ใบงานที่จ่ายไปแล้วยังอยู่กับทีมเดิม — ย้ายเฉพาะทีมที่ดูแลสาขา</Text>
    </AppModal>
  );
}

function GroupModal({
  group,
  teams,
  onClose,
  onDone,
}: {
  group: Group | null;
  teams: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [all, setAll] = useState(group?.allTeams ?? false);
  const [picked, setPicked] = useState<string[]>(group?.covers ?? []);
  const [busy, setBusy] = useState(false);
  const clean = name.trim().replace(/\s+/g, " ");
  // ทีมที่ทีมรวมครอบคลุมแต่ไม่มีในทะเบียนแล้ว (เปลี่ยนชื่อ/ลบในไฟล์) ยังแสดงให้เอาออกได้
  const options = [...new Set([...teams, ...picked])];
  const ready = clean.length > 0 && (all || picked.length > 0);

  function toggle(t: string) {
    setPicked((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]));
  }

  async function save() {
    setBusy(true);
    try {
      const body = { name: clean, covers: picked, allTeams: all };
      if (group) await api.put(`/teams/groups/${group.id}`, body, { loadingText: "กำลังบันทึก..." });
      else await api.post("/teams/groups", body, { loadingText: "กำลังบันทึก..." });
      onDone();
    } catch (e) {
      showAlert("บันทึกไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!group) return;
    showAlert(`ลบทีมรวม ${group.name}?`, "ลบได้เมื่อไม่มีช่างหรือหัวหน้าภาคผูกอยู่แล้วเท่านั้น", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/teams/groups/${group.id}`);
            onDone();
          } catch (e) {
            showAlert("ลบไม่สำเร็จ", apiErrorMessage(e));
          }
        },
      },
    ]);
  }

  return (
    <AppModal
      visible
      onClose={onClose}
      busy={busy}
      title={group ? `แก้ไขทีมรวม` : "เพิ่มทีมรวม"}
      footer={
        <View style={styles.actions}>
          {group ? (
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={remove} disabled={busy}>
              <Text style={[styles.btnGhostText, { color: colors.danger }]}>ลบทีมรวม</Text>
            </TouchableOpacity>
          ) : null}
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose} disabled={busy}>
            <Text style={styles.btnGhostText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, !ready && { opacity: 0.5 }]}
            onPress={save}
            disabled={!ready || busy}
            accessibilityLabel="บันทึกทีมรวม"
          >
            <Text style={styles.btnText}>บันทึก</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <Text style={styles.label}>ชื่อทีมรวม (ใช้ชื่อตามบันทึกแบ่งทีม)</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="เช่น Senior บางน้ำจืด หลักสี่ ลาดพร้าว"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="ชื่อทีมรวม"
      />
      {group && clean !== group.name ? (
        <Text style={styles.muted}>เปลี่ยนชื่อแล้ว ช่าง หัวหน้าภาค และแผนที่ผูกกับชื่อเดิมย้ายตามให้</Text>
      ) : null}
      <Text style={styles.label}>เห็นใบงานของทีมไหน</Text>
      <TouchableOpacity
        style={[styles.chip, all && styles.chipOn, { alignSelf: "flex-start" }]}
        onPress={() => setAll((v) => !v)}
        accessibilityLabel="ครอบคลุมทุกทีม"
      >
        <Text style={[styles.chipText, all && { color: "#fff" }]}>{all ? "✓ " : ""}ทุกทีม (งานตรวจคุณภาพ / PM ที่ไปได้ทุกที่)</Text>
      </TouchableOpacity>
      {!all ? (
        <View style={styles.row}>
          {options.map((t) => {
            const on = picked.includes(t);
            return (
              <TouchableOpacity key={t} style={[styles.chip, on && styles.chipOn]} onPress={() => toggle(t)} accessibilityLabel={`ครอบคลุม ${t}`}>
                <Text style={[styles.chipText, on && { color: "#fff" }]}>{t}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      <Text style={styles.muted}>ใบงานยังจ่ายให้ทีมช่างตามสาขาเหมือนเดิม — ทีมรวมแค่ทำให้ช่างกลุ่มนี้เห็นและทำงานของทีมเหล่านั้นได้</Text>
    </AppModal>
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
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, maxHeight: 300 },
  branchRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  branchRowOn: { backgroundColor: colors.primarySoft },
  branchName: { fontSize: 14, fontWeight: "600", color: colors.text },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.text },
  infoBox: { flexDirection: "row", gap: 8, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 10 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.primaryInk },
  moveRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  groupCard: { borderStyle: "dashed", borderColor: colors.primary },
});
