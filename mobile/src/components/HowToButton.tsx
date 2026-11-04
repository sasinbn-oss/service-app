/**
 * ปุ่ม "วิธีใช้หน้านี้" (? บนแถบหัว) — เล่นวิธีใช้ของหน้าที่เปิดอยู่ (สอนการใช้งาน · เจ้าของงานเลือก ต.ค. 69)
 *
 * จอแคบ: วงกลม ? ข้างปุ่มรีเฟรช (ช่าง · หัวหน้าภาค · ทีม Area) · จอคอม: ข้างปุ่มรีเฟรชบนแถบบน มีชื่อปุ่มเมื่อกว้าง 1200 ขึ้นไป
 * ชื่อสำหรับโปรแกรมอ่านจอเป็น "วิธีใช้หน้านี้" เสมอ (เทสต์และคนที่ใช้โปรแกรมอ่านจอหาปุ่มด้วยชื่อนี้)
 * ไม่มี tour = ตามหน้าที่เปิดอยู่ (ฟังการเปลี่ยนหน้าแบบเมนูข้าง) · tour = ปุ่มในฟอร์มที่เล่นเรื่องของฟอร์มนั้น
 * · hub = ปุ่มในฟอร์มที่ยังไม่มีวิธีใช้ของตัวเอง (ฟอร์มแก้เคลม · จอคอนเฟิร์มอะไหล่) — เปิดหน้าสอนการใช้งานเสมอ
 * ขึ้นทุกหน้า (เจ้าของงานเลือก "ปุ่ม ? บนแถบหัวของทุกหน้า"): หน้าที่มีวิธีใช้ของตำแหน่งนี้ = เล่นเลย
 * หน้าอื่น = เปิดหน้า "สอนการใช้งาน" (บอกว่ามีเรื่องไหนให้ดูบ้าง) — กดแล้วไม่มีอะไรเกิดขึ้นเลยแย่กว่า
 * ซ่อนเฉพาะในหน้า "สอนการใช้งาน" เอง (กดแล้วก็เปิดหน้าเดิมซ้ำ)
 * แอดมินจอแคบ: แถบหัวเต็มแล้ว ปุ่มเป็นแถวเต็มความกว้างในเมนูข้าง เหนือออกจากระบบ (drawerRow)
 */
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { useAuth } from "../context/AuthContext";
import { navigationRef } from "../navigation/navigationRef";
import { sideMenu } from "./SideMenu";
import { rolesOf, tourById, tourForRoute } from "../utils/howtoTours";
import { howtoTarget, openHowToHub, startHowTo } from "../utils/howto";
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
  target,
  drawerRow,
  hub,
}: {
  /** จอแคบ / ในหัวหน้าต่าง: วงกลม ? อย่างเดียว */
  compact?: boolean;
  /** เล่นเรื่องนี้เสมอ (ปุ่มในฟอร์ม) แทนการตามหน้าที่เปิดอยู่ */
  tour?: string;
  /** ชื่อคงที่ของปุ่ม — แถบหัว = app.help · แถวในเมนูข้าง = menu.help · ในหน้าต่างใบงาน/ฟอร์มใช้ชื่อของตัวเอง */
  target?: string;
  /** แถวเต็มความกว้างในเมนูข้าง (แอดมินจอแคบ) — กดแล้วปิดเมนูก่อน */
  drawerRow?: boolean;
  /**
   * เปิดหน้าสอนการใช้งานเสมอ ไม่ตามหน้าที่เปิดอยู่ — ฟอร์มที่ซ้อนในหน้าใบงานแต่ยังไม่มีวิธีใช้ของตัวเอง
   * ถ้าตามหน้า ช่างที่กด ? ในฟอร์มแก้เคลมจะได้วิธีใช้ "ใบงาน" ที่ชี้ของใต้ฟอร์ม (ซึ่งถูกบังอยู่ทั้งหมด)
   */
  hub?: boolean;
}) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const route = useCurrentRouteName();
  if (!tour && route === "HowTo") return null;
  const found = hub ? null : tour ? tourById(tour) ?? null : tourForRoute(rolesOf(user), route);
  const press = () => {
    if (drawerRow) {
      sideMenu.close();
      // รอเมนูเลื่อนออกก่อนเริ่ม — ขั้นแรกหาปุ่มในหน้าที่เมนูกำลังบังอยู่ไม่เจอแล้วข้ามไปเปล่า ๆ
      if (found) setTimeout(() => void startHowTo(found.id), 260);
      else openHowToHub();
      return;
    }
    if (found) void startHowTo(found.id);
    else openHowToHub();
  };
  const id = target ?? (drawerRow ? "menu.help" : "app.help");
  if (drawerRow) {
    return (
      <TouchableOpacity accessibilityLabel="วิธีใช้หน้านี้" onPress={press} style={styles.row} {...howtoTarget(id)}>
        <Ionicons name="help-circle-outline" size={20} color="#fff" />
        <Text style={styles.rowText}>วิธีใช้หน้านี้</Text>
      </TouchableOpacity>
    );
  }
  const labelled = !compact && width >= 1200;
  return (
    <TouchableOpacity
      accessibilityLabel="วิธีใช้หน้านี้"
      onPress={press}
      style={[styles.btn, labelled ? styles.btnWide : styles.btnRound]}
      {...howtoTarget(id)}
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
  // สีเดียวกับปุ่มออกจากระบบในเมนูข้าง (พื้นเมนูมืดทั้งสองโหมด)
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.sideLine,
  },
  rowText: { color: "#fff", fontSize: 14, lineHeight: 20, fontWeight: "700" },
});
