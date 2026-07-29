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
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { colors } from "../theme";
import { Branch } from "../types";

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function WorkLogFormScreen() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<number | undefined>(undefined);
  const [workDate, setWorkDate] = useState(todayISODate());
  const [taskDescription, setTaskDescription] = useState("");
  const [hoursSpent, setHoursSpent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api
        .get<Branch[]>("/branches")
        .then((res) => setBranches(res.data))
        .catch((e) => Alert.alert("ผิดพลาด", apiErrorMessage(e)));
    }, [])
  );

  async function handleSubmit() {
    if (!workDate || !taskDescription) {
      Alert.alert("ข้อมูลไม่ครบ", "กรุณาระบุวันที่และรายละเอียดงาน");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/work-logs", {
        workDate,
        taskDescription,
        hoursSpent: hoursSpent ? Number(hoursSpent) : undefined,
        branchId,
      });
      setTaskDescription("");
      setHoursSpent("");
      setWorkDate(todayISODate());
      Alert.alert("สำเร็จ", "บันทึกข้อมูลการทำงานเรียบร้อย");
    } catch (e) {
      Alert.alert("ผิดพลาด", apiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>บันทึกข้อมูลการทำงาน</Text>

      <Text style={styles.label}>วันที่ (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={workDate} onChangeText={setWorkDate} placeholder="2026-07-29" />

      <Text style={styles.label}>รายละเอียดงาน</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={taskDescription}
        onChangeText={setTaskDescription}
        placeholder="เช่น ซ่อมเครื่องปรับอากาศ ห้อง 201"
        multiline
        numberOfLines={4}
      />

      <Text style={styles.label}>จำนวนชั่วโมง (ไม่บังคับ)</Text>
      <TextInput
        style={styles.input}
        value={hoursSpent}
        onChangeText={setHoursSpent}
        keyboardType="decimal-pad"
        placeholder="เช่น 2.5"
      />

      <Text style={styles.label}>สาขาที่เกี่ยวข้อง (ไม่บังคับ)</Text>
      <View style={styles.pickerWrapper}>
        <Picker selectedValue={branchId} onValueChange={(v) => setBranchId(v)}>
          <Picker.Item label="ไม่ระบุสาขา" value={undefined} />
          {branches.map((b) => (
            <Picker.Item key={b.id} label={`${b.name} (${b.code})`} value={b.id} />
          ))}
        </Picker>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>บันทึก</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20 },
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
  multiline: { minHeight: 90, textAlignVertical: "top" },
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
});
