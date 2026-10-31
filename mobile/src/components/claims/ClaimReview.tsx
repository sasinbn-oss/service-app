/**
 * หน้าตรวจเคลมของ Admin Spare Part — ทุกอย่างที่ต้องใช้ตัดสินอยู่บนจอเดียว (เคลมก้อน 2 · ตัวอย่างที่เจ้าของงานเลือก ต.ค. 69)
 *
 * เดิมผู้ตรวจเปิดใบงานยาว ๆ แล้วเลื่อนหาการ์ดเคลมกลางหน้า ข้อมูลเครื่องซ้ำทุกชิ้น วิดีโอต้องเปิดแท็บใหม่ทีละไฟล์
 * รอบที่ถูกตีกลับปนกับรอบใหม่ (จางบ้างไม่จางบ้าง) และไม่รู้ว่าช่างแก้อะไรมาบ้าง — ต้องเปิดสองรอบเทียบเอง
 * ตอนนี้: หัวบอกใคร/รอบไหน/รอกี่วัน/ประกัน/เคลมซ้ำ · ข้อมูลเครื่องครั้งเดียว (ใช้ร่วมทุกชิ้น) วางภาพตัดคู่ค่าที่บันทึก ·
 * แท็บทีละชิ้นด้วยชื่ออะไหล่ · หลักฐานของแถวนั้นตามที่เซิร์ฟเวอร์ตัดสิน (evidenceIds) พร้อมป้าย "ใหม่รอบนี้" ·
 * "แก้จากรอบก่อน" บอกสิ่งที่เปลี่ยน · รอบเก่าพับไว้ล่างสุด · รายละเอียดใบงานที่เหลือพับไว้ (กดดูได้)
 * แถบตัดสิน (DecisionBar) อยู่นอกส่วนที่เลื่อน คนเรียกวางไว้ต่อท้าย ScrollView ของใบงาน
 *
 * ตัดสินทีละชิ้น (เคลมก้อน 3): แท็บบอกผลที่เลือกของแต่ละชิ้น · ชิ้นที่ผ่าน/ปิดเคลมไปแล้วในรอบก่อนยังมีแท็บ (ล็อกไว้ ดูได้)
 * กล่องเลือกเหตุผล "ปิดเคลม ไม่ส่งผู้ขาย" อยู่ใต้แท็บ (ไม่ใช่หน้าต่างซ้อน — Modal ซ้อนบนเว็บไม่น่าเชื่อถือ)
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../Tap";
import Spinner from "../Spinner";
import ImageViewer from "../ImageViewer";
import { ClaimHistoryLinks } from "../ClaimHistoryEntry";
import ClaimTrail, { dayTime } from "./ClaimTrail";
import ClaimCrop, { LookalikeText } from "./ClaimCrop";
import ClaimVideo from "./ClaimVideo";
import CheckGroups from "./CheckGroups";
import { thaiDate } from "../DateField";
import { api, apiErrorMessage, resolveImageUrl } from "../../api/client";
import { openUrl } from "../../utils/share";
import { showAlert } from "../../utils/alert";
import { linkFor } from "../../utils/attachmentCache";
import type { ClaimGuide } from "../../utils/nameplate";
import type { Attachment } from "../WorkOrderAttachments";
import {
  CLAIM_STATUS_TEXT,
  bkkDay,
  claimRoundOf,
  brokenMatches,
  checkGroupsOf,
  claimTrailOf,
  daysSince,
  diffSincePrevious,
  errorLabelOf,
  evidenceFile,
  evidenceOf,
  evidenceRoleLabel,
  hasLookalike,
  isLegacyPlate,
  isNewThisRound,
  keepNoteOf,
  oldRoundsLabel,
  oldRoundsOf,
  partNameOf,
  plateSourceText,
  previousOf,
  roundOf,
  rowsSince,
  unmatchedKeepNotes,
  type ClaimLog,
  type ClaimRepeat,
  type ClaimRound,
  type DiffLine,
  type PartClaim,
} from "../../utils/claimEvidence";
import { DECLINE_OTHER, DECLINE_REASONS, type ClaimVerdicts, type ReviewPart } from "./useClaimVerdicts";
import { colors, radius, spacing, headingFont } from "../../theme";

/** ฟิลด์ของใบงานเท่าที่หน้าตรวจใช้ — WorkOrder ของหน้ารายละเอียดเข้ากับรูปนี้ */
export interface ClaimReviewOrder {
  id: number;
  code: string;
  isTest?: boolean;
  branchCode: string;
  branchName: string;
  machineCode: string | null;
  machineBrand: string | null;
  symptom: string | null;
  closeResultLabel: string | null;
  beforeCount?: number;
  afterCount?: number;
  branchWarrantyExpiresAt: string | null;
  branchWarrantyExpired: boolean | null;
  branchIsCompany: boolean;
  logs: ClaimLog[];
  claims: PartClaim[];
  /** สถานะทีละชิ้นของงานซ่อมครั้งนี้ (เคลมก้อน 3) — ข้อมูลเครื่องล็อกไว้เมื่อมีชิ้นผ่านแล้ว */
  claimRound?: ClaimRound | null;
  claimTroubleshooting: string[];
  claimGuide?: ClaimGuide;
  /** ใบเคลมเก่าของเครื่องเดียวกัน — เซิร์ฟเวอร์ส่งเฉพาะแอดมิน · ไม่มีค่า = ไม่ต้องขึ้นบรรทัดเคลมซ้ำ */
  claimRepeats?: ClaimRepeat[];
}

