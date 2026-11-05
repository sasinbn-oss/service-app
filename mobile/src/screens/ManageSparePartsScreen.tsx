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
import { api, apiErrorMessage, partImageUri } from "../api/client";
import { colors, headingFont, radius, shadow, spacing } from "../theme";
import { SparePart } from "../types";
import SparePartImportModal, { Batch, ImportReportModal } from "../components/SparePartImportModal";
import ImportHistoryButton from "../components/ImportHistoryButton";
import { BRAND_FILES, OUTSIDE_PART } from "../utils/brandFile";

const emptyForm = { partCode: "", name: "", brand: "", category: "", partNo: "", description: "" };
type Form = typeof emptyForm;
type PickedImage = { uri: string; name: string; type: string };

const ALL = "ทั้งหมด";
/**
 * อะไหล่ที่ไม่อยู่ในไฟล์ยี่ห้อไหนเลย = อะไหล่นอกเครื่อง (เจ้าของงานเลือก 4 พ.ย. 69 — เดิมปุ่มชื่อ "ไม่มียี่ห้อ" และแปลว่าช่างเลือกไม่ได้)
 * ตอนนี้ทุกเครื่องเลือกได้ ปุ่มนี้จึงไม่ใช่ "ของค้างที่ต้องแก้" แล้ว — แค่ไว้ดูว่าตัวไหนเป็นของนอกเครื่อง หรือหาตัวที่ลืมติ๊กไฟล์
 * ความหมายคือ "ไม่อยู่ในไฟล์ไหน" ไม่ใช่ช่องยี่ห้อสินค้าว่าง
 */
const OUTSIDE = OUTSIDE_PART;

