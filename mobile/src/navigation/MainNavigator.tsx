import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "../screens/HomeScreen";
import GuideListScreen from "../screens/GuideListScreen";
import GuideDetailScreen from "../screens/GuideDetailScreen";
import FlowListScreen from "../screens/FlowListScreen";
import FlowRunScreen from "../screens/FlowRunScreen";
import SparePartListScreen from "../screens/SparePartListScreen";
import SparePartDetailScreen from "../screens/SparePartDetailScreen";
import BranchCheckInScreen from "../screens/BranchCheckInScreen";
import BranchHistoryScreen from "../screens/BranchHistoryScreen";
import WorkLogFormScreen from "../screens/WorkLogFormScreen";
import WorkLogHistoryScreen from "../screens/WorkLogHistoryScreen";
import VehicleCheckInScreen from "../screens/VehicleCheckInScreen";
import VehicleHistoryScreen from "../screens/VehicleHistoryScreen";
import ConsumableRequestScreen from "../screens/ConsumableRequestScreen";
import MyConsumableRequestsScreen from "../screens/MyConsumableRequestsScreen";
import ReviewRequestsScreen from "../screens/ReviewRequestsScreen";
import ManageGuidesScreen from "../screens/ManageGuidesScreen";
import ManageFlowsScreen from "../screens/ManageFlowsScreen";
import ManageSparePartsScreen from "../screens/ManageSparePartsScreen";
import ManageConsumablesScreen from "../screens/ManageConsumablesScreen";
import ManageVehiclesScreen from "../screens/ManageVehiclesScreen";
import ManageBranchesScreen from "../screens/ManageBranchesScreen";
import { colors } from "../theme";
import { MainStackParamList } from "./types";

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: "หน้าหลัก" }} />

      <Stack.Screen
        name="GuideList"
        component={GuideListScreen}
        options={{ title: "คู่มือแก้ปัญหา" }}
      />
      <Stack.Screen
        name="GuideDetail"
        component={GuideDetailScreen}
        options={{ title: "วิธีแก้ปัญหา" }}
      />

      <Stack.Screen
        name="FlowList"
        component={FlowListScreen}
        options={{ title: "ผังวินิจฉัยทีละขั้น" }}
      />
      <Stack.Screen name="FlowRun" component={FlowRunScreen} options={{ title: "วินิจฉัย" }} />

      <Stack.Screen
        name="SparePartList"
        component={SparePartListScreen}
        options={{ title: "รายการอะไหล่" }}
      />
      <Stack.Screen
        name="SparePartDetail"
        component={SparePartDetailScreen}
        options={{ title: "ข้อมูลอะไหล่" }}
      />

      <Stack.Screen
        name="BranchCheckIn"
        component={BranchCheckInScreen}
        options={{ title: "รายงานตัวเข้าสาขา" }}
      />
      <Stack.Screen
        name="BranchHistory"
        component={BranchHistoryScreen}
        options={{ title: "ประวัติการรายงานตัว" }}
      />

      <Stack.Screen
        name="WorkLogForm"
        component={WorkLogFormScreen}
        options={{ title: "บันทึกการทำงาน" }}
      />
      <Stack.Screen
        name="WorkLogHistory"
        component={WorkLogHistoryScreen}
        options={{ title: "ประวัติการทำงาน" }}
      />

      <Stack.Screen
        name="VehicleCheckIn"
        component={VehicleCheckInScreen}
        options={{ title: "ลงทะเบียนใช้รถ" }}
      />
      <Stack.Screen
        name="VehicleHistory"
        component={VehicleHistoryScreen}
        options={{ title: "ประวัติการใช้รถ" }}
      />

      <Stack.Screen
        name="ConsumableRequest"
        component={ConsumableRequestScreen}
        options={{ title: "เบิกของใช้สิ้นเปลือง" }}
      />
      <Stack.Screen
        name="MyConsumableRequests"
        component={MyConsumableRequestsScreen}
        options={{ title: "ประวัติการเบิกของ" }}
      />

      <Stack.Screen
        name="ReviewRequests"
        component={ReviewRequestsScreen}
        options={{ title: "อนุมัติคำขอเบิก" }}
      />
      <Stack.Screen
        name="ManageGuides"
        component={ManageGuidesScreen}
        options={{ title: "จัดการคู่มือแก้ปัญหา" }}
      />
      <Stack.Screen
        name="ManageFlows"
        component={ManageFlowsScreen}
        options={{ title: "ตรวจสอบผังวินิจฉัย" }}
      />
      <Stack.Screen
        name="ManageSpareParts"
        component={ManageSparePartsScreen}
        options={{ title: "จัดการข้อมูลอะไหล่" }}
      />
      <Stack.Screen
        name="ManageConsumables"
        component={ManageConsumablesScreen}
        options={{ title: "จัดการของใช้สิ้นเปลือง" }}
      />
      <Stack.Screen
        name="ManageVehicles"
        component={ManageVehiclesScreen}
        options={{ title: "จัดการข้อมูลรถ" }}
      />
      <Stack.Screen
        name="ManageBranches"
        component={ManageBranchesScreen}
        options={{ title: "จัดการข้อมูลสาขา" }}
      />
    </Stack.Navigator>
  );
}
