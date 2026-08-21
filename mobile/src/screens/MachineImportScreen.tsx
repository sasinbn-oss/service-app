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

type Kind = "machines" | "branches" | "cancelled";

interface CancelledPlan {
  rowsInFile: number;
  duplicateRows: number;
  uniqueRows: number;
  toCancel: { code: string; name: string; openCases: number }[];
  machinesToRemove: { code: string; name: string; machineCode: string; openCases: number }[];
  toRestore: { code: string; name: string; machineCode: string | null }[];
  alreadyCancelled: number;
  notFound: string[];
  openCasesToClose: number;
  errors: string[];
  warnings: string[];
}

interface BranchPlan {
  rowsInFile: number;
  duplicateRows: number;
  uniqueRows: number;
  newBranchCount: number;
  changedCount: number;
  changedSample: { code: string; from: string; to: string }[];
  unchangedCount: number;
  notInFileCount: number;
  regions: { name: string; branches: number }[];
  zones: { name: string; branches: number }[];
  warnings: string[];
}

interface ImportPlan {
  rowsInFile: number;
  duplicateRows: number;
  uniqueRows: number;
  machinesOff: number;
  branchesSignalLost: number;
  machinesAtSignalLostBranches: number;
  newBranchCount: number;
  newBranchSample: string[];
  newMachines: number;
  opening: { machineOff: number; signalLost: number };
  closing: { machineOff: number; signalLost: number };
  stillOpen: { machineOff: number; signalLost: number };
  ignoredRows: number;
  reclassifiedBranches: { branchCode: string; branchName: string; machinesOff: number }[];
  warnings: string[];
}

