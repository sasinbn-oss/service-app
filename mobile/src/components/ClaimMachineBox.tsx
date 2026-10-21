/**
 * ข้อมูลเครื่องสำหรับเคลม — ป้ายรุ่น (สแกน/พิมพ์) + เช็คตามคู่มือ Error in Field (เจ้าของงานขอ ต.ค. 69)
 *
 * ขึ้นในฟอร์มปิดงานเมื่อมีอะไหล่ที่ส่งเคลม ใช้ร่วมทุกชิ้น (เครื่องเดียวกัน) · ส่งต่อให้ Admin Spare Part
 * ช่าง "แค่เก็บข้อมูลและเช็คตามรายการ" — ไม่มีการตัดสินว่ารับประกันหรือไม่ ทีมถัดไปคุยกับประกันเอง
 * รายการทั้งหมดมาจากเซิร์ฟเวอร์ (claimGuide) — ยี่ห้อที่ไม่มีคู่มือ (OASIS ฯลฯ) มีแค่ข้อมูลป้าย
 */
import React, { useState } from "react";
import { Image, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import Dropdown from "./Dropdown";
import NameplateScanner from "./NameplateScanner";
import { ClaimGuide, PlateValue, plateFields } from "../utils/nameplate";
import { colors, radius, spacing } from "../theme";

export interface ClaimCheckDraft {
  errorCode: string | null;
  checked: string[];
  install: Record<string, boolean>;
}
export interface PlateDraft {
  values: Record<string, PlateValue>;
  /** ช่องรุ่นที่สแกนแล้วไม่ตรงทะเบียน และช่างกดยืนยันกับภาพแล้ว */
  confirmed: string[];
}

/** สิ่งที่ยังขาด — ตรงกับที่เซิร์ฟเวอร์เช็ค บอกก่อนกดปิดงาน */
export function claimMachineGaps(guide: ClaimGuide | undefined, plate: PlateDraft, check: ClaimCheckDraft): string[] {
  if (!guide) return [];
  const fields = plateFields(guide.plate);
  const filled = fields.filter((f) => plate.values[f.key]?.value?.trim());
  const unconfirmed = filled.filter((f) => plate.values[f.key].needsCheck && !plate.confirmed.includes(f.key));
  return [
    ...(filled.length ? [] : ["ข้อมูลป้ายรุ่น"]),
    ...unconfirmed.map((f) => `ยืนยัน${f.label}ที่สแกน`),
    ...(guide.errors.length && !check.errorCode ? ["Error ที่เครื่องขึ้น"] : []),
    ...(guide.installChecks.some((c) => typeof check.install[c.key] !== "boolean") ? ["เรื่องการติดตั้งฐานเครื่อง"] : []),
  ];
}

export default function ClaimMachineBox({
  guide,
  registryModel,
  plate,
  onPlate,
  check,
  onCheck,
}: {
  guide: ClaimGuide;
  registryModel?: string | null;
  plate: PlateDraft;
  onPlate: (next: PlateDraft) => void;
  check: ClaimCheckDraft;
  onCheck: (next: ClaimCheckDraft) => void;
}) {
  const [scanning, setScanning] = useState(false);
  const fields = plateFields(guide.plate);
  const err = guide.errors.find((e) => e.code === check.errorCode);

  return (
    <View style={styles.box} accessibilityLabel="ข้อมูลเครื่องสำหรับเคลม">
      <Text style={styles.title}>ข้อมูลเครื่องสำหรับเคลม</Text>
      <Text style={styles.hint}>ใช้ร่วมทุกชิ้นที่ส่งเคลม · ส่งให้ Admin Spare Part</Text>

      {/* ── ป้ายรุ่น ── */}
      <View style={styles.headRow}>
        <Text style={styles.label}>
          ข้อมูลป้ายรุ่น <Text style={{ color: colors.danger }}>*</Text>
        </Text>
        <TouchableOpacity style={styles.scanBtn} onPress={() => setScanning(true)} activeOpacity={0.8} accessibilityLabel="สแกนป้ายรุ่น">
          <Ionicons name="scan" size={16} color="#fff" />
          <Text style={styles.scanText}>สแกนป้ายรุ่น</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>เล็งกล้องทีละบรรทัด แอปอ่านเลขให้เอง · อ่านไม่ได้ก็พิมพ์เองได้</Text>
      {fields.map((f) => {
        const v = plate.values[f.key];
        const confirmed = plate.confirmed.includes(f.key);
        return (
          <View key={f.key} style={styles.field}>
            <View style={styles.fieldHead}>
              <Text style={styles.fieldLabel}>{f.label}</Text>
              {v?.value ? (
                v.source === "SCAN" ? (
                  <Text style={[styles.tag, styles.tagScan]}>สแกน</Text>
                ) : (
                  <Text style={[styles.tag, styles.tagHand]}>พิมพ์เอง</Text>
                )
              ) : null}
            </View>
            <View style={styles.fieldRow}>
              {v?.crop ? <Image source={{ uri: v.crop }} style={styles.crop} resizeMode="contain" /> : null}
              <TextInput
                style={styles.input}
                value={v?.value ?? ""}
                onChangeText={(t) =>
                  onPlate({
                    // แก้เองแล้วไม่ใช่ค่าที่กล้องอ่าน — ภาพเดิมไม่ตรงกับค่าแล้ว ทิ้งไป
                    values: { ...plate.values, [f.key]: { value: t.toUpperCase(), source: "HAND", crop: null } },
                    confirmed: plate.confirmed.filter((k) => k !== f.key),
                  })
                }
                autoCapitalize="characters"
                placeholder={`พิมพ์${f.label}จากป้าย`}
                placeholderTextColor={colors.textFaint}
                accessibilityLabel={`ป้ายรุ่น ${f.label}`}
              />
            </View>
            {v?.needsCheck && v.source === "SCAN" ? (
              <TouchableOpacity
                style={styles.confirm}
                onPress={() =>
                  onPlate({
                    ...plate,
                    confirmed: confirmed ? plate.confirmed.filter((k) => k !== f.key) : [...plate.confirmed, f.key],
                  })
                }
                activeOpacity={0.7}
                accessibilityLabel={`ยืนยัน${f.label}ตรงกับภาพ`}
              >
                <Ionicons name={confirmed ? "checkbox" : "square-outline"} size={18} color={confirmed ? colors.primary : colors.warningInk} />
                <Text style={styles.confirmText}>
                  {registryModel ? `ไม่ตรงทะเบียน (${registryModel}) — ` : ""}เทียบกับภาพแล้วถูกต้อง (ระวัง O/0 · S/5 · I/1)
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}

      {/* ── เช็คตามคู่มือ (เฉพาะยี่ห้อที่มีคู่มือ) ── */}
      {guide.errors.length ? (
        <>
          <Text style={[styles.label, { marginTop: spacing.md }]}>
            Error ที่เครื่องขึ้น (คู่มือ Error in Field) <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <Dropdown
            value={check.errorCode}
            options={guide.errors.map((e) => ({ value: e.code, label: `${e.code} · ${e.name}` }))}
            onChange={(v) => onCheck({ ...check, errorCode: v, checked: [] })}
            placeholder="เลือก Error"
            accessibilityLabel="Error ที่เครื่องขึ้น"
          />
          {err?.checks.length ? (
            <>
              <Text style={styles.hint}>คู่มือให้ดูข้อเหล่านี้ก่อนเปลี่ยนอะไหล่ — ติ๊กข้อที่เช็คแล้ว</Text>
              {err.checks.map((c) => {
                const on = check.checked.includes(c);
                return (
                  <TouchableOpacity
                    key={c}
                    style={styles.checkRow}
                    onPress={() => onCheck({ ...check, checked: on ? check.checked.filter((x) => x !== c) : [...check.checked, c] })}
                    activeOpacity={0.7}
                    accessibilityLabel={`เช็คแล้ว ${c}`}
                  >
                    <Ionicons name={on ? "checkbox" : "square-outline"} size={18} color={on ? colors.primary : colors.textFaint} />
                    <Text style={styles.checkText}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </>
          ) : null}

          <Text style={[styles.label, { marginTop: spacing.md }]}>
            การติดตั้งฐานเครื่อง <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <Text style={styles.hint}>ดูใต้เครื่องแล้วตอบตามจริงทุกข้อ</Text>
          {guide.installChecks.map((c) => {
            const a = check.install[c.key];
            const pick = (v: boolean) => onCheck({ ...check, install: { ...check.install, [c.key]: v } });
            return (
              <View key={c.key} style={styles.install}>
                <Text style={styles.installText}>{c.label}</Text>
                <View style={styles.yn}>
                  <TouchableOpacity style={[styles.ynBtn, a === false && styles.ynOn]} onPress={() => pick(false)} accessibilityLabel={`${c.label} ไม่มี`}>
                    <Text style={[styles.ynText, a === false && styles.ynTextOn]}>ไม่มี</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.ynBtn, a === true && styles.ynOn]} onPress={() => pick(true)} accessibilityLabel={`${c.label} มี`}>
                    <Text style={[styles.ynText, a === true && styles.ynTextOn]}>มี</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </>
      ) : (
        <Text style={[styles.hint, { marginTop: spacing.sm }]}>
          ยี่ห้อนี้ไม่มีคู่มือเกณฑ์เคลม — ข้อมูลป้ายรุ่น + รูปอะไหล่ที่เสียด้านบนส่งให้ Admin Spare Part
        </Text>
      )}

      {scanning ? (
        <NameplateScanner
          template={guide.plate}
          registryModel={registryModel}
          onClose={() => setScanning(false)}
          onDone={(read) => {
            setScanning(false);
            // ค่าที่สแกนได้ทับเฉพาะช่องที่อ่านได้ ช่องที่ข้ามไว้ยังเป็นค่าเดิม (อาจพิมพ์ไว้แล้ว)
            const keys = Object.keys(read);
            onPlate({ values: { ...plate.values, ...read }, confirmed: plate.confirmed.filter((k) => !keys.includes(k)) });
          }}
        />
      ) : null}
    </View>
  );
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
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.sm },
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
  scanText: { color: "#fff", fontWeight: "800", fontSize: 13.5 },
  field: { gap: 4, marginTop: 4 },
  fieldHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  fieldLabel: { fontSize: 12.5, fontWeight: "700", color: colors.body },
  tag: { fontSize: 10.5, fontWeight: "700", paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, overflow: "hidden" },
  tagScan: { color: colors.successInk, backgroundColor: colors.successSoft },
  tagHand: { color: colors.roleAdmin, backgroundColor: colors.roleAdminSoft },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  crop: { width: 120, height: 26, borderRadius: 4, backgroundColor: colors.tile },
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
  confirm: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.warningSoft, borderRadius: radius.sm, padding: 6 },
  confirmText: { flex: 1, fontSize: 12, color: colors.warningInk },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  checkText: { flex: 1, fontSize: 13, color: colors.text },
  install: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
  installText: { flex: 1, minWidth: 0, fontSize: 13, color: colors.text },
  yn: { flexDirection: "row", gap: 6 },
  ynBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 5, paddingHorizontal: 12, backgroundColor: colors.card },
  ynOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  ynText: { fontSize: 12.5, fontWeight: "700", color: colors.textMuted },
  ynTextOn: { color: colors.primaryInk },
  sum: { gap: 4, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.tile },
  sumHead: { fontSize: 12.5, fontWeight: "800", color: colors.navy, marginTop: 2 },
  sumRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  sumLabel: { width: 110, fontSize: 12.5, color: colors.textMuted },
  sumValue: { fontSize: 13.5, fontWeight: "800", color: colors.text, fontFamily: "monospace" },
  sumCrop: { width: 140, height: 28, borderRadius: 4, backgroundColor: colors.card },
  ans: { fontSize: 12.5, fontWeight: "800", color: colors.textMuted },
  // "มี" เด่นขึ้นให้ผู้ตรวจไม่พลาด — แต่ไม่ใช้สีแดง เพราะระบบไม่ได้ตัดสินว่าไม่รับประกัน
  ansYes: { color: colors.warningInk },
});

/**
 * สรุปข้อมูลเครื่องในการ์ดเคลม (Admin Spare Part ตรวจ / ทุกคนที่เปิดดู) — ค่าที่สแกนวางคู่ภาพบรรทัดจริง
 * คำตอบเรื่องติดตั้งแสดงตามที่ช่างตอบพร้อมหมายเหตุจากคู่มือ ไม่ตัดสินผลเอง (ทีมที่คุยกับประกันตัดสิน)
 */
export function ClaimMachineSummary({
  nameplate,
  fieldCheck,
}: {
  nameplate?: { fields: { key: string; label: string; value: string; source: "SCAN" | "HAND"; crop?: string | null }[] } | null;
  fieldCheck?: { errorCode: string; errorName: string; checked: string[]; install: { key: string; label: string; note: string; answer: boolean }[] } | null;
}) {
  if (!nameplate?.fields?.length && !fieldCheck) return null;
  return (
    <View style={styles.sum} accessibilityLabel="ข้อมูลเครื่องในใบเคลม">
      {nameplate?.fields?.length ? (
        <>
          <Text style={styles.sumHead}>ข้อมูลป้ายรุ่น</Text>
          {nameplate.fields.map((f) => (
            <View key={f.key} style={styles.sumRow}>
              <Text style={styles.sumLabel}>{f.label}</Text>
              <Text style={styles.sumValue}>{f.value}</Text>
              <Text style={[styles.tag, f.source === "SCAN" ? styles.tagScan : styles.tagHand]}>
                {f.source === "SCAN" ? "สแกน" : "พิมพ์เอง"}
              </Text>
              {f.crop ? <Image source={{ uri: f.crop }} style={styles.sumCrop} resizeMode="contain" /> : null}
            </View>
          ))}
        </>
      ) : null}
      {fieldCheck ? (
        <>
          <Text style={styles.sumHead}>เช็คตามคู่มือ Error in Field</Text>
          <Text style={styles.checkText}>
            Error: {fieldCheck.errorCode} · {fieldCheck.errorName}
          </Text>
          {fieldCheck.checked.map((c) => (
            <View key={c} style={styles.checkRow}>
              <Ionicons name="checkmark-circle" size={15} color={colors.success} />
              <Text style={styles.checkText}>{c}</Text>
            </View>
          ))}
          <Text style={[styles.hint, { marginTop: 4 }]}>การติดตั้งฐานเครื่อง (ช่างตอบตามที่เห็น)</Text>
          {fieldCheck.install.map((c) => (
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
