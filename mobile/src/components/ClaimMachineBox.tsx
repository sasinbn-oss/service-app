/**
 * ข้อมูลเครื่องในใบเคลม — ชนิดข้อมูลที่ฟอร์มปิดงานถือ (ป้ายรุ่น · Error) + สรุปที่การ์ดเคลมแสดง + ข้อเช็คตาม Error
 *
 * ฟอร์มกรอกข้อมูลเครื่องย้ายไปเป็นขั้น "เครื่อง" ของฟอร์มปิดงานทีละขั้น (components/close/MachineStep · เคลมก้อน 5)
 * เดิมกล่องนี้อยู่ท้ายฟอร์มยาว ติ๊กครั้งเดียว "ดูทุกช่องเทียบกับรูปแล้ว" — ตอนนี้ยืนยันทีละช่อง (PlateConfirm)
 * ไฟล์นี้เหลือของที่หลายที่ใช้ร่วมกัน: ชนิดข้อมูล · ข้อเช็คตาม Error (ฟอร์ม/ฟอร์มแก้เคลม) · สรุปบนการ์ดเคลม
 */
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { ClaimGuide, PlateValue } from "../utils/nameplate";
import ClaimCrop, { LookalikeText } from "./claims/ClaimCrop";
import CheckGroups from "./claims/CheckGroups";
import { errorCheckGroup, errorLabelOf, hasLookalike, isLegacyPlate, plateSourceText, type PartClaim } from "../utils/claimEvidence";
import { checkLabel } from "../utils/claimErrors";
import { colors, radius, spacing } from "../theme";

/**
 * Error ที่เครื่องขึ้น (ของเครื่อง ใช้ร่วมทุกชิ้น) · checked = ข้อเช็คของใบเก่าที่ติ๊กรวมทั้งใบ
 * ตั้งแต่เคลมก้อน 5 ข้อเช็คติ๊กทีละชิ้น (ClaimPartDraft.errorChecked) — checked ใช้แค่กับร่าง/ใบรุ่นก่อน
 */
export interface ClaimCheckDraft {
  errorCode: string | null;
  checked: string[];
}
/** ค่าป้ายรุ่นทีละช่อง พร้อมสถานะยืนยัน (PlateValue.confirmed) — ไม่มีติ๊กรวมทั้งชุดแล้ว */
export interface PlateDraft {
  values: Record<string, PlateValue>;
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: 6,
    marginTop: spacing.sm,
  },
  title: { fontSize: 15, fontWeight: "800", color: colors.navy },
  hint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  btnRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  label: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.roleSupervisor,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.md,
  },
  scanBusy: { opacity: 0.6 },
  scanText: { color: "#fff", fontWeight: "800", fontSize: 13.5 },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.sky200,
    backgroundColor: colors.sky50,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
  },
  pickText: { color: colors.primaryInk, fontWeight: "700", fontSize: 13.5 },
  stage: { fontSize: 12.5, fontWeight: "700", color: colors.primaryInk },
  readErr: { fontSize: 12.5, color: colors.dangerInk },
  photo: { width: "100%", height: 220, borderRadius: radius.md, backgroundColor: colors.tile },
  field: { gap: 4, marginTop: 4 },
  fieldHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  fieldLabel: { fontSize: 12.5, fontWeight: "700", color: colors.body },
  tag: { fontSize: 10.5, fontWeight: "700", paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, overflow: "hidden" },
  tagScan: { color: colors.successInk, backgroundColor: colors.successSoft },
  tagHand: { color: colors.roleAdmin, backgroundColor: colors.roleAdminSoft },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  modelValue: { fontSize: 20, lineHeight: 30, fontWeight: "800", letterSpacing: 2, fontFamily: "monospace", color: colors.text },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    backgroundColor: colors.card,
  },
  inputDoubt: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  doubt: { fontSize: 12, color: colors.warningInk },
  verify: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSoft,
  },
  verifyOn: { borderColor: colors.sky200, backgroundColor: colors.primarySoft },
  verifyText: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.text },
  // สูง 48 — ช่างติ๊กด้วยนิ้วโป้งตอนยืนหน้าเครื่อง (ตัวอย่างที่เจ้าของงานเลือกใช้ 48 ทุกปุ่ม)
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48 },
  checkText: { flex: 1, fontSize: 13, color: colors.text },
  install: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
  installText: { flex: 1, minWidth: 0, fontSize: 13, color: colors.text },
  sum: { gap: 4, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.tile },
  sumHead: { fontSize: 12.5, fontWeight: "800", color: colors.navy, marginTop: 2 },
  sumRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  sumLabel: { width: 110, fontSize: 12.5, color: colors.textMuted },
  sumValue: { fontSize: 13.5, fontWeight: "800", color: colors.text, fontFamily: "monospace" },
  sumModel: { fontSize: 15, lineHeight: 24, letterSpacing: 1 },
  sumPhoto: { width: "100%", height: 200, borderRadius: radius.sm, backgroundColor: colors.card },
  link: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
  sumCrop: { backgroundColor: colors.card },
  ans: { fontSize: 12.5, fontWeight: "800", color: colors.textMuted },
  // "มี" เด่นขึ้นให้ผู้ตรวจไม่พลาด — แต่ไม่ใช้สีแดง เพราะระบบไม่ได้ตัดสินว่าไม่รับประกัน
  ansYes: { color: colors.warningInk },
});

