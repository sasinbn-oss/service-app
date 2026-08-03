import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { colors } from "../theme";
import { TroubleshootingGuide } from "../types";

const emptyForm = { category: "", title: "", symptom: "", solution: "" };

export default function ManageGuidesScreen() {
  const [guides, setGuides] = useState<TroubleshootingGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadGuides = useCallback(() => {
    setLoading(true);
    api
      .get<TroubleshootingGuide[]>("/guides")
      .then((res) => setGuides(res.data))
      .catch((e) => Alert.alert("ผิดพลาด", apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadGuides();
    }, [loadGuides])
  );

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(guide: TroubleshootingGuide) {
    setEditingId(guide.id);
    setForm({
      category: guide.category,
      title: guide.title,
      symptom: guide.symptom,
      solution: guide.solution,
    });
  }

  async function handleSubmit() {
    if (!form.category || !form.title || !form.symptom || !form.solution) {
      Alert.alert("ข้อมูลไม่ครบ", "กรุณากรอกข้อมูลให้ครบทุกช่อง");
      return;
    }
    setSubmitting(true);
    try {
      if (editingId) {
        await api.put(`/guides/${editingId}`, form);
      } else {
        await api.post("/guides", form);
      }
      resetForm();
      loadGuides();
      Alert.alert("สำเร็จ", editingId ? "แก้ไขข้อมูลเรียบร้อย" : "เพิ่มหัวข้อเรียบร้อย");
    } catch (e) {
      Alert.alert("ผิดพลาด", apiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete(guide: TroubleshootingGuide) {
    Alert.alert("ยืนยันการลบ", `ต้องการลบหัวข้อ "${guide.title}" หรือไม่?`, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/guides/${guide.id}`);
            if (editingId === guide.id) resetForm();
            loadGuides();
          } catch (e) {
            Alert.alert("ผิดพลาด", apiErrorMessage(e));
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.form}>
        <Text style={styles.formTitle}>
          {editingId ? "แก้ไขหัวข้อ" : "เพิ่มหัวข้อใหม่"}
        </Text>
        <TextInput
          style={styles.input}
          placeholder="หมวดหมู่ (เช่น เครื่องปรับอากาศ)"
          value={form.category}
          onChangeText={(v) => setForm({ ...form, category: v })}
        />
        <TextInput
          style={styles.input}
          placeholder="ชื่อหัวข้อ"
          value={form.title}
          onChangeText={(v) => setForm({ ...form, title: v })}
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="อาการที่พบ"
          value={form.symptom}
          onChangeText={(v) => setForm({ ...form, symptom: v })}
          multiline
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="วิธีแก้ไข (ขึ้นบรรทัดใหม่ได้)"
          value={form.solution}
          onChangeText={(v) => setForm({ ...form, solution: v })}
          multiline
        />
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{editingId ? "บันทึกการแก้ไข" : "เพิ่มหัวข้อ"}</Text>
            )}
          </TouchableOpacity>
          {editingId && (
            <TouchableOpacity style={styles.cancelButton} onPress={resetForm}>
              <Text style={styles.cancelText}>ยกเลิก</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          scrollEnabled={false}
          contentContainerStyle={styles.listContent}
          data={guides}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีหัวข้อในระบบ</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.category}>{item.category}</Text>
                <Text style={styles.title}>{item.title}</Text>
              </View>
              <TouchableOpacity onPress={() => startEdit(item)}>
                <Text style={styles.edit}>แก้ไข</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item)}>
                <Text style={styles.delete}>ลบ</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 32 },
  form: { padding: 20, backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.border },
  formTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 10 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    fontSize: 15,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  button: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  cancelButton: {
    paddingHorizontal: 16,
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: { color: colors.textMuted, fontWeight: "600" },
  loader: { marginTop: 30 },
  listContent: { padding: 16 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  category: { fontSize: 11, color: colors.primary, fontWeight: "600" },
  title: { fontSize: 15, fontWeight: "600", color: colors.text, marginTop: 2 },
  edit: { color: colors.primary, fontWeight: "600" },
  delete: { color: colors.danger, fontWeight: "600" },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 20 },
});
