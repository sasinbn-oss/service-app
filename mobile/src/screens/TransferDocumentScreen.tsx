import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { showAlert } from "../utils/alert";
import { openUrl } from "../utils/share";
import { colors, radius, shadow, spacing } from "../theme";
import { SparePart } from "../types";

/** หนึ่งบรรทัดในตารางของเอกสาร */
interface Line {
  /** คีย์ของ React เท่านั้น ไม่ได้ส่งไปเซิร์ฟเวอร์ */
  key: string;
  code: string;
  name: string;
  quantity: string;
  unit: string;
}

interface CreatedDocument {
  filename: string;
  path: string;
  title: string;
  unknownCodes: string[];
}

// จำคลังที่เลือกล่าสุดไว้ เพราะโดยมากคนเดิมจะโอนจากคลังเดิมซ้ำ ๆ
const LAST_ROUTE_KEY = "service-app/last-transfer-route";

/** ค่าที่ใช้ใน Picker เมื่อคลังปลายทางยังไม่มีในรายการ ให้พิมพ์เอง */
const CUSTOM = "__custom__";

/** คลังที่จำไว้อาจถูกถอดออกจากรายการไปแล้ว กรณีนั้นให้ตกไปอยู่ช่องพิมพ์เอง */
function restore(
  saved: string,
  list: string[],
  setChoice: (v: string) => void,
  setCustom: (v: string) => void
) {
  if (list.includes(saved)) {
    setChoice(saved);
  } else {
    setChoice(CUSTOM);
    setCustom(saved);
  }
}

/** ช่องเลือกคลัง พร้อมทางออกให้พิมพ์เองถ้าคลังยังไม่มีในรายการ */
function WarehouseField({
  label,
  testPlaceholder,
  warehouses,
  choice,
  custom,
  onChoice,
  onCustom,
}: {
  label: string;
  testPlaceholder: string;
  warehouses: string[];
  choice: string;
  custom: string;
  onChoice: (v: string) => void;
  onCustom: (v: string) => void;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.pickerWrapper}>
        <Picker
          selectedValue={choice}
          onValueChange={(v) => onChoice(String(v))}
          style={styles.picker}
        >
          <Picker.Item label="— เลือกคลัง —" value="" color={colors.textFaint} />
          {warehouses.map((w) => (
            <Picker.Item key={w} label={w} value={w} />
          ))}
          <Picker.Item label="อื่น ๆ (พิมพ์เอง)" value={CUSTOM} />
        </Picker>
      </View>
      {choice === CUSTOM ? (
        <TextInput
          style={styles.input}
          value={custom}
          onChangeText={onCustom}
          placeholder={testPlaceholder}
          placeholderTextColor={colors.textFaint}
        />
      ) : null}
    </>
  );
}

let nextKey = 0;
const makeLine = (partial: Partial<Line> = {}): Line => ({
  key: `line-${nextKey++}`,
  code: "",
  name: "",
  quantity: "",
  unit: "ตัว",
  ...partial,
});

