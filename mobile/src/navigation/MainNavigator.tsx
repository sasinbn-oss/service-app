import React from "react";
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Ionicons from "@expo/vector-icons/Ionicons";

import HomeScreen from "../screens/HomeScreen";
import TransferDocumentScreen from "../screens/TransferDocumentScreen";
import MachineDashboardScreen from "../screens/MachineDashboardScreen";
import MachineImportScreen from "../screens/MachineImportScreen";
import WorkOrderListScreen from "../screens/WorkOrderListScreen";
import WorkOrderFormScreen from "../screens/WorkOrderFormScreen";
import WorkOrderDetailScreen from "../screens/WorkOrderDetailScreen";
import ReportsMenuScreen from "../screens/ReportsMenuScreen";
import ReportScreen from "../screens/ReportScreen";
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
import ChangePasswordScreen from "../screens/ChangePasswordScreen";
import MyConsumableRequestsScreen from "../screens/MyConsumableRequestsScreen";
import ReviewRequestsScreen from "../screens/ReviewRequestsScreen";
import ManageGuidesScreen from "../screens/ManageGuidesScreen";
import ManageFlowsScreen from "../screens/ManageFlowsScreen";
import ManageSparePartsScreen from "../screens/ManageSparePartsScreen";
import ManageConsumablesScreen from "../screens/ManageConsumablesScreen";
import ManageVehiclesScreen from "../screens/ManageVehiclesScreen";
import ManageBranchesScreen from "../screens/ManageBranchesScreen";
import ManageUsersScreen from "../screens/ManageUsersScreen";

import { useAuth } from "../context/AuthContext";
import { colors, radius, spacing, headingFont } from "../theme";
import { showAlert } from "../utils/alert";
import RefreshButton from "../components/RefreshButton";
import SideMenu, { DOCK_WIDTH, DockedSideMenu, MenuButton, useDocked } from "../components/SideMenu";
import { useDockWidth } from "../components/AppShell";
import {
  AdminStackParamList,
  HistoryStackParamList,
  HomeStackParamList,
  MainTabParamList,
} from "./types";

const commonScreenOptions = {
  headerStyle: { backgroundColor: colors.card },
  headerTintColor: colors.navy,
  headerTitleStyle: { ...headingFont, fontSize: 17, fontWeight: "700" as const, color: colors.text },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

/**
 * ชื่อระบบบนแถบบนของหน้าแรกแต่ละแท็บ
 *
 * บรรทัดล่างบอกว่าอยู่แท็บไหน เพราะหน้าแรกของทุกแท็บใช้แบรนด์เดียวกัน
 * ถ้าไม่มีบรรทัดนี้จะดูไม่ออกว่ากดเปลี่ยนแท็บไปแล้วหรือยัง
 */
function Brand({ subtitle }: { subtitle: string }) {
  return (
    <View style={styles.brand}>
      <View style={styles.brandLogo}>
        <Image source={require("../../assets/logo-otter.png")} style={styles.brandLogoImg} />
      </View>
      <View>
        <View style={styles.brandNameRow}>
          <Text style={[styles.brandName, headingFont]}>OTTERI</Text>
          <View style={styles.brandPill}>
            <Text style={styles.brandPillText}>SERVICE</Text>
          </View>
        </View>
        <View style={styles.brandSubRow}>
          <View style={styles.brandDot} />
          <Text style={styles.brandSub}>{subtitle}</Text>
        </View>
      </View>
    </View>
  );
}

/** ตัวอักษรแรกของชื่อในวงกลม บอกว่าใครล็อกอินอยู่ โดยไม่กินที่บนจอมือถือ */
function UserAvatar() {
  const { user } = useAuth();
  return (
    <View style={styles.avatar}>
      <Text style={[styles.avatarText, headingFont]}>{(user?.name ?? "?").trim().charAt(0)}</Text>
    </View>
  );
}

/**
 * ออกจากระบบอยู่บนแถบบนเพื่อให้ทุกแท็บกดได้
 *
 * ถามก่อนเสมอ เพราะปุ่มอยู่มุมจอที่นิ้วโป้งแตะโดนง่าย และออกแล้วต้องพิมพ์รหัสใหม่
 */
function LogoutButton() {
  const { logout } = useAuth();
  return (
    <View style={styles.headerRight}>
      <UserAvatar />
      <RefreshButton />
      <TouchableOpacity
        accessibilityLabel="ออกจากระบบ"
        onPress={() =>
          showAlert("ยืนยัน", "ต้องการออกจากระบบ?", [
            { text: "ยกเลิก", style: "cancel" },
            { text: "ตกลง", onPress: logout },
          ])
        }
        style={styles.logout}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.navy} />
      </TouchableOpacity>
    </View>
  );
}

