/**
 * อัปเดตข้อมูลอะไหล่จากไฟล์ Excel (เจ้าของงานขอ ต.ค. 69 · แบบตามตัวอย่างที่ตกลง) — แอดมิน / Admin Spare Part
 *
 * เลือกไฟล์ (ยี่ห้อละไฟล์ หลายไฟล์พร้อมกัน) → ตรวจก่อนอัปเดต (ยังไม่เปลี่ยนอะไร) → อัปเดต → รายงาน
 * ส่งเซิร์ฟเวอร์ทีละไฟล์ — ไฟล์ที่มีรูปในเซลล์ใหญ่ได้หลายสิบ MB รวมกันคำขอเดียวเซิร์ฟเวอร์หน่วยความจำไม่พอ
 * ตอนอัปเดตส่งไฟล์เดิมอีกรอบ เซิร์ฟเวอร์อ่านใหม่ ไม่เชื่อรายการบนจอ (แบบนำเข้าอื่น)
 */
import React, { useEffect, useMemo, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import AppModal from "./AppModal";
import Spinner from "./Spinner";
import FileDropZone, { DropHint } from "./FileDropZone";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { showAlert } from "../utils/alert";
import { openUrl } from "../utils/share";
import { PickedFile, droppedFiles, pickFiles } from "../utils/filePicker";
import { PreparedSheet, shrinkXlsx } from "../utils/shrinkXlsx";
import { colors, radius, spacing } from "../theme";

type Action = "CREATE" | "UPDATE" | "SAME";
type ImageState = "NEW" | "CHANGED" | "KEPT" | null;
interface Item {
  line: number;
  partCode: string;
  name: string;
  brand: string;
  partNo: string;
  action: Action;
  diffs: { field: string; label: string; from: string; to: string }[];
  image: ImageState;
}
interface Problem {
  line: number;
  partCode: string | null;
  name: string | null;
  note: string;
}
interface Gone {
  partCode: string;
  name: string;
  brand: string | null;
  usedIn: number;
}
interface Summary {
  /** อัปเดตหยุดกลางทาง — บางรายการอาจบันทึกไปแล้ว (เซิร์ฟเวอร์เขียนประวัติก่อนลงมือ) */
  incomplete?: boolean;
  rows: number;
  changed: number;
  created: number;
  updated: number;
  images: number;
  same: number;
  skipped: number;
  notInFile: number;
}
interface FileResult {
  fileName: string;
  imageCount: number;
  columns: Record<string, string>;
  summary: Summary;
  items: Item[];
  problems: Problem[];
  notInFile: Gone[];
  codes?: string[];
  thumbs?: Record<string, string>;
}
/** ผลตรวจต่อไฟล์ — ไฟล์ที่อ่านไม่ได้เก็บข้อความไว้ ไฟล์อื่นยังอัปเดตได้ */
/** upload = ไฟล์ที่ย่อรูปแล้ว — ตอนกดอัปเดตส่งไฟล์เดียวกับที่ตรวจ ไม่ย่อใหม่ */
type Checked = { file: PickedFile; upload: PreparedSheet | null; result: FileResult | null; error: string | null };
/** เท่ากับที่เซิร์ฟเวอร์รับ (routes/spareParts.ts MAX_SHEET_BYTES) */
const MAX_SHEET_BYTES = 50 * 1024 * 1024;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
export interface Batch {
  batchId: string;
  createdAt: string;
  byName: string | null;
  totals: { changed: number; created: number; updated: number; images: number; same: number; skipped: number; notInFile: number; incomplete?: number };
  /** ไม่อยู่ในไฟล์ไหนเลยของรอบ (รายงานเต็มเท่านั้น) */
  notInFile?: Gone[];
  files: { id: number; fileName: string; createdAt: string; summary: Summary; details?: FileResult }[];
}

const ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const COLS: [string, string][] = [
  ["partCode", "รหัสสินค้า"],
  ["name", "ชื่อรวม (ไทย)"],
  ["brand", "ยี่ห้อ"],
  ["category", "Category"],
  ["partNo", "Part No."],
];
/** หัวคอลัมน์ในไฟล์ที่ไม่ได้ชื่อตรงกับช่องในระบบ (เช่น "Pant No.") — บอกให้เห็นว่าอ่านเป็นช่องไหน จะได้ไม่สงสัยว่าอ่านผิดคอลัมน์ */
const squash = (s: string) => s.toLowerCase().replace(/[\s.()]/g, "");
const colNote = (header: string | undefined, label: string) =>
  !header ? `ไม่มี ${label}` : squash(header).includes(squash(label)) ? `✓ ${header}` : `✓ ${header} (= ${label})`;
type Tab = "new" | "chg" | "img" | "same" | "bad" | "gone";
const TABS: { id: Tab; label: string; hint: string; fg: string; bg: string }[] = [
  { id: "new", label: "เพิ่มใหม่", hint: "รหัสที่ยังไม่มีในระบบ", fg: colors.successInk, bg: colors.successSoft },
  { id: "chg", label: "แก้ไข", hint: "ชื่อ · ยี่ห้อ · Part No. ต่างจากเดิม", fg: colors.primaryInk, bg: colors.primarySoft },
  { id: "img", label: "รูปใหม่ / เปลี่ยนรูป", hint: "รูปในไฟล์ต่างจากในระบบ", fg: colors.roleAdmin, bg: colors.roleAdminSoft },
  { id: "same", label: "เหมือนเดิม", hint: "ไม่ต้องทำอะไร", fg: colors.textMuted, bg: colors.background },
  { id: "bad", label: "มีปัญหา", hint: "ข้าม หรือใช้แถวหลัง", fg: colors.dangerInk, bg: colors.dangerSoft },
  { id: "gone", label: "ไม่อยู่ในไฟล์", hint: "ยี่ห้อเดียวกัน · ไม่ลบ", fg: colors.warningInk, bg: colors.warningSoft },
];
// รายการยาวเป็นร้อย — โชว์ทีละช่วง กดดูเพิ่มได้ หน้าต่างไม่หน่วง
const PAGE = 40;

const IMAGE_NOTE: Record<"NEW" | "CHANGED" | "KEPT", string> = {
  NEW: "เดิมไม่มีรูป → ใส่รูปจากไฟล์",
  CHANGED: "รูปในไฟล์ต่างจากรูปเดิม → แทนรูปเดิม",
  KEPT: "รูปในไฟล์ต่างจากรูปเดิม → เก็บรูปเดิมไว้",
};

const newBatchId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

async function send(file: PickedFile, upload: PreparedSheet, opts: { apply: boolean; replaceImages: boolean; batchId: string }) {
  const form = new FormData();
  form.append("file", upload.blob, file.name);
  if (upload.shrunk) form.append("imageHashes", JSON.stringify(upload.hashes));
  if (opts.apply) form.append("apply", "true");
  form.append("replaceImages", opts.replaceImages ? "true" : "false");
  form.append("batchId", opts.batchId);
  return (
    await api.post<FileResult>("/spare-parts/import", form, {
      headers: { "Content-Type": "multipart/form-data" },
      loadingText: false,
      // ไฟล์ใหญ่ + รูปหลายร้อยรูป — ค่าตั้งต้นของคำขออื่นสั้นเกิน
      timeout: 300_000,
    })
  ).data;
}

/**
 * รหัสเดียวกันอยู่หลายไฟล์ = ไฟล์ที่อัปเดตทีหลังทับ — นับเฉพาะรายการของไฟล์หลัง
 * (แต่ละไฟล์ตรวจแยกกันกับฐานข้อมูล ถ้าไม่หัก รหัสใหม่ตัวเดียวที่อยู่สองไฟล์นับเป็น "เพิ่ม 2")
 */
function lastItems(results: FileResult[]) {
  const last = new Map<string, Item>();
  for (const r of results) for (const i of r.items) last.set(i.partCode, i);
  return last;
}

/**
 * ไม่อยู่ในไฟล์ของทั้งรอบ — แต่ละไฟล์คิดเฉพาะรหัสของตัวเอง ไฟล์ยี่ห้อเดียวกันสองไฟล์ต่างคนต่างฟ้องว่าอีกครึ่งหาย
 * หักรหัสที่อยู่ในไฟล์ใดก็ได้ของรอบ แล้วนับตัวละครั้ง (เซิร์ฟเวอร์ทำแบบเดียวกันในรายงาน — notInBatch)
 */
function goneOf(results: FileResult[]) {
  const inBatch = new Set<string>();
  for (const r of results) {
    for (const c of r.codes ?? []) inBatch.add(c.toUpperCase());
    for (const p of r.problems) if (p.partCode) inBatch.add(p.partCode.toUpperCase());
  }
  const gone = new Map<string, Gone>();
  for (const r of results) for (const g of r.notInFile) if (!inBatch.has(g.partCode.toUpperCase())) gone.set(g.partCode.toUpperCase(), g);
  return [...gone.values()].sort((a, b) => a.partCode.localeCompare(b.partCode));
}

/** ตัวเลขรวมทุกไฟล์ — รูปที่เลือกเก็บไว้ไม่นับเป็นงานที่ต้องทำ */
function totalsOf(results: FileResult[], replace: boolean) {
  const all = [...lastItems(results).values()];
  const img = (i: Item) => i.image === "NEW" || (i.image === "CHANGED" && replace) || (i.image === "KEPT" && replace);
  const work = all.filter((i) => i.action !== "SAME" || img(i)).length;
  const rows = new Set(results.flatMap((r) => r.codes ?? [])).size;
  return {
    new: all.filter((i) => i.action === "CREATE").length,
    chg: all.filter((i) => i.action === "UPDATE").length,
    img: all.filter(img).length,
    same: Math.max(0, rows - work),
    bad: results.reduce((n, r) => n + r.problems.length, 0),
    gone: goneOf(results).length,
    work,
  };
}

export default function SparePartImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [checked, setChecked] = useState<Checked[] | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [replaceImages, setReplaceImages] = useState(true);
  const [tab, setTab] = useState<Tab>("new");
  const [shown, setShown] = useState(PAGE);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  /** ไฟล์ที่ยังไม่ได้อัปเดตเพราะหยุดกลางทาง (ไฟล์ที่พัง + ไฟล์ถัดไป) — บอกในรายงานและกดตรวจต่อได้ */
  const [remaining, setRemaining] = useState<{ file: PickedFile; error: string }[]>([]);
  const busy = progress !== null;

  function add(more: PickedFile[]) {
    if (!more.length) return;
    // ไฟล์ชื่อเดียวกันลากมาซ้ำ = ไฟล์ใหม่แทนไฟล์เดิม (แก้ไฟล์แล้วลากมาใหม่)
    setFiles((cur) => [...cur.filter((f) => !more.some((m) => m.name === f.name)), ...more]);
    setChecked(null);
    setApplyError(null);
  }

  async function check(list: PickedFile[] = files) {
    const out: Checked[] = [];
    const id = newBatchId();
    setApplyError(null);
    for (let k = 0; k < list.length; k++) {
      const f = list[k];
      const at = `${f.name} (${k + 1}/${list.length})`;
      let upload: PreparedSheet | null = null;
      try {
        // ย่อรูปใหญ่ก่อนส่ง — ไฟล์รูปเต็มขนาดเกิน 50 MB ได้ (Huebsch / Oasis)
        upload = await shrinkXlsx(f.blob, (n, total) => setProgress(`กำลังย่อรูปใน ${at} — รูป ${n}/${total}`));
        if (upload.after > MAX_SHEET_BYTES) {
          out.push({ file: f, upload, result: null, error: `ย่อรูปแล้วยังใหญ่ ${mb(upload.after)} (เกิน 50 MB) — แยกไฟล์ให้เล็กลง` });
          continue;
        }
        setProgress(`กำลังอ่าน ${at} — ไฟล์ที่มีรูปเยอะใช้เวลาสักครู่`);
        out.push({ file: f, upload, result: await send(f, upload, { apply: false, replaceImages, batchId: id }), error: null });
      } catch (e) {
        out.push({ file: f, upload, result: null, error: apiErrorMessage(e) });
      }
    }
    setProgress(null);
    setChecked(out);
    const ok = out.filter((c) => c.result).map((c) => c.result!);
    const t = totalsOf(ok, replaceImages);
    // เปิดที่แท็บแรกที่มีของ — เข้ามาแล้วเห็นสิ่งที่จะเปลี่ยนเลย ไม่ใช่แท็บว่าง
    setTab((["new", "chg", "img", "bad", "same", "gone"] as Tab[]).find((x) => t[x] > 0) ?? "same");
    setShown(PAGE);
  }

  async function apply() {
    if (!checked) return;
    const id = newBatchId();
    const ok = checked.filter((c) => c.result);
    setApplyError(null);
    let done = 0;
    let stopped: { at: number; error: string } | null = null;
    for (let k = 0; k < ok.length; k++) {
      setProgress(`กำลังอัปเดต ${ok[k].file.name} (${k + 1}/${ok.length})`);
      try {
        await send(ok[k].file, ok[k].upload!, { apply: true, replaceImages, batchId: id });
        done++;
      } catch (e) {
        stopped = { at: k, error: apiErrorMessage(e) };
        break;
      }
    }
    onDone();
    if (!done) {
      setProgress(null);
      setApplyError(`${ok[stopped?.at ?? 0]?.file.name ?? ""}: ${stopped?.error ?? ""} — ยังไม่ได้อัปเดตไฟล์ไหน กดอัปเดตซ้ำได้`);
      return;
    }
    const rest = stopped ? ok.slice(stopped.at).map((c, k) => ({ file: c.file, error: k === 0 ? stopped!.error : "หยุดก่อนถึงไฟล์นี้" })) : [];
    setRemaining(rest);
    // ยังไม่ปล่อยปุ่ม — ระหว่างรอรายงาน ปุ่มอัปเดตยังเป็นแผนเดิม กดซ้ำได้รอบเปล่าที่ทับแถบ "อัปเดตล่าสุด"
    setProgress("อัปเดตแล้ว — กำลังเปิดรายงาน…");
    try {
      setBatch((await api.get<Batch>(`/spare-parts/imports/batch/${id}`)).data);
    } catch (e) {
      setChecked(null);
      setFiles(rest.map((r) => r.file));
      showAlert("อัปเดตแล้ว แต่เปิดรายงานไม่ได้", `${apiErrorMessage(e)} — ดูได้จาก “อัปเดตจากไฟล์ล่าสุด” บนหน้าจัดการข้อมูลอะไหล่`);
    } finally {
      setProgress(null);
    }
  }

  if (batch) {
    // ไฟล์ที่อ่านไม่ได้ / ยังไม่ได้อัปเดตเพราะหยุดกลางทาง — บอกไว้ในรายงาน ไม่งั้นนึกว่ายี่ห้อนั้นอัปเดตแล้ว
    const failed = [
      ...(checked ?? []).filter((c) => c.error).map((c) => ({ name: c.file.name, error: c.error! })),
      ...remaining.map((r) => ({ name: r.file.name, error: r.error })),
    ];
    const retry = remaining.length
      ? () => {
          const list = remaining.map((r) => r.file);
          setBatch(null);
          setRemaining([]);
          setChecked(null);
          setFiles(list);
          check(list);
        }
      : undefined;
    return <ImportReportModal batch={batch} onClose={onClose} failed={failed} onRetry={retry} />;
  }

  const results = (checked ?? []).filter((c) => c.result).map((c) => c.result!);
  const totals = totalsOf(results, replaceImages);
  return (
    <AppModal
      visible
      onClose={onClose}
      busy={busy}
      width={980}
      title={checked ? "ตรวจก่อนอัปเดต — ยังไม่เปลี่ยนอะไรในระบบ" : "อัปเดตข้อมูลอะไหล่จากไฟล์ Excel"}
      subtitle={
        checked
          ? `${results.length} ไฟล์ · ${results.reduce((n, r) => n + r.summary.rows, 0)} แถว · กดแต่ละกล่องเพื่อดูรายการ`
          : "เทียบด้วยรหัสสินค้า — รหัสที่มีอยู่แล้วแก้ให้ตรงไฟล์ · รหัสใหม่เพิ่มเข้าระบบ · ไม่ลบอะไหล่ที่ไม่อยู่ในไฟล์"
      }
      footer={
        <View style={styles.actions}>
          {checked ? (
            <TouchableOpacity
              style={styles.secondary}
              onPress={() => {
                setChecked(null);
                setApplyError(null);
              }}
              disabled={busy}
              accessibilityLabel="เลือกไฟล์ใหม่"
            >
              <Text style={styles.secondaryText}>← เลือกไฟล์ใหม่</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.secondary} onPress={onClose} disabled={busy}>
              <Text style={styles.secondaryText}>ยกเลิก</Text>
            </TouchableOpacity>
          )}
          {checked ? (
            <TouchableOpacity
              style={[styles.primary, (busy || !totals.work) && styles.off]}
              onPress={apply}
              disabled={busy || !totals.work}
              accessibilityLabel="อัปเดตอะไหล่"
            >
              {busy ? (
                <Spinner color="#fff" size="small" />
              ) : (
                <Text style={styles.primaryText}>
                  {totals.work ? `อัปเดต ${totals.work} รายการ (เพิ่ม ${totals.new} · แก้ไข ${totals.chg} · รูป ${totals.img})` : "ไม่มีอะไรต้องอัปเดต"}
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primary, (busy || !files.length) && styles.off]}
              onPress={() => check()}
              disabled={busy || !files.length}
              accessibilityLabel="ตรวจก่อนอัปเดต"
            >
              {busy ? <Spinner color="#fff" size="small" /> : <Text style={styles.primaryText}>ตรวจก่อนอัปเดต ({files.length} ไฟล์)</Text>}
            </TouchableOpacity>
          )}
        </View>
      }
    >
      {progress ? (
        <View style={styles.progress} accessibilityLiveRegion="polite">
          <Spinner size="small" color={colors.primary} />
          <Text style={styles.progressText}>{progress}</Text>
        </View>
      ) : null}
      {applyError ? <Text style={styles.error}>{applyError}</Text> : null}
      {!checked ? (
        <PickStep files={files} busy={busy} onAdd={add} onRemove={(name) => setFiles((cur) => cur.filter((f) => f.name !== name))} />
      ) : (
        <PreviewStep
          checked={checked}
          results={results}
          totals={totals}
          tab={tab}
          setTab={(t) => {
            setTab(t);
            setShown(PAGE);
          }}
          shown={shown}
          more={() => setShown((n) => n + PAGE)}
          replaceImages={replaceImages}
          setReplaceImages={setReplaceImages}
        />
      )}
    </AppModal>
  );
}

