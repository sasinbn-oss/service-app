/**
 * ตั้งสิทธิ์และภาคของผู้ใช้
 *
 * จำเป็นเพราะสายงานใบงานพึ่งบทบาท ถ้าตั้งหัวหน้าภาคไม่ได้ ใบงานจะค้างอยู่ขั้น
 * "รอหัวหน้าภาคระบุอะไหล่" ตลอดไปโดยไม่มีใครมีสิทธิ์ทำต่อ
 */
import { useDocked } from "../components/SideMenu";
import React, { useCallback, useMemo, useState } from "react";
import { useCachedState } from "../utils/pageCache";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import AppModal from "../components/AppModal";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useRefreshHandler } from "../components/RefreshButton";
import { useAuth } from "../context/AuthContext";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { openUrl } from "../utils/share";
import { showAlert } from "../utils/alert";
import { Role } from "../types";
import FieldHint, { invalidInput } from "../components/FieldHint";
import RosterImportModal from "../components/RosterImportModal";
import AreaTeamImportModal from "../components/AreaTeamImportModal";
import Dropdown from "../components/Dropdown";
import { canPickFile } from "../utils/filePicker";
import { regionsOf } from "../utils/regions";
import { colors, radius, shadow, spacing, headingFont } from "../theme";

interface ManagedUser {
  id: number;
  employeeCode: string;
  name: string;
  phone: string | null;
  role: Role;
  /** ภาคแรก — อ่านผ่าน regionsOf() เสมอ เซิร์ฟเวอร์รุ่นเก่าส่งแค่ช่องนี้ */
  region: string | null;
  /** ทุกภาคที่หัวหน้าภาคดูแล (หลายภาคได้ สิทธิ์เต็มทุกภาค) */
  regions?: string[];
  /** ทีมช่างที่สังกัด — ตัวบอกว่าช่างคนนี้เห็นงานของทีมไหน */
  team: string | null;
  /** ทีมช่างที่หัวหน้าภาคดูแล — หลายทีมได้ ใช้ร่วมกับภาคที่เลือก */
  supervisedTeams: string[];
  /** สาขาที่ Maid (COCO) ประจำ — Maid เห็นเฉพาะสาขาเหล่านี้ */
  maidBranches?: CocoBranch[];
  mustChangePassword: boolean;
}

interface CocoBranch {
  code: string;
  name: string;
}

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: "EMPLOYEE", label: "ช่าง", hint: "รับงานที่ถูกจ่ายให้ บันทึกผลตรวจหน้างาน และปิดงาน" },
  { value: "SUPERVISOR", label: "หัวหน้าภาค", hint: "ระบุอะไหล่และจ่ายงานให้ช่าง ในภาค (หลายภาคได้) หรือทีมที่ดูแล" },
  { value: "ADMIN", label: "แอดมิน", hint: "เปิดใบงาน เช็คคลัง และทำแทนได้ทุกขั้น" },
  {
    value: "PARTS_ADMIN",
    label: "Admin Spare Part",
    hint: "คนเช็คประกัน ทำได้ทุกอย่างเท่าแอดมิน · ตั้งได้เฉพาะ Super Admin",
  },
  // Area Team (เจ้าของงานเพิ่ม ต.ค. 69) — สาขาที่ Supervisor (COCO) ดูแลมาจากไฟล์ Area Team ปุ่ม "นำเข้า Area Team"
  { value: "AREA", label: "Area", hint: "ทีมสาขา COCO: แจ้งและเปิดใบงาน · เห็นสาขา COCO ทั้งหมด · ทำขั้นตอนไม่ได้" },
  {
    value: "COCO_SUPERVISOR",
    label: "Supervisor (COCO)",
    hint: "ทีมสาขา COCO: แจ้งและเปิดใบงาน · เห็นเฉพาะสาขาที่ดูแล (ผูกจากไฟล์ Area Team)",
  },
  // สิทธิ์เท่า Supervisor (COCO) แต่ผูกสาขาเป็นรายคน — Maid อยู่ประจำร้าน ไม่ได้ดูแลทั้งกลุ่มสาขา
  {
    value: "COCO_MAID",
    label: "Maid (COCO)",
    hint: "ทีมสาขา COCO: แจ้งและเปิดใบงาน · เห็นเฉพาะสาขาที่ประจำ (เลือกด้านล่าง หรือนำเข้าไฟล์รายชื่อ Maid)",
  },
  {
    value: "SUPER_ADMIN",
    label: "Super Admin",
    hint: "ทำได้ทุกอย่างเท่าแอดมิน และเป็นคนเดียวที่ตั้ง ถอด หรือรีเซ็ตรหัสแอดมินได้",
  },
];

/**
 * ตัวเลือก Super Admin ขึ้นเฉพาะกับ Super Admin (หรือบัญชีที่เป็นอยู่แล้ว จะได้เห็นว่าเป็นอะไร)
 * แอดมินทั่วไปกดไปก็ถูกเซิร์ฟเวอร์ปฏิเสธอยู่ดี ไม่ต้องให้เห็นปุ่มที่กดไม่ได้
 */
function roleOptions(meSuper: boolean, current?: Role) {
  return ROLE_OPTIONS.filter((r) => r.value !== "SUPER_ADMIN" || meSuper || current === "SUPER_ADMIN");
}

/**
 * ข้อความที่ค้นหาได้ของผู้ใช้หนึ่งคน — รวมชื่อบทบาทกับทีม/ภาคด้วย
 * แอดมินมักหาแบบ "ช่างทีมกระบี่" หรือ "หัวหน้าภาคใต้" ไม่ได้จำชื่อคนได้ทุกคน
 */
