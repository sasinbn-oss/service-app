import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { canPickFile, pickFile, PickedFile } from "../utils/filePicker";
import { colors, radius, shadow, spacing } from "../theme";

interface ImportPlan {
  rowsInFile: number;
  duplicateRows: number;
  uniqueRows: number;
  machinesOff: number;
  branchesSignalLost: number;
  machinesAtSignalLostBranches: number;
  newBranches: string[];
  newMachines: number;
  opening: { machineOff: number; signalLost: number };
  closing: { machineOff: number; signalLost: number };
  stillOpen: { machineOff: number; signalLost: number };
  ignoredRows: number;
  warnings: string[];
}

export default function MachineImportScreen() {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(mode: "preview" | "commit", picked: PickedFile) {
    const form = new FormData();
    form.append("file", picked.blob, picked.name);
    form.append("mode", mode);
    const res = await api.post<{ plan: ImportPlan }>("/machines/import", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.plan;
  }

  async function choose() {
    const picked = await pickFile(
      ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    if (!picked) return;

    setFile(picked);
    setPlan(null);
    setSaved(false);
    setError(null);
    setChecking(true);
    try {
      setPlan(await send("preview", picked));
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setChecking(false);
    }
  }

  async function confirm() {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      setPlan(await send("commit", file));
      setSaved(true);
      showAlert("บันทึกแล้ว", "แดชบอร์ดอัปเดตตามไฟล์นี้เรียบร้อย");
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (!canPickFile) {
    return (
      <View style={styles.centered}>
        <Ionicons name="desktop-outline" size={36} color={colors.textFaint} />
        <Text style={styles.centeredTitle}>อัปโหลดได้จากคอมพิวเตอร์</Text>
        <Text style={styles.centeredText}>
          เปิดแอปในเบราว์เซอร์บนคอม แล้วเข้าเมนูนี้อีกครั้งเพื่ออัปโหลดไฟล์ Excel
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>เลือกไฟล์รายงานเครื่อง</Text>
        <Text style={styles.cardHint}>
          ไฟล์ .xlsx จากระบบ (คอลัมน์ crm_code, num, state, offline) — อัปโหลดวันละ 2 ครั้ง
          เช้าและบ่าย ระบบจะเทียบกับครั้งก่อนให้เอง
        </Text>

        <TouchableOpacity style={styles.pickButton} onPress={choose} activeOpacity={0.8}>
          <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
          <Text style={styles.pickButtonText}>
            {file ? "เลือกไฟล์อื่น" : "เลือกไฟล์ Excel"}
          </Text>
        </TouchableOpacity>

        {file ? (
          <View style={styles.fileRow}>
            <Ionicons name="document-attach-outline" size={16} color={colors.primary} />
            <Text style={styles.fileName}>{file.name}</Text>
          </View>
        ) : null}
      </View>

      {checking ? (
        <View style={styles.checking}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.checkingText}>กำลังอ่านไฟล์และเทียบกับข้อมูลเดิม…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {plan ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {saved ? "บันทึกเรียบร้อย" : "ตรวจสอบก่อนบันทึก"}
            </Text>

            <Row label="แถวในไฟล์" value={String(plan.rowsInFile)} />
            {plan.duplicateRows > 0 ? (
              <Row
                label="แถวซ้ำที่ตัดออก"
                value={String(plan.duplicateRows)}
                tone="warning"
              />
            ) : null}
            <Row label="เหลือหลังตัดซ้ำ" value={String(plan.uniqueRows)} />

            <View style={styles.divider} />

            <Row label="เครื่องดับ" value={String(plan.machinesOff)} tone="danger" strong />
            <Row
              label="สาขาสัญญาณหาย"
              value={`${plan.branchesSignalLost} สาขา · ${plan.machinesAtSignalLostBranches} เครื่อง`}
              tone="warning"
              strong
            />

            <View style={styles.divider} />

            <Row
              label="เคสที่จะเปิดใหม่"
              value={`ดับ ${plan.opening.machineOff} · สัญญาณ ${plan.opening.signalLost}`}
            />
            <Row
              label="เคสที่จะปิด (ซ่อมเสร็จ)"
              value={`ดับ ${plan.closing.machineOff} · สัญญาณ ${plan.closing.signalLost}`}
              tone="success"
            />
            <Row
              label="เคสที่ยังค้างต่อ"
              value={`ดับ ${plan.stillOpen.machineOff} · สัญญาณ ${plan.stillOpen.signalLost}`}
            />

            <View style={styles.divider} />

            <Row label="สาขาใหม่ที่ไม่เคยมี" value={String(plan.newBranches.length)} />
            <Row label="เครื่องใหม่ที่ไม่เคยมี" value={String(plan.newMachines)} />
          </View>

          {plan.warnings.length > 0 ? (
            <View style={styles.warnCard}>
              {plan.warnings.map((w, i) => (
                <View key={i} style={styles.warnRow}>
                  <Ionicons name="warning-outline" size={16} color="#92400e" />
                  <Text style={styles.warnText}>{w}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {!saved ? (
            <>
              <View style={styles.noteCard}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                <Text style={styles.noteText}>
                  เครื่องที่ไม่อยู่ในไฟล์นี้จะถือว่าซ่อมเสร็จแล้ว — ถ้าตัวเลข
                  "เคสที่จะปิด" สูงผิดปกติ ให้ตรวจว่าไฟล์ export มาครบทุกสาขาก่อนกดยืนยัน
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.confirmButton, saving && styles.confirmDisabled]}
                onPress={confirm}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={styles.confirmText}>ยืนยันบันทึกลงระบบ</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.savedCard}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.savedText}>
                บันทึกแล้ว กลับไปหน้าแดชบอร์ดเพื่อดูรายการล่าสุดได้เลย
              </Text>
            </View>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function Row({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "danger" | "warning" | "success";
  strong?: boolean;
}) {
  const color =
    tone === "danger"
      ? colors.danger
      : tone === "warning"
        ? "#92400e"
        : tone === "success"
          ? colors.success
          : colors.text;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color }, strong && styles.rowValueStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  // ตัวอักษรไทยมีสระบนและวรรณยุกต์ lineHeight ต้องสูงกว่า fontSize ชัดเจน
  centeredTitle: { fontSize: 16, lineHeight: 26, fontWeight: "700", color: colors.text },
  centeredText: {
    fontSize: 13,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 320,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  cardTitle: { fontSize: 16, lineHeight: 26, fontWeight: "700", color: colors.text },
  cardHint: { fontSize: 12, lineHeight: 20, color: colors.textMuted, marginTop: 4 },

  pickButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    marginTop: spacing.lg,
  },
  pickButtonText: { color: "#fff", fontSize: 15, lineHeight: 24, fontWeight: "700" },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  fileName: { flex: 1, fontSize: 13, lineHeight: 21, color: colors.text },

  checking: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  checkingText: { fontSize: 13, lineHeight: 21, color: colors.textMuted },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  rowLabel: { fontSize: 13, lineHeight: 22, color: colors.textMuted },
  rowValue: { fontSize: 14, lineHeight: 23, fontWeight: "600" },
  rowValueStrong: { fontSize: 17, lineHeight: 27, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },

  warnCard: {
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: "#fcd34d",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  warnRow: { flexDirection: "row", gap: spacing.sm },
  warnText: { flex: 1, fontSize: 12, lineHeight: 20, color: "#92400e" },

  noteCard: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 20, color: colors.textMuted },

  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
  },
  confirmDisabled: { backgroundColor: colors.borderStrong },
  confirmText: { color: "#fff", fontSize: 16, lineHeight: 26, fontWeight: "700" },

  savedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  savedText: { flex: 1, fontSize: 13, lineHeight: 22, color: colors.text },

  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 21, color: colors.danger },
});
