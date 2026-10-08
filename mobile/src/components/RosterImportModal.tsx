/**
 * นำเข้ารายชื่อหัวหน้าภาคและช่างจากไฟล์ประกาศแบ่งทีม — หน้าตัวอย่างก่อนบันทึก
 *
 * จุดที่ต้องให้แอดมินดูคือ "ชื่อพื้นที่ในบันทึก → ทีมในทะเบียนสาขา" เพราะสองที่นี้เขียนไม่ตรงกัน
 * (บันทึกเขียน "กทม. ลาดพร้าว" ทะเบียนสาขาอาจเขียน "ลาดพร้าว") ช่างที่ทีมไม่ตรงจะไม่เห็นงานของทีม
 * จึงให้จับคู่ทีละชื่อพื้นที่ (ไม่ใช่ทีละคน) — บันทึก 77 คนมีแค่ราว 30 พื้นที่
 */
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import AppModal from "./AppModal";
import Dropdown from "./Dropdown";
import Spinner from "./Spinner";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import { PickedFile, pickFile } from "../utils/filePicker";
import { colors, radius, spacing } from "../theme";

interface Person {
  code: string;
  fullName: string;
  nick: string | null;
  name: string;
  role: "SUPERVISOR" | "EMPLOYEE";
  area: string | null;
  supervisorCode: string | null;
  group: string;
  existing: { name: string; role: string; team: string | null } | null;
  keepsRole: boolean;
}

interface Preview {
  fileName: string;
  teams: string[];
  problems: string[];
  areas: { area: string; count: number; suggestion: string | null }[];
  people: Person[];
}

const MIN_PASSWORD = 8;

