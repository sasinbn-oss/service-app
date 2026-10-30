import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import TouchableOpacity from "../components/Tap";
import Ionicons from "@expo/vector-icons/Ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { HomeStackParamList, ReportKind } from "../navigation/types";
import { colors, radius, shadow, spacing } from "../theme";
import { useAuth } from "../context/AuthContext";
import DateField, { todayBkk } from "../components/DateField";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { openUrl } from "../utils/share";
import { showAlert } from "../utils/alert";
import { isAreaTeam } from "../utils/areaTeam";
import { canSeeBranchParts } from "../utils/branchParts";

type Props = NativeStackScreenProps<HomeStackParamList, "ReportsMenu">;

interface Entry {
  /** byOpener/system มีหน้าของตัวเอง (เลือกช่วงวันที่) ไม่ใช่หน้ารายงานทั่วไป */
  kind: ReportKind | "byOpener" | "system" | "confirmed" | "partsOut" | "issuedParts" | "branchParts";
  /** เฉพาะแอดมิน/หัวหน้าภาค — ช่างเปิดแล้วเซิร์ฟเวอร์ปฏิเสธ ไม่ควรเห็นการ์ดตั้งแต่แรก */
  managersOnly?: boolean;
  /** เฉพาะแอดมิน — รายงานทั้งระบบมีข้อมูลทั้งบริษัทรวมเบอร์โทรพนักงาน */
  adminOnly?: boolean;
  /**
   * เฉพาะแอดมินและ Super Admin — เจ้าของงาน: "admin ดูได้ superadmin ดูได้" (Admin Spare Part ไม่เห็น ต่างจาก adminOnly)
   * กฎเดียวกับเซิร์ฟเวอร์ ดู utils/branchParts
   */
  branchPartsOnly?: boolean;
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
    tint: colors.warningSoft,
    iconColor: colors.warningInk,
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
    tint: colors.primarySoft,
    iconColor: colors.primaryInk,
    caveat: "ต้องมีเคสที่ปิดแล้วสะสมสัก 3–4 สัปดาห์ ตัวเลขถึงจะเชื่อได้",
  },
  {
    kind: "byOpener",
    label: "รายงานตามผู้เปิดใบงาน",
    who: "แอดมิน · หัวหน้าภาค",
    question: "ช่วงนี้ใครเปิดใบงานไปเท่าไร ค้างอยู่กี่ใบ",
    icon: "people-outline",
    tint: colors.roleSupervisorSoft,
    iconColor: colors.roleSupervisor,
    managersOnly: true,
  },
  {
    kind: "confirmed",
    label: "สรุปคอนเฟิร์มลูกค้า",
    who: "แอดมิน · หัวหน้าภาค → กลุ่มไลน์ช่าง",
    question: "วันนี้คอนเฟิร์มเคสไหนไปแล้วบ้าง",
    icon: "megaphone-outline",
    tint: colors.successSoft,
    iconColor: colors.successInk,
    managersOnly: true,
  },
  {
    kind: "system",
    label: "รายงานทั้งระบบ",
    who: "แอดมิน",
    question: "ขอข้อมูลทั้งหมดในไฟล์เดียว — คน สาขา เครื่อง ใบงาน",
    icon: "server-outline",
    tint: colors.tile,
    iconColor: colors.navy,
    adminOnly: true,
  },
  {
    kind: "partsOut",
    label: "สาขาที่ติดอะไหล่หมด",
    who: "แอดมิน · หัวหน้าภาค",
    question: "สาขาไหนรอของอยู่ รออะไร ถึงเมื่อไร",
    icon: "alert-circle-outline",
    tint: colors.dangerSoft,
    iconColor: colors.dangerInk,
    managersOnly: true,
  },
  {
    // นัดลูกค้าก่อนเบิก (ต.ค. 69) — ของที่ออกจากคลังแล้วแต่งานไม่จบ ไม่มีที่ไหนบอก
    kind: "issuedParts",
    label: "อะไหล่เบิกแล้ว · งานยังไม่จบ",
    who: "แอดมิน · หัวหน้าภาค",
    question: "ของออกจากคลังไปแล้ว ค้างอยู่ใบไหน ถึงขั้นไหน",
    icon: "cube-outline",
    tint: colors.roleSupervisorSoft,
    iconColor: colors.roleSupervisor,
    managersOnly: true,
  },
  {
    // ถัดจาก "อะไหล่เบิกแล้ว" ตามตัวอย่างที่ตกลง — แบบร่างเขียนคนอ่านรวม Admin Spare Part/หัวหน้าภาค แต่คำตอบของเจ้าของงานชนะ
    kind: "branchParts",
    label: "อะไหล่ที่ไปแต่ละสาขา",
    who: "แอดมิน · Super Admin",
    question: "สาขาไหนได้อะไหล่อะไรไปแล้วบ้าง",
    icon: "storefront-outline",
    tint: colors.successSoft,
    iconColor: colors.successInk,
    branchPartsOnly: true,
  },
  {
    kind: "parts",
    label: "อะไหล่ที่ต้องสั่ง",
    who: "ฝ่ายจัดซื้อ · คลัง",
    question: "ต้องสั่งอะไรเข้ามาบ้าง",
    icon: "cube-outline",
    tint: colors.successSoft,
    iconColor: colors.successInk,
  },
];

