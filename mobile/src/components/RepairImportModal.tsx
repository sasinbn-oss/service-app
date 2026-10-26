/**
 * นำเข้าใบแจ้งซ่อมจากไฟล์ฟอร์ม COCO (.xlsx ที่ส่งออกจาก Microsoft Forms) — แอดมิน (เจ้าของงานขอ ต.ค. 69)
 *
 * แบบเดียวกับนำเข้ารถ: เลือกไฟล์ → เซิร์ฟเวอร์อ่านแล้วบอกทีละแถวว่าจะเปิดใบใหม่ ข้าม (นำเข้าแล้ว / เครื่องมีใบค้าง)
 * หรือนำเข้าไม่ได้เพราะอะไร → แอดมินยืนยัน → ส่งไฟล์เดิมอีกรอบพร้อม apply (เซิร์ฟเวอร์อ่านใหม่ ไม่เชื่อรายการจากหน้าจอ)
 * นำเข้าไฟล์เดิมซ้ำได้ แถวที่เข้าไปแล้วถูกข้ามให้เอง — ใช้ไฟล์ที่ส่งออกใหม่ทั้งก้อนทุกวันได้เลย
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

type Status = "NEW" | "IMPORTED" | "OPEN" | "ERROR" | "SKIPPED";
interface Row {
  line: number;
  reportedAt: string | null;
  branchCode: string;
  branchName: string | null;
  title: string;
  jobTypeRaw: string;
  machineCode: string | null;
  /** ช่องเครื่องที่ไม่ใช่รหัส W/D — เปิดเป็นงานทั้งสาขา เก็บข้อความไว้ในรายละเอียด */
  machineNote: string | null;
  model: string | null;
  capacityKg: number | null;
  symptom: string;
  contactName: string | null;
  contactPhone: string | null;
  photo: string | null;
  video: string | null;
  /** ช่องรูปภาพเป็นรูปฝังในไฟล์ — แนบเข้าใบงานเป็นรูปจริง */
  photoInFile?: boolean;
  /** ใบที่นำเข้าแล้วแต่ยังไม่มีรูป — ยืนยันแล้วเติมรูปจากไฟล์ให้ */
  photoFill?: boolean;
  status: Status;
  reason: string | null;
  /** เครื่องมีใบค้าง แต่แอดมินเลือกเปิดเพิ่ม (คนละเรื่อง) */
  forced?: boolean;
  /** ใบที่ยังค้างของสาขานี้ทุกเครื่อง — ให้กดดูก่อนยืนยัน เผื่อเป็นเรื่องเดียวกันที่แจ้งมาทางอื่นแล้ว */
  branchOpen: OpenOrder[];
}
interface OpenOrder {
  id: number;
  code: string;
  title: string;
  machineCode: string | null;
  statusLabel: string;
  createdAt: string;
}
// สาขาใหญ่มีใบค้างได้เป็นสิบ — โชว์ใบล่าสุดพอให้ตัดสินใจ ที่เหลือบอกเป็นจำนวน
const OPEN_SHOWN = 5;
interface Result {
  applied: boolean;
  summary: {
    new: number;
    imported: number;
    open: number;
    error: number;
    skipped: number;
    photos?: number;
    photoFill?: number;
    created?: number;
    photosAttached?: number;
    photoFilled?: number;
  };
  created?: string[];
  rows: Row[];
}

