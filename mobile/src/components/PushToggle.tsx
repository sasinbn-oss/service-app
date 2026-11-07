/**
 * เปิด/ปิดแจ้งเตือนเข้ามือถือ (Web Push · พ.ย. 69) — อยู่ในเมนูผู้ใช้ (จอคอม) และเมนูข้าง (มือถือ)
 *
 * บอกสถานะตามจริงของเครื่องนี้ ไม่ใช่สวิตช์เปล่า: iPhone ที่ยังไม่ได้เพิ่มไปยังหน้าจอโฮมเปิดไม่ได้ (ข้อจำกัดของ Apple) ·
 * กดไม่อนุญาตไว้แล้วแอปขอใหม่ไม่ได้ ต้องไปเปิดในตั้งค่าเบราว์เซอร์ — บอกทางให้ ไม่ใช่กดแล้วเงียบ
 * ไม่ขึ้นบนแอปมือถือแบบติดตั้ง (ไม่ใช่เว็บ) · ดูในฐานะคนอื่น · ทีม Area (ไม่มีกล่องงาน/แชทใบงาน)
 */
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Switch, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";
import { showAlert } from "../utils/alert";
import { isAreaTeam } from "../utils/areaTeam";
import { disablePush, enablePush, pushState, PushState } from "../utils/push";

const HINT: Partial<Record<PushState, string>> = {
  "ios-needs-home": "iPhone: กดแชร์ → เพิ่มไปยังหน้าจอโฮม แล้วเปิดแอปจากไอคอนนั้นก่อน",
  denied: "ถูกปิดไว้ในตั้งค่าเบราว์เซอร์ — เปิดอนุญาตแจ้งเตือนของเว็บนี้ก่อน",
};

export default function PushToggle({ onDark }: { onDark?: boolean }) {
  const { user } = useAuth();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void pushState().then(setState);
  }, []);
  if (Platform.OS !== "web" || !user || user.viewAs || isAreaTeam(user) || !state || state === "unsupported") return null;
  const ink = onDark ? "#fff" : colors.body;
  const on = state === "on";
  async function flip(next: boolean) {
    setBusy(true);
    try {
      const after = next ? await enablePush() : await disablePush();
      setState(after);
      if (next && after === "on") showAlert("เปิดแจ้งเตือนแล้ว", "เครื่องนี้จะได้แจ้งเตือนเมื่อมีแชทใบงานใหม่ และงานเข้ากล่องงาน");
      else if (next && after === "denied") showAlert("ยังไม่ได้อนุญาต", HINT.denied);
    } catch {
      showAlert("เปิดแจ้งเตือนไม่สำเร็จ", "ลองใหม่อีกครั้ง หรือรีเฟรชหน้าแล้วกดใหม่");
      setState(await pushState());
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.row} accessibilityLabel="แจ้งเตือนเข้ามือถือ">
      <Ionicons name={on ? "notifications" : "notifications-outline"} size={18} color={ink} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.label, { color: ink }]}>แจ้งเตือนเข้ามือถือ</Text>
        {HINT[state] ? <Text style={[styles.hint, onDark && { color: "rgba(255,255,255,0.75)" }]}>{HINT[state]}</Text> : null}
      </View>
      {HINT[state] ? null : (
        <Switch
          value={on}
          disabled={busy}
          onValueChange={(v) => void flip(v)}
          accessibilityLabel={on ? "ปิดแจ้งเตือนเข้ามือถือ" : "เปิดแจ้งเตือนเข้ามือถือ"}
          {...({ "aria-checked": on } as object)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  label: { fontSize: 14.5, fontWeight: "600" },
  hint: { fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: 2 },
});
