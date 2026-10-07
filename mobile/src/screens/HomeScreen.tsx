import React, { useCallback, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { BUILD_AT, BUILD_COMMIT } from "../buildInfo";
import { colors, radius, shadow, spacing, headingFont } from "../theme";
import { MenuEntry } from "../components/MenuList";
import { useRefreshHandler } from "../components/RefreshButton";
import { HomeStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "HomeMenu">;

interface ListRow {
  id: number;
  code: string;
  priority: string;
  statusLabel: string;
  branchName: string;
}

interface Summary {
  inbox: number;
  active: number;
  urgent: number;
  /** ใบแรกในกล่องงาน — เรียงด่วนก่อนแล้วเก่าสุดก่อน ตามที่เซิร์ฟเวอร์จัดมา */
  next: ListRow | null;
}

export default function HomeScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [summary, setSummary] = useState<Summary | null>(null);
  const inbox = summary?.inbox ?? 0;

  /**
   * ตัวเลขบนการ์ดต้อนรับ โหลดใหม่ทุกครั้งที่กลับมาหน้าแรก
   *
   * ใช้รายการเดียวกับหน้าใบงานซ่อม จึงนับตามขอบเขตที่คนนี้เห็นจริง (ภาค/ทีม)
   * ตัวเลขบนหน้าแรกกับในรายการจะไม่ขัดกัน
   *
   * เงียบเมื่อโหลดไม่ได้ เพราะตัวเลขไม่ใช่เนื้อหาหลักของหน้า ถ้าเน็ตสะดุด
   * ไม่ควรขึ้นข้อความผิดพลาดบังเมนูทั้งหน้าที่ยังกดใช้งานได้ตามปกติ
   */
  const load = useCallback(async () => {
    const [active, mine] = await Promise.all([
      api.get<{ rows: ListRow[]; counts: Record<string, number> }>("/work-orders", { params: { status: "ACTIVE" } }),
      api.get<{ rows: ListRow[] }>("/work-orders", { params: { status: "INBOX" } }),
    ]);
    setSummary({
      inbox: active.data.counts.INBOX ?? mine.data.rows.length,
      active: active.data.counts.ACTIVE ?? active.data.rows.length,
      urgent: active.data.rows.filter((r) => r.priority === "URGENT").length,
      next: mine.data.rows[0] ?? null,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load])
  );
  useRefreshHandler(load);

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

  // สองคอลัมน์เมื่อจอกว้างพอ ตามต้นแบบ — คอลัมน์เดียวบนมือถือ ปุ่มจะได้กว้างพอให้นิ้วกด
  const twoCol = width >= 640;

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
        summary={summary}
        onRefresh={() => load().catch(() => undefined)}
      />

      {summary?.next ? (
        <TouchableOpacity
          style={styles.notice}
          activeOpacity={0.8}
          onPress={() => navigation.navigate("WorkOrderList", { inbox: true })}
        >
          <View style={styles.noticeIcon}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.noticeHead}>
              <Text style={styles.noticeKicker}>ถึงคิวคุณ</Text>
              <View style={styles.noticeTag}>
                <Text style={styles.noticeTagText}>{inbox} ใบ</Text>
              </View>
            </View>
            <Text style={styles.noticeText}>
              ใบแรกคือ <Text style={styles.noticeStrong}>{summary.next.code}</Text>
              {` — ${summary.next.statusLabel} ที่ ${summary.next.branchName}`}
            </Text>
          </View>
        </TouchableOpacity>
      ) : null}

      {GROUPS.map((group) => (
        <View key={group.key} style={styles.group}>
          <View style={styles.groupHead}>
            <View style={styles.groupDot} />
            <Text style={styles.groupTitle}>{group.title}</Text>
            <Text style={styles.groupTitleEn}>{group.titleEn}</Text>
          </View>
          <View style={styles.grid}>
            {entries
              .filter((e) => e.group === group.key)
              .map((entry) => (
                <View key={entry.key} style={twoCol ? styles.cellHalf : styles.cellFull}>
                  <MenuTile entry={entry} />
                </View>
              ))}
          </View>
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
 * การ์ดต้อนรับสีกรมท่าไล่ไปฟ้า แบบต้นแบบ OTTERI
 *
 * ตัวเลขสามช่องมาจากรายการใบงานจริงในขอบเขตของคนนี้ ไม่มีตัวเลขสมมติ —
 * ระหว่างที่ยังโหลดไม่เสร็จขึ้นขีดแทน ไม่ขึ้นศูนย์ที่ดูเหมือนข้อมูลจริง
 */
function Hero({
  name,
  role,
  area,
  summary,
  onRefresh,
}: {
  name: string;
  role?: string;
  area: string | null;
  summary: Summary | null;
  onRefresh: () => void;
}) {
  const stat = (label: string, value: number | undefined) => (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, headingFont]}>
        {value === undefined ? "–" : value.toLocaleString("th-TH")}
        <Text style={styles.statUnit}> ใบ</Text>
      </Text>
    </View>
  );
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
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.heroRefresh} onPress={onRefresh} accessibilityLabel="โหลดตัวเลขใหม่">
          <Ionicons name="sync-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      <Text style={[styles.heroName, headingFont]}>{name}</Text>
      <View style={styles.heroArea}>
        <Ionicons name="people-outline" size={16} color="rgba(255,255,255,0.85)" />
        <Text style={styles.heroAreaText}>{area ?? (role === "ADMIN" ? "ดูแลทุกภาค" : "ยังไม่ได้จัดทีม")}</Text>
      </View>

      <View style={styles.heroDivider} />

      <View style={styles.stats}>
        {stat("รอคุณ", summary?.inbox)}
        {stat("ใบงานค้าง", summary?.active)}
        {stat("งานด่วน", summary?.urgent)}
      </View>
    </View>
  );
}

/** ปุ่มเมนูแบบกระเบื้อง: ไอคอน ชื่อไทย ชื่ออังกฤษตัวเล็ก คำอธิบาย และตัวเลขแดงถ้ามี */
function MenuTile({ entry }: { entry: HomeEntry }) {
  return (
    <TouchableOpacity style={styles.tile} activeOpacity={0.75} onPress={entry.onPress}>
      <View style={[styles.tileIcon, { backgroundColor: entry.tint }]}>
        <Ionicons name={entry.icon} size={22} color={entry.iconColor} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.tileLabel}>{entry.label}</Text>
        <Text style={styles.tileLabelEn}>{entry.labelEn}</Text>
        <Text style={styles.tileDescription}>{entry.description}</Text>
      </View>
      {entry.badge ? (
        <View style={styles.tileBadge}>
          <Text style={styles.tileBadgeText}>{entry.badge}</Text>
        </View>
      ) : null}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },

  hero: {
    backgroundColor: colors.navy,
    borderRadius: radius.xl,
    padding: spacing.xl,
    overflow: "hidden",
    ...shadow.raised,
    // บนเว็บไล่สีกรมท่าไปฟ้าแบบต้นแบบ บนมือถือใช้กรมท่าพื้นแทน
    // เพื่อไม่ต้องเพิ่มไลบรารี gradient เข้าแอปเพราะการ์ดใบเดียว
    ...(Platform.OS === "web"
      ? ({ backgroundImage: `linear-gradient(135deg, ${colors.navy} 0%, ${colors.primaryInk} 55%, ${colors.primary} 100%)` } as object)
      : null),
  },
  heroGlow: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    right: -70,
    top: -80,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  heroGreet: { color: "rgba(255,255,255,0.88)", fontSize: 14, lineHeight: 22 },
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
  heroRefresh: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  heroName: { color: "#fff", fontSize: 26, lineHeight: 38, fontWeight: "800", marginTop: spacing.sm },
  heroArea: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  heroAreaText: { color: "rgba(255,255,255,0.88)", fontSize: 14, lineHeight: 22 },
  heroDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.15)", marginVertical: spacing.lg },
  stats: { flexDirection: "row", gap: 10 },
  stat: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  statLabel: { color: "rgba(255,255,255,0.85)", fontSize: 13, lineHeight: 20 },
  statValue: { color: "#fff", fontSize: 26, lineHeight: 36, fontWeight: "800" },
  statUnit: { fontSize: 13, fontWeight: "500", color: "rgba(255,255,255,0.85)" },

  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  noticeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryInk,
  },
  noticeHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  noticeKicker: { fontSize: 13, lineHeight: 20, fontWeight: "800", color: colors.primaryInk },
  noticeTag: { backgroundColor: colors.dangerSoft, borderRadius: radius.pill, paddingHorizontal: 8 },
  noticeTagText: { fontSize: 12, lineHeight: 20, fontWeight: "700", color: colors.dangerInk },
  noticeText: { fontSize: 15, lineHeight: 24, color: colors.text, marginTop: 2 },
  noticeStrong: { fontWeight: "800", color: colors.primaryInk },

  group: { marginTop: spacing.xl },
  groupHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  groupDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  groupTitle: { fontSize: 16, lineHeight: 24, fontWeight: "800", color: colors.navy },
  groupTitleEn: { fontSize: 12, lineHeight: 20, color: colors.textFaint, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  cellFull: { width: "100%", padding: 5 },
  cellHalf: { width: "50%", padding: 5 },

  tile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    padding: spacing.lg,
    ...shadow.card,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: colors.text },
  tileLabelEn: { fontSize: 11, lineHeight: 16, color: colors.textFaint, fontWeight: "600" },
  tileDescription: { fontSize: 13, lineHeight: 20, color: colors.textMuted, marginTop: 2 },
  tileBadge: {
    minWidth: 22,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
  },
  tileBadgeText: { color: "#fff", fontSize: 12, lineHeight: 20, fontWeight: "700" },

  build: {
    fontSize: 11,
    lineHeight: 19,
    color: colors.textFaint,
    textAlign: "center",
    marginTop: spacing.lg,
  },
});