const STATUS: Record<Status, { label: string; fg: string; bg: string }> = {
  NEW: { label: "เปิดใบใหม่", fg: colors.successInk, bg: colors.successSoft },
  IMPORTED: { label: "นำเข้าแล้ว/ซ้ำ — ข้าม", fg: colors.textMuted, bg: colors.background },
  OPEN: { label: "มีใบค้างอยู่ — ข้าม", fg: colors.warningInk, bg: colors.warningSoft },
  ERROR: { label: "นำเข้าไม่ได้", fg: colors.dangerInk, bg: colors.dangerSoft },
  SKIPPED: { label: "เอาออกแล้ว", fg: colors.textMuted, bg: colors.background },
};
// ปัญหาขึ้นก่อน แอดมินจะได้เห็นว่าต้องแก้อะไรโดยไม่ต้องเลื่อนผ่านแถวปกติเป็นร้อย
// แถวที่เอาออกอยู่ที่เดิมในกลุ่มใบใหม่ — กดแล้วแถวไม่กระโดดหนีไปท้ายรายการ จะกดเอากลับก็หาเจอ
const ORDER: Record<Status, number> = { ERROR: 0, OPEN: 1, NEW: 2, SKIPPED: 2, IMPORTED: 3 };

/** skip = แถวที่เอาออก · force = แถวที่เครื่องมีใบค้างแต่เลือกเปิดเพิ่ม */
type Picks = { skip: number[]; force: number[] };
const NO_PICKS: Picks = { skip: [], force: [] };

