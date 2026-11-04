/**
 * อะไหล่นอกสโตร์ (ไม่มี SKU) — พิมพ์ชื่อ จำนวน หน่วย หมายเหตุเอง (เจ้าของงานขอ ต.ค. 69)
 *
 * แยกจาก PartPicker เพราะของพวกนี้ไม่มีให้ค้น ถ้าให้พิมพ์ในช่องค้นหาเดียวกัน คนจะไม่รู้ว่า
 * "ไม่เจอ" แปลว่าสะกดผิดหรือไม่มีในสโตร์จริง · เซิร์ฟเวอร์จับคู่ด้วยชื่อ — ชื่อเดียวกันคือของชิ้นเดียวกัน
 * (resolveOffParts ใน backend/src/routes/workOrders.ts) จึงส่งรายการเดิมกลับไปซ้ำได้โดยผลเช็คไม่หาย
 *
 * ทุกแถวถาม "จัดหาได้ไหม · จากที่ไหน" (เจ้าของงานขอ 4 พ.ย. 69 ตามตัวอย่างที่อนุมัติ) — ask บอกว่าใครกรอก:
 * plan = หัวหน้าภาค/แอดมินระบุอะไหล่ (หาได้ + แหล่ง · หาไม่ได้ + เหตุผล) · bought = ช่างซื้อเองตอนปิดงาน (ซื้อจากที่ไหน)
 * กติกาเดียวกับ offAnswerRefusal ของเซิร์ฟเวอร์ — ปุ่มบอกว่าขาดอะไรก่อนกด เซิร์ฟเวอร์ก็ปฏิเสธซ้ำ
 */
import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import QtyInput from "./QtyInput";
import { colors, radius, spacing } from "../theme";
import {
  OFF_MISSING_PLACEHOLDER,
  OFF_MISSING_REASONS,
  OFF_SOURCE_KINDS,
  OFF_SOURCE_PLACEHOLDER,
  offAnswerChip,
  type OffAnswerFields,
} from "../utils/offSource";

export interface OffPart {
  name: string;
  quantity: number;
  unit: string;
  note: string;
  /** จัดหาได้ไหม — null/ไม่มี = ยังไม่ได้ตอบ (ใบเก่าที่เติมมาให้ก็เป็นแบบนี้ ต้องตอบตอนแก้รายการ) · ค่าบริการไม่ใช้ */
  found?: boolean | null;
  /** ชิปที่เลือก — แหล่ง (หาได้ / ซื้อจาก) หรือเหตุผล (หาไม่ได้) · "" = ยังไม่เลือก */
  kind?: string;
  /** ชื่อร้าน · ที่ตั้ง/ลิงก์ · เบอร์ — หรือ ถามที่ไหนไปแล้ว · ต้องสั่งจากที่ไหน */
  detail?: string;
}

/** ใครกรอกกล่องนี้ — ดูหัวไฟล์ · ไม่ส่ง = ไม่ถาม (กล่องค่าบริการ) */
export type OffAsk = "plan" | "bought";

/** ชื่อที่ใช้จับคู่ — กติกาเดียวกับเซิร์ฟเวอร์ (offName) ช่องว่างซ้อนไม่ทำให้เป็นของคนละชิ้น */
export const offNameKey = (name: string) => name.replace(/\s+/g, " ").trim();

/** แถวอะไหล่จากเซิร์ฟเวอร์ → ของในสโตร์ (ไป PartPicker) กับของนอกสโตร์ (มาที่นี่ พร้อมคำตอบจัดหาที่เคยตอบ) */
export function splitParts<
  T extends { offCatalog?: boolean; name: string; quantity: number; unit?: string | null; note?: string | null } & OffAnswerFields,
>(rows: T[]): { store: T[]; off: OffPart[] } {
  return {
    store: rows.filter((p) => !p.offCatalog),
    off: rows
      .filter((p) => p.offCatalog)
      .map((p) => ({
        name: p.name,
        quantity: p.quantity,
        unit: p.unit ?? "",
        note: p.note ?? "",
        found: p.offFound ?? null,
        kind: p.offKind ?? "",
        detail: p.offDetail ?? "",
      })),
  };
}

