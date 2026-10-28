/**
 * ช่องรูปรอบคัน (หน้า/หลัง/ซ้าย/ขวา/หน้าปัดไมล์ + รูปเพิ่มเติม) แบบ OTTERI FLEET
 *
 * แตะช่อง → ถ่ายรูปหรือเลือกจากอัลบั้ม → รูปถูกย่อแล้วอัปทันทีเบื้องหลัง
 * ช่างถ่ายช่องถัดไปได้เลยไม่ต้องรอ อัปไม่ผ่านช่องเป็นสีแดง แตะเพื่อลองใหม่
 *
 * ผู้ใช้ได้ id ของรูปที่อัปเสร็จผ่าน onChange — ตอนกดยืนยันส่งแค่ id
 */
import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import TouchableOpacity from "./Tap";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api } from "../api/client";
import { PickedAttachment, asList, filesToAttachments, pickImageAttachment, pickImageAttachments } from "../utils/attachments";
import FileDropZone from "./FileDropZone";
import { showAlert } from "../utils/alert";
import { uploadVehiclePhoto } from "../utils/vehicles";
import { WasherIcon } from "./Spinner";
import { colors, radius, spacing } from "../theme";

interface Slot {
  key: number;
  label: string;
  file: PickedAttachment | null;
  status: "empty" | "uploading" | "done" | "error";
  id: number | null;
}

export interface PhotoState {
  ids: number[];
  count: number;
  uploading: number;
  failed: number;
}

export interface VehiclePhotoSlotsHandle {
  /** ทิ้งรูปที่อัปไว้ทั้งหมด (กดยกเลิก/เลือกรถคันอื่น) — ลบออกจากที่เก็บด้วย */
  discardAll: () => void;
}

let seq = 1;

export default forwardRef<
  VehiclePhotoSlotsHandle,
  {
    phase: "START" | "END";
    min: number;
    max: number;
    labels: string[];
    onChange: (s: PhotoState) => void;
  }