export default function RosterImportModal({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [teamMap, setTeamMap] = useState<Record<string, string | null>>({});
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setFile(null);
    setPreview(null);
    setTeamMap({});
    setPassword("");
    setError(null);
    onClose();
  }

  async function choose() {
    const picked = await pickFile(".ods,.xlsx,application/vnd.oasis.opendocument.spreadsheet,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    if (!picked) return;
    setFile(picked);
    setPreview(null);
    setError(null);
    setChecking(true);
    try {
      const form = new FormData();
      form.append("file", picked.blob, picked.name);
      const res = await api.post<Preview>("/user-import/preview", form, {
        headers: { "Content-Type": "multipart/form-data" },
        loadingText: false,
      });
      setPreview(res.data);
      setTeamMap(Object.fromEntries(res.data.areas.map((a) => [a.area, a.suggestion])));
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setChecking(false);
    }
  }

  const teamOptions = useMemo(() => (preview?.teams ?? []).map((t) => ({ value: t, label: t })), [preview]);

  // ทีมที่หัวหน้าภาคแต่ละคนจะดูแล — คำนวณแบบเดียวกับเซิร์ฟเวอร์ จะได้เห็นผลทันทีที่เปลี่ยนคู่ทีม
  const supervised = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const p of preview?.people ?? []) {
      const t = p.area ? teamMap[p.area] : null;
      if (p.role !== "EMPLOYEE" || !p.supervisorCode || !t) continue;
      if (!m.has(p.supervisorCode)) m.set(p.supervisorCode, new Set());
      m.get(p.supervisorCode)!.add(t);
    }
    return m;
  }, [preview, teamMap]);

  if (!visible) return null;

  const people = preview?.people ?? [];
  const created = people.filter((p) => !p.existing).length;
  const unmatched = (preview?.areas ?? []).filter((a) => !teamMap[a.area]);
  const groups = [...new Set(people.map((p) => p.group))];

  async function commit() {
    if (!preview) return;
    if (created > 0 && password.length < MIN_PASSWORD) {
      return showAlert("ตั้งรหัสตั้งต้น", `รหัสตั้งต้นต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัว`);
    }
    setSaving(true);
    try {
      const res = await api.post<{ created: number; updated: number; withoutTeam: number }>(
        "/user-import/commit",
        {
          ...(created > 0 ? { password } : {}),
          teamMap,
          people: people.map((p) => ({
            code: p.code,
            fullName: p.fullName,
            nick: p.nick,
            role: p.role,
            area: p.area,
            supervisorCode: p.supervisorCode,
          })),
        },
        { loadingText: `กำลังบันทึก ${people.length} คน...` }
      );
      const r = res.data;
      showAlert(
        "นำเข้ารายชื่อแล้ว",
        `สร้างใหม่ ${r.created} คน · อัปเดต ${r.updated} คน` +
          (r.withoutTeam ? `\nช่าง ${r.withoutTeam} คนยังไม่มีทีม — เลือกทีมให้ที่การ์ดของแต่ละคน` : "")
      );
      close();
      onDone();
    } catch (e) {
      showAlert("นำเข้าไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      visible
      onClose={close}
      busy={saving}
      width={920}
      title="นำเข้ารายชื่อจากไฟล์"
      subtitle={preview ? preview.fileName : "ไฟล์ประกาศแบ่งทีม (.ods หรือ .xlsx) แบบบันทึกภายในของฝ่าย Service"}
      footer={
        preview ? (
          <View style={styles.footer}>
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={close} disabled={saving}>
              <Text style={styles.btnGhostText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={commit} disabled={saving} accessibilityLabel="ยืนยันนำเข้า">
              <Text style={styles.btnText}>
                ยืนยัน · สร้าง {created} · อัปเดต {people.length - created}
              </Text>
            </TouchableOpacity>
          </View>
        ) : undefined
      }
    >
      {!preview ? (
        <View style={{ gap: spacing.md }}>
          <Text style={styles.body}>
            ระบบอ่านหัวข้อ "หัวหน้าภาค" กับ "หัวหน้าภาค: ชื่อ" ในบันทึกเพื่อแยกหัวหน้าภาคกับช่าง และดูว่าช่างอยู่ใต้หัวหน้าภาคคนไหน
            ยังไม่บันทึกอะไรจนกว่าจะกดยืนยันในหน้าถัดไป
          </Text>
          <TouchableOpacity style={[styles.btn, { alignSelf: "flex-start" }]} onPress={choose} disabled={checking}>
            {checking ? <Spinner color="#fff" /> : <Ionicons name="document-attach-outline" size={18} color="#fff" />}
            <Text style={styles.btnText}>{checking ? "กำลังอ่านไฟล์..." : "เลือกไฟล์"}</Text>
          </TouchableOpacity>
          {file && error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : (
        <View style={{ gap: spacing.lg }}>
          <View style={styles.stats}>
            {[
              ["ทั้งหมด", people.length],
              ["หัวหน้าภาค", people.filter((p) => p.role === "SUPERVISOR").length],
              ["ช่าง", people.filter((p) => p.role === "EMPLOYEE").length],
              ["สร้างใหม่", created],
              ["มีบัญชีอยู่แล้ว (อัปเดต)", people.length - created],
            ].map(([l, n]) => (
              <View key={l} style={styles.stat}>
                <Text style={styles.statNum}>{n}</Text>
                <Text style={styles.muted}>{l}</Text>
              </View>
            ))}
          </View>

          {preview.problems.length ? (
            <View style={styles.warnBox}>
              {preview.problems.map((m) => (
                <Text key={m} style={styles.warnText}>• {m}</Text>
              ))}
            </View>
          ) : null}

          <View style={{ gap: spacing.sm }}>
            <Text style={styles.h}>1. จับคู่พื้นที่ในบันทึกกับทีมในทะเบียนสาขา</Text>
            <Text style={styles.muted}>
              ช่างเห็นใบงานตามทีม · ระบบเดาคู่ที่ชื่อใกล้กันให้แล้ว ·{" "}
              {unmatched.length ? `ยังไม่มีทีม ${unmatched.length} พื้นที่ — ไม่เลือกก็ได้ ไปเลือกทีละคนทีหลังได้` : "จับคู่ครบทุกพื้นที่"}
            </Text>
            {preview.teams.length === 0 ? (
              <Text style={styles.warnText}>ยังไม่มีทีมในทะเบียนสาขา — อัปโหลดทะเบียนสาขาก่อน ไม่งั้นช่างทุกคนจะยังไม่มีทีม</Text>
            ) : null}
            {preview.areas.map((a) => (
              <View key={a.area} style={styles.mapRow}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Text style={styles.body}>{a.area}</Text>
                  <Text style={styles.muted}>
                    {a.count} คน{a.suggestion && teamMap[a.area] === a.suggestion ? " · ระบบเดาให้" : ""}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Dropdown
                    value={teamMap[a.area] ?? null}
                    options={teamOptions}
                    onChange={(v) => setTeamMap((m) => ({ ...m, [a.area]: v }))}
                    placeholder="— ยังไม่ใส่ทีม —"
                    clearable
                    accessibilityLabel={`ทีมของ ${a.area}`}
                  />
                </View>
              </View>
            ))}
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={styles.h}>2. หัวหน้าภาคดูแลทีมไหน</Text>
            <Text style={styles.muted}>มาจากทีมของช่างที่อยู่ใต้หัวหน้าภาคคนนั้นในบันทึก — เปลี่ยนคู่ทีมข้างบนแล้วตรงนี้เปลี่ยนตาม</Text>
            {people
              .filter((p) => p.role === "SUPERVISOR")
              .map((s) => {
                const t = [...(supervised.get(s.code) ?? [])];
                return (
                  <View key={s.code} style={styles.mapRow}>
                    <Text style={[styles.body, { flex: 1, minWidth: 200 }]}>{s.name}</Text>
                    <Text style={[t.length ? styles.body : styles.warnText, { flex: 1, minWidth: 200 }]}>
                      {t.length ? t.join(" · ") : "ยังไม่มีทีม — จะไม่เห็นใบงานจนกว่าจะเลือกทีมให้"}
                    </Text>
                  </View>
                );
              })}
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={styles.h}>3. รหัสตั้งต้นของบัญชีใหม่</Text>
            <Text style={styles.muted}>
              ใช้รหัสเดียวกันทุกคนที่สร้างใหม่ ทุกคนต้องเปลี่ยนเองตอนเข้าครั้งแรก · บัญชีที่มีอยู่แล้วไม่ถูกเปลี่ยนรหัส
            </Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder={`อย่างน้อย ${MIN_PASSWORD} ตัว`}
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              accessibilityLabel="รหัสตั้งต้น"
            />
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={styles.h}>4. รายชื่อทั้งหมด</Text>
            {groups.map((g) => (
              <View key={g} style={{ gap: 2 }}>
                <Text style={styles.group}>
                  {g} · {people.filter((p) => p.group === g).length} คน
                </Text>
                {people
                  .filter((p) => p.group === g)
                  .map((p) => {
                    const team = p.role === "EMPLOYEE" && p.area ? teamMap[p.area] : null;
                    return (
                      <View key={p.code} style={styles.personRow}>
                        <Text style={styles.code}>{p.code}</Text>
                        <Text style={[styles.body, { flex: 2, minWidth: 180 }]}>{p.name}</Text>
                        <Text style={[styles.muted, { flex: 2, minWidth: 160 }]}>
                          {p.role === "SUPERVISOR" ? "หัวหน้าภาค" : team ? `ทีม ${team}` : `ยังไม่มีทีม (${p.area ?? "—"})`}
                        </Text>
                        <Text style={[p.existing ? styles.tagUpd : styles.tagNew]}>
                          {p.keepsRole ? "แอดมินอยู่แล้ว · แก้แค่ชื่อ" : p.existing ? "อัปเดต" : "ใหม่"}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            ))}
          </View>
        </View>
      )}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 21, color: colors.text },
  muted: { fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
  h: { fontSize: 15.5, fontWeight: "700", color: colors.text },
  error: { color: colors.dangerInk, fontSize: 13.5 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stat: { flexGrow: 1, flexBasis: 120, backgroundColor: colors.tile, borderRadius: radius.md, padding: 10 },
  statNum: { fontSize: 22, fontWeight: "800", color: colors.text },
  warnBox: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 10, gap: 2 },
  warnText: { fontSize: 13, lineHeight: 20, color: colors.warningInk },
  mapRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  group: { fontSize: 13, fontWeight: "700", color: colors.primaryInk, marginTop: spacing.sm },
  personRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
  code: { width: 64, fontSize: 13, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  tagNew: { fontSize: 12, fontWeight: "700", color: colors.successInk, backgroundColor: colors.successSoft, borderRadius: 999, paddingHorizontal: 8, overflow: "hidden" },
  tagUpd: { fontSize: 12, fontWeight: "700", color: colors.primaryInk, backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 8, overflow: "hidden" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
    maxWidth: 320,
  },
  footer: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end", flexWrap: "wrap" },
  btn: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnGhost: { backgroundColor: colors.sky50, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.navy, fontWeight: "700", fontSize: 14 },
});
