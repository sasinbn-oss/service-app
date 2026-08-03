import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import HomeScreen from "../screens/HomeScreen";
import HistoryMenuScreen from "../screens/HistoryMenuScreen";
import AdminMenuScreen from "../screens/AdminMenuScreen";
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

import { useAuth } from "../context/AuthContext";
import { colors, radius, spacing } from "../theme";
import {
  AdminStackParamList,
  HistoryStackParamList,
  HomeStackParamList,
  MainTabParamList,
} from "./types";

const commonScreenOptions = {
  headerStyle: { backgroundColor: colors.card },
  headerTintColor: colors.text,
  headerTitleStyle: { fontSize: 17, fontWeight: "700" as const },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

/** Sign-out lives in the header so every tab can reach it. */
function LogoutButton() {
  const { logout } = useAuth();
  return (
    <TouchableOpacity onPress={logout} style={styles.logout}>
      <Ionicons name="log-out-outline" size={18} color={colors.danger} />
      <Text style={styles.logoutText}>ออกจากระบบ</Text>
    </TouchableOpacity>
  );
}

const HomeStack = createNativeStackNavigator<HomeStackParamList>();

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={commonScreenOptions}>
      <HomeStack.Screen
        name="HomeMenu"
        component={HomeScreen}
        options={{ title: "งานช่าง", headerRight: () => <LogoutButton /> }}
      />
      <HomeStack.Screen
        name="FlowList"
        component={FlowListScreen}
        options={{ title: "วินิจฉัยอาการเสีย" }}
      />
      <HomeStack.Screen name="FlowRun" component={FlowRunScreen} options={{ title: "วินิจฉัย" }} />
      <HomeStack.Screen
        name="SparePartList"
        component={SparePartListScreen}
        options={{ title: "รายการอะไหล่" }}
      />
      <HomeStack.Screen
        name="SparePartDetail"
        component={SparePartDetailScreen}
        options={{ title: "ข้อมูลอะไหล่" }}
      />
      <HomeStack.Screen
        name="BranchCheckIn"
        component={BranchCheckInScreen}
        options={{ title: "รายงานตัวเข้าสาขา" }}
      />
      <HomeStack.Screen
        name="WorkLogForm"
        component={WorkLogFormScreen}
        options={{ title: "บันทึกการทำงาน" }}
      />
      <HomeStack.Screen
        name="VehicleCheckIn"
        component={VehicleCheckInScreen}
        options={{ title: "ลงทะเบียนใช้รถ" }}
      />
      <HomeStack.Screen
        name="ConsumableRequest"
        component={ConsumableRequestScreen}
        options={{ title: "เบิกของใช้สิ้นเปลือง" }}
      />
    </HomeStack.Navigator>
  );
}

const HistoryStack = createNativeStackNavigator<HistoryStackParamList>();

function HistoryStackNavigator() {
  return (
    <HistoryStack.Navigator screenOptions={commonScreenOptions}>
      <HistoryStack.Screen
        name="HistoryMenu"
        component={HistoryMenuScreen}
        options={{ title: "ประวัติการทำงาน", headerRight: () => <LogoutButton /> }}
      />
      <HistoryStack.Screen
        name="BranchHistory"
        component={BranchHistoryScreen}
        options={{ title: "ประวัติการรายงานตัว" }}
      />
      <HistoryStack.Screen
        name="WorkLogHistory"
        component={WorkLogHistoryScreen}
        options={{ title: "ประวัติการทำงาน" }}
      />
      <HistoryStack.Screen
        name="VehicleHistory"
        component={VehicleHistoryScreen}
        options={{ title: "ประวัติการใช้รถ" }}
      />
      <HistoryStack.Screen
        name="MyConsumableRequests"
        component={MyConsumableRequestsScreen}
        options={{ title: "ประวัติการเบิกของ" }}
      />
      <HistoryStack.Screen
        name="GuideList"
        component={GuideListScreen}
        options={{ title: "คู่มือแก้ปัญหา" }}
      />
      <HistoryStack.Screen
        name="GuideDetail"
        component={GuideDetailScreen}
        options={{ title: "วิธีแก้ปัญหา" }}
      />
    </HistoryStack.Navigator>
  );
}

