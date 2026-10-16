/**
 * ใบงานหนึ่งใบ — ที่ช่างรับงานและปิดงาน
 *
 * ปิดใบงานไม่ได้ปิดเคสบนกระดาน เพราะเคสปิดตอนเครื่องหายไปจากไฟล์เท่านั้น
 * หน้านี้จึงเตือนตรงๆ ตอนปิดว่าเครื่องยังไม่กลับมา ไม่ใช่ปล่อยให้เข้าใจผิด
 * ว่ากดปิดแล้วจบ
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import StepPulse from "../components/StepPulse";
import { UrgentBadge, UrgentGlow } from "../components/Urgent";
import ImageViewer from "../components/ImageViewer";
import AppModal, { ModalRow } from "../components/AppModal";
import PopupScreen from "../components/PopupScreen";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { openUrl } from "../utils/share";
import { showAlert } from "../utils/alert";
import PartPicker, { PickedPart } from "../components/PartPicker";
import DateField, { thaiDate } from "../components/DateField";
import TimeField, { isTime } from "../components/TimeField";
import Dropdown from "../components/Dropdown";
import TimelineModal, { TimelineButton } from "../components/TimelineModal";
import BackfillCloseModal, { BackfillButton } from "../components/BackfillCloseModal";
import WorkOrderAttachments, { Attachment } from "../components/WorkOrderAttachments";
import InspectionSlots, { missingInspection } from "../components/InspectionSlots";
import {
  PickedAttachment,
  pickImageAttachment,
  pickVideoAttachment,
  uploadAttachment,
  attachmentIcon,
  pickPdfAttachment,
} from "../utils/attachments";
import { useAuth } from "../context/AuthContext";
import { HomeStackParamList } from "../navigation/types";
import { colors, radius, shadow, spacing, headingFont } from "../theme";
import { formatDate, formatDateTime, statusTone } from "./WorkOrderListScreen";

type Props = NativeStackScreenProps<HomeStackParamList, "WorkOrderDetail">;

interface LogEntry {
  id: number;
  action: string;
  actionLabel: string;
  /** ขั้นที่ใบงานไปอยู่หลังรายการนี้ — แยกคอนเฟิร์มนัดตรวจ (→ INSPECTING) ออกจากนัดซ่อม (→ ASSIGNED) */
  status: string;
  statusLabel: string;
  note: string | null;
  byName: string | null;
  /** บทบาทของคนกด — ประวัติใช้ติดป้ายและสีจุด */
  byRole: string | null;
  createdAt: string;
}

interface WorkOrder {
  id: number;
  code: string;
  source: string;
  /** ใบทดสอบที่คัดลอกจากใบจริง — ลบทิ้งเมื่อทดสอบเสร็จ */
  isTest?: boolean;
  title: string;
  detail: string | null;
  status: string;
  statusLabel: string;
  /** URGENT | NORMAL | LOW — URGENT ขึ้นออร่าแดงและป้ายด่วนบนหัวใบงาน */
  priority: string;
  priorityLabel: string;
  branchCode: string;
  branchName: string;
  region: string | null;
  /** ทีมที่ดูแลงาน CM ของสาขานี้ ตามไฟล์ทะเบียนสาขา */
  zone: string | null;
  /** ทีมที่ดูแลงาน PM ของสาขานี้ — ว่างได้ */
  branchPmTeam: string | null;
  /**
   * ทีมที่ควรรับงานใบนี้ ตามประเภทงาน — เซิร์ฟเวอร์คิดมาให้แล้ว
   *
   * งาน PM ไปทีม PM งานอื่นไปทีม CM และสาขาที่ไม่ได้ระบุทีม PM ใช้ทีม CM แทน
   */
  suggestedTeam: string | null;
  branchOpenedAt: string | null;
  // ว่างเมื่อเป็นสาขาบริษัท — เซิร์ฟเวอร์ตัดออกให้แล้ว หน้าจอไม่ต้องตัดสินใจเอง
  branchWarrantyExpiresAt: string | null;
  branchWarrantyExpired: boolean | null;
  /** ประกันกี่ปีตามยี่ห้อเครื่องของใบนี้ — ว่างเมื่อสาขากรอกวันหมดประกันเอง */
  branchWarrantyYears?: number | null;
  /** ยี่ห้อที่ใช้คิดประกัน — จากไฟล์รายงานเครื่อง หรือรุ่นที่เลือกตอนเปิดใบงาน */
  branchWarrantyBrand?: string | null;
  branchIsCompany: boolean;
  machineCode: string | null;
  machineBrand: string | null;
  machineModel: string | null;
  /** ขนาดเครื่องพร้อมหน่วย เช่น "13 kg" — เซิร์ฟเวอร์ประกอบหน่วยมาให้แล้ว */
  machineCapacityLabel: string | null;
  assignedToName: string | null;
  scheduledAt: string | null;
  /** เวลานัด "HH:MM" — ว่าง = นัดเป็นวัน */
  scheduledTime: string | null;
  appointmentStatus: string | null;
  appointmentStatusLabel: string | null;
  /** ผลตรวจหน้างาน — หัวหน้าภาคใช้ระบุอะไหล่รอบถัดไป */
  inspectedAt: string | null;
  inspectionNote: string | null;
  /** รอบตรวจล่าสุดเริ่มเมื่อไหร่ (ส่งทีมไปตรวจครั้งล่าสุด) — ไฟล์ตรวจก่อนหน้านี้ไม่นับ */
  inspectionStartedAt?: string | null;
  /** ใบเดิมที่ใบนี้แยกออกมา (ใบรออะไหล่) */
  parent: LinkedOrder | null;
  /** ใบรออะไหล่ที่แยกออกไปจากใบนี้ */
  children: LinkedOrder[];
  createdByName: string | null;
  createdAt: string;
  closedAt: string | null;
  closedByName: string | null;
  closeResult?: string | null;
  closeResultLabel: string | null;
  closeNote: string | null;
  symptom: string | null;
  workStatus: string | null;
  workStatusLabel: string | null;
  /** ทีมช่างที่รับงาน — งานถูกจ่ายให้ทีม ไม่ได้จ่ายรายคน */
  assignedTeam: string | null;
  /** ช่างรายคนของใบเก่าก่อนเปลี่ยนมาจ่ายเป็นทีม */
  assignedToId: number | null;
  jobType: string;
  jobTypeLabel: string;
  needsParts: boolean | null;
  stageActor: string | null;
  stageActorLabel: string | null;
  waitingParts: StockPart[];
  outageId: number | null;
  outageStillOpen: boolean | null;
  outageEndedAt: string | null;
  /** ปิดงานแล้วอาการหายจริงไหม เทียบกับไฟล์รายงานเครื่อง — null = เทียบไม่ได้ */
  outcomeVerdict: "CLEARED" | "STILL_DOWN" | null;
  outageKind: string | null;
  parts: PickedPart[];
  /** เคยแนบรูปใบเบิก (ใบเหลือง) ไว้แล้วหรือยัง — ใช้อะไหล่แล้วต้องมีถึงจะปิดงานได้ */
  hasRequisitionSlip: boolean;
  /** เคยแนบรูปป้ายรุ่นของรอบนี้แล้วหรือยัง */
  hasNameplate: boolean;
  /** รอบปัจจุบันเริ่มเมื่อไหร่ — ใช้แยกว่าไฟล์ไหนเป็นของรอบที่ปิดงาน */
  roundStartedAt: string | null;
  /** ผู้ติดต่อที่สาขาสำหรับใบงานนี้ */
  contactName: string | null;
  contactPhone: string | null;
  /** งานนี้ต้องเสนอราคาลูกค้าก่อนไหม (สาขาแฟรนไชส์ + ใช้อะไหล่ + หมดประกัน) */
  needsQuote: boolean;
  hasQuote: boolean;
  /** ขั้นรอเบิกอะไหล่ — วันที่คาดว่าของที่หมดจะเข้า */
  partsExpectedAt?: string | null;
  hasReceipt: boolean;
  /** จำนวนรูป/วิดีโอหน้างาน (ไม่นับใบเหลืองกับป้ายรุ่น) — ต้องมีอย่างน้อยหนึ่งถึงจะปิดงานได้ */
  siteFileCount: number;
  /** รูป/วิดีโอก่อนซ่อม · หลังซ่อม ของรอบนี้ที่แนบไว้แล้ว — ปิดงานบังคับอย่างละอย่างน้อยหนึ่ง */
  beforeCount?: number;
  afterCount?: number;
  /** คนที่เข้าไปทำจริง บันทึกตอนปิดงาน */
  workers: Technician[];
  otherWorkers: string | null;
  logs: LogEntry[];
  /** ใบเคลมอะไหล่เก่าทุกรอบ ใหม่สุดก่อน */
  claims: PartClaim[];
  /** หลักฐานเคลมที่แนบไว้แล้วในรอบนี้ — ถูกตีกลับแล้วปิดใหม่ ไม่ต้องแนบซ้ำ */
  claimEvidence: { sparePartId: number | null; role: string }[];
  /** Troubleshooting ที่ยี่ห้อเครื่องใบนี้ต้องทำก่อนเคลม — ว่าง = ไม่บังคับ */
  claimTroubleshooting: string[];
}

interface PartClaim {
  id: number;
  sparePartId: number;
  partCode: string;
  partName: string;
  /** รหัสตัวที่เสียที่ส่งเคลม (ช่างกรอก) — ว่างเฉพาะใบเก่า */
  brokenPartCode: string | null;
  quantity: number;
  brand: string | null;
  model: string | null;
  machineCode: string | null;
  symptom: string;
  checkNote: string;
  troubleshooting: string[];
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

/** หลักฐานของฟอร์มเคลม — ลำดับและชื่อตามหัวข้อในฟอร์มของผู้ขาย (รูป Nameplate ใช้ป้ายรุ่นที่ถ่ายตอนปิดงาน) */
const CLAIM_EVIDENCE: { role: string; label: string; video: boolean }[] = [
  { role: "CLAIM_PART", label: "รูปอะไหล่เก่า", video: false },
  { role: "CLAIM_SYMPTOM", label: "รูปอาการเสีย", video: false },
  { role: "CLAIM_ERROR_VIDEO", label: "วิดีโอ Error code", video: true },
  { role: "CLAIM_CHECK_VIDEO", label: "วิดีโอการตรวจเช็ค", video: true },
];

const CLAIM_STATUS: Record<PartClaim["status"], { label: string; fg: string; bg: string }> = {
  PENDING: { label: "รอตรวจ", fg: colors.warningInk, bg: colors.warningSoft },
  APPROVED: { label: "อนุมัติแล้ว", fg: colors.success, bg: colors.successSoft },
  REJECTED: { label: "ตีกลับ", fg: colors.dangerInk, bg: colors.dangerSoft },
};

interface Team {
  name: string;
  branches: number;
}

interface LinkedOrder {
  id: number;
  code: string;
  status: string;
  statusLabel: string;
}

/** ปุ่มของแต่ละขั้น — ชื่อเดียวกับหัวฟอร์มที่เปิดขึ้นมา */
/** ขั้นที่ผล "หมด" ยังเป็นเรื่องของตอนนี้ — ตรงกับ PARTS_OUT_STAGES ฝั่ง backend */
const PARTS_OUT_STAGES = ["PARTS_SOURCING", "PARTS_REQUESTED", "WAITING_PARTS"];

const STAGE_BUTTON: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  NEW: { label: "ระบุอะไหล่ที่ต้องใช้", icon: "arrow-forward-circle" },
  // แอดมินนัดร้านก่อนช่างไปตรวจ — ฟอร์มเดียวกับคอนเฟิร์มลูกค้าของงานซ่อม
  INSPECT_CONFIRM: { label: "นัดลูกค้า (ตรวจหน้างาน)", icon: "call-outline" },
  INSPECTING: { label: "บันทึกผลตรวจหน้างาน", icon: "search-outline" },
  WAITING_PARTS: { label: "อะไหล่มาแล้ว ส่งต่อให้เบิก", icon: "cube-outline" },
  // หลังรับเงิน (หรือในประกัน) — เบิกจริง ใส่คลัง + เลขใบเบิก ส่งของไปหน้างาน
  PARTS_REQUESTED: { label: "เบิกอะไหล่ส่งหน้างาน", icon: "arrow-forward-circle" },
  // ก่อนเสนอราคา — เช็คว่ามีอะไหล่ไหม มีครบไปเสนอราคา หมดรอของเข้า
  PARTS_SOURCING: { label: "เช็คอะไหล่ (มี / หมด)", icon: "cube-outline" },
  AWAITING_QUOTE: { label: "เสนอราคาลูกค้า", icon: "document-text-outline" },
  AWAITING_PAYMENT: { label: "ลูกค้าจ่ายเงินแล้ว", icon: "cash-outline" },
  // หัวหน้าภาคจ่ายงาน+วัน → แอดมินคอนเฟิร์มลูกค้า → หัวหน้าภาคยืนยันออกงาน (ดู WORK_ORDER_STAGE_ORDER ฝั่ง backend)
  PARTS_CHECKED: { label: "จ่ายงานให้ช่าง", icon: "arrow-forward-circle" },
  AWAITING_CONFIRM: { label: "คอนเฟิร์มลูกค้า", icon: "call-outline" },
  ASSIGNED: { label: "ยืนยันออกงาน", icon: "checkmark-circle-outline" },
};

/** "9 ต.ค. 69 · 10:00 น." — วันนัดเก็บเป็นเที่ยงคืน UTC จึงตัดเอาแค่วันตรง ๆ */
function visitLabel(o: { scheduledAt: string | null; scheduledTime: string | null }) {
  if (!o.scheduledAt) return "—";
  const day = thaiDate(o.scheduledAt.slice(0, 10));
  return o.scheduledTime ? `${day} · ${o.scheduledTime} น.` : day;
}

/**
 * ขั้นที่ใบนี้ไม่ได้ผ่าน — แถบขั้นตอนขึ้นว่า "ข้าม" ไม่ใช่ "ทำแล้ว"
 *
 * "ไม่ต้องทำ" ตัดสินจากกฎวันนี้ ส่วน "ทำไปแล้ว" เป็นของที่เกิดขึ้นจริง
 * ของจริงชนะกฎเสมอ — ใบที่มีใบเสนอราคาแนบอยู่ คือใบที่เสนอราคาไปแล้ว
 *
 * สำคัญกับใบเก่า: กฎประกัน 3 ปีทำให้สาขาแฟรนไชส์ 245 สาขากลับมาอยู่ใน
 * ประกัน ใบที่เคยผ่านขั้นเสนอราคาไปแล้วตอนที่ระบบยังตีว่าหมดประกัน
 * จะกลายเป็น "ไม่ต้องเสนอราคา" ตามกฎใหม่ ถ้าดูแต่กฎ แถบขั้นตอนจะขึ้นว่า
 * ข้ามทั้งที่ทำไปแล้วจริง และมีเอกสารแนบอยู่ในใบนั้น
 */
/** แอดมินนัดร้านให้ไปตรวจหน้างานแล้วอย่างน้อยหนึ่งครั้ง */
function inspectBooked(o: WorkOrder) {
  return o.logs.some((l) => (l.action === "CONFIRMED" || l.action === "RESCHEDULED") && l.status === "INSPECTING");
}

/**
 * ใบเก่าที่หัวหน้าภาคปิดเอง (เครื่องใช้งานได้แล้ว — ปุ่มเอาออกแล้ว ต.ค. 69) — ขั้นที่ใบงานรออยู่และขั้นที่ยังไปไม่ถึงตอนปิดไม่มีใครทำ
 * ต้องขึ้นว่าข้าม ไม่ใช่ติ๊กว่าทำแล้ว · ขั้นตอนปิดอ่านจากประวัติแถวสุดท้ายก่อนปิด (สถานะหลังแถวนั้น)
 */
function recoveredFrom(o: WorkOrder): string | null {
  if (o.closeResult !== "RECOVERED") return null;
  const done = o.logs.find((l) => l.action === "RECOVERED_CLOSED");
  if (!done) return null;
  const prior = o.logs.filter((l) => l.id < done.id).sort((a, b) => b.id - a.id)[0];
  return prior?.status ?? "NEW";
}

/**
 * ใบที่ช่างเพิ่งส่งกลับ — ขั้นล่าสุดที่ขยับคือ "ช่างส่งกลับ" และยังอยู่ที่ขั้นแรก
 * แนบรูป/แก้ข้อความหลังจากนั้นไม่นับ เพราะไม่ได้ทำให้ใบงานเดินไปไหน
 */
function sentBackLog(o: WorkOrder): LogEntry | null {
  if (o.status !== "NEW") return null;
  const last = [...o.logs]
    .filter((l) => !["ATTACHED", "ATTACHMENT_REMOVED", "EDITED", "PARTS_ETA_CHANGED"].includes(l.action))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return last?.action === "PARTS_ROLLBACK" ? last : null;
}

function isSkipped(value: string, o: WorkOrder, stages: Stage[]) {
  const at = (v: string) => stages.findIndex((x) => x.value === v);
  const recovered = recoveredFrom(o);
  // รวมขั้นที่ใบงานรออยู่ตอนกดปิดด้วย — ขั้นนั้นก็ไม่มีใครทำ (เช่น รอจ่ายงาน แล้วปิดเลยโดยไม่จ่าย)
  if (recovered && value !== "DONE" && at(value) >= at(recovered)) return true;
  switch (value) {
    case "PARTS_REQUESTED":
      return o.needsParts === false;
    case "AWAITING_QUOTE":
      return o.needsQuote === false && !o.hasQuote;
    // ใบที่ไม่ต้องเสนอราคา หรือใบเก่าก่อนมีขั้นนี้ (ไปเสนอราคาตรง ๆ ไม่มีประวัติเช็คก่อน) — ไม่ได้ผ่านขั้นนี้
    case "PARTS_SOURCING":
      return (
        o.status !== "PARTS_SOURCING" &&
        (o.needsQuote === false || !o.logs.some((l) => l.action === "PARTS_SOURCED" || l.action === "PARTS_BACKORDERED"))
      );
    case "AWAITING_PAYMENT":
      return o.needsQuote === false && !o.hasReceipt;
    // ตรวจหน้างานเป็นทางเลือก — ใบที่ไม่เคยส่งตรวจไม่ได้ผ่านขั้นนี้
    case "INSPECTING":
      return o.status !== "INSPECTING" && !o.inspectedAt;
    // ใบที่ส่งตรวจก่อนมีขั้นนัดก็ไม่ได้ผ่านขั้นนี้ — ดูจากประวัตินัดที่ส่งต่อไปขั้นตรวจ
    case "INSPECT_CONFIRM":
      return o.status !== "INSPECT_CONFIRM" && !inspectBooked(o);
    // ใบเก่าบางใบนัดแล้วไปเลยโดยไม่ได้ผ่านขั้นคอนเฟิร์ม — ไม่มีประวัติคอนเฟิร์ม/เลื่อน = ข้าม
    case "AWAITING_CONFIRM":
      return (
        o.status !== "AWAITING_CONFIRM" &&
        (o.status === "DONE" || at(o.status) > at("AWAITING_CONFIRM")) &&
        !o.logs.some((l) => l.action === "CONFIRMED" || l.action === "RESCHEDULED")
      );
    default:
      return false;
  }
}

interface Option {
  value: string;
  label: string;
}

interface Stage {
  value: string;
  label: string;
  actor: string | null;
  actorLabel: string | null;
}

/** อะไหล่พร้อมผลเช็คคลัง — inStock ว่าง = ยังไม่มีใครเช็ค */
interface StockPart extends PickedPart {
  inStock: boolean | null;
  warehouse: string | null;
  requisitionNo: string | null;
}

interface Technician {
  id: number;
  name: string;
  employeeCode: string;
  /** ทีมที่สังกัด — ช่วยให้เลือกคนถูกตอนชื่อคล้ายกัน */
  team?: string | null;
}

/**
 * ใบงานที่จ่ายให้ทีมนี้เป็นงานของช่างคนนี้ไหม — ทีมรวมครอบคลุมหลายทีม (เซิร์ฟเวอร์ใช้กฎเดียวกัน
 * utils/teamGroups.ts) ถ้าเทียบชื่อทีมตรง ๆ ช่างในทีมรวมจะเปิดใบงานได้แต่ไม่มีปุ่มให้กด
 */
function inMyTeam(u: { team?: string | null; teamCoverage?: { all: boolean; teams: string[] } | null } | null, team: string | null) {
  if (!u || team === null) return false;
  if (u.team === team) return true;
  const c = u.teamCoverage;
  return !!c && (c.all || c.teams.includes(team));
}

/** ตรวจเคลมได้เฉพาะ Admin Spare Part (Super Admin ทำแทนได้) — ตรงกับ canReviewClaims ฝั่งเซิร์ฟเวอร์ */
function canReviewClaims(u: { partsAdmin?: boolean; superAdmin?: boolean } | null) {
  return !!u && (!!u.partsAdmin || !!u.superAdmin);
}

