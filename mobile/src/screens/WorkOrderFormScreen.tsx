/**
 * เปิดใบงานใหม่
 *
 * ใช้สองทาง — เปิดเปล่าจากปุ่ม "เพิ่มใบงาน" หรือถูกส่งมาจากกระดานพร้อมรหัสเคส
 * ถ้ามีรหัสเคสติดมา สาขากับเครื่องมาจากเคสอยู่แล้ว จึงไม่ต้องถามซ้ำ
 *
 * เปิดทีเดียวได้หลายเครื่องถ้าเป็นสาขาเดียวกัน แต่ได้ใบงานเครื่องละใบ ไม่ใช่ใบเดียว
 * ที่ถือหลายเครื่อง เพราะแต่ละเครื่องมีอะไหล่ของตัวเอง ปิดคนละเวลา และอาจถูก
 * จ่ายให้ช่างคนละคน ใบเดียวที่ถือสามเครื่องจะปิดไม่ได้จนกว่าจะเสร็จครบทั้งสาม
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import Ionicons from "@expo/vector-icons/Ionicons";
import PopupScreen from "../components/PopupScreen";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { useAuth } from "../context/AuthContext";
import { isAreaTeam } from "../utils/areaTeam";
import {
  MAX_ATTACHMENTS,
  PickedAttachment,
  asList,
  filesToAttachments,
  pickImageAttachment,
  pickImageAttachments,
  pickVideoAttachments,
  uploadAttachment,
  attachmentIcon,
} from "../utils/attachments";
import FileDropZone, { DropHint } from "../components/FileDropZone";
import { formatDate } from "./WorkOrderListScreen";
import { HomeStackParamList } from "../navigation/types";
import FieldHint, { invalidInput } from "../components/FieldHint";
import OpenOrdersWarning, { DuplicateConfirmModal, MachineOpenWarning, OpenOrder } from "../components/OpenOrdersWarning";
import PartPicker, { type PickedPart, type PartsBrand, brandBlockText, brandBlockers } from "../components/PartPicker";
import BrandChips from "../components/BrandChips";
import { brandFileOf } from "../utils/brandFile";
import { colors, radius, shadow, spacing } from "../theme";

type Props = NativeStackScreenProps<HomeStackParamList, "WorkOrderForm">;

interface Option {
  value: string;
  label: string;
  hint?: string;
}
interface BranchOption {
  id: number;
  code: string;
  name: string;
  region: string | null;
  openedAt: string | null;
  /** วันหมดประกันที่เร็วที่สุดในบรรดายี่ห้อเครื่องของสาขา */
  warrantyExpiresAt: string | null;
  /** แยกตามยี่ห้อเครื่อง — Oasis 2 ปี · อื่น ๆ 3 ปี (คิดที่เซิร์ฟเวอร์) */
  warranties?: Warranty[];
}
type Warranty = { brand: string; years: number | null; expiresAt: string | null };
/** เครื่องที่ระบบรู้จักแล้วในสาขานี้ พร้อมยี่ห้อกับขนาดที่เคยกรอกไว้ */
interface KnownMachine {
  code: string;
  type: string;
  /** ยี่ห้อจากไฟล์รายงานเครื่อง */
  brand?: string | null;
  /** ยี่ห้อที่เคยเลือกในแอป */
  model: string | null;
  capacityKg: number | null;
  /** ยี่ห้อที่ใช้จริง (brand ก่อน แล้ว model) — เซิร์ฟเวอร์คิดให้ เซิร์ฟเวอร์รุ่นก่อนไม่ส่ง */
  make?: string | null;
  /** ไฟล์อะไหล่ของเครื่อง (Haier · Huebsch · … · Other) */
  brandFile?: string | null;
}

/**
 * ยี่ห้อที่ระบบรู้แล้วของเครื่องนี้ → ล็อกปุ่มยี่ห้อ (เจ้าของงานตอบข้อ 17 · ค่าตั้งต้น D7)
 * นับยี่ห้อจากไฟล์รายงาน (brand) ด้วย ไม่ใช่แค่ที่เคยเลือกในแอป — เครื่องที่รายงานบอกยี่ห้อแล้วแต่ไม่เคยเปิดจากแอป
 * ถ้าถามซ้ำ ช่างจะกดยี่ห้ออื่นได้ทั้งที่เซิร์ฟเวอร์ไม่เขียนทับ (ยี่ห้อที่รู้แล้วชนะ) แล้วอะไหล่ที่เลือกจะถูกตัดสินด้วยไฟล์ที่ไม่ได้กด
 */
function lockedMakeOf(known: KnownMachine | undefined): { make: string; file: string } | null {
  if (!known) return null;
  const make = known.make?.trim() || known.brand?.trim() || known.model?.trim() || null;
  if (!make) return null;
  return { make, file: known.brandFile ?? brandFileOf(make) ?? "Other" };
}
/**
 * รุ่นเครื่อง — ของจริงมาจาก /work-orders/options ตอนเปิดฟอร์ม
 *
 * ที่เขียนไว้ตรงนี้เป็นแค่ค่าสำรองเผื่อโหลดตัวเลือกไม่ทัน จะได้ไม่เจอช่องรุ่นว่างเปล่า
 * เป็นตัวเลือกตายตัวเพราะต้องนับแยกได้ว่ารุ่นไหนเสียบ่อย และเวลาสั่งอะไหล่
 * ต้องรู้ว่ารุ่นอะไร ปล่อยให้พิมพ์เองจะได้ "Huebsch" "huebsch" ปนกัน
 * ต้องตรงกับ MACHINE_MODELS ใน backend/src/utils/constants.ts — Spinz เพิ่ม 31 ต.ค. 69 (มีไฟล์อะไหล่ Spinz
 * พิมพ์เองผิดตัวเดียวเครื่องตกไปไฟล์ Other ช่างเลือกอะไหล่ Spinz ไม่ได้)
 */
const FALLBACK_MODELS = ["Oasis", "Oasis(TC)", "Huebsch", "Huebsch (TC)", "Haier", "Maytag", "Spinz"];
const MODEL_OTHER = "อื่นๆ";

/**
 * ประเภทงานที่เป็นอุปกรณ์ร้าน ไม่ใช่เครื่องซัก/อบ (เจ้าของงานเลือก ต.ค. 69) — ไม่ถามหมายเลขเครื่อง W/D รุ่น ขนาด ป้ายรุ่น
 * เหลือแค่อาการกับรูป · ท่อลมร้อนไม่อยู่ในนี้ เพราะเป็นของเครื่องอบ ยังระบุ D ได้
 */
const EQUIPMENT_JOBS = new Set(["COIN_CHANGER", "WATER_PUMP", "DETERGENT", "WATER_HEATER"]);
/**
 * งานที่ไม่ระบุเครื่อง — อุปกรณ์ร้าน กับ PM ที่เข้าทำทั้งร้าน (เจ้าของงานกำหนด ต.ค. 69)
 * ใบเดียวต่อสาขา ฟอร์มเหลือแค่อาการกับรูป · เซิร์ฟเวอร์ไม่รับเลขเครื่องกับใบ PM
 */
const NO_MACHINE_JOBS = new Set([...EQUIPMENT_JOBS, "PM"]);

/**
 * Area Team ต้องกรอกครบก่อนเปิดใบงาน (เจ้าของงานกำหนด ต.ค. 69 — "ล็อกการใส่ข้อมูลทั้งหมด")
 * ทีมสาขาแจ้งแล้วไม่ได้อยู่ต่อ ข้อมูลที่ขาดคือแอดมินต้องโทรถามทีหลัง · เซิร์ฟเวอร์เช็คซ้ำ (areaTeamMissing)
 * ยกเว้นรูป — อัปหลังสร้างใบงาน เช็คได้ที่นี่ที่เดียว · งานที่ไม่ผูกเครื่องซัก/อบไม่บังคับหมายเลขเครื่อง
 */
const AREA_MACHINE_JOBS = new Set(["CM", "INSPECT", "HOT_AIR_DUCT"]);
const AREA_SYMPTOM_MIN = 10;

/**
 * ขนาดเครื่องเป็นกิโลกรัม — ค่าสำรองเผื่อโหลดตัวเลือกไม่ทัน เหมือนรายการรุ่น
 *
 * ต่างจากรุ่นคือพิมพ์เลขอื่นได้ ไม่ได้คุมให้เลือกเฉพาะในรายการ เพราะขนาดเป็น
 * ตัวเลขอยู่แล้ว เลข 17 ที่พิมพ์เองยังรวมยอดกับเลข 17 อื่นได้ ไม่เหมือนชื่อรุ่น
 * ที่พิมพ์เองแล้วได้ "Huebsch" กับ "huebsch" เป็นสองรุ่น
 */
const FALLBACK_CAPACITIES = [9, 10, 13, 14, 15, 18, 20, 25];
const CAPACITY_OTHER = "อื่นๆ";

/** รุ่นที่จะส่งไปเซิร์ฟเวอร์ — ที่พิมพ์เองก็เป็นรุ่นเหมือนกัน */
function resolvedModel(row: MachineRow): string {
  return (row.model === MODEL_OTHER ? row.modelOther : row.model).trim();
}

/**
 * ขนาดที่จะส่งไปเซิร์ฟเวอร์ เป็นตัวเลขหรือ null
 *
 * ส่งเลขล้วนไม่ส่ง "13 kg" เพราะหน่วยเป็น kg ทั้งระบบ เก็บหน่วยไปด้วยคือ
 * เปิดช่องให้มีทั้ง "13 kg" และ "13kg" ในฐานข้อมูลเดียวกัน
 */
