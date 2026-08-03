import React from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";
import MenuList, { MenuEntry } from "../components/MenuList";
import { HomeStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<HomeStackParamList, "HomeMenu">;

export default function HomeScreen({ navigation }: Props) {
  const { user } = useAuth();

  const entries: MenuEntry[] = [
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
    />
  );
}
