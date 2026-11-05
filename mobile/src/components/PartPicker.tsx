/**
 * เลือกอะไหล่จากรายการในระบบ
 *
 * ใช้หลายที่ที่ความหมายต่างกัน — บนกระดานคือ "อะไหล่ที่รออยู่" ตอนปิดใบงานคือ
 * "อะไหล่ที่ใช้ไปจริง" จึงรับ label เข้ามา แต่วิธีค้นและวิธีนับจำนวนเหมือนกัน
 *
 * ใบที่มีเครื่อง = ล็อกตามไฟล์ยี่ห้อ (เจ้าของงาน ต.ค. 69: "เครื่อง Huebsch ก็สามารถเลือกอะไหล่ของเครื่อง Huebsch ได้เท่านั้น")
 * ค้นจาก /spare-parts/for-brand ซึ่งส่งมาสามกลุ่ม: ไฟล์ของเครื่อง แล้ว "ของใช้ร่วม (ไฟล์ Other)" ที่ทุกเครื่องเลือกได้ (R4)
 * แล้วอะไหล่ในไฟล์ยี่ห้ออื่น — ใช้ได้เมื่อกดยืนยันทุกครั้ง (เจ้าของงานเลือก 3 พ.ย. 69 "แค่ให้ขึ้นเตือนว่าใช้อะไหล่ข้ามยี่ห้อ ให้กดยืนยัน")
 * ไม่จำอะไรไว้: ยืนยันแล้วแถวนั้นติด crossBrand ส่งไปเป็น crossBrandOk กับคำขอนั้นคำขอเดียว
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
import { showAlert } from "../utils/alert";
import { colors, radius, spacing } from "../theme";
import { brandFileOf, fileAllows, shortThaiDate, SHARED_FILE, type PartsBrand } from "../utils/brandFile";
import type { OffAnswerFields } from "../utils/offSource";

export type { PartsBrand } from "../utils/brandFile";

/** OffAnswerFields = คำตอบจัดหาของของนอกสโตร์ที่มากับแถวจากเซิร์ฟเวอร์ (หน้าใบงาน/ขั้นเช็คอะไหล่อ่าน) — ช่องนี้ไม่ได้แก้ */
export interface PickedPart extends OffAnswerFields {
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
  /**
   * true = กดยืนยัน "ใช้ข้ามยี่ห้อ" ตอนเลือกจากกลุ่มไฟล์ยี่ห้ออื่น — ส่งไปเป็น crossBrandOk (ดู crossBrandField)
   * false = เลือกจากกลุ่มของเครื่อง/ของใช้ร่วมในช่องนี้ ไม่เคยยืนยัน (เปลี่ยนชิปยี่ห้อทีหลังจนหลุดไฟล์ = แดง ต้องเอาออก)
   * ไม่มีค่า = แถวที่มาจากเซิร์ฟเวอร์ (อยู่ในใบ/รอบเลือก/กระดานอยู่แล้ว): นับว่ายืนยันแล้วเมื่อเครื่องรู้ยี่ห้อ — ถามใหม่ทุกครั้ง
   * ที่บันทึกฟอร์มเดิมซ้ำไม่มีประโยชน์ กติการายครั้งคือตอนเลือก (ดู crossConfirmed)
   */
  crossBrand?: boolean;
}

/** ป้ายใต้ชื่ออะไหล่ — danger แดง (ต้องเอาออก) · warn เหลือง · success เขียว · info ฟ้า · muted เทา (แค่บอก) · cross ส้ม (ข้ามยี่ห้อ ยืนยันแล้ว) */
export interface PartTag {
  text: string;
  tone: "danger" | "warn" | "success" | "info" | "muted" | "cross";
}

interface SparePartOption {
  id: number;
  partCode: string;
  name: string;
  brand: string | null;
  partNo?: string | null;
  brandFiles?: string[];
}

/**
 * คำตอบ GET /spare-parts/for-brand — rows = ไฟล์ของเครื่อง · shared = ของใช้ร่วม (Other) ที่ไม่อยู่ในไฟล์ของเครื่อง
 * others = ไฟล์ยี่ห้ออื่น (ใช้ได้เมื่อยืนยัน) — เซิร์ฟเวอร์รุ่นก่อนไม่ส่ง ถือว่าว่าง
 */