/**
 * ข้อเช็คตามคู่มือของ Error ที่เลือก — ติ๊กข้อที่ทำ (ระบบไม่ติ๊กให้ · เจ้าของงานตอบข้อ 7)
 *
 * ทีละชิ้น (เคลมก้อน 5): ใช้ในข้อ ④ ของแต่ละชิ้น และในฟอร์มแก้เคลมช่อง "ช่างเข้าเช็คอะไรบ้าง" ของชิ้นนั้น
 * ใช้ได้ตอนข้อมูลเครื่องล็อกด้วย (มีชิ้นผ่านแล้ว) — Error ห้ามเปลี่ยน แต่ข้อที่เช็คเป็นของการปิดครั้งนี้
 * ชื่อที่แสดงทับศัพท์คำอังกฤษ (checkLabel) แต่ค่าที่เก็บคือข้อความเดิมในคู่มือ
 */
export function ErrorCheckList({
  guide,
  errorCode,
  checked,
  onChange,
  partCode,
}: {
  guide: ClaimGuide;
  errorCode: string | null;
  checked: string[];
  onChange: (next: string[]) => void;
  /** ต่อท้ายชื่อช่องติ๊กสำหรับโปรแกรมอ่านจอ/เทสต์ — ใบที่เคลมสองชิ้นมีข้อเช็คชื่อเดียวกันสองชุด */
  partCode?: string;
}) {
  const err = guide.errors.find((e) => e.code === errorCode);
  if (!err?.checks.length) return null;
  return (
    <>
      {err.checks.map((c) => {
        const on = checked.includes(c);
        return (
          <TouchableOpacity
            key={c}
            style={styles.checkRow}
            onPress={() => onChange(on ? checked.filter((x) => x !== c) : [...checked, c])}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            // เว็บไม่แปลง accessibilityState เป็น aria-checked — ใส่เอง (ดู Tick ใน RejectPanel)
            aria-checked={on}
            accessibilityLabel={`เช็คแล้ว ${c}${partCode ? ` ${partCode}` : ""}`}
          >
            <Ionicons name={on ? "checkbox" : "square-outline"} size={20} color={on ? colors.primary : colors.textFaint} />
            <Text style={styles.checkText}>{checkLabel(err, c)}</Text>
          </TouchableOpacity>
        );
      })}
    </>
  );
}

/**
 * สรุปข้อมูลเครื่องในการ์ดเคลม (ทุกคนที่เปิดดูใบงาน · ผู้ตรวจใช้หน้าตรวจเคลมแทน) — ค่าที่สแกนวางคู่ภาพบรรทัดจริง
 * ป้ายที่มาบอกเท่าที่ช่างทำจริง (อ่านจากรูป/ยืนยัน/แก้กี่ตัว) และตัวที่หน้าตาคล้ายกันในรุ่นพื้นเหลือง ให้ดูกับภาพตัดเป็นพิเศษ
 * เช็คตาม Error ขึ้นข้อที่ทำ ✓ · คนตัดสินเคลมเห็นข้อที่ไม่ได้ทำ ✗ ด้วย (ระบบไม่ติ๊กให้ช่าง จึงต้องเห็นว่าข้อไหนข้ามไป)
 * คำตอบเรื่องติดตั้งแสดงตามที่ช่างตอบพร้อมหมายเหตุจากคู่มือ ไม่ตัดสินผลเอง (ทีมที่คุยกับประกันตัดสิน)
 */
