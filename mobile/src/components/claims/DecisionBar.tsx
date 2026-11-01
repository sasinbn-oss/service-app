/**
 * แถบตัดสินเคลมล่างจอของหน้าตรวจเคลม — อยู่นอกส่วนที่เลื่อน (วางต่อท้าย ScrollView ในกรอบใบงาน) เห็นตลอดไม่ว่าเลื่อนไปดูหลักฐานไหน
 *
 * เดิมปุ่มอนุมัติ/ตีกลับอยู่ท้ายการ์ดเคลมซึ่งอยู่กลางใบงานยาว ๆ ผู้ตรวจดูวิดีโอเสร็จต้องเลื่อนหาปุ่ม
 * และบนจอ 1366×768 ปุ่มหลุดจอทุกครั้ง (ตัวอย่างที่เจ้าของงานเลือก: แถบสูงไม่เกิน 56 บนจอกว้าง)
 * ไม่ใช่ position: fixed — กรอบใบงานเป็นหน้าต่างที่ย่อ/ขยายได้ แถบต้องติดกรอบ ไม่ใช่ติดหน้าจอ
 *
 * ตัดสินทีละชิ้น (เคลมก้อน 3): "{ชิ้น}:" ✓ ผ่าน · ✗ ตีกลับ · ปิดเคลม ไม่ส่งผู้ขาย ของชิ้นที่เปิดอยู่ + สรุปทั้งใบ + ปุ่มส่งปุ่มเดียว
 * เดิมตัดสินทั้งใบ ชิ้นที่ดีต้องถูกตีกลับไปพร้อมชิ้นที่มีปัญหา แล้วช่างต้องส่งชิ้นที่ดีซ้ำทุกรอบ
 * กล่องตีกลับ (ติ๊กช่องที่ต้องแก้ · เคลมก้อน 4) ลอยอยู่เหนือแถบ (ไม่อยู่ในแถบ) แถบจึงสูงเท่าเดิมทุกจังหวะ
 * ตีกลับทั้งใบอยู่ "✓ ผ่าน" กดไม่ได้ — ข้อมูลเครื่องที่ใช้ร่วมกันผิด ชิ้นไหนก็ผ่านไม่ได้ (เอาติ๊กข้อมูลเครื่องออกก่อน)
 * ดูในฐานะผู้ใช้อื่น: เซิร์ฟเวอร์ไม่รับคำสั่งอยู่แล้ว แถบจึงเหลือแค่บอกว่าดูได้อย่างเดียว ไม่มีปุ่มให้กดแล้วล้ม
 */
