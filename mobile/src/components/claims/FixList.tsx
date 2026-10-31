/**
 * ฟอร์มแก้เคลม: รายการ "ต้องแก้ ({n})" เฉพาะช่องที่ Admin Spare Part ชี้ (เคลมก้อน 4 · ตัวอย่างที่เจ้าของงานเลือก fixItems)
 *
 * เดิมถูกตีกลับแล้วฟอร์มเปิดมาทั้งฟอร์มเหมือนปิดงานใหม่ ช่างต้องอ่านเหตุผลแล้วไล่หาเองว่าช่องไหน — บางคนแก้ผิดช่อง
 * บางคนแนบใหม่ทุกไฟล์ทั้งที่ผิดแค่รหัส · ตอนนี้ขึ้นเฉพาะช่องที่ถูกชี้ ช่องไฟล์บอกว่าต้องแนบใหม่และโชว์ไฟล์เดิม (จาง)
 * ช่องค่าโชว์ค่าที่แก้ได้ตรงนั้น · ทุกช่องมี "ค่าเดิมถูกแล้ว" ให้อธิบายแทนการแก้ (ผู้ตรวจอาจดูผิด ไม่บังคับให้แก้ของที่ถูก)
 * ส่วนที่เหลือของฟอร์มพับไว้ (คนเรียกเป็นคนพับ) ยังแก้ได้ถ้าจำเป็น
 *
 * ค่าที่แก้เก็บในฟอร์มปิดงานชุดเดียวกับส่วนที่พับ (ร่าง · ช่องไฟล์ · ป้ายรุ่น) — แก้ตรงนี้กับในส่วนที่พับคือค่าเดียวกัน
 * "แก้แล้วหรือยัง" คิดแบบเดียวกับที่เซิร์ฟเวอร์บังคับตอนส่ง (flagSatisfied) — บอกก่อนส่ง ไม่ต้องรอโดนปฏิเสธ
 * เซิร์ฟเวอร์ยังเป็นคนตัดสินจริง ตรงนี้กันแค่การกดส่งโดยลืมแก้
 */
