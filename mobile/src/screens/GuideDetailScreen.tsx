import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage } from "../api/client";
import { colors } from "../theme";
import { TroubleshootingGuide } from "../types";
import { MainStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<MainStackParamList, "GuideDetail">;

export default function GuideDetailScreen({ route }: Props) {
  const { id } = route.params;
  const [guide, setGuide] = useState<TroubleshootingGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<TroubleshootingGuide>(`/guides/${id}`)
      .then((res) => setGuide(res.data))
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

  if (error || !guide) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "ไม่พบข้อมูล"}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.category}>{guide.category}</Text>
      <Text style={styles.title}>{guide.title}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>อาการที่พบ</Text>
        <Text style={styles.body}>{guide.symptom}</Text>
      </View>

      <View style={[styles.section, styles.solutionSection]}>
        <Text style={styles.sectionLabel}>วิธีแก้ไข</Text>
        <Text style={styles.body}>{guide.solution}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  category: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  title: { fontSize: 22, fontWeight: "700", color: colors.text, marginTop: 4, marginBottom: 20 },
  section: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  solutionSection: { borderColor: colors.success },
  sectionLabel: { fontSize: 13, color: colors.textMuted, fontWeight: "600", marginBottom: 8 },
  body: { fontSize: 15, color: colors.text, lineHeight: 24 },
  error: { color: colors.danger },
});