>(function VehiclePhotoSlots({ phase, min, max, labels, onChange }, ref) {
  const [slots, setSlots] = useState<Slot[]>(() =>
    labels.slice(0, Math.max(min, labels.length)).map((label) => ({ key: seq++, label, file: null, status: "empty", id: null }))
  );
  const latest = useRef(slots);
  latest.current = slots;

  function commit(next: Slot[]) {
    latest.current = next;
    setSlots(next);
    onChange({
      ids: next.filter((s) => s.status === "done" && s.id !== null).map((s) => s.id!),
      count: next.filter((s) => s.file).length,
      uploading: next.filter((s) => s.status === "uploading").length,
      failed: next.filter((s) => s.status === "error").length,
    });
  }
  function patch(key: number, p: Partial<Slot>) {
    commit(latest.current.map((s) => (s.key === key ? { ...s, ...p } : s)));
  }

  useImperativeHandle(ref, () => ({
    discardAll() {
      for (const s of latest.current) if (s.id) discard(s.id);
      commit(latest.current.map((s) => ({ ...s, file: null, status: "empty", id: null })));
    },
  }));

  function discard(id: number) {
    api.delete(`/vehicle-logs/photos/${id}`, { loadingText: false }).catch(() => {});
  }

  async function upload(key: number, file: PickedAttachment) {
    patch(key, { file, status: "uploading", id: null });
    try {
      const r = await uploadVehiclePhoto(file, phase);
      // ถูกลบ/แทนที่ระหว่างอัป — ทิ้งรูปที่เพิ่งขึ้นไป
      const now = latest.current.find((s) => s.key === key);
      if (!now || now.file !== file) return discard(r.id);
      patch(key, { status: "done", id: r.id });
    } catch {
      const now = latest.current.find((s) => s.key === key);
      if (now && now.file === file) patch(key, { status: "error" });
    }
  }

  /**
   * ใส่รูปลงช่อง — เลือก/ลากมาหลายรูปพร้อมกันได้ (เจ้าของงานขอ ต.ค. 69)
   * key = ช่องที่แตะ: รูปแรกลงช่องนั้น ที่เหลือลงช่องว่างถัดไปตามลำดับ
   * "new" = ปุ่มเพิ่มรูป: เป็นรูปเพิ่มเติมทั้งหมด · "auto" = ลากมาวาง: เติมช่องว่างก่อน แล้วค่อยเป็นรูปเพิ่มเติม
   * เกินเพดานบอกว่ากี่รูปที่ไม่ได้ใส่ ไม่ทิ้งทั้งชุด
   */
  function place(files: PickedAttachment[], key: number | "new" | "auto") {
    let next = latest.current;
    const targets: number[] = [];
    if (typeof key === "number") {
      const old = next.find((s) => s.key === key);
      if (old?.id) discard(old.id);
      targets.push(key);
    }
    if (key !== "new") {
      for (const s of next) if (targets.length < files.length && !s.file && !targets.includes(s.key)) targets.push(s.key);
    }
    while (targets.length < files.length && next.length < max) {
      const s: Slot = { key: seq++, label: "รูปเพิ่มเติม", file: null, status: "empty", id: null };
      next = [...next, s];
      targets.push(s.key);
    }
    if (next !== latest.current) commit(next);
    if (files.length > targets.length) {
      showAlert("รูปเต็มแล้ว", `เพิ่มรูปได้สูงสุด ${max} รูป — ไม่ได้ใส่ ${files.length - targets.length} รูป`);
    }
    targets.forEach((k, i) => upload(k, files[i]));
  }

  async function pick(key: number | "new", fromCamera: boolean) {
    const files = fromCamera ? asList(await pickImageAttachment(true)) : await pickImageAttachments();
    if (files.length) place(files, key);
  }

  function choose(key: number | "new") {
    // เว็บเปิดกล้องจากปุ่มนี้ไม่ได้ — ตัวเลือกไฟล์ของมือถือมีปุ่มกล้องในตัวอยู่แล้ว
    if (Platform.OS === "web") return pick(key, false);
    showAlert("เพิ่มรูป", undefined, [
      { text: "ถ่ายรูป", onPress: () => pick(key, true) },
      { text: "เลือกจากอัลบั้ม", onPress: () => pick(key, false) },
      { text: "ยกเลิก", style: "cancel" },
    ]);
  }

  function remove(s: Slot, idx: number) {
    if (s.id) discard(s.id);
    // ช่องบังคับ (5 ช่องแรก) กลับเป็นช่องว่าง ช่องเพิ่มเติมหายไปเลย
    if (idx >= labels.length) commit(latest.current.filter((x) => x.key !== s.key));
    else patch(s.key, { file: null, status: "empty", id: null });
  }

  const count = slots.filter((s) => s.file).length;
  const busy = slots.filter((s) => s.status === "uploading").length;
  const failed = slots.filter((s) => s.status === "error").length;
  const done = slots.filter((s) => s.status === "done").length;

  return (
    <FileDropZone
      style={{ gap: spacing.sm }}
      hint="รูป"
      label="วางรูปรถ"
      onFiles={(files) => filesToAttachments(files, { image: true }).then((got) => got.length && place(got, "auto"))}
    >
      <View style={styles.head}>
        <Ionicons name="camera-outline" size={18} color={colors.text} />
        <Text style={styles.count}>
          {count} / {min} รูป
        </Text>
        <View style={{ flex: 1 }} />
        <View style={[styles.tag, count >= min ? styles.tagOk : styles.tagWarn]}>
          <Text style={[styles.tagText, count >= min ? styles.tagOkText : styles.tagWarnText]}>
            {count >= min ? "ครบแล้ว" : `ต้องถ่ายอีก ${min - count} รูป`}
          </Text>
        </View>
      </View>
      <View style={styles.prog}>
        <View style={[styles.progFill, { width: `${Math.min(100, (count / min) * 100)}%` }]} />
      </View>
      <Text style={[styles.status, failed ? styles.statusBad : done && !busy ? styles.statusOk : null]}>
        {!count
          ? Platform.OS === "web"
            ? "แตะช่องเพื่อเลือกรูป (หลายรูปพร้อมกันได้) หรือลากรูปมาวาง — รูปอัปโหลดทันทีเบื้องหลัง"
            : "แตะช่องเพื่อถ่ายรูปหรือเลือกจากอัลบั้ม (หลายรูปพร้อมกันได้) — รูปอัปโหลดทันทีเบื้องหลัง"
          : failed
            ? `อัปไม่สำเร็จ ${failed} รูป — แตะรูปสีแดงเพื่อลองใหม่`
            : busy
              ? `กำลังอัปโหลดเบื้องหลัง ${busy} รูป · ถ่ายรูปต่อได้เลย`
              : `อัปโหลดแล้วทั้งหมด (${done}/${count})`}
      </Text>
      <View style={styles.grid}>
        {slots.map((s, i) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.slot, s.file && styles.slotFull, s.status === "error" && styles.slotBad]}
            activeOpacity={0.75}
            onPress={() => (s.status === "error" && s.file ? upload(s.key, s.file) : choose(s.key))}
            accessibilityLabel={`${i + 1}. ${s.label}`}
          >
            {s.file?.thumbnailUri || s.file?.uri ? (
              <Image source={{ uri: s.file.thumbnailUri ?? s.file.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <Ionicons name="camera-outline" size={22} color={colors.primary} />
            )}
            <View style={s.file ? styles.labelOn : null}>
              <Text style={[styles.slotText, s.file && styles.slotTextOn]} numberOfLines={2}>
                {i + 1}. {s.label}
              </Text>
              {s.status === "error" ? <Text style={styles.slotTextOn}>อัปไม่สำเร็จ · แตะลองใหม่</Text> : null}
            </View>
            {s.status === "uploading" ? (
              <View style={styles.busy}>
                <WasherIcon size={26} color="#fff" />
              </View>
            ) : null}
            {s.status === "done" ? (
              <View style={styles.ok}>
                <Ionicons name="checkmark" size={13} color="#fff" />
              </View>
            ) : null}
            {s.file ? (
              <TouchableOpacity
                style={styles.del}
                onPress={() => remove(s, i)}
                accessibilityLabel={`ลบรูป ${s.label}`}
                hitSlop={{ top: 6, left: 6, right: 6, bottom: 6 }}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        ))}
        {slots.length < max ? (
          <TouchableOpacity style={styles.slot} activeOpacity={0.75} onPress={() => choose("new")} accessibilityLabel="เพิ่มรูป">
            <Ionicons name="add" size={22} color={colors.primary} />
            <Text style={styles.slotText}>เพิ่มรูป</Text>
            <Text style={styles.hint}>รอยขีดข่วน / จุดเสียหาย</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </FileDropZone>
  );
});

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  count: { fontSize: 14, fontWeight: "700", color: colors.text },
  tag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  tagOk: { backgroundColor: colors.successSoft },
  tagWarn: { backgroundColor: colors.warningSoft },
  tagText: { fontSize: 12, fontWeight: "700" },
  tagOkText: { color: colors.successInk },
  tagWarnText: { color: colors.warningInk },
  prog: { height: 8, borderRadius: 99, backgroundColor: colors.tile, overflow: "hidden" },
  progFill: { height: "100%", backgroundColor: colors.primary },
  status: { fontSize: 12.5, color: colors.textMuted, backgroundColor: colors.tile, borderRadius: radius.md, padding: 8 },
  statusOk: { color: colors.successInk, backgroundColor: colors.successSoft },
  statusBad: { color: colors.dangerInk, backgroundColor: colors.dangerSoft },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  slot: {
    width: 118,
    height: 92,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.sky50,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
    overflow: "hidden",
    gap: 2,
  },
  slotFull: { borderStyle: "solid", borderColor: colors.success },
  slotBad: { borderStyle: "solid", borderColor: colors.danger },
  slotText: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
  slotTextOn: { color: "#fff", fontWeight: "700", fontSize: 11.5, textAlign: "center" },
  labelOn: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(11,59,96,0.6)", padding: 3 },
  hint: { fontSize: 10.5, color: colors.textFaint, textAlign: "center" },
  busy: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(11,59,96,0.45)", alignItems: "center", justifyContent: "center" },
  ok: { position: "absolute", top: 5, left: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  del: { position: "absolute", top: 5, right: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(15,23,42,0.65)", alignItems: "center", justifyContent: "center" },
});
