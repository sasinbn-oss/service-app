/**
 * ตั้งสิทธิ์และภาคของผู้ใช้
 *
 * จำเป็นเพราะสายงานใบงานพึ่งบทบาท ถ้าตั้งหัวหน้าภาคไม่ได้ ใบงานจะค้างอยู่ขั้น
 * "รอหัวหน้าภาคระบุอะไหล่" ตลอดไปโดยไม่มีใครมีสิทธิ์ทำต่อ
 */
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
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

  const load = useCallback(async () => {
    try {
      const [list, regionList] = await Promise.all([
        api.get<ManagedUser[]>("/auth/users"),
        api.get<{ name: string }[]>("/machines/regions", { params: { kind: "ALL" } }),
      ]);
      setUsers(list.data);
      // ภาคมาจากทะเบียนสาขาจริง จะได้ไม่พิมพ์ชื่อภาคผิดจนกรองไม่เจอ
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
        สิทธิ์เป็นตัวกำหนดว่าใครทำขั้นไหนของใบงานได้ หัวหน้าภาคต้องเลือกภาคด้วย
        ไม่งั้นจะไม่เห็นใบงานของภาคไหนเลย
      </Text>

      {users.map((u) => (
        <View key={u.id} style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.name}>{u.name}</Text>
            <Text style={styles.code}>{u.employeeCode}</Text>
            {savingId === u.id ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </View>

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
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