/**
 * คำตอบของแถวที่ส่งเข้าเซิร์ฟเวอร์ — ช่างซื้อเอง = หาได้เสมอ · ของจากรายการที่หัวหน้าภาคจัดหา (exempt) ไม่ได้ตอบ = ไม่ส่ง
 * ส่ง null ไม่ใช่ไม่ส่ง เมื่อยังไม่ได้ตอบ — เซิร์ฟเวอร์แยกได้ว่าหน้าจอนี้มีช่องแล้ว (ไม่ส่งเลย = หน้าจอรุ่นก่อน บอกให้อัปเดต)
 */
function answerPayload(r: OffPart, ask: OffAsk | undefined, exempt?: (name: string) => boolean) {
  if (!ask) return {};
  const kind = r.kind?.trim() || null;
  const detail = r.detail?.trim() || null;
  if (ask === "bought") {
    if (!kind && !detail && exempt?.(r.name)) return {};
    return { offFound: true, offKind: kind, offDetail: detail };
  }
  return { offFound: r.found ?? null, offKind: kind, offDetail: detail };
}

/** ที่ส่งเข้าเซิร์ฟเวอร์ — แถวที่ยังไม่ได้พิมพ์ชื่อไม่ส่ง (ปุ่มยืนยันกันไว้แล้วด้วย offPartsIncomplete/offPartsMissing) */
export function offPartsPayload(rows: OffPart[], ask?: OffAsk, exempt?: (name: string) => boolean) {
  return rows
    .filter((r) => r.name.trim())
    .map((r) => ({
      name: r.name.trim(),
      quantity: r.quantity,
      unit: r.unit.trim() || null,
      note: r.note.trim() || null,
      ...answerPayload(r, ask, exempt),
    }));
}

/** มีแถวที่กดเพิ่มแล้วแต่ยังไม่ได้พิมพ์ชื่อ — ส่งไปแล้วหายเงียบ ๆ แย่กว่าบอกให้กรอก */
export const offPartsIncomplete = (rows: OffPart[]) => rows.some((r) => !r.name.trim());

/** ข้อที่ยังขาดของคำตอบแถวเดียว — null = ครบ (กติกาเดียวกับ offAnswerRefusal ของเซิร์ฟเวอร์) */
function answerMissing(r: OffPart, ask: OffAsk | undefined, exempt?: (name: string) => boolean): string | null {
  if (!ask) return null;
  const kind = r.kind?.trim() ?? "";
  const detail = r.detail?.trim() ?? "";
  const sources = OFF_SOURCE_KINDS as readonly string[];
  if (ask === "bought") {
    if (!kind && !detail && exempt?.(r.name)) return null;
    return sources.includes(kind) && detail ? null : "ซื้อจากที่ไหน";
  }
  if (r.found === null || r.found === undefined) return "หาได้หรือหาไม่ได้";
  if (r.found) return sources.includes(kind) && detail ? null : "หาได้จากที่ไหน";
  return (OFF_MISSING_REASONS as readonly string[]).includes(kind) && detail ? null : "เหตุผลที่หาไม่ได้";
}

/**
 * ทุกอย่างที่ยังขาดของกล่องอะไหล่นอก เรียงตามแถว — ฟอร์มใช้นับ "ยังขาด n อย่าง — พาไป" และกล่องเหลืองในกล่องนี้ใช้บอกรายการ
 * แถวละไม่เกินหนึ่งข้อ (ตัวอย่างที่อนุมัติ) — ชื่อก่อน แล้วค่อยคำตอบ เพราะยังไม่มีชื่อ คนอ่านไม่รู้ว่าข้อนั้นของแถวไหน
 * ไม่มีคำว่า "อะไหล่นอก" นำหน้า — ในกล่องอ่านซ้ำ ผู้เรียกที่ใช้นอกกล่อง (ฟอร์มปิดงาน · แถบคอนเฟิร์ม) เติมเอง
 */
export function offPartsMissing(rows: OffPart[], ask?: OffAsk, exempt?: (name: string) => boolean): string[] {
  const out: string[] = [];
  rows.forEach((r, i) => {
    const name = r.name.trim();
    if (!name) {
      out.push(`แถว ${i + 1}: ชื่อ/รุ่น`);
      return;
    }
    const miss = answerMissing(r, ask, exempt);
    if (miss) out.push(`“${name}”: ${miss}`);
  });
  return out;
}

