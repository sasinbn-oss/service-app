/**
 * ลากไฟล์มาวางเพื่อแนบ (เว็บ · เจ้าของงานขอ ต.ค. 69 — ทุกที่ที่แนบไฟล์ได้)
 *
 * ห่อส่วนที่มีปุ่มแนบไฟล์ไว้ ลากไฟล์จากโฟลเดอร์มาวางทับแล้วได้ผลเท่ากับกดปุ่มเลือกไฟล์
 * แอดมินทำงานบนคอม รูปใบเสนอราคา/รูปจาก LINE อยู่ในโฟลเดอร์ Downloads อยู่แล้ว
 * กดปุ่ม → หาโฟลเดอร์ → เลือกทีละไฟล์ ช้ากว่าลากทั้งกองมาวางมาก
 *
 * บนมือถือไม่มีการลากไฟล์ — คืนแค่ View ธรรมดา
 */
import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radius, spacing } from "../theme";

const isWeb = Platform.OS === "web" && typeof window !== "undefined";
const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");

/**
 * วางไฟล์พลาดนอกกรอบ = เบราว์เซอร์เปิดไฟล์นั้นแทนแอป ฟอร์มที่กรอกค้างไว้หายหมด
 * กันไว้ทั้งหน้าครั้งเดียว — ในกรอบจับเองก่อน (stopPropagation) ที่เหลือมาตกที่นี่ และถูกปฏิเสธเฉย ๆ
 */
let guarded = false;
function guardWindow() {
  if (guarded || !isWeb) return;
  guarded = true;
  window.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
  });
  window.addEventListener("drop", (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
}

export default function FileDropZone({
  onFiles,
  hint,
  disabled,
  style,
  children,
  label,
}: {
  onFiles: (files: File[]) => void;
  /** บอกว่าที่นี่รับอะไร เช่น "รูป · วิดีโอ" — ขึ้นบนกรอบตอนลากไฟล์มา */
  hint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  /** ชื่อกรอบสำหรับเทสต์/โปรแกรมอ่านหน้าจอ */
  label?: string;
}) {
  const ref = useRef<View>(null);
  const [over, setOver] = useState(false);
  // อ่านค่าล่าสุดใน listener ที่ผูกครั้งเดียว — ไม่งั้นต้องถอด/ผูกใหม่ทุกครั้งที่หน้าจอวาดใหม่
  const latest = useRef({ onFiles, disabled });
  latest.current = { onFiles, disabled };

  useEffect(() => {
    if (!isWeb) return;
    guardWindow();
    const node = ref.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e) || latest.current.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      setOver(true);
    };
    // ออกไปลูกในกรอบก็ยิง dragleave — นับว่าออกจริงเมื่อเมาส์ไปอยู่นอกกรอบแล้ว
    const leave = (e: DragEvent) => {
      if (!node.contains(e.relatedTarget as Node | null)) setOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(false);
      if (latest.current.disabled) return;
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) latest.current.onFiles(files);
    };
    node.addEventListener("dragenter", enter);
    node.addEventListener("dragover", enter);
    node.addEventListener("dragleave", leave);
    node.addEventListener("drop", drop);
    return () => {
      node.removeEventListener("dragenter", enter);
      node.removeEventListener("dragover", enter);
      node.removeEventListener("dragleave", leave);
      node.removeEventListener("drop", drop);
    };
  }, []);

  if (!isWeb) return <View style={style}>{children}</View>;
  return (
    <View ref={ref} style={style} accessibilityLabel={label}>
      {children}
      {over ? (
        <View style={styles.overlay} pointerEvents="none">
          <Ionicons name="cloud-upload-outline" size={26} color={colors.primaryInk} />
          <Text style={styles.title}>วางไฟล์ที่นี่</Text>
          {hint ? <Text style={styles.hint}>{hint} · หลายไฟล์พร้อมกันได้</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/** บรรทัดเล็กใต้ปุ่มแนบไฟล์ บอกว่าลากมาวางได้ — เว็บเท่านั้น (มือถือลากไฟล์ไม่ได้) */
export function DropHint({ text = "หรือลากไฟล์มาวางตรงนี้ (หลายไฟล์พร้อมกันได้)" }: { text?: string }) {
  if (!isWeb) return null;
  return (
    <View style={styles.hintRow}>
      <Ionicons name="cloud-upload-outline" size={13} color={colors.textFaint} />
      <Text style={styles.hintText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    opacity: 0.96,
  },
  title: { fontSize: 15, lineHeight: 24, fontWeight: "800", color: colors.primaryInk },
  hint: { fontSize: 12, lineHeight: 19, color: colors.primaryInk, textAlign: "center" },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  hintText: { fontSize: 11, lineHeight: 18, color: colors.textFaint },
});