const AdminStack = createNativeStackNavigator<AdminStackParamList>();

function AdminStackNavigator() {
  return (
    <AdminStack.Navigator screenOptions={commonScreenOptions}>
      <AdminStack.Screen
        name="AdminMenu"
        component={AdminMenuScreen}
        options={{ title: "ระบบหลังบ้าน", headerRight: () => <LogoutButton /> }}
      />
      <AdminStack.Screen
        name="ReviewRequests"
        component={ReviewRequestsScreen}
        options={{ title: "อนุมัติคำขอเบิก" }}
      />
      <AdminStack.Screen
        name="ManageFlows"
        component={ManageFlowsScreen}
        options={{ title: "ตรวจสอบผังวินิจฉัย" }}
      />
      <AdminStack.Screen
        name="ManageGuides"
        component={ManageGuidesScreen}
        options={{ title: "จัดการคู่มือแก้ปัญหา" }}
      />
      <AdminStack.Screen
        name="ManageSpareParts"
        component={ManageSparePartsScreen}
        options={{ title: "จัดการข้อมูลอะไหล่" }}
      />
      <AdminStack.Screen
        name="ManageConsumables"
        component={ManageConsumablesScreen}
        options={{ title: "จัดการของใช้สิ้นเปลือง" }}
      />
      <AdminStack.Screen
        name="ManageVehicles"
        component={ManageVehiclesScreen}
        options={{ title: "จัดการข้อมูลรถ" }}
      />
      <AdminStack.Screen
        name="ManageBranches"
        component={ManageBranchesScreen}
        options={{ title: "จัดการข้อมูลสาขา" }}
      />
    </AdminStack.Navigator>
  );
}

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * React Navigation sizes its own tab label to the font size and clips the
 * overflow, which cuts the tone and vowel marks off Thai words. Rendering the
 * label here keeps control of the line box.
 */
function tabLabel(text: string) {
  // No numberOfLines: on web that becomes a single-line clamp box which cuts
  // the marks off. The labels are short enough to never wrap.
  return ({ color }: { color: string }) => (
    <Text style={[styles.tabLabel, { color }]}>{text}</Text>
  );
}

export default function MainNavigator() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackNavigator}
        options={{
          title: "หน้าหลัก",
          tabBarLabel: tabLabel("หน้าหลัก"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="HistoryTab"
        component={HistoryStackNavigator}
        options={{
          title: "ประวัติ",
          tabBarLabel: tabLabel("ประวัติ"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "time" : "time-outline"} size={24} color={color} />
          ),
        }}
      />
      {isAdmin && (
        <Tab.Screen
          name="AdminTab"
          component={AdminStackNavigator}
          options={{
            title: "Admin",
            tabBarLabel: tabLabel("Admin"),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "settings" : "settings-outline"}
                size={24}
                color={color}
              />
            ),
          }}
        />
      )}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    paddingTop: 8,
    // Web gets no safe-area inset, so the bar needs an explicit height to leave
    // room for the label. These keys must be absent on native rather than set
    // to undefined: this style is merged over the bar's own computed style, so
    // an explicit `height: undefined` erases the height React Navigation
    // derives from the safe-area inset and collapses the bar out of sight.
    ...(Platform.OS === "web" ? { height: 76, paddingBottom: 12 } : null),
  },
  tabItem: { paddingVertical: 2 },
  // Thai vowel and tone marks sit above the line, so the label needs a taller
  // lineHeight than the font size or the marks get clipped.
  tabLabel: { fontSize: 12, lineHeight: 20, fontWeight: "600", marginTop: 2 },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  logoutText: { color: colors.danger, fontWeight: "600", fontSize: 13 },
});
