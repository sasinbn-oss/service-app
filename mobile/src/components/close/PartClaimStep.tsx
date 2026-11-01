/**
 * ขั้น "เคลมทีละชิ้น" ของฟอร์มปิดงาน — ชิ้นเดียวต่อหน้า สลับชิ้นด้วยแท็บย่อย (เคลมก้อน 5 · ตัวอย่างที่เจ้าของงานเลือก)
 *
 * ข้อ ①–⑥ เรียงตามฟอร์มเคลมของผู้ขาย แต่ละข้อมีเลขวงกลม เขียว = ครบ · เหลือง = ยังขาด ช่างเห็นทันทีว่าเหลือข้อไหน
 * เดิมทุกชิ้นต่อกันเป็นฟอร์มยาวเดียว ใบที่เคลมสองสามชิ้นเลื่อนหาช่องของชิ้นที่สองไม่เจอ และกรอกสลับชิ้นกัน
 *
 * ⑥ วิดีโอ Error/รูปอาการเป็นของเครื่อง ใช้ร่วมทุกชิ้น (เจ้าของงานตอบข้อ 2) — ถ่ายไว้ตอนก่อนซ่อมแล้วไม่ต้องแนบซ้ำทุกชิ้น
 * "ไม่ส่งเคลมชิ้นนี้" ของชิ้นที่อยู่ในประกันต้องเลือกเหตุผล (ข้อ 10) ขึ้นในประวัติใบงาน — หมดประกันกดได้เลย
 */
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../Tap";
import { ErrorCheckList } from "../ClaimMachineBox";
import { SKIP_REASONS, skipText, type ClaimPartDraft, type ClaimSkip, type SkipReason } from "../../utils/closeDraft";
import { NO_ERROR_CODE, checkLabel } from "../../utils/claimErrors";
import { foldCode } from "../../utils/claimEvidence";
import type { ClaimGuide } from "../../utils/nameplate";
import { colors, radius, spacing } from "../../theme";

/** ข้อเช็คของ Troubleshooting ที่หลักฐานในใบตอบได้อยู่แล้ว — บอกเป็นคำใบ้ ไม่ติ๊กให้ (เซิร์ฟเวอร์ส่งคู่มา) */
export type TroubleshootingHint = "ERROR_VIDEO" | "AFTER";

export interface PartStepPart {
  sparePartId: number;
  partCode: string;
  /** ชื่อที่ใช้เรียก (ชื่อไทย · ต่อรหัสเมื่อชื่อซ้ำ — กติกาเดียวกับเซิร์ฟเวอร์) */
  label: string;
}

/** เลขข้อในวงกลม — เขียวเมื่อข้อนั้นครบ เหลืองเมื่อยังขาด (ตัวอย่าง num) */
function Num({ n, ok }: { n: number; ok: boolean }) {
  return (
    <View style={[styles.num, ok ? styles.numOk : styles.numTodo]} accessibilityLabel={ok ? `ข้อ ${n} ครบแล้ว` : `ข้อ ${n} ยังขาด`}>
      <Text style={[styles.numText, { color: ok ? "#fff" : colors.warningInk }]}>{n}</Text>
    </View>
  );
}

