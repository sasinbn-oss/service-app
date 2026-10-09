/**
 * ตั้งสิทธิ์และภาคของผู้ใช้
 *
 * จำเป็นเพราะสายงานใบงานพึ่งบทบาท ถ้าตั้งหัวหน้าภาคไม่ได้ ใบงานจะค้างอยู่ขั้น
 * "รอหัวหน้าภาคระบุอะไหล่" ตลอดไปโดยไม่มีใครมีสิทธิ์ทำต่อ
 */
import React, { useCallback, useMemo, useState } from "react";
import { useCachedState } from "../utils/pageCache";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Spinner from "../components/Spinner";
import AppModal from "../components/AppModal";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { Role } from "../types";
import FieldHint, { invalidInput } from "../components/FieldHint";
import RosterImportModal from "../components/RosterImportModal";
import { canPickFile } from "../utils/filePicker";
import { colors, radius, shadow, spacing, headingFont } from "../theme";

interface ManagedUser {
  id: number;
  employeeCode: string;
  name: string;
  phone: string | null;
  role: Role;
  region: string | null;
  /** ทีมช่างที่สังกัด — ตัวบอกว่าช่างคนนี้เห็นงานของทีมไหน */
  team: string | null;
  /** ทีมช่างที่หัวหน้าภาคดูแล — หลายทีมได้ ใช้ร่วมกับภาค */
  supervisedTeams: string[];
  mustChangePassword: boolean;
}

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: "EMPLOYEE", label: "ช่าง", hint: "รับงานที่ถูกจ่ายให้ บันทึกผลตรวจหน้างาน และปิดงาน" },
  { value: "SUPERVISOR", label: "หัวหน้าภาค", hint: "ระบุอะไหล่และจ่ายงานให้ช่าง ในภาคหรือทีมที่ดูแล" },
  { value: "ADMIN", label: "แอดมิน", hint: "เปิดใบงาน เช็คคลัง และทำแทนได้ทุกขั้น" },
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
  return [u.name, u.employeeCode, u.phone, u.team, u.region, ...(u.supervisedTeams ?? []), role]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function ManageUsersScreen() {
  const { user: me } = useAuth();
  const [users, setUsers, cached] = useCachedState<ManagedUser[]>("ManageUsers:users", []);
  const [regions, setRegions] = useCachedState<string[]>("ManageUsers:regions", []);
  const [teams, setTeams] = useCachedState<string[]>("ManageUsers:teams", []);
  const [loading, setLoading] = useState(!cached);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<ManagedUser | null>(null);
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  // ทุกคำที่พิมพ์ต้องเจอ (ไม่จำเป็นต้องติดกัน) — "ช่าง กระบี่" ได้ช่างทีมกระบี่
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return users;
    return users.filter((u) => {
      const t = searchText(u);
      return words.every((w) => t.includes(w));
    });
  }, [users, query]);

  const load = useCallback(async () => {
    try {
      const [list, regionList, teamList] = await Promise.all([
        api.get<ManagedUser[]>("/auth/users"),
        api.get<{ name: string }[]>("/branches/regions"),
        api.get<{ name: string }[]>("/branches/teams"),
      ]);
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

  async function update(
    id: number,
    patch: { role?: Role; region?: string | null; team?: string | null; supervisedTeams?: string[] }
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
        <Text style={[styles.pageTitle, headingFont]}>สิทธิ์ผู้ใช้</Text>
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
        <TouchableOpacity style={styles.addButton} onPress={() => setCreating(true)} activeOpacity={0.8}>
          <Ionicons name="person-add-outline" size={18} color="#fff" />
          <Text style={styles.addButtonText}>เพิ่มบัญชีผู้ใช้</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.intro}>
        บัญชีทั้งหมดสร้างจากที่นี่ ผู้ใช้สมัครเองไม่ได้ · แอดมินตั้งรหัสตั้งต้นให้
        แล้วเจ้าของบัญชีต้องเปลี่ยนรหัสเองตอนเข้าครั้งแรก
      </Text>

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
              <Text style={styles.label}>ภาคที่ดูแล (กดซ้ำเพื่อเอาออก)</Text>
              {regions.length === 0 ? (
                <Text style={styles.hint}>
                  ยังไม่มีภาคในทะเบียนสาขา — อัปโหลดไฟล์ทะเบียนสาขาก่อน
                </Text>
              ) : (
                <View style={styles.options}>
                  {regions.map((region) => (
                    <TouchableOpacity
                      key={region}
                      style={[styles.option, u.region === region && styles.optionOn]}
                      // กดซ้ำเพื่อเอาภาคออก — หัวหน้าภาคที่ดูแลตามทีมอย่างเดียวไม่ต้องมีภาค
                      onPress={() => update(u.id, { region: u.region === region ? null : region })}
                      disabled={savingId !== null}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.optionText, u.region === region && styles.optionTextOn]}
                      >
                        {region}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {/*
                ทีมที่ดูแลเลือกได้หลายทีม — บันทึกแบ่งทีมแบ่งหัวหน้าภาคตามทีม ไม่ตรงกับภาค
                (สองคนแบ่ง กทม. กันตามเขต · คนหนึ่งดูสองภาค) เห็นงาน = ภาคที่เลือก รวมกับทีมเหล่านี้
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
              {!u.region && !(u.supervisedTeams ?? []).length ? (
                <View style={styles.warn}>
                  <Ionicons name="alert-circle" size={14} color={colors.danger} />
                  <Text style={styles.warnText}>ยังไม่ได้เลือกภาคหรือทีม จะไม่เห็นใบงานใดเลย</Text>
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
  onCancel,
  onDone,
}: {
  visible: boolean;
  regions: string[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const { user: me } = useAuth();
  const [employeeCode, setEmployeeCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [region, setRegion] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!visible) return;
    setEmployeeCode("");
    setName("");
    setPhone("");
    setRole("EMPLOYEE");
    setRegion(null);
    setPassword("");
    setError(null);
  }, [visible]);

  const ready =
    employeeCode.trim().length >= 2 &&
    name.trim().length > 0 &&
    password.length >= MIN_PASSWORD &&
    (role !== "SUPERVISOR" || !!region);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api.post("/auth/users", {
        employeeCode: employeeCode.trim(),
        name: name.trim(),
        phone: phone.trim() || undefined,
        role,
        region,
        password,
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
              if (r.value !== "SUPERVISOR") setRegion(null);
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
          <Text style={styles.label}>ภาคที่ดูแล</Text>
          <View style={styles.options}>
            {regions.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.option, region === r && styles.optionOn]}
                onPress={() => setRegion(r)}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionText, region === r && styles.optionTextOn]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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

/**
 * แก้ชื่อผู้ใช้ ชื่อ และเบอร์โทร — สิทธิ์/ทีม/ภาคแก้ที่การ์ดได้อยู่แล้ว ไม่ต้องมีซ้ำในหน้าต่างนี้
 * ไม่แตะรหัสผ่าน (มีปุ่มตั้งรหัสผ่านใหม่แยกไว้แล้ว)
 */
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
  pageHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  pageTitle: { fontSize: 24, lineHeight: 34, fontWeight: "700", color: colors.text },
  countPill: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 12 },
  countPillText: { fontSize: 13, lineHeight: 24, fontWeight: "800", color: colors.primaryInk },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
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
    backgroundColor: colors.primary,
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
  hint: { fontSize: 11, lineHeight: 19, color: colors.textFaint, marginTop: spacing.xs },
  warn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  warnText: { fontSize: 12, lineHeight: 20, color: colors.danger },
});
