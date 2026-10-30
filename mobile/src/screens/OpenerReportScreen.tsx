/**
 * รายงานใบงานแยกตามผู้เปิด (เจ้าของงานขอ ต.ค. 69)
 *
 * เลือกช่วงวันที่เปิดใบงาน + ผู้เปิด (ทุกคน/คนเดียว) → เห็นสรุปบนจอ → ดาวน์โหลด Excel
 * ไฟล์มีชีตสรุป · รายการทั้งหมด · 1 ชีตต่อคน (ตามตัวอย่างที่เจ้าของงานเลือก) — สร้างที่เซิร์ฟเวอร์
 * (GET /work-orders/reports/by-opener) แอดมินเห็นทุกภาค หัวหน้าภาคเห็นเฉพาะภาค/ทีมที่ดูแล
 *
 * รายชื่อผู้เปิดให้เลือก = คนที่เปิดใบงานในช่วงวันที่นั้นจริง (จากสรุปตอน "ทุกคน")
 * ไม่ใช่ผู้ใช้ทั้งระบบ — เลือกคนที่ไม่ได้เปิดสักใบแล้วได้ไฟล์ว่างไม่มีประโยชน์
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import DateField, { todayBkk } from "../components/DateField";
import Dropdown from "../components/Dropdown";
import { useRefreshHandler } from "../components/RefreshButton";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { openUrl } from "../utils/share";
import { showAlert } from "../utils/alert";
import { regionsOf, regionsText } from "../utils/regions";
import { colors, radius, shadow, spacing } from "../theme";

interface Summary {
  userId: number | null;
  name: string;
  employeeCode: string | null;
  role: string;
  /** ภาคของผู้เปิด (ภาคแรก) — regions คือทุกภาค เซิร์ฟเวอร์รุ่นเก่าส่งแค่ region */
  region: string | null;
  regions?: string[];
  total: number;
  fromBoard: number;
  manual: number;
  urgent: number;
  open: number;
  done: number;
  cancelled: number;
}
interface Report {
  from: string;
  to: string;
  scopeLabel: string;
  openerLabel: string;
  summary: Summary[];
  totals: Omit<Summary, "userId" | "name" | "employeeCode" | "role" | "region" | "regions">;
  count: number;
}

const COLS: { key: keyof Report["totals"]; label: string }[] = [
  { key: "total", label: "เปิด" },
  { key: "fromBoard", label: "จากกระดาน" },
  { key: "manual", label: "เปิดเอง" },
  { key: "urgent", label: "ด่วน" },
  { key: "open", label: "ยังค้าง" },
  { key: "done", label: "ปิดแล้ว" },
  { key: "cancelled", label: "ยกเลิก" },
];

/** วันแรกของเดือนนี้ตามเวลาไทย — คำถามที่พบบ่อยที่สุดคือ "เดือนนี้ใครเปิดไปเท่าไร" */
const monthStart = () => `${todayBkk().slice(0, 8)}01`;

