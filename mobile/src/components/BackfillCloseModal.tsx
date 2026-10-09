/**
 * ปิดงานย้อนหลัง (แอดมิน) — งานที่ช่างซ่อมเสร็จจริงไปแล้ว แต่ในระบบค้างกลางทาง
 *
 * ฟอร์มเดียวไล่ทุกขั้นที่เหลือตามลำดับจริง ขั้นที่ทำแล้วโชว์ไว้เฉย ๆ ขั้นที่ไม่เกี่ยวกับใบนี้ไม่ขึ้น
 * กฎฝั่งเซิร์ฟเวอร์อยู่ที่ POST /work-orders/:id/backfill-close — หน้าจอเลือกขั้นที่จะถามด้วยกฎเดียวกัน
 * รูปไม่บังคับ (เจ้าของระบบกำหนด) แต่ไม่มีรูปหน้างานต้องบอกเหตุผล
 */
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import AppModal from "./AppModal";
import Dropdown from "./Dropdown";
import DateField, { todayBkk } from "./DateField";
import TimeField from "./TimeField";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { colors, radius, spacing } from "../theme";

const ORDER = [
  "NEW", "INSPECTING", "AWAITING_QUOTE", "AWAITING_PAYMENT", "WAITING_PARTS", "PARTS_REQUESTED",
  "PARTS_CHECKED", "ASSIGNED", "AWAITING_CONFIRM", "IN_PROGRESS", "DONE",
];
const REASONS = [
  "ช่างซ่อมเสร็จแล้วแต่ไม่ได้กดในแอป",
  "งานเก่าก่อนใช้ระบบ",
  "ทำผ่านช่องทางอื่น (โทร/ไลน์)",
  "อื่น ๆ",
];
const VIOLET = "#6D4AD1";

interface Part {
  sparePartId: number;
  quantity: number;
  partCode?: string | null;
  name?: string | null;
}
export interface BackfillOrder {
  id: number;
  code: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  assignedTeam: string | null;
  suggestedTeam?: string | null;
  needsQuote: boolean;
  waitingParts: Part[];
  parts: Part[];
  siteFileCount: number;
}

