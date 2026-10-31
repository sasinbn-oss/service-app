/**
 * แถบตัดสินเคลมล่างจอของหน้าตรวจเคลม — อยู่นอกส่วนที่เลื่อน (วางต่อท้าย ScrollView ในกรอบใบงาน) เห็นตลอดไม่ว่าเลื่อนไปดูหลักฐานไหน
 *
 * เดิมปุ่มอนุมัติ/ตีกลับอยู่ท้ายการ์ดเคลมซึ่งอยู่กลางใบงานยาว ๆ ผู้ตรวจดูวิดีโอเสร็จต้องเลื่อนหาปุ่ม
 * และบนจอ 1366×768 ปุ่มหลุดจอทุกครั้ง (ตัวอย่างที่เจ้าของงานเลือก: แถบสูงไม่เกิน 56 บนจอกว้าง)
 * ไม่ใช่ position: fixed — กรอบใบงานเป็นหน้าต่างที่ย่อ/ขยายได้ แถบต้องติดกรอบ ไม่ใช่ติดหน้าจอ
 * ก้อนนี้ยังตัดสินทั้งใบ (อนุมัติทุกชิ้น / ตีกลับทุกชิ้นพร้อมเหตุผลเดียว) — ตัดสินทีละชิ้นมาในก้อนถัดไป
 * ดูในฐานะผู้ใช้อื่น: เซิร์ฟเวอร์ไม่รับคำสั่งอยู่แล้ว แถบจึงเหลือแค่บอกว่าดูได้อย่างเดียว ไม่มีปุ่มให้กดแล้วล้ม
 */
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../Tap";
import Spinner from "../Spinner";
import { api, apiErrorMessage } from "../../api/client";
import { colors, radius, spacing } from "../../theme";

export default function DecisionBar({
  workOrderId,
  readOnly,
  onDone,
}: {
  workOrderId: number;
  /** ดูในฐานะผู้ใช้อื่น — ไม่มีปุ่มตัดสิน */
  readOnly: boolean;
  onDone: () => Promise<void> | void;
}) {
  // วัดความกว้างของแถบเอง (กรอบใบงานย่อได้ ไม่เท่าจอเสมอ) · ก่อนวัดได้ใช้ความกว้างจอไปก่อน
  const { width: screenW } = useWindowDimensions();
  const [width, setWidth] = useState(screenW);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // จอกว้างพอวางช่องเหตุผลกับสองปุ่มในแถวเดียว (สูง 56) · มือถือแยกสองแถว ช่องเหตุผลเต็มความกว้าง
  const oneRow = width >= 720;

  if (readOnly) {
    return (
      <View style={[styles.bar, styles.readOnly]} accessibilityLabel="แถบตัดสินเคลม">
        <Ionicons name="eye-outline" size={18} color={colors.textMuted} />
        <Text style={styles.readOnlyText}>ดูได้อย่างเดียว แก้ไขไม่ได้</Text>
      </View>
    );
  }

  async function review(approve: boolean) {
    if (!approve && !reason.trim()) {
      setError("ตีกลับต้องบอกเหตุผล — ช่างเห็นข้อความนี้บนใบงาน และต้องรู้ว่าต้องแก้อะไร");
      return;
    }
    setSaving(approve ? "approve" : "reject");
    setError(null);
    try {
      await api.post(`/work-orders/${workOrderId}/claim-review`, { approve, reason: reason.trim() || undefined });
      setReason("");
      await onDone();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <View style={styles.bar} accessibilityLabel="แถบตัดสินเคลม" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={[styles.row, !oneRow && styles.rowStack]}>
        <TextInput
          style={[styles.input, oneRow ? { flex: 1 } : styles.inputStack, error && !reason.trim() ? styles.inputMissing : null]}
          value={reason}
          onChangeText={(v) => {
            setReason(v);
            if (error) setError(null);
          }}
          placeholder="เหตุผลที่ตีกลับ (ต้องกรอกเมื่อตีกลับ) เช่น วิดีโอ Error code ไม่เห็นรหัสบนหน้าจอ"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="เหตุผลที่ตีกลับเคลม"
        />
        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.btn, styles.reject, saving !== null && styles.off]}
            onPress={() => review(false)}
            disabled={saving !== null}
            activeOpacity={0.8}
          >
            {saving === "reject" ? <Spinner color={colors.dangerInk} size="small" /> : null}
            <Text style={styles.rejectText}>ตีกลับให้ช่างแก้</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.approve, saving !== null && styles.off]}
            onPress={() => review(true)}
            disabled={saving !== null}
            activeOpacity={0.8}
          >
            {saving === "approve" ? <Spinner color="#fff" size="small" /> : null}
            <Text style={styles.approveText}>อนุมัติเคลม · ปิดงาน</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.card,
    borderTopWidth: 2,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    // 5 + ปุ่ม 44 + 5 + เส้นบน 2 = 56 พอดีเพดานของแบบ (จอ 1366×768 เหลือที่ให้หลักฐานมากที่สุด)
    paddingVertical: 5,
    gap: 4,
  },
  readOnly: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  readOnlyText: { fontSize: 14, fontWeight: "700", color: colors.textMuted },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowStack: { flexDirection: "column", alignItems: "stretch" },
  input: {
    minWidth: 0,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.sky50,
  },
  inputStack: { width: "100%" },
  inputMissing: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  buttons: { flexDirection: "row", gap: spacing.sm },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    flexGrow: 1,
  },
  reject: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.dangerInk },
  rejectText: { fontSize: 15, fontWeight: "700", color: colors.dangerInk },
  approve: { backgroundColor: colors.navyFill },
  approveText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  off: { opacity: 0.6 },
  error: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.dangerInk },
});