function searchText(u: ManagedUser) {
  const role = ROLE_OPTIONS.find((r) => r.value === u.role)?.label ?? "";
  const maid = (u.maidBranches ?? []).flatMap((b) => [b.code, b.name]);
  return [u.name, u.employeeCode, u.phone, u.team, ...regionsOf(u), ...(u.supervisedTeams ?? []), ...maid, role]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * ยังไม่มีพื้นที่รับผิดชอบ? — กฎเดียวกับ backend/src/utils/coverage.ts (แก้ที่หนึ่งต้องแก้อีกที่)
 * ชื่อทีม/ภาคที่ไม่มีในทะเบียนสาขานับด้วย เพราะไม่มีใบงานผูกกับชื่อนั้น ผลเท่ากับไม่มีทีม
 */
interface Group {
  id: number;
  name: string;
  covers: string[];
  allTeams: boolean;
}

function groupScope(g: Group) {
  return g.allTeams ? "ทุกทีม" : g.covers.join(" · ");
}

function coverageGap(u: ManagedUser, teams: Set<string>, regions: Set<string>): string | null {
  if (u.role === "EMPLOYEE") {
    if (!u.team) return "ยังไม่ได้จัดทีม";
    return teams.has(u.team) ? null : `ทีม "${u.team}" ไม่มีในทะเบียนสาขา`;
  }
  if (u.role === "SUPERVISOR") {
    const st = u.supervisedTeams ?? [];
    const rs = regionsOf(u);
    // หลายภาค: มีภาคเดียวที่ยังมีในทะเบียนก็ยังเห็นงานอยู่ — ไม่นับเป็นคนไม่มีพื้นที่
    if (rs.some((r) => regions.has(r)) || st.some((t) => teams.has(t))) return null;
    if (!rs.length && st.length === 0) return "ยังไม่ได้ตั้งภาคหรือทีมที่ดูแล";
    return "ภาค/ทีมที่ตั้งไว้ไม่มีในทะเบียนสาขา";
  }
  return null;
}

export default function ManageUsersScreen() {
  const { docked } = useDocked();
  const { user: me } = useAuth();
  const [users, setUsers, cached] = useCachedState<ManagedUser[]>("ManageUsers:users", []);
  const [regions, setRegions] = useCachedState<string[]>("ManageUsers:regions", []);
  const [teams, setTeams] = useCachedState<string[]>("ManageUsers:teams", []);
  const [groups, setGroups] = useCachedState<Group[]>("ManageUsers:groups", []);
  const [cocoBranches, setCocoBranches] = useCachedState<CocoBranch[]>("ManageUsers:coco", []);
  const [loading, setLoading] = useState(!cached);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<ManagedUser | null>(null);
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [importingArea, setImportingArea] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [gapsOnly, setGapsOnly] = useState(false);
  // ทุกคำที่พิมพ์ต้องเจอ (ไม่จำเป็นต้องติดกัน) — "ช่าง กระบี่" ได้ช่างทีมกระบี่
  // ทีม/ภาคยังไม่โหลด = ยังตัดสินไม่ได้ ไม่ขึ้นแถบเตือนผิด ๆ ว่าทุกคนไม่มีทีม
  const gaps = useMemo(() => {
    const m = new Map<number, string>();
    if (!teams.length) return m;
    // ทีมรวมนับเป็นทีมที่มีจริง — ช่างในทีมรวมเห็นงานของทีมที่ครอบคลุม
    const ts = new Set([...teams, ...groups.map((g) => g.name)]);
    const rs = new Set(regions);
    for (const u of users) {
      const g = coverageGap(u, ts, rs);
      if (g) m.set(u.id, g);
    }
    return m;
  }, [users, teams, regions, groups]);
  // ใครถือภาคไหนบ้าง — ใช้บอกตอนเลือกภาคว่ามีหัวหน้าภาคคนอื่นดูแลภาคนั้นอยู่ด้วย
  const holders = useMemo(() => {
    const m: Holders = new Map();
    for (const u of users) {
      if (u.role !== "SUPERVISOR") continue;
      for (const r of regionsOf(u)) m.set(r, [...(m.get(r) ?? []), { id: u.id, name: u.name }]);
    }
    return m;
  }, [users]);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const base = gapsOnly ? users.filter((u) => gaps.has(u.id)) : users;
    if (!words.length) return base;
    return base.filter((u) => {
      const t = searchText(u);
      return words.every((w) => t.includes(w));
    });
  }, [users, query, gapsOnly, gaps]);

  async function downloadGaps() {
    try {
      const res = await api.get<{ path: string; count: number }>("/auth/users/unassigned-report", {
        loadingText: "กำลังทำรายงาน...",
      });
      if (!res.data.count) return showAlert("ครบทุกคนแล้ว", "ช่างและหัวหน้าภาคทุกคนมีพื้นที่รับผิดชอบแล้ว");
      await openUrl(resolveImageUrl(res.data.path)!);
    } catch (e) {
      showAlert("ออกรายงานไม่สำเร็จ", apiErrorMessage(e));
    }
  }

  const load = useCallback(async () => {
    try {
      const [list, regionList, teamList, groupList, cocoList] = await Promise.all([
        api.get<ManagedUser[]>("/auth/users"),
        api.get<{ name: string }[]>("/branches/regions"),
        api.get<{ name: string }[]>("/branches/teams"),
        api.get<Group[]>("/teams/groups"),
        api.get<CocoBranch[]>("/auth/users/coco-branches"),
      ]);
      setGroups(groupList.data);
      setCocoBranches(cocoList.data);
      setUsers(list.data);
      // ภาคมาจากทะเบียนสาขาทั้งหมด ไม่ใช่เฉพาะภาคที่มีเคสค้าง — ภาคที่ทุกอย่างปกติ
      // ก็ยังต้องมีหัวหน้าภาคดูแล
      setRegions(regionList.data.map((r) => r.name).filter(Boolean));
      setTeams(teamList.data.map((t) => t.name).filter(Boolean));
      setError(null);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useRefreshHandler(load);

  async function update(
    id: number,
    patch: { role?: Role; regions?: string[]; team?: string | null; supervisedTeams?: string[]; maidBranches?: string[] }
  ) {
    setSavingId(id);
    try {
      const res = await api.patch<ManagedUser>(`/auth/users/${id}`, patch);
      setUsers((list) => list.map((u) => (u.id === id ? res.data : u)));
    } catch (e) {
      showAlert("บันทึกไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setSavingId(null);
    }
  }

  function remove(u: ManagedUser) {
    showAlert(
      `ลบผู้ใช้ ${u.name}?`,
      `${u.employeeCode} จะเข้าระบบไม่ได้อีกและหายจากรายชื่อ\n` +
        "ถ้าเคยมีประวัติในระบบ (ใบงาน ใช้รถ บันทึกงาน) ชื่อยังขึ้นในประวัติเดิม — ลบแล้วกู้คืนไม่ได้",
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ลบผู้ใช้",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/auth/users/${u.id}`, { loadingText: "กำลังลบผู้ใช้..." });
              setUsers((list) => list.filter((x) => x.id !== u.id));
              showAlert(`ลบ ${u.name} แล้ว`);
            } catch (e) {
              showAlert("ลบไม่สำเร็จ", apiErrorMessage(e));
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <Spinner color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* หัวหน้าแบบ OTTERI: ชื่อหน้า ป้ายจำนวน และปุ่มเพิ่มอยู่บรรทัดเดียวกัน */}
      <View style={styles.pageHead}>
        {/* จอแคบ: ชื่อหน้าอยู่บนแถบหัวแล้ว ไม่พิมพ์ซ้ำตัวใหญ่ (เจ้าของงานขอ ต.ค. 69) */}
        {docked ? <Text style={[styles.pageTitle, headingFont]}>สิทธิ์ผู้ใช้</Text> : null}
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>
            {shown.length === users.length ? `${users.length} คน` : `${shown.length} / ${users.length} คน`}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        {/* เลือกไฟล์ได้เฉพาะบนเว็บ (ดู utils/filePicker) — นำเข้ารายชื่อเป็นงานโต๊ะทำงาน */}
        {canPickFile ? (
          <TouchableOpacity
            style={[styles.addButton, styles.importButton]}
            onPress={() => setImporting(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="document-attach-outline" size={18} color={colors.navy} />
            <Text style={[styles.addButtonText, { color: colors.navy }]}>นำเข้ารายชื่อจากไฟล์</Text>
          </TouchableOpacity>
        ) : null}
        {canPickFile ? (
          <TouchableOpacity
            style={[styles.addButton, styles.importButton]}
            onPress={() => setImportingArea(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="storefront-outline" size={18} color={colors.navy} />
            <Text style={[styles.addButtonText, { color: colors.navy }]}>นำเข้า Area Team</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.addButton} onPress={() => setCreating(true)} activeOpacity={0.8}>
          <Ionicons name="person-add-outline" size={18} color="#fff" />
          <Text style={styles.addButtonText}>เพิ่มบัญชีผู้ใช้</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.intro}>
        บัญชีทั้งหมดสร้างจากที่นี่ ผู้ใช้สมัครเองไม่ได้ · แอดมินตั้งรหัสตั้งต้นให้
        แล้วเจ้าของบัญชีต้องเปลี่ยนรหัสเองตอนเข้าครั้งแรก
      </Text>

      {gaps.size ? (
        <View style={styles.gapBox}>
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
          <View style={{ flex: 1, minWidth: 200 }}>
            <Text style={styles.gapTitle}>ยังไม่มีพื้นที่รับผิดชอบ {gaps.size} คน</Text>
            <Text style={styles.gapText}>
              ช่าง {users.filter((u) => u.role === "EMPLOYEE" && gaps.has(u.id)).length} · หัวหน้าภาค{" "}
              {users.filter((u) => u.role === "SUPERVISOR" && gaps.has(u.id)).length} — ยังไม่เห็นใบงานของทีม
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.gapBtn, gapsOnly && styles.gapBtnOn]}
            onPress={() => setGapsOnly((v) => !v)}
            accessibilityLabel="ดูเฉพาะคนที่ยังไม่มีพื้นที่รับผิดชอบ"
          >
            <Text style={[styles.gapBtnText, gapsOnly && { color: "#fff" }]}>{gapsOnly ? "แสดงทุกคน" : "ดูรายชื่อ"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.gapBtn} onPress={downloadGaps} accessibilityLabel="ดาวน์โหลดรายงานคนที่ยังไม่มีพื้นที่รับผิดชอบ">
            <Ionicons name="download-outline" size={15} color={colors.danger} />
            <Text style={styles.gapBtnText}>Excel</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="ค้นหาชื่อ รหัสพนักงาน เบอร์โทร ทีม ภาค หรือสิทธิ์"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="ค้นหาผู้ใช้"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery("")} accessibilityLabel="ล้างคำค้นหา" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.textFaint} />
          </TouchableOpacity>
        ) : null}
      </View>
      {shown.length === 0 ? (
        <Text style={styles.noMatch}>ไม่พบผู้ใช้ที่ตรงกับ “{query.trim()}”</Text>
      ) : null}

      {shown.map((u) => (
        <View key={u.id} style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.name}>{u.name}</Text>
            <Text style={styles.code}>{u.employeeCode}</Text>
            {savingId === u.id ? <Spinner size="small" color={colors.primary} /> : null}
          </View>
          {/* ช่างที่ยังไม่มีทีมมีข้อความใต้ช่องทีมอยู่แล้ว — ที่นี่สำหรับกรณีอื่น (ทีมสะกดผิด หัวหน้าภาคไม่มีขอบเขต) */}
          {gaps.has(u.id) && gaps.get(u.id) !== "ยังไม่ได้จัดทีม" ? (
            <View style={styles.warn}>
              <Ionicons name="alert-circle" size={14} color={colors.danger} />
              <Text style={styles.warnText}>{gaps.get(u.id)} — ยังไม่เห็นใบงานของทีม</Text>
            </View>
          ) : null}

          {u.mustChangePassword ? (
            <View style={styles.pending}>
              <Ionicons name="key-outline" size={13} color={colors.warning} />
              <Text style={styles.pendingText}>ยังใช้รหัสตั้งต้น — รอเจ้าของบัญชีเปลี่ยนเอง</Text>
            </View>
          ) : null}

          <Text style={styles.label}>สิทธิ์</Text>
          <View style={styles.options}>
            {roleOptions(!!me?.superAdmin, u.role).map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[styles.option, u.role === r.value && styles.optionOn]}
                onPress={() => update(u.id, { role: r.value })}
                disabled={savingId !== null}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionText, u.role === r.value && styles.optionTextOn]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>
            {ROLE_OPTIONS.find((r) => r.value === u.role)?.hint ?? ""}
          </Text>

          {/*
            ช่างต้องมีทีม ไม่งั้นจะไม่เห็นใบงานเลย เพราะงานถูกจ่ายให้ทีม
            ไม่ได้จ่ายรายคน — เหมือนหัวหน้าภาคที่ต้องมีภาค
          */}
          {u.role === "EMPLOYEE" ? (
            <>
              <Text style={styles.label}>ทีมช่างที่สังกัด</Text>
              {teams.length === 0 ? (
                <Text style={styles.hint}>
                  ยังไม่มีทีมในทะเบียนสาขา — ทีมมาจากคอลัมน์ “ทีมช่าง” ในไฟล์ทะเบียนสาขา
                </Text>
              ) : (
                <View style={styles.options}>
                  {teams.map((team) => (
                    <TouchableOpacity
                      key={team}
                      style={[styles.option, u.team === team && styles.optionOn]}
                      onPress={() => update(u.id, { team: u.team === team ? null : team })}
                      disabled={savingId !== null}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.optionText, u.team === team && styles.optionTextOn]}>
                        {team}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {groups.length ? (
                <>
                  <Text style={styles.subLabel}>หรือทีมรวม — พื้นที่ที่ครอบคลุมหลายทีม (ตามบันทึกแบ่งทีม)</Text>
                  <View style={styles.options}>
                    {groups.map((g) => (
                      <TouchableOpacity
                        key={g.name}
                        style={[styles.option, styles.groupOption, u.team === g.name && styles.optionOn]}
                        onPress={() => update(u.id, { team: u.team === g.name ? null : g.name })}
                        disabled={savingId !== null}
                        activeOpacity={0.7}
                        accessibilityLabel={`ทีมรวม ${g.name}`}
                      >
                        <Text style={[styles.optionText, u.team === g.name && styles.optionTextOn]}>
                          {g.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {groups.find((g) => g.name === u.team) ? (
                    <Text style={styles.hint}>เห็นใบงานของ {groupScope(groups.find((g) => g.name === u.team)!)}</Text>
                  ) : null}
                </>
              ) : null}
              {!u.team ? (
                <View style={styles.warn}>
                  <Ionicons name="alert-circle" size={14} color={colors.danger} />
                  <Text style={styles.warnText}>
                    ยังไม่ได้จัดทีม จะเห็นเฉพาะงานเก่าที่เคยจ่ายให้ตัวเอง
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}

          {u.role === "SUPERVISOR" ? (
            <>
              <Text style={styles.label}>ภาคที่ดูแล (เลือกได้หลายภาค · กดซ้ำเพื่อเอาออก)</Text>
              {regions.length === 0 && !regionsOf(u).length ? (
                <Text style={styles.hint}>
                  ยังไม่มีภาคในทะเบียนสาขา — อัปโหลดไฟล์ทะเบียนสาขาก่อน
                </Text>
              ) : (
                <RegionChips
                  value={regionsOf(u)}
                  options={regions}
                  // เอาภาคออกหมดได้ — หัวหน้าภาคที่ดูแลตามทีมอย่างเดียวไม่ต้องมีภาค
                  onChange={(next) => update(u.id, { regions: next })}
                  disabled={savingId !== null}
                />
              )}
              <SharedRegionHint regions={regionsOf(u)} holders={holders} self={u.id} />
              {/*
                ทีมที่ดูแลเลือกได้หลายทีม — บันทึกแบ่งทีมแบ่งหัวหน้าภาคตามทีม ไม่ตรงกับภาค
                (สองคนแบ่ง กทม. กันตามเขต) เห็นงาน = ทุกภาคที่เลือก รวมกับทีมเหล่านี้
                คนที่ดูทั้งภาคหลายภาคเลือกที่ปุ่มภาคด้านบนได้แล้ว ไม่ต้องไล่ติ๊กทีมทีละทีมแบบเดิม
              */}
              <Text style={styles.label}>ทีมช่างที่ดูแล (เลือกได้หลายทีม)</Text>
              {teams.length === 0 ? (
                <Text style={styles.hint}>ยังไม่มีทีมในทะเบียนสาขา</Text>
              ) : (
                <View style={styles.options}>
                  {teams.map((team) => {
                    const on = (u.supervisedTeams ?? []).includes(team);
                    return (
                      <TouchableOpacity
                        key={team}
                        style={[styles.option, on && styles.optionOn]}
                        onPress={() =>
                          update(u.id, {
                            supervisedTeams: on
                              ? u.supervisedTeams.filter((t) => t !== team)
                              : [...(u.supervisedTeams ?? []), team],
                          })
                        }
                        disabled={savingId !== null}
                        activeOpacity={0.7}
                        accessibilityState={{ selected: on }}
                      >
                        <Text style={[styles.optionText, on && styles.optionTextOn]}>{team}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              {groups.length ? (
                <>
                  <Text style={styles.subLabel}>ทีมรวมที่ดูแล — จัดแผนให้ช่างในทีมรวมได้</Text>
                  <View style={styles.options}>
                    {groups.map((g) => {
                      const on = (u.supervisedTeams ?? []).includes(g.name);
                      return (
                        <TouchableOpacity
                          key={g.name}
                          style={[styles.option, styles.groupOption, on && styles.optionOn]}
                          onPress={() =>
                            update(u.id, {
                              supervisedTeams: on
                                ? u.supervisedTeams.filter((t) => t !== g.name)
                                : [...(u.supervisedTeams ?? []), g.name],
                            })
                          }
                          disabled={savingId !== null}
                          activeOpacity={0.7}
                          accessibilityLabel={`ทีมรวมที่ดูแล ${g.name}`}
                          accessibilityState={{ selected: on }}
                        >
                          <Text style={[styles.optionText, on && styles.optionTextOn]}>{g.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null}
              {!regionsOf(u).length && !(u.supervisedTeams ?? []).length ? (
                <View style={styles.warn}>
                  <Ionicons name="alert-circle" size={14} color={colors.danger} />
                  <Text style={styles.warnText}>ยังไม่ได้เลือกภาคหรือทีม จะไม่เห็นใบงานใดเลย</Text>
                </View>
              ) : null}
            </>
          ) : null}

          {u.role === "COCO_MAID" ? (
            <>
              <Text style={styles.label}>สาขาที่ประจำ (เลือกได้หลายสาขา)</Text>
              <MaidBranchPicker
                value={(u.maidBranches ?? []).map((b) => b.code)}
                known={u.maidBranches ?? []}
                options={cocoBranches}
                disabled={savingId !== null}
                onChange={(codes) => update(u.id, { maidBranches: codes })}
                who={u.name}
              />
              {!(u.maidBranches ?? []).length ? (
                <View style={styles.warn}>
                  <Ionicons name="alert-circle" size={14} color={colors.danger} />
                  <Text style={styles.warnText}>ยังไม่ได้เลือกสาขาที่ประจำ จะไม่เห็นใบงานใดเลย</Text>
                </View>
              ) : null}
            </>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.resetLink}
              onPress={() => setEditing(u)}
              activeOpacity={0.7}
              accessibilityLabel={`แก้ไขรายละเอียด ${u.name}`}
            >
              <Ionicons name="create-outline" size={14} color={colors.primary} />
              <Text style={styles.resetLinkText}>แก้ไขรายละเอียด</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.resetLink}
              onPress={() => setResetting(u)}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={14} color={colors.primary} />
              <Text style={styles.resetLinkText}>ตั้งรหัสผ่านใหม่ให้</Text>
            </TouchableOpacity>
            {/* ลบได้เฉพาะ Super Admin (เซิร์ฟเวอร์กันซ้ำ) — แอดมินทั่วไปไม่เห็นปุ่มเลย จะได้ไม่กดแล้วโดนปฏิเสธ */}
            {me?.superAdmin && u.id !== me.id ? (
              <TouchableOpacity
                style={styles.resetLink}
                onPress={() => remove(u)}
                activeOpacity={0.7}
                accessibilityLabel={`ลบผู้ใช้ ${u.name}`}
              >
                <Ionicons name="trash-outline" size={14} color={colors.danger} />
                <Text style={[styles.resetLinkText, { color: colors.dangerInk }]}>ลบผู้ใช้</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ))}

      <CreateUserModal
        visible={creating}
        regions={regions}
        holders={holders}
        cocoBranches={cocoBranches}
        onCancel={() => setCreating(false)}
        onDone={async () => {
          setCreating(false);
          await load();
        }}
      />

      <EditUserModal
        user={editing}
        onCancel={() => setEditing(null)}
        onDone={(updated) => {
          setUsers((list) => list.map((x) => (x.id === updated.id ? updated : x)));
          setEditing(null);
        }}
      />

      <RosterImportModal visible={importing} onClose={() => setImporting(false)} onDone={load} />
      <AreaTeamImportModal visible={importingArea} onClose={() => setImportingArea(false)} onDone={load} />

      <ResetPasswordModal
        user={resetting}
        onCancel={() => setResetting(null)}
        onDone={async () => {
          setResetting(null);
          await load();
        }}
      />
    </ScrollView>
  );
}


const MIN_PASSWORD = 8;

/** แอดมินสร้างบัญชีให้ พร้อมรหัสตั้งต้น */
function CreateUserModal({
  visible,
  regions,
  holders,
  cocoBranches,
  onCancel,
  onDone,
}: {
  visible: boolean;
  regions: string[];
  holders: Holders;
  cocoBranches: CocoBranch[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const { user: me } = useAuth();
  const [employeeCode, setEmployeeCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [picked, setPicked] = useState<string[]>([]);
  const [maidBranches, setMaidBranches] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!visible) return;
    setEmployeeCode("");
    setName("");
    setPhone("");
    setRole("EMPLOYEE");
    setPicked([]);
    setMaidBranches([]);
    setPassword("");
    setError(null);
  }, [visible]);

  const ready =
    employeeCode.trim().length >= 2 &&
    name.trim().length > 0 &&
    password.length >= MIN_PASSWORD &&
    (role !== "SUPERVISOR" || picked.length > 0) &&
    (role !== "COCO_MAID" || maidBranches.length > 0);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api.post("/auth/users", {
        employeeCode: employeeCode.trim(),
        name: name.trim(),
        phone: phone.trim() || undefined,
        role,
        // หลายภาคได้ — เซิร์ฟเวอร์เก็บภาคแรกเป็น region ที่เหลือเป็น extraRegions
        ...(role === "SUPERVISOR" ? { regions: picked } : {}),
        password,
        ...(role === "COCO_MAID" ? { maidBranches } : {}),
      });
      showAlert(
        "สร้างบัญชีแล้ว",
        `บอกชื่อผู้ใช้ "${employeeCode.trim()}" และรหัสตั้งต้นให้เจ้าของบัญชี — ระบบจะบังคับให้เปลี่ยนรหัสตอนเข้าครั้งแรก`
      );
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      visible={visible}
      onClose={onCancel}
      busy={saving}
      title="เพิ่มบัญชีผู้ใช้"
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalSave, (!ready || saving) && styles.modalSaveOff]}
            onPress={submit}
            disabled={!ready || saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <Spinner color="#fff" size="small" />
            ) : (
              <Text style={styles.modalSaveText}>สร้างบัญชี</Text>
            )}
          </TouchableOpacity>
        </View>
      }
    >

      <Text style={styles.label}>ชื่อผู้ใช้ (รหัสพนักงาน)</Text>
      <TextInput
        style={styles.input}
        value={employeeCode}
        onChangeText={setEmployeeCode}
        autoCapitalize="characters"
        placeholder="เช่น T012"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="ชื่อผู้ใช้"
      />

      <Text style={styles.label}>ชื่อ-นามสกุล</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="ชื่อที่จะขึ้นในใบงาน"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="ชื่อ-นามสกุล"
      />

      <Text style={styles.label}>เบอร์โทร</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="ไม่ใส่ก็ได้"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="เบอร์โทร"
      />

      <Text style={styles.label}>สิทธิ์</Text>
      <View style={styles.options}>
        {roleOptions(!!me?.superAdmin).map((r) => (
          <TouchableOpacity
            key={r.value}
            style={[styles.option, role === r.value && styles.optionOn]}
            onPress={() => {
              setRole(r.value);
              if (r.value !== "SUPERVISOR") setPicked([]);
              if (r.value !== "COCO_MAID") setMaidBranches([]);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, role === r.value && styles.optionTextOn]}>
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {role === "SUPERVISOR" ? (
        <>
          <Text style={styles.label}>ภาคที่ดูแล (เลือกได้หลายภาค · กดซ้ำเพื่อเอาออก)</Text>
          <RegionChips value={picked} options={regions} onChange={setPicked} />
          <SharedRegionHint regions={picked} holders={holders} />
        </>
      ) : null}

      {role === "COCO_MAID" ? (
        <>
          <Text style={styles.label}>สาขาที่ประจำ</Text>
          <MaidBranchPicker value={maidBranches} known={[]} options={cocoBranches} onChange={setMaidBranches} who="ผู้ใช้ใหม่" />
          <Text style={styles.hint}>
            เห็นและเปิดใบงานได้เฉพาะสาขาที่เลือก · ชื่อผู้ใช้เก็บเป็นตัวเล็ก (เช่น sukanya.y) — มีหลายคน ใช้ปุ่ม “นำเข้า Area Team”
            กับไฟล์รายชื่อ Maid ได้เลย
          </Text>
        </>
      ) : null}

      <Text style={styles.label}>รหัสตั้งต้น</Text>
      <TextInput
        style={[styles.input, password.length > 0 && password.length < MIN_PASSWORD && invalidInput]}
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        placeholder={`อย่างน้อย ${MIN_PASSWORD} ตัว`}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="รหัสตั้งต้น"
      />
      <FieldHint
        err={password.length > 0 && password.length < MIN_PASSWORD ? `ยังขาดอีก ${MIN_PASSWORD - password.length} ตัว` : null}
        ok={password.length >= MIN_PASSWORD ? "ความยาวใช้ได้" : null}
      />
      <Text style={styles.hint}>
        ไม่ต้องซ่อน — ตั้งใจให้แอดมินอ่านออกเพื่อบอกต่อ เจ้าของบัญชีจะถูกบังคับ
        ให้เปลี่ยนเป็นรหัสของตัวเองตอนเข้าครั้งแรกอยู่แล้ว
      </Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </AppModal>
  );
}

/** ภาค → หัวหน้าภาคที่ถือภาคนั้นอยู่ (หลายคนได้) */
type Holders = Map<string, { id: number; name: string }[]>;

/**
 * ปุ่มภาคที่ดูแล — เลือกได้หลายภาค กดซ้ำเพื่อเอาออก (เจ้าของงานขอ ต.ค. 69) ทุกภาคได้สิทธิ์เต็มเท่ากัน
 * ไม่มีภาคหลัก/ภาครองในสายตาผู้ใช้ — ปุ่มเรียงตามทะเบียนสาขา
 *
 * ภาคที่ถืออยู่แต่ไม่มีในทะเบียนสาขาแล้ว (เปลี่ยนชื่อภาค · ปิดสาขาหมด) ยังขึ้นปุ่มให้กดเอาออก —
 * สมัยเลือกได้ภาคเดียว กดภาคอื่นก็ทับภาคเก่าไปเอง พอเลือกได้หลายภาค ภาคที่ไม่มีปุ่มจะค้างอยู่ตลอดไป
 */
function RegionChips({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string[];
  options: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const stale = value.filter((r) => !options.includes(r));
  return (
    <View style={styles.options}>
      {[...options, ...stale].map((r) => {
        const on = value.includes(r);
        const gone = !options.includes(r);
        return (
          <TouchableOpacity
            key={r}
            style={[styles.option, on && styles.optionOn, gone && styles.staleOption]}
            // ต่อท้าย ไม่เรียงใหม่ — ภาคแรกคือ region ที่แอปรุ่นเก่ากับรายงานเดิมอ่าน เพิ่มภาคแล้วภาคเดิมไม่ควรเปลี่ยน
            onPress={() => onChange(on ? value.filter((x) => x !== r) : [...value, r])}
            disabled={disabled}
            activeOpacity={0.7}
            // เว็บไม่แปลง accessibilityState เป็น aria-selected (แบบเดียวกับ FilterBar) — โปรแกรมอ่านจอ/เทสต์
            // ต้องรู้ว่าภาคไหนติดอยู่โดยไม่ต้องเดาจากสี เลือกได้หลายภาคแล้วสีอย่างเดียวไม่พอ
            accessibilityState={{ selected: on }}
            aria-selected={on}
          >
            <Text style={[styles.optionText, on && styles.optionTextOn, gone && { color: colors.dangerInk }]}>
              {gone ? `${r} · ไม่มีในทะเบียนสาขา` : r}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * ภาคที่หัวหน้าภาคคนอื่นถืออยู่ด้วย — ทำได้ตามที่เจ้าของงานตอบ (ทั้งสองคนได้ใบงานของภาคนั้น ใครกดก่อนได้ก่อน)
 * แต่พอเลือกได้หลายภาค การซ้อนกันเกิดได้ง่ายโดยไม่ตั้งใจ บอกตอนเลือกเลย ดีกว่าให้หัวหน้าภาคสองคนงงทีหลัง
 * ว่าทำไมใบเดียวกันอยู่ในกล่องทั้งคู่ · ทีมที่อีกคนติ๊กไว้ใน "ทีมที่ดูแล" ยังไปที่คนนั้นคนเดียวตามกฎเดิม
 */
function SharedRegionHint({ regions, holders, self }: { regions: string[]; holders: Holders; self?: number }) {
  const lines = regions.flatMap((r) => {
    const others = (holders.get(r) ?? []).filter((h) => h.id !== self);
    return others.length ? [{ r, others }] : [];
  });
  if (!lines.length) return null;
  return (
    <View style={styles.sharedBox}>
      {lines.map(({ r, others }) => (
        <View key={r} style={styles.shared}>
          <Ionicons name="people-outline" size={14} color={colors.roleSupervisor} style={{ marginTop: 3 }} />
          <Text style={styles.sharedText}>
            ภาค{r} มี {others.map((o) => o.name).join(", ")} ดูแลด้วย — ใบงานเข้ากล่อง
            {others.length === 1 ? "ทั้งสองคน" : `ทั้ง ${others.length + 1} คน`}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * แก้ชื่อผู้ใช้ ชื่อ และเบอร์โทร — สิทธิ์/ทีม/ภาคแก้ที่การ์ดได้อยู่แล้ว ไม่ต้องมีซ้ำในหน้าต่างนี้
 * ไม่แตะรหัสผ่าน (มีปุ่มตั้งรหัสผ่านใหม่แยกไว้แล้ว)
 */
/**
 * สาขาที่ Maid (COCO) ประจำ — ป้ายสาขาที่เลือกแล้ว (กด × เอาออก) + dropdown ค้นหาเพิ่มทีละสาขา
 * สาขา COCO มีหลายร้อยแห่ง เลือกจากปุ่มเรียงทั้งหมดแบบทีมช่างไม่ไหว ต้องค้นด้วยรหัสหรือชื่อ
 * known = ชื่อสาขาที่บัญชีผูกอยู่แล้ว เผื่อสาขาถูกปิดไปแล้ว (ไม่อยู่ในตัวเลือก) จะได้ยังขึ้นชื่อให้เอาออกได้
 */
function MaidBranchPicker({
  value,
  known,
  options,
  onChange,
  disabled,
  who,
}: {
  value: string[];
  known: CocoBranch[];
  options: CocoBranch[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
  who: string;
}) {
  const nameOf = new Map([...known, ...options].map((b) => [b.code, b.name]));
  return (
    <>
      {value.length ? (
        <View style={[styles.options, { marginBottom: spacing.xs }]}>
          {value.map((code) => (
            <TouchableOpacity
              key={code}
              style={[styles.option, styles.optionOn, styles.branchChip]}
              onPress={() => onChange(value.filter((c) => c !== code))}
              disabled={disabled}
              activeOpacity={0.7}
              accessibilityLabel={`เอาสาขา ${code} ออกจาก ${who}`}
            >
              <Text style={[styles.optionText, styles.optionTextOn, { flexShrink: 1 }]} numberOfLines={1}>
                {code} · {nameOf.get(code) ?? ""}
              </Text>
              <Ionicons name="close" size={14} color={colors.primaryDark} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      <Dropdown
        value={null}
        options={options.filter((b) => !value.includes(b.code)).map((b) => ({ value: b.code, label: `${b.code} · ${b.name}` }))}
        onChange={(code) => code && onChange([...value, code])}
        placeholder={value.length ? "เพิ่มสาขาอื่น" : "เลือกสาขาที่ประจำ"}
        disabled={disabled}
        accessibilityLabel={`เพิ่มสาขาที่ประจำ ${who}`}
      />
    </>
  );
}

function EditUserModal({
  user,
  onCancel,
  onDone,
}: {
  user: ManagedUser | null;
  onCancel: () => void;
  onDone: (updated: ManagedUser) => void;
}) {
  const [employeeCode, setEmployeeCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    setEmployeeCode(user.employeeCode);
    setName(user.name);
    setPhone(user.phone ?? "");
    setError(null);
  }, [user?.id]);

  if (!user) return null;
  const codeChanged = employeeCode.trim() !== user.employeeCode;
  const changed = codeChanged || name.trim() !== user.name || phone.trim() !== (user.phone ?? "");
  const ready = changed && employeeCode.trim().length >= 2 && name.trim().length > 0;

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.patch<ManagedUser>(`/auth/users/${user!.id}`, {
        employeeCode: employeeCode.trim(),
        name: name.trim(),
        phone: phone.trim() || null,
      });
      showAlert(
        "บันทึกแล้ว",
        codeChanged
          ? `ครั้งต่อไป ${res.data.name} ต้องเข้าระบบด้วยชื่อผู้ใช้ "${res.data.employeeCode}"`
          : `แก้รายละเอียดของ ${res.data.name} แล้ว`
      );
      onDone(res.data);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      visible
      onClose={onCancel}
      busy={saving}
      title="แก้ไขรายละเอียด"
      subtitle={`${user.name} · ${user.employeeCode}`}
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalSave, (!ready || saving) && styles.modalSaveOff]}
            onPress={submit}
            disabled={!ready || saving}
            activeOpacity={0.8}
          >
            {saving ? <Spinner color="#fff" size="small" /> : <Text style={styles.modalSaveText}>บันทึก</Text>}
          </TouchableOpacity>
        </View>
      }
    >
      <Text style={styles.label}>ชื่อผู้ใช้ (รหัสพนักงาน)</Text>
      <TextInput
        style={styles.input}
        value={employeeCode}
        onChangeText={setEmployeeCode}
        autoCapitalize="characters"
        accessibilityLabel="ชื่อผู้ใช้"
      />
      {codeChanged ? (
        <Text style={styles.hint}>
          เปลี่ยนชื่อผู้ใช้ = เจ้าของบัญชีต้องเข้าระบบด้วยชื่อใหม่ (รหัสผ่านเดิม) — แจ้งเขาด้วย
        </Text>
      ) : null}

      <Text style={styles.label}>ชื่อ-นามสกุล</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="ชื่อที่จะขึ้นในใบงาน"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="ชื่อ-นามสกุล"
      />

      <Text style={styles.label}>เบอร์โทร</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="ไม่ใส่ก็ได้"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="เบอร์โทร"
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </AppModal>
  );
}

/** ตั้งรหัสใหม่ให้เมื่อผู้ใช้ลืมรหัส — เจ้าของบัญชีต้องเปลี่ยนอีกครั้งเสมอ */
function ResetPasswordModal({
  user,
  onCancel,
  onDone,
}: {
  user: ManagedUser | null;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    setPassword("");
    setError(null);
  }, [user]);

  async function submit() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/auth/users/${user.id}/reset-password`, { password });
      showAlert("ตั้งรหัสใหม่แล้ว", `บอกรหัสนี้ให้ ${user.name} แล้วให้เปลี่ยนเองตอนเข้าระบบ`);
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      visible={!!user}
      onClose={onCancel}
      busy={saving}
      title="ตั้งรหัสผ่านใหม่"
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalSave, (password.length < MIN_PASSWORD || saving) && styles.modalSaveOff]}
            onPress={submit}
            disabled={password.length < MIN_PASSWORD || saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <Spinner color="#fff" size="small" />
            ) : (
              <Text style={styles.modalSaveText}>ตั้งรหัสใหม่</Text>
            )}
          </TouchableOpacity>
        </View>
      }
    >
      <Text style={styles.hint}>
        {user?.name} · {user?.employeeCode} — รหัสเดิมจะใช้ไม่ได้ทันที
        และเจ้าของบัญชีต้องเปลี่ยนเป็นรหัสของตัวเองตอนเข้าครั้งถัดไป
      </Text>

      <Text style={styles.label}>รหัสตั้งต้นใหม่</Text>
      <TextInput
        style={[styles.input, password.length > 0 && password.length < MIN_PASSWORD && invalidInput]}
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        placeholder={`อย่างน้อย ${MIN_PASSWORD} ตัว`}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="รหัสตั้งต้นใหม่"
      />
      <FieldHint
        err={password.length > 0 && password.length < MIN_PASSWORD ? `ยังขาดอีก ${MIN_PASSWORD - password.length} ตัว` : null}
        ok={password.length >= MIN_PASSWORD ? "ความยาวใช้ได้" : null}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  subLabel: { fontSize: 12.5, fontWeight: "600", color: colors.textMuted, marginTop: 4 },
  groupOption: { borderStyle: "dashed" },
  gapBox: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  gapTitle: { fontSize: 14, fontWeight: "700", color: colors.danger },
  gapText: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
  gapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  gapBtnOn: { backgroundColor: colors.danger },
  gapBtnText: { fontSize: 13, fontWeight: "700", color: colors.danger },
  pageHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  pageTitle: { fontSize: 24, lineHeight: 34, fontWeight: "700", color: colors.text },
  countPill: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 12 },
  countPillText: { fontSize: 13, lineHeight: 24, fontWeight: "800", color: colors.primaryInk },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.navyFill,
    borderRadius: 14,
    minHeight: 44,
    paddingHorizontal: 16,
    ...shadow.raised,
  },
  importButton: { backgroundColor: colors.sky50, borderWidth: 1, borderColor: colors.border },
  addButtonText: { color: "#fff", fontSize: 15, lineHeight: 24, fontWeight: "700" },
  pending: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  pendingText: { fontSize: 11, lineHeight: 19, color: colors.warning },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  resetLink: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  resetLinkText: { fontSize: 13, lineHeight: 21, color: colors.primary, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  modalActions: { flex: 1, flexDirection: "row", gap: spacing.sm },
  modalCancel: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.sky50,
  },
  modalCancelText: { fontSize: 15, lineHeight: 22, color: colors.primaryInk, fontWeight: "700" },
  modalSave: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.navyFill,
  },
  modalSaveOff: { opacity: 0.5 },
  modalSaveText: { color: "#fff", fontSize: 14, lineHeight: 22, fontWeight: "700" },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  errorText: { fontSize: 13, lineHeight: 21, color: colors.danger, textAlign: "center" },
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
  noMatch: { fontSize: 14, color: colors.textMuted, textAlign: "center", paddingVertical: spacing.xl },
  intro: { fontSize: 13, lineHeight: 20, color: colors.textMuted, marginTop: -4 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    padding: spacing.lg,
    ...shadow.card,
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { fontSize: 15, lineHeight: 24, fontWeight: "700", color: colors.text },
  code: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.textFaint },
  label: {
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  optionOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  optionText: { fontSize: 13, lineHeight: 21, color: colors.textMuted, fontWeight: "600" },
  optionTextOn: { color: colors.primaryDark },
  branchChip: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" },
  staleOption: { borderStyle: "dashed", borderColor: colors.danger },
  sharedBox: { gap: 2, marginTop: spacing.xs },
  shared: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  sharedText: { flex: 1, fontSize: 12, lineHeight: 20, color: colors.textMuted },
  hint: { fontSize: 11, lineHeight: 19, color: colors.textFaint, marginTop: spacing.xs },
  warn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  warnText: { fontSize: 12, lineHeight: 20, color: colors.danger },
});
