/**
 * วิดีโอหลักฐานเคลมเล่นในหน้าตรวจเลย (เว็บ) — ปุ่ม "เปิดไฟล์" อยู่ใต้วิดีโอเสมอ
 *
 * เดิมกดแล้วเปิดแท็บใหม่ทีละไฟล์ ผู้ตรวจดูวิดีโอ Error แล้วต้องสลับกลับมาดูรหัสบนใบอีกที ตอนนี้เล่นข้างข้อมูลที่กำลังเทียบ
 * ลิงก์อายุ 2 ชั่วโมงจากชุดที่ใบงานขอไว้แล้ว (utils/attachmentCache) — เปิดหน้าค้างไว้นานจนลิงก์หมดอายุ
 * วิดีโอจะโหลดไม่ขึ้น จึงขอลิงก์ใหม่หนึ่งครั้งก่อน ยังเล่นไม่ได้อีก (เช่น .mov HEVC บน Chrome คอม) ค่อยบอกให้กดเปิดไฟล์
 * แอปมือถือไม่มีตัวเล่นในหน้า — ใช้ปุ่มเปิดไฟล์ให้เครื่องเปิดเอง
 */
import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../Tap";
import { apiErrorMessage } from "../../api/client";
import { linkFor, prefetchLinks } from "../../utils/attachmentCache";
import { openUrl } from "../../utils/share";
import { showAlert } from "../../utils/alert";
import { colors, radius } from "../../theme";

export default function ClaimVideo({
  workOrderId,
  attachmentId,
  label,
  height = 180,
}: {
  workOrderId: number;
  attachmentId: number;
  /** ชื่อไฟล์ที่คนเรียก เช่น "วิดีโอการตรวจเช็ค บอร์ดควบคุม" — ใช้กับปุ่มเปิดไฟล์และโปรแกรมอ่านจอ */
  label: string;
  height?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const retried = useRef(false);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setFailed(false);
    retried.current = false;
    if (Platform.OS !== "web") return;
    linkFor(workOrderId, attachmentId)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [workOrderId, attachmentId]);

  async function onError() {
    if (retried.current) return setFailed(true);
    retried.current = true;
    try {
      // ลิงก์ชุดเดิมอาจหมดอายุ — ขอชุดใหม่ครั้งเดียว
      const urls = await prefetchLinks(workOrderId, true);
      if (urls[attachmentId] && urls[attachmentId] !== url) setUrl(urls[attachmentId]);
      else setFailed(true);
    } catch {
      setFailed(true);
    }
  }

  async function open() {
    try {
      await openUrl(url ?? (await linkFor(workOrderId, attachmentId)));
    } catch (e) {
      showAlert("เปิดไฟล์ไม่ได้", apiErrorMessage(e));
    }
  }

  return (
    <View style={{ gap: 4 }}>
      {Platform.OS === "web" ? (
        failed ? (
          <View style={[styles.box, styles.fail, { height }]}>
            <Text style={styles.failText}>เบราว์เซอร์นี้เล่นไฟล์นี้ไม่ได้ — กดเปิดไฟล์</Text>
          </View>
        ) : url ? (
          React.createElement("video", {
            src: url,
            controls: true,
            preload: "metadata",
            playsInline: true,
            onError,
            "aria-label": label,
            style: { width: "100%", height, borderRadius: radius.sm, backgroundColor: "#0F1720", display: "block" },
          })
        ) : (
          <View style={[styles.box, { height }]} />
        )
      ) : null}
      <TouchableOpacity style={styles.open} onPress={open} activeOpacity={0.8} accessibilityLabel={`เปิดไฟล์${label}`}>
        <Ionicons name="open-outline" size={15} color={colors.primaryInk} />
        <Text style={styles.openText}>เปิดไฟล์</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: "100%", borderRadius: radius.sm, backgroundColor: "#0F1720" },
  fail: { alignItems: "center", justifyContent: "center", padding: 12, backgroundColor: colors.rowAlt, borderWidth: 1, borderColor: colors.border },
  failText: { fontSize: 13, lineHeight: 20, color: colors.body, textAlign: "center" },
  // สูง 44 พอให้นิ้วกดโดน — ปุ่มอยู่ใต้วิดีโอ ไม่ใช่บนตัววิดีโอ (แตะวิดีโอ = เล่น/หยุด)
  open: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.sky200,
    backgroundColor: colors.card,
  },
  openText: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
});
