/**
 * ภาพรวมรถ (แอดมิน) — วันนี้รถวิ่งไปเท่าไร คันไหนยังไม่คืน ใครกรอกไมล์ไม่ต่อเนื่อง
 *
 * กม. ของวันนับจากรายการที่ "คืนแล้ว" ในวันนั้น (แบบ FLEET) — รายการที่ยังไม่คืนยังไม่รู้ระยะ
 */
import React, { useCallback, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import TouchableOpacity from "../components/Tap";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import Spinner, { WasherIcon } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { thaiDate } from "../components/DateField";
import { ForceReturnModal, fs, Kpi, LogDetailModal, Notice, Tag, vehicleTone } from "../components/FleetUI";
import { duration, fmtDT, fmtNum, VehicleLogRow } from "../utils/vehicles";
import { colors, headingFont } from "../theme";

interface Dashboard {
  date: string;
  stats: { km: number; trips: number; inUse: number; available: number; maintenance: number };
  perVehicle: {
    id: number;
    plateNumber: string;
    name: string | null;
    status: string;
    statusLabel: string;
    currentMileage: number;
    km: number;
    trips: number;
    activeBy: string | null;
    activeSince: string | null;
  }[];
  last7: { date: string; km: number }[];
  activeLogs: VehicleLogRow[];
  warnings: VehicleLogRow[];
}

function todayBkk() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}
function shiftDay(ymd: string, days: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

export default function FleetDashboardScreen() {
  const [date, setDate] = useState(todayBkk());
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<VehicleLogRow | null>(null);
  const [returning, setReturning] = useState<VehicleLogRow | null>(null);
  // กดเปลี่ยนวันรัว ๆ คำตอบของวันก่อนหน้าที่มาช้าต้องไม่ทับวันที่เลือกล่าสุด
  const seq = useRef(0);

  const load = useCallback(async (d: string) => {
    const my = ++seq.current;
    try {
      const res = await api.get<Dashboard>("/vehicle-logs/dashboard", { params: { date: d } });
      if (my === seq.current) (setData(res.data), setError(null));
    } catch (e) {
      if (my === seq.current) setError(apiErrorMessage(e));
    }
  }, []);

  // ขึ้นกับ date ด้วย — เปลี่ยนวันแล้วโหลดใหม่ และกลับมาที่หน้านี้ก็โหลดวันเดิมใหม่
  useFocusEffect(
    useCallback(() => {
      load(date);
    }, [date, load])
  );

  if (!data) {
    return (
      <View style={fs.center}>
        {error ? <Text style={fs.error}>{error}</Text> : <Spinner color={colors.primary} />}
      </View>
    );
  }

  const switching = data.date !== date && !error;
  const total = data.stats.inUse + data.stats.available + data.stats.maintenance;
  const maxKm = Math.max(1, ...data.perVehicle.map((v) => v.km));
  const max7 = Math.max(1, ...data.last7.map((d) => d.km));
  const today = todayBkk();

  return (
    <>
      <ScrollView style={fs.container} contentContainerStyle={fs.content}>
        <View style={fs.row}>
          <Text style={[fs.title, headingFont]}>ภาพรวมรถ</Text>
          <Tag tone={date === today ? "ok" : "mute"}>{date === today ? `วันนี้ · ${thaiDate(date)}` : thaiDate(date)}</Tag>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={[fs.btn, fs.btnGhost, fs.small]} onPress={() => setDate(shiftDay(date, -1))} accessibilityLabel="วันก่อนหน้า">
            <Ionicons name="chevron-back" size={16} color={colors.navy} />
          </TouchableOpacity>
          {date !== today ? (
            <TouchableOpacity style={[fs.btn, fs.btnGhost, fs.small]} onPress={() => setDate(today)}>
              <Text style={fs.btnGhostText}>วันนี้</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[fs.btn, fs.btnGhost, fs.small, date >= today && { opacity: 0.4 }]}
            onPress={() => date < today && setDate(shiftDay(date, 1))}
            disabled={date >= today}
            accessibilityLabel="วันถัดไป"
          >
            <Ionicons name="chevron-forward" size={16} color={colors.navy} />
          </TouchableOpacity>
        </View>

        <View style={{ gap: 12, opacity: switching ? 0.45 : 1 }}>
          <View style={fs.kpis}>
            <Kpi label="ระยะทางรวมของวัน" value={fmtNum(data.stats.km)} unit="กม." hint="นับจากรายการที่คืนแล้ว" />
            <Kpi label="รถกำลังออกวิ่ง" value={data.stats.inUse} unit={`/ ${total} คัน`} tone="navy" />
            <Kpi label="เที่ยวที่เบิกวันนี้" value={data.stats.trips} unit="ครั้ง" />
            <Kpi label="ไมล์ไม่ต่อเนื่อง" value={data.warnings.length} unit="รายการ" tone={data.warnings.length ? "warn" : undefined} />
          </View>

          {data.warnings.length ? (
            <Notice tone="warn" icon="warning-outline">
              <Text style={fs.bold}>เลขไมล์ไม่ต่อเนื่อง {data.warnings.length} รายการ</Text>
              {data.warnings.map((w) => (
                <TouchableOpacity key={w.id} onPress={() => setView(w)}>
                  <Text style={fs.body}>
                    {w.plateNumber} โดย {w.userName} ({w.mileageGap > 0 ? "+" : ""}
                    {fmtNum(w.mileageGap)} กม. จากที่คืนครั้งก่อน) <Text style={{ color: colors.primaryInk }}>ดูรายการ ›</Text>
                  </Text>
                </TouchableOpacity>
              ))}
            </Notice>
          ) : null}

          <View style={fs.card}>
            <View style={fs.row}>
              <Text style={fs.section}>รถที่ยังไม่คืน</Text>
              <Tag tone={data.activeLogs.length ? "info" : "mute"}>{data.activeLogs.length} คัน</Tag>
            </View>
            {data.activeLogs.length === 0 ? <Text style={fs.muted}>คืนครบทุกคันแล้ว</Text> : null}
            {data.activeLogs.map((l) => (
              <View key={l.id} style={[fs.item, fs.row]}>
                <Ionicons name="car-sport" size={22} color={colors.primary} />
                <View style={{ flex: 1, minWidth: 180 }}>
                  <Text style={fs.bold}>
                    {l.plateNumber} · {l.userName}
                  </Text>
                  <Text style={fs.muted}>
                    เบิก {fmtDT(l.startedAt)} · ผ่านมา {duration(l.startedAt)} · {l.purpose}
                    {l.destination ? ` · ${l.destination}` : ""}
                  </Text>
                </View>
                <TouchableOpacity style={[fs.btn, fs.btnGhost, fs.small]} onPress={() => setView(l)}>
                  <Text style={fs.btnGhostText}>ดู</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[fs.btn, fs.small]} onPress={() => setReturning(l)}>
                  <Text style={fs.btnText}>คืนแทน</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <View style={fs.card}>
            <Text style={fs.section}>กิโลเมตรที่ใช้ แยกรายคัน</Text>
            {data.perVehicle.length === 0 ? <EmptyState icon="car-outline" text="ยังไม่มีรถในระบบ" /> : null}
            {data.perVehicle.map((v) => (
              <View key={v.id} style={fs.item}>
                <View style={fs.row}>
                  <Text style={fs.bold}>{v.plateNumber}</Text>
                  {v.name ? <Text style={fs.muted}>{v.name}</Text> : null}
                  <Tag tone={vehicleTone(v.status)}>{v.statusLabel}</Tag>
                  <View style={{ flex: 1 }} />
                  <Text style={fs.muted}>
                    {v.trips} เที่ยว · ไมล์ {fmtNum(v.currentMileage)}
                  </Text>
                </View>
                {v.activeBy ? (
                  <Text style={fs.muted}>
                    {v.activeBy} · {v.activeSince ? duration(v.activeSince) : ""}
                  </Text>
                ) : null}
                <View style={[fs.row, { flexWrap: "nowrap" }]}>
                  <Text style={[fs.bold, { minWidth: 64 }]}>{fmtNum(v.km)} กม.</Text>
                  <View style={fs.hbar}>
                    <View style={[fs.hbarFill, { width: `${(v.km / maxKm) * 100}%` }]} />
                  </View>
                </View>
              </View>
            ))}
          </View>

          <View style={fs.card}>
            <Text style={fs.section}>ระยะทาง 7 วันล่าสุด</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 130, paddingTop: 8 }}>
              {data.last7.map((d) => {
                const dow = DOW[new Date(`${d.date}T12:00:00Z`).getUTCDay()];
                return (
                  <TouchableOpacity
                    key={d.date}
                    style={{ flex: 1, alignItems: "center", gap: 4, justifyContent: "flex-end", height: "100%" }}
                    onPress={() => setDate(d.date)}
                    accessibilityLabel={`ดูวันที่ ${thaiDate(d.date)}`}
                  >
                    <Text style={[fs.muted, { fontSize: 11 }]}>{d.km ? fmtNum(d.km) : ""}</Text>
                    <View
                      style={{
                        width: "70%",
                        maxWidth: 36,
                        height: `${Math.max(3, (d.km / max7) * 70)}%`,
                        borderRadius: 6,
                        backgroundColor: d.date === data.date ? colors.navy : colors.sky200,
                      }}
                    />
                    <Text style={[fs.muted, { fontSize: 11 }, d.date === data.date && fs.bold]}>{dow}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </ScrollView>
      {switching ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 120, left: 0, right: 0, alignItems: "center" }}>
          <WasherIcon size={40} color={colors.primary} />
        </View>
      ) : null}
      <LogDetailModal log={view} onClose={() => setView(null)} />
      <ForceReturnModal
        log={returning}
        onClose={() => setReturning(null)}
        onDone={() => {
          setReturning(null);
          load(date);
        }}
      />
    </>
  );
}
