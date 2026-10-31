/**
 * ทางเข้าหน้าประวัติเคลมนอกเมนูข้าง (ตามตัวอย่างที่เจ้าของงานตกลง ต.ค. 69)
 *
 * ClaimHistoryCard — การ์ดใน "งานของฉัน" ของ Admin Spare Part: เคลมที่ส่งเดือนนี้ผลเป็นอย่างไร + ป้ายรอตรวจ
 *   + ลิงก์ "ดูประวัติเคลม" (ใบที่รอตรวจอยู่ในกล่องงานด้านล่างอยู่แล้ว การ์ดนี้แค่พาไปดูย้อนหลัง)
 * ClaimHistoryLinks — ลิงก์ในส่วนเคลมของหน้าใบงาน "เคลมเครื่องนี้/สาขานี้ทั้งหมด (n)" เปิดหน้าประวัติกรองให้เลย
 *   ไว้ดูว่าเครื่องเดิมเคลมชิ้นเดิมซ้ำไหม — คนที่ตัดสินเคลมต้องเห็นตอนกำลังตัดสิน ไม่ใช่ไปค้นทีหลัง
 *
 * แยกไฟล์ไว้ ไม่เขียนในหน้าใบงาน/งานของฉันตรง ๆ — สองหน้านั้นใหญ่และแก้บ่อย จุดที่แตะเหลือบรรทัดเดียว
 */
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { canSeeClaimHistory, openClaimHistory } from "../utils/claimHistory";
import { todayBkk } from "./DateField";
import { colors, headingFont, radius, spacing } from "../theme";

type Counts = { ALL: number; PENDING: number; APPROVED: number; REJECTED: number };

export function ClaimHistoryCard({ hidePending = false }: { hidePending?: boolean } = {}) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => {
    // บรรทัดล่าง: ชุดเดียวกับหน้าประวัติตอนเปิดมา (ส่งเดือนนี้ · รอบล่าสุด) — กดเข้าไปแล้วต้องเห็นเลขเดียวกัน
    const today = todayBkk();
    api
      .get<{ counts: Counts }>("/part-claims", { params: { from: `${today.slice(0, 8)}01`, to: today, limit: 1 }, loadingText: false })
      .then((r) => setCounts(r.data.counts))
      .catch(() => undefined);
    /**
     * ป้ายรอตรวจ = ทุกแถวที่ยังรอตรวจ ไม่จำกัดเดือน ตัวเดียวกับป้ายข้างเมนู — เดิมนับจากชุดเดือนนี้
     * ส่งปลายเดือนก่อนแล้วยังไม่ได้ตรวจก็หายจากการ์ด ป้ายสองที่บนจอเดียวกันได้คนละเลข
     */
    /**
     * hidePending: การ์ด "ตรวจเคลม {x} ใบ · {y} ชิ้น" อยู่ติดกันแล้ว (เคลมก้อน 6) — ป้ายรอตรวจนับคิวเดียวกันเป็นชิ้นและไม่นับใบทดสอบ
     * สองตัวเลขติดกันที่ไม่ตรงกัน ผู้ตรวจไม่รู้ว่าเชื่ออันไหน (เหตุผลเดียวกับที่ซ่อนป้ายนี้ในเมนูข้างของผู้ตรวจ)
     */
    if (hidePending) return;
    api
      .get<{ pending: number }>("/part-claims/pending-count", { loadingText: false })
      .then((r) => setPending(r.data.pending))
      .catch(() => undefined);
  }, [hidePending]);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.primaryInk} />
        <Text style={[styles.title, headingFont]}>ประวัติเคลม</Text>
        {pending && !hidePending ? (
          <View style={styles.pending} accessibilityLabel={`ประวัติเคลม รอตรวจ ${pending}`}>
            <Text style={styles.pendingText}>รอตรวจ {pending}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardFoot}>
        <Text style={styles.stat}>
          {/* นับตามวันที่ส่งเคลม ไม่ใช่วันที่ตรวจ — ส่งเดือนก่อนแล้วมาอนุมัติเดือนนี้ไม่อยู่ในบรรทัดนี้ ชื่อจึงต้องบอกว่า "ส่งเคลมเดือนนี้" */}
          {counts ? `ส่งเคลมเดือนนี้ ${counts.ALL} · อนุมัติ ${counts.APPROVED} · ตีกลับ ${counts.REJECTED}` : "ทุกชิ้นที่เคยส่งเคลม ดูย้อนหลังได้ทุกเดือน"}
        </Text>
        <TouchableOpacity style={styles.go} onPress={() => openClaimHistory()} accessibilityLabel="ดูประวัติเคลม">
          <Text style={styles.goText}>ดูประวัติเคลม</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primaryInk} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ClaimHistoryLinks({ branchCode, machineCode }: { branchCode: string; machineCode: string | null }) {
  const { user } = useAuth();
  const allowed = canSeeClaimHistory(user);
  const [n, setN] = useState<{ branch: number; machine: number | null } | null>(null);
  useEffect(() => {
    if (!allowed) return;
    api
      .get<{ branch: number; machine: number | null }>("/part-claims/related", {
        params: { branchCode, machineCode: machineCode ?? undefined },
        loadingText: false,
      })
      .then((r) => setN(r.data))
      .catch(() => undefined);
  }, [allowed, branchCode, machineCode]);
  // ช่าง/Area Team เปิดหน้าประวัติไม่ได้ — ไม่โชว์ลิงก์ที่กดแล้วเจอ 403
  if (!allowed) return null;
  const count = (x: number | null | undefined) => (x == null ? "" : ` (${x})`);
  return (
    <View style={styles.links}>
      {machineCode ? (
        <TouchableOpacity onPress={() => openClaimHistory({ branchCode, machineCode })} accessibilityLabel="เคลมเครื่องนี้ทั้งหมด">
          <Text style={styles.link}>เคลมเครื่องนี้ทั้งหมด{count(n?.machine)}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity onPress={() => openClaimHistory({ branchCode })} accessibilityLabel="เคลมสาขานี้ทั้งหมด">
        <Text style={styles.link}>เคลมสาขานี้ทั้งหมด{count(n?.branch)}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.text },
  pending: { borderRadius: 999, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningSoft, paddingHorizontal: 10, paddingVertical: 2 },
  pendingText: { fontSize: 13, fontWeight: "700", color: colors.warningInk },
  cardFoot: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  stat: { fontSize: 14, lineHeight: 20, color: colors.body, flexShrink: 1 },
  go: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 },
  goText: { fontSize: 14, fontWeight: "700", color: colors.primaryInk },
  links: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.lg, rowGap: 4 },
  link: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.primaryInk, paddingVertical: 8 },
});