interface ForBrand {
  file: string;
  updatedAt: string | null;
  rows: SparePartOption[];
  shared: SparePartOption[];
  others?: SparePartOption[];
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

type RowState =
  | { kind: "ok" }
  | { kind: "legacy"; text: string }
  | { kind: "remove"; text: string }
  | { kind: "needsBrand" }
  | { kind: "cross" };

/**
 * แถวข้ามยี่ห้อนี้นับว่ายืนยันแล้วไหม — กดยืนยันในช่องนี้ (crossBrand true) หรือเป็นแถวที่มาจากเซิร์ฟเวอร์ (ไม่มีค่า)
 * บนเครื่องที่รู้ยี่ห้อ: ตอนนี้แถวนอกไฟล์จะไปอยู่ในใบได้ก็เพราะมีคนยืนยันไว้แล้ว ถามซ้ำทุกครั้งที่บันทึกฟอร์มเดิมแค่ทำให้รำคาญ
 * ไม่นับ: แถวที่เลือกในช่องนี้จากไฟล์ของเครื่อง (false) แล้วเปลี่ยนชิปยี่ห้อจนหลุดไฟล์ · เครื่องที่ยังไม่รู้ยี่ห้อ
 * — ไม่มีใครยืนยันว่าจะใช้ตัวนั้นข้ามยี่ห้อ
 */
function crossConfirmed(p: PickedPart, known: boolean): boolean {
  return p.crossBrand === true || (p.crossBrand === undefined && known);
}

/**
 * สถานะของแถวหนึ่งในรายการ เทียบกับไฟล์ของเครื่อง — กติกาเดียวกับ brandProblem ฝั่งเซิร์ฟเวอร์ (§4.0)
 * legacy = แถวที่อยู่ในใบแล้วและเส้นทางนี้ปล่อยผ่าน (ของที่ใช้/เบิกไปจริง) — ป้ายเทาบอกเฉย ๆ ไม่ต้องเอาออก
 * cross = อยู่ในไฟล์ยี่ห้ออื่นและยืนยันแล้ว — ส่งได้ (เซิร์ฟเวอร์ผ่านเพราะ crossBrandOk) · ไม่อยู่ในไฟล์ไหนยืนยันไม่ได้
 * known = ไฟล์ของเครื่องมาจากเซิร์ฟเวอร์ (ไม่ใช่ชิปที่เพิ่งกด)
 */
function rowState(
  p: PickedPart,
  file: string | null,
  opts: { legacyIds?: ReadonlySet<number>; strict?: boolean; verb: string; known: boolean }
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
  if (legacy) return { kind: "legacy", text: `ไม่อยู่ในไฟล์ ${file}` };
  if (crossConfirmed(p, opts.known)) return { kind: "cross" };
  return { kind: "remove", text: `ไม่อยู่ในไฟล์ ${file} — เอาออกก่อน${opts.verb}` };
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
  const states = parts.map((p) => [p, rowState(p, file, { ...opts, verb: "ส่ง", known: !!brand?.file })] as const);
  return {
    // แถวข้ามยี่ห้อที่ยืนยันแล้ว (cross) ไม่กันปุ่ม — ไปกับ crossBrandOk ของคำขอ
    remove: states.filter(([, s]) => s.kind === "remove").map(([p]) => p),
    needsBrand: states.some(([, s]) => s.kind === "needsBrand"),
  };
}

/**
 * id ของแถวข้ามยี่ห้อที่ยืนยันแล้ว — กติกาเดียวกับป้าย "ข้ามยี่ห้อ" บนจอ (rowState) ไม่ใช่แค่แถวที่มี crossBrand
 * แถวที่อยู่ในไฟล์ของเครื่อง/legacy ไม่อยู่ในนี้ (เซิร์ฟเวอร์ปล่อยผ่านอยู่แล้ว ใส่ไปก็แค่ทำให้ประวัติบอกผิดว่าข้ามยี่ห้อ)
 */
export function crossBrandOkOf(
  parts: PickedPart[],
  brand: PartsBrand | null | undefined,
  chosen: string | null | undefined,
  opts: { legacyIds?: ReadonlySet<number>; strict?: boolean } = {}
): number[] {
  if (!lockedByBrand(brand)) return [];
  const file = effectiveFile(brand, chosen);
  return parts
    .filter((p) => rowState(p, file, { ...opts, verb: "ส่ง", known: !!brand?.file }).kind === "cross")
    .map((p) => p.sparePartId);
}

/**
 * ช่อง crossBrandOk ของคำขอ — ทุกฟอร์มที่ส่งรายการอะไหล่กระจายตัวนี้ลงในคำขอ (ที่เดียว ไม่ใช่สิบสำเนา)
 * ไม่มีแถวข้ามยี่ห้อ = ไม่ส่งช่องนี้เลย คำขอเหมือนก่อนมีกติกานี้ทุกตัวอักษร
 */
export function crossBrandField(
  parts: PickedPart[],
  brand: PartsBrand | null | undefined,
  chosen: string | null | undefined,
  opts: { legacyIds?: ReadonlySet<number>; strict?: boolean } = {}
): { crossBrandOk?: number[] } {
  const ids = crossBrandOkOf(parts, brand, chosen, opts);
  return ids.length ? { crossBrandOk: ids } : {};
}

/** ข้อความในกล่องยืนยันข้ามยี่ห้อ — ใช้ร่วมกับจอคอนเฟิร์มของหัวหน้าภาค (ข้อความเดียวกันทุกที่ที่ถาม) */
export const CROSS_BRAND_TITLE = "ใช้อะไหล่ข้ามยี่ห้อ?";
export const CROSS_BRAND_OK = "ใช้ข้ามยี่ห้อ";
export function crossBrandMessage(
  parts: { partCode: string; name: string; brandFiles?: string[] }[],
  machine: { code: string; make: string | null; file: string | null }
): string {
  const list = parts
    .map((p) => `${p.partCode} ${p.name}${p.brandFiles?.length ? ` (อยู่ในไฟล์ ${p.brandFiles.join(", ")})` : ""}`)
    .join("\n");
  const own = machine.file ? `ไฟล์ ${machine.file}` : "ไฟล์ของเครื่อง";
  return (
    `${list}\n\nเครื่อง ${machine.code}${machine.make ? ` ยี่ห้อ ${machine.make}` : ""} ใช้อะไหล่${own} — ` +
    `ใช้ข้ามยี่ห้อได้เฉพาะครั้งนี้ ระบบไม่เพิ่มรหัสนี้เข้า${own} ครั้งหน้าต้องยืนยันอีก`
  );
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
  // ส้ม (โทนเดียวกับย้อนขั้น) — ไม่ใช่แดงที่แปลว่า "ต้องเอาออก" และไม่ใช่เหลืองที่แปลว่า "ยังขาดอะไร": ส่งได้ แต่ไม่ใช่ของยี่ห้อนี้
  cross: { fg: colors.rollbackInk, bg: colors.rollbackSoft },
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
  const [others, setOthers] = useState<SparePartOption[]>([]);
  const [elsewhere, setElsewhere] = useState<ForBrand["elsewhere"]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [head, setHead] = useState<{ make: string; file: string; updatedAt: string | null } | null>(null);
  const seq = useRef(0);
  // รายการล่าสุดตอนกด "ใช้ข้ามยี่ห้อ" — กล่องยืนยันตอบทีหลัง ใช้ parts ตอนแตะแถวอาจเก่าไปแล้ว (แถวที่แก้ระหว่างนั้นจะหาย)
  const latest = useRef(parts);
  latest.current = parts;

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
      setOthers([]);
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
            setOthers(res.data.others ?? []);
            setElsewhere(res.data.elsewhere);
          })
          .catch(() => {
            if (mine !== seq.current) return;
            setResults([]);
            setShared([]);
            setOthers([]);
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

  function add(option: SparePartOption, crossBrand = false) {
    const existing = parts.find((p) => p.sparePartId === option.id);
    if (crossBrand && !existing) {
      askCross(option);
      return;
    }
    setTerm("");
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
        // เลือกจากไฟล์ของเครื่อง = ไม่ได้ยืนยันข้ามยี่ห้อ (ต่างจากแถวจากเซิร์ฟเวอร์ที่ไม่มีค่านี้ — ดู crossConfirmed)
        ...(brandMode ? { crossBrand: false } : {}),
      },
    ]);
  }

  /**
   * แถวจากกลุ่มไฟล์ยี่ห้ออื่น — ถามทุกครั้งที่เลือก (เจ้าของงาน: "ทุกคนที่เลือกอะไหล่ได้ ต้องกดยืนยัน" · รายครั้ง)
   * showAlert ไม่ใช่ Alert — Alert ของ react-native-web เงียบ (CLAUDE.md) · ยกเลิก = ไม่เพิ่มอะไร คำค้นยังอยู่ให้เลือกตัวอื่น
   */
  function askCross(option: SparePartOption) {
    showAlert(CROSS_BRAND_TITLE, crossBrandMessage([option], { code, make, file: shownFile ?? file }), [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: CROSS_BRAND_OK,
        onPress: () => {
          setTerm("");
          const now = latest.current;
          if (now.some((p) => p.sparePartId === option.id)) return;
          onChange([
            ...now,
            {
              sparePartId: option.id,
              partCode: option.partCode,
              name: option.name,
              brand: option.brand,
              quantity: 1,
              partNo: option.partNo ?? null,
              ...(option.brandFiles ? { brandFiles: option.brandFiles } : {}),
              crossBrand: true,
            },
          ]);
        },
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
      const s = rowState(p, file, { legacyIds, strict, verb, known: !!knownFile });
      if (s.kind === "remove") out.push({ text: s.text, tone: "danger" });
      else if (s.kind === "legacy") out.push({ text: s.text, tone: "muted" });
      else if (s.kind === "cross") out.push({ text: "ข้ามยี่ห้อ", tone: "cross" });
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
  // ไฟล์ยี่ห้ออื่นใช้ได้เมื่อยืนยัน (3 พ.ย. 69) — บรรทัดกติกาบอกข้อยกเว้นด้วย ไม่งั้นขัดกับกลุ่มที่สามที่ขึ้นข้างล่าง
  const ruleLine = otherOnly
    ? `เครื่อง ${code} ยี่ห้อ ${make} ไม่มีไฟล์ยี่ห้อของตัวเอง — เลือกจากของใช้ร่วม (ไฟล์ Other) · ไฟล์ยี่ห้ออื่นต้องกดยืนยันทุกครั้ง`
    : `เครื่อง ${code} ยี่ห้อ ${make}${sameName ? "" : ` ใช้ไฟล์ ${ownFile}`} — เลือกจากไฟล์นี้ · ไฟล์ยี่ห้ออื่นต้องกดยืนยันทุกครั้ง`;
  const files = elsewhere.map((e) => e.file);
  const exact = elsewhere.some((e) => e.exact);
  const noResultTitle =
    `ไม่พบ “${term.trim()}” ในไฟล์ ${ownFile}` +
    (files.length ? (exact ? ` — รหัสนี้อยู่ในไฟล์ ${files.join(", ")}` : ` — มีในไฟล์ ${files.join(", ")} เท่านั้น`) : "");
  const hints = noResultHints ?? [
    "ยี่ห้อในระบบไม่ตรงกับเครื่องจริง? หัวหน้าภาคหรือแอดมินแก้ยี่ห้อเครื่องได้ที่หน้าใบงาน (แก้ยี่ห้อเครื่อง)",
  ];

  // ไม่เจอในไฟล์ของเครื่องและของใช้ร่วม แต่มีในไฟล์ยี่ห้ออื่น — กล่องเหลืองชี้ไปที่กลุ่มข้ามยี่ห้อ แทนที่จะบอกว่าเลือกไม่ได้
  const ownEmpty = searched && !searching && results.length === 0 && shared.length === 0;
  const crossOnly = ownEmpty && others.length > 0;

  // cross = แถวของกลุ่มไฟล์ยี่ห้ออื่น: แตะแล้วถามยืนยันก่อนเพิ่ม · ป้ายที่อ่านออกเสียง/เทสต์หาได้บอกว่าเป็นการเพิ่มข้ามยี่ห้อ
  const resultRow = (option: SparePartOption, i: number, cross = false) => {
    const already = parts.some((p) => p.sparePartId === option.id);
    return (
      <TouchableOpacity
        key={option.id}
        style={[styles.brandResult, i > 0 && styles.brandResultLine]}
        onPress={() => add(option, cross)}
        activeOpacity={0.7}
        accessibilityLabel={
          already
            ? `${option.partCode} เลือกแล้ว`
            : cross
              ? `เพิ่มข้ามยี่ห้อ ${option.partCode} ${option.name}`
              : `เพิ่ม ${option.partCode} ${option.name}`
        }
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* รหัสสินค้านำหน้า — ช่างค้น/เบิก/เคลมด้วยรหัสสินค้า (เจ้าของงาน 31 ต.ค. 69) */}
          <Text style={styles.resultMain}>
            <Text style={styles.resultCode}>{option.partCode}</Text> {option.name}
          </Text>
          {option.partNo ? <Text style={styles.resultSub}>Part No. {option.partNo}</Text> : null}
          {/* กลุ่มข้ามยี่ห้อบอกไฟล์ทุกแถว — ไฟล์ของแต่ละตัวไม่เหมือนกัน และเป็นสิ่งที่คนต้องเทียบกับป้ายเครื่องก่อนกดยืนยัน */}
          {cross && option.brandFiles?.length ? (
            <Text style={styles.resultCross}>ไฟล์ {option.brandFiles.join(", ")}</Text>
          ) : null}
        </View>
        {already ? (
          <Text style={styles.pickedBadge}>เลือกแล้ว</Text>
        ) : (
          <Ionicons name="add-circle-outline" size={22} color={cross ? colors.rollbackInk : colors.primary} />
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

      {/* ไม่เจอในไฟล์ของเครื่อง: กล่องเหลืองขึ้นก่อนรายการ — บอกว่าที่เจออยู่ไฟล์ยี่ห้ออื่น และใช้ได้เมื่อยืนยัน (ไม่ใช่ "เลือกไม่ได้") */}
      {ownEmpty ? (
        <View style={styles.noResult} accessibilityLiveRegion="polite">
          <Text style={styles.noResultTitle}>{noResultTitle}</Text>
          <Text style={styles.noResultLine}>
            {crossOnly
              ? `ใช้ข้ามยี่ห้อได้ — แตะรายการในกลุ่ม “อยู่ในไฟล์ยี่ห้ออื่น” ข้างล่าง แล้วกดยืนยัน (ใช้ได้เฉพาะครั้งนี้ ไม่เพิ่มเข้าไฟล์ ${ownFile})`
              : `เครื่องนี้ (${code} · ${make}) เลือกได้เฉพาะอะไหล่จากไฟล์ ${ownFile}${otherOnly ? "" : " และของใช้ร่วม (ไฟล์ Other)"}`}
          </Text>
          {hints.map((h) => (
            <Text key={h} style={styles.noResultLine}>
              {h}
            </Text>
          ))}
        </View>
      ) : null}

      {results.length > 0 || shared.length > 0 || others.length > 0 ? (
        <View style={styles.pickerResults}>
          {results.map((o, i) => resultRow(o, i))}
          {/* กลุ่มที่สอง: ของใช้ร่วม (ไฟล์ Other) — ทุกเครื่องเลือกได้ (R4) แยกหัวให้เห็นว่าไม่ใช่ไฟล์ของเครื่อง */}
          {shared.length > 0 ? (
            <>
              <Text style={[styles.groupHead, results.length > 0 && styles.brandResultLine]}>ของใช้ร่วม (ไฟล์ Other)</Text>
              {shared.map((o, i) => resultRow(o, i))}
            </>
          ) : null}
          {/*
            กลุ่มที่สาม: ไฟล์ยี่ห้ออื่น — อยู่ท้ายสุดเสมอ (ของยี่ห้อนี้ต้องมาก่อน) หัวสีส้มเดียวกับป้าย "ข้ามยี่ห้อ"
            แตะแล้วถามยืนยันทุกครั้ง (เจ้าของงานเลือก 3 พ.ย. 69) · เซิร์ฟเวอร์รุ่นก่อนไม่ส่งกลุ่มนี้ = ไม่มีหัวนี้
          */}
          {others.length > 0 ? (
            <>
              <Text style={[styles.groupHead, styles.groupHeadCross, (results.length > 0 || shared.length > 0) && styles.brandResultLine]}>
                อยู่ในไฟล์ยี่ห้ออื่น — ใช้ได้เมื่อยืนยัน
              </Text>
              {others.map((o, i) => resultRow(o, i, true))}
            </>
          ) : null}
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
  resultCross: { fontSize: 12, lineHeight: 17, fontWeight: "600", color: colors.rollbackInk },
  groupHead: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: colors.textMuted,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  groupHeadCross: { color: colors.rollbackInk, backgroundColor: colors.rollbackSoft },
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
