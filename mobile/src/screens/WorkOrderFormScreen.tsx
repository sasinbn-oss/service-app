/**
 * เปิดใบงานใหม่
 *
 * ใช้สองทาง — เปิดเปล่าจากปุ่ม "เพิ่มใบงาน" หรือถูกส่งมาจากกระดานพร้อมรหัสเคส
 * ถ้ามีรหัสเคสติดมา สาขากับเครื่องมาจากเคสอยู่แล้ว จึงไม่ต้องถามซ้ำ
 *
 * เปิดทีเดียวได้หลายเครื่องถ้าเป็นสาขาเดียวกัน แต่ได้ใบงานเครื่องละใบ ไม่ใช่ใบเดียว
 * ที่ถือหลายเครื่อง เพราะแต่ละเครื่องมีอะไหล่ของตัวเอง ปิดคนละเวลา และอาจถูก
 * จ่ายให้ช่างคนละคน ใบเดียวที่ถือสามเครื่องจะปิดไม่ได้จนกว่าจะเสร็จครบทั้งสาม
 */
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, apiErrorMessage } from "../api/client";
import { showAlert } from "../utils/alert";
import {
  MAX_ATTACHMENTS,
  PickedAttachment,
  pickImageAttachment,
  pickVideoAttachment,
  uploadAttachment,
} from "../utils/attachments";
import { HomeStackParamList } from "../navigation/types";
import { colors, radius, shadow, spacing } from "../theme";

type Props = NativeStackScreenProps<HomeStackParamList, "WorkOrderForm">;

interface Option {
  value: string;
  label: string;
  hint?: string;
}
interface BranchOption {
  id: number;
  code: string;
  name: string;
  region: string | null;
}
interface MachineOption {
  id: number;
  code: string;
  type: string;
  brand: string | null;
  model: string | null;
}

/** หนึ่งแถว = หนึ่งใบงานที่จะถูกเปิด */
interface MachineRow {
  key: string;
  code: string;
  model: string;
  symptom: string;
  files: PickedAttachment[];
}

let rowSeq = 0;
function blankRow(): MachineRow {
  rowSeq += 1;
  return { key: `row-${rowSeq}`, code: "", model: "", symptom: "", files: [] };
}

