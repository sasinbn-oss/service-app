import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { showAlert } from "../utils/alert";
import { Picker } from "@react-native-picker/picker";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { colors } from "../theme";
import { Vehicle, VehicleLog } from "../types";

export default function VehicleCheckInScreen() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeLog, setActiveLog] = useState<VehicleLog | null>(null);
  const [loading, setLoading] = useState(true);

  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [purpose, setPurpose] = useState("");
  const [destination, setDestination] = useState("");
  const [startMileage, setStartMileage] = useState("");
  const [endMileage, setEndMileage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [vehiclesRes, activeRes] = await Promise.all([
        api.get<Vehicle[]>("/vehicles?status=AVAILABLE"),
        api.get<VehicleLog | null>("/vehicle-logs/active"),
      ]);
      setVehicles(vehiclesRes.data);
      setActiveLog(activeRes.data ?? null);
      if (vehiclesRes.data.length > 0) setVehicleId(vehiclesRes.data[0].id);
    } catch (e) {
      showAlert("ผิดพลาด", apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  async function handleStart() {
    if (!vehicleId || !purpose || !startMileage) {
      showAlert("ข้อมูลไม่ครบ", "กรุณาเลือกรถ ระบุวัตถุประสงค์ และเลขไมล์เริ่มต้น");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/vehicle-logs/start", {
        vehicleId,
        purpose,
        destination: destination || undefined,
        startMileage: Number(startMileage),
      });
      setPurpose("");
      setDestination("");
      setStartMileage("");
      await loadData();
      showAlert("สำเร็จ", "บันทึกการใช้รถเรียบร้อย");
    } catch (e) {
      showAlert("ผิดพลาด", apiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEnd() {
    if (!activeLog || !endMileage) {
      showAlert("ข้อมูลไม่ครบ", "กรุณาระบุเลขไมล์สิ้นสุด");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/vehicle-logs/${activeLog.id}/end`, { endMileage: Number(endMileage) });
      setEndMileage("");
      await loadData();
      showAlert("สำเร็จ", "คืนรถเรียบร้อยแล้ว");
    } catch (e) {
      showAlert("ผิดพลาด", apiErrorMessage(e));
    } finally {
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

  if (activeLog) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>คืนรถ</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>รถที่ใช้อยู่</Text>
          <Text style={styles.cardValue}>
            {activeLog.vehicle.plateNumber} ({activeLog.vehicle.brand} {activeLog.vehicle.model})
          </Text>
          <Text style={styles.cardLabel}>วัตถุประสงค์</Text>
          <Text style={styles.cardValue}>{activeLog.purpose}</Text>
          <Text style={styles.cardLabel}>เลขไมล์เริ่มต้น</Text>
          <Text style={styles.cardValue}>{activeLog.startMileage}</Text>
        </View>

        <Text style={styles.label}>เลขไมล์สิ้นสุด</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={endMileage}
          onChangeText={setEndMileage}
          placeholder="เช่น 12550"
        />

        <TouchableOpacity style={styles.button} onPress={handleEnd} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>คืนรถ</Text>}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>ลงทะเบียนใช้รถ</Text>

      {vehicles.length === 0 ? (
        <Text style={styles.empty}>ไม่มีรถว่างให้ใช้งานในขณะนี้</Text>
      ) : (
        <>
          <Text style={styles.label}>เลือกรถ</Text>
          <View style={styles.pickerWrapper}>
            <Picker selectedValue={vehicleId} onValueChange={(v) => setVehicleId(v)}>
              {vehicles.map((v) => (
                <Picker.Item key={v.id} label={`${v.plateNumber} - ${v.brand ?? ""} ${v.model ?? ""}`} value={v.id} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>วัตถุประสงค์</Text>
          <TextInput style={styles.input} value={purpose} onChangeText={setPurpose} placeholder="เช่น ออกบริการลูกค้า" />

          <Text style={styles.label}>ปลายทาง (ไม่บังคับ)</Text>
          <TextInput style={styles.input} value={destination} onChangeText={setDestination} placeholder="เช่น สาขาเชียงใหม่" />

          <Text style={styles.label}>เลขไมล์เริ่มต้น</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={startMileage}
            onChangeText={setStartMileage}
            placeholder="เช่น 12500"
          />

          <TouchableOpacity style={styles.button} onPress={handleStart} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>เริ่มใช้รถ</Text>}
          </TouchableOpacity>
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
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 8,
  },
  cardLabel: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  cardValue: { fontSize: 16, color: colors.text, fontWeight: "600" },
});
