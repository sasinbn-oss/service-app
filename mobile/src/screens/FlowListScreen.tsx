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
import { colors, radius, shadow } from "../theme";
import { TroubleshootFlowSummary } from "../types";
import { HomeStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "FlowList">;

export default function FlowListScreen({ navigation }: Props) {
  const [flows, setFlows] = useState<TroubleshootFlowSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = term ? `?search=${encodeURIComponent(term)}` : "";
      const { data } = await api.get<TroubleshootFlowSummary[]>(`/troubleshoot-flows${query}`);
      setFlows(data);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(search);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  useEffect(() => {
    const timer = setTimeout(() => load(search), 300);
    return () => clearTimeout(timer);
  }, [search, load]);

  return (
    <View style={styles.container}>
      <View style={styles.searchWrapper}>
        <TextInput
          style={styles.search}
          placeholder="ค้นหาอาการเสีย เช่น ไม่มีความร้อน, E oP"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={flows}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<Text style={styles.empty}>ไม่พบผังวินิจฉัยที่ค้นหา</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate("FlowRun", { id: item.id, title: item.title })}
            >
              {item.machineType ? <Text style={styles.machine}>{item.machineType}</Text> : null}
              <Text style={styles.title}>{item.title}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.meta}>{item.questionCount} ขั้นตอน</Text>
                {item.imageCount > 0 && <Text style={styles.meta}>· {item.imageCount} รูปวงจร</Text>}
              </View>
              {item.incompleteCount > 0 && (
                <View style={styles.warnBadge}>
                  <Text style={styles.warnText}>
                    ⚠ ยังไม่สมบูรณ์ {item.incompleteCount} จุด — บางเส้นทางอาจไปต่อไม่ได้
                  </Text>
                </View>
              )}
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
    borderRadius: radius.md,
    padding: 14,
    fontSize: 16,
  },
  loader: { marginTop: 40 },
  listContent: { padding: 16, paddingTop: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    ...shadow.card,
    padding: 16,
    marginBottom: 12,
  },
  machine: { fontSize: 12, color: colors.primary, fontWeight: "600", marginBottom: 4 },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  metaRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  meta: { fontSize: 13, color: colors.textMuted },
  warnBadge: {
    marginTop: 10,
    backgroundColor: "#fef3c7",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  warnText: { fontSize: 12, color: "#92400e" },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  error: { color: colors.danger, textAlign: "center", marginTop: 40 },
});
