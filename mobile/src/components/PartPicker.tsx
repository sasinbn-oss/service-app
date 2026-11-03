/**
 * เลือกอะไหล่จากรายการในระบบ
 *
 * ใช้หลายที่ที่ความหมายต่างกัน — บนกระดานคือ "อะไหล่ที่รออยู่" ตอนปิดใบงานคือ
 * "อะไหล่ที่ใช้ไปจริง" จึงรับ label เข้ามา แต่วิธีค้นและวิธีนับจำนวนเหมือนกัน
 *
 * ใบที่มีเครื่อง = ล็อกตามไฟล์ยี่ห้อ (เจ้าของงาน ต.ค. 69: "เครื่อง Huebsch ก็สามารถเลือกอะไหล่ของเครื่อง Huebsch ได้เท่านั้น")
 * ค้นจาก /spare-parts/for-brand ซึ่งส่งมาสองกลุ่ม: ไฟล์ของเครื่อง แล้ว "ของใช้ร่วม (ไฟล์ Other)" ที่ทุกเครื่องเลือกได้ (R4)
 * เครื่องที่ยังไม่รู้ยี่ห้อต้องกดยี่ห้อก่อน ช่องค้นถึงจะขึ้น — ไม่มีทาง "ค้นทุกไฟล์ไปก่อน" (ข้อ 17: เดาผิดคือของผิดยี่ห้อไปถึงร้าน)
 * ใบที่ไม่มีเครื่อง (งานทั้งสาขา) ค้นทุกไฟล์จาก /spare-parts เหมือนเดิม — ที่เดียวที่ไม่ล็อก (ข้อ 22)
 * เซิร์ฟเวอร์ตรวจซ้ำทุกเส้นทาง (brandProblem) — ป้ายและการกันปุ่มที่นี่มีไว้ให้รู้ก่อนกด ไม่ใช่ตัวกันจริง
 */
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import TouchableOpacity from "./Tap";
import QtyInput from "./QtyInput";
import Spinner from "./Spinner";
import BrandChips, { isListedBrand } from "./BrandChips";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api } from "../api/client";
import { colors, radius, spacing } from "../theme";
import { brandFileOf, fileAllows, shortThaiDate, SHARED_FILE, type PartsBrand } from "../utils/brandFile";

export type { PartsBrand } from "../utils/brandFile";

export interface PickedPart {
  sparePartId: number;
  partCode: string;
  name: string;
  brand: string | null;
  quantity: number;
  /** อะไหล่นอกสโตร์ (ไม่มี SKU) — ไม่ได้เลือกจากที่นี่ ใช้ OffPartEditor แต่มากับแถวจากเซิร์ฟเวอร์ */
  offCatalog?: boolean;
  unit?: string | null;
  note?: string | null;
  /**
   * ไฟล์ยี่ห้อที่อะไหล่อยู่ ([] = ไม่อยู่ในไฟล์ไหน) — มากับแถวจากเซิร์ฟเวอร์และผลค้นตามยี่ห้อ
   * ไม่มีค่า (แถวจากเซิร์ฟเวอร์รุ่นก่อน) = ไม่ติดป้าย ปล่อยให้เซิร์ฟเวอร์ตัดสิน ดีกว่าติดป้ายแดงผิด
   */
  brandFiles?: string[];
  /** เบิกแล้ว (มีของ + เลขใบเบิก) — ของอยู่กับช่างแล้ว ติดป้าย "เบิกแล้ว · ใบเบิก …" */
  issued?: boolean;
  requisitionNo?: string | null;
  partNo?: string | null;
}

/** ป้ายใต้ชื่ออะไหล่ — danger แดง (ต้องเอาออก) · warn เหลือง · success เขียว · info ฟ้า · muted เทา (แค่บอก) */
export interface PartTag {
  text: string;
  tone: "danger" | "warn" | "success" | "info" | "muted";
}

interface SparePartOption {
  id: number;
  partCode: string;
  name: string;
  brand: string | null;
  partNo?: string | null;
  brandFiles?: string[];
}

