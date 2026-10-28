import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import AppModal from "./AppModal";
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

const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

/**
 * ป๊อปอัพยืนยันก่อนเปิดใบงานซ้ำ — ขึ้นตอนกดบันทึก ถ้าสาขามีใบที่ยังไม่ปิด (เจ้าของงานขอ ต.ค. 69 ตามตัวอย่างที่ตกลง)
 *
 * กล่องเหลืองในฟอร์มเตือนอยู่แล้วแต่คนกรอกเลื่อนผ่านได้ — ป๊อปอัพนี้คือจุดที่ต้องหยุดดูก่อนจริง ๆ
 * เครื่องเดียวกันมีใบค้าง = สัญญาณซ้ำที่ชัดที่สุด: เตือนแดงและต้องติ๊กยืนยันก่อนปุ่มเปิดจะกดได้
 * คนละเครื่อง = เตือนเหลือง กดยืนยันได้เลย (สาขาเดียวกันมีหลายเรื่องจริงได้)
 */
export function DuplicateConfirmModal({
  orders,
  sameCodes,
  branch,
  opening,
  onBack,
  onConfirm,
  onView,
}: {
  orders: OpenOrder[];
  /** รหัสเครื่องที่กำลังจะเปิดใบ — ใบค้างของเครื่องพวกนี้ = เครื่องเดียวกัน */
  sameCodes: string[];
  branch: string;
  /** สรุปใบใหม่ที่กำลังจะเปิด เช่น "เครื่อง W5 · เครื่องซักเสียงดัง" */
  opening: string;
  onBack: () => void;
  onConfirm: () => void;
  onView: (id: number) => void;
}) {
  const [ticked, setTicked] = useState(false);
  const isSame = (o: OpenOrder) => !!o.machineCode && sameCodes.includes(o.machineCode);
  const same = orders.filter(isSame);
  const sorted = [...same, ...orders.filter((o) => !isSame(o))];
  const strong = same.length > 0;
  const sameMachines = [...new Set(same.map((o) => o.machineCode!))];
  const ready = !strong || ticked;
  // ช่างเห็นแบบย่อ เปิดดูใบเดิมไม่ได้ — คำแนะนำต้องชี้ไปที่คนที่ดูได้ ไม่ใช่ปุ่มที่ไม่มี
  const limited = orders.every((o) => o.limited);
  const sameStory = limited ? "ถ้าเป็นเรื่องเดิม ให้ถามหัวหน้าภาคก่อนเปิดซ้ำ" : "ถ้าเป็นเรื่องเดิม ให้กด “เปิดดูใบเดิม” แล้วเพิ่มรายละเอียด/รูปในใบเดิมแทน";
  return (
    <AppModal
      visible
      onClose={onBack}
      title={strong ? `เครื่อง ${sameMachines.join(", ")} มีใบงานค้างอยู่แล้ว` : `สาขานี้มีใบงานเปิดค้างอยู่ ${orders.length} ใบ`}
      subtitle={`${branch} · ${strong ? `สาขานี้มีใบเปิดค้าง ${orders.length} ใบ — เช็คก่อนว่าไม่ใช่เรื่องเดิม` : "คนละเครื่องกับที่กำลังเปิด — ดูก่อนว่าไม่ใช่เรื่องเดียวกัน"}`}
      footer={
        <View style={styles.dupFoot}>
          <TouchableOpacity style={[styles.dupBtn, styles.dupGhost]} onPress={onBack} accessibilityLabel="กลับไปแก้">
            <Text style={styles.dupGhostText}>กลับไปแก้</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dupBtn, { backgroundColor: ready ? colors.navyFill : colors.border }]}
            onPress={() => (ready ? onConfirm() : undefined)}
            disabled={!ready}
            accessibilityLabel="ยืนยัน เปิดใบใหม่"
            accessibilityState={{ disabled: !ready }}
          >
            <Text style={[styles.dupBtnText, !ready && { color: colors.textFaint }]}>ยืนยัน เปิดใบใหม่</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: spacing.md }} accessibilityLabel={strong ? "ป๊อปอัพเครื่องเดียวกันมีใบค้าง" : "ป๊อปอัพสาขามีใบค้าง"}>
        <Text style={styles.dupLabel}>ใบที่ค้างอยู่ของสาขานี้</Text>
        {sorted.map((o) => {
          const hit = isSame(o);
          return (
            <View key={o.code} style={[styles.dupOld, hit && styles.dupOldSame]}>
              <View style={styles.top}>
                <Text style={styles.dupCode}>{o.code}</Text>
                <Text style={[styles.dupChip, hit ? styles.dupChipSame : styles.dupChipOther]}>
                  {hit ? `เครื่องเดียวกัน · ${o.machineCode}` : o.machineCode ? `เครื่อง ${o.machineCode}` : "ทั้งสาขา"}
                </Text>
                <Text style={styles.stage}>{o.statusLabel}</Text>
                {o.id !== null ? (
                  <TouchableOpacity style={styles.dupView} onPress={() => onView(o.id!)} accessibilityLabel={`เปิดดูใบเดิม ${o.code}`}>
                    <Text style={styles.dupViewText}>เปิดดูใบเดิม</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {o.symptom ? <Text style={styles.symptom}>{o.symptom}</Text> : null}
              <Text style={styles.meta}>
                เปิด {formatDate(o.createdAt)} · ค้าง {daysAgo(o.createdAt)} วัน{o.createdBy ? ` · โดย ${o.createdBy}` : ""}
              </Text>
            </View>
          );
        })}
        <View style={styles.dupNew}>
          <Text style={styles.dupNewTitle}>ใบใหม่ที่กำลังจะเปิด</Text>
          <Text style={styles.symptom}>{opening}</Text>
        </View>
        {strong ? (
          <TouchableOpacity
            style={[styles.dupCheck, ticked && styles.dupCheckOn]}
            onPress={() => setTicked((v) => !v)}
            accessibilityLabel="ยืนยันว่าเป็นอาการใหม่"
            accessibilityState={{ checked: ticked }}
          >
            <View style={[styles.dupBox, ticked && styles.dupBoxOn]}>{ticked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dupCheckText}>ยืนยันว่าเป็นอาการใหม่ ไม่ใช่เรื่องเดิมของ {same.map((o) => o.code).join(", ")}</Text>
              <Text style={styles.meta}>{sameStory}</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <Text style={styles.dupHint}>เป็นอาการใหม่/เครื่องอื่น = เปิดต่อได้เลย · {sameStory}</Text>
        )}
      </View>
    </AppModal>
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
  dupLabel: { fontSize: 12.5, fontWeight: "700", color: colors.textMuted },
  dupOld: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, gap: 3 },
  dupOldSame: { borderWidth: 1.5, borderColor: colors.dangerLine, backgroundColor: colors.dangerSoft },
  dupCode: { fontSize: 15, fontWeight: "700", color: colors.primaryInk },
  dupChip: { fontSize: 11.5, fontWeight: "700", borderRadius: 999, paddingHorizontal: 8, lineHeight: 20, overflow: "hidden" },
  dupChipSame: { color: "#fff", backgroundColor: colors.danger },
  dupChipOther: { color: colors.body, backgroundColor: colors.rowAlt },
  dupView: { marginLeft: "auto", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.card },
  dupViewText: { fontSize: 12.5, fontWeight: "700", color: colors.navy },
  dupNew: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.textFaint, borderRadius: radius.md, padding: 10, gap: 2 },
  dupNewTitle: { fontSize: 13, fontWeight: "700", color: colors.text },
  dupCheck: { flexDirection: "row", gap: 10, alignItems: "flex-start", borderWidth: 1.5, borderColor: colors.dangerLine, borderRadius: radius.md, padding: 12, backgroundColor: colors.card },
  dupCheckOn: { borderColor: colors.navy, backgroundColor: colors.sky50 },
  dupBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.textFaint, alignItems: "center", justifyContent: "center", marginTop: 1 },
  dupBoxOn: { backgroundColor: colors.navyFill, borderColor: colors.navyFill },
  dupCheckText: { fontSize: 13.5, lineHeight: 20, fontWeight: "700", color: colors.text },
  dupHint: { fontSize: 12.5, lineHeight: 19, color: colors.warningInk, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: radius.md, padding: 10, overflow: "hidden" },
  dupFoot: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  dupBtn: { borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 11 },
  dupBtnText: { color: "#fff", fontWeight: "700" },
  dupGhost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  dupGhostText: { color: colors.navy, fontWeight: "700" },
});
