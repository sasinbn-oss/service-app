import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { colors } from "../theme";
import { SparePart } from "../types";
import { MainStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<MainStackParamList, "SparePartDetail">;

export default function SparePartDetailScreen({ route }: Props) {
  const { id } = route.params;
  const [part, setPart] = useState<SparePart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<SparePart>(`/spare-parts/${id}`)
      .then((res) => setPart(res.data))
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !part) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "ไม่พบข้อมูล"}</Text>
      </View>
    );
  }

  const uri = resolveImageUrl(part.imageUrl);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {uri ? (
        <Image source={{ uri }} style={styles.image} resizeMode="contain" />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={styles.placeholderText}>ไม่มีรูปภาพ</Text>
        </View>
      )}

      <Text style={styles.name}>{part.name}</Text>

      <View style={styles.card}>
        <Row label="รหัสสินค้า" value={part.partCode} />
        <Row label="ยี่ห้อ" value={part.brand ?? "-"} />
      </View>

      {part.description ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>รายละเอียด</Text>
          <Text style={styles.body}>{part.description}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  image: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    backgroundColor: colors.card,
    marginBottom: 16,
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholderText: { color: colors.textMuted },
  name: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  rowLabel: { fontSize: 14, color: colors.textMuted },
  rowValue: { fontSize: 15, color: colors.text, fontWeight: "600" },
  sectionLabel: { fontSize: 13, color: colors.textMuted, fontWeight: "600", marginBottom: 8 },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  error: { color: colors.danger },
});
