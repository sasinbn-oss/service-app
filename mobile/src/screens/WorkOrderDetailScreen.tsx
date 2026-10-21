/**
 * ใบงานหนึ่งใบ — ที่ช่างรับงานและปิดงาน
 *
 * ปิดใบงานไม่ได้ปิดเคสบนกระดาน เพราะเคสปิดตอนเครื่องหายไปจากไฟล์เท่านั้น
 * หน้านี้จึงเตือนตรงๆ ตอนปิดว่าเครื่องยังไม่กลับมา ไม่ใช่ปล่อยให้เข้าใจผิด
 * ว่ากดปิดแล้วจบ
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { machineTag } from "../utils/machine";
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
import CancelOrderModal from "../components/CancelOrderModal";
import PopupScreen from "../components/PopupScreen";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { openUrl } from "../utils/share";
import { showAlert } from "../utils/alert";
import PartPicker, { PickedPart } from "../components/PartPicker";
import { CopyButton, CustomerMessageCard, CustomerMessageModal } from "../components/CustomerMessage";
import { hasCustomerMessage, subDispatch } from "../utils/customerMessage";
import OffPartEditor, { OffPart, OffTag, offPartsIncomplete, offPartsPayload, partTitle, splitParts } from "../components/OffPartEditor";
import DateField, { thaiDate, todayBkk } from "../components/DateField";
import TimeField, { isTime } from "../components/TimeField";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import TimelineModal, { TimelineButton } from "../components/TimelineModal";
import BackfillCloseModal from "../components/BackfillCloseModal";
import SupervisorCloseModal from "../components/SupervisorCloseModal";
import WorkOrderAttachments, { Attachment } from "../components/WorkOrderAttachments";
import InspectionSlots, { missingInspection } from "../components/InspectionSlots";
import EvidenceStep, { MissingBox, NextBox, TextStep } from "../components/EvidenceStep";
import { clearDraft, loadDraft, saveDraft } from "../utils/draft";
import { takeFresh } from "../utils/freshOrder";
import ClaimMachineBox, { ClaimCheckDraft, claimMachineGaps, ClaimMachineSummary, PlateDraft } from "../components/ClaimMachineBox";
import type { ClaimGuide } from "../utils/nameplate";
import {
  PickedAttachment,
  pickImageAttachment,
  pickVideoAttachment,
  uploadAttachment,
  attachmentIcon,
  pickPdfAttachments,
  pickImageAttachments,
} from "../utils/attachments";
import { useAuth } from "../context/AuthContext";
import { HomeStackParamList } from "../navigation/types";
import { colors, radius, shadow, spacing, headingFont } from "../theme";
import { formatDate, formatDateTime, statusTone } from "./WorkOrderListScreen";
import { useRefreshHandler } from "../components/RefreshButton";
import { feedback } from "../components/Feedback";
import { anyModalOpen, onPageShown, pageVisible, subscribeModals, subscribeWorkOrderStale } from "../utils/liveSync";

type Props = NativeStackScreenProps<HomeStackParamList, "WorkOrderDetail">;

interface LogEntry {
  id: number;
  action: string;
  actionLabel: string;
  /** ขั้นที่ใบงานไปอยู่หลังรายการนี้ — แยกคอนเฟิร์มนัดตรวจ (→ INSPECT_DISPATCH) ออกจากนัดซ่อม (→ ASSIGNED) */
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
  /** พิกัดสาขา — ลิงก์แผนที่ในข้อความส่งทีม outsource (ใบงาน SUB) */
  branchLatitude?: number | null;
  branchLongitude?: number | null;
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
  machineCapacityKg?: number | null;
  assignedToName: string | null;
  scheduledAt: string | null;
  /** เวลานัด "HH:MM" — ว่าง = นัดเป็นวัน */
  scheduledTime: string | null;
  appointmentStatus: string | null;
  appointmentStatusLabel: string | null;
  /** คนคอนเฟิร์มนัดกับลูกค้าล่าสุด (จากประวัติ) — มีเฉพาะนัดที่ตกลงแล้ว */
  appointmentBy?: { name: string | null; at: string } | null;
  /** ย้อนขั้นมาและยังไม่มีใครกดผ่านขั้นนี้ — ป้าย/กล่อง "↩ ย้อนขั้น" (null = ไม่ได้ย้อน) */
  rolledBack?: { from: string | null; fromLabel: string | null; reason: string | null; byName: string | null; at: string } | null;
  /** ค่าที่การย้อนรอบล่าสุดล้างไป — ฟอร์มขั้นเติมให้เฉพาะช่องที่ว่าง จนกว่าจะผ่านขั้นเดิมไปแล้ว */
  rollbackPrefill?: {
    from: string;
    needsParts: boolean | null;
    assignedTeam: string | null;
    scheduledAt: string | null;
    scheduledTime: string | null;
    partsExpectedAt: string | null;
    parts: { sparePartId: number; inStock: boolean | null; warehouse: string | null; requisitionNo: string | null }[];
  } | null;
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
  /** ค่าบริการที่หัวหน้าช่างให้เสนอราคา — ไม่มีราคา (ราคาอยู่ในใบเสนอราคาจากระบบบัญชี) */
  services: { id: number; name: string; quantity: number; unit: string | null; note: string | null }[];
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
  /** ใบงาน SUB: ทีม outsource ที่เข้าทำจริง (บันทึกตอนปิดงาน) */
  subTeam?: string | null;
  /** ทีมที่รับงานเป็นทีม outsource — ช่างไม่มีบัญชีในแอป หัวหน้าภาคปิดงาน/แจ้งปัญหาแทน */
  assignedOutsource?: boolean;
  logs: LogEntry[];
  /** ใบเคลมอะไหล่เก่าทุกรอบ ใหม่สุดก่อน */
  claims: PartClaim[];
  /** หลักฐานเคลมที่แนบไว้แล้วในรอบนี้ — ถูกตีกลับแล้วปิดใหม่ ไม่ต้องแนบซ้ำ */
  claimEvidence: { sparePartId: number | null; role: string }[];
  /** Troubleshooting ที่ยี่ห้อเครื่องใบนี้ต้องทำก่อนเคลม — ว่าง = ไม่บังคับ */
  claimTroubleshooting: string[];
  /** แบบป้ายรุ่น + รายการเช็คตามคู่มือของยี่ห้อนี้ (backend/src/utils/claimGuide.ts) */
  claimGuide?: ClaimGuide;
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
  /** ข้อมูลป้ายรุ่นที่สแกน/พิมพ์ — ใบเก่าก่อน ต.ค. 69 ว่าง */
  nameplate?: {
    family: string;
    /** ไฟล์ป้ายรุ่น (รูปเต็ม) ของรอบที่ส่งเคลมนี้ */
    photoId?: number | null;
    verified?: boolean;
    fields: { key: string; label: string; value: string; source: "SCAN" | "HAND"; crop?: string | null }[];
  } | null;
  /** เช็คตามคู่มือ Error in Field — ยี่ห้อที่ไม่มีคู่มือว่าง */
  fieldCheck?: {
    errorCode: string;
    errorName: string;
    checked: string[];
    install: { key: string; label: string; note: string; answer: boolean }[];
  } | null;
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
  /** ทีม outsource — รับงานเป็นครั้ง ๆ ไม่มีสาขาประจำ หัวหน้าภาคปิดงานแทน */
  outsource?: boolean;
}

interface LinkedOrder {
  id: number;
  code: string;
  status: string;
  statusLabel: string;
}

/** ปุ่มของแต่ละขั้น — ชื่อเดียวกับหัวฟอร์มที่เปิดขึ้นมา */
/** รุ่นข้อมูลของใบงานที่หน้าจอถืออยู่ = เลขประวัติล่าสุด (ตรงกับ GET /work-orders/:id/version) */
function latestLogId(o: { logs: { id: number }[] }) {
  return o.logs.reduce((m, l) => Math.max(m, l.id), 0);
}

/** สถานะเดียวที่คนตั้งเองได้ — ตรงกับ MANUAL_WORK_STATUSES ฝั่ง backend */
const MANUAL_STATUS = "WAITING_CUSTOMER";

/** ขั้นที่ผล "หมด" ยังเป็นเรื่องของตอนนี้ — ตรงกับ PARTS_OUT_STAGES ฝั่ง backend */
const PARTS_OUT_STAGES = ["PARTS_SOURCING", "PARTS_REQUESTED", "WAITING_PARTS"];

/** ข้ามขั้นเพราะอะไร — แถบขั้นตอนเดิมขึ้นแค่ "ข้าม 6" ไม่บอกเหตุผล */
const SKIP_WHY: Record<string, string> = {
  INSPECT_CONFIRM: "ไม่ได้ตรวจหน้างาน",
  INSPECT_DISPATCH: "ไม่ได้ตรวจหน้างาน",
  INSPECTING: "ไม่ได้ตรวจหน้างาน",
  PARTS_SOURCING: "ไม่ต้องเสนอราคา",
  AWAITING_QUOTE: "ไม่ต้องเสนอราคา",
  AWAITING_PAYMENT: "ไม่ต้องเสนอราคา",
  WAITING_PARTS: "ไม่ใช่ใบรออะไหล่รุ่นเก่า",
  PARTS_REQUESTED: "ไม่ใช้อะไหล่",
  PARTS_PICKUP: "ของอยู่คลัง 94 หรือไม่ใช้อะไหล่",
  CLAIM_REVIEW: "ไม่มีเคลมอะไหล่",
};

/** ตัวที่หัวหน้าภาคต้องเบิกเอง — กฎเดียวกับ pendingPickup ฝั่งเซิร์ฟเวอร์ */
function isPickup(p: StockPart & { offCatalog?: boolean }, adminWarehouse: string) {
  return p.inStock === true && !p.offCatalog && !!p.warehouse && p.warehouse !== adminWarehouse && !p.requisitionNo;
}

/**
 * ผลเช็คอะไหล่ก่อนเสนอราคา (ขั้นเช็คอะไหล่ มี/หมด) ยังใช้ได้ไหมตอนเบิก — เจ้าของงานเลือก ต.ค. 69
 *
 * ลูกค้าจ่ายเงินภายใน 3 วัน = ผล "มีครบ" ยังเชื่อได้ ฟอร์มเบิกเติมให้ เหลือเลือกคลังกับใส่เลขใบเบิก
 * เกิน 3 วัน = ของอาจถูกงานอื่นใช้ไประหว่างรอเงิน เปิดให้เช็คใหม่ทั้งหมดเหมือนเดิม
 */
const SOURCING_FRESH_DAYS = 3;
function sourcingCheck(o: { status: string; logs: LogEntry[] }): { days: number; stale: boolean; at: string } | null {
  if (o.status !== "PARTS_REQUESTED") return null;
  const last = [...o.logs].filter((l) => l.action === "PARTS_SOURCED").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!last) return null;
  const days = Math.floor((Date.now() - Date.parse(last.createdAt)) / 86_400_000);
  return { days, stale: days > SOURCING_FRESH_DAYS, at: last.createdAt };
}

