/**
 * ลิงก์ในใบงาน ส่วน "สาขาและเครื่อง" → รายงานอะไหล่ที่ไปแต่ละสาขา กรองสาขา/เครื่องให้เลย (ตามตัวอย่างที่ตกลง ต.ค. 69)
 * ไว้ดูก่อนสั่งของว่าเครื่อง/สาขานี้เพิ่งเปลี่ยนชิ้นเดิมไปเมื่อไร — คนสั่งของต้องเห็นตอนกำลังดูใบงาน ไม่ใช่ไปค้นทีหลัง
 *
 * เฉพาะแอดมินและ Super Admin (utils/branchParts) — คนอื่นไม่เห็นลิงก์และไม่ยิงคำขอที่ได้ 403
 * ตัวเลขบอกสองแบบแยกกัน ("ใช้แล้ว 3 · เบิกแล้ว 1 ชิ้น") ไม่รวมเป็นเลขเดียว ตามคำตอบเจ้าของงาน
 * แยกไฟล์ไว้ ไม่เขียนในหน้าใบงานตรง ๆ — หน้านั้นใหญ่และแก้บ่อย จุดที่แตะเหลือบรรทัดเดียว
 */
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import TouchableOpacity from "./Tap";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { canSeeBranchParts, openBranchParts, piecesText } from "../utils/branchParts";
import { colors, spacing } from "../theme";

type C = { used: number; issued: number };

export function BranchPartsLinks({
  branchCode,
  branchName,
  machineId,
  machineCode,
  reloadKey,
}: {
  branchCode: string;
  branchName: string;
  machineId: number | null | undefined;
  machineCode: string | null;
  /** เปลี่ยนเมื่อใบเปลี่ยนขั้น (เช่นเพิ่งปิดงาน) — ตัวเลขต้องตามทัน ไม่ค้างของก่อนปิด */
  reloadKey?: string;
}) {
  const { user } = useAuth();
  const allowed = canSeeBranchParts(user);
  const [n, setN] = useState<{ branch: C; machine: C | null } | null>(null);
  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    api
      .get<{ branch: C; machine: C | null }>("/work-orders/reports/branch-parts/counts", {
        params: { branchCode, machineId: machineId ?? undefined },
        loadingText: false,
      })
      .then((r) => alive && setN(r.data))
      // ตัวเลขเป็นของแถม — โหลดไม่ได้ก็ยังกดลิงก์ได้ (หน้ารายงานบอกเหตุผลเองถ้ามีปัญหาจริง)
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [allowed, branchCode, machineId, reloadKey]);
  if (!allowed) return null;
  return (
    <View style={styles.box}>
      <View style={styles.links}>
        <TouchableOpacity onPress={() => openBranchParts({ branchCode, branchName })} accessibilityLabel="อะไหล่ที่สาขานี้ได้ไปแล้ว">
          <Text style={styles.link}>อะไหล่ที่สาขานี้ได้ไปแล้ว{n ? ` (${piecesText(n.branch)})` : ""}</Text>
        </TouchableOpacity>
        {/* ใบทั้งสาขา (ไม่ระบุเครื่อง) ไม่มี "เครื่องนี้" ให้กรอง */}
        {machineId ? (
          <TouchableOpacity
            onPress={() => openBranchParts({ branchCode, branchName, machineId, machineCode: machineCode ?? undefined })}
            accessibilityLabel="อะไหล่เฉพาะเครื่องนี้"
          >
            <Text style={styles.link}>เฉพาะเครื่องนี้{n?.machine ? ` (${piecesText(n.machine)})` : ""}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.hint}>ไว้ดูก่อนสั่งของว่าเครื่อง/สาขานี้เพิ่งเปลี่ยนชิ้นเดิมไปเมื่อไร</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 2, marginTop: spacing.xs },
  links: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.lg, rowGap: 0 },
  // สูง 44 ตามตัวอย่าง — กดด้วยนิ้วบนมือถือได้ไม่พลาด
  link: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.primaryInk, paddingVertical: 12 },
  hint: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
});
