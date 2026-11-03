/**
 * อัปเดตข้อมูลอะไหล่จากไฟล์ Excel (เจ้าของงานขอ ต.ค. 69 · แบบตามตัวอย่างที่ตกลง) — แอดมิน / Admin Spare Part
 *
 * เลือกไฟล์ (ยี่ห้อละไฟล์ หลายไฟล์พร้อมกัน) → ตรวจก่อนอัปเดต (ยังไม่เปลี่ยนอะไร) → อัปเดต → รายงาน
 * ส่งเซิร์ฟเวอร์ทีละไฟล์ — ไฟล์ที่มีรูปในเซลล์ใหญ่ได้หลายสิบ MB รวมกันคำขอเดียวเซิร์ฟเวอร์หน่วยความจำไม่พอ
 * ตอนอัปเดตส่งไฟล์เดิมอีกรอบ เซิร์ฟเวอร์อ่านใหม่ ไม่เชื่อรายการบนจอ (แบบนำเข้าอื่น)
 *
 * ไฟล์ยี่ห้อของอะไหล่มาจากชื่อไฟล์ (เจ้าของงาน 31 ต.ค. 69: "อิงจากชื่อไฟล์แล้วไปแมพกับใบงาน") — ทุกรหัสในไฟล์
 * เข้าไฟล์ยี่ห้อนั้น ช่างจึงเลือกได้กับเครื่องยี่ห้อนั้น ชื่อไฟล์ที่ไม่บอกยี่ห้อ/บอกหลายยี่ห้อต้องให้แอดมินเลือกที่หน้าตรวจ
 * เพราะเดาผิดแล้วอะไหล่ไปโผล่ในเครื่องยี่ห้ออื่น · ชื่อที่ตรงยี่ห้อเดียวเปลี่ยนไม่ได้ ไฟล์เดิมอัปซ้ำจะได้ลงที่เดิมเสมอ
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import AppModal from "./AppModal";
import Spinner from "./Spinner";
import FileDropZone, { DropHint } from "./FileDropZone";
import axios from "axios";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { showAlert } from "../utils/alert";
import { openUrl } from "../utils/share";
import { PickedFile, droppedFiles, pickFiles } from "../utils/filePicker";
import { PreparedSheet, shrinkXlsx } from "../utils/shrinkXlsx";
import { BRAND_FILES, BrandFile, SHARED_FILE } from "../utils/brandFile";
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
  /** ไฟล์ยี่ห้อที่อะไหล่ยังอยู่ (ประวัติก่อนมีไฟล์ยี่ห้อไม่มีค่านี้) */
  file?: string | null;
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
  /** รหัสในไฟล์ที่ยังไม่อยู่ในไฟล์ยี่ห้อนี้ (รวมรหัสใหม่) — อัปเดตแล้วช่างเลือกได้ · 0 ตอนยังไม่รู้ยี่ห้อ */
  joined?: number;
  /** รหัสที่อยู่ในไฟล์ยี่ห้อนี้แล้วจากการเดาตอนขึ้นระบบ/ติ๊กเอง — อัปเดตแล้วนับว่าไฟล์จริงยืนยัน */
  confirmed?: number;
}
interface FileResult {
  fileName: string;
  imageCount: number;
  columns: Record<string, string>;
  summary: Summary;
  items: Item[];
  problems: Problem[];
  /** อะไหล่ที่อยู่ในไฟล์ยี่ห้อนี้ในระบบ แต่ไม่อยู่ในไฟล์ที่อัปโหลด — ยังไม่รู้ยี่ห้อ = [] */
  notInFile: Gone[];
  /** ไฟล์ยี่ห้อของไฟล์นี้ · null = ชื่อไฟล์ไม่บอก/บอกหลายยี่ห้อ ยังไม่ได้เลือก */
  brandFile?: BrandFile | null;
  brandFileFrom?: "name" | "chosen" | null;
  /** ยี่ห้อที่ชื่อไฟล์ตรง (มีค่าเฉพาะตอนตรงหลายยี่ห้อ) */
  brandFileMatches?: BrandFile[];
  codes?: string[];
  thumbs?: Record<string, string>;
  /** ค่าทุกแถวของไฟล์ (หน้าตรวจเท่านั้น) — ใช้จำลองรหัสที่อยู่หลายไฟล์ */
  rowValues?: Record<string, RowVal>;
}
interface RowVal {
  line: number;
  name: string;
  brand: string;
  category: string;
  partNo: string;
  hasImage: boolean;
}
const FIELDS = ["name", "brand", "category", "partNo"] as const;
const FIELD_LABEL: Record<(typeof FIELDS)[number], string> = { name: "ชื่อ", brand: "ยี่ห้อ", category: "หมวดหมู่", partNo: "Part No." };
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
  totals: {
    changed: number;
    created: number;
    updated: number;
    images: number;
    same: number;
    skipped: number;
    notInFile: number;
    incomplete?: number;
    /** รหัสที่เข้าไฟล์ยี่ห้อใหม่ รวมทุกไฟล์ของรอบ */
    joined?: number;
  };
  /** ไม่อยู่ในไฟล์ไหนเลยของรอบ (รายงานเต็มเท่านั้น) */
  notInFile?: Gone[];
  files: { id: number; fileName: string; createdAt: string; summary: Summary; brandFile?: string | null; details?: FileResult }[];
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
  { id: "gone", label: "ไม่อยู่ในไฟล์", hint: "อยู่ในไฟล์ยี่ห้อเดียวกัน · ไม่ลบ", fg: colors.warningInk, bg: colors.warningSoft },
];
// รายการยาวเป็นร้อย — โชว์ทีละช่วง กดดูเพิ่มได้ หน้าต่างไม่หน่วง
const PAGE = 40;