// รูปอะไหล่เสิร์ฟจาก URL เดิมทุกครั้ง (/spare-parts/:id/image) — ต่อท้ายด้วยเวลาที่แก้ล่าสุด
// ไม่งั้นเบราว์เซอร์โชว์รูปเก่าจากแคชหลังเปลี่ยนรูปจนกว่าจะรีเฟรชหน้า
const thumbUri = (part: SparePart) => partImageUri(part) ?? null;

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
  // กรองตามไฟล์ยี่ห้อ (ไม่ใช่ข้อความช่องยี่ห้อสินค้า) — ไฟล์คือสิ่งที่ตัดสินว่าช่างเลือกได้กับเครื่องไหน (เจ้าของงาน 31 ต.ค. 69)
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

  /**
   * ปุ่มกรอง = ไฟล์ทั้ง 6 + "อะไหล่นอกเครื่อง" พร้อมจำนวน — รหัสที่อยู่สองไฟล์นับทั้งสองปุ่ม (ช่างเลือกได้จากทั้งสองไฟล์จริง)
   * อะไหล่จากเซิร์ฟเวอร์รุ่นก่อน (ไม่มี brandFiles) ไม่นับเข้าปุ่มไหน — ไม่รู้ ดีกว่านับว่าเป็นอะไหล่นอกเครื่องผิด ๆ
   */
  const fileChips = useMemo(() => {
    const count = (f: string) =>
      parts.filter((p) => (f === OUTSIDE ? p.brandFiles?.length === 0 : !!p.brandFiles?.includes(f))).length;
    return [
      { key: ALL, n: parts.length },
      ...BRAND_FILES.map((f) => ({ key: f as string, n: count(f) })),
      { key: OUTSIDE, n: count(OUTSIDE) },
    ];
  }, [parts]);

  const q = query.trim();
  const shown = useMemo(() => {
    const needle = q.toLowerCase();
    return parts.filter(
      (p) =>
        (brand === ALL ||
          (brand === OUTSIDE ? p.brandFiles?.length === 0 : !!p.brandFiles?.includes(brand))) &&
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
        {/* ทุกรอบที่อัปเดตจากไฟล์ (ย้อนหลังถึงรอบแรก) อยู่ในประวัติการนำเข้า — แถบข้างล่างบอกแค่รอบล่าสุด */}
        <ImportHistoryButton kind="parts" />
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
            {latest.totals.incomplete ? <Text style={{ color: colors.dangerInk, fontWeight: "700" }}> · อัปเดตไม่ครบ {latest.totals.incomplete} ไฟล์</Text> : null}
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

      {parts.length > 0 ? (
        <View style={styles.chips}>
          {fileChips.map(({ key, n }) => (
            <TouchableOpacity
              key={key}
              // ไม่มีขอบเหลืองแล้ว — อะไหล่นอกเครื่องไม่ใช่ของค้างที่ต้องแก้ (เจ้าของงานเลือก 4 พ.ย. 69)
              style={[styles.chip, brand === key && styles.chipOn]}
              onPress={() => setBrand(key)}
              accessibilityLabel={`กรอง ${key}`}
              accessibilityState={{ selected: brand === key }}
              // เว็บไม่แปลง accessibilityState เป็น aria-selected (เหมือน FilterBar) — ใส่เอง
              aria-selected={brand === key}
            >
              <Text style={[styles.chipText, brand === key && styles.chipTextOn]}>
                {key} <Text style={styles.chipCount}>{n}</Text>
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {brand === OUTSIDE && shown.length > 0 ? (
        <Text style={styles.outsideHint}>
          อะไหล่ที่ไม่อยู่ในไฟล์ยี่ห้อไหน = อะไหล่นอกเครื่อง ช่าง หัวหน้าภาค แอดมิน เลือกได้ทุกใบงาน · ถ้าเป็นอะไหล่ของยี่ห้อไหน กด “แก้ไข” แล้วติ๊กไฟล์
        </Text>
      ) : null}

      {loading ? (
        <Spinner page color={colors.primary} />
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
                  {item.brandFiles ? (
                    item.brandFiles.length ? (
                      <Text style={styles.fileMeta}>ไฟล์ {item.brandFiles.join(" · ")}</Text>
                    ) : (
                      <Text style={styles.fileMetaOutside}>อะไหล่นอกเครื่อง · ทุกเครื่องเลือกได้</Text>
                    )
                  ) : null}
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
  /**
   * ไฟล์ยี่ห้อของอะไหล่ (§5.10) — null = เซิร์ฟเวอร์รุ่นก่อนไม่ได้บอก: ไม่ส่งไปเลยจนกว่าแอดมินจะแตะปุ่ม (ไม่งั้นล้างไฟล์ที่มีอยู่ทิ้ง)
   * อะไหล่ใหม่เริ่มที่ไม่มีไฟล์ และยังไม่ได้เลือกอะไร — ต้องติ๊กไฟล์ หรือ "อะไหล่นอกเครื่อง" ก่อนบันทึก (ข้างล่าง)
   */
  const [files, setFiles] = useState<string[] | null>(part ? part.brandFiles ?? null : []);
  /**
   * "อะไหล่นอกเครื่อง (ไม่มียี่ห้อ)" — เลือกคู่กับไฟล์ยี่ห้ออย่างใดอย่างหนึ่ง (เจ้าของงานเลือก 4 พ.ย. 69)
   * ทำไมต้องกดเอง: ไม่มีไฟล์ = ทุกเครื่องเลือกได้ อะไหล่ Huebsch ที่ลืมติ๊กไฟล์จะหลุดไปให้เครื่อง Maytag เลือกเงียบ ๆ
   * อะไหล่เดิมที่ไม่อยู่ในไฟล์ไหนติดไว้ตั้งแต่เปิดฟอร์ม (เป็นอะไหล่นอกเครื่องอยู่แล้ว) · อะไหล่ใหม่ยังไม่ติดอะไร
   */
  const [outside, setOutside] = useState(!!part && part.brandFiles?.length === 0);
  /**
   * แอดมินแตะปุ่มไฟล์แล้วหรือยัง — ไม่แตะ = ไม่ส่ง brandFiles (เซิร์ฟเวอร์คงไฟล์เดิม)
   * รายการในฟอร์มมาจากหน้ารายการ ซึ่งอาจเก่ากว่าเซิร์ฟเวอร์ (เปิดจากแคช หรือมีคนอัปโหลดไฟล์ยี่ห้อระหว่างนั้น)
   * ส่งรายการเก่าไปทั้งก้อน = ลบไฟล์ที่อัปโหลดเพิ่งเพิ่มทิ้งเงียบ ๆ ทั้งที่แอดมินแค่แก้ Part No. (D20: เอาออกได้ทางเดียวคือติ๊กออกเอง)
   */
  const [filesTouched, setFilesTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const toggleFile = (f: string) => {
    setFilesTouched(true);
    // ติ๊กไฟล์ยี่ห้อ = เป็นอะไหล่ของยี่ห้อนั้น — ช่องอะไหล่นอกเครื่องหลุดเอง (ตัวอย่างที่อนุมัติ)
    setOutside(false);
    setFiles((cur) => {
      const list = cur ?? [];
      return list.includes(f) ? list.filter((x) => x !== f) : BRAND_FILES.filter((x) => x === f || list.includes(x));
    });
  };
  // กลับกัน: เลือกอะไหล่นอกเครื่อง = ไม่อยู่ในไฟล์ไหน ไฟล์ที่ติ๊กไว้หลุดหมด
  const toggleOutside = () => {
    setFilesTouched(true);
    const next = !outside;
    setOutside(next);
    if (next) setFiles([]);
  };

  /** ไฟล์ล่าสุดของอะไหล่จากเซิร์ฟเวอร์ — อ่านไม่ได้ใช้รายการตอนเปิดฟอร์ม (บันทึกเองจะบอกข้อผิดพลาดถ้าเซิร์ฟเวอร์มีปัญหาจริง) */
  async function latestFiles(id: number, start: string[]): Promise<string[]> {
    try {
      return (await api.get<SparePart>(`/spare-parts/${id}`, { loadingText: false })).data.brandFiles ?? start;
    } catch {
      return start;
    }
  }

  /**
   * ไฟล์ที่จะส่งตอนแก้อะไหล่เดิม — เอาเฉพาะที่แอดมินติ๊กเพิ่ม/ติ๊กออก ไปลงบนรายการล่าสุดของเซิร์ฟเวอร์
   * ไม่ใช่ส่งรายการบนจอทั้งก้อน: ไฟล์อื่นที่อัปโหลดเพิ่มให้ระหว่างที่ฟอร์มเปิดอยู่ต้องอยู่ต่อ (D20)
   */
  async function filesToSend(id: number, start: string[], now: string[]): Promise<string[]> {
    const added = now.filter((f) => !start.includes(f));
    const removed = start.filter((f) => !now.includes(f));
    const latest = await latestFiles(id, start);
    return BRAND_FILES.filter((f) => (latest.includes(f) || added.includes(f)) && !removed.includes(f));
  }
  // เลือกแล้วอย่างใดอย่างหนึ่ง — เซิร์ฟเวอร์รุ่นก่อนที่ไม่บอกไฟล์ (files = null) ไม่กัน เพราะฟอร์มไม่ส่งไฟล์อยู่แล้ว
  const chosen = files === null || outside || files.length > 0;
  const ready = !!form.partCode.trim() && !!form.name.trim() && chosen;
  const preview = image?.uri ?? (part ? thumbUri(part) : null);

  async function submit() {
    if (!ready) return;
    setSaving(true);
    // อะไหล่ใหม่ส่งเสมอ (เริ่มที่ [] — ไม่มีไฟล์เดิมให้ลบ) · อะไหล่เดิมส่งเฉพาะเมื่อแตะปุ่มไฟล์
    // ไม่มีไฟล์ต้องมาพร้อม outsideMachine — เซิร์ฟเวอร์ไม่รับอะไหล่ที่ไม่มีไฟล์โดยไม่บอกว่าตั้งใจ (กันลืมติ๊ก)
    let brandFiles: string[] | null = null;
    if (!part) brandFiles = outside ? [] : files ?? [];
    else if (filesTouched && files && outside) {
      // D20: เลือกนอกเครื่อง = ล้างไฟล์ทั้งหมด — ไฟล์ที่การอัปโหลดเพิ่งเพิ่มระหว่างที่ฟอร์มเปิดอยู่ แอดมินยังไม่เห็น ห้ามลบเงียบ ๆ
      const start = part.brandFiles ?? [];
      const fresh = (await latestFiles(part.id, start)).filter((f) => !start.includes(f));
      if (fresh.length) {
        setSaving(false);
        showAlert(
          "ไฟล์ยี่ห้อเพิ่งเปลี่ยน",
          `${part.partCode} เพิ่งถูกเพิ่มเข้าไฟล์ ${fresh.join(", ")} (อัปโหลดไฟล์ Excel) ระหว่างที่ฟอร์มนี้เปิดอยู่ — ปิดฟอร์มแล้วเปิดใหม่ก่อนเปลี่ยนเป็นอะไหล่นอกเครื่อง`
        );
        return;
      }
      brandFiles = [];
    } else if (filesTouched && files) brandFiles = await filesToSend(part.id, part.brandFiles ?? [], files);
    const payload = {
      partCode: form.partCode.trim(),
      name: form.name.trim(),
      brand: form.brand.trim() || undefined,
      category: form.category.trim() || undefined,
      // ล้างช่องแล้วบันทึก = ลบ Part No. (ส่ง "" ไม่ใช่ไม่ส่ง ไม่งั้นค่าเดิมค้าง)
      partNo: part ? form.partNo.trim() : form.partNo.trim() || undefined,
      description: form.description.trim() || undefined,
      // รายการนี้คือไฟล์ทั้งหมดของอะไหล่ตัวนี้ (เซิร์ฟเวอร์ทำให้ตรงเป๊ะ ไฟล์ที่ไม่อยู่ในรายการถูกเอาออก) — จึงส่งเฉพาะเมื่อแอดมินเปลี่ยน
      ...(brandFiles ? { brandFiles } : {}),
      ...(brandFiles && outside ? { outsideMachine: true } : {}),
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
      {/*
        อยู่ในไฟล์ยี่ห้อ (เจ้าของงาน 31 ต.ค. 69) — ตัวนี้ตัดสินว่าช่างเลือกอะไหล่ได้กับเครื่องยี่ห้อไหน ไม่ใช่ช่อง "ยี่ห้อ" ด้านบน
        เลือกได้หลายไฟล์ (รหัสเดียวอยู่หลายไฟล์ได้) · ปุ่มธรรมดาไม่ใช่ Dropdown (ฟอร์มนี้เป็น Modal อยู่แล้ว)
        ที่นี่เป็นที่เดียวที่เอาไฟล์ออกได้ — อัปโหลด Excel เพิ่มไฟล์ให้อย่างเดียว ไม่เอาออก (ค่าตั้งต้น D20)
        ของนอกสโตร์ไม่ขึ้นในหน้านี้อยู่แล้ว (GET /spare-parts ตัดออก) — ทุกตัวที่แก้ที่นี่เป็นของในสโตร์
      */}
      <Text style={styles.label}>ไฟล์ยี่ห้อ *</Text>
      <View style={styles.chips}>
        {BRAND_FILES.map((f) => {
          const on = !!files?.includes(f);
          return (
            <TouchableOpacity
              key={f}
              style={[styles.fileChip, on && styles.chipOn]}
              onPress={() => toggleFile(f)}
              disabled={saving}
              accessibilityLabel={`ไฟล์ ${f}`}
              accessibilityState={{ selected: on }}
              // เว็บไม่แปลง accessibilityState เป็น aria-selected (เหมือน FilterBar) — ใส่เอง
              // ไม่งั้นแอดมินที่ใช้โปรแกรมอ่านจอ และเทสต์ ไม่รู้ว่าไฟล์ไหนติ๊กอยู่
              aria-selected={on}
            >
              {on ? <Ionicons name="checkmark" size={15} color={colors.primaryInk} /> : null}
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{f}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={styles.chipSep} />
        <TouchableOpacity
          style={[styles.fileChip, outside && styles.outsideChipOn]}
          onPress={toggleOutside}
          disabled={saving}
          accessibilityLabel="อะไหล่นอกเครื่อง (ไม่มียี่ห้อ)"
          accessibilityState={{ selected: outside }}
          // เว็บไม่แปลง accessibilityState เป็น aria-selected — ใส่เองเหมือนชิปไฟล์ (เทสต์อ่านว่าติดอยู่ไหม)
          aria-selected={outside}
        >
          {outside ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
          <Text style={[styles.chipText, outside && styles.outsideChipTextOn]}>อะไหล่นอกเครื่อง (ไม่มียี่ห้อ)</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.fileHint}>
        ต้องเลือกอย่างใดอย่างหนึ่ง — ติ๊กไฟล์ยี่ห้อ = เป็นอะไหล่ของยี่ห้อนั้น ช่องอะไหล่นอกเครื่องหลุดเอง · ไม่เลือกอะไรบันทึกไม่ได้
        (กันอะไหล่ยี่ห้อที่ลืมติ๊กไฟล์ หลุดไปให้ทุกเครื่องเลือก)
      </Text>
      <Text style={styles.fileHint}>
        ช่างเลือกได้: ไฟล์ยี่ห้อของเครื่อง · ของใช้ร่วม (ไฟล์ Other) · อะไหล่นอกเครื่อง (ทุกเครื่อง ไม่ต้องยืนยัน) · อัปโหลดไฟล์ Excel
        ยี่ห้อที่มีรหัสนี้ = เข้าไฟล์ยี่ห้อนั้น ไม่เป็นอะไหล่นอกเครื่องแล้ว (อัปโหลดเพิ่มไฟล์อย่างเดียว ไม่เอาออก)
      </Text>
      {!chosen ? (
        <Text style={styles.fileWarn}>ยังไม่ได้เลือก — ติ๊กไฟล์ยี่ห้อ หรือ “อะไหล่นอกเครื่อง (ไม่มียี่ห้อ)” ก่อนบันทึก</Text>
      ) : null}
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
  chipCount: { fontWeight: "700" },
  // อะไหล่นอกเครื่อง — เขียวอมฟ้าชุดเดียวกับป้าย "นอกเครื่อง" ในช่องเลือกอะไหล่ (ตัวอย่าง 4 พ.ย. 69) ไม่ใช่แดง/เหลือง: ไม่ใช่ปัญหา
  outsideHint: { fontSize: 13, lineHeight: 20, color: colors.service },
  fileMeta: { fontSize: 12, lineHeight: 18, color: colors.primaryInk, marginTop: 2 },
  fileMetaOutside: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.service, marginTop: 2 },
  fileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 14,
  },
  fileHint: { fontSize: 12, lineHeight: 18, color: colors.textMuted, marginTop: 4 },
  // เส้นคั่นไฟล์ยี่ห้อกับ "อะไหล่นอกเครื่อง" — สองฝั่งเลือกได้ฝั่งเดียว (ตัวอย่างที่อนุมัติ)
  chipSep: { width: 1, height: 28, alignSelf: "center", backgroundColor: colors.borderStrong, marginHorizontal: 4 },
  outsideChipOn: { backgroundColor: colors.service, borderColor: colors.service },
  outsideChipTextOn: { color: "#fff", fontWeight: "700" },
  fileWarn: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.warningInk,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
  },
  noMatch: { fontSize: 14, color: colors.textMuted, textAlign: "center", paddingVertical: spacing.xl },
  mark: { backgroundColor: colors.warningBorder },
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
