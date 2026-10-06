import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { BUILD_AT, BUILD_COMMIT } from "../buildInfo";
import { colors, radius, spacing } from "../theme";
import { MenuEntry } from "../components/MenuList";
import { HomeStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "HomeMenu">;

export default function HomeScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [inbox, setInbox] = useState(0);

  /**
   * ตัวเลขบนกล่องงาน โหลดใหม่ทุกครั้งที่กลับมาหน้าแรก
   *
   * เงียบเมื่อโหลดไม่ได้ เพราะเลขบนเมนูไม่ใช่เนื้อหาหลักของหน้า ถ้าเน็ตสะดุด
   * ไม่ควรขึ้นข้อความผิดพลาดบังเมนูทั้งหน้าที่ยังกดใช้งานได้ตามปกติ
   */
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      api
        .get<{ inbox: number }>("/work-orders/inbox-count")
        .then((res) => alive && setInbox(res.data.inbox))
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, [])
  );

  const entries: HomeEntry[] = [
    {
      /*
        กล่องงานอยู่บนสุด เพราะเป็นคำถามแรกที่ทุกคนเปิดแอปมาถาม —
        "มีอะไรรอฉันอยู่บ้าง" เมนูใบงานซ่อมด้านล่างยังเป็นรายการรวมเหมือนเดิม
        สำหรับตอนที่อยากดูทั้งหมด ไม่ใช่เฉพาะของตัวเอง
      */
      key: "Inbox",
      group: "repair",
      labelEn: "My Inbox",
      label: "กล่องงานของฉัน",
      description: inbox
        ? `มี ${inbox} ใบงานรอคุณอยู่`
        : "ใบงานที่ถึงคิวของคุณจะมาอยู่ที่นี่",
      // ไม่ใช้ไอคอนถาดเอกสาร เพราะเมนูเบิกของใช้สิ้นเปลืองใช้อยู่แล้ว
      // ไอคอนซ้ำกันสองอันในเมนูเดียวทำให้กวาดตาหาผิดอัน
      icon: "briefcase",
      tint: colors.warningSoft,
      iconColor: colors.warningInk,
      badge: inbox,
      onPress: () => navigation.navigate("WorkOrderList", { inbox: true }),
    },
    {
      key: "MachineDashboard",
      group: "repair",
      labelEn: "Machine Monitor",
      label: "ติดตามเครื่องเสีย",
      description: "เครื่องดับและสาขาสัญญาณหาย พร้อมเวลา SLA",
      icon: "pulse",
      tint: colors.dangerSoft,
      iconColor: colors.dangerInk,
      onPress: () => navigation.navigate("MachineDashboard"),
    },
    {
      key: "WorkOrders",
      group: "repair",
      labelEn: "Work Orders",
      label: "ใบงานซ่อม",
      description: "เปิดใบงาน มอบหมายช่าง และปิดงานเมื่อทำเสร็จ",
      icon: "clipboard-outline",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("WorkOrderList"),
    },
    {
      key: "Reports",
      group: "repair",
      labelEn: "Reports",
      label: "รายงาน",
      description: "ใบงานรายวัน สรุปรายสัปดาห์ ภาพรวมผู้บริหาร และอะไหล่ที่ต้องสั่ง",
      icon: "document-text",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("ReportsMenu"),
    },
    {
      key: "TransferDocument",
      group: "office",
      labelEn: "Transfer Request",
      label: "เอกสารขอโอนสินค้า",
      description: "กรอกรายการ แล้วได้ไฟล์ Word ตามฟอร์มบริษัท",
      icon: "swap-horizontal",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("TransferDocument"),
    },
    {
      key: "FlowList",
      group: "field",
      labelEn: "Diagnose",
      label: "วินิจฉัยอาการเสีย",
      description: "ตอบใช่/ไม่ทีละขั้น พร้อมผังวงจร",
      icon: "construct",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("FlowList"),
    },
    {
      key: "SparePartList",
      group: "field",
      labelEn: "Spare Parts",
      label: "รายการอะไหล่",
      description: "ค้นหารหัส ยี่ห้อ และรูปอะไหล่",
      icon: "cube",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("SparePartList"),
    },
    {
      key: "BranchCheckIn",
      group: "field",
      labelEn: "Branch Check-in",
      label: "รายงานตัวเข้าสาขา",
      description: "ยืนยันตำแหน่งด้วย GPS",
      icon: "location",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("BranchCheckIn"),
    },
    {
      key: "WorkLogForm",
      group: "field",
      labelEn: "Work Log",
      label: "บันทึกการทำงาน",
      description: "ลงงานที่ทำในแต่ละวัน",
      icon: "create",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("WorkLogForm"),
    },
    {
      key: "VehicleCheckIn",
      group: "field",
      labelEn: "Vehicle Use",
      label: "ลงทะเบียนใช้รถ",
      description: "เช็คอิน / คืนรถ พร้อมเลขไมล์",
      icon: "car",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("VehicleCheckIn"),
    },
    {
      key: "ChangePassword",
      group: "office",
      labelEn: "Change Password",
      label: "เปลี่ยนรหัสผ่าน",
      description: "ตั้งรหัสผ่านใหม่ของบัญชีตัวเอง",
      icon: "key",
      tint: colors.border,
      iconColor: colors.textMuted,
      onPress: () => navigation.navigate("ChangePassword"),
    },
    {
      key: "ConsumableRequest",
      group: "office",
      labelEn: "Consumables",
      label: "เบิกของใช้สิ้นเปลือง",
      description: "ขอเบิกของจากออฟฟิศ",
      icon: "file-tray-full",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("ConsumableRequest"),
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Hero
        name={user?.name ?? ""}
        role={user?.role}
        area={user?.team ?? user?.region ?? null}
        inbox={inbox}
        onOpenInbox={() => navigation.navigate("WorkOrderList", { inbox: true })}
      />

      {GROUPS.map((group) => (
        <View key={group.key} style={styles.group}>
          <View style={styles.groupHead}>
            <View style={styles.groupDot} />
            <Text style={styles.groupTitle}>{group.title}</Text>
            <Text style={styles.groupTitleEn}>{group.titleEn}</Text>
          </View>
          {entries
            .filter((e) => e.group === group.key)
            .map((entry) => (
              <MenuCard key={entry.key} entry={entry} />
            ))}
        </View>
      ))}

      <BuildLine />
    </ScrollView>
  );
}