async function send(file: PickedFile, apply: boolean, picks: Picks) {
  const form = new FormData();
  form.append("file", file.blob, file.name);
  if (apply) form.append("apply", "true");
  if (picks.skip.length) form.append("skip", picks.skip.join(","));
  if (picks.force.length) form.append("force", picks.force.join(","));
  return (
    await api.post<Result>("/work-orders/import-form", form, {
      headers: { "Content-Type": "multipart/form-data" },
      loadingText: apply ? "กำลังเปิดใบงาน..." : false,
    })
  ).data;
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" }) : "—";

export default function RepairImportModal({
  visible,
  onClose,
  onDone,
  onOpenOrder,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
  /** เปิดหน้ารายละเอียดใบเดิม — หน้าจอแม่ซ่อนหน้าต่างนี้ไว้ก่อน กลับมาแล้วตัวอย่างยังอยู่ ไม่ต้องเลือกไฟล์ใหม่ */
  onOpenOrder: (id: number) => void;
}) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** แถวที่เอาออก / เลือกเปิดเพิ่ม — ส่งไปทั้งตอนดูตัวอย่างใหม่และตอนยืนยัน เซิร์ฟเวอร์คิดซ้ำ/ใบค้างใหม่ให้ */
  const [picks, setPicks] = useState<Picks>(NO_PICKS);
  const [refreshing, setRefreshing] = useState<number | null>(null);
  /**
   * กดกล่องตัวเลขด้านบน = ดูเฉพาะแถวหมวดนั้น (เจ้าของงานขอ ต.ค. 69) · กดซ้ำ = ดูทั้งหมด
   * แถวที่กดเปลี่ยนระหว่างกรองยังค้างอยู่บนจอ (stuck) — กด "เปิดเพิ่ม" ในหมวดมีใบค้างแล้วแถวหายไปทันที
   * ดูเหมือนกดแล้วข้อมูลหาย และกดย้อนไม่ได้
   */
  const [only, setOnly] = useState<Status | null>(null);
  const [stuck, setStuck] = useState<number[]>([]);
  function pickOnly(st: Status) {
    setOnly((cur) => (cur === st ? null : st));
    setStuck([]);
  }

  function close() {
    setFile(null);
    setPicks(NO_PICKS);
    setPreview(null);
    setOnly(null);
    setStuck([]);
    setError(null);
    onClose();
  }

  async function choose() {
    const picked = await pickFile(".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    if (!picked) return;
    setFile(picked);
    setPreview(null);
    setOnly(null);
    setStuck([]);
    setError(null);
    setPicks(NO_PICKS);
    setBusy(true);
    try {
      setPreview(await send(picked, false, NO_PICKS));
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * เอาออก/เอากลับ หรือเลือกเปิดเพิ่ม/ไม่เปิด แล้วขอตัวอย่างใหม่ — แถวอื่นอาจเปลี่ยนตาม
   * (เอาแถวแรกของเครื่องออก แถวหลังของเครื่องเดียวกันกลายเป็นใบใหม่) · แถวที่กดเปลี่ยนบนจอทันที ไม่ต้องรอเครือข่าย
   */
  async function toggle(line: number, list: keyof Picks, onStatus: Status, offStatus: Status) {
    if (!file || !preview) return;
    const has = picks[list].includes(line);
    const next = { ...picks, [list]: has ? picks[list].filter((x) => x !== line) : [...picks[list], line] };
    setPicks(next);
    setRefreshing(line);
    if (only) setStuck((cur) => (cur.includes(line) ? cur : [...cur, line]));
    setPreview({
      ...preview,
      rows: preview.rows.map((r) => (r.line === line ? { ...r, status: has ? offStatus : onStatus, forced: list === "force" ? !has : r.forced } : r)),
    });
    try {
      const fresh = await send(file, false, next);
      // กดรัว ๆ — เอาเฉพาะคำตอบของการกดครั้งล่าสุด
      setPicks((cur) => {
        if (JSON.stringify(cur) === JSON.stringify(next)) setPreview(fresh);
        return cur;
      });
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setRefreshing((cur) => (cur === line ? null : cur));
    }
  }

  async function commit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const r = await send(file, true, picks);
      showAlert(
        "นำเข้าใบแจ้งซ่อมแล้ว",
        `เปิดใบงานใหม่ ${r.summary.created ?? 0} ใบ — อยู่ขั้นแรก (หัวหน้าภาคระบุอะไหล่)` +
          (r.summary.open ? ` · ข้ามเครื่องที่มีใบค้าง ${r.summary.open}` : "") +
          (r.summary.error ? ` · นำเข้าไม่ได้ ${r.summary.error}` : "") +
          (r.summary.skipped ? ` · เอาออก ${r.summary.skipped}` : "") +
          (r.summary.photosAttached ? ` · แนบรูปจากไฟล์ ${r.summary.photosAttached} รูป` : "") +
          (r.summary.photoFilled ? ` (เติมให้ใบเดิม ${r.summary.photoFilled} ใบ)` : "")
      );
      onDone();
      close();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const s = preview?.summary;
  const rows = preview
    ? preview.rows
        .filter((r) => !only || r.status === only || stuck.includes(r.line))
        .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.line - b.line)
    : [];
  return (
    <AppModal
      visible={visible}
      onClose={close}
      busy={busy}
      title="นำเข้าใบแจ้งซ่อมจากไฟล์"
      subtitle="ไฟล์ฟอร์มแจ้งซ่อม COCO (.xlsx)"
      width={820}
      footer={
        preview ? (
          <View style={{ flex: 1, flexDirection: "row", gap: spacing.sm }}>
            <TouchableOpacity style={[fs.btn, fs.btnGhost, { flex: 1 }]} onPress={close} disabled={busy}>
              <Text style={fs.btnGhostText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[fs.btn, { flex: 2 }, (busy || refreshing !== null || !(s?.new || s?.photoFill)) && { opacity: 0.5 }]}
              onPress={commit}
              disabled={busy || refreshing !== null || !(s?.new || s?.photoFill)}
              accessibilityLabel="ยืนยันนำเข้าใบแจ้งซ่อม"
            >
              {busy ? (
                <Spinner color="#fff" />
              ) : (
                <Text style={fs.btnText}>
                  {s?.new || s?.photoFill
                    ? ["ยืนยัน", s.new ? `เปิดใบงาน ${s.new} ใบ` : null, s.photoFill ? `เติมรูปใบเดิม ${s.photoFill} ใบ` : null]
                        .filter(Boolean)
                        .join(" · ")
                    : "ไม่มีใบใหม่ให้เปิด"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : undefined
      }
    >
      <Text style={styles.lead}>
        ส่งออกไฟล์จากฟอร์มแจ้งซ่อม (Excel) แล้วเลือกไฟล์ที่นี่ — ระบบอ่านทีละแถวให้ดูก่อน ยังไม่บันทึกจนกว่าจะกดยืนยัน{"\n"}
        แต่ละแถวเป็นใบงานหนึ่งใบที่ขั้นแรก (หัวหน้าภาคระบุอะไหล่) · รูป/วิดีโอในฟอร์มแนบเป็นลิงก์ · นำเข้าไฟล์เดิมซ้ำได้ แถวที่เข้าไปแล้วถูกข้ามให้เอง
      </Text>
      <TouchableOpacity
        style={[fs.btn, fs.btnGhost, { alignSelf: "flex-start" }]}
        onPress={choose}
        disabled={busy}
        accessibilityLabel="เลือกไฟล์ฟอร์มแจ้งซ่อม"
      >
        <Ionicons name="document-attach-outline" size={17} color={colors.navy} />
        <Text style={fs.btnGhostText}>{file ? `เลือกไฟล์ใหม่ (${file.name})` : "เลือกไฟล์ .xlsx"}</Text>
      </TouchableOpacity>
      {busy && !preview ? <Spinner color={colors.primary} style={{ marginTop: spacing.md }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {s ? (
        <>
          <View style={styles.stats}>
            {(
              [
                ["NEW", s.new, "เปิดใบใหม่"],
                ["OPEN", s.open, "มีใบค้าง (ข้าม)"],
                ["IMPORTED", s.imported, "นำเข้าแล้ว / แถวซ้ำ (ข้าม)"],
                ["ERROR", s.error, "นำเข้าไม่ได้"],
                ["SKIPPED", s.skipped, "เอาออกเอง"],
              ] as const
            ).map(([st, n, label]) =>
              st === "SKIPPED" && !n && only !== st ? null : (
                <Stat key={st} n={n} label={label} tone={STATUS[st]} on={only === st} dim={!!only && only !== st} onPress={() => pickOnly(st)} />
              )
            )}
          </View>
          {s.photos || s.photoFill ? (
            // ไฟล์บางรอบช่องรูปภาพเป็นรูปฝัง (ไม่ใช่ลิงก์ SharePoint) — ดึงมาเป็นรูปจริงในใบงานได้ บอกให้รู้ก่อนยืนยัน
            <View style={styles.photoNote}>
              <Ionicons name="images-outline" size={16} color={colors.primaryInk} />
              <Text style={styles.photoNoteText}>
                รูปในไฟล์:{s.photos ? ` แนบให้ใบใหม่ ${s.photos} ใบ` : ""}
                {s.photos && s.photoFill ? " ·" : ""}
                {s.photoFill ? ` เติมรูปให้ใบที่นำเข้าแล้วแต่ยังไม่มีรูป ${s.photoFill} ใบ` : ""}
              </Text>
            </View>
          ) : null}
          {only ? (
            <View style={styles.filterBar}>
              <Text style={styles.filterText}>
                แสดงเฉพาะ "{STATUS[only].label}" {rows.length} แถว
              </Text>
              <TouchableOpacity onPress={() => setOnly(null)} accessibilityLabel="ดูทุกแถว">
                <Text style={styles.filterAll}>ดูทั้งหมด {preview!.rows.length} แถว</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {only && rows.length === 0 ? <Text style={styles.empty}>ไม่มีแถวในหมวดนี้</Text> : null}
          <View style={{ gap: spacing.xs }}>
            {rows.map((r) => {
              const st = STATUS[r.status];
              return (
                <View
                  key={r.line}
                  style={[styles.row, r.status === "ERROR" && styles.rowBad, r.status === "SKIPPED" && styles.rowOut]}
                  accessibilityLabel={`แถว ${r.line} ${st.label}`}
                >
                  <View style={styles.rowTop}>
                    <Text style={styles.lineNo}>แถว {r.line}</Text>
                    <Text style={styles.branch}>
                      {r.branchCode}
                      {r.branchName ? ` ${r.branchName}` : ""}
                    </Text>
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>{r.title}</Text>
                    </View>
                    {r.machineCode ? (
                      <Text style={styles.meta}>
                        เครื่อง {r.machineCode}
                        {r.model ? ` · ${r.model}` : ""}
                        {r.capacityKg ? ` · ${r.capacityKg} kg` : ""}
                      </Text>
                    ) : r.machineNote ? (
                      <Text style={styles.meta}>อุปกรณ์: {r.machineNote} (ไม่ผูกเครื่อง)</Text>
                    ) : null}
                    <View style={{ flex: 1 }} />
                    <Text style={styles.meta}>แจ้ง {day(r.reportedAt)}</Text>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text>
                    </View>
                    <RowAction
                      r={r}
                      spinning={refreshing === r.line}
                      disabled={busy}
                      onSkip={() => toggle(r.line, "skip", "SKIPPED", "NEW")}
                      onForce={() => toggle(r.line, "force", "NEW", "OPEN")}
                    />
                  </View>
                  <Text style={styles.symptom} numberOfLines={2}>
                    {r.symptom}
                  </Text>
                  <Text style={styles.meta}>
                    {[
                      r.contactName,
                      r.contactPhone,
                      r.photoInFile ? "มีรูปในไฟล์" : r.photo ? "มีรูป (ลิงก์)" : null,
                      r.video ? "มีวิดีโอ" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  {r.reason ? <Text style={[styles.reason, { color: st.fg }]}>{r.reason}</Text> : null}
                  {r.status !== "ERROR" && r.branchOpen.length ? (
                    <View style={styles.openWrap}>
                      <Text style={styles.openHead}>ใบค้างที่สาขานี้ {r.branchOpen.length} ใบ — กดดูรายละเอียด:</Text>
                      {r.branchOpen.slice(0, OPEN_SHOWN).map((o) => {
                        const same = !!r.machineCode && o.machineCode === r.machineCode;
                        return (
                          <TouchableOpacity
                            key={o.id}
                            style={[styles.openChip, same && styles.openChipSame]}
                            onPress={() => onOpenOrder(o.id)}
                            accessibilityLabel={`ดูใบงาน ${o.code}`}
                          >
                            <Text style={[styles.openCode, same && { color: colors.warningInk }]}>{o.code}</Text>
                            <Text style={styles.openText} numberOfLines={1}>
                              {[o.machineCode ?? "ทั้งสาขา", o.title, o.statusLabel, day(o.createdAt)].join(" · ")}
                            </Text>
                            <Ionicons name="open-outline" size={13} color={colors.textMuted} />
                          </TouchableOpacity>
                        );
                      })}
                      {r.branchOpen.length > OPEN_SHOWN ? (
                        <Text style={styles.openHead}>และอีก {r.branchOpen.length - OPEN_SHOWN} ใบ</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      ) : null}
    </AppModal>
  );
}

/**
 * ปุ่มท้ายแถว: ใบใหม่ → เอาออก · เอาออกแล้ว → เอากลับ
 * มีใบค้าง → เปิดเพิ่ม (คนละเรื่อง) · เลือกเปิดเพิ่มแล้ว → ไม่เปิด (กลับไปข้าม)
 */
function RowAction({
  r,
  spinning,
  disabled,
  onSkip,
  onForce,
}: {
  r: Row;
  spinning: boolean;
  disabled: boolean;
  onSkip: () => void;
  onForce: () => void;
}) {
  const a =
    r.status === "OPEN"
      ? { text: "เปิดเพิ่ม (คนละเรื่อง)", icon: "add-circle-outline" as const, tone: colors.navy, on: onForce, label: `เปิดแถว ${r.line} เพิ่ม` }
      : r.forced
        ? { text: "ไม่เปิดเพิ่ม", icon: "arrow-undo-outline" as const, tone: colors.navy, on: onForce, label: `ไม่เปิดแถว ${r.line} เพิ่ม` }
        : r.status === "NEW"
          ? { text: "เอาออก", icon: "trash-outline" as const, tone: colors.dangerInk, on: onSkip, label: `เอาแถว ${r.line} ออก` }
          : r.status === "SKIPPED"
            ? { text: "เอากลับ", icon: "arrow-undo-outline" as const, tone: colors.navy, on: onSkip, label: `เอาแถว ${r.line} กลับ` }
            : null;
  if (!a) return null;
  return (
    <TouchableOpacity
      style={[styles.actBtn, { borderColor: a.tone === colors.dangerInk ? colors.dangerLine : colors.borderStrong }]}
      onPress={a.on}
      disabled={disabled}
      accessibilityLabel={a.label}
    >
      {spinning ? <Spinner color={colors.textMuted} size="small" /> : <Ionicons name={a.icon} size={14} color={a.tone} />}
      <Text style={[styles.actText, { color: a.tone }]}>{a.text}</Text>
    </TouchableOpacity>
  );
}

function Stat({
  n,
  label,
  tone,
  on,
  dim,
  onPress,
}: {
  n: number;
  label: string;
  tone: { fg: string; bg: string };
  on: boolean;
  dim: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.stat, { backgroundColor: tone.bg, borderColor: on ? tone.fg : "transparent" }, dim && { opacity: 0.5 }]}
      onPress={onPress}
      accessibilityLabel={`ดูเฉพาะ ${label}`}
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.statN, { color: tone.fg }]}>{n}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {on ? <Ionicons name="funnel" size={13} color={tone.fg} style={styles.statIcon} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 13, lineHeight: 20, color: colors.textMuted, marginBottom: spacing.sm },
  error: { color: colors.danger, marginTop: spacing.sm },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm },
  stat: {
    flexGrow: 1,
    flexBasis: 140,
    borderRadius: radius.md,
    borderWidth: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  statIcon: { position: "absolute", top: spacing.sm, right: spacing.sm },
  photoNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  photoNoteText: { flex: 1, fontSize: 13, lineHeight: 20, fontWeight: "600", color: colors.primaryInk },
  filterBar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  filterText: { fontSize: 13, fontWeight: "700", color: colors.text },
  filterAll: { fontSize: 13, fontWeight: "700", color: colors.navy, textDecorationLine: "underline" },
  empty: { fontSize: 13, color: colors.textMuted, paddingVertical: spacing.md, textAlign: "center" },
  statN: { fontSize: 22, lineHeight: 30, fontWeight: "700", fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  row: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  rowBad: { borderColor: colors.dangerLine },
  rowOut: { opacity: 0.55, borderStyle: "dashed" },
  actBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  actText: { fontSize: 12, fontWeight: "700" },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  lineNo: { fontSize: 12, color: colors.textFaint, fontVariant: ["tabular-nums"] },
  branch: { fontSize: 14, fontWeight: "700", color: colors.text },
  tag: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 6, paddingHorizontal: 6 },
  tagText: { fontSize: 12, lineHeight: 18, fontWeight: "600", color: colors.body },
  meta: { fontSize: 12.5, color: colors.textMuted },
  symptom: { fontSize: 13.5, lineHeight: 20, color: colors.text },
  reason: { fontSize: 12.5, fontWeight: "700" },
  openWrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 4 },
  openHead: { fontSize: 12, color: colors.textMuted },
  openChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.background,
  },
  openChipSame: { borderColor: colors.warningInk, backgroundColor: colors.warningSoft },
  openCode: { fontSize: 12, fontWeight: "700", color: colors.navy, fontVariant: ["tabular-nums"] },
  openText: { fontSize: 12, color: colors.body, flexShrink: 1 },
  badge: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 1 },
  badgeText: { fontSize: 11.5, fontWeight: "700" },
});
