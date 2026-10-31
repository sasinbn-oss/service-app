/**
 * ข้อมูลป้ายรุ่น + รายการเช็คตามคู่มือ ของใบเคลมอะไหล่ในประกัน (เจ้าของงานขอ ต.ค. 69)
 *
 * ทำไม: ช่างคีย์ Serial/รุ่นผิดบ่อย ใบเคลมที่ข้อมูลเครื่องผิดคุยกับประกันไม่ได้ — แอปจึงอ่านจากป้ายด้วยกล้อง
 * (อ่านในมือถือ ไม่ใช่ AI) ทีละบรรทัดตามแบบป้ายของยี่ห้อ แล้วให้ช่างเทียบกับภาพที่ครอปไว้ก่อนยืนยัน
 *
 * ช่างหน้างาน "แค่เก็บข้อมูลและเช็คตามรายการ" — ระบบไม่ตัดสินว่ารับประกันหรือไม่ (ทีมถัดไปเอาไปคุยกับประกันเอง)
 * ข้อมูลไปที่ Admin Spare Part ในหน้าตรวจเคลมและเอกสารใบเคลม (PDF)
 *
 * รายการเช็คมาจากคู่มือ "Error in Field" ของ Alliance Laundry Systems (Speed Queen · Huebsch · Primus · UniMac · IPSO)
 * OASIS ไม่มีคู่มือ — มีแค่ข้อมูลป้าย + รูปอุปกรณ์ที่เสีย (หลักฐานเคลมเดิมบังคับอยู่แล้ว)
 *
 * แบบบรรทัดของป้ายส่งให้แอปเป็นข้อความ regex — แก้/เพิ่มยี่ห้อที่นี่ที่เดียว แอปไม่ได้เขียนซ้ำ
 */

/** บรรทัดบนป้ายที่สแกนทีละครั้ง — บรรทัดเดียวอาจได้หลายช่อง (OASIS พิมพ์สองคอลัมน์ในแถวเดียว) */
export interface PlateLine {
  id: string;
  /** บอกช่างว่าเล็งบรรทัดไหน */
  prompt: string;
  fields: {
    key: string;
    label: string;
    /** กลุ่มที่ 1 คือค่า · มีคำบนป้ายนำหน้าเสมอ กันไปอ่านบรรทัดอื่นแล้วได้เลขผิดช่อง */
    regex: string;
    /**
     * ช่องที่ปนตัวอักษรกับตัวเลข — OCR สับสน O↔0 S↔5 แบบผิดซ้ำเหมือนกันทุกครั้ง (HL055L อ่านเป็น HLOSSL
     * 6 ใน 9 ครั้ง) การอ่านตรงกันหลายครั้งจึงกันไม่ได้ · แอปเทียบกับรุ่นในทะเบียน และไม่รับเองโดยไม่ให้ช่างยืนยัน
     */
    model?: boolean;
    /** หน่วยที่เติมเอง — บนป้ายอ่านเพี้ยนบ่อย (Kw → "saad") */
    unit?: string;
  }[];
}

export interface PlateTemplate {
  family: "ALLIANCE" | "OASIS" | "OTHER";
  lines: PlateLine[];
}

/*
 * ช่องที่เก็บ = เท่าที่อ่านได้น่าเชื่อถือ (เจ้าของงาน: "เอาแค่ที่ระบบอ่านได้") — ทดลองกับรูปป้ายจริง ต.ค. 69:
 * ตัวเลขล้วน (Serial · No. of production · ขนาด · วันผลิต) อ่านได้ดี · บรรทัดไฟอ่านไม่ออกจึงไม่เก็บ
 * · รหัสรุ่นเต็มของ Huebsch อ่านได้เมื่อตัดภาพกว้างไปทางขวาของ MODEL (ocr.web.ts) แต่ตัวท้ายยังเพี้ยน (6 → E/S) ช่างต้องตรวจ
 * · หน่วย Kw/Hz อ่านเพี้ยนบ่อย จึงดึงแค่ตัวเลขแล้วเติมหน่วยเอง (unit)
 */
