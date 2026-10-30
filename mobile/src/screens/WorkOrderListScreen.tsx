/**
 * รายการใบงาน — สิ่งที่ช่างต้องไปทำ
 *
 * ต่างจากกระดานติดตามเครื่องเสีย ซึ่งบอกว่า "เครื่องไหนมีปัญหา" หน้านี้บอกว่า
 * "ใครต้องไปทำอะไร" เคสหนึ่งอาจมีใบงานหลายใบ ถ้าช่างต้องเข้าไปหลายรอบ
 */
import React, { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { machineTag } from "../utils/machine";
import {
  useWindowDimensions,
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import TouchableOpacity from "../components/Tap";
import { AdminReviewTag, type AdminReviewInfo } from "../components/AdminReview";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import Ionicons from "@expo/vector-icons/Ionicons";
import { HeadFilter, SortDir } from "../components/ColumnFilter";
import {
  ActiveBar,
  ActiveTag,
  FilterButton,
  FilterDropdown,
  FilterGroup,
  FilterSheet,
  QuickChips,
  Toggle,
  ViewTabs,
  isSet,
  pickedLabel,
} from "../components/FilterBar";
import RepairImportModal from "../components/RepairImportModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDocked } from "../components/SideMenu";
import { chromeHide, setChromeOverlay, TAB_BAR_STYLE, useChrome } from "../utils/chrome";
import { countChanges } from "../utils/liveSync";
import { useRefreshHandler } from "../components/RefreshButton";
import UpdatePill, { useBackgroundCheck } from "../components/UpdatePill";
import { feedback } from "../components/Feedback";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage } from "../api/client";
import { useDebounced } from "../utils/useDebounced";
import { useAuth } from "../context/AuthContext";
import { isAreaTeam } from "../utils/areaTeam";
import { regionsOf, regionsText } from "../utils/regions";
import { UrgentBadge, UrgentGlow } from "../components/Urgent";
import WarrantyBadge, { WarrantyState } from "../components/WarrantyBadge";
import { thaiDate, todayBkk } from "../components/DateField";
import { HomeStackParamList } from "../navigation/types";
import { colors, radius, shadow, spacing, headingFont } from "../theme";

type Props = NativeStackScreenProps<HomeStackParamList, "WorkOrderList">;

export interface WorkOrderRow {
  id: number;
  code: string;
  source: string;
  title: string;
  /** อาการบรรทัดแรก — ใบจากฟอร์มชื่อ "งาน CM" เหมือนกันหมด อาการจึงเป็นตัวบอกว่าใบไหน */
  symptom?: string | null;
  status: string;
  statusLabel: string;
  priority: string;
  priorityLabel: string;
  branchCode: string;
  branchName: string;
  machineCode: string | null;
  /** ขนาดเครื่อง (กก.) — ป้าย "W7 · 25 กก." */
  machineCapacityKg?: number | null;
  /** ทีมที่รับงาน — ใบใหม่จ่ายเป็นทีม */
  assignedTeam: string | null;
  /** จ่ายข้ามทีม — ทีมประจำสาขาที่ถูกข้าม (ช่างปิดงานได้ทั้งสองทีม) · ไม่ข้าม = null */
  crossFrom?: string | null;
  /** ช่างรายคน — ใบเก่าก่อนเปลี่ยนมาจ่ายเป็นทีม */
  assignedToName: string | null;
  scheduledAt: string | null;
  scheduledTime?: string | null;
  /** PENDING รอลูกค้าคอนเฟิร์ม · CONFIRMED · ADMIN_PICKED — ว่าง = ยังไม่ได้นัด */
  appointmentStatus?: string | null;
  appointmentStatusLabel?: string | null;
  /** แอดมินที่คอนเฟิร์มนัดล่าสุด — มีเฉพาะนัดที่ตกลงแล้ว */
  appointmentByName?: string | null;
  /** ย้อนขั้นมาจากขั้นไหน (ยังไม่มีใครกดผ่านขั้นนี้) — ไม่ได้ย้อน = null */
  rolledBackFrom?: string | null;
  /** หัวหน้าภาคส่งกลับให้แอดมินตรวจสอบ (ยังไม่ตอบ / ตอบแล้วรอรับทราบ) — ขั้นตอนไม่เปลี่ยน */
  adminReview?: AdminReviewInfo | null;
  /** ขั้นรอเบิกอะไหล่ — วันที่คาดว่าของเข้า */
  partsExpectedAt?: string | null;
  /** อะไหล่ที่เช็คแล้วหมด (นับเฉพาะขั้นที่ยังรอของอยู่) — มากกว่า 0 = ขึ้นป้ายแดง */
  partsOut?: number;
  /**
   * ป้ายอะไหล่ (นัดลูกค้าก่อนเบิก ต.ค. 69) — คำเดียวกันทั้งฝั่งแอดมินและหัวหน้าภาค
   * CHECK รอแอดมินเช็ค · OUT หมด · READY ครบ ยังไม่เบิก · TRANSFER ครบ ต้องโอน · ISSUED เบิกแล้ว · null ไม่มีป้าย
   */
  partsState?: "CHECK" | "OUT" | "READY" | "TRANSFER" | "ISSUED" | null;
  /** ผู้เปิดใบงาน — ว่าง = ระบบสร้างเอง หรือบัญชีผู้เปิดถูกลบไปแล้ว */
  createdByName?: string | null;
  createdByRole?: Role | null;
  createdAt: string;
  closedAt: string | null;
  closeResult?: string | null;
  closeResultLabel: string | null;
  attachmentCount: number;
  /** ใบงานแจ้งเคลม — สถานะเคลมรอบล่าสุด PENDING / APPROVED / REJECTED · ว่าง = ไม่ได้แจ้งเคลม */
  claimStatus?: "PENDING" | "APPROVED" | "REJECTED" | null;
  /** ขั้นนี้เป็นของบทบาทไหน — ว่าง = ปิด/ยกเลิกแล้ว */
  stageActor: Role | null;
  /** รอหัวหน้าภาคแต่ไม่มีใครดูแลภาค/ทีมนี้ — กล่องงานแอดมินหัวข้อ "ไม่มีคนรับ" */
  orphan?: boolean;
  /** ทำไมไม่มีคนรับ: สาขายังไม่มีภาค/ทีม หรือภาค/ทีมนี้ยังไม่มีหัวหน้าภาค */
  orphanReason?: string | null;
  /** วันนัดผ่านไปแล้วใบยังไม่ถึงช่าง (ขั้นเบิก/โอน/คอนเฟิร์มลูกค้า) — กล่องงานแอดมินหัวข้อ "เลยนัด" */
  overdue?: boolean;
  /** จ่ายให้ทีม outsource — กล่องงานหัวหน้าภาคแยกไว้แท็บ "ใบงาน SUB" */
  outsource?: boolean;
  /** วันถูกเลื่อน (ลูกค้าขอ · แอดมินเลื่อนวันนัด) รอหัวหน้าภาคคอนเฟิร์มวันใหม่ — ป้ายแยกจากรับทราบปล่อยงานปกติ */
  rescheduled?: boolean;
  /** หัวหน้าภาคที่ดูแลใบนี้ (เฉพาะขั้นของหัวหน้าภาค) — ภาคที่มีสองคนได้ทั้งสองชื่อ */
  /** regions = ทุกภาคที่คนนั้นดูแล (หลายภาคได้) — เซิร์ฟเวอร์รุ่นเก่าส่งแค่ region */
  waitingOnSupervisors: { id: number; name: string; region: string | null; regions?: string[] }[];
  /** ทีมที่รับงาน (เฉพาะขั้นของช่าง) */
  waitingOnTeam: string | null;
  branchType: "DODO" | "COCO";
  /** ประกันของเครื่องในใบนี้ — ว่าง = สาขาบริษัท */
  warranty: WarrantyState | null;
  warrantyEndsAt: string | null;
  /** เข้าขั้นปัจจุบันเมื่อไร — ใช้บอกว่าค้างมากี่วัน */
  stageSince: string;
}

type Role = "ADMIN" | "SUPERVISOR" | "EMPLOYEE";

/** ใบด่วนที่ยังค้าง — ดึงขึ้นบนสุดและมีออร่า (ใบที่ปิดแล้วไม่มี stageActor) */
const isHot = (r: WorkOrderRow) => r.priority === "URGENT" && r.stageActor !== null;
type ListItem = WorkOrderRow | { sep: "URGENT" | "NORMAL"; label: string };
type ListData = { rows: WorkOrderRow[]; counts: Record<string, number> };
type Sort = "urgent" | "new" | "old" | "az" | "za" | "appt";

const ROLE_TABS: { value: Role; label: string; color: string }[] = [
  { value: "ADMIN", label: "แอดมิน", color: colors.roleAdmin },
  { value: "SUPERVISOR", label: "หัวหน้าภาค", color: colors.roleSupervisor },
  { value: "EMPLOYEE", label: "ช่าง", color: colors.roleTech },
];
const ROLE_LABEL: Record<Role, string> = { ADMIN: "แอดมิน", SUPERVISOR: "หัวหน้าภาค", EMPLOYEE: "ช่าง" };

/**
 * บทบาทของคนเปิดใบ → กลุ่มสี/ป้าย — Super Admin เป็นแอดมินในทุกเรื่องของหน้านี้
 * เดิมเอาบทบาทไปเปิดตารางสีตรง ๆ ใบที่ Super Admin เปิดได้ undefined แล้วทั้งรายการพัง (หน้าขาว ต.ค. 69)
 * บทบาทที่ไม่รู้จักขึ้นแบบ "ระบบ" ดีกว่าทำทั้งหน้าใช้ไม่ได้
 */
function roleGroup(role: string | null | undefined): Role | null {
  if (role === "SUPER_ADMIN") return "ADMIN";
  return role === "ADMIN" || role === "SUPERVISOR" || role === "EMPLOYEE" ? role : null;
}

/**
 * ลำดับ — "ด่วนก่อน" คือลำดับเดิมจากเซิร์ฟเวอร์ (ด่วนขึ้นก่อน แล้วเก่าสุดก่อน = ลำดับที่ควรหยิบไปทำ)
 * ส่วน "ค้างนานสุด" นับจากวันที่เข้าขั้นปัจจุบัน ไม่ใช่วันเปิดใบงาน — ใบเก่าที่เพิ่งขยับขั้น
 * ไม่ได้ถูกลืม ใบที่นิ่งอยู่ขั้นเดียวหลายวันต่างหากที่ถูกลืม
 */
const SORTS: { value: Sort; label: string }[] = [
  { value: "urgent", label: "ด่วนก่อน" },
  { value: "new", label: "ใหม่สุด" },
  { value: "old", label: "ค้างนานสุด" },
  { value: "az", label: "สาขา A→Z" },
  { value: "za", label: "สาขา Z→A" },
  // นัดใกล้สุดก่อน (เลยนัดขึ้นบนสุด) · ใบที่ยังไม่นัดไปท้าย — เจ้าของงานขอ ต.ค. 69
  { value: "appt", label: "วันนัดใกล้สุด" },
];

/**
 * วันนัดในรายการ (เจ้าของงานขอ ต.ค. 69) — วัน+เวลาแบบเดียวกับหน้าใบงาน · สถานะนัด · ห่างจากวันนี้กี่วัน
 * "เลยนัด" นับเฉพาะใบที่ยังไม่ปิด: นัดผ่านไปแล้วแต่ใบยังค้าง = นัดแล้วไม่ได้ไป หรือไปแล้วไม่ได้กดในแอป
 */
function apptOf(r: WorkOrderRow) {
  if (!r.scheduledAt) return null;
  const ymd = r.scheduledAt.slice(0, 10);
  const days = Math.round((Date.parse(ymd) - Date.parse(todayBkk())) / 86_400_000);
  const open = r.stageActor !== null;
  const rel = !open
    ? null
    : days < 0
    ? { text: `เลยนัดมา ${-days} วัน`, tone: "late" as const }
    : days === 0
    ? { text: "วันนี้", tone: "today" as const }
    : days === 1
    ? { text: "พรุ่งนี้", tone: "today" as const }
    : { text: `อีก ${days} วัน`, tone: "later" as const };
  return { ymd, days, open, date: thaiDate(ymd), time: r.scheduledTime ? `${r.scheduledTime}\u00A0น.` : null, rel };
}

/** ช่วงที่ใช้กรองหัวคอลัมน์ "วันนัด" — วันที่ทีละวันกรองไม่มีประโยชน์ คนถามเป็นช่วง */
function apptBucket(r: WorkOrderRow) {
  const a = apptOf(r);
  if (!a) return "ยังไม่นัด";
  if (!a.open) return "ปิด/ยกเลิกแล้ว";
  if (a.days < 0) return "เลยนัด";
  if (a.days === 0) return "วันนี้";
  if (a.days === 1) return "พรุ่งนี้";
  return a.days <= 7 ? "ภายใน 7 วัน" : "เกิน 7 วัน";
}

/**
 * ชิป "ต้องรีบดู" (เจ้าของงานเลือก ต.ค. 69) — เรื่องที่คนเปิดหน้ารายการเข้ามาหาบ่อยที่สุด
 * กดได้หลายอันพร้อมกัน = ใบที่เข้าอย่างใดอย่างหนึ่ง (ด่วน หรือ อะไหล่หมด) ไม่ใช่ต้องเข้าทุกข้อ
 * — คนกดหลายอันเพราะอยากเห็นใบที่มีปัญหาทั้งหมด ไม่ใช่หาใบที่ซวยครบทุกเรื่อง
 * นับเฉพาะใบที่ยังค้าง: ใบปิดแล้วที่เคยด่วน/เคยเลยนัด ไม่ใช่เรื่องที่ต้องรีบดูวันนี้
 */
type QuickKey = "urgent" | "partsOut" | "rolledBack" | "apptLate" | "stale" | "unassigned";
const STALE_DAYS = 3;
const QUICK: { key: QuickKey; label: string; dot: string; test: (r: WorkOrderRow) => boolean }[] = [
  { key: "urgent", label: "ด่วน", dot: colors.danger, test: isHot },
  { key: "partsOut", label: "อะไหล่หมด", dot: colors.dangerInk, test: (r) => r.stageActor !== null && !!r.partsOut },
  { key: "rolledBack", label: "ย้อนขั้น", dot: colors.rollback, test: (r) => r.stageActor !== null && !!r.rolledBackFrom },
  { key: "apptLate", label: "เลยวันนัด", dot: colors.warningInk, test: (r) => apptOf(r)?.rel?.tone === "late" },
  // นับจากวันที่เข้าขั้นปัจจุบัน แบบเดียวกับ "ค้าง n วัน" ในรายการ — ใบเก่าที่เพิ่งขยับไม่ได้ถูกลืม
  { key: "stale", label: `ค้างขั้นเดิมเกิน ${STALE_DAYS} วัน`, dot: colors.textMuted, test: (r) => r.stageActor !== null && stuckDays(r.stageSince) > STALE_DAYS },
  { key: "unassigned", label: "ยังไม่มอบหมายช่าง", dot: colors.textFaint, test: (r) => r.stageActor !== null && !r.assignedTeam && !r.assignedToName },
];

const APPT_TONE: Record<string, { fg: string; bg: string; line: string }> = {
  PENDING: { fg: colors.warningInk, bg: colors.warningSoft, line: colors.warningBorder },
  CONFIRMED: { fg: colors.successInk, bg: colors.successSoft, line: colors.successLine },
  ADMIN_PICKED: { fg: colors.primaryInk, bg: colors.primarySoft, line: colors.sky200 },
};

/** ตัวกรองที่เลือก "คน" ภายในบทบาท — s:<id> หัวหน้าภาค · t:<ทีม> ทีมช่าง · none ยังไม่มีใครดูแล */
type Who = string;

interface ListPrefs {
  owner: Role | "";
  who: Who;
  btype: "" | "DODO" | "COCO";
  sort: Sort;
  supTab: SupTab;
  /** ใบงาน SUB (จ่ายให้ทีม outsource) / ทีมปกติ — เจ้าของงานขอให้แยกไม่ปนกัน ต.ค. 69 */
  kind: "" | "normal" | "sub";
  /** ใบงานเคลม (เจ้าของงานขอ ต.ค. 69) — "any" = ทุกใบที่แจ้งเคลม หรือเจาะสถานะเคลม */
  claim?: "" | "any" | "PENDING" | "APPROVED" | "REJECTED";
}
const DEFAULT_PREFS: ListPrefs = { owner: "", who: "", btype: "", sort: "urgent", supTab: "repair", kind: "", claim: "" };

/** ป้าย/ตัวกรองใบงานเคลม — สถานะเคลมเป็นคำที่ Admin Spare Part ใช้ */
const CLAIM_LABEL: Record<string, string> = { PENDING: "รอตรวจเคลม", APPROVED: "เคลมอนุมัติแล้ว", REJECTED: "เคลมถูกตีกลับ" };
const claimMatch = (r: WorkOrderRow, v: ListPrefs["claim"]) => !v || (v === "any" ? !!r.claimStatus : r.claimStatus === v);

/**
 * แท็บกล่องงานหัวหน้าภาค (เจ้าของงานขอ ต.ค. 69 — "งานแจ้งมาปนกันหมด")
 *
 * แยกตามสิ่งที่ต้องทำ ไม่ใช่ตามชื่อขั้น: ใบแจ้งซ่อมใหม่ต้องนั่งดูอะไหล่ · ใบรอจ่าย/ปล่อยงานต้องดูคิวทีม
 * · ใบทีม outsource ต้องตามให้ทีมนอกส่งรูปมาแล้วปิดแทน — สามอย่างนี้ทำคนละจังหวะ ปนกันแล้วหาไม่เจอ
 * ทีม outsource แยกทั้งก้อน (รอปล่อยงาน + รอปิดงาน) แท็บจ่ายงานจึงเหลือแต่ทีมช่างปกติ
 */
type SupTab = "repair" | "dispatch" | "outsource";
const SUP_TABS: { value: SupTab; label: string }[] = [
  { value: "repair", label: "งานแจ้งซ่อม" },
  { value: "dispatch", label: "จ่ายงาน/ปล่อยงาน" },
  // "ใบงาน SUB" — คำที่เจ้าของงานใช้เรียกใบที่จ่ายให้ทีม outsource
  { value: "outsource", label: "ใบงาน SUB" },
];
const DISPATCH_STAGES = ["PARTS_CHECKED", "ASSIGNED", "PARTS_PICKUP", "PARTS_TRANSFER", "PARTS_IN_TRANSIT"];
function supTabOf(r: { outsource?: boolean; status: string }): SupTab {
  if (r.outsource) return "outsource";
  return DISPATCH_STAGES.includes(r.status) ? "dispatch" : "repair";
}
/** ทีม outsource เข้างานแล้วค้างเกินนี้ (วัน) ขึ้นแดง — ช่างไม่มีบัญชีในแอป ไม่มีใครเตือนนอกจากหัวหน้าภาค */
const OUTSOURCE_LATE_DAYS = 2;
function stuckDays(iso: string) {
  const day = (d: Date) => Math.floor((d.getTime() + 7 * 3600_000) / 86_400_000);
  return day(new Date()) - day(new Date(iso));
}
function outsourceLate(r: WorkOrderRow) {
  return !!r.outsource && r.status === "IN_PROGRESS" && stuckDays(r.stageSince) >= OUTSOURCE_LATE_DAYS;
}

function whoKeys(row: WorkOrderRow): Who[] {
  if (row.stageActor === "SUPERVISOR")
    return row.waitingOnSupervisors.length ? row.waitingOnSupervisors.map((s) => `s:${s.id}`) : ["none"];
  if (row.stageActor === "EMPLOYEE") return [row.waitingOnTeam ? `t:${row.waitingOnTeam}` : "none"];
  return [];
}

/**
 * คอลัมน์ของตาราง — ค่าที่ใช้กรอง/เรียงแบบ Excel ต้องเป็นข้อความเดียวกับที่ตาเห็นในช่องนั้น
 * (กรอง "ทีม" แล้วต้องเจอคำที่อ่านอยู่ในคอลัมน์ ไม่ใช่รหัสภายใน)
 */
type ColKey = "wo" | "branch" | "machine" | "team" | "appt" | "status" | "wait" | "opener";
/** sortValue — คอลัมน์ที่ข้อความกรองไม่ใช่ลำดับจริง (วันนัดกรองเป็นช่วง แต่เรียงตามวันที่) */
const COLUMNS: { key: ColKey; label: string; value: (r: WorkOrderRow) => string; sortValue?: (r: WorkOrderRow) => string }[] = [
  { key: "wo", label: "ใบงาน", value: (r) => r.code },
  { key: "branch", label: "สาขา", value: (r) => `${r.branchCode} ${r.branchName}` },
  { key: "machine", label: "เครื่อง", value: (r) => machineTag(r.machineCode, r.machineCapacityKg) ?? "(ว่าง)" },
  { key: "team", label: "ทีม", value: (r) => r.assignedToName ?? r.assignedTeam ?? "ยังไม่มอบหมาย" },
  {
    key: "appt",
    label: "วันนัด",
    value: apptBucket,
    sortValue: (r) => (r.scheduledAt ? `${r.scheduledAt.slice(0, 10)} ${r.scheduledTime ?? "99:99"}` : "9999"),
  },
  // ติด "อะไหล่หมด" ต่อท้ายแทนการแทนที่ — กรองตามขั้นยังเจอครบ ค้นคำว่า "หมด" ก็ได้ทุกใบที่ติดของ
  { key: "status", label: "สถานะ", value: (r) => (r.partsOut ? `${statusText(r)} · อะไหล่หมด` : statusText(r)) },
  { key: "wait", label: "รอใคร", value: (r) => waitText(r) ?? "(ไม่ได้รอใคร)" },
  // ใส่บทบาทต่อท้ายชื่อ — ตัวกรองแยกคนชื่อซ้ำต่างบทบาทได้ และอ่านแล้วรู้ว่าเปิดจากฝั่งไหน
  { key: "opener", label: "เปิดโดย", value: openerText },
];
type ColFilters = Partial<Record<ColKey, Set<string>>>;

function openerText(row: WorkOrderRow) {
  if (!row.createdByName) return "ระบบ";
  const role = roleGroup(row.createdByRole);
  return role ? `${row.createdByName} (${ROLE_LABEL[role]})` : row.createdByName;
}

function waitText(row: WorkOrderRow) {
  if (!row.stageActor) return null;
  const who =
    row.stageActor === "SUPERVISOR"
      ? row.waitingOnSupervisors.map((s) => s.name).join(", ") || "ยังไม่มีคนดูแล"
      : row.stageActor === "EMPLOYEE" && row.waitingOnTeam
        ? `ทีม${row.waitingOnTeam}`
        : null;
  return `${ROLE_LABEL[row.stageActor]}${who ? ` · ${who}` : ""}`;
}

/** "ค้าง 3 วัน" — นับเป็นวันเต็มตามเวลาไทย วันนี้ = "เข้าขั้นนี้วันนี้" */
export function stuckLabel(iso: string) {
  const n = stuckDays(iso);
  return n <= 0 ? "เข้าขั้นนี้วันนี้" : `ค้าง ${n} วัน`;
}

type Filter = "INBOX" | "ACTIVE" | "AWAITING_CONFIRM" | "IN_PROGRESS" | "DONE" | "ALL";
/** เดิม "เฉพาะงานของฉัน" — ที่จริงกรองใบที่มอบหมายให้ตัวเอง (assignedTo=me) ไม่ใช่ใบที่ตัวเองเปิด */
const MINE_LABEL = "เฉพาะที่มอบหมายให้ฉัน";

/**
 * ชิปกรองรายการ — ค่าที่ส่งต้องเป็นสถานะจริงที่เซิร์ฟเวอร์รู้จัก
 *
 * ชิป "รอช่างรับ" เดิมส่งคำว่า OPEN ซึ่งไม่ใช่สถานะในระบบ เซิร์ฟเวอร์ตอบ 400
 * ทุกครั้งที่กด — กดแล้วเจอข้อความผิดพลาดแทนรายการ ตอนนี้ใช้ชื่อขั้นจริง
 * ของระบบ จะได้ตรงกับป้ายสถานะบนการ์ดและไม่ต้องมีคำแปลซ้อนอีกชั้น
 */
const FILTERS: { value: Filter; label: string }[] = [
  { value: "INBOX", label: "กล่องงานของฉัน" },
  { value: "ACTIVE", label: "ที่ยังค้าง" },
  { value: "AWAITING_CONFIRM", label: "รอคอนเฟิร์มลูกค้า" },
  { value: "IN_PROGRESS", label: "ช่างเข้างาน" },
  { value: "DONE", label: "ปิดแล้ว" },
  { value: "ALL", label: "ทั้งหมด" },
];

/**
 * แท็บที่ใบงานอยู่ — ปุ่ม "มีอัปเดต" พาไปแท็บนั้นแล้วกระพริบใบ (เจ้าของงานขอ ต.ค. 69)
 * เดิมกดแล้วโหลดแท็บเดิมเลื่อนขึ้นบนสุด ใบที่ย้ายแท็บไปหายเฉย ๆ ไม่รู้ไปอยู่ไหน
 * supTab มีเฉพาะกล่องงานหัวหน้าภาค (แท็บย่อย งานแจ้งซ่อม / จ่ายงาน / SUB)
 */
type Spot = { filter: Filter; supTab?: SupTab };
type JumpGroup = Spot & { ids: number[] };
/** คำตอบของ GET /work-orders/locate — tab คือแท็บที่เจาะจงที่สุด (กล่องงานก่อน แล้วค่อยแท็บสถานะ) */
interface Located {
  id: number;
  status: string;
  outsource: boolean;
  tab: Filter;
}
const sameSpot = (a: Spot, b: Spot) => a.filter === b.filter && (a.supTab ?? "") === (b.supTab ?? "");
function spotLabel(s: Spot) {
  return (s.supTab ? SUP_TABS.find((t) => t.value === s.supTab)?.label : FILTERS.find((f) => f.value === s.filter)?.label) ?? "";
}
/** ลำดับแท็บซ้ายไปขวา — อัปเดตหลายแท็บพาไปตามลำดับที่ตาเห็น */
const spotOrder = (s: Spot) => FILTERS.findIndex((f) => f.value === s.filter) * 10 + (s.supTab ? SUP_TABS.findIndex((t) => t.value === s.supTab) : 0);
/** บรรทัดใต้การ์ดที่อัปเดต — บอกว่าเปลี่ยนอะไร เทียบกับที่จอถืออยู่ก่อนกดปุ่ม */
function changeText(before: WorkOrderRow | undefined, after: WorkOrderRow) {
  if (!before) return "ใบใหม่ในแท็บนี้";
  if (statusText(before) !== statusText(after)) return `${statusText(before)} → ${statusText(after)}`;
  const a = apptOf(before);
  const b = apptOf(after);
  if ((a?.ymd ?? "") !== (b?.ymd ?? "") || (a?.time ?? "") !== (b?.time ?? "")) {
    return b ? `วันนัด ${a ? `${a.date} → ` : ""}${b.date}${b.time ? ` ${b.time}` : ""}` : "ยกเลิกวันนัด";
  }
  return "มีการแก้ไขในใบงาน";
}

/** ป้ายส้ม "↩ ย้อนขั้น" (เจ้าของงานขอ ต.ค. 69) — ใบที่ถอยมาต้องเห็นจากรายการ ไม่ใช่ต้องเปิดเข้าไปอ่านประวัติ */
function RolledBackBadge({ row }: { row: { rolledBackFrom?: string | null } }) {
  if (!row.rolledBackFrom) return null;
  return (
    <View
      style={[styles.badge, { backgroundColor: colors.rollback, alignSelf: "flex-start" }]}
      accessibilityLabel={`ป้ายย้อนขั้น จาก ${row.rolledBackFrom}`}
    >
      <Text style={[styles.badgeText, { color: "#fff" }]}>↩ ย้อนขั้น</Text>
    </View>
  );
}

/** ป้ายสถานะในรายการ — ใบที่ลูกค้าขอเปลี่ยนวันบอกว่าต้องคอนเฟิร์มวันใหม่ ไม่ใช่แค่รับทราบปล่อยงาน */
function statusText(r: { statusLabel: string; rescheduled?: boolean }) {
  return r.rescheduled ? "หัวหน้าภาค · คอนเฟิร์มวันใหม่" : r.statusLabel;
}

/** "ค้าง n วัน" — ใบงาน SUB ที่ทีมเข้างานค้างเกินกำหนดขึ้นแดง ให้หัวหน้าภาคตามรูปมาบันทึกผล */
function StuckText({ row, style }: { row: WorkOrderRow; style: object }) {
  const late = outsourceLate(row);
  return (
    <Text style={[style, late && { color: colors.dangerInk, fontWeight: "700" }]}>
      {stuckLabel(row.stageSince)}
      {late ? " · ตามผลงาน SUB จากทีม" : ""}
    </Text>
  );
}

/** ป้ายแดง "อะไหล่หมด" — ใบที่ติดของต้องเห็นจากรายการเลย ไม่ใช่ต้องเปิดเข้าไปอ่านรายการอะไหล่ */
/**
 * ป้ายอะไหล่ (นัดลูกค้าก่อนเบิก · แบบที่เจ้าของงานตกลง ต.ค. 69) — คำเดียวกับการ์ดงานของฉันวันนี้
 * หมดใช้ป้ายแดงเดิม · ที่เหลือบอกว่าของพร้อมแค่ไหน ไม่ต้องเปิดใบงานดู
 */
const PARTS_BADGE: Record<string, { text: string; fg: string; bg: string }> = {
  CHECK: { text: "รอแอดมินเช็คอะไหล่", fg: colors.textMuted, bg: colors.background },
  READY: { text: "อะไหล่ครบ · ยังไม่เบิก", fg: colors.successInk, bg: colors.successSoft },
  TRANSFER: { text: "อะไหล่ครบ · ต้องโอน", fg: colors.warningInk, bg: colors.warningSoft },
  ISSUED: { text: "เบิกแล้ว", fg: "#fff", bg: colors.navyFill },
};

function PartsOutBadge({ row }: { row: { partsOut?: number; partsState?: WorkOrderRow["partsState"] } }) {
  if (!row.partsOut) {
    const t = row.partsState ? PARTS_BADGE[row.partsState] : undefined;
    if (!t) return null;
    return (
      <View style={[styles.badge, { backgroundColor: t.bg, alignSelf: "flex-start" }]} accessibilityLabel={`ป้ายอะไหล่ ${t.text}`}>
        <Text style={[styles.badgeText, { color: t.fg }]}>{t.text}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: colors.danger, alignSelf: "flex-start" }]} accessibilityLabel="ป้ายอะไหล่หมด">
      <Text style={[styles.badgeText, { color: "#fff" }]}>● อะไหล่หมด {row.partsOut}</Text>
    </View>
  );
}

