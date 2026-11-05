/**
 * นำเข้าใบแจ้งซ่อมจากไฟล์ฟอร์ม COCO (.xlsx ที่ส่งออกจาก Microsoft Forms) — แอดมิน (เจ้าของงานขอ ต.ค. 69)
 *
 * แบบเดียวกับนำเข้ารถ: เลือกไฟล์ → เซิร์ฟเวอร์อ่านแล้วบอกทีละแถวว่าจะเปิดใบใหม่ ข้าม (นำเข้าแล้ว / เครื่องมีใบค้าง)
 * หรือนำเข้าไม่ได้เพราะอะไร → แอดมินยืนยัน → ส่งไฟล์เดิมอีกรอบพร้อม apply (เซิร์ฟเวอร์อ่านใหม่ ไม่เชื่อรายการจากหน้าจอ)
 * นำเข้าไฟล์เดิมซ้ำได้ แถวที่เข้าไปแล้วถูกข้ามให้เอง — ใช้ไฟล์ที่ส่งออกใหม่ทั้งก้อนทุกวันได้เลย
 *
 * ยืนยันส่งทีละชุด (APPLY_BATCH แถว) ไม่ใช่ทั้งไฟล์ในคำขอเดียว — ดู commit()
 */
import React, { useRef, useState } from "react";
import axios from "axios";
import { StyleSheet, Text, View } from "react-native";
import TouchableOpacity from "./Tap";
import Ionicons from "@expo/vector-icons/Ionicons";
import AppModal from "./AppModal";
import Spinner from "./Spinner";
import { fs } from "./FleetUI";
import { api, apiErrorMessage } from "../api/client";
import { feedback } from "./Feedback";
import { showAlert } from "../utils/alert";
import { PickedFile, droppedFile, pickFile } from "../utils/filePicker";
import FileDropZone, { DropHint } from "./FileDropZone";
import { newRunKey, openImportHistory, reportStop } from "../utils/importHistory";
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
    photosFailed?: number;
    photoFilled?: number;
  };
  created?: string[];
  /** ยืนยันทีละชุด: แถวที่เวลาของคำขอหมดก่อนได้เริ่ม — ส่งใหม่ในชุดถัดไป */
  pending?: number[];
  /** ยืนยันทีละชุด: แถวที่ขอให้เปิดแต่ไม่ใช่ใบใหม่แล้ว (นำเข้าไปแล้วระหว่างนี้) — ไม่ได้เปิด */
  stale?: number[];
  /** รอบในประวัติการนำเข้า (r12) — ปุ่ม "ดูในประวัติการนำเข้า" เปิดรอบนี้เลย · เซิร์ฟเวอร์รุ่นก่อน/บันทึกประวัติไม่ได้ = ไม่มี */
  runId?: string;
  rows: Row[];
}

/**
 * แถวต่อคำขอตอนยืนยัน — ฐานข้อมูลจริงอยู่คนละ region (ไปกลับรอบละ ~0.23 วิ) แถวหนึ่งรวมรูปใช้ ~1.5 วิ
 * 10 แถว ≈ 15–20 วิต่อคำขอ ห่างจากเพดานของ Render (~100 วิ) มาก และตัวเลขความคืบหน้าขยับทุกไม่กี่วินาที
 * (เจ้าของงานเจอ 5 พ.ย. 69: 196 ใบในคำขอเดียวพังทุกครั้ง ไม่มีใบไหนเข้า)
 */
const APPLY_BATCH = 10;

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

/**
 * only = เลขแถวที่ให้ลงมือในคำขอนี้ (ยืนยันทีละชุด) — เซิร์ฟเวอร์ยังวางแผนจากทั้งไฟล์ กันซ้ำ/skip/force ใช้ทั้งไฟล์เหมือนเดิม
 * runKey = รหัสของการกดยืนยันครั้งนี้ ส่งเหมือนกันทุกชุด — ประวัติการนำเข้ารวมทุกชุดเป็นรอบเดียว
 */
