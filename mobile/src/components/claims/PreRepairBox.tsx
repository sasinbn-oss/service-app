/**
 * "ถ่ายก่อนซ่อม" — วิดีโอ Error (หรืออาการตอนเครื่องเดิน) + รูปอาการเสีย ก่อนลงมือซ่อม (เคลมก้อน 5 · เจ้าของงานตอบข้อ 2)
 *
 * ทำไมต้องถ่ายก่อน: ซ่อมเสร็จแล้วอาการไม่ขึ้นอีก ผู้ขายไม่รับเคลมที่ไม่มีภาพอาการ — เดิมช่างนึกได้ตอนกรอกฟอร์มปิดงาน
 * ซึ่งเครื่องหายแล้ว ถ่ายไม่ได้ · ถ่ายครั้งเดียวต่อเครื่อง ใช้ร่วมทุกชิ้นที่เคลม และนับเป็นรูปก่อนซ่อมของการปิดงานด้วย
 * (ไม่ต้องถ่ายซ้ำในขั้นงานที่ทำ) · ไม่บังคับ — ถ้ายังไม่ถ่าย ตอนปิดงานก็ยังแนบได้
 *
 * ส่งขึ้นใบงานทันทีที่เลือก โดยไม่บอกชิ้น (sparePartId ว่าง) — เซิร์ฟเวอร์รู้จากตรงนี้ว่าเป็นไฟล์ที่ถ่ายก่อนซ่อม
 * (ไฟล์ชนิดเดียวกันที่แนบในฟอร์มปิดงานผูกชิ้นเสมอ จึงไม่นับเป็นรูปก่อนซ่อม) — ไม่ต้องเพิ่มคอลัมน์บอกเวลาที่ถ่าย
 *
 * ขึ้นเฉพาะใบซ่อมที่กำลังทำ สาขาในประกัน และยังไม่ได้ส่งเคลมในรอบนี้ (ใบที่ถูกตีกลับแก้ในฟอร์มแก้เคลมแทน)
 * Oasis ไม่มีจอ Error — รู้จากยี่ห้อตั้งแต่ก่อนซ่อม ช่องวิดีโอจึงเป็น "วิดีโออาการตอนเครื่องเดิน" ตั้งแต่ในกล่องนี้
 */
import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../Tap";
import Spinner from "../Spinner";
import { useClaimUploads, type SlotUpload } from "./ClaimFileSlot";
import { apiErrorMessage } from "../../api/client";
import { showAlert } from "../../utils/alert";
import { attachmentIcon, pickImageAttachment, pickVideoAttachment, type PickedAttachment } from "../../utils/attachments";
import { colors, radius, spacing } from "../../theme";

const thaiDate = (iso: string) =>
  new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit" });

type PreRole = "CLAIM_ERROR_VIDEO" | "CLAIM_SYMPTOM";
type Getter = (stage: (s: string) => void) => Promise<PickedAttachment | null>;

/**
 * ช่องหนึ่งในกล่อง — คอมโพเนนต์ระดับไฟล์ ไม่ประกาศในตัวกล่อง: ประกาศข้างในทำให้ทุกครั้งที่กล่องวาดใหม่
 * (ทุกเปอร์เซ็นต์ของการส่ง) React เห็นเป็นคอมโพเนนต์ใหม่ ถอดแล้วใส่ใหม่ทั้งช่อง — รูปย่อกะพริบ
 * และปุ่มที่โฟกัสด้วยคีย์บอร์ด/โปรแกรมอ่านจอหลุดโฟกัสไปบนสุดของหน้า
 */