/** ยี่ห้อที่คนเรียก — ทะเบียนบางเครื่องเขียน "HB - Huebsch" */
const brandOf = (b: string | null) => (b ?? "").replace(/^\s*hb\s*-\s*/i, "").trim();

export default function ClaimReview({
  order,
  v,
  readOnly,
  files,
  filesState,
  onRetryFiles,
  detailOpen,
  onToggleDetail,
  onOpenOrder,
}: {
  order: ClaimReviewOrder;
  /** คำตัดสินทีละชิ้น — หน้าใบงานถือไว้ แถบล่างจอใช้ชุดเดียวกัน */
  v: ClaimVerdicts;
  /** ดูในฐานะผู้ใช้อื่น — ไม่มีกล่องเลือกเหตุผล */
  readOnly: boolean;
  files: Attachment[];
  /** รายการไฟล์ของใบ: กำลังโหลด · โหลดแล้ว · โหลดไม่สำเร็จ — หลักฐานที่หาไม่เจอจะขึ้นต่างกันตามนี้ */
  filesState: "loading" | "ready" | "failed";
  /** ขอรายการไฟล์ใหม่ (ปุ่ม "ลองใหม่" ตอนโหลดไม่สำเร็จ) */
  onRetryFiles: () => void;
  /** รายละเอียดใบงานที่เหลือ (การ์ดขั้นตอน ผลการทำงาน ไฟล์ ประวัติ) เปิดอยู่ไหม — คนเรียกเป็นคนพับ */
  detailOpen: boolean;
  onToggleDetail: () => void;
  /** เปิดใบงานอื่น (บรรทัดเคลมซ้ำ "▸ ดูใบนั้น") */
  onOpenOrder: (id: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const wide = width >= 860;
  const scope = useMemo(() => rowsSince(order.claims, order.logs), [order.claims, order.logs]);
  const pending = useMemo(() => scope.filter((c) => c.status === "PENDING").sort((a, b) => a.id - b.id), [scope]);
  const [viewing, setViewing] = useState<{ items: Attachment[]; at: number } | null>(null);
  const [oldOpen, setOldOpen] = useState(false);
  const [opening, setOpening] = useState<number | null>(null);
  // ชิ้นที่เปิดอยู่มาจากคำตัดสิน (แถบล่างจอเปลี่ยนชิ้นได้ด้วย เช่น กดส่งตอนยังไม่ครบ = พาไปชิ้นที่ขาด)
  const active: ReviewPart | null = v.active;
  const showDrop = !!active && !active.locked && !readOnly && v.effOf(active) === "DECLINE";
  const dropRef = useRef<View>(null);
  // กด "ปิดเคลม ไม่ส่งผู้ขาย" ที่แถบล่างจอ กล่องเลือกเหตุผลขึ้นใต้แท็บซึ่งอาจอยู่นอกจอ — เลื่อนมาให้เห็น (เว็บ)
  useEffect(() => {
    if (!showDrop || Platform.OS !== "web") return;
    const el = dropRef.current as unknown as { scrollIntoView?: (o: object) => void } | null;
    el?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [showDrop, active?.key]);

  const cur = active?.row ?? pending[0] ?? null;
  if (!cur || !active || !pending.length) return null;
  const locked = active.locked;
  const lockedMachine = claimRoundOf(order).lockedMachine;

  const family = cur.nameplate?.family ?? order.claimGuide?.plate.family ?? null;
  const waitingSince = pending.reduce((m, c) => (Date.parse(c.createdAt) > Date.parse(m) ? c.createdAt : m), pending[0].createdAt);
  const waitDays = daysSince(waitingSince);
  const round = Math.max(...pending.map((c) => roundOf(c, scope)));
  const sender =
    cur.createdByName ??
    [...order.logs].filter((l) => l.action === "CLAIM_SUBMITTED").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.byName ??
    null;
  const mismatch = pending.filter((c) => brokenMatches(c) === false).length;
  const prev = previousOf(cur, scope);
  const diff = diffSincePrevious(cur, prev, files, family);
  const keep = keepNoteOf(cur, order.logs);
  const partNotes: DiffLine[] = [
    ...diff.part,
    ...(keep ? [{ kind: "keep" as const, text: `ช่างตอบ “ค่าเดิมถูกแล้ว” · ${keep}` }] : []),
    // ท่อนที่บอกไม่ได้ว่าเป็นของชิ้นไหน — ขึ้นตามข้อความในประวัติทุกแท็บ ดีกว่าให้คำอธิบายของช่างหายไป
    ...unmatchedKeepNotes(pending, order.logs).map((text) => ({ kind: "keep" as const, text: `ช่างตอบ “ค่าเดิมถูกแล้ว” · ${text}` })),
  ];
  const checks = checkGroupsOf(cur, order.claimTroubleshooting, order.claimGuide);
  const olds = oldRoundsOf(order.claims, order.logs, files, family);
  const trail = claimTrailOf(order.claims, order.logs);
  const arrived = [...order.logs]
    .filter((l) => l.action === "ARRIVED" && Date.parse(l.createdAt) <= Date.parse(cur.createdAt))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  // หลักฐานของแถวที่เปิดอยู่ — ไฟล์ของชิ้น (รูปอะไหล่เก่า · วิดีโอการตรวจเช็ค) กับของเครื่อง (วิดีโอ Error · รูปอาการ · ป้ายรุ่น)
  const own = evidenceOf(cur, files);
  const partPhoto = evidenceFile(cur, files, "CLAIM_PART");
  const checkVideo = evidenceFile(cur, files, "CLAIM_CHECK_VIDEO");
  // ก่อนก้อน 5 ไฟล์ของเครื่องยังแนบแยกทีละชิ้น — ชิ้นที่เปิดอยู่ไม่มี ใช้ของชิ้นอื่นในรอบเดียวกัน
  const machineFile = (role: string) =>
    evidenceFile(cur, files, role) ?? pending.map((c) => evidenceFile(c, files, role)).find(Boolean) ?? null;
  const errVideo = machineFile("CLAIM_ERROR_VIDEO");
  const symptomPhoto = machineFile("CLAIM_SYMPTOM");
  const platePhoto = files.find((f) => f.id === cur.nameplate?.photoId) ?? null;
  // รายการไฟล์ของใบยังโหลดไม่เสร็จ/โหลดไม่สำเร็จ — อย่าบอกว่า "ไม่มี" ทั้งที่เซิร์ฟเวอร์บอกว่ามีหลักฐาน
  // (ผู้ตรวจจะตีกลับเพราะไฟล์ที่ช่างแนบมาแล้ว)
  const none = (what: string) =>
    filesState === "loading" ? "กำลังโหลดไฟล์…" : filesState === "failed" ? "โหลดไฟล์ไม่สำเร็จ" : `ไม่มี${what}`;
  const viewList = [platePhoto, partPhoto, symptomPhoto, ...own.filter((f) => f.kind === "IMAGE")]
    .filter((f, i, a): f is Attachment => !!f && a.findIndex((x) => x?.id === f.id) === i);
  const openImage = (f: Attachment) => setViewing({ items: viewList, at: Math.max(0, viewList.findIndex((x) => x.id === f.id)) });

  const errLabel = errorLabelOf(cur.fieldCheck);
  const errVideoLabel = evidenceRoleLabel("CLAIM_ERROR_VIDEO", cur.fieldCheck?.errorCode, family);
  const legacy = isLegacyPlate(cur.nameplate);
  const match = brokenMatches(cur);
  const warranty = order.branchIsCompany
    ? null
    : order.branchWarrantyExpired === true
      ? { ok: false, text: "หมดประกัน" }
      : order.branchWarrantyExpiresAt
        ? { ok: true, text: `✓ ในประกันถึง ${thaiDate(bkkDay(order.branchWarrantyExpiresAt))}` }
        : null;
  const repeats = order.claimRepeats
    ? [...order.claimRepeats].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3)
    : null;

  async function openPdf(claimId: number) {
    setOpening(claimId);
    try {
      const res = await api.post<{ path: string }>(`/work-orders/${order.id}/claims/${claimId}/pdf-link`);
      await openUrl(resolveImageUrl(res.data.path)!);
    } catch (e) {
      showAlert("เปิดใบเคลมไม่ได้", apiErrorMessage(e));
    } finally {
      setOpening(null);
    }
  }

  const head = (
    <View style={[styles.headRow, !wide && styles.stack]}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[styles.title, headingFont]}>
          {order.code} · {order.branchCode} {order.branchName}
          {order.machineCode ? ` · ${order.machineCode}${brandOf(order.machineBrand) ? ` ${brandOf(order.machineBrand)}` : ""}` : ""}
        </Text>
        <Text style={styles.meta}>
          ช่าง {sender ?? "—"}
          {cur.createdByCode ? ` (${cur.createdByCode})` : ""} · ส่ง {dayTime(waitingSince)}
          {warranty ? " · " : ""}
          {warranty ? <Text style={{ fontWeight: "800", color: warranty.ok ? colors.successInk : colors.dangerInk }}>{warranty.text}</Text> : null}
        </Text>
        {/* เคลมซ้ำ — เครื่องเดิมเคยเคลมเมื่อไหร่ (เซิร์ฟเวอร์ส่งเฉพาะแอดมิน) ผู้ตรวจเห็นก่อนตัดสินโดยไม่ต้องไปค้นประวัติเอง */}
        {repeats && !repeats.length ? <Text style={[styles.meta, styles.okText]}>✓ เคลมซ้ำ: ไม่พบที่เครื่องนี้</Text> : null}
        {repeats?.map((r) => (
          <View key={`${r.workOrderId}-${r.partCode}-${r.createdAt}`} style={styles.repeatRow}>
            <Text style={[styles.meta, styles.warnText, { flexShrink: 1 }]}>
              ⚠ {r.partCode} เครื่องนี้เคยเคลมเมื่อ {thaiDate(bkkDay(r.createdAt))} ({daysSince(r.createdAt)} วันก่อน) ·{" "}
              {CLAIM_STATUS_TEXT[r.status] ?? r.status}
            </Text>
            <TouchableOpacity
              onPress={() => onOpenOrder(r.workOrderId)}
              style={styles.linkBtn}
              accessibilityLabel={`ดูใบนั้น ${r.code}`}
            >
              <Text style={styles.link}>▸ ดูใบนั้น</Text>
            </TouchableOpacity>
          </View>
        ))}
        {mismatch || order.isTest ? (
          <View style={styles.chips}>
            {mismatch ? <Text style={[styles.chip, styles.chipWarn]}>รหัสตัวเสียไม่ตรง {mismatch} ชิ้น</Text> : null}
            {/* ใบทดสอบเด่นไว้ — ผู้ตรวจต้องไม่ส่งของใบทดสอบให้ผู้ขาย */}
            {order.isTest ? <Text style={[styles.chip, styles.chipTest]}>ใบทดสอบ</Text> : null}
          </View>
        ) : null}
        <ClaimTrail trail={trail} tail={`รอ Admin Spare Part ตรวจ · ${waitDays} วัน`} />
        <ClaimHistoryLinks branchCode={order.branchCode} machineCode={order.machineCode} />
      </View>
      <View style={[styles.headSide, !wide && styles.headSideNarrow]}>
        <Text style={styles.roundBadge}>
          รอบ {round} · รอ {waitDays} วัน
        </Text>
        <TouchableOpacity onPress={onToggleDetail} style={styles.linkBtn} accessibilityState={{ expanded: detailOpen }}>
          <Text style={styles.link}>{detailOpen ? "ซ่อนรายละเอียดใบงาน ▾" : "ดูรายละเอียดใบงาน ▸"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const fields = cur.nameplate?.fields ?? [];
  const machine = (
    <View style={styles.section} accessibilityLabel="ข้อมูลเครื่องในใบเคลม">
      <Text style={styles.sectionTitle}>ข้อมูลเครื่อง (ใช้ร่วมทุกชิ้น)</Text>
      <View style={[styles.cols, !wide && styles.stack]}>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          {fields.map((f) => (
            <View key={f.key} style={[styles.plateRow, !wide && styles.stack]}>
              <Text style={styles.plateLabel}>{f.label}</Text>
              {f.crop ? (
                <View style={wide ? styles.plateCrop : undefined}>
                  <ClaimCrop uri={f.crop} label={f.label} height={56} />
                </View>
              ) : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                {f.key === "model" ? (
                  <LookalikeText value={f.value} label={f.label} />
                ) : (
                  <Text style={styles.plateValue}>{f.value}</Text>
                )}
                <Text style={styles.small}>
                  {plateSourceText(f, legacy)}
                  {f.key === "model" && hasLookalike(f.value) ? " · พื้นเหลือง = ตัวที่หน้าตาคล้ายกัน" : ""}
                </Text>
              </View>
            </View>
          ))}
          {/* ใบที่ส่งก่อนมีปุ่มยืนยันทีละช่อง — ช่างติ๊กครั้งเดียวทั้งชุด บอกตามที่ช่างทำจริง */}
          {legacy && fields.some((f) => f.source === "SCAN") ? (
            <Text style={styles.small}>{cur.nameplate?.verified ? "ช่างติ๊กว่าตรวจค่ากับรูปแล้ว" : "ค่าที่ระบบอ่าน — ยังไม่ได้ตรวจกับรูป"}</Text>
          ) : null}
          {!fields.length ? <Text style={styles.small}>ใบนี้ไม่มีข้อมูลป้ายรุ่น (ส่งก่อนมีช่องป้ายรุ่น)</Text> : null}
          {errLabel ? (
            <View style={styles.errRow}>
              <Text style={styles.plateLabelInline}>Error ที่เครื่องขึ้น</Text>
              <Text style={styles.errValue}>{errLabel}</Text>
              {order.symptom ? <Text style={styles.small}>ใบแจ้ง: “{order.symptom}”</Text> : null}
            </View>
          ) : null}
          {diff.machine.map((n) => (
            <Text key={n.text} style={[styles.note, n.kind === "keep" ? styles.noteKeep : styles.noteFix]}>
              แก้จากรอบก่อน: {n.text}
            </Text>
          ))}
          {/*
            มีชิ้นผ่านแล้ว = ใบเคลมของชิ้นนั้นออกไปพร้อมค่าชุดนี้ ข้อมูลเครื่องจึงล็อกไปด้วย (ตัวอย่าง mLocked)
            ถ้ายังตีกลับข้อมูลเครื่องได้ ใบที่อนุมัติไปแล้วจะมีค่าที่ผู้ตรวจเองบอกว่าผิด
          */}
          {lockedMachine?.byParts.length ? (
            <View style={styles.lockRow}>
              <Ionicons name="lock-closed-outline" size={15} color={colors.successInk} />
              <Text style={styles.lockText}>ล็อกไว้พร้อม {lockedMachine.byParts.join(" · ")} ที่ผ่านแล้ว</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.media, wide && { width: 300 }]}>
          {errVideo ? (
            <View style={{ gap: 2 }}>
              <MediaHead label={errVideoLabel} fresh={isNewThisRound(errVideo, prev)} />
              <ClaimVideo workOrderId={order.id} attachmentId={errVideo.id} label={errVideoLabel} height={150} />
            </View>
          ) : (
            <Text style={styles.small}>{none(errVideoLabel)}</Text>
          )}
          <View style={styles.thumbRow}>
            {platePhoto ? (
              <Thumb file={platePhoto} label="รูปป้ายรุ่น" a11y="เปิดรูปป้ายรุ่นเต็ม" onPress={() => openImage(platePhoto)} />
            ) : null}
            {symptomPhoto ? (
              <Thumb
                file={symptomPhoto}
                label="รูปอาการ"
                fresh={isNewThisRound(symptomPhoto, prev)}
                a11y={`เปิด ${symptomPhoto.roleLabel ?? "รูปอาการ"}`}
                onPress={() => openImage(symptomPhoto)}
              />
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );

  const name = partNameOf(cur);
  // ชิ้นที่ปิดเคลมไปแล้วไม่มีใบเคลม (เซิร์ฟเวอร์ตอบ 409) — ไม่มีปุ่มให้กดแล้วล้ม · ชิ้นที่ผ่านแล้วเป็นใบจริง ไม่ใช่ร่าง
  const pdfLabel = locked === "APPROVED" ? `ใบเคลม PDF · ${name}` : `ใบเคลม PDF (ร่าง) · ${name}`;
  const tabs = (
    <View style={styles.tabs} accessibilityLabel="ชิ้นที่เคลม">
      {v.parts.map((p) => {
        const on = p.key === active.key;
        const e = v.effOf(p);
        const fg = e === "APPROVE" ? colors.successInk : e === "REJECT" ? colors.dangerInk : e === "DECLINE" ? colors.body : colors.navy;
        return (
          <TouchableOpacity
            key={p.key}
            onPress={() => v.setActive(p.key)}
            style={[styles.tab, on && styles.tabOn]}
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.tabText, { color: fg }]}>
              {p.name} · {v.stateOf(p)}
            </Text>
          </TouchableOpacity>
        );
      })}
      <View style={{ flex: 1 }} />
      {locked === "DECLINED" ? null : (
        <TouchableOpacity
          onPress={() => openPdf(cur.id)}
          disabled={opening !== null}
          style={styles.draftBtn}
          accessibilityLabel={pdfLabel}
        >
          {opening === cur.id ? <Spinner color={colors.navy} size="small" /> : <Ionicons name="document-text-outline" size={16} color={colors.navy} />}
          <Text style={styles.draftText}>{pdfLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  /**
   * ปิดเคลม ไม่ส่งผู้ขาย: เลือกเหตุผล (ตัวอย่างที่เจ้าของงานเลือก DROP) — ชิ้นนี้จบเลย ไม่วนกลับหาช่าง ไม่ออกใบเคลม
   * บังคับเหตุผลเพราะเป็นการตัดสิทธิ์เคลมถาวร คนเปิดประวัติเคลมทีหลังต้องรู้ว่าทำไม
   */
  const drop = showDrop ? (
    <View ref={dropRef} style={styles.dropBox} accessibilityLabel="ปิดเคลม ไม่ส่งผู้ขาย">
      <Text style={styles.dropTitle}>
        {name} — ปิดเคลม ไม่ส่งผู้ขาย: เลือกเหตุผล <Text style={{ color: colors.dangerInk }}>*</Text>
      </Text>
      <Text style={styles.small}>ชิ้นนี้ปิดไปเลย ไม่วนกลับหาช่าง และไม่ออกใบเคลมให้ผู้ขาย</Text>
      <View style={styles.dropOpts}>
        {DECLINE_REASONS.map((r) => {
          const on = v.dropOf(active.key) === r;
          return (
            <TouchableOpacity
              key={r}
              style={[styles.dropOpt, on && styles.dropOptOn]}
              onPress={() => v.setDrop(active.key, r)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
            >
              <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={18} color={on ? colors.navy : colors.textFaint} />
              <Text style={styles.dropOptText}>{r}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {v.dropOf(active.key) === DECLINE_OTHER ? (
        <View style={styles.dropOtherRow}>
          <Text style={styles.dropOtherLabel}>เหตุผลอื่น (บังคับ)</Text>
          <TextInput
            style={styles.dropOther}
            value={v.dropOtherOf(active.key)}
            onChangeText={(t) => v.setDropOther(active.key, t)}
            maxLength={300}
            placeholder="เช่น ชิ้นนี้ช่างซื้อเองนอกระบบ"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={`เหตุผลอื่น ${name}`}
          />
        </View>
      ) : null}
    </View>
  ) : null;

  const part = (
    <View style={[styles.section, styles.cols, !wide && styles.stack]} accessibilityLabel={name}>
      <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
        <View style={[styles.codeBoxes, !wide && styles.stack]}>
          <View style={[styles.codeBox, styles.codeBoxPlain]}>
            <Text style={styles.small}>อะไหล่ที่เปลี่ยนใส่</Text>
            <Text style={styles.code}>{cur.partCode}</Text>
            <Text style={styles.small}>
              {cur.partName}
              {cur.quantity > 1 ? ` × ${cur.quantity}` : ""}
            </Text>
          </View>
          <View style={[styles.codeBox, match === false ? styles.codeBoxWarn : match ? styles.codeBoxOk : styles.codeBoxPlain]}>
            <Text style={styles.small}>รหัสอะไหล่ตัวที่เสีย (ตัวที่ส่งเคลม)</Text>
            <Text style={styles.code}>{cur.brokenPartCode?.trim() || "—"}</Text>
            {match !== null ? (
              <Text style={[styles.small, { fontWeight: "800", color: match ? colors.successInk : colors.warningInk }]}>
                {match ? "✓ ตรงกับอะไหล่ที่เปลี่ยนใส่" : "ไม่ตรงกับอะไหล่ที่เปลี่ยนใส่"}
              </Text>
            ) : null}
            {prev && (prev.brokenPartCode ?? "").trim() !== (cur.brokenPartCode ?? "").trim() ? (
              <Text style={styles.small}>(รอบก่อน: {prev.brokenPartCode?.trim() || "—"})</Text>
            ) : null}
          </View>
        </View>
        {partNotes.map((n) => (
          <Text key={n.text} style={[styles.note, n.kind === "keep" ? styles.noteKeep : styles.noteFix]}>
            {n.kind === "keep" ? n.text : `แก้จากรอบก่อน: ${n.text}`}
          </Text>
        ))}
        <View>
          <Text style={styles.small}>อาการ/สาเหตุ</Text>
          <Text style={styles.body}>{cur.symptom}</Text>
        </View>
        <View>
          <Text style={styles.small}>ช่างเข้าเช็คอะไรบ้าง{checks.count ? ` · ${checks.count}` : ""}</Text>
          <Text style={styles.body}>{cur.checkNote ? `“${cur.checkNote}”` : "—"}</Text>
          <CheckGroups groups={checks.groups} />
        </View>
      </View>
      <View style={[styles.media, wide && { width: 320 }]}>
        <Text style={styles.mediaTitle}>{locked ? `หลักฐานที่ส่งรอบ ${active.round}:` : "หลักฐานรอบนี้:"}</Text>
        {partPhoto ? (
          <View style={{ gap: 2 }}>
            <MediaHead label="รูปอะไหล่เก่า" fresh={isNewThisRound(partPhoto, prev)} />
            <BigPhoto workOrderId={order.id} file={partPhoto} onPress={() => openImage(partPhoto)} />
          </View>
        ) : (
          <Text style={styles.small}>{none("รูปอะไหล่เก่า")}</Text>
        )}
        {checkVideo ? (
          <View style={{ gap: 2 }}>
            <MediaHead label="วิดีโอการตรวจเช็ค" fresh={isNewThisRound(checkVideo, prev)} />
            <ClaimVideo workOrderId={order.id} attachmentId={checkVideo.id} label={`วิดีโอการตรวจเช็ค ${name}`} />
          </View>
        ) : (
          <Text style={styles.small}>{none("วิดีโอการตรวจเช็ค")}</Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.pane} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityLabel="หน้าตรวจเคลม">
      {viewing ? (
        <ImageViewer workOrderId={order.id} items={viewing.items} startIndex={viewing.at} onClose={() => setViewing(null)} />
      ) : null}
      {head}
      {filesState === "failed" ? (
        <View style={styles.failBox} accessibilityLabel="โหลดไฟล์ไม่สำเร็จ">
          <Text style={[styles.meta, { flex: 1, minWidth: 0, color: colors.dangerInk }]}>
            โหลดรายการไฟล์ไม่สำเร็จ — รูปและวิดีโอหลักฐานยังไม่ขึ้น
          </Text>
          <TouchableOpacity onPress={onRetryFiles} style={styles.linkBtn} accessibilityLabel="โหลดไฟล์ใหม่">
            <Text style={styles.link}>ลองใหม่</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {detailOpen ? (
        <Text style={styles.woBox}>
          ใบแจ้ง: “{order.symptom ?? "—"}”{arrived ? ` · ถึงหน้างาน ${dayTime(arrived.createdAt)}` : ""} · ผลการทำงาน:{" "}
          {order.closeResultLabel ?? "—"}
          {typeof order.beforeCount === "number" ? ` · รูปก่อนซ่อม ${order.beforeCount}` : ""}
          {typeof order.afterCount === "number" ? ` · รูปหลังซ่อม ${order.afterCount}` : ""}
        </Text>
      ) : null}
      {machine}
      {tabs}
      {drop}
      {part}
      {/* รอบที่ถูกตีกลับไปแล้ว พับไว้ล่างสุด — ตัดสินจากรอบนี้ เปิดดูเมื่ออยากรู้ว่าเคยถูกตีกลับเรื่องอะไร */}
      {olds.length ? (
        <View style={styles.section} accessibilityLabel="รอบก่อน">
          <TouchableOpacity onPress={() => setOldOpen((o) => !o)} style={styles.oldBtn} accessibilityState={{ expanded: oldOpen }}>
            <Text style={styles.oldLabel}>{oldRoundsLabel(olds, oldOpen)}</Text>
          </TouchableOpacity>
          {oldOpen
            ? olds.map((r) => (
                <View key={`${r.round}-${r.at}`} style={{ gap: 2 }}>
                  {r.lines.map((l, i) => (
                    <Text key={i} style={[styles.oldLine, OLD_TONE[l.tone]]}>
                      {l.text}
                    </Text>
                  ))}
                </View>
              ))
            : null}
        </View>
      ) : null}
    </View>
  );
}

const OLD_TONE = {
  head: { color: colors.navy, fontWeight: "700" as const },
  ok: { color: colors.successInk },
  bad: { color: colors.dangerInk },
  muted: { color: colors.body },
};

function MediaHead({ label, fresh }: { label: string; fresh?: boolean }) {
  return (
    <View style={styles.mediaHead}>
      <Text style={styles.mediaLabel}>{label}</Text>
      {fresh ? <Text style={styles.fresh}>ใหม่รอบนี้</Text> : null}
    </View>
  );
}

/** รูปย่อกดเปิดตัวดูรูป */
function Thumb({ file, label, fresh, a11y, onPress }: { file: Attachment; label: string; fresh?: boolean; a11y: string; onPress: () => void }) {
  return (
    <View style={{ gap: 2 }}>
      <MediaHead label={label} fresh={fresh} />
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityLabel={a11y}>
        {file.thumbnailDataUrl ? (
          <Image source={{ uri: file.thumbnailDataUrl }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.blank]}>
            <Ionicons name="image-outline" size={22} color={colors.textFaint} />
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

/**
 * รูปอะไหล่เก่าขนาดใหญ่ — ผู้ตรวจต้องอ่านรหัสบนสติกเกอร์เทียบกับรหัสที่ช่างพิมพ์ รูปย่อเล็กเกินจะอ่าน
 * ขึ้นรูปย่อก่อน (มีอยู่แล้ว) แล้วเปลี่ยนเป็นไฟล์จริงเมื่อได้ลิงก์ · กดเปิดตัวดูรูปเพื่อซูม
 */
function BigPhoto({ workOrderId, file, onPress }: { workOrderId: number; file: Attachment; onPress: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (file.available !== false) linkFor(workOrderId, file.id).then((u) => alive && setUrl(u)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [workOrderId, file.id, file.available]);
  const uri = url ?? file.thumbnailDataUrl;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityLabel={`เปิด ${file.roleLabel ?? "รูปอะไหล่เก่า"}`}>
      {uri ? (
        <Image source={{ uri }} style={styles.bigPhoto} resizeMode="contain" />
      ) : (
        <View style={[styles.bigPhoto, styles.blank]}>
          <Ionicons name="image-outline" size={28} color={colors.textFaint} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pane: { gap: spacing.md },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  stack: { flexDirection: "column", alignItems: "stretch" },
  title: { fontSize: 19, lineHeight: 28, fontWeight: "700", color: colors.navy },
  meta: { fontSize: 13, lineHeight: 20, color: colors.body },
  okText: { color: colors.successInk, fontWeight: "700" },
  warnText: { color: colors.dangerInk, fontWeight: "700" },
  repeatRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { fontSize: 12.5, lineHeight: 18, fontWeight: "800", paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, overflow: "hidden" },
  chipWarn: { color: colors.warningInk, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warningBorder },
  // พื้นเทาเข้มทั้งสองโหมด — textMuted โหมดมืดเป็นเทาอ่อน ตัวขาวบนนั้นอ่านไม่ออก ชิปที่ต้องเด่นจะหายไป
  chipTest: { color: "#fff", backgroundColor: colors.neutralFill },
  headSide: { alignItems: "flex-end", gap: 2 },
  headSideNarrow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  roundBadge: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: colors.navy,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: "hidden",
  },
  linkBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  link: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
  woBox: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.body,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  section: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.body },
  cols: { flexDirection: "row", gap: spacing.lg },
  plateRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  plateLabel: { width: 60, fontSize: 13, color: colors.body },
  plateLabelInline: { fontSize: 13, color: colors.body },
  plateCrop: { width: 250 },
  plateValue: { fontSize: 17, lineHeight: 26, fontWeight: "800", letterSpacing: 1, fontFamily: "monospace", color: colors.text },
  small: { fontSize: 12, lineHeight: 18, color: colors.body },
  errRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 4, columnGap: 10 },
  errValue: { fontSize: 14, lineHeight: 20, fontWeight: "800", color: colors.text },
  note: { fontSize: 13, lineHeight: 19, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, overflow: "hidden" },
  noteFix: { color: colors.primaryInk, backgroundColor: colors.primarySoft },
  noteKeep: { color: colors.warningInk, backgroundColor: colors.warningSoft },
  media: { gap: 8 },
  mediaTitle: { fontSize: 12.5, lineHeight: 18, fontWeight: "800", color: colors.navy },
  mediaHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  mediaLabel: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.body },
  fresh: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    color: "#fff",
    // navyFill ไม่ใช่ primaryInk — primaryInk โหมดมืดเป็นฟ้าอ่อน ตัวขาวบนนั้นอ่านไม่ออก (ป้ายนี้คือสิ่งที่บอกว่าอะไรเปลี่ยน)
    backgroundColor: colors.navyFill,
    borderRadius: 6,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  thumbRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  thumb: { width: 104, height: 104, borderRadius: radius.sm, backgroundColor: colors.tile },
  blank: { alignItems: "center", justifyContent: "center" },
  bigPhoto: { width: "100%", height: 200, borderRadius: radius.sm, backgroundColor: colors.tile },
  tabs: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  // หดได้และตัดบรรทัดได้ — ชื่ออะไหล่ยาว/ชื่อซ้ำที่ต่อรหัสไว้ท้าย ล้นจอโทรศัพท์แล้วถูกตัดเงียบ ๆ (ส่วนที่ถูกตัดคือรหัสที่แยกชิ้น)
  tab: {
    flexShrink: 1,
    maxWidth: "100%",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tabOn: { borderColor: colors.navy, backgroundColor: colors.sky50 },
  tabText: { fontSize: 14, fontWeight: "700", color: colors.navy },
  draftBtn: {
    flexShrink: 1,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.navy,
    backgroundColor: colors.card,
  },
  draftText: { flexShrink: 1, fontSize: 14, fontWeight: "700", color: colors.navy },
  failBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.dangerSoft,
  },
  codeBoxes: { flexDirection: "row", gap: 8 },
  codeBox: { flex: 1, minWidth: 0, borderRadius: 10, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 8 },
  codeBoxPlain: { backgroundColor: colors.rowAlt, borderColor: colors.rowAlt },
  codeBoxOk: { backgroundColor: colors.successSoft, borderColor: colors.success },
  codeBoxWarn: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  code: { fontSize: 18, lineHeight: 26, fontWeight: "800", fontFamily: "monospace", color: colors.text },
  body: { fontSize: 14, lineHeight: 21, color: colors.text },
  oldBtn: { minHeight: 44, justifyContent: "center" },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  lockText: { flexShrink: 1, fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.successInk },
  dropBox: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.neutralFill,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  dropTitle: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.text },
  dropOpts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dropOpt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  dropOptOn: { borderColor: colors.navy, borderWidth: 2, backgroundColor: colors.sky50 },
  dropOptText: { fontSize: 14, color: colors.text },
  dropOtherRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  dropOtherLabel: { fontSize: 13, fontWeight: "700", color: colors.body },
  dropOther: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 0,
    minHeight: 44,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
  },
  oldLabel: { fontSize: 14, fontWeight: "700", color: colors.body },
  oldLine: { fontSize: 13, lineHeight: 19 },
});