export default function WorkOrderFormScreen({ navigation, route }: Props) {
  const outageId = route.params?.outageId ?? null;
  const fromBoard = outageId !== null;

  const [priorities, setPriorities] = useState<Option[]>([]);
  const [jobTypes, setJobTypes] = useState<Option[]>([]);
  const [jobType, setJobType] = useState("CM");

  const [branchCode, setBranchCode] = useState(route.params?.branchCode ?? "");
  // เก็บชื่อสาขาไว้ด้วย ไม่ใช่แค่รหัส — คนจำสาขาจากชื่อ ไม่ได้จำจากรหัส
  // เห็นแต่ "C0006" แล้วไม่มีทางรู้ว่าเลือกถูกใบหรือเปล่าจนกว่าจะเปิดใบงานแล้ว
  const [branchName, setBranchName] = useState<string | null>(null);
  const [branchResults, setBranchResults] = useState<BranchOption[]>([]);
  const [branchTerm, setBranchTerm] = useState("");
  const [machineOptions, setMachineOptions] = useState<MachineOption[]>([]);
  const [title, setTitle] = useState(route.params?.presetTitle ?? "");
  const [priority, setPriority] = useState("NORMAL");

  /**
   * แถวเครื่อง — ทางที่เปิดจากกระดานมีแถวเดียวเสมอ และไม่มีช่องรหัสเครื่อง
   * เพราะเครื่องมาจากเคสอยู่แล้ว เหลือแค่อาการกับรูปที่ต้องกรอก
   */
  const [rows, setRows] = useState<MachineRow[]>([blankRow()]);

  const [branchRegion, setBranchRegion] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // วงเล็บไว้ ไม่งั้นต่อกับคำว่า "หัวหน้าภาค" แล้วกลายเป็น "หัวหน้าภาคภาคใต้"
  const regionHint = branchRegion ? ` (ภาค${branchRegion})` : "";

  useEffect(() => {
    api
      .get<{ priorities: Option[]; jobTypes: Option[] }>("/work-orders/options")
      .then((res) => {
        setPriorities(res.data.priorities);
        setJobTypes(res.data.jobTypes);
      })
      .catch(() => setError("โหลดตัวเลือกไม่สำเร็จ"));
  }, []);

  /**
   * เปิดจากกระดาน — รหัสสาขาติดมาแต่ชื่อไม่ได้ติดมาด้วย
   *
   * ตามชื่อมาให้ เพราะข้อความ "สาขามาจากเคสให้อัตโนมัติ" ไม่ได้บอกว่าสาขาไหน
   * คนที่กดเปิดใบงานจากกระดานสิบแถวรวดจะไม่รู้เลยว่ากำลังเปิดให้สาขาอะไร
   */
  useEffect(() => {
    const code = route.params?.branchCode;
    if (!code) return;
    api
      .get<BranchOption[]>("/branches", { params: { search: code } })
      .then((res) => {
        const match = res.data.find((b) => b.code === code);
        if (match) {
          setBranchName(match.name);
          setBranchRegion(match.region ?? null);
        }
      })
      .catch(() => undefined);
  }, [route.params?.branchCode]);

  // ค้นสาขาแบบหน่วงไว้ เหมือนตัวเลือกอะไหล่ ไม่งั้นพิมพ์ตัวเดียวยิงหลายรอบ
  useEffect(() => {
    const keyword = branchTerm.trim();
    if (!keyword || fromBoard) {
      setBranchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<BranchOption[]>("/branches", { params: { search: keyword } })
        .then((res) => setBranchResults(res.data.slice(0, 8)))
        .catch(() => setBranchResults([]));
    }, 350);
    return () => clearTimeout(timer);
  }, [branchTerm, fromBoard]);

  /**
   * ดึงเครื่องของสาขาทีเดียวตอนเลือกสาขา แล้วกรองในเครื่องต่อแถว
   *
   * สาขาหนึ่งมีเครื่องไม่กี่สิบตัว ดึงรอบเดียวถูกกว่ายิงค้นทุกครั้งที่พิมพ์
   * และทำให้บอกได้ว่าสาขานี้มีเครื่องอะไรบ้าง โดยไม่ต้องให้เดาเอง
   */
  useEffect(() => {
    if (fromBoard || !branchCode) {
      setMachineOptions([]);
      return;
    }
    api
      .get<MachineOption[]>(`/branches/${encodeURIComponent(branchCode)}/machines`)
      .then((res) => setMachineOptions(res.data))
      .catch(() => setMachineOptions([]));
  }, [branchCode, fromBoard]);

  function patchRow(key: string, patch: Partial<MachineRow>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  /**
   * เลือกเครื่องแล้วเติมรุ่นให้ ถ้าเครื่องนั้นเคยบันทึกรุ่นไว้
   *
   * ไม่ทับของที่คนกรอกไปแล้ว เพราะถ้ารุ่นในระบบผิดและเขากำลังแก้อยู่
   * การเติมทับคือการลบสิ่งที่เขาเพิ่งพิมพ์
   */
  function chooseMachine(row: MachineRow, machine: MachineOption) {
    patchRow(row.key, {
      code: machine.code,
      model: row.model.trim() ? row.model : machine.model ?? "",
    });
  }

  async function addFile(
    row: MachineRow,
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | null>
  ) {
    if (row.files.length >= MAX_ATTACHMENTS) {
      showAlert(`แนบได้ไม่เกิน ${MAX_ATTACHMENTS} ไฟล์ต่อเครื่อง`, "ลบไฟล์ที่ไม่ต้องการออกก่อน");
      return;
    }
    setBusy("กำลังเตรียมไฟล์");
    try {
      const file = await pick(setBusy);
      if (file) {
        setRows((current) =>
          current.map((r) => (r.key === row.key ? { ...r, files: [...r.files, file] } : r))
        );
      }
    } catch (e) {
      showAlert("เตรียมไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  /** ตรวจก่อนส่ง — บอกให้ชัดว่าแถวไหนขาดอะไร ไม่ใช่แค่ "กรอกไม่ครบ" */
  function validate(): string | null {
    if (!title.trim()) return "ต้องระบุเรื่องที่ให้ไปทำ";
    if (!fromBoard && !branchCode.trim()) return "ต้องเลือกสาขา";
    if (fromBoard) return null;

    const codes = rows.map((r) => r.code.trim());
    if (codes.some((c) => !c) && rows.length > 1) {
      return "ถ้าไม่ระบุเครื่อง จะเปิดได้ใบเดียวเท่านั้น — ลบแถวที่ว่างออก";
    }
    const duplicate = codes.find((c, i) => c && codes.indexOf(c) !== i);
    if (duplicate) return `เครื่อง ${duplicate} ถูกใส่ซ้ำ`;

    for (const [i, row] of rows.entries()) {
      if (row.code.trim() && !row.model.trim()) {
        return `เครื่องที่ ${i + 1} (${row.code.trim()}) ยังไม่ได้ใส่รุ่น`;
      }
    }
    return null;
  }

  async function submit() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // ส่งเฉพาะสิ่งที่ขั้นนี้รู้ อะไหล่ ช่าง และวันนัดเป็นของขั้นถัดไป
      const shared = { jobType, title: title.trim(), priority };
      const res = fromBoard
        ? await api.post(`/work-orders/from-outage/${outageId}`, {
            ...shared,
            symptom: rows[0].symptom.trim() || null,
          })
        : await api.post("/work-orders", {
            ...shared,
            branchCode: branchCode.trim(),
            machines: rows.map((r) => ({
              code: r.code.trim() || undefined,
              model: r.model.trim() || null,
              symptom: r.symptom.trim() || null,
            })),
          });

      // ทางกระดานได้ใบเดียวและไม่มี orders ติดมา ทำให้เป็นรูปแบบเดียวกันก่อนใช้
      const orders: { id: number; code: string }[] = res.data.orders ?? [
        { id: res.data.id, code: res.data.code },
      ];

      /**
       * ไฟล์ส่งตามหลังใบงาน ไม่ได้ส่งไปพร้อมกัน
       *
       * เพราะไฟล์ต้องผูกกับใบงาน และใบงานยังไม่มีเลขจนกว่าจะบันทึกเสร็จ
       * ผลคือถ้าส่งไฟล์ไม่ผ่าน ใบงานยังถูกเปิดไปแล้ว — ซึ่งถูกต้องกว่าการ
       * ทิ้งทั้งใบเพราะรูปใบเดียวส่งไม่ขึ้น คนกรอกจะได้ไม่ต้องพิมพ์ใหม่ทั้งหมด
       * บอกให้ชัดว่ากี่ไฟล์ที่ไม่ขึ้น แล้วให้ไปแนบซ้ำในใบงานได้
       */
      let failed = 0;
      const total = rows.reduce((sum, r) => sum + r.files.length, 0);
      let sent = 0;
      for (const [i, row] of rows.entries()) {
        const target = orders[i];
        if (!target) break;
        for (const file of row.files) {
          sent += 1;
          setBusy(`กำลังส่งไฟล์ ${sent}/${total}`);
          try {
            await uploadAttachment(target.id, file);
          } catch {
            failed += 1;
          }
        }
      }

      const listed = orders.map((o) => o.code).join(", ");
      showAlert(
        orders.length > 1 ? `เปิดใบงานแล้ว ${orders.length} ใบ` : "เปิดใบงานแล้ว",
        failed === 0
          ? listed
          : `${listed}\n\nแต่ส่งไฟล์ไม่สำเร็จ ${failed} ไฟล์ — แนบใหม่ได้ในใบงาน`
      );

      // เปิดหลายใบพร้อมกันแล้วเด้งเข้าใบใดใบหนึ่งจะเหมือนอีกสองใบหายไป
      // พากลับไปที่รายการแทน จะได้เห็นครบทุกใบที่เพิ่งเปิด
      if (orders.length > 1) navigation.replace("WorkOrderList");
      else navigation.replace("WorkOrderDetail", { id: orders[0].id });
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
      setBusy(null);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        {fromBoard ? (
          <View style={styles.fromBoard}>
            <Ionicons name="link-outline" size={16} color={colors.primary} />
            <Text style={styles.fromBoardText}>
              เปิดจากเคสบนกระดาน สาขาและเครื่องมาจากเคสให้อัตโนมัติ
              {branchCode ? `\n${branchCode}${branchName ? ` · ${branchName}` : ""}` : ""}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.label}>สาขา</Text>
            {branchCode ? (
              <View style={styles.chosen}>
                <View style={styles.chosenBody}>
                  <Text style={styles.chosenText}>{branchCode}</Text>
                  {branchName ? (
                    <Text style={styles.chosenName} numberOfLines={2}>
                      {branchName}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setBranchCode("");
                    setBranchName(null);
                    setBranchRegion(null);
                    setBranchTerm("");
                    setRows([blankRow()]);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={15} color={colors.textFaint} />
                  <TextInput
                    style={styles.searchInput}
                    value={branchTerm}
                    onChangeText={setBranchTerm}
                    placeholder="ค้นรหัสหรือชื่อสาขา"
                    placeholderTextColor={colors.textFaint}
                    accessibilityLabel="ค้นหาสาขา"
                  />
                </View>
                {branchResults.length > 0 ? (
                  <View style={styles.results}>
                    {branchResults.map((b) => (
                      <TouchableOpacity
                        key={b.id}
                        style={styles.result}
                        onPress={() => {
                          setBranchCode(b.code);
                          setBranchName(b.name);
                          setBranchRegion(b.region ?? null);
                          setBranchResults([]);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.resultCode}>{b.code}</Text>
                        <Text style={styles.resultName} numberOfLines={1}>
                          {b.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </>
            )}
          </>
        )}

        <Text style={styles.label}>เรื่องที่ให้ไปทำ</Text>
        <View style={styles.options}>
          {jobTypes.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.option, jobType === t.value && styles.optionOn]}
              onPress={() => setJobType(t.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionText, jobType === t.value && styles.optionTextOn]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.jobHint}>{jobTypes.find((t) => t.value === jobType)?.hint ?? ""}</Text>

        <Text style={styles.label}>หัวข้องาน</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="สรุปสั้นๆ ว่าให้ไปทำอะไร"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="หัวข้องาน"
        />

        {/*
          เครื่องกับอาการอยู่ด้วยกัน เพราะอาการเป็นของเครื่อง ไม่ใช่ของใบงาน
          เปิดสามเครื่องพร้อมกันแล้วใส่อาการเดียวกันทั้งสามคือข้อมูลที่ไม่จริง
          และไม่ช่วยหัวหน้าภาคที่ต้องระบุอะไหล่ให้แต่ละเครื่อง
        */}
        {rows.map((row, i) => (
          <MachineCard
            key={row.key}
            row={row}
            index={i}
            total={rows.length}
            fromBoard={fromBoard}
            machines={machineOptions}
            busy={busy}
            onChange={(patch) => patchRow(row.key, patch)}
            onChooseMachine={(m) => chooseMachine(row, m)}
            onRemove={() => setRows((current) => current.filter((r) => r.key !== row.key))}
            onAddFile={(pick) => addFile(row, pick)}
          />
        ))}

        {!fromBoard ? (
          <TouchableOpacity
            style={styles.addRow}
            onPress={() => setRows((current) => [...current, blankRow()])}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={17} color={colors.primary} />
            <Text style={styles.addRowText}>เพิ่มเครื่องในสาขาเดียวกัน</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.label}>ความเร่งด่วน</Text>
        <View style={styles.options}>
          {priorities.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[styles.option, priority === p.value && styles.optionOn]}
              onPress={() => setPriority(p.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionText, priority === p.value && styles.optionTextOn]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/*
          จบแค่นี้ — อะไหล่ ช่าง และวันนัด เป็นของขั้นถัดไปตามสายงาน
          ถ้าให้กรอกตรงนี้ด้วย คนเปิดใบงานจะต้องรู้เรื่องที่ยังไม่มีใครรู้
        */}
        <View style={styles.next}>
          <Ionicons name="arrow-forward-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.nextText}>
            {rows.length > 1 ? `จะได้ใบงาน ${rows.length} ใบ เครื่องละใบ — ` : ""}
            เปิดแล้วใบงานจะไปอยู่ที่หัวหน้าภาค{regionHint} เพื่อระบุอะไหล่ที่ต้องใช้
            จากนั้นแอดมินเช็คคลัง หัวหน้าภาคจ่ายงาน แล้วช่างนัดวันเข้า
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.submit, saving && styles.submitOff]}
          onPress={submit}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <>
              <ActivityIndicator color="#fff" />
              {busy ? <Text style={styles.submitText}>{busy}</Text> : null}
            </>
          ) : (
            <>
              <Ionicons name="clipboard-outline" size={18} color="#fff" />
              <Text style={styles.submitText}>
                {rows.length > 1 ? `เปิดใบงาน ${rows.length} ใบ` : "เปิดใบงาน"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

/**
 * เครื่องหนึ่งตัวกับอาการของมัน — เท่ากับใบงานหนึ่งใบที่จะถูกเปิด
 *
 * ทางที่เปิดจากกระดานไม่มีช่องรหัสเครื่องกับรุ่น เพราะเครื่องมาจากเคสแล้ว
 */
function MachineCard({
  row,
  index,
  total,
  fromBoard,
  machines,
  busy,
  onChange,
  onChooseMachine,
  onRemove,
  onAddFile,
}: {
  row: MachineRow;
  index: number;
  total: number;
  fromBoard: boolean;
  machines: MachineOption[];
  busy: string | null;
  onChange: (patch: Partial<MachineRow>) => void;
  onChooseMachine: (machine: MachineOption) => void;
  onRemove: () => void;
  onAddFile: (
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | null>
  ) => void;
}) {
  const typed = row.code.trim().toUpperCase();
  const exact = machines.some((m) => m.code.toUpperCase() === typed);
  // ขึ้นรายการให้เลือกเฉพาะตอนที่พิมพ์แล้วยังไม่ตรงกับเครื่องไหน
  // ถ้าตรงแล้วยังขึ้นอยู่ จะบังช่องรุ่นที่ต้องกรอกต่อ
  const suggestions = typed && !exact
    ? machines.filter((m) => m.code.toUpperCase().includes(typed)).slice(0, 8)
    : [];

  return (
    <View style={[styles.machineCard, fromBoard && styles.machineCardFlat]}>
      {!fromBoard ? (
        <View style={styles.machineHead}>
          <Text style={styles.machineTitle}>
            {total > 1 ? `เครื่องที่ ${index + 1}` : "เครื่อง"}
          </Text>
          <View style={{ flex: 1 }} />
          {total > 1 ? (
            <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {!fromBoard ? (
        <>
          <Text style={styles.subLabel}>หมายเลขเครื่อง</Text>
          <TextInput
            style={styles.input}
            value={row.code}
            onChangeText={(v) => onChange({ code: v })}
            placeholder={
              total > 1 ? "เช่น W3 หรือ D12" : "เช่น W3 หรือ D12 — เว้นว่างถ้าเป็นงานทั้งสาขา"
            }
            placeholderTextColor={colors.textFaint}
            autoCapitalize="characters"
            accessibilityLabel={`หมายเลขเครื่องที่ ${index + 1}`}
          />
          {suggestions.length > 0 ? (
            <View style={styles.results}>
              {suggestions.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={styles.result}
                  onPress={() => onChooseMachine(m)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.resultCode}>{m.code}</Text>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {[m.type === "WASHER" ? "เครื่องซัก" : "เครื่องอบ", m.brand, m.model]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          {!row.code.trim() && machines.length > 0 ? (
            <Text style={styles.machineHint}>สาขานี้มี {machines.length} เครื่อง — พิมพ์เพื่อค้น</Text>
          ) : null}

          <Text style={styles.subLabel}>รุ่นของเครื่อง</Text>
          <TextInput
            style={styles.input}
            value={row.model}
            onChangeText={(v) => onChange({ model: v })}
            placeholder={row.code.trim() ? "เช่น HC60 — ต้องใส่" : "ใส่เมื่อระบุหมายเลขเครื่อง"}
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={`รุ่นของเครื่องที่ ${index + 1}`}
          />
        </>
      ) : null}

      <Text style={fromBoard ? styles.label : styles.subLabel}>อาการที่พบ</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={row.symptom}
        onChangeText={(v) => onChange({ symptom: v })}
        placeholder="เช่น ประตูไม่ล็อก / บอร์ดควบคุมไหม้"
        placeholderTextColor={colors.textFaint}
        multiline
        numberOfLines={2}
        accessibilityLabel={`อาการที่พบของเครื่องที่ ${index + 1}`}
      />

      {/*
        รูปหน้างานแนบได้ตั้งแต่ตอนเปิด ไม่ต้องรอเปิดใบงานเสร็จแล้วค่อยเข้าไปแนบ
        เพราะคนที่เปิดใบงานมักยืนอยู่หน้าเครื่องพอดี ถ้าให้ไปแนบทีหลัง
        กว่าจะกลับมาก็ออกจากร้านแล้ว แล้วรูปนั้นก็ไม่เคยถูกแนบ

        ไฟล์ยังไม่ถูกส่งตอนนี้ รอจนใบงานถูกบันทึกและได้เลขก่อน
      */}
      <Text style={fromBoard ? styles.label : styles.subLabel}>รูป / วิดีโอหน้างาน (ไม่บังคับ)</Text>
      {row.files.length > 0 ? (
        <View style={styles.files}>
          {row.files.map((file, n) => (
            <View key={`${file.name}-${n}`} style={styles.file}>
              {file.thumbnailUri ? (
                <Image source={{ uri: file.thumbnailUri }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbBlank]}>
                  <Ionicons
                    name={file.kind === "VIDEO" ? "videocam-outline" : "image-outline"}
                    size={24}
                    color={colors.textFaint}
                  />
                </View>
              )}
              {file.kind === "VIDEO" ? (
                <View style={styles.playBadge}>
                  <Ionicons name="play" size={12} color="#fff" />
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.removeFile}
                onPress={() => onChange({ files: row.files.filter((_, k) => k !== n) })}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={13} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      {busy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.busyText}>{busy}…</Text>
        </View>
      ) : (
        <View style={styles.fileButtons}>
          {/* กล้องเฉพาะบนมือถือ — คนที่เปิดจากคอมพิวเตอร์คือแอดมินที่นั่งโต๊ะ */}
          {Platform.OS !== "web" ? (
            <TouchableOpacity
              style={styles.fileButton}
              onPress={() => onAddFile((stage) => pickImageAttachment(true, stage))}
              activeOpacity={0.8}
            >
              <Ionicons name="camera-outline" size={16} color={colors.primary} />
              <Text style={styles.fileButtonText}>ถ่ายรูป</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.fileButton}
            onPress={() => onAddFile((stage) => pickImageAttachment(false, stage))}
            activeOpacity={0.8}
          >
            <Ionicons name="images-outline" size={16} color={colors.primary} />
            <Text style={styles.fileButtonText}>เลือกรูป</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.fileButton}
            onPress={() => onAddFile(pickVideoAttachment)}
            activeOpacity={0.8}
          >
            <Ionicons name="videocam-outline" size={16} color={colors.primary} />
            <Text style={styles.fileButtonText}>วิดีโอ</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  machineCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.background,
  },
  machineCardFlat: {
    borderWidth: 0,
    padding: 0,
    backgroundColor: "transparent",
  },
  machineHead: { flexDirection: "row", alignItems: "center", marginBottom: spacing.xs },
  machineTitle: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  machineHint: { fontSize: 11, lineHeight: 19, color: colors.textFaint, marginTop: spacing.xs },
  subLabel: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.primary,
  },
  addRowText: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.primary },

  jobHint: { fontSize: 11, lineHeight: 19, color: colors.textFaint, marginTop: spacing.xs },
  next: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
  nextText: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.textMuted },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, ...shadow.card },
  fromBoard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  fromBoardText: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.primaryDark },
  label: {
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  multiline: { minHeight: 84, textAlignVertical: "top" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  results: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultCode: { fontSize: 13, lineHeight: 21, fontWeight: "700", color: colors.text },
  resultName: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 20, color: colors.textMuted },
  chosen: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chosenBody: { flex: 1, minWidth: 0 },
  chosenText: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.primaryDark },
  chosenName: { fontSize: 12, lineHeight: 20, color: colors.primaryDark },
  files: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  file: { position: "relative" },
  thumb: { width: 88, height: 88, borderRadius: radius.sm, backgroundColor: colors.background },
  thumbBlank: { alignItems: "center", justifyContent: "center" },
  playBadge: {
    position: "absolute",
    left: spacing.xs,
    bottom: spacing.xs,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: "rgba(15,23,42,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeFile: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  fileButtons: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  fileButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
  },
  fileButtonText: { fontSize: 13, lineHeight: 21, fontWeight: "600", color: colors.primary },
  busyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  busyText: { fontSize: 13, lineHeight: 21, color: colors.textMuted },
  options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  optionOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  optionText: { fontSize: 13, lineHeight: 21, color: colors.textMuted, fontWeight: "600" },
  optionTextOn: { color: colors.primaryDark },
  error: { fontSize: 13, lineHeight: 21, color: colors.danger, marginTop: spacing.lg },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
  },
  submitOff: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 15, lineHeight: 24, fontWeight: "700" },
});