function PreSlot({
  role,
  title,
  hint,
  has,
  video,
  slot: s,
  preparing,
  onPick,
  onRetry,
}: {
  role: PreRole;
  title: string;
  hint: string;
  has: boolean;
  video: boolean;
  slot: SlotUpload | undefined;
  preparing: string | null;
  onPick: (role: PreRole, get: Getter) => void;
  onRetry: (role: PreRole) => void;
}) {
  return (
    <View style={styles.slot} accessibilityLabel={`ถ่ายก่อนซ่อม ${title}`}>
      <View style={styles.slotHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.slotTitle}>{title}</Text>
          <Text style={styles.small}>{hint}</Text>
        </View>
        {s ? (
          s.file.thumbnailUri ? (
            <Image source={{ uri: s.file.thumbnailUri }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.blank]}>
              <Ionicons name={attachmentIcon(s.file.kind)} size={20} color={colors.textFaint} />
            </View>
          )
        ) : null}
      </View>
      {s?.status === "uploading" ? (
        <View style={styles.row}>
          <Spinner color={colors.primary} size="small" />
          <Text style={styles.small}>กำลังส่ง {Math.round(s.progress * 100)}%</Text>
        </View>
      ) : s?.status === "failed" ? (
        <View style={styles.row}>
          <Text style={styles.bad}>ส่งไม่สำเร็จ{s.error ? ` — ${s.error}` : ""}</Text>
          <TouchableOpacity style={styles.btnMain} onPress={() => onRetry(role)} accessibilityLabel={`ลองส่ง${title}ใหม่`}>
            <Text style={styles.btnMainText}>ลองใหม่</Text>
          </TouchableOpacity>
        </View>
      ) : has ? (
        <Text style={styles.ok}>✓ แนบแล้ว</Text>
      ) : preparing ? (
        <Text style={styles.small}>{preparing}…</Text>
      ) : (
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.btnMain}
            onPress={() => onPick(role, (st) => (video ? pickVideoAttachment(st, true) : pickImageAttachment(true, st)))}
            accessibilityLabel={`${video ? "ถ่ายวิดีโอ" : "ถ่ายรูป"} ${title}`}
          >
            <Ionicons name={video ? "videocam" : "camera"} size={16} color="#fff" />
            <Text style={styles.btnMainText}>{video ? "ถ่ายวิดีโอ" : "ถ่ายรูป"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => onPick(role, (st) => (video ? pickVideoAttachment(st, false) : pickImageAttachment(false, st)))}
            accessibilityLabel={`${video ? "เลือกไฟล์" : "เลือกรูป"} ${title}`}
          >
            <Text style={styles.btnText}>{video ? "เลือกไฟล์" : "เลือกรูป"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function PreRepairBox({
  orderId,
  warrantyUntil,
  plateFamily,
  counts,
  open: openProp,
  onToggle,
  onChanged,
  readOnly,
}: {
  orderId: number;
  warrantyUntil: string;
  plateFamily: string | null | undefined;
  /** ไฟล์ที่ถ่ายไว้แล้วในกล่องนี้ของรอบนี้ (จากเซิร์ฟเวอร์) */
  counts: { video: number; photo: number };
  /** เปิดกล่องจากข้างนอก (เพิ่งกด "ถึงหน้างาน" และยังไม่ได้ถ่าย) — ไม่ส่ง = กล่องจัดการเอง */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  /** ไฟล์ขึ้นแล้ว — ให้หน้าที่ใช้โหลดตัวเลขใหม่ */
  onChanged: () => void;
  readOnly?: boolean;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (v: boolean) => (onToggle ? onToggle(v) : setOwnOpen(v));
  const [preparing, setPreparing] = useState<string | null>(null);
  const uploads = useClaimUploads(orderId, onChanged, (e) => showAlert("ส่งไม่สำเร็จ", apiErrorMessage(e)));
  const oasis = plateFamily === "OASIS";
  const videoLabel = oasis ? "วิดีโออาการตอนเครื่องเดิน" : "วิดีโอ Error code";
  const vSlot = uploads.slots["pre:CLAIM_ERROR_VIDEO"];
  const pSlot = uploads.slots["pre:CLAIM_SYMPTOM"];
  // ขึ้นเสร็จแล้วนับจากเซิร์ฟเวอร์ (โหลดใหม่หลังส่ง) — กำลังส่งนับด้วย ช่างเห็นว่ากดไปแล้ว
  const hasVideo = counts.video > 0 || (!!vSlot && vSlot.status !== "failed");
  const hasPhoto = counts.photo > 0 || (!!pSlot && pSlot.status !== "failed");
  const n = (hasVideo ? 1 : 0) + (hasPhoto ? 1 : 0);

  async function pick(role: PreRole, get: Getter) {
    if (readOnly) {
      showAlert("กำลังดูในฐานะผู้ใช้อื่น", "ดูได้อย่างเดียว แก้ไขไม่ได้");
      return;
    }
    setPreparing("กำลังเตรียมไฟล์");
    try {
      const f = await get(setPreparing);
      // ไม่บอกชิ้น = ถ่ายก่อนซ่อม (ดูหัวไฟล์)
      if (f) uploads.start(`pre:${role}`, f, role, null);
    } catch (e) {
      showAlert("เตรียมไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setPreparing(null);
    }
  }
  const retry = (role: PreRole) => {
    const sl = uploads.slots[`pre:${role}`];
    if (sl) uploads.start(`pre:${role}`, sl.file, role, null);
  };
  const slotProps = (role: PreRole) => ({ role, slot: uploads.slots[`pre:${role}`], preparing, onPick: pick, onRetry: retry });

  return (
    <View style={styles.box} accessibilityLabel="กล่องถ่ายก่อนซ่อม">
      <View style={styles.chip}>
        <Text style={styles.chipText}>ในประกันถึง {thaiDate(warrantyUntil)}</Text>
      </View>
      <Text style={styles.line}>ก่อนลงมือซ่อม: ถ่าย{oasis ? "วิดีโออาการตอนเครื่องเดิน" : "วิดีโอ Error"} + รูปอาการเสีย (ใช้เคลม)</Text>
      {!open ? (
        <View style={styles.row}>
          <Text style={[styles.status, { color: n === 2 ? colors.successInk : colors.roleSupervisor }]}>
            {n === 2 ? "✓ ถ่ายไว้แล้ว 2 ไฟล์" : n === 1 ? "ถ่ายไว้แล้ว 1 ไฟล์ · ไม่บังคับ" : "ยังไม่ได้ถ่าย · ไม่บังคับ"}
          </Text>
          <TouchableOpacity style={styles.openBtn} onPress={() => setOpen(true)} accessibilityState={{ expanded: false }} accessibilityLabel={n ? "ดูที่ถ่ายไว้" : "ถ่ายก่อนซ่อม"}>
            <Ionicons name="camera-outline" size={18} color="#fff" />
            <Text style={styles.openText}>{n ? "ดูที่ถ่ายไว้" : "ถ่ายก่อนซ่อม"}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.inner}>
          <View style={styles.row}>
            <Text style={[styles.title, { flex: 1 }]}>ถ่ายก่อนลงมือซ่อม (ใช้เคลม)</Text>
            <TouchableOpacity style={styles.btn} onPress={() => setOpen(false)} accessibilityState={{ expanded: true }} accessibilityLabel="ย่อ ถ่ายก่อนซ่อม">
              <Text style={styles.btnText}>ย่อ</Text>
            </TouchableOpacity>
          </View>
          <PreSlot
            {...slotProps("CLAIM_ERROR_VIDEO")}
            title={videoLabel}
            hint={oasis ? "ให้เห็นอาการเสียตอนเครื่องเดิน ชัด ๆ 5–10 วินาที" : "ให้เห็นหน้าจอขึ้นรหัส เช่น E dL ชัด ๆ 5–10 วินาที"}
            has={hasVideo}
            video
          />
          <PreSlot {...slotProps("CLAIM_SYMPTOM")} title="รูปอาการเสีย" hint="ให้เห็นจุดที่เสีย เช่น ประตู กลอน" has={hasPhoto} video={false} />
          <Text style={[styles.foot, { color: n === 2 ? colors.successInk : colors.textMuted }]}>
            {n === 2
              ? "✓ ถ่ายไว้แล้ว 2 ไฟล์ — ใช้เป็นรูปก่อนซ่อมด้วย ไม่ต้องถ่ายซ้ำ"
              : n === 1
                ? "ถ่ายไว้แล้ว 1 ไฟล์ · ไม่บังคับ"
                : "ไม่บังคับ — ถ้ายังไม่ถ่าย ตอนปิดงานก็ยังแนบได้"}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // ม่วงอ่อน = เรื่องเคลม/ประกัน (ตัวอย่างใช้สีม่วงกับกล่องนี้) แยกจากปุ่มหลักของการ์ด
  box: { gap: 6, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.roleSupervisorSoft, backgroundColor: colors.roleSupervisorSoft },
  chip: { alignSelf: "flex-start", backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 10 },
  chipText: { fontSize: 12.5, lineHeight: 22, fontWeight: "700", color: colors.roleSupervisor },
  line: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.text },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  status: { flex: 1, minWidth: 140, fontSize: 13.5, lineHeight: 20, fontWeight: "700" },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.roleSupervisor,
  },
  openText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  inner: { gap: spacing.sm },
  title: { fontSize: 15, lineHeight: 22, fontWeight: "800", color: colors.text },
  slot: { gap: 6, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  slotHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  slotTitle: { fontSize: 14.5, lineHeight: 21, fontWeight: "700", color: colors.text },
  small: { fontSize: 13, lineHeight: 19, color: colors.body },
  ok: { fontSize: 14, fontWeight: "700", color: colors.successInk },
  bad: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.dangerInk },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.rowAlt },
  blank: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  btnMain: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 48, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.roleSupervisor },
  btnMainText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  btn: {
    minHeight: 48,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.roleSupervisor,
    backgroundColor: colors.card,
  },
  btnText: { fontSize: 14, fontWeight: "700", color: colors.roleSupervisor },
  foot: { fontSize: 13, lineHeight: 19, fontWeight: "600" },
});
