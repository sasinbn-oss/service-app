/**
 * ข้อมูลเครื่องสำหรับเคลม — ป้ายรุ่น (ถ่ายรูปทั้งป้ายให้ระบบอ่าน/พิมพ์เอง) + เช็คตามคู่มือ Error in Field (เจ้าของงานขอ ต.ค. 69)
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
import { ClaimGuide, PlateValue, plateFields } from "../utils/nameplate";
import { readPlatePhoto } from "../utils/ocr";
import { pickImageAttachment, type PickedAttachment } from "../utils/attachments";
import { colors, radius, spacing } from "../theme";

export interface ClaimCheckDraft {
  errorCode: string | null;
  checked: string[];
}
export interface PlateDraft {
  values: Record<string, PlateValue>;
  /** ช่างติ๊กว่าดูค่าที่ระบบอ่านเทียบกับรูปแล้ว — ติ๊กครั้งเดียวทั้งชุด อ่านรูปใหม่แล้วต้องติ๊กใหม่ */
  verified: boolean;
  /** รูปป้ายเต็มที่ถ่ายรอบนี้ (ขึ้นเป็นไฟล์ "ป้ายรุ่น" ตอนปิดงาน) */
  photo?: PickedAttachment | null;
}

/** สิ่งที่ยังขาด — ตรงกับที่เซิร์ฟเวอร์เช็ค บอกก่อนกดปิดงาน */
export function claimMachineGaps(guide: ClaimGuide | undefined, plate: PlateDraft, check: ClaimCheckDraft): string[] {
  if (!guide) return [];
  const fields = plateFields(guide.plate);
  const filled = fields.filter((f) => plate.values[f.key]?.value?.trim());
  const scanned = filled.some((f) => plate.values[f.key].source === "SCAN");
  return [
    ...(filled.length ? [] : ["ข้อมูลป้ายรุ่น"]),
    ...(scanned && !plate.verified ? ["ติ๊กตรวจค่ากับรูปป้าย"] : []),
    ...(guide.errors.length && !check.errorCode ? ["Error ที่เครื่องขึ้น"] : []),
  ];
}

