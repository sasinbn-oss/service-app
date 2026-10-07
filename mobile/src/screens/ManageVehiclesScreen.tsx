import React, { useCallback, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Spinner from "../components/Spinner";
import Ionicons from "@expo/vector-icons/Ionicons";
import { showAlert } from "../utils/alert";
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
      .catch((e) => showAlert("ผิดพลาด", apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadVehicles();
    }, [loadVehicles])
  );

  async function handleAdd() {
    if (!plateNumber) {
      showAlert("ข้อมูลไม่ครบ", "กรุณาระบุทะเบียนรถ");
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
      showAlert("ผิดพลาด", apiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete(vehicle: Vehicle) {
    showAlert("ยืนยันการลบ", `ต้องการลบรถทะเบียน ${vehicle.plateNumber} หรือไม่?`, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/vehicles/${vehicle.id}`);
            loadVehicles();
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
        <Text style={styles.title}>เพิ่มรถใหม่</Text>
        <TextInput style={styles.input} placeholder="ทะเบียนรถ" value={plateNumber} onChangeText={setPlateNumber} />
        <TextInput style={styles.input} placeholder="ยี่ห้อ" value={brand} onChangeText={setBrand} />
        <TextInput style={styles.input} placeholder="รุ่น" value={model} onChangeText={setModel} />
        <TouchableOpacity style={styles.button} onPress={handleAdd} disabled={submitting}>
          {submitting ? <Spinner color="#fff" /> : <Text style={styles.buttonText}>เพิ่มรถ</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <Spinner style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={vehicles}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.vicon}>
                <Ionicons name="car-outline" size={22} color={colors.primaryInk} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.plate}>{item.plateNumber}</Text>
                <Text style={styles.line}>
                  {item.brand ?? ""} {item.model ?? ""}
                </Text>
              </View>
              <VehicleStatusBadge status={item.status} />
              <TouchableOpacity
                style={styles.deleteBtn}
                accessibilityLabel={`ลบ ${item.plateNumber}`}
                onPress={() => handleDelete(item)}
              >
                <Ionicons name="trash-outline" size={18} color={colors.dangerInk} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

/**
 * สถานะรถเป็นป้ายสีตามความหมายแบบ OTTERI — เดิมขึ้นเป็นรหัสอังกฤษ (AVAILABLE)
 * ซึ่งแอดมินต้องแปลในหัวเอง
 */
const VEHICLE_STATUS: Record<string, { label: string; fg: string; bg: string; dot: string }> = {
  AVAILABLE: { label: "ว่างพร้อมใช้", fg: colors.successInk, bg: colors.successSoft, dot: colors.success },
  IN_USE: { label: "กำลังใช้งาน", fg: colors.primaryInk, bg: colors.primarySoft, dot: colors.primary },
  MAINTENANCE: { label: "ซ่อมบำรุง", fg: colors.warningInk, bg: colors.warningSoft, dot: colors.warning },
};

function VehicleStatusBadge({ status }: { status: string }) {
  const t = VEHICLE_STATUS[status] ?? { label: status, fg: colors.textMuted, bg: colors.tile, dot: colors.textFaint };
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <View style={[styles.badgeDot, { backgroundColor: t.dot }]} />
      <Text style={[styles.badgeText, { color: t.fg }]}>{t.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  vicon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999 },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 12, lineHeight: 20, fontWeight: "700" },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dangerSoft,
  },
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
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  plate: { fontSize: 15, fontWeight: "700", color: colors.text },
  line: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  delete: { color: colors.danger, fontWeight: "600" },
});