/**
 * สองแบบหน้าตาเดียวกัน — "off" อะไหล่นอกสโตร์ (ส้ม) · "service" ค่าบริการที่ต้องเสนอราคา (เขียวอมฟ้า)
 * ช่องเหมือนกันทุกอย่าง (ชื่อ จำนวน หน่วย หมายเหตุ) ต่างแค่ชื่อกล่องกับสี ให้คนแยกออกว่าเป็นของหรือค่าแรง
 * แหล่งซื้อออกจากหมายเหตุแล้ว — มีช่องของตัวเอง (ask) หมายเหตุเหลือไว้ใส่สเปค
 */
const VARIANTS = {
  off: { title: "อะไหล่นอก — เสนอราคาให้ลูกค้า", badge: "ไม่มี SKU", item: "อะไหล่นอกสโตร์", add: "เพิ่มอะไหล่นอก", placeholder: "ชื่อ / รุ่นอะไหล่", unit: "ชิ้น", note: "หมายเหตุ เช่น สเปค (ไม่บังคับ)" },
  service: { title: "ค่าบริการ — เสนอราคาให้ลูกค้า", badge: null, item: "ค่าบริการ", add: "เพิ่มค่าบริการ", placeholder: "เช่น ค่าแรง ค่าเดินทาง", unit: "งาน", note: "หมายเหตุ เช่น ใช้ช่าง 2 คน ระยะทาง (ไม่บังคับ)" },
} as const;

/** คำใต้กล่องตามคนกรอก — หัวหน้าภาคต้องรู้ว่าคำตอบไปถึงใครและใช้ทำอะไร (ตัวอย่างที่อนุมัติ) */
const ASK_HINT: Record<OffAsk, string> = {
  plan: "หัวหน้าภาคเป็นคนจัดหาของนอกสโตร์ — บอกแอดมินว่าหาได้ไหม และหาได้จากที่ไหน แอดมินจะได้ทำใบเสนอราคาได้ถูก",
  bought: "ของที่หารหัสในสโตร์ไม่เจอ หรือซื้อหน้างานเอง — ของที่ซื้อเองบอกว่าซื้อจากที่ไหน · ใช้แต่ของนอกสโตร์ไม่ต้องแนบใบเหลือง",
};