export default function OpenerReportScreen() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayBkk());
  const [opener, setOpener] = useState<string | null>(null);
  const [all, setAll] = useState<Report | null>(null);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const seq = useRef(0);

  const params = useCallback(
    (format: "json" | "xlsx", who: string | null) => ({ from, to, format, ...(who ? { opener: who } : {}) }),
    [from, to]
  );

  const load = useCallback(async () => {
    if (from > to) {
      setError("วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด");
      return;
    }
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      // สรุปทุกคนไว้ทำรายชื่อให้เลือก + สรุปของคนที่เลือก (ถ้าเลือก) — สองคำขอเล็ก ๆ ไม่ใช่ไฟล์
      const everyone = await api.get<Report>("/work-orders/reports/by-opener", { params: params("json", null) });
      const chosen = opener
        ? (await api.get<Report>("/work-orders/reports/by-opener", { params: params("json", opener) })).data
        : everyone.data;
      if (n !== seq.current) return;
      setAll(everyone.data);
      setData(chosen);
    } catch (e) {
      if (n === seq.current) setError(apiErrorMessage(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [from, to, opener, params]);

  useEffect(() => {
    void load();
  }, [load]);
  useRefreshHandler(load);

  async function download() {
    setDownloading(true);
    try {
      const res = await api.get<{ filename: string; path: string }>("/work-orders/reports/by-opener", {
        params: params("xlsx", opener),
        loadingText: "กำลังสร้างไฟล์ Excel...",
      });
      const url = resolveImageUrl(res.data.path);
      if (url) await openUrl(url);
    } catch (e) {
      showAlert("ดาวน์โหลดไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  const people = (all?.summary ?? []).map((s) => ({
    value: s.userId === null ? "system" : String(s.userId),
    label: s.name,
    hint: `${s.role}${s.employeeCode ? ` · ${s.employeeCode}` : ""} · ${s.total} ใบ`,
  }));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sub}>เลือกช่วงวันที่เปิดใบงาน แล้วดาวน์โหลดเป็น Excel — มีชีตสรุป รายการทั้งหมด และแยกชีตต่อคน</Text>

      <View style={styles.filters}>
        <View style={styles.field}>
          <DateField label="เปิดตั้งแต่วันที่" value={from} onChange={setFrom} required />
        </View>
        <View style={styles.field}>
          <DateField label="ถึงวันที่" value={to} onChange={setTo} required />
        </View>
        <View style={[styles.field, { minWidth: 240 }]}>
          <Text style={styles.label}>ผู้เปิด</Text>
          <Dropdown
            value={opener}
            options={people}
            onChange={setOpener}
            placeholder="ทุกคน"
            clearable
            accessibilityLabel="เลือกผู้เปิด"
          />
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.download, (downloading || !data || !!error) && { opacity: 0.6 }]}
          onPress={download}
          disabled={downloading || !data || !!error}
          accessibilityLabel="ดาวน์โหลด Excel"
        >
          {downloading ? <Spinner size="small" color="#fff" /> : <Ionicons name="download-outline" size={17} color="#fff" />}
          <Text style={styles.downloadText}>ดาวน์โหลด Excel</Text>
        </TouchableOpacity>
        {data ? (
          <Text style={styles.meta}>
            {data.count} ใบ · {data.scopeLabel}
          </Text>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : loading && !data ? (
        <Spinner color={colors.primary} />
      ) : data && data.summary.length === 0 ? (
        <Text style={styles.empty}>ไม่มีใบงานที่เปิดในช่วงวันที่นี้</Text>
      ) : data ? (
        <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
          <View style={styles.table}>
            <View style={[styles.tr, styles.thead]}>
              <Text style={[styles.th, styles.cName]}>ผู้เปิด</Text>
              {COLS.map((c) => (
                <Text key={c.key} style={[styles.th, styles.cNum]}>
                  {c.label}
                </Text>
              ))}
            </View>
            {data.summary.map((s) => (
              <View key={s.userId ?? "system"} style={styles.tr}>
                <View style={styles.cName}>
                  <Text style={styles.name}>{s.name}</Text>
                  <Text style={styles.role}>
                    {s.role}
                    {s.employeeCode ? ` · ${s.employeeCode}` : ""}
                    {regionsOf(s).length ? ` · ${regionsText(regionsOf(s))}` : ""}
                  </Text>
                </View>
                {COLS.map((c) => (
                  <Text key={c.key} style={[styles.td, styles.cNum, c.key === "total" && styles.strong]}>
                    {s[c.key]}
                  </Text>
                ))}
              </View>
            ))}
            {data.summary.length > 1 ? (
              <View style={[styles.tr, styles.total]}>
                <Text style={[styles.name, styles.cName]}>รวม</Text>
                {COLS.map((c) => (
                  <Text key={c.key} style={[styles.td, styles.cNum, styles.strong]}>
                    {data.totals[c.key]}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        </ScrollView>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  sub: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  // ชิดล่าง — ป้ายของ DateField กับป้าย "ผู้เปิด" สูงไม่เท่ากัน ชิดล่างแล้วช่องกรอกอยู่แนวเดียวกัน
  filters: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, ...shadow.card },
  field: { flexGrow: 1, flexBasis: 180, gap: 6 },
  label: { fontSize: 13, fontWeight: "700", color: colors.text },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.md },
  download: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.navyFill, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  downloadText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  meta: { fontSize: 13, color: colors.textMuted },
  error: { color: colors.danger, fontSize: 14 },
  empty: { color: colors.textMuted, fontSize: 14, paddingVertical: spacing.lg, textAlign: "center" },
  table: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", minWidth: 640 },
  tr: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 },
  thead: { backgroundColor: colors.sky50 },
  total: { backgroundColor: colors.tile, borderBottomWidth: 0 },
  th: { fontSize: 12, fontWeight: "800", color: colors.textMuted },
  td: { fontSize: 14, color: colors.text, fontVariant: ["tabular-nums"] },
  strong: { fontWeight: "800" },
  cName: { flex: 2.4, minWidth: 180 },
  cNum: { flex: 1, minWidth: 64, textAlign: "right" },
  name: { fontSize: 14, fontWeight: "700", color: colors.text },
  role: { fontSize: 12, color: colors.textMuted },
});
