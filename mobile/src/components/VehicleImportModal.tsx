/**
 * นำเข้ารถจากไฟล์ "รถช่าง Service" (.xlsx) — ดูตัวอย่างก่อนแล้วค่อยบันทึก
 *
 * แบบเดียวกับนำเข้ารายชื่อ: เลือกไฟล์ → เซิร์ฟเวอร์อ่านแล้วบอกว่าจะเพิ่ม/แก้คันไหน และข้ามคันไหนเพราะอะไร
 * → แอดมินยืนยัน → ส่งไฟล์เดิมไปอีกรอบพร้อม apply (เซิร์ฟเวอร์อ่านใหม่ ไม่เชื่อรายการจากหน้าจอ)
 * ใช้ได้บนเว็บ (เลือกไฟล์จากคอมพิวเตอร์) เหมือนนำเข้าไฟล์อื่น ๆ ของแอดมิน
 */
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import TouchableOpacity from "./Tap";
import Ionicons from "@expo/vector-icons/Ionicons";
import AppModal from "./AppModal";
import Spinner from "./Spinner";
import { fs } from "./FleetUI";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { PickedFile, pickFile } from "../utils/filePicker";
import { colors, radius, spacing } from "../theme";

interface Row {
  plateNumber: string;
  brand: string | null;
  type: string;
  owner: string | null;
  insCompany: string | null;
  note: string | null;
  action: "CREATE" | "UPDATE" | "SAME";
  changes: string[];
}
interface Result {
  applied: boolean;
  created: number;
  updated: number;
  same: number;
  rows: Row[];
  skipped: { plateNumber: string; reason: string }[];
}

const ACTION: Record<Row["action"], { label: string; fg: string; bg: string }> = {
  CREATE: { label: "เพิ่มใหม่", fg: colors.successInk, bg: colors.successSoft },
  UPDATE: { label: "แก้ข้อมูล", fg: colors.primaryInk, bg: colors.primarySoft },
  SAME: { label: "ไม่เปลี่ยน", fg: colors.textMuted, bg: colors.background },
};

async function send(file: PickedFile, apply: boolean) {
  const form = new FormData();
  form.append("file", file.blob, file.name);
  if (apply) form.append("apply", "true");
  return (
    await api.post<Result>("/vehicles/import", form, {
      headers: { "Content-Type": "multipart/form-data" },
      loadingText: false,
    })
  ).data;
}

export default function VehicleImportModal({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setFile(null);
    setPreview(null);
    setError(null);
    onClose();
  }

  async function choose() {
    const picked = await pickFile(".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    if (!picked) return;
    setFile(picked);
    setPreview(null);
    setError(null);
    setBusy(true);
    try {
      setPreview(await send(picked, false));
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const r = await send(file, true);
      showAlert("นำเข้ารถแล้ว", `เพิ่มใหม่ ${r.created} คัน · แก้ข้อมูล ${r.updated} คัน`);
      onDone();
      close();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const todo = preview ? preview.created + preview.updated : 0;
  return (
    <AppModal
      visible={visible}
      onClose={close}
      busy={busy}
      title="นำเข้ารถจาก Excel"
      width={760}
      footer={
        preview ? (
          <View style={{ flex: 1, flexDirection: "row", gap: spacing.sm }}>
            <TouchableOpacity style={[fs.btn, fs.btnGhost, { flex: 1 }]} onPress={close} disabled={busy}>
              <Text style={fs.btnGhostText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[fs.btn, { flex: 2 }, (busy || todo === 0) && { opacity: 0.5 }]}
              onPress={commit}
              disabled={busy || todo === 0}
              accessibilityLabel="ยืนยันนำเข้ารถ"
            >
              {busy ? (
                <Spinner color="#fff" />
              ) : (
                <Text style={fs.btnText}>
                  {todo === 0 ? "ไม่มีอะไรเปลี่ยน" : `ยืนยัน · เพิ่ม ${preview.created} · แก้ ${preview.updated} คัน`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : undefined
      }
    >
      <Text style={styles.lead}>
        ไฟล์แบบ "รถช่าง Service" — ตอนรถบริษัท / รถเช่า / รถส่วนตัว และชีต Easy pass จับคู่รถเดิมด้วยทะเบียน
        เลขบัตรเติมน้ำมันและ Easy Pass เก็บแค่ 4 ตัวท้าย · รถส่วนตัวหัวหน้าภาคไม่นำเข้า
      </Text>
      <TouchableOpacity style={[fs.btn, fs.btnGhost, { alignSelf: "flex-start" }]} onPress={choose} disabled={busy} accessibilityLabel="เลือกไฟล์รถ">
        <Ionicons name="document-attach-outline" size={17} color={colors.navy} />
        <Text style={fs.btnGhostText}>{file ? `เลือกไฟล์ใหม่ (${file.name})` : "เลือกไฟล์ .xlsx"}</Text>
      </TouchableOpacity>
      {busy && !preview ? <Spinner color={colors.primary} style={{ marginTop: spacing.md }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {preview ? (
        <>
          <Text style={styles.summary}>
            เพิ่มใหม่ {preview.created} · แก้ข้อมูล {preview.updated} · ไม่เปลี่ยน {preview.same}
            {preview.skipped.length ? ` · ข้าม ${preview.skipped.length}` : ""}
          </Text>
          <View style={{ gap: spacing.xs }}>
            {preview.rows.map((r) => {
              const a = ACTION[r.action];
              return (
                <View key={r.plateNumber} style={styles.row}>
                  <View style={styles.rowTop}>
                    <Text style={styles.plate}>{r.plateNumber}</Text>
                    <Text style={styles.meta}>
                      {[r.brand, r.type].filter(Boolean).join(" · ")}
                    </Text>
                    <View style={{ flex: 1 }} />
                    <View style={[styles.badge, { backgroundColor: a.bg }]}>
                      <Text style={[styles.badgeText, { color: a.fg }]}>
                        {a.label}
                        {r.action === "UPDATE" ? ` (${r.changes.join(", ")})` : ""}
                      </Text>
                    </View>
                  </View>
                  {r.owner ? <Text style={styles.owner}>{r.owner}</Text> : null}
                  {r.insCompany ? <Text style={styles.meta}>ประกัน {r.insCompany}</Text> : null}
                  {r.note ? <Text style={styles.note}>{r.note}</Text> : null}
                </View>
              );
            })}
          </View>
          {preview.skipped.length ? (
            <>
              <Text style={styles.summary}>ข้าม</Text>
              {preview.skipped.map((s) => (
                <Text key={s.plateNumber + s.reason} style={styles.skip}>
                  {s.plateNumber} — {s.reason}
                </Text>
              ))}
            </>
          ) : null}
        </>
      ) : null}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 13, lineHeight: 20, color: colors.textMuted, marginBottom: spacing.sm },
  summary: { fontSize: 14, fontWeight: "700", color: colors.text, marginTop: spacing.md, marginBottom: spacing.xs },
  error: { color: colors.danger, marginTop: spacing.sm },
  row: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  plate: { fontSize: 15, fontWeight: "700", color: colors.text },
  meta: { fontSize: 12.5, color: colors.textMuted },
  owner: { fontSize: 13, color: colors.text },
  note: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  badge: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 1 },
  badgeText: { fontSize: 11.5, fontWeight: "700" },
  skip: { fontSize: 12.5, color: colors.textMuted },
});
