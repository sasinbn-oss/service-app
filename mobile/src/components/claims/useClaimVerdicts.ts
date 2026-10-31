/**
 * การตัดสินเคลมทีละชิ้นของหน้าตรวจเคลม (เคลมก้อน 3 · ตัวอย่างที่เจ้าของงานเลือก rvCalc/rvSubmit)
 *
 * ทำไมแยกเป็น hook: แท็บชิ้นกับกล่องปิดเคลมอยู่ในหน้าตรวจ (ส่วนที่เลื่อน) แต่ปุ่มตัดสินอยู่ในแถบล่างจอ (นอกส่วนที่เลื่อน)
 * สองที่ต้องเห็นชิ้นที่เปิดอยู่และผลที่เลือกไว้ชุดเดียวกัน — หน้าใบงานถือค่านี้ไว้แล้วส่งให้ทั้งสองที่
 *
 * กติกาตามตัวอย่าง:
 * - ชิ้นที่ตัดสินจบในรอบก่อนของงานซ่อมครั้งนี้ (ผ่าน · ปิดเคลม ไม่ส่งผู้ขาย) ล็อกไว้ ไม่ต้องตรวจซ้ำ แต่ยังนับในคำยืนยัน
 * - ตีกลับต้องติ๊กช่องที่ต้องแก้ (ก้อน 4 · rvCalc) — ช่างจะรู้ว่าแก้ตรงไหน และรู้ว่าต้องกลับไปร้านไหม · ปิดเคลมต้องเลือกเหตุผล ("อื่น ๆ" ต้องพิมพ์)
 * - ติ๊กช่องของเครื่อง = ตีกลับทั้งใบ: ทุกชิ้นที่ผ่าน/ยังไม่ตัดสินกลายเป็น ✗ (ข้อมูลเครื่องใช้ร่วมกัน ใบเคลมของชิ้นที่ผ่านจะออกไป
 *   พร้อมค่าที่ผู้ตรวจเองบอกว่าผิด) · ชิ้นที่เลือกปิดเคลมไว้ยังปิดเคลมเหมือนเดิม · มีชิ้นผ่านไปแล้วในรอบก่อน = ข้อมูลเครื่องล็อก ติ๊กไม่ได้
 * - มีชิ้นตีกลับ = ส่งเลยไม่ต้องยืนยัน · ไม่มี = ถามยืนยันก่อน เพราะใบงานจะปิด
 * - ไม่มีชิ้นไหนผ่านเลย (ปิดเคลมทุกชิ้น) ห้ามใช้คำว่า "อนุมัติ" ทุกจอ — เป็นการปิดงานเฉย ๆ ไม่มีใบเคลมออกไป
 *
 * ร่างการตัดสิน (review:<id>) จำไว้ในเครื่อง — ผู้ตรวจพิมพ์เหตุผลค้างแล้วหน้าโหลดใหม่ ไม่ต้องเริ่มใหม่ · ส่งสำเร็จแล้วล้าง
 * ดูในฐานะคนอื่นไม่จำและไม่โหลด (ตัดสินไม่ได้อยู่แล้ว)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { api, apiErrorMessage, staleWorkOrderId } from "../../api/client";
import { showAlert } from "../../utils/alert";
import { clearDraft, loadDraft, saveDraft } from "../../utils/draft";
import {
  claimRoundOf,
  isLockedStatus,
  partNameOf,
  roundPartsOf,
  type ClaimLog,
  type ClaimRound,
  type PartClaim,
} from "../../utils/claimEvidence";
import { QUICK_REASONS, flagDefsOf, isMachineFlag, type FlagDef, type ServerFlag } from "../../utils/claimFlags";
import { dayTime } from "./ClaimTrail";

export type Verdict = "APPROVE" | "REJECT" | "DECLINE";

/** เหตุผลปิดเคลม ไม่ส่งผู้ขาย — ชุดเดียวกับ CLAIM_DECLINE_REASONS ฝั่งเซิร์ฟเวอร์ (ตัวอย่างที่เจ้าของงานเลือก DROP) */
export const DECLINE_REASONS = ["หมดประกัน", "ไม่ใช่ชิ้นในประกัน", "อื่น ๆ"] as const;
export const DECLINE_OTHER = "อื่น ๆ";
/** ข้อความเดียวกับเซิร์ฟเวอร์ (SEND_BACK_REASON_REQUIRED) — กันไว้ที่หน้าจอก่อน ไม่ต้องรอโดนปฏิเสธ */
export const SEND_BACK_REASON_REQUIRED = "ตีกลับต้องบอกเหตุผล — ช่างจะได้รู้ว่าต้องแก้อะไร";
/** ตีกลับแต่ยังไม่ได้ติ๊กช่อง (ตัวอย่าง rejStatus) — ช่างจะเห็นแค่ว่าโดนตีกลับ ไม่รู้ว่าแก้ตรงไหน */
export const NEED_FIELD = "ยังไม่ได้ติ๊กช่องที่ต้องแก้ — ช่างจะไม่รู้ว่าต้องแก้อะไร";

