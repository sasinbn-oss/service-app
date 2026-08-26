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
      description: "ตรวจและอนุมัติคำขอของพนักงาน",
      icon: "checkmark-circle",
      tint: colors.successSoft,
      iconColor: colors.success,
      badge: pendingCount || undefined,
      onPress: () => navigation.navigate("ReviewRequests"),
    },
    {
      key: "ManageFlows",
      label: "ตรวจสอบผังวินิจฉัย",
      description: "เติมเส้นทางที่นำเข้าไม่สมบูรณ์",
      icon: "git-branch",
      tint: colors.primarySoft,
      iconColor: colors.primary,
      onPress: () => navigation.navigate("ManageFlows"),
    },
    {
      key: "ManageGuides",
      label: "จัดการคู่มือแก้ปัญหา",
      description: "เพิ่ม แก้ไข ลบหัวข้อคู่มือ",
      icon: "book",
      tint: colors.primarySoft,
      iconColor: colors.primary,
      onPress: () => navigation.navigate("ManageGuides"),
    },
    {
      key: "ManageSpareParts",
      label: "จัดการข้อมูลอะไหล่",
      description: "เพิ่มอะไหล่และอัปโหลดรูป",
      icon: "cube",
      tint: "#e0e7ff",
      iconColor: "#4f46e5",
      onPress: () => navigation.navigate("ManageSpareParts"),
    },
    {
      key: "ManageConsumables",
      label: "จัดการของใช้สิ้นเปลือง",
      description: "รายการของและจำนวนคงเหลือ",
      icon: "file-tray-full",
      tint: "#f3e8ff",
      iconColor: "#9333ea",
      onPress: () => navigation.navigate("ManageConsumables"),
    },
    {
      key: "ManageVehicles",
      label: "จัดการข้อมูลรถ",
      description: "ทะเบียนและสถานะรถ",
      icon: "car",
      tint: colors.successSoft,
      iconColor: colors.success,
      onPress: () => navigation.navigate("ManageVehicles"),
    },
    {
      key: "ManageUsers",
      label: "สิทธิ์ผู้ใช้",
      description: "ตั้งช่าง หัวหน้าภาค แอดมิน และภาคที่ดูแล",
      icon: "people",
      tint: colors.primarySoft,
      iconColor: colors.primary,
      onPress: () => navigation.navigate("ManageUsers"),
    },
    {
      key: "ManageBranches",
      label: "จัดการข้อมูลสาขา",
      description: "พิกัดและรัศมีของแต่ละสาขา",
      icon: "business",
      tint: colors.warningSoft,
      iconColor: colors.warning,
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
