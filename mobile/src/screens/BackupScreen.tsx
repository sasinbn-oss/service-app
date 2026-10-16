/**
 * สำรองข้อมูล (Super Admin เท่านั้น)
 *
 * กดสำรองเองก่อนทำอะไรเสี่ยง (นำเข้าไฟล์ใหญ่ แก้ข้อมูลทีละมาก ๆ) และโหลดไฟล์ย้อนหลัง · เก็บไว้ 30 วัน
 * ไม่มีรอบอัตโนมัติแล้ว (เจ้าของงานสั่งเอาออก 15 ต.ค. 69 — รอบ 17:00 ทำเซิร์ฟเวอร์ล่ม)
 *
 * ไฟล์มีสองแบบตามที่เจ้าของงานขอ: Excel ไว้เปิดดู · ไฟล์กู้คืน (.json.gz) ไว้ใส่กลับทั้งระบบ
 * (backend/scripts/restore-backup.js) — ไม่มีเลข Fleet Card ทั้งสองไฟล์
 */
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useRefreshHandler } from "../components/RefreshButton";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { api, apiErrorMessage } from "../api/client";
import { feedback } from "../components/Feedback";
import { showAlert } from "../utils/alert";
import { useAuth } from "../context/AuthContext";
import { BackupRow, downloadBackupFiles } from "../utils/backup";
import { colors, headingFont, radius, shadow, spacing } from "../theme";

interface Data {
  keepDays: number;
  rows: BackupRow[];
}

