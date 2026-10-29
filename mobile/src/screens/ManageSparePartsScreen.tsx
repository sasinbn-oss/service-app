import React, { useCallback, useMemo, useState } from "react";
import { useDocked } from "../components/SideMenu";
import { useCachedState } from "../utils/pageCache";
import { FlatList, Image, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import AppModal from "../components/AppModal";
import Ionicons from "@expo/vector-icons/Ionicons";
import { showAlert } from "../utils/alert";
import { appendFile } from "../utils/attachments";
import FileDropZone from "../components/FileDropZone";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { useRefreshHandler } from "../components/RefreshButton";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { colors, headingFont, radius, shadow, spacing } from "../theme";
import { SparePart } from "../types";
import SparePartImportModal, { Batch, ImportReportModal } from "../components/SparePartImportModal";

const emptyForm = { partCode: "", name: "", brand: "", category: "", partNo: "", description: "" };
type Form = typeof emptyForm;
type PickedImage = { uri: string; name: string; type: string };

const ALL = "ทั้งหมด";

// รูปอะไหล่เสิร์ฟจาก URL เดิมทุกครั้ง (/spare-parts/:id/image) — ต่อท้ายด้วยเวลาที่แก้ล่าสุด
// ไม่งั้นเบราว์เซอร์โชว์รูปเก่าจากแคชหลังเปลี่ยนรูปจนกว่าจะรีเฟรชหน้า
function thumbUri(part: SparePart) {
  const uri = resolveImageUrl(part.imageUrl);
  return uri ? `${uri}${uri.includes("?") ? "&" : "?"}v=${encodeURIComponent(part.updatedAt)}` : null;
}

async function pickImage(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    showAlert("ต้องการสิทธิ์", "กรุณาอนุญาตให้แอปเข้าถึงคลังรูปภาพ");
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.6,
    allowsEditing: true,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const a = result.assets[0];
  return { uri: a.uri, name: a.fileName ?? "part.jpg", type: a.mimeType ?? "image/jpeg" };
}

/** รูปที่ลากมาวาง (เว็บ) — อะไหล่มีรูปเดียว ลากมาหลายรูปใช้รูปแรกที่เป็นรูป */
function droppedImage(files: File[]): PickedImage | null {
  const f = files.find((x) => x.type.startsWith("image/"));
  if (!f) {
    showAlert("แนบไม่ได้", "รูปอะไหล่ต้องเป็นไฟล์รูป (JPEG, PNG หรือ WebP)");
    return null;
  }
  return { uri: URL.createObjectURL(f), name: f.name, type: f.type };
}

async function uploadImage(partId: number, img: PickedImage) {
  const form = new FormData();
  // ใช้ appendFile — บนเว็บต้องเป็น Blob ถ้าส่ง {uri,name,type} ตรง ๆ เซิร์ฟเวอร์ไม่เห็นไฟล์
  await appendFile(form, "image", img.uri, img.name, img.type);
  await api.post(`/spare-parts/${partId}/image`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

/** ไฮไลต์คำค้นในข้อความ — รายการยาวเป็นร้อย เห็นทันทีว่าแถวนี้ติดมาเพราะอะไร */
function Hl({ text, q, style }: { text: string; q: string; style: object }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <Text style={style}>{text}</Text>;
  return (
    <Text style={style}>
      {text.slice(0, i)}
      <Text style={styles.mark}>{text.slice(i, i + q.length)}</Text>
      {text.slice(i + q.length)}
    </Text>
  );
}

export default function ManageSparePartsScreen() {
  const { docked } = useDocked();
  const [parts, setParts, cached] = useCachedState<SparePart[]>("ManageSpareParts:parts", []);
  const [loading, setLoading] = useState(!cached);
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState(ALL);
  // null = ป๊อปอัพปิด · "new" = เพิ่มใหม่ · อะไหล่ = แก้ไขตัวนั้น
  const [editing, setEditing] = useState<SparePart | "new" | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  // อัปเดตจากไฟล์ Excel (เจ้าของงานขอ ต.ค. 69) — รอบล่าสุดโชว์เป็นแถบ กดดูรายงานย้อนหลังได้
  const [importing, setImporting] = useState(false);
  const [latest, setLatest] = useState<Batch | null>(null);
  const [report, setReport] = useState<Batch | null>(null);
  const loadLatest = useCallback(() => {
    api
      .get<Batch | null>("/spare-parts/imports/latest", { loadingText: false })
      .then((res) => setLatest(res.data))
      .catch(() => undefined);
  }, []);

  const loadParts = useCallback(() => {
    // ไม่เปิดตัวโหลดซ้ำตอนกลับมาที่หน้านี้ ข้อมูลเดิมแสดงไว้ระหว่างอัปเดตเบื้องหลัง (ครั้งแรกเริ่มเป็น true อยู่แล้ว)
    return api
      .get<SparePart[]>("/spare-parts")
      .then((res) => setParts(res.data))
      .catch((e) => showAlert("ผิดพลาด", apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadParts();
      loadLatest();
    }, [loadParts, loadLatest])
  );
  useRefreshHandler(loadParts);

  const brands = useMemo(() => {
    const set = new Set(parts.map((p) => p.brand?.trim()).filter((b): b is string => !!b));
    return [ALL, ...[...set].sort((a, b) => a.localeCompare(b))];
  }, [parts]);

  const q = query.trim();
  const shown = useMemo(() => {
    const needle = q.toLowerCase();
    return parts.filter(
      (p) =>
        (brand === ALL || p.brand?.trim() === brand) &&
        (!needle ||
          [p.partCode, p.name, p.brand, p.category, p.partNo].some((v) => v?.toLowerCase().includes(needle)))
    );
  }, [parts, q, brand]);

  async function handlePickImage(part: SparePart, given?: PickedImage | null) {
    const img = given === undefined ? await pickImage() : given;
    if (!img) return;
    setUploadingId(part.id);
    try {
      await uploadImage(part.id, img);
      loadParts();
      showAlert("สำเร็จ", "อัปโหลดรูปภาพเรียบร้อย");
    } catch (e) {
      showAlert("ผิดพลาด", apiErrorMessage(e));
    } finally {
      setUploadingId(null);
    }
  }

  function handleDelete(part: SparePart) {
    showAlert("ยืนยันการลบ", `ต้องการลบอะไหล่ "${part.name}" หรือไม่?`, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/spare-parts/${part.id}`);
            loadParts();
          } catch (e) {
            showAlert("ผิดพลาด", apiErrorMessage(e));
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* หัวหน้าแบบเดียวกับหน้าสิทธิ์ผู้ใช้ — ฟอร์มเพิ่มเดิมกินครึ่งจอบนจนต้องเลื่อนผ่านทุกครั้งที่จะหาอะไหล่ */}
      <View style={styles.pageHead}>
        {/* จอแคบ: ชื่อหน้าอยู่บนแถบหัวแล้ว ไม่พิมพ์ซ้ำตัวใหญ่ (เจ้าของงานขอ ต.ค. 69) */}
        {docked ? <Text style={[styles.pageTitle, headingFont]}>จัดการข้อมูลอะไหล่</Text> : null}
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>
            {shown.length === parts.length ? `${parts.length} รายการ` : `${shown.length} / ${parts.length} รายการ`}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.importButton} onPress={() => setImporting(true)} activeOpacity={0.8} accessibilityLabel="อัปเดตจากไฟล์ Excel">
          <Ionicons name="cloud-upload-outline" size={18} color={colors.navy} />
          <Text style={styles.importButtonText}>อัปเดตจากไฟล์ Excel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addButton} onPress={() => setEditing("new")} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addButtonText}>เพิ่มอะไหล่ใหม่</Text>
        </TouchableOpacity>
      </View>

      {latest ? (
        <View style={styles.lastImport}>
          <Ionicons name="time-outline" size={18} color={colors.primaryInk} />
          <Text style={styles.lastImportText}>
            อัปเดตจากไฟล์ล่าสุด{" "}
            <Text style={{ fontWeight: "800" }}>
              {new Date(latest.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </Text>
            {latest.byName ? ` โดย ${latest.byName}` : ""} · เพิ่ม {latest.totals.created} · แก้ไข {latest.totals.updated} · รูป {latest.totals.images}
          </Text>
          <TouchableOpacity onPress={() => setReport(latest)} accessibilityLabel="ดูรายละเอียดการอัปเดตล่าสุด">
            <Text style={styles.action}>ดูรายละเอียด</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="ค้นรหัสสินค้า ชื่ออะไหล่ Part No. ยี่ห้อ หรือหมวดหมู่"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="ค้นหาอะไหล่"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery("")} accessibilityLabel="ล้างคำค้นหา" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.textFaint} />
          </TouchableOpacity>
        ) : null}
      </View>

      {brands.length > 2 ? (
        <View style={styles.chips}>
          {brands.map((b) => (
            <TouchableOpacity
              key={b}
              style={[styles.chip, brand === b && styles.chipOn]}
              onPress={() => setBrand(b)}
              accessibilityLabel={`ยี่ห้อ ${b}`}
            >
              <Text style={[styles.chipText, brand === b && styles.chipTextOn]}>{b}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {loading ? (
        <Spinner style={styles.loader} color={colors.primary} />
      ) : parts.length === 0 ? (
        <EmptyState icon="construct-outline" text="ยังไม่มีอะไหล่ในระบบ — กดเพิ่มอะไหล่ใหม่ที่มุมขวาบน" />
      ) : shown.length === 0 ? (
        <Text style={styles.noMatch}>ไม่พบอะไหล่ที่ตรงกับ “{q || brand}”</Text>
      ) : (
        <FlatList
          scrollEnabled={false}
          data={shown}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ gap: spacing.sm }}
          renderItem={({ item }) => {
            const uri = thumbUri(item);
            return (
              <FileDropZone
                style={styles.card}
                hint="รูปอะไหล่ 1 รูป"
                label={`วางรูป ${item.partCode}`}
                disabled={uploadingId === item.id}
                onFiles={(files) => handlePickImage(item, droppedImage(files))}
              >
                {uri ? (
                  <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder]}>
                    <Text style={styles.thumbPlaceholderText}>ไม่มีรูป</Text>
                  </View>
                )}
                <View style={styles.info}>
                  <Hl text={item.name} q={q} style={styles.name} />
                  <Text style={styles.meta}>
                    <Hl text={item.partCode} q={q} style={styles.meta} />
                    {item.brand ? " · " : ""}
                    {item.brand ? <Hl text={item.brand} q={q} style={styles.meta} /> : null}
                    {item.partNo ? " · Part No. " : ""}
                    {item.partNo ? <Hl text={item.partNo} q={q} style={styles.meta} /> : null}
                  </Text>
                  <View style={styles.actionRow}>
                    <TouchableOpacity onPress={() => handlePickImage(item)} disabled={uploadingId === item.id}>
                      {uploadingId === item.id ? (
                        <Spinner size="small" color={colors.primary} />
                      ) : (
                        <Text style={styles.action}>เลือกรูป</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditing(item)} accessibilityLabel={`แก้ไข ${item.partCode}`}>
                      <Text style={styles.action}>แก้ไข</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item)} accessibilityLabel={`ลบ ${item.partCode}`}>
                      <Text style={styles.delete}>ลบ</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </FileDropZone>
            );
          }}
        />
      )}

      {importing ? (
        <SparePartImportModal
          onClose={() => {
            setImporting(false);
            loadLatest();
          }}
          onDone={() => {
            loadParts();
            loadLatest();
          }}
        />
      ) : null}
      {report ? <ImportReportModal batch={report} onClose={() => setReport(null)} /> : null}

      {editing ? (
        <PartModal
          part={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadParts();
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function PartModal({
  part,
  onClose,
  onSaved,
}: {
  part: SparePart | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(
    part
      ? {
          partCode: part.partCode,
          name: part.name,
          brand: part.brand ?? "",
          category: part.category ?? "",
          partNo: part.partNo ?? "",
          description: part.description ?? "",
        }
      : emptyForm
  );
  const [image, setImage] = useState<PickedImage | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const ready = !!form.partCode.trim() && !!form.name.trim();
  const preview = image?.uri ?? (part ? thumbUri(part) : null);

  async function submit() {
    if (!ready) return;
    setSaving(true);
    const payload = {
      partCode: form.partCode.trim(),
      name: form.name.trim(),
      brand: form.brand.trim() || undefined,
      category: form.category.trim() || undefined,
      // ล้างช่องแล้วบันทึก = ลบ Part No. (ส่ง "" ไม่ใช่ไม่ส่ง ไม่งั้นค่าเดิมค้าง)
      partNo: part ? form.partNo.trim() : form.partNo.trim() || undefined,
      description: form.description.trim() || undefined,
    };
    let saved: SparePart;
    try {
      saved = part
        ? (await api.put<SparePart>(`/spare-parts/${part.id}`, payload)).data
        : (await api.post<SparePart>("/spare-parts", payload)).data;
    } catch (e) {
      setSaving(false);
      showAlert("ผิดพลาด", apiErrorMessage(e));
      return;
    }
    // รูปส่งหลังได้ id — อะไหล่ใหม่ยังไม่มี id จนกว่าจะบันทึก
    // อัปรูปพังไม่ควรทำให้ข้อมูลที่บันทึกไปแล้วดูเหมือนหาย จึงแจ้งแยก
    if (image) {
      try {
        await uploadImage(saved.id, image);
      } catch (e) {
        setSaving(false);
        onSaved();
        showAlert("บันทึกอะไหล่แล้ว แต่อัปรูปไม่สำเร็จ", `${apiErrorMessage(e)} — กด "เลือกรูป" ที่รายการเพื่อลองใหม่`);
        return;
      }
    }
    setSaving(false);
    onSaved();
    showAlert("สำเร็จ", part ? "แก้ไขข้อมูลเรียบร้อย" : "เพิ่มอะไหล่เรียบร้อย");
  }

  return (
    <AppModal
      visible
      onClose={onClose}
      busy={saving}
      title={part ? "แก้ไขอะไหล่" : "เพิ่มอะไหล่ใหม่"}
      subtitle={part ? part.partCode : undefined}
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onClose} disabled={saving} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalSave, (!ready || saving) && styles.modalSaveOff]}
            onPress={submit}
            disabled={!ready || saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <Spinner color="#fff" size="small" />
            ) : (
              <Text style={styles.modalSaveText}>{part ? "บันทึกการแก้ไข" : "เพิ่มอะไหล่"}</Text>
            )}
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.row2}>
        <View style={styles.field}>
          <Text style={styles.label}>รหัสสินค้า *</Text>
          <TextInput
            style={styles.input}
            value={form.partCode}
            onChangeText={set("partCode")}
            autoCapitalize="characters"
            placeholder="เช่น SPHB0094"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="รหัสสินค้า"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>ยี่ห้อ</Text>
          <TextInput
            style={styles.input}
            value={form.brand}
            onChangeText={set("brand")}
            placeholder="เช่น HB - Huebsch"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="ยี่ห้อ"
          />
        </View>
      </View>
      <Text style={styles.label}>ชื่ออะไหล่ *</Text>
      <TextInput
        style={styles.input}
        value={form.name}
        onChangeText={set("name")}
        placeholder="เช่น ACTUATOR, DOOR SWITCH"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="ชื่ออะไหล่"
      />
      <Text style={styles.label}>
        Part No. <Text style={styles.optional}>(ไม่บังคับ · หลายเลขคั่นด้วยจุลภาค)</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={form.partNo}
        onChangeText={set("partNo")}
        autoCapitalize="characters"
        placeholder="เช่น W11129524, W10731758"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="Part No."
      />
      <Text style={styles.label}>
        หมวดหมู่ <Text style={styles.optional}>(ไม่บังคับ)</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={form.category}
        onChangeText={set("category")}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="หมวดหมู่"
      />
      <Text style={styles.label}>
        รายละเอียด <Text style={styles.optional}>(ไม่บังคับ)</Text>
      </Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={form.description}
        onChangeText={set("description")}
        multiline
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="รายละเอียด"
      />
      <Text style={styles.label}>
        รูปอะไหล่ <Text style={styles.optional}>(ไม่บังคับ)</Text>
      </Text>
      <FileDropZone hint="รูปอะไหล่ 1 รูป" label="วางรูปอะไหล่" disabled={saving} onFiles={(files) => setImage(droppedImage(files) ?? image)}>
        <TouchableOpacity
          style={styles.pick}
          onPress={async () => {
            const img = await pickImage();
            if (img) setImage(img);
          }}
          disabled={saving}
          accessibilityLabel="เลือกรูปอะไหล่"
        >
          {preview ? (
            <Image source={{ uri: preview }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Ionicons name="image-outline" size={22} color={colors.textFaint} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.pickTitle}>{preview ? "เปลี่ยนรูป" : "เลือกรูป"}</Text>
            <Text style={styles.meta}>{image ? image.name : Platform.OS === "web" ? "JPEG, PNG หรือ WebP · ลากรูปมาวางได้" : "JPEG, PNG หรือ WebP"}</Text>
          </View>
        </TouchableOpacity>
      </FileDropZone>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 32 },
  pageHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  pageTitle: { fontSize: 24, lineHeight: 34, fontWeight: "700", color: colors.text },
  countPill: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 12 },
  countPillText: { fontSize: 13, lineHeight: 24, fontWeight: "800", color: colors.primaryInk },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.navy,
    backgroundColor: colors.card,
    borderRadius: 14,
    minHeight: 44,
    paddingHorizontal: 16,
  },
  importButtonText: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.navy },
  lastImport: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  lastImportText: { flexShrink: 1, fontSize: 13.5, lineHeight: 21, color: colors.primaryInk },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.navyFill,
    borderRadius: 14,
    minHeight: 44,
    paddingHorizontal: 16,
    ...shadow.raised,
  },
  addButtonText: { color: "#fff", fontSize: 15, lineHeight: 24, fontWeight: "700" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22, color: colors.text, paddingVertical: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  chipTextOn: { color: colors.primaryInk, fontWeight: "700" },
  noMatch: { fontSize: 14, color: colors.textMuted, textAlign: "center", paddingVertical: spacing.xl },
  mark: { backgroundColor: colors.warningBorder },
  loader: { marginTop: 30 },
  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.background },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbPlaceholderText: { fontSize: 10, color: colors.textMuted },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  actionRow: { flexDirection: "row", gap: 16, marginTop: 8 },
  action: { color: colors.primary, fontWeight: "600", fontSize: 13 },
  delete: { color: colors.danger, fontWeight: "600", fontSize: 13 },
  row2: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  field: { flex: 1, minWidth: 180 },
  label: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text, marginTop: spacing.sm, marginBottom: 4 },
  optional: { fontWeight: "400", color: colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  multiline: { minHeight: 70, textAlignVertical: "top" },
  pick: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  pickTitle: { fontSize: 14, fontWeight: "700", color: colors.primaryInk },
  modalActions: { flex: 1, flexDirection: "row", gap: spacing.sm },
  modalCancel: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.sky50,
  },
  modalCancelText: { fontSize: 15, lineHeight: 22, color: colors.primaryInk, fontWeight: "700" },
  modalSave: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.navyFill,
  },
  modalSaveOff: { opacity: 0.5 },
  modalSaveText: { color: "#fff", fontSize: 14, lineHeight: 22, fontWeight: "700" },
});
