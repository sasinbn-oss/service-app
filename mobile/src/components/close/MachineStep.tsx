/**
 * ขั้น "เครื่อง" ของฟอร์มปิดงาน — ข้อมูลเครื่องสำหรับเคลม ใช้ร่วมทุกชิ้น (เคลมก้อน 5 · ตัวอย่างที่เจ้าของงานเลือก)
 *
 * รูปป้ายรุ่นมีรูปเดียว: ถ่ายในขั้น "งานที่ทำ" แล้วขั้นนี้ใช้รูปนั้นอ่านค่า ไม่ต้องถ่ายซ้ำ — ถ่ายใหม่ที่นี่ก็แทนรูปเดิม (บอกให้รู้ ไม่ทับเงียบ ๆ)
 * เดิมกล่องเครื่องมีปุ่มถ่ายป้ายของตัวเองแยกจากขั้นป้ายรุ่นด้านบน ช่างถ่ายสองรอบ และไม่รู้ว่ารูปไหนคือรูปที่ส่ง
 *
 * Error เรียง: แนะนำจากใบแจ้ง (แตะเอง ไม่เลือกให้) → "ไม่มี Error ขึ้น" → เฉพาะ Error ของเครื่องชนิดนี้ (utils/claimErrors)
 * มีชิ้นผ่านแล้ว = ข้อมูลเครื่องล็อกไปกับชิ้นนั้น (เซิร์ฟเวอร์ใช้ค่าของใบที่อนุมัติ) ขั้นนี้แสดงอย่างเดียว ไม่มีอะไรให้ยืนยัน
 */
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../Tap";
import Dropdown from "../Dropdown";
import PlateConfirm from "./PlateConfirm";
import { ClaimMachineSummary, type PlateDraft } from "../ClaimMachineBox";
import { NO_ERROR_CODE, NO_ERROR_LABEL, errorChoiceLabel, errorChoices, suggestQuote } from "../../utils/claimErrors";
import type { PartClaim } from "../../utils/claimEvidence";
import type { ClaimGuide } from "../../utils/nameplate";
import { colors, radius, spacing } from "../../theme";

export interface PlatePhoto {
  /** รูปที่แสดง (รูปในเครื่อง หรือรูปย่อจากใบงาน) */
  uri: string | null;
  /** ถ่ายใหม่ในขั้นนี้ (แทนรูปจากขั้นงานที่ทำ) */
  retaken: boolean;
}

