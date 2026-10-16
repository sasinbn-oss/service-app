/**
 * ประวัติการใช้รถ (แอดมิน) — ทุกคน ทุกคัน กรองรายเดือน ส่งออก Excel
 *
 * จอคอมเป็นตารางตามแบบที่เจ้าของงานส่งมา (ต.ค. 69): เวลาเบิก/คืน · พนักงาน · ทะเบียน · ระยะ · ค่าใช้จ่าย ·
 * สถานะ · แจ้งซ่อม · หลักฐาน — กวาดตาเทียบทีละคอลัมน์ได้ ซึ่งการ์ดทำไม่ได้ จอมือถือแคบเกินตารางจึงยังเป็นการ์ด
 *
 * ดึงทั้งเดือนครั้งเดียวแล้วค้นหา/กรองสถานะในเครื่อง — ได้ "พบ x / y รายการ" ทันทีที่พิมพ์ ไม่ต้องรอเซิร์ฟเวอร์ทุกตัวอักษร
 * (เดือนหนึ่งไม่กี่ร้อยรายการ เซิร์ฟเวอร์ตัดที่ 1,000 อยู่แล้ว)
 *
 * แก้รายการได้ (ช่างกรอกไมล์ผิด) — เซิร์ฟเวอร์คิดระยะใหม่และขยับเลขไมล์ของรถให้
 * ถ้าเป็นรายการล่าสุด ไม่งั้นการเบิกครั้งถัดไปจะถูกตรวจกับเลขที่ผิด
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import TouchableOpacity from "../components/Tap";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useRefreshHandler } from "../components/RefreshButton";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import AppModal from "../components/AppModal";
import Dropdown from "../components/Dropdown";
import EmptyState from "../components/EmptyState";
import Spinner from "../components/Spinner";
import { ForceReturnModal, fs, LogDetailModal } from "../components/FleetUI";
import { useDocked } from "../components/SideMenu";
import { showAlert } from "../utils/alert";
import { openUrl } from "../utils/share";
import { fmtDT, fmtNum, VehicleLogRow } from "../utils/vehicles";
import { colors, headingFont, radius, shadow } from "../theme";

/**
 * ตารางใช้พื้นที่ข้างเมนูเต็มจอ (เจ้าของงานขอ ต.ค. 69) — จอใหญ่เคยเหลือขอบว่างสองข้างเพราะความกว้างถูกจำกัดแล้ววางกลาง
 * หน้าอื่นที่เป็นการ์ด/ฟอร์มยังจำกัดความกว้างไว้ บรรทัดยาวเต็มจอใหญ่อ่านยาก
 */
const FULL_WIDTH = { maxWidth: "100%" as const, paddingHorizontal: 24 };

const MONTH_NAMES = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function thisMonth() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
}
function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y + 543}`;
}
/** ย้อนหลัง 2 ปี — ไกลกว่านั้นใช้ส่งออก Excel */
const MONTH_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const ym = shiftMonth(thisMonth(), -i);
  return { value: ym, label: monthLabel(ym) };
});
const STATUS_OPTIONS = [
  { value: "ALL", label: "ทุกสถานะ" },
  { value: "ONGOING", label: "กำลังใช้งาน" },
  { value: "COMPLETED", label: "คืนแล้ว" },
];

/** "06/10/2026 10:06:42" ตามเวลาไทย — แบบในตัวอย่างของเจ้าของงาน อ่านเวลาเป็นวินาทีได้ตอนเทียบกับรูป */
function fmtStamp(iso: string) {
  const t = new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString();
  return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)} ${t.slice(11, 19)}`;
}
function fmtDuration(ms: number) {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 60) return `${min} นาที`;
  return `${Math.floor(min / 60)} ชม. ${min % 60} นาที`;
}

/** สีวงชื่อตามคน — คนเดิมสีเดิมทุกแถว กวาดตาหาคนเดียวกันได้เร็ว */
const AVATAR_TONES = [colors.roleAdmin, colors.roleTech, colors.primary, colors.warning, colors.roleSupervisor, colors.danger];
function avatarTone(userId: number) {
  return AVATAR_TONES[userId % AVATAR_TONES.length];
}