type HomeEntry = MenuEntry & {
  group: "repair" | "field" | "office";
  /** ชื่ออังกฤษตัวเล็กใต้ชื่อไทย ตามแนวเมนูสองภาษาของ OTTERI UI */
  labelEn: string;
};

/**
 * แบ่งเมนูเป็นกลุ่ม เพราะสิบสองปุ่มเรียงยาวต้องอ่านทีละอันกว่าจะเจอ
 * พอมีหัวกลุ่ม ช่างกวาดตาไปที่กลุ่มก่อนแล้วค่อยหาปุ่ม
 */
const GROUPS: { key: HomeEntry["group"]; title: string; titleEn: string }[] = [
  { key: "repair", title: "งานซ่อม", titleEn: "Repair" },
  { key: "field", title: "หน้างาน", titleEn: "Field Work" },
  { key: "office", title: "เอกสารและบัญชี", titleEn: "Office" },
];

const ROLE_LABEL: Record<string, string> = {
  EMPLOYEE: "ช่าง",
  SUPERVISOR: "หัวหน้าภาค",
  ADMIN: "แอดมิน",
};

/** ทักตามช่วงเวลาไทย ไม่ใช่เวลาเครื่อง เพราะเครื่องที่เปิดเว็บอาจตั้งโซนเวลาอื่นไว้ */
function greeting() {
  const hour = Number(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok", hour: "numeric", hour12: false })
  );
  if (hour < 12) return "สวัสดีตอนเช้า";
  if (hour < 17) return "สวัสดีตอนบ่าย";
  return "สวัสดีตอนเย็น";
}

/**
 * การ์ดต้อนรับสีกรมท่า
 *
 * ตัวเลขมีแค่กล่องงาน เพราะเป็นตัวเลขเดียวที่หน้าแรกโหลดจริง — คู่มือ OTTERI
 * ห้ามแสดงสถิติที่ระบบไม่มีข้อมูล จึงไม่เติมช่องให้ครบสามช่องเหมือนตัวอย่าง
 */
function Hero({
  name,
  role,
  area,
  inbox,
  onOpenInbox,
}: {
  name: string;
  role?: string;
  area: string | null;
  inbox: number;
  onOpenInbox: () => void;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroGlow} />
      <View style={styles.heroTop}>
        <Text style={styles.heroGreet}>{greeting()}</Text>
        {role ? (
          <View style={styles.heroBadge}>
            <View style={styles.heroBadgeDot} />
            <Text style={styles.heroBadgeText}>{ROLE_LABEL[role] ?? role}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.heroName}>{name}</Text>
      {area ? (
        <View style={styles.heroArea}>
          <Ionicons name="people-outline" size={16} color="rgba(255,255,255,0.8)" />
          <Text style={styles.heroAreaText}>{area}</Text>
        </View>
      ) : null}

      <View style={styles.heroDivider} />

      <TouchableOpacity style={styles.heroKpi} activeOpacity={0.8} onPress={onOpenInbox}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroKpiLabel}>ใบงานที่รอคุณ</Text>
          <Text style={styles.heroKpiValue}>
            {inbox.toLocaleString("th-TH")}
            <Text style={styles.heroKpiUnit}> ใบ</Text>
          </Text>
        </View>
        <View style={styles.heroKpiGo}>
          <Text style={styles.heroKpiGoText}>เปิดกล่องงาน</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.navy} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

