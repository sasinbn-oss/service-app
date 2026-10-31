/**
 * ยืนยันค่าป้ายรุ่นทีละช่อง (เคลมก้อน 5 · ตัวอย่างที่เจ้าของงานเลือก ขั้น "เครื่อง")
 *
 * ทำไมไม่ใช่ติ๊กครั้งเดียวแบบเดิม ("ดูทุกช่องเทียบกับรูปแล้ว ถูกต้อง"): ช่างติ๊กผ่านทั้งชุดโดยไม่ได้ดูรุ่นทีละตัว
 * แล้วรุ่นที่ OCR อ่าน 6 เป็น E หรือ 0 เป็น O ไปถึงผู้ขาย — ผู้ขายตีกลับทั้งใบเพราะรุ่นไม่ตรงเครื่อง
 * ตอนนี้รุ่นกับ Serial ต้องกดยืนยันทุกครั้ง (พิมพ์เองก็ต้องกด · เจ้าของงานตอบข้อ 8) โดยมีภาพตัดบรรทัดจริงวางข้างค่า
 * ตัวที่หน้าตาคล้ายกัน (O/0 · S/5 · E/6) ขีดเส้นแดง แตะสลับได้ทันที ไม่ต้องพิมพ์ใหม่ทั้งรหัส 18 ตัว
 * ช่องอื่นของป้ายกดยืนยันเฉพาะที่ระบบไม่มั่นใจ — ทุกช่องต้องกดเหมือนกันจะกลายเป็นกดผ่านโดยไม่ดูอีก
 *
 * แก้ค่าเมื่อไหร่ (สลับ/พิมพ์) การยืนยันหายต้องกดใหม่ แต่ภาพตัดยังอยู่ — ผู้ตรวจต้องเทียบค่าที่แก้กับภาพเดิม
 * read เก็บค่าที่ระบบอ่านได้ครั้งแรก นับ "แก้แล้ว n ตัว" ให้ช่างและผู้ตรวจเห็นว่าเปลี่ยนจากที่ระบบอ่านไปเท่าไหร่
 */
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import TouchableOpacity from "../Tap";
import ClaimCrop from "../claims/ClaimCrop";
import { changedChars } from "../../utils/claimEvidence";
import { SWAP, plateFields, plateNeedsConfirm, swapAt, type ClaimGuide, type PlateField, type PlateValue } from "../../utils/nameplate";
import type { PlateDraft } from "../ClaimMachineBox";
import { colors, radius, spacing } from "../../theme";

/** รุ่นกับ Serial — สองช่องที่ต้องกดยืนยันทุกครั้ง (ชื่อปุ่มต่างกัน: รุ่นยาวต้องดูทุกตัว) */
const isKey = (f: Pick<PlateField, "key" | "model">) => !!f.model || f.key === "model" || f.key === "serial";

/**
 * สิ่งที่ยังขาดของป้ายรุ่น — ตรงกับที่เซิร์ฟเวอร์เช็คตอนปิดงาน (ค่าว่างทั้งป้าย · รุ่น/Serial ที่มีค่าแต่ยังไม่ยืนยัน · ช่องที่ระบบไม่มั่นใจ)
 * key = จุดที่ปุ่ม "พาไป" เลื่อนไปหา (spot ในฟอร์มปิดงาน)
 */
export function plateGaps(guide: ClaimGuide | null | undefined, plate: PlateDraft): { key: string; text: string }[] {
  if (!guide) return [];
  const fields = plateFields(guide.plate);
  const gapText = (f: PlateField) => (isKey(f) ? (f.key === "serial" ? "ยืนยัน Serial" : `ยืนยัน${f.label}`) : `ยืนยันช่อง ${f.label}`);
  // ป้ายยังว่าง = ยังไม่ได้ยืนยันรุ่น/Serial (ข้อเดียวกับหลังอ่านป้าย) — ตัวหารบนขั้นไม่เปลี่ยนตอนระบบอ่านป้ายเสร็จ
  // ข้อแรกพาไปที่รูปป้าย (ต้องถ่าย/อ่านก่อนถึงจะยืนยันได้) · ป้ายที่ไม่มีรุ่น/Serial ให้ยืนยันเลย ขาดทั้งป้ายเป็นข้อเดียว
  if (!fields.some((f) => plate.values[f.key]?.value?.trim())) {
    const keys = fields.filter(isKey);
    if (!keys.length) return [{ key: "m:plate", text: "ข้อมูลป้ายรุ่น" }];
    return keys.map((f, i) => ({ key: i === 0 ? "m:plate" : `m:field:${f.key}`, text: gapText(f) }));
  }
  return fields
    // รุ่น/Serial ที่ยังว่างหลังอ่านป้ายไม่นับขาด (ไม่มีค่าให้ยืนยัน · เซิร์ฟเวอร์ก็ไม่บังคับ) — ตัวนับขึ้นครบได้
    .filter((f) => plateNeedsConfirm(f, plate.values[f.key]) && !plate.values[f.key]?.confirmed)
    .map((f) => ({ key: `m:field:${f.key}`, text: gapText(f) }));
}

