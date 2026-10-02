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
import { formatDate } from "./WorkOrderListScreen";
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
  openedAt: string | null;
  warrantyExpiresAt: string | null;
}
/** เครื่องที่ระบบรู้จักแล้วในสาขานี้ พร้อมรุ่นกับขนาดที่เคยกรอกไว้ */
interface KnownMachine {
  code: string;
  type: string;
  model: string | null;
  capacityKg: number | null;
}
/**
 * รุ่นเครื่อง — ของจริงมาจาก /work-orders/options ตอนเปิดฟอร์ม
 *
 * ที่เขียนไว้ตรงนี้เป็นแค่ค่าสำรองเผื่อโหลดตัวเลือกไม่ทัน จะได้ไม่เจอช่องรุ่นว่างเปล่า
 * เป็นตัวเลือกตายตัวเพราะต้องนับแยกได้ว่ารุ่นไหนเสียบ่อย และเวลาสั่งอะไหล่
 * ต้องรู้ว่ารุ่นอะไร ปล่อยให้พิมพ์เองจะได้ "Huebsch" "huebsch" ปนกัน
 */
const FALLBACK_MODELS = ["Oasis", "Oasis(TC)", "Huebsch", "Haier", "Maytag"];
const MODEL_OTHER = "อื่นๆ";

/**
 * ขนาดเครื่องเป็นกิโลกรัม — ค่าสำรองเผื่อโหลดตัวเลือกไม่ทัน เหมือนรายการรุ่น
 *
 * ต่างจากรุ่นคือพิมพ์เลขอื่นได้ ไม่ได้คุมให้เลือกเฉพาะในรายการ เพราะขนาดเป็น
 * ตัวเลขอยู่แล้ว เลข 17 ที่พิมพ์เองยังรวมยอดกับเลข 17 อื่นได้ ไม่เหมือนชื่อรุ่น
 * ที่พิมพ์เองแล้วได้ "Huebsch" กับ "huebsch" เป็นสองรุ่น
 */
const FALLBACK_CAPACITIES = [10, 13, 15, 18, 20, 25];
const CAPACITY_OTHER = "อื่นๆ";

/** รุ่นที่จะส่งไปเซิร์ฟเวอร์ — ที่พิมพ์เองก็เป็นรุ่นเหมือนกัน */
function resolvedModel(row: MachineRow): string {
  return (row.model === MODEL_OTHER ? row.modelOther : row.model).trim();
}

/**
 * ขนาดที่จะส่งไปเซิร์ฟเวอร์ เป็นตัวเลขหรือ null
 *
 * ส่งเลขล้วนไม่ส่ง "13 kg" เพราะหน่วยเป็น kg ทั้งระบบ เก็บหน่วยไปด้วยคือ
 * เปิดช่องให้มีทั้ง "13 kg" และ "13kg" ในฐานข้อมูลเดียวกัน
 */
