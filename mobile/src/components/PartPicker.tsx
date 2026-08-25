/**
 * เลือกอะไหล่จากรายการในระบบ
 *
 * ใช้สองที่ที่ความหมายต่างกัน — บนกระดานคือ "อะไหล่ที่รออยู่" ตอนปิดใบงานคือ
 * "อะไหล่ที่ใช้ไปจริง" จึงรับ label เข้ามา แต่วิธีค้นและวิธีนับจำนวนเหมือนกัน
 * ทั้งคู่อ่านจาก /spare-parts ตัวเดียวกับเมนูรายการอะไหล่ ไม่ได้มีคลังแยก
 */
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { colors, radius, spacing } from "../theme";

export interface PickedPart {
  sparePartId: number;
  partCode: string;
  name: string;
  brand: string | null;
  quantity: number;
}

interface SparePartOption {
  id: number;
  partCode: string;
  name: string;
  brand: string | null;
}

export default function PartPicker({
  parts,
  onChange,
  label = "อะไหล่ที่รอ",
}: {
  parts: PickedPart[];
  onChange: (next: PickedPart[]) => void;
  label?: string;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SparePartOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // หน่วงไว้ก่อนยิง ไม่งั้นพิมพ์รหัสเดียวยิงไปสิบครั้ง
  useEffect(() => {
    const keyword = term.trim();
    if (!keyword) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .get<SparePartOption[]>("/spare-parts", { params: { search: keyword } })
        .then((res) => setResults(res.data.slice(0, 8)))
        .catch(() => setResults([]))
        .finally(() => {
          setSearching(false);
          setSearched(true);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [term]);

  function add(option: SparePartOption) {
    setTerm("");
    // เลือกตัวที่มีอยู่แล้วให้บวกจำนวน ไม่ใช่เพิ่มแถวซ้ำ
    const existing = parts.find((p) => p.sparePartId === option.id);
    if (existing) {
      onChange(
        parts.map((p) => (p.sparePartId === option.id ? { ...p, quantity: p.quantity + 1 } : p))
      );
      return;
    }
    onChange([
      ...parts,
      {
        sparePartId: option.id,
        partCode: option.partCode,
        name: option.name,
        brand: option.brand,
        quantity: 1,
      },
    ]);
  }

  function setQuantity(sparePartId: number, text: string) {
    const digits = text.replace(/[^0-9]/g, "");
    // ปล่อยให้ว่างระหว่างพิมพ์ได้ ค่อยตีเป็น 1 ตอนบันทึก
    const value = digits === "" ? 1 : Math.min(999, Math.max(1, Number(digits)));
    onChange(parts.map((p) => (p.sparePartId === sparePartId ? { ...p, quantity: value } : p)));
  }

  return (
    <View style={styles.picker}>
      <Text style={styles.label}>{label}</Text>

      {parts.length > 0 ? (
        <View style={styles.pickedList}>
          {parts.map((part) => (
            <View key={part.sparePartId} style={styles.picked}>
              <View style={styles.pickedText}>
                <Text style={styles.pickedCode}>{part.partCode}</Text>
                <Text style={styles.pickedName}>{part.name}</Text>
              </View>
              <TextInput
                style={styles.qtyInput}
                value={String(part.quantity)}
                onChangeText={(t) => setQuantity(part.sparePartId, t)}
                keyboardType="number-pad"
                maxLength={3}
                accessibilityLabel={`จำนวน ${part.partCode}`}
              />
              <Text style={styles.qtyUnit}>ตัว</Text>
              <TouchableOpacity
                onPress={() => onChange(parts.filter((p) => p.sparePartId !== part.sparePartId))}
                accessibilityLabel={`เอา ${part.partCode} ออก`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={20} color={colors.textFaint} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.pickerSearch}>
        <Ionicons name="search" size={15} color={colors.textFaint} />
        <TextInput
          style={styles.pickerInput}
          value={term}
          onChangeText={setTerm}
          placeholder="ค้นหารหัสหรือชื่ออะไหล่"
          placeholderTextColor={colors.textFaint}
        />
        {searching ? <ActivityIndicator size="small" color={colors.textFaint} /> : null}
      </View>

      {results.length > 0 ? (
        <View style={styles.pickerResults}>
          {results.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={styles.pickerResult}
              onPress={() => add(option)}
              activeOpacity={0.7}
            >
              <Text style={styles.pickedCode}>{option.partCode}</Text>
              <Text style={styles.pickerResultName} numberOfLines={1}>
                {option.name}
              </Text>
              <Ionicons name="add-circle-outline" size={17} color={colors.primary} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {searched && !searching && results.length === 0 ? (
        <Text style={styles.hint}>
          ไม่พบอะไหล่ที่ตรงกับ “{term.trim()}” — เพิ่มรายการใหม่ได้ที่เมนูรายการอะไหล่ (แอดมิน)
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { gap: spacing.xs },
  label: {
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  pickedList: { gap: spacing.xs },
  picked: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  pickedText: { flex: 1, minWidth: 0 },
  pickedCode: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  pickedName: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  qtyInput: {
    width: 52,
    textAlign: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    paddingVertical: spacing.xs,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  qtyUnit: { fontSize: 12, lineHeight: 20, color: colors.textFaint },
  pickerSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  pickerInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  pickerResults: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  pickerResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerResultName: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.textMuted },
  hint: { fontSize: 11, lineHeight: 19, color: colors.textFaint, marginTop: spacing.xs },
});