const ALLIANCE_PLATE: PlateTemplate = {
  family: "ALLIANCE",
  lines: [
    // รุ่นเต็มในกรอบข้าง MODEL (HL055L → HL055LWHPRXG6W0000) — เจ้าของงานขอ ต.ค. 69 ให้เก็บตัวเต็ม
    // ข้ามรุ่นสั้นเมื่อมีรหัสยาวตามมา · อ่านรหัสยาวไม่ได้ (รูปไม่ชัด/ตัดขอบ) ยังได้รุ่นสั้นแล้วติดธงให้ช่างเติม
    {
      id: "model",
      prompt: "บรรทัด MODEL",
      fields: [{ key: "model", label: "รุ่น", regex: "MODE[L1I]\\W{0,3}(?:[A-Z0-9]{4,10}\\W{1,6}(?=[A-Z0-9]{12}))?([A-Z0-9]{4,22})\\b", model: true }],
    },
    { id: "serial", prompt: "บรรทัด SERIAL", fields: [{ key: "serial", label: "Serial", regex: "SER[I1L]A[L1I]\\W{0,3}([0-9]{6,14})\\b" }] },
  ],
};

const OASIS_PLATE: PlateTemplate = {
  family: "OASIS",
  lines: [
    { id: "model", prompt: "บรรทัด Model", fields: [{ key: "model", label: "รุ่น", regex: "Mode[l1I]\\W{0,3}([A-Z0-9][A-Z0-9-]{3,14})", model: true }] },
    {
      id: "capacity",
      prompt: "บรรทัด Load capacity / Rated voltage",
      fields: [
        { key: "capacity", label: "ขนาด", regex: "capacity\\W{0,3}(\\d{1,3})\\s*K", unit: "Kg" },
        { key: "voltage", label: "แรงดันไฟ", regex: "voltage\\W{0,3}(\\d{3})\\s*V", unit: "V" },
      ],
    },
    { id: "rated", prompt: "บรรทัด Rated power", fields: [{ key: "ratedPower", label: "กำลังไฟ", regex: "power\\W{0,3}(\\d+\\.\\d+|\\d+)", unit: "Kw" }] },
    {
      id: "production",
      prompt: "บรรทัด No. of production / Date",
      fields: [
        { key: "productionNo", label: "No. of production", regex: "produc\\w*\\W{0,3}(\\d{4,10})\\b" },
        { key: "productionDate", label: "วันผลิต", regex: "(\\d{2}/\\d{4})" },
      ],
    },
  ],
};

const OTHER_PLATE: PlateTemplate = {
  family: "OTHER",
  lines: [
    { id: "model", prompt: "บรรทัดรุ่น (MODEL)", fields: [{ key: "model", label: "รุ่น", regex: "MODE[L1I]\\W{0,3}([A-Z0-9][A-Z0-9-]{3,14})", model: true }] },
    {
      id: "serial",
      prompt: "บรรทัด Serial / S/N",
      fields: [{ key: "serial", label: "Serial", regex: "(?:SER[I1L]A[L1I]|S/N|SN)\\W{0,4}([A-Z0-9]{5,20})\\b" }],
    },
  ],
};

const ALLIANCE_BRANDS = /speed\s*queen|huebsch|primus|unimac|ipso|alliance/i;

export function plateTemplateFor(make: string | null | undefined): PlateTemplate {
  if (make && /oasis/i.test(make)) return OASIS_PLATE;
  if (make && ALLIANCE_BRANDS.test(make)) return ALLIANCE_PLATE;
  return OTHER_PLATE;
}

