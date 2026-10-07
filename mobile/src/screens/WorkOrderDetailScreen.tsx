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
  TouchableOpacity,
  View,
} from "react-native";
import Spinner from "../components/Spinner";
import AppModal, { ModalRow } from "../components/AppModal";
import PopupScreen from "../components/PopupScreen";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import PartPicker, { PickedPart } from "../components/PartPicker";
import DateField, { thaiDate } from "../components/DateField";
import TimeField, { isTime } from "../components/TimeField";
import Dropdown from "../components/Dropdown";
import WorkOrderAttachments, { Attachment, openAttachment } from "../components/WorkOrderAttachments";
import {
  PickedAttachment,
  pickImageAttachment,
  pickVideoAttachment,
  uploadAttachment,
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
  statusLabel: string;
  note: string | null;
  byName: string | null;
  createdAt: string;
}

interface WorkOrder {
  id: number;
  code: string;
  source: string;
  title: string;
  detail: string | null;
  status: string;
  statusLabel: string;
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
  /** ใบเดิมที่ใบนี้แยกออกมา (ใบรออะไหล่) */
  parent: LinkedOrder | null;
  /** ใบรออะไหล่ที่แยกออกไปจากใบนี้ */
  children: LinkedOrder[];
  createdByName: string | null;
  createdAt: string;
  closedAt: string | null;
  closedByName: string | null;
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
  hasReceipt: boolean;
  /** จำนวนรูป/วิดีโอหน้างาน (ไม่นับใบเหลืองกับป้ายรุ่น) — ต้องมีอย่างน้อยหนึ่งถึงจะปิดงานได้ */
  siteFileCount: number;
  /** คนที่เข้าไปทำจริง บันทึกตอนปิดงาน */
  workers: Technician[];
  otherWorkers: string | null;
  logs: LogEntry[];
}

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
const STAGE_BUTTON: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  NEW: { label: "ระบุอะไหล่ที่ต้องใช้", icon: "arrow-forward-circle" },
  INSPECTING: { label: "บันทึกผลตรวจหน้างาน", icon: "search-outline" },
  WAITING_PARTS: { label: "อะไหล่มาแล้ว ส่งต่อให้เบิก", icon: "cube-outline" },
  PARTS_REQUESTED: { label: "เช็คอะไหล่ในคลัง", icon: "arrow-forward-circle" },
  AWAITING_QUOTE: { label: "เสนอราคาลูกค้า", icon: "document-text-outline" },
  AWAITING_PAYMENT: { label: "ลูกค้าจ่ายเงินแล้ว", icon: "cash-outline" },
  PARTS_CHECKED: { label: "จ่ายงานให้ช่าง", icon: "arrow-forward-circle" },
  ASSIGNED: { label: "นัดลูกค้า", icon: "calendar-outline" },
  AWAITING_CONFIRM: { label: "ลูกค้าคอนเฟิร์มนัด", icon: "checkmark-circle-outline" },
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
function isSkipped(value: string, o: WorkOrder, stages: Stage[]) {
  const at = (v: string) => stages.findIndex((x) => x.value === v);
  switch (value) {
    case "PARTS_REQUESTED":
      return o.needsParts === false;
    case "AWAITING_QUOTE":
      return o.needsQuote === false && !o.hasQuote;
    case "AWAITING_PAYMENT":
      return o.needsQuote === false && !o.hasReceipt;
    // ตรวจหน้างานเป็นทางเลือก — ใบที่ไม่เคยส่งตรวจไม่ได้ผ่านขั้นนี้
    case "INSPECTING":
      return o.status !== "INSPECTING" && !o.inspectedAt;
    // นัดที่ลูกค้าคอนเฟิร์มตั้งแต่โทรนัด (หรือแอดมินเลือกวันให้) ไม่ต้องรอคอนเฟิร์มอีกรอบ
    case "AWAITING_CONFIRM":
      return (
        o.status !== "AWAITING_CONFIRM" &&
        (o.status === "DONE" || at(o.status) > at("AWAITING_CONFIRM")) &&
        !o.logs.some((l) => l.action === "CONFIRMED")
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

export default function WorkOrderDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { user } = useAuth();
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [results, setResults] = useState<Option[]>([]);
  const [workStatuses, setWorkStatuses] = useState<Option[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editingNote, setEditingNote] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const stepScroll = useRef<ScrollView>(null);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  // ย้อนขั้นตอน (แอดมิน/หัวหน้าภาค) — คนละอย่างกับ rollbackOpen ที่เป็นช่างส่งกลับ
  const [stageBackOpen, setStageBackOpen] = useState(false);
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

  const load = useCallback(async () => {
    try {
      const [detail, options] = await Promise.all([
        api.get<WorkOrder>(`/work-orders/${id}`),
        api.get<{
          results: Option[];
          workStatuses: Option[];
          stages: Stage[];
          warehouses: string[];
          technicians: Technician[];
          teams: Team[];
        }>("/work-orders/options"),
      ]);
      setOrder(detail.data);
      setResults(options.data.results);
      setWorkStatuses(options.data.workStatuses);
      setStages(options.data.stages);
      setWarehouses(options.data.warehouses);
      setTechnicians(options.data.technicians);
      setTeams(options.data.teams ?? []);
      setError(null);
    } catch (e) {
      setError(apiErrorMessage(e));
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
      if (o.assignedTeam !== null) return o.assignedTeam === user.team;
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
    if (order.status === "IN_PROGRESS") setClosing(true);
    else setStageOpen(true);
  }

  /**
   * ไฟล์ที่ถูกแนบในรอบที่ปิดงาน
   *
   * ไม่มี roundStartedAt (ใบเก่ามากที่ไม่มีประวัติการจ่ายงาน) ก็เอาทั้งหมด
   * ดีกว่าโชว์ว่าไม่มีรูปเลยทั้งที่มี
   */
  const closeFiles = order.closedAt
    ? files.filter((f) => !order.roundStartedAt || f.createdAt >= order.roundStartedAt)
    : [];

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
    (x) => x.value !== "WAITING_PARTS" || order.parent !== null || order.status === "WAITING_PARTS"
  );
  /**
   * ขั้นที่ย้อนกลับไปได้ — ขั้นก่อนหน้าที่ใบนี้ผ่านมาจริง ไม่นับขั้นที่ข้าม
   * ย้อนไปขั้นที่ไม่เคยผ่านคือการเดินใบงานไปทางที่ไม่ควรมีอยู่
   */
  const backTargets = (() => {
    const at = shownStages.findIndex((x) => x.value === order.status);
    return shownStages
      .slice(0, Math.max(0, at))
      .filter((x) => x.value !== "DONE" && !isSkipped(x.value, order, stages))
      .reverse();
  })();
  const canStepBack =
    (user?.role === "ADMIN" || user?.role === "SUPERVISOR") &&
    order.status !== "DONE" &&
    order.status !== "CANCELLED" &&
    backTargets.length > 0;

  // เปิดใบรออะไหล่ต่อได้ตั้งแต่ทีมรับงานแล้ว — ก่อนนั้นยังแก้รายการอะไหล่ในใบนี้ได้เอง
  const canFollowUp =
    ["ASSIGNED", "AWAITING_CONFIRM", "IN_PROGRESS", "DONE"].includes(order.status) &&
    (user?.role === "ADMIN" ||
      user?.role === "SUPERVISOR" ||
      (order.assignedTeam !== null && order.assignedTeam === user?.team));

  const tone = statusTone(order.status);
  const done = order.status === "DONE" || order.status === "CANCELLED";
  const mine =
    order.assignedToName === user?.name ||
    (order.assignedTeam !== null && order.assignedTeam === user?.team);

  return (
    <PopupScreen
      title={order.code}
      subtitle="ใบงานซ่อม"
      backLabel={`ใบงาน ${order.code}`}
      right={
        <View style={[styles.badge, { backgroundColor: tone.bg }]}>
          <Text style={[styles.badgeText, { color: tone.fg }]}>{order.statusLabel}</Text>
        </View>
      }
    >
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      onLayout={(e) => setBodyWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.card}>
        <View style={styles.headRow}>
          <Text style={[styles.code, headingFont]}>{order.code}</Text>
          <View style={{ flex: 1 }} />
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.badgeText, { color: tone.fg }]}>{order.statusLabel}</Text>
          </View>
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
        <ScrollView
          ref={stepScroll}
          // ชื่อของแถบ — หัวข้อ "ขั้นตอนงาน" ถูกเอาออกตอนย้ายแถบขึ้นบนสุด
          // คนใช้โปรแกรมอ่านจอกับเทสต์ (stageorder-web-test) หาแถบนี้จากชื่อนี้
          accessibilityLabel="ขั้นตอนงาน"
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.steps}
        >
        {shownStages.map((stage, i) => {
          const currentIndex = shownStages.findIndex((x) => x.value === order.status);
          const skipped = isSkipped(stage.value, order, stages);
          // ตรวจหน้างานแล้วใบงานวนกลับไปขั้นแรก ขั้นตรวจจึงอยู่ "หลัง" ขั้นปัจจุบัน
          // ตามลำดับ แต่ทำไปแล้วจริง — ต้องขึ้นว่าทำแล้ว ไม่ใช่ยังไม่ถึง
          const doneOutOfOrder =
            stage.value === "INSPECTING" && !!order.inspectedAt && order.status !== "INSPECTING";
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
          const number = shownStages
            .slice(0, i + 1)
            .filter((x) => !isSkipped(x.value, order, stages)).length;
          return (
            <TouchableOpacity
              key={stage.value}
              style={styles.step}
              activeOpacity={0.7}
              onPress={() => pressStep(stage.value, state)}
              accessibilityLabel={stage.label}
              // จอแคบเห็นแค่สามขั้นแรก — เลื่อนให้ขั้นปัจจุบันอยู่ในจอเอง
              // ไม่งั้นใบที่เดินมาถึงขั้นห้าจะเปิดมาเห็นแต่ขั้นที่ผ่านไปแล้ว
              onLayout={
                state === "now"
                  ? (e) => stepScroll.current?.scrollTo({ x: i === 0 ? 0 : Math.max(0, e.nativeEvent.layout.x - 60), animated: false })
                  : undefined
              }
            >
              {i > 0 ? (
                <View
                  style={[styles.stepLine, (state === "done" || state === "now") && styles.stepLineDone]}
                />
              ) : null}
              <View
                style={[
                  styles.stepDot,
                  state === "done" && styles.stepDotDone,
                  state === "now" && styles.stepDotNow,
                  state === "skipped" && styles.stepDotSkipped,
                ]}
              >
                {state === "done" ? (
                  <Ionicons name="checkmark" size={15} color="#fff" />
                ) : (
                  <Text style={[styles.stepNum, headingFont, state === "now" && styles.stepNumNow]}>
                    {state === "skipped" ? "–" : number}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stageLabel,
                  state === "now" && styles.stageLabelNow,
                  (state === "future" || state === "skipped") && styles.stageLabelFuture,
                  state === "skipped" && styles.stageLabelSkipped,
                ]}
              >
                {stage.label}
              </Text>
              {state === "skipped" ? (
                <Text style={styles.stageActor}>ข้าม</Text>
              ) : stage.actorLabel && state !== "done" ? (
                <Text style={styles.stageActor}>{stage.actorLabel}</Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
        </ScrollView>

        {!done ? (
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
                      {STAGE_BUTTON[order.status]?.label ?? "ทำขั้นนี้"}
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
                    จบงานไม่ได้ ส่งกลับให้หัวหน้าภาค — เลือกอะไหล่ที่ต้องเบิกเพิ่มได้
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <View style={[styles.waitingCard, styles.waitingInline]}>
              <Ionicons name="hourglass-outline" size={16} color={colors.textMuted} />
              <Text style={styles.waitingText}>
                ขั้นนี้รอ{order.stageActorLabel ?? "คนอื่น"}
                {order.stageActor === "EMPLOYEE" && (order.assignedToName ?? order.assignedTeam)
                  ? ` (${order.assignedToName ?? order.assignedTeam})`
                  : ""}
                {" "}— ยังไม่ถึงคิวของคุณ
              </Text>
            </View>
          )
        ) : null}
      </View>

      <View style={[styles.infoGrid, twoCol && styles.infoGridWide]}>
        <View style={[styles.card, styles.infoCard]}>
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

        <View style={[styles.card, styles.infoCard]}>
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
      <View style={styles.card}>
        <View style={styles.headRow}>
          <Text style={styles.sectionTitle}>อาการ / สถานะ</Text>
          <View style={{ flex: 1 }} />
          {!done ? (
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
                        <Text style={styles.stockOut}>หมด</Text>
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
        canEdit={!done || user?.role === "ADMIN"}
        reloadKey={filesKey}
        onLoaded={setFiles}
      />

      {/*
        ใบที่ปิดแล้วไม่ต้องขึ้นการ์ดนี้ เพราะคำตอบเดียวกันไปอยู่ในการ์ดผลการทำงาน
        ซึ่งเป็นที่ที่คนเปิดดูใบที่ปิดแล้วมองหาอยู่แล้ว — สองการ์ดที่พูดเรื่องเดียวกัน
        คือการบังคับให้คนอ่านสองรอบเพื่อรู้เท่าเดิม
      */}
      {order.outageId !== null && !order.closedAt ? (
        <View style={[styles.card, styles.linked]}>
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

      {order.closedAt ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ผลการทำงาน</Text>
          <Row label="ผล" value={order.closeResultLabel ?? "—"} />
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
          <Row label="ปิดโดย" value={`${order.closedByName ?? "—"} · ${formatDateTime(order.closedAt)}`} />
          {order.closeNote ? <Text style={styles.detail}>{order.closeNote}</Text> : null}

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
              <View style={styles.closeFiles}>
                {closeFiles.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    style={styles.closeFile}
                    activeOpacity={0.8}
                    onPress={() => openAttachment(order.id, f)}
                    accessibilityLabel={`เปิด ${f.fileName}`}
                  >
                    {f.thumbnailDataUrl ? (
                      <Image source={{ uri: f.thumbnailDataUrl }} style={styles.closeThumb} />
                    ) : (
                      <View style={[styles.closeThumb, styles.slipBlank]}>
                        <Ionicons
                          name={f.kind === "VIDEO" ? "videocam-outline" : "image-outline"}
                          size={20}
                          color={colors.textFaint}
                        />
                      </View>
                    )}
                    {f.roleLabel ? (
                      <View style={styles.closeBadge}>
                        <Text style={styles.closeBadgeText}>{f.roleLabel}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
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

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>ประวัติ</Text>
        {order.logs.map((log) => (
          <View key={log.id} style={styles.logRow}>
            <View style={styles.dot} />
            <View style={styles.logBody}>
              <Text style={styles.logAction}>{log.actionLabel}</Text>
              <Text style={styles.logMeta}>
                {log.byName ?? "—"} · {formatDateTime(log.createdAt)}
              </Text>
              {log.note ? <Text style={styles.logNote}>{log.note}</Text> : null}
            </View>
          </View>
        ))}
      </View>

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
        onCancel={() => setRollbackOpen(false)}
        onDone={async () => {
          setRollbackOpen(false);
          // ส่งกลับอาจแนบรูปที่เจอหน้างานไปด้วย การ์ดไฟล์แนบต้องโหลดใหม่ถึงจะเห็น
          setFilesKey((k) => k + 1);
          await load();
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

      <StageBackModal
        visible={stageBackOpen}
        order={order}
        targets={backTargets}
        onCancel={() => setStageBackOpen(false)}
        onDone={async () => {
          setStageBackOpen(false);
          await load();
        }}
      />

      <StageModal
        visible={stageOpen}
        order={order}
        warehouses={warehouses}
        teams={teams}
        onCancel={() => setStageOpen(false)}
        onDone={async () => {
          setStageOpen(false);
          // ขั้นเสนอราคาแนบใบเสนอราคา/บิลไปด้วย การ์ดไฟล์แนบต้องโหลดใหม่ถึงจะเห็น
          setFilesKey((k) => k + 1);
          await load();
        }}
      />

      <NoteModal
        visible={editingNote}
        order={order}
        workStatuses={workStatuses}
        onCancel={() => setEditingNote(false)}
        onDone={async () => {
          setEditingNote(false);
          await load();
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
          await load();
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
  INSPECTING: ["INSPECTED"],
  WAITING_PARTS: ["PARTS_ARRIVED"],
  AWAITING_QUOTE: ["QUOTED", "QUOTE_SKIPPED"],
  AWAITING_PAYMENT: ["PAID"],
  PARTS_REQUESTED: ["PARTS_CHECKED"],
  PARTS_CHECKED: ["ASSIGNED"],
  ASSIGNED: ["SCHEDULED"],
  AWAITING_CONFIRM: ["CONFIRMED"],
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
  const log = logs.find((l) => actions.includes(l.action));
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
  onCancel,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [parts, setParts] = useState<PickedPart[]>([]);
  const [files, setFiles] = useState<PickedAttachment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
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
      title={<>จบงานไม่ได้ · {order.code}</>}
      footer={
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.modalCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalSave, (saving || !reason.trim()) && styles.modalSaveOff]}
            onPress={submit}
            disabled={saving || !reason.trim()}
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
        ใบงานจะกลับไปขั้นแรกให้หัวหน้าภาคดู แล้วส่งต่อให้แอดมินเช็คคลัง
        วันนัดและผลเช็คคลังรอบก่อนจะถูกล้าง แต่ประวัติทั้งหมดยังอยู่ในใบเดิม
      </Text>

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
    const all = ["NEW", "INSPECTING", "AWAITING_QUOTE", "AWAITING_PAYMENT", "WAITING_PARTS", "PARTS_REQUESTED", "PARTS_CHECKED", "ASSIGNED"];
    const idx = all.indexOf(value);
    const lost: string[] = [];
    if (idx >= 0 && idx <= all.indexOf("ASSIGNED") && order.scheduledAt) lost.push("วันนัด");
    if (idx >= 0 && idx <= all.indexOf("PARTS_CHECKED") && value !== "INSPECTING" && order.assignedTeam)
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
  onCancel,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  warehouses: string[];
  teams: Team[];
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
  const [busy, setBusy] = useState<string | null>(null);
  const [visit, setVisit] = useState("");
  const [visitTime, setVisitTime] = useState("");
  // ขั้นระบุอะไหล่: ตัวเลือกที่สาม "ต้องเข้าตรวจสอบหน้างานก่อน"
  const [inspectFirst, setInspectFirst] = useState(false);
  // ขั้นตรวจหน้างาน: ผลตรวจ + รูป
  const [finding, setFinding] = useState("");
  const [photos, setPhotos] = useState<PickedAttachment[]>([]);
  // ขั้นนัดลูกค้า
  const [appointment, setAppointment] = useState<"PENDING" | "CONFIRMED" | "ADMIN_PICKED" | null>(null);
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
    setInspectFirst(order.status === "NEW" && order.jobType === "INSPECT" && !order.inspectedAt);
    setFinding("");
    setPhotos([]);
    setAppointment(null);
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

  async function addPhoto(
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | null>
  ) {
    setBusy("กำลังเตรียมไฟล์");
    try {
      const file = await pick(setBusy);
      if (file) setPhotos((v) => [...v, file]);
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
        // รูปขึ้นก่อนผล — ผลขึ้นแล้วใบงานไปโผล่ที่หัวหน้าภาคทันที ต้องเห็นรูปพร้อมกัน
        for (const [i, file] of photos.entries()) {
          setBusy(`กำลังส่งรูป ${i + 1}/${photos.length}`);
          await uploadAttachment(order.id, file);
        }
        await api.post(`/work-orders/${order.id}/inspection`, { note: finding.trim() });
      } else if (order.status === "WAITING_PARTS") {
        await api.post(`/work-orders/${order.id}/parts-arrived`, { note: note.trim() || undefined });
      } else if (order.status === "AWAITING_CONFIRM") {
        await api.post(`/work-orders/${order.id}/confirm-appointment`, {
          scheduledAt: visit,
          scheduledTime: visitTime || null,
          note: note.trim() || undefined,
        });
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
      } else if (order.status === "PARTS_CHECKED") {
        await api.post(`/work-orders/${order.id}/assign`, {
          team,
          note: note.trim() || undefined,
        });
      } else {
        await api.post(`/work-orders/${order.id}/schedule`, {
          scheduledAt: visit,
          scheduledTime: visitTime || null,
          appointment,
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
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(visit);
  const timeOk = visitTime === "" || isTime(visitTime);

  const blocked =
    quoteBlocked ||
    paymentBlocked ||
    (order.status === "NEW" &&
      (inspectFirst
        ? !team || (visit !== "" && !validDate) || !timeOk
        : needsParts === null || (needsParts && parts.length === 0))) ||
    (order.status === "INSPECTING" && !finding.trim()) ||
    (order.status === "PARTS_CHECKED" && !team) ||
    (order.status === "ASSIGNED" && (!validDate || !timeOk || appointment === null)) ||
    (order.status === "AWAITING_CONFIRM" && (!validDate || !timeOk)) ||
    unchecked ||
    needsRequisition;

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
              <Text style={styles.modalSaveText}>ยืนยัน</Text>
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
                      ส่งทีมไปดูก่อน — ทีมบันทึกผลตรวจแล้วใบงานจะกลับมาให้ระบุอะไหล่จากผลนั้น
                    </Text>
                    <DateField
                      value={visit}
                      onChange={setVisit}
                      label="วันที่เข้าตรวจ"
                      emptyHint="เว้นว่างได้ — ใบงานจะไปรอในรายการรอจัดแผน"
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
                <Text style={styles.linkedText}>
                  {mixed && splitOut
                    ? "ตัวที่หมดจะย้ายไปใบงานใหม่ที่ลิงก์กับใบนี้ ใบนี้ไปขั้นจ่ายงานต่อ"
                    : "มีตัวไหนหมด ใบงานจะขึ้นสถานะ “รออะไหล่” และค้างที่ขั้นนี้จนของครบ"}
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
                          <Text style={styles.optionText}>เลือกไฟล์</Text>
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

            {order.status === "PARTS_CHECKED" || (order.status === "NEW" && inspectFirst) ? (
              <>
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
                <Text style={styles.modalLabel}>รูป / วิดีโอหน้างาน (ไม่บังคับ)</Text>
                <FileStrip files={photos} onChange={setPhotos} />
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
                        onPress={() => addPhoto((stage) => pickImageAttachment(true, stage))}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.optionText}>ถ่ายรูป</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.option}
                      onPress={() => addPhoto((stage) => pickImageAttachment(false, stage))}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.optionText}>เลือกรูป</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.option} onPress={() => addPhoto(pickVideoAttachment)} activeOpacity={0.7}>
                      <Text style={styles.optionText}>วิดีโอ</Text>
                    </TouchableOpacity>
                  </View>
                )}
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

            {order.status === "ASSIGNED" || order.status === "AWAITING_CONFIRM" ? (
              <>
                {order.status === "AWAITING_CONFIRM" ? (
                  <Text style={styles.linkedText}>
                    นัดไว้ {visitLabel(order)} — ลูกค้าขอเปลี่ยนเวลา แก้ได้ในนี้เลย
                    ถ้ายกเลิกนัด ใช้ “ย้อนขั้นตอน” กลับไปนัดใหม่
                  </Text>
                ) : null}
                <DateField
                  value={visit}
                  onChange={setVisit}
                  label="วันที่จะเข้างาน"
                  emptyHint="ต้องระบุวันก่อนจึงจะส่งต่อได้"
                />
                <TimeField value={visitTime} onChange={setVisitTime} label="เวลานัด" />
                {order.status === "ASSIGNED" ? (
                  <>
                    <Text style={styles.modalLabel}>ลูกค้าตอบว่าอย่างไร</Text>
                    <View style={{ gap: spacing.xs }}>
                      {(
                        [
                          ["PENDING", "รอลูกค้าคอนเฟิร์ม", "โทรแล้ว ลูกค้ายังไม่ยืนยัน — พักไว้ที่ขั้นรอคอนเฟิร์ม"],
                          ["CONFIRMED", "ลูกค้าคอนเฟิร์มแล้ว", "ส่งต่อให้ทีมเข้างานได้เลย"],
                          ["ADMIN_PICKED", "ลูกค้าสะดวกทุกวัน — แอดมินเลือกวันให้", "เฉพาะแอดมิน"],
                        ] as const
                      )
                        .filter(([v]) => v !== "ADMIN_PICKED" || user?.role === "ADMIN")
                        .map(([v, label, hint]) => (
                          <TouchableOpacity
                            key={v}
                            style={[styles.backOption, appointment === v && styles.backOptionOn]}
                            onPress={() => setAppointment(v)}
                            activeOpacity={0.7}
                            accessibilityLabel={label}
                          >
                            <Text style={styles.backOptionText}>{label}</Text>
                            <Text style={styles.backOptionHint}>{hint}</Text>
                          </TouchableOpacity>
                        ))}
                    </View>
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

function NoteModal({
  visible,
  order,
  workStatuses,
  onCancel,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  workStatuses: Option[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const [symptom, setSymptom] = useState(order.symptom ?? "");
  const [workStatus, setWorkStatus] = useState<string | null>(order.workStatus);
  const [parts, setParts] = useState<PickedPart[]>(order.waitingParts);
  const [visit, setVisit] = useState(order.scheduledAt ? order.scheduledAt.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // เปิดฟอร์มใหม่ทุกครั้งให้เห็นค่าล่าสุด ไม่ใช่ค่าที่ค้างจากการเปิดครั้งก่อน
  useEffect(() => {
    if (!visible) return;
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
      title={<>อาการ / สถานะ · {order.code}</>}
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
                name={file.kind === "VIDEO" ? "videocam-outline" : "image-outline"}
                size={22}
                color={colors.textFaint}
              />
            </View>
          )}
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
  const [result, setResult] = useState("FIXED");
  const [note, setNote] = useState("");
  const [needsParts, setNeedsParts] = useState<boolean | null>(null);
  const [parts, setParts] = useState<PickedPart[]>([]);
  const [slip, setSlip] = useState<PickedAttachment | null>(null);
  const [siteFiles, setSiteFiles] = useState<PickedAttachment[]>([]);
  const [nameplate, setNameplate] = useState<PickedAttachment | null>(null);
  const [workerIds, setWorkerIds] = useState<number[]>([]);
  const [otherWorkers, setOtherWorkers] = useState("");
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
  const shotsMissing = siteFiles.length === 0 && order.siteFileCount === 0;
  // งานถูกจ่ายให้ทีม ชื่อคนที่ไปจริงจึงมีอยู่ที่เดียวคือตรงนี้
  const workersMissing = workerIds.length === 0 && !otherWorkers.trim();
  // ป้ายรุ่นต้องถ่ายรอบนี้ ไว้ไล่เทียบว่าไปถูกเครื่อง — รูปเก่าใช้แทนไม่ได้
  const nameplateMissing = !nameplate && !order.hasNameplate;
  // ติ๊กว่าอะไหล่ไม่ครบแต่ไม่ได้บอกว่าขาดตัวไหน — ใบรออะไหล่เปล่า ๆ ไม่มีใครตามของได้
  const followUpMissing = followUp && missing.length === 0;

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
      const queue: { file: PickedAttachment; role?: string }[] = [
        ...siteFiles.map((file) => ({ file })),
        ...(nameplate ? [{ file: nameplate, role: "NAMEPLATE" }] : []),
        ...(slip ? [{ file: slip, role: "REQUISITION" }] : []),
      ];
      for (const [i, item] of queue.entries()) {
        setBusy(`กำลังส่งไฟล์ ${i + 1}/${queue.length}`);
        await uploadAttachment(order.id, item.file, item.role);
      }
      setBusy("กำลังปิดงาน");
      await api.post(`/work-orders/${order.id}/close`, {
        result,
        note: note.trim() || undefined,
        parts: parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
        workerIds,
        otherWorkers: otherWorkers.trim() || null,
      });
      setNote("");
      setParts([]);
      setSlip(null);
      setSiteFiles([]);
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
              (saving || slipMissing || shotsMissing || workersMissing || nameplateMissing || followUpMissing) &&
                styles.modalSaveOff,
            ]}
            onPress={submit}
            disabled={
              saving || slipMissing || shotsMissing || workersMissing || nameplateMissing || followUpMissing
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

      <Text style={styles.modalLabel}>สรุปงานที่ทำ</Text>
      <TextInput
        style={styles.modalInput}
        value={note}
        onChangeText={setNote}
        placeholder="เช่น เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ"
        placeholderTextColor={colors.textFaint}
        multiline
        numberOfLines={3}
        accessibilityLabel="สรุปงานที่ทำ"
      />

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
        รูปหน้างานคือหลักฐานว่าไปถึงจริงและเจออะไร — สรุปงานที่พิมพ์มา
        เป็นคำบอกเล่า ใบงานที่ปิดโดยไม่มีรูปเลยคือใบที่ตรวจย้อนไม่ได้
      */}
      <Text style={styles.modalLabel}>รูป / วิดีโอหน้างาน</Text>
      {order.siteFileCount > 0 ? (
        <Text style={styles.linkedText}>
          แนบไว้แล้ว {order.siteFileCount} ไฟล์ในใบงานนี้ — เพิ่มได้อีก
        </Text>
      ) : null}
      <FileStrip files={siteFiles} onChange={setSiteFiles} />
      {busy ? null : (
        <View style={styles.options}>
          {Platform.OS !== "web" ? (
            <TouchableOpacity
              style={styles.option}
              onPress={() =>
                pickOne(
                  (stage) => pickImageAttachment(true, stage),
                  (f) => setSiteFiles((v) => [...v, f])
                )
              }
              activeOpacity={0.7}
            >
              <Text style={styles.optionText}>ถ่ายรูป</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.option}
            onPress={() =>
              pickOne(
                (stage) => pickImageAttachment(false, stage),
                (f) => setSiteFiles((v) => [...v, f])
              )
            }
            activeOpacity={0.7}
          >
            <Text style={styles.optionText}>เลือกรูป</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.option}
            onPress={() => pickOne(pickVideoAttachment, (f) => setSiteFiles((v) => [...v, f]))}
            activeOpacity={0.7}
          >
            <Text style={styles.optionText}>วิดีโอ</Text>
          </TouchableOpacity>
        </View>
      )}
      {shotsMissing ? (
        <Text style={styles.warn}>ต้องแนบรูปหรือวิดีโอหน้างานอย่างน้อยหนึ่งไฟล์</Text>
      ) : null}

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
            ใบใหม่ไปอยู่ที่หัวหน้าภาค สถานะ “รออะไหล่เข้า” และลิงก์กับใบนี้
          </Text>
        </>
      ) : null}

      {error ? <Text style={styles.modalError}>{error}</Text> : null}
    </AppModal>
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
  issuedTitle: { fontSize: 12, lineHeight: 20, fontWeight: "700", color: colors.textMuted },
  issuedLine: { fontSize: 12, lineHeight: 20, color: colors.text },
  issuedHint: { fontSize: 11, lineHeight: 19, color: colors.textFaint, paddingTop: 3 },
  optionOut: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  optionTextOut: { color: colors.danger },
  steps: { flexDirection: "row", paddingTop: spacing.sm, minWidth: "100%" },
  step: { flex: 1, minWidth: 104, alignItems: "center", paddingHorizontal: 4 },
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
  code: { fontSize: 22, lineHeight: 30, fontWeight: "800", color: colors.primaryInk },
  badge: { borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: spacing.sm },
  badgeText: { fontSize: 11, lineHeight: 19, fontWeight: "700" },
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
  logRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, marginTop: 8 },
  logBody: { flex: 1, minWidth: 0 },
  logAction: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  logMeta: { fontSize: 11, lineHeight: 19, color: colors.textFaint },
  logNote: { fontSize: 12, lineHeight: 20, color: colors.textMuted, marginTop: 2 },
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
  slipThumb: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.background },
  slipBlank: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalSaveText: { color: "#fff", fontSize: 14, lineHeight: 22, fontWeight: "700" },
});