export default function MachineStep({
  guide,
  plate,
  onPlate,
  errorCode,
  onError,
  machineType,
  symptom,
  doubt,
  photo,
  onRetake,
  ocrStage,
  ocrError,
  locked,
  readOnly,
  spot,
  flashOn,
}: {
  guide: ClaimGuide;
  plate: PlateDraft;
  onPlate: (next: PlateDraft) => void;
  errorCode: string | null;
  onError: (code: string | null) => void;
  machineType: string | null | undefined;
  symptom: string | null | undefined;
  doubt: (value: string) => string;
  photo: PlatePhoto | null;
  onRetake: () => void;
  ocrStage: string | null;
  ocrError: string | null;
  /** ข้อมูลเครื่องล็อกไปกับชิ้นที่ผ่านแล้ว — แถวที่อนุมัติ + ชื่อชิ้น */
  locked: { row: PartClaim; byParts: string[] } | null;
  readOnly?: boolean;
  spot: (key: string) => object;
  flashOn: (key: string) => React.ReactNode;
}) {
  if (locked) {
    return (
      <View style={styles.box} accessibilityLabel="ข้อมูลเครื่องล็อกไว้">
        <Text style={styles.title}>ข้อมูลเครื่องสำหรับเคลม</Text>
        <View style={styles.lockRow}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.successInk} />
          <Text style={styles.lockText}>ล็อกไว้พร้อม {locked.byParts.join(" · ")} ที่ผ่านแล้ว</Text>
        </View>
        <ClaimMachineSummary nameplate={locked.row.nameplate} fieldCheck={locked.row.fieldCheck} guide={guide} showMissed={false} hideChecks />
      </View>
    );
  }

  const scanned = Object.values(plate.values).some((v) => v?.source === "SCAN" && v.value);
  const { list, suggested, filteredBy } = errorChoices(guide, machineType, symptom);
  const none = list.find((e) => e.code === NO_ERROR_CODE);
  const pick = (code: string | null) => !readOnly && onError(code);

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.box} {...spot("m:plate")}>
        {flashOn("m:plate")}
        <View style={styles.photoRow}>
          <Text style={[styles.photoLine, { color: photo ? colors.successInk : colors.warningInk }]}>
            {!photo
              ? "ยังไม่มีรูปป้ายรุ่น — ถ่ายที่นี่ หรือในแท็บ “งานที่ทำ”"
              : photo.retaken
                ? "✓ ถ่ายป้ายใหม่แล้ว — แทนรูปเดิม"
                : "✓ ป้ายรุ่น: ใช้รูปจากแท็บงานที่ทำ ไม่ต้องถ่ายซ้ำ"}
          </Text>
          {!readOnly ? (
            <TouchableOpacity style={styles.btn} onPress={onRetake} disabled={!!ocrStage} accessibilityLabel={photo ? "ถ่ายรูปป้ายรุ่นใหม่" : "ถ่ายรูปป้ายรุ่น"}>
              <Ionicons name="camera-outline" size={16} color={colors.primaryInk} />
              <Text style={styles.btnText}>{photo ? "ถ่ายใหม่" : "ถ่ายรูป"}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {photo?.uri ? (
          <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="contain" accessibilityLabel="รูปป้ายรุ่นเต็ม" />
        ) : null}
        {ocrStage ? (
          <Text style={styles.stage} accessibilityLabel="สถานะอ่านป้าย">
            {ocrStage}…
          </Text>
        ) : null}
        {ocrError ? <Text style={styles.err}>{ocrError}</Text> : null}
        {scanned && !ocrStage ? <Text style={styles.hint}>ระบบอ่านป้ายแล้ว — กดยืนยันรุ่นกับ Serial ทีละช่อง</Text> : null}
      </View>

      <PlateConfirm guide={guide} plate={plate} onPlate={onPlate} doubt={doubt} readOnly={readOnly} spot={spot} flashOn={flashOn} />

      {guide.errors.length ? (
        <View style={styles.box} {...spot("m:error")} accessibilityLabel="เลือก Error ที่เครื่องขึ้น">
          {flashOn("m:error")}
          <Text style={styles.label}>
            Error ที่เครื่องขึ้น <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          {/* แนะนำจากคำในใบแจ้ง — แตะเอง ระบบไม่เลือกให้ (ใบแจ้งเขียนตามที่ลูกค้าเห็น ไม่ใช่ที่ช่างเห็นหน้าเครื่อง) */}
          {suggested && errorCode !== suggested.code ? (
            <TouchableOpacity style={styles.suggest} onPress={() => pick(suggested.code)} accessibilityLabel={`เลือก Error ที่แนะนำ ${suggested.code}`}>
              <Text style={styles.suggestHead}>จากใบแจ้ง “{suggestQuote(suggested, symptom)}” — แนะนำ แตะเพื่อเลือก</Text>
              <Text style={styles.suggestText}>{errorChoiceLabel(suggested)}</Text>
            </TouchableOpacity>
          ) : null}
          {none && errorCode !== NO_ERROR_CODE ? (
            <TouchableOpacity style={styles.noneBtn} onPress={() => pick(NO_ERROR_CODE)} accessibilityLabel="เลือก ไม่มี Error ขึ้น">
              <Text style={styles.noneText}>{NO_ERROR_LABEL}</Text>
            </TouchableOpacity>
          ) : null}
          <Dropdown
            value={errorCode}
            options={list.map((e) => ({ value: e.code, label: errorChoiceLabel(e) }))}
            onChange={(v) => pick(v)}
            placeholder="เลือก Error"
            disabled={readOnly}
            accessibilityLabel="Error ที่เครื่องขึ้น"
          />
          {filteredBy ? (
            <Text style={styles.hint}>
              {filteredBy === "WASHER"
                ? "แสดงเฉพาะ Error ของเครื่องซัก (คู่มือ Error in Field)"
                : "แสดงเฉพาะ Error ของเครื่องอบ (คู่มือ Error in Field)"}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.hint}>ยี่ห้อนี้ไม่มีคู่มือเกณฑ์เคลม — ข้อมูลป้ายรุ่น + หลักฐานทีละชิ้นส่งให้ Admin Spare Part</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  title: { fontSize: 15, lineHeight: 22, fontWeight: "800", color: colors.navy },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  lockText: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.successInk },
  photoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  photoLine: { flex: 1, minWidth: 180, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  photo: { width: "100%", height: 160, borderRadius: radius.sm, backgroundColor: colors.tile },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.navyFill,
    backgroundColor: colors.card,
  },
  btnText: { fontSize: 14, fontWeight: "700", color: colors.primaryInk },
  stage: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
  err: { fontSize: 13, lineHeight: 19, color: colors.dangerInk },
  hint: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
  label: { fontSize: 15, lineHeight: 22, fontWeight: "800", color: colors.text },
  // แนะนำ = กรอบประ (ตัวอย่าง errOpts sug) — ไม่ใช่ปุ่มทึบ ช่างต้องรู้ว่ายังไม่ได้เลือก
  suggest: {
    gap: 2,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.primary,
    backgroundColor: colors.sky50,
  },
  suggestHead: { fontSize: 13, lineHeight: 19, color: colors.primaryInk },
  suggestText: { fontSize: 15, lineHeight: 22, fontWeight: "800", color: colors.primaryInk },
  noneBtn: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  noneText: { fontSize: 15, fontWeight: "700", color: colors.text },
});
