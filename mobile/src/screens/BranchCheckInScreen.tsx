import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import * as Location from "expo-location";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { colors } from "../theme";
import { Branch, BranchCheckIn } from "../types";

export default function BranchCheckInScreen() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BranchCheckIn | null>(null);

  useFocusEffect(
    useCallback(() => {
      setResult(null);
      setLoading(true);
      api
        .get<Branch[]>("/branches")
        .then((res) => {
          setBranches(res.data);
          if (res.data.length > 0) setBranchId(res.data[0].id);
        })
        .catch((e) => Alert.alert("ผิดพลาด", apiErrorMessage(e)))
        .finally(() => setLoading(false));
    }, [])
  );

  async function handleCheckIn() {
    if (!branchId) {
      Alert.alert("ข้อมูลไม่ครบ", "กรุณาเลือกสาขา");
      return;
    }
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("ต้องการสิทธิ์ตำแหน่ง", "กรุณาอนุญาตให้แอปเข้าถึงตำแหน่ง GPS เพื่อรายงานตัว");
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocating(false);
      setSubmitting(true);
      const { data } = await api.post<BranchCheckIn>("/branch-checkins", {
        branchId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        note: note || undefined,
      });
      setResult(data);
      setNote("");
    } catch (e) {
      Alert.alert("ผิดพลาด", apiErrorMessage(e));
    } finally {
      setLocating(false);
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>รายงานตัวเข้าสาขา</Text>

      {branches.length === 0 ? (
        <Text style={styles.empty}>ยังไม่มีข้อมูลสาขา</Text>
      ) : (
        <>
          <Text style={styles.label}>เลือกสาขา</Text>
          <View style={styles.pickerWrapper}>
            <Picker selectedValue={branchId} onValueChange={(v) => setBranchId(v)}>
              {branches.map((b) => (
                <Picker.Item key={b.id} label={`${b.name} (${b.code})`} value={b.id} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>หมายเหตุ (ไม่บังคับ)</Text>
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="เช่น เข้างานกะเช้า" />

          <TouchableOpacity style={styles.button} onPress={handleCheckIn} disabled={locating || submitting}>
            {locating || submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>รายงานตัว (ใช้ GPS ปัจจุบัน)</Text>
            )}
          </TouchableOpacity>

          {result && (
            <View
              style={[
                styles.resultCard,
                result.withinRadius ? styles.resultSuccess : styles.resultWarning,
              ]}
            >
              <Text style={styles.resultTitle}>
                {result.withinRadius ? "รายงานตัวสำเร็จ อยู่ในระยะสาขา" : "รายงานตัวสำเร็จ แต่อยู่นอกระยะสาขา"}
              </Text>
              <Text style={styles.resultLine}>สาขา: {result.branch.name}</Text>
              <Text style={styles.resultLine}>ระยะห่าง: {Math.round(result.distanceMeters)} เมตร</Text>
              <Text style={styles.resultLine}>เวลา: {new Date(result.checkedInAt).toLocaleString("th-TH")}</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: 16 },
  label: { fontSize: 14, color: colors.textMuted, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  pickerWrapper: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 24,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 40 },
  resultCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    marginTop: 20,
  },
  resultSuccess: { backgroundColor: "#dcfce7", borderColor: "#86efac" },
  resultWarning: { backgroundColor: "#fef3c7", borderColor: "#fcd34d" },
  resultTitle: { fontWeight: "700", fontSize: 15, color: colors.text, marginBottom: 6 },
  resultLine: { fontSize: 13, color: colors.text, marginTop: 2 },
});
