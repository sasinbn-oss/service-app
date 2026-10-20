import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { colors, radius, spacing } from "../theme";
import { formatDate } from "../screens/WorkOrderListScreen";

/** ใบงานที่ยังเปิดค้างของสาขา — จาก GET /branches/:code/open-work-orders */
export interface OpenOrder {
  /** null = แบบย่อ (ช่าง) — เปิดจากกล่องเตือนไม่ได้ */
  id: number | null;
  code: string;
  status: string;
  statusLabel: string;
  machineCode: string | null;
  symptom: string | null;
  team: string | null;
  createdAt: string;
  createdBy: string | null;
  /** ช่างเห็นแบบย่อ: เลขใบงาน เครื่อง ขั้น — ไม่เห็นอาการ/ชื่อคน/ทีมของสาขาอื่น (เจ้าของงานเลือก ต.ค. 69) */
  limited?: boolean;
}

/** โชว์แค่นี้ก่อน — สาขาที่มีใบค้างสิบใบ กล่องเตือนยาวกว่าฟอร์มทั้งหน้า */
const FIRST = 3;

/**
 * กล่องเตือน "สาขานี้มีใบงานเปิดค้างอยู่" ในฟอร์มเปิดใบงาน (เจ้าของงานเลือกแบบเตือน ไม่บล็อก ต.ค. 69)
 *
 * เตือนอย่างเดียว ยังเปิดใบใหม่ได้ — สาขาเดียวกันมีหลายเรื่องจริงได้ คนเปิดรู้ดีกว่าระบบว่าเรื่องเดิมหรือไม่
 * ไม่มีใบค้าง = ไม่วาดอะไรเลย ฟอร์มหน้าตาเหมือนเดิม
 */
export default function OpenOrdersWarning({
  orders,
  onOpen,
}: {
  orders: OpenOrder[];
  onOpen: (id: number) => void;
}) {
  const [all, setAll] = useState(false);
  if (orders.length === 0) return null;
  const shown = all ? orders : orders.slice(0, FIRST);
  const limited = orders.every((o) => o.limited);
  return (
    <View style={styles.box} accessibilityLabel="เตือนใบงานเปิดค้าง">
      <View style={styles.head}>
        <Ionicons name="warning-outline" size={16} color={colors.warningInk} />
        <Text style={styles.title}>
          สาขานี้มีใบงานเปิดค้างอยู่ {orders.length} ใบ — {limited ? "ถามหัวหน้าภาคก่อนเปิดซ้ำ" : "ดูก่อนว่าไม่ใช่เรื่องเดียวกัน"}
        </Text>
      </View>
      {shown.map((o) => (
        <TouchableOpacity
          key={o.code}
          style={styles.order}
          onPress={() => (o.id !== null ? onOpen(o.id) : undefined)}
          disabled={o.id === null}
          activeOpacity={0.7}
        >
          <View style={styles.top}>
            <Text style={styles.code}>{o.code}</Text>
            <Text style={styles.machine}>{o.machineCode ?? "ทั้งสาขา"}</Text>
            <Text style={styles.stage}>{o.statusLabel}</Text>
            {o.id !== null ? <Text style={styles.open}>เปิดดู ›</Text> : null}
          </View>
          {o.symptom ? (
            <Text style={styles.symptom} numberOfLines={2}>
              {o.symptom}
            </Text>
          ) : null}
          {o.limited ? null : (
            <Text style={styles.meta}>
              เปิด {formatDate(o.createdAt)}
              {o.createdBy ? ` โดย ${o.createdBy}` : ""}
              {o.team ? ` · ${o.team}` : ""}
            </Text>
          )}
        </TouchableOpacity>
      ))}
      {orders.length > FIRST ? (
        <TouchableOpacity onPress={() => setAll((v) => !v)} activeOpacity={0.7}>
          <Text style={styles.more}>{all ? "ย่อ" : `ดูทั้งหมด (${orders.length})`}</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.hint}>
        {limited
          ? "เป็นอาการใหม่/เครื่องอื่น = เปิดต่อได้เลย · ไม่แน่ใจ = ถามหัวหน้าภาคก่อน"
          : "เป็นอาการใหม่/เครื่องอื่น = เปิดต่อได้เลย · เรื่องเดิม = เข้าไปเพิ่มรายละเอียดในใบเดิมแทน"}
      </Text>
    </View>
  );
}

/** บรรทัดแดงใต้เครื่องที่มีใบค้างอยู่ — เครื่องเดียวกันคือสัญญาณซ้ำที่ชัดที่สุด */
export function MachineOpenWarning({ order }: { order: OpenOrder | undefined }) {
  if (!order) return null;
  return (
    <View style={styles.machineWarn}>
      <Ionicons name="alert-circle" size={15} color={colors.dangerInk} />
      <Text style={styles.machineWarnText}>
        เครื่อง {order.machineCode} มีใบงานค้าง {order.code} ({order.statusLabel})
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 8,
  },
  head: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  title: { flex: 1, color: colors.warningInk, fontWeight: "700", fontSize: 13.5 },
  order: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 2,
  },
  top: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  code: { fontWeight: "700", color: colors.text },
  machine: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 6,
  },
  stage: { fontSize: 11.5, fontWeight: "700", color: colors.primary },
  open: { marginLeft: "auto", fontSize: 12, fontWeight: "700", color: colors.primary },
  symptom: { fontSize: 12.5, color: colors.text },
  meta: { fontSize: 11.5, color: colors.textFaint },
  more: { fontSize: 13, fontWeight: "700", color: colors.primary },
  hint: { fontSize: 12, color: colors.warningInk },
  machineWarn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: -4,
    marginBottom: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  machineWarnText: { flex: 1, fontSize: 12.5, fontWeight: "700", color: colors.dangerInk },
});
