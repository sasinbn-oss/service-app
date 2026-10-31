/**
 * ดาวน์โหลดหลักฐานส่งผู้ขาย (เคลมก้อน 6 · ตัวอย่างที่เจ้าของงานเลือก ข้อ 13) — ขึ้นหลังอนุมัติเท่านั้น
 *
 * เดิม Admin Spare Part ต้องเปิดใบเคลม PDF ทีละชิ้น แล้วไล่เปิดรูป/วิดีโอทีละไฟล์จากใบงานมาตั้งชื่อเองก่อนแนบอีเมล
 * ผู้ขายได้ไฟล์ชื่อสุ่มจากกล้อง จับคู่กับใบเคลมไม่ได้ · ตอนนี้:
 * - zip 1 ไฟล์ = ใบเคลม PDF ของทุกชิ้นที่อนุมัติ + รูป (เล็ก แนบอีเมลได้) — เซิร์ฟเวอร์รวมตอนกดดาวน์โหลด ไม่เก็บไว้
 * - วิดีโอแยกไฟล์ละปุ่ม — ไฟล์ละสูงสุด 60 MB รวมกันแนบอีเมลไม่ได้ จึงไม่อยู่ใน zip (ลิงก์โหลดตรงจากที่เก็บไฟล์)
 * - ทุกไฟล์ชื่อ WO-xxxxx_<รหัสอะไหล่>_<อะไร> — ชื่อมาจากเซิร์ฟเวอร์ ชุดเดียวกับในใบเคลม PDF ผู้ขายจับคู่ได้เอง
 * ก่อนอนุมัติไม่มีแผงนี้ (ใบร่างห้ามหลุดไปผู้ขาย) · เซิร์ฟเวอร์ให้เฉพาะ Admin Spare Part / Super Admin
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../Tap";
import Spinner from "../Spinner";
import { api, apiErrorMessage, resolveImageUrl } from "../../api/client";
import { openUrl } from "../../utils/share";
import { colors, radius } from "../../theme";

interface ClaimFiles {
  zip: { filename: string };
  /** ชื่อไฟล์ใน zip (ใบเคลม PDF + รูป) */
  photos: string[];
  videos: { attachmentId: number; name: string; sizeBytes: number; url: string | null }[];
}

/** ลิงก์วิดีโออายุ 2 ชั่วโมง — เปิดแผงค้างไว้นานกว่านี้ ขอรายการใหม่ก่อนเปิด (ลิงก์เก่าเปิดแล้วได้หน้าข้อผิดพลาดของที่เก็บไฟล์) */
const LINK_KEEP_MS = 90 * 60_000;

/** ป้ายปุ่มวิดีโอ = ชื่อไฟล์ไม่มีเลขใบงานกับนามสกุล "_" เป็นช่องว่าง (ตัวอย่าง vidBtns: "201384P วิดีโอการตรวจเช็ค") */
function videoLabel(name: string, code: string) {
  const rest = name.startsWith(`${code}_`) ? name.slice(code.length + 1) : name.replace(/^WO-[^_]*_/, "");
  return rest.replace(/\.[^.]+$/, "").replace(/_/g, " ");
}

