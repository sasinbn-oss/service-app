import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { HomeStackParamList, ReportKind } from "../navigation/types";
import { colors, radius, shadow, spacing } from "../theme";

type Props = NativeStackScreenProps<HomeStackParamList, "ReportsMenu">;

interface Entry {
  kind: ReportKind;
  label: string;
  who: string;
  question: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  iconColor: string;
  /** บอกตรง ๆ ว่าใบไหนยังไม่มีข้อมูลพอ ดีกว่าให้เปิดไปเจอศูนย์แล้วงง */
  caveat?: string;
}

const ENTRIES: Entry[] = [
  {
    kind: "daily",
    label: "ใบงานวันนี้",
    who: "หัวหน้าช่าง · ช่างแต่ละโซน",
    question: "วันนี้ต้องไปที่ไหนก่อน",
    icon: "today-outline",
    tint: "#fbf0dd",
    iconColor: "#a35a06",
  },
  {
    kind: "weekly",
    label: "สรุปรายสัปดาห์",
    who: "ผจก.ภาค · หัวหน้าทีม",
    question: "ภาคของฉันดีขึ้นหรือแย่ลง",
    icon: "stats-chart-outline",
    tint: colors.primarySoft,
    iconColor: colors.primary,
  },
  {
    kind: "monthly",
    label: "ภาพรวมผู้บริหาร",
    who: "ผู้บริหาร · เจ้าของกิจการ",
    question: "เดือนนี้ดีขึ้นกว่าเดือนที่แล้วไหม",
    icon: "trending-up-outline",
    tint: "#ece9f8",
    iconColor: "#5b3fb0",
    caveat: "ต้องมีเคสที่ปิดแล้วสะสมสัก 3–4 สัปดาห์ ตัวเลขถึงจะเชื่อได้",
  },
  {
    kind: "parts",
    label: "อะไหล่ที่ต้องสั่ง",
    who: "ฝ่ายจัดซื้อ · คลัง",
    question: "ต้องสั่งอะไรเข้ามาบ้าง",
    icon: "cube-outline",
    tint: "#e0f2ec",
    iconColor: "#0f7a5a",
  },
];

export default function ReportsMenuScreen({ navigation }: Props) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        ทุกใบดูบนหน้าจอได้ และกดดาวน์โหลดเป็น Excel เพื่อส่งต่อหรือทำต่อได้
      </Text>

      {ENTRIES.map((entry) => (
        <TouchableOpacity
          key={entry.kind}
          style={styles.card}
          activeOpacity={0.7}
          onPress={() => navigation.navigate("Report", { kind: entry.kind, title: entry.label })}
        >
          <View style={[styles.icon, { backgroundColor: entry.tint }]}>
            <Ionicons name={entry.icon} size={22} color={entry.iconColor} />
          </View>
          <View style={styles.body}>
            <Text style={styles.label}>{entry.label}</Text>
            <Text style={styles.question}>“{entry.question}”</Text>
            <Text style={styles.who}>{entry.who}</Text>
            {entry.caveat ? <Text style={styles.caveat}>{entry.caveat}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  intro: { fontSize: 13, lineHeight: 22, color: colors.textMuted },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    ...shadow.card,
  },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0, gap: 2 },
  label: { fontSize: 15, lineHeight: 24, fontWeight: "700", color: colors.text },
  question: { fontSize: 13, lineHeight: 21, color: colors.textMuted },
  who: { fontSize: 12, lineHeight: 20, color: colors.textFaint },
  caveat: { fontSize: 11, lineHeight: 19, color: "#a35a06", marginTop: 2 },
});
