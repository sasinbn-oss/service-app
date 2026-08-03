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
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { colors } from "../theme";
import { ConsumableItem } from "../types";
import { HomeStackParamList, MainTabParamList } from "../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "ConsumableRequest">;

export default function ConsumableRequestScreen({ navigation }: Props) {
  const [items, setItems] = useState<ConsumableItem[]>([]);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      api
        .get<ConsumableItem[]>("/consumables")
        .then((res) => setItems(res.data))
        .catch((e) => showAlert("ผิดพลาด", apiErrorMessage(e)))
        .finally(() => setLoading(false));
    }, [])
  );

  function setQuantity(itemId: number, value: string) {
    const digitsOnly = value.replace(/[^0-9]/g, "");
    setQuantities((prev) => ({ ...prev, [itemId]: digitsOnly }));
  }

  const selectedLines = Object.entries(quantities)
    .map(([itemId, qty]) => ({ itemId: Number(itemId), quantity: Number(qty) }))
    .filter((line) => line.quantity > 0);

  // The history lives in a sibling tab, so the jump goes through the tab navigator.
  function goToHistory() {
    navigation
      .getParent<BottomTabNavigationProp<MainTabParamList>>()
      ?.navigate("HistoryTab", { screen: "MyConsumableRequests" } as never);
  }

  async function handleSubmit() {
    if (selectedLines.length === 0) {
      showAlert("ยังไม่ได้เลือกของ", "กรุณาระบุจำนวนของอย่างน้อย 1 รายการ");
      return;
    }

    const overStock = selectedLines.filter((line) => {
      const item = items.find((i) => i.id === line.itemId);
      return item ? line.quantity > item.stockQty : false;
    });
    if (overStock.length > 0) {
      const names = overStock
        .map((line) => items.find((i) => i.id === line.itemId)?.name)
        .filter(Boolean)
        .join(", ");
      showAlert("จำนวนเกินสต็อก", `ของคงเหลือไม่พอสำหรับ: ${names}`);
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/consumable-requests", {
        note: note || undefined,
        items: selectedLines,
      });
      setQuantities({});
      setNote("");
      showAlert("ส่งคำขอแล้ว", "รอหัวหน้าอนุมัติ สามารถติดตามสถานะได้ที่หน้าประวัติการเบิก", [
        { text: "ดูสถานะ", onPress: goToHistory },
        { text: "ตกลง" },
      ]);
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

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={items}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <Text style={styles.heading}>ระบุจำนวนของที่ต้องการเบิก</Text>
        }
        ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีรายการของในระบบ</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={[styles.stock, item.stockQty === 0 && styles.stockOut]}>
                คงเหลือ {item.stockQty} {item.unit}
              </Text>
            </View>
            <TextInput
              style={styles.qtyInput}
              keyboardType="number-pad"
              placeholder="0"
              value={quantities[item.id] ?? ""}
              onChangeText={(v) => setQuantity(item.id, v)}
              editable={item.stockQty > 0}
            />
          </View>
        )}
        ListFooterComponent={
          items.length > 0 ? (
            <View style={styles.footer}>
              <Text style={styles.label}>หมายเหตุ (ไม่บังคับ)</Text>
              <TextInput
                style={styles.noteInput}
                placeholder="เช่น ใช้งานที่สาขาเชียงใหม่"
                value={note}
                onChangeText={setNote}
                multiline
              />
              <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>
                    ส่งคำขอเบิก{selectedLines.length > 0 ? ` (${selectedLines.length} รายการ)` : ""}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { padding: 16 },
  heading: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: "600", color: colors.text },
  stock: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  stockOut: { color: colors.danger },
  qtyInput: {
    width: 64,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    textAlign: "center",
    fontSize: 16,
    backgroundColor: "#fff",
  },
  footer: { marginTop: 8 },
  label: { fontSize: 14, color: colors.textMuted, marginBottom: 6 },
  noteInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    minHeight: 70,
    textAlignVertical: "top",
    fontSize: 15,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