/**
 * ใบที่อะไหล่หมด — บอกวันที่คาดว่าของเข้า เลยแล้วขึ้นแดงให้แอดมินตามผู้ขาย
 * แสดงเฉพาะตอนยังรอของ ขั้นอื่นวันที่นี้ไม่มีความหมายแล้ว (เซิร์ฟเวอร์ล้างให้เมื่อของครบ)
 */
function PartsEta({ row }: { row: { status: string; partsExpectedAt?: string | null; partsOut?: number } }) {
  if (!row.partsOut || !row.partsExpectedAt) return null;
  const day = row.partsExpectedAt.slice(0, 10);
  const late = day < new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const [y, m, d] = day.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <Text style={{ fontSize: 12, lineHeight: 18, fontWeight: late ? "700" : "400", color: late ? colors.dangerInk : colors.textMuted }}>
      {late ? `เลยกำหนดของเข้า (${label}) — ตามผู้ขาย` : `คาดว่าของเข้า ${label}`}
    </Text>
  );
}

/**
 * ใบงานรอใคร — ตัดสินสีของป้ายสถานะ
 *
 * ตรงกับ WORK_ORDER_STAGE_ACTOR ฝั่ง backend ยกเว้นขั้นที่รอคนนอก (ลูกค้าจ่ายเงิน ของเข้าคลัง)
 * ซึ่งแยกเป็นสีส้ม — คนในบริษัทเร่งเองไม่ได้ ไม่ควรดูเหมือนงานค้างของใคร
 */
export type Owner = "ADMIN" | "SUPERVISOR" | "EMPLOYEE" | "OUTSIDE" | "DONE" | "CANCELLED";
export const STATUS_OWNER: Record<string, Owner> = {
  NEW: "SUPERVISOR",
  INSPECT_CONFIRM: "ADMIN",
  INSPECT_DISPATCH: "SUPERVISOR",
  INSPECTING: "EMPLOYEE",
  // รอเบิกอะไหล่ก่อนเสนอราคา — แอดมินเป็นคนเช็คและตามของ (เจ้าของงานกำหนด: อยู่ใน "รอแอดมิน")
  PARTS_SOURCING: "ADMIN",
  AWAITING_QUOTE: "ADMIN",
  AWAITING_PAYMENT: "OUTSIDE",
  WAITING_PARTS: "OUTSIDE",
  PARTS_REQUESTED: "ADMIN",
  PARTS_PICKUP: "SUPERVISOR",
  PARTS_TRANSFER: "SUPERVISOR",
  PARTS_IN_TRANSIT: "SUPERVISOR",
  PARTS_CHECKED: "SUPERVISOR",
  AWAITING_CONFIRM: "ADMIN",
  ASSIGNED: "SUPERVISOR",
  IN_PROGRESS: "EMPLOYEE",
  // Admin Spare Part เป็นแอดมิน — สีเดียวกับขั้นอื่นที่รอแอดมิน
  CLAIM_REVIEW: "ADMIN",
  DONE: "DONE",
  CANCELLED: "CANCELLED",
};

