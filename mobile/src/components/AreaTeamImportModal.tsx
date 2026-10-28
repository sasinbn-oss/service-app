/**
 * นำเข้าไฟล์ Area Team (แอดมิน · เจ้าของงานขอ ต.ค. 69) — สร้าง/อัปเดตบัญชี Area และ Supervisor (COCO) แล้วผูกสาขา
 * ไฟล์รายชื่อ Maid (COCO) เข้าปุ่มเดียวกัน — เซิร์ฟเวอร์ดูหัวตารางเองว่าเป็นไฟล์แบบไหน (คอลัมน์ User แทน Mail)
 *
 * เลือกไฟล์ → เซิร์ฟเวอร์อ่านแล้วบอกว่าจะสร้างใคร อัปเดตใคร สาขาไหนยังไม่มีในระบบ → ยืนยัน (ส่งไฟล์เดิมพร้อม apply)
 * หลังยืนยัน ระบบให้ดาวน์โหลด Excel รายชื่อ + รหัสผ่านเริ่มต้นครั้งเดียว (เก็บในระบบแค่ hash) — ปุ่มดาวน์โหลดค้างอยู่
 * จนกว่าจะปิดหน้าต่าง เผื่อกดพลาด · ไฟล์หาย = นำเข้าไฟล์เดิมอีกรอบพร้อมติ๊ก "ตั้งรหัสใหม่ให้คนที่ยังไม่เคยเข้าระบบ"
 */
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import TouchableOpacity from "./Tap";
import Ionicons from "@expo/vector-icons/Ionicons";
import AppModal from "./AppModal";
import Spinner from "./Spinner";
import { fs } from "./FleetUI";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { openUrl } from "../utils/share";
import { PickedFile, droppedFile, pickFile } from "../utils/filePicker";
import FileDropZone, { DropHint } from "./FileDropZone";
import { colors, radius, spacing } from "../theme";

interface Person {
  login: string;
  name: string;
  role: "AREA" | "COCO_SUPERVISOR" | "COCO_MAID";
  phone: string | null;
  areaLogin: string | null;
  /** Maid: ชื่อหัวหน้าจากคอลัมน์ "Area (หัวหน้า)" */
  lead?: string | null;
  branches: string[];
  unknownBranches: string[];
  status: "NEW" | "UPDATE" | "TAKEN";
  existingRole: string | null;
  pending: boolean;
}
interface Preview {
  fileName: string;
  summary: {
    areas: number;
    supervisors: number;
    maids: number;
    branches: number;
    create: number;
    update: number;
    taken: { login: string; name: string; role: string }[];
    missingBranches: string[];
    notCoco: string[];
    problems: string[];
  };
  people: Person[];
}
interface Applied {
  created: number;
  updated: number;
  passwordsIssued: number;
  branchesLinked: number;
  skipped: number;
  credentials: { filename: string; path: string } | null;
}

async function send(file: PickedFile, apply: boolean, resetPending: boolean) {
  const form = new FormData();
  form.append("file", file.blob, file.name);
  if (apply) form.append("apply", "1");
  if (resetPending) form.append("resetPending", "1");
  return (
    await api.post<Preview & Applied>("/user-import/area-team", form, {
      headers: { "Content-Type": "multipart/form-data" },
      loadingText: apply ? "กำลังสร้างบัญชี..." : false,
    })
  ).data;
}

const STATUS = {
  NEW: { label: "สร้างใหม่", fg: colors.successInk, bg: colors.successSoft },
  UPDATE: { label: "อัปเดต", fg: colors.primaryInk, bg: colors.primarySoft },
  TAKEN: { label: "ชื่อผู้ใช้ซ้ำ — ข้าม", fg: colors.dangerInk, bg: colors.dangerSoft },
};

const ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export default function AreaTeamImportModal({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);
  const [resetPending, setResetPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setFile(null);
    setPreview(null);
    setApplied(null);
    setResetPending(false);
    setError(null);
    onClose();
  }

  // given = ไฟล์ที่ลากมาวาง (FileDropZone) — ไม่ส่ง = เปิดหน้าต่างเลือกไฟล์
  async function choose(given?: PickedFile | null) {
    const picked = given !== undefined ? given : await pickFile(ACCEPT);
    if (!picked) return;
    setFile(picked);
    setPreview(null);
    setApplied(null);
    setError(null);
    setBusy(true);
    try {
      setPreview(await send(picked, false, false));
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
      setApplied(await send(file, true, resetPending));
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    const url = applied?.credentials ? resolveImageUrl(applied.credentials.path) : null;
    if (url) await openUrl(url);
  }

  const s = preview?.summary;
  const pending = preview?.people.filter((p) => p.status === "UPDATE" && p.pending).length ?? 0;
  const areaName = new Map((preview?.people ?? []).filter((p) => p.role === "AREA").map((p) => [p.login, p.name]));
  const people = [...(preview?.people ?? [])].sort(
    (a, b) => (a.status === "TAKEN" ? -1 : 0) - (b.status === "TAKEN" ? -1 : 0) || (a.role === "AREA" ? -1 : 0) - (b.role === "AREA" ? -1 : 0)
  );

  return (
    <AppModal
      visible={visible}
      onClose={close}
      busy={busy}
      title="นำเข้า Area Team"
      subtitle="ไฟล์ Area Team (ERP · Name-Surname · Mail · Area) หรือไฟล์รายชื่อ Maid (ERP · Name-Surname · User) — .xlsx"
      width={820}
      footer={
        applied ? (
          <TouchableOpacity style={[fs.btn, { flex: 1 }]} onPress={close}>
            <Text style={fs.btnText}>เสร็จ</Text>
          </TouchableOpacity>
        ) : preview ? (
          <View style={{ flex: 1, flexDirection: "row", gap: spacing.sm }}>
            <TouchableOpacity style={[fs.btn, fs.btnGhost, { flex: 1 }]} onPress={close} disabled={busy}>
              <Text style={fs.btnGhostText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[fs.btn, { flex: 2 }, busy && { opacity: 0.5 }]}
              onPress={commit}
              disabled={busy}
              accessibilityLabel="ยืนยันนำเข้า Area Team"
            >
              {busy ? (
                <Spinner color="#fff" />
              ) : (
                <Text style={fs.btnText}>
                  ยืนยัน · สร้าง {s?.create ?? 0} บัญชี{s?.update ? ` · อัปเดต ${s.update}` : ""} · ผูก {s?.branches ?? 0} สาขา
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : undefined
      }
    >
      {applied ? (
        <View style={styles.block}>
          <View style={styles.done}>
            <Ionicons name="checkmark-circle" size={22} color={colors.successInk} />
            <Text style={styles.doneText}>
              สร้างบัญชี {applied.created} · อัปเดต {applied.updated} · ผูกสาขา {applied.branchesLinked}
              {applied.skipped ? ` · ข้าม ${applied.skipped} (ชื่อผู้ใช้ซ้ำกับตำแหน่งอื่น)` : ""}
            </Text>
          </View>
          {applied.credentials ? (
            <>
              <TouchableOpacity style={[fs.btn, styles.dl]} onPress={download} accessibilityLabel="ดาวน์โหลดรหัสผ่านเริ่มต้น">
                <Ionicons name="download-outline" size={18} color="#fff" />
                <Text style={fs.btnText}>ดาวน์โหลดรายชื่อ + รหัสผ่านเริ่มต้น ({applied.passwordsIssued} คน)</Text>
              </TouchableOpacity>
              <Text style={styles.warn}>
                ดาวน์โหลดได้จากหน้าต่างนี้เท่านั้น (ลิงก์ใช้ได้ 2 ชั่วโมง) — ระบบไม่เก็บรหัสแบบอ่านได้ · ส่งให้แต่ละคนแล้วลบไฟล์ทิ้ง
                ทุกคนต้องเปลี่ยนรหัสตอนเข้าครั้งแรก
              </Text>
            </>
          ) : (
            <Text style={styles.muted}>ไม่มีบัญชีใหม่ — รหัสผ่านของคนที่มีบัญชีแล้วไม่ถูกเปลี่ยน</Text>
          )}
        </View>
      ) : (
        <View style={styles.block}>
          <FileDropZone hint="ไฟล์ .xlsx" disabled={busy} label="วางไฟล์ Area Team" onFiles={(files) => choose(droppedFile(files, ACCEPT))}>
            <TouchableOpacity style={[fs.btn, fs.btnGhost, styles.pick]} onPress={() => choose()} disabled={busy} accessibilityLabel="เลือกไฟล์ Area Team">
              <Ionicons name="document-attach-outline" size={18} color={colors.navy} />
              <Text style={fs.btnGhostText}>{file ? `เปลี่ยนไฟล์ (${file.name})` : "เลือกไฟล์ Area Team / รายชื่อ Maid"}</Text>
            </TouchableOpacity>
            <DropHint text="หรือลากไฟล์มาวางตรงนี้" />
          </FileDropZone>
          <Text style={styles.muted}>
            ชื่อผู้ใช้ = อีเมลส่วนหน้า @ (เช่น kanlaya.l) · ไฟล์ Maid ใช้คอลัมน์ User · รหัสผ่านสุ่มให้แต่ละคน · นำเข้าไฟล์ใหม่ทีหลังได้ —
            ย้ายสาขา/เปลี่ยนคน ระบบอัปเดตให้ ไม่สร้างซ้ำ และไม่เปลี่ยนรหัสของคนที่มีบัญชีแล้ว
          </Text>
          {busy && !preview ? <Spinner /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {s ? (
            <>
              <View style={styles.tiles}>
                {/* ไฟล์หนึ่งเป็นแบบเดียว — ไฟล์ Maid ไม่มี Area/Supervisor และกลับกัน ไม่ต้องโชว์ช่องที่เป็น 0 */}
                {[
                  ...(s.maids ? [[s.maids, "Maid (COCO)"]] : [[s.areas, "Area"], [s.supervisors, "Supervisor (COCO)"]]),
                  [s.branches, "สาขาที่ผูก"],
                  [s.create, "บัญชีใหม่"],
                  [s.update, "อัปเดต"],
                ].map(([n, label]) => (
                  <View key={label} style={styles.tile}>
                    <Text style={styles.tileN}>{n}</Text>
                    <Text style={styles.tileL}>{label}</Text>
                  </View>
                ))}
              </View>

              {s.missingBranches.length ? (
                <Text style={styles.alert}>
                  สาขาในไฟล์ที่ยังไม่มีในระบบ {s.missingBranches.length} สาขา — จะผูกไม่ได้ เพิ่มสาขาก่อนแล้วนำเข้าไฟล์เดิมอีกรอบ:{" "}
                  {s.missingBranches.join(" ")}
                </Text>
              ) : null}
              {s.notCoco.length ? (
                <Text style={styles.alert}>
                  รหัสสาขาที่ไม่ขึ้นต้นด้วย C (ไม่ใช่สาขา COCO) — Supervisor/Maid จะมองไม่เห็นสาขาเหล่านี้: {s.notCoco.join(" ")}
                </Text>
              ) : null}
              {s.taken.length ? (
                <Text style={styles.alert}>
                  ชื่อผู้ใช้ซ้ำกับบัญชีตำแหน่งอื่น — ข้ามไว้ ไม่เปลี่ยนตำแหน่งให้ (แก้ที่การ์ดของคนนั้นในหน้านี้):{" "}
                  {s.taken.map((t) => `${t.login} (${t.name})`).join(", ")}
                </Text>
              ) : null}
              {s.problems.map((p) => (
                <Text key={p} style={styles.muted}>
                  • {p}
                </Text>
              ))}
              {pending ? (
                <TouchableOpacity style={styles.check} onPress={() => setResetPending((v) => !v)} accessibilityLabel="ตั้งรหัสใหม่ให้คนที่ยังไม่เคยเข้าระบบ">
                  <Ionicons name={resetPending ? "checkbox" : "square-outline"} size={20} color={colors.navy} />
                  <Text style={styles.checkText}>
                    ตั้งรหัสใหม่ให้คนที่ยังไม่เคยเข้าระบบ ({pending} คน) — ใช้เมื่อไฟล์รหัสผ่านรอบก่อนหาย
                  </Text>
                </TouchableOpacity>
              ) : null}

              <ScrollView style={styles.list} nestedScrollEnabled>
                {people.map((p) => (
                  <View key={p.login} style={styles.row}>
                    <View style={[styles.badge, { backgroundColor: STATUS[p.status].bg }]}>
                      <Text style={[styles.badgeText, { color: STATUS[p.status].fg }]}>{STATUS[p.status].label}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.name}>
                        {p.name} <Text style={styles.login}>· {p.login}</Text>
                      </Text>
                      <Text style={styles.sub} numberOfLines={2}>
                        {p.role === "AREA"
                          ? "Area · เห็นสาขา COCO ทั้งหมด"
                          : p.role === "COCO_MAID"
                          ? `Maid (COCO)${p.lead ? ` · หัวหน้า: ${p.lead}` : ""}`
                          : `Supervisor (COCO) · Area: ${areaName.get(p.areaLogin ?? "") ?? p.areaLogin}`}
                        {p.branches.length ? ` · ${p.branches.length} สาขา: ${p.branches.join(" ")}` : ""}
                        {p.unknownBranches.length ? ` · ไม่มีในระบบ: ${p.unknownBranches.join(" ")}` : ""}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}
        </View>
      )}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  pick: { flexDirection: "row", gap: spacing.sm, alignSelf: "flex-start", paddingHorizontal: spacing.lg },
  muted: { fontSize: 13, lineHeight: 21, color: colors.textMuted },
  error: { fontSize: 13, lineHeight: 21, color: colors.dangerInk },
  alert: { fontSize: 13, lineHeight: 21, color: colors.warningInk, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.sm },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: 120, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md },
  tileN: { fontSize: 22, fontWeight: "800", color: colors.text },
  tileL: { fontSize: 12, color: colors.textMuted },
  check: { flexDirection: "row", gap: spacing.sm, alignItems: "center", paddingVertical: spacing.xs },
  checkText: { flex: 1, fontSize: 13, lineHeight: 21, color: colors.text },
  list: { maxHeight: 360, borderTopWidth: 1, borderColor: colors.border },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.border },
  badge: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  name: { fontSize: 14, fontWeight: "700", color: colors.text },
  login: { fontWeight: "400", color: colors.textMuted },
  sub: { fontSize: 12, lineHeight: 19, color: colors.textMuted },
  done: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  doneText: { flex: 1, fontSize: 14, lineHeight: 22, color: colors.text },
  dl: { flexDirection: "row", gap: spacing.sm },
  warn: { fontSize: 12, lineHeight: 20, color: colors.warningInk },
});
