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
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import PartPicker, { PickedPart } from "../components/PartPicker";
import DateField from "../components/DateField";
import { useAuth } from "../context/AuthContext";
import { HomeStackParamList } from "../navigation/types";
import { colors, radius, shadow, spacing } from "../theme";
import { formatDateTime, statusTone } from "./WorkOrderListScreen";

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
  machineCode: string | null;
  machineBrand: string | null;
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
  stageActor: string | null;
  stageActorLabel: string | null;
  waitingParts: StockPart[];
  outageId: number | null;
  outageStillOpen: boolean | null;
  outageKind: string | null;
  parts: PickedPart[];
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

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

        <Row label="สาขา" value={`${order.branchCode} · ${order.branchName}`} />
        {order.region ? <Row label="ภาค" value={order.region} /> : null}
        <Row
          label="เครื่อง"
          value={
            order.machineCode
              ? `${order.machineCode}${order.machineBrand ? ` · ${order.machineBrand}` : ""}`
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
                  <View key={part.sparePartId} style={styles.partRow}>
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
          const state =
            order.status === "CANCELLED"
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
                  state === "done"
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
                  state === "future" && styles.stageLabelFuture,
                ]}
              >
                {stage.label}
              </Text>
              {stage.actorLabel && state !== "done" ? (
                <Text style={styles.stageActor}>{stage.actorLabel}</Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {!done ? (
        myTurn(order) ? (
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
  const [parts, setParts] = useState<PickedPart[]>([]);
  const [checks, setChecks] = useState<Record<number, { inStock: boolean | null; warehouse: string | null }>>({});
  const [techId, setTechId] = useState<number | null>(null);
  const [visit, setVisit] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setParts(order.waitingParts);
    setChecks(
      Object.fromEntries(
        order.waitingParts.map((p) => [p.sparePartId, { inStock: p.inStock, warehouse: p.warehouse }])
      )
    );
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
          parts: parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
          note: note.trim() || undefined,
        });
      } else if (order.status === "PARTS_REQUESTED") {
        await api.post(`/work-orders/${order.id}/parts-check`, {
          results: order.waitingParts.map((p) => ({
            sparePartId: p.sparePartId,
            inStock: checks[p.sparePartId]?.inStock ?? false,
            warehouse: checks[p.sparePartId]?.warehouse ?? null,
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
  const blocked =
    (order.status === "NEW" && parts.length === 0) ||
    (order.status === "PARTS_CHECKED" && techId === null) ||
    (order.status === "ASSIGNED" && !/^\d{4}-\d{2}-\d{2}$/.test(visit)) ||
    unchecked;

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
              <PartPicker parts={parts} onChange={setParts} label="อะไหล่ที่ต้องใช้" />
            ) : null}

            {order.status === "PARTS_REQUESTED" ? (
              <View style={styles.checkList}>
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
                      <Text style={[styles.optionText, techId === t.id && styles.optionTextOn]}>
                        {t.name}
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
  const [parts, setParts] = useState<PickedPart[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/work-orders/${order.id}/close`, {
        result,
        note: note.trim() || undefined,
        parts: parts.map((p) => ({ sparePartId: p.sparePartId, quantity: p.quantity })),
      });
      setNote("");
      setParts([]);
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
              style={[styles.modalSave, saving && styles.modalSaveOff]}
              onPress={submit}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
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
  stageActor: { fontSize: 11, lineHeight: 19, color: colors.textFaint },
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
  modalSaveText: { color: "#fff", fontSize: 14, lineHeight: 22, fontWeight: "700" },
});
