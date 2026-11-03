/**
 * ปุ่ม "วิธีใช้หน้านี้" (? บนแถบหัว) — เล่นวิธีใช้ของหน้าที่เปิดอยู่ (สอนการใช้งาน · เจ้าของงานเลือก ต.ค. 69)
 *
 * จอแคบ: วงกลม ? ข้างปุ่มรีเฟรช (ช่าง · หัวหน้าภาค · ทีม Area) · จอคอม: ข้างปุ่มรีเฟรชบนแถบบน มีชื่อปุ่มเมื่อกว้าง 1200 ขึ้นไป
 * ชื่อสำหรับโปรแกรมอ่านจอเป็น "วิธีใช้หน้านี้" เสมอ (เทสต์และคนที่ใช้โปรแกรมอ่านจอหาปุ่มด้วยชื่อนี้)
 * ไม่มี tour = ตามหน้าที่เปิดอยู่ (ฟังการเปลี่ยนหน้าแบบเมนูข้าง) · tour = ปุ่มในฟอร์มที่เล่นเรื่องของฟอร์มนั้น
 * รอบนี้ปุ่มขึ้นเฉพาะหน้าที่มีวิธีใช้ — หน้าอื่นจะพาไปหน้า "สอนการใช้งาน" เมื่อมีหน้านั้นแล้ว (ก้อนถัดไป)
 */
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { useAuth } from "../context/AuthContext";
import { navigationRef } from "../navigation/navigationRef";
import { rolesOf, tourById, tourForRoute } from "../utils/howtoTours";
import { howtoTarget, startHowTo } from "../utils/howto";
import { colors } from "../theme";

/** ชื่อหน้าที่เปิดอยู่ (หน้าบนสุดของแท็บที่เลือก) — ตัวนำทางอาจยังไม่พร้อมตอนปุ่มขึ้นจอครั้งแรก จึงลองซ้ำสั้น ๆ */
function useCurrentRouteName(): string | null {
  const read = () => (navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name ?? null : null);
  const [name, setName] = useState<string | null>(read);
  useEffect(() => {
    let tries = 0;
    let t: ReturnType<typeof setTimeout> | undefined;
    const update = () => setName(read());
    const wait = () => {
      if (navigationRef.isReady() || tries++ > 40) return update();
      t = setTimeout(wait, 50);
    };
    wait();
    const off = navigationRef.addListener("state", update);
    return () => {
      if (t) clearTimeout(t);
      off();
    };
  }, []);
  return name;
}

export default function HowToButton({
  compact,
  tour,
  target = "app.help",
}: {
  /** จอแคบ / ในหัวหน้าต่าง: วงกลม ? อย่างเดียว */
  compact?: boolean;
  /** เล่นเรื่องนี้เสมอ (ปุ่มในฟอร์ม) แทนการตามหน้าที่เปิดอยู่ */
  tour?: string;
  /** ชื่อคงที่ของปุ่ม — แถบหัว = app.help · ในหน้าต่างใบงาน/ฟอร์มใช้ชื่อของตัวเอง */
  target?: string;
}) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const route = useCurrentRouteName();
  const found = tour ? tourById(tour) ?? null : tourForRoute(rolesOf(user), route);
  if (!found) return null;
  const labelled = !compact && width >= 1200;
  return (
    <TouchableOpacity
      accessibilityLabel="วิธีใช้หน้านี้"
      onPress={() => void startHowTo(found.id)}
      style={[styles.btn, labelled ? styles.btnWide : styles.btnRound]}
      {...howtoTarget(target)}
    >
      <Ionicons name="help-circle-outline" size={22} color={colors.primaryInk} />
      {labelled ? <Text style={styles.text}>วิธีใช้หน้านี้</Text> : null}
    </TouchableOpacity>
  );
}

// ขนาดเดียวกับปุ่มรีเฟรชที่อยู่ติดกัน (RefreshButton) — แถวปุ่มบนแถบหัวสูงเท่ากันหมด
const styles = StyleSheet.create({
  btn: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.sky50,
  },
  btnRound: { width: 40, borderRadius: 20 },
  btnWide: { paddingHorizontal: 14, borderRadius: 999 },
  text: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.primaryInk },
});
