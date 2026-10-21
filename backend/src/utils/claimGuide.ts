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
 * ตัวเลขล้วน (Serial · No. of production · ขนาด · วันผลิต) อ่านได้ดี · รหัสรุ่นเต็มของ Huebsch กับบรรทัดไฟอ่านไม่ออก
 * จึงไม่เก็บ · หน่วย Kw/Hz อ่านเพี้ยนบ่อย จึงดึงแค่ตัวเลขแล้วเติมหน่วยเอง (unit)
 */
const ALLIANCE_PLATE: PlateTemplate = {
  family: "ALLIANCE",
  lines: [
    { id: "model", prompt: "บรรทัด MODEL", fields: [{ key: "model", label: "รุ่น", regex: "MODE[L1I]\\W{0,3}([A-Z0-9]{4,10})\\b", model: true }] },
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

/**
 * เรื่องการติดตั้งฐานเครื่องในคู่มือ — ช่างตอบ มี/ไม่มี ทุกข้อ (บังคับตอบ) แต่ระบบไม่ตัดสินผล
 * คำอธิบายในวงเล็บคัดจากคู่มือ ให้ทีมที่คุยกับประกันเห็นที่มา
 */
export const ALLIANCE_INSTALL_CHECKS: { key: string; label: string; note: string }[] = [
  { key: "groutOverFrame", label: "เทปูนทับฐานเครื่องด้านใน", note: "คู่มือ: Warranty Not Cover" },
  { key: "springWasher", label: "ใช้แหวนสปริงใต้น็อตยึดฐาน", note: "คู่มือ: Not Accept (ต้องเป็นแหวนแบน/น็อตหน้าแปลน)" },
  { key: "washerUnderFrame", label: "มีแหวนรองใต้ฐานเครื่อง", note: "คู่มือ: สาเหตุเสียงดัง/สั่น" },
  { key: "spacerUnderFrame", label: "มี spacer รองใต้ฐานเครื่อง", note: "คู่มือ: สาเหตุเสียงดัง/สั่น" },
  { key: "boltNotTight", label: "น็อตยึดฐานไม่แน่น", note: "คู่มือ: สาเหตุเสียงดัง/สั่น" },
];

export function claimGuideFor(make: string | null | undefined) {
  const plate = plateTemplateFor(make);
  return {
    plate,
    // รายการเช็คมีเฉพาะยี่ห้อ Alliance — OASIS/อื่น ๆ ยังไม่มีคู่มือ
    errors: plate.family === "ALLIANCE" ? ALLIANCE_ERRORS : [],
    installChecks: plate.family === "ALLIANCE" ? ALLIANCE_INSTALL_CHECKS : [],
  };
}
