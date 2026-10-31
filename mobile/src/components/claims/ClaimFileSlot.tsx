/**
 * ช่องไฟล์หลักฐานเคลมหนึ่งช่อง (รูปอะไหล่เก่า · รูปอาการเสีย · วิดีโอ Error code · วิดีโอการตรวจเช็ค ของอะไหล่หนึ่งชิ้น)
 * + useClaimUploads ที่ถือสถานะการส่งของทุกช่องในฟอร์มปิดงาน
 *
 * ส่งขึ้นเซิร์ฟเวอร์ทันทีที่เลือก ไม่รอกด "ยืนยันปิดงาน" (เคลมก้อน 1 · เจ้าของงานเลือกตัวอย่าง ต.ค. 69):
 * เดิมไฟล์รอในเครื่องจนกดส่ง วิดีโอสี่ห้าคลิปขึ้นพร้อมกันตอนท้าย เน็ตหน้าร้านหลุดกลางทางแล้วช่างไม่รู้ว่าไฟล์ไหนขึ้นแล้ว
 * แอปหลุดก่อนกดส่ง = ไฟล์หายหมด ต้องถ่ายใหม่ทั้งที่อะไหล่เก่าอาจทิ้งไปแล้ว
 * ตอนนี้แต่ละช่องบอกเองว่า "กำลังส่ง x%" / "✓ แนบแล้ว" / "ส่งไม่สำเร็จ — ลองใหม่" และไฟล์ที่ขึ้นแล้วอยู่ในใบงานถาวร
 */
import React, { useCallback, useRef, useState } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../Tap";
import Spinner from "../Spinner";
import FileDropZone from "../FileDropZone";
import { api, apiErrorMessage } from "../../api/client";
import { showAlert } from "../../utils/alert";
import {
  attachmentIcon,
  filesToAttachments,
  pickImageAttachment,
  pickVideoAttachment,
  uploadAttachment,
  type PickedAttachment,
} from "../../utils/attachments";
import { colors, radius, spacing } from "../../theme";

export interface SlotUpload {
  file: PickedAttachment;
  status: "uploading" | "done" | "failed";
  /** 0–1 */
  progress: number;
  attachmentId: number | null;
  error: string | null;
  /** ไฟล์ที่ถูกแทนลบไม่ได้ เพราะส่งไปกับใบเคลมรอบก่อนแล้ว (409) — บอกให้รู้ ไม่ใช่เงียบ */
  keptOld?: boolean;
}

export const slotKey = (sparePartId: number, role: string) => `${sparePartId}:${role}`;

/**
 * สถานะการส่งของทุกช่องเคลมในฟอร์มปิดงานหนึ่งรอบ
 *
 * ลบไฟล์ได้เฉพาะ id ที่ส่งขึ้นในฟอร์มรอบนี้ (เลือกใหม่แทน · ปิดเคลมชิ้นนั้น) — ไฟล์ที่ขึ้นก่อนหน้านั้นอาจเป็น
 * หลักฐานของใบเคลมที่ส่งไปแล้ว ลบทิ้งแล้วผู้ตรวจย้อนดูรอบเก่าไม่ได้ (เซิร์ฟเวอร์ก็กันไว้อีกชั้น — 409)
 * ไฟล์ที่เลือกใหม่ระหว่างไฟล์เดิมยังส่งไม่จบ: ไฟล์เดิมขึ้นเสร็จเมื่อไหร่ลบทิ้งทันที ไม่ปล่อยให้ค้างนับเข้าเพดานไฟล์
 */