const HomeStack = createNativeStackNavigator<HomeStackParamList>();

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={commonScreenOptions}>
      <HomeStack.Screen
        name="HomeMenu"
        component={HomeScreen}
        options={{
          title: "งานช่าง",
          headerTitle: () => <Brand subtitle="งานช่าง" />,
          headerLeft: () => <MenuButton />,
          headerRight: () => <LogoutButton />,
        }}
      />
      <HomeStack.Screen
        name="MachineDashboard"
        component={MachineDashboardScreen}
        options={{ title: "ติดตามเครื่องเสีย" }}
      />
      <HomeStack.Screen
        name="ReportsMenu"
        component={ReportsMenuScreen}
        options={{ title: "รายงาน" }}
      />
      <HomeStack.Screen
        name="Report"
        component={ReportScreen}
        options={({ route }) => ({ title: route.params.title })}
      />
      <HomeStack.Screen
        name="MachineImport"
        component={MachineImportScreen}
        options={{ title: "อัปโหลดรายงานเครื่อง" }}
      />
      <HomeStack.Screen
        name="WorkOrderList"
        component={WorkOrderListScreen}
        options={{ title: "ใบงานซ่อม" }}
      />
      <HomeStack.Screen
        name="WorkOrderForm"
        component={WorkOrderFormScreen}
        options={{ title: "เปิดใบงานใหม่" }}
      />
      <HomeStack.Screen
        name="WorkOrderDetail"
        component={WorkOrderDetailScreen}
        options={{ title: "ใบงาน" }}
      />
      <HomeStack.Screen
        name="TransferDocument"
        component={TransferDocumentScreen}
        options={{ title: "เอกสารขอโอนสินค้า" }}
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
      <HomeStack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ title: "เปลี่ยนรหัสผ่าน" }}
      />
    </HomeStack.Navigator>
  );
}

/**
 * แท็บ "ใบงาน" ในแถบล่าง ตามต้นแบบ OTTERI
 *
 * ใบงานคือสิ่งที่ช่างกับหัวหน้าภาคเปิดบ่อยที่สุด เดิมต้องกดหน้าแรกแล้วกดเมนู
 * อีกชั้น — แท็บนี้มีชุดหน้าของตัวเอง (รายการ รายละเอียด เปิดใหม่) จะได้กด
 * กลับไปมาโดยไม่หลุดออกจากแท็บ เมนูในหน้าแรกยังพาไปหน้าเดียวกันได้เหมือนเดิม
 */
const WorkStack = createNativeStackNavigator<HomeStackParamList>();

function WorkStackNavigator() {
  return (
    <WorkStack.Navigator screenOptions={commonScreenOptions}>
      <WorkStack.Screen
        name="WorkOrderList"
        component={WorkOrderListScreen}
        options={{
          title: "ใบงานซ่อม",
          headerTitle: () => <Brand subtitle="ใบงานซ่อม" />,
          headerLeft: () => <MenuButton />,
          headerRight: () => <LogoutButton />,
        }}
      />
      <WorkStack.Screen
        name="WorkOrderForm"
        component={WorkOrderFormScreen}
        options={{ title: "เปิดใบงานใหม่" }}
      />
      <WorkStack.Screen
        name="WorkOrderDetail"
        component={WorkOrderDetailScreen}
        options={{ title: "ใบงาน" }}
      />
    </WorkStack.Navigator>
  );
}

const HistoryStack = createNativeStackNavigator<HistoryStackParamList>();

function HistoryStackNavigator() {
  return (
    <HistoryStack.Navigator screenOptions={commonScreenOptions}>
      <HistoryStack.Screen
        name="HistoryMenu"
        component={HistoryMenuScreen}
        options={{
          title: "ประวัติการทำงาน",
          headerTitle: () => <Brand subtitle="ประวัติการทำงาน" />,
          headerLeft: () => <MenuButton />,
          headerRight: () => <LogoutButton />,
        }}
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
        options={{
          title: "ระบบหลังบ้าน",
          headerTitle: () => <Brand subtitle="ระบบหลังบ้าน" />,
          headerLeft: () => <MenuButton />,
          headerRight: () => <LogoutButton />,
        }}
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
      <AdminStack.Screen
        name="ManageUsers"
        component={ManageUsersScreen}
        options={{ title: "สิทธิ์ผู้ใช้" }}
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
  // จอคอม: เมนูค้างไว้ด้านซ้ายและซ่อนแถบล่าง ตามต้นแบบ — เมนูข้างพาไปได้ทุกแท็บอยู่แล้ว
  // แถบล่างบนจอกว้างทำให้ต้องเลื่อนสายตาไปล่างสุดของจอเพื่อเปลี่ยนหน้า
  const { docked } = useDocked();
  useDockWidth(docked ? DOCK_WIDTH : 0);

  return (
    <View style={{ flex: 1, flexDirection: docked ? "row" : "column" }}>
      {docked ? <DockedSideMenu /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.primaryInk,
            tabBarInactiveTintColor: colors.textMuted,
            // แท็บที่เลือกอยู่มีพื้นฟ้าอ่อนรองแบบ OTTERI — แค่เปลี่ยนสีไอคอน
            // มองจากระยะแขนแยกไม่ออกว่าอยู่แท็บไหน
            tabBarActiveBackgroundColor: colors.primarySoft,
            tabBarStyle: docked ? { display: "none" } : styles.tabBar,
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
            name="WorkOrdersTab"
            component={WorkStackNavigator}
            options={{
              title: "ใบงาน",
              tabBarLabel: tabLabel("ใบงาน"),
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? "clipboard" : "clipboard-outline"} size={24} color={color} />
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
      </View>
      {docked ? null : <SideMenu />}
    </View>
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
  tabItem: { paddingVertical: 2, borderRadius: 14, marginHorizontal: 6, overflow: "hidden" },
  // Thai vowel and tone marks sit above the line, so the label needs a taller
  // lineHeight than the font size or the marks get clipped.
  tabLabel: { fontSize: 12, lineHeight: 20, fontWeight: "600", marginTop: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginRight: spacing.sm },
  logout: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sky50,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.sky200,
  },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 15, lineHeight: 22 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandLogo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  brandLogoImg: { width: "100%", height: "100%" },
  brandNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  brandName: { fontSize: 18, lineHeight: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  brandPill: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 7 },
  brandPillText: { color: "#fff", fontSize: 10, lineHeight: 17, fontWeight: "800", letterSpacing: 0.6 },
  brandSubRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  brandDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  brandSub: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
});