function PickStep({
  files,
  busy,
  onAdd,
  onRemove,
}: {
  files: PickedFile[];
  busy: boolean;
  onAdd: (f: PickedFile[]) => void;
  onRemove: (name: string) => void;
}) {
  return (
    <View style={{ gap: spacing.md }}>
      <FileDropZone hint="ไฟล์ .xlsx หลายไฟล์พร้อมกันได้" label="วางไฟล์อะไหล่" disabled={busy} onFiles={(f) => onAdd(droppedFiles(f, ACCEPT))}>
        <View style={styles.drop}>
          <Ionicons name="cloud-upload-outline" size={30} color={colors.primaryInk} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.dropTitle}>ลากไฟล์มาวาง หรือกดเลือก — เลือกได้หลายไฟล์พร้อมกัน</Text>
            <Text style={styles.muted}>.xlsx แยกตามยี่ห้อแบบที่มีอยู่ (Haier · Huebsch · Maytag · Oasis · Other) · รูปที่วางในเซลล์ดึงออกมาให้เอง</Text>
          </View>
          <TouchableOpacity
            style={styles.pickBtn}
            onPress={async () => onAdd(await pickFiles(ACCEPT))}
            disabled={busy || Platform.OS !== "web"}
            accessibilityLabel="เลือกไฟล์อะไหล่"
          >
            <Text style={styles.pickBtnText}>เลือกไฟล์</Text>
          </TouchableOpacity>
        </View>
      </FileDropZone>
      {Platform.OS === "web" ? <DropHint /> : <Text style={styles.muted}>อัปเดตจากไฟล์ทำได้บนคอมพิวเตอร์ (เว็บ)</Text>}
      {files.length ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.groupLabel}>ไฟล์ที่เลือก ({files.length})</Text>
          {files.map((f) => (
            <View key={f.name} style={styles.fileRow}>
              <Text style={styles.xlsx}>XLSX</Text>
              <Text style={styles.fileName} numberOfLines={1}>
                {f.name}
              </Text>
              <Text style={styles.muted}>{(f.blob.size / 1024 / 1024).toFixed(1)} MB</Text>
              <TouchableOpacity onPress={() => onRemove(f.name)} disabled={busy} accessibilityLabel={`เอา ${f.name} ออก`} style={styles.removeBtn}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.note}>
        <Text style={styles.noteTitle}>ระบบอ่านอะไรจากไฟล์</Text>
        <Text style={styles.noteText}>
          รหัสสินค้า (ตัวเทียบ) · ชื่อรวม (ไทย) · ยี่ห้อสินค้า · Category · Part No. · รูปภาพประกอบ (รูปที่วางในเซลล์) — ลำดับข้ามไป
        </Text>
        <Text style={styles.noteText}>หัวคอลัมน์สลับที่ได้ · ชีตแรกของแต่ละไฟล์ · รูปใหญ่ในไฟล์ย่อให้เองก่อนส่ง (ด้านยาว 1,600 px) ไฟล์รูปเต็มขนาดเกิน 50 MB ก็ได้</Text>
      </View>
    </View>
  );
}

type Row = { key: string; file: string; title: string; meta: string; tag: string; fg: string; bg: string; lines: React.ReactNode[]; thumb?: string };

function PreviewStep({
  checked,
  results,
  totals,
  tab,
  setTab,
  shown,
  more,
  replaceImages,
  setReplaceImages,
}: {
  checked: Checked[];
  results: FileResult[];
  totals: ReturnType<typeof totalsOf>;
  tab: Tab;
  setTab: (t: Tab) => void;
  shown: number;
  more: () => void;
  replaceImages: boolean;
  setReplaceImages: (v: boolean) => void;
}) {
  // รหัสเดียวกันอยู่หลายไฟล์ — ไฟล์ที่อัปเดตทีหลังทับไฟล์ก่อน บอกให้รู้ก่อนกด
  const dupes = useMemo(() => {
    const seen = new Map<string, string[]>();
    for (const r of results) for (const c of r.codes ?? []) seen.set(c, [...(seen.get(c) ?? []), r.fileName]);
    return [...seen].filter(([, fs]) => fs.length > 1);
  }, [results]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    const t = TABS.find((x) => x.id === tab)!;
    if (tab === "same") {
      // แถวที่เหมือนเดิมไม่ได้ส่งมาทีละแถว (หลายร้อย) — บอกเป็นจำนวน
      const files = results.map((r) => r.fileName).join(" · ");
      return [{ key: "same", file: files, title: `เหมือนเดิม ${totals.same} รายการ`, meta: `ทุกช่องและรูปตรงกับในระบบแล้ว ไม่ต้องทำอะไร · ${files}`, tag: t.label, fg: t.fg, bg: t.bg, lines: [] }];
    }
    if (tab === "gone") {
      return goneOf(results).map((g) => ({
        key: `g${g.partCode}`,
        file: "",
        title: g.name,
        meta: [g.partCode, g.brand, "อยู่ในระบบ ไม่อยู่ในไฟล์ที่เลือก"].filter(Boolean).join(" · "),
        tag: "ไม่ลบ",
        fg: t.fg,
        bg: t.bg,
        lines: [
          <Text key="n" style={[styles.diff, { color: t.fg }]}>
            {g.usedIn ? `ไม่ลบ — ใบงานอ้างถึง ${g.usedIn} ใบ` : "ไม่ลบ — ยังไม่เคยใช้ในใบงาน ลบเองได้ที่หน้าจัดการข้อมูลอะไหล่"}
          </Text>,
        ],
      }));
    }
    // รหัสที่อยู่หลายไฟล์ โชว์เฉพาะของไฟล์หลัง (ไฟล์ที่ทับ) — ตัวเลขบนกล่องนับแบบเดียวกัน
    const last = lastItems(results);
    for (const r of results) {
      const base = (i: Item) => ({ key: `${r.fileName}|${i.partCode}`, file: r.fileName, title: i.name, thumb: r.thumbs?.[i.partCode] });
      const meta = (i: Item) => [i.partCode, i.brand, i.partNo ? `Part No. ${i.partNo}` : null, `${r.fileName} แถว ${i.line}`].filter(Boolean).join(" · ");
      if (tab === "new" || tab === "chg") {
        for (const i of r.items.filter((x) => x.action === (tab === "new" ? "CREATE" : "UPDATE") && last.get(x.partCode) === x)) {
          out.push({
            ...base(i),
            meta: meta(i),
            tag: t.label,
            fg: t.fg,
            bg: t.bg,
            lines: i.diffs.map((d) => (
              <Text key={d.field} style={styles.diff}>
                <Text style={styles.diffLabel}>{d.label} </Text>
                <Text style={styles.from}>{d.from}</Text>
                <Text style={styles.muted}> → </Text>
                <Text style={styles.to}>{d.to}</Text>
              </Text>
            )),
          });
        }
      } else if (tab === "img") {
        for (const i of r.items.filter((x) => x.image && last.get(x.partCode) === x)) {
          const state = i.image === "CHANGED" || i.image === "KEPT" ? (replaceImages ? "CHANGED" : "KEPT") : "NEW";
          if (state === "KEPT") continue;
          out.push({ ...base(i), meta: meta(i), tag: "รูป", fg: t.fg, bg: t.bg, lines: [<Text key="n" style={[styles.diff, { color: t.fg }]}>{IMAGE_NOTE[state]}</Text>] });
        }
      } else if (tab === "bad") {
        for (const p of r.problems) {
          out.push({
            key: `${r.fileName}|p${p.line}`,
            file: r.fileName,
            title: p.name ?? p.partCode ?? `แถว ${p.line}`,
            meta: [p.partCode, `${r.fileName} แถว ${p.line}`].filter(Boolean).join(" · "),
            tag: t.label,
            fg: t.fg,
            bg: t.bg,
            lines: [<Text key="n" style={[styles.diff, { color: t.fg, fontWeight: "600" }]}>{p.note}</Text>],
          });
        }
      }
    }
    if (tab === "bad") {
      for (const [code, fs] of dupes) {
        out.push({
          key: `dup|${code}`,
          file: fs.join(", "),
          title: code,
          meta: `อยู่ในหลายไฟล์: ${fs.join(", ")}`,
          tag: t.label,
          fg: t.fg,
          bg: t.bg,
          lines: [<Text key="n" style={[styles.diff, { color: t.fg, fontWeight: "600" }]}>{`รหัสซ้ำข้ามไฟล์ — ใช้ข้อมูลจาก ${fs[fs.length - 1]} (ไฟล์ที่อัปเดตทีหลัง)`}</Text>],
        });
      }
    }
    return out;
  }, [results, tab, replaceImages, dupes, totals.same]);

  const count: Record<Tab, number> = { new: totals.new, chg: totals.chg, img: totals.img, same: totals.same, bad: totals.bad + dupes.length, gone: totals.gone };
  const cur = TABS.find((x) => x.id === tab)!;
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.xs }}>
        {checked.map((c) => (
          <View key={c.file.name} style={[styles.fileRow, c.error ? styles.fileBad : null]}>
            <Text style={styles.xlsx}>XLSX</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.fileName} numberOfLines={1}>
                {c.file.name}
              </Text>
              {c.result ? (
                <Text style={styles.muted}>
                  {c.result.summary.rows} แถว · รูปในเซลล์ {c.result.imageCount} รูป ·{" "}
                  {c.upload?.shrunk ? `ย่อรูปใหญ่ ${c.upload.shrunk} รูป (${mb(c.upload.before)} → ${mb(c.upload.after)}) · ` : ""}
                  {COLS.map(([k, label]) => colNote(c.result!.columns[k], label)).join(" · ")}
                </Text>
              ) : (
                <Text style={styles.error}>{c.error}</Text>
              )}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.tiles}>
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.tile, on && { backgroundColor: t.bg, borderColor: t.fg, borderWidth: 2 }]}
              onPress={() => setTab(t.id)}
              accessibilityLabel={`${t.label} ${count[t.id]} รายการ`}
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.tileN, { color: t.fg }]}>{count[t.id]}</Text>
              <Text style={styles.tileLabel}>{t.label}</Text>
              <Text style={styles.tileHint}>{t.hint}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.groupLabel}>
        {cur.label} {count[tab]} รายการ
      </Text>
      {rows.length === 0 ? <Text style={styles.muted}>ไม่มีรายการในกลุ่มนี้</Text> : null}
      {rows.slice(0, shown).map((r) => (
        <View key={r.key} style={styles.row}>
          {r.thumb ? <Image source={{ uri: r.thumb }} style={styles.thumb} accessibilityLabel={`รูปจากไฟล์ ${r.title}`} /> : null}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={styles.rowTitle}>{r.title}</Text>
            <Text style={styles.muted}>{r.meta}</Text>
            {r.lines}
          </View>
          <Text style={[styles.tag, { color: r.fg, backgroundColor: r.bg }]}>{r.tag}</Text>
        </View>
      ))}
      {rows.length > shown ? (
        <TouchableOpacity onPress={more} accessibilityLabel="ดูเพิ่ม">
          <Text style={styles.link}>ดูเพิ่มอีก {Math.min(PAGE, rows.length - shown)} จาก {rows.length - shown} รายการ</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity style={styles.check} onPress={() => setReplaceImages(!replaceImages)} accessibilityLabel="แทนรูปเดิมด้วยรูปในไฟล์" accessibilityState={{ checked: replaceImages }}>
        <Ionicons name={replaceImages ? "checkbox" : "square-outline"} size={20} color={replaceImages ? colors.primary : colors.textFaint} />
        <Text style={styles.checkText}>
          <Text style={{ fontWeight: "700" }}>แทนรูปเดิมด้วยรูปในไฟล์</Text> — เอาติ๊กออก = เก็บรูปที่เคยอัปโหลดในแอปไว้ เติมรูปเฉพาะอะไหล่ที่ยังไม่มีรูป
        </Text>
      </TouchableOpacity>
      <Text style={styles.muted}>
        ช่องว่างในไฟล์ไม่ลบค่าเดิม (เช่น Part No. ว่าง = คง Part No. เดิมไว้) · อะไหล่ที่ไม่อยู่ในไฟล์ไม่ถูกลบ — ใบงานเก่ายังอ้างถึงอยู่
        ถ้าเลิกใช้แล้วลบเองที่หน้าจัดการข้อมูลอะไหล่
      </Text>
    </View>
  );
}