export function useClaimUploads(
  orderId: number,
  /**
   * ไฟล์ในใบงานเปลี่ยน (ขึ้นเสร็จ · ลบแล้ว) — ให้ฟอร์มโหลดใบงาน/รายการไฟล์ใหม่
   * ลบแล้วต้องโหลดด้วย ไม่ใช่แค่ตอนขึ้น: ปิดเคลมแล้วเปิดกลับ ช่องอ่านหลักฐานจากใบงานที่โหลดไว้ ถ้ายังเป็นชุดเก่า
   * จะขึ้น "แนบไว้แล้ว ✓" ของไฟล์ที่เพิ่งลบ ช่างกดส่งแล้วเซิร์ฟเวอร์ตอบว่ายังขาด — สวนกับเครื่องหมายบนจอ
   */
  onChanged: () => void,
  /** ส่งไม่สำเร็จ — ให้ฟอร์มดูว่าเป็นเพราะใบถูกส่งปิดไปแล้วหรือไม่ (เน็ตหลุดตอนรอคำตอบปิดงาน แล้วเลือกไฟล์ใหม่) */
  onFailed?: (e: unknown) => void
) {
  const [slots, setSlots] = useState<Record<string, SlotUpload>>({});
  /** id ที่ลบไปแล้วในฟอร์มรอบนี้ — ช่องอ่านหลักฐานจากใบงานข้ามตัวพวกนี้ระหว่างรอใบงานที่โหลดใหม่ (ดู onChanged) */
  const [removed, setRemoved] = useState<ReadonlySet<number>>(() => new Set());
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  /** ไฟล์ล่าสุดของแต่ละช่อง — อ่านทันทีหลัง await ไม่ต้องรอหน้าจอวาดใหม่ */
  const current = useRef(new Map<string, PickedAttachment>());
  const sessionIds = useRef(new Set<number>());
  const inflight = useRef(new Map<string, Promise<void>>());
  const latest = useRef({ onChanged, onFailed });
  latest.current = { onChanged, onFailed };

  const patch = useCallback((key: string, file: PickedAttachment, p: Partial<SlotUpload>) => {
    // ช่องที่เลือกไฟล์ใหม่ไปแล้ว — ผลของไฟล์เก่าห้ามมาทับสถานะของไฟล์ใหม่
    setSlots((s) => (s[key]?.file === file ? { ...s, [key]: { ...s[key], ...p } } : s));
  }, []);

  /** ลบไฟล์ที่ขึ้นในฟอร์มรอบนี้ · refresh=false เมื่อคนเรียกลบหลายไฟล์แล้วโหลดใหม่ครั้งเดียวเอง */
  const remove = useCallback(
    async (attachmentId: number, key?: string, refresh = true) => {
      try {
        await api.delete(`/work-orders/${orderId}/attachments/${attachmentId}`, { loadingText: false });
        sessionIds.current.delete(attachmentId);
        setRemoved((r) => new Set(r).add(attachmentId));
        if (refresh) latest.current.onChanged();
      } catch (e) {
        // 409 = ไฟล์นี้ไปกับใบเคลมที่ส่งแล้ว เก็บไว้เป็นหลักฐานรอบนั้น · อย่างอื่น (เน็ตหลุด) ปล่อยไว้ ช่างลบเองได้ในการ์ดไฟล์แนบ
        const status = (e as { response?: { status?: number } }).response?.status;
        if (status === 409 && key) setSlots((s) => (s[key] ? { ...s, [key]: { ...s[key], keptOld: true } } : s));
      }
    },
    [orderId]
  );

  const start = useCallback(
    (key: string, file: PickedAttachment, role: string, sparePartId: number) => {
      // ไฟล์ที่ขึ้นแล้วในฟอร์มรอบนี้ถูกแทน — ลบทิ้ง (ยังไม่เป็นหลักฐานของใบเคลมไหน)
      // ทำนอกตัวอัปเดต state: ตัวอัปเดตถูกเรียกซ้ำได้ (StrictMode) แล้วจะยิงลบสองครั้ง
      const old = slotsRef.current[key];
      if (old && old.file !== file && old.attachmentId && sessionIds.current.has(old.attachmentId)) void remove(old.attachmentId, key);
      current.current.set(key, file);
      setSlots((s) => ({ ...s, [key]: { file, status: "uploading", progress: 0, attachmentId: null, error: null } }));
      // วาดใหม่เฉพาะตอนเปอร์เซ็นต์เปลี่ยน — เบราว์เซอร์ส่งความคืบหน้าถี่มาก ฟอร์มปิดงานยาวทั้งฟอร์มวาดใหม่ทุกครั้งจะหน่วงช่องพิมพ์
      let shown = -1;
      const job = (async () => {
        try {
          const row = await uploadAttachment(orderId, file, role, sparePartId, undefined, {
            quiet: true,
            onProgress: (p) => {
              const pct = Math.round(p * 100);
              if (pct === shown) return;
              shown = pct;
              patch(key, file, { progress: p });
            },
          });
          sessionIds.current.add(row.id);
          if (current.current.get(key) !== file) {
            // เลือกไฟล์ใหม่ (หรือปิดเคลมชิ้นนี้) ระหว่างที่ไฟล์นี้กำลังส่ง
            await remove(row.id);
            return;
          }
          patch(key, file, { status: "done", progress: 1, attachmentId: row.id });
          latest.current.onChanged();
        } catch (e) {
          patch(key, file, { status: "failed", error: apiErrorMessage(e) });
          latest.current.onFailed?.(e);
        }
      })();
      inflight.current.set(key, job);
      void job.finally(() => {
        if (inflight.current.get(key) === job) inflight.current.delete(key);
      });
    },
    [orderId, patch, remove]
  );

  /** ปิดเคลมชิ้นนี้ — ไฟล์ที่ขึ้นในฟอร์มรอบนี้ไม่ได้เป็นหลักฐานของใบไหน ลบออก ไม่ให้ค้างนับเข้าเพดานไฟล์ */
  const discardPart = useCallback(
    (sparePartId: number) => {
      const mine = Object.entries(slotsRef.current).filter(([key]) => key.startsWith(`${sparePartId}:`));
      if (!mine.length) return;
      const removing: Promise<void>[] = [];
      for (const [key, slot] of mine) {
        current.current.delete(key);
        if (slot.attachmentId && sessionIds.current.has(slot.attachmentId)) removing.push(remove(slot.attachmentId, undefined, false));
      }
      // ลบครบทุกช่องของชิ้นนี้แล้วโหลดใบงานใหม่ครั้งเดียว (สี่ไฟล์ไม่ต้องโหลดสี่รอบ)
      if (removing.length) void Promise.all(removing).then(() => latest.current.onChanged());
      setSlots((s) => {
        const next = { ...s };
        for (const [key] of mine) delete next[key];
        return next;
      });
    },
    [remove]
  );

  /** รอไฟล์ที่ยังส่งไม่จบ — กดปิดงานระหว่างไฟล์กำลังขึ้น ต้องรอ ไม่ใช่ส่งซ้ำหรือปิดโดยไม่มีไฟล์ */
  const waitAll = useCallback(async () => {
    while (inflight.current.size) await Promise.allSettled([...inflight.current.values()]);
  }, []);

  /** ปิดงานสำเร็จ — ไฟล์ทั้งหมดเป็นหลักฐานของใบเคลมแล้ว ฟอร์มรอบหน้าเริ่มนับใหม่ */
  const reset = useCallback(() => {
    current.current.clear();
    sessionIds.current.clear();
    setSlots({});
    setRemoved(new Set());
  }, []);

  const uploading = Object.values(slots).filter((s) => s.status === "uploading");
  const progress = uploading.length ? uploading.reduce((n, s) => n + s.progress, 0) / uploading.length : 1;
  return { slots, removed, start, discardPart, waitAll, reset, uploading: uploading.length, progress };
}