/**
 * จำนวนข้อของป้าย (ตัวหารของตัวนับบนขั้น "เครื่อง") — รุ่น/Serial ตามแบบป้ายเสมอ (ตัวอย่างนับคงที่ ยืนยันรุ่น · ยืนยัน Serial · Error)
 * เดิมนับ "มีค่า 1 ข้อ + ช่องที่ต้องยืนยัน" ตัวนับกระโดดจาก 0/2 เป็น 1/4 ตอนระบบอ่านป้ายเสร็จ เหมือนงานเพิ่มขึ้นหลังสแกน
 * ช่องอื่นที่ระบบไม่มั่นใจ (Oasis) ยังเพิ่มเข้ามาได้ — รู้ได้หลังอ่านเท่านั้น และไม่ใช่ทุกใบ
 */
export function plateItemCount(guide: ClaimGuide | null | undefined, plate: PlateDraft): number {
  if (!guide) return 0;
  const fields = plateFields(guide.plate);
  const keys = fields.filter(isKey).length;
  const unsure = fields.filter((f) => !isKey(f) && plateNeedsConfirm(f, plate.values[f.key])).length;
  return (keys || 1) + unsure;
}

/** แก้ค่าช่องหนึ่ง — ยืนยันหาย · ภาพตัดอยู่ · ค่าที่มาจากรูปแล้วแก้ยังนับว่าอ่านจากรูป (แก้แล้ว n ตัว) */
export function editValue(prev: PlateValue | undefined, value: string): PlateValue {
  const read = prev?.read ?? (prev?.source === "SCAN" ? prev.value : undefined);
  return {
    value,
    source: prev?.source === "SCAN" ? "SCAN" : "HAND",
    crop: prev?.crop ?? null,
    needsCheck: prev?.needsCheck,
    confirmed: false,
    edited: read !== undefined ? value !== read : !!prev?.value,
    ...(read !== undefined ? { read } : {}),
  };
}