const IMAGE_NOTE: Record<"NEW" | "CHANGED" | "KEPT", string> = {
  NEW: "เดิมไม่มีรูป → ใส่รูปจากไฟล์",
  CHANGED: "รูปในไฟล์ต่างจากรูปเดิม → แทนรูปเดิม",
  KEPT: "รูปในไฟล์ต่างจากรูปเดิม → เก็บรูปเดิมไว้",
};

const newBatchId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

async function send(
  file: PickedFile,
  upload: PreparedSheet,
  opts: { apply: boolean; replaceImages: boolean; batchId: string; brandFile?: BrandFile | null }
) {
  const form = new FormData();
  form.append("file", upload.blob, file.name);
  if (upload.shrunk) form.append("imageHashes", JSON.stringify(upload.hashes));
  if (opts.apply) form.append("apply", "true");
  // ส่งเฉพาะยี่ห้อที่แอดมินเลือกเอง — ชื่อไฟล์ที่บอกยี่ห้ออยู่แล้วเซิร์ฟเวอร์อ่านจากชื่อเอง (ส่งยี่ห้ออื่นไปจะโดนปฏิเสธ)
  if (opts.brandFile) form.append("brandFile", opts.brandFile);
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

/** รายการที่จะเปลี่ยนจริง ต่อรหัส — file/thumb ไว้โชว์ว่ามาจากไฟล์ไหน */
type Planned = { item: Item; file: string; thumb?: string };

/**
 * รายการที่จะเกิดจริงหลังอัปเดตทุกไฟล์ตามลำดับ
 *
 * แต่ละไฟล์ถูกเทียบกับฐานข้อมูลแยกกัน รหัสเดียวกันอยู่หลายไฟล์จึงนับซ้ำ ("เพิ่ม 2" ทั้งที่เพิ่มตัวเดียว)
 * และ "ไฟล์หลังชนะ" ก็ไม่จริงเสมอ: ช่องว่างในไฟล์หลังคงค่าจากไฟล์ก่อน · ไฟล์หลังที่ตรงกับฐานข้อมูลเขียนค่ากลับ
 * จึงจำลองเอง: ค่าในฐานข้อมูลรู้จาก diff (ค่าเดิม) หรือจากแถวที่ไม่ต่าง (= ค่าในฐานข้อมูล) แล้วไล่ทับตามลำดับไฟล์
 * รูป: แทนรูป = รูปของไฟล์สุดท้ายที่มีรูปชนะ · เก็บรูปเดิม = ไฟล์แรกที่มีรูปเท่านั้นที่ใส่ได้ (ตอนนั้นยังไม่มีรูป)
 */
function plannedItems(results: FileResult[], replace: boolean): Planned[] {
  const norm = (i: Item): Item => (i.image === "CHANGED" || i.image === "KEPT" ? { ...i, image: replace ? "CHANGED" : "KEPT" } : i);
  const seqs = new Map<string, { r: FileResult; row?: RowVal; item?: Item }[]>();
  for (const r of results) {
    const items = new Map(r.items.map((i) => [i.partCode, i]));
    for (const c of r.codes ?? []) seqs.set(c, [...(seqs.get(c) ?? []), { r, row: r.rowValues?.[c], item: items.get(c) }]);
  }
  const out: Planned[] = [];
  for (const [code, seq] of seqs) {
    const last = seq[seq.length - 1];
    const thumb = [...seq].reverse().find((x) => x.r.thumbs?.[code])?.r.thumbs?.[code];
    if (seq.length === 1) {
      if (last.item) out.push({ item: norm(last.item), file: last.r.fileName, thumb });
      continue;
    }
    const created = seq.some((x) => x.item?.action === "CREATE");
    const db: Partial<Record<(typeof FIELDS)[number], string>> = {};
    if (!created) {
      for (const x of seq) {
        for (const f of FIELDS) {
          const d = x.item?.diffs.find((y) => y.field === f);
          if (d) db[f] = d.from === "(ว่าง)" ? "" : d.from;
          else if (x.row?.[f] && db[f] === undefined) db[f] = x.row[f];
        }
      }
    }
    const fin = { ...db };
    for (const x of seq) for (const f of FIELDS) if (x.row?.[f]) fin[f] = x.row[f];
    const diffs = created
      ? []
      : FIELDS.filter((f) => fin[f] !== undefined && fin[f] !== (db[f] ?? "")).map((f) => ({ field: f, label: FIELD_LABEL[f], from: db[f] || "(ว่าง)", to: fin[f]! }));
    const withImg = seq.filter((x) => x.row?.hasImage);
    let image: ImageState = null;
    if (withImg.length) {
      if (created) image = "NEW";
      else {
        const decisive = replace ? withImg[withImg.length - 1] : withImg[0];
        image = decisive.item?.image ? norm(decisive.item).image : null;
      }
    }
    const action: Action = created ? "CREATE" : diffs.length ? "UPDATE" : "SAME";
    if (action === "SAME" && !image) continue;
    out.push({
      item: { line: last.row?.line ?? last.item?.line ?? 0, partCode: code, name: fin.name ?? last.row?.name ?? "", brand: fin.brand ?? "", partNo: fin.partNo ?? "", action, diffs, image },
      file: seq.map((x) => x.r.fileName).join(" → "),
      thumb,
    });
  }
  return out;
}

/**
 * ไม่อยู่ในไฟล์ของทั้งรอบ คิดแยกตามไฟล์ยี่ห้อ — แต่ละไฟล์ฟ้องอะไหล่ที่อยู่ในไฟล์ยี่ห้อนั้นในระบบแต่ไม่อยู่ในไฟล์ที่อัปโหลด
 * ยี่ห้อเดียวกันแยกสองไฟล์ (Huebsch 1 + Huebsch 2) ต่างคนต่างฟ้องว่าอีกครึ่งหาย จึงหักรหัสของไฟล์ยี่ห้อเดียวกันในรอบ
 * แต่ไม่หักรหัสของไฟล์ยี่ห้ออื่น: รหัสที่ยังอยู่ในไฟล์ Haier ไม่ได้แปลว่ายังอยู่ในไฟล์ Huebsch
 * รหัสหนึ่งอยู่ได้หลายไฟล์ จึงนับต่อ (ไฟล์ยี่ห้อ, รหัส) · เซิร์ฟเวอร์ทำแบบเดียวกันในรายงาน (notInBatch)
 * ไฟล์ที่ยังไม่รู้ยี่ห้อไม่มีรายการนี้ — เลือกยี่ห้อแล้วหน้าตรวจถามเซิร์ฟเวอร์ใหม่
 */
type GoneRow = Gone & { file: BrandFile };
function goneOf(results: FileResult[]): GoneRow[] {
  const inBatch = new Map<BrandFile, Set<string>>();
  for (const r of results) {
    if (!r.brandFile) continue;
    const codes = inBatch.get(r.brandFile) ?? new Set<string>();
    for (const c of r.codes ?? []) codes.add(c.toUpperCase());
    for (const p of r.problems) if (p.partCode) codes.add(p.partCode.toUpperCase());
    inBatch.set(r.brandFile, codes);
  }
  const gone = new Map<string, GoneRow>();
  for (const r of results) {
    const file = r.brandFile;
    if (!file) continue;
    for (const g of r.notInFile) {
      const code = g.partCode.toUpperCase();
      if (!inBatch.get(file)!.has(code)) gone.set(`${file}|${code}`, { ...g, file });
    }
  }
  return [...gone.values()].sort((a, b) => a.partCode.localeCompare(b.partCode) || a.file.localeCompare(b.file));
}

/** รหัสที่จะเข้าไฟล์ยี่ห้อตอนอัปเดต รวมทุกไฟล์ที่รู้ยี่ห้อแล้ว — งานที่ต้องทำแม้ชื่อ/รูปไม่เปลี่ยนเลย (อัปไฟล์เดิมซ้ำครั้งแรกหลังเปิดใช้) */
const joinedOf = (results: FileResult[]) => results.reduce((n, r) => n + (r.brandFile ? r.summary.joined ?? 0 : 0), 0);
/**
 * รหัสที่ไฟล์จะยืนยัน (แถวไฟล์ยี่ห้อที่ตั้งจากช่องยี่ห้อตอนขึ้นระบบหรือติ๊กเอง → IMPORT) — ก็เป็นงานเหมือนกัน
 * ไฟล์ที่ข้อมูลตรงฐานข้อมูลทุกช่องและรหัสอยู่ในไฟล์ยี่ห้อนั้นจากการตั้งค่าตอนขึ้นระบบแล้ว (อัปครบ 6 ไฟล์ครั้งแรกหลังเปิดใช้)
 * ถ้าไม่นับ ปุ่มขึ้น "ไม่มีอะไรต้องอัปเดต" กดไม่ได้ แถวที่เดาไว้ค้างเป็น SEED ทั้งที่ไฟล์จริงมีรหัสนั้น
 */
const confirmedOf = (results: FileResult[]) => results.reduce((n, r) => n + (r.brandFile ? r.summary.confirmed ?? 0 : 0), 0);

/** ตัวเลขรวมทุกไฟล์ — รูปที่เลือกเก็บไว้ไม่นับเป็นงานที่ต้องทำ */
function totalsOf(results: FileResult[], replace: boolean) {
  const all = plannedItems(results, replace).map((p) => p.item);
  const img = (i: Item) => i.image === "NEW" || i.image === "CHANGED";
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
  /** ไฟล์ที่กดอัปเดตตอนยังไม่ได้เลือกยี่ห้อ — แถบเตือนปักใต้หัวหน้าต่าง (ปุ่มอยู่ล่าง ชิปอยู่บน มองไม่เห็นพร้อมกัน) */
  const [needBrand, setNeedBrand] = useState<string[] | null>(null);
  /**
   * ยี่ห้อที่แอดมินเลือกให้ไฟล์ — ตรวจซ้ำหลังหยุดกลางทาง/เลือกไฟล์ใหม่ไม่ต้องเลือกอีก (ไฟล์เดิม = ผลเทียบชื่อเดิม)
   * จำตามตัวไฟล์ที่เลือกมา ไม่ใช่ตามชื่อ: ไฟล์ชื่อกลาง ๆ อย่าง Book1.xlsx ของสองยี่ห้อ ลากตัวที่สองมาแทนตัวแรก
   * ถ้าจำตามชื่อ ตัวที่สองจะได้ยี่ห้อของตัวแรกโดยไม่มีกล่องเหลืองถาม แล้วรหัสทั้งไฟล์เข้าไฟล์ยี่ห้อผิด (อัปโหลดไม่เคยเอาออก)
   */
  const choices = useRef(new WeakMap<PickedFile, BrandFile>());
  const scrollRef = useRef<ScrollView>(null);
  const busy = progress !== null;

  function add(more: PickedFile[]) {
    if (!more.length) return;
    // ไฟล์ชื่อเดียวกันลากมาซ้ำ = ไฟล์ใหม่แทนไฟล์เดิม (แก้ไฟล์แล้วลากมาใหม่)
    setFiles((cur) => [...cur.filter((f) => !more.some((m) => m.name === f.name)), ...more]);
    setChecked(null);
    setApplyError(null);
  }

  // กันกดซ้ำ — อ่านไฟล์ 200 MB ใช้เวลาเป็นวินาทีก่อนจะมีความคืบหน้าแรก ระหว่างนั้นปุ่มยังกดได้
  const running = useRef(false);

  async function check(list: PickedFile[] = files) {
    if (running.current || !list.length) return;
    running.current = true;
    try {
      await checkFiles(list);
    } finally {
      running.current = false;
    }
  }

  async function checkFiles(list: PickedFile[]) {
    const out: Checked[] = [];
    const id = newBatchId();
    setApplyError(null);
    setNeedBrand(null);
    setProgress(`กำลังเปิด ${list[0].name}…`);
    for (let k = 0; k < list.length; k++) {
      const f = list[k];
      const at = `${f.name} (${k + 1}/${list.length})`;
      let upload: PreparedSheet | null = null;
      try {
        // ย่อรูปใหญ่ก่อนส่ง — ไฟล์รูปเต็มขนาดเกิน 50 MB ได้ (Huebsch / Oasis)
        upload = await shrinkXlsx(f.blob, (n, total, round) =>
          setProgress(
            round === 1 ? `กำลังย่อรูปใน ${at} — รูป ${n}/${total}` : `${at} ยังใหญ่เกิน — ย่อรูปเพิ่ม รอบ ${round} — รูป ${n}/${total}`
          )
        );
        if (upload.after > MAX_SHEET_BYTES) {
          const error = upload.shrunk
            ? `ย่อรูปแล้วยังใหญ่ ${mb(upload.after)} (เกิน 50 MB) — แยกไฟล์ให้เล็กลง`
            : `ไฟล์ใหญ่ ${mb(upload.after)} (เกิน 50 MB) และไม่มีรูปที่ย่อได้ — แยกไฟล์ให้เล็กลง`;
          out.push({ file: f, upload, result: null, error });
          continue;
        }
        setProgress(`กำลังอ่าน ${at} — ไฟล์ที่มีรูปเยอะใช้เวลาสักครู่`);
        const result = await send(f, upload, { apply: false, replaceImages, batchId: id, brandFile: choices.current.get(f) });
        out.push({ file: f, upload, result, error: null });
      } catch (e) {
        // ข้อผิดพลาดที่ไม่ได้มาจากเซิร์ฟเวอร์ (ย่อรูปในเครื่องพัง) — apiErrorMessage ให้ข้อความภาษาอังกฤษ
        const error = axios.isAxiosError(e) ? apiErrorMessage(e) : "เปิดหรือย่อรูปในไฟล์ไม่สำเร็จ — ไฟล์อาจเสีย ลองเปิดใน Excel แล้วบันทึกใหม่";
        out.push({ file: f, upload, result: null, error });
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

  /**
   * เลือกยี่ห้อให้ไฟล์ที่ชื่อไม่บอก → ถามหน้าตรวจของไฟล์นั้นใหม่พร้อมยี่ห้อ (ไฟล์ที่ย่อรูปแล้วยังอยู่ในเครื่อง ไม่ย่อใหม่)
   * ต้องถามใหม่เพราะ "ไม่อยู่ในไฟล์" กับจำนวนรหัสที่จะเข้าไฟล์ขึ้นกับยี่ห้อ เซิร์ฟเวอร์เท่านั้นที่รู้ว่าไฟล์นั้นมีรหัสอะไรอยู่แล้ว
   */
  async function choose(name: string, brandFile: BrandFile) {
    const c = checked?.find((x) => x.file.name === name);
    if (!c?.upload || !c.result || running.current) return;
    running.current = true;
    setProgress(`กำลังตรวจ ${name} กับไฟล์ยี่ห้อ ${brandFile}…`);
    try {
      const result = await send(c.file, c.upload, { apply: false, replaceImages, batchId: newBatchId(), brandFile });
      choices.current.set(c.file, brandFile);
      setChecked((cur) => cur && cur.map((x) => (x.file.name === name ? { ...x, result } : x)));
    } catch (e) {
      showAlert("เลือกยี่ห้อของไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setProgress(null);
      running.current = false;
    }
  }

  async function apply() {
    if (!checked || running.current) return;
    // ไฟล์ที่ยังไม่รู้ยี่ห้อ เซิร์ฟเวอร์ปฏิเสธ — ถ้าส่งไฟล์อื่นไปก่อน รอบนี้จะค้างครึ่งทาง จึงไม่ส่งสักไฟล์
    // ปุ่มยังกดได้ (ไม่จาง) เพื่อให้กดแล้วรู้ว่าติดอะไร ปุ่มจางเฉย ๆ ไม่บอกเหตุผล
    const unchosen = checked.filter((c) => c.result && !c.result.brandFile).map((c) => c.file.name);
    if (unchosen.length) {
      setNeedBrand(unchosen);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    running.current = true;
    try {
      await applyFiles(checked);
    } finally {
      running.current = false;
    }
  }

  async function applyFiles(checked: Checked[]) {
    const id = newBatchId();
    const ok = checked.filter((c) => c.result);
    setApplyError(null);
    let done = 0;
    let stopped: { at: number; error: string } | null = null;
    for (let k = 0; k < ok.length; k++) {
      setProgress(`กำลังอัปเดต ${ok[k].file.name} (${k + 1}/${ok.length})`);
      try {
        const r = ok[k].result!;
        await send(ok[k].file, ok[k].upload!, { apply: true, replaceImages, batchId: id, brandFile: r.brandFileFrom === "name" ? null : r.brandFile });
        done++;
      } catch (e) {
        stopped = { at: k, error: apiErrorMessage(e) };
        break;
      }
    }
    onDone();
    const rest = stopped ? ok.slice(stopped.at).map((c, k) => ({ file: c.file, error: k === 0 ? stopped!.error : "หยุดก่อนถึงไฟล์นี้" })) : [];
    // ยังไม่ปล่อยปุ่ม — ระหว่างรอรายงาน ปุ่มอัปเดตยังเป็นแผนเดิม กดซ้ำได้รอบเปล่าที่ทับแถบ "อัปเดตล่าสุด"
    setProgress("กำลังเปิดรายงาน…");
    try {
      // ไฟล์แรกพังกลางทางก็มีรายงาน (เซิร์ฟเวอร์เขียนประวัติก่อนลงมือ) — บางส่วนอาจบันทึกไปแล้ว ต้องให้เห็น
      const report = (await api.get<Batch>(`/spare-parts/imports/batch/${id}`)).data;
      setRemaining(rest);
      setBatch(report);
    } catch (e) {
      if (!done && axios.isAxiosError(e) && e.response?.status === 404) {
        setApplyError(`${rest[0]?.file.name ?? ""}: ${stopped?.error ?? ""} — ยังไม่ได้อัปเดตไฟล์ไหน กดอัปเดตซ้ำได้`);
        return;
      }
      // อัปเดตไปแล้ว (บางไฟล์) — ห้ามปล่อยให้กดแผนเดิมซ้ำ
      setChecked(null);
      setFiles(rest.map((r) => r.file));
      if (rest.length) {
        setApplyError(`${rest[0].file.name}: ${stopped!.error} — ยังไม่ได้อัปเดต ${rest.map((r) => r.file.name).join(", ")} · กดตรวจก่อนอัปเดตเพื่อทำต่อ`);
      }
      showAlert(
        rest.length ? "อัปเดตได้บางไฟล์ แต่เปิดรายงานไม่ได้" : "อัปเดตแล้ว แต่เปิดรายงานไม่ได้",
        `${apiErrorMessage(e)} — ดูได้จาก “อัปเดตจากไฟล์ล่าสุด” บนหน้าจัดการข้อมูลอะไหล่`
      );
    } finally {
      setProgress(null);
    }
  }

  if (batch) {
    // ไฟล์ที่อ่านไม่ได้ / ยังไม่ได้อัปเดตเพราะหยุดกลางทาง — บอกไว้ในรายงาน ไม่งั้นนึกว่ายี่ห้อนั้นอัปเดตแล้ว
    // ไฟล์ที่พังกลางทางแต่มีประวัติ (บันทึกไปบางส่วน) บอกว่า "อัปเดตไม่ครบ" ไม่ใช่ "ไม่ได้อัปเดต"
    const partial = new Set(batch.files.filter((f) => f.summary.incomplete).map((f) => f.fileName));
    const failed = [
      ...(checked ?? []).filter((c) => c.error).map((c) => ({ name: c.file.name, note: `ไม่ได้อัปเดต: ${c.error}` })),
      ...remaining.map((r) => ({ name: r.file.name, note: `${partial.has(r.file.name) ? "อัปเดตไม่ครบ" : "ไม่ได้อัปเดต"}: ${r.error}` })),
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
  const joined = joinedOf(results);
  const confirmed = confirmedOf(results);
  const unchosen = (checked ?? []).filter((c) => c.result && !c.result.brandFile).map((c) => c.file.name);
  // เลือกยี่ห้อแล้วแถบเตือนหายเอง — เหลือเฉพาะไฟล์ที่ยังไม่ได้เลือก
  const stillNeed = (needBrand ?? []).filter((n) => unchosen.includes(n));
  // รหัสที่จะเข้าไฟล์ยี่ห้อ/ที่ไฟล์จะยืนยันก็เป็นงาน: อัปไฟล์เดิมซ้ำหลังเปิดใช้ ชื่อ/รูปเหมือนเดิมหมด
  // แต่ช่างยังเลือกรหัสพวกนั้นไม่ได้ หรือแถวที่เดาไว้ตอนขึ้นระบบยังไม่มีไฟล์จริงยืนยัน
  // ไฟล์ที่ยังไม่ได้เลือกยี่ห้อก็ให้กดได้ — กดแล้วบอกว่าต้องเลือกก่อน
  const canApply = totals.work > 0 || joined > 0 || confirmed > 0 || unchosen.length > 0;
  const fileWork =
    joined && confirmed
      ? `รหัสเข้าไฟล์ยี่ห้อ ${joined} · ยืนยัน ${confirmed} รายการ`
      : joined
        ? `รหัสเข้าไฟล์ยี่ห้อ ${joined} รายการ`
        : confirmed
          ? `ยืนยันรหัสในไฟล์ยี่ห้อ ${confirmed} รายการ`
          : "";
  const applyLabel = totals.work
    ? `อัปเดต ${totals.work} รายการ (เพิ่ม ${totals.new} · แก้ไข ${totals.chg} · รูป ${totals.img})`
    : fileWork
      ? `อัปเดต — ${fileWork}`
      : unchosen.length
        ? "อัปเดต (เลือกยี่ห้อของไฟล์ก่อน)"
        : "ไม่มีอะไรต้องอัปเดต";
  return (
    <AppModal
      visible
      onClose={onClose}
      busy={busy}
      width={980}
      scrollRef={scrollRef}
      banner={
        checked && stillNeed.length ? (
          <View style={styles.needBrand} accessibilityRole="alert">
            <Ionicons name="alert-circle-outline" size={20} color={colors.warningInk} />
            <Text style={styles.needBrandText}>เลือกยี่ห้อของไฟล์ {stillNeed.join(", ")} ก่อนกดอัปเดต</Text>
          </View>
        ) : undefined
      }
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
                setNeedBrand(null);
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
              style={[styles.primary, (busy || !canApply) && styles.off]}
              onPress={apply}
              disabled={busy || !canApply}
              accessibilityLabel="อัปเดตอะไหล่"
            >
              {busy ? <Spinner color="#fff" size="small" /> : <Text style={styles.primaryText}>{applyLabel}</Text>}
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
          busy={busy}
          needBrand={stillNeed}
          onChoose={choose}
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
            <Text style={styles.muted}>
              .xlsx แยกตามยี่ห้อ ({BRAND_FILES.join(" · ")}) — ใส่ชื่อยี่ห้อไว้ในชื่อไฟล์ · รูปที่วางในเซลล์ดึงออกมาให้เอง
            </Text>
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
        <Text style={styles.noteText}>หัวคอลัมน์สลับที่ได้ · ชีตแรกของแต่ละไฟล์ · รูปใหญ่ในไฟล์ย่อให้เองก่อนส่ง (ด้านยาว 1,600 px · ไฟล์ใหญ่มากย่อเพิ่มจนส่งได้) ไฟล์ 200 MB ก็ได้</Text>
        <Text style={styles.noteText}>
          ชื่อไฟล์บอกไฟล์ยี่ห้อ (มีคำว่า Haier · Huebsch หรือ HB · Maytag · Oasis · Spinz · Other) — ทุกรหัสในไฟล์เข้าไฟล์ยี่ห้อนั้น ช่างเลือกได้กับเครื่องยี่ห้อนั้น
          (Other = ของใช้ร่วม ทุกเครื่องเลือกได้) · ชื่อไม่บอกยี่ห้อ หรือบอกหลายยี่ห้อ ให้เลือกที่หน้าตรวจ · ช่อง “ยี่ห้อสินค้า” ใช้แสดงและค้นหาเท่านั้น
        </Text>
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
  busy,
  needBrand,
  onChoose,
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
  busy: boolean;
  /** ไฟล์ที่กดอัปเดตตอนยังไม่ได้เลือกยี่ห้อ — กล่องเหลืองของไฟล์นั้นเด่นขึ้น */
  needBrand: string[];
  onChoose: (fileName: string, brandFile: BrandFile) => void;
}) {
  // รหัสเดียวกันอยู่หลายไฟล์ — ไฟล์ยี่ห้อจำไว้ทุกไฟล์ (เจ้าของงาน 31 ต.ค. 69) แต่ชื่อ/Part No. ยังทับตามลำดับไฟล์
  // บอกให้รู้ก่อนกด ไม่งั้นแอดมินเห็นชื่อในระบบเปลี่ยนเป็นของอีกไฟล์แล้วนึกว่าไฟล์หลังลบไฟล์แรก
  const dupes = useMemo(() => {
    const seen = new Map<string, FileResult[]>();
    for (const r of results) for (const c of r.codes ?? []) seen.set(c, [...(seen.get(c) ?? []), r]);
    return [...seen].filter(([, rs]) => rs.length > 1);
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
      // อัปเดตไม่เอารหัสออกจากไฟล์ยี่ห้อ (D20) — Excel ที่แก้พลาดจะได้ไม่ทำให้ช่างหาอะไหล่ไม่เจอเงียบ ๆ
      // จึงบอกชื่อไฟล์ยี่ห้อไว้ ถ้าเลิกใช้กับยี่ห้อนั้นจริง แอดมินเอาไฟล์ออกเองที่ฟอร์มแก้ไขอะไหล่
      return goneOf(results).map((g) => ({
        key: `g${g.file}|${g.partCode}`,
        file: "",
        title: g.name,
        meta: [g.partCode, g.brand, `อยู่ในไฟล์ ${g.file} ในระบบ ไม่อยู่ในไฟล์ที่เลือก`].filter(Boolean).join(" · "),
        tag: "ไม่ลบ",
        fg: t.fg,
        bg: t.bg,
        lines: [
          <Text key="n" style={[styles.diff, { color: t.fg }]}>
            {g.usedIn ? `ไม่ลบ — ใบงานอ้างถึง ${g.usedIn} ใบ` : "ไม่ลบ — ยังไม่เคยใช้ในใบงาน ลบเองได้ที่หน้าจัดการข้อมูลอะไหล่"}
            {` · ยังอยู่ในไฟล์ ${g.file} — เลิกใช้กับ ${g.file} แล้ว เอาไฟล์ออกที่ฟอร์มแก้ไขอะไหล่`}
          </Text>,
        ],
      }));
    }
    // รหัสที่อยู่หลายไฟล์ โชว์เฉพาะของไฟล์หลัง (ไฟล์ที่ทับ) — ตัวเลขบนกล่องนับแบบเดียวกัน
    // เพิ่มใหม่ / แก้ไข / รูป มาจากผลจำลองทั้งรอบ (รหัสที่อยู่หลายไฟล์รวมเป็นแถวเดียว บอกลำดับไฟล์)
    if (tab === "new" || tab === "chg" || tab === "img") {
      for (const p of plannedItems(results, replaceImages)) {
        const i = p.item;
        const meta = [i.partCode, i.brand, i.partNo ? `Part No. ${i.partNo}` : null, `${p.file} แถว ${i.line}`].filter(Boolean).join(" · ");
        const base = { key: `${p.file}|${i.partCode}`, file: p.file, title: i.name, thumb: p.thumb, meta };
        if (tab === "img") {
          if (i.image === "NEW" || i.image === "CHANGED") {
            out.push({ ...base, tag: "รูป", fg: t.fg, bg: t.bg, lines: [<Text key="n" style={[styles.diff, { color: t.fg }]}>{IMAGE_NOTE[i.image]}</Text>] });
          }
          continue;
        }
        if (i.action !== (tab === "new" ? "CREATE" : "UPDATE")) continue;
        out.push({
          ...base,
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
      return out;
    }
    for (const r of results) {
      if (tab === "bad") {
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
      // ไม่ใช่ปัญหาแล้ว (รหัสหนึ่งอยู่ได้หลายไฟล์ยี่ห้อ) แต่ยังอยู่แท็บนี้ เพราะชื่อ/Part No. ยังทับตามลำดับไฟล์ — ป้ายสีฟ้าแยกจากแถวที่ข้ามจริง
      for (const [code, rs] of dupes) {
        const files = rs.map((r) => (r.brandFile ? `${r.fileName} (${r.brandFile})` : r.fileName)).join(", ");
        out.push({
          key: `dup|${code}`,
          file: rs.map((r) => r.fileName).join(", "),
          title: code,
          meta: rs.map((r) => r.fileName).join(" → "),
          tag: "หลายไฟล์",
          fg: colors.primaryInk,
          bg: colors.primarySoft,
          lines: [
            <Text key="n" style={[styles.diff, { color: colors.primaryInk, fontWeight: "600" }]}>
              {`อยู่ในหลายไฟล์ (${files}) — จำไว้ทุกไฟล์ ช่างเลือกได้จากทุกไฟล์ที่มีรหัสนี้ · ชื่อ/Part No. ใช้ค่าจากไฟล์หลัง (ช่องว่างใช้ค่าจากไฟล์ก่อน)`}
            </Text>,
          ],
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
                  {c.upload?.shrunk
                    ? `ย่อรูปใหญ่ ${c.upload.shrunk} รูป (${mb(c.upload.before)} → ${mb(c.upload.after)}${c.upload.rounds > 1 ? ` · ย่อ ${c.upload.rounds} รอบ` : ""}) · `
                    : ""}
                  {COLS.map(([k, label]) => colNote(c.result!.columns[k], label)).join(" · ")}
                </Text>
              ) : (
                <Text style={styles.error}>{c.error}</Text>
              )}
              {c.result ? (
                <BrandFileBox name={c.file.name} result={c.result} busy={busy} nudged={needBrand.includes(c.file.name)} onChoose={onChoose} />
              ) : null}
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
        ช่องว่างในไฟล์ไม่ลบค่าเดิม (เช่น Part No. ว่าง = คง Part No. เดิมไว้) · อะไหล่ที่ไม่อยู่ในไฟล์ไม่ถูกลบ และไม่ถูกเอาออกจากไฟล์ยี่ห้อ —
        ใบงานเก่ายังอ้างถึงอยู่ ถ้าเลิกใช้แล้วลบเองที่หน้าจัดการข้อมูลอะไหล่
      </Text>
    </View>
  );
}

/**
 * ไฟล์ยี่ห้อของไฟล์ที่อัปโหลด (ในแถวไฟล์ของหน้าตรวจ)
 * ชื่อไฟล์บอกยี่ห้อเดียว → บอกเฉย ๆ ไม่มีชิปให้เปลี่ยน (D21: ไฟล์เดิมอัปซ้ำต้องลงที่เดิมเสมอ)
 * ชื่อไม่บอก/บอกหลายยี่ห้อ → กล่องเหลือง + ชิป 6 ไฟล์กางในที่ (ไม่ใช่ Modal — ซ้อนในหน้าต่างนี้บนเว็บไม่น่าเชื่อถือ)
 * เลือกแล้วยังเห็นชิป เผื่อกดพลาด เปลี่ยนได้ก่อนกดอัปเดต
 */
function BrandFileBox({
  name,
  result,
  busy,
  nudged,
  onChoose,
}: {
  name: string;
  result: FileResult;
  busy: boolean;
  nudged: boolean;
  onChoose: (fileName: string, brandFile: BrandFile) => void;
}) {
  const file = result.brandFile ?? null;
  const fromName = result.brandFileFrom === "name";
  const joined = result.summary.joined ?? 0;
  const confirmed = result.summary.confirmed ?? 0;
  const chips = (
    <View style={styles.brandChips}>
      {BRAND_FILES.map((b) => {
        const on = b === file;
        return (
          <TouchableOpacity
            key={b}
            style={[styles.brandChip, on && styles.brandChipOn]}
            onPress={() => !on && onChoose(name, b)}
            disabled={busy}
            accessibilityLabel={`ไฟล์ยี่ห้อ ${b} ของ ${name}`}
            // เว็บไม่แปลง accessibilityState เป็น aria-selected (แบบเดียวกับ FilterBar) — ชิปนี้เปลี่ยนตัวเลขทั้งแถว
            // โปรแกรมอ่านจอ/เทสต์ต้องรู้ว่าไฟล์ยี่ห้อไหนติดอยู่ ไม่ใช่เดาจากสี
            accessibilityState={{ selected: on, disabled: busy }}
            aria-selected={on}
          >
            <Text style={[styles.brandChipText, on && styles.brandChipTextOn]}>{b}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
  if (!file) {
    const matches = result.brandFileMatches ?? [];
    return (
      <View style={[styles.brandAsk, nudged && styles.brandAskNudged]}>
        <Text style={styles.brandAskText}>
          {matches.length > 1 ? `ชื่อไฟล์ตรงหลายยี่ห้อ (${matches.join(", ")}) — เลือกยี่ห้อของไฟล์นี้` : "ชื่อไฟล์ไม่บอกยี่ห้อ — เลือกยี่ห้อของไฟล์นี้"}
        </Text>
        {chips}
      </View>
    );
  }
  return (
    <View style={{ gap: 4, paddingTop: 4 }}>
      <Text style={styles.brandLine}>
        ไฟล์ยี่ห้อ {file} ({fromName ? "จากชื่อไฟล์" : "เลือกเอง"})
      </Text>
      {joined > 0 ? (
        <Text style={styles.brandJoined}>
          รหัสที่ยังไม่อยู่ในไฟล์ {file}: {joined} รายการ —{" "}
          {file === SHARED_FILE ? "อัปเดตแล้วทุกเครื่องเลือกได้ (ของใช้ร่วม)" : `อัปเดตแล้วช่างเลือกได้กับเครื่อง ${file}`}
        </Text>
      ) : null}
      {confirmed > 0 ? (
        <Text style={styles.brandJoined}>
          รหัสที่ไฟล์นี้ยืนยันว่าอยู่ในไฟล์ {file}: {confirmed} รายการ (เดิมตั้งจากช่องยี่ห้อหรือติ๊กเอง)
        </Text>
      ) : null}
      {fromName ? null : chips}
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
  failed?: { name: string; note: string }[];
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
  // ประวัติก่อนมีไฟล์ยี่ห้อ (ไม่มี joined ใน summary) — migration เติม brandFile จากชื่อไฟล์ให้ แต่ไม่รู้ว่าตอนนั้นเข้าไฟล์ใหม่กี่ตัว
  // ไม่ขึ้นช่อง/บรรทัด "เข้าไฟล์ … ใหม่" เลย ดีกว่าขึ้น 0 ที่ไม่จริง (ฟีเจอร์ยังไม่มีตอนนั้น)
  const knowsJoined = batch.files.some((f) => typeof f.summary.joined === "number");
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
            // อัปไฟล์เดิมซ้ำครั้งแรกหลังเปิดใช้ ชื่อ/รูปไม่เปลี่ยนเลย หัวรายงานขึ้น "แล้ว 0 รายการ" — ช่องนี้บอกว่ามีอะไรเกิดขึ้นจริง
            ...(knowsJoined ? ([[t.joined ?? 0, "เข้าไฟล์ยี่ห้อใหม่", colors.successInk, colors.successSoft]] as const) : []),
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
        // ประวัติก่อนมีไฟล์ยี่ห้อมี brandFile (migration เติมจากชื่อไฟล์) แต่ไม่มี joined — ไม่ขึ้นบรรทัด (ดีกว่าขึ้น "เข้าไฟล์ ใหม่ 0" ที่ไม่จริง)
        const brandFile = f.brandFile ?? d.brandFile ?? null;
        return (
          <View key={f.id} style={styles.fileBox}>
            <TouchableOpacity onPress={() => setOpen(isOpen ? null : f.id)} accessibilityLabel={`รายละเอียด ${f.fileName}`} style={styles.fileHead}>
              <Ionicons name={isOpen ? "chevron-down" : "chevron-forward"} size={16} color={colors.textMuted} />
              <Text style={styles.fileName}>
                {f.fileName} — เพิ่ม {s.created} · แก้ไข {s.updated} · รูป {s.images} · ข้าม {s.skipped}
              </Text>
            </TouchableOpacity>
            {brandFile && typeof s.joined === "number" ? (
              <Text style={styles.brandJoined}>
                เข้าไฟล์ {brandFile} ใหม่ {s.joined} รายการ
                {brandFile === SHARED_FILE ? " (ของใช้ร่วม ทุกเครื่องเลือกได้)" : ""}
              </Text>
            ) : null}
            {brandFile && s.confirmed ? (
              <Text style={styles.brandJoined}>
                ยืนยันรหัสในไฟล์ {brandFile} {s.confirmed} รายการ (เดิมตั้งจากช่องยี่ห้อหรือติ๊กเอง)
              </Text>
            ) : null}
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
          ไม่อยู่ในไฟล์ยี่ห้อเดียวกันของรอบนี้ (ไม่ลบ ไม่เอาออกจากไฟล์ยี่ห้อ) {full.notInFile.length} รายการ:{" "}
          {full.notInFile
            .slice(0, 10)
            .map((g) => (g.file ? `${g.partCode} (${g.file})` : g.partCode))
            .join(", ")}
          {full.notInFile.length > 10 ? ` และอีก ${full.notInFile.length - 10}` : ""}
        </Text>
      ) : null}
      {failed.map((f) => (
        <View key={f.name} style={[styles.fileBox, styles.fileBad]}>
          <Text style={[styles.reportLine, { color: colors.dangerInk, fontWeight: "600" }]}>
            {f.name} — {f.note}
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
  needBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.warningTint,
    borderBottomWidth: 1,
    borderColor: colors.warningBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  needBrandText: { flex: 1, fontSize: 14, lineHeight: 21, fontWeight: "700", color: colors.warningInk },
  brandLine: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.primaryInk },
  brandJoined: { fontSize: 13, lineHeight: 20, color: colors.successInk },
  brandAsk: {
    marginTop: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  // กดอัปเดตตอนยังไม่เลือก — ขอบเข้มขึ้นให้เห็นว่ากล่องไหนที่ต้องแก้ เมื่อมีหลายไฟล์
  brandAskNudged: { borderColor: colors.warning, borderWidth: 2 },
  brandAskText: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.warningInk },
  brandChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  brandChip: {
    minHeight: 36,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 14,
  },
  brandChipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  brandChipText: { fontSize: 13, lineHeight: 20, color: colors.text, fontWeight: "600" },
  brandChipTextOn: { color: colors.primaryInk, fontWeight: "800" },
});
