/**
 * ตั้งสิทธิ์และภาคของผู้ใช้
 *
 * จำเป็นเพราะสายงานใบงานพึ่งบทบาท ถ้าตั้งหัวหน้าภาคไม่ได้ ใบงานจะค้างอยู่ขั้น
 * "รอหัวหน้าภาคระบุอะไหล่" ตลอดไปโดยไม่มีใครมีสิทธิ์ทำต่อ
 */
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { Role } from "../types";
import { colors, radius, shadow, spacing } from "../theme";

interface ManagedUser {
  id: number;
  employeeCode: string;
  name: string;
  phone: string | null;
  role: Role;
  region: string | null;
  mustChangePassword: boolean;
}

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: "EMPLOYEE", label: "ช่าง", hint: "รับงานที่ถูกจ่ายให้ นัดวัน และปิดงาน" },
  { value: "SUPERVISOR", label: "หัวหน้าภาค", hint: "ระบุอะไหล่และจ่ายงานให้ช่าง ในภาคที่ดูแล" },
  { value: "ADMIN", label: "แอดมิน", hint: "เปิดใบงาน เช็คคลัง และทำแทนได้ทุกขั้น" },
];

export default function ManageUsersScreen() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<ManagedUser | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, regionList] = await Promise.all([
        api.get<ManagedUser[]>("/auth/users"),
        api.get<{ name: string }[]>("/branches/regions"),
      ]);
      setUsers(list.data);
      // ภาคมาจากทะเบียนสาขาทั้งหมด ไม่ใช่เฉพาะภาคที่มีเคสค้าง — ภาคที่ทุกอย่างปกติ
      // ก็ยังต้องมีหัวหน้าภาคดูแล
      setRegions(regionList.data.map((r) => r.name).filter(Boolean));
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

  async function update(id: number, patch: { role?: Role; region?: string | null }) {
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
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
      <Text style={styles.intro}>
        บัญชีทั้งหมดสร้างจากที่นี่ ผู้ใช้สมัครเองไม่ได้ · แอดมินตั้งรหัสตั้งต้นให้
        แล้วเจ้าของบัญชีต้องเปลี่ยนรหัสเองตอนเข้าครั้งแรก
      </Text>

      <TouchableOpacity style={styles.addButton} onPress={() => setCreating(true)} activeOpacity={0.8}>
        <Ionicons name="person-add-outline" size={18} color="#fff" />
        <Text style={styles.addButtonText}>เพิ่มบัญชีผู้ใช้</Text>
      </TouchableOpacity>

      {users.map((u) => (
        <View key={u.id} style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.name}>{u.name}</Text>
            <Text style={styles.code}>{u.employeeCode}</Text>
            {savingId === u.id ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </View>

          {u.mustChangePassword ? (
            <View style={styles.pending}>
              <Ionicons name="key-outline" size={13} color={colors.warning} />
              <Text style={styles.pendingText}>ยังใช้รหัสตั้งต้น — รอเจ้าของบัญชีเปลี่ยนเอง</Text>
            </View>
          ) : null}

          <Text style={styles.label}>สิทธิ์</Text>
          <View style={styles.options}>
            {ROLE_OPTIONS.map((r) => (
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

          {u.role === "SUPERVISOR" ? (
            <>
              <Text style={styles.label}>ภาคที่ดูแล</Text>
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
                      onPress={() => update(u.id, { region })}
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
              {!u.region ? (
                <View style={styles.warn}>
                  <Ionicons name="alert-circle" size={14} color={colors.danger} />
                  <Text style={styles.warnText}>ยังไม่ได้เลือกภาค จะไม่เห็นใบงานใดเลย</Text>
                </View>
              ) : null}
            </>
          ) : null}

          <TouchableOpacity
            style={styles.resetLink}
            onPress={() => setResetting(u)}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={14} color={colors.primary} />
            <Text style={styles.resetLinkText}>ตั้งรหัสผ่านใหม่ให้</Text>
          </TouchableOpacity>
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.modalTitle}>เพิ่มบัญชีผู้ใช้</Text>

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
              {ROLE_OPTIONS.map((r) => (
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
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              placeholder={`อย่างน้อย ${MIN_PASSWORD} ตัว`}
              placeholderTextColor={colors.textFaint}
              accessibilityLabel="รหัสตั้งต้น"
            />
            <Text style={styles.hint}>
              ไม่ต้องซ่อน — ตั้งใจให้แอดมินอ่านออกเพื่อบอกต่อ เจ้าของบัญชีจะถูกบังคับ
              ให้เปลี่ยนเป็นรหัสของตัวเองตอนเข้าครั้งแรกอยู่แล้ว
            </Text>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>

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
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.modalSaveText}>สร้างบัญชี</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
    <Modal visible={!!user} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.modalTitle}>ตั้งรหัสผ่านใหม่</Text>
            <Text style={styles.hint}>
              {user?.name} · {user?.employeeCode} — รหัสเดิมจะใช้ไม่ได้ทันที
              และเจ้าของบัญชีต้องเปลี่ยนเป็นรหัสของตัวเองตอนเข้าครั้งถัดไป
            </Text>

            <Text style={styles.label}>รหัสตั้งต้นใหม่</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              placeholder={`อย่างน้อย ${MIN_PASSWORD} ตัว`}
              placeholderTextColor={colors.textFaint}
              accessibilityLabel="รหัสตั้งต้นใหม่"
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>

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
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.modalSaveText}>ตั้งรหัสใหม่</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
  },
  addButtonText: { color: "#fff", fontSize: 15, lineHeight: 24, fontWeight: "700" },
  pending: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  pendingText: { fontSize: 11, lineHeight: 19, color: colors.warning },
  resetLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
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
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modal: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "90%",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  modalBody: { padding: spacing.lg },
  modalTitle: { fontSize: 16, lineHeight: 26, fontWeight: "700", color: colors.text },
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalCancel: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
  },
  modalCancelText: { fontSize: 14, lineHeight: 22, color: colors.textMuted, fontWeight: "600" },
  modalSave: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
  },
  modalSaveOff: { opacity: 0.5 },
  modalSaveText: { color: "#fff", fontSize: 14, lineHeight: 22, fontWeight: "700" },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  errorText: { fontSize: 13, lineHeight: 21, color: colors.danger, textAlign: "center" },
  intro: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
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