export default function OffPartEditor({
  rows,
  onChange,
  variant = "off",
  title,
  hint,
  ask,
  exempt,
  highlight = false,
}: {
  rows: OffPart[];
  onChange: (next: OffPart[]) => void;
  variant?: keyof typeof VARIANTS;
  /** ตอนปิดงานไม่ได้เสนอราคาแล้ว — ใช้ชื่อกล่องอื่นแทน */
  title?: string;
  hint?: string;
  /** ถามจัดหาได้ไหม/จากที่ไหน — ดูหัวไฟล์ · ไม่ส่ง = ไม่ถาม */
  ask?: OffAsk;
  /** bought: ของที่อยู่ในรายการรอของใบนี้แล้ว (หัวหน้าภาคจัดหาไว้) — ไม่ต้องบอกว่าซื้อจากที่ไหน */
  exempt?: (name: string) => boolean;
  /** กดปุ่ม "ยังขาด … — พาไป" แล้ว — ช่องที่ยังขาดขึ้นกรอบแดง ให้เห็นว่าต้องกรอกตรงไหนของแถวไหน */
  highlight?: boolean;
}) {
  const v = VARIANTS[variant];
  const svc = variant === "service";
  const asking = !svc ? ask : undefined;
  const set = (i: number, patch: Partial<OffPart>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const missing = asking ? offPartsMissing(rows, asking, exempt) : [];
  return (
    <View style={[styles.box, svc && styles.boxService]}>
      <View style={styles.head}>
        <Text style={[styles.title, svc && { color: colors.service }]}>{title ?? v.title}</Text>
        {v.badge ? <Text style={styles.tag}>{v.badge}</Text> : null}
      </View>
      {rows.map((r, i) => {
        const miss = highlight ? answerMissing(r, asking, exempt) : null;
        return (
          <View key={i} style={styles.row}>
            <View style={styles.line}>
              <TextInput
                style={[styles.input, styles.name, !r.name.trim() && styles.inputEmpty]}
                value={r.name}
                onChangeText={(t) => set(i, { name: t })}
                placeholder={v.placeholder}
                placeholderTextColor={colors.textFaint}
                maxLength={120}
                accessibilityLabel={`ชื่อ${v.item} ${i + 1}`}
              />
              <QtyInput value={r.quantity} onChange={(n) => set(i, { quantity: n })} accessibilityLabel={`จำนวน${v.item} ${i + 1}`} />
              <TextInput
                style={[styles.input, styles.unit]}
                value={r.unit}
                onChangeText={(t) => set(i, { unit: t })}
                placeholder={v.unit}
                placeholderTextColor={colors.textFaint}
                maxLength={20}
                accessibilityLabel={`หน่วย${v.item} ${i + 1}`}
              />
              <TouchableOpacity
                onPress={() => onChange(rows.filter((_, j) => j !== i))}
                accessibilityLabel={`เอา${v.item} ${i + 1} ออก`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={20} color={colors.textFaint} />
              </TouchableOpacity>
            </View>
            {asking ? <SourceQuestions row={r} n={i + 1} ask={asking} exempt={exempt} miss={miss} onPatch={(p) => set(i, p)} /> : null}
            <TextInput
              style={styles.input}
              value={r.note}
              onChangeText={(t) => set(i, { note: t })}
              placeholder={v.note}
              placeholderTextColor={colors.textFaint}
              maxLength={300}
              accessibilityLabel={`หมายเหตุ${v.item} ${i + 1}`}
            />
          </View>
        );
      })}
      <TouchableOpacity
        style={styles.add}
        onPress={() => onChange([...rows, { name: "", quantity: 1, unit: "", note: "", found: null, kind: "", detail: "" }])}
        accessibilityLabel={v.add}
      >
        <Ionicons name="add-circle-outline" size={17} color={svc ? colors.service : colors.offPart} />
        <Text style={[styles.addText, svc && { color: colors.service }]}>{v.add}</Text>
      </TouchableOpacity>
      {asking ? (
        // ยังขาดอะไรของแถวไหน — บรรทัดเดียวทั้งกล่อง (ตัวอย่างที่อนุมัติ) ปุ่มท้ายฟอร์มนับจากรายการเดียวกันนี้
        missing.length ? (
          <View style={styles.missBox} accessibilityLabel="อะไหล่นอกที่ยังขาด">
            <Text style={styles.missText}>ยังขาด: {missing.join(" · ")}</Text>
          </View>
        ) : null
      ) : offPartsIncomplete(rows) ? (
        <Text style={styles.warn}>ใส่ชื่อ{v.item}ให้ครบ หรือกด ✕ เอาแถวที่ไม่ใช้ออก</Text>
      ) : null}
      <Text style={styles.hint}>{hint ?? (asking ? ASK_HINT[asking] : "ใช้เมื่อหารหัสในสโตร์ไม่เจอ · ไม่ต้องเช็คคลังหรือใส่เลขใบเบิก")}</Text>
    </View>
  );
}

/**
 * คำถามจัดหาของแถวเดียว — ชิปหาได้/หาไม่ได้ แล้วชิปแหล่ง/เหตุผล + ช่องรายละเอียด (บังคับทั้งคู่ — เจ้าของงานเลือกข้อ 2/3)
 * ชิปบอกสถานะ "ติดอยู่" ด้วย aria-pressed เอง — react-native-web ไม่แปลง accessibilityState ให้ (CLAUDE.md)
 * เปลี่ยนหาได้ ↔ หาไม่ได้ ล้างชิปที่เลือก (คนละชุดคำ) แต่ไม่ล้างรายละเอียดที่พิมพ์ไว้ — กดสลับพลาดแล้วข้อความไม่หาย
 */
function SourceQuestions({
  row,
  n,
  ask,
  exempt,
  miss,
  onPatch,
}: {
  row: OffPart;
  n: number;
  ask: OffAsk;
  exempt?: (name: string) => boolean;
  miss: string | null;
  onPatch: (p: Partial<OffPart>) => void;
}) {
  const item = `อะไหล่นอกสโตร์ ${n}`;
  if (ask === "bought" && exempt?.(row.name) && !row.kind && !row.detail?.trim()) {
    return <Text style={styles.exempt}>ของที่หัวหน้าภาคจัดหาไว้ในใบนี้ — ไม่ต้องบอกว่าซื้อจากที่ไหน</Text>;
  }
  const found = ask === "bought" ? true : row.found ?? null;
  const kinds = found === false ? OFF_MISSING_REASONS : OFF_SOURCE_KINDS;
  const kindOn = (k: string) => row.kind === k;
  return (
    <>
      {ask === "plan" ? (
        <View style={styles.askLine}>
          <Text style={styles.askLabel}>
            จัดหาได้ไหม <Text style={styles.star}>*</Text>
          </Text>
          <View style={styles.chips}>
            {([true, false] as const).map((f) => {
              const on = row.found === f;
              return (
                <TouchableOpacity
                  key={String(f)}
                  style={[styles.chip, on && (f ? styles.chipFound : styles.chipMissing), miss === "หาได้หรือหาไม่ได้" && styles.chipMiss]}
                  onPress={() =>
                    onPatch({
                      found: f,
                      kind: (f ? OFF_SOURCE_KINDS : OFF_MISSING_REASONS).some((k) => k === row.kind) ? row.kind : "",
                    })
                  }
                  activeOpacity={0.8}
                  aria-pressed={on}
                  accessibilityLabel={`${f ? "หาได้" : "หาไม่ได้"} ${item}`}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{f ? "หาได้" : "หาไม่ได้"}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}
      {found !== null ? (
        <View style={[styles.answer, found ? styles.answerFound : styles.answerMissing, !!miss && miss !== "หาได้หรือหาไม่ได้" && styles.answerMiss]}>
          <Text style={[styles.askLabel, { color: found ? colors.successInk : colors.dangerInk }]}>
            {ask === "bought" ? "ซื้อจากที่ไหน" : found ? "หาได้จากที่ไหน" : "ทำไมหาไม่ได้"} <Text style={styles.star}>*</Text>
          </Text>
          <View style={styles.chips}>
            {kinds.map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.chip, styles.chipSmall, kindOn(k) && styles.chipKindOn]}
                onPress={() => onPatch({ kind: k })}
                activeOpacity={0.8}
                aria-pressed={kindOn(k)}
                accessibilityLabel={`${k} ${item}`}
              >
                <Text style={[styles.chipText, styles.chipTextSmall, kindOn(k) && styles.chipTextOn]}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[styles.input, !row.detail?.trim() && !!miss && styles.inputMiss]}
            value={row.detail ?? ""}
            onChangeText={(t) => onPatch({ detail: t })}
            placeholder={found ? OFF_SOURCE_PLACEHOLDER : OFF_MISSING_PLACEHOLDER}
            placeholderTextColor={colors.textFaint}
            maxLength={300}
            accessibilityLabel={`${ask === "bought" ? "ซื้อจากที่ไหน" : found ? "แหล่งที่หาได้" : "เหตุผลที่หาไม่ได้"} ${item}`}
          />
        </View>
      ) : null}
    </>
  );
}

/** ป้าย "นอกสโตร์" ต่อท้ายชื่ออะไหล่ — ใช้ทุกที่ที่แสดงรายการอะไหล่ของใบงาน */
export function OffTag() {
  return <Text style={styles.tag}>นอกสโตร์</Text>;
}

/**
 * คำตอบจัดหาของแถวอะไหล่นอกสโตร์ในใบงาน (เจ้าของงานขอ 4 พ.ย. 69) — ป้าย "หาได้ · แหล่ง" / "หาไม่ได้ · เหตุผล" / "ยังไม่ระบุ"
 * + รายละเอียด + "หัวหน้าภาคแจ้ง · เวลา" ตามตัวอย่างที่อนุมัติ · used = ของที่ใช้ไป (ขึ้นเฉพาะที่ช่างซื้อเอง)
 * ของในสโตร์/ของที่ใช้ไปจากรายการเดิมไม่มีอะไรให้ขึ้น — คืน null
 */
export function OffSourceInfo({ part, used = false, when }: { part: OffAnswerFields; used?: boolean; when?: (iso: string) => string }) {
  const chip = offAnswerChip(part, used);
  if (!chip) return null;
  const tone =
    chip.tone === "found"
      ? { fg: colors.successInk, bg: colors.successSoft }
      : chip.tone === "missing"
        ? { fg: colors.dangerInk, bg: colors.dangerSoft }
        : { fg: colors.textMuted, bg: colors.background };
  const by = part.offAnswerAt && when ? `${part.offAnswerRole ?? "หัวหน้าภาค"}แจ้ง · ${when(part.offAnswerAt)}` : null;
  return (
    <View style={styles.info} accessibilityLabel={`แหล่งของ ${chip.text}`}>
      <Text style={[styles.infoChip, { color: tone.fg, backgroundColor: tone.bg }]}>{chip.text}</Text>
      {chip.tone !== "none" && part.offDetail ? <Text style={styles.infoDetail}>{part.offDetail}</Text> : null}
      {by ? <Text style={styles.infoBy}>{by}</Text> : null}
    </View>
  );
}

/** ชื่อที่ใช้แสดงแทนรหัส — ของนอกสโตร์ไม่มีรหัส partCode เป็นแค่ชื่อพร้อมป้ายนำหน้า */
export const partTitle = (p: { offCatalog?: boolean; partCode: string; name: string }) => (p.offCatalog ? p.name : p.partCode);

const styles = StyleSheet.create({
  box: {
    gap: spacing.sm,
    marginTop: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.offPartLine,
    backgroundColor: colors.offPartSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  boxService: { borderColor: colors.serviceLine, backgroundColor: colors.serviceSoft },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.offPart },
  tag: {
    alignSelf: "flex-start",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "700",
    color: colors.offPart,
    backgroundColor: colors.offPartSoft,
    borderWidth: 1,
    borderColor: colors.offPartLine,
    borderRadius: 6,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  row: {
    gap: spacing.xs,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: 9,
    paddingVertical: 6,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.card,
  },
  inputEmpty: { borderColor: colors.offPartLine },
  inputMiss: { borderColor: colors.danger },
  name: { flex: 1, minWidth: 0 },
  unit: { width: 64 },
  askLine: { gap: 4 },
  askLabel: { fontSize: 12.5, lineHeight: 19, fontWeight: "700", color: colors.body },
  star: { color: colors.dangerInk },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  // แตะง่ายบนมือถือ (สูง ~36–40) — ชิปเล็กกว่านี้ช่างกดพลาดไปโดนชิปข้าง ๆ
  chip: {
    minHeight: 38,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  chipSmall: { minHeight: 34, paddingHorizontal: 11 },
  chipFound: { backgroundColor: colors.successFill, borderColor: colors.successFill },
  chipMissing: { backgroundColor: colors.dangerFill, borderColor: colors.dangerFill },
  chipKindOn: { backgroundColor: colors.navyFill, borderColor: colors.navyFill },
  chipMiss: { borderColor: colors.danger },
  chipText: { fontSize: 13.5, fontWeight: "600", color: colors.body },
  chipTextSmall: { fontSize: 13, fontWeight: "500" },
  chipTextOn: { color: "#fff" },
  answer: { gap: 6, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1 },
  answerFound: { backgroundColor: colors.successSoft, borderColor: colors.successLine },
  answerMissing: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerLine },
  answerMiss: { borderColor: colors.danger, borderWidth: 1.5 },
  exempt: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  add: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 2 },
  addText: { color: colors.offPart, fontWeight: "700", fontSize: 13 },
  warn: { fontSize: 12, color: colors.dangerInk },
  missBox: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  missText: { fontSize: 12.5, lineHeight: 19, color: colors.warningInk },
  hint: { fontSize: 11.5, lineHeight: 18, color: colors.textMuted },
  info: { gap: 2, alignItems: "flex-start" },
  infoChip: {
    fontSize: 11.5,
    lineHeight: 18,
    fontWeight: "700",
    paddingHorizontal: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  infoDetail: { fontSize: 12.5, lineHeight: 19, color: colors.body },
  infoBy: { fontSize: 11.5, lineHeight: 17, color: colors.textMuted },
});
