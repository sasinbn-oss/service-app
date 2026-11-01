/**
 * กล่องตีกลับแบบชี้ช่อง (เคลมก้อน 4 · ตัวอย่างที่เจ้าของงานเลือก :990-1027) — ติดอยู่เหนือแถบตัดสินล่างจอ
 *
 * เดิมตีกลับคือพิมพ์เหตุผลบรรทัดเดียว ช่างอ่านแล้วต้องเดาว่าแก้ช่องไหน และไม่รู้ว่าต้องกลับไปร้านไหม
 * ตอนนี้ผู้ตรวจติ๊กช่องที่ต้องแก้ของชิ้นนั้น (ช่องไฟล์มีป้าย "ต้องแนบใหม่") และช่องของเครื่องถ้าผิดที่ข้อมูลเครื่อง
 * (ติ๊กแล้วตีกลับทั้งใบ) · เหตุผลด่วนกดแล้วติ๊กช่องให้ด้วย · บรรทัดล่างบอกล่วงหน้าว่าช่างจะเห็นว่าต้องไปร้านหรือแก้จากมือถือได้
 *
 * อยู่นอกส่วนที่เลื่อน (วางต่อจาก ScrollView ของใบงาน ก่อนแถบตัดสิน) ไม่ใช่หน้าต่างซ้อน — Modal ซ้อน Modal บนเว็บไม่น่าเชื่อถือ
 * และผู้ตรวจต้องเห็นหลักฐานของชิ้นนั้นคู่กับช่องที่ติ๊ก (หน้าตรวจเลื่อนชิ้นนั้นขึ้นมาให้ตอนกด ✗ ตีกลับ)
 * ตีกลับทั้งใบอยู่: เปิดแท็บชิ้นอื่นก็ยังเห็นช่องของเครื่อง จะได้เอาติ๊กออกได้จากตรงนั้นเลย
 * สูงเกินราวครึ่งจอ (มือถือ/หน้าต่างเตี้ย) เลื่อนในกล่องเอง ไม่ดันหลักฐานจนเหลือแถบบาง ๆ
 */
import React from "react";
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../Tap";
import { NEED_FIELD, type ClaimVerdicts } from "./useClaimVerdicts";
import { PHONE_TEXT, QUICK_REASONS, SITE_TEXT, isMachineFlag } from "../../utils/claimFlags";
import { colors, radius, spacing } from "../../theme";