/**
 * สีตามคนที่ใบงานรอ (เจ้าของงานเลือก ต.ค. 69)
 *
 * เดิมเกือบทุกขั้นเป็นฟ้าเหมือนกัน กวาดตาแล้วแยกไม่ออกว่าใบไหนค้างที่ใคร
 * fg = ตัวอักษร/จุด · bg = พื้นป้าย · ตัวอักษรใช้สีเข้มเพราะสีอ่อนอ่านไม่ออกบนพื้นอ่อน
 */
export const OWNER_TONE: Record<Owner, { bg: string; fg: string }> = {
  ADMIN: { bg: colors.roleAdminSoft, fg: colors.roleAdmin },
  SUPERVISOR: { bg: colors.roleSupervisorSoft, fg: colors.roleSupervisor },
  EMPLOYEE: { bg: colors.roleTechSoft, fg: colors.roleTech },
  OUTSIDE: { bg: colors.warningSoft, fg: colors.warningInk },
  DONE: { bg: colors.doneSoft, fg: colors.doneBand },
  CANCELLED: { bg: colors.tile, fg: colors.textMuted },
};

export function statusTone(status: string) {
  return OWNER_TONE[STATUS_OWNER[status] ?? "SUPERVISOR"];
}

export function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** วันที่อย่างเดียว ไม่มีเวลา — ใช้กับวันเปิดร้านและวันหมดประกันซึ่งเป็นรายวัน */
export function formatDate(iso: string | null) {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" });
}