export default function DownloadPanel({ workOrderId, code }: { workOrderId: number; code: string }) {
  const [files, setFiles] = useState<ClaimFiles | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedAt = useRef(0);

  const load = useCallback(async (): Promise<ClaimFiles | null> => {
    setState("loading");
    // ล้างข้อความเดิมก่อนลองใหม่ — กด "ลองใหม่" แล้วผ่าน ข้อความแดงค้างอยู่จะบอกผู้ตรวจว่ายังดาวน์โหลดไม่ได้ทั้งที่ได้แล้ว
    setError(null);
    try {
      const res = await api.get<ClaimFiles>(`/work-orders/${workOrderId}/claims/files`, { loadingText: false });
      loadedAt.current = Date.now();
      setFiles(res.data);
      setState("ready");
      return res.data;
    } catch (e) {
      setError(apiErrorMessage(e));
      setState("failed");
      return null;
    }
  }, [workOrderId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function downloadZip() {
    setBusy("zip");
    setError(null);
    try {
      // ขอตั๋วดาวน์โหลด (อายุ 2 ชม.) แล้วเปิดลิงก์ — zip ถูกรวมตอนเบราว์เซอร์โหลด ไม่ได้รอให้เสร็จก่อน
      const res = await api.post<{ path: string; filename: string }>(`/work-orders/${workOrderId}/claims/evidence-link`);
      await openUrl(resolveImageUrl(res.data.path)!);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function downloadVideo(v: ClaimFiles["videos"][number]) {
    setBusy(`v${v.attachmentId}`);
    setError(null);
    try {
      let url = v.url;
      if (!url || Date.now() - loadedAt.current > LINK_KEEP_MS) {
        const fresh = await load();
        url = fresh?.videos.find((x) => x.attachmentId === v.attachmentId)?.url ?? null;
      }
      if (!url) throw new Error("ไฟล์นี้ยังไม่ขึ้นที่เก็บไฟล์ — ลองใหม่อีกครั้ง");
      await openUrl(url);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const videos = files?.videos ?? [];
  return (
    <View style={styles.box} accessibilityLabel="ดาวน์โหลดหลักฐาน">
      <Text style={styles.title}>ดาวน์โหลดหลักฐาน (ส่งผู้ขาย)</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.zipBtn, busy !== null && styles.off]}
          onPress={() => void downloadZip()}
          disabled={busy !== null}
          activeOpacity={0.8}
          accessibilityLabel={files ? `ดาวน์โหลด ${files.zip.filename}` : "ดาวน์โหลด zip ใบเคลม PDF และรูป"}
        >
          {busy === "zip" ? <Spinner color="#fff" size="small" /> : <Ionicons name="download-outline" size={18} color="#fff" />}
          <Text style={styles.zipText}>zip: ใบเคลม PDF + รูป (1 ไฟล์)</Text>
        </TouchableOpacity>
      </View>
      {state === "loading" && !files ? (
        <Text style={styles.small}>กำลังโหลดรายการไฟล์…</Text>
      ) : null}
      {videos.length ? (
        <>
          <Text style={styles.sub}>วิดีโอแยกไฟล์ละปุ่ม ({videos.length} ไฟล์ · ไม่รวมใน zip)</Text>
          <View style={styles.row}>
            {videos.map((v) => (
              <TouchableOpacity
                key={v.attachmentId}
                style={[styles.vidBtn, busy !== null && styles.off]}
                onPress={() => void downloadVideo(v)}
                disabled={busy !== null}
                activeOpacity={0.8}
                accessibilityLabel={`ดาวน์โหลด ${v.name}`}
              >
                {busy === `v${v.attachmentId}` ? (
                  <Spinner color={colors.navy} size="small" />
                ) : (
                  <Ionicons name="videocam-outline" size={18} color={colors.navy} />
                )}
                <Text style={styles.vidText}>{videoLabel(v.name, code)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}
      {error ? (
        <View style={styles.errRow}>
          <Text style={styles.err} accessibilityRole="alert">
            {error}
          </Text>
          {state === "failed" ? (
            <TouchableOpacity onPress={() => void load()} style={styles.retry} accessibilityLabel="โหลดรายการไฟล์ใหม่">
              <Text style={styles.retryText}>ลองใหม่</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.small}>ทุกไฟล์ตั้งชื่อตามเลขใบงานและรหัสอะไหล่ ผู้ขายจับคู่กับใบเคลมได้เอง</Text>
      {files ? (
        <View style={{ gap: 2 }} accessibilityLabel="ไฟล์ที่ส่งผู้ขาย">
          {files.photos.map((n) => (
            <Text key={`z-${n}`} style={styles.file}>
              zip › {n}
            </Text>
          ))}
          {videos.map((v) => (
            <Text key={`v-${v.attachmentId}`} style={styles.file}>
              วิดีโอ › {v.name}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  title: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.text },
  sub: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.body },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  // พื้นปุ่มใช้ navyFill (เข้มทั้งสองโหมด) — navy โหมดมืดเป็นสีอ่อน ตัวขาวบนนั้นอ่านไม่ออก
  zipBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.navyFill,
    flexShrink: 1,
  },
  zipText: { flexShrink: 1, fontSize: 14, fontWeight: "700", color: "#fff" },
  vidBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.navy,
    backgroundColor: colors.card,
    flexShrink: 1,
    maxWidth: "100%",
  },
  vidText: { flexShrink: 1, fontSize: 13, fontWeight: "700", color: colors.navy },
  off: { opacity: 0.6 },
  small: { fontSize: 12, lineHeight: 18, color: colors.body },
  errRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  err: { flexShrink: 1, fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.dangerInk },
  retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  retryText: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
  file: { fontFamily: "monospace", fontSize: 12, lineHeight: 18, color: colors.text },
});
