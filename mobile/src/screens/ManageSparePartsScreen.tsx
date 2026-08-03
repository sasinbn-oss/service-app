import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { showAlert } from "../utils/alert";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { colors } from "../theme";
import { SparePart } from "../types";

const emptyForm = { partCode: "", name: "", brand: "", category: "", description: "" };

export default function ManageSparePartsScreen() {
  const [parts, setParts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingId, setUploadingId] = useState<number | null>(null);

  const loadParts = useCallback(() => {
    setLoading(true);
    api
      .get<SparePart[]>("/spare-parts")
      .then((res) => setParts(res.data))
      .catch((e) => showAlert("ผิดพลาด", apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadParts();
    }, [loadParts])
  );

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(part: SparePart) {
    setEditingId(part.id);
    setForm({
      partCode: part.partCode,
      name: part.name,
      brand: part.brand ?? "",
      category: part.category ?? "",
      description: part.description ?? "",
    });
  }

  async function handleSubmit() {
    if (!form.partCode || !form.name) {
      showAlert("ข้อมูลไม่ครบ", "กรุณาระบุรหัสสินค้าและชื่ออะไหล่");
      return;
    }
    setSubmitting(true);
    const payload = {
      partCode: form.partCode,
      name: form.name,
      brand: form.brand || undefined,
      category: form.category || undefined,
      description: form.description || undefined,
    };
    try {
      if (editingId) {
        await api.put(`/spare-parts/${editingId}`, payload);
      } else {
        await api.post("/spare-parts", payload);
      }
      resetForm();
      loadParts();
      showAlert("สำเร็จ", editingId ? "แก้ไขข้อมูลเรียบร้อย" : "เพิ่มอะไหล่เรียบร้อย");
    } catch (e) {
      showAlert("ผิดพลาด", apiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePickImage(part: SparePart) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert("ต้องการสิทธิ์", "กรุณาอนุญาตให้แอปเข้าถึงคลังรูปภาพ");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      allowsEditing: true,
    });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    setUploadingId(part.id);
    try {
      const formData = new FormData();
      formData.append("image", {
        uri: asset.uri,
        name: asset.fileName ?? `part-${part.id}.jpg`,
        type: asset.mimeType ?? "image/jpeg",
      } as unknown as Blob);

      await api.post(`/spare-parts/${part.id}/image`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      loadParts();
      showAlert("สำเร็จ", "อัปโหลดรูปภาพเรียบร้อย");
    } catch (e) {
      showAlert("ผิดพลาด", apiErrorMessage(e));
    } finally {
      setUploadingId(null);
    }
  }

  function handleDelete(part: SparePart) {
    showAlert("ยืนยันการลบ", `ต้องการลบอะไหล่ "${part.name}" หรือไม่?`, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/spare-parts/${part.id}`);
            if (editingId === part.id) resetForm();
            loadParts();
          } catch (e) {
            showAlert("ผิดพลาด", apiErrorMessage(e));
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.form}>
        <Text style={styles.formTitle}>{editingId ? "แก้ไขอะไหล่" : "เพิ่มอะไหล่ใหม่"}</Text>
        <TextInput
          style={styles.input}
          placeholder="รหัสสินค้า"
          value={form.partCode}
          onChangeText={(v) => setForm({ ...form, partCode: v })}
          autoCapitalize="characters"
        />
        <TextInput
          style={styles.input}
          placeholder="ชื่ออะไหล่"
          value={form.name}
          onChangeText={(v) => setForm({ ...form, name: v })}
        />
        <TextInput
          style={styles.input}
          placeholder="ยี่ห้อ"
          value={form.brand}
          onChangeText={(v) => setForm({ ...form, brand: v })}
        />
        <TextInput
          style={styles.input}
          placeholder="หมวดหมู่ (ไม่บังคับ)"
          value={form.category}
          onChangeText={(v) => setForm({ ...form, category: v })}
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="รายละเอียด (ไม่บังคับ)"
          value={form.description}
          onChangeText={(v) => setForm({ ...form, description: v })}
          multiline
        />
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{editingId ? "บันทึกการแก้ไข" : "เพิ่มอะไหล่"}</Text>
            )}
          </TouchableOpacity>
          {editingId && (
            <TouchableOpacity style={styles.cancelButton} onPress={resetForm}>
              <Text style={styles.cancelText}>ยกเลิก</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.hint}>
          เพิ่มอะไหล่ก่อน แล้วจึงกด "เลือกรูป" ที่รายการด้านล่างเพื่ออัปโหลดรูปภาพ
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          scrollEnabled={false}
          contentContainerStyle={styles.listContent}
          data={parts}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีอะไหล่ในระบบ</Text>}
          renderItem={({ item }) => {
            const uri = resolveImageUrl(item.imageUrl);
            return (
              <View style={styles.card}>
                {uri ? (
                  <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder]}>
                    <Text style={styles.thumbPlaceholderText}>ไม่มีรูป</Text>
                  </View>
                )}
                <View style={styles.info}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>
                    {item.partCode}
                    {item.brand ? ` · ${item.brand}` : ""}
                  </Text>
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      onPress={() => handlePickImage(item)}
                      disabled={uploadingId === item.id}
                    >
                      {uploadingId === item.id ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Text style={styles.action}>เลือกรูป</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => startEdit(item)}>
                      <Text style={styles.action}>แก้ไข</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item)}>
                      <Text style={styles.delete}>ลบ</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
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
  multiline: { minHeight: 70, textAlignVertical: "top" },
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
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 10 },
  loader: { marginTop: 30 },
  listContent: { padding: 16 },
  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.background },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbPlaceholderText: { fontSize: 10, color: colors.textMuted },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  actionRow: { flexDirection: "row", gap: 16, marginTop: 8 },
  action: { color: colors.primary, fontWeight: "600", fontSize: 13 },
  delete: { color: colors.danger, fontWeight: "600", fontSize: 13 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 20 },
});
