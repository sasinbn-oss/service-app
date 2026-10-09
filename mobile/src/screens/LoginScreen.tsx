import React, { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import { useAuth } from "../context/AuthContext";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radius, shadow, headingFont } from "../theme";
import { showAlert } from "../utils/alert";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AuthStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [employeeCode, setEmployeeCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setError(null);
    if (!employeeCode || !password) {
      setError("กรุณากรอกรหัสพนักงานและรหัสผ่าน");
      return;
    }
    setSubmitting(true);
    try {
      await login(employeeCode.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* ฟองจาง ๆ ตามหน้าเข้าสู่ระบบของ OTTERI — ตกแต่งอย่างเดียว ไม่รับการแตะ */}
      <View pointerEvents="none" style={[styles.bubble, { width: 70, height: 70, top: "8%", left: "18%" }]} />
      <View pointerEvents="none" style={[styles.bubble, { width: 26, height: 26, top: "12%", left: "62%" }]} />
      <View pointerEvents="none" style={[styles.bubble, { width: 48, height: 48, bottom: "10%", right: "12%" }]} />

      <View style={styles.card}>
        <View style={styles.logoWrap}>
          <Image source={require("../../assets/logo-otter.png")} style={styles.logo} />
        </View>
        <View style={styles.titleRow}>
          <Text style={[styles.title, headingFont]}>OTTERI</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>SERVICE</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>ระบบงานช่างซ่อม</Text>

        <Text style={styles.label}>รหัสพนักงาน</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="person-outline" size={20} color={colors.textFaint} />
          <TextInput
            style={styles.input}
            placeholder="รหัสพนักงาน"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            value={employeeCode}
            onChangeText={setEmployeeCode}
          />
        </View>

        <Text style={styles.label}>รหัสผ่าน</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="key-outline" size={20} color={colors.textFaint} />
          <TextInput
            style={styles.input}
            placeholder="รหัสผ่าน"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
          />
        </View>

        {/*
          ไม่มีหน้ากู้รหัสเอง เพราะบัญชีทั้งหมดแอดมินเป็นคนสร้าง — บอกทางที่ใช้ได้จริง
          ดีกว่าปล่อยให้คนลืมรหัสไปหาปุ่มที่ไม่มี
        */}
        <TouchableOpacity
          style={styles.forgot}
          onPress={() =>
            showAlert(
              "ลืมรหัสผ่าน",
              "ให้แอดมินกด \"ตั้งรหัสผ่านใหม่ให้\" ที่บัญชีของคุณ แล้วเข้าระบบด้วยรหัสนั้น ระบบจะให้ตั้งรหัสของตัวเองอีกครั้ง"
            )
          }
        >
          <Text style={styles.forgotText}>ลืมรหัสผ่าน?</Text>
        </TouchableOpacity>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonBusy]}
          onPress={handleLogin}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Spinner color="#fff" />
              <Text style={styles.buttonText}>กำลังเข้าสู่ระบบ...</Text>
            </>
          ) : (
            <>
              <Ionicons name="key-outline" size={20} color="#fff" />
              <Text style={styles.buttonText}>เข้าสู่ระบบ</Text>
            </>
          )}
        </TouchableOpacity>

        {/*
          สมัครเองได้เฉพาะผู้ใช้คนแรกของระบบ ที่เหลือแอดมินเป็นคนสร้างให้
          ลิงก์ยังอยู่เพื่อให้ตั้งแอดมินคนแรกได้ตอนติดตั้งใหม่ แต่เขียนให้ตรงว่าใช้เมื่อไหร่
        */}
        <TouchableOpacity onPress={() => navigation.navigate("Register")}>
          <Text style={styles.link}>ตั้งแอดมินคนแรก (ใช้ตอนติดตั้งระบบครั้งแรกเท่านั้น)</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    backgroundColor: colors.primarySoft,
    overflow: "hidden",
  },
  bubble: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(0,159,227,0.18)",
  },
  card: {
    width: "100%",
    maxWidth: 430,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 24,
    paddingVertical: 28,
    ...shadow.raised,
  },
  logoWrap: {
    alignSelf: "center",
    width: 84,
    height: 84,
    borderRadius: 24,
    padding: 8,
    backgroundColor: colors.card,
    marginBottom: 12,
    ...shadow.raised,
  },
  logo: { width: "100%", height: "100%", borderRadius: 16 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  title: { fontSize: 26, lineHeight: 34, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  pill: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 10 },
  pillText: { color: "#fff", fontSize: 12, lineHeight: 22, fontWeight: "800", letterSpacing: 0.6 },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 2,
    marginBottom: 22,
  },
  label: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.body, marginBottom: 6 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    backgroundColor: colors.card,
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 16, color: colors.text },
  forgot: { alignSelf: "flex-end", marginTop: -4, marginBottom: 14 },
  forgotText: { color: colors.primaryInk, fontWeight: "700", fontSize: 14, lineHeight: 22 },
  button: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.primary,
    borderRadius: 14,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.raised,
  },
  buttonBusy: { opacity: 0.75 },
  buttonText: { color: "#fff", fontSize: 16, lineHeight: 24, fontWeight: "700" },
  link: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 18,
  },
  error: {
    color: colors.dangerInk,
    backgroundColor: colors.dangerSoft,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
});