export default function ClaimMachineBox({
  guide,
  registryModel,
  plate,
  onPlate,
  check,
  onCheck,
  onPhoto,
}: {
  guide: ClaimGuide;
  registryModel?: string | null;
  plate: PlateDraft;
  onPlate: (next: PlateDraft) => void;
  check: ClaimCheckDraft;
  onCheck: (next: ClaimCheckDraft) => void;
  /** รูปป้ายที่ถ่ายใช้เป็นรูป "ป้ายรุ่น" ของการปิดงานด้วย — ไม่ต้องถ่ายสองรอบ */
  onPhoto: (photo: PickedAttachment) => void;
}) {
  const [stage, setStage] = useState<string | null>(null);
  const [readErr, setReadErr] = useState<string | null>(null);
  const fields = plateFields(guide.plate);
  const err = guide.errors.find((e) => e.code === check.errorCode);
  const scanned = fields.some((f) => plate.values[f.key]?.source === "SCAN" && plate.values[f.key]?.value);
  const missed = plate.photo ? fields.filter((f) => !plate.values[f.key]?.value) : [];

  async function shoot(fromCamera: boolean) {
    setReadErr(null);
    const photo = await pickImageAttachment(fromCamera, setStage);
    if (!photo) return setStage(null);
    onPhoto(photo);
    try {
      const read = await readPlatePhoto(photo.uri, guide.plate, registryModel, setStage);
      // ค่าที่อ่านได้ทับเฉพาะช่องนั้น ช่องที่อ่านไม่ได้ยังเป็นค่าเดิม (อาจพิมพ์ไว้แล้ว) · อ่านใหม่ต้องตรวจใหม่
      onPlate({ values: { ...plate.values, ...read }, verified: false, photo });
    } catch (e) {
      onPlate({ ...plate, photo });
      setReadErr(e instanceof Error ? e.message : "อ่านป้ายไม่สำเร็จ — พิมพ์เองจากรูปได้");
    } finally {
      setStage(null);
    }
  }

  return (
    <View style={styles.box} accessibilityLabel="ข้อมูลเครื่องสำหรับเคลม">
      <Text style={styles.title}>ข้อมูลเครื่องสำหรับเคลม</Text>
      <Text style={styles.hint}>ใช้ร่วมทุกชิ้นที่ส่งเคลม · ส่งให้ Admin Spare Part</Text>

      {/* ── ป้ายรุ่น ── */}
      <Text style={[styles.label, { marginTop: spacing.sm }]}>
        ข้อมูลป้ายรุ่น <Text style={{ color: colors.danger }}>*</Text>
      </Text>
      <Text style={styles.hint}>ถ่ายรูปให้เห็นทั้งป้าย ตรง ๆ ไม่เอียง ไม่มีแสงสะท้อน — ระบบอ่านเลขให้เอง อ่านไม่ได้ก็พิมพ์เองได้</Text>
      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.scanBtn, stage && styles.scanBusy]}
          onPress={() => shoot(true)}
          disabled={!!stage}
          activeOpacity={0.8}
          accessibilityLabel="ถ่ายรูปป้ายรุ่น"
        >
          <Ionicons name="camera" size={16} color="#fff" />
          <Text style={styles.scanText}>{plate.photo ? "ถ่ายใหม่" : "ถ่ายรูปป้ายรุ่น"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pickBtn}
          onPress={() => shoot(false)}
          disabled={!!stage}
          activeOpacity={0.8}
          accessibilityLabel="เลือกรูปป้ายรุ่น"
        >
          <Ionicons name="images-outline" size={16} color={colors.primaryInk} />
          <Text style={styles.pickText}>เลือกรูป</Text>
        </TouchableOpacity>
      </View>
      {stage ? (
        <Text style={styles.stage} accessibilityLabel="สถานะอ่านป้าย">
          {stage}…
        </Text>
      ) : null}
      {readErr ? <Text style={styles.readErr}>{readErr}</Text> : null}
      {plate.photo ? (
        <Image
          source={{ uri: plate.photo.thumbnailUri ?? plate.photo.uri }}
          style={styles.photo}
          resizeMode="contain"
          accessibilityLabel="รูปป้ายรุ่นเต็ม"
        />
      ) : null}
      {plate.photo && !stage && missed.length ? (
        <Text style={styles.hint}>อ่านไม่ได้: {missed.map((f) => f.label).join(" · ")} — พิมพ์เองจากรูปด้านบนได้</Text>
      ) : null}
      {fields.map((f) => {
        const v = plate.values[f.key];
        return (
          <View key={f.key} style={styles.field}>
            <View style={styles.fieldHead}>
              <Text style={styles.fieldLabel}>{f.label}</Text>
              {v?.value ? (
                v.source === "SCAN" ? (
                  <Text style={[styles.tag, styles.tagScan]}>อ่านจากรูป</Text>
                ) : (
                  <Text style={[styles.tag, styles.tagHand]}>พิมพ์เอง</Text>
                )
              ) : null}
            </View>
            <View style={styles.fieldRow}>
              {v?.crop ? <Image source={{ uri: v.crop }} style={styles.crop} resizeMode="contain" /> : null}
              <TextInput
                style={[styles.input, v?.needsCheck && v.source === "SCAN" && styles.inputDoubt]}
                value={v?.value ?? ""}
                onChangeText={(t) =>
                  onPlate({
                    // แก้เองแล้วไม่ใช่ค่าที่ระบบอ่าน — ภาพตัดเดิมไม่ตรงกับค่าแล้ว ทิ้งไป
                    ...plate,
                    values: { ...plate.values, [f.key]: { value: t.toUpperCase(), source: "HAND", crop: null } },
                  })
                }
                autoCapitalize="characters"
                placeholder={`พิมพ์${f.label}จากป้าย`}
                placeholderTextColor={colors.textFaint}
                accessibilityLabel={`ป้ายรุ่น ${f.label}`}
              />
            </View>
            {v?.needsCheck && v.source === "SCAN" && v.value ? (
              <Text style={styles.doubt}>
                {/* รุ่นเต็มที่ขึ้นต้นตรงทะเบียนแล้ว — ที่ไม่มั่นใจคือส่วนท้าย ไม่ใช่ "ไม่ตรงทะเบียน" */}
                {f.model && registryModel
                  ? v.value.startsWith(registryModel.toUpperCase())
                    ? "ส่วนท้ายรุ่นเต็มอ่านได้ไม่ตรงกันทุกรอบ — "
                    : `ไม่ตรงทะเบียน (${registryModel}) — `
                  : ""}
                ระบบไม่มั่นใจ ดูกับรูปให้ดี (ระวัง O/0 · S/5 · I/1 · 2/9 · 6/E)
              </Text>
            ) : null}
          </View>
        );
      })}
      {scanned ? (
        <TouchableOpacity
          style={[styles.verify, plate.verified && styles.verifyOn]}
          onPress={() => onPlate({ ...plate, verified: !plate.verified })}
          activeOpacity={0.7}
          accessibilityLabel="ตรวจค่ากับรูปป้ายแล้ว"
        >
          <Ionicons
            name={plate.verified ? "checkbox" : "square-outline"}
            size={20}
            color={plate.verified ? colors.primary : colors.warningInk}
          />
          <Text style={styles.verifyText}>ดูทุกช่องเทียบกับรูปแล้ว ถูกต้อง</Text>
        </TouchableOpacity>
      ) : null}

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
        </>
      ) : (
        <Text style={[styles.hint, { marginTop: spacing.sm }]}>
          ยี่ห้อนี้ไม่มีคู่มือเกณฑ์เคลม — ข้อมูลป้ายรุ่น + รูปอะไหล่ที่เสียด้านบนส่งให้ Admin Spare Part
        </Text>
      )}

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
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  checkText: { flex: 1, fontSize: 13, color: colors.text },
  install: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
  installText: { flex: 1, minWidth: 0, fontSize: 13, color: colors.text },
  sum: { gap: 4, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.tile },
  sumHead: { fontSize: 12.5, fontWeight: "800", color: colors.navy, marginTop: 2 },
  sumRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  sumLabel: { width: 110, fontSize: 12.5, color: colors.textMuted },
  sumValue: { fontSize: 13.5, fontWeight: "800", color: colors.text, fontFamily: "monospace" },
  sumPhoto: { width: "100%", height: 200, borderRadius: radius.sm, backgroundColor: colors.card },
  link: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
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
  photo,
}: {
  nameplate?: {
    verified?: boolean;
    fields: { key: string; label: string; value: string; source: "SCAN" | "HAND"; crop?: string | null }[];
  } | null;
  /** รูปป้ายเต็มที่ระบบอ่านค่ามา — กดดูขนาดเต็ม */
  photo?: { uri: string | null; open: () => void } | null;
  fieldCheck?: { errorCode: string; errorName: string; checked: string[]; install?: { key: string; label: string; note: string; answer: boolean }[] } | null;
}) {
  if (!nameplate?.fields?.length && !fieldCheck) return null;
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
          {nameplate.fields.some((f) => f.source === "SCAN") ? (
            <Text style={styles.hint}>{nameplate.verified ? "ช่างติ๊กว่าตรวจค่ากับรูปแล้ว" : "ค่าที่ระบบอ่าน — ยังไม่ได้ตรวจกับรูป"}</Text>
          ) : null}
          {nameplate.fields.map((f) => (
            <View key={f.key} style={styles.sumRow}>
              <Text style={styles.sumLabel}>{f.label}</Text>
              <Text style={styles.sumValue}>{f.value}</Text>
              <Text style={[styles.tag, f.source === "SCAN" ? styles.tagScan : styles.tagHand]}>
                {f.source === "SCAN" ? "อ่านจากรูป" : "พิมพ์เอง"}
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
