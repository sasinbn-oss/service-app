/**
 * หน้า "สอนการใช้งาน" (เมนู › เอกสารและบัญชี › สอนการใช้งาน — เจ้าของงานเลือก ต.ค. 69)
 *
 * รายชื่อวิธีใช้ของตำแหน่งนี้ ดูแล้วมีเครื่องหมายถูก กดเพื่อดูซ้ำ — ตามตัวอย่างที่ตกลงไว้ (Launcher "คอม — เมนู สอนการใช้งาน")
 * ปุ่ม ? บนแถบหัวของหน้าที่ยังไม่มีวิธีใช้ก็พามาที่นี่ คนที่กดจึงรู้ว่ามีเรื่องไหนให้ดูบ้าง แทนการกดแล้วเงียบ
 * กดเริ่มจากที่นี่: วิธีใช้ไปหน้าของเรื่องนั้นเองและเปิดของที่ต้องใช้ให้ (เปิดอย่างเดียว ไม่บันทึกอะไร — utils/howto.ts)
 *
 * ตำแหน่งที่ยังไม่มีวิธีใช้ (ทีม Area · Admin Spare Part รอบนี้) เห็นหน้าที่บอกว่ากำลังทำ — เมนูเปิดให้ทุกตำแหน่งแล้ว
 * วันที่วิธีใช้ของตำแหน่งนั้นมา รายการขึ้นที่นี่เองโดยไม่ต้องแก้เมนู
 * ดูในฐานะ: เห็นของคนที่ถูกดู (ผู้สอนดูได้ว่าเขาดูเรื่องไหนแล้ว) · กดดูได้ แต่ไม่บันทึกอะไร
 * ไม่มีข้อมูลให้โหลดใหม่ (ค่ามากับผู้ใช้ที่ล็อกอิน และอัปเดตเองเมื่อดูจบ) จึงไม่ลงทะเบียนปุ่มรีเฟรช
 */
import React from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../components/Tap";
import EmptyState from "../components/EmptyState";
import { useDocked } from "../components/SideMenu";
import { useAuth } from "../context/AuthContext";
import { sessionRoleLabel } from "../utils/roles";
import { rolesOf, stepsFor, toursFor } from "../utils/howtoTours";
import { howtoLayout, startHowTo } from "../utils/howto";
import { colors, headingFont, radius, shadow, spacing } from "../theme";

/** "30 ต.ค. 09:41" เวลาไทย — แบบเดียวกับตัวอย่าง */
function seenText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "ดูแล้ว";
  return `ดูแล้ว ${d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
}

export default function HowToScreen() {
  const { user } = useAuth();
  const { canDock } = useDocked();
  const { width } = useWindowDimensions();
  const roles = rolesOf(user);
  const tours = toursFor(roles);
  const layout = howtoLayout(width);
  const seen = user?.howto?.tours ?? {};
  const done = tours.filter((t) => seen[t.id]).length;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.inner}>
        {/* จอคอมไม่มีแถบชื่อหน้า (OWN_TITLE) — ชื่อตัวใหญ่อยู่ที่นี่ · จอแคบชื่ออยู่บนแถบหัวแล้ว */}
        {canDock ? <Text style={[styles.title, headingFont]}>สอนการใช้งาน</Text> : null}
        {tours.length && user ? (
          <>
            <Text style={styles.sub}>วิธีใช้สำหรับ {sessionRoleLabel(user)} · กดเพื่อดูซ้ำได้ทุกเมื่อ</Text>
            <View style={styles.progress}>
              <View style={styles.bar}>
                <View style={[styles.barOn, { width: `${(done / tours.length) * 100}%` }]} />
              </View>
              <Text style={styles.progressText}>
                ดูแล้ว {done} จาก {tours.length}
              </Text>
            </View>
            <View style={styles.list}>
              {tours.map((t, k) => {
                const at = seen[t.id];
                const n = stepsFor(t, roles, layout).length;
                const label = at ? "ดูอีกครั้ง" : "เริ่มดู";
                return (
                  <View key={t.id} style={[styles.row, k > 0 && styles.rowLine]}>
                    {at ? (
                      <View style={styles.tick} accessibilityLabel="ดูแล้ว">
                        <Ionicons name="checkmark" size={18} color={colors.successInk} />
                      </View>
                    ) : (
                      <View style={styles.ring} />
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowTitle}>{t.title}</Text>
                      <Text style={styles.rowSub}>
                        {n} ขั้น · {at ? seenText(at) : "ยังไม่ได้ดู"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.btn, at ? styles.btnAgain : styles.btnStart]}
                      onPress={() => void startHowTo(t.id, { fromHub: true })}
                      // ปุ่มทุกแถวคำเดียวกัน — ชื่อสำหรับโปรแกรมอ่านจอ (และเทสต์) บอกด้วยว่าเรื่องไหน
                      accessibilityLabel={`${label} ${t.title}`}
                    >
                      <Text style={[styles.btnText, at ? styles.btnAgainText : styles.btnStartText]}>{label}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <EmptyState icon="help-circle-outline" title="ยังไม่มีวิธีใช้สำหรับตำแหน่งนี้" text="กำลังทำเพิ่ม — เปิดใช้แล้วจะขึ้นในหน้านี้" />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  // อ่านง่ายบนจอคอม — รายการสั้น ๆ ไม่ต้องยืดเต็มจอกว้าง
  inner: { width: "100%", maxWidth: 720, alignSelf: "center" },
  title: { fontSize: 24, lineHeight: 34, fontWeight: "800", color: colors.text },
  sub: { fontSize: 14, lineHeight: 22, color: colors.textMuted, marginTop: 2 },
  progress: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  bar: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.border, overflow: "hidden" },
  barOn: { height: 8, borderRadius: radius.pill, backgroundColor: colors.success },
  progressText: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.successInk },
  list: {
    marginTop: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.card,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 72 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.border },
  tick: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.successSoft },
  ring: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colors.borderStrong },
  rowTitle: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: colors.text },
  rowSub: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  btn: { minHeight: 48, paddingHorizontal: 16, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  btnStart: { backgroundColor: colors.navyFill },
  btnAgain: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  btnText: { fontSize: 15, lineHeight: 22, fontWeight: "700" },
  btnStartText: { color: "#fff" },
  btnAgainText: { color: colors.primaryInk },
});