/** ชิ้นหนึ่งในหน้าตรวจ = แถวล่าสุดของชิ้นนั้นในงานซ่อมครั้งนี้ */
export interface ReviewPart {
  /** id ของแถวล่าสุด — ใช้เป็นกุญแจของแท็บและของคำตัดสิน */
  key: number;
  row: PartClaim;
  name: string;
  round: number;
  /** ตัดสินจบไปแล้วในรอบก่อน — ล็อกไว้ ไม่มีปุ่มตัดสิน */
  locked: "APPROVED" | "DECLINED" | null;
}

/** ผลหลังส่งคำตัดสินสำเร็จ — หน้าใบงานขึ้นแถบสรุป (ตัวอย่าง doneHead/doneLine/doneParts · notice) */
export interface ReviewOutcome {
  kind: "closed" | "rejected";
  /** ✓ อนุมัติเคลมแล้ว · ปิดงาน / ✓ ปิดงานแล้ว · ปิดเคลม ไม่ส่งผู้ขาย · หรือข้อความตีกลับ */
  head: string;
  line: string;
  parts: { text: string; tone: "ok" | "drop" }[];
  /** มีชิ้นผ่าน — หัวข้อใช้คำว่า "อนุมัติ" · ไม่มี = ไม่ใช้คำนี้ (ไม่มีใบเคลมไปผู้ขาย) · แถบสรุปเขียวทั้งสองแบบตามตัวอย่าง */
  approved: boolean;
}

interface VerdictOrder {
  id: number;
  code: string;
  branchCode: string;
  branchName: string;
  claims: PartClaim[];
  logs: ClaimLog[];
  claimRound?: ClaimRound | null;
  /** แบบป้ายของยี่ห้อ + รายการ Error — ช่องของเครื่องที่ติ๊กได้ขึ้นกับเครื่อง (Oasis ไม่มี Serial/Error) */
  claimGuide?: { plate: { family: string }; errors: unknown[] };
  /** ช่องที่ติ๊กได้กับเครื่องใบนี้ พร้อมชื่อที่ใช้จริง (เซิร์ฟเวอร์คิด — ที่เดียวกับที่ตรวจตอนรับคำตัดสิน) */
  claimReviewFlags?: ServerFlag[];
}

interface Draft {
  verdict: Record<number, Verdict>;
  /** "เขียนเพิ่ม" ของชิ้นที่ตีกลับ — รวมกับเหตุผลด่วนเป็นเหตุผลที่ช่างเห็น */
  reason: Record<number, string>;
  drop: Record<number, string>;
  dropOther: Record<number, string>;
  /** ช่องของชิ้นที่ติ๊กให้แก้ (เคลมก้อน 4) */
  flags: Record<number, string[]>;
  /** ช่องของเครื่องที่ติ๊ก — ทั้งใบ ไม่ผูกกับชิ้น */
  machine: string[];
  /** เหตุผลด่วนที่เลือกของแต่ละชิ้น */
  quick: Record<number, string[]>;
  /** เหตุผลด่วนข้อไหนเป็นคนติ๊กช่องไหนให้ — กดเหตุผลนั้นออกแล้วช่องนั้นออกด้วย (ถ้าผู้ตรวจไม่ได้ติ๊กเอง) */
  quickSet: Record<number, Record<string, string>>;
}
const EMPTY: Draft = { verdict: {}, reason: {}, drop: {}, dropOther: {}, flags: {}, machine: [], quick: {}, quickSet: {} };