import React from "react";
import { Image, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../Tap";
import Dropdown from "../Dropdown";
import ClaimCrop from "./ClaimCrop";
import ClaimFileSlot, { slotKey, type SlotUpload, type useClaimUploads } from "./ClaimFileSlot";
import { ErrorCheckList, type ClaimCheckDraft, type PlateDraft } from "../ClaimMachineBox";
import type { Attachment } from "../WorkOrderAttachments";
import type { ClaimPartDraft } from "../../utils/closeDraft";
import { plateFields, type ClaimGuide } from "../../utils/nameplate";
import { evidenceFile, errorLabelOf, foldCode, type PartClaim } from "../../utils/claimEvidence";
import { flagIsFile, flagLabel, machineFlagsOf, partFlagsOf } from "../../utils/claimFlags";
import { attachmentIcon } from "../../utils/attachments";
import { colors, radius, spacing } from "../../theme";

export interface FixItem {
  /** "m:MODEL" (ของเครื่อง) · "p:{sparePartId}:{flag}" (ของชิ้น) — คีย์ของคำอธิบายในร่างและของจุดที่ปุ่ม "พาไป" เลื่อนไปหา */
  key: string;
  flag: string;
  /** null = ช่องของเครื่อง (ใช้ร่วมทุกชิ้น) */
  sparePartId: number | null;
  /** แถวที่ถูกตีกลับ — ค่าเดิม/ไฟล์เดิมมาจากแถวนี้ (ช่องของเครื่อง: แถวแรกที่ถูกชี้ช่องนั้น) */
  row: PartClaim;
  label: string;
  /** "{ชิ้น} · {ช่อง}" / "ข้อมูลเครื่อง · {ช่อง}" */
  title: string;
  file: boolean;
  changed: boolean;
  /** ค่าเดิม → ค่าใหม่ ของช่องค่า (บรรทัด "✓ แก้แล้ว: …") */
  change: string;
  /** คำอธิบาย "ค่าเดิมถูกแล้ว" — null = ยังไม่ได้เปิดช่อง */
  keep: string | null;
  /** อธิบายครบแล้ว (3–300 ตัวอักษร ตามที่เซิร์ฟเวอร์รับ) */
  explained: boolean;
}

export interface FixInput {
  /** แถวล่าสุดของชิ้นที่ถูกตีกลับพร้อมช่อง และชิ้นนั้นยังติ๊กส่งเคลมอยู่ */
  rows: PartClaim[];
  nameOf: (sparePartId: number) => string;
  family: string | null;
  /** Error ที่เลือกอยู่ตอนนี้ — "ไม่มี Error ขึ้น" เปลี่ยนชื่อวิดีโอเป็นวิดีโออาการตอนเครื่องเดิน */
  errorCode: string | null;
  guide?: ClaimGuide;
  draftFor: (id: number) => ClaimPartDraft;
  plate: PlateDraft;
  check: ClaimCheckDraft;
  /** มีไฟล์ชนิดนี้ที่แนบหลังถูกตีกลับ (ids = ชิ้นที่ดู · null = ชิ้นไหนก็ได้) · kept = นับเฉพาะที่ขึ้นเสร็จแล้ว */
  newFile: (ids: number[] | null, role: string, since: string | null, kept: boolean) => boolean;
  /** ถ่ายป้ายรุ่นใหม่หลังถูกตีกลับ (เลือกไว้ในฟอร์ม หรือขึ้นใบงานแล้ว) */
  newPlate: (since: string | null) => boolean;
  keeps: Record<string, string | null>;
  /** นับแบบ "ออกจากหน้านี้แล้วกลับมา" (ตัวเลขในร่าง) — ไฟล์ที่ยังส่งไม่เสร็จไม่นับ */
  kept?: boolean;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const clip = (s: string, n: number) => {
  const v = s.trim().replace(/\s+/g, " ");
  return v.length > n ? `${v.slice(0, n)}…` : v || "—";
};
const plateOf = (row: PartClaim, key: string) => (row.nameplate?.fields ?? []).find((f) => f.key === key)?.value.trim() ?? "";
const plateNow = (plate: PlateDraft, key: string) => (plate.values[key]?.value ?? "").trim();

/** รายการช่องที่ต้องแก้ เรียงแบบตัวอย่าง: ของเครื่องก่อน แล้วทีละชิ้นตามลำดับช่องในฟอร์ม */
export function buildFixItems(input: FixInput): FixItem[] {
  const { rows, draftFor, plate, check, keeps } = input;
  const kept = !!input.kept;
  const ctx = { family: input.family, errorCode: input.errorCode ?? rows[0]?.fieldCheck?.errorCode ?? null };
  const keepOf = (key: string) => {
    const k = keeps[key];
    return { keep: k ?? null, explained: typeof k === "string" && k.trim().length >= 3 && k.trim().length <= 300 };
  };
  const out: FixItem[] = [];

  for (const flag of machineFlagsOf(rows)) {
    const row = rows.find((r) => (r.reviewFlags ?? []).includes(flag)) ?? rows[0];
    const since = row.reviewedAt;
    let changed = false;
    let change = "";
    if (flag === "CLAIM_ERROR_VIDEO" || flag === "CLAIM_SYMPTOM") changed = input.newFile(null, flag, since, kept);
    else if (flag === "MODEL" || flag === "SERIAL") {
      const key = flag === "MODEL" ? "model" : "serial";
      const was = plateOf(row, key);
      const now = plateNow(plate, key);
      if (now !== was) {
        changed = !!now;
        change = `${was || "—"} → ${now || "—"}`;
      } else if (input.newPlate(since)) {
        changed = true;
        change = "ถ่ายรูปป้ายรุ่นใหม่";
      }
    } else if (flag === "PLATE_OTHER") {
      const diff = plateFields(input.guide?.plate)
        .filter((f) => !f.model && plateNow(plate, f.key) !== plateOf(row, f.key))
        .map((f) => `${f.label} ${plateOf(row, f.key) || "—"} → ${plateNow(plate, f.key) || "—"}`);
      if (diff.length) {
        changed = true;
        change = diff.join(" · ");
      } else if (input.newPlate(since)) {
        changed = true;
        change = "ถ่ายรูปป้ายรุ่นใหม่";
      }
    } else if (flag === "ERROR_CODE") {
      const was = row.fieldCheck?.errorCode ?? "";
      const now = check.errorCode ?? "";
      changed = !!now && now !== was;
      change = `${errorLabelOf(row.fieldCheck) ?? "—"} → ${now ? (now === "อื่น ๆ" ? "ไม่มี Error ขึ้น" : now) : "—"}`;
    }
    const key = `m:${flag}`;
    const label = flagLabel(flag, ctx);
    out.push({ key, flag, sparePartId: null, row, label, title: `ข้อมูลเครื่อง · ${label}`, file: flagIsFile(flag), changed, change, ...keepOf(key) });
  }

  for (const row of rows) {
    const id = row.sparePartId;
    const d = draftFor(id);
    const since = row.reviewedAt;
    for (const flag of partFlagsOf(row)) {
      let changed = false;
      let change = "";
      if (flag === "CLAIM_PART" || flag === "CLAIM_CHECK_VIDEO") changed = input.newFile([id], flag, since, kept);
      else if (flag === "BROKEN_CODE") {
        const was = (row.brokenPartCode ?? "").trim();
        const now = d.brokenPartCode.trim();
        changed = !!now && now !== was;
        change = `${was || "—"} → ${now || "—"}`;
      } else if (flag === "SYMPTOM") {
        changed = !!d.symptom.trim() && d.symptom.trim() !== row.symptom.trim();
        change = `${clip(row.symptom, 32)} → ${clip(d.symptom, 32)}`;
      } else if (flag === "CHECKS") {
        const errWas = row.fieldCheck?.checked ?? [];
        changed =
          d.checkNote.trim() !== row.checkNote.trim() ||
          !sameSet(d.troubleshooting, row.troubleshooting) ||
          !sameSet(check.checked, errWas);
        const n = (ts: string[], err: string[]) => ts.length + err.length;
        change = `ติ๊ก ${n(row.troubleshooting, errWas)} ข้อ · “${clip(row.checkNote, 22)}” → ติ๊ก ${n(d.troubleshooting, check.checked)} ข้อ · “${clip(d.checkNote, 22)}”`;
        // เขียนเพิ่มต้องไม่ว่าง (เซิร์ฟเวอร์บังคับอยู่แล้ว) — ลบทิ้งหมดไม่นับว่าแก้แล้ว
        if (!d.checkNote.trim()) changed = false;
      }
      const key = `p:${id}:${flag}`;
      const label = flagLabel(flag, ctx);
      out.push({ key, flag, sparePartId: id, row, label, title: `${input.nameOf(id)} · ${label}`, file: flagIsFile(flag), changed, change, ...keepOf(key) });
    }
  }
  return out;
}

/** ยังไม่ได้แก้และยังไม่ได้อธิบาย — ปุ่มล่างพาไปช่องแรก · แถบ "ยังส่งไม่ได้" นับช่องพวกนี้ */
export const unresolvedOf = (items: FixItem[]) => items.filter((i) => !i.changed && !i.explained);

export interface FixEnv {
  files: Attachment[];
  /** ไฟล์เคลมของรอบนี้ในใบงาน (id · ชิ้น · ชนิด · เวลา) */
  evidence: { id?: number; sparePartId: number | null; role: string; createdAt?: string }[];
  removed: ReadonlySet<number>;
  guide?: ClaimGuide;
  troubleshooting: string[];
  brand: string;
  partCodeOf: (id: number) => string;
  /** ชิ้นที่ส่งเคลมรอบนี้ (ไม่รวมชิ้นที่ล็อกแล้ว) — ไฟล์ของเครื่องแนบให้ทุกชิ้น (ก่อนก้อน 5 หลักฐานยังเก็บทีละชิ้น) */
  claimedIds: number[];
  draftFor: (id: number) => ClaimPartDraft;
  patchDraft: (id: number, patch: Partial<ClaimPartDraft>) => void;
  plate: PlateDraft;
  setPlate: (next: PlateDraft) => void;
  check: ClaimCheckDraft;
  setCheck: (next: ClaimCheckDraft) => void;
  uploads: ReturnType<typeof useClaimUploads>;
  readOnly: boolean;
  setKeep: (key: string, value: string | null) => void;
  /** ถ่ายป้ายรุ่นใหม่ให้ระบบอ่าน — กางส่วนที่พับแล้วพาไปกล่องข้อมูลเครื่อง */
  onRescan: () => void;
  /** การแก้ครั้งแรกนับเป็นการกรอกจริง (ร่างเริ่มบันทึก) */
  onTouch: () => void;
}

export default function FixList({
  items,
  env,
  spot,
  flashOn,
}: {
  items: FixItem[];
  env: FixEnv;
  spot: (key: string) => object;
  flashOn: (key: string) => React.ReactNode;
}) {
  return (
    <View style={styles.list} accessibilityLabel="ช่องที่ต้องแก้">
      <Text style={styles.heading}>ต้องแก้ ({items.length})</Text>
      {items.map((it) => (
        <Item key={it.key} it={it} env={env} spot={spot(`fix:${it.key}`)} flash={flashOn(`fix:${it.key}`)} />
      ))}
    </View>
  );
}

function Item({ it, env, spot, flash }: { it: FixItem; env: FixEnv; spot: object; flash: React.ReactNode }) {
  const done = it.changed || it.explained;
  const old = it.file ? evidenceFile(it.row, env.files, it.flag) : null;
  const status = it.changed
    ? it.file
      ? "✓ แนบใหม่แล้ว — แทนไฟล์เดิม"
      : `✓ แก้แล้ว: ${it.change}`
    : it.explained
      ? "✓ ส่งคำอธิบายแทนการแก้"
      : it.file
        ? "ยังไม่ได้แก้ — ต้องแนบใหม่"
        : "ยังไม่ได้แก้";
  return (
    <View style={[styles.item, done ? styles.itemDone : styles.itemTodo]} accessibilityLabel={`ต้องแก้ ${it.title}`} {...spot}>
      {flash}
      <View style={styles.itemHead}>
        <Text style={[styles.itemTitle, { color: done ? colors.successInk : colors.dangerInk }]}>
          {done ? "✓" : "✗"} {it.title}
        </Text>
        {it.file ? <Text style={styles.siteTag}>ต้องแนบใหม่</Text> : null}
      </View>

      {it.file ? (
        <View style={styles.oldRow}>
          {old ? (
            old.thumbnailDataUrl ? (
              <Image source={{ uri: old.thumbnailDataUrl }} style={[styles.oldThumb, !it.changed && styles.oldDim]} />
            ) : (
              <View style={[styles.oldThumb, styles.oldBlank, !it.changed && styles.oldDim]}>
                <Ionicons name={attachmentIcon(old.kind)} size={18} color={colors.textFaint} />
              </View>
            )
          ) : null}
          <Text style={styles.oldText}>
            {it.changed
              ? "ไฟล์ใหม่แทนไฟล์เดิมแล้ว — ไฟล์เดิมเก็บเป็นประวัติ ไม่ส่งไปกับใบเคลม"
              : "ไฟล์เดิม (ถูกตีกลับ) — ไฟล์ใหม่จะแทนไฟล์นี้"}
          </Text>
        </View>
      ) : null}

      <Editor it={it} env={env} />

      {/* ค่าเดิมถูกแล้ว — ผู้ตรวจดูผิดได้ ช่างไม่ต้องแก้ของที่ถูกให้ผิดเพื่อให้ส่งผ่าน แต่ต้องบอกเหตุผล (เซิร์ฟเวอร์รับ 3–300 ตัว) */}
      {it.keep === null ? (
        it.changed ? null : (
          <TouchableOpacity
            style={styles.keepBtn}
            onPress={() => {
              env.onTouch();
              env.setKeep(it.key, "");
            }}
            accessibilityLabel={`ค่าเดิมถูกแล้ว ${it.title}`}
          >
            {/* คำตามตัวอย่างที่เจ้าของงานอนุมัติ (openExplain) — บอกตั้งแต่ก่อนกดว่ากดแล้วต้องเขียนอธิบาย ไม่ใช่ผ่านเฉย ๆ */}
            <Text style={styles.keepBtnText}>ค่าเดิมถูกแล้ว — อธิบายให้ผู้ตรวจ</Text>
          </TouchableOpacity>
        )
      ) : (
        <View style={{ gap: 4 }}>
          <Text style={styles.label}>ค่าเดิมถูกแล้ว — อธิบายให้ผู้ตรวจ (บังคับ)</Text>
          <TextInput
            style={[styles.input, styles.area, !it.explained && !it.changed && styles.inputMissing]}
            value={it.keep}
            onChangeText={(t) => {
              env.onTouch();
              env.setKeep(it.key, t);
            }}
            placeholder="เช่น วิดีโอเห็นร่องพูเลย์ที่วินาที 0:12"
            placeholderTextColor={colors.textFaint}
            maxLength={300}
            multiline
            accessibilityLabel={`ค่าเดิมถูกแล้ว — อธิบายให้ผู้ตรวจ ${it.title}`}
          />
          <TouchableOpacity
            style={styles.undo}
            onPress={() => env.setKeep(it.key, null)}
            accessibilityLabel={`ไม่ใช้ค่าเดิม ${it.title}`}
          >
            <Text style={styles.undoText}>ไม่ใช้ — จะแก้ช่องนี้แทน</Text>
          </TouchableOpacity>
        </View>
      )}
      <Text style={[styles.status, { color: done ? colors.successInk : colors.dangerInk }]}>{status}</Text>
    </View>
  );
}

/** ช่องแก้ค่าตามชนิดที่ถูกชี้ — แก้ค่าเดียวกับในฟอร์มส่วนที่พับ (ร่างของชิ้น · ป้ายรุ่น · Error) */
function Editor({ it, env }: { it: FixItem; env: FixEnv }) {
  const touchDraft = (id: number, patch: Partial<ClaimPartDraft>) => {
    env.onTouch();
    env.patchDraft(id, patch);
  };

  if (it.file) {
    const video = it.flag.endsWith("VIDEO");
    const since = it.row.reviewedAt;
    // ไฟล์ของเครื่อง: แนบไฟล์เดียวให้ทุกชิ้นที่ส่งเคลมรอบนี้ (ก่อนก้อน 5 ใบเคลมแต่ละชิ้นยังเก็บหลักฐานของเครื่องแยกกัน
    // ถ้าแนบให้ชิ้นเดียว ใบเคลมของอีกชิ้นจะยังพาไฟล์เดิมที่ถูกตีกลับไปหาผู้ขาย)
    const ids = it.sparePartId === null ? env.claimedIds : [it.sparePartId];
    const slots = ids.map((id) => env.uploads.slots[slotKey(id, it.flag)]).filter((s): s is SlotUpload => !!s);
    const upload: SlotUpload | undefined = slots.length
      ? {
          ...slots[0],
          status: slots.some((s) => s.status === "failed") ? "failed" : slots.some((s) => s.status === "uploading") ? "uploading" : "done",
          progress: slots.reduce((n, s) => n + s.progress, 0) / slots.length,
          error: slots.find((s) => s.error)?.error ?? null,
        }
      : undefined;
    const fresh = env.evidence
      .filter(
        (e) =>
          e.role === it.flag &&
          (it.sparePartId === null || e.sparePartId === it.sparePartId) &&
          !!e.createdAt &&
          !!since &&
          Date.parse(e.createdAt) > Date.parse(since) &&
          !(e.id && env.removed.has(e.id))
      )
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
    const freshFile = fresh?.id ? env.files.find((f) => f.id === fresh.id) : undefined;
    return (
      <ClaimFileSlot
        label={it.label}
        video={video}
        partCode={it.sparePartId === null ? "ข้อมูลเครื่อง" : env.partCodeOf(it.sparePartId)}
        upload={upload}
        existing={fresh ? { thumb: freshFile?.thumbnailDataUrl ?? null, kind: freshFile?.kind ?? (video ? "VIDEO" : "IMAGE") } : null}
        readOnly={env.readOnly}
        onPick={(f) => {
          env.onTouch();
          ids.forEach((id) => env.uploads.start(slotKey(id, it.flag), f, it.flag, id));
        }}
        onRetry={() =>
          ids.forEach((id) => {
            const s = env.uploads.slots[slotKey(id, it.flag)];
            if (s?.status === "failed") env.uploads.start(slotKey(id, it.flag), s.file, it.flag, id);
          })
        }
      />
    );
  }

  const id = it.sparePartId;
  if (id !== null) {
    const d = env.draftFor(id);
    const code = env.partCodeOf(id);
    if (it.flag === "BROKEN_CODE") {
      const now = d.brokenPartCode.trim();
      const same = !!now && foldCode(now) === foldCode(code);
      return (
        <View style={{ gap: 4 }}>
          <Text style={styles.label}>รหัสอะไหล่ตัวที่เสีย — แก้ค่า</Text>
          <TextInput
            style={[styles.input, it.changed ? styles.inputOk : styles.inputMissing]}
            value={d.brokenPartCode}
            onChangeText={(v) => touchDraft(id, { brokenPartCode: v })}
            autoCapitalize="characters"
            placeholder="พิมพ์รหัสจากสติกเกอร์บนอะไหล่เก่า"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={`รหัสอะไหล่ตัวที่เสีย — แก้ค่า ${code}`}
          />
          {now ? (
            <Text style={[styles.hint, { color: same ? colors.successInk : colors.warningInk }]}>
              {same ? `✓ ตรงกับอะไหล่ที่เปลี่ยนใส่ (${code})` : `ไม่ตรงกับอะไหล่ที่เปลี่ยนใส่ (${code}) — ดูสติกเกอร์อีกครั้ง`}
            </Text>
          ) : null}
        </View>
      );
    }
    if (it.flag === "SYMPTOM") {
      return (
        <View style={{ gap: 4 }}>
          <Text style={styles.label}>อาการ/สาเหตุ — แก้ข้อความ</Text>
          <TextInput
            style={[styles.input, styles.area, it.changed ? styles.inputOk : styles.inputMissing]}
            value={d.symptom}
            onChangeText={(v) => touchDraft(id, { symptom: v })}
            multiline
            placeholder="อาการที่เห็น และสาเหตุที่ช่างเจอ"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={`อาการ/สาเหตุ — แก้ข้อความ ${code}`}
          />
        </View>
      );
    }
    if (it.flag === "CHECKS") {
      const ticked = [...d.troubleshooting, ...env.check.checked];
      return (
        <View style={{ gap: 4 }}>
          {env.check.errorCode && env.guide ? (
            <>
              <Text style={styles.group}>เช็คตาม Error {env.check.errorCode} (คู่มือ Error in Field) — ติ๊กข้อที่ทำ</Text>
              <ErrorCheckList
                guide={env.guide}
                check={env.check}
                onCheck={(next) => {
                  env.onTouch();
                  env.setCheck(next);
                }}
              />
            </>
          ) : null}
          {env.troubleshooting.length ? (
            <Text style={styles.group}>Troubleshooting {env.brand} (ต้องทำครบ · พิมพ์ลงใบเคลมที่ส่งผู้ขาย)</Text>
          ) : null}
          {env.troubleshooting.map((t) => {
            const on = d.troubleshooting.includes(t);
            return (
              <TouchableOpacity
                key={t}
                style={styles.tick}
                onPress={() => touchDraft(id, { troubleshooting: on ? d.troubleshooting.filter((x) => x !== t) : [...d.troubleshooting, t] })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                // เว็บไม่แปลง accessibilityState เป็น aria-checked — ใส่เอง (ดู Tick ใน RejectPanel)
                aria-checked={on}
                accessibilityLabel={`แก้ ${t} ${code}`}
              >
                <Ionicons name={on ? "checkbox" : "square-outline"} size={18} color={on ? colors.primary : colors.textFaint} />
                <Text style={styles.tickText}>{t}</Text>
              </TouchableOpacity>
            );
          })}
          <View style={styles.noteHead}>
            <Text style={[styles.label, { flex: 1 }]}>เขียนเพิ่ม (พิมพ์ลงใบเคลมที่ส่งผู้ขาย)</Text>
            {/* ใส่แค่ข้อความตั้งต้นจากข้อที่ติ๊กจริง ช่างพิมพ์ค่าที่วัดได้ต่อเอง (ตัวอย่าง fillNoteFromTicks) */}
            {ticked.length && !d.checkNote.includes("เช็คแล้ว:") ? (
              <TouchableOpacity
                style={styles.fillBtn}
                onPress={() => {
                  const head = `เช็คแล้ว: ${ticked.join(" · ")}`;
                  touchDraft(id, { checkNote: d.checkNote.trim() ? `${head} — ${d.checkNote.trim()}` : head });
                }}
              >
                <Text style={styles.fillText}>เติมจากข้อที่ติ๊ก</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <TextInput
            style={[styles.input, styles.area, it.changed ? styles.inputOk : styles.inputMissing]}
            value={d.checkNote}
            onChangeText={(v) => touchDraft(id, { checkNote: v })}
            multiline
            placeholder="เช่น วัดไฟเข้าบอร์ด 220V ปกติ แต่ไฟออกขาโซลินอยด์ 0V"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={`ช่างเข้าเช็คอะไรบ้าง — แก้ข้อความ ${code}`}
          />
        </View>
      );
    }
    return null;
  }

  // ── ช่องของเครื่อง ──
  if (it.flag === "ERROR_CODE" && env.guide?.errors.length) {
    return (
      <View style={{ gap: 4 }}>
        <Text style={styles.label}>Error ที่เครื่องขึ้น — เลือกใหม่</Text>
        <Dropdown
          value={env.check.errorCode}
          options={env.guide.errors.map((e) => ({ value: e.code, label: `${e.code} · ${e.name}` }))}
          onChange={(v) => {
            env.onTouch();
            // Error เปลี่ยน ข้อเช็คของ Error เดิมไม่ใช่ของ Error ใหม่ — ล้างให้ติ๊กใหม่ (แบบเดียวกับกล่องข้อมูลเครื่อง)
            env.setCheck({ errorCode: v, checked: [] });
          }}
          placeholder="เลือก Error"
          accessibilityLabel="Error ที่เครื่องขึ้น — เลือกใหม่"
        />
      </View>
    );
  }
  if (it.flag === "MODEL" || it.flag === "SERIAL" || it.flag === "PLATE_OTHER") {
    const fields = plateFields(env.guide?.plate).filter((f) =>
      it.flag === "MODEL" ? f.key === "model" : it.flag === "SERIAL" ? f.key === "serial" : !f.model
    );
    return (
      <View style={{ gap: 6 }}>
        {fields.map((f) => {
          const crop = (it.row.nameplate?.fields ?? []).find((x) => x.key === f.key)?.crop ?? null;
          const v = env.plate.values[f.key];
          return (
            <View key={f.key} style={{ gap: 4 }}>
              <Text style={styles.label}>{f.label} — แก้ให้ตรงกับรูปป้าย</Text>
              {crop ? <ClaimCrop uri={crop} label={f.label} /> : null}
              {f.model && v?.value ? (
                <Text style={styles.modelValue} accessibilityLabel={`รุ่นที่จะส่ง ${v.value}`}>
                  {v.value}
                </Text>
              ) : null}
              <TextInput
                style={[styles.input, styles.mono, it.changed ? styles.inputOk : styles.inputMissing]}
                value={v?.value ?? ""}
                onChangeText={(t) => {
                  env.onTouch();
                  // พิมพ์เองแล้วไม่ใช่ค่าที่ระบบอ่าน — ภาพตัดเดิมไม่ตรงกับค่าแล้ว (กติกาเดียวกับกล่องข้อมูลเครื่อง)
                  env.setPlate({ ...env.plate, values: { ...env.plate.values, [f.key]: { value: t.toUpperCase(), source: "HAND", crop: null } } });
                }}
                autoCapitalize="characters"
                placeholder={`พิมพ์${f.label}จากป้าย`}
                placeholderTextColor={colors.textFaint}
                accessibilityLabel={`${f.label} — แก้ค่า`}
              />
            </View>
          );
        })}
        <TouchableOpacity style={styles.rescan} onPress={env.onRescan} accessibilityLabel="ถ่ายรูปป้ายรุ่นใหม่ ให้ระบบอ่าน">
          <Ionicons name="camera-outline" size={16} color={colors.primaryInk} />
          <Text style={styles.rescanText}>ถ่ายรูปป้ายรุ่นใหม่ — ระบบอ่านให้</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm, marginBottom: spacing.sm },
  heading: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.text },
  item: { borderWidth: 2, borderRadius: radius.md, padding: spacing.md, gap: 8, backgroundColor: colors.card },
  itemTodo: { borderColor: colors.danger },
  itemDone: { borderColor: colors.success },
  itemHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  itemTitle: { flexShrink: 1, fontSize: 14.5, lineHeight: 21, fontWeight: "800" },
  siteTag: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.dangerInk,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  oldRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  oldThumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.rowAlt },
  oldBlank: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  // ไฟล์เดิมจาง — ยังเห็นว่าเป็นไฟล์ไหน แต่ไม่ดูเหมือนหลักฐานที่จะส่ง
  oldDim: { opacity: 0.45 },
  oldText: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 18, color: colors.body },
  label: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.text },
  group: { fontSize: 12.5, lineHeight: 18, fontWeight: "700", color: colors.navy, marginTop: 2 },
  hint: { fontSize: 12.5, lineHeight: 18, fontWeight: "700" },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
  },
  area: { minHeight: 72, textAlignVertical: "top" },
  mono: { fontFamily: "monospace", fontWeight: "700", letterSpacing: 1 },
  inputMissing: { borderColor: colors.danger, borderWidth: 2 },
  inputOk: { borderColor: colors.success, borderWidth: 2 },
  modelValue: { fontSize: 20, lineHeight: 30, fontWeight: "800", letterSpacing: 2, fontFamily: "monospace", color: colors.text },
  tick: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  tickText: { flex: 1, minWidth: 0, fontSize: 13.5, color: colors.text },
  noteHead: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  fillBtn: { minHeight: 40, justifyContent: "center", paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.navyFill },
  fillText: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
  keepBtn: {
    alignSelf: "flex-start",
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.navyFill,
    backgroundColor: colors.card,
  },
  keepBtnText: { fontSize: 14, fontWeight: "700", color: colors.primaryInk },
  undo: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  undoText: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
  status: { fontSize: 13.5, lineHeight: 20, fontWeight: "700" },
  rescan: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 44, paddingHorizontal: 4 },
  rescanText: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
});
