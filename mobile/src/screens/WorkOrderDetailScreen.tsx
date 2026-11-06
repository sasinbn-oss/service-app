/**
 * ใบงานหนึ่งใบ — ที่ช่างรับงานและปิดงาน
 *
 * ปิดใบงานไม่ได้ปิดเคสบนกระดาน เพราะเคสปิดตอนเครื่องหายไปจากไฟล์เท่านั้น
 * หน้านี้จึงเตือนตรงๆ ตอนปิดว่าเครื่องยังไม่กลับมา ไม่ใช่ปล่อยให้เข้าใจผิด
 * ว่ากดปิดแล้วจบ
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { machineTag } from "../utils/machine";
import { splitFormDetail } from "../utils/formLinks";
import {
  Animated,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import StepPulse from "../components/StepPulse";
import { UrgentBadge } from "../components/Urgent";
import ImageViewer from "../components/ImageViewer";
import AppModal, { ModalRow } from "../components/AppModal";
import CancelOrderModal from "../components/CancelOrderModal";
import { PAY_GO_LABEL, PaymentWaitBox, PayWaitButtons, PayWaitForms, payChipText, rememberDeclineReasons, type DeclineReason, type PayWaitDetail } from "../components/PaymentWait";
import TrashOrderModal from "../components/TrashOrderModal";
import TrashedOrderNote, { trashedInfoOf, type TrashedInfo } from "../components/TrashedOrderNote";
import { workOrderCode } from "../navigation/linking";
import { isTrashedError, restoreFromTrash, trashDay } from "../utils/trash";
import PopupScreen from "../components/PopupScreen";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage, noResponse, resolveImageUrl, staleWorkOrderId } from "../api/client";
import { currentPosition } from "../utils/position";
import { ChatBubble } from "../components/WorkOrderChat";
import { openUrl } from "../utils/share";
import { showAlert } from "../utils/alert";
import PartPicker, {
  brandBlockers,
  brandBlockText,
  crossBrandField,
  crossBrandMessage,
  CROSS_BRAND_OK,
  CROSS_BRAND_TITLE,
  machineBrandToSend,
  PickedPart,
  type PartTag,
  type PartsBrand,
} from "../components/PartPicker";
import BrandChips, { rememberMachineModels } from "../components/BrandChips";
import { brandFileOf, fileAllows, isOutsidePart } from "../utils/brandFile";
import { CopyButton, CustomerMessageCard, CustomerMessageModal } from "../components/CustomerMessage";
import { hasCustomerMessage, subDispatch } from "../utils/customerMessage";
import { SENT_TO_CUSTOMER } from "../utils/dispatchParts";
import OffPartEditor, {
  OffPart,
  OffSourceInfo,
  OffTag,
  offNameKey,
  offPartsIncomplete,
  offPartsMissing,
  offPartsPayload,
  partTitle,
  splitParts,
} from "../components/OffPartEditor";
import { offAnswerLine } from "../utils/offSource";
import DateField, { thaiDate, todayBkk } from "../components/DateField";
import TimeField, { isTime } from "../components/TimeField";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import TimelineModal, { TimelineButton } from "../components/TimelineModal";
import HowToButton from "../components/HowToButton";
import { howtoTarget, useHowToAction } from "../utils/howto";
import BackfillCloseModal from "../components/BackfillCloseModal";
import SupervisorCloseModal from "../components/SupervisorCloseModal";
import RemoteCloseModal from "../components/RemoteCloseModal";
import WorkOrderAttachments, { Attachment } from "../components/WorkOrderAttachments";
import { linkFor, prefetchAttachments } from "../utils/attachmentCache";
import { AdminReplyModal, AdminReviewBox, ackAdminReview, cancelAdminReview, type AdminReviewInfo } from "../components/AdminReview";
import InspectionSlots, { INSPECTION_SLOTS, inspectionFilesOf, missingInspection } from "../components/InspectionSlots";
import EvidenceStep, { MissingBox, NextBox, TextStep } from "../components/EvidenceStep";
import { clearDraft, loadDraft, saveDraft } from "../utils/draft";
import { setFlash } from "../utils/flash";
import { clearCloseDraft, closeDraftSaver, loadCloseDraft, SKIP_REASONS, skipText, type ClaimPartDraft, type ClaimSkip, type CloseDraft, type SkipReason } from "../utils/closeDraft";
import ClaimFileSlot, { slotKey, useClaimUploads } from "../components/claims/ClaimFileSlot";
import PreRepairBox from "../components/claims/PreRepairBox";
import CloseStepper, { PartTabs, type StepInfo } from "../components/close/CloseStepper";
import MachineStep from "../components/close/MachineStep";
import PartClaimStep, { type TroubleshootingHint } from "../components/close/PartClaimStep";
import SendStep, { type SendRow } from "../components/close/SendStep";
import WorkFiles from "../components/close/WorkFiles";
import { plateGaps, plateItemCount } from "../components/close/PlateConfirm";
import { NO_ERROR_CODE } from "../utils/claimErrors";
import { readPlatePhoto } from "../utils/ocr";
import RejectedBanner from "../components/claims/RejectedBanner";
import FixList, { buildFixItems, unresolvedOf } from "../components/claims/FixList";
import { PART_FLAGS, partFlagsOf, rejectLinesOf, WHOLE_ORDER_PART, type ServerFlag } from "../utils/claimFlags";
import ClaimReview from "../components/claims/ClaimReview";
import DecisionBar, { ReviewDone } from "../components/claims/DecisionBar";
import DownloadPanel from "../components/claims/DownloadPanel";
import { useClaimVerdicts, type ReviewOutcome } from "../components/claims/useClaimVerdicts";
// ใครตรวจ/ตัดสินเคลมได้ — กติกาเดียวกับกล่องงานตรวจเคลมและเมนู (utils/claimQueue)
import { canDecideClaims, canReviewClaims, refreshClaimQueueCount } from "../utils/claimQueue";
import ClaimTrail, { dayTime } from "../components/claims/ClaimTrail";
import CheckGroups from "../components/claims/CheckGroups";
import {
  brokenMatches,
  errorVideoLabel,
  checkGroupsOf,
  claimRoundOf,
  claimTrailOf,
  daysSince,
  evidenceOf,
  isNewThisRound,
  oldRoundsLabel,
  oldRoundsOf,
  previousOf,
  roundOf,
  isLockedStatus,
  rejectedRowsOf,
  roundPartsOf,
  type ClaimKeep,
  type ClaimRepeat,
  type ClaimRound,
  type PartClaim,
} from "../utils/claimEvidence";
import { takeFresh } from "../utils/freshOrder";
import { ClaimCheckDraft, ClaimMachineSummary, PlateDraft } from "../components/ClaimMachineBox";
import { ClaimHistoryLinks } from "../components/ClaimHistoryEntry";
import { BranchPartsLinks } from "../components/BranchPartsEntry";
import { isBrandOnly, plateFields, type ClaimGuide, type PlateValue } from "../utils/nameplate";
import {
  AcceptKinds,
  PickedAttachment,
  asList,
  filesToAttachments,
  pickImageAttachment,
  pickVideoAttachment,
  pickVideoAttachments,
  uploadAttachment,
  attachmentIcon,
  pickPdfAttachments,
  pickImageAttachments,
} from "../utils/attachments";
import FileDropZone, { DropHint } from "../components/FileDropZone";
import { useAuth } from "../context/AuthContext";
import { isAreaTeam } from "../utils/areaTeam";
import { HomeStackParamList } from "../navigation/types";
import { colors, radius, shadow, spacing, headingFont } from "../theme";
import { formatDate, formatDateTime, statusTone } from "./WorkOrderListScreen";
import { useRefreshHandler } from "../components/RefreshButton";
import { feedback } from "../components/Feedback";
import { anyModalOpen, notifyWorkOrderStale, onPageShown, pageVisible, subscribeModals, subscribeWorkOrderStale } from "../utils/liveSync";
import { APPOINTMENT_DONE, ISSUE_LOGS, buildStepPath, issueLeftOf, type FlowInfo, type StepState } from "../utils/stepPath";
import { RECALL_STAGES, RESCHEDULE_STAGES, canMoveDates } from "../utils/reschedule";
// หัวหน้าภาคที่ดูแลงาน IT — กติกาชุดเดียวกับปุ่มในแถวของแท็บรอเงิน (PaymentWait canActOnPayment)
import { itLeadActs, itLeadOf } from "../utils/itLead";
import { techPickHint } from "../utils/teams";
import {
  AdminDayLine,
  AskAdminBox,
  LiveScheduleChip,
  ScheduleDayHelp,
  UrgentAnswerModal,
  UrgentReleaseModal,
} from "../components/DispatchCutoff";
import {
  adminDayLine,
  askStateError,
  closedFromError,
  dayAllowed,
  dayShort,
  declinedText,
  releasedText,
  rescheduledText,
  RELEASE_STAGES,
  SCHEDULE_STAGES,
  scheduleDayTags,
  serverDay,
  useServerClock,
  useServerNowFn,
  type Cutoff,
  type UrgentAnswer,
  type UrgentAsk,
} from "../utils/dispatchCutoff";

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
  /** ช่างถึงหน้างานในรอบนี้แล้ว — ขั้นช่างแยก "เข้างาน" / "ปิดงาน" ตามค่านี้ (พ.ย. 69) · ขั้นอื่นเป็น null */
  onSite?: boolean | null;
  /** ระงับชั่วคราวอยู่ (พ.ย. 69) — until = เที่ยงคืนเวลาไทยของวันที่กลับมาทำ · ไม่ได้ระงับ = null */
  hold?: { until: string; reason: string | null; at: string } | null;
  /** ช่วงระงับรอบล่าสุด (จบแล้วก็ยังส่งมา) — หักออกจากวันค้างของขั้น ตรงกับ pausedSince ฝั่งเซิร์ฟเวอร์ */
  holdSpan?: { from: string; to: string } | null;
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
  /** id เครื่อง — ลิงก์ "เฉพาะเครื่องนี้" ไปรายงานอะไหล่ที่ไปแต่ละสาขา (รหัสเครื่องซ้ำข้ามสาขา) */
  machineId?: number | null;
  machineCode: string | null;
  machineBrand: string | null;
  machineModel: string | null;
  /**
   * ยี่ห้อเครื่อง → ไฟล์อะไหล่ที่เลือกได้ (เซิร์ฟเวอร์คิดด้วย brandFileOf) — ช่องเลือกอะไหล่ทุกช่องของใบนี้ใช้ค่าเดียวกัน
   * file ว่างทั้งที่มีเครื่อง = ยังไม่รู้ยี่ห้อ ต้องกดยี่ห้อก่อน · เซิร์ฟเวอร์รุ่นก่อนไม่ส่ง = ช่องเลือกแบบเดิม (ไม่ล็อก)
   */
  partsBrand?: PartsBrand | null;
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
  /** วันเข้าถูกเลื่อนหลังหัวหน้าภาคนัด/ปล่อยรอบล่าสุด — ต้องคอนเฟิร์มวันใหม่ก่อนปล่อยงาน (กฎเดียวกับป้ายในรายการ) */
  rescheduled?: boolean;
  /** ใบนี้เดินลำดับไหน + ขั้นทางเลือกที่ผ่าน — แถบขั้นตอนเรียงตามนี้ (utils/stepPath) · เซิร์ฟเวอร์รุ่นเก่าไม่ส่ง */
  flow?: FlowInfo | null;
  /** ยังมีของต้องเบิก — ค่าที่ /assign และ /confirm-appointment ใช้ตัดสินจริง · เซิร์ฟเวอร์รุ่นเก่าไม่ส่ง (issueLeftOf คิดเอง) */
  issueLeft?: boolean;
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
    parts: { sparePartId: number; inStock: boolean | null; warehouse: string | null; requisitionNo: string | null; sentToCustomer?: boolean }[];
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
  /** คนที่กดปิดงาน — ฟอร์มปิดงานใช้ดูว่าคำสั่งปิดที่คำตอบหายไปกลางทางผ่านไปแล้วหรือยัง (เซิร์ฟเวอร์รุ่นเก่าไม่ส่ง) */
  closedById?: number | null;
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
  /**
   * หัวหน้าภาคที่รับผิดชอบใบนี้ (ทีมมาก่อนภาค) — ว่าง = ไม่มีคนรับ
   * phone มีเฉพาะ GET ใบงานของแอดมิน (หน้าต่างแก้เป็นงานด่วน: "ยังไม่ได้บอก — โทรถาม <ชื่อ> <เบอร์>") · ก้อนที่ปุ่มบันทึกคืนมาไม่มี
   */
  supervisors?: { id: number; name: string; phone?: string | null }[];
  /** ใบ IT: หัวหน้าภาคที่ดูแลงาน IT (กดขั้นของแอดมินในใบนี้ได้ด้วย) · null = ไม่ใช่ใบ IT หรือยังไม่ได้เลือกคน */
  itLead?: { id: number; name: string } | null;
  /** ขั้นที่ปิดแบบ "แก้จากระยะไกลแล้ว" ได้ (ใบ IT เท่านั้น — ว่าง = ใบอื่น) · เซิร์ฟเวอร์ตัดสินซ้ำตอนกด */
  remoteCloseStages?: string[];
  /**
   * จ่ายข้ามทีม (เจ้าของงานขอ ต.ค. 69) — ทีมที่รับไม่ใช่ทีมประจำสาขา · ช่างปิดงานได้ทั้งสองทีม
   * watchers = หัวหน้าภาคของทีมที่รับ เห็นใบแต่ดูได้อย่างเดียว
   */
  crossTeam?: { ownTeam: string; assignedTeam: string; watchers: string[] } | null;
  /** คนเปิดเป็นหัวหน้าภาคของทีมที่รับงานข้ามทีมมา — ดูได้อย่างเดียว (เซิร์ฟเวอร์กันอีกชั้น) */
  viewOnly?: boolean;
  /**
   * หัวหน้าภาคของทีมที่รับงานข้ามทีม ปิดใบงานได้ตอนทีมอยู่หน้างาน · หัวหน้าภาคของพื้นที่ปิดใบ IT ได้ทุกขั้นที่ยังปิดได้
   * (เจ้าของงานขอ 6 พ.ย. 69 ทั้งสองข้อ) — ปุ่มอื่นยังดูได้อย่างเดียว
   * เซิร์ฟเวอร์ตัดสินขั้นเอง (CROSS_CLOSE_STAGES) หน้าจอไม่เดาซ้ำ
   */
  crossClose?: boolean;
  /** หัวหน้าภาคส่งกลับให้แอดมินตรวจสอบ — ยังไม่ตอบ / ตอบแล้วรอรับทราบ (ขั้นตอนไม่เปลี่ยน) */
  adminReview?: AdminReviewInfo | null;
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
  /** ขั้นรอลูกค้าจ่ายเงิน — รอมากี่วัน ส่งใบเสนอราคาเมื่อไร การตามลูกค้า (เซิร์ฟเวอร์คิด) · ขั้นอื่น/เซิร์ฟเวอร์รุ่นเก่า = ว่าง */
  payWait?: PayWaitDetail | null;
  /** ขั้นรอเบิกอะไหล่ — วันที่คาดว่าของที่หมดจะเข้า */
  partsExpectedAt?: string | null;
  hasReceipt: boolean;
  /** จำนวนรูป/วิดีโอหน้างาน (ไม่นับใบเหลืองกับป้ายรุ่น) — ต้องมีอย่างน้อยหนึ่งถึงจะปิดงานได้ */
  siteFileCount: number;
  /** รูป/วิดีโอก่อนซ่อม · หลังซ่อม ของรอบนี้ที่แนบไว้แล้ว — ปิดงานบังคับอย่างละอย่างน้อยหนึ่ง */
  beforeCount?: number;
  afterCount?: number;
  /** ไฟล์ทั้งหมดในใบ (ทุกชนิด) กับเพดาน — หน้าปิดงานเตือนก่อนกดถ้าไฟล์ที่จะส่งเพิ่มจะเกิน */
  attachmentCount?: number;
  attachmentLimit?: number;
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
  /**
   * สถานะเคลมทีละชิ้นของงานซ่อมครั้งนี้ (เคลมก้อน 3) — ที่เดียวที่บอกว่า "ใบนี้อยู่ในรอบที่ถูกตีกลับไหม · ชิ้นไหนล็อกแล้ว"
   * ห้ามอ่าน claims[0] แทน: ตัดสินทีละชิ้นแล้วแถวบนสุดอาจเป็นชิ้นที่ผ่าน ทั้งที่อีกชิ้นถูกตีกลับ (อ่านผ่าน claimRoundOf)
   */
  claimRound?: ClaimRound | null;
  /**
   * หลักฐานเคลมที่แนบไว้แล้วในรอบนี้ — ถูกตีกลับแล้วปิดใหม่ ไม่ต้องแนบซ้ำ
   * id/createdAt (เคลมก้อน 1): ช่องไฟล์ในฟอร์มปิดงานหารูปย่อของไฟล์นั้นได้ตรงตัว · เซิร์ฟเวอร์รุ่นเก่าส่งแค่ชิ้น+ชนิด
   */
  claimEvidence: { id?: number; sparePartId: number | null; role: string; createdAt?: string; createdById?: number | null }[];
  /** Troubleshooting ที่ยี่ห้อเครื่องใบนี้ต้องทำก่อนเคลม — ว่าง = ไม่บังคับ */
  claimTroubleshooting: string[];
  /** ข้อ Troubleshooting ที่หลักฐานในใบตอบได้แล้ว (เคลมก้อน 5) — ฟอร์มต่อท้าย "(มี… แล้ว)" ไม่ติ๊กให้ */
  claimTroubleshootingHints?: Record<string, TroubleshootingHint>;
  /** ชนิดเครื่อง (WASHER/DRYER) — ฟอร์มบอกว่ารายการ Error กรองตามชนิดเครื่อง */
  machineType?: string | null;
  /** วิดีโอ Error/รูปอาการที่ถ่ายในกล่อง "ถ่ายก่อนซ่อม" ของรอบนี้ (ไม่ผูกชิ้น · นับเป็นรูปก่อนซ่อมด้วย — รวมอยู่ใน beforeCount) */
  preRepairCount?: number;
  /**
   * ชิ้นในประกันที่ช่างไม่ส่งเคลมตอนปิดงานครั้งล่าสุดของรอบนี้ (เคลมก้อน 5 · ประวัติ CLAIM_SKIPPED)
   * หน้าตรวจขึ้น "ช่างไม่ส่งเคลม: {ชิ้น} ({เหตุผล})" · reasonCode null = ทางปิดที่ไม่ได้ถามเหตุผล
   */
  claimSkips?: {
    sparePartId: number | null;
    partCode: string;
    partLabel: string;
    reasonCode: string | null;
    reason: string;
    note: string | null;
    by: string | null;
  }[];
  /** รุ่นจากใบเคลมที่อนุมัติล่าสุดของเครื่องนี้ — ตัวเทียบตอนอ่านป้าย (ทะเบียนส่วนใหญ่มีแค่ยี่ห้อ) */
  claimApprovedModel?: string | null;
  /**
   * เวลาปิดนัดงานพรุ่งนี้ (เจ้าของงานขอ ต.ค. 69 · ย้ายมาที่การนัดวัน 2 พ.ย. 69) — นาฬิกาเซิร์ฟเวอร์ตอนตอบ + เวลาปิดที่ใช้คิด
   * ปฏิทินในฟอร์มนัดวันปิดวันพรุ่งนี้เองตอนถึงเวลาจากค่านี้ ไม่ใช้นาฬิกามือถือ · เซิร์ฟเวอร์รุ่นเก่าไม่ส่ง
   */
  serverNow?: string;
  cutoff?: Cutoff;
  /** วันที่แอดมินให้นัดได้แม้ปิดนัดแล้ว (แก้เป็นงานด่วน) "YYYY-MM-DD" — เฉพาะใบนี้ วันนั้น (นัดวันอื่นแล้วหมดผลเอง) */
  urgentReleaseFor?: string | null;
  /** คำขอนัดด่วนของหัวหน้าภาคที่ยังรอแอดมิน (เฉพาะใบรอนัดวัน) */
  urgentAsk?: UrgentAsk | null;
  /** แอดมินตอบคำขอนัดด่วน (ไม่แก้เป็นงานด่วน) — หัวหน้าภาคเห็นในฟอร์มนัดวัน · เฉพาะใบรอนัดวัน วันที่ขอยังไม่ผ่าน */
  urgentAnswer?: UrgentAnswer | null;
  /** แบบป้ายรุ่น + รายการเช็คตามคู่มือของยี่ห้อนี้ (backend/src/utils/claimGuide.ts) */
  claimGuide?: ClaimGuide;
  /** ใบเคลมเก่าของเครื่องเดียวกัน (บรรทัดเคลมซ้ำในหน้าตรวจเคลม) — เซิร์ฟเวอร์ส่งเฉพาะแอดมิน คนอื่นไม่มีค่านี้ */
  claimRepeats?: ClaimRepeat[];
  /** คำอธิบาย "ค่าเดิมถูกแล้ว" ทีละช่องของการส่งครั้งล่าสุด (เคลมก้อน 4 · meta.keep ของประวัติ CLAIM_SUBMITTED) */
  claimKeep?: ClaimKeep[];
  /**
   * ช่องที่ Admin Spare Part ติ๊กให้แก้ได้กับเครื่องใบนี้ พร้อมชื่อที่ใช้จริง (เคลมก้อน 4 · เซิร์ฟเวอร์คิดจากแบบป้ายของยี่ห้อ)
   * แผงตีกลับแสดงตามนี้ — Oasis ไม่มี Serial/Error ให้ติ๊ก · ชื่อวิดีโอ Error ตามเครื่อง
   */
  claimReviewFlags?: ServerFlag[];
  /**
   * รอบเลือกอะไหล่ของช่างที่ยังเปิด (เลือกอะไหล่ตอนตรวจหน้างาน ต.ค. 69) — PENDING รอหัวหน้าภาคคอนเฟิร์ม · RETURNED ถูกตีกลับให้ช่างแก้
   * ไม่มีรอบที่เปิด = null · เซิร์ฟเวอร์รุ่นก่อนไม่ส่ง · ทีม Area ได้เหตุผล/ตัวที่ชี้เป็น null (ข้อ 10 — ตัดที่เซิร์ฟเวอร์)
   */
  partsPick?: PartsPickInfo | null;
  /** หัวหน้าภาค/แอดมินคอนเฟิร์มรายการของช่างแล้ว และใบยังไม่ถึงขั้นปล่อยงาน — กล่องเขียวบนหน้าใบงาน */
  partsPickConfirmed?: PickConfirmedInfo | null;
}

/** อะไหล่หนึ่งรายการในรอบเลือกอะไหล่ — prevQty/isNew เทียบกับรอบก่อนที่ถูกตีกลับ (ป้าย "แก้จำนวน" · "เพิ่มใหม่") */
interface PickItem {
  sparePartId: number;
  partCode: string;
  name: string;
  partNo: string | null;
  brandFiles: string[];
  quantity: number;
  /** OK = หัวหน้าภาคกดตรง · NO = ชี้ว่าไม่ตรง · null = ยังไม่ได้ตัดสิน */
  mark: "OK" | "NO" | null;
  prevQty: number | null;
  isNew: boolean;
}

interface PartsPickInfo {
  id: number;
  round: number;
  status: "PENDING" | "RETURNED";
  sentAt: string;
  sentBy: { name: string; employeeCode: string } | null;
  /** ทีมที่ไปตรวจตอนส่ง — ตีกลับแล้วกลับไปที่ทีมนี้ */
  team: string | null;
  /** ไฟล์ยี่ห้อของเครื่องตอนช่างส่ง */
  brandFile: string | null;
  /** "ตรวจแล้วเจออะไร" ตอนส่ง — ด่านส่งใหม่เทียบกับค่านี้ */
  note: string | null;
  items: PickItem[];
  reason: string | null;
  reviewedAt: string | null;
  reviewedBy: { name: string; roleLabel: string } | null;
  flags: { partCode: string; name: string }[] | null;
  previous: { round: number; reason: string | null; reviewedAt: string | null; note: string | null; items: PickItem[] } | null;
  noteChanged: boolean;
  addedPartPhotos: number;
}

interface PickConfirmedInfo {
  at: string;
  byName: string | null;
  /** "หัวหน้าภาค" หรือ "แอดมิน" (แอดมินคอนเฟิร์มแทนได้ — ข้อ 11) */
  roleLabel: string;
  count: number;
  /** ต้องเสนอราคาลูกค้าก่อนนัด (ใส่อะไหล่นอก/ค่าบริการ หรือกฎแฟรนไชส์) */
  quote: boolean;
}

/** ป้ายสถานะที่ใบรออยู่หลังช่างส่งผลตรวจ — ตรงกับ statusLabelOf ฝั่งเซิร์ฟเวอร์ (กล่อง "ส่งผลตรวจแล้ว" บอกว่าใบไปรอที่ไหน) */
const PICK_WAIT_LABEL = "หัวหน้าภาค · คอนเฟิร์มอะไหล่";
const SPEC_WAIT_LABEL = "หัวหน้าภาค · ระบุอะไหล่";

/** ใบนี้รอหัวหน้าภาคคอนเฟิร์มรายการที่ช่างเลือก (สถานะยังเป็น NEW — ข้อ 2 ไม่เพิ่มสถานะ) */
function pickPending(o: { status: string; partsPick?: PartsPickInfo | null }): PartsPickInfo | null {
  return o.status === "NEW" && o.partsPick?.status === "PENDING" ? o.partsPick : null;
}
/** ใบนี้ถูกตีกลับรายการอะไหล่ ช่างต้องแก้แล้วส่งใหม่ (สถานะยังเป็น INSPECTING) */
function pickReturned(o: { status: string; partsPick?: PartsPickInfo | null }): PartsPickInfo | null {
  return o.status === "INSPECTING" && o.partsPick?.status === "RETURNED" ? o.partsPick : null;
}
/** "{code} {name}" — ชื่อเรียกอะไหล่แบบเดียวกับข้อความของเซิร์ฟเวอร์ (ด่านส่งใหม่ · ประวัติ) */
const pickName = (p: { partCode: string; name: string }) => `${p.partCode} ${p.name}`;

/**
 * ด่านส่งใหม่หลังถูกตีกลับ — สำเนาของด่านใน POST /:id/inspection (ข้อความตรงกันทุกตัวอักษร) คืนข้อความเตือน · null = ส่งได้
 * ต้องแก้อย่างใดอย่างหนึ่ง: "ตรวจแล้วเจออะไร" · รูปอะไหล่ที่เสียที่เพิ่มหลังตีกลับ · รายการ (ตัวที่ถูกชี้ต้องเอาออกหรือเปลี่ยนจำนวน)
 * เตือนก่อนส่งเพราะเหตุผลเดียวกับเซิร์ฟเวอร์: รายการเดิมกลับไปหาหัวหน้าภาคคือตีกลับซ้ำ วนไม่จบ
 */
function resendGateText(
  pick: PartsPickInfo,
  parts: { sparePartId: number; quantity: number }[],
  note: string,
  addedPhotos: number
): string | null {
  const before = new Map(pick.items.map((i) => [i.sparePartId, i.quantity]));
  const now = new Map(parts.map((p) => [p.sparePartId, p.quantity]));
  const listChanged = before.size !== now.size || [...before].some(([k, q]) => now.get(k) !== q);
  const noteChanged = note.trim() !== (pick.note ?? "").trim();
  const flagged = pick.items.filter((i) => i.mark === "NO");
  const unfixed = flagged.filter((i) => now.get(i.sparePartId) === i.quantity);
  if (noteChanged || addedPhotos > 0 || (listChanged && unfixed.length === 0)) return null;
  const list = (l: PickItem[]) => l.map(pickName).join(", ");
  return listChanged
    ? `ยังไม่ได้แก้ตัวที่หัวหน้าภาคชี้ว่าไม่ตรง (${list(unfixed)}) — เอาออก เปลี่ยนจำนวน หรือเขียนในข้อ 4 ว่าทำไมยืนยันตัวนี้ แล้วค่อยส่งใหม่`
    : flagged.length
      ? `ยังไม่ได้แก้อะไร — แก้ตัวที่หัวหน้าภาคชี้ว่าไม่ตรง (${list(flagged)}) หรือเขียนในข้อ 4 ว่าทำไมยืนยันรายการเดิม แล้วค่อยส่งใหม่`
      : "ยังไม่ได้แก้อะไร — อ่านเหตุผลของหัวหน้าภาคแล้วแก้รายการ หรือเขียนในข้อ 4 ว่าทำไมยืนยันรายการเดิม แล้วค่อยส่งใหม่";
}

const CLAIM_STATUS: Record<PartClaim["status"], { label: string; fg: string; bg: string }> = {
  PENDING: { label: "รอตรวจ", fg: colors.warningInk, bg: colors.warningSoft },
  APPROVED: { label: "อนุมัติแล้ว", fg: colors.success, bg: colors.successSoft },
  REJECTED: { label: "ตีกลับ", fg: colors.dangerInk, bg: colors.dangerSoft },
  // ผู้ตรวจปิดชิ้นนี้ไม่ส่งผู้ขาย (เคลมก้อน 3) — เทา ไม่ใช่แดง: ไม่มีอะไรให้ช่างแก้ และไม่ใช่การอนุมัติ
  DECLINED: { label: "ปิดเคลม ไม่ส่งผู้ขาย", fg: colors.textMuted, bg: colors.rowAlt },
};

interface Team {
  name: string;
  branches: number;
  /** ทีม outsource — รับงานเป็นครั้ง ๆ ไม่มีสาขาประจำ หัวหน้าภาคปิดงานแทน */
  outsource?: boolean;
  /** หัวหน้าภาคเท่านั้น: ทีมที่ตัวเองดูแลไหม (แอดมินไม่มีค่านี้) */
  mine?: boolean;
  /** ทีมนอกความดูแล — หัวหน้าภาคที่ดูแลทีมนั้น (จ่ายข้ามไปแล้วคนเหล่านี้เห็นใบ) */
  supervisors?: string[];
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

/** ตัวที่หัวหน้าภาคต้องเบิกส่งมอบจากคลังที่ไม่ใช่ 94 (โอนมาถึงแล้ว) — กฎเดียวกับ pendingPickup ฝั่งเซิร์ฟเวอร์ */
function isPickup(p: StockPart & { offCatalog?: boolean }, adminWarehouse: string) {
  return (
    p.inStock === true && !p.offCatalog && !!p.warehouse && p.warehouse !== adminWarehouse && !p.requisitionNo && !!p.transferredAt
  );
}

/** ตัวที่หัวหน้าภาคต้องเบิกจากคลังอื่นแล้วโอนมาคลังส่งมอบ — กฎเดียวกับ pendingTransfer ฝั่งเซิร์ฟเวอร์ */
function isTransfer(p: StockPart & { offCatalog?: boolean }, adminWarehouse: string) {
  return (
    p.inStock === true &&
    !p.offCatalog &&
    !!p.warehouse &&
    p.warehouse !== adminWarehouse &&
    !p.requisitionNo &&
    !p.transferNo &&
    !p.transferredAt
  );
}

/** กำลังโอน — สั่งโอนแล้ว ของยังไม่ถึงคลังปลายทาง */
function inTransit(p: StockPart) {
  return !!p.transferNo && !p.transferredAt;
}

/**
 * ผลเช็คอะไหล่ (ขั้นเช็คอะไหล่ มี/หมด) ยังใช้ได้ไหมตอนเบิก — เจ้าของงานเลือก ต.ค. 69
 *
 * เช็คไว้ไม่เกิน 3 วัน = ผล "มีครบ" ยังเชื่อได้ ฟอร์มเบิกเติมให้ เหลือใส่เลขใบเบิก
 * เกิน 3 วัน = ของอาจถูกงานอื่นใช้ไประหว่างรอเงิน/รอนัด เปิดให้เช็คใหม่ทั้งหมด
 * (นัดลูกค้าก่อนเบิก — ช่วงนี้ยาวขึ้น ใบส่วนใหญ่จะต้องดูคลังอีกรอบ ซึ่งคือสิ่งที่ต้องการ)
 */
const SOURCING_FRESH_DAYS = 3;

/** ตัวที่ยังต้องเบิก/โอนจากคลังอื่น — คลังอื่นที่ไม่ใช่คลังส่งมอบ และยังไม่ได้เบิกหรือโอนมาถึง (ป้าย TRANSFER ฝั่งเซิร์ฟเวอร์) */
function farPart(p: StockPart & { offCatalog?: boolean }, adminWarehouse: string) {
  return p.inStock === true && !p.offCatalog && !!p.warehouse && p.warehouse !== adminWarehouse && !p.requisitionNo && !p.transferredAt;
}
function sourcingCheck(o: { status: string; logs: LogEntry[] }): { days: number; stale: boolean; at: string } | null {
  if (o.status !== "PARTS_REQUESTED") return null;
  const last = [...o.logs].filter((l) => l.action === "PARTS_SOURCED").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!last) return null;
  const days = Math.floor((Date.now() - Date.parse(last.createdAt)) / 86_400_000);
  return { days, stale: days > SOURCING_FRESH_DAYS, at: last.createdAt };
}

/** ส่วนที่แอดมินพิมพ์เอง — ประวัติเก็บเป็น "รายการ (คลัง) — หมายเหตุ" (หมายเหตุไม่บังคับ) */
function pickupAdminNote(note: string | null | undefined): string | null {
  const at = note?.indexOf(" — ") ?? -1;
  return note && at >= 0 ? note.slice(at + 3).trim() || null : null;
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
  // หัวหน้าภาคนัดวันแล้ว — เบิกจริง ใส่คลัง + เลขใบเบิก ให้ของพร้อมก่อนโทรคอนเฟิร์มลูกค้า (ต.ค. 69 รอบสอง)
  PARTS_REQUESTED: { label: "เบิกอะไหล่ (คลัง 94)", icon: "arrow-forward-circle" },
  // ของอยู่คลังอื่น — หัวหน้าภาคเบิกแล้วโอนมาคลังส่งมอบ · ของถึงแล้วกดโอนเสร็จ (แอดมินกดแทนไม่ได้)
  PARTS_TRANSFER: { label: "เบิกและโอนอะไหล่", icon: "swap-horizontal-outline" },
  PARTS_IN_TRANSIT: { label: "โอนเสร็จแล้ว", icon: "checkmark-done-outline" },
  // โอนมาถึงคลังที่ไม่ใช่ 94 — หัวหน้าภาคเบิกส่งมอบเอง แอดมินกดแทนไม่ได้
  PARTS_PICKUP: { label: "เบิกอะไหล่ (คลังอื่น)", icon: "cube-outline" },
  // ขั้นแรกของทุกใบที่ใช้อะไหล่ — เช็คว่ามีไหม อยู่คลังไหน ยังไม่เบิก · มีครบไปเสนอราคา/นัด หมดรอของเข้า
  PARTS_SOURCING: { label: "เช็คอะไหล่ (มี/หมด)", icon: "cube-outline" },
  AWAITING_QUOTE: { label: "ส่งใบเสนอราคา", icon: "document-text-outline" },
  // เจ้าของงานเลือก 5 พ.ย. 69 — ปุ่มเดิม (เปิดฟอร์มแนบบิล) ชื่อบอกว่ากดเมื่อไร · ชื่อขั้นเป็น "รอลูกค้าจ่ายเงิน" (ลูกบอลอยู่ที่ลูกค้า)
  AWAITING_PAYMENT: { label: PAY_GO_LABEL, icon: "cash-outline" },
  // นัดวันเข้า → แอดมินเบิก → [หัวหน้าภาคเบิก/โอน] → แอดมินคอนเฟิร์มลูกค้า (ของพร้อม) → ปล่อยงาน (ดู WORK_ORDER_STAGE_ORDER ฝั่ง backend)
  PARTS_CHECKED: { label: "นัดวันเข้า", icon: "calendar-outline" },
  AWAITING_CONFIRM: { label: "คอนเฟิร์มลูกค้า", icon: "call-outline" },
  ASSIGNED: { label: "รับทราบ ปล่อยงาน", icon: "checkmark-circle-outline" },
};

/** ข้อความปุ่มหลักของขั้นปัจจุบัน — ที่เดียว ฟีเจอร์ที่ตามมาเติมกิ่งของตัวเองที่นี่ (integration S12) */
function stageButtonLabel(o: WorkOrder, opts: { partsOut: number; tech?: boolean }): string {
  // ของหมดอยู่ = สิ่งที่แอดมินรอทำคือบอกว่าของมาแล้ว ไม่ใช่ "เช็คคลัง" เหมือนรอบแรก
  if (opts.partsOut && o.status !== "WAITING_PARTS") return "อะไหล่มาแล้ว — อัปเดตสถานะ";
  if (rescheduledPending(o)) return "คอนเฟิร์มวันใหม่";
  /**
   * เลือกอะไหล่ตอนตรวจหน้างาน — สถานะเดิม (ข้อ 2) แต่งานที่รออยู่ไม่ใช่งานเดิม: หัวหน้าภาคคอนเฟิร์มรายการของช่าง ไม่ได้ระบุเอง
   * · ช่างที่ถูกตีกลับต้องแก้รายการ ไม่ได้ตรวจใหม่ (ไฟล์รอบนี้ยังใช้ได้) — ปุ่มชื่อเดิมพาคนกดไปทำผิดเรื่อง
   * หัวหน้าภาคที่บันทึกแทนช่างบนใบที่ถูกตีกลับยังเห็น "ตรวจหน้างาน" — ไม่ได้แก้รายการของตัวเอง
   */
  if (pickPending(o)) return "คอนเฟิร์มอะไหล่";
  if (pickReturned(o) && opts.tech) return "แก้รายการอะไหล่";
  return STAGE_BUTTON[o.status]?.label ?? "ทำขั้นนี้";
}

/**
 * ปุ่มหลักของขั้นปัจจุบันในการ์ดขั้น — ปุ่มเดียวกันทุกคนทุกเวลา (ขั้นปล่อยงานไม่มีล็อกแล้ว ไม่มีปุ่มที่ต้องพลิกตามนาฬิกา)
 * คำขอนัดด่วนของหัวหน้าภาคมีกล่อง/ปุ่มของมันเองในการ์ดขั้น (AskAdminBox) ไม่แย่งปุ่มขั้น — แอดมินยังกดนัดวันแทนได้ตามเดิม
 */
/** ความกว้างช่องของแถบขั้นตอนตอนปัดซ้ายขวา (จอแคบ) — พอให้ชื่อขั้นภาษาไทยขึ้นได้สองบรรทัด */
const STEP_SWIPE_W = 96;

function StagePrimaryButton({
  order,
  partsOut,
  busy,
  tech,
  onStage,
}: {
  order: WorkOrder;
  partsOut: number;
  busy: boolean;
  /** คนเปิดเป็นช่าง (รวม Senior) — ใบที่ถูกตีกลับรายการอะไหล่ปุ่มเป็น "แก้รายการอะไหล่" */
  tech: boolean;
  onStage: () => void;
}) {
  const label = stageButtonLabel(order, { partsOut, tech });
  return (
    <TouchableOpacity style={[styles.action, styles.actionPrimary]} onPress={onStage} disabled={busy} activeOpacity={0.8} accessibilityLabel={label}>
      <Ionicons
        name={pickReturned(order) && tech ? "arrow-undo" : STAGE_BUTTON[order.status]?.icon ?? "arrow-forward-circle"}
        size={18}
        color="#fff"
      />
      <Text style={styles.actionPrimaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * สถานะคำขอนัดด่วนล่าสุดที่วาดทับใบที่หน้าโหลดไว้ ระหว่างฟอร์มนัดวันเปิดอยู่ (ขอ/ยกเลิก · แอดมินแก้ให้/ตอบ)
 * ไม่ setOrder: ฟอร์มขั้นตอนล้างค่าที่กรอก (ใช้อะไหล่ไหม อะไหล่ ทีม เวลา) ทุกครั้งที่ใบเปลี่ยน — วาดทับเฉพาะสามช่องนี้แทน
 * ที่เดียวต่อหน้า: ทั้งคำตอบของปุ่มขอและตัวเช็ค 20 วิเขียนที่นี่ ค่าล่าสุดชนะเสมอ ไม่มีสำเนาที่สองให้ขัดกัน
 */
type AskOverlay = { urgentReleaseFor: string | null; urgentAsk: UrgentAsk | null; urgentAnswer: UrgentAnswer | null };
const overlayOf = (o: WorkOrder): AskOverlay => ({
  urgentReleaseFor: o.urgentReleaseFor ?? null,
  urgentAsk: o.urgentAsk ?? null,
  urgentAnswer: o.urgentAnswer ?? null,
});

/** "9 ต.ค. 69 · 10:00 น." — วันนัดเก็บเป็นเที่ยงคืน UTC จึงตัดเอาแค่วันตรง ๆ */
function visitLabel(o: { scheduledAt: string | null; scheduledTime: string | null }) {
  if (!o.scheduledAt) return "—";
  const day = thaiDate(o.scheduledAt.slice(0, 10));
  return o.scheduledTime ? `${day} · ${o.scheduledTime} น.` : day;
}

/**
 * ใบที่ช่างเพิ่งส่งกลับ — ขั้นล่าสุดที่ขยับคือ "ช่างส่งกลับ" และยังอยู่ที่ขั้นแรก
 * แนบรูป/แก้ข้อความหลังจากนั้นไม่นับ เพราะไม่ได้ทำให้ใบงานเดินไปไหน
 * แอดมินเลื่อนวันนัดก็ไม่นับ (ใบอยู่ขั้นเดิม) — ไม่งั้นเลื่อนวันแล้วกล่อง "ช่างแจ้งปัญหา" หายทั้งที่ยังไม่ได้แก้
 */
const NOT_A_MOVE = [
  "ATTACHED",
  "ATTACHMENT_REMOVED",
  "EDITED",
  "PARTS_ETA_CHANGED",
  "STATUS_CHANGED",
  "ARRIVED",
  "APPOINTMENT_MOVED",
  "ADMIN_REVIEW_REQUESTED",
  "ADMIN_REVIEW_CANCELLED",
  "ADMIN_REVIEW_ANSWERED",
  // ไม่ส่งเคลมชิ้นที่อยู่ในประกัน (เคลมก้อน 5) — บันทึกคู่กับการปิดงาน ตัวปิดงานคือการเดินขั้น ไม่ใช่แถวนี้
  "CLAIM_SKIPPED",
  // เวลาปิดนัดงานพรุ่งนี้: แอดมินแก้เป็นงานด่วน / หัวหน้าภาคขอ / ยกเลิกคำขอ / แอดมินตอบคำขอ — ใบอยู่ขั้นเดิม
  // (ตรงกับ NON_STAGE_ACTIONS ฝั่งเซิร์ฟเวอร์) ไม่งั้นหัวหน้าภาคขอนัดด่วนใบที่ช่างเพิ่งส่งกลับ แล้วกล่อง "ช่างแจ้งปัญหา" หายทั้งที่ยังไม่มีใครแก้
  "URGENT_RELEASE",
  "URGENT_REQUESTED",
  "URGENT_REQUEST_CANCELLED",
  "URGENT_REQUEST_ANSWERED",
  // บันทึก/แก้ยี่ห้อเครื่อง (เลือกอะไหล่ตามไฟล์ยี่ห้อ) — แก้ข้อมูลเครื่อง ใบอยู่ขั้นเดิม (ตรงกับ NON_STAGE_ACTIONS ฝั่งเซิร์ฟเวอร์)
  // หัวหน้าภาคแก้ยี่ห้อจากหน้าใบงานได้ทุกขั้น ถ้านับเป็นการเดินขั้น กล่อง "ช่างแจ้งปัญหา" / เหตุผลที่หัวหน้าภาคส่งกลับ
  // จะหายทั้งที่ยังไม่มีใครแก้
  "MACHINE_BRAND_SET",
  // ใช้อะไหล่ข้ามยี่ห้อ (ยืนยันแล้ว) — บันทึกคู่กับแถวหลักของการบันทึกอะไหล่ ไม่ใช่การเดินขั้น (ตรงกับ NON_STAGE_ACTIONS ฝั่งเซิร์ฟเวอร์)
  "CROSS_BRAND_PARTS",
  // ย้ายไปถังขยะ / กู้คืน (4 พ.ย. 69) — ขั้นไม่เปลี่ยนทั้งคู่ (ตรงกับ NON_STAGE_ACTIONS ฝั่งเซิร์ฟเวอร์)
  // ไม่งั้นใบที่ช่างส่งกลับแล้วถูกลบผิดแล้วกู้คืน กล่อง "ช่างแจ้งปัญหา" / "ทีมไม่ว่างวันใหม่" หายทั้งที่ยังไม่มีใครแก้
  "TRASHED",
  "RESTORED",
  // ตามลูกค้าเรื่องจ่ายเงิน (5 พ.ย. 69) — ใบรอลูกค้าอยู่ขั้นเดิม (ตรงกับ NON_STAGE_ACTIONS ฝั่งเซิร์ฟเวอร์)
  // ใบที่ย้อนกลับมารอเงินแล้วแอดมินตาม กล่องย้อนขั้น/ช่างแจ้งปัญหาต้องไม่หายเพราะการตาม
  "PAYMENT_FOLLOWUP",
  // ระงับชั่วคราว / กลับมาทำต่อ (พ.ย. 69) — ใบอยู่ขั้นเดิม (ตรงกับ NON_STAGE_ACTIONS ฝั่งเซิร์ฟเวอร์)
  "HOLD",
  "RESUMED",
];
function sentBackLog(o: WorkOrder): LogEntry | null {
  const last = [...o.logs]
    .filter((l) => !NOT_A_MOVE.includes(l.action))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  // ช่างแจ้งปัญหาแล้วใบไปต่อตามเหตุผล (ระบุอะไหล่ / คอนเฟิร์มลูกค้าใหม่ / จ่ายงานใหม่) — กล่องขึ้นที่ขั้นนั้น
  return last?.action === "PARTS_ROLLBACK" && last.status === o.status ? last : null;
}

/** แอดมินเลื่อนวันนัด (ใบอยู่ขั้นเดิม · ดึงคืนจากช่าง) — ฟอร์มขั้นที่เปิดค้างไว้ถือวันเก่า ต้องปิดแล้วโหลดใหม่ */
const ADMIN_DATE_MOVES = ["APPOINTMENT_MOVED", "APPOINTMENT_RECALLED"];
/** การเลื่อนวันหลังหัวหน้าภาคนัด/ปล่อยรอบล่าสุด — ลูกค้าขอเลื่อนตอนคอนเฟิร์ม · แอดมินเลื่อนวันนัด */
const DATE_MOVES = ["RESCHEDULED", ...ADMIN_DATE_MOVES];
/**
 * ขั้นที่ฟอร์มขั้นยืนยันวันนัดที่โชว์อยู่ (คอนเฟิร์มลูกค้า · ปล่อยงาน/ทีมไม่ว่างวันใหม่) และขั้นที่ถูกดึงคืนได้
 * (ผลตรวจหน้างาน — ดึงคืนแล้วใบไม่อยู่ขั้นนั้นแล้ว)
 */
const DATE_FORM_STAGES = ["AWAITING_CONFIRM", "INSPECT_CONFIRM", "ASSIGNED", "INSPECT_DISPATCH", "IN_PROGRESS", "INSPECTING"];
/** ประวัติที่ตัดสินป้าย "คอนเฟิร์มวันใหม่" — นัด/ปล่อยของหัวหน้าภาคปิดป้าย การเลื่อนเปิดป้าย (ตรงกับฝั่งเซิร์ฟเวอร์) */
const DATE_SETTLES = ["ASSIGNED", "INSPECT_REQUESTED", "DISPATCHED", ...DATE_MOVES];

/** การเลื่อนวันที่หัวหน้าภาคยังไม่ได้รับทราบ — null = วันที่จะเข้าคือวันที่หัวหน้าภาคนัด/ปล่อยไว้เอง */
function pendingMove(o: WorkOrder): LogEntry | null {
  const last = o.logs
    .filter((l) => DATE_SETTLES.includes(l.action))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)[0];
  return last && DATE_MOVES.includes(last.action) ? last : null;
}

/**
 * วันเข้าถูกเลื่อน รอหัวหน้าภาคคอนเฟิร์มวันใหม่ (เจ้าของงานเลือก ต.ค. 69)
 * — ป้าย/ปุ่ม "คอนเฟิร์มวันใหม่" แยกจาก "รับทราบ ปล่อยงาน" ปกติ เพราะต้องดูคิวทีมวันใหม่ก่อน ไม่ใช่กดผ่าน
 *
 * เซิร์ฟเวอร์คิดให้ (detail.rescheduled) — กฎเดียวกับป้ายในรายการ · คิดเองเฉพาะเซิร์ฟเวอร์รุ่นเก่า
 * CONFIRMED ไม่ปิดป้าย: แอดมินเลื่อนวันระหว่างเบิกแล้วลูกค้าตกลงวันนั้นทีหลัง หัวหน้าภาคก็ยังไม่ได้ดูคิวทีมวันใหม่
 */
function rescheduledPending(o: WorkOrder) {
  if (o.status !== "ASSIGNED" && o.status !== "INSPECT_DISPATCH") return false;
  if (typeof o.rescheduled === "boolean") return o.rescheduled;
  return pendingMove(o) !== null;
}

/**
 * หัวหน้าภาคส่งกลับเพราะทีมไม่ว่างวันที่ถูกเลื่อน (ใบที่ส่งกลับตอนยังมีล็อกขั้นปล่อยงาน ก่อน 2 พ.ย. 69 ก็มาทางนี้) — แอดมินเห็นเหตุผลตอนโทรนัดร้านใหม่
 * (งานซ่อม · นัดตรวจหน้างาน)
 */
function declinedNewDate(o: WorkOrder): LogEntry | null {
  if (o.status !== "AWAITING_CONFIRM" && o.status !== "INSPECT_CONFIRM") return null;
  const last = [...o.logs]
    .filter((l) => !NOT_A_MOVE.includes(l.action))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return last?.action === "NEW_DATE_DECLINED" ? last : null;
}


/**
 * ช่างถึงหน้างาน หรือปิดงานไปแล้วในรอบนี้ — เลื่อนวัน (ดึงใบคืน) ไม่ได้แล้ว ช่างใช้ "แจ้งปัญหาหน้างาน" แทน
 * กฎเดียวกับ /reschedule ฝั่งเซิร์ฟเวอร์: ล่าสุดของ ปล่อยงาน/ถึงหน้างาน/ปิดงาน ต้องเป็นปล่อยงาน
 * เดิมดูแค่ "ถึงหน้างาน" — ใบที่เคลมถูกตีกลับกลับมาอยู่ขั้นช่าง (ช่างปิดไปแล้ว ไม่จำเป็นต้องกดถึงหน้างาน)
 * ขึ้นปุ่มเลื่อนวันนัดที่เซิร์ฟเวอร์ปฏิเสธทุกครั้ง หลังแอดมินกรอกเหตุผลไปแล้ว
 */
const VISIT_LOGS = ["DISPATCHED", "ARRIVED", "CLOSED"];
function techArrived(o: WorkOrder) {
  const last = o.logs
    .filter((l) => VISIT_LOGS.includes(l.action))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)[0];
  return !!last && last.action !== "DISPATCHED";
}

/**
 * ยังมีของต้องเบิกไหม — ใช้เลือกข้อความในฟอร์มนัด/คอนเฟิร์ม (ไปเบิกต่อ หรือข้ามไปคอนเฟิร์ม/ปล่อยงาน)
 * อ่านค่าที่เซิร์ฟเวอร์ใช้ตัดสินจริง (detail.issueLeft) ไม่คิดเองอีกสูตร — ข้อความต้องตรงกับที่ใบไปจริงหลังกด
 * และตรงกับแถบขั้นตอนบนหน้าเดียวกัน (ใช้ issueLeftOf ตัวเดียวกัน)
 */
function partsToIssue(o: WorkOrder) {
  return issueLeftOf(o);
}

/**
 * เบิกครบแล้วใบไปไหน — ตรงกับ afterIssue ฝั่งเซิร์ฟเวอร์
 * นัดแล้วยังไม่คอนเฟิร์ม (สายงานปัจจุบัน) → แอดมินโทรคอนเฟิร์มลูกค้าตอนของอยู่ในมือ
 * คอนเฟิร์มไปก่อนสลับลำดับ → ปล่อยงานเลย ไม่โทรซ้ำ · ใบเก่าที่ยังไม่มีวัน → ไปนัดวันเข้า
 */
function afterIssueText(o: WorkOrder) {
  if (!o.scheduledAt) return "ใบไปขั้นหัวหน้าภาคนัดวันเข้า";
  if (APPOINTMENT_DONE.includes(o.appointmentStatus ?? "")) return "ลูกค้าคอนเฟิร์มวันแล้ว ใบไปให้หัวหน้าภาคปล่อยงาน";
  return "ใบไปให้แอดมินคอนเฟิร์มลูกค้า (ของพร้อมแล้ว)";
}

/**
 * วันนัดที่หน้าจอโชว์อยู่ตอนเปิดฟอร์ม — ส่งไปกับคอนเฟิร์มลูกค้า / ปล่อยงาน / ทีมไม่ว่างวันใหม่
 * แอดมินเลื่อนวันนัดได้โดยใบอยู่ขั้นเดิม (ต.ค. 69) ฟอร์มที่เปิดค้างไว้ก่อนเลื่อนจึงยังโชว์วันเก่า
 * เซิร์ฟเวอร์เทียบกับวันในฐานข้อมูล ไม่ตรง = 409 แล้วหน้าจอโหลดใหม่ — ไม่งั้นกดคอนเฟิร์ม "จันทร์" ที่คุยกับร้าน
 * แต่บันทึกว่าลูกค้าคอนเฟิร์ม "พุธ" ที่อีกคนเพิ่งเลื่อน ทีมไปพุธ ร้านรอจันทร์
 */
function seenAppointment(o: WorkOrder) {
  return { seenScheduledAt: o.scheduledAt ? o.scheduledAt.slice(0, 10) : null, seenScheduledTime: o.scheduledTime ?? null };
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
  /** โอนข้ามคลัง — ต้นทาง · ใบเบิกต้นทาง · ใบโอน · ถึงปลายทางเมื่อไร (ว่าง = กำลังโอน/ยังไม่โอน) */
  transferFrom?: string | null;
  transferReqNo?: string | null;
  transferNo?: string | null;
  transferredAt?: string | null;
  /** แอดมินเบิกคลัง 94 แล้วส่งของให้ลูกค้าเอง — ช่างไม่ต้องไปรับที่คลัง (พ.ย. 69) · เซิร์ฟเวอร์รุ่นก่อนไม่ส่ง = รับที่คลัง */
  sentToCustomer?: boolean;
}

/**
 * "ใบเบิก RQ-1" — ชิ้นที่แอดมินส่งให้ลูกค้าแล้วต่อท้าย "· ส่งให้ลูกค้าแล้ว" (พ.ย. 69) ทุกที่ในหน้าใบงานที่โชว์เลขใบเบิก
 * คำเดียวกับการ์ดช่างและข้อความไลน์ (SENT_TO_CUSTOMER) — คนเปิดใบงานกับช่างในกลุ่มไลน์ต้องอ่านได้เรื่องเดียวกัน
 */
function requisitionLine(p: { requisitionNo: string | null; sentToCustomer?: boolean }) {
  return `ใบเบิก ${p.requisitionNo}${p.sentToCustomer ? ` · ${SENT_TO_CUSTOMER}` : ""}`;
}

/**
 * เลขใบเบิกในรายการอะไหล่ของใบงาน — "ส่งให้ลูกค้าแล้ว" สีเขียวตัวหนา ช่างที่เปิดใบงานเห็นทันทีว่าชิ้นนี้ไม่ต้องแวะคลัง
 * (ตัวเลขใบเบิกเป็นสีจาง ถ้าคำนี้จางตามก็เท่ากับไม่ได้บอก — เห็นจากภาพหน้าจอจริง)
 */
function RequisitionText({ part }: { part: StockPart }) {
  return (
    <Text style={styles.partRequisition}>
      ใบเบิก {part.requisitionNo}
      {part.sentToCustomer ? <Text style={styles.partSent}> · {SENT_TO_CUSTOMER}</Text> : null}
    </Text>
  );
}

interface Technician {
  id: number;
  name: string;
  employeeCode: string;
  /** ทีมที่สังกัด — ช่วยให้เลือกคนถูกตอนชื่อคล้ายกัน */
  team?: string | null;
  /** Senior ช่าง (เห็นหลายทีม) — ตัวเลือกบอกตำแหน่งแทนทีมแรก */
  senior?: boolean;
  /** ทุกทีมที่สังกัด (Senior มีหลายทีม) — จัดกลุ่มตัวเลือกช่าง "ทีมของใบนี้ / ทีมที่คุณดูแล" */
  teams?: string[];
}

/**
 * แถวที่อยู่ในใบแล้ว (รออะไหล่ + ใช้แล้ว) — ทางที่บันทึกของที่ใช้/เบิกไปจริง (ปิดงาน · ใบรออะไหล่ต่อ) ปล่อยผ่าน
 * แม้อยู่นอกไฟล์ของเครื่อง (ค่าตั้งต้น D6): ของชิ้นนั้นถูกใช้/เบิกไปแล้ว ไม่ให้ผ่าน = ต้องลบประวัติของจริงทิ้ง
 * ชุดเดียวกับ legacyIds ของ /close · /supervisor-close · /follow-up ฝั่งเซิร์ฟเวอร์
 */
function onOrderIds(o: { waitingParts: { sparePartId: number }[]; parts: { sparePartId: number }[] }): Set<number> {
  return new Set([...o.waitingParts, ...o.parts].map((p) => p.sparePartId));
}

/**
 * แถวรอที่เบิกแล้ว (มีของ + เลขใบเบิก) ที่ยังส่งกลับจำนวนเดิม — ฟอร์มระบุอะไหล่ปล่อยผ่านแม้อยู่นอกไฟล์ เพราะของอยู่กับช่างแล้ว
 * ไม่ให้ผ่าน = บังคับลบบันทึกใบเบิก (กติกาเจ้าของงานเรื่องประเมินอะไหล่ใหม่) · ชุดเดียวกับ legacyIds ของ /parts
 * ต้องดูจำนวนที่เลือกอยู่ด้วย: จำนวนเปลี่ยน เซิร์ฟเวอร์ล้างเลขใบเบิกแล้วส่งเบิกใหม่ทั้งแถว (คือขอของยี่ห้ออื่นเพิ่ม)
 * จึงไม่ปล่อยผ่าน — ถ้าที่นี่ยังนับเป็นแถวเดิม ป้ายเทาบอก "อยู่ได้" แต่กดยืนยันแล้วโดน 400 · รวมแถวซ้ำก่อนเทียบแบบ mergeLines
 */
function issuedSameQtyIds(
  o: { waitingParts: { sparePartId: number; quantity: number; inStock: boolean | null; requisitionNo: string | null }[] },
  picked: { sparePartId: number; quantity: number }[]
): Set<number> {
  const sent = new Map<number, number>();
  for (const p of picked) sent.set(p.sparePartId, (sent.get(p.sparePartId) ?? 0) + p.quantity);
  return new Set(
    o.waitingParts
      .filter((p) => p.inStock === true && !!p.requisitionNo && sent.get(p.sparePartId) === p.quantity)
      .map((p) => p.sparePartId)
  );
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

/**
 * ใบนี้เป็นงานของทีมช่างคนนี้ไหม — ทีมที่รับงาน หรือทีมประจำสาขาเมื่อใบถูกจ่ายข้ามทีม
 * (เจ้าของงานเลือก ต.ค. 69: ปิดงานได้ทั้งสองทีม · เซิร์ฟเวอร์ใช้กฎเดียวกันใน canTouch)
 */
function ourTeamOrder(
  u: Parameters<typeof inMyTeam>[0],
  o: { assignedTeam: string | null; crossTeam?: { ownTeam: string } | null }
) {
  return inMyTeam(u, o.assignedTeam) || (!!o.crossTeam && inMyTeam(u, o.crossTeam.ownTeam));
}

/**
 * ตัวเลือกทีมตอนจ่ายงาน — ทีม outsource ใช้ชื่อทีมเหมือนทีมอื่น แต่แยกไว้กลุ่มของตัวเองท้ายรายการ
 * (เจ้าของงานขอ ต.ค. 69: ไม่อยากเห็นป้าย "outsource" ต่อชื่อ แต่ต้องไม่ปนกับทีมช่างปกติ)
 * ทีมประจำสาขาขึ้นก่อนเสมอในกลุ่มของมัน — ทีมที่ดูแลสาขาก็เป็น outsource ได้ (เช่น PWS)
 *
 * หัวหน้าภาคได้ทุกทีม (จ่ายข้ามทีมได้ ต.ค. 69) — ทีมที่ดูแลอยู่กลุ่มบน ทีมของคนอื่นแยกกลุ่มล่างพร้อมชื่อคนดูแล
 * เดิมโชว์ทุกทีมปนกันแล้วถูกบ่นว่าเห็นทีม OPL ของคนอื่น — แยกกลุ่มให้รู้ว่าเลือกข้ามไปหาทีมคนอื่น
 */
function teamOptions(teams: Team[], suggested: string | null | undefined, jobType: string): DropdownOption[] {
  // ธง mine มาเฉพาะหัวหน้าภาค — แอดมินเห็นทุกทีมเป็นกลุ่มเดียวเหมือนเดิม
  const scoped = teams.some((t) => t.mine !== undefined);
  const OWN = scoped ? "ทีมที่คุณดูแล" : "ทีมช่าง";
  const OTHER = "ทีมนอกความดูแล · จ่ายข้ามทีมได้";
  const OUT = "ทีม outsource · หัวหน้าภาคปิดงานแทน";
  const groupOf = (t: Team) => (t.outsource ? OUT : t.mine === false ? OTHER : OWN);
  const own = `ทีม ${jobType === "PM" ? "PM" : "CM"} ของสาขานี้`;
  const sug = teams.find((t) => t.name === suggested);
  const opt = (t: Team): DropdownOption => ({
    value: t.name,
    label: t.name,
    group: groupOf(t),
    hint: [
      t.name === suggested ? own : t.branches ? `ดูแล ${t.branches} สาขา` : "รับงานเป็นครั้ง",
      t.mine === false && !t.outsource ? (t.supervisors?.length ? `${t.supervisors.join(", ")} ดูแล` : "ยังไม่มีหัวหน้าภาคดูแล") : null,
    ]
      .filter(Boolean)
      .join(" · "),
  });
  const rest = teams.filter((t) => t.name !== suggested);
  // ทีมประจำสาขาที่ไม่อยู่ในรายชื่อทีม (ข้อมูลสาขาเก่า) ยังให้เลือกได้ เหมือนเดิม
  const head: DropdownOption[] = suggested
    ? [sug ? opt(sug) : { value: suggested, label: suggested, group: OWN, hint: own }]
    : [];
  return [OWN, OTHER, OUT].flatMap((g) => [...head.filter((o) => o.group === g), ...rest.filter((t) => groupOf(t) === g).map(opt)]);
}

/**
 * ต่อท้ายคำเตือนจ่ายข้ามทีม — หลังจ่ายแล้วใครทำอะไรได้ (เจ้าของงานเลือก ต.ค. 69)
 * ใบยังอยู่กับคนจ่าย · ช่างปิดงานได้ทั้งสองทีม · หัวหน้าภาคของทีมนอกความดูแลเห็นใบแต่ดูอย่างเดียว
 * ทีม outsource ไม่มีช่างในแอป หัวหน้าภาคปิดแทน — ไม่ต้องต่อท้าย (ป้ายกลุ่มบอกไว้แล้ว)
 */
function crossNote(t: Team | undefined, team: string, own: string | null | undefined) {
  if (t?.outsource) return "";
  const close = own ? ` · ช่างปิดงานได้ทั้ง ${team} และ ${own}` : "";
  if (t?.mine !== false) return close;
  const who = t.supervisors?.length ? `หัวหน้าภาค ${t.supervisors.join(", ")}` : "หัวหน้าภาคของทีมนั้น";
  return `${close}\nทีมนอกความดูแล — ใบยังอยู่กับคุณ (คุณกดปล่อยงานเอง) · ${who} เห็นใบนี้แต่ดูได้อย่างเดียว`;
}

/**
 * หน้าใบงานที่เปิดจากลิงก์บนเว็บ (/#/wo/WO-00045) — ที่อยู่มีแต่รหัสที่คนเห็น ยังไม่มีเลขใบ
 * ถามเลขใบจากเซิร์ฟเวอร์ก่อน (กฎสิทธิ์เดียวกับเปิดใบ) แล้วใส่ id ให้หน้าเดิม — โค้ดทั้งหน้าใช้ id อยู่แล้ว ไม่ต้องรู้จักรหัส
 * ไม่มีสิทธิ์ = หน้ากุญแจแบบเดียวกับเปิดใบจากรายการ · ไม่พบ = บอกรหัสที่หาไม่เจอ (ลิงก์พิมพ์ผิด/ใบถูกลบจริงแล้ว)
 * ใบที่อยู่ในถังขยะ: แอดมินเห็นว่าอยู่ในถัง + ปุ่มไปกู้ (TrashedOrderNote) · คนอื่นได้ "ไม่พบ" เหมือนรหัสที่ไม่มี (เซิร์ฟเวอร์ตัดสิน)
 */
function OpenByCode({ route, navigation, onFound }: Props & { onFound: () => void }) {
  const code = (route.params as { code?: string }).code ?? "";
  const { user: me } = useAuth();
  const [fail, setFail] = useState<{ text: string; locked: boolean; trashed?: TrashedInfo } | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .get<{ id: number; code: string }>(`/work-orders/by-code/${encodeURIComponent(code)}`)
      .then((res) => {
        if (!alive) return;
        onFound();
        navigation.setParams({ id: res.data.id, code: res.data.code });
      })
      .catch((e) => {
        if (!alive) return;
        const status = (e as { response?: { status?: number } })?.response?.status;
        const trashed = trashedInfoOf(e);
        setFail({
          text: status === 404 ? `ไม่พบใบงาน ${code}` : apiErrorMessage(e),
          locked: status === 403,
          ...(trashed ? { trashed } : {}),
        });
      });
    return () => {
      alive = false;
    };
  }, [code, navigation, onFound]);
  return (
    <PopupScreen title={code || "ใบงาน"} subtitle="ใบงานซ่อม" startMaximized>
      {fail?.trashed ? (
        <TrashedOrderNote info={fail.trashed} onBack={() => navigation.goBack()} />
      ) : fail?.locked ? (
        <LockedOrder me={me} error={fail.text} onBack={() => navigation.goBack()} />
      ) : fail ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{fail.text}</Text>
        </View>
      ) : (
        <View style={styles.centered}>
          <Spinner color={colors.primary} />
        </View>
      )}
    </PopupScreen>
  );
}

/** เปิดใบที่ไม่ใช่ของทีม/พื้นที่ตัวเอง (403) — หน้ากุญแจแทนตัวหนังสือแดง เพราะไม่ใช่ข้อผิดพลาด แค่ไม่ใช่งานของคุณ */
function LockedOrder({ me, error, onBack }: { me: { role: string } | null; error: string | null; onBack: () => void }) {
  return (
    <View style={styles.centered} accessibilityLabel="ไม่มีสิทธิ์ดูใบงานนี้">
      <View style={styles.lockIcon}>
        <Ionicons name="lock-closed" size={22} color={colors.textMuted} />
      </View>
      <Text style={styles.lockTitle}>
        {me?.role === "SUPERVISOR" ? "ใบงานนี้อยู่นอกพื้นที่ที่คุณดูแล" : "ใบงานนี้ไม่ใช่ของทีมคุณ"}
      </Text>
      {/* ข้อความเซิร์ฟเวอร์ขึ้นต้นด้วยหัวข้อเดียวกัน — ตัดออก เหลือแค่คำแนะนำ */}
      <Text style={styles.lockText}>{error?.replace(/^ใบงานนี้ไม่ใช่ของทีมคุณ — /, "")}</Text>
      <TouchableOpacity style={styles.lockBtn} onPress={onBack} activeOpacity={0.7}>
        <Text style={styles.lockBtnText}>กลับไปรายการใบงาน</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * ทางเข้าหน้าใบงาน — มี id (เปิดจากในแอป) เข้าหน้าใบงานเลย · มีแต่รหัส (ลิงก์) ถามเลขใบก่อน
 * instant: หน้าต่างเด้งขึ้นแล้วตอนถามเลขใบ — หน้าใบงานที่มาแทนไม่ต้องเล่นท่าเปิดซ้ำ (ไม่งั้นเด้งสองรอบ)
 */
export default function WorkOrderDetailRoute(props: Props) {
  const found = useRef(false);
  const onFound = useCallback(() => {
    found.current = true;
  }, []);
  return typeof (props.route.params as { id?: unknown }).id === "number" ? (
    <WorkOrderDetailScreen {...props} instant={found.current} />
  ) : (
    <OpenByCode {...props} onFound={onFound} />
  );
}

/** ขั้นของแอดมินที่มีฟอร์มของขั้น — ปุ่มบนแถวในงานของฉันวันนี้เปิดใบพร้อมฟอร์มนี้ (open: "stage") */
const ADMIN_FORM_STAGES = ["INSPECT_CONFIRM", "PARTS_SOURCING", "AWAITING_QUOTE", "AWAITING_PAYMENT", "PARTS_REQUESTED", "AWAITING_CONFIRM"];

function WorkOrderDetailScreen({ route, navigation, instant }: Props & { instant?: boolean }) {
  const { id } = route.params;
  const { user: me } = useAuth();
  /**
   * Admin Spare Part ดูใบงานได้ทุกใบแต่แก้ไม่ได้ (เจ้าของงานกำหนด ต.ค. 69) ยกเว้นตรวจเคลม
   * ตัด user ทิ้งสำหรับปุ่มทั้งหมดในหน้านี้ — ทุกปุ่มที่เช็คสิทธิ์จาก user หายไปพร้อมกัน
   * ไม่ต้องไล่ใส่เงื่อนไขทีละปุ่ม (เซิร์ฟเวอร์กันอีกชั้นใน middleware/auth.ts)
   */
  const [order, setOrder] = useState<WorkOrder | null>(null);
  // Area Team ก็ดูอย่างเดียวเหมือนกัน — แจ้งและเปิดใบงานได้ แต่ไม่ได้ทำขั้นตอนของใคร (เจ้าของงานกำหนด ต.ค. 69)
  // หัวหน้าภาคของทีมที่รับงานข้ามทีมมาก็ดูอย่างเดียว — ใบเป็นของหัวหน้าภาคเจ้าของพื้นที่ (เซิร์ฟเวอร์บอกมา)
  const viewOnly = !!me?.partsAdmin || isAreaTeam(me) || !!order?.viewOnly;
  // ช่าง (รวม Senior ช่าง) — คนเดียวที่กด "ถึงหน้างาน" ได้ (เจ้าของงานเลือก พ.ย. 69)
  const isTech = me?.role === "EMPLOYEE" || me?.role === "SENIOR_TECH";
  const user = viewOnly ? null : me;
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [supClosing, setSupClosing] = useState(false);
  // "แก้จากระยะไกลแล้ว · ปิดงาน" (ใบ IT) — ฟอร์มบันทึกสิ่งที่แก้ + ภาพหน้าจอหลักฐาน
  const [remoteClosing, setRemoteClosing] = useState(false);
  // ชีตแก้ยี่ห้อเครื่อง (ข้อ 23) — เปิดจากหน้าใบงาน ไม่ใช่จากในฟอร์มขั้นตอน (Modal ซ้อน Modal บนเว็บไม่น่าเชื่อถือ)
  const [brandFixOpen, setBrandFixOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [replying, setReplying] = useState(false);
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
  /**
   * สถานะคำขอนัดด่วนที่วาดทับใบระหว่างฟอร์มนัดวันเปิดอยู่ (ดู AskOverlay) — ปุ่มขอ/ยกเลิกในฟอร์มกับตัวเช็ค 20 วิเขียนที่นี่ที่เดียว
   * ปิดฟอร์มแล้วล้างทิ้งและโหลดใบใหม่ (ดู effect ใต้ reload) — ใบที่โหลดใหม่มีค่าจริงอยู่แล้ว
   */
  const [askOverlay, setAskOverlay] = useState<AskOverlay | null>(null);
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
  // ระงับชั่วคราว (พ.ย. 69) — ฟอร์มใส่เหตุผล + วันที่กลับมาทำ
  const [holdOpen, setHoldOpen] = useState(false);
  // แอดมินเลื่อนวันนัด (ต.ค. 69) — ทุกขั้นที่เลื่อนได้ รวมขั้นคอนเฟิร์มลูกค้า (ใบอยู่ขั้นเดิม ไม่ใช่การคอนเฟิร์ม)
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  // แอดมินแก้เป็นงานด่วน / ตอบคำขอนัดด่วนของหัวหน้าภาค — หน้าต่างของตัวเอง ไม่เปิดจากในฟอร์มขั้น (Modal ซ้อน Modal บนเว็บไม่น่าเชื่อถือ)
  const [urgentOpen, setUrgentOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [rescheduleStages, setRescheduleStages] = useState<string[]>(RESCHEDULE_STAGES);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  /** ขั้นรอลูกค้าจ่ายเงิน: ฟอร์มที่กางในการ์ด (ตามลูกค้าแล้ว · ลูกค้าไม่ซ่อม) — กางทีละอัน · ชิปเหตุผลจาก /options */
  const [payPanel, setPayPanel] = useState<"follow" | "decline" | null>(null);
  const [declineReasons, setDeclineReasons] = useState<DeclineReason[]>([]);
  const [quoteViewing, setQuoteViewing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  /**
   * หน้าตรวจเคลม: รายละเอียดใบงานที่เหลือ (ขั้นตอน ผลการทำงาน ไฟล์ ประวัติ) พับไว้ใต้หน้าตรวจ
   * ผู้ตรวจมาเพื่อตัดสินเคลม ไม่ใช่อ่านใบงานทั้งใบ — เปิดดูได้เมื่ออยากรู้ (ตัวอย่างที่เจ้าของงานเลือก)
   */
  const [claimDetailOpen, setClaimDetailOpen] = useState(false);
  /**
   * เปิดมาจากหน้า "งานของฉันวันนี้" ของช่าง — ปุ่มใหญ่ที่นั่นพามาเปิดฟอร์มให้เลย (ปิดงาน / ผลตรวจ / แจ้งปัญหา)
   * ช่างกดครั้งเดียวถึงฟอร์ม ไม่ต้องเปิดใบงานแล้วหาปุ่มอีกรอบ · เปิดครั้งเดียวต่อการเข้าหน้า
   */
  const openOnLoad = useRef(route.params.open ?? null);
  /**
   * แอดมินเลื่อนวันนัดได้ไหม — แอดมิน (รวม Super Admin) ที่ไม่ได้ดูในฐานะคนอื่น · Admin Spare Part ถูกตัด user ทิ้งแล้ว
   * ตั้งแต่มีวันนัดจนช่างกดถึงหน้างาน (เซิร์ฟเวอร์กันซ้ำ) — ช่างถึงแล้วเลื่อนไม่ได้ ใช้ "แจ้งปัญหาหน้างาน" ของช่าง
   */
  const reschedulable = (o: WorkOrder) =>
    (canMoveDates(user) || (itLeadOf(user) && o.jobType === "IT")) &&
    !!o.scheduledAt &&
    rescheduleStages.includes(o.status) &&
    !(RECALL_STAGES.includes(o.status) && techArrived(o));
  /**
   * ทุกทางเข้า "เลื่อนวันนัด" เปิดฟอร์มเดียวกัน (POST /reschedule — ใบอยู่ขั้นเดิม) รวมขั้นคอนเฟิร์มลูกค้า
   * เดิมขั้นคอนเฟิร์มเปิดฟอร์มคอนเฟิร์มที่ "ลูกค้าขอเลื่อน" ซึ่งบันทึกว่าลูกค้าคอนเฟิร์มแล้วและส่งใบไปปล่อยงาน
   * ทั้งที่แอดมินแค่ย้ายวัน (ของโอนไม่ทัน · เลยนัด) ยังไม่ได้โทรร้าน — ช่างไปร้านที่ไม่ได้ตกลงวัน
   * "ลูกค้าขอเลื่อน" ในฟอร์มคอนเฟิร์มยังอยู่ สำหรับตอนโทรแล้วร้านตกลงวันอื่นจริง
   */
  const openReschedule = () => setRescheduleOpen(true);
  useEffect(() => {
    const want = openOnLoad.current;
    if (!want || !order) return;
    openOnLoad.current = null;
    if (want === "close" && order.status === "IN_PROGRESS") setClosing(true);
    else if (want === "stage" && order.status === "INSPECTING") setStageOpen(true);
    // ปุ่ม "คอนเฟิร์มอะไหล่" บนการ์ดกล่องงาน = เปิดจอคอนเฟิร์มเลย (ตัวอย่าง supOpenReview) ไม่ใช่พาไปหน้าใบงานแล้วต้องกดซ้ำ
    // ต้องเป็นตาคนเปิดด้วย — ช่างคนอื่นในทีมกดการ์ด "บันทึกผลตรวจ" ที่ค้างอยู่ใน งานของฉัน ก็ส่ง open:"stage" มาเหมือนกัน
    // ถ้าไม่กันจะเห็นจอของหัวหน้าภาคที่กดอะไรก็ได้ 403 แทนกล่องรายการรอคอนเฟิร์มบนหน้าใบงาน
    else if (want === "stage" && pickPending(order) && myTurn(order)) setStageOpen(true);
    /**
     * งานของฉันวันนี้ของแอดมินแบบแยกหัวข้อ (เจ้าของงานเลือก 5 พ.ย. 69 · ตัวอย่าง myday ข้อ 4): ปุ่มน้ำเงินบนแถว = เข้าใบงาน
     * พร้อมฟอร์มของขั้นนั้นเลย (เดิมพามาที่ใบเฉย ๆ แล้วต้องหาปุ่มของขั้นอีกรอบ) · เฉพาะแอดมินกับขั้นของแอดมินที่ถึงคิวจริง —
     * ปุ่มบนการ์ดของหัวหน้าภาคยังเปิดฟอร์มเฉพาะใบตรวจหน้างาน/คอนเฟิร์มอะไหล่ตามเดิม (สอนการใช้งานพึ่งพฤติกรรมนั้น — order.openStage)
     * ดูในฐานะ/Admin Spare Part ไม่มี user ในหน้านี้ จึงไม่เปิดอะไร
     */
    else if (want === "stage" && user?.role === "ADMIN" && ADMIN_FORM_STAGES.includes(order.status) && myTurn(order)) setStageOpen(true);
    // หัวหน้าภาคที่ดูแลงาน IT กดปุ่มขั้นของแอดมินบนการ์ดใบ IT — เปิดฟอร์มของขั้นนั้นเลยเหมือนแอดมิน
    else if (want === "stage" && itLeadActs(user, order) && ADMIN_FORM_STAGES.includes(order.status)) setStageOpen(true);
    else if (want === "problem" && order.status === "IN_PROGRESS") setRollbackOpen(true);
    else if (want === "reschedule" && reschedulable(order)) openReschedule();
  }, [order]);
  // ขยับเมื่อมีไฟล์ถูกแนบจากที่อื่นนอกการ์ดไฟล์แนบ เพื่อสั่งให้การ์ดโหลดใหม่
  const [filesKey, setFilesKey] = useState(0);
  // รายการไฟล์ที่การ์ดไฟล์แนบโหลดมาแล้ว — ยืมมาใช้ต่อในการ์ดผลการทำงาน
  // จะได้ไม่ต้องยิงขอรายการเดิมซ้ำอีกรอบ (รูปย่อเป็น data URL ก้อนใหญ่)
  const [files, setFiles] = useState<Attachment[]>([]);
  /**
   * สถานะรายการไฟล์ — หน้าตรวจเคลมต้องแยก "กำลังโหลด" / "โหลดไม่สำเร็จ" / "ไม่มีไฟล์จริง ๆ" ออกจากกัน
   * เดิมใช้ "รายการว่าง = กำลังโหลด" ถ้าคำขอพัง (เน็ตสะดุด) จะขึ้น "กำลังโหลดไฟล์…" ค้างตลอด ไม่มีทางลองใหม่
   * (การ์ดไฟล์แนบที่บอกว่าพังถูกพับซ่อนอยู่ใต้หน้าตรวจ ผู้ตรวจไม่เห็นอะไรเลย)
   */
  const [filesState, setFilesState] = useState<"loading" | "ready" | "failed">("loading");
  const filesLoaded = useCallback((rows: Attachment[]) => {
    setFiles(rows);
    setFilesState("ready");
  }, []);
  const filesFailed = useCallback(() => setFilesState("failed"), []);
  const reloadFiles = useCallback(() => {
    setFilesState("loading");
    setFilesKey((k) => k + 1);
  }, []);
  /**
   * หลักฐานที่เซิร์ฟเวอร์อ้างถึงแต่ยังไม่อยู่ในรายการไฟล์ที่โหลดไว้ — โหลดใบใหม่เอง (ซิงก์ทุก 20 วิ / กลับมาที่แท็บ)
   * ไม่ได้โหลดรายการไฟล์ตาม ช่างส่งเคลมใหม่พร้อมวิดีโอใหม่ หน้าตรวจจะบอกว่า "ไม่มีวิดีโอการตรวจเช็ค" ทั้งที่แนบมาแล้ว
   * ผู้ตรวจอาจตีกลับซ้ำเพราะไฟล์ที่มีอยู่จริง · ขอใหม่ครั้งเดียวต่อชุดไฟล์ที่หาไม่เจอ (ไฟล์ที่ถูกลบไปแล้วจะไม่วนขอไม่จบ)
   */
  const unknownEvidence = useMemo(() => {
    if (!order) return "";
    const known = new Set(files.map((f) => f.id));
    const ids = new Set<number>();
    for (const c of order.claims) {
      for (const i of c.evidenceIds ?? []) if (!known.has(i)) ids.add(i);
      if (c.nameplate?.photoId && !known.has(c.nameplate.photoId)) ids.add(c.nameplate.photoId);
    }
    return [...ids].sort((a, b) => a - b).join(",");
  }, [order, files]);
  const [filesAskedFor, setFilesAskedFor] = useState("");
  useEffect(() => {
    if (filesState !== "ready" || !unknownEvidence || unknownEvidence === filesAskedFor) return;
    setFilesAskedFor(unknownEvidence);
    reloadFiles();
  }, [filesState, unknownEvidence, filesAskedFor, reloadFiles]);
  // ระหว่างรอรอบขอใหม่ข้างบน นับเป็นกำลังโหลด — ไม่ขึ้น "ไม่มี…" แวบหนึ่งก่อนไฟล์มา
  const filesStatus = filesState === "ready" && unknownEvidence && unknownEvidence !== filesAskedFor ? "loading" : filesState;
  // หน้าต่าง "ย้ายใบงานนี้ไปถังขยะ?" (แอดมิน)
  const [trashing, setTrashing] = useState(false);
  /**
   * หน้านี้เองเพิ่งย้ายใบไปถังขยะ — ตัวเช็ครุ่นที่ยิงตอนกล่องยืนยันปิด (subscribeModals) ได้ 404 trashed ของใบที่ตัวเองลบ
   * ถ้าไม่จำไว้: ขึ้นแถบที่สอง "…ถูกย้ายไปถังขยะแล้ว — แอดมินกู้คืนได้…" ทับแถบ "เลิกทำ" และ goBack ซ้ำอีกรอบ
   * พาแอดมินหลุดจากรายการใบงานไปแท็บก่อนหน้า (ลองจริง 4 พ.ย. 69: ลบจากรายการแล้วไปโผล่ "งานของฉันวันนี้")
   */
  const trashedHere = useRef(false);
  // ขั้นที่ทำแล้วที่กดดูอยู่ (null = ไม่ได้ดู)
  const [stepInfo, setStepInfo] = useState<string | null>(null);
  // เปิดใบที่ไม่ใช่ของทีม/พื้นที่ตัวเอง (403) — หน้ากุญแจแทนตัวหนังสือแดง เพราะไม่ใช่ข้อผิดพลาด แค่ไม่ใช่งานของคุณ
  const [locked, setLocked] = useState(false);
  // ใบนี้อยู่ในถังขยะ (404 trashed จากเซิร์ฟเวอร์) — แอดมินที่กู้คืนได้เห็นปุ่มไปหน้าถังขยะแทนตัวหนังสือแดง
  const [inTrash, setInTrash] = useState(false);
  // การ์ดสาขา/การมอบหมายวางคู่กันเมื่อหน้าต่างกว้างพอ
  const [bodyWidth, setBodyWidth] = useState(0);
  const twoCol = bodyWidth >= 720;

  const optionsLoaded = useRef(false);
  /**
   * ใบงานชุดใหม่สุดที่รับไว้ — คำตอบที่ออกไปก่อนแต่มาถึงทีหลังต้องไม่เขียนทับ (บั๊กปิดงานแล้วใบค้าง 4 พ.ย. 69)
   *
   * ฟอร์มปิดงานโหลดใบเงียบ ๆ ทุกครั้งที่ไฟล์ขึ้นเสร็จ (refreshQuiet) ถ้ากดส่งตอนคำถามนั้นยังไม่กลับ
   * ปิดงานเสร็จใช้ก้อนที่เซิร์ฟเวอร์ส่งกลับทันที (ปิดแล้ว) แล้วคำตอบเก่าที่อ่านก่อนปิดมาถึงทีหลัง ทับกลับเป็นยังไม่ปิด
   * จอขึ้น "ปิดงานแล้ว" แวบเดียวแล้วกลับเป็นปุ่มปิดงาน คนกดซ้ำ — เซิร์ฟเวอร์ตอบว่าส่งปิดไปแล้ว จึงดูเหมือน "ปิดรอบสองถึงได้"
   * ฐานข้อมูลอยู่คนละ region และจำกัด connection ไว้ 5 คำถามจึงกลับไม่เรียงตามที่ส่ง
   * ตัดสินด้วยเลขประวัติล่าสุด: ทุกการเปลี่ยนขั้นลงประวัติ และไม่มีที่ไหนลบประวัติ — เลขน้อยกว่า = อ่านมาก่อน
   * เท่ากันยังรับ (ไฟล์แนบ/เคลมซ้ำเปลี่ยนได้โดยไม่ลงประวัติ)
   */
  const newest = useRef<WorkOrder | null>(null);
  const accept = useCallback((next: WorkOrder): WorkOrder => {
    const cur = newest.current;
    if (cur && cur.id === next.id && latestLogId(next) < latestLogId(cur)) return cur;
    newest.current = next;
    setOrder(next);
    return next;
  }, []);
  const load = useCallback(async (): Promise<WorkOrder | null> => {
    // เพิ่งกดบันทึก — เซิร์ฟเวอร์ส่งใบงานทั้งก้อนกลับมาแล้ว ใช้เลย ไม่ต้องรอถามซ้ำ (utils/freshOrder.ts)
    // ตัวเลือกในฟอร์ม (ทีม ช่าง คลัง) ไม่ได้เปลี่ยนตามขั้น ใช้ชุดที่โหลดไว้ตอนเปิดหน้า
    const fresh = takeFresh<WorkOrder>(id);
    if (fresh && optionsLoaded.current) {
      // ก้อนที่ปุ่มบันทึกส่งกลับมาคือ detailFor ซึ่งไม่มีเคลมซ้ำ (เซิร์ฟเวอร์ส่งเฉพาะ GET ใบงาน) — ใช้ของเดิมต่อ
      // ไม่งั้นแก้อาการจากหน้าตรวจเคลมแล้วคำเตือน "⚠ เครื่องนี้เคยเคลม" หายไปทั้งที่ใบยังรอตัดสินอยู่
      const prev = newest.current;
      return accept(
        prev?.id === fresh.id && fresh.claimRepeats === undefined && prev.claimRepeats
          ? { ...fresh, claimRepeats: prev.claimRepeats }
          : fresh
      );
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
          rescheduleStages?: string[];
          machineModels?: string[];
          quoteDeclineReasons?: DeclineReason[];
        }>("/work-orders/options"),
      ]);
      const got = accept(detail.data);
      setResults(options.data.results);
      setWorkStatuses(options.data.workStatuses);
      setSendBackReasons(options.data.sendBackReasons ?? []);
      setPriorities(options.data.priorities ?? []);
      setStages(options.data.stages);
      setWarehouses(options.data.warehouses);
      if (options.data.adminWarehouse) setAdminWarehouse(options.data.adminWarehouse);
      setTechnicians(options.data.technicians);
      setTeams(options.data.teams ?? []);
      if (options.data.rescheduleStages) setRescheduleStages(options.data.rescheduleStages);
      setDeclineReasons(options.data.quoteDeclineReasons ?? []);
      // ฝากไว้ให้ "ลูกค้าไม่ซ่อม" ในแถวของแท็บรอเงินใช้ต่อ ไม่ต้องถาม options ซ้ำ (DeclineInline)
      rememberDeclineReasons(options.data.quoteDeclineReasons);
      // ปุ่มยี่ห้อเครื่องในช่องเลือกอะไหล่/ชีตแก้ยี่ห้อใช้รายการเดียวกับฟอร์มเปิดใบงาน (เซิร์ฟเวอร์เพิ่มยี่ห้อแล้วตามทัน)
      rememberMachineModels(options.data.machineModels);
      optionsLoaded.current = true;
      setError(null);
      setLocked(false);
      setInTrash(false);
      return got;
    } catch (e) {
      setError(apiErrorMessage(e));
      setLocked((e as { response?: { status?: number } })?.response?.status === 403);
      setInTrash(isTrashedError(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [id, accept]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /**
   * โหลดตัวใบ + การ์ดไฟล์แนบใหม่แบบเงียบ (ไม่มีหน้าโหลด ไม่เด้งบอกสถานะ) — ฟอร์มปิดงานเรียกหลังไฟล์เคลมแต่ละไฟล์ขึ้นเสร็จ
   * หลักฐานในใบ (claimEvidence) กับรูปย่อต้องตามทันไฟล์ที่เพิ่งส่ง ไม่งั้นปิดฟอร์มแล้วเปิดใหม่ช่องนั้นว่างเหมือนไม่เคยแนบ
   * ผิดพลาดเงียบไว้ — ไฟล์ขึ้นแล้วจริง ครั้งหน้าที่โหลดใบก็เห็นเอง
   */
  const refreshQuiet = useCallback(async () => {
    try {
      const res = await api.get<WorkOrder>(`/work-orders/${id}`, { loadingText: false });
      accept(res.data);
    } catch {
      // ไม่ขัดจังหวะช่างที่กำลังกรอกฟอร์ม
    }
    setFilesKey((k) => k + 1);
  }, [id, accept]);

  // รายการไฟล์แนบเริ่มโหลดพร้อมตัวใบงาน — การ์ดไฟล์แนบขึ้นจอหลังใบงานมาถึงแล้วรับผลไปใช้เลย (utils/attachmentCache)
  useEffect(() => {
    prefetchAttachments(id);
  }, [id]);

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
   * "ตอนนี้" ตามนาฬิกาเซิร์ฟเวอร์ ณ วินาทีที่เรียก — ใช้ตัดสินข้อความหลังกดบันทึก (ทีมเห็นงานในแท็บไหน) และหน้าต่างของแอดมิน
   * หน้าใบงานไม่ได้วาดตามเวลาเอง: ป้าย/ฟอร์มที่นับถอยหลังเดินนาฬิกาของตัวเอง (LiveScheduleChip · StageModal)
   * หน้านี้ยาวหลายพันบรรทัด วาดใหม่ทั้งหน้าทุก 30 วิเพื่อป้ายเดียวหนักเกินไปบนมือถือรุ่นเก่า
   */
  const serverNowAt = useServerNowFn(order?.serverNow);

  /**
   * หน้าก่อนหน้าในกองคือ "งานของฉัน" ไหม — ส่งผลตรวจ/ตีกลับแล้วพากลับไปหน้านั้นได้ด้วย goBack (ไม่ซ้อนหน้าใหม่)
   * เปิดใบจากรายการใบงาน/ลิงก์ = อยู่หน้าเดิม · ใช้กองของตัวนำทางที่หน้านี้อยู่ (หน้าใบงานลงทะเบียนไว้มากกว่าหนึ่งแท็บ)
   */
  const cameFromMyJobs = () => {
    const st = navigation.getState();
    return st.routes[st.index - 1]?.name === "MyJobs";
  };
  /**
   * ตัดสินเคลมทีละชิ้น (เคลมก้อน 3) — แท็บในหน้าตรวจกับปุ่มในแถบล่างจอใช้ชุดเดียวกัน จึงถือไว้ที่หน้าใบงาน
   * ส่งสำเร็จแล้วเก็บสรุปผลไว้ขึ้นบนสุดของใบ (ผ่านกี่ชิ้น ปิดอะไรไป · ตีกลับชิ้นไหน) พร้อมปุ่มไปใบถัดไป
   */
  const [reviewOutcome, setReviewOutcome] = useState<ReviewOutcome | null>(null);
  const [nexting, setNexting] = useState(false);
  const pageScroll = useRef<ScrollView>(null);
  /** แถบขั้นตอนที่ปัดซ้ายขวาได้ (จอแคบ) — เปิดใบมาแล้วเลื่อนให้ขั้นปัจจุบันอยู่กลางแถบ */
  const stepScroll = useRef<ScrollView>(null);
  const verdicts = useClaimVerdicts(
    order,
    !!order && order.status === "CLAIM_REVIEW" && canDecideClaims(me),
    async (outcome) => {
      setReviewOutcome(outcome);
      // ป้าย "{x} ใบ" ของเมนูตรวจเคลมลดทันที — ตัดสินแล้วยังอยู่หน้าเดิม เมนูไม่รู้เองจนกว่าจะเปลี่ยนหน้า
      refreshClaimQueueCount();
      await load();
      /**
       * สรุปผลอยู่บนสุดของใบ แต่ผู้ตรวจมักเลื่อนลงไปดูรูป/วิดีโอของชิ้นนั้นอยู่ — หน้าตรวจหายไปแล้วใบงานยาว ๆ ขึ้นแทน
       * ที่ตำแหน่งเลื่อนเดิม ถ้าไม่พากลับขึ้นบน ผู้ตรวจเห็นกลางใบงาน ไม่เห็นสรุป ไม่เห็น "ใบถัดไป →" และไม่รู้ว่าส่งไปแล้วหรือยัง
       * + เด้งบอกสั้น ๆ แบบที่ทุกปุ่มเปลี่ยนสถานะทำ (เจ้าของงานขอ ต.ค. 69 — หน้าจอเปลี่ยนเงียบ ๆ แล้วคนกดซ้ำ)
       */
      pageScroll.current?.scrollTo({ y: 0, animated: true });
      feedback.toast("success", outcome.kind === "closed" ? `${order?.code ?? ""} ตรวจเคลมเสร็จ · ปิดงานแล้ว` : `${order?.code ?? ""} ตีกลับให้ช่างแก้แล้ว`);
    }
  );
  /**
   * "ใบถัดไป →" — ใบแรกของกล่องงานตรวจเคลม (เรียงจากที่รอนานที่สุด) ที่ไม่ใช่ใบนี้ · ไม่มีแล้วกลับไปหน้าก่อน
   * ผู้ตรวจไม่ต้องย้อนไปหารายการเองทีละใบ · ถามกล่องงานชุดเดียวกับหน้าตรวจเคลม (เคลมก้อน 6) — ลำดับ "ถัดไป"
   * ของมือถือกับจอคอมจึงตรงกัน (เดิมเรียงตามเวลาปิดงาน ซึ่งไม่ใช่เวลาที่ส่งเคลมรอบล่าสุด)
   */
  const nextClaim = useCallback(async () => {
    setNexting(true);
    try {
      const res = await api.get<{ rows: { workOrderId: number }[] }>("/part-claims/queue");
      const next = res.data.rows.find((r) => r.workOrderId !== id);
      if (next) navigation.replace("WorkOrderDetail", { id: next.workOrderId });
      else {
        showAlert("ไม่มีใบรอตรวจเคลมแล้ว");
        if (navigation.canGoBack()) navigation.goBack();
      }
    } catch (e) {
      showAlert("เปิดใบถัดไปไม่ได้", apiErrorMessage(e));
    } finally {
      setNexting(false);
    }
  }, [id, navigation]);

  /**
   * มีคนอื่นเปลี่ยนใบงานนี้ระหว่างที่เปิดอยู่ — ถามรุ่นข้อมูลทุก 20 วินาทีและตอนกลับมาที่แท็บ (ต.ค. 69)
   *
   * ไม่มีฟอร์มเปิด → โหลดใหม่ให้เองพร้อมบอกว่าใครเปลี่ยน · มีฟอร์มเปิด → แถบเหลือง ไม่โหลดทับที่กำลังกรอก
   * ปิดฟอร์มแล้วเช็คอีกรอบทันที · ถามแค่เลขประวัติล่าสุด (เบา) ไม่โหลดทั้งใบทุกรอบ
   */
  const [staleNote, setStaleNote] = useState<string | null>(null);
  // ฟอร์มที่ถือวันนัดอยู่ — ฟอร์มขั้นอื่น (เบิก · โอน) ไม่ได้ใช้วันนัด เปิดค้างไว้ได้ตามเดิม
  const dateForm = rescheduleOpen || (stageOpen && !!order && DATE_FORM_STAGES.includes(order.status));
  /**
   * ฟอร์มที่ต้องแอบดูประวัติระหว่างเปิด = ฟอร์มที่ถือวันนัด + ฟอร์มนัดวันของหัวหน้าภาค (ระบุอะไหล่ · นัดวันเข้า)
   * ฟอร์มนัดวันไม่ได้ถือวันนัดเก่า แต่รอคำตอบของแอดมิน (แก้เป็นงานด่วน · ตอบคำขอ) — ถ้าไม่แอบดู
   * ตัวเช็คได้แค่แถบเหลือง หัวหน้าภาคต้องปิดฟอร์ม (ทิ้งทีม/เวลาที่กรอก) ถึงจะเห็นว่าแอดมินแก้ให้แล้ว
   */
  const liveForm = dateForm || (stageOpen && !!order && SCHEDULE_STAGES.includes(order.status));
  const live = useRef({ order, load, dateForm, liveForm, stageOpen });
  live.current = { order, load, dateForm, liveForm, stageOpen };
  // รุ่นข้อมูลที่ดูประวัติไปแล้วระหว่างฟอร์มเปิด — ไม่โหลดใบทั้งก้อนซ้ำทุก 20 วินาทีระหว่างที่ฟอร์มยังเปิดอยู่
  const peeked = useRef(0);
  // เลขประวัติล่าสุดที่โหลดมาแล้ว — live.current.order เปลี่ยนตอนวาดจอใหม่ ซึ่งช้ากว่าโหลดเสร็จ
  // รอบถัดไปที่ตามมาติด ๆ (ปิดฟอร์มแล้วเช็คทันที) จะเห็นใบเก่าแล้วโหลดซ้ำ เด้งข้อความซ้ำ
  const known = useRef(0);
  const reload = useCallback(async () => {
    const next = await live.current.load();
    if (next) known.current = Math.max(known.current, latestLogId(next));
  }, []);
  /**
   * ฟอร์มนัดวันปิดแล้ว — ทิ้งสถานะที่วาดทับไว้แล้วโหลดใบใหม่เอง ต้องสั่งตรงนี้: ตัวเช็คตอนปิดฟอร์ม (checkRemote)
   * ไม่เห็นอะไรใหม่ เพราะ known ขยับไปแล้วตอนวาดทับ — ไม่โหลด หน้าใบงานจะยังโชว์สถานะก่อนแอดมินแก้ให้
   */
  useEffect(() => {
    if (stageOpen || !askOverlay) return;
    setAskOverlay(null);
    void reload();
  }, [stageOpen, askOverlay, reload]);
  const checkOnce = useCallback(async () => {
    const cur = live.current.order;
    if (!cur || !pageVisible()) return;
    let r: { v: number; byId: number | null; byName: string | null; actionLabel: string | null; at: string | null; statusLabel: string };
    try {
      r = (await api.get(`/work-orders/${cur.id}/version`, { loadingText: false })).data;
    } catch (e) {
      // มีคนย้ายใบนี้ไปถังขยะระหว่างที่เปิดอยู่ — ปิดหน้าใบงานพร้อมบอก ไม่งั้นทุกปุ่มได้ "อยู่ในถังขยะ" จนกว่าจะรู้ตัวเอง
      // หน้าที่ไม่ได้อยู่บนจอแล้ว (ปิดไปแล้ว/มีหน้าอื่นทับ) ไม่ goBack — ไม่งั้นพาหน้าที่อยู่บนจอถอยตามไปด้วย
      if (isTrashedError(e) && !trashedHere.current) {
        trashedHere.current = true;
        feedback.toast("warn", `${cur.code} ถูกย้ายไปถังขยะแล้ว — แอดมินกู้คืนได้ที่เมนู “ถังขยะใบงาน”`);
        if (navigation.isFocused()) navigation.goBack();
      }
      return; // เน็ตหลุด / เซิร์ฟเวอร์หลับ — รอบหน้าค่อยถาม
    }
    if (r.v <= Math.max(latestLogId(cur), known.current)) return;
    // ของที่ตัวเองทำจากอีกแท็บ/อีกเครื่อง โหลดเงียบ ๆ ไม่ต้องบอก
    const who = r.byId !== null && r.byId !== user?.id ? r.byName ?? "มีคน" : null;
    /**
     * แอดมินเลื่อนวันนัดระหว่างที่ฟอร์มขั้น (คอนเฟิร์มลูกค้า · ปล่อยงาน · ทีมไม่ว่างวันใหม่) หรือฟอร์มเลื่อนวันเปิดอยู่
     * — ใบอยู่ขั้นเดิมแต่วันในฟอร์มเก่าแล้ว แถบเหลืองหลังฟอร์มไม่พอ: คนที่คุยกับร้านเรื่องวันเดิมอยู่จะกดยืนยันวันที่ไม่ได้คุย
     * ปิดฟอร์มแล้วโหลดใหม่ให้เห็นวันใหม่ก่อน (เซิร์ฟเวอร์กันซ้ำด้วยวันที่ฟอร์มส่งไป แต่ปิดก่อนดีกว่ากรอกเสร็จแล้วโดนปฏิเสธ)
     * ดูประวัติใหม่ทั้งหมด ไม่ใช่แค่แถวล่าสุด — เลื่อนแล้วมีคนแนบรูปต่อ แถวล่าสุดก็ไม่ใช่การเลื่อนแล้ว
     */
    if (who && live.current.liveForm && r.v > peeked.current) {
      peeked.current = r.v;
      let fresh: WorkOrder | null = null;
      try {
        fresh = (await api.get<WorkOrder>(`/work-orders/${cur.id}`, { loadingText: false })).data;
      } catch {
        fresh = null; // ดูไม่ได้ — ใช้แถบเหลืองตามเดิม เซิร์ฟเวอร์ยังกันด้วยวันที่ฟอร์มส่งไป
      }
      const since = latestLogId(cur);
      if (live.current.dateForm && fresh?.logs.some((l) => l.id > since && ADMIN_DATE_MOVES.includes(l.action))) {
        setStageOpen(false);
        setRescheduleOpen(false);
        setStaleNote(null);
        await reload();
        feedback.toast("warn", "แอดมินเพิ่งเลื่อนวันนัด — โหลดใหม่แล้ว");
        return;
      }
      /**
       * แอดมินแก้เป็นงานด่วน/ตอบคำขอนัดด่วน ระหว่างที่หัวหน้าภาคเปิดฟอร์มนัดวันค้างไว้ — วาดทับในฟอร์มเดิม ฟอร์มไม่ปิด
       * วันที่แก้ให้กดได้ทันที (ป้ายเขียว · บรรทัดเขียว) หรือเห็นคำตอบ แล้วนัดต่อได้โดยไม่ต้องกรอกทีม/เวลาใหม่
       * วาดทับเฉพาะสถานะคำขอ (askOverlay) ไม่ setOrder — ฟอร์มล้างค่าที่กรอกทุกครั้งที่ใบเปลี่ยน
       * ใบเปลี่ยนขั้นไปแล้ว หรือมีแต่แถวประเภทอื่น = ลงไปทางแถบเหลืองตามเดิม (เซิร์ฟเวอร์ยังกันการบันทึกที่ค้างขั้นเก่า)
       */
      const answered =
        fresh && live.current.stageOpen && SCHEDULE_STAGES.includes(cur.status) && fresh.status === cur.status
          ? fresh.logs
              .filter((l) => l.id > since && (l.action === "URGENT_RELEASE" || l.action === "URGENT_REQUEST_ANSWERED"))
              .sort((a, b) => b.id - a.id)[0]
          : undefined;
      if (fresh && answered) {
        setAskOverlay(overlayOf(fresh));
        known.current = Math.max(known.current, latestLogId(fresh));
        const granted = (fresh.urgentReleaseFor ?? "").slice(0, 10);
        feedback.toast(
          "success",
          answered.action === "URGENT_RELEASE" && granted
            ? `แอดมินแก้เป็นงานด่วนแล้ว — นัด ${dayShort(granted)} ได้`
            : "แอดมินตอบคำขอนัดด่วนแล้ว — ดูในฟอร์มนัดวัน"
        );
        return;
      }
    }
    if (anyModalOpen()) {
      if (who) {
        const at = r.at ? new Date(r.at).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }) : "";
        setStaleNote(`${who} เปลี่ยนใบงานนี้ระหว่างที่คุณเปิดอยู่ (${r.actionLabel ?? "แก้ไข"} ${at} น.) — ข้อมูลที่เห็นอาจเก่า`);
      }
      return;
    }
    await reload();
    setStaleNote(null);
    if (who) feedback.toast("info", `${who} อัปเดตใบงานนี้ — ${r.statusLabel}`);
  }, [user?.id, reload, navigation]);
  /**
   * ถามทีละรอบ — รอบเวลา · กลับมาที่แท็บ · ปิดฟอร์ม ยิงพร้อมกันได้ รอบที่ซ้อนกันโหลดใบซ้ำและเด้งข้อความซ้ำ
   * (เจอตอนปิดฟอร์มเพราะวันนัดถูกเลื่อน: ขึ้นทั้ง "แอดมินเพิ่งเลื่อนวันนัด" และ "…อัปเดตใบงานนี้") · ระหว่างถามมีคนเรียกอีก = ถามซ้ำอีกรอบหลังจบ
   */
  const checking = useRef(false);
  const recheck = useRef(false);
  const checkRemote = useCallback(async () => {
    if (checking.current) {
      recheck.current = true;
      return;
    }
    checking.current = true;
    try {
      do {
        recheck.current = false;
        await checkOnce();
      } while (recheck.current);
    } finally {
      checking.current = false;
    }
  }, [checkOnce]);
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
        setRescheduleOpen(false);
        // แก้เป็นงานด่วน/ตอบคำขอไม่ผ่านเพราะใบเปลี่ยนขั้นแล้ว (หัวหน้าภาคนัดวันไปแล้ว · ย้อนขั้น) — ปิดหน้าต่างให้เห็นใบล่าสุด
        // (คำขอเปลี่ยนแต่ขั้นเดิม = 409 URGENT_ASK_STATE ไม่มาทางนี้ หน้าต่างบอกเหตุผลเอง)
        setUrgentOpen(false);
        setAnswerOpen(false);
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
    if (user.role === "ADMIN") return !["PARTS_TRANSFER", "PARTS_IN_TRANSIT", "PARTS_PICKUP"].includes(o.status);
    // หัวหน้าภาคที่ดูแลงาน IT ทำขั้นของแอดมินในใบ IT ได้ ("ทำได้ทั้งหมด" ยกเว้นตรวจเคลม — เซิร์ฟเวอร์กันซ้ำ)
    if (itLeadActs(user, o)) return true;
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
      if (o.assignedTeam !== null) return ourTeamOrder(user, o);
      return true;
    }
    return o.stageActor === user.role;
  }

  /**
   * สอนการใช้งาน (หัวหน้าภาค "ระบุอะไหล่" เริ่มจากหน้าสอนการใช้งาน): เปิดฟอร์มระบุอะไหล่ของใบนี้ให้ — เปิดอย่างเดียว ไม่บันทึกอะไร
   * งานของฉันวันนี้เปิดใบมาให้ก่อน (queue.openParts) แล้วคำสั่งนี้เปิดฟอร์มต่อ · ฟอร์มเปิดตอนโหลดเองเฉพาะใบตรวจหน้างาน/คอนเฟิร์มอะไหล่
   * (openOnLoad) และไม่เปลี่ยนให้ — ปุ่มบนการ์ดของหัวหน้าภาคทุกคนต้องทำงานเหมือนเดิม
   * เฉพาะใบระบุอะไหล่ที่ช่างยังไม่ได้เลือกอะไหล่มา (จอคอนเฟิร์มไม่มีสามทางเลือกที่วิธีใช้อธิบาย) และถึงคิวคนดูจริง
   * ใบยังไม่โหลด = ยังไม่ตอบ (ตัวเครื่องลองซ้ำจนครบเวลา)
   */
  useHowToAction("order.openStage", () => {
    if (!order) return null;
    if (order.status !== "NEW" || pickPending(order) || !myTurn(order)) return false;
    setStageOpen(true);
    return { ok: true, code: order.code };
  });

  if (loading) {
    return (
      <PopupScreen title="ใบงาน" subtitle="ใบงานซ่อม" startMaximized instant={instant}>
        <View style={styles.centered}>
          <Spinner color={colors.primary} />
        </View>
      </PopupScreen>
    );
  }

  if (locked) {
    return (
      <PopupScreen title="ใบงาน" subtitle="ใบงานซ่อม" startMaximized instant={instant}>
        <LockedOrder me={me} error={error} onBack={() => navigation.goBack()} />
      </PopupScreen>
    );
  }

  // แอดมินที่ลบ/กู้ได้ (Admin Spare Part ไม่ได้) — คนอื่นเห็นข้อความของเซิร์ฟเวอร์ตามเดิม
  if (inTrash && me?.role === "ADMIN" && !me.partsAdmin) {
    return (
      <PopupScreen title={workOrderCode(id)} subtitle="ใบงานซ่อม" startMaximized instant={instant}>
        <TrashedOrderNote info={{ code: workOrderCode(id), canRestore: true }} onBack={() => navigation.goBack()} />
      </PopupScreen>
    );
  }

  if (error || !order) {
    return (
      <PopupScreen title="ใบงาน" subtitle="ใบงานซ่อม" startMaximized instant={instant}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? "ไม่พบใบงานนี้"}</Text>
        </View>
      </PopupScreen>
    );
  }

  /**
   * กดวงกลมขั้นตอน: ขั้นปัจจุบัน = ทำขั้นนี้ (ถ้าถึงคิวเรา) · ขั้นที่ทำแล้ว = ดูว่าใครทำ
   * key เป็นขั้นบนแถบ ("ISSUE" รวมขั้นเบิก/โอน) หรือขั้นของเซิร์ฟเวอร์ (รอบตรวจหน้างาน · ขั้นย่อยโอน)
   * ขั้นปัจจุบันเปิดฟอร์มของสถานะจริงของใบเสมอ — ขั้น 1 ระหว่างตรวจหน้างาน (loop) เปิดฟอร์มขั้นตรวจที่ค้างอยู่
   */
  /**
   * ช่างกดถึงหน้างานจากหน้าใบงาน (พ.ย. 69) — เดิมกดได้ที่ "งานของฉัน" ที่เดียว ช่างที่เปิดใบจากกล่องงาน/ลิงก์
   * ไม่เห็นปุ่ม ขั้นจึงค้าง "เข้างาน" ทั้งที่ยืนอยู่ในร้าน · ไม่มีพิกัดก็บันทึก (เซิร์ฟเวอร์บอกในประวัติว่าไม่มีพิกัด)
   */
  async function arriveNow() {
    if (!order || busy) return;
    setBusy(true);
    try {
      const pos = await currentPosition();
      const res = await api.post<{ note: string; withinRadius: boolean | null }>(`/work-orders/${order.id}/arrive`, pos ?? {});
      if (res.data.withinRadius === false) showAlert("บันทึกแล้ว — อยู่นอกรัศมีสาขา", res.data.note);
      await reload();
    } catch (e) {
      showAlert("บันทึกไม่ได้", apiErrorMessage(e));
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function pressStep(key: string, state: StepState) {
    if (state === "done") {
      setStepInfo(key);
      return;
    }
    // แอดมิน/หัวหน้าภาคปิดงานได้ตั้งแต่ขั้นเข้างาน (ปุ่มล่างเป็น "ปิดงาน" อยู่แล้ว) — วงขั้นปิดงานต้องทำแบบเดียวกับปุ่ม
    // ไม่งั้นกดชื่อขั้นที่ตรงกับปุ่มแล้วเงียบ (ขั้นนี้ยังเป็นขั้นข้างหน้าเพราะช่างยังไม่ถึง)
    if (key === "IN_PROGRESS" && state === "future" && !isTech && order?.status === "IN_PROGRESS" && myTurn(order) && !busy) {
      setClosing(true);
      return;
    }
    if ((state !== "now" && state !== "loop") || !order || !myTurn(order) || busy) return;
    // ขั้นเข้างาน: ช่างกดวงขั้น = กดถึงหน้างาน (ไม่มีฟอร์ม) · คนอื่นไม่มีอะไรให้กดที่วงนี้
    if (key === "ARRIVE") {
      if (isTech) void arriveNow();
      return;
    }
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
   * ทุกชิ้นที่ผลล่าสุดถูกตีกลับ (claimRound) — ตัดสินทีละชิ้นแล้ว แถวบนสุดอาจเป็นชิ้นที่ผ่าน (เคลมก้อน 3)
   */
  const rejectedRows = order.status === "IN_PROGRESS" ? rejectedRowsOf(order) : [];
  const rejected = rejectedRows[0] ?? null;
  /**
   * บรรทัดเหตุผล — ตีกลับทั้งใบขึ้น "ทั้งใบ (ข้อมูลเครื่อง)" ก่อน แล้วแต่ละชิ้นบอกช่อง/เหตุผลของตัวเอง (เคลมก้อน 4)
   * ชิ้นที่ถูกตีกลับเพราะทั้งใบอย่างเดียวไม่ขึ้นซ้ำ · แถวที่ไม่มีช่อง (ตีกลับแบบข้อความ) ขึ้นเหตุผลตามเดิม
   */
  const rejectLines = rejectLinesOf(rejectedRows, (c) => c.partLabel ?? c.partName, { family: order.claimGuide?.plate.family ?? null });
  /**
   * ขึ้นชื่อหน้าเหตุผลเมื่อมีหลายบรรทัด หรือเป็นการตีกลับทั้งใบ — เดิมบรรทัดเดียว = ชิ้นเดียวที่ถูกตีกลับ ไม่ต้องบอกชื่อ
   * แต่ตีกลับทั้งใบด้วยช่องของเครื่องอย่างเดียวก็เหลือบรรทัดเดียว ("รุ่น ต้องแก้") ถ้าไม่มีหัว "ทั้งใบ (ข้อมูลเครื่อง)"
   * ช่างไม่รู้ว่าทุกชิ้นถูกตีกลับเพราะข้อมูลเครื่องชุดเดียวกัน (แถบในฟอร์มแก้เคลมขึ้นหัวเสมอ)
   */
  const rejectPrefix = rejectLines.length > 1 || rejectLines.some((l) => l.part === WHOLE_ORDER_PART);
  const closeFiles = order.closedAt || rejected
    ? files.filter((f) => !order.roundStartedAt || f.createdAt >= order.roundStartedAt)
    : [];
  const beforeShots = closeFiles.filter((f) => f.role === "BEFORE");
  const afterShots = closeFiles.filter((f) => f.role === "AFTER");
  const otherShots = closeFiles.filter((f) => f.role !== "BEFORE" && f.role !== "AFTER");
  const closeShown = [...beforeShots, ...afterShots, ...otherShots];

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

  /**
   * ย้ายไปถังขยะสำเร็จ — กลับไปหน้าก่อน แล้วบอกบนแถบแจ้งเตือนว่ากู้คืนได้ถึงวันไหน พร้อม "เลิกทำ" (ตัวอย่างที่ตกลง)
   * เลิกทำ = กู้คืน (ใบกลับไปขั้นเดิม) แล้วรีเฟรชหน้าที่เปิดอยู่ให้ใบกลับมาโผล่ในรายการ
   * จำ id/code ไว้ก่อน goBack — หน้านี้ถูกถอดแล้ว ปุ่มบนแถบยังต้องรู้ว่ากู้ใบไหน
   */
  function trashed(r: { id: number; code: string; purgeAt: string }) {
    trashedHere.current = true;
    setTrashing(false);
    navigation.goBack();
    feedback.toast("success", `ย้าย ${r.code} ไปถังขยะแล้ว · กู้คืนได้ถึง ${trashDay(r.purgeAt)}`, {
      action: { label: "เลิกทำ", onPress: () => void restoreFromTrash(r.id) },
    });
  }

  /** แถบขั้นตอน — เฉพาะขั้นที่ใบนี้ต้องผ่าน เรียงตามลำดับที่ใบนี้เดินจริง (utils/stepPath) */
  const path = buildStepPath(order, stages);
  /**
   * ขั้นของเซิร์ฟเวอร์นี้ ใบนี้ทำผ่านมาแล้วจริงไหม — บนแถบหลัก บนรอบตรวจหน้างาน หรือขั้นย่อยโอน
   * ระหว่างตรวจหน้างาน ขั้น 1 เป็น "loop" (ยังไม่ติ๊ก เพราะตรวจแล้ววนกลับมาระบุ) แต่ใบผ่านขั้นระบุอะไหล่มาแล้วจริง
   * (หัวหน้าภาคเลือกส่งตรวจที่ขั้นนั้น) — ส่งตรวจผิดใบต้องย้อนกลับไประบุอะไหล่ได้เหมือนเดิม
   */
  const passedStage = (value: string) =>
    path.rows.some((r) => r.stages.includes(value) && (r.state === "done" || (r.state === "loop" && value === "NEW"))) ||
    !!path.track?.items.some((t) => t.key === value && t.state === "done");
  /**
   * ขั้นที่ย้อนกลับไปได้ — ขั้นก่อนหน้าที่ใบนี้ผ่านมาจริง ไม่นับขั้นที่ข้าม
   * ย้อนไปขั้นที่ไม่เคยผ่านคือการเดินใบงานไปทางที่ไม่ควรมีอยู่
   * "ก่อนหน้า" ใช้ลำดับของเซิร์ฟเวอร์ ไม่ใช่ลำดับบนแถบ — เซิร์ฟเวอร์รับเฉพาะขั้นที่อยู่ก่อนตามลำดับของมัน
   * (ใบคอนเฟิร์มก่อนเบิกที่ค้างอยู่ขั้นเบิก ย้อนไปคอนเฟิร์มไม่ได้แล้ว แต่ย้อนไปนัดวันได้)
   */
  const backTargets = (() => {
    const at = stages.findIndex((x) => x.value === order.status);
    return stages
      .slice(0, Math.max(0, at))
      .filter(
        (x) =>
          x.value !== "DONE" &&
          x.value !== "CLAIM_REVIEW" &&
          // ไม่รู้ว่าเลขใบเบิกตัวไหนเป็นของหัวหน้าภาค — ย้อนไปให้แอดมินเบิกใหม่แทน (เซิร์ฟเวอร์ปฏิเสธเหมือนกัน)
          x.value !== "PARTS_PICKUP" &&
          x.value !== "PARTS_TRANSFER" &&
          x.value !== "PARTS_IN_TRANSIT" &&
          (passedStage(x.value) ||
            /**
             * ใบเก่าที่เข้าเสนอราคาก่อนมีขั้นรอเบิกอะไหล่ — แอดมินเช็คหลังบ้านแล้วพบว่าของหมด
             * ต้องส่งกลับไปขั้นนั้นได้ ไม่งั้นเสนอราคา/เก็บเงินของที่ไม่มี (เจ้าของงานขอ ต.ค. 69)
             */
            (x.value === "PARTS_SOURCING" &&
              order.needsQuote === true &&
              (order.status === "AWAITING_QUOTE" ||
                order.status === "AWAITING_PAYMENT" ||
                /**
                 * ใบแยกที่เริ่มที่ขั้นเบิกทั้งที่ลูกค้ายังไม่จ่ายค่าตัวนั้น (ก่อนมีคำถามจ่ายแล้วหรือยัง — WO-00528)
                 * ย้อนไปเช็คอะไหล่ แล้วเดินเสนอราคา → รับเงิน → เบิก ตามใบปกติ
                 */
                (order.parent !== null && order.status === "PARTS_REQUESTED"))))
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
  // รอตรวจเคลมนับด้วย (ปิดงานแล้ว เหลือแค่เอกสารเคลม) — ชุดเดียวกับที่เซิร์ฟเวอร์รับใน POST /:id/follow-up
  // ไม่งั้นปิดพร้อมเคลมแล้วเปิดใบรออะไหล่ไม่สำเร็จ ข้อความบอกให้กดปุ่มนี้ แต่ปุ่มไม่ขึ้นจนกว่าจะตรวจเคลมเสร็จ
  const canFollowUp =
    ["IN_PROGRESS", "CLAIM_REVIEW", "DONE"].includes(order.status) &&
    (user?.role === "ADMIN" ||
      user?.role === "SUPERVISOR" ||
      ourTeamOrder(user, order));

  // ทางจบใบงาน — หัวหน้าภาค/แอดมินเท่านั้น (Admin Spare Part ถูกตัด user ทิ้งแล้ว · ดูในฐานะ ไม่ขึ้น)
  const canEnd =
    ((user?.role === "SUPERVISOR" || user?.role === "ADMIN") &&
      !user?.viewAs &&
      !["DONE", "CANCELLED", "CLAIM_REVIEW"].includes(order.status)) ||
    // ทีมที่รับงานข้ามทีม: หน้าจอนี้เป็นแบบดูอย่างเดียว (user = null) แต่ปุ่มปิดใบงานต้องขึ้น — ใช้ me ตรง ๆ
    (!!order.crossClose && me?.role === "SUPERVISOR" && !me?.viewAs);
  /**
   * ใบ IT ที่แก้จากระยะไกลได้ — แอดมิน และหัวหน้าภาคที่ดูแลงาน IT · ขั้นตามที่เซิร์ฟเวอร์ส่งมา (ยังไม่มีช่างถือใบ ไม่มีของ/เงินเดิน)
   * ใบที่เบิกของออกจากคลังแล้วเซิร์ฟเวอร์ตอบเหตุผลเองตอนกด (ปุ่มไม่ซ่อน — คนกดจะได้รู้ว่าต้องคืนคลังก่อน)
   */
  const canRemoteClose =
    !!user &&
    !user.viewAs &&
    order.jobType === "IT" &&
    ((user.role === "ADMIN" && !user.partsAdmin) || itLeadOf(user)) &&
    (order.remoteCloseStages ?? []).includes(order.status);

  const tone = statusTone(order.status);
  /**
   * ขั้นรอลูกค้าจ่ายเงิน (เจ้าของงานเลือก 5 พ.ย. 69) — รอมากี่วัน/เกินเส้นไหมมาจากเซิร์ฟเวอร์ (payWait) ไม่คิดเอง
   * payLate = เกิน 3 วัน: ป้ายหัวใบ ขอบการ์ดขั้น และแถวในรายการเป็นแดงพร้อมกัน
   */
  const payNow = order.status === "AWAITING_PAYMENT" ? order.payWait ?? null : null;
  const payLate = !!payNow?.over;
  const quoteFiles = files.filter((f) => f.role === "QUOTE");
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
    ourTeamOrder(user, order);
  // หน้าตาตามแบบ ต.ค. 69 — กว้างพอค่อยแยกสองคอลัมน์ (คอลัมน์ขวา 380 px + ซ้ายอย่างน้อย ~600 px)
  const wide = bodyWidth >= 1000;
  const stageNow = stages.find((x) => x.value === order.status);
  const canReschedule = reschedulable(order);
  /**
   * เลื่อนวันนัด (แอดมิน ต.ค. 69) — ปุ่มรองในท้ายการ์ดขั้นปัจจุบัน ขึ้นทั้งตอนเป็นคิวแอดมินและตอนรอคนอื่น
   * ขั้นคอนเฟิร์มลูกค้าก็ขึ้น: ย้ายวันโดยยังไม่ได้คอนเฟิร์ม (ใบอยู่ขั้นเดิม) คนละเรื่องกับ "ลูกค้าขอเลื่อน" ในฟอร์มคอนเฟิร์ม
   */
  const rescheduleBtn =
    canReschedule ? (
      <TouchableOpacity
        style={[styles.action, styles.actionProblem]}
        onPress={openReschedule}
        disabled={busy}
        activeOpacity={0.8}
        accessibilityLabel="เลื่อนวันนัด"
      >
        <Ionicons name="calendar-outline" size={18} color={colors.navy} />
        <Text style={styles.actionProblemText}>เลื่อนวันนัด</Text>
      </TouchableOpacity>
    ) : null;
  const lastLog = [...order.logs].sort((x, y) => y.createdAt.localeCompare(x.createdAt) || y.id - x.id)[0];
  // เครื่องหายจากไฟล์รายงานแล้ว แต่ใบยังไม่ปิด — ขึ้นทางลัดปิดใบงานตามแบบ
  const formDetail = splitFormDetail(order.detail);
  const recovered = order.outageId !== null && !order.closedAt && !order.outageStillOpen;
  /**
   * ใบรอตรวจเคลมที่ผู้ตรวจ (Admin Spare Part / Super Admin) เปิด — หน้าตรวจเคลมขึ้นก่อนทุกอย่าง แถบตัดสินติดล่างจอ
   * คนอื่น (รวมแอดมินทั่วไป) ยังเห็นการ์ดเคลมในใบงานแบบเดิม ไม่มีปุ่มตรวจ
   */
  // ต้องมีชิ้นที่รอตัดสินจริงในงานซ่อมครั้งนี้ — ข้อมูลไม่ตรงกัน (ไม่ควรเกิด) กลับไปการ์ดเคลมแบบเดิม ดีกว่าหน้าว่าง
  const reviewMode = order.status === "CLAIM_REVIEW" && canReviewClaims(me) && verdicts.parts.some((p) => !p.locked);
  const bodyHidden = reviewMode && !claimDetailOpen;

  /**
   * หัวหน้าต่างใบงาน (หน้าตาใหม่ พ.ย. 69 ตามแบบที่เจ้าของงานส่งมา):
   *   แถวบน = เลขใบงาน + ป้าย (สถานะ · ด่วน · ย้อนขั้น · หัวหน้าภาค) · ตัวใหญ่ = อาการ (ไม่มีอาการใช้ชื่อเรื่อง) · บรรทัดสาขา
   * ป้ายชุดเดิมจากหัวเรื่องในหน้า ย้ายขึ้นมาอยู่กับที่ — เลื่อนอ่านเนื้อหาแล้วยังรู้ว่าดูใบไหน รอใคร
   */
  const popHead = (
    <View style={styles.popHead}>
      <View style={styles.popRow}>
        <View style={styles.codeChip}>
          <Text style={styles.codeChipText}>{order.code}</Text>
        </View>
      {/* ระงับชั่วคราว (พ.ย. 69) — ป้ายแรกหลังเลขใบ: คนเปิดใบต้องรู้ก่อนว่าใบนี้พักอยู่ */}
      {order.hold ? (
        <View style={[styles.badge, styles.badgeHold]} accessibilityLabel="ป้ายระงับชั่วคราว">
          <Ionicons name="pause" size={12} color={colors.text} />
          <Text style={[styles.badgeText, { color: colors.text }]}>ระงับถึง {thaiDate(dayOfIso(order.hold.until))}</Text>
        </View>
      ) : null}
      {partsOut.length ? (
        <View style={[styles.badge, styles.badgeOut]} accessibilityLabel="ป้ายอะไหล่หมด">
          <Text style={[styles.badgeText, { color: "#fff" }]}>● อะไหล่หมด</Text>
        </View>
      ) : (
        // รอลูกค้าจ่ายเงิน: ป้ายบอกจำนวนวันด้วย "รอลูกค้าจ่ายเงิน · 4 วัน" · เกินเส้นเป็นแดง (ตัวอย่างที่ตกลง 5 พ.ย. 69)
        <View
          style={[styles.statusChip, { backgroundColor: closedOk ? colors.doneSoft : payLate ? colors.dangerSoft : tone.bg }, payLate && styles.statusChipLate]}
          accessibilityLabel={`ป้ายสถานะ ${payChipText(order.statusLabel, payNow)}`}
        >
          <View style={[styles.statusDot, { backgroundColor: payLate ? colors.dangerInk : tone.fg }]} />
          <Text style={[styles.statusChipText, { color: payLate ? colors.dangerInk : tone.fg }]}>{payChipText(order.statusLabel, payNow)}</Text>
        </View>
      )}
      {urgent ? <UrgentBadge /> : null}
      {order.rolledBack ? (
        <View style={[styles.badge, styles.badgeBack]} accessibilityLabel="ป้ายย้อนขั้น">
          <Text style={[styles.badgeText, { color: "#fff" }]}>↩ ย้อนขั้นมา</Text>
        </View>
      ) : null}
      {/*
        หัวหน้าภาคที่รับผิดชอบใบนี้ — ติดหัวใบงานทุกใบทุกขั้น (เจ้าของงานขอ ต.ค. 69) ไม่ใช่แค่ตอนรอหัวหน้าภาค
        ช่างหรือแอดมินเปิดใบไหนก็รู้ว่าเรื่องนี้ต้องคุยกับใคร · ไม่มีใครดูแล = แดง ให้ไปตั้งที่สิทธิ์ผู้ใช้/ทีมช่าง
      */}
      {order.supervisors ? (
        <View
          style={[styles.tagLine, styles.supTag, !order.supervisors.length && styles.supTagNone]}
          accessibilityLabel={`หัวหน้าภาค ${order.supervisors.map((s) => s.name).join(", ") || "ยังไม่มีคนรับ"}`}
        >
          <Ionicons
            name="person-circle-outline"
            size={15}
            color={order.supervisors.length ? colors.primaryInk : colors.dangerInk}
          />
          <Text style={[styles.tagLineText, { color: order.supervisors.length ? colors.primaryInk : colors.dangerInk }]}>
            หัวหน้าภาค · {order.supervisors.map((s) => s.name).join(", ") || "ยังไม่มีคนรับ"}
          </Text>
        </View>
      ) : null}
      </View>
      <Text style={[styles.popTitle, headingFont]} numberOfLines={2}>
        {order.symptom?.trim() || order.title}
      </Text>
      {/*
        บรรทัดสาขา + ป้ายประเภทงาน/เครื่องแบบกรอบเดิม (เจ้าของงานขอให้เด่นเหมือนแบบเก่า 6 พ.ย. 69)
        รหัส+ชื่อสาขาตัวหนาสีเข้ม (เจ้าของงานขอให้เน้น) — คนเปิดใบมาถามก่อนเลยว่าสาขาไหน · ภาคเป็นข้อมูลรองสีจาง
        ข้อความสาขาตัดคำเอง — จอแคบหักบรรทัดตามคำ ป้ายต่อท้ายขึ้นบรรทัดใหม่ทั้งชิ้น
      */}
      <View style={styles.popRow}>
        <Text style={[styles.popBranch, styles.popLineFlex]}>
          <Ionicons name="location" size={16} color={colors.primary} /> {order.branchCode} · {order.branchName}
          {order.region ? <Text style={styles.popLine}>{`  ·  ${order.region}`}</Text> : null}
        </Text>
        <View style={styles.tagLine}>
          <Text style={styles.tagLineText}>{order.jobTypeLabel}</Text>
        </View>
        {order.machineCode ? (
          <View style={styles.tagLine} accessibilityLabel={`เครื่อง ${machineTag(order.machineCode, order.machineCapacityKg)}`}>
            <Text style={styles.tagLineText}>เครื่อง {machineTag(order.machineCode, order.machineCapacityKg)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
  // ขั้นปัจจุบันบนแถบ — แถบย้อนขั้นบอกว่าย้อนมาที่ขั้นที่เท่าไร (ไม่มีแถบท้ายหน้าต่างแล้ว ปุ่มของขั้นอยู่ในการ์ดขั้นที่เดียว)
  const nowAt = path.rows.findIndex((r) => r.state === "now" || r.state === "loop");
  /**
   * ระงับชั่วคราว/กลับมาทำต่อ — แอดมิน (ไม่ใช่ Admin Spare Part) และหัวหน้าภาคของใบนี้ (เจ้าของงานเลือก พ.ย. 69)
   * หัวหน้าภาคที่เห็นใบแบบดูอย่างเดียว (จ่ายข้ามทีม · ใบ IT นอกความดูแล) ไม่มีปุ่ม — เซิร์ฟเวอร์กันอีกชั้น (holdGate)
   */
  const canHold =
    !!user && !user.viewAs && !done && ((user.role === "ADMIN" && !user.partsAdmin) || (user.role === "SUPERVISOR" && !viewOnly));
  const holdLog = order.hold ? [...order.logs].filter((l) => l.action === "HOLD").sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)[0] : undefined;
  async function resumeNow() {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/work-orders/${order!.id}/resume`, {});
      await reloadWithNotice("กลับมาทำต่อแล้ว — ใบกลับเข้ากล่องงาน");
    } catch (e) {
      showAlert("ทำไม่ได้", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PopupScreen
      title={order.code}
      subtitle="ใบงานซ่อม"
      head={popHead}
      backLabel={`ใบงาน ${order.code}`}
      startMaximized
      instant={instant}
      // แชทใบงาน (พ.ย. 69) — มาจากรายการแชทบนแถบหัว (open: "chat") = เปิดหน้าต่างแชทเลย
      overlay={
        <ChatBubble
          key={order.id}
          orderId={order.id}
          code={order.code}
          branch={`${order.branchCode} ${order.branchName}`}
          startOpen={route.params.open === "chat"}
        />
      }
      right={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {user?.superAdmin ? (
            <TimelineButton label={`ไทม์ไลน์ ${order.code}`} onPress={() => setTimelineOpen(true)} />
          ) : null}
          {/*
            ปุ่ม ? ของหน้าต่างใบงาน — ทุกคน (หน้าต่างนี้คือหน้าหนึ่ง): ช่างเล่นวิธีใช้ "ใบงาน" · คนอื่นเปิดหน้าสอนการใช้งาน
            (แอดมิน/หัวหน้าภาคเรียนหน้าใบงานในวิธีใช้ "ใบงานซ่อม" ของตัวเอง) · บนมือถือหน้าต่างเต็มจอ ปุ่ม ? บนแถบหัวถูกบัง
          */}
          <HowToButton compact target="order.help" />
        </View>
      }
    >
    {timelineOpen ? (
      <TimelineModal target={{ kind: "wo", id: order.id, code: order.code }} onClose={() => setTimelineOpen(false)} />
    ) : null}
    {backfilling ? (
      <BackfillCloseModal
        order={order}
        stages={stages.map((x) => x.value)}
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
    {trashing ? (
      <TrashOrderModal
        order={{
          id: order.id,
          code: order.code,
          branchCode: order.branchCode,
          jobTypeLabel: order.jobTypeLabel,
          machineCode: order.machineCode,
          closedAt: order.closedAt,
          counts: {
            parts: order.waitingParts.length + order.parts.length,
            files: files.length,
            logs: order.logs.length,
            workers: order.workers.length,
          },
        }}
        onClose={() => setTrashing(false)}
        onDone={trashed}
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
    {brandFixOpen ? (
      <MachineBrandModal
        order={order}
        onClose={() => setBrandFixOpen(false)}
        onDone={async (brand, fromReport) => {
          setBrandFixOpen(false);
          await load();
          showAlert(
            "บันทึกยี่ห้อเครื่องแล้ว",
            fromReport
              ? `เครื่อง ${order.machineCode}: ${brand} · ยี่ห้อนี้มาจากรายงานเครื่อง — แก้ในไฟล์รายงานด้วย ไม่งั้นนำเข้าครั้งหน้าทับกลับ`
              : `เครื่อง ${order.machineCode}: ${brand}`
          );
        }}
      />
    ) : null}
    {remoteClosing ? (
      <RemoteCloseModal
        order={order}
        onClose={() => setRemoteClosing(false)}
        onDone={async () => {
          setRemoteClosing(false);
          setFilesKey((k) => k + 1);
          await reloadWithNotice("ปิดงานแล้ว (แก้จากระยะไกล)");
        }}
      />
    ) : null}
    {supClosing ? (
      <SupervisorCloseModal
        order={order}
        technicians={technicians}
        subTeams={teams.filter((t) => t.outsource).map((t) => t.name)}
        myTeams={teams.filter((t) => t.mine).map((t) => t.name)}
        onClose={() => setSupClosing(false)}
        onDone={async () => {
          setSupClosing(false);
          await reloadWithNotice();
        }}
      />
    ) : null}
    <ScrollView
      ref={pageScroll}
      style={styles.container}
      contentContainerStyle={styles.content}
      onLayout={(e) => setBodyWidth(e.nativeEvent.layout.width)}
    >
      {/* ผลการตรวจที่เพิ่งส่ง — ขึ้นบนสุดจนกว่าจะออกจากใบ (ใบกลับมารอตรวจอีกครั้งก็หายเอง) */}
      {reviewOutcome && !reviewMode ? (
        <ReviewDone
          outcome={reviewOutcome}
          trail={claimTrailOf(order.claims, order.logs)}
          onNext={() => void nextClaim()}
          busy={nexting}
          // ดาวน์โหลดหลักฐานส่งผู้ขายหลังอนุมัติ (เคลมก้อน 6) — เฉพาะผู้ตรวจ (เซิร์ฟเวอร์ให้เฉพาะ Admin Spare Part / Super Admin)
          downloads={canReviewClaims(me) ? { workOrderId: order.id, code: order.code } : null}
        />
      ) : null}
      {reviewMode ? (
        <ClaimReview
          order={order}
          v={verdicts}
          readOnly={!canDecideClaims(me)}
          files={files}
          filesState={filesStatus}
          onRetryFiles={reloadFiles}
          detailOpen={claimDetailOpen}
          onToggleDetail={() => setClaimDetailOpen((o) => !o)}
          onOpenOrder={(oid) => navigation.push("WorkOrderDetail", { id: oid })}
        />
      ) : null}
      {/*
        หน้าตรวจเคลม: เนื้อใบงานที่เหลือพับไว้ด้วยการซ่อน (ไม่ถอดออก) — การ์ดไฟล์แนบข้างในเป็นคนโหลดรายการไฟล์
        ที่หน้าตรวจใช้แสดงหลักฐาน ถอดออกแล้วหน้าตรวจจะไม่มีรูป/วิดีโอสักไฟล์
      */}
      <View style={[styles.bodyWrap, bodyHidden && styles.bodyHidden]}>
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
      {/*
        หน้าใบงานตามแบบที่เจ้าของงานส่งมา (ต.ค. 69): หัวเรื่อง + ป้าย · การ์ดขั้นตอน · สองคอลัมน์
        ซ้าย = ขั้นปัจจุบัน (ทำอะไร กับอะไหล่ไหน ปุ่มเดียวท้ายการ์ด) · ขวา = ข้อมูลอ้างอิง ประวัติ เครื่องมือ
        คนเปิดใบงานมาเพื่อทำขั้นถัดไป จึงรวมอาการ/อะไหล่ไว้ในการ์ดเดียวกับปุ่ม ไม่ต้องเลื่อนไปมา
        จอแคบเรียงเป็นคอลัมน์เดียวตามลำดับเดียวกัน
      */}
      <View style={styles.hero}>
        {/* หัวเรื่อง + ป้ายย้ายขึ้นไปเป็นหัวหน้าต่าง (หน้าตาใหม่ พ.ย. 69) — ดู popHead ข้างบน */}
        {/* ลิงก์รูป/วิดีโอจากฟอร์มแจ้งซ่อมย้ายไปอยู่ในการ์ดรูปหน้างาน — ที่นี่เหลือแต่ข้อความ */}
        {formDetail.text ? <Text style={styles.detail}>{formDetail.text}</Text> : null}
        {/*
          ใบที่ลิงก์กัน — ใบรออะไหล่กับใบเดิมเป็นงานเดียวกันที่แบ่งเป็นสองรอบ
          ต้องกระโดดไปมาได้ ไม่งั้นคนดูใบหนึ่งไม่รู้ว่าอีกครึ่งของงานอยู่ไหน
        */}
        {order.parent || order.children.length > 0 ? (
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
          </View>
        ) : null}
      </View>

      {/*
        ระงับชั่วคราว (พ.ย. 69) — บอกก่อนอย่างอื่นว่าใบนี้พักไว้ถึงวันไหน เพราะอะไร ใครระงับ · ใบไม่อยู่ในกล่องงานจนถึงวันนั้น
        กด "กลับมาทำต่อ" ก่อนกำหนดได้ (คนเดียวกับที่ระงับได้)
      */}
      {order.hold ? (
        <View style={[styles.rbBanner, styles.holdBanner]} accessibilityLabel="กล่องระงับชั่วคราว">
          <View style={[styles.rbIcon, styles.holdIcon]}>
            <Ionicons name="pause" size={16} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
            <Text style={[styles.rbTitle, styles.holdText]}>ระงับชั่วคราวถึง {thaiDate(dayOfIso(order.hold.until))} — ไม่อยู่ในกล่องงานและหยุดนับวันค้างจนถึงวันนั้น</Text>
            <Text style={[styles.rbText, styles.holdText]}>
              เหตุผล: <Text style={styles.rbStrong}>{order.hold.reason || "—"}</Text>
              {holdLog ? ` · ระงับโดย ${holdLog.byName ?? "—"} เมื่อ ${whenShort(holdLog.createdAt)}` : ""}
            </Text>
          </View>
          {canHold ? (
            <TouchableOpacity style={[styles.rbLink, styles.holdLink]} onPress={() => void resumeNow()} disabled={busy} accessibilityLabel="กลับมาทำต่อ">
              <Text style={[styles.rbLinkText, styles.holdText]}>กลับมาทำต่อ</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/*
        ย้อนขั้นมา — แถบบนสุดเหนือแถบขั้นตอน (พ.ย. 69 ตามแบบ: "ย้อนกลับมาขั้นตอนที่ 2 เรียบร้อยแล้ว")
        คนที่เปิดใบต้องรู้ก่อนอย่างอื่นว่าใบนี้ถอยมา เพราะอะไร ใครย้อน · ข้อมูลเดิมไม่หาย (rollbackPrefill) · หายเองเมื่อกดผ่านขั้นนี้
      */}
      {order.rolledBack ? (
        <View style={styles.rbBanner} accessibilityLabel="กล่องย้อนขั้น">
          <View style={styles.rbIcon}>
            <Ionicons name="arrow-undo" size={16} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
            <Text style={styles.rbTitle}>
              ย้อนกลับมาขั้นตอนที่ {path.current.no || "—"} เรียบร้อยแล้ว ({nowAt >= 0 ? path.rows[nowAt].label : stageNow?.label ?? order.statusLabel})
            </Text>
            <Text style={styles.rbText}>
              {order.rolledBack.reason ? `เนื่องจาก${order.rolledBack.reason} · ` : ""}ดำเนินการโดย{" "}
              <Text style={styles.rbStrong}>{order.rolledBack.byName ?? "—"}</Text> เมื่อ {whenShort(order.rolledBack.at)}
              {order.rolledBack.fromLabel ? ` · ย้อนจาก “${order.rolledBack.fromLabel}”` : ""}
            </Text>
          </View>
          <View style={styles.rbStatus}>
            <Text style={styles.rbStatusText}>
              สถานะ: {partsOut.length ? `อะไหล่หมด ${partsOut.length} รายการ` : order.workStatusLabel ?? order.statusLabel}
            </Text>
          </View>
          <TouchableOpacity style={styles.rbLink} onPress={goHistory} accessibilityLabel="ดูบันทึกเหตุผลการย้อนขั้น">
            <Text style={styles.rbLinkText}>ดูบันทึกเหตุผล</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={[card, styles.stepsCard]}>
        <View style={styles.stepsHead}>
          <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
            <View style={styles.stepsTitleRow}>
              <Text style={[styles.stepsTitle, headingFont]}>ขั้นตอนใบงาน</Text>
              {/* ระหว่างตรวจหน้างานยังไม่ถึงขั้นที่ 1 — บอกว่าอยู่รอบตรวจย่อยไหน ไม่ใช่ "ขั้นที่ 1" ซึ่งชวนให้คิดว่าระบุอะไหล่แล้ว */}
              {path.current.sub || path.current.no > 0 ? (
                <View style={[styles.stepPill, (partsOut.length > 0 || !!order.rolledBack) && styles.stepPillBad]}>
                  <Text style={[styles.stepPillText, (partsOut.length > 0 || !!order.rolledBack) && styles.stepPillTextBad]}>
                    {path.current.sub
                      ? `ตรวจหน้างาน (ย่อย ${path.current.sub.no}/${path.current.sub.total}) ก่อนขั้นที่ 1`
                      : `ขั้นที่ ${path.current.no} จาก ${path.current.total}`}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          {order.rolledBack ? (
            <TouchableOpacity style={[styles.stepHist, styles.stepHistBack]} onPress={goHistory} accessibilityLabel="ประวัติการย้อนขั้นตอน">
              <Ionicons name="arrow-undo-outline" size={15} color={colors.warningInk} />
              <Text style={[styles.stepHistText, { color: colors.warningInk }]}>ประวัติการย้อนขั้นตอน</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.stepHist} onPress={goHistory} accessibilityLabel={path.track ? "ประวัติตรวจหน้างาน" : "ประวัติขั้นตอน"}>
            <Text style={styles.stepHistText}>{path.track ? "ประวัติตรวจหน้างาน" : "ประวัติขั้นตอน"}</Text>
          </TouchableOpacity>
          {canStepBack ? (
            <TouchableOpacity style={styles.stepBack} onPress={() => setStageBackOpen(true)} activeOpacity={0.7}>
              <Ionicons name="arrow-undo-outline" size={15} color={colors.warningInk} />
              <Text style={styles.stepBackText}>ย้อนขั้นตอน</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {/*
          ขั้นตอนงานอยู่บนสุด ในการ์ดหัวใบงานเลย ตามตัวอย่างที่เจ้าของงานเลือก —
          คนเปิดใบงานส่วนใหญ่เปิดมาเพื่อดูว่าถึงไหนแล้วทำขั้นถัดไป
          กดวงกลมขั้นปัจจุบันได้เหมือนกดปุ่ม ขั้นที่ทำแล้วกดดูว่าใครทำเมื่อไร
        */}
        {/*
          จอกว้าง: ทุกช่องแบ่งความกว้างเท่ากัน ไม่ต้องเลื่อน
          จอแคบ (ช่องละไม่ถึง ~74 px): ปัดซ้ายขวาด้วยนิ้ว ทุกขั้นขนาดเต็มพร้อมชื่อ — เจ้าของงานเปลี่ยนจากแบบย่อวง/ซ่อนชื่อ (6 พ.ย. 69)
          เพราะแบบย่อเหลือแต่เลข อ่านไม่ออกว่าขั้นถัดไปคืออะไร
          โชว์เฉพาะขั้นที่ใบนี้ต้องผ่าน (แบบที่ตกลง ต.ค. 69 รอบสอง) — ใบส่วนใหญ่ 7 ขั้น ไม่ใช่ 12 ขั้นที่ครึ่งหนึ่งขึ้นว่าข้าม
          ตรวจหน้างานเป็นรอบแยกเหนือแถบ · โอนคลังอื่นเป็นขั้นย่อยใต้แถบ · "ข้าม N" เหลือเฉพาะขั้นบนทางที่ไม่ได้ทำจริง
        */}
        {(() => {
          const rolledFrom = order.rolledBack?.from ?? null;
          type PathRow = (typeof path.rows)[number];
          // ขั้นที่ข้ามติดกันรวมเป็นกลุ่มเดียว
          const items: ({ kind: "step"; row: PathRow } | { kind: "skip"; rows: PathRow[]; at: number })[] = [];
          path.rows.forEach((r, i) => {
            const last = items[items.length - 1];
            if (r.state === "skipped" && last?.kind === "skip") last.rows.push(r);
            else if (r.state === "skipped") items.push({ kind: "skip", rows: [r], at: i });
            else items.push({ kind: "step", row: r });
          });
          // ช่องละไม่ถึง ~74 px ชื่อขั้นภาษาไทยขึ้นบรรทัดละสองสามตัวอักษร อ่านไม่ออก — ให้ช่องกว้างเต็มแล้วปัดดูแทน
          const swipe = stepBarW > 0 && stepBarW / items.length < 74;
          const nowAt = items.findIndex((it) => it.kind === "step" && (it.row.state === "now" || it.row.state === "loop"));
          const opened = items.find((it) => it.kind === "skip" && it.at === skipOpen);
          const issueSub = path.rows.find((r) => r.key === "ISSUE")?.sub;
          return (
            // ชื่อของทั้งส่วน (รอบตรวจ + แถบ + ขั้นย่อย) — คนใช้โปรแกรมอ่านจอกับเทสต์ (stageorder · inspect-confirm) หาจากชื่อนี้
            <View accessibilityLabel="ขั้นตอนงาน" {...howtoTarget("order.steps")}>
              {/*
                รอบตรวจหน้างาน — เหนือแถบ ไม่นับเป็นขั้นหลัก (แบบที่ตกลง ต.ค. 69 รอบสอง)
                เดิมเป็นสามขั้นต่อจากขั้น 1 และขั้น 1 ติ๊กว่าระบุอะไหล่แล้ว ทั้งที่เลือกส่งตรวจเพราะยังระบุไม่ได้
              */}
              {path.track ? (
                <View style={styles.trackRow} accessibilityLabel="ตรวจหน้างาน (วนกลับ)">
                  <View style={styles.trackPill}>
                    <Text style={styles.trackPillText}>
                      ↻ ประวัติการตรวจหน้างาน{path.track.rounds > 1 ? ` (รอบ ${path.track.rounds})` : ""}:
                    </Text>
                  </View>
                  {path.track.items.map((t, i) => (
                    <View key={t.key} style={styles.trackStep}>
                      {i > 0 ? <View style={[styles.miniLine, t.state !== "future" && styles.stepLineDone]} /> : null}
                      <TouchableOpacity
                        style={styles.trackItem}
                        onPress={() => pressStep(t.key, t.state)}
                        activeOpacity={0.7}
                        accessibilityLabel={t.a11y}
                      >
                        <View
                          style={[
                            styles.miniDot,
                            t.state === "done" && styles.stepDotDone,
                            t.state === "now" && { backgroundColor: tone.fg, borderColor: tone.fg },
                            t.state === "skipped" && styles.stepDotSkipped,
                            rolledFrom === t.key && styles.stepDotFrom,
                          ]}
                        >
                          {t.state === "now" ? <StepPulse size={18} color={tone.fg} /> : null}
                          {t.state === "done" ? <Ionicons name="checkmark" size={11} color="#fff" /> : null}
                        </View>
                        <Text
                          style={[
                            styles.trackLabel,
                            t.state === "now" && [styles.stageLabelNow, { color: tone.fg }],
                            t.state === "future" && styles.stageLabelFuture,
                            t.state === "skipped" && [styles.stageLabelFuture, styles.stageLabelSkipped],
                          ]}
                        >
                          {t.label}
                        </Text>
                        {t.state === "now" && t.actorLabel ? <Text style={styles.stageActor}>{t.actorLabel}</Text> : null}
                        {t.note ? <Text style={[styles.stageActor, styles.trackNote]}>{t.note}</Text> : null}
                      </TouchableOpacity>
                    </View>
                  ))}
                  <Text style={styles.trackBack}>→ กลับไประบุอะไหล่</Text>
                </View>
              ) : null}
              <View onLayout={(e) => setStepBarW(e.nativeEvent.layout.width)}>
              <ScrollView
                ref={stepScroll}
                horizontal
                scrollEnabled={swipe}
                showsHorizontalScrollIndicator={false}
                // จอกว้างไม่เลื่อน: เนื้อในกว้างเท่ากรอบพอดี ช่องแบ่งเท่ากันแบบเดิม (ไม่งั้นหดกองซ้าย)
                contentContainerStyle={swipe ? styles.stepsSwipe : { width: stepBarW || "100%" }}
                // วางขั้นปัจจุบันไว้กลางแถบตอนเปิดใบ (ขั้นท้าย ๆ จะไม่ซ่อนอยู่นอกจอ)
                onContentSizeChange={() =>
                  swipe && nowAt > 0 && stepScroll.current?.scrollTo({ x: Math.max(0, nowAt * STEP_SWIPE_W - (stepBarW - STEP_SWIPE_W) / 2), animated: false })
                }
              >
              <View style={[styles.steps, swipe ? styles.stepsRow : styles.stepsFit]}>
                {items.map((it, k) => {
                  if (it.kind === "skip") {
                    const isOpen = skipOpen === it.at;
                    return (
                      <TouchableOpacity
                        key={`skip-${it.at}`}
                        style={styles.stepSkipGroup}
                        activeOpacity={0.7}
                        onPress={() => setSkipOpen(isOpen ? null : it.at)}
                        accessibilityLabel={`ข้าม ${it.rows.length} ขั้น`}
                      >
                        {k > 0 ? <View style={styles.stepLine} /> : null}
                        <View style={[styles.stepSkipPill, isOpen && styles.stepSkipPillOn]}>
                          <Text style={styles.stepSkipText}>ข้าม {it.rows.length}</Text>
                        </View>
                        <Text style={styles.stageActor}>{isOpen ? "ปิด" : "กดดู"}</Text>
                      </TouchableOpacity>
                    );
                  }
                  const row = it.row;
                  const { state } = row;
                  const current = state === "now" || state === "loop";
                  const showLabel = true;
                  const fromHere = !!rolledFrom && row.stages.includes(rolledFrom);
                  return (
                    <TouchableOpacity
                      key={row.key}
                      style={[styles.step, swipe && styles.stepSwipe]}
                      activeOpacity={0.7}
                      onPress={() => pressStep(row.key, state)}
                      accessibilityLabel={row.a11y}
                    >
                      {k > 0 ? (
                        <View
                          style={[styles.stepLine, (state === "done" || state === "now") && styles.stepLineDone]}
                        />
                      ) : null}
                      <View
                        style={[
                          styles.stepDot,
                          state === "done" && styles.stepDotDone,
                          // วงขั้นปัจจุบันเป็นสีของคนที่ใบงานรอ ตรงกับป้ายสถานะในรายการ
                          state === "now" && [styles.stepDotNow, { backgroundColor: tone.fg, borderColor: tone.fg }],
                          state === "now" && partsOut.length > 0 && [styles.stepDotOut, styles.stepDotOutRing],
                          // ขั้น 1 ระหว่างตรวจหน้างาน — ยังไม่ได้ทำ ไม่ติ๊ก ไม่มีคลื่น แค่วงเส้นประสีคนที่ใบรอ
                          state === "loop" && [styles.stepDotLoop, { borderColor: tone.fg }],
                          // ขั้นที่ย้อนมาจาก — วงเส้นประสีส้ม คู่กับกล่อง "ย้อนขั้นมา" ข้างล่าง
                          fromHere && styles.stepDotFrom,
                        ]}
                      >
                        {state === "now" ? <StepPulse size={40} color={partsOut.length ? colors.danger : tone.fg} /> : null}
                        {state === "done" ? (
                          <Ionicons name="checkmark" size={20} color="#fff" />
                        ) : state === "now" && partsOut.length ? (
                          <Text style={[styles.stepNum, headingFont, styles.stepNumNow]}>!</Text>
                        ) : fromHere ? (
                          // สัญลักษณ์ย้อนขั้นตามแบบที่เจ้าของงานเลือก (พ.ย. 69): ลูกศรย้อนเส้นบางสีเหลืองในวงเส้นประเหลือง
                          <Ionicons name="return-up-back-outline" size={19} color={colors.warning} />
                        ) : state === "loop" ? (
                          <Text style={[styles.stepNum, headingFont, { color: tone.fg }]}>↻</Text>
                        ) : (
                          <Text style={[styles.stepNum, headingFont, state === "now" && styles.stepNumNow]}>
                            {row.number}
                          </Text>
                        )}
                      </View>
                      {showLabel ? (
                        <Text
                          style={[
                            styles.stageLabel,
                            state === "now" && [styles.stageLabelNow, { color: partsOut.length ? colors.dangerInk : tone.fg }],
                            state === "future" && styles.stageLabelFuture,
                            state === "done" && styles.stageLabelDone,
                            fromHere && state === "future" && styles.stageLabelFrom,
                          ]}
                        >
                          {row.label}
                        </Text>
                      ) : null}
                      {showLabel && row.note ? <Text style={styles.stageActor}>{row.note}</Text> : null}
                      {/* ขั้นที่ทำแล้ว: ใครทำ วันไหน (พ.ย. 69) — กดวงยังเปิดรายละเอียดเต็มเหมือนเดิม */}
                      {state === "done" && row.key === "ARRIVE" ? (() => {
                        // เข้างานแล้ว: ใครถึง กี่โมง ห่างร้านเท่าไร — จากประวัติ "ช่างถึงหน้างาน" ล่าสุด
                        const a = [...order.logs].filter((l) => l.action === "ARRIVED").sort((x, y) => y.createdAt.localeCompare(x.createdAt) || y.id - x.id)[0];
                        if (!a) return null;
                        const where = (a.note ?? "").replace(/^ถึงหน้างาน\s*(·\s*)?/, "").replace(/^\((.*?)\)/, "$1");
                        return (
                          <>
                            <Text style={styles.stageActor}>{`${a.byName ?? "ช่าง"} · ${whenShort(a.createdAt)}`}</Text>
                            {where ? <Text style={styles.stageActor}>{where}</Text> : null}
                          </>
                        );
                      })() : state === "done" ? (() => {
                        const by = stepDoneBy(row.stages, order.logs);
                        return by ? <Text style={styles.stageActor}>{by}</Text> : null;
                      })() : null}
                      {/*
                        สถานะย่อย — ตอนนี้ติดอะไรอยู่ในขั้นนี้ (เจ้าของงานขอ ต.ค. 69)
                        ขึ้นเฉพาะตอนบอกอะไรเพิ่มจากชื่อขั้น: รอลูกค้า (คนตั้งเอง) ทุกขั้น · อะไหล่หมดใช้ป้ายแดงข้างล่าง
                      */}
                      {fromHere ? (
                        <View style={styles.stepFromPill} accessibilityLabel="ขั้นที่ย้อนมา">
                          <Text style={styles.stepFromPillText}>ย้อนจากตรงนี้{row.actorLabel ? ` (${row.actorLabel})` : ""}</Text>
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
                      ) : showLabel && row.actorLabel && state === "now" ? (
                        // ขั้นปัจจุบัน: ป้าย "แอดมิน (ปัจจุบัน)" สีของคนที่ใบรอ
                        <View style={[styles.nowPill, { backgroundColor: tone.bg }]}>
                          <Text style={[styles.nowPillText, { color: tone.fg }]}>{row.actorLabel} (ปัจจุบัน)</Text>
                        </View>
                      ) : showLabel && row.actorLabel && state !== "done" && state !== "skipped" && !fromHere ? (
                        <Text style={styles.stageActor}>{row.actorLabel}</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
              </ScrollView>
              </View>
              {/*
                ขั้นย่อยเบิกอะไหล่ของใบที่โอนจากคลังอื่น — ไม่นับเป็นขั้นหลัก (แบบที่ตกลง) แต่ต้องเห็นว่าของถึงไหน
                โชว์ต่อแม้โอนเสร็จแล้ว ประวัติว่าของมาจากไหนยังอยู่
              */}
              {issueSub ? (
                <View style={styles.subTrack} accessibilityLabel="ขั้นย่อยเบิกอะไหล่">
                  <Text style={styles.subTrackHead}>เบิกอะไหล่ · โอนจากคลังอื่น:</Text>
                  {issueSub.map((s, i) => (
                    <TouchableOpacity
                      key={`${s.key}-${i}`}
                      style={styles.subItem}
                      onPress={() => pressStep(s.key, s.state)}
                      activeOpacity={0.7}
                      accessibilityLabel={s.a11y}
                    >
                      <Text
                        style={[
                          styles.subItemText,
                          s.state === "done" && { color: colors.successInk },
                          s.state === "now" && [styles.stageLabelNow, { color: tone.fg }],
                          (s.state === "future" || s.state === "skipped") && styles.stageLabelFuture,
                          s.state === "skipped" && styles.stageLabelSkipped,
                          rolledFrom === s.key && { color: colors.rollbackInk },
                        ]}
                      >
                        {s.state === "done" ? "✓" : s.state === "now" ? "●" : "○"} {s.label}
                      </Text>
                      {s.state === "now" && s.actorLabel ? <Text style={styles.stageActor}> · {s.actorLabel}</Text> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              {opened && opened.kind === "skip" ? (
                <View style={styles.stepSkipList} accessibilityLabel="ขั้นที่ข้าม">
                  <Text style={styles.stepSkipListHead}>ใบนี้ไม่ได้ผ่าน {opened.rows.length} ขั้น:</Text>
                  {opened.rows.map((r) => (
                    // ขีดฆ่าชื่อ ให้แยกจาก "ยังไม่ถึง" ได้ — เทสต์ stageorder อ่านเส้นนี้ด้วย
                    <Text key={r.key} style={[styles.stageLabelFuture, styles.stageLabelSkipped, styles.stepSkipItem]}>
                      {r.action}
                      {r.why ? ` — ${r.why}` : ""}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })()}
        {/*
          แถวท้ายแถบขั้นตอน (พ.ย. 69 ตามแบบ): ความเร่ง/พักรออะไหล่ · อยู่ขั้นนี้มานานเท่าไร · ใครต้องทำตอนนี้
          ไม่มีคำว่า SLA — ระบบยังไม่มีเกณฑ์เวลาต่อขั้น (ถามเจ้าของงานในตัวอย่าง)
        */}
        {!done ? (
          <View style={styles.stepsFoot}>
            <View style={[styles.slaChip, partsOut.length ? styles.slaChipBad : urgent ? styles.slaChipBad : styles.slaChipOk]}>
              <Text style={[styles.slaChipText, { color: partsOut.length || urgent ? colors.dangerInk : colors.successInk }]}>
                {partsOut.length ? "หยุดรอจัดหาอะไหล่" : order.priorityLabel}
              </Text>
            </View>
            <Text style={styles.stepsFootText}>
              ระยะเวลาสะสมในขั้นตอนนี้: <Text style={styles.stepsFootStrong}>{stayText(Date.now() - pausedFrom(stageEnteredAt(order), order.holdSpan).getTime())}</Text>
              {order.hold ? " (ระงับอยู่ — หยุดนับ)" : ""}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.stepsFootText}>
              ผู้รับผิดชอบปัจจุบัน: <Text style={styles.stepsFootStrong}>{order.stageActor === "SUPERVISOR"
    ? `${order.supervisors?.map((x) => x.name).join(", ") || "ยังไม่มีคนรับ"} (หัวหน้าภาค)`
    : order.stageActor === "EMPLOYEE"
      ? `${order.assignedToName ?? (order.assignedTeam ? `ทีม${order.assignedTeam}` : "ช่าง")} (ช่าง)`
      : payNow
        ? "ลูกค้า (แอดมินแนบบิลเมื่อเงินเข้า)"
        : order.stageActorLabel ?? "—"}</Text>
            </Text>
          </View>
        ) : null}
      </View>

      <View style={wide ? styles.cols : styles.stack}>
      <View style={wide ? styles.colMain : styles.stack}>
      {/* เครื่องกลับมาแล้วบนกระดาน — ทางลัดปิดใบงานอยู่ตรงนี้ เพราะเป็นจังหวะที่คนเปิดมาเพื่อปิด */}
      {recovered && canEnd ? (
        <View style={[card, styles.recovered]} accessibilityLabel="กล่องเครื่องกลับมาแล้ว">
          <View style={styles.recoveredIcon}>
            <Ionicons name="checkmark" size={18} color={colors.success} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.recoveredTitle}>เครื่องกลับมาทำงานแล้ว</Text>
            <Text style={styles.recoveredText}>
              เคสบนกระดานปิดไปแล้ว เพราะเครื่องหายไปจากไฟล์รายงาน — ถ้าไม่ต้องซ่อมต่อ ปิดใบงานนี้ได้เลย
            </Text>
          </View>
          <TouchableOpacity style={styles.recoveredBtn} onPress={() => setSupClosing(true)} accessibilityLabel="ปิดใบงาน">
            <Ionicons name="checkmark-circle-outline" size={17} color={colors.navy} />
            <Text style={styles.recoveredBtnText}>ปิดใบงาน</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {/*
        ใบที่ปิดแล้วไม่ต้องขึ้นการ์ดนี้ เพราะคำตอบเดียวกันไปอยู่ในการ์ดผลการทำงาน
        ซึ่งเป็นที่ที่คนเปิดดูใบที่ปิดแล้วมองหาอยู่แล้ว — สองการ์ดที่พูดเรื่องเดียวกัน
        คือการบังคับให้คนอ่านสองรอบเพื่อรู้เท่าเดิม
      */}
      {order.outageId !== null && !order.closedAt && !(recovered && canEnd) ? (
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


      <View style={[card, styles.nowCard, payNow && (payLate ? styles.nowCardPayLate : styles.nowCardPay)]} {...howtoTarget("order.now")}>
        {/* ไม่มีออร่าแดงรอบการ์ดใบด่วนแล้ว (เจ้าของงานเอาออก 6 พ.ย. 69) — ป้าย "ด่วน" บนหัวหน้าต่างบอกอยู่แล้ว */}
        <View style={styles.nowHead}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.nowEyebrow, { color: done ? colors.textMuted : tone.fg }]}>
              {/* รอลูกค้าจ่ายเงิน: ลูกบอลอยู่ที่ลูกค้า (แอดมินแค่แนบบิลตอนเงินเข้า) — หัวการ์ดตามตัวอย่าง "ขั้นปัจจุบัน · รอลูกค้า" */}
              {done ? "สถานะใบงาน" : payNow ? "ขั้นปัจจุบัน · รอลูกค้า" : `ขั้นปัจจุบัน · ${order.stageActorLabel ?? "—"}`}
              {/* ขั้นของหัวหน้าภาคบอกชื่อคนด้วย — เดิมขึ้นแค่บทบาท ไม่รู้ว่าต้องตามใคร (เจ้าของงานขอ ต.ค. 69) */}
              {!done && order.stageActor === "SUPERVISOR" && order.supervisors ? (
                order.supervisors.length ? (
                  <Text style={styles.nowWho}> · {order.supervisors.map((s) => s.name).join(", ")}</Text>
                ) : (
                  <Text style={[styles.nowWho, { color: colors.danger }]}> · ยังไม่มีคนรับ</Text>
                )
              ) : null}
            </Text>
            <Text style={[styles.nowTitle, headingFont]}>
              {/* สถานะเดิม งานที่รอเปลี่ยน (เลือกอะไหล่ตอนตรวจหน้างาน) — ชื่อขั้นจากตัวเลือกบอกงานเดิม ("ระบุอะไหล่" · "ตรวจหน้างาน") */}
              {done
                ? order.statusLabel
                : pickPending(order)
                  ? "คอนเฟิร์มอะไหล่"
                  : pickReturned(order)
                    ? "ตรวจหน้างาน — แก้รายการอะไหล่"
                    : order.status === "IN_PROGRESS"
                      ? // ขั้นช่างแยกสอง (พ.ย. 69) — ชื่อตามแถบ ไม่ใช่ชื่อรวม "เข้างาน/ปิดงาน" ของเซิร์ฟเวอร์
                        order.onSite
                        ? "ปิดงาน"
                        : isTech
                          ? "เข้างาน — กดถึงหน้างานเมื่อถึงร้าน"
                          : "เข้างาน — รอช่างถึงหน้างาน"
                      : stageNow?.action ?? stageNow?.label ?? order.statusLabel}
            </Text>
          </View>
          {/* "แก้ไขอาการ/สถานะ" ย้ายไปท้ายการ์ดเป็น "แก้ไขรายละเอียด" (พ.ย. 69 ตามแบบ) */}
        </View>
        {/*
          ขั้นรอลูกค้าจ่ายเงิน (เจ้าของงานเลือก 5 พ.ย. 69) — ส่งใบเสนอราคาเมื่อไร (เปิดใบเสนอราคาได้เลย) · รอมากี่วัน · การตามลูกค้า
          ทุกคนที่เปิดใบเห็น (หัวหน้าภาคตอบร้านได้ว่าติดที่ลูกค้า) · ฟอร์มตาม/ลูกค้าไม่ซ่อมอยู่ชิดแถวปุ่มท้ายการ์ด (PayWaitForms)
        */}
        {payNow ? (
          <PaymentWaitBox
            p={payNow}
            quoteCount={quoteFiles.length}
            quoteLabel={quoteFiles.length === 1 ? quoteFiles[0].fileName : `ใบเสนอราคา ${quoteFiles.length} ไฟล์`}
            onOpenQuote={() => setQuoteViewing(true)}
          />
        ) : null}
        {quoteViewing && quoteFiles.length ? (
          <ImageViewer workOrderId={order.id} items={quoteFiles} startIndex={0} onClose={() => setQuoteViewing(false)} />
        ) : null}
        {/*
          ตีกลับเคลม — ช่างต้องเห็นเหตุผลก่อนกดปิดงานอีกรอบ ไม่งั้นแนบของเดิมกลับไปแล้วโดนตีกลับซ้ำ
          ทุกชิ้นที่ถูกตีกลับ (ใบเดียวสองชิ้นอาจถูกตีกลับคนละเหตุผล) · ใบชิ้นเดียวขึ้นแค่เหตุผลเหมือนเดิม
        */}
        {rejectedRows.length ? (
          <View style={styles.claimRejected}>
            <Ionicons name="arrow-undo" size={16} color={colors.dangerInk} />
            <View style={{ flex: 1 }}>
              <Text style={styles.claimRejectedTitle}>Admin Spare Part ตีกลับใบเคลม — แก้แล้วปิดงานใหม่</Text>
              {rejectLines.map((l, i) => (
                <Text key={`${l.part}-${i}`} style={styles.claimRejectedText}>
                  {rejectPrefix ? `${l.part}: ` : ""}
                  {l.reason}
                </Text>
              ))}
            </View>
          </View>
        ) : null}

        {/* รอบเลือกอะไหล่ของช่าง — รอคอนเฟิร์ม (ฟ้า) · ถูกตีกลับ (แดง) · คอนเฟิร์มแล้ว (เขียว) ตามตัวอย่างที่เจ้าของงานอนุมัติ */}
        <PickBoxes order={order} role={user?.role} />

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
          ส่งกลับให้แอดมินตรวจสอบ (ต.ค. 69) — ขั้นตอนไม่เปลี่ยน แต่คนเปิดใบต้องเห็นว่ามีเรื่องค้างถามแอดมินอยู่
          หัวหน้าภาคยกเลิก/รับทราบได้ แอดมินตอบได้จากตรงนี้ (การ์ดในกล่องงานมีปุ่มเดียวกัน)
        */}
        {order.adminReview && !done ? (
          <View style={{ gap: spacing.sm }}>
            <AdminReviewBox review={order.adminReview} viewer={user?.role === "ADMIN" ? "admin" : user?.role === "SUPERVISOR" ? "supervisor" : "other"} />
            {user?.role === "SUPERVISOR" ? (
              <TouchableOpacity
                style={[styles.reviewAction, { borderColor: order.adminReview.answered ? colors.success : colors.borderStrong }]}
                onPress={() =>
                  order.adminReview!.answered ? ackAdminReview(order, async () => void (await load())) : cancelAdminReview(order, async () => void (await load()))
                }
                accessibilityLabel={order.adminReview.answered ? "รับทราบคำตอบแอดมิน" : "ยกเลิกคำขอให้แอดมินตรวจสอบ"}
              >
                <Ionicons
                  name={order.adminReview.answered ? "checkmark" : "close"}
                  size={16}
                  color={order.adminReview.answered ? colors.successInk : colors.textMuted}
                />
                <Text style={[styles.reviewActionText, { color: order.adminReview.answered ? colors.successInk : colors.textMuted }]}>
                  {order.adminReview.answered ? "รับทราบ" : "ยกเลิกคำขอ"}
                </Text>
              </TouchableOpacity>
            ) : user?.role === "ADMIN" && !order.adminReview.answered ? (
              <TouchableOpacity
                style={[styles.reviewAction, { backgroundColor: colors.roleAdmin, borderColor: colors.roleAdmin }]}
                onPress={() => setReplying(true)}
                accessibilityLabel="ตรวจแล้ว ตอบกลับหัวหน้าภาค"
              >
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={[styles.reviewActionText, { color: "#fff" }]}>ตรวจแล้ว · ตอบกลับ</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        {replying && order.adminReview ? (
          <AdminReplyModal
            order={order}
            review={order.adminReview}
            onClose={() => setReplying(false)}
            onDone={async () => {
              setReplying(false);
              await load();
            }}
          />
        ) : null}
        {/*
          ใบ IT ที่หัวหน้าภาคของพื้นที่เปิด (เจ้าของงานขอ 6 พ.ย. 69 — "เห็นใบงานได้ด้วย และปิดงานได้ด้วย") — บอกว่าใครดูแล
          และทำอะไรได้ ไม่งั้นเห็นใบในพื้นที่ตัวเองแต่กดอะไรไม่ได้ จะคิดว่าแอปพัง
        */}
        {order.jobType === "IT" && order.viewOnly && !done ? (
          <View style={[styles.sentBack, styles.crossTeamBox]} accessibilityLabel="กล่องใบงาน IT">
            <Ionicons name="desktop-outline" size={18} color={colors.roleSupervisor} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.sentBackTitle, { color: colors.roleSupervisor }]}>
                ใบงาน IT — {order.itLead ? `${order.itLead.name} (หัวหน้าภาคที่ดูแลงาน IT)` : "แอดมิน (ยังไม่ได้เลือกหัวหน้าภาคที่ดูแลงาน IT)"} เป็นคนดูแล
              </Text>
              <Text style={styles.sentBackText}>
                {order.crossClose
                  ? "สาขาอยู่ในพื้นที่ของคุณ — ปิดใบงานได้ที่ “เครื่องมือเพิ่มเติม” · ขั้นอื่นเป็นของคนที่ดูแลงาน IT"
                  : "สาขาอยู่ในพื้นที่ของคุณ — ดูได้อย่างเดียว"}
              </Text>
            </View>
          </View>
        ) : null}
        {/*
          จ่ายข้ามทีม (เจ้าของงานขอ ต.ค. 69) — ใบในพื้นที่หนึ่งแต่อีกทีมเข้าไปทำ คนเปิดใบต้องรู้ว่าทำไมทีมอื่นอยู่ในใบ
          และใครกดอะไรได้: ช่างปิดได้ทั้งสองทีม · หัวหน้าภาคของทีมที่รับเห็นใบแต่ดูอย่างเดียว
        */}
        {order.crossTeam && !done ? (
          <View style={[styles.sentBack, styles.crossTeamBox]} accessibilityLabel="กล่องจ่ายข้ามทีม">
            <Ionicons name="swap-horizontal" size={18} color={colors.roleSupervisor} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.sentBackTitle, { color: colors.roleSupervisor }]}>
                จ่ายข้ามทีม — {order.crossTeam.assignedTeam} เข้าทำแทนทีมประจำสาขา ({order.crossTeam.ownTeam})
              </Text>
              <Text style={styles.sentBackText}>
                {order.viewOnly
                  ? `ทีมที่คุณดูแลรับงานนี้มา — ใบยังเป็นของหัวหน้าภาค${
                      order.supervisors?.length ? ` ${order.supervisors.map((s) => s.name).join(", ")}` : "เจ้าของพื้นที่"
                    } (ปล่อยงาน/แก้ไข) คุณดูได้อย่างเดียว${
                      order.crossClose ? " · ปิดใบงานได้ที่ “เครื่องมือเพิ่มเติม” (ตอนทีมคุณอยู่หน้างาน)" : ""
                    }`
                  : `ช่างปิดงานได้ทั้ง ${order.crossTeam.assignedTeam} และ ${order.crossTeam.ownTeam}`}
              </Text>
              {!order.viewOnly && order.crossTeam.watchers.length ? (
                <Text style={styles.sentBackMeta}>
                  หัวหน้าภาค {order.crossTeam.watchers.join(", ")} (ดูแล {order.crossTeam.assignedTeam}) เห็นใบนี้ด้วย · ปิดใบงานได้ตอนทีมนั้นอยู่หน้างาน
                </Text>
              ) : null}
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
        {/*
          หัวข้อไม่บอกว่าใครขอวันนั้น — วันใหม่มาได้ทั้งจากลูกค้าขอเลื่อนและแอดมินเลื่อนเอง (ต.ค. 69) สาเหตุอยู่ในบันทึกข้างล่าง
          ไม่มีคำว่า "วันใหม่" (ต.ค. 69 — DEFAULT บอกเจ้าของงาน): ใบที่ส่งกลับตอนขั้นปล่อยงานยังล็อก (ก่อน 2 พ.ย. 69) ไม่ได้ถูกเลื่อนวัน
          ประวัติเก่าพวกนั้นยังแสดงด้วยกล่องนี้
        */}
        {declinedNewDate(order) ? (
          <View style={styles.sentBack} accessibilityLabel="กล่องหัวหน้าภาคส่งกลับนัดใหม่">
            <Ionicons name="calendar-outline" size={18} color={colors.warningInk} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sentBackTitle}>หัวหน้าภาคส่งกลับ — ทีมไม่ว่าง โทรนัดร้านใหม่</Text>
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
              <Ionicons name="warning-outline" size={18} color={colors.dangerInk} />
            </View>
            <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
              <Text style={styles.outTitle}>
                แจ้งเตือน: อะไหล่ขาดสต็อก {partsOut.length} รายการ —{" "}
                {partsOut.map((p) => (p.name ? `${p.name} (${p.partCode})` : p.partCode)).join(", ")}
              </Text>
              <Text style={styles.outText}>
                {etaDay
                  ? `คาดว่าสินค้าเข้าคลัง ${thaiDate(etaDay)}${etaLate ? " (เลยกำหนดแล้ว — ตามผู้ขาย)" : ""}`
                  : "ยังไม่ได้ระบุวันที่คาดการณ์สินค้าเข้าคลัง"}
                {(() => {
                  const c = [...order.logs]
                    .filter((l) => ["PARTS_CHECKED", "PARTS_BACKORDERED", "SPLIT_FROM"].includes(l.action))
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
                  return c ? ` • บันทึกการตรวจสอบเมื่อ ${formatDateTime(c.createdAt)}${c.byName ? ` (${c.byName})` : ""}` : "";
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
                <Ionicons name="calendar-outline" size={15} color={colors.dangerInk} />
                <Text style={styles.outEtaBtnText}>{etaDay ? "เลื่อนวันคาดการณ์สินค้าเข้า" : "ระบุวันคาดการณ์สินค้าเข้า"}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {subStage(order) && (me?.role === "SUPERVISOR" || me?.role === "ADMIN") ? <SubBox order={order} /> : null}

        {/* อาการกับอะไหล่ — กรอกที่นี่ที่เดียว กระดานดึงไปแสดงเอง */}
        {order.symptom || order.inspectionNote || order.waitingParts.length > 0 || order.services.length > 0 ? (
          <View style={styles.nowBody}>
            {/* อาการที่แจ้ง — ค่าในกรอบตัวหนา (พ.ย. 69 ตามแบบ) */}
            <View style={styles.fxRow}>
              <Text style={styles.fxLabel}>อาการที่แจ้ง</Text>
              <View style={styles.fxBox}>
                <Text style={styles.fxBoxText}>{order.symptom ?? "—"}</Text>
              </View>
            </View>
            {/* สถานะหลักอยู่บนป้ายหัวใบงานแล้ว — ขึ้นเฉพาะสถานะย่อยที่คนตั้งเอง (รอลูกค้า ฯลฯ) */}
            {order.workStatus === MANUAL_STATUS && order.workStatusLabel ? (
              <Row label="สถานะย่อย" value={order.workStatusLabel} />
            ) : null}
            {order.inspectionNote ? (
              <View style={styles.fxRow}>
                <Text style={styles.fxLabel}>ผลตรวจหน้างาน</Text>
                <View style={styles.fxChips}>
                  <View style={styles.fxFinding}>
                    <Text style={styles.fxFindingText}>{order.inspectionNote}</Text>
                  </View>
                  {order.inspectedAt ? (
                    <View style={styles.fxDate}>
                      <Text style={styles.fxDateText}>({formatDate(order.inspectedAt)})</Text>
                    </View>
                  ) : null}
                </View>
              </View>
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
                <View style={styles.ptTop}>
                  <Text style={styles.ptTitle}>รายการอะไหล่ที่ต้องใช้</Text>
                  {order.waitingParts.some((x) => x.inStock === false) ? (
                    <View style={styles.ptOutPill}>
                      <View style={[styles.statusDot, { backgroundColor: colors.danger }]} />
                      <Text style={styles.ptOutPillText}>สินค้าขาดสต็อก</Text>
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  <Text style={styles.ptSummary}>
                    ทั้งหมด {order.waitingParts.length} รายการ • พร้อมจ่าย {order.waitingParts.filter((x) => x.inStock === true).length}
                    {order.waitingParts.some((x) => x.inStock === false) ? (
                      <Text style={styles.ptSummaryOut}> • ขาดสต็อก {order.waitingParts.filter((x) => x.inStock === false).length}</Text>
                    ) : null}
                  </Text>
                </View>
                <View style={styles.ptTable}>
                  {wide ? (
                    <View style={[styles.ptRow, styles.ptHeadRow]}>
                      <Text style={[styles.ptHead, styles.ptCode]}>รหัส</Text>
                      <Text style={[styles.ptHead, styles.ptName]}>รายการ</Text>
                      <Text style={[styles.ptHead, styles.ptQty]}>จำนวน</Text>
                      <Text style={[styles.ptHead, styles.ptStock]}>สถานะ</Text>
                      <Text style={[styles.ptHead, styles.ptEta]}>วันคาดว่าของเข้า</Text>
                    </View>
                  ) : null}
                  {order.waitingParts.map((part, i) => {
                    const out = part.inStock === false;
                    // ผลเช็คคลัง — ว่างคือยังไม่มีใครเช็ค ต่างจากเช็คแล้วพบว่าหมด · ของนอกสโตร์ = จัดหาได้ไหม
                    const chip =
                      part.inStock === null
                        ? { text: "ยังไม่เช็ค", fg: colors.textMuted, bg: colors.background }
                        : part.inStock
                          ? { text: part.offCatalog ? "หาได้" : part.warehouse ?? "มีของ", fg: colors.successInk, bg: colors.successSoft }
                          : { text: part.offCatalog ? "ยังหาไม่ได้" : "ขาดสต็อก / สินค้าหมด", fg: colors.dangerInk, bg: colors.dangerSoft };
                    const chipView = (
                      <View style={[styles.ptChip, { backgroundColor: chip.bg, borderColor: chip.fg === colors.dangerInk ? colors.dangerLine : chip.fg === colors.successInk ? colors.successLine : colors.border }]}>
                        <View style={[styles.statusDot, { backgroundColor: chip.fg }]} />
                        <Text style={[styles.ptChipText, { color: chip.fg }]}>{chip.text}</Text>
                      </View>
                    );
                    const qty = `${part.quantity} ${part.unit ?? "หน่วย"}`;
                    const eta = out ? (
                      etaDay ? (
                        <Text style={[styles.ptEtaText, etaLate && { color: colors.dangerInk }]}>{thaiDate(etaDay)}</Text>
                      ) : user?.role === "ADMIN" || (itLeadOf(user) && order.jobType === "IT") ? (
                        <TouchableOpacity style={styles.ptEtaBtn} onPress={() => setEtaOpen(true)} accessibilityLabel={`ใส่วันคาดว่าเข้า ${partTitle(part)}`}>
                          <Ionicons name="calendar-outline" size={14} color={colors.body} />
                          <Text style={styles.ptEtaBtnText}>ระบุวันที่รับเข้า</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.ptEtaText}>ยังไม่ระบุ</Text>
                      )
                    ) : (
                      <Text style={styles.ptEtaText}>—</Text>
                    );
                    return wide ? (
                      <View key={part.sparePartId} style={[i > 0 && styles.ptRowLine, out && styles.ptRowOut]}>
                        <View style={styles.ptRow}>
                          <Text style={[styles.ptCell, styles.ptCode, styles.ptStrong, styles.ptCodeInk]}>{partTitle(part)}</Text>
                          <View style={styles.ptName}>
                            <View style={styles.ptNameRow}>
                              <Text style={[styles.ptCell, styles.ptStrong]}>{part.offCatalog ? part.note ?? "" : part.name}</Text>
                              {part.offCatalog ? <OffTag /> : null}
                            </View>
                            {part.requisitionNo ? <RequisitionText part={part} /> : null}
                          </View>
                          <Text style={[styles.ptCell, styles.ptQty, styles.ptStrong]}>{qty}</Text>
                          <View style={styles.ptStock}>{chipView}</View>
                          <View style={styles.ptEta}>{eta}</View>
                        </View>
                        {/*
                         * หัวหน้าภาคแจ้งว่าหาได้ไหม จากที่ไหน (เจ้าของงานขอ 4 พ.ย. 69) — แยกจากป้ายสถานะซึ่งเป็นผลเช็คของแอดมิน
                         * บรรทัดของตัวเองใต้แถว ไม่ใช่ในช่องรายการ: จอคอม ~1300 px ตารางอยู่คอลัมน์ซ้ายของหน้าสองคอลัมน์ ช่องรายการเหลือ ~50 px
                         * ป้าย/รายละเอียด/"หัวหน้าภาคแจ้ง · เวลา" ถูกหักทีละคำจนแถวสูงหลายร้อย px อ่านไม่ออก (เห็นจากภาพหน้าจอจริง)
                         */}
                        {part.offCatalog ? (
                          <View style={styles.ptRowSource}>
                            <OffSourceInfo part={part} when={formatDateTime} />
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <View key={part.sparePartId} style={[styles.ptCardRow, i > 0 && styles.ptRowLine, out && styles.ptRowOut]}>
                        <View style={styles.ptNameRow}>
                          <Text style={[styles.ptCell, styles.ptStrong]}>
                            {partTitle(part)} × {qty}
                          </Text>
                          {part.offCatalog ? <OffTag /> : null}
                          <View style={{ flex: 1 }} />
                          {chipView}
                        </View>
                        <Text style={styles.ptSub} numberOfLines={2}>
                          {part.offCatalog ? part.note ?? "" : part.name}
                        </Text>
                        {/* เลขใบเบิกอยู่บรรทัดของตัวเอง แถวเดียวกับคลังจะยาวเกินจอมือถือ */}
                        {part.requisitionNo ? <RequisitionText part={part} /> : null}
                        <OffSourceInfo part={part} when={formatDateTime} />
                        {out ? <View style={styles.ptCardEta}>{eta}</View> : null}
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}
          </View>
        ) : (
          <Text style={styles.linkedText}>ยังไม่ได้กรอกอาการ — กด "แก้ไขอาการ/สถานะ" เพื่อใส่</Text>
        )}
        {order.outageId !== null ? (
          <Text style={styles.linkedText}>อาการและอะไหล่ที่กรอกที่นี่จะขึ้นบนกระดานติดตามเครื่องเสียของเคสนี้ให้เอง</Text>
        ) : null}

        {/*
          คำขอนัดด่วนของหัวหน้าภาค (แอดมิน · ใบรอนัดวัน) — อยู่ในการ์ดขั้น เห็นทันทีที่เปิดใบจากกล่องงาน/ป้ายม่วง
          เซิร์ฟเวอร์ส่ง urgentAsk เฉพาะคำขอที่ยังรอ (วันที่ขอยังไม่ผ่าน) — หัวหน้าภาคเห็นกล่องของตัวเองในฟอร์มนัดวันแทน
        */}
        {user?.role === "ADMIN" && order.urgentAsk ? (
          <AskAdminBox
            ask={order.urgentAsk}
            canAct={canMoveDates(user)}
            onAnswer={() => setAnswerOpen(true)}
            onGrant={() => setUrgentOpen(true)}
          />
        ) : null}

        {/* ฟอร์มที่กางจากปุ่ม "ตามลูกค้าแล้ว" / "ลูกค้าไม่ซ่อม" — ชิดแถวปุ่ม กดแล้วเห็นทันทีแม้บนมือถือ · แอดมินที่ทำขั้นนี้ได้เท่านั้น */}
        {payNow && user && myTurn(order) && !user.viewAs ? (
          <PayWaitForms
            orderId={order.id}
            p={payNow}
            panel={payPanel}
            onPanel={setPayPanel}
            reasons={declineReasons}
            onFollowed={async () => void (await load())}
            onDeclined={() => reloadWithNotice("ลูกค้าไม่ซ่อม · ยกเลิกใบงานแล้ว")}
          />
        ) : null}

        {/* ท้ายการ์ด: ใครทำอะไรล่าสุด + ปุ่มของขั้นนี้ (ปุ่มเดียว) — ตามแบบ ปุ่มอยู่มุมขวาล่างของการ์ด */}
        <View style={[styles.nowFoot, wide && styles.nowFootWide]}>
          {/*
            ท้ายการ์ดขั้น (หน้าตาใหม่ พ.ย. 69): ซ้าย = ระงับชั่วคราว · แก้ไขรายละเอียด · ขวา = ปุ่มของขั้น
            ปุ่มของขั้นอยู่ที่นี่ที่เดียว (แถบท้ายหน้าต่างเอาออก ไม่ให้ซ้ำ) · ไม่มีบันทึกฉบับร่าง (เจ้าของงานเลือก — ฟอร์มแต่ละขั้นสั้น)
          */}
          {!done && !viewOnly ? (
            <View style={styles.cardTools}>
              {canHold && !order.hold ? (
                <TouchableOpacity style={styles.footTool} onPress={() => setHoldOpen(true)} activeOpacity={0.7} accessibilityLabel="ระงับการปฏิบัติงานชั่วคราว">
                  <Ionicons name="pause-circle-outline" size={16} color={colors.body} />
                  <Text style={styles.footToolText}>ระงับการปฏิบัติงานชั่วคราว</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.footTool} onPress={() => setEditingNote(true)} activeOpacity={0.7} accessibilityLabel="แก้ไขรายละเอียด">
                <Ionicons name="create-outline" size={15} color={colors.body} />
                <Text style={styles.footToolText}>แก้ไขรายละเอียด</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {/*
            ป้ายเวลาปิดนัดข้างปุ่มขั้น (ใบรอนัดวัน) — เห็นก่อนเปิดฟอร์มว่านัดพรุ่งนี้ได้อีกเท่าไร/ขอแอดมินไว้แล้ว/แอดมินแก้ให้แล้ว
            ป้ายเดินนาฬิกาเอง (หน้านี้ไม่วาดใหม่ทั้งหน้าตามเวลา) · ช่างกับทีม Area ไม่เห็น ใบขั้นอื่นไม่มีป้าย (LiveScheduleChip ตัดเอง)
          */}
          <LiveScheduleChip row={order} serverNow={order.serverNow} cutoff={order.cutoff} style={wide ? { alignSelf: "center" } : undefined} />
          <View style={wide ? styles.nowFootActions : undefined}>
        {order.status === "CLAIM_REVIEW" ? (
          <View style={[styles.waitingCard, styles.waitingInline]}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
            <Text style={styles.waitingText}>
              {canDecideClaims(me)
                ? "ช่างปิดงานพร้อมส่งอะไหล่เก่าเคลม — ตรวจใบเคลมด้านบน แล้วตัดสินทีละชิ้นที่แถบล่างจอ"
                : "ช่างปิดงานแล้ว รอ Admin Spare Part ตรวจเคลมอะไหล่เก่า"}
            </Text>
          </View>
        ) : !done ? (
          myTurn(order) ? (
            <>
              <View style={styles.actions} {...howtoTarget("order.action")}>
  {/*
                  ปุ่มเดียวต่อขั้น — ขั้นไหนก็ทำได้อย่างเดียวตามที่สายงานกำหนด
                  ขั้นนัดวันเป็นของหัวหน้าภาค ส่วนปิดงานเป็นของช่างหลังถึงหน้างานแล้ว
                  จึงไม่มีขั้นไหนที่ขึ้นทั้งสองปุ่มพร้อมกันอีก
                */}
                {/*
                  แจ้งปัญหาหน้างาน — ปุ่มขนาดเดียวกับปิดงาน วางข้างกัน สีกรอบกรมท่าตามธีม (เจ้าของงานขอ ต.ค. 69)
                  เดิมเป็นแถบเหลืองยาวเต็มการ์ดใต้ปุ่มปิดงาน ดูเหมือนคำเตือน และจอแคบทับกับปุ่มปิดงาน
                  รายละเอียด (บอกเหตุ แนบรูป ขอเบิกอะไหล่) อยู่ในฟอร์มที่เปิดขึ้นมาแล้ว
                */}
                {/* จอกว้าง: ปุ่มรองอยู่ซ้ายปุ่มขั้น · จอแคบปุ่มขึ้นบรรทัดใหม่ — ปุ่มขั้นต้องอยู่บนสุด ไม่ถูกปุ่มรองดันลงไป */}
                {wide ? rescheduleBtn : null}
                {order.status === "IN_PROGRESS" ? (
                  <TouchableOpacity
                    style={[styles.action, styles.actionProblem]}
                    onPress={() => setRollbackOpen(true)}
                    disabled={busy}
                    activeOpacity={0.8}
                    accessibilityLabel="แจ้งปัญหาหน้างาน — ปิดงานไม่ได้"
                  >
                    <Ionicons name="alert-circle-outline" size={18} color={colors.navy} />
                    <Text style={styles.actionProblemText}>แจ้งปัญหาหน้างาน</Text>
                  </TouchableOpacity>
                ) : null}
                {order.status === "IN_PROGRESS" && !order.onSite && !order.assignedOutsource && isTech ? (
                  // ขั้นเข้างาน: ปุ่มเดียวของช่างคือ "ถึงหน้างาน" — ถึงแล้วปุ่มเปลี่ยนเป็นปิดงาน (ปุ่มเดียวต่อขั้นเหมือนขั้นอื่น)
                  // กดได้เฉพาะช่าง (เจ้าของงานเลือก) — แอดมิน/หัวหน้าภาคเห็นปุ่มปิดงานแทนตามเดิม ไม่งั้นประวัติบอกว่าแอดมินถึงหน้างาน
                  // ใบ SUB ไม่มีปุ่มนี้: ทีม outsource ไม่มีบัญชี หัวหน้าภาคบันทึกผลงานแทนได้เลย
                  <TouchableOpacity
                    style={[styles.action, styles.actionPrimary]}
                    onPress={() => void arriveNow()}
                    disabled={busy}
                    activeOpacity={0.8}
                    accessibilityLabel="ถึงหน้างาน"
                  >
                    <Ionicons name="location" size={18} color="#fff" />
                    <Text style={styles.actionPrimaryText}>ถึงหน้างาน</Text>
                  </TouchableOpacity>
                ) : order.status === "IN_PROGRESS" ? (
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
                  <>
                    {/*
                      รอลูกค้าจ่ายเงิน: ลูกค้าไม่ซ่อม · ตามลูกค้าแล้ว — จอกว้างอยู่หน้าปุ่มหลัก (ตัวอย่างที่ตกลง) · จอแคบอยู่หลัง
                      (ปุ่มขั้นต้องอยู่บนสุด ไม่ถูกปุ่มรองดันลงไป — แบบเดียวกับเลื่อนวันนัด) · ดูในฐานะไม่มี (เซิร์ฟเวอร์กันอีกชั้น)
                    */}
                    {wide && payNow && !user?.viewAs ? <PayWaitButtons panel={payPanel} onPanel={setPayPanel} disabled={busy} /> : null}
                    <StagePrimaryButton
                      order={order}
                      partsOut={partsOut.length}
                      busy={busy}
                      tech={user?.role === "EMPLOYEE"}
                      onStage={() => setStageOpen(true)}
                    />
                    {!wide && payNow && !user?.viewAs ? <PayWaitButtons panel={payPanel} onPanel={setPayPanel} disabled={busy} /> : null}
                  </>
                )}
                {wide ? null : rescheduleBtn}
              </View>

              {/*
                ถ่ายก่อนซ่อม (เคลมก้อน 5) — ช่างที่เปิดใบจากหน้านี้ (ไม่ได้มาจากการ์ดงานของฉัน) ต้องเห็นกล่องเดียวกัน
                ขึ้นเฉพาะใบซ่อมที่กำลังทำ สาขาในประกัน และยังไม่ได้ส่งเคลมในรอบนี้ (ถูกตีกลับแล้วแก้ในฟอร์มแก้เคลม)
                ต้องมีเครื่องด้วย — กติกาเดียวกับการ์ดงานของฉัน (showsPreRepair) งานอุปกรณ์ทั้งสาขาไม่มีจอ Error ให้ถ่าย
              */}
              {order.status === "IN_PROGRESS" &&
              me?.role === "EMPLOYEE" &&
              order.jobType !== "PM" &&
              !!order.machineCode &&
              order.branchWarrantyExpired === false &&
              order.branchWarrantyExpiresAt &&
              !order.claims.some((c) => !order.roundStartedAt || c.createdAt >= order.roundStartedAt) ? (
                <View style={{ marginTop: spacing.sm }}>
                  <PreRepairBox
                    orderId={order.id}
                    warrantyUntil={order.branchWarrantyExpiresAt}
                    plateFamily={order.claimGuide?.plate.family}
                    counts={{
                      video: order.claimEvidence.filter((e) => e.sparePartId === null && e.role === "CLAIM_ERROR_VIDEO").length,
                      photo: order.claimEvidence.filter((e) => e.sparePartId === null && e.role === "CLAIM_SYMPTOM").length,
                    }}
                    onChanged={() => void refreshQuiet()}
                    readOnly={!!me?.viewAs}
                  />
                </View>
              ) : null}

              {/*
                ไปถึงหน้างานแล้วจบเคสไม่ได้เพราะต้องเปลี่ยนอะไหล่เพิ่ม — ปุ่ม "แจ้งปัญหาหน้างาน" อยู่ข้างปุ่มปิดงานด้านบน
                ช่างเลือกอะไหล่ที่จะเบิกได้เลย เพราะเป็นคนเดียวที่เห็นของจริง
                แล้วใบงานวนกลับไปให้หัวหน้าภาคดูและแอดมินเช็คคลังอีกรอบ
              */}
            </>
          ) : (
            <View style={rescheduleBtn ? styles.waitingRow : undefined}>
              <View style={[styles.waitingCard, styles.waitingInline, rescheduleBtn ? { flex: 1, minWidth: 220 } : null]}>
                <Ionicons name="hourglass-outline" size={16} color={colors.textMuted} />
                <Text style={styles.waitingText}>
                  {viewOnly ? "ดูได้อย่างเดียว · " : ""}
                  {/* รอลูกค้าจ่ายเงิน: ลูกบอลอยู่ที่ลูกค้า ไม่ใช่ "รอแอดมิน" — แอดมินแนบบิลเมื่อลูกค้าจ่าย */}
                  {payNow ? "ขั้นนี้รอลูกค้าจ่ายเงิน (แอดมินแนบบิลเมื่อลูกค้าจ่าย)" : `ขั้นนี้รอ${order.stageActorLabel ?? "คนอื่น"}`}
                  {order.stageActor === "EMPLOYEE" && (order.assignedToName ?? order.assignedTeam)
                    ? ` (${order.assignedToName ?? order.assignedTeam}${order.assignedOutsource ? " — หัวหน้าภาคปิดงานแทน" : ""})`
                    : ""}
                  {viewOnly ? "" : " — ยังไม่ถึงคิวของคุณ"}
                </Text>
              </View>
              {/* ขั้นเบิก/โอนคลังอื่นกับปล่อยงานไม่ใช่คิวแอดมิน แต่วันนัดเป็นเรื่องที่แอดมินคุยกับร้าน — เลื่อนได้จากตรงนี้ */}
              {rescheduleBtn}
            </View>
          )
        ) : null}
          </View>
        </View>
      </View>

      {order.claims.length > 0 && !reviewMode ? (
        <ClaimsCard
          order={order}
          files={files}
          showMissed={canReviewClaims(me)}
          // แผงดาวน์โหลดส่งผู้ขายของผู้ตรวจ — ตอนสรุปผลที่เพิ่งตัดสินขึ้นอยู่ด้านบน แผงอยู่ในสรุปนั้นแล้ว ไม่ซ้ำสองแผง
          downloads={canReviewClaims(me) && !(reviewOutcome && !reviewMode)}
        />
      ) : null}

      {order.closedAt || rejected ? (
        <View style={card}>
          <Text style={styles.sectionTitle}>{rejected ? "ผลการทำงานรอบที่ถูกตีกลับ" : "ผลการทำงาน"}</Text>
          {rejectLines.map((l, i) => (
            <View key={`${l.part}-${i}`} style={styles.verdictBad}>
              <Ionicons name="arrow-undo" size={16} color={colors.danger} />
              <Text style={styles.verdictBadText}>
                Remark: ตีกลับเพราะ {rejectPrefix ? `${l.part}: ` : ""}
                {l.reason}
                {rejected?.reviewedAt ? ` · ${formatDateTime(rejected.reviewedAt)}` : ""}
              </Text>
            </View>
          ))}
          <Row label="ผล" value={order.closeResultLabel ?? "—"} />
          {/* สรุปงานคือสิ่งที่คนเปิดใบปิดแล้วมาหา (เจ้าของงานให้ตัวหนา) — เดิมเป็นตัวเทาเล็กไม่มีหัวข้อ */}
          {order.closeNote ? (
            <View style={[styles.summaryBox, closedOk && styles.summaryBoxDone]}>
              {/* หัวหน้าภาคปิดเองไม่มีงานที่ทำ — สิ่งที่บันทึกไว้คือเหตุผล เรียกให้ตรง */}
              <Text style={styles.summaryLabel}>
                {order.closeResult === "SUPERVISOR_CLOSED" ? "เหตุผลที่หัวหน้าภาคปิด" : order.closeResult === "REMOTE_FIXED" ? "สิ่งที่แก้จากระยะไกล" : "สรุปงานที่ทำ"}
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
                <View key={p.sparePartId}>
                  <Text style={styles.partLine}>
                    {p.offCatalog ? `${p.name} (นอกสโตร์)` : `${p.partCode} · ${p.name}`} × {p.quantity}
                    {p.unit ? ` ${p.unit}` : ""}
                  </Text>
                  {/* ของที่ช่างซื้อเองหน้างาน — ซื้อจากที่ไหน (ของจากรายการที่หัวหน้าภาคระบุไม่มีบรรทัดนี้) */}
                  <OffSourceInfo part={p} used when={formatDateTime} />
                </View>
              ))}
            </>
          ) : null}
        </View>
      ) : null}

      {/* ข้อความแจ้งคิวช่างให้ลูกค้า — แอดมินเท่านั้น (เจ้าของงานขอ ต.ค. 69): แอดมินเป็นคนคุยกับร้าน
          หัวหน้าภาค/ช่างไม่ได้ส่งข้อความหาลูกค้า เห็นแล้วเข้าใจผิดว่าต้องส่งเอง */}
      {hasCustomerMessage(order) && me?.role === "ADMIN" ? (
        <CustomerMessageCard order={order} style={card} />
      ) : null}

      {/*
        รูปหน้างาน — อยู่ต่อจากอาการเพราะเป็นเรื่องเดียวกัน คือ "เจออะไร"
        ปิดงานแล้วแนบเพิ่มไม่ได้ ใบที่ปิดแล้วคือบันทึกที่จบไปแล้ว
        ยกเว้นแอดมินที่ยังต้องเอาของที่ไม่ควรอยู่ในระบบออกได้
      */}
      {/* กรอบห่อให้วิธีใช้ชี้การ์ดรูปและไฟล์ (ชื่อคงที่) — การ์ดอยู่ในคอลัมน์ที่เว้นระยะด้วย gap ห่อแล้วระยะไม่เปลี่ยน */}
      <View {...howtoTarget("order.files")}>
        <WorkOrderAttachments
          workOrderId={order.id}
          canEdit={!viewOnly && (!done || user?.role === "ADMIN")}
          reloadKey={filesKey}
          formLinks={formDetail.links}
          onLoaded={filesLoaded}
          onLoadFailed={filesFailed}
          onAdded={load}
          inspection={
            order.status === "INSPECTING" || order.inspectedAt
              ? { since: order.inspectionStartedAt ?? null, active: order.status === "INSPECTING" }
              : undefined
          }
        />
      </View>

      </View>

      <View style={wide ? styles.colSide : styles.stack}>
      <View style={wide ? styles.sideStack : [styles.infoGrid, twoCol && styles.infoGridWide]}>
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
          {/*
            แก้ยี่ห้อเครื่อง (ข้อ 23) — ที่เดียวที่เปลี่ยนยี่ห้อที่รู้แล้วได้ ฟอร์มอื่นทุกฟอร์มล็อกไว้ (ข้อ 17)
            หัวหน้าภาค/แอดมินเท่านั้น: ยี่ห้อเปลี่ยนไฟล์อะไหล่ อายุประกัน และการเสนอราคาของทุกใบของเครื่องนี้
            ช่างเห็นยี่ห้อผิดให้ถ่ายป้ายเครื่องแล้วบอก (ข้อความในช่องเลือกอะไหล่บอกไว้)
          */}
          {order.machineCode && order.partsBrand && (user?.role === "SUPERVISOR" || user?.role === "ADMIN") && !user?.viewAs ? (
            <TouchableOpacity
              style={styles.brandFixLink}
              onPress={() => setBrandFixOpen(true)}
              activeOpacity={0.7}
              accessibilityLabel={`แก้ยี่ห้อเครื่อง ${order.machineCode}`}
            >
              <Ionicons name="create-outline" size={15} color={colors.primary} />
              <Text style={styles.brandFixText}>
                แก้ยี่ห้อเครื่อง
                <Text style={styles.brandFixNow}>
                  {" "}· ตอนนี้ {order.partsBrand.make ?? "ยังไม่รู้ยี่ห้อ"}
                  {order.partsBrand.file ? ` (ไฟล์อะไหล่ ${order.partsBrand.file})` : ""}
                </Text>
              </Text>
            </TouchableOpacity>
          ) : null}
          {order.contactName || order.contactPhone ? (
            <Row
              label="ผู้ติดต่อที่สาขา"
              value={[order.contactName, order.contactPhone].filter(Boolean).join(" · ")}
            />
          ) : null}
          {/* แอดมิน/Super Admin เท่านั้น (ซ่อนเองในตัว) — ตัวเลขโหลดใหม่เมื่อใบเปลี่ยนขั้น */}
          <BranchPartsLinks
            branchCode={order.branchCode}
            branchName={order.branchName}
            machineId={order.machineId}
            machineCode={order.machineCode}
            reloadKey={order.status}
          />
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
          {/* แอดมินเลื่อนวันได้ตรงที่เห็นวัน (ต.ค. 69) — ฟอร์มเดียวกับปุ่มเลื่อนวันนัดทุกขั้น ใบอยู่ขั้นเดิม */}
          {canReschedule ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>วันนัด</Text>
              <View style={styles.dateRowValue}>
                <Text style={styles.dateRowText}>{visitLabel(order)}</Text>
                <TouchableOpacity
                  style={styles.moveDateBtn}
                  onPress={openReschedule}
                  activeOpacity={0.7}
                  accessibilityLabel="เลื่อนวันนัด จากการ์ดการมอบหมาย"
                >
                  <Ionicons name="calendar-outline" size={14} color={colors.primaryInk} />
                  <Text style={styles.moveDateBtnText}>เลื่อนวันนัด</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Row label="วันนัด" value={visitLabel(order)} />
          )}
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
          <Row label="ที่มา" value={order.source === "OUTAGE" ? "เปิดจากกระดาน" : order.source === "FORM" ? "นำเข้าจากฟอร์มแจ้งซ่อม" : "เปิดเอง"} />
        </View>
      </View>


      <View nativeID="order-history">
        <History logs={order.logs} closed={closedOk} onTimeline={user?.superAdmin ? () => setTimelineOpen(true) : undefined} />
      </View>

      {/*
        เครื่องมือเพิ่มเติม — ปิดใบงาน · เปิดใบรออะไหล่ต่อ · คัดลอกเป็นใบทดสอบ · ปิดงานย้อนหลัง · ยกเลิก · ลบ (ย้ายไปถังขยะ)
        อยู่คอลัมน์ขวาตามแบบ เพราะไม่ใช่ขั้นตอนปกติของใบงาน ปุ่มของขั้นจริงอยู่ในการ์ดขั้นปัจจุบันแล้ว
        "ปิดใบงาน" ชื่อนี้ ไม่ใช่ "ปิดงาน" เพราะขั้นเข้างานมีปุ่ม "ปิดงาน" ของช่าง (แนบรูป) อยู่แล้ว
        ลบ (แอดมิน) อยู่ท้ายสุดโดยตั้งใจ: ยกเลิกเก็บใบไว้ในรายงานพร้อมเหตุผล ส่วนลบคือหายจากทุกที่ (ถังขยะ 30 วันแล้วลบจริง)
        Admin Spare Part ไม่เห็น — ลบใบงานไม่ได้ (ดูได้อย่างเดียว) ปุ่มที่กดแล้วได้ 403 คือปุ่มที่ไม่ควรมี
      */}
      {canFollowUp || canEnd || user?.role === "ADMIN" ? (
        <View style={[card, styles.toolsCard]}>
          <Text style={styles.toolsTitle}>เครื่องมือเพิ่มเติม</Text>
          {canRemoteClose ? (
            <TouchableOpacity
              style={styles.toolsClose}
              onPress={() => setRemoteClosing(true)}
              accessibilityLabel="แก้จากระยะไกลแล้ว · ปิดงาน"
            >
              <Ionicons name="desktop-outline" size={18} color={colors.navy} />
              <Text style={styles.toolsCloseText}>แก้จากระยะไกลแล้ว · ปิดงาน</Text>
            </TouchableOpacity>
          ) : null}
          {canEnd && !recovered ? (
            <TouchableOpacity style={styles.toolsClose} onPress={() => setSupClosing(true)} accessibilityLabel="ปิดใบงาน">
              <Ionicons name="checkmark-done-circle-outline" size={18} color={colors.navy} />
              <Text style={styles.toolsCloseText}>ปิดใบงาน</Text>
            </TouchableOpacity>
          ) : null}
          {canFollowUp ? (
            <TouchableOpacity style={styles.toolItem} onPress={() => setFollowUpOpen(true)} activeOpacity={0.7}>
              <Ionicons name="git-branch-outline" size={18} color={colors.body} />
              <Text style={styles.toolItemText}>เปิดใบงานรออะไหล่ต่อ</Text>
            </TouchableOpacity>
          ) : null}
          {user?.role === "ADMIN" && !order.isTest ? (
            <TouchableOpacity style={styles.toolItem} onPress={confirmTestCopy} activeOpacity={0.7}>
              <Ionicons name="copy-outline" size={18} color={colors.body} />
              <Text style={styles.toolItemText}>คัดลอกเป็นใบทดสอบ</Text>
            </TouchableOpacity>
          ) : null}
          {canEnd && user?.role === "ADMIN" ? (
            <TouchableOpacity
              style={styles.toolItem}
              onPress={() => setBackfilling(true)}
              activeOpacity={0.7}
              accessibilityLabel="ปิดงานย้อนหลัง"
            >
              <Ionicons name="time-outline" size={18} color={colors.body} />
              <Text style={styles.toolItemText}>ปิดงานย้อนหลัง (กรอกทุกขั้น)</Text>
            </TouchableOpacity>
          ) : null}
          {canEnd ? (
            <TouchableOpacity
              style={styles.toolItem}
              onPress={() => setCancelling(true)}
              activeOpacity={0.7}
              accessibilityLabel="ยกเลิกใบงาน"
            >
              <Ionicons name="close-circle-outline" size={18} color={colors.body} />
              <Text style={styles.toolItemText}>ยกเลิกใบงาน</Text>
            </TouchableOpacity>
          ) : null}
          {user?.role === "ADMIN" && !user.partsAdmin ? (
            <View style={styles.dangerZone}>
              <Text style={styles.dangerTitle}>ลบใบงาน</Text>
              <Text style={styles.dangerHint}>
                ย้ายไปถังขยะ กู้คืนได้ 30 วัน แล้วระบบลบจริงพร้อมรูป · ใช้กับใบที่ไม่ควรมีตั้งแต่แรก ถ้าแค่ไม่ทำแล้วให้ "ยกเลิก"
              </Text>
              <TouchableOpacity
                style={styles.dangerBtn}
                onPress={() => setTrashing(true)}
                activeOpacity={0.7}
                accessibilityLabel="ลบใบงานนี้ (ย้ายไปถังขยะ)"
              >
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
                <Text style={styles.deleteText}>ย้ายไปถังขยะ…</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}
      </View>
      </View>
      </View>

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

      {holdOpen ? (
        <HoldModal
          order={order}
          onCancel={() => setHoldOpen(false)}
          onDone={async () => {
            setHoldOpen(false);
            await reloadWithNotice("ระงับชั่วคราวแล้ว — ใบออกจากกล่องงานจนถึงวันที่เลือก");
          }}
        />
      ) : null}

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

      {rescheduleOpen ? (
        <RescheduleModal
          order={order}
          adminWarehouse={adminWarehouse}
          onCancel={() => setRescheduleOpen(false)}
          onDone={async (r) => {
            setRescheduleOpen(false);
            // ลูกค้าตกลงวันไปแล้ว (คอนเฟิร์มก่อนสลับลำดับ · ปล่อยงานแล้ว) — ต้องส่งข้อความวันใหม่ให้ร้าน
            // ยังไม่คอนเฟิร์ม = ร้านยังไม่รู้วันเลย ไม่มีอะไรต้องแจ้ง (โทรตอนคอนเฟิร์มลูกค้า)
            const confirmed = APPOINTMENT_DONE.includes(order.appointmentStatus ?? "");
            /**
             * ข้อความตามตัวอย่าง ("เลื่อนวันนัด <ใบ> เป็น … แล้ว — …") แทน "เลื่อนวันนัดแล้ว" แบบเดิม — ขึ้นแทน ไม่ใช่ขึ้นเพิ่ม (สองข้อความซ้อนกันคนอ่านไม่ทันทั้งคู่)
             * บอกว่าใบกลับไปที่หัวหน้าภาคไหม และงานด่วนที่ติ๊กไปพร้อมกันตั้งให้จริงไหม
             * สถานะหลังบันทึกมาจากใบที่โหลดใหม่ ไม่เดาจากขั้นก่อนกด (ดึงคืนจากช่าง = ขั้นเปลี่ยน)
             * งานด่วน = ติ๊กไปจริงและใบได้วันนั้น — ใบที่แอดมินแก้ให้วันนั้นไว้ก่อนแล้วก็มี urgentReleaseFor ตรงกัน แต่ครั้งนี้ไม่ได้ติ๊ก
             */
            const next = await load();
            const after = next ?? r.detail;
            feedback.toast(
              "success",
              rescheduledText(order.code, r.day, {
                releaseStage: !!after && RELEASE_STAGES.includes(after.status),
                urgentTaken: r.ticked && after?.urgentReleaseFor === r.day,
              })
            );
            if (confirmed) setMessageOpen(true);
          }}
        />
      ) : null}

      {/*
        แก้เป็นงานด่วน / ตอบคำขอนัดด่วน (แอดมิน · จากกล่องม่วงในการ์ดขั้น) — เสร็จแล้วโหลดใบใหม่ กล่องคำขอหายไป
        ปิดหลังเจอ "คำขอเปลี่ยนไปแล้ว" (stale) ก็โหลดใหม่ — กล่องที่ค้างอยู่คือคำขอที่ไม่มีแล้ว
      */}
      {urgentOpen && order.urgentAsk ? (
        <UrgentReleaseModal
          order={order}
          onCancel={(stale) => {
            setUrgentOpen(false);
            if (stale) void reload();
          }}
          onDone={async () => {
            setUrgentOpen(false);
            await reload();
          }}
        />
      ) : null}
      {answerOpen && order.urgentAsk ? (
        <UrgentAnswerModal
          order={order}
          onCancel={(stale) => {
            setAnswerOpen(false);
            if (stale) void reload();
          }}
          onDone={async () => {
            setAnswerOpen(false);
            await reload();
          }}
        />
      ) : null}

      <StageBackModal
        visible={stageBackOpen}
        order={order}
        targets={backTargets}
        stages={stages}
        canReschedule={canReschedule}
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
        onReschedule={
          canReschedule
            ? () => {
                setStageOpen(false);
                setRescheduleOpen(true);
              }
            : undefined
        }
        onFilesChanged={() => setFilesKey((k) => k + 1)}
        onCancel={() => setStageOpen(false)}
        overlay={askOverlay}
        onOverlay={setAskOverlay}
        onDone={async (kind) => {
          const before = order;
          setStageOpen(false);
          // ขั้นเสนอราคาแนบใบเสนอราคา/บิลไปด้วย การ์ดไฟล์แนบต้องโหลดใหม่ถึงจะเห็น
          setFilesKey((k) => k + 1);
          /**
           * ข้อความหลังบันทึก — ทุกขั้นใช้ "จากไหน → ไปไหน" (reloadWithNotice) ยกเว้นขั้นที่ตัวอย่างที่อนุมัติมีคำของมันเอง
           * ปล่อยงาน/ส่งกลับบอกสิ่งที่หัวหน้าภาคต้องรู้ต่อ (ทีมเห็นที่แท็บไหน · ใบออกจากรายการของตัวเองแล้ว)
           * ขึ้นแทน ไม่ใช่ขึ้นเพิ่ม — สองข้อความซ้อนกันคนอ่านไม่ทันทั้งคู่ (ขั้นใหม่ของฟีเจอร์อื่นเติม case ในสวิตช์นี้ ไม่สร้างทางที่สอง)
           */
          switch (kind) {
            case "released": {
              const next = await load();
              if (!next) break;
              const now = next.serverNow ? Date.parse(next.serverNow) : serverNowAt();
              feedback.toast("success", releasedText(next, next.status === "INSPECTING", now));
              break;
            }
            case "declined": {
              await load();
              feedback.toast("info", declinedText(before.code));
              break;
            }
            case "confirmed":
              await reloadWithNotice();
              // เพิ่งคอนเฟิร์มกับลูกค้า — จังหวะที่ต้องส่งข้อความแจ้งคิวช่างพอดี
              setMessageOpen(true);
              break;
            /**
             * ช่างส่งผลตรวจ (เลือกอะไหล่ตอนตรวจหน้างาน · ข้อ 13) — ใบออกจาก "งานของฉัน" ทันที
             * มาจากงานของฉัน: กลับไปหน้านั้นพร้อมกล่อง "ส่งผลตรวจแล้ว … ดูใบงาน" (utils/flash) — ไม่งั้นการ์ดหายเงียบ ๆ ช่างนึกว่าส่งไม่ไป
             * เปิดใบมาจากที่อื่น: อยู่หน้านี้ต่อ (หน้านี้คือ "ดูใบงาน" อยู่แล้ว) บอกด้วยข้อความเดียวกัน
             */
            case "pickSent":
            case "inspectionSent": {
              const pick = kind === "pickSent";
              if (cameFromMyJobs()) {
                setFlash("MyJobs", { kind: "sent", id: before.id, code: before.code, pick });
                navigation.goBack();
                break;
              }
              await load();
              showAlert(
                "ส่งผลตรวจแล้ว",
                `${before.code} ออกจากงานวันนี้ ไปรอ ${pick ? PICK_WAIT_LABEL : SPEC_WAIT_LABEL}${
                  pick ? " · ถ้าไม่ตรง จะกลับมาเป็นการ์ดแดงที่ งานของฉัน" : ""
                }`
              );
              break;
            }
            /**
             * หัวหน้าภาค/แอดมินคอนเฟิร์มรายการของช่าง — อยู่หน้าใบงานต่อ (ตัวอย่าง: หัวหน้าภาคเห็นใบไปขั้นถัดไป)
             * กล่องงานได้แถบเขียวไว้ตอนกลับไป — การ์ดหายจากกลุ่ม "คอนเฟิร์มอะไหล่" ต้องบอกว่าไปไหน
             */
            case "pickConfirmed": {
              const next = await load();
              const label = next?.statusLabel ?? "";
              setFlash("MyQueue", { kind: "confirmed", id: before.id, code: before.code, label });
              showAlert(`คอนเฟิร์ม ${before.code} แล้ว`, label ? `ใบงานไปที่ ${label}` : undefined);
              break;
            }
            /**
             * ตีกลับรายการของช่าง — มาจากกล่องงาน: กลับไปพร้อมแถบแดง (กล่องงานวาดเอง ไม่ใช่ showAlert ที่หัวข้อลงท้าย "แล้ว" กลายเป็นสีเขียว)
             * เปิดจากที่อื่น: อยู่หน้านี้ ข้อความแบบแจ้งเฉย ๆ · แถบแดงรอไว้ที่กล่องงานเหมือนกัน
             */
            case "pickReturned": {
              const team = before.partsPick?.team ?? before.assignedTeam ?? null;
              setFlash("MyQueue", { kind: "returned", id: before.id, code: before.code, team });
              if (cameFromMyJobs()) {
                navigation.goBack();
                break;
              }
              await load();
              feedback.toast("info", `ตีกลับ ${before.code} ให้ทีม${team ?? "ที่ไปตรวจ"}แก้ — ใบงานกลับมาที่กล่องงานเมื่อช่างส่งใหม่`);
              break;
            }
            default:
              await reloadWithNotice();
          }
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
        files={files}
        refresh={refreshQuiet}
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
    {/*
      แถบตัดสินเคลมอยู่นอกส่วนที่เลื่อน (ต่อท้าย ScrollView ในกรอบใบงาน) — เลื่อนไปดูหลักฐานไหนก็ยังเห็นปุ่ม
      ไม่ใช่ position: fixed เพราะกรอบใบงานย่อ/ขยายได้ แถบต้องติดกรอบ ไม่ใช่ติดหน้าจอ
    */}
    {reviewMode ? (
      <DecisionBar v={verdicts} readOnly={!canDecideClaims(me)} />
    ) : null}
    </PopupScreen>
  );
}

/** บทบาทที่เห็นเหตุผลที่ตีกลับรายการอะไหล่ — ทีมที่ไปตรวจ หัวหน้าภาค แอดมิน (ข้อ 10: ไม่ไปถึงร้าน — ทีม Area ได้ null จากเซิร์ฟเวอร์อยู่แล้ว) */
const PICK_REASON_ROLES = ["EMPLOYEE", "SUPERVISOR", "ADMIN"];

/**
 * กล่องแดง "หัวหน้าภาคตีกลับรายการอะไหล่" — บนหัวฟอร์มผลตรวจและบนหน้าใบงาน ข้อความเดียวกัน (ตัวอย่าง tf.back)
 * ช่างต้องเห็นเหตุผลและตัวที่ถูกชี้ก่อนแก้ ไม่งั้นแก้ไม่ตรงจุดแล้วโดนตีกลับซ้ำ
 */
function PickReturnedBox({ pick }: { pick: PartsPickInfo }) {
  const flags = pick.flags ?? [];
  const who = pick.reviewedBy ? `${pick.reviewedBy.name} (${pick.reviewedBy.roleLabel})` : "—";
  return (
    <View style={styles.pickRed} role="alert" accessibilityLabel="กล่องตีกลับรายการอะไหล่">
      <Ionicons name="arrow-undo" size={18} color={colors.dangerInk} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={styles.pickRedTitle}>หัวหน้าภาคตีกลับรายการอะไหล่ — แก้แล้วส่งใหม่</Text>
        {pick.reason ? <Text style={styles.pickRedReason}>“{pick.reason}”</Text> : null}
        <Text style={styles.pickRedMeta}>
          {who}
          {pick.reviewedAt ? ` · ${dayTime(pick.reviewedAt)}` : ""}
          {flags.length ? ` · ชี้ว่าไม่ตรง: ${flags.map(pickName).join(", ")}` : ""}
        </Text>
      </View>
    </View>
  );
}

/**
 * กล่องของรอบเลือกอะไหล่บนหน้าใบงาน (ตัวอย่าง ord.box) — ทุกคนเห็นว่ารายการของช่างอยู่ตรงไหนแล้ว ไม่ต้องเปิดฟอร์ม
 * ฟ้า = ส่งแล้ว รอหัวหน้าภาคคอนเฟิร์ม · แดง = ถูกตีกลับ (เฉพาะคนที่เห็นเหตุผล) · เขียว = คอนเฟิร์มแล้ว จนกว่าจะปล่อยงาน
 * ช่างเห็นบรรทัดเพิ่มว่าตอนนี้ต้องทำอะไรไหม — ใบหายจากงานของฉันแล้ว ช่างที่เปิดจากลิงก์ต้องรู้ว่าไม่ได้ค้างที่ตัวเอง
 */
function PickBoxes({ order, role }: { order: WorkOrder; role: string | undefined }) {
  const tech = role === "EMPLOYEE";
  const pending = pickPending(order);
  if (pending) {
    return (
      <View style={styles.pickBlue} accessibilityLabel="อะไหล่ที่ช่างเลือก (รอคอนเฟิร์ม)">
        <Text style={styles.pickHead}>อะไหล่ที่ช่างเลือก (รอคอนเฟิร์ม)</Text>
        <Text style={styles.pickBlueTitle}>ส่งให้หัวหน้าภาคคอนเฟิร์มแล้ว · {dayTime(pending.sentAt)}</Text>
        <Text style={styles.pickSub}>
          ถ้าไม่ตรง หัวหน้าภาคจะตีกลับมาที่ งานของฉัน ของทีม{pending.team ?? order.assignedTeam ?? "ที่ไปตรวจ"} พร้อมเหตุผล
        </Text>
        <View style={styles.pickList}>
          {pending.items.map((i) => (
            <View key={i.sparePartId} style={styles.pickRow}>
              <Text style={styles.pickRowName}>
                <Text style={{ fontWeight: "800" }}>{i.partCode}</Text> {i.name}
              </Text>
              <Text style={styles.pickRowQty}>× {i.quantity} ตัว</Text>
            </View>
          ))}
        </View>
        {tech ? <Text style={styles.pickSub}>ใบนี้ออกจาก งานของฉัน แล้ว — ระหว่างรอไม่ต้องทำอะไร</Text> : null}
      </View>
    );
  }
  const returned = pickReturned(order);
  if (returned) return role && PICK_REASON_ROLES.includes(role) ? <PickReturnedBox pick={returned} /> : null;
  const done = order.partsPickConfirmed;
  if (done) {
    // "ใส่อะไหล่นอก / ค่าบริการ" เฉพาะใบที่มีจริง — ต้องเสนอราคาเพราะกฎแฟรนไชส์อย่างเดียวไม่ได้แปลว่ามีคนใส่อะไรเพิ่ม
    const extras = order.waitingParts.some((p) => p.offCatalog) || order.services.length > 0;
    const quote = done.quote ? (extras ? " และใส่อะไหล่นอก / ค่าบริการ — ต้องเสนอราคาลูกค้าก่อนนัด" : " — ต้องเสนอราคาลูกค้าก่อนนัด") : "";
    return (
      <View style={styles.pickGreen} accessibilityLabel="กล่องคอนเฟิร์มอะไหล่แล้ว">
        <Text style={styles.pickGreenTitle}>
          {done.roleLabel}คอนเฟิร์มอะไหล่แล้ว · {dayTime(done.at)}
        </Text>
        <Text style={styles.pickSub}>
          {done.byName ?? "—"} คอนเฟิร์มครบ {done.count} รายการ{quote} — แอดมินเช็คว่ามีของหรือหมด
        </Text>
        {tech ? <Text style={styles.pickSub}>ขั้นถัดไปของช่าง: งานจะกลับมาที่ งานของฉัน เมื่อหัวหน้าภาคปล่อยงาน</Text> : null}
      </View>
    );
  }
  return null;
}

/**
 * ขั้นที่ทำแล้ว — ใครทำ เมื่อไร บันทึกว่าอะไร ดึงจากประวัติของใบงาน
 *
 * เดิมต้องไล่อ่านประวัติทั้งก้อนเพื่อหาว่าใครจ่ายงาน ตอนนี้กดที่วงกลมของขั้นนั้นได้เลย
 */
const STAGE_ACTIONS: Record<string, string[]> = {
  // คอนเฟิร์ม/ตีกลับรายการที่ช่างเลือก = งานของขั้นระบุอะไหล่ (ใบอยู่ NEW ตอนกด) · ช่างเลือกอะไหล่ = แถวคู่กับส่งผลตรวจ
  NEW: ["PARTS_REQUESTED", "NO_PARTS", "INSPECT_REQUESTED", "PARTS_PICK_CONFIRMED", "PARTS_PICK_RETURNED"],
  INSPECT_CONFIRM: ["CONFIRMED", "RESCHEDULED"],
  INSPECT_DISPATCH: ["DISPATCHED"],
  INSPECTING: ["INSPECTED", "PARTS_PICKED", "PARTS_PICKED_ON_BEHALF"],
  WAITING_PARTS: ["PARTS_ARRIVED"],
  AWAITING_QUOTE: ["QUOTED", "QUOTE_SKIPPED"],
  AWAITING_PAYMENT: ["PAID"],
  PARTS_REQUESTED: ["PARTS_CHECKED"],
  PARTS_PICKUP: ["PICKED_UP"],
  PARTS_TRANSFER: ["TRANSFER_REQUESTED"],
  PARTS_IN_TRANSIT: ["TRANSFER_ARRIVED"],
  PARTS_SOURCING: ["PARTS_SOURCED", "PARTS_BACKORDERED"],
  // "เบิกอะไหล่" บนแถบรวมทั้งแอดมินเบิก ส่งให้หัวหน้าภาคเบิก/โอน และของถึง — โชว์เป็นรายการ ไม่ใช่แค่แถวล่าสุด
  ISSUE: ISSUE_LOGS,
  PARTS_CHECKED: ["ASSIGNED", "SCHEDULED"],
  AWAITING_CONFIRM: ["CONFIRMED", "RESCHEDULED"],
  ASSIGNED: ["DISPATCHED", "ASSIGNED"],
  // ขั้น "เข้างาน" (พ.ย. 69) — นับเป็นการเข้าขั้นด้วย เวลาค้างขั้นจึงเริ่มนับใหม่ตอนถึงหน้างาน = เวลาที่อยู่หน้างาน
  ARRIVE: ["ARRIVED"],
  IN_PROGRESS: ["CLOSED"],
};

/**
 * แถบขั้นตอนแบบใหม่ (พ.ย. 69 ตามแบบที่เจ้าของงานส่งมา)
 * ใต้ขั้นที่ทำแล้วบอกใครทำ วันไหน — จากประวัติชุดเดียวกับที่กดดูรายละเอียดขั้น (STAGE_ACTIONS)
 */
function stepDoneBy(stages: string[], logs: WorkOrder["logs"]) {
  const acts = new Set(stages.flatMap((st) => STAGE_ACTIONS[st] ?? []));
  const l = logs.filter((x) => acts.has(x.action)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)[0];
  if (!l) return null;
  const day = new Date(l.createdAt).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });
  return `${l.byName ?? "ระบบ"} · ${day}`;
}
/** เข้าขั้นปัจจุบันเมื่อไร — ประวัติล่าสุดที่ขยับขั้น (ทำขั้นใดขั้นหนึ่ง · ย้อนขั้น · เปิดใบ) */
function stageEnteredAt(order: WorkOrder) {
  const moves = new Set([...Object.values(STAGE_ACTIONS).flat(), "ROLLED_BACK", "CREATED"]);
  const l = order.logs.filter((x) => moves.has(x.action)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)[0];
  return new Date(l?.createdAt ?? order.createdAt);
}
/** วันที่ (YYYY-MM-DD เวลาไทย) ของเวลา ISO — holdUntil เก็บเป็นเที่ยงคืนเวลาไทย */
function dayOfIso(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}
/** หยุดนับวันค้างระหว่างระงับ — กฎเดียวกับ pausedSince ฝั่งเซิร์ฟเวอร์ (รายการกับหน้าใบงานนับตรงกัน) */
function pausedFrom(since: Date, span: { from: string; to: string } | null | undefined): Date {
  if (!span) return since;
  const from = Math.max(Date.parse(span.from), since.getTime());
  const to = Math.min(Date.parse(span.to), Date.now());
  return to > from ? new Date(since.getTime() + (to - from)) : since;
}
function stayText(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d) return `${d} วัน${h ? ` ${h} ชม.` : ""}`;
  if (h) return `${h} ชม.${m % 60 ? ` ${m % 60} นาที` : ""}`;
  return `${m % 60} นาที`;
}
/** เวลาแบบสั้นในแถบย้อนขั้น — วันนี้ = "11:45 น. (วันนี้)" · วันอื่น = วันที่เต็ม */
function whenShort(iso: string) {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  if (day(d) !== day(new Date())) return formatDateTime(iso);
  return `${d.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })} น. (วันนี้)`;
}
/** เลื่อนไปการ์ดประวัติ (เว็บ) — ปุ่มประวัติขั้นตอน / ดูบันทึกเหตุผล */
function goHistory() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  document.getElementById("order-history")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

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
  /**
   * ส่งผลตรวจพร้อมเลือกอะไหล่ = สองแถวประวัติที่เขียนในการกดครั้งเดียว (ส่งผลตรวจ · เลือกอะไหล่ ห่างกัน 1 มิลลิวินาที)
   * โชว์คู่กัน — แถวล่าสุดแถวเดียวคือแถวเลือกอะไหล่ แล้ว "ตรวจแล้วเจออะไร" หายไปจากหน้านี้
   */
  const inspected = stageValue === "INSPECTING" ? logs.find((l) => l.action === "INSPECTED") : undefined;
  const pickRows = inspected
    ? logs.filter(
        (l) =>
          (l.action === "PARTS_PICKED" || l.action === "PARTS_PICKED_ON_BEHALF") &&
          Math.abs(Date.parse(l.createdAt) - Date.parse(inspected.createdAt)) < 5000
      )
    : [];
  // ขั้นเบิกหลายคนทำต่อกัน (แอดมินเบิก → หัวหน้าภาคเบิก/โอน → ของถึง → เบิกส่งมอบ) — เรียงเก่าไปใหม่ให้อ่านเป็นลำดับ
  const many =
    stageValue === "ISSUE"
      ? logs.filter((l) => actions.includes(l.action)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
      : inspected && pickRows.length
        ? [inspected, ...pickRows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
        : null;
  // ประวัติเรียงใหม่ก่อนเก่า ตัวแรกที่เจอคือครั้งล่าสุด (ขั้นที่ถูกส่งกลับมาทำซ้ำจะเห็นรอบล่าสุด)
  // คอนเฟิร์ม/เลื่อน และส่งช่าง ใช้ทั้งงานตรวจและงานซ่อม — แยกด้วยขั้นที่ส่งต่อไป
  // (นัดตรวจของใบเก่าไป INSPECTING ตรง ใบใหม่ไป INSPECT_DISPATCH)
  const goesTo: Record<string, string[]> = {
    INSPECT_CONFIRM: ["INSPECT_DISPATCH", "INSPECTING"],
    INSPECT_DISPATCH: ["INSPECTING"],
    // คอนเฟิร์มแล้วไปเบิก (สายงานใหม่) หรือไปปล่อยงาน (เบิกแล้ว / สายงานเดิม)
    AWAITING_CONFIRM: ["ASSIGNED", "PARTS_REQUESTED"],
    ASSIGNED: ["IN_PROGRESS"],
  };
  const to = stageValue ? goesTo[stageValue] : undefined;
  const log = logs.find((l) => actions.includes(l.action) && (!to || to.includes(l.status)));
  return (
    <AppModal
      visible={stageValue !== null}
      title={`${stageValue === "ISSUE" ? "เบิกอะไหล่" : stageValue === "ARRIVE" ? "เข้างาน" : stage?.label ?? ""} — ทำแล้ว`}
      onClose={onClose}
      width={560}
    >
      {many ? (
        many.length ? (
          many.map((l) => (
            <View key={l.id} style={styles.stepInfoRow}>
              <Text style={styles.logAction}>{l.actionLabel}</Text>
              <Text style={styles.logMeta}>
                {l.byName ?? "—"} · {formatDateTime(l.createdAt)}
              </Text>
              {l.note ? <Text style={styles.sentBackText}>{l.note}</Text> : null}
            </View>
          ))
        ) : (
          <Text style={styles.waitingText}>ไม่พบบันทึกการเบิกในประวัติ (ใบเก่าก่อนมีระบบประวัติ)</Text>
        )
      ) : log ? (
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
  // ยี่ห้อที่กดในช่องอะไหล่ (เครื่องที่ยังไม่รู้ยี่ห้อ) — ส่งไปจำไว้กับเครื่องพร้อมคำขอ
  const [pickedBrand, setPickedBrand] = useState<string | null>(null);
  const [files, setFiles] = useState<PickedAttachment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setReasonCode(null);
    setReason("");
    setParts([]);
    setPickedBrand(null);
    setFiles([]);
    setError(null);
  }, [visible]);
  // ขอเบิกเพิ่ม = ของที่ต้องใช้ใหม่ทุกตัว ไม่มีแถวเดิมที่ปล่อยผ่าน (ข้อ 3 · เซิร์ฟเวอร์ legacy ว่าง)
  const brandBlock = brandBlockText(brandBlockers(parts, order.partsBrand, pickedBrand), order.partsBrand);

  async function addFile(
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | PickedAttachment[] | null>
  ) {
    setBusy("กำลังเตรียมไฟล์");
    try {
      const got = asList(await pick(setBusy));
      if (got.length) setFiles((v) => [...v, ...got]);
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
        await uploadAttachment(order.id, file, undefined, undefined, { index: i, total: files.length });
      }
      setBusy("กำลังส่งกลับ");
      const machineBrand = machineBrandToSend(order.partsBrand, pickedBrand);
      await api.post(`/work-orders/${order.id}/reassess-parts`, {
        reasonCode,
        reason: reason.trim(),
        parts: parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
        ...(machineBrand ? { machineBrand } : {}),
        // ตัวที่ยืนยันใช้ข้ามยี่ห้อ — กติกาเดียวกับป้ายบนจอ (เซิร์ฟเวอร์ไม่มีแถวเดิมที่ปล่อยผ่าน)
        ...crossBrandField(parts, order.partsBrand, pickedBrand),
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
            style={[styles.modalSave, (saving || !reason.trim() || !reasonCode || !!brandBlock) && styles.modalSaveOff]}
            onPress={submit}
            disabled={saving || !reason.trim() || !reasonCode || !!brandBlock}
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
      {/*
        ใบไปไหนต่อขึ้นกับเหตุผล (กฎเดียวกับ reassess-parts ฝั่งเซิร์ฟเวอร์) — เดิมบอกว่าวันนัดถูกล้างทุกกรณี
        ทั้งที่ร้านปิดวันเดิมยังอยู่ให้แอดมินนัดใหม่ ทีมเดิม อะไหล่เดิม
      */}
      <Text style={styles.linkedText}>
        {parts.length > 0 || reasonCode === "PARTS" || reasonCode === "INSPECT"
          ? "ใบกลับไปให้หัวหน้าภาคระบุอะไหล่ใหม่ (หรือส่งช่างเข้าตรวจ) — วันนัดรอบนี้ถูกล้าง"
          : reasonCode === "SHOP"
            ? "ใบไปให้แอดมินโทรนัดร้านใหม่ — ทีมเดิม อะไหล่เดิม แล้วหัวหน้าภาครับทราบก่อนปล่อยงานอีกครั้ง"
            : reasonCode
              ? "ใบกลับไปให้หัวหน้าภาคจ่ายงานใหม่ (เปลี่ยนทีม/วันได้) — วันนัดรอบนี้ถูกล้าง"
              : "เลือกเหตุผลก่อน — ใบไปต่อตามเหตุผลที่เลือก"}
        {" · "}ข้อมูลเดิมอยู่ครบ (อะไหล่ที่เบิกแล้ว รูป ประวัติ)
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
      <FileDropZone
        hint="รูป · วิดีโอ"
        disabled={!!busy}
        label="วางรูปที่เจอหน้างาน"
        onFiles={(dropped) => addFile((stage) => filesToAttachments(dropped, { image: true, video: true }, stage))}
      >
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
              onPress={() => addFile(pickImageAttachments)}
              activeOpacity={0.7}
            >
              <Text style={styles.optionText}>เลือกรูป</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.option}
              onPress={() => addFile(pickVideoAttachments)}
              activeOpacity={0.7}
            >
              <Text style={styles.optionText}>วิดีโอ</Text>
            </TouchableOpacity>
          </View>
        )}
        {!busy ? <DropHint /> : null}
      </FileDropZone>

      {/* ช่างเห็นของจริงว่าเสียตรงไหน จึงเลือกเองได้เลย ไม่ต้องรอให้ใครเดาแทน */}
      <PartPicker
        parts={parts}
        onChange={setParts}
        label="อะไหล่ที่ขอเบิกเพิ่ม"
        brand={order.partsBrand}
        chosenBrand={pickedBrand}
        onBrandChosen={setPickedBrand}
        saveWhen="ตอนส่งกลับ"
        noResultHints={[
          "ตัวที่ต้องใช้ไม่มีในไฟล์นี้: เขียนชื่อไว้ใน “เจออะไรที่หน้างาน” หัวหน้าภาคจะตัดสินใจต่อ",
          "ยี่ห้อในระบบไม่ตรงกับเครื่องจริง? ถ่ายป้ายเครื่องแล้วเขียนใน “เจออะไรที่หน้างาน” — หัวหน้าภาคแก้ยี่ห้อเครื่องให้",
        ]}
      />
      <Text style={styles.linkedText}>
        ยังบอกไม่ได้ว่าต้องใช้ตัวไหน เว้นว่างได้ — หัวหน้าภาคจะเป็นคนระบุแทน
      </Text>
      {brandBlock ? <Text style={styles.warn}>{brandBlock}</Text> : null}

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
/**
 * แก้ยี่ห้อเครื่อง (หัวหน้าภาค/แอดมิน · ข้อ 23) — ยี่ห้อในระบบไม่ตรงกับเครื่องจริง ช่างถ่ายป้ายเครื่องมาบอก
 * ยี่ห้อตัดสินไฟล์อะไหล่ที่เลือกได้ อายุประกัน และการเสนอราคา ของทุกใบของเครื่องนี้ — บอกก่อนกด ไม่ใช่หลังกด
 * ยี่ห้อที่มาจากไฟล์รายงานเครื่อง: เซิร์ฟเวอร์แก้ให้ทั้งสองช่อง แต่นำเข้ารายงานครั้งหน้าจะทับกลับ — เตือนให้แก้ที่ต้นทางด้วย
 */
function MachineBrandModal({
  order,
  onClose,
  onDone,
}: {
  order: WorkOrder;
  onClose: () => void;
  onDone: (brand: string, fromReport: boolean) => void | Promise<void>;
}) {
  const current = order.partsBrand?.make ?? null;
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = value?.trim() || null;
  const same = !!chosen && !!current && chosen.toLowerCase() === current.trim().toLowerCase();
  const nextFile = brandFileOf(chosen);
  const ready = !!chosen && !same && !saving;

  async function save() {
    if (!ready || !chosen) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.put<{ fromReport?: boolean }>(`/work-orders/${order.id}/machine-brand`, { brand: chosen });
      await onDone(chosen, !!res.data.fromReport);
    } catch (e) {
      // 409 (มีคนแก้ยี่ห้อระหว่างนี้) ตัวจัดการกลางโหลดใบใหม่และเตือนให้แล้ว — ปิดชีต ไม่บอกซ้ำสองที่
      if (staleWorkOrderId(e) !== null) onClose();
      else setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      visible
      onClose={onClose}
      busy={saving}
      title={`แก้ยี่ห้อเครื่อง ${order.machineCode ?? ""}`}
      subtitle="ยี่ห้อนี้ใช้หาไฟล์อะไหล่ คิดอายุประกัน และการเสนอราคา"
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalSave, !ready && styles.modalSaveOff]}
            onPress={save}
            disabled={!ready}
            activeOpacity={0.8}
          >
            {saving ? <Spinner color="#fff" size="small" /> : <Text style={styles.modalSaveText}>บันทึกยี่ห้อเครื่อง</Text>}
          </TouchableOpacity>
        </View>
      }
    >
      <Text style={styles.linkedText}>
        ยี่ห้อในระบบตอนนี้: {current ?? "ยังไม่รู้ยี่ห้อ"}
        {order.partsBrand?.file ? ` (ไฟล์อะไหล่ ${order.partsBrand.file})` : ""}
      </Text>
      {order.partsBrand?.fromReport ? (
        <Text style={styles.warn}>ยี่ห้อนี้มาจากรายงานเครื่อง — แก้ในไฟล์รายงานด้วย ไม่งั้นนำเข้าครั้งหน้าทับกลับ</Text>
      ) : null}
      <View style={{ marginTop: spacing.lg }}>
        <BrandChips value={value} onChange={setValue} machineCode={order.machineCode} label="ยี่ห้อที่ถูกต้อง" disabled={saving} />
      </View>
      {same ? <Text style={styles.linkedText}>ยี่ห้อเดิม — ไม่ได้เปลี่ยน</Text> : null}
      {chosen && !same && nextFile ? (
        <Text style={styles.linkedText}>
          บันทึกแล้วช่องเลือกอะไหล่ของเครื่องนี้ใช้ไฟล์ {nextFile}
          {nextFile === "Other" ? " (ไม่มีไฟล์ยี่ห้อของตัวเอง เลือกได้เฉพาะของใช้ร่วม)" : " และของใช้ร่วม (ไฟล์ Other)"}
          {" "}· อายุประกันและการเสนอราคาของทุกใบของเครื่องนี้คิดตามยี่ห้อใหม่
        </Text>
      ) : null}
      {error ? <Text style={styles.modalError}>{error}</Text> : null}
    </AppModal>
  );
}

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
  const { user: me } = useAuth();
  const [parts, setParts] = useState<PickedPart[]>([]);
  const [pickedBrand, setPickedBrand] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * ทางออกตอนค้นไม่เจอ — ช่างไม่มีลิงก์ "แก้ยี่ห้อเครื่อง" (เฉพาะหัวหน้าภาค/แอดมิน) จึงต้องบอกทางของช่างเอง (ข้อ 20 · 23)
   * ไม่งั้นช่างเห็นแต่ "หัวหน้าภาคแก้ได้ที่หน้าใบงาน" แล้วไม่รู้ว่าตัวเองต้องทำอะไรต่อ
   */
  const techHints =
    me?.role === "SUPERVISOR" || me?.role === "ADMIN"
      ? undefined
      : [
          "ตัวที่ต้องใช้ไม่มีในไฟล์นี้: บอกหัวหน้าภาค — หัวหน้าภาคจะตัดสินใจต่อ",
          "ยี่ห้อในระบบไม่ตรงกับเครื่องจริง? ถ่ายป้ายเครื่องแล้วบอกหัวหน้าภาค — หัวหน้าภาคแก้ยี่ห้อเครื่องให้",
        ];

  useEffect(() => {
    if (!visible) return;
    setParts([]);
    setPickedBrand(null);
    setNote("");
    setError(null);
  }, [visible]);
  // ของที่อยู่ในใบเดิมแล้ว (รอ + ใช้) ปล่อยผ่าน — กติกาเดียวกับเซิร์ฟเวอร์ (legacy = รอ ∪ ใช้แล้วของใบเดิม)
  const legacy = useMemo(() => onOrderIds(order), [order]);
  const brandBlock = brandBlockText(brandBlockers(parts, order.partsBrand, pickedBrand, { legacyIds: legacy }), order.partsBrand);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const machineBrand = machineBrandToSend(order.partsBrand, pickedBrand);
      const res = await api.post<{ createdChild: { code: string } }>(
        `/work-orders/${order.id}/follow-up`,
        {
          parts: parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
          note: note.trim() || undefined,
          ...(machineBrand ? { machineBrand } : {}),
          ...crossBrandField(parts, order.partsBrand, pickedBrand, { legacyIds: legacy }),
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
            style={[styles.modalSave, (saving || parts.length === 0 || !!brandBlock) && styles.modalSaveOff]}
            onPress={submit}
            disabled={saving || parts.length === 0 || !!brandBlock}
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
      <PartPicker
        parts={parts}
        onChange={setParts}
        label="อะไหล่ที่ยังขาด"
        brand={order.partsBrand}
        chosenBrand={pickedBrand}
        onBrandChosen={setPickedBrand}
        legacyIds={legacy}
        saveWhen="ตอนเปิดใบงาน"
        noResultHints={techHints}
      />
      {brandBlock ? <Text style={styles.warn}>{brandBlock}</Text> : null}
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
 * ระงับชั่วคราว (เจ้าของงานเลือก พ.ย. 69) — เหตุผล + วันที่กลับมาทำ (พรุ่งนี้ถึง 60 วัน — เซิร์ฟเวอร์ตรวจซ้ำ)
 * ใบออกจากกล่องงานทุกคนและหยุดนับวันค้างจนถึงวันนั้น · กดกลับมาทำต่อก่อนกำหนดได้ที่แถบบนหน้าใบงาน
 */
function HoldModal({ order, onCancel, onDone }: { order: WorkOrder; onCancel: () => void; onDone: () => void }) {
  const [day, setDay] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tomorrow = (() => {
    const d = new Date(`${todayBkk()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const off = saving || !/^\d{4}-\d{2}-\d{2}$/.test(day) || reason.trim().length < 5;

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/work-orders/${order.id}/hold`, { reason: reason.trim(), until: day });
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      visible
      onClose={onCancel}
      busy={saving}
      title={<>ระงับการปฏิบัติงานชั่วคราว · {order.code}</>}
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
            accessibilityLabel="ยืนยันระงับชั่วคราว"
          >
            {saving ? <Spinner color="#fff" size="small" /> : <Text style={styles.modalSaveText}>ระงับชั่วคราว</Text>}
          </TouchableOpacity>
        </View>
      }
    >
      <Text style={styles.linkedText}>
        ใบนี้จะออกจากกล่องงานของทุกคนและหยุดนับวันค้าง จนถึงวันที่เลือก แล้วกลับเข้ากล่องเอง — กลับมาทำต่อก่อนกำหนดได้
      </Text>
      <DateField value={day} onChange={setDay} label="กลับมาทำต่อวันที่" required min={tomorrow} />
      <Text style={styles.modalLabel}>เหตุผล</Text>
      <TextInput
        style={styles.modalInput}
        value={reason}
        onChangeText={setReason}
        placeholder="เช่น ร้านปิดปรับปรุงถึงสิ้นเดือน"
        placeholderTextColor={colors.textFaint}
        multiline
        numberOfLines={2}
        accessibilityLabel="เหตุผลที่ระงับ"
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

/**
 * แอดมินเลื่อนวันนัด (เจ้าของงานขอ ต.ค. 69 — "ได้ตลอดจนช่างเข้างาน")
 *
 * เดิมเปลี่ยนวันได้แค่ในฟอร์มคอนเฟิร์ม หรือย้อนขั้นไปนัดใหม่ ซึ่งล้างทีมและเลขใบโอนของที่กำลังโอน
 * ตอนนี้ใบอยู่ขั้นเบิก/โอนหลายวันโดยมีวันนัดแล้ว — แก้แค่วัน/เวลา ใบอยู่ขั้นเดิม ทีม อะไหล่ การโอน สถานะนัดไม่แตะ
 * ปล่อยให้ช่างแล้วแต่ช่างยังไม่ถึงหน้างาน = ดึงใบคืนให้หัวหน้าภาครับทราบวันใหม่แล้วปล่อยใหม่ (ทีมวันใหม่อาจไม่ว่าง)
 * บังคับเหตุผล — หัวหน้าภาคต้องรู้ว่าทำไมวันเปลี่ยน ตอนคอนเฟิร์มวันใหม่ก่อนปล่อยงาน
 */
/** ผลของฟอร์มเลื่อนวันนัด — หน้าใบงานประกอบข้อความ "เลื่อนวันนัด <ใบ> เป็น … แล้ว" จากนี้ (ticked = ส่ง urgent:true ไปจริง) */
type RescheduleDone = { day: string; ticked: boolean; detail: WorkOrder | null };

function RescheduleModal({
  order,
  adminWarehouse,
  onCancel,
  onDone,
}: {
  order: WorkOrder;
  adminWarehouse: string;
  onCancel: () => void;
  onDone: (r: RescheduleDone) => void;
}) {
  const oldDay = order.scheduledAt ? order.scheduledAt.slice(0, 10) : "";
  /**
   * เวลาปิดนัดงานพรุ่งนี้ — นาฬิกาเซิร์ฟเวอร์ของฟอร์มนี้ (ไม่ใช้นาฬิกามือถือ — ข้อ 12) บรรทัดใต้วันพลิกเองตอนถึงเวลาปิด
   * ฟอร์มวาดเฉพาะตอนเปิด (หน้าใบงานถอดออกตอนปิด) นาฬิกาจึงเดินเฉพาะตอนที่มีคนดูอยู่
   * clock = นาฬิกา/เวลาปิดจากคำตอบ 400 DATE_CLOSED (กดแล้วเพิ่งเลยเวลาปิด) — คิดใหม่ในที่เดิม เหตุผล/เวลาที่กรอกไม่หาย
   * rule = ใบทดสอบไม่มีกฎ (เซิร์ฟเวอร์ยกเว้นทุกทาง) — ไม่มีบรรทัด ไม่มีช่องติ๊ก ไม่ส่ง urgent
   */
  const [clock, setClock] = useState<{ serverNow: string; cutoff: Cutoff } | null>(null);
  const cutoff = clock?.cutoff ?? order.cutoff;
  const now = useServerClock(clock?.serverNow ?? order.serverNow, cutoff?.time);
  const rule = order.isTest ? null : cutoff ?? null;
  /**
   * วันตั้งต้น = วันเดิม — เลื่อนปกติ (ของมาไม่ทัน · ร้านขอ) มักขยับจากนัดเดิมไม่กี่วัน
   * (รุ่นก่อนเริ่มที่วันแรกที่ปล่อยได้สำหรับใบที่ล็อก — ขั้นปล่อยงานไม่ล็อกแล้ว ไม่มีวันไหนที่ "ใช้ไม่ได้แน่ ๆ")
   */
  const [day, setDay] = useState(oldDay);
  const [time, setTime] = useState(order.scheduledTime ?? "");
  const [reason, setReason] = useState("");
  // แก้เป็นงานด่วนไปพร้อมกัน — ล้างทุกครั้งที่เปลี่ยนวัน: ติ๊กไว้สำหรับวันหนึ่ง ไม่ได้แปลว่าตั้งใจปลดล็อกอีกวัน
  const [urgentWith, setUrgentWith] = useState(false);
  useEffect(() => setUrgentWith(false), [day]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validDay = /^\d{4}-\d{2}-\d{2}$/.test(day);
  // ปฏิทินขีดฆ่าวันที่ผ่านแล้ว แต่วันเดิมที่เติมไว้อาจผ่านไปแล้ว (ใบเลยนัด) — กันปุ่มไว้ด้วย เซิร์ฟเวอร์กันซ้ำ
  const past = validDay && day < todayBkk();
  const timeOk = time === "" || isTime(time);
  const unchanged = day === oldDay && time === (order.scheduledTime ?? "");
  const recall = RECALL_STAGES.includes(order.status);
  const confirmed = APPOINTMENT_DONE.includes(order.appointmentStatus ?? "");
  // ของยังโอนไม่ถึง แล้วเลื่อนให้เร็วขึ้น — ของอาจไปไม่ทันวันใหม่ (แค่เตือน ไม่กัน: แอดมินอาจรู้ว่าของจะถึงทัน)
  const moving = order.waitingParts.filter((p) => inTransit(p) || isTransfer(p, adminWarehouse));
  const earlier = validDay && !!oldDay && day < oldDay;
  /**
   * วันใหม่ที่ปิดนัดแล้ว (วันนี้ · พรุ่งนี้หลังเวลาปิด) ต้องติ๊ก "แก้เป็นงานด่วนไปพร้อมกัน" (เจ้าของงานข้อ 4) — ใช้กับดึงงานคืนด้วย (ฟอร์มเดียวกัน)
   * เปลี่ยนแค่เวลาในวันเดิมไม่มีกฎ (เซิร์ฟเวอร์ก็ไม่ดู) — ส่งวันเข้าบรรทัดเฉพาะตอนวันเปลี่ยน ไม่งั้นใบพรุ่งนี้เลื่อนเวลาหลัง 16:00 ต้องติ๊กเปล่า ๆ
   * วันย้อนหลังมีบรรทัดของมันเอง ไม่ขึ้นซ้อน
   */
  const dayChanged = validDay && !past && day !== oldDay;
  const line = adminDayLine(dayChanged ? day : null, now, rule, order.urgentReleaseFor, true);
  const needTick = !!line?.needTick;

  async function submit() {
    setSaving(true);
    setError(null);
    const ticked = needTick && urgentWith;
    try {
      const res = await api.post<WorkOrder>(`/work-orders/${order.id}/reschedule`, {
        scheduledAt: day,
        scheduledTime: time || null,
        reason: reason.trim(),
        // ส่งเฉพาะตอนบรรทัดขอให้ติ๊กและติ๊กไว้ — วันที่ยังเปิดเซิร์ฟเวอร์ไม่สนอยู่แล้ว แต่ไม่ส่งสิ่งที่ผู้ใช้ไม่ได้ตั้งใจ
        ...(ticked ? { urgent: true } : {}),
      });
      onDone({ day, ticked, detail: res.data && typeof res.data === "object" && "status" in res.data ? res.data : null });
    } catch (e) {
      /**
       * วันใหม่เพิ่งปิดนัดตอนคำขอไปถึง (เปิดฟอร์มก่อนเวลาปิด · มือถือช้า) — คิดใหม่จากนาฬิกาในคำตอบ บรรทัดแดง + ช่องติ๊กขึ้นในที่เดิม
       * ข้อความเซิร์ฟเวอร์ขึ้นด้วยเฉพาะตอนฟอร์มยังไม่เห็นว่าต้องติ๊ก (บรรทัดแดงบอกเรื่องเดียวกันอยู่แล้ว สองข้อความซ้อนกันคนอ่านไม่ทันทั้งคู่)
       * 409 อื่น (ขั้นเปลี่ยน · ช่างถึงหน้างานแล้ว) หน้าใบงานปิดฟอร์มและโหลดใหม่ให้เอง (subscribeWorkOrderStale)
       */
      const closed = closedFromError(e);
      if (closed) {
        setClock(closed);
        const again = adminDayLine(day, Date.parse(closed.serverNow), order.isTest ? null : closed.cutoff, order.urgentReleaseFor, true);
        if (!again?.needTick) setError(apiErrorMessage(e));
        return;
      }
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const off = saving || !validDay || past || !timeOk || unchanged || !reason.trim() || (needTick && !urgentWith);
  const stage = order.statusLabel.split(" · ").slice(1).join(" · ") || order.statusLabel;
  return (
    <AppModal
      visible
      onClose={onCancel}
      busy={saving}
      title={<>เลื่อนวันนัด · {order.code}</>}
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
            accessibilityLabel="บันทึกวันนัดใหม่"
          >
            {saving ? <Spinner color="#fff" size="small" /> : <Text style={styles.modalSaveText}>บันทึกวันนัดใหม่</Text>}
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.issuedBox} accessibilityLabel="นัดเดิม">
        <Text style={styles.issuedTitle}>นัดเดิม</Text>
        <Text style={styles.issuedLine}>
          {visitLabel(order)}
          {order.assignedTeam ? ` · ทีม${order.assignedTeam}` : ""}
          {order.appointmentStatusLabel ? ` · ${order.appointmentStatusLabel}` : ""}
        </Text>
      </View>
      <DateField
        value={day}
        onChange={setDay}
        label="วันนัดใหม่"
        required
        min={todayBkk()}
        dayTags={scheduleDayTags(now, rule, order.urgentReleaseFor, "admin")}
        invalid={needTick && !urgentWith}
      />
      {past ? <Text style={styles.warn}>วันนัดย้อนหลังไม่ได้ — เลือกตั้งแต่วันนี้เป็นต้นไป</Text> : null}
      <AdminDayLine
        day={dayChanged ? day : null}
        now={now}
        cutoff={rule}
        urgentFor={order.urgentReleaseFor}
        changed
        tick={urgentWith}
        onTick={setUrgentWith}
        busy={saving}
      />
      <TimeField value={time} onChange={setTime} label="เวลา (ไม่ใส่ก็ได้)" />
      {unchanged && validDay ? <Text style={styles.linkedText}>ยังเป็นวันและเวลาเดิม — เลือกวันหรือเวลาใหม่</Text> : null}
      {moving.length && earlier ? (
        <Text style={styles.warn} accessibilityLabel="ของยังโอนไม่ถึง">
          ของยังโอนไม่ถึง
          {moving.some((p) => p.transferNo) ? ` (ใบโอน ${[...new Set(moving.map((p) => p.transferNo).filter(Boolean))].join(", ")})` : ""} — เลื่อนเร็วขึ้นอาจไม่ทัน
        </Text>
      ) : null}
      <Text style={styles.modalLabel}>เหตุผลที่เลื่อน *</Text>
      <TextInput
        style={styles.modalInput}
        value={reason}
        onChangeText={setReason}
        placeholder="เช่น ลูกค้าขอเลื่อน · ของโอนไม่ทัน · ทีมติดงานด่วน"
        placeholderTextColor={colors.textFaint}
        multiline
        numberOfLines={2}
        accessibilityLabel="เหตุผลที่เลื่อนวันนัด"
      />
      <NextBox>
        {recall
          ? "ช่างยังไม่ถึงหน้างาน — ใบถูกดึงคืนจากช่าง กลับไปให้หัวหน้าภาคคอนเฟิร์มวันใหม่แล้วปล่อยงานอีกครั้ง (ทีมไม่ว่าง → ส่งกลับให้คุณนัดใหม่)"
          : order.status === "ASSIGNED" || order.status === "INSPECT_DISPATCH"
            ? "ใบยังอยู่ที่หัวหน้าภาค — ต้องคอนเฟิร์มวันใหม่ก่อนปล่อยงาน (ทีมไม่ว่าง → ส่งกลับให้คุณนัดใหม่)"
            : confirmed
              ? `ใบยังอยู่ขั้น “${stage}” · บอร์ดแผนงานย้ายไปวันใหม่ · ลูกค้าตกลงวันใหม่แล้ว · หัวหน้าภาคคอนเฟิร์มวันใหม่ก่อนปล่อยงาน`
              : order.status === "AWAITING_CONFIRM"
                ? `ใบยังอยู่ขั้น “${stage}” (ยังไม่นับว่าลูกค้าคอนเฟิร์ม) · บอร์ดแผนงานย้ายไปวันใหม่ · โทรคอนเฟิร์มลูกค้าตามวันใหม่ด้วยปุ่มคอนเฟิร์มลูกค้า · หัวหน้าภาคคอนเฟิร์มวันใหม่ก่อนปล่อยงาน`
                : `ใบยังอยู่ขั้น “${stage}” · บอร์ดแผนงานย้ายไปวันใหม่ · ของพร้อมแล้วแอดมินโทรคอนเฟิร์มลูกค้าตามวันใหม่ · หัวหน้าภาคคอนเฟิร์มวันใหม่ก่อนปล่อยงาน`}
        {confirmed ? " · บันทึกแล้วเปิดข้อความแจ้งวันใหม่ให้ร้าน" : ""}
      </NextBox>
      {/*
        ขั้นคอนเฟิร์มมีสองทางเปลี่ยนวัน — ฟอร์มนี้ย้ายวันเฉย ๆ (ร้านยังไม่ได้ตกลง)
        ร้านตกลงวันอื่นแล้วต้องใช้ "ลูกค้าขอเลื่อน" ในฟอร์มคอนเฟิร์ม ไม่งั้นใบค้างรอคอนเฟิร์มทั้งที่โทรแล้ว
      */}
      {order.status === "AWAITING_CONFIRM" && !confirmed ? (
        <Text style={styles.linkedText} accessibilityLabel="โทรแล้วร้านตกลงวันอื่น">
          โทรแล้วร้านตกลงวันอื่น → ใช้ปุ่มคอนเฟิร์มลูกค้า เลือก “ลูกค้าขอเลื่อน / เปลี่ยนวัน” แทน (บันทึกว่าลูกค้าคอนเฟิร์มแล้ว)
        </Text>
      ) : null}
      {error ? <Text style={styles.modalError}>{error}</Text> : null}
    </AppModal>
  );
}

function StageBackModal({
  visible,
  order,
  targets,
  stages,
  canReschedule,
  onCancel,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  targets: Stage[];
  /** ลำดับขั้นของเซิร์ฟเวอร์ — อะไรถูกล้างตัดสินจากลำดับนี้ (rollback ฝั่งเซิร์ฟเวอร์ใช้ลำดับเดียวกัน) */
  stages: Stage[];
  /** แอดมินที่เลื่อนวันนัดได้ — บอกทางลัด ไม่ต้องย้อนขั้นเพื่อเปลี่ยนวัน */
  canReschedule: boolean;
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
  /**
   * ย้อนแล้วอะไรถูกเอาออกจากใบ — กฎเดียวกับ rollback ฝั่งเซิร์ฟเวอร์ ตามลำดับขั้นของเซิร์ฟเวอร์
   * (เดิมเขียนลำดับไว้ในแอปเอง แล้วลำดับเปลี่ยนสองรอบ รายการนี้บอกผิดโดยไม่มีใครเห็น)
   */
  function clears(value: string) {
    const all = stages.map((x) => x.value);
    const idx = all.indexOf(value);
    const upTo = (stage: string) => idx >= 0 && idx <= all.indexOf(stage);
    const lost: string[] = [];
    if (upTo("PARTS_CHECKED") && value !== "INSPECT_DISPATCH" && order.scheduledAt) lost.push("วันนัด");
    if (upTo("PARTS_CHECKED") && !["INSPECTING", "INSPECT_DISPATCH", "INSPECT_CONFIRM"].includes(value) && order.assignedTeam)
      lost.push("ทีมที่รับงาน");
    if (value === "PARTS_REQUESTED" && order.waitingParts.some((p) => p.requisitionNo || p.transferNo))
      lost.push("เลขใบเบิกและการโอน (ผลเช็คคลังยังอยู่)");
    if (upTo("PARTS_SOURCING") && order.waitingParts.some((p) => p.inStock !== null)) lost.push("ผลเช็คคลังและเลขใบเบิก");
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
      {target === "AWAITING_CONFIRM" && APPOINTMENT_DONE.includes(order.appointmentStatus ?? "") ? (
        <Text style={styles.linkedText}>สถานะนัดกลับเป็นรอคอนเฟิร์ม — แอดมินโทรคอนเฟิร์มร้านอีกครั้ง</Text>
      ) : null}
      <Text style={styles.modalLabel}>เหตุผลที่ย้อน</Text>
      {/* แค่เปลี่ยนวันไม่ต้องย้อนขั้น — ย้อนไปนัดใหม่ล้างทีมและการโอนไปด้วย ซึ่งไม่ได้ตั้งใจ */}
      {canReschedule ? (
        <Text style={styles.linkedText}>แค่เลื่อนวัน ใช้ปุ่ม “เลื่อนวันนัด” — ไม่ต้องย้อนขั้น</Text>
      ) : null}
      <TextInput
        style={styles.modalInput}
        value={reason}
        onChangeText={setReason}
        placeholder="เช่น จ่ายผิดทีม · เช็คคลังผิดตัว"
        placeholderTextColor={colors.textFaint}
        multiline
        numberOfLines={2}
        accessibilityLabel="เหตุผลที่ย้อน"
      />
      {error ? <Text style={styles.modalError}>{error}</Text> : null}
    </AppModal>
  );
}

/**
 * ชนิดของการบันทึกที่ฟอร์มขั้นตอนบอกหน้าใบงาน — หน้าใบงานเลือกข้อความหลังบันทึกตามนี้ในสวิตช์เดียว (ไม่ส่ง = ข้อความทั่วไป)
 * confirmed = เพิ่งคอนเฟิร์มนัดกับลูกค้า (เปิดข้อความแจ้งลูกค้าต่อ) · released = ปล่อยงาน/ส่งช่างตรวจแล้ว · declined = ส่งกลับแอดมินนัดใหม่
 * เลือกอะไหล่ตอนตรวจหน้างาน: pickSent = ช่างส่งผลตรวจพร้อมรายการอะไหล่ · inspectionSent = ช่างส่งผลตรวจไม่เลือกอะไหล่
 * (ใบออกจากงานของฉันทั้งสองแบบ — ข้อ 13) · pickConfirmed / pickReturned = หัวหน้าภาค/แอดมินคอนเฟิร์ม/ตีกลับรายการของช่าง
 * เปิดปลายไว้ (string) ให้ฟีเจอร์ที่ตามมาเติมชนิดของตัวเองในสวิตช์เดิม ไม่สร้างทางที่สองคู่กัน (integration G4)
 */
type StageDoneKind =
  | "confirmed"
  | "released"
  | "declined"
  | "pickSent"
  | "inspectionSent"
  | "pickConfirmed"
  | "pickReturned"
  | (string & {});

/** ใบนี้มีเครื่องไหม (ใบทั้งสาขา: ช่องของช่างเลือกได้แค่อะไหล่นอกเครื่อง) — เซิร์ฟเวอร์รุ่นก่อนไม่ส่ง partsBrand ดูจากรหัสเครื่องแทน */
function inspectHasMachine(o: WorkOrder): boolean {
  return o.partsBrand ? o.partsBrand.machine : !!o.machineCode;
}

/**
 * รายการตั้งต้นของข้อ 5 "อะไหล่ที่ต้องใช้" (ข้อ 5 ของเจ้าของงาน) — ถูกตีกลับ = รายการที่ส่งไปรอบนั้น (ช่างแก้จากของเดิม)
 * ไม่งั้น = อะไหล่ในสโตร์ที่อยู่ในใบอยู่แล้ว (แก้/เอาออกได้ · ที่ช่างส่งไปแทนทั้งชุด)
 * ของนอกสโตร์ไม่เติม: ช่างใส่/เอาออกตอนตรวจไม่ได้ (ข้อ 21) หัวหน้าภาคจัดการที่หน้าคอนเฟิร์ม
 * ใบไม่มีเครื่อง = เฉพาะอะไหล่นอกเครื่อง (ตัวที่ช่างเลือก/เอาออกเองได้ — 4 พ.ย. 69) · อะไหล่ของเครื่องที่หัวหน้าภาคใส่ไว้ไม่เติม
 *   เติมแล้วช่างต้องเอาออกก่อนส่ง (เซิร์ฟเวอร์ปฏิเสธอะไหล่ของเครื่องบนใบไม่มีเครื่อง) = บังคับให้ลบของหัวหน้าภาค
 * แถวที่เบิกแล้วติดป้าย "เบิกแล้ว · ใบเบิก …" — ของอยู่กับช่างแล้ว เอาออกจากรายการไม่ได้ทำให้ของหายจากใบ (ค่าตั้งต้น D1)
 */
function inspectPrefill(o: WorkOrder): PickedPart[] {
  const machine = inspectHasMachine(o);
  const waiting = new Map(o.waitingParts.map((p) => [p.sparePartId, p]));
  const back = pickReturned(o);
  const rows: PickedPart[] = back
    ? back.items.map((i) => {
        const w = waiting.get(i.sparePartId);
        return {
          sparePartId: i.sparePartId,
          partCode: i.partCode,
          name: i.name,
          brand: null,
          quantity: i.quantity,
          partNo: i.partNo,
          brandFiles: i.brandFiles,
          ...(w?.issued ? { issued: true, requisitionNo: w.requisitionNo } : {}),
        };
      })
    : o.waitingParts
        .filter((p) => !p.offCatalog && (machine || isOutsidePart(p)))
        .map((p) => ({
          sparePartId: p.sparePartId,
          partCode: p.partCode,
          name: p.name,
          brand: p.brand,
          quantity: p.quantity,
          partNo: p.partNo ?? null,
          ...(p.brandFiles ? { brandFiles: p.brandFiles } : {}),
          ...(p.issued ? { issued: true, requisitionNo: p.requisitionNo } : {}),
        }));
  // ตัวเดียวกันสองแถว (ใบเก่า) — ช่องเลือกอะไหล่ใช้รหัสเป็น key เก็บแถวแรก
  return rows.filter((r, i) => rows.findIndex((x) => x.sparePartId === r.sparePartId) === i);
}

/**
 * ร่างข้อ 5 ผูกกับรอบตรวจ + รอบที่ถูกตีกลับ — ร่างของรอบก่อน (ย้อนขั้นแล้วกลับมาตรวจใหม่ · ถูกตีกลับอีกรอบ) ไม่เอามาเติม
 * ไม่งั้นช่างเปิดฟอร์มแล้วเจอรายการที่ไม่ใช่ของรอบนี้ แต่ดูเหมือนตัวเองเพิ่งเลือก
 * ต้องมีประวัติเดินขั้นล่าสุดด้วย: inspectionStartedAt ขยับเฉพาะตอนนัดตรวจใหม่ และใบที่คอนเฟิร์ม/ยกเลิกรายการแล้วไม่มี partsPick
 * — ร่างที่ค้างในเครื่องหนึ่ง (อีกคนส่งจากอีกเครื่อง) แล้วหัวหน้าภาคย้อนขั้นกลับมาตรวจ จะได้กุญแจเดิมทุกตัว
 * แล้วรายการเก่าทับของที่คอนเฟิร์มไปแล้ว · แนบรูป/แก้ยี่ห้อระหว่างกรอกไม่นับ (NOT_A_MOVE) ร่างของรอบนี้จึงไม่หาย
 */
function inspectDraftKey(o: WorkOrder): string {
  const move = o.logs
    .filter((l) => !NOT_A_MOVE.includes(l.action))
    .reduce<LogEntry | null>((a, l) => (!a || l.createdAt > a.createdAt || (l.createdAt === a.createdAt && l.id > a.id) ? l : a), null);
  return `${o.inspectionStartedAt ?? ""}|${o.partsPick?.id ?? 0}|${move?.id ?? 0}`;
}
function parseInspectDraft(raw: string | null, key: string): { parts: PickedPart[]; brand: string | null } | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as { key?: unknown; parts?: unknown; brand?: unknown };
    if (d.key !== key || !Array.isArray(d.parts)) return null;
    return { parts: d.parts as PickedPart[], brand: typeof d.brand === "string" ? d.brand : null };
  } catch {
    return null;
  }
}

/** "เครื่องซัก" / "เครื่องอบ" จากตัวอักษรแรกของรหัสเครื่อง (W/D — กติกาเดียวกับฟอร์มเปิดใบงาน) · รหัสแบบอื่นไม่เดาชนิด */
function machineKindOf(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase();
  return c.startsWith("W") ? "เครื่องซัก" : c.startsWith("D") ? "เครื่องอบ" : null;
}

/**
 * ช่างแก้อะไรจากรอบที่ถูกตีกลับ (ตัวอย่าง diffText) — "" = รายการเหมือนรอบก่อนทุกตัว (ยืนยันรายการเดิม)
 * หัวหน้าภาคไม่ต้องจำว่ารอบก่อนชี้ตัวไหนไว้ — เห็นเลยว่าตัวที่ชี้ถูกเอาออก/เปลี่ยนจำนวนหรือยัง
 */
function pickDiff(prev: PickItem[], next: PickItem[]): string {
  const out: string[] = [];
  for (const p of prev) {
    const n = next.find((x) => x.sparePartId === p.sparePartId);
    if (!n) out.push(`เอา ${pickName(p)} ออก`);
    else if (n.quantity !== p.quantity) out.push(`${p.partCode} จำนวน ${p.quantity} → ${n.quantity}`);
  }
  for (const n of next) if (!prev.some((p) => p.sparePartId === n.sparePartId)) out.push(`เพิ่ม ${pickName(n)} × ${n.quantity}`);
  return out.join(" · ");
}

/**
 * รายการของช่างที่อยู่ในไฟล์ยี่ห้ออื่น (ช่างยืนยันข้ามยี่ห้อตอนเลือก) — เทียบกับไฟล์ "ตอนนี้" ของเครื่อง แบบเดียวกับเซิร์ฟเวอร์ตอนคอนเฟิร์ม
 * คนคอนเฟิร์มต้องยืนยันเองอีกครั้ง (เจ้าของงาน: ทุกคนที่เลือกอะไหล่ได้ต้องกดยืนยัน · รายครั้ง) — คำยืนยันของช่างไม่ใช่ของคนที่เขียนลงใบ
 * อะไหล่นอกเครื่อง (ไม่อยู่ในไฟล์ไหน) ไม่นับ: ทุกเครื่องเลือกได้ ไม่ต้องยืนยัน (4 พ.ย. 69)
 */
function pickCrossItems(order: WorkOrder, pick: PartsPickInfo): PickItem[] {
  const file = order.partsBrand?.file ?? pick.brandFile;
  if (!file) return [];
  return pick.items.filter((i) => i.brandFiles.length > 0 && !fileAllows(file, i.brandFiles));
}

/** เหตุผลที่ตีกลับบ่อย (ตัวอย่างที่อนุมัติ) — กดแล้วต่อท้ายช่องเหตุผล ไม่แทนที่ หัวหน้าภาคพิมพ์ต่อได้ว่าตัวไหน */
const QUICK_REASONS = ["รหัสไม่ตรงกับรูปอะไหล่ที่เสีย", "จำนวนไม่ตรง", "ขาดอะไหล่ที่ต้องใช้", "ตัวนี้ยังไม่ต้องเปลี่ยน"];

/**
 * รูปขยายในจอคอนเฟิร์มอะไหล่ — วาดแทนที่กรอบไฟล์ตรวจในฟอร์มเดิม ไม่ใช่หน้าต่างซ้อน
 * Modal ซ้อน Modal บนเว็บไม่น่าเชื่อถือ (CLAUDE.md) และหน้าต่างใหม่ทำให้ป้ายตรง/ไม่ตรงที่กดไว้หลุดจากสายตา
 * เลื่อนได้เฉพาะรูปในกรอบเดียวกัน — หัวหน้าภาคกำลังเทียบรหัสกับ "รูปอะไหล่ที่เสีย" ไม่ใช่ไล่ดูทุกรูป
 */
function PhotoZoom({
  workOrderId,
  row,
  rows,
  onShow,
  onClose,
}: {
  workOrderId: number;
  row: Attachment;
  /** ไฟล์ตรวจของรอบนี้ — หารูปก่อนหน้า/ถัดไปในกรอบเดียวกัน */
  rows: Attachment[];
  onShow: (row: Attachment) => void;
  onClose: () => void;
}) {
  const same = rows.filter((r) => r.role === row.role && r.kind === "IMAGE");
  const i = Math.max(0, same.findIndex((r) => r.id === row.id));
  const label = INSPECTION_SLOTS.find((s) => s.role === row.role)?.label ?? "รูป";
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // ลิงก์ผ่านที่เก็บลิงก์ของใบ (อายุ 2 ชม.) — ลิงก์ที่มากับรายการไฟล์อาจหมดอายุแล้วถ้าฟอร์มเปิดค้างไว้นาน
  useEffect(() => {
    let alive = true;
    setUrl(null);
    setErr(null);
    linkFor(workOrderId, row.id)
      .then((u) => alive && setUrl(u))
      .catch((e) => alive && setErr(apiErrorMessage(e)));
    return () => {
      alive = false;
    };
  }, [workOrderId, row.id]);
  const go = (d: number) => {
    const next = same[i + d];
    if (next) onShow(next);
  };
  return (
    <View style={styles.cfZoom} accessibilityLabel={`รูปขยาย ${label}`}>
      <View style={styles.cfZoomHead}>
        <Text style={styles.cfZoomTitle}>
          {label} · {i + 1} / {same.length}
        </Text>
        <TouchableOpacity style={styles.cfZoomBtn} onPress={onClose} activeOpacity={0.7} accessibilityLabel="ย่อ">
          <Ionicons name="contract-outline" size={16} color={colors.primaryInk} />
          <Text style={styles.cfZoomBtnText}>ย่อ</Text>
        </TouchableOpacity>
      </View>
      {url ? (
        <Image source={{ uri: url }} style={styles.cfZoomImg} resizeMode="contain" accessibilityLabel={row.fileName} />
      ) : (
        <View style={[styles.cfZoomImg, styles.cfZoomWait]}>
          {err ? <Text style={styles.warn}>{err}</Text> : <Spinner color={colors.primary} />}
        </View>
      )}
      {same.length > 1 ? (
        <View style={styles.cfZoomNav}>
          <TouchableOpacity
            style={[styles.cfZoomBtn, { flex: 1 }, i === 0 && styles.modalSaveOff]}
            onPress={() => go(-1)}
            disabled={i === 0}
            activeOpacity={0.7}
            accessibilityLabel="รูปก่อนหน้า"
          >
            <Ionicons name="chevron-back" size={16} color={colors.primaryInk} />
            <Text style={styles.cfZoomBtnText}>รูปก่อนหน้า</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cfZoomBtn, { flex: 1 }, i >= same.length - 1 && styles.modalSaveOff]}
            onPress={() => go(1)}
            disabled={i >= same.length - 1}
            activeOpacity={0.7}
            accessibilityLabel="รูปถัดไป"
          >
            <Text style={styles.cfZoomBtnText}>รูปถัดไป</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primaryInk} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

/**
 * จอคอนเฟิร์มอะไหล่ของหัวหน้าภาค/แอดมิน (ฟอร์มขั้น NEW ที่มีรอบเลือกอะไหล่รอคอนเฟิร์ม — ตัวอย่าง supView review)
 * แทนคำถาม "งานนี้ต้องใช้อะไหล่ไหม" — ช่างตอบมาแล้วพร้อมรายการ งานของหัวหน้าภาคคือเทียบรายการกับรูปอะไหล่ที่เสีย
 * แก้รายการของช่างไม่ได้ (ข้อ 8) ตรงก็คอนเฟิร์ม ไม่ตรงก็ตีกลับพร้อมชี้ตัว · เติมได้แค่อะไหล่นอก/ค่าบริการ (ข้อ 7)
 * ค่าที่กด (ตรง/ไม่ตรง เหตุผล ของที่เติม) อยู่ที่ฟอร์มขั้นตอน — ปุ่มท้ายฟอร์มเป็นคนส่ง และเปิดรูปขยายแล้วค่าไม่หาย
 */
function PickConfirmForm({
  order,
  pick,
  files,
  marks,
  onMark,
  onAllOk,
  showReject,
  reason,
  onReason,
  zoom,
  onZoom,
  offParts,
  onOffParts,
  offBind,
  offFlash,
  services,
  onServices,
  onInspectFirst,
}: {
  order: WorkOrder;
  pick: PartsPickInfo;
  files: Attachment[];
  marks: Record<number, "OK" | "NO">;
  onMark: (sparePartId: number, mark: "OK" | "NO") => void;
  onAllOk: () => void;
  showReject: boolean;
  reason: string;
  onReason: (text: string) => void;
  zoom: Attachment | null;
  onZoom: (row: Attachment | null) => void;
  offParts: OffPart[];
  onOffParts: (rows: OffPart[]) => void;
  /** จุดที่ปุ่มคอนเฟิร์มเลื่อนมาหาเมื่ออะไหล่นอกยังขาด (useScrollTarget ของฟอร์มขั้นตอน) */
  offBind: ReturnType<typeof useScrollTarget>["bind"];
  offFlash: boolean;
  services: OffPart[];
  onServices: (rows: OffPart[]) => void;
  onInspectFirst: () => void;
}) {
  const items = pick.items;
  const marked = items.filter((i) => marks[i.sparePartId]).length;
  const flagged = items.filter((i) => marks[i.sparePartId] === "NO");
  const prev = pick.previous;
  const diff = prev ? pickDiff(prev.items, items) : "";
  const changes = prev
    ? [
        diff,
        pick.noteChanged ? "แก้ “ตรวจแล้วเจออะไร” — อ่านในผลตรวจด้านล่าง" : "",
        pick.addedPartPhotos ? `เพิ่มรูปอะไหล่ที่เสีย ${pick.addedPartPhotos} รูป` : "",
      ]
        .filter(Boolean)
        .join(" · ") || "ไม่มีรายการเปลี่ยน"
    : "";
  /**
   * รายการของช่างแทนที่ของในสโตร์ทั้งชุด (ข้อ 5) — แถวเดิมที่ไม่อยู่ในรายการหายจากใบตอนคอนเฟิร์ม รวมตัวที่เบิกไปแล้ว (D2)
   * บอกก่อนกด ไม่งั้นหัวหน้าภาคเห็นแค่รายการใหม่ แล้วของที่เบิกออกไปแล้วหายจากใบโดยไม่มีใครรู้ว่าต้องตามคืน
   */
  const removed = order.waitingParts.filter((p) => !p.offCatalog && !items.some((i) => i.sparePartId === p.sparePartId));
  const machineCode = order.partsBrand?.machineCode ?? order.machineCode;
  const make = order.partsBrand?.make ?? order.machineBrand;
  // ไฟล์ "ตอนนี้" ของเครื่อง — เซิร์ฟเวอร์ตรวจรายการกับไฟล์นี้ตอนคอนเฟิร์ม (แก้ยี่ห้อหลังช่างส่ง = ไฟล์ใหม่) · ไม่รู้ค่อยใช้ไฟล์ตอนส่ง
  const file = order.partsBrand?.file ?? pick.brandFile;
  const kind = machineKindOf(machineCode);
  const roundFiles = inspectionFilesOf(files, order.inspectionStartedAt);
  const hasVideo = roundFiles.some((f) => f.role === "INSPECT_VIDEO");
  const extras = offPartsPayload(offParts).length + offPartsPayload(services).length;
  const note = order.inspectionNote ?? pick.note;
  const crossIds = new Set(pickCrossItems(order, pick).map((i) => i.sparePartId));

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.cfCard}>
        <Text style={styles.cfBranch}>
          {order.branchCode} {order.branchName}
        </Text>
        {machineCode ? (
          <Text style={styles.cfMachine}>
            {["เครื่อง " + machineCode, kind, make ? "ยี่ห้อ " + make : null].filter(Boolean).join(" · ")}
          </Text>
        ) : (
          // ใบทั้งสาขามีรอบเลือกอะไหล่ได้ตั้งแต่ 4 พ.ย. 69 (อะไหล่นอกเครื่องเท่านั้น) — บอกว่าทำไมไม่มีเครื่อง/ไฟล์ยี่ห้อบนหัว
          <Text style={styles.cfMachine}>ใบงานทั้งสาขา (ไม่ระบุเครื่อง) · ช่างเลือกได้เฉพาะอะไหล่นอกเครื่อง</Text>
        )}
        {file ? (
          <View style={styles.cfFileChip}>
            <Ionicons name="lock-closed" size={12} color={colors.primaryInk} />
            <Text style={styles.cfFileChipText}>อะไหล่จากไฟล์ {file} เท่านั้น</Text>
          </View>
        ) : null}
        <Text style={styles.cfMuted}>
          {pick.sentBy ? `ช่าง${pick.sentBy.name} (${pick.sentBy.employeeCode}) · ` : ""}ส่ง {dayTime(pick.sentAt)}
        </Text>
      </View>

      {prev ? (
        <View style={styles.cfResend} accessibilityLabel="สิ่งที่ช่างแก้จากรอบก่อน">
          <Text style={styles.cfResendTitle}>
            ช่างส่งรอบที่ {pick.round} — {diff ? "แก้จากรอบก่อน" : "ยืนยันรายการเดิม"}
          </Text>
          <Text style={styles.cfResendLine}>{changes}</Text>
          {prev.reason ? <Text style={styles.cfMutedDark}>รอบก่อนตีกลับเพราะ: {prev.reason}</Text> : null}
        </View>
      ) : null}

      <View style={styles.cfCard}>
        <Text style={styles.cfTitle}>ผลตรวจหน้างาน</Text>
        <Text style={styles.cfNote}>{note?.trim() ? note : "-"}</Text>
        {zoom ? (
          <PhotoZoom workOrderId={order.id} row={zoom} rows={roundFiles} onShow={onZoom} onClose={() => onZoom(null)} />
        ) : (
          <InspectionSlots
            workOrderId={order.id}
            rows={files}
            since={order.inspectionStartedAt}
            canEdit={false}
            compact
            titleCount
            canRemove={() => false}
            // วิดีโอยังเป็นรูปย่อ (D13) — เล่นวิดีโอในฟอร์มต้องใช้ตัวเล่นเต็มจอซึ่งซ้อน Modal บนเว็บไม่ได้
            onOpen={(row) => (row.kind === "IMAGE" ? onZoom(row) : undefined)}
            onRemove={() => undefined}
            onChanged={() => undefined}
          />
        )}
        {hasVideo && !zoom ? <Text style={styles.cfMuted}>ดูวิดีโอได้ที่การ์ดไฟล์แนบบนหน้าใบงาน</Text> : null}
      </View>

      <View style={styles.cfCard}>
        <View style={styles.cfHeadRow}>
          <Text style={styles.cfTitle}>อะไหล่ที่ช่างเลือก · {items.length} รายการ</Text>
          <Text style={styles.cfMuted}>
            ตรวจแล้ว {marked} / {items.length}
          </Text>
        </View>
        <View style={styles.cfHeadRow}>
          <Text style={[styles.cfMuted, { flex: 1, minWidth: 0 }]}>กด ตรง หรือ ไม่ตรง ทีละรายการ — เทียบกับรูปอะไหล่ที่เสีย</Text>
          <TouchableOpacity style={styles.cfAllOk} onPress={onAllOk} activeOpacity={0.7} accessibilityLabel="ตรงทุกรายการ">
            <Text style={styles.cfAllOkText}>ตรงทุกรายการ</Text>
          </TouchableOpacity>
        </View>
        {items.map((it) => {
          const m = marks[it.sparePartId];
          // ป้ายเทียบรอบก่อน (เซิร์ฟเวอร์คิดให้) — รอบแรกไม่มีอะไรให้เทียบ ไม่ติดป้าย
          const tag = prev
            ? it.isNew
              ? "เพิ่มใหม่รอบนี้"
              : it.prevQty !== null && it.prevQty !== it.quantity
                ? `แก้จำนวนรอบนี้ (เดิม ${it.prevQty})`
                : null
            : null;
          return (
            <View key={it.sparePartId} style={[styles.cfRow, m === "OK" && styles.cfRowOk, m === "NO" && styles.cfRowNo]}>
              <View style={styles.cfRowTop}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={styles.cfRowName}>
                    <Text style={{ fontWeight: "800" }}>{it.partCode}</Text> {it.name}
                  </Text>
                  {it.partNo ? <Text style={styles.cfMuted}>Part No. {it.partNo}</Text> : null}
                  {tag ? <Text style={styles.cfTag}>{tag}</Text> : null}
                  {/* ช่างเลือกข้ามยี่ห้อ — ป้ายส้มเดียวกับช่องเลือกอะไหล่ บอกไฟล์ที่อะไหล่อยู่ (กดคอนเฟิร์มแล้วถามยืนยันอีกครั้ง) */}
                  {crossIds.has(it.sparePartId) ? (
                    <Text style={styles.cfCrossTag}>ข้ามยี่ห้อ · อยู่ในไฟล์ {it.brandFiles.join(", ")}</Text>
                  ) : null}
                  {/* อะไหล่นอกเครื่อง — ไม่ต้องยืนยัน บอกให้รู้ว่าไม่ได้อยู่ในไฟล์ของเครื่องเพราะไม่ผูกกับยี่ห้อ ไม่ใช่เลือกผิด */}
                  {isOutsidePart(it) ? <Text style={styles.cfOutsideTag}>นอกเครื่อง</Text> : null}
                </View>
                <Text style={styles.cfQty}>× {it.quantity} ตัว</Text>
              </View>
              {/* กลุ่มปุ่มบอกชื่ออะไหล่ — โปรแกรมอ่านจอ/เทสต์แยกได้ว่าปุ่ม "ตรง" นี้ของแถวไหน · เว็บไม่แปลงสถานะปุ่มเป็น aria-pressed ใส่เอง */}
              <View style={styles.cfMarks} role="group" aria-label={`ตรวจ ${it.partCode} ${it.name}`}>
                <TouchableOpacity
                  style={[styles.cfMarkBtn, styles.cfOkBtn, m === "OK" && styles.cfOkOn]}
                  onPress={() => onMark(it.sparePartId, "OK")}
                  activeOpacity={0.8}
                  aria-pressed={m === "OK"}
                  accessibilityLabel={`ตรง ${it.partCode}`}
                >
                  <Ionicons name="checkmark" size={16} color={m === "OK" ? "#fff" : colors.successInk} />
                  <Text style={[styles.cfMarkText, { color: m === "OK" ? "#fff" : colors.successInk }]}>ตรง</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cfMarkBtn, styles.cfNoBtn, m === "NO" && styles.cfNoOn]}
                  onPress={() => onMark(it.sparePartId, "NO")}
                  activeOpacity={0.8}
                  aria-pressed={m === "NO"}
                  accessibilityLabel={`ไม่ตรง ${it.partCode}`}
                >
                  <Ionicons name="close" size={16} color={m === "NO" ? "#fff" : colors.dangerInk} />
                  <Text style={[styles.cfMarkText, { color: m === "NO" ? "#fff" : colors.dangerInk }]}>ไม่ตรง</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>

      {removed.length ? (
        <View style={styles.cfRemoved} accessibilityLabel="ของเดิมในใบที่ช่างเอาออก">
          <Text style={styles.cfRemovedTitle}>ของเดิมในใบที่ช่างเอาออก — คอนเฟิร์มแล้วหายจากใบ</Text>
          {removed.map((p, k) => (
            <Text key={`${p.sparePartId}-${k}`} style={styles.cfRemovedLine}>
              {p.partCode} {p.name} × {p.quantity}
              {p.inStock === true && p.requisitionNo ? ` · เบิกแล้ว ใบเบิก ${p.requisitionNo}` : ""}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.cfCard}>
        <Text style={styles.cfTitle}>ใส่เพิ่มก่อนคอนเฟิร์ม (ถ้ามี)</Text>
        <Text style={styles.cfMuted}>
          {extras
            ? "ใส่แล้ว — คอนเฟิร์มแล้วต้องเสนอราคาลูกค้าก่อนนัด (เหมือนฟอร์มระบุอะไหล่เดิม)"
            : "ใส่อย่างใดอย่างหนึ่ง = ต้องเสนอราคาลูกค้าก่อนนัด (เหมือนฟอร์มระบุอะไหล่เดิม)"}
        </Text>
        {/* คนคอนเฟิร์มคือคนระบุของนอกสโตร์ — ถามจัดหาได้ไหม/จากที่ไหนแบบเดียวกับฟอร์มระบุอะไหล่ */}
        <View {...offBind}>
          <OffPartEditor rows={offParts} onChange={onOffParts} ask="plan" highlight={offFlash} />
        </View>
        <OffPartEditor
          rows={services}
          onChange={onServices}
          variant="service"
          hint="ค่าแรง ค่าเดินทาง ฯลฯ ที่ลูกค้าต้องจ่าย · ไม่ใส่ราคา แอดมินใส่ในใบเสนอราคา"
        />
        <QuoteRoute needsParts off={offPartsPayload(offParts).length} services={offPartsPayload(services).length} />
        {/* ต้องเห็นเครื่องเองอีกรอบ = ส่งตรวจใหม่ (แอดมินนัดร้าน ไฟล์ชุดใหม่) ไม่ใช่ตีกลับ — ตีกลับแก้ได้แค่จากไฟล์รอบนี้ (ข้อ 7) */}
        <Text style={styles.cfMutedDark}>
          ต้องเข้าดูเครื่องอีกรอบ: ใช้ “ต้องเข้าตรวจสอบหน้างานก่อน” เดิม (แอดมินนัดร้านใหม่ ถ่ายไฟล์ใหม่) — ตีกลับใช้เมื่อแก้จากไฟล์รอบนี้ได้
        </Text>
        <TouchableOpacity style={styles.cfLink} onPress={onInspectFirst} activeOpacity={0.7} accessibilityLabel="ต้องเข้าตรวจสอบหน้างานก่อน">
          <Text style={styles.cfLinkText}>ต้องเข้าตรวจสอบหน้างานก่อน</Text>
        </TouchableOpacity>
      </View>

      {showReject ? (
        <View style={styles.cfReject} accessibilityLabel="กล่องตีกลับ">
          <Text style={styles.cfRejectLabel}>
            เหตุผลที่ตีกลับ <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <Text style={styles.cfRejectFlags}>
            {flagged.length
              ? `ชี้ว่าไม่ตรง: ${flagged.map(pickName).join(", ")}`
              : "ยังไม่ได้ชี้รายการ — ตีกลับได้ แต่บอกในเหตุผลว่าต้องแก้ตัวไหน"}
          </Text>
          <View style={styles.cfQuick}>
            {QUICK_REASONS.map((t) => (
              <TouchableOpacity
                key={t}
                style={styles.cfQuickChip}
                activeOpacity={0.7}
                accessibilityLabel={t}
                // ต่อท้ายด้วย " · " ไม่ทับที่พิมพ์ไว้ · กดซ้ำไม่เติมซ้ำ (ตัวอย่าง addReason)
                onPress={() => {
                  const cur = reason.trim();
                  onReason(cur.includes(t) ? cur : cur ? `${cur} · ${t}` : t);
                }}
              >
                <Text style={styles.cfQuickText}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[styles.modalInput, styles.cfReason]}
            value={reason}
            onChangeText={onReason}
            placeholder="เช่น รูปอะไหล่ที่เสียเห็นแค่สวิตช์ล็อกหัก ไม่ต้องเปลี่ยนทั้งชุด"
            placeholderTextColor={colors.textFaint}
            multiline
            numberOfLines={3}
            maxLength={500}
            accessibilityLabel="เหตุผลที่ตีกลับ"
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * เลื่อนฟอร์มในหน้าต่างไปหากล่องหนึ่ง (ปุ่ม "ยังขาด … — พาไป") — วิธีเดียวกับ spotY ของฟอร์มปิดงาน
 * เว็บวัดจากกล่อง DOM ตอนกด: react-native-web ยิง onLayout เฉพาะตอนกล่องเปลี่ยนขนาด ไม่ยิงตอนถูกดันลง
 * (เลือกอะไหล่/พิมพ์ผลตรวจด้านบนแล้วตำแหน่งที่จดไว้เก่า) · มือถือใช้ตำแหน่งจาก onLayout
 */
function useScrollTarget(scrollRef: React.RefObject<ScrollView | null>) {
  const node = useRef<View | null>(null);
  const y = useRef<number | null>(null);
  const bind = {
    ref: (n: View | null) => {
      node.current = n;
    },
    onLayout: (e: { nativeEvent: { layout: { y: number } } }) => {
      y.current = e.nativeEvent.layout.y;
    },
  };
  const go = () => {
    let top = y.current;
    if (Platform.OS === "web") {
      const el = node.current as unknown as HTMLElement | null;
      const box = (scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.();
      if (el && box && typeof el.getBoundingClientRect === "function") {
        top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      }
    }
    if (top !== null) scrollRef.current?.scrollTo({ y: Math.max(0, top - 16), animated: true });
  };
  return { bind, go };
}


function StageModal({
  visible,
  order,
  warehouses,
  adminWarehouse,
  teams,
  files,
  onReschedule,
  onFilesChanged,
  onCancel,
  overlay,
  onOverlay,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  warehouses: string[];
  adminWarehouse: string;
  teams: Team[];
  /** ปิดฟอร์มนี้แล้วเปิดฟอร์มเลื่อนวันนัด (แอดมิน) — ไม่ส่งมา = ไม่มีลิงก์ */
  onReschedule?: () => void;
  /** ไฟล์แนบของใบงาน (จากการ์ดไฟล์แนบ) — ฟอร์มผลตรวจบอกว่าแนบอะไรไว้แล้ว */
  files: Attachment[];
  /** แนบ/ลบไฟล์จากฟอร์มแล้ว — ให้การ์ดไฟล์แนบโหลดรายการใหม่ */
  onFilesChanged: () => void;
  onCancel: () => void;
  /**
   * สถานะคำขอนัดด่วนล่าสุดที่หน้าใบงานถือไว้ (askOverlay) — null = ใช้ค่าในใบ
   * ฟอร์มไม่โหลดใบใหม่ระหว่างเปิด (ใบเปลี่ยน = ทีม/เวลา/อะไหล่ที่กรอกหาย) สถานะคำขอที่เปลี่ยนจึงมาทางนี้แทน
   */
  overlay: AskOverlay | null;
  onOverlay: (o: AskOverlay) => void;
  onDone: (kind?: StageDoneKind) => void;
}) {
  const [needsParts, setNeedsParts] = useState<boolean | null>(null);
  const [parts, setParts] = useState<PickedPart[]>([]);
  // ยี่ห้อที่หัวหน้าภาคกดในช่องอะไหล่ (เครื่องที่ยังไม่รู้ยี่ห้อ — ข้อ 17) — ส่งไปจำไว้กับเครื่องพร้อมรายการอะไหล่
  const [pickedBrand, setPickedBrand] = useState<string | null>(null);
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
  /**
   * ขั้นตรวจหน้างาน (ใบที่ถูกตีกลับรายการอะไหล่): กดส่งแล้วยังไม่ได้แก้อะไร — กล่องเหลืองขึ้นหลังกด ไม่ใช่ตั้งแต่เปิดฟอร์ม
   * (ตัวอย่าง techSend) ช่างเพิ่งเปิดมาอ่านกล่องแดง ยังไม่ได้ทำอะไรผิด · แก้ครบแล้วกล่องหายเอง
   */
  const [gateTried, setGateTried] = useState(false);
  /**
   * จอคอนเฟิร์มอะไหล่ (ขั้น NEW ที่ช่างเลือกอะไหล่มารอคอนเฟิร์ม) — ป้ายตรง/ไม่ตรงทีละตัว · เหตุผลตีกลับ · รูปที่ขยายอยู่
   * ถือไว้ที่ฟอร์มขั้นตอน ไม่ใช่ในตัวจอ: ปุ่มท้ายฟอร์มเป็นคนส่ง และสลับไป "ต้องเข้าตรวจสอบหน้างานก่อน" แล้วกลับมา ค่าที่กดไว้ยังอยู่
   * pickMsg = แถบเหลือง/แดงใต้หัวฟอร์มหลังกดปุ่มท้ายฟอร์มตอนยังไม่พร้อม (ตัวอย่าง supMsg) — ขึ้นหลังกด ไม่ใช่ตั้งแต่เปิด
   */
  const [marks, setMarks] = useState<Record<number, "OK" | "NO">>({});
  const [reason, setReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [pickMsg, setPickMsg] = useState<{ kind: "warn" | "err"; text: string } | null>(null);
  const [zoom, setZoom] = useState<Attachment | null>(null);
  // มือถือ: ปุ่มท้ายจอคอนเฟิร์มสามปุ่มแถวเดียวอ่านไม่ออก — ซ้อนเป็นสองแถว (ยกเลิก+ตีกลับ / คอนเฟิร์ม)
  const { width: winW } = useWindowDimensions();
  const stackFoot = winW < 600;
  // ขั้นนัดลูกค้า
  // ขั้นคอนเฟิร์มลูกค้า: ลูกค้าตกลงวันเดิม หรือขอเลื่อน (เลื่อนแล้วถึงจะขึ้นช่องวันให้แก้)
  const [confirmChoice, setConfirmChoice] = useState<"OK" | "MOVE" | null>(null);
  /**
   * ช่องติ๊ก "แก้เป็นงานด่วนไปพร้อมกัน" ของแอดมิน — คอนเฟิร์มลูกค้า และฟอร์มนัดวันที่แอดมินทำแทนหัวหน้าภาค (วันที่ปิดนัดแล้ว)
   * ขึ้นเฉพาะตอนบรรทัดเป็นแดง · ล้างเมื่อเปลี่ยนวัน/เปลี่ยนคำตอบ — ติ๊กไว้กับวันหนึ่ง ไม่ได้แปลว่าตั้งใจปลดอีกวัน
   */
  const [urgentWith, setUrgentWith] = useState(false);
  // ขั้นเช็คอะไหล่/เบิก: มีบางตัวหมดบางตัว — แยกตัวที่หมดไปใบรออะไหล่ได้ แต่ตั้งต้นเป็นไม่แยก
  // (เจ้าของงานตกลง ต.ค. 69: ของต้องครบก่อนส่งไปนัด · ของไม่พอตอนเบิก = แจ้งเลื่อนนัด) — แยกต้องเลือกเอง
  const [splitOut, setSplitOut] = useState(false);
  /**
   * ใบที่เสนอราคาแล้ว แยกตัวที่หมด — ลูกค้าจ่ายค่าตัวนั้นแล้วหรือยัง (ต้องเลือก ไม่ตั้งค่าให้)
   * ลูกค้าบางรายจ่ายแค่ค่าของที่มี ใบใหม่ต้องเสนอราคาเอง — เดาผิดคือของออกไปโดยไม่มีใครเก็บเงิน
   */
  const [splitPaid, setSplitPaid] = useState<boolean | null>(null);
  /**
   * ของคลังอื่น ต้องโอนไหม ทีละชิ้น (เจ้าของงานขอ ต.ค. 69) — คลังในพื้นที่หน้างานไม่ต้องโอน หัวหน้าภาคเบิกส่งช่างได้เลย
   * ใบเดียวมีทั้งชิ้นที่ต้องโอนและไม่ต้องโอนได้ · ต้องเลือกทุกชิ้น ไม่ตั้งค่าให้ — เลือกผิดทางหนึ่งคือโอนเปล่า ๆ
   * อีกทางคือช่างไปเบิกไกลจากหน้างาน
   */
  const [transferChoice, setTransferChoice] = useState<Record<number, boolean>>({});
  /**
   * ขั้นเบิกคลัง 94: ชิ้นไหนแอดมินส่งให้ลูกค้าแล้ว (เจ้าของงานขอ พ.ย. 69 — เลือกทีละชิ้น) · true = ส่งแล้ว ช่างไม่ต้องไปรับที่คลัง
   * ค่าตั้งต้นคือรับที่คลัง (ไม่มีในนี้) ต่างจาก "ต้องโอนไหม" ที่ไม่ตั้งค่าให้: รับที่คลังคือแบบเดียวที่เคยมี ส่วนใหญ่ยังเป็นแบบนั้น
   * แอดมินกดเฉพาะชิ้นที่ส่งไปแล้ว · เลือกผิดเป็น "รับที่คลัง" ช่างแค่แวะคลังเสียเที่ยว ไม่ใช่ของหาย
   */
  const [sentChoice, setSentChoice] = useState<Record<number, boolean>>({});
  // ขั้นเบิกอะไหล่: ของอยู่คลังอื่น — ข้อความถึงหัวหน้าภาคที่ต้องไปเบิก (บังคับเมื่อมีตัวที่อยู่คลังอื่น)
  const [pickupNote, setPickupNote] = useState("");
  // ขั้นหัวหน้าภาคเบิก: คลังที่เบิกจริง + เลขใบเบิก รายตัว (อาจเบิกคนละคลังคนละใบ) · เบิกไม่ได้ = ส่งกลับแอดมิน
  const [pickup, setPickup] = useState<Record<number, { warehouse: string | null; requisitionNo: string }>>({});
  const [pickupFail, setPickupFail] = useState(false);
  // ขั้นเบิกและโอน: รายตัว — เบิกจากคลังไหน · เลขใบเบิก · โอนไปคลังไหน · เลขที่ใบโอน
  const [transfer, setTransfer] = useState<
    Record<number, { from: string | null; reqNo: string; to: string | null; transferNo: string }>
  >({});
  // ใบขอโอนสินค้า PDF ที่ออกแล้ว ต่อคู่คลัง "ต้นทาง→ปลายทาง" — กดเปิดเองอีกครั้ง (เบราว์เซอร์บล็อกหน้าต่างที่เปิดหลังรอ)
  const [transferDocs, setTransferDocs] = useState<Record<string, string>>({});
  const [docBusy, setDocBusy] = useState<string | null>(null);
  // วันเข้าถูกเลื่อน (ลูกค้าขอ · แอดมินเลื่อน) แต่ทีมไม่ว่าง — ส่งกลับให้แอดมินนัดใหม่แทนการปล่อยงาน
  // นัดตรวจหน้างานด้วย: แอดมินเลื่อนวันตรวจได้แล้ว (ต.ค. 69) ทีมวันใหม่อาจไม่ว่างเหมือนกัน → กลับไปนัดร้าน (ตรวจหน้างาน)
  const newDate = rescheduledPending(order);
  const releaseStage = order.status === "ASSIGNED" || order.status === "INSPECT_DISPATCH";
  /**
   * เวลาปิดนัดงานพรุ่งนี้ — นาฬิกาเซิร์ฟเวอร์ของฟอร์มเอง เดินเฉพาะตอนฟอร์มเปิด
   * ฟอร์มที่เปิดค้างข้าม 16:00 ขีดฆ่าวันพรุ่งนี้เองตรงเวลา ไม่ต้องรอให้กดแล้วโดนปฏิเสธ (ด่านจริงยังอยู่ที่เซิร์ฟเวอร์)
   * clock = นาฬิกา/เวลาปิดจากคำตอบ 400 DATE_CLOSED — กดแล้วโดนปฏิเสธ (มือถือช้า · แอดมินเพิ่งเลื่อนเวลาปิดให้เร็วขึ้น)
   * ฟอร์มคิดใหม่จากค่าของเซิร์ฟเวอร์ในที่เดิม ไม่โหลดใบใหม่ — โหลดใหม่คือทีม/เวลา/อะไหล่ที่กรอกหาย
   */
  const [clock, setClock] = useState<{ serverNow?: string; cutoff?: Cutoff } | null>(null);
  const serverNow = clock?.serverNow ?? order.serverNow;
  const cutoff = clock?.cutoff ?? order.cutoff;
  const now = useServerClock(serverNow, cutoff?.time, visible);
  /**
   * กฎที่ฟอร์มนี้ใช้ — ใบทดสอบไม่มีกฎ (เซิร์ฟเวอร์ยกเว้นทุกทาง) ห้ามส่ง cutoff ดิบให้ตัวช่วย ไม่งั้นปฏิทินขีดฆ่าวันที่เซิร์ฟเวอร์รับ
   * และปุ่มขอแอดมินพาไปเจอ 400 "ใบทดสอบไม่ติดเวลาปิดนัด"
   */
  const rule = order.isTest ? null : cutoff ?? null;
  // สถานะคำขอนัดด่วนล่าสุด — ค่าที่วาดทับ (ตอบจากปุ่มขอ · ตัวเช็ค 20 วิ) ชนะค่าในใบที่โหลดไว้ตอนเปิดฟอร์ม
  const askNow = overlay ?? overlayOf(order);
  const urgentFor = askNow.urgentReleaseFor;
  const { user } = useAuth();
  /**
   * แอดมินที่ทำแทนหัวหน้าภาค: วันที่ปิดไม่ขีดฆ่า ติ๊กแก้เป็นงานด่วนในฟอร์มเดียวกันได้ (แอดมินคนเดียวที่ปลดได้ — เจ้าของงานข้อ 4)
   * ดูในฐานะ/Admin Spare Part นับเป็นหัวหน้าภาค (canMoveDates ชุดเดียวกับปุ่มเลื่อนวันนัด) — เห็นช่องติ๊กแล้วกดไปเจอ 403 ดูเหมือนแอปเสีย
   */
  const who: "supervisor" | "admin" = canMoveDates(user) ? "admin" : "supervisor";
  // วันเข้าถูกเลื่อน (ลูกค้าขอ · แอดมินเลื่อน) แต่ทีมไม่ว่าง — ตัวเลือกคู่ "ทีมว่าง/ทีมไม่ว่าง" ในฟอร์มปล่อยงาน (ปล่อยได้ทุกเวลา ไม่มีหน้าล็อกแล้ว)
  const canDecline = newDate && releaseStage;
  const inspectRelease = order.status === "INSPECT_DISPATCH";
  const [declineDate, setDeclineDate] = useState(false);
  // ช่องที่เติมจากค่าเดิมก่อนย้อนขั้น — ติดป้ายเหลืองให้รู้ว่าไม่ใช่ค่าที่เพิ่งกรอก (ดู rollbackPrefill)
  const [prevUsed, setPrevUsed] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * กล่องอะไหล่นอก: กดปุ่ม "ยังขาด … — พาไป" แล้ว — ช่องที่ยังขาดขึ้นกรอบแดง (ไม่ขึ้นตั้งแต่เปิด คนยังไม่ได้ทำอะไรผิด)
   * ฟอร์มยาว (ช่องค้นอะไหล่ · ผลตรวจ · ค่าบริการ) กล่องนี้อยู่นอกจอได้ ปุ่มจึงเลื่อนไปหาให้ด้วย
   */
  const [offFlash, setOffFlash] = useState(false);
  const stageScroll = useRef<ScrollView>(null);
  const offBox = useScrollTarget(stageScroll);

  useEffect(() => {
    if (!visible) return;
    setOffFlash(false);
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
    // รายการของช่างรอคอนเฟิร์ม — เปิดที่จอคอนเฟิร์มเสมอ ส่งตรวจใหม่เป็นทางที่ต้องตั้งใจกด (ลิงก์ในจอ) ไม่ใช่ค่าตั้งต้น
    setInspectFirst(
      order.status === "NEW" &&
        !pickPending(order) &&
        ((order.jobType === "INSPECT" && !order.inspectedAt) || sentBackLog(order) !== null)
    );
    /**
     * ถูกตีกลับรายการอะไหล่ — "ตรวจแล้วเจออะไร" เริ่มจากข้อความที่ส่งไปรอบนั้น (ตัวอย่างคงข้อความเดิมไว้)
     * ช่างแก้แค่รายการได้ ไม่ต้องพิมพ์ผลตรวจใหม่ทั้งหมด · ด่านส่งใหม่เทียบกับข้อความนี้ จะได้ไม่นับว่า "แก้แล้ว" เพราะช่องว่าง
     */
    setFinding(order.status === "INSPECTING" ? pickReturned(order)?.note ?? "" : "");
    // ข้อความผลตรวจที่พิมพ์ค้างไว้ (ปิดฟอร์ม/แอปหลุด) — จำไว้ในเครื่องโดยไม่ต้องกดบันทึกร่าง
    if (order.status === "INSPECTING") loadDraft(`inspect:${order.id}`).then((v) => v && setFinding(v));
    // นัดตรวจที่หัวหน้าภาคไม่ได้ใส่วันเสนอ — ไม่มีวันให้ลูกค้า "ตกลง" มีแต่ต้องใส่วันนัด
    // ช่างแจ้งร้านปิด / หัวหน้าภาคส่งกลับเพราะทีมไม่ว่าง — วันเดิมใช้ไม่ได้แล้ว เปิดที่ "ลูกค้าขอเลื่อน" เลย
    setConfirmChoice(
      (order.status === "INSPECT_CONFIRM" && (!order.scheduledAt || declinedNewDate(order))) ||
        (order.status === "AWAITING_CONFIRM" && (sentBackLog(order) || declinedNewDate(order)))
        ? "MOVE"
        : null
    );
    setDeclineDate(false);
    setSplitOut(false);
    setSplitPaid(null);
    setTransferChoice({});
    // วันเดิมที่ผ่านไปแล้วไม่เติม — นัดวันที่เลยมาแล้วคือนัดที่ไม่มีใครไปได้
    const oldVisit = pf?.scheduledAt && pf.scheduledAt >= todayBkk() ? pf.scheduledAt : null;
    const visitDay = order.scheduledAt ? order.scheduledAt.slice(0, 10) : prev(null, oldVisit, "วันนัด");
    setVisit(visitDay ?? "");
    setVisitTime(order.scheduledTime ?? (oldVisit && visitDay === oldVisit ? pf?.scheduledTime ?? "" : ""));
    const split = splitParts(order.waitingParts);
    setParts(split.store);
    setPickedBrand(null);
    setOffParts(split.off);
    setServices(order.services.map((v) => ({ name: v.name, quantity: v.quantity, unit: v.unit ?? "", note: v.note ?? "" })));
    const oldCheck = new Map((pf?.parts ?? []).map((p) => [p.sparePartId, p]));
    // ส่งให้ลูกค้าแล้วผูกกับเลขใบเบิก — ย้อนขั้นมาเบิกใหม่ เติมค่าก่อนย้อนให้เหมือนเลขใบเบิก (ชิ้นที่ยังไม่ได้เบิกรอบนี้เท่านั้น)
    const sentBefore =
      order.status === "PARTS_REQUESTED"
        ? order.waitingParts
            .filter((p) => !(p.inStock === true && p.requisitionNo) && oldCheck.get(p.sparePartId)?.sentToCustomer === true)
            .map((p) => p.sparePartId)
        : [];
    if (sentBefore.length) used.push("ส่งให้ลูกค้าแล้ว");
    setSentChoice(Object.fromEntries(sentBefore.map((pid) => [pid, true])));
    const checkPrefilled = order.waitingParts.some((p) => p.inStock === null && oldCheck.get(p.sparePartId)?.inStock != null);
    if (checkPrefilled && ["PARTS_SOURCING", "PARTS_REQUESTED"].includes(order.status)) used.push("ผลเช็คคลัง");
    // ผลเช็คก่อนเสนอราคาที่เก่าเกิน 3 วัน — ของอาจถูกงานอื่นใช้ไประหว่างรอเงิน ต้องเช็คใหม่ (ไม่เติมให้)
    const stale = sourcingCheck(order)?.stale === true;
    setChecks(
      Object.fromEntries(
        order.waitingParts.map((p) => {
          const old = p.inStock === null ? oldCheck.get(p.sparePartId) : undefined;
          const now = stale && !p.requisitionNo ? null : p.inStock;
          /**
           * ของนอกสโตร์ที่แอดมินยังไม่เคยเช็ค: ปุ่มติดให้ตามที่หัวหน้าภาคแจ้ง (เจ้าของงานเลือกข้อ 1) — แอดมินกดเปลี่ยนได้
           * เฉพาะขั้นเช็คอะไหล่ (หาได้/ยังหาไม่ได้) · ขั้นเบิกถามคนละเรื่อง (ได้ของมาแล้วหรือยัง) ไม่ติดให้
           * ผลเช็คเดิม/ค่าก่อนย้อนชนะเสมอ — นั่นคือคำตอบของแอดมินเอง
           */
          const told = order.status === "PARTS_SOURCING" && p.offCatalog && p.inStock === null ? p.offFound ?? null : null;
          return [p.sparePartId, { inStock: old?.inStock ?? now ?? told, warehouse: p.warehouse ?? old?.warehouse ?? null }];
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
    setTransfer(
      Object.fromEntries(
        order.waitingParts
          .filter((p) => isTransfer(p, adminWarehouse))
          // ปลายทางตั้งต้นที่คลังที่แอดมินเบิกส่งมอบได้ (คลัง 94) — เลือกคลังที่ใกล้หน้างานแทนได้
          .map((p) => [p.sparePartId, { from: p.warehouse, reqNo: "", to: adminWarehouse, transferNo: "" }])
      )
    );
    setTransferDocs({});
    setPickupFail(false);
    setNote("");
    setError(null);
    setGateTried(false);
    setMarks({});
    setReason("");
    setRejectOpen(false);
    setPickMsg(null);
    setZoom(null);
    /**
     * ข้อ 5 ของฟอร์มตรวจหน้างาน — รายการตั้งต้น (ของในใบ / รายการที่ถูกตีกลับ) แล้วทับด้วยร่างของรอบนี้ถ้ามี
     * ร่างอยู่ในเครื่องเหมือนข้อความผลตรวจ: ช่างเลือกอะไหล่ค้างไว้แล้วแอปหลุด กลับมาไม่ต้องค้นใหม่
     */
    if (order.status === "INSPECTING") {
      setParts(inspectPrefill(order));
      const key = inspectDraftKey(order);
      loadDraft(`inspectParts:${order.id}`).then((raw) => {
        const d = parseInspectDraft(raw, key);
        if (!d) return;
        setParts(d.parts);
        setPickedBrand(d.brand);
      });
    }
  }, [visible, order]);
  /**
   * นาฬิกาจากคำตอบ 400 ใช้ได้เฉพาะรอบที่ฟอร์มเปิดอยู่ — เปิดใหม่ได้ serverNow ของใบที่โหลดใหม่แล้ว (ล้างตามการเปิด/ปิด ไม่ใช่ตามใบ)
   */
  useEffect(() => {
    setClock(null);
  }, [visible]);
  /**
   * วันที่แอดมินแก้เป็นงานด่วนให้ (มาระหว่างเปิดฟอร์ม หรือแก้ไว้ก่อนเปิด) — เลือกวันนั้นให้ ถ้ายังไม่ได้เลือกวันหรือวันที่เลือกปิดแล้ว
   * (ตัวอย่าง simApprove) คำขอคือ "ร้านต้องการวันนั้นจริง" แอดมินแก้ให้แล้ววันนั้นคือคำตอบ · วันที่หัวหน้าภาคเลือกเองแล้วและยังเปิดอยู่ไม่ทับ
   * วางหลัง effect ล้างฟอร์ม: เปิดฟอร์มรอบเดียวกัน setVisit แบบฟังก์ชันจะได้ค่าที่ล้างแล้วมาดู ไม่ใช่ค่าของรอบก่อน
   */
  const grantedDay = urgentFor ? urgentFor.slice(0, 10) : null;
  useEffect(() => {
    if (!visible || !grantedDay || !SCHEDULE_STAGES.includes(order.status) || grantedDay < serverDay(now)) return;
    setVisit((v) => (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !dayAllowed(v, now, rule, grantedDay) ? grantedDay : v));
    // เฉพาะตอนเปิดฟอร์มหรือวันที่แก้ให้เปลี่ยน — นาฬิกาเดินทุก 30 วิ ไม่ใช่เหตุให้ทับวันที่หัวหน้าภาคเลือก
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, grantedDay]);
  useEffect(() => {
    setUrgentWith(false);
  }, [visible, visit, confirmChoice]);

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
      await uploadAttachment(order.id, file, role, undefined, { index: n, total: list.length });
      setDocs((prev) => prev.filter((f) => f !== file));
    }
  }

  /**
   * ข้อ 5 ของฟอร์มตรวจหน้างาน — จำรายการกับยี่ห้อที่กดไว้ทุกครั้งที่แก้ (ไม่ใช่ตอนเปิดฟอร์ม: เปิดเฉย ๆ ไม่ได้แปลว่าเลือกแล้ว)
   * ต่อรอบตรวจ/รอบที่ถูกตีกลับ (inspectDraftKey) · ส่งสำเร็จแล้วลบ
   */
  function saveInspectDraft(next: PickedPart[], brand: string | null) {
    saveDraft(`inspectParts:${order.id}`, JSON.stringify({ key: inspectDraftKey(order), parts: next, brand }));
  }
  const changeInspectParts = (next: PickedPart[]) => {
    setParts(next);
    saveInspectDraft(next, pickedBrand);
  };
  const changeInspectBrand = (b: string | null) => {
    setPickedBrand(b);
    saveInspectDraft(parts, b);
  };

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
          ...urgentFlag,
        });
      } else if (order.status === "INSPECTING") {
        // ด่านส่งใหม่หลังถูกตีกลับ — ข้อความเดียวกับเซิร์ฟเวอร์ ไม่ต้องรอไปกลับ (เซิร์ฟเวอร์ตรวจซ้ำอยู่ดี)
        if (gateText) {
          setGateTried(true);
          return;
        }
        // ยี่ห้อที่กดไว้ส่งไปเสมอ ไม่ว่าจะเลือกอะไหล่ไหม — เครื่องจำยี่ห้อไว้ ครั้งหน้าไม่ต้องถามอีก (4.3)
        const machineBrand = machineBrandToSend(order.partsBrand, pickedBrand);
        /**
         * ส่ง parts เสมอ (ว่างได้) — รายการที่ช่างส่งแทนรายการเดิมทั้งชุด (ข้อ 5 · ค่าตั้งต้น D1)
         * removed = อะไหล่ในสโตร์ที่อยู่ในใบแต่ไม่อยู่ในรายการที่ส่ง — ส่งว่างแล้วตัวที่ยังไม่เบิกหลุดจากใบจริง ไม่ค้างขึ้นกระดาน
         * (ส่งมีรายการ เซิร์ฟเวอร์ไม่แตะใบจนหัวหน้าภาคคอนเฟิร์ม)
         */
        await api.post(`/work-orders/${order.id}/inspection`, {
          note: finding.trim(),
          parts: parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
          removed: removedIds,
          ...(machineBrand ? { machineBrand } : {}),
          // ตัวที่ยืนยันใช้ข้ามยี่ห้อ (ช่องของช่าง — strict เหมือนป้ายบนจอ) · หัวหน้าภาคยังต้องยืนยันอีกครั้งตอนคอนเฟิร์ม
          ...crossBrandField(parts, order.partsBrand, pickedBrand, { strict: true }),
        });
        clearDraft(`inspect:${order.id}`);
        clearDraft(`inspectParts:${order.id}`);
        // ช่าง: ใบออกจากงานของฉันวันนี้ (ข้อ 13) — หน้าใบงานพากลับไปงานของฉันพร้อมกล่อง "ส่งผลตรวจแล้ว"
        // หัวหน้าภาค/แอดมินบันทึกแทน: ใบไปที่ฟอร์มระบุอะไหล่ ข้อความทั่วไป "จากไหน → ไปไหน"
        if (techSend) {
          onDone(parts.length ? "pickSent" : "inspectionSent");
          return;
        }
      } else if (order.status === "WAITING_PARTS") {
        await api.post(`/work-orders/${order.id}/parts-arrived`, { note: note.trim() || undefined });
      } else if (order.status === "AWAITING_CONFIRM" || order.status === "INSPECT_CONFIRM") {
        // ตกลงวันเดิมไม่ส่งวันไป — เซิร์ฟเวอร์ใช้วันที่หัวหน้าภาคใส่ไว้ จะได้ไม่บันทึกว่าเลื่อนเพราะเผลอแตะช่องวัน
        // งานด่วนส่งเฉพาะ "ลูกค้าขอเลื่อน" ที่บรรทัดขอให้ติ๊กและติ๊กไว้ — เซิร์ฟเวอร์ตัดสินซ้ำจากเวลาที่คำขอไปถึง
        const urgent = confirmNeedTick && urgentWith ? { urgent: true } : {};
        await api.post(
          `/work-orders/${order.id}/confirm-appointment`,
          confirmChoice === "MOVE"
            ? { scheduledAt: visit, scheduledTime: visitTime || null, note: note.trim() || undefined, ...seenAppointment(order), ...urgent }
            : { note: note.trim() || undefined, ...seenAppointment(order), ...urgent }
        );
        onDone("confirmed");
        return;
      } else if (order.status === "NEW") {
        const machineBrand = machineBrandToSend(order.partsBrand, pickedBrand);
        await api.post(`/work-orders/${order.id}/parts`, {
          ...(machineBrand ? { machineBrand } : {}),
          // แถวที่เบิกแล้วจำนวนเดิมผ่านเป็น legacy อยู่แล้ว ไม่นับเป็นข้ามยี่ห้อ (กติกาเดียวกับป้ายบนจอ)
          ...(needsParts ? crossBrandField(parts, order.partsBrand, pickedBrand, { legacyIds: partsLegacy }) : {}),
          services: offPartsPayload(services),
          needsParts,
          parts: needsParts
            ? parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity }))
            : [],
          // พร้อมคำตอบจัดหา (หาได้ + แหล่ง · หาไม่ได้ + เหตุผล) — เซิร์ฟเวอร์ปฏิเสธถ้าขาด (offAnswerRefusal)
          offParts: needsParts ? offPartsPayload(offParts, "plan") : [],
          assign: noPartsAssign ? { team, scheduledAt: visit, scheduledTime: visitTime || null, ...urgentFlag } : undefined,
          note: note.trim() || undefined,
        });
      } else if (order.status === "PARTS_REQUESTED" && partsShort) {
        await api.post(`/work-orders/${order.id}/parts-short`, {
          sparePartIds: thisRound.filter((p) => checks[p.sparePartId]?.inStock === false).map((p) => p.sparePartId),
          expectedAt: expectedAt || null,
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
            // ส่งเฉพาะชิ้นที่เลือกว่าส่งให้ลูกค้าแล้ว — ไม่ส่ง = รับที่คลัง (เซิร์ฟเวอร์รุ่นก่อนก็เข้าใจแบบนี้)
            ...(sendable(p) && sentChoice[p.sparePartId] ? { sentToCustomer: true } : {}),
          })),
          pickupNote: toPickup.length ? pickupNote.trim() || undefined : undefined,
          ...(askTransfer.length ? { noTransfer: askTransfer.filter((pid) => transferChoice[pid] === false) } : {}),
          splitOut: mixed && splitOut,
          ...(mixed && splitOut && paidOrder ? { splitPaid: splitPaid ?? undefined } : {}),
          expectedAt: checkOut && expectedAt ? expectedAt : null,
          note: note.trim() || undefined,
        });
      } else if (order.status === "PARTS_TRANSFER" || order.status === "PARTS_IN_TRANSIT") {
        if (pickupFail) {
          await api.post(`/work-orders/${order.id}/parts-transfer/return`, { reason: note.trim() });
        } else if (order.status === "PARTS_TRANSFER") {
          await api.post(`/work-orders/${order.id}/parts-transfer`, {
            results: transferParts.map((p) => ({
              sparePartId: p.sparePartId,
              fromWarehouse: transfer[p.sparePartId]?.from,
              transferReqNo: transfer[p.sparePartId]?.reqNo.trim(),
              toWarehouse: transfer[p.sparePartId]?.to,
              transferNo: transfer[p.sparePartId]?.transferNo.trim(),
            })),
            note: note.trim() || undefined,
          });
        } else {
          await api.post(`/work-orders/${order.id}/parts-transfer/arrived`, { note: note.trim() || undefined });
        }
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
          results: thisRound.map((p) => ({
            sparePartId: p.sparePartId,
            inStock: checks[p.sparePartId]?.inStock === true,
            warehouse: p.offCatalog || checks[p.sparePartId]?.inStock !== true ? null : checks[p.sparePartId]?.warehouse ?? null,
          })),
          splitOut: sourcingSplit,
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
      } else if (canDecline && declineDate) {
        await api.post(`/work-orders/${order.id}/decline-new-date`, { reason: note.trim(), ...seenAppointment(order) });
        onDone("declined");
        return;
      } else if (order.status === "ASSIGNED" || order.status === "INSPECT_DISPATCH") {
        await api.post(`/work-orders/${order.id}/dispatch`, {
          team,
          note: note.trim() || undefined,
          ...seenAppointment(order),
        });
        onDone("released");
        return;
      } else {
        await api.post(`/work-orders/${order.id}/assign`, {
          team,
          scheduledAt: visit,
          scheduledTime: visitTime || null,
          note: note.trim() || undefined,
          ...urgentFlag,
        });
      }
      onDone();
    } catch (e) {
      /**
       * วันที่เลือกปิดนัดไปแล้วตอนคำสั่งไปถึงเซิร์ฟเวอร์ (เปิดฟอร์มก่อน 16:00 กดหลัง 16:00 · แอดมินเพิ่งเลื่อนเวลาปิดให้เร็วขึ้น)
       * — เจ้าของงานข้อ 6 "แอปโหลดสถานะฟอร์มใหม่": ใช้นาฬิกา/เวลาปิดจากคำตอบแทน ไม่โหลดใบใหม่ (ทีม/เวลา/อะไหล่ที่กรอกต้องอยู่)
       * วันนั้นจึงขีดฆ่าทันที บรรทัดแดง "วันที่เลือกไว้ … ปิดนัดแล้ว" ขึ้น ปุ่มบันทึกปิด — ข้อความดิบของเซิร์ฟเวอร์ขึ้นเฉพาะตอนที่
       * ฟอร์มยังคิดว่าวันนั้นใช้ได้ (บรรทัดแดงบอกเรื่องเดียวกันอยู่แล้ว สองข้อความซ้อนกันคนอ่านไม่ทันทั้งคู่)
       * คอนเฟิร์มลูกค้า "ลูกค้าขอเลื่อน" ของแอดมินใช้กติกาเดียวกัน: นาฬิกาใหม่ทำให้บรรทัดแดง + ช่องติ๊กขึ้นเอง ปุ่มปิดจนกว่าจะติ๊ก
       */
      const closed = closedFromError(e);
      if (closed) {
        setClock(closed);
        const n = Date.parse(closed.serverNow);
        const r2 = order.isTest ? null : closed.cutoff;
        const formSeesIt = schedForm ? !dayAllowed(visit, n, r2, urgentFor) : !!adminDayLine(confirmMoveDay, n, r2, urgentFor, true)?.needTick;
        if (!formSeesIt) setError(apiErrorMessage(e));
        return;
      }
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
      setBusy(null);
    }
  }

  /** ป้ายตรง/ไม่ตรงที่ส่งไปกับคำขอ — เฉพาะตัวในรอบนี้ (เซิร์ฟเวอร์ปฏิเสธตัวที่ไม่อยู่ในรายการ) */
  const marksPayload = () =>
    (pending?.items ?? []).filter((i) => marks[i.sparePartId]).map((i) => ({ sparePartId: i.sparePartId, mark: marks[i.sparePartId] }));

  /**
   * ส่งคำตอบของจอคอนเฟิร์ม — 400 ขึ้นแถบแดงใต้หัวฟอร์ม (ปุ่มอยู่ท้ายฟอร์ม ข้อความท้ายเนื้อหาอาจอยู่นอกจอ)
   * 409 (ช่างส่งใหม่/ใบเปลี่ยนขั้นระหว่างดู) ตัวจัดการกลางปิดฟอร์มแล้วโหลดใบใหม่ให้ (api/client) — ไม่ต้องทำอะไรเพิ่ม
   */
  async function sendPick(kind: "pickConfirmed" | "pickReturned", path: string, body: object) {
    setSaving(true);
    setBusy(kind);
    setError(null);
    setPickMsg(null);
    try {
      await api.post(`/work-orders/${order.id}/parts-pick/${path}`, body);
      onDone(kind);
    } catch (e) {
      setPickMsg({ kind: "err", text: apiErrorMessage(e) });
    } finally {
      setSaving(false);
      setBusy(null);
    }
  }

  /**
   * คอนเฟิร์มอะไหล่ — ปุ่มกดได้เสมอ (ตัวอย่าง supConfirm) ยังไม่ครบบอกว่าขาดอะไรแทนปุ่มเทาที่กดแล้วเงียบ
   * ตัวที่กด "ไม่ตรง" คอนเฟิร์มไม่ได้ (ทั้งชุดเดียว ข้อ 8) — ต้องตีกลับ หรือเปลี่ยนใจเป็น "ตรง"
   */
  function confirmPick() {
    if (!pending) return;
    if (pending.items.some((i) => marks[i.sparePartId] === "NO")) {
      setPickMsg({ kind: "warn", text: "มีรายการที่กด ไม่ตรง — ตีกลับให้ช่างแก้ หรือเปลี่ยนเป็น ตรง ก่อนคอนเฟิร์ม" });
      return;
    }
    const left = pending.items.filter((i) => !marks[i.sparePartId]).length;
    if (left) {
      setPickMsg({
        kind: "warn",
        text: `กด ตรง หรือ ไม่ตรง ให้ครบทุกรายการก่อนคอนเฟิร์ม (เหลือ ${left} รายการ) — หรือกด “ตรงทุกรายการ”`,
      });
      return;
    }
    // ของนอกสโตร์ที่เติม (รวมของเดิมในใบที่ฟอร์มเติมไว้ให้) ต้องตอบจัดหาเหมือนฟอร์มระบุอะไหล่ — บอกว่าขาดอะไรแล้วพาไปที่กล่อง
    const offLeft = offPartsMissing(offParts, "plan");
    if (offLeft.length) {
      setPickMsg({ kind: "warn", text: `อะไหล่นอกยังขาด ${offLeft.length} อย่าง: ${offLeft.join(" · ")}` });
      setOffFlash(true);
      offBox.go();
      return;
    }
    const body = {
      pickId: pending.id,
      offParts: offPartsPayload(offParts, "plan"),
      services: offPartsPayload(services),
      note: note.trim() || undefined,
      marks: marksPayload(),
    };
    /**
     * มีตัวที่ช่างเลือกข้ามยี่ห้อ — ถามครั้งเดียวทั้งชุด (กล่องเดียวกับช่องเลือกอะไหล่) แล้วส่ง crossBrandOk
     * ยกเลิก = ไม่ส่งอะไร ฟอร์มอยู่เหมือนเดิม (ตีกลับได้ตามปกติ)
     */
    const cross = pickCrossItems(order, pending);
    if (cross.length) {
      showAlert(
        CROSS_BRAND_TITLE,
        crossBrandMessage(cross, {
          code: order.partsBrand?.machineCode ?? order.machineCode ?? "",
          make: order.partsBrand?.make ?? order.machineBrand ?? null,
          file: order.partsBrand?.file ?? pending.brandFile,
        }),
        [
          { text: "ยกเลิก", style: "cancel" },
          {
            text: CROSS_BRAND_OK,
            onPress: () => void sendPick("pickConfirmed", "confirm", { ...body, crossBrandOk: cross.map((i) => i.sparePartId) }),
          },
        ]
      );
      return;
    }
    void sendPick("pickConfirmed", "confirm", body);
  }

  /**
   * ตีกลับให้ช่างแก้ — กดครั้งแรกโดยไม่มีเหตุผลเปิดกล่องเหตุผล (ตัวอย่าง supReject) ไม่ส่ง
   * เหตุผลบังคับเพราะช่างต้องรู้ว่าแก้อะไร (บทเรียนจากเคลม) · ตัวที่กด "ไม่ตรง" ไปเป็นตัวที่ชี้ บนการ์ดแดงของช่าง
   */
  function returnPick() {
    if (!pending) return;
    if (!reason.trim()) {
      setRejectOpen(true);
      setPickMsg({ kind: "err", text: "ตีกลับต้องบอกเหตุผล — ช่างเห็นข้อความนี้บนใบงาน และต้องรู้ว่าต้องแก้อะไร" });
      return;
    }
    void sendPick("pickReturned", "return", {
      pickId: pending.id,
      reason: reason.trim(),
      flags: pending.items.filter((i) => marks[i.sparePartId] === "NO").map((i) => i.sparePartId),
      marks: marksPayload(),
    });
  }

  /**
   * ขอแอดมินแก้เป็นงานด่วน (day) / ยกเลิกคำขอ (null) — ฟอร์มไม่ปิด (ตัวอย่าง ask) หัวหน้าภาคเห็นกล่องม่วงทันที
   * และนัดวันอื่นต่อได้ระหว่างรอ · วาดทับสถานะคำขอจากคำตอบ (ใบงานทั้งก้อน) ผ่าน onOverlay — ห้าม setOrder/โหลดใบใหม่
   * เพราะฟอร์มล้างทุกช่องที่กรอกเมื่อใบเปลี่ยน
   * 409 URGENT_ASK_STATE = สถานะคำขอเปลี่ยนไปก่อนกด (แอดมินเพิ่งแก้ให้/ตอบ · คำขอหมดไปแล้ว) ไม่ใช่ใบเปลี่ยนขั้น:
   * ดึงสถานะล่าสุดมาวาดทับแล้วบอกข้อความของเซิร์ฟเวอร์ในฟอร์ม ฟอร์มยังเปิดอยู่ทีม/เวลาไม่หาย (ตัวจัดการ 409 กลางไม่รับรหัสนี้)
   * 409 อื่น (ใบเปลี่ยนขั้นจริง) ตัวจัดการกลางปิดฟอร์มให้แล้ว ไม่ต้องบอกซ้ำ
   */
  async function askUrgent(day: string | null) {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post<WorkOrder>(`/work-orders/${order.id}/urgent-request${day ? "" : "/cancel"}`, day ? { day } : {});
      onOverlay(overlayOf(data));
    } catch (e) {
      const msg = askStateError(e);
      if (msg !== null) {
        try {
          const { data } = await api.get<WorkOrder>(`/work-orders/${order.id}`, { loadingText: false });
          onOverlay(overlayOf(data));
        } catch {
          // ดึงไม่ได้ (เน็ตหลุด) — ข้อความของเซิร์ฟเวอร์ยังบอกว่าเกิดอะไร ตัวเช็ค 20 วิจะวาดทับให้ทีหลัง
        }
        setError(msg);
      } else if (staleWorkOrderId(e) === null) setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
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
  // ตัวที่โอนมาถึงคลังนี้แล้วไม่ต้องถาม — ถามเฉพาะของที่ยังอยู่คลังต้นทาง
  const askTransfer = toPickup
    .filter((p) => !(p.transferredAt && p.warehouse === checks[p.sparePartId]?.warehouse))
    .map((p) => p.sparePartId);
  /**
   * ชิ้นที่ถามได้ว่า "ส่งให้ลูกค้าแล้ว" — ของในสโตร์ที่แอดมินเบิกจากคลัง 94 รอบนี้ (รวมชิ้นที่โอนมาถึง 94 แล้ว)
   * ชิ้นที่หัวหน้าภาคเบิกจากคลังอื่นไม่อยู่ในเรื่องนี้ (เจ้าของงานขอเฉพาะการเบิกของแอดมิน) — เซิร์ฟเวอร์ปฏิเสธเหมือนกัน
   */
  const sendable = (p: StockPart) =>
    order.status === "PARTS_REQUESTED" &&
    !p.offCatalog &&
    checks[p.sparePartId]?.inStock === true &&
    checks[p.sparePartId]?.warehouse === adminWarehouse;
  const firstSendable = thisRound.find(sendable)?.sparePartId;
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
  const pickupRequest = ["PARTS_PICKUP", "PARTS_TRANSFER"].includes(order.status) ? lastPickupRequest(order) : null;
  // ขั้นเบิกและโอน / รอโอน
  const transferParts = order.status === "PARTS_TRANSFER" ? order.waitingParts.filter((p) => isTransfer(p, adminWarehouse)) : [];
  const movingParts = order.status === "PARTS_IN_TRANSIT" ? order.waitingParts.filter(inTransit) : [];
  const transferBlocked =
    (order.status === "PARTS_TRANSFER" || order.status === "PARTS_IN_TRANSIT") &&
    (pickupFail
      ? !note.trim()
      : order.status === "PARTS_TRANSFER" &&
        transferParts.some((p) => {
          const t = transfer[p.sparePartId];
          return !t?.from || !t.to || t.from === t.to || !t.reqNo.trim() || !t.transferNo.trim();
        }));
  /** ใบขอโอนสินค้า PDF ของคู่คลังหนึ่ง — ใช้ฟอร์มเดียวกับเมนูเอกสารขอโอนสินค้า เติมรายการให้ */
  async function transferDoc(from: string, to: string, rows: { part: StockPart; transferNo: string }[]) {
    const key = `${from}→${to}`;
    setDocBusy(key);
    setError(null);
    try {
      const nos = [...new Set(rows.map((r) => r.transferNo.trim()).filter(Boolean))];
      const res = await api.post<{ path: string }>("/documents/transfer-request", {
        format: "pdf",
        fromWarehouse: from,
        toWarehouse: to,
        documentNo: nos.join(", ") || undefined,
        note: `ใบงาน ${order.code}`,
        items: rows.map((r) => ({ code: r.part.partCode, name: r.part.name, quantity: r.part.quantity })),
      });
      setTransferDocs((d) => ({ ...d, [key]: res.data.path }));
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setDocBusy(null);
    }
  }
  // คู่คลังที่ต้องออกใบขอโอน — ขั้นเบิกและโอนใช้ค่าที่กรอกอยู่ ขั้นรอโอนใช้ค่าที่บันทึกแล้ว
  const transferPairs = (() => {
    const rows =
      order.status === "PARTS_TRANSFER"
        ? transferParts.map((p) => ({ part: p, from: transfer[p.sparePartId]?.from, to: transfer[p.sparePartId]?.to, transferNo: transfer[p.sparePartId]?.transferNo ?? "" }))
        : movingParts.map((p) => ({ part: p, from: p.transferFrom, to: p.warehouse, transferNo: p.transferNo ?? "" }));
    const pairs = new Map<string, { from: string; to: string; rows: { part: StockPart; transferNo: string }[] }>();
    for (const r of rows) {
      if (!r.from || !r.to || r.from === r.to) continue;
      const k = `${r.from}→${r.to}`;
      const cur = pairs.get(k) ?? { from: r.from, to: r.to, rows: [] };
      cur.rows.push({ part: r.part, transferNo: r.transferNo });
      pairs.set(k, cur);
    }
    return [...pairs.entries()];
  })();
  // ขั้นเสนอราคาต้องมีเอกสาร เว้นแต่กดข้ามซึ่งต้องบอกเหตุผลแทน
  const quoteBlocked =
    order.status === "AWAITING_QUOTE" &&
    (skipQuote ? !note.trim() : docs.length === 0 && !order.hasQuote);
  // ขั้นรอเบิกอะไหล่ต้องตอบครบทุกตัวที่ยังไม่ได้เบิก — ตอบบางตัวแล้วไปเสนอราคา คือเสนอราคาของที่ยังไม่รู้ว่ามี
  // (ตัวที่เบิกไปแล้วรอบก่อน ลูกค้าจ่ายไปแล้ว ไม่ต้องเช็คและเสนอราคาซ้ำ)
  const sourcingOut = order.status === "PARTS_SOURCING" ? thisRound.filter((p) => checks[p.sparePartId]?.inStock === false) : [];
  // มีบางตัวหมดบางตัว — แยกตัวที่หมดไปใบรออะไหล่ได้ ใบนี้ไปนัดด้วยของที่มี (ตั้งต้นเป็นแยก เหมือนขั้นเบิกเดิม)
  const sourcingMixed =
    order.status === "PARTS_SOURCING" &&
    sourcingOut.length > 0 &&
    (issued.length > 0 || thisRound.some((p) => checks[p.sparePartId]?.inStock === true));
  const sourcingSplit = sourcingMixed && splitOut;
  // มีครบแล้วไปไหนต่อ — ตามกฎเสนอราคาเดียวกับเซิร์ฟเวอร์ (ใบแยกที่ลูกค้าจ่ายแล้วในใบเดิมไม่เสนอราคาซ้ำ)
  const quoteNext = order.needsQuote && !order.logs.some((l) => l.action === "PREPAID");
  // ของอยู่คลังอื่น — บอกตั้งแต่ตอนเช็คว่าหัวหน้าภาคต้องเบิก/โอนเองหลังนัดวัน
  const sourcingFar =
    order.status === "PARTS_SOURCING"
      ? thisRound.filter((p) => {
          const c = checks[p.sparePartId];
          return !p.offCatalog && c?.inStock === true && !!c.warehouse && c.warehouse !== adminWarehouse;
        })
      : [];
  const sourcingBlocked =
    order.status === "PARTS_SOURCING" &&
    (thisRound.some((p) => typeof checks[p.sparePartId]?.inStock !== "boolean") ||
      // มีของต้องบอกคลัง — หัวหน้าภาคนัดวันจากคลังนี้ (ของคลังอื่นต้องโอน)
      thisRound.some((p) => !p.offCatalog && checks[p.sparePartId]?.inStock === true && !checks[p.sparePartId]?.warehouse) ||
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
  /**
   * ของไม่พอตอนเบิก — ไม่แยกใบ = ทั้งใบกลับไปเช็คอะไหล่ รอของเข้า แล้วหัวหน้าภาคนัดใหม่ (parts-short)
   * ตัวที่มีไม่ต้องใส่เลขใบเบิก เพราะยังไม่เบิก
   * เบิกก่อนคอนเฟิร์ม (ต.ค. 69 รอบสอง): ส่วนใหญ่ร้านยังไม่รู้วัน — แค่ยกเลิกวันที่หัวหน้าภาคจองไว้ ไม่ต้องโทร
   * ใบที่คอนเฟิร์มไปก่อนสลับลำดับ ร้านรู้วันแล้ว — ยังต้องโทรแจ้งเลื่อนเหมือนเดิม
   */
  const partsShort = checkOut && !(mixed && splitOut);
  const shopKnows = APPOINTMENT_DONE.includes(order.appointmentStatus ?? "");
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(visit);
  /**
   * คอนเฟิร์มแล้วไปไหน — ปกติของเบิกครบแล้ว (เบิกก่อนคอนเฟิร์ม ต.ค. 69 รอบสอง) ไปให้หัวหน้าภาคปล่อยงาน
   * ยังมีของต้องเบิก = ใบเก่าที่นัดก่อนเปลี่ยนลำดับและหลุดการย้ายขั้นมา — เซิร์ฟเวอร์ส่งไปเบิกต่อ (issueLeft ใน /confirm-appointment) จึงบอกให้ตรง
   */
  const confirmToIssue = order.status === "AWAITING_CONFIRM" && partsToIssue(order);
  /**
   * ช่างเลือกอะไหล่มารอคอนเฟิร์ม — ฟอร์มขั้น NEW เป็นจอคอนเฟิร์มแทนคำถาม "ใช้อะไหล่ไหม" (ช่างตอบมาแล้ว)
   * กด "ต้องเข้าตรวจสอบหน้างานก่อน" ในจอ = inspectFirst → ฟอร์มส่งตรวจเดิมทั้งชุด (รวมกฎปิดนัด/วันย้อนหลัง) และเซิร์ฟเวอร์ทิ้งรอบนี้
   */
  const pending = order.status === "NEW" ? pickPending(order) : null;
  const confirming = !!pending && !inspectFirst;
  const anyNo = confirming && pending!.items.some((i) => marks[i.sparePartId] === "NO");
  const showReject = confirming && (rejectOpen || anyNo);
  // ไม่ใช้อะไหล่ และไม่มีค่าบริการให้เสนอราคา = ขั้นถัดไปคือจ่ายงาน → จ่ายในฟอร์มนี้เลย
  // (จอคอนเฟิร์มไม่มีคำถามนี้ — needsParts เดิมของใบอาจเป็น false จากรอบก่อน ห้ามพาไปฟอร์มจ่ายงาน)
  const noPartsAssign =
    order.status === "NEW" && !inspectFirst && !pending && needsParts === false && offPartsPayload(services).length === 0;
  const timeOk = visitTime === "" || isTime(visitTime);
  /**
   * วันนัดเลือกได้ตั้งแต่วันนี้ (เจ้าของงานกำหนด ต.ค. 69 — แทนกฎ "ของคลังอื่นนัดล่วงหน้า 7 วัน" ที่ยกเลิก) · เซิร์ฟเวอร์กันซ้ำ
   * ปฏิทินขีดฆ่าวันที่ผ่านมาแล้ว แต่วันที่กรอกค้างมาก่อน (เปิดฟอร์มทิ้งไว้ข้ามวัน) ยังเป็นอดีตได้ — กันปุ่มไว้ด้วย
   * ลูกค้าขอเลื่อน = นัดใหม่ เช็คเสมอ (ร้านปิด/ช่างส่งกลับ ฟอร์มเปิดมาพร้อมวันเดิมที่ผ่านไปแล้ว) · "ลูกค้าคอนเฟิร์มวันเดิม" ไม่เช็ค
   */
  const minVisit = todayBkk();
  const visitPast =
    validDate &&
    visit < minVisit &&
    (order.status === "PARTS_CHECKED" ||
      (order.status === "NEW" && (inspectFirst || noPartsAssign)) ||
      ((order.status === "AWAITING_CONFIRM" || order.status === "INSPECT_CONFIRM") && confirmChoice === "MOVE"));
  const pastWarn = visitPast ? <Text style={styles.warn}>วันนัดย้อนหลังไม่ได้ — เลือกตั้งแต่วันนี้เป็นต้นไป</Text> : null;
  /**
   * เวลาปิดนัดงานพรุ่งนี้ (ย้ายมาที่การนัดวัน 2 พ.ย. 69) — ฟอร์มที่เลือกวันเข้า/วันตรวจ: นัดวันเข้า · ไม่ใช้อะไหล่จ่ายงาน · ส่งตรวจ
   * schedClosed = วันที่เลือกปิดนัดแล้วและแอดมินยังไม่ได้แก้เป็นงานด่วนให้ (ตามนาฬิกาเซิร์ฟเวอร์ของฟอร์ม)
   * หัวหน้าภาค: วันที่ปิดขีดฆ่ากดไม่ได้ · วันที่เลือกไว้ก่อนแล้วปิดระหว่างเปิดฟอร์ม → กรอบแดง + ปุ่มบันทึกปิด (เซิร์ฟเวอร์ก็ตอบ 400)
   * แอดมินที่ทำแทน: เลือกได้ทุกวัน แต่วันที่ปิดต้องติ๊กแก้เป็นงานด่วนก่อนบันทึก แล้วส่ง urgent ไปในคำขอเดียวกัน
   * วันที่ย้อนหลังมีบรรทัดของมันเอง (pastWarn) ขึ้นก่อน — ไม่คิดกฎปิดนัดซ้อน (เซิร์ฟเวอร์ก็เช็ควันย้อนหลังก่อน)
   */
  const schedForm = order.status === "PARTS_CHECKED" || (order.status === "NEW" && (inspectFirst || noPartsAssign));
  const schedClosed = schedForm && validDate && !visitPast && !dayAllowed(visit, now, rule, urgentFor);
  const urgentFlag = who === "admin" && schedClosed && urgentWith ? { urgent: true } : {};
  const schedField = {
    closed: who === "supervisor" ? (d: string) => !dayAllowed(d, now, rule, urgentFor) : undefined,
    dayTags: scheduleDayTags(now, rule, urgentFor, who),
    invalid: schedClosed && (who === "supervisor" || !urgentWith),
  };
  const scheduleHelp = (
    <ScheduleDayHelp
      who={who}
      day={validDate ? visit : null}
      past={visitPast}
      now={now}
      cutoff={rule}
      urgentFor={urgentFor}
      ask={askNow.urgentAsk}
      answer={askNow.urgentAnswer}
      tick={urgentWith}
      onTick={setUrgentWith}
      onAsk={(day) => void askUrgent(day)}
      onCancelAsk={() => void askUrgent(null)}
      busy={saving}
    />
  );
  /**
   * คอนเฟิร์มลูกค้า (แอดมิน · เจ้าของงานข้อ 4)
   * "ลูกค้าคอนเฟิร์มวันเดิม" ไม่มีบรรทัด ไม่มีช่องติ๊ก ทุกเวลา — วันนั้นหัวหน้าภาคนัดไว้แล้วตามกฎ การคอนเฟิร์มไม่ใช่การนัด
   * "ลูกค้าขอเลื่อน" ไปวันที่ปิดนัดแล้ว (วันนี้ · พรุ่งนี้หลังเวลาปิด) = นัดใหม่ → บรรทัดแดง + ช่องติ๊ก "แก้เป็นงานด่วนไปพร้อมกัน"
   * บันทึกไม่ได้จนกว่าจะติ๊ก (เซิร์ฟเวอร์ตอบ 400 ถ้าไม่ติ๊ก) · วันที่ยังเปิด = บรรทัดเทา "วันใหม่ … — บันทึกได้เลย"
   * เปลี่ยนแค่เวลาในวันเดิมไม่มีกฎ (เซิร์ฟเวอร์ก็ไม่ดู) — ส่งวันเข้าบรรทัดเฉพาะตอนวันเปลี่ยน
   */
  const confirmStage = order.status === "AWAITING_CONFIRM" || order.status === "INSPECT_CONFIRM";
  const confirmMoveDay =
    confirmStage && confirmChoice === "MOVE" && validDate && !visitPast && visit !== (order.scheduledAt ?? "").slice(0, 10) ? visit : null;
  const confirmLine = adminDayLine(confirmMoveDay, now, rule, urgentFor, true);
  const confirmNeedTick = !!confirmLine?.needTick;
  const confirmWarnBlock = confirmMoveDay ? (
    <AdminDayLine day={confirmMoveDay} now={now} cutoff={rule} urgentFor={urgentFor} changed tick={urgentWith} onTick={setUrgentWith} busy={saving} />
  ) : null;

  /**
   * ล็อกยี่ห้อในฟอร์มระบุอะไหล่ (ข้อ 23) — แถวนอกไฟล์ของเครื่องต้องเอาออกก่อนส่ง ยกเว้นแถวที่เบิกไปแล้วและยังจำนวนเดิม (ของอยู่กับช่าง · D6)
   * กันปุ่มด้วยกติกาเดียวกับป้ายแดงในช่อง และเซิร์ฟเวอร์ (/parts) ตรวจซ้ำ
   */
  const partsLegacy = useMemo(() => issuedSameQtyIds(order, parts), [order, parts]);
  const partsBrandBlock =
    order.status === "NEW" && !inspectFirst && needsParts === true
      ? brandBlockText(brandBlockers(parts, order.partsBrand, pickedBrand, { legacyIds: partsLegacy }), order.partsBrand)
      : null;

  // ไฟล์ตรวจครบไหม — อ่านจากรายการไฟล์ชุดเดียวกับการ์ด แนบจากการ์ดไว้ก่อนก็นับ
  const inspectMissing = order.status === "INSPECTING" ? missingInspection(files, order.inspectionStartedAt) : [];

  /**
   * ข้อ 5 "อะไหล่ที่ต้องใช้" ของฟอร์มตรวจหน้างาน (เจ้าของงานขอ ต.ค. 69)
   * ช่าง (รวม Senior) เลือก = ส่งให้หัวหน้าภาคคอนเฟิร์ม · หัวหน้าภาค/แอดมินบันทึกแทน = รายการไปเติมฟอร์มระบุอะไหล่ ไม่คอนเฟิร์มตัวเอง (ข้อ 11)
   */
  const inspecting = order.status === "INSPECTING";
  const techSend = user?.role === "EMPLOYEE";
  const backPick = inspecting ? pickReturned(order) : null;
  const inspectMachine = inspecting && inspectHasMachine(order);
  // ใบไม่มีเครื่อง: นับเฉพาะอะไหล่นอกเครื่อง — ตัวเดียวกับที่ข้อ 5 เติมให้ (inspectPrefill) อะไหล่ของเครื่องที่ช่างไม่เห็นต้องไม่หลุดจากใบ
  const removedIds = inspecting
    ? [
        ...new Set(
          order.waitingParts
            .filter((p) => !p.offCatalog && (inspectMachine || isOutsidePart(p)) && !parts.some((x) => x.sparePartId === p.sparePartId))
            .map((p) => p.sparePartId)
        ),
      ].slice(0, 20)
    : [];
  // ล็อกยี่ห้อแบบช่องของช่าง (strict: ของนอกสโตร์ก็ไม่ได้) — แถวแดง "เอาออกก่อนส่ง" กันปุ่ม กติกาเดียวกับเซิร์ฟเวอร์ (ไม่มีแถวที่ปล่อยผ่าน)
  const inspectBrandBlock = inspecting
    ? brandBlockText(brandBlockers(parts, order.partsBrand, pickedBrand, { strict: true }), order.partsBrand)
    : null;
  const inspectQtyBad = inspecting && parts.some((p) => !(p.quantity >= 1 && p.quantity <= 99));
  // รูปอะไหล่ที่เสียที่เพิ่มหลังถูกตีกลับ — นับเป็น "แก้แล้ว" ได้ (ยืนยันรายการเดิมด้วยรูปที่ชัดขึ้น)
  const addedPartPhotos = backPick?.reviewedAt
    ? files.filter((f) => f.role === "INSPECT_PART" && Date.parse(f.createdAt) > Date.parse(backPick.reviewedAt!)).length
    : 0;
  // ด่านส่งใหม่ใช้กับช่างเท่านั้น — หัวหน้าภาค/แอดมินบันทึกแทนไม่ได้ส่งให้ตัวเองคอนเฟิร์ม (เซิร์ฟเวอร์ข้ามด่านนี้เหมือนกัน)
  const gateText = inspecting && techSend && backPick ? resendGateText(backPick, parts, finding, addedPartPhotos) : null;
  /**
   * ป้ายบนแถวของรอบที่ถูกตีกลับ (ตัวอย่าง tf.picked) — ตัวที่ถูกชี้และยังจำนวนเดิมแดง · เปลี่ยนจำนวนแล้วเขียว · ตัวที่ไม่มีในรอบก่อน "เพิ่มใหม่"
   * ช่างเห็นทันทีว่าแก้ครบหรือยัง ไม่ต้องกดส่งแล้วรอเซิร์ฟเวอร์บอก
   */
  const inspectTags: Record<number, PartTag> | undefined = backPick
    ? Object.fromEntries(
        parts.flatMap((p): [number, PartTag][] => {
          const was = backPick.items.find((i) => i.sparePartId === p.sparePartId);
          if (!was) return [[p.sparePartId, { text: "เพิ่มใหม่", tone: "info" }]];
          if (was.mark !== "NO") return [];
          return [
            [
              p.sparePartId,
              was.quantity === p.quantity ? { text: "ไม่ตรง — หัวหน้าภาคชี้", tone: "danger" } : { text: "แก้จำนวนแล้ว", tone: "success" },
            ],
          ];
        })
      )
    : undefined;
  // ตัวที่ถูกชี้แล้วช่างเอาออก — บอกว่าแก้แล้ว (แถวหายไปจากรายการ ไม่มีที่ติดป้าย)
  const removedFlags = backPick ? backPick.items.filter((i) => i.mark === "NO" && !parts.some((p) => p.sparePartId === i.sparePartId)) : [];
  // ส่งแล้วไปไหน (ตัวอย่าง tf.nextText) — ช่างเลือกอะไหล่ = ไปให้หัวหน้าภาคคอนเฟิร์ม · บันทึกแทน = ไปฟอร์มระบุอะไหล่ · ว่าง = ทางเดิม
  const inspectNext = !parts.length
    ? "ส่งแล้วใบงานกลับไปให้หัวหน้าภาคดูไฟล์ และระบุอะไหล่จากผลนี้"
    : !techSend
      ? "ส่งแล้วใบงานไปที่ฟอร์มระบุอะไหล่ เติมรายการที่เลือกไว้ให้ — ไม่ต้องคอนเฟิร์มเอง"
      : backPick
        ? "ส่งแล้วกลับไปให้หัวหน้าภาคคอนเฟิร์มอีกครั้ง หัวหน้าภาคเห็นว่าแก้อะไรจากรอบก่อน"
        : "ส่งแล้วใบออกจาก งานของฉัน ไปให้หัวหน้าภาคคอนเฟิร์มอะไหล่ที่เลือก ถ้าไม่ตรงจะตีกลับมาให้แก้ · คอนเฟิร์มแล้วไปแอดมินเช็คอะไหล่";

  // ใบนี้เก็บเงินลูกค้าไปแล้ว (ผ่านเสนอราคา) — แยกตัวที่หมดต้องบอกว่าตัวนั้นจ่ายแล้วหรือยัง
  const paidOrder = order.logs.some((l) => l.action === "PAID");
  const blocked =
    (mixed && splitOut && paidOrder && splitPaid === null) ||
    (!partsShort && askTransfer.some((pid) => transferChoice[pid] === undefined)) ||
    quoteBlocked ||
    sourcingBlocked ||
    paymentBlocked ||
    (order.status === "NEW" &&
      (inspectFirst
        ? !team || !validDate || !timeOk
        : needsParts === null ||
          (noPartsAssign && (!team || !validDate || !timeOk)) ||
          (needsParts && parts.length === 0 && offPartsPayload(offParts).length === 0) ||
          !!partsBrandBlock ||
          offPartsIncomplete(services))) ||
    (order.status === "INSPECTING" && (!finding.trim() || inspectMissing.length > 0 || !!inspectBrandBlock || inspectQtyBad)) ||
    ((order.status === "ASSIGNED" || order.status === "INSPECT_DISPATCH") && !team) ||
    (order.status === "PARTS_CHECKED" && (!team || !validDate || !timeOk)) ||
    visitPast ||
    // วันที่ปิดนัดแล้ว: หัวหน้าภาคบันทึกไม่ได้ (เลือกวันใหม่/ขอแอดมิน) · แอดมินบันทึกได้เมื่อติ๊กแก้เป็นงานด่วนแล้ว
    (schedClosed && (who === "supervisor" || !urgentWith)) ||
    (canDecline && declineDate && !note.trim()) ||
    // ลูกค้าขอเลื่อนไปวันที่ปิดนัดแล้ว — ต้องติ๊กแก้เป็นงานด่วนก่อน (เจ้าของงานข้อ 4)
    (confirmNeedTick && !urgentWith) ||
    ((order.status === "AWAITING_CONFIRM" || order.status === "INSPECT_CONFIRM") &&
      (confirmChoice === null ||
        (confirmChoice === "MOVE" &&
          (!validDate || !timeOk || (visit === (order.scheduledAt ?? "").slice(0, 10) && visitTime === (order.scheduledTime ?? "")))))) ||
    (unchecked && !partsShort) ||
    (needsRequisition && !partsShort) ||
    pickupBlocked ||
    transferBlocked ||
    (checkOut && expectedAt !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(expectedAt));
  /**
   * กล่องอะไหล่นอกยังไม่ครบ (ชื่อ · หาได้ไหม · แหล่ง/เหตุผล — เจ้าของงานขอ 4 พ.ย. 69) — ปุ่มบอก "ยังขาด n อย่าง — พาไป"
   * แบบเดียวกับฟอร์มปิดงาน แทนปุ่มจางที่กดแล้วเงียบ (ตัวอย่างที่อนุมัติ) · กดแล้วเลื่อนไปที่กล่องและขึ้นกรอบแดงช่องที่ขาด
   * นับเฉพาะเมื่อไม่มีอย่างอื่นกันปุ่มอยู่ — ตัวเลขบนปุ่มต้องเป็นทั้งหมดที่ขาดจริง ไม่ใช่แค่ของกล่องนี้
   */
  const offMissing =
    order.status === "NEW" && !inspectFirst && !pending && needsParts === true ? offPartsMissing(offParts, "plan") : [];
  const offGo = offMissing.length > 0 && !blocked;
  function goOff() {
    setOffFlash(true);
    offBox.go();
  }

  /** ช่องวัน/เวลาของ "ต้องเข้าตรวจสอบหน้างานก่อน" — ใช้ทั้งฟอร์มระบุอะไหล่และตอนกดลิงก์จากจอคอนเฟิร์ม (ชุดเดียว รวมกฎปิดนัด/วันย้อนหลัง) */
  const inspectFields = (
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
        min={minVisit}
        {...schedField}
      />
      {pastWarn}
      {scheduleHelp}
      <TimeField value={visitTime} onChange={setVisitTime} label="เวลา (ไม่ใส่ก็ได้)" />
    </>
  );
  // ทุกตัว "ตรง" แล้ว — ปุ่มคอนเฟิร์มเป็นสีหลัก ก่อนหน้านั้นสีจาง แต่ยังกดได้ (กดแล้วบอกว่าขาดอะไร)
  const allOk = !!pending && pending.items.length > 0 && pending.items.every((i) => marks[i.sparePartId] === "OK");
  // อะไหล่นอก/ค่าบริการที่กรอกค้างครึ่งแถว — กล่องนั้นขึ้นบรรทัดแดงบอกเอง ปุ่มคอนเฟิร์มรอจนแก้ (เหมือนฟอร์มระบุอะไหล่เดิม)
  // ของนอกสโตร์ที่ยังขาด (ชื่อ · คำตอบจัดหา) บอกตอนกดคอนเฟิร์มแทน (confirmPick) — ปุ่มนี้กดได้เสมอตามตัวอย่างเดิม
  const extrasBad = offPartsIncomplete(services);

  return (
    <AppModal
      visible={visible}
      onClose={onCancel}
      busy={saving}
      // ปุ่ม "ยังขาด … — พาไป" / คอนเฟิร์มที่ยังขาดของนอกสโตร์ เลื่อนไปที่กล่องอะไหล่นอก (useScrollTarget)
      scrollRef={stageScroll}
      // จอคอนเฟิร์มมีรูปขยายกับแถวตรง/ไม่ตรง — กว้างขึ้นบนจอคอม (มือถือเต็มจออยู่แล้ว)
      width={confirming ? 720 : undefined}
      /*
        ปุ่ม ? ของฟอร์มระบุอะไหล่ — หัวหน้าภาคเท่านั้น (ฟอร์มอื่นรอบนี้ไม่มี) · ใบที่ช่างเลือกอะไหล่มาแล้ว (จอคอนเฟิร์มอะไหล่
        และฟอร์มส่งตรวจที่กดจากจอนั้น) ไม่มีสามทางเลือกที่วิธีใช้อธิบาย → เปิดหน้าสอนการใช้งานแทน (เจ้าของงานตอบ 6.3)
      */
      headRight={
        user?.role === "SUPERVISOR" && order.status === "NEW" ? (
          pickPending(order) ? (
            <HowToButton compact hub target="parts.help" />
          ) : (
            <HowToButton compact tour="sup.parts" target="parts.help" />
          )
        ) : null
      }
      title={<>
              {newDate
                ? "คอนเฟิร์มวันใหม่"
                : // ฟอร์มนี้คือ "คอนเฟิร์มออกหน้างาน" (คำของเจ้าของงาน) — ปุ่มบนแถบ/การ์ดยังชื่อ "คอนเฟิร์มลูกค้า"
                  order.status === "AWAITING_CONFIRM" && !confirmToIssue
                  ? "คอนเฟิร์มออกหน้างาน"
                  : // ฟอร์มแนบบิลเป็นงานของแอดมินจริง — ชื่อเดิม "แนบบิลรับเงิน" ปุ่มที่กดเข้ามาชื่อ "ลูกค้าจ่ายแล้ว · แนบบิล" (5 พ.ย. 69)
                  order.status === "AWAITING_PAYMENT"
                  ? "แนบบิลรับเงิน"
                  : // ชื่อเดียวกับปุ่มที่กดเข้ามา (รวม "คอนเฟิร์มอะไหล่" · "แก้รายการอะไหล่" ของรอบเลือกอะไหล่)
                    stageButtonLabel(order, { partsOut: 0, tech: techSend })}{" "}
              · {order.code}
            </>}
      /*
        กดส่งแล้วยังไม่ได้แก้อะไรจากรอบที่ถูกตีกลับ — ปักใต้หัวฟอร์ม ไม่ได้อยู่ท้ายเนื้อหา (แบบเดียวกับ "ยังส่งไม่ได้" ของฟอร์มแก้เคลม)
        ช่างที่เพิ่งเปิดจากการ์ดแดงกดส่งตอนยังอยู่บนสุด — ถ้ากล่องอยู่ใต้ข้อ 5 บนมือถือมันอยู่หลายจอลงไป ปุ่มดูเหมือนกดไม่ติด
        ข้อความเดียวกับเซิร์ฟเวอร์ ปุ่มยังกดได้ (แก้แล้วกดใหม่ได้ทันที) · แก้ครบแล้ว gateText เป็น null แถบหายเอง
      */
      banner={
        gateTried && gateText ? (
          <View style={styles.gateBox} role="alert">
            <Ionicons name="warning-outline" size={18} color={colors.warningInk} />
            <Text style={styles.gateText}>{gateText}</Text>
          </View>
        ) : confirming && pickMsg ? (
          // จอคอนเฟิร์ม: กดปุ่มท้ายฟอร์มตอนยังไม่พร้อม/เซิร์ฟเวอร์ปฏิเสธ — ปักใต้หัวฟอร์มเหมือนด่านส่งใหม่ของช่าง เห็นทุกตำแหน่งที่เลื่อนอยู่
          <View style={[styles.gateBox, pickMsg.kind === "err" && styles.cfMsgErr]} role="alert">
            <Ionicons
              name={pickMsg.kind === "err" ? "alert-circle-outline" : "warning-outline"}
              size={18}
              color={pickMsg.kind === "err" ? colors.dangerInk : colors.warningInk}
            />
            <Text style={[styles.gateText, pickMsg.kind === "err" && { color: colors.dangerInk }]}>{pickMsg.text}</Text>
          </View>
        ) : undefined
      }
      footer={
        confirming ? (
          <View style={stackFoot ? styles.cfFootCol : styles.modalActions}>
            <View style={[styles.cfFootPair, !stackFoot && { flex: 2 }]}>
              <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cfBackBtn, saving && styles.modalSaveOff]}
                onPress={returnPick}
                disabled={saving}
                activeOpacity={0.8}
                accessibilityLabel="ตีกลับให้ช่างแก้"
              >
                {saving && busy === "pickReturned" ? (
                  <Spinner color={colors.dangerInk} size="small" />
                ) : (
                  <Text style={styles.cfBackText}>ตีกลับให้ช่างแก้</Text>
                )}
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[
                styles.modalSave,
                stackFoot && { flex: 0 },
                !allOk && styles.cfSaveMuted,
                (saving || extrasBad) && styles.modalSaveOff,
              ]}
              onPress={confirmPick}
              disabled={saving || extrasBad}
              activeOpacity={0.8}
              accessibilityLabel="คอนเฟิร์มอะไหล่"
            >
              {saving && busy === "pickConfirmed" ? (
                <Spinner color={allOk ? "#fff" : colors.body} size="small" />
              ) : (
                <Text style={[styles.modalSaveText, !allOk && { color: colors.body }]}>คอนเฟิร์มอะไหล่</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          {/* ปุ่มท้ายฟอร์มของทุกขั้น — วิธีใช้ "ระบุอะไหล่" ขั้น 5 ชี้ปุ่มนี้ (จอคอนเฟิร์มอะไหล่ใช้ปุ่มอีกชุด ไม่มีชื่อนี้) */}
          <TouchableOpacity
            // ยังขาดในกล่องอะไหล่นอก = ปุ่มส้มแบบฟอร์มปิดงาน (closeGo) กดได้ กดแล้วพาไปช่องที่ขาด ไม่ส่งอะไร
            style={[styles.modalSave, (saving || blocked) && styles.modalSaveOff, offGo && !saving && styles.closeGo]}
            onPress={offGo ? goOff : submit}
            disabled={saving || blocked}
            activeOpacity={0.8}
            {...howtoTarget("parts.submit")}
          >
            {saving ? (
              <Spinner color="#fff" size="small" />
            ) : (
              <Text style={offGo ? styles.closeGoText : styles.modalSaveText}>
                {offGo
                  ? `ยังขาด ${offMissing.length} อย่าง — พาไป`
                  : order.status === "PARTS_SOURCING"
                  ? sourcingOut.length && !sourcingSplit
                    ? "อะไหล่หมด — รอของเข้า"
                    : sourcingSplit
                      ? `แยกตัวที่หมด · ${quoteNext ? "ไปเสนอราคา" : "ส่งนัดวัน"}`
                      : quoteNext
                        ? "มีครบ — ไปเสนอราคา"
                        : "มีครบ — ส่งหัวหน้าภาคนัดวัน"
                  : partsShort
                    ? shopKnows
                      ? "ของไม่พอ — แจ้งเลื่อนนัด"
                      : order.scheduledAt
                        ? "ของไม่พอ — ยกเลิกนัด รอของเข้า"
                        : "ของไม่พอ — รอของเข้า"
                  : canDecline && declineDate
                    ? inspectRelease
                      ? "ส่งกลับให้แอดมินนัดตรวจใหม่"
                      : "ส่งกลับให้แอดมินนัดใหม่"
                  : order.status === "ASSIGNED"
                    ? newDate
                      ? "คอนเฟิร์มวันใหม่ ปล่อยงาน"
                      : "รับทราบ ปล่อยงานให้ช่าง"
                  : order.status === "PARTS_PICKUP"
                    ? pickupFail
                      ? "ส่งกลับแอดมิน"
                      : "คอนเฟิร์ม เบิกแล้ว"
                  : order.status === "PARTS_TRANSFER"
                    ? pickupFail
                      ? "ส่งกลับแอดมิน"
                      : "บันทึก · สั่งโอนแล้ว"
                  : order.status === "PARTS_IN_TRANSIT"
                    ? pickupFail
                      ? "ส่งกลับแอดมิน"
                      : "ของถึงแล้ว · โอนเสร็จแล้ว"
                    : toPickup.length && !checkOut
                      ? `ส่งหัวหน้าภาคเบิก ${toPickup.length} รายการ`
                      : order.status === "INSPECTING"
                        ? // ช่างเลือกอะไหล่ = ส่งให้หัวหน้าภาคคอนเฟิร์ม (ตัวอย่าง tf.sendLabel) · บันทึกแทน/ไม่เลือก = ปุ่มเดิม
                          techSend && parts.length
                          ? backPick
                            ? "ส่งให้หัวหน้าภาคคอนเฟิร์มอีกครั้ง"
                            : "ส่งให้หัวหน้าภาคคอนเฟิร์ม"
                          : "บันทึกและส่งผลตรวจ"
                        : "ยืนยัน"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
        )
      }
    >
            {prevUsed.length ? (
              <View style={styles.prevBox} accessibilityLabel="ค่าเดิมก่อนย้อน">
                <Text style={styles.prevBoxTitle}>↩ ใบนี้ย้อนขั้นมา — เติมค่าเดิมไว้ให้: {prevUsed.join(" · ")}</Text>
                <Text style={styles.prevBoxText}>ตรวจแล้วกดยืนยัน แก้ได้ทุกช่อง · ช่องที่เป็นค่าเดิมติดป้าย “ค่าเดิมก่อนย้อน”</Text>
              </View>
            ) : null}

            {confirming ? (
              <PickConfirmForm
                order={order}
                pick={pending!}
                files={files}
                marks={marks}
                onMark={(id, m) => {
                  setMarks((cur) => ({ ...cur, [id]: m }));
                  setPickMsg(null);
                }}
                onAllOk={() => {
                  setMarks(Object.fromEntries(pending!.items.map((i) => [i.sparePartId, "OK" as const])));
                  setPickMsg(null);
                }}
                showReject={showReject}
                reason={reason}
                onReason={(t) => {
                  setReason(t);
                  setPickMsg(null);
                }}
                zoom={zoom}
                onZoom={setZoom}
                offParts={offParts}
                onOffParts={setOffParts}
                offBind={offBox.bind}
                offFlash={offFlash}
                services={services}
                onServices={setServices}
                onInspectFirst={() => {
                  setInspectFirst(true);
                  setPickMsg(null);
                  setZoom(null);
                }}
              />
            ) : pending ? (
              // กดลิงก์ "ต้องเข้าตรวจสอบหน้างานก่อน" จากจอคอนเฟิร์ม — ฟอร์มเดียวกัน (ทีม/วันอยู่ส่วนจ่ายงานด้านล่าง) กลับไปได้ ค่าที่กดไว้ยังอยู่
              <>
                <TouchableOpacity style={styles.cfLink} onPress={() => setInspectFirst(false)} activeOpacity={0.7} accessibilityLabel="กลับไปคอนเฟิร์มอะไหล่">
                  <Ionicons name="arrow-back" size={16} color={colors.primaryInk} />
                  <Text style={styles.cfLinkText}>กลับไปคอนเฟิร์มอะไหล่</Text>
                </TouchableOpacity>
                {/* ส่งตรวจใหม่ทิ้งรอบนี้ (เซิร์ฟเวอร์ voidOpenPick) — บอกก่อนกด ไม่งั้นนึกว่ารายการของช่างตามไปรอบหน้า */}
                <Text style={styles.cfMutedDark}>
                  ส่งตรวจใหม่แล้วรายการที่ช่างเลือกรอบนี้ไม่ถูกใช้ — ช่างเลือกอะไหล่ใหม่ตอนส่งผลตรวจรอบหน้า
                </Text>
                {inspectFields}
              </>
            ) : order.status === "NEW" ? (
              <>
                <Text style={styles.modalLabel}>
                  งานนี้ต้องใช้อะไหล่ไหม{prevUsed.includes("ใช้อะไหล่ไหม") ? <Text style={styles.prevTag}> ค่าเดิมก่อนย้อน </Text> : null}
                </Text>
                {/* ชื่อคงที่ของวิธีใช้ "ระบุอะไหล่" — แถวสามทางเลือกและแต่ละปุ่ม (ขั้น 1–4) */}
                <View style={styles.options} {...howtoTarget("parts.question")}>
                  <TouchableOpacity
                    style={[styles.option, !inspectFirst && needsParts === true && styles.optionOn]}
                    onPress={() => {
                      setInspectFirst(false);
                      setNeedsParts(true);
                    }}
                    activeOpacity={0.7}
                    {...howtoTarget("parts.optParts")}
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
                    {...howtoTarget("parts.optNone")}
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
                    {...howtoTarget("parts.optInspect")}
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
                  inspectFields
                ) : needsParts === true ? (
                  <>
                    <PartPicker
                      parts={parts}
                      onChange={setParts}
                      label="อะไหล่ที่ต้องใช้"
                      brand={order.partsBrand}
                      chosenBrand={pickedBrand}
                      onBrandChosen={setPickedBrand}
                      legacyIds={partsLegacy}
                      noResultHints={[
                        "ตัวที่ต้องใช้ไม่มีในไฟล์นี้: ใส่ในกล่องอะไหล่นอกสโตร์ด้านล่าง หรือให้แอดมินเพิ่มรหัสเข้าไฟล์",
                        "ยี่ห้อในระบบไม่ตรงกับเครื่องจริง? กด “แก้ยี่ห้อเครื่อง” ที่การ์ดสาขาบนหน้าใบงาน",
                      ]}
                    />
                    {partsBrandBlock ? <Text style={styles.warn}>{partsBrandBlock}</Text> : null}
                    <View {...offBox.bind}>
                      <OffPartEditor rows={offParts} onChange={setOffParts} ask="plan" highlight={offFlash} />
                    </View>
                  </>
                ) : noPartsAssign ? (
                  <>
                    {/* จ่ายงานในฟอร์มนี้เลย (เจ้าของงานเลือก ต.ค. 69) — เดิมกดไม่ใช้อะไหล่แล้วต้องเปิดฟอร์มจ่ายงานอีกรอบ */}
                    <Text style={styles.linkedText}>
                      ไม่ใช้อะไหล่ — จ่ายงานในฟอร์มนี้เลย แล้วแอดมินโทรคอนเฟิร์มร้าน · ไปถึงแล้วต้องเปลี่ยนอะไหล่
                      ช่างแจ้งกลับมาให้ระบุอะไหล่ได้
                    </Text>
                    <DateField value={visit} onChange={setVisit} label="วันเข้างาน" emptyHint="ต้องระบุวันก่อนจึงจะจ่ายงานได้" min={minVisit} {...schedField} />
                    {pastWarn}
                    {scheduleHelp}
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
                {/* เช็คกับเบิกแยกกัน (เจ้าของงานกำหนด ต.ค. 69) — ขั้นนี้ดูคลังอย่างเดียว ไม่ตัดของ · เบิกหลังนัดวัน ก่อนโทรร้าน */}
                <Text style={styles.linkedText}>
                  เช็คอะไหล่ตามที่หัวหน้าภาคระบุว่ามีหรือหมด อยู่คลังไหน — ยังไม่ต้องเบิกหรือใส่เลขใบเบิก
                  เบิกจริงหลังหัวหน้าภาคนัดวันเข้า (ก่อนโทรคอนเฟิร์มลูกค้า)
                </Text>
                {thisRound.map((part) => {
                  const c = checks[part.sparePartId] ?? { inStock: null, warehouse: null };
                  const set = (inStock: boolean) =>
                    setChecks((v) => ({ ...v, [part.sparePartId]: { inStock, warehouse: inStock ? c.warehouse : null } }));
                  return (
                    <View key={part.sparePartId} style={styles.checkItem}>
                      <Text style={styles.checkCode}>
                        {partTitle(part)} × {part.quantity}
                        {part.unit ? ` ${part.unit}` : ""}
                      </Text>
                      {part.offCatalog ? <OffTag /> : null}
                      <Text style={styles.checkName}>{part.offCatalog ? part.note || "จัดหาเอง — ไม่ต้องใส่คลัง/เลขใบเบิก" : part.name}</Text>
                      {part.offCatalog ? <OffTold part={part} /> : null}
                      <View style={styles.options}>
                        {/* aria-pressed ใส่เอง (เว็บไม่แปลงสถานะปุ่ม) — เทสต์อ่านได้ว่าปุ่มติดตามคำตอบของหัวหน้าภาคจริง */}
                        <TouchableOpacity
                          style={[styles.option, c.inStock === true && styles.optionOn]}
                          onPress={() => set(true)}
                          activeOpacity={0.7}
                          aria-pressed={c.inStock === true}
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
                          aria-pressed={c.inStock === false}
                          accessibilityLabel={`หมด ${part.partCode}`}
                        >
                          <Text style={[styles.optionText, c.inStock === false && styles.optionTextOut]}>
                            {part.offCatalog ? "ยังหาไม่ได้" : "หมด"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {/* คลังที่มีของ — ของอยู่คลังอื่นหัวหน้าภาคเบิก/โอนเองหลังนัดวัน ให้ถึงก่อนคอนเฟิร์มลูกค้า */}
                      {c.inStock === true && !part.offCatalog ? (
                        <Dropdown
                          value={c.warehouse}
                          placeholder="อยู่คลังไหน"
                          accessibilityLabel={`คลังที่มี ${part.partCode}`}
                          options={[...warehouses]
                            .sort((a, b) => Number(b === adminWarehouse) - Number(a === adminWarehouse))
                            .map((w) => ({
                              value: w,
                              label: w,
                              hint: w === adminWarehouse ? "ไม่ต้องโอน" : "หัวหน้าภาคเบิก/โอนหลังนัดวัน",
                              group: w === adminWarehouse ? "คลังส่งมอบ" : "คลังอื่น (ต้องเบิก/โอน)",
                            }))}
                          onChange={(next) => setChecks((v) => ({ ...v, [part.sparePartId]: { inStock: true, warehouse: next } }))}
                        />
                      ) : null}
                    </View>
                  );
                })}
                {thisRound.some((p) => p.offCatalog && typeof p.offFound === "boolean") ? (
                  <Text style={styles.linkedText}>ของนอกสโตร์: ปุ่มติดให้ตามที่หัวหน้าภาคแจ้ง — เช็คแล้วไม่ตรง กดเปลี่ยนได้</Text>
                ) : null}
                {sourcingMixed ? (
                  <TouchableOpacity
                    style={styles.skipRow}
                    onPress={() => setSplitOut((v) => !v)}
                    activeOpacity={0.7}
                    accessibilityLabel="แยกตัวที่หมดไปใบงานรออะไหล่"
                  >
                    <Ionicons name={splitOut ? "checkbox" : "square-outline"} size={18} color={splitOut ? colors.primary : colors.textFaint} />
                    <Text style={styles.skipText}>แยกตัวที่หมดไปใบงานรออะไหล่ — ใบนี้ไปนัดด้วยของที่มีได้เลย</Text>
                  </TouchableOpacity>
                ) : null}
                {sourcingOut.length ? (
                  <DateField
                    value={expectedAt}
                    onChange={setExpectedAt}
                    label={prevUsed.includes("วันของเข้า") ? "คาดว่าของเข้า · ค่าเดิมก่อนย้อน" : "คาดว่าของเข้า"}
                    emptyHint="ไม่บังคับ — ใส่แล้วรายการเตือนเมื่อเลยกำหนด"
                  />
                ) : null}
                <Text style={styles.linkedText}>
                  {sourcingOut.length && !sourcingSplit
                    ? `หมด ${sourcingOut.length} รายการ — ใบงานรอที่ขั้นนี้จนของเข้าครบ แล้วกดเช็คอีกรอบตอบว่ามีครบ (ของต้องครบก่อนส่งไปนัด)`
                    : sourcingSplit
                      ? `ตัวที่หมดย้ายไปใบงานใหม่ (รอของเข้าที่ขั้นนี้) — ใบนี้${quoteNext ? "ไปเสนอราคา" : "ส่งให้หัวหน้าภาคนัดวันเข้า"}ด้วยของที่มี`
                      : thisRound.every((p) => checks[p.sparePartId]?.inStock === true)
                        ? quoteNext
                          ? "มีครบทุกตัว — ส่งต่อไปเสนอราคา แล้วค่อยนัดลูกค้า"
                          : "มีครบทุกตัว — ส่งให้หัวหน้าภาคนัดวันเข้า"
                        : "ตอบให้ครบทุกตัวก่อน"}
                </Text>
                {sourcingFar.length && (!sourcingOut.length || sourcingSplit) ? (
                  <Text style={styles.pickupTag} accessibilityLabel="ของอยู่คลังอื่น ต้องโอน">
                    {sourcingFar.length} รายการอยู่คลังอื่น ({[...new Set(sourcingFar.map((p) => checks[p.sparePartId]?.warehouse))].join(", ")}) —
                    หัวหน้าภาคเบิก/โอนหลังนัดวัน — ของต้องถึงก่อนแอดมินคอนเฟิร์มลูกค้า
                  </Text>
                ) : null}
              </View>
            ) : null}
            {order.status === "PARTS_REQUESTED" && sourcingCheck(order) ? (
              <Text style={sourcingCheck(order)!.stale ? styles.warn : styles.linkedText} accessibilityLabel="ผลเช็คก่อนเสนอราคา">
                {sourcingCheck(order)!.stale
                  ? `เช็คอะไหล่ไว้เมื่อ ${sourcingCheck(order)!.days} วันก่อน — นานเกิน ${SOURCING_FRESH_DAYS} วัน ดูในคลังอีกรอบทุกตัวก่อนใส่เลขใบเบิก (ของอาจถูกงานอื่นใช้ไประหว่างรอนัด)`
                  : `เช็คอะไหล่ไว้เมื่อ ${sourcingCheck(order)!.days === 0 ? "วันนี้" : `${sourcingCheck(order)!.days} วันก่อน`} — มีครบ ไม่ต้องเช็คซ้ำ เลือกคลังและใส่เลขใบเบิก`}
              </Text>
            ) : null}
            {order.status === "PARTS_REQUESTED" && order.scheduledAt ? (
              /**
               * นัดที่ของต้องไปให้ทัน — หัวหน้าภาคนัดวันแล้ว เบิกให้พร้อมแล้วแอดมินค่อยโทรคอนเฟิร์มร้าน (ต.ค. 69 รอบสอง)
               * ใบที่คอนเฟิร์มไปก่อนสลับลำดับ ร้านรู้วันแล้ว ข้อความเดิม
               */
              <View style={styles.issuedBox} accessibilityLabel="นัดที่ต้องเบิกให้ทัน">
                <Text style={styles.issuedTitle}>
                  {APPOINTMENT_DONE.includes(order.appointmentStatus ?? "")
                    ? "ลูกค้าคอนเฟิร์มแล้ว — เบิกของให้ทันวันเข้างาน"
                    : "หัวหน้าภาคนัดไว้ — เบิกของให้พร้อมก่อนโทรคอนเฟิร์มลูกค้า"}
                </Text>
                <Text style={styles.issuedLine}>
                  {visitLabel(order)}
                  {order.assignedTeam ? ` · ทีม${order.assignedTeam}` : ""}
                </Text>
                {onReschedule ? (
                  <TouchableOpacity onPress={onReschedule} accessibilityLabel="เลื่อนวันนัด จากฟอร์มเบิก">
                    <Text style={styles.docLink}>เลื่อนวันนัด</Text>
                  </TouchableOpacity>
                ) : null}
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
                        {p.partCode} × {p.quantity} · {p.warehouse ?? "-"} · {requisitionLine(p)}
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
                      {/* ขั้นเบิกไม่ติดปุ่มให้ (ถามว่าได้ของมาแล้วหรือยัง) แต่บอกแหล่งไว้ — แอดมินรู้ว่าต้องตามของที่ไหน */}
                      {part.offCatalog ? <OffTold part={part} /> : null}
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
                          // คลัง 94 ขึ้นบนสุดแยกหัวข้อ — เลือกแล้วรู้ทันทีว่าใครเบิก (เจ้าของงานขอ ต.ค. 69)
                          options={[...warehouses]
                            .sort((a, b) => Number(b === adminWarehouse) - Number(a === adminWarehouse))
                            .map((w) => ({
                              value: w,
                              label: w,
                              hint: w === adminWarehouse ? "แอดมินเบิก" : "หัวหน้าภาคเบิก",
                              group: w === adminWarehouse ? "แอดมินเบิกเอง" : "หัวหน้าภาคเบิก",
                            }))}
                          onChange={(next) =>
                            setChecks((v) => ({
                              ...v,
                              [part.sparePartId]: { inStock: true, warehouse: next },
                            }))
                          }
                        />
                      ) : null}
                      {/*
                        ส่งให้ลูกค้าแล้ว (เจ้าของงานขอ พ.ย. 69) — ทีละชิ้น ใบเดียวมีทั้งชิ้นที่ช่างต้องรับที่คลังและชิ้นที่ส่งไปร้านแล้วได้
                        ขั้นตอนไม่เปลี่ยน (ไปคอนเฟิร์มลูกค้า → ปล่อยงานเหมือนเดิม) เปลี่ยนแค่คำที่ช่างเห็นว่าต้องแวะคลังไหม
                        aria-pressed ใส่เอง — เว็บไม่แปลง accessibilityState (CLAUDE.md) เทสต์เบราว์เซอร์อ่านว่าปุ่มไหนติดจากตรงนี้
                      */}
                      {sendable(part) ? (
                        <View style={styles.options} accessibilityLabel={`ส่งให้ลูกค้าแล้วหรือรับที่คลัง ${part.partCode}`}>
                          {([
                            [false, "รับที่คลัง"],
                            [true, "อะไหล่ส่งให้ลูกค้าแล้ว"],
                          ] as const).map(([v, text]) => {
                            const on = (sentChoice[part.sparePartId] === true) === v;
                            return (
                              <TouchableOpacity
                                key={text}
                                style={[styles.option, on && styles.optionOn]}
                                onPress={() => setSentChoice((x) => ({ ...x, [part.sparePartId]: v }))}
                                activeOpacity={0.7}
                                accessibilityState={{ selected: on }}
                                aria-pressed={on}
                                accessibilityLabel={`${text} ${part.partCode}`}
                              >
                                <Text style={[styles.optionText, on && styles.optionTextOn]}>{text}</Text>
                              </TouchableOpacity>
                            );
                          })}
                          {prevUsed.includes("ส่งให้ลูกค้าแล้ว") && order.rollbackPrefill?.parts.some((x) => x.sparePartId === part.sparePartId && x.sentToCustomer) ? (
                            <Text style={styles.prevTag}> ค่าเดิมก่อนย้อน </Text>
                          ) : null}
                        </View>
                      ) : null}
                      {/* คำอธิบายบรรทัดเดียว ใต้ชิ้นแรกที่ถาม — ไม่ซ้ำทุกชิ้น */}
                      {part.sparePartId === firstSendable ? (
                        <Text style={styles.linkedText} accessibilityLabel="คำอธิบาย อะไหล่ส่งให้ลูกค้าแล้ว">
                          อะไหล่ส่งให้ลูกค้าแล้ว = ช่างไม่ต้องไปรับชิ้นนั้นที่คลัง
                        </Text>
                      ) : null}
                      {c.inStock === true && !part.offCatalog && c.warehouse && c.warehouse !== adminWarehouse ? (
                        <Text style={styles.pickupTag} accessibilityLabel={`หัวหน้าภาคเบิก ${part.partCode}`}>
                          {part.transferredAt && part.warehouse === c.warehouse
                            ? `โอนมาถึง${c.warehouse}แล้ว — หัวหน้าภาคเบิกส่งมอบ ไม่ใช้เลขใบเบิกข้างบน`
                            : transferChoice[part.sparePartId] === false
                              ? `หัวหน้าภาคเบิกจาก${c.warehouse}ส่งช่าง (ไม่ต้องโอน) — ไม่ใช้เลขใบเบิกข้างบน`
                              : `หัวหน้าภาคเบิกจาก${c.warehouse}แล้วโอนมาคลังส่งมอบ — ไม่ใช้เลขใบเบิกข้างบน`}
                        </Text>
                      ) : null}
                      {askTransfer.includes(part.sparePartId) ? (
                        <View style={styles.options} accessibilityLabel={`ต้องโอนไหม ${part.partCode}`}>
                          {([
                            [true, "ต้องโอน", "ต้องโอน — มาคลังส่งมอบ"],
                            [false, "ไม่ต้องโอน", "ไม่ต้องโอน — คลังอยู่ในพื้นที่"],
                          ] as const).map(([v, key, text]) => {
                            const on = transferChoice[part.sparePartId] === v;
                            return (
                              <TouchableOpacity
                                key={key}
                                style={[styles.option, on && styles.optionOn]}
                                onPress={() => setTransferChoice((x) => ({ ...x, [part.sparePartId]: v }))}
                                accessibilityLabel={`${key} ${part.partCode}`}
                              >
                                <Text style={[styles.optionText, on && styles.optionTextOn]}>{text}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : null}
                      {part.transferredAt && part.transferFrom ? (
                        <Text style={styles.linkedText} accessibilityLabel={`โอนมาแล้ว ${part.partCode}`}>
                          โอนจาก{part.transferFrom}มาถึง{part.warehouse}แล้ว · ใบโอน {part.transferNo}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
                {toPickup.length ? (
                  <View style={styles.pickupBox}>
                    {/* ไม่บังคับ — ชื่อคลังที่เลือกบอกที่เบิกอยู่แล้ว (เจ้าของงานตกลง ต.ค. 69) */}
                    <Text style={styles.modalLabel}>หมายเหตุถึงหัวหน้าภาค (ไม่บังคับ)</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={pickupNote}
                      onChangeText={setPickupNote}
                      placeholder="เช่น ติดต่อพี่เอ ที่คลังภูเก็ต"
                      placeholderTextColor={colors.textFaint}
                      multiline
                      numberOfLines={2}
                      accessibilityLabel="หมายเหตุถึงหัวหน้าภาค"
                    />
                    <Text style={styles.linkedText}>
                      {askTransfer.some((pid) => transferChoice[pid] !== false)
                        ? `${toPickup.length} รายการอยู่คลังอื่น — ชิ้นที่ต้องโอน หัวหน้าภาคเบิกแล้วโอนมาคลังส่งมอบ ชิ้นที่ไม่ต้องโอนเบิกพร้อมกันตอนส่งมอบ (โอนมาคลัง 94 กลับมาให้แอดมินเบิกส่งมอบก่อน)`
                        : `${toPickup.length} รายการอยู่คลังอื่น — ไม่ต้องโอน หัวหน้าภาคเบิกจากคลังนั้นแล้วปล่อยงานได้เลย`}
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
                      แยกตัวที่หมดไปใบงานรออะไหล่ — ใบนี้ไปตามนัดด้วยของที่มี
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {mixed && splitOut && paidOrder ? (
                  <>
                    <Text style={styles.modalLabel}>
                      ลูกค้าจ่ายค่าอะไหล่ที่หมดแล้วหรือยัง <Text style={{ color: colors.danger }}>*</Text>
                    </Text>
                    <View style={styles.options} accessibilityLabel="ลูกค้าจ่ายค่าอะไหล่ที่หมดแล้วหรือยัง">
                      <TouchableOpacity
                        style={[styles.option, splitPaid === false && styles.optionOn]}
                        onPress={() => setSplitPaid(false)}
                        accessibilityLabel="ยังไม่จ่าย เสนอราคาใหม่"
                      >
                        <Text style={[styles.optionText, splitPaid === false && styles.optionTextOn]}>
                          ยังไม่จ่าย — จ่ายแค่ค่าของที่มี
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.option, splitPaid === true && styles.optionOn]}
                        onPress={() => setSplitPaid(true)}
                        accessibilityLabel="จ่ายแล้ว เบิกเมื่อของเข้า"
                      >
                        <Text style={[styles.optionText, splitPaid === true && styles.optionTextOn]}>
                          จ่ายแล้ว — รวมอยู่ในใบเสนอราคาเดิม
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {splitPaid !== null ? (
                      <Text style={styles.linkedText}>
                        {splitPaid
                          ? "ใบใหม่รอของเข้าที่ขั้นเช็คอะไหล่ — ของเข้าแล้วนัดได้เลย ไม่ต้องเสนอราคาใหม่"
                          : "ใบใหม่รอของเข้าที่ขั้นเช็คอะไหล่ — ของเข้าแล้วเสนอราคา → รับเงิน → นัด เหมือนใบปกติ"}
                      </Text>
                    ) : null}
                  </>
                ) : null}
                {checkOut ? (
                  <DateField
                    value={expectedAt}
                    onChange={setExpectedAt}
                    label={prevUsed.includes("วันของเข้า") ? "คาดว่าของเข้า · ค่าเดิมก่อนย้อน" : "คาดว่าของเข้า"}
                    emptyHint="ไม่บังคับ — ใส่แล้วขึ้นบนแถบขั้นตอนคู่กับป้าย “อะไหล่หมด”"
                  />
                ) : null}
                <Text style={partsShort ? styles.warn : styles.linkedText} accessibilityLabel="ผลของการเบิก">
                  {partsShort
                    ? shopKnows
                      ? "ของไม่พอ — ทั้งใบกลับไปขั้นเช็คอะไหล่ (ป้ายแดง “อะไหล่หมด”) วันนัดเดิมถูกยกเลิก · โทรแจ้งลูกค้าว่าเลื่อนนัด ของเข้าครบแล้วส่งหัวหน้าภาคนัดใหม่"
                      : order.scheduledAt
                        ? `ของไม่พอ — ทั้งใบกลับไปขั้นเช็คอะไหล่ (ป้ายแดง “อะไหล่หมด”) · วันนัดที่หัวหน้าภาคจองไว้ (${visitLabel(order)}) ถูกยกเลิก — ยังไม่ได้แจ้งลูกค้า ไม่ต้องโทร · ของเข้าครบแล้วหัวหน้าภาคนัดใหม่`
                        : "ของไม่พอ — ทั้งใบกลับไปขั้นเช็คอะไหล่ (ป้ายแดง “อะไหล่หมด”) · ของเข้าครบแล้วส่งหัวหน้าภาคนัดวัน"
                    : mixed && splitOut
                      ? "ตัวที่หมดย้ายไปใบงานใหม่ (รอของเข้า แล้วนัดใหม่) — ใบนี้ไปตามนัดด้วยของที่มี"
                      : toPickup.length
                        ? `ของคลังอื่นส่งให้หัวหน้าภาคเบิก/โอนก่อน — ครบแล้ว${afterIssueText(order)}`
                        : `เบิกครบแล้ว — ${afterIssueText(order)} · ของที่เช็คว่ามีถูกใช้ไปแล้ว กด “หมด” ที่ตัวนั้น`}
                </Text>
              </View>
            ) : null}

            {["PARTS_TRANSFER", "PARTS_IN_TRANSIT", "PARTS_PICKUP"].includes(order.status) && order.scheduledAt ? (
              /**
               * วันนัดที่ของต้องไปถึง — หัวหน้าภาคนัดวันก่อนเบิก/โอน (ต.ค. 69 รอบสอง) แอดมินโทรคอนเฟิร์มร้านเมื่อของพร้อม
               * ของไปไม่ทันให้แอดมินเลื่อนวันนัด (ใบอยู่ขั้นนี้ต่อ การโอนไม่หาย) ไม่ใช่ปล่อยให้เลยนัดเงียบ ๆ
               */
              <View style={styles.issuedBox} accessibilityLabel="วันนัดที่ของต้องถึง">
                <Text style={styles.issuedTitle}>
                  นัดเข้างาน {visitLabel(order)}
                  {order.assignedTeam ? ` · ทีม${order.assignedTeam}` : ""}
                  {APPOINTMENT_DONE.includes(order.appointmentStatus ?? "") ? " · ลูกค้าคอนเฟิร์มแล้ว" : ""}
                </Text>
                <Text style={styles.issuedLine}>ของต้องถึงก่อนวันนัด · ไม่ทันให้แจ้งแอดมินเลื่อนวันนัด</Text>
              </View>
            ) : null}
            {order.status === "PARTS_TRANSFER" || order.status === "PARTS_IN_TRANSIT" ? (
              <View style={styles.checkList}>
                {order.status === "PARTS_TRANSFER" && pickupRequest ? (
                  <View style={styles.pickupBox} accessibilityLabel="หมายเหตุจากแอดมิน">
                    <Text style={styles.issuedTitle}>
                      แอดมินแจ้งว่ามีของที่{pickupRequest.byName ? ` (${pickupRequest.byName} · ${formatDateTime(pickupRequest.createdAt)})` : ""}
                    </Text>
                    {transferParts.map((p) => (
                      <Text key={p.sparePartId} style={styles.pickupNoteText}>
                        {partTitle(p)} × {p.quantity} — {p.warehouse}
                      </Text>
                    ))}
                    {/* ชิ้นที่แอดมินบอกว่าไม่ต้องโอน — ไม่อยู่ในฟอร์มโอน เบิกพร้อมกันตอนส่งมอบ (แบบ ก. เจ้าของงานเลือก ต.ค. 69) */}
                    {order.waitingParts
                      .filter((p) => isPickup(p, adminWarehouse) && !p.transferNo)
                      .map((p) => (
                        <Text key={`nt-${p.sparePartId}`} style={styles.pickupNoteText} accessibilityLabel={`ไม่ต้องโอน ${p.partCode}`}>
                          {partTitle(p)} × {p.quantity} — {p.warehouse} · ไม่ต้องโอน เบิกตอนส่งมอบ
                        </Text>
                      ))}
                    {pickupAdminNote(pickupRequest.note) ? (
                      <Text style={styles.linkedText}>หมายเหตุ: {pickupAdminNote(pickupRequest.note)}</Text>
                    ) : null}
                  </View>
                ) : null}
                {order.status === "PARTS_IN_TRANSIT" ? (
                  <View style={styles.pickupBox} accessibilityLabel="อะไหล่ที่กำลังโอน">
                    <Text style={styles.issuedTitle}>กำลังโอน — ของถึงคลังปลายทางแล้วกด "โอนเสร็จแล้ว"</Text>
                    {movingParts.map((p) => (
                      <Text key={p.sparePartId} style={styles.pickupNoteText}>
                        {partTitle(p)} × {p.quantity} — {p.transferFrom} (ใบเบิก {p.transferReqNo}) → {p.warehouse} · ใบโอน {p.transferNo}
                      </Text>
                    ))}
                    <Text style={styles.linkedText}>
                      {movingParts.some((p) => p.warehouse === adminWarehouse)
                        ? `โอนเสร็จแล้วใบงานกลับไปให้แอดมินเบิกส่งมอบจาก${adminWarehouse}`
                        : "โอนเสร็จแล้วคุณเบิกส่งมอบจากคลังปลายทางต่อ (แอดมินเบิกได้เฉพาะคลัง 94)"}
                    </Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={styles.skipRow}
                  onPress={() => setPickupFail((v) => !v)}
                  activeOpacity={0.7}
                  accessibilityLabel="เบิกหรือโอนไม่ได้ ส่งกลับแอดมิน"
                >
                  <Ionicons name={pickupFail ? "checkbox" : "square-outline"} size={18} color={pickupFail ? colors.danger : colors.textFaint} />
                  <Text style={styles.skipText}>
                    {order.status === "PARTS_TRANSFER" ? "เบิกไม่ได้" : "โอนไม่สำเร็จ"} — ส่งกลับให้แอดมินหาคลังอื่นหรือตอบว่าหมด (ใส่เหตุผลในช่องบันทึกข้างล่าง)
                  </Text>
                </TouchableOpacity>
                {order.status === "PARTS_TRANSFER" && !pickupFail
                  ? transferParts.map((part) => {
                      const v = transfer[part.sparePartId] ?? { from: part.warehouse, reqNo: "", to: adminWarehouse, transferNo: "" };
                      const set = (next: Partial<typeof v>) => setTransfer((cur) => ({ ...cur, [part.sparePartId]: { ...v, ...next } }));
                      return (
                        <View key={part.sparePartId} style={styles.checkItem}>
                          <Text style={styles.checkCode}>
                            {partTitle(part)} × {part.quantity}
                          </Text>
                          <Text style={styles.checkName}>{part.name}</Text>
                          <Text style={styles.modalLabel}>เบิกจากคลัง</Text>
                          <Dropdown
                            value={v.from}
                            placeholder="คลังที่เบิก"
                            accessibilityLabel={`เบิกจากคลัง ${part.partCode}`}
                            options={warehouses.map((w) => ({ value: w, label: w, hint: w === part.warehouse ? "แอดมินบอก" : undefined }))}
                            onChange={(next) => set({ from: next })}
                          />
                          <TextInput
                            style={[styles.modalInput, styles.modalInputLine]}
                            value={v.reqNo}
                            onChangeText={(t) => set({ reqNo: t })}
                            placeholder="เลขใบเบิกจากคลังต้นทาง"
                            placeholderTextColor={colors.textFaint}
                            autoCapitalize="characters"
                            accessibilityLabel={`เลขใบเบิกต้นทาง ${part.partCode}`}
                          />
                          <Text style={styles.modalLabel}>โอนไปคลัง (ที่จะส่งมอบให้ช่าง)</Text>
                          <Dropdown
                            value={v.to}
                            placeholder="คลังปลายทาง"
                            accessibilityLabel={`โอนไปคลัง ${part.partCode}`}
                            options={[...warehouses]
                              .filter((w) => w !== v.from)
                              .sort((a, b) => Number(b === adminWarehouse) - Number(a === adminWarehouse))
                              .map((w) => ({ value: w, label: w, hint: w === adminWarehouse ? "แอดมินเบิกส่งมอบ" : "หัวหน้าภาคเบิกส่งมอบ" }))}
                            onChange={(next) => set({ to: next })}
                          />
                          {v.from && v.to && v.from === v.to ? <Text style={styles.warn}>คลังที่โอนไปต้องไม่ใช่คลังเดียวกับที่เบิก</Text> : null}
                          <TextInput
                            style={[styles.modalInput, styles.modalInputLine]}
                            value={v.transferNo}
                            onChangeText={(t) => set({ transferNo: t })}
                            placeholder="เลขที่ใบโอน"
                            placeholderTextColor={colors.textFaint}
                            autoCapitalize="characters"
                            accessibilityLabel={`เลขที่ใบโอน ${part.partCode}`}
                          />
                        </View>
                      );
                    })
                  : null}
                {!pickupFail && transferPairs.length ? (
                  <View style={styles.issuedBox}>
                    <Text style={styles.issuedTitle}>ใบขอโอนสินค้า (PDF)</Text>
                    {transferPairs.map(([key, pair]) => (
                      <View key={key} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                        <TouchableOpacity
                          style={styles.docBtn}
                          onPress={() => transferDoc(pair.from, pair.to, pair.rows)}
                          disabled={docBusy === key}
                          activeOpacity={0.8}
                          accessibilityLabel={`ออกใบขอโอนสินค้า ${key}`}
                        >
                          <Ionicons name="document-text-outline" size={16} color={colors.primaryInk} />
                          <Text style={styles.docBtnText}>
                            {docBusy === key ? "กำลังออก…" : `${pair.from} → ${pair.to} (${pair.rows.length} รายการ)`}
                          </Text>
                        </TouchableOpacity>
                        {transferDocs[key] ? (
                          <TouchableOpacity
                            onPress={() => openUrl(resolveImageUrl(transferDocs[key])!)}
                            accessibilityLabel={`เปิดใบขอโอนสินค้า ${key}`}
                          >
                            <Text style={styles.docLink}>เปิด PDF</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}
                {issued.length > 0 ? (
                  <View style={styles.issuedBox}>
                    <Text style={styles.issuedTitle}>เบิกส่งมอบแล้ว</Text>
                    {issued.map((p) => (
                      <Text key={p.sparePartId} style={styles.issuedLine}>
                        {p.partCode} × {p.quantity} · {p.warehouse ?? "-"} · {requisitionLine(p)}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <Text style={transferBlocked ? styles.warn : styles.linkedText}>
                  {pickupFail
                    ? note.trim()
                      ? "ใบงานกลับไปขั้นแอดมินเบิกอะไหล่"
                      : "ใส่เหตุผลในช่องบันทึกข้างล่าง"
                    : order.status === "PARTS_TRANSFER"
                      ? transferBlocked
                        ? "ใส่คลัง เลขใบเบิก และเลขที่ใบโอนให้ครบทุกรายการ"
                        : "บันทึกแล้วใบงานรอของถึงคลังปลายทาง"
                      : "ของถึงคลังปลายทางแล้วกดปุ่มข้างล่าง"}
                </Text>
              </View>
            ) : null}

            {order.status === "PARTS_PICKUP" ? (
              <View style={styles.checkList}>
                {pickupRequest ? (
                  <View style={styles.pickupBox} accessibilityLabel="หมายเหตุจากแอดมิน">
                    <Text style={styles.issuedTitle}>
                      แอดมินแจ้งว่ามีของที่{pickupRequest.byName ? ` (${pickupRequest.byName} · ${formatDateTime(pickupRequest.createdAt)})` : ""}
                    </Text>
                    {/* รายตัวจากผลเช็คของแอดมิน ไม่ใช่จากข้อความ — หมายเหตุไม่บังคับแล้ว ข้อความอาจไม่มี */}
                    {pickupParts.map((p) => (
                      <Text key={p.sparePartId} style={styles.pickupNoteText}>
                        {partTitle(p)} × {p.quantity} — {p.warehouse}
                      </Text>
                    ))}
                    {pickupAdminNote(pickupRequest.note) ? (
                      <Text style={styles.linkedText}>หมายเหตุ: {pickupAdminNote(pickupRequest.note)}</Text>
                    ) : null}
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
                        {p.partCode} × {p.quantity} · {p.warehouse ?? "-"} · {requisitionLine(p)}
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
                      : `เบิกครบแล้ว — ${afterIssueText(order)}`}
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
                    : "ส่งใบเสนอราคาไปแล้ว รอลูกค้าจ่ายเงิน — ได้เงินแล้วแนบบิลเพื่อส่งต่อให้หัวหน้าภาคนัดวันเข้า"}
                </Text>
                {/* รายการที่ต้องอยู่ในใบเสนอราคา — ใบเสนอราคาออกจากระบบบัญชี แอดมินดูจากตรงนี้แล้วไปพิมพ์ราคาที่นั่น */}
                {order.waitingParts.length || order.services.length ? (
                  <View style={styles.issuedBox}>
                    <Text style={styles.issuedTitle}>
                      {order.status === "AWAITING_QUOTE" ? "รายการที่ต้องใส่ในใบเสนอราคา" : "รายการในใบเสนอราคา"}
                    </Text>
                    {order.waitingParts.map((p) => (
                      <View key={`p${p.sparePartId}`}>
                        <Text style={styles.issuedLine}>
                          {p.offCatalog ? "อะไหล่นอก · " : ""}
                          {p.offCatalog ? p.name : `${p.partCode} ${p.name}`} × {p.quantity}
                          {p.unit ? ` ${p.unit}` : ""}
                          {p.note ? ` · ${p.note}` : ""}
                        </Text>
                        {/* แหล่งที่หัวหน้าภาคแจ้ง — แอดมินทำใบเสนอราคาจากตรงนี้ (ร้านไหน ราคาเท่าไหร่) ไม่ต้องโทรถาม */}
                        {p.offCatalog ? <Text style={styles.offSourceLine}>หัวหน้าภาคแจ้ง: {offAnswerLine(p)}</Text> : null}
                      </View>
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
                  <FileDropZone
                    hint="รูปเอกสาร · PDF"
                    disabled={!!busy}
                    label={order.status === "AWAITING_QUOTE" ? "วางใบเสนอราคา" : "วางบิล"}
                    onFiles={(dropped) => pickDoc((stage) => filesToAttachments(dropped, { image: true, pdf: true, doc: true }, stage))}
                  >
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
                              pickDoc((stage) => pickImageAttachment(true, stage, { doc: true }))
                            }
                            activeOpacity={0.7}
                          >
                            <Text style={styles.optionText}>ถ่ายเอกสาร</Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          style={styles.option}
                          onPress={() => pickDoc((stage) => pickImageAttachments(stage, { doc: true }))}
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
                    {!busy ? <DropHint /> : null}
                  </FileDropZone>
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

            {canDecline ? (
              <>
                {declineDate ? <DispatchNote order={order} now={now} /> : null}
                <View style={styles.options} accessibilityLabel="วันนัดเปลี่ยน ทีมว่างไหม">
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
                    <Text style={[styles.optionText, declineDate && styles.optionTextOn]}>ทีมไม่ว่าง — ส่งกลับแอดมิน{inspectRelease ? "นัดตรวจใหม่" : "นัดใหม่"}</Text>
                  </TouchableOpacity>
                </View>
                {declineDate ? (
                  <Text style={styles.linkedText}>
                    {inspectRelease
                      ? "กลับไปให้แอดมินนัดตรวจใหม่ (โทรนัดร้าน) ทีมเดิมยังอยู่ — ใส่เหตุผลในช่องด้านล่าง แอดมินจะเห็น"
                      : "ใบกลับไปให้แอดมินโทรนัดร้านใหม่ ทีมเดิมยังอยู่ — ใส่เหตุผลในช่องด้านล่าง แอดมินจะเห็น"}
                  </Text>
                ) : null}
              </>
            ) : null}

            {((order.status === "ASSIGNED" || order.status === "INSPECT_DISPATCH") && !(canDecline && declineDate)) ||
            order.status === "PARTS_CHECKED" ||
            (order.status === "NEW" && (inspectFirst || noPartsAssign)) ? (
              <>
                {releaseStage ? <DispatchNote order={order} now={now} /> : null}
                {order.status === "PARTS_CHECKED" ? (
                  <>
                    {/* นัดวัน → เบิก → คอนเฟิร์มลูกค้าตอนของพร้อม (ต.ค. 69 รอบสอง) · ไม่ใช้อะไหล่/เบิกครบแล้วไม่มีขั้นเบิกคั่น */}
                    <Text style={styles.linkedText}>
                      {partsToIssue(order)
                        ? "เลือกทีมและวันเข้างาน → แอดมินเบิกอะไหล่ (ของคลังอื่นคุณเบิก/โอนให้ถึงก่อนวันนัด) → แอดมินโทรคอนเฟิร์มลูกค้าเมื่อของพร้อม (ร้านขอเลื่อน แอดมินเปลี่ยนวันให้) → กลับมาให้คุณปล่อยงาน"
                        : "เลือกทีมและวันเข้างาน → แอดมินโทรคอนเฟิร์มลูกค้า (ร้านขอเลื่อน แอดมินเปลี่ยนวันให้) → กลับมาให้คุณปล่อยงาน"}
                    </Text>
                    <PartsReady order={order} adminWarehouse={adminWarehouse} />
                  </>
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
                    {crossNote(teams.find((t) => t.name === team), team, order.suggestedTeam)}
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
                {/* ถูกตีกลับ — เหตุผลอยู่บนสุดของฟอร์ม ช่างอ่านก่อนแก้ (ตัวอย่าง tf.back) · ทีม Area เปิดฟอร์มนี้ไม่ได้อยู่แล้ว */}
                {backPick && user?.role && PICK_REASON_ROLES.includes(user.role) ? <PickReturnedBox pick={backPick} /> : null}
                <InspectionSlots
                  partAddLabel={backPick ? "เพิ่มรูปอะไหล่ที่เสีย" : undefined}
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
                {/* ตีกลับไม่ใช่ส่งตรวจใหม่ — ไฟล์สามอย่างของรอบนี้ยังนับ ไม่ต้องกลับไปถ่ายที่ร้าน (ข้อ 9) */}
                {backPick ? <Text style={styles.keepFiles}>ไฟล์รอบนี้ยังใช้ได้ — ไม่ต้องถ่ายใหม่ · รูปไม่ชัดก็เพิ่มได้</Text> : null}
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
                {/*
                  ข้อ 5 อะไหล่ที่ต้องใช้ (เจ้าของงานขอ ต.ค. 69 · ตัวอย่าง step 5) — ไม่บังคับ: บอกไม่ได้ก็เว้น หัวหน้าภาคระบุแทนเหมือนเดิม
                  ล็อกตามไฟล์ยี่ห้อของเครื่อง (+ ของใช้ร่วม Other + อะไหล่นอกเครื่อง) · เครื่องที่ยังไม่รู้ยี่ห้อกดยี่ห้อก่อน (อะไหล่นอกเครื่องเลือกได้เลย)
                  ใบไม่มีเครื่องเลือกได้เฉพาะอะไหล่นอกเครื่อง (4 พ.ย. 69 — เดิมล็อกทั้งช่อง D15)
                  ไม่ใช่ Modal ซ้อน — ช่องค้นและปุ่มยี่ห้ออยู่ในฟอร์มนี้เลย
                */}
                <TextStep n={5} title="อะไหล่ที่ต้องใช้" optional done={parts.length > 0}>
                  {inspectMachine ? (
                    <Text style={styles.stepHint}>ยังบอกไม่ได้ว่าต้องใช้ตัวไหน เว้นว่างได้ — หัวหน้าภาคจะเป็นคนระบุแทน</Text>
                  ) : null}
                  <PartPicker
                    label={null}
                    parts={parts}
                    onChange={changeInspectParts}
                    // เซิร์ฟเวอร์รุ่นก่อน (ไม่มี partsBrand): ใบมีเครื่องค้นแบบเดิม · ใบไม่มีเครื่องเป็นช่องอะไหล่นอกเครื่อง
                    brand={order.partsBrand ?? (inspectMachine ? null : { machine: false, make: null, file: null, machineCode: null })}
                    chosenBrand={pickedBrand}
                    onBrandChosen={changeInspectBrand}
                    strict
                    tags={inspectTags}
                    saveWhen="ตอนส่งผลตรวจ"
                    noMachineText="ใบงานนี้ไม่ได้ระบุเครื่อง — เลือกได้เฉพาะอะไหล่นอกเครื่อง · อะไหล่ของเครื่องเขียนในข้อ 4 หัวหน้าภาคระบุให้"
                    noResultHints={[
                      "ตัวที่ต้องใช้ไม่มีในไฟล์นี้: เขียนชื่อไว้ในข้อ 4 หัวหน้าภาคจะตัดสินใจต่อ",
                      "ยี่ห้อในระบบไม่ตรงกับเครื่องจริง? ถ่ายป้ายเครื่องแล้วเขียนในข้อ 4 — หัวหน้าภาคแก้ยี่ห้อเครื่องให้",
                    ]}
                  />
                  {removedFlags.map((i) => (
                    <Text key={i.sparePartId} style={styles.flagRemoved}>
                      เอา {pickName(i)} ออกแล้ว — ตัวที่หัวหน้าภาคชี้ว่าไม่ตรง
                    </Text>
                  ))}
                  {inspectBrandBlock ? <Text style={styles.warn}>{inspectBrandBlock}</Text> : null}
                  {inspectQtyBad ? <Text style={styles.warn}>ใส่จำนวนให้ครบทุกรายการ (1–99)</Text> : null}
                </TextStep>
                <MissingBox items={inspectMissing} why="ต้องแนบให้ครบ 3 อย่างก่อนส่งผลตรวจ" />
                <NextBox>{inspectNext}</NextBox>
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
                    {p.offCatalog ? ` · ${offAnswerLine(p)}` : ""}
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
                  min={minVisit}
                  {...schedField}
                />
                {pastWarn}
                {scheduleHelp}
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
                    : confirmToIssue
                      ? `หัวหน้าภาคจ่าย ${order.assignedTeam ? `ทีม${order.assignedTeam}` : "ทีม"} เข้า ${visitLabel(order)}`
                      : // คอนเฟิร์มออกหน้างาน (เจ้าของงานเรียก ต.ค. 69) — ของอยู่ในมือแล้ว โทรบอกร้านว่าไปแน่
                        `คอนเฟิร์มออกหน้างาน — ${order.assignedTeam ? `ทีม${order.assignedTeam}` : "ทีม"} เข้า ${visitLabel(order)}`}
                  {order.contactPhone ? ` · โทร ${order.contactPhone}` : ""}
                </Text>
                {/* ของพร้อมแค่ไหน — โทรร้านตอนของอยู่ในมือแล้วเท่านั้น (ต.ค. 69 รอบสอง) แอดมินเห็นก่อนยกหูโทร */}
                {order.status === "AWAITING_CONFIRM" ? <PartsReady order={order} adminWarehouse={adminWarehouse} viewer="admin" /> : null}
                <Text style={styles.modalLabel}>ลูกค้าตอบว่าอย่างไร</Text>
                <View style={{ gap: spacing.xs }}>
                  {(order.status === "INSPECT_CONFIRM"
                    ? order.scheduledAt
                      ? ([
                          ["OK", "ลูกค้าคอนเฟิร์มวันเดิม", "ส่งให้หัวหน้าภาคส่งช่างเข้าตรวจ"],
                          ["MOVE", "ลูกค้าขอเลื่อน / เปลี่ยนวัน", "เลือกวันที่ลูกค้าสะดวก แล้วส่งให้หัวหน้าภาคส่งช่างเข้าตรวจ"],
                        ] as const)
                      : // ใบที่ส่งตรวจก่อนบังคับวัน (ก่อน ต.ค. 69 รอบสอง) — ไม่มีวันให้ลูกค้า "ตกลง"
                        ([["MOVE", "นัดวันเข้าตรวจ", "ใส่วันที่ลูกค้าสะดวก แล้วส่งให้หัวหน้าภาคส่งช่างเข้าตรวจ"]] as const)
                    : confirmToIssue
                      ? // กันใบเก่า: นัดก่อนเปลี่ยนลำดับแล้วยังไม่เบิก (ปกติย้ายไปขั้นเบิกตอนเปลี่ยนสายงานแล้ว) — คอนเฟิร์มแล้วเบิกต่อ
                        ([
                          ["OK", "ลูกค้าคอนเฟิร์มวันเดิม", "ใบนี้นัดก่อนเปลี่ยนลำดับ — คอนเฟิร์มแล้วไปเบิกอะไหล่ แล้วหัวหน้าภาคปล่อยงาน"],
                          ["MOVE", "ลูกค้าขอเลื่อน / เปลี่ยนวัน", "ใบนี้นัดก่อนเปลี่ยนลำดับ — เลือกวันใหม่แล้วไปเบิกอะไหล่ต่อ"],
                        ] as const)
                      : ([
                          ["OK", "ลูกค้าคอนเฟิร์มวันเดิม", "ส่งให้หัวหน้าภาคปล่อยงาน"],
                          ["MOVE", "ลูกค้าขอเลื่อน / เปลี่ยนวัน", "เลือกวันใหม่ แล้วส่งให้หัวหน้าภาคคอนเฟิร์มวันใหม่"],
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
                {/* ตกลงวันเดิมไม่มีบรรทัด (คอนเฟิร์มไม่มีเวลาปิด) · ขอเลื่อน: บรรทัดอยู่ใต้ช่องวัน (ตัวอย่าง confirmEx — เหนือปุ่ม) */}
                {confirmChoice === "MOVE" ? (
                  <>
                    <DateField
                      value={visit}
                      onChange={setVisit}
                      label={order.status === "INSPECT_CONFIRM" && !order.scheduledAt ? "วันเข้าตรวจ" : "วันใหม่"}
                      emptyHint="เลือกวันที่ลูกค้าสะดวก"
                      min={minVisit}
                      dayTags={scheduleDayTags(now, rule, urgentFor, "admin")}
                      invalid={confirmNeedTick && !urgentWith}
                    />
                    {pastWarn}
                    {confirmWarnBlock}
                    <TimeField value={visitTime} onChange={setVisitTime} label="เวลา (ไม่ใส่ก็ได้)" />
                  </>
                ) : null}
              </>
            ) : null}

            {/* ขั้นตรวจหน้างานมีช่องผลตรวจอยู่แล้ว ช่องบันทึกอีกช่องทำให้ไม่รู้ว่าต้องพิมพ์ที่ไหน
                จอคอนเฟิร์มตอนมีแถว "ไม่ตรง": ช่างอ่านแค่เหตุผล — ช่องบันทึกอีกช่อง (ไปกับการคอนเฟิร์มเท่านั้น) ทำให้พิมพ์ผิดช่อง
                ซ่อนตาม "ไม่ตรง" ไม่ใช่ตามกล่องตีกลับที่เปิดค้าง — กดตีกลับพลาดแล้วกลับมาคอนเฟิร์ม ข้อความบันทึกต้องยังเห็น/แก้ได้ เพราะมันถูกส่งไปกับการคอนเฟิร์ม */}
            {order.status !== "INSPECTING" && !anyNo ? (
              <>
                <Text style={styles.modalLabel}>
                  {["PARTS_PICKUP", "PARTS_TRANSFER", "PARTS_IN_TRANSIT"].includes(order.status) && pickupFail
                    ? "เหตุผลที่เบิกไม่ได้ *"
                    : canDecline && declineDate
                      ? "เหตุผลที่ทีมไม่ว่าง (แอดมินเห็น) *"
                      : "บันทึกเพิ่มเติม"}
                </Text>
                <TextInput
                  style={styles.modalInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder={
                    ["PARTS_PICKUP", "PARTS_TRANSFER", "PARTS_IN_TRANSIT"].includes(order.status) && pickupFail
                      ? "เช่น คลังภูเก็ตของหมดแล้ว"
                      : canDecline && declineDate
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
  // byRole คือ role ดิบในฐานข้อมูล — ไม่มีแถวนี้ จุดสีกับป้ายของ Senior ช่างหายไปเฉย ๆ
  SENIOR_TECH: { fg: colors.roleTech, bg: colors.roleTechSoft, label: "Senior ช่าง" },
};

/**
 * สีของแต่ละบรรทัดในประวัติ — บอกว่า "เป็นเรื่องอะไร" (พ.ย. 69 ตามแบบที่เจ้าของงานส่งมา)
 * แบบเดิมใช้สีตามคนทำ หัวหน้าภาคระบุอะไหล่กับหัวหน้าภาคส่งทีมตรวจเลยเป็นสีเดียวกัน ทั้งที่คนอ่านอยากหาว่า
 * "อะไหล่ไปถึงไหน" หรือ "ลูกค้าว่ายังไง" — ไล่ตาตามสีได้เลย · ป้ายบทบาทยังบอกว่าใครทำ
 * ม่วง = เปิด/เริ่ม · ฟ้า = ส่งต่อ/สั่งงาน · คราม = ลูกค้า · เหลือง = อะไหล่ · เขียว = หน้างาน/ปิดงาน · แดง = ถอย/ติดปัญหา · เทา = อื่น ๆ
 */
type HistTone = "start" | "send" | "customer" | "parts" | "site" | "problem" | "other";
const HIST_TONE: Record<string, HistTone> = {
  CREATED: "start", SPLIT_FROM: "start", REOPENED: "start", SPLIT: "start", TEST_COPY: "start",
  INSPECT_REQUESTED: "send", ASSIGNED: "send", SCHEDULED: "send", PICKUP_REQUESTED: "send", QUOTED: "send",
  ADMIN_REVIEW_REQUESTED: "send", ADMIN_REVIEW_ANSWERED: "send", URGENT_REQUESTED: "send", URGENT_RELEASE: "send",
  URGENT_REQUEST_ANSWERED: "send", APPOINTMENT_MOVED: "send", EDITED: "send",
  CONFIRMED: "customer", RESCHEDULED: "customer", PAID: "customer", PAYMENT_FOLLOWUP: "customer", PREPAID: "customer",
  PARTS_REQUESTED: "parts", NO_PARTS: "parts", PARTS_CHECKED: "parts", PARTS_SOURCED: "parts", PARTS_PICK_CONFIRMED: "parts",
  TRANSFER_REQUESTED: "parts", PICKED_UP: "parts", TRANSFER_ARRIVED: "parts", PARTS_ARRIVED: "parts", PARTS_ETA_CHANGED: "parts",
  MACHINE_BRAND_SET: "parts", CROSS_BRAND_PARTS: "parts",
  ARRIVED: "site", INSPECTED: "site", PARTS_PICKED: "site", PARTS_PICKED_ON_BEHALF: "site", CLOSED: "site",
  BACKFILLED: "site", RECOVERED_CLOSED: "site", SUPERVISOR_CLOSED: "site", REMOTE_CLOSED: "site", CLAIM_SUBMITTED: "site",
  CLAIM_APPROVED: "site", CLAIM_DECLINED: "site",
  ROLLED_BACK: "problem", PARTS_ROLLBACK: "problem", PARTS_BACKORDERED: "problem", PARTS_SHORT: "problem",
  CANCELLED: "problem", TRANSFER_RETURNED: "problem", PICKUP_RETURNED: "problem", NEW_DATE_DECLINED: "problem",
  CLAIM_REJECTED: "problem", PARTS_PICK_RETURNED: "problem", APPOINTMENT_RECALLED: "problem", TRASHED: "problem",
};
const TONE_INK: Record<HistTone, { fg: string; bg: string }> = {
  start: { fg: colors.roleAdmin, bg: colors.roleAdminSoft },
  send: { fg: colors.histBlue, bg: colors.histBlueSoft },
  customer: { fg: colors.histIndigo, bg: colors.histIndigoSoft },
  parts: { fg: colors.warning, bg: colors.warningTint },
  site: { fg: colors.roleTech, bg: colors.roleTechSoft },
  problem: { fg: colors.danger, bg: colors.dangerSoft },
  other: { fg: colors.textFaint, bg: colors.background },
};
/** ตามแบบ: หัวเรื่องเป็นสีเฉพาะจุดเริ่ม ผลหน้างาน และเรื่องที่ถอย — ที่เหลือสีตัวหนังสือปกติ ไม่งั้นทั้งการ์ดเป็นสีรุ้ง */
const TONE_TITLE: HistTone[] = ["start", "site", "problem"];

function History({ logs, closed, onTimeline }: { logs: WorkOrder["logs"]; closed: boolean; onTimeline?: () => void }) {
  const [all, setAll] = useState(false);
  // เก่าไปใหม่ทั้งรายการ (แบบที่เจ้าของงานส่งมา พ.ย. 69) — อ่านไล่เป็นเรื่องเดียวกันได้ · แนบไฟล์ยังซ่อนไว้เหมือนเดิม
  const ordered = [...logs].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  const minor = ordered.filter((l) => MINOR_ACTIONS.has(l.action)).length;
  const shown = all ? ordered : ordered.filter((l) => !MINOR_ACTIONS.has(l.action));
  return (
    <View style={[styles.card, closed && styles.cardDone]} {...howtoTarget("order.history")}>
      <View style={styles.hHead}>
        <View style={styles.hIcon}>
          <Ionicons name="time-outline" size={20} color={colors.warning} />
        </View>
        <Text style={[styles.hTitle, headingFont]}>ประวัติ</Text>
        <View style={{ flex: 1 }} />
        {/* ลิงก์มุมขวาตามแบบ — ไทม์ไลน์เต็มเป็นของผู้ดูแลระบบ · คนอื่นใช้ที่เดียวกันเปิดรายการแนบไฟล์ที่ซ่อนไว้ */}
        {onTimeline ? (
          <TouchableOpacity onPress={onTimeline} accessibilityLabel="ดูไทม์ไลน์เต็ม">
            <Text style={styles.hTimeline}>ดูไทม์ไลน์เต็ม</Text>
          </TouchableOpacity>
        ) : minor > 0 ? (
          <TouchableOpacity onPress={() => setAll((v) => !v)} accessibilityLabel={all ? "ซ่อนรายการแนบไฟล์" : "ดูประวัติทั้งหมด"}>
            <Text style={styles.hTimeline}>{all ? "ซ่อนแนบไฟล์" : `ดูทั้งหมด (${ordered.length})`}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {shown.map((log, i) => {
        const role = log.byRole ? ROLE_DOT[log.byRole] : undefined;
        const small = MINOR_ACTIONS.has(log.action);
        const tone: HistTone = small ? "other" : HIST_TONE[log.action] ?? "other";
        const ink = TONE_INK[tone];
        const at = new Date(log.createdAt);
        const day = at.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });
        const time = at.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
        // บันทึกแบบกล่อง = ข้อความสั่งงานถึงคนถัดไป · แดง = สิ่งที่พบ/ปัญหา · ที่เหลือเป็นบรรทัดเทาเบา ๆ (ตามแบบ)
        const noteKind = tone === "send" || log.action === "CLOSED" ? "box" : tone === "problem" || log.action === "INSPECTED" ? "bad" : "plain";
        const last = i === shown.length - 1;
        return (
          <View key={log.id} style={styles.hRow}>
            <View style={styles.hRail}>
              {!last ? <View style={styles.hLine} /> : null}
              <View style={[styles.hHalo, { backgroundColor: ink.bg }]}>
                <View style={[styles.hDot, { backgroundColor: ink.fg }]} />
              </View>
            </View>
            <View style={[styles.hBody, !last && styles.hBodyGap]}>
              <View style={styles.hTop}>
                <Text style={[styles.hAction, TONE_TITLE.includes(tone) && { color: ink.fg }, small && styles.hMinor]}>{log.actionLabel}</Text>
                <Text style={styles.hWhenText}>
                  {day} {time}
                </Text>
              </View>
              {log.byName ? (
                <View style={styles.hWho}>
                  <Text style={styles.hName}>{log.byName}</Text>
                  {role && !small ? (
                    <View style={[styles.hRole, { backgroundColor: ink.bg, borderColor: `${ink.fg}55` }]}>
                      <Text style={[styles.hRoleText, { color: tone === "other" ? colors.textMuted : ink.fg }]}>{role.label}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {log.note ? (
                <Text style={noteKind === "box" ? styles.hNoteBox : noteKind === "bad" ? styles.hNoteBad : styles.hNote}>{log.note}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
      {/* ผู้ดูแลระบบ: ลิงก์มุมขวาเป็นไทม์ไลน์ จึงเปิดแนบไฟล์ที่ท้ายการ์ดแทน */}
      {onTimeline && minor > 0 ? (
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
  // ลำดับหลังรับเงินตามสายงานปัจจุบัน (ต.ค. 69 รอบสอง): นัดวัน → เบิก → คอนเฟิร์มลูกค้าตอนของพร้อม
  const chain = needsParts
    ? ["แอดมินเช็คอะไหล่", "แอดมินแนบใบเสนอราคา", "ลูกค้าจ่ายเงิน", "หัวหน้าภาคนัดวัน", "เบิกอะไหล่", "คอนเฟิร์มลูกค้า"]
    : ["แอดมินแนบใบเสนอราคา", "ลูกค้าจ่ายเงิน", "หัวหน้าภาคนัดวัน", "คอนเฟิร์มลูกค้า"];
  const why = [offCount ? `อะไหล่นอก ${offCount}` : "", services ? `ค่าบริการ ${services}` : ""].filter(Boolean).join(" · ");
  return (
    <View style={styles.quoteRoute} accessibilityLabel="ใบนี้จะส่งให้แอดมินทำใบเสนอราคา">
      <Text style={styles.quoteRouteTitle}>ใบนี้จะส่งให้แอดมินทำใบเสนอราคา — {why}</Text>
      <Text style={styles.quoteRouteChain}>{chain.join(" → ")}</Text>
    </View>
  );
}

/**
 * อะไหล่พร้อมแค่ไหน — กล่องบนฟอร์มนัดวันเข้า และฟอร์มคอนเฟิร์มออกหน้างาน (แบบที่เจ้าของงานตกลง ต.ค. 69)
 * หัวหน้าภาคเห็นผลเช็คของแอดมินรายตัว ไม่ต้องโทรถาม · ของครบเสมอ (ของหมดค้างที่แอดมินจนของเข้า)
 * ตัวที่อยู่คลังอื่นคือตัวที่หัวหน้าภาคต้องเบิก/โอนเองหลังนัด ให้ถึงก่อนคอนเฟิร์มลูกค้า
 * (เคยบังคับนัดล่วงหน้า 7 วัน — เจ้าของงานยกเลิก ต.ค. 69)
 * แอดมินเห็นกล่องเดียวกันตอนจะโทรคอนเฟิร์ม — ปกติขึ้น "อะไหล่เบิกแล้ว" ทุกตัว ถ้ามีตัวยังไม่ถึงคือยังไม่ควรโทร
 */
/**
 * "หัวหน้าภาคแจ้ง: หาได้ · แหล่ง — รายละเอียด" ในขั้นเช็ค/เบิกของแอดมิน (ตัวอย่างที่อนุมัติ) — สีตามคำตอบ
 * ใบเก่าที่ยังไม่มีคำตอบขึ้น "ยังไม่ระบุ" ให้แอดมินรู้ว่าต้องถามเอง ไม่ใช่ไม่มีบรรทัดแล้วนึกว่าระบบไม่ได้ถาม
 */
function OffTold({ part }: { part: PickedPart }) {
  const tone =
    part.offFound === true
      ? { color: colors.successInk, backgroundColor: colors.successSoft }
      : part.offFound === false
        ? { color: colors.dangerInk, backgroundColor: colors.dangerSoft }
        : { color: colors.textMuted, backgroundColor: colors.background };
  return <Text style={[styles.offTold, tone]}>{part.offAnswerRole ?? "หัวหน้าภาค"}แจ้ง: {offAnswerLine(part)}</Text>;
}

function PartsReady({ order, adminWarehouse, viewer = "supervisor" }: { order: WorkOrder; adminWarehouse: string; viewer?: "supervisor" | "admin" }) {
  if (order.needsParts !== true || order.waitingParts.length === 0) return null;
  // หัวกล่องใช้กฎเดียวกับเซิร์ฟเวอร์ (issueLeftOf) — ของนอกสโตร์ไม่มีเลขใบเบิก นับว่าเบิกแล้วต่อเมื่อแอดมินผ่านขั้นเบิกรอบนี้
  // เดิมนับนอกสโตร์เป็นเบิกแล้วเสมอ หัวกล่องขึ้น "อะไหล่เบิกแล้ว" ทั้งที่กดนัดแล้วใบไปขั้นเบิก (ข้อความเหนือกล่องบอกอีกอย่าง)
  const issuedAll = !issueLeftOf(order);
  const far = order.waitingParts.filter((p) => farPart(p, adminWarehouse));
  const checked = [...order.logs]
    .filter((l) => l.action === "PARTS_SOURCED")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return (
    <View style={[styles.readyBox, far.length > 0 && styles.readyBoxFar]} accessibilityLabel="อะไหล่พร้อมแค่ไหน">
      <Text style={[styles.readyTitle, far.length > 0 && styles.readyTitleFar]}>
        {issuedAll ? "อะไหล่เบิกแล้ว" : far.length ? "อะไหล่ครบ · ต้องโอนจากคลังอื่น" : "อะไหล่ครบ · ยังไม่เบิก"}
      </Text>
      {order.waitingParts.map((p) => {
        const isFar = far.includes(p);
        return (
          <View key={p.sparePartId} style={styles.readyRow}>
            <Ionicons
              name={isFar ? "alert-circle-outline" : "checkmark"}
              size={15}
              color={isFar ? colors.warningInk : colors.success}
            />
            <Text style={styles.readyLine}>
              {partTitle(p)} × {p.quantity} —{" "}
              {p.offCatalog
                ? `หาได้แล้ว (นอกสโตร์${p.offFound && p.offKind ? ` · ${p.offKind}` : ""})`
                : p.requisitionNo
                  ? `เบิกแล้ว · ${p.warehouse ?? "-"} · ${requisitionLine(p)}`
                  : isFar
                    ? viewer === "admin"
                      ? `${p.warehouse} · ของอยู่คลังอื่น — ยังไม่ถึง`
                      : `${p.warehouse} · คุณเบิก/โอนหลังนัด ให้ถึงก่อนคอนเฟิร์มลูกค้า`
                    : `มี · ${p.warehouse ?? adminWarehouse}`}
            </Text>
          </View>
        );
      })}
      {checked ? (
        <Text style={styles.readyMeta}>
          แอดมินเช็คเมื่อ {formatDateTime(checked.createdAt)}
          {checked.byName ? ` · ${checked.byName}` : ""}
        </Text>
      ) : null}
    </View>
  );
}

/** "ออกงานวันนี้" ตัวใหญ่บนสุดของฟอร์มปล่อยงาน — กดแล้วทีมต้องออกวันนี้ */
function TodayHero({ order }: { order: WorkOrder }) {
  return (
    <View style={styles.todayHero} accessibilityLabel="ออกงานวันนี้">
      <Text style={styles.todayHeroBig}>ออกงานวันนี้{order.scheduledTime ? ` · ${order.scheduledTime} น.` : " · ทั้งวัน"}</Text>
      <Text style={styles.todayHeroText}>
        {order.assignedTeam ? `ทีม${order.assignedTeam} · ` : ""}
        {order.branchCode} {order.branchName}
      </Text>
    </View>
  );
}

/**
 * หัวฟอร์มปล่อยงาน — วันที่จะเข้าเป็นวันที่หัวหน้าภาคนัด/ปล่อยไว้เอง หรือถูกเลื่อนมา
 *
 * ถูกเลื่อน (ลูกค้าขอตอนคอนเฟิร์ม · แอดมินเลื่อนวันนัด) = กล่องส้ม บอกว่าเลื่อนเพราะอะไร ใครเลื่อน
 * หัวหน้าภาคต้องเช็คคิวทีมวันใหม่ก่อนกด · ลูกค้าตกลงวันใหม่ทีหลังก็ยังส้ม (คอนเฟิร์มไม่ใช่การเช็คทีม) แต่บอกว่าร้านตกลงแล้ว
 * ไม่ถูกเลื่อน = กล่องเขียว ลูกค้าคอนเฟิร์มแล้ว
 * อ่านจากประวัติ ไม่เก็บซ้ำในใบงาน — ประวัติคือของจริงอยู่แล้ว
 */
function DispatchNote({ order, now }: { order: WorkOrder; now: number }) {
  const move = rescheduledPending(order) ? pendingMove(order) : null;
  const confirm = order.logs
    .filter((l) => l.action === "RESCHEDULED" || l.action === "CONFIRMED")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const moved = !!move;
  // แอดมินเลื่อนแล้วลูกค้าตกลงวันนั้นทีหลัง — ร้านรู้วันใหม่แล้ว เหลือแค่เช็คทีม
  const agreedAfter = !!move && move.action !== "RESCHEDULED" && confirm?.action === "CONFIRMED" && confirm.createdAt > move.createdAt;
  const shown = move ?? confirm;
  const day = order.scheduledAt?.slice(0, 10) ?? null;
  /**
   * ออกงานวันนี้ — ตัวใหญ่บนสุด ย้ำให้หัวหน้าภาครู้ว่ากดแล้วทีมต้องออกวันนี้ (เจ้าของงานขอ ต.ค. 69)
   * "วันนี้" ตามนาฬิกาเซิร์ฟเวอร์ (มือถือตั้งวันผิดต้องไม่บอกว่าออกงานวันนี้) · ปล่อยงานกดได้ทุกเวลาแล้ว ไม่มีเงื่อนไขล็อก
   */
  const today = order.status === "ASSIGNED" && !!day && day === serverDay(now);
  /**
   * วันนัดนี้แอดมินแก้เป็นงานด่วนให้ (นัดหลังเวลาปิด) — บรรทัดเขียวบรรทัดเดียวใต้กล่องคอนเฟิร์ม (ตัวอย่าง urgentNote)
   * ปล่อยงานไม่ต้องใช้สิทธิ์นี้แล้ว แต่หัวหน้าภาคต้องรู้ว่าทำไมใบที่นัดหลังเวลาปิดมาอยู่ตรงนี้ได้ (ใครแก้ ดูในประวัติ)
   */
  const urgentDay = !!day && (order.urgentReleaseFor ?? "").slice(0, 10) === day;
  return (
    <>
    {today ? <TodayHero order={order} /> : null}
    <View style={[styles.dispatchNote, moved && styles.dispatchNoteMoved]}>
      <Ionicons
        name={moved ? "swap-horizontal" : "checkmark-circle"}
        size={16}
        color={moved ? colors.warningInk : colors.successInk}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.dispatchText, { color: moved ? colors.warningInk : colors.successInk }]}>
          {move
            ? move.action === "RESCHEDULED"
              ? move.note ?? move.actionLabel
              : `${move.actionLabel}${move.note ? ` — ${move.note}` : ""}`
            : `ลูกค้าคอนเฟิร์มแล้ว · ${order.status === "INSPECT_DISPATCH" ? "เข้าตรวจ" : "เข้างาน"} ${visitLabel(order)}`}
        </Text>
        {shown ? (
          <Text style={styles.linkedText}>
            {shown.byName ?? "—"} · {formatDateTime(shown.createdAt)}
            {moved ? ` — วันใหม่ ${visitLabel(order)} · เช็คว่าทีมยังว่างวันใหม่ หรือเปลี่ยนทีมด้านล่าง` : ""}
            {agreedAfter ? " · ลูกค้าคอนเฟิร์มวันใหม่แล้ว" : ""}
          </Text>
        ) : null}
      </View>
    </View>
    {urgentDay ? (
      <View style={styles.urgentDayNote} accessibilityLabel="แอดมินแก้เป็นงานด่วน (นัดหลังเวลาปิด) — ลงประวัติใบงานแล้ว">
        <Ionicons name="lock-open-outline" size={15} color={colors.successInk} />
        <Text style={styles.urgentDayText}>แอดมินแก้เป็นงานด่วน (นัดหลังเวลาปิด) — ลงประวัติใบงานแล้ว</Text>
      </View>
    ) : null}
    </>
  );
}

/**
 * ใบเคลมที่ช่างกำลังกรอกในหน้าปิดงาน — ข้อความเท่านั้น (จำในเครื่องผ่าน utils/closeDraft)
 * ไฟล์หลักฐานไม่อยู่ที่นี่แล้ว: ส่งขึ้นเซิร์ฟเวอร์ทันทีที่เลือก (ClaimFileSlot · เคลมก้อน 1)
 */
type ClaimDraft = ClaimPartDraft;

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
 * ใบเคลมอะไหล่เก่าของใบงานนี้ — ทุกคนที่เปิดใบงานเห็น (ผู้ตรวจเคลมใช้หน้าตรวจเคลมแทน · components/claims/ClaimReview)
 *
 * วางข้อมูลเรียงตามฟอร์มเคลมของผู้ขาย คนอ่านไล่ทีละหัวข้อได้เหมือนถือฟอร์มกระดาษ
 * แล้วหลักฐานของอะไหล่ชิ้นนั้นอยู่ติดกัน — ใบที่เปลี่ยนสองชิ้นไม่ต้องเดาว่ารูปไหนของชิ้นไหน
 * หลักฐานของแต่ละแถวตามที่เซิร์ฟเวอร์ตัดสิน (evidenceIds — ตัวเดียวกับที่ PDF และผู้ตรวจเห็น) ไม่กรองด้วยเวลาเองแล้ว
 * รอบที่ถูกตีกลับไปแล้วพับไว้ ("รอบ 1 · ตีกลับ ▸") — เดิมวางเรียงกันทุกรอบ คนอ่านแยกไม่ออกว่าแถวไหนคือสถานะตอนนี้
 */
function ClaimsCard({
  order,
  files,
  showMissed,
  downloads = false,
}: {
  order: WorkOrder;
  files: Attachment[];
  showMissed: boolean;
  /** ผู้ตรวจเคลม (Admin Spare Part / Super Admin รวมดูในฐานะ) — ขึ้นแผงดาวน์โหลดหลักฐานเมื่อมีชิ้นที่ผ่านแล้ว */
  downloads?: boolean;
}) {
  const [viewing, setViewing] = useState<{ items: Attachment[]; at: number } | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const [oldOpen, setOldOpen] = useState(false);

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

  /**
   * ใบเคลมที่เป็นผลปัจจุบัน = แถวล่าสุดของแต่ละชิ้นในงานซ่อมครั้งนี้ (claimRound) — ที่เหลือพับไว้เป็นรอบเก่า
   * เดิมจางทุกแถวยกเว้นแถวแรก ใบที่เคลมสองชิ้นรอบเดียวกันชิ้นที่สองจึงดูเหมือนรอบเก่าที่ไม่ต้องตรวจ
   * และไม่ใช้ "แถวที่ส่งพร้อมกันครั้งล่าสุด" แล้ว (เคลมก้อน 3): รอบสองส่งเฉพาะชิ้นที่ยังไม่ผ่าน
   * ชิ้นที่ผ่านในรอบแรก (ใบเคลมที่ออกไปผู้ขายจริง) จะถูกพับหายไปเป็น "รอบเก่า"
   */
  const parts = roundPartsOf(order);
  const currentIds = new Set(parts.map((p) => p.row.id));
  const latest = parts.map((p) => p.row);
  const older = order.claims.filter((c) => !currentIds.has(c.id));
  const family = order.claimGuide?.plate.family ?? null;
  const olds = oldRoundsOf(order.claims, order.logs, files, family);
  const trail = claimTrailOf(order.claims, order.logs);
  const waitingSince = latest
    .filter((c) => c.status === "PENDING")
    .reduce<string | null>((m, c) => (!m || Date.parse(c.createdAt) > Date.parse(m) ? c.createdAt : m), null);
  // ตอนนี้รอใคร — ท้ายแถบสถานะ (ใบที่จบแล้วไม่มี)
  const tail =
    order.status === "CLAIM_REVIEW"
      ? `รอ Admin Spare Part ตรวจ · ${daysSince(waitingSince)} วัน`
      : order.status === "IN_PROGRESS" && claimRoundOf(order).rejected
        ? "รอช่างแก้"
        : null;

  function block(c: PartClaim, current: boolean) {
    // สถานะที่แอปรุ่นนี้ยังไม่รู้จัก (เซิร์ฟเวอร์ใหม่กว่าแอป) ขึ้นแบบ "รอตรวจ" แทน — อ่านค่าว่างแล้วทั้งหน้าใบงานพัง
    const tone = (CLAIM_STATUS as Record<string, (typeof CLAIM_STATUS)[PartClaim["status"]] | undefined>)[c.status] ?? CLAIM_STATUS.PENDING;
    const round = roundOf(c, order.claims);
    const prev = previousOf(c, order.claims);
    // หลักฐานของแถวนี้ตามที่เซิร์ฟเวอร์ตัดสิน — รูปป้ายรุ่นขึ้นในกล่องข้อมูลเครื่องแล้ว ไม่ซ้ำตรงนี้
    const evidence = evidenceOf(c, files).filter((f) => f.role?.startsWith("CLAIM_"));
    const ts = checkGroupsOf(c, order.claimTroubleshooting, order.claimGuide).groups.filter((g) => g.key === "ts");
    return (
      <View key={c.id} style={[styles.claimBlock, !current && styles.claimBlockOld]}>
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
          รอบ {round} · ส่งเมื่อ {formatDateTime(c.createdAt)}
          {c.reviewedAt ? ` · ตรวจเมื่อ ${formatDateTime(c.reviewedAt)}` : ""}
        </Text>
        <Row label="รหัสตัวที่เสีย" value={c.brokenPartCode ?? "—"} />
        {brokenMatches(c) === false ? (
          <Text style={styles.claimMismatch}>ไม่ตรงกับอะไหล่ที่เปลี่ยนใส่ ({c.partCode}) — ตรวจรหัสก่อนส่งผู้ขาย</Text>
        ) : null}
        <Row label="ยี่ห้อ / รุ่น" value={[c.brand, c.model].filter(Boolean).join(" · ") || "—"} />
        <Row label="หมายเลขเครื่อง" value={c.machineCode ?? "—"} />
        <ClaimMachineSummary
          nameplate={c.nameplate}
          fieldCheck={c.fieldCheck}
          guide={order.claimGuide}
          showMissed={showMissed}
          photo={(() => {
            const at = files.findIndex((f) => f.id === c.nameplate?.photoId);
            return at < 0 ? null : { uri: files[at].thumbnailDataUrl, open: () => setViewing({ items: files, at }) };
          })()}
        />
        <Text style={styles.partsHead}>อาการ/สาเหตุ</Text>
        <Text style={styles.claimText}>{c.symptom}</Text>
        <Text style={styles.partsHead}>ช่างเข้าเช็คอะไรบ้าง จึงระบุว่าควรเปลี่ยนชิ้นนี้</Text>
        <Text style={styles.claimText}>{c.checkNote}</Text>
        <CheckGroups groups={ts} showMissed={showMissed} />
        {evidence.length > 0 ? (
          <>
            <Text style={styles.partsHead}>{current ? "หลักฐานรอบนี้:" : `หลักฐานที่ส่งรอบ ${round}:`}</Text>
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
                  {/* แนบหลังรอบก่อนถูกตีกลับ = ไฟล์ที่ช่างแนบใหม่รอบนี้ */}
                  {current && isNewThisRound(f, prev) ? <Text style={styles.freshBadge}>ใหม่รอบนี้</Text> : null}
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
        {/* ปิดเคลม ไม่ส่งผู้ขาย — ไม่มีใบเคลมให้เปิด (เซิร์ฟเวอร์ไม่ออก PDF) บอกเหตุผลแทนปุ่ม */}
        {c.status === "DECLINED" ? (
          <View style={styles.claimDeclined}>
            <Ionicons name="remove-circle-outline" size={16} color={colors.textMuted} />
            <Text style={styles.claimDeclinedText}>
              ปิดเคลม ไม่ส่งผู้ขาย{c.rejectReason ? `: ${c.rejectReason}` : ""}
              {c.reviewedByName ? ` · ${c.reviewedByName}` : ""}
            </Text>
          </View>
        ) : (
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
        )}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.infoHead}>
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.primaryInk} />
        <Text style={[styles.infoTitle, headingFont]}>เคลมอะไหล่เก่า</Text>
      </View>
      {/* เครื่องเดิมเคลมชิ้นเดิมซ้ำไหม — เปิดหน้าประวัติเคลมกรองให้เลย (แอดมิน/หัวหน้าภาคเท่านั้น · ช่างไม่เห็น) */}
      <ClaimHistoryLinks branchCode={order.branchCode} machineCode={order.machineCode} />
      <ClaimTrail trail={trail} tail={tail} />
      {viewing ? (
        <ImageViewer
          workOrderId={order.id}
          items={viewing.items}
          startIndex={viewing.at}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {latest.map((c) => block(c, true))}
      {/*
       * ดาวน์โหลดหลักฐานส่งผู้ขาย (เคลมก้อน 6) — ไม่ได้มีแค่ตอนเพิ่งกดอนุมัติ: กด "ใบถัดไป →" ไปก่อน โหลดไม่ทัน
       * เบราว์เซอร์กันหน้าต่างใหม่ หรือจะรวบส่งอีเมลทีหลัง ต้องกลับมาเอา zip/วิดีโอของใบนี้ได้เสมอ (ตัวอย่างมี "เปิดดูใบที่ปิดแล้ว")
       * Super Admin ดูในฐานะ Admin Spare Part ไม่มีปุ่มตัดสิน ทางนี้จึงเป็นทางเดียวของเขา · ชิ้นที่ผ่าน = ผลล่าสุดของชิ้นในงานซ่อมครั้งนี้
       * (claimRound — กติกาเดียวกับเซิร์ฟเวอร์) ไม่มีชิ้นผ่านก็ไม่มีแผง: ใบร่างห้ามหลุดไปผู้ขาย
       */}
      {downloads && claimRoundOf(order).parts.some((p) => p.status === "APPROVED") ? (
        <DownloadPanel workOrderId={order.id} code={order.code} />
      ) : null}
      {older.length ? (
        <View style={styles.claimOld} accessibilityLabel="รอบก่อน">
          <TouchableOpacity
            onPress={() => setOldOpen((o) => !o)}
            style={styles.claimOldBtn}
            activeOpacity={0.7}
            accessibilityState={{ expanded: oldOpen }}
          >
            <Text style={styles.claimOldLabel}>
              {olds.length ? oldRoundsLabel(olds, oldOpen) : `รอบก่อน ${oldOpen ? "▾" : "▸"}`}
            </Text>
          </TouchableOpacity>
          {oldOpen ? (
            <>
              {olds.map((r) => (
                <View key={`${r.round}-${r.at}`} style={{ gap: 2 }}>
                  {r.lines.map((l, i) => (
                    <Text
                      key={i}
                      style={[
                        styles.claimOldLine,
                        l.tone === "head" && { color: colors.navy, fontWeight: "700" },
                        l.tone === "ok" && { color: colors.successInk },
                        l.tone === "bad" && { color: colors.dangerInk },
                      ]}
                    >
                      {l.text}
                    </Text>
                  ))}
                </View>
              ))}
              {older.map((c) => block(c, false))}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** ไฟล์ของขั้นงานที่ทำ (รูปก่อน/หลังซ่อม · ป้ายรุ่น · ใบเหลือง) */
type WorkRole = "BEFORE" | "AFTER" | "NAMEPLATE" | "REQUISITION";
/** ไฟล์ของเครื่อง ใช้ร่วมทุกชิ้น (ข้อ ⑥ · ถ่ายก่อนซ่อม) — เคลมก้อน 5 */
const MACHINE_ROLES = ["CLAIM_ERROR_VIDEO", "CLAIM_SYMPTOM"] as const;
/**
 * สิ่งที่ยังขาดหนึ่งอย่างของฟอร์มปิดงาน — key = จุดที่ปุ่ม "พาไป" เลื่อนไปหา · step = ขั้นที่อยู่ (ฟอร์มทีละขั้น)
 * part = ชิ้นในขั้นเคลมทีละชิ้น · shared = ของเครื่อง (ข้อ ⑥) ใช้ร่วมทุกชิ้น นับครั้งเดียว
 */
interface MItem {
  text: string;
  key: string;
  step: 0 | 1 | 2 | 3;
  part?: number;
  shared?: boolean;
}

/** ปุ่มส่งของฟอร์มปิดงาน — แถบ "ส่งไม่สำเร็จ" บอกให้กดปุ่มนี้อีกครั้ง ชื่อต้องตรงกับที่ช่างเห็นบนปุ่มจริง */
const SUBMIT_LABEL = "ยืนยันปิดงาน";
/** ฟอร์มแก้เคลม (ถูกตีกลับแบบชี้ช่อง · เคลมก้อน 4) — ปุ่มส่งเรียกตามที่ช่างกำลังทำ: ส่งเคลมกลับไปให้ตรวจใหม่ */
const FIX_SUBMIT_LABEL = "ส่งเคลมใหม่";
/** บอกว่าส่งไม่สำเร็จแล้วต้องทำอะไรต่อ — ช่างกลัวว่าต้องกรอกใหม่หมดเลยปิดฟอร์มทิ้ง ทั้งที่ทุกอย่างยังอยู่ */
const keptText = `ข้อมูลที่กรอกไว้ยังอยู่ — กด "${SUBMIT_LABEL}" อีกครั้ง`;

function CloseModal({
  visible,
  order,
  files,
  refresh,
  results,
  technicians,
  subTeams,
  onCancel,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  /** ไฟล์ของใบที่การ์ดไฟล์แนบโหลดไว้แล้ว — ช่องไฟล์เคลมโชว์รูปย่อของไฟล์ที่แนบไว้ก่อน */
  files: Attachment[];
  /** โหลดใบงาน + ไฟล์ใหม่เงียบ ๆ — ไฟล์เคลมขึ้นเซิร์ฟเวอร์ทันทีที่เลือก หลักฐานในใบต้องตามทัน */
  refresh: () => Promise<void> | void;
  results: Option[];
  technicians: Technician[];
  /** ทีม outsource ทั้งหมด — ใบงาน SUB เลือกทีมที่เข้าทำจริง */
  subTeams: string[];
  onCancel: () => void;
  onDone: () => void;
}) {
  /**
   * ถูกตีกลับเคลมแล้วมาปิดใหม่ — ค่าที่ปิดรอบก่อน (ผล สรุป คนที่ไป อะไหล่) ยังอยู่ในใบ ดึงมาให้แก้เฉพาะจุด
   * ไม่ใช่ให้กรอกใหม่หมด (เจ้าของงานขอ ต.ค. 69)
   *
   * อ่านจาก claimRound (ผลล่าสุดทีละชิ้นของงานซ่อมครั้งนี้) ไม่ใช่แถวบนสุด (เคลมก้อน 3): "บอร์ดผ่าน สายพานถูกตีกลับ"
   * แถวของบอร์ดอาจขึ้นก่อน แล้วฟอร์มจะคิดว่าไม่ได้ถูกตีกลับ — แถบเหตุผลหาย และอะไหล่ถูกเติมจากรายการเบิกแทนของที่ใช้จริง
   */
  const claimRound = claimRoundOf(order);
  const roundParts = roundPartsOf(order);
  const reclosing = claimRound.rejected;
  /** ทุกชิ้นที่ถูกตีกลับในการตรวจครั้งล่าสุด — ใบที่เคลมสองชิ้นต้องเห็นเหตุผลครบทุกชิ้น */
  const rejectedRows = reclosing ? rejectedRowsOf(order) : [];
  /**
   * ทุกชิ้นที่ผลล่าสุดในงานซ่อมครั้งนี้ยังเป็น "ตีกลับ" — รวมชิ้นที่ช่างเลิกส่งไปรอบก่อนแล้วกลับมาติ๊กส่งใหม่
   * แถบแดงบอกเฉพาะชุดที่ตีกลับครั้งล่าสุด (rejectedRows) แต่เซิร์ฟเวอร์บังคับ "แก้ หรือกดค่าเดิมถูกแล้ว" กับทุกชิ้นที่ผลล่าสุด
   * ยังตีกลับ — ถ้าเหตุผลกับปุ่มขึ้นเฉพาะชุดล่าสุด ชิ้นเก่าโดน 400 ที่บอกให้กดปุ่มซึ่งไม่มีบนจอ
   */
  const stillRejected = new Map(
    reclosing ? roundParts.filter((p) => p.status === "REJECTED").map((p) => [p.row.sparePartId, p.row] as const) : []
  );
  /**
   * ชิ้นที่ผ่าน / ปิดเคลมไปแล้วในงานซ่อมครั้งนี้ — ล็อกไว้ (ตัวอย่างที่เจ้าของงานเลือก lockedLines)
   * ไม่ต้องส่งซ้ำ (เซิร์ฟเวอร์ทิ้งให้อยู่แล้ว) และเอาออกจากอะไหล่ที่ใช้ไม่ได้ — ใบเคลมที่ออกไปผู้ขายแล้วต้องตรงกับของที่ใช้จริง
   */
  const lockedRows = new Map(
    roundParts.filter((p) => isLockedStatus(p.status)).map((p) => [p.row.sparePartId, p.row] as const)
  );
  /**
   * มีชิ้นผ่านแล้ว = ข้อมูลเครื่อง (ป้ายรุ่น · Error) ล็อกไปกับชิ้นนั้น — เซิร์ฟเวอร์ใช้ค่าของแถวที่อนุมัติแทนค่าที่ส่งมา
   * ฟอร์มจึงแสดงแบบอ่านอย่างเดียว ไม่ให้ช่างแก้ค่าที่ไม่ถูกบันทึก (ถ้าค่าผิดจริง ต้องเปิดใบใหม่ ซึ่งเป็นงานซ่อมครั้งใหม่)
   */
  const approvedRow =
    roundParts
      .filter((p) => p.status === "APPROVED")
      .map((p) => p.row)
      .sort((a, b) => b.id - a.id)[0] ?? null;
  const machineLocked = !!claimRound.lockedMachine && !!approvedRow;
  /** Error ของแถวที่อนุมัติ — ล็อกแล้วเปลี่ยนไม่ได้ (ข้อเช็คตาม Error ยังติ๊กของรอบนี้ได้) · ไม่ล็อก/ยี่ห้อไม่มีคู่มือ = null */
  const lockedError = machineLocked ? approvedRow?.fieldCheck?.errorCode ?? null : null;
  const lockedMsg = (p: { sparePartId: number; name: string; partCode: string }) =>
    lockedRows.get(p.sparePartId)?.status === "DECLINED"
      ? `${p.name || p.partCode} ปิดเคลมไปแล้ว — เอาออกจากอะไหล่ที่ใช้ไม่ได้`
      : `${p.name || p.partCode} อนุมัติเคลมไปแล้ว — เอาออกจากอะไหล่ที่ใช้ไม่ได้`;
  /**
   * ฟอร์มแก้เคลม (เคลมก้อน 4): ผู้ตรวจชี้ช่องที่ต้องแก้ไว้ — ขึ้นเฉพาะช่องเหล่านั้นบนสุด ("ต้องแก้ (n)") ที่เหลือพับไว้
   * แถวที่ถูกตีกลับก่อนมีการชี้ช่อง (ไม่มี reviewFlags) ใช้ฟอร์มแบบเดิมทั้งฟอร์ม + "ค่าเดิมถูกแล้ว" ทั้งชิ้น
   * แถวก่อนจ่ายงานครั้งล่าสุด (แจ้งปัญหาหน้างาน/ย้อนขั้นแล้วจ่ายใหม่) ไม่ใช่ฟอร์มแก้ — ต้องถ่ายใหม่ทั้งชุดอยู่แล้ว
   * และเซิร์ฟเวอร์ก็ไม่บังคับช่องของแถวนอกรอบหลักฐาน ถ้าฟอร์มยังบังคับ ช่างจะติดอยู่กับช่องที่ไม่มีใครตรวจ
   */
  const flaggedRows = [...stillRejected.values()].filter(
    (r) => (r.reviewFlags ?? []).length > 0 && (!order.roundStartedAt || r.createdAt >= order.roundStartedAt)
  );
  const fixMode = flaggedRows.length > 0;
  const flaggedIds = new Set(flaggedRows.map((r) => r.sparePartId));
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
  // มีชิ้นที่ล็อกแล้ว = ปิดงานรอบก่อนไปแล้ว อะไหล่ที่ใช้จริงอยู่ในใบ (ไม่ใช่รายการเบิก)
  const keepUsed = reclosing || lockedRows.size > 0;
  /**
   * ของนอกสโตร์ที่มาจากรายการรอ (หัวหน้าภาคจัดหา) ช่างไม่ต้องบอกว่าซื้อจากที่ไหน (เจ้าของงานเลือกข้อ 7) — ชื่อเดียวกับเซิร์ฟเวอร์ (offName)
   * ค่าเติมจากรายการรอไม่เอาคำตอบของหัวหน้าภาคมาด้วย: "หาไม่ได้ · ร้านแถวนี้ไม่มี" ไม่ใช่คำตอบของ "ซื้อจากที่ไหน"
   * ของที่ใช้ไปแล้ว (ปิดซ้ำหลังเคลมถูกตีกลับ) เก็บคำตอบเดิม — ของที่ช่างซื้อเองรอบก่อนไม่ต้องตอบใหม่
   */
  const waitingOffNames = useMemo(
    () => new Set(order.waitingParts.filter((p) => p.offCatalog).map((p) => offNameKey(p.name))),
    [order.waitingParts]
  );
  const fromList = (name: string) => waitingOffNames.has(offNameKey(name));
  const listOff = (rows: OffPart[]) => rows.map((r) => ({ ...r, found: null, kind: "", detail: "" }));
  const initial = splitParts(keepUsed ? order.parts : requisitioned());
  const [parts, setParts] = useState<PickedPart[]>(initial.store);
  const [offParts, setOffParts] = useState<OffPart[]>(keepUsed ? initial.off : listOff(initial.off));
  // ฟอร์มนี้ค้างอยู่ตลอด (ไม่ได้สร้างใหม่ทุกครั้งที่เปิด) — เปิดขึ้นมาแล้วยังว่างให้เติมอีกรอบ
  // เผื่อเบิกของหลังจากเปิดหน้าใบงานไว้แล้ว · ผูกกับรายการที่เบิก ไม่ใช่ตัวใบทั้งก้อน: ใบถูกโหลดใหม่ทุกครั้งที่ไฟล์เคลมขึ้นเสร็จ
  // ถ้าเติมทุกครั้งที่โหลด ช่างที่ลบอะไหล่ออกหมด (ไม่ได้ใช้) จะเห็นรายการเดิมโผล่กลับมาเอง
  const requisitionKey = requisitioned()
    .map((p) => `${p.sparePartId}:${p.quantity}:${p.offCatalog ? 1 : 0}`)
    .join(",");
  useEffect(() => {
    if (!visible || keepUsed) return;
    const next = splitParts(requisitioned());
    setParts((cur) => (cur.length ? cur : next.store));
    setOffParts((cur) => (cur.length ? cur : listOff(next.off)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, requisitionKey]);
  const [drafts, setDrafts] = useState<Record<number, ClaimDraft>>({});
  /**
   * ข้อมูลป้ายรุ่น + เช็คตามคู่มือ ของเคลมในใบนี้ (เครื่องเดียว ใช้ร่วมทุกชิ้น)
   * ถูกตีกลับแล้วปิดใหม่ — ดึงของรอบก่อนมาให้แก้เฉพาะจุด (สแกนใหม่ได้)
   */
  // ข้อมูลเครื่องที่เติมให้: ล็อกแล้วใช้ของแถวที่อนุมัติ · ไม่งั้นของรอบที่ถูกตีกลับ · ใบเก่าใช้แถวล่าสุด
  const priorClaim = (machineLocked ? approvedRow : null) ?? rejectedRows[0] ?? order.claims[0];
  /**
   * ค่าป้ายของรอบก่อนพร้อมสถานะยืนยันทีละช่อง (เคลมก้อน 5) — ช่างยืนยันค่าเหล่านี้กับรูปไปแล้วตอนส่งรอบนั้น
   * ถูกตีกลับเรื่องอื่นแล้วต้องกดยืนยันรุ่น/Serial ซ้ำทุกรอบ ช่างจะกดผ่านโดยไม่ดู — แก้ค่าเมื่อไหร่ค่อยต้องยืนยันใหม่
   * ใบที่ส่งจากฟอร์มติ๊กครั้งเดียว (ไม่มี confirmed) ไม่นับว่ายืนยัน ต้องกดใหม่
   */
  const [plate, setPlate] = useState<PlateDraft>(() => ({
    values: Object.fromEntries(
      (priorClaim?.nameplate?.fields ?? []).map((f) => [
        f.key,
        {
          value: f.value,
          source: f.source,
          crop: f.crop ?? null,
          ...(f.confirmed !== undefined ? { confirmed: f.confirmed } : {}),
          ...(f.needsCheck !== undefined ? { needsCheck: f.needsCheck } : {}),
          ...(f.edited !== undefined ? { edited: f.edited } : {}),
          ...(f.read !== undefined ? { read: f.read } : {}),
        } as PlateValue,
      ])
    ),
  }));
  const [check, setCheck] = useState<ClaimCheckDraft>(() => ({
    errorCode: priorClaim?.fieldCheck?.errorCode ?? null,
    checked: priorClaim?.fieldCheck?.checked ?? [],
  }));
  /**
   * ฟอร์มนี้อยู่ตลอดอายุหน้า และค่าเติมให้ด้านบนทำงานครั้งเดียวตอนสร้าง — ปิดงานสำเร็จแล้วล้างอะไหล่/สรุป/คนที่ไป (finishClosed)
   * ช่างที่เปิดหน้าค้างไว้จนผู้ตรวจตัดสิน (ผ่าน ก. ตีกลับ ข.) จึงเปิดฟอร์มมาว่าง: ไม่มีอะไหล่ ไม่มีช่องเคลมของ ข. ไม่มีบรรทัดล็อกของ ก.
   * แล้วกดส่งได้ 400 "ก. อนุมัติเคลมไปแล้ว — เอาออกจากอะไหล่ที่ใช้ไม่ได้" ทั้งที่ไม่ได้เอาออก
   * เปิดฟอร์มแล้วยังว่าง = เติมจากของที่ใช้จริงในใบ (+ สรุป คนที่ไป) · ชิ้นที่ล็อกต้องอยู่เสมอ (เอาออกไม่ได้อยู่แล้ว) ขาดก็เติม ·
   * Error ล็อกตามแถวที่อนุมัติ — ค่าในฟอร์มเป็นของรอบก่อน (คนละ Error) ให้ตั้งตามแถวนั้น
   */
  const usedKey = order.parts.map((p) => `${p.sparePartId ?? "x"}:${p.quantity}`).join(",");
  const lockedKey = [...lockedRows.keys()].join(",");
  useEffect(() => {
    if (!visible || !keepUsed) return;
    const used = splitParts(order.parts);
    if (!parts.length && !offParts.length) {
      setParts(used.store);
      setOffParts(used.off);
    } else {
      const lost = used.store.filter((p) => lockedRows.has(p.sparePartId) && !parts.some((c) => c.sparePartId === p.sparePartId));
      if (lost.length) setParts((cur) => [...cur, ...lost]);
    }
    if (!note.trim() && order.closeNote) setNote(order.closeNote);
    if (!workerIds.length && !otherWorkers.trim()) {
      setWorkerIds(order.workers.map((w) => w.id).slice(0, 3));
      if (order.otherWorkers) setOtherWorkers(order.otherWorkers);
    }
    if (lockedError && check.errorCode !== lockedError) {
      setCheck({ errorCode: lockedError, checked: approvedRow?.fieldCheck?.checked ?? [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, usedKey, lockedKey, lockedError]);
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
  /**
   * ยี่ห้อที่ช่างกดในช่องอะไหล่ (เครื่องที่ยังไม่รู้ยี่ห้อ — ข้อ 17) — ช่องอะไหล่ที่ใช้ไปกับอะไหล่ที่ยังขาดใช้ค่าเดียวกัน (เครื่องเดียวกัน)
   * อยู่ในร่างฟอร์มด้วย (§14): แอปหลุดแล้วเปิดใหม่ไม่ต้องกดยี่ห้อซ้ำ · ส่งไปจำไว้กับเครื่องตอนปิดงาน
   * ประกัน/ป้ายรุ่น/รายการ Error ในฟอร์มนี้ยังคิดจากยี่ห้อเดิมในใบ ยี่ห้อที่กดนับตั้งแต่ใบถัดไป (I1)
   */
  const [pickedBrand, setPickedBrand] = useState<string | null>(null);
  /** แถวที่อยู่ในใบแล้ว (รอ + ใช้) ปล่อยผ่านแม้อยู่นอกไฟล์ — ของที่ใช้/เบิกไปจริง (D6 · legacy ของ /close และ /follow-up) */
  const onOrder = useMemo(() => onOrderIds(order), [order]);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /**
   * ไฟล์ที่ขึ้นเซิร์ฟเวอร์แล้วในรอบนี้ — ปิดไม่ผ่าน (เช่น ข้อมูลเคลมไม่ครบ) แล้วกดใหม่ต้องไม่ส่งซ้ำ
   * เดิมส่งใหม่ทั้งชุดทุกครั้ง กดซ้ำหลายรอบไฟล์ซ้ำจนเต็มเพดาน แล้วปิดงานไม่ได้อีกเลย (WO-00133)
   * (รูปหน้างาน/ป้ายรุ่น/ใบเหลือง — ไฟล์เคลมส่งทันทีที่เลือกผ่าน useClaimUploads ไม่ผ่านตรงนี้)
   */
  const sentRef = useRef(new Set<PickedAttachment>());
  /**
   * ส่งไม่สำเร็จ — ปักไว้ใต้หัวฟอร์ม (AppModal banner) จนกว่าจะกดส่งครั้งต่อไป ไม่หายเอง
   * เดิมข้อความอยู่ท้ายฟอร์มยาว ช่างที่กดปุ่มตอนอยู่กลางฟอร์มไม่เห็นว่าส่งไม่ผ่าน และไม่รู้ว่าที่กรอกไว้ยังอยู่ไหม
   * lost = คำตอบไม่กลับมาเลย (เน็ตหลุด) · ไม่ใช่ = เซิร์ฟเวอร์ตอบว่าไม่รับพร้อมเหตุผล — เรียกว่าเน็ตหลุดจะพาช่างไปแก้ผิดที่
   */
  const [sendError, setSendError] = useState<{ lost: boolean; message: string | null } | null>(null);
  /** คำอธิบาย "ค่าเดิมถูกแล้ว" ทีละช่องที่ถูกชี้ (คีย์ตาม FixItem.key) — อยู่ในร่างด้วย */
  const [fixKeep, setFixKeep] = useState<Record<string, string | null>>({});
  /** "▸ ส่วนที่ไม่ต้องแก้" — พับไว้ก่อน ช่างเห็นแค่ช่องที่ต้องแก้ · กางเองได้ หรือปุ่มพาไปกางให้เมื่อของที่ขาดอยู่ในนั้น */
  const [foldOpen, setFoldOpen] = useState(false);
  /** กดส่งตอนช่องที่ถูกชี้ยังเหมือนเดิม — ปักแถบเหลืองบอกว่าช่องไหน (ตัวอย่าง blockedText) จนกว่าจะแก้ครบ */
  const [fixBlocked, setFixBlocked] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { user: me } = useAuth();
  /** เวลาที่เปิดฟอร์มรอบนี้ — ใช้แยก "ปิดงานที่เพิ่งส่งไปเมื่อกี้" ออกจากการปิดงานครั้งเก่า (ดู closedByUs) */
  const openedAt = useRef(0);
  useEffect(() => {
    if (visible) openedAt.current = Date.now();
  }, [visible]);

  /** ไฟล์เคลมส่งทันทีที่เลือก — หลักฐานในใบงาน (และจำนวนไฟล์ที่นับเพดาน) ต้องตามทัน ขึ้นเสร็จหรือลบแล้วเลยโหลดใบใหม่ */
  const uploads = useClaimUploads(
    order.id,
    () => void refresh(),
    (e) => void uploadRefused(e)
  );
  // เอาอะไหล่ออกจากรายการที่ใช้ = ไม่เคลมชิ้นนั้นแล้ว — ไฟล์ที่เพิ่งส่งในฟอร์มนี้ของชิ้นนั้นลบทิ้ง (เหมือนปิดเคลม)
  useEffect(() => {
    const ids = new Set(parts.map((p) => p.sparePartId));
    // คีย์ของชิ้นขึ้นต้นด้วยรหัสชิ้น — ไฟล์ของเครื่อง (m:) และไฟล์ขั้นงานที่ทำ (w:) ไม่ผูกชิ้น ไม่เกี่ยว
    const gone = new Set(
      Object.keys(uploads.slots)
        .filter((k) => /^\d+:/.test(k))
        .map((k) => Number(k.split(":")[0]))
        .filter((id) => !ids.has(id))
    );
    gone.forEach((id) => uploads.discardPart(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts]);

  /**
   * ร่างฟอร์ม (utils/closeDraft) — สรุปงาน คนที่ไป ข้อความเคลมทีละชิ้น ค่าป้าย Error และ "ค่าเดิมถูกแล้ว" ที่พิมพ์ค้าง
   * แอปหลุด/ปิดฟอร์มแล้วเปิดใหม่ยังอยู่ (เจ้าของงานขอ ต.ค. 69) · ไม่ต้องมีปุ่มบันทึกร่าง
   *
   * เขียนเฉพาะหลังผู้ใช้แก้อะไรจริง ไม่เขียนตอนเปิดฟอร์ม: เปิดดูเฉย ๆ (หรือคู่มือสอนใช้งานเปิดฟอร์มให้ดู)
   * แล้วการ์ดในงานของฉันขึ้น "กรอกค้างไว้" ทั้งที่ไม่ได้กรอกอะไร ช่างจะไม่เชื่อป้ายนี้อีก
   * วิธีรู้ว่าแก้แล้ว: เทียบกับค่าตอนเปิด (หลังเติมจากร่างเดิม/รอบที่ถูกตีกลับ) — ค่าเติมให้อัตโนมัติไม่นับเป็นการแก้
   */
  const draftKey = `close:${order.id}`;
  const saver = useRef(closeDraftSaver(order.id));
  const [restored, setRestored] = useState(false);
  const baseline = useRef<string | null>(null);
  const touched = useRef(false);
  useEffect(() => {
    if (!visible) {
      saver.current.flush();
      setRestored(false);
      return;
    }
    baseline.current = null;
    touched.current = false;
    let gone = false;
    loadCloseDraft(order.id).then((d) => {
      if (gone) return;
      if (d) {
        if (d.note) setNote(d.note);
        if (d.otherWorkers) setOtherWorkers(d.otherWorkers);
        // ยี่ห้อที่กดไว้ — ใช้เฉพาะตอนเครื่องยังไม่รู้ยี่ห้อ (ระหว่างนั้นมีคนบันทึกยี่ห้อแล้ว ช่องอะไหล่ใช้ยี่ห้อในระบบเอง)
        if (typeof d.machineBrand === "string" && d.machineBrand.trim()) setPickedBrand(d.machineBrand);
        if (d.claims) {
          setDrafts((all) => {
            const next = { ...all };
            for (const [k, v] of Object.entries(d.claims ?? {})) {
              const id = Number(k);
              if (!Number.isInteger(id) || !v || typeof v !== "object") continue;
              const base = draftFor(id);
              next[id] = {
                ...base,
                ...v,
                troubleshooting: Array.isArray(v.troubleshooting) ? v.troubleshooting : base.troubleshooting,
                errorChecked: Array.isArray(v.errorChecked) ? v.errorChecked : base.errorChecked,
                // เหตุผลไม่ส่งเคลมที่อ่านไม่ออก (ร่างเสีย) = ไม่มี — ฟอร์มถามใหม่ ดีกว่าส่งค่าที่เซิร์ฟเวอร์ไม่รับ
                // ร่างรุ่นก่อนก้อน 5 ไม่มีคีย์นี้เลย = ใช้เหตุผลจากการปิดครั้งก่อน (ถ้ามี) ไม่ใช่ถือว่าไม่มีเหตุผล
                skip:
                  v.skip && typeof v.skip === "object" && typeof (v.skip as ClaimSkip).reason === "string"
                    ? { reason: (v.skip as ClaimSkip).reason, note: String((v.skip as ClaimSkip).note ?? "") }
                    : "skip" in v
                      ? null
                      : base.skip,
              };
            }
            return next;
          });
        }
        // ค่าป้ายในร่างต่างจากที่เติมไว้ (สแกน/แก้ไปแล้วรอบก่อน) — ต้องติ๊กตรวจกับรูปใหม่ · เหมือนเดิมเป๊ะก็คงสถานะเดิม
        // ข้อมูลเครื่องล็อกแล้วไม่เอาค่าจากร่าง — ค่าที่ใช้คือของแถวที่อนุมัติเสมอ
        // สถานะยืนยันทีละช่องอยู่ในค่าของร่างเอง (เคลมก้อน 5) — ร่างรุ่นก่อนไม่มี = ยังไม่ได้ยืนยัน ต้องกดใหม่
        const vals = d.plate?.values;
        if (!machineLocked && vals && typeof vals === "object")
          setPlate((p) => (JSON.stringify(vals) === JSON.stringify(p.values) ? p : { ...p, values: vals }));
        // ล็อกแล้วเอาเฉพาะข้อที่ติ๊กจากร่างที่เป็น Error เดียวกัน — Error เปลี่ยนไม่ได้ แต่ข้อเช็คเป็นของการปิดครั้งนี้
        if (d.check && Array.isArray(d.check.checked) && (!machineLocked || d.check.errorCode === lockedError))
          setCheck({ errorCode: d.check.errorCode ?? null, checked: d.check.checked });
        if (d.fixKeep && typeof d.fixKeep === "object" && !Array.isArray(d.fixKeep)) {
          const keeps = Object.fromEntries(
            Object.entries(d.fixKeep).filter(([, v]) => v === null || typeof v === "string")
          ) as Record<string, string | null>;
          setFixKeep(keeps);
        }
      }
      setRestored(true);
    });
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, draftKey]);
  useEffect(() => () => saver.current.flush(), []);

  /**
   * ฟอร์มทีละขั้น (เคลมก้อน 5): งานที่ทำ · เครื่อง · เคลมทีละชิ้น · ส่ง — เปิดเมื่อมีชิ้นที่ส่งเคลม (หรือสาขาในประกันที่ต้องบอกเหตุผล)
   * เปิดแล้วไม่ปิดกลับระหว่างกรอก (ทางเดียว): ช่างเลิกเคลมทุกชิ้นแล้วฟอร์มกลับเป็นหน้ายาว ช่างจะงงว่าแท็บหายไปไหน
   * ใบที่ไม่มีเคลมยังเป็นหน้ายาวหน้าเดียวเหมือนเดิม · ฟอร์มแก้เคลม (ถูกชี้ช่อง) ใช้รายการ "ต้องแก้" แทนขั้น
   */
  const [stepMode, setStepMode] = useState(false);
  const [step, setStep] = useState(0);
  const [partTab, setPartTab] = useState<number | null>(null);
  /** ถ่ายป้ายรุ่นใหม่ในขั้นเครื่อง (แทนรูปจากขั้นงานที่ทำ) — บอกให้รู้ ไม่ทับเงียบ ๆ */
  const [plateRetaken, setPlateRetaken] = useState(false);
  const workSeq = useRef(0);

  // ใช้อะไหล่แล้วต้องมีใบเหลือง — เซิร์ฟเวอร์ก็กันไว้อีกชั้น แต่บอกตั้งแต่ตรงนี้
  // ดีกว่าให้กดบันทึกแล้วค่อยเด้งกลับมาว่าขาดรูป
  // รูปหน้างานคือหลักฐานว่าไปถึงจริงและเจออะไร ต้องมีอย่างน้อยหนึ่ง
  // ก่อน/หลังซ่อมของรอบนี้ อย่างละอย่างน้อยหนึ่ง (เจ้าของงานขอ ต.ค. 69) — เซิร์ฟเวอร์เช็คซ้ำ
  // ใบ PM ใส่แค่รูปหลังทำ (เจ้าของงานขอ ต.ค. 69) — งานตามรอบ เครื่องไม่ได้เสียมา ไม่มีสภาพก่อนทำให้เทียบ
  const isPm = order.jobType === "PM";
  /**
   * ไฟล์ขั้นงานที่ทำของรอบนี้ที่อยู่ในใบงานแล้วก่อนฟอร์มนี้ส่ง (แนบไว้ก่อน · ฟอร์มรอบก่อน) — ไม่นับไฟล์ที่ฟอร์มนี้ส่งเอง (นับจากช่องแทน)
   * ใช้รายการไฟล์ของใบเพราะรู้ทั้ง id และรอบ · ยังไม่ได้โหลดรายการไฟล์ ใช้ตัวนับจากใบงาน
   */
  const sessionIds = new Set(Object.values(uploads.slots).map((sl) => sl.attachmentId).filter((x): x is number => !!x));
  const inRound = (f: { createdAt: string }) => !order.roundStartedAt || f.createdAt >= order.roundStartedAt;
  /** ถ่ายในกล่อง "ถ่ายก่อนซ่อม" (วิดีโอ Error/รูปอาการไม่ผูกชิ้น) — นับเป็นรูปก่อนซ่อมด้วย ไม่ต้องถ่ายซ้ำ */
  const preRepair = order.claimEvidence.filter(
    (e) => e.sparePartId === null && (e.role === "CLAIM_ERROR_VIDEO" || e.role === "CLAIM_SYMPTOM") && !(e.id && uploads.removed.has(e.id))
  );
  const preCount = preRepair.length || order.preRepairCount || 0;
  function serverWork(role: WorkRole) {
    if (files.length) {
      return files.filter((f) => f.role === role && inRound(f) && !uploads.removed.has(f.id) && !sessionIds.has(f.id)).length;
    }
    if (role === "BEFORE") return Math.max(0, (order.beforeCount ?? 0) - (order.preRepairCount ?? 0));
    if (role === "AFTER") return order.afterCount ?? 0;
    if (role === "NAMEPLATE") return order.hasNameplate ? 1 : 0;
    return order.hasRequisitionSlip ? 1 : 0;
  }
  /** ช่องไฟล์ของขั้นงานที่ทำที่ส่งทันทีที่เลือก (ฟอร์มทีละขั้น) — คีย์ w:{ชนิด} */
  const workSlots = (role: WorkRole) =>
    Object.entries(uploads.slots).filter(([k]) => k === `w:${role}` || k.startsWith(`w:${role}:`));
  /** ไฟล์ชนิดนี้ของรอบนี้ทั้งหมด — ในใบแล้ว + ส่งจากฟอร์มนี้ (ไม่นับที่ส่งไม่สำเร็จ) + เลือกไว้รอส่งตอนกดปิด (หน้ายาว) · kept = เฉพาะที่ขึ้นแล้ว */
  function workCount(role: WorkRole, kept = false) {
    const local = role === "BEFORE" ? beforeFiles.length : role === "AFTER" ? afterFiles.length : role === "NAMEPLATE" ? (nameplate ? 1 : 0) : slip ? 1 : 0;
    const sl = workSlots(role).filter(([, x]) => (kept ? x.status === "done" : x.status !== "failed")).length;
    return serverWork(role) + sl + (kept ? 0 : local);
  }
  const slipMissing = parts.length > 0 && workCount("REQUISITION") === 0;
  const beforeMissing = !isPm && workCount("BEFORE") === 0 && preCount === 0;
  const afterMissing = workCount("AFTER") === 0;
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
  // ใบ PM เข้าทำทั้งร้าน ไม่ได้ผูกเครื่องไหน (เจ้าของงานกำหนด ต.ค. 69) — ไม่มีป้ายรุ่นให้ถ่าย · ใบ PM เก่าที่เคยใส่เครื่องก็เหมือนกัน
  const nameplateMissing = !isPm && workCount("NAMEPLATE") === 0;
  // ติ๊กว่าอะไหล่ไม่ครบแต่ไม่ได้บอกว่าขาดตัวไหน — ใบรออะไหล่เปล่า ๆ ไม่มีใครตามของได้
  const followUpMissing = followUp && missing.length === 0;

  /**
   * ร่างใบเคลมของอะไหล่แต่ละชิ้น — ยังไม่เคยแตะ = ค่าเริ่มต้น
   *
   * สาขายังอยู่ในประกันเปิดเคลมไว้ให้เลย (ส่วนใหญ่ต้องเคลม ลืมติ๊กแล้วอะไหล่เก่าถูกทิ้ง
   * คือเสียสิทธิ์ถาวร) ช่างปิดเองได้ถ้าชิ้นนั้นเคลมไม่ได้ · เคยถูกตีกลับ = ดึงข้อความเดิมมาให้แก้
   *
   * ชิ้นที่ปิดงานครั้งก่อนบอกไว้แล้วว่าไม่ส่งเคลม (claimSkips) เริ่มเป็น "ไม่ส่งเคลม" พร้อมเหตุผลเดิม —
   * ชิ้นแบบนี้ไม่มีแถวเคลม ถ้าใช้ค่าเริ่มต้นปกติ ถูกตีกลับชิ้นอื่นแล้วชิ้นนี้กลับมาเปิดเคลมเปล่า ๆ
   * ช่างต้องเลือกเหตุผลซ้ำ ไม่งั้นส่งไม่ได้ ทั้งที่อะไหล่เก่า (เช่น หายไปแล้ว) ไม่มีทางหาหลักฐานมาได้
   * ยังกดกลับมาส่งเคลมได้ถ้าเปลี่ยนใจ · ทางปิดที่ไม่ได้ถามเหตุผล (หัวหน้าภาคปิด/ย้อนหลัง) ไม่มีเหตุผลให้ใช้ต่อ
   */
  function draftFor(id: number): ClaimDraft {
    if (drafts[id]) return drafts[id];
    const prior = order.claims.find((c) => c.sparePartId === id);
    const skipped = prior ? null : priorSkip(id);
    return {
      on: prior ? true : skipped ? false : order.branchWarrantyExpired === false,
      brokenPartCode: prior?.brokenPartCode ?? "",
      symptom: prior?.symptom ?? "",
      checkNote: prior?.checkNote ?? "",
      troubleshooting: prior?.troubleshooting ?? [],
      keep: null,
      // ข้อเช็คตาม Error ของชิ้นนี้ในรอบก่อน (ตีกลับแล้วส่งใหม่ไม่ต้องติ๊กซ้ำ) — แถวก่อนก้อน 5 ใช้ชุดเดียวกันทุกชิ้น
      errorChecked: prior?.fieldCheck?.checked ?? [],
      skip: skipped,
    };
  }
  function priorSkip(id: number): ClaimSkip | null {
    const s = (order.claimSkips ?? []).find((k) => k.sparePartId === id);
    if (!s || !SKIP_REASONS.some((r) => r.key === s.reasonCode)) return null;
    return { reason: s.reasonCode as SkipReason, note: s.note ?? "" };
  }
  function patchDraft(id: number, patch: Partial<ClaimDraft>) {
    setDrafts((all) => ({ ...all, [id]: { ...draftFor(id), ...all[id], ...patch } }));
  }
  /**
   * เปิด/ปิดเคลมชิ้นนี้ — ปิดแล้วไฟล์ของชิ้นนั้นที่ส่งขึ้นในฟอร์มรอบนี้ถูกลบ (ไม่เป็นหลักฐานของใบไหน · ไม่ค้างนับเพดาน)
   * ไฟล์ของเครื่อง (ข้อ ⑥) ไม่ถูกลบ — ใช้ร่วมทุกชิ้น ชิ้นอื่นยังต้องใช้ (คีย์ m: ไม่ผูกชิ้น)
   * skip = เหตุผลที่ไม่ส่งเคลมเมื่อสาขาอยู่ในประกัน (เคลมก้อน 5) ขึ้นในประวัติใบงาน
   */
  function setClaimOn(id: number, on: boolean, skip: ClaimSkip | null = null) {
    touched.current = true;
    patchDraft(id, { on, skip: on ? null : skip });
    if (!on) uploads.discardPart(id);
  }
  /**
   * ชื่อที่ใช้เรียกอะไหล่ในข้อความ (เช่น "เคลม บอร์ดควบคุม: รูปอะไหล่เก่า") — ชื่อไทย ต่อรหัสเฉพาะเมื่อชื่อซ้ำในใบนี้
   * กติกาเดียวกับ partLabel ฝั่งเซิร์ฟเวอร์ ข้อความในฟอร์มกับข้อความที่เซิร์ฟเวอร์ตอบกลับจะเรียกชิ้นเดียวกันด้วยชื่อเดียวกัน
   */
  const partLabel = (p: PickedPart) =>
    parts.filter((x) => x.name === p.name).length > 1 ? `${p.name} (${p.partCode})` : p.name || p.partCode;
  /** หลักฐานชนิดนี้ของชิ้นนี้ที่อยู่ในใบงานแล้ว (ล่าสุด) — แนบไว้ก่อนเปิดฟอร์ม หรือรอบที่ถูกตีกลับ · id null = ของเครื่อง ชิ้นไหนก็ได้ */
  function serverEvidence(id: number | null, role: string) {
    // ไฟล์ที่ฟอร์มนี้เพิ่งลบ (ปิดเคลม/เอาอะไหล่ออก) ไม่นับ แม้ใบงานที่โหลดไว้ยังมี — ไม่งั้นเปิดเคลมกลับแล้วขึ้น "แนบไว้แล้ว"
    const rows = order.claimEvidence.filter(
      (e) => (id === null || e.sparePartId === id) && e.role === role && !(e.id && uploads.removed.has(e.id))
    );
    if (!rows.length) return null;
    const last = rows.reduce((a, b) => ((b.id ?? 0) > (a.id ?? 0) ? b : a));
    // เซิร์ฟเวอร์รุ่นเก่าไม่ส่ง id — หารูปย่อจากไฟล์ล่าสุดชนิดเดียวกันของรอบนี้แทน
    const file =
      (last.id ? files.find((f) => f.id === last.id) : undefined) ??
      [...files]
        .filter(
          (f) =>
            (id === null || f.sparePartId === id) &&
            f.role === role &&
            !uploads.removed.has(f.id) &&
            (!order.roundStartedAt || f.createdAt >= order.roundStartedAt)
        )
        .sort((a, b) => b.id - a.id)[0];
    return { thumb: file?.thumbnailDataUrl ?? null, kind: file?.kind ?? (role.endsWith("VIDEO") ? "VIDEO" : "IMAGE"), count: rows.length, pre: rows.some((r) => r.sparePartId === null) };
  }
  /**
   * ช่องนี้มีหลักฐานแล้ว — กำลังส่งก็นับ (กดปิดงานแล้วระบบรอให้ขึ้นเสร็จก่อน) ส่งไม่สำเร็จไม่นับ
   * kept = นับเฉพาะที่ขึ้นใบงานแล้ว (ตัวเลขบนการ์ดงานของฉัน — ออกจากหน้านี้ระหว่างส่ง ไฟล์ที่ยังไม่ขึ้นเสร็จหาย)
   */
  function hasEvidence(id: number, role: string, kept = false) {
    const slot = uploads.slots[slotKey(id, role)];
    if (slot) return kept ? slot.status === "done" : slot.status !== "failed";
    return !!serverEvidence(id, role);
  }
  /**
   * ไฟล์ของเครื่อง (วิดีโอ Error · รูปอาการ) ใช้ร่วมทุกชิ้น (เคลมก้อน 5 · เจ้าของงานตอบข้อ 2) — ช่องเดียว (m:{ชนิด}) ไม่ผูกชิ้น
   * มีแล้ว = ไฟล์ชนิดนั้นของรอบนี้ ชิ้นไหนก็ได้หรือถ่ายก่อนซ่อม (กติกาเดียวกับเซิร์ฟเวอร์) · เลือกใหม่ในข้อ ⑥ = แทนไฟล์เดิมของทุกชิ้น
   */
  function machineHas(role: string, kept = false) {
    const slot = uploads.slots[`m:${role}`];
    if (slot && (kept ? slot.status === "done" : slot.status !== "failed")) return true;
    return !!serverEvidence(null, role);
  }
  /** Error ที่ใช้จริง — ข้อมูลเครื่องล็อกแล้วเป็นของใบที่อนุมัติ (ช่างเปลี่ยนไม่ได้) */
  const effError = lockedError ?? check.errorCode;
  /** ชื่อวิดีโอของเครื่องตาม Error ที่เลือก / ยี่ห้อ (Oasis · ไม่มี Error ขึ้น = วิดีโออาการตอนเครื่องเดิน) */
  const videoLabel = errorVideoLabel(effError, order.claimGuide?.plate.family ?? null);
  /** สาขาในประกัน — ไม่ส่งเคลมชิ้นไหนต้องบอกเหตุผล (เจ้าของงานตอบข้อ 10) · ไม่รู้/หมด/สาขาบริษัท ไม่ต้อง */
  const needsSkipReason = order.branchWarrantyExpired === false;
  /** สิ่งที่ยังขาดของแต่ละชิ้น — ตรงกับที่เซิร์ฟเวอร์เช็ค บอกตรงนี้ก่อนจะได้ไม่ต้องรอโดนปฏิเสธ (key = ข้อในขั้นเคลมทีละชิ้น) */
  function claimGaps(p: PickedPart, kept = false): { text: string; key: string }[] {
    const d = draftFor(p.sparePartId);
    if (!d.on || lockedRows.has(p.sparePartId)) return [];
    const k = (x: string) => `p:${p.sparePartId}:${x}`;
    const file = (role: string, label: string, key: string) =>
      !kept && uploads.slots[slotKey(p.sparePartId, role)]?.status === "failed"
        ? [{ text: `${label} ส่งไม่สำเร็จ — กดลองใหม่`, key }]
        : hasEvidence(p.sparePartId, role, kept)
          ? []
          : [{ text: label, key }];
    return [
      ...file("CLAIM_PART", "รูปอะไหล่เก่า", k("photo")),
      ...(d.brokenPartCode.trim() ? [] : [{ text: "รหัสอะไหล่ตัวที่เสีย", key: k("broken") }]),
      ...(d.symptom.trim() ? [] : [{ text: "อาการ/สาเหตุ", key: k("symptom") }]),
      ...(order.claimTroubleshooting.every((t) => d.troubleshooting.includes(t)) ? [] : [{ text: "Troubleshooting ให้ครบ", key: k("checks") }]),
      ...(d.checkNote.trim() ? [] : [{ text: "สิ่งที่เข้าเช็ค", key: k("note") }]),
      ...file("CLAIM_CHECK_VIDEO", "วิดีโอการตรวจเช็ค", k("video")),
      // เปิดช่อง "ค่าเดิมถูกแล้ว" แล้วต้องอธิบาย (เซิร์ฟเวอร์รับ 3–300 ตัวอักษร) — ไม่อธิบายก็กดยกเลิกช่องนั้น
      // ชิ้นที่ถูกชี้ช่อง (ก้อน 4) อธิบายทีละช่องในรายการ "ต้องแก้" แทน — ไม่นับช่องทั้งชิ้นแบบเดิมซ้ำ
      ...(d.keep !== null && stillRejected.has(p.sparePartId) && !flaggedIds.has(p.sparePartId) && d.keep.trim().length < 3
        ? [{ text: "คำอธิบาย “ค่าเดิมถูกแล้ว”", key: k("keep") }]
        : []),
    ];
  }
  /** จำนวนข้อของชิ้น (ตัวหารบนแท็บชิ้น) — ①–⑤ ตามยี่ห้อ (Troubleshooting มีเฉพาะยี่ห้อที่บังคับ) + ⑥ ของเครื่อง */
  const partTotal = 5 + (order.claimTroubleshooting.length ? 1 : 0) + 1;
  /** ชิ้นที่ล็อกแล้วไม่อยู่ในขั้นเคลม — ที่เหลือคือแท็บชิ้น (รวมชิ้นที่ไม่ส่งเคลม) */
  const tabParts = parts.filter((p) => !lockedRows.has(p.sparePartId));
  const claimedParts = tabParts.filter((p) => draftFor(p.sparePartId).on);
  const anyClaim = claimedParts.length > 0;
  /** ของเครื่อง (ข้อ ⑥) ที่ยังขาด — ครั้งเดียวทั้งใบ ผูกกับชิ้นแรกที่ส่งเคลม (ตัวอย่าง: นับในชิ้นแรก) */
  function machineEvidenceGap(kept = false): MItem[] {
    if (!anyClaim) return [];
    const missingRoles = MACHINE_ROLES.filter((r) => !machineHas(r, kept));
    if (!missingRoles.length) return [];
    const failed = !kept && MACHINE_ROLES.some((r) => uploads.slots[`m:${r}`]?.status === "failed");
    const labels = missingRoles.map((r) => (r === "CLAIM_ERROR_VIDEO" ? videoLabel : "รูปอาการเสีย")).join(" · ");
    return [
      {
        text: `เคลม ${partLabel(claimedParts[0])}: ${labels}${failed ? " ส่งไม่สำเร็จ — กดลองใหม่" : ""} (ใช้ร่วมทุกชิ้น)`,
        key: "evid",
        step: 2,
        part: claimedParts[0].sparePartId,
        shared: true,
      },
    ];
  }
  /** ข้อมูลเครื่อง (ขั้นเครื่อง) ที่ยังขาด — ป้ายรุ่นยืนยันทีละช่อง + Error · ล็อกไปกับชิ้นที่ผ่านแล้ว = ไม่มีอะไรให้กรอก */
  const machineGaps: { text: string; key: string }[] =
    anyClaim && !machineLocked && order.claimGuide
      ? [
          ...plateGaps(order.claimGuide, plate),
          ...(order.claimGuide.errors.length && !check.errorCode ? [{ text: "Error ที่เครื่องขึ้น", key: "m:error" }] : []),
        ]
      : [];
  const machineTotal = anyClaim && !machineLocked && order.claimGuide ? plateItemCount(order.claimGuide, plate) + (order.claimGuide.errors.length ? 1 : 0) : 0;

  /**
   * รายการ "ต้องแก้" ของฟอร์มแก้เคลม (เคลมก้อน 4) — เฉพาะชิ้นที่ยังติ๊กส่งเคลมอยู่ (ชิ้นที่ช่างเลิกเคลม ช่องของชิ้นนั้นไม่ต้องแก้)
   * ไฟล์ใหม่ = แนบหลังถูกตีกลับ (ในฟอร์มนี้ หรือขึ้นใบงานไปแล้วตอนเปิดฟอร์มครั้งก่อน) · ป้ายรุ่นใหม่นับรูปที่เลือกไว้รอส่งด้วย
   * kept = นับแบบออกจากหน้านี้แล้วกลับมา (ตัวเลข "ยังขาด" ในร่าง) — ไฟล์ที่ยังส่งไม่เสร็จ/รูปป้ายที่ยังไม่ได้ส่งไม่นับ
   */
  const claimedIds = parts.filter((p) => !lockedRows.has(p.sparePartId) && draftFor(p.sparePartId).on).map((p) => p.sparePartId);
  const fixRows = fixMode ? flaggedRows.filter((r) => claimedIds.includes(r.sparePartId)) : [];
  const after = (iso: string | null | undefined, since: string | null) => !!iso && !!since && Date.parse(iso) > Date.parse(since);
  const fixItemsOf = (kept: boolean) =>
    buildFixItems({
      rows: fixRows,
      nameOf: (id) => {
        const p = parts.find((x) => x.sparePartId === id);
        return p ? partLabel(p) : String(id);
      },
      family: order.claimGuide?.plate.family ?? fixRows[0]?.nameplate?.family ?? null,
      errorCode: check.errorCode,
      guide: order.claimGuide,
      draftFor,
      plate,
      check,
      newFile: (ids, role, since, k) => {
        const ok = (sl: { status: string } | undefined) => !!sl && (k ? sl.status === "done" : sl.status !== "failed");
        // ของเครื่อง (ids null) แนบช่องเดียวไม่ผูกชิ้น (m:) — ชิ้นไหนก็ได้ตามกติกาเครื่องเดียวอาการชุดเดียว (เคลมก้อน 5)
        const inForm =
          (ids === null && ok(uploads.slots[`m:${role}`])) || (ids ?? claimedIds).some((id) => ok(uploads.slots[slotKey(id, role)]));
        return (
          inForm ||
          order.claimEvidence.some(
            (e) =>
              e.role === role &&
              (ids === null || (e.sparePartId !== null && ids.includes(e.sparePartId))) &&
              after(e.createdAt, since) &&
              !(e.id && uploads.removed.has(e.id))
          )
        );
      },
      newPlate: (since) => (!kept && !!nameplate) || files.some((f) => f.role === "NAMEPLATE" && after(f.createdAt, since)),
      keeps: fixKeep,
      kept,
    });
  const fixItems = fixItemsOf(false);
  const unresolved = unresolvedOf(fixItems);
  // อ่านหลังรอไฟล์ขึ้นเสร็จ (submit) — ไฟล์ที่ส่งไม่ผ่านทำให้ช่องนั้นกลับเป็น "ยังไม่ได้แก้"
  const fixRef = useRef({ items: fixItems, unresolved });
  fixRef.current = { items: fixItems, unresolved };

  /** ไฟล์ที่ยังต้องขึ้นก่อนสั่งปิด (รูปหน้างาน ป้ายรุ่น ใบเหลือง) — ใช้ทั้งตอนส่งและตอนนับว่าจะเกินเพดานไหม */
  function uploadQueue() {
    const queue: { file: PickedAttachment; role?: string; sparePartId?: number }[] = [
      ...beforeFiles.map((file) => ({ file, role: "BEFORE" })),
      ...afterFiles.map((file) => ({ file, role: "AFTER" })),
      ...(nameplate ? [{ file: nameplate, role: "NAMEPLATE" }] : []),
      ...(slip ? [{ file: slip, role: "REQUISITION" }] : []),
    ];
    return queue.filter((q) => !sentRef.current.has(q.file));
  }
  /**
   * บอกก่อนกดว่าไฟล์จะเกินเพดาน — ไม่ใช่ไปโดนปฏิเสธกลางทางตอนส่งไฟล์
   * ซึ่งไฟล์ก่อนหน้าขึ้นไปแล้วและนับเข้าเพดานด้วย
   */
  const pendingUploads = uploadQueue().length;
  const overLimit =
    order.attachmentLimit !== undefined && (order.attachmentCount ?? 0) + pendingUploads > order.attachmentLimit;

  /**
   * สิ่งที่ยังขาดทั้งฟอร์มในรายการเดียว เรียงตามตำแหน่งในฟอร์ม (บนลงล่าง) — key = ช่องที่ปุ่ม "พาไป" เลื่อนไปหา
   * เดิมมีกล่อง "ยังขาด" สามกล่อง กล่องท้ายฟอร์มบอกแค่ "ข้อมูลเคลมอะไหล่เก่า" ช่างไม่รู้ว่าขาดช่องไหนของชิ้นไหน
   *
   * kept = นับแบบ "ถ้าออกจากหน้านี้แล้วกลับมาเปิดฟอร์มใหม่" สำหรับตัวเลขในร่าง (การ์ดงานของฉัน "ยังขาด n อย่าง ข้อมูลยังอยู่ครบ")
   * รูปที่เลือกไว้แต่ยังไม่ได้กดส่ง · ไฟล์เคลมที่ยังขึ้นไม่เสร็จ · คนที่ติ๊กไว้ อยู่ในหน่วยความจำของหน้านี้เท่านั้น ไม่อยู่ในร่าง
   * ถ้านับว่ามี การ์ดจะบอกว่าข้อมูลอยู่ครบทั้งที่รูปก่อนซ่อมหายไปแล้ว (ถ่ายใหม่หลังซ่อมไม่ได้) — บอกผิดในเรื่องที่แก้ไม่ได้
   */
  function buildMissing(kept: boolean): MItem[] {
    const before = kept ? !isPm && workCount("BEFORE", true) === 0 && preCount === 0 : beforeMissing;
    const after = kept ? workCount("AFTER", true) === 0 : afterMissing;
    const plateShot = kept ? !isPm && workCount("NAMEPLATE", true) === 0 : nameplateMissing;
    const slipShot = kept ? parts.length > 0 && workCount("REQUISITION", true) === 0 : slipMissing;
    // เปิดฟอร์มใหม่ได้คนตามค่าตั้งต้น (ทีม SUB ที่จ่ายไว้ / คนของรอบที่ถูกตีกลับ) + ชื่อที่พิมพ์ไว้ในร่าง
    const workers = !kept
      ? workersMissing
      : isSub
        ? !(reclosing ? order.subTeam : order.assignedTeam)
        : !(reclosing && order.workers.length > 0) && !otherWorkers.trim();
    const w = (text: string, key: string): MItem => ({ text, key, step: 0 });
    return [
      ...(before ? [w("รูปก่อนซ่อม", "BEFORE")] : []),
      ...(after ? [w("รูปหลังซ่อม", "AFTER")] : []),
      ...(plateShot ? [w("รูปป้ายรุ่น", "NAMEPLATE")] : []),
      ...(summaryMissing ? [w("สรุปงานที่ทำ", "summary")] : []),
      ...(workers ? [w(isSub ? "ทีม SUB ที่เข้าทำ" : "ผู้เข้าปฏิบัติงาน", "workers")] : []),
      // ล็อกยี่ห้อ (ข้อ 23 · §14): ปุ่มล่างไม่จาง แถวป้ายแดงจึงเป็นของที่ยังขาด ปุ่ม "พาไป" เลื่อนไปที่ช่องอะไหล่
      // นับเฉพาะตอนอยู่ในหน้านี้ — อะไหล่ที่เพิ่มเองไม่อยู่ในร่าง เปิดใหม่ก็หายไปพร้อมป้าย
      ...(!kept ? brandItems(parts, "parts", "") : []),
      // ชื่อ + ซื้อจากที่ไหน ของที่ช่างซื้อเอง (เจ้าของงานเลือกข้อ 7) — ข้อละแถว ปุ่มพาไปที่กล่องอะไหล่นอก
      ...offPartsMissing(offParts, "bought", fromList).map((t) => w(`อะไหล่นอก ${t}`, "offParts")),
      ...(slipShot ? [w("รูปใบเหลือง", "slip")] : []),
      ...machineGaps.map((g): MItem => ({ text: `ข้อมูลเครื่อง: ${g.text}`, key: g.key, step: 1 })),
      ...tabParts.flatMap((p): MItem[] => {
        const d = draftFor(p.sparePartId);
        // สาขาในประกัน ไม่ส่งเคลมต้องมีเหตุผล (ร่างเก่าที่ปิดเคลมไว้โดยไม่มีเหตุผล) — กติกาเดียวกับเซิร์ฟเวอร์
        if (!d.on && needsSkipReason && !d.skip) {
          return [{ text: `ไม่ส่งเคลม ${partLabel(p)}: ต้องเลือกเหตุผล`, key: `p:${p.sparePartId}:skip`, step: 2, part: p.sparePartId }];
        }
        return claimGaps(p, kept).map((g) => ({ text: `เคลม ${partLabel(p)}: ${g.text}`, key: g.key, step: 2, part: p.sparePartId }));
      }),
      ...machineEvidenceGap(kept),
      // ใบรออะไหล่อยู่ท้ายฟอร์ม (หน้ายาว) — อยู่ท้ายรายการ ปุ่มพาไปจึงไล่จากบนลงล่างตามที่ช่างเห็น
      ...(!kept && followUpMissing ? [w("อะไหล่ที่ยังขาด", "followUp")] : []),
      ...(!kept && followUp ? brandItems(missing, "followUp", "อะไหล่ที่ยังขาด: ") : []),
    ];
  }
  /** แถวที่ต้องเอาออก / ยี่ห้อที่ยังไม่ได้กด ของช่องอะไหล่หนึ่งช่อง → รายการ "ยังขาด" (ขั้นงานที่ทำ) */
  function brandItems(list: PickedPart[], key: string, prefix: string): MItem[] {
    const b = brandBlockers(list, order.partsBrand, pickedBrand, { legacyIds: onOrder });
    return [
      ...b.remove.map((p): MItem => ({ text: `${prefix}เอา ${p.partCode} ออกก่อนส่ง`, key, step: 0 })),
      ...(b.needsBrand
        ? [{ text: `${prefix}เลือกยี่ห้อเครื่อง${order.partsBrand?.machineCode ? ` ${order.partsBrand.machineCode}` : ""}`, key, step: 0 } as MItem]
        : []),
    ];
  }
  const missingList = buildMissing(false);
  // อ่านหลังรอไฟล์เคลมขึ้นเสร็จ (submit) — ค่าในตัวฟังก์ชันเป็นของตอนกด ไม่รู้ว่าไฟล์ที่เพิ่งส่งไม่ผ่าน
  const missingRef = useRef(missingList);
  missingRef.current = missingList;

  /** บันทึกร่างทุกครั้งที่ผู้ใช้แก้ (หน่วง 400 มิลลิวินาที) — ดูเหตุผลที่ draftKey ด้านบน */
  const draftBody: CloseDraft = {
    note,
    otherWorkers,
    ...(pickedBrand ? { machineBrand: pickedBrand } : {}),
    claims: Object.fromEntries(
      parts.filter((p) => !lockedRows.has(p.sparePartId)).map((p) => {
        const { on, brokenPartCode, symptom, checkNote, troubleshooting, keep, errorChecked, skip } = draftFor(p.sparePartId);
        return [String(p.sparePartId), { on, brokenPartCode, symptom, checkNote, troubleshooting, keep, errorChecked, skip }];
      })
    ),
    plate: { values: plate.values },
    check,
    ...(fixMode ? { fixKeep } : {}),
  };
  const draftJson = JSON.stringify(draftBody);
  // ตัวเลขบนการ์ดนับแบบ kept (ดู buildMissing) ไม่ใช่รายการบนปุ่มล่าง · ฟอร์มแก้เคลมนับช่องที่ถูกชี้แต่ยังไม่ได้แก้ด้วย
  const missingJson = JSON.stringify([
    ...buildMissing(true).map((m) => m.text),
    ...(fixMode ? unresolvedOf(fixItemsOf(true)).map((i) => `ต้องแก้: ${i.title}`) : []),
  ]);
  useEffect(() => {
    if (!visible || !restored) return;
    if (baseline.current === null) {
      baseline.current = draftJson;
      return;
    }
    if (draftJson !== baseline.current) touched.current = true;
    if (!touched.current) return;
    saver.current.save({ ...draftBody, missing: JSON.parse(missingJson) as string[], claiming: anyClaim });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, restored, draftJson, missingJson]);

  // ── ฟอร์มทีละขั้น (เคลมก้อน 5) ──
  const claimForm = !fixMode && (anyClaim || (needsSkipReason && tabParts.length > 0));
  useEffect(() => {
    if (!visible) {
      setStepMode(false);
      setStep(0);
      setPartTab(null);
      setPlateRetaken(false);
      return;
    }
    if (claimForm) setStepMode(true);
  }, [visible, claimForm]);
  /**
   * คนที่ไป: เติมช่างที่หัวหน้าภาคจัดไว้ในบอร์ดแผนงาน (ทีมที่รับงาน · วันนัด — เจ้าของงานขอ 3 พ.ย. 69) เปลี่ยนได้ทุกช่อง
   * ขั้นจ่ายงานเก็บแค่ทีม ชื่อคนที่จะไปมีที่เดียวคือแผนวันนั้น · เรียงตามแผน (คนแรก = หัวหน้าทีมวันนั้น) ไม่เกินสามช่อง
   * วันนั้นไม่ได้จัดแผน → ฟอร์มทีละขั้นของช่างเติมตัวเองแบบเดิม (ไม่ต้องหาชื่อตัวเองในรายชื่อทั้งบริษัท)
   * เติมเฉพาะตอนช่องยังว่าง — ผู้ใช้เลือกไปก่อนคำตอบมาถึง หรือปิดซ้ำหลังถูกตีกลับ (ใช้คนเดิม) ไม่ถูกทับ
   * คนในแผนที่ไม่อยู่ในรายชื่อช่างของฟอร์มไม่เติม — ช่องจะโชว์ค่าที่ไม่มีชื่อ
   */
  useEffect(() => {
    if (!visible || isSub || reclosing || !technicians.length || workerIds.length || otherWorkers.trim()) return;
    let gone = false;
    const known = (uid: number) => technicians.some((t) => t.id === uid);
    api
      .get<{ members: { id: number; name: string }[] }>(`/work-orders/${order.id}/plan-crew`, { loadingText: false })
      .then((r) => r.data.members.map((m) => m.id).filter(known).slice(0, 3))
      // ถามแผนไม่ได้ไม่ใช่เรื่องที่ต้องขัดจังหวะ — ฟอร์มยังเลือกคนเองได้
      .catch(() => [] as number[])
      .then((crew) => {
        if (gone) return;
        const fallback = stepMode && me && known(me.id) ? [me.id] : [];
        const next = crew.length ? crew : fallback;
        if (next.length) setWorkerIds((cur) => (cur.length ? cur : next));
      });
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, stepMode, technicians]);
  const curPart = tabParts.some((p) => p.sparePartId === partTab) ? partTab : tabParts[0]?.sparePartId ?? null;
  const SEND_LABEL = anyClaim ? "ยืนยันปิดงาน · ส่งตรวจเคลม" : "ปิดงาน · ไม่ส่งเคลม";
  /**
   * ปุ่มล่างของฟอร์มทีละขั้น (ตัวอย่าง nav): ขั้นนี้ยังขาด → "ยังขาด n อย่าง — พาไป" · ครบ → "ถัดไป: …" · ส่งได้จากขั้น "ส่ง" เท่านั้น
   * ช่างจะได้ผ่านหน้าตรวจก่อนส่งและเปิดดูทุกชิ้น (คำเตือนรหัสตัวเสียไม่ตรงอยู่ในชิ้นนั้น) ไม่ใช่กดส่งจากกลางฟอร์ม
   */
  type Nav =
    | { kind: "go"; item: MItem; label: string }
    | { kind: "next"; step: number; part?: number; label: string }
    | { kind: "send"; label: string };
  function nav(): Nav {
    const go = (list: MItem[]): Nav => ({ kind: "go", item: list[0], label: `ยังขาด ${list.length} อย่าง — พาไป` });
    if (step === 3) return missingList.length ? go(missingList) : { kind: "send", label: SEND_LABEL };
    const curOn = curPart !== null && draftFor(curPart).on;
    const here =
      step === 2
        ? missingList.filter((m) => m.step === 2 && (m.shared ? curOn : m.part === curPart))
        : missingList.filter((m) => m.step === step);
    if (here.length) return go(here);
    if (step === 0) return { kind: "next", step: 1, label: "ถัดไป: ข้อมูลเครื่อง" };
    if (step === 1) {
      const p0 = claimedParts[0];
      return { kind: "next", step: 2, part: p0?.sparePartId, label: p0 ? `ถัดไป: เคลม ${partLabel(p0)}` : "ถัดไป: เคลมทีละชิ้น" };
    }
    const at = tabParts.findIndex((p) => p.sparePartId === curPart);
    const nextPart = tabParts.slice(at + 1).find((p) => draftFor(p.sparePartId).on);
    if (nextPart) return { kind: "next", step: 2, part: nextPart.sparePartId, label: `ถัดไป: เคลม ${partLabel(nextPart)}` };
    const rest = missingList.filter((m) => m.step === 2);
    if (rest.length) return go(rest);
    return { kind: "next", step: 3, label: "ถัดไป: ตรวจก่อนส่ง" };
  }
  const stepNav = stepMode && !fixMode ? nav() : null;
  /** สลับขั้น/ชิ้นแล้วกลับขึ้นบนสุดของขั้นนั้น — ขั้นใหม่ต้องเริ่มอ่านจากหัว ไม่ใช่ค้างตำแหน่งเลื่อนของขั้นเดิม */
  function openStep(i: number, part?: number) {
    setStep(i);
    if (part !== undefined) setPartTab(part);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }
  /**
   * แถบเลิกเคลมใต้แถบขั้น (เจ้าของงานเลือก 3 พ.ย. 69) — ติ๊ก "ส่งอะไหล่เก่าเคลม" แล้วฟอร์มกลายเป็นทีละขั้นที่ขั้น 1
   * ปุ่ม "ไม่ส่งเคลมชิ้นนี้" อยู่ในขั้นเคลมอย่างเดียว ช่างที่ติ๊กผิดหาไม่เจอว่าจะถอยตรงไหน — แถบนี้ปักอยู่ทุกขั้น
   * เฉพาะสาขาหมดประกัน/สาขาบริษัท: สาขาในประกันเปิดเคลมให้เอง (ไม่ใช่ติ๊กผิด) และไม่ส่งต้องมีเหตุผล — ปุ่มในขั้นเคลมถามให้
   */
  const quitBar = stepMode && !fixMode && !needsSkipReason && claimedParts.length > 0;
  /** ชิ้นนี้กรอก/แนบอะไรของเคลมไปแล้วไหม — มีแล้วต้องถามก่อน เพราะเลิกเคลมลบไฟล์ของชิ้นนั้นทิ้ง (setClaimOn) */
  function partHasClaimData(id: number) {
    const d = draftFor(id);
    return (
      !!(d.brokenPartCode.trim() || d.symptom.trim() || d.checkNote.trim() || d.troubleshooting.length || d.errorChecked?.length) ||
      Object.keys(uploads.slots).some((k) => k.startsWith(`${id}:`))
    );
  }
  function quitClaim(p: PickedPart) {
    const go = () => {
      setClaimOn(p.sparePartId, false);
      if (claimedParts.every((c) => c.sparePartId === p.sparePartId)) {
        // ไม่เหลือชิ้นที่ส่งเคลม — กลับเป็นฟอร์มหน้าเดียวแบบก่อนติ๊ก
        // (ต่างจากเลิกในขั้นเคลมที่ยังค้างฟอร์มทีละขั้นไว้: ตรงนั้นแท็บหายกลางทางจะงง ตรงนี้ช่างกดถอยเอง)
        setStepMode(false);
        setStep(0);
        setPartTab(null);
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      } else if (partTab === p.sparePartId) setPartTab(null);
    };
    if (!partHasClaimData(p.sparePartId)) return go();
    showAlert(`เลิกเคลม ${partLabel(p)}?`, "รูปและข้อมูลเคลมของชิ้นนี้ที่กรอกในฟอร์มนี้จะถูกลบ", [
      { text: "ยกเลิก", style: "cancel" },
      { text: "เลิกเคลม", style: "destructive", onPress: go },
    ]);
  }
  /** ตัวนับใต้ชื่อขั้น (ตัวอย่าง tabs) */
  const stepInfos: StepInfo[] = [0, 1, 2, 3].map((i) => {
    const miss = missingList.filter((m) => m.step === i).length;
    if (i === 3) return { count: missingList.length ? `ยังขาด ${missingList.length}` : "พร้อมส่ง", done: missingList.length === 0 };
    if (i === 1) {
      if (!anyClaim) return { count: "ไม่ส่งเคลม", done: true };
      if (machineLocked) return { count: "ล็อกไว้", done: true };
      return { count: `${Math.max(0, machineTotal - miss)}/${machineTotal}`, done: miss === 0 };
    }
    if (i === 2) {
      if (!anyClaim && !miss) return { count: "ไม่ส่งเคลม", done: true };
      const extra = missingList.filter((m) => m.step === 2 && /:(keep|skip)$/.test(m.key)).length;
      const total = claimedParts.length * (partTotal - 1) + (anyClaim ? 1 : 0) + extra;
      return { count: `${Math.max(0, total - miss)}/${total}`, done: miss === 0 };
    }
    const total =
      (isPm ? 0 : 2) + 3 + (offParts.length ? 1 : 0) + (parts.length ? 1 : 0) + (followUp ? 1 : 0);
    return { count: `${Math.max(0, total - miss)}/${total}`, done: miss === 0 };
  });
  /** แท็บชิ้น — "{ชิ้น} {ครบ}/{ทั้งหมด}" (+ ✓) · ไม่ส่งเคลม (ตัวอย่าง partTabs) */
  const sharedMissing = missingList.some((m) => m.shared);
  const partTabInfos = tabParts.map((p) => {
    const d = draftFor(p.sparePartId);
    if (!d.on) return { id: p.sparePartId, name: partLabel(p), count: "ไม่ส่งเคลม", done: !needsSkipReason || !!d.skip, skipped: true };
    const own = missingList.filter((m) => m.part === p.sparePartId && !m.shared);
    const extra = own.filter((m) => /:keep$/.test(m.key)).length;
    const pm = own.length + (sharedMissing ? 1 : 0);
    const total = partTotal + extra;
    return { id: p.sparePartId, name: partLabel(p), count: `${total - pm}/${total}${pm ? "" : " ✓"}`, done: pm === 0, skipped: false };
  });

  /**
   * ปุ่มล่าง "ยังขาด n อย่าง — พาไป" — เลื่อนไปช่องแรกที่ยังขาดแล้วกระพริบกรอบแดง ไม่ส่งอะไรไปเซิร์ฟเวอร์
   * เดิมปุ่มจางกดไม่ได้ ช่างกดแล้วไม่มีอะไรเกิดขึ้น ต้องเลื่อนหาเองว่าขาดตรงไหนในฟอร์มยาวห้าหกจอ
   * ตำแหน่งแต่ละช่องจดจาก onLayout (ช่องที่ซ้อนในกรอบอื่นบวกตำแหน่งกรอบแม่ตอนกด — onLayout ลูกมาก่อนแม่ได้)
   *
   * บนเว็บวัดใหม่ตอนกด ไม่ใช้ค่าที่จดไว้: react-native-web ยิง onLayout เฉพาะตอนกล่องนั้นเปลี่ยนขนาด (ResizeObserver)
   * ไม่ยิงตอนแค่ถูกดันลง — แนบรูป/พิมพ์สรุปยาว/เปิดเคลมอีกชิ้นด้านบนแล้ว ตำแหน่งที่จดของช่องล่าง ๆ เก่าหมด
   * ปุ่มพาไปเลื่อนไปกลางกล่องอื่น กรอบแดงกระพริบอยู่นอกจอ ช่างเห็นว่ากดแล้วไม่มีอะไรเกิดขึ้น (มือถือ onLayout ยิงตอนย้ายด้วย)
   */
  const spots = useRef<Record<string, { y: number; parent?: string }>>({});
  const spotNodes = useRef<Record<string, View | null>>({});
  const spot = (key: string, parent?: string) => ({
    onLayout: (e: { nativeEvent: { layout: { y: number } } }) => {
      spots.current[key] = { y: e.nativeEvent.layout.y, parent };
    },
    ref: (node: View | null) => {
      spotNodes.current[key] = node;
    },
  });
  const spotY = (key: string): number | null => {
    if (Platform.OS === "web") {
      // บนเว็บ ref ของ View คือกล่อง DOM และ getScrollableNode คือกล่องที่เลื่อนจริงของ ScrollView
      const el = spotNodes.current[key] as unknown as HTMLElement | null;
      const box = (scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.();
      if (el && box && typeof el.getBoundingClientRect === "function") {
        return el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      }
    }
    const s = spots.current[key];
    if (!s) return null;
    return s.y + (s.parent ? spotY(s.parent) ?? 0 : 0);
  };
  const [flash, setFlash] = useState<{ key: string; n: number } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash((f) => (f === flash ? null : f)), 2200);
    return () => clearTimeout(t);
  }, [flash]);
  function scrollToSpot(key: string) {
    const y = spotY(key);
    if (y !== null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
    setFlash({ key, n: Date.now() });
  }
  /**
   * ฟอร์มแก้เคลม: ของที่ขาดอยู่ในส่วนที่พับ — กางให้ก่อนแล้วค่อยเลื่อน (ช่องที่พับอยู่ไม่มีบนจอให้เลื่อนไปหา)
   * รอหน้าจอวาดส่วนที่กางเสร็จก่อนวัดตำแหน่ง
   */
  function goTo(key: string) {
    // ฟอร์มทีละขั้น: ของที่ขาดอยู่ขั้น/ชิ้นอื่น — สลับไปก่อนแล้วค่อยเลื่อน (รอหน้าจอวาดขั้นนั้นเสร็จก่อนวัดตำแหน่ง)
    if (stepMode && !fixMode) {
      const item = missingRef.current.find((m) => m.key === key);
      if (item && (item.step !== step || (item.step === 2 && item.part !== undefined && item.part !== curPart))) {
        setStep(item.step);
        if (item.part !== undefined) setPartTab(item.part);
        setTimeout(() => scrollToSpot(key), 150);
        return;
      }
    }
    if (fixMode && !foldOpen && !key.startsWith("fix:")) {
      setFoldOpen(true);
      setTimeout(() => scrollToSpot(key), 120);
      return;
    }
    scrollToSpot(key);
  }
  const flashOn = (key: string) => (flash?.key === key ? <FlashFrame key={flash.n} /> : null);

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
  /** ช่องที่เก็บไฟล์เดียว (ใบเหลือง) — ลากมาหลายไฟล์เก็บไฟล์แรก */
  const dropOne = (files: File[], accept: AcceptKinds, keep: (file: PickedAttachment) => void) =>
    pickOne(async (stage) => (await filesToAttachments(files.slice(0, 1), accept, stage))[0] ?? null, keep);

  /**
   * ไฟล์ขั้นงานที่ทำ — ฟอร์มทีละขั้น (มีเคลม) ส่งขึ้นใบงานทันทีที่เลือก (เคลมก้อน 5) · หน้ายาว (ไม่มีเคลม) เก็บไว้ส่งตอนกดปิดเหมือนเดิม
   * ทำไมต่างกัน: ใบที่มีเคลมถ่ายไฟล์เยอะและกรอกนาน แอปหลุดกลางทางแล้วรูปก่อนซ่อมหาย ถ่ายใหม่ไม่ได้ (ซ่อมไปแล้ว)
   * ใบไม่มีเคลมกรอกจบในจอเดียว คงพฤติกรรมเดิมไว้ ไม่เปลี่ยนสิ่งที่ช่างคุ้น · ดูในฐานะคนอื่นไม่ส่ง (เซิร์ฟเวอร์ไม่รับอยู่แล้ว)
   * รูปป้ายรุ่นใหม่ = ให้ระบบอ่านค่าใหม่ (ขั้นเครื่องใช้รูปนี้ ไม่ต้องถ่ายซ้ำ)
   */
  function addWork(role: WorkRole, picked: PickedAttachment[]) {
    if (!picked.length) return;
    if (stepMode && !fixMode && !me?.viewAs) {
      for (const f of role === "NAMEPLATE" || role === "REQUISITION" ? picked.slice(0, 1) : picked) {
        const key = role === "NAMEPLATE" || role === "REQUISITION" ? `w:${role}` : `w:${role}:${++workSeq.current}`;
        uploads.start(key, f, role, null);
      }
    } else if (role === "BEFORE") setBeforeFiles((v) => [...v, ...picked]);
    else if (role === "AFTER") setAfterFiles((v) => [...v, ...picked]);
    else if (role === "NAMEPLATE") setNameplate(picked[0]);
    else setSlip(picked[0]);
    if (role === "NAMEPLATE" && (anyClaim || fixMode)) void readPlate(picked[0].uri, `local:${picked[0].uri}`);
  }

  /**
   * อ่านป้ายรุ่นจากรูป (OCR บนเว็บ) — ทำเบื้องหลังตั้งแต่ถ่ายรูปป้ายในขั้นงานที่ทำ ถึงขั้นเครื่องค่าก็พร้อมให้ยืนยัน
   * ตัวเทียบรุ่น: รุ่นในใบเคลมที่อนุมัติล่าสุดของเครื่องนี้ ก่อนทะเบียน (ทะเบียนส่วนใหญ่มีแค่ยี่ห้อ · เจ้าของงานตอบข้อ 9)
   * ทะเบียนที่เป็นแค่ยี่ห้อ = ไม่มีรุ่นให้เทียบ — ห้ามเทียบรหัสรุ่นจากรูปกับชื่อยี่ห้อ (แผนรวม S15)
   * read = ค่าที่อ่านได้ตอนนี้ (นับ "แก้แล้ว n ตัว") · ทุกช่องที่อ่านใหม่ต้องยืนยันใหม่ · ช่องที่อ่านไม่ได้คงค่าเดิม (อาจพิมพ์ไว้แล้ว)
   */
  const [ocrStage, setOcrStage] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const ocrTag = useRef<string | null>(null);
  const comparator = order.claimApprovedModel ?? (isBrandOnly(order.machineModel) ? null : order.machineModel ?? null);
  async function readPlate(uri: string, tag: string) {
    if (!order.claimGuide || machineLocked) return;
    ocrTag.current = tag;
    setOcrError(null);
    setOcrStage("กำลังโหลดตัวอ่านป้าย");
    try {
      const read = await readPlatePhoto(uri, order.claimGuide.plate, comparator, (st) => ocrTag.current === tag && setOcrStage(st));
      if (ocrTag.current !== tag) return;
      const fresh = Object.fromEntries(
        Object.entries(read).map(([k, v]) => [k, { ...v, read: v.value, confirmed: false, edited: false } as PlateValue])
      );
      setPlate((p) => ({ ...p, values: { ...p.values, ...fresh } }));
    } catch (e) {
      if (ocrTag.current === tag) setOcrError(e instanceof Error ? e.message : "อ่านป้ายไม่สำเร็จ — พิมพ์เองจากรูปได้");
    } finally {
      if (ocrTag.current === tag) setOcrStage(null);
    }
  }
  /** รูปป้ายของรอบนี้: ที่เลือกในฟอร์มนี้ก่อน · ไม่มีใช้รูปล่าสุดในใบงาน (แนบไว้ก่อนเปิดฟอร์ม) */
  const localPlate = uploads.slots["w:NAMEPLATE"]?.file ?? nameplate;
  const serverPlate =
    [...files].filter((f) => f.role === "NAMEPLATE" && inRound(f) && !uploads.removed.has(f.id)).sort((a, b) => b.id - a.id)[0] ?? null;
  /**
   * รูปป้ายที่ขึ้นใบงานไปก่อนเปิดฟอร์ม — อ่านจากไฟล์จริงในใบ (คำขอ /file ที่อยู่เว็บเดียวกัน ตัวอ่านเปิดรูปได้)
   * อ่านเองครั้งเดียวตอนเปิดขั้นเครื่องโดยยังไม่มีค่า · มีค่าแล้ว (ร่าง/รอบก่อน) ไม่อ่านทับ ช่างกด "ถ่ายใหม่" ถ้าต้องการอ่านใหม่
   */
  useEffect(() => {
    if (!visible || !stepMode || fixMode || step !== 1 || !anyClaim || machineLocked || !order.claimGuide || ocrStage) return;
    if (Object.values(plate.values).some((v) => v?.value)) return;
    if (localPlate) {
      const tag = `local:${localPlate.uri}`;
      if (ocrTag.current !== tag) void readPlate(localPlate.uri, tag);
      return;
    }
    if (!serverPlate || Platform.OS !== "web") return;
    const tag = `aid:${serverPlate.id}`;
    if (ocrTag.current === tag) return;
    ocrTag.current = tag;
    setOcrError(null);
    setOcrStage("กำลังโหลดตัวอ่านป้าย");
    void (async () => {
      try {
        const res = await api.get<Blob>(`/work-orders/${order.id}/attachments/${serverPlate.id}/file`, {
          responseType: "blob",
          loadingText: false,
        });
        // ระหว่างโหลดรูป ช่างถ่ายป้ายใหม่ไปแล้ว — รูปใหม่ชนะ ไม่อ่านรูปเก่าทับค่าที่กำลังอ่านจากรูปใหม่
        if (ocrTag.current !== tag) return;
        await readPlate(URL.createObjectURL(res.data), tag);
      } catch {
        if (ocrTag.current === tag) {
          setOcrError("อ่านป้ายไม่สำเร็จ — พิมพ์เองจากรูปได้");
          setOcrStage(null);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, stepMode, step, anyClaim, localPlate?.uri, serverPlate?.id]);
  /** ระบบไม่มั่นใจรุ่น — บอกว่าเทียบกับอะไรแล้วไม่ตรง (หรือไม่มีอะไรให้เทียบ) */
  const plateDoubt = (value: string) => {
    const tail = "ระบบไม่มั่นใจ ดูกับรูปให้ดี (ระวัง O/0 · S/5 · I/1 · 2/9 · 6/E)";
    if (!comparator) return "ทะเบียนยังไม่มีรุ่นเต็ม — ดูกับรูปทีละตัว (ระวัง O/0 · S/5 · I/1 · 2/9 · 6/E)";
    const fromApproved = !!order.claimApprovedModel;
    if (value.startsWith(comparator.toUpperCase())) return `ส่วนท้ายรุ่นเต็มอ่านได้ไม่ตรงกันทุกรอบ — ${tail}`;
    return fromApproved ? `ไม่ตรงรุ่นในใบเคลมที่อนุมัติของเครื่องนี้ (${comparator}) — ${tail}` : `ไม่ตรงทะเบียน (${comparator}) — ${tail}`;
  };
  /**
   * ถ่ายป้ายใหม่จากขั้นเครื่อง — แทนรูปเดิม (บอกให้รู้) แล้วอ่านค่าใหม่
   * รูปแรกของใบที่ถ่ายจากขั้นนี้ไม่ได้แทนอะไร — ไม่ขึ้น "แทนรูปเดิม" ให้ช่างงงว่ารูปไหนหายไป
   */
  const retakePlate = () => {
    const hadPlate = !!(localPlate || serverPlate || order.hasNameplate);
    pickFor("NAMEPLATE", (stage) => pickImageAttachment(true, stage), (f) => {
      if (hadPlate) setPlateRetaken(true);
      addWork("NAMEPLATE", f);
    });
  };

  /**
   * ปิดงานสำเร็จแล้ว — ล้างฟอร์ม เปิดใบรออะไหล่ (ถ้าติ๊กไว้) แล้วบอกหน้าใบงาน
   * ใช้ทั้งตอนคำตอบกลับมาปกติ และตอนพบว่าคำสั่งปิดรอบก่อนผ่านไปแล้วแต่คำตอบหาย (closedByUs)
   * สองทางต้องเหมือนกันทุกอย่าง ไม่งั้นทางหลังจะลืมเปิดใบรออะไหล่ หรือร่างเก่ากลับมาโผล่ในฟอร์ม
   */
  async function finishClosed() {
    // ส่งไฟล์ขึ้นแล้ว — ปิดไม่ผ่านแล้วกดใหม่ต้องไม่ส่งซ้ำ ที่แนบแล้วนับจาก claimEvidence แทน
    setDrafts({});
    sentRef.current.clear();
    uploads.reset();
    // ร่างที่ค้างในคิวหน่วงต้องทิ้งก่อนล้าง ไม่งั้นถูกเขียนกลับมาหลังปิดงานแล้ว · restored=false หยุดตัวบันทึกร่าง
    // (ล้างช่องด้านล่างทำให้ค่าเปลี่ยน ถ้าตัวบันทึกยังทำงาน ร่างว่างจะถูกเขียนกลับไปแล้วการ์ดขึ้น "กรอกค้างไว้")
    saver.current.cancel();
    clearCloseDraft(order.id);
    touched.current = false;
    setRestored(false);
    setSendError(null);
    setFixKeep({});
    setFoldOpen(false);
    setFixBlocked(false);
    setStep(0);
    setPartTab(null);
    setPlateRetaken(false);
    setOcrError(null);
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
        // ยี่ห้อที่กดไว้ถูกบันทึกกับเครื่องไปแล้วตอนปิดงาน — ส่งซ้ำได้ (ยี่ห้อเดียวกันเซิร์ฟเวอร์ไม่ถือว่าเปลี่ยน)
        // เผื่อปิดงานด้วยแอปที่ไม่ได้ส่ง แล้วใบรออะไหล่โดนถามยี่ห้อ
        const machineBrand = machineBrandToSend(order.partsBrand, pickedBrand);
        await api.post(`/work-orders/${order.id}/follow-up`, {
          parts: missing.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
          ...(machineBrand ? { machineBrand } : {}),
          ...crossBrandField(missing, order.partsBrand, pickedBrand, { legacyIds: onOrder }),
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
    setPickedBrand(null);
    onDone();
  }

  /**
   * กดส่งซ้ำแล้วเซิร์ฟเวอร์ตอบว่าใบนี้ส่งปิดงานไปแล้ว (409 CLOSE_ALREADY_SENT) — คำสั่งปิดรอบก่อนของเราผ่านไปแล้วไหม
   *
   * เน็ตหลุดตอนรอคำตอบ: เซิร์ฟเวอร์ปิดงานไปแล้วแต่ช่างเห็นว่าส่งไม่สำเร็จ แล้วกดใหม่ ถ้านับเป็นความผิดพลาดรอบที่สอง
   * ช่างจะลองซ้ำไม่จบหรือโทรตามแอดมิน — โหลดใบมาดู ถ้าปิดโดยเราหลังเปิดฟอร์มรอบนี้ = ปิดสำเร็จจริง
   * เผื่อนาฬิกามือถือกับเซิร์ฟเวอร์ไม่ตรงกัน 10 นาที (เวลาปิดงานเป็นเวลาเซิร์ฟเวอร์ เวลาเปิดฟอร์มเป็นเวลามือถือ)
   * คืน "other" = คนอื่นปิดไปแล้ว · null = ไม่ใช่กรณีนี้ หรือโหลดใบมาดูไม่ได้ (ขึ้นว่าส่งไม่สำเร็จตามปกติ)
   */
  async function closedByUs(e: unknown): Promise<"us" | "other" | null> {
    const res = (e as { response?: { status?: number; data?: { code?: string } } }).response;
    if (res?.status !== 409 || res.data?.code !== "CLOSE_ALREADY_SENT") return null;
    try {
      const now = (await api.get<WorkOrder>(`/work-orders/${order.id}`)).data;
      if (now.status !== "CLAIM_REVIEW" && now.status !== "DONE") return null;
      // เซิร์ฟเวอร์รุ่นที่ยังไม่ส่ง closedById — เทียบชื่อคนปิดแทน
      const mine = typeof now.closedById === "number" ? now.closedById === me?.id : !!me && now.closedByName === me.name;
      const fresh = !!now.closedAt && Date.parse(now.closedAt) >= openedAt.current - 10 * 60_000;
      return mine && fresh ? "us" : "other";
    } catch {
      return null;
    }
  }

  /**
   * ไฟล์เคลมที่เลือกส่งไม่ผ่านเพราะใบถูกส่งปิดไปแล้ว (409 CLOSE_ALREADY_SENT) — เน็ตหลุดตอนรอคำตอบปิดงาน
   * แล้วช่างเลือกไฟล์ใหม่ก่อนกดซ้ำ: ถ้าคนปิดคือเราเอง = ปิดสำเร็จไปแล้ว ปิดฟอร์มแบบเดียวกับกดส่งซ้ำ
   * ไม่งั้นช่องนั้นค้าง "ส่งไม่สำเร็จ" นับเป็นของที่ยังขาด แล้วปุ่มส่งพาไปช่องนั้นไม่จบ
   */
  async function uploadRefused(e: unknown) {
    const who = await closedByUs(e);
    if (who === "us") {
      await finishClosed();
      showAlert("ปิดงานไปแล้วตั้งแต่ครั้งก่อน", `ไฟล์ที่เลือกใหม่ไม่ได้ส่ง · ${apiErrorMessage(e)}`);
    } else if (who === "other") notifyWorkOrderStale(order.id, apiErrorMessage(e));
  }

  /** ส่งไม่สำเร็จ — ปักแถบไว้บนสุดของฟอร์ม เลื่อนกลับขึ้นไปให้เห็น แล้วบอกซ้ำแบบแจ้งเตือน (มือถือที่ฟอร์มยาว) */
  function failed(e: unknown) {
    const lost = noResponse(e);
    const message = lost ? null : apiErrorMessage(e);
    setSendError({ lost, message });
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    showAlert(lost ? "ส่งไม่สำเร็จ — เน็ตหลุด" : "ส่งไม่สำเร็จ", [message, keptLine()].filter(Boolean).join(" · "));
  }
  /**
   * บรรทัดใต้ "ส่งไม่สำเร็จ" (ตัวอย่าง sendErrText): บอกว่าของที่กรอกไม่หาย นับให้เห็นจริง แล้วบอกขั้นถัดไปตามปุ่มที่อยู่บนจอตอนนี้
   * ช่างที่ส่งไม่ผ่านกลัวว่าต้องกรอกใหม่หมดเลยปิดฟอร์มทิ้ง — ทั้งที่ไฟล์ขึ้นใบงานไปแล้วและข้อความอยู่ในร่าง
   * ปุ่มเปลี่ยนเป็น "ยังขาด…" ได้ถ้าช่างลบช่องไประหว่างนั้น จึงไม่ใช้ชื่อปุ่มส่งตายตัว
   */
  function keptLine(): string {
    if (fixMode) {
      return `สิ่งที่แก้ไว้ยังอยู่ — ${
        unresolved.length ? `ยังไม่ได้แก้ ${unresolved.length} ช่อง — แก้ให้ครบแล้วส่งอีกครั้ง` : `กด “${FIX_SUBMIT_LABEL}” อีกครั้ง`
      }`;
    }
    if (!stepMode) return keptText;
    const workFiles = (["BEFORE", "AFTER", "NAMEPLATE", "REQUISITION"] as WorkRole[]).reduce((n, r) => n + workCount(r), 0);
    const claimIds = new Set([
      ...order.claimEvidence.filter((x) => !(x.id && uploads.removed.has(x.id))).map((x) => x.id ?? -1),
      ...Object.entries(uploads.slots)
        .filter(([k, x]) => !k.startsWith("w:") && x.status === "done" && x.attachmentId)
        .map(([, x]) => x.attachmentId!),
    ]);
    const claimUploading = Object.entries(uploads.slots).filter(([k, x]) => !k.startsWith("w:") && x.status === "uploading").length;
    const fileN = workFiles + claimIds.size + claimUploading;
    const texts =
      (note.trim() ? 1 : 0) +
      claimedParts.reduce((n, p) => {
        const d = draftFor(p.sparePartId);
        return n + (d.brokenPartCode.trim() ? 1 : 0) + (d.symptom.trim() ? 1 : 0) + (d.checkNote.trim() ? 1 : 0);
      }, 0);
    const again = missingList.length
      ? `ตอนนี้ยังขาด ${missingList.length} อย่าง — กรอกให้ครบแล้วส่งอีกครั้ง`
      : step === 3
        ? `กด “${SEND_LABEL}” อีกครั้ง`
        : "กดแท็บ “ส่ง” แล้วส่งอีกครั้ง";
    return `ข้อมูลที่กรอกไว้ยังอยู่: ไฟล์ ${fileN} ไฟล์ · ข้อความ ${texts} ช่อง · ค่าป้าย · ข้อเช็ค — ${again}`;
  }

  /** ปุ่มล่าง: ยังขาด → พาไปช่องแรกที่ขาด (ไม่ส่ง) · ไฟล์เกินเพดาน → พาไปข้อความเตือน · ครบ → ส่ง */
  function press() {
    if (saving) return;
    // ฟอร์มทีละขั้น: ปุ่มเดียวทำตามที่เขียนบนปุ่ม (พาไป · ถัดไป · ส่ง) — ดู nav
    if (stepNav) {
      if (stepNav.kind === "go") return goTo(stepNav.item.key);
      if (stepNav.kind === "next") return openStep(stepNav.step, stepNav.part);
      if (overLimit) return goTo("limit");
      void submit();
      return;
    }
    // ช่องที่ถูกชี้ยังเหมือนเดิม — ไม่ส่ง (เซิร์ฟเวอร์ก็ไม่รับ) ปักแถบบอกว่าช่องไหน แล้วพาไปช่องแรก (ตัวอย่าง sendFix)
    if (unresolved.length) {
      setFixBlocked(true);
      return goTo(`fix:${unresolved[0].key}`);
    }
    if (missingList.length) return goTo(missingList[0].key);
    if (overLimit) return goTo("limit");
    void submit();
  }

  async function submit() {
    setSaving(true);
    setSendError(null);
    try {
      /**
       * ไฟล์เคลมที่ยังส่งไม่จบต้องขึ้นก่อนสั่งปิด — รอ ไม่ส่งซ้ำ (ส่งไปแล้วตั้งแต่ตอนเลือก)
       * ระหว่างรอปุ่มบอก "รอไฟล์ขึ้นอีก n ไฟล์" · ขึ้นไม่สำเร็จ = ยังขาด พาไปช่องนั้นแทนการส่ง
       */
      if (uploads.uploading) {
        await uploads.waitAll();
        // ให้หน้าจอวาดสถานะช่องล่าสุดก่อน แล้วค่อยอ่านรายการที่ขาด
        await new Promise((r) => setTimeout(r, 0));
        const un = fixRef.current.unresolved[0];
        if (un) {
          setFixBlocked(true);
          goTo(`fix:${un.key}`);
          return;
        }
        const gap = missingRef.current[0];
        if (gap) {
          goTo(gap.key);
          return;
        }
      }
      /**
       * ไฟล์ทั้งหมดต้องขึ้นก่อนสั่งปิด
       *
       * เซิร์ฟเวอร์เช็คตอนรับคำสั่งปิดว่ามีรูปหน้างานและใบเหลืองแล้วหรือยัง
       * ส่งไฟล์ทีหลังจะถูกปฏิเสธทั้งที่ไฟล์อยู่ในมือแล้ว
       */
      // ชิ้นที่ล็อกแล้วไม่ส่งซ้ำ (เซิร์ฟเวอร์ทิ้งให้อยู่แล้ว แต่ส่งไปก็เปลืองและทำให้อ่านคำขอสับสน) · ยังอยู่ใน parts
      const claimed = parts.filter((p) => !lockedRows.has(p.sparePartId) && draftFor(p.sparePartId).on);
      const queue = uploadQueue();
      for (const [i, item] of queue.entries()) {
        setBusy(`กำลังส่งไฟล์ ${i + 1}/${queue.length}`);
        await uploadAttachment(order.id, item.file, item.role, item.sparePartId, { index: i, total: queue.length });
        sentRef.current.add(item.file);
      }
      setBusy("กำลังปิดงาน");
      const machineBrand = machineBrandToSend(order.partsBrand, pickedBrand);
      await api.post(`/work-orders/${order.id}/close`, {
        result,
        note: note.trim() || undefined,
        ...(machineBrand ? { machineBrand } : {}),
        parts: parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
        // อะไหล่ที่ใช้ไปที่ยืนยันข้ามยี่ห้อ — ของที่อยู่ในใบอยู่แล้ว (onOrder) ผ่านเป็น legacy ไม่ต้องยืนยัน
        ...crossBrandField(parts, order.partsBrand, pickedBrand, { legacyIds: onOrder }),
        // ของที่ซื้อเองบอกว่าซื้อจากที่ไหน · ของจากรายการรอไม่ส่งคำตอบ (หัวหน้าภาคตอบไว้แล้ว)
        offParts: offPartsPayload(offParts, "bought", fromList),
        workerIds: isSub && !withStaff ? [] : workerIds,
        otherWorkers: otherWorkers.trim() || null,
        ...(isSub ? { subTeam } : {}),
        ...(claimed.length && order.claimGuide
          ? {
              claimNameplate: {
                /**
                 * ยืนยันทีละช่อง (เคลมก้อน 5) — confirmed ส่งทุกช่องเสมอ (true/false) เซิร์ฟเวอร์ใช้ดูว่าเป็นแอปรุ่นใหม่
                 * read/edited ให้ผู้ตรวจเห็นว่าช่างแก้จากที่ระบบอ่านกี่ตัว · ล็อกแล้วเซิร์ฟเวอร์ใช้ป้ายของใบที่อนุมัติแทนอยู่ดี
                 */
                fields: Object.entries(plate.values)
                  .filter(([, v]) => v.value.trim())
                  .map(([key, v]) => ({
                    key,
                    label: order.claimGuide!.plate.lines.flatMap((l) => l.fields).find((f) => f.key === key)?.label ?? key,
                    value: v.value.trim(),
                    source: v.source,
                    crop: v.crop ?? null,
                    confirmed: machineLocked || !!v.confirmed,
                    ...(v.needsCheck !== undefined ? { needsCheck: v.needsCheck } : {}),
                    ...(v.edited !== undefined ? { edited: v.edited } : {}),
                    ...(v.read ? { read: v.read } : {}),
                  })),
              },
              // Error ของเครื่อง (ล็อกแล้วเป็นของแถวที่อนุมัติ) · ข้อที่ติ๊กส่งทีละชิ้น (claims[].errorChecked) — ชุดรวมไว้ให้เซิร์ฟเวอร์รุ่นก่อน
              claimCheck: order.claimGuide.errors.length && effError
                ? {
                    errorCode: effError,
                    checked: [...new Set(claimed.flatMap((p) => draftFor(p.sparePartId).errorChecked ?? []))],
                  }
                : null,
            }
          : {}),
        // ชิ้นในประกันที่ไม่ส่งเคลม + เหตุผล (เคลมก้อน 5) — ลงประวัติใบงาน ผู้ตรวจเห็น "ช่างไม่ส่งเคลม: …"
        ...(() => {
          const skips = parts
            .filter((p) => !lockedRows.has(p.sparePartId))
            .map((p) => ({ p, d: draftFor(p.sparePartId) }))
            .filter(({ d }) => !d.on && d.skip)
            .map(({ p, d }) => ({
              sparePartId: p.sparePartId,
              reason: d.skip!.reason,
              ...(d.skip!.reason === "OTHER" ? { note: d.skip!.note.trim() } : {}),
            }));
          return skips.length ? { claimSkips: skips } : {};
        })(),
        claims: claimed.map((p) => {
          const d = draftFor(p.sparePartId);
          // ข้อเช็คตาม Error ที่ติ๊กในข้อ ④ ของชิ้นนี้ — เฉพาะข้อของ Error ที่เลือกอยู่ (เปลี่ยน Error แล้วข้อเก่าไม่ติดไป)
          const offered = order.claimGuide?.errors.find((e) => e.code === effError)?.checks ?? [];
          const errorChecked = (d.errorChecked ?? []).filter((c) => offered.includes(c));
          const keep =
            stillRejected.has(p.sparePartId) && !flaggedIds.has(p.sparePartId) && d.keep !== null ? d.keep.trim() : "";
          // ชิ้นที่ถูกชี้ช่อง: ตอบทีละช่อง — ส่งเฉพาะช่องที่ไม่ได้แก้ (แก้แล้วคำอธิบายไม่จำเป็น ไม่ต้องให้ผู้ตรวจอ่านซ้ำ)
          const flagKeep = fixRef.current.items
            .filter((i) => i.sparePartId === p.sparePartId && i.explained && !i.changed)
            .map((i) => ({ flag: i.flag, note: (i.keep ?? "").trim() }));
          return {
            sparePartId: p.sparePartId,
            brokenPartCode: d.brokenPartCode.trim(),
            symptom: d.symptom.trim(),
            checkNote: d.checkNote.trim(),
            troubleshooting: d.troubleshooting,
            errorChecked,
            // "ค่าเดิมถูกแล้ว" — ตอบผู้ตรวจแทนการแก้ (เซิร์ฟเวอร์ไม่รับการส่งซ้ำที่ไม่ได้แก้อะไรและไม่ได้อธิบาย)
            // ตีกลับก่อนมีการชี้ช่อง คำอธิบายตอบทั้งชิ้น (flag "ALL")
            ...(keep ? { keep: [{ flag: "ALL", note: keep }] } : flagKeep.length ? { keep: flagKeep } : {}),
          };
        }),
        // ช่องของเครื่องที่ตอบ "ค่าเดิมถูกแล้ว" — ครั้งเดียวทั้งใบ (ใช้ร่วมทุกชิ้น)
        ...(() => {
          const machineKeep = fixRef.current.items
            .filter((i) => i.sparePartId === null && i.explained && !i.changed)
            .map((i) => ({ flag: i.flag, note: (i.keep ?? "").trim() }));
          return machineKeep.length ? { claimMachineKeep: machineKeep } : {};
        })(),
      });
      await finishClosed();
    } catch (e) {
      const who = await closedByUs(e);
      if (who === "us") {
        await finishClosed();
        // ที่ถูกปฏิเสธคือไฟล์ที่เลือกใหม่ก่อนกดซ้ำ ไม่ใช่การปิด — ปิดสำเร็จแล้ว แต่ไฟล์นั้นไม่ได้ขึ้นไป
        // บอกตรง ๆ ไม่งั้นช่างเข้าใจว่าผู้ตรวจเห็นรูปใหม่ที่เพิ่งถ่าย
        if (/\/attachments/.test(String((e as { config?: { url?: string } }).config?.url ?? ""))) {
          showAlert("ปิดงานไปแล้วตั้งแต่ครั้งก่อน", `ไฟล์ที่เลือกใหม่ไม่ได้ส่ง · ${apiErrorMessage(e)}`);
        }
      }
      // คนอื่นปิดไปแล้ว — ให้หน้าใบงานจัดการแบบ 409 ทั่วไป (โหลดใบใหม่ · ปิดฟอร์ม · บอกเหตุผลจากเซิร์ฟเวอร์)
      else if (who === "other") notifyWorkOrderStale(order.id, apiErrorMessage(e));
      /**
       * 409 ที่หน้าใบงานรับไปแล้ว (ถูกย้อนขั้น · เพื่อนร่วมทีมแจ้งปัญหาหน้างาน ฯลฯ) — ฟอร์มถูกปิดพร้อมคำเตือนสีเหลือง
       * และเหตุผลไปแล้ว ถ้าบอก "ส่งไม่สำเร็จ · กด ยืนยันปิดงาน อีกครั้ง" ซ้ำ ช่างได้สองข้อความที่ขัดกัน
       * และถูกสั่งให้กดปุ่มที่หายไปแล้ว · แถบแดงก็ต้องไม่ค้างไว้รอโผล่ตอนเปิดฟอร์มครั้งหน้า
       */
      else if (staleWorkOrderId(e) !== null) setSendError(null);
      else failed(e);
    } finally {
      setSaving(false);
      setBusy(null);
    }
  }

  // ปุ่มล่างไม่จางอีกแล้ว — บอกตรง ๆ ว่ากดแล้วจะเกิดอะไร (พาไปช่องที่ขาด · รอไฟล์ · ส่ง)
  /**
   * สรุปส่วนที่ไม่ต้องแก้ (ตัวอย่าง foldLines) — ขึ้นตอนกางส่วนที่พับ เหนือฟอร์มเดิม ให้เห็นทั้งหมดในไม่กี่บรรทัดก่อนไล่แก้
   */
  const machineFlagged = fixItems.some((i) => i.sparePartId === null);
  const machineSummary = [
    ...plateFields(order.claimGuide?.plate).map((f) => plate.values[f.key]?.value?.trim() ?? ""),
    check.errorCode ? (check.errorCode === "อื่น ๆ" ? "ไม่มี Error ขึ้น" : check.errorCode) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const foldLines = fixMode
    ? [
        `✓ งานที่ทำ — ${results.find((r) => r.value === result)?.label ?? result} · รูปก่อนซ่อม ${workCount("BEFORE") + preCount} · หลังซ่อม ${workCount(
          "AFTER"
        )} · ป้ายรุ่น ${workCount("NAMEPLATE") ? 1 : 0}`,
        ...(!machineFlagged && anyClaim && machineSummary
          ? [`✓ ข้อมูลเครื่อง — ${machineSummary}${machineLocked ? " (ล็อกไว้)" : ""}`]
          : []),
        ...fixRows.flatMap((r) => {
          const p = parts.find((x) => x.sparePartId === r.sparePartId);
          const rest = PART_FLAGS.filter((f) => !partFlagsOf(r).includes(f.key)).map((f) => f.label);
          return p && rest.length ? [`✓ ${partLabel(p)} ช่องอื่น — ${rest.join(" · ")}`] : [];
        }),
        ...parts
          .filter((p) => !lockedRows.has(p.sparePartId) && !draftFor(p.sparePartId).on)
          .map((p) => {
            const sk = draftFor(p.sparePartId).skip;
            return `${partLabel(p)} — ไม่ส่งเคลม${sk ? ` (${skipText(sk)})` : ""}`;
          }),
      ]
    : [];
  // ฟอร์มแก้เคลม: ช่องที่ถูกชี้ยังไม่ได้แก้มาก่อน (ตัวอย่าง fixPrimLabel) — ของที่ขาดอย่างอื่นค่อยตามมา
  // ฟอร์มทีละขั้น: ปุ่มบอกตามขั้น (ยังขาดในขั้นนี้ → พาไป · ครบ → ถัดไป: … · ขั้นส่ง → ส่ง) — ดู nav
  const goLabel = stepNav
    ? stepNav.kind === "go"
      ? stepNav.label
      : null
    : unresolved.length
      ? `ยังไม่ได้แก้: ${unresolved[0].label}${unresolved.length > 1 ? ` และอีก ${unresolved.length - 1} ช่อง` : ""} — พาไป`
      : missingList.length
        ? `ยังขาด ${missingList.length} อย่าง — พาไป`
        : null;
  const submitLabel = stepNav ? stepNav.label : fixMode ? FIX_SUBMIT_LABEL : SUBMIT_LABEL;
  const waitLabel =
    saving && uploads.uploading ? `รอไฟล์ขึ้นอีก ${uploads.uploading} ไฟล์ (${Math.round(uploads.progress * 100)}%)` : null;

  /** ขั้นงานที่ทำ (หน้ายาวใช้ทั้งก้อนนี้) — รูปหน้างาน · ผล · สรุป · คนที่ไป · อะไหล่ · ใบเหลือง · ใบรออะไหล่ */
  /** ชิ้นที่ตัดสินจบแล้วในงานซ่อมครั้งนี้ — พับเหลือบรรทัดเดียว ไม่มีอะไรให้กรอก (ตัวอย่าง lockedLines) */
  const lockedLines = parts
    .filter((p) => lockedRows.has(p.sparePartId))
    .map((p) => {
      const ok = lockedRows.get(p.sparePartId)!.status === "APPROVED";
      return (
        <View key={p.sparePartId} style={styles.claimLocked} accessibilityLabel={`ล็อกไว้ ${p.partCode}`}>
          <Ionicons name="lock-closed-outline" size={16} color={ok ? colors.successInk : colors.textMuted} />
          <Text style={[styles.claimLockedText, { color: ok ? colors.successInk : colors.body }]}>
            {ok
              ? `✓ ${partLabel(p)} ผ่านแล้ว ล็อกไว้`
              : `${partLabel(p)} — ปิดเคลม ไม่ส่งผู้ขาย (${lockedRows.get(p.sparePartId)!.rejectReason ?? "—"})`}
          </Text>
        </View>
      );
    });

  /**
   * หน้ายาว (ใบที่ยังไม่มีชิ้นส่งเคลม): ช่องติ๊กส่งเคลมทีละชิ้นต่อจากใบเหลือง ก่อนใบรออะไหล่ — ติ๊กแล้วฟอร์มเปลี่ยนเป็นทีละขั้น
   * สาขาหมดประกัน/สาขาบริษัทปิดไว้ก่อน (ค่าตั้งต้นที่เจ้าของงานเลือก) ติ๊กได้ถ้าชิ้นนั้นยังเคลมได้
   */
  const claimToggles =
    parts.length > 0 && !stepMode && !fixMode ? (
      <View style={{ gap: spacing.xs }}>
        <Text style={styles.modalLabel}>เคลมอะไหล่เก่า</Text>
        {lockedLines}
        {tabParts.map((p) => (
          <View key={p.sparePartId} style={styles.claimPart} {...spot(`part:${p.sparePartId}`)}>
            <TouchableOpacity
              style={styles.partRow}
              onPress={() => setClaimOn(p.sparePartId, true)}
              activeOpacity={0.7}
              accessibilityLabel={`ส่งอะไหล่เก่าเคลม ${p.partCode}`}
            >
              <Ionicons name="square-outline" size={20} color={colors.textFaint} />
              <Text style={[styles.partCode, { flex: 1, minWidth: 0 }]}>
                ส่งอะไหล่เก่าเคลม · {p.partCode} {p.name}
              </Text>
            </TouchableOpacity>
            <Text style={styles.claimHeader}>ไม่เคลม (สาขาหมดประกันหรือเป็นสาขาบริษัท) — ติ๊กได้ถ้าชิ้นนี้ยังเคลมได้</Text>
          </View>
        ))}
      </View>
    ) : null;

  const workSection = (
    <>
        {/*
          ไฟล์ปิดงานทีละขั้น 1-2-3 อยู่บนสุด (เจ้าของงานขอ ต.ค. 69 — แบบเดียวกับไฟล์ตรวจหน้างาน)
          ช่างถ่ายตอนยืนหน้าเครื่องก่อน แล้วค่อยกรอกสรุป/คนที่ไปตอนนั่งพัก

          ก่อนซ่อม · หลังซ่อม แยกขั้น — ก่อน = เจออะไรตอนไปถึง · หลัง = ซ่อมแล้วเครื่องกลับมาจริง
          คนตรวจย้อนเทียบสองภาพนี้ สรุปงานที่พิมพ์มาเป็นคำบอกเล่า ใบที่ปิดโดยไม่มีรูปตรวจย้อนไม่ได้
        */}
        <View style={{ gap: spacing.sm, marginBottom: spacing.sm }} {...spot("shots")}>
          {/*
            วิดีโอ Error/รูปอาการที่ถ่ายในกล่อง "ถ่ายก่อนซ่อม" คือภาพก่อนซ่อมจริง — นับเป็นรูปก่อนซ่อม ไม่ต้องถ่ายซ้ำ (เจ้าของงานตอบข้อ 2)
            เฉพาะไฟล์จากกล่องนั้น (ไม่ผูกชิ้น) — รูปอาการที่แนบในข้อ ⑥ ตอนปิดงานถ่ายหลังซ่อมแล้ว ไม่ใช่สภาพก่อนซ่อม
          */}
          {!isPm && preCount > 0 ? (
            <View
              style={styles.preUsed}
              {...(workCount("BEFORE") === 0 ? spot("BEFORE", "shots") : {})}
              accessibilityLabel="รูปก่อนซ่อมจากที่ถ่ายก่อนซ่อม"
              {...howtoTarget("close.before")}
            >
              <Text style={styles.preUsedTitle}>✓ ใช้จากที่ถ่ายก่อนซ่อม ({preCount} ไฟล์)</Text>
              <Text style={styles.linkedText}>ไม่ต้องถ่ายซ้ำ — ไฟล์ชุดเดียวกันใช้เป็นหลักฐานเคลมด้วย</Text>
            </View>
          ) : null}
          {([
            ["BEFORE", "ก่อนซ่อม", "สภาพที่เจอตอนไปถึง · อาการ · Error", beforeFiles, setBeforeFiles],
            ["AFTER", "หลังซ่อม", "ซ่อมเสร็จ · ทดสอบแล้วเครื่องกลับมาใช้ได้", afterFiles, setAfterFiles],
          ] as const)
            .filter(([role]) => !(isPm && role === "BEFORE"))
            // ถ่ายก่อนซ่อมไว้แล้วและยังไม่มีรูปก่อนซ่อมของตัวเอง — ไม่ต้องมีช่องให้ถ่ายซ้ำ (ตัวอย่าง beforeFromPre)
            .filter(([role]) => !(role === "BEFORE" && preCount > 0 && workCount("BEFORE") === 0))
            .map(([role, label, hint, list, setList], i) => {
            const add = (files: PickedAttachment[]) => addWork(role, files);
            const already = serverWork(role);
            const count = workCount(role);
            const here = workSlots(role);
            return (
              // ชื่อคงที่แยกก่อน/หลังซ่อม — วิธีใช้ "ปิดงาน" ขั้น 1 ล้อมสองช่องนี้ ไม่ใช่ทั้งกล่องรูป (ป้ายรุ่นมีขั้นของตัวเอง)
              <View key={role} {...spot(role, "shots")} {...howtoTarget(role === "BEFORE" ? "close.before" : "close.after")}>
                <EvidenceStep
                  n={i + 1}
                  title={`รูป / วิดีโอ${label}`}
                  hint={role === "BEFORE" && stepMode && needsSkipReason ? "ไม่ได้ถ่ายตอนก่อนซ่อม — แนบรูปที่มีได้" : hint}
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
                      onPress: () => pickFor(role, pickVideoAttachments, add),
                      accessibilityLabel: `เลือกวิดีโอ${label}`,
                    },
                  ]}
                  footLeft="เลือกได้หลายรูป/หลายคลิปพร้อมกัน · วิดีโอไม่เกิน 60 วินาที"
                  dropHint="รูป · วิดีโอ"
                  onDropFiles={(files) => pickFor(role, (stage) => filesToAttachments(files, { image: true, video: true }, stage), add)}
                >
                  {already > 0 ? <Text style={styles.linkedText}>แนบไว้แล้ว {already} ไฟล์ — เพิ่มได้อีก</Text> : null}
                  <WorkFiles
                    slots={here}
                    label={label}
                    onRemove={(k) => uploads.discard(k)}
                    onRetry={(k) => {
                      const sl = uploads.slots[k];
                      if (sl) uploads.start(k, sl.file, role, null);
                    }}
                  />
                  <FileStrip files={[...list]} onChange={(next) => setList(next)} />
                </EvidenceStep>
                {flashOn(role)}
              </View>
            );
          })}

          {/*
            ป้ายรุ่นต้องถ่ายใหม่ทุกรอบที่ปิดงาน ไว้ไล่เทียบว่าไปถูกเครื่อง

            รุ่นที่กรอกไว้ตอนเปิดใบงานมาจากคนที่อาจไม่ได้ยืนอยู่หน้าเครื่อง
            ส่วนรูปนี้ถ่ายตอนทำงานเสร็จ — รูปเก่าตอบได้แค่ว่าเครื่องรุ่นอะไร
            ไม่ได้ตอบว่าคนที่ไปวันนั้นอยู่หน้าเครื่องตัวไหน
            บอกว่าในระบบบันทึกไว้ว่าอะไร คนถ่ายจะได้เทียบได้ตรงนั้นเลย
            ใบ PM ไม่มีขั้นนี้ — เข้าทำทั้งร้าน ไม่ได้อยู่หน้าเครื่องตัวเดียว
            ฟอร์มที่มีเคลม: รูปเดียวนี้คือรูปที่ระบบอ่านรุ่นกับ Serial (ขั้นเครื่องใช้รูปนี้) — ความละเอียดแบบรูปถ่าย ไม่ใช่แบบเอกสาร
            ตัวอ่านป้ายตั้งค่าไว้กับรูปกว้าง 1600 ลองรูปกว้าง 2400 แล้วอ่านรหัสรุ่นผิด (เทสต์ claim-web ต.ค. 69)
          */}
          {!isPm ? (
            <View {...spot("NAMEPLATE", "shots")} {...howtoTarget("close.nameplate")}>
              <EvidenceStep
                n={3}
                title="ป้ายรุ่นของเครื่อง"
                hint={
                  stepMode && anyClaim
                    ? "รูปเดียว ระบบอ่านรุ่นกับ Serial จากรูปนี้"
                    : order.machineCode
                      ? `ในระบบบันทึกไว้ว่า ${order.machineCode}${order.machineModel ? ` · ${order.machineModel}` : ""}${
                          order.machineCapacityLabel ? ` · ${order.machineCapacityLabel}` : ""
                        } — ถ่ายป้ายรุ่นมาเทียบ`
                      : "ถ่ายป้ายรุ่นของรอบนี้ ไว้ไล่เทียบว่าไปถูกเครื่อง"
                }
                done={!nameplateMissing}
                doneText="✓ แนบแล้ว"
                // ป้ายรุ่นใช้รูปเดียว — แนบแล้วเปลี่ยนได้ด้วยการลบรูปในแถบรูปย่อ (หรือ "ถ่ายใหม่" ในขั้นเครื่อง) ไม่ต้องมีปุ่มเพิ่ม
                canEdit={nameplateMissing}
                busy={picking === "NAMEPLATE" ? busy : null}
                primary={{
                  label: "ถ่ายป้ายรุ่น",
                  icon: "camera",
                  onPress: () => pickFor("NAMEPLATE", (stage) => pickImageAttachment(true, stage, anyClaim ? {} : { doc: true }), (f) => addWork("NAMEPLATE", f)),
                  accessibilityLabel: "ถ่ายป้ายรุ่น",
                }}
                secondary={{
                  label: "เลือกจากอัลบั้ม",
                  icon: "images-outline",
                  onPress: () => pickFor("NAMEPLATE", (stage) => pickImageAttachment(false, stage, anyClaim ? {} : { doc: true }), (f) => addWork("NAMEPLATE", f)),
                  accessibilityLabel: "เลือกรูปป้ายรุ่น",
                }}
                // ป้ายรุ่นใช้รูปเดียว — ลากมาหลายรูปเก็บรูปแรก
                dropHint="รูปป้ายรุ่น 1 รูป"
                onDropFiles={(files) =>
                  pickFor(
                    "NAMEPLATE",
                    (stage) => filesToAttachments(files.slice(0, 1), anyClaim ? { image: true } : { image: true, doc: true }, stage),
                    (f) => addWork("NAMEPLATE", f)
                  )
                }
              >
                {nameplate ? (
                  <FileStrip files={[nameplate]} onChange={(next) => setNameplate(next[0] ?? null)} />
                ) : workSlots("NAMEPLATE").length ? (
                  <WorkFiles
                    slots={workSlots("NAMEPLATE")}
                    label="ป้ายรุ่น"
                    onRemove={(k) => uploads.discard(k)}
                    onRetry={(k) => {
                      const sl = uploads.slots[k];
                      if (sl) uploads.start(k, sl.file, "NAMEPLATE", null);
                    }}
                  />
                ) : serverWork("NAMEPLATE") ? (
                  <Text style={styles.linkedText}>แนบรูปของรอบนี้ไว้แล้ว</Text>
                ) : null}
              </EvidenceStep>
              {flashOn("NAMEPLATE")}
            </View>
          ) : null}
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
        <View {...spot("summary")} {...howtoTarget("close.summary")}>
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
          {flashOn("summary")}
        </View>

        {/*
          ใครไปจริง — งานถูกจ่ายให้ทีม ชื่อคนที่ไปจึงมีอยู่ที่เดียวคือตรงนี้
          ถ้าไม่ถามตอนปิด คำถามว่า "ใครไปสาขานี้" จะตอบไม่ได้เลย
        */}
        <View {...spot("workers")} {...howtoTarget("close.workers")}>
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
                onChangeText={setOtherWorkers}
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
                    hint: techPickHint(t),
                  }))}
              />
            </View>
          ))}
          {isSub ? null : (
            <TextInput
              style={[styles.modalInput, styles.modalInputLine]}
              value={otherWorkers}
              onChangeText={setOtherWorkers}
              placeholder="คนอื่นที่ไปด้วยแต่ไม่มีบัญชีในระบบ (ไม่บังคับ)"
              placeholderTextColor={colors.textFaint}
              accessibilityLabel="คนอื่นที่ไปด้วย"
            />
          )}
          {workersMissing && !isSub ? (
            <Text style={styles.warn}>ต้องระบุอย่างน้อยหนึ่งคนว่าใครเข้าไปทำ</Text>
          ) : null}
          {flashOn("workers")}
        </View>

        {/*
          อะไหล่ · ใบเหลือง · เคลม อยู่ต่อจากรูปหน้างาน สรุปงาน และคนที่ไป (รูปอยู่บนสุดเพราะถ่ายตอนยืนหน้าเครื่อง)
          แต่อยู่ก่อนใบรออะไหล่ — เคลมขึ้นทีละชิ้นตามรายการอะไหล่ที่ใช้ จึงต้องอยู่ติดรายการนั้น
          เดิมอยู่ท้ายฟอร์ม ช่างเลื่อนหาไม่เจอว่าต้องส่งเคลมตรงไหน (เจ้าของงานแจ้ง ต.ค. 69)
        */}
        <View {...spot("parts")} {...howtoTarget("close.parts")}>
          <PartPicker
            parts={parts}
            onChange={setParts}
            label="อะไหล่ที่ใช้ไป"
            locked={Object.fromEntries(parts.filter((p) => lockedRows.has(p.sparePartId)).map((p) => [p.sparePartId, lockedMsg(p)]))}
            brand={order.partsBrand}
            chosenBrand={pickedBrand}
            onBrandChosen={setPickedBrand}
            legacyIds={onOrder}
            saveWhen="ตอนปิดงาน"
            noResultHints={[
              "ตัวที่ใช้จริงไม่มีในไฟล์นี้: ใส่ที่ “อะไหล่นอกสโตร์ที่ใช้” ด้านล่าง",
              "ยี่ห้อในระบบไม่ตรงกับเครื่องจริง? ถ่ายป้ายเครื่องแล้วบอกหัวหน้าภาค — หัวหน้าภาคแก้ยี่ห้อเครื่องให้",
            ]}
          />
          {flashOn("parts")}
        </View>
        <View {...spot("offParts")}>
          <OffPartEditor
            rows={offParts}
            onChange={setOffParts}
            title="อะไหล่นอกสโตร์ที่ใช้"
            ask="bought"
            exempt={fromList}
            highlight={flash?.key === "offParts"}
          />
          {flashOn("offParts")}
        </View>

        {/*
          ใบเหลืองคือหลักฐานว่าของที่หายไปจากคลังไปอยู่ที่เครื่องตัวไหน
          ถามเฉพาะตอนที่มีอะไหล่จริง งานที่ไม่ได้เปลี่ยนอะไรไม่มีใบเบิกให้ถ่าย
        */}
        {parts.length > 0 ? (
          <View {...spot("slip")}>
            <FileDropZone
              hint="รูปใบเหลือง 1 รูป"
              disabled={!!busy}
              label="วางรูปใบเหลือง"
              onFiles={(files) => dropOne(files, { image: true, doc: true }, (f) => addWork("REQUISITION", [f]))}
            >
              <Text style={styles.modalLabel}>รูปใบเบิกอะไหล่ (ใบเหลือง)</Text>
              {serverWork("REQUISITION") > 0 && !slip && !workSlots("REQUISITION").length ? (
                <Text style={styles.linkedText}>
                  แนบไว้แล้วในใบงานนี้ — ถ่ายใหม่ได้ถ้าเบิกเพิ่มรอบนี้
                </Text>
              ) : null}
              <WorkFiles
                slots={workSlots("REQUISITION")}
                label="ใบเหลือง"
                onRemove={(k) => uploads.discard(k)}
                onRetry={(k) => {
                  const sl = uploads.slots[k];
                  if (sl) uploads.start(k, sl.file, "REQUISITION", null);
                }}
              />
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
              ) : busy && picking === null ? (
                <View style={styles.slipRow}>
                  <Spinner color={colors.primary} size="small" />
                  <Text style={styles.linkedText}>{busy}…</Text>
                </View>
              ) : workSlots("REQUISITION").length ? null : (
                <View style={styles.options}>
                  {Platform.OS !== "web" ? (
                    <TouchableOpacity
                      style={styles.option}
                      onPress={() => pickOne((stage) => pickImageAttachment(true, stage, { doc: true }), (f) => addWork("REQUISITION", [f]))}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.optionText}>ถ่ายใบเหลือง</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.option}
                    onPress={() => pickOne((stage) => pickImageAttachment(false, stage, { doc: true }), (f) => addWork("REQUISITION", [f]))}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.optionText}>เลือกรูปใบเหลือง</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!slip && !busy && !workSlots("REQUISITION").length ? <DropHint text="หรือลากรูปใบเหลืองมาวางตรงนี้" /> : null}
            </FileDropZone>
            {slipMissing ? (
              <Text style={styles.warn}>
                ใช้อะไหล่แล้วต้องแนบรูปใบเบิก (ใบเหลือง) ก่อนถึงจะปิดงานได้
              </Text>
            ) : null}
            {flashOn("slip")}
          </View>
        ) : null}

        {claimToggles}

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
        <View {...spot("followUp")}>
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
              <PartPicker
                parts={missing}
                onChange={setMissing}
                label="อะไหล่ที่ยังขาด"
                brand={order.partsBrand}
                chosenBrand={pickedBrand}
                onBrandChosen={setPickedBrand}
                legacyIds={onOrder}
                saveWhen="ตอนปิดงาน"
                // ฟอร์มนี้ช่างเป็นคนกรอก — ทางออกแบบช่าง ให้ตรงกับช่อง "อะไหล่ที่ใช้ไป" ข้างบน (ค่าตั้งต้นของช่องพูดกับหัวหน้าภาค)
                noResultHints={[
                  "ตัวที่ต้องใช้ไม่มีในไฟล์นี้: เขียนชื่อไว้ใน “สรุปงานที่ทำ” แล้วบอกหัวหน้าภาค — หัวหน้าภาคจะตัดสินใจต่อ",
                  "ยี่ห้อในระบบไม่ตรงกับเครื่องจริง? ถ่ายป้ายเครื่องแล้วบอกหัวหน้าภาค — หัวหน้าภาคแก้ยี่ห้อเครื่องให้",
                ]}
              />
              <Text style={styles.linkedText}>
                ใบใหม่ไปอยู่ที่แอดมิน สถานะ “แอดมิน · เบิกอะไหล่” และลิงก์กับใบนี้
              </Text>
            </>
          ) : null}
          {flashOn("followUp")}
        </View>


    </>
  );

  /** ขั้นเครื่อง — ข้อมูลเครื่องสำหรับเคลม ใช้ร่วมทุกชิ้น */
  const machineSection =
    anyClaim && order.claimGuide ? (
      <MachineStep
        guide={order.claimGuide}
        plate={plate}
        onPlate={setPlate}
        errorCode={check.errorCode}
        onError={(code) => setCheck({ errorCode: code, checked: [] })}
        machineType={order.machineType}
        symptom={order.symptom}
        doubt={plateDoubt}
        photo={
          localPlate
            ? { uri: localPlate.thumbnailUri ?? localPlate.uri, retaken: plateRetaken }
            : serverPlate || order.hasNameplate
              ? { uri: serverPlate?.thumbnailDataUrl ?? null, retaken: plateRetaken }
              : null
        }
        onRetake={retakePlate}
        ocrStage={ocrStage}
        ocrError={ocrError}
        locked={machineLocked && approvedRow ? { row: approvedRow, byParts: claimRound.lockedMachine!.byParts } : null}
        readOnly={!!me?.viewAs}
        spot={(k) => spot(k)}
        flashOn={flashOn}
      />
    ) : (
      <Text style={styles.linkedText}>ไม่ส่งเคลม</Text>
    );

  /** ข้อ ⑥ ของเครื่อง (ใช้ร่วมทุกชิ้น) — ถ่ายไว้ตอนก่อนซ่อม / แนบแล้ว / เปลี่ยนแล้ว (ตัวอย่าง evidFrom) */
  const [machineChanging, setMachineChanging] = useState(false);
  // ไฟล์ใหม่ขึ้นเสร็จ = เปลี่ยนแล้ว พับช่องกลับเป็นบรรทัดสรุป "✓ เปลี่ยนแล้ว …" (ตัวอย่าง evidFrom)
  const machineDone = MACHINE_ROLES.map((r) => (uploads.slots[`m:${r}`]?.status === "done" ? uploads.slots[`m:${r}`]?.attachmentId : "")).join(",");
  useEffect(() => {
    if (machineDone.replace(/,/g, "")) setMachineChanging(false);
  }, [machineDone]);
  useEffect(() => {
    if (!visible) setMachineChanging(false);
  }, [visible]);
  function machineBlock(forPart: number) {
    const has = MACHINE_ROLES.map((r) => machineHas(r));
    const present = has.filter(Boolean).length;
    const slots = MACHINE_ROLES.map((r) => uploads.slots[`m:${r}`]);
    const changed = slots.some((sl) => sl && sl.status !== "failed");
    const fromPre = MACHINE_ROLES.every((r) => serverEvidence(null, r)?.pre);
    const slotFor = (role: (typeof MACHINE_ROLES)[number]) => {
      const key = `m:${role}`;
      const video = role === "CLAIM_ERROR_VIDEO";
      return (
        <ClaimFileSlot
          key={role}
          label={video ? videoLabel : "รูปอาการเสีย"}
          hint={video ? undefined : "ให้เห็นจุดที่เสีย เช่น ประตู กลอน"}
          video={video}
          partCode="ใช้ร่วมทุกชิ้น"
          upload={uploads.slots[key]}
          existing={serverEvidence(null, role)}
          readOnly={!!me?.viewAs}
          actionLabel={video ? "ถ่ายวิดีโอ" : "ถ่ายรูปอาการ"}
          onPick={(f) => {
            touched.current = true;
            // แนบในข้อ ⑥ ผูกชิ้นที่กำลังกรอก — ยังใช้ร่วมทุกชิ้น แต่ไม่นับเป็นรูปก่อนซ่อม (ถ่ายหลังซ่อม)
            uploads.start(key, f, role, forPart);
          }}
          onRetry={() => {
            const sl = uploads.slots[key];
            if (sl) uploads.start(key, sl.file, role, forPart);
          }}
        />
      );
    };
    if (present === MACHINE_ROLES.length && !machineChanging) {
      return (
        <View style={styles.machineRow}>
          <Text style={[styles.machineText, { flex: 1 }]}>
            {changed
              ? `✓ เปลี่ยนแล้ว (${present} ไฟล์) — แทนไฟล์เดิม ใช้ร่วมทุกชิ้น`
              : fromPre
                ? `✓ ถ่ายไว้ตอนก่อนซ่อม (${present} ไฟล์) — ไม่ต้องแนบซ้ำทุกชิ้น`
                : `✓ แนบแล้ว (${present} ไฟล์) — ใช้ร่วมทุกชิ้น`}
          </Text>
          {!me?.viewAs ? (
            <TouchableOpacity style={styles.machineBtn} onPress={() => setMachineChanging(true)} accessibilityLabel="เปลี่ยนไฟล์ของเครื่อง">
              <Text style={styles.machineBtnText}>เปลี่ยน</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }
    return (
      <View style={{ gap: 4 }}>
        {present < MACHINE_ROLES.length ? <Text style={styles.warn}>อาการหลังซ่อมอาจไม่ขึ้นแล้ว — ผู้ขายอาจไม่รับ</Text> : null}
        {MACHINE_ROLES.filter((r, i) => machineChanging || !has[i] || slots[i]).map(slotFor)}
      </View>
    );
  }

  /** ข้อ ① / ⑤ ของชิ้น (ไฟล์ของชิ้นนั้น) */
  const partSlot = (p: PickedPart) => (role: "CLAIM_PART" | "CLAIM_CHECK_VIDEO", label: string, hint: string, video: boolean) => {
    const key = slotKey(p.sparePartId, role);
    return (
      <ClaimFileSlot
        label={label}
        hint={hint}
        video={video}
        partCode={p.partCode}
        upload={uploads.slots[key]}
        existing={serverEvidence(p.sparePartId, role)}
        readOnly={!!me?.viewAs}
        onPick={(f) => {
          touched.current = true;
          uploads.start(key, f, role, p.sparePartId);
        }}
        onRetry={() => {
          const sl = uploads.slots[key];
          if (sl) uploads.start(key, sl.file, role, p.sparePartId);
        }}
      />
    );
  };
  /** ถูกตีกลับแบบเก่า (ไม่ชี้ช่อง): เหตุผล + "ค่าเดิมถูกแล้ว" ทั้งชิ้น — เซิร์ฟเวอร์ไม่รับการส่งซ้ำที่ไม่ได้แก้อะไรและไม่ได้อธิบาย */
  const keepBoxFor = (p: PickedPart) => {
    const d = draftFor(p.sparePartId);
    const sentBack = stillRejected.get(p.sparePartId);
    if (!sentBack) return null;
    if (flaggedIds.has(p.sparePartId)) return <Text style={styles.claimHeader}>ช่องที่ถูกชี้ของชิ้นนี้อยู่ในรายการ “ต้องแก้” ด้านบน</Text>;
    return (
      <View style={styles.claimKeepBox} {...spot(`p:${p.sparePartId}:keep`)}>
        {flashOn(`p:${p.sparePartId}:keep`)}
        <Text style={styles.claimKeepReason}>
          ตีกลับ: “{sentBack.rejectReason ?? "—"}” — แก้ตามเหตุผล หรือกด “ค่าเดิมถูกแล้ว” แล้วอธิบาย
        </Text>
        {d.keep === null ? (
          <TouchableOpacity
            style={styles.claimKeepBtn}
            onPress={() => patchDraft(p.sparePartId, { keep: "" })}
            accessibilityLabel={`ค่าเดิมถูกแล้ว ${p.partCode}`}
          >
            <Text style={styles.claimKeepBtnText}>ค่าเดิมถูกแล้ว</Text>
          </TouchableOpacity>
        ) : (
          <>
            <Text style={styles.modalLabel}>ค่าเดิมถูกแล้ว — อธิบายให้ผู้ตรวจ (บังคับ)</Text>
            <TextInput
              style={[styles.modalInput, styles.claimReason, d.keep.trim().length < 3 && styles.inputMissing]}
              value={d.keep}
              onChangeText={(v) => patchDraft(p.sparePartId, { keep: v })}
              placeholder="เช่น วิดีโอเห็นร่องพูเลย์ที่วินาที 0:12"
              placeholderTextColor={colors.textFaint}
              maxLength={300}
              multiline
              accessibilityLabel={`ค่าเดิมถูกแล้ว — อธิบายให้ผู้ตรวจ ${p.partCode}`}
            />
            <TouchableOpacity
              style={styles.claimKeepUndo}
              onPress={() => patchDraft(p.sparePartId, { keep: null })}
              accessibilityLabel={`ไม่ใช้ค่าเดิม ${p.partCode}`}
            >
              <Text style={styles.claimKeepUndoText}>ไม่ใช้ — จะแก้ตามเหตุผลแทน</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  };
  const warrantyText = needsSkipReason && order.branchWarrantyExpiresAt ? formatDate(order.branchWarrantyExpiresAt) : null;
  /** ชิ้นที่ช่างกำลังมี "ยังขาด" อะไรบ้าง — สีเลขข้อของชิ้นนั้น */
  const missKeys = new Set(missingList.map((m) => m.key));
  const partStep = (p: PickedPart) => (
    <PartClaimStep
      key={p.sparePartId}
      part={{ sparePartId: p.sparePartId, partCode: p.partCode, label: partLabel(p) }}
      draft={draftFor(p.sparePartId)}
      patch={(x) => {
        touched.current = true;
        patchDraft(p.sparePartId, x);
      }}
      setOn={(on, skip) => setClaimOn(p.sparePartId, on, skip)}
      needsReason={needsSkipReason}
      warrantyUntil={warrantyText}
      notice={order.symptom}
      guide={order.claimGuide}
      errorCode={effError}
      troubleshooting={order.claimTroubleshooting}
      tsHints={order.claimTroubleshootingHints ?? {}}
      brand={order.branchWarrantyBrand ?? order.machineBrand ?? ""}
      videoLabel={videoLabel}
      hasMachineVideo={machineHas("CLAIM_ERROR_VIDEO")}
      hasAfter={workCount("AFTER") > 0}
      missing={missKeys}
      slot={partSlot(p)}
      machineBlock={machineBlock(p.sparePartId)}
      keepBox={keepBoxFor(p)}
      readOnly={!!me?.viewAs}
      spot={(k) => spot(k)}
      flashOn={flashOn}
    />
  );
  /** ขั้นเคลมทีละชิ้น — แท็บชิ้น + ชิ้นที่เลือก · ชิ้นที่ล็อกแล้วพับไว้บนสุด */
  const partsSection = (
    <View style={{ gap: spacing.md }}>
      {lockedLines}
      {tabParts.length ? (
        <PartTabs parts={partTabInfos} current={curPart} onPick={(id) => openStep(2, id)} />
      ) : (
        <Text style={styles.linkedText}>ไม่ส่งเคลม</Text>
      )}
      {curPart !== null ? partStep(tabParts.find((p) => p.sparePartId === curPart)!) : null}
    </View>
  );

  /** ขั้นส่ง — สรุปทีละขั้นบรรทัดเดียว (ตัวอย่าง review) */
  const plateSummary = machineLocked && approvedRow
    ? [...(approvedRow.nameplate?.fields ?? []).filter((f) => f.key === "model" || f.key === "serial").map((f) => f.value)]
    : plateFields(order.claimGuide?.plate)
        .filter((f) => f.key === "model" || f.key === "serial")
        .map((f) => plate.values[f.key]?.value?.trim() ?? "")
        .filter(Boolean);
  const errText = effError ? (effError === NO_ERROR_CODE ? "ไม่มี Error ขึ้น" : effError) : null;
  const goStep = (items: MItem[]) => () => goTo(items[0].key);
  const sendRows: SendRow[] = [
    (() => {
      const miss = missingList.filter((m) => m.step === 0);
      const before = Math.max(workCount("BEFORE"), 0) + preCount;
      return miss.length
        ? { key: "work", text: `✗ งานที่ทำ — ยังขาด: ${miss.map((m) => m.text).join(" · ")}`, state: "missing" as const, onGo: goStep(miss) }
        : {
            key: "work",
            text: `✓ งานที่ทำ — ${results.find((r) => r.value === result)?.label ?? result} · รูปก่อนซ่อม ${before} · หลังซ่อม ${workCount("AFTER")} · ป้ายรุ่น ${workCount("NAMEPLATE") ? 1 : 0}`,
            state: "ok" as const,
          };
    })(),
    ...(anyClaim
      ? [
          (() => {
            const miss = missingList.filter((m) => m.step === 1);
            return miss.length
              ? { key: "machine", text: `✗ ข้อมูลเครื่อง — ยังขาด: ${miss.map((m) => m.text.replace(/^ข้อมูลเครื่อง: /, "")).join(" · ")}`, state: "missing" as const, onGo: goStep(miss) }
              : {
                  key: "machine",
                  text: `✓ ข้อมูลเครื่อง — ${[...plateSummary, ...(order.claimGuide?.errors.length ? [errText ?? "—"] : [])].join(" · ")}${machineLocked ? " (ล็อกไว้)" : ""}`,
                  state: "ok" as const,
                };
          })(),
        ]
      : []),
    ...tabParts.map((p): SendRow => {
      const d = draftFor(p.sparePartId);
      const label = partLabel(p);
      if (!d.on) {
        const miss = missingList.filter((m) => m.part === p.sparePartId);
        return miss.length
          ? { key: `p${p.sparePartId}`, text: `✗ เคลม ${label} — ยังขาด: ${miss.map((m) => m.text.replace(/^ไม่ส่งเคลม [^:]+: /, "")).join(" · ")}`, state: "missing", onGo: goStep(miss) }
          : { key: `p${p.sparePartId}`, text: `เคลม ${label} — ไม่ส่งเคลม${d.skip ? ` (${skipText(d.skip)})` : ""}`, state: "skip" };
      }
      const miss = missingList.filter((m) => m.part === p.sparePartId);
      if (miss.length) {
        return {
          key: `p${p.sparePartId}`,
          text: `✗ เคลม ${label} — ยังขาด: ${miss.map((m) => m.text.replace(`เคลม ${label}: `, "")).join(" · ")}`,
          state: "missing",
          onGo: goStep(miss),
        };
      }
      const broken = d.brokenPartCode.trim();
      const mismatch = broken && brokenMatches({ brokenPartCode: broken, partCode: p.partCode }) === false;
      return {
        key: `p${p.sparePartId}`,
        text: `✓ เคลม ${label} — หลักฐานครบ ${partTotal}/${partTotal} · รหัสตัวเสีย ${broken}`,
        state: "ok",
        // รหัสตัวเสียไม่ตรงกับที่เปลี่ยนใส่ — ไม่บล็อก แต่ต้องเห็นอีกครั้งก่อนส่ง (ผู้ตรวจเห็นเป็นธง)
        ...(mismatch
          ? {
              warn: `· ไม่ตรงกับอะไหล่ที่เปลี่ยนใส่ (${p.partCode})`,
              onLook: () => {
                setStep(2);
                setPartTab(p.sparePartId);
                setTimeout(() => scrollToSpot(`p:${p.sparePartId}:broken`), 150);
              },
            }
          : {}),
      };
    }),
  ];
  const sendSection = (
    <>
      <SendStep rows={sendRows} claiming={anyClaim} />
      {lockedLines}
    </>
  );

  /** ของที่ขาดในขั้นนี้ (กล่อง "ยังขาด:" ท้ายขั้น) — ขั้นส่งสรุปทุกขั้นในแถวแล้ว ไม่ต้องมีกล่องซ้ำ */
  const missingHere = !stepMode || fixMode
    ? missingList
    : step === 3
      ? []
      : step === 2
        ? missingList.filter((m) => m.step === 2 && (m.shared ? curPart !== null && draftFor(curPart).on : m.part === curPart))
        : missingList.filter((m) => m.step === step);

  return (
    <AppModal
      visible={visible}
      onClose={onCancel}
      busy={saving}
      title={
        fixMode ? (
          <>แก้เคลม {order.code}</>
        ) : order.assignedOutsource && !reclosing ? (
          <>บันทึกผลงาน SUB {order.code}</>
        ) : (
          <>ปิดงาน {order.code}</>
        )
      }
      scrollRef={scrollRef}
      /*
        ปุ่ม ? ของฟอร์มปิดงาน — ช่าง/Senior ช่างเท่านั้น (หัวหน้าภาคบันทึกผลงาน SUB ไม่มี: วิธีใช้นี้สอนฟอร์มของช่าง)
        ฟอร์มแก้เคลมและใบงาน SUB หน้าตาต่างจากที่วิธีใช้ "ปิดงาน" อธิบาย (ช่องส่วนใหญ่พับไว้/เป็นช่องทีม SUB)
        จึงพาไปหน้าสอนการใช้งานแทน (เจ้าของงานตอบ 10.2) — ไม่ใช่วิธีใช้ที่ข้ามเกือบทุกขั้น
      */
      headRight={
        me?.role !== "EMPLOYEE" ? null : !fixMode && !order.assignedOutsource ? (
          <HowToButton compact tour="tech.close" target="close.help" />
        ) : (
          <HowToButton compact hub target="close.help" />
        )
      }
      banner={
        (stepMode && !fixMode) || sendError || rejectedRows.length || (fixBlocked && unresolved.length) ? (
          <>
            {/* แถบขั้นปักใต้หัวฟอร์ม — เลื่อนฟอร์มไปไหนก็ยังเห็นว่าอยู่ขั้นไหน และขั้นไหนยังขาด (ตัวอย่าง tabs) */}
            {/* กรอบห่อให้วิธีใช้ "ปิดงาน" ชี้แถบสี่ขั้น (ชื่อคงที่) — ห่อที่นี่แทนการแก้ CloseStepper · มีเฉพาะฟอร์มทีละขั้น */}
            {stepMode && !fixMode ? (
              <View {...howtoTarget("close.stepper")}>
                <CloseStepper
                  step={step}
                  steps={stepInfos}
                  // บรรทัดสรุปนับทั้งขั้น (ทุกชิ้นในขั้นเคลม) ให้ตรงกับวงกลมด้านบน — กล่องใต้ชิ้นเท่านั้นที่บอกเฉพาะชิ้นที่เปิดอยู่
                  missingHere={step === 3 ? missingList.length : missingList.filter((m) => m.step === step).length}
                  onPick={(i) => openStep(i)}
                />
              </View>
            ) : null}
            {quitBar ? (
              <View style={styles.quitBar}>
                {claimedParts.map((p) => (
                  <View key={p.sparePartId} style={styles.quitRow} accessibilityLabel={`แถบเลิกเคลม ${p.partCode}`}>
                    <Text style={styles.quitText}>
                      ส่งเคลม <Text style={{ fontWeight: "700" }}>{partLabel(p)}</Text> · ติ๊กผิด?
                    </Text>
                    <TouchableOpacity
                      style={styles.quitBtn}
                      onPress={() => quitClaim(p)}
                      activeOpacity={0.7}
                      accessibilityLabel={`เลิกเคลม ${p.partCode}`}
                    >
                      <Text style={styles.quitBtnText}>เลิกเคลม</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}
            {sendError ? (
              <View style={styles.sendErr} accessibilityRole="alert">
                <Ionicons
                  name={sendError.lost ? "cloud-offline-outline" : "alert-circle-outline"}
                  size={22}
                  color={colors.dangerInk}
                  style={{ marginTop: 1 }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sendErrTitle}>{sendError.lost ? "ส่งไม่สำเร็จ — เน็ตหลุด" : "ส่งไม่สำเร็จ"}</Text>
                  {sendError.message ? <Text style={styles.sendErrText}>{sendError.message}</Text> : null}
                  <Text style={styles.sendErrText}>{keptLine()}</Text>
                </View>
              </View>
            ) : null}
            {/* แก้เคลม: เหตุผลที่ถูกตีกลับปักใต้หัวฟอร์ม — เลื่อนไปช่องไหนก็ยังเห็นว่าต้องแก้อะไร */}
            {rejectedRows.length ? (
              <RejectedBanner
                reviewer={rejectedRows[0].reviewedByName ?? null}
                at={rejectedRows[0].reviewedAt}
                lines={rejectLinesOf(rejectedRows, (c) => c.partLabel ?? c.partName, { family: order.claimGuide?.plate.family ?? null })}
              />
            ) : null}
            {/* กดส่งตอนช่องที่ถูกชี้ยังเหมือนเดิม — บอกว่าช่องไหน และทางออกสองทาง (ตัวอย่าง blockedText) */}
            {fixBlocked && unresolved.length ? (
              <View style={styles.fixBlocked} accessibilityRole="alert">
                <Text style={styles.fixBlockedText}>
                  ยังส่งไม่ได้ — ช่องที่ถูกชี้ยังเหมือนเดิม {unresolved.length} ช่อง: {unresolved.map((i) => i.label).join(" · ")} (แก้
                  หรือกด “ค่าเดิมถูกแล้ว” แล้วอธิบาย)
                </Text>
              </View>
            ) : null}
          </>
        ) : null
      }
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          {/*
            ไม่จางอีกแล้ว: ยังขาด → "ยังขาด n อย่าง — พาไป" สีส้ม กดแล้วเลื่อนไปช่องแรกที่ขาด (ไม่ส่งอะไร)
            เดิมปุ่มจางกดไม่ได้ ช่างกดแล้วเงียบ ไม่รู้ว่าขาดอะไรตรงไหน (ตัวอย่างที่เจ้าของงานเลือก ต.ค. 69)
          */}
          <TouchableOpacity
            style={[
              styles.modalSave,
              !saving && goLabel ? styles.closeGo : null,
              !saving && stepNav?.kind === "send" ? styles.closeSend : null,
              saving && styles.modalSaveOff,
            ]}
            onPress={press}
            disabled={saving}
            activeOpacity={0.8}
            accessibilityLabel={saving ? waitLabel ?? busy ?? "กำลังส่ง" : goLabel ?? submitLabel}
            {...howtoTarget("close.submit")}
          >
            {saving ? (
              <>
                <Spinner color="#fff" size="small" />
                {waitLabel ?? busy ? <Text style={styles.modalSaveText}>{waitLabel ?? busy}</Text> : null}
              </>
            ) : goLabel ? (
              <Text style={styles.closeGoText}>{goLabel}</Text>
            ) : (
              <Text style={styles.modalSaveText}>{submitLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      }
    >

      {/*
        แก้เคลมแบบชี้ช่อง (เคลมก้อน 4): ช่องที่ต้องแก้อยู่บนสุด ที่เหลือพับไว้ "ส่วนที่ไม่ต้องแก้" (ตัวอย่าง fix screen)
        ชิ้นที่ล็อกแล้วขึ้นนอกส่วนที่พับเสมอ — ช่างต้องรู้ว่าชิ้นนั้นจบแล้ว ไม่ต้องหาว่าทำไมไม่มีในรายการ
        ส่วนที่พับยังแก้ได้ (ฟอร์มเดิมทั้งฟอร์ม) — ช่างอาจเจอสิ่งที่ต้องแก้เพิ่มเอง
      */}
      {fixMode ? (
        <View style={{ marginBottom: spacing.sm }}>
          <FixList
            items={fixItems}
            spot={(k) => spot(k)}
            flashOn={flashOn}
            env={{
              files,
              evidence: order.claimEvidence,
              removed: uploads.removed,
              guide: order.claimGuide,
              troubleshooting: order.claimTroubleshooting,
              brand: order.branchWarrantyBrand ?? order.machineBrand ?? "",
              partCodeOf: (pid) => parts.find((x) => x.sparePartId === pid)?.partCode ?? String(pid),
              claimedIds,
              draftFor,
              patchDraft,
              plate,
              setPlate,
              check,
              setCheck,
              errorCode: effError,
              uploads,
              readOnly: !!me?.viewAs,
              setKeep: (key, v) => setFixKeep((k) => ({ ...k, [key]: v })),
              onRescan: () => goTo("m:plate"),
              onTouch: () => {
                touched.current = true;
              },
            }}
          />
          <TouchableOpacity style={styles.foldBtn} onPress={() => setFoldOpen((o) => !o)} accessibilityState={{ expanded: foldOpen }}>
            <Text style={styles.foldText}>{foldOpen ? "▾" : "▸"} ส่วนที่ไม่ต้องแก้ (พับไว้ แก้ได้ถ้าจำเป็น)</Text>
          </TouchableOpacity>
          {lockedLines}
          {foldOpen ? foldLines.map((t) => <Text key={t} style={styles.foldLine}>{t}</Text>) : null}
        </View>
      ) : null}

      {/*
        สามแบบของฟอร์มเดียวกัน (เคลมก้อน 5):
        แก้เคลม (ถูกชี้ช่อง) — รายการต้องแก้ด้านบน + ส่วนที่ไม่ต้องแก้พับไว้ (ทุกส่วนเรียงต่อกัน แก้ได้ถ้าจำเป็น)
        ทีละขั้น (มีเคลม) — ขั้นเดียวต่อหน้า สลับด้วยแถบขั้นบนสุด · หน้ายาว (ไม่มีเคลม) — แบบเดิมหน้าเดียว
      */}
      {fixMode ? (
        foldOpen ? (
          <>
            {workSection}
            {anyClaim ? <View {...spot("machine")}>{machineSection}</View> : null}
            {tabParts.map((p) => (
              <View key={p.sparePartId} style={{ marginTop: spacing.md }}>
                {partStep(p)}
              </View>
            ))}
          </>
        ) : null
      ) : stepMode ? (
        step === 0 ? (
          workSection
        ) : step === 1 ? (
          machineSection
        ) : step === 2 ? (
          partsSection
        ) : (
          sendSection
        )
      ) : (
        workSection
      )}

      {/* กล่องเดียวบอกของที่ขาด (เคลมบอกชิ้นและช่อง) — ฟอร์มทีละขั้นบอกเฉพาะของขั้นนี้ ปุ่มล่างพาไปช่องแรกในรายการนี้ */}
      <MissingBox items={missingHere.map((m) => m.text)} why="ต้องครบก่อนถึงจะส่งได้ — กดปุ่ม “ยังขาด … — พาไป” ด้านล่าง ระบบเลื่อนไปช่องแรกที่ยังขาดให้" />
      {overLimit ? (
        <View {...spot("limit")}>
          {flashOn("limit")}
          <Text style={styles.modalError}>
            ไฟล์เกินเพดาน — ใบนี้มีไฟล์แล้ว {order.attachmentCount} ไฟล์ จะส่งเพิ่มอีก {pendingUploads} ไฟล์ แต่ใบงานหนึ่งแนบได้ไม่เกิน{" "}
            {order.attachmentLimit} ไฟล์ · ลบไฟล์ที่ไม่ใช้ (เช่น รูปซ้ำ) ในการ์ดไฟล์แนบ หรือเอารูปออกจากฟอร์มนี้บางรูป
          </Text>
        </View>
      ) : null}
    </AppModal>
  );
}

/**
 * กรอบแดงกระพริบ 3 ครั้งรอบช่องที่ปุ่ม "ยังขาด n อย่าง — พาไป" พามา — เลื่อนมาถึงแล้วตาต้องเจอช่องนั้นทันที
 * ไม่ใช่แค่เลื่อนจอแล้วให้ช่างเดาว่าช่องไหน · ถอดออกเองหลังเล่นจบ (คีย์ใหม่ทุกครั้งที่กด = เล่นจากต้น)
 * เว็บใช้ CSS animation ผ่าน StyleSheet.create (react-native-web ทิ้ง animationKeyframes ที่ส่งเป็น style ตรง ๆ — ดู Blink)
 */
const WEB_FLASH = StyleSheet.create({
  flash: {
    animationKeyframes: [{ "0%": { opacity: 0 }, "50%": { opacity: 1 }, "100%": { opacity: 0 } }],
    animationDuration: "0.6s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "3",
    animationFillMode: "forwards",
  },
} as Record<string, object>).flash;
function FlashFrame() {
  const web = Platform.OS === "web";
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (web) return;
    const run = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
      { iterations: 3 }
    );
    run.start();
    return () => run.stop();
  }, [v, web]);
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLabel="ช่องที่ยังขาด"
      style={[styles.flashFrame, web ? [{ opacity: 0 }, WEB_FLASH] : { opacity: v }]}
    />
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
  // รูปก่อนซ่อมมาจากกล่องถ่ายก่อนซ่อม — เขียวอ่อน บอกว่าครบแล้ว ไม่ต้องถ่ายซ้ำ (ตัวอย่าง beforeFromPre)
  preUsed: { gap: 2, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.successSoft },
  preUsedTitle: { fontSize: 14.5, lineHeight: 21, fontWeight: "800", color: colors.successInk },
  // ปุ่มส่งของฟอร์มทีละขั้น — เขียว แยกจาก "ถัดไป" (กรมท่า) ช่างรู้ว่ากดนี้แล้วส่งจริง (ตัวอย่าง primBg)
  closeSend: { backgroundColor: colors.successFill },
  machineRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  machineText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.successInk, minWidth: 180 },
  machineBtn: {
    minHeight: 48,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.navyFill,
    backgroundColor: colors.card,
  },
  machineBtnText: { fontSize: 14, fontWeight: "700", color: colors.primaryInk },
  dangerTitle: { fontSize: 13.5, fontWeight: "800", color: colors.dangerInk },
  dangerHint: { fontSize: 12, lineHeight: 18, color: colors.body },
  dangerBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.card },
  todayHero: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, padding: spacing.md, gap: 2 },
  todayHeroBig: { fontSize: 20, lineHeight: 30, fontWeight: "800", color: colors.primaryDark },
  todayHeroText: { fontSize: 13.5, lineHeight: 21, color: colors.text },
  pickupBox: { gap: 6, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.warningTint, borderWidth: 1, borderColor: colors.warningBorder },
  pickupTag: { fontSize: 12, lineHeight: 18, color: colors.warningInk, fontWeight: "600" },
  docBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.sky200,
    backgroundColor: colors.sky50,
    borderRadius: radius.md,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  docBtnText: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
  docLink: { fontSize: 13.5, fontWeight: "700", color: colors.primaryInk, textDecorationLine: "underline" },
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
  partSent: { color: colors.successInk, fontWeight: "700" },
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
  readyBox: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
    marginTop: spacing.sm,
  },
  readyBoxFar: { borderColor: colors.warningBorder, backgroundColor: colors.warningSoft },
  readyTitle: { fontSize: 14, fontWeight: "700", color: colors.successInk },
  readyTitleFar: { color: colors.warningInk },
  readyRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  readyLine: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 18, color: colors.text },
  readyMeta: { fontSize: 11.5, color: colors.textFaint },
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
  // ประวัติแบบเรียบ (พ.ย. 69 ตามแบบ) — จุดมีวงจางรอบ เส้นเทาบางต่อกันทุกจุด วันเวลาชิดขวา
  hRow: { flexDirection: "row", gap: 12 },
  hRail: { width: 22, alignItems: "center" },
  hLine: { position: "absolute", top: 11, bottom: -11, width: 2, backgroundColor: colors.border },
  hHalo: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 0 },
  hDot: { width: 10, height: 10, borderRadius: 5 },
  hBody: { flex: 1, minWidth: 0, gap: 3 },
  hBodyGap: { paddingBottom: 20 },
  hTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  hAction: { flex: 1, minWidth: 0, fontSize: 14.5, lineHeight: 22, fontWeight: "700", color: colors.text },
  hWhenText: { fontSize: 13, lineHeight: 22, fontWeight: "600", color: colors.textMuted, fontVariant: ["tabular-nums"] },
  hMinor: { fontWeight: "500", color: colors.textMuted },
  hWho: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  hName: { fontSize: 13.5, lineHeight: 21, color: colors.text },
  hRole: { borderRadius: 6, paddingHorizontal: 7, borderWidth: 1 },
  hRoleText: { fontSize: 11.5, lineHeight: 18, fontWeight: "700" },
  hNote: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  hNoteBad: { fontSize: 13.5, lineHeight: 21, fontWeight: "600", color: colors.dangerInk },
  hNoteBox: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 20,
    color: colors.text,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
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
  // แหล่งของนอกสโตร์ที่หัวหน้าภาคแจ้ง — ใต้บรรทัดรายการ เยื้องเข้าให้อ่านว่าเป็นของแถวบน
  offSourceLine: { fontSize: 11.5, lineHeight: 18, color: colors.textMuted, paddingLeft: spacing.sm },
  offTold: { fontSize: 12.5, lineHeight: 19, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 5, overflow: "hidden" },
  issuedHint: { fontSize: 11, lineHeight: 19, color: colors.textFaint, paddingTop: 3 },
  optionOut: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  optionTextOut: { color: colors.danger },
  // เว้นบน-ล่างให้คลื่นรอบวงขั้นปัจจุบัน (ขยายถึง 2.1 เท่า) ไม่ถูกขอบ ScrollView ตัด
  steps: { flexDirection: "row", alignItems: "flex-start", paddingTop: 18, paddingBottom: 4 },
  // แบ่งความกว้างเท่ากันทุกช่อง ไม่มีขั้นต่ำ — ไม่ให้ล้นจนต้องเลื่อน (ดูที่แถบขั้นตอน)
  step: { flex: 1, flexBasis: 0, minWidth: 0, alignItems: "center", paddingHorizontal: 3 },
  // จอแคบ: ช่องกว้างคงที่ เรียงเกินจอได้ ปัดดูด้วยนิ้ว (ดูที่แถบขั้นตอน)
  stepSwipe: { flex: 0, flexBasis: "auto", width: STEP_SWIPE_W, flexShrink: 0 },
  stepsFit: { flex: 1 },
  stepsSwipe: { flexGrow: 0 },
  stepsRow: { flexShrink: 0 },
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
    top: 19,
    left: "-50%",
    right: "50%",
    marginLeft: 24,
    marginRight: 24,
    height: 2,
    backgroundColor: colors.border,
  },
  stepLineDone: { backgroundColor: colors.success },
  stepDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  stepNum: { fontSize: 15, lineHeight: 20, fontWeight: "800", color: colors.textFaint },
  stepNumNow: { color: "#fff" },
  stepDotOut: { backgroundColor: colors.danger, borderColor: colors.danger },
  stepDotOutRing: Platform.OS === "web" ? ({ boxShadow: `0 0 0 5px ${colors.dangerLine}` } as object) : {},
  stepOutPill: { marginTop: 4, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.dangerLine, borderRadius: 6, paddingHorizontal: 7 },
  stepOutPillText: { fontSize: 11.5, lineHeight: 18, fontWeight: "700", color: colors.dangerInk, textAlign: "center" },
  stepOutEta: { fontSize: 10.5, lineHeight: 15, fontWeight: "700", color: colors.dangerInk, textAlign: "center", marginTop: 2 },
  stageLabel: { marginTop: 8, fontSize: 13, lineHeight: 19, color: colors.text, textAlign: "center" },
  stageLabelDone: { fontWeight: "700", color: colors.text },
  stageLabelFrom: { fontWeight: "600", color: colors.text },
  stageLabelNow: { fontWeight: "800", color: colors.navy },
  stageLabelFuture: { color: colors.textFaint },
  // ขั้นที่ข้ามขีดฆ่าชื่อ ให้แยกจาก "ยังไม่ถึง" ได้ — เทสต์ stageorder อ่านเส้นนี้ด้วย
  stageLabelSkipped: { textDecorationLine: "line-through" },
  stageActor: { fontSize: 11, lineHeight: 16, color: colors.textFaint, textAlign: "center" },
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
  // ── หน้าตาตามแบบ ต.ค. 69 ──
  hero: { gap: spacing.sm, paddingHorizontal: 2 },
  heroRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  heroTitle: { fontSize: 24, lineHeight: 34, fontWeight: "700", color: colors.text, marginRight: spacing.xs },
  // หัว/ท้ายหน้าต่างใบงาน (หน้าตาใหม่ พ.ย. 69)
  popHead: { gap: 6 },
  // ตัวอย่างแถบขั้นตอนแบบใหม่ (พ.ย. 69)
  rbBanner: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSoft,
  },
  rbIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.warning, alignItems: "center", justifyContent: "center" },
  // ระงับชั่วคราว — โทนเทาอมฟ้า แยกจากเหลืองของย้อนขั้น (พักไว้ ไม่ใช่ถอยหลัง)
  holdBanner: { borderColor: colors.borderStrong, backgroundColor: colors.background },
  holdIcon: { backgroundColor: colors.body },
  holdText: { color: colors.text },
  holdLink: { borderColor: colors.borderStrong },
  rbTitle: { fontSize: 14.5, lineHeight: 21, fontWeight: "800", color: colors.warningInk },
  rbText: { fontSize: 13, lineHeight: 20, color: colors.warningInk },
  rbStrong: { fontWeight: "700" },
  rbStatus: { borderRadius: 8, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningTint, paddingHorizontal: 10, paddingVertical: 4 },
  rbStatusText: { fontSize: 12.5, lineHeight: 19, fontWeight: "700", color: colors.warningInk },
  rbLink: { borderRadius: 8, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 6 },
  rbLinkText: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.warningInk },
  stepsTitle: { fontSize: 20, lineHeight: 28, fontWeight: "800", color: colors.text },
  stepsTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  stepPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primaryLine },
  stepPillBad: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerLine },
  stepPillText: { fontSize: 12.5, lineHeight: 19, fontWeight: "700", color: colors.primaryInk },
  stepPillTextBad: { color: colors.dangerInk },
  stepHist: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  stepHistBack: { borderColor: colors.warningBorder, backgroundColor: colors.warningSoft },
  stepHistText: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.body },
  nowPill: { marginTop: 3, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 1 },
  nowPillText: { fontSize: 11.5, lineHeight: 17, fontWeight: "700" },
  stepsFoot: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  slaChip: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 1 },
  slaChipOk: { backgroundColor: colors.successSoft, borderColor: colors.successLine },
  slaChipBad: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerLine },
  slaChipText: { fontSize: 12, lineHeight: 18, fontWeight: "700" },
  stepsFootText: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  stepsFootStrong: { fontWeight: "700", color: colors.text },
  popRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  codeChip: { borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.tile, paddingHorizontal: 10, paddingVertical: 1 },
  codeChipText: { fontSize: 16, lineHeight: 24, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
  popTitle: { fontSize: 20, lineHeight: 30, fontWeight: "700", color: colors.text },
  popLine: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  popBranch: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: colors.text },
  popLineFlex: { flexShrink: 1, minWidth: 0 },
  footTool: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  footToolText: { fontSize: 13.5, lineHeight: 20, fontWeight: "600", color: colors.body },
  footPrimaryFull: { flexBasis: "100%", justifyContent: "center" },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusChipText: { fontSize: 13, lineHeight: 20, fontWeight: "700" },
  statusChipLate: { borderWidth: 1, borderColor: colors.dangerLine },
  tagLine: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 1, backgroundColor: colors.card },
  tagLineText: { fontSize: 13, lineHeight: 20, fontWeight: "600", color: colors.body },
  supTag: { flexDirection: "row", alignItems: "center", gap: 4, borderColor: colors.primarySoft, backgroundColor: colors.primarySoft },
  supTagNone: { borderColor: colors.dangerLine, backgroundColor: colors.dangerSoft },
  stepsCard: { paddingTop: spacing.md },
  stepsHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepsHeadText: { fontSize: 15, lineHeight: 22, color: colors.textMuted },
  stepsHeadStrong: { fontWeight: "700", color: colors.navy },
  cols: { flexDirection: "row", alignItems: "flex-start", gap: spacing.lg },
  colMain: { flex: 1, minWidth: 0, gap: spacing.md },
  colSide: { width: 380, flexShrink: 0, gap: spacing.md },
  stack: { gap: spacing.md },
  sideStack: { gap: spacing.md },
  recovered: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  recoveredIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" },
  recoveredTitle: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.text },
  recoveredText: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  recoveredBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card },
  recoveredBtnText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.navy },
  nowCard: { gap: spacing.md },
  // รอลูกค้าจ่ายเงิน — ขอบส้ม (รอคนนอก) · เกินเส้นขอบแดง (ตัวอย่างที่ตกลง 5 พ.ย. 69)
  nowCardPay: { borderWidth: 2, borderColor: colors.warningBorder },
  nowCardPayLate: { borderWidth: 2, borderColor: colors.dangerLine },
  nowHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  nowWho: { fontWeight: "800" },
  nowEyebrow: { fontSize: 13, lineHeight: 20, fontWeight: "700" },
  nowTitle: { fontSize: 20, lineHeight: 30, fontWeight: "700", color: colors.text },
  nowBody: { gap: 2 },
  nowFoot: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  nowFootWide: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  nowFootMeta: { flex: 1, minWidth: 200, fontSize: 13, lineHeight: 20, color: colors.textMuted },
  nowFootActions: { flexShrink: 0, alignItems: "flex-end", maxWidth: "100%" },
  ptTop: { flexDirection: "row", alignItems: "center", marginTop: spacing.md, marginBottom: spacing.sm },
  ptTitle: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.text },
  ptSummary: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  ptSummaryOut: { color: colors.dangerInk, fontWeight: "700" },
  ptTable: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" },
  ptRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 12 },
  ptHeadRow: { backgroundColor: colors.background, paddingVertical: 8 },
  ptRowLine: { borderTopWidth: 1, borderTopColor: colors.border },
  ptRowOut: { backgroundColor: colors.dangerSoft },
  // คำตอบจัดหาของนอกสโตร์ใต้แถว — เยื้องตรงคอลัมน์รายการ (ระยะขอบ md + ptCode 130 + ช่องห่าง sm) ให้อ่านว่าเป็นของแถวบน
  ptRowSource: { paddingLeft: spacing.md + 130 + spacing.sm, paddingRight: spacing.md, paddingBottom: 12, marginTop: -6 },
  ptHead: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.textMuted },
  ptCell: { fontSize: 14, lineHeight: 21, color: colors.text },
  ptStrong: { fontWeight: "700" },
  ptCode: { width: 130 },
  ptName: { flex: 1, minWidth: 0 },
  ptNameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  ptQty: { width: 70, textAlign: "right" },
  ptStock: { width: 120 },
  ptEta: { width: 130 },
  ptChip: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  ptCodeInk: { color: colors.primaryInk },
  ptOutPill: { flexDirection: "row", alignItems: "center", gap: 5, marginLeft: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.dangerLine, backgroundColor: colors.dangerSoft, paddingHorizontal: 9, paddingVertical: 1 },
  ptOutPillText: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.dangerInk },
  fxRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.md, paddingVertical: 6 },
  fxLabel: { width: 130, fontSize: 13, lineHeight: 20, color: colors.textMuted },
  fxBox: { flex: 1, minWidth: 200, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: spacing.md, paddingVertical: 10 },
  fxBoxText: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.text },
  fxChips: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  fxFinding: { borderRadius: 8, borderWidth: 1, borderColor: colors.dangerLine, backgroundColor: colors.dangerSoft, paddingHorizontal: 10, paddingVertical: 3 },
  fxFindingText: { fontSize: 14, lineHeight: 21, fontWeight: "700", color: colors.dangerInk },
  fxDate: { borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.tile, paddingHorizontal: 8, paddingVertical: 1 },
  fxDateText: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  cardTools: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, flexGrow: 1 },
  ptChipText: { fontSize: 12, lineHeight: 18, fontWeight: "700" },
  ptEtaText: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  ptEtaBtn: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, minHeight: 34, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.tile },
  ptEtaBtnText: { fontSize: 12.5, lineHeight: 18, fontWeight: "600", color: colors.body },
  ptCardRow: { paddingHorizontal: spacing.md, paddingVertical: 10, gap: 2 },
  ptSub: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  ptCardEta: { marginTop: 4, alignItems: "flex-start" },
  toolsCard: { gap: 2 },
  toolsTitle: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.textMuted, marginBottom: spacing.sm },
  toolsClose: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, marginBottom: spacing.sm },
  toolsCloseText: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.navy },
  toolItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  toolItemText: { fontSize: 15, lineHeight: 22, color: colors.text },
  dangerZone: { gap: 4, marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "flex-start" },
  hHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: spacing.md,
    marginBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.warningTint,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  hTitle: { fontSize: 18, lineHeight: 26, fontWeight: "800", color: colors.text },
  hTimeline: { fontSize: 13.5, lineHeight: 20, fontWeight: "700", color: colors.histBlue },
  infoGridWide: { flexDirection: "row", alignItems: "stretch" },
  infoCard: { flex: 1, minWidth: 0 },
  infoHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  infoTitle: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: colors.text },
  waitingText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 21, color: colors.textMuted },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  // ห่อเนื้อใบงานไว้ให้หน้าตรวจเคลมพับได้ — ระยะห่างเท่าเดิมกับตอนที่เป็นลูกของ ScrollView ตรง ๆ
  bodyWrap: { gap: spacing.md },
  bodyHidden: { display: "none" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  errorText: { fontSize: 13, lineHeight: 21, color: colors.danger, textAlign: "center" },
  lockIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, marginBottom: spacing.sm },
  lockTitle: { fontSize: 16, fontWeight: "800", color: colors.text, textAlign: "center" },
  lockText: { marginTop: 4, fontSize: 13, lineHeight: 21, color: colors.textMuted, textAlign: "center", maxWidth: 360 },
  lockBtn: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 8 },
  lockBtnText: { fontSize: 13.5, fontWeight: "700", color: colors.navy },
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
  badge: { borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: spacing.sm },
  badgeText: { fontSize: 11, lineHeight: 19, fontWeight: "700" },
  badgeOut: { backgroundColor: colors.danger },
  // ระงับชั่วคราว — เทาอมฟ้ามีกรอบ ไม่ใช่สีของคนที่ใบรอ (ใบไม่ได้รอใครระหว่างพัก)
  badgeHold: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderStrong },
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
  crossTeamBox: { borderColor: colors.sky200, backgroundColor: colors.roleSupervisorSoft },
  reviewAction: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    backgroundColor: colors.card,
  },
  reviewActionText: { fontSize: 13.5, fontWeight: "700" },
  cancelledBox: { borderColor: colors.borderStrong, backgroundColor: colors.background },
  keepBox: { gap: 2, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.successLine, backgroundColor: colors.successSoft },
  keepTitle: { fontSize: 13, fontWeight: "800", color: colors.successInk },
  keepText: { fontSize: 12.5, color: colors.text },
  keepHint: { fontSize: 12, color: colors.textMuted },
  badgeBack: { backgroundColor: colors.rollback },
  stepDotFrom: { borderStyle: "dashed", borderColor: colors.warning, borderWidth: 2, backgroundColor: colors.warningSoft },
  stepFromPill: { marginTop: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 1, backgroundColor: colors.warningTint },
  stepFromPillText: { fontSize: 11.5, lineHeight: 18, fontWeight: "700", color: colors.warningInk },
  // ขั้น 1 ระหว่างตรวจหน้างาน — วงเส้นประสีคนที่ใบรอ ไม่ทึบ: ยังไม่ได้ทำ แต่ใบกำลังจะวนกลับมาที่นี่
  stepDotLoop: { borderStyle: "dashed", backgroundColor: colors.card },
  // ── รอบตรวจหน้างาน (เหนือแถบ) · ขั้นย่อยโอนคลังอื่น (ใต้แถบ) — แบบที่ตกลง ต.ค. 69 รอบสอง ──
  // ม่วงเดียวกับป้าย "ตรวจหน้างาน" บนบอร์ดแผนงาน · กรอบเส้นประบอกว่าเป็นรอบแยก ไม่ใช่ขั้นหลัก
  trackRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    backgroundColor: colors.sky50,
  },
  trackPill: { paddingHorizontal: 2, paddingVertical: 2 },
  trackPillText: { fontSize: 12.5, lineHeight: 18, fontWeight: "800", color: colors.primaryInk },
  trackStep: { flexDirection: "row", alignItems: "center", gap: 6 },
  trackItem: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 2 },
  trackLabel: { fontSize: 12, lineHeight: 18, color: colors.text },
  trackBack: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  miniDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  miniLine: { width: 14, height: 2, backgroundColor: colors.border },
  subTrack: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.sky200,
    backgroundColor: colors.sky50,
  },
  subTrackHead: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.textMuted },
  subItem: { flexDirection: "row", alignItems: "center" },
  subItemText: { fontSize: 12, lineHeight: 18, color: colors.text },
  prevBox: { gap: 2, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningTint },
  prevBoxTitle: { fontSize: 13, fontWeight: "800", color: colors.warningInk },
  prevBoxText: { fontSize: 12, color: colors.warningInk },
  prevTag: { fontSize: 11, fontWeight: "700", color: colors.warningInk, backgroundColor: colors.warningTint },
  sentBackTitle: { fontSize: 13.5, lineHeight: 21, fontWeight: "800", color: colors.warningInk },
  sentBackText: { fontSize: 13, lineHeight: 21, color: colors.text },
  sentBackMeta: { fontSize: 12, lineHeight: 19, color: colors.textMuted },
  outIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.dangerLine, alignItems: "center", justifyContent: "center" },
  outIconText: { color: "#fff", fontWeight: "800", fontSize: 14, lineHeight: 20 },
  outTitle: { fontSize: 14, lineHeight: 21, fontWeight: "800", color: colors.dangerInk },
  outText: { fontSize: 12.5, lineHeight: 19, fontWeight: "400", color: colors.dangerInk },
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
  dateRowValue: { flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  // ตัวหนังสือเดียวกับ rowValue แต่ไม่ยืด — rowValue มี flex: 1 ในแถวที่มีปุ่มต่อท้าย ตัวหนังสือถูกบีบเหลือตัวละบรรทัด
  dateRowText: { fontSize: 13, lineHeight: 21, color: colors.text, fontWeight: "600" },
  // ปุ่มเล็กข้างวันนัด — แบบเดียวกับ "เลื่อนวัน" ของวันคาดว่าอะไหล่เข้า แต่สีฟ้า (ไม่ใช่เรื่องของหมด)
  moveDateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  moveDateBtnText: { fontSize: 12.5, fontWeight: "700", color: colors.primaryInk },
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
  brandFixLink: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 6 },
  brandFixText: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.primary },
  brandFixNow: { fontWeight: "400", color: colors.textMuted },
  // ตอนช่างเข้างานแอดมินมีสามปุ่ม (เลื่อนวันนัด · แจ้งปัญหา · ปิดงาน) — จอมือถือไม่พอแถวเดียว ขึ้นบรรทัดใหม่แทนการบีบ
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  waitingRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: spacing.sm },
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
  actionProblem: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.navy },
  actionProblemText: { color: colors.navy, fontSize: 15, lineHeight: 24, fontWeight: "700" },
  actionSecondaryText: { color: colors.primary, fontSize: 15, lineHeight: 24, fontWeight: "700" },
  logBody: { flex: 1, minWidth: 0 },
  logAction: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  logMeta: { fontSize: 11, lineHeight: 19, color: colors.textFaint },
  stepInfoRow: { paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
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
  // แถบส่งไม่สำเร็จใต้หัวฟอร์ม — ตัวหนังสือเข้มบนพื้นแดงอ่อน อ่านออกกลางแดด (ตามตัวอย่างที่เจ้าของงานเลือก)
  sendErr: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: colors.dangerSoft,
    borderBottomWidth: 2,
    borderBottomColor: colors.danger,
  },
  sendErrTitle: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.dangerInk },
  sendErrText: { fontSize: 13, lineHeight: 19, color: colors.dangerInk },
  // แถบเลิกเคลม — พื้นฟ้าอ่อนแบบกล่องแจ้งข้อมูล ไม่ใช่แดง: ส่งเคลมไม่ใช่ข้อผิดพลาด แค่บอกทางถอย
  quitBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.primaryLine,
  },
  quitRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  quitText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 19, color: colors.text },
  quitBtn: {
    paddingHorizontal: 12,
    minHeight: 36,
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    backgroundColor: colors.card,
  },
  quitBtnText: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
  // ยังส่งไม่ได้ (ช่องที่ถูกชี้ยังเหมือนเดิม) — เหลืองเข้มบนพื้นเหลืองอ่อน: เป็นคำเตือนให้ทำต่อ ไม่ใช่ระบบพัง
  fixBlocked: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    backgroundColor: colors.warningSoft,
    borderBottomWidth: 2,
    borderBottomColor: colors.warning,
  },
  fixBlockedText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.warningInk },
  foldBtn: { minHeight: 48, justifyContent: "center", marginTop: spacing.xs },
  foldText: { fontSize: 14, fontWeight: "700", color: colors.primaryInk },
  foldLine: { fontSize: 13, lineHeight: 20, color: colors.body },
  modalActions: { flex: 1, flexDirection: "row", gap: spacing.sm },
  // บรรทัดเขียว "แอดมินแก้เป็นงานด่วน" ในฟอร์มปล่อยงาน (ตัวอย่าง urgentNote) — บรรทัดเดียว ไม่แย่งที่กล่องคอนเฟิร์ม
  urgentDayNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: colors.successSoft,
    borderColor: colors.successLine,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  urgentDayText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 19, fontWeight: "600", color: colors.successInk },
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
    backgroundColor: colors.navyFill,
  },
  modalSaveOff: { opacity: 0.6 },
  // ปุ่มล่างตอนยังขาด — ส้มอ่อนตัวหนังสือเข้ม (ตัวอย่างที่เจ้าของงานเลือก) ไม่ใช่ปุ่มจาง: กดได้ กดแล้วพาไปช่องที่ขาด
  closeGo: { backgroundColor: colors.warningSoft, borderWidth: 2, borderColor: colors.warning },
  closeGoText: { color: colors.warningInk, fontSize: 14, lineHeight: 22, fontWeight: "800", textAlign: "center" },
  flashFrame: {
    position: "absolute",
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderWidth: 3,
    borderColor: colors.danger,
    borderRadius: radius.md,
    zIndex: 2,
  },
  claimKeepBox: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerLine,
    gap: spacing.xs,
  },
  claimKeepReason: { fontSize: 13, lineHeight: 20, color: colors.dangerInk },
  claimKeepBtn: {
    alignSelf: "flex-start",
    minHeight: 48,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  claimKeepBtnText: { fontSize: 14, fontWeight: "700", color: colors.primaryInk },
  claimKeepUndo: { alignSelf: "flex-start", minHeight: 48, justifyContent: "center", paddingHorizontal: 12 },
  claimKeepUndoText: { fontSize: 13, fontWeight: "700", color: colors.primaryInk },
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
  claimOld: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 },
  claimOldBtn: { minHeight: 44, justifyContent: "center" },
  claimOldLabel: { fontSize: 14, fontWeight: "700", color: colors.body },
  claimOldLine: { fontSize: 13, lineHeight: 19, color: colors.body },
  freshBadge: {
    position: "absolute",
    top: 3,
    left: 3,
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
    // navyFill ไม่ใช่ primaryInk — primaryInk โหมดมืดเป็นฟ้าอ่อน ตัวขาวบนนั้นอ่านไม่ออก ป้ายที่บอกว่าอะไรเปลี่ยนจะหายไป
    backgroundColor: colors.navyFill,
    borderRadius: 4,
    paddingHorizontal: 4,
    overflow: "hidden",
  },
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
  claimReason: { minHeight: 64 },
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
  // รอบเลือกอะไหล่ของช่าง — ฟ้ารอคอนเฟิร์ม · แดงถูกตีกลับ · เขียวคอนเฟิร์มแล้ว (สีของตัวอย่างที่อนุมัติ ใช้โทเคนธีมให้โหมดมืดอ่านออก)
  pickBlue: {
    gap: 4,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    backgroundColor: colors.primarySoft,
  },
  pickGreen: {
    gap: 4,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.successLine,
    backgroundColor: colors.successSoft,
  },
  pickRed: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.dangerLine,
    backgroundColor: colors.dangerSoft,
  },
  pickHead: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.textMuted },
  pickBlueTitle: { fontSize: 14, lineHeight: 20, fontWeight: "800", color: colors.primaryInk },
  pickGreenTitle: { fontSize: 14, lineHeight: 20, fontWeight: "800", color: colors.successInk },
  pickRedTitle: { fontSize: 14, lineHeight: 20, fontWeight: "800", color: colors.dangerInk },
  pickRedReason: { fontSize: 14, lineHeight: 21, color: colors.dangerInk },
  pickRedMeta: { fontSize: 12.5, lineHeight: 19, color: colors.body },
  pickSub: { fontSize: 13, lineHeight: 19, color: colors.body },
  pickList: { marginTop: 2 },
  pickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pickRowName: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, color: colors.text },
  pickRowQty: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.text },
  trackNote: { color: colors.dangerInk, fontWeight: "700" },
  keepFiles: {
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.successInk,
    backgroundColor: colors.successSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: "hidden",
  },
  stepHint: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
  flagRemoved: { fontSize: 12.5, lineHeight: 19, fontWeight: "600", color: colors.successInk },
  // แถบปักใต้หัวฟอร์มผลตรวจ (ด่านส่งใหม่) — หน้าตาเดียวกับ fixBlocked ของฟอร์มแก้เคลม: คำเตือนให้ทำต่อ ไม่ใช่ระบบพัง
  gateBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: colors.warningSoft,
    borderBottomWidth: 2,
    borderBottomColor: colors.warning,
  },
  gateText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.warningInk },
  // จอคอนเฟิร์มอะไหล่ (ตัวอย่าง supView review) — สีของตัวอย่างที่อนุมัติ ผ่านโทเคนธีมให้โหมดมืดอ่านออก
  cfMsgErr: { backgroundColor: colors.dangerSoft, borderBottomColor: colors.danger },
  cfCard: {
    gap: 6,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  cfBranch: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.text },
  cfMachine: { fontSize: 13, lineHeight: 19, color: colors.body },
  cfFileChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  cfFileChipText: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: colors.primaryInk },
  cfMuted: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  cfMutedDark: { fontSize: 12.5, lineHeight: 19, color: colors.body },
  cfResend: {
    gap: 2,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    backgroundColor: colors.primarySoft,
  },
  cfResendTitle: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.primaryInk },
  cfResendLine: { fontSize: 13, lineHeight: 19, color: colors.primaryInk },
  cfTitle: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.text },
  cfNote: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
    backgroundColor: colors.rowAlt,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    overflow: "hidden",
  },
  cfHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, flexWrap: "wrap" },
  cfAllOk: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.successInk,
    backgroundColor: colors.card,
  },
  cfAllOkText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.successInk },
  cfRow: { gap: 8, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  cfRowOk: { borderWidth: 2, borderColor: colors.successInk, backgroundColor: colors.successSoft },
  cfRowNo: { borderWidth: 2, borderColor: colors.dangerInk, backgroundColor: colors.dangerSoft },
  cfRowTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  cfRowName: { fontSize: 14, lineHeight: 20, color: colors.text },
  cfTag: {
    alignSelf: "flex-start",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: colors.primaryInk,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  // ส้มเดียวกับป้าย "ข้ามยี่ห้อ" ในช่องเลือกอะไหล่ (PartPicker TAG_COLORS.cross)
  cfCrossTag: {
    alignSelf: "flex-start",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: colors.rollbackInk,
    backgroundColor: colors.rollbackSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  // สีเดียวกับป้าย "นอกเครื่อง" ในช่องเลือกอะไหล่ (PartPicker TAG_COLORS.outside)
  cfOutsideTag: {
    alignSelf: "flex-start",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: colors.service,
    backgroundColor: colors.serviceSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  cfQty: { fontSize: 15, lineHeight: 20, fontWeight: "700", color: colors.text },
  // ปุ่มตรง/ไม่ตรงอยู่ใต้ชื่อเสมอ — ชื่ออะไหล่ยาว บนมือถือวางข้างชื่อแล้วชื่อถูกบีบเหลือคำเดียว
  cfMarks: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cfMarkBtn: {
    flex: 1,
    minWidth: 120,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: colors.card,
  },
  cfOkBtn: { borderColor: colors.successInk },
  cfOkOn: { backgroundColor: colors.successInk },
  cfNoBtn: { borderColor: colors.dangerInk },
  cfNoOn: { backgroundColor: colors.dangerInk },
  cfMarkText: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
  cfRemoved: {
    gap: 4,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSoft,
  },
  cfRemovedTitle: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.warningInk },
  cfRemovedLine: { fontSize: 13, lineHeight: 19, color: colors.text },
  cfLink: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingVertical: 6 },
  cfLinkText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.primaryInk, textDecorationLine: "underline" },
  cfReject: {
    gap: 8,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.dangerLine,
    backgroundColor: colors.dangerSoft,
  },
  cfRejectLabel: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.dangerInk },
  cfRejectFlags: { fontSize: 12.5, lineHeight: 19, color: colors.dangerInk },
  cfQuick: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cfQuickChip: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.dangerLine,
    backgroundColor: colors.card,
  },
  cfQuickText: { fontSize: 13, lineHeight: 19, fontWeight: "600", color: colors.dangerInk },
  cfReason: { minHeight: 80, backgroundColor: colors.card },
  cfZoom: { gap: spacing.sm },
  cfZoomHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  cfZoomTitle: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.text },
  cfZoomBtn: {
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 10,
    backgroundColor: colors.sky50,
  },
  cfZoomBtnText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.primaryInk },
  cfZoomImg: { width: "100%", height: 360, borderRadius: 10, backgroundColor: colors.tile },
  cfZoomWait: { alignItems: "center", justifyContent: "center", padding: spacing.md },
  cfZoomNav: { flexDirection: "row", gap: spacing.sm },
  cfFootCol: { flex: 1, gap: spacing.sm },
  cfFootPair: { flexDirection: "row", gap: spacing.sm },
  cfBackBtn: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.dangerSoft,
  },
  cfBackText: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.dangerInk },
  // ยังตรวจไม่ครบ — ปุ่มคอนเฟิร์มสีจาง (ตัวอย่าง okBg) แต่ไม่ใช่ปุ่มปิด: กดได้และบอกว่าขาดอะไร
  cfSaveMuted: { backgroundColor: colors.border },
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
  claimLocked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.rowAlt,
  },
  claimLockedRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  claimLockedText: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  claimMachineLocked: {
    gap: 6,
    borderWidth: 1,
    borderColor: colors.successLine,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  claimDeclined: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: colors.rowAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  claimDeclinedText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 19, color: colors.body },
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