/** คำตอบ GET /spare-parts/for-brand — rows = ไฟล์ของเครื่อง · shared = ของใช้ร่วม (Other) ที่ไม่อยู่ในไฟล์ของเครื่อง */
interface ForBrand {
  file: string;
  updatedAt: string | null;
  rows: SparePartOption[];
  shared: SparePartOption[];
  elsewhere: { file: string; exact: boolean }[];
}

/** ใบนี้ล็อกตามยี่ห้อเครื่องไหม — มีเครื่อง = ล็อก (ไม่รู้ยี่ห้อก็ล็อก ต้องกดยี่ห้อก่อน) */
const lockedByBrand = (brand: PartsBrand | null | undefined): boolean => !!brand?.machine;

/**
 * ไฟล์ที่ใช้ตัดสินตอนนี้ — ยี่ห้อที่เครื่องรู้แล้วชนะเสมอ (ยี่ห้อที่รู้แล้วเปลี่ยนจากฟอร์มไม่ได้ ข้อ 17)
 * ไม่รู้ยี่ห้อ = ไฟล์ของปุ่มที่เพิ่งกด · ยังไม่ได้กด = null
 */
export function effectiveFile(brand: PartsBrand | null | undefined, chosen: string | null | undefined): string | null {
  if (!brand?.machine) return null;
  return brand.file ?? brandFileOf(chosen);
}

/**
 * ยี่ห้อที่ต้องส่งไปกับคำขอ (machineBrand) — เฉพาะเครื่องที่ยังไม่รู้ยี่ห้อและกดปุ่มแล้ว
 * เครื่องที่รู้ยี่ห้อแล้วไม่ส่ง: เซิร์ฟเวอร์ไม่รับยี่ห้ออื่นของเครื่องที่รู้แล้ว (400) และไม่มีอะไรให้บันทึก
 */
export function machineBrandToSend(brand: PartsBrand | null | undefined, chosen: string | null | undefined): string | null {
  if (!brand?.machine || brand.file) return null;
  return chosen?.trim() || null;
}

type RowState = { kind: "ok" } | { kind: "legacy"; text: string } | { kind: "remove"; text: string } | { kind: "needsBrand" };

/**
 * สถานะของแถวหนึ่งในรายการ เทียบกับไฟล์ของเครื่อง — กติกาเดียวกับ brandProblem ฝั่งเซิร์ฟเวอร์ (§4.0)
 * legacy = แถวที่อยู่ในใบแล้วและเส้นทางนี้ปล่อยผ่าน (ของที่ใช้/เบิกไปจริง) — ป้ายเทาบอกเฉย ๆ ไม่ต้องเอาออก
 */
function rowState(
  p: PickedPart,
  file: string | null,
  opts: { legacyIds?: ReadonlySet<number>; strict?: boolean; verb: string }
): RowState {
  if (p.offCatalog) {
    return opts.strict
      ? { kind: "remove", text: `อะไหล่นอกสโตร์ใส่ตอนตรวจหน้างานไม่ได้ — เอาออกก่อน${opts.verb}` }
      : { kind: "ok" };
  }
  const legacy = !!opts.legacyIds?.has(p.sparePartId);
  if (!file) return legacy ? { kind: "ok" } : { kind: "needsBrand" };
  if (!p.brandFiles) return { kind: "ok" };
  if (p.brandFiles.length === 0) {
    return legacy
      ? { kind: "legacy", text: "ยังไม่อยู่ในไฟล์ยี่ห้อไหน" }
      : { kind: "remove", text: `ยังไม่อยู่ในไฟล์ยี่ห้อไหน — เอาออกก่อน${opts.verb}` };
  }
  if (fileAllows(file, p.brandFiles)) return { kind: "ok" };
  return legacy
    ? { kind: "legacy", text: `ไม่อยู่ในไฟล์ ${file}` }
    : { kind: "remove", text: `ไม่อยู่ในไฟล์ ${file} — เอาออกก่อน${opts.verb}` };
}

