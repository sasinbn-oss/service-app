/**
 * ใบงานหนึ่งใบ — ที่ช่างรับงานและปิดงาน
 *
 * ปิดใบงานไม่ได้ปิดเคสบนกระดาน เพราะเคสปิดตอนเครื่องหายไปจากไฟล์เท่านั้น
 * หน้านี้จึงเตือนตรงๆ ตอนปิดว่าเครื่องยังไม่กลับมา ไม่ใช่ปล่อยให้เข้าใจผิด
 * ว่ากดปิดแล้วจบ
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import PartPicker, { PickedPart } from "../components/PartPicker";
import DateField from "../components/DateField";
import WorkOrderAttachments from "../components/WorkOrderAttachments";
import {
  PickedAttachment,
  pickImageAttachment,
  uploadAttachment,
} from "../utils/attachments";
import { useAuth } from "../context/AuthContext";
import { HomeStackParamList } from "../navigation/types";
import { colors, radius, shadow, spacing } from "../theme";
import { formatDate, formatDateTime, statusTone } from "./WorkOrderListScreen";

type Props = NativeStackScreenProps<HomeStackParamList, "WorkOrderDetail">;

interface LogEntry {
  id: number;
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
  branchOpenedAt: string | null;
  // ว่างเมื่อเป็นสาขาบริษัท — เซิร์ฟเวอร์ตัดออกให้แล้ว หน้าจอไม่ต้องตัดสินใจเอง
  branchWarrantyExpiresAt: string | null;
  branchWarrantyExpired: boolean | null;
  branchIsCompany: boolean;
  machineCode: string | null;
  machineBrand: string | null;
  machineModel: string | null;
  assignedToName: string | null;
  scheduledAt: string | null;
  createdByName: string | null;
  createdAt: string;
  closedAt: string | null;
  closedByName: string | null;
  closeResultLabel: string | null;
  closeNote: string | null;
  symptom: string | null;
  workStatus: string | null;
  workStatusLabel: string | null;
  assignedToId: number | null;
  jobType: string;
  jobTypeLabel: string;
  needsParts: boolean | null;
  stageActor: string | null;
  stageActorLabel: string | null;
  waitingParts: StockPart[];
  outageId: number | null;
  outageStillOpen: boolean | null;
  outageKind: string | null;
  parts: PickedPart[];
  /** เคยแนบรูปใบเบิก (ใบเหลือง) ไว้แล้วหรือยัง — ใช้อะไหล่แล้วต้องมีถึงจะปิดงานได้ */
  hasRequisitionSlip: boolean;
  logs: LogEntry[];
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
}

