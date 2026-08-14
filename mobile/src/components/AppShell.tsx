import React, { createContext, useCallback, useContext, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { colors } from "../theme";

/** ความกว้างของหน้าฟอร์มทั่วไป กว้างกว่านี้อ่านยากขึ้นไม่ใช่ง่ายขึ้น */
const FORM_WIDTH = 820;

/**
 * เพดานของหน้าที่เป็นตารางข้อมูล
 *
 * ไม่ปล่อยเต็มจอเพราะบนจอ ultrawide หัวตารางจะห่างจากข้อมูลเกินไปจนกวาดตาตามไม่ได้
 */
const DATA_WIDTH = 1600;

const SetWideContext = createContext<(wide: boolean) => void>(() => {});

/**
 * ให้หน้าที่เป็นตารางข้อมูลขอใช้ความกว้างเต็มที่
 *
 * หน้าส่วนใหญ่เป็นฟอร์มที่ออกแบบมาสำหรับมือถือ ปล่อยให้ยืดเต็มจอคอมจะกลายเป็น
 * แอปมือถือที่ถูกซูมขึ้นมา แต่แดชบอร์ดเป็นตารางหลายคอลัมน์ ยิ่งกว้างยิ่งเห็นเยอะ
 * จึงให้ขอเป็นรายหน้า ไม่ใช่ปลดเพดานทิ้งทั้งแอป
 */
export function useWideLayout() {
  const setWide = useContext(SetWideContext);
  useFocusEffect(
    useCallback(() => {
      setWide(true);
      return () => setWide(false);
    }, [setWide])
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [wide, setWide] = useState(false);

  // บนมือถือไม่มีเพดานให้ปรับ แต่ provider ต้องมี ไม่งั้น useWideLayout พัง
  if (Platform.OS !== "web") {
    return <SetWideContext.Provider value={setWide}>{children}</SetWideContext.Provider>;
  }

  return (
    <SetWideContext.Provider value={setWide}>
      <View style={styles.backdrop}>
        <View style={[styles.column, { maxWidth: wide ? DATA_WIDTH : FORM_WIDTH }]}>
          {children}
        </View>
      </View>
    </SetWideContext.Provider>
  );
}

const styles = StyleSheet.create({
  // height + overflow pin the shell to the viewport, and minHeight:0 lets the
  // scrolling content shrink instead of growing and pushing the tab bar off
  // the bottom of the page.
  backdrop: {
    flex: 1,
    height: "100%",
    overflow: "hidden",
    alignItems: "center",
    backgroundColor: colors.border,
  },
  column: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    width: "100%",
    backgroundColor: colors.background,
  },
});