export default function WorkOrderListScreen({ navigation, route }: Props) {
  // จอกว้างเป็นตารางแบบต้นแบบ — กวาดตาเทียบสาขา/สถานะทีละคอลัมน์ได้ไวกว่าการ์ด
  // ที่ซ้อนข้อมูลเป็นบรรทัด บนมือถือยังเป็นการ์ดเพราะตารางเจ็ดคอลัมน์ไม่พอที่
  const { width } = useWindowDimensions();
  // 1024 ไม่ใช่ 900 — ตั้งแต่มีคอลัมน์ "เปิดโดย" จอ 900–1000 เหลือที่ไม่พอ รหัสใบงานกับชื่อทีมหักบรรทัด
  const table = width >= 1024;
  const [rows, setRows] = useState<WorkOrderRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  // มาจากเมนู "กล่องงานของฉัน" ก็เปิดที่กล่องงานเลย ไม่ต้องให้กดหาอีกที
  const [filter, setFilter] = useState<Filter>(route.params?.inbox ? "INBOX" : "ACTIVE");
  // หน้ารายการถูกใช้ซ้ำเมื่อกดเมนูกล่องงาน/ใบงานซ่อมสลับกัน (ไม่ได้ขึ้นหน้าใหม่)
  // ค่าตั้งต้นข้างบนจึงไม่ทำงานรอบสอง ต้องตามค่าที่เมนูส่งมาเอง
  const inboxParam = route.params?.inbox;
  useEffect(() => {
    if (inboxParam !== undefined) setFilter(inboxParam ? "INBOX" : "ACTIVE");
  }, [inboxParam]);
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState(route.params?.search ?? "");
  // มาจาก "ค้นในใบงานซ่อมทั้งหมด" ของงานของฉันวันนี้ — ใบที่หาไม่เจอในงานของตัวเองมักรอคนอื่นอยู่หรือปิดไปแล้ว
  // จึงค้นทุกสถานะ · หน้านี้ถูกใช้ซ้ำ (ไม่ขึ้นหน้าใหม่) ต้องตามค่าที่ส่งมาเองเหมือน inbox
  const searchParam = route.params?.search;
  useEffect(() => {
    if (searchParam === undefined) return;
    setSearch(searchParam);
    setFilter("ALL");
  }, [searchParam]);
  // ช่องค้นหาอัปเดตทันทีให้คนพิมพ์เห็น แต่ตัวโหลดใช้ค่าที่หยุดพิมพ์แล้ว
  // ไม่งั้นพิมพ์รหัสใบงานหนึ่งรหัสจะยิงขอข้อมูลเท่าจำนวนตัวอักษร
  const settledSearch = useDebounced(search);
  // กำลังพิมพ์ค้นอยู่ไหม — รายการถูกสร้างใหม่เมื่อผลค้นหาเปลี่ยนระหว่างว่าง/มีใบงาน (ดู key ของ FlatList)
  // ช่องค้นหาที่อยู่ในหัวรายการจึงถูกสร้างใหม่ด้วย ต้องโฟกัสกลับให้ ไม่งั้นพิมพ์ตัวถัดไปไม่ติด
  const searchFocused = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<ListPrefs>(DEFAULT_PREFS);
  const setPref = (patch: Partial<ListPrefs>) => setPrefs((p) => ({ ...p, ...patch }));

  /**
   * จำตัวกรอง "รอใคร / สาขา / เรียง" ล่าสุดไว้ในเครื่อง แยกตามผู้ใช้ — แบบเดียวกับหน้าติดตามเครื่องเสีย
   * โหลดของเดิมให้เสร็จก่อนค่อยเริ่มบันทึก ไม่งั้นค่าตั้งต้นตอนเปิดหน้าจะเขียนทับของที่จำไว้
   */
  const prefsKey = `otteri-wo-list:${user?.id ?? 0}`;
  const [restored, setRestored] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(prefsKey)
      .then((raw) => alive && raw && setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) }))
      .catch(() => undefined)
      .finally(() => alive && setRestored(prefsKey));
    return () => {
      alive = false;
    };
  }, [prefsKey]);
  useEffect(() => {
    if (restored !== prefsKey) return;
    AsyncStorage.setItem(prefsKey, JSON.stringify(prefs)).catch(() => undefined);
  }, [prefs, restored, prefsKey]);

  /**
   * กรองและเรียงที่หน้าจอ ไม่ยิงเซิร์ฟเวอร์ใหม่ — รายการไม่แบ่งหน้า ของครบอยู่ในมือแล้ว
   * กดสลับตัวกรองจึงเปลี่ยนทันทีโดยไม่ต้องรอเน็ต ตัวเลขบนปุ่มแต่ละแถวนับโดยใช้ตัวกรองของแถวอื่น
   * (เลือก DODO แล้วตัวเลขของ "หัวหน้าภาค" คือใบ DODO ที่รอหัวหน้าภาค)
   */
  const supTabs = filter === "INBOX" && user?.role === "SUPERVISOR";
  // กล่องงานหัวหน้าภาคซ่อนแถว "รอใคร" (ทุกใบในกล่องเป็นงานของเขาอยู่แล้ว ใบที่ "รอช่าง" คือทีม outsource ซึ่งมีแท็บแยก)
  // ตัวกรองที่จำไว้จากหน้าอื่นจึงต้องไม่มีผลที่นี่ ไม่งั้นใบหายไปโดยไม่มีปุ่มให้เอาตัวกรองออก
  const byOwner = useCallback(
    (r: WorkOrderRow) =>
      supTabs || ((!prefs.owner || r.stageActor === prefs.owner) && (!prefs.who || whoKeys(r).includes(prefs.who))),
    [prefs.owner, prefs.who, supTabs]
  );
  // แถว "ประเภทงาน: ทีมปกติ / ใบงาน SUB" — กล่องงานหัวหน้าภาคแยกเป็นแท็บอยู่แล้ว ไม่ใช้ตัวกรองนี้ซ้ำ
  const kindOn = !supTabs && user?.role !== "EMPLOYEE";
  const byType = useCallback(
    (r: WorkOrderRow) =>
      (!prefs.btype || r.branchType === prefs.btype) &&
      (!kindOn || !prefs.kind || (prefs.kind === "sub") === !!r.outsource) &&
      claimMatch(r, prefs.claim),
    [prefs.btype, prefs.kind, prefs.claim, kindOn]
  );
  // ชิป "ต้องรีบดู" — ไม่จำข้ามการเปิดแอปเหมือนตัวกรองหัวคอลัมน์ เปิดมาเจอรายการถูกกรองค้างไว้จะงงว่าใบหายไปไหน
  const [quick, setQuick] = useState<Set<QuickKey>>(new Set());
  const toggleQuick = (k: string) =>
    setQuick((s) => {
      const next = new Set(s);
      if (!next.delete(k as QuickKey)) next.add(k as QuickKey);
      return next;
    });
  const byQuick = useCallback((r: WorkOrderRow) => !quick.size || QUICK.some((q) => quick.has(q.key) && q.test(r)), [quick]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const focused = useIsFocused();
  // ตัวกรองหัวคอลัมน์ (Excel) — ไม่จำข้ามการเปิดแอป ตั้งใจใช้ค้นเฉพาะกิจ จำไว้แล้วลืมจะงงว่าใบหายไปไหน
  const [colFilters, setColFilters] = useState<ColFilters>({});
  const [colSort, setColSort] = useState<{ key: ColKey; dir: SortDir } | null>(null);
  const byCols = useCallback(
    (r: WorkOrderRow, skip?: ColKey) =>
      COLUMNS.every((c) => c.key === skip || !colFilters[c.key] || colFilters[c.key]!.has(c.value(r))),
    [colFilters]
  );
  /** ค่าให้ติ๊กของแต่ละคอลัมน์ — นับจากใบที่ผ่านตัวกรองอื่นทั้งหมดยกเว้นคอลัมน์นั้นเอง (แบบ Excel) */
  const colValues = useMemo(() => {
    const out = {} as Record<ColKey, { value: string; count: number }[]>;
    const base = rows.filter((r) => byOwner(r) && byType(r) && byQuick(r));
    for (const c of COLUMNS) {
      const m = new Map<string, number>();
      for (const r of base) if (byCols(r, c.key)) m.set(c.value(r), (m.get(c.value(r)) ?? 0) + 1);
      // ค่าที่ติ๊กไว้แต่ตอนนี้ไม่มีใบแล้ว ยังต้องเห็นในรายการ ไม่งั้นเอาติ๊กออกไม่ได้
      for (const v of colFilters[c.key] ?? []) if (!m.has(v)) m.set(v, 0);
      out[c.key] = [...m]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value, "th", { numeric: true }));
    }
    return out;
  }, [rows, byOwner, byType, byQuick, byCols, colFilters]);
  const colFilterCount = Object.values(colFilters).filter(Boolean).length;
  // ตัวเลขบนแท็บนับหลังตัวกรองอื่น — ตรงกับจำนวนที่จะเห็นเมื่อกดเข้าไป
  const supTabCounts = useMemo(() => {
    const n: Record<SupTab, number> = { repair: 0, dispatch: 0, outsource: 0 };
    if (supTabs) for (const r of rows) if (byOwner(r) && byType(r) && byCols(r) && byQuick(r)) n[supTabOf(r)]++;
    return n;
  }, [supTabs, rows, byOwner, byType, byCols, byQuick]);
  /** ใบในแท็บที่เลือกอยู่ก่อนกรองอะไรเลย — ตัวหารของ "แสดง x จาก y ใบ" */
  const tabRows = useMemo(() => (supTabs ? rows.filter((r) => supTabOf(r) === prefs.supTab) : rows), [rows, supTabs, prefs.supTab]);
  /** ตัวเลขบนชิปต้องรีบดู — นับหลังตัวกรองอื่นทั้งหมด แต่ไม่รวมชิปด้วยกันเอง (กดเพิ่มแล้วได้เพิ่มเท่าตัวเลข) */
  const quickItems = useMemo(() => {
    const base = tabRows.filter((r) => byOwner(r) && byType(r) && byCols(r));
    return QUICK.map((q) => ({ key: q.key, label: q.label, dot: q.dot, n: base.filter(q.test).length }));
  }, [tabRows, byOwner, byType, byCols]);
  const shown = useMemo(() => {
    const list = rows.filter((r) => byOwner(r) && byType(r) && byCols(r) && byQuick(r) && (!supTabs || supTabOf(r) === prefs.supTab));
    const at = (iso: string) => new Date(iso).getTime();
    const code = (a: WorkOrderRow, b: WorkOrderRow) =>
      a.branchCode.localeCompare(b.branchCode, "en", { numeric: true }) || a.code.localeCompare(b.code);
    if (prefs.sort === "az") list.sort(code);
    else if (prefs.sort === "za") list.sort((a, b) => code(b, a));
    else if (prefs.sort === "new") list.sort((a, b) => at(b.createdAt) - at(a.createdAt));
    else if (prefs.sort === "old") list.sort((a, b) => at(a.stageSince) - at(b.stageSince));
    else if (prefs.sort === "appt" || (supTabs && prefs.sort === "urgent" && prefs.supTab === "dispatch")) {
      // แท็บจ่ายงาน: วันนัดใกล้สุดก่อน — ใบที่ต้องปล่อยงานวันนี้/พรุ่งนี้ขึ้นบน
      const k = COLUMNS.find((c) => c.key === "appt")!.sortValue!;
      list.sort((a, b) => k(a).localeCompare(k(b)));
    } else if (supTabs && prefs.sort === "urgent" && prefs.supTab === "outsource")
      // แท็บ outsource: ค้างนานสุดก่อน — ใบที่ต้องตามทีมนอกขึ้นบน
      list.sort((a, b) => at(a.stageSince) - at(b.stageSince));
    // เรียงจากหัวคอลัมน์ทับการเรียงจากแถบตัวกรอง (กดล่าสุดชนะ — แถบตัวกรองกดแล้วล้างอันนี้)
    if (colSort) {
      const col = COLUMNS.find((c) => c.key === colSort.key)!;
      const sign = colSort.dir === "asc" ? 1 : -1;
      const key = col.sortValue ?? col.value;
      list.sort((a, b) => sign * key(a).localeCompare(key(b), "th", { numeric: true }));
    }
    // ใบด่วนที่ยังค้างอยู่ขึ้นบนสุดเสมอ ไม่ว่าเลือกเรียงแบบไหน (เจ้าของงานกำหนด) — เรียงตามที่เลือกภายในกลุ่ม
    // ใบที่ปิดแล้วไม่ดึงขึ้น ด่วนเมื่อเดือนก่อนไม่ได้แปลว่าต้องดูก่อนวันนี้
    const hot = list.filter(isHot);
    return hot.length ? [...hot, ...list.filter((r) => !isHot(r))] : list;
  }, [rows, byOwner, byType, byCols, byQuick, prefs.sort, prefs.supTab, supTabs, colSort]);

  /**
   * แถวคั่น "ด่วน (n)" / "ปกติ (n)" — ให้เห็นว่ากลุ่มด่วนจบตรงไหน
   * ไม่มีใบด่วนก็ไม่มีแถวคั่นเลย รายการหน้าตาเหมือนเดิม
   */
  const items = useMemo<ListItem[]>(() => {
    const hot = shown.filter(isHot).length;
    if (!hot) return shown;
    return [
      { sep: "URGENT", label: `ด่วน (${hot})` },
      ...shown.slice(0, hot),
      ...(shown.length > hot ? [{ sep: "NORMAL" as const, label: `ปกติ (${shown.length - hot})` }] : []),
      ...shown.slice(hot),
    ];
  }, [shown]);

  // นับรอบการโหลด — สลับชิปเร็ว ๆ คำตอบของชิปก่อนหน้าอาจมาถึงทีหลัง
  // ต้องทิ้งคำตอบเก่า ไม่งั้นชิป "ปิดแล้ว" อาจโชว์รายการของ "ที่ยังค้าง"
  const loadSeq = useRef(0);

  const listParams = useMemo(
    () => ({
      status: filter,
      ...(mineOnly ? { assignedTo: "me" } : {}),
      ...(settledSearch.trim() ? { search: settledSearch.trim() } : {}),
    }),
    [filter, mineOnly, settledSearch]
  );
  /**
   * ลายนิ้วมือของรายการ (GET /work-orders/version) — ตัวเช็คเบื้องหลังถามอันนี้ก่อน (ไม่กี่สิบไบต์)
   * ต่างจากที่เห็นล่าสุดค่อยโหลดรายการจริง เดิมโหลดทั้งก้อนทุกนาที (หลายร้อย KB) กิน bandwidth ของ Render
   */
  const fetchVersion = useCallback(
    async () => (await api.get<{ version: string }>("/work-orders/version", { params: listParams })).data.version,
    [listParams]
  );
  const seenVersion = useRef<string | null>(null);
  // โหลดรายการกับลายนิ้วมือพร้อมกัน — ไม่ช้าลง และตัวเช็คเบื้องหลังรอบแรกไม่ต้องโหลดรายการซ้ำ
  const fetchList = useCallback(async () => {
    const [list, version] = await Promise.all([
      api.get<ListData>("/work-orders", { params: listParams }),
      fetchVersion().catch(() => null),
    ]);
    seenVersion.current = version;
    return list.data;
  }, [listParams, fetchVersion]);

  /**
   * ของใหม่ที่เช็คเจอเบื้องหลังแต่ยังไม่ได้เอาขึ้นจอ (ปุ่ม "มีอัปเดต") — ตัวกรองเปลี่ยน/โหลดใหม่แล้วทิ้ง
   * rowsRef ให้ตัวเช็คเบื้องหลังเทียบกับสิ่งที่จอถืออยู่จริง โดยไม่ต้องสร้างตัวเช็คใหม่ทุกครั้งที่รายการเปลี่ยน
   */
  const pendingRef = useRef<ListData | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  /** ใบในของใหม่อยู่แท็บไหนบ้าง · ใบที่ออกไปนอกรายการที่คนนี้เห็นแล้ว (รหัส) — ตั้งคู่กับ pendingRef */
  const pendingGroups = useRef<JumpGroup[]>([]);
  const pendingGone = useRef<string[]>([]);
  const [flash, setFlash] = useState<Set<string | number>>(new Set());
  const rowsRef = useRef<WorkOrderRow[]>([]);
  rowsRef.current = rows;
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPending = () => {
    pendingRef.current = null;
    pendingGroups.current = [];
    pendingGone.current = [];
    setPendingCount(0);
  };
  /** กระพริบการ์ด (3 ครั้ง · ดู Blink) — ป้าย "อัปเดต" ค้างตาม marked ไม่ใช่ตามตัวนี้ */
  const blink = useCallback((keys: Set<string | number>) => {
    setFlash(keys);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(new Set()), 2600);
  }, []);
  /** เอาข้อมูลชุดใหม่ขึ้นจอ แล้วไฮไลต์ใบที่เปลี่ยนสักครู่ — คืนจำนวนที่เปลี่ยน */
  const applyFresh = useCallback((data: ListData) => {
    const { changed, keys } = countChanges(rowsRef.current, data.rows, (r) => r.id);
    setRows(data.rows);
    setCounts(data.counts);
    clearPending();
    if (keys.size) blink(keys);
    return changed;
  }, [blink]);

  /**
   * การ์ดที่ปุ่ม "มีอัปเดต" พามาดู: id → เปลี่ยนอะไร · ขอบเหลือง + ป้าย "อัปเดต" ค้างไว้หลังกระพริบจบ
   * หายเมื่อกดเข้าไปดูใบนั้น หรือสลับแท็บเอง — กระพริบอย่างเดียวแล้วหาย เผลอมองไปทางอื่นก็ไม่รู้ว่าใบไหน
   */
  const [marked, setMarked] = useState<Map<number, string>>(new Map());
  const unmark = useCallback(
    (id: number) =>
      setMarked((m) => {
        if (!m.has(id)) return m;
        const next = new Map(m);
        next.delete(id);
        return next;
      }),
    []
  );
  /** แท็บที่ยังต้องพาไปต่อ (ปุ่ม "อีก n ใบ") · กลุ่มที่รอให้แท็บโหลดเสร็จแล้วค่อยกระพริบ */
  const [jumpQueue, setJumpQueue] = useState<JumpGroup[]>([]);
  const jumpTarget = useRef<(JumpGroup & { cleared?: boolean }) | null>(null);
  const [jumpTick, setJumpTick] = useState(0);
  /** หน้าตาของแต่ละใบก่อนกดปุ่ม — ไว้เขียนบรรทัด "เปลี่ยนอะไร" ใต้การ์ด (ใบที่ย้ายแท็บไม่อยู่ใน rows แล้ว) */
  const beforeRows = useRef(new Map<number, WorkOrderRow>());

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setError(null);
    try {
      const data = await fetchList();
      if (seq !== loadSeq.current) return;
      setRows(data.rows);
      setCounts(data.counts);
      clearPending();
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(apiErrorMessage(e));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [fetchList]);

  /** ปุ่มรีเฟรช / ลากลง — เอาของใหม่ขึ้นเลย ไฮไลต์ใบที่เปลี่ยน และบอกว่าใหม่กี่ใบ */
  const refresh = useCallback(async () => {
    const seq = ++loadSeq.current;
    setError(null);
    try {
      const data = await fetchList();
      if (seq !== loadSeq.current) return;
      return { changed: applyFresh(data), unit: "ใบงาน" };
    } catch (e) {
      if (seq === loadSeq.current) setError(apiErrorMessage(e));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [fetchList, applyFresh]);

  /**
   * เลือกหัวข้อ (ชิป) แล้วขึ้นเครื่องซักผ้าแทนรายการเดิมระหว่างโหลด
   *
   * ต่างจากกลับมาหน้าเดิมที่โชว์ข้อมูลเก่าไว้ก่อน — กดชิปแล้วรายการเดิมค้างอยู่
   * คือรายการของหัวข้อที่ไม่ได้เลือกแล้ว คนจะเข้าใจผิดว่าเป็นของหัวข้อใหม่
   */
  function chooseFilter(next: Filter) {
    if (next === filter) return;
    setLoading(true);
    setFilter(next);
    setMarked(new Map());
  }

  // โหลดใหม่ทุกครั้งที่กลับมาหน้านี้ เพราะเพิ่งไปปิดงานมาแล้วตัวเลขต้องเปลี่ยน
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useRefreshHandler(refresh);
  /**
   * เช็คของใหม่เองทุก 1 นาที และทุกครั้งที่กลับมาที่แท็บ — แต่ไม่สลับรายการให้ทันที (ต.ค. 69 แบบ Facebook)
   * เจอว่าต่าง → ปุ่ม "มีอัปเดต n ใบงาน" เด้งลงมา คนกดเองเมื่อพร้อม ไม่มีแถวกระโดดใต้นิ้ว
   * ไม่มีอะไรเปลี่ยนก็ยังอัปเดตตัวเลขบนชิป (ไม่กระทบรายการ)
   */
  useBackgroundCheck(async () => {
    const seq = loadSeq.current;
    // ไม่มีอะไรเปลี่ยนตั้งแต่ครั้งก่อน — จบที่คำถามเล็ก ไม่ต้องโหลดรายการ
    if (seenVersion.current && (await fetchVersion()) === seenVersion.current) return;
    if (seq !== loadSeq.current) return;
    const data = await fetchList();
    if (seq !== loadSeq.current) return; // ระหว่างรอ มีการโหลดใหม่หรือเปลี่ยนตัวกรอง — ของนี้เก่าแล้ว
    const { changed, keys } = countChanges(rowsRef.current, data.rows, (r) => r.id);
    if (changed > 0) {
      // ใบที่ยังอยู่ในรายการนี้อยู่แท็บนี้ (กล่องงานหัวหน้าภาคแยกแท็บย่อยตามขั้นใหม่) · ใบที่หลุดออกไปถามเซิร์ฟเวอร์ว่าไปอยู่ไหน
      const spots: [number, Spot][] = data.rows
        .filter((r) => keys.has(r.id))
        .map((r) => [r.id, supTabs ? { filter, supTab: supTabOf(r) } : { filter }]);
      const now = new Set(data.rows.map((r) => r.id));
      const left = rowsRef.current.filter((r) => !now.has(r.id));
      const gone: string[] = [];
      if (left.length) {
        const { data: loc } = await api.get<{ rows: Located[] }>("/work-orders/locate", {
          params: { ...listParams, ids: left.map((r) => r.id).join(",") },
          loadingText: false,
        });
        if (seq !== loadSeq.current) return;
        const found = new Map(loc.rows.map((l) => [l.id, l]));
        for (const r of left) {
          const l = found.get(r.id);
          if (!l) gone.push(r.code);
          else spots.push([r.id, l.tab === "INBOX" && user?.role === "SUPERVISOR" ? { filter: "INBOX", supTab: supTabOf(l) } : { filter: l.tab }]);
        }
      }
      const groups: JumpGroup[] = [];
      for (const [id, spot] of spots) {
        const g = groups.find((x) => sameSpot(x, spot));
        if (g) g.ids.push(id);
        else groups.push({ ...spot, ids: [id] });
      }
      pendingRef.current = data;
      pendingGroups.current = groups;
      pendingGone.current = gone;
      setPendingCount(changed);
    } else {
      clearPending();
      setCounts(data.counts);
    }
  });
  const here: Spot = supTabs ? { filter, supTab: prefs.supTab } : { filter };
  /** ต่อท้ายปุ่ม "มีอัปเดต" — ใบอยู่ไหน (คิดตอนวาด แท็บย่อยที่เลือกอาจเปลี่ยนหลังเช็คเจอ) */
  const pendingHint = !pendingCount
    ? undefined
    : pendingGroups.current.length > 1
      ? `${pendingGroups.current.length} แท็บ`
      : pendingGroups.current.length === 1
        ? sameSpot(pendingGroups.current[0], here)
          ? "ในแท็บนี้"
          : `อยู่แท็บ ${spotLabel(pendingGroups.current[0])}`
        : undefined;

  /** พาไปแท็บของกลุ่มแรก — แท็บโหลดเสร็จแล้ว effect ข้างล่างค่อยกระพริบ · กลุ่มที่เหลือรอปุ่ม "อีก n ใบ" */
  const goTo = (queue: JumpGroup[]) => {
    const [g, ...rest] = queue;
    setJumpQueue(rest);
    if (!g) return;
    jumpTarget.current = g;
    if (!sameSpot(g, here)) feedback.toast("info", `ไปแท็บ ${spotLabel(g)}`);
    if (g.filter !== filter) {
      setLoading(true);
      setFilter(g.filter);
    }
    if (g.supTab && g.supTab !== prefs.supTab) setPref({ supTab: g.supTab });
    setJumpTick((t) => t + 1);
  };
  const showPending = () => {
    const data = pendingRef.current;
    if (!data) return;
    const groups = [...pendingGroups.current].sort((a, b) =>
      sameSpot(a, here) ? -1 : sameSpot(b, here) ? 1 : spotOrder(a) - spotOrder(b)
    );
    const gone = pendingGone.current;
    beforeRows.current = new Map(rowsRef.current.map((r) => [r.id, r]));
    setRows(data.rows);
    setCounts(data.counts);
    clearPending();
    setMarked(new Map());
    if (gone.length) feedback.toast("info", `${gone.join(", ")} ไม่อยู่ในรายการที่คุณเห็นแล้ว`);
    if (groups.length) goTo(groups);
    else listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  /**
   * แท็บที่พามาโหลดเสร็จแล้ว — ติดป้าย "อัปเดต" เลื่อนไปที่ใบแรก แล้วกระพริบ
   * ใบถูกตัวกรองของหน้านี้ซ่อนอยู่ (รอใคร · สาขา · ต้องรีบดู · หัวคอลัมน์) ล้างให้ครั้งเดียว ไม่งั้นพามาแล้วไม่เห็นอะไร
   */
  useEffect(() => {
    const g = jumpTarget.current;
    if (!g || loading || g.filter !== filter || (g.supTab && supTabs && g.supTab !== prefs.supTab)) return;
    const present = g.ids.filter((id) => rows.some((r) => r.id === id));
    if (!g.cleared && present.some((id) => !shown.some((r) => r.id === id))) {
      g.cleared = true;
      setPrefs((p) => ({ ...p, owner: "", who: "", btype: "", kind: "", claim: "" }));
      setQuick(new Set());
      setColFilters({});
      feedback.toast("info", "ล้างตัวกรองให้แล้ว — ใบที่อัปเดตถูกตัวกรองซ่อนอยู่");
      return;
    }
    jumpTarget.current = null;
    if (!present.length) return;
    setMarked((m) => {
      const next = new Map(m);
      for (const id of present) next.set(id, changeText(beforeRows.current.get(id), rows.find((r) => r.id === id)!));
      return next;
    });
    blink(new Set(present));
    const index = items.findIndex((it) => !("sep" in it) && present.includes(it.id));
    scrollTries.current = 0;
    if (index < 0) return;
    const aim = (animated: boolean) => listRef.current?.scrollToIndex({ index, viewPosition: 0.3, animated });
    setTimeout(() => aim(true), 80);
    // เล็งซ้ำหลังการ์ดที่เพิ่งวาดวัดความสูงจริงเสร็จ — ระหว่างทางใช้ความสูงเฉลี่ย ใบท้ายรายการยาวจึงคลาดไปได้หลายใบ
    setTimeout(() => aim(false), 1200);
  }, [rows, loading, filter, prefs.supTab, supTabs, shown, items, jumpTick, blink]);
  /** การ์ดยังไม่ถูกวาด (FlatList วาดเฉพาะแถวใกล้จอ) — กระโดดไปตำแหน่งประมาณก่อน แล้วค่อยเล็งใหม่ */
  const scrollTries = useRef(0);
  const onScrollToIndexFailed = (info: { index: number; averageItemLength: number }) => {
    if (++scrollTries.current > 20) return;
    listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
    setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.3, animated: false }), 120);
  };

  /**
   * มือถือ: หัวหน้า+ตัวกรองเลื่อนขึ้นไปพร้อมรายการตามนิ้ว แล้วเหลือแถบสรุปแถบเดียวติดบน
   * (เจ้าของงานเลือกแบบ C ต.ค. 69 · ใช้จริงแล้วขอให้ "เลื่อนปิดตามมือ")
   *
   * หัวหน้าอยู่ในรายการเดียวกับใบงาน (ListHeaderComponent) จึงเลื่อนด้วยการเลื่อนจริงของเครื่อง
   * ทุกพิกเซลตามนิ้ว ไม่มีจังหวะหุบ/กางที่ตัดสินจากระยะ — ของเดิมที่ยุบความสูงตามเกณฑ์ 80 จุด
   * ทำให้รายการกระตุกไม่ว่าจะใส่ภาพเคลื่อนไหวนุ่มแค่ไหน เพราะความสูงเปลี่ยนระหว่างนิ้วกำลังลาก
   * แถบสรุปค่อย ๆ โผล่ตามระยะเลื่อนเมื่อขอบล่างของหัวหน้าพ้นจอ แตะแล้วเลื่อนกลับขึ้นบนสุด
   *
   * จอคอมทำเหมือนกัน (เจ้าของงานขอ) — ตารางมีหัวคอลัมน์ติดใต้แถบสรุปด้วย
   * ไม่งั้นเลื่อนลงไปลึก ๆ แล้วไม่รู้ว่าคอลัมน์ไหนคืออะไร
   */
  const foldable = true;
  const scrollY = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList<ListItem>>(null);
  const [headH, setHeadH] = useState(0);
  const [barOn, setBarOn] = useState(false);
  // ความกว้างตารางในรายการ — หัวคอลัมน์ที่ลอยบนแถบสรุปต้องกว้างเท่ากันพอดี คอลัมน์จึงตรงกับแถว
  // (รายการบนเว็บมีแถบเลื่อนกินขอบขวา ถ้าลอยเต็มจอ คอลัมน์จะเหลื่อมไปเท่าความกว้างแถบเลื่อน)
  const [tableW, setTableW] = useState(0);
  const [barH, setBarH] = useState(FOLDED_H);
  /**
   * จอแคบ: แถบโลโก้ + "☰ ใบงานซ่อม" และแท็บล่างหลบตอนเลื่อนลง กลับมาตอนเลื่อนขึ้น (เจ้าของงานเลือกแบบ B ต.ค. 69)
   *
   * แถบพวกนี้อยู่นอกหน้านี้ จึงสั่งผ่าน utils/chrome.ts — ระหว่างหน้านี้เปิดอยู่ แถบบนลอยทับรายการ
   * และแท็บล่างลอยทับขอบล่าง รายการเว้นที่บน/ล่างเท่าความสูงแถบเอง ใบงานจึงเลื่อนตามนิ้วพอดี
   * ไม่ถูกดันเร็วกว่านิ้วตอนแถบกำลังหาย
   *
   * ยังเปิดค้างไว้ตอนใบงานเด้งเป็นหน้าต่างลอยทับ (หน้านี้เสียโฟกัสแต่ยังเห็นอยู่ใต้ฉากมืด)
   * ไม่งั้นแถบจะกลับมาดันรายการข้างหลังลงจนกระตุกทุกครั้งที่เปิด/ปิดใบงาน
   */
  const { docked } = useDocked();
  const insets = useSafeAreaInsets();
  const tabH = useBottomTabBarHeight();
  const chrome = useChrome();
  // วาดตามค่ากลาง ไม่ใช่ตามโฟกัสของหน้านี้ — สลับแท็บแล้วหน้านี้ถูกพัก (freeze) ไม่วาดใหม่
  const overlayOn = chrome.overlay && !docked;
  const barsH = overlayOn ? chrome.barsH : 0;
  const barsMove = Math.max(0, barsH - insets.top);
  const live = useRef({ docked, tabH });
  live.current = { docked, tabH };
  /**
   * เปิด/ปิดโหมดลอยจากเหตุการณ์ focus/blur ของ navigation ไม่ใช่จาก effect ตามโฟกัส
   * หน้าที่ถูกสลับแท็บออกไปถูกพักไว้ effect จึงไม่ทำงาน — แถบบนเคยค้างโหมดลอยครึ่งทางบนแท็บอื่น
   * ใบงาน/ฟอร์มที่เด้งทับในแท็บเดียวกันไม่นับเป็นออกจากหน้า (ยังเห็นรายการอยู่ใต้ฉากมืด)
   */
  useEffect(() => {
    const apply = (on: boolean) => {
      const { docked: d, tabH: h } = live.current;
      const show = on && !d;
      setChromeOverlay(show, "ใบงานซ่อม");
      navigation.getParent()?.setOptions({
        tabBarStyle: show
          ? {
              ...TAB_BAR_STYLE,
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              // เลื่อนลงพ้นขอบจอไปเท่าความสูงแท็บ (+ขอบจอล่าง) — ค่าเผื่อไว้กว้างกว่าความสูงจริง
              transform: [{ translateY: chromeHide.interpolate({ inputRange: [0, 1], outputRange: [0, h + 20] }) }],
            }
          : d
            ? { display: "none" }
            : TAB_BAR_STYLE,
      });
    };
    /**
     * ฟังที่ระดับแท็บ (สถานะ stack ข้างใน + โฟกัสของแท็บ) ไม่ใช่ focus/blur ของหน้านี้
     * — ปิดใบงานที่เด้งทับแล้วหน้านี้ไม่ได้รับ focus กลับมา พอสลับแท็บก็ไม่มี blur ตามมาให้ปิดโหมดลอย
     * (เจอจริง: แถบโลโก้ค้างครึ่งทางบนแท็บหน้าหลัก)
     */
    const tabNav = navigation.getParent();
    const sync = () => {
      const st = navigation.getState();
      const i = st.routes.findIndex((r) => r.key === route.key);
      const top = st.routes[st.index];
      const popupOnTop = (top?.name === "WorkOrderDetail" || top?.name === "WorkOrderForm") && st.index - 1 === i;
      apply(!!tabNav?.isFocused() && (st.index === i || popupOnTop));
    };
    const offs = [
      tabNav?.addListener("state", sync),
      tabNav?.addListener("focus", sync),
      tabNav?.addListener("blur", () => apply(false)),
      navigation.addListener("focus", sync),
    ];
    sync();
    return () => {
      offs.forEach((off) => off?.());
      apply(false);
    };
  }, [navigation, route.key, docked, tabH]);
  // ซ่อนไปแล้วกี่จุด — สะสมตามทิศเลื่อนเมื่อพ้นหัวหน้าไปแล้ว (เลื่อนขึ้นนิดเดียวก็เริ่มกลับมา ไม่ต้องไปถึงบนสุด)
  const hidden = useRef(0);
  const lastY = useRef(0);
  function onListScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = e.nativeEvent.contentOffset.y;
    scrollY.setValue(y);
    const dy = y - lastY.current;
    lastY.current = y;
    if (overlayOn && barsMove > 0) {
      // ช่วงบนสุด (ยังเห็นหัวหน้า): แถบเลื่อนขึ้นไปพร้อมเนื้อหาตามนิ้ว · พ้นหัวหน้าแล้ว: หลบ/โผล่ตามทิศ
      hidden.current =
        y <= barsMove + headH ? Math.min(Math.max(y, 0), barsMove) : Math.min(barsMove, Math.max(0, hidden.current + dy));
      chromeHide.setValue(hidden.current / barsMove);
    }
    // แถบสรุปกดได้เฉพาะตอนเห็นแล้ว — ตอนจางอยู่ไม่ควรบังปุ่มของหัวหน้าข้างใต้
    const on = headH > 0 && y > barsMove + headH - 20;
    if (on !== barOn) setBarOn(on);
  }
  function backToTop() {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }

  /**
   * จอคอมเป็นปุ่มกางรายการเรียงในแถวเดียวกับช่องค้นหา · จอแคบ (และแอปมือถือ ซึ่งกล่องลอยกางในที่)
   * รวมเป็นปุ่ม "ตัวกรอง" ปุ่มเดียว — ปุ่มสี่ห้าอันในจอ 400 จุดล้นจนต้องปัดหา
   */
  const compact = !table || Platform.OS !== "web";
  const toggleMine = () => {
    setLoading(true);
    setMineOnly((v) => !v);
  };
  // ตัวเลขบนตัวเลือกนับจากใบที่ผ่านหัวคอลัมน์และชิปต้องรีบดูแล้ว — ตรงกับที่จะเห็นเมื่อกด
  const groups = filterGroups({
    rows: tabRows.filter((r) => byCols(r) && byQuick(r)),
    prefs,
    setPref,
    byOwner,
    byType,
    hideOwner: supTabs,
    showKind: kindOn,
  });
  // การเรียงแยกจากตัวกรองชัด ๆ (ไม่ทำให้ใบหาย) — เรียงจากหัวคอลัมน์อยู่ก็บอกบนปุ่ม กดเลือกแบบอื่นแล้วล้างอันนั้น
  const sortGroup: FilterGroup = {
    key: "sort",
    label: "เรียง",
    value: colSort ? "" : prefs.sort,
    allValue: "urgent",
    options: [...(colSort ? [{ value: "", label: "ตามหัวคอลัมน์" }] : []), ...SORTS],
    onPick: (v) => {
      if (!v) return;
      setColSort(null);
      setPref({ sort: v as Sort });
    },
  };
  const activeTags: ActiveTag[] = [
    ...(mineOnly ? [{ key: "mine", label: "มอบหมายให้ฉัน", onClear: toggleMine }] : []),
    ...quickItems.filter((q) => quick.has(q.key)).map((q) => ({ key: `q-${q.key}`, label: q.label, onClear: () => toggleQuick(q.key) })),
    ...groups.filter(isSet).map((g) => ({ key: g.key, label: `${g.label} ${pickedLabel(g)}`, onClear: () => g.onPick(g.allValue ?? "") })),
    ...(colFilterCount
      ? [
          {
            key: "cols",
            label: `หัวคอลัมน์: ${COLUMNS.filter((c) => colFilters[c.key]).map((c) => c.label).join(" · ")}`,
            onClear: () => setColFilters({}),
            a11y: "ล้างตัวกรองคอลัมน์ทั้งหมด",
          },
        ]
      : []),
  ];
  const activeCount = (mineOnly ? 1 : 0) + quick.size + groups.filter(isSet).length;
  /** ล้างตัวกรองทั้งหมด — การเรียงกับคำค้นไม่ถูกล้าง (ไม่ได้ทำให้ใบหาย และคำค้นมีปุ่ม ✕ ของตัวเอง) */
  function clearAll() {
    setPrefs((p) => ({ ...p, owner: "", who: "", btype: "", kind: "", claim: "" }));
    setQuick(new Set());
    setColFilters({});
    if (mineOnly) toggleMine();
  }

  const header = (
    <View
      style={foldable && !table ? styles.headInList : null}
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h !== headH) setHeadH(h);
      }}
    >
      {/*
        หัวหน้าแบบ OTTERI: ชื่อหน้า + ป้ายจำนวนของกลุ่มที่เลือก + คำอธิบายบรรทัดเดียว
        ป้ายจำนวนนับจากรายการที่โหลดมาจริง ไม่ใช่ตัวเลขบนชิป — ค้นหาแล้วตัวเลขจะลดตามที่เห็น
      */}
      <View style={styles.pageHead}>
        <View style={styles.pageTitleRow}>
          {/* จอแคบ: ชื่อหน้าอยู่บนแถบหัวแล้ว ไม่พิมพ์ซ้ำตัวใหญ่ — ประหยัดที่ให้เห็นใบงานเร็วขึ้น (เจ้าของงานขอ ต.ค. 69) */}
          {docked ? (
            <Text style={[styles.pageTitle, headingFont]}>{filter === "INBOX" ? "กล่องงานของฉัน" : "ใบงานซ่อม"}</Text>
          ) : null}
          {!loading && !error ? (
            <View style={styles.countPill}>
              {/* กล่องงานหัวหน้าภาค: นับทุกแท็บ ให้ตรงกับชิป "กล่องงานของฉัน" — แท็บข้างล่างแบ่งย่อยจากตัวเลขนี้ */}
              <Text style={styles.countPillText}>
                {(supTabs ? supTabCounts.repair + supTabCounts.dispatch + supTabCounts.outsource : shown.length).toLocaleString("th-TH")} ใบ
              </Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          {/* นำเข้าใบแจ้งซ่อมจากไฟล์ฟอร์ม COCO — แอดมินเท่านั้น (เจ้าของงานขอ ต.ค. 69) · บนเว็บ เลือกไฟล์จากคอมพิวเตอร์ */}
          {user?.role === "ADMIN" && !user.partsAdmin && Platform.OS === "web" ? (
            <TouchableOpacity
              style={styles.importButton}
              onPress={() => setImporting(true)}
              activeOpacity={0.8}
              accessibilityLabel="นำเข้าใบแจ้งซ่อมจากไฟล์"
            >
              <Ionicons name="cloud-upload-outline" size={17} color={colors.navy} />
              {compact ? null : <Text style={styles.importButtonText}>นำเข้าจากไฟล์</Text>}
            </TouchableOpacity>
          ) : null}
          {/* Admin Spare Part ดูใบงานได้อย่างเดียว — เปิดใบงานไม่ได้ */}
          {user?.partsAdmin ? null : (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => navigation.navigate("WorkOrderForm")}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addButtonText}>เพิ่มใบงาน</Text>
            </TouchableOpacity>
          )}
        </View>
        {docked ? <Text style={styles.pageSub}>ป้ายสถานะบอกว่าใบงานกำลังรอใคร — ใบที่ถึงคิวคุณอยู่ในกล่องงาน</Text> : null}
      </View>
      <ViewTabs
        tabs={FILTERS.map((f) => ({
          value: f.value,
          label: f.label,
          n: counts[f.value],
          dot: jumpQueue.some((g) => g.filter === f.value),
        }))}
        value={filter}
        onPick={(v) => chooseFilter(v as Filter)}
        right={compact || isAreaTeam(user) ? null : <Toggle on={mineOnly} label={MINE_LABEL} onPress={toggleMine} />}
      />
      {supTabs && !loading && !error ? (
        <View style={styles.supTabs}>
          {SUP_TABS.map((t) => {
            const on = prefs.supTab === t.value;
            return (
              <TouchableOpacity
                key={t.value}
                style={[styles.supTab, on && styles.supTabOn]}
                onPress={() => {
                  setPref({ supTab: t.value });
                  setMarked(new Map());
                }}
                accessibilityLabel={`แท็บ ${t.label} ${supTabCounts[t.value]} ใบ`}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                aria-selected={on}
              >
                <Text style={[styles.supTabText, on && styles.supTabTextOn]}>{t.label}</Text>
                <View style={[styles.supTabN, on && styles.supTabNOn]}>
                  <Text style={[styles.supTabNText, on && styles.supTabNTextOn]}>{supTabCounts[t.value]}</Text>
                </View>
                {jumpQueue.some((g) => g.filter === "INBOX" && g.supTab === t.value) ? (
                  <View style={styles.tabDot} accessibilityLabel="มีใบที่อัปเดต" />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            autoFocus={searchFocused.current}
            onFocus={() => (searchFocused.current = true)}
            onBlur={() => (searchFocused.current = false)}
            placeholder="ค้นรหัสใบงาน สาขา หรือเรื่อง"
            placeholderTextColor={colors.textFaint}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </TouchableOpacity>
          ) : null}
        </View>
        {loading || error ? null : compact ? (
          <FilterButton count={activeCount} onPress={() => setSheetOpen(true)} />
        ) : (
          <>
            {groups.map((g) => (
              <FilterDropdown key={g.key} group={g} />
            ))}
            <View style={styles.tbSep} />
            <FilterDropdown group={sortGroup} icon="swap-vertical" />
          </>
        )}
      </View>
      {!loading && !error && rows.length > 0 ? (
        <View style={styles.quickWrap}>
          <QuickChips items={quickItems} on={quick} toggle={toggleQuick} wrap={!compact} />
        </View>
      ) : null}
      {!loading && !error ? (
        <View style={styles.activeWrap}>
          <ActiveBar shown={shown.length} total={tabRows.length} tags={activeTags} onClearAll={clearAll} />
        </View>
      ) : null}
      {filter === "INBOX" && !loading ? (
        <InboxAttention rows={shown} role={user?.role ?? null} onOpen={(id) => navigation.navigate("WorkOrderDetail", { id })} />
      ) : null}
    </View>
  );

  const status = loading ? (
    <View style={styles.centered}>
      <Spinner color={colors.primary} />
    </View>
  ) : error ? (
    <View style={styles.centered}>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity onPress={load} style={styles.retry}>
        <Text style={styles.retryText}>ลองใหม่</Text>
      </TouchableOpacity>
    </View>
  ) : rows.length === 0 ? (
    <EmptyState
      icon="clipboard-outline"
      title="ไม่มีใบงานในหมวดนี้"
      text="เปิดใบงานได้จากกระดานติดตามเครื่องเสีย หรือกดปุ่มเพิ่มใบงานด้านบน"
    />
  ) : shown.length === 0 ? (
    <EmptyState
      icon="funnel-outline"
      title="ไม่มีใบงานตามตัวกรองนี้"
      text="กด “ล้างทั้งหมด” ในแถบสรุปตัวกรอง หรือกด ✕ ทีละตัวที่ไม่ต้องการ"
    />
  ) : null;

  /**
   * ปิด scroll anchoring ของเบราว์เซอร์ที่กล่องเลื่อนของรายการ (เว็บเท่านั้น)
   *
   * FlatList เว้นที่ว่างไว้แทนการ์ดที่ยังไม่วาด (ประมาณความสูงจากการ์ดที่วาดแล้ว) พอวาดจริงความสูงไม่ตรง
   * เบราว์เซอร์จะเลื่อนตำแหน่งให้เอง "เพื่อไม่ให้ของบนจอขยับ" — แต่กับรายการเสมือนมันกระโดดข้ามไปทีละหลายพัน px
   * การ์ดช่วงนั้นถูกข้ามไปไม่เคยโผล่ (รายการราว 200 ใบบนมือถือ เลื่อนช้า ๆ เห็นแค่ 157 · ต.ค. 69)
   * ตั้งทุกครั้งที่รายการถูกสร้างใหม่ (key เปลี่ยนระหว่างว่าง/มีใบงาน)
   */
  const listKey = status ? "empty" : "list";
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = (listRef.current as unknown as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.();
    if (node?.style) node.style.setProperty("overflow-anchor", "none");
  }, [listKey]);

  return (
    <View style={styles.container}>
      {foldable ? null : header}
      {
        /*
          FlatList ไม่ใช่ ScrollView เพราะ ScrollView สร้างการ์ดทุกใบตั้งแต่เปิดหน้า
          รายการที่เปิดค้างสองร้อยใบจึงต้องวาดสองร้อยใบก่อนภาพแรกจะขึ้น
          ทั้งที่จอเห็นพร้อมกันได้ห้าใบ — FlatList วาดเฉพาะที่กำลังจะเห็น

          key เปลี่ยนทุกครั้งที่รายการสลับระหว่าง "ว่าง/กำลังโหลด" กับ "มีใบงาน" = สร้างรายการใหม่
          รายการที่ว่างอยู่แล้วค่อยได้ใบงานทีหลัง (โหลดเสร็จ · ลบคำค้นที่ไม่เจอ) ไม่วาดใบเพิ่มตอนเลื่อน
          เจอจริงหลังย้ายหัวหน้าเข้ามาในรายการ: ป้าย 123 ใบ เลื่อนจนสุดเห็นแค่ 6 ใบ
          สร้างใหม่แล้วช่องค้นหาในหัวรายการถูกสร้างใหม่ด้วย จึงคืนโฟกัสให้เอง (searchFocused)
        */
      }
      <View style={{ flex: 1 }}>
        <FlatList
          key={listKey}
          ref={listRef}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          data={status ? [] : items}
          ListEmptyComponent={status}
          keyExtractor={(it: ListItem) => ("sep" in it ? `sep-${it.sep}` : String(it.id))}
          contentContainerStyle={[
            table ? styles.tableOuter : styles.list,
            // แท็บล่างลอยทับ — เว้นท้ายรายการไว้ ใบสุดท้ายจะได้ไม่จมใต้แท็บ
            overlayOn ? { paddingBottom: tabH + spacing.lg } : null,
          ]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
          onScrollToIndexFailed={onScrollToIndexFailed}
          initialNumToRender={table ? 20 : 8}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={
            <>
              {/* แถบบนลอยทับ — เว้นที่ไว้ให้หัวหน้าเริ่มใต้แถบ */}
              {barsH ? <View style={{ height: barsH }} /> : null}
              {foldable ? header : null}
              {table && !status ? (
                <View style={styles.tableTop} onLayout={(e) => setTableW(Math.round(e.nativeEvent.layout.width))}>
                  <TableHead
                    values={colValues}
                    filters={colFilters}
                    sort={colSort}
                    onFilter={(key, next) => setColFilters((f) => ({ ...f, [key]: next ?? undefined }))}
                    onSort={(key, dir) => setColSort(dir ? { key, dir } : null)}
                  />
                </View>
              ) : null}
            </>
          }
          renderItem={({ item, index }: { item: ListItem; index: number }) =>
            table ? (
              // ตารางเป็นกรอบเดียวที่ต่อกันจากหัวคอลัมน์ลงมาทีละแถว — หัวหน้าอยู่ในรายการเดียวกันแล้ว
              // จะใช้ทั้งรายการเป็นกรอบเหมือนเดิมไม่ได้ ไม่งั้นช่องค้นหาและตัวกรองไปอยู่ในกรอบตารางด้วย
              <View style={[styles.tableMid, index === items.length - 1 && styles.tableBottom]}>
                {"sep" in item ? (
                  <View style={[styles.sepRow, item.sep === "URGENT" && styles.sepUrgent]}>
                    <Text style={[styles.sepText, item.sep === "URGENT" && styles.sepTextUrgent]}>
                      {item.sep === "URGENT" ? "● " : ""}
                      {item.label}
                    </Text>
                  </View>
                ) : (
                  <WorkOrderTableRow
                    row={item}
                    stripe={index % 2 === 1}
                    flash={flash.has(item.id)}
                    mark={marked.get(item.id)}
                    last={index === items.length - 1}
                    onPress={() => {
                      unmark(item.id);
                      navigation.navigate("WorkOrderDetail", { id: item.id });
                    }}
                  />
                )}
              </View>
            ) : "sep" in item ? (
              <View style={[table ? styles.sepRow : styles.sepCard, item.sep === "URGENT" && styles.sepUrgent]}>
                <Text style={[styles.sepText, item.sep === "URGENT" && styles.sepTextUrgent]}>
                  {item.sep === "URGENT" ? "● " : ""}
                  {item.label}
                </Text>
              </View>
            ) : table ? (
              <WorkOrderTableRow
                row={item}
                stripe={index % 2 === 1}
                flash={flash.has(item.id)}
                mark={marked.get(item.id)}
                last={index === items.length - 1}
                onPress={() => {
                  unmark(item.id);
                  navigation.navigate("WorkOrderDetail", { id: item.id });
                }}
              />
            ) : (
              <WorkOrderCard
                row={item}
                flash={flash.has(item.id)}
                mark={marked.get(item.id)}
                onPress={() => {
                  unmark(item.id);
                  navigation.navigate("WorkOrderDetail", { id: item.id });
                }}
              />
            )
          }
        />
        {/* จอคอม: ลอยเหนือรายการในกรอบนี้ · มือถือวาดท้ายหน้า (ข้างล่าง) — กรอบนี้เป็นชั้นของตัวเอง
            (react-native-web ให้ทุก View zIndex 0) แถบสรุปที่ลอยทับจะบังปุ่มจนกดไม่ได้ */}
        {foldable ? null : <UpdatePill count={pendingCount} unit="ใบงาน" hint={pendingHint} onPress={showPending} />}
      </View>
      {foldable ? (
        <Animated.View
          pointerEvents={barOn ? "box-none" : "none"}
          onLayout={(e) => setBarH(Math.round(e.nativeEvent.layout.height))}
          style={[
            styles.foldedWrap,
            {
              // โผล่ตามระยะเลื่อน 40 จุดสุดท้ายก่อนหัวหน้าพ้นจอ — ไม่ใช่สลับฉับตามเกณฑ์
              // จอแคบ: แถบสรุปเกาะใต้แถบบนที่กำลังหลบ — แถบบนหายหมดแล้วก็ขึ้นไปชิดขอบจอ
              top: overlayOn
                ? chromeHide.interpolate({ inputRange: [0, 1], outputRange: [barsH, insets.top] })
                : 0,
              opacity: scrollY.interpolate({
                inputRange: [Math.max(0, barsMove + headH - 40), Math.max(1, barsMove + headH)],
                outputRange: [0, 1],
                extrapolate: "clamp",
              }),
              transform: [
                {
                  translateY: scrollY.interpolate({
                    inputRange: [Math.max(0, barsMove + headH - 40), Math.max(1, barsMove + headH)],
                    outputRange: [-barH, 0],
                    extrapolate: "clamp",
                  }),
                },
              ],
            },
          ]}
        >
          <FoldedBar
            count={shown.length}
            parts={[
              FILTERS.find((f) => f.value === filter)?.label ?? "",
              ...activeTags.map((t) => t.label),
              isSet(sortGroup) ? `เรียง${pickedLabel(sortGroup)}` : "",
              settledSearch.trim() ? `ค้น “${settledSearch.trim()}”` : "",
            ].filter(Boolean)}
            onPress={backToTop}
          />
          {table && !status && tableW > 0 ? (
            <View style={[styles.tableTop, styles.tableHeadFloat, { width: tableW }]}>
              <TableHead
                    values={colValues}
                    filters={colFilters}
                    sort={colSort}
                    onFilter={(key, next) => setColFilters((f) => ({ ...f, [key]: next ?? undefined }))}
                    onSort={(key, dir) => setColSort(dir ? { key, dir } : null)}
                  />
            </View>
          ) : null}
        </Animated.View>
      ) : null}
      {foldable ? <UpdatePill count={pendingCount} unit="ใบงาน" hint={pendingHint} onPress={showPending} top={barsH + 8} /> : null}
      {/* อัปเดตหลายแท็บ: ไปแท็บแรกแล้ว ที่เหลือกดไปต่อจากปุ่มนี้ (ที่เดียวกับปุ่มมีอัปเดต · ของใหม่มาอีกรอบปุ่มนั้นขึ้นแทน) */}
      {jumpQueue.length ? (
        <UpdatePill
          count={pendingCount ? 0 : jumpQueue.reduce((n, g) => n + g.ids.length, 0)}
          unit="ใบงาน"
          label={`อีก ${jumpQueue.reduce((n, g) => n + g.ids.length, 0)} ใบ · แท็บ ${spotLabel(jumpQueue[0])}`}
          tone="navy"
          onPress={() => goTo(jumpQueue)}
          top={foldable ? barsH + 8 : 10}
        />
      ) : null}
      {importing ? (
        // ซ่อนตอนไปดูใบเดิม (ไม่ถอดทิ้ง) — กลับมาแล้วตัวอย่างที่อ่านไว้ยังอยู่
        <RepairImportModal
          visible={focused}
          onClose={() => setImporting(false)}
          onDone={() => load()}
          onOpenOrder={(id) => navigation.navigate("WorkOrderDetail", { id })}
        />
      ) : null}
      <FilterSheet
        visible={sheetOpen && compact}
        onClose={() => setSheetOpen(false)}
        groups={groups}
        sort={sortGroup}
        quick={rows.length ? quickItems : []}
        quickOn={quick}
        toggleQuick={toggleQuick}
        extra={isAreaTeam(user) ? null : <Toggle on={mineOnly} label={MINE_LABEL} onPress={toggleMine} />}
        shown={shown.length}
        onClearAll={clearAll}
      />
    </View>
  );
}

/**
 * ชื่อ "คนไหน/ทีมไหน" — ใช้ทั้งในตัวเลือก (withRegion: ใส่ภาคต่อท้าย แยกคนชื่อซ้ำ) และบนแถบหุบ/แถบสรุป
 */
function whoLabel(rows: WorkOrderRow[], who: Who, owner: Role | "", withRegion = false) {
  if (who === "none") return owner === "SUPERVISOR" ? "ยังไม่มีหัวหน้าภาคดูแล" : "ยังไม่มีทีม";
  if (who.startsWith("t:")) return `ทีม${who.slice(2)}`;
  for (const r of rows) {
    const sup = r.waitingOnSupervisors.find((x) => `s:${x.id}` === who);
    if (!sup) continue;
    // ภาคต่อท้ายใช้แยกคนชื่อซ้ำ — คนดูแลหลายภาคขึ้นครบทุกภาค (ภาคเดียวคงหน้าตาเดิม)
    const rs = withRegion ? regionsOf(sup) : [];
    return rs.length ? `${sup.name} (${regionsText(rs)})` : sup.name;
  }
  return "";
}

const FOLDED_H = 46;

/** แถบเดียวตอนหุบ — บอกตัวกรองที่ใช้อยู่ และพากลับไปเปลี่ยนตัวกรองได้ในแตะเดียว */
function FoldedBar({ count, parts, onPress }: { count: number; parts: string[]; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.folded} onPress={onPress} activeOpacity={0.85} accessibilityLabel="แสดงตัวกรองและช่องค้นหา">
      <View style={styles.foldedCount}>
        <Text style={styles.foldedCountText}>{count.toLocaleString("th-TH")} ใบ</Text>
      </View>
      <Text style={styles.foldedText} numberOfLines={1}>
        {parts.join(" · ")}
      </Text>
      <View style={styles.foldedBtn}>
        <Ionicons name="search" size={15} color={colors.primaryInk} />
        <Ionicons name="options-outline" size={16} color={colors.primaryInk} />
      </View>
    </TouchableOpacity>
  );
}

/**
 * กลุ่มตัวกรอง "รอใคร · คนไหน · ทีม · สาขา" — จอคอมเป็นปุ่มกางรายการ จอแคบเป็นหัวข้อในหน้าต่างตัวกรอง
 *
 * ตัวเลขของแต่ละตัวเลือกนับโดยใช้ตัวกรองของกลุ่มอื่น (เลือก DODO แล้วตัวเลขของ "หัวหน้าภาค"
 * คือใบ DODO ที่รอหัวหน้าภาค) — ตัวเลขบนตัวเลือกจึงเท่ากับจำนวนที่จะเห็นเมื่อกด
 * เลือกบทบาทแล้วมีกลุ่มที่สองให้เลือกต่อว่าเป็นของใคร — หัวหน้าภาครายคน ช่างรายทีม
 * แอดมินไม่แยกคน เพราะแอดมินทุกคนทำแทนกันได้ทุกขั้น
 */
function filterGroups({
  rows,
  prefs,
  setPref,
  byOwner,
  byType,
  hideOwner,
  showKind,
}: {
  /** ใบในแท็บที่เลือก ผ่านตัวกรองหัวคอลัมน์และชิปต้องรีบดูแล้ว */
  rows: WorkOrderRow[];
  prefs: ListPrefs;
  setPref: (p: Partial<ListPrefs>) => void;
  byOwner: (r: WorkOrderRow) => boolean;
  byType: (r: WorkOrderRow) => boolean;
  /** ไม่มีกลุ่ม "รอใคร" — กล่องงานหัวหน้าภาค (แยกเป็นแท็บแล้ว) */
  hideOwner?: boolean;
  /** กลุ่ม "ทีมปกติ / ใบงาน SUB" — แอดมินกับหัวหน้าภาค (ช่างไม่มีใบงาน SUB) */
  showKind?: boolean;
}): FilterGroup[] {
  const typed = rows.filter(byType);
  const ownerCount = (role: Role | "") => typed.filter((r) => !role || r.stageActor === role).length;
  const typeCount = (t: "" | "DODO" | "COCO") =>
    rows.filter((r) => byOwner(r) && (!t || r.branchType === t) && (!prefs.kind || (prefs.kind === "sub") === !!r.outsource) && claimMatch(r, prefs.claim)).length;
  const claimCount = (v: ListPrefs["claim"]) =>
    rows.filter((r) => byOwner(r) && (!prefs.btype || r.branchType === prefs.btype) && (!prefs.kind || (prefs.kind === "sub") === !!r.outsource) && claimMatch(r, v)).length;
  const kindCount = (k: "" | "normal" | "sub") =>
    rows.filter((r) => byOwner(r) && (!prefs.btype || r.branchType === prefs.btype) && (!k || (k === "sub") === !!r.outsource) && claimMatch(r, prefs.claim)).length;
  const groups: FilterGroup[] = [];

  if (!hideOwner) {
    groups.push({
      key: "owner",
      label: "รอใคร",
      value: prefs.owner,
      onPick: (v) => setPref({ owner: v as Role | "", who: "" }),
      options: [
        { value: "", label: "ทุกคน", n: ownerCount("") },
        ...ROLE_TABS.map((t) => ({ value: t.value, label: t.label, dot: t.color, n: ownerCount(t.value) })),
      ],
    });
    // ตัวเลือก "ของใคร" สร้างจากใบที่มีอยู่จริง — ไม่มีชื่อที่กดแล้วได้รายการว่าง
    if (prefs.owner === "SUPERVISOR" || prefs.owner === "EMPLOYEE") {
      const map = new Map<Who, { label: string; n: number }>();
      for (const r of typed) {
        if (r.stageActor !== prefs.owner) continue;
        for (const k of whoKeys(r)) {
          const cur = map.get(k);
          map.set(k, { label: cur?.label ?? whoLabel([r], k, prefs.owner, true), n: (cur?.n ?? 0) + 1 });
        }
      }
      const who = [...map.entries()].sort((a, b) =>
        a[0] === "none" ? 1 : b[0] === "none" ? -1 : a[1].label.localeCompare(b[1].label, "th")
      );
      groups.push({
        key: "who",
        label: prefs.owner === "SUPERVISOR" ? "หัวหน้าภาคคนไหน" : "ทีมไหน",
        value: prefs.who,
        onPick: (v) => setPref({ who: v }),
        options: [{ value: "", label: "ทุกคน", n: ownerCount(prefs.owner) }, ...who.map(([k, o]) => ({ value: k, label: o.label, n: o.n }))],
      });
    }
  }
  if (showKind)
    groups.push({
      key: "kind",
      label: "ทีม",
      value: prefs.kind,
      onPick: (v) => setPref({ kind: v as ListPrefs["kind"] }),
      options: [
        { value: "", label: "ทั้งหมด", n: kindCount("") },
        { value: "normal", label: "ทีมปกติ", n: kindCount("normal") },
        { value: "sub", label: "ใบงาน SUB", hint: "จ่ายให้ทีม outsource", n: kindCount("sub") },
      ],
    });
  // ใบงานเคลม — ใบที่ตอนปิดงานแจ้งเคลมอะไหล่เก่า (เจ้าของงานขอ ต.ค. 69) · ไม่มีใบเคลมในรายการเลยก็ไม่ต้องโชว์กลุ่มนี้
  if (rows.some((r) => r.claimStatus))
    groups.push({
      key: "claim",
      label: "ใบงานเคลม",
      value: prefs.claim ?? "",
      onPick: (v) => setPref({ claim: v as ListPrefs["claim"] }),
      options: [
        { value: "", label: "ทั้งหมด", n: claimCount("") },
        { value: "any", label: "ใบงานแจ้งเคลม", hint: "ทุกสถานะเคลม", n: claimCount("any") },
        ...(["PENDING", "APPROVED", "REJECTED"] as const).map((v) => ({ value: v, label: CLAIM_LABEL[v], n: claimCount(v) })),
      ],
    });
  groups.push({
    key: "btype",
    label: "สาขา",
    value: prefs.btype,
    onPick: (v) => setPref({ btype: v as ListPrefs["btype"] }),
    options: [
      { value: "", label: "ทั้งหมด", n: typeCount("") },
      { value: "DODO", label: "DODO", hint: "แฟรนไชส์", n: typeCount("DODO") },
      { value: "COCO", label: "COCO", hint: "สาขาบริษัท", n: typeCount("COCO") },
    ],
  });
  return groups;
}

/**
 * ป้าย "แจ้งเคลม" — ใบที่ตอนปิดงานส่งอะไหล่เก่าเคลม (เจ้าของงานขอ ต.ค. 69)
 * สีม่วงของ Admin Spare Part ซึ่งเป็นคนตรวจ · ตีกลับเป็นแดง เพราะช่างต้องแก้แล้วปิดใหม่
 */
function ClaimBadge({ row }: { row: WorkOrderRow }) {
  if (!row.claimStatus) return null;
  const bad = row.claimStatus === "REJECTED";
  const ok = row.claimStatus === "APPROVED";
  return (
    <View
      style={[styles.claimBadge, bad && styles.claimBadgeBad, ok && styles.claimBadgeOk]}
      accessibilityLabel={`ใบงานแจ้งเคลม ${CLAIM_LABEL[row.claimStatus]}`}
    >
      <Ionicons name="shield-checkmark-outline" size={11} color={bad ? colors.dangerInk : ok ? colors.successInk : colors.roleAdmin} />
      <Text style={[styles.claimBadgeText, bad && { color: colors.dangerInk }, ok && { color: colors.successInk }]}>
        แจ้งเคลม{bad ? " · ตีกลับ" : ok ? " · อนุมัติ" : ""}
      </Text>
    </View>
  );
}

/** ป้าย "รอใคร" ในแถว/การ์ด — บทบาท + ชื่อหัวหน้าภาคหรือทีม */
function WaitingOn({ row }: { row: WorkOrderRow }) {
  if (!row.stageActor) return null;
  const who =
    row.stageActor === "SUPERVISOR"
      ? row.waitingOnSupervisors.map((s) => s.name).join(", ") || "ยังไม่มีคนดูแล"
      : row.stageActor === "EMPLOYEE"
        ? row.waitingOnTeam
          ? `ทีม${row.waitingOnTeam}`
          : null
        : null;
  const tone = OWNER_TONE[row.stageActor];
  return (
    <View style={[styles.waitTag, { backgroundColor: tone.bg }]}>
      <Text style={[styles.waitText, { color: tone.fg }]} numberOfLines={1}>
        {ROLE_LABEL[row.stageActor]}
        {who ? <Text style={styles.waitWho}> · {who}</Text> : null}
      </Text>
    </View>
  );
}

function BranchType({ type }: { type: "DODO" | "COCO" }) {
  return (
    <View style={[styles.btype, type === "DODO" ? styles.btypeDodo : styles.btypeCoco]}>
      <Text style={[styles.btypeText, { color: type === "DODO" ? colors.warningInk : colors.primaryInk }]}>{type}</Text>
    </View>
  );
}

/**
 * หัวตาราง — ความกว้างคอลัมน์ต้องตรงกับ WorkOrderTableRow
 * ทุกหัวคอลัมน์กดได้แบบ Excel: เรียง · ค้นหา · ติ๊กค่าที่จะแสดง (เจ้าของงานขอ ต.ค. 69)
 */
const COL_STYLE: Record<ColKey, object> = {
  wo: { flex: 2.4, minWidth: 0 },
  branch: { flex: 2.2, minWidth: 0 },
  machine: { flex: 0.8 },
  team: { flex: 1.3 },
  appt: { flex: 1.5, minWidth: 0 },
  status: { flex: 1.6 },
  wait: { flex: 1.6, minWidth: 0 },
  opener: { flex: 1.5, minWidth: 0 },
};

/** ช่องวันนัด — ตาราง (stack) กับการ์ดมือถือ (inline) ใช้ชิ้นเดียวกัน */
function Appointment({ row, inline }: { row: WorkOrderRow; inline?: boolean }) {
  const a = apptOf(row);
  if (!a) return inline ? null : <Text style={[styles.td, styles.tdMuted]}>ยังไม่นัด</Text>;
  const tone = row.appointmentStatus ? APPT_TONE[row.appointmentStatus] : null;
  return (
    <View style={inline ? styles.apptInline : styles.apptStack}>
      {inline ? <Text style={[styles.meta, styles.metaFit]}>นัด</Text> : null}
      {/* วันกับเวลาแยกชิ้น — คอลัมน์แคบแล้วตัดบรรทัดทั้งก้อน ไม่ใช่เหลือ "น." ห้อยบรรทัดใหม่ */}
      <View style={styles.apptWhenRow}>
        <Text style={[styles.td, styles.apptWhen]}>{a.date}</Text>
        {a.time ? <Text style={[styles.td, styles.apptWhen]}>{`·\u00A0${a.time}`}</Text> : null}
      </View>
      {row.appointmentStatusLabel && tone ? (
        <View style={[styles.apptChip, { backgroundColor: tone.bg, borderColor: tone.line }]}>
          <Text style={[styles.apptChipText, { color: tone.fg }]}>{row.appointmentStatusLabel}</Text>
        </View>
      ) : null}
      {row.appointmentByName ? (
        <Text style={styles.apptRel} numberOfLines={1}>
          {inline ? "คอนเฟิร์มโดย " : "โดย "}
          <Text style={styles.apptBy}>{row.appointmentByName}</Text>
        </Text>
      ) : null}
      {a.rel ? (
        <Text style={[styles.apptRel, a.rel.tone === "late" ? styles.apptLate : a.rel.tone === "today" ? styles.apptToday : null]}>
          {a.rel.text}
        </Text>
      ) : null}
    </View>
  );
}
function TableHead({
  values,
  filters,
  sort,
  onFilter,
  onSort,
}: {
  values: Record<ColKey, { value: string; count: number }[]>;
  filters: ColFilters;
  sort: { key: ColKey; dir: SortDir } | null;
  onFilter: (key: ColKey, next: Set<string> | null) => void;
  onSort: (key: ColKey, dir: SortDir | null) => void;
}) {
  return (
    <View style={[styles.tr, styles.thead]}>
      {COLUMNS.map((c) => (
        <HeadFilter
          key={c.key}
          label={c.label}
          style={COL_STYLE[c.key]}
          values={values[c.key]}
          selected={filters[c.key] ?? null}
          sort={sort?.key === c.key ? sort.dir : null}
          onApply={(next) => onFilter(c.key, next)}
          onSort={(dir) => onSort(c.key, dir)}
        />
      ))}
      <View style={styles.colAction} />
    </View>
  );
}

/** ชื่อผู้เปิด + ป้ายบทบาท สีเดียวกับแท็บบทบาท — ไม่มีผู้เปิดขึ้นว่า "ระบบ" */
function Opener({ row }: { row: WorkOrderRow }) {
  const role = roleGroup(row.createdByRole);
  const tone = role ? OWNER_TONE[role] : { bg: colors.tile, fg: colors.textMuted };
  return (
    <View style={styles.openerRow}>
      <Text style={styles.openerName} numberOfLines={1}>
        {row.createdByName ?? "ระบบ"}
      </Text>
      <View style={[styles.roleChip, { backgroundColor: tone.bg }]}>
        <Text style={[styles.roleChipText, { color: tone.fg }]}>
          {role ? ROLE_LABEL[role] : "อัตโนมัติ"}
        </Text>
      </View>
    </View>
  );
}

/**
 * กระพริบ 3 ครั้งทับการ์ด/แถว — ใบที่ปุ่ม "มีอัปเดต" พามา (เจ้าของงานขอ ต.ค. 69 "กระพริบใบงานนั้นๆ")
 * วาดใหม่ทุกครั้งที่ flash เปิด (ถอดออกเมื่อปิด) จึงเล่นจากต้นเสมอ
 * เว็บใช้ CSS animation ไม่ใช่ Animated — Animated บนเว็บขยับด้วย JavaScript ทีละเฟรม แย่งเวลากับการวาดรายการ (ดู LoadingBar)
 */
// ผ่าน StyleSheet.create — react-native-web ทิ้ง animationKeyframes ที่ส่งเป็น style ตรง ๆ (ดู LoadingBar)
const WEB_BLINK = StyleSheet.create({
  blink: {
    animationKeyframes: [{ "0%": { opacity: 0 }, "50%": { opacity: 1 }, "100%": { opacity: 0 } }],
    animationDuration: "0.62s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "3",
    animationFillMode: "forwards",
  },
} as Record<string, object>).blink;
function Blink({ radius: r = 0 }: { radius?: number }) {
  const web = Platform.OS === "web";
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (web) return;
    const pulse = Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 310, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 310, useNativeDriver: true }),
    ]);
    const run = Animated.loop(pulse, { iterations: 3 });
    run.start();
    return () => run.stop();
  }, [v, web]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.blink, { borderRadius: r }, web ? [{ opacity: 0 }, WEB_BLINK] : { opacity: v }]}
    />
  );
}