function MenuCard({ entry }: { entry: HomeEntry }) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.75} onPress={entry.onPress}>
      <View style={[styles.cardIcon, { backgroundColor: entry.tint }]}>
        <Ionicons name={entry.icon} size={22} color={entry.iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardLabel}>{entry.label}</Text>
          {entry.badge ? (
            <View style={styles.cardBadge}>
              <Text style={styles.cardBadgeText}>{entry.badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardLabelEn}>{entry.labelEn}</Text>
        <Text style={styles.cardDescription}>{entry.description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
    </TouchableOpacity>
  );
}

/**
 * บอกว่าเว็บที่เปิดอยู่เป็น build ไหน
 *
 * เวลาแก้โค้ดแล้วของใหม่ยังไม่ขึ้น จะได้แยกออกว่าโค้ดไม่ทำงาน หรือแค่ยังไม่ได้ deploy
 * ซึ่งจากหน้าจอเฉยๆ ดูไม่ออก
 */
function BuildLine() {
  if (!BUILD_AT) return null;
  const at = new Date(BUILD_AT);
  const when = Number.isNaN(at.getTime())
    ? BUILD_AT
    : at.toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        dateStyle: "medium",
        timeStyle: "short",
      });
  return <Text style={styles.build}>{`รุ่น ${BUILD_COMMIT} · build ${when}`}</Text>;
}

// เงาฟ้าอ่อนแบบ --shadow-md ของ OTTERI — บนเว็บใช้ boxShadow ตรง ๆ ได้ จึงตรงกับต้นแบบกว่า
const cardShadow = {
  shadowColor: colors.navy,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 16,
  elevation: 2,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },

  hero: {
    backgroundColor: colors.navy,
    borderRadius: 24,
    padding: spacing.xl,
    overflow: "hidden",
    ...cardShadow,
  },
  // วงกลมจาง ๆ มุมขวาบน แทน gradient ของต้นแบบ — ได้ความลึกแบบเดียวกัน
  // โดยไม่ต้องเพิ่มไลบรารี gradient เข้ามาในแอป
  heroGlow: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    right: -90,
    top: -110,
    backgroundColor: colors.primary,
    opacity: 0.35,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  heroGreet: { color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 22 },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.successSoft,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  heroBadgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  heroBadgeText: { color: colors.successInk, fontSize: 12, lineHeight: 20, fontWeight: "700" },
  heroName: { color: "#fff", fontSize: 26, lineHeight: 38, fontWeight: "800", marginTop: spacing.sm },
  heroArea: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  heroAreaText: { color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 22 },
  heroDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.15)", marginVertical: spacing.lg },
  heroKpi: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  heroKpiLabel: { color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 20 },
  heroKpiValue: { color: "#fff", fontSize: 30, lineHeight: 40, fontWeight: "800" },
  heroKpiUnit: { fontSize: 14, fontWeight: "500", color: "rgba(255,255,255,0.8)" },
  heroKpiGo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    minHeight: 42,
  },
  heroKpiGoText: { color: colors.navy, fontSize: 14, lineHeight: 22, fontWeight: "700" },

  group: { marginTop: spacing.xl },
  groupHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  groupDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  groupTitle: { fontSize: 15, lineHeight: 24, fontWeight: "800", color: colors.navy },
  groupTitleEn: { fontSize: 12, lineHeight: 20, color: colors.textFaint },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    padding: spacing.lg,
    marginTop: spacing.sm,
    ...cardShadow,
  },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardLabel: { fontSize: 16, lineHeight: 26, fontWeight: "700", color: colors.text },
  cardLabelEn: { fontSize: 11, lineHeight: 16, color: colors.textFaint, fontWeight: "600" },
  cardDescription: { fontSize: 13, lineHeight: 21, color: colors.textMuted, marginTop: 2 },
  cardBadge: {
    minWidth: 22,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
  },
  cardBadgeText: { color: "#fff", fontSize: 12, lineHeight: 20, fontWeight: "700" },

  build: {
    fontSize: 11,
    lineHeight: 19,
    color: colors.textFaint,
    textAlign: "center",
    marginTop: spacing.lg,
  },
});