function Pill({ tone, children }: { tone: "ok" | "info" | "warn" | "bad"; children: React.ReactNode }) {
  const t = {
    ok: [colors.successSoft, colors.successInk, colors.success],
    info: [colors.primarySoft, colors.primaryInk, colors.primary],
    warn: [colors.warningSoft, colors.warningInk, colors.warning],
    bad: [colors.dangerSoft, colors.dangerInk, colors.danger],
  }[tone];
  return (
    <View style={[st.pill, { backgroundColor: t[0] }]}>
      <View style={[st.dot, { backgroundColor: t[2] }]} />
      <Text style={[st.pillText, { color: t[1] }]}>{children}</Text>
    </View>
  );
}

export default function VehicleLogAdminScreen() {
  const [month, setMonth] = useState(thisMonth());
  const [status, setStatus] = useState<"ALL" | "ONGOING" | "COMPLETED">("ALL");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<VehicleLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<VehicleLogRow | null>(null);
  const [edit, setEdit] = useState<VehicleLogRow | null>(null);
  const [returning, setReturning] = useState<VehicleLogRow | null>(null);
  const seq = useRef(0);
  const { width } = useWindowDimensions();
  const { docked, collapsed } = useDocked();
  // พื้นที่จริงหลังหักเมนูข้าง — ตารางต้องการราว 1,000 px ไม่งั้นคอลัมน์บีบจนตัดบรรทัด
  const table = width - (docked ? (collapsed ? 80 : 280) : 0) >= 1000;

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const res = await api.get<VehicleLogRow[]>("/vehicle-logs", { params: monthRange(month) });
      if (my === seq.current) (setRows(res.data), setError(null));
    } catch (e) {
      if (my === seq.current) setError(apiErrorMessage(e));
    }
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useRefreshHandler(load);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter((l) => {
      if (status !== "ALL" && l.status !== status) return false;
      if (!term) return true;
      return [l.userName, l.plateNumber, l.purpose, l.destination, l.note, l.returnNote, l.workOrder?.code, l.workOrder?.branch]
        .some((v) => v && v.toLowerCase().includes(term));
    });
  }, [rows, q, status]);

  async function exportExcel() {
    try {
      const params = { ...monthRange(month), ...(status !== "ALL" ? { status } : {}), ...(q.trim() ? { q: q.trim() } : {}) };
      const res = await api.get<{ path: string; count: number }>("/vehicle-logs/export", { params });
      if (!res.data.count) return showAlert("ไม่มีข้อมูล", "ไม่มีรายการตามตัวกรองนี้");
      await openUrl(resolveImageUrl(res.data.path)!);
    } catch (e) {
      showAlert("ส่งออกไม่สำเร็จ", apiErrorMessage(e));
    }
  }

  function remove(l: VehicleLogRow) {
    showAlert(
      "ลบรายการนี้?",
      `${l.plateNumber} · ${l.userName} · ${fmtDT(l.startedAt)}\nรูปของรายการนี้จะถูกลบด้วย${l.status === "ONGOING" ? " และรถจะกลับเป็นว่าง" : ""}`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ลบ",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/vehicle-logs/${l.id}`);
              load();
            } catch (e) {
              showAlert("ลบไม่สำเร็จ", apiErrorMessage(e));
            }
          },
        },
      ]
    );
  }

  const km = shown.reduce((s, l) => s + (l.distance ?? 0), 0);
  const cost = shown.reduce((s, l) => s + (l.cost ?? 0), 0);

  const header = (
    <View style={{ gap: 14 }}>
      <View style={fs.row}>
        <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
          <Text style={[fs.title, headingFont]}>ประวัติการใช้รถ</Text>
          <Text style={fs.sub}>รายการเบิก-คืนรถทั้งหมด พร้อมเวลา ระยะทาง และรูปหลักฐาน</Text>
        </View>
        <TouchableOpacity style={[fs.btn, fs.btnGhost]} onPress={exportExcel}>
          <Ionicons name="download-outline" size={16} color={colors.navy} />
          <Text style={fs.btnGhostText}>ส่งออก Excel</Text>
        </TouchableOpacity>
      </View>
      <View style={[st.filters, !table && st.filtersCard]}>
        <View style={st.search}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={st.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="ค้นหาชื่อ, ทะเบียน, วัตถุประสงค์..."
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="ค้นหา"
          />
        </View>
        <View style={st.select}>
          <Dropdown value={month} options={MONTH_OPTIONS} onChange={(v) => v && setMonth(v)} accessibilityLabel="เดือน" />
        </View>
        <View style={st.select}>
          <Dropdown
            value={status}
            options={STATUS_OPTIONS}
            onChange={(v) => setStatus((v as typeof status) ?? "ALL")}
            accessibilityLabel="สถานะ"
          />
        </View>
        {rows ? (
          <Text style={st.count}>
            พบ {fmtNum(shown.length)} / {fmtNum(rows.length)} รายการ
          </Text>
        ) : null}
      </View>
    </View>
  );

  const empty =
    rows === null ? (
      error ? <Text style={fs.error}>{error}</Text> : <Spinner color={colors.primary} />
    ) : (
      <EmptyState icon="car-outline" text={rows.length ? "ไม่มีรายการตรงกับที่ค้นหา" : "ไม่มีรายการในเดือนนี้"} />
    );

  const summary =
    rows && shown.length ? (
      <Text style={[fs.muted, { paddingHorizontal: 4 }]}>
        รวม {fmtNum(km)} กม. · ค่าใช้จ่าย ฿{fmtNum(cost)}
        {rows.length >= 1000 ? " · แสดง 1,000 รายการแรก ส่งออก Excel เพื่อดูทั้งหมด" : ""}
      </Text>
    ) : null;

  const actions = (l: VehicleLogRow) => (
    <View style={st.actions}>
      <IconBtn icon="create-outline" label={`แก้ไขรายการ ${l.plateNumber}`} onPress={() => setEdit(l)} />
      {l.status === "ONGOING" ? (
        <IconBtn icon="return-down-back-outline" label={`คืนแทน ${l.plateNumber}`} onPress={() => setReturning(l)} />
      ) : null}
      <IconBtn icon="trash-outline" label={`ลบรายการ ${l.plateNumber}`} danger onPress={() => remove(l)} />
    </View>
  );

  const timeCell = (l: VehicleLogRow) => (
    <View style={{ gap: 4 }}>
      <View style={st.timeRow}>
        <Text style={[st.stamp, st.stampOut]}>เบิก</Text>
        <Text style={st.time}>{fmtStamp(l.startedAt)}</Text>
      </View>
      <View style={st.timeRow}>
        <Text style={[st.stamp, st.stampIn]}>คืน</Text>
        {l.endedAt ? (
          <Text style={st.time}>{fmtStamp(l.endedAt)}</Text>
        ) : (
          <Text style={st.late}>ยังไม่คืน · {fmtDuration(Date.now() - new Date(l.startedAt).getTime())}</Text>
        )}
      </View>
      {l.endedAt ? (
        <Text style={[fs.muted, { marginLeft: 40 }]}>
          ใช้เวลา {fmtDuration(new Date(l.endedAt).getTime() - new Date(l.startedAt).getTime())}
        </Text>
      ) : null}
    </View>
  );

  const person = (l: VehicleLogRow) => (
    <View style={st.person}>
      <View style={[st.avatar, { borderColor: avatarTone(l.userId) }]}>
        <Text style={[st.avatarText, { color: avatarTone(l.userId) }]}>{l.userName.trim().charAt(0) || "?"}</Text>
      </View>
      <Text style={st.name} numberOfLines={1}>
        {l.userName}
      </Text>
    </View>
  );

  const plate = (l: VehicleLogRow) => (
    <View style={st.plate}>
      <Text style={st.plateText}>{l.plateNumber}</Text>
    </View>
  );

  const distance = (l: VehicleLogRow, align: "flex-end" | "flex-start") => (
    <View style={{ alignItems: align, gap: 2 }}>
      {l.distance === null ? (
        <Text style={st.kmDash}>—</Text>
      ) : (
        <Text style={st.km}>
          {fmtNum(l.distance)} <Text style={st.kmUnit}>กม.</Text>
        </Text>
      )}
      <Text style={fs.muted}>
        {l.endMileage === null ? `เริ่ม ${fmtNum(l.startMileage)}` : `${fmtNum(l.startMileage)} → ${fmtNum(l.endMileage)}`}
      </Text>
    </View>
  );

  const statusCell = (l: VehicleLogRow, align: "center" | "flex-start") => (
    <View style={{ alignItems: align, gap: 4 }}>
      {l.status === "ONGOING" ? <Pill tone="info">กำลังใช้งาน</Pill> : <Pill tone="ok">คืนแล้ว</Pill>}
      {l.mileageGap ? (
        <Pill tone="warn">
          ไมล์ {l.mileageGap > 0 ? "+" : ""}
          {fmtNum(l.mileageGap)}
        </Pill>
      ) : null}
      {l.returnedByName ? <Text style={fs.muted}>คืนแทนโดย {l.returnedByName}</Text> : null}
    </View>
  );

  const evidence = (l: VehicleLogRow) => (
    <TouchableOpacity style={st.evidence} onPress={() => setView(l)} accessibilityLabel={`ดูรูปหลักฐาน ${l.plateNumber}`}>
      <Ionicons name="image-outline" size={20} color={colors.primaryInk} />
    </TouchableOpacity>
  );

  const costText = (l: VehicleLogRow) => (
    <Text style={l.cost ? st.cost : st.costZero}>฿{fmtNum(l.cost ?? 0)}</Text>
  );

  if (table) {
    return (
      <>
        <FlatList
          style={fs.container}
          contentContainerStyle={[fs.content, FULL_WIDTH]}
          data={[0]}
          keyExtractor={() => "table"}
          ListHeaderComponent={header}
          renderItem={() => (
            <View style={{ gap: 8 }}>
              <View style={st.table}>
                <View style={[st.tr, st.thead]}>
                  <Text style={[st.th, st.cTime]}>เวลาเบิก / คืน</Text>
                  <Text style={[st.th, st.cPerson]}>พนักงาน</Text>
                  <Text style={[st.th, st.cPlate]}>ทะเบียน</Text>
                  <Text style={[st.th, st.cKm, st.right]}>ระยะ</Text>
                  <Text style={[st.th, st.cCost, st.right]}>ค่าใช้จ่าย</Text>
                  <Text style={[st.th, st.cStatus, st.center]}>สถานะ</Text>
                  <Text style={[st.th, st.cRepair, st.center]}>แจ้งซ่อม</Text>
                  <Text style={[st.th, st.cEvidence, st.center]}>หลักฐาน</Text>
                  <Text style={[st.th, st.cActions, st.center]}>จัดการ</Text>
                </View>
                {shown.length === 0 ? (
                  <View style={{ padding: 24 }}>{empty}</View>
                ) : (
                  shown.map((l, i) => (
                    <View key={l.id} style={[st.tr, i > 0 && st.trLine]}>
                      <View style={st.cTime}>{timeCell(l)}</View>
                      <View style={st.cPerson}>{person(l)}</View>
                      <View style={st.cPlate}>{plate(l)}</View>
                      <View style={st.cKm}>{distance(l, "flex-end")}</View>
                      <View style={[st.cCost, { alignItems: "flex-end" }]}>{costText(l)}</View>
                      <View style={st.cStatus}>{statusCell(l, "center")}</View>
                      <View style={[st.cRepair, { alignItems: "center" }]}>
                        {l.repairNote ? <Pill tone="bad">แจ้งซ่อม</Pill> : <Text style={st.dash}>—</Text>}
                      </View>
                      <View style={[st.cEvidence, { alignItems: "center" }]}>{evidence(l)}</View>
                      <View style={[st.cActions, { alignItems: "center" }]}>{actions(l)}</View>
                    </View>
                  ))
                )}
              </View>
              {summary}
            </View>
          )}
        />
        {modals()}
      </>
    );
  }

  return (
    <>
      <FlatList
        style={fs.container}
        contentContainerStyle={fs.content}
        data={shown}
        keyExtractor={(l) => String(l.id)}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={summary}
        renderItem={({ item: l }) => (
          <View style={[fs.card, { gap: 10 }]}>
            <View style={st.cardTop}>
              {person(l)}
              <View style={{ flex: 1 }} />
              {plate(l)}
            </View>
            {timeCell(l)}
            <View style={st.cardTop}>
              {distance(l, "flex-start")}
              <View style={{ flex: 1 }} />
              {costText(l)}
            </View>
            <View style={[fs.row, { alignItems: "flex-start" }]}>
              {statusCell(l, "flex-start")}
              {l.repairNote ? <Pill tone="bad">แจ้งซ่อม</Pill> : null}
              <View style={{ flex: 1 }} />
              {evidence(l)}
              {actions(l)}
            </View>
          </View>
        )}
      />
      {modals()}
    </>
  );

  function modals() {
    return (
      <>
        <LogDetailModal log={view} onClose={() => setView(null)} />
        <ForceReturnModal
          log={returning}
          onClose={() => setReturning(null)}
          onDone={() => {
            setReturning(null);
            load();
          }}
        />
        <EditLogModal
          log={edit}
          onClose={() => setEdit(null)}
          onDone={() => {
            setEdit(null);
            load();
          }}
        />
      </>
    );
  }
}