export default function BackfillCloseModal({
  order,
  teams,
  technicians,
  results,
  onClose,
  onDone,
}: {
  order: BackfillOrder;
  teams: string[];
  technicians: { id: number; name: string; employeeCode: string; team?: string | null }[];
  results: { value: string; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const at = ORDER.indexOf(order.status);
  const before = (s: string) => at <= ORDER.indexOf(s);
  // อะไหล่ที่รู้อยู่แล้วในใบนี้ — ส่วนใหญ่คือของที่ใช้จริง แอดมินเอาออกได้ถ้าไม่ได้ใช้
  const knownParts = useMemo(() => {
    const m = new Map<number, Part>();
    for (const p of [...order.waitingParts, ...order.parts]) if (!m.has(p.sparePartId)) m.set(p.sparePartId, p);
    return [...m.values()];
  }, [order]);

  const [reason, setReason] = useState(REASONS[0]);
  const [reasonNote, setReasonNote] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [useParts, setUseParts] = useState(knownParts.length > 0);
  const [reqAt, setReqAt] = useState("");
  const [reqRef, setReqRef] = useState("");
  const [team, setTeam] = useState<string | null>(order.assignedTeam ?? order.suggestedTeam ?? null);
  const [visitDate, setVisitDate] = useState(todayBkk());
  const [visitTime, setVisitTime] = useState("");
  const [result, setResult] = useState(results[0]?.value ?? "FIXED");
  const [doneDate, setDoneDate] = useState(todayBkk());
  const [doneTime, setDoneTime] = useState("");
  const [workerIds, setWorkerIds] = useState<number[]>([]);
  const [otherWorkers, setOtherWorkers] = useState("");
  const [note, setNote] = useState("");
  const [noPhoto, setNoPhoto] = useState("");
  const [busy, setBusy] = useState(false);

  const askPayment = order.needsQuote && before("AWAITING_PAYMENT");
  const askRequisition = useParts && knownParts.length > 0 && before("PARTS_REQUESTED");
  const missing = [
    !team && "ทีมที่ไป",
    !visitDate && "วันเข้างาน",
    !doneDate && "วันซ่อมเสร็จ",
    !doneTime && "เวลาซ่อมเสร็จ",
    workerIds.length === 0 && !otherWorkers.trim() && "ผู้เข้าปฏิบัติงาน",
    order.siteFileCount === 0 && !noPhoto.trim() && "เหตุผลที่ไม่มีรูป",
  ].filter(Boolean) as string[];

  async function save() {
    setBusy(true);
    try {
      await api.post(
        `/work-orders/${order.id}/backfill-close`,
        {
          reason,
          reasonNote: reasonNote.trim() || undefined,
          paidAt: askPayment && paidAt ? paidAt : undefined,
          paymentRef: askPayment && paymentRef.trim() ? paymentRef.trim() : undefined,
          requisitionAt: askRequisition && reqAt ? reqAt : undefined,
          requisitionRef: askRequisition && reqRef.trim() ? reqRef.trim() : undefined,
          team,
          visitDate,
          visitTime: visitTime || null,
          result,
          closedAt: new Date(`${doneDate}T${doneTime}:00+07:00`).toISOString(),
          parts: useParts ? knownParts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })) : [],
          workerIds,
          otherWorkers: otherWorkers.trim() || null,
          note: note.trim() || undefined,
          noPhotoReason: order.siteFileCount === 0 ? noPhoto.trim() : undefined,
        },
        { loadingText: "กำลังปิดงานย้อนหลัง..." }
      );
      showAlert(`ปิด ${order.code} แล้ว`, "ทุกขั้นบันทึกตามวันเวลาจริงของงาน และติดป้ายว่าแอดมินกรอกย้อนหลัง");
      onDone();
    } catch (e) {
      showAlert("ปิดงานไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppModal
      visible
      onClose={onClose}
      busy={busy}
      width={620}
      title={`ปิดงานย้อนหลัง ${order.code}`}
      footer={
        <View style={styles.actions}>
          {missing.length ? <Text style={styles.missing}>ยังขาด: {missing.join(" · ")}</Text> : null}
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={onClose} disabled={busy}>
            <Text style={styles.ghostText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, missing.length > 0 && { opacity: 0.5 }]}
            onPress={save}
            disabled={missing.length > 0 || busy}
            accessibilityLabel="บันทึกทุกขั้นและปิดงาน"
          >
            <Text style={styles.btnText}>บันทึกทุกขั้นและปิดงาน</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <Text style={styles.muted}>
        ตอนนี้ค้างอยู่ขั้น "{order.statusLabel}" · กรอกเฉพาะขั้นที่เหลือ ขั้นที่ทำแล้วไม่ถูกแตะ · วันเวลาให้ใส่ตามที่เกิดขึ้นจริง
      </Text>

      <View style={styles.why}>
        <Text style={styles.h}>ทำไมต้องปิดย้อนหลัง</Text>
        <View style={styles.row}>
          {REASONS.map((r) => (
            <TouchableOpacity key={r} style={[styles.chip, reason === r && styles.chipOn]} onPress={() => setReason(r)} accessibilityLabel={`เหตุผล ${r}`}>
              <Text style={[styles.chipText, reason === r && { color: "#fff" }]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={styles.input} value={reasonNote} onChangeText={setReasonNote} placeholder="รายละเอียดเพิ่ม (ไม่บังคับ)" placeholderTextColor={colors.textFaint} accessibilityLabel="รายละเอียดเหตุผล" />
      </View>

      {askPayment ? (
        <Step title="ลูกค้าจ่ายเงิน" hint="งานแฟรนไชส์ที่ต้องเสนอราคา — ไม่รู้วันที่ก็เว้นได้">
          <DateField value={paidAt} onChange={setPaidAt} label="วันที่ลูกค้าจ่าย" labelStyle={styles.label} />
          <TextInput style={styles.input} value={paymentRef} onChangeText={setPaymentRef} placeholder="เลขที่ใบเสร็จ / หลักฐาน" placeholderTextColor={colors.textFaint} accessibilityLabel="เลขที่ใบเสร็จ" />
        </Step>
      ) : null}

      <Step title="อะไหล่ที่ใช้">
        {knownParts.length ? (
          <>
            <View style={styles.row}>
              <TouchableOpacity style={[styles.chip, useParts && styles.chipOn]} onPress={() => setUseParts(true)} accessibilityLabel="ใช้อะไหล่ตามรายการ">
                <Text style={[styles.chipText, useParts && { color: "#fff" }]}>ใช้ตามรายการ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.chip, !useParts && styles.chipOn]} onPress={() => setUseParts(false)} accessibilityLabel="ไม่ได้ใช้อะไหล่">
                <Text style={[styles.chipText, !useParts && { color: "#fff" }]}>ไม่ได้ใช้อะไหล่</Text>
              </TouchableOpacity>
            </View>
            {useParts ? (
              <Text style={styles.muted}>
                {knownParts.map((p) => `${p.name ?? p.partCode ?? "อะไหล่"} × ${p.quantity}`).join(" · ")}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.muted}>ใบนี้ไม่มีรายการอะไหล่ — ปิดแบบไม่ใช้อะไหล่ (ใช้อะไหล่จริงให้ระบุอะไหล่ในใบงานก่อน)</Text>
        )}
        {askRequisition ? (
          <>
            <DateField value={reqAt} onChange={setReqAt} label="วันที่เบิก (ไม่รู้เว้นได้)" labelStyle={styles.label} />
            <TextInput style={styles.input} value={reqRef} onChangeText={setReqRef} placeholder="เลขใบเบิก (ไม่บังคับ)" placeholderTextColor={colors.textFaint} accessibilityLabel="เลขใบเบิก" />
          </>
        ) : null}
      </Step>

      <Step title="ทีมและวันเข้างานจริง" hint={before("AWAITING_CONFIRM") ? "ข้ามขั้นนัดลูกค้า/คอนเฟิร์ม — ใส่วันที่ช่างเข้าไปจริงแทน" : undefined}>
        <Text style={styles.label}>ทีมที่ไป</Text>
        <Dropdown value={team} onChange={setTeam} placeholder="เลือกทีม" accessibilityLabel="ทีมที่ไป" options={teams.map((t) => ({ value: t, label: t }))} />
        <View style={styles.two}>
          <View style={{ flexGrow: 1.4, flexBasis: 200 }}>
            <DateField value={visitDate} onChange={setVisitDate} label="วันเข้างาน" required labelStyle={styles.label} />
          </View>
          <View style={{ flexGrow: 1, flexBasis: 150 }}>
            <TimeField value={visitTime} onChange={setVisitTime} label="เวลาเข้า (ไม่รู้เว้นได้)" labelStyle={styles.label} />
          </View>
        </View>
      </Step>

      <Step title="ปิดงาน">
        <Text style={styles.label}>ผลงาน</Text>
        <View style={styles.row}>
          {results.map((r) => (
            <TouchableOpacity key={r.value} style={[styles.chip, result === r.value && styles.chipOn]} onPress={() => setResult(r.value)} accessibilityLabel={`ผลงาน ${r.label}`}>
              <Text style={[styles.chipText, result === r.value && { color: "#fff" }]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.two}>
          <View style={{ flexGrow: 1.4, flexBasis: 200 }}>
            <DateField value={doneDate} onChange={setDoneDate} label="ซ่อมเสร็จวันที่" required labelStyle={styles.label} />
          </View>
          <View style={{ flexGrow: 1, flexBasis: 150 }}>
            <TimeField value={doneTime} onChange={setDoneTime} label="เวลาซ่อมเสร็จ" labelStyle={styles.label} />
          </View>
        </View>
        <Text style={styles.label}>ผู้เข้าปฏิบัติงาน</Text>
        {[0, 1, 2].map((slot) => (
          <Dropdown
            key={slot}
            value={workerIds[slot] != null ? String(workerIds[slot]) : null}
            clearable={slot > 0 || workerIds.length > 1}
            placeholder={slot === 0 ? "เลือกช่าง" : "ไม่มี"}
            accessibilityLabel={`ผู้เข้าปฏิบัติงานคนที่ ${slot + 1}`}
            onChange={(next) =>
              setWorkerIds((cur) => {
                const copy = [...cur];
                if (next === null) copy.splice(slot, 1);
                else copy[slot] = Number(next);
                return copy.filter((x) => x != null);
              })
            }
            options={technicians
              .filter((t) => !workerIds.includes(t.id) || workerIds[slot] === t.id)
              .map((t) => ({ value: String(t.id), label: t.name, hint: `${t.employeeCode}${t.team ? ` · ${t.team}` : ""}` }))}
          />
        ))}
        <TextInput style={styles.input} value={otherWorkers} onChangeText={setOtherWorkers} placeholder="คนอื่นที่ไปด้วยแต่ไม่มีบัญชีในระบบ (ไม่บังคับ)" placeholderTextColor={colors.textFaint} accessibilityLabel="คนอื่นที่ไปด้วย" />
        <TextInput style={[styles.input, { minHeight: 60 }]} value={note} onChangeText={setNote} multiline placeholder="สรุปงาน เช่น เปลี่ยนบอร์ด ทดสอบซัก 1 รอบ ปกติ" placeholderTextColor={colors.textFaint} accessibilityLabel="สรุปงาน" />
        {order.siteFileCount > 0 ? (
          <Text style={styles.muted}>
            <Ionicons name="images-outline" size={13} color={colors.textMuted} /> มีรูปหน้างานแล้ว {order.siteFileCount} ไฟล์
          </Text>
        ) : (
          <View style={styles.photo}>
            <Text style={styles.photoText}>
              ยังไม่มีรูปหน้างาน — แนบได้ที่ส่วนรูปของใบงานก่อนกดบันทึก หรือใส่เหตุผลที่ไม่มีรูป (บันทึกไว้ในประวัติ)
            </Text>
            <TextInput style={styles.input} value={noPhoto} onChangeText={setNoPhoto} placeholder="เหตุผลที่ไม่มีรูป เช่น ช่างไม่ได้ถ่ายไว้" placeholderTextColor={colors.textFaint} accessibilityLabel="เหตุผลที่ไม่มีรูป" />
          </View>
        )}
      </Step>
    </AppModal>
  );
}

function Step({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.step}>
      <Text style={styles.h}>{title}</Text>
      {hint ? <Text style={styles.muted}>{hint}</Text> : null}
      {children}
    </View>
  );
}

/** ปุ่มเปิดฟอร์ม — แอดมินเท่านั้น ใบงานที่ยังไม่ปิด (ผู้เรียกเช็คเอง) */
export function BackfillButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.open} onPress={onPress} accessibilityLabel="ปิดงานย้อนหลัง" activeOpacity={0.8}>
      <Ionicons name="checkmark-done" size={16} color="#fff" />
      <Text style={styles.openText}>ปิดงานย้อนหลัง</Text>
      <Text style={styles.openHint}>งานซ่อมเสร็จจริงแล้ว แต่ในระบบยังค้าง</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
  h: { fontSize: 14.5, fontWeight: "700", color: colors.text },
  label: { fontSize: 13, fontWeight: "600", color: colors.text },
  why: { backgroundColor: "#EEE9FB", borderRadius: radius.md, padding: spacing.md, gap: 8 },
  step: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  two: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: colors.card },
  chipOn: { backgroundColor: VIOLET, borderColor: VIOLET },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: colors.text, backgroundColor: colors.card },
  photo: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.sm, gap: 6 },
  photoText: { fontSize: 12.5, lineHeight: 19, color: colors.warningInk },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  missing: { fontSize: 12.5, color: colors.warningInk, flexShrink: 1 },
  btn: { borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: VIOLET },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  ghost: { backgroundColor: colors.sky50, borderWidth: 1, borderColor: colors.border },
  ghostText: { color: colors.navy, fontWeight: "700", fontSize: 14 },
  open: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, backgroundColor: VIOLET, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  openText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  openHint: { color: "rgba(255,255,255,0.85)", fontSize: 12.5 },
});
