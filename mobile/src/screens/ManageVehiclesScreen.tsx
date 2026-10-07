import React, { useCallback, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Spinner from "../components/Spinner";
import AppModal from "../components/AppModal";
import Ionicons from "@expo/vector-icons/Ionicons";
import { showAlert } from "../utils/alert";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { colors, shadow, spacing } from "../theme";
import { Vehicle } from "../types";

export default function ManageVehiclesScreen() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  // จอแคบ (มือถือ) ป้ายสถานะ + ปุ่มแก้ไข + ปุ่มลบ กินที่จนทะเบียนรถถูกบีบเหลือตัวอักษรละบรรทัด
  // จึงย้ายป้ายลงไปใต้ทะเบียน และปุ่มแก้ไขเหลือแค่ไอคอน
  const narrow = useWindowDimensions().width < 560;
  const [plateNumber, setPlateNumber] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState<string>("AVAILABLE");
  const [submitting, setSubmitting] = useState(false);
  /**
   * หน้าต่างเพิ่ม/แก้ไขรถ — null = ปิด, "new" = เพิ่ม, รถคันไหน = แก้ไขคันนั้น
   * เดิมฟอร์มเพิ่มรถค้างอยู่บนหัวหน้าตลอด กินที่ครึ่งจอบนมือถือทั้งที่นาน ๆ ใช้ที
   */
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);

  function openEditor(v: Vehicle | "new") {
    setPlateNumber(v === "new" ? "" : v.plateNumber);
    setBrand(v === "new" ? "" : v.brand ?? "");
    setModel(v === "new" ? "" : v.model ?? "");
    setStatus(v === "new" ? "AVAILABLE" : v.status);
    setEditing(v);
  }

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
      if (editing && editing !== "new") {
        await api.put(`/vehicles/${editing.id}`, {
          plateNumber,
          brand: brand || undefined,
          model: model || undefined,
          status,
        });
        showAlert("บันทึกแล้ว", `แก้ไขรถ ${plateNumber} แล้ว`);
      } else {
        await api.post("/vehicles", { plateNumber, brand: brand || undefined, model: model || undefined });
        showAlert("บันทึกแล้ว", `เพิ่มรถ ${plateNumber} แล้ว`);
      }
      setEditing(null);
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
      <View style={styles.pageHead}>
        <Text style={styles.pageTitle}>จัดการข้อมูลรถ</Text>
        {!loading ? (
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{vehicles.length} คัน</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.addBtn} onPress={() => openEditor("new")} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnText}>เพิ่มรถ</Text>
        </TouchableOpacity>
      </View>

      <AppModal
        visible={editing !== null}
        onClose={() => setEditing(null)}
        busy={submitting}
        title={editing && editing !== "new" ? `แก้ไข ${editing.plateNumber}` : "เพิ่มรถ"}
        footer={
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setEditing(null)} activeOpacity={0.7}>
              <Text style={styles.modalCancelText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalSave} onPress={handleAdd} disabled={submitting} activeOpacity={0.8}>
              {submitting ? <Spinner color="#fff" /> : <Text style={styles.modalSaveText}>บันทึก</Text>}
            </TouchableOpacity>
          </View>
        }
      >
        <Text style={styles.label}>ทะเบียนรถ <Text style={styles.req}>*</Text></Text>
        <TextInput style={styles.input} placeholder="ทะเบียนรถ" value={plateNumber} onChangeText={setPlateNumber} />
        <Text style={styles.label}>ยี่ห้อ</Text>
        <TextInput style={styles.input} placeholder="ยี่ห้อ" value={brand} onChangeText={setBrand} />
        <Text style={styles.label}>รุ่น</Text>
        <TextInput style={styles.input} placeholder="รุ่น" value={model} onChangeText={setModel} />
        {editing && editing !== "new" ? (
          <>
            <Text style={styles.label}>สถานะ</Text>
            <View style={styles.statusRow}>
              {Object.keys(VEHICLE_STATUS).map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.statusChip, status === k && styles.statusChipOn]}
                  onPress={() => setStatus(k)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.statusChipText, status === k && styles.statusChipTextOn]}>
                    {VEHICLE_STATUS[k].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
      </AppModal>

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
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.plate} numberOfLines={1}>{item.plateNumber}</Text>
                <Text style={styles.line} numberOfLines={1}>
                  {[item.brand, item.model].filter(Boolean).join(" ") || "-"}
                </Text>
                {narrow ? (
                  <View style={{ flexDirection: "row", marginTop: 6 }}>
                    <VehicleStatusBadge status={item.status} />
                  </View>
                ) : null}
              </View>
              {narrow ? null : <VehicleStatusBadge status={item.status} />}
              <TouchableOpacity
                style={[styles.editBtn, narrow && styles.iconOnly]}
                accessibilityLabel={`แก้ไข ${item.plateNumber}`}
                onPress={() => openEditor(item)}
              >
                <Ionicons name="create-outline" size={17} color={colors.primaryInk} />
                {narrow ? null : <Text style={styles.editBtnText}>แก้ไข</Text>}
              </TouchableOpacity>
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
  pageHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  pageTitle: { fontSize: 24, lineHeight: 34, fontWeight: "800", color: colors.text },
  countPill: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 12 },
  countPillText: { fontSize: 13, lineHeight: 24, fontWeight: "800", color: colors.primaryInk },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.primary,
    ...shadow.raised,
  },
  addBtnText: { color: "#fff", fontSize: 15, lineHeight: 22, fontWeight: "700" },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.sky50,
  },
  iconOnly: { width: 36, paddingHorizontal: 0, justifyContent: "center" },
  editBtnText: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.primaryInk },
  label: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.body, marginBottom: 6, marginTop: 4 },
  req: { color: colors.danger },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statusChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: colors.card,
  },
  statusChipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  statusChipText: { fontSize: 13, lineHeight: 20, fontWeight: "600", color: colors.textMuted },
  statusChipTextOn: { color: "#fff" },
  modalActions: { flex: 1, flexDirection: "row", gap: spacing.sm },
  modalCancel: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.sky50,
  },
  modalCancelText: { fontSize: 15, lineHeight: 22, color: colors.primaryInk, fontWeight: "700" },
  modalSave: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  modalSaveText: { color: "#fff", fontSize: 15, lineHeight: 22, fontWeight: "700" },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
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
});