/**
 * สิ่งที่ยังกันการส่งของช่องนี้ — ฟอร์มที่ใช้ช่องนี้เอาไปกันปุ่ม/ใส่ในรายการ "ยังขาด" ด้วยกติกาเดียวกับป้ายบนจอ
 * remove = แถวที่ต้องเอาออก (ป้ายแดง) · needsBrand = มีแถวที่ต้องรู้ยี่ห้อก่อนแต่ยังไม่ได้กดยี่ห้อเครื่อง
 */
export function brandBlockers(
  parts: PickedPart[],
  brand: PartsBrand | null | undefined,
  chosen: string | null | undefined,
  opts: { legacyIds?: ReadonlySet<number>; strict?: boolean } = {}
): { remove: PickedPart[]; needsBrand: boolean } {
  if (!lockedByBrand(brand)) return { remove: [], needsBrand: false };
  const file = effectiveFile(brand, chosen);
  const states = parts.map((p) => [p, rowState(p, file, { ...opts, verb: "ส่ง" })] as const);
  return {
    remove: states.filter(([, s]) => s.kind === "remove").map(([p]) => p),
    needsBrand: states.some(([, s]) => s.kind === "needsBrand"),
  };
}

/** ข้อความเดียวของสิ่งที่กันการส่ง (ใต้ปุ่ม / ในรายการยังขาด) — null = ส่งได้ */
export function brandBlockText(
  b: { remove: PickedPart[]; needsBrand: boolean },
  brand: PartsBrand | null | undefined,
  verb = "ส่ง"
): string | null {
  if (b.remove.length) return `เอา ${b.remove.map((p) => p.partCode).join(", ")} ออกก่อน${verb} — อยู่นอกไฟล์ที่เครื่องนี้เลือกได้`;
  // เว้นวรรคหลังรหัสเครื่อง — ติดกัน "W5ก่อน" อ่านเป็นคำเดียว (ข้อความอื่นในแอปเว้นหลังรหัสทุกที่)
  if (b.needsBrand) return `เลือกยี่ห้อเครื่อง${brand?.machineCode ? ` ${brand.machineCode}` : ""} ก่อน`;
  return null;
}

const TAG_COLORS: Record<PartTag["tone"], { fg: string; bg: string }> = {
  // dangerFill ไม่ใช่ dangerInk — โหมดมืด dangerInk เป็นชมพูอ่อน ตัวขาวบนนั้นอ่านไม่ออก ทั้งที่ป้ายนี้บอกว่าแถวไหนกันปุ่มส่ง
  danger: { fg: "#FFFFFF", bg: colors.dangerFill },
  warn: { fg: colors.warningInk, bg: colors.warningSoft },
  success: { fg: colors.successInk, bg: colors.successSoft },
  info: { fg: colors.primaryInk, bg: colors.primarySoft },
  muted: { fg: colors.textMuted, bg: colors.background },
};

