/**
 * เปิดใบงานใหม่
 *
 * ใช้สองทาง — เปิดเปล่าจากปุ่ม "เพิ่มใบงาน" หรือถูกส่งมาจากกระดานพร้อมรหัสเคส
 * ถ้ามีรหัสเคสติดมา สาขากับเครื่องมาจากเคสอยู่แล้ว จึงไม่ต้องถามซ้ำ
 */
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import DateField from "../components/DateField";
import PartPicker, { PickedPart } from "../components/PartPicker";
import { HomeStackParamList } from "../navigation/types";
import { colors, radius, shadow, spacing } from "../theme";

type Props = NativeStackScreenProps<HomeStackParamList, "WorkOrderForm">;

interface Option {
  value: string;
  label: string;
}
interface Technician {
  id: number;
  name: string;
  employeeCode: string;
}

interface BranchOption {
  id: number;
  code: string;
  name: string;
}

export default function WorkOrderFormScreen({ navigation, route }: Props) {
  const outageId = route.params?.outageId ?? null;
  const fromBoard = outageId !== null;

  const [priorities, setPriorities] = useState<Option[]>([]);
  const [workStatuses, setWorkStatuses] = useState<Option[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);

  const [branchCode, setBranchCode] = useState(route.params?.branchCode ?? "");
  const [branchResults, setBranchResults] = useState<BranchOption[]>([]);
  const [branchTerm, setBranchTerm] = useState("");
  const [machineCode, setMachineCode] = useState("");
  const [title, setTitle] = useState(route.params?.presetTitle ?? "");
  const [detail, setDetail] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [symptom, setSymptom] = useState("");
  const [workStatus, setWorkStatus] = useState<string | null>(null);
  const [waitingParts, setWaitingParts] = useState<PickedPart[]>([]);
  const [assignedToId, setAssignedToId] = useState<number | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ priorities: Option[]; workStatuses: Option[]; technicians: Technician[] }>(
        "/work-orders/options"
      )
      .then((res) => {
        setPriorities(res.data.priorities);
        setWorkStatuses(res.data.workStatuses);
        setTechnicians(res.data.technicians);
      })
      .catch(() => setError("โหลดตัวเลือกไม่สำเร็จ"));
  }, []);

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
      const body = {
        title: title.trim(),
        detail: detail.trim() || undefined,
        priority,
        assignedToId,
        scheduledAt: scheduledAt || null,
        symptom: symptom.trim() || null,
        workStatus,
        waitingParts: waitingParts.map((p) => ({
          sparePartId: p.sparePartId,
          quantity: p.quantity,
        })),
      };
      const res = fromBoard
        ? await api.post(`/work-orders/from-outage/${outageId}`, body)
        : await api.post("/work-orders", {
            ...body,
            branchCode: branchCode.trim(),
            machineCode: machineCode.trim() || undefined,
          });
      showAlert("เปิดใบงานแล้ว", `${res.data.code} · ${res.data.title}`);
      navigation.replace("WorkOrderDetail", { id: res.data.id });
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
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
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.label}>สาขา</Text>
            {branchCode ? (
              <View style={styles.chosen}>
                <Text style={styles.chosenText}>{branchCode}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setBranchCode("");
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
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="เช่น เครื่องอบไม่ร้อน ลูกค้าแจ้งทางไลน์"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="เรื่องที่ให้ไปทำ"
        />

        <Text style={styles.label}>รายละเอียดเพิ่มเติม</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={detail}
          onChangeText={setDetail}
          placeholder="อาการที่พบ สิ่งที่ต้องเตรียมไป"
          placeholderTextColor={colors.textFaint}
          multiline
          numberOfLines={3}
          accessibilityLabel="รายละเอียดเพิ่มเติม"
        />

        {/* อาการกับสถานะ ชุดเดียวกับที่กระดานเคยให้กรอก ตอนนี้กรอกที่นี่ที่เดียว */}
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

        <Text style={styles.label}>สถานะการดำเนินการ</Text>
        <View style={styles.options}>
          <TouchableOpacity
            style={[styles.option, workStatus === null && styles.optionOn]}
            onPress={() => setWorkStatus(null)}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, workStatus === null && styles.optionTextOn]}>
              ยังไม่ระบุ
            </Text>
          </TouchableOpacity>
          {workStatuses.map((w) => (
            <TouchableOpacity
              key={w.value}
              style={[styles.option, workStatus === w.value && styles.optionOn]}
              onPress={() => setWorkStatus(w.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionText, workStatus === w.value && styles.optionTextOn]}>
                {w.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ช่องอะไหล่โผล่เฉพาะตอนรออะไหล่ ไม่งั้นฟอร์มยาวโดยไม่มีเหตุผล */}
        {workStatus === "WAITING_PARTS" ? (
          <PartPicker parts={waitingParts} onChange={setWaitingParts} label="รออะไหล่ตัวไหน" />
        ) : null}

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

        <Text style={styles.label}>มอบหมายช่าง</Text>
        <View style={styles.options}>
          <TouchableOpacity
            style={[styles.option, assignedToId === null && styles.optionOn]}
            onPress={() => setAssignedToId(null)}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, assignedToId === null && styles.optionTextOn]}>
              ยังไม่ระบุ
            </Text>
          </TouchableOpacity>
          {technicians.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.option, assignedToId === t.id && styles.optionOn]}
              onPress={() => setAssignedToId(t.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionText, assignedToId === t.id && styles.optionTextOn]}>
                {t.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <DateField value={scheduledAt} onChange={setScheduledAt} label="วันที่นัดเข้า" />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.submit, saving && styles.submitOff]}
          onPress={submit}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
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
  chosenText: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.primaryDark },
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