function IconBtn({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={st.iconBtn} onPress={onPress} accessibilityLabel={label}>
      <Ionicons name={icon} size={17} color={danger ? colors.dangerInk : colors.textMuted} />
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  filters: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  filtersCard: {},
  search: {
    flexGrow: 1,
    flexBasis: 280,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14.5, lineHeight: 22, color: colors.text, paddingVertical: 11 },
  select: { width: 170, flexGrow: 0 },
  count: { fontSize: 12.5, color: colors.textMuted },
  table: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.card,
  },
  tr: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  trLine: { borderTopWidth: 1, borderTopColor: colors.border },
  thead: { backgroundColor: colors.sky50, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  th: { fontSize: 11.5, fontWeight: "700", color: colors.textMuted },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  cTime: { flex: 2.3 },
  cPerson: { flex: 1.4 },
  cPlate: { flex: 1.1 },
  cKm: { flex: 1.3 },
  cCost: { flex: 0.9 },
  cStatus: { flex: 1.3 },
  cRepair: { flex: 1.1 },
  cEvidence: { flex: 0.8 },
  cActions: { flex: 1 },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stamp: { fontSize: 11, fontWeight: "700", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: "hidden", width: 32, textAlign: "center" },
  stampOut: { backgroundColor: colors.primarySoft, color: colors.primaryInk },
  stampIn: { backgroundColor: colors.successSoft, color: colors.successInk },
  time: { fontSize: 14, color: colors.text, fontVariant: ["tabular-nums"] },
  late: { fontSize: 13.5, fontWeight: "700", color: colors.warningInk },
  person: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  avatarText: { fontSize: 13, fontWeight: "700" },
  name: { fontSize: 14.5, color: colors.text, flexShrink: 1 },
  plate: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: colors.card,
  },
  plateText: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  km: { fontSize: 17, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  kmUnit: { fontSize: 12, fontWeight: "400", color: colors.textMuted },
  kmDash: { fontSize: 17, color: colors.textFaint },
  cost: { fontSize: 15, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  costZero: { fontSize: 14, color: colors.textFaint, fontVariant: ["tabular-nums"] },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontWeight: "700" },
  dash: { color: colors.textFaint, fontSize: 15 },
  evidence: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", gap: 2 },
  iconBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
});

