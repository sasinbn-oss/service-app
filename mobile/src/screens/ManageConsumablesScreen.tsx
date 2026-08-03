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
import { ConsumableItem } from "../types";

const emptyForm = { name: "", unit: "", stockQty: "" };

export default function ManageConsumablesScreen() {
  const [items, setItems] = useState<ConsumableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadItems = useCallback(() => {
    setLoading(true);
    api
      .get<ConsumableItem[]>("/consumables")
      .then((res) => setItems(res.data))
      .catch((e) => Alert.alert("ผิดพลาด", apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(item: ConsumableItem) {
    setEditingId(item.id);
    setForm({ name: item.name, unit: item.unit, stockQty: String(item.stockQty) });
  }

  async function handleSubmit() {
    if (!form.name) {
      Alert.alert("ข้อมูลไม่ครบ", "กรุณาระบุชื่อของ");
      return;
    }
    setSubmitting(true);
    const payload = {
      name: form.name,
      unit: form.unit || undefined,
      stockQty: form.stockQty ? Number(form.stockQty) : undefined,
    };
    try {
      if (editingId) {
        await api.put(`/consumables/${editingId}`, payload);
      } else {
        await api.post("/consumables", payload);
      }
      resetForm();
      loadItems();
    } catch (e) {
      Alert.alert("ผิดพลาด", apiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete(item: ConsumableItem) {
    Alert.alert("ยืนยันการลบ", `ต้องการลบ "${item.name}" หรือไม่?`, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/consumables/${item.id}`);
            if (editingId === item.id) resetForm();
            loadItems();
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
        <Text style={styles.formTitle}>{editingId ? "แก้ไขรายการ" : "เพิ่มของใช้สิ้นเปลือง"}</Text>
        <TextInput
          style={styles.input}
          placeholder="ชื่อของ (เช่น เทปพันสายไฟ)"
          value={form.name}
          onChangeText={(v) => setForm({ ...form, name: v })}
        />
        <TextInput
          style={styles.input}
          placeholder="หน่วยนับ (เช่น ม้วน, ตัว, คู่)"
          value={form.unit}
          onChangeText={(v) => setForm({ ...form, unit: v })}
        />
        <TextInput
          style={styles.input}
          placeholder="จำนวนคงเหลือ"
          keyboardType="number-pad"
          value={form.stockQty}
          onChangeText={(v) => setForm({ ...form, stockQty: v.replace(/[^0-9]/g, "") })}
        />
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{editingId ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}</Text>
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
          data={items}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีรายการของในระบบ</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={[styles.stock, item.stockQty === 0 && styles.stockOut]}>
                  คงเหลือ {item.stockQty} {item.unit}
                </Text>
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
  name: { fontSize: 15, fontWeight: "600", color: colors.text },
  stock: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  stockOut: { color: colors.danger },
  edit: { color: colors.primary, fontWeight: "600" },
  delete: { color: colors.danger, fontWeight: "600" },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 20 },
});
