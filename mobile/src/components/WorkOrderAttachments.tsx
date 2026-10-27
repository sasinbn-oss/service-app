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
  Image,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import TouchableOpacity from "./Tap";
import type { FormLink } from "../utils/formLinks";
import Spinner from "./Spinner";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import {
  PickedAttachment,
  formatSize,
  pickImageAttachment,
  pickVideoAttachment,
  uploadAttachment,
  attachmentIcon,
} from "../utils/attachments";
import { haveThumbs, prefetchLinks, withThumbs } from "../utils/attachmentCache";
import { useAuth } from "../context/AuthContext";
import ImageViewer from "./ImageViewer";
import InspectionSlots, { inspectionFilesOf, missingInspection } from "./InspectionSlots";
import { colors, radius, shadow, spacing } from "../theme";

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
  /** มีรูปย่อ — เซิร์ฟเวอร์ไม่ส่งรูปย่อที่แอปบอกว่าจำไว้แล้ว (thumbnailDataUrl = null) ดู utils/attachmentCache */
  hasThumbnail?: boolean;
  mimeType?: string;
  /** หลักฐานเคลม (role CLAIM_*) เป็นของอะไหล่ชิ้นไหน */
  sparePartId?: number | null;
}

export default function WorkOrderAttachments({
  workOrderId,
  canEdit,
  reloadKey = 0,
  onLoaded,
  onAdded,
  inspection,
  formLinks = [],
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
  /** ส่งรายการที่โหลดมาให้หน้าจอแม่ใช้ต่อ จะได้ไม่ต้องยิงขอรายการเดิมซ้ำ */
  onLoaded?: (rows: Attachment[]) => void;
  /** แนบไฟล์สำเร็จ — หน้าจอแม่โหลดใบงานใหม่ ให้หน้าปิดงานรู้ว่ามีรูปก่อนซ่อมแล้ว */
  onAdded?: () => void;
  /**
   * ใบงานที่ส่งทีมไปตรวจหน้างาน — แยกไฟล์ตรวจขึ้นเป็นกรอบสามอย่าง
   * active คือยังรอผลตรวจ (แนบได้ · บอกว่าขาดอะไร) ตรวจเสร็จแล้วกรอบเหลือไว้ให้หัวหน้าภาคดู
   */
  inspection?: { since: string | null; active: boolean };
  /** รูป/วิดีโอที่สาขาแนบในฟอร์มแจ้งซ่อม — อยู่ใน SharePoint ดึงมาเก็บไม่ได้ จึงเป็นปุ่มเปิดลิงก์ (utils/formLinks.ts) */
  formLinks?: FormLink[];
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * รูปที่จะแนบคืออะไร — ช่างถ่าย "ก่อนซ่อม" ไว้ตั้งแต่ไปถึงได้ ตอนปิดงานไม่ต้องถ่ายซ้ำ
   * (ปิดงานบังคับรูปก่อน/หลังซ่อม) · ไม่เลือก = รูปหน้างานทั่วไปแบบเดิม
   */
  const [tag, setTag] = useState<"" | "BEFORE" | "AFTER">("");

  const load = useCallback(async () => {
    try {
      // บอกเซิร์ฟเวอร์ว่ารูปย่อใบไหนจำไว้แล้ว ไม่ต้องส่งซ้ำ (utils/attachmentCache)
      const res = await api.get<{ rows: Attachment[] }>(`/work-orders/${workOrderId}/attachments`, {
        params: { have: haveThumbs(workOrderId) },
      });
      const next = withThumbs(workOrderId, res.data.rows);
      setRows(next);
      onLoaded?.(next);
      // ลิงก์ของทุกไฟล์รวดเดียวเบื้องหลัง — กดดูไฟล์แล้วเริ่มโหลดตัวไฟล์ได้ทันที
      if (next.some((r) => r.available)) void prefetchLinks(workOrderId).catch(() => undefined);
    } catch {
      // เงียบไว้ ไฟล์แนบไม่ใช่เนื้อหาหลักของหน้า ถ้าโหลดไม่ได้ก็ไม่ควรบังหน้าจอ
      // ส่วนที่เหลือทั้งใบ ซึ่งเป็นข้อมูลที่คนเปิดมาดูจริง ๆ
    } finally {
      setLoading(false);
    }
    // onLoaded ไม่อยู่ใน deps เพราะหน้าจอแม่ส่ง setState ตรง ๆ ซึ่งคงที่อยู่แล้ว
    // ใส่เข้าไปจะกลายเป็นวนโหลดไม่จบถ้าวันหลังมีใครส่ง inline function มา
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      await uploadAttachment(workOrderId, file, tag || undefined);
      await load();
      onAdded?.();
    } catch (e) {
      showAlert("แนบไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  // กดรูปแล้วเปิดดูเต็มจอในแอป (เลื่อนรูป · ซูม) แทนเปิดแท็บใหม่ทีละรูป
  const [viewing, setViewing] = useState<number | null>(null);
  function open(row: Attachment) {
    if (!row.available && !row.thumbnailDataUrl) {
      showAlert("เปิดไฟล์ไม่ได้", "ไฟล์นี้ส่งขึ้นที่เก็บไม่สำเร็จ");
      return;
    }
    setViewing(rows.findIndex((r) => r.id === row.id));
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

  const inspectRows = inspection ? inspectionFilesOf(rows, inspection.since) : [];
  const showSlots = !!inspection && (inspection.active || inspectRows.length > 0);
  // ไฟล์ที่อยู่ในกรอบแล้วไม่ต้องขึ้นซ้ำในกองไฟล์ด้านล่าง
  const others = showSlots ? rows.filter((r) => !inspectRows.includes(r)) : rows;
  const missing = inspection?.active ? missingInspection(rows, inspection.since) : [];

  const addButtons = (
    <View style={styles.addRow}>
      {/* กล้องเฉพาะบนมือถือ — คนที่เปิดจากคอมพิวเตอร์คือแอดมินที่นั่งโต๊ะ
          ปุ่มถ่ายรูปบนเครื่องนั้นไม่ได้ช่วยอะไรนอกจากทำให้แถวปุ่มรก */}
      {Platform.OS !== "web" ? (
        <TouchableOpacity style={styles.addBtn} onPress={() => add((stage) => pickImageAttachment(true, stage), "กำลังส่งรูป")} activeOpacity={0.8}>
          <Ionicons name="camera-outline" size={17} color={colors.navy} />
          <Text style={styles.addText}>ถ่ายรูป</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={styles.addBtn} onPress={() => add((stage) => pickImageAttachment(false, stage), "กำลังส่งรูป")} activeOpacity={0.8}>
        <Ionicons name="images-outline" size={17} color={colors.navy} />
        <Text style={styles.addText}>เลือกรูป</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.addBtn} onPress={() => add(pickVideoAttachment, "กำลังส่งวิดีโอ")} activeOpacity={0.8}>
        <Ionicons name="videocam-outline" size={17} color={colors.navy} />
        <Text style={styles.addText}>วิดีโอ</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.card}>
      {viewing !== null ? (
        <ImageViewer workOrderId={workOrderId} items={rows} startIndex={viewing} onClose={() => setViewing(null)} />
      ) : null}
      {/* หัวการ์ดตามแบบ ต.ค. 69: ไอคอน + ชื่อ · ชนิดรูปเป็นแถบเลือกมุมขวา (เลือกก่อนแนบ) */}
      <View style={styles.head}>
        <Ionicons name="camera-outline" size={19} color={colors.primaryInk} />
        <Text style={styles.title}>รูป / วิดีโอหน้างาน</Text>
        {rows.length > 0 ? <Text style={styles.count}>· {rows.length} ไฟล์</Text> : null}
        <View style={{ flex: 1 }} />
        {canEdit && !busy ? (
          <View style={styles.seg} accessibilityLabel="รูปนี้คือ">
            {([["", "รูปหน้างาน"], ["BEFORE", "ก่อนซ่อม"], ["AFTER", "หลังซ่อม"]] as const).map(([v, label]) => (
              <TouchableOpacity
                key={v || "site"}
                style={[styles.tagChip, tag === v && styles.tagChipOn]}
                onPress={() => setTag(v)}
                activeOpacity={0.7}
                accessibilityLabel={`แนบเป็น${label}`}
              >
                <Text style={[styles.tagText, tag === v && styles.tagTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>

      {formLinks.length ? (
        <View style={styles.formLinks}>
          {formLinks.map((l) => (
            <TouchableOpacity
              key={l.url}
              style={styles.formLink}
              onPress={() => Linking.openURL(l.url)}
              accessibilityLabel={`ดู${l.label}`}
            >
              <Ionicons name={l.kind === "รูป" ? "image-outline" : "videocam-outline"} size={20} color={colors.primaryInk} />
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.formLinkTitle}>{l.label}</Text>
                <Text style={styles.formLinkSub}>สาขาแนบมา · เปิดใน SharePoint (ต้องล็อกอินบัญชีบริษัท)</Text>
              </View>
              <Ionicons name="open-outline" size={15} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {showSlots && !loading ? (
        <>
          {inspection!.active ? (
            <View style={[styles.progress, missing.length === 0 && styles.progressDone]}>
              <Text style={[styles.progressText, missing.length === 0 && styles.progressTextDone]}>
                ไฟล์ตรวจหน้างาน ครบ {3 - missing.length} / 3
                {missing.length ? ` — ยังขาด: ${missing.join(" · ")}` : ""}
              </Text>
            </View>
          ) : (
            <Text style={styles.groupLabel}>ไฟล์ตรวจหน้างาน</Text>
          )}
          <InspectionSlots
            workOrderId={workOrderId}
            rows={rows}
            since={inspection!.since}
            canEdit={canEdit && inspection!.active}
            canRemove={canRemove}
            onOpen={open}
            onRemove={remove}
            onChanged={async () => {
              await load();
              onAdded?.();
            }}
          />
          {others.length > 0 || canEdit ? <Text style={styles.groupLabel}>ไฟล์อื่น ๆ</Text> : null}
        </>
      ) : null}

      {loading ? (
        <Spinner color={colors.primary} style={{ marginVertical: spacing.md }} />
      ) : showSlots && others.length === 0 ? null : others.length === 0 ? (
        <View style={[styles.emptyBox, !canEdit && styles.emptyBoxPlain]}>
          <Text style={[styles.empty, styles.emptyCenter]}>
            {formLinks.length
              ? "ยังไม่มีรูปที่แนบในระบบ — รูปจากฟอร์มอยู่ด้านบน"
              : "ยังไม่มีรูป — รูปหน้างานช่วยให้คนที่ไม่ได้ไปเห็นว่าเจออะไรจริง ๆ"}
          </Text>
          {canEdit && !busy ? addButtons : null}
        </View>
      ) : (
        <View style={styles.grid}>
          {others.map((row) => (
            <View key={row.id} style={styles.tile}>
              <TouchableOpacity activeOpacity={0.8} onPress={() => open(row)} style={styles.thumbBox} accessibilityLabel={`ดูไฟล์ ${row.fileName}`}>
                {row.thumbnailDataUrl ? (
                  <Image source={{ uri: row.thumbnailDataUrl }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbBlank]}>
                    <Ionicons
                      name={attachmentIcon(row.kind)}
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
                {/* PDF ที่มีรูปหน้าแรกหน้าตาเหมือนรูปถ่ายเอกสาร — บอกว่าเป็นไฟล์ PDF (กดแล้วเปิดดูทุกหน้าได้) */}
                {row.kind === "DOCUMENT" ? (
                  <View style={styles.pdfBadge}>
                    <Text style={styles.pdfBadgeText}>PDF</Text>
                  </View>
                ) : null}
                {/* ป้ายบอกว่าเป็นรูปป้ายรุ่น ไม่ใช่รูปอาการ — เวลาสั่งอะไหล่
                    ต้องหยิบรูปนี้ให้ถูกใบจากกองรูปที่หน้าตาคล้ายกันหมด */}
                {row.roleLabel ? (
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{row.roleLabel}</Text>
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
            <Spinner color={colors.primary} size="small" />
            <Text style={styles.busyText}>{busy}…</Text>
          </View>
        ) : (
          <>
          {!loading && others.length === 0 && !showSlots ? null : addButtons}
          </>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  formLinks: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  formLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexGrow: 1,
    flexBasis: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primarySoft,
  },
  formLinkTitle: { fontSize: 13.5, fontWeight: "700", color: colors.primaryInk },
  formLinkSub: { fontSize: 11.5, color: colors.textMuted },
  progress: { borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: colors.warningSoft },
  progressDone: { backgroundColor: colors.successSoft },
  progressText: { fontSize: 12, fontWeight: "700", color: colors.warningInk },
  progressTextDone: { color: colors.successInk },
  groupLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginTop: spacing.xs },
  tagRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: spacing.sm },
  tagLabel: { fontSize: 12, color: colors.textMuted, marginRight: 2 },
  // แถบเลือกชนิดรูปแบบ segmented — พื้นเทา ตัวที่เลือกเป็นกล่องขาว (ตามแบบ)
  seg: { flexDirection: "row", gap: 2, padding: 3, borderRadius: 10, backgroundColor: colors.background },
  tagChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  tagChipOn: { backgroundColor: colors.card, ...shadow.card },
  tagText: { fontSize: 13, lineHeight: 20, color: colors.textMuted, fontWeight: "600" },
  tagTextOn: { color: colors.navy, fontWeight: "700" },
  emptyBox: { alignItems: "center", gap: spacing.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.borderStrong, borderRadius: radius.md, paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  emptyBoxPlain: { borderWidth: 0, paddingVertical: 0, alignItems: "flex-start" },
  emptyCenter: { textAlign: "center" },
  // ขอบ + เงาเดียวกับการ์ดอื่นในหน้าใบงาน — การ์ดนี้เคยไม่มีขอบ ดูหลุดจากแถวเดียวกัน
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  head: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  title: { fontSize: 17, lineHeight: 26, fontWeight: "700", color: colors.text },
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
  pdfBadge: {
    position: "absolute",
    left: spacing.xs,
    bottom: spacing.xs,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: colors.danger,
  },
  pdfBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
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
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  addText: { fontSize: 14, fontWeight: "700", color: colors.navy },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  busyText: { fontSize: 13, color: colors.textMuted },
});
