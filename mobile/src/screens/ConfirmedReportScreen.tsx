/**
 * สรุปเคสที่คอนเฟิร์มลูกค้าแล้ว — คัดลอกส่งกลุ่มไลน์ช่าง (เจ้าของงานขอ ต.ค. 69)
 *
 * คำถามของหน้านี้: "วันนี้คอนเฟิร์มเคสไหนไปแล้วบ้าง" (ค่าเริ่มต้น) · สลับเป็น "คิวนัดเข้างานวันไหน" ได้
 * ข้อมูลจาก GET /work-orders/reports/confirmed — กฎว่าเคสไหนนับอยู่ฝั่งเซิร์ฟเวอร์ที่เดียว
 * ข้อความไลน์สร้างที่ utils/customerMessage.ts ที่เดียวกับข้อความแจ้งลูกค้า
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import TouchableOpacity from "../components/Tap";
import Spinner from "../components/Spinner";
import DateField, { thaiDateLong, todayBkk } from "../components/DateField";
import Dropdown from "../components/Dropdown";
import { CopyButton } from "../components/CustomerMessage";
import { useRefreshHandler } from "../components/RefreshButton";
import { api, apiErrorMessage } from "../api/client";
import { allDispatch, byTeam, ConfirmedRow, dayLabel, teamDispatch } from "../utils/customerMessage";
import { formatDateTime } from "./WorkOrderListScreen";
import { colors, radius, shadow, spacing } from "../theme";

type By = "confirm" | "visit";

export default function ConfirmedReportScreen() {
  const [by, setBy] = useState<By>("confirm");
  const [date, setDate] = useState(todayBkk());
  const [team, setTeam] = useState<string | null>(null);
  // แยกตามคนคอนเฟิร์ม (เจ้าของงานขอ ต.ค. 69) — แอดมินแต่ละคนคัดลอกเฉพาะเคสที่ตัวเองคุยกับร้าน
  const [confirmer, setConfirmer] = useState<string | null>(null);
  const [rows, setRows] = useState<ConfirmedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ rows: ConfirmedRow[] }>("/work-orders/reports/confirmed", { params: { date, by } });
      if (n === seq.current) setRows(res.data.rows);
    } catch (e) {
      if (n === seq.current) setError(apiErrorMessage(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [date, by]);
  useEffect(() => {
    void load();
  }, [load]);
  useRefreshHandler(load);

  const NO_NAME = "ไม่ทราบชื่อ";
  const confirmers = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of rows ?? []) count.set(r.confirmedBy ?? NO_NAME, (count.get(r.confirmedBy ?? NO_NAME) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "th"));
  }, [rows]);
  const picked = useMemo(
    () => (rows ?? []).filter((r) => !confirmer || (r.confirmedBy ?? NO_NAME) === confirmer),
    [rows, confirmer]
  );
  const teams = useMemo(() => byTeam(picked), [picked]);
  // ทีม/คนที่เลือกไว้ไม่มีในวันใหม่ — กลับไปทั้งหมด ไม่งั้นหน้าว่างทั้งที่มีงาน
  useEffect(() => {
    if (team && !teams.some((t) => t.team === team)) setTeam(null);
  }, [teams, team]);
  useEffect(() => {
    if (confirmer && !confirmers.some(([n]) => n === confirmer)) setConfirmer(null);
  }, [confirmers, confirmer]);
  const shown = team ? teams.filter((t) => t.team === team) : teams;
  const shownRows = shown.flatMap((t) => t.rows);
  const inspect = shownRows.filter((r) => r.kind === "INSPECT").length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sub}>เคสที่แอดมินคอนเฟิร์มลูกค้าแล้ว แยกตามทีม — กดคัดลอกแล้ววางในกลุ่มไลน์ช่างได้เลย</Text>

      <View style={styles.filters}>
        <View style={styles.seg}>
          {(
            [
              ["confirm", "คอนเฟิร์มวันที่"],
              ["visit", "นัดเข้างานวันที่"],
            ] as const
          ).map(([v, label]) => (
            <TouchableOpacity
              key={v}
              style={[styles.segBtn, by === v && styles.segOn]}
              onPress={() => setBy(v)}
              accessibilityLabel={label}
            >
              <Text style={[styles.segText, by === v && styles.segTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.field}>
          <DateField value={date} onChange={setDate} label={by === "confirm" ? "วันที่คอนเฟิร์ม" : "วันที่นัดเข้างาน"} required />
        </View>
        {/* ปุ่มต่อคน ไม่ใช่ dropdown — แอดมินมีไม่กี่คน กดทีเดียวเห็นของตัวเอง พร้อมจำนวนเคส */}
        {confirmers.length ? (
          <View style={styles.chips}>
            <Text style={styles.label}>ผู้คอนเฟิร์ม</Text>
            {[["", (rows ?? []).length] as [string, number], ...confirmers].map(([n, c]) => {
              const on = (confirmer ?? "") === n;
              return (
                <TouchableOpacity
                  key={n || "all"}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setConfirmer(n || null)}
                  accessibilityLabel={`ผู้คอนเฟิร์ม ${n || "ทุกคน"}`}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {n || "ทุกคน"} <Text style={styles.chipCount}>{c}</Text>
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
        <View style={[styles.field, { minWidth: 200 }]}>
          <Text style={styles.label}>ทีม</Text>
          <Dropdown
            value={team}
            options={teams.map((t) => ({ value: t.team, label: t.team, hint: `${t.rows.length} งาน` }))}
            onChange={setTeam}
            placeholder="ทุกทีม"
            clearable
            accessibilityLabel="เลือกทีม"
          />
        </View>
      </View>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : loading && !rows ? (
        <Spinner color={colors.primary} />
      ) : shownRows.length === 0 ? (
        <Text style={styles.empty}>
          {by === "confirm" ? `ยังไม่มีเคสที่คอนเฟิร์ม${date === todayBkk() ? "วันนี้" : `วันที่ ${thaiDateLong(date)}`}` : "ไม่มีคิวนัดเข้างานวันนี้"}
        </Text>
      ) : (
        <>
          <View style={styles.statsRow}>
            <Text style={styles.stat}>
              <Text style={styles.statNum}>{shownRows.length}</Text> เคส · <Text style={styles.statNum}>{shown.length}</Text> ทีม
              {inspect ? ` · ตรวจหน้างาน ${inspect}` : ""}
            </Text>
            <View style={{ flex: 1 }} />
            <CopyButton text={allDispatch(shownRows)} label={shown.length > 1 ? "คัดลอกทุกทีม" : `คัดลอกให้${shown[0].team}`} />
          </View>

          {shown.map((t) => (
            <View key={t.team} style={styles.team}>
              <View style={styles.teamHead}>
                <Text style={styles.teamName}>👷 {t.team}</Text>
                <Text style={styles.teamCount}>{t.rows.length} งาน</Text>
                <View style={{ flex: 1 }} />
                {shown.length > 1 ? <CopyButton text={teamDispatch(t.team, t.rows)} label={`คัดลอกให้${t.team}`} /> : null}
              </View>
              {t.rows.map((r) => (
                <View key={r.id} style={styles.job}>
                  <View style={styles.when}>
                    <Text style={styles.whenDay}>{dayLabel(r.scheduledAt)}</Text>
                    <Text style={styles.whenTime}>{r.scheduledTime ? `${r.scheduledTime} น.` : "ไม่ระบุเวลา"}</Text>
                  </View>
                  <View style={styles.what}>
                    <View style={styles.codeRow}>
                      <Text style={styles.code}>{r.code}</Text>
                      <Text style={[styles.kind, r.kind === "INSPECT" ? styles.kindInspect : styles.kindRepair]}>
                        {r.kind === "INSPECT" ? "ตรวจหน้างาน" : "ซ่อม"}
                      </Text>
                    </View>
                    <Text style={styles.line}>
                      {r.branchCode} {r.branchName}
                      {r.machineCode ? ` · ${r.machineCode}` : ""}
                    </Text>
                    <Text style={styles.meta}>
                      {[r.symptom, r.contactPhone ? `☎ ${r.contactPhone}` : null].filter(Boolean).join(" · ")}
                    </Text>
                    {r.confirmedBy ? (
                      <Text style={styles.meta}>
                        คอนเฟิร์มโดย <Text style={styles.by}>{r.confirmedBy}</Text>
                        {r.confirmedAt ? ` · ${formatDateTime(r.confirmedAt)}` : ""}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ))}

          {/* กว้างประมาณจอมือถือ — เห็นการตัดบรรทัดใกล้กับที่ช่างเห็นในไลน์ */}
          <Text style={styles.label}>ตัวอย่างข้อความในไลน์ (ทีละทีม)</Text>
          {shown.map((t) => (
            <Text key={t.team} style={styles.bubble} selectable>
              {teamDispatch(t.team, t.rows)}
            </Text>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  sub: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  filters: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, ...shadow.card },
  seg: { flexDirection: "row", flexWrap: "wrap", gap: 6, flexBasis: "100%" },
  segBtn: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 6 },
  segOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  segText: { fontSize: 13, color: colors.text },
  segTextOn: { color: colors.primaryInk, fontWeight: "700" },
  field: { flexGrow: 1, flexBasis: 180, gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, flexBasis: "100%" },
  chip: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  chipOn: { borderColor: colors.roleAdmin, backgroundColor: colors.roleAdminSoft },
  chipText: { fontSize: 13, color: colors.text },
  chipTextOn: { color: colors.roleAdmin, fontWeight: "700" },
  chipCount: { fontWeight: "800" },
  label: { fontSize: 13, fontWeight: "700", color: colors.text },
  error: { color: colors.danger, fontSize: 14 },
  empty: { color: colors.textMuted, fontSize: 14, paddingVertical: spacing.lg, textAlign: "center" },
  statsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  stat: { fontSize: 13, color: colors.textMuted },
  statNum: { fontSize: 15, fontWeight: "800", color: colors.text },
  team: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  teamHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm, backgroundColor: colors.roleTechSoft, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  teamName: { fontSize: 14, fontWeight: "800", color: colors.roleTech },
  teamCount: { fontSize: 12.5, color: colors.textMuted },
  job: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  when: { width: 92 },
  whenDay: { fontSize: 13, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  whenTime: { fontSize: 12, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  what: { flex: 1, minWidth: 0, gap: 1 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  code: { fontSize: 14, fontWeight: "800", color: colors.navy },
  kind: { fontSize: 11, fontWeight: "700", borderRadius: 6, paddingHorizontal: 6, overflow: "hidden" },
  kindRepair: { backgroundColor: colors.primarySoft, color: colors.primaryInk },
  kindInspect: { backgroundColor: colors.roleAdminSoft, color: colors.roleAdmin },
  line: { fontSize: 13, color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
  by: { color: colors.roleAdmin, fontWeight: "700" },
  bubble: {
    maxWidth: 380,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successLine,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 13,
    lineHeight: 22,
    color: colors.text,
  },
});