/** หมายเหตุล่าสุดที่แอดมินส่งให้หัวหน้าภาคเบิก */
function lastPickupRequest(o: { logs: LogEntry[] }): LogEntry | null {
  return [...o.logs].filter((l) => l.action === "PICKUP_REQUESTED").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

const STAGE_BUTTON: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  NEW: { label: "ระบุอะไหล่", icon: "arrow-forward-circle" },
  // แอดมินนัดร้านก่อนช่างไปตรวจ — ฟอร์มเดียวกับคอนเฟิร์มลูกค้าของงานซ่อม
  INSPECT_CONFIRM: { label: "นัดร้าน (ตรวจหน้างาน)", icon: "call-outline" },
  // ร้านตกลงวันแล้ว หัวหน้าภาคปล่อยงานให้ทีม — คู่กับ "ยืนยันออกงาน" ของงานซ่อม
  INSPECT_DISPATCH: { label: "ส่งช่างตรวจ", icon: "checkmark-circle-outline" },
  INSPECTING: { label: "ตรวจหน้างาน", icon: "search-outline" },
  WAITING_PARTS: { label: "อะไหล่มาแล้ว ส่งต่อให้เบิก", icon: "cube-outline" },
  // หลังรับเงิน (หรือในประกัน) — เบิกจริง ใส่คลัง + เลขใบเบิก ส่งของไปหน้างาน
  PARTS_REQUESTED: { label: "เบิกอะไหล่ (คลัง 94)", icon: "arrow-forward-circle" },
  // ของอยู่คลังอื่น (ไม่ใช่ลาดพร้าว 94) — หัวหน้าภาคเบิกเอง แอดมินกดแทนไม่ได้
  PARTS_PICKUP: { label: "เบิกอะไหล่ (คลังอื่น)", icon: "cube-outline" },
  // ก่อนเสนอราคา — เช็คว่ามีอะไหล่ไหม มีครบไปเสนอราคา หมดรอของเข้า
  PARTS_SOURCING: { label: "เช็คอะไหล่ (มี/หมด)", icon: "cube-outline" },
  AWAITING_QUOTE: { label: "ส่งใบเสนอราคา", icon: "document-text-outline" },
  AWAITING_PAYMENT: { label: "แนบบิลรับเงิน", icon: "cash-outline" },
  // หัวหน้าภาคจ่ายงาน+วัน → แอดมินคอนเฟิร์มลูกค้า → หัวหน้าภาคยืนยันออกงาน (ดู WORK_ORDER_STAGE_ORDER ฝั่ง backend)
  PARTS_CHECKED: { label: "จ่ายงานให้ทีม", icon: "arrow-forward-circle" },
  AWAITING_CONFIRM: { label: "คอนเฟิร์มลูกค้า", icon: "call-outline" },
  ASSIGNED: { label: "รับทราบ ปล่อยงาน", icon: "checkmark-circle-outline" },
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
/** แอดมินนัดร้านให้ไปตรวจหน้างานแล้วอย่างน้อยหนึ่งครั้ง — ใบก่อน ต.ค. 69 รอบสองนัดแล้วไป INSPECTING ตรง */
function inspectBooked(o: WorkOrder) {
  return o.logs.some(
    (l) => (l.action === "CONFIRMED" || l.action === "RESCHEDULED") && (l.status === "INSPECT_DISPATCH" || l.status === "INSPECTING")
  );
}

/** หัวหน้าภาคส่งช่างเข้าตรวจแล้ว — ใบเก่าไม่มีขั้นนี้ (นัดแล้วถึงช่างเลย) */
function inspectDispatched(o: WorkOrder) {
  return o.logs.some((l) => l.action === "DISPATCHED" && l.status === "INSPECTING");
}

/**
 * ใบที่หัวหน้าภาคปิดเอง (SUPERVISOR_CLOSED และ RECOVERED ของใบเก่าจากปุ่มรอบแรก) — ขั้นที่ใบงานรออยู่
 * และขั้นที่ยังไปไม่ถึงตอนปิดไม่มีใครทำ ต้องขึ้นว่าข้าม ไม่ใช่ติ๊กว่าทำแล้ว
 * ขั้นตอนปิดอ่านจากประวัติแถวสุดท้ายก่อนปิด (สถานะหลังแถวนั้น)
 */
const SUPERVISOR_CLOSES: Record<string, string> = { RECOVERED: "RECOVERED_CLOSED", SUPERVISOR_CLOSED: "SUPERVISOR_CLOSED" };
function recoveredFrom(o: WorkOrder): string | null {
  const action = o.closeResult ? SUPERVISOR_CLOSES[o.closeResult] : undefined;
  if (!action) return null;
  const done = o.logs.find((l) => l.action === action);
  if (!done) return null;
  const prior = o.logs.filter((l) => l.id < done.id).sort((a, b) => b.id - a.id)[0];
  return prior?.status ?? "NEW";
}

/**
 * ใบที่ช่างเพิ่งส่งกลับ — ขั้นล่าสุดที่ขยับคือ "ช่างส่งกลับ" และยังอยู่ที่ขั้นแรก
 * แนบรูป/แก้ข้อความหลังจากนั้นไม่นับ เพราะไม่ได้ทำให้ใบงานเดินไปไหน
 */
function sentBackLog(o: WorkOrder): LogEntry | null {
  const last = [...o.logs]
    .filter((l) => !["ATTACHED", "ATTACHMENT_REMOVED", "EDITED", "PARTS_ETA_CHANGED"].includes(l.action))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  // ช่างแจ้งปัญหาแล้วใบไปต่อตามเหตุผล (ระบุอะไหล่ / คอนเฟิร์มลูกค้าใหม่ / จ่ายงานใหม่) — กล่องขึ้นที่ขั้นนั้น
  return last?.action === "PARTS_ROLLBACK" && last.status === o.status ? last : null;
}

/**
 * ลูกค้าขอเปลี่ยนวัน รอหัวหน้าภาคคอนเฟิร์มวันใหม่ (เจ้าของงานเลือก ต.ค. 69)
 * — ป้าย/ปุ่ม "คอนเฟิร์มวันใหม่" แยกจาก "รับทราบ ปล่อยงาน" ปกติ เพราะต้องดูคิวทีมวันใหม่ก่อน ไม่ใช่กดผ่าน
 */
function rescheduledPending(o: WorkOrder) {
  if (o.status !== "ASSIGNED") return false;
  const last = o.logs
    .filter((l) => l.action === "RESCHEDULED" || l.action === "CONFIRMED")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return last?.action === "RESCHEDULED";
}

/** หัวหน้าภาคส่งกลับเพราะทีมไม่ว่างวันใหม่ — แอดมินเห็นเหตุผลตอนโทรนัดร้านใหม่ */
function declinedNewDate(o: WorkOrder): LogEntry | null {
  if (o.status !== "AWAITING_CONFIRM") return null;
  const last = [...o.logs]
    .filter((l) => !["ATTACHED", "ATTACHMENT_REMOVED", "EDITED", "PARTS_ETA_CHANGED"].includes(l.action))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return last?.action === "NEW_DATE_DECLINED" ? last : null;
}

function isSkipped(value: string, o: WorkOrder, stages: Stage[]) {
  const at = (v: string) => stages.findIndex((x) => x.value === v);
  const recovered = recoveredFrom(o);
  // รวมขั้นที่ใบงานรออยู่ตอนกดปิดด้วย — ขั้นนั้นก็ไม่มีใครทำ (เช่น รอจ่ายงาน แล้วปิดเลยโดยไม่จ่าย)
  if (recovered && value !== "DONE" && at(value) >= at(recovered)) return true;
  switch (value) {
    case "PARTS_REQUESTED":
      return o.needsParts === false;
    // ใบที่ของอยู่คลังลาดพร้าว 94 ทั้งหมดไม่ผ่านขั้นนี้
    // ข้ามเมื่อไม่ใช้อะไหล่ หรือเลยขั้นนี้ไปแล้วโดยไม่ได้ผ่าน — ก่อนถึงขั้นเบิกยังไม่รู้ว่าของจะอยู่คลังไหน
    // (เดิมขึ้นว่าข้ามตั้งแต่ใบยังไม่ถึงขั้นเบิก ทั้งที่แอดมินอาจส่งมาให้หัวหน้าภาคเบิก)
    case "PARTS_PICKUP":
      return (
        o.needsParts === false ||
        (at(o.status) > at("PARTS_PICKUP") && !o.logs.some((l) => l.action === "PICKED_UP"))
      );
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
    case "INSPECT_DISPATCH":
      return o.status !== "INSPECT_DISPATCH" && !inspectDispatched(o);
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
  /** ชื่อบนแถบขั้นตอน (ไม่มีคนทำ — คนทำอยู่ใต้ชื่อ) · เซิร์ฟเวอร์รุ่นเก่าไม่ส่งมา */
  action?: string;
  /** ชื่อเมื่อผ่านขั้นนี้แล้ว — "…แล้ว" */
  doneLabel?: string;
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

/**
 * ตัวเลือกทีมตอนจ่ายงาน — ทีม outsource ใช้ชื่อทีมเหมือนทีมอื่น แต่แยกไว้กลุ่มของตัวเองท้ายรายการ
 * (เจ้าของงานขอ ต.ค. 69: ไม่อยากเห็นป้าย "outsource" ต่อชื่อ แต่ต้องไม่ปนกับทีมช่างปกติ)
 * ทีมประจำสาขาขึ้นก่อนเสมอในกลุ่มของมัน — ทีมที่ดูแลสาขาก็เป็น outsource ได้ (เช่น PWS)
 */
function teamOptions(teams: Team[], suggested: string | null | undefined, jobType: string): DropdownOption[] {
  const OWN = "ทีมช่าง";
  const OUT = "ทีม outsource · หัวหน้าภาคปิดงานแทน";
  const sug = teams.find((t) => t.name === suggested);
  const opt = (t: Team): DropdownOption => ({
    value: t.name,
    label: t.name,
    group: t.outsource ? OUT : OWN,
    hint:
      t.name === suggested
        ? `ทีม ${jobType === "PM" ? "PM" : "CM"} ของสาขานี้`
        : t.branches
          ? `ดูแล ${t.branches} สาขา`
          : "รับงานเป็นครั้ง",
  });
  const rest = teams.filter((t) => t.name !== suggested);
  // ทีมประจำสาขาที่ไม่อยู่ในรายชื่อทีม (ข้อมูลสาขาเก่า) ยังให้เลือกได้ เหมือนเดิม
  const head: DropdownOption[] = suggested
    ? [sug ? opt(sug) : { value: suggested, label: suggested, group: OWN, hint: `ทีม ${jobType === "PM" ? "PM" : "CM"} ของสาขานี้` }]
    : [];
  const own = [...head.filter((o) => o.group === OWN), ...rest.filter((t) => !t.outsource).map(opt)];
  const out = [...head.filter((o) => o.group === OUT), ...rest.filter((t) => t.outsource).map(opt)];
  return [...own, ...out];
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
  const [supClosing, setSupClosing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [results, setResults] = useState<Option[]>([]);
  const [workStatuses, setWorkStatuses] = useState<Option[]>([]);
  const [sendBackReasons, setSendBackReasons] = useState<Option[]>([]);
  const [priorities, setPriorities] = useState<Option[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  // คลังเดียวที่แอดมินเบิกเองได้ — มาจากเซิร์ฟเวอร์ (ค่าตั้งต้นเผื่อเซิร์ฟเวอร์รุ่นเก่า)
  const [adminWarehouse, setAdminWarehouse] = useState("คลังลาดพร้าว 94");
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editingNote, setEditingNote] = useState(false);
  const editingNoteRef = useRef(false);
  editingNoteRef.current = editingNote;
  const [stageOpen, setStageOpen] = useState(false);
  // เด้งข้อความแจ้งลูกค้าหลังแอดมินกดคอนเฟิร์ม (ดู StageModal onDone)
  const [messageOpen, setMessageOpen] = useState(false);
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
  /**
   * เปิดมาจากหน้า "งานของฉันวันนี้" ของช่าง — ปุ่มใหญ่ที่นั่นพามาเปิดฟอร์มให้เลย (ปิดงาน / ผลตรวจ / แจ้งปัญหา)
   * ช่างกดครั้งเดียวถึงฟอร์ม ไม่ต้องเปิดใบงานแล้วหาปุ่มอีกรอบ · เปิดครั้งเดียวต่อการเข้าหน้า
   */
  const openOnLoad = useRef(route.params.open ?? null);
  useEffect(() => {
    const want = openOnLoad.current;
    if (!want || !order) return;
    openOnLoad.current = null;
    if (want === "close" && order.status === "IN_PROGRESS") setClosing(true);
    else if (want === "stage" && order.status === "INSPECTING") setStageOpen(true);
    else if (want === "problem" && order.status === "IN_PROGRESS") setRollbackOpen(true);
  }, [order]);
  // ขยับเมื่อมีไฟล์ถูกแนบจากที่อื่นนอกการ์ดไฟล์แนบ เพื่อสั่งให้การ์ดโหลดใหม่
  const [filesKey, setFilesKey] = useState(0);
  // รายการไฟล์ที่การ์ดไฟล์แนบโหลดมาแล้ว — ยืมมาใช้ต่อในการ์ดผลการทำงาน
  // จะได้ไม่ต้องยิงขอรายการเดิมซ้ำอีกรอบ (รูปย่อเป็น data URL ก้อนใหญ่)
  const [files, setFiles] = useState<Attachment[]>([]);
  const [deleting, setDeleting] = useState(false);
  // ขั้นที่ทำแล้วที่กดดูอยู่ (null = ไม่ได้ดู)
  const [stepInfo, setStepInfo] = useState<string | null>(null);
  // เปิดใบที่ไม่ใช่ของทีม/พื้นที่ตัวเอง (403) — หน้ากุญแจแทนตัวหนังสือแดง เพราะไม่ใช่ข้อผิดพลาด แค่ไม่ใช่งานของคุณ
  const [locked, setLocked] = useState(false);
  // การ์ดสาขา/การมอบหมายวางคู่กันเมื่อหน้าต่างกว้างพอ
  const [bodyWidth, setBodyWidth] = useState(0);
  const twoCol = bodyWidth >= 720;

  const optionsLoaded = useRef(false);
  const load = useCallback(async (): Promise<WorkOrder | null> => {
    // เพิ่งกดบันทึก — เซิร์ฟเวอร์ส่งใบงานทั้งก้อนกลับมาแล้ว ใช้เลย ไม่ต้องรอถามซ้ำ (utils/freshOrder.ts)
    // ตัวเลือกในฟอร์ม (ทีม ช่าง คลัง) ไม่ได้เปลี่ยนตามขั้น ใช้ชุดที่โหลดไว้ตอนเปิดหน้า
    const fresh = takeFresh<WorkOrder>(id);
    if (fresh && optionsLoaded.current) {
      setOrder(fresh);
      return fresh;
    }
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
          adminWarehouse?: string;
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
      if (options.data.adminWarehouse) setAdminWarehouse(options.data.adminWarehouse);
      setTechnicians(options.data.technicians);
      setTeams(options.data.teams ?? []);
      optionsLoaded.current = true;
      setError(null);
      setLocked(false);
      return detail.data;
    } catch (e) {
      setError(apiErrorMessage(e));
      setLocked((e as { response?: { status?: number } })?.response?.status === 403);
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
        // สถานะเดียว (เจ้าของงานเลือก ต.ค. 69) — สถานะชั้นที่สองขึ้นเฉพาะตอนติดจริง (อะไหล่หมด / รอลูกค้า)
        return out
          ? `${o.statusLabel} · อะไหล่หมด ${out} รายการ`
          : o.workStatus === MANUAL_STATUS && o.workStatusLabel
            ? `${o.statusLabel} · ${o.workStatusLabel}`
            : o.statusLabel;
      };
      const from = before ? label(before) : null;
      const to = label(next);
      showAlert(`${next.code} ${what}`, from && from !== to ? `${from} → ${to}` : to);
    },
    [order, load]
  );

  // ปุ่ม "รีเฟรช" ด้านบนโหลดหน้าใบงานจริง — เดิมหน้านี้ไม่ได้ผูกไว้ กดแล้วขึ้น "อัปเดตแล้ว" โดยไม่ได้โหลดอะไร
  useRefreshHandler(load);

  /**
   * มีคนอื่นเปลี่ยนใบงานนี้ระหว่างที่เปิดอยู่ — ถามรุ่นข้อมูลทุก 20 วินาทีและตอนกลับมาที่แท็บ (ต.ค. 69)
   *
   * ไม่มีฟอร์มเปิด → โหลดใหม่ให้เองพร้อมบอกว่าใครเปลี่ยน · มีฟอร์มเปิด → แถบเหลือง ไม่โหลดทับที่กำลังกรอก
   * ปิดฟอร์มแล้วเช็คอีกรอบทันที · ถามแค่เลขประวัติล่าสุด (เบา) ไม่โหลดทั้งใบทุกรอบ
   */
  const [staleNote, setStaleNote] = useState<string | null>(null);
  const live = useRef({ order, load });
  live.current = { order, load };
  const checkRemote = useCallback(async () => {
    const cur = live.current.order;
    if (!cur || !pageVisible()) return;
    let r: { v: number; byId: number | null; byName: string | null; actionLabel: string | null; at: string | null; statusLabel: string };
    try {
      r = (await api.get(`/work-orders/${cur.id}/version`, { loadingText: false })).data;
    } catch {
      return; // เน็ตหลุด / เซิร์ฟเวอร์หลับ — รอบหน้าค่อยถาม
    }
    if (r.v <= latestLogId(cur)) return;
    // ของที่ตัวเองทำจากอีกแท็บ/อีกเครื่อง โหลดเงียบ ๆ ไม่ต้องบอก
    const who = r.byId !== null && r.byId !== user?.id ? r.byName ?? "มีคน" : null;
    if (anyModalOpen()) {
      if (who) {
        const at = r.at ? new Date(r.at).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }) : "";
        setStaleNote(`${who} เปลี่ยนใบงานนี้ระหว่างที่คุณเปิดอยู่ (${r.actionLabel ?? "แก้ไข"} ${at} น.) — ข้อมูลที่เห็นอาจเก่า`);
      }
      return;
    }
    await live.current.load();
    setStaleNote(null);
    if (who) feedback.toast("info", `${who} อัปเดตใบงานนี้ — ${r.statusLabel}`);
  }, [user?.id]);
  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(checkRemote, 20_000);
      const off = onPageShown(checkRemote);
      return () => {
        clearInterval(timer);
        off();
      };
    }, [checkRemote])
  );
  // ปิดฟอร์มหมดแล้ว — ของที่ค้างไว้ระหว่างกรอกโหลดตอนนี้
  useEffect(() => subscribeModals((n) => (n === 0 ? void checkRemote() : undefined)), [checkRemote]);
  /**
   * เซิร์ฟเวอร์ตอบ 409 = หน้าจอถือข้อมูลเก่า (กดขั้นที่คนอื่นทำไปแล้ว · บันทึกทับของคนอื่น)
   * ฟอร์มแก้ไขรายละเอียดเปิดค้างไว้ให้ตรวจแล้วบันทึกใหม่ (ข้อความอยู่ในฟอร์ม) · ฟอร์มขั้นตอนปิด
   * เพราะขั้นเปลี่ยนไปแล้ว ฟอร์มเดิมไม่มีความหมาย — บอกเหตุผลด้วยข้อความจากเซิร์ฟเวอร์
   */
  useEffect(
    () =>
      subscribeWorkOrderStale((wid, message) => {
        if (wid !== id) return;
        void live.current.load();
        setStaleNote(null);
        if (editingNoteRef.current) {
          // ข้อความอยู่ท้ายฟอร์มด้วย แต่จอมือถือมักไม่เห็น — แจ้งด้านบนอีกที
          feedback.toast("warn", message ?? "มีคนแก้ใบงานนี้ไปแล้ว — โหลดข้อมูลใหม่ให้แล้ว");
          return;
        }
        setStageOpen(false);
        setClosing(false);
        setRollbackOpen(false);
        setStageBackOpen(false);
        setEtaOpen(false);
        feedback.toast("warn", `${message ?? "ข้อมูลใบงานนี้เปลี่ยนไปแล้ว"} — โหลดข้อมูลล่าสุดให้แล้ว`);
      }),
    [id]
  );

  /**
   * ปุ่มของขั้นนี้ — ขึ้นเฉพาะเมื่อถึงคิวของคนที่เปิดดูอยู่
   *
   * ไม่ขึ้นปุ่มที่กดแล้วโดนปฏิเสธ เพราะปุ่มที่กดไม่ได้คือปุ่มที่ทำให้คนสงสัยว่า
   * ตัวเองทำอะไรผิด ทั้งที่แค่ยังไม่ถึงคิว
   */
  function myTurn(o: WorkOrder) {
    if (!user) return false;
    // เบิกคลังอื่นเป็นสิทธิ์ของหัวหน้าภาค — แอดมินทำแทนได้ทุกขั้นยกเว้นขั้นนี้ (เซิร์ฟเวอร์กันซ้ำ)
    if (user.role === "ADMIN") return o.status !== "PARTS_PICKUP";
    // ทีม outsource ไม่มีบัญชีในแอป — หัวหน้าภาคปิดงาน/แจ้งปัญหาแทน (เจ้าของงานเลือก ต.ค. 69)
    if (o.status === "IN_PROGRESS" && o.assignedOutsource && user.role === "SUPERVISOR") return true;
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

  if (locked) {
    return (
      <PopupScreen title="ใบงาน" subtitle="ใบงานซ่อม">
        <View style={styles.centered} accessibilityLabel="ไม่มีสิทธิ์ดูใบงานนี้">
          <View style={styles.lockIcon}>
            <Ionicons name="lock-closed" size={22} color={colors.textMuted} />
          </View>
          <Text style={styles.lockTitle}>
            {me?.role === "SUPERVISOR" ? "ใบงานนี้อยู่นอกพื้นที่ที่คุณดูแล" : "ใบงานนี้ไม่ใช่ของทีมคุณ"}
          </Text>
          {/* ข้อความเซิร์ฟเวอร์ขึ้นต้นด้วยหัวข้อเดียวกัน — ตัดออก เหลือแค่คำแนะนำ */}
          <Text style={styles.lockText}>{error?.replace(/^ใบงานนี้ไม่ใช่ของทีมคุณ — /, "")}</Text>
          <TouchableOpacity style={styles.lockBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.lockBtnText}>กลับไปรายการใบงาน</Text>
          </TouchableOpacity>
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
          // ไม่รู้ว่าเลขใบเบิกตัวไหนเป็นของหัวหน้าภาค — ย้อนไปให้แอดมินเบิกใหม่แทน (เซิร์ฟเวอร์ปฏิเสธเหมือนกัน)
          x.value !== "PARTS_PICKUP" &&
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

  // ทางจบใบงาน — หัวหน้าภาค/แอดมินเท่านั้น (Admin Spare Part ถูกตัด user ทิ้งแล้ว · ดูในฐานะ ไม่ขึ้น)
  const canEnd =
    (user?.role === "SUPERVISOR" || user?.role === "ADMIN") &&
    !user?.viewAs &&
    !["DONE", "CANCELLED", "CLAIM_REVIEW"].includes(order.status);

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
  const cancelLog = order.status === "CANCELLED" ? order.logs.find((l) => l.action === "CANCELLED") ?? null : null;
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
    {cancelling ? (
      <CancelOrderModal
        order={order}
        onClose={() => setCancelling(false)}
        onDone={async () => {
          setCancelling(false);
          await reloadWithNotice();
        }}
      />
    ) : null}
    {supClosing ? (
      <SupervisorCloseModal
        order={order}
        technicians={technicians}
        subTeams={teams.filter((t) => t.outsource).map((t) => t.name)}
        onClose={() => setSupClosing(false)}
        onDone={async () => {
          setSupClosing(false);
          await reloadWithNotice();
        }}
      />
    ) : null}
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      onLayout={(e) => setBodyWidth(e.nativeEvent.layout.width)}
    >
      {/* ยกเลิกแล้ว — บอกว่าทำไม ใคร เมื่อไร (เหตุผลอยู่ในประวัติ CANCELLED ล่าสุด) */}
      {order.status === "CANCELLED" && cancelLog ? (
        <View style={[styles.sentBack, styles.cancelledBox]} accessibilityLabel="กล่องยกเลิกใบงาน">
          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.sentBackTitle, { color: colors.text }]}>ยกเลิกแล้ว{cancelLog.note ? ` — ${cancelLog.note}` : ""}</Text>
            <Text style={styles.sentBackMeta}>
              {cancelLog.byName ?? "—"} · {formatDateTime(cancelLog.createdAt)}
            </Text>
          </View>
        </View>
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
        {/* ไม่มีแถบ "งานด่วน — ทำก่อนใบปกติ" แล้ว (เจ้าของงานขอ ต.ค. 69) — บอกซ้ำกับป้าย "ด่วน" ข้างเลขใบงาน
            และกินที่ด้านบนการ์ด ออร่าแดงรอบการ์ดยังบอกตั้งแต่เปิดใบว่าเป็นงานด่วน */}
        <View style={styles.headRow}>
          <Text style={[styles.code, headingFont]}>{order.code}</Text>
          {urgent ? <UrgentBadge /> : null}
          {order.rolledBack ? (
            <View style={[styles.badge, styles.badgeBack]} accessibilityLabel="ป้ายย้อนขั้น">
              <Text style={[styles.badgeText, { color: "#fff" }]}>↩ ย้อนขั้นมา</Text>
            </View>
          ) : null}
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

        <View style={styles.titleRow}>
          <Text style={[styles.title, headingFont]}>{order.title}</Text>
          {/* เครื่อง + ขนาดบนหัวใบงาน (เจ้าของงานขอ ต.ค. 69) — เดิมอยู่ในการ์ดสาขาด้านล่าง ต้องเลื่อนหา */}
          {order.machineCode ? (
            <View style={styles.machinePill} accessibilityLabel={`เครื่อง ${machineTag(order.machineCode, order.machineCapacityKg)}`}>
              <Text style={styles.machinePillText}>เครื่อง {machineTag(order.machineCode, order.machineCapacityKg)}</Text>
            </View>
          ) : null}
        </View>
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
                          // ขั้นที่ย้อนมาจาก — วงเส้นประสีส้ม คู่กับกล่อง "ย้อนขั้นมา" ข้างล่าง
                          order.rolledBack?.from === stage.value && styles.stepDotFrom,
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
                          {state === "done" ? stage.doneLabel ?? stage.label : stage.action ?? stage.label}
                        </Text>
                      ) : null}
                      {/*
                        สถานะย่อย — ตอนนี้ติดอะไรอยู่ในขั้นนี้ (เจ้าของงานขอ ต.ค. 69)
                        ขึ้นเฉพาะตอนบอกอะไรเพิ่มจากชื่อขั้น: รอลูกค้า (คนตั้งเอง) ทุกขั้น ·
                        ขั้นเบิกอะไหล่ที่ยังไม่เช็คคลัง · อะไหล่หมดใช้ป้ายแดงข้างล่าง
                        ที่เหลือ ("รอช่างเข้าแก้ไข" ใต้ขั้นของแอดมิน ฯลฯ) ซ้ำหรือขัดกับชื่อขั้น ไม่ขึ้น
                      */}
                      {order.rolledBack?.from === stage.value ? (
                        <View style={styles.stepFromPill} accessibilityLabel="ขั้นที่ย้อนมา">
                          {/* แถบแคบ (มือถือ) คอลัมน์กว้างไม่กี่ตัวอักษร — ข้อความยาวจะตัดเป็นแนวตั้ง โชว์แค่ลูกศร วงประส้มบอกที่เหลือ */}
                          <Text style={styles.stepFromPillText}>{tight ? "↩" : "↩ ย้อนจากตรงนี้"}</Text>
                        </View>
                      ) : null}
                      {state === "now" && order.workStatus === MANUAL_STATUS ? (
                        <View style={[styles.stepSub, styles.stepSubCust]} accessibilityLabel="สถานะย่อย">
                          <Text style={[styles.stepSubText, styles.stepSubCustText]}>{order.workStatusLabel}</Text>
                        </View>
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
                      {r.stage.action ?? r.stage.label}
                      {SKIP_WHY[r.stage.value] ? ` — ${SKIP_WHY[r.stage.value]}` : ""}
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

        {staleNote ? (
          <View style={styles.staleBar} accessibilityLabel="แถบข้อมูลเก่า">
            <Ionicons name="sync-outline" size={16} color={colors.warningInk} />
            <Text style={styles.staleText}>{staleNote}</Text>
            <TouchableOpacity
              style={styles.staleBtn}
              onPress={async () => {
                await load();
                setStaleNote(null);
              }}
              accessibilityLabel="โหลดข้อมูลใหม่"
            >
              <Text style={styles.staleBtnText}>โหลดใหม่</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/*
          ช่างส่งกลับ — หัวหน้าภาคต้องเห็นก่อนอย่างอื่นว่าทำไมใบนี้กลับมา ใครส่ง เมื่อไร
          ข้อมูลเดิมอยู่ครบในการ์ดข้างล่าง แก้ได้ที่ปุ่ม "แก้ไข" แล้วส่งตรวจหรือเดินต่อจากปุ่มขั้นนี้
        */}
        {/*
          ย้อนขั้นมา (เจ้าของงานขอ ต.ค. 69) — คนที่เปิดใบต้องรู้ก่อนอย่างอื่นว่าใบนี้ถอยมา เพราะอะไร ใครย้อน
          ข้อมูลเดิมไม่หาย: ฟอร์มขั้นนี้เติมค่าก่อนย้อนไว้ให้ (rollbackPrefill) · หายเองเมื่อกดผ่านขั้นนี้
        */}
        {order.rolledBack ? (
          <View style={[styles.sentBack, styles.rolledBack]} accessibilityLabel="กล่องย้อนขั้น">
            <Ionicons name="arrow-undo" size={18} color={colors.rollbackInk} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.sentBackTitle, { color: colors.rollbackInk }]}>
                ย้อนขั้นมา{order.rolledBack.fromLabel ? `จาก “${order.rolledBack.fromLabel}”` : ""}
              </Text>
              {order.rolledBack.reason ? <Text style={styles.sentBackText}>{order.rolledBack.reason}</Text> : null}
              <Text style={styles.sentBackMeta}>
                {order.rolledBack.byName ?? "—"} · {formatDateTime(order.rolledBack.at)}
                {order.rollbackPrefill ? " · ข้อมูลเดิมเก็บไว้ครบ — กดปุ่มขั้นนี้แล้วจะเห็นค่าเดิมเติมไว้ให้" : ""}
              </Text>
            </View>
          </View>
        ) : null}
        {sentBack ? (
          <View style={styles.sentBack} accessibilityLabel="กล่องช่างส่งกลับ">
            <Ionicons name="arrow-undo" size={18} color={colors.warningInk} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sentBackTitle}>
                ช่างแจ้งปัญหาหน้างาน
                {order.status === "AWAITING_CONFIRM"
                  ? " — นัดลูกค้าใหม่ (ทีมเดิม อะไหล่เดิม)"
                  : order.status === "PARTS_CHECKED"
                    ? " — จ่ายงานใหม่ (เปลี่ยนทีม/วันได้)"
                    : ""}
              </Text>
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
        {declinedNewDate(order) ? (
          <View style={styles.sentBack} accessibilityLabel="กล่องหัวหน้าภาคส่งกลับนัดใหม่">
            <Ionicons name="calendar-outline" size={18} color={colors.warningInk} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sentBackTitle}>หัวหน้าภาคส่งกลับ — ทีมไม่ว่างวันที่ลูกค้าขอ โทรนัดร้านใหม่</Text>
              <Text style={styles.sentBackText}>{declinedNewDate(order)!.note ?? "—"}</Text>
              <Text style={styles.sentBackMeta}>
                {declinedNewDate(order)!.byName ?? "—"} · {formatDateTime(declinedNewDate(order)!.createdAt)}
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

        {subStage(order) && (me?.role === "SUPERVISOR" || me?.role === "ADMIN") ? <SubBox order={order} /> : null}
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
                    {/* ใบงาน SUB: ทีม outsource ทำ หัวหน้าภาคเอาผลที่ได้มาใส่ — คนละความหมายกับช่างปิดงานเอง */}
                    <Text style={styles.actionPrimaryText}>{order.assignedOutsource ? "บันทึกผลงาน SUB" : "ปิดงาน"}</Text>
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
                        : rescheduledPending(order)
                          ? "คอนเฟิร์มวันใหม่"
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
                    แจ้งปัญหาหน้างาน — ปิดงานไม่ได้ (บอกเหตุ แนบรูป ขอเบิกอะไหล่เพิ่มได้)
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
                  ? ` (${order.assignedToName ?? order.assignedTeam}${order.assignedOutsource ? " — หัวหน้าภาคปิดงานแทน" : ""})`
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
            <Row
              label="สถานะนัด"
              value={order.appointmentStatusLabel}
              sub={
                order.appointmentBy
                  ? `โดย ${order.appointmentBy.name ?? "—"} · ${formatDateTime(order.appointmentBy.at)}`
                  : undefined
              }
            />
          ) : null}
          <Row
            label="เปิดโดย"
            value={`${order.createdByName ?? "—"} · ${formatDateTime(order.createdAt)}`}
          />
          <Row label="ที่มา" value={order.source === "OUTAGE" ? "เปิดจากกระดาน" : "เปิดเอง"} />
        </View>
      </View>

      {/* ข้อความแจ้งคิวช่างให้ลูกค้า — แอดมินเท่านั้น (เจ้าของงานขอ ต.ค. 69): แอดมินเป็นคนคุยกับร้าน
          หัวหน้าภาค/ช่างไม่ได้ส่งข้อความหาลูกค้า เห็นแล้วเข้าใจผิดว่าต้องส่งเอง */}
      {hasCustomerMessage(order) && me?.role === "ADMIN" ? (
        <CustomerMessageCard order={order} style={card} />
      ) : null}

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
            {/* สถานะเดียวกับหัวใบงาน — สถานะชั้นที่สอง (ของกระดานเครื่องเสีย) ขัดกับขั้นได้ เช่น "รอช่างเข้าแก้ไข" ตอนรอจ่ายงาน */}
            <Row
              label="สถานะ"
              value={order.workStatus === MANUAL_STATUS && order.workStatusLabel ? `${order.statusLabel} · ${order.workStatusLabel}` : order.statusLabel}
            />
            {order.inspectionNote ? (
              <Row
                label="ผลตรวจหน้างาน"
                value={`${order.inspectionNote}${order.inspectedAt ? ` (${formatDate(order.inspectedAt)})` : ""}`}
              />
            ) : null}
            {order.services.length > 0 ? (
              <>
                <Text style={styles.partsHead}>ค่าบริการ (เสนอราคาลูกค้า)</Text>
                {order.services.map((v) => (
                  <View key={v.id} style={styles.partRow}>
                    <Text style={styles.partCode}>
                      {v.name} × {v.quantity}
                      {v.unit ? ` ${v.unit}` : ""}
                    </Text>
                    <Text style={styles.partName} numberOfLines={1}>
                      {v.note ?? ""}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}
            {order.waitingParts.length > 0 ? (
              <>
                <Text style={styles.partsHead}>อะไหล่ที่ต้องใช้</Text>
                {order.waitingParts.map((part) => (
                  <View key={part.sparePartId}>
                    <View style={styles.partRow}>
                      <Text style={styles.partCode}>
                        {partTitle(part)} × {part.quantity}
                        {part.unit ? ` ${part.unit}` : ""}
                      </Text>
                      {part.offCatalog ? <OffTag /> : null}
                      <Text style={styles.partName} numberOfLines={1}>
                        {part.offCatalog ? part.note ?? "" : part.name}
                      </Text>
                      {/* ผลเช็คคลัง — ว่างคือยังไม่มีใครเช็ค ต่างจากเช็คแล้วพบว่าหมด · ของนอกสโตร์ = จัดหาได้ไหม */}
                      {part.inStock === null ? (
                        <Text style={styles.stockPending}>ยังไม่เช็ค</Text>
                      ) : part.inStock ? (
                        <Text style={styles.stockIn}>{part.offCatalog ? "หาได้" : part.warehouse ?? "มีของ"}</Text>
                      ) : (
                        <Text style={partsOut.length ? styles.stockOutPill : styles.stockOut}>
                          {part.offCatalog ? "ยังหาไม่ได้" : "หมด"}
                        </Text>
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
              {/* หัวหน้าภาคปิดเองไม่มีงานที่ทำ — สิ่งที่บันทึกไว้คือเหตุผล เรียกให้ตรง */}
              <Text style={styles.summaryLabel}>
                {order.closeResult === "SUPERVISOR_CLOSED" ? "เหตุผลที่หัวหน้าภาคปิด" : "สรุปงานที่ทำ"}
              </Text>
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
          {order.subTeam ? <Row label="ทีม SUB ที่เข้าทำ" value={order.subTeam} /> : null}
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
                  {p.offCatalog ? `${p.name} (นอกสโตร์)` : `${p.partCode} · ${p.name}`} × {p.quantity}
                  {p.unit ? ` ${p.unit}` : ""}
                </Text>
              ))}
            </>
          ) : null}
        </View>
      ) : null}

      <History logs={order.logs} closed={closedOk} />

      {/*
        ปุ่มปิดใบงานปุ่มเดียว (เจ้าของงานเลือก ต.ค. 69) — กดแล้วเข้าฟอร์มเหตุผลที่ปิดตามปกติ
        ชื่อ "ปิดใบงาน" ไม่ใช่ "ปิดงาน" เพราะขั้นเข้างานมีปุ่ม "ปิดงาน" ของช่าง (แนบรูป) อยู่แล้ว แอดมินเห็นทั้งสองปุ่ม
        เคยลองแผงสามทาง (ซ่อมเสร็จ/ไม่ต้องเข้า/ยกเลิก) แต่เจ้าของงานอยากได้ปุ่มเดียวที่คุ้นมือ
        ยกเลิกใบงานย้ายไปอยู่ในชิปเครื่องมือด้านล่าง เพราะไม่ใช่ทางปิดงานปกติ
      */}
      {canEnd ? (
        <TouchableOpacity style={styles.closeBtn} onPress={() => setSupClosing(true)} accessibilityLabel="ปิดใบงาน">
          <Ionicons name="checkmark-done-circle" size={20} color="#fff" />
          <Text style={styles.closeBtnText}>ปิดใบงาน</Text>
        </TouchableOpacity>
      ) : null}

      {/* เครื่องมือรอง — ไม่ใช่ทางปิดงานปกติ จึงย่อเป็นชิปให้ไม่แย่งสายตาจากปุ่มปิดงาน */}
      {canFollowUp || canEnd || (user?.role === "ADMIN" && !order.isTest) ? (
        <View style={styles.toolRow}>
          <Text style={styles.toolLabel}>เครื่องมือ</Text>
          {canFollowUp ? (
            <TouchableOpacity style={styles.toolChip} onPress={() => setFollowUpOpen(true)} activeOpacity={0.7}>
              <Ionicons name="git-branch-outline" size={15} color={colors.primaryInk} />
              <Text style={styles.toolChipText}>เปิดใบงานรออะไหล่ต่อ</Text>
            </TouchableOpacity>
          ) : null}
          {user?.role === "ADMIN" && !order.isTest ? (
            <TouchableOpacity style={styles.toolChip} onPress={confirmTestCopy} activeOpacity={0.7}>
              <Ionicons name="copy-outline" size={15} color={colors.primaryInk} />
              <Text style={styles.toolChipText}>คัดลอกเป็นใบทดสอบ</Text>
            </TouchableOpacity>
          ) : null}
          {/* ปิดงานย้อนหลังแบบกรอกทุกขั้น — เดิมซ่อนอยู่ใต้ "ซ่อมเสร็จแล้ว" ของแอดมิน ย้ายมาไว้นี่ให้ยังมีทางเข้า */}
          {canEnd && user?.role === "ADMIN" ? (
            <TouchableOpacity
              style={styles.toolChip}
              onPress={() => setBackfilling(true)}
              activeOpacity={0.7}
              accessibilityLabel="ปิดงานย้อนหลัง"
            >
              <Ionicons name="time-outline" size={15} color={colors.primaryInk} />
              <Text style={styles.toolChipText}>ปิดงานย้อนหลัง (กรอกทุกขั้น)</Text>
            </TouchableOpacity>
          ) : null}
          {canEnd ? (
            <TouchableOpacity
              style={[styles.toolChip, { borderColor: colors.dangerSoft }]}
              onPress={() => setCancelling(true)}
              activeOpacity={0.7}
              accessibilityLabel="ยกเลิกใบงาน"
            >
              <Ionicons name="close-circle-outline" size={15} color={colors.danger} />
              <Text style={[styles.toolChipText, { color: colors.dangerInk }]}>ยกเลิกใบงาน</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/*
        ลบถาวร — แอดมินเท่านั้น และอยู่ท้ายสุดโดยตั้งใจ

        ต่างจากยกเลิก: ยกเลิกเก็บใบไว้พร้อมประวัติว่าใครยกเลิกเมื่อไหร่
        ส่วนลบคือหายไปทั้งใบ มีไว้สำหรับใบที่ไม่ควรมีอยู่ตั้งแต่แรก
        — เปิดผิดสาขา เปิดซ้ำ หรือใบที่ลองระบบ · กล่องแยกและบอกผลให้ชัด เพราะเดิมหน้าตาเหมือนลิงก์คัดลอก
      */}
      {user?.role === "ADMIN" ? (
        <View style={styles.dangerBox}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={styles.dangerTitle}>ลบใบงานถาวร</Text>
            <Text style={styles.dangerHint}>หายทั้งใบพร้อมประวัติ กู้คืนไม่ได้ · ใช้กับใบที่ไม่ควรมีตั้งแต่แรก ถ้าแค่ไม่ทำแล้วให้ "ยกเลิก"</Text>
          </View>
          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={confirmDelete}
            disabled={deleting}
            activeOpacity={0.7}
            accessibilityLabel="ลบใบงานนี้ถาวร"
          >
            {deleting ? (
              <Spinner color={colors.danger} size="small" />
            ) : (
              <Ionicons name="trash-outline" size={15} color={colors.danger} />
            )}
            <Text style={styles.deleteText}>ลบถาวร…</Text>
          </TouchableOpacity>
        </View>
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
        adminWarehouse={adminWarehouse}
        teams={teams}
        files={files}
        onFilesChanged={() => setFilesKey((k) => k + 1)}
        onCancel={() => setStageOpen(false)}
        onDone={async (kind) => {
          setStageOpen(false);
          // ขั้นเสนอราคาแนบใบเสนอราคา/บิลไปด้วย การ์ดไฟล์แนบต้องโหลดใหม่ถึงจะเห็น
          setFilesKey((k) => k + 1);
          await reloadWithNotice();
          // เพิ่งคอนเฟิร์มกับลูกค้า — จังหวะที่ต้องส่งข้อความแจ้งคิวช่างพอดี
          if (kind === "confirmed") setMessageOpen(true);
        }}
      />
      {messageOpen && hasCustomerMessage(order) ? (
        <CustomerMessageModal order={order} onClose={() => setMessageOpen(false)} />
      ) : null}

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
        subTeams={teams.filter((t) => t.outsource).map((t) => t.name)}
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
  INSPECT_DISPATCH: ["DISPATCHED"],
  INSPECTING: ["INSPECTED"],
  WAITING_PARTS: ["PARTS_ARRIVED"],
  AWAITING_QUOTE: ["QUOTED", "QUOTE_SKIPPED"],
  AWAITING_PAYMENT: ["PAID"],
  PARTS_REQUESTED: ["PARTS_CHECKED"],
  PARTS_PICKUP: ["PICKED_UP"],
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
  // คอนเฟิร์ม/เลื่อน และส่งช่าง ใช้ทั้งงานตรวจและงานซ่อม — แยกด้วยขั้นที่ส่งต่อไป
  // (นัดตรวจของใบเก่าไป INSPECTING ตรง ใบใหม่ไป INSPECT_DISPATCH)
  const goesTo: Record<string, string[]> = {
    INSPECT_CONFIRM: ["INSPECT_DISPATCH", "INSPECTING"],
    INSPECT_DISPATCH: ["INSPECTING"],
    AWAITING_CONFIRM: ["ASSIGNED"],
    ASSIGNED: ["IN_PROGRESS"],
  };
  const to = stageValue ? goesTo[stageValue] : undefined;
  const log = logs.find((l) => actions.includes(l.action) && (!to || to.includes(l.status)));
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
 * บอกก่อนกดว่าอะไรถูกเอาออกจากใบ (วันนัด ทีม ผลเช็คคลัง) — และตั้งแต่ ต.ค. 69 บอกว่าไม่หาย:
 * ค่าเดิมเก็บไว้ในประวัติ ขั้นที่ย้อนไปเติมให้ (เจ้าของงานขอ — เดิมย้อนแล้วต้องกรอกใหม่ทั้งหมด)
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
        ใบใหม่ลิงก์กับ {order.code} สถานะ “แอดมิน · เบิกอะไหล่” — แอดมินเช็คคลังและเบิกเมื่อของเข้า
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
    const all = ["NEW", "INSPECT_CONFIRM", "INSPECT_DISPATCH", "INSPECTING", "PARTS_SOURCING", "AWAITING_QUOTE", "AWAITING_PAYMENT", "WAITING_PARTS", "PARTS_REQUESTED", "PARTS_CHECKED", "AWAITING_CONFIRM", "ASSIGNED"];
    const idx = all.indexOf(value);
    const lost: string[] = [];
    if (idx >= 0 && idx <= all.indexOf("PARTS_CHECKED") && value !== "INSPECT_DISPATCH" && order.scheduledAt) lost.push("วันนัด");
    if (idx >= 0 && idx <= all.indexOf("PARTS_CHECKED") && !["INSPECTING", "INSPECT_DISPATCH", "INSPECT_CONFIRM"].includes(value) && order.assignedTeam)
      lost.push("ทีมที่รับงาน");
    if (idx >= 0 && idx <= all.indexOf("PARTS_REQUESTED") && order.waitingParts.some((p) => p.inStock !== null))
      lost.push("ผลเช็คคลังและเลขใบเบิก");
    if (value === "NEW" && order.needsParts !== null) lost.push("ใช้อะไหล่ไหม");
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
        <View style={styles.keepBox} accessibilityLabel="ข้อมูลที่เก็บไว้">
          <Text style={styles.keepTitle}>✓ ข้อมูลที่กรอกไว้ไม่หาย — ขั้นที่ย้อนไปจะเติมค่าเดิมให้</Text>
          <Text style={styles.keepText}>{lost.join(" · ")}</Text>
          {lost.includes("ทีมที่รับงาน") ? (
            <Text style={styles.keepHint}>ใบนี้จะออกจากบอร์ดแผนงานของทีมเดิมก่อน จนกว่าจะจ่ายงานอีกครั้ง</Text>
          ) : null}
        </View>
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
  adminWarehouse,
  teams,
  files,
  onFilesChanged,
  onCancel,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  warehouses: string[];
  adminWarehouse: string;
  teams: Team[];
  /** ไฟล์แนบของใบงาน (จากการ์ดไฟล์แนบ) — ฟอร์มผลตรวจบอกว่าแนบอะไรไว้แล้ว */
  files: Attachment[];
  /** แนบ/ลบไฟล์จากฟอร์มแล้ว — ให้การ์ดไฟล์แนบโหลดรายการใหม่ */
  onFilesChanged: () => void;
  onCancel: () => void;
  /** confirmed = เพิ่งคอนเฟิร์มนัดกับลูกค้า (หน้าใบงานเปิดข้อความแจ้งลูกค้าให้) */
  onDone: (kind?: "confirmed") => void;
}) {
  const [needsParts, setNeedsParts] = useState<boolean | null>(null);
  const [parts, setParts] = useState<PickedPart[]>([]);
  // ของนอกสโตร์แยกช่อง — ส่งกลับด้วยชื่อ เซิร์ฟเวอร์จับคู่กับแถวเดิม ผลเช็คจึงไม่หาย
  const [offParts, setOffParts] = useState<OffPart[]>([]);
  // ค่าบริการ (ค่าแรง ค่าเดินทาง) — มีรายการ = ส่งแอดมินทำใบเสนอราคา ใช้หรือไม่ใช้อะไหล่ก็ได้
  const [services, setServices] = useState<OffPart[]>([]);
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
  // เอกสารขั้นเสนอราคา — ใบเสนอราคา และบิลที่ลูกค้าจ่ายแล้ว · แนบได้หลายไฟล์
  // (ใบเสนอราคาค่าอะไหล่กับค่าบริการแยกใบ, เอกสารหลายหน้าที่ถ่ายเป็นรูปทีละหน้า)
  const [docs, setDocs] = useState<PickedAttachment[]>([]);
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
  // ขั้นเบิกอะไหล่: ของอยู่คลังอื่น — ข้อความถึงหัวหน้าภาคที่ต้องไปเบิก (บังคับเมื่อมีตัวที่อยู่คลังอื่น)
  const [pickupNote, setPickupNote] = useState("");
  // ขั้นหัวหน้าภาคเบิก: คลังที่เบิกจริง + เลขใบเบิก รายตัว (อาจเบิกคนละคลังคนละใบ) · เบิกไม่ได้ = ส่งกลับแอดมิน
  const [pickup, setPickup] = useState<Record<number, { warehouse: string | null; requisitionNo: string }>>({});
  const [pickupFail, setPickupFail] = useState(false);
  // ลูกค้าขอเปลี่ยนวันแต่ทีมไม่ว่าง — ส่งกลับให้แอดมินนัดใหม่แทนการปล่อยงาน
  const newDate = rescheduledPending(order);
  const [declineDate, setDeclineDate] = useState(false);
  // ช่องที่เติมจากค่าเดิมก่อนย้อนขั้น — ติดป้ายเหลืองให้รู้ว่าไม่ใช่ค่าที่เพิ่งกรอก (ดู rollbackPrefill)
  const [prevUsed, setPrevUsed] = useState<string[]>([]);
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    /**
     * ย้อนขั้นแล้วข้อมูลไม่หาย (เจ้าของงานขอ ต.ค. 69) — ใบงานต้องว่างจริงตอนย้อน (ไม่งั้นโผล่บนบอร์ดทีมเดิม)
     * แต่ค่าที่ล้างไปเก็บไว้ในประวัติ เติมกลับให้เฉพาะช่องที่ตอนนี้ว่าง · ยังต้องกดยืนยันเหมือนเดิม
     */
    const pf = order.rollbackPrefill ?? null;
    const used: string[] = [];
    const prev = <T,>(now: T | null | undefined, old: T | null | undefined, label: string): T | null => {
      if (now !== null && now !== undefined && now !== "") return now;
      if (old === null || old === undefined || old === "") return null;
      used.push(label);
      return old;
    };
    setNeedsParts(order.status === "NEW" ? prev(order.needsParts, pf?.needsParts, "ใช้อะไหล่ไหม") : order.needsParts);
    // ใบที่เปิดมาเป็นงานตรวจสอบหน้างานและยังไม่เคยตรวจ — ตัวเลือกที่ถูกเกือบทุกครั้ง
    // ช่างส่งกลับ — ตัวเลือกแรกคือส่งช่างเข้าตรวจ (เจ้าของงานขอ ต.ค. 69) ทีมเดิมเป็นค่าตั้งต้นอยู่แล้ว (ข้างล่าง)
    setInspectFirst(
      order.status === "NEW" && ((order.jobType === "INSPECT" && !order.inspectedAt) || sentBackLog(order) !== null)
    );
    setFinding("");
    // ข้อความผลตรวจที่พิมพ์ค้างไว้ (ปิดฟอร์ม/แอปหลุด) — จำไว้ในเครื่องโดยไม่ต้องกดบันทึกร่าง
    if (order.status === "INSPECTING") loadDraft(`inspect:${order.id}`).then((v) => v && setFinding(v));
    // นัดตรวจที่หัวหน้าภาคไม่ได้ใส่วันเสนอ — ไม่มีวันให้ลูกค้า "ตกลง" มีแต่ต้องใส่วันนัด
    // ช่างแจ้งร้านปิด — วันเดิมใช้ไม่ได้แล้ว เปิดที่ "ลูกค้าขอเลื่อน" เลย
    setConfirmChoice(
      (order.status === "INSPECT_CONFIRM" && !order.scheduledAt) || (order.status === "AWAITING_CONFIRM" && (sentBackLog(order) || declinedNewDate(order))) ? "MOVE" : null
    );
    setSplitOut(true);
    // วันเดิมที่ผ่านไปแล้วไม่เติม — นัดวันที่เลยมาแล้วคือนัดที่ไม่มีใครไปได้
    const oldVisit = pf?.scheduledAt && pf.scheduledAt >= todayBkk() ? pf.scheduledAt : null;
    const visitDay = order.scheduledAt ? order.scheduledAt.slice(0, 10) : prev(null, oldVisit, "วันนัด");
    setVisit(visitDay ?? "");
    setVisitTime(order.scheduledTime ?? (oldVisit && visitDay === oldVisit ? pf?.scheduledTime ?? "" : ""));
    const split = splitParts(order.waitingParts);
    setParts(split.store);
    setOffParts(split.off);
    setServices(order.services.map((v) => ({ name: v.name, quantity: v.quantity, unit: v.unit ?? "", note: v.note ?? "" })));
    const oldCheck = new Map((pf?.parts ?? []).map((p) => [p.sparePartId, p]));
    const checkPrefilled = order.waitingParts.some((p) => p.inStock === null && oldCheck.get(p.sparePartId)?.inStock != null);
    if (checkPrefilled && ["PARTS_SOURCING", "PARTS_REQUESTED"].includes(order.status)) used.push("ผลเช็คคลัง");
    // ผลเช็คก่อนเสนอราคาที่เก่าเกิน 3 วัน — ของอาจถูกงานอื่นใช้ไประหว่างรอเงิน ต้องเช็คใหม่ (ไม่เติมให้)
    const stale = sourcingCheck(order)?.stale === true;
    setChecks(
      Object.fromEntries(
        order.waitingParts.map((p) => {
          const old = p.inStock === null ? oldCheck.get(p.sparePartId) : undefined;
          const now = stale && !p.requisitionNo ? null : p.inStock;
          return [p.sparePartId, { inStock: old?.inStock ?? now, warehouse: p.warehouse ?? old?.warehouse ?? null }];
        })
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
    setRequisitionNo(
      pending.find((p) => p.requisitionNo)?.requisitionNo ??
        (order.status === "PARTS_REQUESTED"
          ? prev(null, pending.map((p) => oldCheck.get(p.sparePartId)?.requisitionNo).find(Boolean), "เลขใบเบิก") ?? ""
          : "")
    );
    // ทีมของสาขาเป็นค่าตั้งต้น เพราะเป็นทีมที่รับผิดชอบสาขานี้อยู่แล้ว
    // จ่ายข้ามทีมยังทำได้ แต่ต้องตั้งใจเลือก ไม่ใช่เผลอ
    setTeam(
      order.assignedTeam ??
        (["PARTS_CHECKED", "INSPECT_DISPATCH"].includes(order.status) ? prev(null, pf?.assignedTeam, "ทีม") : null) ??
        order.suggestedTeam ??
        null
    );
    setDocs([]);
    setSkipQuote(false);
    setExpectedAt(
      order.partsExpectedAt
        ? order.partsExpectedAt.slice(0, 10)
        : ["PARTS_SOURCING", "PARTS_REQUESTED"].includes(order.status)
        ? prev(null, pf?.partsExpectedAt, "วันของเข้า") ?? ""
        : ""
    );
    // ป้ายวันนัดมีความหมายเฉพาะขั้นที่มีช่องวัน
    setPrevUsed(used.filter((u) => u !== "วันนัด" || order.status === "PARTS_CHECKED"));
    setPickupNote("");
    setPickup(
      Object.fromEntries(
        order.waitingParts.filter((p) => isPickup(p, adminWarehouse)).map((p) => [p.sparePartId, { warehouse: p.warehouse, requisitionNo: "" }])
      )
    );
    setPickupFail(false);
    setNote("");
    setError(null);
  }, [visible, order]);

  async function pickDoc(
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | PickedAttachment[] | null>
  ) {
    setBusy("กำลังเตรียมไฟล์");
    try {
      const picked = await pick(setBusy);
      // ต่อท้ายของเดิม ไม่ใช่แทนที่ — กดแนบอีกครั้งคือเพิ่มไฟล์
      const files = picked === null ? [] : Array.isArray(picked) ? picked : [picked];
      if (files.length) setDocs((prev) => [...prev, ...files]);
    } catch (e) {
      showAlert("เตรียมไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  /**
   * ส่งไฟล์ทีละไฟล์ แล้วเอาออกจากรายการทันทีที่ขึ้นสำเร็จ
   * ถ้าเน็ตหลุดกลางทาง กดบันทึกซ้ำจะส่งเฉพาะไฟล์ที่ยังไม่ขึ้น ไม่ใช่ซ้ำทั้งชุด
   */
  async function uploadDocs(role: "QUOTE" | "RECEIPT", label: string) {
    const list = [...docs];
    for (const [n, file] of list.entries()) {
      setBusy(list.length > 1 ? `${label} ${n + 1}/${list.length}` : label);
      await uploadAttachment(order.id, file, role);
      setDocs((prev) => prev.filter((f) => f !== file));
    }
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      if (order.status === "NEW" && inspectFirst) {
        await api.post(`/work-orders/${order.id}/inspect-request`, {
          team,
          scheduledAt: visit,
          scheduledTime: visitTime || null,
          note: note.trim() || undefined,
        });
      } else if (order.status === "INSPECTING") {
        await api.post(`/work-orders/${order.id}/inspection`, { note: finding.trim() });
        clearDraft(`inspect:${order.id}`);
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
        onDone("confirmed");
        return;
      } else if (order.status === "NEW") {
        await api.post(`/work-orders/${order.id}/parts`, {
          services: offPartsPayload(services),
          needsParts,
          parts: needsParts
            ? parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity }))
            : [],
          offParts: needsParts ? offPartsPayload(offParts) : [],
          assign: noPartsAssign ? { team, scheduledAt: visit, scheduledTime: visitTime || null } : undefined,
          note: note.trim() || undefined,
        });
      } else if (order.status === "PARTS_REQUESTED") {
        await api.post(`/work-orders/${order.id}/parts-check`, {
          // ส่งเฉพาะตัวที่ยังไม่ได้เบิก ตัวที่เบิกไปแล้วเซิร์ฟเวอร์ไม่แตะ
          results: thisRound.map((p) => ({
            sparePartId: p.sparePartId,
            inStock: checks[p.sparePartId]?.inStock ?? false,
            // ของนอกสโตร์ไม่ได้ออกจากคลัง — ไม่มีคลัง ไม่ผูกกับใบเบิกของรอบนี้
            warehouse: p.offCatalog ? null : checks[p.sparePartId]?.warehouse ?? null,
            // เลขใบเบิกของแอดมินใช้กับของคลังลาดพร้าว 94 เท่านั้น — คลังอื่นหัวหน้าภาคใส่เอง
            requisitionNo:
              p.offCatalog || checks[p.sparePartId]?.warehouse !== adminWarehouse ? null : requisitionNo.trim() || null,
          })),
          pickupNote: toPickup.length ? pickupNote.trim() : undefined,
          splitOut: mixed && splitOut,
          expectedAt: checkOut && expectedAt ? expectedAt : null,
          note: note.trim() || undefined,
        });
      } else if (order.status === "PARTS_PICKUP") {
        if (pickupFail) {
          await api.post(`/work-orders/${order.id}/parts-pickup/return`, { reason: note.trim() });
        } else {
          await api.post(`/work-orders/${order.id}/parts-pickup`, {
            results: pickupParts.map((p) => ({
              sparePartId: p.sparePartId,
              warehouse: pickup[p.sparePartId]?.warehouse,
              requisitionNo: pickup[p.sparePartId]?.requisitionNo.trim(),
            })),
            note: note.trim() || undefined,
          });
        }
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
          await uploadDocs("QUOTE", "กำลังส่งใบเสนอราคา");
          await api.post(`/work-orders/${order.id}/quote`, { note: note.trim() || undefined });
        }
      } else if (order.status === "AWAITING_PAYMENT") {
        await uploadDocs("RECEIPT", "กำลังส่งบิล");
        await api.post(`/work-orders/${order.id}/payment`, { note: note.trim() || undefined });
      } else if (order.status === "ASSIGNED" && declineDate) {
        await api.post(`/work-orders/${order.id}/decline-new-date`, { reason: note.trim() });
      } else if (order.status === "ASSIGNED" || order.status === "INSPECT_DISPATCH") {
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
  // หัวหน้าช่างใส่อะไหล่นอก/ค่าบริการ = ขอให้เสนอราคาเอง (ไม่ได้มาจากกฎแฟรนไชส์หมดประกัน)
  const quoteAsked = [
    order.waitingParts.some((p) => p.offCatalog) ? "มีอะไหล่นอก" : "",
    order.services.length ? `ค่าบริการ ${order.services.length} รายการ` : "",
  ].filter(Boolean);

  const unchecked =
    order.status === "PARTS_REQUESTED" &&
    thisRound.some((p) => {
      const c = checks[p.sparePartId];
      return c?.inStock === null || c?.inStock === undefined || (c.inStock && !c.warehouse && !p.offCatalog);
    });
  // ของที่อยู่คลังอื่น — แอดมินเบิกไม่ได้ ส่งให้หัวหน้าภาคเบิก
  const toPickup =
    order.status === "PARTS_REQUESTED"
      ? thisRound.filter((p) => {
          const c = checks[p.sparePartId];
          return !p.offCatalog && c?.inStock === true && !!c.warehouse && c.warehouse !== adminWarehouse;
        })
      : [];
  // มีของที่คลังลาดพร้าว 94 อย่างน้อยหนึ่งตัวในรอบนี้ = แอดมินเบิก = ต้องมีเลขใบเบิก
  const needsRequisition =
    order.status === "PARTS_REQUESTED" &&
    // ของนอกสโตร์ไม่ได้ออกจากคลัง ไม่มีใบเบิก — นับเฉพาะของในสโตร์
    thisRound.some((p) => !p.offCatalog && checks[p.sparePartId]?.inStock === true && checks[p.sparePartId]?.warehouse === adminWarehouse) &&
    !requisitionNo.trim();
  // ขั้นหัวหน้าภาคเบิก — ตัวที่ต้องเบิก · ตัวที่แอดมินเบิกไปแล้ว (โชว์ให้รู้ว่าครบชุด)
  const pickupParts = order.status === "PARTS_PICKUP" ? order.waitingParts.filter((p) => isPickup(p, adminWarehouse)) : [];
  const pickupBlocked =
    order.status === "PARTS_PICKUP" &&
    (pickupFail
      ? !note.trim()
      : pickupParts.some((p) => !pickup[p.sparePartId]?.warehouse || !pickup[p.sparePartId]?.requisitionNo.trim()));
  const pickupRequest = order.status === "PARTS_PICKUP" ? lastPickupRequest(order) : null;
  // ขั้นเสนอราคาต้องมีเอกสาร เว้นแต่กดข้ามซึ่งต้องบอกเหตุผลแทน
  const quoteBlocked =
    order.status === "AWAITING_QUOTE" &&
    (skipQuote ? !note.trim() : docs.length === 0 && !order.hasQuote);
  // ขั้นรอเบิกอะไหล่ต้องตอบครบทุกตัวที่ยังไม่ได้เบิก — ตอบบางตัวแล้วไปเสนอราคา คือเสนอราคาของที่ยังไม่รู้ว่ามี
  // (ตัวที่เบิกไปแล้วรอบก่อน ลูกค้าจ่ายไปแล้ว ไม่ต้องเช็คและเสนอราคาซ้ำ)
  const sourcingOut = order.status === "PARTS_SOURCING" ? thisRound.filter((p) => checks[p.sparePartId]?.inStock === false) : [];
  const sourcingBlocked =
    order.status === "PARTS_SOURCING" &&
    (thisRound.some((p) => typeof checks[p.sparePartId]?.inStock !== "boolean") ||
      (expectedAt !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(expectedAt)));
  const paymentBlocked =
    order.status === "AWAITING_PAYMENT" && docs.length === 0 && !order.hasReceipt;

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
  // ไม่ใช้อะไหล่ และไม่มีค่าบริการให้เสนอราคา = ขั้นถัดไปคือจ่ายงาน → จ่ายในฟอร์มนี้เลย
  const noPartsAssign = order.status === "NEW" && !inspectFirst && needsParts === false && offPartsPayload(services).length === 0;
  const timeOk = visitTime === "" || isTime(visitTime);

  // ไฟล์ตรวจครบไหม — อ่านจากรายการไฟล์ชุดเดียวกับการ์ด แนบจากการ์ดไว้ก่อนก็นับ
  const inspectMissing = order.status === "INSPECTING" ? missingInspection(files, order.inspectionStartedAt) : [];

  const blocked =
    quoteBlocked ||
    sourcingBlocked ||
    paymentBlocked ||
    (order.status === "NEW" &&
      (inspectFirst
        ? !team || !validDate || !timeOk
        : needsParts === null ||
          (noPartsAssign && (!team || !validDate || !timeOk)) ||
          (needsParts && parts.length === 0 && offPartsPayload(offParts).length === 0) ||
          (needsParts && offPartsIncomplete(offParts)) ||
          offPartsIncomplete(services))) ||
    (order.status === "INSPECTING" && (!finding.trim() || inspectMissing.length > 0)) ||
    ((order.status === "ASSIGNED" || order.status === "INSPECT_DISPATCH") && !team) ||
    (order.status === "PARTS_CHECKED" && (!team || !validDate || !timeOk)) ||
    (order.status === "ASSIGNED" && declineDate && !note.trim()) ||
    ((order.status === "AWAITING_CONFIRM" || order.status === "INSPECT_CONFIRM") &&
      (confirmChoice === null ||
        (confirmChoice === "MOVE" &&
          (!validDate || !timeOk || (visit === (order.scheduledAt ?? "").slice(0, 10) && visitTime === (order.scheduledTime ?? "")))))) ||
    unchecked ||
    needsRequisition ||
    pickupBlocked ||
    (toPickup.length > 0 && !pickupNote.trim()) ||
    (checkOut && expectedAt !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(expectedAt));

  return (
    <AppModal
      visible={visible}
      onClose={onCancel}
      busy={saving}
      title={<>
              {newDate ? "คอนเฟิร์มวันใหม่" : STAGE_BUTTON[order.status]?.label ?? "ทำขั้นนี้"}{" "}
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
                  : order.status === "ASSIGNED"
                    ? declineDate
                      ? "ส่งกลับให้แอดมินนัดใหม่"
                      : newDate
                        ? "คอนเฟิร์มวันใหม่ ปล่อยงาน"
                        : "รับทราบ ปล่อยงานให้ช่าง"
                  : order.status === "PARTS_PICKUP"
                    ? pickupFail
                      ? "ส่งกลับแอดมิน"
                      : "คอนเฟิร์ม เบิกแล้ว"
                    : toPickup.length && !checkOut
                      ? `ส่งหัวหน้าภาคเบิก ${toPickup.length} รายการ`
                      : order.status === "INSPECTING"
                        ? "บันทึกและส่งผลตรวจ"
                        : "ยืนยัน"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      }
    >
            {prevUsed.length ? (
              <View style={styles.prevBox} accessibilityLabel="ค่าเดิมก่อนย้อน">
                <Text style={styles.prevBoxTitle}>↩ ใบนี้ย้อนขั้นมา — เติมค่าเดิมไว้ให้: {prevUsed.join(" · ")}</Text>
                <Text style={styles.prevBoxText}>ตรวจแล้วกดยืนยัน แก้ได้ทุกช่อง · ช่องที่เป็นค่าเดิมติดป้าย “ค่าเดิมก่อนย้อน”</Text>
              </View>
            ) : null}

            {order.status === "NEW" ? (
              <>
                <Text style={styles.modalLabel}>
                  งานนี้ต้องใช้อะไหล่ไหม{prevUsed.includes("ใช้อะไหล่ไหม") ? <Text style={styles.prevTag}> ค่าเดิมก่อนย้อน </Text> : null}
                </Text>
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
                      เลือกทีมและวันเข้าตรวจ → แอดมินโทรคอนเฟิร์มวันกับร้าน (ร้านขอเลื่อน แอดมินเปลี่ยนวันให้) →
                      กลับมาให้คุณส่งช่างเข้าตรวจ · ทีมบันทึกผลตรวจแล้วใบงานจะกลับมาให้ระบุอะไหล่จากผลนั้น
                    </Text>
                    <DateField
                      value={visit}
                      onChange={setVisit}
                      label="วันเข้าตรวจหน้างาน"
                      emptyHint="ต้องระบุวันก่อนจึงจะส่งต่อได้"
                    />
                    <TimeField value={visitTime} onChange={setVisitTime} label="เวลา (ไม่ใส่ก็ได้)" />
                  </>
                ) : needsParts === true ? (
                  <>
                    <PartPicker parts={parts} onChange={setParts} label="อะไหล่ที่ต้องใช้" />
                    <OffPartEditor rows={offParts} onChange={setOffParts} />
                  </>
                ) : noPartsAssign ? (
                  <>
                    {/* จ่ายงานในฟอร์มนี้เลย (เจ้าของงานเลือก ต.ค. 69) — เดิมกดไม่ใช้อะไหล่แล้วต้องเปิดฟอร์มจ่ายงานอีกรอบ */}
                    <Text style={styles.linkedText}>
                      ไม่ใช้อะไหล่ — จ่ายงานในฟอร์มนี้เลย แล้วแอดมินโทรคอนเฟิร์มร้าน · ไปถึงแล้วต้องเปลี่ยนอะไหล่
                      ช่างแจ้งกลับมาให้ระบุอะไหล่ได้
                    </Text>
                    <DateField value={visit} onChange={setVisit} label="วันเข้างาน" emptyHint="ต้องระบุวันก่อนจึงจะจ่ายงานได้" />
                    <TimeField value={visitTime} onChange={setVisitTime} label="เวลา (ไม่ใส่ก็ได้)" />
                  </>
                ) : null}
                {!inspectFirst && needsParts !== null ? (
                  <OffPartEditor
                    rows={services}
                    onChange={setServices}
                    variant="service"
                    hint={needsParts ? "ค่าแรง ค่าเดินทาง ฯลฯ ที่ลูกค้าต้องจ่าย · ไม่ใส่ราคา แอดมินใส่ในใบเสนอราคา" : "ไม่มีค่าบริการ = ไปจัดคิวช่างเลยเหมือนเดิม"}
                  />
                ) : null}
                {!inspectFirst ? <QuoteRoute needsParts={needsParts} off={offPartsPayload(offParts).length} services={offPartsPayload(services).length} /> : null}
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
                        {partTitle(part)} × {part.quantity}
                        {part.unit ? ` ${part.unit}` : ""}
                      </Text>
                      {part.offCatalog ? <OffTag /> : null}
                      <Text style={styles.checkName}>{part.offCatalog ? part.note || "จัดหาเอง — ไม่ต้องใส่คลัง/เลขใบเบิก" : part.name}</Text>
                      <View style={styles.options}>
                        <TouchableOpacity
                          style={[styles.option, c.inStock === true && styles.optionOn]}
                          onPress={() => set(true)}
                          activeOpacity={0.7}
                          accessibilityLabel={`มีของ ${part.partCode}`}
                        >
                          <Text style={[styles.optionText, c.inStock === true && styles.optionTextOn]}>
                            {part.offCatalog ? "หาได้" : "มีอะไหล่"}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.option, c.inStock === false && styles.optionOut]}
                          onPress={() => set(false)}
                          activeOpacity={0.7}
                          accessibilityLabel={`หมด ${part.partCode}`}
                        >
                          <Text style={[styles.optionText, c.inStock === false && styles.optionTextOut]}>
                            {part.offCatalog ? "ยังหาไม่ได้" : "หมด"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
                {sourcingOut.length ? (
                  <DateField
                    value={expectedAt}
                    onChange={setExpectedAt}
                    label={prevUsed.includes("วันของเข้า") ? "คาดว่าของเข้า · ค่าเดิมก่อนย้อน" : "คาดว่าของเข้า"}
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
            {order.status === "PARTS_REQUESTED" && sourcingCheck(order) ? (
              <Text style={sourcingCheck(order)!.stale ? styles.warn : styles.linkedText} accessibilityLabel="ผลเช็คก่อนเสนอราคา">
                {sourcingCheck(order)!.stale
                  ? `เช็คอะไหล่ไว้เมื่อ ${sourcingCheck(order)!.days} วันก่อน (ก่อนเสนอราคา) — นานเกิน ${SOURCING_FRESH_DAYS} วัน เช็คใหม่ทุกตัว`
                  : `เช็คอะไหล่ไว้เมื่อ ${sourcingCheck(order)!.days === 0 ? "วันนี้" : `${sourcingCheck(order)!.days} วันก่อน`} (ก่อนเสนอราคา) — มีครบ ไม่ต้องเช็คซ้ำ เลือกคลังและใส่เลขใบเบิก`}
              </Text>
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
                <Text style={styles.modalLabel}>
                  เลขใบเบิกอะไหล่ ({adminWarehouse}){prevUsed.includes("เลขใบเบิก") ? <Text style={styles.prevTag}> ค่าเดิมก่อนย้อน </Text> : null}
                </Text>
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
                    ? `ต้องใส่เลขใบเบิกก่อน ถึงจะบันทึกได้ — ใช้กับอะไหล่ที่มีของที่${adminWarehouse}`
                    : `แอดมินเบิกได้เฉพาะ${adminWarehouse} — ของที่อยู่คลังอื่นส่งให้หัวหน้าภาคเบิก ไม่ต้องใส่เลขใบเบิก`}
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
                        {partTitle(part)} × {part.quantity}
                        {part.unit ? ` ${part.unit}` : ""}
                      </Text>
                      {part.offCatalog ? <OffTag /> : null}
                      <Text style={styles.checkName}>{part.offCatalog ? part.note || "จัดหาเอง — ไม่ต้องใส่คลัง/เลขใบเบิก" : part.name}</Text>
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
                            {part.offCatalog ? "ได้ของแล้ว" : "มีของ"}
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
                            {part.offCatalog ? "ยังไม่ได้ของ" : "หมด"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {/*
                        12 คลังเป็นชิปต่ออะไหล่หนึ่งตัว แปลว่าอะไหล่สามตัวก็ 36 ชิป
                        กว่าจะเลื่อนถึงช่องเลขใบเบิกข้างล่าง — dropdown ย่อให้เหลือบรรทัดเดียว
                      */}
                      {c.inStock === true && !part.offCatalog ? (
                        <Dropdown
                          value={c.warehouse}
                          placeholder="เลือกคลังที่มีของ"
                          accessibilityLabel={`คลังที่มี ${part.partCode}`}
                          options={warehouses.map((w) => ({
                            value: w,
                            label: w,
                            hint: w === adminWarehouse ? "แอดมินเบิก" : "หัวหน้าภาคเบิก",
                          }))}
                          onChange={(next) =>
                            setChecks((v) => ({
                              ...v,
                              [part.sparePartId]: { inStock: true, warehouse: next },
                            }))
                          }
                        />
                      ) : null}
                      {c.inStock === true && !part.offCatalog && c.warehouse && c.warehouse !== adminWarehouse ? (
                        <Text style={styles.pickupTag} accessibilityLabel={`หัวหน้าภาคเบิก ${part.partCode}`}>
                          หัวหน้าภาคเบิกเองจาก{c.warehouse} — ไม่ใช้เลขใบเบิกข้างบน
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
                {toPickup.length ? (
                  <View style={styles.pickupBox}>
                    <Text style={styles.modalLabel}>หมายเหตุถึงหัวหน้าภาค *</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={pickupNote}
                      onChangeText={setPickupNote}
                      placeholder="เบิกที่ไหน ติดต่อใคร เช่น มีที่คลังภูเก็ต 2 ตัว ติดต่อพี่เอ"
                      placeholderTextColor={colors.textFaint}
                      multiline
                      numberOfLines={2}
                      accessibilityLabel="หมายเหตุถึงหัวหน้าภาค"
                    />
                    <Text style={pickupNote.trim() ? styles.linkedText : styles.warn}>
                      {toPickup.length} รายการอยู่คลังอื่น — ใบงานไปขั้น “หัวหน้าภาค · เบิกอะไหล่ (คลังอื่น)” หัวหน้าภาคเบิกเสร็จแล้วไปจ่ายงานต่อ
                    </Text>
                  </View>
                ) : null}
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
                      แยกตัวที่หมดไปใบงานรออะไหล่ (แอดมินเบิกเมื่อของเข้า) — ใบนี้ไปซ่อมด้วยของที่มีได้เลย
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {checkOut ? (
                  <DateField
                    value={expectedAt}
                    onChange={setExpectedAt}
                    label={prevUsed.includes("วันของเข้า") ? "คาดว่าของเข้า · ค่าเดิมก่อนย้อน" : "คาดว่าของเข้า"}
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

            {order.status === "PARTS_PICKUP" ? (
              <View style={styles.checkList}>
                {pickupRequest ? (
                  <View style={styles.pickupBox} accessibilityLabel="หมายเหตุจากแอดมิน">
                    <Text style={styles.issuedTitle}>
                      จากแอดมิน{pickupRequest.byName ? ` (${pickupRequest.byName} · ${formatDateTime(pickupRequest.createdAt)})` : ""}
                    </Text>
                    <Text style={styles.pickupNoteText}>{pickupRequest.note ?? "—"}</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={styles.skipRow}
                  onPress={() => setPickupFail((v) => !v)}
                  activeOpacity={0.7}
                  accessibilityLabel="เบิกไม่ได้ ส่งกลับแอดมิน"
                >
                  <Ionicons name={pickupFail ? "checkbox" : "square-outline"} size={18} color={pickupFail ? colors.danger : colors.textFaint} />
                  <Text style={styles.skipText}>เบิกไม่ได้ — ส่งกลับให้แอดมินหาคลังอื่นหรือตอบว่าหมด (ใส่เหตุผลในช่องบันทึกข้างล่าง)</Text>
                </TouchableOpacity>
                {!pickupFail
                  ? pickupParts.map((part) => {
                      const v = pickup[part.sparePartId] ?? { warehouse: part.warehouse, requisitionNo: "" };
                      const set = (next: Partial<typeof v>) => setPickup((cur) => ({ ...cur, [part.sparePartId]: { ...v, ...next } }));
                      return (
                        <View key={part.sparePartId} style={styles.checkItem}>
                          <Text style={styles.checkCode}>
                            {partTitle(part)} × {part.quantity}
                          </Text>
                          <Text style={styles.checkName}>{part.name}</Text>
                          <Dropdown
                            value={v.warehouse}
                            placeholder="คลังที่เบิก"
                            accessibilityLabel={`คลังที่เบิก ${part.partCode}`}
                            options={warehouses.map((w) => ({
                              value: w,
                              label: w,
                              hint: w === part.warehouse ? "แอดมินบอก" : undefined,
                            }))}
                            onChange={(next) => set({ warehouse: next })}
                          />
                          {v.warehouse && v.warehouse !== part.warehouse ? (
                            <Text style={styles.linkedText}>เปลี่ยนจาก{part.warehouse}ที่แอดมินบอก — บันทึกคลังที่เบิกจริง</Text>
                          ) : null}
                          <TextInput
                            style={[styles.modalInput, styles.modalInputLine]}
                            value={v.requisitionNo}
                            onChangeText={(t) => set({ requisitionNo: t })}
                            placeholder="เลขใบเบิกจากระบบคลัง"
                            placeholderTextColor={colors.textFaint}
                            autoCapitalize="characters"
                            accessibilityLabel={`เลขใบเบิก ${part.partCode}`}
                          />
                        </View>
                      );
                    })
                  : null}
                {issued.length > 0 ? (
                  <View style={styles.issuedBox}>
                    <Text style={styles.issuedTitle}>แอดมินเบิกแล้ว</Text>
                    {issued.map((p) => (
                      <Text key={p.sparePartId} style={styles.issuedLine}>
                        {p.partCode} × {p.quantity} · {p.warehouse ?? "-"} · ใบเบิก {p.requisitionNo}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <Text style={pickupBlocked ? styles.warn : styles.linkedText}>
                  {pickupFail
                    ? note.trim()
                      ? "ใบงานกลับไปขั้นแอดมินเบิกอะไหล่"
                      : "ใส่เหตุผลที่เบิกไม่ได้ในช่องบันทึกข้างล่าง"
                    : pickupBlocked
                      ? "ใส่คลังและเลขใบเบิกให้ครบทุกรายการ"
                      : "เบิกครบแล้ว — ใบงานไปขั้นจ่ายงานให้ช่างต่อ"}
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
                    ? quoteAsked.length
                      ? `หัวหน้าช่างขอให้เสนอราคา: ${quoteAsked.join(" · ")} — ทำใบเสนอราคาจากระบบบัญชีแล้วแนบที่นี่`
                      : "สาขานี้เป็นแฟรนไชส์ที่หมดประกันแล้ว อะไหล่ที่ใช้เป็นของที่ขายให้ลูกค้า — ส่งใบเสนอราคาให้ลูกค้าก่อน"
                    : "ส่งใบเสนอราคาไปแล้ว รอลูกค้าจ่ายเงิน — ได้เงินแล้วแนบบิลเพื่อส่งต่อให้หัวหน้าภาคจ่ายงาน"}
                </Text>
                {/* รายการที่ต้องอยู่ในใบเสนอราคา — ใบเสนอราคาออกจากระบบบัญชี แอดมินดูจากตรงนี้แล้วไปพิมพ์ราคาที่นั่น */}
                {order.waitingParts.length || order.services.length ? (
                  <View style={styles.issuedBox}>
                    <Text style={styles.issuedTitle}>
                      {order.status === "AWAITING_QUOTE" ? "รายการที่ต้องใส่ในใบเสนอราคา" : "รายการในใบเสนอราคา"}
                    </Text>
                    {order.waitingParts.map((p) => (
                      <Text key={`p${p.sparePartId}`} style={styles.issuedLine}>
                        {p.offCatalog ? "อะไหล่นอก · " : ""}
                        {p.offCatalog ? p.name : `${p.partCode} ${p.name}`} × {p.quantity}
                        {p.unit ? ` ${p.unit}` : ""}
                        {p.note ? ` · ${p.note}` : ""}
                      </Text>
                    ))}
                    {order.services.map((v) => (
                      <Text key={`s${v.id}`} style={styles.issuedLine}>
                        ค่าบริการ · {v.name} × {v.quantity}
                        {v.unit ? ` ${v.unit}` : ""}
                        {v.note ? ` · ${v.note}` : ""}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {skipQuote ? null : (
                  <>
                    <Text style={styles.modalLabel}>
                      {order.status === "AWAITING_QUOTE" ? "ใบเสนอราคา" : "บิลที่ลูกค้าจ่ายแล้ว"}
                    </Text>
                    {(order.status === "AWAITING_QUOTE" ? order.hasQuote : order.hasReceipt) &&
                    docs.length === 0 ? (
                      <Text style={styles.linkedText}>แนบไว้แล้ว — แนบเพิ่มได้ถ้ามีเอกสารอีก</Text>
                    ) : null}
                    <FileStrip files={docs} onChange={setDocs} />
                    {docs.length > 1 ? <Text style={styles.linkedText}>{docs.length} ไฟล์ — กดแนบอีกเพื่อเพิ่ม</Text> : null}
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
                          onPress={() => pickDoc((stage) => pickImageAttachments(stage))}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.optionText}>เลือกรูป</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.option}
                          onPress={() => pickDoc(() => pickPdfAttachments())}
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

            {newDate ? (
              <>
                {declineDate ? <DispatchNote order={order} /> : null}
                <View style={styles.options} accessibilityLabel="ลูกค้าขอเปลี่ยนวัน ทีมว่างไหม">
                  <TouchableOpacity
                    style={[styles.option, !declineDate && styles.optionOn]}
                    onPress={() => setDeclineDate(false)}
                    accessibilityLabel="คอนเฟิร์มวันใหม่ ปล่อยงาน"
                  >
                    <Text style={[styles.optionText, !declineDate && styles.optionTextOn]}>ทีมว่าง — คอนเฟิร์มวันใหม่</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.option, declineDate && styles.optionOn]}
                    onPress={() => setDeclineDate(true)}
                    accessibilityLabel="ทีมไม่ว่าง ส่งกลับแอดมิน"
                  >
                    <Text style={[styles.optionText, declineDate && styles.optionTextOn]}>ทีมไม่ว่าง — ส่งกลับแอดมินนัดใหม่</Text>
                  </TouchableOpacity>
                </View>
                {declineDate ? (
                  <Text style={styles.linkedText}>ใบกลับไปให้แอดมินโทรนัดร้านใหม่ ทีมเดิมยังอยู่ — ใส่เหตุผลในช่องด้านล่าง แอดมินจะเห็น</Text>
                ) : null}
              </>
            ) : null}

            {(order.status === "ASSIGNED" && !declineDate) ||
            order.status === "INSPECT_DISPATCH" ||
            order.status === "PARTS_CHECKED" ||
            (order.status === "NEW" && (inspectFirst || noPartsAssign)) ? (
              <>
                {order.status === "ASSIGNED" || order.status === "INSPECT_DISPATCH" ? <DispatchNote order={order} /> : null}
                {order.status === "PARTS_CHECKED" ? (
                  <Text style={styles.linkedText}>
                    เลือกทีมและวันเข้างาน แล้วแอดมินจะโทรคอนเฟิร์มกับร้าน — ร้านขอเลื่อน แอดมินเปลี่ยนวันให้
                    แล้วส่งกลับมาให้คุณยืนยันออกงานอีกครั้ง
                  </Text>
                ) : null}
                <Text style={styles.modalLabel}>
                  {(order.status === "NEW" && inspectFirst) || order.status === "INSPECT_DISPATCH" ? "ทีมที่จะไปตรวจ" : "ทีมที่จะรับงาน"}
                  {prevUsed.includes("ทีม") ? <Text style={styles.prevTag}> ค่าเดิมก่อนย้อน </Text> : null}
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
                  options={teamOptions(teams, order.suggestedTeam, order.jobType)}
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
              // ทีละขั้น 1-2-3 ตามแบบที่เจ้าของงานส่งมา (ต.ค. 69) — ถ่ายไฟล์ก่อน แล้วค่อยสรุปว่าเจออะไร
              <View style={{ gap: spacing.sm }}>
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
                <TextStep n={4} title="ตรวจแล้วเจออะไร" done={!!finding.trim()}>
                  <TextInput
                    style={styles.modalInput}
                    value={finding}
                    onChangeText={(v) => {
                      setFinding(v);
                      saveDraft(`inspect:${order.id}`, v);
                    }}
                    placeholder="เช่น วาล์วน้ำทิ้งค้าง บอร์ดมีรอยไหม้ ต้องเปลี่ยนทั้งสองตัว"
                    placeholderTextColor={colors.textFaint}
                    multiline
                    numberOfLines={3}
                    accessibilityLabel="ผลตรวจหน้างาน"
                  />
                </TextStep>
                <MissingBox items={inspectMissing} why="ต้องแนบให้ครบ 3 อย่างก่อนส่งผลตรวจ" />
                <NextBox>ส่งแล้วใบงานกลับไปให้หัวหน้าภาคดูไฟล์ และระบุอะไหล่จากผลนี้</NextBox>
              </View>
            ) : null}

            {order.status === "WAITING_PARTS" ? (
              <>
                <Text style={styles.linkedText}>
                  ใบนี้แยกมาจาก {order.parent?.code ?? "ใบงานเดิม"} เพราะอะไหล่ไม่ครบ —
                  ของเข้าคลังแล้วกดส่งต่อ แอดมินจะเช็คและเบิกให้ใหม่
                </Text>
                {order.waitingParts.map((p) => (
                  <Text key={p.sparePartId} style={styles.issuedLine}>
                    {p.offCatalog ? `${p.name} (นอกสโตร์)` : `${p.partCode} · ${p.name}`} × {p.quantity}
                  </Text>
                ))}
              </>
            ) : null}

            {order.status === "PARTS_CHECKED" ? (
              <>
                <DateField
                  value={visit}
                  onChange={setVisit}
                  label={prevUsed.includes("วันนัด") ? "วันเข้างาน · ค่าเดิมก่อนย้อน" : "วันเข้างาน"}
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
                          ["OK", "ลูกค้าคอนเฟิร์มวันนี้", "ส่งให้หัวหน้าภาคส่งช่างเข้าตรวจ"],
                          ["MOVE", "ลูกค้าขอเลื่อน / เปลี่ยนวัน", "เลือกวันที่ลูกค้าสะดวก แล้วส่งให้หัวหน้าภาคส่งช่างเข้าตรวจ"],
                        ] as const)
                      : // ใบที่ส่งตรวจก่อนบังคับวัน (ก่อน ต.ค. 69 รอบสอง) — ไม่มีวันให้ลูกค้า "ตกลง"
                        ([["MOVE", "นัดวันเข้าตรวจ", "ใส่วันที่ลูกค้าสะดวก แล้วส่งให้หัวหน้าภาคส่งช่างเข้าตรวจ"]] as const)
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
                <Text style={styles.modalLabel}>
                  {order.status === "PARTS_PICKUP" && pickupFail
                    ? "เหตุผลที่เบิกไม่ได้ *"
                    : order.status === "ASSIGNED" && declineDate
                      ? "เหตุผลที่ทีมไม่ว่าง (แอดมินเห็น) *"
                      : "บันทึกเพิ่มเติม"}
                </Text>
                <TextInput
                  style={styles.modalInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder={
                    order.status === "PARTS_PICKUP" && pickupFail
                      ? "เช่น คลังภูเก็ตของหมดแล้ว"
                      : order.status === "ASSIGNED" && declineDate
                        ? "เช่น ทีมเต็มวันนั้น ขอเป็นสัปดาห์หน้า"
                        : "ไม่ใส่ก็ได้"
                  }
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
  /**
   * สถานะ — เลือกได้แค่ "อัตโนมัติตามขั้น" กับ "รอลูกค้าแจ้งซ่อม" (เจ้าของงานขอ ต.ค. 69)
   * ที่เหลือระบบตั้งตามขั้นและผลเช็คคลัง เปลี่ยนด้วยปุ่มขั้นตอนเท่านั้น (เซิร์ฟเวอร์ปฏิเสธด้วย)
   */
  const [waitCustomer, setWaitCustomer] = useState(order.workStatus === MANUAL_STATUS);
  const [statusNote, setStatusNote] = useState("");
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
    setWaitCustomer(order.workStatus === MANUAL_STATUS);
    setStatusNote("");
    setError(null);
    // ตั้งค่าตอนเปิดฟอร์มเท่านั้น — ใบงานโหลดใหม่ระหว่างเปิด (มีคนอื่นแก้) ต้องไม่ล้างที่กำลังพิมพ์
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const statusChanged = waitCustomer !== (order.workStatus === MANUAL_STATUS);
  const needNote = waitCustomer && statusChanged && !statusNote.trim();

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/work-orders/${order.id}`, {
        // มีคนอื่นแก้หลังจากรุ่นที่หน้าจอถืออยู่ → เซิร์ฟเวอร์ไม่ให้บันทึกทับ (409) แล้วหน้าใบงานโหลดใหม่ให้
        expectedVersion: latestLogId(order),
        title: title.trim() || order.title,
        priority,
        contactName: contactName.trim() || null,
        contactPhone: contactPhone.trim() || null,
        symptom: symptom.trim() || null,
        // ส่งสถานะเฉพาะตอนเปลี่ยนจริง — null = กลับไปอัตโนมัติตามขั้น
        // อะไหล่ที่รอและวันนัดเป็นของขั้นตอน แก้ผ่านปุ่มขั้นตอน ไม่ใช่ที่นี่
        ...(statusChanged
          ? { workStatus: waitCustomer ? MANUAL_STATUS : null, workStatusNote: waitCustomer ? statusNote.trim() : undefined }
          : {}),
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
            style={[styles.modalSave, (saving || needNote) && styles.modalSaveOff]}
            onPress={submit}
            disabled={saving || needNote}
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
      <TouchableOpacity
        style={[styles.statusOpt, !waitCustomer && styles.statusOptOn]}
        onPress={() => setWaitCustomer(false)}
        activeOpacity={0.7}
        accessibilityLabel="สถานะอัตโนมัติตามขั้น"
      >
        <Ionicons name={!waitCustomer ? "radio-button-on" : "radio-button-off"} size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.statusOptTitle}>อัตโนมัติตามขั้น</Text>
          <Text style={styles.statusOptHint}>
            {order.workStatus && order.workStatus !== MANUAL_STATUS ? `ตอนนี้: ${order.workStatusLabel}` : "ระบบตั้งตามขั้นของใบงาน"}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.statusOpt, waitCustomer && styles.statusOptOn]}
        onPress={() => setWaitCustomer(true)}
        activeOpacity={0.7}
        accessibilityLabel="สถานะรอลูกค้าแจ้งซ่อม"
      >
        <Ionicons name={waitCustomer ? "radio-button-on" : "radio-button-off"} size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.statusOptTitle}>รอลูกค้าแจ้งซ่อม</Text>
          <Text style={styles.statusOptHint}>ร้านยังไม่สะดวก / ยังไม่ให้เข้า — หมดอายุเองเมื่อใบงานเปลี่ยนขั้น</Text>
        </View>
      </TouchableOpacity>
      {waitCustomer && statusChanged ? (
        <>
          <Text style={styles.modalLabel}>เหตุผล (บังคับ)</Text>
          <TextInput
            style={[styles.modalInput, styles.modalInputLine]}
            value={statusNote}
            onChangeText={setStatusNote}
            placeholder="เช่น ร้านปิดปรับปรุงถึง 20 ต.ค."
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="เหตุผลที่รอลูกค้า"
          />
        </>
      ) : null}
      <View style={styles.statusLock}>
        <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
        <Text style={styles.statusLockText}>
          รอแอดมินเช็คอะไหล่ · รออะไหล่ · รอแอดมินส่งใบเสนอราคา · รอลูกค้าจ่ายเงิน · รอช่างเข้าแก้ไข — ระบบตั้งตามขั้น
          แก้ที่นี่ไม่ได้ เปลี่ยนด้วยปุ่มขั้นตอนเท่านั้น
        </Text>
      </View>

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
 * บอกหัวหน้าช่างก่อนกดว่าใบนี้จะไปไหนต่อ — มีอะไหล่นอก/ค่าบริการ = ส่งแอดมินทำใบเสนอราคาเสมอ
 * (เจ้าของงานเลือก ต.ค. 69) · ใบที่เสนอราคาเพราะกฎแฟรนไชส์หมดประกันไม่ขึ้นกล่องนี้ — กฎนั้นอยู่ฝั่งเซิร์ฟเวอร์
 */
function QuoteRoute({ needsParts, off, services }: { needsParts: boolean | null; off: number; services: number }) {
  const offCount = needsParts ? off : 0;
  if (needsParts === null || (offCount === 0 && services === 0)) return null;
  const chain = needsParts
    ? ["แอดมินเช็คอะไหล่", "แอดมินแนบใบเสนอราคา", "ลูกค้าจ่ายเงิน", "เบิกอะไหล่", "จ่ายงาน"]
    : ["แอดมินแนบใบเสนอราคา", "ลูกค้าจ่ายเงิน", "จ่ายงาน"];
  const why = [offCount ? `อะไหล่นอก ${offCount}` : "", services ? `ค่าบริการ ${services}` : ""].filter(Boolean).join(" · ");
  return (
    <View style={styles.quoteRoute} accessibilityLabel="ใบนี้จะส่งให้แอดมินทำใบเสนอราคา">
      <Text style={styles.quoteRouteTitle}>ใบนี้จะส่งให้แอดมินทำใบเสนอราคา — {why}</Text>
      <Text style={styles.quoteRouteChain}>{chain.join(" → ")}</Text>
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
  // ออกงานวันนี้ — ตัวใหญ่บนสุด ย้ำให้หัวหน้าภาครู้ว่ากดแล้วทีมต้องออกวันนี้ (เจ้าของงานขอ ต.ค. 69)
  const today = order.status === "ASSIGNED" && order.scheduledAt?.slice(0, 10) === todayBkk();
  return (
    <>
    {today ? (
      <View style={styles.todayHero} accessibilityLabel="ออกงานวันนี้">
        <Text style={styles.todayHeroBig}>ออกงานวันนี้{order.scheduledTime ? ` · ${order.scheduledTime} น.` : " · ทั้งวัน"}</Text>
        <Text style={styles.todayHeroText}>
          {order.assignedTeam ? `ทีม${order.assignedTeam} · ` : ""}
          {order.branchCode} {order.branchName}
        </Text>
      </View>
    ) : null}
    <View style={[styles.dispatchNote, moved && styles.dispatchNoteMoved]}>
      <Ionicons
        name={moved ? "swap-horizontal" : "checkmark-circle"}
        size={16}
        color={moved ? colors.warningInk : colors.successInk}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.dispatchText, { color: moved ? colors.warningInk : colors.successInk }]}>
          {moved ? last.note : `ลูกค้าคอนเฟิร์มแล้ว · ${order.status === "INSPECT_DISPATCH" ? "เข้าตรวจ" : "เข้างาน"} ${visitLabel(order)}`}
        </Text>
        {last ? (
          <Text style={styles.linkedText}>
            {last.byName ?? "—"} · {formatDateTime(last.createdAt)}
            {moved ? " — เช็คว่าทีมยังว่างวันใหม่ หรือเปลี่ยนทีมด้านล่าง" : ""}
          </Text>
        ) : null}
      </View>
    </View>
    </>
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

/** ใบงาน SUB = ใบที่จ่ายให้ทีม outsource แล้ว (รอปล่อยงาน / ทีมกำลังทำ) */
function subStage(o: WorkOrder) {
  return !!o.assignedOutsource && (o.status === "ASSIGNED" || o.status === "IN_PROGRESS");
}

/**
 * กล่องใบงาน SUB (เจ้าของงานขอ ต.ค. 69)
 *
 * หัวหน้าภาคเอาข้อมูลใบนี้ไปสั่งทีม outsource ทางไลน์ ทีมทำเสร็จส่งรูปกลับ แล้วหัวหน้าภาคบันทึกผลเอง
 * — บอกสามขั้นนี้ตรงหน้าใบงาน และให้คัดลอกข้อความส่งทีมได้ในปุ่มเดียว (เดิมต้องพิมพ์เองจากหน้าใบงาน)
 */
function SubBox({ order }: { order: WorkOrder }) {
  const team = order.assignedTeam ?? "outsource";
  return (
    <View style={styles.subBox} accessibilityLabel={`ใบงาน SUB ทีม ${team}`}>
      <Text style={styles.subTitle}>ใบงาน SUB · ทีม {team}</Text>
      <Text style={styles.subText}>
        ช่างทีมนี้ไม่มีบัญชีในแอป — 1) ส่งข้อมูลให้ทีม {team} · 2) ทีมทำเสร็จส่งรูปกลับมา · 3) หัวหน้าภาคกด "บันทึกผลงาน SUB"
      </Text>
      <View style={{ flexDirection: "row" }}>
        <CopyButton text={subDispatch(order)} label={`คัดลอกข้อมูลส่งทีม ${team}`} />
      </View>
    </View>
  );
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
            <ClaimMachineSummary
              nameplate={c.nameplate}
              fieldCheck={c.fieldCheck}
              photo={(() => {
                const at = files.findIndex((f) => f.id === c.nameplate?.photoId);
                return at < 0 ? null : { uri: files[at].thumbnailDataUrl, open: () => setViewing({ items: files, at }) };
              })()}
            />
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
  subTeams,
  onCancel,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  results: Option[];
  technicians: Technician[];
  /** ทีม outsource ทั้งหมด — ใบงาน SUB เลือกทีมที่เข้าทำจริง */
  subTeams: string[];
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
      .map(({ sparePartId, partCode, name, brand, quantity, offCatalog, unit, note }) => ({
        sparePartId, partCode, name, brand, quantity, offCatalog, unit, note,
      }));
  // ของนอกสโตร์ที่แอดมินจัดหาให้ (หรือที่ช่างซื้อหน้างานเอง) อยู่ช่องของตัวเอง — ไม่ต้องมีใบเหลือง
  const initial = splitParts(reclosing ? order.parts : requisitioned());
  const [parts, setParts] = useState<PickedPart[]>(initial.store);
  const [offParts, setOffParts] = useState<OffPart[]>(initial.off);
  // ฟอร์มนี้ค้างอยู่ตลอด (ไม่ได้สร้างใหม่ทุกครั้งที่เปิด) — เปิดขึ้นมาแล้วยังว่างให้เติมอีกรอบ
  // เผื่อเบิกของหลังจากเปิดหน้าใบงานไว้แล้ว
  useEffect(() => {
    if (!visible || reclosing) return;
    const next = splitParts(requisitioned());
    setParts((cur) => (cur.length ? cur : next.store));
    setOffParts((cur) => (cur.length ? cur : next.off));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, order]);
  /**
   * สรุปงานกับชื่อคนที่ไปที่พิมพ์ค้างไว้ — ปิดฟอร์มหรือแอปหลุดแล้วเปิดใหม่ยังอยู่ (เจ้าของงานขอ ต.ค. 69)
   * ไม่ต้องมีปุ่มบันทึกร่าง · รูปไม่ต้องจำ ส่วนที่แนบไว้จากการ์ดไฟล์แนบนับให้อยู่แล้ว
   */
  const draftKey = `close:${order.id}`;
  useEffect(() => {
    if (!visible) return;
    loadDraft(draftKey).then((raw) => {
      if (!raw) return;
      try {
        const d = JSON.parse(raw) as { note?: string; otherWorkers?: string };
        if (d.note) setNote(d.note);
        if (d.otherWorkers) setOtherWorkers(d.otherWorkers);
      } catch {
        // ร่างเสีย — ไม่จำก็ได้ ไม่ให้ฟอร์มพัง
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, draftKey]);
  function remember(patch: { note?: string; otherWorkers?: string }) {
    const d = { note, otherWorkers, ...patch };
    saveDraft(draftKey, d.note.trim() || d.otherWorkers.trim() ? JSON.stringify(d) : "");
  }
  const [drafts, setDrafts] = useState<Record<number, ClaimDraft>>({});
  /**
   * ข้อมูลป้ายรุ่น + เช็คตามคู่มือ ของเคลมในใบนี้ (เครื่องเดียว ใช้ร่วมทุกชิ้น)
   * ถูกตีกลับแล้วปิดใหม่ — ดึงของรอบก่อนมาให้แก้เฉพาะจุด (สแกนใหม่ได้)
   */
  const priorClaim = order.claims[0];
  const [plate, setPlate] = useState<PlateDraft>(() => ({
    values: Object.fromEntries(
      (priorClaim?.nameplate?.fields ?? []).map((f) => [f.key, { value: f.value, source: f.source, crop: f.crop ?? null }])
    ),
    verified: !!priorClaim?.nameplate?.verified,
  }));
  const [check, setCheck] = useState<ClaimCheckDraft>(() => ({
    errorCode: priorClaim?.fieldCheck?.errorCode ?? null,
    checked: priorClaim?.fieldCheck?.checked ?? [],
    install: Object.fromEntries((priorClaim?.fieldCheck?.install ?? []).map((i) => [i.key, i.answer])),
  }));
  const [slip, setSlip] = useState<PickedAttachment | null>(null);
  const [beforeFiles, setBeforeFiles] = useState<PickedAttachment[]>([]);
  const [afterFiles, setAfterFiles] = useState<PickedAttachment[]>([]);
  const [nameplate, setNameplate] = useState<PickedAttachment | null>(null);
  const [workerIds, setWorkerIds] = useState<number[]>(reclosing ? order.workers.map((w) => w.id).slice(0, 3) : []);
  // ทีม outsource ไม่มีชื่อในระบบให้ติ๊ก — เติมชื่อทีมไว้ให้ หัวหน้าภาคพิมพ์ชื่อช่างเพิ่มได้
  const [otherWorkers, setOtherWorkers] = useState(
    reclosing ? order.otherWorkers ?? "" : ""
  );
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
  /**
   * ใบงาน SUB: เลือกทีม SUB ที่เข้าทำแทนช่องช่างบริษัท (เจ้าของงานขอ ต.ค. 69) — เลือกทีมที่จ่ายงานไว้ให้ เปลี่ยนได้
   * ช่างบริษัทไปด้วยก็เปิดช่องคนที่ 1–3 เพิ่มได้ · ชื่อช่างของทีม SUB ไม่บังคับ
   */
  const isSub = !!order.assignedOutsource;
  const [subTeam, setSubTeam] = useState<string | null>(
    reclosing ? order.subTeam ?? null : isSub ? order.assignedTeam : null
  );
  const [withStaff, setWithStaff] = useState(isSub && workerIds.length > 0);
  const workersMissing = isSub ? !subTeam : workerIds.length === 0 && !otherWorkers.trim();
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
  const anyClaim = parts.some((p) => draftFor(p.sparePartId).on);
  const machineGaps = anyClaim ? claimMachineGaps(order.claimGuide, plate, check) : [];
  const claimsMissing = parts.some((p) => claimGaps(p).length > 0) || machineGaps.length > 0;

  /** เลือกไฟล์หนึ่งรอบแล้วส่งให้คนเรียกไปเก็บเอง — ทุกช่องใช้ตัวนี้ร่วมกัน */
  /** ไฟล์ปิดงานแต่ละขั้น — หมุนเฉพาะขั้นที่กำลังเตรียมไฟล์ ขั้นอื่นยังเห็นปุ่มตามปกติ */
  const [picking, setPicking] = useState<string | null>(null);
  async function pickFor(
    role: string,
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment[] | PickedAttachment | null>,
    keep: (files: PickedAttachment[]) => void
  ) {
    setPicking(role);
    setBusy("กำลังเตรียมไฟล์");
    try {
      const got = await pick(setBusy);
      const files = Array.isArray(got) ? got : got ? [got] : [];
      if (files.length) keep(files);
    } catch (e) {
      showAlert("เตรียมไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
      setPicking(null);
    }
  }

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
        offParts: offPartsPayload(offParts),
        workerIds: isSub && !withStaff ? [] : workerIds,
        otherWorkers: otherWorkers.trim() || null,
        ...(isSub ? { subTeam } : {}),
        ...(claimed.length && order.claimGuide
          ? {
              claimNameplate: {
                fields: Object.entries(plate.values)
                  .filter(([, v]) => v.value.trim())
                  .map(([key, v]) => ({
                    key,
                    label: order.claimGuide!.plate.lines.flatMap((l) => l.fields).find((f) => f.key === key)?.label ?? key,
                    value: v.value.trim(),
                    source: v.source,
                    crop: v.crop ?? null,
                  })),
                verified: plate.verified,
              },
              claimCheck: order.claimGuide.errors.length ? check : null,
            }
          : {}),
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
      clearDraft(draftKey);
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
      title={order.assignedOutsource && !reclosing ? <>บันทึกผลงาน SUB {order.code}</> : <>ปิดงาน {order.code}</>}
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modalSave,
              (saving || slipMissing || shotsMissing || workersMissing || nameplateMissing || followUpMissing || summaryMissing || claimsMissing || offPartsIncomplete(offParts)) &&
                styles.modalSaveOff,
            ]}
            onPress={submit}
            disabled={
              saving || slipMissing || shotsMissing || workersMissing || nameplateMissing || followUpMissing || summaryMissing || claimsMissing || offPartsIncomplete(offParts)
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

      {/*
        ไฟล์ปิดงานทีละขั้น 1-2-3 อยู่บนสุด (เจ้าของงานขอ ต.ค. 69 — แบบเดียวกับไฟล์ตรวจหน้างาน)
        ช่างถ่ายตอนยืนหน้าเครื่องก่อน แล้วค่อยกรอกสรุป/คนที่ไปตอนนั่งพัก

        ก่อนซ่อม · หลังซ่อม แยกขั้น — ก่อน = เจออะไรตอนไปถึง · หลัง = ซ่อมแล้วเครื่องกลับมาจริง
        คนตรวจย้อนเทียบสองภาพนี้ สรุปงานที่พิมพ์มาเป็นคำบอกเล่า ใบที่ปิดโดยไม่มีรูปตรวจย้อนไม่ได้
      */}
      <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
        {([
          ["BEFORE", "ก่อนซ่อม", "สภาพที่เจอตอนไปถึง · อาการ · Error", beforeFiles, setBeforeFiles, order.beforeCount ?? 0],
          ["AFTER", "หลังซ่อม", "ซ่อมเสร็จ · ทดสอบแล้วเครื่องกลับมาใช้ได้", afterFiles, setAfterFiles, order.afterCount ?? 0],
        ] as const).map(([role, label, hint, list, setList, already], i) => {
          const add = (files: PickedAttachment[]) => setList((v) => [...v, ...files]);
          const count = list.length + already;
          return (
            <EvidenceStep
              key={role}
              n={i + 1}
              title={`รูป / วิดีโอ${label}`}
              hint={hint}
              done={count > 0}
              doneText={`✓ ${count} ไฟล์`}
              busy={picking === role ? busy : null}
              primary={{
                label: count ? "ถ่ายเพิ่ม" : "ถ่ายรูปทันที",
                icon: "camera",
                onPress: () => pickFor(role, (stage) => pickImageAttachment(true, stage), add),
                accessibilityLabel: `ถ่ายรูป${label}`,
              }}
              secondary={{
                label: count ? "เลือกเพิ่ม" : "เลือกจากอัลบั้ม",
                icon: "images-outline",
                // เลือกได้หลายรูปพร้อมกัน (เจ้าของงานขอ ต.ค. 69) — เดิมทีละรูป ช่างเลยแนบแค่รูปเดียว
                onPress: () => pickFor(role, pickImageAttachments, add),
                accessibilityLabel: `เลือกรูป${label}`,
              }}
              more={[
                {
                  label: "วิดีโอ",
                  icon: "videocam-outline",
                  onPress: () => pickFor(role, (stage) => pickVideoAttachment(stage), add),
                  accessibilityLabel: `เลือกวิดีโอ${label}`,
                },
              ]}
              footLeft="เลือกจากอัลบั้มได้หลายรูปพร้อมกัน · วิดีโอไม่เกิน 60 วินาที"
            >
              {already > 0 ? <Text style={styles.linkedText}>แนบไว้แล้ว {already} ไฟล์ — เพิ่มได้อีก</Text> : null}
              <FileStrip files={[...list]} onChange={(next) => setList(next)} />
            </EvidenceStep>
          );
        })}

        {/*
          ป้ายรุ่นต้องถ่ายใหม่ทุกรอบที่ปิดงาน ไว้ไล่เทียบว่าไปถูกเครื่อง

          รุ่นที่กรอกไว้ตอนเปิดใบงานมาจากคนที่อาจไม่ได้ยืนอยู่หน้าเครื่อง
          ส่วนรูปนี้ถ่ายตอนทำงานเสร็จ — รูปเก่าตอบได้แค่ว่าเครื่องรุ่นอะไร
          ไม่ได้ตอบว่าคนที่ไปวันนั้นอยู่หน้าเครื่องตัวไหน
          บอกว่าในระบบบันทึกไว้ว่าอะไร คนถ่ายจะได้เทียบได้ตรงนั้นเลย
        */}
        <EvidenceStep
          n={3}
          title="ป้ายรุ่นของเครื่อง"
          hint={
            order.machineCode
              ? `ในระบบบันทึกไว้ว่า ${order.machineCode}${order.machineModel ? ` · ${order.machineModel}` : ""}${
                  order.machineCapacityLabel ? ` · ${order.machineCapacityLabel}` : ""
                } — ถ่ายป้ายรุ่นมาเทียบ`
              : "ถ่ายป้ายรุ่นของรอบนี้ ไว้ไล่เทียบว่าไปถูกเครื่อง"
          }
          done={!nameplateMissing}
          doneText="✓ แนบแล้ว"
          // ป้ายรุ่นใช้รูปเดียว — แนบแล้วเปลี่ยนได้ด้วยการลบรูปในแถบรูปย่อ ไม่ต้องมีปุ่มเพิ่ม
          canEdit={nameplateMissing}
          busy={picking === "NAMEPLATE" ? busy : null}
          primary={{
            label: "ถ่ายป้ายรุ่น",
            icon: "camera",
            onPress: () => pickFor("NAMEPLATE", (stage) => pickImageAttachment(true, stage), (f) => setNameplate(f[0] ?? null)),
            accessibilityLabel: "ถ่ายป้ายรุ่น",
          }}
          secondary={{
            label: "เลือกจากอัลบั้ม",
            icon: "images-outline",
            onPress: () => pickFor("NAMEPLATE", (stage) => pickImageAttachment(false, stage), (f) => setNameplate(f[0] ?? null)),
            accessibilityLabel: "เลือกรูปป้ายรุ่น",
          }}
        >
          {nameplate ? (
            <FileStrip files={[nameplate]} onChange={(next) => setNameplate(next[0] ?? null)} />
          ) : order.hasNameplate ? (
            <Text style={styles.linkedText}>แนบรูปของรอบนี้ไว้แล้ว</Text>
          ) : null}
        </EvidenceStep>
      </View>

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
        onChangeText={(v) => {
          setNote(v);
          remember({ note: v });
        }}
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
      {isSub ? (
        <>
          <Text style={styles.modalLabel}>
            ทีม SUB ที่เข้าทำ <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <Dropdown
            value={subTeam}
            onChange={setSubTeam}
            placeholder="เลือกทีม SUB"
            accessibilityLabel="ทีม SUB ที่เข้าทำ"
            options={[...new Set([...(order.assignedTeam ? [order.assignedTeam] : []), ...subTeams])].map((t) => ({
              value: t,
              label: t,
              hint: t === order.assignedTeam ? "ทีมที่จ่ายงาน" : undefined,
            }))}
          />
          <Text style={styles.modalLabel}>ชื่อช่างของทีม SUB (ไม่บังคับ)</Text>
          <TextInput
            style={[styles.modalInput, styles.modalInputLine]}
            value={otherWorkers}
            onChangeText={(v) => {
              setOtherWorkers(v);
              remember({ otherWorkers: v });
            }}
            placeholder="เช่น นายสมชาย, นายสมศักดิ์"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="ชื่อช่างของทีม SUB"
          />
          <TouchableOpacity
            style={styles.skipRow}
            onPress={() => setWithStaff((v) => !v)}
            accessibilityLabel="มีช่างบริษัทไปด้วย"
          >
            <Ionicons name={withStaff ? "checkbox" : "square-outline"} size={18} color={withStaff ? colors.primary : colors.textFaint} />
            <Text style={styles.skipText}>มีช่างบริษัทไปด้วย</Text>
          </TouchableOpacity>
          {workersMissing ? <Text style={styles.warn}>ต้องเลือกทีม SUB ที่เข้าทำ</Text> : null}
        </>
      ) : null}
      {!isSub || withStaff ? <Text style={styles.modalLabel}>ผู้เข้าปฏิบัติงาน{isSub ? " (ช่างบริษัท)" : ""}</Text> : null}
      {/*
        สามช่อง คนที่ 1–3 แทนการกดเลือกจากรายชื่อทั้งหมด

        ทีมหนึ่งไปกันไม่เกินสามคน การให้กดเลือกจากรายชื่อช่างทั้งบริษัท
        แปลว่าต้องกวาดตาหาชื่อตัวเองในกองที่ไม่เกี่ยวข้อง และกดเกินไปหนึ่งคน
        ก็ไม่มีอะไรบอกว่าเกิน — สามช่องบอกจำนวนสูงสุดด้วยตัวมันเอง

        คนเดียวกันเลือกซ้ำสองช่องไม่ได้ เพราะคนที่เลือกไปแล้วถูกตัดออก
        จากตัวเลือกของช่องที่เหลือ
      */}
      {(!isSub || withStaff ? [0, 1, 2] : []).map((slot) => (
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
      {isSub ? null : (
        <TextInput
          style={[styles.modalInput, styles.modalInputLine]}
          value={otherWorkers}
          onChangeText={(v) => {
            setOtherWorkers(v);
            remember({ otherWorkers: v });
          }}
          placeholder="คนอื่นที่ไปด้วยแต่ไม่มีบัญชีในระบบ (ไม่บังคับ)"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="คนอื่นที่ไปด้วย"
        />
      )}
      {workersMissing && !isSub ? (
        <Text style={styles.warn}>ต้องระบุอย่างน้อยหนึ่งคนว่าใครเข้าไปทำ</Text>
      ) : null}

      {/*
        อะไหล่ · ใบเหลือง · เคลม อยู่ก่อนรูปก่อน/หลังซ่อม — เดิมอยู่ท้ายฟอร์ม ช่างเลื่อนหาไม่เจอ
        ว่าต้องส่งเคลมตรงไหน (เจ้าของงานแจ้ง ต.ค. 69)
      */}
      <PartPicker parts={parts} onChange={setParts} label="อะไหล่ที่ใช้ไป" />
      <OffPartEditor
        rows={offParts}
        onChange={setOffParts}
        title="อะไหล่นอกสโตร์ที่ใช้"
        hint="ของที่หารหัสในสโตร์ไม่เจอ หรือซื้อหน้างานเอง · ใช้แต่ของนอกสโตร์ไม่ต้องแนบใบเหลือง"
      />

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
          {anyClaim && order.claimGuide ? (
            <>
              <ClaimMachineBox
                guide={order.claimGuide}
                registryModel={order.machineModel}
                plate={plate}
                onPlate={setPlate}
                check={check}
                onCheck={setCheck}
                onPhoto={setNameplate}
              />
              {machineGaps.length > 0 ? <Text style={styles.warn}>ยังขาด: {machineGaps.join(" · ")}</Text> : null}
            </>
          ) : null}
          {anyClaim ? (
            <Text style={styles.linkedText}>
              ปิดงานแล้วใบงานไปรอ Admin Spare Part ตรวจเคลมก่อน ถึงจะนับว่าปิดงาน
            </Text>
          ) : null}
        </>
      ) : null}

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
            ใบใหม่ไปอยู่ที่แอดมิน สถานะ “แอดมิน · เบิกอะไหล่” และลิงก์กับใบนี้
          </Text>
        </>
      ) : null}

      <MissingBox
        items={[
          beforeMissing && "รูปก่อนซ่อม",
          afterMissing && "รูปหลังซ่อม",
          nameplateMissing && "รูปป้ายรุ่น",
          summaryMissing && "สรุปงานที่ทำ",
          workersMissing && (isSub ? "ทีม SUB ที่เข้าทำ" : "ผู้เข้าปฏิบัติงาน"),
          slipMissing && "รูปใบเหลือง",
          claimsMissing && "ข้อมูลเคลมอะไหล่เก่า",
          followUpMissing && "อะไหล่ที่ยังขาด",
        ].filter((x): x is string => !!x)}
        why="ต้องครบก่อนถึงจะกดยืนยันปิดงานได้"
      />
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

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {sub ? (
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowValue}>{value}</Text>
          <Text style={styles.rowSub}>{sub}</Text>
        </View>
      ) : (
        <Text style={styles.rowValue}>{value}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  closeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.roleSupervisor, marginTop: spacing.md },
  closeBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
  toolRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  toolLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.3 },
  toolChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  toolChipText: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
  dangerBox: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.dangerLine, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  dangerTitle: { fontSize: 13.5, fontWeight: "800", color: colors.dangerInk },
  dangerHint: { fontSize: 12, lineHeight: 18, color: colors.body },
  dangerBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.card },
  todayHero: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, padding: spacing.md, gap: 2 },
  todayHeroBig: { fontSize: 20, lineHeight: 30, fontWeight: "800", color: colors.primaryDark },
  todayHeroText: { fontSize: 13.5, lineHeight: 21, color: colors.text },
  pickupBox: { gap: 6, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.warningTint, borderWidth: 1, borderColor: colors.warningBorder },
  pickupTag: { fontSize: 12, lineHeight: 18, color: colors.warningInk, fontWeight: "600" },
  pickupNoteText: { fontSize: 14, lineHeight: 21, color: colors.text },
  rowSub: { fontSize: 12, lineHeight: 18, color: colors.textMuted, marginTop: 1 },
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
    backgroundColor: colors.warningTint,
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
  quoteRoute: {
    gap: 4,
    marginTop: spacing.md,
    backgroundColor: colors.roleAdminSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  quoteRouteTitle: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.roleAdmin },
  quoteRouteChain: { fontSize: 12.5, lineHeight: 19, color: colors.body },
  dispatchNote: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    borderRadius: radius.sm,
    padding: spacing.md,
    backgroundColor: colors.successSoft,
  },
  dispatchNoteMoved: { backgroundColor: colors.warningTint },
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
  statusOpt: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  statusOptOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  statusOptTitle: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  statusOptHint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  statusLock: {
    flexDirection: "row",
    gap: 6,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
  },
  statusLockText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.textMuted },
  stepSub: {
    marginTop: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.roleAdmin,
    backgroundColor: colors.roleAdminSoft,
  },
  stepSubText: { fontSize: 11, lineHeight: 17, fontWeight: "700", color: colors.roleAdmin, textAlign: "center" },
  stepSubCust: { borderColor: colors.warning, backgroundColor: colors.warningTint },
  stepSubCustText: { color: colors.warningInk },
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
    backgroundColor: colors.navyFill,
    borderColor: colors.navyFill,
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
    backgroundColor: colors.warningTint,
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
  lockIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, marginBottom: spacing.sm },
  lockTitle: { fontSize: 16, fontWeight: "800", color: colors.text, textAlign: "center" },
  lockText: { marginTop: 4, fontSize: 13, lineHeight: 21, color: colors.textMuted, textAlign: "center", maxWidth: 360 },
  lockBtn: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 8 },
  lockBtnText: { fontSize: 13.5, fontWeight: "700", color: colors.navy },
  titleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  machinePill: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 10 },
  machinePillText: { fontSize: 13, lineHeight: 24, fontWeight: "800", color: colors.primaryInk },
  subBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.roleAdminLine,
    backgroundColor: colors.roleAdminSoft,
  },
  subTitle: { fontSize: 14.5, lineHeight: 22, fontWeight: "800", color: colors.roleAdmin },
  subText: { fontSize: 13, lineHeight: 20, color: colors.body },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
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
  staleBar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.warningTint,
  },
  staleText: { flex: 1, minWidth: 160, fontSize: 12.5, lineHeight: 19, fontWeight: "700", color: colors.warningInk },
  staleBtn: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  staleBtnText: { fontSize: 12.5, fontWeight: "700", color: colors.warningInk },
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
    backgroundColor: colors.warningTint,
  },
  rolledBack: { borderColor: colors.rollback, backgroundColor: colors.rollbackSoft },
  cancelledBox: { borderColor: colors.borderStrong, backgroundColor: colors.background },
  keepBox: { gap: 2, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.successLine, backgroundColor: colors.successSoft },
  keepTitle: { fontSize: 13, fontWeight: "800", color: colors.successInk },
  keepText: { fontSize: 12.5, color: colors.text },
  keepHint: { fontSize: 12, color: colors.textMuted },
  badgeBack: { backgroundColor: colors.rollback },
  stepDotFrom: { borderStyle: "dashed", borderColor: colors.rollback, borderWidth: 2 },
  stepFromPill: { marginTop: 3, borderRadius: 6, paddingHorizontal: 5, backgroundColor: colors.rollbackSoft },
  stepFromPillText: { fontSize: 10.5, fontWeight: "700", color: colors.rollbackInk },
  prevBox: { gap: 2, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningTint },
  prevBoxTitle: { fontSize: 13, fontWeight: "800", color: colors.warningInk },
  prevBoxText: { fontSize: 12, color: colors.warningInk },
  prevTag: { fontSize: 11, fontWeight: "700", color: colors.warningInk, backgroundColor: colors.warningTint },
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
  actionPrimary: { backgroundColor: colors.navyFill },
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
    backgroundColor: colors.warningTint,
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
    backgroundColor: colors.warningTint,
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
    backgroundColor: colors.warningTint,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  shotSlot: { borderWidth: 1.5, borderRadius: radius.md, padding: spacing.sm, gap: spacing.xs },
  shotBefore: { borderColor: colors.warning, backgroundColor: colors.warningTint },
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
