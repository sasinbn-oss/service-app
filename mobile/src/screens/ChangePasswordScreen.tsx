/**
 * เปลี่ยนรหัสผ่านของตัวเอง
 *
 * ใช้สองแบบจากหน้าจอเดียวกัน — บังคับเปลี่ยนตอนเข้าครั้งแรกหลังแอดมินสร้างบัญชีให้
 * (forced) กับเปลี่ยนเองเมื่อไหร่ก็ได้จากเมนู
 *
 * ตอนบังคับจะไม่มีทางออกจากหน้านี้นอกจากเปลี่ยนรหัสหรือออกจากระบบ เพราะรหัสตั้งต้น
 * ผ่านมือแอดมินมาแล้ว ปล่อยให้ใช้งานต่อทั้งที่คนอื่นรู้รหัสไม่ได้
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { useAuth } from "../context/AuthContext";
import { colors, radius, shadow, spacing } from "../theme";

const MIN_PASSWORD = 8;

export default function ChangePasswordScreen({
  forced = false,
  onDone,
}: {
  forced?: boolean;
  onDone?: () => void;
}) {
  const { user, logout, applyNewToken } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && next !== confirm;
  const sameAsOld = next.length > 0 && next === current;
  const ready =
    current.length > 0 && next.length >= MIN_PASSWORD && next === confirm && !sameAsOld;

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post<{ token: string }>("/auth/change-password", {
        currentPassword: current,
        newPassword: next,
      });
      // โทเคนเดิมยังพกธง "ต้องเปลี่ยนรหัส" อยู่ ต้องเปลี่ยนไปใช้ใบใหม่ทันที
      await applyNewToken(data.token);
      showAlert("เปลี่ยนรหัสผ่านแล้ว", "ครั้งต่อไปเข้าระบบด้วยรหัสใหม่");
      setCurrent("");
      setNext("");
      setConfirm("");
      onDone?.();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        {forced ? (
          <View style={styles.notice}>
            <Ionicons name="key-outline" size={18} color={colors.warning} />
            <View style={styles.noticeBody}>
              <Text style={styles.noticeTitle}>ตั้งรหัสผ่านของคุณเองก่อน</Text>
              <Text style={styles.noticeText}>
                รหัสที่ใช้เข้ามาตอนนี้เป็นรหัสตั้งต้นที่แอดมินตั้งให้ ซึ่งมีคนอื่นรู้ด้วย
                ตั้งรหัสใหม่ก่อนจึงจะเริ่มใช้งานได้
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.who}>
          {user?.name} · {user?.employeeCode}
        </Text>

        <Text style={styles.label}>รหัสผ่านปัจจุบัน</Text>
        <TextInput
          style={styles.input}
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoCapitalize="none"
          placeholder={forced ? "รหัสตั้งต้นที่แอดมินให้มา" : "รหัสที่ใช้อยู่"}
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="รหัสผ่านปัจจุบัน"
        />

        <Text style={styles.label}>รหัสผ่านใหม่</Text>
        <TextInput
          style={[styles.input, tooShort && styles.inputBad]}
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoCapitalize="none"
          placeholder={`อย่างน้อย ${MIN_PASSWORD} ตัว`}
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="รหัสผ่านใหม่"
        />
        {tooShort ? (
          <Text style={styles.fieldError}>ต้องยาวอย่างน้อย {MIN_PASSWORD} ตัว</Text>
        ) : sameAsOld ? (
          <Text style={styles.fieldError}>รหัสใหม่ต้องไม่ซ้ำกับรหัสเดิม</Text>
        ) : null}

        <Text style={styles.label}>พิมพ์รหัสใหม่อีกครั้ง</Text>
        <TextInput
          style={[styles.input, mismatch && styles.inputBad]}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
          placeholder="ยืนยันรหัสใหม่"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="พิมพ์รหัสใหม่อีกครั้ง"
        />
        {mismatch ? <Text style={styles.fieldError}>สองช่องไม่ตรงกัน</Text> : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.submit, (!ready || saving) && styles.submitOff]}
          onPress={submit}
          disabled={!ready || saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>บันทึกรหัสใหม่</Text>
          )}
        </TouchableOpacity>

        {forced ? (
          <TouchableOpacity style={styles.logout} onPress={logout} activeOpacity={0.7}>
            <Text style={styles.logoutText}>ออกจากระบบ</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    ...shadow.card,
  },
  notice: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noticeBody: { flex: 1, minWidth: 0 },
  noticeTitle: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.warning },
  noticeText: { fontSize: 12, lineHeight: 20, color: colors.warning, marginTop: 2 },
  who: { fontSize: 13, lineHeight: 21, color: colors.textMuted },
  label: {
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
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
  inputBad: { borderColor: colors.danger },
  fieldError: { fontSize: 12, lineHeight: 20, color: colors.danger, marginTop: spacing.xs },
  error: { fontSize: 13, lineHeight: 21, color: colors.danger, marginTop: spacing.lg },
  submit: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
  },
  submitOff: { opacity: 0.5 },
  submitText: { color: "#fff", fontSize: 15, lineHeight: 24, fontWeight: "700" },
  logout: { alignItems: "center", paddingVertical: spacing.md, marginTop: spacing.sm },
  logoutText: { fontSize: 13, lineHeight: 21, color: colors.danger, fontWeight: "600" },
});