export default function ClaimFileSlot({
  label,
  video,
  partCode,
  upload,
  existing,
  readOnly,
  onPick,
  onRetry,
}: {
  label: string;
  video: boolean;
  /** ต่อท้ายชื่อปุ่มสำหรับโปรแกรมอ่านจอ/เทสต์ — ใบที่เคลมสองชิ้นมีช่องชื่อเดียวกันสองชุด */
  partCode: string;
  upload?: SlotUpload;
  /** ไฟล์ของรอบนี้ที่อยู่ในใบงานแล้ว (แนบไว้ก่อนเปิดฟอร์มรอบนี้ / ถูกตีกลับแล้วยังนับ) */
  existing?: { thumb: string | null; kind: string } | null;
  /** ดูในฐานะคนอื่น — เซิร์ฟเวอร์ไม่รับอยู่แล้ว บอกตั้งแต่กดเลือก ไม่ให้รอส่งจนจบแล้วค่อยเจอ 403 */
  readOnly?: boolean;
  onPick: (file: PickedAttachment) => void;
  onRetry: () => void;
}) {
  const [preparing, setPreparing] = useState<string | null>(null);

  async function pick(get: (stage: (s: string) => void) => Promise<PickedAttachment | null>) {
    if (readOnly) {
      showAlert("กำลังดูในฐานะผู้ใช้อื่น", "ดูได้อย่างเดียว แก้ไขไม่ได้");
      return;
    }
    setPreparing("กำลังเตรียมไฟล์");
    try {
      const file = await get(setPreparing);
      if (file) onPick(file);
    } catch (e) {
      showAlert("เตรียมไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setPreparing(null);
    }
  }
  const drop = (files: File[]) =>
    pick(async (stage) => (await filesToAttachments(files.slice(0, 1), video ? { video: true } : { image: true }, stage))[0] ?? null);

  const status = upload?.status;
  const thumb = upload ? upload.file.thumbnailUri : existing?.thumb ?? null;
  const kind = upload ? upload.file.kind : existing?.kind ?? (video ? "VIDEO" : "IMAGE");
  const has = status === "done" || (!upload && !!existing);
  const icon =
    status === "failed" ? (
      <Ionicons name="alert-circle" size={20} color={colors.danger} />
    ) : status === "uploading" ? (
      <Spinner color={colors.primary} size="small" />
    ) : (
      <Ionicons name={has ? "checkmark-circle" : "ellipse-outline"} size={20} color={has ? colors.success : colors.textFaint} />
    );
  const again = has || status === "failed";

  return (
    <FileDropZone
      style={styles.slot}
      hint={video ? "วิดีโอ 1 คลิป" : "รูป 1 รูป"}
      disabled={!!preparing || status === "uploading"}
      label={`วาง${label} ${partCode}`}
      onFiles={drop}
    >
      <View style={styles.row}>
        {icon}
        <View style={styles.text}>
          {/* "— แนบไว้แล้ว" = ไฟล์ที่อยู่ในใบงานก่อนเปิดฟอร์ม (เช่น ถูกตีกลับแล้วไฟล์อื่นยังนับ) ไม่ต้องแนบซ้ำ */}
          <Text style={styles.label}>
            {label}
            {!upload && existing ? " — แนบไว้แล้ว" : ""}
          </Text>
          {preparing ? <Text style={styles.sub}>{preparing}…</Text> : null}
          {status === "uploading" ? <Text style={styles.sub}>กำลังส่ง {Math.round((upload?.progress ?? 0) * 100)}%</Text> : null}
          {status === "done" ? <Text style={styles.ok}>✓ แนบแล้ว</Text> : null}
          {status === "failed" ? (
            <Text style={styles.bad} accessibilityRole="alert">
              ส่งไม่สำเร็จ{upload?.error ? ` — ${upload.error}` : ""}
            </Text>
          ) : null}
          {upload?.keptOld ? <Text style={styles.note}>ไฟล์เดิมเก็บเป็นหลักฐานรอบก่อน</Text> : null}
        </View>
        {upload || existing ? (
          thumb ? (
            <Image source={{ uri: thumb }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.blank]}>
              <Ionicons name={attachmentIcon(kind)} size={20} color={colors.textFaint} />
            </View>
          )
        ) : null}
      </View>
      {status === "uploading" ? (
        <View style={styles.track} accessibilityLabel={`กำลังส่ง${label} ${partCode}`}>
          <View style={[styles.fill, { width: `${Math.max(4, Math.round((upload?.progress ?? 0) * 100))}%` }]} />
        </View>
      ) : null}
      {preparing || status === "uploading" ? null : (
        <View style={styles.actions}>
          {status === "failed" ? (
            <TouchableOpacity style={[styles.btn, styles.btnMain]} onPress={onRetry} accessibilityLabel={`ลองส่ง${label}ใหม่ ${partCode}`}>
              <Text style={styles.btnMainText}>ลองใหม่</Text>
            </TouchableOpacity>
          ) : null}
          {video ? (
            <TouchableOpacity
              style={styles.btn}
              onPress={() => pick((stage) => pickVideoAttachment(stage))}
              accessibilityLabel={`แนบ${label} ${partCode}`}
            >
              <Text style={styles.btnText}>{again ? "แนบใหม่" : "เลือกวิดีโอ"}</Text>
            </TouchableOpacity>
          ) : (
            <>
              {Platform.OS !== "web" ? (
                <TouchableOpacity
                  style={styles.btn}
                  onPress={() => pick((stage) => pickImageAttachment(true, stage))}
                  accessibilityLabel={`ถ่าย${label} ${partCode}`}
                >
                  <Text style={styles.btnText}>ถ่าย</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.btn}
                onPress={() => pick((stage) => pickImageAttachment(false, stage))}
                accessibilityLabel={`แนบ${label} ${partCode}`}
              >
                <Text style={styles.btnText}>{again ? "แนบใหม่" : "เลือกรูป"}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </FileDropZone>
  );
}

const styles = StyleSheet.create({
  slot: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    gap: spacing.xs,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  text: { flex: 1, minWidth: 0, gap: 2 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.text },
  sub: { fontSize: 13, lineHeight: 19, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  ok: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.successInk },
  bad: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.dangerInk },
  note: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.rowAlt },
  blank: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.rowAlt, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  btn: {
    minHeight: 48,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.navyFill,
    backgroundColor: colors.card,
  },
  btnText: { fontSize: 14, fontWeight: "700", color: colors.primaryInk },
  btnMain: { backgroundColor: colors.navyFill },
  btnMainText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
