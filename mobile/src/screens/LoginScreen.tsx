import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";
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
      <Text style={styles.title}>Service App</Text>
      <Text style={styles.subtitle}>เข้าสู่ระบบเพื่อเริ่มใช้งาน</Text>

      <TextInput
        style={styles.input}
        placeholder="รหัสพนักงาน"
        autoCapitalize="none"
        value={employeeCode}
        onChangeText={setEmployeeCode}
      />
      <TextInput
        style={styles.input}
        placeholder="รหัสผ่าน"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>เข้าสู่ระบบ</Text>
        )}
      </TouchableOpacity>

      {/*
        สมัครเองได้เฉพาะผู้ใช้คนแรกของระบบ ที่เหลือแอดมินเป็นคนสร้างให้
        ลิงก์ยังอยู่เพื่อให้ตั้งแอดมินคนแรกได้ตอนติดตั้งใหม่ แต่เขียนให้ตรงว่าใช้เมื่อไหร่
      */}
      <TouchableOpacity onPress={() => navigation.navigate("Register")}>
        <Text style={styles.link}>ตั้งแอดมินคนแรก (ใช้ตอนติดตั้งระบบครั้งแรกเท่านั้น)</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 32,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  link: {
    color: colors.primary,
    textAlign: "center",
    marginTop: 20,
  },
  error: {
    color: colors.danger,
    marginBottom: 8,
    textAlign: "center",
  },
});