export default function WorkOrderDetailScreen({ route }: Props) {
  const { id } = route.params;
  const { user } = useAuth();
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [results, setResults] = useState<Option[]>([]);
  const [workStatuses, setWorkStatuses] = useState<Option[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [editingNote, setEditingNote] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  // ขยับเมื่อมีไฟล์ถูกแนบจากที่อื่นนอกการ์ดไฟล์แนบ เพื่อสั่งให้การ์ดโหลดใหม่
  const [filesKey, setFilesKey] = useState(0);

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
        }>("/work-orders/options"),
      ]);
      setOrder(detail.data);
      setResults(options.data.results);
      setWorkStatuses(options.data.workStatuses);
      setStages(options.data.stages);
      setWarehouses(options.data.warehouses);
      setTechnicians(options.data.technicians);
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
    if (o.stageActor === "EMPLOYEE") {
      // ช่างที่ถือใบนี้เท่านั้น ไม่ใช่ช่างทุกคน
      return o.assignedToId === null || o.assignedToId === user.id;
    }
    return o.stageActor === user.role;
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? "ไม่พบใบงานนี้"}</Text>
      </View>
    );
  }

  const tone = statusTone(order.status);
  const done = order.status === "DONE" || order.status === "CANCELLED";
  const mine = order.assignedToName === user?.name;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.headRow}>
          <Text style={styles.code}>{order.code}</Text>
          <View style={{ flex: 1 }} />
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.badgeText, { color: tone.fg }]}>{order.statusLabel}</Text>
          </View>
        </View>

        <Text style={styles.title}>{order.title}</Text>
        {order.detail ? <Text style={styles.detail}>{order.detail}</Text> : null}

        <View style={styles.divider} />

        <Row label="ประเภทงาน" value={order.jobTypeLabel} />
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
              ? [order.machineCode, order.machineBrand, order.machineModel]
                  .filter(Boolean)
                  .join(" · ")
              : "ทั้งสาขา"
          }
        />
        <Row label="ความเร่งด่วน" value={order.priorityLabel} />
        <Row label="ช่างที่รับผิดชอบ" value={order.assignedToName ?? "ยังไม่มอบหมาย"} />
        <Row label="วันที่นัดเข้า" value={order.scheduledAt ? formatDateTime(order.scheduledAt) : "—"} />
        <Row
          label="เปิดโดย"
          value={`${order.createdByName ?? "—"} · ${formatDateTime(order.createdAt)}`}
        />
        <Row label="ที่มา" value={order.source === "OUTAGE" ? "เปิดจากกระดาน" : "เปิดเอง"} />
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

        {order.symptom || order.workStatusLabel || order.waitingParts.length > 0 ? (
          <>
            <Row label="อาการ" value={order.symptom ?? "—"} />
            <Row label="สถานะ" value={order.workStatusLabel ?? "ยังไม่ระบุ"} />
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
      />

      {order.outageId !== null ? (
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
          <Row label="ปิดโดย" value={`${order.closedByName ?? "—"} · ${formatDateTime(order.closedAt)}`} />
          {order.closeNote ? <Text style={styles.detail}>{order.closeNote}</Text> : null}
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

      {/* เส้นทางเดินงาน — เห็นทั้งเส้นว่ามาถึงไหนและเหลืออีกกี่ขั้น */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>ขั้นตอนงาน</Text>
        {stages.map((stage, i) => {
          const currentIndex = stages.findIndex((x) => x.value === order.status);
          // ขั้นเช็คคลังถูกข้ามเมื่อไม่ใช้อะไหล่ ต้องเห็นว่า "ข้าม" ไม่ใช่ "ทำแล้ว"
          const skipped =
            stage.value === "PARTS_REQUESTED" && order.needsParts === false;
          const state = skipped
            ? "skipped"
            : order.status === "CANCELLED"
              ? "future"
              : i < currentIndex || order.status === "DONE"
                ? "done"
                : i === currentIndex
                  ? "now"
                  : "future";
          return (
            <View key={stage.value} style={styles.stageRow}>
              <Ionicons
                name={
                  state === "skipped"
                    ? "remove-circle-outline"
                    : state === "done"
                      ? "checkmark-circle"
                      : state === "now"
                        ? "ellipse"
                        : "ellipse-outline"
                }
                size={16}
                color={
                  state === "done"
                    ? colors.success
                    : state === "now"
                      ? colors.primary
                      : colors.border
                }
              />
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
                <Text style={styles.stageActor}>ข้าม — ไม่ใช้อะไหล่</Text>
              ) : stage.actorLabel && state !== "done" ? (
                <Text style={styles.stageActor}>{stage.actorLabel}</Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {!done ? (
        myTurn(order) ? (
          <>
            <View style={styles.actions}>
              {order.status !== "ASSIGNED" && order.status !== "IN_PROGRESS" ? (
                <TouchableOpacity
                  style={[styles.action, styles.actionPrimary]}
                  onPress={() => setStageOpen(true)}
                  disabled={busy}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-forward-circle" size={18} color="#fff" />
                  <Text style={styles.actionPrimaryText}>
                    {order.status === "NEW"
                      ? "ระบุอะไหล่ที่ต้องใช้"
                      : order.status === "PARTS_REQUESTED"
                        ? "เช็คอะไหล่ในคลัง"
                        : "จ่ายงานให้ช่าง"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <>
                  {order.status === "ASSIGNED" ? (
                    <TouchableOpacity
                      style={[styles.action, styles.actionSecondary]}
                      onPress={() => setStageOpen(true)}
                      disabled={busy}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                      <Text style={styles.actionSecondaryText}>นัดวันเข้างาน</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.action, styles.actionPrimary]}
                    onPress={() => setClosing(true)}
                    disabled={busy}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark-done" size={18} color="#fff" />
                    <Text style={styles.actionPrimaryText}>ปิดงาน</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/*
              ไปถึงหน้างานแล้วจบเคสไม่ได้เพราะต้องเปลี่ยนอะไหล่เพิ่ม
              ช่างเลือกอะไหล่ที่จะเบิกได้เลย เพราะเป็นคนเดียวที่เห็นของจริง
              แล้วใบงานวนกลับไปให้หัวหน้าภาคดูและแอดมินเช็คคลังอีกรอบ
            */}
            {order.status === "ASSIGNED" || order.status === "IN_PROGRESS" ? (
              <TouchableOpacity
                style={styles.rollback}
                onPress={() => setRollbackOpen(true)}
                disabled={busy}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-undo-outline" size={16} color={colors.warning} />
                <Text style={styles.rollbackText}>
                  จบงานไม่ได้ ต้องเบิกอะไหล่เพิ่ม — เลือกอะไหล่แล้วส่งกลับ
                </Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <View style={[styles.card, styles.waitingCard]}>
            <Ionicons name="hourglass-outline" size={16} color={colors.textMuted} />
            <Text style={styles.waitingText}>
              ขั้นนี้รอ{order.stageActorLabel ?? "คนอื่น"}
              {order.stageActor === "EMPLOYEE" && order.assignedToName
                ? ` (${order.assignedToName})`
                : ""}
              {" "}— ยังไม่ถึงคิวของคุณ
            </Text>
          </View>
        )
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

      <RollbackModal
        visible={rollbackOpen}
        order={order}
        onCancel={() => setRollbackOpen(false)}
        onDone={async () => {
          setRollbackOpen(false);
          await load();
        }}
      />

      <StageModal
        visible={stageOpen}
        order={order}
        warehouses={warehouses}
        technicians={technicians}
        onCancel={() => setStageOpen(false)}
        onDone={async () => {
          setStageOpen(false);
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
        onCancel={() => setClosing(false)}
        onDone={async () => {
          setClosing(false);
          // ปิดงานอาจแนบรูปใบเหลืองไปด้วย การ์ดไฟล์แนบต้องโหลดใหม่ถึงจะเห็น
          setFilesKey((k) => k + 1);
          await load();
        }}
      />
    </ScrollView>
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setReason("");
    setParts([]);
    setError(null);
  }, [visible]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/work-orders/${order.id}/reassess-parts`, {
        reason: reason.trim(),
        parts: parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
      });
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.modalTitle}>ขอเบิกอะไหล่เพิ่ม</Text>
            <Text style={styles.linkedText}>
              {order.code} จะกลับไปขั้นแรกให้หัวหน้าภาคดูรายการที่คุณขอ แล้วส่งต่อให้แอดมิน
              เช็คคลัง วันนัดและผลเช็คคลังรอบก่อนจะถูกล้าง แต่ประวัติทั้งหมดยังอยู่ในใบเดิม
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

            {/* ช่างเห็นของจริงว่าเสียตรงไหน จึงเลือกเองได้เลย ไม่ต้องรอให้ใครเดาแทน */}
            <PartPicker parts={parts} onChange={setParts} label="อะไหล่ที่ขอเบิกเพิ่ม" />
            <Text style={styles.linkedText}>
              ยังบอกไม่ได้ว่าต้องใช้ตัวไหน เว้นว่างได้ — หัวหน้าภาคจะเป็นคนระบุแทน
            </Text>

            {error ? <Text style={styles.modalError}>{error}</Text> : null}
          </ScrollView>

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
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.modalSaveText}>ส่งกลับ</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StageModal({
  visible,
  order,
  warehouses,
  technicians,
  onCancel,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  warehouses: string[];
  technicians: Technician[];
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
  const [techId, setTechId] = useState<number | null>(null);
  const [visit, setVisit] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setNeedsParts(order.needsParts);
    setParts(order.waitingParts);
    setChecks(
      Object.fromEntries(
        order.waitingParts.map((p) => [p.sparePartId, { inStock: p.inStock, warehouse: p.warehouse }])
      )
    );
    // เปิดซ้ำให้เห็นเลขที่เคยกรอกไว้ ไม่ใช่ช่องว่างที่ต้องหาเลขมาพิมพ์ใหม่
    setRequisitionNo(order.waitingParts.find((p) => p.requisitionNo)?.requisitionNo ?? "");
    setTechId(order.assignedToId);
    setVisit(order.scheduledAt ? order.scheduledAt.slice(0, 10) : "");
    setNote("");
    setError(null);
  }, [visible, order]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      if (order.status === "NEW") {
        await api.post(`/work-orders/${order.id}/parts`, {
          needsParts,
          parts: needsParts
            ? parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity }))
            : [],
          note: note.trim() || undefined,
        });
      } else if (order.status === "PARTS_REQUESTED") {
        await api.post(`/work-orders/${order.id}/parts-check`, {
          results: order.waitingParts.map((p) => ({
            sparePartId: p.sparePartId,
            inStock: checks[p.sparePartId]?.inStock ?? false,
            warehouse: checks[p.sparePartId]?.warehouse ?? null,
            requisitionNo: requisitionNo.trim() || null,
          })),
          note: note.trim() || undefined,
        });
      } else if (order.status === "PARTS_CHECKED") {
        await api.post(`/work-orders/${order.id}/assign`, {
          assignedToId: techId,
          note: note.trim() || undefined,
        });
      } else {
        await api.post(`/work-orders/${order.id}/schedule`, {
          scheduledAt: visit,
          note: note.trim() || undefined,
        });
      }
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const unchecked =
    order.status === "PARTS_REQUESTED" &&
    order.waitingParts.some((p) => {
      const c = checks[p.sparePartId];
      return c?.inStock === null || c?.inStock === undefined || (c.inStock && !c.warehouse);
    });
  // มีของอย่างน้อยหนึ่งตัว = ต้องเบิก = ต้องมีเลขใบเบิก
  const needsRequisition =
    order.status === "PARTS_REQUESTED" &&
    order.waitingParts.some((p) => checks[p.sparePartId]?.inStock === true) &&
    !requisitionNo.trim();
  const blocked =
    (order.status === "NEW" && (needsParts === null || (needsParts && parts.length === 0))) ||
    (order.status === "PARTS_CHECKED" && techId === null) ||
    (order.status === "ASSIGNED" && !/^\d{4}-\d{2}-\d{2}$/.test(visit)) ||
    unchecked ||
    needsRequisition;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.modalTitle}>
              {order.status === "NEW"
                ? "ระบุอะไหล่ที่ต้องใช้"
                : order.status === "PARTS_REQUESTED"
                  ? "เช็คอะไหล่ในคลัง"
                  : order.status === "PARTS_CHECKED"
                    ? "จ่ายงานให้ช่าง"
                    : "นัดวันเข้างาน"}{" "}
              · {order.code}
            </Text>

            {order.status === "NEW" ? (
              <>
                <Text style={styles.modalLabel}>งานนี้ต้องใช้อะไหล่ไหม</Text>
                <View style={styles.options}>
                  <TouchableOpacity
                    style={[styles.option, needsParts === true && styles.optionOn]}
                    onPress={() => setNeedsParts(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.optionText, needsParts === true && styles.optionTextOn]}>
                      ใช้อะไหล่
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.option, needsParts === false && styles.optionOn]}
                    onPress={() => setNeedsParts(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.optionText, needsParts === false && styles.optionTextOn]}>
                      ไม่ใช้อะไหล่
                    </Text>
                  </TouchableOpacity>
                </View>
                {needsParts === true ? (
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
                    ? "ต้องใส่เลขใบเบิกก่อน ถึงจะบันทึกได้ — ใช้กับอะไหล่ทุกตัวที่ตอบว่ามีของ"
                    : "ใช้กับอะไหล่ทุกตัวที่ตอบว่ามีของ — ของที่หมดยังไม่ได้เบิก จึงไม่ต้องใส่"}
                </Text>

                {order.waitingParts.map((part) => {
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
                      {c.inStock === true ? (
                        <View style={styles.options}>
                          {warehouses.map((w) => (
                            <TouchableOpacity
                              key={w}
                              style={[styles.option, c.warehouse === w && styles.optionOn]}
                              onPress={() =>
                                setChecks((v) => ({
                                  ...v,
                                  [part.sparePartId]: { inStock: true, warehouse: w },
                                }))
                              }
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[styles.optionText, c.warehouse === w && styles.optionTextOn]}
                              >
                                {w}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                <Text style={styles.linkedText}>
                  มีตัวไหนหมด ใบงานจะขึ้นสถานะ “รออะไหล่” ให้เอง
                </Text>
              </View>
            ) : null}

            {order.status === "PARTS_CHECKED" ? (
              <>
                <Text style={styles.modalLabel}>ช่างที่จะรับงาน</Text>
                <View style={styles.options}>
                  {technicians.map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.option, techId === t.id && styles.optionOn]}
                      onPress={() => setTechId(t.id)}
                      activeOpacity={0.7}
                    >
                      {/* ใส่รหัสพนักงานด้วย ชื่อซ้ำกันเกิดขึ้นจริงและกดผิดคนแล้วงานไปผิดมือ */}
                      <Text style={[styles.optionText, techId === t.id && styles.optionTextOn]}>
                        {t.name} · {t.employeeCode}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            {order.status === "ASSIGNED" ? (
              <DateField
                value={visit}
                onChange={setVisit}
                label="วันที่จะเข้างาน"
                emptyHint="ต้องระบุวันก่อนจึงจะส่งต่อได้"
              />
            ) : null}

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
          </ScrollView>

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
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.modalSaveText}>ยืนยัน</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.modalTitle}>อาการ / สถานะ · {order.code}</Text>

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
          </ScrollView>

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
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.modalSaveText}>บันทึก</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CloseModal({
  visible,
  order,
  results,
  onCancel,
  onDone,
}: {
  visible: boolean;
  order: WorkOrder;
  results: Option[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const [result, setResult] = useState("FIXED");
  const [note, setNote] = useState("");
  const [needsParts, setNeedsParts] = useState<boolean | null>(null);
  const [parts, setParts] = useState<PickedPart[]>([]);
  const [slip, setSlip] = useState<PickedAttachment | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ใช้อะไหล่แล้วต้องมีใบเหลือง — เซิร์ฟเวอร์ก็กันไว้อีกชั้น แต่บอกตั้งแต่ตรงนี้
  // ดีกว่าให้กดบันทึกแล้วค่อยเด้งกลับมาว่าขาดรูป
  const slipMissing = parts.length > 0 && !slip && !order.hasRequisitionSlip;

  async function addSlip(
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | null>
  ) {
    setBusy("กำลังเตรียมรูป");
    try {
      const file = await pick(setBusy);
      if (file) setSlip(file);
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
      // ใบเหลืองต้องขึ้นก่อนปิดงาน เพราะเซิร์ฟเวอร์เช็คว่ามีรูปแล้วหรือยัง
      // ตอนรับคำสั่งปิด ส่งทีหลังจะถูกปฏิเสธทั้งที่รูปอยู่ในมือแล้ว
      if (slip) {
        setBusy("กำลังส่งรูปใบเหลือง");
        await uploadAttachment(order.id, slip, "REQUISITION");
      }
      await api.post(`/work-orders/${order.id}/close`, {
        result,
        note: note.trim() || undefined,
        parts: parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
      });
      setNote("");
      setParts([]);
      setSlip(null);
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
      setBusy(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.modalTitle}>ปิดงาน {order.code}</Text>

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
                    <ActivityIndicator color={colors.primary} size="small" />
                    <Text style={styles.linkedText}>{busy}…</Text>
                  </View>
                ) : (
                  <View style={styles.options}>
                    {Platform.OS !== "web" ? (
                      <TouchableOpacity
                        style={styles.option}
                        onPress={() => addSlip((stage) => pickImageAttachment(true, stage))}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.optionText}>ถ่ายใบเหลือง</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.option}
                      onPress={() => addSlip((stage) => pickImageAttachment(false, stage))}
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

            {error ? <Text style={styles.modalError}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancel} onPress={onCancel} activeOpacity={0.7}>
              <Text style={styles.modalCancelText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSave, (saving || slipMissing) && styles.modalSaveOff]}
              onPress={submit}
              disabled={saving || slipMissing}
              activeOpacity={0.8}
            >
              {saving ? (
                <>
                  <ActivityIndicator color="#fff" size="small" />
                  {busy ? <Text style={styles.modalSaveText}>{busy}</Text> : null}
                </>
              ) : (
                <Text style={styles.modalSaveText}>ยืนยันปิดงาน</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
  optionOut: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  optionTextOut: { color: colors.danger },
  stageRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 5 },
  stageLabel: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 21, color: colors.text },
  stageLabelNow: { fontWeight: "700", color: colors.primary },
  stageLabelFuture: { color: colors.textFaint },
  stageLabelSkipped: { textDecorationLine: "line-through" },
  stageActor: { fontSize: 11, lineHeight: 19, color: colors.textFaint },
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
  waitingText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 21, color: colors.textMuted },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  errorText: { fontSize: 13, lineHeight: 21, color: colors.danger, textAlign: "center" },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, ...shadow.card },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  code: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.primary },
  badge: { borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: spacing.sm },
  badgeText: { fontSize: 11, lineHeight: 19, fontWeight: "700" },
  title: { fontSize: 17, lineHeight: 27, fontWeight: "700", color: colors.text, marginTop: spacing.sm },
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
  actions: { flexDirection: "row", gap: spacing.sm },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
  },
  actionPrimary: { backgroundColor: colors.primary },
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

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modal: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "90%",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  modalBody: { padding: spacing.lg },
  modalTitle: { fontSize: 16, lineHeight: 26, fontWeight: "700", color: colors.text },
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
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalCancel: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
  },
  modalCancelText: { fontSize: 14, lineHeight: 22, color: colors.textMuted, fontWeight: "600" },
  modalSave: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
  },
  modalSaveOff: { opacity: 0.6 },
  slipRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  slipThumb: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.background },
  slipBlank: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalSaveText: { color: "#fff", fontSize: 14, lineHeight: 22, fontWeight: "700" },
});