export default function WorkOrderDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { user: me } = useAuth();
  /**
   * Admin Spare Part ดูใบงานได้ทุกใบแต่แก้ไม่ได้ (เจ้าของงานกำหนด ต.ค. 69) ยกเว้นตรวจเคลม
   * ตัด user ทิ้งสำหรับปุ่มทั้งหมดในหน้านี้ — ทุกปุ่มที่เช็คสิทธิ์จาก user หายไปพร้อมกัน
   * ไม่ต้องไล่ใส่เงื่อนไขทีละปุ่ม (เซิร์ฟเวอร์กันอีกชั้นใน middleware/auth.ts)
   */
  const viewOnly = !!me?.partsAdmin;
  const user = viewOnly ? null : me;
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [results, setResults] = useState<Option[]>([]);
  const [workStatuses, setWorkStatuses] = useState<Option[]>([]);
  const [sendBackReasons, setSendBackReasons] = useState<Option[]>([]);
  const [priorities, setPriorities] = useState<Option[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editingNote, setEditingNote] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  // ความกว้างของแถบขั้นตอน — แคบจนชื่อขั้นอ่านไม่ออก ซ่อนชื่อขั้นอื่น เหลือแค่ขั้นปัจจุบัน
  const [stepBarW, setStepBarW] = useState(0);
  const [skipOpen, setSkipOpen] = useState<number | null>(null);
  // ดูรูปที่ส่งตอนปิดงานเต็มจอ — เลื่อนไปมาได้เฉพาะรูปของรอบที่ปิด
  const [viewingClose, setViewingClose] = useState<number | null>(null);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  // ย้อนขั้นตอน (แอดมิน/หัวหน้าภาค) — คนละอย่างกับ rollbackOpen ที่เป็นช่างส่งกลับ
  const [stageBackOpen, setStageBackOpen] = useState(false);
  const [etaOpen, setEtaOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  // ขยับเมื่อมีไฟล์ถูกแนบจากที่อื่นนอกการ์ดไฟล์แนบ เพื่อสั่งให้การ์ดโหลดใหม่
  const [filesKey, setFilesKey] = useState(0);
  // รายการไฟล์ที่การ์ดไฟล์แนบโหลดมาแล้ว — ยืมมาใช้ต่อในการ์ดผลการทำงาน
  // จะได้ไม่ต้องยิงขอรายการเดิมซ้ำอีกรอบ (รูปย่อเป็น data URL ก้อนใหญ่)
  const [files, setFiles] = useState<Attachment[]>([]);
  const [deleting, setDeleting] = useState(false);
  // ขั้นที่ทำแล้วที่กดดูอยู่ (null = ไม่ได้ดู)
  const [stepInfo, setStepInfo] = useState<string | null>(null);
  // การ์ดสาขา/การมอบหมายวางคู่กันเมื่อหน้าต่างกว้างพอ
  const [bodyWidth, setBodyWidth] = useState(0);
  const twoCol = bodyWidth >= 720;

  const load = useCallback(async (): Promise<WorkOrder | null> => {
    try {
      const [detail, options] = await Promise.all([
        api.get<WorkOrder>(`/work-orders/${id}`),
        api.get<{
          results: Option[];
          workStatuses: Option[];
          sendBackReasons?: Option[];
          priorities?: Option[];
          stages: Stage[];
          warehouses: string[];
          technicians: Technician[];
          teams: Team[];
        }>("/work-orders/options"),
      ]);
      setOrder(detail.data);
      setResults(options.data.results);
      setWorkStatuses(options.data.workStatuses);
      setSendBackReasons(options.data.sendBackReasons ?? []);
      setPriorities(options.data.priorities ?? []);
      setStages(options.data.stages);
      setWarehouses(options.data.warehouses);
      setTechnicians(options.data.technicians);
      setTeams(options.data.teams ?? []);
      setError(null);
      return detail.data;
    } catch (e) {
      setError(apiErrorMessage(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /**
   * โหลดใหม่แล้วเด้งบอกสถานะใหม่ทุกครั้งที่มีการเปลี่ยน (เจ้าของงานขอ ต.ค. 69)
   *
   * หน้าจอเปลี่ยนเงียบ ๆ แล้วคนกดไม่แน่ใจว่าบันทึกไปแล้วหรือยัง — บางคนกดซ้ำ
   * บางคนออกไปเปิดใหม่เพื่อเช็ค · บอกทั้ง "จากไหน → ไปไหน" ให้รู้ว่าใบงานเดินไปทางที่ตั้งใจ
   */
  const reloadWithNotice = useCallback(
    async (what = "อัปเดตสถานะแล้ว") => {
      const before = order;
      const next = await load();
      if (!next) return;
      const label = (o: WorkOrder) => {
        const out = PARTS_OUT_STAGES.includes(o.status) ? o.waitingParts.filter((p) => p.inStock === false).length : 0;
        return out ? `${o.statusLabel} · อะไหล่หมด ${out} รายการ` : o.workStatusLabel && o.workStatusLabel !== o.statusLabel ? `${o.statusLabel} · ${o.workStatusLabel}` : o.statusLabel;
      };
      const from = before ? label(before) : null;
      const to = label(next);
      showAlert(`${next.code} ${what}`, from && from !== to ? `${from} → ${to}` : to);
    },
    [order, load]
  );

  /**
   * ปุ่มของขั้นนี้ — ขึ้นเฉพาะเมื่อถึงคิวของคนที่เปิดดูอยู่
   *
   * ไม่ขึ้นปุ่มที่กดแล้วโดนปฏิเสธ เพราะปุ่มที่กดไม่ได้คือปุ่มที่ทำให้คนสงสัยว่า
   * ตัวเองทำอะไรผิด ทั้งที่แค่ยังไม่ถึงคิว
   */
  function myTurn(o: WorkOrder) {
    if (!user) return false;
    if (user.role === "ADMIN") return true;
    // ผลตรวจหน้างาน หัวหน้าภาคบันทึกแทนได้ เผื่อช่างโทรมาเล่าแทนการกรอกเอง
    if (o.status === "INSPECTING" && user.role === "SUPERVISOR") return true;
    if (o.stageActor === "EMPLOYEE") {
      // ช่างในทีมที่รับงานเท่านั้น ไม่ใช่ช่างทุกคน
      //
      // ใบเก่าที่จ่ายรายคนยังเช็คด้วย assignedToId เหมือนเดิม เพื่อให้คนที่กำลัง
      // ทำอยู่ตอนเปลี่ยนระบบไม่โดนล็อกออกจากงานของตัวเอง
      if (o.assignedToId !== null) return o.assignedToId === user.id;
      if (o.assignedTeam !== null) return inMyTeam(user, o.assignedTeam);
      return true;
    }
    return o.stageActor === user.role;
  }

  if (loading) {
    return (
      <PopupScreen title="ใบงาน" subtitle="ใบงานซ่อม">
        <View style={styles.centered}>
          <Spinner color={colors.primary} />
        </View>
      </PopupScreen>
    );
  }

  if (error || !order) {
    return (
      <PopupScreen title="ใบงาน" subtitle="ใบงานซ่อม">
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? "ไม่พบใบงานนี้"}</Text>
        </View>
      </PopupScreen>
    );
  }

  /** กดวงกลมขั้นตอน: ขั้นปัจจุบัน = ทำขั้นนี้ (ถ้าถึงคิวเรา) · ขั้นที่ทำแล้ว = ดูว่าใครทำ */
  function pressStep(value: string, state: string) {
    if (state === "done") {
      setStepInfo(value);
      return;
    }
    if (state !== "now" || !order || !myTurn(order) || busy) return;
    // ตรวจเคลมทำที่การ์ดใบเคลมด้านล่าง ไม่มีฟอร์มขั้นตอนให้เปิด
    if (order.status === "CLAIM_REVIEW") return;
    if (order.status === "IN_PROGRESS") setClosing(true);
    else setStageOpen(true);
  }

  /**
   * ไฟล์ที่ถูกแนบในรอบที่ปิดงาน
   *
   * ไม่มี roundStartedAt (ใบเก่ามากที่ไม่มีประวัติการจ่ายงาน) ก็เอาทั้งหมด
   * ดีกว่าโชว์ว่าไม่มีรูปเลยทั้งที่มี
   */
  /**
   * รอบที่ถูกตีกลับเคลม — ใบงานกลับไปที่ช่าง (ไม่มีเวลาปิด) แต่ผลปิดงานรอบนั้นยังอยู่
   * ต้องเห็นว่ารอบนั้นส่งอะไรมาและถูกตีกลับเพราะอะไร ไม่ใช่หายไปทั้งการ์ด (เจ้าของงานขอ ต.ค. 69)
   */
  const rejected = order.status === "IN_PROGRESS" && order.claims[0]?.status === "REJECTED" ? order.claims[0] : null;
  const closeFiles = order.closedAt || rejected
    ? files.filter((f) => !order.roundStartedAt || f.createdAt >= order.roundStartedAt)
    : [];
  const beforeShots = closeFiles.filter((f) => f.role === "BEFORE");
  const afterShots = closeFiles.filter((f) => f.role === "AFTER");
  const otherShots = closeFiles.filter((f) => f.role !== "BEFORE" && f.role !== "AFTER");
  const closeShown = [...beforeShots, ...afterShots, ...otherShots];

  /**
   * ลบถาวร — บอกให้ครบก่อนว่าอะไรจะหายไปด้วย
   *
   * ของที่หายไปพร้อมใบงานไม่ได้มีแค่ตัวใบ ปุ่มที่ถามแค่ "แน่ใจไหม" โดยไม่บอกว่า
   * จะเสียอะไร คือปุ่มที่คนกดยืนยันโดยไม่รู้ว่ากำลังยืนยันอะไร
   */
  function confirmDelete() {
    const o = order!;
    const parts = [
      o.waitingParts.length + o.parts.length > 0
        ? `อะไหล่ ${o.waitingParts.length + o.parts.length} รายการ`
        : null,
      files.length > 0 ? `ไฟล์แนบ ${files.length} ไฟล์` : null,
      o.logs.length > 0 ? `ประวัติ ${o.logs.length} รายการ` : null,
      o.workers.length > 0 ? `ผู้เข้าปฏิบัติงาน ${o.workers.length} คน` : null,
    ].filter(Boolean);

    showAlert(
      `ลบ ${o.code} ถาวร`,
      [
        "ใบงานนี้จะหายไปทั้งใบ กู้คืนไม่ได้",
        parts.length > 0 ? `หายไปด้วย: ${parts.join(" · ")}` : null,
        o.closedAt
          ? "ใบนี้ปิดงานไปแล้ว — ถ้าแค่ต้องการเอาออกจากรายการ ควรเก็บไว้เป็นหลักฐานมากกว่า"
          : "ถ้าใบนี้เปิดถูกแต่ไม่ได้ทำแล้ว ใช้ยกเลิกแทน จะได้เหลือร่องรอยว่าใครยกเลิกเมื่อไหร่",
      ]
        .filter(Boolean)
        .join("\n\n"),
      [
        { text: "ไม่ลบ", style: "cancel" },
        { text: "ลบถาวร", style: "destructive", onPress: doDelete },
      ]
    );
  }

  /** คัดลอกเป็นใบทดสอบ — ลองเดินขั้นที่เหลือ (เช่นเคลมอะไหล่) โดยไม่แตะใบจริง */
  function confirmTestCopy() {
    const o = order!;
    showAlert(
      `คัดลอก ${o.code} เป็นใบทดสอบ`,
      "ได้ใบใหม่ สาขา เครื่อง อาการ อะไหล่ ทีม และขั้นเดียวกับใบนี้ (ไม่มีรูปและประวัติ) ใบนี้ไม่ถูกแตะ\n\nทดสอบเสร็จแล้วลบใบทดสอบทิ้ง",
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "คัดลอก",
          onPress: async () => {
            try {
              const res = await api.post<{ id: number; code: string }>(`/work-orders/${o.id}/test-copy`);
              navigation.push("WorkOrderDetail", { id: res.data.id });
            } catch (e) {
              showAlert("คัดลอกไม่สำเร็จ", apiErrorMessage(e));
            }
          },
        },
      ]
    );
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await api.delete(`/work-orders/${id}`);
      navigation.goBack();
    } catch (e) {
      showAlert("ลบไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  /**
   * ขั้นรออะไหล่มีเฉพาะใบที่แยกออกมาจากใบอื่น — ใบปกติไม่ต้องเห็นขั้นนี้เลย
   * แม้แต่ในรูป "ข้าม" เพราะมันไม่ใช่ทางเลือกของใบปกติ ขึ้นไว้มีแต่ทำให้งง
   */
  const shownStages = stages.filter(
    (x) =>
      (x.value !== "WAITING_PARTS" || order.parent !== null || order.status === "WAITING_PARTS") &&
      // ขั้นตรวจเคลมมีเฉพาะใบที่ส่งอะไหล่เก่าเคลม — ใบส่วนใหญ่ไม่มี ขึ้นไว้มีแต่ทำให้ดูเหมือนงานยังไม่จบ
      (x.value !== "CLAIM_REVIEW" || order.status === "CLAIM_REVIEW" || order.claims.length > 0)
  );
  /**
   * ขั้นที่ย้อนกลับไปได้ — ขั้นก่อนหน้าที่ใบนี้ผ่านมาจริง ไม่นับขั้นที่ข้าม
   * ย้อนไปขั้นที่ไม่เคยผ่านคือการเดินใบงานไปทางที่ไม่ควรมีอยู่
   */
  const backTargets = (() => {
    const at = shownStages.findIndex((x) => x.value === order.status);
    return shownStages
      .slice(0, Math.max(0, at))
      .filter(
        (x) =>
          x.value !== "DONE" &&
          x.value !== "CLAIM_REVIEW" &&
          (!isSkipped(x.value, order, stages) ||
            /**
             * ใบเก่าที่เข้าเสนอราคาก่อนมีขั้นรอเบิกอะไหล่ — แอดมินเช็คหลังบ้านแล้วพบว่าของหมด
             * ต้องส่งกลับไปขั้นนั้นได้ ไม่งั้นเสนอราคา/เก็บเงินของที่ไม่มี (เจ้าของงานขอ ต.ค. 69)
             */
            (x.value === "PARTS_SOURCING" &&
              order.needsQuote === true &&
              (order.status === "AWAITING_QUOTE" || order.status === "AWAITING_PAYMENT")))
      )
      .reverse();
  })();
  const canStepBack =
    (user?.role === "ADMIN" || user?.role === "SUPERVISOR") &&
    order.status !== "DONE" &&
    order.status !== "CANCELLED" &&
    // รอตรวจเคลมย้อนด้วยปุ่ม "ตีกลับ" ของ Admin Spare Part เท่านั้น — ต้องมีเหตุผลให้ช่างเห็น
    order.status !== "CLAIM_REVIEW" &&
    backTargets.length > 0;

  // เปิดใบรออะไหล่ต่อได้ตั้งแต่ทีมรับงานแล้ว — ก่อนนั้นยังแก้รายการอะไหล่ในใบนี้ได้เอง
  const canFollowUp =
    ["IN_PROGRESS", "DONE"].includes(order.status) &&
    (user?.role === "ADMIN" ||
      user?.role === "SUPERVISOR" ||
      inMyTeam(user, order.assignedTeam));

  const tone = statusTone(order.status);
  /**
   * อะไหล่หมด — ป้ายแดงบนแถบขั้นตอนและหัวใบงาน (เจ้าของงานขอ ต.ค. 69)
   *
   * สีของคนที่ใบรอ (ม่วงแอดมิน) บอกแค่ว่ารอใคร ไม่บอกว่าติดอยู่เพราะของไม่มี —
   * ใบที่ติดของกับใบที่แอดมินแค่ยังไม่ได้เปิดดูหน้าตาเหมือนกันจนต้องเปิดเข้ามาอ่านรายการอะไหล่
   * นับเฉพาะขั้นที่ผล "หมด" ยังเป็นเรื่องของตอนนี้ (ตรงกับ PARTS_OUT_STAGES ฝั่ง backend)
   */
  const partsOut = PARTS_OUT_STAGES.includes(order.status) ? order.waitingParts.filter((p) => p.inStock === false) : [];
  const etaDay = order.partsExpectedAt ? order.partsExpectedAt.slice(0, 10) : null;
  const sentBack = sentBackLog(order);
  const etaLate = !!etaDay && etaDay < new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const urgent = order.priority === "URGENT";
  const done = order.status === "DONE" || order.status === "CANCELLED";
  // ปิดแล้วการ์ดทุกใบเป็นเขียว (เจ้าของงานเลือกแบบ B ต.ค. 69) — เปิดมาก็รู้ทันทีว่างานจบ
  // ไม่ต้องหาป้ายสถานะ · ยกเลิกไม่นับ เพราะงานไม่ได้ซ่อมเสร็จ
  const closedOk = order.status === "DONE";
  const card = closedOk ? [styles.card, styles.cardDone] : styles.card;
  const mine =
    order.assignedToName === user?.name ||
    inMyTeam(user, order.assignedTeam);

  return (
    <PopupScreen
      title={order.code}
      subtitle="ใบงานซ่อม"
      backLabel={`ใบงาน ${order.code}`}
      right={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {user?.superAdmin ? (
            <TimelineButton label={`ไทม์ไลน์ ${order.code}`} onPress={() => setTimelineOpen(true)} />
          ) : null}
          {partsOut.length ? (
            <View style={[styles.badge, styles.badgeOut]}>
              <Text style={[styles.badgeText, { color: "#fff" }]}>● อะไหล่หมด</Text>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: tone.bg }]}>
              <Text style={[styles.badgeText, { color: tone.fg }]}>{order.statusLabel}</Text>
            </View>
          )}
        </View>
      }
    >
    {timelineOpen ? (
      <TimelineModal target={{ kind: "wo", id: order.id, code: order.code }} onClose={() => setTimelineOpen(false)} />
    ) : null}
    {backfilling ? (
      <BackfillCloseModal
        order={order}
        teams={teams.map((t) => t.name)}
        technicians={technicians}
        results={results}
        onClose={() => setBackfilling(false)}
        onDone={async () => {
          setBackfilling(false);
          await reloadWithNotice();
        }}
      />
    ) : null}
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      onLayout={(e) => setBodyWidth(e.nativeEvent.layout.width)}
    >
      {/* แอดมิน (รวม Super Admin) ปิดงานที่จบจริงไปแล้วแต่ค้างในระบบได้ในครั้งเดียว */}
      {user?.role === "ADMIN" && !["DONE", "CANCELLED", "CLAIM_REVIEW"].includes(order.status) ? (
        <BackfillButton onPress={() => setBackfilling(true)} />
      ) : null}
      {order.isTest ? (
        <View style={styles.testBand}>
          <Ionicons name="flask-outline" size={18} color={colors.warningInk} />
          <Text style={styles.testBandText}>ใบทดสอบ — คัดลอกจากใบจริง ไม่กระทบใบจริง ทดสอบเสร็จให้ลบทิ้ง</Text>
        </View>
      ) : null}
      {closedOk ? (
        <View style={styles.doneBand}>
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <Text style={styles.doneBandText}>ปิดงานแล้ว</Text>
          <View style={{ flex: 1 }} />
          {order.closedAt ? <Text style={styles.doneBandWhen}>{formatDateTime(order.closedAt)}</Text> : null}
        </View>
      ) : null}
      <View style={card}>
        {/* ออร่าวาดก่อนเนื้อหา — อยู่ใต้ทุกอย่างในการ์ด เหลือให้เห็นแค่ขอบกับแสงรอบนอก */}
        {urgent ? <UrgentGlow radius={radius.xl} /> : null}
        {urgent ? (
          <View style={styles.urgentBar}>
            <Ionicons name="alert-circle" size={16} color="#fff" />
            <Text style={styles.urgentBarText}>
              งานด่วน <Text style={styles.urgentBarSub}>— ทำก่อนใบปกติ</Text>
            </Text>
          </View>
        ) : null}
        <View style={styles.headRow}>
          <Text style={[styles.code, headingFont]}>{order.code}</Text>
          {urgent ? <UrgentBadge /> : null}
          <View style={{ flex: 1 }} />
          {partsOut.length ? (
            <View style={[styles.badge, styles.badgeOut]} accessibilityLabel="ป้ายอะไหล่หมด">
              <Text style={[styles.badgeText, { color: "#fff" }]}>● อะไหล่หมด</Text>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: closedOk ? colors.card : tone.bg }, closedOk && styles.badgeDone]}>
              <Text style={[styles.badgeText, { color: tone.fg }]}>{order.statusLabel}</Text>
            </View>
          )}
        </View>

        <Text style={[styles.title, headingFont]}>{order.title}</Text>
        {order.detail ? <Text style={styles.detail}>{order.detail}</Text> : null}

        {/*
          ใบที่ลิงก์กัน — ใบรออะไหล่กับใบเดิมเป็นงานเดียวกันที่แบ่งเป็นสองรอบ
          ต้องกระโดดไปมาได้ ไม่งั้นคนดูใบหนึ่งไม่รู้ว่าอีกครึ่งของงานอยู่ไหน
        */}
        {order.parent || order.children.length > 0 || canStepBack ? (
          <View style={styles.linkRow}>
            {order.parent ? (
              <TouchableOpacity
                style={styles.linkChip}
                onPress={() => navigation.push("WorkOrderDetail", { id: order.parent!.id })}
                activeOpacity={0.7}
                accessibilityLabel={`เปิดใบงาน ${order.parent.code}`}
              >
                <Ionicons name="link-outline" size={14} color={colors.primaryInk} />
                <Text style={styles.linkChipText}>
                  แยกมาจาก {order.parent.code} · {order.parent.statusLabel}
                </Text>
              </TouchableOpacity>
            ) : null}
            {order.children.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.linkChip}
                onPress={() => navigation.push("WorkOrderDetail", { id: c.id })}
                activeOpacity={0.7}
                accessibilityLabel={`เปิดใบงาน ${c.code}`}
              >
                <Ionicons name="link-outline" size={14} color={colors.primaryInk} />
                <Text style={styles.linkChipText}>
                  ใบรออะไหล่ {c.code} · {c.statusLabel}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={{ flex: 1 }} />
            {canStepBack ? (
              <TouchableOpacity
                style={styles.stepBack}
                onPress={() => setStageBackOpen(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-undo-outline" size={15} color={colors.warningInk} />
                <Text style={styles.stepBackText}>ย้อนขั้นตอน</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}


        {/*
          ขั้นตอนงานอยู่บนสุด ในการ์ดหัวใบงานเลย ตามตัวอย่างที่เจ้าของงานเลือก —
          คนเปิดใบงานส่วนใหญ่เปิดมาเพื่อดูว่าถึงไหนแล้วทำขั้นถัดไป
          กดวงกลมขั้นปัจจุบันได้เหมือนกดปุ่ม ขั้นที่ทำแล้วกดดูว่าใครทำเมื่อไร
        */}
        {/*
          ไม่เลื่อนซ้ายขวาแล้ว (เจ้าของงานเลือกแบบ 1 ต.ค. 69) — เดิมขั้นละอย่างน้อย 104 px · 12 ขั้น = 1,248 px
          ซูมแล้วกลายเป็นเลื่อนที่ไม่มีแถบเลื่อนให้เห็น ขั้นแรกถูกตัดครึ่ง ขั้นท้ายหายไปเฉย ๆ
          ตอนนี้: ขั้นที่ข้ามติดกันยุบเป็นปุ่มเดียว "ข้าม N" (กดดูชื่อ) · ทุกช่องแบ่งความกว้างเท่ากัน ·
          แคบจนชื่ออ่านไม่ออก ซ่อนชื่อขั้นอื่น เหลือวงกับเลข ชื่อขั้นปัจจุบันยังเห็นเต็ม
        */}
        {(() => {
          const currentIndex = shownStages.findIndex((x) => x.value === order.status);
          const rows = shownStages.map((stage, i) => {
            const skipped = isSkipped(stage.value, order, stages);
            // ตรวจหน้างานแล้วใบงานวนกลับไปขั้นแรก ขั้นตรวจจึงอยู่ "หลัง" ขั้นปัจจุบัน
            // ตามลำดับ แต่ทำไปแล้วจริง — ต้องขึ้นว่าทำแล้ว ไม่ใช่ยังไม่ถึง
            const doneOutOfOrder =
              (stage.value === "INSPECTING" && !!order.inspectedAt && order.status !== "INSPECTING") ||
              (stage.value === "INSPECT_CONFIRM" && inspectBooked(order) && order.status !== "INSPECT_CONFIRM");
            const state = skipped
              ? "skipped"
              : order.status === "CANCELLED"
                ? "future"
                : i < currentIndex || order.status === "DONE" || doneOutOfOrder
                  ? "done"
                  : i === currentIndex
                    ? "now"
                    : "future";
            // เลขขั้นนับเฉพาะขั้นที่ไม่ถูกข้าม คนอ่าน "ขั้น 3" จะได้ตรงกับที่ทำจริง
            const number = shownStages.slice(0, i + 1).filter((x) => !isSkipped(x.value, order, stages)).length;
            return { stage, state, number };
          });
          // ขั้นที่ข้ามติดกันรวมเป็นกลุ่มเดียว
          type Row = (typeof rows)[number];
          const items: ({ kind: "step"; row: Row } | { kind: "skip"; rows: Row[]; at: number })[] = [];
          rows.forEach((r, i) => {
            const last = items[items.length - 1];
            if (r.state === "skipped" && last?.kind === "skip") last.rows.push(r);
            else if (r.state === "skipped") items.push({ kind: "skip", rows: [r], at: i });
            else items.push({ kind: "step", row: r });
          });
          // ช่องละไม่ถึง ~74 px ชื่อขั้นภาษาไทยขึ้นบรรทัดละสองสามตัวอักษร อ่านไม่ออก — ซ่อนดีกว่า
          const tight = stepBarW > 0 && stepBarW / items.length < 74;
          const opened = items.find((it) => it.kind === "skip" && it.at === skipOpen);
          return (
            <>
              <View
                // ชื่อของแถบ — หัวข้อ "ขั้นตอนงาน" ถูกเอาออกตอนย้ายแถบขึ้นบนสุด
                // คนใช้โปรแกรมอ่านจอกับเทสต์ (stageorder-web-test) หาแถบนี้จากชื่อนี้
                accessibilityLabel="ขั้นตอนงาน"
                style={styles.steps}
                onLayout={(e) => setStepBarW(e.nativeEvent.layout.width)}
              >
                {items.map((it, k) => {
                  if (it.kind === "skip") {
                    const isOpen = skipOpen === it.at;
                    return (
                      <TouchableOpacity
                        key={`skip-${it.at}`}
                        style={[styles.stepSkipGroup, tight && styles.stepSkipGroupTight]}
                        activeOpacity={0.7}
                        onPress={() => setSkipOpen(isOpen ? null : it.at)}
                        accessibilityLabel={`ข้าม ${it.rows.length} ขั้น`}
                      >
                        {k > 0 ? <View style={[styles.stepLine, tight && styles.stepLineTight]} /> : null}
                        <View style={[styles.stepSkipPill, tight && styles.stepSkipPillTight, isOpen && styles.stepSkipPillOn]}>
                          <Text style={styles.stepSkipText}>ข้าม {it.rows.length}</Text>
                        </View>
                        {tight ? null : <Text style={styles.stageActor}>{isOpen ? "ปิด" : "กดดู"}</Text>}
                      </TouchableOpacity>
                    );
                  }
                  const { stage, state, number } = it.row;
                  const showLabel = !tight || state === "now";
                  return (
                    <TouchableOpacity
                      key={stage.value}
                      style={[styles.step, tight && styles.stepTight, tight && state === "now" && styles.stepNowWide]}
                      activeOpacity={0.7}
                      onPress={() => pressStep(stage.value, state)}
                      accessibilityLabel={stage.label}
                    >
                      {k > 0 ? (
                        <View
                          style={[styles.stepLine, tight && styles.stepLineTight, (state === "done" || state === "now") && styles.stepLineDone]}
                        />
                      ) : null}
                      <View
                        style={[
                          styles.stepDot,
                          tight && styles.stepDotTight,
                          state === "done" && styles.stepDotDone,
                          // วงขั้นปัจจุบันเป็นสีของคนที่ใบงานรอ ตรงกับป้ายสถานะในรายการ
                          state === "now" && [styles.stepDotNow, { backgroundColor: tone.fg, borderColor: tone.fg }],
                          state === "now" && partsOut.length > 0 && styles.stepDotOut,
                        ]}
                      >
                        {state === "now" ? <StepPulse size={tight ? 24 : 30} color={partsOut.length ? colors.danger : tone.fg} /> : null}
                        {state === "done" ? (
                          <Ionicons name="checkmark" size={15} color="#fff" />
                        ) : state === "now" && partsOut.length ? (
                          <Text style={[styles.stepNum, headingFont, styles.stepNumNow]}>!</Text>
                        ) : (
                          <Text style={[styles.stepNum, headingFont, tight && styles.stepNumTight, state === "now" && styles.stepNumNow]}>
                            {number}
                          </Text>
                        )}
                      </View>
                      {showLabel ? (
                        <Text
                          style={[
                            styles.stageLabel,
                            state === "now" && [styles.stageLabelNow, { color: partsOut.length ? colors.dangerInk : tone.fg }],
                            state === "future" && styles.stageLabelFuture,
                          ]}
                        >
                          {stage.label}
                        </Text>
                      ) : null}
                      {state === "now" && partsOut.length ? (
                        <>
                          <View style={styles.stepOutPill} accessibilityLabel="อะไหล่หมดบนแถบขั้นตอน">
                            <Text style={styles.stepOutPillText}>อะไหล่หมด {partsOut.length} รายการ</Text>
                          </View>
                          {etaDay ? (
                            <Text style={styles.stepOutEta}>
                              {etaLate ? "เลยกำหนด " : "คาดเข้า "}
                              {thaiDate(etaDay)}
                            </Text>
                          ) : null}
                        </>
                      ) : showLabel && stage.actorLabel && state !== "done" ? (
                        <Text style={styles.stageActor}>{stage.actorLabel}</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
              {opened && opened.kind === "skip" ? (
                <View style={styles.stepSkipList} accessibilityLabel="ขั้นที่ข้าม">
                  <Text style={styles.stepSkipListHead}>ใบนี้ไม่ได้ผ่าน {opened.rows.length} ขั้น:</Text>
                  {opened.rows.map((r) => (
                    // ขีดฆ่าชื่อ ให้แยกจาก "ยังไม่ถึง" ได้ — เทสต์ stageorder อ่านเส้นนี้ด้วย
                    <Text key={r.stage.value} style={[styles.stageLabelFuture, styles.stageLabelSkipped, styles.stepSkipItem]}>
                      {r.stage.label}
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          );
        })()}

        {/* ตีกลับเคลม — ช่างต้องเห็นเหตุผลก่อนกดปิดงานอีกรอบ ไม่งั้นแนบของเดิมกลับไปแล้วโดนตีกลับซ้ำ */}
        {order.status === "IN_PROGRESS" && order.claims[0]?.status === "REJECTED" ? (
          <View style={styles.claimRejected}>
            <Ionicons name="arrow-undo" size={16} color={colors.dangerInk} />
            <View style={{ flex: 1 }}>
              <Text style={styles.claimRejectedTitle}>Admin Spare Part ตีกลับใบเคลม — แก้แล้วปิดงานใหม่</Text>
              <Text style={styles.claimRejectedText}>{order.claims[0].rejectReason ?? "—"}</Text>
            </View>
          </View>
        ) : null}

        {/*
          ช่างส่งกลับ — หัวหน้าภาคต้องเห็นก่อนอย่างอื่นว่าทำไมใบนี้กลับมา ใครส่ง เมื่อไร
          ข้อมูลเดิมอยู่ครบในการ์ดข้างล่าง แก้ได้ที่ปุ่ม "แก้ไข" แล้วส่งตรวจหรือเดินต่อจากปุ่มขั้นนี้
        */}
        {sentBack ? (
          <View style={styles.sentBack} accessibilityLabel="กล่องช่างส่งกลับ">
            <Ionicons name="arrow-undo" size={18} color={colors.warningInk} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sentBackTitle}>ช่างส่งกลับ — ปิดงานไม่ได้</Text>
              <Text style={styles.sentBackText}>{sentBack.note ?? "—"}</Text>
              <Text style={styles.sentBackMeta}>
                {sentBack.byName ?? "—"} · {formatDateTime(sentBack.createdAt)}
                {order.assignedTeam ? ` · ทีมเดิม ${order.assignedTeam}` : ""}
                {order.waitingParts.some((p) => p.inStock === true && p.requisitionNo)
                  ? " · อะไหล่ที่เบิกแล้วยังอยู่ ไม่ต้องเช็คซ้ำ"
                  : ""}
              </Text>
            </View>
          </View>
        ) : null}

        {/*
          อะไหล่หมด — ทุกคนเห็นว่ารอตัวไหน ถึงเมื่อไร ใครเช็ค (ไม่ต้องเปิดฟอร์มดู)
          ปุ่มเลื่อนวันอยู่ในกล่องนี้ ไม่ได้อยู่กับปุ่มขั้นตอน เพราะใบรออะไหล่ที่แยกออกมา
          เป็นคิวของหัวหน้าภาค แต่คนที่รู้ว่าของจะเข้าเมื่อไรคือแอดมินที่ตามของ
        */}
        {partsOut.length ? (
          <View style={styles.outCard} accessibilityLabel="กล่องอะไหล่หมด">
            <View style={styles.outIcon}>
              <Text style={styles.outIconText}>!</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.outTitle}>
                อะไหล่หมด {partsOut.length} รายการ{" "}
                <Text style={styles.outText}>— {partsOut.map((p) => p.name || p.partCode).join(", ")}</Text>
              </Text>
              <Text style={styles.outText}>
                {etaDay
                  ? `คาดว่าเข้า ${thaiDate(etaDay)}${etaLate ? " (เลยกำหนดแล้ว — ตามผู้ขาย)" : ""}`
                  : "ยังไม่ได้ระบุวันคาดว่าของเข้า"}
                {(() => {
                  const c = [...order.logs]
                    .filter((l) => ["PARTS_CHECKED", "PARTS_BACKORDERED", "SPLIT_FROM"].includes(l.action))
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
                  return c ? ` · เช็คเมื่อ ${formatDateTime(c.createdAt)}${c.byName ? ` (${c.byName})` : ""}` : "";
                })()}
              </Text>
            </View>
            {user?.role === "ADMIN" ? (
              <TouchableOpacity
                style={styles.outEtaBtn}
                onPress={() => setEtaOpen(true)}
                activeOpacity={0.7}
                accessibilityLabel="เลื่อนวันคาดว่าเข้า"
              >
                <Ionicons name="calendar-outline" size={14} color={colors.dangerInk} />
                <Text style={styles.outEtaBtnText}>{etaDay ? "เลื่อนวัน" : "ใส่วันคาดว่าเข้า"}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {order.status === "CLAIM_REVIEW" ? (
          <View style={[styles.waitingCard, styles.waitingInline]}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
            <Text style={styles.waitingText}>
              {canReviewClaims(me)
                ? "ช่างปิดงานพร้อมส่งอะไหล่เก่าเคลม — ตรวจใบเคลมด้านล่าง แล้วอนุมัติหรือตีกลับ"
                : "ช่างปิดงานแล้ว รอ Admin Spare Part ตรวจเคลมอะไหล่เก่า"}
            </Text>
          </View>
        ) : !done ? (
          myTurn(order) ? (
            <>
              <View style={styles.actions}>
  {/*
                  ปุ่มเดียวต่อขั้น — ขั้นไหนก็ทำได้อย่างเดียวตามที่สายงานกำหนด
                  ขั้นนัดวันเป็นของหัวหน้าภาค ส่วนปิดงานเป็นของช่างหลังถึงหน้างานแล้ว
                  จึงไม่มีขั้นไหนที่ขึ้นทั้งสองปุ่มพร้อมกันอีก
                */}
                {order.status === "IN_PROGRESS" ? (
                  <TouchableOpacity
                    style={[styles.action, styles.actionPrimary]}
                    onPress={() => setClosing(true)}
                    disabled={busy}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark-done" size={18} color="#fff" />
                    <Text style={styles.actionPrimaryText}>ปิดงาน</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.action, styles.actionPrimary]}
                    onPress={() => setStageOpen(true)}
                    disabled={busy}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={STAGE_BUTTON[order.status]?.icon ?? "arrow-forward-circle"}
                      size={18}
                      color="#fff"
                    />
                    <Text style={styles.actionPrimaryText}>
                      {/* ของหมดอยู่ = สิ่งที่แอดมินรอทำคือบอกว่าของมาแล้ว ไม่ใช่ "เช็คคลัง" เหมือนรอบแรก */}
                      {partsOut.length && order.status !== "WAITING_PARTS"
                        ? "อะไหล่มาแล้ว — อัปเดตสถานะ"
                        : STAGE_BUTTON[order.status]?.label ?? "ทำขั้นนี้"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/*
                ไปถึงหน้างานแล้วจบเคสไม่ได้เพราะต้องเปลี่ยนอะไหล่เพิ่ม
                ช่างเลือกอะไหล่ที่จะเบิกได้เลย เพราะเป็นคนเดียวที่เห็นของจริง
                แล้วใบงานวนกลับไปให้หัวหน้าภาคดูและแอดมินเช็คคลังอีกรอบ
              */}
              {order.status === "IN_PROGRESS" ? (
                <TouchableOpacity
                  style={styles.rollback}
                  onPress={() => setRollbackOpen(true)}
                  disabled={busy}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-undo-outline" size={16} color={colors.warning} />
                  <Text style={styles.rollbackText}>
                    ปิดงานไม่ได้ — ส่งกลับหัวหน้าภาค (บอกเหตุ แนบรูป ขอเบิกอะไหล่เพิ่มได้)
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <View style={[styles.waitingCard, styles.waitingInline]}>
              <Ionicons name="hourglass-outline" size={16} color={colors.textMuted} />
              <Text style={styles.waitingText}>
                {viewOnly ? "ดูได้อย่างเดียว · " : ""}ขั้นนี้รอ{order.stageActorLabel ?? "คนอื่น"}
                {order.stageActor === "EMPLOYEE" && (order.assignedToName ?? order.assignedTeam)
                  ? ` (${order.assignedToName ?? order.assignedTeam})`
                  : ""}
                {viewOnly ? "" : " — ยังไม่ถึงคิวของคุณ"}
              </Text>
            </View>
          )
        ) : null}
      </View>

      {order.claims.length > 0 ? (
        <ClaimsCard
          order={order}
          files={files}
          canReview={order.status === "CLAIM_REVIEW" && canReviewClaims(me)}
          onReviewed={() => reloadWithNotice()}
        />
      ) : null}

      <View style={[styles.infoGrid, twoCol && styles.infoGridWide]}>
        <View style={[card, styles.infoCard]}>
          <View style={styles.infoHead}>
            <Ionicons name="business-outline" size={20} color={colors.primaryInk} />
            <Text style={[styles.infoTitle, headingFont]}>สาขาและเครื่อง</Text>
          </View>
          <Row label="สาขา" value={`${order.branchCode} · ${order.branchName}`} />
          {order.region ? <Row label="ภาค" value={order.region} /> : null}
          {order.branchOpenedAt ? (
            <Row label="วันเปิดร้าน" value={formatDate(order.branchOpenedAt)} />
          ) : null}
          {/*
            ประกันเป็นเรื่องของสาขาแฟรนไชส์เท่านั้น สาขาบริษัท (รหัสขึ้นต้นด้วย C)
            เครื่องเป็นของบริษัทเอง จึงไม่มีอะไรให้พูดถึง

            ต้องเห็นตั้งแต่หน้านี้ เพราะเป็นตัวตัดสินว่าจะส่งช่างของเราไปหรือ
            ให้ผู้ขายรับผิดชอบ ซึ่งตัดสินกันตอนดูใบงาน ไม่ใช่ตอนไปถึงหน้างานแล้ว
          */}
          {order.branchIsCompany ? (
            <Row label="ประกัน" value="สาขาบริษัท — ไม่มีประกัน" />
          ) : order.branchWarrantyExpiresAt ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>ประกัน</Text>
              <Text
                style={[
                  styles.rowValue,
                  order.branchWarrantyExpired ? styles.warrantyOut : styles.warrantyIn,
                ]}
              >
                {order.branchWarrantyExpired ? "หมดประกันแล้ว" : "ยังอยู่ในประกัน"}
                {" · ถึง "}
                {formatDate(order.branchWarrantyExpiresAt)}
                {/* สาขาเดียวกันประกันหมดไม่พร้อมกันได้ (Oasis 2 ปี · อื่น ๆ 3 ปี) บอกที่มาไว้กันงง */}
                {order.branchWarrantyYears
                  ? ` (${order.branchWarrantyBrand ? `${order.branchWarrantyBrand} ` : ""}${order.branchWarrantyYears} ปี)`
                  : ""}
              </Text>
            </View>
          ) : (
            <Row label="ประกัน" value="ยังไม่ได้บันทึกวันหมดประกัน" />
          )}
          <Row
            label="เครื่อง"
            value={
              order.machineCode
                ? [
                    order.machineCode,
                    order.machineBrand,
                    order.machineModel,
                    order.machineCapacityLabel,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "ทั้งสาขา"
            }
          />
          {order.contactName || order.contactPhone ? (
            <Row
              label="ผู้ติดต่อที่สาขา"
              value={[order.contactName, order.contactPhone].filter(Boolean).join(" · ")}
            />
          ) : null}
        </View>

        <View style={[card, styles.infoCard]}>
          <View style={styles.infoHead}>
            <Ionicons name="people-outline" size={20} color={colors.primaryInk} />
            <Text style={[styles.infoTitle, headingFont]}>การมอบหมาย</Text>
          </View>
          <Row label="ประเภทงาน" value={order.jobTypeLabel} />
          <Row label="ความเร่งด่วน" value={order.priorityLabel} />
          {/* ใบเก่าจ่ายรายคน ใบใหม่จ่ายเป็นทีม — แสดงตามที่ใบนั้นเป็นจริง */}
          <Row
            label={order.assignedToName ? "ช่างที่รับผิดชอบ" : "ทีมที่รับผิดชอบ"}
            value={order.assignedToName ?? order.assignedTeam ?? "ยังไม่มอบหมาย"}
          />
          <Row label="วันนัด" value={visitLabel(order)} />
          {order.appointmentStatusLabel ? (
            <Row label="สถานะนัด" value={order.appointmentStatusLabel} />
          ) : null}
          <Row
            label="เปิดโดย"
            value={`${order.createdByName ?? "—"} · ${formatDateTime(order.createdAt)}`}
          />
          <Row label="ที่มา" value={order.source === "OUTAGE" ? "เปิดจากกระดาน" : "เปิดเอง"} />
        </View>
      </View>

      {/* อาการกับสถานะ — กรอกที่นี่ที่เดียว กระดานดึงไปแสดงเอง */}
      <View style={card}>
        <View style={styles.headRow}>
          <Text style={styles.sectionTitle}>อาการ / สถานะ</Text>
          <View style={{ flex: 1 }} />
          {!done && !viewOnly ? (
            <TouchableOpacity
              style={styles.editNote}
              onPress={() => setEditingNote(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={15} color={colors.primary} />
              <Text style={styles.editNoteText}>แก้ไข</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {order.symptom ||
        order.workStatusLabel ||
        order.inspectionNote ||
        order.waitingParts.length > 0 ? (
          <>
            <Row label="อาการ" value={order.symptom ?? "—"} />
            {/*
              ไม่มีค่าที่กรอกไว้ก็บอกตามขั้นของใบงานแทน "ยังไม่ระบุ"

              ขั้นของใบงานบอกได้อยู่แล้วว่าตอนนี้รออะไร คำว่า "ยังไม่ระบุ" จึงเป็น
              การบอกว่าไม่รู้ ทั้งที่รู้ — และดูแปลกที่สุดบนใบที่ปิดไปแล้ว
              ซึ่งขึ้นว่ายังไม่ระบุทั้งที่จบไปเรียบร้อย
            */}
            <Row label="สถานะ" value={order.workStatusLabel ?? order.statusLabel} />
            {order.inspectionNote ? (
              <Row
                label="ผลตรวจหน้างาน"
                value={`${order.inspectionNote}${order.inspectedAt ? ` (${formatDate(order.inspectedAt)})` : ""}`}
              />
            ) : null}
            {order.waitingParts.length > 0 ? (
              <>
                <Text style={styles.partsHead}>อะไหล่ที่ต้องใช้</Text>
                {order.waitingParts.map((part) => (
                  <View key={part.sparePartId}>
                    <View style={styles.partRow}>
                      <Text style={styles.partCode}>
                        {part.partCode} × {part.quantity}
                      </Text>
                      <Text style={styles.partName} numberOfLines={1}>
                        {part.name}
                      </Text>
                      {/* ผลเช็คคลัง — ว่างคือยังไม่มีใครเช็ค ต่างจากเช็คแล้วพบว่าหมด */}
                      {part.inStock === null ? (
                        <Text style={styles.stockPending}>ยังไม่เช็ค</Text>
                      ) : part.inStock ? (
                        <Text style={styles.stockIn}>{part.warehouse ?? "มีของ"}</Text>
                      ) : (
                        <Text style={partsOut.length ? styles.stockOutPill : styles.stockOut}>หมด</Text>
                      )}
                    </View>
                    {/* เลขใบเบิกอยู่บรรทัดของตัวเอง แถวเดียวกับคลังจะยาวเกินจอมือถือ */}
                    {part.requisitionNo ? (
                      <Text style={styles.partRequisition}>ใบเบิก {part.requisitionNo}</Text>
                    ) : null}
                  </View>
                ))}
              </>
            ) : null}
          </>
        ) : (
          <Text style={styles.linkedText}>ยังไม่ได้กรอก — กดแก้ไขเพื่อใส่อาการและสถานะ</Text>
        )}

        {order.outageId !== null ? (
          <Text style={styles.linkedText}>
            ค่าที่กรอกที่นี่จะขึ้นบนกระดานติดตามเครื่องเสียของเคสนี้ให้เอง
          </Text>
        ) : null}
      </View>

      {/*
        รูปหน้างาน — อยู่ต่อจากอาการเพราะเป็นเรื่องเดียวกัน คือ "เจออะไร"
        ปิดงานแล้วแนบเพิ่มไม่ได้ ใบที่ปิดแล้วคือบันทึกที่จบไปแล้ว
        ยกเว้นแอดมินที่ยังต้องเอาของที่ไม่ควรอยู่ในระบบออกได้
      */}
      <WorkOrderAttachments
        workOrderId={order.id}
        canEdit={!viewOnly && (!done || user?.role === "ADMIN")}
        reloadKey={filesKey}
        onLoaded={setFiles}
        onAdded={load}
        inspection={
          order.status === "INSPECTING" || order.inspectedAt
            ? { since: order.inspectionStartedAt ?? null, active: order.status === "INSPECTING" }
            : undefined
        }
      />

      {/*
        ใบที่ปิดแล้วไม่ต้องขึ้นการ์ดนี้ เพราะคำตอบเดียวกันไปอยู่ในการ์ดผลการทำงาน
        ซึ่งเป็นที่ที่คนเปิดดูใบที่ปิดแล้วมองหาอยู่แล้ว — สองการ์ดที่พูดเรื่องเดียวกัน
        คือการบังคับให้คนอ่านสองรอบเพื่อรู้เท่าเดิม
      */}
      {order.outageId !== null && !order.closedAt ? (
        <View style={[card, styles.linked]}>
          <View style={styles.headRow}>
            <Ionicons
              name={order.outageStillOpen ? "alert-circle" : "checkmark-circle"}
              size={17}
              color={order.outageStillOpen ? colors.danger : colors.success}
            />
            <Text style={styles.linkedTitle}>
              {order.outageStillOpen ? "เครื่องยังไม่กลับมา" : "เครื่องกลับมาแล้ว"}
            </Text>
          </View>
          <Text style={styles.linkedText}>
            {order.outageStillOpen
              ? "เคสบนกระดานยังเปิดอยู่ ระบบจะปิดให้เองเมื่อเครื่องหายไปจากไฟล์รายงานรอบถัดไป — ปิดใบงานไม่ได้ปิดเคส"
              : "เคสบนกระดานปิดไปแล้ว เพราะเครื่องหายไปจากไฟล์รายงาน"}
          </Text>
        </View>
      ) : null}

      {order.closedAt || rejected ? (
        <View style={card}>
          <Text style={styles.sectionTitle}>{rejected ? "ผลการทำงานรอบที่ถูกตีกลับ" : "ผลการทำงาน"}</Text>
          {rejected ? (
            <View style={styles.verdictBad}>
              <Ionicons name="arrow-undo" size={16} color={colors.danger} />
              <Text style={styles.verdictBadText}>
                Remark: ตีกลับเพราะ {rejected.rejectReason ?? "—"}
                {rejected.reviewedAt ? ` · ${formatDateTime(rejected.reviewedAt)}` : ""}
              </Text>
            </View>
          ) : null}
          <Row label="ผล" value={order.closeResultLabel ?? "—"} />
          {/* สรุปงานคือสิ่งที่คนเปิดใบปิดแล้วมาหา (เจ้าของงานให้ตัวหนา) — เดิมเป็นตัวเทาเล็กไม่มีหัวข้อ */}
          {order.closeNote ? (
            <View style={[styles.summaryBox, closedOk && styles.summaryBoxDone]}>
              <Text style={styles.summaryLabel}>สรุปงานที่ทำ</Text>
              <Text style={styles.summaryText}>{order.closeNote}</Text>
            </View>
          ) : null}
          {/* คนที่ไปจริง ต่างจาก "ปิดโดย" ซึ่งเป็นคนที่กดปุ่ม — ทีมหนึ่งไปหลายคน
              แต่คนที่กดปิดมีคนเดียว */}
          <Row
            label="ผู้เข้าปฏิบัติงาน"
            value={
              [order.workers.map((w) => w.name).join(", "), order.otherWorkers]
                .filter(Boolean)
                .join(" · ") || "—"
            }
          />
          <Row
            label="ปิดโดย"
            value={`${order.closedByName ?? "—"} · ${formatDateTime(order.closedAt ?? rejected?.createdAt ?? null)}`}
          />

          {/*
            ปิดใบงานคือ "คนไปทำแล้ว" ส่วนเคสปิดคือ "เครื่องกลับมาแล้ว" ซึ่งคนละเรื่องกัน
            ช่างเปลี่ยนอะไหล่แล้วเครื่องยังไม่กลับมาก็มี และต้องเห็นว่าเป็นแบบนั้น
            ไม่ใช่กลบด้วยการถือว่าปิดงานแล้วจบ
          */}
          {/*
            ไฟล์ของรอบที่ปิดจริง ไม่ใช่ทุกรูปตั้งแต่เปิดใบงาน

            ใบที่เข้าหน้างานหลายรอบมีรูปปนกันหลายรอบ คนที่เปิดมาดูใบที่ปิดแล้ว
            อยากเห็นว่า "รอบที่จบ เขาถ่ายอะไรมา" ไม่ใช่กองรูปทั้งหมดตั้งแต่ต้น
          */}
          {closeFiles.length > 0 ? (
            <>
              <Text style={styles.partsHead}>รูปที่ส่งตอนปิดงาน</Text>
              {viewingClose !== null ? (
                <ImageViewer
                  workOrderId={order.id}
                  items={closeShown}
                  startIndex={viewingClose}
                  onClose={() => setViewingClose(null)}
                />
              ) : null}
              {/*
                ก่อนซ่อม | หลังซ่อม วางคู่กันให้เทียบได้ทันที (เจ้าของงานขอ ต.ค. 69) — ไฟล์อื่น
                (ป้ายรุ่น ใบเหลือง หลักฐานเคลม รูปหน้างานแบบเดิม) เป็นแถวแยกด้านล่างเหมือนเดิม
                ลำดับในหน้าดูรูปเต็มจอตามที่วางบนจอ: ก่อน → หลัง → อื่น ๆ
              */}
              {beforeShots.length + afterShots.length > 0 ? (
                <View style={styles.compare}>
                  {([["ก่อนซ่อม", beforeShots, styles.compareBefore], ["หลังซ่อม", afterShots, styles.compareAfter]] as const).map(
                    ([label, list, tone]) => (
                      <View key={label} style={[styles.compareCol, tone]}>
                        <Text style={[styles.compareHead, label === "ก่อนซ่อม" ? styles.compareHeadBefore : styles.compareHeadAfter]}>
                          {label} · {list.length}
                        </Text>
                        <View style={styles.closeFiles}>
                          {list.map((f) => (
                            <CloseThumb key={f.id} f={f} onPress={() => setViewingClose(closeShown.findIndex((x) => x.id === f.id))} />
                          ))}
                        </View>
                      </View>
                    )
                  )}
                </View>
              ) : null}
              {otherShots.length > 0 ? (
                <View style={styles.closeFiles}>
                  {otherShots.map((f) => (
                    <CloseThumb key={f.id} f={f} badge onPress={() => setViewingClose(closeShown.findIndex((x) => x.id === f.id))} />
                  ))}
                </View>
              ) : null}
            </>
          ) : null}

          {order.outcomeVerdict === "CLEARED" ? (
            <View style={styles.verdictOk}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.verdictOkText}>
                อาการหายแล้ว — เครื่องหายไปจากไฟล์รายงานเมื่อ {formatDate(order.outageEndedAt)}
              </Text>
            </View>
          ) : order.outcomeVerdict === "STILL_DOWN" ? (
            <View style={styles.verdictBad}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.verdictBadText}>
                อาการยังไม่หาย — เครื่องยังขึ้นว่าดับอยู่ในไฟล์รายงานรอบล่าสุด
                เคสบนกระดานจะปิดเองเมื่อเครื่องหายไปจากไฟล์รอบถัดไป
              </Text>
            </View>
          ) : order.outageId === null ? (
            <Text style={styles.linkedText}>
              ใบนี้เปิดเอง ไม่ได้ผูกกับเคสบนกระดาน จึงเทียบกับไฟล์รายงานไม่ได้
            </Text>
          ) : null}
          {order.parts.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>อะไหล่ที่ใช้</Text>
              {order.parts.map((p) => (
                <Text key={p.sparePartId} style={styles.partLine}>
                  {p.partCode} · {p.name} × {p.quantity}
                </Text>
              ))}
            </>
          ) : null}
        </View>
      ) : null}

      <History logs={order.logs} closed={closedOk} />

      {canFollowUp ? (
        <TouchableOpacity
          style={styles.deleteRow}
          onPress={() => setFollowUpOpen(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="git-branch-outline" size={16} color={colors.primary} />
          <Text style={[styles.deleteText, { color: colors.primary }]}>เปิดใบงานรออะไหล่ต่อ</Text>
        </TouchableOpacity>
      ) : null}

      {user?.role === "ADMIN" && !order.isTest ? (
        <TouchableOpacity style={styles.deleteRow} onPress={confirmTestCopy} activeOpacity={0.7}>
          <Ionicons name="copy-outline" size={16} color={colors.primary} />
          <Text style={[styles.deleteText, { color: colors.primary }]}>คัดลอกเป็นใบทดสอบ</Text>
        </TouchableOpacity>
      ) : null}

      {/*
        ลบถาวร — แอดมินเท่านั้น และอยู่ท้ายสุดโดยตั้งใจ

        ต่างจากยกเลิก: ยกเลิกเก็บใบไว้พร้อมประวัติว่าใครยกเลิกเมื่อไหร่
        ส่วนลบคือหายไปทั้งใบ มีไว้สำหรับใบที่ไม่ควรมีอยู่ตั้งแต่แรก
        — เปิดผิดสาขา เปิดซ้ำ หรือใบที่ลองระบบ
      */}
      {user?.role === "ADMIN" ? (
        <TouchableOpacity
          style={styles.deleteRow}
          onPress={confirmDelete}
          disabled={deleting}
          activeOpacity={0.7}
        >
          {deleting ? (
            <Spinner color={colors.danger} size="small" />
          ) : (
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          )}
          <Text style={styles.deleteText}>ลบใบงานนี้ถาวร</Text>
        </TouchableOpacity>
      ) : null}

      <RollbackModal
        visible={rollbackOpen}
        order={order}
        reasons={sendBackReasons}
        onCancel={() => setRollbackOpen(false)}
        onDone={async () => {
          setRollbackOpen(false);
          // ส่งกลับอาจแนบรูปที่เจอหน้างานไปด้วย การ์ดไฟล์แนบต้องโหลดใหม่ถึงจะเห็น
          setFilesKey((k) => k + 1);
          await reloadWithNotice();
        }}
      />

      <FollowUpModal
        visible={followUpOpen}
        order={order}
        onCancel={() => setFollowUpOpen(false)}
        onDone={async (code) => {
          setFollowUpOpen(false);
          showAlert("เปิดใบงานรออะไหล่แล้ว", `${code} ไปอยู่ที่หัวหน้าภาค และลิงก์กับ ${order.code}`);
          await load();
        }}
      />

      {etaOpen ? (
        <PartsEtaModal
          order={order}
          onCancel={() => setEtaOpen(false)}
          onDone={async () => {
            setEtaOpen(false);
            await reloadWithNotice("อัปเดตวันคาดว่าอะไหล่เข้าแล้ว");
          }}
        />
      ) : null}

      <StageBackModal
        visible={stageBackOpen}
        order={order}
        targets={backTargets}
        onCancel={() => setStageBackOpen(false)}
        onDone={async () => {
          setStageBackOpen(false);
          await reloadWithNotice();
        }}
      />

      <StageModal
        visible={stageOpen}
        order={order}
        warehouses={warehouses}
        teams={teams}
        files={files}
        onFilesChanged={() => setFilesKey((k) => k + 1)}
        onCancel={() => setStageOpen(false)}
        onDone={async () => {
          setStageOpen(false);
          // ขั้นเสนอราคาแนบใบเสนอราคา/บิลไปด้วย การ์ดไฟล์แนบต้องโหลดใหม่ถึงจะเห็น
          setFilesKey((k) => k + 1);
          await reloadWithNotice();
        }}
      />

      <NoteModal
        visible={editingNote}
        order={order}
        workStatuses={workStatuses}
        priorities={priorities}
        onCancel={() => setEditingNote(false)}
        onDone={async () => {
          setEditingNote(false);
          await reloadWithNotice("บันทึกแล้ว");
        }}
      />

      <CloseModal
        visible={closing}
        order={order}
        results={results}
        technicians={technicians}
        onCancel={() => setClosing(false)}
        onDone={async () => {
          setClosing(false);
          // ปิดงานอาจแนบรูปใบเหลืองไปด้วย การ์ดไฟล์แนบต้องโหลดใหม่ถึงจะเห็น
          setFilesKey((k) => k + 1);
          await reloadWithNotice();
        }}
      />

      <StepInfo
        stageValue={stepInfo}
        stages={stages}
        logs={order.logs}
        onClose={() => setStepInfo(null)}
      />
    </ScrollView>
    </PopupScreen>
  );
}

/**
 * ขั้นที่ทำแล้ว — ใครทำ เมื่อไร บันทึกว่าอะไร ดึงจากประวัติของใบงาน
 *
 * เดิมต้องไล่อ่านประวัติทั้งก้อนเพื่อหาว่าใครจ่ายงาน ตอนนี้กดที่วงกลมของขั้นนั้นได้เลย
 */
const STAGE_ACTIONS: Record<string, string[]> = {
  NEW: ["PARTS_REQUESTED", "NO_PARTS", "INSPECT_REQUESTED"],
  INSPECT_CONFIRM: ["CONFIRMED", "RESCHEDULED"],
  INSPECTING: ["INSPECTED"],
  WAITING_PARTS: ["PARTS_ARRIVED"],
  AWAITING_QUOTE: ["QUOTED", "QUOTE_SKIPPED"],
  AWAITING_PAYMENT: ["PAID"],
  PARTS_REQUESTED: ["PARTS_CHECKED"],
  PARTS_SOURCING: ["PARTS_SOURCED", "PARTS_BACKORDERED"],
  PARTS_CHECKED: ["ASSIGNED", "SCHEDULED"],
  AWAITING_CONFIRM: ["CONFIRMED", "RESCHEDULED"],
  ASSIGNED: ["DISPATCHED", "ASSIGNED"],
  IN_PROGRESS: ["CLOSED"],
};

function StepInfo({
  stageValue,
  stages,
  logs,
  onClose,
}: {
  stageValue: string | null;
  stages: Stage[];
  logs: LogEntry[];
  onClose: () => void;
}) {
  const stage = stages.find((x) => x.value === stageValue);
  const actions = stageValue ? STAGE_ACTIONS[stageValue] ?? [] : [];
  // ประวัติเรียงใหม่ก่อนเก่า ตัวแรกที่เจอคือครั้งล่าสุด (ขั้นที่ถูกส่งกลับมาทำซ้ำจะเห็นรอบล่าสุด)
  // คอนเฟิร์ม/เลื่อนใช้ทั้งนัดตรวจและนัดซ่อม — แยกด้วยขั้นที่ส่งต่อไป
  const goesTo = stageValue === "INSPECT_CONFIRM" ? "INSPECTING" : stageValue === "AWAITING_CONFIRM" ? "ASSIGNED" : null;
  const log = logs.find((l) => actions.includes(l.action) && (!goesTo || l.status === goesTo));
  return (
    <AppModal
      visible={stageValue !== null}
      title={`${stage?.label ?? ""} — ทำแล้ว`}
      onClose={onClose}
      width={560}
    >
      {log ? (
        <>
          <ModalRow label="ทำโดย">{log.byName ?? "—"}</ModalRow>
          <ModalRow label="เมื่อ">{formatDateTime(log.createdAt)}</ModalRow>
          <ModalRow label="สิ่งที่ทำ">{log.actionLabel}</ModalRow>
          <ModalRow label="บันทึก">{log.note || "—"}</ModalRow>
        </>
      ) : (
        <Text style={styles.waitingText}>ไม่พบบันทึกของขั้นนี้ในประวัติ (ใบเก่าก่อนมีระบบประวัติ)</Text>
      )}
    </AppModal>
  );
}

/**
 * แก้อาการและสถานะของใบงาน
 *
 * ช่องเดียวกับที่กระดานเคยให้กรอก ย้ายมาอยู่ที่นี่เพราะคนที่รู้คือช่างที่ถือใบงาน
 * ค่าที่บันทึกถูกส่งต่อไปที่เคสให้เอง กระดานจึงไม่ต้องกรอกซ้ำ
 */
/**
 * ปุ่มเดินขั้น — ฟอร์มเปลี่ยนไปตามว่าตอนนี้อยู่ขั้นไหน
 *
 * รวมไว้ตัวเดียวเพราะทั้งสี่ขั้นเป็นเรื่องเดียวกัน คือ "ทำสิ่งที่ค้างอยู่แล้วส่งต่อ"
 * แยกเป็นสี่หน้าจอจะได้โค้ดซ้ำสี่ชุดที่ต้องแก้พร้อมกันทุกครั้ง
 */
/**
 * ยืนยันส่งกลับให้ประเมินอะไหล่ใหม่
 *
 * บังคับให้บอกเหตุผล เพราะหัวหน้าภาคที่รับกลับมาต้องรู้ว่าเจออะไรที่หน้างาน
 * ถึงจะระบุอะไหล่ได้ถูก การส่งกลับเปล่าๆ คือโยนงานกลับโดยไม่บอกอะไรเลย
 */
function RollbackModal({
  visible,
  order,
  reasons,
  onCancel,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  reasons: Option[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [parts, setParts] = useState<PickedPart[]>([]);
  const [files, setFiles] = useState<PickedAttachment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setReasonCode(null);
    setReason("");
    setParts([]);
    setFiles([]);
    setError(null);
  }, [visible]);

  async function addFile(
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | null>
  ) {
    setBusy("กำลังเตรียมไฟล์");
    try {
      const file = await pick(setBusy);
      if (file) setFiles((v) => [...v, file]);
    } catch (e) {
      showAlert("เตรียมไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      /**
       * ส่งรูปขึ้นก่อนแล้วค่อยส่งกลับ
       *
       * ถ้าส่งกลับก่อน ใบงานจะไปโผล่ในกล่องงานของหัวหน้าภาคทันทีโดยยังไม่มีรูป
       * ที่ช่างกำลังจะส่ง — คนที่เปิดดูพอดีจะเห็นแต่ข้อความแล้วตัดสินใจไปแล้ว
       */
      for (const [i, file] of files.entries()) {
        setBusy(`กำลังส่งไฟล์ ${i + 1}/${files.length}`);
        await uploadAttachment(order.id, file);
      }
      setBusy("กำลังส่งกลับ");
      await api.post(`/work-orders/${order.id}/reassess-parts`, {
        reasonCode,
        reason: reason.trim(),
        parts: parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
      });
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
      setBusy(null);
    }
  }

  return (
    <AppModal
      visible={visible}
      onClose={onCancel}
      busy={saving}
      title={<>ปิดงานไม่ได้ · {order.code}</>}
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalSave, (saving || !reason.trim() || !reasonCode) && styles.modalSaveOff]}
            onPress={submit}
            disabled={saving || !reason.trim() || !reasonCode}
            activeOpacity={0.8}
          >
            {saving ? (
              <>
                <Spinner color="#fff" size="small" />
                {busy ? <Text style={styles.modalSaveText}>{busy}</Text> : null}
              </>
            ) : (
              <Text style={styles.modalSaveText}>ส่งกลับ</Text>
            )}
          </TouchableOpacity>
        </View>
      }
    >
      <Text style={styles.linkedText}>
        ใบงานกลับไปที่หัวหน้าภาค ข้อมูลเดิมอยู่ครบ (อะไหล่ที่เบิกแล้ว ทีม รูป ประวัติ) หัวหน้าภาคแก้ได้ทั้งหมด
        แล้วส่งช่างเข้าตรวจหรือเดินต่อ — วันนัดรอบนี้ถูกล้าง
      </Text>

      {/* หมวดก่อนข้อความ — หัวหน้าภาคเห็นทันทีว่าต้องแก้เรื่องไหน (เจ้าของงานขอ ต.ค. 69: "ด้วยเหตุอะไรก็ตาม") */}
      <Text style={styles.modalLabel}>ปิดงานไม่ได้เพราะ</Text>
      <View style={styles.options}>
        {reasons.map((r) => (
          <TouchableOpacity
            key={r.value}
            style={[styles.option, reasonCode === r.value && styles.optionOn]}
            onPress={() => setReasonCode(r.value)}
            activeOpacity={0.7}
            accessibilityLabel={`เหตุ ${r.label}`}
          >
            <Text style={[styles.optionText, reasonCode === r.value && styles.optionTextOn]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.modalLabel}>เจออะไรที่หน้างาน</Text>
      <TextInput
        style={styles.modalInput}
        value={reason}
        onChangeText={setReason}
        placeholder="เช่น ไปถึงแล้วพบว่าบอร์ดควบคุมไหม้ ต้องเปลี่ยน"
        placeholderTextColor={colors.textFaint}
        multiline
        numberOfLines={3}
        accessibilityLabel="เจออะไรที่หน้างาน"
      />

      {/*
        รูปที่เจอหน้างาน — ไม่บังคับ แต่เป็นสิ่งเดียวที่ทำให้หัวหน้าภาค
        ตัดสินใจได้โดยไม่ต้องโทรถามกลับ คำว่า "บอร์ดไหม้" กับรูปบอร์ดที่ไหม้
        พาไปสู่การตัดสินใจคนละแบบ
      */}
      <Text style={styles.modalLabel}>รูป / วิดีโอที่เจอหน้างาน (ไม่บังคับ)</Text>
      <FileStrip files={files} onChange={setFiles} />
      {busy ? (
        <View style={styles.slipRow}>
          <Spinner color={colors.primary} size="small" />
          <Text style={styles.linkedText}>{busy}…</Text>
        </View>
      ) : (
        <View style={styles.options}>
          {Platform.OS !== "web" ? (
            <TouchableOpacity
              style={styles.option}
              onPress={() => addFile((stage) => pickImageAttachment(true, stage))}
              activeOpacity={0.7}
            >
              <Text style={styles.optionText}>ถ่ายรูป</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.option}
            onPress={() => addFile((stage) => pickImageAttachment(false, stage))}
            activeOpacity={0.7}
          >
            <Text style={styles.optionText}>เลือกรูป</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.option}
            onPress={() => addFile(pickVideoAttachment)}
            activeOpacity={0.7}
          >
            <Text style={styles.optionText}>วิดีโอ</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ช่างเห็นของจริงว่าเสียตรงไหน จึงเลือกเองได้เลย ไม่ต้องรอให้ใครเดาแทน */}
      <PartPicker parts={parts} onChange={setParts} label="อะไหล่ที่ขอเบิกเพิ่ม" />
      <Text style={styles.linkedText}>
        ยังบอกไม่ได้ว่าต้องใช้ตัวไหน เว้นว่างได้ — หัวหน้าภาคจะเป็นคนระบุแทน
      </Text>

      {error ? <Text style={styles.modalError}>{error}</Text> : null}
    </AppModal>
  );
}

/**
 * ย้อนขั้นตอน — แอดมินกับหัวหน้าภาคเท่านั้น
 *
 * บอกก่อนกดว่าอะไรจะถูกล้าง เพราะการย้อนลบสิ่งที่คนอื่นทำไว้ (วันนัด ทีม ผลเช็คคลัง)
 * ปุ่มที่ไม่บอกผลคือปุ่มที่คนกดแล้วค่อยมารู้ทีหลังว่าเลขใบเบิกหายไป
 */
/** อะไหล่ไม่ครบ — เปิดใบรออะไหล่ที่ลิงก์กับใบนี้ ใช้ได้ทั้งก่อนและหลังปิดงาน */
function FollowUpModal({
  visible,
  order,
  onCancel,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  onCancel: () => void;
  onDone: (code: string) => void;
}) {
  const [parts, setParts] = useState<PickedPart[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setParts([]);
    setNote("");
    setError(null);
  }, [visible]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ createdChild: { code: string } }>(
        `/work-orders/${order.id}/follow-up`,
        {
          parts: parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
          note: note.trim() || undefined,
        }
      );
      onDone(res.data.createdChild.code);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      visible={visible}
      onClose={onCancel}
      busy={saving}
      title={<>เปิดใบงานรออะไหล่ต่อ · {order.code}</>}
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalSave, (saving || parts.length === 0) && styles.modalSaveOff]}
            onPress={submit}
            disabled={saving || parts.length === 0}
            activeOpacity={0.8}
          >
            {saving ? <Spinner color="#fff" size="small" /> : <Text style={styles.modalSaveText}>เปิดใบงาน</Text>}
          </TouchableOpacity>
        </View>
      }
    >
      <Text style={styles.linkedText}>
        ใบใหม่ลิงก์กับ {order.code} สถานะ “รออะไหล่เข้า” — หัวหน้าภาคเป็นคนดูแล
        ของมาแล้วส่งต่อให้แอดมินเบิก แล้วเดินขั้นตอนเหมือนใบปกติ
      </Text>
      <PartPicker parts={parts} onChange={setParts} label="อะไหล่ที่ยังขาด" />
      <Text style={styles.modalLabel}>บันทึกเพิ่มเติม</Text>
      <TextInput
        style={styles.modalInput}
        value={note}
        onChangeText={setNote}
        placeholder="ไม่ใส่ก็ได้"
        placeholderTextColor={colors.textFaint}
        multiline
        numberOfLines={2}
        accessibilityLabel="บันทึกเพิ่มเติม"
      />
      {error ? <Text style={styles.modalError}>{error}</Text> : null}
    </AppModal>
  );
}

/**
 * เลื่อนวันคาดว่าอะไหล่เข้า — แก้วันอย่างเดียว ผลเช็คคลังรอบนั้นไม่ถูกแตะ
 * ล้างวันได้ (ผู้ขายยังไม่ยืนยัน) ดีกว่าค้างวันเก่าที่รู้อยู่แล้วว่าไม่จริง
 */
function PartsEtaModal({
  order,
  onCancel,
  onDone,
}: {
  order: WorkOrder;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [day, setDay] = useState(order.partsExpectedAt ? order.partsExpectedAt.slice(0, 10) : "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = day === "" || /^\d{4}-\d{2}-\d{2}$/.test(day);
  const unchanged = day === (order.partsExpectedAt ? order.partsExpectedAt.slice(0, 10) : "");

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/work-orders/${order.id}/parts-eta`, { expectedAt: day || null, note: note.trim() || undefined });
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const off = saving || !valid || unchanged;
  return (
    <AppModal
      visible
      onClose={onCancel}
      busy={saving}
      title={<>เลื่อนวันคาดว่าอะไหล่เข้า · {order.code}</>}
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalSave, off && styles.modalSaveOff]}
            onPress={submit}
            disabled={off}
            activeOpacity={0.8}
            accessibilityLabel="บันทึกวันคาดว่าเข้า"
          >
            {saving ? <Spinner color="#fff" size="small" /> : <Text style={styles.modalSaveText}>บันทึก</Text>}
          </TouchableOpacity>
        </View>
      }
    >
      <Text style={styles.linkedText}>
        แก้เฉพาะวัน — ของมาแล้วให้กด “อะไหล่มาแล้ว — อัปเดตสถานะ” แทน
      </Text>
      <DateField value={day} onChange={setDay} label="คาดว่าของเข้า" emptyHint="เว้นว่าง = ยังไม่รู้วัน" />
      <Text style={styles.modalLabel}>หมายเหตุ</Text>
      <TextInput
        style={styles.modalInput}
        value={note}
        onChangeText={setNote}
        placeholder="เช่น ผู้ขายเลื่อนส่งของ"
        placeholderTextColor={colors.textFaint}
        multiline
        numberOfLines={2}
        accessibilityLabel="หมายเหตุเลื่อนวัน"
      />
      {error ? <Text style={styles.modalError}>{error}</Text> : null}
    </AppModal>
  );
}

function StageBackModal({
  visible,
  order,
  targets,
  onCancel,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  targets: Stage[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    // ขั้นก่อนหน้าทันทีเป็นค่าตั้งต้น — ย้อนทีละขั้นคือกรณีที่เจอบ่อยที่สุด
    setTarget(targets[0]?.value ?? null);
    setReason("");
    setError(null);
  }, [visible, targets]);

  const order_ = targets.map((t) => t.value);
  function clears(value: string) {
    const all = ["NEW", "INSPECT_CONFIRM", "INSPECTING", "PARTS_SOURCING", "AWAITING_QUOTE", "AWAITING_PAYMENT", "WAITING_PARTS", "PARTS_REQUESTED", "PARTS_CHECKED", "AWAITING_CONFIRM", "ASSIGNED"];
    const idx = all.indexOf(value);
    const lost: string[] = [];
    if (idx >= 0 && idx <= all.indexOf("PARTS_CHECKED") && order.scheduledAt) lost.push("วันนัด");
    if (idx >= 0 && idx <= all.indexOf("PARTS_CHECKED") && value !== "INSPECTING" && value !== "INSPECT_CONFIRM" && order.assignedTeam)
      lost.push("ทีมที่รับงาน");
    if (idx >= 0 && idx <= all.indexOf("PARTS_REQUESTED") && order.waitingParts.some((p) => p.inStock !== null))
      lost.push("ผลเช็คคลังและเลขใบเบิก");
    return lost;
  }

  async function submit() {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/work-orders/${order.id}/rollback`, { toStage: target, reason: reason.trim() });
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const lost = target ? clears(target) : [];
  return (
    <AppModal
      visible={visible}
      onClose={onCancel}
      busy={saving}
      title={<>ย้อนขั้นตอน · {order.code}</>}
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalSave, (saving || !target || !reason.trim()) && styles.modalSaveOff]}
            onPress={submit}
            disabled={saving || !target || !reason.trim()}
            activeOpacity={0.8}
          >
            {saving ? <Spinner color="#fff" size="small" /> : <Text style={styles.modalSaveText}>ย้อนขั้น</Text>}
          </TouchableOpacity>
        </View>
      }
    >
      <Text style={styles.linkedText}>
        ตอนนี้อยู่ขั้น “{order.statusLabel}” — เลือกขั้นที่จะกลับไปทำใหม่ ประวัติเดิมยังอยู่ครบ
      </Text>
      <Text style={styles.modalLabel}>ย้อนไปขั้น</Text>
      <View style={{ gap: spacing.xs }}>
        {targets.map((t) => (
          <TouchableOpacity
            key={t.value}
            style={[styles.backOption, target === t.value && styles.backOptionOn]}
            onPress={() => setTarget(t.value)}
            activeOpacity={0.7}
            accessibilityLabel={`ย้อนไป ${t.label}`}
          >
            <Text style={styles.backOptionText}>
              {order_.indexOf(t.value) === 0 ? "ขั้นก่อนหน้า · " : ""}
              {t.label}
            </Text>
            {t.actorLabel ? <Text style={styles.backOptionHint}>กลับไปรอ{t.actorLabel}</Text> : null}
          </TouchableOpacity>
        ))}
      </View>
      {lost.length > 0 ? (
        <Text style={styles.warn}>สิ่งที่จะถูกล้าง: {lost.join(" · ")}</Text>
      ) : null}
      <Text style={styles.modalLabel}>เหตุผลที่ย้อน</Text>
      <TextInput
        style={styles.modalInput}
        value={reason}
        onChangeText={setReason}
        placeholder="เช่น ลูกค้าขอเลื่อนนัด · จ่ายผิดทีม · เช็คคลังผิดตัว"
        placeholderTextColor={colors.textFaint}
        multiline
        numberOfLines={2}
        accessibilityLabel="เหตุผลที่ย้อน"
      />
      {error ? <Text style={styles.modalError}>{error}</Text> : null}
    </AppModal>
  );
}

function StageModal({
  visible,
  order,
  warehouses,
  teams,
  files,
  onFilesChanged,
  onCancel,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  warehouses: string[];
  teams: Team[];
  /** ไฟล์แนบของใบงาน (จากการ์ดไฟล์แนบ) — ฟอร์มผลตรวจบอกว่าแนบอะไรไว้แล้ว */
  files: Attachment[];
  /** แนบ/ลบไฟล์จากฟอร์มแล้ว — ให้การ์ดไฟล์แนบโหลดรายการใหม่ */
  onFilesChanged: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [needsParts, setNeedsParts] = useState<boolean | null>(null);
  const [parts, setParts] = useState<PickedPart[]>([]);
  const [checks, setChecks] = useState<
    Record<number, { inStock: boolean | null; warehouse: string | null }>
  >({});
  /**
   * เลขใบเบิกใช้ร่วมกันทั้งใบ เพราะปกติเบิกทีเดียวได้ใบเดียว
   *
   * เก็บรายตัวในฐานข้อมูล แต่หน้าจอให้กรอกช่องเดียว — พิมพ์เลขเดิมห้ารอบ
   * คือทางที่ทำให้พิมพ์ผิดโดยไม่มีใครรู้ ถ้าวันหลังต้องเบิกคนละใบจริง
   * ค่อยเปิดให้แก้รายตัวได้ โดยไม่ต้องแก้ฐานข้อมูลอีก
   */
  const [requisitionNo, setRequisitionNo] = useState("");
  const [team, setTeam] = useState<string | null>(null);
  // เอกสารขั้นเสนอราคา — ใบเสนอราคา และบิลที่ลูกค้าจ่ายแล้ว
  const [doc, setDoc] = useState<PickedAttachment | null>(null);
  const [skipQuote, setSkipQuote] = useState(false);
  // ขั้นรอเบิกอะไหล่: วันที่คาดว่าของที่หมดจะเข้า (ไม่บังคับ)
  const [expectedAt, setExpectedAt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [visit, setVisit] = useState("");
  const [visitTime, setVisitTime] = useState("");
  // ขั้นระบุอะไหล่: ตัวเลือกที่สาม "ต้องเข้าตรวจสอบหน้างานก่อน"
  const [inspectFirst, setInspectFirst] = useState(false);
  // ขั้นตรวจหน้างาน: ผลตรวจ — ไฟล์ตรวจส่งขึ้นทันทีจากกรอบ ไม่ได้ถือไว้ในฟอร์ม
  const [finding, setFinding] = useState("");
  // ขั้นนัดลูกค้า
  // ขั้นคอนเฟิร์มลูกค้า: ลูกค้าตกลงวันเดิม หรือขอเลื่อน (เลื่อนแล้วถึงจะขึ้นช่องวันให้แก้)
  const [confirmChoice, setConfirmChoice] = useState<"OK" | "MOVE" | null>(null);
  // ขั้นเช็คคลัง: มีบางตัวหมดบางตัว — แยกตัวที่หมดไปใบรออะไหล่ (ตั้งต้นเป็นแยก)
  const [splitOut, setSplitOut] = useState(true);
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setNeedsParts(order.needsParts);
    // ใบที่เปิดมาเป็นงานตรวจสอบหน้างานและยังไม่เคยตรวจ — ตัวเลือกที่ถูกเกือบทุกครั้ง
    // ช่างส่งกลับ — ตัวเลือกแรกคือส่งช่างเข้าตรวจ (เจ้าของงานขอ ต.ค. 69) ทีมเดิมเป็นค่าตั้งต้นอยู่แล้ว (ข้างล่าง)
    setInspectFirst(
      order.status === "NEW" && ((order.jobType === "INSPECT" && !order.inspectedAt) || sentBackLog(order) !== null)
    );
    setFinding("");
    // นัดตรวจที่หัวหน้าภาคไม่ได้ใส่วันเสนอ — ไม่มีวันให้ลูกค้า "ตกลง" มีแต่ต้องใส่วันนัด
    setConfirmChoice(order.status === "INSPECT_CONFIRM" && !order.scheduledAt ? "MOVE" : null);
    setSplitOut(true);
    setVisitTime(order.scheduledTime ?? "");
    setParts(order.waitingParts);
    setChecks(
      Object.fromEntries(
        order.waitingParts.map((p) => [p.sparePartId, { inStock: p.inStock, warehouse: p.warehouse }])
      )
    );
    /**
     * เปิดซ้ำให้เห็นเลขที่เคยกรอกไว้ ไม่ใช่ช่องว่างที่ต้องหาเลขมาพิมพ์ใหม่
     *
     * แต่ไม่เอาเลขของตัวที่เบิกไปแล้วมาตั้งต้น — รอบนี้เป็นการเบิกของที่เพิ่งเข้ามา
     * ซึ่งเป็นใบเบิกคนละใบ ถ้าเติมเลขเก่าไว้ให้ คนจะกดบันทึกผ่านโดยไม่ทันดู
     * แล้วของสองรอบจะอ้างใบเบิกใบเดียวกันทั้งที่เบิกคนละวัน
     */
    const pending = order.waitingParts.filter((p) => !(p.inStock === true && p.requisitionNo));
    setRequisitionNo(pending.find((p) => p.requisitionNo)?.requisitionNo ?? "");
    // ทีมของสาขาเป็นค่าตั้งต้น เพราะเป็นทีมที่รับผิดชอบสาขานี้อยู่แล้ว
    // จ่ายข้ามทีมยังทำได้ แต่ต้องตั้งใจเลือก ไม่ใช่เผลอ
    setTeam(order.assignedTeam ?? order.suggestedTeam ?? null);
    setDoc(null);
    setSkipQuote(false);
    setExpectedAt(order.partsExpectedAt ? order.partsExpectedAt.slice(0, 10) : "");
    setVisit(order.scheduledAt ? order.scheduledAt.slice(0, 10) : "");
    setNote("");
    setError(null);
  }, [visible, order]);

  async function pickDoc(
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | null>
  ) {
    setBusy("กำลังเตรียมไฟล์");
    try {
      const file = await pick(setBusy);
      if (file) setDoc(file);
    } catch (e) {
      showAlert("เตรียมไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      if (order.status === "NEW" && inspectFirst) {
        await api.post(`/work-orders/${order.id}/inspect-request`, {
          team,
          scheduledAt: visit || null,
          scheduledTime: visit && visitTime ? visitTime : null,
          note: note.trim() || undefined,
        });
      } else if (order.status === "INSPECTING") {
        await api.post(`/work-orders/${order.id}/inspection`, { note: finding.trim() });
      } else if (order.status === "WAITING_PARTS") {
        await api.post(`/work-orders/${order.id}/parts-arrived`, { note: note.trim() || undefined });
      } else if (order.status === "AWAITING_CONFIRM" || order.status === "INSPECT_CONFIRM") {
        // ตกลงวันเดิมไม่ส่งวันไป — เซิร์ฟเวอร์ใช้วันที่หัวหน้าภาคใส่ไว้ จะได้ไม่บันทึกว่าเลื่อนเพราะเผลอแตะช่องวัน
        await api.post(
          `/work-orders/${order.id}/confirm-appointment`,
          confirmChoice === "MOVE"
            ? { scheduledAt: visit, scheduledTime: visitTime || null, note: note.trim() || undefined }
            : { note: note.trim() || undefined }
        );
      } else if (order.status === "NEW") {
        await api.post(`/work-orders/${order.id}/parts`, {
          needsParts,
          parts: needsParts
            ? parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity }))
            : [],
          note: note.trim() || undefined,
        });
      } else if (order.status === "PARTS_REQUESTED") {
        await api.post(`/work-orders/${order.id}/parts-check`, {
          // ส่งเฉพาะตัวที่ยังไม่ได้เบิก ตัวที่เบิกไปแล้วเซิร์ฟเวอร์ไม่แตะ
          results: thisRound.map((p) => ({
            sparePartId: p.sparePartId,
            inStock: checks[p.sparePartId]?.inStock ?? false,
            warehouse: checks[p.sparePartId]?.warehouse ?? null,
            requisitionNo: requisitionNo.trim() || null,
          })),
          splitOut: mixed && splitOut,
          expectedAt: checkOut && expectedAt ? expectedAt : null,
          note: note.trim() || undefined,
        });
      } else if (order.status === "PARTS_SOURCING") {
        await api.post(`/work-orders/${order.id}/parts-sourcing`, {
          results: thisRound.map((p) => ({ sparePartId: p.sparePartId, inStock: checks[p.sparePartId]?.inStock === true })),
          expectedAt: sourcingOut.length && expectedAt ? expectedAt : null,
          note: note.trim() || undefined,
        });
      } else if (order.status === "AWAITING_QUOTE") {
        if (skipQuote) {
          await api.post(`/work-orders/${order.id}/quote`, { skip: true, note: note.trim() });
        } else {
          // เอกสารต้องขึ้นก่อนสั่งส่งต่อ เพราะเซิร์ฟเวอร์เช็คว่ามีแล้วหรือยัง
          if (doc) {
            setBusy("กำลังส่งใบเสนอราคา");
            await uploadAttachment(order.id, doc, "QUOTE");
          }
          await api.post(`/work-orders/${order.id}/quote`, { note: note.trim() || undefined });
        }
      } else if (order.status === "AWAITING_PAYMENT") {
        if (doc) {
          setBusy("กำลังส่งบิล");
          await uploadAttachment(order.id, doc, "RECEIPT");
        }
        await api.post(`/work-orders/${order.id}/payment`, { note: note.trim() || undefined });
      } else if (order.status === "ASSIGNED") {
        await api.post(`/work-orders/${order.id}/dispatch`, {
          team,
          note: note.trim() || undefined,
        });
      } else {
        await api.post(`/work-orders/${order.id}/assign`, {
          team,
          scheduledAt: visit,
          scheduledTime: visitTime || null,
          note: note.trim() || undefined,
        });
      }
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
      setBusy(null);
    }
  }

  /**
   * ตัวที่เบิกออกมาแล้วรอบก่อน ไม่ใช่เรื่องของรอบนี้
   *
   * ของที่หมดทำให้ใบงานค้างอยู่ขั้นนี้ แอดมินกลับมาอีกรอบตอนของเข้า —
   * ตัวที่เบิกไปแล้วมีเลขใบเบิกของตัวเองจากรอบก่อน ต้องไม่ถูกเขียนทับ
   * ด้วยเลขของรอบนี้ เพราะเป็นคนละใบคนละวัน
   */
  const issued = order.waitingParts.filter((p) => p.inStock === true && p.requisitionNo);
  const thisRound = order.waitingParts.filter((p) => !(p.inStock === true && p.requisitionNo));

  const unchecked =
    order.status === "PARTS_REQUESTED" &&
    thisRound.some((p) => {
      const c = checks[p.sparePartId];
      return c?.inStock === null || c?.inStock === undefined || (c.inStock && !c.warehouse);
    });
  // มีของอย่างน้อยหนึ่งตัวในรอบนี้ = ต้องเบิก = ต้องมีเลขใบเบิก
  const needsRequisition =
    order.status === "PARTS_REQUESTED" &&
    thisRound.some((p) => checks[p.sparePartId]?.inStock === true) &&
    !requisitionNo.trim();
  // ขั้นเสนอราคาต้องมีเอกสาร เว้นแต่กดข้ามซึ่งต้องบอกเหตุผลแทน
  const quoteBlocked =
    order.status === "AWAITING_QUOTE" &&
    (skipQuote ? !note.trim() : !doc && !order.hasQuote);
  // ขั้นรอเบิกอะไหล่ต้องตอบครบทุกตัวที่ยังไม่ได้เบิก — ตอบบางตัวแล้วไปเสนอราคา คือเสนอราคาของที่ยังไม่รู้ว่ามี
  // (ตัวที่เบิกไปแล้วรอบก่อน ลูกค้าจ่ายไปแล้ว ไม่ต้องเช็คและเสนอราคาซ้ำ)
  const sourcingOut = order.status === "PARTS_SOURCING" ? thisRound.filter((p) => checks[p.sparePartId]?.inStock === false) : [];
  const sourcingBlocked =
    order.status === "PARTS_SOURCING" &&
    (thisRound.some((p) => typeof checks[p.sparePartId]?.inStock !== "boolean") ||
      (expectedAt !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(expectedAt)));
  const paymentBlocked =
    order.status === "AWAITING_PAYMENT" && !doc && !order.hasReceipt;

  /**
   * มีบางตัว หมดบางตัว — ถึงจะถามเรื่องแยกใบ ของครบหรือหมดทุกตัวไม่มีอะไรให้แยก
   * นับตัวที่เบิกไปแล้วรอบก่อนเป็น "มีของ" ด้วย เพราะเป็นของที่ช่างถือไปซ่อมได้
   */
  const mixed =
    order.status === "PARTS_REQUESTED" &&
    thisRound.some((p) => checks[p.sparePartId]?.inStock === false) &&
    (issued.length > 0 || thisRound.some((p) => checks[p.sparePartId]?.inStock === true));
  // ตอบว่าหมดสักตัว = มีของให้รอ ถามวันคาดว่าเข้า (แยกใบแล้ววันนี้ไปติดใบรออะไหล่)
  const checkOut = order.status === "PARTS_REQUESTED" && thisRound.some((p) => checks[p.sparePartId]?.inStock === false);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(visit);
  const timeOk = visitTime === "" || isTime(visitTime);

  // ไฟล์ตรวจครบไหม — อ่านจากรายการไฟล์ชุดเดียวกับการ์ด แนบจากการ์ดไว้ก่อนก็นับ
  const inspectMissing = order.status === "INSPECTING" ? missingInspection(files, order.inspectionStartedAt) : [];

  const blocked =
    quoteBlocked ||
    sourcingBlocked ||
    paymentBlocked ||
    (order.status === "NEW" &&
      (inspectFirst
        ? !team || (visit !== "" && !validDate) || !timeOk
        : needsParts === null || (needsParts && parts.length === 0))) ||
    (order.status === "INSPECTING" && (!finding.trim() || inspectMissing.length > 0)) ||
    (order.status === "ASSIGNED" && !team) ||
    (order.status === "PARTS_CHECKED" && (!team || !validDate || !timeOk)) ||
    ((order.status === "AWAITING_CONFIRM" || order.status === "INSPECT_CONFIRM") &&
      (confirmChoice === null ||
        (confirmChoice === "MOVE" &&
          (!validDate || !timeOk || (visit === (order.scheduledAt ?? "").slice(0, 10) && visitTime === (order.scheduledTime ?? "")))))) ||
    unchecked ||
    needsRequisition ||
    (checkOut && expectedAt !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(expectedAt));

  return (
    <AppModal
      visible={visible}
      onClose={onCancel}
      busy={saving}
      title={<>
              {STAGE_BUTTON[order.status]?.label ?? "ทำขั้นนี้"}{" "}
              · {order.code}
            </>}
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalSave, (saving || blocked) && styles.modalSaveOff]}
            onPress={submit}
            disabled={saving || blocked}
            activeOpacity={0.8}
          >
            {saving ? (
              <Spinner color="#fff" size="small" />
            ) : (
              <Text style={styles.modalSaveText}>
                {order.status === "PARTS_SOURCING"
                  ? sourcingOut.length
                    ? "อะไหล่หมด — รอของเข้า"
                    : "มีอะไหล่ — ไปเสนอราคา"
                  : "ยืนยัน"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      }
    >

            {order.status === "NEW" ? (
              <>
                <Text style={styles.modalLabel}>งานนี้ต้องใช้อะไหล่ไหม</Text>
                <View style={styles.options}>
                  <TouchableOpacity
                    style={[styles.option, !inspectFirst && needsParts === true && styles.optionOn]}
                    onPress={() => {
                      setInspectFirst(false);
                      setNeedsParts(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.optionText, !inspectFirst && needsParts === true && styles.optionTextOn]}
                    >
                      ใช้อะไหล่
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.option, !inspectFirst && needsParts === false && styles.optionOn]}
                    onPress={() => {
                      setInspectFirst(false);
                      setNeedsParts(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.optionText, !inspectFirst && needsParts === false && styles.optionTextOn]}
                    >
                      ไม่ใช้อะไหล่
                    </Text>
                  </TouchableOpacity>
                  {/*
                    ยังตอบไม่ได้จนกว่าจะมีคนไปดู — เดิมต้องตอบ "ไม่ใช้อะไหล่" ไปก่อน
                    แล้วรอช่างส่งกลับ ซึ่งประวัติจะบอกว่าตัดสินแล้วทั้งที่ยังไม่รู้
                  */}
                  <TouchableOpacity
                    style={[styles.option, inspectFirst && styles.optionOn]}
                    onPress={() => setInspectFirst(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.optionText, inspectFirst && styles.optionTextOn]}>
                      ต้องเข้าตรวจสอบหน้างานก่อน
                    </Text>
                  </TouchableOpacity>
                </View>
                {order.inspectionNote ? (
                  <View style={styles.issuedBox}>
                    <Text style={styles.issuedTitle}>ผลตรวจหน้างาน</Text>
                    <Text style={styles.issuedLine}>{order.inspectionNote}</Text>
                  </View>
                ) : null}
                {inspectFirst ? (
                  <>
                    <Text style={styles.linkedText}>
                      ส่งทีมไปดูก่อน — แอดมินโทรนัดร้านก่อน นัดแล้วใบงานถึงทีม ทีมบันทึกผลตรวจแล้ว
                      ใบงานจะกลับมาให้ระบุอะไหล่จากผลนั้น
                    </Text>
                    <DateField
                      value={visit}
                      onChange={setVisit}
                      label="วันที่เสนอเข้าตรวจ"
                      emptyHint="เว้นว่างได้ — แอดมินใส่วันตอนนัดร้าน"
                    />
                    {visit ? <TimeField value={visitTime} onChange={setVisitTime} label="เวลา" /> : null}
                  </>
                ) : needsParts === true ? (
                  <PartPicker parts={parts} onChange={setParts} label="อะไหล่ที่ต้องใช้" />
                ) : needsParts === false ? (
                  <Text style={styles.linkedText}>
                    ข้ามขั้นเช็คคลัง ไปจัดคิวช่างเลย — เช่น ให้เข้าไปประเมินอาการก่อน
                    ถ้าไปถึงแล้วต้องเปลี่ยนอะไหล่ ช่างส่งกลับมาให้ประเมินใหม่ได้
                  </Text>
                ) : null}
              </>
            ) : null}

            {order.status === "PARTS_SOURCING" ? (
              <View style={styles.checkList}>
                <Text style={styles.linkedText}>
                  งานนี้ต้องเสนอราคาลูกค้า — เช็คอะไหล่ตามที่หัวหน้าภาคระบุว่ามีหรือหมด มีครบกด “มีอะไหล่” ไปเสนอราคา หมดตัวไหนรอของเข้าที่ขั้นนี้
                  (ยังไม่ต้องใส่คลังหรือเลขใบเบิก — เบิกจริงหลังลูกค้าจ่ายเงิน)
                </Text>
                {thisRound.map((part) => {
                  const c = checks[part.sparePartId] ?? { inStock: null, warehouse: null };
                  const set = (inStock: boolean) =>
                    setChecks((v) => ({ ...v, [part.sparePartId]: { inStock, warehouse: c.warehouse } }));
                  return (
                    <View key={part.sparePartId} style={styles.checkItem}>
                      <Text style={styles.checkCode}>
                        {part.partCode} × {part.quantity}
                      </Text>
                      <Text style={styles.checkName}>{part.name}</Text>
                      <View style={styles.options}>
                        <TouchableOpacity
                          style={[styles.option, c.inStock === true && styles.optionOn]}
                          onPress={() => set(true)}
                          activeOpacity={0.7}
                          accessibilityLabel={`มีของ ${part.partCode}`}
                        >
                          <Text style={[styles.optionText, c.inStock === true && styles.optionTextOn]}>มีอะไหล่</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.option, c.inStock === false && styles.optionOut]}
                          onPress={() => set(false)}
                          activeOpacity={0.7}
                          accessibilityLabel={`หมด ${part.partCode}`}
                        >
                          <Text style={[styles.optionText, c.inStock === false && styles.optionTextOut]}>หมด</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
                {sourcingOut.length ? (
                  <DateField
                    value={expectedAt}
                    onChange={setExpectedAt}
                    label="คาดว่าของเข้า"
                    emptyHint="ไม่บังคับ — ใส่แล้วรายการเตือนเมื่อเลยกำหนด"
                  />
                ) : null}
                <Text style={styles.linkedText}>
                  {sourcingOut.length
                    ? `หมด ${sourcingOut.length} รายการ — ใบงานรอที่ขั้นนี้ ของมาแล้วกดเช็คอีกรอบแล้วตอบว่ามีครบ`
                    : thisRound.every((p) => checks[p.sparePartId]?.inStock === true)
                      ? "มีครบทุกตัว — ส่งต่อไปเสนอราคาได้เลย"
                      : "ตอบให้ครบทุกตัวก่อน"}
                </Text>
              </View>
            ) : null}
            {order.status === "PARTS_REQUESTED" ? (
              <View style={styles.checkList}>
                {/*
                  ช่องเลขใบเบิกอยู่บนสุด ไม่ใช่ท้ายรายการ

                  อะไหล่ตัวเดียวมีชิปคลังสิบสองอัน สามตัวก็ยาวเกินหน้าจอไปแล้ว
                  ช่องที่อยู่ใต้รายการจึงเท่ากับไม่มีช่อง สำหรับคนที่ไม่ได้เลื่อนลงไปสุด
                  และมันเป็นค่าของทั้งใบเบิก ไม่ได้เป็นของอะไหล่ตัวใดตัวหนึ่ง
                  จึงควรอยู่เหนือรายการอยู่แล้ว

                  โชว์ตลอด ไม่ได้ซ่อนไว้จนกว่าจะตอบว่ามีของ เพราะช่องที่โผล่มา
                  เหนือจุดที่กำลังมองอยู่ จะดันของที่เหลือเลื่อนลงโดยไม่มีใครทันเห็น
                */}
                <Text style={styles.modalLabel}>เลขใบเบิกอะไหล่</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalInputLine]}
                  value={requisitionNo}
                  onChangeText={setRequisitionNo}
                  placeholder="เลขใบเบิกจากระบบคลัง"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="characters"
                  accessibilityLabel="เลขใบเบิกอะไหล่"
                />
                <Text style={needsRequisition ? styles.warn : styles.linkedText}>
                  {needsRequisition
                    ? "ต้องใส่เลขใบเบิกก่อน ถึงจะบันทึกได้ — ใช้กับอะไหล่ที่ตอบว่ามีของในรอบนี้"
                    : "ใช้กับอะไหล่ที่ตอบว่ามีของในรอบนี้ — ของที่หมดยังไม่ได้เบิก จึงไม่ต้องใส่"}
                </Text>

                {issued.length > 0 ? (
                  <View style={styles.issuedBox}>
                    <Text style={styles.issuedTitle}>เบิกไปแล้วรอบก่อน</Text>
                    {issued.map((p) => (
                      <Text key={p.sparePartId} style={styles.issuedLine}>
                        {p.partCode} × {p.quantity} · {p.warehouse ?? "-"} · ใบเบิก {p.requisitionNo}
                      </Text>
                    ))}
                    <Text style={styles.issuedHint}>
                      ไม่ต้องตอบซ้ำ และเลขใบเบิกข้างบนจะไม่ไปทับของรอบนี้
                    </Text>
                  </View>
                ) : null}

                {thisRound.map((part) => {
                  const c = checks[part.sparePartId] ?? { inStock: null, warehouse: null };
                  return (
                    <View key={part.sparePartId} style={styles.checkItem}>
                      <Text style={styles.checkCode}>
                        {part.partCode} × {part.quantity}
                      </Text>
                      <Text style={styles.checkName}>{part.name}</Text>
                      <View style={styles.options}>
                        <TouchableOpacity
                          style={[styles.option, c.inStock === true && styles.optionOn]}
                          onPress={() =>
                            setChecks((v) => ({
                              ...v,
                              [part.sparePartId]: { inStock: true, warehouse: c.warehouse },
                            }))
                          }
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[styles.optionText, c.inStock === true && styles.optionTextOn]}
                          >
                            มีของ
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.option, c.inStock === false && styles.optionOut]}
                          onPress={() =>
                            setChecks((v) => ({
                              ...v,
                              [part.sparePartId]: { inStock: false, warehouse: null },
                            }))
                          }
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[styles.optionText, c.inStock === false && styles.optionTextOut]}
                          >
                            หมด
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {/*
                        12 คลังเป็นชิปต่ออะไหล่หนึ่งตัว แปลว่าอะไหล่สามตัวก็ 36 ชิป
                        กว่าจะเลื่อนถึงช่องเลขใบเบิกข้างล่าง — dropdown ย่อให้เหลือบรรทัดเดียว
                      */}
                      {c.inStock === true ? (
                        <Dropdown
                          value={c.warehouse}
                          placeholder="เลือกคลังที่มีของ"
                          accessibilityLabel={`คลังที่มี ${part.partCode}`}
                          options={warehouses.map((w) => ({ value: w, label: w }))}
                          onChange={(next) =>
                            setChecks((v) => ({
                              ...v,
                              [part.sparePartId]: { inStock: true, warehouse: next },
                            }))
                          }
                        />
                      ) : null}
                    </View>
                  );
                })}
                {mixed ? (
                  <TouchableOpacity
                    style={styles.skipRow}
                    onPress={() => setSplitOut((v) => !v)}
                    activeOpacity={0.7}
                    accessibilityLabel="แยกตัวที่หมดไปใบงานรออะไหล่"
                  >
                    <Ionicons
                      name={splitOut ? "checkbox" : "square-outline"}
                      size={18}
                      color={splitOut ? colors.primary : colors.textFaint}
                    />
                    <Text style={styles.skipText}>
                      แยกตัวที่หมดไปใบงานรออะไหล่ (หัวหน้าภาคดูแล) — ใบนี้ไปซ่อมด้วยของที่มีได้เลย
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {checkOut ? (
                  <DateField
                    value={expectedAt}
                    onChange={setExpectedAt}
                    label="คาดว่าของเข้า"
                    emptyHint="ไม่บังคับ — ใส่แล้วขึ้นบนแถบขั้นตอนคู่กับป้าย “อะไหล่หมด”"
                  />
                ) : null}
                <Text style={styles.linkedText}>
                  {mixed && splitOut
                    ? "ตัวที่หมดจะย้ายไปใบงานใหม่ที่ลิงก์กับใบนี้ ใบนี้ไปขั้นจ่ายงานต่อ"
                    : "มีตัวไหนหมด ใบงานจะขึ้นป้ายแดง “อะไหล่หมด” และค้างที่ขั้นนี้จนของครบ — ของมาแล้วกดเช็คอีกรอบ"}
                </Text>
              </View>
            ) : null}

            {order.status === "AWAITING_QUOTE" || order.status === "AWAITING_PAYMENT" ? (
              <>
                {/*
                  อะไหล่ที่ใส่ให้สาขาแฟรนไชส์ที่หมดประกันแล้วเป็นของที่ขายให้ลูกค้า
                  ต้องเสนอราคาและเก็บเงินก่อนส่งช่างไป ไม่งั้นของออกจากคลังไปแล้ว
                  ค่อยมาตามเก็บเงิน ซึ่งเป็นตอนที่ตามยากที่สุด
                */}
                <Text style={styles.linkedText}>
                  {order.status === "AWAITING_QUOTE"
                    ? "สาขานี้เป็นแฟรนไชส์ที่หมดประกันแล้ว อะไหล่ที่ใช้เป็นของที่ขายให้ลูกค้า — ส่งใบเสนอราคาให้ลูกค้าก่อน"
                    : "ส่งใบเสนอราคาไปแล้ว รอลูกค้าจ่ายเงิน — ได้เงินแล้วแนบบิลเพื่อส่งต่อให้หัวหน้าภาคจ่ายงาน"}
                </Text>

                {skipQuote ? null : (
                  <>
                    <Text style={styles.modalLabel}>
                      {order.status === "AWAITING_QUOTE" ? "ใบเสนอราคา" : "บิลที่ลูกค้าจ่ายแล้ว"}
                    </Text>
                    {(order.status === "AWAITING_QUOTE" ? order.hasQuote : order.hasReceipt) &&
                    !doc ? (
                      <Text style={styles.linkedText}>แนบไว้แล้ว — แนบใหม่ได้ถ้าออกเอกสารใหม่</Text>
                    ) : null}
                    <FileStrip files={doc ? [doc] : []} onChange={(n) => setDoc(n[0] ?? null)} />
                    {busy ? (
                      <View style={styles.slipRow}>
                        <Spinner color={colors.primary} size="small" />
                        <Text style={styles.linkedText}>{busy}…</Text>
                      </View>
                    ) : (
                      <View style={styles.options}>
                        {Platform.OS !== "web" ? (
                          <TouchableOpacity
                            style={styles.option}
                            onPress={() =>
                              pickDoc((stage) => pickImageAttachment(true, stage))
                            }
                            activeOpacity={0.7}
                          >
                            <Text style={styles.optionText}>ถ่ายเอกสาร</Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          style={styles.option}
                          onPress={() => pickDoc((stage) => pickImageAttachment(false, stage))}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.optionText}>เลือกรูป</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.option}
                          onPress={() => pickDoc(() => pickPdfAttachment())}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.optionText}>แนบไฟล์ PDF</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}

                {/*
                  ทะเบียนสาขาส่วนใหญ่ยังไม่มีวันหมดประกัน ระบบจึงเดาว่าหมดแล้วไว้ก่อน
                  ถ้าที่จริงยังอยู่ในประกันหรือตกลงกันแล้วว่าบริษัทออกให้
                  การบังคับให้เสนอราคาคือการล็อกใบงานไว้เฉย ๆ
                */}
                {order.status === "AWAITING_QUOTE" ? (
                  <TouchableOpacity
                    style={styles.skipRow}
                    onPress={() => setSkipQuote((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={skipQuote ? "checkbox" : "square-outline"}
                      size={18}
                      color={skipQuote ? colors.primary : colors.textFaint}
                    />
                    <Text style={styles.skipText}>
                      ไม่ต้องเสนอราคา — ข้ามขั้นนี้ (ต้องบอกเหตุผลในช่องบันทึก)
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}

            {order.status === "ASSIGNED" ||
            order.status === "PARTS_CHECKED" ||
            (order.status === "NEW" && inspectFirst) ? (
              <>
                {order.status === "ASSIGNED" ? <DispatchNote order={order} /> : null}
                {order.status === "PARTS_CHECKED" ? (
                  <Text style={styles.linkedText}>
                    เลือกทีมและวันเข้างาน แล้วแอดมินจะโทรคอนเฟิร์มกับร้าน — ร้านขอเลื่อน แอดมินเปลี่ยนวันให้
                    แล้วส่งกลับมาให้คุณยืนยันออกงานอีกครั้ง
                  </Text>
                ) : null}
                <Text style={styles.modalLabel}>
                  {order.status === "NEW" ? "ทีมที่จะไปตรวจ" : "ทีมที่จะรับงาน"}
                </Text>
                {/*
                  ทีมของสาขาขึ้นก่อนและถูกเลือกไว้ให้ เพราะเป็นคำตอบที่ถูกเกือบทุกครั้ง
                  ทีมอื่นเรียงตามหลัง เลือกได้เมื่อทีมเจ้าของสาขาไม่ว่าง
                */}
{/*
                  22 ทีมเป็นชิปคือกำแพงชิปเต็มจอ ต้องกวาดตาหาทีละอัน
                  dropdown มีช่องค้นหาในตัว พิมพ์ชื่อทีมสามตัวก็เจอ
                  ทีมของสาขายังอยู่บนสุดเหมือนเดิม เพราะเป็นคำตอบที่ถูกเกือบทุกครั้ง
                */}
                <Dropdown
                  value={team}
                  onChange={setTeam}
                  placeholder="เลือกทีม"
                  accessibilityLabel="ทีมที่จะรับงาน"
                  options={[
                    ...(order.suggestedTeam
                      ? [
                          {
                            value: order.suggestedTeam,
                            label: order.suggestedTeam,
                            hint: `ทีม ${order.jobType === "PM" ? "PM" : "CM"} ของสาขานี้`,
                          },
                        ]
                      : []),
                    ...teams
                      .filter((t) => t.name !== order.suggestedTeam)
                      .map((t) => ({
                        value: t.name,
                        label: t.name,
                        hint: `ดูแล ${t.branches} สาขา`,
                      })),
                  ]}
                />
                {teams.length === 0 ? (
                  <Text style={styles.warn}>
                    ยังไม่มีทีมช่างในระบบ — ทีมมาจากคอลัมน์ “ทีมช่าง” ในไฟล์ทะเบียนสาขา
                    ต้องนำเข้าไฟล์ที่มีคอลัมน์นั้นก่อน
                  </Text>
                ) : team && team !== order.suggestedTeam ? (
                  <Text style={styles.warn}>
                    จ่ายข้ามทีม — งาน{order.jobType === "PM" ? " PM " : " "}ของสาขานี้เป็นของ{" "}
                    {order.suggestedTeam ?? "ทีมที่ยังไม่ระบุ"}
                  </Text>
                ) : order.jobType === "PM" && !order.branchPmTeam && order.suggestedTeam ? (
                  <Text style={styles.linkedText}>
                    สาขานี้ไม่ได้ระบุทีม PM ในไฟล์ทะเบียน — ตั้งต้นด้วยทีม CM ให้
                  </Text>
                ) : null}
              </>
            ) : null}

            {order.status === "INSPECTING" ? (
              <>
                <Text style={styles.modalLabel}>ตรวจแล้วเจออะไร</Text>
                <TextInput
                  style={styles.modalInput}
                  value={finding}
                  onChangeText={setFinding}
                  placeholder="เช่น วาล์วน้ำทิ้งค้าง บอร์ดมีรอยไหม้ ต้องเปลี่ยนทั้งสองตัว"
                  placeholderTextColor={colors.textFaint}
                  multiline
                  numberOfLines={3}
                  accessibilityLabel="ผลตรวจหน้างาน"
                />
                <Text style={styles.modalLabel}>ไฟล์ตรวจหน้างาน (ต้องครบ 3 อย่าง)</Text>
                <InspectionSlots
                  workOrderId={order.id}
                  rows={files}
                  since={order.inspectionStartedAt}
                  canEdit
                  compact
                  canRemove={(row) => user?.role === "ADMIN" || row.createdById === user?.id}
                  // ไม่เปิดดูรูปเต็มจอในฟอร์ม — ตัวดูรูปซ้อน Modal บนเว็บไม่น่าเชื่อถือ ดูได้จากการ์ดไฟล์แนบ
                  onOpen={() => {}}
                  onRemove={(row) =>
                    showAlert("ลบไฟล์นี้", `ต้องการลบ "${row.fileName}" ใช่ไหม`, [
                      { text: "ยกเลิก", style: "cancel" },
                      {
                        text: "ลบ",
                        style: "destructive",
                        onPress: async () => {
                          try {
                            await api.delete(`/work-orders/${order.id}/attachments/${row.id}`);
                            onFilesChanged();
                          } catch (e) {
                            showAlert("ลบไม่สำเร็จ", apiErrorMessage(e));
                          }
                        },
                      },
                    ])
                  }
                  onChanged={onFilesChanged}
                />
                {inspectMissing.length > 0 ? (
                  <Text style={styles.inspectWarn}>
                    ยังขาด: {inspectMissing.join(" · ")} — ใส่ให้ครบ 3 อย่างก่อนส่งผลตรวจ
                  </Text>
                ) : null}
                <Text style={styles.linkedText}>
                  บันทึกแล้วใบงานกลับไปให้หัวหน้าภาคระบุอะไหล่จากผลนี้
                </Text>
              </>
            ) : null}

            {order.status === "WAITING_PARTS" ? (
              <>
                <Text style={styles.linkedText}>
                  ใบนี้แยกมาจาก {order.parent?.code ?? "ใบงานเดิม"} เพราะอะไหล่ไม่ครบ —
                  ของเข้าคลังแล้วกดส่งต่อ แอดมินจะเช็คและเบิกให้ใหม่
                </Text>
                {order.waitingParts.map((p) => (
                  <Text key={p.sparePartId} style={styles.issuedLine}>
                    {p.partCode} × {p.quantity} · {p.name}
                  </Text>
                ))}
              </>
            ) : null}

            {order.status === "PARTS_CHECKED" ? (
              <>
                <DateField
                  value={visit}
                  onChange={setVisit}
                  label="วันเข้างาน"
                  emptyHint="ต้องระบุวันก่อนจึงจะส่งต่อได้"
                />
                <TimeField value={visitTime} onChange={setVisitTime} label="เวลา (ไม่ใส่ก็ได้)" />
              </>
            ) : null}

            {order.status === "AWAITING_CONFIRM" || order.status === "INSPECT_CONFIRM" ? (
              <>
                <Text style={styles.linkedText}>
                  {order.status === "INSPECT_CONFIRM"
                    ? `หัวหน้าภาคส่ง${order.assignedTeam ? `ทีม${order.assignedTeam}` : "ทีม"}ไปตรวจหน้างาน · ${
                        order.scheduledAt ? `วันที่เสนอ ${visitLabel(order)}` : "ยังไม่ได้ระบุวัน"
                      }`
                    : `หัวหน้าภาคจ่าย ${order.assignedTeam ? `ทีม${order.assignedTeam}` : "ทีม"} เข้า ${visitLabel(order)}`}
                  {order.contactPhone ? ` · โทร ${order.contactPhone}` : ""}
                </Text>
                <Text style={styles.modalLabel}>ลูกค้าตอบว่าอย่างไร</Text>
                <View style={{ gap: spacing.xs }}>
                  {(order.status === "INSPECT_CONFIRM"
                    ? order.scheduledAt
                      ? ([
                          ["OK", "ลูกค้าคอนเฟิร์มวันนี้", "ส่งให้ทีมเข้าตรวจตามวันนี้"],
                          ["MOVE", "ลูกค้าขอเลื่อน / เปลี่ยนวัน", "เลือกวันที่ลูกค้าสะดวก แล้วส่งให้ทีมเข้าตรวจ"],
                        ] as const)
                      : ([["MOVE", "นัดวันเข้าตรวจ", "ใส่วันที่ลูกค้าสะดวก แล้วส่งให้ทีมเข้าตรวจ"]] as const)
                    : ([
                        ["OK", "ลูกค้าคอนเฟิร์มวันนี้", "ส่งให้หัวหน้าภาคยืนยันออกงาน"],
                        ["MOVE", "ลูกค้าขอเลื่อน / เปลี่ยนวัน", "เลือกวันใหม่ที่ลูกค้าสะดวก แล้วส่งให้หัวหน้าภาคยืนยัน"],
                      ] as const)
                  ).map(([v, label, hint]) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.backOption, confirmChoice === v && styles.backOptionOn]}
                      onPress={() => setConfirmChoice(v)}
                      activeOpacity={0.7}
                      accessibilityLabel={label}
                    >
                      <Text style={styles.backOptionText}>{label}</Text>
                      <Text style={styles.backOptionHint}>{hint}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {confirmChoice === "MOVE" ? (
                  <>
                    <DateField
                      value={visit}
                      onChange={setVisit}
                      label={order.status === "INSPECT_CONFIRM" && !order.scheduledAt ? "วันเข้าตรวจ" : "วันใหม่"}
                      emptyHint="เลือกวันที่ลูกค้าสะดวก"
                    />
                    <TimeField value={visitTime} onChange={setVisitTime} label="เวลา (ไม่ใส่ก็ได้)" />
                  </>
                ) : null}
              </>
            ) : null}

            {/* ขั้นตรวจหน้างานมีช่องผลตรวจอยู่แล้ว ช่องบันทึกอีกช่องทำให้ไม่รู้ว่าต้องพิมพ์ที่ไหน */}
            {order.status !== "INSPECTING" ? (
              <>
                <Text style={styles.modalLabel}>บันทึกเพิ่มเติม</Text>
                <TextInput
                  style={styles.modalInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder="ไม่ใส่ก็ได้"
                  placeholderTextColor={colors.textFaint}
                  multiline
                  numberOfLines={2}
                  accessibilityLabel="บันทึกเพิ่มเติม"
                />
              </>
            ) : null}

            {error ? <Text style={styles.modalError}>{error}</Text> : null}
    </AppModal>
  );
}

/**
 * แก้ไขรายละเอียดใบงาน — เรื่อง ความเร่งด่วน ผู้ติดต่อ อาการ สถานะ
 *
 * เดิมแก้ได้แค่อาการกับสถานะ ใบที่ช่างส่งกลับมาหัวหน้าภาคต้องแก้ได้ทุกอย่างก่อนส่งช่างรอบใหม่
 * (เจ้าของงานขอ ต.ค. 69) — ผู้ติดต่อที่ผิดหรือเรื่องที่เขียนไว้ไม่ตรงคือสาเหตุให้ไปแล้วเสียเที่ยวซ้ำ
 */
function NoteModal({
  visible,
  order,
  workStatuses,
  priorities,
  onCancel,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  workStatuses: Option[];
  priorities: Option[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(order.title);
  const [priority, setPriority] = useState(order.priority);
  const [contactName, setContactName] = useState(order.contactName ?? "");
  const [contactPhone, setContactPhone] = useState(order.contactPhone ?? "");
  const [symptom, setSymptom] = useState(order.symptom ?? "");
  const [workStatus, setWorkStatus] = useState<string | null>(order.workStatus);
  const [parts, setParts] = useState<PickedPart[]>(order.waitingParts);
  const [visit, setVisit] = useState(order.scheduledAt ? order.scheduledAt.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // เปิดฟอร์มใหม่ทุกครั้งให้เห็นค่าล่าสุด ไม่ใช่ค่าที่ค้างจากการเปิดครั้งก่อน
  useEffect(() => {
    if (!visible) return;
    setTitle(order.title);
    setPriority(order.priority);
    setContactName(order.contactName ?? "");
    setContactPhone(order.contactPhone ?? "");
    setSymptom(order.symptom ?? "");
    setWorkStatus(order.workStatus);
    setParts(order.waitingParts);
    setVisit(order.scheduledAt ? order.scheduledAt.slice(0, 10) : "");
    setError(null);
  }, [visible, order]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/work-orders/${order.id}`, {
        title: title.trim() || order.title,
        priority,
        contactName: contactName.trim() || null,
        contactPhone: contactPhone.trim() || null,
        symptom: symptom.trim() || null,
        workStatus,
        waitingParts: parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
        scheduledAt: visit || null,
      });
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      visible={visible}
      onClose={onCancel}
      busy={saving}
      title={<>แก้ไขรายละเอียด · {order.code}</>}
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalSave, saving && styles.modalSaveOff]}
            onPress={submit}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <Spinner color="#fff" size="small" />
            ) : (
              <Text style={styles.modalSaveText}>บันทึก</Text>
            )}
          </TouchableOpacity>
        </View>
      }
    >
      <Text style={styles.modalLabel}>เรื่อง</Text>
      <TextInput
        style={[styles.modalInput, styles.modalInputLine]}
        value={title}
        onChangeText={setTitle}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="เรื่อง"
      />

      {priorities.length ? (
        <>
          <Text style={styles.modalLabel}>ความเร่งด่วน</Text>
          <View style={styles.options}>
            {priorities.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[styles.option, priority === p.value && styles.optionOn]}
                onPress={() => setPriority(p.value)}
                activeOpacity={0.7}
                accessibilityLabel={`ความเร่งด่วน ${p.label}`}
              >
                <Text style={[styles.optionText, priority === p.value && styles.optionTextOn]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.modalLabel}>ผู้ติดต่อที่สาขา</Text>
      <TextInput
        style={[styles.modalInput, styles.modalInputLine]}
        value={contactName}
        onChangeText={setContactName}
        placeholder="ชื่อ"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="ชื่อผู้ติดต่อ"
      />
      <TextInput
        style={[styles.modalInput, styles.modalInputLine, { marginTop: spacing.xs }]}
        value={contactPhone}
        onChangeText={setContactPhone}
        placeholder="เบอร์โทร"
        placeholderTextColor={colors.textFaint}
        keyboardType="phone-pad"
        accessibilityLabel="เบอร์ผู้ติดต่อ"
      />

      <Text style={styles.modalLabel}>อาการที่พบ</Text>
      <TextInput
        style={styles.modalInput}
        value={symptom}
        onChangeText={setSymptom}
        placeholder="เช่น ประตูไม่ล็อก / บอร์ดควบคุมไหม้"
        placeholderTextColor={colors.textFaint}
        multiline
        numberOfLines={3}
        accessibilityLabel="อาการที่พบ"
      />

      <Text style={styles.modalLabel}>สถานะการดำเนินการ</Text>
      <View style={styles.options}>
        <TouchableOpacity
          style={[styles.option, workStatus === null && styles.optionOn]}
          onPress={() => setWorkStatus(null)}
          activeOpacity={0.7}
        >
          <Text style={[styles.optionText, workStatus === null && styles.optionTextOn]}>
            ยังไม่ระบุ
          </Text>
        </TouchableOpacity>
        {workStatuses.map((w) => (
          <TouchableOpacity
            key={w.value}
            style={[styles.option, workStatus === w.value && styles.optionOn]}
            onPress={() => setWorkStatus(w.value)}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, workStatus === w.value && styles.optionTextOn]}>
              {w.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {workStatus === "WAITING_PARTS" ? (
        <PartPicker parts={parts} onChange={setParts} label="รออะไหล่ตัวไหน" />
      ) : null}

      {workStatus === "WAITING_TECH" ? (
        <DateField value={visit} onChange={setVisit} label="วันที่ช่างจะเข้า" />
      ) : null}

      {error ? <Text style={styles.modalError}>{error}</Text> : null}
    </AppModal>
  );
}

/**
 * แถวรูปย่อของไฟล์ที่เลือกไว้แต่ยังไม่ได้ส่ง พร้อมปุ่มเอาออก
 *
 * แยกออกมาเพราะหน้าปิดงานมีสามช่องที่ทำเหมือนกันทุกอย่าง — รูปหน้างาน
 * ป้ายรุ่น และใบเหลือง ต่างกันแค่จำนวนไฟล์ที่ใส่ได้
 */
function FileStrip({
  files,
  onChange,
}: {
  files: PickedAttachment[];
  onChange: (next: PickedAttachment[]) => void;
}) {
  if (files.length === 0) return null;
  return (
    <View style={styles.slipRow}>
      {files.map((file, i) => (
        <View key={`${file.name}-${i}`} style={styles.slipItem}>
          {file.thumbnailUri ? (
            <Image source={{ uri: file.thumbnailUri }} style={styles.slipThumb} />
          ) : (
            <View style={[styles.slipThumb, styles.slipBlank]}>
              <Ionicons
                name={attachmentIcon(file.kind)}
                size={22}
                color={colors.textFaint}
              />
            </View>
          )}
          {/* PDF ไม่มีรูปย่อ ชื่อไฟล์คือสิ่งเดียวที่บอกว่าเลือกถูกใบ */}
          {file.kind === "DOCUMENT" ? (
            <Text style={styles.slipName} numberOfLines={1}>
              {file.name}
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={() => onChange(files.filter((_, k) => k !== i))}
            accessibilityLabel={`เอาไฟล์ที่ ${i + 1} ออก`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={20} color={colors.textFaint} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

/**
 * ประวัติ — เฉพาะขั้นสำคัญ เรียงเก่าไปใหม่ (เจ้าของงานเลือกจากตัวอย่าง ต.ค. 69)
 *
 * แนบไฟล์/ลบไฟล์เคยปนทุกบรรทัด ใบที่ปิดงานพร้อมรูปห้ารูปต้องเลื่อนผ่านห้าบรรทัด "แนบไฟล์"
 * ก่อนถึงขั้นที่อยากรู้ รูปดูได้ในการ์ดรูปอยู่แล้ว จึงซ่อนไว้ · ปุ่มท้ายเปิดดูทั้งหมดได้
 * เผื่อต้องตามว่าใครลบรูป · เก่าไปใหม่เพราะอ่านไล่เป็นเรื่องเดียวกันได้
 */
const MINOR_ACTIONS = new Set(["ATTACHED", "ATTACHMENT_REMOVED"]);
const ROLE_DOT: Record<string, { fg: string; bg: string; label: string }> = {
  ADMIN: { fg: colors.roleAdmin, bg: colors.roleAdminSoft, label: "แอดมิน" },
  PARTS_ADMIN: { fg: colors.roleAdmin, bg: colors.roleAdminSoft, label: "Admin Spare Part" },
  SUPER_ADMIN: { fg: colors.roleAdmin, bg: colors.roleAdminSoft, label: "แอดมิน" },
  SUPERVISOR: { fg: colors.roleSupervisor, bg: colors.roleSupervisorSoft, label: "หัวหน้าภาค" },
  EMPLOYEE: { fg: colors.roleTech, bg: colors.roleTechSoft, label: "ช่าง" },
};

function History({ logs, closed }: { logs: WorkOrder["logs"]; closed: boolean }) {
  const [all, setAll] = useState(false);
  const ordered = [...logs].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  const minor = ordered.filter((l) => MINOR_ACTIONS.has(l.action)).length;
  const shown = all ? ordered : ordered.filter((l) => !MINOR_ACTIONS.has(l.action));
  return (
    <View style={[styles.card, closed && styles.cardDone]}>
      <Text style={styles.sectionTitle}>ประวัติ</Text>
      {shown.map((log, i) => {
        const role = log.byRole ? ROLE_DOT[log.byRole] : undefined;
        const fg = role?.fg ?? colors.textFaint;
        const small = MINOR_ACTIONS.has(log.action);
        const at = new Date(log.createdAt);
        const day = at.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });
        const time = at.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
        return (
          <View key={log.id} style={styles.hRow}>
            <View style={styles.hWhen}>
              <Text style={styles.hDay}>{day}</Text>
              <Text style={styles.hTime}>{time}</Text>
            </View>
            <View style={styles.hRail}>
              {i < shown.length - 1 ? <View style={styles.hLine} /> : null}
              <View style={[styles.hDot, small ? styles.hDotSmall : { backgroundColor: fg, borderColor: fg }]} />
            </View>
            <View style={styles.logBody}>
              <Text style={[styles.logAction, small && styles.hMinor]}>{log.actionLabel}</Text>
              <View style={styles.hWho}>
                <Text style={styles.logMeta}>{log.byName ?? "—"}</Text>
                {role && !small ? (
                  <View style={[styles.hRole, { backgroundColor: role.bg }]}>
                    <Text style={[styles.hRoleText, { color: role.fg }]}>{role.label}</Text>
                  </View>
                ) : null}
              </View>
              {log.note ? (
                <Text style={[styles.hNote, log.action === "CLOSED" && styles.hNoteBig]}>{log.note}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
      {minor > 0 ? (
        <TouchableOpacity onPress={() => setAll((v) => !v)} activeOpacity={0.7} style={styles.hMore}>
          <Text style={styles.hMoreText}>
            {all ? "ซ่อนรายการแนบไฟล์" : `แสดงทั้งหมด (รวมแนบไฟล์ ${minor} รายการ)`}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * หัวฟอร์มยืนยันออกงาน — บอกว่าแอดมินคุยกับลูกค้าได้ข้อสรุปว่าอะไร
 *
 * ลูกค้าเลื่อนวันคือเหตุผลหลักที่ขั้นนี้มีอยู่ (ทีมเดิมอาจไม่ว่างวันใหม่) จึงต้องเด่น
 * อ่านจากประวัติล่าสุดของขั้นคอนเฟิร์ม ไม่เก็บซ้ำในใบงาน — ประวัติคือของจริงอยู่แล้ว
 */
function DispatchNote({ order }: { order: WorkOrder }) {
  const last = order.logs
    .filter((l) => l.action === "RESCHEDULED" || l.action === "CONFIRMED")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const moved = last?.action === "RESCHEDULED";
  return (
    <View style={[styles.dispatchNote, moved && styles.dispatchNoteMoved]}>
      <Ionicons
        name={moved ? "swap-horizontal" : "checkmark-circle"}
        size={16}
        color={moved ? colors.warningInk : colors.successInk}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.dispatchText, { color: moved ? colors.warningInk : colors.successInk }]}>
          {moved ? last.note : `ลูกค้าคอนเฟิร์มแล้ว · เข้างาน ${visitLabel(order)}`}
        </Text>
        {last ? (
          <Text style={styles.linkedText}>
            {last.byName ?? "—"} · {formatDateTime(last.createdAt)}
            {moved ? " — เช็คว่าทีมยังว่างวันใหม่ หรือเปลี่ยนทีมด้านล่าง" : ""}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** ใบเคลมที่ช่างกำลังกรอกในหน้าปิดงาน — ไฟล์ยังอยู่ในเครื่อง ส่งขึ้นตอนกดปิดงาน */
interface ClaimDraft {
  on: boolean;
  brokenPartCode: string;
  symptom: string;
  checkNote: string;
  troubleshooting: string[];
  files: Record<string, PickedAttachment | undefined>;
}

/**
 * ใบเคลมอะไหล่เก่าของใบงานนี้ — ทุกคนเห็น Admin Spare Part ตรวจและตัดสินที่นี่
 *
 * วางข้อมูลเรียงตามฟอร์มเคลมของผู้ขาย คนตรวจไล่ทีละหัวข้อได้เหมือนถือฟอร์มกระดาษ
 * แล้วหลักฐานของอะไหล่ชิ้นนั้นอยู่ติดกัน — ใบที่เปลี่ยนสองชิ้นไม่ต้องเดาว่ารูปไหนของชิ้นไหน
 */
function ClaimsCard({
  order,
  files,
  canReview,
  onReviewed,
}: {
  order: WorkOrder;
  files: Attachment[];
  canReview: boolean;
  onReviewed: () => Promise<void> | void;
}) {
  const [viewing, setViewing] = useState<{ items: Attachment[]; at: number } | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState<"approve" | "reject" | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(approve: boolean) {
    if (!approve && !reason.trim()) {
      setError("ตีกลับต้องบอกเหตุผล — ช่างเห็นข้อความนี้บนใบงาน และต้องรู้ว่าต้องแก้อะไร");
      return;
    }
    setSaving(approve ? "approve" : "reject");
    setError(null);
    try {
      await api.post(`/work-orders/${order.id}/claim-review`, { approve, reason: reason.trim() || undefined });
      setReason("");
      await onReviewed();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(null);
    }
  }

  // ลิงก์มี token ของตัวเอง — มือถือส่งต่อให้เบราว์เซอร์เปิดได้โดยไม่ต้องแนบ header
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

  return (
    <View style={[styles.card, canReview && styles.claimCardReview]}>
      <View style={styles.infoHead}>
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.primaryInk} />
        <Text style={[styles.infoTitle, headingFont]}>เคลมอะไหล่เก่า</Text>
      </View>
      {viewing ? (
        <ImageViewer
          workOrderId={order.id}
          items={viewing.items}
          startIndex={viewing.at}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {order.claims.map((c, i) => {
        const tone = CLAIM_STATUS[c.status];
        // หลักฐานที่แนบก่อนส่งใบเคลมใบนี้ — ไฟล์ที่แนบหลังจากนั้นเป็นของรอบถัดไป
        const evidence = files.filter(
          (f) => f.sparePartId === c.sparePartId && f.role?.startsWith("CLAIM_") && f.createdAt <= c.createdAt
        );
        return (
          <View key={c.id} style={[styles.claimBlock, i > 0 && styles.claimBlockOld]}>
            <View style={styles.headRow}>
              <Text style={[styles.partCode, { flexShrink: 1 }]}>
                {c.partCode} · {c.partName}
                {c.quantity > 1 ? ` × ${c.quantity}` : ""}
              </Text>
              <View style={{ flex: 1 }} />
              <View style={[styles.claimChip, { backgroundColor: tone.bg }]}>
                <Text style={[styles.claimChipText, { color: tone.fg }]}>{tone.label}</Text>
              </View>
            </View>
            <Text style={styles.linkedText}>
              ส่งเมื่อ {formatDateTime(c.createdAt)}
              {c.reviewedAt ? ` · ตรวจเมื่อ ${formatDateTime(c.reviewedAt)}` : ""}
            </Text>
            <Row label="รหัสตัวที่เสีย" value={c.brokenPartCode ?? "—"} />
            {c.brokenPartCode && c.brokenPartCode.toUpperCase() !== c.partCode.toUpperCase() ? (
              <Text style={styles.claimMismatch}>ไม่ตรงกับอะไหล่ที่เปลี่ยนใส่ ({c.partCode}) — ตรวจรหัสก่อนส่งผู้ขาย</Text>
            ) : null}
            <Row label="ยี่ห้อ / รุ่น" value={[c.brand, c.model].filter(Boolean).join(" · ") || "—"} />
            <Row label="หมายเลขเครื่อง" value={c.machineCode ?? "—"} />
            <Text style={styles.partsHead}>อาการ/สาเหตุ</Text>
            <Text style={styles.claimText}>{c.symptom}</Text>
            <Text style={styles.partsHead}>ช่างเข้าเช็คอะไรบ้าง จึงระบุว่าควรเปลี่ยนชิ้นนี้</Text>
            <Text style={styles.claimText}>{c.checkNote}</Text>
            {c.troubleshooting.length > 0 ? (
              <>
                <Text style={styles.partsHead}>Troubleshooting ที่ทำแล้ว</Text>
                {c.troubleshooting.map((t) => (
                  <View key={t} style={styles.partRow}>
                    <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                    <Text style={styles.claimText}>{t}</Text>
                  </View>
                ))}
              </>
            ) : null}
            {evidence.length > 0 ? (
              <>
                <Text style={styles.partsHead}>หลักฐาน (+ รูปป้ายรุ่นในผลการทำงาน)</Text>
                <View style={styles.closeFiles}>
                  {evidence.map((f, at) => (
                    <TouchableOpacity
                      key={f.id}
                      style={styles.closeFile}
                      activeOpacity={0.8}
                      onPress={() => setViewing({ items: evidence, at })}
                      accessibilityLabel={`เปิด ${f.roleLabel ?? f.fileName}`}
                    >
                      {f.thumbnailDataUrl ? (
                        <Image source={{ uri: f.thumbnailDataUrl }} style={styles.closeThumb} />
                      ) : (
                        <View style={[styles.closeThumb, styles.slipBlank]}>
                          <Ionicons name={attachmentIcon(f.kind)} size={20} color={colors.textFaint} />
                        </View>
                      )}
                      {f.roleLabel ? (
                        <View style={styles.closeBadge}>
                          <Text style={styles.closeBadgeText}>{f.roleLabel.replace(" (เคลม)", "")}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}
            {c.status === "REJECTED" && c.rejectReason ? (
              <View style={styles.verdictBad}>
                <Ionicons name="arrow-undo" size={16} color={colors.danger} />
                <Text style={styles.verdictBadText}>ตีกลับ: {c.rejectReason}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.claimPdf}
              onPress={() => openPdf(c.id)}
              disabled={opening !== null}
              activeOpacity={0.7}
              accessibilityLabel={`เปิดใบเคลม ${c.partCode}`}
            >
              {opening === c.id ? (
                <Spinner color={colors.primaryInk} size="small" />
              ) : (
                <Ionicons name="document-text-outline" size={16} color={colors.primaryInk} />
              )}
              <Text style={styles.claimPdfText}>
                เปิดใบเคลม (PDF){c.status === "APPROVED" ? "" : " — ร่าง"}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}

      {canReview ? (
        <View style={styles.claimReview}>
          <Text style={styles.modalLabel}>ผลตรวจของ Admin Spare Part</Text>
          <TextInput
            style={[styles.modalInput, styles.claimReason]}
            value={reason}
            onChangeText={setReason}
            placeholder="เหตุผลที่ตีกลับ (ต้องกรอกเมื่อตีกลับ) เช่น วิดีโอ Error code ไม่เห็นรหัสบนหน้าจอ"
            placeholderTextColor={colors.textFaint}
            multiline
            accessibilityLabel="เหตุผลที่ตีกลับเคลม"
          />
          {error ? <Text style={styles.modalError}>{error}</Text> : null}
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.claimReject, saving !== null && styles.modalSaveOff]}
              onPress={() => review(false)}
              disabled={saving !== null}
              activeOpacity={0.8}
            >
              {saving === "reject" ? <Spinner color={colors.dangerInk} size="small" /> : null}
              <Text style={styles.claimRejectText}>ตีกลับให้ช่างแก้</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSave, saving !== null && styles.modalSaveOff]}
              onPress={() => review(true)}
              disabled={saving !== null}
              activeOpacity={0.8}
            >
              {saving === "approve" ? <Spinner color="#fff" size="small" /> : null}
              <Text style={styles.modalSaveText}>อนุมัติเคลม · ปิดงาน</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CloseModal({
  visible,
  order,
  results,
  technicians,
  onCancel,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  results: Option[];
  technicians: Technician[];
  onCancel: () => void;
  onDone: () => void;
}) {
  // ถูกตีกลับเคลมแล้วมาปิดใหม่ — ค่าที่ปิดรอบก่อน (ผล สรุป คนที่ไป อะไหล่) ยังอยู่ในใบ ดึงมาให้แก้เฉพาะจุด
  // ไม่ใช่ให้กรอกใหม่หมด (เจ้าของงานขอ ต.ค. 69)
  const reclosing = order.claims[0]?.status === "REJECTED";
  const [result, setResult] = useState((reclosing && order.closeResult) || "FIXED");
  const [note, setNote] = useState(reclosing ? order.closeNote ?? "" : "");
  const [needsParts, setNeedsParts] = useState<boolean | null>(null);
  /**
   * อะไหล่ที่เบิกไว้ในใบนี้ (แอดมินเช็คแล้วว่ามีของ) เติมให้เป็นค่าตั้งต้น — ช่างส่วนใหญ่ใช้ตามที่เบิก
   * เดิมช่องนี้ว่างเสมอ กล่องเคลมอะไหล่เก่าที่ผูกกับรายการนี้จึงไม่ขึ้นจนช่างเพิ่มเอง แล้วช่างหาไม่เจอ
   * (เจ้าของงานแจ้ง ต.ค. 69) · ตัวที่ไม่ได้ใช้จริงช่างลบออกได้
   */
  const requisitioned = (): PickedPart[] =>
    order.waitingParts
      .filter((p) => p.inStock === true)
      .map(({ sparePartId, partCode, name, brand, quantity }) => ({ sparePartId, partCode, name, brand, quantity }));
  const [parts, setParts] = useState<PickedPart[]>(reclosing ? order.parts : requisitioned());
  // ฟอร์มนี้ค้างอยู่ตลอด (ไม่ได้สร้างใหม่ทุกครั้งที่เปิด) — เปิดขึ้นมาแล้วยังว่างให้เติมอีกรอบ
  // เผื่อเบิกของหลังจากเปิดหน้าใบงานไว้แล้ว
  useEffect(() => {
    if (visible && !reclosing) setParts((cur) => (cur.length ? cur : requisitioned()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, order]);
  const [drafts, setDrafts] = useState<Record<number, ClaimDraft>>({});
  const [slip, setSlip] = useState<PickedAttachment | null>(null);
  const [beforeFiles, setBeforeFiles] = useState<PickedAttachment[]>([]);
  const [afterFiles, setAfterFiles] = useState<PickedAttachment[]>([]);
  const [nameplate, setNameplate] = useState<PickedAttachment | null>(null);
  const [workerIds, setWorkerIds] = useState<number[]>(reclosing ? order.workers.map((w) => w.id).slice(0, 3) : []);
  const [otherWorkers, setOtherWorkers] = useState(reclosing ? order.otherWorkers ?? "" : "");
  // อะไหล่ที่ยังขาด — เปิดใบงานรออะไหล่ต่อจากใบนี้หลังปิดงาน
  const [followUp, setFollowUp] = useState(false);
  const [missing, setMissing] = useState<PickedPart[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ใช้อะไหล่แล้วต้องมีใบเหลือง — เซิร์ฟเวอร์ก็กันไว้อีกชั้น แต่บอกตั้งแต่ตรงนี้
  // ดีกว่าให้กดบันทึกแล้วค่อยเด้งกลับมาว่าขาดรูป
  const slipMissing = parts.length > 0 && !slip && !order.hasRequisitionSlip;
  // รูปหน้างานคือหลักฐานว่าไปถึงจริงและเจออะไร ต้องมีอย่างน้อยหนึ่ง
  // ก่อน/หลังซ่อมของรอบนี้ อย่างละอย่างน้อยหนึ่ง (เจ้าของงานขอ ต.ค. 69) — เซิร์ฟเวอร์เช็คซ้ำ
  const beforeMissing = beforeFiles.length === 0 && !order.beforeCount;
  const afterMissing = afterFiles.length === 0 && !order.afterCount;
  const shotsMissing = beforeMissing || afterMissing;
  // งานถูกจ่ายให้ทีม ชื่อคนที่ไปจริงจึงมีอยู่ที่เดียวคือตรงนี้
  const workersMissing = workerIds.length === 0 && !otherWorkers.trim();
  const summaryMissing = !note.trim();
  // ป้ายรุ่นต้องถ่ายรอบนี้ ไว้ไล่เทียบว่าไปถูกเครื่อง — รูปเก่าใช้แทนไม่ได้
  const nameplateMissing = !nameplate && !order.hasNameplate;
  // ติ๊กว่าอะไหล่ไม่ครบแต่ไม่ได้บอกว่าขาดตัวไหน — ใบรออะไหล่เปล่า ๆ ไม่มีใครตามของได้
  const followUpMissing = followUp && missing.length === 0;

  /**
   * ร่างใบเคลมของอะไหล่แต่ละชิ้น — ยังไม่เคยแตะ = ค่าเริ่มต้น
   *
   * สาขายังอยู่ในประกันเปิดเคลมไว้ให้เลย (ส่วนใหญ่ต้องเคลม ลืมติ๊กแล้วอะไหล่เก่าถูกทิ้ง
   * คือเสียสิทธิ์ถาวร) ช่างปิดเองได้ถ้าชิ้นนั้นเคลมไม่ได้ · เคยถูกตีกลับ = ดึงข้อความเดิมมาให้แก้
   */
  function draftFor(id: number): ClaimDraft {
    if (drafts[id]) return drafts[id];
    const prior = order.claims.find((c) => c.sparePartId === id);
    return {
      on: prior ? true : order.branchWarrantyExpired === false,
      brokenPartCode: prior?.brokenPartCode ?? "",
      symptom: prior?.symptom ?? "",
      checkNote: prior?.checkNote ?? "",
      troubleshooting: prior?.troubleshooting ?? [],
      files: {},
    };
  }
  function patchDraft(id: number, patch: Partial<ClaimDraft>) {
    setDrafts((all) => ({ ...all, [id]: { ...draftFor(id), ...all[id], ...patch } }));
  }
  const hasEvidence = (id: number, role: string) =>
    !!draftFor(id).files[role] || order.claimEvidence.some((e) => e.sparePartId === id && e.role === role);
  /** สิ่งที่ยังขาดของแต่ละชิ้น — ตรงกับที่เซิร์ฟเวอร์เช็ค บอกตรงนี้ก่อนจะได้ไม่ต้องรอโดนปฏิเสธ */
  function claimGaps(p: PickedPart) {
    const d = draftFor(p.sparePartId);
    if (!d.on) return [];
    return [
      ...(d.brokenPartCode.trim() ? [] : ["รหัสอะไหล่ตัวที่เสีย"]),
      ...CLAIM_EVIDENCE.filter((e) => !hasEvidence(p.sparePartId, e.role)).map((e) => e.label),
      ...(d.symptom.trim() ? [] : ["อาการ/สาเหตุ"]),
      ...(d.checkNote.trim() ? [] : ["สิ่งที่เข้าเช็ค"]),
      ...(order.claimTroubleshooting.every((t) => d.troubleshooting.includes(t)) ? [] : ["Troubleshooting ให้ครบ"]),
    ];
  }
  const claimsMissing = parts.some((p) => claimGaps(p).length > 0);

  /** เลือกไฟล์หนึ่งรอบแล้วส่งให้คนเรียกไปเก็บเอง — ทุกช่องใช้ตัวนี้ร่วมกัน */
  async function pickOne(
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | null>,
    keep: (file: PickedAttachment) => void
  ) {
    setBusy("กำลังเตรียมไฟล์");
    try {
      const file = await pick(setBusy);
      if (file) keep(file);
    } catch (e) {
      showAlert("เตรียมไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      /**
       * ไฟล์ทั้งหมดต้องขึ้นก่อนสั่งปิด
       *
       * เซิร์ฟเวอร์เช็คตอนรับคำสั่งปิดว่ามีรูปหน้างานและใบเหลืองแล้วหรือยัง
       * ส่งไฟล์ทีหลังจะถูกปฏิเสธทั้งที่ไฟล์อยู่ในมือแล้ว
       */
      const claimed = parts.filter((p) => draftFor(p.sparePartId).on);
      const queue: { file: PickedAttachment; role?: string; sparePartId?: number }[] = [
        ...beforeFiles.map((file) => ({ file, role: "BEFORE" })),
        ...afterFiles.map((file) => ({ file, role: "AFTER" })),
        ...(nameplate ? [{ file: nameplate, role: "NAMEPLATE" }] : []),
        ...(slip ? [{ file: slip, role: "REQUISITION" }] : []),
        ...claimed.flatMap((p) =>
          Object.entries(draftFor(p.sparePartId).files).flatMap(([role, file]) =>
            file ? [{ file, role, sparePartId: p.sparePartId }] : []
          )
        ),
      ];
      for (const [i, item] of queue.entries()) {
        setBusy(`กำลังส่งไฟล์ ${i + 1}/${queue.length}`);
        await uploadAttachment(order.id, item.file, item.role, item.sparePartId);
      }
      setBusy("กำลังปิดงาน");
      await api.post(`/work-orders/${order.id}/close`, {
        result,
        note: note.trim() || undefined,
        parts: parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
        workerIds,
        otherWorkers: otherWorkers.trim() || null,
        claims: claimed.map((p) => {
          const d = draftFor(p.sparePartId);
          return {
            sparePartId: p.sparePartId,
            brokenPartCode: d.brokenPartCode.trim(),
            symptom: d.symptom.trim(),
            checkNote: d.checkNote.trim(),
            troubleshooting: d.troubleshooting,
          };
        }),
      });
      // ส่งไฟล์ขึ้นแล้ว — ปิดไม่ผ่านแล้วกดใหม่ต้องไม่ส่งซ้ำ ที่แนบแล้วนับจาก claimEvidence แทน
      setDrafts({});
      setNote("");
      setParts([]);
      setSlip(null);
      setBeforeFiles([]);
      setAfterFiles([]);
      setNameplate(null);
      setWorkerIds([]);
      setOtherWorkers("");
      /**
       * ใบรออะไหล่เปิดหลังปิดงานสำเร็จแล้วเท่านั้น — ปิดไม่ผ่านแต่เปิดใบต่อไปแล้ว
       * จะได้ใบรออะไหล่ลอย ๆ ของงานที่ยังไม่จบ ซึ่งพอกดปิดอีกรอบก็เปิดซ้ำอีกใบ
       */
      if (followUp && missing.length > 0) {
        try {
          setBusy("กำลังเปิดใบงานรออะไหล่");
          await api.post(`/work-orders/${order.id}/follow-up`, {
            parts: missing.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
          });
        } catch (e) {
          showAlert(
            "ปิดงานแล้ว แต่เปิดใบรออะไหล่ไม่สำเร็จ",
            `${apiErrorMessage(e)}\n\nเปิดใหม่ได้จากปุ่ม “เปิดใบงานรออะไหล่ต่อ” ในใบงานนี้`
          );
        }
      }
      setFollowUp(false);
      setMissing([]);
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
      setBusy(null);
    }
  }

  return (
    <AppModal
      visible={visible}
      onClose={onCancel}
      busy={saving}
      title={<>ปิดงาน {order.code}</>}
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modalSave,
              (saving || slipMissing || shotsMissing || workersMissing || nameplateMissing || followUpMissing || summaryMissing || claimsMissing) &&
                styles.modalSaveOff,
            ]}
            onPress={submit}
            disabled={
              saving || slipMissing || shotsMissing || workersMissing || nameplateMissing || followUpMissing || summaryMissing || claimsMissing
            }
            activeOpacity={0.8}
          >
            {saving ? (
              <>
                <Spinner color="#fff" size="small" />
                {busy ? <Text style={styles.modalSaveText}>{busy}</Text> : null}
              </>
            ) : (
              <Text style={styles.modalSaveText}>ยืนยันปิดงาน</Text>
            )}
          </TouchableOpacity>
        </View>
      }
    >

      <Text style={styles.modalLabel}>ผลการทำงาน</Text>
      <View style={styles.options}>
        {results.map((r) => (
          <TouchableOpacity
            key={r.value}
            style={[styles.option, result === r.value && styles.optionOn]}
            onPress={() => setResult(r.value)}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, result === r.value && styles.optionTextOn]}>
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* บังคับ (เจ้าของงานกำหนด) — "ซ่อมเสร็จ" อย่างเดียวไม่บอกว่ารอบนี้เปลี่ยนอะไรไป */}
      <Text style={styles.modalLabel}>
        สรุปงานที่ทำ <Text style={{ color: colors.danger }}>*</Text>
      </Text>
      <TextInput
        style={[styles.modalInput, summaryMissing && styles.inputMissing]}
        value={note}
        onChangeText={setNote}
        placeholder="เช่น เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ"
        placeholderTextColor={colors.textFaint}
        multiline
        numberOfLines={3}
        accessibilityLabel="สรุปงานที่ทำ"
      />
      {summaryMissing ? (
        <Text style={styles.warn}>ต้องสรุปว่าทำอะไรไป — หัวหน้าภาคกับแอดมินอ่านจากตรงนี้</Text>
      ) : null}

      {/*
        ใครไปจริง — งานถูกจ่ายให้ทีม ชื่อคนที่ไปจึงมีอยู่ที่เดียวคือตรงนี้
        ถ้าไม่ถามตอนปิด คำถามว่า "ใครไปสาขานี้" จะตอบไม่ได้เลย
      */}
      <Text style={styles.modalLabel}>ผู้เข้าปฏิบัติงาน</Text>
      {/*
        สามช่อง คนที่ 1–3 แทนการกดเลือกจากรายชื่อทั้งหมด

        ทีมหนึ่งไปกันไม่เกินสามคน การให้กดเลือกจากรายชื่อช่างทั้งบริษัท
        แปลว่าต้องกวาดตาหาชื่อตัวเองในกองที่ไม่เกี่ยวข้อง และกดเกินไปหนึ่งคน
        ก็ไม่มีอะไรบอกว่าเกิน — สามช่องบอกจำนวนสูงสุดด้วยตัวมันเอง

        คนเดียวกันเลือกซ้ำสองช่องไม่ได้ เพราะคนที่เลือกไปแล้วถูกตัดออก
        จากตัวเลือกของช่องที่เหลือ
      */}
      {[0, 1, 2].map((slot) => (
        <View key={slot} style={styles.workerSlot}>
          <Text style={styles.workerSlotLabel}>คนที่ {slot + 1}</Text>
          <Dropdown
            value={workerIds[slot] != null ? String(workerIds[slot]) : null}
            clearable={slot > 0 || workerIds.length > 1}
            placeholder={slot === 0 ? "เลือกช่าง" : "ไม่มี"}
            accessibilityLabel={`ผู้เข้าปฏิบัติงานคนที่ ${slot + 1}`}
            onChange={(next) =>
              setWorkerIds((current) => {
                const copy = [...current];
                if (next === null) copy.splice(slot, 1);
                else copy[slot] = Number(next);
                // ช่องว่างตรงกลางทำให้ "คนที่ 2" กลายเป็นช่องที่ไม่มีใคร
                // ทั้งที่มีคนที่ 3 อยู่ — บีบให้ชิดกันเสมอ
                return copy.filter((x) => x != null);
              })
            }
            options={technicians
              .filter((t) => !workerIds.includes(t.id) || workerIds[slot] === t.id)
              .map((t) => ({
                value: String(t.id),
                label: t.name,
                // ชื่อซ้ำกันเกิดขึ้นจริงในทีมช่าง รหัสพนักงานเป็นตัวแยก
                hint: `${t.employeeCode}${t.team ? ` · ${t.team}` : ""}`,
              }))}
          />
        </View>
      ))}
      <TextInput
        style={[styles.modalInput, styles.modalInputLine]}
        value={otherWorkers}
        onChangeText={setOtherWorkers}
        placeholder="คนอื่นที่ไปด้วยแต่ไม่มีบัญชีในระบบ (ไม่บังคับ)"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="คนอื่นที่ไปด้วย"
      />
      {workersMissing ? (
        <Text style={styles.warn}>ต้องระบุอย่างน้อยหนึ่งคนว่าใครเข้าไปทำ</Text>
      ) : null}

      {/*
        อะไหล่ · ใบเหลือง · เคลม อยู่ก่อนรูปก่อน/หลังซ่อม — เดิมอยู่ท้ายฟอร์ม ช่างเลื่อนหาไม่เจอ
        ว่าต้องส่งเคลมตรงไหน (เจ้าของงานแจ้ง ต.ค. 69)
      */}
      <PartPicker parts={parts} onChange={setParts} label="อะไหล่ที่ใช้ไป" />

      {/*
        ใบเหลืองคือหลักฐานว่าของที่หายไปจากคลังไปอยู่ที่เครื่องตัวไหน
        ถามเฉพาะตอนที่มีอะไหล่จริง งานที่ไม่ได้เปลี่ยนอะไรไม่มีใบเบิกให้ถ่าย
      */}
      {parts.length > 0 ? (
        <>
          <Text style={styles.modalLabel}>รูปใบเบิกอะไหล่ (ใบเหลือง)</Text>
          {order.hasRequisitionSlip && !slip ? (
            <Text style={styles.linkedText}>
              แนบไว้แล้วในใบงานนี้ — ถ่ายใหม่ได้ถ้าเบิกเพิ่มรอบนี้
            </Text>
          ) : null}
          {slip ? (
            <View style={styles.slipRow}>
              {slip.thumbnailUri ? (
                <Image source={{ uri: slip.thumbnailUri }} style={styles.slipThumb} />
              ) : (
                <View style={[styles.slipThumb, styles.slipBlank]}>
                  <Ionicons name="document-outline" size={22} color={colors.textFaint} />
                </View>
              )}
              <TouchableOpacity
                onPress={() => setSlip(null)}
                accessibilityLabel="เอารูปใบเหลืองออก"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={20} color={colors.textFaint} />
              </TouchableOpacity>
            </View>
          ) : busy ? (
            <View style={styles.slipRow}>
              <Spinner color={colors.primary} size="small" />
              <Text style={styles.linkedText}>{busy}…</Text>
            </View>
          ) : (
            <View style={styles.options}>
              {Platform.OS !== "web" ? (
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => pickOne((stage) => pickImageAttachment(true, stage), setSlip)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.optionText}>ถ่ายใบเหลือง</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.option}
                onPress={() => pickOne((stage) => pickImageAttachment(false, stage), setSlip)}
                activeOpacity={0.7}
              >
                <Text style={styles.optionText}>เลือกรูปใบเหลือง</Text>
              </TouchableOpacity>
            </View>
          )}
          {slipMissing ? (
            <Text style={styles.warn}>
              ใช้อะไหล่แล้วต้องแนบรูปใบเบิก (ใบเหลือง) ก่อนถึงจะปิดงานได้
            </Text>
          ) : null}

          {/*
            เคลมอะไหล่เก่า — ตามฟอร์ม "เอกสารใบเคลมอะไหล่" ของผู้ขาย
            ถามตอนปิดงานเพราะเป็นจังหวะเดียวที่อะไหล่เก่ายังอยู่ในมือช่าง และเครื่องยังเปิดดูได้
            หัวฟอร์ม (สาขา วันเปิด ยี่ห้อ รุ่น หมายเลขเครื่อง) ระบบใส่ให้จากใบงาน ช่างไม่ต้องพิมพ์
          */}
          <Text style={styles.modalLabel}>เคลมอะไหล่เก่า</Text>
          {parts.map((p) => {
            const d = draftFor(p.sparePartId);
            const gaps = claimGaps(p);
            return (
              <View key={p.sparePartId} style={[styles.claimPart, d.on && styles.claimPartOn]}>
                <TouchableOpacity
                  style={styles.partRow}
                  onPress={() => patchDraft(p.sparePartId, { on: !d.on })}
                  activeOpacity={0.7}
                  accessibilityLabel={`ส่งอะไหล่เก่าเคลม ${p.partCode}`}
                >
                  <Ionicons
                    name={d.on ? "checkbox" : "square-outline"}
                    size={20}
                    color={d.on ? colors.primary : colors.textFaint}
                  />
                  <Text style={[styles.partCode, { flex: 1, minWidth: 0 }]}>
                    ส่งอะไหล่เก่าเคลม · {p.partCode} {p.name}
                  </Text>
                </TouchableOpacity>
                {!d.on ? (
                  <Text style={styles.claimHeader}>
                    {order.branchWarrantyExpired === false
                      ? "สาขายังอยู่ในประกัน — ปิดไว้เฉพาะชิ้นที่เคลมไม่ได้"
                      : "ไม่เคลม (สาขาหมดประกันหรือเป็นสาขาบริษัท) — ติ๊กได้ถ้าชิ้นนี้ยังเคลมได้"}
                  </Text>
                ) : (
                  <>
                    <Text style={styles.claimHeader}>
                      ระบบใส่ให้ในใบเคลม: {order.branchCode} {order.branchName}
                      {order.branchOpenedAt ? ` · เปิด ${formatDate(order.branchOpenedAt)}` : ""}
                      {" · "}
                      {[order.branchWarrantyBrand ?? order.machineBrand, order.machineModel, order.machineCode]
                        .filter(Boolean)
                        .join(" · ") || "ไม่มีข้อมูลเครื่อง"}
                    </Text>

                    {/*
                      รหัสตัวที่เสีย อ่านจากอะไหล่ที่ถอดออกจริง ไม่ใช่เติมจากตัวที่เบิกมาใส่ — ผู้ขายรับเคลมตามตัวที่ส่งคืน
                      ถ้าเติมให้ ช่างจะกดผ่านโดยไม่ได้ดูของ แล้วรุ่นที่ต่างกันจะไปรู้เอาตอนผู้ขายตีกลับ
                    */}
                    <Text style={styles.modalLabel}>
                      รหัสอะไหล่ตัวที่เสีย (ตัวที่ส่งเคลม) <Text style={{ color: colors.danger }}>*</Text>
                    </Text>
                    <TextInput
                      style={[styles.modalInput, styles.modalInputLine]}
                      value={d.brokenPartCode}
                      onChangeText={(v) => patchDraft(p.sparePartId, { brokenPartCode: v })}
                      placeholder={`ดูจากป้าย/สติกเกอร์บนตัวที่ถอดออก เช่น ${p.partCode}`}
                      placeholderTextColor={colors.textFaint}
                      autoCapitalize="characters"
                      accessibilityLabel={`รหัสอะไหล่ตัวที่เสีย ${p.partCode}`}
                    />
                    {d.brokenPartCode.trim() && d.brokenPartCode.trim().toUpperCase() !== p.partCode.toUpperCase() ? (
                      <Text style={styles.claimHeader}>
                        ไม่ตรงกับอะไหล่ที่เปลี่ยนใส่ ({p.partCode}) — ส่งได้ แต่ตรวจรหัสอีกครั้ง
                      </Text>
                    ) : null}

                    <Text style={styles.modalLabel}>
                      อาการ/สาเหตุ <Text style={{ color: colors.danger }}>*</Text>
                    </Text>
                    <TextInput
                      style={[styles.modalInput, styles.claimReason]}
                      value={d.symptom}
                      onChangeText={(v) => patchDraft(p.sparePartId, { symptom: v })}
                      placeholder="เช่น เครื่องไม่ปั่นหมาด ขึ้น Error E-21"
                      placeholderTextColor={colors.textFaint}
                      multiline
                      accessibilityLabel={`อาการ/สาเหตุ ${p.partCode}`}
                    />
                    <Text style={styles.modalLabel}>
                      ช่างเข้าเช็คอะไรบ้าง จึงระบุว่าควรเปลี่ยนชิ้นนี้ <Text style={{ color: colors.danger }}>*</Text>
                    </Text>
                    <TextInput
                      style={[styles.modalInput, styles.claimReason]}
                      value={d.checkNote}
                      onChangeText={(v) => patchDraft(p.sparePartId, { checkNote: v })}
                      placeholder="เช่น วัดไฟเข้ามอเตอร์ปกติ เปลี่ยนแล้วเครื่องปั่นได้"
                      placeholderTextColor={colors.textFaint}
                      multiline
                      accessibilityLabel={`สิ่งที่เข้าเช็ค ${p.partCode}`}
                    />

                    <Text style={styles.modalLabel}>หลักฐานตามฟอร์มเคลม</Text>
                    {CLAIM_EVIDENCE.map((e) => {
                      const picked = d.files[e.role];
                      const already = !picked && hasEvidence(p.sparePartId, e.role);
                      // เลือกไฟล์ใช้เวลา (ย่อรูป) — อ่านร่างล่าสุดตอนไฟล์เสร็จ ไม่ใช่ตอนกดปุ่ม
                      const keep = (f: PickedAttachment) =>
                        setDrafts((all) => {
                          const cur = all[p.sparePartId] ?? draftFor(p.sparePartId);
                          return { ...all, [p.sparePartId]: { ...cur, files: { ...cur.files, [e.role]: f } } };
                        });
                      return (
                        <View key={e.role} style={styles.claimSlot}>
                          <Ionicons
                            name={picked || already ? "checkmark-circle" : "ellipse-outline"}
                            size={18}
                            color={picked || already ? colors.success : colors.textFaint}
                          />
                          <Text style={styles.claimSlotLabel}>
                            {e.label}
                            {already ? " — แนบไว้แล้ว" : ""}
                          </Text>
                          {picked ? (
                            <TouchableOpacity
                              onPress={() =>
                                patchDraft(p.sparePartId, { files: { ...d.files, [e.role]: undefined } })
                              }
                              accessibilityLabel={`เอา${e.label}ออก ${p.partCode}`}
                              style={styles.partRow}
                            >
                              <Text style={styles.linkedText}>{picked.name}</Text>
                              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                            </TouchableOpacity>
                          ) : busy ? null : e.video ? (
                            <TouchableOpacity
                              style={styles.option}
                              onPress={() => pickOne(pickVideoAttachment, keep)}
                              activeOpacity={0.7}
                              accessibilityLabel={`แนบ${e.label} ${p.partCode}`}
                            >
                              <Text style={styles.optionText}>{already ? "แนบใหม่" : "เลือกวิดีโอ"}</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.options}>
                              {Platform.OS !== "web" ? (
                                <TouchableOpacity
                                  style={styles.option}
                                  onPress={() => pickOne((stage) => pickImageAttachment(true, stage), keep)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.optionText}>ถ่าย</Text>
                                </TouchableOpacity>
                              ) : null}
                              <TouchableOpacity
                                style={styles.option}
                                onPress={() => pickOne((stage) => pickImageAttachment(false, stage), keep)}
                                activeOpacity={0.7}
                                accessibilityLabel={`แนบ${e.label} ${p.partCode}`}
                              >
                                <Text style={styles.optionText}>{already ? "แนบใหม่" : "เลือกรูป"}</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                    <Text style={styles.claimHeader}>รูป Nameplate ใช้รูปป้ายรุ่นด้านบน</Text>

                    {order.claimTroubleshooting.length > 0 ? (
                      <>
                        <Text style={styles.modalLabel}>
                          Troubleshooting {order.branchWarrantyBrand ?? order.machineBrand ?? ""} (ต้องทำครบ)
                        </Text>
                        {order.claimTroubleshooting.map((t) => {
                          const on = d.troubleshooting.includes(t);
                          return (
                            <TouchableOpacity
                              key={t}
                              style={styles.skipRow}
                              onPress={() =>
                                patchDraft(p.sparePartId, {
                                  troubleshooting: on
                                    ? d.troubleshooting.filter((x) => x !== t)
                                    : [...d.troubleshooting, t],
                                })
                              }
                              activeOpacity={0.7}
                              accessibilityLabel={`${t} ${p.partCode}`}
                            >
                              <Ionicons
                                name={on ? "checkbox" : "square-outline"}
                                size={18}
                                color={on ? colors.primary : colors.textFaint}
                              />
                              <Text style={[styles.skipText, { color: colors.text }]}>{t}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </>
                    ) : null}

                    {gaps.length > 0 ? (
                      <Text style={styles.warn}>ยังขาด: {gaps.join(" · ")}</Text>
                    ) : null}
                  </>
                )}
              </View>
            );
          })}
          {parts.some((p) => draftFor(p.sparePartId).on) ? (
            <Text style={styles.linkedText}>
              ปิดงานแล้วใบงานไปรอ Admin Spare Part ตรวจเคลมก่อน ถึงจะนับว่าปิดงาน
            </Text>
          ) : null}
        </>
      ) : null}

      {/*
        รูปก่อนซ่อม · หลังซ่อม แยกช่อง (เจ้าของงานขอ ต.ค. 69 — แทนช่องรูปหน้างานช่องเดียว)
        ก่อน = เจออะไรตอนไปถึง · หลัง = ซ่อมแล้วเครื่องกลับมาจริง คนตรวจย้อนเทียบสองภาพนี้
        สรุปงานที่พิมพ์มาเป็นคำบอกเล่า ใบงานที่ปิดโดยไม่มีรูปคือใบที่ตรวจย้อนไม่ได้
      */}
      {([
        ["BEFORE", "ก่อนซ่อม", "สภาพที่เจอตอนไปถึง · อาการ · Error", beforeFiles, setBeforeFiles, order.beforeCount ?? 0, beforeMissing],
        ["AFTER", "หลังซ่อม", "ซ่อมเสร็จ · ทดสอบแล้วปกติ", afterFiles, setAfterFiles, order.afterCount ?? 0, afterMissing],
      ] as const).map(([role, label, hint, list, setList, already, missingNow]) => (
        <View key={role}>
          <Text style={styles.modalLabel}>
            รูป / วิดีโอ {label} <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <View style={[styles.shotSlot, role === "BEFORE" ? styles.shotBefore : styles.shotAfter]}>
            <Text style={styles.shotHint}>{hint}</Text>
            {already > 0 ? (
              <Text style={styles.linkedText}>แนบไว้แล้ว {already} ไฟล์ — เพิ่มได้อีก</Text>
            ) : null}
            <FileStrip files={[...list]} onChange={(next) => setList(next)} />
            {busy ? null : (
              <View style={styles.options}>
                {Platform.OS !== "web" ? (
                  <TouchableOpacity
                    style={styles.option}
                    onPress={() => pickOne((stage) => pickImageAttachment(true, stage), (f) => setList((v) => [...v, f]))}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.optionText}>ถ่ายรูป</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => pickOne((stage) => pickImageAttachment(false, stage), (f) => setList((v) => [...v, f]))}
                  activeOpacity={0.7}
                  accessibilityLabel={`เลือกรูป${label}`}
                >
                  <Text style={styles.optionText}>เลือกรูป</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => pickOne(pickVideoAttachment, (f) => setList((v) => [...v, f]))}
                  activeOpacity={0.7}
                  accessibilityLabel={`เลือกวิดีโอ${label}`}
                >
                  <Text style={styles.optionText}>วิดีโอ</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {missingNow ? (
            <Text style={styles.warn}>
              ต้องแนบรูปหรือวิดีโอ{label}อย่างน้อยหนึ่งไฟล์
              {role === "AFTER" ? " — ใช้ยืนยันว่าเครื่องกลับมาใช้ได้" : ""}
            </Text>
          ) : null}
        </View>
      ))}

      {/*
        ป้ายรุ่นต้องถ่ายใหม่ทุกรอบที่ปิดงาน ไว้ไล่เทียบว่าไปถูกเครื่อง

        รุ่นที่กรอกไว้ตอนเปิดใบงานมาจากคนที่อาจไม่ได้ยืนอยู่หน้าเครื่อง
        ส่วนรูปนี้ถ่ายตอนทำงานเสร็จ — รูปเก่าตอบได้แค่ว่าเครื่องรุ่นอะไร
        ไม่ได้ตอบว่าคนที่ไปวันนั้นอยู่หน้าเครื่องตัวไหน
      */}
      {order.hasNameplate && !nameplate ? (
        <>
          <Text style={styles.modalLabel}>ป้ายรุ่นของเครื่อง</Text>
          <Text style={styles.linkedText}>แนบรูปของรอบนี้ไว้แล้ว</Text>
        </>
      ) : (
        <>
          <Text style={styles.modalLabel}>ป้ายรุ่นของเครื่อง</Text>
          {/* บอกว่าในระบบบันทึกไว้ว่าอะไร คนถ่ายจะได้เทียบได้ตรงนั้นเลย
              ไม่ต้องถ่ายมาก่อนแล้วค่อยมีใครมาเทียบทีหลัง */}
          {order.machineCode ? (
            <Text style={styles.linkedText}>
              ในระบบบันทึกไว้ว่า {order.machineCode}
              {order.machineModel ? ` · ${order.machineModel}` : ""}
              {order.machineCapacityLabel ? ` · ${order.machineCapacityLabel}` : ""} —
              ถ่ายป้ายรุ่นมาเทียบ
            </Text>
          ) : null}
          {nameplate ? (
            <FileStrip
              files={[nameplate]}
              onChange={(next) => setNameplate(next[0] ?? null)}
            />
          ) : busy ? null : (
            <View style={styles.options}>
              {Platform.OS !== "web" ? (
                <TouchableOpacity
                  style={styles.option}
                  onPress={() =>
                    pickOne((stage) => pickImageAttachment(true, stage), setNameplate)
                  }
                  activeOpacity={0.7}
                >
                  <Text style={styles.optionText}>ถ่ายป้ายรุ่น</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.option}
                onPress={() =>
                  pickOne((stage) => pickImageAttachment(false, stage), setNameplate)
                }
                activeOpacity={0.7}
              >
                <Text style={styles.optionText}>เลือกรูปป้ายรุ่น</Text>
              </TouchableOpacity>
            </View>
          )}
          {nameplateMissing ? (
            <Text style={styles.warn}>
              ต้องแนบรูปป้ายรุ่นที่ถ่ายรอบนี้ — ใช้ไล่เทียบว่าไปถูกเครื่อง
            </Text>
          ) : null}
        </>
      )}

      {order.outageStillOpen ? (
        <Text style={styles.warn}>
          เครื่องยังขึ้นว่าดับอยู่ในไฟล์รายงานล่าสุด ปิดใบงานได้ แต่เคสบนกระดานจะยังอยู่
          จนกว่าเครื่องจะหายไปจากไฟล์รอบถัดไป
        </Text>
      ) : null}

      {/*
        ไปเปลี่ยนแล้วอะไหล่ไม่ครบ — ใบนี้ปิดได้ตามที่ทำจริง ส่วนที่ขาดไปเป็นใบใหม่
        ลิงก์กับใบนี้ ไม่ใช่ค้างทั้งใบไว้เพราะของตัวเดียว
      */}
      <TouchableOpacity
        style={styles.skipRow}
        onPress={() => setFollowUp((v) => !v)}
        activeOpacity={0.7}
        accessibilityLabel="อะไหล่ไม่ครบ เปิดใบงานรออะไหล่ต่อ"
      >
        <Ionicons
          name={followUp ? "checkbox" : "square-outline"}
          size={18}
          color={followUp ? colors.primary : colors.textFaint}
        />
        <Text style={styles.skipText}>อะไหล่ไม่ครบ — เปิดใบงานรออะไหล่ต่อจากใบนี้</Text>
      </TouchableOpacity>
      {followUp ? (
        <>
          <PartPicker parts={missing} onChange={setMissing} label="อะไหล่ที่ยังขาด" />
          <Text style={styles.linkedText}>
            ใบใหม่ไปอยู่ที่หัวหน้าภาค สถานะ “รออะไหล่เข้า” และลิงก์กับใบนี้
          </Text>
        </>
      ) : null}

      {error ? <Text style={styles.modalError}>{error}</Text> : null}
    </AppModal>
  );
}

/** รูปย่อในการ์ดผลการทำงาน — badge = ขึ้นป้ายบอกว่าไฟล์นี้คืออะไร (ในช่องก่อน/หลังไม่ต้อง หัวช่องบอกแล้ว) */
function CloseThumb({ f, onPress, badge }: { f: Attachment; onPress: () => void; badge?: boolean }) {
  return (
    <TouchableOpacity style={styles.closeFile} activeOpacity={0.8} onPress={onPress} accessibilityLabel={`เปิด ${f.fileName}`}>
      {f.thumbnailDataUrl ? (
        <Image source={{ uri: f.thumbnailDataUrl }} style={styles.closeThumb} />
      ) : (
        <View style={[styles.closeThumb, styles.slipBlank]}>
          <Ionicons name={attachmentIcon(f.kind)} size={20} color={colors.textFaint} />
        </View>
      )}
      {badge && f.roleLabel ? (
        <View style={styles.closeBadge}>
          <Text style={styles.closeBadgeText}>{f.roleLabel}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  linkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  linkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    maxWidth: "100%",
  },
  linkChipText: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.primaryInk },
  stepBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
  },
  stepBackText: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.warningInk },
  backOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  backOptionOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  backOptionText: { fontSize: 14, lineHeight: 21, fontWeight: "600", color: colors.text },
  backOptionHint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  partsHead: {
    fontSize: 13,
    lineHeight: 21,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  partRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 3 },
  partCode: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  partName: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.textMuted },
  partRequisition: { fontSize: 11, lineHeight: 19, color: colors.textFaint, paddingBottom: 3 },
  stockPending: { fontSize: 11, lineHeight: 19, color: colors.textFaint },
  stockIn: { fontSize: 11, lineHeight: 19, color: colors.success, fontWeight: "700" },
  stockOut: { fontSize: 11, lineHeight: 19, color: colors.danger, fontWeight: "700" },
  stockOutPill: {
    fontSize: 11,
    lineHeight: 19,
    color: "#fff",
    fontWeight: "700",
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  checkList: { gap: spacing.md, marginTop: spacing.md },
  checkItem: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  checkCode: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  checkName: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  // ของที่เบิกไปแล้วรอบก่อน — อ่านอย่างเดียว ไม่ใช่ของที่ต้องตอบในรอบนี้
  issuedBox: {
    gap: 3,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  cardDone: { backgroundColor: colors.doneSoft, borderColor: colors.doneLine },
  badgeDone: { borderWidth: 1, borderColor: colors.doneLine },
  doneBand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.doneBand,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  doneBandText: { color: "#fff", fontSize: 15, lineHeight: 22, fontWeight: "800" },
  doneBandWhen: { color: "#fff", opacity: 0.9, fontSize: 13, lineHeight: 20 },
  // การ์ดเขียวแล้ว กล่องสรุปงานเป็นพื้นขาวให้ยังเด่นเป็นอันดับแรก
  summaryBoxDone: { backgroundColor: colors.card },
  summaryBox: {
    marginVertical: spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    backgroundColor: colors.primarySoft,
    borderTopRightRadius: radius.md,
    borderBottomRightRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  summaryLabel: { fontSize: 12, lineHeight: 18, fontWeight: "800", color: colors.primaryInk },
  summaryText: { fontSize: 17, lineHeight: 27, fontWeight: "800", color: colors.text },
  hRow: { flexDirection: "row", gap: spacing.sm },
  hWhen: { width: 62, alignItems: "flex-end", paddingTop: 1 },
  hDay: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.text },
  hTime: { fontSize: 11, lineHeight: 16, color: colors.textMuted },
  hRail: { width: 16, alignItems: "center" },
  hLine: { position: "absolute", top: 16, bottom: 0, width: 2, backgroundColor: colors.border },
  hDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, borderWidth: 2 },
  hDotSmall: { width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: colors.textFaint, borderColor: colors.textFaint },
  hMinor: { fontWeight: "500", color: colors.textMuted },
  hWho: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  hRole: { borderRadius: 5, paddingHorizontal: 6 },
  hRoleText: { fontSize: 10, lineHeight: 16, fontWeight: "800" },
  hNote: {
    alignSelf: "flex-start",
    marginTop: 3,
    marginBottom: spacing.sm,
    fontSize: 13,
    lineHeight: 20,
    color: colors.text,
    backgroundColor: colors.tile,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  hNoteBig: { fontSize: 14, fontWeight: "800", backgroundColor: colors.primarySoft },
  hMore: { marginTop: spacing.sm, alignSelf: "flex-start" },
  hMoreText: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.primaryInk },
  dispatchNote: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    borderRadius: radius.sm,
    padding: spacing.md,
    backgroundColor: colors.successSoft,
  },
  dispatchNoteMoved: { backgroundColor: colors.warningSoft },
  dispatchText: { fontSize: 13, lineHeight: 21, fontWeight: "700" },
  issuedTitle: { fontSize: 12, lineHeight: 20, fontWeight: "700", color: colors.textMuted },
  issuedLine: { fontSize: 12, lineHeight: 20, color: colors.text },
  issuedHint: { fontSize: 11, lineHeight: 19, color: colors.textFaint, paddingTop: 3 },
  optionOut: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  optionTextOut: { color: colors.danger },
  // เว้นบน-ล่างให้คลื่นรอบวงขั้นปัจจุบัน (ขยายถึง 2.1 เท่า) ไม่ถูกขอบ ScrollView ตัด
  steps: { flexDirection: "row", alignItems: "flex-start", paddingTop: 18, paddingBottom: 4 },
  // แบ่งความกว้างเท่ากันทุกช่อง ไม่มีขั้นต่ำ — ไม่ให้ล้นจนต้องเลื่อน (ดูที่แถบขั้นตอน)
  step: { flex: 1, flexBasis: 0, minWidth: 0, alignItems: "center", paddingHorizontal: 3 },
  // จอแคบ ชื่อขั้นปัจจุบันเป็นชื่อเดียวที่โชว์ — ให้ที่มากกว่าช่องอื่น
  stepNowWide: { flexGrow: 3 },
  // จอแคบ: 11 วง × 30 px ก็เกือบเต็มจอมือถือแล้ว — ลดช่องไฟให้วงไม่ล้น
  stepTight: { paddingHorizontal: 1 },
  stepSkipGroupTight: { width: 44 },
  // วงเล็กลงด้วย — 10 วง × 30 px + ปุ่มข้าม ยังเกินจอมือถือ 360 px
  stepDotTight: { width: 24, height: 24, borderRadius: 12 },
  stepNumTight: { fontSize: 11, lineHeight: 15 },
  stepLineTight: { top: 11, marginLeft: 14, marginRight: 14 },
  stepSkipPillTight: { paddingHorizontal: 4, height: 22, marginTop: 1 },
  // อยู่เหนือเส้นเชื่อมของขั้นถัดไป (เส้นลากย้อนมาครึ่งช่องของมันเอง) — ไม่งั้นเส้นพาดทับคำว่า "ข้าม"
  stepSkipGroup: { flexGrow: 0, flexShrink: 0, width: 58, alignItems: "center", zIndex: 2 },
  stepSkipPill: {
    marginTop: 2,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  stepSkipPillOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  stepSkipText: { fontSize: 11.5, fontWeight: "700", color: colors.textMuted },
  stepSkipList: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.sky50,
    gap: 2,
  },
  stepSkipListHead: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  stepSkipItem: { fontSize: 12.5, lineHeight: 19 },
  // เส้นเชื่อมจากขอบวงก่อนหน้ามาถึงขอบวงนี้ — เว้นรัศมีวงทั้งสองฝั่ง เส้นจึงไม่พาดทับวง
  // (บนเว็บเส้นที่วางแบบ absolute ลอยอยู่เหนือวงที่ไม่ได้ absolute zIndex ช่วยไม่ได้)
  stepLine: {
    position: "absolute",
    top: 14,
    left: "-50%",
    right: "50%",
    marginLeft: 19,
    marginRight: 19,
    height: 2,
    backgroundColor: colors.border,
  },
  stepLineDone: { backgroundColor: colors.success },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  stepDotDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepDotNow: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
    // วงแหวนฟ้ารอบขั้นปัจจุบัน ให้เห็นจากระยะแขนว่าอยู่ตรงไหน
    shadowColor: colors.sky200,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    ...(Platform.OS === "web" ? ({ boxShadow: `0 0 0 4px ${colors.sky200}` } as object) : null),
  },
  stepDotSkipped: { borderStyle: "dashed" },
  stepNum: { fontSize: 13, lineHeight: 18, fontWeight: "800", color: colors.textFaint },
  stepNumNow: { color: "#fff" },
  stepDotOut: { backgroundColor: colors.danger, borderColor: colors.danger },
  stepOutPill: { marginTop: 3, backgroundColor: colors.danger, borderRadius: radius.pill, paddingHorizontal: 8 },
  stepOutPillText: { fontSize: 11, lineHeight: 18, fontWeight: "800", color: "#fff", textAlign: "center" },
  stepOutEta: { fontSize: 10.5, lineHeight: 15, fontWeight: "700", color: colors.dangerInk, textAlign: "center", marginTop: 2 },
  stageLabel: { marginTop: 6, fontSize: 12, lineHeight: 18, color: colors.text, textAlign: "center" },
  stageLabelNow: { fontWeight: "800", color: colors.navy },
  stageLabelFuture: { color: colors.textFaint },
  // ขั้นที่ข้ามขีดฆ่าชื่อ ให้แยกจาก "ยังไม่ถึง" ได้ — เทสต์ stageorder อ่านเส้นนี้ด้วย
  stageLabelSkipped: { textDecorationLine: "line-through" },
  stageActor: { fontSize: 11, lineHeight: 16, color: colors.textFaint, textAlign: "center" },
  rollback: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rollbackText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 21, color: colors.warning, fontWeight: "600" },
  waitingCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  // ในการ์ดหัวใบงาน — ไม่มีกรอบการ์ดซ้อน แค่แถบฟ้าอ่อนบอกว่ารอใคร
  waitingInline: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.sky50,
  },
  infoGrid: { gap: spacing.md },
  infoGridWide: { flexDirection: "row", alignItems: "stretch" },
  infoCard: { flex: 1, minWidth: 0 },
  infoHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  infoTitle: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: colors.text },
  waitingText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 21, color: colors.textMuted },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  errorText: { fontSize: 13, lineHeight: 21, color: colors.danger, textAlign: "center" },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  urgentBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginBottom: spacing.md,
  },
  urgentBarText: { color: "#fff", fontSize: 14, lineHeight: 22, fontWeight: "800" },
  urgentBarSub: { fontWeight: "500" },
  code: { fontSize: 22, lineHeight: 30, fontWeight: "800", color: colors.primaryInk },
  badge: { borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: spacing.sm },
  badgeText: { fontSize: 11, lineHeight: 19, fontWeight: "700" },
  badgeOut: { backgroundColor: colors.danger },
  outCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 5,
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
    flexWrap: "wrap",
  },
  sentBack: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 5,
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
  },
  sentBackTitle: { fontSize: 13.5, lineHeight: 21, fontWeight: "800", color: colors.warningInk },
  sentBackText: { fontSize: 13, lineHeight: 21, color: colors.text },
  sentBackMeta: { fontSize: 12, lineHeight: 19, color: colors.textMuted },
  outIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
  outIconText: { color: "#fff", fontWeight: "800", fontSize: 14, lineHeight: 20 },
  outTitle: { fontSize: 13.5, lineHeight: 21, fontWeight: "800", color: colors.dangerInk },
  outText: { fontSize: 13, lineHeight: 21, fontWeight: "400", color: colors.text },
  outEtaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  outEtaBtnText: { fontSize: 12.5, fontWeight: "700", color: colors.dangerInk },
  title: { fontSize: 20, lineHeight: 30, fontWeight: "700", color: colors.text, marginTop: 2 },
  detail: { fontSize: 13, lineHeight: 21, color: colors.textMuted, marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.xs },
  rowLabel: { width: 120, fontSize: 13, lineHeight: 21, color: colors.textMuted },
  rowValue: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 21, color: colors.text, fontWeight: "600" },
  warrantyIn: { color: colors.success },
  warrantyOut: { color: colors.danger },
  sectionTitle: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  partLine: { fontSize: 13, lineHeight: 21, color: colors.textMuted },
  linked: { borderLeftWidth: 3, borderLeftColor: colors.primary },
  linkedTitle: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.text },
  linkedText: { fontSize: 12, lineHeight: 20, color: colors.textMuted, marginTop: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  // ปุ่มของขั้นนี้ใต้แถบขั้นตอน — สีกรมท่าแบบในตัวอย่าง กว้างตามข้อความ ไม่ยืดเต็มการ์ด
  action: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 22,
  },
  actionPrimary: { backgroundColor: colors.navy },
  actionPrimaryText: { color: "#fff", fontSize: 15, lineHeight: 24, fontWeight: "700" },
  actionSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary },
  actionSecondaryText: { color: colors.primary, fontSize: 15, lineHeight: 24, fontWeight: "700" },
  logBody: { flex: 1, minWidth: 0 },
  logAction: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  logMeta: { fontSize: 11, lineHeight: 19, color: colors.textFaint },
  editNote: { flexDirection: "row", alignItems: "center", gap: 2 },
  editNoteText: { fontSize: 13, lineHeight: 21, color: colors.primary, fontWeight: "700" },

  modalLabel: {
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  inputMissing: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
    minHeight: 84,
    textAlignVertical: "top",
  },
  // ช่องบรรทัดเดียว — modalInput ตั้งความสูงไว้เผื่อช่องบันทึกที่พิมพ์หลายบรรทัด
  modalInputLine: { minHeight: 0, textAlignVertical: "center" },
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
  warn: {
    fontSize: 12,
    lineHeight: 20,
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  modalError: { fontSize: 13, lineHeight: 21, color: colors.danger, marginTop: spacing.md },
  modalActions: { flex: 1, flexDirection: "row", gap: spacing.sm },
  modalCancel: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.sky50,
  },
  modalCancelText: { fontSize: 15, lineHeight: 22, color: colors.primaryInk, fontWeight: "700" },
  modalSave: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  modalSaveOff: { opacity: 0.6 },
  closeFiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  closeFile: { width: 76 },
  closeThumb: { width: 76, height: 76, borderRadius: radius.sm, backgroundColor: colors.background },
  closeBadge: {
    position: "absolute",
    left: 4,
    top: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.sm,
    backgroundColor: "rgba(15,23,42,0.78)",
  },
  closeBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  testBand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  testBandText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.warningInk },
  compare: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  compareCol: { flex: 1, minWidth: 150, borderTopWidth: 4, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.card },
  compareBefore: { borderTopColor: colors.warning },
  compareAfter: { borderTopColor: colors.success },
  compareHead: { fontSize: 13, lineHeight: 20, fontWeight: "800", marginBottom: 2 },
  compareHeadBefore: { color: colors.warningInk },
  compareHeadAfter: { color: colors.success },
  inspectWarn: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.warningInk,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  shotSlot: { borderWidth: 1.5, borderRadius: radius.md, padding: spacing.sm, gap: spacing.xs },
  shotBefore: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  shotAfter: { borderColor: colors.success, backgroundColor: colors.successSoft },
  shotHint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  // ── เคลมอะไหล่ ──
  claimCardReview: { borderColor: colors.primary, borderWidth: 2 },
  claimBlock: { paddingTop: spacing.sm },
  claimBlockOld: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, opacity: 0.75 },
  claimChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  claimChipText: { fontSize: 12, lineHeight: 18, fontWeight: "800" },
  claimText: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22, color: colors.text },
  claimPdf: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  claimPdfText: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.primaryInk },
  claimReview: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  claimReason: { minHeight: 64 },
  claimReject: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.dangerSoft,
  },
  claimRejectText: { fontSize: 15, lineHeight: 22, color: colors.dangerInk, fontWeight: "700" },
  claimRejected: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.dangerSoft,
  },
  claimMismatch: { fontSize: 12, lineHeight: 19, color: colors.warningInk, fontWeight: "700" },
  claimRejectedTitle: { fontSize: 13, lineHeight: 20, fontWeight: "800", color: colors.dangerInk },
  claimRejectedText: { fontSize: 13, lineHeight: 21, color: colors.dangerInk },
  claimPart: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  claimPartOn: { borderColor: colors.primary, backgroundColor: colors.sky50 },
  claimHeader: { fontSize: 12, lineHeight: 19, color: colors.textMuted, marginTop: spacing.xs },
  claimSlot: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs, flexWrap: "wrap" },
  claimSlotLabel: { flex: 1, minWidth: 140, fontSize: 13, lineHeight: 20, color: colors.text },
  verdictOk: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  verdictOkText: { flex: 1, fontSize: 12, lineHeight: 20, color: colors.success, fontWeight: "700" },
  verdictBad: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  verdictBadText: { flex: 1, fontSize: 12, lineHeight: 20, color: colors.danger, fontWeight: "700" },
  deleteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  deleteText: { fontSize: 13, lineHeight: 21, color: colors.danger, fontWeight: "700" },
  skipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  skipText: { flex: 1, fontSize: 12, lineHeight: 20, color: colors.textMuted },
  workerSlot: { marginTop: spacing.xs },
  workerSlotLabel: {
    fontSize: 12,
    lineHeight: 20,
    color: colors.textMuted,
    marginBottom: 2,
    fontWeight: "600",
  },
  slipRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  slipItem: { flexDirection: "row", alignItems: "center", gap: 2 },
  slipName: { maxWidth: 200, fontSize: 13, color: colors.text, marginLeft: 4 },
  slipThumb: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.background },
  slipBlank: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalSaveText: { color: "#fff", fontSize: 14, lineHeight: 22, fontWeight: "700" },
});
