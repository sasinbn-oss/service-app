/**
 * เปิดใบงานใหม่
 *
 * ใช้สองทาง — เปิดเปล่าจากปุ่ม "เพิ่มใบงาน" หรือถูกส่งมาจากกระดานพร้อมรหัสเคส
 * ถ้ามีรหัสเคสติดมา สาขากับเครื่องมาจากเคสอยู่แล้ว จึงไม่ต้องถามซ้ำ
 */
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import {
  MAX_ATTACHMENTS,
  PickedAttachment,
  pickImageAttachment,
  pickVideoAttachment,
  uploadAttachment,
} from "../utils/attachments";
import { HomeStackParamList } from "../navigation/types";
import { colors, radius, shadow, spacing } from "../theme";

type Props = NativeStackScreenProps<HomeStackParamList, "WorkOrderForm">;

interface Option {
  value: string;
  label: string;
  hint?: string;
}
interface BranchOption {
  id: number;
  code: string;
  name: string;
  region: string | null;
}

export default function WorkOrderFormScreen({ navigation, route }: Props) {
  const outageId = route.params?.outageId ?? null;
  const fromBoard = outageId !== null;

  const [priorities, setPriorities] = useState<Option[]>([]);
  const [jobTypes, setJobTypes] = useState<Option[]>([]);
  const [jobType, setJobType] = useState("CM");

  const [branchCode, setBranchCode] = useState(route.params?.branchCode ?? "");
  // เก็บชื่อสาขาไว้ด้วย ไม่ใช่แค่รหัส — คนจำสาขาจากชื่อ ไม่ได้จำจากรหัส
  // เห็นแต่ "C0006" แล้วไม่มีทางรู้ว่าเลือกถูกใบหรือเปล่าจนกว่าจะเปิดใบงานแล้ว
  const [branchName, setBranchName] = useState<string | null>(null);
  const [branchResults, setBranchResults] = useState<BranchOption[]>([]);
  const [branchTerm, setBranchTerm] = useState("");
  const [machineCode, setMachineCode] = useState("");
  const [title, setTitle] = useState(route.params?.presetTitle ?? "");
  const [priority, setPriority] = useState("NORMAL");
  const [symptom, setSymptom] = useState("");

  const [branchRegion, setBranchRegion] = useState<string | null>(null);
  const [files, setFiles] = useState<PickedAttachment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // วงเล็บไว้ ไม่งั้นต่อกับคำว่า "หัวหน้าภาค" แล้วกลายเป็น "หัวหน้าภาคภาคใต้"
  const regionHint = branchRegion ? ` (ภาค${branchRegion})` : "";

  useEffect(() => {
    api
      .get<{ priorities: Option[]; jobTypes: Option[] }>("/work-orders/options")
      .then((res) => {
        setPriorities(res.data.priorities);
        setJobTypes(res.data.jobTypes);
      })
      .catch(() => setError("โหลดตัวเลือกไม่สำเร็จ"));
  }, []);

  /**
   * เปิดจากกระดาน — รหัสสาขาติดมาแต่ชื่อไม่ได้ติดมาด้วย
   *
   * ตามชื่อมาให้ เพราะข้อความ "สาขามาจากเคสให้อัตโนมัติ" ไม่ได้บอกว่าสาขาไหน
   * คนที่กดเปิดใบงานจากกระดานสิบแถวรวดจะไม่รู้เลยว่ากำลังเปิดให้สาขาอะไร
   */
  useEffect(() => {
    const code = route.params?.branchCode;
    if (!code) return;
    api
      .get<BranchOption[]>("/branches", { params: { search: code } })
      .then((res) => {
        const match = res.data.find((b) => b.code === code);
        if (match) {
          setBranchName(match.name);
          setBranchRegion(match.region ?? null);
        }
      })
      .catch(() => undefined);
  }, [route.params?.branchCode]);

  // ค้นสาขาแบบหน่วงไว้ เหมือนตัวเลือกอะไหล่ ไม่งั้นพิมพ์ตัวเดียวยิงหลายรอบ
  useEffect(() => {
    const keyword = branchTerm.trim();
    if (!keyword || fromBoard) {
      setBranchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<BranchOption[]>("/branches", { params: { search: keyword } })
        .then((res) => setBranchResults(res.data.slice(0, 8)))
        .catch(() => setBranchResults([]));
    }, 350);
    return () => clearTimeout(timer);
  }, [branchTerm, fromBoard]);

  async function submit() {
    if (!title.trim()) {
      setError("ต้องระบุเรื่องที่ให้ไปทำ");
      return;
    }
    if (!fromBoard && !branchCode.trim()) {
      setError("ต้องเลือกสาขา");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // ส่งเฉพาะสิ่งที่ขั้นนี้รู้ อะไหล่ ช่าง และวันนัดเป็นของขั้นถัดไป
      const body = {
        jobType,
        title: title.trim(),
        priority,
        symptom: symptom.trim() || null,
      };
      const res = fromBoard
        ? await api.post(`/work-orders/from-outage/${outageId}`, body)
        : await api.post("/work-orders", {
            ...body,
            branchCode: branchCode.trim(),
            machineCode: machineCode.trim() || undefined,
          });

      /**
       * ไฟล์ส่งตามหลังใบงาน ไม่ได้ส่งไปพร้อมกัน
       *
       * เพราะไฟล์ต้องผูกกับใบงาน และใบงานยังไม่มีเลขจนกว่าจะบันทึกเสร็จ
       * ผลคือถ้าส่งไฟล์ไม่ผ่าน ใบงานยังถูกเปิดไปแล้ว — ซึ่งถูกต้องกว่าการ
       * ทิ้งทั้งใบเพราะรูปใบเดียวส่งไม่ขึ้น คนกรอกจะได้ไม่ต้องพิมพ์ใหม่ทั้งหมด
       * บอกให้ชัดว่ารูปไหนไม่ขึ้น แล้วให้ไปแนบซ้ำในใบงานได้
       */
      const failed: string[] = [];
      for (const [i, file] of files.entries()) {
        setBusy(`กำลังส่งไฟล์ ${i + 1}/${files.length}`);
        try {
          await uploadAttachment(res.data.id, file);
        } catch {
          failed.push(file.name);
        }
      }

      showAlert(
        "เปิดใบงานแล้ว",
        failed.length === 0
          ? `${res.data.code} · ${res.data.title}`
          : `${res.data.code} · ${res.data.title}\n\nแต่ส่งไฟล์ไม่สำเร็จ ${failed.length} ไฟล์ — แนบใหม่ได้ในใบงาน`
      );
      navigation.replace("WorkOrderDetail", { id: res.data.id });
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
      setBusy(null);
    }
  }

  async function addFile(
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | null>
  ) {
    if (files.length >= MAX_ATTACHMENTS) {
      showAlert("แนบได้ไม่เกิน " + MAX_ATTACHMENTS + " ไฟล์", "ลบไฟล์ที่ไม่ต้องการออกก่อน");
      return;
    }
    setBusy("กำลังเตรียมไฟล์");
    try {
      const file = await pick(setBusy);
      if (file) setFiles((current) => [...current, file]);
    } catch (e) {
      showAlert("เตรียมไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        {fromBoard ? (
          <View style={styles.fromBoard}>
            <Ionicons name="link-outline" size={16} color={colors.primary} />
            <Text style={styles.fromBoardText}>
              เปิดจากเคสบนกระดาน สาขาและเครื่องมาจากเคสให้อัตโนมัติ
              {branchCode ? `\n${branchCode}${branchName ? ` · ${branchName}` : ""}` : ""}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.label}>สาขา</Text>
            {branchCode ? (
              <View style={styles.chosen}>
                <View style={styles.chosenBody}>
                  <Text style={styles.chosenText}>{branchCode}</Text>
                  {branchName ? (
                    <Text style={styles.chosenName} numberOfLines={2}>
                      {branchName}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setBranchCode("");
                    setBranchName(null);
                    setBranchRegion(null);
                    setBranchTerm("");
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={15} color={colors.textFaint} />
                  <TextInput
                    style={styles.searchInput}
                    value={branchTerm}
                    onChangeText={setBranchTerm}
                    placeholder="ค้นรหัสหรือชื่อสาขา"
                    placeholderTextColor={colors.textFaint}
                    accessibilityLabel="ค้นหาสาขา"
                  />
                </View>
                {branchResults.length > 0 ? (
                  <View style={styles.results}>
                    {branchResults.map((b) => (
                      <TouchableOpacity
                        key={b.id}
                        style={styles.result}
                        onPress={() => {
                          setBranchCode(b.code);
                          setBranchName(b.name);
                          setBranchRegion(b.region ?? null);
                          setBranchResults([]);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.resultCode}>{b.code}</Text>
                        <Text style={styles.resultName} numberOfLines={1}>
                          {b.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </>
            )}

            <Text style={styles.label}>หมายเลขเครื่อง</Text>
            <TextInput
              style={styles.input}
              value={machineCode}
              onChangeText={setMachineCode}
              placeholder="เช่น W3 หรือ D12 — เว้นว่างถ้าเป็นงานทั้งสาขา"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="characters"
              accessibilityLabel="หมายเลขเครื่อง"
            />
          </>
        )}

        <Text style={styles.label}>เรื่องที่ให้ไปทำ</Text>
        <View style={styles.options}>
          {jobTypes.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.option, jobType === t.value && styles.optionOn]}
              onPress={() => setJobType(t.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionText, jobType === t.value && styles.optionTextOn]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.jobHint}>{jobTypes.find((t) => t.value === jobType)?.hint ?? ""}</Text>

        <Text style={styles.label}>หัวข้องาน</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="สรุปสั้นๆ ว่าให้ไปทำอะไร"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="หัวข้องาน"
        />

        <Text style={styles.label}>อาการที่พบ</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={symptom}
          onChangeText={setSymptom}
          placeholder="เช่น ประตูไม่ล็อก / บอร์ดควบคุมไหม้"
          placeholderTextColor={colors.textFaint}
          multiline
          numberOfLines={2}
          accessibilityLabel="อาการที่พบ"
        />

        <Text style={styles.label}>ความเร่งด่วน</Text>
        <View style={styles.options}>
          {priorities.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[styles.option, priority === p.value && styles.optionOn]}
              onPress={() => setPriority(p.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionText, priority === p.value && styles.optionTextOn]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/*
          รูปหน้างานแนบได้ตั้งแต่ตอนเปิด ไม่ต้องรอเปิดใบงานเสร็จแล้วค่อยเข้าไปแนบ
          เพราะคนที่เปิดใบงานมักยืนอยู่หน้าเครื่องพอดี ถ้าให้ไปแนบทีหลัง
          กว่าจะกลับมาก็ออกจากร้านแล้ว แล้วรูปนั้นก็ไม่เคยถูกแนบ

          ไฟล์ยังไม่ถูกส่งตอนนี้ รอจนใบงานถูกบันทึกและได้เลขก่อน
        */}
        <Text style={styles.label}>รูป / วิดีโอหน้างาน (ไม่บังคับ)</Text>
        {files.length > 0 ? (
          <View style={styles.files}>
            {files.map((file, i) => (
              <View key={`${file.name}-${i}`} style={styles.file}>
                {file.thumbnailUri ? (
                  <Image source={{ uri: file.thumbnailUri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbBlank]}>
                    <Ionicons
                      name={file.kind === "VIDEO" ? "videocam-outline" : "image-outline"}
                      size={24}
                      color={colors.textFaint}
                    />
                  </View>
                )}
                {file.kind === "VIDEO" ? (
                  <View style={styles.playBadge}>
                    <Ionicons name="play" size={12} color="#fff" />
                  </View>
                ) : null}
                <TouchableOpacity
                  style={styles.removeFile}
                  onPress={() => setFiles((c) => c.filter((_, n) => n !== i))}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={13} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        {busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.busyText}>{busy}…</Text>
          </View>
        ) : (
          <View style={styles.fileButtons}>
            {/* กล้องเฉพาะบนมือถือ — คนที่เปิดจากคอมพิวเตอร์คือแอดมินที่นั่งโต๊ะ */}
            {Platform.OS !== "web" ? (
              <TouchableOpacity
                style={styles.fileButton}
                onPress={() => addFile((stage) => pickImageAttachment(true, stage))}
                activeOpacity={0.8}
              >
                <Ionicons name="camera-outline" size={16} color={colors.primary} />
                <Text style={styles.fileButtonText}>ถ่ายรูป</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.fileButton}
              onPress={() => addFile((stage) => pickImageAttachment(false, stage))}
              activeOpacity={0.8}
            >
              <Ionicons name="images-outline" size={16} color={colors.primary} />
              <Text style={styles.fileButtonText}>เลือกรูป</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.fileButton}
              onPress={() => addFile(pickVideoAttachment)}
              activeOpacity={0.8}
            >
              <Ionicons name="videocam-outline" size={16} color={colors.primary} />
              <Text style={styles.fileButtonText}>วิดีโอ</Text>
            </TouchableOpacity>
          </View>
        )}

        {/*
          จบแค่นี้ — อะไหล่ ช่าง และวันนัด เป็นของขั้นถัดไปตามสายงาน
          ถ้าให้กรอกตรงนี้ด้วย คนเปิดใบงานจะต้องรู้เรื่องที่ยังไม่มีใครรู้
        */}
        <View style={styles.next}>
          <Ionicons name="arrow-forward-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.nextText}>
            เปิดแล้วใบงานจะไปอยู่ที่หัวหน้าภาค{regionHint} เพื่อระบุอะไหล่ที่ต้องใช้
            จากนั้นแอดมินเช็คคลัง หัวหน้าภาคจ่ายงาน แล้วช่างนัดวันเข้า
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.submit, saving && styles.submitOff]}
          onPress={submit}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <>
              <ActivityIndicator color="#fff" />
              {busy ? <Text style={styles.submitText}>{busy}</Text> : null}
            </>
          ) : (
            <>
              <Ionicons name="clipboard-outline" size={18} color="#fff" />
              <Text style={styles.submitText}>เปิดใบงาน</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  jobHint: { fontSize: 11, lineHeight: 19, color: colors.textFaint, marginTop: spacing.xs },
  next: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
  nextText: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.textMuted },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, ...shadow.card },
  fromBoard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  fromBoardText: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.primaryDark },
  label: {
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
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
  multiline: { minHeight: 84, textAlignVertical: "top" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  results: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultCode: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  resultName: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.textMuted },
  chosen: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chosenBody: { flex: 1, minWidth: 0 },
  chosenText: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.primaryDark },
  chosenName: { fontSize: 12, lineHeight: 20, color: colors.primaryDark },
  files: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  file: { position: "relative" },
  thumb: { width: 88, height: 88, borderRadius: radius.sm, backgroundColor: colors.background },
  thumbBlank: { alignItems: "center", justifyContent: "center" },
  playBadge: {
    position: "absolute",
    left: spacing.xs,
    bottom: spacing.xs,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: "rgba(15,23,42,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeFile: {
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
  fileButtons: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  fileButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
  },
  fileButtonText: { fontSize: 13, lineHeight: 21, fontWeight: "600", color: colors.primary },
  busyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  busyText: { fontSize: 13, lineHeight: 21, color: colors.textMuted },
  options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  optionOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  optionText: { fontSize: 13, lineHeight: 21, color: colors.textMuted, fontWeight: "600" },
  optionTextOn: { color: colors.primaryDark },
  error: { fontSize: 13, lineHeight: 21, color: colors.danger, marginTop: spacing.lg },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
  },
  submitOff: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 15, lineHeight: 24, fontWeight: "700" },
});
