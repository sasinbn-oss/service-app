import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { colors } from "../theme";
import { Vehicle } from "../types";

export default function ManageVehiclesScreen() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [plateNumber, setPlateNumber] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadVehicles = useCallback(() => {
    setLoading(true);
    api
      .get<Vehicle[]>("/vehicles")
      .then((res) => setVehicles(res.data))
      .catch((e) => Alert.alert("ผิดพลาด", apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadVehicles();
    }, [loadVehicles])
  );

  async function handleAdd() {
    if (!plateNumber) {
      Alert.alert("ข้อมูลไม่ครบ", "กรุณาระบุทะเบียนรถ");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/vehicles", { plateNumber, brand: brand || undefined, model: model || undefined });
      setPlateNumber("");
      setBrand("");
      setModel("");
      loadVehicles();
    } catch (e) {
      Alert.alert("ผิดพลาด", apiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete(vehicle: Vehicle) {
    Alert.alert("ยืนยันการลบ", `ต้องการลบรถทะเบียน ${vehicle.plateNumber} หรือไม่?`, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/vehicles/${vehicle.id}`);
            loadVehicles();
          } catch (e) {
            Alert.alert("ผิดพลาด", apiErrorMessage(e));
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.title}>เพิ่มรถใหม่</Text>
        <TextInput style={styles.input} placeholder="ทะเบียนรถ" value={plateNumber} onChangeText={setPlateNumber} />
        <TextInput style={styles.input} placeholder="ยี่ห้อ" value={brand} onChangeText={setBrand} />
        <TextInput style={styles.input} placeholder="รุ่น" value={model} onChangeText={setModel} />
        <TouchableOpacity style={styles.button} onPress={handleAdd} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>เพิ่มรถ</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={vehicles}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.plate}>{item.plateNumber}</Text>
                <Text style={styles.line}>
                  {item.brand ?? ""} {item.model ?? ""} · {item.status}
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
  plate: { fontSize: 15, fontWeight: "700", color: colors.text },
  line: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  delete: { color: colors.danger, fontWeight: "600" },
});
