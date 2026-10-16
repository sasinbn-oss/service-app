/**
 * รายงานทั้งระบบ (เจ้าของงานขอ ต.ค. 69) — แอดมินเท่านั้น
 *
 * ไฟล์เดียวมี 8 ชีต: ภาพรวม · พนักงาน · ทีมช่าง · สาขา · เครื่อง · ใบงาน · อะไหล่ · รถ
 * สร้างที่เซิร์ฟเวอร์ (GET /reports/system) — หน้านี้แค่เลือกช่วงวันที่ของใบงานแล้วกดดาวน์โหลด
 * ไม่มีตัวอย่างบนจอเหมือนรายงานอื่น เพราะข้อมูลทั้งบริษัทไม่มีทางแสดงบนมือถือได้มีประโยชน์
 *
 * ค่าเริ่มต้น = ใบงานทั้งหมด (ตามที่เจ้าของงานเลือก) — คนออกรายงานนี้ส่วนใหญ่อยากได้ "ทุกอย่าง"
 * ช่วงวันที่มีให้เผื่อวันที่ใบงานเยอะจนไฟล์ใหญ่เกินไปเปิดบนมือถือ
 */
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import DateField, { todayBkk } from "../components/DateField";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { openUrl } from "../utils/share";
import { showAlert } from "../utils/alert";
import { colors, radius, shadow, spacing } from "../theme";

const SHEETS: { name: string; detail: string }[] = [
  { name: "ภาพรวม", detail: "จำนวนคนแยกบทบาท สาขา เครื่อง ใบงานแยกขั้น เครื่องแยกยี่ห้อ" },
  { name: "พนักงาน", detail: "รหัส ชื่อ บทบาท ทีม พื้นที่ที่ดูแล เบอร์โทร สถานะบัญชี" },
  { name: "ทีมช่าง", detail: "ภาค หัวหน้าภาคที่ดูแล ช่างในทีม จำนวนสาขา เครื่อง ใบงานค้าง" },
  { name: "สาขา", detail: "รหัส ชื่อ ประเภท ภาค ทีม CM/PM เกรด จำนวนเครื่อง ใบงานค้าง" },
  { name: "เครื่อง", detail: "รหัส ยี่ห้อ รุ่น ขนาด ประกัน สถานะตอนนี้ ใบงานค้าง/ทั้งหมด" },
  { name: "ใบงาน", detail: "ทุกใบ (หรือเฉพาะช่วงที่เลือก) ผู้เปิด ประเภทงาน อาการ สถานะ ทีม ผลปิดงาน" },
  { name: "อะไหล่", detail: "ใช้ไปทั้งหมดกี่ชิ้น และรออยู่ในใบงานค้างกี่ชิ้น" },
  { name: "รถ", detail: "ทะเบียน รุ่น ภาค เลขไมล์ วันหมดภาษี/พ.ร.บ./ประกัน" },
];

/** วันแรกของเดือนนี้ตามเวลาไทย — ช่วงที่คนเลือกบ่อยที่สุดเมื่อไม่เอาทั้งหมด */
const monthStart = () => `${todayBkk().slice(0, 8)}01`;

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function SystemReportScreen() {
  const [range, setRange] = useState(false);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayBkk());
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  const bad = range && (!from || !to || from > to);

  async function download() {
    if (bad) return;
    setBusy(true);
    try {
      const res = await api.get<{ filename: string; path: string; bytes: number }>("/reports/system", {
        params: range ? { from, to } : {},
        loadingText: "กำลังรวบรวมข้อมูลทั้งระบบ...",
        // ข้อมูลทั้งบริษัท + เซิร์ฟเวอร์ฟรีที่อาจกำลังตื่น — ค่า timeout ปกติสั้นเกินไป
        timeout: 120_000,
      });
      setLast(`${res.data.filename} · ${sizeLabel(res.data.bytes)}`);
      const url = resolveImageUrl(res.data.path);
      if (url) await openUrl(url);
    } catch (e) {
      showAlert("ออกรายงานไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sub}>
        รวมข้อมูลทั้งระบบไว้ในไฟล์ Excel เดียว · คน สาขา เครื่อง เป็นข้อมูล ณ ตอนนี้ ช่วงวันที่มีผลกับใบงานเท่านั้น
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>ใบงานที่จะรวมในไฟล์</Text>
        <View style={styles.seg}>
          {[
            { on: false, text: "ทั้งหมด" },
            { on: true, text: "เลือกช่วงวันที่เปิด" },
          ].map((o) => (
            <TouchableOpacity
              key={o.text}
              style={[styles.segBtn, range === o.on && styles.segOn]}
              onPress={() => setRange(o.on)}
              accessibilityLabel={o.text}
            >
              <Text style={[styles.segText, range === o.on && styles.segTextOn]}>{o.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {range ? (
          <View style={styles.dates}>
            <View style={styles.field}>
              <DateField label="เปิดตั้งแต่วันที่" value={from} onChange={setFrom} required />
            </View>
            <View style={styles.field}>
              <DateField label="ถึงวันที่" value={to} onChange={setTo} required />
            </View>
          </View>
        ) : null}
        {bad ? <Text style={styles.error}>วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด</Text> : null}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.download, (busy || bad) && { opacity: 0.6 }]}
          onPress={download}
          disabled={busy || bad}
          accessibilityLabel="ดาวน์โหลดรายงานทั้งระบบ"
        >
          {busy ? <Spinner size="small" color="#fff" /> : <Ionicons name="download-outline" size={17} color="#fff" />}
          <Text style={styles.downloadText}>ดาวน์โหลด Excel</Text>
        </TouchableOpacity>
        {last ? <Text style={styles.meta}>ล่าสุด: {last}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>ในไฟล์มี {SHEETS.length} ชีต</Text>
        {SHEETS.map((s) => (
          <View key={s.name} style={styles.row}>
            <Text style={styles.sheet}>{s.name}</Text>
            <Text style={styles.detail}>{s.detail}</Text>
          </View>
        ))}
        <View style={styles.note}>
          <Ionicons name="lock-closed-outline" size={15} color={colors.warningInk} />
          <Text style={styles.noteText}>
            ไม่มีรหัสผ่าน รูปหน้างาน และข้อมูลบัตรเติมน้ำมัน/Easy Pass · แต่มีเบอร์โทรพนักงาน — ส่งต่อเฉพาะคนที่จำเป็น
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  sub: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, ...shadow.card },
  label: { fontSize: 13, fontWeight: "700", color: colors.text },
  seg: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  segBtn: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 },
  segOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  segText: { fontSize: 14, color: colors.text },
  segTextOn: { color: colors.primary, fontWeight: "700" },
  dates: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  field: { flexGrow: 1, flexBasis: 180, gap: 6 },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.md },
  download: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  downloadText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  meta: { fontSize: 13, color: colors.textMuted },
  row: { flexDirection: "row", gap: spacing.md, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  sheet: { width: 72, fontSize: 14, fontWeight: "700", color: colors.text },
  detail: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 20, color: colors.textMuted },
  note: { flexDirection: "row", gap: 8, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 10, marginTop: 4 },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 19, color: colors.warningInk },
});