const WorkOrderTableRow = React.memo(function WorkOrderTableRow({
  row,
  last,
  stripe,
  flash,
  mark,
  onPress,
}: {
  row: WorkOrderRow;
  last: boolean;
  /** แถวคู่ — พื้นเทาจาง ๆ สลับแถว */
  stripe?: boolean;
  /** เพิ่งเปลี่ยน (รีเฟรช / ปุ่มมีอัปเดต) — กระพริบ 3 ครั้ง */
  flash?: boolean;
  /** ปุ่มมีอัปเดตพามาดู — เปลี่ยนอะไร · ขอบเหลืองค้างไว้จนกดเข้าไปดู */
  mark?: string;
  onPress: () => void;
}) {
  const tone = statusTone(row.status);
  const closed = row.status === "DONE";
  // แถวที่เมาส์ชี้ขึ้นพื้นฟ้า + แถบสีซ้ายหนาขึ้น (เจ้าของงานขอ ต.ค. 69) — กวาดเมาส์แล้วรู้ว่ากำลังจะเปิดใบไหน
  const [hover, setHover] = useState(false);
  const hoverProps = { onPointerEnter: () => setHover(true), onPointerLeave: () => setHover(false) } as object;
  return (
    <TouchableOpacity
      {...hoverProps}
      style={[
        styles.tr,
        !last && styles.trLine,
        stripe && styles.trAlt,
        isHot(row) && styles.trUrgent,
        closed && styles.trDone,
        mark && !flash && styles.flashRow,
        hover && styles.trHover,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {flash ? <Blink /> : null}
      {/* แถบสีซ้ายแถว — กวาดตาลงทั้งตารางแล้วเห็นว่าค้างที่ใครโดยไม่ต้องอ่านป้าย */}
      <View style={[styles.rowBar, hover && styles.rowBarHover, { backgroundColor: tone.fg }]} />
      <View style={[styles.colWo, styles.cellWo]}>
        <View style={styles.rowIcon}>
          <Ionicons name="clipboard-outline" size={18} color={colors.primaryInk} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.codeRow}>
            <Text style={styles.code}>{row.code}</Text>
            {row.priority === "URGENT" ? <UrgentBadge size="sm" /> : null}
            <ClaimBadge row={row} />
          </View>
          <Text style={styles.td2}>{row.title}</Text>
          {mark ? (
            <Text style={styles.markText}>
              <Text style={styles.flashTag}>อัปเดต · </Text>
              {mark}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.colBranch}>
        <View style={styles.codeRow}>
          <Text style={styles.td}>{row.branchCode}</Text>
          <BranchType type={row.branchType} />
        </View>
        <Text style={styles.td2}>{row.branchName}</Text>
        <WarrantyBadge state={row.warranty} endsAt={row.warrantyEndsAt} />
      </View>
      <Text style={[styles.td, styles.colMachine]}>{machineTag(row.machineCode, row.machineCapacityKg) ?? "—"}</Text>
      <Text style={[styles.td, styles.colTeam, !(row.assignedToName ?? row.assignedTeam) && styles.tdMuted]}>
        {row.assignedToName ?? row.assignedTeam ?? "ยังไม่มอบหมาย"}
        {row.crossFrom ? <Text style={styles.crossTag}> · ข้ามทีม</Text> : null}
      </Text>
      <View style={styles.colAppt}>
        <Appointment row={row} />
      </View>
      <View style={styles.colStatus}>
        <View style={[styles.badge, { backgroundColor: closed ? colors.card : tone.bg, alignSelf: "flex-start" }, closed && styles.badgeDone]}>
          <Text style={[styles.badgeText, { color: tone.fg }]}>{statusText(row)}</Text>
        </View>
        <PartsOutBadge row={row} />
        <RolledBackBadge row={row} />
        <AdminReviewTag review={row.adminReview} />
        {/* ปิดแล้วแต่ไม่มีช่างเข้า — คนไล่ดูรายการต้องแยกออกจากใบที่ซ่อมจริงได้ */}
        {row.closeResult === "SUPERVISOR_CLOSED" ? <Text style={styles.td2}>{row.closeResultLabel}</Text> : null}
        {row.stageActor ? <StuckText row={row} style={styles.td2} /> : null}
        <PartsEta row={row} />
      </View>
      <View style={styles.colWait}>
        <WaitingOn row={row} />
      </View>
      <View style={styles.colOpener}>
        <Opener row={row} />
        <Text style={styles.td2}>{formatDateTime(row.createdAt)}</Text>
        <View style={styles.srcTag}>
          <Text style={styles.srcTagText}>{row.source === "OUTAGE" ? "จากกระดาน" : row.source === "FORM" ? "ฟอร์มแจ้งซ่อม" : "เปิดเอง"}</Text>
        </View>
      </View>
      <View style={styles.colAction}>
        <View style={styles.viewBtn}>
          <Ionicons name="document-text-outline" size={16} color={colors.primaryInk} />
          <Text style={styles.viewBtnText}>ดู</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

/**
 * memo ไว้เพราะการ์ดทั้งหน้าถูกวาดใหม่ทุกครั้งที่กดตัวกรองหรือพิมพ์ค้นหา
 * ทั้งที่แถวส่วนใหญ่เป็นข้อมูลชุดเดิม
 */
const WorkOrderCard = React.memo(function WorkOrderCard({
  row,
  flash,
  mark,
  onPress,
}: {
  row: WorkOrderRow;
  /** เพิ่งเปลี่ยน (รีเฟรช / ปุ่มมีอัปเดต) — กระพริบ 3 ครั้ง */
  flash?: boolean;
  /** ปุ่มมีอัปเดตพามาดู — เปลี่ยนอะไร · ขอบเหลืองค้างไว้จนกดเข้าไปดู */
  mark?: string;
  onPress: () => void;
}) {
  const tone = statusTone(row.status);
  const closed = row.status === "DONE";
  // การ์ดบนเว็บจอแคบ/แท็บเล็ตที่ใช้เมาส์ก็ต้องเห็นว่าชี้ใบไหน — แบบเดียวกับแถวตาราง
  const [hover, setHover] = useState(false);
  const hoverProps = { onPointerEnter: () => setHover(true), onPointerLeave: () => setHover(false) } as object;
  return (
    <TouchableOpacity
      {...hoverProps}
      style={[
        styles.card,
        closed && styles.cardDone,
        { borderLeftColor: tone.fg },
        (flash || mark) && styles.flashCard,
        hover && styles.cardHover,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {isHot(row) ? <UrgentGlow radius={radius.md} /> : null}
      {flash ? <Blink radius={radius.md} /> : null}
      <View style={styles.cardTop}>
        <Text style={styles.code}>{row.code}</Text>
        {row.priority === "URGENT" ? <UrgentBadge size="sm" /> : null}
        <ClaimBadge row={row} />
        <View style={{ flex: 1 }} />
        <RolledBackBadge row={row} />
        <AdminReviewTag review={row.adminReview} />
        <PartsOutBadge row={row} />
        <View style={[styles.badge, { backgroundColor: closed ? colors.card : tone.bg }, closed && styles.badgeDone]}>
          <Text style={[styles.badgeText, { color: tone.fg }]}>{statusText(row)}</Text>
        </View>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {row.title}
        {flash || mark ? <Text style={styles.flashTag}> อัปเดต</Text> : null}
      </Text>
      {mark ? <Text style={styles.markText}>{mark}</Text> : null}

      <View style={styles.metaRow}>
        <Ionicons name="business-outline" size={13} color={colors.textFaint} />
        <BranchType type={row.branchType} />
        <Text style={styles.meta}>
          {row.branchCode} · {row.branchName}
          {row.machineCode ? ` · เครื่อง ${machineTag(row.machineCode, row.machineCapacityKg)}` : ""}
        </Text>
      </View>
      {row.warranty ? (
        <View style={styles.metaRow}>
          <WarrantyBadge state={row.warranty} endsAt={row.warrantyEndsAt} />
        </View>
      ) : null}

      {row.stageActor ? (
        <View style={styles.metaRow}>
          <WaitingOn row={row} />
          <StuckText row={row} style={styles.meta} />
        </View>
      ) : null}
      <PartsEta row={row} />

      <View style={styles.metaRow}>
        <Ionicons name="people-outline" size={13} color={colors.textFaint} />
        <Text style={styles.meta}>
          {row.assignedToName ?? row.assignedTeam ?? "ยังไม่มอบหมายทีม"}
          {row.crossFrom ? <Text style={styles.crossTag}> · ข้ามทีมจาก {row.crossFrom}</Text> : null}
        </Text>
      </View>
      {row.scheduledAt ? (
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={13} color={colors.textFaint} />
          <Appointment row={row} inline />
        </View>
      ) : null}

      <View style={styles.metaRow}>
        <Ionicons name="create-outline" size={13} color={colors.textFaint} />
        <Text style={[styles.meta, styles.metaFit]}>เปิดโดย</Text>
        <Opener row={row} />
        <Text style={styles.meta}>
          · {formatDateTime(row.createdAt)}
          {row.source === "OUTAGE" ? " · จากกระดาน" : row.source === "FORM" ? " · ฟอร์มแจ้งซ่อม" : ""}
        </Text>
      </View>

      {/* บอกแค่ว่ามีรูปกี่ไฟล์ ไม่โหลดรูปมาแสดงในรายการ — รายการมีเป็นร้อยใบ
          คนที่ไล่ดูจะได้รู้ว่าใบไหนมีของให้ดูก่อนกดเข้าไป */}
      {row.attachmentCount > 0 ? (
        <View style={styles.metaRow}>
          <Ionicons name="images-outline" size={13} color={colors.textFaint} />
          <Text style={styles.meta}>{row.attachmentCount} รูป/วิดีโอ</Text>
        </View>
      ) : null}

      {row.closedAt ? (
        <View style={styles.metaRow}>
          <Ionicons name="checkmark-done-outline" size={13} color={colors.success} />
          <Text style={styles.meta}>
            {row.closeResultLabel} · {formatDateTime(row.closedAt)}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
});

/**
 * หัวข้อบนสุดของกล่องงาน (เจ้าของงานเลือก ต.ค. 69)
 *
 * หัวหน้าภาค: "ออกงานวันนี้" — ลูกค้าคอนเฟิร์มแล้ว รอรับทราบปล่อยงาน เน้นย้ำว่ามีงานออกวันนี้ ไม่ให้ปนกับใบอื่น
 * แอดมิน: "ไม่มีคนรับ" (รอหัวหน้าภาคแต่ภาค/ทีมนั้นไม่มีคน) · "เลยนัด" (วันนัดผ่านแล้วใบยังไม่ถึงช่าง —
 *   เบิกก่อนคอนเฟิร์ม ต.ค. 69 รอบสอง ใบค้างขั้นเบิก/โอนได้หลายวัน วันที่หัวหน้าภาคนัดไว้จึงเลยได้ก่อนถึงขั้นคอนเฟิร์ม)
 * ใบพวกนี้ยังอยู่ในรายการข้างล่างตามปกติ — หัวข้อนี้แค่ดึงขึ้นมาให้เห็นก่อน
 */
function InboxAttention({ rows, role, onOpen }: { rows: WorkOrderRow[]; role: string | null; onOpen: (id: number) => void }) {
  const today = todayBkk();
  const groups: { key: string; title: string; hint: string; tone: "sup" | "bad"; items: WorkOrderRow[] }[] = [];
  if (role === "SUPERVISOR") {
    const due = rows.filter((r) => r.status === "ASSIGNED" && r.scheduledAt?.slice(0, 10) === today);
    if (due.length)
      groups.push({ key: "today", title: `ออกงานวันนี้ ${due.length} ใบ`, hint: "ลูกค้าคอนเฟิร์มแล้ว — กดรับทราบเพื่อปล่อยงานให้ช่าง", tone: "sup", items: due });
  }
  if (role === "ADMIN") {
    const orphan = rows.filter((r) => r.orphan);
    const overdue = rows.filter((r) => r.overdue);
    if (orphan.length)
      groups.push({
        key: "orphan",
        title: `ไม่มีคนรับ ${orphan.length}`,
        hint: "ไม่มีหัวหน้าภาคดูแลสาขาเหล่านี้ — แต่ละแถวบอกว่าต้องไปแก้ที่ไหน · แอดมินกดทำแทนได้",
        tone: "bad",
        // เรียงตามเหตุผล ให้ใบที่แก้ที่เดียวกันอยู่ติดกัน
        items: [...orphan].sort((a, b) => (a.orphanReason ?? "").localeCompare(b.orphanReason ?? "", "th")),
      });
    if (overdue.length)
      groups.push({
        key: "overdue",
        title: `เลยนัด ${overdue.length}`,
        // ใบที่ค้างขั้นโอน/เบิกคลังอื่นก็มาอยู่ที่นี่ (ขั้นของหัวหน้าภาค) — แอดมินเลื่อนวันได้ แต่ของต้องตามจากหัวหน้าภาค
        hint: "วันนัดผ่านไปแล้ว ใบยังไม่ถึงช่าง — เลื่อนวันนัด/โทรนัดใหม่ · ท้ายแถวบอกว่าค้างที่ใคร (ค้างโอน/เบิกคลังอื่น = ตามหัวหน้าภาค)",
        tone: "bad",
        items: overdue,
      });
  }
  if (!groups.length) return null;
  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.sm, marginHorizontal: spacing.lg }}>
      {groups.map((g) => (
        <View
          key={g.key}
          style={[styles.attn, g.tone === "bad" ? styles.attnBad : styles.attnSup]}
          accessibilityLabel={`หัวข้อ ${g.title}`}
        >
          <Text style={[styles.attnTitle, g.tone === "bad" ? styles.attnTitleBad : styles.attnTitleSup]}>{g.title}</Text>
          <Text style={styles.attnHint}>{g.hint}</Text>
          {g.items.map((r) => (
            <TouchableOpacity key={r.id} style={styles.attnRow} onPress={() => onOpen(r.id)} accessibilityLabel={`${g.title} ${r.code}`}>
              <Text style={styles.attnCode}>{r.code}</Text>
              {/* เหตุผลของ "ไม่มีคนรับ" ยาว — ให้ขึ้นบรรทัดใหม่ได้ ไม่ตัดทิ้ง */}
              <Text style={styles.attnText} numberOfLines={g.key === "orphan" ? 2 : 1}>
                {[
                  r.branchCode,
                  g.key === "orphan" ? r.orphanReason ?? r.statusLabel : r.assignedTeam && `ทีม${r.assignedTeam}`,
                  g.key === "today"
                    ? r.scheduledTime
                      ? `${r.scheduledTime} น.`
                      : "ทั้งวัน"
                    : g.key === "overdue" && r.scheduledAt
                      ? `นัด ${thaiDate(r.scheduledAt.slice(0, 10))}`
                      : null,
                  // เลยนัดได้หลายขั้นแล้ว (เบิก · โอน · คอนเฟิร์ม) — บอกว่าค้างที่ไหน จะได้รู้ว่าต้องตามใคร
                  g.key === "overdue" ? r.statusLabel : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tbSep: { width: 1, height: 26, backgroundColor: colors.border, marginHorizontal: 2 },
  quickWrap: { paddingTop: spacing.md },
  activeWrap: { paddingTop: spacing.sm },
  // แท็บแบบขีดเส้นใต้ ไม่ใช่ปุ่มกลม — หน้าตาต่างจากชิปข้างล่าง ให้เห็นว่าเป็นชั้นบนสุดของกล่องงาน
  supTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  supTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
    marginBottom: -2,
  },
  supTabOn: { borderBottomColor: colors.primary },
  supTabText: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.textMuted },
  supTabTextOn: { color: colors.primaryDark },
  supTabN: { borderRadius: 999, paddingHorizontal: 7, backgroundColor: colors.tile },
  supTabNOn: { backgroundColor: colors.primarySoft },
  supTabNText: { fontSize: 12, lineHeight: 18, fontWeight: "800", color: colors.textMuted },
  supTabNTextOn: { color: colors.primaryDark },
  attn: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, gap: 4 },
  attnSup: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  attnBad: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  attnTitle: { fontSize: 17, lineHeight: 26, fontWeight: "800" },
  attnTitleSup: { color: colors.primaryDark },
  attnTitleBad: { color: colors.danger },
  claimBadge: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999, paddingHorizontal: 7, backgroundColor: colors.roleAdminSoft, borderWidth: 1, borderColor: colors.roleAdminLine },
  claimBadgeBad: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerLine },
  claimBadgeOk: { backgroundColor: colors.successSoft, borderColor: colors.successLine },
  claimBadgeText: { fontSize: 11, lineHeight: 18, fontWeight: "700", color: colors.roleAdmin },
  attnHint: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
  attnRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  attnCode: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  attnText: { flex: 1, minWidth: 0, fontSize: 13, color: colors.textMuted },
  container: { flex: 1, backgroundColor: colors.background },
  // ลอยทับบนสุดของรายการ — ไม่ดันรายการลง ความสูงหน้าจอจึงไม่เปลี่ยนระหว่างเลื่อน
  foldedWrap: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 2 },
  tableOuter: { paddingBottom: spacing.lg },
  // กรอบตารางแบ่งเป็นสามส่วน (หัว · แถว · ท้าย) เพราะแถวถูกวาดทีละแถวในรายการ
  tableTop: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: "hidden",
  },
  tableMid: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  tableBottom: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  // หัวคอลัมน์ที่ลอยใต้แถบสรุป — ไม่มีมุมโค้งด้านบน เพราะต่อจากแถบสรุปแล้ว
  tableHeadFloat: { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0, ...shadow.card },
  // หัวหน้าอยู่ในรายการซึ่งมีขอบซ้ายขวาอยู่แล้ว — หักออกให้หัวหน้ากว้างเต็มเหมือนตอนอยู่นอกรายการ
  headInList: { marginHorizontal: -spacing.lg },
  folded: {
    height: FOLDED_H,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  foldedCount: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 10 },
  foldedCountText: { fontSize: 12, lineHeight: 22, fontWeight: "800", color: colors.primaryInk },
  foldedText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 20, fontWeight: "600", color: colors.text },
  foldedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.sky50,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    flexShrink: 0,
  },
  searchBox: {
    flex: 1,
    // จอคอม: ปุ่มตัวกรองเยอะจนแถวไม่พอ ช่องค้นหาตกไปบรรทัดใหม่แทนการหดจนพิมพ์ไม่เห็น
    minWidth: 220,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  importButtonText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.navy },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.navyFill,
    borderRadius: 14,
    minHeight: 44,
    paddingHorizontal: 16,
    ...shadow.raised,
  },
  addButtonText: { color: "#fff", fontSize: 14, lineHeight: 22, fontWeight: "700" },
  tableList: {
    margin: spacing.lg,
    marginTop: 0,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  tr: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  trLine: { borderBottomWidth: 1, borderBottomColor: colors.border },
  trAlt: { backgroundColor: colors.rowAlt },
  cardHover: { backgroundColor: colors.rowHover, borderColor: colors.primary },
  trHover: { backgroundColor: colors.rowHover },
  rowBarHover: { width: 6, top: 6, bottom: 6 },
  thead: { backgroundColor: colors.sky50, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 10 },
  th: { fontSize: 12, lineHeight: 18, fontWeight: "800", color: colors.textMuted },
  td: { fontSize: 14, lineHeight: 21, color: colors.text },
  td2: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  tdMuted: { color: colors.textFaint },
  // จ่ายข้ามทีม — สีหัวหน้าภาค (เรื่องการจ่ายงาน) ไม่ใช่สีเตือน เพราะไม่ใช่ความผิดปกติ
  crossTag: { color: colors.roleSupervisor, fontWeight: "700" },
  colWo: { flex: 2.4, minWidth: 0 },
  colBranch: { flex: 2.2, minWidth: 0 },
  colMachine: { flex: 0.8 },
  colTeam: { flex: 1.3 },
  colAppt: { flex: 1.5, minWidth: 0 },
  apptStack: { gap: 3, alignItems: "flex-start" },
  apptInline: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, flex: 1, minWidth: 0 },
  apptWhen: { fontWeight: "600", fontVariant: ["tabular-nums"] },
  apptWhenRow: { flexDirection: "row", flexWrap: "wrap", columnGap: 4 },
  apptChip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6 },
  apptChipText: { fontSize: 11, lineHeight: 17, fontWeight: "700" },
  apptRel: { fontSize: 11.5, lineHeight: 17, color: colors.textMuted },
  apptBy: { fontWeight: "700", color: colors.roleAdmin },
  apptLate: { color: colors.dangerInk, fontWeight: "700" },
  apptToday: { color: colors.primaryInk, fontWeight: "700" },
  colStatus: { flex: 1.6, gap: 2 },
  colWait: { flex: 1.6, minWidth: 0 },
  colOpener: { flex: 1.5, minWidth: 0, gap: 2, alignItems: "flex-start" },
  openerRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, minWidth: 0 },
  openerName: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.text, flexShrink: 1 },
  roleChip: { borderRadius: 999, paddingHorizontal: 7 },
  roleChipText: { fontSize: 11, lineHeight: 17, fontWeight: "700" },
  srcTag: { borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 6 },
  srcTagText: { fontSize: 11, lineHeight: 16, color: colors.textMuted },
  // พื้นแดงจาง ๆ ทั้งแถว — ตารางตัดขอบ (overflow hidden) ออร่ารอบแถวจึงใช้ไม่ได้ เหลือป้ายที่เรืองแสงแทน
  trUrgent: { backgroundColor: colors.dangerSoft },
  // ใบที่เพิ่งเปลี่ยนหลังรีเฟรช — เหลืองแบบเดียวกับตัวอย่างที่เจ้าของงานเลือก
  flashRow: { backgroundColor: colors.warningSoft },
  // กรอบเหลืองอย่างเดียว ไม่ใส่พื้น — พื้นเหลืองเป็นของ Blink ถ้าการ์ดเหลืองอยู่แล้วกระพริบจะไม่เห็น
  // ขอบซ้ายยังเป็นสีสถานะ (borderLeftWidth/Color ของ card ชนะ borderWidth/Color)
  flashCard: { borderWidth: 2, borderColor: colors.warning },
  flashTag: { fontSize: 11.5, fontWeight: "800", color: colors.warningInk },
  /** บรรทัด "เปลี่ยนอะไร" ของใบที่ปุ่มมีอัปเดตพามา */
  markText: {
    alignSelf: "flex-start",
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.warningInk,
    backgroundColor: colors.warningSoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  blink: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.warningSoft,
    borderWidth: 2,
    borderColor: colors.warning,
  },
  tabDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginLeft: 6 },
  sepRow: { paddingHorizontal: spacing.lg, paddingVertical: 6, backgroundColor: colors.tile, borderBottomWidth: 1, borderBottomColor: colors.border },
  sepCard: { paddingHorizontal: 4, paddingTop: 2 },
  sepUrgent: { backgroundColor: colors.dangerSoft },
  sepText: { fontSize: 12, lineHeight: 18, fontWeight: "800", color: colors.textMuted },
  sepTextUrgent: { color: colors.dangerInk },
  rowBar: { position: "absolute", left: 0, top: 10, bottom: 10, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  thSort: { flexDirection: "row", alignItems: "center", gap: 4 },
  waitTag: { alignSelf: "flex-start", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 1, maxWidth: "100%" },
  waitText: { fontSize: 12, lineHeight: 19, fontWeight: "700" },
  waitWho: { fontWeight: "500" },
  btype: { borderRadius: 5, paddingHorizontal: 5 },
  btypeDodo: { backgroundColor: colors.warningSoft },
  btypeCoco: { backgroundColor: colors.primarySoft },
  btypeText: { fontSize: 10, lineHeight: 16, fontWeight: "800" },
  colAction: { width: 64, alignItems: "flex-end" },
  cellWo: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  // wrap — จอแคบให้ป้ายด่วนลงบรรทัดใหม่ แทนที่รหัสใบงานจะถูกหักกลางเป็น "WO-" กับ "00001"
  codeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.sky50,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  viewBtnText: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.primaryInk },
  pageHead: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, flexShrink: 0 },
  pageTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pageTitle: { fontSize: 24, lineHeight: 34, fontWeight: "700", color: colors.text },
  countPill: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 12 },
  countPillText: { fontSize: 13, lineHeight: 24, fontWeight: "800", color: colors.primaryInk },
  pageSub: { fontSize: 13, lineHeight: 20, color: colors.textMuted, marginTop: 2 },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderLeftWidth: 4,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadow.card,
  },
  // ใบที่ปิดแล้วทั้งแถวเป็นเขียว (เจ้าของงานเลือก ต.ค. 69) — กวาดตาแล้วแยกงานจบออกจากงานค้างได้ทันที
  // ป้ายสถานะในแถวนี้จึงต้องเป็นพื้นขาว ไม่งั้นเขียวบนเขียวจนมองไม่เห็น
  cardDone: { backgroundColor: colors.doneSoft },
  trDone: { backgroundColor: colors.doneSoft },
  badgeDone: { borderWidth: 1, borderColor: colors.doneLine },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  code: { fontSize: 14, lineHeight: 21, fontWeight: "800", color: colors.primaryInk },
  badge: { borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: spacing.sm },
  badgeText: { fontSize: 11, lineHeight: 19, fontWeight: "700" },
  title: { fontSize: 15, lineHeight: 24, fontWeight: "700", color: colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  meta: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.textMuted },
  // ป้ายนำหน้าที่ต้องติดกับของข้างหลัง — meta ปกติยืดเต็มแถวจะดันชื่อผู้เปิดไปชิดขวา
  metaFit: { flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
  errorText: { fontSize: 13, lineHeight: 21, color: colors.danger, textAlign: "center" },
  retry: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  retryText: { fontSize: 13, lineHeight: 21, color: colors.text, fontWeight: "600" },
});
