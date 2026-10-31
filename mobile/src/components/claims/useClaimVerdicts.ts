/**
 * การตัดสินเคลมทีละชิ้นของหน้าตรวจเคลม (เคลมก้อน 3 · ตัวอย่างที่เจ้าของงานเลือก rvCalc/rvSubmit)
 *
 * ทำไมแยกเป็น hook: แท็บชิ้นกับกล่องปิดเคลมอยู่ในหน้าตรวจ (ส่วนที่เลื่อน) แต่ปุ่มตัดสินอยู่ในแถบล่างจอ (นอกส่วนที่เลื่อน)
 * สองที่ต้องเห็นชิ้นที่เปิดอยู่และผลที่เลือกไว้ชุดเดียวกัน — หน้าใบงานถือค่านี้ไว้แล้วส่งให้ทั้งสองที่
 *
 * กติกาตามตัวอย่าง:
 * - ชิ้นที่ตัดสินจบในรอบก่อนของงานซ่อมครั้งนี้ (ผ่าน · ปิดเคลม ไม่ส่งผู้ขาย) ล็อกไว้ ไม่ต้องตรวจซ้ำ แต่ยังนับในคำยืนยัน
 * - ตีกลับต้องมีเหตุผล (ก้อน 4 เปลี่ยนเป็นติ๊กช่อง) · ปิดเคลมต้องเลือกเหตุผล ("อื่น ๆ" ต้องพิมพ์)
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
  isLockedStatus,
  partNameOf,
  roundPartsOf,
  type ClaimLog,
  type ClaimRound,
  type PartClaim,
} from "../../utils/claimEvidence";
import { dayTime } from "./ClaimTrail";

export type Verdict = "APPROVE" | "REJECT" | "DECLINE";

/** เหตุผลปิดเคลม ไม่ส่งผู้ขาย — ชุดเดียวกับ CLAIM_DECLINE_REASONS ฝั่งเซิร์ฟเวอร์ (ตัวอย่างที่เจ้าของงานเลือก DROP) */
export const DECLINE_REASONS = ["หมดประกัน", "ไม่ใช่ชิ้นในประกัน", "อื่น ๆ"] as const;
export const DECLINE_OTHER = "อื่น ๆ";
/** ข้อความเดียวกับเซิร์ฟเวอร์ (SEND_BACK_REASON_REQUIRED) — กันไว้ที่หน้าจอก่อน ไม่ต้องรอโดนปฏิเสธ */
export const SEND_BACK_REASON_REQUIRED = "ตีกลับต้องบอกเหตุผล — ช่างจะได้รู้ว่าต้องแก้อะไร";

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
}

interface Draft {
  verdict: Record<number, Verdict>;
  reason: Record<number, string>;
  drop: Record<number, string>;
  dropOther: Record<number, string>;
}
const EMPTY: Draft = { verdict: {}, reason: {}, drop: {}, dropOther: {} };

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
  /** ข้อความแท็บ: "✓ ผ่าน" "● รอตัดสิน" "✓ ผ่านแล้ว (รอบ r)" … */
  stateOf: (p: ReviewPart) => string;
  summary: string;
  submitLabel: string;
  decided: boolean;
  rejecting: boolean;
  saving: boolean;
  error: string | null;
  press: () => void;
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
        setD({ verdict: pick(saved.verdict), reason: pick(saved.reason), drop: pick(saved.drop), dropOther: pick(saved.dropOther) });
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

  const patch = (k: keyof Draft, key: number, v: string) => {
    touched.current = true;
    setError(null);
    setD((cur) => ({ ...cur, [k]: { ...cur[k], [key]: v } }));
  };

  const effOf = (p: ReviewPart): Verdict | null =>
    p.locked === "APPROVED" ? "APPROVE" : p.locked === "DECLINED" ? "DECLINE" : d.verdict[p.key] ?? null;
  const declineTextOf = (p: ReviewPart) => {
    if (p.locked) return p.row.rejectReason ?? "";
    const pickd = d.drop[p.key] ?? "";
    return pickd === DECLINE_OTHER ? `อื่น ๆ: ${(d.dropOther[p.key] ?? "").trim()}` : pickd;
  };
  const readyOf = (p: ReviewPart) => {
    const v = effOf(p);
    if (!v) return false;
    if (p.locked) return true;
    if (v === "REJECT") return !!(d.reason[p.key] ?? "").trim();
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
    if (v === "REJECT") return "✗ ตีกลับ";
    if (v === "DECLINE") return "ปิดเคลม ไม่ส่งผู้ขาย";
    return "● รอตัดสิน";
  };
  // ข้อความย่อในแถบ "ทั้งใบ: …" — บอกด้วยว่าชิ้นไหนยังขาดอะไร (ตัวอย่าง shortOf)
  const shortOf = (p: ReviewPart) => {
    if (p.locked) return p.locked === "APPROVED" ? "✓ ผ่านแล้ว" : "ปิดเคลมแล้ว";
    const v = effOf(p);
    if (!readyOf(p)) return v === "REJECT" ? "✗ ยังไม่ได้ใส่เหตุผล" : v === "DECLINE" ? "ยังไม่ได้เลือกเหตุผล" : "? รอตัดสิน";
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

  function outcomeOf(): ReviewOutcome {
    const o = order!;
    if (rejectN) {
      const names = pending.filter((p) => effOf(p) === "REJECT").map((p) => p.name);
      return {
        kind: "rejected",
        head: `ตีกลับ ${o.code} ให้ช่างแก้แล้ว (${names.join(", ")}) — ใบนี้จะกลับมาในกล่องงานเมื่อช่างส่งใหม่`,
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
    const decisions = pending.map((p) => {
      const v = effOf(p)!;
      return {
        claimId: p.key,
        verdict: v,
        ...(v === "REJECT" ? { reason: (d.reason[p.key] ?? "").trim() } : v === "DECLINE" ? { reason: declineTextOf(p) } : {}),
      };
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
          v === "REJECT" ? SEND_BACK_REASON_REQUIRED : v === "DECLINE" ? "ปิดเคลม ไม่ส่งผู้ขาย ต้องเลือกเหตุผล" : "ยังไม่ได้ตัดสิน — ตัดสินให้ครบทุกชิ้นก่อน"
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
    summary,
    submitLabel,
    decided,
    rejecting: rejectN > 0,
    saving,
    error,
    press,
  };
}