/** Error ที่เจอบ่อยหน้างาน + สิ่งที่คู่มือบอกให้ดูก่อนเปลี่ยนอะไหล่ — ช่างติ๊กว่าเช็คแล้ว (ไม่บังคับครบ) */
export const ALLIANCE_ERRORS: { code: string; name: string; checks: string[] }[] = [
  { code: "E FL", name: "Fill Error — น้ำไม่เข้าเครื่อง", checks: ["น้ำเข้าเครื่องได้ปกติ", "Drain valve ไม่ค้าง ปิดสนิท"] },
  { code: "E nFLo", name: "No Water Flow — น้ำเข้าช้า", checks: ["ตะแกรง filter น้ำเข้าไม่ตัน", "สายไปเซ็นเซอร์แรงดันไม่รั่ว"] },
  { code: "E bELt", name: "Broken Belt — สายพาน", checks: ["สายพานไม่หลุด ไม่ขาด"] },
  {
    code: "E dL / E dL1 / E dL2",
    name: "Door Lock — ประตูล็อก/ปลดล็อก",
    checks: ["Solenoid ไม่ฝืด", "ประตูไม่ตก กลอนเข้าร่อง", "Limit switch ทำงาน", "ขั้วต่อสายไม่หลวม"],
  },
  { code: "E d 24", name: "I2T Over Current (Inverter over voltage · รุ่น 60 lb)", checks: ["ถังและมอเตอร์หมุนคล่อง", "ขดลวดมอเตอร์ L1-L2 · L2-L3 · L1-L3 ค่าเท่ากัน"] },
  {
    code: "E d Co",
    name: "Drive Board Communication",
    checks: ["เปิดดู Relay ไม่มีมด/คราบ (ที่เจอบ่อยที่สุด)", "ตัดไฟแล้วต่อใหม่ Error ยังขึ้น", "ขั้วต่อสายระหว่างบอร์ดไม่หลวม"],
  },
  { code: "Push Start", name: "ขึ้น Push Start หลังเปิดไฟ", checks: ["ขั้วต่อสายไม่หลวม"] },
  { code: "Door Close", name: "ประตูปิดไม่ติด", checks: ["Reed switch ไม่เบี้ยว", "ขั้วต่อสายไม่หลวม"] },
  { code: "CYCLES", name: "ขึ้น CYCLES หรือตัวเลข", checks: ["กล่องเหรียญปิดสนิท"] },
  { code: "เสียงดัง/สั่น", name: "Machine noise / Vibration", checks: ["น็อตยึดฐานแน่น", "ไม่มีแหวน/spacer รองใต้ฐาน"] },
  { code: "อบไม่ร้อน", name: "No heat (ไม่มี Error)", checks: ["Thermostat ไม่ขาด (วัดแล้ว)"] },
  { code: "ECoFAn", name: "Eco fan", checks: ["Contactor ทำงาน (วัดแล้ว)"] },
  { code: "ECodrv", name: "Eco drv", checks: ["ไม่มีมด/แมลงใน Contactor"] },
  { code: "EFLT 6", name: "Gas valve output short", checks: ["I/O board ไม่มีรอยช็อต (GSV1)"] },
  { code: "E io 06", name: "I/O Board 24VDC Under Voltage", checks: ["ไฟเข้าเครื่องปกติ", "สายคอนโทรลไม่ถูกหนีบ", "ไม่มีขุยผ้า/ฝุ่นบน I/O board"] },
  { code: "EnrL", name: "Stack dryer — thermistor", checks: ["ไม่มีขุยผ้าเกาะ thermistor"] },
  { code: "ร้อนเกิน", name: "Temperature too high", checks: ["ปรับ air shutter แล้ว"] },
  { code: "EAF1 / EAF2", name: "Air flow switch not close", checks: ["Air flow switch ปิดได้"] },
  { code: "E co", name: "Tumbler dryer", checks: ["ไม่มีฝุ่น/ขุยผ้าสะสม", "ขั้วต่อสายไม่หลวม"] },
  { code: "อื่น ๆ", name: "ไม่อยู่ในคู่มือ / ไม่มี Error", checks: [] },
];

/** รหัสในรายการที่หมายถึง "ไม่มี Error ขึ้น" — เก็บรหัสเดิมไว้ (ใบเคลมเก่าใช้ค่านี้) เปลี่ยนแค่คำที่แสดง */
export const NO_ERROR_CODE = "อื่น ๆ";

const THAI = /[\u0E00-\u0E7F]/;