export default function PartClaimStep({
  part,
  draft: d,
  patch,
  setOn,
  needsReason,
  warrantyUntil,
  notice,
  guide,
  errorCode,
  troubleshooting,
  tsHints,
  brand,
  videoLabel,
  hasMachineVideo,
  hasAfter,
  missing,
  slot,
  machineBlock,
  keepBox,
  readOnly,
  spot,
  flashOn,
}: {
  part: PartStepPart;
  draft: ClaimPartDraft;
  patch: (p: Partial<ClaimPartDraft>) => void;
  /** เปิด/ปิดเคลมชิ้นนี้ (ปิด = ไม่ส่งเคลม) — skip = เหตุผลเมื่อสาขาอยู่ในประกัน */
  setOn: (on: boolean, skip: ClaimSkip | null) => void;
  /** สาขายังอยู่ในประกัน — ไม่ส่งเคลมต้องบอกเหตุผล */
  needsReason: boolean;
  warrantyUntil: string | null;
  /** อาการตามใบแจ้ง — ปุ่ม "ใช้ข้อความนี้" (ไม่เติมให้เอง · เจ้าของงานตอบข้อ 6) */
  notice: string | null;
  guide: ClaimGuide | null | undefined;
  /** Error ที่เลือกในขั้นเครื่อง (หรือของใบที่อนุมัติเมื่อข้อมูลเครื่องล็อก) */
  errorCode: string | null;
  troubleshooting: string[];
  tsHints: Record<string, TroubleshootingHint>;
  brand: string;
  videoLabel: string;
  hasMachineVideo: boolean;
  hasAfter: boolean;
  /** คีย์ของข้อที่ยังขาดของชิ้นนี้ (p:{id}:photo ฯลฯ) — สีเลขข้อ */
  missing: Set<string>;
  /** ช่องไฟล์ของชิ้นนี้ (รูปอะไหล่เก่า/วิดีโอการตรวจเช็ค) — ฟอร์มถือสถานะการส่ง */
  slot: (role: "CLAIM_PART" | "CLAIM_CHECK_VIDEO", label: string, hint: string, video: boolean) => React.ReactNode;
  /** ข้อ ⑥ (ของเครื่อง ใช้ร่วมทุกชิ้น) */
  machineBlock: React.ReactNode;
  /** ถูกตีกลับแบบเก่า (ไม่ชี้ช่อง): เหตุผล + "ค่าเดิมถูกแล้ว" ทั้งชิ้น */
  keepBox?: React.ReactNode;
  readOnly?: boolean;
  spot: (key: string) => object;
  flashOn: (key: string) => React.ReactNode;
}) {
  const id = part.sparePartId;
  const k = (s: string) => `p:${id}:${s}`;
  const [asking, setAsking] = useState(false);
  const [pickReason, setPickReason] = useState<SkipReason | null>(null);
  const [other, setOther] = useState("");
  const ready = !!pickReason && (pickReason !== "OTHER" || !!other.trim());
  const err = guide?.errors.find((e) => e.code === errorCode) ?? null;
  const showEif = !!err && errorCode !== NO_ERROR_CODE && err.checks.length > 0;
  const errorChecked = d.errorChecked ?? [];
  // ข้อที่ติ๊กไว้และยังเป็นของ Error ที่เลือกอยู่ — เปลี่ยน Error ในขั้นเครื่องแล้วข้อของ Error เดิมยังค้างในร่าง (ส่งจริงถูกกรองทิ้ง)
  // แต่ปุ่ม "เติมจากข้อที่ติ๊ก" ต้องไม่หยิบไปเขียนลงข้อความที่พิมพ์บนใบเคลมถึงผู้ขาย — จะอ้างการเช็คที่ไม่ใช่ของอาการที่แจ้ง
  const shownChecks = showEif && err ? errorChecked.filter((c) => err.checks.includes(c)) : [];
  const broken = d.brokenPartCode.trim();
  const same = !!broken && foldCode(broken) === foldCode(part.partCode);

  // ยังไม่ได้ส่งเคลมชิ้นนี้ แต่สาขาในประกันและยังไม่มีเหตุผล (ร่างเก่า) — เปิดถามเหตุผลเลย ไม่ให้ค้างโดยไม่รู้ว่าขาดอะไร
  const askNow = asking || (!d.on && needsReason && !d.skip);

  const head = (
    <View style={styles.head}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.headSmall}>ส่งอะไหล่เก่าเคลม</Text>
        <Text style={styles.headName}>{part.label}</Text>
      </View>
      {d.on && !askNow && !readOnly ? (
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={() => {
            if (needsReason) {
              setAsking(true);
              setPickReason(null);
              setOther("");
            } else setOn(false, null);
          }}
          accessibilityLabel={`ไม่ส่งเคลมชิ้นนี้ ${part.partCode}`}
        >
          <Text style={styles.skipBtnText}>ไม่ส่งเคลมชิ้นนี้</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <View style={{ gap: spacing.md }} accessibilityLabel={`เคลม ${part.label}`}>
      {head}
      <Text style={styles.sub}>
        อะไหล่ที่เปลี่ยนใส่ <Text style={{ fontWeight: "800" }}>{part.partCode}</Text>
        {warrantyUntil ? ` · ในประกันถึง ${warrantyUntil}` : ""} · หัวใบเคลมระบบใส่ให้แล้ว
      </Text>

      {askNow ? (
        <View style={styles.skipPanel} {...spot(k("skip"))} accessibilityLabel={`เหตุผลที่ไม่ส่งเคลม ${part.partCode}`}>
          {flashOn(k("skip"))}
          <Text style={styles.skipTitle}>
            ไม่ส่งเคลมชิ้นนี้ — เลือกเหตุผล <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <Text style={styles.sub}>ชิ้นนี้อยู่ในประกัน เหตุผลจะขึ้นในประวัติใบงาน</Text>
          {SKIP_REASONS.map((r) => {
            const on = pickReason === r.key;
            return (
              <TouchableOpacity
                key={r.key}
                style={[styles.radio, on && styles.radioOn]}
                onPress={() => setPickReason(r.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                accessibilityLabel={`${r.label} ${part.partCode}`}
              >
                <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? colors.dangerFill : colors.textFaint} />
                <Text style={styles.radioText}>{r.label}</Text>
              </TouchableOpacity>
            );
          })}
          {pickReason === "OTHER" ? (
            <View style={{ gap: 4 }}>
              <Text style={styles.label}>เหตุผลอื่น (บังคับ)</Text>
              <TextInput
                style={[styles.input, !other.trim() && styles.inputMissing]}
                value={other}
                onChangeText={setOther}
                maxLength={300}
                placeholderTextColor={colors.textFaint}
                accessibilityLabel={`เหตุผลอื่น (บังคับ) ${part.partCode}`}
              />
            </View>
          ) : null}
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.skipConfirm, !ready && styles.skipConfirmOff]}
              onPress={() => {
                if (!ready || !pickReason) return;
                setOn(false, { reason: pickReason, note: pickReason === "OTHER" ? other.trim() : "" });
                setAsking(false);
              }}
              aria-disabled={!ready}
              accessibilityLabel={`ยืนยัน ไม่ส่งเคลม ${part.partCode}`}
            >
              <Text style={[styles.skipConfirmText, !ready && { color: colors.body }]}>ยืนยัน ไม่ส่งเคลม</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setAsking(false);
                // ร่างที่ปิดเคลมค้างไว้โดยไม่มีเหตุผล — ยกเลิก = กลับมาส่งเคลมชิ้นนี้ (ไม่ส่งต้องมีเหตุผลเสมอ)
                if (!d.on) setOn(true, null);
              }}
              accessibilityLabel={`ยกเลิก ไม่ส่งเคลม ${part.partCode}`}
            >
              <Text style={styles.cancelText}>ยกเลิก</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : !d.on ? (
        <View style={styles.skipped} accessibilityLabel={`ไม่ส่งเคลม ${part.partCode}`}>
          <Text style={styles.skippedTitle}>✓ ไม่ส่งเคลมชิ้นนี้</Text>
          {d.skip ? (
            <Text style={styles.sub}>เหตุผล: {skipText(d.skip)}</Text>
          ) : (
            <Text style={styles.sub}>ไม่เคลม (สาขาหมดประกันหรือเป็นสาขาบริษัท) — ส่งได้ถ้าชิ้นนี้ยังเคลมได้</Text>
          )}
          {!readOnly ? (
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setOn(true, null)} accessibilityLabel={`ส่งอะไหล่เก่าเคลม ${part.partCode}`}>
              <Text style={styles.cancelText}>{d.skip ? "ยกเลิก — กลับมาส่งเคลมชิ้นนี้" : "ส่งเคลมชิ้นนี้"}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <>
          {keepBox}

          {/* ① รูปอะไหล่เก่า */}
          <View style={styles.item} {...spot(k("photo"))}>
            {flashOn(k("photo"))}
            <View style={styles.itemHead}>
              <Num n={1} ok={!missing.has(k("photo"))} />
              <Text style={styles.itemTitle}>รูปอะไหล่เก่า</Text>
            </View>
            {slot("CLAIM_PART", "รูปอะไหล่เก่า", "ให้เห็นสติกเกอร์รหัส", false)}
          </View>

          {/*
            ② รหัสตัวที่เสีย อ่านจากอะไหล่ที่ถอดออกจริง ไม่เติมจากตัวที่เบิกมาใส่ — ผู้ขายรับเคลมตามตัวที่ส่งคืน
            ถ้าเติมให้ ช่างจะกดผ่านโดยไม่ได้ดูของ แล้วรุ่นที่ต่างกันจะไปรู้เอาตอนผู้ขายตีกลับ · ไม่ตรงไม่บล็อก (ผู้ตรวจเห็นเป็นธง)
          */}
          <View style={styles.item} {...spot(k("broken"))}>
            {flashOn(k("broken"))}
            <View style={styles.itemHead}>
              <Num n={2} ok={!missing.has(k("broken"))} />
              <Text style={styles.itemTitle}>รหัสอะไหล่ตัวที่เสีย (ตัวที่ส่งเคลม)</Text>
            </View>
            <TextInput
              style={[styles.input, !broken && styles.inputMissing]}
              value={d.brokenPartCode}
              onChangeText={(v) => patch({ brokenPartCode: v })}
              editable={!readOnly}
              autoCapitalize="characters"
              placeholder="พิมพ์รหัสจากสติกเกอร์บนอะไหล่เก่า"
              placeholderTextColor={colors.textFaint}
              accessibilityLabel={`รหัสอะไหล่ตัวที่เสีย ${part.partCode}`}
            />
            <Text
              style={[
                styles.match,
                !broken ? styles.matchNone : same ? styles.matchOk : styles.matchWarn,
              ]}
            >
              {!broken
                ? "พิมพ์รหัสจากสติกเกอร์บนอะไหล่เก่า"
                : same
                  ? `✓ ตรงกับอะไหล่ที่เปลี่ยนใส่ (${part.partCode})`
                  : `ไม่ตรงกับอะไหล่ที่เปลี่ยนใส่ (${part.partCode}) — ดูสติกเกอร์อีกครั้ง`}
            </Text>
          </View>

          {/* ③ อาการ/สาเหตุ — อาการจากใบแจ้งอยู่เหนือช่อง แตะใช้ได้ แต่ระบบไม่เติมให้เอง (เจ้าของงานตอบข้อ 6) */}
          <View style={styles.item} {...spot(k("symptom"))}>
            {flashOn(k("symptom"))}
            <View style={styles.itemHead}>
              <Num n={3} ok={!missing.has(k("symptom"))} />
              <Text style={styles.itemTitle}>อาการ/สาเหตุ</Text>
            </View>
            {notice?.trim() ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>ใบแจ้ง: “{notice.trim()}”</Text>
                {!readOnly ? (
                  <TouchableOpacity
                    style={styles.useBtn}
                    onPress={() => {
                      const n = notice.trim();
                      const cur = d.symptom.trim();
                      if (!cur) patch({ symptom: n });
                      else if (!cur.includes(n)) patch({ symptom: `${n} — ${cur}` });
                    }}
                    accessibilityLabel={`ใช้ข้อความนี้ ${part.partCode}`}
                  >
                    <Text style={styles.useText}>ใช้ข้อความนี้</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            <TextInput
              style={[styles.input, styles.area, !d.symptom.trim() && styles.inputMissing]}
              value={d.symptom}
              onChangeText={(v) => patch({ symptom: v })}
              editable={!readOnly}
              multiline
              placeholder="อาการที่เห็น และสาเหตุที่ช่างเจอ"
              placeholderTextColor={colors.textFaint}
              accessibilityLabel={`อาการ/สาเหตุ ${part.partCode}`}
            />
          </View>

          {/*
            ④ ช่างเข้าเช็คอะไรบ้าง — รวมสามเรื่องที่เดิมถามแยกกันไว้ที่เดียว (เจ้าของงานตอบข้อ 7) ข้อมูลยังเก็บแยกเหมือนเดิม
            เช็คตาม Error: ติ๊กเฉพาะข้อที่ทำ ไม่บังคับ ไม่พิมพ์ลงใบเคลม (ผู้ตรวจเห็นข้อที่ไม่ได้ทำเป็น ✗) · ทีละชิ้น
            Troubleshooting: ต้องทำครบ พิมพ์ลงใบเคลมในนามช่าง · คำใบ้บอกว่าหลักฐานในใบตอบข้อไหนได้แล้ว แต่ไม่ติ๊กให้
          */}
          <View style={styles.item} {...spot(k("checks"))}>
            {flashOn(k("checks"))}
            <View style={styles.itemHead}>
              <Num n={4} ok={!missing.has(k("checks")) && !missing.has(k("note"))} />
              <Text style={styles.itemTitle}>ช่างเข้าเช็คอะไรบ้าง</Text>
            </View>
            <Text style={styles.sub}>จึงระบุว่าควรเปลี่ยนชิ้นนี้ — ติ๊กข้อที่ทำเอง ระบบไม่ติ๊กให้</Text>
            {showEif && guide ? (
              <View style={styles.group}>
                <Text style={styles.groupTitle}>เช็คตาม Error {errorCode} (คู่มือ Error in Field) — ติ๊กข้อที่ทำ</Text>
                <ErrorCheckList
                  guide={guide}
                  errorCode={errorCode}
                  checked={errorChecked}
                  onChange={(next) => !readOnly && patch({ errorChecked: next })}
                  partCode={part.partCode}
                />
              </View>
            ) : null}
            {troubleshooting.length ? (
              <View style={styles.group}>
                <Text style={styles.groupTitle}>Troubleshooting {brand} (ต้องทำครบ · พิมพ์ลงใบเคลมที่ส่งผู้ขาย)</Text>
                {troubleshooting.map((t) => {
                  const on = d.troubleshooting.includes(t);
                  const hint =
                    tsHints[t] === "ERROR_VIDEO" && hasMachineVideo
                      ? `(มี${videoLabel} แล้ว)`
                      : tsHints[t] === "AFTER" && hasAfter
                        ? "(มีรูปหลังซ่อมแล้ว)"
                        : "";
                  return (
                    <TouchableOpacity
                      key={t}
                      style={styles.tick}
                      onPress={() =>
                        !readOnly && patch({ troubleshooting: on ? d.troubleshooting.filter((x) => x !== t) : [...d.troubleshooting, t] })
                      }
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      aria-checked={on}
                      accessibilityLabel={`${t} ${part.partCode}`}
                    >
                      <Ionicons name={on ? "checkbox" : "square-outline"} size={20} color={on ? colors.primary : colors.textFaint} />
                      <Text style={styles.tickText}>
                        {t} {hint ? <Text style={styles.tickHint}>{hint}</Text> : null}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            <View style={{ gap: 4 }} {...spot(k("note"))}>
              {flashOn(k("note"))}
              <View style={styles.noteHead}>
                <Text style={[styles.label, { flex: 1 }]}>
                  เขียนเพิ่ม (พิมพ์ลงใบเคลมที่ส่งผู้ขาย) <Text style={{ color: colors.danger }}>*</Text>
                </Text>
                {/* ใส่แค่ข้อความตั้งต้นจากข้อที่ติ๊กจริง ช่างพิมพ์ค่าที่วัดได้ต่อเอง (ตัวอย่าง fillNoteFromTicks) ไม่ใช่ข้อความสำเร็จรูป */}
                {(() => {
                  const ticked = [...shownChecks.map((c) => checkLabel(err, c)), ...d.troubleshooting];
                  return ticked.length && !d.checkNote.includes("เช็คแล้ว:") && !readOnly ? (
                    <TouchableOpacity
                      style={styles.useBtn}
                      onPress={() => {
                        const headText = `เช็คแล้ว: ${ticked.join(" · ")}`;
                        patch({ checkNote: d.checkNote.trim() ? `${headText} — ${d.checkNote.trim()}` : headText });
                      }}
                      accessibilityLabel={`เติมจากข้อที่ติ๊ก ${part.partCode}`}
                    >
                      <Text style={styles.useText}>เติมจากข้อที่ติ๊ก</Text>
                    </TouchableOpacity>
                  ) : null;
                })()}
              </View>
              <TextInput
                style={[styles.input, styles.area, !d.checkNote.trim() && styles.inputMissing]}
                value={d.checkNote}
                onChangeText={(v) => patch({ checkNote: v })}
                editable={!readOnly}
                multiline
                placeholder="เช่น วัดไฟเข้าบอร์ด 220V ปกติ แต่ไฟออกขาโซลินอยด์ 0V"
                placeholderTextColor={colors.textFaint}
                accessibilityLabel={`สิ่งที่เข้าเช็ค ${part.partCode}`}
              />
            </View>
          </View>

          {/* ⑤ วิดีโอการตรวจเช็ค — ของชิ้นนี้ */}
          <View style={styles.item} {...spot(k("video"))}>
            {flashOn(k("video"))}
            <View style={styles.itemHead}>
              <Num n={5} ok={!missing.has(k("video"))} />
              <Text style={styles.itemTitle}>วิดีโอการตรวจเช็ค</Text>
            </View>
            {slot("CLAIM_CHECK_VIDEO", "วิดีโอการตรวจเช็ค", "ให้เห็นจุดที่เช็คและค่าที่วัด", true)}
          </View>

          {/* ⑥ ของเครื่อง ใช้ร่วมทุกชิ้น */}
          <View style={styles.item} {...spot("evid")}>
            {flashOn("evid")}
            <View style={styles.itemHead}>
              <Num n={6} ok={!missing.has("evid")} />
              <Text style={styles.itemTitle}>
                {videoLabel} · รูปอาการ <Text style={styles.shared}>(ใช้ร่วมทุกชิ้น)</Text>
              </Text>
            </View>
            {machineBlock}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headSmall: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
  headName: { fontSize: 18, lineHeight: 26, fontWeight: "800", color: colors.text },
  sub: { fontSize: 13, lineHeight: 19, color: colors.body },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.text },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  skipBtn: {
    minHeight: 48,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerLine,
    backgroundColor: colors.card,
  },
  skipBtnText: { fontSize: 14, fontWeight: "700", color: colors.dangerInk },
  skipPanel: {
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.dangerLine,
    backgroundColor: colors.dangerSoft,
  },
  skipTitle: { fontSize: 15, lineHeight: 22, fontWeight: "800", color: colors.dangerInk },
  radio: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.dangerLine,
    backgroundColor: colors.card,
  },
  radioOn: { borderWidth: 2, borderColor: colors.dangerFill },
  radioText: { flex: 1, fontSize: 14.5, color: colors.text },
  skipConfirm: { minHeight: 48, paddingHorizontal: 16, justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.dangerFill },
  skipConfirmOff: { backgroundColor: colors.rowAlt },
  skipConfirmText: { fontSize: 15, fontWeight: "800", color: "#fff" },
  cancelBtn: {
    alignSelf: "flex-start",
    minHeight: 48,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.navyFill,
    backgroundColor: colors.card,
  },
  cancelText: { fontSize: 14, fontWeight: "700", color: colors.primaryInk },
  skipped: { gap: 6, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.rowAlt },
  skippedTitle: { fontSize: 15, lineHeight: 22, fontWeight: "800", color: colors.text },
  item: { gap: 6, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  itemHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemTitle: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: "800", color: colors.text },
  shared: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  num: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  numOk: { backgroundColor: colors.successFill, borderColor: colors.successFill },
  numTodo: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  numText: { fontSize: 14, fontWeight: "800" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 48,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.card,
  },
  area: { minHeight: 84, textAlignVertical: "top" },
  inputMissing: { borderColor: colors.warning, backgroundColor: colors.warningTint },
  match: { fontSize: 13, lineHeight: 19, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, overflow: "hidden" },
  matchNone: { color: colors.body, backgroundColor: colors.rowAlt },
  matchOk: { color: colors.successInk, backgroundColor: colors.successSoft },
  matchWarn: { color: colors.warningInk, backgroundColor: colors.warningSoft },
  notice: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  noticeText: { flex: 1, minWidth: 160, fontSize: 13.5, lineHeight: 20, color: colors.body },
  useBtn: {
    minHeight: 48,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.sky200,
    backgroundColor: colors.sky50,
  },
  useText: { fontSize: 13.5, fontWeight: "700", color: colors.primaryInk },
  group: { gap: 2, marginTop: 4 },
  groupTitle: { fontSize: 13.5, lineHeight: 20, fontWeight: "700", color: colors.body },
  tick: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48 },
  tickText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  tickHint: { fontSize: 12.5, color: colors.successInk, fontWeight: "600" },
  noteHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
});
