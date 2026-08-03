import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { colors } from "../theme";
import { TroubleshootingGuide } from "../types";
import { MainStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<MainStackParamList, "GuideList">;

export default function GuideListScreen({ navigation }: Props) {
  const [guides, setGuides] = useState<TroubleshootingGuide[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (searchTerm: string, category: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (category) params.append("category", category);
      const { data } = await api.get<TroubleshootingGuide[]>(`/guides?${params.toString()}`);
      setGuides(data);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      api
        .get<string[]>("/guides/categories")
        .then((res) => setCategories(res.data))
        .catch(() => setCategories([]));
      load(search, activeCategory);
      // Reloading on focus keeps the list fresh after an admin edits a guide.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // Debounce so we don't fire a request on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => load(search, activeCategory), 300);
    return () => clearTimeout(timer);
  }, [search, activeCategory, load]);

  return (
    <View style={styles.container}>
      <View style={styles.searchWrapper}>
        <TextInput
          style={styles.search}
          placeholder="ค้นหาอาการเสีย หรือชื่อหัวข้อ"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {categories.length > 0 && (
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, activeCategory === null && styles.chipActive]}
            onPress={() => setActiveCategory(null)}
          >
            <Text style={[styles.chipText, activeCategory === null && styles.chipTextActive]}>
              ทั้งหมด
            </Text>
          </TouchableOpacity>
          {categories.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, activeCategory === c && styles.chipActive]}
              onPress={() => setActiveCategory(activeCategory === c ? null : c)}
            >
              <Text style={[styles.chipText, activeCategory === c && styles.chipTextActive]}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={guides}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<Text style={styles.empty}>ไม่พบข้อมูลที่ค้นหา</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate("GuideDetail", { id: item.id })}
            >
              <Text style={styles.category}>{item.category}</Text>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.symptom} numberOfLines={2}>
                {item.symptom}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchWrapper: { padding: 16, paddingBottom: 8 },
  search: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textMuted },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  loader: { marginTop: 40 },
  listContent: { padding: 16, paddingTop: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  category: { fontSize: 12, color: colors.primary, fontWeight: "600", marginBottom: 4 },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  symptom: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  error: { color: colors.danger, textAlign: "center", marginTop: 40 },
});