async function send(file: PickedFile, apply: boolean, picks: Picks, only?: number[], runKey?: string) {
  const form = new FormData();
  form.append("file", file.blob, file.name);
  if (apply) form.append("apply", "true");
  if (picks.skip.length) form.append("skip", picks.skip.join(","));
  if (picks.force.length) form.append("force", picks.force.join(","));
  if (only) form.append("only", only.join(","));
  if (runKey) form.append("runKey", runKey);
  return (
    await api.post<Result>("/work-orders/import-form", form, {
      headers: { "Content-Type": "multipart/form-data" },
      // ยืนยันเปิดหน้าโหลดเองตลอดทุกชุด (commit) — ถ้าให้แต่ละคำขอเปิด/ปิดเอง หน้าโหลดกะพริบหายระหว่างชุด
      loadingText: false,
    })
  ).data;
}

/** สิ่งที่เปิดไปแล้วในการกดยืนยันครั้งนี้ (รวมทุกชุด) */
interface Applied {
  created: string[];
  photosAttached: number;
  photosFailed: number;
  photoFilled: number;
  stale: number;
  /** รอบในประวัติการนำเข้า — ได้จากคำตอบชุดไหนก็ได้ (ทุกชุดของการกดครั้งนี้เป็นรอบเดียวกัน) */
  runId: string | null;
}

/**
 * ข้อความตอนหยุดกลางทาง — บอกว่าเปิดไปแล้วกี่ใบ หยุดเพราะอะไร และทำอะไรต่อ
 * (เดิมขึ้นแค่ "แจ้งแอดมินให้ดู log" แอดมินไม่รู้ว่ามีใบเข้าไปแล้วหรือยัง กดซ้ำจะได้ใบซ้ำไหม)
 */