export interface ClaimVerdicts {
  parts: ReviewPart[];
  /** ชิ้นที่เปิดอยู่ (แท็บ) */
  active: ReviewPart | null;
  setActive: (key: number) => void;
  /** ผลของชิ้นนี้ — ชิ้นที่ล็อกใช้ผลเดิม · ยังไม่เลือก = null */
  effOf: (p: ReviewPart) => Verdict | null;
  readyOf: (p: ReviewPart) => boolean;
  setVerdict: (key: number, v: Verdict) => void;
  reasonOf: (key: number) => string;
  setReason: (key: number, v: string) => void;
  dropOf: (key: number) => string;
  setDrop: (key: number, v: string) => void;
  dropOtherOf: (key: number) => string;
  setDropOther: (key: number, v: string) => void;
  /** เหตุผลปิดเคลมแบบที่ส่ง/แสดง ("อื่น ๆ: …") · ชิ้นที่ล็อกใช้ที่บันทึกไว้ */
  declineTextOf: (p: ReviewPart) => string;
  /** ข้อความแท็บ: "✓ ผ่าน" "● รอตัดสิน" "✓ ผ่านแล้ว (รอบ r)" "✗ ตีกลับ (ทั้งใบ)" … */
  stateOf: (p: ReviewPart) => string;
  // ── ตีกลับแบบชี้ช่อง (เคลมก้อน 4) ──
  /** ผู้ตรวจกด ✗ ตีกลับชิ้นนี้เอง (ไม่ใช่ถูกพาไปเพราะตีกลับทั้งใบ) — กล่องติ๊กช่องของชิ้นขึ้นเฉพาะชิ้นแบบนี้ */
  ownRejectOf: (p: ReviewPart) => boolean;
  flagsOf: (key: number) => string[];
  toggleFlag: (key: number, flag: string) => void;
  /** ช่องของชิ้นที่ติ๊กได้ (ลำดับตามฟอร์มของช่าง) */
  partDefs: FlagDef[];
  /** ช่องของเครื่องที่ติ๊กได้สำหรับเครื่องนี้ (ชื่อตามเครื่อง) */
  machineDefs: FlagDef[];
  machineFlags: string[];
  toggleMachine: (flag: string) => void;
  quickOf: (key: number) => string[];
  toggleQuick: (key: number, text: string) => void;
  /** มีชิ้นที่ผู้ตรวจกด ✗ ตีกลับเอง — ช่องของเครื่องติ๊กได้เฉพาะตอนนี้ (ตัวอย่าง mPick) */
  anyOwnReject: boolean;
  /** ตีกลับทั้งใบอยู่ (ติ๊กช่องของเครื่อง) */
  whole: boolean;
  /** ข้อมูลเครื่องล็อกไว้พร้อมชิ้นที่ผ่านแล้ว — ติ๊กช่องของเครื่องไม่ได้ */
  machineLocked: boolean;
  /** "ตีกลับทั้งใบ — … ถูกตีกลับด้วย เพราะใช้ข้อมูลเครื่องชุดเดียวกัน · …" */
  wholeText: string;
  /** ชิ้นนี้ตีกลับเองแต่ยังไม่ได้ติ๊กช่อง (และไม่ได้ตีกลับทั้งใบ) */
  needFieldOf: (p: ReviewPart) => boolean;
  /** "ช่างจะเห็นว่า: ต้องกลับไปถ่ายที่หน้าเครื่อง / แก้จากมือถือได้ ไม่ต้องไปร้าน" ของชิ้นนี้ — ยังไม่ติ๊กอะไร = null */
  visitOf: (p: ReviewPart) => boolean | null;
  summary: string;
  submitLabel: string;
  decided: boolean;
  rejecting: boolean;
  saving: boolean;
  error: string | null;
  press: () => void;
}

/** เหตุผลด่วนข้อไหนติ๊กช่อง flag ให้ — เอาออกจากบันทึกความเป็นเจ้าของ (ผู้ตรวจติ๊ก/เอาออกช่องนั้นเอง) */
function dropOwner(m: Record<string, string> | undefined, flag: string): Record<string, string> {
  return Object.fromEntries(Object.entries(m ?? {}).filter(([, f]) => f !== flag));
}

