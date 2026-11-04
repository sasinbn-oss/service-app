import React, { useRef } from "react";
import { View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { navigationRef, takeScreenAfterReload } from "./src/navigation/navigationRef";
import {
  documentTitle,
  homeScreenFor,
  installHashLinks,
  linking,
  noteBootLink,
  setLinkHome,
} from "./src/navigation/linking";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import AuthNavigator from "./src/navigation/AuthNavigator";
import MainNavigator from "./src/navigation/MainNavigator";
import AppShell from "./src/components/AppShell";
import { FeedbackHost, WasherLoader } from "./src/components/Feedback";
import LoadingBar from "./src/components/LoadingBar";
import UpdateGate from "./src/components/UpdateGate";
import PullToRefresh from "./src/components/PullToRefresh";
import ChangePasswordScreen from "./src/screens/ChangePasswordScreen";
import { colors } from "./src/theme";
import { installWebFonts } from "./src/utils/webFonts";

installWebFonts();
// ก่อน NavigationContainer ขึ้นจอ — ตัวฟังย้อนกลับของเราต้องลงทะเบียนก่อนของ React Navigation (ดู linking.ts)
installHashLinks();

function RootNavigator() {
  const { user, loading } = useAuth();
  // หน้าที่เปิดไว้ก่อนแอปโหลดตัวเองใหม่ (สลับโหมดมืด) — อ่านครั้งเดียวหลังรู้ตัวผู้ใช้ (ตอนแรกยัง loading)
  const restore = useRef<{ state?: object } | null>(null);
  if (!loading && !restore.current) {
    restore.current = { state: takeScreenAfterReload(user?.id) };
    // ลิงก์ที่เปิดมาตอนยังไม่ได้เข้าระบบ — จำไว้ก่อนหน้าเข้าสู่ระบบแทนที่อยู่เป็น /#/login (เข้าระบบแล้วพาไป · linking.ts)
    noteBootLink(!user || !!user.mustChangePassword);
  }
  // หน้าที่เปิดจากลิงก์มีหน้าแรกของคนนี้รองข้างใต้ — ต้องรู้ก่อน NavigationContainer อ่านที่อยู่
  setLinkHome(homeScreenFor(user));

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <WasherLoader text="กำลังโหลด..." />
      </View>
    );
  }

  /**
   * บัญชีที่ยังใช้รหัสตั้งต้น เข้าได้แค่หน้าเปลี่ยนรหัส
   *
   * กั้นทั้งแอปตรงนี้ ไม่ใช่ซ่อนเมนู เพราะหน้าอื่นเข้าไม่ได้อยู่แล้ว (backend ตอบ 423)
   * ถ้าปล่อยให้เข้าไปจะเจอหน้าจอที่โหลดข้อมูลไม่ขึ้นทั้งหมดโดยไม่รู้ว่าทำไม
   */
  return (
    // linking: แต่ละหน้ามีที่อยู่ของตัวเองบนเว็บ (/#/wo/WO-00045) · หน้าที่จำไว้ข้ามการสลับโหมดมืด (initialState) ชนะที่อยู่
    // ซึ่งตรงกันอยู่แล้ว แต่จำทั้งกองหน้าได้ละเอียดกว่า
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      documentTitle={documentTitle}
      initialState={restore.current?.state as never}
    >
      <AppShell>
        {!user ? (
          <AuthNavigator />
        ) : user.mustChangePassword ? (
          <ChangePasswordScreen forced />
        ) : (
          // key ตามผู้ใช้ — สลับไปดูในฐานะคนอื่นแล้วเมนู แท็บ และหน้าแรกต้องเป็นของคนนั้นตั้งแต่ต้น
          // ไม่ใช่ค้างหน้าของ Super Admin ที่คนนั้นไม่มีสิทธิ์เข้า
          <MainNavigator key={user.id} />
        )}
      </AppShell>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <View style={{ flex: 1 }}>
          <RootNavigator />
          <LoadingBar />
          <FeedbackHost />
          <UpdateGate />
          <PullToRefresh />
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