/**
 * ชื่อ Error แยกเป็นส่วนไทย/ส่วนอังกฤษ — ชื่อในคู่มือเขียนปนกัน ("Door Lock — ประตูล็อก/ปลดล็อก" · "Eco fan" · "ประตูปิดไม่ติด")
 * แยกจากรูปแบบ "อังกฤษ — ไทย" เท่านั้น ไม่แปลเอง: ชื่อที่ไม่มีส่วนไทยก็แสดงตามคู่มือ ดีกว่าคำแปลที่ช่างไม่เคยเห็น
 */
export function errorNameParts(name: string): { th: string | null; en: string | null } {
  const i = name.indexOf(" — ");
  if (i > 0) {
    const en = name.slice(0, i).trim(), th = name.slice(i + 3).trim();
    if (THAI.test(th) && !THAI.test(en)) return { th, en };
  }
  return THAI.test(name) ? { th: name, en: null } : { th: null, en: name };
}

/**
 * ชื่อที่แสดงในรายการเลือก Error — ขึ้นต้นด้วยภาษาไทย อังกฤษอยู่ในวงเล็บ ("{code} — {ไทย} ({อังกฤษ})")
 * ช่างกับ Admin Spare Part อ่านไทยก่อน แต่ต้องเห็นคำอังกฤษให้ตรงกับคู่มือ Error in Field ที่ถือไปหน้างาน
 */
export function errorLabel(e: { code: string; name: string }): string {
  const { th, en } = errorNameParts(e.name);
  return th ? `${e.code} — ${th}${en ? ` (${en})` : ""}` : `${e.code} — ${en}`;
}

/**
 * บรรทัด "Error ที่เครื่องขึ้น" ของใบเคลม/หน้าตรวจ จาก fieldCheck ที่เก็บตอนปิดงาน — "{code} — {ชื่อไทย}" หรือ "ไม่มี Error ขึ้น"
 * null = ใบนี้ไม่มีข้อมูล Error (เครื่องที่ไม่ใช่ Alliance · ใบเก่าก่อนมีช่องนี้) → ไม่พิมพ์บรรทัดนี้ ไม่ใช่พิมพ์ว่า "ไม่มี"
 * ชื่ออ่านจากที่เก็บไว้ในแถว (ชื่อ ณ วันที่ส่ง) ไม่ใช่รายการปัจจุบัน — แก้คู่มือทีหลังต้องไม่เปลี่ยนใบที่ส่งไปแล้ว
 */
export function machineErrorText(fieldCheck: unknown): string | null {
  const fc = (fieldCheck ?? null) as { errorCode?: unknown; errorName?: unknown } | null;
  if (typeof fc?.errorCode !== "string" || !fc.errorCode) return null;
  if (fc.errorCode === NO_ERROR_CODE) return "ไม่มี Error ขึ้น";
  const name = typeof fc.errorName === "string" ? fc.errorName : "";
  const { th, en } = errorNameParts(name);
  const shown = th ?? en;
  return shown ? `${fc.errorCode} — ${shown}` : fc.errorCode;
}

/** รายการ Error ที่ส่งให้แอป — label (ไทยก่อน) กับ thai (ส่วนไทยของชื่อ หรือชื่อเต็มเมื่อไม่มีส่วนไทย) คิดที่นี่ที่เดียว */
const ALLIANCE_ERROR_LIST = ALLIANCE_ERRORS.map((e) => ({
  ...e,
  label: errorLabel(e),
  thai: errorNameParts(e.name).th ?? e.name,
}));

export function claimGuideFor(make: string | null | undefined) {
  const plate = plateTemplateFor(make);
  return {
    plate,
    // รายการเช็คมีเฉพาะยี่ห้อ Alliance — OASIS/อื่น ๆ ยังไม่มีคู่มือ
    // เคยมีเช็คลิสต์การติดตั้งฐานเครื่อง 5 ข้อ — เจ้าของงานให้เอาออก (ต.ค. 69) ใบเคลมเก่ายังเก็บคำตอบไว้ใน fieldCheck.install
    errors: plate.family === "ALLIANCE" ? ALLIANCE_ERROR_LIST : [],
  };
}