export default function MachineImportScreen() {
  const [kind, setKind] = useState<Kind>("machines");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [branchPlan, setBranchPlan] = useState<BranchPlan | null>(null);
  const [cancelledPlan, setCancelledPlan] = useState<CancelledPlan | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send<T>(mode: "preview" | "commit", picked: PickedFile): Promise<T> {
    const form = new FormData();
    form.append("file", picked.blob, picked.name);
    form.append("mode", mode);
    const path =
      kind === "machines"
        ? "/machines/import"
        : kind === "branches"
          ? "/branches/import"
          : "/branches/cancelled-import";
    const res = await api.post<{ plan: T }>(path, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.plan;
  }

  function reset() {
    setFile(null);
    setPlan(null);
    setBranchPlan(null);
    setCancelledPlan(null);
    setSaved(false);
    setError(null);
  }

  async function choose() {
    const picked = await pickFile(
      ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    if (!picked) return;

    setFile(picked);
    setPlan(null);
    setBranchPlan(null);
    setCancelledPlan(null);
    setSaved(false);
    setError(null);
    setChecking(true);
    try {
      if (kind === "machines") setPlan(await send<ImportPlan>("preview", picked));
      else if (kind === "branches") setBranchPlan(await send<BranchPlan>("preview", picked));
      else setCancelledPlan(await send<CancelledPlan>("preview", picked));
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
      if (kind === "machines") setPlan(await send<ImportPlan>("commit", file));
      else if (kind === "branches") setBranchPlan(await send<BranchPlan>("commit", file));
      else setCancelledPlan(await send<CancelledPlan>("commit", file));
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
      <View style={styles.kindTabs}>
        <KindTab
          active={kind === "machines"}
          icon="pulse"
          title="รายงานเครื่อง"
          subtitle="วันละ 2 ครั้ง"
          onPress={() => { setKind("machines"); reset(); }}
        />
        <KindTab
          active={kind === "branches"}
          icon="map-outline"
          title="ทะเบียนสาขา"
          subtitle="สัปดาห์ละครั้ง"
          onPress={() => { setKind("branches"); reset(); }}
        />
        <KindTab
          active={kind === "cancelled"}
          icon="close-circle-outline"
          title="สาขาที่ยกเลิก"
          subtitle="เมื่อมีสาขาปิด"
          onPress={() => { setKind("cancelled"); reset(); }}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {kind === "machines"
            ? "เลือกไฟล์รายงานเครื่อง"
            : kind === "branches"
              ? "เลือกไฟล์ทะเบียนสาขา"
              : "เลือกไฟล์สาขาที่ยกเลิก"}
        </Text>
        <Text style={styles.cardHint}>
          {kind === "machines"
            ? "ไฟล์ .xlsx คอลัมน์ crm_code, num, state, offline — ระบบจะเทียบกับครั้งก่อนให้เอง"
            : kind === "branches"
              ? "ไฟล์ .xlsx คอลัมน์ code, ผจกภาค, ทีมช่าง — อัปเดตเฉพาะข้อมูลสาขา ไม่แตะสถานะเครื่อง"
              : "ไฟล์ .xlsx คอลัมน์ code อย่างเดียว = ยกเลิกทั้งสาขา · ใส่คอลัมน์ num (หมายเลขเครื่อง) ด้วย = ถอดเฉพาะเครื่องนั้น"}
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

      {branchPlan ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {saved ? "บันทึกเรียบร้อย" : "ตรวจสอบก่อนบันทึก"}
            </Text>
            <Row label="แถวในไฟล์" value={String(branchPlan.rowsInFile)} />
            {branchPlan.duplicateRows > 0 ? (
              <Row label="รหัสซ้ำที่ยุบรวม" value={String(branchPlan.duplicateRows)} tone="warning" />
            ) : null}
            <View style={styles.divider} />
            <Row label="สาขาใหม่ที่จะเพิ่ม" value={String(branchPlan.newBranchCount)} tone="success" strong />
            <Row label="สาขาที่ภาค/ทีมช่างจะเปลี่ยน" value={String(branchPlan.changedCount)} tone="warning" strong />
            <Row label="สาขาที่ข้อมูลเหมือนเดิม" value={String(branchPlan.unchangedCount)} />
            <Row label="สาขาในระบบที่ไม่มีในไฟล์" value={`${branchPlan.notInFileCount} (ไม่ถูกแตะ)`} />
          </View>

          {branchPlan.changedSample.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>ตัวอย่างสาขาที่จะเปลี่ยน</Text>
              {branchPlan.changedSample.map((c) => (
                <View key={c.code} style={styles.changeRow}>
                  <Text style={styles.changeCode}>{c.code}</Text>
                  <Text style={styles.changeText}>{c.from}</Text>
                  <Ionicons name="arrow-forward" size={13} color={colors.textFaint} />
                  <Text style={[styles.changeText, styles.changeTo]}>{c.to}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>ภาค ({branchPlan.regions.length})</Text>
            {branchPlan.regions.map((r) => (
              <Row key={r.name} label={r.name} value={`${r.branches} สาขา`} />
            ))}
            <View style={styles.divider} />
            <Text style={styles.cardTitle}>ทีมช่าง ({branchPlan.zones.length})</Text>
            {branchPlan.zones.slice(0, 30).map((z) => (
              <Row key={z.name} label={z.name} value={`${z.branches} สาขา`} />
            ))}
          </View>

          {branchPlan.warnings.length > 0 ? (
            <View style={styles.warnCard}>
              {branchPlan.warnings.map((w, i) => (
                <View key={i} style={styles.warnRow}>
                  <Ionicons name="warning-outline" size={16} color="#92400e" />
                  <Text style={styles.warnText}>{w}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {!saved ? (
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
          ) : (
            <View style={styles.savedCard}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.savedText}>
                บันทึกแล้ว แดชบอร์ดจัดกลุ่มตามภาคและทีมช่างได้เลย
              </Text>
            </View>
          )}
        </>
      ) : null}

      {cancelledPlan ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>สรุปก่อนบันทึก</Text>
            <Row label="รหัสในไฟล์" value={String(cancelledPlan.rowsInFile)} />
            {cancelledPlan.duplicateRows > 0 ? (
              <Row label="รหัสซ้ำที่ยุบรวม" value={String(cancelledPlan.duplicateRows)} tone="warning" />
            ) : null}

            <View style={styles.divider} />

            <Row
              label="สาขาที่จะยกเลิกทั้งสาขา"
              value={String(cancelledPlan.toCancel.length)}
              tone="danger"
              strong
            />
            <Row
              label="เครื่องที่จะถอดออก (สาขายังเปิด)"
              value={String(cancelledPlan.machinesToRemove.length)}
              tone="danger"
              strong
            />
            <Row
              label="เคสที่เปิดค้างอยู่ จะถูกปิดพร้อมกัน"
              value={String(cancelledPlan.openCasesToClose)}
              tone="warning"
              strong
            />
            {cancelledPlan.toRestore.length > 0 ? (
              <Row
                label="สาขาที่จะเอากลับมาใช้งาน"
                value={String(cancelledPlan.toRestore.length)}
                tone="success"
                strong
              />
            ) : null}
            <Row label="ทำเครื่องหมายไว้อยู่แล้ว" value={String(cancelledPlan.alreadyCancelled)} />
            {cancelledPlan.notFound.length > 0 ? (
              <Row label="รหัสที่ไม่มีในระบบ" value={`${cancelledPlan.notFound.length} (ข้ามไป)`} tone="warning" />
            ) : null}
          </View>

          {cancelledPlan.machinesToRemove.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>เครื่องที่จะถอดออก</Text>
              {cancelledPlan.machinesToRemove.slice(0, 40).map((m) => (
                <Text key={`${m.code}-${m.machineCode}`} style={styles.sampleRow}>
                  {m.code} {m.name} · เครื่อง {m.machineCode}
                  {m.openCases > 0 ? ` — ปิด ${m.openCases} เคส` : " — ไม่มีเคสค้าง"}
                </Text>
              ))}
              {cancelledPlan.machinesToRemove.length > 40 ? (
                <Text style={styles.sampleRow}>
                  และอีก {cancelledPlan.machinesToRemove.length - 40} เครื่อง
                </Text>
              ) : null}
            </View>
          ) : null}

          {cancelledPlan.toCancel.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>สาขาที่จะยกเลิกทั้งสาขา</Text>
              {/* บอกให้ครบว่าสาขาไหนบ้าง เพราะการกดยืนยันจะปิดเคสทิ้งทั้งหมด
                  คนกดควรเห็นก่อนว่ากระทบสาขาไหน */}
              {cancelledPlan.toCancel.slice(0, 40).map((b) => (
                <Text key={b.code} style={styles.sampleRow}>
                  {b.code} {b.name}
                  {b.openCases > 0 ? ` — ปิด ${b.openCases} เคส` : " — ไม่มีเคสค้าง"}
                </Text>
              ))}
              {cancelledPlan.toCancel.length > 40 ? (
                <Text style={styles.sampleRow}>และอีก {cancelledPlan.toCancel.length - 40} สาขา</Text>
              ) : null}
            </View>
          ) : null}

          {cancelledPlan.warnings.length > 0 ? (
            <View style={styles.warnCard}>
              {cancelledPlan.warnings.map((w, i) => (
                <View key={i} style={styles.warnRow}>
                  <Ionicons name="warning-outline" size={16} color="#92400e" />
                  <Text style={styles.warnText}>{w}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {!saved ? (
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
          ) : (
            <View style={styles.savedCard}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.savedText}>
                บันทึกแล้ว รอบอัปโหลดถัดไปจะข้ามรายการเหล่านี้ให้อัตโนมัติ
              </Text>
            </View>
          )}
        </>
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
            {plan.reclassifiedBranches.length > 0 ? (
              <>
                <Row
                  label="ในนั้นเป็นสาขาที่ดับเกิน 8 เครื่อง"
                  value={`${plan.reclassifiedBranches.length} สาขา`}
                  tone="warning"
                />
                {/* บอกให้ครบว่าสาขาไหนบ้าง เพราะการย้ายนี้ปิดใบงานช่างทิ้งหลายใบ
                    คนกดยืนยันควรเห็นก่อนว่าจะกระทบสาขาไหน */}
                <Text style={styles.reclassNote}>
                  ถือว่าสายขาด นับเป็นสัญญาณหายทั้งสาขาแทนเครื่องดับรายตัว —{" "}
                  {plan.reclassifiedBranches
                    .map((b) => `${b.branchCode} ${b.branchName} (${b.machinesOff})`)
                    .join(" · ")}
                </Text>
              </>
            ) : null}

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

            <Row label="สาขาใหม่ที่ไม่เคยมี" value={String(plan.newBranchCount)} />
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

function KindTab({
  active,
  icon,
  title,
  subtitle,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.kindTab, active && styles.kindTabActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={18} color={active ? colors.primary : colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.kindTitle, active && styles.kindTitleActive]}>{title}</Text>
        <Text style={styles.kindSubtitle}>{subtitle}</Text>
      </View>
    </TouchableOpacity>
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

  kindTabs: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  kindTab: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  kindTabActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  kindTitle: { fontSize: 14, lineHeight: 23, fontWeight: "700", color: colors.textMuted },
  kindTitleActive: { color: colors.primary },
  kindSubtitle: { fontSize: 11, lineHeight: 18, color: colors.textFaint },

  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 3,
    flexWrap: "wrap",
  },
  changeCode: { fontSize: 12, lineHeight: 20, color: colors.textMuted, minWidth: 56 },
  changeText: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  changeTo: { color: colors.text, fontWeight: "600" },

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
  sampleRow: { fontSize: 13, lineHeight: 22, color: colors.textMuted },
  reclassNote: {
    fontSize: 12,
    lineHeight: 20,
    color: "#92400e",
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },

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
