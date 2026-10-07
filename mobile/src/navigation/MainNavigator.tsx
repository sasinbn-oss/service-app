import React from "react";
import { Image, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { createNativeStackNavigator, NativeStackHeaderProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import SideMenu, { DockedSideMenu, MenuButton, useDocked } from "../components/SideMenu";
import { pageEnterLayout } from "../components/PageEnter";
import {
  AdminStackParamList,
  HistoryStackParamList,
  HomeStackParamList,
  MainTabParamList,
} from "./types";

/**
 * หน้าที่วาดชื่อหน้าตัวใหญ่ของตัวเองอยู่แล้ว — บนจอคอมไม่ต้องมีแถบชื่อหน้าซ้ำ
 * (บนจอแคบยังมี เพราะแถบนั้นเป็นที่อยู่ของปุ่มสามขีด)
 */
const OWN_TITLE = new Set([
  "HomeMenu",
  "WorkOrderList",
  "MachineDashboard",
  "ManageVehicles",
  "ManageUsers",
  "AdminMenu",
  "HistoryMenu",
]);

/**
 * แถบชื่อหน้าใต้แถบโลโก้ แทนแถบหัวของ navigator
 *
 * ไม่มีลูกศรย้อนกลับแล้ว ตามที่ตกลงกับเจ้าของงาน — ไปหน้าอื่นผ่านเมนูสามขีด
 * หน้าย่อย (เช่นใบงานใบหนึ่ง) มีทางลัดชื่อหน้าก่อนหน้า "ใบงานซ่อม ›" กดกลับรายการได้
 * เพราะเปิดใบงานทีละใบแล้วต้องไล่กลับทางเมนูทุกครั้งจะช้าเกิน
 *
 * จอแคบ: ☰ + ชื่อหน้า (เมนูข้างไม่มีที่ค้าง ☰ จึงอยู่ตรงนี้)
 * จอคอม: ชื่อหน้าตัวใหญ่อย่างเดียว ☰ อยู่หัวเมนูข้างแล้ว
 */
function PageHeader({ navigation, route, options, back }: NativeStackHeaderProps) {
  const { canDock } = useDocked();
  if (canDock && OWN_TITLE.has(route.name)) return null;
  const title = typeof options.title === "string" ? options.title : route.name;
  const crumb = back ? (
    <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel={`กลับไป${back.title}`}>
      <Text style={styles.crumb} numberOfLines={1}>
        <Text style={styles.crumbLink}>{back.title}</Text> ›
      </Text>
    </TouchableOpacity>
  ) : null;
  if (canDock) {
    return (
      <View style={styles.pageHeadWide}>
        {crumb}
        <Text style={[styles.pageHeadTitle, headingFont]} numberOfLines={1}>
          {title}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.pageHeadNarrow}>
      <MenuButton />
      <View style={{ flex: 1, minWidth: 0 }}>
        {crumb}
        <Text style={[styles.pageHeadNarrowTitle, headingFont]} numberOfLines={1}>
          {title}
        </Text>
      </View>
    </View>
  );
}

/**
 * ใบงานกับฟอร์มเปิดใบงานเปิดเป็นหน้าต่างลอยทับหน้าเดิม (ตัวหน้าต่างวาดใน PopupScreen)
 * หน้าข้างหลังยังแสดงอยู่ใต้ฉากมืด ปิดแล้วกลับมาที่เดิมในรายการ
 */
const POPUP = {
  presentation: "transparentModal" as const,
  animation: "fade" as const,
  headerShown: false,
  contentStyle: { backgroundColor: "transparent" },
};

const commonScreenOptions = {
  header: (props: NativeStackHeaderProps) => <PageHeader {...props} />,
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
 * แถบโลโก้บนสุด ยาวเต็มจอ อยู่ทุกหน้า
 *
 * เดิมแบรนด์อยู่บนแถบหัวของหน้าแรกแต่ละแท็บ หน้าย่อยไม่มี — เปิดหน้าลึก ๆ แล้ว
 * ไม่มีทั้งโลโก้ ปุ่มรีเฟรช และปุ่มออกจากระบบ ตามตัวอย่างที่ตกลงไว้ ย้ายมาไว้แถวเดียวบนสุด
 */
function AppTopBar() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 640;
  return (
    <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
      <Brand subtitle="ระบบงานช่างซ่อม" />
      <View style={{ flex: 1 }} />
      {wide && user ? (
        <View style={styles.who}>
          <Text style={styles.whoName} numberOfLines={1}>
            {user.name}
          </Text>
          <Text style={styles.whoRole}>{user.superAdmin ? "Super Admin" : ROLE_LABEL[user.role] ?? user.role}</Text>
        </View>
      ) : null}
      <LogoutButton />
    </View>
  );
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "แอดมิน",
  SUPERVISOR: "หัวหน้าภาค",
  EMPLOYEE: "ช่าง",
};

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
    <HomeStack.Navigator screenOptions={commonScreenOptions} screenLayout={pageEnterLayout}>
      <HomeStack.Screen
        name="HomeMenu"
        component={HomeScreen}
        options={{
          title: "หน้าหลัก",
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
        options={{ title: "เปิดใบงานใหม่", ...POPUP }}
      />
      <HomeStack.Screen
        name="WorkOrderDetail"
        component={WorkOrderDetailScreen}
        options={{ title: "ใบงาน", ...POPUP }}
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
    <WorkStack.Navigator screenOptions={commonScreenOptions} screenLayout={pageEnterLayout}>
      <WorkStack.Screen
        name="WorkOrderList"
        component={WorkOrderListScreen}
        options={{
          title: "ใบงานซ่อม",
        }}
      />
      <WorkStack.Screen
        name="WorkOrderForm"
        component={WorkOrderFormScreen}
        options={{ title: "เปิดใบงานใหม่", ...POPUP }}
      />
      <WorkStack.Screen
        name="WorkOrderDetail"
        component={WorkOrderDetailScreen}
        options={{ title: "ใบงาน", ...POPUP }}
      />
    </WorkStack.Navigator>
  );
}

const HistoryStack = createNativeStackNavigator<HistoryStackParamList>();

function HistoryStackNavigator() {
  return (
    <HistoryStack.Navigator screenOptions={commonScreenOptions} screenLayout={pageEnterLayout}>
      <HistoryStack.Screen
        name="HistoryMenu"
        component={HistoryMenuScreen}
        options={{
          title: "ประวัติการทำงาน",
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
    <AdminStack.Navigator screenOptions={commonScreenOptions} screenLayout={pageEnterLayout}>
      <AdminStack.Screen
        name="AdminMenu"
        component={AdminMenuScreen}
        options={{
          title: "ระบบหลังบ้าน",
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

  return (
    <View style={{ flex: 1 }}>
      <AppTopBar />
      <View style={{ flex: 1, minHeight: 0, flexDirection: docked ? "row" : "column" }}>
      {docked ? <DockedSideMenu /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            // สลับแท็บแบบจางเข้า ไม่ตัดฉับ — ตามการเปลี่ยนหน้าของต้นแบบ (เฉพาะเว็บ มือถือคงแบบเดิม)
            animation: Platform.OS === "web" ? "fade" : "none",
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
      {/* อยู่ในส่วนล่าง เมนูเลื่อนออกมาใต้แถบโลโก้ ไม่ทับโลโก้ ตามตัวอย่าง */}
      {docked ? null : <SideMenu />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  who: { alignItems: "flex-end", maxWidth: 200 },
  whoName: { fontSize: 15, lineHeight: 20, fontWeight: "700", color: colors.text },
  whoRole: { fontSize: 11, lineHeight: 16, fontWeight: "600", color: colors.primaryInk },
  pageHeadWide: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, backgroundColor: colors.background },
  pageHeadTitle: { fontSize: 24, lineHeight: 34, fontWeight: "700", color: colors.text },
  pageHeadNarrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pageHeadNarrowTitle: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: colors.text },
  crumb: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  crumbLink: { color: colors.primaryInk, fontWeight: "700" },
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
