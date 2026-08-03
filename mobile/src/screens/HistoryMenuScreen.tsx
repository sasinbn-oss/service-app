import React from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors } from "../theme";
import MenuList, { MenuEntry } from "../components/MenuList";
import { HistoryStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<HistoryStackParamList, "HistoryMenu">;

export default function HistoryMenuScreen({ navigation }: Props) {
  const entries: MenuEntry[] = [
    {
      key: "BranchHistory",
      label: "ประวัติการรายงานตัว",
      description: "สาขาที่เข้าไปและเวลาที่บันทึก",
      icon: "location",
      tint: colors.dangerSoft,
      iconColor: colors.danger,
      onPress: () => navigation.navigate("BranchHistory"),
    },
    {
      key: "WorkLogHistory",
      label: "ประวัติการทำงาน",
      description: "งานที่ลงบันทึกย้อนหลัง",
      icon: "create",
      tint: colors.warningSoft,
      iconColor: colors.warning,
      onPress: () => navigation.navigate("WorkLogHistory"),
    },
    {
      key: "VehicleHistory",
      label: "ประวัติการใช้รถ",
      description: "การเบิกใช้และคืนรถ",
      icon: "car",
      tint: colors.successSoft,
      iconColor: colors.success,
      onPress: () => navigation.navigate("VehicleHistory"),
    },
    {
      key: "MyConsumableRequests",
      label: "ประวัติการเบิกของ",
      description: "สถานะคำขอเบิกของคุณ",
      icon: "file-tray-full",
      tint: "#f3e8ff",
      iconColor: "#9333ea",
      onPress: () => navigation.navigate("MyConsumableRequests"),
    },
    {
      key: "GuideList",
      label: "คู่มือแบบข้อความ",
      description: "คู่มือแก้ปัญหาที่เขียนเอง",
      icon: "book",
      tint: colors.primarySoft,
      iconColor: colors.primary,
      onPress: () => navigation.navigate("GuideList"),
    },
  ];

  return (
    <MenuList title="ประวัติการทำงาน" subtitle="ดูข้อมูลย้อนหลังของคุณ" entries={entries} />
  );
}