function resolvedCapacity(row: MachineRow): number | null {
  const raw = row.capacity === CAPACITY_OTHER ? row.capacityOther : row.capacity;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** หนึ่งแถว = หนึ่งใบงานที่จะถูกเปิด */
interface MachineRow {
  key: string;
  code: string;
  /** รุ่นที่เลือกจากรายการ หรือ MODEL_OTHER เมื่อจะพิมพ์เอง */
  model: string;
  /** ชื่อรุ่นที่พิมพ์เอง ใช้เมื่อ model เป็น MODEL_OTHER */
  modelOther: string;
  /** ขนาดที่เลือกเป็นข้อความ เช่น "13" หรือ CAPACITY_OTHER เมื่อจะพิมพ์เอง */
  capacity: string;
  /** ขนาดที่พิมพ์เอง ใช้เมื่อ capacity เป็น CAPACITY_OTHER */
  capacityOther: string;
  symptom: string;
  files: PickedAttachment[];
  /** รูปป้ายรุ่นบนตัวเครื่อง ไม่บังคับ */
  nameplate: PickedAttachment | null;
  /** อะไหล่ที่ช่างคิดว่าต้องใช้ (ช่าง/Senior ช่าง เท่านั้น) — เป็นข้อเสนอ หัวหน้าภาคแก้ต่อในฟอร์มระบุอะไหล่ */
  parts: PickedPart[];
}

/** W = เครื่องซัก · D = เครื่องอบ ตัวอักษรหน้าบอกชนิดเครื่องในตัว */
const MACHINE_CODE_PATTERN = /^[WD]\d{1,4}$/;

let rowSeq = 0;
function blankRow(): MachineRow {
  rowSeq += 1;
  return {
    key: `row-${rowSeq}`,
    code: "",
    model: "",
    modelOther: "",
    capacity: "",
    capacityOther: "",
    symptom: "",
    files: [],
    nameplate: null,
    parts: [],
  };
}

export default function WorkOrderFormScreen({ navigation, route }: Props) {
  const outageId = route.params?.outageId ?? null;
  const fromBoard = outageId !== null;

  const [priorities, setPriorities] = useState<Option[]>([]);
  const [jobTypes, setJobTypes] = useState<Option[]>([]);
  const [jobType, setJobType] = useState("CM");

  const [branchCode, setBranchCode] = useState(route.params?.branchCode ?? "");
  // เก็บชื่อสาขาไว้ด้วย ไม่ใช่แค่รหัส — คนจำสาขาจากชื่อ ไม่ได้จำจากรหัส
  // เห็นแต่ "C0006" แล้วไม่มีทางรู้ว่าเลือกถูกใบหรือเปล่าจนกว่าจะเปิดใบงานแล้ว
  const [branchName, setBranchName] = useState<string | null>(null);
  // วันเปิดร้านกับวันหมดประกันของสาขาที่เลือก ให้เห็นตั้งแต่ตอนเปิดใบงาน
  // ไม่ใช่ไปรู้ทีหลังตอนช่างถึงหน้างานแล้วว่าเครื่องยังอยู่ในประกันของผู้ขาย
  const [branchOpenedAt, setBranchOpenedAt] = useState<string | null>(null);
  const [branchWarrantyAt, setBranchWarrantyAt] = useState<string | null>(null);
  const [branchWarranties, setBranchWarranties] = useState<Warranty[]>([]);
  const [branchResults, setBranchResults] = useState<BranchOption[]>([]);
  const [branchTerm, setBranchTerm] = useState("");
  /**
   * รายละเอียดของประเภทงาน "อื่นๆ" — ไม่ใช่หัวข้องานที่ให้พิมพ์อิสระเหมือนเดิม
   *
   * สามประเภทแรกตั้งหัวข้อให้เองจากชื่อประเภท มีแต่ "อื่นๆ" ที่ชื่อประเภท
   * ไม่ได้บอกอะไรกับคนที่มาอ่านทีหลัง จึงต้องให้ระบุ
   */
  const [otherDetail, setOtherDetail] = useState(route.params?.presetTitle ?? "");
  const [priority, setPriority] = useState("NORMAL");

  /**
   * แถวเครื่อง — ทางที่เปิดจากกระดานมีแถวเดียวเสมอ และไม่มีช่องรหัสเครื่อง
   * เพราะเครื่องมาจากเคสอยู่แล้ว เหลือแค่อาการกับรูปที่ต้องกรอก
   */
  const [rows, setRows] = useState<MachineRow[]>([blankRow()]);
  // อุปกรณ์ร้านเปิดได้ใบเดียว (ไม่มีเครื่องให้แยกใบ) — แถวที่สองขึ้นไปซ่อนไว้ ไม่ลบ สลับกลับมาเป็นงานเครื่องแล้วยังอยู่
  const noMachine = !fromBoard && NO_MACHINE_JOBS.has(jobType);
  const shownRows = noMachine ? rows.slice(0, 1) : rows;

  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
  const [capacities, setCapacities] = useState<number[]>(FALLBACK_CAPACITIES);
  /** เครื่องของสาขานี้ที่ระบบรู้ยี่ห้อกับขนาดไว้แล้ว ใช้ล็อกยี่ห้อ/เติมขนาดให้ตอนพิมพ์รหัสตรงกัน */
  const [knownMachines, setKnownMachines] = useState<KnownMachine[]>([]);
  /**
   * โหลดรายการเครื่องของสาขาที่เลือกสำเร็จแล้ว — ข้อความ "ในระบบยังไม่รู้ยี่ห้อ" ขึ้นเฉพาะตอนนี้
   * ยังโหลดไม่เสร็จหรือโหลดไม่ได้ (ทีม Area ดูรายการเครื่องไม่ได้) ไม่ได้แปลว่าเครื่องไม่มียี่ห้อ อย่าบอกแบบนั้น
   */
  const [machinesLoaded, setMachinesLoaded] = useState(false);
  const knownByCode = useMemo(() => new Map(knownMachines.map((m) => [m.code, m])), [knownMachines]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [branchRegion, setBranchRegion] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /**
   * กันกดเปิดใบงานซ้ำตอนเน็ตช้า — saving เป็น state ปุ่มจึงยังกดได้อีกครั้งก่อนหน้าจอวาดใหม่
   * สองคลิกติดกันได้ใบเหมือนกันเป๊ะสองใบ ref เปลี่ยนทันทีไม่ต้องรอวาด
   */
  const submitting = useRef(false);
  // ป๊อปอัพยืนยันเปิดซ้ำ — รายการใบค้างที่ดึงใหม่ตอนกดบันทึก · ยืนยันแล้วกดบันทึกรอบนั้นไม่ถามซ้ำ
  const [dupOrders, setDupOrders] = useState<OpenOrder[] | null>(null);
  const dupConfirmed = useRef(false);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const strict = isAreaTeam(user) && !fromBoard;
  const missing: string[] = [];
  if (strict) {
    if (!branchCode.trim()) missing.push("สาขา");
    if (jobType === "OTHER" && !otherDetail.trim()) missing.push("รายละเอียดงาน");
    if (AREA_MACHINE_JOBS.has(jobType) && shownRows.some((r) => !r.code.trim())) missing.push("เครื่อง");
    if (shownRows.some((r) => r.symptom.trim().length < AREA_SYMPTOM_MIN)) missing.push("อาการที่พบ");
    if (!contactName.trim()) missing.push("ผู้ติดต่อที่สาขา");
    const digits = contactPhone.replace(/\D/g, "").length;
    if (digits < 9 || digits > 10) missing.push("เบอร์ติดต่อสาขา");
  }
  /**
   * รูปหน้างานบังคับ (เจ้าของงานกำหนด ต.ค. 69) — ช่างกับหัวหน้าภาคระบุอะไหล่จากรูปก่อนไปหน้างาน
   * ใบที่ไม่มีรูปคือต้องโทรถามร้านหรือขับไปดูก่อนรอบหนึ่ง · บังคับที่ฟอร์มเท่านั้น เพราะรูปอัปหลังสร้างใบงาน
   * (นำเข้าจากไฟล์ฟอร์ม COCO ไม่ผ่านด่านนี้ — แถวในไฟล์ที่ไม่มีรูปยังนำเข้าได้)
   *
   * ยกเว้นใบ PM (เจ้าของงานขอ ต.ค. 69) — เป็นงานตามรอบ ไม่ได้เปิดเพราะมีอาการให้ถ่าย และไม่ต้องเตรียมอะไหล่จากรูป
   * ยกเว้นแอดมิน (เจ้าของงานขอ ต.ค. 69 · ทุกระดับ — Super Admin กับ Admin Spare Part ก็เป็น ADMIN ในแอป)
   * ช่าง · หัวหน้าภาค · ทีม COCO ยังบังคับเหมือนเดิม · ใบที่แอดมินเปิดไม่มีรูป หัวหน้าภาคอาจต้องโทรถามร้านก่อนระบุอะไหล่
   * ฟอร์มจึงยังชวนให้แนบถ้ามีรูปในมือ (ดู adminPhotoOptional ใน MachineCard)
   */
  const adminPhotoOptional = user?.role === "ADMIN" && jobType !== "PM";
  const photoRequired = jobType !== "PM" && !adminPhotoOptional;
  if (photoRequired && shownRows.some((r) => r.files.length === 0)) missing.push("รูปหน้างาน");

  // วงเล็บไว้ ไม่งั้นต่อกับคำว่า "หัวหน้าภาค" แล้วกลายเป็น "หัวหน้าภาคภาคใต้"
  const regionHint = branchRegion ? ` (ภาค${branchRegion})` : "";

  /**
   * ช่อง "อะไหล่ที่ต้องใช้" ต่อเครื่อง — เฉพาะช่าง/Senior ช่าง (เจ้าของงานตอบข้อ 1 ต.ค. 69 · Senior เป็น EMPLOYEE ในแอป)
   * คนที่ยืนหน้าเครื่องตอนเปิดใบคือช่าง รู้อะไหล่ก่อนใคร · ทีม COCO/Area ไม่รู้ว่าต้องใช้ตัวไหน แอดมิน/หัวหน้าภาค
   * ระบุอะไหล่ในขั้นของตัวเองอยู่แล้ว · งานทั้งร้าน (อุปกรณ์ร้าน/PM) และทางกระดานไม่มี (ค่าตั้งต้น D8)
   */
  const showParts = user?.role === "EMPLOYEE" && !fromBoard && !noMachine;
  /** รหัสเครื่องของแถว — ทางกระดานใช้รหัสที่ติดมากับเคส */
  const codeOf = (row: MachineRow) => (fromBoard ? route.params?.machineCode ?? "" : row.code).trim().toUpperCase();
  const lockOf = (row: MachineRow) => {
    const code = codeOf(row);
    return code ? lockedMakeOf(knownByCode.get(code)) : null;
  };
  /**
   * ยี่ห้อเครื่องของแถวในรูปที่ช่องเลือกอะไหล่ใช้ — ยี่ห้อที่รู้แล้ว หรือปุ่มยี่ห้อที่เพิ่งกดในฟอร์มนี้
   * ส่งเป็น "รู้ไฟล์แล้ว" ทั้งสองแบบ: ปุ่มยี่ห้อของฟอร์มอยู่ที่ช่อง "ยี่ห้อเครื่อง" ด้านบนแล้ว ช่องอะไหล่จึงไม่ต้องขึ้นปุ่มชุดที่สอง
   */
  const partsBrandOf = (row: MachineRow): PartsBrand => {
    const lock = lockOf(row);
    const make = lock ? lock.make : resolvedModel(row) || null;
    return { machine: true, make, file: lock ? lock.file : brandFileOf(make), machineCode: codeOf(row) };
  };

  useEffect(() => {
    api
      .get<{
        priorities: Option[];
        jobTypes: Option[];
        machineModels?: string[];
        machineCapacities?: number[];
      }>("/work-orders/options")
      .then((res) => {
        setPriorities(res.data.priorities);
        setJobTypes(res.data.jobTypes);
        if (res.data.machineModels?.length) setModels(res.data.machineModels);
        if (res.data.machineCapacities?.length) setCapacities(res.data.machineCapacities);
      })
      .catch(() => setError("โหลดตัวเลือกไม่สำเร็จ"));
  }, []);

  /**
   * รุ่นกับขนาดของเครื่องในสาขานี้ที่เคยกรอกไว้
   *
   * ถามทีเดียวทั้งสาขาตอนรู้ว่าสาขาไหน ไม่ได้ถามตอนพิมพ์รหัสเครื่องทีละตัว —
   * พิมพ์ "W12" คือสามจังหวะ ซึ่งจะกลายเป็นสามคำขอโดยได้คำตอบเดียวกัน
   */
  useEffect(() => {
    const code = branchCode.trim();
    setMachinesLoaded(false);
    if (!code) {
      setKnownMachines([]);
      return;
    }
    let alive = true;
    api
      .get<KnownMachine[]>(`/branches/${encodeURIComponent(code)}/machines`)
      .then((res) => {
        if (!alive) return;
        setKnownMachines(res.data);
        setMachinesLoaded(true);
      })
      .catch(() => alive && setKnownMachines([]));
    return () => {
      alive = false;
    };
  }, [branchCode]);

  /**
   * เติมขนาดของเครื่องที่ระบบรู้จักแล้ว
   *
   * ไม่ทับค่าที่คนกรอกไปแล้ว ด้วยเหตุผลเดียวกับผู้ติดต่อ — คนที่ตั้งใจเลือกเอง
   * รู้ดีกว่าใบงานเมื่อเดือนก่อน และคนที่ยืนอยู่หน้าเครื่องเห็นป้ายจริงอยู่
   *
   * ยี่ห้อไม่เติมแล้ว (เลือกอะไหล่ตามไฟล์ยี่ห้อ) — เครื่องที่รู้ยี่ห้อแล้วขึ้นเป็นปุ่มล็อกแทน (lockedMakeOf)
   * เพราะยี่ห้อตัดสินไฟล์อะไหล่ เติมให้แล้วยังกดเปลี่ยนได้ = เปลี่ยนไฟล์อะไหล่ของเครื่องจากฟอร์มเปิดใบงาน
   *
   * ทางกระดานไม่มีช่องรหัสเครื่อง ใช้รหัสที่ติดมากับเคสแทน
   */
  useEffect(() => {
    if (knownMachines.length === 0) return;
    let changed = false;
    const next = rows.map((r) => {
      const code = (fromBoard ? route.params?.machineCode ?? "" : r.code).trim().toUpperCase();
      const known = code ? knownByCode.get(code) : undefined;
      if (!known) return r;
      const patch: Partial<MachineRow> = {};
      if (!r.capacity && typeof known.capacityKg === "number") {
        const asText = String(known.capacityKg);
        if (capacities.includes(known.capacityKg)) patch.capacity = asText;
        else {
          patch.capacity = CAPACITY_OTHER;
          patch.capacityOther = asText;
        }
      }
      if (Object.keys(patch).length === 0) return r;
      changed = true;
      return { ...r, ...patch };
    });
    // เขียนกลับเฉพาะตอนมีอะไรเปลี่ยนจริง — rows อยู่ใน deps ถ้าเขียนทุกรอบจะวนไม่จบ
    if (changed) setRows(next);
  }, [knownMachines, knownByCode, capacities, fromBoard, route.params?.machineCode, rows]);

  /**
   * เปิดจากกระดาน — รหัสสาขาติดมาแต่ชื่อไม่ได้ติดมาด้วย
   *
   * ตามชื่อมาให้ เพราะข้อความ "สาขามาจากเคสให้อัตโนมัติ" ไม่ได้บอกว่าสาขาไหน
   * คนที่กดเปิดใบงานจากกระดานสิบแถวรวดจะไม่รู้เลยว่ากำลังเปิดให้สาขาอะไร
   */
  useEffect(() => {
    const code = route.params?.branchCode;
    if (!code) return;
    api
      .get<BranchOption[]>("/branches", { params: { search: code } })
      .then((res) => {
        const match = res.data.find((b) => b.code === code);
        if (match) {
          setBranchName(match.name);
          setBranchRegion(match.region ?? null);
          setBranchOpenedAt(match.openedAt ?? null);
          setBranchWarrantyAt(match.warrantyExpiresAt ?? null);
          setBranchWarranties(match.warranties ?? []);
        }
      })
      .catch(() => undefined);
  }, [route.params?.branchCode]);

  // ใบงานที่ยังเปิดค้างของสาขา — เตือนก่อนเปิดซ้ำ (ดู OpenOrdersWarning)
  useEffect(() => {
    const code = branchCode.trim();
    setOpenOrders([]);
    if (!code) return;
    let alive = true;
    api
      .get<OpenOrder[]>(`/branches/${encodeURIComponent(code)}/open-work-orders`)
      .then((res) => {
        if (alive) setOpenOrders(res.data);
      })
      // เตือนไม่ขึ้นดีกว่าเปิดใบงานไม่ได้ — ฟอร์มยังใช้ได้ตามปกติ
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [branchCode]);

  /**
   * เติมผู้ติดต่อจากใบงานล่าสุดของสาขานี้
   *
   * ส่วนใหญ่เป็นคนเดิมเบอร์เดิม การให้พิมพ์ใหม่ทุกครั้งคือทางที่ทำให้ช่องนี้ว่าง
   * ไม่ทับค่าที่คนกรอกไปแล้ว — คนที่ตั้งใจพิมพ์เองย่อมรู้ดีกว่าใบงานเมื่อเดือนก่อน
   */
  useEffect(() => {
    const code = branchCode.trim();
    if (!code) return;
    let alive = true;
    api
      .get<{ contactName: string | null; contactPhone: string | null }>(
        `/branches/${encodeURIComponent(code)}/last-contact`
      )
      .then((res) => {
        if (!alive) return;
        setContactName((v) => v || res.data.contactName || "");
        setContactPhone((v) => v || res.data.contactPhone || "");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [branchCode]);

  // ค้นสาขาแบบหน่วงไว้ เหมือนตัวเลือกอะไหล่ ไม่งั้นพิมพ์ตัวเดียวยิงหลายรอบ
  useEffect(() => {
    const keyword = branchTerm.trim();
    if (!keyword || fromBoard) {
      setBranchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<BranchOption[]>("/branches", { params: { search: keyword } })
        .then((res) => setBranchResults(res.data.slice(0, 8)))
        .catch(() => setBranchResults([]));
    }, 350);
    return () => clearTimeout(timer);
  }, [branchTerm, fromBoard]);

  function patchRow(key: string, patch: Partial<MachineRow>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function addFile(
    row: MachineRow,
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | PickedAttachment[] | null>
  ) {
    if (row.files.length >= MAX_ATTACHMENTS) {
      showAlert(`แนบได้ไม่เกิน ${MAX_ATTACHMENTS} ไฟล์ต่อเครื่อง`, "ลบไฟล์ที่ไม่ต้องการออกก่อน");
      return;
    }
    setBusy("กำลังเตรียมไฟล์");
    try {
      const got = asList(await pick(setBusy));
      // เลือกมาหลายไฟล์จนเกินเพดาน — เก็บเท่าที่ใส่ได้แล้วบอก ไม่ทิ้งทั้งชุด
      const room = MAX_ATTACHMENTS - row.files.length;
      if (got.length > room) {
        showAlert(`แนบได้ไม่เกิน ${MAX_ATTACHMENTS} ไฟล์ต่อเครื่อง`, `เก็บไว้ ${room} ไฟล์แรก จากที่เลือก ${got.length} ไฟล์`);
      }
      const keep = got.slice(0, room);
      if (keep.length) {
        setRows((current) =>
          current.map((r) => (r.key === row.key ? { ...r, files: [...r.files, ...keep] } : r))
        );
      }
    } catch (e) {
      showAlert("เตรียมไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  /**
   * รูปป้ายรุ่นเก็บแยกจากรูปอาการ — ช่องเดียวต่อเครื่อง ใส่ใหม่ทับของเก่า
   *
   * ไม่บังคับให้ใส่ เพราะบางเครื่องป้ายลอกไปแล้วหรือถ่ายไม่ถึง แต่ถ้าใส่มา
   * จะช่วยให้คนสั่งอะไหล่รู้รุ่นจริงโดยไม่ต้องเชื่อรุ่นที่คนกรอกเลือกไว้
   */
  async function addNameplate(
    row: MachineRow,
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | PickedAttachment[] | null>
  ) {
    setBusy("กำลังเตรียมรูปป้ายรุ่น");
    try {
      const file = asList(await pick(setBusy))[0];
      if (file) {
        setRows((current) => current.map((r) => (r.key === row.key ? { ...r, nameplate: file } : r)));
      }
    } catch (e) {
      showAlert("เตรียมไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  /** ตรวจก่อนส่ง — บอกให้ชัดว่าแถวไหนขาดอะไร ไม่ใช่แค่ "กรอกไม่ครบ" */
  function validate(): string | null {
    if (missing.length) return `กรอกไม่ครบ: ${missing.join(" · ")}`;
    if (jobType === "OTHER" && !otherDetail.trim()) {
      return 'เลือกประเภทงาน "อื่นๆ" แล้วต้องระบุรายละเอียดด้วย';
    }
    if (!fromBoard && !branchCode.trim()) return "ต้องเลือกสาขา";
    if (fromBoard) return null;
    // งานที่ไม่ระบุเครื่อง (อุปกรณ์ร้าน · PM ทั้งร้าน) — ใบเดียว ไม่ต้องตรวจหมายเลข/รุ่น
    if (noMachine) return null;

    const codes = rows.map((r) => r.code.trim().toUpperCase());
    if (codes.some((c) => !c) && rows.length > 1) {
      return "ถ้าไม่ระบุเครื่อง จะเปิดได้ใบเดียวเท่านั้น — ลบแถวที่ว่างออก";
    }
    const duplicate = codes.find((c, i) => c && codes.indexOf(c) !== i);
    if (duplicate) return `เครื่อง ${duplicate} ถูกใส่ซ้ำ`;

    for (const [i, row] of rows.entries()) {
      const code = codes[i];
      const picked = showParts ? row.parts : [];
      if (!code) {
        // อะไหล่ที่เลือกไว้ก่อนลบรหัสเครื่อง — ไม่ทิ้งเงียบ ๆ ให้คนเลือกเองว่าจะใส่เครื่องหรือเอาออก (ข้อ 22)
        if (picked.length) return `เครื่องที่ ${i + 1}: ใส่หมายเลขเครื่องก่อนจึงเลือกอะไหล่ได้ — หรือเอาอะไหล่ที่เลือกไว้ออก`;
        continue;
      }
      if (!MACHINE_CODE_PATTERN.test(code)) {
        return `เครื่องที่ ${i + 1} ต้องเป็น W หรือ D ตามด้วยตัวเลข เช่น W1 หรือ D12`;
      }
      // เครื่องที่ระบบรู้ยี่ห้อแล้วไม่ต้องเลือก (ปุ่มล็อก) — รวมเครื่องที่รู้จากไฟล์รายงานอย่างเดียว ไม่งั้นเปิดใบไม่ได้ทั้งที่ระบบรู้ยี่ห้อ
      if (!lockOf(row) && !resolvedModel(row)) return `เครื่องที่ ${i + 1} (${code}) ยังไม่ได้เลือกยี่ห้อเครื่อง`;
      if (picked.length) {
        // กติกาเดียวกับป้ายแดงในช่องอะไหล่ (และ brandProblem ที่เซิร์ฟเวอร์) — บอกก่อนกด ไม่ใช่ไปโดนปฏิเสธทั้งชุด
        const brand = partsBrandOf(row);
        const block = brandBlockText(brandBlockers(picked, brand, null, { strict: true }), brand, "เปิดใบงาน");
        if (block) return `เครื่องที่ ${i + 1} (${code}): ${block}`;
      }
    }
    return null;
  }

  async function submit() {
    if (submitting.current) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError(null);
    /**
     * สาขามีใบที่ยังไม่ปิด → ถามยืนยันก่อน (เจ้าของงานขอ ต.ค. 69) — ดึงใหม่ตอนกด ไม่ใช้รายการตอนเลือกสาขา
     * เพราะฟอร์มอาจเปิดค้างไว้นานจนมีคนเปิดใบเดียวกันไปแล้ว · ดึงไม่ได้ = ไม่บล็อก (กล่องเหลืองยังเตือนอยู่)
     */
    if (!dupConfirmed.current && branchCode.trim()) {
      const open = await api
        .get<OpenOrder[]>(`/branches/${encodeURIComponent(branchCode.trim())}/open-work-orders`, { loadingText: "กำลังเช็คใบงานค้างของสาขา…" })
        .then((r) => r.data)
        .catch(() => [] as OpenOrder[]);
      if (open.length) {
        setOpenOrders(open);
        setDupOrders(open);
        submitting.current = false;
        setSaving(false);
        return;
      }
    }
    dupConfirmed.current = false;
    try {
      // ส่งเฉพาะสิ่งที่ขั้นนี้รู้ อะไหล่ ช่าง และวันนัดเป็นของขั้นถัดไป
      // ส่ง title เฉพาะตอนเลือก "อื่นๆ" — ประเภทอื่นเซิร์ฟเวอร์ตั้งหัวข้อให้เอง
      const shared = {
        jobType,
        priority,
        ...(jobType === "OTHER" ? { title: otherDetail.trim() } : {}),
      };
      // ผู้ติดต่อส่งทั้งสองทาง — ฟอร์มมีช่องให้กรอกทั้งสองทางอยู่แล้ว
      // ทางกระดานเคยไม่ส่ง ค่าที่คนพิมพ์ลงไปจึงหายเงียบ ๆ ทั้งที่กดบันทึกสำเร็จ
      const contact = {
        contactName: contactName.trim() || null,
        contactPhone: contactPhone.trim() || null,
      };
      const res = fromBoard
        ? await api.post(`/work-orders/from-outage/${outageId}`, {
            ...shared,
            ...contact,
            symptom: rows[0].symptom.trim() || null,
            // ยี่ห้อกับขนาดของเครื่องในเคส — เคสรู้แต่ว่าเครื่องไหน · ยี่ห้อที่รู้แล้ว (ปุ่มล็อก) ไม่ส่ง เซิร์ฟเวอร์ไม่เขียนทับอยู่แล้ว
            model: lockOf(rows[0]) ? null : resolvedModel(rows[0]) || null,
            capacityKg: resolvedCapacity(rows[0]),
          })
        : await api.post("/work-orders", {
            ...shared,
            ...contact,
            branchCode: branchCode.trim(),
            machines: shownRows.map((r) =>
              noMachine
                ? { model: null, capacityKg: null, symptom: r.symptom.trim() || null }
                : {
                    code: r.code.trim().toUpperCase() || undefined,
                    // ยี่ห้อที่รู้แล้วไม่ส่ง — ปุ่มล็อกไว้ เซิร์ฟเวอร์ก็ไม่เขียนทับยี่ห้อที่รู้แล้ว (ค่าตั้งต้น D7)
                    model: lockOf(r) ? null : resolvedModel(r) || null,
                    capacityKg: resolvedCapacity(r),
                    symptom: r.symptom.trim() || null,
                    // อะไหล่ของช่างแยกต่อเครื่อง (แต่ละเครื่องคนละไฟล์ยี่ห้อ) · ลงเป็นอะไหล่ที่รอ หัวหน้าภาคแก้ต่อได้
                    ...(showParts && r.parts.length && r.code.trim()
                      ? { parts: r.parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })) }
                      : {}),
                  }
            ),
          });

      // ทางกระดานได้ใบเดียวและไม่มี orders ติดมา ทำให้เป็นรูปแบบเดียวกันก่อนใช้
      const orders: { id: number; code: string }[] = res.data.orders ?? [
        { id: res.data.id, code: res.data.code },
      ];

      /**
       * ไฟล์ส่งตามหลังใบงาน ไม่ได้ส่งไปพร้อมกัน
       *
       * เพราะไฟล์ต้องผูกกับใบงาน และใบงานยังไม่มีเลขจนกว่าจะบันทึกเสร็จ
       * ผลคือถ้าส่งไฟล์ไม่ผ่าน ใบงานยังถูกเปิดไปแล้ว — ซึ่งถูกต้องกว่าการ
       * ทิ้งทั้งใบเพราะรูปใบเดียวส่งไม่ขึ้น คนกรอกจะได้ไม่ต้องพิมพ์ใหม่ทั้งหมด
       * บอกให้ชัดว่ากี่ไฟล์ที่ไม่ขึ้น แล้วให้ไปแนบซ้ำในใบงานได้
       */
      let failed = 0;
      const total = shownRows.reduce((sum, r) => sum + r.files.length + (r.nameplate && !noMachine ? 1 : 0), 0);
      let sent = 0;
      for (const [i, row] of shownRows.entries()) {
        const target = orders[i];
        if (!target) break;
        // รูปป้ายรุ่นส่งก่อน เพราะเป็นรูปที่ช่วยคนสั่งอะไหล่มากที่สุด
        // ถ้าเน็ตหลุดกลางทางจะได้ไม่ใช่รูปที่หายไปเป็นอันแรก
        const queue: { file: PickedAttachment; role?: string }[] = [
          ...(row.nameplate && !noMachine ? [{ file: row.nameplate, role: "NAMEPLATE" }] : []),
          ...row.files.map((file) => ({ file })),
        ];
        for (const item of queue) {
          sent += 1;
          setBusy(`กำลังส่งไฟล์ ${sent}/${total}`);
          try {
            await uploadAttachment(target.id, item.file, item.role, undefined, { index: sent - 1, total });
          } catch {
            failed += 1;
          }
        }
      }

      const listed = orders.map((o) => o.code).join(", ");
      showAlert(
        orders.length > 1 ? `เปิดใบงานแล้ว ${orders.length} ใบ` : "เปิดใบงานแล้ว",
        failed === 0
          ? listed
          : `${listed}\n\nแต่ส่งไฟล์ไม่สำเร็จ ${failed} ไฟล์ — แนบใหม่ได้ในใบงาน`
      );

      // เปิดหลายใบพร้อมกันแล้วเด้งเข้าใบใดใบหนึ่งจะเหมือนอีกสองใบหายไป
      // ปิดหน้าต่างกลับไปที่หน้าเดิมแทน (รายการโหลดใหม่เองตอนได้โฟกัสคืน)
      // ใบเดียว: ใบงานที่เพิ่งเปิดขึ้นมาแทนที่ในหน้าต่างเดิมทันที
      if (orders.length > 1) navigation.goBack();
      else navigation.replace("WorkOrderDetail", { id: orders[0].id });
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      submitting.current = false;
      setSaving(false);
      setBusy(null);
    }
  }

  return (
    // เปิดเป็นหน้าต่างลอยทับหน้าเดิม แบบเดียวกับใบงาน — ชื่อฟอร์มอยู่หัวหน้าต่าง
    <PopupScreen title="เปิดใบงานใหม่" subtitle="ถามเฉพาะสิ่งที่ขั้นนี้รู้" width={860}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/*
        แบ่งเป็นการ์ดขั้น 1–5 ตามต้นแบบ OTTERI — ฟอร์มยาวที่เป็นก้อนเดียวทำให้
        คนกรอกไม่รู้ว่าเหลืออีกเท่าไหร่ เลขขั้นบอกทั้งลำดับและระยะทางที่เหลือ
      */}
      <View style={styles.card}>
        <StepHead n={1} title="สาขา" />
        {fromBoard ? (
          <View style={styles.fromBoard}>
            <Ionicons name="link-outline" size={16} color={colors.primary} />
            <Text style={styles.fromBoardText}>
              เปิดจากเคสบนกระดาน สาขาและเครื่องมาจากเคสให้อัตโนมัติ
              {branchCode ? `\n${branchCode}${branchName ? ` · ${branchName}` : ""}` : ""}
            </Text>
            {branchCode ? (
              <BranchFacts
                code={branchCode}
                openedAt={branchOpenedAt}
                warrantyExpiresAt={branchWarrantyAt}
                warranties={branchWarranties}
              />
            ) : null}
          </View>
        ) : (
          <>
            {branchCode ? (
              <View style={styles.chosen}>
                <View style={styles.chosenBody}>
                  <Text style={styles.chosenText}>{branchCode}</Text>
                  {branchName ? (
                    <Text style={styles.chosenName} numberOfLines={2}>
                      {branchName}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setBranchCode("");
                    setBranchName(null);
                    setBranchRegion(null);
                    setBranchOpenedAt(null);
                    setBranchWarrantyAt(null);
                    setBranchWarranties([]);
                    setBranchTerm("");
                    setRows([blankRow()]);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                </TouchableOpacity>
              </View>
            ) : null}
            {branchCode ? (
              <BranchFacts
                code={branchCode}
                openedAt={branchOpenedAt}
                warrantyExpiresAt={branchWarrantyAt}
                warranties={branchWarranties}
              />
            ) : (
              <>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={15} color={colors.textFaint} />
                  <TextInput
                    style={styles.searchInput}
                    value={branchTerm}
                    onChangeText={setBranchTerm}
                    placeholder="ค้นรหัสหรือชื่อสาขา"
                    placeholderTextColor={colors.textFaint}
                    accessibilityLabel="ค้นหาสาขา"
                  />
                </View>
                {branchResults.length > 0 ? (
                  <View style={styles.results}>
                    {branchResults.map((b) => (
                      <TouchableOpacity
                        key={b.id}
                        style={styles.result}
                        onPress={() => {
                          setBranchCode(b.code);
                          setBranchName(b.name);
                          setBranchRegion(b.region ?? null);
                          setBranchOpenedAt(b.openedAt ?? null);
                          setBranchWarrantyAt(b.warrantyExpiresAt ?? null);
                          setBranchWarranties(b.warranties ?? []);
                          setBranchResults([]);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.resultCode}>{b.code}</Text>
                        <Text style={styles.resultName} numberOfLines={1}>
                          {b.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </>
            )}
          </>
        )}
        {branchCode ? (
          <OpenOrdersWarning
            orders={openOrders}
            onOpen={(id) => navigation.push("WorkOrderDetail", { id })}
          />
        ) : null}
      </View>

      <View style={styles.card}>
        <StepHead n={2} title="ประเภทงาน" />
        <View style={styles.options}>
          {jobTypes.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.option, jobType === t.value && styles.optionOn]}
              onPress={() => setJobType(t.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionText, jobType === t.value && styles.optionTextOn]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.jobHint}>{jobTypes.find((t) => t.value === jobType)?.hint ?? ""}</Text>

        {jobType === "OTHER" ? (
          <>
            <Text style={styles.label}>รายละเอียดงาน</Text>
            <TextInput
              style={styles.input}
              value={otherDetail}
              onChangeText={setOtherDetail}
              placeholder="งานอะไร เช่น ติดตั้งป้ายใหม่ / ย้ายเครื่องระหว่างสาขา"
              placeholderTextColor={colors.textFaint}
              accessibilityLabel="รายละเอียดงาน"
            />
          </>
        ) : null}

      </View>

      <View style={styles.card}>
        <StepHead n={3} title={noMachine ? "อาการ" : "เครื่องและอาการ"} />
        {!fromBoard && !noMachine ? (
          <Text style={styles.stepDesc}>เปิดทีเดียวหลายเครื่องได้ ระบบแยกเป็นใบงานเครื่องละใบ</Text>
        ) : null}
        {/*
          เครื่องกับอาการอยู่ด้วยกัน เพราะอาการเป็นของเครื่อง ไม่ใช่ของใบงาน
          เปิดสามเครื่องพร้อมกันแล้วใส่อาการเดียวกันทั้งสามคือข้อมูลที่ไม่จริง
          และไม่ช่วยหัวหน้าภาคที่ต้องระบุอะไหล่ให้แต่ละเครื่อง
        */}
        {shownRows.map((row, i) => (
          <React.Fragment key={row.key}>
          <MachineCard
            key={row.key}
            row={row}
            index={i}
            total={shownRows.length}
            fromBoard={fromBoard}
            noMachine={noMachine}
            busy={busy}
            models={models}
            capacities={capacities}
            photoRequired={photoRequired}
            adminPhotoOptional={adminPhotoOptional}
            lock={lockOf(row)}
            machinesLoaded={machinesLoaded}
            showParts={showParts}
            partsBrand={partsBrandOf(row)}
            canFixBrand={user?.role === "ADMIN" || user?.role === "SUPERVISOR"}
            onChange={(patch) => patchRow(row.key, patch)}
            onRemove={() => setRows((current) => current.filter((r) => r.key !== row.key))}
            onAddFile={(pick) => addFile(row, pick)}
            onAddNameplate={(pick) => addNameplate(row, pick)}
          />
          <MachineOpenWarning
            order={openOrders.find((o) => {
              const code = (fromBoard ? route.params?.machineCode ?? "" : row.code).trim().toUpperCase();
              return !!code && o.machineCode === code;
            })}
          />
          </React.Fragment>
        ))}

        {!fromBoard && !noMachine ? (
          <TouchableOpacity
            style={styles.addRow}
            onPress={() => setRows((current) => [...current, blankRow()])}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={17} color={colors.primary} />
            <Text style={styles.addRowText}>เพิ่มเครื่องในสาขาเดียวกัน</Text>
          </TouchableOpacity>
        ) : null}

      </View>

      <View style={styles.card}>
        <StepHead n={4} title="ผู้ติดต่อที่สาขา" optional={!strict} />
        {/*
          คนที่สาขาให้ติดต่อ — ช่างโทรหาใครก่อนไปหน้างาน

          เก็บที่ใบงานไม่ใช่ที่สาขา เพราะคนเฝ้าร้านเปลี่ยนตามกะและตามช่วง
          เบอร์ที่ใช้ได้เมื่อสามเดือนก่อนไม่ได้แปลว่าวันนี้โทรไปแล้วเจอคนเดิม
          ระบบเติมค่าจากใบงานล่าสุดของสาขานี้ให้ แก้ทับได้ถ้าเปลี่ยนคน
        */}
        <TextInput
          style={styles.input}
          value={contactName}
          onChangeText={setContactName}
          placeholder="ชื่อคนที่ติดต่อได้ เช่น คุณสมหญิง (ผู้จัดการร้าน)"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="ชื่อผู้ติดต่อที่สาขา"
        />
        <TextInput
          style={[styles.input, { marginTop: spacing.xs }]}
          value={contactPhone}
          onChangeText={setContactPhone}
          placeholder="เบอร์ติดต่อสาขา"
          placeholderTextColor={colors.textFaint}
          keyboardType="phone-pad"
          accessibilityLabel="เบอร์ติดต่อสาขา"
        />

      </View>

      <View style={styles.card}>
        <StepHead n={5} title="ความเร่งด่วน" />
        <View style={styles.options}>
          {priorities.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[styles.option, priority === p.value && styles.optionOn]}
              onPress={() => setPriority(p.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionText, priority === p.value && styles.optionTextOn]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

      </View>

      <View>
        {/*
          จบแค่นี้ — อะไหล่ ช่าง และวันนัด เป็นของขั้นถัดไปตามสายงาน
          ถ้าให้กรอกตรงนี้ด้วย คนเปิดใบงานจะต้องรู้เรื่องที่ยังไม่มีใครรู้
        */}
        <View style={styles.next}>
          <Ionicons name="arrow-forward-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.nextText}>
            {rows.length > 1 ? `จะได้ใบงาน ${rows.length} ใบ เครื่องละใบ — ` : ""}
            เปิดแล้วใบงานจะไปอยู่ที่หัวหน้าภาค{regionHint} เพื่อระบุอะไหล่ที่ต้องใช้
            {/* อะไหล่ที่ช่างเลือกตอนเปิดใบไม่ผ่านการคอนเฟิร์ม/ตีกลับ (ข้อ 1) — บอกให้รู้ว่าเป็นแค่ข้อเสนอ ไม่ใช่รายการสุดท้าย */}
            {showParts && shownRows.some((r) => r.parts.length > 0)
              ? " — อะไหล่ที่เลือกเป็นข้อเสนอ ขึ้นในฟอร์มให้หัวหน้าภาคแก้ต่อได้ · "
              : " "}
            จากนั้นแอดมินเช็คคลัง หัวหน้าภาคจ่ายงานพร้อมวัน แอดมินโทรคอนเฟิร์มลูกค้า หัวหน้าภาคยืนยันออกงาน แล้วทีมช่างเข้างาน
          </Text>
        </View>

        {missing.length ? (
          <View style={styles.missing} accessibilityLabel={`ยังบันทึกไม่ได้ ขาด ${missing.length} ช่อง`}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.dangerInk} />
            <Text style={styles.missingText}>
              ยังบันทึกไม่ได้ — ขาด {missing.length} ช่อง: {missing.join(" · ")}
              {missing.includes("อาการที่พบ") ? `\nอาการต้องยาวอย่างน้อย ${AREA_SYMPTOM_MIN} ตัวอักษร` : ""}
              {missing.includes("รูปหน้างาน") ? "\nแนบรูปหน้างานอย่างน้อย 1 รูปต่อเครื่อง" : ""}
              {missing.includes("เบอร์ติดต่อสาขา") ? "\nเบอร์ 9–10 หลัก" : ""}
            </Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.submit, (saving || missing.length > 0) && styles.submitOff]}
          onPress={submit}
          disabled={saving || missing.length > 0}
          activeOpacity={0.8}
        >
          {saving ? (
            <>
              <Spinner color="#fff" />
              {busy ? <Text style={styles.submitText}>{busy}</Text> : null}
            </>
          ) : (
            <>
              <Ionicons name="clipboard-outline" size={18} color="#fff" />
              <Text style={styles.submitText}>
                {rows.length > 1 ? `เปิดใบงาน ${rows.length} ใบ` : "เปิดใบงาน"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
    {dupOrders ? (
      <DuplicateConfirmModal
        orders={dupOrders}
        sameCodes={
          fromBoard
            ? [(route.params?.machineCode ?? "").trim().toUpperCase()].filter(Boolean)
            : noMachine
              ? []
              : shownRows.map((r) => r.code.trim().toUpperCase()).filter(Boolean)
        }
        branch={`${branchCode.trim()}${branchName ? ` ${branchName}` : ""}`}
        opening={[
          fromBoard
            ? route.params?.machineCode ? `เครื่อง ${route.params.machineCode}` : null
            : noMachine
              ? "งานทั้งสาขา (ไม่ระบุเครื่อง)"
              : shownRows.map((r) => r.code.trim().toUpperCase()).filter(Boolean).length
                ? `เครื่อง ${shownRows.map((r) => r.code.trim().toUpperCase()).filter(Boolean).join(", ")}`
                : "ไม่ระบุเครื่อง",
          rows[0]?.symptom.trim() || null,
        ]
          .filter(Boolean)
          .join(" · ")}
        onBack={() => setDupOrders(null)}
        onView={(id) => {
          // ไปดูใบเดิมแล้วกลับมา ฟอร์มยังอยู่ครบ — กดบันทึกใหม่ก็ถามใหม่
          setDupOrders(null);
          navigation.push("WorkOrderDetail", { id });
        }}
        onConfirm={() => {
          setDupOrders(null);
          dupConfirmed.current = true;
          submit();
        }}
      />
    ) : null}
    </PopupScreen>
  );
}

/**
 * วันเปิดร้านกับสถานะประกันของสาขาที่เลือก
 *
 * อยู่ในฟอร์มตั้งแต่ตอนเปิดใบงาน ไม่ใช่ไปโผล่ในใบงานทีหลัง เพราะประกันเป็นตัว
 * ตัดสินว่าจะส่งช่างของเราไปหรือให้ผู้ขายรับผิดชอบ ซึ่งควรรู้ตั้งแต่ตอนเปิด
 *
 * รหัสขึ้นต้นด้วย C คือสาขาบริษัท เครื่องเป็นของบริษัทเอง ไม่มีประกันให้พูดถึง
 */
function BranchFacts({
  code,
  openedAt,
  warrantyExpiresAt,
  warranties = [],
}: {
  code: string;
  openedAt: string | null;
  warrantyExpiresAt: string | null;
  warranties?: Warranty[];
}) {
  const isCompany = code.trim().toUpperCase().startsWith("C");
  const expired = warrantyExpiresAt ? new Date(warrantyExpiresAt).getTime() < Date.now() : null;

  if (!openedAt && (isCompany || !warrantyExpiresAt)) {
    return isCompany ? (
      <Text style={styles.branchFact}>สาขาบริษัท — ไม่มีประกัน</Text>
    ) : (
      <Text style={styles.branchFact}>ยังไม่ได้บันทึกวันเปิดร้านและวันหมดประกัน</Text>
    );
  }

  return (
    <View style={styles.branchFacts}>
      {openedAt ? (
        <Text style={styles.branchFact}>เปิดร้าน {formatDate(openedAt)}</Text>
      ) : null}
      {isCompany ? (
        <Text style={styles.branchFact}>สาขาบริษัท — ไม่มีประกัน</Text>
      ) : warranties.length > 1 ? (
        // หลายยี่ห้อในสาขาเดียว ประกันหมดไม่พร้อมกัน (Oasis 2 ปี · อื่น ๆ 3 ปี) — แยกบรรทัดให้เห็นว่าเครื่องไหนหมดแล้ว
        warranties.map((w) => {
          const out = w.expiresAt ? new Date(w.expiresAt).getTime() < Date.now() : null;
          return (
            <Text key={w.brand} style={[styles.branchFact, out ? styles.warrantyOut : styles.warrantyIn]}>
              {w.brand}
              {w.years ? ` (${w.years} ปี)` : ""} · {out ? "หมดประกันแล้ว" : "ยังอยู่ในประกัน"}
              {w.expiresAt ? ` · ถึง ${formatDate(w.expiresAt)}` : ""}
            </Text>
          );
        })
      ) : warrantyExpiresAt ? (
        <Text style={[styles.branchFact, expired ? styles.warrantyOut : styles.warrantyIn]}>
          {expired ? "หมดประกันแล้ว" : "ยังอยู่ในประกัน"} · ถึง {formatDate(warrantyExpiresAt)}
          {warranties[0]?.years ? ` (${warranties[0].brand} ${warranties[0].years} ปี)` : ""}
        </Text>
      ) : (
        <Text style={styles.branchFact}>ยังไม่ได้บันทึกวันหมดประกัน</Text>
      )}
    </View>
  );
}

/**
 * ขนาดเครื่องเป็นกิโลกรัม
 *
 * เป็นปุ่มกดไม่ใช่ช่องพิมพ์ เพราะคนกรอกอยู่หน้างานถือมือถือข้างเดียว และขนาด
 * ที่มีจริงมีไม่กี่ค่า — แต่เปิดทาง "อื่นๆ" ไว้ให้พิมพ์เลขที่ไม่อยู่ในรายการ
 * ไม่ได้ปิดตายเหมือนรายการรุ่น ด้วยเหตุผลที่เขียนไว้ที่ FALLBACK_CAPACITIES
 *
 * กดค้ำไว้แล้วกดซ้ำคือเอาออก ไม่ต้องมีปุ่ม "ล้าง" อีกปุ่ม — ขนาดไม่บังคับ
 * และคนที่กดผิดแล้วหาทางยกเลิกไม่ได้จะปล่อยค่าผิดไว้แทนที่จะเว้นว่าง
 */
function CapacityPicker({
  row,
  index,
  capacities,
  onChange,
  big,
}: {
  row: MachineRow;
  index: number;
  capacities: number[];
  onChange: (patch: Partial<MachineRow>) => void;
  /** ใช้หัวข้อตัวใหญ่แบบทางกระดาน ซึ่งไม่มีการ์ดเครื่องครอบอยู่ */
  big?: boolean;
}) {
  const options = [...capacities.map(String), CAPACITY_OTHER];
  return (
    <>
      <Text style={big ? styles.label : styles.subLabel}>ขนาดเครื่อง (ไม่บังคับ)</Text>
      <View style={styles.options}>
        {options.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.option, row.capacity === c && styles.optionOn]}
            onPress={() =>
              onChange(
                row.capacity === c
                  ? { capacity: "", capacityOther: "" }
                  : { capacity: c, ...(c === CAPACITY_OTHER ? {} : { capacityOther: "" }) }
              )
            }
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, row.capacity === c && styles.optionTextOn]}>
              {c === CAPACITY_OTHER ? c : `${c} kg`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {row.capacity === CAPACITY_OTHER ? (
        <TextInput
          style={[styles.input, { marginTop: spacing.xs }]}
          value={row.capacityOther}
          onChangeText={(v) => onChange({ capacityOther: v.replace(/[^0-9]/g, "") })}
          placeholder="พิมพ์ขนาดเป็นกิโลกรัม เช่น 17"
          placeholderTextColor={colors.textFaint}
          keyboardType="number-pad"
          accessibilityLabel={`ขนาดเครื่องที่ ${index + 1}`}
        />
      ) : null}
    </>
  );
}

/**
 * เครื่องหนึ่งตัวกับอาการของมัน — เท่ากับใบงานหนึ่งใบที่จะถูกเปิด
 *
 * ทางที่เปิดจากกระดานไม่มีช่องรหัสเครื่องกับรุ่น เพราะเครื่องมาจากเคสแล้ว
 */
function MachineCard({
  row,
  index,
  total,
  fromBoard,
  noMachine,
  busy,
  models,
  capacities,
  photoRequired = false,
  adminPhotoOptional = false,
  lock,
  machinesLoaded,
  showParts,
  partsBrand,
  canFixBrand,
  onChange,
  onRemove,
  onAddFile,
  onAddNameplate,
}: {
  row: MachineRow;
  index: number;
  total: number;
  fromBoard: boolean;
  /** งานที่ไม่ระบุเครื่อง (อุปกรณ์ร้าน · PM ทั้งร้าน) — ไม่มีหมายเลขเครื่อง รุ่น ขนาด ป้ายรุ่น */
  noMachine?: boolean;
  busy: string | null;
  models: string[];
  capacities: number[];
  /** Area Team ต้องแนบรูปหน้างานอย่างน้อย 1 รูป — ป้ายไม่ควรบอกว่าไม่บังคับ */
  photoRequired?: boolean;
  /** แอดมินเปิดใบได้โดยไม่มีรูป — ป้ายบอกว่าไม่บังคับเฉพาะแอดมิน และชวนให้แนบถ้ามีรูปจากสาขา */
  adminPhotoOptional?: boolean;
  /** ยี่ห้อที่ระบบรู้แล้วของเครื่องนี้ — มี = ปุ่มยี่ห้อล็อก (แก้ได้ที่หน้าใบงานเท่านั้น) */
  lock: { make: string; file: string } | null;
  /** รายการเครื่องของสาขาโหลดเสร็จแล้ว — "ในระบบยังไม่รู้ยี่ห้อ" พูดได้เฉพาะตอนรู้จริง */
  machinesLoaded: boolean;
  /** ช่อง "อะไหล่ที่ต้องใช้" (ช่าง/Senior ช่าง) */
  showParts: boolean;
  partsBrand: PartsBrand;
  /** หัวหน้าภาค/แอดมินแก้ยี่ห้อเองได้ที่หน้าใบงาน — บรรทัดใต้ปุ่มล็อกบอกทางที่คนนั้นทำได้จริง */
  canFixBrand: boolean;
  onChange: (patch: Partial<MachineRow>) => void;
  onRemove: () => void;
  onAddFile: (
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | PickedAttachment[] | null>
  ) => void;
  onAddNameplate: (
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | PickedAttachment[] | null>
  ) => void;
}) {
  const code = row.code.trim().toUpperCase();
  // W = เครื่องซัก · D = เครื่องอบ ตัวอักษรหน้าบอกชนิดเครื่องในตัว
  const badCode = code.length > 0 && !/^[WD]\d{1,4}$/.test(code);
  const validCode = MACHINE_CODE_PATTERN.test(code);
  // รหัสเครื่องที่ใช้ในข้อความ — ทางกระดานไม่มีช่องรหัส ใช้รหัสที่ติดมากับเคส
  const machineCode = partsBrand.machineCode ?? code;
  // เครื่องที่ระบบรู้จักแล้วแต่ไม่รู้ยี่ห้อ หรือเครื่องรหัสใหม่ (ระบบสร้างให้ตอนเปิดใบ) — ยังไม่ได้กดยี่ห้อ
  const askBrand = !fromBoard && machinesLoaded && validCode && !lock && !resolvedModel(row);

  /**
   * ช่องยี่ห้อเครื่อง — รู้ยี่ห้อแล้ว = ปุ่มเดียวแบบล็อก (จอ ก) · ยังไม่รู้ = ปุ่มยี่ห้อ + "อื่นๆ" แล้วพิมพ์ (จอ ข)
   * ล็อกเพราะยี่ห้อตัดสินไฟล์อะไหล่ อายุประกัน และการเสนอราคา — กดผิดปุ่มเดียวจากฟอร์มเปิดใบ เครื่องเปลี่ยนไฟล์เงียบ ๆ
   * แก้ยี่ห้อที่รู้แล้วได้ทางเดียวคือ "แก้ยี่ห้อเครื่อง" ที่หน้าใบงาน (หัวหน้าภาค/แอดมิน · ลงประวัติ)
   * ปุ่มของฟอร์มนี้ไม่ใช้ BrandChips ตรง ๆ เพราะค่าที่เลือกอยู่ในแถว (model/modelOther) ร่วมกับร่างฟอร์ม
   */
  const brandField = (otherLabel: string) =>
    lock ? (
      <>
        <BrandChips value={null} onChange={() => {}} label={null} machineCode={machineCode} locked={{ make: lock.make }} />
        <Text style={styles.brandNote}>
          {canFixBrand
            ? "ไม่ตรงกับเครื่องจริง? เปิดใบงานแล้วกด “แก้ยี่ห้อเครื่อง” ที่หน้าใบงาน"
            : "ไม่ตรงกับเครื่องจริง? ถ่ายป้ายเครื่องแล้วเขียนในอาการที่พบ — หัวหน้าภาคแก้ยี่ห้อเครื่องให้"}
        </Text>
      </>
    ) : (
      <>
        <View style={styles.options}>
          {[...models, MODEL_OTHER].map((m) => {
            const on = row.model === m;
            return (
              <TouchableOpacity
                key={m}
                style={[styles.option, on && styles.optionOn]}
                onPress={() => onChange({ model: m })}
                activeOpacity={0.7}
                accessibilityState={{ selected: on }}
                // เว็บไม่แปลง accessibilityState เป็น aria-selected (CLAUDE.md) — ใส่เอง เทสต์เบราว์เซอร์จะอ่านได้ว่ากดยี่ห้อไหนอยู่
                aria-selected={on}
              >
                <Text style={[styles.optionText, on && styles.optionTextOn]}>{m}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {row.model === MODEL_OTHER ? (
          <TextInput
            style={[styles.input, { marginTop: spacing.xs }]}
            value={row.modelOther}
            onChangeText={(v) => onChange({ modelOther: v })}
            placeholder="พิมพ์ชื่อยี่ห้อ"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={otherLabel}
          />
        ) : null}
      </>
    );

  const partsMake = partsBrand.make;

  return (
    <View style={[styles.machineCard, (fromBoard || noMachine) && styles.machineCardFlat]}>
      {!fromBoard && !noMachine ? (
        <View style={styles.machineHead}>
          <Text style={styles.machineTitle}>
            {total > 1 ? `เครื่องที่ ${index + 1}` : "เครื่อง"}
          </Text>
          <View style={{ flex: 1 }} />
          {total > 1 ? (
            <TouchableOpacity
              onPress={onRemove}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`ลบเครื่องที่ ${index + 1}`}
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {!fromBoard && !noMachine ? (
        <>
          <Text style={styles.subLabel}>หมายเลขเครื่อง</Text>
          <TextInput
            style={[styles.input, badCode && styles.inputBad]}
            value={row.code}
            onChangeText={(v) => onChange({ code: v.toUpperCase() })}
            placeholder={
              total > 1 ? "เช่น W3 หรือ D12" : "เช่น W3 หรือ D12 — เว้นว่างถ้าเป็นงานทั้งสาขา"
            }
            placeholderTextColor={colors.textFaint}
            autoCapitalize="characters"
            accessibilityLabel={`หมายเลขเครื่องที่ ${index + 1}`}
          />
          <FieldHint
            err={badCode ? "ต้องเป็น W หรือ D ตามด้วยตัวเลข เช่น W3 หรือ D12" : null}
            ok={code.length > 0 ? `รูปแบบถูกต้อง — ${code.startsWith("W") ? "เครื่องซัก" : "เครื่องอบ"}` : null}
            hint="W = เครื่องซัก · D = เครื่องอบ"
          />

          {askBrand ? (
            <Text style={styles.unknownBrand}>
              เครื่อง {code} ในระบบยังไม่รู้ยี่ห้อ — เลือกยี่ห้อเครื่องด้านล่าง (ดูที่ป้ายเครื่อง)
            </Text>
          ) : null}

          <Text style={styles.subLabel}>ยี่ห้อเครื่อง</Text>
          {brandField(`ชื่อยี่ห้อของเครื่องที่ ${index + 1}`)}

          <CapacityPicker row={row} index={index} capacities={capacities} onChange={onChange} />

          {/*
            รูปป้ายรุ่นบนตัวเครื่อง ไม่บังคับ — เป็นที่มาของรุ่นที่เลือกไว้
            เอาไว้ย้อนดูตอนสงสัยว่าใส่รุ่นถูกหรือเปล่า ซึ่งเกิดขึ้นตอนสั่งอะไหล่
            แล้วของมาไม่ตรง ไม่ใช่ตอนเปิดใบงาน
          */}
          <FileDropZone
            hint="รูปป้ายรุ่น 1 รูป"
            disabled={!!busy}
            label={`วางรูปป้ายรุ่นของเครื่องที่ ${index + 1}`}
            // ป้ายรุ่นช่องเดียวต่อเครื่อง — ลากมาหลายรูปเก็บรูปแรก
            onFiles={(files) => onAddNameplate((stage) => filesToAttachments(files.slice(0, 1), { image: true, doc: true }, stage))}
          >
            <Text style={styles.subLabel}>รูปป้ายรุ่น (ไม่บังคับ)</Text>
            {row.nameplate ? (
              <View style={styles.files}>
                <View style={styles.file}>
                  {row.nameplate.thumbnailUri ? (
                    <Image source={{ uri: row.nameplate.thumbnailUri }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbBlank]}>
                      <Ionicons name="image-outline" size={24} color={colors.textFaint} />
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.removeFile}
                    onPress={() => onChange({ nameplate: null })}
                    activeOpacity={0.7}
                    accessibilityLabel={`ลบรูปป้ายรุ่นของเครื่องที่ ${index + 1}`}
                  >
                    <Ionicons name="close" size={13} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : busy ? null : (
              <View style={styles.fileButtons}>
                {Platform.OS !== "web" ? (
                  <TouchableOpacity
                    style={styles.fileButton}
                    onPress={() => onAddNameplate((stage) => pickImageAttachment(true, stage, { doc: true }))}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="camera-outline" size={16} color={colors.primary} />
                    <Text style={styles.fileButtonText}>ถ่ายป้ายรุ่น</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.fileButton}
                  onPress={() => onAddNameplate((stage) => pickImageAttachment(false, stage, { doc: true }))}
                  activeOpacity={0.8}
                >
                  <Ionicons name="images-outline" size={16} color={colors.primary} />
                  <Text style={styles.fileButtonText}>เลือกรูปป้ายรุ่น</Text>
                </TouchableOpacity>
              </View>
            )}
          </FileDropZone>
        </>
      ) : null}

      {/*
        เปิดจากกระดาน — เครื่องมาจากเคสแล้ว แต่รุ่นกับขนาดเคสไม่รู้

        เคสมาจากไฟล์รายงานซึ่งบอกแต่ว่าเครื่องไหนดับ ไม่ได้บอกว่ารุ่นอะไร
        กี่กิโล คนที่ตอบได้คือคนที่ยืนอยู่หน้าเครื่องตอนเปิดใบงาน ซึ่งคือตอนนี้
        — เคยไม่มีช่องให้กรอกเลย ค่าพวกนี้จึงว่างตลอดในใบที่เปิดจากกระดาน

        ส่วนใหญ่จะขึ้นให้แล้วจากที่เคยกรอกไว้ครั้งก่อน เหลือแค่ดูว่าตรงไหม
      */}
      {fromBoard ? (
        <>
          {/* ล็อกแบบเดียวกับฟอร์มปกติ — อะไหล่ที่รอบนกระดานต้องเทียบกับยี่ห้อ ถ้ายังไม่รู้ยี่ห้อเซิร์ฟเวอร์บอกเองตอนกดเปิด (D8) */}
          <Text style={styles.label}>{lock ? "ยี่ห้อเครื่อง" : "ยี่ห้อเครื่อง (ไม่บังคับ)"}</Text>
          {brandField("ชื่อยี่ห้อเครื่อง")}

          <CapacityPicker row={row} index={index} capacities={capacities} onChange={onChange} big />
        </>
      ) : null}

      <Text style={fromBoard ? styles.label : styles.subLabel}>อาการที่พบ</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={row.symptom}
        onChangeText={(v) => onChange({ symptom: v })}
        placeholder="เช่น ประตูไม่ล็อก / บอร์ดควบคุมไหม้"
        placeholderTextColor={colors.textFaint}
        multiline
        numberOfLines={2}
        accessibilityLabel={`อาการที่พบของเครื่องที่ ${index + 1}`}
      />

      {/*
        รูปหน้างานแนบได้ตั้งแต่ตอนเปิด ไม่ต้องรอเปิดใบงานเสร็จแล้วค่อยเข้าไปแนบ
        เพราะคนที่เปิดใบงานมักยืนอยู่หน้าเครื่องพอดี ถ้าให้ไปแนบทีหลัง
        กว่าจะกลับมาก็ออกจากร้านแล้ว แล้วรูปนั้นก็ไม่เคยถูกแนบ

        ไฟล์ยังไม่ถูกส่งตอนนี้ รอจนใบงานถูกบันทึกและได้เลขก่อน
      */}
      <FileDropZone
        hint="รูป · วิดีโอ"
        disabled={!!busy}
        label={`วางรูปหน้างานของเครื่องที่ ${index + 1}`}
        onFiles={(files) => onAddFile((stage) => filesToAttachments(files, { image: true, video: true }, stage))}
      >
        {adminPhotoOptional ? (
          <View style={styles.photoHead}>
            <Text style={[fromBoard ? styles.label : styles.subLabel, styles.photoHeadText]}>รูป / วิดีโอหน้างาน</Text>
            <Text style={styles.adminChip}>แอดมินไม่บังคับ</Text>
          </View>
        ) : (
          <Text style={fromBoard ? styles.label : styles.subLabel}>รูป / วิดีโอหน้างาน {photoRequired ? "(อย่างน้อย 1 รูป)" : "(ไม่บังคับ)"}</Text>
        )}
        {row.files.length > 0 ? (
          <View style={styles.files}>
            {row.files.map((file, n) => (
              <View key={`${file.name}-${n}`} style={styles.file}>
                {file.thumbnailUri ? (
                  <Image source={{ uri: file.thumbnailUri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbBlank]}>
                    <Ionicons
                      name={attachmentIcon(file.kind)}
                      size={24}
                      color={colors.textFaint}
                    />
                  </View>
                )}
                {file.kind === "VIDEO" ? (
                  <View style={styles.playBadge}>
                    <Ionicons name="play" size={12} color="#fff" />
                  </View>
                ) : null}
                <TouchableOpacity
                  style={styles.removeFile}
                  onPress={() => onChange({ files: row.files.filter((_, k) => k !== n) })}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={13} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        {busy ? (
          <View style={styles.busyRow}>
            <Spinner color={colors.primary} size="small" />
            <Text style={styles.busyText}>{busy}…</Text>
          </View>
        ) : (
          <View style={styles.fileButtons}>
            {/* กล้องเฉพาะบนมือถือ — คนที่เปิดจากคอมพิวเตอร์คือแอดมินที่นั่งโต๊ะ */}
            {Platform.OS !== "web" ? (
              <TouchableOpacity
                style={styles.fileButton}
                onPress={() => onAddFile((stage) => pickImageAttachment(true, stage))}
                activeOpacity={0.8}
              >
                <Ionicons name="camera-outline" size={16} color={colors.primary} />
                <Text style={styles.fileButtonText}>ถ่ายรูป</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.fileButton}
              onPress={() => onAddFile(pickImageAttachments)}
              activeOpacity={0.8}
            >
              <Ionicons name="images-outline" size={16} color={colors.primary} />
              <Text style={styles.fileButtonText}>เลือกรูป</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.fileButton}
              onPress={() => onAddFile(pickVideoAttachments)}
              activeOpacity={0.8}
            >
              <Ionicons name="videocam-outline" size={16} color={colors.primary} />
              <Text style={styles.fileButtonText}>วิดีโอ</Text>
            </TouchableOpacity>
          </View>
        )}
        {!busy ? <DropHint /> : null}
        {adminPhotoOptional && !busy && row.files.length === 0 ? (
          <View style={styles.adminNote}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primaryInk} />
            <Text style={styles.adminNoteText}>
              ไม่มีรูปก็เปิดใบงานได้ — ถ้าสาขาส่งรูปมาทาง LINE แนบไว้ด้วย หัวหน้าภาคจะระบุอะไหล่ได้โดยไม่ต้องโทรถามร้าน
            </Text>
          </View>
        ) : null}
      </FileDropZone>

      {/*
        อะไหล่ที่ต้องใช้ (ช่าง/Senior ช่าง · ไม่บังคับ — เจ้าของงานตอบข้อ 1/4 ต.ค. 69) — ข้อเสนอ ลงเป็นอะไหล่ที่รอ
        หัวหน้าภาคแก้ต่อในฟอร์มระบุอะไหล่เดิม ไม่มีคอนเฟิร์ม/ตีกลับ (ตอนเปิดใบยังไม่มีทีมช่าง ตีกลับไปหาใครไม่ได้)
        ล็อกตามไฟล์ยี่ห้อเหมือนข้อ 5 ของฟอร์มตรวจหน้างาน: ไม่มีรหัสเครื่อง = เลือกไม่ได้ (จอ ค · ข้อ 22) ·
        ยังไม่รู้ยี่ห้อ = กดยี่ห้อด้านบนก่อน (จอ ข) · ไม่มีทาง "ค้นทุกไฟล์ไปก่อน" (ข้อ 17)
        อยู่ท้ายการ์ดหลังรูป — อาการกับรูปคือสิ่งที่หัวหน้าภาคใช้ตัดสินอะไหล่ ไม่แทรกกลางระหว่างสองอย่างนั้น
      */}
      {showParts ? (
        <View>
          <Text style={styles.subLabel}>อะไหล่ที่ต้องใช้ (ไม่บังคับ)</Text>
          {!validCode ? (
            row.parts.length ? (
              // ลบรหัสเครื่องทั้งที่เลือกอะไหล่ไว้แล้ว — โชว์รายการให้เอาออกเองได้ ไม่ทิ้งเงียบ ๆ (validate กันปุ่มเปิดใบไว้)
              <PartPicker
                label={null}
                parts={row.parts}
                onChange={(parts) => onChange({ parts })}
                brand={{ machine: false, make: null, file: null, machineCode: null }}
                strict
                noMachineText="ใส่หมายเลขเครื่องก่อนจึงเลือกอะไหล่ได้ — หรือเอาอะไหล่ที่เลือกไว้ออก"
              />
            ) : (
              <View style={styles.partsLock}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.partsLockTitle}>ใส่หมายเลขเครื่องก่อน</Text>
                  <Text style={styles.partsLockText}>อะไหล่ที่เลือกได้ขึ้นกับยี่ห้อของเครื่อง</Text>
                  <Text style={styles.partsLockText}>
                    งานทั้งสาขา (ไม่ใส่เครื่อง): หัวหน้าภาคระบุอะไหล่ที่ขั้นถัดไปเหมือนเดิม
                  </Text>
                </View>
              </View>
            )
          ) : !partsBrand.file || !partsMake ? (
            <View style={styles.partsLock}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.partsLockTitle}>เลือกยี่ห้อเครื่องก่อน</Text>
                <Text style={styles.partsLockText}>
                  ระบบใช้ยี่ห้อนี้หาไฟล์อะไหล่ และจำไว้กับเครื่อง {machineCode} — ครั้งหน้าไม่ต้องเลือกอีก
                </Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.partsHint}>ยังบอกไม่ได้ว่าต้องใช้ตัวไหน เว้นว่างได้ — หัวหน้าภาคจะเป็นคนระบุแทน</Text>
              <PartPicker
                label={null}
                parts={row.parts}
                onChange={(parts) => onChange({ parts })}
                brand={partsBrand}
                strict
                verb="เปิดใบงาน"
                saveWhen="ตอนเปิดใบงาน"
                noResultHints={[
                  "ตัวที่ต้องใช้ไม่มีในไฟล์นี้: เขียนชื่อไว้ในอาการที่พบ หัวหน้าภาคจะตัดสินใจต่อ",
                  lock
                    ? "ยี่ห้อในระบบไม่ตรงกับเครื่องจริง? ถ่ายป้ายเครื่องแล้วเขียนในอาการที่พบ — หัวหน้าภาคแก้ยี่ห้อเครื่องให้"
                    : "กดยี่ห้อผิด? เปลี่ยนที่ปุ่มยี่ห้อเครื่องด้านบน (ดูที่ป้ายเครื่อง)",
                ]}
              />
              {/* ยี่ห้อที่เพิ่งกดถูกจำไว้กับเครื่องตอนเปิดใบ (rememberMachineSpec) — บอกก่อน ครั้งหน้าจะเป็นปุ่มล็อก */}
              {!lock ? (
                <Text style={styles.willSave}>
                  {models.includes(partsMake)
                    ? `จะบันทึกยี่ห้อ ${partsMake} ให้เครื่อง ${machineCode} ตอนเปิดใบงาน`
                    : `จะบันทึกยี่ห้อที่พิมพ์ให้เครื่อง ${machineCode} ตอนเปิดใบงาน`}
                </Text>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** หัวการ์ดขั้น: วงกลมเลขสีกรมท่า + ชื่อขั้น แบบ step-card ของ OTTERI */
function StepHead({ n, title, optional }: { n: number; title: string; optional?: boolean }) {
  return (
    <View style={styles.stepHead}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
      {optional ? <Text style={styles.stepOptional}>ไม่บังคับ</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stepHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  stepNum: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.navyFill,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { color: "#fff", fontSize: 15, lineHeight: 22, fontWeight: "800" },
  stepTitle: { fontSize: 17, lineHeight: 26, fontWeight: "800", color: colors.text },
  stepOptional: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: "700",
    color: colors.textMuted,
    backgroundColor: colors.tile,
    borderRadius: 999,
    paddingHorizontal: 8,
  },
  stepDesc: { fontSize: 13, lineHeight: 20, color: colors.textMuted, marginTop: -6, marginBottom: spacing.sm },
  machineCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.background,
  },
  machineCardFlat: {
    borderWidth: 0,
    padding: 0,
    backgroundColor: "transparent",
  },
  machineHead: { flexDirection: "row", alignItems: "center", marginBottom: spacing.xs },
  machineTitle: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  inputBad: invalidInput,
  subLabel: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.primary,
  },
  addRowText: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.primary },

  jobHint: { fontSize: 11, lineHeight: 19, color: colors.textFaint, marginTop: spacing.xs },
  next: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
  nextText: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.textMuted },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  fromBoard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  fromBoardText: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.primaryDark },
  label: {
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  multiline: { minHeight: 84, textAlignVertical: "top" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  results: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultCode: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  resultName: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.textMuted },
  chosen: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chosenBody: { flex: 1, minWidth: 0 },
  chosenText: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.primaryDark },
  chosenName: { fontSize: 12, lineHeight: 20, color: colors.primaryDark },
  branchFacts: { gap: 2, marginTop: spacing.xs },
  branchFact: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  warrantyIn: { color: colors.success, fontWeight: "600" },
  warrantyOut: { color: colors.danger, fontWeight: "600" },
  files: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  file: { position: "relative" },
  thumb: { width: 88, height: 88, borderRadius: radius.sm, backgroundColor: colors.background },
  thumbBlank: { alignItems: "center", justifyContent: "center" },
  playBadge: {
    position: "absolute",
    left: spacing.xs,
    bottom: spacing.xs,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: "rgba(15,23,42,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeFile: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  fileButtons: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  fileButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
  },
  fileButtonText: { fontSize: 13, lineHeight: 21, fontWeight: "600", color: colors.primary },
  busyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  busyText: { fontSize: 13, lineHeight: 21, color: colors.textMuted },
  options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  optionOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  optionText: { fontSize: 13, lineHeight: 21, color: colors.textMuted, fontWeight: "600" },
  optionTextOn: { color: colors.primaryDark },
  error: { fontSize: 13, lineHeight: 21, color: colors.danger, marginTop: spacing.lg },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.navyFill,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
  },
  submitOff: { opacity: 0.6 },
  missing: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  missingText: { flex: 1, fontSize: 13, lineHeight: 21, color: colors.dangerInk },
  photoHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.md, marginBottom: spacing.xs },
  // ระยะบน/ล่างอยู่ที่แถว ไม่ใช่ที่ข้อความ — ป้ายข้างข้อความจะได้อยู่บรรทัดเดียวกันพอดี
  photoHeadText: { marginTop: 0, marginBottom: 0 },
  adminChip: {
    fontSize: 11,
    lineHeight: 18,
    fontWeight: "700",
    color: colors.roleAdmin,
    backgroundColor: colors.roleAdminSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    overflow: "hidden",
  },
  adminNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
  },
  adminNoteText: { flex: 1, fontSize: 12.5, lineHeight: 20, color: colors.primaryInk },
  // ป้ายเหลือง "เครื่อง … ในระบบยังไม่รู้ยี่ห้อ" ใต้ช่องรหัส (จอ ข ของตัวอย่าง)
  unknownBrand: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSoft,
    color: colors.warningInk,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  brandNote: { fontSize: 12, lineHeight: 18, color: colors.textMuted, marginTop: spacing.xs },
  partsHint: { fontSize: 12, lineHeight: 18, color: colors.textMuted, marginBottom: spacing.sm },
  partsLock: {
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
  partsLockTitle: { fontSize: 14, lineHeight: 21, fontWeight: "700", color: colors.text },
  partsLockText: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  willSave: { fontSize: 12, lineHeight: 18, fontWeight: "600", color: colors.successInk, marginTop: spacing.xs },
  submitText: { color: "#fff", fontSize: 15, lineHeight: 24, fontWeight: "700" },
});
