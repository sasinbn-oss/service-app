/**
 * ประวัติการใช้รถของฉัน — ช่างเห็นเฉพาะของตัวเอง (เซิร์ฟเวอร์กรองให้)
 * แตะรายการเพื่อดูรูปตอนเบิก/คืน — ไว้ยืนยันกับแอดมินเวลามีคำถามเรื่องรอยบนรถ
 */
import React, { useCallback, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useCachedState } from "../utils/pageCache";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { api, apiErrorMessage } from "../api/client";
import { fs, Kpi, LogDetailModal, LogStatusTag } from "../components/FleetUI";
import { fmtDT, fmtNum, VehicleLogRow } from "../utils/vehicles";
import { colors, headingFont } from "../theme";

export default function VehicleHistoryScreen() {
  const [logs, setLogs, cached] = useCachedState<VehicleLogRow[]>("VehicleHistory:logs2", []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<VehicleLogRow | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api
        .get<VehicleLogRow[]>("/vehicle-logs")
        .then((res) => !cancelled && (setLogs(res.data), setError(null)))
        .catch((e) => !cancelled && setError(apiErrorMessage(e)))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [])
  );

  if (loading) {
    return (
      <View style={fs.center}>
        <Spinner color={colors.primary} />
      </View>
    );
  }
  if (error && logs.length === 0) {
    return (
      <View style={fs.center}>
        <Text style={fs.error}>{error}</Text>
      </View>
    );
  }

  const km = logs.reduce((s, l) => s + (l.distance ?? 0), 0);
  const cost = logs.reduce((s, l) => s + (l.cost ?? 0), 0);

  return (
    <>
      <FlatList
        style={fs.container}
        contentContainerStyle={fs.content}
        data={logs}
        keyExtractor={(l) => String(l.id)}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Text style={[fs.title, headingFont]}>ประวัติการใช้รถของฉัน</Text>
            <View style={fs.kpis}>
              <Kpi label="จำนวนครั้ง" value={fmtNum(logs.length)} unit="ครั้ง" tone="navy" />
              <Kpi label="ระยะทางรวม" value={fmtNum(km)} unit="กม." />
              <Kpi label="ค่าใช้จ่ายที่ลง" value={`฿${fmtNum(cost)}`} />
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="car-outline" text="ยังไม่มีประวัติการใช้รถ" />}
        renderItem={({ item: l }) => (
          <TouchableOpacity style={fs.card} onPress={() => setOpen(l)} activeOpacity={0.8} accessibilityLabel={`ดูรายการ ${l.plateNumber}`}>
            <View style={fs.row}>
              <Ionicons name="car-sport-outline" size={20} color={colors.primary} />
              <Text style={[fs.plate, headingFont]}>{l.plateNumber}</Text>
              <View style={{ flex: 1 }} />
              <LogStatusTag log={l} />
            </View>
            <Text style={fs.body}>
              {l.purpose}
              {l.destination ? ` · ${l.destination}` : ""}
            </Text>
            <View style={fs.row}>
              <Text style={fs.muted}>
                {fmtDT(l.startedAt)}
                {l.endedAt ? ` → ${fmtDT(l.endedAt)}` : ""}
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={fs.bold}>{l.distance === null ? `ไมล์ออก ${fmtNum(l.startMileage)}` : `${fmtNum(l.distance)} กม.`}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
      <LogDetailModal log={open} onClose={() => setOpen(null)} />
    </>
  );
}