function resolvedCapacity(row: MachineRow): number | null {
  const raw = row.capacity === CAPACITY_OTHER ? row.capacityOther : row.capacity;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** หนึ่งแถว = หนึ่งใบงานที่จะถูกเปิด */
interface MachineRow {
  key: string;
  code: string;
  /** รุ่นที่เลือกจากรายการ หรือ MODEL_OTHER เมื่อจะพิมพ์เอง */
  model: string;
  /** ชื่อรุ่นที่พิมพ์เอง ใช้เมื่อ model เป็น MODEL_OTHER */
  modelOther: string;
  /** ขนาดที่เลือกเป็นข้อความ เช่น "13" หรือ CAPACITY_OTHER เมื่อจะพิมพ์เอง */
  capacity: string;
  /** ขนาดที่พิมพ์เอง ใช้เมื่อ capacity เป็น CAPACITY_OTHER */
  capacityOther: string;
  symptom: string;
  files: PickedAttachment[];
  /** รูปป้ายรุ่นบนตัวเครื่อง ไม่บังคับ */
  nameplate: PickedAttachment | null;
}

/** W = เครื่องซัก · D = เครื่องอบ ตัวอักษรหน้าบอกชนิดเครื่องในตัว */
const MACHINE_CODE_PATTERN = /^[WD]\d{1,4}$/;

let rowSeq = 0;
function blankRow(): MachineRow {
  rowSeq += 1;
  return {
    key: `row-${rowSeq}`,
    code: "",
    model: "",
    modelOther: "",
    capacity: "",
    capacityOther: "",
    symptom: "",
    files: [],
    nameplate: null,
  };
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
  // วันเปิดร้านกับวันหมดประกันของสาขาที่เลือก ให้เห็นตั้งแต่ตอนเปิดใบงาน
  // ไม่ใช่ไปรู้ทีหลังตอนช่างถึงหน้างานแล้วว่าเครื่องยังอยู่ในประกันของผู้ขาย
  const [branchOpenedAt, setBranchOpenedAt] = useState<string | null>(null);
  const [branchWarrantyAt, setBranchWarrantyAt] = useState<string | null>(null);
  const [branchResults, setBranchResults] = useState<BranchOption[]>([]);
  const [branchTerm, setBranchTerm] = useState("");
  /**
   * รายละเอียดของประเภทงาน "อื่นๆ" — ไม่ใช่หัวข้องานที่ให้พิมพ์อิสระเหมือนเดิม
   *
   * สามประเภทแรกตั้งหัวข้อให้เองจากชื่อประเภท มีแต่ "อื่นๆ" ที่ชื่อประเภท
   * ไม่ได้บอกอะไรกับคนที่มาอ่านทีหลัง จึงต้องให้ระบุ
   */
  const [otherDetail, setOtherDetail] = useState(route.params?.presetTitle ?? "");
  const [priority, setPriority] = useState("NORMAL");

  /**
   * แถวเครื่อง — ทางที่เปิดจากกระดานมีแถวเดียวเสมอ และไม่มีช่องรหัสเครื่อง
   * เพราะเครื่องมาจากเคสอยู่แล้ว เหลือแค่อาการกับรูปที่ต้องกรอก
   */
  const [rows, setRows] = useState<MachineRow[]>([blankRow()]);

  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
  const [capacities, setCapacities] = useState<number[]>(FALLBACK_CAPACITIES);
  /** เครื่องของสาขานี้ที่ระบบรู้รุ่นกับขนาดไว้แล้ว ใช้เติมให้ตอนพิมพ์รหัสตรงกัน */
  const [knownMachines, setKnownMachines] = useState<KnownMachine[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [branchRegion, setBranchRegion] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // วงเล็บไว้ ไม่งั้นต่อกับคำว่า "หัวหน้าภาค" แล้วกลายเป็น "หัวหน้าภาคภาคใต้"
  const regionHint = branchRegion ? ` (ภาค${branchRegion})` : "";

  useEffect(() => {
    api
      .get<{
        priorities: Option[];
        jobTypes: Option[];
        machineModels?: string[];
        machineCapacities?: number[];
      }>("/work-orders/options")
      .then((res) => {
        setPriorities(res.data.priorities);
        setJobTypes(res.data.jobTypes);
        if (res.data.machineModels?.length) setModels(res.data.machineModels);
        if (res.data.machineCapacities?.length) setCapacities(res.data.machineCapacities);
      })
      .catch(() => setError("โหลดตัวเลือกไม่สำเร็จ"));
  }, []);

  /**
   * รุ่นกับขนาดของเครื่องในสาขานี้ที่เคยกรอกไว้
   *
   * ถามทีเดียวทั้งสาขาตอนรู้ว่าสาขาไหน ไม่ได้ถามตอนพิมพ์รหัสเครื่องทีละตัว —
   * พิมพ์ "W12" คือสามจังหวะ ซึ่งจะกลายเป็นสามคำขอโดยได้คำตอบเดียวกัน
   */
  useEffect(() => {
    const code = branchCode.trim();
    if (!code) {
      setKnownMachines([]);
      return;
    }
    let alive = true;
    api
      .get<KnownMachine[]>(`/branches/${encodeURIComponent(code)}/machines`)
      .then((res) => {
        if (alive) setKnownMachines(res.data);
      })
      .catch(() => setKnownMachines([]));
    return () => {
      alive = false;
    };
  }, [branchCode]);

  /**
   * เติมรุ่นกับขนาดของเครื่องที่ระบบรู้จักแล้ว
   *
   * ไม่ทับค่าที่คนกรอกไปแล้ว ด้วยเหตุผลเดียวกับผู้ติดต่อ — คนที่ตั้งใจเลือกเอง
   * รู้ดีกว่าใบงานเมื่อเดือนก่อน และคนที่ยืนอยู่หน้าเครื่องเห็นป้ายจริงอยู่
   *
   * ทางกระดานไม่มีช่องรหัสเครื่อง ใช้รหัสที่ติดมากับเคสแทน
   */
  useEffect(() => {
    if (knownMachines.length === 0) return;
    const byCode = new Map(knownMachines.map((m) => [m.code, m]));
    let changed = false;
    const next = rows.map((r) => {
      const code = (fromBoard ? route.params?.machineCode ?? "" : r.code).trim().toUpperCase();
      const known = code ? byCode.get(code) : undefined;
      if (!known) return r;
      const patch: Partial<MachineRow> = {};
      if (!r.model && known.model) {
        // รุ่นที่เคยกรอกอาจไม่อยู่ในรายการตัวเลือก (เคยพิมพ์เอง) ให้ไปอยู่ช่องพิมพ์เอง
        if (models.includes(known.model)) patch.model = known.model;
        else {
          patch.model = MODEL_OTHER;
          patch.modelOther = known.model;
        }
      }
      if (!r.capacity && typeof known.capacityKg === "number") {
        const asText = String(known.capacityKg);
        if (capacities.includes(known.capacityKg)) patch.capacity = asText;
        else {
          patch.capacity = CAPACITY_OTHER;
          patch.capacityOther = asText;
        }
      }
      if (Object.keys(patch).length === 0) return r;
      changed = true;
      return { ...r, ...patch };
    });
    // เขียนกลับเฉพาะตอนมีอะไรเปลี่ยนจริง — rows อยู่ใน deps ถ้าเขียนทุกรอบจะวนไม่จบ
    if (changed) setRows(next);
  }, [knownMachines, models, capacities, fromBoard, route.params?.machineCode, rows]);

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
          setBranchOpenedAt(match.openedAt ?? null);
          setBranchWarrantyAt(match.warrantyExpiresAt ?? null);
        }
      })
      .catch(() => undefined);
  }, [route.params?.branchCode]);

  /**
   * เติมผู้ติดต่อจากใบงานล่าสุดของสาขานี้
   *
   * ส่วนใหญ่เป็นคนเดิมเบอร์เดิม การให้พิมพ์ใหม่ทุกครั้งคือทางที่ทำให้ช่องนี้ว่าง
   * ไม่ทับค่าที่คนกรอกไปแล้ว — คนที่ตั้งใจพิมพ์เองย่อมรู้ดีกว่าใบงานเมื่อเดือนก่อน
   */
  useEffect(() => {
    const code = branchCode.trim();
    if (!code) return;
    let alive = true;
    api
      .get<{ contactName: string | null; contactPhone: string | null }>(
        `/branches/${encodeURIComponent(code)}/last-contact`
      )
      .then((res) => {
        if (!alive) return;
        setContactName((v) => v || res.data.contactName || "");
        setContactPhone((v) => v || res.data.contactPhone || "");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [branchCode]);

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

  function patchRow(key: string, patch: Partial<MachineRow>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
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

  /**
   * รูปป้ายรุ่นเก็บแยกจากรูปอาการ — ช่องเดียวต่อเครื่อง ใส่ใหม่ทับของเก่า
   *
   * ไม่บังคับให้ใส่ เพราะบางเครื่องป้ายลอกไปแล้วหรือถ่ายไม่ถึง แต่ถ้าใส่มา
   * จะช่วยให้คนสั่งอะไหล่รู้รุ่นจริงโดยไม่ต้องเชื่อรุ่นที่คนกรอกเลือกไว้
   */
  async function addNameplate(
    row: MachineRow,
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | null>
  ) {
    setBusy("กำลังเตรียมรูปป้ายรุ่น");
    try {
      const file = await pick(setBusy);
      if (file) {
        setRows((current) => current.map((r) => (r.key === row.key ? { ...r, nameplate: file } : r)));
      }
    } catch (e) {
      showAlert("เตรียมไฟล์ไม่สำเร็จ", apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  /** ตรวจก่อนส่ง — บอกให้ชัดว่าแถวไหนขาดอะไร ไม่ใช่แค่ "กรอกไม่ครบ" */
  function validate(): string | null {
    if (jobType === "OTHER" && !otherDetail.trim()) {
      return 'เลือกประเภทงาน "อื่นๆ" แล้วต้องระบุรายละเอียดด้วย';
    }
    if (!fromBoard && !branchCode.trim()) return "ต้องเลือกสาขา";
    if (fromBoard) return null;

    const codes = rows.map((r) => r.code.trim().toUpperCase());
    if (codes.some((c) => !c) && rows.length > 1) {
      return "ถ้าไม่ระบุเครื่อง จะเปิดได้ใบเดียวเท่านั้น — ลบแถวที่ว่างออก";
    }
    const duplicate = codes.find((c, i) => c && codes.indexOf(c) !== i);
    if (duplicate) return `เครื่อง ${duplicate} ถูกใส่ซ้ำ`;

    for (const [i, row] of rows.entries()) {
      const code = codes[i];
      if (!code) continue;
      if (!MACHINE_CODE_PATTERN.test(code)) {
        return `เครื่องที่ ${i + 1} ต้องเป็น W หรือ D ตามด้วยตัวเลข เช่น W1 หรือ D12`;
      }
      if (!resolvedModel(row)) return `เครื่องที่ ${i + 1} (${code}) ยังไม่ได้ใส่รุ่น`;
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
      // ส่ง title เฉพาะตอนเลือก "อื่นๆ" — ประเภทอื่นเซิร์ฟเวอร์ตั้งหัวข้อให้เอง
      const shared = {
        jobType,
        priority,
        ...(jobType === "OTHER" ? { title: otherDetail.trim() } : {}),
      };
      // ผู้ติดต่อส่งทั้งสองทาง — ฟอร์มมีช่องให้กรอกทั้งสองทางอยู่แล้ว
      // ทางกระดานเคยไม่ส่ง ค่าที่คนพิมพ์ลงไปจึงหายเงียบ ๆ ทั้งที่กดบันทึกสำเร็จ
      const contact = {
        contactName: contactName.trim() || null,
        contactPhone: contactPhone.trim() || null,
      };
      const res = fromBoard
        ? await api.post(`/work-orders/from-outage/${outageId}`, {
            ...shared,
            ...contact,
            symptom: rows[0].symptom.trim() || null,
            // รุ่นกับขนาดของเครื่องในเคส — เคสรู้แต่ว่าเครื่องไหน
            model: resolvedModel(rows[0]) || null,
            capacityKg: resolvedCapacity(rows[0]),
          })
        : await api.post("/work-orders", {
            ...shared,
            ...contact,
            branchCode: branchCode.trim(),
            machines: rows.map((r) => ({
              code: r.code.trim().toUpperCase() || undefined,
              model: resolvedModel(r) || null,
              capacityKg: resolvedCapacity(r),
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
      const total = rows.reduce((sum, r) => sum + r.files.length + (r.nameplate ? 1 : 0), 0);
      let sent = 0;
      for (const [i, row] of rows.entries()) {
        const target = orders[i];
        if (!target) break;
        // รูปป้ายรุ่นส่งก่อน เพราะเป็นรูปที่ช่วยคนสั่งอะไหล่มากที่สุด
        // ถ้าเน็ตหลุดกลางทางจะได้ไม่ใช่รูปที่หายไปเป็นอันแรก
        const queue: { file: PickedAttachment; role?: string }[] = [
          ...(row.nameplate ? [{ file: row.nameplate, role: "NAMEPLATE" }] : []),
          ...row.files.map((file) => ({ file })),
        ];
        for (const item of queue) {
          sent += 1;
          setBusy(`กำลังส่งไฟล์ ${sent}/${total}`);
          try {
            await uploadAttachment(target.id, item.file, item.role);
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
            {branchCode ? (
              <BranchFacts
                code={branchCode}
                openedAt={branchOpenedAt}
                warrantyExpiresAt={branchWarrantyAt}
              />
            ) : null}
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
                    setBranchOpenedAt(null);
                    setBranchWarrantyAt(null);
                    setBranchTerm("");
                    setRows([blankRow()]);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                </TouchableOpacity>
              </View>
            ) : null}
            {branchCode ? (
              <BranchFacts
                code={branchCode}
                openedAt={branchOpenedAt}
                warrantyExpiresAt={branchWarrantyAt}
              />
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
                          setBranchOpenedAt(b.openedAt ?? null);
                          setBranchWarrantyAt(b.warrantyExpiresAt ?? null);
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

        <Text style={styles.label}>ประเภทงาน</Text>
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

        {jobType === "OTHER" ? (
          <>
            <Text style={styles.label}>รายละเอียดงาน</Text>
            <TextInput
              style={styles.input}
              value={otherDetail}
              onChangeText={setOtherDetail}
              placeholder="งานอะไร เช่น ติดตั้งป้ายใหม่ / ย้ายเครื่องระหว่างสาขา"
              placeholderTextColor={colors.textFaint}
              accessibilityLabel="รายละเอียดงาน"
            />
          </>
        ) : null}

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
            busy={busy}
            models={models}
            capacities={capacities}
            onChange={(patch) => patchRow(row.key, patch)}
            onRemove={() => setRows((current) => current.filter((r) => r.key !== row.key))}
            onAddFile={(pick) => addFile(row, pick)}
            onAddNameplate={(pick) => addNameplate(row, pick)}
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

        {/*
          คนที่สาขาให้ติดต่อ — ช่างโทรหาใครก่อนไปหน้างาน

          เก็บที่ใบงานไม่ใช่ที่สาขา เพราะคนเฝ้าร้านเปลี่ยนตามกะและตามช่วง
          เบอร์ที่ใช้ได้เมื่อสามเดือนก่อนไม่ได้แปลว่าวันนี้โทรไปแล้วเจอคนเดิม
          ระบบเติมค่าจากใบงานล่าสุดของสาขานี้ให้ แก้ทับได้ถ้าเปลี่ยนคน
        */}
        <Text style={styles.label}>ผู้ติดต่อที่สาขา (ไม่บังคับ)</Text>
        <TextInput
          style={styles.input}
          value={contactName}
          onChangeText={setContactName}
          placeholder="ชื่อคนที่ติดต่อได้ เช่น คุณสมหญิง (ผู้จัดการร้าน)"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="ชื่อผู้ติดต่อที่สาขา"
        />
        <TextInput
          style={[styles.input, { marginTop: spacing.xs }]}
          value={contactPhone}
          onChangeText={setContactPhone}
          placeholder="เบอร์ติดต่อสาขา"
          placeholderTextColor={colors.textFaint}
          keyboardType="phone-pad"
          accessibilityLabel="เบอร์ติดต่อสาขา"
        />

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
 * วันเปิดร้านกับสถานะประกันของสาขาที่เลือก
 *
 * อยู่ในฟอร์มตั้งแต่ตอนเปิดใบงาน ไม่ใช่ไปโผล่ในใบงานทีหลัง เพราะประกันเป็นตัว
 * ตัดสินว่าจะส่งช่างของเราไปหรือให้ผู้ขายรับผิดชอบ ซึ่งควรรู้ตั้งแต่ตอนเปิด
 *
 * รหัสขึ้นต้นด้วย C คือสาขาบริษัท เครื่องเป็นของบริษัทเอง ไม่มีประกันให้พูดถึง
 */
function BranchFacts({
  code,
  openedAt,
  warrantyExpiresAt,
}: {
  code: string;
  openedAt: string | null;
  warrantyExpiresAt: string | null;
}) {
  const isCompany = code.trim().toUpperCase().startsWith("C");
  const expired = warrantyExpiresAt ? new Date(warrantyExpiresAt).getTime() < Date.now() : null;

  if (!openedAt && (isCompany || !warrantyExpiresAt)) {
    return isCompany ? (
      <Text style={styles.branchFact}>สาขาบริษัท — ไม่มีประกัน</Text>
    ) : (
      <Text style={styles.branchFact}>ยังไม่ได้บันทึกวันเปิดร้านและวันหมดประกัน</Text>
    );
  }

  return (
    <View style={styles.branchFacts}>
      {openedAt ? (
        <Text style={styles.branchFact}>เปิดร้าน {formatDate(openedAt)}</Text>
      ) : null}
      {isCompany ? (
        <Text style={styles.branchFact}>สาขาบริษัท — ไม่มีประกัน</Text>
      ) : warrantyExpiresAt ? (
        <Text style={[styles.branchFact, expired ? styles.warrantyOut : styles.warrantyIn]}>
          {expired ? "หมดประกันแล้ว" : "ยังอยู่ในประกัน"} · ถึง {formatDate(warrantyExpiresAt)}
        </Text>
      ) : (
        <Text style={styles.branchFact}>ยังไม่ได้บันทึกวันหมดประกัน</Text>
      )}
    </View>
  );
}

/**
 * ขนาดเครื่องเป็นกิโลกรัม
 *
 * เป็นปุ่มกดไม่ใช่ช่องพิมพ์ เพราะคนกรอกอยู่หน้างานถือมือถือข้างเดียว และขนาด
 * ที่มีจริงมีไม่กี่ค่า — แต่เปิดทาง "อื่นๆ" ไว้ให้พิมพ์เลขที่ไม่อยู่ในรายการ
 * ไม่ได้ปิดตายเหมือนรายการรุ่น ด้วยเหตุผลที่เขียนไว้ที่ FALLBACK_CAPACITIES
 *
 * กดค้ำไว้แล้วกดซ้ำคือเอาออก ไม่ต้องมีปุ่ม "ล้าง" อีกปุ่ม — ขนาดไม่บังคับ
 * และคนที่กดผิดแล้วหาทางยกเลิกไม่ได้จะปล่อยค่าผิดไว้แทนที่จะเว้นว่าง
 */
function CapacityPicker({
  row,
  index,
  capacities,
  onChange,
  big,
}: {
  row: MachineRow;
  index: number;
  capacities: number[];
  onChange: (patch: Partial<MachineRow>) => void;
  /** ใช้หัวข้อตัวใหญ่แบบทางกระดาน ซึ่งไม่มีการ์ดเครื่องครอบอยู่ */
  big?: boolean;
}) {
  const options = [...capacities.map(String), CAPACITY_OTHER];
  return (
    <>
      <Text style={big ? styles.label : styles.subLabel}>ขนาดเครื่อง (ไม่บังคับ)</Text>
      <View style={styles.options}>
        {options.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.option, row.capacity === c && styles.optionOn]}
            onPress={() =>
              onChange(
                row.capacity === c
                  ? { capacity: "", capacityOther: "" }
                  : { capacity: c, ...(c === CAPACITY_OTHER ? {} : { capacityOther: "" }) }
              )
            }
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, row.capacity === c && styles.optionTextOn]}>
              {c === CAPACITY_OTHER ? c : `${c} kg`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {row.capacity === CAPACITY_OTHER ? (
        <TextInput
          style={[styles.input, { marginTop: spacing.xs }]}
          value={row.capacityOther}
          onChangeText={(v) => onChange({ capacityOther: v.replace(/[^0-9]/g, "") })}
          placeholder="พิมพ์ขนาดเป็นกิโลกรัม เช่น 17"
          placeholderTextColor={colors.textFaint}
          keyboardType="number-pad"
          accessibilityLabel={`ขนาดเครื่องที่ ${index + 1}`}
        />
      ) : null}
    </>
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
  busy,
  models,
  capacities,
  onChange,
  onRemove,
  onAddFile,
  onAddNameplate,
}: {
  row: MachineRow;
  index: number;
  total: number;
  fromBoard: boolean;
  busy: string | null;
  models: string[];
  capacities: number[];
  onChange: (patch: Partial<MachineRow>) => void;
  onRemove: () => void;
  onAddFile: (
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | null>
  ) => void;
  onAddNameplate: (
    pick: (onStage: (label: string) => void) => Promise<PickedAttachment | null>
  ) => void;
}) {
  const code = row.code.trim().toUpperCase();
  // W = เครื่องซัก · D = เครื่องอบ ตัวอักษรหน้าบอกชนิดเครื่องในตัว
  const badCode = code.length > 0 && !/^[WD]\d{1,4}$/.test(code);

  return (
    <View style={[styles.machineCard, fromBoard && styles.machineCardFlat]}>
      {!fromBoard ? (
        <View style={styles.machineHead}>
          <Text style={styles.machineTitle}>
            {total > 1 ? `เครื่องที่ ${index + 1}` : "เครื่อง"}
          </Text>
          <View style={{ flex: 1 }} />
          {total > 1 ? (
            <TouchableOpacity
              onPress={onRemove}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`ลบเครื่องที่ ${index + 1}`}
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {!fromBoard ? (
        <>
          <Text style={styles.subLabel}>หมายเลขเครื่อง</Text>
          <TextInput
            style={[styles.input, badCode && styles.inputBad]}
            value={row.code}
            onChangeText={(v) => onChange({ code: v.toUpperCase() })}
            placeholder={
              total > 1 ? "เช่น W3 หรือ D12" : "เช่น W3 หรือ D12 — เว้นว่างถ้าเป็นงานทั้งสาขา"
            }
            placeholderTextColor={colors.textFaint}
            autoCapitalize="characters"
            accessibilityLabel={`หมายเลขเครื่องที่ ${index + 1}`}
          />
          <Text style={badCode ? styles.machineBad : styles.machineHint}>
            {badCode
              ? "ต้องเป็น W หรือ D ตามด้วยตัวเลข เช่น W3 หรือ D12"
              : "W = เครื่องซัก · D = เครื่องอบ"}
          </Text>

          <Text style={styles.subLabel}>รุ่นของเครื่อง</Text>
          <View style={styles.options}>
            {[...models, MODEL_OTHER].map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.option, row.model === m && styles.optionOn]}
                onPress={() => onChange({ model: m })}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionText, row.model === m && styles.optionTextOn]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {row.model === MODEL_OTHER ? (
            <TextInput
              style={[styles.input, { marginTop: spacing.xs }]}
              value={row.modelOther}
              onChangeText={(v) => onChange({ modelOther: v })}
              placeholder="พิมพ์ชื่อรุ่น"
              placeholderTextColor={colors.textFaint}
              accessibilityLabel={`ชื่อรุ่นของเครื่องที่ ${index + 1}`}
            />
          ) : null}

          <CapacityPicker row={row} index={index} capacities={capacities} onChange={onChange} />

          {/*
            รูปป้ายรุ่นบนตัวเครื่อง ไม่บังคับ — เป็นที่มาของรุ่นที่เลือกไว้
            เอาไว้ย้อนดูตอนสงสัยว่าใส่รุ่นถูกหรือเปล่า ซึ่งเกิดขึ้นตอนสั่งอะไหล่
            แล้วของมาไม่ตรง ไม่ใช่ตอนเปิดใบงาน
          */}
          <Text style={styles.subLabel}>รูปป้ายรุ่น (ไม่บังคับ)</Text>
          {row.nameplate ? (
            <View style={styles.files}>
              <View style={styles.file}>
                {row.nameplate.thumbnailUri ? (
                  <Image source={{ uri: row.nameplate.thumbnailUri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbBlank]}>
                    <Ionicons name="image-outline" size={24} color={colors.textFaint} />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.removeFile}
                  onPress={() => onChange({ nameplate: null })}
                  activeOpacity={0.7}
                  accessibilityLabel={`ลบรูปป้ายรุ่นของเครื่องที่ ${index + 1}`}
                >
                  <Ionicons name="close" size={13} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          ) : busy ? null : (
            <View style={styles.fileButtons}>
              {Platform.OS !== "web" ? (
                <TouchableOpacity
                  style={styles.fileButton}
                  onPress={() => onAddNameplate((stage) => pickImageAttachment(true, stage))}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera-outline" size={16} color={colors.primary} />
                  <Text style={styles.fileButtonText}>ถ่ายป้ายรุ่น</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.fileButton}
                onPress={() => onAddNameplate((stage) => pickImageAttachment(false, stage))}
                activeOpacity={0.8}
              >
                <Ionicons name="images-outline" size={16} color={colors.primary} />
                <Text style={styles.fileButtonText}>เลือกรูปป้ายรุ่น</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : null}

      {/*
        เปิดจากกระดาน — เครื่องมาจากเคสแล้ว แต่รุ่นกับขนาดเคสไม่รู้

        เคสมาจากไฟล์รายงานซึ่งบอกแต่ว่าเครื่องไหนดับ ไม่ได้บอกว่ารุ่นอะไร
        กี่กิโล คนที่ตอบได้คือคนที่ยืนอยู่หน้าเครื่องตอนเปิดใบงาน ซึ่งคือตอนนี้
        — เคยไม่มีช่องให้กรอกเลย ค่าพวกนี้จึงว่างตลอดในใบที่เปิดจากกระดาน

        ส่วนใหญ่จะขึ้นให้แล้วจากที่เคยกรอกไว้ครั้งก่อน เหลือแค่ดูว่าตรงไหม
      */}
      {fromBoard ? (
        <>
          <Text style={styles.label}>รุ่นของเครื่อง (ไม่บังคับ)</Text>
          <View style={styles.options}>
            {[...models, MODEL_OTHER].map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.option, row.model === m && styles.optionOn]}
                onPress={() => onChange({ model: m })}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionText, row.model === m && styles.optionTextOn]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {row.model === MODEL_OTHER ? (
            <TextInput
              style={[styles.input, { marginTop: spacing.xs }]}
              value={row.modelOther}
              onChangeText={(v) => onChange({ modelOther: v })}
              placeholder="พิมพ์ชื่อรุ่น"
              placeholderTextColor={colors.textFaint}
              accessibilityLabel="ชื่อรุ่นของเครื่อง"
            />
          ) : null}

          <CapacityPicker row={row} index={index} capacities={capacities} onChange={onChange} big />
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
  machineBad: { fontSize: 11, lineHeight: 19, color: colors.danger, marginTop: spacing.xs },
  inputBad: { borderColor: colors.danger },
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
  branchFacts: { gap: 2, marginTop: spacing.xs },
  branchFact: { fontSize: 12, lineHeight: 20, color: colors.textMuted },
  warrantyIn: { color: colors.success, fontWeight: "600" },
  warrantyOut: { color: colors.danger, fontWeight: "600" },
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
