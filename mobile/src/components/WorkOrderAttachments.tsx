/**
 * รูปและวิดีโอของใบงาน
 *
 * ทุกวันนี้ช่างถ่ายรูปหน้างานส่งไลน์ พอผ่านไปสองสัปดาห์แชทก็กลืนไปหมด
 * เวลามีเรื่องต้องย้อนดูว่าตอนนั้นเครื่องเป็นยังไงจึงไม่เหลืออะไรให้ดู
 * ที่นี่รูปอยู่ติดกับใบงาน ใครเปิดใบงานก็เห็น ไม่ต้องไปตามหาในแชทใคร
 *
 * รูปถูกย่อในเครื่องก่อนส่งเสมอ ไม่ได้ส่งไฟล์ดิบจากกล้อง เพราะรูปจากมือถือ
 * สมัยนี้ใบละ 2-3 MB ในขณะที่รูปกว้าง 1600 px ก็เห็นรอยรั่วหรือรหัส error
 * ได้ชัดเท่ากันที่ขนาดไม่ถึงหนึ่งในสิบ ช่างหน้างานที่เน็ตไม่ดีคือคนที่ได้ประโยชน์
 * ที่สุดจากตรงนี้ — รอส่งรูป 3 MB ผ่าน 4G ในซอยคือเหตุผลที่คนเลิกส่งรูป
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as VideoThumbnails from "expo-video-thumbnails";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { openUrl } from "../utils/share";
import { useAuth } from "../context/AuthContext";
import { colors, radius, spacing } from "../theme";

export interface Attachment {
  id: number;
  kind: string;
  kindLabel: string;
  fileName: string;
  sizeBytes: number;
  available: boolean;
  createdAt: string;
  createdById: number | null;
  createdByName: string | null;
  thumbnailDataUrl: string | null;
}

/** กว้างสุดของรูปที่ส่งขึ้นไป — พอเห็นรายละเอียดหน้างานโดยไม่ต้องส่งไฟล์ดิบ */
const MAX_WIDTH = 1600;
/** รูปย่อที่ส่งไปด้วย ใช้แสดงในหน้าใบงาน เก็บในฐานข้อมูลไม่กี่สิบ KB */
const THUMB_WIDTH = 320;
/** วิดีโอยาวสุดที่รับ — ยาวกว่านี้ไม่ได้ช่วยให้เข้าใจอาการเพิ่ม แต่ไฟล์โตตามตรง */
const MAX_VIDEO_SECONDS = 60;

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * ใส่ไฟล์ลง FormData ให้ถูกทางของแต่ละแพลตฟอร์ม
 *
 * บนเว็บ FormData คือของเบราว์เซอร์จริง ๆ ต้องใส่ Blob ถ้าใส่ออบเจ็กต์
 * {uri,name,type} แบบที่ React Native รับ มันจะกลายเป็นข้อความ
 * "[object Object]" แล้วฝั่งเซิร์ฟเวอร์จะไม่เห็นไฟล์เลย — พังแบบเงียบ ๆ
 * ที่หาสาเหตุยากเพราะทุกอย่างดูสำเร็จ
 */
async function appendFile(form: FormData, field: string, uri: string, name: string, type: string) {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append(field, blob, name);
  } else {
    form.append(field, { uri, name, type } as unknown as Blob);
  }
}

async function shrink(uri: string, width: number, compress: number): Promise<string> {
  const image = await ImageManipulator.manipulate(uri).resize({ width }).renderAsync();
  const saved = await image.saveAsync({ compress, format: SaveFormat.JPEG });
  return saved.uri;
}