import React, { useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../Tap";
import Spinner from "../Spinner";
import ClaimTrail, { type TrailEvent } from "./ClaimTrail";
import RejectPanel from "./RejectPanel";
import DownloadPanel from "./DownloadPanel";
import type { ClaimVerdicts, ReviewOutcome, Verdict } from "./useClaimVerdicts";
import { colors, radius, spacing } from "../../theme";

export default function DecisionBar({
  v,
  readOnly,
}: {
  v: ClaimVerdicts;
  /** ดูในฐานะผู้ใช้อื่น — ไม่มีปุ่มตัดสิน */
  readOnly: boolean;
}) {
  // วัดความกว้างของแถบเอง (กรอบใบงานย่อได้ ไม่เท่าจอเสมอ) · ก่อนวัดได้ใช้ความกว้างจอไปก่อน
  const { width: screenW } = useWindowDimensions();
  const [width, setWidth] = useState(screenW);
  /**
   * จอกว้างพอวางทุกอย่างในแถวเดียว (สูง 56) · มือถือซ้อนเป็นแถว ปุ่มส่งเต็มความกว้าง
   * ช่วงกลาง (แท็บเล็ตตั้ง · หน้าต่างครึ่งจอ ~720–940) ปุ่มยังอยู่แถวเดียว แต่สรุปทั้งใบลงไปบรรทัดของตัวเอง —
   * ชื่อชิ้น + ปุ่มตัดสินสามปุ่ม + ปุ่มส่งกินไป ~700 แล้ว เดิมสรุปถูกบีบเหลือ 0–60 px (ไม่เห็นว่าชิ้นไหนยังไม่ได้ตัดสิน)
   * และปุ่มส่งล้นขอบกรอบ · แถวปุ่มตัดบรรทัดได้ ปุ่มส่งที่ไม่พอที่ลงบรรทัดใหม่ชิดขวา ไม่ล้น
   * ขีด 940 ไม่ใช่ 1080 เพราะแถบกว้างเท่าจอ "ลบเมนูข้างกว้าง 288" — จอ 1280 เหลือ 984, จอ 1366 เหลือ ~1078
   * ตั้ง 1080 แล้วจอที่เจ้าของงานเลือกในตัวอย่าง (1366×768) ได้แถบสองชั้นสูง 76 ทั้งที่สัญญาไว้ไม่เกิน 56 (เทสต์ claim-review ข้อ 2 จับได้)
   */
  const oneRow = width >= 720;
  const summaryInRow = width >= 940;

  if (readOnly) {
    return (
      <View style={[styles.bar, styles.readOnly]} accessibilityLabel="แถบตัดสินเคลม">
        <Ionicons name="eye-outline" size={18} color={colors.textMuted} />
        <Text style={styles.readOnlyText}>ดูได้อย่างเดียว แก้ไขไม่ได้</Text>
      </View>
    );
  }

  const p = v.active;
  if (!p) return null;
  const eff = v.effOf(p);

  const verdictBtn = (
    verdict: Verdict,
    label: string,
    tone: { on: object; off: object; onText: object; offText: object },
    blocked = false
  ) => {
    const on = eff === verdict && !blocked;
    return (
      <TouchableOpacity
        key={verdict}
        style={[styles.vBtn, !oneRow && styles.vBtnStack, blocked ? styles.blocked : on ? tone.on : tone.off, v.saving && styles.off]}
        onPress={() => v.setVerdict(p.key, verdict)}
        disabled={v.saving || blocked}
        activeOpacity={0.8}
        accessibilityState={{ selected: on, disabled: blocked }}
      >
        <Text style={[styles.vText, blocked ? styles.blockedText : on ? tone.onText : tone.offText]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const summary = (
    <Text style={[styles.summary, summaryInRow && { flex: 1 }]} numberOfLines={summaryInRow ? 2 : undefined}>
      ทั้งใบ: {v.summary}
    </Text>
  );

  return (
    <>
      {/* ช่องที่ต้องแก้ของชิ้นที่เปิดอยู่ — อยู่เหนือแถบ ติดกับปุ่มที่เพิ่งกด ไม่ต้องเลื่อนหา */}
      <RejectPanel v={v} />
      <View style={styles.bar} accessibilityLabel="แถบตัดสินเคลม" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {v.error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {v.error}
          </Text>
        ) : null}
        <View style={[styles.row, !oneRow && styles.rowStack, oneRow && !summaryInRow && styles.rowWrap]}>
          <Text style={[styles.partName, oneRow && styles.partNameRow]} numberOfLines={oneRow ? 2 : undefined}>
            {p.name}:
          </Text>
          {p.locked ? (
            <Text
              style={[styles.lockText, p.locked === "APPROVED" ? { color: colors.successInk } : { color: colors.body }]}
              numberOfLines={oneRow ? 2 : undefined}
            >
              {p.locked === "APPROVED"
                ? `ผ่านแล้ว (รอบ ${p.round}) — ล็อกไว้ ไม่ต้องตรวจซ้ำ`
                : `ปิดเคลม ไม่ส่งผู้ขาย (รอบ ${p.round}) — ${v.declineTextOf(p)}`}
            </Text>
          ) : (
            <View style={[styles.verdicts, !oneRow && styles.verdictsStack]}>
              {verdictBtn(
                "APPROVE",
                "✓ ผ่าน",
                { on: styles.okOn, off: styles.okOff, onText: styles.onText, offText: { color: colors.successInk } },
                v.whole
              )}
              {verdictBtn("REJECT", "✗ ตีกลับ", { on: styles.noOn, off: styles.noOff, onText: styles.onText, offText: { color: colors.dangerInk } })}
              {verdictBtn("DECLINE", "ปิดเคลม ไม่ส่งผู้ขาย", {
                on: styles.dropOn,
                off: styles.dropOff,
                onText: styles.onText,
                offText: { color: colors.body },
              })}
            </View>
          )}
          {summaryInRow || !oneRow ? summary : null}
          <TouchableOpacity
            style={[
              styles.submit,
              !oneRow && styles.submitStack,
              oneRow && !summaryInRow && styles.submitPushed,
              !v.decided ? styles.submitOff : v.rejecting ? styles.submitReject : styles.submitGo,
              v.saving && styles.off,
            ]}
            onPress={v.press}
            disabled={v.saving}
            activeOpacity={0.8}
            accessibilityState={{ disabled: !v.decided }}
          >
            {v.saving ? <Spinner color={v.decided ? "#fff" : colors.navy} size="small" /> : null}
            <Text style={[styles.submitText, !v.decided && { color: colors.body }]}>{v.submitLabel}</Text>
          </TouchableOpacity>
        </View>
        {oneRow && !summaryInRow ? summary : null}
      </View>
    </>
  );
}

/**
 * หลังตัดสินเสร็จ — สรุปให้เห็นตรงหน้าว่าเกิดอะไรกับใบนี้ (ตัวอย่างที่เจ้าของงานเลือก doneHead/doneLine/doneParts · notice)
 * เดิมกดแล้วหน้าตรวจหายไปเฉย ๆ เหลือใบงานยาว ๆ ผู้ตรวจต้องอ่านเองว่าผ่านกี่ชิ้น ปิดอะไรไป และต้องย้อนไปหาใบถัดไปเอง
 * มีชิ้นอนุมัติ = แผงดาวน์โหลดหลักฐานส่งผู้ขายอยู่ใต้สรุป (เคลมก้อน 6) — งานถัดไปของผู้ตรวจคือส่งของให้ผู้ขาย ไม่ต้องไปหาที่อื่น
 * ปิดเคลมทุกชิ้นไม่มีแผงนี้ (ไม่มีใบเคลมไปผู้ขาย)
 */
export function ReviewDone({
  outcome,
  trail,
  onNext,
  busy,
  downloads,
}: {
  outcome: ReviewOutcome;
  trail: TrailEvent[];
  onNext: () => void;
  busy: boolean;
  /** ใบที่เพิ่งอนุมัติ — ขึ้นแผงดาวน์โหลดหลักฐาน · ไม่ส่ง = ไม่มีแผง (คนที่ไม่ได้ส่งของให้ผู้ขาย) */
  downloads?: { workOrderId: number; code: string } | null;
}) {
  const closed = outcome.kind === "closed";
  return (
    <View style={{ gap: spacing.md }}>
      <View
        style={[styles.done, closed ? styles.doneOk : styles.doneBack]}
        accessibilityLabel="ผลการตรวจเคลม"
      >
        <View style={styles.doneTop}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={[styles.doneHead, { color: closed ? colors.successInk : colors.text }]}>
              {outcome.head}
            </Text>
            {outcome.line ? <Text style={styles.doneLine}>{outcome.line}</Text> : null}
          </View>
          <TouchableOpacity style={[styles.nextBtn, busy && styles.off]} onPress={onNext} disabled={busy} activeOpacity={0.8}>
            {busy ? <Spinner color={colors.navy} size="small" /> : null}
            <Text style={styles.nextText}>ใบถัดไป →</Text>
          </TouchableOpacity>
        </View>
        {closed ? <ClaimTrail trail={trail} /> : null}
        {outcome.parts.map((l) => (
          <Text key={l.text} style={[styles.donePart, l.tone === "ok" ? { color: colors.successInk } : { color: colors.body }]}>
            {l.text}
          </Text>
        ))}
      </View>
      {closed && outcome.approved && downloads ? <DownloadPanel workOrderId={downloads.workOrderId} code={downloads.code} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.card,
    borderTopWidth: 2,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    // 5 + ปุ่ม 44 + 5 + เส้นบน 2 = 56 พอดีเพดานของแบบ (จอ 1366×768 เหลือที่ให้หลักฐานมากที่สุด)
    paddingVertical: 5,
    gap: 4,
  },
  readOnly: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  readOnlyText: { fontSize: 14, fontWeight: "700", color: colors.textMuted },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowStack: { flexDirection: "column", alignItems: "stretch", gap: 6 },
  rowWrap: { flexWrap: "wrap", rowGap: 6 },
  partName: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.text },
  partNameRow: { maxWidth: 130, flexShrink: 0 },
  lockText: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  verdicts: { flexDirection: "row", gap: 8 },
  verdictsStack: { flexWrap: "wrap" },
  vBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  vBtnStack: { flexGrow: 1 },
  vText: { fontSize: 14.5, fontWeight: "700" },
  onText: { color: "#fff" },
  // พื้นปุ่มที่เลือกใช้ *Fill (เข้มทั้งสองโหมด) — *Ink โหมดมืดเป็นสีอ่อน ตัวขาวบนนั้นหายไปพอดีตอนที่กดเลือก
  okOn: { backgroundColor: colors.successFill, borderColor: colors.successFill },
  okOff: { backgroundColor: colors.card, borderColor: colors.successInk },
  noOn: { backgroundColor: colors.dangerFill, borderColor: colors.dangerFill },
  noOff: { backgroundColor: colors.card, borderColor: colors.dangerInk },
  // พื้นเทาเข้มทั้งสองโหมด — ตัวขาวอ่านได้เสมอ (textMuted โหมดมืดเป็นเทาอ่อน)
  dropOn: { backgroundColor: colors.neutralFill, borderColor: colors.neutralFill },
  dropOff: { backgroundColor: colors.card, borderColor: colors.borderStrong },
  summary: { minWidth: 0, fontSize: 12, lineHeight: 16, color: colors.body },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  submitStack: { alignSelf: "stretch" },
  submitPushed: { marginLeft: "auto" },
  submitOff: { backgroundColor: colors.rowAlt },
  submitReject: { backgroundColor: colors.dangerFill },
  submitGo: { backgroundColor: colors.navyFill },
  submitText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  off: { opacity: 0.6 },
  error: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.dangerInk },
  // ✓ ผ่าน ตอนตีกลับทั้งใบ — เทา กดไม่ได้ (ตัวอย่าง okOff)
  blocked: { backgroundColor: colors.rowAlt, borderColor: colors.borderStrong },
  blockedText: { color: colors.textMuted },
  done: { borderRadius: radius.md, borderWidth: 2, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  // สีตามตัวอย่างที่เจ้าของงานเลือก: ปิดงานแล้ว = เขียวเสมอ (ปิดเคลมทุกชิ้นก็คือตรวจจบ ไม่ใช่ข้อผิดพลาด) ·
  // ตีกลับแล้ว = ฟ้าแจ้งข้อมูล — ตีกลับสำเร็จแล้ว ถ้าเป็นแดงผู้ตรวจจะอ่านว่ากดแล้วพัง
  doneOk: { borderColor: colors.successLine, backgroundColor: colors.successSoft },
  doneBack: { borderColor: colors.primaryLine, backgroundColor: colors.primarySoft },
  doneTop: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  doneHead: { fontSize: 16, lineHeight: 24, fontWeight: "800" },
  doneLine: { fontSize: 13, lineHeight: 19, color: colors.body },
  donePart: { fontSize: 14, lineHeight: 21, fontWeight: "600" },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.navy,
    backgroundColor: colors.card,
  },
  nextText: { fontSize: 14.5, fontWeight: "700", color: colors.navy },
});
