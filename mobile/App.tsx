import React from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import AuthNavigator from "./src/navigation/AuthNavigator";
import MainNavigator from "./src/navigation/MainNavigator";
import AppShell from "./src/components/AppShell";
import ChangePasswordScreen from "./src/screens/ChangePasswordScreen";
import { colors } from "./src/theme";

function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
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
    <NavigationContainer>
      <AppShell>
        {!user ? (
          <AuthNavigator />
        ) : user.mustChangePassword ? (
          <ChangePasswordScreen forced />
        ) : (
          <MainNavigator />
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
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