export default function RejectPanel({ v }: { v: ClaimVerdicts }) {
  const { height } = useWindowDimensions();
  const p = v.active;
  if (!p) return null;
  const showReject = v.ownRejectOf(p);
  // ช่องของเครื่องติ๊กได้เมื่อมีชิ้นที่กดตีกลับเอง และข้อมูลเครื่องยังไม่ล็อก (ตัวอย่าง mPick)
  const mPick = v.anyOwnReject && !v.machineLocked;
  if (!showReject && !(v.whole && mPick)) return null;
  const flags = v.flagsOf(p.key);
  const visit = v.visitOf(p);
  const need = v.needFieldOf(p);
  const status = need ? NEED_FIELD : visit === null ? "" : `ช่างจะเห็นว่า: ${visit ? SITE_TEXT : PHONE_TEXT}`;

  return (
    <View style={styles.dock} accessibilityLabel="ตีกลับ: ช่องที่ต้องแก้">
      <ScrollView style={{ maxHeight: Math.round(height * 0.45) }} contentContainerStyle={styles.body}>
        {showReject ? (
          <View style={styles.row}>
            <Text style={styles.head}>{p.name} — ติ๊กช่องที่ต้องแก้:</Text>
            {v.partDefs.map((f) => (
              <Tick
                key={f.key}
                label={f.label}
                file={f.file}
                on={flags.includes(f.key)}
                a11y={`ช่องที่ต้องแก้ ${f.label}`}
                onPress={() => v.toggleFlag(p.key, f.key)}
              />
            ))}
          </View>
        ) : null}
        {mPick ? (
          <View style={styles.row}>
            <Text style={styles.head}>ของเครื่อง (ติ๊กแล้วตีกลับทั้งใบ):</Text>
            {v.machineDefs.map((f) => (
              <Tick
                key={f.key}
                label={f.label}
                file={f.file}
                on={v.machineFlags.includes(f.key)}
                a11y={`ช่องของเครื่อง ${f.label}`}
                onPress={() => v.toggleMachine(f.key)}
              />
            ))}
          </View>
        ) : null}
        {showReject ? (
          <>
            <View style={styles.row} accessibilityLabel="เหตุผลด่วน — กดแล้วติ๊กช่องให้ด้วย">
              <Text style={styles.head}>เหตุผลด่วน:</Text>
              {/* ข้อมูลเครื่องล็อกแล้ว เหตุผลด่วนของเครื่องกดไปก็ติ๊กช่องไม่ได้ — ไม่แสดง (ตัวอย่าง quick filter) */}
              {QUICK_REASONS.filter(
                (q) =>
                  !(v.machineLocked && isMachineFlag(q.flag)) &&
                  // ช่องที่เครื่องนี้ไม่มี (เช่นเครื่องที่ไม่มีช่องนั้นในรายการของเซิร์ฟเวอร์) กดไปก็ติ๊กไม่ได้
                  [...v.partDefs, ...v.machineDefs].some((f) => f.key === q.flag)
              ).map((q) => {
                const on = v.quickOf(p.key).includes(q.text);
                return (
                  <TouchableOpacity
                    key={q.text}
                    style={[styles.quick, on && styles.quickOn]}
                    onPress={() => v.toggleQuick(p.key, q.text)}
                    hitSlop={{ top: 4, bottom: 4 }}
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`เหตุผลด่วน ${q.text}`}
                  >
                    <Text style={[styles.quickText, on && styles.quickTextOn]}>
                      {q.text}
                      {isMachineFlag(q.flag) ? <Text style={styles.quickWhole}> · ทั้งใบ</Text> : null}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.noteRow}>
              <Text style={styles.head}>เขียนเพิ่ม</Text>
              <TextInput
                style={styles.input}
                value={v.reasonOf(p.key)}
                onChangeText={(t) => v.setReason(p.key, t)}
                placeholder="เช่น ถ่ายให้เห็นร่องพูเลย์ด้วย"
                placeholderTextColor={colors.textFaint}
                maxLength={900}
                accessibilityLabel="เหตุผลที่ตีกลับเคลม"
              />
            </View>
            {status ? (
              <Text style={[styles.status, need && styles.statusNeed]} accessibilityLiveRegion="polite">
                {status}
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** ช่องติ๊ก — ช่องไฟล์มีป้าย "ต้องแนบใหม่" (ช่างต้องกลับไปถ่ายที่หน้าเครื่อง) · สูง 40 + hitSlop = พื้นที่กด 48 */
function Tick({ label, file, on, a11y, onPress }: { label: string; file: boolean; on: boolean; a11y: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.tick, on && styles.tickOn]}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      // เว็บไม่แปลง accessibilityState เป็น aria-checked (เหมือน aria-selected ใน FilterBar) — ใส่เอง
      // ไม่งั้นโปรแกรมอ่านจอบนเว็บไม่รู้ว่าช่องไหนติ๊กอยู่ และเทสต์อ่านสถานะช่องไม่ได้
      aria-checked={on}
      accessibilityLabel={a11y}
    >
      <Ionicons name={on ? "checkbox" : "square-outline"} size={18} color={on ? colors.dangerInk : colors.dangerLine} />
      <Text style={styles.tickText}>
        {label}
        {file ? <Text style={styles.fileTag}> ต้องแนบใหม่</Text> : null}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  dock: {
    backgroundColor: colors.dangerSoft,
    borderTopWidth: 2,
    borderTopColor: colors.dangerLine,
  },
  body: { paddingHorizontal: spacing.lg, paddingVertical: 8, gap: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  head: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.dangerInk, marginRight: 2 },
  tick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.dangerLine,
    backgroundColor: colors.card,
  },
  tickOn: { borderColor: colors.danger, borderWidth: 2, backgroundColor: colors.dangerSoft },
  tickText: { fontSize: 13.5, color: colors.text },
  fileTag: { fontSize: 11.5, fontWeight: "700", color: colors.dangerInk },
  quick: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.card,
  },
  // พื้นแดงเข้มทั้งสองโหมด (*Fill) — ตัวขาวอ่านได้เสมอ
  quickOn: { backgroundColor: colors.dangerFill, borderColor: colors.dangerFill },
  quickText: { fontSize: 13, fontWeight: "600", color: colors.dangerInk },
  quickTextOn: { color: "#fff" },
  quickWhole: { fontSize: 11.5, fontWeight: "800" },
  noteRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  input: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 0,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.dangerLine,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
  },
  status: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.dangerInk },
  statusNeed: { color: colors.danger },
});