export function ClaimMachineSummary({
  nameplate,
  fieldCheck,
  photo,
  guide,
  showMissed = true,
  hideChecks = false,
}: {
  nameplate?: PartClaim["nameplate"];
  /** รูปป้ายเต็มที่ระบบอ่านค่ามา — กดดูขนาดเต็ม */
  photo?: { uri: string | null; open: () => void } | null;
  fieldCheck?: PartClaim["fieldCheck"];
  /** รายการ Error ปัจจุบัน — ใบเก่าที่ไม่ได้เก็บข้อที่ให้ช่างเห็นไว้ ใช้รายการนี้นับข้อที่ไม่ได้ทำ */
  guide?: ClaimGuide | null;
  /** ขึ้นข้อที่ไม่ได้ทำ ✗ ด้วยไหม — เฉพาะคนตัดสินเคลม (ดู CheckGroups) */
  showMissed?: boolean;
  /** ไม่ขึ้นข้อเช็คตาม Error — ฟอร์มปิดงานที่ข้อมูลเครื่องล็อกแสดงเป็นช่องติ๊กของรอบนี้แทน (ErrorCheckList) */
  hideChecks?: boolean;
}) {
  if (!nameplate?.fields?.length && !fieldCheck) return null;
  const legacy = isLegacyPlate(nameplate);
  const eif = errorCheckGroup(fieldCheck, guide);
  return (
    <View style={styles.sum} accessibilityLabel="ข้อมูลเครื่องในใบเคลม">
      {nameplate?.fields?.length ? (
        <>
          <Text style={styles.sumHead}>ข้อมูลป้ายรุ่น</Text>
          {photo ? (
            <TouchableOpacity onPress={photo.open} activeOpacity={0.85} accessibilityLabel="เปิดรูปป้ายรุ่นเต็ม">
              {photo.uri ? (
                <Image source={{ uri: photo.uri }} style={styles.sumPhoto} resizeMode="contain" />
              ) : (
                <Text style={styles.link}>เปิดรูปป้ายรุ่นเต็ม</Text>
              )}
            </TouchableOpacity>
          ) : null}
          {/* ใบที่ส่งก่อนมีปุ่มยืนยันทีละช่อง — ช่างติ๊กครั้งเดียวทั้งชุด บอกตามนั้น */}
          {legacy && nameplate.fields.some((f) => f.source === "SCAN") ? (
            <Text style={styles.hint}>{nameplate.verified ? "ช่างติ๊กว่าตรวจค่ากับรูปแล้ว" : "ค่าที่ระบบอ่าน — ยังไม่ได้ตรวจกับรูป"}</Text>
          ) : null}
          {nameplate.fields.map((f) => (
            <View key={f.key} style={styles.sumRow}>
              <Text style={styles.sumLabel}>{f.label}</Text>
              {f.key === "model" ? (
                <LookalikeText value={f.value} label={f.label} style={styles.sumModel} />
              ) : (
                <Text style={styles.sumValue}>{f.value}</Text>
              )}
              <Text style={[styles.tag, f.source === "SCAN" ? styles.tagScan : styles.tagHand]}>{plateSourceText(f, legacy)}</Text>
              {f.key === "model" && hasLookalike(f.value) ? <Text style={styles.hint}>พื้นเหลือง = ตัวที่หน้าตาคล้ายกัน</Text> : null}
              {f.crop ? <ClaimCrop uri={f.crop} label={f.label} style={styles.sumCrop} /> : null}
            </View>
          ))}
        </>
      ) : null}
      {fieldCheck ? (
        <>
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Error ที่เครื่องขึ้น</Text>
            <Text style={[styles.checkText, { fontWeight: "800" }]}>{errorLabelOf(fieldCheck)}</Text>
          </View>
          {eif && !hideChecks ? <CheckGroups groups={[eif]} showMissed={showMissed} /> : null}
          {/* ใบเคลมก่อนเอาเช็คลิสต์ออกยังมีคำตอบ — แสดงไว้ให้ Admin Spare Part เห็นเหมือนเดิม */}
          {fieldCheck.install?.length ? <Text style={[styles.hint, { marginTop: 4 }]}>การติดตั้งฐานเครื่อง (ช่างตอบตามที่เห็น)</Text> : null}
          {(fieldCheck.install ?? []).map((c) => (
            <View key={c.key} style={styles.install}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.installText}>{c.label}</Text>
                <Text style={styles.hint}>{c.note}</Text>
              </View>
              <Text style={[styles.ans, c.answer && styles.ansYes]}>{c.answer ? "มี" : "ไม่มี"}</Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}
