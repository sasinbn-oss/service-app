import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { showAlert } from "../utils/alert";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { colors } from "../theme";
import { Branch } from "../types";

export default function ManageBranchesScreen() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radiusMeters, setRadiusMeters] = useState("200");
  const [submitting, setSubmitting] = useState(false);

  const loadBranches = useCallback(() => {
    setLoading(true);
    api
      .get<Branch[]>("/branches")
      .then((res) => setBranches(res.data))
      .catch((e) => showAlert("ผิดพลาด", apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBranches();
    }, [loadBranches])
  );

  async function handleAdd() {
    if (!name || !code || !latitude || !longitude) {
      showAlert("ข้อมูลไม่ครบ", "กรุณาระบุชื่อ รหัสสาขา และพิกัด GPS");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/branches", {
        name,
        code,
        latitude: Number(latitude),
        longitude: Number(longitude),
        radiusMeters: radiusMeters ? Number(radiusMeters) : undefined,
      });
      setName("");
      setCode("");
      setLatitude("");
      setLongitude("");
      setRadiusMeters("200");
      loadBranches();
    } catch (e) {
      showAlert("ผิดพลาด", apiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete(branch: Branch) {
    showAlert("ยืนยันการลบ", `ต้องการลบสาขา ${branch.name} หรือไม่?`, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/branches/${branch.id}`);
            loadBranches();
          } catch (e) {
            showAlert("ผิดพลาด", apiErrorMessage(e));
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.title}>เพิ่มสาขาใหม่</Text>
        <TextInput style={styles.input} placeholder="ชื่อสาขา" value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="รหัสสาขา" value={code} onChangeText={setCode} autoCapitalize="characters" />
        <TextInput
          style={styles.input}
          placeholder="ละติจูด (latitude)"
          value={latitude}
          onChangeText={setLatitude}
          keyboardType="numbers-and-punctuation"
        />
        <TextInput
          style={styles.input}
          placeholder="ลองจิจูด (longitude)"
          value={longitude}
          onChangeText={setLongitude}
          keyboardType="numbers-and-punctuation"
        />
        <TextInput
          style={styles.input}
          placeholder="รัศมีที่ยอมรับ (เมตร)"
          value={radiusMeters}
          onChangeText={setRadiusMeters}
          keyboardType="number-pad"
        />
        <TouchableOpacity style={styles.button} onPress={handleAdd} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>เพิ่มสาขา</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={branches}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {item.name} ({item.code})
                </Text>
                <Text style={styles.line}>
                  {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)} · รัศมี {item.radiusMeters} ม.
                </Text>
              </View>
              <TouchableOpacity onPress={() => handleDelete(item)}>
                <Text style={styles.delete}>ลบ</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  form: { padding: 20, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  title: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 10 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  button: { backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center", marginTop: 4 },
  buttonText: { color: "#fff", fontWeight: "600" },
  loader: { marginTop: 30 },
  listContent: { padding: 16 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  line: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  delete: { color: colors.danger, fontWeight: "600" },
});