export default function WorkOrderAttachments({
  workOrderId,
  canEdit,
}: {
  workOrderId: number;
  canEdit: boolean;
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [opening, setOpening] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ rows: Attachment[] }>(`/work-orders/${workOrderId}/attachments`);
      setRows(res.data.rows);
    } catch {
      // เงียบไว้ ไฟล์แนบไม่ใช่เนื้อหาหลักของหน้า ถ้าโหลดไม่ได้ก็ไม่ควรบังหน้าจอ
      // ส่วนที่เหลือทั้งใบ ซึ่งเป็นข้อมูลที่คนเปิดมาดูจริง ๆ
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(params: {
    uri: string;
    name: string;
    type: string;
    thumbnailUri: string | null;
    label: string;
  }) {
    setBusy(params.label);
    try {
      const form = new FormData();
      await appendFile(form, "file", params.uri, params.name, params.type);
      if (params.thumbnailUri) {
        await appendFile(form, "thumbnail", params.thumbnailUri, "thumb.jpg", "image/jpeg");
      }
      await api.post(`/work-orders/${workOrderId}/attachments`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await load();
    } catch (e) {
      showAlert("ส่งไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function pickImage(fromCamera: boolean) {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert("ต้องการสิทธิ์", fromCamera ? "กรุณาอนุญาตให้แอปใช้กล้อง" : "กรุณาอนุญาตให้แอปเข้าถึงรูปภาพ");
      return;
    }

    const options = { mediaTypes: ["images"] as ImagePicker.MediaType[], quality: 1 };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    setBusy("กำลังย่อรูป");
    try {
      // ย่อก่อนส่งเสมอ ไม่ใช่แค่ลดคุณภาพ — quality อย่างเดียวได้ไฟล์ 1.5-2.5 MB
      // เพราะความกว้างยังเท่าเดิม ต้องลดขนาดภาพจริงถึงจะเหลือหลักแสนไบต์
      const uri = await shrink(asset.uri, MAX_WIDTH, 0.7);
      const thumbnailUri = await shrink(asset.uri, THUMB_WIDTH, 0.5);
      const name = (asset.fileName ?? `photo-${Date.now()}.jpg`).replace(/\.[^.]+$/, "") + ".jpg";
      await upload({ uri, name, type: "image/jpeg", thumbnailUri, label: "กำลังส่งรูป" });
    } catch (e) {
      setBusy(null);
      showAlert("เตรียมรูปไม่สำเร็จ", apiErrorMessage(e));
    }
  }

  async function pickVideo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert("ต้องการสิทธิ์", "กรุณาอนุญาตให้แอปเข้าถึงคลังวิดีโอ");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      videoMaxDuration: MAX_VIDEO_SECONDS,
    });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    // videoMaxDuration ตัดตอนถ่ายใหม่ได้ แต่ไม่กันคลิปเก่าที่เลือกจากคลัง
    if (asset.duration && asset.duration > (MAX_VIDEO_SECONDS + 5) * 1000) {
      showAlert(
        "คลิปยาวเกินไป",
        `รับได้ไม่เกิน ${MAX_VIDEO_SECONDS} วินาที — ตัดให้เหลือเฉพาะช่วงที่เห็นอาการก่อนส่ง`
      );
      return;
    }

    setBusy("กำลังเตรียมวิดีโอ");
    let thumbnailUri: string | null = null;
    try {
      // เว็บทำรูปปกวิดีโอไม่ได้ (expo-video-thumbnails ไม่รองรับ) ปล่อยว่างไว้
      // แล้วแสดงไอคอนแทน ดีกว่าบล็อกไม่ให้ส่งวิดีโอจากคอมพิวเตอร์
      const shot = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 });
      thumbnailUri = await shrink(shot.uri, THUMB_WIDTH, 0.5);
    } catch {
      thumbnailUri = null;
    }

    const name = asset.fileName ?? `video-${Date.now()}.mp4`;
    const type = asset.mimeType ?? (name.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
    await upload({ uri: asset.uri, name, type, thumbnailUri, label: "กำลังส่งวิดีโอ" });
  }

  async function open(row: Attachment) {
    if (!row.available) {
      showAlert("เปิดไฟล์ไม่ได้", "ไฟล์นี้ส่งขึ้นที่เก็บไม่สำเร็จ เหลือแต่รูปย่อ");
      return;
    }
    setOpening(row.id);
    try {
      const res = await api.get<{ url: string }>(
        `/work-orders/${workOrderId}/attachments/${row.id}/link`
      );
      await openUrl(res.data.url);
    } catch (e) {
      showAlert("เปิดไฟล์ไม่ได้", apiErrorMessage(e));
    } finally {
      setOpening(null);
    }
  }

  function remove(row: Attachment) {
    showAlert("ลบไฟล์นี้", `ต้องการลบ "${row.fileName}" ใช่ไหม`, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/work-orders/${workOrderId}/attachments/${row.id}`);
            await load();
          } catch (e) {
            showAlert("ลบไม่สำเร็จ", apiErrorMessage(e));
          }
        },
      },
    ]);
  }

  // ลบได้เฉพาะคนที่แนบเองกับแอดมิน — รูปหน้างานเป็นหลักฐาน ไม่ใช่ของที่ใครก็ลบได้
  // เทียบด้วย id ไม่ใช่ชื่อ เพราะในระบบนี้มีช่างชื่อซ้ำกันจริง
  const canRemove = (row: Attachment) =>
    user?.role === "ADMIN" || (user != null && row.createdById === user.id);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>รูป / วิดีโอหน้างาน</Text>
        <View style={{ flex: 1 }} />
        {rows.length > 0 ? <Text style={styles.count}>{rows.length} ไฟล์</Text> : null}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>
          ยังไม่มีรูป — รูปหน้างานช่วยให้คนที่ไม่ได้ไปเห็นว่าเจออะไรจริง ๆ
        </Text>
      ) : (
        <View style={styles.grid}>
          {rows.map((row) => (
            <View key={row.id} style={styles.tile}>
              <TouchableOpacity activeOpacity={0.8} onPress={() => open(row)} style={styles.thumbBox}>
                {row.thumbnailDataUrl ? (
                  <Image source={{ uri: row.thumbnailDataUrl }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbBlank]}>
                    <Ionicons
                      name={row.kind === "VIDEO" ? "videocam-outline" : "image-outline"}
                      size={26}
                      color={colors.textFaint}
                    />
                  </View>
                )}
                {row.kind === "VIDEO" ? (
                  <View style={styles.playBadge}>
                    <Ionicons name="play" size={13} color="#fff" />
                  </View>
                ) : null}
                {opening === row.id ? (
                  <View style={styles.tileBusy}>
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                ) : null}
              </TouchableOpacity>

              <Text style={styles.tileMeta} numberOfLines={1}>
                {row.createdByName ?? "—"} · {formatSize(row.sizeBytes)}
              </Text>

              {canEdit && canRemove(row) ? (
                <TouchableOpacity style={styles.removeBtn} onPress={() => remove(row)} activeOpacity={0.7}>
                  <Ionicons name="close" size={13} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {canEdit ? (
        busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.busyText}>{busy}…</Text>
          </View>
        ) : (
          <View style={styles.addRow}>
            {/* กล้องเฉพาะบนมือถือ — คนที่เปิดจากคอมพิวเตอร์คือแอดมินที่นั่งโต๊ะ
                ปุ่มถ่ายรูปบนเครื่องนั้นไม่ได้ช่วยอะไรนอกจากทำให้แถวปุ่มรก */}
            {Platform.OS !== "web" ? (
              <TouchableOpacity style={styles.addBtn} onPress={() => pickImage(true)} activeOpacity={0.8}>
                <Ionicons name="camera-outline" size={17} color={colors.primary} />
                <Text style={styles.addText}>ถ่ายรูป</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.addBtn} onPress={() => pickImage(false)} activeOpacity={0.8}>
              <Ionicons name="images-outline" size={17} color={colors.primary} />
              <Text style={styles.addText}>เลือกรูป</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={pickVideo} activeOpacity={0.8}>
              <Ionicons name="videocam-outline" size={17} color={colors.primary} />
              <Text style={styles.addText}>วิดีโอ</Text>
            </TouchableOpacity>
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  head: { flexDirection: "row", alignItems: "center" },
  title: { fontSize: 15, fontWeight: "700", color: colors.text },
  count: { fontSize: 12, color: colors.textMuted },
  empty: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: { width: 104 },
  thumbBox: { position: "relative" },
  thumb: {
    width: 104,
    height: 104,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  thumbBlank: { alignItems: "center", justifyContent: "center" },
  playBadge: {
    position: "absolute",
    left: spacing.xs,
    bottom: spacing.xs,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: "rgba(15,23,42,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  tileBusy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)",
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  tileMeta: { fontSize: 10, color: colors.textFaint, marginTop: 2 },
  removeBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  addRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
  },
  addText: { fontSize: 13, fontWeight: "600", color: colors.primary },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  busyText: { fontSize: 13, color: colors.textMuted },
});
