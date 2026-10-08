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
      labelEn: "Check-in History",
      description: "สาขาที่เข้าไปและเวลาที่บันทึก",
      icon: "location",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("BranchHistory"),
    },
    {
      key: "WorkLogHistory",
      label: "ประวัติการทำงาน",
      labelEn: "Work Log History",
      description: "งานที่ลงบันทึกย้อนหลัง",
      icon: "create",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("WorkLogHistory"),
    },
    {
      key: "VehicleHistory",
      label: "ประวัติการใช้รถของฉัน",
      labelEn: "My Trips",
      description: "การเบิกใช้และคืนรถ",
      icon: "car",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("VehicleHistory"),
    },
    {
      key: "MyConsumableRequests",
      label: "ประวัติการเบิกของ",
      labelEn: "Request History",
      description: "สถานะคำขอเบิกของคุณ",
      icon: "file-tray-full",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("MyConsumableRequests"),
    },
    {
      key: "GuideList",
      label: "คู่มือแบบข้อความ",
      labelEn: "Guides",
      description: "คู่มือแก้ปัญหาที่เขียนเอง",
      icon: "book",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("GuideList"),
    },
  ];

  return (
    <MenuList title="ประวัติการทำงาน" subtitle="ดูข้อมูลย้อนหลังของคุณ" entries={entries} />
  );
}