/**
 * รายงานของ Area Team — ปุ่มเดียว (เจ้าของงานกำหนด ต.ค. 69): ใบงานทั้งหมดของสาขาที่เห็น ตามช่วงวันที่แจ้ง
 * ไม่มีสรุปบนจอ — ตำแหน่งนี้เอาไฟล์ไปกรอง/ส่งต่อเอง ส่วนติดตามรายใบดูในใบงานซ่อมได้อยู่แล้ว
 */
function AreaTeamReport({ area }: { area: boolean }) {
  const [from, setFrom] = useState(`${todayBkk().slice(0, 8)}01`);
  const [to, setTo] = useState(todayBkk());
  const [busy, setBusy] = useState(false);
  async function download() {
    if (from > to) return showAlert("ช่วงวันที่ไม่ถูกต้อง", "วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด");
    setBusy(true);
    try {
      const res = await api.get<{ path: string; count: number }>("/work-orders/reports/area-team", {
        params: { from, to },
        loadingText: "กำลังสร้างไฟล์ Excel...",
      });
      const url = resolveImageUrl(res.data.path);
      if (url) await openUrl(url);
    } catch (e) {
      showAlert("ดาวน์โหลดไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.card, { flexDirection: "column", alignItems: "stretch" }]}>
        <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
          <View style={[styles.icon, { backgroundColor: colors.successSoft }]}>
            <Ionicons name="document-text-outline" size={22} color={colors.successInk} />
          </View>
          <View style={styles.body}>
            <Text style={styles.label}>รายงานใบงานทั้งหมด (Excel)</Text>
            <Text style={styles.question}>
              {area ? "ใบงานทุกสถานะของสาขา COCO ทั้งหมด" : "ใบงานทุกสถานะของสาขาที่คุณดูแล"} — แถวละใบ ทุกคอลัมน์ในแถวเดียว
            </Text>
          </View>
        </View>
        <View style={styles.dates}>
          <View style={styles.dateField}>
            <DateField label="วันที่แจ้งตั้งแต่" value={from} onChange={setFrom} required />
          </View>
          <View style={styles.dateField}>
            <DateField label="ถึงวันที่" value={to} onChange={setTo} required />
          </View>
        </View>
        <TouchableOpacity style={[styles.download, busy && { opacity: 0.6 }]} onPress={download} disabled={busy} activeOpacity={0.8}>
          <Ionicons name="download-outline" size={18} color="#fff" />
          <Text style={styles.downloadText}>{busy ? "กำลังสร้างไฟล์..." : "ดาวน์โหลด Excel"}</Text>
        </TouchableOpacity>
        <Text style={styles.who}>
          คอลัมน์: เลขใบงาน · วันที่แจ้ง · สาขา · Supervisor · Area · ประเภทงาน · เครื่อง · อาการ · ขั้นปัจจุบัน/รอใคร · ทีมช่าง ·
          วันนัด · อะไหล่ · วันปิด · ผลการซ่อม · ระยะเวลา (วัน)
        </Text>
      </View>
    </ScrollView>
  );
}

export default function ReportsMenuScreen({ navigation }: Props) {
  const { user } = useAuth();
  if (isAreaTeam(user)) return <AreaTeamReport area={user?.role === "AREA"} />;
  const admin = user?.role === "ADMIN";
  const manager = admin || user?.role === "SUPERVISOR";
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        ทุกใบดูบนหน้าจอได้ และกดดาวน์โหลดเป็น Excel เพื่อส่งต่อหรือทำต่อได้
      </Text>

      {ENTRIES.filter(
        (e) => (!e.managersOnly || manager) && (!e.adminOnly || admin) && (!e.branchPartsOnly || canSeeBranchParts(user))
      ).map((entry) => (
        <TouchableOpacity
          key={entry.kind}
          style={styles.card}
          activeOpacity={0.7}
          onPress={() =>
            entry.kind === "byOpener"
              ? navigation.navigate("OpenerReport")
              : entry.kind === "system"
              ? navigation.navigate("SystemReport")
              : entry.kind === "confirmed"
              ? navigation.navigate("ConfirmedReport")
              : entry.kind === "partsOut"
              ? navigation.navigate("PartsOutReport")
              : entry.kind === "issuedParts"
              ? navigation.navigate("IssuedPartsReport")
              : entry.kind === "branchParts"
              ? // {} ล้างตัวกรองสาขา/เครื่องที่ค้างจากลิงก์ในใบงาน — หน้านี้อาจยังค้างอยู่ในชุดหน้าเดียวกัน
                navigation.navigate("BranchPartsReport", {})
              : navigation.navigate("Report", { kind: entry.kind, title: entry.label })
          }
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
  caveat: { fontSize: 11, lineHeight: 19, color: colors.warningInk, marginTop: 2 },
  dates: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md },
  dateField: { flexGrow: 1, flexBasis: 180 },
  download: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.navyFill,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  downloadText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