export default function PartPicker({
  parts,
  onChange,
  label = "อะไหล่ที่รอ",
  locked,
  brand,
  chosenBrand = null,
  onBrandChosen,
  legacyIds,
  strict,
  tags,
  verb = "ส่ง",
  saveWhen = "ตอนบันทึก",
  noResultHints,
  noMachineText,
}: {
  parts: PickedPart[];
  onChange: (next: PickedPart[]) => void;
  /** null = ไม่มีหัวช่อง (ฟอร์มที่มีหัวข้อของตัวเองอยู่แล้ว เช่น ข้อ 5 ของฟอร์มตรวจหน้างาน) */
  label?: string | null;
  /**
   * ชิ้นที่เอาออกไม่ได้ (sparePartId → เหตุผล) — ฟอร์มปิดงาน: เคลมของชิ้นนั้นผ่าน/ปิดไปแล้ว (เคลมก้อน 3)
   * กดเอาออกแล้วบอกเหตุผลใต้แถว แทนการลบเงียบ ๆ แล้วไปโดนเซิร์ฟเวอร์ปฏิเสธตอนส่ง
   */
  locked?: Record<number, string>;
  /** ยี่ห้อเครื่องของใบ (order.partsBrand · แถวกระดาน) — ไม่ส่ง/ไม่มีเครื่อง = ค้นทุกไฟล์แบบเดิม */
  brand?: PartsBrand | null;
  /** ยี่ห้อที่กดปุ่มไว้ (เครื่องที่ยังไม่รู้ยี่ห้อ) — ฟอร์มเป็นคนถือค่าเพราะต้องส่งเป็น machineBrand */
  chosenBrand?: string | null;
  onBrandChosen?: (brand: string | null) => void;
  /** แถวที่อยู่ในใบแล้วที่เส้นทางนี้ปล่อยผ่านแม้อยู่นอกไฟล์ (ของที่ใช้/เบิกไปจริง — ค่าตั้งต้น D6) */
  legacyIds?: ReadonlySet<number>;
  /** ช่องของช่างตอนตรวจ/เปิดใบ — ของนอกสโตร์ก็ต้องเอาออก (ข้อ 21) */
  strict?: boolean;
  /** ป้ายเพิ่มจากฟอร์ม (เช่น ตีกลับ/เพิ่มใหม่ ในฟอร์มตรวจ) */
  tags?: Record<number, PartTag>;
  /** คำในป้ายแดง "เอาออกก่อน{verb}" — กระดานเครื่องดับใช้ "บันทึก" */
  verb?: string;
  /** "จะบันทึกยี่ห้อ … ให้เครื่อง … {saveWhen}" — บอกว่ายี่ห้อถูกจำตอนกดปุ่มไหน */
  saveWhen?: string;
  /** บรรทัดใต้ "ไม่พบ …" ของช่องนี้ (ทางออกที่ฟอร์มนี้มีจริง) — ไม่ส่ง = ทางออกทั่วไป */
  noResultHints?: string[];
  /** ช่องของช่างบนใบที่ไม่มีเครื่อง — เลือกไม่ได้ บอกเหตุผลแทนช่องค้น */
  noMachineText?: string;
}) {
  const brandMode = lockedByBrand(brand);
  const knownFile = brandMode ? brand!.file : null;
  const file = effectiveFile(brand, chosenBrand);
  // ข้อความที่ส่งไปค้น — ยี่ห้อที่เครื่องรู้ หรือปุ่มที่กด (เซิร์ฟเวอร์แปลงเป็นไฟล์ด้วย brandFileOf ตัวเดียวกัน)
  const make = brandMode ? (knownFile ? brand!.make : chosenBrand?.trim() || null) : null;
  const code = brandMode ? brand!.machineCode ?? "" : "";

  const [term, setTerm] = useState("");
  const [refused, setRefused] = useState<number | null>(null);
  const [results, setResults] = useState<SparePartOption[]>([]);
  const [shared, setShared] = useState<SparePartOption[]>([]);
  const [elsewhere, setElsewhere] = useState<ForBrand["elsewhere"]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [head, setHead] = useState<{ make: string; file: string; updatedAt: string | null } | null>(null);
  const seq = useRef(0);

  /**
   * หัวช่อง "อะไหล่จากไฟล์ X · อัปเดต {วันที่}" — ถามครั้งเดียวต่อยี่ห้อ (ไม่มีคำค้น = เซิร์ฟเวอร์ตอบวันอัปโหลดไฟล์นั้นล่าสุด)
   * หน่วงนิดหนึ่ง: ยี่ห้อที่พิมพ์เองใน "อื่นๆ" เปลี่ยนทุกตัวอักษร ไม่ต้องถามทุกตัว
   */
  useEffect(() => {
    if (!make) {
      setHead(null);
      return;
    }
    let gone = false;
    const timer = setTimeout(() => {
      api
        .get<ForBrand>("/spare-parts/for-brand", { params: { brand: make }, loadingText: false })
        .then((res) => !gone && setHead({ make, file: res.data.file, updatedAt: res.data.updatedAt }))
        .catch(() => !gone && setHead(null));
    }, 250);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [make]);

  // หน่วงไว้ก่อนยิง ไม่งั้นพิมพ์รหัสเดียวยิงไปสิบครั้ง · เปลี่ยนยี่ห้อ = ผลเดิมใช้ไม่ได้แล้ว ล้างทิ้ง
  useEffect(() => {
    const keyword = term.trim();
    const mine = ++seq.current;
    if (!keyword || (brandMode && !make)) {
      setResults([]);
      setShared([]);
      setElsewhere([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      const done = () => {
        if (mine !== seq.current) return;
        setSearching(false);
        setSearched(true);
      };
      if (brandMode) {
        api
          .get<ForBrand>("/spare-parts/for-brand", { params: { brand: make, search: keyword } })
          .then((res) => {
            if (mine !== seq.current) return;
            setResults(res.data.rows);
            setShared(res.data.shared);
            setElsewhere(res.data.elsewhere);
          })
          .catch(() => {
            if (mine !== seq.current) return;
            setResults([]);
            setShared([]);
            setElsewhere([]);
          })
          .finally(done);
      } else {
        api
          .get<SparePartOption[]>("/spare-parts", { params: { search: keyword } })
          .then((res) => mine === seq.current && setResults(res.data.slice(0, 8)))
          .catch(() => mine === seq.current && setResults([]))
          .finally(done);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [term, make, brandMode]);

  function add(option: SparePartOption) {
    setTerm("");
    const existing = parts.find((p) => p.sparePartId === option.id);
    if (existing) {
      // ใบที่ล็อกยี่ห้อ: แถวผลค้นขึ้น "เลือกแล้ว" — กดซ้ำแค่ปิดผลค้น (ตามตัวอย่าง) จำนวนแก้ที่ช่องจำนวน
      // ใบไม่มีเครื่องคงแบบเดิม: เลือกตัวที่มีอยู่แล้วให้บวกจำนวน ไม่ใช่เพิ่มแถวซ้ำ
      if (!brandMode) {
        onChange(parts.map((p) => (p.sparePartId === option.id ? { ...p, quantity: p.quantity + 1 } : p)));
      }
      return;
    }
    onChange([
      ...parts,
      {
        sparePartId: option.id,
        partCode: option.partCode,
        name: option.name,
        brand: option.brand,
        quantity: 1,
        partNo: option.partNo ?? null,
        ...(option.brandFiles ? { brandFiles: option.brandFiles } : {}),
      },
    ]);
  }

  function setQuantity(sparePartId: number, value: number) {
    onChange(parts.map((p) => (p.sparePartId === sparePartId ? { ...p, quantity: value } : p)));
  }

  const shownFile = head && head.make === make ? head.file : file;
  const updated = head && head.make === make && head.updatedAt ? shortThaiDate(head.updatedAt) : "";

  function tagsOf(p: PickedPart): PartTag[] {
    const out: PartTag[] = [];
    if (brandMode) {
      const s = rowState(p, file, { legacyIds, strict, verb });
      if (s.kind === "remove") out.push({ text: s.text, tone: "danger" });
      else if (s.kind === "legacy") out.push({ text: s.text, tone: "muted" });
      else if (s.kind === "needsBrand") out.push({ text: "เลือกยี่ห้อเครื่องก่อน", tone: "warn" });
    }
    if (p.issued) out.push({ text: `เบิกแล้ว${p.requisitionNo ? ` · ใบเบิก ${p.requisitionNo}` : ""}`, tone: "info" });
    const extra = tags?.[p.sparePartId];
    if (extra) out.push(extra);
    return out;
  }

  const pickedList =
    parts.length > 0 ? (
      <View style={styles.pickedList}>
        {parts.map((part) => {
          const rowTags = tagsOf(part);
          const red = rowTags.some((t) => t.tone === "danger");
          return (
            <View key={part.sparePartId}>
              <View style={[styles.picked, red && styles.pickedRed]}>
                <View style={styles.pickedText}>
                  <Text style={styles.pickedCode}>{part.partCode}</Text>
                  <Text style={styles.pickedName}>{part.name}</Text>
                  {part.partNo ? <Text style={styles.pickedName}>Part No. {part.partNo}</Text> : null}
                  {rowTags.length ? (
                    <View style={styles.tagRow}>
                      {rowTags.map((t) => (
                        <Text
                          key={t.text}
                          style={[styles.tag, { color: TAG_COLORS[t.tone].fg, backgroundColor: TAG_COLORS[t.tone].bg }]}
                        >
                          {t.text}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
                <QtyInput
                  value={part.quantity}
                  onChange={(n) => setQuantity(part.sparePartId, n)}
                  accessibilityLabel={`จำนวน ${part.partCode}`}
                />
                <Text style={styles.qtyUnit}>ตัว</Text>
                <TouchableOpacity
                  onPress={() =>
                    locked?.[part.sparePartId]
                      ? setRefused(part.sparePartId)
                      : onChange(parts.filter((p) => p.sparePartId !== part.sparePartId))
                  }
                  accessibilityLabel={`เอา ${part.partCode} ออก`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={locked?.[part.sparePartId] ? "lock-closed" : "close-circle"}
                    size={locked?.[part.sparePartId] ? 17 : 20}
                    color={red ? colors.dangerInk : colors.textFaint}
                  />
                </TouchableOpacity>
              </View>
              {refused === part.sparePartId && locked?.[part.sparePartId] ? (
                <Text style={styles.refused} accessibilityRole="alert">
                  {locked[part.sparePartId]}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    ) : null;

  // ── ใบไม่มีเครื่อง: แบบเดิม (ค้นทุกไฟล์) — ยกเว้นช่องของช่างซึ่งเลือกไม่ได้เลย (ข้อ 22) ──
  if (!brandMode) {
    if (strict && brand && !brand.machine) {
      return (
        <View style={styles.picker}>
          {label ? <Text style={styles.label}>{label}</Text> : null}
          {pickedList}
          <View style={styles.lockBox}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
            <Text style={[styles.lockText, { flex: 1 }]}>
              {noMachineText ?? "ใบงานนี้ไม่ได้ระบุเครื่อง — เลือกอะไหล่ไม่ได้ หัวหน้าภาคระบุอะไหล่แทน"}
            </Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.picker}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        {pickedList}
        <View style={styles.pickerSearch}>
          <Ionicons name="search" size={15} color={colors.textFaint} />
          <TextInput
            style={styles.pickerInput}
            value={term}
            onChangeText={setTerm}
            placeholder="ค้นหารหัส ชื่อ หรือ Part No."
            placeholderTextColor={colors.textFaint}
          />
          {searching ? <Spinner size="small" color={colors.textFaint} /> : null}
        </View>
        {results.length > 0 ? (
          <View style={styles.pickerResults}>
            {results.map((option) => (
              <TouchableOpacity key={option.id} style={styles.pickerResult} onPress={() => add(option)} activeOpacity={0.7}>
                <Text style={styles.pickedCode}>{option.partCode}</Text>
                <Text style={styles.pickerResultName} numberOfLines={1}>
                  {option.name}
                  {/* ช่างมักค้นด้วยเลขบนชิ้นส่วนจริง — โชว์ให้เห็นว่าเจอเพราะ Part No. */}
                  {option.partNo ? ` · ${option.partNo}` : ""}
                </Text>
                <Ionicons name="add-circle-outline" size={17} color={colors.primary} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {searched && !searching && results.length === 0 ? (
          <Text style={styles.hint}>
            ไม่พบอะไหล่ที่ตรงกับ “{term.trim()}” — เพิ่มรายการใหม่ได้ที่เมนูรายการอะไหล่ (แอดมิน)
          </Text>
        ) : null}
      </View>
    );
  }

  // ── ใบที่มีเครื่อง: ล็อกตามไฟล์ยี่ห้อ ──
  const askBrand = !knownFile;
  const chipsBlock = askBrand ? (
    <View style={styles.askBox}>
      {!file ? (
        <View style={styles.lockRow}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.lockTitle}>เลือกยี่ห้อเครื่องก่อน</Text>
            <Text style={styles.lockText}>
              ระบบใช้ยี่ห้อนี้หาไฟล์อะไหล่ และจำไว้กับเครื่อง {code} — ครั้งหน้าไม่ต้องเลือกอีก
            </Text>
          </View>
        </View>
      ) : null}
      <BrandChips value={chosenBrand} onChange={(b) => onBrandChosen?.(b)} machineCode={code} />
      {file && make ? (
        <Text style={styles.willSave}>
          {isListedBrand(make)
            ? `จะบันทึกยี่ห้อ ${make} ให้เครื่อง ${code} ${saveWhen}`
            : `จะบันทึกยี่ห้อที่พิมพ์ให้เครื่อง ${code} ${saveWhen}`}
        </Text>
      ) : null}
    </View>
  ) : null;

  if (!file || !make) {
    return (
      <View style={styles.picker}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        {chipsBlock}
        {pickedList}
      </View>
    );
  }

  const ownFile = shownFile ?? file;
  const otherOnly = ownFile === SHARED_FILE;
  const sameName = make.trim().toLowerCase() === ownFile.toLowerCase();
  const ruleLine = otherOnly
    ? `เครื่อง ${code} ยี่ห้อ ${make} ไม่มีไฟล์ยี่ห้อของตัวเอง — เลือกได้เฉพาะของใช้ร่วม (ไฟล์ Other)`
    : `เครื่อง ${code} ยี่ห้อ ${make}${sameName ? "" : ` ใช้ไฟล์ ${ownFile}`} — เลือกได้เฉพาะอะไหล่ในไฟล์นี้`;
  const files = elsewhere.map((e) => e.file);
  const exact = elsewhere.some((e) => e.exact);
  const noResultTitle =
    `ไม่พบ “${term.trim()}” ในไฟล์ ${ownFile}` +
    (files.length ? (exact ? ` — รหัสนี้อยู่ในไฟล์ ${files.join(", ")}` : ` — มีในไฟล์ ${files.join(", ")} เท่านั้น`) : "");
  const hints = noResultHints ?? [
    "ยี่ห้อในระบบไม่ตรงกับเครื่องจริง? หัวหน้าภาคหรือแอดมินแก้ยี่ห้อเครื่องได้ที่หน้าใบงาน (แก้ยี่ห้อเครื่อง)",
  ];

  const resultRow = (option: SparePartOption, i: number) => {
    const already = parts.some((p) => p.sparePartId === option.id);
    return (
      <TouchableOpacity
        key={option.id}
        style={[styles.brandResult, i > 0 && styles.brandResultLine]}
        onPress={() => add(option)}
        activeOpacity={0.7}
        accessibilityLabel={already ? `${option.partCode} เลือกแล้ว` : `เพิ่ม ${option.partCode} ${option.name}`}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* รหัสสินค้านำหน้า — ช่างค้น/เบิก/เคลมด้วยรหัสสินค้า (เจ้าของงาน 31 ต.ค. 69) */}
          <Text style={styles.resultMain}>
            <Text style={styles.resultCode}>{option.partCode}</Text> {option.name}
          </Text>
          {option.partNo ? <Text style={styles.resultSub}>Part No. {option.partNo}</Text> : null}
        </View>
        {already ? (
          <Text style={styles.pickedBadge}>เลือกแล้ว</Text>
        ) : (
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.picker}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {chipsBlock}
      <View style={styles.fileHead}>
        <Ionicons name="document-text-outline" size={20} color={colors.primaryInk} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.fileHeadTitle}>
            อะไหล่จากไฟล์ {ownFile}
            {updated ? ` · อัปเดต ${updated}` : ""}
          </Text>
          <Text style={styles.fileHeadLine}>{ruleLine}</Text>
        </View>
      </View>
      {pickedList}
      <View style={styles.pickerSearch}>
        <Ionicons name="search" size={15} color={colors.textFaint} />
        <TextInput
          style={styles.pickerInput}
          value={term}
          onChangeText={setTerm}
          placeholder={`ค้นหาในไฟล์ ${ownFile}`}
          placeholderTextColor={colors.textFaint}
          accessibilityLabel={`ค้นหารหัสสินค้า ชื่อ หรือ Part No. ในไฟล์ ${ownFile}`}
        />
        {searching ? <Spinner size="small" color={colors.textFaint} /> : null}
      </View>

      {results.length > 0 || shared.length > 0 ? (
        <View style={styles.pickerResults}>
          {results.map(resultRow)}
          {/* กลุ่มที่สอง: ของใช้ร่วม (ไฟล์ Other) — ทุกเครื่องเลือกได้ (R4) แยกหัวให้เห็นว่าไม่ใช่ไฟล์ของเครื่อง */}
          {shared.length > 0 ? (
            <>
              <Text style={[styles.groupHead, results.length > 0 && styles.brandResultLine]}>ของใช้ร่วม (ไฟล์ Other)</Text>
              {shared.map((o, i) => resultRow(o, i))}
            </>
          ) : null}
        </View>
      ) : null}

      {searched && !searching && results.length === 0 && shared.length === 0 ? (
        <View style={styles.noResult} accessibilityLiveRegion="polite">
          <Text style={styles.noResultTitle}>{noResultTitle}</Text>
          <Text style={styles.noResultLine}>
            เครื่องนี้ ({code} · {make}) เลือกได้เฉพาะอะไหล่จากไฟล์ {ownFile}
            {otherOnly ? "" : " และของใช้ร่วม (ไฟล์ Other)"}
          </Text>
          {hints.map((h) => (
            <Text key={h} style={styles.noResultLine}>
              {h}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  refused: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.dangerInk, paddingHorizontal: 4, paddingTop: 2 },
  picker: { gap: spacing.xs },
  label: {
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  pickedList: { gap: spacing.xs },
  picked: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  // แถวที่ต้องเอาออก — กรอบแดงหนาให้เห็นจากไกล ๆ ว่าตัวไหนทำให้ส่งไม่ได้
  pickedRed: { borderColor: colors.dangerInk, borderWidth: 2, backgroundColor: colors.dangerSoft },
  pickedText: { flex: 1, minWidth: 0 },
  pickedCode: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  pickedName: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  tag: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  qtyUnit: { fontSize: 12, lineHeight: 20, color: colors.textFaint },
  pickerSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  pickerInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  pickerResults: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.card,
  },
  pickerResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerResultName: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.textMuted },
  hint: { fontSize: 11, lineHeight: 19, color: colors.textFaint, marginTop: spacing.xs },
  // แถวผลค้นตามยี่ห้อ — สูงพอให้นิ้วกดตอนยืนหน้าเครื่อง (ตัวอย่างใช้ 52)
  brandResult: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  brandResultLine: { borderTopWidth: 1, borderTopColor: colors.border },
  resultMain: { fontSize: 14, lineHeight: 20, color: colors.text },
  resultCode: { fontWeight: "700" },
  resultSub: { fontSize: 12, lineHeight: 17, color: colors.textMuted },
  pickedBadge: { fontSize: 12, fontWeight: "700", color: colors.successInk },
  groupHead: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: colors.textMuted,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  fileHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
  },
  fileHeadTitle: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.primaryInk },
  fileHeadLine: { fontSize: 12, lineHeight: 18, color: colors.navy },
  askBox: { gap: spacing.sm },
  lockRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  lockBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  lockTitle: { fontSize: 14, lineHeight: 21, fontWeight: "700", color: colors.text },
  lockText: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  willSave: { fontSize: 12, lineHeight: 18, fontWeight: "600", color: colors.successInk },
  noResult: {
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: 4,
  },
  noResultTitle: { fontSize: 14, lineHeight: 21, fontWeight: "700", color: colors.warningInk },
  noResultLine: { fontSize: 13, lineHeight: 20, color: colors.text },
});