/**
 * กดเหตุผลด่วน (ตัวอย่าง toggleQuick) — เลือก: ใส่ข้อความ + ติ๊กช่องที่เกี่ยวให้ (ถ้ายังไม่ได้ติ๊ก) และจำว่าข้อนี้เป็นคนติ๊ก
 * กดออก: ข้อความออก และช่องที่ข้อนี้ติ๊กให้ออกด้วย — เว้นแต่ยังมีเหตุผลด่วนอีกข้อที่ใช้ช่องเดียวกันค้างอยู่ (ข้อนั้นรับช่องไปดูแลต่อ)
 * ช่องที่ผู้ตรวจติ๊กเองไม่ถูกเอาออก — ไม่งั้นกดเปลี่ยนใจเหตุผลด่วนข้อเดียว ช่องที่ตั้งใจชี้หายไปเงียบ ๆ
 */
function toggleQuick(cur: Draft, key: number, text: string): Draft {
  const q = QUICK_REASONS.find((x) => x.text === text);
  const list = cur.quick[key] ?? [];
  const owned = { ...(cur.quickSet[key] ?? {}) };
  const flagOfText = (t: string) => QUICK_REASONS.find((r) => r.text === t)?.flag;
  if (list.includes(text)) {
    const f = owned[text];
    delete owned[text];
    const next: Draft = { ...cur, quick: { ...cur.quick, [key]: list.filter((x) => x !== text) }, quickSet: { ...cur.quickSet, [key]: owned } };
    if (!f) return next;
    const machine = isMachineFlag(f);
    // ช่องของเครื่องเป็นของทั้งใบ — เหตุผลด่วนของชิ้นอื่นที่ใช้ช่องเดียวกันรับต่อได้ · ช่องของชิ้นดูเฉพาะชิ้นนี้
    const scope = machine ? Object.keys(next.quick).map(Number) : [key];
    for (const j of scope) {
      const heir = (next.quick[j] ?? []).find((t) => flagOfText(t) === f);
      if (heir) return { ...next, quickSet: { ...next.quickSet, [j]: { ...(next.quickSet[j] ?? {}), [heir]: f } } };
    }
    return machine
      ? { ...next, machine: next.machine.filter((x) => x !== f) }
      : { ...next, flags: { ...next.flags, [key]: (next.flags[key] ?? []).filter((x) => x !== f) } };
  }
  const next: Draft = { ...cur, quick: { ...cur.quick, [key]: [...list, text] } };
  if (!q) return next;
  const machine = isMachineFlag(q.flag);
  const on = machine ? cur.machine.includes(q.flag) : (cur.flags[key] ?? []).includes(q.flag);
  if (on) return next;
  owned[text] = q.flag;
  const withOwner: Draft = { ...next, quickSet: { ...cur.quickSet, [key]: owned } };
  return machine
    ? { ...withOwner, machine: [...cur.machine, q.flag] }
    : { ...withOwner, flags: { ...cur.flags, [key]: [...(cur.flags[key] ?? []), q.flag] } };
}