export default function TransferDocumentScreen() {
  const [warehouses, setWarehouses] = useState<string[]>([]);
  // เก็บสิ่งที่เลือกใน Picker แยกจากข้อความที่พิมพ์เอง เพื่อให้สลับไปมาได้
  // โดยไม่ทำให้ค่าที่พิมพ์ค้างไว้หายไป
  const [fromChoice, setFromChoice] = useState("");
  const [fromCustom, setFromCustom] = useState("");
  const [toChoice, setToChoice] = useState("");
  const [toCustom, setToCustom] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([makeLine()]);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SparePart[]>([]);
  const [searching, setSearching] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedDocument | null>(null);

  const fromWarehouse = fromChoice === CUSTOM ? fromCustom : fromChoice;
  const toWarehouse = toChoice === CUSTOM ? toCustom : toChoice;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // ดึงรายชื่อคลังก่อน แล้วค่อยเติมค่าที่จำไว้ เพราะต้องรู้ก่อนว่าคลังที่จำไว้
      // ยังอยู่ในรายการหรือกลายเป็นคลังที่ต้องพิมพ์เองไปแล้ว
      let list: string[] = [];
      try {
        const res = await api.get<{ warehouses: string[] }>("/documents/warehouses");
        list = res.data.warehouses;
      } catch {
        // ดึงไม่ได้ก็ยังใช้งานต่อได้ด้วยตัวเลือก "พิมพ์เอง"
      }
      if (cancelled) return;
      setWarehouses(list);

      try {
        const raw = await AsyncStorage.getItem(LAST_ROUTE_KEY);
        if (!raw || cancelled) return;
        const saved = JSON.parse(raw) as { from?: string; to?: string };
        if (saved.from) restore(saved.from, list, setFromChoice, setFromCustom);
        if (saved.to) restore(saved.to, list, setToChoice, setToCustom);
      } catch {
        // ค่าที่จำไว้เสียก็แค่เริ่มจากช่องว่าง ไม่ต้องรบกวนผู้ใช้
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ค้นอะไหล่แบบหน่วงเวลา ไม่ยิงทุกตัวอักษรที่พิมพ์
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(() => {
      api
        .get<SparePart[]>("/spare-parts", { params: { search: term } })
        .then((res) => setResults(res.data.slice(0, 8)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setCreated(null);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length === 1 ? [makeLine()] : prev.filter((l) => l.key !== key)));
    setCreated(null);
  }

  function addFromSearch(part: SparePart) {
    setLines((prev) => {
      const blank = prev.find((l) => !l.code && !l.name);
      const filled = { code: part.partCode, name: part.name };
      // เติมลงบรรทัดว่างที่มีอยู่ก่อน จะได้ไม่เหลือบรรทัดเปล่าคาไว้
      return blank
        ? prev.map((l) => (l.key === blank.key ? { ...l, ...filled } : l))
        : [...prev, makeLine(filled)];
    });
    setSearch("");
    setResults([]);
    setCreated(null);
  }

  const filledLines = lines.filter((l) => l.name.trim() && Number(l.quantity) > 0);

  async function handleSubmit() {
    if (!fromWarehouse.trim() || !toWarehouse.trim()) {
      showAlert("ข้อมูลไม่ครบ", "กรุณาเลือกทั้งคลังต้นทางและคลังปลายทาง");
      return;
    }
    if (fromWarehouse.trim() === toWarehouse.trim()) {
      showAlert("คลังซ้ำกัน", "คลังต้นทางกับปลายทางเป็นคลังเดียวกัน กรุณาเลือกใหม่");
      return;
    }
    if (filledLines.length === 0) {
      showAlert("ยังไม่มีรายการ", "กรุณาใส่ชื่อรายการและจำนวนอย่างน้อย 1 รายการ");
      return;
    }
    // บรรทัดที่กรอกค้างไว้ครึ่ง ๆ กลาง ๆ จะหายไปเงียบ ๆ ถ้าไม่เตือน
    const halfDone = lines.filter(
      (l) => (l.name.trim() || l.code.trim()) && !(Number(l.quantity) > 0)
    );
    if (halfDone.length > 0) {
      showAlert(
        "มีรายการที่ยังไม่ได้ใส่จำนวน",
        `${halfDone.map((l) => l.name || l.code).join(", ")} จะไม่ถูกใส่ในเอกสาร`,
        [{ text: "ยกเลิก", style: "cancel" }, { text: "ออกเอกสารต่อ", onPress: submit }]
      );
      return;
    }
    submit();
  }

  async function submit() {
    setSubmitting(true);
    try {
      const res = await api.post<CreatedDocument>("/documents/transfer-request", {
        fromWarehouse: fromWarehouse.trim(),
        toWarehouse: toWarehouse.trim(),
        documentNo: documentNo.trim() || undefined,
        note: note.trim() || undefined,
        items: filledLines.map((l) => ({
          code: l.code.trim(),
          name: l.name.trim(),
          quantity: Number(l.quantity),
          unit: l.unit.trim() || undefined,
        })),
      });
      setCreated(res.data);
      AsyncStorage.setItem(
        LAST_ROUTE_KEY,
        JSON.stringify({ from: fromWarehouse.trim(), to: toWarehouse.trim() })
      ).catch(() => undefined);
    } catch (e) {
      showAlert("ออกเอกสารไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  function startNew() {
    setLines([makeLine()]);
    setDocumentNo("");
    setNote("");
    setCreated(null);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>คลังต้นทาง / ปลายทาง</Text>

          <WarehouseField
            label="ขอโอนจากคลังสินค้า"
            testPlaceholder="พิมพ์ชื่อคลังต้นทาง"
            warehouses={warehouses}
            choice={fromChoice}
            custom={fromCustom}
            onChoice={(v) => {
              setFromChoice(v);
              setCreated(null);
            }}
            onCustom={(v) => {
              setFromCustom(v);
              setCreated(null);
            }}
          />

          <WarehouseField
            label="ขอรับเข้าคลังสินค้า"
            testPlaceholder="พิมพ์ชื่อคลังปลายทาง"
            warehouses={warehouses}
            choice={toChoice}
            custom={toCustom}
            onChoice={(v) => {
              setToChoice(v);
              setCreated(null);
            }}
            onCustom={(v) => {
              setToCustom(v);
              setCreated(null);
            }}
          />

          <Text style={styles.label}>เลขที่เอกสาร (ไม่บังคับ)</Text>
          <TextInput
            style={styles.input}
            value={documentNo}
            onChangeText={setDocumentNo}
            placeholder="เว้นว่างไว้กรอกในเอกสารทีหลังก็ได้"
            placeholderTextColor={colors.textFaint}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>ค้นหาอะไหล่เพื่อเพิ่มรายการ</Text>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={colors.textFaint} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="พิมพ์รหัสหรือชื่ออะไหล่"
              placeholderTextColor={colors.textFaint}
            />
            {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </View>

          {results.map((part) => (
            <TouchableOpacity
              key={part.id}
              style={styles.result}
              activeOpacity={0.7}
              onPress={() => addFromSearch(part)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.resultName}>{part.name}</Text>
                <Text style={styles.resultCode}>
                  {part.partCode}
                  {part.brand ? ` · ${part.brand}` : ""}
                </Text>
              </View>
              <Ionicons name="add-circle" size={22} color={colors.primary} />
            </TouchableOpacity>
          ))}

          {search.trim().length >= 2 && !searching && results.length === 0 ? (
            <Text style={styles.noResult}>
              ไม่พบในฐานข้อมูล — พิมพ์รหัสและชื่อลงในรายการด้านล่างเองได้เลย
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>รายการที่ขอโอน</Text>

          {lines.map((line, index) => (
            <View key={line.key} style={styles.line}>
              <View style={styles.lineHeader}>
                <Text style={styles.lineNumber}>{index + 1}</Text>
                <TouchableOpacity onPress={() => removeLine(line.key)} style={styles.lineRemove}>
                  <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                </TouchableOpacity>
              </View>

              <View style={styles.lineRow}>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  value={line.code}
                  onChangeText={(v) => updateLine(line.key, { code: v })}
                  placeholder="รหัสสินค้า"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="characters"
                />
                <TextInput
                  style={[styles.input, styles.qtyInput]}
                  value={line.quantity}
                  onChangeText={(v) =>
                    updateLine(line.key, { quantity: v.replace(/[^0-9]/g, "") })
                  }
                  placeholder="จำนวน"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="number-pad"
                />
                <TextInput
                  style={[styles.input, styles.unitInput]}
                  value={line.unit}
                  onChangeText={(v) => updateLine(line.key, { unit: v })}
                  placeholder="หน่วย"
                  placeholderTextColor={colors.textFaint}
                />
              </View>

              <TextInput
                style={styles.input}
                value={line.name}
                onChangeText={(v) => updateLine(line.key, { name: v })}
                placeholder="ชื่อรายการ"
                placeholderTextColor={colors.textFaint}
              />
            </View>
          ))}

          <TouchableOpacity
            style={styles.addLine}
            activeOpacity={0.7}
            onPress={() => setLines((prev) => [...prev, makeLine()])}
          >
            <Ionicons name="add" size={18} color={colors.primary} />
            <Text style={styles.addLineText}>เพิ่มบรรทัด</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>หมายเหตุท้ายเอกสาร (ไม่บังคับ)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={note}
            onChangeText={setNote}
            placeholder="เช่น ขอรับภายในสัปดาห์นี้"
            placeholderTextColor={colors.textFaint}
            multiline
          />
        </View>

        <TouchableOpacity
          style={[styles.submit, submitting && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="document-text" size={18} color="#fff" />
              <Text style={styles.submitText}>ออกเอกสาร Word</Text>
            </>
          )}
        </TouchableOpacity>

        {created ? (
          <View style={styles.doneCard}>
            <TouchableOpacity
              style={styles.download}
              activeOpacity={0.7}
              onPress={() => openUrl(resolveImageUrl(created.path)!)}
            >
              <View style={styles.docIcon}>
                <Ionicons name="document-text" size={22} color="#2563eb" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.docTitle}>{created.title}</Text>
                <Text style={styles.docName}>{created.filename}</Text>
              </View>
              <Ionicons name="download-outline" size={20} color={colors.primary} />
            </TouchableOpacity>

            {created.unknownCodes.length > 0 ? (
              <View style={styles.warn}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
                <Text style={styles.warnText}>
                  รหัสที่ยังไม่มีในฐานข้อมูล: {created.unknownCodes.join(", ")} —
                  เอกสารใช้ชื่อที่พิมพ์ไว้ กรุณาตรวจกับต้นฉบับก่อนส่งอนุมัติ
                </Text>
              </View>
            ) : null}

            <Text style={styles.expiry}>ลิงก์ดาวน์โหลดใช้ได้ 2 ชั่วโมง</Text>

            <TouchableOpacity style={styles.newDoc} onPress={startNew}>
              <Ionicons name="refresh" size={16} color={colors.primary} />
              <Text style={styles.newDocText}>ออกเอกสารใบใหม่</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 26,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  // ตัวอักษรไทยมีสระบนและวรรณยุกต์ lineHeight ต้องสูงกว่า fontSize ชัดเจน
  label: { fontSize: 13, lineHeight: 22, color: colors.textMuted, marginTop: spacing.md },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    lineHeight: 24,
    color: colors.text,
    marginTop: 4,
  },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  pickerWrapper: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    marginTop: 4,
    // ซ่อนมุมของ <select> บนเว็บไม่ให้ล้นออกนอกกรอบที่โค้งไว้
    overflow: "hidden",
  },
  picker: {
    // เฉพาะเว็บ: react-native-web แปลง Picker เป็น <select> ซึ่งมาพร้อมเส้นขอบ
    // และช่องไฟของเบราว์เซอร์เอง ทำให้เตี้ยและหน้าตาไม่เข้ากับช่องกรอกอื่น
    // บน iOS/Android ต้องไม่ใส่คีย์พวกนี้ ไม่งั้นจะไปทับขนาดของวงล้อเลือกค่า
    ...(Platform.OS === "web"
      ? {
          borderWidth: 0,
          backgroundColor: "transparent",
          color: colors.text,
          fontSize: 15,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
        }
      : null),
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: spacing.md, fontSize: 15, lineHeight: 24, color: colors.text },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultName: { fontSize: 14, lineHeight: 22, color: colors.text, fontWeight: "600" },
  resultCode: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  noResult: { fontSize: 12, lineHeight: 20, color: colors.textMuted, marginTop: spacing.md },

  line: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  lineHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lineNumber: { fontSize: 13, lineHeight: 22, fontWeight: "700", color: colors.textMuted },
  lineRemove: { padding: spacing.xs },
  lineRow: { flexDirection: "row", gap: spacing.sm },
  // minWidth: 0 จำเป็นบนเว็บ — react-native-web แปลง TextInput เป็น <input>
  // ซึ่งมีความกว้างขั้นต่ำตามธรรมชาติของตัวเอง ถ้าไม่สั่งทับ ช่องทั้งสามจะไม่ยอมหด
  // แล้วช่อง "หน่วย" จะทะลุออกนอกจอมือถือ
  codeInput: { flex: 2, minWidth: 0 },
  qtyInput: { flex: 1, minWidth: 0, textAlign: "center" },
  unitInput: { flex: 1, minWidth: 0, textAlign: "center" },

  addLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
  },
  addLineText: { fontSize: 14, lineHeight: 22, color: colors.primary, fontWeight: "600" },

  submit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
  },
  submitDisabled: { backgroundColor: colors.borderStrong },
  submitText: { color: "#fff", fontSize: 16, lineHeight: 26, fontWeight: "700" },

  doneCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
    ...shadow.card,
  },
  download: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: radius.md,
    padding: spacing.md,
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  docTitle: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.text },
  docName: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  warn: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  warnText: { flex: 1, fontSize: 12, lineHeight: 20, color: colors.text },
  expiry: { fontSize: 12, lineHeight: 20, color: colors.textFaint, marginTop: spacing.sm },
  newDoc: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  newDocText: { fontSize: 14, lineHeight: 22, color: colors.primary, fontWeight: "600" },
});
