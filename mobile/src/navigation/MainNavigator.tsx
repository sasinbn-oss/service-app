import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "../screens/HomeScreen";
import VehicleCheckInScreen from "../screens/VehicleCheckInScreen";
import VehicleHistoryScreen from "../screens/VehicleHistoryScreen";
import BranchCheckInScreen from "../screens/BranchCheckInScreen";
import BranchHistoryScreen from "../screens/BranchHistoryScreen";
import WorkLogFormScreen from "../screens/WorkLogFormScreen";
import WorkLogHistoryScreen from "../screens/WorkLogHistoryScreen";
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
        name="BranchCheckIn"
        component={BranchCheckInScreen}
        options={{ title: "รายงานตัวเข้าสาขา" }}
      />
      <Stack.Screen
        name="BranchHistory"
        component={BranchHistoryScreen}
        options={{ title: "ประวัติการรายงานตัว" }}
      />
      <Stack.Screen name="WorkLogForm" component={WorkLogFormScreen} options={{ title: "บันทึกการทำงาน" }} />
      <Stack.Screen
        name="WorkLogHistory"
        component={WorkLogHistoryScreen}
        options={{ title: "ประวัติการทำงาน" }}
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