export function useClaimVerdicts(
  order: VerdictOrder | null,
  enabled: boolean,
  onDone: (outcome: ReviewOutcome) => Promise<void> | void
): ClaimVerdicts {
  const parts = useMemo<ReviewPart[]>(
    () =>
      order
        ? roundPartsOf(order)
            // ชิ้นที่ผลล่าสุดถูกตีกลับแต่ไม่ได้ส่งมาใหม่ในรอบนี้ (ช่างเลิกเคลมชิ้นนั้น) ไม่ใช่เรื่องที่กำลังตัดสิน
            .filter((p) => p.status === "PENDING" || isLockedStatus(p.status))
            .map((p) => ({
              key: p.row.id,
              row: p.row,
              name: partNameOf(p.row),
              round: p.round,
              locked: p.status === "APPROVED" || p.status === "DECLINED" ? p.status : null,
            }))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order?.claims, order?.logs, order?.claimRound]
  );
  const pending = parts.filter((p) => !p.locked);
  const [activeKey, setActiveKey] = useState<number | null>(null);
  const active = parts.find((p) => p.key === activeKey) ?? pending[0] ?? parts[0] ?? null;
  // ช่องของเครื่องที่ติ๊กได้ — ตามแบบป้าย/ยี่ห้อของเครื่องนี้ (ทุกแถวของใบเดียวกันเป็นเครื่องเดียวกัน)
  const refRow = active?.row ?? null;
  const { part: partDefs, machine: machineDefs } = flagDefsOf(order?.claimReviewFlags, {
    family: refRow?.nameplate?.family ?? order?.claimGuide?.plate.family ?? null,
    errorCode: refRow?.fieldCheck?.errorCode ?? null,
    hasErrors: !!order?.claimGuide?.errors.length || !!refRow?.fieldCheck?.errorCode,
  });
  // ร่างจากแอปรุ่นอื่น/เครื่องอื่นอาจมีช่องที่ใบนี้ไม่มี — ส่งไปเซิร์ฟเวอร์ตอบว่าไม่รู้จัก ทิ้งตั้งแต่ตรงนี้
  const partKeys = new Set(partDefs.map((f) => f.key));
  const machineKeys = new Set(machineDefs.map((f) => f.key));
  const fileKeys = new Set([...partDefs, ...machineDefs].filter((f) => f.file).map((f) => f.key));
  const [d, setD] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ร่างของใบนี้ — โหลดครั้งเดียวต่อใบ เก็บเฉพาะชิ้นที่ยังรอตัดสิน (ใบที่ถูกส่งใหม่แล้ว แถวเดิมไม่ใช่ของรอบนี้)
  const draftKey = order ? `review:${order.id}` : null;
  const loadedFor = useRef<string | null>(null);
  const pendingIds = pending.map((p) => p.key).join(",");
  useEffect(() => {
    if (!enabled || !draftKey || loadedFor.current === draftKey) return;
    loadedFor.current = draftKey;
    let gone = false;
    loadDraft(draftKey).then((raw) => {
      if (gone || !raw) return;
      try {
        const saved = JSON.parse(raw) as Partial<Draft>;
        const ids = new Set(pendingIds.split(",").filter(Boolean).map(Number));
        const pick = <T,>(m: Record<string, T> | undefined) =>
          Object.fromEntries(Object.entries(m ?? {}).filter(([k]) => ids.has(Number(k)))) as Record<number, T>;
        setD({
          verdict: pick(saved.verdict),
          reason: pick(saved.reason),
          drop: pick(saved.drop),
          dropOther: pick(saved.dropOther),
          flags: pick(saved.flags),
          machine: Array.isArray(saved.machine) ? saved.machine.filter((x) => typeof x === "string") : [],
          quick: pick(saved.quick),
          quickSet: pick(saved.quickSet),
        });
      } catch {
        // ร่างเสีย (แอปรุ่นอื่นเขียน) — เริ่มใหม่ ดีกว่าหน้าตรวจพัง
      }
    });
    return () => {
      gone = true;
    };
  }, [enabled, draftKey, pendingIds]);
  // เขียนร่างเฉพาะหลังผู้ตรวจเลือก/พิมพ์จริง (ไม่เขียนตอนเปิดหน้า)
  const touched = useRef(false);
  useEffect(() => {
    if (!enabled || !draftKey || !touched.current) return;
    saveDraft(draftKey, JSON.stringify(d));
  }, [enabled, draftKey, d]);

  const patch = (k: "verdict" | "reason" | "drop" | "dropOther", key: number, v: string) => {
    touched.current = true;
    setError(null);
    setD((cur) => ({ ...cur, [k]: { ...cur[k], [key]: v } }));
  };
  const change = (fn: (cur: Draft) => Draft) => {
    touched.current = true;
    setError(null);
    setD(fn);
  };

  /**
   * ข้อมูลเครื่องล็อกไปกับชิ้นที่ผ่านแล้ว (ตัวอย่าง mLocked) — ใบเคลมของชิ้นนั้นออกไปพร้อมค่าชุดนี้แล้ว
   * ถ้ายังให้ติ๊กช่องของเครื่องได้ ใบที่อนุมัติไปจะมีค่าที่ผู้ตรวจเองบอกว่าผิด (เซิร์ฟเวอร์ก็ไม่รับ)
   */
  const machineLocked = !!order && (!!claimRoundOf(order).lockedMachine || parts.some((p) => p.locked === "APPROVED"));
  const ownReject = (p: ReviewPart) => !p.locked && d.verdict[p.key] === "REJECT";
  const anyOwnReject = pending.some(ownReject);
  const machineOn = machineLocked ? [] : d.machine.filter((k) => machineKeys.has(k));
  /** ตีกลับทั้งใบ = มีชิ้นที่กดตีกลับเอง + ติ๊กช่องของเครื่อง (ตัวอย่าง whole = anyRej && mCount && !mLocked) */
  const whole = anyOwnReject && machineOn.length > 0;
  const flagsOf = (key: number) => (d.flags[key] ?? []).filter((k) => partKeys.has(k));

  const effOf = (p: ReviewPart): Verdict | null => {
    if (p.locked === "APPROVED") return "APPROVE";
    if (p.locked === "DECLINED") return "DECLINE";
    const v = d.verdict[p.key] ?? null;
    // ตีกลับทั้งใบ: ชิ้นที่ผ่าน/ยังไม่ตัดสินถูกตีกลับด้วย · ชิ้นที่เลือกปิดเคลมไว้ยังปิดเคลม (ไม่มีอะไรให้ช่างแก้)
    return whole && v !== "DECLINE" ? "REJECT" : v;
  };
  const needFieldOf = (p: ReviewPart) => ownReject(p) && !whole && flagsOf(p.key).length === 0;
  const declineTextOf = (p: ReviewPart) => {
    if (p.locked) return p.row.rejectReason ?? "";
    const pickd = d.drop[p.key] ?? "";
    return pickd === DECLINE_OTHER ? `อื่น ๆ: ${(d.dropOther[p.key] ?? "").trim()}` : pickd;
  };
  const readyOf = (p: ReviewPart) => {
    const v = effOf(p);
    if (!v) return false;
    if (p.locked) return true;
    // ช่องคือสิ่งที่บอกช่างว่าแก้ตรงไหน — ตีกลับทั้งใบมีช่องของเครื่องแล้ว ชิ้นที่ตีกลับเองไม่ต้องติ๊กช่องของชิ้นเพิ่ม
    if (v === "REJECT") return whole || flagsOf(p.key).length > 0;
    if (v === "DECLINE") {
      const pickd = d.drop[p.key];
      return !!pickd && (pickd !== DECLINE_OTHER || !!(d.dropOther[p.key] ?? "").trim());
    }
    return true;
  };
  const stateOf = (p: ReviewPart) => {
    if (p.locked) return p.locked === "APPROVED" ? `✓ ผ่านแล้ว (รอบ ${p.round})` : `ปิดเคลมแล้ว (รอบ ${p.round})`;
    const v = effOf(p);
    if (v === "APPROVE") return "✓ ผ่าน";
    if (v === "REJECT") return whole && !ownReject(p) ? "✗ ตีกลับ (ทั้งใบ)" : "✗ ตีกลับ";
    if (v === "DECLINE") return "ปิดเคลม ไม่ส่งผู้ขาย";
    return "● รอตัดสิน";
  };
  // ข้อความย่อในแถบ "ทั้งใบ: …" — บอกด้วยว่าชิ้นไหนยังขาดอะไร (ตัวอย่าง shortOf)
  const shortOf = (p: ReviewPart) => {
    if (p.locked) return p.locked === "APPROVED" ? "✓ ผ่านแล้ว" : "ปิดเคลมแล้ว";
    const v = effOf(p);
    if (!readyOf(p)) return v === "REJECT" ? "✗ ยังไม่ได้ติ๊กช่อง" : v === "DECLINE" ? "ยังไม่ได้เลือกเหตุผล" : "? รอตัดสิน";
    return v === "APPROVE" ? "✓ ผ่าน" : v === "REJECT" ? "✗ ตีกลับ" : "ปิดเคลม ไม่ส่งผู้ขาย";
  };

  const decided = pending.length > 0 && pending.every(readyOf);
  const rejectN = pending.filter((p) => effOf(p) === "REJECT").length;
  const okN = parts.filter((p) => effOf(p) === "APPROVE").length;
  const dropN = parts.filter((p) => effOf(p) === "DECLINE").length;
  const summary = parts.map((p) => `${p.name} ${shortOf(p)}`).join(" · ");
  const submitLabel = !decided
    ? "ตัดสินให้ครบทุกชิ้นก่อน"
    : rejectN
      ? `ตีกลับให้ช่างแก้ (${rejectN} ชิ้น)`
      : okN
        ? "อนุมัติเคลม · ปิดงาน"
        : `ปิดงาน · ปิดเคลม ไม่ส่งผู้ขาย (${dropN} ชิ้น)`;

  // ตัวอย่าง wholeText — บอกว่าชิ้นไหนถูกพาไปด้วย และเอาออกได้อย่างไร (ไม่ใช่ปล่อยให้ผู้ตรวจงงว่าทำไม ✓ ผ่าน กดไม่ได้)
  const wholeText = whole
    ? `ตีกลับทั้งใบ — ${pending
        .filter((p) => effOf(p) === "REJECT")
        .map((p) => p.name)
        .join(" และ ")} ถูกตีกลับด้วย เพราะใช้ข้อมูลเครื่องชุดเดียวกัน · ไม่ต้องการตีกลับทั้งใบ ให้เอาติ๊กข้อมูลเครื่องออก`
    : "";
  /** เหตุผลที่ช่างเห็น = เขียนเพิ่ม + เหตุผลด่วน (ตัวอย่าง reasonOf) */
  const reasonText = (key: number) => [(d.reason[key] ?? "").trim(), ...(d.quick[key] ?? [])].filter(Boolean).join(" · ");
  const visitOf = (p: ReviewPart): boolean | null => {
    const own = flagsOf(p.key);
    if (!own.length && !whole) return null;
    return own.some((k) => fileKeys.has(k)) || (whole && machineOn.some((k) => fileKeys.has(k)));
  };

  function outcomeOf(): ReviewOutcome {
    const o = order!;
    if (rejectN) {
      const names = pending.filter((p) => effOf(p) === "REJECT").map((p) => p.name);
      return {
        kind: "rejected",
        head: `ตีกลับ ${o.code} ให้ช่างแก้แล้ว (${whole ? "ทั้งใบ" : names.join(", ")}) — ใบนี้จะกลับมาในกล่องงานเมื่อช่างส่งใหม่`,
        line: "",
        parts: [],
        approved: false,
      };
    }
    return {
      kind: "closed",
      head: okN ? "✓ อนุมัติเคลมแล้ว · ปิดงาน" : "✓ ปิดงานแล้ว · ปิดเคลม ไม่ส่งผู้ขาย",
      line: [
        `${o.code} · ${o.branchCode} ${o.branchName}`,
        okN ? `อนุมัติ ${okN} ชิ้น` : "",
        dropN ? `ปิดเคลม ไม่ส่งผู้ขาย ${dropN} ชิ้น` : "",
        dayTime(new Date().toISOString()),
      ]
        .filter(Boolean)
        .join(" · "),
      parts: parts.map((p) =>
        effOf(p) === "APPROVE"
          ? { text: `✓ ${p.name} (${p.row.partCode}) — อนุมัติ`, tone: "ok" as const }
          : { text: `– ${p.name} — ปิดเคลม ไม่ส่งผู้ขาย (${declineTextOf(p)})`, tone: "drop" as const }
      ),
      approved: okN > 0,
    };
  }

  async function post() {
    if (!order || saving) return;
    /**
     * ช่องของชิ้นและเหตุผลส่งเฉพาะชิ้นที่ผู้ตรวจกดตีกลับเอง (ตัวอย่าง own(i)) — ชิ้นที่ถูกพาไปเพราะทั้งใบได้แค่ช่องของเครื่อง
     * เคยติ๊กช่องของชิ้นไว้แล้วเปลี่ยนใจเป็นผ่าน แต่ถูกตีกลับทั้งใบ: ติ๊กเก่าที่มองไม่เห็นแล้วห้ามติดไปด้วย
     * (เคยทำให้งานที่แก้จากมือถือได้ กลายเป็นต้องกลับไปร้าน)
     */
    const decisions = pending.map((p) => {
      const v = effOf(p)!;
      if (v === "REJECT") {
        const own = ownReject(p);
        const reason = own ? reasonText(p.key) : "";
        const flags = [...(own ? flagsOf(p.key) : []), ...(whole ? machineOn : [])];
        return { claimId: p.key, verdict: v, ...(reason ? { reason } : {}), flags };
      }
      return { claimId: p.key, verdict: v, ...(v === "DECLINE" ? { reason: declineTextOf(p) } : {}) };
    });
    const outcome = outcomeOf();
    setSaving(true);
    setError(null);
    try {
      await api.post(`/work-orders/${order.id}/claim-review`, { decisions });
      touched.current = false;
      if (draftKey) clearDraft(draftKey);
      setD(EMPTY);
      await onDone(outcome);
    } catch (e) {
      // 409 (มีคนตรวจใบนี้ไปแล้ว / ใบเปลี่ยนไปแล้ว) — ตัวจัดการกลางโหลดใบใหม่และบอกเหตุผลจากเซิร์ฟเวอร์ให้แล้ว ไม่บอกซ้ำ
      if (staleWorkOrderId(e) === null) setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  /**
   * ปุ่มส่งในแถบล่าง — ยังตัดสินไม่ครบ: พาไปชิ้นแรกที่ยังขาดพร้อมบอกว่าขาดอะไร (ไม่ส่ง)
   * มีชิ้นตีกลับ: ส่งเลย (ตัวอย่างไม่มีคำยืนยันตอนตีกลับ — ใบกลับไปหาช่าง ไม่ได้ปิด)
   * ไม่มีชิ้นตีกลับ: ยืนยันก่อน เพราะใบงานจะปิดและใบเคลมจะออกไปผู้ขาย (เจ้าของงานเลือกข้อ 12)
   */
  function press() {
    if (saving || !order) return;
    if (!decided) {
      const gap = pending.find((p) => !readyOf(p));
      if (!gap) return;
      setActiveKey(gap.key);
      const v = effOf(gap);
      setError(
        `${gap.name}: ${
          v === "REJECT" ? NEED_FIELD : v === "DECLINE" ? "ปิดเคลม ไม่ส่งผู้ขาย ต้องเลือกเหตุผล" : "ยังไม่ได้ตัดสิน — ตัดสินให้ครบทุกชิ้นก่อน"
        }`
      );
      return;
    }
    if (rejectN) {
      void post();
      return;
    }
    const lines = parts.map((p) =>
      effOf(p) === "APPROVE" ? `✓ ${p.name} — อนุมัติ ออกใบเคลมส่งผู้ขาย` : `${p.name} — ปิดเคลม ไม่ส่งผู้ขาย (${declineTextOf(p)})`
    );
    showAlert(
      okN ? `อนุมัติ ${okN} ชิ้น ใบงานจะปิด` : `ปิดเคลม ${dropN} ชิ้น ไม่ส่งผู้ขาย ใบงานจะปิด`,
      [
        ...lines,
        "",
        okN ? "หลังอนุมัติ ใบเคลม PDF และไฟล์หลักฐานพร้อมดาวน์โหลดส่งผู้ขาย" : "ไม่มีชิ้นที่ส่งผู้ขาย — ไม่ออกใบเคลม",
      ].join("\n"),
      [
        { text: "กลับไปดูอีกครั้ง", style: "cancel" },
        { text: okN ? "ยืนยันอนุมัติ" : "ยืนยันปิดงาน", onPress: () => void post() },
      ]
    );
  }

  return {
    parts,
    active,
    setActive: (key) => {
      setActiveKey(key);
      setError(null);
    },
    effOf,
    readyOf,
    setVerdict: (key, v) => patch("verdict", key, v),
    reasonOf: (key) => d.reason[key] ?? "",
    setReason: (key, v) => patch("reason", key, v),
    dropOf: (key) => d.drop[key] ?? "",
    setDrop: (key, v) => patch("drop", key, v),
    dropOtherOf: (key) => d.dropOther[key] ?? "",
    setDropOther: (key, v) => patch("dropOther", key, v),
    declineTextOf,
    stateOf,
    ownRejectOf: ownReject,
    flagsOf,
    toggleFlag: (key, flag) =>
      change((cur) => {
        const list = cur.flags[key] ?? [];
        const on = list.includes(flag);
        // ติ๊ก/เอาออกเอง — เหตุผลด่วนที่เคยติ๊กช่องนี้ให้ ไม่ใช่เจ้าของช่องนี้อีกต่อไป (กดเหตุผลนั้นออกแล้วช่องไม่หายตาม)
        return {
          ...cur,
          flags: { ...cur.flags, [key]: on ? list.filter((x) => x !== flag) : [...list, flag] },
          quickSet: { ...cur.quickSet, [key]: dropOwner(cur.quickSet[key], flag) },
        };
      }),
    partDefs,
    machineDefs,
    machineFlags: machineOn,
    toggleMachine: (flag) =>
      change((cur) => ({
        ...cur,
        machine: cur.machine.includes(flag) ? cur.machine.filter((x) => x !== flag) : [...cur.machine, flag],
        quickSet: Object.fromEntries(Object.entries(cur.quickSet).map(([k, m]) => [k, dropOwner(m, flag)])),
      })),
    quickOf: (key) => d.quick[key] ?? [],
    toggleQuick: (key, text) => change((cur) => toggleQuick(cur, key, text)),
    anyOwnReject,
    whole,
    machineLocked,
    wholeText,
    needFieldOf,
    visitOf,
    summary,
    submitLabel,
    decided,
    rejecting: rejectN > 0,
    saving,
    error,
    press,
  };
}