/** รายงานรอบอัปเดต — หลังกดอัปเดต และจาก "อัปเดตจากไฟล์ล่าสุด … ดูรายละเอียด" */
export function ImportReportModal({
  batch,
  onClose,
  failed = [],
  onRetry,
}: {
  batch: Batch;
  onClose: () => void;
  failed?: { name: string; error: string }[];
  /** หยุดกลางทาง — ตรวจแล้วอัปเดตเฉพาะไฟล์ที่ยังไม่ได้ทำ */
  onRetry?: () => void;
}) {
  const [full, setFull] = useState<Batch | null>(batch.files.every((f) => f.details) ? batch : null);
  const [open, setOpen] = useState<number | null>(batch.files[0]?.id ?? null);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    if (full) return;
    api
      .get<Batch>(`/spare-parts/imports/batch/${batch.batchId}`)
      .then((r) => setFull(r.data))
      .catch((e) => showAlert("เปิดรายงานไม่ได้", apiErrorMessage(e)));
  }, []);

  async function download() {
    setDownloading(true);
    try {
      const res = await api.get<{ filename: string; path: string }>(`/spare-parts/imports/batch/${batch.batchId}/excel`, {
        loadingText: "กำลังสร้างไฟล์ Excel...",
      });
      const url = resolveImageUrl(res.data.path);
      if (url) await openUrl(url);
    } catch (e) {
      showAlert("ดาวน์โหลดไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  const t = batch.totals;
  const when = new Date(batch.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <AppModal
      visible
      onClose={onClose}
      width={880}
      title={`อัปเดตข้อมูลอะไหล่แล้ว ${t.changed} รายการ`}
      subtitle={`${when} · โดย ${batch.byName ?? "—"} · ${batch.files.map((f) => f.fileName).join(" · ")}`}
      footer={
        <View style={styles.actions}>
          {onRetry ? (
            <TouchableOpacity style={styles.secondary} onPress={onRetry} accessibilityLabel="ตรวจไฟล์ที่ยังไม่ได้อัปเดต">
              <Text style={styles.secondaryText}>ตรวจไฟล์ที่ยังไม่ได้อัปเดต</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.secondary} onPress={download} disabled={downloading} accessibilityLabel="ดาวน์โหลดรายงาน">
            {downloading ? <Spinner size="small" color={colors.primary} /> : <Text style={styles.secondaryText}>ดาวน์โหลดรายงาน (Excel)</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.primary} onPress={onClose} accessibilityLabel="กลับไปหน้าข้อมูลอะไหล่">
            <Text style={styles.primaryText}>กลับไปหน้าข้อมูลอะไหล่</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.tiles}>
        {(
          [
            [t.created, "เพิ่มใหม่", colors.successInk, colors.successSoft],
            [t.updated, "แก้ไข", colors.primaryInk, colors.primarySoft],
            [t.images, "รูปใหม่ / เปลี่ยนรูป", colors.roleAdmin, colors.roleAdminSoft],
            [t.skipped, "ข้าม / มีปัญหา", colors.dangerInk, colors.dangerSoft],
            [t.same, "เหมือนเดิม", colors.textMuted, colors.background],
          ] as const
        ).map(([n, label, fg, bg]) => (
          <View key={label} style={[styles.tile, { backgroundColor: bg, minHeight: 0 }]}>
            <Text style={[styles.tileN, { color: fg }]}>{n}</Text>
            <Text style={styles.tileLabel}>{label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.groupLabel}>รายละเอียด (แยกตามไฟล์)</Text>
      {!full ? <Spinner color={colors.primary} /> : null}
      {(full?.files ?? []).map((f) => {
        const d = f.details!;
        const s = f.summary;
        const isOpen = open === f.id;
        return (
          <View key={f.id} style={styles.fileBox}>
            <TouchableOpacity onPress={() => setOpen(isOpen ? null : f.id)} accessibilityLabel={`รายละเอียด ${f.fileName}`} style={styles.fileHead}>
              <Ionicons name={isOpen ? "chevron-down" : "chevron-forward"} size={16} color={colors.textMuted} />
              <Text style={styles.fileName}>
                {f.fileName} — เพิ่ม {s.created} · แก้ไข {s.updated} · รูป {s.images} · ข้าม {s.skipped}
              </Text>
            </TouchableOpacity>
            {s.incomplete ? (
              <Text style={styles.error}>อัปเดตไม่ครบ — หยุดกลางทาง รายการข้างล่างบางส่วนอาจยังไม่ถูกบันทึก เลือกไฟล์นี้แล้วกดอัปเดตซ้ำได้</Text>
            ) : null}
            {isOpen ? (
              <View style={{ gap: 4, paddingTop: 6 }}>
                {d.items.map((i) => (
                  <Text key={i.partCode} style={styles.reportLine}>
                    <Text style={{ fontWeight: "700", color: i.action === "CREATE" ? colors.successInk : i.action === "UPDATE" ? colors.primaryInk : colors.roleAdmin }}>
                      {i.action === "CREATE" ? "เพิ่ม" : i.action === "UPDATE" ? "แก้ไข" : "รูป"}
                    </Text>{" "}
                    {i.partCode} {i.name}
                    {i.action === "CREATE" && i.partNo ? ` · Part No. ${i.partNo}` : ""}
                    {[...i.diffs.map((x) => ` — ${x.label} ${x.from} → ${x.to}`), i.image ? ` — ${IMAGE_NOTE[i.image]}` : ""].join("")}
                  </Text>
                ))}
                {d.problems.map((p) => (
                  <Text key={`p${p.line}`} style={styles.reportLine}>
                    <Text style={{ fontWeight: "700", color: colors.dangerInk }}>ข้าม/มีปัญหา</Text> แถว {p.line} {p.partCode ?? ""} {p.name ?? ""} — {p.note}
                  </Text>
                ))}
                {!d.items.length && !d.problems.length ? <Text style={styles.muted}>ไม่มีอะไรเปลี่ยนในไฟล์นี้</Text> : null}
              </View>
            ) : null}
          </View>
        );
      })}
      {full?.notInFile?.length ? (
        <Text style={[styles.reportLine, { color: colors.warningInk }]}>
          ไม่อยู่ในไฟล์ไหนเลยของรอบนี้ (ไม่ลบ) {full.notInFile.length} รายการ: {full.notInFile.slice(0, 10).map((g) => g.partCode).join(", ")}
          {full.notInFile.length > 10 ? ` และอีก ${full.notInFile.length - 10}` : ""}
        </Text>
      ) : null}
      {failed.map((f) => (
        <View key={f.name} style={[styles.fileBox, styles.fileBad]}>
          <Text style={[styles.reportLine, { color: colors.dangerInk, fontWeight: "600" }]}>
            {f.name} — ไม่ได้อัปเดต: {f.error}
          </Text>
        </View>
      ))}
      <Text style={styles.muted}>รายงานนี้เก็บไว้ — เปิดดูอีกได้จาก “อัปเดตจากไฟล์ล่าสุด … ดูรายละเอียด” บนหน้าจัดการข้อมูลอะไหล่</Text>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  actions: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  secondary: { flex: 1, minHeight: 46, minWidth: 160, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.sky50 },
  secondaryText: { fontSize: 15, lineHeight: 22, color: colors.primaryInk, fontWeight: "700" },
  primary: { flex: 2, minHeight: 46, minWidth: 220, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.navyFill, paddingHorizontal: 12 },
  primaryText: { color: "#fff", fontSize: 15, lineHeight: 22, fontWeight: "700", textAlign: "center" },
  off: { opacity: 0.5 },
  progress: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.sm },
  progressText: { flex: 1, fontSize: 14, lineHeight: 21, color: colors.primaryInk, fontWeight: "600" },
  error: { color: colors.dangerInk, fontSize: 13, lineHeight: 20, fontWeight: "600" },
  drop: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.sky50,
    borderRadius: 14,
    padding: spacing.md,
  },
  dropTitle: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.navy },
  pickBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.navy, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  pickBtnText: { fontSize: 14, fontWeight: "700", color: colors.navy },
  muted: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
  groupLabel: { fontSize: 13, lineHeight: 20, fontWeight: "800", color: colors.textMuted },
  fileRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.sm, backgroundColor: colors.card },
  fileBad: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  xlsx: { fontSize: 11, fontWeight: "800", color: "#fff", backgroundColor: "#1D6F42", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: "hidden" },
  fileName: { flexShrink: 1, fontSize: 14, lineHeight: 21, fontWeight: "600", color: colors.text },
  removeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  note: { backgroundColor: colors.background, borderRadius: 12, padding: spacing.md, gap: 4 },
  noteTitle: { fontSize: 13, fontWeight: "800", color: colors.navy },
  noteText: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: 140,
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.sm,
    backgroundColor: colors.card,
    gap: 2,
  },
  tileN: { fontSize: 24, lineHeight: 30, fontWeight: "800" },
  tileLabel: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.text },
  tileHint: { fontSize: 11.5, lineHeight: 17, color: colors.textMuted },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.sm, backgroundColor: colors.card },
  thumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: colors.background },
  rowTitle: { fontSize: 14, lineHeight: 21, fontWeight: "600", color: colors.text },
  diff: { fontSize: 13, lineHeight: 20, color: colors.text },
  diffLabel: { fontWeight: "700", color: colors.textMuted },
  from: { textDecorationLine: "line-through", color: colors.dangerInk },
  to: { fontWeight: "700", color: colors.successInk },
  tag: { fontSize: 12, fontWeight: "700", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, overflow: "hidden" },
  link: { fontSize: 14, fontWeight: "700", color: colors.primaryInk },
  check: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: colors.background, borderRadius: 12, padding: spacing.md },
  checkText: { flex: 1, fontSize: 14, lineHeight: 21, color: colors.text },
  fileBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.sm, backgroundColor: colors.card },
  fileHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  reportLine: { fontSize: 13, lineHeight: 20, color: colors.text },
});