function EditLogModal({ log, onClose, onDone }: { log: VehicleLogRow | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!log) return;
    setF({
      purpose: log.purpose,
      destination: log.destination ?? "",
      note: log.note ?? "",
      returnNote: log.returnNote ?? "",
      startMileage: String(log.startMileage),
      endMileage: log.endMileage === null ? "" : String(log.endMileage),
      cost: log.cost === null ? "" : String(log.cost),
    });
  }, [log?.id]);
  if (!log) return null;

  const num = (s: string | undefined) => (s && s.trim() !== "" ? Number(s.replace(/[,\s]/g, "")) : null);

  async function save() {
    const start = num(f.startMileage);
    const end = num(f.endMileage);
    const cost = num(f.cost);
    if (!f.purpose?.trim()) return showAlert("ข้อมูลไม่ครบ", "ต้องมีว่าไปทำอะไร");
    if (start === null || !Number.isInteger(start) || start < 0) return showAlert("ตรวจเลขไมล์", "เลขไมล์ตอนเบิกไม่ถูกต้อง");
    if (end !== null && (!Number.isInteger(end) || end < start)) return showAlert("ตรวจเลขไมล์", "เลขไมล์ตอนคืนต้องไม่น้อยกว่าตอนเบิก");
    if (cost !== null && (!Number.isInteger(cost) || cost < 0)) return showAlert("ตรวจค่าใช้จ่าย", "ใส่เป็นจำนวนเต็มบาท");
    setBusy(true);
    try {
      await api.patch(`/vehicle-logs/${log!.id}`, {
        purpose: f.purpose.trim(),
        destination: f.destination.trim() || null,
        note: f.note.trim() || null,
        returnNote: f.returnNote.trim() || null,
        startMileage: start,
        endMileage: end,
        cost,
      });
      onDone();
    } catch (e) {
      showAlert("บันทึกไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: string, label: string, numeric?: boolean, disabled?: boolean) => (
    <View key={key}>
      <Text style={fs.label}>{label}</Text>
      <TextInput
        style={[fs.input, disabled && { backgroundColor: colors.tile, color: colors.textFaint }]}
        value={f[key] ?? ""}
        onChangeText={(t) => setF((p) => ({ ...p, [key]: t }))}
        keyboardType={numeric ? "number-pad" : "default"}
        editable={!disabled}
        accessibilityLabel={label}
      />
    </View>
  );

  return (
    <AppModal
      visible
      onClose={onClose}
      busy={busy}
      title={`แก้ไขรายการ ${log.plateNumber}`}
      subtitle={`${log.userName} · เบิก ${fmtDT(log.startedAt)}`}
      footer={
        <View style={fs.modalActions}>
          <TouchableOpacity style={[fs.btn, fs.btnGhost]} onPress={onClose} disabled={busy}>
            <Text style={fs.btnGhostText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity style={fs.btn} onPress={save} disabled={busy}>
            <Text style={fs.btnText}>บันทึก</Text>
          </TouchableOpacity>
        </View>
      }
    >
      {field("purpose", "ไปทำอะไร")}
      {field("destination", "ปลายทาง")}
      {field("startMileage", "เลขไมล์ตอนเบิก", true)}
      {/* รายการที่ยังไม่คืนไม่มีไมล์ตอนคืน — ให้ใช้ "คืนแทน" แทน */}
      {field("endMileage", log.status === "ONGOING" ? "เลขไมล์ตอนคืน (ยังไม่คืน)" : "เลขไมล์ตอนคืน", true, log.status === "ONGOING")}
      {field("cost", "ค่าใช้จ่าย (บาท)", true)}
      {field("note", "หมายเหตุตอนเบิก")}
      {field("returnNote", "หมายเหตุตอนคืน")}
    </AppModal>
  );
}
