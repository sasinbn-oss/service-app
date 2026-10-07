import React, { useCallback, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";
import { colors } from "../theme";
import MenuList, { MenuEntry } from "../components/MenuList";
import { AdminStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AdminStackParamList, "AdminMenu">;

export default function AdminMenuScreen({ navigation }: Props) {
  const [pendingCount, setPendingCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      api
        .get<{ count: number }>("/consumable-requests/pending-count")
        .then((res) => setPendingCount(res.data.count))
        .catch(() => setPendingCount(0));
    }, [])
  );

  const entries: MenuEntry[] = [
    {
      key: "ReviewRequests",
      label: "อนุมัติคำขอเบิก",
      labelEn: "Approvals",
      description: "ตรวจและอนุมัติคำขอของพนักงาน",
      icon: "checkmark-circle",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      badge: pendingCount || undefined,
      onPress: () => navigation.navigate("ReviewRequests"),
    },
    {
      key: "ManageFlows",
      label: "ตรวจสอบผังวินิจฉัย",
      labelEn: "Diagnose Flows",
      description: "เติมเส้นทางที่นำเข้าไม่สมบูรณ์",
      icon: "git-branch",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("ManageFlows"),
    },
    {
      key: "ManageGuides",
      label: "จัดการคู่มือแก้ปัญหา",
      labelEn: "Guides",
      description: "เพิ่ม แก้ไข ลบหัวข้อคู่มือ",
      icon: "book",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("ManageGuides"),
    },
    {
      key: "ManageSpareParts",
      label: "จัดการข้อมูลอะไหล่",
      labelEn: "Spare Parts",
      description: "เพิ่มอะไหล่และอัปโหลดรูป",
      icon: "cube",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("ManageSpareParts"),
    },
    {
      key: "ManageConsumables",
      label: "จัดการของใช้สิ้นเปลือง",
      labelEn: "Consumables",
      description: "รายการของและจำนวนคงเหลือ",
      icon: "file-tray-full",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("ManageConsumables"),
    },
    {
      key: "ManageVehicles",
      label: "จัดการข้อมูลรถ",
      labelEn: "Fleet Inventory",
      description: "ทะเบียนและสถานะรถ",
      icon: "car",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("ManageVehicles"),
    },
    {
      key: "ManageUsers",
      label: "สิทธิ์ผู้ใช้",
      labelEn: "Users & Access",
      description: "ตั้งช่าง หัวหน้าภาค แอดมิน และภาคที่ดูแล",
      icon: "people",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("ManageUsers"),
    },
    {
      key: "ManageBranches",
      label: "จัดการข้อมูลสาขา",
      labelEn: "Branches",
      description: "พิกัดและรัศมีของแต่ละสาขา",
      icon: "business",
      tint: colors.primarySoft,
      iconColor: colors.primaryInk,
      onPress: () => navigation.navigate("ManageBranches"),
    },
  ];

  return (
    <MenuList
      title="ระบบหลังบ้าน"
      subtitle="จัดการข้อมูลของทั้งระบบ"
      note="การแก้ไขในหน้านี้มีผลกับผู้ใช้ทุกคน"
      entries={entries}
    />
  );
}
