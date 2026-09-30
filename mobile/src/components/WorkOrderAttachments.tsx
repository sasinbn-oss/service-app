/**
 * รูปและวิดีโอของใบงานที่เปิดแล้ว
 *
 * ทุกวันนี้ช่างถ่ายรูปหน้างานส่งไลน์ พอผ่านไปสองสัปดาห์แชทก็กลืนไปหมด
 * เวลามีเรื่องต้องย้อนดูว่าตอนนั้นเครื่องเป็นยังไงจึงไม่เหลืออะไรให้ดู
 * ที่นี่รูปอยู่ติดกับใบงาน ใครเปิดใบงานก็เห็น ไม่ต้องไปตามหาในแชทใคร
 *
 * การเลือกไฟล์ ย่อรูป และส่งขึ้นเซิร์ฟเวอร์อยู่ที่ utils/attachments
 * เพราะหน้าเปิดใบงานก็แนบได้เหมือนกัน ต่างกันแค่จังหวะที่ส่ง
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
import Ionicons from "@expo/vector-icons/Ionicons";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { openUrl } from "../utils/share";
import {
  PickedAttachment,
  formatSize,
  pickImageAttachment,
  pickVideoAttachment,
  uploadAttachment,
} from "../utils/attachments";
import { useAuth } from "../context/AuthContext";
import { colors, radius, spacing } from "../theme";

export interface Attachment {
  id: number;
  kind: string;
  kindLabel: string;
  /** รูปนี้คืออะไร เช่น NAMEPLATE — ว่างคือรูปอาการธรรมดา */
  role: string | null;
  roleLabel: string | null;
  fileName: string;
  sizeBytes: number;
  available: boolean;
  createdAt: string;
  createdById: number | null;
  createdByName: string | null;
  thumbnailDataUrl: string | null;
}

export default function WorkOrderAttachments({
  workOrderId,
  canEdit,
  reloadKey = 0,
}: {
  workOrderId: number;
  canEdit: boolean;
  /**
   * ขยับเลขนี้เมื่อมีคนแนบไฟล์จากที่อื่น เช่น รูปใบเหลืองตอนปิดงาน
   *
   * การ์ดนี้โหลดรายการของตัวเองครั้งเดียวตอนขึ้นจอ จึงไม่รู้เลยว่ามีไฟล์
   * เพิ่มเข้ามาจากหน้าอื่น — ถ้าไม่บอก คนปิดงานจะเห็นว่า "ยังไม่มีรูป"
   * ทั้งที่เพิ่งแนบไปเมื่อกี้
   */
  reloadKey?: number;
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
  }, [load, reloadKey]);

  async function add(
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | null>,
    sending: string
  ) {
    setBusy("กำลังเตรียมไฟล์");
    try {
      const file = await pick(setBusy);
      if (!file) return;
      setBusy(sending);
      await uploadAttachment(workOrderId, file);
      await load();
    } catch (e) {
      showAlert("แนบไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
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
                {/* ป้ายบอกว่าเป็นรูปป้ายรุ่น ไม่ใช่รูปอาการ — เวลาสั่งอะไหล่
                    ต้องหยิบรูปนี้ให้ถูกใบจากกองรูปที่หน้าตาคล้ายกันหมด */}
                {row.roleLabel ? (
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{row.roleLabel}</Text>
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
              <TouchableOpacity style={styles.addBtn} onPress={() => add((stage) => pickImageAttachment(true, stage), "กำลังส่งรูป")} activeOpacity={0.8}>
                <Ionicons name="camera-outline" size={17} color={colors.primary} />
                <Text style={styles.addText}>ถ่ายรูป</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.addBtn} onPress={() => add((stage) => pickImageAttachment(false, stage), "กำลังส่งรูป")} activeOpacity={0.8}>
              <Ionicons name="images-outline" size={17} color={colors.primary} />
              <Text style={styles.addText}>เลือกรูป</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => add(pickVideoAttachment, "กำลังส่งวิดีโอ")} activeOpacity={0.8}>
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
  roleBadge: {
    position: "absolute",
    left: spacing.xs,
    top: spacing.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: "rgba(15,23,42,0.78)",
  },
  roleBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
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
