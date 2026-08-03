import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { colors, radius, shadow } from "../theme";
import { SparePart } from "../types";
import { HomeStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "SparePartList">;

export default function SparePartListScreen({ navigation }: Props) {
  const [parts, setParts] = useState<SparePart[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (searchTerm: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : "";
      const { data } = await api.get<SparePart[]>(`/spare-parts${query}`);
      setParts(data);
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
          placeholder="ค้นหาจากชื่อ รหัสสินค้า หรือยี่ห้อ"
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
          data={parts}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<Text style={styles.empty}>ไม่พบอะไหล่ที่ค้นหา</Text>}
          renderItem={({ item }) => {
            const uri = resolveImageUrl(item.imageUrl);
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate("SparePartDetail", { id: item.id })}
              >
                {uri ? (
                  <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder]}>
                    <Text style={styles.thumbPlaceholderText}>ไม่มีรูป</Text>
                  </View>
                )}
                <View style={styles.info}>
                  <Text style={styles.name} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.code}>รหัส: {item.partCode}</Text>
                  {item.brand ? <Text style={styles.brand}>ยี่ห้อ: {item.brand}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          }}
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
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: 10,
    ...shadow.card,
    padding: 12,
    marginBottom: 12,
    gap: 12,
  },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: colors.background },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbPlaceholderText: { fontSize: 11, color: colors.textMuted },
  info: { flex: 1, justifyContent: "center" },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  code: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  brand: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  error: { color: colors.danger, textAlign: "center", marginTop: 40 },
});