function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BackupScreen() {
  const { user } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    return api
      .get<Data>("/backups")
      .then((res) => {
        setData(res.data);
        setError(null);
      })
      .catch((e) => setError(apiErrorMessage(e)));
  }, []);
  // ไม่ส่ง load ให้ useFocusEffect ตรง ๆ — มันคืน promise ซึ่ง useFocusEffect จะเข้าใจว่าเป็นตัวเก็บกวาด
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );
  useRefreshHandler(load);

  const backupNow = async () => {
    setBusy(true);
    try {
      const res = await api.post<BackupRow>("/backups", undefined, { loadingText: "กำลังสำรองข้อมูล..." });
      feedback.toast("success", `สำรองแล้ว — ${res.data.baseName}`);
      load();
      await downloadBackupFiles(res.data.id, ["excel", "data"]);
    } catch (e) {
      showAlert("สำรองข้อมูลไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // เมนูซ่อนไว้แล้ว แต่ลิงก์ตรงหรือ "ดูในฐานะ" ยังพามาได้ — บอกตรง ๆ ดีกว่าหน้าที่โหลดไม่ขึ้น
  if (!user?.superAdmin || user.viewAs) {
    return (
      <View style={styles.center}>
        <EmptyState icon="lock-closed-outline" title="เฉพาะ Super Admin เท่านั้น" text="ไฟล์สำรองคือข้อมูลทั้งบริษัท จึงเปิดให้เฉพาะผู้ดูแลระบบสูงสุด" />
      </View>
    );
  }
  if (!data) {
    return (
      <View style={styles.center}>
        {error ? <EmptyState icon="cloud-offline-outline" title="โหลดรายการไฟล์สำรองไม่ได้" text={error} /> : <Spinner color={colors.primary} />}
      </View>
    );
  }

  const latest = data.rows[0];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.row}>
        <Text style={[styles.title, headingFont]}>สำรองข้อมูล</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Super Admin</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[styles.btn, busy && { opacity: 0.6 }]}
          onPress={backupNow}
          disabled={busy}
          accessibilityLabel="สำรองและดาวน์โหลดตอนนี้"
        >
          <View style={styles.row}>
            <Ionicons name="cloud-download" size={16} color="#fff" />
            <Text style={styles.btnText}>สำรองและดาวน์โหลดตอนนี้</Text>
          </View>
        </TouchableOpacity>
      </View>
      <Text style={styles.muted}>
        กดสำรองก่อนทำอะไรเสี่ยง (นำเข้าไฟล์ใหญ่ แก้ข้อมูลทีละมาก ๆ) · ไฟล์เก็บไว้บนเซิร์ฟเวอร์ {data.keepDays} วัน ·
        ไม่มีเลข Fleet Card ในไฟล์
      </Text>

      <View style={styles.kpis}>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>สำรองล่าสุด</Text>
          <Text style={styles.kpiValue}>{latest ? fmtWhen(latest.createdAt) : "ยังไม่มี"}</Text>
          {latest ? (
            <Text style={styles.muted}>
              {latest.kind === "AUTO" ? "อัตโนมัติ" : `กดเองโดย ${latest.byName ?? "—"}`}
            </Text>
          ) : null}
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>เก็บย้อนหลัง</Text>
          <Text style={styles.kpiValue}>
            {data.keepDays} วัน · {data.rows.length} ชุด
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>ไฟล์ที่เก็บไว้</Text>
        {data.rows.length === 0 ? (
          <Text style={styles.muted}>ยังไม่มีไฟล์สำรอง — กดปุ่มด้านบนเพื่อสำรองครั้งแรก</Text>
        ) : (
          data.rows.map((b) => (
            <View key={b.id} style={styles.item}>
              <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
                <Text style={styles.itemName}>{b.baseName}</Text>
                <Text style={styles.muted}>
                  {b.kind === "AUTO" ? "อัตโนมัติ" : `กดเอง · ${b.byName ?? "—"}`}
                  {b.summary
                    ? ` · ใบงาน ${b.summary.workOrders.toLocaleString("th-TH")} · สาขา ${b.summary.branches.toLocaleString(
                        "th-TH"
                      )} · ผู้ใช้ ${b.summary.users.toLocaleString("th-TH")}`
                    : ""}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost]}
                onPress={() => downloadBackupFiles(b.id, ["excel"])}
                accessibilityLabel={`ดาวน์โหลด Excel ${b.baseName}`}
              >
                <View style={styles.row}>
                  <Ionicons name="grid-outline" size={15} color={colors.navy} />
                  <Text style={styles.btnGhostText}>Excel · {fmtSize(b.excelBytes)}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost]}
                onPress={() => downloadBackupFiles(b.id, ["data"])}
                accessibilityLabel={`ดาวน์โหลดไฟล์กู้คืน ${b.baseName}`}
              >
                <View style={styles.row}>
                  <Ionicons name="archive-outline" size={15} color={colors.navy} />
                  <Text style={styles.btnGhostText}>ไฟล์กู้คืน · {fmtSize(b.dataBytes)}</Text>
                </View>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={styles.warnBox}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.warningInk} />
        <Text style={styles.warnText}>
          ไฟล์สำรองคือข้อมูลทั้งบริษัท (ไฟล์กู้คืนมีรหัสผ่านที่เข้ารหัสแล้วของทุกคน เพื่อให้ล็อกอินได้หลังกู้คืน)
          เก็บไว้ในที่ปลอดภัย อย่าส่งต่อทางแชท · รูปหน้างานไม่อยู่ในไฟล์ — อยู่ในที่เก็บไฟล์ตามเดิม
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48, maxWidth: 1100, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  title: { fontSize: 22, lineHeight: 32, fontWeight: "700", color: colors.text },
  section: { fontSize: 15, fontWeight: "700", color: colors.text },
  pill: { backgroundColor: colors.roleAdminSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  pillText: { fontSize: 13, fontWeight: "700", color: colors.roleAdmin },
  muted: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  kpi: {
    flexGrow: 1,
    flexBasis: 220,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
  },
  kpiLabel: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  kpiValue: { fontSize: 17, fontWeight: "700", color: colors.text },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
    ...shadow.card,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemName: { fontSize: 14, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  btn: { backgroundColor: colors.navy, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 9 },
  btnText: { color: "#fff", fontSize: 13.5, fontWeight: "700" },
  btnGhost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  btnGhostText: { color: colors.navy, fontSize: 13, fontWeight: "600" },
  warnBox: { flexDirection: "row", gap: 8, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 10 },
  warnText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.warningInk },
});