export default function PlateConfirm({
  guide,
  plate,
  onPlate,
  doubt,
  readOnly,
  spot,
  flashOn,
}: {
  guide: ClaimGuide;
  plate: PlateDraft;
  onPlate: (next: PlateDraft) => void;
  /** คำเตือนเมื่อระบบไม่มั่นใจรุ่น (เทียบกับรุ่นที่ระบบมี) — ฟอร์มคิดให้เพราะรู้ว่าเทียบกับอะไร */
  doubt: (value: string) => string;
  readOnly?: boolean;
  spot?: (key: string) => object;
  flashOn?: (key: string) => React.ReactNode;
}) {
  const fields = plateFields(guide.plate);
  return (
    <View style={{ gap: spacing.md }}>
      {fields.map((f) => (
        <View key={f.key} {...(spot ? spot(`m:field:${f.key}`) : {})}>
          {flashOn ? flashOn(`m:field:${f.key}`) : null}
          <PlateFieldBlock
            field={f}
            value={plate.values[f.key]}
            readOnly={readOnly}
            doubt={f.model ? doubt : undefined}
            onChange={(v) => onPlate({ ...plate, values: { ...plate.values, [f.key]: v } })}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * ช่องหนึ่งของป้าย — ใช้ทั้งในขั้น "เครื่อง" และในฟอร์มแก้เคลมตอนผู้ตรวจชี้ว่ารุ่น/Serial ผิด (FixList)
 * สองที่ต้องหน้าตาและกติกาเดียวกัน ไม่งั้นแก้รุ่นจากรายการ "ต้องแก้" แล้วไม่รู้ว่าต้องกดยืนยันซ้ำ
 */
export function PlateFieldBlock({
  field,
  value: v,
  onChange,
  doubt,
  readOnly,
}: {
  field: PlateField;
  value: PlateValue | undefined;
  onChange: (next: PlateValue) => void;
  doubt?: (value: string) => string;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const value = v?.value ?? "";
  const must = isKey(field) || plateNeedsConfirm(field, v);
  const confirmed = !!v?.confirmed;
  const showInput = !readOnly && (editing || !value);
  const model = !!field.model || field.key === "model";
  const confirmText = model ? "✓ ตรงกับรูปทุกตัว" : "✓ ตรงกับรูป";
  const doneText = model ? "✓ ยืนยันแล้ว: ตรงกับรูปทุกตัว" : "✓ ยืนยันแล้ว: ตรงกับรูป";
  const changed = v?.read !== undefined ? changedChars(value, v.read) : 0;
  const confirm = () => {
    if (!v || readOnly) return;
    setEditing(false);
    onChange({ ...v, confirmed: true });
  };

  return (
    <View
      style={[styles.block, must && value ? (confirmed ? styles.blockOk : styles.blockTodo) : null]}
      accessibilityLabel={`ป้ายรุ่นช่อง ${field.label}`}
    >
      <View style={styles.head}>
        <Text style={styles.label}>
          {field.label} {isKey(field) ? <Text style={styles.must}>(ต้องกดยืนยัน)</Text> : null}
        </Text>
        {value ? (
          confirmed ? (
            <Text style={[styles.badge, styles.badgeOk]}>✓ ยืนยันแล้ว</Text>
          ) : v?.needsCheck ? (
            <Text style={[styles.badge, styles.badgeDoubt]}>ระบบไม่มั่นใจ</Text>
          ) : null
        ) : null}
      </View>

      {v?.crop ? (
        <View style={{ gap: 2 }}>
          <Text style={styles.small}>ภาพตัดจากรูปป้าย</Text>
          <ClaimCrop uri={v.crop} label={field.label} />
        </View>
      ) : null}

      {/* รุ่นยาว: แยกทีละตัวให้เทียบกับภาพตัดได้ — ตัวที่หน้าตาคล้ายกันขีดแดง แตะสลับ (ตัวอย่าง cells) */}
      {model && value ? (
        <>
          <Text style={styles.small}>แตะตัวที่ขีดแดงเพื่อสลับ O↔0 · S↔5 · E↔6 ให้ตรงกับภาพ</Text>
          <View style={styles.cells} accessibilityLabel={`รุ่นที่จะส่ง ${value}`}>
            {[...value].map((ch, i) => {
              const tap = !!SWAP[ch] && !readOnly;
              const diff = v?.read !== undefined && v.read[i] !== ch;
              const cell = [styles.cell, diff && styles.cellChanged, tap && styles.cellTap];
              return tap ? (
                <TouchableOpacity
                  key={i}
                  style={cell}
                  onPress={() => onChange(editValue(v, swapAt(value, i)))}
                  accessibilityLabel={`ตัวที่ ${i + 1} คือ ${ch} — แตะเพื่อเปลี่ยนเป็น ${SWAP[ch]}`}
                >
                  <Text style={styles.cellText}>{ch}</Text>
                </TouchableOpacity>
              ) : (
                <View key={i} style={cell}>
                  <Text style={styles.cellText}>{ch}</Text>
                </View>
              );
            })}
          </View>
          {v?.read !== undefined ? (
            <Text style={styles.small}>
              ระบบอ่านได้ <Text style={styles.mono}>{v.read}</Text> · {changed ? `แก้แล้ว ${changed} ตัว (พื้นฟ้า)` : "ยังไม่ได้แก้ตัวไหน"}
            </Text>
          ) : null}
        </>
      ) : value && !showInput ? (
        <Text style={styles.value} accessibilityLabel={`${field.label}ที่จะส่ง ${value}`}>
          {value}
        </Text>
      ) : null}

      {/* ระบบไม่มั่นใจรุ่น — บอกว่าเทียบกับอะไรแล้วไม่ตรง (หรือไม่มีอะไรให้เทียบ) ให้ช่างดูกับรูปทีละตัว */}
      {model && value && v?.needsCheck && v.source === "SCAN" && !confirmed && doubt ? (
        <Text style={styles.doubt}>{doubt(value)}</Text>
      ) : null}

      {showInput ? (
        <View style={{ gap: 4 }}>
          {value ? <Text style={styles.small}>{field.label} — แก้ให้ตรงกับภาพ แล้วกดยืนยัน</Text> : null}
          <TextInput
            style={[styles.input, v?.needsCheck && !confirmed ? styles.inputDoubt : null]}
            value={value}
            onChangeText={(t) => {
              // พิมพ์ตัวแรกในช่องว่างแล้วช่องต้องไม่หาย (ช่องขึ้นเพราะยังไม่มีค่า) — ถือว่ากำลังแก้จนกว่าจะกดยืนยัน
              setEditing(true);
              onChange(editValue(v, t.toUpperCase()));
            }}
            autoCapitalize="characters"
            placeholder={`พิมพ์${field.label}จากป้าย`}
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={`ป้ายรุ่น ${field.label}`}
          />
        </View>
      ) : null}

      {value && must && !readOnly ? (
        confirmed ? (
          <View style={styles.row}>
            <Text style={styles.ok}>{doneText}</Text>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => {
                onChange({ ...v!, confirmed: false });
                setEditing(true);
              }}
              accessibilityLabel={`แก้ ${field.label}`}
            >
              <Text style={styles.editText}>แก้</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.row}>
            <TouchableOpacity style={styles.confirmBtn} onPress={confirm} accessibilityLabel={`ยืนยัน ${field.label} ตรงกับรูป`}>
              <Text style={styles.confirmText}>{confirmText}</Text>
            </TouchableOpacity>
            {!showInput ? (
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)} accessibilityLabel={`แก้ ${field.label}`}>
                <Text style={styles.editText}>แก้</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  // ต้องกดยืนยันแต่ยังไม่กด = กรอบส้ม 2 px · ยืนยันแล้ว = เขียว (ตัวอย่าง fx.model)
  blockTodo: { borderWidth: 2, borderColor: colors.warning },
  blockOk: { borderWidth: 2, borderColor: colors.success },
  head: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  label: { fontSize: 15, lineHeight: 22, fontWeight: "800", color: colors.text },
  must: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  badge: { fontSize: 12.5, lineHeight: 20, fontWeight: "700", paddingHorizontal: 8, borderRadius: radius.pill, overflow: "hidden" },
  badgeOk: { color: colors.successInk, backgroundColor: colors.successSoft },
  badgeDoubt: { color: colors.warningInk, backgroundColor: colors.warningSoft },
  small: { fontSize: 13, lineHeight: 19, color: colors.body },
  mono: { fontFamily: "monospace", letterSpacing: 1 },
  cells: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  // หกช่องต่อแถว (ตัวอย่าง grid 6 คอลัมน์) สูง 52 — นิ้วแตะตัวเดียวได้แม่นบนจอ 360 px
  cell: {
    width: "14.6%",
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.rowAlt,
  },
  cellTap: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderBottomWidth: 4, borderBottomColor: colors.danger },
  // ตัวที่ช่างสลับแล้ว (ต่างจากที่ระบบอ่าน) — พื้นฟ้า (ตัวอย่าง modelChanged)
  cellChanged: { backgroundColor: colors.sky50 },
  cellText: { fontFamily: "monospace", fontSize: 22, fontWeight: "800", color: colors.text },
  value: { fontFamily: "monospace", fontSize: 20, lineHeight: 30, fontWeight: "800", letterSpacing: 2, color: colors.text },
  doubt: { fontSize: 13, lineHeight: 19, color: colors.warningInk },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    minHeight: 48,
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "monospace",
    color: colors.text,
    backgroundColor: colors.card,
  },
  inputDoubt: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  ok: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: "800", color: colors.successInk },
  confirmBtn: {
    minHeight: 48,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.successFill,
  },
  confirmText: { fontSize: 15, fontWeight: "800", color: "#fff" },
  editBtn: {
    minHeight: 48,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.navyFill,
    backgroundColor: colors.card,
  },
  editText: { fontSize: 14, fontWeight: "700", color: colors.primaryInk },
});
