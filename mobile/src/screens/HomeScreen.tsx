import React from "react";
import { StyleSheet, Text } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { BUILD_AT, BUILD_COMMIT } from "../buildInfo";
import { colors, spacing } from "../theme";
import MenuList, { MenuEntry } from "../components/MenuList";
import { HomeStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "HomeMenu">;

export default function HomeScreen({ navigation }: Props) {
  const { user } = useAuth();

  const entries: MenuEntry[] = [
    {
      key: "MachineDashboard",
      label: "ติดตามเครื่องเสีย",
      description: "เครื่องดับและสาขาสัญญาณหาย พร้อมเวลา SLA",
      icon: "pulse",
      tint: colors.dangerSoft,
      iconColor: colors.danger,
      onPress: () => navigation.navigate("MachineDashboard"),
    },
    {
      key: "WorkOrders",
      label: "ใบงานซ่อม",
      description: "เปิดใบงาน มอบหมายช่าง และปิดงานเมื่อทำเสร็จ",
      icon: "clipboard-outline",
      tint: colors.primarySoft,
      iconColor: colors.primary,
      onPress: () => navigation.navigate("WorkOrderList"),
    },
    {
      key: "Reports",
      label: "รายงาน",
      description: "ใบงานรายวัน สรุปรายสัปดาห์ ภาพรวมผู้บริหาร และอะไหล่ที่ต้องสั่ง",
      icon: "document-text",
      tint: colors.primarySoft,
      iconColor: colors.primary,
      onPress: () => navigation.navigate("ReportsMenu"),
    },
    {
      key: "TransferDocument",
      label: "เอกสารขอโอนสินค้า",
      description: "กรอกรายการ แล้วได้ไฟล์ Word ตามฟอร์มบริษัท",
      icon: "swap-horizontal",
      tint: "#ccfbf1",
      iconColor: "#0d9488",
      onPress: () => navigation.navigate("TransferDocument"),
    },
    {
      key: "Assistant",
      label: "ผู้ช่วย AI",
      description: "ถามข้อมูล หรือให้ช่วยออกเอกสารรายงาน",
      icon: "sparkles",
      tint: "#ede9fe",
      iconColor: "#7c3aed",
      onPress: () => navigation.navigate("Assistant"),
    },
    {
      key: "FlowList",
      label: "วินิจฉัยอาการเสีย",
      description: "ตอบใช่/ไม่ทีละขั้น พร้อมผังวงจร",
      icon: "construct",
      tint: colors.primarySoft,
      iconColor: colors.primary,
      onPress: () => navigation.navigate("FlowList"),
    },
    {
      key: "SparePartList",
      label: "รายการอะไหล่",
      description: "ค้นหารหัส ยี่ห้อ และรูปอะไหล่",
      icon: "cube",
      tint: "#e0e7ff",
      iconColor: "#4f46e5",
      onPress: () => navigation.navigate("SparePartList"),
    },
    {
      key: "BranchCheckIn",
      label: "รายงานตัวเข้าสาขา",
      description: "ยืนยันตำแหน่งด้วย GPS",
      icon: "location",
      tint: colors.dangerSoft,
      iconColor: colors.danger,
      onPress: () => navigation.navigate("BranchCheckIn"),
    },
    {
      key: "WorkLogForm",
      label: "บันทึกการทำงาน",
      description: "ลงงานที่ทำในแต่ละวัน",
      icon: "create",
      tint: colors.warningSoft,
      iconColor: colors.warning,
      onPress: () => navigation.navigate("WorkLogForm"),
    },
    {
      key: "VehicleCheckIn",
      label: "ลงทะเบียนใช้รถ",
      description: "เช็คอิน / คืนรถ พร้อมเลขไมล์",
      icon: "car",
      tint: colors.successSoft,
      iconColor: colors.success,
      onPress: () => navigation.navigate("VehicleCheckIn"),
    },
    {
      key: "ChangePassword",
      label: "เปลี่ยนรหัสผ่าน",
      description: "ตั้งรหัสผ่านใหม่ของบัญชีตัวเอง",
      icon: "key",
      tint: colors.border,
      iconColor: colors.textMuted,
      onPress: () => navigation.navigate("ChangePassword"),
    },
    {
      key: "ConsumableRequest",
      label: "เบิกของใช้สิ้นเปลือง",
      description: "ขอเบิกของจากออฟฟิศ",
      icon: "file-tray-full",
      tint: "#f3e8ff",
      iconColor: "#9333ea",
      onPress: () => navigation.navigate("ConsumableRequest"),
    },
  ];

  return (
    <MenuList
      title={`สวัสดี, ${user?.name ?? ""}`}
      subtitle="เลือกงานที่ต้องการทำ"
      entries={entries}
      footer={<BuildLine />}
    />
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
  build: {
    fontSize: 11,
    lineHeight: 19,
    color: colors.textFaint,
    textAlign: "center",
    marginTop: spacing.lg,
  },
});