function stopMessage(e: unknown, got: Applied, total: number): string {
  const res = axios.isAxiosError(e) ? e.response : undefined;
  const data = res?.data as { code?: string; reason?: string; line?: number | null; error?: unknown } | undefined;
  const why =
    data?.code === "IMPORT_FAILED" && data.reason
      ? `${data.reason}${data.line ? ` ตอนเปิดแถว ${data.line}` : ""}`
      : !res || (res.status >= 502 && typeof data?.error !== "string")
        ? // คำขอหาย/พร็อกซีตัดก่อนเซิร์ฟเวอร์ตอบ — ชุดนั้นอาจเปิดไปบางใบแล้ว (กดซ้ำได้ ใบที่เปิดแล้วถูกข้าม)
          "ชุดล่าสุดไม่ได้คำตอบจากเซิร์ฟเวอร์ (บางใบในชุดนั้นอาจเปิดไปแล้ว)"
        : apiErrorMessage(e);
  const n = got.created.length;
  return (
    `เปิดใบงานไปแล้ว ${n} จาก ${total} ใบ${n ? ` (${got.created[0]}–${got.created[n - 1]})` : ""} แล้วหยุด — ${why}\n` +
    "กดยืนยันอีกครั้งเพื่อเปิดที่เหลือ — ใบที่เปิดแล้วถูกข้ามให้เอง ไม่เกิดใบซ้ำ"
  );
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" }) : "—";

const ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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
  /** รอบล่าสุดที่กดยืนยัน — ลิงก์ "ดูในประวัติการนำเข้า" ใต้ข้อความหยุดกลางทาง (undefined = ยังไม่ได้ยืนยัน · null = ไม่รู้เลขรอบ) */
  const [lastRun, setLastRun] = useState<string | null | undefined>(undefined);
  /** กด "หยุดหลังชุดนี้" บนหน้าโหลดแล้ว — ชุดที่กำลังเปิดอยู่ทำจนจบก่อน (ตัดกลางชุดไม่ได้: เซิร์ฟเวอร์ทำต่ออยู่ดี) */
  const stopAsked = useRef(false);
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
    setLastRun(undefined);
    setPreview(null);
    setOnly(null);
    setStuck([]);
    setError(null);
    onClose();
  }

  // given = ไฟล์ที่ลากมาวาง (FileDropZone) — ไม่ส่ง = เปิดหน้าต่างเลือกไฟล์
  async function choose(given?: PickedFile | null) {
    const picked = given !== undefined ? given : await pickFile(ACCEPT);
    if (!picked) return;
    setFile(picked);
    setLastRun(undefined);
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

  /**
   * ยืนยัน = ส่งไฟล์เดิมทีละชุด APPLY_BATCH แถว (only) แทนทั้งไฟล์ในคำขอเดียว — เจ้าของงานเจอ 5 พ.ย. 69:
   * 196 ใบในคำขอเดียวชนเพดานเวลาของฐานข้อมูลทุกครั้ง ได้แค่ "แจ้งแอดมินให้ดู log" และไม่มีใบไหนเข้า
   *
   * แถวเติมรูปใบเดิมก่อน (ลำดับเดียวกับที่เซิร์ฟเวอร์เคยทำ) แล้วใบใหม่ตามลำดับแถว · หน้าโหลดบอกความคืบหน้า "กำลังเปิดใบงาน 40/196"
   * ชุดที่เซิร์ฟเวอร์ทำไม่ทัน (pending) ส่งซ้ำต้นคิว · ชุดไหนพัง หยุดเลย บอกว่าเปิดไปแล้วกี่ใบ แล้วอ่านตัวอย่างใหม่
   * ให้แถวที่เปิดแล้วขึ้น "นำเข้าแล้ว" — กดยืนยันอีกครั้งได้ทันที (importKey กันใบซ้ำอยู่ที่เซิร์ฟเวอร์)
   */
  async function commit() {
    if (!file || !preview) return;
    const before = preview.summary;
    const fillLines = preview.rows.filter((r) => r.photoFill).map((r) => r.line);
    const newLines = preview.rows.filter((r) => r.status === "NEW").map((r) => r.line);
    fillLines.sort((a, b) => a - b);
    newLines.sort((a, b) => a - b);
    const fillSet = new Set(fillLines);
    const queue = [...fillLines, ...newLines];
    const got: Applied = { created: [], photosAttached: 0, photosFailed: 0, photoFilled: 0, stale: 0, runId: null };
    // กดยืนยันใหม่ = รอบใหม่ในประวัติ (แม้ไฟล์เดิม) · ทุกชุดของการกดครั้งนี้ส่งรหัสเดียวกัน
    const runKey = newRunKey();
    let doneFill = 0;
    let doneNew = 0;
    let stalls = 0;
    stopAsked.current = false;
    /**
     * หน้าโหลดมีปุ่ม "หยุดหลังชุดนี้" (ตัวอย่างที่อนุมัติ: "กดหยุดเองที่ 40/62") — หน้าโหลดบังทั้งจอ ปุ่มจึงอยู่บนหน้าโหลด
     * กดแล้วชุดที่ส่งไปแล้วทำจนจบ (เซิร์ฟเวอร์ทำต่ออยู่ดีแม้แอปเลิกรอ) แล้วไม่ส่งชุดถัดไป
     */
    const progress = (text: string) =>
      stopAsked.current
        ? feedback.loading(`${text} — จะหยุดหลังชุดนี้`)
        : feedback.loading(text, {
            label: "หยุดหลังชุดนี้",
            onPress: () => {
              stopAsked.current = true;
              progress(text);
            },
          });
    setBusy(true);
    setError(null);
    try {
      while (queue.length) {
        progress(doneFill < fillLines.length ? `กำลังเติมรูปใบเดิม ${doneFill}/${fillLines.length}` : `กำลังเปิดใบงาน ${doneNew}/${newLines.length}`);
        const batch = queue.slice(0, APPLY_BATCH);
        let r: Result;
        try {
          r = await send(file, true, picks, batch, runKey);
        } catch (e) {
          // ชุดที่พังอาจเปิดไปแล้วบางใบ — เซิร์ฟเวอร์บอกรหัสที่เปิดมาด้วย นับรวมก่อนสรุป
          const data = axios.isAxiosError(e) ? (e.response?.data as { created?: unknown; runId?: unknown } | undefined) : undefined;
          if (Array.isArray(data?.created)) got.created.push(...data!.created.map(String));
          if (typeof data?.runId === "string") got.runId = data.runId;
          throw e;
        }
        got.runId = r.runId ?? got.runId;
        got.created.push(...(r.created ?? []));
        got.photosAttached += r.summary.photosAttached ?? 0;
        got.photosFailed += r.summary.photosFailed ?? 0;
        got.photoFilled += r.summary.photoFilled ?? 0;
        got.stale += r.stale?.length ?? 0;
        const pending = new Set(r.pending ?? []);
        for (const line of batch) {
          if (pending.has(line)) continue;
          if (fillSet.has(line)) doneFill++;
          else doneNew++;
        }
        // เซิร์ฟเวอร์ไม่ได้เริ่มสักแถวสองชุดติด = ช้าเกินจะไปต่อ — หยุดดีกว่าวนส่งไฟล์ซ้ำไม่รู้จบ
        stalls = pending.size === batch.length ? stalls + 1 : 0;
        if (stalls >= 2) throw new Error("stalled");
        queue.splice(0, batch.length, ...batch.filter((line) => pending.has(line)));
        if (stopAsked.current && queue.length) throw new Error("user-stop");
      }
      feedback.loading(null);
      const runId = got.runId;
      // กล่องที่มีปุ่ม (ไม่ใช่แถบที่หายเอง) — ตัวอย่างที่อนุมัติ: ผลทีละแถวอยู่ในประวัติแล้ว กดไปดูต่อได้เลย
      showAlert(
        "นำเข้าใบแจ้งซ่อมแล้ว",
        `เปิดใบงานใหม่ ${got.created.length} ใบ — อยู่ขั้นแรก (หัวหน้าภาคระบุอะไหล่)` +
          (before.open ? ` · ข้ามเครื่องที่มีใบค้าง ${before.open}` : "") +
          (before.error ? ` · นำเข้าไม่ได้ ${before.error}` : "") +
          (before.skipped ? ` · เอาออก ${before.skipped}` : "") +
          // แถวที่ระหว่างนี้ถูกนำเข้าไปแล้ว (อีกหน้าจอ/คำขอก่อนหน้า) — ไม่ได้เปิดซ้ำ บอกให้ยอดตรงกับที่เห็นในตัวอย่าง
          (got.stale ? ` · ข้าม ${got.stale} แถวที่ถูกนำเข้าไปแล้วระหว่างนี้` : "") +
          (got.photosAttached ? ` · แนบรูปจากไฟล์ ${got.photosAttached} รูป` : "") +
          (got.photoFilled ? ` (เติมให้ใบเดิม ${got.photoFilled} ใบ)` : "") +
          // อัปรูปไม่ผ่านต้องบอก — เดิมเงียบ คนนำเข้าเห็นว่าสำเร็จแต่ใบไม่มีรูป (26 ต.ค. 69)
          (got.photosFailed ? ` · แนบรูปไม่สำเร็จ ${got.photosFailed} รูป — นำเข้าไฟล์เดิมอีกรอบเพื่อลองใหม่` : "") +
          "\n\nผลทีละแถวเก็บไว้ในประวัติการนำเข้าแล้ว ปิดหน้าต่างนี้ไปก็กลับมาดูได้ แอดมินคนอื่นก็เห็น",
        [
          { text: "ปิด", style: "cancel" },
          { text: "ดูในประวัติการนำเข้า", onPress: () => openImportHistory("repair", runId) },
        ]
      );
      onDone();
      close();
    } catch (e) {
      feedback.loading(null);
      const userStop = e instanceof Error && e.message === "user-stop";
      const stalled = e instanceof Error && e.message === "stalled";
      const left = newLines.length - got.created.length - got.stale;
      const msg = userStop
        ? `เปิดใบงานไปแล้ว ${got.created.length} จาก ${newLines.length} ใบ แล้วหยุดตามที่กด — อีก ${left} แถวยังไม่ได้เปิด\nกดยืนยันอีกครั้งเพื่อเปิดที่เหลือ — ใบที่เปิดแล้วถูกข้ามให้เอง ไม่เกิดใบซ้ำ`
        : stalled
          ? `เปิดใบงานไปแล้ว ${got.created.length} จาก ${newLines.length} ใบ แล้วหยุด — เซิร์ฟเวอร์ช้าเกินกว่าจะเปิดต่อได้ตอนนี้\nลองกดยืนยันอีกครั้งภายหลัง — ใบที่เปิดแล้วถูกข้ามให้เอง ไม่เกิดใบซ้ำ`
          : stopMessage(e, got, newLines.length);
      /**
       * บอกเซิร์ฟเวอร์ว่ารอบนี้หยุดแล้ว (ประวัติขึ้น "หยุดกลางทาง" ทันที ไม่ต้องรอ 5 นาที) — ล้มที่เซิร์ฟเวอร์ (IMPORT_FAILED)
       * เซิร์ฟเวอร์จดเองแล้ว · ไม่ได้คำตอบเลย (เน็ตหลุด) ก็ส่งไปเผื่อถึง
       */
      const data = axios.isAxiosError(e) ? (e.response?.data as { code?: string } | undefined) : undefined;
      if (data?.code !== "IMPORT_FAILED") {
        reportStop(runKey, userStop ? "user" : stalled ? "stalled" : axios.isAxiosError(e) && !e.response ? "network" : "error");
      }
      setError(msg);
      setLastRun(got.runId);
      const runId = got.runId;
      // กล่องที่ต้องกดตกลง (ไม่ใช่แถบที่หายเอง) — ข้อความยาวและต้องอ่านให้จบก่อนตัดสินใจกดซ้ำ
      showAlert("หยุดนำเข้ากลางทาง", msg, [
        { text: "ตกลง", style: "cancel" },
        { text: "ดูในประวัติการนำเข้า", onPress: () => openImportHistory("repair", runId) },
      ]);
      if (got.created.length) onDone();
      // อ่านตัวอย่างใหม่: แถวที่เปิดแล้วขึ้น "นำเข้าแล้ว" ปุ่มยืนยันเหลือเฉพาะที่ยังไม่เปิด · อ่านไม่ได้ (เซิร์ฟเวอร์ยังล่ม) ก็ยังเห็นข้อความข้างบน
      try {
        setPreview(await send(file, false, picks));
        setOnly(null);
        setStuck([]);
      } catch {
        // ข้อความหยุดกลางทางยังอยู่บนจอ — พอให้รู้ว่าต้องลองใหม่
      }
    } finally {
      feedback.loading(null);
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
      <FileDropZone hint="ไฟล์ .xlsx" disabled={busy} label="วางไฟล์ฟอร์มแจ้งซ่อม" onFiles={(files) => choose(droppedFile(files, ACCEPT))}>
        <TouchableOpacity
          style={[fs.btn, fs.btnGhost, { alignSelf: "flex-start" }]}
          onPress={() => choose()}
          disabled={busy}
          accessibilityLabel="เลือกไฟล์ฟอร์มแจ้งซ่อม"
        >
          <Ionicons name="document-attach-outline" size={17} color={colors.navy} />
          <Text style={fs.btnGhostText}>{file ? `เลือกไฟล์ใหม่ (${file.name})` : "เลือกไฟล์ .xlsx"}</Text>
        </TouchableOpacity>
        <DropHint text="หรือลากไฟล์มาวางตรงนี้" />
      </FileDropZone>
      {busy && !preview ? <Spinner color={colors.primary} style={{ marginTop: spacing.md }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {error && lastRun !== undefined ? (
        // รอบที่หยุด/ล้มอยู่ในประวัติแล้ว — แอดมินอีกคนเห็นว่ารอบนี้เปิดไปกี่ใบ เหลือกี่แถว
        <TouchableOpacity onPress={() => openImportHistory("repair", lastRun)} accessibilityLabel="ดูรอบนี้ในประวัติการนำเข้า">
          <Text style={styles.historyLink}>ดูรอบนี้ในประวัติการนำเข้า ›</Text>
        </TouchableOpacity>
      ) : null}

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
  historyLink: { fontSize: 13, fontWeight: "700", color: colors.navy, textDecorationLine: "underline", marginTop: spacing.xs },
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
